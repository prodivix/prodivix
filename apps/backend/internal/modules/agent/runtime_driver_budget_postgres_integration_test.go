package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func seedRuntimeDriverArtifactCapacity(t *testing.T, h verificationPostgreSQLHarness, coordinates RuntimeDriverCoordinates, planWire json.RawMessage, promotionID string, size int64) {
	t.Helper()
	plan, _, err := g3.DecodeVerificationPlanWire(planWire)
	if err != nil {
		t.Fatal(err)
	}
	digest, _ := canonicaljson.Digest(promotionID)
	revision, _ := canonicaljson.Digest(plan.TargetPartitionRevisions)
	created := mustAgentTime(t, "2026-08-01T09:00:00.000Z")
	if _, err := h.databaseA.Exec(`INSERT INTO verification_attempt_grants(id,workspace_id,project_id,workspace_revision,partition_revisions_digest,policy_revision,policy_digest,policy_evaluation_instant,impact_digest,plan_digest,plan_json,plan_bytes,cell_id,check_id,check_kind,target_id,attempt_id,run_id,provider_id,producer_id,trust_ceiling,successful_retention_class,failed_retention_class,protect_release_evidence,maximum_closure_evidence_records,grant_digest,issued_by,issued_at,expires_at,created_at) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10::jsonb,$11,'cell.runtime.test','check.runtime.test','unit','target.runtime.test',$12,$13,'provider.runtime.test','prodivix.agent-runtime-g3','local-unattested','change','change',false,1,$14,'agent.runtime',$15,$16,$15)`, "grant."+promotionID, h.task.WorkspaceID, h.task.ProjectID, plan.TargetRevision, revision, plan.PolicyDigest, mustAgentTime(t, plan.PolicyEvaluationInstant), plan.ImpactDigest, plan.PlanDigest, string(planWire), planWire, "attempt."+promotionID, coordinates.VerificationRunID, digest, created, created.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	candidate, _ := canonicaljson.Bytes(map[string]any{"run": map[string]any{"runId": coordinates.VerificationRunID}})
	if _, err := h.databaseA.Exec(`INSERT INTO verification_promotions(id,workspace_id,project_id,candidate_id,candidate_digest,idempotency_key_hash,capability_hash,actor_id,state,requested_trust,retention_class,maximum_closure_evidence_records,evidence_id,evidence_created_at,candidate_json,candidate_bytes,attempt_grant_id,attempt_grant_digest,protect_release_evidence,failure_code,deadline,created_at,updated_at) VALUES($1,$2,$3,$1,$4,$5,$5,'user.test','failed','local-unattested','change',1,$6,$7,$8::jsonb,$9,$10,$4,false,'VER-5005',$11,$7,$7)`, promotionID, h.task.WorkspaceID, h.task.ProjectID, digest, strings.TrimPrefix(digest, "sha256-"), "evidence."+promotionID, created, string(candidate), candidate, "grant."+promotionID, created.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := h.databaseA.Exec(`INSERT INTO verification_promotion_artifacts(promotion_id,artifact_id,logical_path,kind,expected_digest,expected_size,expected_media_type) VALUES($1,'artifact.runtime.budget','budget.json','replay',$2,$3,'application/json')`, promotionID, digest, size); err != nil {
		t.Fatal(err)
	}
}

func TestRuntimeDriverCumulativeArtifactBudgetAcrossCellsAndRunsPostgreSQLGate(t *testing.T) {
	h, coordinates, input, plan := runtimeDriverHarness(t)
	ctx := context.Background()
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, plan); err != nil {
		t.Fatal(err)
	}
	seedRuntimeDriverArtifactCapacity(t, h, coordinates, plan, "promotion.runtime.first", 600000)
	callback := func(candidate g3.EvidenceCandidate) error {
		tx, err := h.databaseA.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		return h.repositoryA.runtimeDriverPromotionBudgetAuthorization(h.task.WorkspaceID, coordinates, h.lease, input.Clock, candidate)(ctx, tx)
	}
	if err := callback(g3.EvidenceCandidate{CandidateID: "candidate.new", Artifacts: []g3.CandidateArtifact{{ExpectedSize: 448576}}}); err != nil {
		t.Fatalf("exact remaining capacity rejected: %v", err)
	}
	if err := callback(g3.EvidenceCandidate{CandidateID: "candidate.new", Artifacts: []g3.CandidateArtifact{{ExpectedSize: 448577}}}); !errors.Is(err, ErrConflict) {
		t.Fatalf("new cell reset artifact budget: %v", err)
	}
	if err := callback(g3.EvidenceCandidate{CandidateID: "promotion.runtime.first", Artifacts: []g3.CandidateArtifact{{ExpectedSize: 600000}}}); err != nil {
		t.Fatalf("exact candidate retry counted twice: %v", err)
	}
	nextWire, nextSource, nextAuthorization := runtimeVerificationSnapshot(t, h, "verification.runtime.second-surface")
	if _, _, err := g3.NewRepository(h.databaseA).CreateVerificationRunWithAuthorization(ctx, "user.test", nextWire, nextSource, runtimeVerificationCallback(h, nextAuthorization)); err != nil {
		t.Fatal(err)
	}
	next := coordinates
	next.VerificationRunID = nextWire.RunID
	next.RequestDigest = runtimeTestDigest(t, map[string]any{"execution": nextWire.RunID}, "unused")
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, next, h.lease, input.Clock, plan); err != nil {
		t.Fatal(err)
	}
	seedRuntimeDriverArtifactCapacity(t, h, next, plan, "promotion.runtime.second", 500000)
	tx, err := h.databaseA.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, h.lease, input.Clock, false)(ctx, tx); !errors.Is(err, ErrConflict) {
		t.Fatalf("second VerificationRun reset cumulative capacity: %v", err)
	}
	if err := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, h.lease, input.Clock, true)(ctx, tx); err != nil {
		t.Fatalf("exhausted budget blocked required cleanup: %v", err)
	}
}

func TestRuntimeDriverWholeRunTimeAndAttemptGrantDeadlinePostgreSQLGate(t *testing.T) {
	h, coordinates, input, plan := runtimeDriverHarness(t)
	ctx := context.Background()
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, plan); err != nil {
		t.Fatal(err)
	}
	tx, err := h.databaseA.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := h.repositoryA.runtimeDriverAttemptBudgetAuthorization(h.task.WorkspaceID, coordinates, h.lease, input.Clock, mustAgentTime(t, "2026-08-01T09:30:01.001Z"))(ctx, tx); !errors.Is(err, ErrConflict) {
		t.Fatalf("grant outlived parent Task: %v", err)
	}
	exhausted := func() time.Time { return mustAgentTime(t, "2026-08-01T09:30:01.000Z") }
	if err := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, h.lease, exhausted, false)(ctx, tx); !errors.Is(err, ErrConflict) {
		t.Fatalf("later cell reset whole Run time: %v", err)
	}
	if err := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, h.lease, exhausted, true)(ctx, tx); err != nil {
		t.Fatalf("time exhaustion blocked resource cleanup: %v", err)
	}
	calls := 0
	late := func() time.Time {
		calls++
		if calls == 1 {
			return input.Clock()
		}
		return exhausted()
	}
	if err := h.repositoryA.authorizeRuntimeDriverBudgetTx(ctx, tx, h.task.WorkspaceID, coordinates, late, 0); !errors.Is(err, ErrConflict) {
		t.Fatalf("time expired during metadata read admitted effect: %v", err)
	}
}

func TestRuntimeDriverShortRemainingTaskAttemptGrantPostgreSQLGate(t *testing.T) {
	h, coordinates, input, plan := runtimeDriverHarness(t)
	ctx := context.Background()
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, plan); err != nil {
		t.Fatal(err)
	}
	deadline := mustAgentTime(t, "2026-08-01T09:30:01.000Z")
	for _, remaining := range []time.Duration{30 * time.Second, time.Minute} {
		clock := func() time.Time { return deadline.Add(-remaining) }
		actual, err := h.repositoryA.runtimeDriverAttemptExpiry(ctx, h.task.WorkspaceID, coordinates, h.lease, clock, clock().Add(5*time.Minute))
		if err != nil || !actual.Equal(deadline) {
			t.Fatalf("remaining Task time=%v narrowed expiry=%v err=%v", remaining, actual, err)
		}
		tx, err := h.databaseA.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := h.repositoryA.runtimeDriverAttemptBudgetAuthorization(h.task.WorkspaceID, coordinates, h.lease, clock, actual)(ctx, tx); err != nil {
			t.Fatalf("short Task grant denied by actual write authority: %v", err)
		}
		_ = tx.Rollback()
		shorter := clock().Add(10 * time.Second)
		actual, err = h.repositoryA.runtimeDriverAttemptExpiry(ctx, h.task.WorkspaceID, coordinates, h.lease, clock, shorter)
		if err != nil || !actual.Equal(shorter) {
			t.Fatalf("server widened caller expiry=%v err=%v", actual, err)
		}
	}
	if _, err := h.repositoryA.runtimeDriverAttemptExpiry(ctx, h.task.WorkspaceID, coordinates, h.lease, func() time.Time { return deadline }, deadline.Add(5*time.Minute)); !errors.Is(err, ErrConflict) {
		t.Fatalf("expired Task received new attempt grant: %v", err)
	}
}
