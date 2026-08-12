package agent

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestEvaluationCoordinatorStatusDigestBindsCommittedProviderObservations(t *testing.T) {
	base := EvaluationCoordinatorStatus{
		Format: "prodivix.g4-model-evaluation-status", Version: 1,
		PlanDigest:          evaluationBoundedExportTestDigest(t, "status-plan"),
		RepositoryCommit:    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		AttemptStatusCounts: map[string]int64{}, CheckpointCounts: map[string]int64{},
		MissingAttemptSetDigest: evaluationBoundedExportTestDigest(t, "status-missing"),
		ObservedAt:              "2026-08-09T00:00:00.000Z",
	}
	first, err := evaluationCoordinatorStatusDigest(base)
	if err != nil {
		t.Fatal(err)
	}
	base.ProviderCapabilityObservationReceiptCount = 1
	second, err := evaluationCoordinatorStatusDigest(base)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("coordinator status digest omitted the committed provider observation count")
	}
	base.LegacyIneligibleAuthorityRequestCount = 1
	base.RequalificationRequired = true
	third, err := evaluationCoordinatorStatusDigest(base)
	if err != nil {
		t.Fatal(err)
	}
	if second == third {
		t.Fatal("coordinator status digest omitted the legacy requalification authority")
	}
}

func TestEvaluationV46EligibilityRequiresRequalificationForEitherLegacyAuthority(t *testing.T) {
	if (evaluationV46EligibilitySnapshot{}).requalificationRequired() {
		t.Fatal("fresh v46 partition requires requalification")
	}
	for _, snapshot := range []evaluationV46EligibilitySnapshot{
		{LegacyAuthorityRequestCount: 1},
		{LegacyPublicationCount: 1},
	} {
		if !snapshot.requalificationRequired() {
			t.Fatalf("legacy authority was accepted: %#v", snapshot)
		}
	}
}

func TestEvaluationV46EligibilityQueryCountsLegacyRequestsAndPublications(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	partition := EvaluationPlanPartition{PlanDigest: evaluationBoundedExportTestDigest(t, "v46-status")}
	mock.ExpectQuery("agent_evaluation_controlled_authority_requests").
		WithArgs("namespace.v46-status", partition.PlanDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"legacy_authority_request_count", "legacy_publication_count",
		}).AddRow(int64(2), int64(1)))

	snapshot, err := queryEvaluationV46EligibilitySnapshot(
		context.Background(), database, "namespace.v46-status", partition,
	)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.LegacyAuthorityRequestCount != 2 || snapshot.LegacyPublicationCount != 1 ||
		!snapshot.requalificationRequired() {
		t.Fatalf("legacy eligibility snapshot drifted: %#v", snapshot)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestEvaluationStatusScheduleUsesResolvedOptionalCapabilityDescriptor(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		t.Fatal(err)
	}
	if plan.PlannedJourneyCount != maximumEvaluationPlannedAttempts || int64(len(planned)) != maximumEvaluationPlannedAttempts {
		t.Fatalf("resolved schedule attempts=%d plan=%d", len(planned), plan.PlannedJourneyCount)
	}
	var target, resolved map[string]any
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		candidate := raw.(map[string]any)
		authority, ok := objectMember(candidate, "optionalCapabilitySupportAuthority")
		if !ok || stringMember(authority, "supportExpectation") != "expected-blocked" {
			continue
		}
		resolved, ok = objectMember(authority, "resolvedCapabilityDescriptor")
		if ok {
			target = candidate
			break
		}
	}
	if target == nil || resolved == nil {
		t.Fatal("frozen plan has no unsupported optional capability target")
	}
	var evaluationCase map[string]any
	for _, raw := range plan.Value["concreteCases"].([]any) {
		candidate := raw.(map[string]any)
		if stringMember(candidate, "capabilityProfileId") == stringMember(target, "capabilityProfileId") {
			evaluationCase = candidate
			break
		}
	}
	if evaluationCase == nil || stringMember(evaluationCase, "capabilityDescriptorDigest") == stringMember(resolved, "descriptorDigest") {
		t.Fatal("unsupported optional target did not resolve away from its required case descriptor")
	}
	found := false
	for _, attempt := range planned {
		if attempt.CaseID == stringMember(evaluationCase, "caseId") &&
			stringMember(attempt.Descriptor, "targetId") == stringMember(target, "targetId") {
			found = true
			if stringMember(attempt.Descriptor, "capabilityDescriptorDigest") != stringMember(resolved, "descriptorDigest") {
				t.Fatal("planned attempt omitted the target-resolved optional capability descriptor")
			}
			break
		}
	}
	if !found {
		t.Fatal("target-resolved optional capability attempt is absent from the frozen denominator")
	}
}
