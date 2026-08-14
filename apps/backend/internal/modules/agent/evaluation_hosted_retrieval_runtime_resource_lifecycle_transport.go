package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequestFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistoryFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt-history"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSetFormat       = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-intent-set"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSetFormat        = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-receipt-set"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySetFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-history-set"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptFormat        = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-receipt"
	evaluationHostedRetrievalRuntimeResourceLifecycleResponseProjectionFormat      = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-response-projection"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSetFormat     = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-receipt-set"
	evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAADFormat                = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-aad"
	evaluationHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthorityFormat  = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-envelope-authority"
	evaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptFormat            = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-result-spool-receipt"
	evaluationProviderResultSpoolEnvelopeFormat                                    = "prodivix.agent-evaluation-provider-result-spool-envelope"

	evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyID            = "key.g4-model-eval.hosted-retrieval-runtime-resource-lifecycle-spool.v1"
	evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyEnvironment   = "PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64"
	evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyRef           = "secret.g4-model-eval.hosted-retrieval-runtime-resource-lifecycle-spool.aes256gcm.v1"
	evaluationHostedRetrievalRuntimeResourceLifecycleSpoolRetentionClass   = "hosted-resource-lifecycle-reconcile-only"
	evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryReceiptPrefix = "lifecycle-recovery-sentinel."

	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleCiphertextBytes        = 262_144
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleClaimHistorySetBytes   = 32_768
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistory  = 4
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolLifetime          = 8 * 24 * time.Hour
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportAuthorityIssuerID    = "authority.prodivix.hosted-retrieval-runtime-resource-lifecycle-transport"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportImplementationFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-implementation"
)

var evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequestKeys = []string{
	"format", "version", "purpose", "expectedPriorTransportStoreReceiptDigest", "dispatchIntentSet", "dispatchStageClaimReceiptSet",
	"dispatchStageClaimHistorySet", "transportReceiptSet", "spoolAad", "spoolWriteEnvelope", "spoolEnvelopeAuthority",
	"spoolReceipt", "requestDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptKeys = []string{
	"format", "version", "requestDigest", "operation", "registrationRequestDigest",
	"expectedPriorTransportStoreReceiptDigest", "transportAuthorityIssuerId",
	"transportAuthorityImplementationDigest", "transportLedgerRevision", "dispatchIntentSetDigest",
	"dispatchStageClaimReceiptSetDigest", "dispatchStageClaimHistorySetDigest", "transportReceiptSetDigest",
	"spoolAadDigest", "spoolEnvelopeDigest", "spoolReceiptDigest", "supersededSpoolReceiptDigest",
	"supersededSpoolDestroyedAt", "storedAt", "receiptDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistoryKeys = []string{
	"format", "version", "operation", "registrationRequestDigest", "receipts", "receiptDigests", "historyDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSetKeys = []string{
	"format", "version", "operation", "registrationRequestDigest", "lifecycleClaimReceiptDigest",
	"intents", "intentDigests", "setDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSetKeys = []string{
	"format", "version", "operation", "registrationRequestDigest", "lifecycleClaimReceiptDigest",
	"dispatchIntentSetDigest", "receipts", "receiptDigests", "setDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySetKeys = []string{
	"format", "version", "operation", "registrationRequestDigest", "dispatchIntentSetDigest",
	"initialClaimReceiptSet", "initialClaimReceiptSetDigest", "receipts", "receiptDigests", "setDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSetKeys = []string{
	"format", "version", "operation", "registrationRequestDigest", "lifecycleClaimReceiptDigest",
	"dispatchIntentSetDigest", "dispatchStageClaimReceiptSetDigest", "receipts", "receiptDigests", "setDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptKeys = []string{
	"format", "version", "receiptId", "lifecycleOwnerAuthorityIssuerId", "lifecycleOwnerImplementationDigest",
	"dispatchIntentDigest", "dispatchStageClaimReceiptDigest", "protocolFamily", "providerConfigurationId",
	"endpointId", "endpointClass", "method", "requestProjectionDigest", "requestBodyDigest", "requestBytes",
	"responseProjection", "responseProjectionDigest", "responseBodyDigest", "responseBytes", "httpStatus",
	"providerRequestId", "dispatchState", "outcome", "errorCategory", "startedAt", "completedAt", "receiptDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleResponseProjectionKeys = []string{
	"format", "version", "mutationKind", "resourceId", "resourceRole", "outcome",
	"resourceManifestDigest", "httpStatus", "projectionDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAADKeys = []string{
	"format", "version", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "lifecycleExpiresAt",
	"registrationRequestDigest", "authorityDigest", "lifecycleClaimReceiptDigest", "operation",
	"resourceId", "resourceRole", "dispatchIntentSetDigest", "dispatchStageClaimReceiptSetDigest",
	"dispatchStageClaimHistorySetDigest",
	"transportReceiptSetDigest", "businessResultDigest", "plaintextDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleGenericSpoolEnvelopeKeys = []string{
	"format", "version", "spoolId", "algorithm", "keyId", "keyVersion", "keyRefDigest",
	"encryptionProfileDigest", "nonceBase64Url", "authenticationTagBase64Url", "ciphertextBase64Url",
	"ciphertextDigest", "ciphertextSizeBytes", "aadDigest", "envelopeDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthorityKeys = []string{
	"format", "version", "spoolRef", "algorithm", "keyId", "keyVersion", "keyRefDigest",
	"encryptionProfileDigest", "nonceBase64Url", "authenticationTagBase64Url", "ciphertextDigest",
	"ciphertextSizeBytes", "aadDigest", "plaintextDigest", "envelopeDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptKeys = []string{
	"format", "version", "spoolRef", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "lifecycleExpiresAt", "registrationRequestDigest",
	"authorityDigest", "lifecycleClaimReceiptDigest", "operation", "resourceId", "resourceRole",
	"dispatchIntentSetDigest", "dispatchStageClaimReceiptSetDigest", "dispatchStageClaimHistorySetDigest",
	"transportReceiptSetDigest",
	"businessResultDigest", "algorithm", "keyId", "keyVersion", "keyRefDigest", "encryptionProfileDigest",
	"aadDigest", "envelopeDigest", "ciphertextDigest", "ciphertextSizeBytes", "plaintextDigest",
	"retentionClass", "retentionPolicyDigest", "createdAt", "expiresAt", "receiptDigest",
}

type evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet struct {
	Operation                   string
	RegistrationRequestDigest   string
	LifecycleClaimReceiptDigest any
	Intents                     []evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent
	SetDigest                   string
	Value                       map[string]any
	Canonical                   []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt struct {
	DispatchIntentDigest string
	ReceiptDigest        string
	Value                map[string]any
	Canonical            []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet struct {
	Operation                   string
	RegistrationRequestDigest   string
	LifecycleClaimReceiptDigest any
	DispatchIntentSetDigest     string
	Receipts                    []evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt
	SetDigest                   string
	Value                       map[string]any
	Canonical                   []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet struct {
	InitialClaimSet evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet
	Receipts        []evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt
	SetDigest       string
	Value           map[string]any
	Canonical       []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt struct {
	DispatchIntentDigest            string
	DispatchStageClaimReceiptDigest string
	DispatchState                   string
	Outcome                         string
	StartedAt                       time.Time
	CompletedAt                     time.Time
	ReceiptDigest                   string
	Value                           map[string]any
	Canonical                       []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet struct {
	Operation                          string
	RegistrationRequestDigest          string
	LifecycleClaimReceiptDigest        any
	DispatchIntentSetDigest            string
	DispatchStageClaimReceiptSetDigest string
	Receipts                           []evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt
	SetDigest                          string
	Value                              map[string]any
	Canonical                          []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest struct {
	ExpectedPriorTransportStoreReceiptDigest any
	DispatchIntentSet                        evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet
	DispatchClaimSet                         evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet
	DispatchClaimHistorySet                  evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet
	TransportReceiptSet                      evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet
	SpoolAAD                                 map[string]any
	SpoolAADCanonical                        []byte
	SpoolAADDigest                           string
	SpoolWriteEnvelope                       map[string]any
	SpoolWriteEnvelopeCanonical              []byte
	SpoolEnvelopeAuthority                   map[string]any
	SpoolEnvelopeCanonical                   []byte
	SpoolReceipt                             map[string]any
	SpoolReceiptCanonical                    []byte
	Ciphertext                               []byte
	Nonce                                    []byte
	AuthenticationTag                        []byte
	LifecycleExpiresAt                       time.Time
	SpoolCreatedAt                           time.Time
	SpoolExpiresAt                           time.Time
	RequestDigest                            string
	Value                                    map[string]any
	Canonical                                []byte
}

func evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(value map[string]any, maximum int) ([]byte, error) {
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) < 1 || len(encoded) > maximum || evaluationAuthenticityCredentialPattern.Match(encoded) {
		return nil, ErrInvalid
	}
	return encoded, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(left any, right any) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return reflect.DeepEqual(left, right)
}

func evaluationHostedRetrievalRuntimeResourceLifecycleDigestArray(value any, maximum int) ([]string, bool) {
	raw, ok := value.([]any)
	if !ok || len(raw) < 1 || len(raw) > maximum {
		return nil, false
	}
	result := make([]string, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for index, item := range raw {
		text, ok := item.(string)
		if !ok || !evaluationDigestPattern.MatchString(text) {
			return nil, false
		}
		if _, duplicate := seen[text]; duplicate {
			return nil, false
		}
		seen[text] = struct{}{}
		result[index] = text
	}
	return result, true
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
	value map[string]any,
) (evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSetKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSetFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "setDigest") ||
		!oneOfString(stringMember(value, "operation"), "create", "delete") ||
		!evaluationDigestPattern.MatchString(stringMember(value, "registrationRequestDigest")) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "lifecycleClaimReceiptDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
	}
	rawIntents, intentsOK := arrayMember(value, "intents")
	intentDigests, digestsOK := evaluationHostedRetrievalRuntimeResourceLifecycleDigestArray(value["intentDigests"], 4)
	if !intentsOK || !digestsOK || len(rawIntents) < 1 || len(rawIntents) > 4 || len(rawIntents) != len(intentDigests) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
	}
	intents := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent, len(rawIntents))
	seenIDs := make(map[string]struct{}, len(rawIntents))
	for index, raw := range rawIntents {
		object, ok := raw.(map[string]any)
		if !ok {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
		}
		encoded, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
			object, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
		)
		if err != nil {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
		}
		intent, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent(encoded)
		if err != nil || intent.IntentDigest != intentDigests[index] || intent.MutationSequence != int64(index) ||
			intent.Operation != stringMember(value, "operation") ||
			intent.RegistrationRequestDigest != stringMember(value, "registrationRequestDigest") ||
			!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(intent.LifecycleClaimReceiptDigest, value["lifecycleClaimReceiptDigest"]) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
		}
		if _, duplicate := seenIDs[intent.IntentID]; duplicate {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
		}
		seenIDs[intent.IntentID] = struct{}{}
		if index > 0 {
			first := intents[0]
			if intent.NamespaceID != first.NamespaceID || intent.RepositoryCommit != first.RepositoryCommit ||
				intent.PlanDigest != first.PlanDigest || intent.FrozenRunDigest != first.FrozenRunDigest ||
				intent.RunConfigArtifactBindingDigest != first.RunConfigArtifactBindingDigest ||
				intent.RuntimeResourceSetID != first.RuntimeResourceSetID || intent.ProtocolFamily != first.ProtocolFamily ||
				intent.CapabilityProfileID != first.CapabilityProfileID ||
				intent.ProviderConfigurationID != first.ProviderConfigurationID ||
				intent.ProviderConfigurationDigest != first.ProviderConfigurationDigest ||
				intent.BudgetReservationID != first.BudgetReservationID ||
				intent.BudgetReservationAuthorityDigest != first.BudgetReservationAuthorityDigest ||
				!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(intent.AuthorityDigest, first.AuthorityDigest) {
				return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
			}
		}
		intents[index] = intent
	}
	expectedKinds := []string{"delete-resource"}
	if intents[0].Operation == "create" {
		if intents[0].ProtocolFamily == "openai-responses" {
			expectedKinds = []string{"upload-content", "create-primary"}
		} else {
			expectedKinds = []string{"create-primary", "upload-content-start", "upload-content", "upload-content-finalize"}
		}
	}
	if len(intents) > len(expectedKinds) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
	}
	for index, intent := range intents {
		if intent.MutationKind != expectedKinds[index] {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
		}
	}
	if intents[0].Operation == "delete" && len(intents) != 1 {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet{
		Operation: stringMember(value, "operation"), RegistrationRequestDigest: stringMember(value, "registrationRequestDigest"),
		LifecycleClaimReceiptDigest: value["lifecycleClaimReceiptDigest"], Intents: intents,
		SetDigest: stringMember(value, "setDigest"), Value: value, Canonical: canonical,
	}, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
	value map[string]any,
) (evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	claimRequestValue, claimOK := objectMember(value, "claimRequest")
	if err != nil || !claimOK {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt{}, ErrInvalid
	}
	claimRequestBytes, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		claimRequestValue, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt{}, ErrInvalid
	}
	claimRequest, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest(claimRequestBytes)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt{}, ErrInvalid
	}
	generation, generationOK := integerMember(value, "dispatchGeneration")
	ledgerRevision, revisionOK := integerMember(value, "dispatchLedgerRevision")
	if !generationOK || !revisionOK || validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
		canonical, claimRequest, stringMember(value, "receiptDigest"), stringMember(value, "deliveryDisposition"),
		stringMember(value, "generationTransition"), generation, ledgerRevision,
	) != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt{
		DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"),
		ReceiptDigest:        stringMember(value, "receiptDigest"), Value: value, Canonical: canonical,
	}, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet(
	value map[string]any,
	intentSet evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
) (evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSetKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSetFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "setDigest") ||
		stringMember(value, "operation") != intentSet.Operation ||
		stringMember(value, "registrationRequestDigest") != intentSet.RegistrationRequestDigest ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value["lifecycleClaimReceiptDigest"], intentSet.LifecycleClaimReceiptDigest) ||
		stringMember(value, "dispatchIntentSetDigest") != intentSet.SetDigest {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet{}, ErrInvalid
	}
	rawReceipts, receiptsOK := arrayMember(value, "receipts")
	receiptDigests, digestsOK := evaluationHostedRetrievalRuntimeResourceLifecycleDigestArray(value["receiptDigests"], 4)
	if !receiptsOK || !digestsOK || len(rawReceipts) != len(intentSet.Intents) || len(receiptDigests) != len(rawReceipts) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet{}, ErrInvalid
	}
	receipts := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt, len(rawReceipts))
	for index, raw := range rawReceipts {
		object, ok := raw.(map[string]any)
		if !ok {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet{}, ErrInvalid
		}
		receipt, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(object)
		if err != nil || receipt.ReceiptDigest != receiptDigests[index] ||
			receipt.DispatchIntentDigest != intentSet.Intents[index].IntentDigest ||
			stringMember(receipt.Value, "deliveryDisposition") != "dispatch-authorized-first-delivery" {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet{}, ErrInvalid
		}
		receipts[index] = receipt
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet{
		Operation: intentSet.Operation, RegistrationRequestDigest: intentSet.RegistrationRequestDigest,
		LifecycleClaimReceiptDigest: intentSet.LifecycleClaimReceiptDigest,
		DispatchIntentSetDigest:     intentSet.SetDigest, Receipts: receipts,
		SetDigest: stringMember(value, "setDigest"), Value: value, Canonical: canonical,
	}, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleClaimHistorySuccessor(
	prior evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt,
	next evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt,
) bool {
	priorClaimExpiresAt := stringMember(prior.Value, "claimExpiresAt")
	nextRequest, requestOK := objectMember(next.Value, "claimRequest")
	priorGeneration, priorGenerationOK := integerMember(prior.Value, "dispatchGeneration")
	priorRevision, priorRevisionOK := integerMember(prior.Value, "dispatchLedgerRevision")
	nextGeneration, nextGenerationOK := integerMember(next.Value, "dispatchGeneration")
	nextRevision, nextRevisionOK := integerMember(next.Value, "dispatchLedgerRevision")
	requestedAt, requestedAtErr := evaluationInstant(nextRequest["requestedAt"], "requestedAt")
	priorExpiresAt, priorExpiresAtErr := evaluationInstant(prior.Value["claimExpiresAt"], "claimExpiresAt")
	if !requestOK || !priorGenerationOK || !priorRevisionOK || !nextGenerationOK || !nextRevisionOK ||
		requestedAtErr != nil || priorExpiresAtErr != nil ||
		prior.DispatchIntentDigest != next.DispatchIntentDigest ||
		stringMember(prior.Value, "dispatchAuthorityIssuerId") != stringMember(next.Value, "dispatchAuthorityIssuerId") ||
		stringMember(prior.Value, "dispatchAuthorityImplementationDigest") != stringMember(next.Value, "dispatchAuthorityImplementationDigest") ||
		stringMember(next.Value, "generationTransition") == "initial-first-delivery" ||
		stringMember(next.Value, "deliveryDisposition") != "reconcile-only-replay" ||
		stringMember(nextRequest, "expectedPriorStageClaimReceiptDigest") != prior.ReceiptDigest ||
		stringMember(nextRequest, "expectedPriorClaimExpiresAt") != priorClaimExpiresAt {
		return false
	}
	expectedGeneration, expectedGenerationOK := integerMember(nextRequest, "expectedDispatchGeneration")
	expectedRevision, expectedRevisionOK := integerMember(nextRequest, "expectedDispatchLedgerRevision")
	if !expectedGenerationOK || !expectedRevisionOK || expectedGeneration != priorGeneration || expectedRevision != priorRevision {
		return false
	}
	switch stringMember(next.Value, "generationTransition") {
	case "expired-owner-takeover":
		return !requestedAt.Before(priorExpiresAt) && nextGeneration == priorGeneration+1 && nextRevision == priorRevision+1
	case "generation-retained":
		return requestedAt.Before(priorExpiresAt) &&
			stringMember(next.Value, "lifecycleOwnerInstanceId") == stringMember(prior.Value, "lifecycleOwnerInstanceId") &&
			nextGeneration == priorGeneration && nextRevision == priorRevision
	default:
		return false
	}
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet(
	value map[string]any,
	intentSet evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
	initialClaimSet evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet,
) (evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleClaimHistorySetBytes,
	)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySetKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySetFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "setDigest") ||
		stringMember(value, "operation") != intentSet.Operation ||
		stringMember(value, "registrationRequestDigest") != intentSet.RegistrationRequestDigest ||
		stringMember(value, "dispatchIntentSetDigest") != intentSet.SetDigest ||
		stringMember(value, "initialClaimReceiptSetDigest") != initialClaimSet.SetDigest {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
	}
	initialValue, initialOK := objectMember(value, "initialClaimReceiptSet")
	initialCanonical, initialErr := canonicaljson.Bytes(initialValue)
	if !initialOK || initialErr != nil || !bytes.Equal(initialCanonical, initialClaimSet.Canonical) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
	}
	rawReceipts, receiptsOK := arrayMember(value, "receipts")
	receiptDigests, digestsOK := evaluationHostedRetrievalRuntimeResourceLifecycleDigestArray(value["receiptDigests"], 8)
	if !receiptsOK || !digestsOK || len(rawReceipts) < len(initialClaimSet.Receipts) || len(rawReceipts) > 8 ||
		len(rawReceipts) != len(receiptDigests) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
	}
	receipts := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt, len(rawReceipts))
	seen := make(map[string]struct{}, len(rawReceipts))
	intentOrder := make(map[string]int, len(intentSet.Intents))
	for index, intent := range intentSet.Intents {
		intentOrder[intent.IntentDigest] = index
	}
	for index, raw := range rawReceipts {
		object, ok := raw.(map[string]any)
		if !ok {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
		}
		receipt, decodeErr := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(object)
		_, knownIntent := intentOrder[receipt.DispatchIntentDigest]
		if decodeErr != nil || !knownIntent || receipt.ReceiptDigest != receiptDigests[index] {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
		}
		if _, duplicate := seen[receipt.ReceiptDigest]; duplicate {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
		}
		seen[receipt.ReceiptDigest] = struct{}{}
		receipts[index] = receipt
	}
	canonicalOrder := append([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(nil), receipts...)
	sort.Slice(canonicalOrder, func(left, right int) bool {
		leftIntent := intentOrder[canonicalOrder[left].DispatchIntentDigest]
		rightIntent := intentOrder[canonicalOrder[right].DispatchIntentDigest]
		if leftIntent != rightIntent {
			return leftIntent < rightIntent
		}
		leftClaimed := stringMember(canonicalOrder[left].Value, "claimedAt")
		rightClaimed := stringMember(canonicalOrder[right].Value, "claimedAt")
		if leftClaimed != rightClaimed {
			return leftClaimed < rightClaimed
		}
		return canonicalOrder[left].ReceiptDigest < canonicalOrder[right].ReceiptDigest
	})
	for index := range receipts {
		if receipts[index].ReceiptDigest != canonicalOrder[index].ReceiptDigest {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
		}
	}
	for _, initial := range initialClaimSet.Receipts {
		chain := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt, 0, 2)
		for _, receipt := range receipts {
			if receipt.DispatchIntentDigest == initial.DispatchIntentDigest {
				chain = append(chain, receipt)
			}
		}
		if len(chain) < 1 || chain[0].ReceiptDigest != initial.ReceiptDigest {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
		}
		for index := 1; index < len(chain); index++ {
			if !evaluationHostedRetrievalRuntimeResourceLifecycleClaimHistorySuccessor(chain[index-1], chain[index]) {
				return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{}, ErrInvalid
			}
		}
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet{
		InitialClaimSet: initialClaimSet, Receipts: receipts, SetDigest: stringMember(value, "setDigest"),
		Value: value, Canonical: canonical,
	}, nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleResponseProjection(value map[string]any) error {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	_ = canonical
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleResponseProjectionKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleResponseProjectionFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "projectionDigest") ||
		!oneOfString(stringMember(value, "mutationKind"), "create-primary", "delete-resource", "upload-content", "upload-content-finalize", "upload-content-start") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableIdentity(value, "resourceId") ||
		!oneOfString(stringMember(value, "resourceRole"), "", "auxiliary", "primary") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "resourceManifestDigest") ||
		!oneOfString(stringMember(value, "outcome"), "accepted", "already-absent", "created", "deleted", "unknown", "uploaded") {
		return ErrInvalid
	}
	httpStatus, statusOK := integerMember(value, "httpStatus")
	if value["httpStatus"] == nil {
		statusOK = true
	}
	if !statusOK || (value["httpStatus"] != nil && (httpStatus < 100 || httpStatus > 599)) {
		return ErrInvalid
	}
	outcome := stringMember(value, "outcome")
	if (outcome == "unknown") != (value["httpStatus"] == nil) {
		return ErrInvalid
	}
	resourceIDPresent := value["resourceId"] != nil
	resourceRole := stringMember(value, "resourceRole")
	manifestPresent := value["resourceManifestDigest"] != nil
	switch outcome {
	case "created":
		if !resourceIDPresent || resourceRole != "primary" || manifestPresent {
			return ErrInvalid
		}
	case "uploaded":
		if !resourceIDPresent || resourceRole == "" || !manifestPresent {
			return ErrInvalid
		}
	case "accepted":
		if !resourceIDPresent || resourceRole == "" || manifestPresent {
			return ErrInvalid
		}
	case "already-absent":
		if httpStatus != 404 {
			return ErrInvalid
		}
	case "deleted":
		if httpStatus == 404 {
			return ErrInvalid
		}
	}
	return nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt(
	value map[string]any,
	intent evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
	claim evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt,
) (evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		!validEvaluationAgentControlIdentity(stringMember(value, "receiptId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "lifecycleOwnerAuthorityIssuerId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "providerConfigurationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "endpointId")) ||
		stringMember(value, "dispatchIntentDigest") != intent.IntentDigest ||
		stringMember(value, "dispatchStageClaimReceiptDigest") != claim.ReceiptDigest ||
		stringMember(value, "lifecycleOwnerAuthorityIssuerId") != stringMember(intent.Value, "lifecycleOwnerAuthorityIssuerId") ||
		stringMember(value, "lifecycleOwnerImplementationDigest") != stringMember(intent.Value, "lifecycleOwnerImplementationDigest") ||
		stringMember(value, "protocolFamily") != intent.ProtocolFamily ||
		stringMember(value, "providerConfigurationId") != intent.ProviderConfigurationID ||
		stringMember(value, "endpointId") != intent.EndpointID ||
		stringMember(value, "endpointClass") != "provider-hosted-retrieval-resource" ||
		stringMember(value, "method") != stringMember(intent.Value, "method") ||
		stringMember(value, "requestProjectionDigest") != stringMember(intent.Value, "requestProjectionDigest") ||
		stringMember(value, "requestBodyDigest") != stringMember(intent.Value, "requestBodyDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "responseProjectionDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "responseBodyDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableIdentity(value, "providerRequestId") ||
		!oneOfString(stringMember(value, "dispatchState"), "dispatched", "not-dispatched") ||
		!oneOfString(stringMember(value, "outcome"), "completed", "failed", "post-dispatch-unknown") ||
		!oneOfString(stringMember(value, "errorCategory"), "", "aborted", "provider-rejected", "response-invalid", "transport-failed") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{}, ErrInvalid
	}
	requestBytes, requestBytesOK := integerMember(value, "requestBytes")
	intentRequestBytes, intentRequestBytesOK := integerMember(intent.Value, "requestBytes")
	responseBytes, responseBytesOK := integerMember(value, "responseBytes")
	httpStatus, httpStatusOK := integerMember(value, "httpStatus")
	if value["httpStatus"] == nil {
		httpStatusOK = true
	}
	startedAt, startedErr := evaluationInstant(value["startedAt"], "startedAt")
	completedAt, completedErr := evaluationInstant(value["completedAt"], "completedAt")
	claimedAt, claimedErr := evaluationInstant(claim.Value["claimedAt"], "claimedAt")
	claimExpiresAt, expiresErr := evaluationInstant(claim.Value["claimExpiresAt"], "claimExpiresAt")
	if !requestBytesOK || !intentRequestBytesOK || requestBytes != intentRequestBytes || requestBytes < 0 || requestBytes > 16_777_216 ||
		!responseBytesOK || responseBytes < 0 || responseBytes > 16_777_216 ||
		!httpStatusOK || (value["httpStatus"] != nil && (httpStatus < 100 || httpStatus > 599)) ||
		startedErr != nil || completedErr != nil || claimedErr != nil || expiresErr != nil ||
		startedAt.Before(intent.CreatedAt) || startedAt.Before(claimedAt) || !startedAt.Before(claimExpiresAt) ||
		completedAt.Before(startedAt) || stringMember(claim.Value, "deliveryDisposition") != "dispatch-authorized-first-delivery" {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{}, ErrInvalid
	}
	projection, projectionPresent := objectMember(value, "responseProjection")
	if value["responseProjection"] == nil {
		projectionPresent = false
		if value["responseProjectionDigest"] != nil {
			return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{}, ErrInvalid
		}
	} else if !projectionPresent || validateEvaluationHostedRetrievalRuntimeResourceLifecycleResponseProjection(projection) != nil ||
		stringMember(value, "responseProjectionDigest") != stringMember(projection, "projectionDigest") ||
		stringMember(projection, "mutationKind") != intent.MutationKind ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(projection["httpStatus"], value["httpStatus"]) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{}, ErrInvalid
	}
	dispatchState := stringMember(value, "dispatchState")
	outcome := stringMember(value, "outcome")
	errorCategory := stringMember(value, "errorCategory")
	if dispatchState == "not-dispatched" {
		if outcome != "failed" || projectionPresent || value["responseBodyDigest"] != nil || responseBytes != 0 ||
			value["httpStatus"] != nil || value["providerRequestId"] != nil || errorCategory == "" || !completedAt.Equal(startedAt) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{}, ErrInvalid
		}
	}
	if outcome == "completed" {
		if dispatchState != "dispatched" || errorCategory != "" || value["httpStatus"] == nil || !projectionPresent ||
			stringMember(projection, "outcome") == "unknown" || value["responseBodyDigest"] == nil {
			return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{}, ErrInvalid
		}
	} else if errorCategory == "" {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{}, ErrInvalid
	}
	if outcome == "post-dispatch-unknown" && (dispatchState != "dispatched" || !projectionPresent ||
		stringMember(projection, "outcome") != "unknown" || value["httpStatus"] != nil) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt{
		DispatchIntentDigest: intent.IntentDigest, DispatchStageClaimReceiptDigest: claim.ReceiptDigest,
		DispatchState: dispatchState, Outcome: outcome, StartedAt: startedAt, CompletedAt: completedAt,
		ReceiptDigest: stringMember(value, "receiptDigest"), Value: value, Canonical: canonical,
	}, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(
	value map[string]any,
	intentSet evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
	claimSet evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet,
) (evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSetKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSetFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "setDigest") ||
		stringMember(value, "operation") != intentSet.Operation ||
		stringMember(value, "registrationRequestDigest") != intentSet.RegistrationRequestDigest ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value["lifecycleClaimReceiptDigest"], intentSet.LifecycleClaimReceiptDigest) ||
		stringMember(value, "dispatchIntentSetDigest") != intentSet.SetDigest ||
		stringMember(value, "dispatchStageClaimReceiptSetDigest") != claimSet.SetDigest {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet{}, ErrInvalid
	}
	rawReceipts, receiptsOK := arrayMember(value, "receipts")
	receiptDigests, digestsOK := evaluationHostedRetrievalRuntimeResourceLifecycleDigestArray(value["receiptDigests"], 4)
	if !receiptsOK || !digestsOK || len(rawReceipts) != len(intentSet.Intents) || len(receiptDigests) != len(rawReceipts) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet{}, ErrInvalid
	}
	receipts := make([]evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt, len(rawReceipts))
	for index, raw := range rawReceipts {
		object, ok := raw.(map[string]any)
		if !ok {
			return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet{}, ErrInvalid
		}
		receipt, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt(
			object, intentSet.Intents[index], claimSet.Receipts[index],
		)
		if err != nil || receipt.ReceiptDigest != receiptDigests[index] {
			return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet{}, ErrInvalid
		}
		receipts[index] = receipt
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet{
		Operation: intentSet.Operation, RegistrationRequestDigest: intentSet.RegistrationRequestDigest,
		LifecycleClaimReceiptDigest: intentSet.LifecycleClaimReceiptDigest,
		DispatchIntentSetDigest:     intentSet.SetDigest, DispatchStageClaimReceiptSetDigest: claimSet.SetDigest,
		Receipts: receipts, SetDigest: stringMember(value, "setDigest"), Value: value, Canonical: canonical,
	}, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportMatches(
	intent evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
	initialClaim evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt,
	currentClaim evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt,
	receipt evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt,
) bool {
	identityDigest, err := canonicaljson.Digest(map[string]any{
		"dispatchIntentDigest":      intent.IntentDigest,
		"initialClaimReceiptDigest": initialClaim.ReceiptDigest,
	})
	initialClaimedAt, initialErr := evaluationInstant(initialClaim.Value["claimedAt"], "claimedAt")
	initialExpiresAt, initialExpiresErr := evaluationInstant(initialClaim.Value["claimExpiresAt"], "claimExpiresAt")
	currentClaimedAt, currentErr := evaluationInstant(currentClaim.Value["claimedAt"], "claimedAt")
	projection, projectionOK := objectMember(receipt.Value, "responseProjection")
	return err == nil && initialErr == nil && initialExpiresErr == nil && currentErr == nil && projectionOK &&
		receipt.Value["receiptId"] == evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryReceiptPrefix+
			strings.TrimPrefix(identityDigest, "sha256-") &&
		currentClaim.DispatchIntentDigest == intent.IntentDigest &&
		stringMember(currentClaim.Value, "deliveryDisposition") == "reconcile-only-replay" &&
		stringMember(currentClaim.Value, "generationTransition") == "expired-owner-takeover" &&
		currentClaim.Value["priorTransportReceiptDigest"] == nil &&
		!currentClaimedAt.Before(initialExpiresAt) &&
		receipt.DispatchState == "dispatched" && receipt.Outcome == "post-dispatch-unknown" &&
		stringMember(receipt.Value, "errorCategory") == "transport-failed" &&
		receipt.StartedAt.Equal(initialClaimedAt) && receipt.CompletedAt.Equal(currentClaimedAt) &&
		receipt.Value["responseBodyDigest"] == nil && receipt.Value["httpStatus"] == nil &&
		receipt.Value["providerRequestId"] == nil && func() bool {
		responseBytes, ok := integerMember(receipt.Value, "responseBytes")
		return ok && responseBytes == 0
	}() && stringMember(projection, "mutationKind") == intent.MutationKind &&
		projection["resourceId"] == nil && projection["resourceRole"] == nil &&
		stringMember(projection, "outcome") == "unknown" && projection["resourceManifestDigest"] == nil &&
		projection["httpStatus"] == nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportClaimHistorySemantics(
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
) error {
	for index, intent := range request.DispatchIntentSet.Intents {
		initialClaim := request.DispatchClaimSet.Receipts[index]
		transportReceipt := request.TransportReceiptSet.Receipts[index]
		chain := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt, 0, 2)
		for _, claim := range request.DispatchClaimHistorySet.Receipts {
			if claim.DispatchIntentDigest == intent.IntentDigest {
				chain = append(chain, claim)
			}
		}
		if len(chain) < 1 {
			return ErrInvalid
		}
		currentClaim := chain[len(chain)-1]
		sentinelID := strings.HasPrefix(
			stringMember(transportReceipt.Value, "receiptId"),
			evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryReceiptPrefix,
		)
		sentinelMatches := evaluationHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportMatches(
			intent, initialClaim, currentClaim, transportReceipt,
		)
		if sentinelID != sentinelMatches ||
			(currentClaim.ReceiptDigest != initialClaim.ReceiptDigest &&
				currentClaim.Value["priorTransportReceiptDigest"] == nil && !sentinelMatches) {
			return ErrInvalid
		}
	}
	return nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAuthorityDigests() (string, string, string, error) {
	keyRefDigest, err := canonicaljson.Digest(map[string]any{
		"keyId":              evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyID,
		"keyVersion":         int64(1),
		"keyEnvironmentName": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyEnvironment,
		"keyRef":             evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyRef,
	})
	if err != nil {
		return "", "", "", err
	}
	encryptionProfileDigest, err := canonicaljson.Digest(map[string]any{
		"algorithm": "aes-256-gcm", "aadFormat": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAADFormat,
		"aadVersion": int64(1), "keyRefDigest": keyRefDigest,
		"maximumCiphertextBytes": int64(maximumEvaluationHostedRetrievalRuntimeResourceLifecycleCiphertextBytes),
	})
	if err != nil {
		return "", "", "", err
	}
	retentionPolicyDigest, err := canonicaljson.Digest(map[string]any{
		"retentionClass": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolRetentionClass,
		"maximumAgeMs":   int64(maximumEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolLifetime / time.Millisecond),
		"disposition":    "destroy-on-business-seal-or-expiry",
	})
	return keyRefDigest, encryptionProfileDigest, retentionPolicyDigest, err
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleBase64URL(
	value any,
	minimum int,
	maximum int,
) ([]byte, error) {
	text, ok := value.(string)
	if !ok || text == "" || len(text)%4 == 1 {
		return nil, ErrInvalid
	}
	decoded, err := base64.RawURLEncoding.Strict().DecodeString(text)
	if err != nil || len(decoded) < minimum || len(decoded) > maximum ||
		base64.RawURLEncoding.EncodeToString(decoded) != text {
		return nil, ErrInvalid
	}
	return decoded, nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolAAD(
	value map[string]any,
) ([]byte, string, time.Time, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(value, 65_536)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAADKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAADFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "namespaceId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "runtimeResourceSetId")) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "authorityDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "lifecycleClaimReceiptDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableIdentity(value, "resourceId") ||
		!oneOfString(stringMember(value, "resourceRole"), "", "auxiliary", "primary") ||
		!oneOfString(stringMember(value, "operation"), "create", "delete") {
		return nil, "", time.Time{}, ErrInvalid
	}
	for _, key := range []string{
		"planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "registrationRequestDigest",
		"dispatchIntentSetDigest", "dispatchStageClaimReceiptSetDigest", "transportReceiptSetDigest",
		"businessResultDigest", "plaintextDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, key)) {
			return nil, "", time.Time{}, ErrInvalid
		}
	}
	operation := stringMember(value, "operation")
	if operation == "create" {
		if value["authorityDigest"] != nil || value["lifecycleClaimReceiptDigest"] != nil ||
			value["resourceId"] != nil || value["resourceRole"] != nil {
			return nil, "", time.Time{}, ErrInvalid
		}
	} else if value["authorityDigest"] == nil || value["lifecycleClaimReceiptDigest"] == nil ||
		value["resourceId"] == nil || value["resourceRole"] == nil {
		return nil, "", time.Time{}, ErrInvalid
	}
	lifecycleExpiresAt, err := evaluationInstant(value["lifecycleExpiresAt"], "lifecycleExpiresAt")
	if err != nil {
		return nil, "", time.Time{}, ErrInvalid
	}
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		return nil, "", time.Time{}, err
	}
	return canonical, digest, lifecycleExpiresAt, nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopes(
	writeEnvelope map[string]any,
	authority map[string]any,
	aadDigest string,
	plaintextDigest string,
) ([]byte, []byte, []byte, []byte, error) {
	writeCanonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(writeEnvelope, 524_288)
	if err != nil || !exactEvaluationKeys(writeEnvelope, evaluationHostedRetrievalRuntimeResourceLifecycleGenericSpoolEnvelopeKeys) ||
		stringMember(writeEnvelope, "format") != evaluationProviderResultSpoolEnvelopeFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(writeEnvelope) {
		return nil, nil, nil, nil, ErrInvalid
	}
	authorityCanonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(authority, 65_536)
	if err != nil || !exactEvaluationKeys(authority, evaluationHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthorityKeys) ||
		stringMember(authority, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthorityFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(authority) {
		return nil, nil, nil, nil, ErrInvalid
	}
	keyRefDigest, encryptionProfileDigest, _, err := evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAuthorityDigests()
	if err != nil {
		return nil, nil, nil, nil, err
	}
	for _, value := range []map[string]any{writeEnvelope, authority} {
		keyVersion, keyVersionOK := integerMember(value, "keyVersion")
		ciphertextSize, ciphertextSizeOK := integerMember(value, "ciphertextSizeBytes")
		if stringMember(value, "algorithm") != "aes-256-gcm" ||
			stringMember(value, "keyId") != evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyID ||
			!keyVersionOK || keyVersion != 1 ||
			stringMember(value, "keyRefDigest") != keyRefDigest ||
			stringMember(value, "encryptionProfileDigest") != encryptionProfileDigest ||
			!ciphertextSizeOK || ciphertextSize < 1 || ciphertextSize > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleCiphertextBytes ||
			stringMember(value, "aadDigest") != aadDigest ||
			!evaluationDigestPattern.MatchString(stringMember(value, "ciphertextDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(value, "envelopeDigest")) {
			return nil, nil, nil, nil, ErrInvalid
		}
	}
	if !validEvaluationAgentControlIdentity(stringMember(writeEnvelope, "spoolId")) ||
		!validEvaluationAgentControlIdentity(stringMember(authority, "spoolRef")) ||
		stringMember(writeEnvelope, "spoolId") != stringMember(authority, "spoolRef") ||
		stringMember(authority, "plaintextDigest") != plaintextDigest {
		return nil, nil, nil, nil, ErrInvalid
	}
	for _, key := range []string{
		"algorithm", "keyId", "keyVersion", "keyRefDigest", "encryptionProfileDigest", "nonceBase64Url",
		"authenticationTagBase64Url", "ciphertextDigest", "ciphertextSizeBytes", "aadDigest", "envelopeDigest",
	} {
		if !evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(writeEnvelope[key], authority[key]) {
			return nil, nil, nil, nil, ErrInvalid
		}
	}
	nonce, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleBase64URL(writeEnvelope["nonceBase64Url"], 12, 12)
	if err != nil {
		return nil, nil, nil, nil, ErrInvalid
	}
	tag, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleBase64URL(writeEnvelope["authenticationTagBase64Url"], 16, 16)
	if err != nil {
		return nil, nil, nil, nil, ErrInvalid
	}
	ciphertext, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleBase64URL(
		writeEnvelope["ciphertextBase64Url"], 1, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleCiphertextBytes,
	)
	if err != nil {
		return nil, nil, nil, nil, ErrInvalid
	}
	ciphertextDigest := fmt.Sprintf("sha256-%x", sha256.Sum256(ciphertext))
	ciphertextSize, _ := integerMember(writeEnvelope, "ciphertextSizeBytes")
	if ciphertextDigest != stringMember(writeEnvelope, "ciphertextDigest") || int64(len(ciphertext)) != ciphertextSize {
		return nil, nil, nil, nil, ErrInvalid
	}
	envelopeDigest, err := canonicaljson.Digest(map[string]any{
		"algorithm": stringMember(writeEnvelope, "algorithm"), "keyId": stringMember(writeEnvelope, "keyId"),
		"keyVersion": int64(1), "keyRefDigest": stringMember(writeEnvelope, "keyRefDigest"),
		"encryptionProfileDigest":    stringMember(writeEnvelope, "encryptionProfileDigest"),
		"nonceBase64Url":             stringMember(writeEnvelope, "nonceBase64Url"),
		"authenticationTagBase64Url": stringMember(writeEnvelope, "authenticationTagBase64Url"),
		"ciphertextDigest":           ciphertextDigest, "ciphertextSizeBytes": ciphertextSize,
		"aadDigest": aadDigest,
	})
	if err != nil || envelopeDigest != stringMember(writeEnvelope, "envelopeDigest") {
		return nil, nil, nil, nil, ErrInvalid
	}
	return writeCanonical, authorityCanonical, ciphertext, append(append([]byte(nil), nonce...), tag...), nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceipt(
	value map[string]any,
	aad map[string]any,
	aadDigest string,
	envelope map[string]any,
	lifecycleExpiresAt time.Time,
) ([]byte, time.Time, time.Time, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(value, 65_536)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") {
		return nil, time.Time{}, time.Time{}, ErrInvalid
	}
	_, _, retentionPolicyDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAuthorityDigests()
	if err != nil {
		return nil, time.Time{}, time.Time{}, err
	}
	expectedSpoolRef := "hosted-lifecycle-spool." + aadDigest[len("sha256-"):]
	if stringMember(value, "spoolRef") != expectedSpoolRef || stringMember(envelope, "spoolRef") != expectedSpoolRef ||
		stringMember(value, "aadDigest") != aadDigest ||
		stringMember(value, "retentionClass") != evaluationHostedRetrievalRuntimeResourceLifecycleSpoolRetentionClass ||
		stringMember(value, "retentionPolicyDigest") != retentionPolicyDigest {
		return nil, time.Time{}, time.Time{}, ErrInvalid
	}
	for _, key := range []string{
		"namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
		"runtimeResourceSetId", "lifecycleExpiresAt", "registrationRequestDigest", "authorityDigest",
		"lifecycleClaimReceiptDigest", "operation", "resourceId", "resourceRole", "dispatchIntentSetDigest",
		"dispatchStageClaimReceiptSetDigest", "dispatchStageClaimHistorySetDigest", "transportReceiptSetDigest",
		"businessResultDigest", "plaintextDigest",
	} {
		if !evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value[key], aad[key]) {
			return nil, time.Time{}, time.Time{}, ErrInvalid
		}
	}
	for _, key := range []string{
		"algorithm", "keyId", "keyVersion", "keyRefDigest", "encryptionProfileDigest", "envelopeDigest",
		"ciphertextDigest", "ciphertextSizeBytes", "plaintextDigest",
	} {
		if !evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value[key], envelope[key]) {
			return nil, time.Time{}, time.Time{}, ErrInvalid
		}
	}
	createdAt, createdErr := evaluationInstant(value["createdAt"], "createdAt")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "expiresAt")
	if createdErr != nil || expiresErr != nil || !expiresAt.After(createdAt) || expiresAt.After(lifecycleExpiresAt) ||
		expiresAt.Sub(createdAt) > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolLifetime {
		return nil, time.Time{}, time.Time{}, ErrInvalid
	}
	return canonical, createdAt, expiresAt, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil || evaluationAuthenticityCredentialPattern.Match(source) ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportPurpose ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "expectedPriorTransportStoreReceiptDigest") ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	intentSetValue, intentSetOK := objectMember(value, "dispatchIntentSet")
	claimSetValue, claimSetOK := objectMember(value, "dispatchStageClaimReceiptSet")
	claimHistorySetValue, claimHistorySetOK := objectMember(value, "dispatchStageClaimHistorySet")
	transportSetValue, transportSetOK := objectMember(value, "transportReceiptSet")
	aadValue, aadOK := objectMember(value, "spoolAad")
	writeEnvelopeValue, writeEnvelopeOK := objectMember(value, "spoolWriteEnvelope")
	envelopeValue, envelopeOK := objectMember(value, "spoolEnvelopeAuthority")
	spoolReceiptValue, spoolReceiptOK := objectMember(value, "spoolReceipt")
	if !intentSetOK || !claimSetOK || !claimHistorySetOK || !transportSetOK || !aadOK || !writeEnvelopeOK || !envelopeOK || !spoolReceiptOK {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	intentSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(intentSetValue)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	claimSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet(claimSetValue, intentSet)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	claimHistorySet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet(
		claimHistorySetValue, intentSet, claimSet,
	)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	transportSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(
		transportSetValue, intentSet, claimSet,
	)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	aadCanonical, aadDigest, lifecycleExpiresAt, err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolAAD(aadValue)
	if err != nil || stringMember(aadValue, "dispatchIntentSetDigest") != intentSet.SetDigest ||
		stringMember(aadValue, "dispatchStageClaimReceiptSetDigest") != claimSet.SetDigest ||
		stringMember(aadValue, "dispatchStageClaimHistorySetDigest") != claimHistorySet.SetDigest ||
		stringMember(aadValue, "transportReceiptSetDigest") != transportSet.SetDigest ||
		stringMember(aadValue, "operation") != intentSet.Operation ||
		stringMember(aadValue, "registrationRequestDigest") != intentSet.RegistrationRequestDigest ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(aadValue["lifecycleClaimReceiptDigest"], intentSet.LifecycleClaimReceiptDigest) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	writeCanonical, envelopeCanonical, ciphertext, nonceAndTag, err :=
		validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopes(
			writeEnvelopeValue, envelopeValue, aadDigest, stringMember(aadValue, "plaintextDigest"),
		)
	if err != nil || len(nonceAndTag) != 28 {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	spoolReceiptCanonical, spoolCreatedAt, spoolExpiresAt, err :=
		validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceipt(
			spoolReceiptValue, aadValue, aadDigest, envelopeValue, lifecycleExpiresAt,
		)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	firstIntent := intentSet.Intents[0]
	if stringMember(aadValue, "namespaceId") != firstIntent.NamespaceID ||
		stringMember(aadValue, "repositoryCommit") != firstIntent.RepositoryCommit ||
		stringMember(aadValue, "planDigest") != firstIntent.PlanDigest ||
		stringMember(aadValue, "frozenRunDigest") != firstIntent.FrozenRunDigest ||
		stringMember(aadValue, "runConfigArtifactBindingDigest") != firstIntent.RunConfigArtifactBindingDigest ||
		stringMember(aadValue, "runtimeResourceSetId") != firstIntent.RuntimeResourceSetID {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	request := evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{
		ExpectedPriorTransportStoreReceiptDigest: value["expectedPriorTransportStoreReceiptDigest"],
		DispatchIntentSet:                        intentSet, DispatchClaimSet: claimSet, DispatchClaimHistorySet: claimHistorySet,
		TransportReceiptSet: transportSet,
		SpoolAAD:            aadValue, SpoolAADCanonical: aadCanonical, SpoolAADDigest: aadDigest,
		SpoolWriteEnvelope: writeEnvelopeValue, SpoolWriteEnvelopeCanonical: writeCanonical,
		SpoolEnvelopeAuthority: envelopeValue, SpoolEnvelopeCanonical: envelopeCanonical,
		SpoolReceipt: spoolReceiptValue, SpoolReceiptCanonical: spoolReceiptCanonical,
		Ciphertext: append([]byte(nil), ciphertext...), Nonce: append([]byte(nil), nonceAndTag[:12]...),
		AuthenticationTag: append([]byte(nil), nonceAndTag[12:]...), LifecycleExpiresAt: lifecycleExpiresAt,
		SpoolCreatedAt: spoolCreatedAt, SpoolExpiresAt: spoolExpiresAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportClaimHistorySemantics(request) != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest{}, ErrInvalid
	}
	return request, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleTransportImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                     evaluationHostedRetrievalRuntimeResourceLifecycleTransportImplementationFormat,
		"version":                    int64(1),
		"transportAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceLifecycleTransportAuthorityIssuerID,
	})
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
	receiptBytes []byte,
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
	receiptDigest string,
	ledgerRevision int64,
) error {
	value, err := decodeCanonicalEvaluationObject(
		receiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	implementationDigest, implementationErr := evaluationHostedRetrievalRuntimeResourceLifecycleTransportImplementationDigest()
	storedAt, storedAtErr := evaluationInstant(value["storedAt"], "storedAt")
	supersededAt, supersededAtErr := evaluationInstant(value["supersededSpoolDestroyedAt"], "supersededSpoolDestroyedAt")
	if value["supersededSpoolDestroyedAt"] == nil {
		supersededAtErr = nil
	}
	storedRevision, revisionOK := integerMember(value, "transportLedgerRevision")
	if err != nil || implementationErr != nil || storedAtErr != nil ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		stringMember(value, "receiptDigest") != receiptDigest ||
		stringMember(value, "requestDigest") != request.RequestDigest ||
		stringMember(value, "operation") != request.DispatchIntentSet.Operation ||
		stringMember(value, "registrationRequestDigest") != request.DispatchIntentSet.RegistrationRequestDigest ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(
			value["expectedPriorTransportStoreReceiptDigest"], request.ExpectedPriorTransportStoreReceiptDigest,
		) ||
		stringMember(value, "transportAuthorityIssuerId") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportAuthorityIssuerID ||
		stringMember(value, "transportAuthorityImplementationDigest") != implementationDigest ||
		!revisionOK || storedRevision != ledgerRevision || storedRevision < 1 ||
		stringMember(value, "dispatchIntentSetDigest") != request.DispatchIntentSet.SetDigest ||
		stringMember(value, "dispatchStageClaimReceiptSetDigest") != request.DispatchClaimSet.SetDigest ||
		stringMember(value, "dispatchStageClaimHistorySetDigest") != request.DispatchClaimHistorySet.SetDigest ||
		stringMember(value, "transportReceiptSetDigest") != request.TransportReceiptSet.SetDigest ||
		stringMember(value, "spoolAadDigest") != request.SpoolAADDigest ||
		stringMember(value, "spoolEnvelopeDigest") != stringMember(request.SpoolEnvelopeAuthority, "envelopeDigest") ||
		stringMember(value, "spoolReceiptDigest") != stringMember(request.SpoolReceipt, "receiptDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "supersededSpoolReceiptDigest") ||
		supersededAtErr != nil ||
		(request.ExpectedPriorTransportStoreReceiptDigest == nil &&
			(value["supersededSpoolReceiptDigest"] != nil || value["supersededSpoolDestroyedAt"] != nil)) ||
		(request.ExpectedPriorTransportStoreReceiptDigest != nil &&
			(value["supersededSpoolReceiptDigest"] == nil || value["supersededSpoolDestroyedAt"] == nil)) ||
		(value["supersededSpoolDestroyedAt"] != nil && supersededAt.After(storedAt)) ||
		storedAt.Before(request.SpoolCreatedAt) || !storedAt.Before(request.SpoolExpiresAt) {
		return ErrConflict
	}
	return nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistory(
	historyBytes []byte,
	historyDigest string,
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
	currentReceiptBytes []byte,
) error {
	value, err := decodeCanonicalEvaluationObject(
		historyBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleClaimHistorySetBytes,
	)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistoryKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistoryFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "historyDigest") ||
		stringMember(value, "historyDigest") != historyDigest ||
		stringMember(value, "operation") != request.DispatchIntentSet.Operation ||
		stringMember(value, "registrationRequestDigest") != request.DispatchIntentSet.RegistrationRequestDigest {
		return ErrConflict
	}
	receipts, receiptsOK := arrayMember(value, "receipts")
	digests, digestsOK := evaluationHostedRetrievalRuntimeResourceLifecycleDigestArray(
		value["receiptDigests"], maximumEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistory,
	)
	if !receiptsOK || !digestsOK || len(receipts) < 1 || len(receipts) > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistory ||
		len(receipts) != len(digests) {
		return ErrConflict
	}
	var prior map[string]any
	for index, raw := range receipts {
		receipt, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(receipt, evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptKeys) ||
			stringMember(receipt, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptFormat ||
			!evaluationHostedRetrievalRuntimeResourceVersionOne(receipt) ||
			!evaluationHostedRetrievalRuntimeResourceSelfDigest(receipt, "receiptDigest") ||
			stringMember(receipt, "receiptDigest") != digests[index] ||
			stringMember(receipt, "operation") != request.DispatchIntentSet.Operation ||
			stringMember(receipt, "registrationRequestDigest") != request.DispatchIntentSet.RegistrationRequestDigest {
			return ErrConflict
		}
		revision, revisionOK := integerMember(receipt, "transportLedgerRevision")
		storedAt, storedAtErr := evaluationInstant(receipt["storedAt"], "storedAt")
		if !revisionOK || storedAtErr != nil {
			return ErrConflict
		}
		if index == 0 {
			if receipt["expectedPriorTransportStoreReceiptDigest"] != nil || revision != 1 ||
				receipt["supersededSpoolReceiptDigest"] != nil || receipt["supersededSpoolDestroyedAt"] != nil {
				return ErrConflict
			}
		} else {
			priorRevision, priorRevisionOK := integerMember(prior, "transportLedgerRevision")
			priorStoredAt, priorStoredAtErr := evaluationInstant(prior["storedAt"], "storedAt")
			supersededAt, supersededAtErr := evaluationInstant(receipt["supersededSpoolDestroyedAt"], "supersededSpoolDestroyedAt")
			if !priorRevisionOK || priorStoredAtErr != nil || supersededAtErr != nil ||
				stringMember(receipt, "expectedPriorTransportStoreReceiptDigest") != stringMember(prior, "receiptDigest") ||
				stringMember(receipt, "supersededSpoolReceiptDigest") != stringMember(prior, "spoolReceiptDigest") ||
				revision != priorRevision+1 || supersededAt.Before(priorStoredAt) || supersededAt.After(storedAt) {
				return ErrConflict
			}
		}
		prior = receipt
	}
	current, ok := receipts[len(receipts)-1].(map[string]any)
	currentCanonical, canonicalErr := canonicaljson.Bytes(current)
	if !ok || canonicalErr != nil || !bytes.Equal(currentCanonical, currentReceiptBytes) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(
			current["expectedPriorTransportStoreReceiptDigest"], request.ExpectedPriorTransportStoreReceiptDigest,
		) {
		return ErrConflict
	}
	return nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportHistoryTx(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	ownerInstanceID string,
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
	recoveryOnly bool,
) error {
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleDispatchImplementationDigest()
	if err != nil {
		return err
	}
	for _, claim := range request.DispatchClaimHistorySet.Receipts {
		var stored []byte
		if queryErr := tx.QueryRowContext(ctx, `SELECT receipt_bytes
			FROM ae_hrrr_lifecycle_dispatch_claim_receipts
			WHERE namespace_id=$1 AND receipt_digest=$2 FOR SHARE`,
			namespaceID, claim.ReceiptDigest).Scan(&stored); queryErr != nil || !bytes.Equal(stored, claim.Canonical) {
			if queryErr != nil {
				return queryErr
			}
			return ErrConflict
		}
	}
	for intentIndex, intent := range request.DispatchIntentSet.Intents {
		if stringMember(intent.Value, "lifecycleOwnerAuthorityIssuerId") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchAuthorityIssuerID ||
			stringMember(intent.Value, "lifecycleOwnerImplementationDigest") != implementationDigest {
			return ErrConflict
		}
		chain := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt, 0, 2)
		for _, claim := range request.DispatchClaimHistorySet.Receipts {
			if claim.DispatchIntentDigest == intent.IntentDigest {
				chain = append(chain, claim)
			}
		}
		if len(chain) < 1 {
			return ErrConflict
		}
		current := chain[len(chain)-1]
		var currentReceiptDigest, currentOwnerInstanceID string
		var priorTransportReceiptDigest, sealedJournalRecordDigest sql.NullString
		if err := tx.QueryRowContext(ctx, `SELECT current_claim_receipt_digest,lifecycle_owner_instance_id,
			prior_transport_receipt_digest,sealed_journal_record_digest
			FROM ae_hrrr_lifecycle_dispatch_claim_current
			WHERE namespace_id=$1 AND intent_digest=$2 FOR UPDATE`, namespaceID, intent.IntentDigest).Scan(
			&currentReceiptDigest, &currentOwnerInstanceID, &priorTransportReceiptDigest, &sealedJournalRecordDigest,
		); err != nil {
			return err
		}
		if currentReceiptDigest != current.ReceiptDigest || currentOwnerInstanceID != ownerInstanceID ||
			sealedJournalRecordDigest.Valid {
			return ErrConflict
		}
		transition := stringMember(current.Value, "generationTransition")
		disposition := stringMember(current.Value, "deliveryDisposition")
		if recoveryOnly {
			if priorTransportReceiptDigest.Valid || transition != "expired-owner-takeover" || disposition != "reconcile-only-replay" ||
				current.Value["priorTransportReceiptDigest"] != nil {
				return ErrConflict
			}
		} else if priorTransportReceiptDigest.Valid {
			expectedTransportDigest := request.TransportReceiptSet.Receipts[intentIndex].ReceiptDigest
			if priorTransportReceiptDigest.String != expectedTransportDigest ||
				stringMember(current.Value, "priorTransportReceiptDigest") != expectedTransportDigest ||
				disposition != "reconcile-only-replay" || transition == "initial-first-delivery" {
				return ErrConflict
			}
		} else if current.ReceiptDigest != chain[0].ReceiptDigest || transition != "initial-first-delivery" ||
			disposition != "dispatch-authorized-first-delivery" {
			return ErrConflict
		}
	}
	for index, receipt := range request.TransportReceiptSet.Receipts {
		isSentinel := strings.HasPrefix(
			stringMember(receipt.Value, "receiptId"),
			evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryReceiptPrefix,
		)
		if isSentinel != recoveryOnly {
			return ErrConflict
		}
		if recoveryOnly {
			intent := request.DispatchIntentSet.Intents[index]
			initial := request.DispatchClaimSet.Receipts[index]
			var current evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt
			for _, claim := range request.DispatchClaimHistorySet.Receipts {
				if claim.DispatchIntentDigest == intent.IntentDigest {
					current = claim
				}
			}
			if !evaluationHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportMatches(
				intent, initial, current, receipt,
			) {
				return ErrConflict
			}
		}
	}
	return nil
}

func storeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsTx(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	receipts []evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceipt,
) error {
	for _, receipt := range receipts {
		var existing []byte
		err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
			FROM ae_hrrr_lifecycle_transport_receipts
			WHERE namespace_id=$1 AND receipt_digest=$2 FOR SHARE`, namespaceID, receipt.ReceiptDigest).Scan(&existing)
		if err == nil {
			if !bytes.Equal(existing, receipt.Canonical) {
				return ErrConflict
			}
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO ae_hrrr_lifecycle_transport_receipts(
			namespace_id,intent_digest,dispatch_claim_receipt_digest,receipt_digest,dispatch_state,
			outcome,started_at,completed_at,receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
			namespaceID, receipt.DispatchIntentDigest, receipt.DispatchStageClaimReceiptDigest,
			receipt.ReceiptDigest, receipt.DispatchState, receipt.Outcome, receipt.StartedAt, receipt.CompletedAt,
			string(receipt.Canonical), receipt.Canonical)
		if err != nil {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
		}
	}
	return nil
}

// StoreLifecycleTransport atomically persists the immutable transport set and
// encrypted spool envelope. Recovery can use the same route only for the
// deterministic post-dispatch-unknown sentinel derived from an expired claim
// takeover; this method never authorizes a Provider mutation.
func (owner *EvaluationHostedRetrievalRuntimeResource) StoreLifecycleTransport(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
	recoveryOnly bool,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || owner.lifecycleOwnerInstanceID == "" ||
		len(request.DispatchIntentSet.Intents) < 1 ||
		request.DispatchIntentSet.Intents[0].NamespaceID != authority.NamespaceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	storedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if storedAt.IsZero() || storedAt.Before(request.SpoolCreatedAt) || !storedAt.Before(request.SpoolExpiresAt) {
		return nil, false, ErrConflict
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleTransportImplementationDigest()
	if err != nil {
		return nil, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingRequest, existingReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT transport_store_request_bytes,transport_store_receipt_bytes
		FROM ae_hrrr_lifecycle_result_spools
		WHERE namespace_id=$1 AND transport_store_request_digest=$2 FOR SHARE`,
		authority.NamespaceID, request.RequestDigest).Scan(&existingRequest, &existingReceipt)
	if err == nil {
		if !bytes.Equal(existingRequest, request.Canonical) {
			return nil, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return existingReceipt, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportHistoryTx(
		ctx, tx, authority.NamespaceID, owner.lifecycleOwnerInstanceID, request, recoveryOnly,
	); err != nil {
		return nil, false, err
	}
	if err := storeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsTx(
		ctx, tx, authority.NamespaceID, request.TransportReceiptSet.Receipts,
	); err != nil {
		return nil, false, err
	}
	var receiptJSON, receiptBytes, historyJSON, historyBytes []byte
	var receiptDigest, historyDigest string
	var ledgerRevision int64
	err = tx.QueryRowContext(ctx, `SELECT receipt_json,receipt_bytes,receipt_digest,
		receipt_history_json,receipt_history_bytes,receipt_history_digest,transport_ledger_revision
		FROM store_agent_evaluation_hosted_runtime_lifecycle_transport($1,$2::jsonb,$3,$4,$5,$6)`,
		authority.NamespaceID, string(request.Canonical), request.Canonical,
		evaluationHostedRetrievalRuntimeResourceLifecycleTransportAuthorityIssuerID,
		implementationDigest, storedAt).Scan(
		&receiptJSON, &receiptBytes, &receiptDigest, &historyJSON, &historyBytes, &historyDigest, &ledgerRevision,
	)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	receiptValue, err := decodeCanonicalEvaluationObject(
		receiptJSON, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		return nil, false, ErrConflict
	}
	canonicalReceipt, err := canonicaljson.Bytes(receiptValue)
	historyValue, historyErr := decodeCanonicalEvaluationObject(
		historyJSON, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleClaimHistorySetBytes,
	)
	canonicalHistory, canonicalHistoryErr := canonicaljson.Bytes(historyValue)
	if err != nil || historyErr != nil || canonicalHistoryErr != nil ||
		!bytes.Equal(canonicalReceipt, receiptBytes) || !bytes.Equal(canonicalHistory, historyBytes) ||
		validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
			receiptBytes, request, receiptDigest, ledgerRevision,
		) != nil || validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistory(
		historyBytes, historyDigest, request, receiptBytes,
	) != nil {
		return nil, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	return receiptBytes, false, nil
}
