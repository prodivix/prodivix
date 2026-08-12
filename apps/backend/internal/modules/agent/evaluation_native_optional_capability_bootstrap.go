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
	evaluationNativeOptionalBootstrapCloseIngressFormat  = "prodivix.agent-evaluation-native-optional-capability-bootstrap-close-ingress"
	evaluationNativeOptionalBootstrapSourceRequestFormat = "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-request"
	evaluationNativeOptionalBootstrapSourceReceiptFormat = "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-receipt"
	evaluationNativeOptionalBootstrapSourceStageFormat   = "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-stage"
	evaluationNativeOptionalBootstrapSourceAckFormat     = "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-dispatch-ack"
	evaluationNativeOptionalBootstrapSourceReadFormat    = "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-read"
	evaluationNativeProviderOptionalSourceReceiptFormat  = "prodivix.agent-native-provider-optional-capability-source-receipt"
	evaluationNativeProviderExecutionIdentityFormat      = "prodivix.agent-native-provider-execution-identity-authority"

	maximumEvaluationNativeOptionalBootstrapBytes     = 32_768
	maximumEvaluationNativeOptionalBootstrapReadBytes = 36_864
	maximumEvaluationNativeOptionalSourceBytes        = 16_384
	maximumEvaluationNativeOptionalBootstrapDelay     = 30 * time.Second
	maximumEvaluationNativeContinuationLifetime       = 125 * time.Second
	maximumEvaluationNativeOptionalBootstrapRecords   = 840
)

// evaluationNativeOptionalBootstrapCloseIngress is the only caller-provided
// bootstrap input. The repository seals it in the same transaction as the
// dispatch, transport, spool, and normalized-response roots.
type evaluationNativeOptionalBootstrapCloseIngress struct {
	AttemptID                 string
	DescriptorDigest          string
	TurnIndex                 int64
	InvocationID              string
	ProviderRequestDigest     string
	ProviderResponseDigest    string
	DispatchIntentDigest      string
	TransportReceiptDigest    string
	ResultSpoolAADigest       string
	ResultSpoolEnvelopeDigest string
	NormalizedEventSetDigest  string
	Outcome                   string
	NativeSourceReceipt       map[string]any
	IngressDigest             string
	IngressBytes              []byte
}

type evaluationNativeProviderOptionalSourceReceipt struct {
	Value             map[string]any
	ReceiptBytes      []byte
	ReceiptDigest     string
	SourceDigest      string
	FactKind          string
	FactDigest        string
	FactValue         map[string]any
	CapabilityProfile string
	ObservedAt        time.Time
}

// EvaluationNativeOptionalBootstrapSourceRecord is the immutable typed row
// created by transport close. It keeps both canonical preimages needed by an
// offline archive verifier and the Backend-created source-owner seal.
type EvaluationNativeOptionalBootstrapSourceRecord struct {
	NamespaceID                         string
	PlanDigest                          string
	RepositoryCommit                    string
	AttemptID                           string
	DescriptorDigest                    string
	TargetID                            string
	TargetDigest                        string
	CapabilityProfileID                 string
	CapabilityProfileDigest             string
	CapabilityDescriptorDigest          string
	CapabilityID                        string
	SupportExpectation                  string
	TurnIndex                           int64
	InvocationID                        string
	ProtocolFamily                      string
	ProviderConfigurationID             string
	ModelID                             string
	ModelLineageDigest                  string
	AdapterDigest                       string
	ProviderRequestDigest               string
	ProviderResponseDigest              string
	DispatchIntentDigest                string
	TransportReceiptDigest              string
	ResultSpoolReceiptDigest            string
	ResultSpoolAADigest                 string
	ResultSpoolEnvelopeDigest           string
	NormalizedEventSetDigest            string
	SourceAuthorityID                   string
	SourceAuthorityImplementationDigest string
	SourceAuthorityRouteBinding         string
	RegistrationAuthorityIssuerID       string
	RegistrationReceiptDigest           string
	RuntimeFactSourceAuthorityDigest    string
	ProbeProgramDigest                  string
	Outcome                             string
	NativeProviderSourceReceiptDigest   string
	NativeProviderSourceDigest          string
	FactKind                            string
	FactDigest                          string
	IngressDigest                       string
	SourceRequestDigest                 string
	SourceOwnerStageDigest              string
	SourceOwnerDispatchAckDigest        string
	SourceReceiptDigest                 string
	V46Eligible                         bool
	IngressBytes                        []byte
	NativeProviderSourceReceiptBytes    []byte
	FactBytes                           []byte
	SourceRequestBytes                  []byte
	SourceReceiptBytes                  []byte
	OptionalAuthorityRequestDigest      string
	OptionalAuthorityRequestBytes       []byte
	ObservedAt                          time.Time
	SealedAt                            time.Time
}

// EvaluationNativeOptionalBootstrapSourceReadRecord is the bounded recovery
// view returned after a transport-close ACK loss. ResponseBytes contain the
// stored source receipt preimage and never trigger provider execution.
type EvaluationNativeOptionalBootstrapSourceReadRecord struct {
	AttemptID           string
	TurnIndex           int64
	SourceRequestDigest string
	SourceReceiptDigest string
	ReadDigest          string
	ResponseBytes       []byte
}

func decodeEvaluationNativeOptionalBootstrapCloseIngress(
	source []byte,
) (evaluationNativeOptionalBootstrapCloseIngress, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeOptionalBootstrapBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "attemptId", "descriptorDigest", "turnIndex", "invocationId",
		"providerRequestDigest", "providerResponseDigest", "dispatchIntentDigest", "transportReceiptDigest",
		"resultSpoolAADigest", "resultSpoolEnvelopeDigest", "normalizedEventSetDigest", "outcome",
		"nativeSourceReceipt", "ingressDigest",
	}) || stringMember(value, "format") != evaluationNativeOptionalBootstrapCloseIngressFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationNativeOptionalBootstrapCloseIngress{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnOK := integerMember(value, "turnIndex")
	if !versionOK || version != 1 || !turnOK || turnIndex != 0 ||
		!validEvaluationAgentControlIdentity(stringMember(value, "attemptId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "invocationId")) ||
		!oneOfString(stringMember(value, "outcome"), "observed", "unavailable", "failed") {
		return evaluationNativeOptionalBootstrapCloseIngress{}, ErrInvalid
	}
	for _, field := range []string{
		"descriptorDigest", "providerRequestDigest", "providerResponseDigest", "dispatchIntentDigest",
		"transportReceiptDigest", "resultSpoolAADigest", "resultSpoolEnvelopeDigest",
		"normalizedEventSetDigest", "ingressDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationNativeOptionalBootstrapCloseIngress{}, ErrInvalid
		}
	}
	nativeSourceReceipt, nativePresent := objectMember(value, "nativeSourceReceipt")
	if (stringMember(value, "outcome") == "observed") != nativePresent ||
		!nativePresent && value["nativeSourceReceipt"] != nil {
		return evaluationNativeOptionalBootstrapCloseIngress{}, ErrInvalid
	}
	base := cloneEvaluationObject(value)
	delete(base, "ingressDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "ingressDigest") {
		return evaluationNativeOptionalBootstrapCloseIngress{}, ErrConflict
	}
	return evaluationNativeOptionalBootstrapCloseIngress{
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		TurnIndex: turnIndex, InvocationID: stringMember(value, "invocationId"),
		ProviderRequestDigest:     stringMember(value, "providerRequestDigest"),
		ProviderResponseDigest:    stringMember(value, "providerResponseDigest"),
		DispatchIntentDigest:      stringMember(value, "dispatchIntentDigest"),
		TransportReceiptDigest:    stringMember(value, "transportReceiptDigest"),
		ResultSpoolAADigest:       stringMember(value, "resultSpoolAADigest"),
		ResultSpoolEnvelopeDigest: stringMember(value, "resultSpoolEnvelopeDigest"),
		NormalizedEventSetDigest:  stringMember(value, "normalizedEventSetDigest"),
		Outcome:                   stringMember(value, "outcome"), NativeSourceReceipt: nativeSourceReceipt,
		IngressDigest: digest, IngressBytes: canonical,
	}, nil
}

type evaluationNativeOptionalReceiptBinding struct {
	ProtocolFamily          string
	CapabilityProfileID     string
	CapabilityProfileDigest string
	InvocationID            string
	RequestDigest           string
	ResponseDigest          string
	ProviderConfigurationID string
	ModelLineageDigest      string
	AdapterDigest           string
	ObservedAt              time.Time
}

func evaluationNativeOptionalFactFromSource(
	program evaluationCapabilityProbeProgram,
	binding evaluationNativeOptionalReceiptBinding,
	source map[string]any,
) (string, map[string]any, error) {
	sourceKind := stringMember(source, "sourceKind")
	switch sourceKind {
	case "provider-job-active-status", "provider-job-terminal-status":
		if binding.CapabilityProfileID != "g4-provider-background-job" ||
			!exactEvaluationKeys(source, []string{
				"sourceKind", "providerStateReferenceDigest", "opaqueProviderStateRef", "stateVaultAuthorityDigest",
				"stateVaultSealRequestDigest", "stateVaultSealReceiptDigest", "taskId", "runId", "generation", "providerStatus",
			}) || !evaluationDigestPattern.MatchString(stringMember(source, "providerStateReferenceDigest")) ||
			!validEvaluationAgentControlIdentity(stringMember(source, "opaqueProviderStateRef")) ||
			!evaluationDigestPattern.MatchString(stringMember(source, "stateVaultAuthorityDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(source, "stateVaultSealRequestDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(source, "stateVaultSealReceiptDigest")) ||
			!validEvaluationAgentControlIdentity(stringMember(source, "taskId")) ||
			!validEvaluationAgentControlIdentity(stringMember(source, "runId")) {
			return "", nil, ErrInvalid
		}
		generation, ok := integerMember(source, "generation")
		status := stringMember(source, "providerStatus")
		active := sourceKind == "provider-job-active-status"
		if !ok || generation < 0 ||
			(active && !oneOfString(status, "in-progress", "queued")) ||
			(!active && !oneOfString(status, "cancelled", "completed", "failed")) {
			return "", nil, ErrInvalid
		}
		stateDigest := stringMember(source, "providerStateReferenceDigest")
		base := map[string]any{
			"providerJobId": "provider-job." + stateDigest[len("sha256-"):],
			"taskId":        stringMember(source, "taskId"), "runId": stringMember(source, "runId"),
			"generation": json.Number(fmt.Sprintf("%d", generation)), "invocationId": binding.InvocationID,
		}
		if active {
			base["phase"] = map[string]string{"queued": "accepted", "in-progress": "running"}[status]
			base["callbackAuthority"] = "active"
		} else {
			base["phase"] = "terminal"
			base["outcome"] = status
			base["callbackAuthority"] = "revoked"
		}
		digest, err := canonicaljson.Digest(base)
		if err != nil {
			return "", nil, err
		}
		fact := cloneEvaluationObject(base)
		fact["receiptDigest"] = digest
		return "provider-job-receipt", fact, nil
	case "provider-cache-usage":
		if binding.CapabilityProfileID != "g4-provider-isolated-cache" ||
			!exactEvaluationKeys(source, []string{
				"sourceKind", "cacheIsolationAuthorityDigest", "cacheKeyDigest", "prefixDescriptorDigest", "usageVector", "cachedTokenCount",
				"cacheScope", "provenIsolation", "providerRegion",
			}) || !evaluationDigestPattern.MatchString(stringMember(source, "cacheIsolationAuthorityDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(source, "cacheKeyDigest")) ||
			!oneOfString(stringMember(source, "cacheScope"), "invocation", "task", "workspace") ||
			!oneOfString(stringMember(source, "provenIsolation"), "invocation", "task", "workspace") {
			return "", nil, ErrInvalid
		}
		providerIntent, _ := objectMember(program.Value, "providerRequestIntent")
		cachePrefix, cachePrefixOK := objectMember(providerIntent, "cachePrefixResource")
		cachedTokenCount, countOK := integerMember(source, "cachedTokenCount")
		_, _, usageErr := decodeEvaluationUsage(source["usageVector"], false)
		usageVector, usageOK := objectMember(source, "usageVector")
		if !cachePrefixOK || !countOK || cachedTokenCount <= 0 || usageErr != nil || !usageOK ||
			stringMember(source, "prefixDescriptorDigest") != stringMember(cachePrefix, "descriptorDigest") {
			return "", nil, ErrInvalid
		}
		amounts, amountsOK := usageVector["amounts"].([]any)
		matchingCachedAmounts := int64(0)
		for _, rawAmount := range amounts {
			amount, amountOK := rawAmount.(map[string]any)
			if !amountOK || stringMember(amount, "unit") != "cache-read-token" {
				continue
			}
			matchingCachedAmounts++
			count := fmt.Sprintf("%d", cachedTokenCount)
			if stringMember(amount, "confidence") != "reported" ||
				stringMember(amount, "logicalAmount") != count &&
					stringMember(amount, "billableAmount") != count &&
					stringMember(amount, "cachedAmount") != count {
				return "", nil, ErrInvalid
			}
		}
		if !amountsOK || matchingCachedAmounts != 1 {
			return "", nil, ErrInvalid
		}
		if source["providerRegion"] != nil && !validEvaluationAgentControlIdentity(stringMember(source, "providerRegion")) {
			return "", nil, ErrInvalid
		}
		base := map[string]any{
			"cacheMode": "prompt", "cacheScope": stringMember(source, "cacheScope"),
			"cacheKeyDigest":      stringMember(source, "cacheKeyDigest"),
			"prefixOrItemDigests": []any{stringMember(cachePrefix, "prefixDigest")},
			"usageRef":            stringMember(usageVector, "vectorDigest"),
			"provenIsolation":     stringMember(source, "provenIsolation"),
		}
		if source["providerRegion"] != nil {
			base["providerRegion"] = stringMember(source, "providerRegion")
		}
		digest, err := canonicaljson.Digest(base)
		if err != nil {
			return "", nil, err
		}
		fact := cloneEvaluationObject(base)
		fact["receiptDigest"] = digest
		return "provider-cache-receipt", fact, nil
	case "provider-stored-continuation":
		if binding.CapabilityProfileID != "g4-provider-reasoning-continuation" ||
			!exactEvaluationKeys(source, []string{
				"sourceKind", "providerStateReferenceDigest", "opaqueProviderStateRef", "stateVaultAuthorityDigest",
				"stateVaultSealRequestDigest", "stateVaultSealReceiptDigest", "taskId", "runId", "generation", "expiresAt",
			}) || !evaluationDigestPattern.MatchString(stringMember(source, "providerStateReferenceDigest")) ||
			!validEvaluationAgentControlIdentity(stringMember(source, "opaqueProviderStateRef")) ||
			!evaluationDigestPattern.MatchString(stringMember(source, "stateVaultAuthorityDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(source, "stateVaultSealRequestDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(source, "stateVaultSealReceiptDigest")) ||
			!validEvaluationAgentControlIdentity(stringMember(source, "taskId")) ||
			!validEvaluationAgentControlIdentity(stringMember(source, "runId")) {
			return "", nil, ErrInvalid
		}
		generation, generationOK := integerMember(source, "generation")
		expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(source, "expiresAt"))
		if !generationOK || generation < 0 || expiresErr != nil || !expiresAt.After(binding.ObservedAt) ||
			expiresAt.Sub(binding.ObservedAt) > maximumEvaluationNativeContinuationLifetime {
			return "", nil, ErrInvalid
		}
		stateDigest := stringMember(source, "providerStateReferenceDigest")
		base := map[string]any{
			"continuationId":          "provider-continuation." + stateDigest[len("sha256-"):],
			"encryptedBlobRef":        stringMember(source, "opaqueProviderStateRef"),
			"providerConfigurationId": binding.ProviderConfigurationID,
			"modelLineageDigest":      binding.ModelLineageDigest, "taskId": stringMember(source, "taskId"),
			"runId": stringMember(source, "runId"), "generation": json.Number(fmt.Sprintf("%d", generation)),
			"parentInvocationId": binding.InvocationID, "purpose": "provider-tool-loop-continuation",
			"createdAt": evaluationExportInstant(binding.ObservedAt), "expiresAt": evaluationExportInstant(expiresAt),
		}
		digest, err := canonicaljson.Digest(base)
		if err != nil {
			return "", nil, err
		}
		fact := cloneEvaluationObject(base)
		fact["continuationDigest"] = digest
		return "opaque-continuation", fact, nil
	default:
		return "", nil, ErrInvalid
	}
}

func decodeEvaluationNativeProviderOptionalSourceReceipt(
	value map[string]any,
	program evaluationCapabilityProbeProgram,
	binding evaluationNativeOptionalReceiptBinding,
) (evaluationNativeProviderOptionalSourceReceipt, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "protocolFamily", "capabilityProfileId", "capabilityProfileDigest",
		"invocationId", "requestDigest", "responseDigest", "providerConfigurationId", "modelLineageDigest",
		"adapterDigest", "executionIdentityAuthority", "source", "sourceDigest", "fact", "observedAt", "receiptDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderOptionalSourceReceiptFormat ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	observedAt, observedErr := parseEvaluationServiceInstant(stringMember(value, "observedAt"))
	if !versionOK || version != 1 || observedErr != nil ||
		stringMember(value, "protocolFamily") != binding.ProtocolFamily ||
		stringMember(value, "capabilityProfileId") != binding.CapabilityProfileID ||
		stringMember(value, "capabilityProfileDigest") != binding.CapabilityProfileDigest ||
		stringMember(value, "invocationId") != binding.InvocationID ||
		stringMember(value, "requestDigest") != binding.RequestDigest ||
		stringMember(value, "responseDigest") != binding.ResponseDigest ||
		stringMember(value, "providerConfigurationId") != binding.ProviderConfigurationID ||
		stringMember(value, "modelLineageDigest") != binding.ModelLineageDigest ||
		stringMember(value, "adapterDigest") != binding.AdapterDigest ||
		!observedAt.Equal(binding.ObservedAt) || program.ProfileID != binding.CapabilityProfileID {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrConflict
	}
	if binding.ProtocolFamily == "anthropic-messages" && binding.CapabilityProfileID != "g4-provider-isolated-cache" {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrConflict
	}
	executionIdentity, identityOK := objectMember(value, "executionIdentityAuthority")
	if !identityOK || !exactEvaluationKeys(executionIdentity, []string{
		"format", "version", "invocationId", "taskId", "runId", "generation", "authorityDigest",
	}) || stringMember(executionIdentity, "format") != evaluationNativeProviderExecutionIdentityFormat ||
		!validEvaluationAgentControlIdentity(stringMember(executionIdentity, "invocationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(executionIdentity, "taskId")) ||
		!validEvaluationAgentControlIdentity(stringMember(executionIdentity, "runId")) ||
		!evaluationDigestPattern.MatchString(stringMember(executionIdentity, "authorityDigest")) {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrInvalid
	}
	identityVersion, identityVersionOK := integerMember(executionIdentity, "version")
	identityGeneration, identityGenerationOK := integerMember(executionIdentity, "generation")
	identityBase := cloneEvaluationObject(executionIdentity)
	delete(identityBase, "authorityDigest")
	identityDigest, identityDigestErr := canonicaljson.Digest(identityBase)
	if !identityVersionOK || identityVersion != 1 || !identityGenerationOK || identityGeneration < 0 {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrInvalid
	}
	if identityDigestErr != nil || identityDigest != stringMember(executionIdentity, "authorityDigest") ||
		stringMember(executionIdentity, "invocationId") != binding.InvocationID {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrConflict
	}
	source, sourceOK := objectMember(value, "source")
	fact, factOK := objectMember(value, "fact")
	factValue, factValueOK := objectMember(fact, "value")
	if !sourceOK || !factOK || !factValueOK || !exactEvaluationKeys(fact, []string{"factType", "value"}) {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrInvalid
	}
	if oneOfString(
		stringMember(source, "sourceKind"),
		"provider-job-active-status", "provider-job-terminal-status", "provider-stored-continuation",
	) {
		sourceGeneration, sourceGenerationOK := integerMember(source, "generation")
		if !sourceGenerationOK || sourceGeneration != identityGeneration ||
			stringMember(source, "taskId") != stringMember(executionIdentity, "taskId") ||
			stringMember(source, "runId") != stringMember(executionIdentity, "runId") {
			return evaluationNativeProviderOptionalSourceReceipt{}, ErrConflict
		}
	}
	factKind, expectedFact, err := evaluationNativeOptionalFactFromSource(program, binding, source)
	if err != nil || stringMember(fact, "factType") != factKind || !sameEvaluationCanonicalValue(factValue, expectedFact) {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrConflict
	}
	sourceDigest, err := canonicaljson.Digest(source)
	if err != nil || sourceDigest != stringMember(value, "sourceDigest") {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrConflict
	}
	base := cloneEvaluationObject(value)
	delete(base, "receiptDigest")
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil || receiptDigest != stringMember(value, "receiptDigest") {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrConflict
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationNativeOptionalSourceBytes {
		return evaluationNativeProviderOptionalSourceReceipt{}, ErrInvalid
	}
	var factDigest string
	if factKind == "opaque-continuation" {
		factDigest = stringMember(factValue, "continuationDigest")
	} else {
		factDigest = stringMember(factValue, "receiptDigest")
	}
	return evaluationNativeProviderOptionalSourceReceipt{
		Value: cloneEvaluationObject(value), ReceiptBytes: canonical, ReceiptDigest: receiptDigest,
		SourceDigest: sourceDigest, FactKind: factKind, FactDigest: factDigest,
		FactValue: cloneEvaluationObject(factValue), CapabilityProfile: binding.CapabilityProfileID,
		ObservedAt: observedAt,
	}, nil
}

func evaluationNativeOptionalRuntimeAuthorityValue(target EvaluationOptionalFactTargetAuthority) map[string]any {
	value := map[string]any{
		"kind": "shared-durable-capability", "sourceKind": target.SourceKind,
		"sourceAuthorityId":                   target.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": target.SourceAuthorityImplementationDigest,
		"routeBinding":                        target.SourceAuthorityRouteBinding,
		"capabilityProfileId":                 target.CapabilityProfileID,
		"capabilityProfileDigest":             target.CapabilityProfileDigest,
		"capabilityId":                        target.CapabilityID, "protocolFamily": target.ProtocolFamily,
		"providerConfigurationId": target.ProviderConfigurationID, "modelId": target.ModelID,
		"modelLineageDigest": target.ModelLineageDigest, "adapterDigest": target.AdapterDigest,
		"registrationAuthorityIssuerId": target.RegistrationAuthorityIssuerID,
		"registrationReceiptDigest":     target.RegistrationReceiptDigest,
		"authorityDigest":               target.TargetAuthorityDigest,
	}
	return value
}

func evaluationNativeOptionalBootstrapSourceOwnerStageDigest(
	sourceRequestDigest string,
	target EvaluationOptionalFactTargetAuthority,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": evaluationNativeOptionalBootstrapSourceStageFormat, "version": int64(1),
		"sourceRequestDigest": sourceRequestDigest, "sourceAuthorityId": target.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": target.SourceAuthorityImplementationDigest,
		"registrationReceiptDigest":           target.RegistrationReceiptDigest,
		"runtimeFactSourceAuthorityDigest":    target.TargetAuthorityDigest,
	})
}

func evaluationNativeOptionalBootstrapSourceOwnerAckDigest(
	sourceRequestDigest, stageDigest, outcome, nativeSourceReceiptDigest, factDigest string,
	sealedAt time.Time,
) (string, error) {
	base := map[string]any{
		"format": evaluationNativeOptionalBootstrapSourceAckFormat, "version": int64(1),
		"sourceRequestDigest": sourceRequestDigest, "sourceOwnerStageDigest": stageDigest,
		"outcome": outcome, "nativeSourceReceiptDigest": nil, "factDigest": nil,
		"sealedAt": evaluationExportInstant(sealedAt),
	}
	if nativeSourceReceiptDigest != "" {
		base["nativeSourceReceiptDigest"] = nativeSourceReceiptDigest
		base["factDigest"] = factDigest
	}
	return canonicaljson.Digest(base)
}

func evaluationNativeOptionalAuthorityRequestValue(
	request evaluationOptionalFactAuthorityRequest,
) map[string]any {
	return map[string]any{
		"format": evaluationOptionalFactAuthorityRequestFormat, "version": int64(1),
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"targetId": request.TargetID, "targetDigest": request.TargetDigest,
		"capabilityProfileId":        request.CapabilityProfileID,
		"capabilityProfileDigest":    request.CapabilityProfileDigest,
		"capabilityDescriptorDigest": request.CapabilityDescriptorDigest,
		"capabilityId":               request.CapabilityID, "supportExpectation": request.SupportExpectation,
		"turnIndex": json.Number(fmt.Sprintf("%d", request.TurnIndex)), "invocationId": request.InvocationID,
		"protocolFamily": request.ProtocolFamily, "providerConfigurationId": request.ProviderConfigurationID,
		"modelId": request.ModelID, "modelLineageDigest": request.ModelLineageDigest,
		"adapterDigest": request.AdapterDigest, "providerRequestDigest": request.ProviderRequestDigest,
		"responseDigest": request.ResponseDigest, "dispatchIntentDigest": request.DispatchIntentDigest,
		"transportReceiptDigest":   request.TransportReceiptDigest,
		"resultSpoolReceiptDigest": request.ResultSpoolReceiptDigest,
		"normalizedEventSetDigest": request.NormalizedEventSetDigest,
		"source": map[string]any{
			"kind":                               request.Source.Kind,
			"nativeBootstrapSourceRequestDigest": request.Source.NativeBootstrapSourceRequestDigest,
		},
	}
}

func evaluationNativeOptionalPreliminaryRequest(
	plan evaluationPlanFact,
	descriptor evaluationAttemptDescriptor,
	intent EvaluationTransportDispatchIntentRecord,
	receipt EvaluationTransportReceiptRecord,
	spool EvaluationProviderResultSpoolReceiptRecord,
) (evaluationOptionalFactAuthorityRequest, map[string]any, error) {
	target := evaluationPlanObjectByIdentity(plan.Value["capabilityQualificationTargets"], "targetId", descriptor.TargetID)
	provider := evaluationPlanObjectByIdentity(plan.Value["providerConfigurations"], "providerConfigurationId", intent.ProviderConfigurationID)
	optional, optionalOK := objectMember(target, "optionalCapabilitySupportAuthority")
	_, resolvedOK := objectMember(optional, "resolvedCapabilityDescriptor")
	runtimeAuthority, runtimeOK := objectMember(optional, "runtimeFactSourceAuthority")
	adapter, adapterOK := objectMember(provider, "adapter")
	if target == nil || provider == nil || !optionalOK || !resolvedOK || !runtimeOK || !adapterOK ||
		stringMember(runtimeAuthority, "sourceKind") != "sealed-provider-response-metadata" ||
		!oneOfString(stringMember(optional, "capabilityId"), "provider.background-job", "provider.isolated-cache", "provider.reasoning-continuation") {
		return evaluationOptionalFactAuthorityRequest{}, nil, ErrConflict
	}
	request := evaluationOptionalFactAuthorityRequest{
		AttemptID: descriptor.AttemptID, DescriptorDigest: descriptor.DescriptorDigest,
		TargetID: descriptor.TargetID, TargetDigest: stringMember(target, "targetDigest"),
		CapabilityProfileID:        stringMember(target, "capabilityProfileId"),
		CapabilityProfileDigest:    stringMember(target, "capabilityProfileDigest"),
		CapabilityDescriptorDigest: descriptor.CapabilityDescriptorDigest,
		CapabilityID:               stringMember(optional, "capabilityId"),
		SupportExpectation:         stringMember(optional, "supportExpectation"), TurnIndex: intent.TurnIndex,
		InvocationID: intent.InvocationID, ProtocolFamily: intent.ProtocolFamily,
		ProviderConfigurationID: intent.ProviderConfigurationID, ModelID: stringMember(target, "modelId"),
		ModelLineageDigest: intent.ModelLineageDigest, AdapterDigest: stringMember(adapter, "adapterDigest"),
		ProviderRequestDigest: intent.RequestDigest, ResponseDigest: spool.ResponseDigest,
		DispatchIntentDigest: intent.IntentDigest, TransportReceiptDigest: receipt.ReceiptDigest,
		ResultSpoolReceiptDigest: spool.ReceiptDigest, NormalizedEventSetDigest: spool.NormalizedEventSetDigest,
		Source: evaluationOptionalFactAuthoritySource{Kind: stringMember(runtimeAuthority, "sourceKind")},
	}
	return request, runtimeAuthority, nil
}

func evaluationNativeOptionalBootstrapSourceRecord(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
	descriptor evaluationAttemptDescriptor,
	intent EvaluationTransportDispatchIntentRecord,
	receipt EvaluationTransportReceiptRecord,
	spool EvaluationProviderResultSpoolReceiptRecord,
	aad evaluationProviderResultSpoolAAD,
	envelope evaluationProviderResultSpoolEnvelope,
	ingress evaluationNativeOptionalBootstrapCloseIngress,
	sealedAt time.Time,
) (EvaluationNativeOptionalBootstrapSourceRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	if ingress.AttemptID != descriptor.AttemptID || ingress.DescriptorDigest != descriptor.DescriptorDigest ||
		ingress.TurnIndex != intent.TurnIndex || ingress.InvocationID != intent.InvocationID ||
		ingress.ProviderRequestDigest != intent.RequestDigest || ingress.ProviderResponseDigest != spool.ResponseDigest ||
		ingress.DispatchIntentDigest != intent.IntentDigest || ingress.TransportReceiptDigest != receipt.ReceiptDigest ||
		ingress.ResultSpoolAADigest != aad.Digest || ingress.ResultSpoolEnvelopeDigest != envelope.EnvelopeDigest ||
		ingress.NormalizedEventSetDigest != spool.NormalizedEventSetDigest ||
		receipt.Outcome != "completed" || receipt.DispatchState != "dispatched" ||
		sealedAt.Before(receipt.CompletedAt) || sealedAt.Sub(receipt.CompletedAt) > maximumEvaluationNativeOptionalBootstrapDelay {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrConflict
	}
	request, runtimeAuthority, err := evaluationNativeOptionalPreliminaryRequest(plan, descriptor, intent, receipt, spool)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	target, err := evaluationOptionalFactTargetAuthorityFromPlan(plan, request)
	if err != nil || !evaluationOptionalFactRuntimeAuthorityMatches(runtimeAuthority, target) {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrConflict
	}
	program, err := expectedEvaluationCapabilityProbeProgram(request.CapabilityProfileID, request.CapabilityProfileDigest)
	if err != nil || program.ProgramDigest == "" {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrConflict
	}
	transportCompletedAt := receipt.CompletedAt.UTC().Truncate(time.Millisecond)
	observedAt := transportCompletedAt
	var nativeReceipt evaluationNativeProviderOptionalSourceReceipt
	var nativeReceiptValue any
	var nativeReceiptDigest any
	var factValue any
	var factBytes []byte
	if ingress.Outcome == "observed" {
		candidateObservedAt, observedErr := parseEvaluationServiceInstant(
			stringMember(ingress.NativeSourceReceipt, "observedAt"),
		)
		if observedErr != nil || candidateObservedAt.Before(transportCompletedAt) ||
			candidateObservedAt.Sub(transportCompletedAt) > maximumEvaluationNativeOptionalBootstrapDelay ||
			sealedAt.Before(candidateObservedAt) ||
			sealedAt.Sub(candidateObservedAt) > maximumEvaluationNativeOptionalBootstrapDelay {
			return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrConflict
		}
		observedAt = candidateObservedAt
		nativeReceipt, err = decodeEvaluationNativeProviderOptionalSourceReceipt(
			ingress.NativeSourceReceipt, program, evaluationNativeOptionalReceiptBinding{
				ProtocolFamily: request.ProtocolFamily, CapabilityProfileID: request.CapabilityProfileID,
				CapabilityProfileDigest: request.CapabilityProfileDigest, InvocationID: request.InvocationID,
				RequestDigest: request.ProviderRequestDigest, ResponseDigest: request.ResponseDigest,
				ProviderConfigurationID: request.ProviderConfigurationID, ModelLineageDigest: request.ModelLineageDigest,
				AdapterDigest: request.AdapterDigest, ObservedAt: observedAt,
			},
		)
		if err != nil {
			return EvaluationNativeOptionalBootstrapSourceRecord{}, err
		}
		nativeReceiptValue, nativeReceiptDigest = nativeReceipt.Value, nativeReceipt.ReceiptDigest
		factValue = map[string]any{
			"factKind": nativeReceipt.FactKind, "factDigest": nativeReceipt.FactDigest,
			"value": cloneEvaluationObject(nativeReceipt.FactValue),
		}
		factBytes, err = canonicaljson.Bytes(factValue)
		if err != nil || len(factBytes) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes {
			return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrInvalid
		}
	}
	sourceRequestBase := map[string]any{
		"format": evaluationNativeOptionalBootstrapSourceRequestFormat, "version": int64(1),
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "turnIndex": json.Number(fmt.Sprintf("%d", request.TurnIndex)),
		"invocationId": request.InvocationID, "providerRequestDigest": request.ProviderRequestDigest,
		"providerResponseDigest": request.ResponseDigest, "protocolFamily": request.ProtocolFamily,
		"providerConfigurationId": request.ProviderConfigurationID, "modelLineageDigest": request.ModelLineageDigest,
		"adapterDigest": request.AdapterDigest, "dispatchIntentDigest": request.DispatchIntentDigest,
		"transportReceiptDigest":     request.TransportReceiptDigest,
		"resultSpoolReceiptDigest":   request.ResultSpoolReceiptDigest,
		"normalizedEventSetDigest":   request.NormalizedEventSetDigest,
		"transportCompletedAt":       evaluationExportInstant(transportCompletedAt),
		"runtimeFactSourceAuthority": evaluationNativeOptionalRuntimeAuthorityValue(target),
		"probeProgramDigest":         program.ProgramDigest, "outcome": ingress.Outcome,
		"nativeSourceReceipt": nativeReceiptValue, "nativeSourceReceiptDigest": nativeReceiptDigest,
		"fact": factValue, "observedAt": evaluationExportInstant(observedAt),
	}
	if agentcontract.ValidateSanitizedAgentPayload(sourceRequestBase) != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrInvalid
	}
	sourceRequestDigest, err := canonicaljson.Digest(sourceRequestBase)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	sourceRequest := cloneEvaluationObject(sourceRequestBase)
	sourceRequest["requestDigest"] = sourceRequestDigest
	sourceRequestBytes, err := canonicaljson.Bytes(sourceRequest)
	if err != nil || len(sourceRequestBytes) > maximumEvaluationNativeOptionalBootstrapBytes {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrInvalid
	}
	stageDigest, err := evaluationNativeOptionalBootstrapSourceOwnerStageDigest(sourceRequestDigest, target)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	ackDigest, err := evaluationNativeOptionalBootstrapSourceOwnerAckDigest(
		sourceRequestDigest, stageDigest, ingress.Outcome, nativeReceipt.ReceiptDigest, nativeReceipt.FactDigest, sealedAt,
	)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	sourceReceiptBase := map[string]any{
		"format": evaluationNativeOptionalBootstrapSourceReceiptFormat, "version": int64(1),
		"sourceRequest": sourceRequest, "sourceRequestDigest": sourceRequestDigest,
		"sourceOwnerStageDigest": stageDigest, "sourceOwnerDispatchAckDigest": ackDigest,
		"sealedAt": evaluationExportInstant(sealedAt),
	}
	sourceReceiptDigest, err := canonicaljson.Digest(sourceReceiptBase)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	sourceReceipt := cloneEvaluationObject(sourceReceiptBase)
	sourceReceipt["receiptDigest"] = sourceReceiptDigest
	sourceReceiptBytes, err := canonicaljson.Bytes(sourceReceipt)
	if err != nil || len(sourceReceiptBytes) > maximumEvaluationNativeOptionalBootstrapBytes {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrInvalid
	}
	request.Source.NativeBootstrapSourceRequestDigest = sourceRequestDigest
	request.Value = evaluationNativeOptionalAuthorityRequestValue(request)
	request.RequestBytes, err = canonicaljson.Bytes(request.Value)
	if err != nil || len(request.RequestBytes) > maximumEvaluationOptionalFactAuthorityRequestBytes {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrInvalid
	}
	request.AuthorityRequestDigest, err = canonicaljson.Digest(request.Value)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	return EvaluationNativeOptionalBootstrapSourceRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TargetID: request.TargetID,
		TargetDigest: request.TargetDigest, CapabilityProfileID: request.CapabilityProfileID,
		CapabilityProfileDigest: request.CapabilityProfileDigest, CapabilityDescriptorDigest: request.CapabilityDescriptorDigest,
		CapabilityID: request.CapabilityID, SupportExpectation: request.SupportExpectation, TurnIndex: request.TurnIndex,
		InvocationID: request.InvocationID, ProtocolFamily: request.ProtocolFamily,
		ProviderConfigurationID: request.ProviderConfigurationID, ModelID: request.ModelID,
		ModelLineageDigest: request.ModelLineageDigest, AdapterDigest: request.AdapterDigest,
		ProviderRequestDigest: request.ProviderRequestDigest, ProviderResponseDigest: request.ResponseDigest,
		DispatchIntentDigest: request.DispatchIntentDigest, TransportReceiptDigest: request.TransportReceiptDigest,
		ResultSpoolReceiptDigest: request.ResultSpoolReceiptDigest, ResultSpoolAADigest: ingress.ResultSpoolAADigest,
		ResultSpoolEnvelopeDigest: ingress.ResultSpoolEnvelopeDigest,
		NormalizedEventSetDigest:  request.NormalizedEventSetDigest, SourceAuthorityID: target.SourceAuthorityID,
		SourceAuthorityImplementationDigest: target.SourceAuthorityImplementationDigest,
		SourceAuthorityRouteBinding:         target.SourceAuthorityRouteBinding,
		RegistrationAuthorityIssuerID:       target.RegistrationAuthorityIssuerID,
		RegistrationReceiptDigest:           target.RegistrationReceiptDigest,
		RuntimeFactSourceAuthorityDigest:    target.TargetAuthorityDigest, ProbeProgramDigest: program.ProgramDigest,
		Outcome: ingress.Outcome, NativeProviderSourceReceiptDigest: nativeReceipt.ReceiptDigest,
		NativeProviderSourceDigest: nativeReceipt.SourceDigest, FactKind: nativeReceipt.FactKind,
		FactDigest: nativeReceipt.FactDigest, IngressDigest: ingress.IngressDigest,
		SourceRequestDigest: sourceRequestDigest, SourceOwnerStageDigest: stageDigest,
		SourceOwnerDispatchAckDigest: ackDigest, SourceReceiptDigest: sourceReceiptDigest, V46Eligible: true,
		IngressBytes:                     append([]byte(nil), ingress.IngressBytes...),
		NativeProviderSourceReceiptBytes: append([]byte(nil), nativeReceipt.ReceiptBytes...), FactBytes: factBytes,
		SourceRequestBytes: sourceRequestBytes, SourceReceiptBytes: sourceReceiptBytes,
		OptionalAuthorityRequestDigest: request.AuthorityRequestDigest,
		OptionalAuthorityRequestBytes:  append([]byte(nil), request.RequestBytes...), ObservedAt: observedAt, SealedAt: sealedAt,
	}, nil
}

func evaluationNativeOptionalBootstrapRecordTarget(
	record EvaluationNativeOptionalBootstrapSourceRecord,
) EvaluationOptionalFactTargetAuthority {
	return EvaluationOptionalFactTargetAuthority{
		TargetID: record.TargetID, TargetDigest: record.TargetDigest,
		CapabilityProfileID: record.CapabilityProfileID, CapabilityProfileDigest: record.CapabilityProfileDigest,
		CapabilityDescriptorDigest: record.CapabilityDescriptorDigest, CapabilityID: record.CapabilityID,
		SupportExpectation: record.SupportExpectation, ProtocolFamily: record.ProtocolFamily,
		ProviderConfigurationID: record.ProviderConfigurationID, ModelID: record.ModelID,
		ModelLineageDigest: record.ModelLineageDigest, AdapterDigest: record.AdapterDigest,
		SourceKind: "sealed-provider-response-metadata", SourceAuthorityID: record.SourceAuthorityID,
		SourceAuthorityImplementationDigest: record.SourceAuthorityImplementationDigest,
		SourceAuthorityRouteBinding:         record.SourceAuthorityRouteBinding,
		RegistrationAuthorityIssuerID:       record.RegistrationAuthorityIssuerID,
		RegistrationReceiptDigest:           record.RegistrationReceiptDigest,
		TargetAuthorityDigest:               record.RuntimeFactSourceAuthorityDigest,
	}
}

func validateEvaluationNativeOptionalBootstrapSourceRecord(
	record EvaluationNativeOptionalBootstrapSourceRecord,
) error {
	if !record.V46Eligible || record.TurnIndex != 0 || record.Outcome == "" ||
		record.ObservedAt.IsZero() || record.SealedAt.IsZero() || record.SealedAt.Before(record.ObservedAt) ||
		record.SealedAt.Sub(record.ObservedAt) > maximumEvaluationNativeOptionalBootstrapDelay {
		return ErrConflict
	}
	ingress, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(record.IngressBytes)
	if err != nil || ingress.IngressDigest != record.IngressDigest || ingress.AttemptID != record.AttemptID ||
		ingress.DescriptorDigest != record.DescriptorDigest || ingress.TurnIndex != record.TurnIndex ||
		ingress.InvocationID != record.InvocationID || ingress.ProviderRequestDigest != record.ProviderRequestDigest ||
		ingress.ProviderResponseDigest != record.ProviderResponseDigest ||
		ingress.DispatchIntentDigest != record.DispatchIntentDigest ||
		ingress.TransportReceiptDigest != record.TransportReceiptDigest ||
		ingress.ResultSpoolAADigest != record.ResultSpoolAADigest ||
		ingress.ResultSpoolEnvelopeDigest != record.ResultSpoolEnvelopeDigest ||
		ingress.NormalizedEventSetDigest != record.NormalizedEventSetDigest || ingress.Outcome != record.Outcome {
		return ErrConflict
	}
	sourceRequest, err := decodeCanonicalEvaluationObject(
		record.SourceRequestBytes, maximumEvaluationNativeOptionalBootstrapBytes,
	)
	if err != nil || !exactEvaluationKeys(sourceRequest, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "invocationId", "providerRequestDigest", "providerResponseDigest", "protocolFamily",
		"providerConfigurationId", "modelLineageDigest", "adapterDigest", "dispatchIntentDigest",
		"transportReceiptDigest", "resultSpoolReceiptDigest", "normalizedEventSetDigest", "transportCompletedAt",
		"runtimeFactSourceAuthority", "probeProgramDigest", "outcome", "nativeSourceReceipt",
		"nativeSourceReceiptDigest", "fact", "observedAt", "requestDigest",
	}) || stringMember(sourceRequest, "format") != evaluationNativeOptionalBootstrapSourceRequestFormat ||
		agentcontract.ValidateSanitizedAgentPayload(sourceRequest) != nil {
		return ErrConflict
	}
	version, versionOK := integerMember(sourceRequest, "version")
	turnIndex, turnOK := integerMember(sourceRequest, "turnIndex")
	transportCompletedAt, transportTimeErr := parseEvaluationServiceInstant(stringMember(sourceRequest, "transportCompletedAt"))
	observedAt, observedErr := parseEvaluationServiceInstant(stringMember(sourceRequest, "observedAt"))
	if !versionOK || version != 1 || !turnOK || turnIndex != record.TurnIndex || transportTimeErr != nil ||
		observedErr != nil || transportCompletedAt.After(observedAt) ||
		observedAt.Sub(transportCompletedAt) > maximumEvaluationNativeOptionalBootstrapDelay ||
		!observedAt.Equal(record.ObservedAt) ||
		stringMember(sourceRequest, "namespaceId") != record.NamespaceID ||
		stringMember(sourceRequest, "planDigest") != record.PlanDigest ||
		stringMember(sourceRequest, "repositoryCommit") != record.RepositoryCommit ||
		stringMember(sourceRequest, "attemptId") != record.AttemptID ||
		stringMember(sourceRequest, "descriptorDigest") != record.DescriptorDigest ||
		stringMember(sourceRequest, "invocationId") != record.InvocationID ||
		stringMember(sourceRequest, "providerRequestDigest") != record.ProviderRequestDigest ||
		stringMember(sourceRequest, "providerResponseDigest") != record.ProviderResponseDigest ||
		stringMember(sourceRequest, "protocolFamily") != record.ProtocolFamily ||
		stringMember(sourceRequest, "providerConfigurationId") != record.ProviderConfigurationID ||
		stringMember(sourceRequest, "modelLineageDigest") != record.ModelLineageDigest ||
		stringMember(sourceRequest, "adapterDigest") != record.AdapterDigest ||
		stringMember(sourceRequest, "dispatchIntentDigest") != record.DispatchIntentDigest ||
		stringMember(sourceRequest, "transportReceiptDigest") != record.TransportReceiptDigest ||
		stringMember(sourceRequest, "resultSpoolReceiptDigest") != record.ResultSpoolReceiptDigest ||
		stringMember(sourceRequest, "normalizedEventSetDigest") != record.NormalizedEventSetDigest ||
		stringMember(sourceRequest, "probeProgramDigest") != record.ProbeProgramDigest ||
		stringMember(sourceRequest, "outcome") != record.Outcome ||
		stringMember(sourceRequest, "requestDigest") != record.SourceRequestDigest {
		return ErrConflict
	}
	sourceRequestBase := cloneEvaluationObject(sourceRequest)
	delete(sourceRequestBase, "requestDigest")
	computedRequestDigest, err := canonicaljson.Digest(sourceRequestBase)
	if err != nil || computedRequestDigest != record.SourceRequestDigest {
		return ErrConflict
	}
	target := evaluationNativeOptionalBootstrapRecordTarget(record)
	runtimeAuthority, runtimeOK := objectMember(sourceRequest, "runtimeFactSourceAuthority")
	if !runtimeOK || !evaluationOptionalFactRuntimeAuthorityMatches(runtimeAuthority, target) {
		return ErrConflict
	}
	program, err := expectedEvaluationCapabilityProbeProgram(record.CapabilityProfileID, record.CapabilityProfileDigest)
	if err != nil || program.ProgramDigest != record.ProbeProgramDigest {
		return ErrConflict
	}
	var nativeReceipt evaluationNativeProviderOptionalSourceReceipt
	if record.Outcome == "observed" {
		nativeValue, nativeOK := objectMember(sourceRequest, "nativeSourceReceipt")
		fact, factOK := objectMember(sourceRequest, "fact")
		factValue, factValueOK := objectMember(fact, "value")
		if !nativeOK || !factOK || !factValueOK ||
			stringMember(sourceRequest, "nativeSourceReceiptDigest") != record.NativeProviderSourceReceiptDigest ||
			stringMember(fact, "factKind") != record.FactKind || stringMember(fact, "factDigest") != record.FactDigest {
			return ErrConflict
		}
		nativeReceipt, err = decodeEvaluationNativeProviderOptionalSourceReceipt(
			nativeValue, program, evaluationNativeOptionalReceiptBinding{
				ProtocolFamily: record.ProtocolFamily, CapabilityProfileID: record.CapabilityProfileID,
				CapabilityProfileDigest: record.CapabilityProfileDigest, InvocationID: record.InvocationID,
				RequestDigest: record.ProviderRequestDigest, ResponseDigest: record.ProviderResponseDigest,
				ProviderConfigurationID: record.ProviderConfigurationID, ModelLineageDigest: record.ModelLineageDigest,
				AdapterDigest: record.AdapterDigest, ObservedAt: record.ObservedAt,
			},
		)
		canonicalFact, factErr := canonicaljson.Bytes(fact)
		if err != nil || factErr != nil || nativeReceipt.ReceiptDigest != record.NativeProviderSourceReceiptDigest ||
			nativeReceipt.SourceDigest != record.NativeProviderSourceDigest || nativeReceipt.FactKind != record.FactKind ||
			nativeReceipt.FactDigest != record.FactDigest || !bytes.Equal(nativeReceipt.ReceiptBytes, record.NativeProviderSourceReceiptBytes) ||
			!sameEvaluationCanonicalValue(nativeReceipt.FactValue, factValue) || !bytes.Equal(canonicalFact, record.FactBytes) {
			return ErrConflict
		}
	} else if sourceRequest["nativeSourceReceipt"] != nil || sourceRequest["nativeSourceReceiptDigest"] != nil ||
		sourceRequest["fact"] != nil || record.NativeProviderSourceReceiptDigest != "" ||
		record.NativeProviderSourceDigest != "" || record.FactKind != "" || record.FactDigest != "" ||
		len(record.NativeProviderSourceReceiptBytes) != 0 || len(record.FactBytes) != 0 {
		return ErrConflict
	}
	stageDigest, err := evaluationNativeOptionalBootstrapSourceOwnerStageDigest(record.SourceRequestDigest, target)
	if err != nil || stageDigest != record.SourceOwnerStageDigest {
		return ErrConflict
	}
	ackDigest, err := evaluationNativeOptionalBootstrapSourceOwnerAckDigest(
		record.SourceRequestDigest, stageDigest, record.Outcome,
		record.NativeProviderSourceReceiptDigest, record.FactDigest, record.SealedAt,
	)
	if err != nil || ackDigest != record.SourceOwnerDispatchAckDigest {
		return ErrConflict
	}
	sourceReceipt, err := decodeCanonicalEvaluationObject(
		record.SourceReceiptBytes, maximumEvaluationNativeOptionalBootstrapBytes,
	)
	if err != nil || !exactEvaluationKeys(sourceReceipt, []string{
		"format", "version", "sourceRequest", "sourceRequestDigest", "sourceOwnerStageDigest",
		"sourceOwnerDispatchAckDigest", "sealedAt", "receiptDigest",
	}) || stringMember(sourceReceipt, "format") != evaluationNativeOptionalBootstrapSourceReceiptFormat ||
		!sameEvaluationCanonicalValue(sourceReceipt["sourceRequest"], sourceRequest) ||
		stringMember(sourceReceipt, "sourceRequestDigest") != record.SourceRequestDigest ||
		stringMember(sourceReceipt, "sourceOwnerStageDigest") != stageDigest ||
		stringMember(sourceReceipt, "sourceOwnerDispatchAckDigest") != ackDigest ||
		stringMember(sourceReceipt, "sealedAt") != evaluationExportInstant(record.SealedAt) ||
		stringMember(sourceReceipt, "receiptDigest") != record.SourceReceiptDigest {
		return ErrConflict
	}
	sourceReceiptBase := cloneEvaluationObject(sourceReceipt)
	delete(sourceReceiptBase, "receiptDigest")
	computedReceiptDigest, err := canonicaljson.Digest(sourceReceiptBase)
	if err != nil || computedReceiptDigest != record.SourceReceiptDigest {
		return ErrConflict
	}
	optionalRequest, err := decodeEvaluationOptionalFactAuthorityRequest(record.OptionalAuthorityRequestBytes)
	if err != nil || optionalRequest.AuthorityRequestDigest != record.OptionalAuthorityRequestDigest ||
		optionalRequest.AttemptID != record.AttemptID || optionalRequest.DescriptorDigest != record.DescriptorDigest ||
		optionalRequest.TurnIndex != record.TurnIndex || optionalRequest.Source.Kind != "sealed-provider-response-metadata" ||
		optionalRequest.Source.NativeBootstrapSourceRequestDigest != record.SourceRequestDigest {
		return ErrConflict
	}
	return nil
}

func evaluationNativeOptionalBootstrapSourceReadRecord(
	record EvaluationNativeOptionalBootstrapSourceRecord,
) (EvaluationNativeOptionalBootstrapSourceReadRecord, error) {
	if err := validateEvaluationNativeOptionalBootstrapSourceRecord(record); err != nil {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, err
	}
	sourceReceipt, err := decodeCanonicalEvaluationObject(
		record.SourceReceiptBytes, maximumEvaluationNativeOptionalBootstrapBytes,
	)
	if err != nil || stringMember(sourceReceipt, "sourceRequestDigest") != record.SourceRequestDigest ||
		stringMember(sourceReceipt, "receiptDigest") != record.SourceReceiptDigest {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, ErrConflict
	}
	base := map[string]any{
		"format": evaluationNativeOptionalBootstrapSourceReadFormat, "version": int64(1),
		"attemptId": record.AttemptID, "turnIndex": json.Number(fmt.Sprintf("%d", record.TurnIndex)),
		"sourceRequestDigest": record.SourceRequestDigest, "sourceReceiptDigest": record.SourceReceiptDigest,
		"sourceReceipt": sourceReceipt,
	}
	readDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, err
	}
	value := cloneEvaluationObject(base)
	value["readDigest"] = readDigest
	responseBytes, err := canonicaljson.Bytes(value)
	if err != nil || len(responseBytes) == 0 || len(responseBytes) > maximumEvaluationNativeOptionalBootstrapReadBytes {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, ErrInvalid
	}
	return EvaluationNativeOptionalBootstrapSourceReadRecord{
		AttemptID: record.AttemptID, TurnIndex: record.TurnIndex,
		SourceRequestDigest: record.SourceRequestDigest, SourceReceiptDigest: record.SourceReceiptDigest,
		ReadDigest: readDigest, ResponseBytes: responseBytes,
	}, nil
}

func sameEvaluationNativeOptionalBootstrapSourceRecord(
	left, right EvaluationNativeOptionalBootstrapSourceRecord,
) bool {
	return left.IngressDigest == right.IngressDigest && left.SourceRequestDigest == right.SourceRequestDigest &&
		left.SourceReceiptDigest == right.SourceReceiptDigest &&
		left.SourceOwnerStageDigest == right.SourceOwnerStageDigest &&
		left.SourceOwnerDispatchAckDigest == right.SourceOwnerDispatchAckDigest &&
		left.NativeProviderSourceReceiptDigest == right.NativeProviderSourceReceiptDigest &&
		left.FactDigest == right.FactDigest && bytes.Equal(left.IngressBytes, right.IngressBytes) &&
		bytes.Equal(left.NativeProviderSourceReceiptBytes, right.NativeProviderSourceReceiptBytes) &&
		bytes.Equal(left.FactBytes, right.FactBytes) && bytes.Equal(left.SourceRequestBytes, right.SourceRequestBytes) &&
		bytes.Equal(left.SourceReceiptBytes, right.SourceReceiptBytes) &&
		bytes.Equal(left.OptionalAuthorityRequestBytes, right.OptionalAuthorityRequestBytes)
}
