package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationProviderCapabilityObservationFormat       = "prodivix.agent-evaluation-provider-capability-observation-receipt"
	maximumEvaluationProviderCapabilityObservationBytes = 16_384
	maximumEvaluationProviderCapabilityObservationFacts = 2
	maximumEvaluationProviderCapabilityObservationTurns = 7
)

// EvaluationProviderCapabilityObservationReceiptRecord is the sanitized,
// request-bound provider lifecycle projection accepted by Backend before the
// provider-capability owner may execute. Raw provider payloads remain in the
// encrypted result spool and never enter this table.
type EvaluationProviderCapabilityObservationReceiptRecord struct {
	NamespaceID                          string
	PlanDigest                           string
	RepositoryCommit                     string
	ObservationReceiptID                 string
	AttemptID                            string
	DescriptorDigest                     string
	TurnIndex                            int64
	InvocationID                         string
	RequestDigest                        string
	ResponseDigest                       string
	ProtocolFamily                       string
	ProviderConfigurationID              string
	ModelLineageDigest                   string
	AdapterDigest                        string
	DispatchIntentDigest                 string
	TransportReceiptDigest               string
	ResultSpoolReceiptDigest             string
	NormalizedEventSetDigest             string
	SelectedRuntimeFactEnvelopeSetDigest string
	SourceAuthoritySetDigest             string
	ObservationDigest                    string
	ObservedAt                           time.Time
	ReceiptDigest                        string
	ReceiptBytes                         []byte
	Value                                map[string]any
}

func validateEvaluationProviderOpaqueContinuation(value map[string]any) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"continuationId", "encryptedBlobRef", "providerConfigurationId", "modelLineageDigest",
		"taskId", "runId", "generation", "parentInvocationId", "purpose", "createdAt", "expiresAt",
		"continuationDigest",
	}) || !evaluationCapabilityObjectWithin(value, 16_384) ||
		!evaluationCapabilityNonBlankString(value["continuationId"]) ||
		!evaluationCapabilityNonBlankString(value["encryptedBlobRef"]) ||
		!evaluationCapabilityNonBlankString(value["providerConfigurationId"]) ||
		!evaluationCapabilityNonBlankString(value["taskId"]) ||
		!evaluationCapabilityNonBlankString(value["runId"]) ||
		!evaluationCapabilityNonBlankString(value["parentInvocationId"]) ||
		stringMember(value, "purpose") != "provider-tool-loop-continuation" ||
		!evaluationDigestPattern.MatchString(stringMember(value, "modelLineageDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "continuationDigest")) {
		return "", ErrInvalid
	}
	generation, generationOK := integerMember(value, "generation")
	createdAt, createdErr := parseEvaluationServiceInstant(stringMember(value, "createdAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(value, "expiresAt"))
	if !generationOK || generation < 0 || createdErr != nil || expiresErr != nil || !expiresAt.After(createdAt) {
		return "", ErrInvalid
	}
	return evaluationCapabilityFactDigest(value, "continuationDigest")
}

func validateEvaluationProviderTerminalEvent(value map[string]any) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"eventId", "invocationId", "sequence", "type", "payloadDigest", "occurredAt", "eventDigest",
	}) || !evaluationCapabilityObjectWithin(value, maximumEvaluationProviderCapabilityObservationBytes) ||
		!evaluationCapabilityNonBlankString(value["eventId"]) ||
		!evaluationCapabilityNonBlankString(value["invocationId"]) ||
		!oneOfString(stringMember(value, "type"), "cancelled", "completed", "failed", "partial", "refusal", "safety-block", "timed-out", "truncation") ||
		!evaluationDigestPattern.MatchString(stringMember(value, "payloadDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "eventDigest")) {
		return "", ErrInvalid
	}
	sequence, sequenceOK := integerMember(value, "sequence")
	if !sequenceOK || sequence < 0 || sequence > 9_007_199_254_740_991 {
		return "", ErrInvalid
	}
	if _, err := parseEvaluationServiceInstant(stringMember(value, "occurredAt")); err != nil {
		return "", ErrInvalid
	}
	return evaluationCapabilityFactDigest(value, "eventDigest")
}

func validateEvaluationProviderCapabilityObservedFact(
	value map[string]any,
	invocationID string,
	providerConfigurationID string,
	modelLineageDigest string,
	observedAt time.Time,
) (string, string, error) {
	if !exactEvaluationKeys(value, []string{"factKind", "factDigest", "value"}) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "factDigest")) {
		return "", "", ErrInvalid
	}
	fact, ok := objectMember(value, "value")
	if !ok {
		return "", "", ErrInvalid
	}
	kind := stringMember(value, "factKind")
	var digest string
	var err error
	switch kind {
	case "opaque-continuation":
		digest, err = validateEvaluationProviderOpaqueContinuation(fact)
		if err == nil && (stringMember(fact, "providerConfigurationId") != providerConfigurationID ||
			stringMember(fact, "modelLineageDigest") != modelLineageDigest ||
			stringMember(fact, "parentInvocationId") != invocationID) {
			err = ErrConflict
		}
	case "provider-cache-receipt":
		digest, err = validateEvaluationProviderCapabilityFact("provider-cache", fact)
	case "provider-event":
		digest, err = validateEvaluationProviderTerminalEvent(fact)
		occurredAt, occurredErr := parseEvaluationServiceInstant(stringMember(fact, "occurredAt"))
		if err == nil && (occurredErr != nil || stringMember(fact, "invocationId") != invocationID || occurredAt.After(observedAt)) {
			err = ErrConflict
		}
	case "provider-job-receipt":
		digest, err = validateEvaluationProviderCapabilityFact("provider-job", fact)
		if err == nil && stringMember(fact, "invocationId") != invocationID {
			err = ErrConflict
		}
	case "retrieval-query-receipt":
		digest, err = validateEvaluationProviderCapabilityFact("retrieval-query", fact)
	case "usage-vector":
		if !exactEvaluationKeys(fact, []string{"amounts", "vectorDigest"}) ||
			!evaluationCapabilityObjectWithin(fact, 16_384) {
			return "", "", ErrInvalid
		}
		if _, _, err = decodeEvaluationUsage(fact, false); err == nil {
			digest = stringMember(fact, "vectorDigest")
		}
	default:
		return "", "", ErrInvalid
	}
	if err != nil || digest != stringMember(value, "factDigest") {
		return "", "", ErrConflict
	}
	return kind, digest, nil
}

func validateEvaluationProviderCapabilityFactAuthority(
	value map[string]any,
	observation map[string]any,
	fact map[string]any,
	factKind string,
	factDigest string,
	transportReceiptDigest string,
	resultSpoolReceiptDigest string,
	normalizedEventSetDigest string,
) (string, string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "factKind", "factDigest", "sourceAuthorityKind", "sourceAuthorityId",
		"sourceAuthorityImplementationDigest", "sourceKind", "routeBinding", "registrationAuthorityIssuerId",
		"registrationReceiptDigest", "runtimeFactSourceAuthorityDigest", "stageDigest", "dispatchAckDigest", "transportReceiptDigest",
		"resultSpoolReceiptDigest", "normalizedEventSetDigest", "runtimeFactEnvelopeDigest", "authorityDigest",
	}) || !evaluationCapabilityObjectWithin(value, 4_096) ||
		stringMember(value, "format") != "prodivix.agent-evaluation-provider-capability-fact-authority" ||
		stringMember(value, "factKind") != factKind || stringMember(value, "factDigest") != factDigest ||
		!validEvaluationAgentControlIdentity(stringMember(value, "sourceAuthorityId")) {
		return "", "", ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	sourceAuthorityKind := stringMember(value, "sourceAuthorityKind")
	nativeFact := factKind == "provider-event" || factKind == "usage-vector"
	sharedAuthority := sourceAuthorityKind == "shared-durable-capability"
	if !versionOK || version != 1 ||
		!oneOfString(sourceAuthorityKind, "native-provider-transport", "shared-durable-capability") ||
		(sourceAuthorityKind == "native-provider-transport") != nativeFact {
		return "", "", ErrConflict
	}
	if nativeFact {
		if value["sourceKind"] != nil || value["routeBinding"] != nil ||
			value["registrationAuthorityIssuerId"] != nil || value["registrationReceiptDigest"] != nil ||
			value["runtimeFactSourceAuthorityDigest"] != nil ||
			stringMember(value, "sourceAuthorityId") != stringMember(observation, "providerConfigurationId") ||
			stringMember(value, "sourceAuthorityImplementationDigest") != stringMember(observation, "adapterDigest") ||
			stringMember(value, "stageDigest") != stringMember(observation, "dispatchIntentDigest") ||
			stringMember(value, "dispatchAckDigest") != stringMember(observation, "transportReceiptDigest") ||
			stringMember(value, "transportReceiptDigest") != transportReceiptDigest ||
			stringMember(value, "resultSpoolReceiptDigest") != resultSpoolReceiptDigest ||
			stringMember(value, "normalizedEventSetDigest") != normalizedEventSetDigest {
			return "", "", ErrConflict
		}
	} else {
		expectedSourceKind := "sealed-provider-response-metadata"
		if factKind == "retrieval-query-receipt" {
			expectedSourceKind = "sealed-hosted-owner-result"
		}
		if !sharedAuthority || stringMember(value, "sourceKind") != expectedSourceKind ||
			!validEvaluationAgentControlIdentity(stringMember(value, "routeBinding")) ||
			!validEvaluationAgentControlIdentity(stringMember(value, "registrationAuthorityIssuerId")) ||
			!evaluationDigestPattern.MatchString(stringMember(value, "registrationReceiptDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(value, "runtimeFactSourceAuthorityDigest")) {
			return "", "", ErrConflict
		}
	}
	for _, field := range []string{
		"factDigest", "sourceAuthorityImplementationDigest", "stageDigest", "dispatchAckDigest",
		"transportReceiptDigest", "resultSpoolReceiptDigest", "normalizedEventSetDigest",
		"runtimeFactEnvelopeDigest", "authorityDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return "", "", ErrInvalid
		}
	}
	base := cloneEvaluationObject(value)
	delete(base, "authorityDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "authorityDigest") {
		return "", "", ErrConflict
	}
	runtimeEnvelopeBase := map[string]any{
		"format": "prodivix.agent-evaluation-provider-capability-runtime-fact-envelope", "version": int64(1),
		"sourceAuthorityKind": sourceAuthorityKind, "sourceAuthorityId": stringMember(value, "sourceAuthorityId"),
		"sourceAuthorityImplementationDigest": stringMember(value, "sourceAuthorityImplementationDigest"),
		"sourceKind":                          value["sourceKind"],
		"routeBinding":                        value["routeBinding"],
		"registrationAuthorityIssuerId":       value["registrationAuthorityIssuerId"],
		"registrationReceiptDigest":           value["registrationReceiptDigest"],
		"runtimeFactSourceAuthorityDigest":    value["runtimeFactSourceAuthorityDigest"],
		"stageDigest":                         stringMember(value, "stageDigest"),
		"dispatchAckDigest":                   stringMember(value, "dispatchAckDigest"),
		"planDigest":                          stringMember(observation, "planDigest"),
		"repositoryCommit":                    stringMember(observation, "repositoryCommit"),
		"attemptId":                           stringMember(observation, "attemptId"),
		"descriptorDigest":                    stringMember(observation, "descriptorDigest"),
		"turnIndex":                           observation["turnIndex"],
		"invocationId":                        stringMember(observation, "invocationId"),
		"requestDigest":                       stringMember(observation, "requestDigest"),
		"responseDigest":                      stringMember(observation, "responseDigest"),
		"protocolFamily":                      stringMember(observation, "protocolFamily"),
		"providerConfigurationId":             stringMember(observation, "providerConfigurationId"),
		"modelLineageDigest":                  stringMember(observation, "modelLineageDigest"),
		"adapterDigest":                       stringMember(observation, "adapterDigest"),
		"dispatchIntentDigest":                stringMember(observation, "dispatchIntentDigest"),
		"transportReceiptDigest":              stringMember(value, "transportReceiptDigest"),
		"resultSpoolReceiptDigest":            stringMember(value, "resultSpoolReceiptDigest"),
		"normalizedEventSetDigest":            stringMember(value, "normalizedEventSetDigest"),
		"observedAt":                          stringMember(observation, "observedAt"),
		"fact":                                fact,
	}
	runtimeEnvelopeDigest, err := canonicaljson.Digest(runtimeEnvelopeBase)
	if err != nil || runtimeEnvelopeDigest != stringMember(value, "runtimeFactEnvelopeDigest") {
		return "", "", ErrConflict
	}
	return stringMember(value, "runtimeFactEnvelopeDigest"), digest, nil
}

func decodeEvaluationProviderCapabilityObservationReceipt(
	source []byte,
) (EvaluationProviderCapabilityObservationReceiptRecord, error) {
	if len(source) == 0 || len(source) > maximumEvaluationProviderCapabilityObservationBytes {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrInvalid
	}
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "observationReceiptId", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "turnIndex", "invocationId", "requestDigest", "responseDigest",
		"protocolFamily", "providerConfigurationId", "modelLineageDigest", "adapterDigest",
		"dispatchIntentDigest", "transportReceiptDigest", "resultSpoolReceiptDigest",
		"normalizedEventSetDigest", "facts", "factAuthorities", "selectedRuntimeFactEnvelopeSetDigest",
		"sourceAuthoritySetDigest", "observationDigest", "observedAt", "receiptDigest",
	}) || stringMember(value, "format") != evaluationProviderCapabilityObservationFormat ||
		!validEvaluationAgentControlIdentity(stringMember(value, "observationReceiptId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "attemptId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "invocationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "providerConfigurationId")) ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions") {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnOK := integerMember(value, "turnIndex")
	observedAt, observedErr := parseEvaluationServiceInstant(stringMember(value, "observedAt"))
	if !versionOK || version != 1 || !turnOK || turnIndex < 0 ||
		turnIndex >= maximumEvaluationProviderCapabilityObservationTurns || observedErr != nil {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrInvalid
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "requestDigest", "responseDigest", "modelLineageDigest",
		"adapterDigest", "dispatchIntentDigest", "transportReceiptDigest", "resultSpoolReceiptDigest",
		"normalizedEventSetDigest", "selectedRuntimeFactEnvelopeSetDigest", "sourceAuthoritySetDigest",
		"observationDigest", "receiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrInvalid
		}
	}
	rawFacts, factsOK := value["facts"].([]any)
	rawAuthorities, authoritiesOK := value["factAuthorities"].([]any)
	if !factsOK || !authoritiesOK || len(rawFacts) > maximumEvaluationProviderCapabilityObservationFacts ||
		len(rawAuthorities) != len(rawFacts) {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrInvalid
	}
	factDigests := make([]any, len(rawFacts))
	factAuthorityDigests := make([]any, len(rawFacts))
	runtimeFactEnvelopeDigests := make([]string, len(rawFacts))
	authorityDigests := make([]string, len(rawFacts))
	previousKey := ""
	seenKinds := make(map[string]struct{}, len(rawFacts))
	for index, raw := range rawFacts {
		fact, ok := raw.(map[string]any)
		if !ok {
			return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrInvalid
		}
		kind, digest, err := validateEvaluationProviderCapabilityObservedFact(
			fact, stringMember(value, "invocationId"), stringMember(value, "providerConfigurationId"),
			stringMember(value, "modelLineageDigest"), observedAt,
		)
		key := kind + "\x00" + digest
		if err != nil || index > 0 && previousKey >= key {
			return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrConflict
		}
		if _, duplicate := seenKinds[kind]; duplicate {
			return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrConflict
		}
		seenKinds[kind], previousKey = struct{}{}, key
		factDigests[index] = map[string]any{"factKind": kind, "factDigest": digest}
		authority, ok := rawAuthorities[index].(map[string]any)
		if !ok {
			return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrInvalid
		}
		runtimeEnvelopeDigest, authorityDigest, err := validateEvaluationProviderCapabilityFactAuthority(
			authority, value, fact, kind, digest, stringMember(value, "transportReceiptDigest"),
			stringMember(value, "resultSpoolReceiptDigest"), stringMember(value, "normalizedEventSetDigest"),
		)
		if err != nil {
			return EvaluationProviderCapabilityObservationReceiptRecord{}, err
		}
		runtimeFactEnvelopeDigests[index], authorityDigests[index] = runtimeEnvelopeDigest, authorityDigest
		factAuthorityDigests[index] = map[string]any{
			"factKind": kind, "factDigest": digest, "authorityDigest": authorityDigest,
		}
	}
	selectedRuntimeFactEnvelopeSetDigest, err := canonicaljson.Digest(map[string]any{
		"runtimeFactEnvelopeDigests": runtimeFactEnvelopeDigests,
	})
	if err != nil || selectedRuntimeFactEnvelopeSetDigest != stringMember(value, "selectedRuntimeFactEnvelopeSetDigest") {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrConflict
	}
	sourceAuthoritySetDigest, err := canonicaljson.Digest(map[string]any{"authorityDigests": authorityDigests})
	if err != nil || sourceAuthoritySetDigest != stringMember(value, "sourceAuthoritySetDigest") {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrConflict
	}
	projection := map[string]any{
		"planDigest": stringMember(value, "planDigest"), "repositoryCommit": stringMember(value, "repositoryCommit"),
		"attemptId": stringMember(value, "attemptId"), "descriptorDigest": stringMember(value, "descriptorDigest"),
		"turnIndex": turnIndex, "invocationId": stringMember(value, "invocationId"),
		"requestDigest": stringMember(value, "requestDigest"), "responseDigest": stringMember(value, "responseDigest"),
		"protocolFamily":          stringMember(value, "protocolFamily"),
		"providerConfigurationId": stringMember(value, "providerConfigurationId"),
		"modelLineageDigest":      stringMember(value, "modelLineageDigest"), "adapterDigest": stringMember(value, "adapterDigest"),
		"dispatchIntentDigest":                 stringMember(value, "dispatchIntentDigest"),
		"transportReceiptDigest":               stringMember(value, "transportReceiptDigest"),
		"resultSpoolReceiptDigest":             stringMember(value, "resultSpoolReceiptDigest"),
		"normalizedEventSetDigest":             stringMember(value, "normalizedEventSetDigest"),
		"selectedRuntimeFactEnvelopeSetDigest": selectedRuntimeFactEnvelopeSetDigest,
		"sourceAuthoritySetDigest":             sourceAuthoritySetDigest,
		"factDigests":                          factDigests,
		"factAuthorityDigests":                 factAuthorityDigests,
	}
	observationDigest, err := canonicaljson.Digest(projection)
	if err != nil || observationDigest != stringMember(value, "observationDigest") {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrConflict
	}
	receiptBase := cloneEvaluationObject(value)
	delete(receiptBase, "receiptDigest")
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil || receiptDigest != stringMember(value, "receiptDigest") {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, ErrConflict
	}
	if err := agentcontract.ValidateSanitizedAgentPayload(value); err != nil {
		return EvaluationProviderCapabilityObservationReceiptRecord{}, fmt.Errorf(
			"%w: provider capability observation is not sanitized: %v", ErrInvalid, err,
		)
	}
	return EvaluationProviderCapabilityObservationReceiptRecord{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		ObservationReceiptID: stringMember(value, "observationReceiptId"), AttemptID: stringMember(value, "attemptId"),
		DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turnIndex,
		InvocationID: stringMember(value, "invocationId"), RequestDigest: stringMember(value, "requestDigest"),
		ResponseDigest: stringMember(value, "responseDigest"), ProtocolFamily: stringMember(value, "protocolFamily"),
		ProviderConfigurationID: stringMember(value, "providerConfigurationId"),
		ModelLineageDigest:      stringMember(value, "modelLineageDigest"), AdapterDigest: stringMember(value, "adapterDigest"),
		DispatchIntentDigest:                 stringMember(value, "dispatchIntentDigest"),
		TransportReceiptDigest:               stringMember(value, "transportReceiptDigest"),
		ResultSpoolReceiptDigest:             stringMember(value, "resultSpoolReceiptDigest"),
		NormalizedEventSetDigest:             stringMember(value, "normalizedEventSetDigest"),
		SelectedRuntimeFactEnvelopeSetDigest: selectedRuntimeFactEnvelopeSetDigest,
		SourceAuthoritySetDigest:             sourceAuthoritySetDigest,
		ObservationDigest:                    observationDigest, ObservedAt: observedAt, ReceiptDigest: receiptDigest,
		ReceiptBytes: canonical, Value: value,
	}, nil
}

func evaluationProviderCapabilityObservationReceiptSetDigest(
	records []EvaluationProviderCapabilityObservationReceiptRecord,
) (string, error) {
	if len(records) > int(maximumEvaluationObservationRecords) {
		return "", ErrInvalid
	}
	ordered := append([]EvaluationProviderCapabilityObservationReceiptRecord(nil), records...)
	sort.Slice(ordered, func(left, right int) bool {
		if ordered[left].AttemptID != ordered[right].AttemptID {
			return ordered[left].AttemptID < ordered[right].AttemptID
		}
		if ordered[left].TurnIndex != ordered[right].TurnIndex {
			return ordered[left].TurnIndex < ordered[right].TurnIndex
		}
		return ordered[left].InvocationID < ordered[right].InvocationID
	})
	digests := make([]string, len(ordered))
	for index := range ordered {
		if !evaluationDigestPattern.MatchString(ordered[index].ReceiptDigest) ||
			(index > 0 && ordered[index-1].AttemptID == ordered[index].AttemptID &&
				ordered[index-1].TurnIndex == ordered[index].TurnIndex) {
			return "", conflict("evaluation provider capability observation turn is duplicated")
		}
		digests[index] = ordered[index].ReceiptDigest
	}
	return canonicaljson.Digest(map[string]any{"receiptDigests": digests})
}

func validateEvaluationProviderCapabilityObservationPlanBinding(
	plan evaluationPlanFact,
	descriptor map[string]any,
	record EvaluationProviderCapabilityObservationReceiptRecord,
) error {
	target := evaluationPlanObjectByIdentity(plan.Value["capabilityQualificationTargets"], "targetId", stringMember(descriptor, "targetId"))
	provider := evaluationPlanObjectByIdentity(plan.Value["providerConfigurations"], "providerConfigurationId", record.ProviderConfigurationID)
	adapter, adapterOK := objectMember(provider, "adapter")
	if target == nil || provider == nil || !adapterOK ||
		stringMember(target, "protocolFamily") != record.ProtocolFamily ||
		stringMember(target, "providerConfigurationId") != record.ProviderConfigurationID ||
		stringMember(target, "modelLineageDigest") != record.ModelLineageDigest ||
		stringMember(adapter, "adapterDigest") != record.AdapterDigest {
		return conflict("evaluation provider capability observation drifted from the frozen target")
	}
	rawAuthorities, authoritiesOK := record.Value["factAuthorities"].([]any)
	if record.Value == nil || !authoritiesOK {
		return nil
	}
	optionalAuthority, optionalOK := objectMember(target, "optionalCapabilitySupportAuthority")
	runtimeAuthority, runtimeOK := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
	for _, raw := range rawAuthorities {
		factAuthority, ok := raw.(map[string]any)
		if !ok {
			return ErrInvalid
		}
		if stringMember(factAuthority, "sourceAuthorityKind") != "shared-durable-capability" {
			continue
		}
		if !optionalOK || !runtimeOK ||
			stringMember(factAuthority, "sourceAuthorityId") != stringMember(runtimeAuthority, "sourceAuthorityId") ||
			stringMember(factAuthority, "sourceAuthorityImplementationDigest") != stringMember(runtimeAuthority, "sourceAuthorityImplementationDigest") ||
			stringMember(factAuthority, "sourceKind") != stringMember(runtimeAuthority, "sourceKind") ||
			stringMember(factAuthority, "routeBinding") != stringMember(runtimeAuthority, "routeBinding") ||
			stringMember(factAuthority, "registrationAuthorityIssuerId") != stringMember(runtimeAuthority, "registrationAuthorityIssuerId") ||
			stringMember(factAuthority, "registrationReceiptDigest") != stringMember(runtimeAuthority, "registrationReceiptDigest") ||
			stringMember(factAuthority, "runtimeFactSourceAuthorityDigest") != stringMember(runtimeAuthority, "authorityDigest") {
			return conflict("evaluation provider capability observation drifted from its registered runtime fact source")
		}
	}
	return nil
}

func evaluationProviderCapabilityObservationsFromPayload(
	route evaluationAttemptAuthorityRoute,
	plan evaluationPlanFact,
	descriptor map[string]any,
	payload map[string]any,
) ([]EvaluationProviderCapabilityObservationReceiptRecord, error) {
	var raw []any
	switch route.Operation {
	case "execute-tool":
		if stringMember(payload, "executionAuthorityKind") == "shared-effect" {
			raw = []any{}
			break
		}
		value, ok := objectMember(payload, "providerCapabilityObservationReceipt")
		if !ok {
			return nil, ErrInvalid
		}
		raw = []any{value}
	case "assess-capability":
		var ok bool
		raw, ok = payload["providerCapabilityObservationReceipts"].([]any)
		if !ok {
			return nil, ErrInvalid
		}
	case "grade-and-persist":
		raw = []any{}
	default:
		return nil, ErrInvalid
	}
	if len(raw) > maximumEvaluationProviderCapabilityObservationTurns {
		return nil, ErrInvalid
	}
	result := make([]EvaluationProviderCapabilityObservationReceiptRecord, len(raw))
	previousKey := ""
	previousAttemptID := ""
	previousTurnIndex := int64(-1)
	for index, value := range raw {
		object, ok := value.(map[string]any)
		if !ok {
			return nil, ErrInvalid
		}
		bytesValue, err := canonicaljson.Bytes(object)
		if err != nil {
			return nil, ErrInvalid
		}
		record, err := decodeEvaluationProviderCapabilityObservationReceipt(bytesValue)
		if err != nil {
			return nil, err
		}
		key := fmt.Sprintf("%s\x00%02d\x00%s", record.AttemptID, record.TurnIndex, record.InvocationID)
		if index > 0 && previousKey >= key {
			return nil, conflict("evaluation provider capability observations are not canonical")
		}
		if index > 0 && previousAttemptID == record.AttemptID && previousTurnIndex == record.TurnIndex {
			return nil, conflict("evaluation provider capability observation turn is duplicated")
		}
		previousKey = key
		previousAttemptID, previousTurnIndex = record.AttemptID, record.TurnIndex
		if record.PlanDigest != plan.PlanDigest || record.RepositoryCommit != plan.RepositoryCommit ||
			record.AttemptID != stringMember(descriptor, "attemptId") ||
			record.DescriptorDigest != stringMember(descriptor, "descriptorDigest") ||
			validateEvaluationProviderCapabilityObservationPlanBinding(plan, descriptor, record) != nil {
			return nil, conflict("evaluation provider capability observation belongs to another attempt")
		}
		result[index] = record
	}
	if route.Operation == "execute-tool" && stringMember(payload, "executionAuthorityKind") == "observation-control" {
		turnIndex, _ := integerMember(payload, "turnIndex")
		observation := result[0]
		if observation.TurnIndex != turnIndex || observation.InvocationID != stringMember(payload, "invocationId") ||
			observation.RequestDigest != stringMember(payload, "requestDigest") {
			return nil, conflict("evaluation provider capability observation drifted from the tool turn")
		}
	} else if route.Operation == "assess-capability" {
		terminalTurn, _ := integerMember(payload, "terminalTurnIndex")
		if int64(len(result)) > terminalTurn+1 {
			return nil, conflict("evaluation provider capability observation set exceeds the terminal turn")
		}
		for _, executionRaw := range payload["capabilityToolExecutions"].([]any) {
			execution, executionOK := executionRaw.(map[string]any)
			input, inputOK := objectMember(execution, "input")
			observation, observationOK := objectMember(input, "providerCapabilityObservationReceipt")
			if !executionOK || !inputOK || !observationOK {
				return nil, ErrInvalid
			}
			matched := false
			for _, candidate := range result {
				if sameEvaluationCanonicalValue(candidate.Value, observation) {
					matched = true
					break
				}
			}
			if !matched {
				return nil, conflict("evaluation capability assessment omitted a tool observation")
			}
		}
	}
	return result, nil
}

func insertEvaluationProviderCapabilityObservationReceipt(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	record EvaluationProviderCapabilityObservationReceiptRecord,
) error {
	if record.PlanDigest != partition.PlanDigest || record.RepositoryCommit != partition.RepositoryCommit {
		return ErrConflict
	}
	if err := validateEvaluationProviderCapabilityObservationSharedAuthorities(
		ctx, tx, namespaceID, partition, record,
	); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_capability_observation_receipts (
		namespace_id,plan_digest,repository_commit,observation_receipt_id,attempt_id,descriptor_digest,
		turn_index,invocation_id,request_digest,response_digest,protocol_family,provider_configuration_id,
		model_lineage_digest,adapter_digest,dispatch_intent_digest,transport_receipt_digest,
		result_spool_receipt_digest,normalized_event_set_digest,selected_runtime_fact_envelope_set_digest,
		source_authority_set_digest,observation_digest,observed_at,receipt_digest,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25)
	ON CONFLICT DO NOTHING`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		record.ObservationReceiptID, record.AttemptID, record.DescriptorDigest, record.TurnIndex,
		record.InvocationID, record.RequestDigest, record.ResponseDigest, record.ProtocolFamily,
		record.ProviderConfigurationID, record.ModelLineageDigest, record.AdapterDigest,
		record.DispatchIntentDigest, record.TransportReceiptDigest, record.ResultSpoolReceiptDigest,
		record.NormalizedEventSetDigest, record.SelectedRuntimeFactEnvelopeSetDigest,
		record.SourceAuthoritySetDigest, record.ObservationDigest, record.ObservedAt,
		record.ReceiptDigest, string(record.ReceiptBytes), record.ReceiptBytes)
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err != nil || affected > 1 {
		return conflict("evaluation provider capability observation insert lost its CAS")
	}
	return nil
}

func validateEvaluationProviderCapabilityObservationSharedAuthorities(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	record EvaluationProviderCapabilityObservationReceiptRecord,
) error {
	rawAuthorities, authoritiesOK := record.Value["factAuthorities"].([]any)
	rawFacts, factsOK := record.Value["facts"].([]any)
	if !authoritiesOK || !factsOK || len(rawAuthorities) != len(rawFacts) {
		return ErrInvalid
	}
	for index, raw := range rawAuthorities {
		authority, ok := raw.(map[string]any)
		if !ok {
			return ErrInvalid
		}
		if stringMember(authority, "sourceAuthorityKind") != "shared-durable-capability" {
			continue
		}
		fact, factOK := rawFacts[index].(map[string]any)
		authorityBytes, bytesErr := canonicaljson.Bytes(authority)
		if !factOK || bytesErr != nil {
			return ErrInvalid
		}
		var targetAuthorityDigest, sourceAuthorityID, sourceImplementationDigest, routeBinding string
		var registrationIssuerID, registrationReceiptDigest, sourceKind string
		var ownerStageDigest, ownerDispatchAckDigest, transportDigest, spoolDigest, normalizedDigest string
		var factKind, factDigest, runtimeEnvelopeDigest, factAuthorityDigest, state string
		var sourceEligible, authorityEligible bool
		var storedAuthorityBytes []byte
		err := tx.QueryRowContext(ctx, `SELECT
			s.target_authority_digest,s.source_authority_id,s.source_authority_implementation_digest,
			s.source_authority_route_binding,s.registration_authority_issuer_id,s.registration_receipt_digest,
			s.source_kind,s.source_owner_stage_digest,s.source_owner_dispatch_ack_digest,
			s.transport_receipt_digest,s.result_spool_receipt_digest,s.normalized_event_set_digest,
			s.fact_kind,s.fact_digest,s.v46_eligible,a.state,a.v46_eligible,
			a.runtime_fact_envelope_digest,a.fact_authority_digest,a.fact_authority_bytes
		FROM agent_evaluation_optional_capability_fact_sources s
		JOIN agent_evaluation_optional_fact_authorities a
		  ON a.namespace_id=s.namespace_id AND a.plan_digest=s.plan_digest
		 AND a.repository_commit=s.repository_commit AND a.attempt_id=s.attempt_id
		 AND a.turn_index=s.turn_index AND a.source_seal_digest=s.source_seal_digest
		WHERE s.namespace_id=$1 AND s.plan_digest=$2 AND s.repository_commit=$3
		  AND s.attempt_id=$4 AND s.turn_index=$5 FOR SHARE`,
			namespaceID, partition.PlanDigest, partition.RepositoryCommit, record.AttemptID, record.TurnIndex,
		).Scan(&targetAuthorityDigest, &sourceAuthorityID, &sourceImplementationDigest, &routeBinding,
			&registrationIssuerID, &registrationReceiptDigest, &sourceKind, &ownerStageDigest,
			&ownerDispatchAckDigest, &transportDigest, &spoolDigest, &normalizedDigest, &factKind,
			&factDigest, &sourceEligible, &state, &authorityEligible, &runtimeEnvelopeDigest,
			&factAuthorityDigest, &storedAuthorityBytes)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if !sourceEligible || !authorityEligible || state != "sealed" ||
			targetAuthorityDigest != stringMember(authority, "runtimeFactSourceAuthorityDigest") ||
			sourceAuthorityID != stringMember(authority, "sourceAuthorityId") ||
			sourceImplementationDigest != stringMember(authority, "sourceAuthorityImplementationDigest") ||
			routeBinding != stringMember(authority, "routeBinding") ||
			registrationIssuerID != stringMember(authority, "registrationAuthorityIssuerId") ||
			registrationReceiptDigest != stringMember(authority, "registrationReceiptDigest") ||
			sourceKind != stringMember(authority, "sourceKind") ||
			ownerStageDigest != stringMember(authority, "stageDigest") ||
			ownerDispatchAckDigest != stringMember(authority, "dispatchAckDigest") ||
			transportDigest != stringMember(authority, "transportReceiptDigest") ||
			spoolDigest != stringMember(authority, "resultSpoolReceiptDigest") ||
			normalizedDigest != stringMember(authority, "normalizedEventSetDigest") ||
			factKind != stringMember(authority, "factKind") || factKind != stringMember(fact, "factKind") ||
			factDigest != stringMember(authority, "factDigest") || factDigest != stringMember(fact, "factDigest") ||
			runtimeEnvelopeDigest != stringMember(authority, "runtimeFactEnvelopeDigest") ||
			factAuthorityDigest != stringMember(authority, "authorityDigest") ||
			!bytes.Equal(storedAuthorityBytes, authorityBytes) {
			return conflict("evaluation provider capability observation shared authority lacks its sealed source owner")
		}
	}
	return nil
}

func queryEvaluationProviderCapabilityObservationReceipts(
	ctx context.Context,
	queryer interface {
		QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	},
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationProviderCapabilityObservationReceiptRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_provider_capability_observation_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND ($4='' OR attempt_id=$4)
		ORDER BY attempt_id,turn_index,invocation_id`, namespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]EvaluationProviderCapabilityObservationReceiptRecord, 0)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		record, err := decodeEvaluationProviderCapabilityObservationReceipt(source)
		if err != nil {
			return nil, err
		}
		record.NamespaceID = namespaceID
		if record.PlanDigest != partition.PlanDigest || record.RepositoryCommit != partition.RepositoryCommit ||
			(attemptID != "" && record.AttemptID != attemptID) {
			return nil, ErrConflict
		}
		result = append(result, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func queryCommittedEvaluationProviderCapabilityObservationReceipts(
	ctx context.Context,
	queryer interface {
		QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	},
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationProviderCapabilityObservationReceiptRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT source.receipt_bytes
		FROM agent_evaluation_provider_capability_observation_receipts source
		WHERE source.namespace_id=$1 AND source.plan_digest=$2 AND source.repository_commit=$3
			AND ($4='' OR source.attempt_id=$4)
			AND EXISTS (
				SELECT 1 FROM agent_evaluation_provider_capability_observation_commit_links link
				WHERE link.namespace_id=source.namespace_id AND link.plan_digest=source.plan_digest
					AND link.repository_commit=source.repository_commit
					AND link.attempt_id=source.attempt_id
					AND link.receipt_digest=source.receipt_digest
			)
		ORDER BY source.attempt_id,source.turn_index,source.invocation_id,source.observation_receipt_id`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]EvaluationProviderCapabilityObservationReceiptRecord, 0)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		record, err := decodeEvaluationProviderCapabilityObservationReceipt(source)
		if err != nil || record.PlanDigest != partition.PlanDigest ||
			record.RepositoryCommit != partition.RepositoryCommit ||
			(attemptID != "" && record.AttemptID != attemptID) {
			if err != nil {
				return nil, err
			}
			return nil, ErrConflict
		}
		record.NamespaceID = namespaceID
		result = append(result, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func insertEvaluationProviderCapabilityObservationCommitLink(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	attempt evaluationAttemptFact,
	receipt EvaluationProviderCapabilityObservationReceiptRecord,
) error {
	if receipt.AttemptID != attempt.AttemptID || receipt.PlanDigest != partition.PlanDigest ||
		receipt.RepositoryCommit != partition.RepositoryCommit {
		return ErrConflict
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_capability_observation_commit_links (
		namespace_id,plan_digest,repository_commit,receipt_digest,attempt_id,attempt_digest,created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7)`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.ReceiptDigest, attempt.AttemptID, attempt.AttemptDigest, attempt.CompletedAt)
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		return conflict("evaluation provider capability observation commit-link CAS was lost")
	}
	return nil
}

func exactEvaluationProviderCapabilityObservationSet(
	left []EvaluationProviderCapabilityObservationReceiptRecord,
	right []EvaluationProviderCapabilityObservationReceiptRecord,
) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if !bytes.Equal(left[index].ReceiptBytes, right[index].ReceiptBytes) {
			return false
		}
	}
	return true
}

func (repository *Repository) ListEvaluationProviderCapabilityObservationReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationProviderCapabilityObservationReceiptRecord, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return nil, err
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	records, err := queryEvaluationProviderCapabilityObservationReceipts(
		readContext, repository.db, authority.NamespaceID, partition, "",
	)
	if errors.Is(err, sql.ErrNoRows) {
		return []EvaluationProviderCapabilityObservationReceiptRecord{}, nil
	}
	return records, err
}

func evaluationProviderCapabilityObservationFact(
	record EvaluationProviderCapabilityObservationReceiptRecord,
	kind string,
	digest string,
) (map[string]any, bool) {
	raw, _ := record.Value["facts"].([]any)
	for _, entry := range raw {
		fact, _ := entry.(map[string]any)
		if stringMember(fact, "factKind") == kind && stringMember(fact, "factDigest") == digest {
			value, ok := objectMember(fact, "value")
			return value, ok
		}
	}
	return nil, false
}

func evaluationProviderObservationFactKind(authorityKind string) string {
	switch authorityKind {
	case "provider-job":
		return "provider-job-receipt"
	case "provider-cache":
		return "provider-cache-receipt"
	case "opaque-continuation":
		return "opaque-continuation"
	case "retrieval-query":
		return "retrieval-query-receipt"
	case "usage-vector":
		return "usage-vector"
	case "terminal-normalization":
		return "provider-event"
	case "capability-denial":
		return "capability-denial"
	default:
		return ""
	}
}

func validateEvaluationCapabilitySpecificProviderObservation(
	receipt evaluationCapabilitySpecificReceipt,
	observation EvaluationProviderCapabilityObservationReceiptRecord,
) error {
	observationDigest := stringMember(receipt.Value, "providerCapabilityObservationReceiptDigest")
	if observationDigest == "" || observationDigest != observation.ReceiptDigest ||
		receipt.PlanDigest != observation.PlanDigest || receipt.RepositoryCommit != observation.RepositoryCommit ||
		receipt.AttemptID != observation.AttemptID || receipt.DescriptorDigest != observation.DescriptorDigest ||
		receipt.TurnIndex != observation.TurnIndex || receipt.InvocationID != observation.InvocationID ||
		receipt.RequestDigest != observation.RequestDigest || receipt.CompletedAt.Before(observation.ObservedAt) {
		return conflict("evaluation capability-specific receipt drifted from its provider observation")
	}
	authority, ok := objectMember(receipt.Value, "authority")
	if !ok {
		return ErrInvalid
	}
	authorityKind := stringMember(authority, "authorityKind")
	factDigest := stringMember(authority, "factDigest")
	factKind := evaluationProviderObservationFactKind(authorityKind)
	if factKind == "" {
		return conflict("evaluation non-provider capability receipt references a provider observation")
	}
	if authorityKind == "capability-denial" {
		ownerFact, ownerFactOK := objectMember(authority, "fact")
		rawFacts, factsOK := observation.Value["facts"].([]any)
		terminalType := ""
		terminalCount := 0
		factsAllowed := factsOK
		for _, raw := range rawFacts {
			fact, ok := raw.(map[string]any)
			kind := stringMember(fact, "factKind")
			if !ok || !oneOfString(kind, "provider-event", "usage-vector") {
				factsAllowed = false
				continue
			}
			if kind == "provider-event" {
				terminalCount++
				event, eventOK := objectMember(fact, "value")
				if !eventOK {
					factsAllowed = false
					continue
				}
				terminalType = stringMember(event, "type")
			}
		}
		if !ownerFactOK || !factsAllowed || terminalCount != 1 ||
			stringMember(ownerFact, "category") != receipt.ReceiptKind ||
			stringMember(ownerFact, "authorityResultDigest") != observation.ResponseDigest ||
			stringMember(ownerFact, "decisionDigest") != observation.ResponseDigest ||
			receipt.ResultDigest != observation.ResponseDigest ||
			(receipt.ReceiptKind == "authority-denial-receipt" && !oneOfString(terminalType, "refusal", "safety-block")) ||
			!oneOfString(receipt.ReceiptKind, "authority-denial-receipt", "capability-unavailable-receipt") {
			return conflict("evaluation capability denial drifted from its observed provider response")
		}
		return nil
	}
	fact, found := evaluationProviderCapabilityObservationFact(observation, factKind, func() string {
		if authorityKind == "terminal-normalization" {
			ownerFact, _ := objectMember(authority, "fact")
			return stringMember(ownerFact, "terminalEventDigest")
		}
		return factDigest
	}())
	if !found {
		return conflict("evaluation capability-specific provider fact is absent from its observation")
	}
	if authorityKind == "terminal-normalization" {
		expected := "refusal"
		if receipt.ReceiptKind == "truncation-receipt" {
			expected = "truncation"
		}
		if stringMember(fact, "type") != expected {
			return conflict("evaluation terminal normalization drifted from the observed provider event")
		}
	}
	return nil
}

func evaluationProviderCapabilityObservationSetDigestFromPayload(
	route evaluationAttemptAuthorityRoute,
	plan evaluationPlanFact,
	descriptor map[string]any,
	payload map[string]any,
) ([]EvaluationProviderCapabilityObservationReceiptRecord, string, error) {
	records, err := evaluationProviderCapabilityObservationsFromPayload(route, plan, descriptor, payload)
	if err != nil {
		return nil, "", err
	}
	digest, err := evaluationProviderCapabilityObservationReceiptSetDigest(records)
	if err != nil || !strings.HasPrefix(digest, "sha256-") {
		return nil, "", ErrInvalid
	}
	return records, digest, nil
}
