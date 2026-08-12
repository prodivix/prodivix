package agent

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityProbeProfileProjectionFormat = "prodivix.agent-capability-probe-profile-projection"
	evaluationCapabilityProbeProgramFormat           = "prodivix.agent-capability-probe-program"
	evaluationCapabilityProbeObservationFormat       = "prodivix.agent-capability-probe-program-observation"
	maximumEvaluationCapabilityProbeProgramBytes     = 16_384
	maximumEvaluationCapabilityProbeObservationBytes = 16_384
)

type evaluationCapabilityProbeProgramSpec struct {
	capabilityID              string
	inputClass                string
	deliveryMode              string
	providerStateMode         string
	toolExecutionLocus        string
	cacheMode                 string
	reasoningMode             string
	minimumParallelToolCalls  int64
	intentKind                string
	instruction               string
	documentText              any
	requestPhases             []any
	requiredToolNames         []any
	publicResourceKind        string
	cachePrefixResource       bool
	supportedRequirements     []any
	maximumToolCalls          int64
	maximumProviderRoundTrips int64
	maximumPollAttempts       int64
}

var evaluationCapabilityProbeProgramSpecs = map[string]evaluationCapabilityProbeProgramSpec{
	"g4-provider-background-job": {
		capabilityID: "provider.background-job", inputClass: "bounded-public-text", deliveryMode: "background",
		providerStateMode: "provider-background-job", toolExecutionLocus: "none", cacheMode: "disabled",
		reasoningMode: "none", intentKind: "background-job-lifecycle",
		instruction: "Complete the bounded public marker task in background mode.", documentText: nil,
		requestPhases: []any{"submit", "poll"}, requiredToolNames: []any{},
		supportedRequirements:     []any{map[string]any{"factKind": "provider-job-receipt", "minimumCount": int64(1), "providerEventType": nil}},
		maximumProviderRoundTrips: 5, maximumPollAttempts: 4,
	},
	"g4-provider-hosted-retrieval-core": {
		capabilityID: "provider.hosted-retrieval", inputClass: "bounded-public-text", deliveryMode: "response",
		providerStateMode: "stateless", toolExecutionLocus: "provider-hosted", cacheMode: "disabled",
		reasoningMode: "none", intentKind: "hosted-retrieval-public-text",
		instruction: "Retrieve and cite the canonical public probe marker source.", documentText: nil,
		requestPhases: []any{"dispatch-terminal"}, requiredToolNames: []any{"provider.retrieval.search"},
		publicResourceKind:    "repository-owned-public-text",
		supportedRequirements: []any{map[string]any{"factKind": "retrieval-query-receipt", "minimumCount": int64(1), "providerEventType": nil}},
		maximumToolCalls:      1, maximumProviderRoundTrips: 1,
	},
	"g4-provider-hosted-retrieval-document": {
		capabilityID: "provider.hosted-retrieval", inputClass: "bounded-public-document", deliveryMode: "response",
		providerStateMode: "stateless", toolExecutionLocus: "provider-hosted", cacheMode: "disabled",
		reasoningMode: "none", intentKind: "hosted-retrieval-public-document",
		instruction:   "Retrieve and cite the marker from the attached public probe document.",
		documentText:  "Public capability probe document. Marker: prodivix-capability-probe-v1.",
		requestPhases: []any{"dispatch-terminal"}, requiredToolNames: []any{"provider.retrieval.search"},
		publicResourceKind:    "repository-owned-public-document",
		supportedRequirements: []any{map[string]any{"factKind": "retrieval-query-receipt", "minimumCount": int64(1), "providerEventType": nil}},
		maximumToolCalls:      1, maximumProviderRoundTrips: 1,
	},
	"g4-provider-isolated-cache": {
		capabilityID: "provider.isolated-cache", inputClass: "bounded-public-text", deliveryMode: "response",
		providerStateMode: "stateless", toolExecutionLocus: "none", cacheMode: "prompt", reasoningMode: "none",
		intentKind:  "isolated-prompt-cache-roundtrip",
		instruction: "Return the public marker through a task-isolated prompt cache roundtrip.", documentText: nil,
		requestPhases: []any{"cache-cold", "cache-warm"}, requiredToolNames: []any{},
		cachePrefixResource: true,
		supportedRequirements: []any{
			map[string]any{"factKind": "provider-cache-receipt", "minimumCount": int64(1), "providerEventType": nil},
			map[string]any{"factKind": "usage-vector", "minimumCount": int64(1), "providerEventType": nil},
		},
	},
	"g4-provider-parallel-tool": {
		capabilityID: "provider.parallel-tool", inputClass: "bounded-public-text", deliveryMode: "stream",
		providerStateMode: "stateless", toolExecutionLocus: "client-hosted", cacheMode: "disabled", reasoningMode: "none",
		minimumParallelToolCalls: 2, intentKind: "parallel-client-tool-calls",
		instruction: "Call both public marker tools in one parallel provider turn.", documentText: nil,
		requestPhases:         []any{"dispatch-terminal"},
		requiredToolNames:     []any{"capability_probe_alpha", "capability_probe_beta"},
		supportedRequirements: []any{map[string]any{"factKind": "provider-event", "minimumCount": int64(2), "providerEventType": "tool-call"}},
		maximumToolCalls:      2, maximumProviderRoundTrips: 1,
	},
	"g4-provider-reasoning-continuation": {
		capabilityID: "provider.reasoning-continuation", inputClass: "bounded-public-text", deliveryMode: "response",
		providerStateMode: "provider-stored-parent", toolExecutionLocus: "none", cacheMode: "disabled",
		reasoningMode: "opaque-continuation", intentKind: "opaque-continuation-roundtrip",
		instruction: "Preserve and resume the opaque continuation for the public marker.", documentText: nil,
		requestPhases: []any{"continue", "resume"}, requiredToolNames: []any{},
		supportedRequirements: []any{map[string]any{"factKind": "opaque-continuation", "minimumCount": int64(1), "providerEventType": nil}},
	},
}

type evaluationCapabilityProbeProgram struct {
	Value                      map[string]any
	ProfileID                  string
	ProgramDigest              string
	ProfileProjectionDigest    string
	MaximumNormalizedFacts     int64
	MaximumRequestBytes        int64
	MaximumResponseBytes       int64
	MaximumToolCalls           int64
	MaximumProviderRoundTrips  int64
	MaximumPollAttempts        int64
	MaximumSingleDispatchMS    int64
	MaximumExecutionDurationMS int64
	RequiredToolNames          []string
	PublicProbeResource        map[string]any
	SupportedRequirements      []any
}

func evaluationCapabilityProbePublicResource(kind string) (any, error) {
	if kind == "" {
		return nil, nil
	}
	content, err := evaluationCapabilityProbePublicResourceContent(kind)
	if err != nil {
		return nil, err
	}
	var resourceID, indexID string
	var documentText any
	switch kind {
	case "repository-owned-public-text":
		resourceID = "capability-probe.public-text.v1"
		indexID = "capability-probe.public-index.v1"
	case "repository-owned-public-document":
		resourceID = "capability-probe.public-document.v1"
		indexID = "capability-probe.public-document-index.v1"
		documentText = content
	}
	contentDigest, err := canonicaljson.Digest(map[string]any{"encoding": "utf-8", "text": content})
	if err != nil {
		return nil, err
	}
	queryDigest, err := canonicaljson.Digest(map[string]any{"query": "prodivix capability probe marker"})
	if err != nil {
		return nil, err
	}
	indexDigest, err := canonicaljson.Digest(map[string]any{"indexId": indexID})
	if err != nil {
		return nil, err
	}
	expectedMarkerDigest, err := canonicaljson.Digest(map[string]any{"marker": "prodivix-capability-probe-v1"})
	if err != nil {
		return nil, err
	}
	var documentBytesDigest any
	if documentText != nil {
		documentBytesDigest, err = canonicaljson.Digest(map[string]any{"encoding": "utf-8", "text": documentText})
		if err != nil {
			return nil, err
		}
	}
	base := map[string]any{
		"resourceId": resourceID, "resourceKind": kind, "contentDigest": contentDigest,
		"queryDigest": queryDigest, "indexDigest": indexDigest, "expectedMarkerDigest": expectedMarkerDigest,
		"documentBytesDigest": documentBytesDigest,
	}
	descriptorDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	resource := cloneEvaluationObject(base)
	resource["descriptorDigest"] = descriptorDigest
	return resource, nil
}

func evaluationCapabilityProbePublicResourceContent(kind string) (string, error) {
	switch kind {
	case "repository-owned-public-text":
		return "Prodivix public capability probe corpus entry. Marker: prodivix-capability-probe-v1.", nil
	case "repository-owned-public-document":
		return "Public capability probe document. Marker: prodivix-capability-probe-v1.", nil
	default:
		return "", ErrInvalid
	}
}

func evaluationCapabilityProbeCachePrefixResource(enabled bool) (any, error) {
	if !enabled {
		return nil, nil
	}
	prefixText := strings.Repeat("prodivix ", 4_607) + "prodivix"
	prefixDigest, err := canonicaljson.Digest(map[string]any{"encoding": "utf-8", "text": prefixText})
	if err != nil {
		return nil, err
	}
	coldSuffixDigest, err := canonicaljson.Digest(map[string]any{
		"suffix": "Cold pass: return marker prodivix-capability-probe-v1.",
	})
	if err != nil {
		return nil, err
	}
	warmSuffixDigest, err := canonicaljson.Digest(map[string]any{
		"suffix": "Warm pass: return marker prodivix-capability-probe-v1.",
	})
	if err != nil {
		return nil, err
	}
	base := map[string]any{
		"resourceId": "capability-probe.cache-prefix.v1", "encoding": "utf-8",
		"prefixByteLength": int64(len([]byte(prefixText))), "prefixDigest": prefixDigest,
		"minimumTokenCountByProtocol": map[string]any{
			"anthropic-messages": int64(4_096), "gemini-interactions": int64(4_096),
			"openai-responses": int64(1_024),
		},
		"coldSuffixDigest": coldSuffixDigest, "warmSuffixDigest": warmSuffixDigest,
	}
	descriptorDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	result := cloneEvaluationObject(base)
	result["descriptorDigest"] = descriptorDigest
	return result, nil
}

func evaluationCapabilityProbeNetworkRoundTripPolicy(
	spec evaluationCapabilityProbeProgramSpec,
	maximumProviderRoundTrips int64,
) map[string]any {
	if spec.intentKind == "background-job-lifecycle" {
		return map[string]any{
			"mode": "repeat-until-terminal", "minimumRoundTrips": int64(2),
			"maximumRoundTrips": maximumProviderRoundTrips, "repeatedPhase": "poll",
			"minimumRepeatCount": int64(1), "maximumRepeatCount": spec.maximumPollAttempts,
			"terminalOnFinalRoundTrip": true,
		}
	}
	return map[string]any{
		"mode": "fixed", "minimumRoundTrips": maximumProviderRoundTrips,
		"maximumRoundTrips": maximumProviderRoundTrips, "repeatedPhase": nil,
		"minimumRepeatCount": int64(0), "maximumRepeatCount": int64(0),
		"terminalOnFinalRoundTrip": true,
	}
}

func expectedEvaluationCapabilityProbeProgram(profileID string, profileDigest string) (evaluationCapabilityProbeProgram, error) {
	spec, ok := evaluationCapabilityProbeProgramSpecs[profileID]
	expectedProfileDigest, digestErr := canonicaljson.Digest(map[string]any{"profileId": profileID})
	if !ok || digestErr != nil || profileDigest != expectedProfileDigest {
		return evaluationCapabilityProbeProgram{}, ErrConflict
	}
	profileBase := map[string]any{
		"format": evaluationCapabilityProbeProfileProjectionFormat, "version": int64(1),
		"capabilityProfileId": profileID, "capabilityProfileDigest": profileDigest,
		"capabilityId": spec.capabilityID, "inputClass": spec.inputClass,
		"deliveryMode": spec.deliveryMode, "providerStateMode": spec.providerStateMode,
		"toolExecutionLocus": spec.toolExecutionLocus, "cacheMode": spec.cacheMode,
		"reasoningMode": spec.reasoningMode, "minimumParallelToolCalls": spec.minimumParallelToolCalls,
	}
	projectionDigest, err := canonicaljson.Digest(profileBase)
	if err != nil {
		return evaluationCapabilityProbeProgram{}, err
	}
	profileProjection := cloneEvaluationObject(profileBase)
	profileProjection["projectionDigest"] = projectionDigest
	publicPayload := map[string]any{
		"marker": "prodivix-capability-probe-v1", "instruction": spec.instruction, "documentText": spec.documentText,
	}
	publicPayloadDigest, err := canonicaljson.Digest(publicPayload)
	if err != nil {
		return evaluationCapabilityProbeProgram{}, err
	}
	maximumProviderRoundTrips := spec.maximumProviderRoundTrips
	if maximumProviderRoundTrips == 0 {
		maximumProviderRoundTrips = 2
	}
	publicProbeResource, err := evaluationCapabilityProbePublicResource(spec.publicResourceKind)
	if err != nil {
		return evaluationCapabilityProbeProgram{}, err
	}
	cachePrefixResource, err := evaluationCapabilityProbeCachePrefixResource(spec.cachePrefixResource)
	if err != nil {
		return evaluationCapabilityProbeProgram{}, err
	}
	programBase := map[string]any{
		"format": evaluationCapabilityProbeProgramFormat, "version": int64(1),
		"programId": "capability-probe." + profileID, "profileProjection": profileProjection,
		"profileProjectionDigest": projectionDigest,
		"providerRequestIntent": map[string]any{
			"intentKind": spec.intentKind, "publicPayload": publicPayload,
			"publicPayloadDigest": publicPayloadDigest, "requestPhases": spec.requestPhases,
			"networkRoundTripPolicy": evaluationCapabilityProbeNetworkRoundTripPolicy(spec, maximumProviderRoundTrips),
			"requiredToolNames":      spec.requiredToolNames, "publicProbeResource": publicProbeResource,
			"cachePrefixResource": cachePrefixResource,
		},
		"observationContract": map[string]any{
			"supportedRequirements": spec.supportedRequirements,
			"unsupportedDenialKinds": []any{
				"provider-declared-unsupported", "provider-feature-unavailable", "provider-request-denied",
			},
			"inconclusiveDenialKinds": []any{
				"normalized-response-incomplete", "probe-execution-timeout", "provider-response-unavailable",
			},
		},
		"hardLimits": map[string]any{
			"maximumRequestBytes": int64(16_384), "maximumResponseBytes": int64(262_144),
			"maximumNormalizedFacts": int64(16), "maximumToolCalls": spec.maximumToolCalls,
			"maximumProviderRoundTrips": maximumProviderRoundTrips,
			"maximumPollAttempts":       spec.maximumPollAttempts, "maximumSingleDispatchMs": int64(30_000),
			"maximumExecutionDurationMs": int64(120_000),
		},
	}
	programDigest, err := canonicaljson.Digest(programBase)
	if err != nil {
		return evaluationCapabilityProbeProgram{}, err
	}
	program := cloneEvaluationObject(programBase)
	program["programDigest"] = programDigest
	requiredToolNames := make([]string, len(spec.requiredToolNames))
	for index, name := range spec.requiredToolNames {
		requiredToolNames[index] = name.(string)
	}
	publicResource, _ := publicProbeResource.(map[string]any)
	return evaluationCapabilityProbeProgram{
		Value: program, ProfileID: profileID, ProgramDigest: programDigest,
		ProfileProjectionDigest: projectionDigest, MaximumNormalizedFacts: 16,
		MaximumRequestBytes: 16_384, MaximumResponseBytes: 262_144,
		MaximumToolCalls: spec.maximumToolCalls, MaximumProviderRoundTrips: maximumProviderRoundTrips,
		MaximumPollAttempts: spec.maximumPollAttempts, MaximumSingleDispatchMS: 30_000,
		MaximumExecutionDurationMS: 120_000, RequiredToolNames: requiredToolNames,
		PublicProbeResource: publicResource, SupportedRequirements: spec.supportedRequirements,
	}, nil
}

func decodeEvaluationCapabilityProbeProgram(
	value any,
	profileID string,
	profileDigest string,
	capabilityID string,
) (evaluationCapabilityProbeProgram, error) {
	program, err := expectedEvaluationCapabilityProbeProgram(profileID, profileDigest)
	object, objectErr := evaluationCapabilityProbeCanonicalObject(value, maximumEvaluationCapabilityProbeProgramBytes)
	if err != nil || objectErr != nil || capabilityID != stringMember(program.Value["profileProjection"].(map[string]any), "capabilityId") ||
		!sameEvaluationCanonicalValue(object, program.Value) || agentcontract.ValidateSanitizedAgentPayload(object) != nil {
		return evaluationCapabilityProbeProgram{}, ErrConflict
	}
	return program, nil
}

func evaluationCapabilityProbeRequirementsSatisfied(program evaluationCapabilityProbeProgram, facts []any) bool {
	var expectedCount int64
	for _, rawRequirement := range program.SupportedRequirements {
		requirement := rawRequirement.(map[string]any)
		minimum, ok := integerMember(requirement, "minimumCount")
		if !ok {
			minimum, ok = requirement["minimumCount"].(int64)
		}
		if !ok || minimum < 1 {
			return false
		}
		expectedCount += minimum
		count := int64(0)
		for _, rawFact := range facts {
			fact := rawFact.(map[string]any)
			if stringMember(fact, "factKind") == stringMember(requirement, "factKind") &&
				sameEvaluationCanonicalValue(fact["providerEventType"], requirement["providerEventType"]) {
				count++
			}
		}
		if count < minimum {
			return false
		}
	}
	return int64(len(facts)) == expectedCount
}

func evaluationCapabilityProbeFactOrder(value map[string]any) string {
	eventType, _ := value["providerEventType"].(string)
	return stringMember(value, "factKind") + "\x00" + eventType + "\x00" + stringMember(value, "factDigest")
}

func evaluationCapabilityProbeNonnegativeInteger(value any) (int64, bool) {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Int64()
		return parsed, err == nil && parsed >= 0
	case int64:
		return typed, typed >= 0
	case float64:
		parsed := int64(typed)
		return parsed, typed == float64(parsed) && parsed >= 0
	default:
		return 0, false
	}
}

func evaluationCapabilityProbeSemanticProof(
	value any,
	program evaluationCapabilityProbeProgram,
	facts []any,
	providerResponseDigest string,
) (map[string]any, error) {
	if value == nil {
		return nil, nil
	}
	proof, ok := value.(map[string]any)
	if !ok {
		return nil, ErrInvalid
	}
	proofKind := stringMember(proof, "proofKind")
	factDigests := make(map[string][]string)
	for _, rawFact := range facts {
		fact := rawFact.(map[string]any)
		factDigests[stringMember(fact, "factKind")] = append(
			factDigests[stringMember(fact, "factKind")], stringMember(fact, "factDigest"),
		)
	}
	validDigestFields := func(fields ...string) bool {
		for _, field := range fields {
			if !evaluationDigestPattern.MatchString(stringMember(proof, field)) {
				return false
			}
		}
		return true
	}
	switch program.ProfileID {
	case "g4-provider-background-job":
		if proofKind != "background-job-lifecycle" || !exactEvaluationKeys(proof, []string{
			"proofKind", "jobReceiptDigest", "jobIdDigest", "submitRequestDigest", "pollResponseDigest",
			"terminalResponseDigest", "proofDigest",
		}) || !validDigestFields(
			"jobReceiptDigest", "jobIdDigest", "submitRequestDigest", "pollResponseDigest",
			"terminalResponseDigest", "proofDigest",
		) || len(factDigests["provider-job-receipt"]) != 1 ||
			stringMember(proof, "jobReceiptDigest") != factDigests["provider-job-receipt"][0] {
			return nil, ErrConflict
		}
	case "g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document":
		expectedKind := "hosted-retrieval-public-text"
		if program.ProfileID == "g4-provider-hosted-retrieval-document" {
			expectedKind = "hosted-retrieval-public-document"
		}
		if proofKind != expectedKind || program.PublicProbeResource == nil || !exactEvaluationKeys(proof, []string{
			"proofKind", "retrievalQueryReceiptDigest", "resourceDescriptorDigest", "queryDigest", "indexDigest",
			"expectedMarkerDigest", "resultMarkerDigest", "documentBytesDigest", "providerResponseDigest", "proofDigest",
		}) || !validDigestFields(
			"retrievalQueryReceiptDigest", "resourceDescriptorDigest", "queryDigest", "indexDigest",
			"expectedMarkerDigest", "resultMarkerDigest", "providerResponseDigest", "proofDigest",
		) || (proof["documentBytesDigest"] != nil &&
			!evaluationDigestPattern.MatchString(stringMember(proof, "documentBytesDigest"))) ||
			len(factDigests["retrieval-query-receipt"]) != 1 ||
			stringMember(proof, "retrievalQueryReceiptDigest") != factDigests["retrieval-query-receipt"][0] ||
			stringMember(proof, "resourceDescriptorDigest") != stringMember(program.PublicProbeResource, "descriptorDigest") ||
			stringMember(proof, "queryDigest") != stringMember(program.PublicProbeResource, "queryDigest") ||
			stringMember(proof, "indexDigest") != stringMember(program.PublicProbeResource, "indexDigest") ||
			stringMember(proof, "expectedMarkerDigest") != stringMember(program.PublicProbeResource, "expectedMarkerDigest") ||
			stringMember(proof, "resultMarkerDigest") != stringMember(program.PublicProbeResource, "expectedMarkerDigest") ||
			!sameEvaluationCanonicalValue(proof["documentBytesDigest"], program.PublicProbeResource["documentBytesDigest"]) {
			return nil, ErrConflict
		}
	case "g4-provider-isolated-cache":
		if proofKind != "isolated-cache-roundtrip" || !exactEvaluationKeys(proof, []string{
			"proofKind", "cacheReceiptDigest", "usageVectorDigest", "cacheKeyDigest", "coldResponseDigest",
			"warmResponseDigest", "usageDeltaDigest", "isolationScopeDigest", "cacheHitObserved", "proofDigest",
		}) || !validDigestFields(
			"cacheReceiptDigest", "usageVectorDigest", "cacheKeyDigest", "coldResponseDigest",
			"warmResponseDigest", "usageDeltaDigest", "isolationScopeDigest", "proofDigest",
		) || proof["cacheHitObserved"] != true || len(factDigests["provider-cache-receipt"]) != 1 ||
			len(factDigests["usage-vector"]) != 1 ||
			stringMember(proof, "cacheReceiptDigest") != factDigests["provider-cache-receipt"][0] ||
			stringMember(proof, "usageVectorDigest") != factDigests["usage-vector"][0] {
			return nil, ErrConflict
		}
	case "g4-provider-parallel-tool":
		toolCalls, callsOK := proof["toolCalls"].([]any)
		if proofKind != "parallel-tool-call-set" || !exactEvaluationKeys(proof, []string{
			"proofKind", "providerResponseDigest", "toolCalls", "proofDigest",
		}) || !validDigestFields("providerResponseDigest", "proofDigest") ||
			!callsOK || len(toolCalls) != 2 ||
			len(program.RequiredToolNames) != 2 || len(factDigests["provider-event"]) != 2 {
			return nil, ErrConflict
		}
		seenNames, seenIDs, seenFacts := map[string]bool{}, map[string]bool{}, map[string]bool{}
		previous := ""
		for index, rawCall := range toolCalls {
			call, ok := rawCall.(map[string]any)
			name, callID, factDigest := stringMember(call, "toolName"), stringMember(call, "toolCallId"), stringMember(call, "factDigest")
			order := name + "\x00" + callID
			if !ok || !exactEvaluationKeys(call, []string{"toolName", "toolCallId", "factDigest"}) ||
				!validEvaluationAgentControlIdentity(name) || !validEvaluationAgentControlIdentity(callID) ||
				!evaluationDigestPattern.MatchString(factDigest) || (index > 0 && previous >= order) ||
				seenNames[name] || seenIDs[callID] || seenFacts[factDigest] || name != program.RequiredToolNames[index] {
				return nil, ErrConflict
			}
			matched := false
			for _, expectedFact := range factDigests["provider-event"] {
				matched = matched || expectedFact == factDigest
			}
			if !matched {
				return nil, ErrConflict
			}
			seenNames[name], seenIDs[callID], seenFacts[factDigest], previous = true, true, true, order
		}
	case "g4-provider-reasoning-continuation":
		if proofKind != "opaque-continuation-roundtrip" || !exactEvaluationKeys(proof, []string{
			"proofKind", "continuationFactDigest", "parentResponseDigest", "opaqueHandleDigest",
			"resumeRequestDigest", "resumeResponseDigest", "proofDigest",
		}) || !validDigestFields(
			"continuationFactDigest", "parentResponseDigest", "opaqueHandleDigest", "resumeRequestDigest",
			"resumeResponseDigest", "proofDigest",
		) || len(factDigests["opaque-continuation"]) != 1 ||
			stringMember(proof, "continuationFactDigest") != factDigests["opaque-continuation"][0] {
			return nil, ErrConflict
		}
	default:
		return nil, ErrInvalid
	}
	base := cloneEvaluationObject(proof)
	delete(base, "proofDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(proof, "proofDigest") {
		return nil, ErrConflict
	}
	return proof, nil
}

func evaluationCapabilityProbeObservedLimits(
	value any,
	program evaluationCapabilityProbeProgram,
	factCount int,
) (map[string]any, error) {
	limits, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(limits, []string{
		"requestBytes", "responseBytes", "normalizedFactCount", "toolCallCount", "providerRoundTripCount",
		"pollAttemptCount", "observedMaximumSingleDispatchMs", "observedExecutionDurationMs", "limitDigest",
	}) || !evaluationDigestPattern.MatchString(stringMember(limits, "limitDigest")) {
		return nil, ErrInvalid
	}
	fields := []string{
		"requestBytes", "responseBytes", "normalizedFactCount", "toolCallCount", "providerRoundTripCount",
		"pollAttemptCount", "observedMaximumSingleDispatchMs", "observedExecutionDurationMs",
	}
	values := make(map[string]int64, len(fields))
	for _, field := range fields {
		parsed, valid := evaluationCapabilityProbeNonnegativeInteger(limits[field])
		if !valid {
			return nil, ErrInvalid
		}
		values[field] = parsed
	}
	if values["requestBytes"] > program.MaximumRequestBytes ||
		values["responseBytes"] > program.MaximumResponseBytes ||
		values["normalizedFactCount"] > program.MaximumNormalizedFacts ||
		values["normalizedFactCount"] != int64(factCount) || values["toolCallCount"] > program.MaximumToolCalls ||
		values["providerRoundTripCount"] > program.MaximumProviderRoundTrips ||
		values["pollAttemptCount"] > program.MaximumPollAttempts ||
		values["observedMaximumSingleDispatchMs"] > program.MaximumSingleDispatchMS ||
		values["observedExecutionDurationMs"] > program.MaximumExecutionDurationMS {
		return nil, ErrConflict
	}
	base := cloneEvaluationObject(limits)
	delete(base, "limitDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(limits, "limitDigest") {
		return nil, ErrConflict
	}
	return limits, nil
}

func decodeEvaluationCapabilityProbeObservation(
	value any,
	program evaluationCapabilityProbeProgram,
	request evaluationCapabilityProbeAdmissionRequest,
) (map[string]any, time.Time, error) {
	observation, err := evaluationCapabilityProbeCanonicalObject(value, maximumEvaluationCapabilityProbeObservationBytes)
	if err != nil || !exactEvaluationKeys(observation, []string{
		"format", "version", "observationSource", "probeProgramDigest", "profileProjectionDigest",
		"providerConfigurationDigest", "modelLineageDigest", "adapterDigest", "probeRequestDigest",
		"providerResponseDigest", "normalizedEventSetDigest", "status", "observedFacts", "semanticProof",
		"denial", "observedLimits", "observedLimitDigest", "observedAt", "observationDigest",
	}) || stringMember(observation, "format") != evaluationCapabilityProbeObservationFormat ||
		stringMember(observation, "observationSource") != "normalized-provider-response" ||
		stringMember(observation, "probeProgramDigest") != program.ProgramDigest ||
		stringMember(observation, "profileProjectionDigest") != program.ProfileProjectionDigest ||
		stringMember(observation, "providerConfigurationDigest") != request.ProviderConfigurationDigest ||
		stringMember(observation, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(observation, "adapterDigest") != request.AdapterDigest {
		return nil, time.Time{}, conflict("evaluation capability probe observation shape or outer binding drifted")
	}
	version, versionOK := integerMember(observation, "version")
	status := stringMember(observation, "status")
	for _, field := range []string{
		"probeProgramDigest", "profileProjectionDigest", "providerConfigurationDigest", "modelLineageDigest",
		"adapterDigest", "probeRequestDigest", "providerResponseDigest", "normalizedEventSetDigest",
		"observedLimitDigest", "observationDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(observation, field)) {
			return nil, time.Time{}, ErrInvalid
		}
	}
	facts, factsOK := observation["observedFacts"].([]any)
	if !versionOK || version != 1 || !oneOfString(status, "supported", "unsupported", "inconclusive") ||
		!factsOK || int64(len(facts)) > program.MaximumNormalizedFacts {
		return nil, time.Time{}, ErrInvalid
	}
	allowedFactKinds := map[string]bool{
		"opaque-continuation": true, "provider-cache-receipt": true, "provider-event": true,
		"provider-job-receipt": true, "retrieval-query-receipt": true, "usage-vector": true,
	}
	previous := ""
	for _, rawFact := range facts {
		fact, ok := rawFact.(map[string]any)
		if !ok || !exactEvaluationKeys(fact, []string{"factKind", "factDigest", "providerEventType"}) ||
			!allowedFactKinds[stringMember(fact, "factKind")] ||
			!evaluationDigestPattern.MatchString(stringMember(fact, "factDigest")) {
			return nil, time.Time{}, ErrInvalid
		}
		if fact["providerEventType"] != nil &&
			(stringMember(fact, "factKind") != "provider-event" ||
				!validEvaluationAgentControlIdentity(stringMember(fact, "providerEventType"))) {
			return nil, time.Time{}, ErrInvalid
		}
		order := evaluationCapabilityProbeFactOrder(fact)
		if previous != "" && previous >= order {
			return nil, time.Time{}, conflict("evaluation capability probe observation fact order drifted")
		}
		previous = order
	}
	supported := evaluationCapabilityProbeRequirementsSatisfied(program, facts)
	semanticProof, proofErr := evaluationCapabilityProbeSemanticProof(
		observation["semanticProof"], program, facts, stringMember(observation, "providerResponseDigest"),
	)
	observedLimits, limitsErr := evaluationCapabilityProbeObservedLimits(
		observation["observedLimits"], program, len(facts),
	)
	if proofErr != nil || limitsErr != nil ||
		stringMember(observation, "observedLimitDigest") != stringMember(observedLimits, "limitDigest") {
		return nil, time.Time{}, conflict("evaluation capability probe observation proof or observed limits drifted")
	}
	denial, denialIsObject := observation["denial"].(map[string]any)
	validDenial := false
	if denialIsObject && exactEvaluationKeys(denial, []string{"denialKind", "denialFactDigest"}) &&
		evaluationDigestPattern.MatchString(stringMember(denial, "denialFactDigest")) {
		validDenial = true
	}
	unsupportedDenial := map[string]bool{
		"provider-declared-unsupported": true, "provider-feature-unavailable": true, "provider-request-denied": true,
	}
	inconclusiveDenial := map[string]bool{
		"normalized-response-incomplete": true, "probe-execution-timeout": true, "provider-response-unavailable": true,
	}
	validStatus := status == "supported" && supported && semanticProof != nil && observation["denial"] == nil ||
		status == "unsupported" && !supported && len(facts) == 0 && semanticProof == nil &&
			validDenial && unsupportedDenial[stringMember(denial, "denialKind")] ||
		status == "inconclusive" && !supported && len(facts) == 0 && semanticProof == nil &&
			validDenial && inconclusiveDenial[stringMember(denial, "denialKind")]
	observedAt, timeErr := parseEvaluationServiceInstant(stringMember(observation, "observedAt"))
	base := cloneEvaluationObject(observation)
	delete(base, "observationDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !validStatus {
		return nil, time.Time{}, conflict("evaluation capability probe observation status lacks its fact or denial authority")
	}
	if timeErr != nil {
		return nil, time.Time{}, conflict("evaluation capability probe observation instant drifted")
	}
	if digestErr != nil || digest != stringMember(observation, "observationDigest") {
		return nil, time.Time{}, conflict("evaluation capability probe observation digest drifted")
	}
	if agentcontract.ValidateSanitizedAgentPayload(observation) != nil {
		return nil, time.Time{}, conflict("evaluation capability probe observation sanitizer rejected its payload")
	}
	return observation, observedAt, nil
}
