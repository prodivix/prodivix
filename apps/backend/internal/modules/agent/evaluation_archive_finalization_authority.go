package agent

import (
	"context"
	"database/sql"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

// validateEvaluationArchiveFinalizationBindings prevents an archive lease or
// closure from blessing a family catalog that is individually well-formed but
// belongs to a different immutable finalization, human projection, or holdout
// authority. The caller must load every input from one database snapshot.
func validateEvaluationArchiveFinalizationBindings(
	partition EvaluationPlanPartition,
	finalization *evaluationFinalizationRecord,
	human *EvaluationValidatedHumanReviewArtifactRecord,
	holdout *EvaluationHoldoutClosureRecord,
	sourceBinding EvaluationEvidenceExportSourceBinding,
	roots EvaluationEvidenceArchiveAuthorityRoots,
	families []EvaluationExportFamilySummary,
	evaluationManifestDigest string,
	reviewLeaseDigest string,
) error {
	if finalization == nil || human == nil || holdout == nil {
		return conflict("evaluation archive requires finalized human and holdout authority")
	}
	if finalization.Partition != partition || holdout.Partition != partition ||
		human.PlanDigest != partition.PlanDigest || human.RepositoryCommit != partition.RepositoryCommit {
		return conflict("evaluation archive finalization authority belongs to another partition")
	}
	if finalization.ManifestDigest != evaluationManifestDigest ||
		finalization.ReviewLeaseDigest != reviewLeaseDigest ||
		human.ReviewLeaseDigest != reviewLeaseDigest ||
		finalization.ValidatedHumanReviewArtifactDigest != human.ArtifactDigest ||
		finalization.ValidatedHumanMetricObservationSetDigest != human.ValidatedHumanMetricObservationSetDigest ||
		finalization.HumanReviewReportDigest != human.HumanReviewReportDigest ||
		finalization.HoldoutExecutionReceiptDigest != holdout.ReceiptDigest {
		return conflict("evaluation archive drifted from its immutable finalization")
	}
	if !sameEvaluationProductionRunConfigArtifactBinding(sourceBinding.RunConfigArtifactBinding, holdout.RunConfigArtifactBinding) ||
		sourceBinding.SourceConfigDigest != holdout.SourceConfigDigest ||
		sourceBinding.FrozenRunDigest != holdout.FrozenRunDigest {
		return conflict("evaluation archive source binding drifted from its sealed holdout authority")
	}
	validatedHumanArtifactSetDigest, err := canonicaljson.Digest([]string{human.ArtifactDigest})
	if err != nil {
		return err
	}
	if roots.ValidatedHumanReviewArtifactSetDigest != validatedHumanArtifactSetDigest ||
		roots.ValidatedHumanMetricObservationSetDigest != human.ValidatedHumanMetricObservationSetDigest ||
		roots.ReviewLeaseDigest != reviewLeaseDigest ||
		roots.HoldoutExecutionReceiptDigest != holdout.ReceiptDigest ||
		roots.SecretCanarySetDigest != holdout.SecretCanarySetDigest ||
		roots.ProtectedHoldoutCanarySetDigest != holdout.ProtectedCanarySetDigest {
		return conflict("evaluation archive authority roots drifted from finalization authority")
	}

	byFamily := evaluationExportSummaryByFamily(families)
	hostedLifecycleJournalSummary, hostedLifecycleJournalExists := byFamily["hostedRetrievalRuntimeResourceLifecycleJournals"]
	if !hostedLifecycleJournalExists ||
		hostedLifecycleJournalSummary.ExpectedSemanticDigest != roots.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest ||
		validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(
			hostedLifecycleJournalSummary.ExpectedRecordCount, hostedLifecycleJournalSummary.ExpectedTotalBytes,
		) != nil {
		return conflict("evaluation archive hosted retrieval runtime resource lifecycle journal authority drifted")
	}
	hostedCleanupSummary, hostedCleanupExists := byFamily["hostedRetrievalRuntimeResourceCleanups"]
	if !hostedCleanupExists ||
		hostedCleanupSummary.ExpectedSemanticDigest != roots.HostedRetrievalRuntimeResourceCleanupSetDigest ||
		validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(
			hostedCleanupSummary.ExpectedRecordCount, hostedCleanupSummary.ExpectedTotalBytes,
		) != nil {
		return conflict("evaluation archive hosted retrieval runtime resource cleanup authority drifted")
	}
	providerRuntimeJournalSummary, providerRuntimeJournalExists := byFamily["capabilityEffectProviderRuntimeJournals"]
	if !providerRuntimeJournalExists ||
		providerRuntimeJournalSummary.ExpectedSemanticDigest != roots.CapabilityEffectProviderRuntimeJournalSetDigest ||
		validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(
			providerRuntimeJournalSummary.ExpectedRecordCount, providerRuntimeJournalSummary.ExpectedTotalBytes,
		) != nil {
		return conflict("evaluation archive capability effect Provider-runtime journal authority drifted")
	}
	require := func(family string, count int64, semanticDigest string) error {
		summary, exists := byFamily[family]
		if !exists || summary.ExpectedRecordCount != count || summary.ExpectedSemanticDigest != semanticDigest {
			return conflict("evaluation archive finalized family drifted for " + family)
		}
		return nil
	}
	for _, expected := range []struct {
		family string
		count  int64
		digest string
	}{
		{"validatedHumanReviewArtifacts", 1, validatedHumanArtifactSetDigest},
		{"validatedHumanMetricObservations", int64(len(human.ValidatedHumanMetricObservations)), human.ValidatedHumanMetricObservationSetDigest},
		{"metricReport", 1, finalization.MetricReportDigest},
		{"graderReport", 1, finalization.GraderReportDigest},
		{"humanReviewReport", 1, finalization.HumanReviewReportDigest},
		{"holdoutExecutionReceipt", 1, finalization.HoldoutExecutionReceiptDigest},
		{"manifest", 1, finalization.ManifestDigest},
	} {
		if err := require(expected.family, expected.count, expected.digest); err != nil {
			return err
		}
	}
	if len(human.ValidatedHumanMetricObservations) == 0 {
		return conflict("evaluation archive finalized human metric authority is empty")
	}
	return nil
}

// validateEvaluationArchiveFinalizationAuthority reloads and replays every
// finalization authority under the same transaction used to open or publish an
// archive. It intentionally accepts no client-provided authority digest.
func validateEvaluationArchiveFinalizationAuthority(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	sourceBinding EvaluationEvidenceExportSourceBinding,
	roots EvaluationEvidenceArchiveAuthorityRoots,
	families []EvaluationExportFamilySummary,
	evaluationManifestDigest string,
	reviewLeaseDigest string,
) error {
	finalization, err := loadEvaluationFinalizationRecord(ctx, tx, namespaceID, partition)
	if err != nil {
		return err
	}
	if finalization == nil {
		return conflict("evaluation archive requires an immutable finalization")
	}
	if err := validateEvaluationFinalizationReplay(
		ctx, tx, namespaceID, finalization, finalization.CompletedAt,
		finalization.ReviewLeaseDigest, finalization.ValidatedHumanReviewArtifactDigest,
		finalization.ValidatedHumanMetricObservationSetDigest,
	); err != nil {
		return err
	}
	human, err := queryEvaluationValidatedHumanReviewArtifact(ctx, tx, namespaceID, partition)
	if err != nil {
		return err
	}
	holdout, err := loadEvaluationHoldoutClosure(ctx, tx, namespaceID, partition)
	if err != nil {
		return err
	}
	return validateEvaluationArchiveFinalizationBindings(
		partition, finalization, human, holdout, sourceBinding, roots, families,
		evaluationManifestDigest, reviewLeaseDigest,
	)
}
