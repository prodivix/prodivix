package agent

import (
	"bytes"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationNativeProviderStateVaultRecoveryPurpose = "native-provider-state-vault-recovery-owner"

	evaluationNativeProviderStateVaultRecoveryRequestFormat             = "prodivix.agent-evaluation-native-provider-state-vault-recovery-request"
	evaluationNativeProviderStateVaultRecoveryReceiptFormat             = "prodivix.agent-evaluation-native-provider-state-vault-recovery-receipt"
	evaluationNativeProviderStateVaultRecoveryZeroResidualReceiptFormat = "prodivix.agent-evaluation-native-provider-state-vault-recovery-zero-residual-receipt"
	evaluationNativeProviderStateVaultRecoveryHealthFormat              = "prodivix.agent-evaluation-native-provider-state-vault-recovery-health"
	evaluationNativeProviderStateVaultRecoveryTerminalRecordSetFormat   = "prodivix.agent-evaluation-native-provider-state-vault-recovery-terminal-record-set"

	evaluationNativeProviderStateVaultRecoveryReason = "owner-crash-recovery"
)

type evaluationNativeProviderStateVaultRecoveryRequest struct {
	NamespaceID           string
	Partition             EvaluationPlanPartition
	OwnerInstanceID       string
	AuthorityDigest       string
	Reason                string
	RequestedAt           time.Time
	RecoveryRequestDigest string
	Value                 map[string]any
	Bytes                 []byte
}

func decodeEvaluationNativeProviderStateVaultRecoveryRequest(
	source []byte,
) (evaluationNativeProviderStateVaultRecoveryRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "vaultOwnerInstanceId",
		"authorityDigest", "reason", "requestedAt", "recoveryRequestDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultRecoveryRequestFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	requestedAt, timeErr := evaluationInstant(value["requestedAt"], "state vault recovery requestedAt")
	if !versionOK || version != evaluationNativeProviderStateVaultVersion || timeErr != nil ||
		!validEvaluationServiceIdentity(stringMember(value, "namespaceId")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "planDigest")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "vaultOwnerInstanceId")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "authorityDigest")) ||
		stringMember(value, "reason") != evaluationNativeProviderStateVaultRecoveryReason ||
		!evaluationCanonicalObjectDigest(value, "recoveryRequestDigest") {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, ErrInvalid
	}
	return evaluationNativeProviderStateVaultRecoveryRequest{
		NamespaceID: stringMember(value, "namespaceId"),
		Partition: EvaluationPlanPartition{
			PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		},
		OwnerInstanceID: stringMember(value, "vaultOwnerInstanceId"),
		AuthorityDigest: stringMember(value, "authorityDigest"), Reason: stringMember(value, "reason"),
		RequestedAt: requestedAt, RecoveryRequestDigest: stringMember(value, "recoveryRequestDigest"),
		Value: value, Bytes: canonical,
	}, nil
}

type evaluationNativeProviderStateVaultRecoveryDisposition struct {
	OpaqueProviderStateRef string
	SealRequestDigest      string
	RetireRequest          *evaluationNativeProviderStateVaultRetireRequest
	RetirementReceipt      *evaluationNativeProviderStateVaultRetirementReceipt
	ForcedExpiryTombstone  *evaluationNativeProviderStateVaultForcedExpiryTombstone
}

func (disposition evaluationNativeProviderStateVaultRecoveryDisposition) terminalValue() (map[string]any, error) {
	if !validEvaluationAgentControlIdentity(disposition.OpaqueProviderStateRef) ||
		!evaluationDigestPattern.MatchString(disposition.SealRequestDigest) {
		return nil, ErrInvalid
	}
	if disposition.RetireRequest != nil && disposition.RetirementReceipt != nil && disposition.ForcedExpiryTombstone == nil {
		return map[string]any{
			"opaqueProviderStateRef": disposition.OpaqueProviderStateRef,
			"sealRequestDigest":      disposition.SealRequestDigest,
			"terminalKind":           "retirement-receipt",
			"terminalDigest":         disposition.RetirementReceipt.ReceiptDigest,
			"disposition":            disposition.RetireRequest.Disposition,
		}, nil
	}
	if disposition.RetireRequest == nil && disposition.RetirementReceipt == nil && disposition.ForcedExpiryTombstone != nil {
		return map[string]any{
			"opaqueProviderStateRef": disposition.OpaqueProviderStateRef,
			"sealRequestDigest":      disposition.SealRequestDigest,
			"terminalKind":           "forced-expiry-tombstone",
			"terminalDigest":         disposition.ForcedExpiryTombstone.TombstoneDigest,
			"disposition":            nil,
		}, nil
	}
	return nil, ErrInvalid
}

func evaluationNativeProviderStateVaultRecoveryTerminalRecordSetDigest(
	dispositions []evaluationNativeProviderStateVaultRecoveryDisposition,
) (string, error) {
	ordered := append([]evaluationNativeProviderStateVaultRecoveryDisposition(nil), dispositions...)
	sort.Slice(ordered, func(left, right int) bool {
		return ordered[left].OpaqueProviderStateRef < ordered[right].OpaqueProviderStateRef
	})
	records := make([]any, 0, len(ordered))
	for index, disposition := range ordered {
		if index > 0 && ordered[index-1].OpaqueProviderStateRef == disposition.OpaqueProviderStateRef {
			return "", ErrConflict
		}
		value, err := disposition.terminalValue()
		if err != nil {
			return "", err
		}
		records = append(records, value)
	}
	return canonicaljson.Digest(map[string]any{
		"format":  evaluationNativeProviderStateVaultRecoveryTerminalRecordSetFormat,
		"version": evaluationNativeProviderStateVaultVersion,
		"records": records,
	})
}

type evaluationNativeProviderStateVaultRecoveryReceipt struct {
	RecoveryRequestDigest              string
	NamespaceID                        string
	Partition                          EvaluationPlanPartition
	OwnerInstanceID                    string
	AuthorityDigest                    string
	Reason                             string
	RetiredRecordCount                 int64
	CancelledRetirementCount           int64
	ConsumedRetirementCount            int64
	ExpiredRetirementCount             int64
	ForcedExpiryTombstoneCount         int64
	TerminalRecordSetDigest            string
	ResidualActiveEncryptedRecordCount int64
	CompletedAt                        time.Time
	ReceiptDigest                      string
	Value                              map[string]any
	Bytes                              []byte
}

func createEvaluationNativeProviderStateVaultRecoveryReceipt(
	request evaluationNativeProviderStateVaultRecoveryRequest,
	dispositions []evaluationNativeProviderStateVaultRecoveryDisposition,
	completedAt time.Time,
) (evaluationNativeProviderStateVaultRecoveryReceipt, error) {
	completedAt = evaluationNativeProviderStateVaultMillisecond(completedAt)
	if completedAt.Before(request.RequestedAt) ||
		completedAt.Sub(request.RequestedAt) > evaluationNativeProviderStateVaultLifetime ||
		len(dispositions) > maximumEvaluationNativeProviderStateVaultRecords {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrInvalid
	}
	terminalSetDigest, err := evaluationNativeProviderStateVaultRecoveryTerminalRecordSetDigest(dispositions)
	if err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, err
	}
	var cancelled, consumed, expired, forced int64
	for _, disposition := range dispositions {
		if disposition.ForcedExpiryTombstone != nil {
			forced++
			continue
		}
		switch disposition.RetireRequest.Disposition {
		case "cancelled":
			cancelled++
		case "consumed":
			consumed++
		case "expired":
			expired++
		default:
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrInvalid
		}
	}
	base := map[string]any{
		"format":                evaluationNativeProviderStateVaultRecoveryReceiptFormat,
		"version":               evaluationNativeProviderStateVaultVersion,
		"recoveryRequestDigest": request.RecoveryRequestDigest,
		"namespaceId":           request.NamespaceID, "planDigest": request.Partition.PlanDigest,
		"repositoryCommit": request.Partition.RepositoryCommit, "vaultOwnerInstanceId": request.OwnerInstanceID,
		"authorityDigest": request.AuthorityDigest, "reason": request.Reason,
		"retiredRecordCount":       int64(len(dispositions)) - forced,
		"cancelledRetirementCount": cancelled, "consumedRetirementCount": consumed,
		"expiredRetirementCount": expired, "forcedExpiryTombstoneCount": forced,
		"terminalRecordSetDigest":            terminalSetDigest,
		"residualActiveEncryptedRecordCount": int64(0),
		"completedAt":                        evaluationNativeProviderStateVaultInstant(completedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, err
	}
	value := cloneEvaluationObject(base)
	value["receiptDigest"] = digest
	source, err := canonicaljson.Bytes(value)
	if err != nil || len(source) > maximumEvaluationNativeProviderStateVaultComponentBytes {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrInvalid
	}
	return evaluationNativeProviderStateVaultRecoveryReceipt{
		RecoveryRequestDigest: request.RecoveryRequestDigest, NamespaceID: request.NamespaceID,
		Partition: request.Partition, OwnerInstanceID: request.OwnerInstanceID, AuthorityDigest: request.AuthorityDigest,
		Reason: request.Reason, RetiredRecordCount: int64(len(dispositions)) - forced,
		CancelledRetirementCount: cancelled, ConsumedRetirementCount: consumed,
		ExpiredRetirementCount: expired, ForcedExpiryTombstoneCount: forced,
		TerminalRecordSetDigest: terminalSetDigest, ResidualActiveEncryptedRecordCount: 0,
		CompletedAt: completedAt, ReceiptDigest: digest, Value: value, Bytes: source,
	}, nil
}

func decodeEvaluationNativeProviderStateVaultRecoveryReceipt(
	source []byte,
) (evaluationNativeProviderStateVaultRecoveryReceipt, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "recoveryRequestDigest", "namespaceId", "planDigest", "repositoryCommit",
		"vaultOwnerInstanceId", "authorityDigest", "reason", "retiredRecordCount",
		"cancelledRetirementCount", "consumedRetirementCount", "expiredRetirementCount",
		"forcedExpiryTombstoneCount", "terminalRecordSetDigest", "residualActiveEncryptedRecordCount",
		"completedAt", "receiptDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultRecoveryReceiptFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil ||
		!evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	retired, retiredErr := evaluationCount(value["retiredRecordCount"], "state vault recovery retired count")
	cancelled, cancelledErr := evaluationCount(value["cancelledRetirementCount"], "state vault recovery cancelled count")
	consumed, consumedErr := evaluationCount(value["consumedRetirementCount"], "state vault recovery consumed count")
	expired, expiredErr := evaluationCount(value["expiredRetirementCount"], "state vault recovery expired count")
	forced, forcedErr := evaluationCount(value["forcedExpiryTombstoneCount"], "state vault recovery forced expiry count")
	residual, residualErr := evaluationCount(value["residualActiveEncryptedRecordCount"], "state vault recovery residual count")
	completedAt, completedErr := evaluationInstant(value["completedAt"], "state vault recovery completedAt")
	if !versionOK || version != evaluationNativeProviderStateVaultVersion || retiredErr != nil || cancelledErr != nil ||
		consumedErr != nil || expiredErr != nil || forcedErr != nil || residualErr != nil || completedErr != nil ||
		retired != cancelled+consumed+expired || retired+forced > maximumEvaluationNativeProviderStateVaultRecords || residual != 0 ||
		!validEvaluationServiceIdentity(stringMember(value, "namespaceId")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "planDigest")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "vaultOwnerInstanceId")) ||
		stringMember(value, "reason") != evaluationNativeProviderStateVaultRecoveryReason {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrInvalid
	}
	for _, field := range []string{"recoveryRequestDigest", "authorityDigest", "terminalRecordSetDigest", "receiptDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrInvalid
		}
	}
	return evaluationNativeProviderStateVaultRecoveryReceipt{
		RecoveryRequestDigest: stringMember(value, "recoveryRequestDigest"), NamespaceID: stringMember(value, "namespaceId"),
		Partition:       EvaluationPlanPartition{PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit")},
		OwnerInstanceID: stringMember(value, "vaultOwnerInstanceId"), AuthorityDigest: stringMember(value, "authorityDigest"),
		Reason: stringMember(value, "reason"), RetiredRecordCount: retired, CancelledRetirementCount: cancelled,
		ConsumedRetirementCount: consumed, ExpiredRetirementCount: expired, ForcedExpiryTombstoneCount: forced,
		TerminalRecordSetDigest: stringMember(value, "terminalRecordSetDigest"), ResidualActiveEncryptedRecordCount: residual,
		CompletedAt: completedAt, ReceiptDigest: stringMember(value, "receiptDigest"), Value: value, Bytes: canonical,
	}, nil
}

func matchEvaluationNativeProviderStateVaultRecoveryReceipt(
	receipt evaluationNativeProviderStateVaultRecoveryReceipt,
	request evaluationNativeProviderStateVaultRecoveryRequest,
) error {
	if receipt.RecoveryRequestDigest != request.RecoveryRequestDigest || receipt.NamespaceID != request.NamespaceID ||
		receipt.Partition != request.Partition || receipt.OwnerInstanceID != request.OwnerInstanceID ||
		receipt.AuthorityDigest != request.AuthorityDigest || receipt.Reason != request.Reason ||
		receipt.CompletedAt.Before(request.RequestedAt) ||
		receipt.CompletedAt.Sub(request.RequestedAt) > evaluationNativeProviderStateVaultLifetime {
		return ErrConflict
	}
	return nil
}

func createEvaluationNativeProviderStateVaultRecoveryZeroResidualReceipt(
	request evaluationNativeProviderStateVaultRecoveryRequest,
	receipt evaluationNativeProviderStateVaultRecoveryReceipt,
	checkedAt time.Time,
) ([]byte, error) {
	checkedAt = evaluationNativeProviderStateVaultMillisecond(checkedAt)
	if err := matchEvaluationNativeProviderStateVaultRecoveryReceipt(receipt, request); err != nil ||
		checkedAt.Before(receipt.CompletedAt) {
		return nil, ErrConflict
	}
	base := map[string]any{
		"format":      evaluationNativeProviderStateVaultRecoveryZeroResidualReceiptFormat,
		"version":     evaluationNativeProviderStateVaultVersion,
		"namespaceId": request.NamespaceID, "planDigest": request.Partition.PlanDigest,
		"repositoryCommit": request.Partition.RepositoryCommit, "vaultOwnerInstanceId": request.OwnerInstanceID,
		"authorityDigest": request.AuthorityDigest, "recoveryRequestDigest": request.RecoveryRequestDigest,
		"recoveryReceiptDigest": receipt.ReceiptDigest, "activeEncryptedRecordCount": int64(0),
		"checkedAt": evaluationNativeProviderStateVaultInstant(checkedAt),
		"expiresAt": evaluationNativeProviderStateVaultInstant(checkedAt.Add(evaluationNativeProviderStateVaultLifetime)),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	value := cloneEvaluationObject(base)
	value["zeroResidualReceiptDigest"] = digest
	source, err := canonicaljson.Bytes(value)
	if err != nil || len(source) > maximumEvaluationNativeProviderStateVaultComponentBytes {
		return nil, ErrInvalid
	}
	return source, nil
}

func evaluationNativeProviderStateVaultRecoveryReceiptEqual(
	left evaluationNativeProviderStateVaultRecoveryReceipt,
	right evaluationNativeProviderStateVaultRecoveryReceipt,
) bool {
	return bytes.Equal(left.Bytes, right.Bytes)
}
