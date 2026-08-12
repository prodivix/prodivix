package agent

import (
	"strings"
	"testing"
)

func evaluationArchiveFinalizationAuthorityFixture(t *testing.T) (
	EvaluationPlanPartition,
	*evaluationFinalizationRecord,
	*EvaluationValidatedHumanReviewArtifactRecord,
	*EvaluationHoldoutClosureRecord,
	EvaluationEvidenceExportSourceBinding,
	EvaluationEvidenceArchiveAuthorityRoots,
	[]EvaluationExportFamilySummary,
) {
	t.Helper()
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationArchiveTestDigest(t, "finalized-plan"),
		RepositoryCommit: strings.Repeat("a", 40),
	}
	reviewLeaseDigest := evaluationArchiveTestDigest(t, "review-lease")
	artifactDigest := evaluationArchiveTestDigest(t, "validated-human-artifact")
	observationSetDigest := evaluationArchiveTestDigest(t, "human-observation-set")
	humanReportDigest := evaluationArchiveTestDigest(t, "human-report")
	holdoutReceiptDigest := evaluationArchiveTestDigest(t, "holdout-receipt")
	metricDigest := evaluationArchiveTestDigest(t, "metric-report")
	graderDigest := evaluationArchiveTestDigest(t, "grader-report")
	manifestDigest := evaluationArchiveTestDigest(t, "manifest")
	secretCanaryDigest := evaluationArchiveTestDigest(t, "secret-canaries")
	protectedCanaryDigest := evaluationArchiveTestDigest(t, "holdout-canaries")
	hostedLifecycleJournalSetDigest := evaluationArchiveTestDigest(t, "hosted-lifecycle-journal-set")
	hostedCleanupSetDigest := evaluationArchiveTestDigest(t, "hosted-cleanup-set")
	providerRuntimeJournalSetDigest := evaluationArchiveTestDigest(t, "provider-runtime-journal-set")
	sourceConfigDigest := evaluationArchiveTestDigest(t, "source-config")
	frozenRunDigest := evaluationArchiveTestDigest(t, "frozen-run")
	runConfigArtifactBinding := evaluationTestRunConfigArtifactBinding(
		t, partition.PlanDigest, partition.RepositoryCommit, sourceConfigDigest, frozenRunDigest,
	)
	finalization := &evaluationFinalizationRecord{
		Partition: partition, ReviewLeaseDigest: reviewLeaseDigest,
		ValidatedHumanReviewArtifactDigest:       artifactDigest,
		ValidatedHumanMetricObservationSetDigest: observationSetDigest,
		MetricReportDigest:                       metricDigest, GraderReportDigest: graderDigest,
		HumanReviewReportDigest: humanReportDigest, HoldoutExecutionReceiptDigest: holdoutReceiptDigest,
		ManifestDigest: manifestDigest,
	}
	human := &EvaluationValidatedHumanReviewArtifactRecord{
		PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		ArtifactDigest: artifactDigest, ReviewLeaseDigest: reviewLeaseDigest,
		HumanReviewReportDigest:                  humanReportDigest,
		ValidatedHumanMetricObservationSetDigest: observationSetDigest,
		ValidatedHumanMetricObservations: []map[string]any{
			{"observationId": "human-metric-observation:1"},
			{"observationId": "human-metric-observation:2"},
		},
	}
	holdout := &EvaluationHoldoutClosureRecord{
		Partition: partition, RunConfigArtifactBinding: runConfigArtifactBinding,
		SourceConfigDigest: sourceConfigDigest,
		FrozenRunDigest:    frozenRunDigest,
		ReceiptDigest:      holdoutReceiptDigest, SecretCanarySetDigest: secretCanaryDigest,
		ProtectedCanarySetDigest: protectedCanaryDigest,
	}
	sourceBinding := EvaluationEvidenceExportSourceBinding{
		RunConfigArtifactBinding: holdout.RunConfigArtifactBinding, SourceConfigDigest: holdout.SourceConfigDigest,
		FrozenRunDigest: holdout.FrozenRunDigest,
	}
	artifactSetDigest, err := evaluationValidatedHumanReviewArtifactSetDigest([]EvaluationValidatedHumanReviewArtifactRecord{*human})
	if err != nil {
		t.Fatal(err)
	}
	roots := EvaluationEvidenceArchiveAuthorityRoots{
		ValidatedHumanReviewArtifactSetDigest:                   artifactSetDigest,
		ValidatedHumanMetricObservationSetDigest:                observationSetDigest,
		ReviewLeaseDigest:                                       reviewLeaseDigest,
		HoldoutExecutionReceiptDigest:                           holdoutReceiptDigest,
		SecretCanarySetDigest:                                   secretCanaryDigest,
		ProtectedHoldoutCanarySetDigest:                         protectedCanaryDigest,
		HostedRetrievalRuntimeResourceLifecycleJournalSetDigest: hostedLifecycleJournalSetDigest,
		HostedRetrievalRuntimeResourceCleanupSetDigest:          hostedCleanupSetDigest,
		CapabilityEffectProviderRuntimeJournalSetDigest:         providerRuntimeJournalSetDigest,
	}
	families := []EvaluationExportFamilySummary{
		{Family: "hostedRetrievalRuntimeResourceCleanups", ExpectedRecordCount: maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords, ExpectedTotalBytes: 1, ExpectedSemanticDigest: hostedCleanupSetDigest},
		{Family: "capabilityEffectProviderRuntimeJournals", ExpectedRecordCount: 1, ExpectedTotalBytes: 1, ExpectedSemanticDigest: providerRuntimeJournalSetDigest},
		{Family: "validatedHumanReviewArtifacts", ExpectedRecordCount: 1, ExpectedSemanticDigest: artifactSetDigest},
		{Family: "validatedHumanMetricObservations", ExpectedRecordCount: 2, ExpectedSemanticDigest: observationSetDigest},
		{Family: "metricReport", ExpectedRecordCount: 1, ExpectedSemanticDigest: metricDigest},
		{Family: "graderReport", ExpectedRecordCount: 1, ExpectedSemanticDigest: graderDigest},
		{Family: "humanReviewReport", ExpectedRecordCount: 1, ExpectedSemanticDigest: humanReportDigest},
		{Family: "holdoutExecutionReceipt", ExpectedRecordCount: 1, ExpectedSemanticDigest: holdoutReceiptDigest},
		{Family: "manifest", ExpectedRecordCount: 1, ExpectedSemanticDigest: manifestDigest},
		{Family: "hostedRetrievalRuntimeResourceLifecycleJournals", ExpectedRecordCount: 4, ExpectedTotalBytes: 1, ExpectedSemanticDigest: hostedLifecycleJournalSetDigest},
	}
	return partition, finalization, human, holdout, sourceBinding, roots, families
}

func TestEvaluationArchiveFinalizationAuthorityBindsHumanHoldoutAndReports(t *testing.T) {
	partition, finalization, human, holdout, sourceBinding, roots, families :=
		evaluationArchiveFinalizationAuthorityFixture(t)
	if err := validateEvaluationArchiveFinalizationBindings(
		partition, finalization, human, holdout, sourceBinding, roots, families,
		finalization.ManifestDigest, finalization.ReviewLeaseDigest,
	); err != nil {
		t.Fatalf("complete archive finalization authority was rejected: %v", err)
	}
	emptyHostedDigest := evaluationArchiveTestDigest(t, "empty-hosted-cleanup-set")
	roots.HostedRetrievalRuntimeResourceCleanupSetDigest = emptyHostedDigest
	families[0].ExpectedRecordCount = 0
	families[0].ExpectedTotalBytes = 0
	families[0].ExpectedSemanticDigest = emptyHostedDigest
	if err := validateEvaluationArchiveFinalizationBindings(
		partition, finalization, human, holdout, sourceBinding, roots, families,
		finalization.ManifestDigest, finalization.ReviewLeaseDigest,
	); err != nil {
		t.Fatalf("finalization without a planned hosted cleanup family was rejected: %v", err)
	}

	tests := map[string]func(){
		"source-config-swap": func() { sourceBinding.SourceConfigDigest = evaluationArchiveTestDigest(t, "swapped-config") },
		"human-root-swap": func() {
			roots.ValidatedHumanMetricObservationSetDigest = evaluationArchiveTestDigest(t, "swapped-human-root")
		},
		"provider-runtime-journal-root-swap": func() {
			roots.CapabilityEffectProviderRuntimeJournalSetDigest = evaluationArchiveTestDigest(t, "swapped-journal-root")
		},
		"hosted-lifecycle-journal-root-swap": func() {
			roots.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest = evaluationArchiveTestDigest(t, "swapped-hosted-lifecycle-root")
		},
		"report-family-swap": func() {
			families[4].ExpectedSemanticDigest = evaluationArchiveTestDigest(t, "swapped-metric-report")
		},
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			partition, finalization, human, holdout, sourceBinding, roots, families =
				evaluationArchiveFinalizationAuthorityFixture(t)
			mutate()
			if err := validateEvaluationArchiveFinalizationBindings(
				partition, finalization, human, holdout, sourceBinding, roots, families,
				finalization.ManifestDigest, finalization.ReviewLeaseDigest,
			); err == nil {
				t.Fatal("archive finalization authority accepted drifted input")
			}
		})
	}
}

func TestEvaluationArchiveFinalizationAuthorityRejectsEmptyHumanProjection(t *testing.T) {
	partition, finalization, human, holdout, sourceBinding, roots, families :=
		evaluationArchiveFinalizationAuthorityFixture(t)
	human.ValidatedHumanMetricObservations = nil
	families[3].ExpectedRecordCount = 0
	if err := validateEvaluationArchiveFinalizationBindings(
		partition, finalization, human, holdout, sourceBinding, roots, families,
		finalization.ManifestDigest, finalization.ReviewLeaseDigest,
	); err == nil {
		t.Fatal("archive finalization authority accepted an empty human metric projection")
	}
}
