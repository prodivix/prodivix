package agentcontract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	maximumAgentEvaluationScheduleEntries = 1_000_000
	currentAgentEvaluationPlannedAttempts = int64(14_040)
)

var currentAgentEvaluationCapabilityProfiles = [...]string{
	"g4-core-text-tools",
	"g4-document-input",
	"g4-visual-input",
	"g4-provider-background-job",
	"g4-provider-hosted-retrieval-core",
	"g4-provider-hosted-retrieval-document",
	"g4-provider-parallel-tool",
	"g4-provider-isolated-cache",
	"g4-provider-reasoning-continuation",
}

type evaluationPlanCase struct {
	ID                           string
	ProfileID                    string
	CapabilityID                 string
	CapabilitySupportExpectation string
	CapabilityDescriptorDigest   string
	RiskClass                    string
	ContextSentinel              bool
	MediaSentinel                bool
	SubjectiveVisual             bool
}

type evaluationPlanTarget struct {
	ID                                 string
	Digest                             string
	ProfileID                          string
	Protocol                           string
	ProviderID                         string
	ProviderHash                       string
	OperatorID                         string
	ModelID                            string
	ModelDigest                        string
	OwnerID                            string
	OptionalCapabilityID               string
	OptionalSupportExpectation         string
	ResolvedCapabilityDescriptorDigest string
}

type evaluationScheduleEntry struct {
	identity string
	value    map[string]any
}

func evaluationCanonicalDecimal(value any, path string) (*big.Rat, error) {
	text, ok := value.(string)
	if !ok || !agentControlDecimalPattern.MatchString(text) {
		return nil, fmt.Errorf("%s must be a canonical decimal", path)
	}
	parsed, ok := new(big.Rat).SetString(text)
	if !ok {
		return nil, fmt.Errorf("%s cannot be parsed", path)
	}
	return parsed, nil
}

func evaluationStringValues(value any, path string) ([]string, error) {
	values, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a string array", path)
	}
	result := make([]string, len(values))
	for index, raw := range values {
		entry, ok := raw.(string)
		if !ok {
			return nil, fmt.Errorf("%s/%d must be a string", path, index)
		}
		result[index] = entry
	}
	return result, nil
}

func sameEvaluationStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

var evaluationOptionalProviderCapabilityIDs = map[string]struct{}{
	"provider.background-job":         {},
	"provider.hosted-retrieval":       {},
	"provider.isolated-cache":         {},
	"provider.parallel-tool":          {},
	"provider.reasoning-continuation": {},
}

var evaluationOptionalCapabilityProfileIDs = map[string]string{
	"g4-provider-background-job":            "provider.background-job",
	"g4-provider-hosted-retrieval-core":     "provider.hosted-retrieval",
	"g4-provider-hosted-retrieval-document": "provider.hosted-retrieval",
	"g4-provider-parallel-tool":             "provider.parallel-tool",
	"g4-provider-isolated-cache":            "provider.isolated-cache",
	"g4-provider-reasoning-continuation":    "provider.reasoning-continuation",
}

var evaluationProductionNativeProtocolFamilies = [...]string{
	"anthropic-messages",
	"gemini-interactions",
	"openai-responses",
}

var evaluationProductionOptionalCapabilityProfiles = [...]string{
	"g4-provider-background-job",
	"g4-provider-hosted-retrieval-core",
	"g4-provider-hosted-retrieval-document",
	"g4-provider-isolated-cache",
	"g4-provider-parallel-tool",
	"g4-provider-reasoning-continuation",
}

var evaluationProductionFactBackedOptionalCapabilityProfiles = [...]string{
	"g4-provider-background-job",
	"g4-provider-hosted-retrieval-core",
	"g4-provider-hosted-retrieval-document",
	"g4-provider-isolated-cache",
	"g4-provider-reasoning-continuation",
}

var evaluationFactBackedOptionalCapabilityIDs = map[string]struct{}{
	"provider.background-job":         {},
	"provider.hosted-retrieval":       {},
	"provider.isolated-cache":         {},
	"provider.reasoning-continuation": {},
}

type evaluationCapabilityProbeProgramCommitment struct {
	CapabilityID     string
	ProfileDigest    string
	ProjectionDigest string
	ProgramDigest    string
}

var evaluationCurrentCapabilityProbePrograms = map[string]evaluationCapabilityProbeProgramCommitment{
	"g4-provider-background-job": {
		CapabilityID: "provider.background-job", ProfileDigest: "sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195",
		ProjectionDigest: "sha256-d1efc1ad243b1d67771bfd138747ebdc9effc5fd9495cf156a4a78c8b737003c",
		ProgramDigest:    "sha256-b4932fa9a4bd26538257d96da04ded6014fba0da738066766bada19d1e56a3d8",
	},
	"g4-provider-hosted-retrieval-core": {
		CapabilityID: "provider.hosted-retrieval", ProfileDigest: "sha256-666c6df670c77605562ff82765013291f99045f36edcb8db0af209267c91565d",
		ProjectionDigest: "sha256-5d973e3bdc35bf583bfbcb8158f7fb10080ee2ac0763a516e83eb2ee2167e31c",
		ProgramDigest:    "sha256-d8c0cf7d4b07574bd03142934e819fb8a693abc3f98919ef48cba2e861df6a89",
	},
	"g4-provider-hosted-retrieval-document": {
		CapabilityID: "provider.hosted-retrieval", ProfileDigest: "sha256-8ced3fda38a88c0819a6a2d4603e453f515a9c98efadc7c270af194349c5b90e",
		ProjectionDigest: "sha256-e45999eb4d816828294606264ebf1ab9f701c50219508f74fcd72ab334557ce8",
		ProgramDigest:    "sha256-348a962d94fe09c59d5ee484cf756174969252664527905d9d1a977879d79fa8",
	},
	"g4-provider-isolated-cache": {
		CapabilityID: "provider.isolated-cache", ProfileDigest: "sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103",
		ProjectionDigest: "sha256-204a9af06d4e266c262bcff06bbf6777d63b66ca62ae3e971dc4e9b75f79ff0e",
		ProgramDigest:    "sha256-6b9d354d429ec1a2e9ef0a0e22d00dc855d78e6a0a915ebd5368524410e72b57",
	},
	"g4-provider-parallel-tool": {
		CapabilityID: "provider.parallel-tool", ProfileDigest: "sha256-e7bbd5f0f8509fbecb9e52948f78fbefbcace258008b7aee5476b48186d8dda6",
		ProjectionDigest: "sha256-1cb7e7172e38e8f0d4ded613dc917b624d4d68ef8fc3940301514fefe13a09c0",
		ProgramDigest:    "sha256-fb9fc718b3295e7bf3e0cfc2f91f687daa78d8df9543d847251dc8e5a941bc0e",
	},
	"g4-provider-reasoning-continuation": {
		CapabilityID: "provider.reasoning-continuation", ProfileDigest: "sha256-5c84287b4c1e16fb0c1eda862a8e44754503a3fa0a4b61a16e2d2f2465072d34",
		ProjectionDigest: "sha256-89733b4a82ebc5fc5dc665d092c8a3d82aea0ecc95ba0f2019983c5c117d87f6",
		ProgramDigest:    "sha256-54a426c8e99b93b8efb6e3e863210522e42665c8e1cc0520b51a8a3516eb11ae",
	},
}

func evaluationCapabilityProbeProgramAndObservation(
	evidence map[string]any,
	authority map[string]any,
	path string,
) (map[string]any, map[string]any, error) {
	program, ok := evidence["probeProgram"].(map[string]any)
	if !ok || requireExactObjectKeys(program, []string{
		"format", "version", "programId", "profileProjection", "profileProjectionDigest",
		"providerRequestIntent", "observationContract", "hardLimits", "programDigest",
	}, nil) != nil || stringValue(program["format"]) != "prodivix.agent-capability-probe-program" ||
		program["version"] != float64(1) || requireIdentity(program["programId"], path+"/probeProgram/programId") != nil ||
		requireDigest(program["profileProjectionDigest"], path+"/probeProgram/profileProjectionDigest") != nil ||
		requireDigestMatch(program, "programDigest", path+"/probeProgram/programDigest") != nil {
		return nil, nil, fmt.Errorf("%s/probeProgram is invalid or drifted", path)
	}
	profile, ok := program["profileProjection"].(map[string]any)
	if !ok || requireExactObjectKeys(profile, []string{
		"format", "version", "capabilityProfileId", "capabilityProfileDigest", "capabilityId", "inputClass",
		"deliveryMode", "providerStateMode", "toolExecutionLocus", "cacheMode", "reasoningMode",
		"minimumParallelToolCalls", "projectionDigest",
	}, nil) != nil || stringValue(profile["format"]) != "prodivix.agent-capability-probe-profile-projection" ||
		profile["version"] != float64(1) || requireIdentity(profile["capabilityProfileId"], path+"/probeProgram/profileProjection/capabilityProfileId") != nil ||
		requireIdentity(profile["capabilityId"], path+"/probeProgram/profileProjection/capabilityId") != nil ||
		requireDigest(profile["capabilityProfileDigest"], path+"/probeProgram/profileProjection/capabilityProfileDigest") != nil ||
		requireDigestMatch(profile, "projectionDigest", path+"/probeProgram/profileProjection/projectionDigest") != nil ||
		stringValue(program["profileProjectionDigest"]) != stringValue(profile["projectionDigest"]) ||
		stringValue(profile["capabilityProfileId"]) != stringValue(authority["qualificationCapabilityProfileId"]) ||
		stringValue(profile["capabilityProfileDigest"]) != stringValue(authority["qualificationCapabilityProfileDigest"]) ||
		stringValue(profile["capabilityId"]) != stringValue(authority["capabilityId"]) {
		return nil, nil, fmt.Errorf("%s/probeProgram profile projection drifted", path)
	}
	current, currentOK := evaluationCurrentCapabilityProbePrograms[stringValue(profile["capabilityProfileId"])]
	if !currentOK || current.CapabilityID != stringValue(profile["capabilityId"]) ||
		current.ProfileDigest != stringValue(profile["capabilityProfileDigest"]) ||
		current.ProjectionDigest != stringValue(program["profileProjectionDigest"]) ||
		current.ProgramDigest != stringValue(program["programDigest"]) {
		return nil, nil, fmt.Errorf("%s/probeProgram is outside the current canonical registry", path)
	}
	if canonical, err := canonicaljson.Bytes(program); err != nil || len(canonical) > 16_384 ||
		validateSanitizedAgentPayload(program, path+"/probeProgram") != nil {
		return nil, nil, fmt.Errorf("%s/probeProgram is unsafe or unbounded", path)
	}

	observation, ok := evidence["normalizedObservation"].(map[string]any)
	if !ok || requireExactObjectKeys(observation, []string{
		"format", "version", "observationSource", "probeProgramDigest", "profileProjectionDigest",
		"providerConfigurationDigest", "modelLineageDigest", "adapterDigest", "probeRequestDigest",
		"providerResponseDigest", "normalizedEventSetDigest", "status", "observedFacts", "semanticProof",
		"denial", "observedLimits", "observedLimitDigest", "observedAt", "observationDigest",
	}, nil) != nil || stringValue(observation["format"]) != "prodivix.agent-capability-probe-program-observation" ||
		observation["version"] != float64(1) || stringValue(observation["observationSource"]) != "normalized-provider-response" ||
		!oneOf(stringValue(observation["status"]), "supported", "unsupported") ||
		requireDigestMatch(observation, "observationDigest", path+"/normalizedObservation/observationDigest") != nil {
		return nil, nil, fmt.Errorf("%s/normalizedObservation is invalid, inconclusive, or drifted", path)
	}
	for _, field := range []string{
		"probeProgramDigest", "profileProjectionDigest", "providerConfigurationDigest", "modelLineageDigest",
		"adapterDigest", "probeRequestDigest", "providerResponseDigest", "normalizedEventSetDigest",
		"observedLimitDigest", "observationDigest",
	} {
		if err := requireDigest(observation[field], path+"/normalizedObservation/"+field); err != nil {
			return nil, nil, err
		}
	}
	if stringValue(observation["probeProgramDigest"]) != stringValue(program["programDigest"]) ||
		stringValue(observation["profileProjectionDigest"]) != stringValue(program["profileProjectionDigest"]) ||
		stringValue(observation["adapterDigest"]) != stringValue(evidence["adapterDigest"]) ||
		stringValue(observation["probeRequestDigest"]) != stringValue(evidence["probeRequestDigest"]) ||
		stringValue(observation["providerResponseDigest"]) != stringValue(evidence["probeResponseDigest"]) ||
		stringValue(observation["normalizedEventSetDigest"]) != stringValue(evidence["normalizedEventSetDigest"]) {
		return nil, nil, fmt.Errorf("%s/normalizedObservation outer binding drifted", path)
	}
	facts, factsOK := observation["observedFacts"].([]any)
	limits, limitsOK := observation["observedLimits"].(map[string]any)
	if !factsOK || !limitsOK || requireExactObjectKeys(limits, []string{
		"requestBytes", "responseBytes", "normalizedFactCount", "toolCallCount", "providerRoundTripCount",
		"pollAttemptCount", "observedMaximumSingleDispatchMs", "observedExecutionDurationMs", "limitDigest",
	}, nil) != nil || requireDigestMatch(limits, "limitDigest", path+"/normalizedObservation/observedLimits/limitDigest") != nil ||
		stringValue(observation["observedLimitDigest"]) != stringValue(limits["limitDigest"]) {
		return nil, nil, fmt.Errorf("%s/normalizedObservation observed limits drifted", path)
	}
	status := stringValue(observation["status"])
	_, proofOK := observation["semanticProof"].(map[string]any)
	_, denialOK := observation["denial"].(map[string]any)
	if status == "supported" && (!proofOK || observation["denial"] != nil || len(facts) == 0) ||
		status == "unsupported" && (observation["semanticProof"] != nil || !denialOK || len(facts) != 0) {
		return nil, nil, fmt.Errorf("%s/normalizedObservation status lacks its proof or denial", path)
	}
	if _, err := parseInstant(observation["observedAt"]); err != nil {
		return nil, nil, fmt.Errorf("%s/normalizedObservation/observedAt is invalid", path)
	}
	if canonical, err := canonicaljson.Bytes(observation); err != nil || len(canonical) > 16_384 ||
		validateSanitizedAgentPayload(observation, path+"/normalizedObservation") != nil {
		return nil, nil, fmt.Errorf("%s/normalizedObservation is unsafe or unbounded", path)
	}
	return program, observation, nil
}

func evaluationRuntimeFactSourceAuthority(
	raw any,
	target map[string]any,
	provider map[string]any,
	path string,
) (map[string]any, error) {
	authority, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(authority, []string{
		"kind", "sourceKind", "sourceAuthorityId", "sourceAuthorityImplementationDigest", "routeBinding",
		"capabilityProfileId", "capabilityProfileDigest", "capabilityId", "protocolFamily",
		"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
		"registrationAuthorityIssuerId", "registrationReceiptDigest", "authorityDigest",
	}, []string{"hostedRetrievalRuntimeResourceRegistrationIntentDigest"}) != nil || stringValue(authority["kind"]) != "shared-durable-capability" {
		return nil, fmt.Errorf("%s is invalid", path)
	}
	for _, field := range []string{
		"sourceAuthorityId", "routeBinding", "capabilityProfileId", "capabilityId", "providerConfigurationId",
		"modelId", "registrationAuthorityIssuerId",
	} {
		if err := requireIdentity(authority[field], path+"/"+field); err != nil {
			return nil, err
		}
	}
	for _, field := range []string{
		"sourceAuthorityImplementationDigest", "capabilityProfileDigest", "modelLineageDigest", "adapterDigest",
		"registrationReceiptDigest", "authorityDigest",
	} {
		if err := requireDigest(authority[field], path+"/"+field); err != nil {
			return nil, err
		}
	}
	capabilityID := stringValue(authority["capabilityId"])
	protocolFamily := stringValue(authority["protocolFamily"])
	requiresHostedRuntimeResourceIntent := capabilityID == "provider.hosted-retrieval" &&
		oneOf(protocolFamily, "openai-responses", "gemini-interactions")
	hostedRuntimeResourceIntentDigest, hasHostedRuntimeResourceIntent := authority["hostedRetrievalRuntimeResourceRegistrationIntentDigest"]
	if requiresHostedRuntimeResourceIntent != hasHostedRuntimeResourceIntent ||
		hasHostedRuntimeResourceIntent && requireDigest(hostedRuntimeResourceIntentDigest, path+"/hostedRetrievalRuntimeResourceRegistrationIntentDigest") != nil {
		return nil, fmt.Errorf("%s hosted runtime resource registration intent coverage drifted", path)
	}
	if requiresHostedRuntimeResourceIntent {
		optionalAuthority, optionalAuthorityOK := target["optionalCapabilitySupportAuthority"].(map[string]any)
		probeEvidence, probeEvidenceOK := optionalAuthority["probeEvidence"].(map[string]any)
		probeProgram, probeProgramOK := probeEvidence["probeProgram"].(map[string]any)
		providerRequestIntent, providerRequestIntentOK := probeProgram["providerRequestIntent"].(map[string]any)
		publicResource, publicResourceOK := providerRequestIntent["publicProbeResource"].(map[string]any)
		providerConfigurationDigest, providerDigestErr := canonicaljson.Digest(provider)
		expectedIntentDigest, expectedIntentErr := canonicaljson.Digest(map[string]any{
			"format":                         "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-intent",
			"version":                        int64(1),
			"providerConfigurationId":        authority["providerConfigurationId"],
			"providerConfigurationDigest":    providerConfigurationDigest,
			"protocolFamily":                 protocolFamily,
			"modelId":                        authority["modelId"],
			"modelLineageDigest":             authority["modelLineageDigest"],
			"adapterDigest":                  authority["adapterDigest"],
			"capabilityProfileId":            authority["capabilityProfileId"],
			"capabilityProfileDigest":        authority["capabilityProfileDigest"],
			"probeProgramDigest":             probeProgram["programDigest"],
			"publicResourceDescriptorDigest": publicResource["descriptorDigest"],
			"maximumResourceLifetimeMs":      int64(691_200_000),
			"minimumQueryReadLeaseMs":        int64(155_000),
			"requiredOperations":             []any{"create", "delete", "query", "upload"},
		})
		if !optionalAuthorityOK || !probeEvidenceOK || !probeProgramOK || !providerRequestIntentOK || !publicResourceOK ||
			providerDigestErr != nil || expectedIntentErr != nil || expectedIntentDigest != stringValue(hostedRuntimeResourceIntentDigest) {
			return nil, fmt.Errorf("%s hosted runtime resource registration intent drifted from its provider and probe program: claimed=%s computed=%s", path, stringValue(hostedRuntimeResourceIntentDigest), expectedIntentDigest)
		}
	}
	expectedSourceKind := "sealed-provider-response-metadata"
	if capabilityID == "provider.hosted-retrieval" {
		expectedSourceKind = "sealed-hosted-owner-result"
	}
	adapter, _ := provider["adapter"].(map[string]any)
	if _, factBacked := evaluationFactBackedOptionalCapabilityIDs[capabilityID]; !factBacked ||
		stringValue(authority["sourceKind"]) != expectedSourceKind ||
		!oneOf(protocolFamily, "anthropic-messages", "gemini-interactions", "openai-responses") ||
		stringValue(authority["capabilityProfileId"]) != stringValue(target["capabilityProfileId"]) ||
		stringValue(authority["capabilityProfileDigest"]) != stringValue(target["capabilityProfileDigest"]) ||
		capabilityID != evaluationOptionalCapabilityProfileIDs[stringValue(target["capabilityProfileId"])] ||
		protocolFamily != stringValue(target["protocolFamily"]) ||
		stringValue(authority["providerConfigurationId"]) != stringValue(target["providerConfigurationId"]) ||
		stringValue(authority["modelId"]) != stringValue(target["modelId"]) ||
		stringValue(authority["modelLineageDigest"]) != stringValue(target["modelLineageDigest"]) ||
		stringValue(authority["adapterDigest"]) != stringValue(adapter["adapterDigest"]) ||
		requireDigestMatch(authority, "authorityDigest", path+"/authorityDigest") != nil {
		return nil, fmt.Errorf("%s drifted from its registered target authority", path)
	}
	if canonical, err := canonicaljson.Bytes(authority); err != nil || len(canonical) > 8_192 ||
		validateSanitizedAgentPayload(authority, path) != nil {
		return nil, fmt.Errorf("%s is unsafe or unbounded", path)
	}
	return authority, nil
}

func evaluationCapabilityDescriptor(
	raw any,
	path string,
) (map[string]any, error) {
	descriptor, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(descriptor, []string{
		"capabilityId", "supportExpectation", "expectedToolIds", "expectedReceiptKinds", "descriptorDigest",
	}, nil) != nil || requireIdentity(descriptor["capabilityId"], path+"/capabilityId") != nil ||
		!oneOf(stringValue(descriptor["supportExpectation"]), "required", "expected-blocked") ||
		requireCanonicalStrings(descriptor["expectedToolIds"]) != nil ||
		requireCanonicalStrings(descriptor["expectedReceiptKinds"]) != nil {
		return nil, fmt.Errorf("%s is invalid", path)
	}
	expected, err := canonicaljson.Digest(map[string]any{
		"capabilityId": descriptor["capabilityId"], "support": descriptor["supportExpectation"],
		"toolIds": descriptor["expectedToolIds"], "expectedReceiptKinds": descriptor["expectedReceiptKinds"],
	})
	if err != nil || expected != stringValue(descriptor["descriptorDigest"]) {
		return nil, fmt.Errorf("%s digest drifted", path)
	}
	return descriptor, nil
}

func evaluationCapabilityProbeProviderResourceAuthority(
	raw any,
	program map[string]any,
	target map[string]any,
	provider map[string]any,
	receipt map[string]any,
	path string,
) (map[string]any, error) {
	authority, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(authority, []string{
		"format", "version", "capabilityProfileId", "probeProgramDigest", "publicResourceDescriptorDigest",
		"protocolFamily", "providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
		"providerResourceKind", "providerResourceId", "resourceManifestDigest", "contentUploadReceiptDigest",
		"deletionAuthorityReceiptDigest", "registeredAt", "expiresAt", "authorityDigest",
	}, nil) != nil || stringValue(authority["format"]) != "prodivix.agent-capability-probe-provider-resource-authority" ||
		authority["version"] != float64(1) || requireIdentity(authority["capabilityProfileId"], path+"/capabilityProfileId") != nil ||
		requireIdentity(authority["providerConfigurationId"], path+"/providerConfigurationId") != nil ||
		requireIdentity(authority["modelId"], path+"/modelId") != nil ||
		requireIdentity(authority["providerResourceId"], path+"/providerResourceId") != nil {
		return nil, fmt.Errorf("%s is invalid", path)
	}
	for _, field := range []string{
		"probeProgramDigest", "publicResourceDescriptorDigest", "modelLineageDigest", "adapterDigest",
		"resourceManifestDigest", "contentUploadReceiptDigest", "deletionAuthorityReceiptDigest", "authorityDigest",
	} {
		if err := requireDigest(authority[field], path+"/"+field); err != nil {
			return nil, err
		}
	}
	registeredAt, registeredErr := parseInstant(authority["registeredAt"])
	expiresAt, expiresErr := parseInstant(authority["expiresAt"])
	observedAt, observedErr := parseInstant(receipt["probedAt"])
	if registeredErr != nil || expiresErr != nil || observedErr != nil || !expiresAt.After(registeredAt) ||
		expiresAt.Sub(registeredAt) > 8*24*time.Hour || registeredAt.After(observedAt) || expiresAt.Before(observedAt) {
		return nil, fmt.Errorf("%s does not cover the sealed probe observation", path)
	}
	intent, _ := program["providerRequestIntent"].(map[string]any)
	resource, _ := intent["publicProbeResource"].(map[string]any)
	adapter, _ := provider["adapter"].(map[string]any)
	expectedResourceKinds := map[string]string{
		"anthropic-messages":  "anthropic-file-container-id",
		"gemini-interactions": "gemini-file-search-store-name",
		"openai-responses":    "openai-vector-store-id",
	}
	protocol := stringValue(target["protocolFamily"])
	expectedKind, knownProtocol := expectedResourceKinds[protocol]
	if resource == nil || !knownProtocol ||
		stringValue(authority["capabilityProfileId"]) != stringValue(target["capabilityProfileId"]) ||
		stringValue(authority["probeProgramDigest"]) != stringValue(program["programDigest"]) ||
		stringValue(authority["publicResourceDescriptorDigest"]) != stringValue(resource["descriptorDigest"]) ||
		stringValue(authority["protocolFamily"]) != protocol ||
		stringValue(authority["providerConfigurationId"]) != stringValue(target["providerConfigurationId"]) ||
		stringValue(authority["modelId"]) != stringValue(target["modelId"]) ||
		stringValue(authority["modelLineageDigest"]) != stringValue(target["modelLineageDigest"]) ||
		stringValue(authority["adapterDigest"]) != stringValue(adapter["adapterDigest"]) ||
		stringValue(authority["providerResourceKind"]) != expectedKind ||
		requireDigestMatch(authority, "authorityDigest", path+"/authorityDigest") != nil {
		return nil, fmt.Errorf("%s drifted from its program, target, provider, or lifecycle receipts", path)
	}
	if canonical, err := canonicaljson.Bytes(authority); err != nil || len(canonical) > 16_384 ||
		validateSanitizedAgentPayload(authority, path) != nil {
		return nil, fmt.Errorf("%s is unsafe or unbounded", path)
	}
	return authority, nil
}

func evaluationCapabilityProbeProviderResourceCleanupAuthority(
	deletionRaw any,
	cleanupRaw any,
	resourceAuthority map[string]any,
	probedAt time.Time,
	plannedAt time.Time,
	path string,
) (map[string]any, error) {
	deletion, ok := deletionRaw.(map[string]any)
	if !ok || requireExactObjectKeys(deletion, []string{
		"format", "version", "requestDigest", "resourceManifestDigest", "providerResourceKind",
		"providerResourceId", "deletionRouteBinding", "deletionRequestProjection",
		"deletionRequestProjectionDigest", "registeredAt", "expiresAt", "deletionAuthorityReceiptDigest",
	}, nil) != nil || stringValue(deletion["format"]) !=
		"prodivix.agent-evaluation-capability-probe-provider-resource-deletion-authority-receipt" ||
		deletion["version"] != float64(1) || requireDigestMatch(
		deletion, "deletionAuthorityReceiptDigest", path+"/deletionAuthorityReceiptDigest",
	) != nil {
		return nil, fmt.Errorf("%s is invalid", path)
	}
	projection, projectionOK := deletion["deletionRequestProjection"].(map[string]any)
	if !projectionOK || requireExactObjectKeys(projection, []string{
		"format", "version", "requestDigest", "protocolFamily", "providerResourceKind",
		"providerResourceId", "auxiliaryResourceIds",
	}, nil) != nil || stringValue(projection["format"]) !=
		"prodivix.agent-evaluation-capability-probe-provider-resource-deletion-request-projection" ||
		projection["version"] != float64(1) || requireDigest(projection["requestDigest"], path+"/requestDigest") != nil ||
		requireIdentity(projection["providerResourceId"], path+"/providerResourceId") != nil ||
		requireCanonicalStrings(projection["auxiliaryResourceIds"]) != nil {
		return nil, fmt.Errorf("%s/deletionRequestProjection is invalid", path)
	}
	protocol := stringValue(projection["protocolFamily"])
	expectedKinds := map[string]string{
		"gemini-interactions": "gemini-file-search-store-name",
		"openai-responses":    "openai-vector-store-id",
	}
	expectedKind, protocolOK := expectedKinds[protocol]
	auxiliary, _ := projection["auxiliaryResourceIds"].([]any)
	for index, rawID := range auxiliary {
		if requireIdentity(rawID, fmt.Sprintf("%s/deletionRequestProjection/auxiliaryResourceIds/%d", path, index)) != nil ||
			stringValue(rawID) == stringValue(projection["providerResourceId"]) {
			return nil, fmt.Errorf("%s/deletionRequestProjection auxiliary resource is invalid", path)
		}
	}
	projectionDigest, projectionDigestErr := canonicaljson.Digest(projection)
	registeredAt, registeredErr := parseInstant(deletion["registeredAt"])
	expiresAt, expiresErr := parseInstant(deletion["expiresAt"])
	if !protocolOK || stringValue(projection["providerResourceKind"]) != expectedKind ||
		projectionDigestErr != nil || projectionDigest != stringValue(deletion["deletionRequestProjectionDigest"]) ||
		stringValue(deletion["requestDigest"]) != stringValue(projection["requestDigest"]) ||
		stringValue(deletion["providerResourceKind"]) != expectedKind ||
		stringValue(deletion["providerResourceId"]) != stringValue(projection["providerResourceId"]) ||
		stringValue(deletion["deletionRouteBinding"]) != "provider-resource.delete" ||
		registeredErr != nil || expiresErr != nil || !expiresAt.After(registeredAt) ||
		expiresAt.Sub(registeredAt) > 8*24*time.Hour ||
		stringValue(deletion["resourceManifestDigest"]) != stringValue(resourceAuthority["resourceManifestDigest"]) ||
		stringValue(deletion["providerResourceKind"]) != stringValue(resourceAuthority["providerResourceKind"]) ||
		stringValue(deletion["providerResourceId"]) != stringValue(resourceAuthority["providerResourceId"]) ||
		stringValue(deletion["registeredAt"]) != stringValue(resourceAuthority["registeredAt"]) ||
		stringValue(deletion["expiresAt"]) != stringValue(resourceAuthority["expiresAt"]) ||
		stringValue(deletion["deletionAuthorityReceiptDigest"]) != stringValue(resourceAuthority["deletionAuthorityReceiptDigest"]) {
		return nil, fmt.Errorf("%s drifted from its resource authority", path)
	}

	cleanup, ok := cleanupRaw.(map[string]any)
	if !ok || requireExactObjectKeys(cleanup, []string{
		"format", "version", "requestDigest", "deletionAuthorityReceiptDigest",
		"deletionRequestProjectionDigest", "protocolFamily", "providerResourceKind", "providerResourceId",
		"auxiliaryResourceIds", "cleanupStageDigest", "cleanupDispatchAckDigest", "resourceResults",
		"resourceResultSetDigest", "completedAt", "cleanupReceiptDigest",
	}, nil) != nil || stringValue(cleanup["format"]) !=
		"prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-receipt" || cleanup["version"] != float64(1) ||
		requireDigestMatch(cleanup, "cleanupReceiptDigest", path+"/cleanupReceiptDigest") != nil ||
		requireCanonicalStrings(cleanup["auxiliaryResourceIds"]) != nil {
		return nil, fmt.Errorf("%s cleanup receipt is invalid", path)
	}
	cleanupAuxiliary, _ := cleanup["auxiliaryResourceIds"].([]any)
	cleanupAuxiliaryBytes, cleanupAuxiliaryErr := canonicaljson.Bytes(cleanupAuxiliary)
	expectedAuxiliaryBytes, expectedAuxiliaryErr := canonicaljson.Bytes(auxiliary)
	if cleanupAuxiliaryErr != nil || expectedAuxiliaryErr != nil ||
		!bytes.Equal(cleanupAuxiliaryBytes, expectedAuxiliaryBytes) {
		return nil, fmt.Errorf("%s cleanup auxiliary resources drifted", path)
	}
	results, resultsOK := cleanup["resourceResults"].([]any)
	if !resultsOK || len(results) != len(auxiliary)+1 || len(results) > 33 {
		return nil, fmt.Errorf("%s cleanup resource results are invalid", path)
	}
	expectedIDs := map[string]string{stringValue(deletion["providerResourceId"]): "primary"}
	for _, rawID := range auxiliary {
		expectedIDs[stringValue(rawID)] = "auxiliary"
	}
	seen := make(map[string]struct{}, len(results))
	leaves := make([]any, 0, len(results))
	latest := time.Time{}
	previousRole, previousID := "", ""
	for index, rawResult := range results {
		result, ok := rawResult.(map[string]any)
		if !ok || requireExactObjectKeys(result, []string{
			"format", "version", "resourceId", "resourceRole", "outcome", "dispatchIntentDigest",
			"transportReceiptDigest", "completedAt", "resultDigest",
		}, nil) != nil || stringValue(result["format"]) !=
			"prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-resource-result" ||
			result["version"] != float64(1) || requireDigestMatch(result, "resultDigest", path+"/resourceResults/resultDigest") != nil ||
			requireIdentity(result["resourceId"], path+"/resourceResults/resourceId") != nil ||
			!oneOf(stringValue(result["resourceRole"]), "primary", "auxiliary") ||
			!oneOf(stringValue(result["outcome"]), "deleted", "already-absent") ||
			requireDigest(result["dispatchIntentDigest"], path+"/resourceResults/dispatchIntentDigest") != nil ||
			requireDigest(result["transportReceiptDigest"], path+"/resourceResults/transportReceiptDigest") != nil {
			return nil, fmt.Errorf("%s cleanup resource result is invalid", path)
		}
		resourceID, role := stringValue(result["resourceId"]), stringValue(result["resourceRole"])
		expectedRole, expected := expectedIDs[resourceID]
		_, duplicate := seen[resourceID]
		ordered := index == 0 || previousRole == role && previousID < resourceID || previousRole == "primary" && role == "auxiliary"
		completedAt, completedErr := parseInstant(result["completedAt"])
		if !expected || duplicate || role != expectedRole || !ordered || completedErr != nil || completedAt.Before(registeredAt) {
			return nil, fmt.Errorf("%s cleanup resource result drifted", path)
		}
		seen[resourceID] = struct{}{}
		previousRole, previousID = role, resourceID
		if latest.IsZero() || completedAt.After(latest) {
			latest = completedAt
		}
		leaves = append(leaves, map[string]any{"resourceId": resourceID, "resultDigest": result["resultDigest"]})
	}
	setDigest, setErr := canonicaljson.Digest(map[string]any{"resourceResults": leaves})
	stageDigest, stageErr := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-stage", "version": int64(1),
		"requestDigest":                   deletion["requestDigest"],
		"deletionAuthorityReceiptDigest":  deletion["deletionAuthorityReceiptDigest"],
		"deletionRequestProjectionDigest": deletion["deletionRequestProjectionDigest"],
	})
	ackDigest, ackErr := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-dispatch-ack", "version": int64(1),
		"requestDigest":                  deletion["requestDigest"],
		"deletionAuthorityReceiptDigest": deletion["deletionAuthorityReceiptDigest"],
		"cleanupStageDigest":             stageDigest, "resourceResultSetDigest": setDigest,
	})
	completedAt, completedErr := parseInstant(cleanup["completedAt"])
	if setErr != nil || stageErr != nil || ackErr != nil || completedErr != nil || !completedAt.Equal(latest) ||
		stringValue(cleanup["requestDigest"]) != stringValue(deletion["requestDigest"]) ||
		stringValue(cleanup["deletionAuthorityReceiptDigest"]) != stringValue(deletion["deletionAuthorityReceiptDigest"]) ||
		stringValue(cleanup["deletionRequestProjectionDigest"]) != stringValue(deletion["deletionRequestProjectionDigest"]) ||
		stringValue(cleanup["protocolFamily"]) != protocol ||
		stringValue(cleanup["providerResourceKind"]) != expectedKind ||
		stringValue(cleanup["providerResourceId"]) != stringValue(deletion["providerResourceId"]) ||
		stringValue(cleanup["resourceResultSetDigest"]) != setDigest ||
		stringValue(cleanup["cleanupStageDigest"]) != stageDigest ||
		stringValue(cleanup["cleanupDispatchAckDigest"]) != ackDigest ||
		completedAt.Before(probedAt) || completedAt.After(plannedAt) {
		return nil, fmt.Errorf("%s cleanup receipt drifted from its resource lifecycle", path)
	}
	if canonical, err := canonicaljson.Bytes(cleanup); err != nil || len(canonical) > 65_536 ||
		validateSanitizedAgentPayload(cleanup, path) != nil {
		return nil, fmt.Errorf("%s cleanup receipt is unsafe or unbounded", path)
	}
	return cleanup, nil
}

func evaluationOptionalCapabilitySupportAuthority(
	target map[string]any,
	provider map[string]any,
	path string,
	plannedAt time.Time,
	planExpiresAt time.Time,
) (string, string, error) {
	raw, exists := target["optionalCapabilitySupportAuthority"]
	if !exists {
		return "", "", nil
	}
	authority, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(authority, []string{
		"qualificationAuthorityBundleDigest", "qualificationCapabilityProfileId", "qualificationCapabilityProfileDigest", "capabilityId",
		"supportExpectation", "declaredCapabilityProfileDigests", "probeEvidence",
		"resolvedCapabilityDescriptor", "authorityDigest",
	}, []string{"probeProviderResourceAuthority", "probeProviderResourceDeletionAuthorityReceipt", "probeProviderResourceCleanupReceipt", "runtimeFactSourceAuthority"}) != nil || requireIdentity(authority["qualificationCapabilityProfileId"], path+"/qualificationCapabilityProfileId") != nil ||
		requireIdentity(authority["capabilityId"], path+"/capabilityId") != nil ||
		requireDigest(authority["qualificationAuthorityBundleDigest"], path+"/qualificationAuthorityBundleDigest") != nil ||
		requireDigest(authority["qualificationCapabilityProfileDigest"], path+"/qualificationCapabilityProfileDigest") != nil ||
		!oneOf(stringValue(authority["supportExpectation"]), "required", "expected-blocked") {
		return "", "", fmt.Errorf("%s is invalid", path)
	}
	declared, ok := authority["declaredCapabilityProfileDigests"].([]any)
	if !ok || len(declared) == 0 || requireCanonicalStrings(declared) != nil {
		return "", "", fmt.Errorf("%s/declaredCapabilityProfileDigests is invalid", path)
	}
	for index, digest := range declared {
		if err := requireDigest(digest, fmt.Sprintf("%s/declaredCapabilityProfileDigests/%d", path, index)); err != nil {
			return "", "", err
		}
	}
	declaredDigest, err := canonicaljson.Digest(declared)
	if err != nil {
		return "", "", err
	}

	evidence, ok := authority["probeEvidence"].(map[string]any)
	if !ok || requireExactObjectKeys(evidence, []string{
		"authorityKind", "authorityIssuerId", "ownerImplementationDigest", "adapterDigest",
		"probeRequestDigest", "probeResponseDigest", "dispatchReceiptDigest", "transportReceiptDigest",
		"responseSpoolDigest", "normalizedEventSetDigest", "probeProgram", "normalizedObservation", "receipt", "evidenceDigest",
	}, nil) != nil || stringValue(evidence["authorityKind"]) != "sealed-provider-capability-probe" ||
		requireIdentity(evidence["authorityIssuerId"], path+"/probeEvidence/authorityIssuerId") != nil {
		return "", "", fmt.Errorf("%s/probeEvidence is invalid", path)
	}
	for _, field := range []string{
		"ownerImplementationDigest", "adapterDigest", "probeRequestDigest", "probeResponseDigest",
		"dispatchReceiptDigest", "transportReceiptDigest", "responseSpoolDigest", "normalizedEventSetDigest",
	} {
		if err := requireDigest(evidence[field], path+"/probeEvidence/"+field); err != nil {
			return "", "", err
		}
	}
	if canonical, err := canonicaljson.Bytes(evidence); err != nil || len(canonical) > 65_536 ||
		validateSanitizedAgentPayload(evidence, path+"/probeEvidence") != nil ||
		requireDigestMatch(evidence, "evidenceDigest", path+"/probeEvidence/evidenceDigest") != nil {
		return "", "", fmt.Errorf("%s/probeEvidence is unbounded or drifted", path)
	}
	program, observation, err := evaluationCapabilityProbeProgramAndObservation(evidence, authority, path+"/probeEvidence")
	if err != nil {
		return "", "", err
	}

	receipt, ok := evidence["receipt"].(map[string]any)
	if !ok || requireExactObjectKeys(receipt, []string{
		"probeId", "providerConfigurationDigest", "modelLineageDigest", "requestedProfileDigest",
		"declaredCapabilityDigest", "probedCapabilityDigest", "status", "observedLimitDigest",
		"probeProgramDigest", "profileProjectionDigest", "normalizedObservationDigest",
		"probedAt", "expiresAt", "receiptDigest",
	}, []string{"observedProfileDigest"}) != nil || requireIdentity(receipt["probeId"], path+"/probeEvidence/receipt/probeId") != nil ||
		!oneOf(stringValue(receipt["status"]), "supported", "unsupported") {
		return "", "", fmt.Errorf("%s/probeEvidence/receipt is invalid", path)
	}
	for _, field := range []string{
		"providerConfigurationDigest", "modelLineageDigest", "requestedProfileDigest", "declaredCapabilityDigest",
		"probedCapabilityDigest", "observedLimitDigest", "probeProgramDigest", "profileProjectionDigest",
		"normalizedObservationDigest", "receiptDigest",
	} {
		if err := requireDigest(receipt[field], path+"/probeEvidence/receipt/"+field); err != nil {
			return "", "", err
		}
	}
	probedAt, probedErr := parseInstant(receipt["probedAt"])
	probeExpiresAt, expiresErr := parseInstant(receipt["expiresAt"])
	status := stringValue(receipt["status"])
	observedProfile, hasObservedProfile := receipt["observedProfileDigest"]
	if probedErr != nil || expiresErr != nil || !probeExpiresAt.After(probedAt) ||
		(hasObservedProfile && requireDigest(observedProfile, path+"/probeEvidence/receipt/observedProfileDigest") != nil) ||
		(status == "supported" && (!hasObservedProfile || stringValue(observedProfile) != stringValue(receipt["requestedProfileDigest"]))) ||
		(status == "unsupported" && hasObservedProfile) {
		return "", "", fmt.Errorf("%s/probeEvidence/receipt support observation is invalid", path)
	}
	if probedAt.After(plannedAt) || probeExpiresAt.Before(planExpiresAt) {
		return "", "", fmt.Errorf("%s/probeEvidence/receipt does not cover the frozen plan window", path)
	}
	probedCapabilityDigest, err := canonicaljson.Digest(map[string]any{
		"normalizedObservationDigest": receipt["normalizedObservationDigest"],
		"observedLimitDigest":         receipt["observedLimitDigest"],
		"observedProfileDigest": func() any {
			if hasObservedProfile {
				return observedProfile
			}
			return nil
		}(),
		"probeProgramDigest":      receipt["probeProgramDigest"],
		"profileProjectionDigest": receipt["profileProjectionDigest"],
		"status":                  status,
	})
	if err != nil || probedCapabilityDigest != stringValue(receipt["probedCapabilityDigest"]) ||
		requireDigestMatch(receipt, "receiptDigest", path+"/probeEvidence/receipt/receiptDigest") != nil {
		return "", "", fmt.Errorf("%s/probeEvidence/receipt digest drifted", path)
	}

	resolved, err := evaluationCapabilityDescriptor(authority["resolvedCapabilityDescriptor"], path+"/resolvedCapabilityDescriptor")
	if err != nil {
		return "", "", err
	}
	expectedSupport := "expected-blocked"
	if status == "supported" {
		expectedSupport = "required"
	}
	declaresProfile := false
	for _, digest := range declared {
		if stringValue(digest) == stringValue(authority["qualificationCapabilityProfileDigest"]) {
			declaresProfile = true
			break
		}
	}
	toolIDs, _ := resolved["expectedToolIds"].([]any)
	receiptKinds, _ := resolved["expectedReceiptKinds"].([]any)
	if stringValue(authority["supportExpectation"]) != expectedSupport ||
		stringValue(resolved["capabilityId"]) != stringValue(authority["capabilityId"]) ||
		stringValue(resolved["supportExpectation"]) != expectedSupport ||
		stringValue(receipt["requestedProfileDigest"]) != stringValue(authority["qualificationCapabilityProfileDigest"]) ||
		stringValue(receipt["declaredCapabilityDigest"]) != declaredDigest ||
		stringValue(receipt["probeProgramDigest"]) != stringValue(program["programDigest"]) ||
		stringValue(receipt["profileProjectionDigest"]) != stringValue(program["profileProjectionDigest"]) ||
		stringValue(receipt["normalizedObservationDigest"]) != stringValue(observation["observationDigest"]) ||
		stringValue(receipt["observedLimitDigest"]) != stringValue(observation["observedLimitDigest"]) ||
		status != stringValue(observation["status"]) ||
		(expectedSupport == "required" && !declaresProfile) ||
		(expectedSupport == "expected-blocked" && (len(toolIDs) != 0 || len(receiptKinds) != 1 || stringValue(receiptKinds[0]) != "capability-unavailable-receipt")) ||
		requireDigestMatch(authority, "authorityDigest", path+"/authorityDigest") != nil {
		return "", "", fmt.Errorf("%s drifted from its declaration, probe, or resolved descriptor", path)
	}
	adapter, _ := provider["adapter"].(map[string]any)
	if stringValue(authority["qualificationCapabilityProfileId"]) != stringValue(target["capabilityProfileId"]) ||
		stringValue(authority["qualificationCapabilityProfileDigest"]) != stringValue(target["capabilityProfileDigest"]) ||
		stringValue(receipt["providerConfigurationDigest"]) != stringValue(target["providerIdentityDigest"]) ||
		stringValue(receipt["modelLineageDigest"]) != stringValue(target["modelLineageDigest"]) ||
		stringValue(observation["providerConfigurationDigest"]) != stringValue(target["providerIdentityDigest"]) ||
		stringValue(observation["modelLineageDigest"]) != stringValue(target["modelLineageDigest"]) ||
		stringValue(evidence["adapterDigest"]) != stringValue(adapter["adapterDigest"]) {
		return "", "", fmt.Errorf("%s drifted from its target/provider identity", path)
	}
	retrievalProbe := stringValue(authority["capabilityId"]) == "provider.hosted-retrieval" &&
		oneOf(stringValue(target["protocolFamily"]), "gemini-interactions", "openai-responses")
	resourceRaw, hasResource := authority["probeProviderResourceAuthority"]
	deletionRaw, hasDeletion := authority["probeProviderResourceDeletionAuthorityReceipt"]
	cleanupRaw, hasCleanup := authority["probeProviderResourceCleanupReceipt"]
	if retrievalProbe != hasResource || retrievalProbe != hasDeletion || retrievalProbe != hasCleanup {
		return "", "", fmt.Errorf("%s provider resource authority coverage drifted", path)
	}
	if hasResource {
		resource, resourceErr := evaluationCapabilityProbeProviderResourceAuthority(
			resourceRaw, program, target, provider, receipt, path+"/probeProviderResourceAuthority",
		)
		if resourceErr != nil {
			return "", "", resourceErr
		}
		if stringValue(resource["capabilityProfileId"]) != stringValue(authority["qualificationCapabilityProfileId"]) {
			return "", "", fmt.Errorf("%s/probeProviderResourceAuthority profile drifted", path)
		}
		if _, cleanupErr := evaluationCapabilityProbeProviderResourceCleanupAuthority(
			deletionRaw, cleanupRaw, resource, probedAt, plannedAt,
			path+"/probeProviderResourceCleanupReceipt",
		); cleanupErr != nil {
			return "", "", cleanupErr
		}
	}
	_, factBacked := evaluationFactBackedOptionalCapabilityIDs[stringValue(authority["capabilityId"])]
	runtimeRaw, hasRuntime := authority["runtimeFactSourceAuthority"]
	if factBacked != hasRuntime {
		return "", "", fmt.Errorf("%s runtime fact source authority coverage drifted", path)
	}
	if hasRuntime {
		runtimeAuthority, runtimeErr := evaluationRuntimeFactSourceAuthority(
			runtimeRaw, target, provider, path+"/runtimeFactSourceAuthority",
		)
		if runtimeErr != nil || stringValue(runtimeAuthority["capabilityId"]) != stringValue(authority["capabilityId"]) {
			if runtimeErr != nil {
				return "", "", runtimeErr
			}
			return "", "", fmt.Errorf("%s/runtimeFactSourceAuthority capability drifted", path)
		}
	}
	return stringValue(authority["capabilityId"]), stringValue(resolved["descriptorDigest"]), nil
}

func validateEvaluationQualificationAuthorityBundle(rawTargets []any) error {
	targets := make(map[string]map[string]any, len(evaluationProductionNativeProtocolFamilies)*len(evaluationProductionOptionalCapabilityProfiles))
	claimedBundleDigest := ""
	for _, raw := range rawTargets {
		target, ok := raw.(map[string]any)
		if !ok {
			return errors.New("qualification authority bundle target is invalid")
		}
		authority, optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
		if !optional {
			continue
		}
		protocol, profile := stringValue(target["protocolFamily"]), stringValue(target["capabilityProfileId"])
		key := protocol + "\x00" + profile
		if _, duplicate := targets[key]; duplicate {
			return errors.New("qualification authority bundle has a duplicate target")
		}
		targets[key] = target
		current := stringValue(authority["qualificationAuthorityBundleDigest"])
		if claimedBundleDigest == "" {
			claimedBundleDigest = current
		} else if current != claimedBundleDigest {
			return errors.New("qualification authority bundle digest differs across optional targets")
		}
	}
	if len(targets) != len(evaluationProductionNativeProtocolFamilies)*len(evaluationProductionOptionalCapabilityProfiles) {
		return errors.New("qualification authority bundle requires 18 exact probe authorities")
	}

	probeSet := make([]any, 0, len(targets))
	runtimeSet := make([]any, 0, len(evaluationProductionNativeProtocolFamilies)*len(evaluationProductionFactBackedOptionalCapabilityProfiles))
	cleanupSet := make([]any, 0, 4)
	for _, protocol := range evaluationProductionNativeProtocolFamilies {
		for _, profile := range evaluationProductionOptionalCapabilityProfiles {
			target := targets[protocol+"\x00"+profile]
			if target == nil {
				return fmt.Errorf("qualification authority bundle is missing %s/%s", protocol, profile)
			}
			authority := target["optionalCapabilitySupportAuthority"].(map[string]any)
			evidence := authority["probeEvidence"].(map[string]any)
			probeSet = append(probeSet, map[string]any{
				"protocolFamily": protocol,
				"profileId":      profile,
				"evidenceDigest": evidence["evidenceDigest"],
			})
		}

		for _, profile := range evaluationProductionFactBackedOptionalCapabilityProfiles {
			target := targets[protocol+"\x00"+profile]
			authority := target["optionalCapabilitySupportAuthority"].(map[string]any)
			source, ok := authority["runtimeFactSourceAuthority"].(map[string]any)
			if !ok {
				return fmt.Errorf("qualification authority bundle is missing runtime source %s/%s", protocol, profile)
			}
			runtimeSet = append(runtimeSet, map[string]any{
				"protocolFamily":  protocol,
				"profileId":       profile,
				"authorityDigest": source["authorityDigest"],
			})
		}
		if protocol != "anthropic-messages" {
			for _, profile := range []string{"g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document"} {
				target := targets[protocol+"\x00"+profile]
				authority := target["optionalCapabilitySupportAuthority"].(map[string]any)
				cleanup, ok := authority["probeProviderResourceCleanupReceipt"].(map[string]any)
				if !ok {
					return fmt.Errorf("qualification authority bundle is missing cleanup receipt %s/%s", protocol, profile)
				}
				cleanupSet = append(cleanupSet, map[string]any{
					"protocolFamily": protocol, "profileId": profile,
					"cleanupReceiptDigest": cleanup["cleanupReceiptDigest"],
				})
			}
		}
	}
	probeSetDigest, err := canonicaljson.Digest(map[string]any{"authorities": probeSet})
	if err != nil {
		return err
	}
	runtimeSetDigest, err := canonicaljson.Digest(map[string]any{"authorities": runtimeSet})
	if err != nil {
		return err
	}
	cleanupSetDigest, err := canonicaljson.Digest(map[string]any{"cleanupReceipts": cleanupSet})
	if err != nil {
		return err
	}
	bundleDigest, err := canonicaljson.Digest(map[string]any{
		"format":                                  "prodivix.agent-production-evaluation-qualification-authority-bundle",
		"version":                                 int64(1),
		"capabilityProbeAuthoritySetDigest":       probeSetDigest,
		"runtimeFactSourceAuthoritySetDigest":     runtimeSetDigest,
		"providerResourceCleanupReceiptSetDigest": cleanupSetDigest,
	})
	if err != nil {
		return err
	}
	if claimedBundleDigest == "" || bundleDigest != claimedBundleDigest {
		return fmt.Errorf("qualification authority bundle digest drifted from its exact 18 probe, 15 runtime, and 4 cleanup authorities: claimed=%s computed=%s probe=%s runtime=%s cleanup=%s", claimedBundleDigest, bundleDigest, probeSetDigest, runtimeSetDigest, cleanupSetDigest)
	}
	return nil
}

func validateAgentEvaluationPlanDeep(value map[string]any, plannedAt time.Time, expiresAt time.Time) error {
	providers, providerHashes, err := evaluationPlanProviders(value["providerConfigurations"])
	if err != nil {
		return err
	}
	models, err := evaluationPlanModels(value["modelConfigurations"])
	if err != nil {
		return err
	}
	cases, err := evaluationPlanCases(value)
	if err != nil {
		return err
	}
	if err := validateEvaluationPlanTiers(value, cases); err != nil {
		return err
	}
	targets, err := evaluationPlanTargets(
		value["capabilityQualificationTargets"], providers, providerHashes, models, plannedAt, expiresAt,
	)
	if err != nil {
		return err
	}
	if err := validateEvaluationOptionalCapabilitySupportMatrix(cases, targets); err != nil {
		return err
	}
	if err := validateEvaluationPlanSmokes(value["endpointSmokeTargets"]); err != nil {
		return err
	}
	repetitions, err := validateEvaluationRepetitionPolicy(value["repetitionPolicy"], cases)
	if err != nil {
		return err
	}
	if err := validateEvaluationGraderPlan(value["graderPlan"]); err != nil {
		return err
	}
	if err := validateEvaluationThresholdPlan(value["thresholds"]); err != nil {
		return err
	}
	schedule, err := buildEvaluationSchedule(cases, targets, repetitions)
	if err != nil {
		return err
	}
	planned, ok := safeInteger(value["plannedJourneyCount"])
	if !ok || planned != int64(len(schedule)) || planned != currentAgentEvaluationPlannedAttempts {
		return errors.New("/value/plannedJourneyCount does not match the current 14,040-attempt schedule")
	}
	scheduleValues := make([]any, len(schedule))
	for index, entry := range schedule {
		scheduleValues[index] = entry.value
	}
	scheduleDigest, err := canonicaljson.Digest(scheduleValues)
	if err != nil || stringValue(value["plannedAttemptSetDigest"]) != scheduleDigest {
		return errors.New("/value/plannedAttemptSetDigest does not match the frozen schedule")
	}
	if err := validateEvaluationPlanBudget(value["budget"], len(schedule), len(targets)); err != nil {
		return err
	}
	return nil
}

func EvaluationPlanAttemptSetDigest(value map[string]any, plannedAt time.Time, expiresAt time.Time) (string, error) {
	_ = plannedAt
	_ = expiresAt
	cases, err := evaluationPlanCases(value)
	if err != nil {
		return "", err
	}
	rawTargets, ok := value["capabilityQualificationTargets"].([]any)
	if !ok {
		return "", errors.New("/value/capabilityQualificationTargets is invalid")
	}
	targets := make([]evaluationPlanTarget, 0, len(rawTargets))
	for _, raw := range rawTargets {
		target, ok := raw.(map[string]any)
		if !ok {
			return "", errors.New("/value/capabilityQualificationTargets entry is invalid")
		}
		resolved := ""
		if optional, ok := target["optionalCapabilitySupportAuthority"].(map[string]any); ok {
			if descriptor, ok := optional["resolvedCapabilityDescriptor"].(map[string]any); ok {
				resolved = stringValue(descriptor["descriptorDigest"])
			}
		}
		targets = append(targets, evaluationPlanTarget{
			ID: stringValue(target["targetId"]), Digest: stringValue(target["targetDigest"]),
			ProfileID:                          stringValue(target["capabilityProfileId"]),
			ResolvedCapabilityDescriptorDigest: resolved,
		})
	}
	repetitions, err := evaluationPlanRepetitionCounts(value["repetitionPolicy"])
	if err != nil {
		return "", err
	}
	schedule, err := buildEvaluationSchedule(cases, targets, repetitions)
	if err != nil {
		return "", err
	}
	scheduleValues := make([]any, len(schedule))
	for index, entry := range schedule {
		scheduleValues[index] = entry.value
	}
	return canonicaljson.Digest(scheduleValues)
}

func evaluationPlanProviders(raw any) (map[string]map[string]any, map[string]string, error) {
	values, ok := raw.([]any)
	if !ok || len(values) < 3 {
		return nil, nil, errors.New("/value/providerConfigurations is invalid")
	}
	providers := make(map[string]map[string]any, len(values))
	hashes := make(map[string]string, len(values))
	previous := ""
	for index, rawValue := range values {
		provider, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(provider, []string{
			"providerConfigurationId", "providerOperatorId", "endpointClass", "endpointProfileDigest",
			"adapter", "dataPolicyDigest",
		}, []string{"providerRegion", "apiRevision"}) != nil {
			return nil, nil, fmt.Errorf("/value/providerConfigurations/%d is invalid", index)
		}
		id := stringValue(provider["providerConfigurationId"])
		if requireIdentity(id, fmt.Sprintf("/value/providerConfigurations/%d/providerConfigurationId", index)) != nil ||
			requireIdentity(provider["providerOperatorId"], fmt.Sprintf("/value/providerConfigurations/%d/providerOperatorId", index)) != nil ||
			(index > 0 && id <= previous) {
			return nil, nil, errors.New("/value/providerConfigurations is non-canonical")
		}
		if !oneOf(stringValue(provider["endpointClass"]), "first-party-hosted", "aggregator", "self-hosted", "local") {
			return nil, nil, fmt.Errorf("/value/providerConfigurations/%d/endpointClass is invalid", index)
		}
		for _, field := range []string{"endpointProfileDigest", "dataPolicyDigest"} {
			if err := requireDigest(provider[field], fmt.Sprintf("/value/providerConfigurations/%d/%s", index, field)); err != nil {
				return nil, nil, err
			}
		}
		for _, field := range []string{"providerRegion", "apiRevision"} {
			if provider[field] != nil && requireIdentity(provider[field], fmt.Sprintf("/value/providerConfigurations/%d/%s", index, field)) != nil {
				return nil, nil, fmt.Errorf("/value/providerConfigurations/%d/%s is invalid", index, field)
			}
		}
		adapter, ok := provider["adapter"].(map[string]any)
		if !ok || requireExactObjectKeys(adapter, []string{
			"adapterId", "adapterVersion", "adapterDigest", "protocolFamily", "transportSchemaDigest", "eventNormalizationDigest",
		}, nil) != nil {
			return nil, nil, fmt.Errorf("/value/providerConfigurations/%d/adapter is invalid", index)
		}
		if requireIdentity(adapter["adapterId"], fmt.Sprintf("/value/providerConfigurations/%d/adapter/adapterId", index)) != nil ||
			requireIdentity(adapter["adapterVersion"], fmt.Sprintf("/value/providerConfigurations/%d/adapter/adapterVersion", index)) != nil ||
			!oneOf(stringValue(adapter["protocolFamily"]), "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") {
			return nil, nil, fmt.Errorf("/value/providerConfigurations/%d/adapter identity is invalid", index)
		}
		for _, field := range []string{"transportSchemaDigest", "eventNormalizationDigest"} {
			if err := requireDigest(adapter[field], fmt.Sprintf("/value/providerConfigurations/%d/adapter/%s", index, field)); err != nil {
				return nil, nil, err
			}
		}
		if err := requireDigestMatch(adapter, "adapterDigest", fmt.Sprintf("/value/providerConfigurations/%d/adapter/adapterDigest", index)); err != nil {
			return nil, nil, err
		}
		providerHash, err := canonicaljson.Digest(provider)
		if err != nil {
			return nil, nil, err
		}
		providers[id], hashes[id] = provider, providerHash
		previous = id
	}
	return providers, hashes, nil
}

func evaluationPlanModels(raw any) (map[string]map[string]any, error) {
	values, ok := raw.([]any)
	if !ok || len(values) < 3 {
		return nil, errors.New("/value/modelConfigurations is invalid")
	}
	models := make(map[string]map[string]any, len(values))
	previous := ""
	for index, rawValue := range values {
		model, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(model, []string{
			"modelId", "modelFamilyId", "modelFamilyOwnerId", "lineageDigest",
		}, []string{
			"immutableVersion", "baseModelRef", "fineTuneRef", "tokenizerDigest", "chatTemplateDigest",
			"quantizationDigest", "runtimeBackendDigest",
		}) != nil {
			return nil, fmt.Errorf("/value/modelConfigurations/%d is invalid", index)
		}
		for _, field := range []string{"modelId", "modelFamilyId", "modelFamilyOwnerId"} {
			if err := requireIdentity(model[field], fmt.Sprintf("/value/modelConfigurations/%d/%s", index, field)); err != nil {
				return nil, err
			}
		}
		if model["immutableVersion"] != nil && requireIdentity(model["immutableVersion"], fmt.Sprintf("/value/modelConfigurations/%d/immutableVersion", index)) != nil {
			return nil, fmt.Errorf("/value/modelConfigurations/%d/immutableVersion is invalid", index)
		}
		for _, field := range []string{"tokenizerDigest", "chatTemplateDigest", "quantizationDigest", "runtimeBackendDigest"} {
			if model[field] != nil {
				if err := requireDigest(model[field], fmt.Sprintf("/value/modelConfigurations/%d/%s", index, field)); err != nil {
					return nil, err
				}
			}
		}
		if base, exists := model["baseModelRef"].(map[string]any); exists {
			if requireExactObjectKeys(base, []string{"modelId", "lineageDigest"}, nil) != nil ||
				requireIdentity(base["modelId"], fmt.Sprintf("/value/modelConfigurations/%d/baseModelRef/modelId", index)) != nil ||
				requireDigest(base["lineageDigest"], fmt.Sprintf("/value/modelConfigurations/%d/baseModelRef/lineageDigest", index)) != nil {
				return nil, fmt.Errorf("/value/modelConfigurations/%d/baseModelRef is invalid", index)
			}
		} else if model["baseModelRef"] != nil {
			return nil, fmt.Errorf("/value/modelConfigurations/%d/baseModelRef is invalid", index)
		}
		if fineTune, exists := model["fineTuneRef"].(map[string]any); exists {
			if requireExactObjectKeys(fineTune, []string{
				"fineTuneId", "jobId", "deploymentId", "baseModelLineageDigest", "trainingPolicyDigest", "disclosedDataLineageDigest",
			}, nil) != nil {
				return nil, fmt.Errorf("/value/modelConfigurations/%d/fineTuneRef is invalid", index)
			}
			for _, field := range []string{"fineTuneId", "jobId", "deploymentId"} {
				if err := requireIdentity(fineTune[field], fmt.Sprintf("/value/modelConfigurations/%d/fineTuneRef/%s", index, field)); err != nil {
					return nil, err
				}
			}
			for _, field := range []string{"baseModelLineageDigest", "trainingPolicyDigest", "disclosedDataLineageDigest"} {
				if err := requireDigest(fineTune[field], fmt.Sprintf("/value/modelConfigurations/%d/fineTuneRef/%s", index, field)); err != nil {
					return nil, err
				}
			}
		} else if model["fineTuneRef"] != nil {
			return nil, fmt.Errorf("/value/modelConfigurations/%d/fineTuneRef is invalid", index)
		}
		if err := requireDigestMatch(model, "lineageDigest", fmt.Sprintf("/value/modelConfigurations/%d/lineageDigest", index)); err != nil {
			return nil, err
		}
		digest := stringValue(model["lineageDigest"])
		if (index > 0 && digest <= previous) || models[digest] != nil {
			return nil, errors.New("/value/modelConfigurations is non-canonical")
		}
		models[digest] = model
		previous = digest
	}
	return models, nil
}

func evaluationPlanCases(value map[string]any) ([]evaluationPlanCase, error) {
	rawCases, _ := value["concreteCases"].([]any)
	cases := make([]evaluationPlanCase, 0, len(rawCases))
	contextIDs := make([]string, 0, 24)
	mediaIDs := make([]string, 0, 16)
	for _, raw := range rawCases {
		entry := raw.(map[string]any)
		capability, _ := entry["capabilityDescriptor"].(map[string]any)
		contextSentinel := entry["contextSentinel"].(bool)
		mediaSentinel := entry["mediaSentinel"].(bool)
		evaluationCase := evaluationPlanCase{
			ID: stringValue(entry["caseId"]), ProfileID: stringValue(entry["capabilityProfileId"]),
			CapabilityID:                 stringValue(capability["capabilityId"]),
			CapabilitySupportExpectation: stringValue(capability["supportExpectation"]),
			CapabilityDescriptorDigest:   stringValue(entry["capabilityDescriptorDigest"]),
			RiskClass:                    stringValue(entry["riskClass"]), ContextSentinel: contextSentinel,
			MediaSentinel: mediaSentinel, SubjectiveVisual: entry["subjectiveVisualQuality"].(bool),
		}
		cases = append(cases, evaluationCase)
		if contextSentinel {
			contextIDs = append(contextIDs, evaluationCase.ID)
		}
		if mediaSentinel {
			mediaIDs = append(mediaIDs, evaluationCase.ID)
		}
	}
	frozenContext, err := evaluationStringValues(value["contextSentinelCaseIds"], "/value/contextSentinelCaseIds")
	if err != nil || !sameEvaluationStrings(contextIDs, frozenContext) {
		return nil, errors.New("/value/contextSentinelCaseIds drifted from the corpus")
	}
	frozenMedia, err := evaluationStringValues(value["mediaSentinelCaseIds"], "/value/mediaSentinelCaseIds")
	if err != nil || !sameEvaluationStrings(mediaIDs, frozenMedia) {
		return nil, errors.New("/value/mediaSentinelCaseIds drifted from the corpus")
	}
	return cases, nil
}

func validateEvaluationOptionalCapabilitySupportMatrix(cases []evaluationPlanCase, targets []evaluationPlanTarget) error {
	for _, target := range targets {
		matched := false
		for _, evaluationCase := range cases {
			if evaluationCase.ProfileID != target.ProfileID {
				continue
			}
			matched = true
			_, optional := evaluationOptionalProviderCapabilityIDs[evaluationCase.CapabilityID]
			if optional != (target.OptionalCapabilityID != "") ||
				(optional && target.OptionalCapabilityID != evaluationCase.CapabilityID) ||
				(optional && evaluationCase.CapabilitySupportExpectation != "required") ||
				(optional && target.ResolvedCapabilityDescriptorDigest == "") ||
				(optional && target.OptionalSupportExpectation == "required" &&
					target.ResolvedCapabilityDescriptorDigest != evaluationCase.CapabilityDescriptorDigest) ||
				(optional && target.OptionalSupportExpectation == "expected-blocked" &&
					target.ResolvedCapabilityDescriptorDigest == evaluationCase.CapabilityDescriptorDigest) {
				return fmt.Errorf("optional capability target %s drifted from case %s", target.ID, evaluationCase.ID)
			}
		}
		if target.OptionalCapabilityID != "" && !matched {
			return fmt.Errorf("optional capability target %s is orphaned from its case profile", target.ID)
		}
	}
	return nil
}

func validateEvaluationPlanTiers(value map[string]any, cases []evaluationPlanCase) error {
	contextCases, mediaCases := map[string]struct{}{}, map[string]struct{}{}
	for _, evaluationCase := range cases {
		if evaluationCase.ContextSentinel {
			contextCases[evaluationCase.ID] = struct{}{}
		}
		if evaluationCase.MediaSentinel {
			mediaCases[evaluationCase.ID] = struct{}{}
		}
	}
	definitions := []struct {
		field        string
		caseIDs      map[string]struct{}
		tiers        []string
		digestFields []string
	}{
		{"contextTiers", contextCases, []string{"near-limit", "representative", "small"}, []string{"contextPackDigest", "transformReceiptDigest", "cacheReceiptDigest"}},
		{"mediaRepresentationTiers", mediaCases, []string{"near-limit-transform", "representative-transform", "source-faithful"}, []string{"representationManifestDigest", "transformReceiptDigest", "omissionReceiptDigest"}},
	}
	for _, definition := range definitions {
		values, ok := value[definition.field].([]any)
		if !ok || len(values) != len(definition.caseIDs)*len(definition.tiers) {
			return fmt.Errorf("/value/%s does not cover every sentinel tier", definition.field)
		}
		previous := ""
		seen := map[string]struct{}{}
		for index, raw := range values {
			entry, ok := raw.(map[string]any)
			required := append([]string{"caseId", "tier"}, definition.digestFields...)
			required = append(required, "tierDigest")
			if !ok || requireExactObjectKeys(entry, required, nil) != nil {
				return fmt.Errorf("/value/%s/%d is invalid", definition.field, index)
			}
			caseID, tier := stringValue(entry["caseId"]), stringValue(entry["tier"])
			if requireIdentity(caseID, fmt.Sprintf("/value/%s/%d/caseId", definition.field, index)) != nil {
				return fmt.Errorf("/value/%s/%d/caseId is invalid", definition.field, index)
			}
			if _, exists := definition.caseIDs[caseID]; !exists || !oneOf(tier, definition.tiers...) {
				return fmt.Errorf("/value/%s/%d sentinel tier binding is invalid", definition.field, index)
			}
			identity := caseID + "\x00" + tier
			if _, duplicate := seen[identity]; duplicate || (index > 0 && identity <= previous) {
				return fmt.Errorf("/value/%s is non-canonical", definition.field)
			}
			seen[identity] = struct{}{}
			for _, field := range definition.digestFields {
				if err := requireDigest(entry[field], fmt.Sprintf("/value/%s/%d/%s", definition.field, index, field)); err != nil {
					return err
				}
			}
			if err := requireDigestMatch(entry, "tierDigest", fmt.Sprintf("/value/%s/%d/tierDigest", definition.field, index)); err != nil {
				return err
			}
			previous = identity
		}
	}
	return nil
}

func evaluationPlanTargets(
	raw any,
	providers map[string]map[string]any,
	providerHashes map[string]string,
	models map[string]map[string]any,
	plannedAt time.Time,
	expiresAt time.Time,
) ([]evaluationPlanTarget, error) {
	values, ok := raw.([]any)
	if !ok || len(values) != 3*len(currentAgentEvaluationCapabilityProfiles) {
		return nil, errors.New("/value/capabilityQualificationTargets requires the exact 3 x 9 native matrix")
	}
	targets := make([]evaluationPlanTarget, 0, len(values))
	nativeProviders := map[string]string{}
	providerCountsByProtocol := map[string]int{}
	for _, provider := range providers {
		protocol := stringValue(provider["adapter"].(map[string]any)["protocolFamily"])
		if oneOf(protocol, "openai-responses", "anthropic-messages", "gemini-interactions") {
			providerCountsByProtocol[protocol]++
		}
	}
	for _, protocol := range []string{"openai-responses", "anthropic-messages", "gemini-interactions"} {
		if providerCountsByProtocol[protocol] != 1 {
			return nil, fmt.Errorf("native protocol %s requires one exact provider configuration", protocol)
		}
	}
	operators, owners := map[string]struct{}{}, map[string]struct{}{}
	profileCounts := map[string]int{}
	previous := ""
	for index, rawValue := range values {
		target, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(target, []string{
			"targetId", "providerConfigurationId", "providerIdentityDigest", "protocolFamily", "providerOperatorId",
			"modelId", "modelLineageDigest", "modelFamilyOwnerId", "capabilityProfileId", "capabilityProfileDigest",
			"inferenceConfigurationDigest", "qualificationSliceDigest", "targetDigest",
		}, []string{"optionalCapabilitySupportAuthority"}) != nil {
			return nil, fmt.Errorf("/value/capabilityQualificationTargets/%d is invalid", index)
		}
		result := evaluationPlanTarget{
			ID: stringValue(target["targetId"]), Digest: stringValue(target["targetDigest"]),
			ProfileID: stringValue(target["capabilityProfileId"]), Protocol: stringValue(target["protocolFamily"]),
			ProviderID: stringValue(target["providerConfigurationId"]), ProviderHash: stringValue(target["providerIdentityDigest"]),
			OperatorID: stringValue(target["providerOperatorId"]), ModelID: stringValue(target["modelId"]),
			ModelDigest: stringValue(target["modelLineageDigest"]), OwnerID: stringValue(target["modelFamilyOwnerId"]),
		}
		for _, field := range []string{"targetId", "providerConfigurationId", "providerOperatorId", "modelId", "modelFamilyOwnerId", "capabilityProfileId"} {
			if err := requireIdentity(target[field], fmt.Sprintf("/value/capabilityQualificationTargets/%d/%s", index, field)); err != nil {
				return nil, err
			}
		}
		for _, field := range []string{"providerIdentityDigest", "modelLineageDigest", "capabilityProfileDigest", "inferenceConfigurationDigest", "qualificationSliceDigest"} {
			if err := requireDigest(target[field], fmt.Sprintf("/value/capabilityQualificationTargets/%d/%s", index, field)); err != nil {
				return nil, err
			}
		}
		if !oneOf(result.Protocol, "openai-responses", "anthropic-messages", "gemini-interactions") ||
			(index > 0 && result.ID <= previous) {
			return nil, errors.New("/value/capabilityQualificationTargets is non-canonical")
		}
		provider, providerExists := providers[result.ProviderID]
		model, modelExists := models[result.ModelDigest]
		if !providerExists || !modelExists || providerHashes[result.ProviderID] != result.ProviderHash ||
			stringValue(provider["providerOperatorId"]) != result.OperatorID ||
			stringValue(provider["adapter"].(map[string]any)["protocolFamily"]) != result.Protocol ||
			stringValue(model["modelId"]) != result.ModelID || stringValue(model["modelFamilyOwnerId"]) != result.OwnerID {
			return nil, fmt.Errorf("/value/capabilityQualificationTargets/%d drifted from provider/model identity", index)
		}
		optionalCapabilityID, resolvedDescriptorDigest, err := evaluationOptionalCapabilitySupportAuthority(
			target, provider, fmt.Sprintf("/value/capabilityQualificationTargets/%d/optionalCapabilitySupportAuthority", index),
			plannedAt, expiresAt,
		)
		if err != nil {
			return nil, err
		}
		result.OptionalCapabilityID = optionalCapabilityID
		result.ResolvedCapabilityDescriptorDigest = resolvedDescriptorDigest
		if optionalCapabilityID != "" {
			authority, _ := target["optionalCapabilitySupportAuthority"].(map[string]any)
			result.OptionalSupportExpectation = stringValue(authority["supportExpectation"])
		}
		expectedOptionalCapabilityID, optionalProfile := evaluationOptionalCapabilityProfileIDs[result.ProfileID]
		if optionalProfile != (optionalCapabilityID != "") ||
			optionalProfile && optionalCapabilityID != expectedOptionalCapabilityID {
			return nil, fmt.Errorf("/value/capabilityQualificationTargets/%d optional support authority is missing or belongs to another profile", index)
		}
		if err := requireDigestMatch(target, "targetDigest", fmt.Sprintf("/value/capabilityQualificationTargets/%d/targetDigest", index)); err != nil {
			return nil, err
		}
		if oneOf(result.Protocol, "openai-responses", "anthropic-messages", "gemini-interactions") {
			if current, exists := nativeProviders[result.Protocol]; exists && current != result.ProviderID {
				return nil, fmt.Errorf("native protocol %s has multiple required configurations", result.Protocol)
			}
			nativeProviders[result.Protocol] = result.ProviderID
			operators[result.OperatorID] = struct{}{}
			owners[result.OwnerID] = struct{}{}
			profileCounts[result.Protocol+"\x00"+result.ProfileID]++
		}
		targets = append(targets, result)
		previous = result.ID
	}
	if len(nativeProviders) != 3 || len(operators) != 3 || len(owners) != 3 {
		return nil, errors.New("native protocol/operator/model-family diversity is insufficient")
	}
	for protocol := range nativeProviders {
		for _, profile := range currentAgentEvaluationCapabilityProfiles {
			if profileCounts[protocol+"\x00"+profile] != 1 {
				return nil, fmt.Errorf("native family %s profile %s requires one exact target", protocol, profile)
			}
		}
	}
	if err := validateEvaluationQualificationAuthorityBundle(values); err != nil {
		return nil, err
	}
	return targets, nil
}

func validateEvaluationPlanSmokes(raw any) error {
	values, ok := raw.([]any)
	if !ok || len(values) != 5 {
		return errors.New("/value/endpointSmokeTargets requires the exact five-target denominator")
	}
	previous := ""
	hosted, local := false, false
	protocolCounts := map[string]int{}
	for index, rawValue := range values {
		entry, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(entry, []string{
			"smokeTargetId", "endpointClass", "protocolFamily", "providerConfigurationId",
			"modelId", "immutableModelVersion", "modelLineageDigest", "inferenceConfigurationDigest",
			"adapterDigest", "pricingAuthorityDigest", "responseSpoolEncryptionPolicyDigest",
			"smokeProfileDigest", "targetDigest",
		}, nil) != nil {
			return fmt.Errorf("/value/endpointSmokeTargets/%d is invalid", index)
		}
		id, endpointClass := stringValue(entry["smokeTargetId"]), stringValue(entry["endpointClass"])
		protocol := stringValue(entry["protocolFamily"])
		if requireIdentity(id, fmt.Sprintf("/value/endpointSmokeTargets/%d/smokeTargetId", index)) != nil ||
			requireIdentity(entry["providerConfigurationId"], fmt.Sprintf("/value/endpointSmokeTargets/%d/providerConfigurationId", index)) != nil ||
			requireIdentity(entry["modelId"], fmt.Sprintf("/value/endpointSmokeTargets/%d/modelId", index)) != nil ||
			stringValue(entry["immutableModelVersion"]) == "" ||
			!oneOf(protocol, "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
			!oneOf(endpointClass, "first-party-hosted", "aggregator", "self-hosted", "local") || (index > 0 && id <= previous) {
			return errors.New("/value/endpointSmokeTargets is non-canonical")
		}
		for _, field := range []string{
			"modelLineageDigest", "inferenceConfigurationDigest", "adapterDigest",
			"pricingAuthorityDigest", "responseSpoolEncryptionPolicyDigest", "smokeProfileDigest",
		} {
			if err := requireDigest(entry[field], fmt.Sprintf("/value/endpointSmokeTargets/%d/%s", index, field)); err != nil {
				return err
			}
		}
		if err := requireDigestMatch(entry, "targetDigest", fmt.Sprintf("/value/endpointSmokeTargets/%d/targetDigest", index)); err != nil {
			return err
		}
		protocolCounts[protocol]++
		if protocol == "openai-compatible" {
			hosted = hosted || oneOf(endpointClass, "first-party-hosted", "aggregator")
			local = local || oneOf(endpointClass, "local", "self-hosted")
		}
		previous = id
	}
	if !hosted || !local || protocolCounts["openai-compatible"] != 2 ||
		protocolCounts["openai-responses"] != 1 || protocolCounts["anthropic-messages"] != 1 ||
		protocolCounts["gemini-interactions"] != 1 {
		return errors.New("endpoint smokes require three native targets plus hosted and local OpenAI-compatible targets")
	}
	return nil
}

func validateEvaluationRepetitionPolicy(raw any, cases []evaluationPlanCase) (map[string]int, error) {
	policy, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(policy, []string{
		"rules", "highAssuranceCaseIds", "samplingIndependencePolicyDigest", "cacheAndStateIsolationPolicyDigest",
	}, nil) != nil {
		return nil, errors.New("/value/repetitionPolicy is invalid")
	}
	for _, field := range []string{"samplingIndependencePolicyDigest", "cacheAndStateIsolationPolicyDigest"} {
		if err := requireDigest(policy[field], "/value/repetitionPolicy/"+field); err != nil {
			return nil, err
		}
	}
	rules, ok := policy["rules"].([]any)
	if !ok || len(rules) != 3 {
		return nil, errors.New("/value/repetitionPolicy/rules must cover all risk classes")
	}
	minimums := map[string]int64{"ordinary": 10, "critical": 30, "high-assurance": 100}
	counts := map[string]int{}
	previous := ""
	for index, rawRule := range rules {
		rule, ok := rawRule.(map[string]any)
		if !ok || requireExactObjectKeys(rule, []string{"riskClass", "minimumIndependentAttempts", "confidenceLevel"}, []string{"maximumFailureRateBound", "sequentialStoppingRuleDigest"}) != nil {
			return nil, fmt.Errorf("/value/repetitionPolicy/rules/%d is invalid", index)
		}
		risk := stringValue(rule["riskClass"])
		minimum, exists := minimums[risk]
		attempts, countOK := safeInteger(rule["minimumIndependentAttempts"])
		confidence, decimalErr := evaluationCanonicalDecimal(rule["confidenceLevel"], fmt.Sprintf("/value/repetitionPolicy/rules/%d/confidenceLevel", index))
		if !exists || !countOK || attempts < minimum || attempts > maximumAgentEvaluationScheduleEntries ||
			decimalErr != nil || confidence.Sign() <= 0 || confidence.Cmp(big.NewRat(1, 1)) >= 0 || (index > 0 && risk <= previous) {
			return nil, fmt.Errorf("/value/repetitionPolicy/rules/%d has invalid risk/count/confidence", index)
		}
		if rule["maximumFailureRateBound"] != nil {
			bound, err := evaluationCanonicalDecimal(rule["maximumFailureRateBound"], fmt.Sprintf("/value/repetitionPolicy/rules/%d/maximumFailureRateBound", index))
			if err != nil || bound.Sign() < 0 || bound.Cmp(big.NewRat(1, 1)) > 0 {
				return nil, fmt.Errorf("/value/repetitionPolicy/rules/%d maximum failure bound is invalid", index)
			}
		}
		if rule["sequentialStoppingRuleDigest"] != nil {
			if err := requireDigest(rule["sequentialStoppingRuleDigest"], fmt.Sprintf("/value/repetitionPolicy/rules/%d/sequentialStoppingRuleDigest", index)); err != nil {
				return nil, err
			}
		}
		counts[risk] = int(attempts)
		previous = risk
	}
	highCases := make([]string, 0)
	for _, evaluationCase := range cases {
		if evaluationCase.RiskClass == "high-assurance" {
			highCases = append(highCases, evaluationCase.ID)
		}
	}
	frozenHigh, err := evaluationStringValues(policy["highAssuranceCaseIds"], "/value/repetitionPolicy/highAssuranceCaseIds")
	if err != nil || len(highCases) < 12 || !sameEvaluationStrings(highCases, frozenHigh) {
		return nil, errors.New("/value/repetitionPolicy/highAssuranceCaseIds drifted from the corpus")
	}
	return counts, nil
}

func evaluationPlanRepetitionCounts(raw any) (map[string]int, error) {
	policy, ok := raw.(map[string]any)
	if !ok {
		return nil, errors.New("/value/repetitionPolicy is invalid")
	}
	rules, ok := policy["rules"].([]any)
	if !ok {
		return nil, errors.New("/value/repetitionPolicy/rules is invalid")
	}
	counts := map[string]int{}
	for _, rawRule := range rules {
		rule, ok := rawRule.(map[string]any)
		if !ok {
			return nil, errors.New("/value/repetitionPolicy/rules entry is invalid")
		}
		risk := stringValue(rule["riskClass"])
		attempts, ok := evaluationPlanAttemptCount(rule["minimumIndependentAttempts"])
		if !ok || risk == "" || attempts < 1 {
			return nil, errors.New("/value/repetitionPolicy/rules entry is invalid")
		}
		counts[risk] = int(attempts)
	}
	return counts, nil
}

func evaluationPlanAttemptCount(value any) (int64, bool) {
	if attempts, ok := safeInteger(value); ok {
		return attempts, true
	}
	switch typed := value.(type) {
	case int:
		return int64(typed), typed >= 1
	case int64:
		return typed, typed >= 1
	case json.Number:
		parsed, err := typed.Int64()
		return parsed, err == nil && parsed >= 1
	default:
		return 0, false
	}
}

func validateEvaluationGraderPlan(raw any) error {
	plan, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(plan, []string{
		"graders", "deterministicAuthorityGraderIds", "auxiliaryJudgeGraderIds", "blindHumanGraderIds",
		"minimumIndependentVisualRatings", "disagreementPolicyDigest", "randomizedPresentationPolicyDigest", "planDigest",
	}, nil) != nil {
		return errors.New("/value/graderPlan is invalid")
	}
	graders, ok := plan["graders"].([]any)
	if !ok || len(graders) == 0 {
		return errors.New("/value/graderPlan/graders is invalid")
	}
	graderKinds := map[string]string{}
	previous := ""
	for index, rawGrader := range graders {
		grader, ok := rawGrader.(map[string]any)
		if !ok || requireExactObjectKeys(grader, []string{"graderId", "kind", "authority", "configurationDigest", "testedModelFamilyOwnerIds"}, []string{"providerConfigurationId", "modelLineageDigest"}) != nil {
			return fmt.Errorf("/value/graderPlan/graders/%d is invalid", index)
		}
		id, kind, authority := stringValue(grader["graderId"]), stringValue(grader["kind"]), stringValue(grader["authority"])
		if requireIdentity(id, fmt.Sprintf("/value/graderPlan/graders/%d/graderId", index)) != nil || (index > 0 && id <= previous) ||
			!oneOf(kind, "strict-decoder", "deterministic-rule", "domain-dry-run", "g3-closure", "perceptual-metric", "model-judge", "blind-human-rubric") ||
			!oneOf(authority, "deterministic", "auxiliary", "human") || (kind == "model-judge") != (authority == "auxiliary") ||
			(kind == "blind-human-rubric") != (authority == "human") {
			return fmt.Errorf("/value/graderPlan/graders/%d classification is invalid", index)
		}
		if err := requireDigest(grader["configurationDigest"], fmt.Sprintf("/value/graderPlan/graders/%d/configurationDigest", index)); err != nil {
			return err
		}
		if grader["providerConfigurationId"] != nil && requireIdentity(grader["providerConfigurationId"], fmt.Sprintf("/value/graderPlan/graders/%d/providerConfigurationId", index)) != nil {
			return fmt.Errorf("/value/graderPlan/graders/%d provider identity is invalid", index)
		}
		if grader["modelLineageDigest"] != nil {
			if err := requireDigest(grader["modelLineageDigest"], fmt.Sprintf("/value/graderPlan/graders/%d/modelLineageDigest", index)); err != nil {
				return err
			}
		}
		if err := requireCanonicalStrings(grader["testedModelFamilyOwnerIds"]); err != nil {
			return fmt.Errorf("/value/graderPlan/graders/%d/testedModelFamilyOwnerIds: %w", index, err)
		}
		graderKinds[id] = authority
		previous = id
	}
	lists := []struct{ field, authority string }{{"deterministicAuthorityGraderIds", "deterministic"}, {"auxiliaryJudgeGraderIds", "auxiliary"}, {"blindHumanGraderIds", "human"}}
	for _, definition := range lists {
		ids, err := evaluationStringValues(plan[definition.field], "/value/graderPlan/"+definition.field)
		if err != nil || requireCanonicalStrings(plan[definition.field]) != nil || (definition.field == "deterministicAuthorityGraderIds" && len(ids) == 0) {
			return fmt.Errorf("/value/graderPlan/%s is invalid", definition.field)
		}
		for _, id := range ids {
			if graderKinds[id] != definition.authority {
				return fmt.Errorf("/value/graderPlan/%s references the wrong authority", definition.field)
			}
		}
	}
	minimum, ok := safeInteger(plan["minimumIndependentVisualRatings"])
	if !ok || minimum < 2 {
		return errors.New("/value/graderPlan/minimumIndependentVisualRatings is below two")
	}
	for _, field := range []string{"disagreementPolicyDigest", "randomizedPresentationPolicyDigest"} {
		if err := requireDigest(plan[field], "/value/graderPlan/"+field); err != nil {
			return err
		}
	}
	return requireDigestMatch(plan, "planDigest", "/value/graderPlan/planDigest")
}

func validateEvaluationThresholdPlan(raw any) error {
	thresholds, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(thresholds, []string{"metrics", "multipleComparisonPolicyDigest", "slicePolicyDigest", "thresholdsDigest"}, nil) != nil {
		return errors.New("/value/thresholds is invalid")
	}
	metrics, ok := thresholds["metrics"].([]any)
	if !ok || len(metrics) == 0 {
		return errors.New("/value/thresholds/metrics is invalid")
	}
	previous := ""
	for index, rawMetric := range metrics {
		metric, ok := rawMetric.(map[string]any)
		if !ok || requireExactObjectKeys(metric, []string{"metricId", "requiredAuthority", "maximumObservedFailureRate", "minimumSampleCount"}, []string{"maximumUpperConfidenceBound"}) != nil {
			return fmt.Errorf("/value/thresholds/metrics/%d is invalid", index)
		}
		id := stringValue(metric["metricId"])
		minimum, countOK := safeInteger(metric["minimumSampleCount"])
		observed, decimalErr := evaluationCanonicalDecimal(metric["maximumObservedFailureRate"], fmt.Sprintf("/value/thresholds/metrics/%d/maximumObservedFailureRate", index))
		if requireIdentity(id, fmt.Sprintf("/value/thresholds/metrics/%d/metricId", index)) != nil ||
			!oneOf(stringValue(metric["requiredAuthority"]), "deterministic", "human") || !countOK || minimum < 1 ||
			decimalErr != nil || observed.Sign() < 0 || observed.Cmp(big.NewRat(1, 1)) > 0 || (index > 0 && id <= previous) {
			return fmt.Errorf("/value/thresholds/metrics/%d value is invalid", index)
		}
		if metric["maximumUpperConfidenceBound"] != nil {
			bound, err := evaluationCanonicalDecimal(metric["maximumUpperConfidenceBound"], fmt.Sprintf("/value/thresholds/metrics/%d/maximumUpperConfidenceBound", index))
			if err != nil || bound.Sign() < 0 || bound.Cmp(big.NewRat(1, 1)) > 0 {
				return fmt.Errorf("/value/thresholds/metrics/%d confidence bound is invalid", index)
			}
		}
		previous = id
	}
	for _, field := range []string{"multipleComparisonPolicyDigest", "slicePolicyDigest"} {
		if err := requireDigest(thresholds[field], "/value/thresholds/"+field); err != nil {
			return err
		}
	}
	return requireDigestMatch(thresholds, "thresholdsDigest", "/value/thresholds/thresholdsDigest")
}

func buildEvaluationSchedule(cases []evaluationPlanCase, targets []evaluationPlanTarget, repetitions map[string]int) ([]evaluationScheduleEntry, error) {
	entries := make([]evaluationScheduleEntry, 0, currentAgentEvaluationPlannedAttempts)
	for _, evaluationCase := range cases {
		variants := evaluationScheduleVariants(evaluationCase)
		for _, target := range targets {
			if target.ProfileID != evaluationCase.ProfileID {
				continue
			}
			capabilityDescriptorDigest := evaluationCase.CapabilityDescriptorDigest
			if target.ResolvedCapabilityDescriptorDigest != "" {
				capabilityDescriptorDigest = target.ResolvedCapabilityDescriptorDigest
			}
			for _, variant := range variants {
				for repetition := 0; repetition < repetitions[evaluationCase.RiskClass]; repetition++ {
					if len(entries) >= maximumAgentEvaluationScheduleEntries {
						return nil, errors.New("evaluation schedule exceeds its bounded entry limit")
					}
					value := map[string]any{
						"caseId": evaluationCase.ID, "targetId": target.ID, "targetDigest": target.Digest,
						"capabilityDescriptorDigest": capabilityDescriptorDigest,
						"riskClass":                  evaluationCase.RiskClass, "repetitionIndex": float64(repetition),
					}
					contextTier, _ := variant["contextTier"].(string)
					mediaTier, _ := variant["mediaRepresentationTier"].(string)
					if contextTier != "" {
						value["contextTier"] = contextTier
					}
					if mediaTier != "" {
						value["mediaRepresentationTier"] = mediaTier
					}
					identity := strings.Join([]string{evaluationCase.ID, target.ID, evaluationCase.RiskClass, contextTier, mediaTier, fmt.Sprintf("%06d", repetition)}, "\x00")
					entries = append(entries, evaluationScheduleEntry{identity: identity, value: value})
				}
			}
		}
	}
	sort.Slice(entries, func(left, right int) bool { return entries[left].identity < entries[right].identity })
	return entries, nil
}

func evaluationScheduleVariants(evaluationCase evaluationPlanCase) []map[string]any {
	base := map[string]any{}
	if evaluationCase.ContextSentinel {
		base["contextTier"] = "representative"
	}
	if evaluationCase.MediaSentinel {
		base["mediaRepresentationTier"] = "representative-transform"
	}
	variants := []map[string]any{base}
	if evaluationCase.ContextSentinel {
		for _, tier := range []string{"small", "near-limit"} {
			variant := cloneEvaluationStringMap(base)
			variant["contextTier"] = tier
			variants = append(variants, variant)
		}
	}
	if evaluationCase.MediaSentinel {
		for _, tier := range []string{"source-faithful", "near-limit-transform"} {
			variant := cloneEvaluationStringMap(base)
			variant["mediaRepresentationTier"] = tier
			variants = append(variants, variant)
		}
	}
	return variants
}

func cloneEvaluationStringMap(source map[string]any) map[string]any {
	result := make(map[string]any, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func validateEvaluationPlanBudget(raw any, scheduleCount, targetCount int) error {
	evaluationBudget, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(evaluationBudget, []string{"budget", "maxProviderJobs", "maxShards", "maxHumanRatings", "reservePolicyDigest", "budgetDigest"}, nil) != nil {
		return errors.New("/value/budget is invalid")
	}
	for _, field := range []string{"maxProviderJobs", "maxShards", "maxHumanRatings"} {
		if _, ok := safeInteger(evaluationBudget[field]); !ok {
			return fmt.Errorf("/value/budget/%s is invalid", field)
		}
	}
	providerJobs, _ := safeInteger(evaluationBudget["maxProviderJobs"])
	shards, _ := safeInteger(evaluationBudget["maxShards"])
	if providerJobs < int64(scheduleCount) || shards < int64(targetCount) || shards == 0 {
		return errors.New("/value/budget cannot reserve the frozen provider-job/shard schedule")
	}
	if err := requireDigest(evaluationBudget["reservePolicyDigest"], "/value/budget/reservePolicyDigest"); err != nil {
		return err
	}
	budget, ok := evaluationBudget["budget"].(map[string]any)
	if !ok || requireExactObjectKeys(budget, []string{
		"usageLimits", "costLimits", "maxModelInvocations", "maxToolCalls", "maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs",
	}, nil) != nil {
		return errors.New("/value/budget/budget is invalid")
	}
	for _, field := range []string{"maxModelInvocations", "maxToolCalls", "maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs"} {
		if _, ok := safeInteger(budget[field]); !ok {
			return fmt.Errorf("/value/budget/budget/%s is invalid", field)
		}
	}
	modelInvocations, _ := safeInteger(budget["maxModelInvocations"])
	if modelInvocations < int64(scheduleCount) {
		return errors.New("/value/budget/budget/maxModelInvocations is below the frozen schedule")
	}
	for _, definition := range []struct{ field, identity string }{{"usageLimits", "unit"}, {"costLimits", "currency"}} {
		limits, ok := budget[definition.field].([]any)
		if !ok {
			return fmt.Errorf("/value/budget/budget/%s is invalid", definition.field)
		}
		previous := ""
		for index, rawLimit := range limits {
			limit, ok := rawLimit.(map[string]any)
			if !ok || requireExactObjectKeys(limit, []string{definition.identity, "maximum"}, nil) != nil {
				return fmt.Errorf("/value/budget/budget/%s/%d is invalid", definition.field, index)
			}
			identity := stringValue(limit[definition.identity])
			if identity == "" || (definition.identity == "currency" && !regexpCurrency(identity)) || (index > 0 && identity <= previous) {
				return fmt.Errorf("/value/budget/budget/%s is non-canonical", definition.field)
			}
			if _, err := evaluationCanonicalDecimal(limit["maximum"], fmt.Sprintf("/value/budget/budget/%s/%d/maximum", definition.field, index)); err != nil {
				return err
			}
			previous = identity
		}
	}
	return requireDigestMatch(evaluationBudget, "budgetDigest", "/value/budget/budgetDigest")
}

func regexpCurrency(value string) bool {
	if len(value) != 3 {
		return false
	}
	for _, character := range value {
		if character < 'A' || character > 'Z' {
			return false
		}
	}
	return true
}
