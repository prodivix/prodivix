package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

func runtimeRollbackReceipt(t *testing.T, source json.RawMessage, at time.Time, acknowledged bool) json.RawMessage {
	t.Helper()
	var wire map[string]any
	if err := json.Unmarshal(source, &wire); err != nil {
		t.Fatal(err)
	}
	value := wire["value"].(map[string]any)
	value["producer"] = map[string]any{"kind": "service", "principalId": RuntimePrincipalID}
	value["startedAt"] = at.UTC().Format("2006-01-02T15:04:05.000Z")
	if acknowledged {
		value["completedAt"] = at.Add(time.Millisecond).UTC().Format("2006-01-02T15:04:05.000Z")
	}
	value["receiptDigest"] = runtimeTestDigest(t, value, "receiptDigest")
	result, err := canonicaljson.Bytes(wire)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeMutationReceipt(result); err != nil {
		t.Fatal(err)
	}
	return result
}

func runtimeRollbackRequestHarness(t *testing.T, h verificationPostgreSQLHarness, at time.Time) runtimeCommitHarness {
	t.Helper()
	vector := h.proposal
	vector.Facts.CommitStarted = runtimeRollbackReceipt(t, vector.Facts.RollbackStarted, at, false)
	vector.WorkspaceCommits.Forward.Request = vector.WorkspaceCommits.Reverse.Request
	return runtimeCommitHarness{database: h.databaseA, repository: h.repositoryA, vector: vector, lease: h.lease, now: at}
}

func TestRuntimeRollbackRequiresPreservedUnsatisfiedClosurePostgreSQLGate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	parent := prepareVerificationPostgreSQLHarness(t)
	h := runtimeRollbackRequestHarness(t, parent, mustAgentTime(t, "2026-08-01T09:00:00.200Z"))
	gateway := NewRuntimeGateway(h.repository, "unused")
	gateway.clock = func() time.Time { return h.now }
	request := runtimeCommitRequestForTest(t, h, h.now)
	gateway.commitWorkspace(request)
	if request.Writer.Status() != http.StatusForbidden {
		t.Fatalf("rollback without failed Closure status=%d", request.Writer.Status())
	}
	var revision int64
	if err := h.database.QueryRow(`SELECT workspace_rev FROM workspaces WHERE id='workspace.catalog'`).Scan(&revision); err != nil || revision != 43 {
		t.Fatalf("unverified rollback changed author revision=%d: %v", revision, err)
	}
}

func TestRuntimeRollbackExactCommitReplayAndRequiredG3PlanPostgreSQLGate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	parent := runtimeRepairFailureHarness(t)
	h := runtimeRollbackRequestHarness(t, parent.verificationPostgreSQLHarness, parent.Clock())
	gateway := NewRuntimeGateway(h.repository, "unused")
	gateway.clock = func() time.Time { return h.now }
	first := runtimeCommitRequestForTest(t, h, h.now)
	gateway.commitWorkspace(first)
	if first.Writer.Status() != http.StatusOK {
		t.Fatalf("authorized rollback Commit status=%d", first.Writer.Status())
	}
	var before int64
	if err := h.database.QueryRow(`SELECT op_seq FROM workspaces WHERE id='workspace.catalog'`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if _, err := h.database.Exec(`UPDATE agent_runs SET lease_expires_at=$1 WHERE workspace_id='workspace.catalog'`, h.now); err != nil {
		t.Fatal(err)
	}
	replay := runtimeCommitRequestForTest(t, h, h.now)
	gateway.commitWorkspace(replay)
	if replay.Writer.Status() != http.StatusOK {
		t.Fatalf("exact rollback ACK loss replay status=%d", replay.Writer.Status())
	}
	var after int64
	if err := h.database.QueryRow(`SELECT op_seq FROM workspaces WHERE id='workspace.catalog'`).Scan(&after); err != nil || after != before {
		t.Fatalf("rollback ACK loss replay changed author opSeq %d→%d: %v", before, after, err)
	}
	if _, err := h.database.Exec(`UPDATE agent_runs SET lease_expires_at=$1 WHERE workspace_id='workspace.catalog'`, mustAgentTime(t, "2026-08-02T03:00:00.000Z")); err != nil {
		t.Fatal(err)
	}
	ackWire := runtimeRollbackReceipt(t, parent.proposal.Facts.RollbackAcknowledged, h.now, true)
	service := PrincipalAuthority{Kind: "service", PrincipalID: RuntimePrincipalID, ProjectID: parent.task.ProjectID, WorkspaceID: parent.task.WorkspaceID}
	clock := func() time.Time { return h.now.Add(3 * time.Millisecond) }
	if _, _, err := h.repository.RecordRuntimeWorkspaceMutation(context.Background(), service, RuntimeLeaseGuard{Authority: h.lease, Clock: clock}, ackWire); err != nil {
		t.Fatal(err)
	}
	ack, err := decodeMutationReceipt(ackWire)
	if err != nil {
		t.Fatal(err)
	}
	approved, _, err := g3.DecodeVerificationPlanWire(parent.Plan)
	if err != nil {
		t.Fatal(err)
	}
	revision, _ := integerMember(ack.TargetRevision, "workspaceRev")
	route, _ := integerMember(ack.TargetRevision, "routeRev")
	seq, _ := integerMember(ack.TargetRevision, "opSeq")
	approved.TargetRevision = revision
	approved.TargetPartitionRevisions.WorkspaceRev, approved.TargetPartitionRevisions.RouteRev, approved.TargetPartitionRevisions.OpSeq = revision, route, seq
	documents, _ := arrayMember(ack.TargetRevision, "documents")
	approved.TargetPartitionRevisions.DocumentRevisions = map[string]g3.DocumentRevision{}
	for _, entry := range documents {
		item := entry.(map[string]any)
		content, _ := integerMember(item, "contentRev")
		meta, _ := integerMember(item, "metaRev")
		approved.TargetPartitionRevisions.DocumentRevisions[stringMember(item, "documentId")] = g3.DocumentRevision{ContentRev: content, MetaRev: meta}
	}
	approved.ImpactDigest = runtimeTestDigest(t, map[string]any{"rollback": "new-impact"}, "unused")
	approved.PlanDigest = runtimeTestDigest(t, approved, "planDigest")
	planWire, err := canonicaljson.Bytes(struct {
		WireVersion int `json:"wireVersion"`
		g3.VerificationPlanGrant
	}{1, approved})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := g3.DecodeVerificationPlanWire(planWire); err != nil {
		t.Fatal(err)
	}
	input := RuntimeVerificationAuthorization{AgentRunID: parent.Authorization.AgentRunID, Lease: h.lease, Clock: clock,
		VerificationRunID: "verification.runtime.rollback", WorkspaceRevision: revision, PlanDigest: approved.PlanDigest, Surface: "preview", Kind: "create", PlanWire: planWire}
	wire, _, _ := runtimeVerificationSnapshot(t, parent.verificationPostgreSQLHarness, input.VerificationRunID)
	wire.WorkspaceRevision, wire.PlanDigest = revision, approved.PlanDigest
	wire.SnapshotDigest = runtimeTestDigest(t, wire.VerificationRunSnapshot, "snapshotDigest")
	source, _ := canonicaljson.Bytes(wire)
	authorize := runtimeVerificationCallback(parent.verificationPostgreSQLHarness, input)
	if _, _, err := g3.NewRepository(h.database).CreateVerificationRunWithAuthorization(context.Background(), "user.test", wire, source, authorize); err != nil {
		t.Fatalf("post-rollback exact G3 Plan rejected: %v", err)
	}
	var linkedReceipt string
	if err := h.database.QueryRow(`SELECT mutation_receipt_id FROM agent_runtime_verification_runs WHERE verification_run_id=$1`, wire.RunID).Scan(&linkedReceipt); err != nil || linkedReceipt != ack.ReceiptID {
		t.Fatalf("rollback verification linked wrong ACK %s: %v", linkedReceipt, err)
	}
	weakened := approved
	weakened.Cells = append([]g3.VerificationPlanCell(nil), approved.Cells...)
	weakened.Cells[0].Requirement = "optional"
	weakened.PlanDigest = runtimeTestDigest(t, weakened, "planDigest")
	weakWire, _ := canonicaljson.Bytes(struct {
		WireVersion int `json:"wireVersion"`
		g3.VerificationPlanGrant
	}{1, weakened})
	input.VerificationRunID, input.PlanDigest, input.PlanWire = "verification.runtime.rollback.weakened", weakened.PlanDigest, weakWire
	tx, err := h.database.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := h.repository.AuthorizeRuntimeVerification(context.Background(), tx, parent.task.WorkspaceID, input); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("weakened post-rollback G3 authorization err=%v", err)
	}
}
