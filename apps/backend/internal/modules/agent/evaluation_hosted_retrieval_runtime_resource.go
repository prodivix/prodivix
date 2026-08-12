package agent

import (
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourcePurposeHeader                   = "X-Prodivix-Hosted-Retrieval-Runtime-Resource-Purpose"
	evaluationHostedRetrievalRuntimeResourceOwnerHealthRouteSegment         = "hosted-retrieval-runtime-resource-owner-health"
	evaluationHostedRetrievalRuntimeResourceOwnerHealthPurpose              = "hosted-retrieval-runtime-resource.preactivation-health.read"
	evaluationHostedRetrievalRuntimeResourceOwnerAuthorityIssuerID          = "authority.prodivix.hosted-retrieval-runtime-resource-owner"
	evaluationHostedRetrievalRuntimeResourceOwnerHealthSchemaContractDigest = "sha256-ed9818c7a2b9a64b97f190bd3d9a5bd43395a021c3f20daa4b46e17247d408be"
	evaluationHostedRetrievalRuntimeResourceOwnerImplementationDigest       = "sha256-143518f5c534f4d3f646a9b5d85f09940b521b4e25826b7ed00ccc2ea68abb1d"
	maximumEvaluationHostedRetrievalRuntimeResourceOwnerHealthBytes         = 16_384
	maximumEvaluationHostedRetrievalRuntimeResourceOwnerHealthCount         = 10_000_000
	evaluationHostedRetrievalRuntimeResourceLiveOperationsComplete          = true
)

var evaluationHostedRetrievalRuntimeResourceOwnerHealthSupportedOperations = []any{
	"active-read.issue",
	"cleanup.claim",
	"cleanup.execute",
	"cleanup.recovery.list",
	"cleanup.result.read",
	"registration-result.read",
	"registration-result.write",
	"registration-set.read",
	"registration.create",
	"terminal-fence.derive",
}

type evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary struct {
	LedgerRevision         int64
	RegistrationCount      int64
	ActiveResourceCount    int64
	ActiveReadLeaseCount   int64
	UnfinishedCleanupCount int64
	OverdueCount           int64
}

func evaluationHostedRetrievalRuntimeResourceOwnerHealthReady(
	summary evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary,
) bool {
	return summary.UnfinishedCleanupCount == 0 && summary.OverdueCount == 0
}

func evaluationHostedRetrievalRuntimeResourcePreplanStorageZero(
	summary evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary,
) bool {
	return summary.ActiveResourceCount == 0 && summary.ActiveReadLeaseCount == 0 &&
		evaluationHostedRetrievalRuntimeResourceOwnerHealthReady(summary)
}

func evaluationHostedRetrievalRuntimeResourceOwnerContract() error {
	schemaDigest, err := canonicaljson.Digest(map[string]any{
		"format":                    "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-owner-schema-contract",
		"version":                   int64(1),
		"exactRuntimeResourceCount": int64(4),
		"routes": map[string]any{
			"ownerHealth":                       evaluationHostedRetrievalRuntimeResourceOwnerHealthRouteSegment,
			"registrations":                     "hosted-retrieval-runtime-resource-registrations",
			"registrationResults":               "hosted-retrieval-runtime-resource-results",
			"reads":                             "hosted-retrieval-runtime-resource-reads",
			"terminalFenceDerivations":          "hosted-retrieval-runtime-resource-terminal-fences/derive",
			"recoveryCandidates":                "hosted-retrieval-runtime-resource-recovery-candidates",
			"cleanupClaims":                     "hosted-retrieval-runtime-resource-cleanup-claims",
			"cleanups":                          "hosted-retrieval-runtime-resource-cleanups",
			"cleanupResults":                    "hosted-retrieval-runtime-resource-cleanup-results",
			"lifecycleJournalDispatchIntents":   evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			"lifecycleJournalTransportReceipts": evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsRouteSegment,
			"lifecycleJournalRecords":           evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment,
		},
		"purposes": map[string]any{
			"readOwnerHealth":                             evaluationHostedRetrievalRuntimeResourceOwnerHealthPurpose,
			"prepare":                                     evaluationHostedRetrievalRuntimeResourcePreparePurpose,
			"readRegistrationSet":                         evaluationHostedRetrievalRuntimeResourceRegistrationSetReadPurpose,
			"read":                                        evaluationHostedRetrievalRuntimeResourceReadPurpose,
			"deriveTerminalFence":                         evaluationHostedRetrievalRuntimeResourceTerminalFencePurpose,
			"listRecovery":                                evaluationHostedRetrievalRuntimeResourceRecoveryListPurpose,
			"claimPostMatrixCleanup":                      evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupClaimPurpose,
			"claimPartialPrepareCleanup":                  "hosted-retrieval-runtime-resource.cleanup.partial-create.claim",
			"claimCleanup":                                evaluationHostedRetrievalRuntimeResourceRecoveryCleanupClaimPurpose,
			"executePostMatrixCleanup":                    evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupExecutePurpose,
			"executeCleanup":                              evaluationHostedRetrievalRuntimeResourceRecoveryCleanupExecutePurpose,
			"readPostMatrixCleanupResult":                 evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupResultReadPurpose,
			"readCleanupResult":                           evaluationHostedRetrievalRuntimeResourceRecoveryCleanupResultReadPurpose,
			"stageLifecycleJournalDispatch":               evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose,
			"readLifecycleJournalUnfinishedDispatches":    evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose,
			"storeLifecycleJournalTransport":              evaluationHostedRetrievalRuntimeResourceLifecycleTransportPurpose,
			"readLifecycleJournalTransportRecovery":       evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadPurpose,
			"readLifecycleJournalTransportReconciliation": evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReadPurpose,
			"storeLifecycleJournalTransportReconciliationObservation": evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStorePurpose,
			"readLifecycleJournalArchive":                             evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPurpose,
			"sealLifecycleJournalRecord":                              evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose,
		},
		"supportedOperations": evaluationHostedRetrievalRuntimeResourceOwnerHealthSupportedOperations,
	})
	if err != nil || schemaDigest != evaluationHostedRetrievalRuntimeResourceOwnerHealthSchemaContractDigest {
		return ErrConflict
	}
	implementationDigest, err := canonicaljson.Digest(map[string]any{
		"format":                 "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-owner-implementation",
		"version":                int64(1),
		"ownerAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceOwnerAuthorityIssuerID,
		"schemaContractDigest":   evaluationHostedRetrievalRuntimeResourceOwnerHealthSchemaContractDigest,
	})
	if err != nil || implementationDigest != evaluationHostedRetrievalRuntimeResourceOwnerImplementationDigest {
		return ErrConflict
	}
	return nil
}

func createEvaluationHostedRetrievalRuntimeResourceOwnerHealthReceipt(
	namespaceID string,
	summary evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary,
	checkedAt time.Time,
) ([]byte, error) {
	checkedAt = checkedAt.UTC().Truncate(time.Millisecond)
	if !validEvaluationServiceIdentity(namespaceID) || summary.LedgerRevision < 1 ||
		summary.RegistrationCount < 0 || summary.RegistrationCount > maximumEvaluationHostedRetrievalRuntimeResourceOwnerHealthCount ||
		summary.ActiveResourceCount < 0 || summary.ActiveResourceCount > summary.RegistrationCount ||
		summary.ActiveReadLeaseCount < 0 || summary.ActiveReadLeaseCount > maximumEvaluationHostedRetrievalRuntimeResourceOwnerHealthCount ||
		summary.UnfinishedCleanupCount < 0 || summary.UnfinishedCleanupCount > summary.RegistrationCount ||
		summary.OverdueCount < 0 || summary.OverdueCount > summary.RegistrationCount ||
		!evaluationHostedRetrievalRuntimeResourceOwnerHealthReady(summary) || checkedAt.IsZero() {
		return nil, ErrConflict
	}
	instant := evaluationExportInstant(checkedAt)
	summaryBase := map[string]any{
		"format":                 "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-owner-storage-summary",
		"version":                int64(1),
		"namespaceId":            namespaceID,
		"schemaContractDigest":   evaluationHostedRetrievalRuntimeResourceOwnerHealthSchemaContractDigest,
		"ledgerRevision":         summary.LedgerRevision,
		"registrationCount":      summary.RegistrationCount,
		"activeResourceCount":    summary.ActiveResourceCount,
		"activeReadLeaseCount":   summary.ActiveReadLeaseCount,
		"unfinishedCleanupCount": summary.UnfinishedCleanupCount,
		"overdueCount":           summary.OverdueCount,
		"summarizedAt":           instant,
	}
	summaryDigest, err := canonicaljson.Digest(summaryBase)
	if err != nil {
		return nil, err
	}
	summaryValue := cloneEvaluationObject(summaryBase)
	summaryValue["summaryDigest"] = summaryDigest
	receiptBase := map[string]any{
		"format":                 "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-owner-health-receipt",
		"version":                int64(1),
		"purpose":                evaluationHostedRetrievalRuntimeResourceOwnerHealthPurpose,
		"namespaceId":            namespaceID,
		"ownerAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceOwnerAuthorityIssuerID,
		"implementationDigest":   evaluationHostedRetrievalRuntimeResourceOwnerImplementationDigest,
		"schemaContractDigest":   evaluationHostedRetrievalRuntimeResourceOwnerHealthSchemaContractDigest,
		"supportedOperations":    evaluationHostedRetrievalRuntimeResourceOwnerHealthSupportedOperations,
		"storageSummary":         summaryValue,
		"storageSummaryDigest":   summaryDigest,
		"status":                 "ready",
		"checkedAt":              instant,
		"expiresAt":              evaluationExportInstant(checkedAt.Add(125 * time.Second)),
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return nil, err
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["receiptDigest"] = receiptDigest
	encoded, err := canonicaljson.Bytes(receipt)
	if err != nil || len(encoded) > maximumEvaluationHostedRetrievalRuntimeResourceOwnerHealthBytes {
		return nil, ErrConflict
	}
	return encoded, nil
}
