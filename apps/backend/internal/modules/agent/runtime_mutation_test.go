package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type runtimeCommitHarness struct {
	database   *sql.DB
	repository *Repository
	vector     proposalRepositoryVector
	lease      RunLeaseAuthority
	now        time.Time
}

func prepareRuntimeCommit(t *testing.T) runtimeCommitHarness {
	t.Helper()
	database, _ := openAgentPostgreSQL(t)
	seedAgentWorkspace(t, database)
	repository := NewRepository(database)
	vector := readProposalRepositoryVector(t)
	fact, err := decodeProposalEnvelope(vector.Facts.CommitStarted, "workspace-mutation-receipt")
	if err != nil {
		t.Fatal(err)
	}
	fact.Value["producer"] = map[string]any{"kind": "service", "principalId": RuntimePrincipalID}
	delete(fact.Value, "receiptDigest")
	digest, err := canonicaljson.Digest(fact.Value)
	if err != nil {
		t.Fatal(err)
	}
	fact.Value["receiptDigest"] = digest
	vector.Facts.CommitStarted, err = canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "workspace-mutation-receipt", "value": fact.Value})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", ProjectID: "project.catalog", WorkspaceID: "workspace.catalog"}
	service := PrincipalAuthority{Kind: "service", PrincipalID: RuntimePrincipalID, ProjectID: user.ProjectID, WorkspaceID: user.WorkspaceID}
	task, _, err := repository.CreateTask(ctx, user, vector.ControlFacts.Task)
	if err != nil {
		t.Fatal(err)
	}
	initial := vector.ControlFacts.Sequence[0]
	run, _, err := repository.CreateRun(ctx, task.WorkspaceID, initial.Run, initial.Event)
	if err != nil {
		t.Fatal(err)
	}
	lease, _, err := repository.ClaimRun(ctx, task.WorkspaceID, run.RunID, "lease.runtime.commit", "worker.runtime.commit", 0, mustAgentTime(t, "2026-08-01T08:30:01.100Z"), mustAgentTime(t, "2026-08-02T03:00:00.000Z"))
	if err != nil {
		t.Fatal(err)
	}
	authority := RunLeaseAuthority{LeaseID: lease.LeaseID, HolderID: lease.HolderID, Generation: lease.Generation}
	appendStep := func(index int) {
		step := vector.ControlFacts.Sequence[index]
		authority.ObservedAt = eventTimeFromVector(t, step.Event)
		next, _, err := repository.AppendTransition(ctx, task.WorkspaceID, authority, step.Run, step.Event)
		if err != nil {
			t.Fatal(err)
		}
		authority.Generation = next.Generation
	}
	appendStep(1)
	appendStep(2)
	if _, _, err := repository.StoreProposal(ctx, service, vector.Facts.Proposal); err != nil {
		t.Fatal(err)
	}
	if _, _, err := repository.StoreProposalPreview(ctx, service, vector.Facts.Planning, vector.Facts.Preview); err != nil {
		t.Fatal(err)
	}
	appendStep(3)
	if _, _, err := repository.DecideProposal(ctx, user, vector.Facts.Approval); err != nil {
		t.Fatal(err)
	}
	appendStep(4)
	receipt, err := decodeMutationReceipt(vector.Facts.CommitStarted)
	if err != nil {
		t.Fatal(err)
	}
	return runtimeCommitHarness{database: database, repository: repository, vector: vector, lease: authority, now: receipt.StartedAt.Add(time.Millisecond)}
}

func runtimeCommitRequestForTest(t *testing.T, h runtimeCommitHarness, now time.Time) *gin.Context {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"leaseId": h.lease.LeaseID, "holderId": h.lease.HolderID, "generation": h.lease.Generation, "observedAt": now.UTC().Format("2006-01-02T15:04:05.000Z"), "receipt": h.vector.Facts.CommitStarted, "request": h.vector.WorkspaceCommits.Forward.Request})
	if err != nil {
		t.Fatal(err)
	}
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(raw)))
	c.Params = gin.Params{{Key: "workspaceId", Value: "workspace.catalog"}, {Key: "runId", Value: mustRuntimeRunID(t, h.vector.Facts.CommitStarted)}}
	return c
}

func mustRuntimeRunID(t *testing.T, source []byte) string {
	t.Helper()
	fact, err := decodeMutationReceipt(source)
	if err != nil {
		t.Fatal(err)
	}
	return fact.RunID
}

func TestRuntimeCommitPostgreSQLExpiredLeaseDoesNotInsertStartedReceipt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := prepareRuntimeCommit(t)
	if _, err := h.database.Exec(`UPDATE agent_runs SET lease_expires_at=$1 WHERE workspace_id='workspace.catalog'`, h.now); err != nil {
		t.Fatal(err)
	}
	gateway := NewRuntimeGateway(h.repository, "unused")
	gateway.clock = func() time.Time { return h.now }
	c := runtimeCommitRequestForTest(t, h, h.now)
	gateway.commitWorkspace(c)
	if c.Writer.Status() != http.StatusForbidden {
		t.Fatalf("expired lease commit status=%d", c.Writer.Status())
	}
	var count int
	if err := h.database.QueryRow(`SELECT count(*) FROM agent_workspace_mutation_receipts`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("expired lease wrote receipts=%d err=%v", count, err)
	}
}

func TestRuntimeCommitPostgreSQLExactAckLossReplayWritesOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := prepareRuntimeCommit(t)
	gateway := NewRuntimeGateway(h.repository, "unused")
	gateway.clock = func() time.Time { return h.now }
	first := runtimeCommitRequestForTest(t, h, h.now)
	gateway.commitWorkspace(first)
	if first.Writer.Status() != http.StatusOK {
		t.Fatalf("first actual Commit status=%d", first.Writer.Status())
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
		t.Fatalf("stored ACK replay status=%d", replay.Writer.Status())
	}
	var after int64
	if err := h.database.QueryRow(`SELECT op_seq FROM workspaces WHERE id='workspace.catalog'`).Scan(&after); err != nil || after != before {
		t.Fatalf("ACK loss replay changed author opSeq %d→%d: %v", before, after, err)
	}
}

func TestRuntimeCommitPostgreSQLExpiredHumanApprovalLeavesWorkspaceUnchanged(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := prepareRuntimeCommit(t)
	approval, err := decodeApproval(h.vector.Facts.Approval)
	if err != nil {
		t.Fatal(err)
	}
	h.now = approval.ExpiresAt
	gateway := NewRuntimeGateway(h.repository, "unused")
	gateway.clock = func() time.Time { return h.now }
	c := runtimeCommitRequestForTest(t, h, h.now)
	gateway.commitWorkspace(c)
	if c.Writer.Status() != http.StatusForbidden {
		t.Fatalf("expired approval Commit status=%d", c.Writer.Status())
	}
	var revision int64
	if err := h.database.QueryRow(`SELECT workspace_rev FROM workspaces WHERE id='workspace.catalog'`).Scan(&revision); err != nil || revision != 42 {
		t.Fatalf("expired approval changed author revision=%d: %v", revision, err)
	}
}
