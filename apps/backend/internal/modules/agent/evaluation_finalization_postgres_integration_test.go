package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sort"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func assertEvaluationFinalizationMissingReport(
	t *testing.T,
	source []byte,
	partition EvaluationPlanPartition,
	expectedFormat string,
	digestField string,
	requireOutcome bool,
) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) || stringMember(value, "format") != expectedFormat ||
		stringMember(value, "planDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit {
		t.Fatalf("invalid incomplete finalization report: %s", source)
	}
	if requireOutcome && stringMember(value, "outcome") != "incomplete" {
		t.Fatalf("invalid incomplete finalization outcome: %s", source)
	}
	missingValues, ok := value["missingFacts"].([]any)
	if !ok || len(missingValues) == 0 || len(missingValues) > 128 {
		t.Fatalf("invalid bounded missing facts: %#v", value["missingFacts"])
	}
	missing := make([]string, len(missingValues))
	seen := make(map[string]struct{}, len(missingValues))
	for index, entry := range missingValues {
		missing[index], ok = entry.(string)
		if !ok {
			t.Fatalf("missing fact is not a string: %#v", entry)
		}
		if _, duplicate := seen[missing[index]]; duplicate {
			t.Fatalf("missing fact is duplicated: %s", missing[index])
		}
		seen[missing[index]] = struct{}{}
	}
	if !sort.StringsAreSorted(missing) {
		t.Fatalf("missing facts are not canonical: %#v", missing)
	}
	reportDigest := stringMember(value, digestField)
	delete(value, digestField)
	digest, err := canonicaljson.Digest(value)
	if err != nil || digest != reportDigest {
		t.Fatalf("incomplete report digest drifted: got=%s want=%s err=%v", reportDigest, digest, err)
	}
}

func TestEvaluationFinalizationIntentAndIncompleteTransactionPostgreSQL(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	repositoryA, repositoryB := NewRepository(databaseA), NewRepository(databaseB)
	vector := readEvaluationRepositoryVector(t)
	ctx := context.Background()
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.finalization.integration", NamespaceID: "evaluation.g4-finalization",
	}
	_, plan, _ := storeGoldenEvaluationPlan(t, repositoryA, authority, vector.Facts.Plan)
	partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	completedAt := plan.PlannedAt.Add(time.Minute).UTC().Truncate(time.Millisecond)
	serverNow := completedAt.Add(time.Minute)

	intent, replayed, err := repositoryA.PutEvaluationFinalizationIntent(
		ctx, authority, partition, completedAt, serverNow,
	)
	if err != nil || replayed {
		t.Fatalf("create finalization intent replay=%v err=%v", replayed, err)
	}
	replayedIntent, replayed, err := repositoryB.PutEvaluationFinalizationIntent(
		ctx, authority, partition, completedAt, serverNow,
	)
	if err != nil || !replayed || replayedIntent.IntentDigest != intent.IntentDigest ||
		!bytes.Equal(replayedIntent.IntentBytes, intent.IntentBytes) {
		t.Fatalf("replay finalization intent replay=%v err=%v", replayed, err)
	}
	loadedIntent, err := repositoryB.GetEvaluationFinalizationIntent(ctx, authority, partition)
	if err != nil || loadedIntent.IntentDigest != intent.IntentDigest || !loadedIntent.CompletedAt.Equal(completedAt) {
		t.Fatalf("load finalization intent = %#v err=%v", loadedIntent, err)
	}
	if _, _, err := repositoryB.PutEvaluationFinalizationIntent(
		ctx, authority, partition, completedAt.Add(time.Millisecond), serverNow,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("drifted finalization intent error=%v, want ErrConflict", err)
	}

	inspection, err := repositoryA.InspectEvaluationFinalization(ctx, authority, partition, nil)
	if err != nil {
		t.Fatal(err)
	}
	assertEvaluationFinalizationMissingReport(
		t, inspection, partition, evaluationFinalizationInspectionFormat, "inspectionDigest", false,
	)
	digest := func(label string) string { return evaluationServiceTestDigest(t, label) }
	first, replayed, err := repositoryA.FinalizeEvaluation(
		ctx, authority, partition, completedAt, serverNow,
		digest("review-lease"), digest("validated-human-artifact"), digest("validated-human-metrics"), nil,
	)
	if err != nil || replayed {
		t.Fatalf("incomplete finalization replay=%v err=%v report=%s", replayed, err, first)
	}
	assertEvaluationFinalizationMissingReport(
		t, first, partition, evaluationFinalizationFormat, "reportDigest", true,
	)
	second, replayed, err := repositoryB.FinalizeEvaluation(
		ctx, authority, partition, completedAt, serverNow,
		digest("review-lease"), digest("validated-human-artifact"), digest("validated-human-metrics"), nil,
	)
	if err != nil || replayed || !bytes.Equal(first, second) {
		t.Fatalf("incomplete transaction was not deterministic: replay=%v err=%v", replayed, err)
	}

	var finalizationCount, resultArtifactCount, intentCount int64
	if err := databaseA.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_evaluation_finalizations
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&finalizationCount); err != nil {
		t.Fatal(err)
	}
	if err := databaseA.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_evaluation_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2
		AND fact_type IN ('evaluation-metric-report','evaluation-grader-report','evaluation-manifest')`,
		authority.NamespaceID, partition.PlanDigest).Scan(&resultArtifactCount); err != nil {
		t.Fatal(err)
	}
	if err := databaseA.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_evaluation_finalization_intents
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&intentCount); err != nil {
		t.Fatal(err)
	}
	if finalizationCount != 0 || resultArtifactCount != 0 || intentCount != 1 {
		t.Fatalf("incomplete finalization wrote partial state: finalizations=%d artifacts=%d intents=%d",
			finalizationCount, resultArtifactCount, intentCount)
	}
}
