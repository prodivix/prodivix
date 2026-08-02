package agent

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationRepositoryVector struct {
	Facts struct {
		Plan       json.RawMessage `json:"plan"`
		Attempt    json.RawMessage `json:"attempt"`
		Checkpoint json.RawMessage `json:"checkpoint"`
		Holdout    json.RawMessage `json:"holdout"`
	} `json:"facts"`
}

func readEvaluationRepositoryVector(t *testing.T) evaluationRepositoryVector {
	t.Helper()
	source, err := os.ReadFile(filepath.Join("..", "..", "platform", "agentcontract", "testdata", "agent-evaluation-vector.json"))
	if err != nil {
		t.Fatal(err)
	}
	var vector evaluationRepositoryVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	return vector
}

func evaluationBudgetFixtures(t *testing.T, modelInvocations int64) ([]byte, []byte) {
	t.Helper()
	amounts := []any{map[string]any{
		"unit": "text-token-input", "logicalAmount": "1", "billableAmount": "1", "confidence": "estimated",
	}}
	vectorDigest, err := canonicaljson.Digest(map[string]any{"amounts": amounts})
	if err != nil {
		t.Fatal(err)
	}
	demand := map[string]any{
		"usage":            map[string]any{"amounts": amounts, "vectorDigest": vectorDigest},
		"cost":             []any{map[string]any{"currency": "USD", "amount": "0.01", "confidence": "estimated"}},
		"modelInvocations": modelInvocations, "toolCalls": int64(0), "repairRounds": int64(0),
		"transactions": int64(0), "artifactBytes": int64(0), "elapsedMs": int64(1_000),
	}
	demandBytes, err := canonicaljson.Bytes(demand)
	if err != nil {
		t.Fatal(err)
	}
	settlementBase := map[string]any{
		"actual": demand, "charged": demand, "requiresReconciliation": false,
		"settledAt": "2026-08-02T03:20:00.000Z",
	}
	settlementDigest, err := canonicaljson.Digest(settlementBase)
	if err != nil {
		t.Fatal(err)
	}
	settlement := map[string]any{}
	for key, value := range settlementBase {
		settlement[key] = value
	}
	settlement["settlementDigest"] = settlementDigest
	settlementBytes, err := canonicaljson.Bytes(settlement)
	if err != nil {
		t.Fatal(err)
	}
	return demandBytes, settlementBytes
}

func evaluationAttemptOutsidePlan(t *testing.T, source json.RawMessage) []byte {
	t.Helper()
	var envelope map[string]any
	if err := json.Unmarshal(source, &envelope); err != nil {
		t.Fatal(err)
	}
	value := envelope["value"].(map[string]any)
	descriptor := value["descriptor"].(map[string]any)
	descriptor["contextTier"] = "representative"
	samplingBase := map[string]any{
		"planDigest": descriptor["planDigest"], "caseId": descriptor["caseId"],
		"targetId": descriptor["targetId"], "targetDigest": descriptor["targetDigest"],
		"riskClass": descriptor["riskClass"], "contextTier": descriptor["contextTier"],
		"repetitionIndex": descriptor["repetitionIndex"],
	}
	samplingDigest, err := canonicaljson.Digest(samplingBase)
	if err != nil {
		t.Fatal(err)
	}
	descriptor["samplingIdentityDigest"] = samplingDigest
	descriptor["attemptId"] = "evaluation-attempt:" + samplingDigest[len("sha256-"):]
	descriptorBase := map[string]any{}
	for key, entry := range descriptor {
		if key != "descriptorDigest" {
			descriptorBase[key] = entry
		}
	}
	descriptor["descriptorDigest"], err = canonicaljson.Digest(descriptorBase)
	if err != nil {
		t.Fatal(err)
	}
	attemptBase := map[string]any{}
	for key, entry := range value {
		if key != "attemptDigest" {
			attemptBase[key] = entry
		}
	}
	value["attemptDigest"], err = canonicaljson.Digest(attemptBase)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestAgentModelEvaluationPostgreSQLGate(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	repositoryA, repositoryB := NewRepository(databaseA), NewRepository(databaseB)
	vector := readEvaluationRepositoryVector(t)
	ctx := context.Background()
	authority := EvaluationAuthority{Kind: "service", PrincipalID: "evaluation.runner", NamespaceID: "evaluation.g4-v8"}

	if _, _, err := repositoryA.StoreEvaluationPlan(ctx, EvaluationAuthority{
		Kind: "user", PrincipalID: "user.test", NamespaceID: authority.NamespaceID,
	}, vector.Facts.Plan); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("user evaluation authority error = %v, want ErrUnauthorized", err)
	}
	plan, replayed, err := repositoryA.StoreEvaluationPlan(ctx, authority, vector.Facts.Plan)
	if err != nil || replayed {
		t.Fatalf("store evaluation plan = %#v replay=%v err=%v", plan, replayed, err)
	}
	replayedPlan, replayed, err := repositoryB.StoreEvaluationPlan(ctx, authority, vector.Facts.Plan)
	if err != nil || !replayed || replayedPlan.FactDigest != plan.FactDigest {
		t.Fatalf("replay evaluation plan = %#v replay=%v err=%v", replayedPlan, replayed, err)
	}
	demandBytes, settlementBytes := evaluationBudgetFixtures(t, 1)
	if _, _, err := repositoryA.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, "evaluation-reservation.expired", 0, demandBytes,
		mustAgentTime(t, "2026-08-09T00:00:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("expired evaluation budget reservation error = %v, want ErrConflict", err)
	}
	reservation, replayed, err := repositoryA.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, "evaluation-reservation.vector", 0, demandBytes,
		mustAgentTime(t, "2026-08-02T03:10:00.000Z"),
	)
	if err != nil || replayed || reservation.LedgerRevision != 1 {
		t.Fatalf("reserve evaluation budget = %#v replay=%v err=%v", reservation, replayed, err)
	}
	if _, replayed, err := repositoryB.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, reservation.ReservationID, 0, demandBytes,
		mustAgentTime(t, "2026-08-02T03:10:00.000Z"),
	); err != nil || !replayed {
		t.Fatalf("replay evaluation budget reservation replay=%v err=%v", replayed, err)
	}
	if _, _, err := repositoryB.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, "evaluation-reservation.stale", 0, demandBytes,
		mustAgentTime(t, "2026-08-02T03:11:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale evaluation budget reservation error = %v, want ErrConflict", err)
	}
	overBudget, _ := evaluationBudgetFixtures(t, 1_000_001)
	if _, _, err := repositoryB.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, "evaluation-reservation.over-budget", 1, overBudget,
		mustAgentTime(t, "2026-08-02T03:11:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("over-budget evaluation reservation error = %v, want ErrConflict", err)
	}
	settlement, replayed, err := repositoryA.SettleEvaluationBudget(
		ctx, authority, plan.FactDigest, reservation.ReservationID, 1, settlementBytes,
	)
	if err != nil || replayed || settlement.LedgerRevision != 2 {
		t.Fatalf("settle evaluation budget = %#v replay=%v err=%v", settlement, replayed, err)
	}
	if _, replayed, err := repositoryB.SettleEvaluationBudget(
		ctx, authority, plan.FactDigest, reservation.ReservationID, 1, settlementBytes,
	); err != nil || !replayed {
		t.Fatalf("replay evaluation budget settlement replay=%v err=%v", replayed, err)
	}
	if _, _, err := repositoryA.StoreEvaluationAttempt(ctx, EvaluationAuthority{
		Kind: "service", PrincipalID: authority.PrincipalID, NamespaceID: "evaluation.foreign",
	}, vector.Facts.Attempt); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-namespace attempt error = %v, want ErrNotFound", err)
	}
	if _, _, err := repositoryA.StoreEvaluationAttempt(
		ctx, authority, evaluationAttemptOutsidePlan(t, vector.Facts.Attempt),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("out-of-plan evaluation attempt error = %v, want ErrConflict", err)
	}
	attempt, replayed, err := repositoryA.StoreEvaluationAttempt(ctx, authority, vector.Facts.Attempt)
	if err != nil || replayed {
		t.Fatalf("store evaluation attempt = %#v replay=%v err=%v", attempt, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationAttempt(ctx, authority, vector.Facts.Attempt); err != nil || !replayed {
		t.Fatalf("replay evaluation attempt replay=%v err=%v", replayed, err)
	}
	var checkpointIdentity struct {
		Value struct {
			ShardID string `json:"shardId"`
		} `json:"value"`
	}
	if err := json.Unmarshal(vector.Facts.Checkpoint, &checkpointIdentity); err != nil {
		t.Fatal(err)
	}
	if _, _, err := repositoryA.ClaimEvaluationShard(
		ctx, authority, plan.FactDigest, checkpointIdentity.Value.ShardID, "evaluation-worker.expired",
		mustAgentTime(t, "2026-08-02T03:00:00.000Z"), mustAgentTime(t, "2026-08-10T00:00:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("out-of-window evaluation lease error = %v, want ErrConflict", err)
	}
	lease, replayed, err := repositoryA.ClaimEvaluationShard(
		ctx, authority, plan.FactDigest, checkpointIdentity.Value.ShardID, "evaluation-worker.vector",
		mustAgentTime(t, "2026-08-02T02:59:00.000Z"), mustAgentTime(t, "2026-08-02T04:00:00.000Z"),
	)
	if err != nil || replayed || lease.Generation != 1 {
		t.Fatalf("claim evaluation shard = %#v replay=%v err=%v", lease, replayed, err)
	}
	renewedLease, err := repositoryA.RenewEvaluationShard(
		ctx, authority, plan.FactDigest, lease.ShardID, lease.OwnerID, lease.Generation,
		mustAgentTime(t, "2026-08-02T03:01:00.000Z"), mustAgentTime(t, "2026-08-02T04:30:00.000Z"),
	)
	if err != nil || !renewedLease.ExpiresAt.After(lease.ExpiresAt) || renewedLease.Generation != lease.Generation {
		t.Fatalf("renew evaluation shard = %#v err=%v", renewedLease, err)
	}
	if _, _, err := repositoryB.ClaimEvaluationShard(
		ctx, authority, plan.FactDigest, lease.ShardID, "evaluation-worker.foreign",
		mustAgentTime(t, "2026-08-02T03:01:00.000Z"), mustAgentTime(t, "2026-08-02T04:00:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("competing evaluation lease error = %v, want ErrConflict", err)
	}
	checkpoint, replayed, err := repositoryA.StoreEvaluationCheckpoint(ctx, authority, -1, vector.Facts.Checkpoint)
	if err != nil || replayed {
		t.Fatalf("store evaluation checkpoint = %#v replay=%v err=%v", checkpoint, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationCheckpoint(ctx, authority, -1, vector.Facts.Checkpoint); err != nil || !replayed {
		t.Fatalf("replay evaluation checkpoint replay=%v err=%v", replayed, err)
	}
	holdout, replayed, err := repositoryA.StoreEvaluationArtifact(ctx, authority, "evaluation-holdout-receipt", vector.Facts.Holdout)
	if err != nil || replayed {
		t.Fatalf("store holdout artifact = %#v replay=%v err=%v", holdout, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationArtifact(ctx, authority, "evaluation-holdout-receipt", vector.Facts.Holdout); err != nil || !replayed {
		t.Fatalf("replay holdout artifact replay=%v err=%v", replayed, err)
	}
	if _, err := databaseA.Exec(`UPDATE agent_evaluation_attempts SET outcome = 'failed'
		WHERE namespace_id = $1 AND attempt_id = $2`, authority.NamespaceID, attempt.FactID); err == nil {
		t.Fatal("immutable evaluation attempt accepted UPDATE")
	}
	if _, err := databaseA.Exec(`DELETE FROM agent_evaluation_artifacts
		WHERE namespace_id = $1 AND fact_id = $2`, authority.NamespaceID, holdout.FactID); err == nil {
		t.Fatal("immutable evaluation artifact accepted DELETE")
	}
	if _, err := databaseA.Exec(`UPDATE agent_evaluation_budget_reservations SET demand_digest = $1
		WHERE namespace_id = $2 AND reservation_id = $3`, plan.FactDigest, authority.NamespaceID, reservation.ReservationID); err == nil {
		t.Fatal("immutable evaluation budget reservation accepted UPDATE")
	}
	if _, err := databaseA.Exec(`DELETE FROM agent_evaluation_budget_settlements
		WHERE namespace_id = $1 AND reservation_id = $2`, authority.NamespaceID, settlement.ReservationID); err == nil {
		t.Fatal("immutable evaluation budget settlement accepted DELETE")
	}
}
