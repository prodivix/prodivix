package agent

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityEffectProviderJournalStageFormat          = "prodivix.agent-evaluation-capability-effect-provider-journal-stage-record"
	evaluationCapabilityEffectProviderJournalExecutionFormat      = "prodivix.agent-evaluation-capability-effect-provider-journal-execution-record"
	evaluationCapabilityEffectProviderJournalExecutionWriteFormat = "prodivix.agent-evaluation-capability-effect-provider-journal-execution-write"
	evaluationCapabilityEffectProviderJournalResultFormat         = "prodivix.agent-evaluation-capability-effect-provider-journal-result-record"
	evaluationCapabilityEffectProviderJournalAbandonmentFormat    = "prodivix.agent-evaluation-capability-effect-provider-journal-abandonment-record"
	evaluationCapabilityEffectProviderRuntimeArchiveFormat        = "prodivix.agent-evaluation-capability-effect-provider-runtime-archive-record"

	evaluationCapabilityEffectProviderSpoolAADFormat               = "prodivix.agent-evaluation-capability-effect-provider-spool-aad"
	evaluationCapabilityEffectProviderSpoolEnvelopeAuthorityFormat = "prodivix.agent-evaluation-capability-effect-provider-spool-envelope-authority"
	evaluationCapabilityEffectProviderSpoolReceiptFormat           = "prodivix.agent-evaluation-capability-effect-provider-spool-receipt"
	evaluationCapabilityEffectProviderSpoolDispositionFormat       = "prodivix.agent-evaluation-capability-effect-provider-spool-disposition-receipt"
	evaluationCapabilityEffectProviderSpoolKeyID                   = "key.g4-model-eval.capability-effect-provider-journal-spool.v1"
	evaluationCapabilityEffectProviderSpoolKeyRef                  = "secret.g4-model-eval.capability-effect-provider-journal-spool.aes256gcm.v1"
	evaluationCapabilityEffectProviderSpoolRetentionClass          = "provider-runtime-ack-reconcile-only"

	maximumEvaluationCapabilityEffectProviderJournalStageBytes             = 49_152
	maximumEvaluationCapabilityEffectProviderJournalOtherStageBytes        = 32_768
	maximumEvaluationCapabilityEffectProviderJournalExecutionBytes         = 24_576
	maximumEvaluationCapabilityEffectProviderJournalExecutionEnvelopeBytes = 7_680
	maximumEvaluationCapabilityEffectProviderJournalExecutionWriteBytes    = 589_824
	maximumEvaluationCapabilityEffectProviderJournalResultBytes            = 49_152
	maximumEvaluationCapabilityEffectProviderJournalResultEnvelopeBytes    = 32_256
	maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecordBytes     = 196_608
	maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords         = 5_880
	maximumEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBytes     = 1_156_055_040
	maximumEvaluationCapabilityEffectProviderSpoolCiphertextBytes          = 262_144
	maximumEvaluationCapabilityEffectProviderSpoolLifetime                 = 125 * time.Second
	maximumEvaluationCapabilityEffectProviderJournalOwnerExecutions        = 4
)

type evaluationCapabilityEffectProviderJournalIdentity struct {
	NamespaceID                      string
	PlanDigest                       string
	RepositoryCommit                 string
	AttemptID                        string
	DescriptorDigest                 string
	TurnIndex                        int64
	InvocationID                     string
	OwnerRequestID                   string
	OwnerRequestDigest               string
	RuntimeFactSourceAuthorityDigest string
	PreEffectIntentDigest            string
}

type EvaluationCapabilityEffectProviderJournalStageRecord struct {
	evaluationCapabilityEffectProviderJournalIdentity
	BindingKind                         string
	CapabilityID                        string
	StageDigest                         string
	RecordDigest                        string
	ProviderResourceSetCommitmentDigest string
	ProviderResourceAuthorityDigest     string
	ProviderResourceReadRequestDigest   string
	ProviderResourceReadReceiptDigest   string
	PreEffectIntentBytes                []byte
	StageRequestBytes                   []byte
	RecordBytes                         []byte
	StagedAt                            time.Time
	ExpiresAt                           time.Time
	SealedAt                            time.Time
	Value                               map[string]any
	PreEffectIntent                     map[string]any
	StageRequest                        map[string]any
}

type evaluationCapabilityEffectProviderSpoolAAD struct {
	NamespaceDigest          string
	PlanDigest               string
	RepositoryCommit         string
	AttemptID                string
	DescriptorDigest         string
	TurnIndex                int64
	InvocationID             string
	OwnerRequestDigest       string
	StageDigest              string
	ExecutionSequence        int64
	DispatchIntentDigest     string
	TransportReceiptDigest   string
	ResponseBodyDigest       string
	ResponseProjectionDigest string
	ResponseDigest           string
	NormalizedEventSetDigest string
	Digest                   string
	Value                    map[string]any
	Canonical                []byte
}

type evaluationCapabilityEffectProviderSpoolEnvelopeAuthority struct {
	SpoolRef                string
	Algorithm               string
	KeyID                   string
	KeyVersion              int64
	KeyRefDigest            string
	EncryptionProfileDigest string
	Nonce                   []byte
	AuthenticationTag       []byte
	CiphertextDigest        string
	CiphertextSizeBytes     int64
	AADDigest               string
	EnvelopeDigest          string
	Value                   map[string]any
	Canonical               []byte
}

type evaluationCapabilityEffectProviderSpoolReceipt struct {
	SpoolRef                 string
	PlanDigest               string
	RepositoryCommit         string
	AttemptID                string
	DescriptorDigest         string
	TurnIndex                int64
	InvocationID             string
	OwnerRequestDigest       string
	StageDigest              string
	ExecutionSequence        int64
	DispatchIntentDigest     string
	TransportReceiptDigest   string
	Algorithm                string
	EncryptionProfileDigest  string
	KeyRefDigest             string
	KeyID                    string
	KeyVersion               int64
	AADDigest                string
	EnvelopeDigest           string
	CiphertextDigest         string
	CiphertextSizeBytes      int64
	ResponseBodyDigest       string
	ResponseProjectionDigest string
	ResponseDigest           string
	NormalizedEventSetDigest string
	RetentionPolicyDigest    string
	CreatedAt                time.Time
	ExpiresAt                time.Time
	ReceiptDigest            string
	Value                    map[string]any
	Canonical                []byte
}

type EvaluationCapabilityEffectProviderJournalExecutionRecord struct {
	evaluationCapabilityEffectProviderJournalIdentity
	StageDigest                 string
	ExecutionSequence           int64
	PriorExecutionRecordDigest  string
	ExecutionReceiptDigest      string
	Operation                   string
	DispatchIntentDigest        string
	TransportReceiptDigest      string
	SpoolReceiptDigest          string
	SpoolRef                    string
	SpoolAADDigest              string
	SpoolEnvelopeDigest         string
	CiphertextDigest            string
	CiphertextSizeBytes         int64
	ResponseBodyDigest          string
	ResponseProjectionDigest    string
	ResponseDigest              string
	NormalizedEventSetDigest    string
	RetrievalCitationResourceID string
	ExecutedAt                  time.Time
	SealedAt                    time.Time
	RecordDigest                string
	RecordBytes                 []byte
	Value                       map[string]any
	ExecutionReceipt            map[string]any
	SpoolAAD                    *evaluationCapabilityEffectProviderSpoolAAD
	SpoolEnvelopeAuthority      *evaluationCapabilityEffectProviderSpoolEnvelopeAuthority
	SpoolReceipt                *evaluationCapabilityEffectProviderSpoolReceipt
}

type EvaluationCapabilityEffectProviderJournalExecutionWrite struct {
	ExecutionRecord    EvaluationCapabilityEffectProviderJournalExecutionRecord
	WriteDigest        string
	WriteBytes         []byte
	SpoolEnvelope      *evaluationProviderResultSpoolEnvelope
	SpoolEnvelopeBytes []byte
	Value              map[string]any
}

type evaluationCapabilityEffectProviderSpoolDisposition struct {
	SpoolRef                string
	SpoolReceiptDigest      string
	PlanDigest              string
	RepositoryCommit        string
	AttemptID               string
	DescriptorDigest        string
	TurnIndex               int64
	InvocationID            string
	OwnerRequestDigest      string
	StageDigest             string
	ExecutionSequence       int64
	Disposition             string
	ResultSealReceiptDigest string
	AbandonmentReason       string
	RetentionPolicyDigest   string
	DisposedAt              time.Time
	ReceiptDigest           string
	Value                   map[string]any
	Canonical               []byte
}

type EvaluationCapabilityEffectProviderJournalResultRecord struct {
	evaluationCapabilityEffectProviderJournalIdentity
	StageDigest                         string
	TerminalExecutionRecordDigest       string
	BusinessResultDigest                string
	ResultStatus                        string
	SourceFactKind                      string
	SourceFactDigest                    string
	StateVaultRetireRequestDigest       string
	StateVaultRetirementReceiptDigest   string
	NextStateVaultSealRequestDigest     string
	NextStateVaultSealReceiptDigest     string
	ProviderResourceSetCommitmentDigest string
	ProviderResourceAuthorityDigest     string
	ProviderResourceReadRequestDigest   string
	ProviderResourceReadReceiptDigest   string
	ConsumedInputSourceFactDigest       string
	ResultSealReceiptDigest             string
	RecordDigest                        string
	SealedAt                            time.Time
	RecordBytes                         []byte
	Value                               map[string]any
	BusinessResult                      map[string]any
	EffectSourceFact                    map[string]any
	ResultSealReceipt                   map[string]any
	SpoolDispositions                   []evaluationCapabilityEffectProviderSpoolDisposition
}

type EvaluationCapabilityEffectProviderJournalAbandonmentRecord struct {
	evaluationCapabilityEffectProviderJournalIdentity
	StageDigest               string
	LastExecutionRecordDigest string
	Reason                    string
	AbandonedAt               time.Time
	RecordDigest              string
	RecordBytes               []byte
	Value                     map[string]any
	SpoolDispositions         []evaluationCapabilityEffectProviderSpoolDisposition
}

type EvaluationCapabilityEffectProviderRuntimeArchiveRecord struct {
	NamespaceID                              string
	PlanDigest                               string
	RepositoryCommit                         string
	AttemptID                                string
	TurnIndex                                int64
	OwnerRequestDigest                       string
	PreEffectIntentDigest                    string
	EffectSourceReceiptDigest                string
	ProviderRuntimeJournalResultRecordDigest string
	ProviderRuntimeResultSealReceiptDigest   string
	RecordDigest                             string
	RecordBytes                              []byte
}

func evaluationCapabilityEffectProviderJournalCanonicalMember(value map[string]any, field string, maximum int) (map[string]any, []byte, error) {
	member, ok := objectMember(value, field)
	if !ok {
		return nil, nil, invalid("capability effect Provider journal " + field + " is invalid")
	}
	canonical, err := canonicaljson.Bytes(member)
	if err != nil || len(canonical) > maximum {
		return nil, nil, invalid("capability effect Provider journal " + field + " is unbounded")
	}
	return member, canonical, nil
}

func evaluationCapabilityEffectProviderJournalSelfDigest(value map[string]any, field string) bool {
	digest := stringMember(value, field)
	if !evaluationDigestPattern.MatchString(digest) {
		return false
	}
	base := cloneEvaluationObject(value)
	delete(base, field)
	computed, err := canonicaljson.Digest(base)
	return err == nil && computed == digest
}

func evaluationCapabilityEffectProviderJournalIdentityFromValue(value map[string]any) (evaluationCapabilityEffectProviderJournalIdentity, error) {
	turn, turnOK := integerMember(value, "turnIndex")
	if !turnOK || turn < 0 || turn >= 7 || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationCapabilityEffectProviderJournalIdentity{}, ErrInvalid
	}
	for _, field := range []string{"namespaceId", "attemptId", "invocationId", "ownerRequestId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderJournalIdentity{}, ErrInvalid
		}
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "ownerRequestDigest", "runtimeFactSourceAuthorityDigest", "preEffectIntentDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderJournalIdentity{}, ErrInvalid
		}
	}
	return evaluationCapabilityEffectProviderJournalIdentity{
		NamespaceID: stringMember(value, "namespaceId"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), AttemptID: stringMember(value, "attemptId"),
		DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turn,
		InvocationID: stringMember(value, "invocationId"), OwnerRequestID: stringMember(value, "ownerRequestId"),
		OwnerRequestDigest:               stringMember(value, "ownerRequestDigest"),
		RuntimeFactSourceAuthorityDigest: stringMember(value, "runtimeFactSourceAuthorityDigest"),
		PreEffectIntentDigest:            stringMember(value, "preEffectIntentDigest"),
	}, nil
}

func evaluationCapabilityEffectProviderJournalIdentityMatches(
	identity evaluationCapabilityEffectProviderJournalIdentity,
	intent map[string]any,
) bool {
	turn, ok := integerMember(intent, "turnIndex")
	if !ok {
		return false
	}
	return identity.NamespaceID == stringMember(intent, "namespaceId") &&
		identity.PlanDigest == stringMember(intent, "planDigest") &&
		identity.RepositoryCommit == stringMember(intent, "repositoryCommit") &&
		identity.AttemptID == stringMember(intent, "attemptId") &&
		identity.DescriptorDigest == stringMember(intent, "descriptorDigest") &&
		identity.TurnIndex == turn && identity.InvocationID == stringMember(intent, "invocationId") &&
		identity.OwnerRequestID == stringMember(intent, "ownerRequestId") &&
		identity.OwnerRequestDigest == stringMember(intent, "ownerRequestDigest") &&
		identity.PreEffectIntentDigest == stringMember(intent, "intentDigest")
}

func validateEvaluationCapabilityEffectProviderJournalPreEffectIntent(intent map[string]any) (string, error) {
	payload := cloneEvaluationObject(intent)
	payload["preEffectIntent"] = intent
	payload["requestDigest"] = intent["providerRequestDigest"]
	decoded, digest, err := evaluationAttemptAuthorityPreEffectIntent(payload)
	if err != nil || digest != stringMember(intent, "intentDigest") || !sameEvaluationCanonicalValue(decoded, intent) {
		if err == nil {
			err = ErrConflict
		}
		return "", err
	}
	authority, authorityDigest, err := evaluationAttemptAuthorityRuntimeFactSourceAuthority(intent["runtimeFactSourceAuthority"])
	if err != nil || stringMember(authority, "authorityDigest") != authorityDigest {
		return "", ErrConflict
	}
	return authorityDigest, nil
}

func decodeEvaluationCapabilityEffectProviderJournalStageRecord(source []byte) (EvaluationCapabilityEffectProviderJournalStageRecord, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalStageBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "invocationId", "ownerRequestId", "ownerRequestDigest", "runtimeFactSourceAuthorityDigest",
		"preEffectIntentDigest", "preEffectIntent", "stageRequest", "sealedAt", "recordDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderJournalStageFormat {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	identity, identityErr := evaluationCapabilityEffectProviderJournalIdentityFromValue(value)
	intent, intentBytes, intentErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "preEffectIntent", 16_384)
	stage, stageBytes, stageErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "stageRequest", maximumEvaluationCapabilityEffectProviderJournalStageBytes)
	if !versionOK || version != 1 || identityErr != nil || intentErr != nil || stageErr != nil ||
		!evaluationCapabilityEffectProviderJournalIdentityMatches(identity, intent) ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "recordDigest") {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
	}
	authorityDigest, err := validateEvaluationCapabilityEffectProviderJournalPreEffectIntent(intent)
	if err != nil || authorityDigest != identity.RuntimeFactSourceAuthorityDigest {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
	}
	if !exactEvaluationKeys(stage, []string{
		"format", "version", "intentDigest", "ownerRequestId", "ownerRequestDigest", "bindingKind", "capabilityId",
		"readinessReceipt", "readinessReceiptDigest", "requestProjection", "nativeSourceReceipt",
		"stateVaultResolveRequest", "stateVaultResolveReceipt", "providerResourceSetCommitment",
		"providerResourceAuthority", "providerResourceReadRequest", "providerResourceReadReceipt",
		"stagedAt", "expiresAt", "stageDigest",
	}) || stringMember(stage, "format") != "prodivix.agent-evaluation-capability-effect-provider-stage" ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(stage, "stageDigest") {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrInvalid
	}
	stageVersion, stageVersionOK := integerMember(stage, "version")
	stagedAt, stagedErr := evaluationInstant(stage["stagedAt"], "capability effect Provider journal stage time")
	expiresAt, expiresErr := evaluationInstant(stage["expiresAt"], "capability effect Provider journal stage expiry")
	sealedAt, sealedErr := evaluationInstant(value["sealedAt"], "capability effect Provider journal seal time")
	bindingKind := stringMember(stage, "bindingKind")
	capabilityID := stringMember(stage, "capabilityId")
	if !stageVersionOK || stageVersion != 1 || stagedErr != nil || expiresErr != nil || sealedErr != nil ||
		!expiresAt.After(stagedAt) || expiresAt.Sub(stagedAt) > maximumEvaluationCapabilityEffectProviderSpoolLifetime ||
		!sealedAt.Equal(stagedAt) || stringMember(stage, "intentDigest") != identity.PreEffectIntentDigest ||
		stringMember(stage, "ownerRequestId") != identity.OwnerRequestID ||
		stringMember(stage, "ownerRequestDigest") != identity.OwnerRequestDigest ||
		!oneOfString(bindingKind, "hosted-retrieval-query", "opaque-continuation", "provider-cache", "provider-job") ||
		!oneOfString(capabilityID, "provider.background-job", "provider.hosted-retrieval", "provider.isolated-cache", "provider.reasoning-continuation") {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
	}
	expectedCapability := map[string]string{
		"hosted-retrieval-query": "provider.hosted-retrieval", "opaque-continuation": "provider.reasoning-continuation",
		"provider-cache": "provider.isolated-cache", "provider-job": "provider.background-job",
	}[bindingKind]
	inputBinding, ok := objectMember(intent, "inputAuthorityBinding")
	if !ok || stringMember(inputBinding, "bindingKind") != bindingKind || capabilityID != expectedCapability {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
	}
	readiness, readinessOK := objectMember(stage, "readinessReceipt")
	if !readinessOK || !evaluationCapabilityEffectProviderJournalSelfDigest(readiness, "receiptDigest") ||
		stringMember(readiness, "receiptDigest") != stringMember(stage, "readinessReceiptDigest") ||
		stringMember(readiness, "capabilityId") != capabilityID || stringMember(readiness, "status") != "ready" {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
	}
	checkedAt, checkedErr := evaluationInstant(readiness["checkedAt"], "capability effect Provider readiness")
	readinessExpires, readinessExpiresErr := evaluationInstant(readiness["expiresAt"], "capability effect Provider readiness expiry")
	if checkedErr != nil || readinessExpiresErr != nil || stagedAt.Before(checkedAt) || !stagedAt.Before(readinessExpires) || expiresAt.After(readinessExpires) {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
	}
	providerDigests := [4]string{}
	providerFields := []struct{ field, digest string }{
		{"providerResourceSetCommitment", "commitmentDigest"}, {"providerResourceAuthority", "authorityDigest"},
		{"providerResourceReadRequest", "requestDigest"}, {"providerResourceReadReceipt", "receiptDigest"},
	}
	for index, binding := range providerFields {
		if stage[binding.field] == nil {
			continue
		}
		member, ok := objectMember(stage, binding.field)
		if !ok || !evaluationCapabilityEffectProviderJournalSelfDigest(member, binding.digest) {
			return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
		}
		providerDigests[index] = stringMember(member, binding.digest)
	}
	hosted := bindingKind == "hosted-retrieval-query"
	stateful := bindingKind == "provider-job" || bindingKind == "opaque-continuation"
	if hosted != (providerDigests[0] != "" && providerDigests[1] != "" && providerDigests[2] != "" && providerDigests[3] != "") ||
		(!hosted && (providerDigests[0] != "" || providerDigests[1] != "" || providerDigests[2] != "" || providerDigests[3] != "")) ||
		stateful != (stage["stateVaultResolveRequest"] != nil && stage["stateVaultResolveReceipt"] != nil) ||
		(!stateful && (stage["stateVaultResolveRequest"] != nil || stage["stateVaultResolveReceipt"] != nil)) ||
		hosted && stage["nativeSourceReceipt"] != nil || !hosted && stage["nativeSourceReceipt"] == nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
	}
	maximum := maximumEvaluationCapabilityEffectProviderJournalOtherStageBytes
	if hosted {
		maximum = maximumEvaluationCapabilityEffectProviderJournalStageBytes
	}
	if len(canonical) > maximum {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrInvalid
	}
	return EvaluationCapabilityEffectProviderJournalStageRecord{
		evaluationCapabilityEffectProviderJournalIdentity: identity, BindingKind: bindingKind, CapabilityID: capabilityID,
		StageDigest: stringMember(stage, "stageDigest"), RecordDigest: stringMember(value, "recordDigest"),
		ProviderResourceSetCommitmentDigest: providerDigests[0], ProviderResourceAuthorityDigest: providerDigests[1],
		ProviderResourceReadRequestDigest: providerDigests[2], ProviderResourceReadReceiptDigest: providerDigests[3],
		PreEffectIntentBytes: intentBytes, StageRequestBytes: stageBytes, RecordBytes: canonical,
		StagedAt: stagedAt, ExpiresAt: expiresAt, SealedAt: sealedAt, Value: value,
		PreEffectIntent: intent, StageRequest: stage,
	}, nil
}

func evaluationCapabilityEffectProviderSpoolDigests() (string, string, string, error) {
	keyRefDigest, err := canonicaljson.Digest(map[string]any{
		"keyId": evaluationCapabilityEffectProviderSpoolKeyID, "keyVersion": int64(1),
		"keyEnvironmentName": "PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY_BASE64",
		"keyRef":             evaluationCapabilityEffectProviderSpoolKeyRef,
	})
	if err != nil {
		return "", "", "", err
	}
	profileDigest, err := canonicaljson.Digest(map[string]any{
		"algorithm": "aes-256-gcm", "aadFormat": evaluationCapabilityEffectProviderSpoolAADFormat,
		"aadVersion": int64(1), "keyRefDigest": keyRefDigest,
		"maximumCiphertextBytes": int64(maximumEvaluationCapabilityEffectProviderSpoolCiphertextBytes),
	})
	if err != nil {
		return "", "", "", err
	}
	retentionDigest, err := canonicaljson.Digest(map[string]any{
		"retentionClass": evaluationCapabilityEffectProviderSpoolRetentionClass,
		"maximumAgeMs":   int64(maximumEvaluationCapabilityEffectProviderSpoolLifetime / time.Millisecond),
		"disposition":    "destroy-on-result-seal-or-abandonment",
	})
	return keyRefDigest, profileDigest, retentionDigest, err
}

func decodeEvaluationCapabilityEffectProviderSpoolAAD(value map[string]any) (evaluationCapabilityEffectProviderSpoolAAD, error) {
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > 65_536 || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceDigest", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "invocationId", "ownerRequestDigest", "stageDigest", "executionSequence", "dispatchIntentDigest",
		"transportReceiptDigest", "responseBodyDigest", "responseProjectionDigest", "responseDigest", "normalizedEventSetDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderSpoolAADFormat {
		return evaluationCapabilityEffectProviderSpoolAAD{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turn, turnOK := integerMember(value, "turnIndex")
	sequence, sequenceOK := integerMember(value, "executionSequence")
	if !versionOK || version != 1 || !turnOK || turn < 0 || turn >= 7 || !sequenceOK || sequence < 0 || sequence >= 4 ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationCapabilityEffectProviderSpoolAAD{}, ErrInvalid
	}
	for _, field := range []string{"attemptId", "invocationId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderSpoolAAD{}, ErrInvalid
		}
	}
	for _, field := range []string{
		"namespaceDigest", "planDigest", "descriptorDigest", "ownerRequestDigest", "stageDigest", "dispatchIntentDigest",
		"transportReceiptDigest", "responseBodyDigest", "responseProjectionDigest", "responseDigest", "normalizedEventSetDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderSpoolAAD{}, ErrInvalid
		}
	}
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		return evaluationCapabilityEffectProviderSpoolAAD{}, err
	}
	return evaluationCapabilityEffectProviderSpoolAAD{
		NamespaceDigest: stringMember(value, "namespaceDigest"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), AttemptID: stringMember(value, "attemptId"),
		DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turn, InvocationID: stringMember(value, "invocationId"),
		OwnerRequestDigest: stringMember(value, "ownerRequestDigest"), StageDigest: stringMember(value, "stageDigest"),
		ExecutionSequence: sequence, DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"),
		TransportReceiptDigest: stringMember(value, "transportReceiptDigest"), ResponseBodyDigest: stringMember(value, "responseBodyDigest"),
		ResponseProjectionDigest: stringMember(value, "responseProjectionDigest"), ResponseDigest: stringMember(value, "responseDigest"),
		NormalizedEventSetDigest: stringMember(value, "normalizedEventSetDigest"), Digest: digest, Value: value, Canonical: canonical,
	}, nil
}

func decodeEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(value map[string]any) (evaluationCapabilityEffectProviderSpoolEnvelopeAuthority, error) {
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > 65_536 || !exactEvaluationKeys(value, []string{
		"format", "version", "spoolRef", "algorithm", "keyId", "keyVersion", "keyRefDigest", "encryptionProfileDigest",
		"nonceBase64Url", "authenticationTagBase64Url", "ciphertextDigest", "ciphertextSizeBytes", "aadDigest", "envelopeDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderSpoolEnvelopeAuthorityFormat ||
		stringMember(value, "algorithm") != "aes-256-gcm" || stringMember(value, "keyId") != evaluationCapabilityEffectProviderSpoolKeyID {
		return evaluationCapabilityEffectProviderSpoolEnvelopeAuthority{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	keyVersion, keyVersionOK := integerMember(value, "keyVersion")
	ciphertextSize, sizeOK := integerMember(value, "ciphertextSizeBytes")
	keyRefDigest, profileDigest, _, digestErr := evaluationCapabilityEffectProviderSpoolDigests()
	if !versionOK || version != 1 || !keyVersionOK || keyVersion != 1 || !sizeOK || ciphertextSize < 1 ||
		ciphertextSize > maximumEvaluationCapabilityEffectProviderSpoolCiphertextBytes || digestErr != nil ||
		stringMember(value, "keyRefDigest") != keyRefDigest || stringMember(value, "encryptionProfileDigest") != profileDigest ||
		!validEvaluationAgentControlIdentity(stringMember(value, "spoolRef")) {
		return evaluationCapabilityEffectProviderSpoolEnvelopeAuthority{}, ErrConflict
	}
	decode := func(field string, exact int) ([]byte, error) {
		encoded, ok := value[field].(string)
		if !ok || encoded == "" {
			return nil, ErrInvalid
		}
		decoded, err := base64.RawURLEncoding.DecodeString(encoded)
		if err != nil || len(decoded) != exact || base64.RawURLEncoding.EncodeToString(decoded) != encoded {
			return nil, ErrInvalid
		}
		return decoded, nil
	}
	nonce, nonceErr := decode("nonceBase64Url", 12)
	tag, tagErr := decode("authenticationTagBase64Url", 16)
	for _, field := range []string{"ciphertextDigest", "aadDigest", "envelopeDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderSpoolEnvelopeAuthority{}, ErrInvalid
		}
	}
	base := map[string]any{
		"algorithm": value["algorithm"], "keyId": value["keyId"], "keyVersion": value["keyVersion"],
		"keyRefDigest": value["keyRefDigest"], "encryptionProfileDigest": value["encryptionProfileDigest"],
		"nonceBase64Url": value["nonceBase64Url"], "authenticationTagBase64Url": value["authenticationTagBase64Url"],
		"ciphertextDigest": value["ciphertextDigest"], "ciphertextSizeBytes": value["ciphertextSizeBytes"], "aadDigest": value["aadDigest"],
	}
	envelopeDigest, digestErr := canonicaljson.Digest(base)
	if nonceErr != nil || tagErr != nil || digestErr != nil || envelopeDigest != stringMember(value, "envelopeDigest") {
		return evaluationCapabilityEffectProviderSpoolEnvelopeAuthority{}, ErrConflict
	}
	return evaluationCapabilityEffectProviderSpoolEnvelopeAuthority{
		SpoolRef: stringMember(value, "spoolRef"), Algorithm: "aes-256-gcm", KeyID: evaluationCapabilityEffectProviderSpoolKeyID,
		KeyVersion: 1, KeyRefDigest: keyRefDigest, EncryptionProfileDigest: profileDigest,
		Nonce: nonce, AuthenticationTag: tag, CiphertextDigest: stringMember(value, "ciphertextDigest"),
		CiphertextSizeBytes: ciphertextSize, AADDigest: stringMember(value, "aadDigest"), EnvelopeDigest: envelopeDigest,
		Value: value, Canonical: canonical,
	}, nil
}

func evaluationCapabilityEffectProviderSpoolRef(aadDigest string) string {
	return "provider-runtime-spool." + aadDigest[len("sha256-"):]
}

func decodeEvaluationCapabilityEffectProviderSpoolReceipt(value map[string]any) (evaluationCapabilityEffectProviderSpoolReceipt, error) {
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > 65_536 || !exactEvaluationKeys(value, []string{
		"format", "version", "spoolRef", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest", "turnIndex",
		"invocationId", "ownerRequestDigest", "stageDigest", "executionSequence", "dispatchIntentDigest", "transportReceiptDigest",
		"algorithm", "encryptionProfileDigest", "keyRefDigest", "keyId", "keyVersion", "aadDigest", "envelopeDigest",
		"ciphertextDigest", "ciphertextSizeBytes", "responseBodyDigest", "responseProjectionDigest", "responseDigest",
		"normalizedEventSetDigest", "retentionClass", "retentionPolicyDigest", "createdAt", "expiresAt", "receiptDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderSpoolReceiptFormat ||
		stringMember(value, "algorithm") != "aes-256-gcm" || stringMember(value, "retentionClass") != evaluationCapabilityEffectProviderSpoolRetentionClass ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "receiptDigest") {
		return evaluationCapabilityEffectProviderSpoolReceipt{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turn, turnOK := integerMember(value, "turnIndex")
	sequence, sequenceOK := integerMember(value, "executionSequence")
	keyVersion, keyVersionOK := integerMember(value, "keyVersion")
	ciphertextSize, sizeOK := integerMember(value, "ciphertextSizeBytes")
	createdAt, createdErr := evaluationInstant(value["createdAt"], "capability effect Provider spool creation")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "capability effect Provider spool expiry")
	keyRefDigest, profileDigest, retentionDigest, digestErr := evaluationCapabilityEffectProviderSpoolDigests()
	if !versionOK || version != 1 || !turnOK || turn < 0 || turn >= 7 || !sequenceOK || sequence < 0 || sequence >= 4 ||
		!keyVersionOK || keyVersion != 1 || !sizeOK || ciphertextSize < 1 || ciphertextSize > maximumEvaluationCapabilityEffectProviderSpoolCiphertextBytes ||
		createdErr != nil || expiresErr != nil || !expiresAt.After(createdAt) || expiresAt.Sub(createdAt) > maximumEvaluationCapabilityEffectProviderSpoolLifetime ||
		digestErr != nil || stringMember(value, "keyId") != evaluationCapabilityEffectProviderSpoolKeyID ||
		stringMember(value, "keyRefDigest") != keyRefDigest || stringMember(value, "encryptionProfileDigest") != profileDigest ||
		stringMember(value, "retentionPolicyDigest") != retentionDigest || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationCapabilityEffectProviderSpoolReceipt{}, ErrConflict
	}
	for _, field := range []string{"spoolRef", "attemptId", "invocationId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderSpoolReceipt{}, ErrInvalid
		}
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "ownerRequestDigest", "stageDigest", "dispatchIntentDigest", "transportReceiptDigest",
		"aadDigest", "envelopeDigest", "ciphertextDigest", "responseBodyDigest", "responseProjectionDigest", "responseDigest",
		"normalizedEventSetDigest", "receiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderSpoolReceipt{}, ErrInvalid
		}
	}
	return evaluationCapabilityEffectProviderSpoolReceipt{
		SpoolRef: stringMember(value, "spoolRef"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), AttemptID: stringMember(value, "attemptId"),
		DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turn, InvocationID: stringMember(value, "invocationId"),
		OwnerRequestDigest: stringMember(value, "ownerRequestDigest"), StageDigest: stringMember(value, "stageDigest"),
		ExecutionSequence: sequence, DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"),
		TransportReceiptDigest: stringMember(value, "transportReceiptDigest"), Algorithm: "aes-256-gcm",
		EncryptionProfileDigest: profileDigest, KeyRefDigest: keyRefDigest, KeyID: evaluationCapabilityEffectProviderSpoolKeyID,
		KeyVersion: 1, AADDigest: stringMember(value, "aadDigest"), EnvelopeDigest: stringMember(value, "envelopeDigest"),
		CiphertextDigest: stringMember(value, "ciphertextDigest"), CiphertextSizeBytes: ciphertextSize,
		ResponseBodyDigest: stringMember(value, "responseBodyDigest"), ResponseProjectionDigest: stringMember(value, "responseProjectionDigest"),
		ResponseDigest: stringMember(value, "responseDigest"), NormalizedEventSetDigest: stringMember(value, "normalizedEventSetDigest"),
		RetentionPolicyDigest: retentionDigest, CreatedAt: createdAt, ExpiresAt: expiresAt,
		ReceiptDigest: stringMember(value, "receiptDigest"), Value: value, Canonical: canonical,
	}, nil
}

func evaluationCapabilityEffectProviderSpoolAuthorityFromEnvelope(envelope evaluationProviderResultSpoolEnvelope) map[string]any {
	return map[string]any{
		"format": evaluationCapabilityEffectProviderSpoolEnvelopeAuthorityFormat, "version": int64(1),
		"spoolRef": envelope.SpoolID, "algorithm": envelope.Algorithm, "keyId": envelope.KeyID,
		"keyVersion": envelope.KeyVersion, "keyRefDigest": envelope.KeyRefDigest,
		"encryptionProfileDigest": envelope.EncryptionProfileDigest,
		"nonceBase64Url":          envelope.Value["nonceBase64Url"], "authenticationTagBase64Url": envelope.Value["authenticationTagBase64Url"],
		"ciphertextDigest": envelope.CiphertextDigest, "ciphertextSizeBytes": envelope.CiphertextSizeBytes,
		"aadDigest": envelope.AADDigest, "envelopeDigest": envelope.EnvelopeDigest,
	}
}

func evaluationCapabilityEffectProviderNamespaceDigest(namespaceID string) (string, error) {
	return canonicaljson.Digest(map[string]any{"namespaceId": namespaceID})
}

func evaluationCapabilityEffectProviderCiphertextDigest(ciphertext []byte) string {
	return fmt.Sprintf("sha256-%x", sha256.Sum256(ciphertext))
}

func evaluationCapabilityEffectProviderJournalCanonicalEqual(left, right map[string]any) bool {
	leftBytes, leftErr := canonicaljson.Bytes(left)
	rightBytes, rightErr := canonicaljson.Bytes(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}

func evaluationCapabilityEffectProviderJSONNumber(value int64) json.Number {
	return json.Number(fmt.Sprintf("%d", value))
}

func evaluationCapabilityEffectProviderNullableDigest(value map[string]any, field string) (string, error) {
	member, exists := value[field]
	if !exists {
		return "", ErrInvalid
	}
	if member == nil {
		return "", nil
	}
	digest, ok := member.(string)
	if !ok || !evaluationDigestPattern.MatchString(digest) {
		return "", ErrInvalid
	}
	return digest, nil
}

func decodeEvaluationCapabilityEffectProviderRequestProjection(value map[string]any) (string, string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "probeProgramDigest", "profileProjectionDigest", "capabilityProfileId", "capabilityProfileDigest",
		"protocolFamily", "providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest", "operation",
		"httpMethod", "apiVersion", "pathTemplate", "responseQuery", "responseMode", "stream", "store", "background",
		"pathDigest", "requestBodyDigest", "requestBytes", "providerStateReferenceKind", "providerStateReferenceDigest",
		"providerResourceSetCommitmentDigest", "providerResourceAuthorityDigest", "providerResourceReadRequestDigest",
		"providerResourceReadReceiptDigest", "cachePrefixDescriptorDigest", "cacheKeyDigest", "requestTextDigest", "requestDigest",
	}) || stringMember(value, "format") != "prodivix.agent-native-provider-capability-runtime-request" {
		return "", "", ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	requestBytes, requestBytesOK := integerMember(value, "requestBytes")
	operation := stringMember(value, "operation")
	if !versionOK || version != 1 || !requestBytesOK || requestBytes < 0 ||
		!oneOfString(operation, "background-poll", "cache-cold", "cache-warm", "continuation-resume", "hosted-retrieval-query") ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "requestDigest") {
		return "", "", ErrConflict
	}
	for _, field := range []string{
		"probeProgramDigest", "profileProjectionDigest", "capabilityProfileDigest", "modelLineageDigest", "adapterDigest",
		"pathDigest", "requestBodyDigest", "requestDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return "", "", ErrInvalid
		}
	}
	for _, field := range []string{
		"providerStateReferenceDigest", "providerResourceSetCommitmentDigest", "providerResourceAuthorityDigest",
		"providerResourceReadRequestDigest", "providerResourceReadReceiptDigest", "cachePrefixDescriptorDigest",
		"cacheKeyDigest", "requestTextDigest",
	} {
		if _, err := evaluationCapabilityEffectProviderNullableDigest(value, field); err != nil {
			return "", "", err
		}
	}
	return operation, stringMember(value, "requestDigest"), nil
}

func decodeEvaluationCapabilityEffectProviderResponseProjection(value map[string]any) (
	requestDigest string,
	projectionDigest string,
	responseBodyDigest string,
	responseDigest string,
	normalizedEventSetDigest string,
	retrievalCitationResourceID string,
	observedAt time.Time,
	err error,
) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "requestDigest", "requestProjectionDigest", "protocolFamily", "operation", "transportOutcome",
		"httpStatus", "responseBodyDigest", "sealedResponseJsonDigest", "responseDigest", "normalizedEventSetDigest",
		"providerStateReferenceKind", "providerStateReferenceDigest", "providerStatus", "terminalEventType", "usageVectorDigest",
		"cachedTokenCount", "outputTextDigest", "outputMarkerObserved", "retrievalCitationResourceId", "denialKind", "observedAt", "projectionDigest",
	}) || stringMember(value, "format") != "prodivix.agent-native-provider-capability-runtime-response" ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "projectionDigest") {
		err = ErrInvalid
		return
	}
	version, versionOK := integerMember(value, "version")
	observedAt, err = evaluationInstant(value["observedAt"], "capability effect Provider response observation")
	if !versionOK || version != 1 || err != nil ||
		!oneOfString(stringMember(value, "transportOutcome"), "failed", "received", "timed-out") {
		err = ErrInvalid
		return
	}
	for _, field := range []string{"requestDigest", "requestProjectionDigest", "responseDigest", "normalizedEventSetDigest", "projectionDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			err = ErrInvalid
			return
		}
	}
	responseBodyDigest, err = evaluationCapabilityEffectProviderNullableDigest(value, "responseBodyDigest")
	if err != nil {
		return
	}
	for _, field := range []string{"sealedResponseJsonDigest", "providerStateReferenceDigest", "usageVectorDigest", "outputTextDigest"} {
		if _, nullableErr := evaluationCapabilityEffectProviderNullableDigest(value, field); nullableErr != nil {
			err = nullableErr
			return
		}
	}
	if value["retrievalCitationResourceId"] != nil {
		var identityErr error
		retrievalCitationResourceID, identityErr = evaluationAuthenticityIdentity(
			value["retrievalCitationResourceId"], "retrievalCitationResourceId",
		)
		if identityErr != nil || stringMember(value, "operation") != "hosted-retrieval-query" {
			err = ErrInvalid
			return
		}
	}
	return stringMember(value, "requestDigest"), stringMember(value, "projectionDigest"), responseBodyDigest,
		stringMember(value, "responseDigest"), stringMember(value, "normalizedEventSetDigest"), retrievalCitationResourceID, observedAt, nil
}

func evaluationCapabilityEffectProviderExecutionSequenceMatches(
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	execution EvaluationCapabilityEffectProviderJournalExecutionRecord,
	prior *EvaluationCapabilityEffectProviderJournalExecutionRecord,
) bool {
	if prior == nil != (execution.PriorExecutionRecordDigest == "") ||
		prior != nil && execution.PriorExecutionRecordDigest != prior.RecordDigest {
		return false
	}
	switch stage.BindingKind {
	case "provider-job":
		return execution.Operation == "background-poll" && execution.ExecutionSequence >= 1 && execution.ExecutionSequence <= 4 &&
			(execution.ExecutionSequence == 1) == (prior == nil)
	case "hosted-retrieval-query":
		return execution.Operation == "hosted-retrieval-query" && execution.ExecutionSequence == 0 && prior == nil
	case "opaque-continuation":
		return execution.Operation == "continuation-resume" && execution.ExecutionSequence == 0 && prior == nil
	case "provider-cache":
		return (execution.ExecutionSequence == 0 && execution.Operation == "cache-cold" && prior == nil) ||
			(execution.ExecutionSequence == 1 && execution.Operation == "cache-warm" && prior != nil && prior.ExecutionSequence == 0)
	default:
		return false
	}
}

func decodeEvaluationCapabilityEffectProviderJournalExecutionRecord(
	value map[string]any,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	prior *EvaluationCapabilityEffectProviderJournalExecutionRecord,
) (EvaluationCapabilityEffectProviderJournalExecutionRecord, error) {
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationCapabilityEffectProviderJournalExecutionBytes || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest", "turnIndex",
		"invocationId", "ownerRequestId", "ownerRequestDigest", "runtimeFactSourceAuthorityDigest", "preEffectIntentDigest",
		"stageDigest", "executionSequence", "priorExecutionRecordDigest", "executionReceipt", "spoolAad",
		"spoolEnvelopeAuthority", "sealedAt", "recordDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderJournalExecutionFormat ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "recordDigest") {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	identity, identityErr := evaluationCapabilityEffectProviderJournalIdentityFromValue(value)
	sequence, sequenceOK := integerMember(value, "executionSequence")
	priorDigest, priorErr := evaluationCapabilityEffectProviderNullableDigest(value, "priorExecutionRecordDigest")
	sealedAt, sealedErr := evaluationInstant(value["sealedAt"], "capability effect Provider execution seal")
	receipt, _, receiptErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "executionReceipt", maximumEvaluationCapabilityEffectProviderJournalExecutionBytes)
	if !versionOK || version != 1 || identityErr != nil || identity != stage.evaluationCapabilityEffectProviderJournalIdentity ||
		!sequenceOK || sequence < 0 || sequence >= maximumEvaluationCapabilityEffectProviderJournalOwnerExecutions ||
		priorErr != nil || sealedErr != nil || receiptErr != nil || stringMember(value, "stageDigest") != stage.StageDigest {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrConflict
	}
	if !exactEvaluationKeys(receipt, []string{
		"format", "version", "stageDigest", "readinessReceiptDigest", "requestProjection", "cacheWarmAuthority",
		"dispatchIntent", "transportReceipt", "resultSpoolReceipt", "responseProjection", "pollSequence",
		"priorExecutionReceiptDigest", "executionStatus", "dispatchAckDigest", "executedAt", "receiptDigest",
	}) || stringMember(receipt, "format") != "prodivix.agent-evaluation-capability-effect-provider-execution" ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(receipt, "receiptDigest") {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrInvalid
	}
	receiptVersion, receiptVersionOK := integerMember(receipt, "version")
	pollSequence, pollOK := integerMember(receipt, "pollSequence")
	priorReceiptDigest, priorReceiptErr := evaluationCapabilityEffectProviderNullableDigest(receipt, "priorExecutionReceiptDigest")
	executedAt, executedErr := evaluationInstant(receipt["executedAt"], "capability effect Provider execution time")
	requestProjection, _, requestErr := evaluationCapabilityEffectProviderJournalCanonicalMember(receipt, "requestProjection", maximumEvaluationCapabilityEffectProviderJournalExecutionBytes)
	responseProjection, _, responseErr := evaluationCapabilityEffectProviderJournalCanonicalMember(receipt, "responseProjection", maximumEvaluationCapabilityEffectProviderJournalExecutionBytes)
	operation, requestDigest, requestProjectionErr := decodeEvaluationCapabilityEffectProviderRequestProjection(requestProjection)
	responseRequestDigest, responseProjectionDigest, responseBodyDigest, responseDigest, normalizedDigest, retrievalCitationResourceID, observedAt, responseProjectionErr :=
		decodeEvaluationCapabilityEffectProviderResponseProjection(responseProjection)
	if !receiptVersionOK || receiptVersion != 1 || !pollOK || pollSequence != sequence || priorReceiptErr != nil ||
		executedErr != nil || requestErr != nil || responseErr != nil || requestProjectionErr != nil || responseProjectionErr != nil ||
		stringMember(receipt, "stageDigest") != stage.StageDigest || !sealedAt.Equal(executedAt) ||
		executedAt.Before(stage.StagedAt) || !executedAt.Before(stage.ExpiresAt) || observedAt.After(executedAt) ||
		responseRequestDigest != requestDigest || stringMember(responseProjection, "requestProjectionDigest") != stringMember(requestProjection, "requestDigest") ||
		prior != nil && priorReceiptDigest != prior.ExecutionReceiptDigest || prior == nil && priorReceiptDigest != "" {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrConflict
	}
	dispatchValue, dispatchBytes, dispatchErr := evaluationCapabilityEffectProviderJournalCanonicalMember(receipt, "dispatchIntent", maximumEvaluationServiceControlBytes)
	transportValue, transportBytes, transportErr := evaluationCapabilityEffectProviderJournalCanonicalMember(receipt, "transportReceipt", maximumEvaluationServiceControlBytes)
	dispatch, dispatchDecodeErr := decodeEvaluationTransportDispatchIntent(dispatchBytes)
	transport, transportDecodeErr := decodeEvaluationTransportReceipt(transportBytes)
	if dispatchErr != nil || transportErr != nil || dispatchDecodeErr != nil || transportDecodeErr != nil ||
		dispatch.IntentDigest != stringMember(dispatchValue, "intentDigest") || transport.IntentDigest != dispatch.IntentDigest ||
		transport.ReceiptDigest != stringMember(transportValue, "receiptDigest") ||
		transport.RequestDigest != requestDigest || transport.ResponseBodyDigest != responseBodyDigest {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrConflict
	}
	record := EvaluationCapabilityEffectProviderJournalExecutionRecord{
		evaluationCapabilityEffectProviderJournalIdentity: identity, StageDigest: stage.StageDigest, ExecutionSequence: sequence,
		PriorExecutionRecordDigest: priorDigest, ExecutionReceiptDigest: stringMember(receipt, "receiptDigest"), Operation: operation,
		DispatchIntentDigest: dispatch.IntentDigest, TransportReceiptDigest: transport.ReceiptDigest,
		ResponseBodyDigest: responseBodyDigest, ResponseProjectionDigest: responseProjectionDigest,
		ResponseDigest: responseDigest, NormalizedEventSetDigest: normalizedDigest,
		RetrievalCitationResourceID: retrievalCitationResourceID, ExecutedAt: executedAt,
		SealedAt: sealedAt, RecordDigest: stringMember(value, "recordDigest"), RecordBytes: canonical,
		Value: value, ExecutionReceipt: receipt,
	}
	if !evaluationCapabilityEffectProviderExecutionSequenceMatches(stage, record, prior) {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrConflict
	}
	hasBody := responseBodyDigest != ""
	hasReceipt := receipt["resultSpoolReceipt"] != nil
	hasAAD := value["spoolAad"] != nil
	hasEnvelope := value["spoolEnvelopeAuthority"] != nil
	if hasBody != hasReceipt || hasBody != hasAAD || hasBody != hasEnvelope {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrConflict
	}
	if hasBody {
		aadValue, ok := objectMember(value, "spoolAad")
		if !ok {
			return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrInvalid
		}
		aad, aadErr := decodeEvaluationCapabilityEffectProviderSpoolAAD(aadValue)
		envelopeValue, ok := objectMember(value, "spoolEnvelopeAuthority")
		if !ok {
			return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrInvalid
		}
		envelope, envelopeErr := decodeEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(envelopeValue)
		spoolValue, ok := objectMember(receipt, "resultSpoolReceipt")
		if !ok {
			return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrInvalid
		}
		spool, spoolErr := decodeEvaluationCapabilityEffectProviderSpoolReceipt(spoolValue)
		namespaceDigest, namespaceErr := evaluationCapabilityEffectProviderNamespaceDigest(identity.NamespaceID)
		if aadErr != nil || envelopeErr != nil || spoolErr != nil || namespaceErr != nil ||
			aad.NamespaceDigest != namespaceDigest || aad.PlanDigest != identity.PlanDigest || aad.RepositoryCommit != identity.RepositoryCommit ||
			aad.AttemptID != identity.AttemptID || aad.DescriptorDigest != identity.DescriptorDigest || aad.TurnIndex != identity.TurnIndex ||
			aad.InvocationID != identity.InvocationID || aad.OwnerRequestDigest != identity.OwnerRequestDigest || aad.StageDigest != stage.StageDigest ||
			aad.ExecutionSequence != sequence || aad.DispatchIntentDigest != dispatch.IntentDigest || aad.TransportReceiptDigest != transport.ReceiptDigest ||
			aad.ResponseBodyDigest != responseBodyDigest || aad.ResponseProjectionDigest != responseProjectionDigest ||
			aad.ResponseDigest != responseDigest || aad.NormalizedEventSetDigest != normalizedDigest ||
			envelope.SpoolRef != evaluationCapabilityEffectProviderSpoolRef(aad.Digest) || envelope.AADDigest != aad.Digest ||
			spool.SpoolRef != envelope.SpoolRef || spool.AADDigest != aad.Digest || spool.EnvelopeDigest != envelope.EnvelopeDigest ||
			spool.CiphertextDigest != envelope.CiphertextDigest || spool.CiphertextSizeBytes != envelope.CiphertextSizeBytes ||
			spool.PlanDigest != identity.PlanDigest || spool.RepositoryCommit != identity.RepositoryCommit || spool.AttemptID != identity.AttemptID ||
			spool.DescriptorDigest != identity.DescriptorDigest || spool.TurnIndex != identity.TurnIndex || spool.InvocationID != identity.InvocationID ||
			spool.OwnerRequestDigest != identity.OwnerRequestDigest || spool.StageDigest != stage.StageDigest || spool.ExecutionSequence != sequence ||
			spool.DispatchIntentDigest != dispatch.IntentDigest || spool.TransportReceiptDigest != transport.ReceiptDigest ||
			spool.ResponseBodyDigest != responseBodyDigest || spool.ResponseProjectionDigest != responseProjectionDigest ||
			spool.ResponseDigest != responseDigest || spool.NormalizedEventSetDigest != normalizedDigest ||
			!spool.CreatedAt.Equal(observedAt) || spool.ExpiresAt.After(stage.ExpiresAt) {
			return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrConflict
		}
		record.SpoolReceiptDigest, record.SpoolRef = spool.ReceiptDigest, spool.SpoolRef
		record.SpoolAADDigest, record.SpoolEnvelopeDigest = aad.Digest, envelope.EnvelopeDigest
		record.CiphertextDigest, record.CiphertextSizeBytes = envelope.CiphertextDigest, envelope.CiphertextSizeBytes
		record.SpoolAAD, record.SpoolEnvelopeAuthority, record.SpoolReceipt = &aad, &envelope, &spool
	}
	envelopeProjection := cloneEvaluationObject(value)
	delete(envelopeProjection, "executionReceipt")
	envelopeBytes, envelopeErr := canonicaljson.Bytes(envelopeProjection)
	if envelopeErr != nil || len(envelopeBytes) > maximumEvaluationCapabilityEffectProviderJournalExecutionEnvelopeBytes {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, ErrInvalid
	}
	return record, nil
}

func decodeEvaluationCapabilityEffectProviderJournalExecutionWrite(
	source []byte,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	prior *EvaluationCapabilityEffectProviderJournalExecutionRecord,
) (EvaluationCapabilityEffectProviderJournalExecutionWrite, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalExecutionWriteBytes)
	if err != nil || !exactEvaluationKeys(value, []string{"format", "version", "executionRecord", "spoolEnvelope", "writeDigest"}) ||
		stringMember(value, "format") != evaluationCapabilityEffectProviderJournalExecutionWriteFormat ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "writeDigest") {
		return EvaluationCapabilityEffectProviderJournalExecutionWrite{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	recordValue, ok := objectMember(value, "executionRecord")
	if !versionOK || version != 1 || !ok {
		return EvaluationCapabilityEffectProviderJournalExecutionWrite{}, ErrInvalid
	}
	record, err := decodeEvaluationCapabilityEffectProviderJournalExecutionRecord(recordValue, stage, prior)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionWrite{}, err
	}
	write := EvaluationCapabilityEffectProviderJournalExecutionWrite{
		ExecutionRecord: record, WriteDigest: stringMember(value, "writeDigest"), WriteBytes: canonical, Value: value,
	}
	if record.SpoolReceipt == nil {
		if value["spoolEnvelope"] != nil {
			return EvaluationCapabilityEffectProviderJournalExecutionWrite{}, ErrConflict
		}
		return write, nil
	}
	envelopeValue, ok := objectMember(value, "spoolEnvelope")
	if !ok {
		return EvaluationCapabilityEffectProviderJournalExecutionWrite{}, ErrConflict
	}
	envelopeBytes, err := canonicaljson.Bytes(envelopeValue)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionWrite{}, err
	}
	envelope, err := decodeEvaluationProviderResultSpoolEnvelope(envelopeBytes)
	if err != nil || envelope.CiphertextSizeBytes > maximumEvaluationCapabilityEffectProviderSpoolCiphertextBytes ||
		envelope.SpoolID != record.SpoolRef || envelope.CiphertextDigest != record.CiphertextDigest ||
		envelope.CiphertextSizeBytes != record.CiphertextSizeBytes || envelope.AADDigest != record.SpoolAADDigest ||
		envelope.EnvelopeDigest != record.SpoolEnvelopeDigest ||
		!evaluationCapabilityEffectProviderJournalCanonicalEqual(
			evaluationCapabilityEffectProviderSpoolAuthorityFromEnvelope(envelope), record.SpoolEnvelopeAuthority.Value,
		) || evaluationCapabilityEffectProviderCiphertextDigest(envelope.Ciphertext) != record.CiphertextDigest {
		return EvaluationCapabilityEffectProviderJournalExecutionWrite{}, ErrConflict
	}
	write.SpoolEnvelope, write.SpoolEnvelopeBytes = &envelope, envelopeBytes
	return write, nil
}

func decodeEvaluationCapabilityEffectProviderSpoolDisposition(value map[string]any) (evaluationCapabilityEffectProviderSpoolDisposition, error) {
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > 65_536 || !exactEvaluationKeys(value, []string{
		"format", "version", "spoolRef", "spoolReceiptDigest", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "turnIndex", "invocationId", "ownerRequestDigest", "stageDigest", "executionSequence",
		"disposition", "resultSealReceiptDigest", "abandonmentReason", "retentionPolicyDigest", "disposedAt", "receiptDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderSpoolDispositionFormat ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "receiptDigest") {
		return evaluationCapabilityEffectProviderSpoolDisposition{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turn, turnOK := integerMember(value, "turnIndex")
	sequence, sequenceOK := integerMember(value, "executionSequence")
	resultSealDigest, resultSealErr := evaluationCapabilityEffectProviderNullableDigest(value, "resultSealReceiptDigest")
	disposedAt, disposedErr := evaluationInstant(value["disposedAt"], "capability effect Provider spool disposition")
	_, _, retentionDigest, digestErr := evaluationCapabilityEffectProviderSpoolDigests()
	disposition := stringMember(value, "disposition")
	abandonmentReason, abandonmentIsString := value["abandonmentReason"].(string)
	if value["abandonmentReason"] == nil {
		abandonmentReason, abandonmentIsString = "", true
	}
	if !versionOK || version != 1 || !turnOK || turn < 0 || turn >= 7 || !sequenceOK || sequence < 0 || sequence >= 4 ||
		resultSealErr != nil || disposedErr != nil || digestErr != nil || stringMember(value, "retentionPolicyDigest") != retentionDigest ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!oneOfString(disposition, "consumed-and-destroyed", "abandoned-and-destroyed") || !abandonmentIsString ||
		(disposition == "consumed-and-destroyed" && (resultSealDigest == "" || abandonmentReason != "")) ||
		(disposition == "abandoned-and-destroyed" && (resultSealDigest != "" || !oneOfString(abandonmentReason, "attempt-terminal", "cleanup-requested", "stage-expired"))) {
		return evaluationCapabilityEffectProviderSpoolDisposition{}, ErrConflict
	}
	for _, field := range []string{"spoolRef", "attemptId", "invocationId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderSpoolDisposition{}, ErrInvalid
		}
	}
	for _, field := range []string{"spoolReceiptDigest", "planDigest", "descriptorDigest", "ownerRequestDigest", "stageDigest", "retentionPolicyDigest", "receiptDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationCapabilityEffectProviderSpoolDisposition{}, ErrInvalid
		}
	}
	return evaluationCapabilityEffectProviderSpoolDisposition{
		SpoolRef: stringMember(value, "spoolRef"), SpoolReceiptDigest: stringMember(value, "spoolReceiptDigest"),
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		TurnIndex: turn, InvocationID: stringMember(value, "invocationId"), OwnerRequestDigest: stringMember(value, "ownerRequestDigest"),
		StageDigest: stringMember(value, "stageDigest"), ExecutionSequence: sequence, Disposition: disposition,
		ResultSealReceiptDigest: resultSealDigest, AbandonmentReason: abandonmentReason, RetentionPolicyDigest: retentionDigest,
		DisposedAt: disposedAt, ReceiptDigest: stringMember(value, "receiptDigest"), Value: value, Canonical: canonical,
	}, nil
}

func evaluationCapabilityEffectProviderSpoolDispositionMatches(
	disposition evaluationCapabilityEffectProviderSpoolDisposition,
	execution EvaluationCapabilityEffectProviderJournalExecutionRecord,
	resultSealDigest string,
	reason string,
	disposedAt time.Time,
) bool {
	if execution.SpoolReceipt == nil {
		return false
	}
	spool := execution.SpoolReceipt
	return disposition.SpoolRef == spool.SpoolRef && disposition.SpoolReceiptDigest == spool.ReceiptDigest &&
		disposition.PlanDigest == spool.PlanDigest && disposition.RepositoryCommit == spool.RepositoryCommit &&
		disposition.AttemptID == spool.AttemptID && disposition.DescriptorDigest == spool.DescriptorDigest &&
		disposition.TurnIndex == spool.TurnIndex && disposition.InvocationID == spool.InvocationID &&
		disposition.OwnerRequestDigest == spool.OwnerRequestDigest && disposition.StageDigest == spool.StageDigest &&
		disposition.ExecutionSequence == spool.ExecutionSequence && disposition.ResultSealReceiptDigest == resultSealDigest &&
		disposition.AbandonmentReason == reason && disposition.DisposedAt.Equal(disposedAt) && disposition.DisposedAt.Before(spool.ExpiresAt)
}

func decodeEvaluationCapabilityEffectProviderJournalDispositionList(value any) ([]evaluationCapabilityEffectProviderSpoolDisposition, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > maximumEvaluationCapabilityEffectProviderJournalOwnerExecutions {
		return nil, ErrInvalid
	}
	result := make([]evaluationCapabilityEffectProviderSpoolDisposition, 0, len(raw))
	for _, item := range raw {
		object, ok := item.(map[string]any)
		if !ok {
			return nil, ErrInvalid
		}
		decoded, err := decodeEvaluationCapabilityEffectProviderSpoolDisposition(object)
		if err != nil {
			return nil, err
		}
		result = append(result, decoded)
	}
	return result, nil
}

func evaluationCapabilityEffectProviderJournalResultEnvelope(value map[string]any) ([]byte, error) {
	envelope := cloneEvaluationObject(value)
	delete(envelope, "businessResult")
	return canonicaljson.Bytes(envelope)
}

func evaluationCapabilityEffectProviderJournalFactDigest(fact map[string]any) (string, error) {
	if !exactEvaluationKeys(fact, []string{"factKind", "factDigest", "value"}) {
		return "", ErrInvalid
	}
	value, ok := objectMember(fact, "value")
	if !ok {
		return "", ErrInvalid
	}
	var digest string
	var err error
	switch stringMember(fact, "factKind") {
	case "provider-job-receipt":
		digest, err = validateEvaluationProviderCapabilityFact("provider-job", value)
	case "provider-cache-receipt":
		digest, err = validateEvaluationProviderCapabilityFact("provider-cache", value)
	case "retrieval-query-receipt":
		digest, err = validateEvaluationProviderCapabilityFact("retrieval-query", value)
	case "opaque-continuation":
		digest, err = validateEvaluationProviderOpaqueContinuation(value)
	default:
		return "", ErrInvalid
	}
	if err != nil || digest != stringMember(fact, "factDigest") {
		return "", ErrConflict
	}
	return digest, nil
}

func evaluationCapabilityEffectProviderJournalHostedFactMatches(
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	execution EvaluationCapabilityEffectProviderJournalExecutionRecord,
	fact map[string]any,
) bool {
	if stage.BindingKind != "hosted-retrieval-query" || stringMember(fact, "factKind") != "retrieval-query-receipt" {
		return false
	}
	runtimeAuthority, ok := objectMember(stage.PreEffectIntent, "runtimeFactSourceAuthority")
	if !ok {
		return false
	}
	program, err := expectedEvaluationCapabilityProbeProgram(
		stringMember(runtimeAuthority, "capabilityProfileId"),
		stringMember(runtimeAuthority, "capabilityProfileDigest"),
	)
	if err != nil || program.PublicProbeResource == nil {
		return false
	}
	requestProjection, requestOK := objectMember(stage.StageRequest, "requestProjection")
	providerAuthority, authorityOK := objectMember(stage.StageRequest, "providerResourceAuthority")
	responseProjection, responseOK := objectMember(execution.ExecutionReceipt, "responseProjection")
	dispatchIntent, dispatchOK := objectMember(execution.ExecutionReceipt, "dispatchIntent")
	if !requestOK || !authorityOK || !responseOK || !dispatchOK ||
		stringMember(requestProjection, "probeProgramDigest") != program.ProgramDigest ||
		stringMember(providerAuthority, "probeProgramDigest") != program.ProgramDigest ||
		stringMember(providerAuthority, "publicResourceDescriptorDigest") != stringMember(program.PublicProbeResource, "descriptorDigest") ||
		responseProjection["outputMarkerObserved"] != true {
		return false
	}
	usageVectorDigest, usageErr := evaluationCapabilityEffectProviderNullableDigest(responseProjection, "usageVectorDigest")
	if usageErr != nil || usageVectorDigest == "" {
		return false
	}
	requestDigest := stringMember(responseProjection, "requestDigest")
	responseDigest := stringMember(responseProjection, "responseDigest")
	if !evaluationDigestPattern.MatchString(requestDigest) || !evaluationDigestPattern.MatchString(responseDigest) {
		return false
	}
	sourceRefs := []any{}
	sourceDigests := []any{}
	if execution.RetrievalCitationResourceID != "" {
		citationID := execution.RetrievalCitationResourceID
		matchesAuthority := stringMember(providerAuthority, "providerResourceId") == citationID
		if !matchesAuthority {
			auxiliary, auxiliaryOK := arrayMember(providerAuthority, "auxiliaryResourceIds")
			if !auxiliaryOK {
				return false
			}
			for _, candidate := range auxiliary {
				if candidate == citationID {
					matchesAuthority = true
					break
				}
			}
		}
		if !matchesAuthority {
			return false
		}
		sourceIdentityDigest, digestErr := canonicaljson.Digest(map[string]any{
			"requestDigest": requestDigest, "responseDigest": responseDigest, "citationResourceId": citationID,
		})
		if digestErr != nil {
			return false
		}
		sourceResultID := "provider-citation." + sourceIdentityDigest[len("sha256-"):]
		sourceBase := map[string]any{
			"sourceResultId": sourceResultID, "retrievedAt": responseProjection["observedAt"],
			"providerCitationRef": citationID, "authority": "external-untrusted",
			"instructionBoundary": "data-only", "availability": "unavailable",
		}
		sourceDigest, digestErr := canonicaljson.Digest(sourceBase)
		if digestErr != nil {
			return false
		}
		sourceRefs = append(sourceRefs, sourceResultID)
		sourceDigests = append(sourceDigests, sourceDigest)
	}
	toolDescriptorDigest, err := canonicaljson.Digest(map[string]any{
		"toolId":                           stringMember(stage.PreEffectIntent, "toolId"),
		"runtimeFactSourceAuthorityDigest": stringMember(runtimeAuthority, "authorityDigest"),
	})
	if err != nil {
		return false
	}
	receiptBase := map[string]any{
		"queryId":              "retrieval-query." + requestDigest[len("sha256-"):],
		"toolDescriptorDigest": toolDescriptorDigest,
		"queryDigest":          stringMember(program.PublicProbeResource, "queryDigest"),
		"purpose":              "public-research",
		"networkPolicyDigest":  stringMember(providerAuthority, "networkPolicyAuthorityDigest"),
		"sourceResultRefs":     sourceRefs,
		"sourceResultDigests":  sourceDigests,
		"indexDigest":          stringMember(program.PublicProbeResource, "indexDigest"),
		"usageRef":             "usage." + usageVectorDigest[len("sha256-"):],
		"startedAt":            dispatchIntent["createdAt"],
		"completedAt":          responseProjection["observedAt"],
	}
	if execution.RetrievalCitationResourceID == "" {
		receiptBase["retrievalConfigurationDigest"] = stringMember(providerAuthority, "authorityDigest")
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return false
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["receiptDigest"] = receiptDigest
	expected := map[string]any{"factKind": "retrieval-query-receipt", "factDigest": receiptDigest, "value": receipt}
	return sameEvaluationCanonicalValue(fact, expected)
}

func decodeEvaluationCapabilityEffectProviderJournalResultRecord(
	source []byte,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	executions []EvaluationCapabilityEffectProviderJournalExecutionRecord,
) (EvaluationCapabilityEffectProviderJournalResultRecord, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalResultBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest", "turnIndex",
		"invocationId", "ownerRequestId", "ownerRequestDigest", "runtimeFactSourceAuthorityDigest", "preEffectIntentDigest",
		"stageDigest", "terminalExecutionRecordDigest", "businessResult", "effectSourceFact", "stateVaultRetireRequest",
		"stateVaultRetirementReceipt", "nextStateVaultSealRequest", "nextStateVaultSealReceipt", "resultSealReceipt",
		"spoolDispositionReceipts", "sealedAt", "recordDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderJournalResultFormat ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "recordDigest") || len(executions) < 1 || len(executions) > 4 {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	identity, identityErr := evaluationCapabilityEffectProviderJournalIdentityFromValue(value)
	sealedAt, sealedErr := evaluationInstant(value["sealedAt"], "capability effect Provider result seal")
	terminal := executions[len(executions)-1]
	if !versionOK || version != 1 || identityErr != nil || identity != stage.evaluationCapabilityEffectProviderJournalIdentity ||
		sealedErr != nil || stringMember(value, "stageDigest") != stage.StageDigest ||
		stringMember(value, "terminalExecutionRecordDigest") != terminal.RecordDigest || sealedAt.Before(terminal.ExecutedAt) ||
		!sealedAt.Before(stage.ExpiresAt) || sealedAt.Sub(terminal.ExecutedAt) > maximumEvaluationCapabilityEffectProviderSpoolLifetime {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	business, _, businessErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "businessResult", maximumEvaluationCapabilityEffectProviderJournalResultBytes)
	if businessErr != nil || !exactEvaluationKeys(business, []string{"status", "providerStatus", "outputText", "responseDigest", "resultDigest"}) ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(business, "resultDigest") {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrInvalid
	}
	terminalResponse, ok := objectMember(terminal.ExecutionReceipt, "responseProjection")
	if !ok || stringMember(business, "status") != stringMember(terminal.ExecutionReceipt, "executionStatus") ||
		business["providerStatus"] != terminalResponse["providerStatus"] || stringMember(business, "responseDigest") != terminal.ResponseDigest {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	outputText, outputIsString := business["outputText"].(string)
	outputDigest, outputErr := evaluationCapabilityEffectProviderNullableDigest(terminalResponse, "outputTextDigest")
	if business["outputText"] == nil {
		outputText, outputIsString = "", true
	}
	if outputErr != nil || !outputIsString || (business["outputText"] == nil) != (outputDigest == "") {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	if outputDigest != "" {
		computed, digestErr := canonicaljson.Digest(map[string]any{"text": outputText})
		if digestErr != nil || computed != outputDigest {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
		}
	}
	resultSeal, _, resultSealErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "resultSealReceipt", maximumEvaluationCapabilityEffectProviderJournalResultBytes)
	if resultSealErr != nil || !exactEvaluationKeys(resultSeal, []string{
		"format", "version", "stageDigest", "executionReceiptDigest", "readinessReceiptDigest", "resultStatus",
		"businessResultDigest", "sourceFactKind", "sourceFactDigest", "stateVaultRetireRequestDigest",
		"stateVaultRetirementReceiptDigest", "nextStateVaultSealRequestDigest", "nextStateVaultSealReceiptDigest",
		"providerResourceSetCommitmentDigest", "providerResourceAuthorityDigest", "providerResourceReadRequestDigest",
		"providerResourceReadReceiptDigest", "consumedInputSourceFactDigest", "sealedAt", "receiptDigest",
	}) || stringMember(resultSeal, "format") != "prodivix.agent-evaluation-capability-effect-provider-result-seal-receipt" ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(resultSeal, "receiptDigest") {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrInvalid
	}
	resultSealTime, resultSealTimeErr := evaluationInstant(resultSeal["sealedAt"], "capability effect Provider result receipt seal")
	resultStatus := stringMember(resultSeal, "resultStatus")
	sourceFactDigest, sourceFactErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "sourceFactDigest")
	retireRequestDigest, retireRequestErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "stateVaultRetireRequestDigest")
	retirementReceiptDigest, retirementErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "stateVaultRetirementReceiptDigest")
	nextSealRequestDigest, nextSealRequestErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "nextStateVaultSealRequestDigest")
	nextSealReceiptDigest, nextSealReceiptErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "nextStateVaultSealReceiptDigest")
	providerSetDigest, providerSetErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "providerResourceSetCommitmentDigest")
	providerAuthorityDigest, providerAuthorityErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "providerResourceAuthorityDigest")
	providerReadRequestDigest, providerReadRequestErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "providerResourceReadRequestDigest")
	providerReadReceiptDigest, providerReadReceiptErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "providerResourceReadReceiptDigest")
	consumedSourceDigest, consumedErr := evaluationCapabilityEffectProviderNullableDigest(resultSeal, "consumedInputSourceFactDigest")
	if resultSealTimeErr != nil || !resultSealTime.Equal(sealedAt) || sourceFactErr != nil || retireRequestErr != nil || retirementErr != nil ||
		nextSealRequestErr != nil || nextSealReceiptErr != nil || providerSetErr != nil || providerAuthorityErr != nil ||
		providerReadRequestErr != nil || providerReadReceiptErr != nil || consumedErr != nil ||
		!oneOfString(resultStatus, "produced", "failed", "unavailable") || stringMember(resultSeal, "stageDigest") != stage.StageDigest ||
		stringMember(resultSeal, "executionReceiptDigest") != terminal.ExecutionReceiptDigest ||
		stringMember(resultSeal, "businessResultDigest") != stringMember(business, "resultDigest") ||
		providerSetDigest != stage.ProviderResourceSetCommitmentDigest || providerAuthorityDigest != stage.ProviderResourceAuthorityDigest ||
		providerReadRequestDigest != stage.ProviderResourceReadRequestDigest || providerReadReceiptDigest != stage.ProviderResourceReadReceiptDigest ||
		(stage.BindingKind == "hosted-retrieval-query") != (consumedSourceDigest == "") {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	var effectFact map[string]any
	if value["effectSourceFact"] != nil {
		var ok bool
		effectFact, ok = objectMember(value, "effectSourceFact")
		factDigest, factErr := evaluationCapabilityEffectProviderJournalFactDigest(effectFact)
		if !ok || factErr != nil || factDigest != sourceFactDigest ||
			stringMember(effectFact, "factKind") != stringMember(resultSeal, "sourceFactKind") ||
			resultStatus != "produced" {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
		}
		if stage.BindingKind == "hosted-retrieval-query" &&
			!evaluationCapabilityEffectProviderJournalHostedFactMatches(stage, terminal, effectFact) {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
		}
	} else if sourceFactDigest != "" || resultSeal["sourceFactKind"] != nil || resultStatus == "produced" {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	executionStatus := stringMember(terminal.ExecutionReceipt, "executionStatus")
	expectedResultStatus := map[string]string{
		"completed": "produced", "failed": "failed", "unavailable": "unavailable",
	}[executionStatus]
	if expectedResultStatus == "" || resultStatus != expectedResultStatus {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	stateful := stage.BindingKind == "provider-job" || stage.BindingKind == "opaque-continuation"
	if stateful != (value["stateVaultRetireRequest"] != nil && value["stateVaultRetirementReceipt"] != nil) ||
		(!stateful && (retireRequestDigest != "" || retirementReceiptDigest != "")) {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	if stateful {
		retireRequest, _, memberErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "stateVaultRetireRequest", maximumEvaluationCapabilityEffectProviderJournalResultBytes)
		retirementReceipt, _, receiptErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "stateVaultRetirementReceipt", maximumEvaluationCapabilityEffectProviderJournalResultBytes)
		if memberErr != nil || receiptErr != nil || stringMember(retireRequest, "retireRequestDigest") != retireRequestDigest ||
			stringMember(retireRequest, "disposition") != "consumed" || stringMember(retirementReceipt, "receiptDigest") != retirementReceiptDigest {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
		}
	}
	continuationNext := stage.BindingKind == "opaque-continuation" && resultStatus == "produced"
	if continuationNext != (value["nextStateVaultSealRequest"] != nil && value["nextStateVaultSealReceipt"] != nil) ||
		continuationNext != (nextSealRequestDigest != "" && nextSealReceiptDigest != "") {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	if continuationNext {
		nextRequest, _, requestErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "nextStateVaultSealRequest", maximumEvaluationCapabilityEffectProviderJournalResultBytes)
		nextReceipt, _, receiptErr := evaluationCapabilityEffectProviderJournalCanonicalMember(value, "nextStateVaultSealReceipt", maximumEvaluationCapabilityEffectProviderJournalResultBytes)
		if requestErr != nil || receiptErr != nil || stringMember(nextRequest, "sealRequestDigest") != nextSealRequestDigest ||
			stringMember(nextReceipt, "receiptDigest") != nextSealReceiptDigest || stringMember(nextReceipt, "status") != "sealed" {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
		}
	}
	dispositions, dispositionsErr := decodeEvaluationCapabilityEffectProviderJournalDispositionList(value["spoolDispositionReceipts"])
	spooled := make([]EvaluationCapabilityEffectProviderJournalExecutionRecord, 0, len(executions))
	for _, execution := range executions {
		if execution.SpoolReceipt != nil {
			spooled = append(spooled, execution)
		}
	}
	if dispositionsErr != nil || len(dispositions) != len(spooled) {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
	}
	for index, disposition := range dispositions {
		if !evaluationCapabilityEffectProviderSpoolDispositionMatches(
			disposition, spooled[index], stringMember(resultSeal, "receiptDigest"), "", sealedAt,
		) || disposition.Disposition != "consumed-and-destroyed" {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrConflict
		}
	}
	envelopeBytes, envelopeErr := evaluationCapabilityEffectProviderJournalResultEnvelope(value)
	if envelopeErr != nil || len(envelopeBytes) > maximumEvaluationCapabilityEffectProviderJournalResultEnvelopeBytes {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, ErrInvalid
	}
	return EvaluationCapabilityEffectProviderJournalResultRecord{
		evaluationCapabilityEffectProviderJournalIdentity: identity, StageDigest: stage.StageDigest,
		TerminalExecutionRecordDigest: terminal.RecordDigest, BusinessResultDigest: stringMember(business, "resultDigest"),
		ResultStatus: resultStatus, SourceFactKind: stringMember(resultSeal, "sourceFactKind"), SourceFactDigest: sourceFactDigest,
		StateVaultRetireRequestDigest: retireRequestDigest, StateVaultRetirementReceiptDigest: retirementReceiptDigest,
		NextStateVaultSealRequestDigest: nextSealRequestDigest, NextStateVaultSealReceiptDigest: nextSealReceiptDigest,
		ProviderResourceSetCommitmentDigest: providerSetDigest, ProviderResourceAuthorityDigest: providerAuthorityDigest,
		ProviderResourceReadRequestDigest: providerReadRequestDigest, ProviderResourceReadReceiptDigest: providerReadReceiptDigest,
		ConsumedInputSourceFactDigest: consumedSourceDigest, ResultSealReceiptDigest: stringMember(resultSeal, "receiptDigest"),
		RecordDigest: stringMember(value, "recordDigest"), SealedAt: sealedAt, RecordBytes: canonical, Value: value,
		BusinessResult: business, EffectSourceFact: effectFact, ResultSealReceipt: resultSeal, SpoolDispositions: dispositions,
	}, nil
}

func decodeEvaluationCapabilityEffectProviderJournalAbandonmentRecord(
	value map[string]any,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	executions []EvaluationCapabilityEffectProviderJournalExecutionRecord,
) (EvaluationCapabilityEffectProviderJournalAbandonmentRecord, error) {
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationCapabilityEffectProviderJournalResultBytes || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest", "turnIndex",
		"invocationId", "ownerRequestId", "ownerRequestDigest", "runtimeFactSourceAuthorityDigest", "preEffectIntentDigest",
		"stageDigest", "lastExecutionRecordDigest", "reason", "spoolDispositionReceipts", "abandonedAt", "recordDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectProviderJournalAbandonmentFormat ||
		!evaluationCapabilityEffectProviderJournalSelfDigest(value, "recordDigest") || len(executions) > 4 {
		return EvaluationCapabilityEffectProviderJournalAbandonmentRecord{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	identity, identityErr := evaluationCapabilityEffectProviderJournalIdentityFromValue(value)
	lastDigest, lastErr := evaluationCapabilityEffectProviderNullableDigest(value, "lastExecutionRecordDigest")
	abandonedAt, abandonedErr := evaluationInstant(value["abandonedAt"], "capability effect Provider abandonment")
	reason := stringMember(value, "reason")
	expectedLast := ""
	latest := stage.SealedAt
	if len(executions) > 0 {
		expectedLast = executions[len(executions)-1].RecordDigest
		latest = executions[len(executions)-1].SealedAt
	}
	if !versionOK || version != 1 || identityErr != nil || identity != stage.evaluationCapabilityEffectProviderJournalIdentity ||
		lastErr != nil || lastDigest != expectedLast || abandonedErr != nil || abandonedAt.Before(latest) ||
		stringMember(value, "stageDigest") != stage.StageDigest || !oneOfString(reason, "attempt-terminal", "cleanup-requested", "stage-expired") ||
		reason == "stage-expired" && abandonedAt.Before(stage.ExpiresAt) {
		return EvaluationCapabilityEffectProviderJournalAbandonmentRecord{}, ErrConflict
	}
	dispositions, dispositionsErr := decodeEvaluationCapabilityEffectProviderJournalDispositionList(value["spoolDispositionReceipts"])
	spooled := make([]EvaluationCapabilityEffectProviderJournalExecutionRecord, 0, len(executions))
	for _, execution := range executions {
		if execution.SpoolReceipt != nil {
			spooled = append(spooled, execution)
		}
	}
	if dispositionsErr != nil || len(dispositions) != len(spooled) {
		return EvaluationCapabilityEffectProviderJournalAbandonmentRecord{}, ErrConflict
	}
	for index, disposition := range dispositions {
		if disposition.Disposition != "abandoned-and-destroyed" ||
			!evaluationCapabilityEffectProviderSpoolDispositionMatches(disposition, spooled[index], "", reason, abandonedAt) {
			return EvaluationCapabilityEffectProviderJournalAbandonmentRecord{}, ErrConflict
		}
	}
	return EvaluationCapabilityEffectProviderJournalAbandonmentRecord{
		evaluationCapabilityEffectProviderJournalIdentity: identity, StageDigest: stage.StageDigest,
		LastExecutionRecordDigest: lastDigest, Reason: reason, AbandonedAt: abandonedAt,
		RecordDigest: stringMember(value, "recordDigest"), RecordBytes: canonical, Value: value, SpoolDispositions: dispositions,
	}, nil
}
