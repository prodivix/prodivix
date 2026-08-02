package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type verificationRepositoryVector struct {
	Format       string `json:"format"`
	Version      int    `json:"version"`
	ControlFacts struct {
		Terminal proposalRepositoryVectorStep `json:"terminal"`
	} `json:"controlFacts"`
	Facts struct {
		Binding             json.RawMessage `json:"binding"`
		Closure             json.RawMessage `json:"closure"`
		SatisfiedClosure    json.RawMessage `json:"satisfiedClosure"`
		RepairStarted       json.RawMessage `json:"repairStarted"`
		RepairProposalBound json.RawMessage `json:"repairProposalBound"`
		RepairBlocked       json.RawMessage `json:"repairBlocked"`
	} `json:"facts"`
}

func readVerificationRepositoryVector(t *testing.T) verificationRepositoryVector {
	t.Helper()
	source, err := os.ReadFile("../../platform/agentcontract/testdata/agent-verification-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector verificationRepositoryVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-verification-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent verification repository vector: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

type verificationPostgreSQLHarness struct {
	databaseA    *sql.DB
	databaseB    *sql.DB
	repositoryA  *Repository
	repositoryB  *Repository
	task         TaskRecord
	lease        RunLeaseAuthority
	service      PrincipalAuthority
	proposal     proposalRepositoryVector
	verification verificationRepositoryVector
}

func prepareVerificationPostgreSQLHarness(t *testing.T) verificationPostgreSQLHarness {
	t.Helper()
	databaseA, databaseB := openAgentPostgreSQL(t)
	seedAgentWorkspace(t, databaseA)
	repositoryA, repositoryB := NewRepository(databaseA), NewRepository(databaseB)
	proposal := readProposalRepositoryVector(t)
	verification := readVerificationRepositoryVector(t)
	ctx := context.Background()
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", ProjectID: "project.catalog", WorkspaceID: "workspace.catalog"}
	service := PrincipalAuthority{Kind: "service", PrincipalID: "agent.coordinator.g4-v5", ProjectID: user.ProjectID, WorkspaceID: user.WorkspaceID}
	task, replayed, err := repositoryA.CreateTask(ctx, user, proposal.ControlFacts.Task)
	if err != nil || replayed {
		t.Fatalf("create V6 Task = %#v replay=%v err=%v", task, replayed, err)
	}
	createdStep := proposal.ControlFacts.Sequence[0]
	created, replayed, err := repositoryA.CreateRun(ctx, task.WorkspaceID, createdStep.Run, createdStep.Event)
	if err != nil || replayed {
		t.Fatalf("create V6 Run = %#v replay=%v err=%v", created, replayed, err)
	}
	lease, replayed, err := repositoryA.ClaimRun(
		ctx, task.WorkspaceID, created.RunID, "lease.g4-v6.verification", "worker.g4-v6.verification", 0,
		mustAgentTime(t, "2026-08-01T08:30:01.100Z"), mustAgentTime(t, "2026-08-02T03:00:00.000Z"),
	)
	if err != nil || replayed {
		t.Fatalf("claim V6 Run = %#v replay=%v err=%v", lease, replayed, err)
	}
	leaseAuthority := RunLeaseAuthority{LeaseID: lease.LeaseID, HolderID: lease.HolderID, Generation: lease.Generation}
	appendStep := func(index int) RunRecord {
		step := proposal.ControlFacts.Sequence[index]
		leaseAuthority.ObservedAt = eventTimeFromVector(t, step.Event)
		next, replayed, err := repositoryA.AppendTransition(ctx, task.WorkspaceID, leaseAuthority, step.Run, step.Event)
		if err != nil || replayed {
			t.Fatalf("append V6 %s = %#v replay=%v err=%v", step.Name, next, replayed, err)
		}
		leaseAuthority.Generation = next.Generation
		return next
	}
	appendStep(1)
	appendStep(2)
	if _, _, err := repositoryA.StoreProposal(ctx, service, proposal.Facts.Proposal); err != nil {
		t.Fatal(err)
	}
	if _, _, err := repositoryA.StoreProposalPreview(ctx, service, proposal.Facts.Planning, proposal.Facts.Preview); err != nil {
		t.Fatal(err)
	}
	appendStep(3)
	if _, _, err := repositoryA.DecideProposal(ctx, user, proposal.Facts.Approval); err != nil {
		t.Fatal(err)
	}
	appendStep(4)
	if _, _, err := repositoryA.RecordWorkspaceMutation(ctx, service, proposal.Facts.CommitStarted); err != nil {
		t.Fatal(err)
	}
	forward := commitAgentProposalWorkspaceOperation(t, ctx, databaseA, user, proposal.WorkspaceCommits.Forward.Request, proposal.Facts.CommitStarted)
	assertAgentMutationDigest(t, forward, proposal.WorkspaceCommits.Forward.Mutation, proposal.Facts.CommitAcknowledged)
	if _, _, err := repositoryA.RecordWorkspaceMutation(ctx, service, proposal.Facts.CommitAcknowledged); err != nil {
		t.Fatal(err)
	}
	appendStep(5)
	return verificationPostgreSQLHarness{
		databaseA: databaseA, databaseB: databaseB, repositoryA: repositoryA, repositoryB: repositoryB,
		task: task, lease: leaseAuthority, service: service, proposal: proposal, verification: verification,
	}
}

func seedVerificationRunAndEvidence(
	t *testing.T,
	database *sql.DB,
	bindingBytes json.RawMessage,
	closureBytes json.RawMessage,
) {
	t.Helper()
	binding, err := decodeVerificationPlanBinding(bindingBytes)
	if err != nil {
		t.Fatal(err)
	}
	closure, err := decodeVerificationClosureReceipt(closureBytes)
	if err != nil {
		t.Fatal(err)
	}
	workspaceRevision, ok := integerMember(binding.TargetRevision, "workspaceRev")
	if !ok {
		t.Fatal("binding target revision is invalid")
	}
	createdAt := mustAgentTime(t, "2026-08-02T02:00:00.000Z")
	snapshotBase := map[string]any{
		"runId": binding.VerificationRunID, "workspaceId": "workspace.catalog",
		"workspaceRevision": workspaceRevision, "planDigest": binding.ActualPlanDigest,
		"surface": "preview", "scope": "required", "providerId": "verification.g4-v6.pg",
		"origin": "cli", "status": map[bool]string{true: "completed", false: "failed"}[closure.Verdict == "satisfied"],
		"cursor": 1, "createdAt": createdAt.Format("2006-01-02T15:04:05.000Z"),
		"updatedAt":       closure.EvaluatedAt.Format("2006-01-02T15:04:05.000Z"),
		"selectedCellIds": []any{"cell.g4-v6.pg"},
		"cells": []any{map[string]any{
			"cellId": "cell.g4-v6.pg", "attemptId": "attempt.g4-v6.pg", "status": map[bool]string{true: "passed", false: "failed"}[closure.Verdict == "satisfied"],
			"lastEventCursor": 1, "evidenceId": closure.EvidenceRefs[0].EvidenceID,
		}},
		"closureDigest": closure.ClosureDigest, "closureVerdict": closure.Verdict,
	}
	snapshotDigest, err := canonicaljson.Digest(snapshotBase)
	if err != nil {
		t.Fatal(err)
	}
	snapshotBase["snapshotDigest"] = snapshotDigest
	snapshotBytes, err := canonicaljson.Bytes(snapshotBase)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO verification_runs (
		workspace_id, id, actor_id, workspace_revision, plan_digest, surface, scope,
		provider_id, origin, status, cursor, snapshot_digest, snapshot_json, snapshot_bytes,
		created_at, updated_at
	) VALUES ($1, $2, $3, $4, $5, 'preview', 'required', $6, 'cli', $7, 1, $8, $9::jsonb, $10, $11, $12)
	ON CONFLICT (workspace_id, id) DO UPDATE SET
		status = EXCLUDED.status,
		cursor = EXCLUDED.cursor,
		snapshot_digest = EXCLUDED.snapshot_digest,
		snapshot_json = EXCLUDED.snapshot_json,
		snapshot_bytes = EXCLUDED.snapshot_bytes,
		updated_at = EXCLUDED.updated_at`,
		"workspace.catalog", binding.VerificationRunID, binding.ProducerID, workspaceRevision,
		binding.ActualPlanDigest, "verification.g4-v6.pg", snapshotBase["status"], snapshotDigest,
		string(snapshotBytes), snapshotBytes, createdAt, closure.EvaluatedAt,
	); err != nil {
		t.Fatalf("seed G3 VerificationRun: %v", err)
	}
	for index, ref := range closure.EvidenceRefs {
		manifest := map[string]any{"format": "prodivix.test-evidence", "id": ref.EvidenceID, "manifestDigest": ref.ManifestDigest}
		manifestBytes, err := canonicaljson.Bytes(manifest)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := database.Exec(`INSERT INTO verification_evidence (
			id, workspace_id, project_id, workspace_revision, policy_revision,
			plan_digest, impact_digest, cell_id, check_id, attempt_id, outcome,
			trust_class, retention_class, manifest_digest, manifest_json, manifest_bytes,
			created_by, created_at
		) VALUES ($1, 'workspace.catalog', 'project.catalog', $2, 1, $3, $4, $5, $6, $7, $8,
			'local-unattested', 'change', $9, $10::jsonb, $11, $12, $13)`,
			ref.EvidenceID, workspaceRevision, binding.ActualPlanDigest, binding.ImpactDigest,
			"cell.g4-v6.pg", "check.g4-v6.pg", fmtIdentity("attempt.g4-v6.pg."+ref.Outcome, index), ref.Outcome,
			ref.ManifestDigest, string(manifestBytes), manifestBytes, binding.ProducerID, closure.EvaluatedAt,
		); err != nil {
			t.Fatalf("seed promoted Verification Evidence: %v", err)
		}
	}
}

func fmtIdentity(prefix string, index int) string {
	if index == 0 {
		return prefix
	}
	return prefix + ".next"
}

func TestAgentVerificationSatisfiedClosurePostgreSQLGate(t *testing.T) {
	harness := prepareVerificationPostgreSQLHarness(t)
	ctx := context.Background()
	seedVerificationRunAndEvidence(t, harness.databaseA, harness.verification.Facts.Binding, harness.verification.Facts.SatisfiedClosure)
	binding, replayed, err := harness.repositoryA.StoreVerificationPlanBinding(ctx, harness.service, harness.verification.Facts.Binding)
	if err != nil || replayed {
		t.Fatalf("store V6 Plan binding = %#v replay=%v err=%v", binding, replayed, err)
	}
	harness.lease.ObservedAt = eventTimeFromVector(t, harness.verification.ControlFacts.Terminal.Event)
	if _, _, err := harness.repositoryA.AppendTransition(
		ctx, harness.task.WorkspaceID, harness.lease,
		harness.verification.ControlFacts.Terminal.Run, harness.verification.ControlFacts.Terminal.Event,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("terminal apply without durable Closure error = %v, want ErrConflict", err)
	}
	closure, replayed, err := harness.repositoryA.StoreVerificationClosureReceipt(ctx, harness.service, harness.verification.Facts.SatisfiedClosure)
	if err != nil || replayed || closure.Verdict != "satisfied" {
		t.Fatalf("store satisfied Closure = %#v replay=%v err=%v", closure, replayed, err)
	}
	replayedClosure, replayed, err := harness.repositoryB.StoreVerificationClosureReceipt(ctx, harness.service, harness.verification.Facts.SatisfiedClosure)
	if err != nil || !replayed || replayedClosure.ReceiptDigest != closure.ReceiptDigest {
		t.Fatalf("replay satisfied Closure = %#v replay=%v err=%v", replayedClosure, replayed, err)
	}
	terminal, replayed, err := harness.repositoryA.AppendTransition(
		ctx, harness.task.WorkspaceID, harness.lease,
		harness.verification.ControlFacts.Terminal.Run, harness.verification.ControlFacts.Terminal.Event,
	)
	if err != nil || replayed || terminal.Phase != "terminal" || terminal.Outcome != "succeeded" {
		t.Fatalf("terminal apply with V6 proof = %#v replay=%v err=%v", terminal, replayed, err)
	}
	if _, err := harness.databaseA.Exec(`UPDATE agent_verification_closure_receipts SET verdict = verdict`); err == nil {
		t.Fatal("immutable V6 Closure ledger accepted an UPDATE")
	}
}

func TestAgentVerificationRepairPostgreSQLGate(t *testing.T) {
	harness := prepareVerificationPostgreSQLHarness(t)
	ctx := context.Background()
	seedVerificationRunAndEvidence(t, harness.databaseA, harness.verification.Facts.Binding, harness.verification.Facts.Closure)
	if _, _, err := harness.repositoryA.StoreVerificationPlanBinding(ctx, harness.service, harness.verification.Facts.Binding); err != nil {
		t.Fatal(err)
	}
	if _, _, err := harness.repositoryA.StoreVerificationClosureReceipt(ctx, harness.service, harness.verification.Facts.Closure); err != nil {
		t.Fatal(err)
	}
	started, replayed, err := harness.repositoryA.StoreRepairRoundReceipt(ctx, harness.service, harness.verification.Facts.RepairStarted)
	if err != nil || replayed || started.State != "started" || started.Round != 1 {
		t.Fatalf("store repair started = %#v replay=%v err=%v", started, replayed, err)
	}
	replayedStarted, replayed, err := harness.repositoryB.StoreRepairRoundReceipt(ctx, harness.service, harness.verification.Facts.RepairStarted)
	if err != nil || !replayed || replayedStarted.ReceiptDigest != started.ReceiptDigest {
		t.Fatalf("replay repair started = %#v replay=%v err=%v", replayedStarted, replayed, err)
	}
	if _, _, err := harness.repositoryA.StoreRepairRoundReceipt(ctx, harness.service, harness.verification.Facts.RepairProposalBound); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unbacked repair proposal error = %v, want ErrNotFound", err)
	}
	seedVerificationRunAndEvidence(t, harness.databaseA, harness.verification.Facts.Binding, harness.verification.Facts.SatisfiedClosure)
	if _, _, err := harness.repositoryA.StoreVerificationClosureReceipt(ctx, harness.service, harness.verification.Facts.SatisfiedClosure); err != nil {
		t.Fatal(err)
	}
	harness.lease.ObservedAt = eventTimeFromVector(t, harness.verification.ControlFacts.Terminal.Event)
	if _, _, err := harness.repositoryA.AppendTransition(
		ctx, harness.task.WorkspaceID, harness.lease,
		harness.verification.ControlFacts.Terminal.Run, harness.verification.ControlFacts.Terminal.Event,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("rerun-to-green without proposal-bound repair error = %v, want ErrConflict", err)
	}
	blocked, replayed, err := harness.repositoryA.StoreRepairRoundReceipt(ctx, harness.service, harness.verification.Facts.RepairBlocked)
	if err != nil || replayed || blocked.State != "blocked" || blocked.Round != 2 {
		t.Fatalf("store exhausted repair = %#v replay=%v err=%v", blocked, replayed, err)
	}
	if _, err := harness.databaseA.Exec(`DELETE FROM agent_repair_round_receipts`); err == nil {
		t.Fatal("immutable V6 repair ledger accepted a DELETE")
	}
}
