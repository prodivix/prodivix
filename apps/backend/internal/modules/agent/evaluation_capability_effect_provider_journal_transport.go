package agent

import (
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityEffectProviderJournalPurposeHeader = "X-Prodivix-Capability-Effect-Provider-Journal-Purpose"
	evaluationCapabilityEffectProviderJournalPurpose       = "capability-effect-provider-journal-owner"
	evaluationCapabilityEffectProviderJournalRouteSegment  = "capability-effect-provider-runtime-journal"
	evaluationCapabilityEffectProviderJournalAuthorityID   = "authority.g4-model-eval.capability-effect-provider-runtime-journal.v1"

	evaluationCapabilityEffectProviderJournalHealthFormat         = "prodivix.agent-evaluation-capability-effect-provider-journal-health"
	evaluationCapabilityEffectProviderJournalSnapshotFormat       = "prodivix.agent-evaluation-capability-effect-provider-journal-snapshot"
	evaluationCapabilityEffectProviderJournalResumableFormat      = "prodivix.agent-evaluation-capability-effect-provider-journal-resumable-spool"
	evaluationCapabilityEffectProviderJournalCleanupRequestFormat = "prodivix.agent-evaluation-capability-effect-provider-journal-cleanup-request"
	evaluationCapabilityEffectProviderJournalCleanupReceiptFormat = "prodivix.agent-evaluation-capability-effect-provider-journal-cleanup-receipt"
	evaluationCapabilityEffectProviderJournalZeroResidualFormat   = "prodivix.agent-evaluation-capability-effect-provider-journal-zero-residual-receipt"

	maximumEvaluationCapabilityEffectProviderJournalHealthBytes       = 16_384
	maximumEvaluationCapabilityEffectProviderJournalSnapshotBytes     = 2_621_440
	maximumEvaluationCapabilityEffectProviderJournalCleanupBytes      = 131_072
	maximumEvaluationCapabilityEffectProviderJournalZeroResidualBytes = 16_384
)

type evaluationCapabilityEffectProviderJournalCleanupRequest struct {
	NamespaceID      string
	PlanDigest       string
	RepositoryCommit string
	AttemptID        string
	Reason           string
	RequestedAt      time.Time
	RequestDigest    string
	Value            map[string]any
	Bytes            []byte
}

type evaluationCapabilityEffectProviderJournalSummary struct {
	ResidualEncryptedSpoolCount int64
	ExpiredEncryptedSpoolCount  int64
	UnfinishedOwnerCount        int64
	OverdueUnfinishedOwnerCount int64
	AbandonedOwnerCount         int64
}

type evaluationCapabilityEffectProviderJournalAttemptSummary struct {
	ResidualEncryptedSpoolCount int64
	UnfinishedOwnerCount        int64
	AbandonedSpoolCount         int64
	AbandonedOwnerCount         int64
}

type evaluationCapabilityEffectProviderJournalCleanupReceipt struct {
	RequestDigest                        string
	DestroyedEncryptedSpoolCount         int64
	AbandonmentDispositionReceiptDigests []string
	AbandonmentRecordDigests             []string
	CompletedAt                          time.Time
	ReceiptDigest                        string
	Value                                map[string]any
	Bytes                                []byte
}

func evaluationCapabilityEffectProviderJournalInstant(value time.Time) string {
	return value.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000Z")
}

func evaluationCapabilityEffectProviderJournalAuthority() (map[string]any, string, error) {
	_, _, retentionPolicyDigest, err := evaluationCapabilityEffectProviderSpoolDigests()
	if err != nil {
		return nil, "", err
	}
	base := map[string]any{
		"format":                           "prodivix.agent-evaluation-capability-effect-provider-journal-authority",
		"version":                          int64(1),
		"authorityId":                      evaluationCapabilityEffectProviderJournalAuthorityID,
		"purpose":                          evaluationCapabilityEffectProviderJournalPurpose,
		"routeSegment":                     evaluationCapabilityEffectProviderJournalRouteSegment,
		"maximumOwnerRequests":             int64(maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords),
		"maximumExecutionsPerOwnerRequest": int64(maximumEvaluationCapabilityEffectProviderJournalOwnerExecutions),
		"retentionPolicyDigest":            retentionPolicyDigest,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, "", err
	}
	value := cloneEvaluationObject(base)
	value["authorityDigest"] = digest
	return value, digest, nil
}

func decodeEvaluationCapabilityEffectProviderJournalCleanupRequest(
	source []byte,
) (evaluationCapabilityEffectProviderJournalCleanupRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalCleanupBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId",
		"reason", "requestedAt", "requestDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderJournalCleanupRequestFormat ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "requestDigest") {
		return evaluationCapabilityEffectProviderJournalCleanupRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	requestedAt, requestedErr := evaluationInstant(value["requestedAt"], "capability effect Provider journal cleanup request")
	request := evaluationCapabilityEffectProviderJournalCleanupRequest{
		NamespaceID: stringMember(value, "namespaceId"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), AttemptID: stringMember(value, "attemptId"),
		Reason: stringMember(value, "reason"), RequestedAt: requestedAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Bytes: canonical,
	}
	if !versionOK || version != 1 || requestedErr != nil ||
		!validEvaluationAgentControlIdentity(request.NamespaceID) ||
		!evaluationDigestPattern.MatchString(request.PlanDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(request.RepositoryCommit) ||
		!validEvaluationAgentControlIdentity(request.AttemptID) ||
		!oneOfString(request.Reason, "attempt-terminal", "cleanup-requested", "stage-expired") {
		return evaluationCapabilityEffectProviderJournalCleanupRequest{}, ErrConflict
	}
	return request, nil
}

func createEvaluationCapabilityEffectProviderJournalCleanupReceipt(
	request evaluationCapabilityEffectProviderJournalCleanupRequest,
	dispositionDigests []string,
	abandonmentDigests []string,
	completedAt time.Time,
) (evaluationCapabilityEffectProviderJournalCleanupReceipt, error) {
	dispositionDigests = append([]string(nil), dispositionDigests...)
	abandonmentDigests = append([]string(nil), abandonmentDigests...)
	sort.Strings(dispositionDigests)
	sort.Strings(abandonmentDigests)
	if completedAt.Before(request.RequestedAt) || len(dispositionDigests) > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords*maximumEvaluationCapabilityEffectProviderJournalOwnerExecutions ||
		len(abandonmentDigests) > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, ErrConflict
	}
	base := map[string]any{
		"format":                               evaluationCapabilityEffectProviderJournalCleanupReceiptFormat,
		"version":                              int64(1),
		"requestDigest":                        request.RequestDigest,
		"destroyedEncryptedSpoolCount":         int64(len(dispositionDigests)),
		"abandonmentDispositionReceiptDigests": dispositionDigests,
		"abandonmentRecordDigests":             abandonmentDigests,
		"residualEncryptedSpoolCount":          int64(0),
		"unfinishedOwnerCount":                 int64(0),
		"completedAt":                          evaluationCapabilityEffectProviderJournalInstant(completedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, err
	}
	value := cloneEvaluationObject(base)
	value["receiptDigest"] = digest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationCapabilityEffectProviderJournalCleanupBytes {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, ErrConflict
	}
	return evaluationCapabilityEffectProviderJournalCleanupReceipt{
		RequestDigest: request.RequestDigest, DestroyedEncryptedSpoolCount: int64(len(dispositionDigests)),
		AbandonmentDispositionReceiptDigests: dispositionDigests, AbandonmentRecordDigests: abandonmentDigests,
		CompletedAt: completedAt.UTC().Truncate(time.Millisecond), ReceiptDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

func createEvaluationCapabilityEffectProviderJournalHealth(
	ownerInstanceID string,
	summary evaluationCapabilityEffectProviderJournalSummary,
	checkedAt time.Time,
) (map[string]any, []byte, error) {
	_, authorityDigest, err := evaluationCapabilityEffectProviderJournalAuthority()
	if err != nil {
		return nil, nil, err
	}
	_, _, retentionPolicyDigest, err := evaluationCapabilityEffectProviderSpoolDigests()
	if err != nil || !validEvaluationAgentControlIdentity(ownerInstanceID) || summary.ResidualEncryptedSpoolCount < 0 ||
		summary.ExpiredEncryptedSpoolCount < 0 || summary.ExpiredEncryptedSpoolCount > summary.ResidualEncryptedSpoolCount ||
		summary.UnfinishedOwnerCount < 0 || summary.UnfinishedOwnerCount > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords ||
		summary.OverdueUnfinishedOwnerCount < 0 || summary.OverdueUnfinishedOwnerCount > summary.UnfinishedOwnerCount ||
		summary.AbandonedOwnerCount < 0 || summary.AbandonedOwnerCount > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords {
		return nil, nil, ErrConflict
	}
	status := "healthy"
	if summary.ExpiredEncryptedSpoolCount != 0 || summary.OverdueUnfinishedOwnerCount != 0 {
		status = "unavailable"
	}
	checkedAt = checkedAt.UTC().Truncate(time.Millisecond)
	base := map[string]any{
		"format": evaluationCapabilityEffectProviderJournalHealthFormat, "version": int64(1),
		"authorityId": evaluationCapabilityEffectProviderJournalAuthorityID, "authorityDigest": authorityDigest,
		"ownerInstanceId": ownerInstanceID, "retentionPolicyDigest": retentionPolicyDigest, "status": status,
		"residualEncryptedSpoolCount": summary.ResidualEncryptedSpoolCount,
		"expiredEncryptedSpoolCount":  summary.ExpiredEncryptedSpoolCount,
		"unfinishedOwnerCount":        summary.UnfinishedOwnerCount,
		"overdueUnfinishedOwnerCount": summary.OverdueUnfinishedOwnerCount,
		"abandonedOwnerCount":         summary.AbandonedOwnerCount,
		"checkedAt":                   evaluationCapabilityEffectProviderJournalInstant(checkedAt),
		"expiresAt":                   evaluationCapabilityEffectProviderJournalInstant(checkedAt.Add(maximumEvaluationCapabilityEffectProviderSpoolLifetime)),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, nil, err
	}
	value := cloneEvaluationObject(base)
	value["healthDigest"] = digest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationCapabilityEffectProviderJournalHealthBytes {
		return nil, nil, ErrConflict
	}
	return value, canonical, nil
}

func createEvaluationCapabilityEffectProviderJournalZeroResidual(
	partition EvaluationPlanPartition,
	namespaceID string,
	attemptID string,
	summary evaluationCapabilityEffectProviderJournalAttemptSummary,
	checkedAt time.Time,
) (map[string]any, []byte, error) {
	_, authorityDigest, err := evaluationCapabilityEffectProviderJournalAuthority()
	if err != nil || summary.ResidualEncryptedSpoolCount != 0 || summary.UnfinishedOwnerCount != 0 ||
		summary.AbandonedSpoolCount < 0 || summary.AbandonedOwnerCount < 0 ||
		summary.AbandonedSpoolCount > maximumEvaluationCapabilityEffectProviderJournalOwnerExecutions*summary.AbandonedOwnerCount {
		return nil, nil, ErrConflict
	}
	checkedAt = checkedAt.UTC().Truncate(time.Millisecond)
	base := map[string]any{
		"format": evaluationCapabilityEffectProviderJournalZeroResidualFormat, "version": int64(1),
		"namespaceId": namespaceID, "planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId": attemptID, "journalAuthorityDigest": authorityDigest,
		"residualEncryptedSpoolCount": int64(0), "unfinishedOwnerCount": int64(0),
		"abandonedSpoolCount": summary.AbandonedSpoolCount, "abandonedOwnerCount": summary.AbandonedOwnerCount,
		"checkedAt": evaluationCapabilityEffectProviderJournalInstant(checkedAt),
		"expiresAt": evaluationCapabilityEffectProviderJournalInstant(checkedAt.Add(maximumEvaluationCapabilityEffectProviderSpoolLifetime)),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, nil, err
	}
	value := cloneEvaluationObject(base)
	value["receiptDigest"] = digest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationCapabilityEffectProviderJournalZeroResidualBytes {
		return nil, nil, ErrConflict
	}
	return value, canonical, nil
}
