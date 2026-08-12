package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationNativeProviderStateVaultAuthorityFormat         = "prodivix.agent-native-provider-state-vault-authority"
	evaluationNativeProviderStateVaultSealCommandFormat       = "prodivix.agent-evaluation-native-provider-state-vault-seal-command"
	evaluationNativeProviderStateVaultSealRequestFormat       = "prodivix.agent-native-provider-state-vault-seal-request"
	evaluationNativeProviderStateVaultSealReceiptFormat       = "prodivix.agent-native-provider-state-vault-seal-receipt"
	evaluationNativeProviderStateVaultResolveRequestFormat    = "prodivix.agent-native-provider-state-vault-resolve-request"
	evaluationNativeProviderStateVaultResolveReceiptFormat    = "prodivix.agent-native-provider-state-vault-resolve-receipt"
	evaluationNativeProviderStateVaultResolveResultFormat     = "prodivix.agent-evaluation-native-provider-state-vault-resolve-result"
	evaluationNativeProviderStateVaultRetireRequestFormat     = "prodivix.agent-native-provider-state-vault-retire-request"
	evaluationNativeProviderStateVaultRetirementReceiptFormat = "prodivix.agent-native-provider-state-vault-retirement-receipt"
	evaluationNativeProviderStateVaultHealthFormat            = "prodivix.agent-evaluation-native-provider-state-vault-health"
	evaluationNativeProviderStateVaultPurpose                 = "native-provider-state-vault-owner"
	evaluationNativeProviderStateVaultPurposeHeader           = "X-Prodivix-Native-Provider-State-Vault-Purpose"
	evaluationNativeProviderStateVaultAuthorityID             = "evaluation.native-provider-state-vault.owner.v1"
	evaluationNativeProviderStateVaultVersion                 = int64(1)

	maximumEvaluationNativeProviderStateVaultComponentBytes = 16_384
	maximumEvaluationNativeProviderStateVaultEnvelopeBytes  = 32_768
	maximumEvaluationNativeProviderStateVaultHandleBytes    = 512
	maximumEvaluationNativeProviderStateVaultRecords        = 5_880
	evaluationNativeProviderStateVaultLifetime              = 125 * time.Second
	evaluationNativeProviderStateVaultMaximumACKDelay       = 30 * time.Second
)

type EvaluationNativeProviderStateVaultAuthority struct {
	Format                        string `json:"format"`
	Version                       int64  `json:"version"`
	AuthorityID                   string `json:"authorityId"`
	AuthorityImplementationDigest string `json:"authorityImplementationDigest"`
	StorageMode                   string `json:"storageMode"`
	CryptographicExpiryMode       string `json:"cryptographicExpiryMode"`
	Algorithm                     string `json:"algorithm"`
	KeyReferenceDigest            string `json:"keyReferenceDigest"`
	KeyVersion                    int64  `json:"keyVersion"`
	EncryptionProfileDigest       string `json:"encryptionProfileDigest"`
	RetentionPolicyDigest         string `json:"retentionPolicyDigest"`
	DeletionReceiptPolicyDigest   string `json:"deletionReceiptPolicyDigest"`
	MaximumLifetimeMS             int64  `json:"maximumLifetimeMs"`
	MaximumLifecycleACKDelayMS    int64  `json:"maximumLifecycleAckDelayMs"`
	ReconciliationMode            string `json:"reconciliationMode"`
	AuthorityDigest               string `json:"authorityDigest"`
}

func newEvaluationNativeProviderStateVaultAuthority() (EvaluationNativeProviderStateVaultAuthority, error) {
	implementationDigest, err := canonicaljson.Digest(map[string]any{
		"component": "production-native-provider-state-vault", "version": int64(1),
		"algorithm": "aes-256-gcm", "ciphertextEncoding": "identity-safe-base64url",
		"plaintextResidency": "callback-only",
	})
	if err != nil {
		return EvaluationNativeProviderStateVaultAuthority{}, err
	}
	keyReferenceDigest, err := canonicaljson.Digest(map[string]any{
		"keyId": "g4-model-evaluation-native-provider-state-vault", "keyVersion": int64(1),
		"keyEnvironmentName": "PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64",
		"keyRef":             "secret://g4-model-evaluation/native-provider-state-vault",
	})
	if err != nil {
		return EvaluationNativeProviderStateVaultAuthority{}, err
	}
	encryptionProfileDigest, err := canonicaljson.Digest(map[string]any{
		"algorithm": "aes-256-gcm", "nonceBytes": int64(12), "authenticationTagBytes": int64(16),
		"aadFormat": "prodivix.agent-native-provider-state-vault-aad", "aadVersion": int64(1),
		"maximumPlaintextBytes": int64(maximumEvaluationNativeProviderStateVaultHandleBytes),
	})
	if err != nil {
		return EvaluationNativeProviderStateVaultAuthority{}, err
	}
	retentionPolicyDigest, err := canonicaljson.Digest(map[string]any{
		"maximumAgeMs": int64(evaluationNativeProviderStateVaultLifetime / time.Millisecond),
		"disposition":  "expire-after-source-seal-or-maximum-lifetime",
	})
	if err != nil {
		return EvaluationNativeProviderStateVaultAuthority{}, err
	}
	deletionReceiptPolicyDigest, err := canonicaljson.Digest(map[string]any{
		"plaintextResidency": "callback-only", "encryptedReferenceDisposition": "cryptographic-expiry",
		"deletionReceipt": "source-seal-or-expiry-authority",
	})
	if err != nil {
		return EvaluationNativeProviderStateVaultAuthority{}, err
	}
	authority := EvaluationNativeProviderStateVaultAuthority{
		Format: evaluationNativeProviderStateVaultAuthorityFormat, Version: evaluationNativeProviderStateVaultVersion,
		AuthorityID:                   evaluationNativeProviderStateVaultAuthorityID,
		AuthorityImplementationDigest: implementationDigest,
		StorageMode:                   "server-side-vault-record", CryptographicExpiryMode: "per-state-data-key-destroy",
		Algorithm: "aes-256-gcm", KeyReferenceDigest: keyReferenceDigest, KeyVersion: 1,
		EncryptionProfileDigest: encryptionProfileDigest, RetentionPolicyDigest: retentionPolicyDigest,
		DeletionReceiptPolicyDigest: deletionReceiptPolicyDigest,
		MaximumLifetimeMS:           int64(evaluationNativeProviderStateVaultLifetime / time.Millisecond),
		MaximumLifecycleACKDelayMS:  int64(evaluationNativeProviderStateVaultMaximumACKDelay / time.Millisecond),
		ReconciliationMode:          "request-digest-idempotent",
	}
	base := evaluationNativeProviderStateVaultAuthorityBase(authority)
	authority.AuthorityDigest, err = canonicaljson.Digest(base)
	return authority, err
}

func evaluationNativeProviderStateVaultAuthorityBase(authority EvaluationNativeProviderStateVaultAuthority) map[string]any {
	return map[string]any{
		"format": authority.Format, "version": authority.Version, "authorityId": authority.AuthorityID,
		"authorityImplementationDigest": authority.AuthorityImplementationDigest,
		"storageMode":                   authority.StorageMode, "cryptographicExpiryMode": authority.CryptographicExpiryMode,
		"algorithm": authority.Algorithm, "keyReferenceDigest": authority.KeyReferenceDigest,
		"keyVersion": authority.KeyVersion, "encryptionProfileDigest": authority.EncryptionProfileDigest,
		"retentionPolicyDigest":       authority.RetentionPolicyDigest,
		"deletionReceiptPolicyDigest": authority.DeletionReceiptPolicyDigest,
		"maximumLifetimeMs":           authority.MaximumLifetimeMS,
		"maximumLifecycleAckDelayMs":  authority.MaximumLifecycleACKDelayMS,
		"reconciliationMode":          authority.ReconciliationMode,
	}
}

func validateEvaluationNativeProviderStateVaultAuthority(authority EvaluationNativeProviderStateVaultAuthority) error {
	expected, err := newEvaluationNativeProviderStateVaultAuthority()
	if err != nil {
		return err
	}
	left, leftErr := canonicaljson.Bytes(authority)
	right, rightErr := canonicaljson.Bytes(expected)
	if leftErr != nil || rightErr != nil || !bytes.Equal(left, right) {
		return ErrConflict
	}
	return nil
}

type evaluationNativeProviderStateVaultSealRequest struct {
	AuthorityDigest              string
	Purpose                      string
	AttemptID                    string
	ProtocolFamily               string
	ProviderStateReferenceKind   string
	ProviderStateReferenceDigest string
	ProbeProgramDigest           string
	CapabilityProfileDigest      string
	InvocationID                 string
	RequestDigest                string
	ResponseDigest               string
	ResponseBodyDigest           string
	SealedResponseJSONDigest     string
	ProviderConfigurationID      string
	ModelLineageDigest           string
	AdapterDigest                string
	TaskID                       string
	RunID                        string
	Generation                   int64
	ObservedAt                   time.Time
	ExpiresAt                    time.Time
	SealRequestDigest            string
	Value                        map[string]any
	Bytes                        []byte
}

type evaluationNativeProviderStateVaultSealCommand struct {
	Request                          evaluationNativeProviderStateVaultSealRequest
	CallbackLocalProviderStateHandle string
	Bytes                            []byte
}

func decodeEvaluationNativeProviderStateVaultSealCommand(source []byte) (evaluationNativeProviderStateVaultSealCommand, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultEnvelopeBytes)
	if err != nil || !exactEvaluationKeys(value, []string{"format", "version", "request", "callbackLocalProviderStateHandle"}) ||
		stringMember(value, "format") != evaluationNativeProviderStateVaultSealCommandFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationNativeProviderStateVaultSealCommand{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	requestValue, requestOK := objectMember(value, "request")
	handle := stringMember(value, "callbackLocalProviderStateHandle")
	if !versionOK || version != 1 || !requestOK || len([]byte(handle)) == 0 ||
		len([]byte(handle)) > maximumEvaluationNativeProviderStateVaultHandleBytes ||
		!validEvaluationAgentControlIdentity(handle) {
		return evaluationNativeProviderStateVaultSealCommand{}, ErrInvalid
	}
	requestBytes, err := canonicaljson.Bytes(requestValue)
	if err != nil {
		return evaluationNativeProviderStateVaultSealCommand{}, ErrInvalid
	}
	request, err := decodeEvaluationNativeProviderStateVaultSealRequest(requestBytes)
	if err != nil {
		return evaluationNativeProviderStateVaultSealCommand{}, err
	}
	handleDigest, err := canonicaljson.Digest(map[string]any{
		"kind": request.ProviderStateReferenceKind, "value": handle,
	})
	if err != nil || handleDigest != request.ProviderStateReferenceDigest {
		return evaluationNativeProviderStateVaultSealCommand{}, ErrConflict
	}
	return evaluationNativeProviderStateVaultSealCommand{Request: request, CallbackLocalProviderStateHandle: handle, Bytes: canonical}, nil
}

func decodeEvaluationNativeProviderStateVaultSealRequest(source []byte) (evaluationNativeProviderStateVaultSealRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "authorityDigest", "purpose", "attemptId", "protocolFamily",
		"providerStateReferenceKind", "providerStateReferenceDigest", "probeProgramDigest",
		"capabilityProfileDigest", "invocationId", "requestDigest", "responseDigest",
		"responseBodyDigest", "sealedResponseJsonDigest", "providerConfigurationId",
		"modelLineageDigest", "adapterDigest", "taskId", "runId", "generation",
		"observedAt", "expiresAt", "sealRequestDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultSealRequestFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationNativeProviderStateVaultSealRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	generation, generationOK := integerMember(value, "generation")
	observedAt, observedErr := evaluationInstant(value["observedAt"], "state vault observedAt")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "state vault expiresAt")
	protocol := stringMember(value, "protocolFamily")
	referenceKind := stringMember(value, "providerStateReferenceKind")
	if !versionOK || version != 1 || !generationOK || generation < 0 || observedErr != nil || expiresErr != nil ||
		expiresAt.Sub(observedAt) != evaluationNativeProviderStateVaultLifetime ||
		!oneOfString(stringMember(value, "purpose"), "background-job-state", "reasoning-continuation-state") ||
		!((protocol == "openai-responses" && referenceKind == "response-id") ||
			(protocol == "gemini-interactions" && referenceKind == "interaction-id")) {
		return evaluationNativeProviderStateVaultSealRequest{}, ErrInvalid
	}
	for _, field := range []string{"attemptId", "invocationId", "providerConfigurationId", "taskId", "runId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationNativeProviderStateVaultSealRequest{}, ErrInvalid
		}
	}
	for _, field := range []string{
		"authorityDigest", "providerStateReferenceDigest", "probeProgramDigest", "capabilityProfileDigest",
		"requestDigest", "responseDigest", "responseBodyDigest", "sealedResponseJsonDigest",
		"modelLineageDigest", "adapterDigest", "sealRequestDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationNativeProviderStateVaultSealRequest{}, ErrInvalid
		}
	}
	base := cloneEvaluationObject(value)
	delete(base, "sealRequestDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "sealRequestDigest") {
		return evaluationNativeProviderStateVaultSealRequest{}, ErrConflict
	}
	return evaluationNativeProviderStateVaultSealRequest{
		AuthorityDigest: stringMember(value, "authorityDigest"), Purpose: stringMember(value, "purpose"),
		AttemptID: stringMember(value, "attemptId"), ProtocolFamily: protocol,
		ProviderStateReferenceKind:   referenceKind,
		ProviderStateReferenceDigest: stringMember(value, "providerStateReferenceDigest"),
		ProbeProgramDigest:           stringMember(value, "probeProgramDigest"),
		CapabilityProfileDigest:      stringMember(value, "capabilityProfileDigest"),
		InvocationID:                 stringMember(value, "invocationId"), RequestDigest: stringMember(value, "requestDigest"),
		ResponseDigest: stringMember(value, "responseDigest"), ResponseBodyDigest: stringMember(value, "responseBodyDigest"),
		SealedResponseJSONDigest: stringMember(value, "sealedResponseJsonDigest"),
		ProviderConfigurationID:  stringMember(value, "providerConfigurationId"),
		ModelLineageDigest:       stringMember(value, "modelLineageDigest"), AdapterDigest: stringMember(value, "adapterDigest"),
		TaskID: stringMember(value, "taskId"), RunID: stringMember(value, "runId"), Generation: generation,
		ObservedAt: observedAt, ExpiresAt: expiresAt, SealRequestDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

type evaluationNativeProviderStateVaultSealReceipt struct {
	AuthorityDigest               string
	SealRequestDigest             string
	ProviderStateReferenceDigest  string
	Status                        string
	OpaqueProviderStateRef        string
	StateKeyCreationReceiptDigest string
	SealedAt                      time.Time
	ExpiresAt                     time.Time
	RetirementRequired            bool
	ReceiptDigest                 string
	Value                         map[string]any
	Bytes                         []byte
}

func createEvaluationNativeProviderStateVaultOpaqueRef(authorityDigest, requestDigest, creationDigest string) (string, error) {
	digest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-opaque-ref", "version": int64(1),
		"authorityDigest": authorityDigest, "sealRequestDigest": requestDigest,
		"stateKeyCreationReceiptDigest": creationDigest,
	})
	if err != nil {
		return "", err
	}
	return "state-vault-ref." + digest[len("sha256-"):], nil
}

func createEvaluationNativeProviderStateVaultSealReceipt(
	request evaluationNativeProviderStateVaultSealRequest,
	status, opaqueRef, creationDigest string,
	sealedAt time.Time,
) (evaluationNativeProviderStateVaultSealReceipt, error) {
	if !oneOfString(status, "sealed", "failed", "unavailable") || sealedAt.Before(request.ObservedAt) ||
		sealedAt.Sub(request.ObservedAt) > evaluationNativeProviderStateVaultMaximumACKDelay {
		return evaluationNativeProviderStateVaultSealReceipt{}, ErrInvalid
	}
	var expires any
	retirementRequired := status == "sealed"
	if retirementRequired {
		expectedRef, err := createEvaluationNativeProviderStateVaultOpaqueRef(request.AuthorityDigest, request.SealRequestDigest, creationDigest)
		if err != nil || !evaluationDigestPattern.MatchString(creationDigest) || opaqueRef != expectedRef {
			return evaluationNativeProviderStateVaultSealReceipt{}, ErrInvalid
		}
		expires = evaluationNativeProviderStateVaultInstant(request.ExpiresAt)
	} else {
		if opaqueRef != "" || creationDigest != "" {
			return evaluationNativeProviderStateVaultSealReceipt{}, ErrInvalid
		}
		expires = nil
	}
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultSealReceiptFormat, "version": int64(1),
		"authorityDigest": request.AuthorityDigest, "sealRequestDigest": request.SealRequestDigest,
		"providerStateReferenceDigest": request.ProviderStateReferenceDigest, "status": status,
		"opaqueProviderStateRef":        nullableEvaluationString(opaqueRef),
		"stateKeyCreationReceiptDigest": nullableEvaluationString(creationDigest),
		"sealedAt":                      evaluationNativeProviderStateVaultInstant(sealedAt), "expiresAt": expires,
		"retirementRequired": retirementRequired,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, err
	}
	value := cloneEvaluationObject(base)
	value["receiptDigest"] = digest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationNativeProviderStateVaultComponentBytes {
		return evaluationNativeProviderStateVaultSealReceipt{}, ErrInvalid
	}
	return evaluationNativeProviderStateVaultSealReceipt{
		AuthorityDigest: request.AuthorityDigest, SealRequestDigest: request.SealRequestDigest,
		ProviderStateReferenceDigest: request.ProviderStateReferenceDigest, Status: status,
		OpaqueProviderStateRef: opaqueRef, StateKeyCreationReceiptDigest: creationDigest,
		SealedAt: sealedAt.UTC(), ExpiresAt: request.ExpiresAt, RetirementRequired: retirementRequired,
		ReceiptDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

func decodeEvaluationNativeProviderStateVaultSealReceipt(source []byte, request evaluationNativeProviderStateVaultSealRequest) (evaluationNativeProviderStateVaultSealReceipt, error) {
	value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "authorityDigest", "sealRequestDigest", "providerStateReferenceDigest",
		"status", "opaqueProviderStateRef", "stateKeyCreationReceiptDigest", "sealedAt", "expiresAt",
		"retirementRequired", "receiptDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultSealReceiptFormat {
		return evaluationNativeProviderStateVaultSealReceipt{}, ErrInvalid
	}
	sealedAt, sealedErr := evaluationInstant(value["sealedAt"], "state vault sealedAt")
	if sealedErr != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, ErrInvalid
	}
	opaque, _ := value["opaqueProviderStateRef"].(string)
	creation, _ := value["stateKeyCreationReceiptDigest"].(string)
	receipt, err := createEvaluationNativeProviderStateVaultSealReceipt(request, stringMember(value, "status"), opaque, creation, sealedAt)
	canonical, canonicalErr := canonicaljson.Bytes(value)
	if err != nil || canonicalErr != nil || !bytes.Equal(receipt.Bytes, canonical) {
		return evaluationNativeProviderStateVaultSealReceipt{}, ErrConflict
	}
	return receipt, nil
}

type evaluationNativeProviderStateVaultResolveRequest struct {
	AuthorityDigest              string
	OpaqueProviderStateRef       string
	SealRequestDigest            string
	SealReceiptDigest            string
	Purpose                      string
	ProviderStateReferenceKind   string
	ProviderStateReferenceDigest string
	SourceAttemptID              string
	SourceInvocationID           string
	SourceGeneration             int64
	ConsumerAttemptID            string
	ConsumerInvocationID         string
	ConsumerGeneration           int64
	TaskID                       string
	RunID                        string
	RequestedAt                  time.Time
	ExpiresAt                    time.Time
	ResolveRequestDigest         string
	Value                        map[string]any
	Bytes                        []byte
}

func decodeEvaluationNativeProviderStateVaultResolveRequest(source []byte) (evaluationNativeProviderStateVaultResolveRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "authorityDigest", "opaqueProviderStateRef", "sealRequestDigest", "sealReceiptDigest",
		"purpose", "providerStateReferenceKind", "providerStateReferenceDigest", "sourceAttemptId", "sourceInvocationId",
		"sourceGeneration", "consumerAttemptId", "consumerInvocationId", "consumerGeneration", "taskId", "runId",
		"requestedAt", "expiresAt", "resolveRequestDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultResolveRequestFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationNativeProviderStateVaultResolveRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	sourceGeneration, sourceOK := integerMember(value, "sourceGeneration")
	consumerGeneration, consumerOK := integerMember(value, "consumerGeneration")
	requestedAt, requestedErr := evaluationInstant(value["requestedAt"], "state vault requestedAt")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "state vault expiresAt")
	if !versionOK || version != 1 || !sourceOK || !consumerOK || sourceGeneration < 0 ||
		consumerGeneration != sourceGeneration || requestedErr != nil || expiresErr != nil || !requestedAt.Before(expiresAt) ||
		stringMember(value, "consumerAttemptId") != stringMember(value, "sourceAttemptId") ||
		stringMember(value, "consumerInvocationId") == stringMember(value, "sourceInvocationId") ||
		!oneOfString(stringMember(value, "purpose"), "background-job-state", "reasoning-continuation-state") ||
		!oneOfString(stringMember(value, "providerStateReferenceKind"), "interaction-id", "response-id") {
		return evaluationNativeProviderStateVaultResolveRequest{}, ErrInvalid
	}
	for _, field := range []string{"opaqueProviderStateRef", "sourceAttemptId", "sourceInvocationId", "consumerAttemptId", "consumerInvocationId", "taskId", "runId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationNativeProviderStateVaultResolveRequest{}, ErrInvalid
		}
	}
	for _, field := range []string{"authorityDigest", "sealRequestDigest", "sealReceiptDigest", "providerStateReferenceDigest", "resolveRequestDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationNativeProviderStateVaultResolveRequest{}, ErrInvalid
		}
	}
	base := cloneEvaluationObject(value)
	delete(base, "resolveRequestDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "resolveRequestDigest") {
		return evaluationNativeProviderStateVaultResolveRequest{}, ErrConflict
	}
	return evaluationNativeProviderStateVaultResolveRequest{
		AuthorityDigest: stringMember(value, "authorityDigest"), OpaqueProviderStateRef: stringMember(value, "opaqueProviderStateRef"),
		SealRequestDigest: stringMember(value, "sealRequestDigest"), SealReceiptDigest: stringMember(value, "sealReceiptDigest"),
		Purpose: stringMember(value, "purpose"), ProviderStateReferenceKind: stringMember(value, "providerStateReferenceKind"),
		ProviderStateReferenceDigest: stringMember(value, "providerStateReferenceDigest"),
		SourceAttemptID:              stringMember(value, "sourceAttemptId"), SourceInvocationID: stringMember(value, "sourceInvocationId"),
		SourceGeneration: sourceGeneration, ConsumerAttemptID: stringMember(value, "consumerAttemptId"),
		ConsumerInvocationID: stringMember(value, "consumerInvocationId"), ConsumerGeneration: consumerGeneration,
		TaskID: stringMember(value, "taskId"), RunID: stringMember(value, "runId"), RequestedAt: requestedAt,
		ExpiresAt: expiresAt, ResolveRequestDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

type evaluationNativeProviderStateVaultResolveReceipt struct {
	Status                       string
	ProviderStateReferenceDigest string
	CallbackLocalHandleDigest    string
	ResolvedAt                   time.Time
	ExpiresAt                    time.Time
	ReceiptDigest                string
	Value                        map[string]any
	Bytes                        []byte
}

func createEvaluationNativeProviderStateVaultResolveReceipt(request evaluationNativeProviderStateVaultResolveRequest, status, handle string, resolvedAt time.Time) (evaluationNativeProviderStateVaultResolveReceipt, error) {
	if !oneOfString(status, "resolved", "expired", "retired", "unavailable") || resolvedAt.Before(request.RequestedAt) ||
		resolvedAt.Sub(request.RequestedAt) > evaluationNativeProviderStateVaultMaximumACKDelay ||
		(status == "expired" && resolvedAt.Before(request.ExpiresAt)) {
		return evaluationNativeProviderStateVaultResolveReceipt{}, ErrInvalid
	}
	handleDigest := ""
	if status == "resolved" {
		if !resolvedAt.Before(request.ExpiresAt) || !validEvaluationAgentControlIdentity(handle) {
			return evaluationNativeProviderStateVaultResolveReceipt{}, ErrInvalid
		}
		var err error
		handleDigest, err = canonicaljson.Digest(map[string]any{"kind": request.ProviderStateReferenceKind, "value": handle})
		if err != nil || handleDigest != request.ProviderStateReferenceDigest {
			return evaluationNativeProviderStateVaultResolveReceipt{}, ErrConflict
		}
	} else if handle != "" {
		return evaluationNativeProviderStateVaultResolveReceipt{}, ErrInvalid
	}
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultResolveReceiptFormat, "version": int64(1),
		"authorityDigest": request.AuthorityDigest, "resolveRequestDigest": request.ResolveRequestDigest,
		"sealReceiptDigest": request.SealReceiptDigest, "opaqueProviderStateRef": request.OpaqueProviderStateRef,
		"status": status, "providerStateReferenceDigest": request.ProviderStateReferenceDigest,
		"callbackLocalProviderStateHandleDigest": nullableEvaluationString(handleDigest),
		"resolvedAt":                             evaluationNativeProviderStateVaultInstant(resolvedAt),
		"expiresAt":                              evaluationNativeProviderStateVaultInstant(request.ExpiresAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationNativeProviderStateVaultResolveReceipt{}, err
	}
	value := cloneEvaluationObject(base)
	value["receiptDigest"] = digest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationNativeProviderStateVaultComponentBytes {
		return evaluationNativeProviderStateVaultResolveReceipt{}, ErrInvalid
	}
	return evaluationNativeProviderStateVaultResolveReceipt{
		Status: status, ProviderStateReferenceDigest: request.ProviderStateReferenceDigest,
		CallbackLocalHandleDigest: handleDigest, ResolvedAt: resolvedAt.UTC(), ExpiresAt: request.ExpiresAt,
		ReceiptDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

func decodeEvaluationNativeProviderStateVaultResolveReceipt(
	source []byte,
	request evaluationNativeProviderStateVaultResolveRequest,
) (evaluationNativeProviderStateVaultResolveReceipt, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "authorityDigest", "resolveRequestDigest", "sealReceiptDigest",
		"opaqueProviderStateRef", "status", "providerStateReferenceDigest",
		"callbackLocalProviderStateHandleDigest", "resolvedAt", "expiresAt", "receiptDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultResolveReceiptFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationNativeProviderStateVaultResolveReceipt{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	resolvedAt, resolvedErr := evaluationInstant(value["resolvedAt"], "state vault resolvedAt")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "state vault expiresAt")
	status := stringMember(value, "status")
	handleDigest, handlePresent := value["callbackLocalProviderStateHandleDigest"].(string)
	if !versionOK || version != 1 || resolvedErr != nil || expiresErr != nil ||
		!oneOfString(status, "resolved", "expired", "retired", "unavailable") ||
		resolvedAt.Before(request.RequestedAt) || resolvedAt.Sub(request.RequestedAt) > evaluationNativeProviderStateVaultMaximumACKDelay ||
		!expiresAt.Equal(request.ExpiresAt) || stringMember(value, "authorityDigest") != request.AuthorityDigest ||
		stringMember(value, "resolveRequestDigest") != request.ResolveRequestDigest ||
		stringMember(value, "sealReceiptDigest") != request.SealReceiptDigest ||
		stringMember(value, "opaqueProviderStateRef") != request.OpaqueProviderStateRef ||
		stringMember(value, "providerStateReferenceDigest") != request.ProviderStateReferenceDigest ||
		(status == "resolved" && (!handlePresent || handleDigest != request.ProviderStateReferenceDigest || !resolvedAt.Before(request.ExpiresAt))) ||
		(status != "resolved" && (handlePresent || value["callbackLocalProviderStateHandleDigest"] != nil)) ||
		(status == "expired" && resolvedAt.Before(request.ExpiresAt)) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "receiptDigest")) {
		return evaluationNativeProviderStateVaultResolveReceipt{}, ErrInvalid
	}
	base := cloneEvaluationObject(value)
	delete(base, "receiptDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "receiptDigest") {
		return evaluationNativeProviderStateVaultResolveReceipt{}, ErrConflict
	}
	return evaluationNativeProviderStateVaultResolveReceipt{
		Status: status, ProviderStateReferenceDigest: request.ProviderStateReferenceDigest,
		CallbackLocalHandleDigest: handleDigest, ResolvedAt: resolvedAt, ExpiresAt: expiresAt,
		ReceiptDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

type evaluationNativeProviderStateVaultRetireRequest struct {
	AuthorityDigest        string
	OpaqueProviderStateRef string
	SealRequestDigest      string
	SealReceiptDigest      string
	ResolveReceiptDigest   string
	Purpose                string
	SourceAttemptID        string
	SourceInvocationID     string
	SourceGeneration       int64
	ConsumerAttemptID      string
	ConsumerInvocationID   string
	ConsumerGeneration     *int64
	Disposition            string
	RequestedAt            time.Time
	ExpiresAt              time.Time
	RetireRequestDigest    string
	Value                  map[string]any
	Bytes                  []byte
}

func decodeEvaluationNativeProviderStateVaultRetireRequest(source []byte) (evaluationNativeProviderStateVaultRetireRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "authorityDigest", "opaqueProviderStateRef", "sealRequestDigest", "sealReceiptDigest",
		"resolveReceiptDigest", "purpose", "sourceAttemptId", "sourceInvocationId", "sourceGeneration",
		"consumerAttemptId", "consumerInvocationId", "consumerGeneration", "disposition", "requestedAt",
		"expiresAt", "retireRequestDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultRetireRequestFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationNativeProviderStateVaultRetireRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	sourceGeneration, sourceOK := integerMember(value, "sourceGeneration")
	requestedAt, requestedErr := evaluationInstant(value["requestedAt"], "state vault requestedAt")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "state vault expiresAt")
	resolveDigest, resolvePresent := value["resolveReceiptDigest"].(string)
	consumerAttempt, consumerAttemptPresent := value["consumerAttemptId"].(string)
	consumerInvocation, consumerInvocationPresent := value["consumerInvocationId"].(string)
	consumerGenerationValue, consumerGenerationOK := integerMember(value, "consumerGeneration")
	if !versionOK || version != 1 || !sourceOK || sourceGeneration < 0 || requestedErr != nil || expiresErr != nil ||
		requestedAt.After(expiresAt.Add(evaluationNativeProviderStateVaultMaximumACKDelay)) ||
		!oneOfString(stringMember(value, "purpose"), "background-job-state", "reasoning-continuation-state") ||
		!oneOfString(stringMember(value, "disposition"), "cancelled", "consumed", "expired") ||
		(stringMember(value, "disposition") == "expired" && requestedAt.Before(expiresAt)) {
		return evaluationNativeProviderStateVaultRetireRequest{}, ErrInvalid
	}
	if resolvePresent {
		if !evaluationDigestPattern.MatchString(resolveDigest) || !consumerAttemptPresent || !consumerInvocationPresent ||
			!consumerGenerationOK || consumerAttempt != stringMember(value, "sourceAttemptId") ||
			consumerInvocation == stringMember(value, "sourceInvocationId") || consumerGenerationValue != sourceGeneration {
			return evaluationNativeProviderStateVaultRetireRequest{}, ErrInvalid
		}
	} else if value["resolveReceiptDigest"] != nil || value["consumerAttemptId"] != nil ||
		value["consumerInvocationId"] != nil || value["consumerGeneration"] != nil {
		return evaluationNativeProviderStateVaultRetireRequest{}, ErrInvalid
	}
	if stringMember(value, "disposition") == "consumed" && !resolvePresent {
		return evaluationNativeProviderStateVaultRetireRequest{}, ErrInvalid
	}
	for _, field := range []string{"opaqueProviderStateRef", "sourceAttemptId", "sourceInvocationId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationNativeProviderStateVaultRetireRequest{}, ErrInvalid
		}
	}
	if resolvePresent && (!validEvaluationAgentControlIdentity(consumerAttempt) || !validEvaluationAgentControlIdentity(consumerInvocation)) {
		return evaluationNativeProviderStateVaultRetireRequest{}, ErrInvalid
	}
	for _, field := range []string{"authorityDigest", "sealRequestDigest", "sealReceiptDigest", "retireRequestDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationNativeProviderStateVaultRetireRequest{}, ErrInvalid
		}
	}
	base := cloneEvaluationObject(value)
	delete(base, "retireRequestDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "retireRequestDigest") {
		return evaluationNativeProviderStateVaultRetireRequest{}, ErrConflict
	}
	var consumerGeneration *int64
	if resolvePresent {
		copy := consumerGenerationValue
		consumerGeneration = &copy
	}
	return evaluationNativeProviderStateVaultRetireRequest{
		AuthorityDigest: stringMember(value, "authorityDigest"), OpaqueProviderStateRef: stringMember(value, "opaqueProviderStateRef"),
		SealRequestDigest: stringMember(value, "sealRequestDigest"), SealReceiptDigest: stringMember(value, "sealReceiptDigest"),
		ResolveReceiptDigest: resolveDigest, Purpose: stringMember(value, "purpose"),
		SourceAttemptID: stringMember(value, "sourceAttemptId"), SourceInvocationID: stringMember(value, "sourceInvocationId"),
		SourceGeneration: sourceGeneration, ConsumerAttemptID: consumerAttempt, ConsumerInvocationID: consumerInvocation,
		ConsumerGeneration: consumerGeneration, Disposition: stringMember(value, "disposition"), RequestedAt: requestedAt,
		ExpiresAt: expiresAt, RetireRequestDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

type evaluationNativeProviderStateVaultRetirementReceipt struct {
	RetireRequestDigest               string
	SealReceiptDigest                 string
	OpaqueProviderStateRef            string
	StateKeyCreationReceiptDigest     string
	ResolveReceiptDigest              string
	Disposition                       string
	StateKeyDestructionReceiptDigest  string
	OpaqueRecordDeletionReceiptDigest string
	CryptographicExpiryReceiptDigest  string
	RetiredAt                         time.Time
	ReceiptDigest                     string
	Value                             map[string]any
	Bytes                             []byte
}

func createEvaluationNativeProviderStateVaultRetirementReceipt(
	request evaluationNativeProviderStateVaultRetireRequest,
	sealReceipt evaluationNativeProviderStateVaultSealReceipt,
	destructionDigest, deletionDigest string,
	retiredAt time.Time,
) (evaluationNativeProviderStateVaultRetirementReceipt, error) {
	if !evaluationDigestPattern.MatchString(destructionDigest) || !evaluationDigestPattern.MatchString(deletionDigest) ||
		retiredAt.Before(request.RequestedAt) || retiredAt.Sub(request.RequestedAt) > evaluationNativeProviderStateVaultMaximumACKDelay ||
		retiredAt.After(request.ExpiresAt.Add(evaluationNativeProviderStateVaultMaximumACKDelay)) ||
		sealReceipt.Status != "sealed" || sealReceipt.ReceiptDigest != request.SealReceiptDigest ||
		sealReceipt.OpaqueProviderStateRef != request.OpaqueProviderStateRef {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, ErrInvalid
	}
	cryptoDigest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-cryptographic-expiry", "version": int64(1),
		"authorityDigest": request.AuthorityDigest, "opaqueProviderStateRef": request.OpaqueProviderStateRef,
		"stateKeyCreationReceiptDigest":     sealReceipt.StateKeyCreationReceiptDigest,
		"stateKeyDestructionReceiptDigest":  destructionDigest,
		"opaqueRecordDeletionReceiptDigest": deletionDigest,
		"retiredAt":                         evaluationNativeProviderStateVaultInstant(retiredAt),
	})
	if err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, err
	}
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultRetirementReceiptFormat, "version": int64(1),
		"authorityDigest": request.AuthorityDigest, "retireRequestDigest": request.RetireRequestDigest,
		"sealReceiptDigest": request.SealReceiptDigest, "opaqueProviderStateRef": request.OpaqueProviderStateRef,
		"stateKeyCreationReceiptDigest": sealReceipt.StateKeyCreationReceiptDigest,
		"resolveReceiptDigest":          nullableEvaluationString(request.ResolveReceiptDigest), "disposition": request.Disposition,
		"stateKeyDestructionReceiptDigest":  destructionDigest,
		"opaqueRecordDeletionReceiptDigest": deletionDigest,
		"cryptographicExpiryReceiptDigest":  cryptoDigest,
		"retiredAt":                         evaluationNativeProviderStateVaultInstant(retiredAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, err
	}
	value := cloneEvaluationObject(base)
	value["receiptDigest"] = digest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationNativeProviderStateVaultComponentBytes {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, ErrInvalid
	}
	return evaluationNativeProviderStateVaultRetirementReceipt{
		RetireRequestDigest: request.RetireRequestDigest, SealReceiptDigest: request.SealReceiptDigest,
		OpaqueProviderStateRef:        request.OpaqueProviderStateRef,
		StateKeyCreationReceiptDigest: sealReceipt.StateKeyCreationReceiptDigest,
		ResolveReceiptDigest:          request.ResolveReceiptDigest, Disposition: request.Disposition,
		StateKeyDestructionReceiptDigest: destructionDigest, OpaqueRecordDeletionReceiptDigest: deletionDigest,
		CryptographicExpiryReceiptDigest: cryptoDigest, RetiredAt: retiredAt.UTC(), ReceiptDigest: digest,
		Value: value, Bytes: canonical,
	}, nil
}

func decodeEvaluationNativeProviderStateVaultRetirementReceipt(source []byte, request evaluationNativeProviderStateVaultRetireRequest, sealReceipt evaluationNativeProviderStateVaultSealReceipt) (evaluationNativeProviderStateVaultRetirementReceipt, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "authorityDigest", "retireRequestDigest", "sealReceiptDigest", "opaqueProviderStateRef",
		"stateKeyCreationReceiptDigest", "resolveReceiptDigest", "disposition", "stateKeyDestructionReceiptDigest",
		"opaqueRecordDeletionReceiptDigest", "cryptographicExpiryReceiptDigest", "retiredAt", "receiptDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultRetirementReceiptFormat {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, ErrInvalid
	}
	retiredAt, retiredErr := evaluationInstant(value["retiredAt"], "state vault retiredAt")
	if retiredErr != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, ErrInvalid
	}
	receipt, err := createEvaluationNativeProviderStateVaultRetirementReceipt(
		request, sealReceipt, stringMember(value, "stateKeyDestructionReceiptDigest"),
		stringMember(value, "opaqueRecordDeletionReceiptDigest"), retiredAt,
	)
	if err != nil || !bytes.Equal(canonical, receipt.Bytes) {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, ErrConflict
	}
	return receipt, nil
}

func evaluationNativeProviderStateVaultInstant(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000Z")
}

func nullableEvaluationString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func evaluationNativeProviderStateVaultAAD(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationNativeProviderStateVaultSealRequest,
) ([]byte, string, error) {
	value := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-aad", "version": int64(1),
		"authorityDigest": request.AuthorityDigest, "namespaceId": authority.NamespaceID,
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"sealRequestDigest":            request.SealRequestDigest,
		"providerStateReferenceDigest": request.ProviderStateReferenceDigest,
		"purpose":                      request.Purpose, "attemptId": request.AttemptID, "invocationId": request.InvocationID,
		"generation": request.Generation, "expiresAt": evaluationNativeProviderStateVaultInstant(request.ExpiresAt),
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		return nil, "", err
	}
	digest, err := canonicaljson.Digest(value)
	return canonical, digest, err
}

func evaluationNativeProviderStateVaultStateKeyCreationDigest(
	request evaluationNativeProviderStateVaultSealRequest,
	aadDigest, ciphertextDigest, wrappedKeyDigest string,
	createdAt time.Time,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-state-key-creation", "version": int64(1),
		"authorityDigest": request.AuthorityDigest, "sealRequestDigest": request.SealRequestDigest,
		"keyVersion": int64(1), "aadDigest": aadDigest, "ciphertextDigest": ciphertextDigest,
		"wrappedStateKeyDigest": wrappedKeyDigest, "createdAt": evaluationNativeProviderStateVaultInstant(createdAt),
	})
}

func evaluationNativeProviderStateVaultDestructionDigests(
	record EvaluationNativeProviderStateVaultRecord,
	request evaluationNativeProviderStateVaultRetireRequest,
	retiredAt time.Time,
) (string, string, error) {
	destructionDigest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-state-key-destruction", "version": int64(1),
		"authorityDigest": request.AuthorityDigest, "opaqueProviderStateRef": request.OpaqueProviderStateRef,
		"stateKeyCreationReceiptDigest": record.SealReceipt.StateKeyCreationReceiptDigest,
		"retireRequestDigest":           request.RetireRequestDigest,
		"wrappedStateKeyDigest":         record.WrappedStateKeyDigest,
		"retiredAt":                     evaluationNativeProviderStateVaultInstant(retiredAt),
	})
	if err != nil {
		return "", "", err
	}
	deletionDigest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-opaque-record-deletion", "version": int64(1),
		"authorityDigest": request.AuthorityDigest, "opaqueProviderStateRef": request.OpaqueProviderStateRef,
		"sealRequestDigest": request.SealRequestDigest, "retireRequestDigest": request.RetireRequestDigest,
		"ciphertextDigest": record.CiphertextDigest, "retiredAt": evaluationNativeProviderStateVaultInstant(retiredAt),
	})
	return destructionDigest, deletionDigest, err
}

func mustEvaluationNativeProviderStateVaultCanonical(value any) []byte {
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		panic(fmt.Sprintf("native Provider state vault canonical value: %v", err))
	}
	return source
}

func evaluationNativeProviderStateVaultJSONNumber(value int64) json.Number {
	return json.Number(fmt.Sprintf("%d", value))
}
