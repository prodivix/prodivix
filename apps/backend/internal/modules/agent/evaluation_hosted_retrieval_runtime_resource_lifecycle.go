package agent

import (
	"bytes"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequestFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-fence-derive-request"
	evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-fence-derive-receipt"
	evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequestFormat       = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-post-matrix-cleanup-claim-request"
	evaluationHostedRetrievalRuntimeResourceRecoveryCursorFormat               = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-cursor"
	evaluationHostedRetrievalRuntimeResourceRecoveryScanRequestFormat          = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-scan-request"
	evaluationHostedRetrievalRuntimeResourceRecoveryCandidateFormat            = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-candidate"
	evaluationHostedRetrievalRuntimeResourceRecoveryPageFormat                 = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-page"
	evaluationHostedRetrievalRuntimeResourceRecoveryClaimRequestFormat         = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-request"
	evaluationHostedRetrievalRuntimeResourceRecoveryClaimReceiptFormat         = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-receipt"
	evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequestFormat     = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-result-read-request"
	evaluationHostedRetrievalRuntimeResourceCleanupResultReadReceiptFormat     = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-result-read-receipt"
	evaluationHostedRetrievalRuntimeResourceRecoveryClaimTransitionFormat      = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-state-transition"
	evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptMaxBytes = 32_768
	evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequestMaxBytes     = 49_152
	evaluationHostedRetrievalRuntimeResourceRecoveryPageMaxBytes               = 65_536
	evaluationHostedRetrievalRuntimeResourceRecoveryClaimReceiptMaxBytes       = 196_608
	evaluationHostedRetrievalRuntimeResourceCleanupResultReadReceiptMaxBytes   = 245_760
	evaluationHostedRetrievalRuntimeResourceRecoveryPageMaximum                = 64
)

var evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequestKeys = []string{
	"format", "version", "namespaceId", "purpose", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "resourceSetCommitmentDigest",
	"expectedShardCount", "expectedShardIdSetDigest", "requestedAt", "requestDigest",
}

var evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptKeys = []string{
	"format", "version", "requestDigest", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "resourceSetCommitmentDigest", "expectedShardCount",
	"expectedShardIdSetDigest", "runTerminalFence", "runTerminalFenceDigest", "checkedAt", "expiresAt", "receiptDigest",
}

type evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	ResourceSetCommitmentDigest    string
	ExpectedShardCount             int64
	ExpectedShardIDSetDigest       string
	RequestedAt                    time.Time
	RequestDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

type evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt struct {
	RequestDigest                  string
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	ResourceSetCommitmentDigest    string
	ExpectedShardCount             int64
	ExpectedShardIDSetDigest       string
	RunTerminalFenceDigest         string
	CheckedAt                      time.Time
	ExpiresAt                      time.Time
	ReceiptDigest                  string
	RunTerminalFence               map[string]any
	Value                          map[string]any
	Canonical                      []byte
}

type evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	AuthorityDigest                string
	ResourceSetCommitmentDigest    string
	TerminalFenceDeriveReceipt     evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt
	CleanupOwnerInstanceID         string
	ClaimedAt                      time.Time
	MinimumClaimExpiresAt          time.Time
	RequestDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

type evaluationHostedRetrievalRuntimeResourceRecoveryCursor struct {
	ScanLedgerRevision   int64
	AfterEligibleAt      time.Time
	AfterAuthorityDigest string
	CursorDigest         string
	Value                map[string]any
}

type evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest struct {
	NamespaceID   string
	PageSize      int64
	Cursor        *evaluationHostedRetrievalRuntimeResourceRecoveryCursor
	RequestedAt   time.Time
	RequestDigest string
	Value         map[string]any
	Canonical     []byte
}

type evaluationHostedRetrievalRuntimeResourceRecoveryCandidate struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	AuthorityDigest                string
	ResourceSetCommitmentDigest    string
	ActiveStateDigest              string
	ReadLeaseLedgerRootDigest      string
	StoredRunTerminalFenceDigest   string
	ResourceExpiresAt              time.Time
	EligibleAt                     time.Time
	Disposition                    string
	CandidateDigest                string
	Value                          map[string]any
}

type evaluationHostedRetrievalRuntimeResourceRecoveryClaimRequest struct {
	NamespaceID               string
	RecoveryPageDigest        string
	Candidate                 evaluationHostedRetrievalRuntimeResourceRecoveryCandidate
	ExpectedActiveStateDigest string
	CleanupOwnerInstanceID    string
	ClaimedAt                 time.Time
	RequestDigest             string
	Value                     map[string]any
	Canonical                 []byte
}

type evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest struct {
	NamespaceID                string
	Purpose                    string
	AuthorityDigest            string
	CleanupRequestDigest       string
	RecoveryClaimReceiptDigest string
	RequestedAt                time.Time
	RequestDigest              string
	Value                      map[string]any
	Canonical                  []byte
}

type evaluationHostedRetrievalRuntimeResourceCleanupReceipt struct {
	PlanDigest                         string
	RunConfigArtifactBindingDigest     string
	RuntimeResourceSetID               string
	AuthorityDigest                    string
	CleanupRequestDigest               string
	CleanupClaimAuthorityReceiptDigest string
	CleanupOwnerInstanceID             string
	ClaimGeneration                    int64
	CompletedAt                        time.Time
	CleanupReceiptDigest               string
	Value                              map[string]any
	Canonical                          []byte
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleObject(source []byte, maximumBytes int) (map[string]any, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumBytes)
	if err != nil || agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return nil, ErrInvalid
	}
	return value, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest, error) {
	value, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceTerminalFencePurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest{}, ErrInvalid
	}
	requestedAt, err := evaluationInstant(value["requestedAt"], "requestedAt")
	expectedShardCount, countOK := integerMember(value, "expectedShardCount")
	result := evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest{
		NamespaceID: stringMember(value, "namespaceId"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		PlanDigest: stringMember(value, "planDigest"), FrozenRunDigest: stringMember(value, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID:           stringMember(value, "runtimeResourceSetId"),
		ResourceSetCommitmentDigest:    stringMember(value, "resourceSetCommitmentDigest"),
		ExpectedShardCount:             expectedShardCount, ExpectedShardIDSetDigest: stringMember(value, "expectedShardIdSetDigest"),
		RequestedAt: requestedAt, RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if err != nil || !countOK || expectedShardCount < 1 || expectedShardCount > 1_024 ||
		!validEvaluationAgentControlIdentity(result.NamespaceID) || !validEvaluationAgentControlIdentity(result.RuntimeResourceSetID) ||
		!evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!evaluationHostedArchiveDigestMembers(value, "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
			"resourceSetCommitmentDigest", "expectedShardIdSetDigest", "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptValue(
	value map[string]any,
) (evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt, error) {
	fence, fenceOK := objectMember(value, "runTerminalFence")
	expectedShardCount, countOK := integerMember(value, "expectedShardCount")
	checkedAt, checkedErr := evaluationInstant(value["checkedAt"], "checkedAt")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "expiresAt")
	if !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		!fenceOK || validateEvaluationHostedArchiveSelfDigest(fence, evaluationHostedTerminalFenceKeys,
		evaluationHostedRetrievalRuntimeResourceTerminalFenceFormat, "fenceDigest") != nil ||
		!countOK || expectedShardCount < 1 || expectedShardCount > 1_024 || checkedErr != nil || expiresErr != nil ||
		!expiresAt.After(checkedAt) || expiresAt.Sub(checkedAt) > 125*time.Second ||
		stringMember(value, "runTerminalFenceDigest") != stringMember(fence, "fenceDigest") ||
		stringMember(fence, "namespaceId") != stringMember(value, "namespaceId") ||
		stringMember(fence, "repositoryCommit") != stringMember(value, "repositoryCommit") ||
		stringMember(fence, "planDigest") != stringMember(value, "planDigest") ||
		stringMember(fence, "frozenRunDigest") != stringMember(value, "frozenRunDigest") ||
		stringMember(fence, "runConfigArtifactBindingDigest") != stringMember(value, "runConfigArtifactBindingDigest") ||
		stringMember(fence, "runtimeResourceSetId") != stringMember(value, "runtimeResourceSetId") ||
		integerMemberOrZero(fence, "expectedShardCount") != expectedShardCount ||
		stringMember(fence, "terminalShardIdSetDigest") != stringMember(value, "expectedShardIdSetDigest") ||
		!evaluationHostedArchiveSafe(value, evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptMaxBytes) {
		return evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt{}, ErrInvalid
	}
	result := evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt{
		RequestDigest: stringMember(value, "requestDigest"), NamespaceID: stringMember(value, "namespaceId"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), PlanDigest: stringMember(value, "planDigest"),
		FrozenRunDigest: stringMember(value, "frozenRunDigest"), RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID: stringMember(value, "runtimeResourceSetId"), ResourceSetCommitmentDigest: stringMember(value, "resourceSetCommitmentDigest"),
		ExpectedShardCount: expectedShardCount, ExpectedShardIDSetDigest: stringMember(value, "expectedShardIdSetDigest"),
		RunTerminalFenceDigest: stringMember(value, "runTerminalFenceDigest"), CheckedAt: checkedAt, ExpiresAt: expiresAt,
		ReceiptDigest: stringMember(value, "receiptDigest"), RunTerminalFence: fence, Value: value,
	}
	if !validEvaluationAgentControlIdentity(result.NamespaceID) || !validEvaluationAgentControlIdentity(result.RuntimeResourceSetID) ||
		!evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) || !evaluationHostedArchiveDigestMembers(value,
		"requestDigest", "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "resourceSetCommitmentDigest",
		"expectedShardIdSetDigest", "runTerminalFenceDigest", "receiptDigest") {
		return evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt{}, ErrInvalid
	}
	return result, nil
}

func integerMemberOrZero(value map[string]any, key string) int64 {
	result, _ := integerMember(value, key)
	return result
}

func decodeEvaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest, error) {
	value, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleObject(source, evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequestMaxBytes)
	keys := []string{"format", "version", "namespaceId", "purpose", "repositoryCommit", "planDigest", "frozenRunDigest",
		"runConfigArtifactBindingDigest", "runtimeResourceSetId", "authorityDigest", "resourceSetCommitmentDigest",
		"terminalFenceDeriveReceipt", "terminalFenceDeriveReceiptDigest", "cleanupOwnerInstanceId", "claimedAt",
		"minimumClaimExpiresAt", "requestDigest"}
	receiptValue, receiptOK := objectMember(value, "terminalFenceDeriveReceipt")
	receipt, receiptErr := decodeEvaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptValue(receiptValue)
	claimedAt, claimedErr := evaluationInstant(value["claimedAt"], "claimedAt")
	minimumExpiresAt, minimumErr := evaluationInstant(value["minimumClaimExpiresAt"], "minimumClaimExpiresAt")
	if err != nil || !exactEvaluationKeys(value, keys) || stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupClaimPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") || !receiptOK || receiptErr != nil ||
		stringMember(value, "terminalFenceDeriveReceiptDigest") != receipt.ReceiptDigest || claimedErr != nil || minimumErr != nil ||
		claimedAt.Before(receipt.CheckedAt) || !claimedAt.Before(receipt.ExpiresAt) || !minimumExpiresAt.After(claimedAt) ||
		minimumExpiresAt.Sub(claimedAt) > 15*time.Minute {
		return evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest{}, ErrInvalid
	}
	result := evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest{
		NamespaceID: stringMember(value, "namespaceId"), RepositoryCommit: stringMember(value, "repositoryCommit"), PlanDigest: stringMember(value, "planDigest"),
		FrozenRunDigest: stringMember(value, "frozenRunDigest"), RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID: stringMember(value, "runtimeResourceSetId"), AuthorityDigest: stringMember(value, "authorityDigest"),
		ResourceSetCommitmentDigest: stringMember(value, "resourceSetCommitmentDigest"), TerminalFenceDeriveReceipt: receipt,
		CleanupOwnerInstanceID: stringMember(value, "cleanupOwnerInstanceId"), ClaimedAt: claimedAt, MinimumClaimExpiresAt: minimumExpiresAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if !validEvaluationAgentControlIdentity(result.NamespaceID) || !validEvaluationAgentControlIdentity(result.RuntimeResourceSetID) ||
		!validEvaluationAgentControlIdentity(result.CleanupOwnerInstanceID) || !evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!evaluationHostedArchiveDigestMembers(value, "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "authorityDigest",
			"resourceSetCommitmentDigest", "terminalFenceDeriveReceiptDigest", "requestDigest") ||
		result.NamespaceID != receipt.NamespaceID || result.RepositoryCommit != receipt.RepositoryCommit || result.PlanDigest != receipt.PlanDigest ||
		result.FrozenRunDigest != receipt.FrozenRunDigest || result.RunConfigArtifactBindingDigest != receipt.RunConfigArtifactBindingDigest ||
		result.RuntimeResourceSetID != receipt.RuntimeResourceSetID || result.ResourceSetCommitmentDigest != receipt.ResourceSetCommitmentDigest {
		return evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCursorValue(
	value map[string]any,
) (evaluationHostedRetrievalRuntimeResourceRecoveryCursor, error) {
	keys := []string{"format", "version", "scanLedgerRevision", "afterEligibleAt", "afterAuthorityDigest", "cursorDigest"}
	revision, revisionOK := integerMember(value, "scanLedgerRevision")
	afterEligibleAt, instantErr := evaluationInstant(value["afterEligibleAt"], "afterEligibleAt")
	if !exactEvaluationKeys(value, keys) || stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceRecoveryCursorFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "cursorDigest") ||
		!revisionOK || revision < 1 || instantErr != nil || !evaluationHostedArchiveDigestMembers(value, "afterAuthorityDigest", "cursorDigest") {
		return evaluationHostedRetrievalRuntimeResourceRecoveryCursor{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceRecoveryCursor{
		ScanLedgerRevision: revision, AfterEligibleAt: afterEligibleAt,
		AfterAuthorityDigest: stringMember(value, "afterAuthorityDigest"), CursorDigest: stringMember(value, "cursorDigest"), Value: value,
	}, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceRecoveryScanRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest, error) {
	value, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	keys := []string{"format", "version", "namespaceId", "purpose", "pageSize", "cursor", "requestedAt", "requestDigest"}
	pageSize, pageSizeOK := integerMember(value, "pageSize")
	requestedAt, instantErr := evaluationInstant(value["requestedAt"], "requestedAt")
	if err != nil || !exactEvaluationKeys(value, keys) || stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceRecoveryScanRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceRecoveryListPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") || !pageSizeOK || pageSize < 1 ||
		pageSize > evaluationHostedRetrievalRuntimeResourceRecoveryPageMaximum || instantErr != nil ||
		!validEvaluationAgentControlIdentity(stringMember(value, "namespaceId")) {
		return evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest{}, ErrInvalid
	}
	var cursor *evaluationHostedRetrievalRuntimeResourceRecoveryCursor
	if value["cursor"] != nil {
		cursorValue, ok := value["cursor"].(map[string]any)
		if !ok {
			return evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest{}, ErrInvalid
		}
		decoded, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCursorValue(cursorValue)
		if err != nil {
			return evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest{}, err
		}
		cursor = &decoded
	}
	return evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest{
		NamespaceID: stringMember(value, "namespaceId"), PageSize: pageSize, Cursor: cursor, RequestedAt: requestedAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCandidateValue(
	value map[string]any,
) (evaluationHostedRetrievalRuntimeResourceRecoveryCandidate, error) {
	keys := []string{
		"format", "version", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
		"runtimeResourceSetId", "authorityDigest", "resourceSetCommitmentDigest", "activeStateDigest", "readLeaseLedgerRootDigest",
		"storedRunTerminalFenceDigest", "resourceExpiresAt", "eligibleAt", "disposition", "candidateDigest",
	}
	resourceExpiresAt, resourceErr := evaluationInstant(value["resourceExpiresAt"], "resourceExpiresAt")
	eligibleAt, eligibleErr := evaluationInstant(value["eligibleAt"], "eligibleAt")
	result := evaluationHostedRetrievalRuntimeResourceRecoveryCandidate{
		NamespaceID: stringMember(value, "namespaceId"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		PlanDigest: stringMember(value, "planDigest"), FrozenRunDigest: stringMember(value, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"), RuntimeResourceSetID: stringMember(value, "runtimeResourceSetId"),
		AuthorityDigest: stringMember(value, "authorityDigest"), ResourceSetCommitmentDigest: stringMember(value, "resourceSetCommitmentDigest"),
		ActiveStateDigest: stringMember(value, "activeStateDigest"), ReadLeaseLedgerRootDigest: stringMember(value, "readLeaseLedgerRootDigest"),
		StoredRunTerminalFenceDigest: stringMember(value, "storedRunTerminalFenceDigest"), ResourceExpiresAt: resourceExpiresAt,
		EligibleAt: eligibleAt, Disposition: stringMember(value, "disposition"), CandidateDigest: stringMember(value, "candidateDigest"), Value: value,
	}
	if !exactEvaluationKeys(value, keys) || stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceRecoveryCandidateFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "candidateDigest") ||
		resourceErr != nil || eligibleErr != nil || !validEvaluationAgentControlIdentity(result.NamespaceID) ||
		!validEvaluationAgentControlIdentity(result.RuntimeResourceSetID) || !evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!oneOfString(result.Disposition, "cleanup-incomplete", "resource-expired", "run-terminal") ||
		!evaluationHostedArchiveDigestMembers(value, "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "authorityDigest",
			"resourceSetCommitmentDigest", "activeStateDigest", "readLeaseLedgerRootDigest", "storedRunTerminalFenceDigest", "candidateDigest") {
		return evaluationHostedRetrievalRuntimeResourceRecoveryCandidate{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceRecoveryPageValue(
	value map[string]any,
) (map[string]any, []evaluationHostedRetrievalRuntimeResourceRecoveryCandidate, error) {
	keys := []string{"format", "version", "requestDigest", "recoveryAuthorityIssuerId", "recoveryAuthorityImplementationDigest",
		"scanLedgerRevision", "candidates", "candidateSetDigest", "nextCursor", "scannedAt", "pageDigest"}
	revision, revisionOK := integerMember(value, "scanLedgerRevision")
	scannedAt, instantErr := evaluationInstant(value["scannedAt"], "scannedAt")
	rawCandidates, candidatesOK := arrayMember(value, "candidates")
	if !exactEvaluationKeys(value, keys) || stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceRecoveryPageFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "pageDigest") ||
		!revisionOK || revision < 1 || instantErr != nil || !candidatesOK || len(rawCandidates) > evaluationHostedRetrievalRuntimeResourceRecoveryPageMaximum ||
		!validEvaluationAgentControlIdentity(stringMember(value, "recoveryAuthorityIssuerId")) ||
		!evaluationHostedArchiveDigestMembers(value, "requestDigest", "recoveryAuthorityImplementationDigest", "candidateSetDigest", "pageDigest") ||
		!evaluationHostedArchiveSafe(value, evaluationHostedRetrievalRuntimeResourceRecoveryPageMaxBytes) {
		return nil, nil, ErrInvalid
	}
	candidates := make([]evaluationHostedRetrievalRuntimeResourceRecoveryCandidate, len(rawCandidates))
	digests := make([]any, len(rawCandidates))
	previousKey := ""
	for index, raw := range rawCandidates {
		candidateValue, ok := raw.(map[string]any)
		if !ok {
			return nil, nil, ErrInvalid
		}
		candidate, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCandidateValue(candidateValue)
		if err != nil {
			return nil, nil, err
		}
		keyBytes, err := canonicaljson.Bytes([]any{evaluationExportInstant(candidate.EligibleAt), candidate.AuthorityDigest})
		if err != nil || (index > 0 && bytes.Compare([]byte(previousKey), keyBytes) >= 0) {
			return nil, nil, ErrInvalid
		}
		previousKey = string(keyBytes)
		candidates[index] = candidate
		digests[index] = candidate.CandidateDigest
	}
	expectedSetDigest, err := canonicaljson.Digest(digests)
	if err != nil || expectedSetDigest != stringMember(value, "candidateSetDigest") {
		return nil, nil, ErrInvalid
	}
	if value["nextCursor"] != nil {
		cursorValue, ok := value["nextCursor"].(map[string]any)
		if !ok {
			return nil, nil, ErrInvalid
		}
		cursor, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCursorValue(cursorValue)
		if err != nil || cursor.ScanLedgerRevision != revision {
			return nil, nil, ErrInvalid
		}
	}
	_ = scannedAt
	return value, candidates, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceRecoveryClaimRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceRecoveryClaimRequest, error) {
	value, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	keys := []string{"format", "version", "namespaceId", "purpose", "recoveryPageDigest", "candidate", "candidateDigest",
		"expectedActiveStateDigest", "cleanupOwnerInstanceId", "claimedAt", "requestDigest"}
	candidateValue, candidateOK := objectMember(value, "candidate")
	candidate, candidateErr := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCandidateValue(candidateValue)
	claimedAt, instantErr := evaluationInstant(value["claimedAt"], "claimedAt")
	result := evaluationHostedRetrievalRuntimeResourceRecoveryClaimRequest{
		NamespaceID: stringMember(value, "namespaceId"), RecoveryPageDigest: stringMember(value, "recoveryPageDigest"), Candidate: candidate,
		ExpectedActiveStateDigest: stringMember(value, "expectedActiveStateDigest"), CleanupOwnerInstanceID: stringMember(value, "cleanupOwnerInstanceId"),
		ClaimedAt: claimedAt, RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if err != nil || !exactEvaluationKeys(value, keys) || stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceRecoveryClaimRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceRecoveryCleanupClaimPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") || !candidateOK || candidateErr != nil || instantErr != nil ||
		result.NamespaceID != candidate.NamespaceID || stringMember(value, "candidateDigest") != candidate.CandidateDigest ||
		result.ExpectedActiveStateDigest != candidate.ActiveStateDigest || !validEvaluationAgentControlIdentity(result.NamespaceID) ||
		!validEvaluationAgentControlIdentity(result.CleanupOwnerInstanceID) || !evaluationHostedArchiveDigestMembers(value,
		"recoveryPageDigest", "candidateDigest", "expectedActiveStateDigest", "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceRecoveryClaimRequest{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest, error) {
	value, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	keys := []string{"format", "version", "namespaceId", "purpose", "authorityDigest", "cleanupRequestDigest",
		"recoveryClaimReceiptDigest", "requestedAt", "requestDigest"}
	requestedAt, instantErr := evaluationInstant(value["requestedAt"], "requestedAt")
	result := evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest{
		NamespaceID: stringMember(value, "namespaceId"), Purpose: stringMember(value, "purpose"), AuthorityDigest: stringMember(value, "authorityDigest"),
		CleanupRequestDigest: stringMember(value, "cleanupRequestDigest"), RecoveryClaimReceiptDigest: stringMember(value, "recoveryClaimReceiptDigest"),
		RequestedAt: requestedAt, RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if err != nil || !exactEvaluationKeys(value, keys) || stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") || instantErr != nil ||
		!validEvaluationAgentControlIdentity(result.NamespaceID) || !oneOfString(result.Purpose,
		evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupResultReadPurpose,
		evaluationHostedRetrievalRuntimeResourceRecoveryCleanupResultReadPurpose) ||
		!evaluationHostedArchiveDigestMembers(value, "authorityDigest", "cleanupRequestDigest", "recoveryClaimReceiptDigest", "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceCleanupReceipt(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceCleanupReceipt, error) {
	value, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleObject(source, maximumEvaluationHostedRetrievalRuntimeResourceCleanupReceiptBytes)
	claimGeneration, generationOK := integerMember(value, "claimGeneration")
	completedAt, instantErr := evaluationInstant(value["completedAt"], "completedAt")
	result := evaluationHostedRetrievalRuntimeResourceCleanupReceipt{
		PlanDigest: stringMember(value, "planDigest"), RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID: stringMember(value, "runtimeResourceSetId"), AuthorityDigest: stringMember(value, "authorityDigest"),
		CleanupRequestDigest: stringMember(value, "cleanupRequestDigest"), CleanupClaimAuthorityReceiptDigest: stringMember(value, "cleanupClaimAuthorityReceiptDigest"),
		CleanupOwnerInstanceID: stringMember(value, "cleanupOwnerInstanceId"), ClaimGeneration: claimGeneration, CompletedAt: completedAt,
		CleanupReceiptDigest: stringMember(value, "cleanupReceiptDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if err != nil || validateEvaluationHostedArchiveSelfDigest(value, evaluationHostedCleanupReceiptKeys,
		evaluationHostedRetrievalRuntimeResourceCleanupReceiptFormat, "cleanupReceiptDigest") != nil ||
		!generationOK || claimGeneration < 1 || instantErr != nil || !validEvaluationAgentControlIdentity(result.RuntimeResourceSetID) ||
		!validEvaluationAgentControlIdentity(result.CleanupOwnerInstanceID) || !evaluationHostedArchiveDigestMembers(value,
		"cleanupRequestDigest", "planDigest", "runConfigArtifactBindingDigest", "authorityDigest", "resourceSetCommitmentDigest",
		"readLeaseLedgerRootDigest", "cleanupClaimAuthorityReceiptDigest", "deletionAuthorityReceiptDigest", "runTerminalFenceDigest",
		"priorActiveStateDigest", "resourceResultSetDigest", "terminalStateDigest", "cleanupReceiptDigest") {
		return evaluationHostedRetrievalRuntimeResourceCleanupReceipt{}, ErrInvalid
	}
	residual, ok := value["residualProviderResourceIds"].([]any)
	if !ok || len(residual) != 0 || stringMember(value, "terminalLifecycle") != "cleaned" {
		return evaluationHostedRetrievalRuntimeResourceCleanupReceipt{}, ErrInvalid
	}
	return result, nil
}

func createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(base map[string]any, digestKey string) (map[string]any, []byte, error) {
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, nil, err
	}
	value := cloneEvaluationObject(base)
	value[digestKey] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		return nil, nil, err
	}
	return value, encoded, nil
}

func sortedEvaluationHostedRetrievalRuntimeResourceStrings(values []string) []string {
	result := append([]string(nil), values...)
	sort.Slice(result, func(left, right int) bool { return bytes.Compare([]byte(result[left]), []byte(result[right])) < 0 })
	return result
}
