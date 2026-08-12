package agent

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityEffectRequestRefAuthorityRequestFormat  = "prodivix.agent-evaluation-capability-effect-request-ref-authority-request"
	evaluationCapabilityEffectRequestRefAuthorityReceiptFormat  = "prodivix.agent-evaluation-capability-effect-request-ref-authority-receipt"
	evaluationCapabilityEffectRequestRefAuthorityResponseFormat = "prodivix.agent-evaluation-capability-effect-request-ref-authority-response"
	evaluationCapabilityEffectCurrentTurnEventRequestFormat     = "prodivix.agent-evaluation-capability-effect-current-turn-event-request"
	evaluationCapabilityEffectCurrentTurnEventReceiptFormat     = "prodivix.agent-evaluation-capability-effect-current-turn-event-receipt"
	evaluationCapabilityEffectCurrentTurnEventResponseFormat    = "prodivix.agent-evaluation-capability-effect-current-turn-event-response"
	evaluationCapabilityEffectInputRegistryRequestFormat        = "prodivix.agent-evaluation-capability-effect-input-authority-registry-request"
	evaluationCapabilityEffectInputRegistryReceiptFormat        = "prodivix.agent-evaluation-capability-effect-input-authority-registry-receipt"
	evaluationCapabilityEffectInputRegistryResponseFormat       = "prodivix.agent-evaluation-capability-effect-input-authority-registry-response"
	evaluationCapabilityEffectInputAuthorityVersion             = int64(1)
	maximumEvaluationCapabilityEffectInputAuthorityBytes        = 16_384
	maximumEvaluationCapabilityEffectCurrentTurnEventBytes      = 131_072
	maximumEvaluationCapabilityEffectNormalizedEventSetBytes    = 65_536
	maximumEvaluationCapabilityEffectRequestRefLifetime         = 125 * time.Second
	maximumEvaluationCapabilityEffectRequestRefsPerTurn         = int64(4)
	maximumEvaluationCapabilityEffectRequestRefsPerAttempt      = int64(28)
	maximumEvaluationProductionCapabilityEffectRefsPerTurn      = int64(1)
	maximumEvaluationProductionCapabilityEffectRefsPerAttempt   = int64(7)
)

type evaluationCapabilityEffectInputProfile struct {
	CapabilityID   string
	ToolID         string
	SourceFactKind string
}

var evaluationCapabilityEffectInputProfiles = map[string]evaluationCapabilityEffectInputProfile{
	"hosted-retrieval-query": {
		CapabilityID: "provider.hosted-retrieval", ToolID: "provider.retrieval.search", SourceFactKind: "provider-event",
	},
	"opaque-continuation": {
		CapabilityID: "provider.reasoning-continuation", ToolID: "provider.continuation.resume", SourceFactKind: "opaque-continuation",
	},
	"provider-cache": {
		CapabilityID: "provider.isolated-cache", ToolID: "provider.cache.inspect", SourceFactKind: "provider-cache-receipt",
	},
	"provider-job": {
		CapabilityID: "provider.background-job", ToolID: "provider.background-job.poll", SourceFactKind: "provider-job-receipt",
	},
}

type evaluationCapabilityEffectRequestRefAuthorityRequest struct {
	NamespaceID                      string
	PlanDigest                       string
	RepositoryCommit                 string
	AttemptID                        string
	DescriptorDigest                 string
	DescriptorBytes                  []byte
	TurnIndex                        int64
	InvocationID                     string
	BindingKind                      string
	CapabilityID                     string
	ToolID                           string
	TargetRef                        string
	ProtocolFamily                   string
	ProviderConfigurationID          string
	ModelLineageDigest               string
	AdapterDigest                    string
	RuntimeFactSourceAuthorityDigest string
	RegistrationReceiptDigest        string
	IssuedAt                         time.Time
	ExpiresAt                        time.Time
	RequestDigest                    string
	Value                            map[string]any
	Bytes                            []byte
}

type EvaluationCapabilityEffectRequestRefAuthorityRecord struct {
	NamespaceID                            string
	PlanDigest                             string
	RepositoryCommit                       string
	AttemptID                              string
	DescriptorDigest                       string
	TurnIndex                              int64
	InvocationID                           string
	BindingKind                            string
	CapabilityID                           string
	ToolID                                 string
	TargetRef                              string
	ProtocolFamily                         string
	ProviderConfigurationID                string
	ModelLineageDigest                     string
	AdapterDigest                          string
	RuntimeFactSourceAuthorityDigest       string
	RegistrationReceiptDigest              string
	IssuedAt                               time.Time
	ExpiresAt                              time.Time
	AuthorityDigest                        string
	RequestRef                             string
	ReceiptDigest                          string
	SelectedSourceObservationReceiptDigest string
	SelectedSourceHandleDigest             string
	RequestBytes                           []byte
	ReceiptBytes                           []byte
}

type evaluationCapabilityEffectCurrentTurnEventRequest struct {
	NamespaceID                      string
	PlanDigest                       string
	RepositoryCommit                 string
	AttemptID                        string
	DescriptorDigest                 string
	TurnIndex                        int64
	InvocationID                     string
	RequestRefAuthorityReceiptDigest string
	RequestRef                       string
	TargetRef                        string
	ProviderToolCallID               string
	ToolID                           string
	ArgumentsDigest                  string
	SelectedEventDigest              string
	NormalizedEventSetDigest         string
	NormalizedEventsBytes            []byte
	SelectedEventBytes               []byte
	RecordedAt                       time.Time
	RequestDigest                    string
	Value                            map[string]any
	Bytes                            []byte
}

type EvaluationCapabilityEffectCurrentTurnEventRecord struct {
	NamespaceID                      string
	PlanDigest                       string
	RepositoryCommit                 string
	AttemptID                        string
	DescriptorDigest                 string
	TurnIndex                        int64
	InvocationID                     string
	RequestRefAuthorityReceiptDigest string
	RequestRef                       string
	TargetRef                        string
	ProviderRequestDigest            string
	ResponseDigest                   string
	DispatchIntentDigest             string
	TransportReceiptDigest           string
	ResultSpoolReceiptDigest         string
	NormalizedEventSetDigest         string
	SelectedEventDigest              string
	ProviderToolCallID               string
	ToolID                           string
	ArgumentsDigest                  string
	RecordedAt                       time.Time
	ReceiptDigest                    string
	NormalizedEventsBytes            []byte
	SelectedEventBytes               []byte
	ReceiptBytes                     []byte
}

type evaluationCapabilityEffectInputRegistryRequest struct {
	NamespaceID                      string
	PlanDigest                       string
	RepositoryCommit                 string
	RequestRefAuthorityReceiptDigest string
	RequestRef                       string
	TargetRef                        string
	RequestedAt                      time.Time
	RequestDigest                    string
	Value                            map[string]any
	Bytes                            []byte
}

type EvaluationCapabilityEffectInputRegistryRecord struct {
	NamespaceID                      string
	PlanDigest                       string
	RepositoryCommit                 string
	RequestRefAuthorityReceiptDigest string
	RequestRef                       string
	TargetRef                        string
	BindingKind                      string
	SourceAttemptID                  string
	SourceTurnIndex                  int64
	SourceInvocationID               string
	SourceObservationReceiptDigest   string
	SourceHandleDigest               string
	ReceiptDigest                    string
	ReceiptBytes                     []byte
}

func evaluationCapabilityEffectRequestRef(bindingKind, authorityDigest string) (string, error) {
	if _, ok := evaluationCapabilityEffectInputProfiles[bindingKind]; !ok ||
		!evaluationDigestPattern.MatchString(authorityDigest) {
		return "", ErrInvalid
	}
	return fmt.Sprintf("capability-effect-ref.%s.%s", bindingKind, strings.TrimPrefix(authorityDigest, "sha256-")), nil
}

func decodeEvaluationCapabilityEffectRequestRefAuthorityRequest(
	source []byte,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (evaluationCapabilityEffectRequestRefAuthorityRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "descriptor", "turnIndex", "invocationId", "bindingKind", "capabilityId",
		"toolId", "targetRef", "protocolFamily", "providerConfigurationId", "modelLineageDigest",
		"adapterDigest", "runtimeFactSourceAuthorityDigest", "registrationReceiptDigest",
		"issuedAt", "expiresAt", "requestDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectRequestRefAuthorityRequestFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		stringMember(value, "planDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit ||
		!validEvaluationAgentControlIdentity(stringMember(value, "attemptId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "invocationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "targetRef")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "providerConfigurationId")) ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions") ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationCapabilityEffectRequestRefAuthorityRequest{}, ErrInvalid
	}
	profile, profileOK := evaluationCapabilityEffectInputProfiles[stringMember(value, "bindingKind")]
	version, versionOK := integerMember(value, "version")
	turnIndex, turnOK := integerMember(value, "turnIndex")
	issuedAt, issuedErr := parseEvaluationServiceInstant(stringMember(value, "issuedAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(value, "expiresAt"))
	descriptorBytes, descriptorErr := canonicaljson.Bytes(value["descriptor"])
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !profileOK || profile.CapabilityID != stringMember(value, "capabilityId") ||
		profile.ToolID != stringMember(value, "toolId") || !versionOK ||
		version != evaluationCapabilityEffectInputAuthorityVersion || !turnOK || turnIndex < 0 || turnIndex >= 7 ||
		issuedErr != nil || expiresErr != nil || !expiresAt.After(issuedAt) ||
		expiresAt.Sub(issuedAt) > maximumEvaluationCapabilityEffectRequestRefLifetime ||
		descriptorErr != nil || len(descriptorBytes) == 0 || digestErr != nil || digest != stringMember(value, "requestDigest") {
		return evaluationCapabilityEffectRequestRefAuthorityRequest{}, ErrConflict
	}
	for _, field := range []string{
		"descriptorDigest", "modelLineageDigest", "adapterDigest", "runtimeFactSourceAuthorityDigest",
		"registrationReceiptDigest", "requestDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationCapabilityEffectRequestRefAuthorityRequest{}, ErrInvalid
		}
	}
	return evaluationCapabilityEffectRequestRefAuthorityRequest{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		DescriptorBytes: descriptorBytes, TurnIndex: turnIndex, InvocationID: stringMember(value, "invocationId"),
		BindingKind: stringMember(value, "bindingKind"), CapabilityID: stringMember(value, "capabilityId"),
		ToolID: stringMember(value, "toolId"), TargetRef: stringMember(value, "targetRef"),
		ProtocolFamily: stringMember(value, "protocolFamily"), ProviderConfigurationID: stringMember(value, "providerConfigurationId"),
		ModelLineageDigest: stringMember(value, "modelLineageDigest"), AdapterDigest: stringMember(value, "adapterDigest"),
		RuntimeFactSourceAuthorityDigest: stringMember(value, "runtimeFactSourceAuthorityDigest"),
		RegistrationReceiptDigest:        stringMember(value, "registrationReceiptDigest"), IssuedAt: issuedAt, ExpiresAt: expiresAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Bytes: append([]byte(nil), canonical...),
	}, nil
}

func createEvaluationCapabilityEffectRequestRefAuthorityReceipt(
	request evaluationCapabilityEffectRequestRefAuthorityRequest,
) (EvaluationCapabilityEffectRequestRefAuthorityRecord, error) {
	base := map[string]any{
		"format":      evaluationCapabilityEffectRequestRefAuthorityReceiptFormat,
		"version":     evaluationCapabilityEffectInputAuthorityVersion,
		"namespaceId": request.NamespaceID, "planDigest": request.PlanDigest,
		"repositoryCommit": request.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "turnIndex": request.TurnIndex,
		"invocationId": request.InvocationID, "bindingKind": request.BindingKind,
		"capabilityId": request.CapabilityID, "toolId": request.ToolID, "targetRef": request.TargetRef,
		"protocolFamily": request.ProtocolFamily, "providerConfigurationId": request.ProviderConfigurationID,
		"modelLineageDigest": request.ModelLineageDigest, "adapterDigest": request.AdapterDigest,
		"runtimeFactSourceAuthorityDigest": request.RuntimeFactSourceAuthorityDigest,
		"registrationReceiptDigest":        request.RegistrationReceiptDigest,
		"issuedAt":                         evaluationExportInstant(request.IssuedAt), "expiresAt": evaluationExportInstant(request.ExpiresAt),
	}
	authorityDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, err
	}
	requestRef, err := evaluationCapabilityEffectRequestRef(request.BindingKind, authorityDigest)
	if err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, err
	}
	receiptBase := cloneEvaluationObject(base)
	receiptBase["authorityDigest"], receiptBase["requestRef"] = authorityDigest, requestRef
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, err
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["receiptDigest"] = receiptDigest
	receiptBytes, err := canonicaljson.Bytes(receipt)
	if err != nil || len(receiptBytes) > maximumEvaluationCapabilityEffectInputAuthorityBytes {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, ErrInvalid
	}
	return EvaluationCapabilityEffectRequestRefAuthorityRecord{
		NamespaceID: request.NamespaceID, PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit,
		AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TurnIndex: request.TurnIndex,
		InvocationID: request.InvocationID, BindingKind: request.BindingKind, CapabilityID: request.CapabilityID,
		ToolID: request.ToolID, TargetRef: request.TargetRef, ProtocolFamily: request.ProtocolFamily,
		ProviderConfigurationID: request.ProviderConfigurationID, ModelLineageDigest: request.ModelLineageDigest,
		AdapterDigest: request.AdapterDigest, RuntimeFactSourceAuthorityDigest: request.RuntimeFactSourceAuthorityDigest,
		RegistrationReceiptDigest: request.RegistrationReceiptDigest, IssuedAt: request.IssuedAt, ExpiresAt: request.ExpiresAt,
		AuthorityDigest: authorityDigest, RequestRef: requestRef, ReceiptDigest: receiptDigest,
		RequestBytes: append([]byte(nil), request.Bytes...), ReceiptBytes: receiptBytes,
	}, nil
}

func decodeEvaluationCapabilityEffectRequestRefAuthorityReceipt(source []byte) (EvaluationCapabilityEffectRequestRefAuthorityRecord, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "invocationId", "bindingKind", "capabilityId", "toolId", "targetRef", "protocolFamily",
		"providerConfigurationId", "modelLineageDigest", "adapterDigest", "runtimeFactSourceAuthorityDigest",
		"registrationReceiptDigest", "issuedAt", "expiresAt", "authorityDigest", "requestRef", "receiptDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectRequestRefAuthorityReceiptFormat {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnOK := integerMember(value, "turnIndex")
	issuedAt, issuedErr := parseEvaluationServiceInstant(stringMember(value, "issuedAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(value, "expiresAt"))
	authorityBase := cloneEvaluationObject(value)
	delete(authorityBase, "authorityDigest")
	delete(authorityBase, "requestRef")
	delete(authorityBase, "receiptDigest")
	authorityDigest, authorityErr := canonicaljson.Digest(authorityBase)
	requestRef, refErr := evaluationCapabilityEffectRequestRef(stringMember(value, "bindingKind"), authorityDigest)
	receiptBase := cloneEvaluationObject(value)
	delete(receiptBase, "receiptDigest")
	receiptDigest, receiptErr := canonicaljson.Digest(receiptBase)
	profile, profileOK := evaluationCapabilityEffectInputProfiles[stringMember(value, "bindingKind")]
	if !versionOK || version != evaluationCapabilityEffectInputAuthorityVersion || !turnOK || turnIndex < 0 || turnIndex >= 7 ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions") ||
		issuedErr != nil || expiresErr != nil || !expiresAt.After(issuedAt) || expiresAt.Sub(issuedAt) > maximumEvaluationCapabilityEffectRequestRefLifetime ||
		authorityErr != nil || refErr != nil || receiptErr != nil || authorityDigest != stringMember(value, "authorityDigest") ||
		requestRef != stringMember(value, "requestRef") || receiptDigest != stringMember(value, "receiptDigest") || !profileOK ||
		profile.CapabilityID != stringMember(value, "capabilityId") || profile.ToolID != stringMember(value, "toolId") ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, ErrConflict
	}
	for _, field := range []string{"namespaceId", "attemptId", "invocationId", "toolId", "targetRef", "providerConfigurationId", "requestRef"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, ErrInvalid
		}
	}
	for _, field := range []string{"planDigest", "descriptorDigest", "modelLineageDigest", "adapterDigest", "runtimeFactSourceAuthorityDigest", "registrationReceiptDigest", "authorityDigest", "receiptDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, ErrInvalid
		}
	}
	return EvaluationCapabilityEffectRequestRefAuthorityRecord{
		NamespaceID: stringMember(value, "namespaceId"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), AttemptID: stringMember(value, "attemptId"),
		DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turnIndex,
		InvocationID: stringMember(value, "invocationId"), BindingKind: stringMember(value, "bindingKind"),
		CapabilityID: stringMember(value, "capabilityId"), ToolID: stringMember(value, "toolId"), TargetRef: stringMember(value, "targetRef"),
		ProtocolFamily: stringMember(value, "protocolFamily"), ProviderConfigurationID: stringMember(value, "providerConfigurationId"),
		ModelLineageDigest: stringMember(value, "modelLineageDigest"), AdapterDigest: stringMember(value, "adapterDigest"),
		RuntimeFactSourceAuthorityDigest: stringMember(value, "runtimeFactSourceAuthorityDigest"),
		RegistrationReceiptDigest:        stringMember(value, "registrationReceiptDigest"), IssuedAt: issuedAt, ExpiresAt: expiresAt,
		AuthorityDigest: authorityDigest, RequestRef: requestRef, ReceiptDigest: receiptDigest, ReceiptBytes: canonical,
	}, nil
}

func evaluationCapabilityEffectToolArgumentsDigest(requestRef, targetRef string) (string, error) {
	if !validEvaluationAgentControlIdentity(requestRef) || !validEvaluationAgentControlIdentity(targetRef) {
		return "", ErrInvalid
	}
	return canonicaljson.Digest(map[string]any{"requestRef": requestRef, "targetRef": targetRef})
}

func validateEvaluationCapabilityEffectRuntimeEvent(value any, invocationID string) (map[string]any, error) {
	event, ok := value.(map[string]any)
	durable, durableOK := objectMember(event, "durableEvent")
	if !ok || !durableOK || !exactEvaluationKeys(event, []string{"durableEvent", "payload"}) ||
		!exactEvaluationKeys(durable, []string{"eventId", "invocationId", "sequence", "type", "payloadDigest", "occurredAt", "eventDigest"}) ||
		stringMember(durable, "invocationId") != invocationID || !validEvaluationAgentControlIdentity(stringMember(durable, "eventId")) ||
		!oneOfString(stringMember(durable, "type"), "output-delta", "tool-call", "usage", "refusal", "safety-block", "truncation", "cancelled", "timed-out", "partial", "completed", "failed") {
		return nil, ErrInvalid
	}
	sequence, sequenceOK := integerMember(durable, "sequence")
	_, instantErr := parseEvaluationServiceInstant(stringMember(durable, "occurredAt"))
	payloadDigest, payloadErr := canonicaljson.Digest(event["payload"])
	durableBase := cloneEvaluationObject(durable)
	delete(durableBase, "eventDigest")
	eventDigest, eventErr := canonicaljson.Digest(durableBase)
	if !sequenceOK || sequence < 0 || instantErr != nil || payloadErr != nil || eventErr != nil ||
		payloadDigest != stringMember(durable, "payloadDigest") || eventDigest != stringMember(durable, "eventDigest") {
		return nil, ErrConflict
	}
	return event, nil
}

func evaluationCapabilityEffectToolCallPayload(
	value map[string]any,
) (providerToolCallID string, arguments map[string]any, ok bool) {
	if exactEvaluationKeys(value, []string{"itemId", "name", "arguments", "argumentsDigest"}) {
		providerToolCallID = stringMember(value, "itemId")
	} else if exactEvaluationKeys(value, []string{"id", "name", "arguments", "argumentsDigest"}) {
		providerToolCallID = stringMember(value, "id")
	} else {
		return "", nil, false
	}
	arguments, ok = objectMember(value, "arguments")
	return providerToolCallID, arguments, ok
}

func decodeEvaluationCapabilityEffectCurrentTurnEventRequest(
	source []byte,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (evaluationCapabilityEffectCurrentTurnEventRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectCurrentTurnEventBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "invocationId", "requestRefAuthorityReceiptDigest", "requestRef", "targetRef",
		"providerToolCallId", "toolId", "argumentsDigest", "selectedEventDigest", "normalizedEvents",
		"normalizedEventSetDigest", "recordedAt", "requestDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectCurrentTurnEventRequestFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID || stringMember(value, "planDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit || agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationCapabilityEffectCurrentTurnEventRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnOK := integerMember(value, "turnIndex")
	recordedAt, recordedErr := parseEvaluationServiceInstant(stringMember(value, "recordedAt"))
	events, eventsOK := value["normalizedEvents"].([]any)
	eventsBytes, eventsBytesErr := canonicaljson.Bytes(events)
	eventSetDigest, setErr := canonicaljson.Digest(events)
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	requestDigest, requestDigestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationCapabilityEffectInputAuthorityVersion || !turnOK || turnIndex < 0 || turnIndex >= 7 ||
		recordedErr != nil || !eventsOK || len(events) == 0 || len(events) > 10_000 || eventsBytesErr != nil ||
		len(eventsBytes) > maximumEvaluationCapabilityEffectNormalizedEventSetBytes || setErr != nil ||
		eventSetDigest != stringMember(value, "normalizedEventSetDigest") || requestDigestErr != nil ||
		requestDigest != stringMember(value, "requestDigest") {
		return evaluationCapabilityEffectCurrentTurnEventRequest{}, ErrConflict
	}
	selectedDigest := stringMember(value, "selectedEventDigest")
	var selected map[string]any
	previousSequence := int64(-1)
	for _, raw := range events {
		event, eventErr := validateEvaluationCapabilityEffectRuntimeEvent(raw, stringMember(value, "invocationId"))
		if eventErr != nil {
			return evaluationCapabilityEffectCurrentTurnEventRequest{}, eventErr
		}
		durable, _ := objectMember(event, "durableEvent")
		sequence, _ := integerMember(durable, "sequence")
		if sequence != previousSequence+1 {
			return evaluationCapabilityEffectCurrentTurnEventRequest{}, ErrConflict
		}
		previousSequence = sequence
		if stringMember(durable, "eventDigest") == selectedDigest {
			if selected != nil {
				return evaluationCapabilityEffectCurrentTurnEventRequest{}, ErrConflict
			}
			selected = event
		}
	}
	if selected == nil {
		return evaluationCapabilityEffectCurrentTurnEventRequest{}, ErrConflict
	}
	durable, _ := objectMember(selected, "durableEvent")
	payload, payloadOK := objectMember(selected, "payload")
	providerToolCallID, arguments, argumentsOK := evaluationCapabilityEffectToolCallPayload(payload)
	argumentsDigest, argumentsErr := evaluationCapabilityEffectToolArgumentsDigest(
		stringMember(value, "requestRef"), stringMember(value, "targetRef"),
	)
	selectedBytes, selectedBytesErr := canonicaljson.Bytes(selected)
	if stringMember(durable, "type") != "tool-call" || !payloadOK || !argumentsOK ||
		!exactEvaluationKeys(arguments, []string{"requestRef", "targetRef"}) ||
		stringMember(arguments, "requestRef") != stringMember(value, "requestRef") ||
		stringMember(arguments, "targetRef") != stringMember(value, "targetRef") ||
		providerToolCallID != stringMember(value, "providerToolCallId") ||
		stringMember(value, "toolId") != "provider.retrieval.search" ||
		stringMember(payload, "name") != stringMember(value, "toolId") ||
		stringMember(payload, "argumentsDigest") != argumentsDigest || stringMember(value, "argumentsDigest") != argumentsDigest ||
		argumentsErr != nil || selectedBytesErr != nil {
		return evaluationCapabilityEffectCurrentTurnEventRequest{}, ErrConflict
	}
	for _, field := range []string{"attemptId", "invocationId", "requestRef", "targetRef", "providerToolCallId", "toolId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationCapabilityEffectCurrentTurnEventRequest{}, ErrInvalid
		}
	}
	for _, field := range []string{"descriptorDigest", "requestRefAuthorityReceiptDigest", "argumentsDigest", "selectedEventDigest", "normalizedEventSetDigest", "requestDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationCapabilityEffectCurrentTurnEventRequest{}, ErrInvalid
		}
	}
	return evaluationCapabilityEffectCurrentTurnEventRequest{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turnIndex,
		InvocationID: stringMember(value, "invocationId"), RequestRefAuthorityReceiptDigest: stringMember(value, "requestRefAuthorityReceiptDigest"),
		RequestRef: stringMember(value, "requestRef"), TargetRef: stringMember(value, "targetRef"),
		ProviderToolCallID: stringMember(value, "providerToolCallId"), ToolID: stringMember(value, "toolId"),
		ArgumentsDigest: stringMember(value, "argumentsDigest"), SelectedEventDigest: selectedDigest,
		NormalizedEventSetDigest: stringMember(value, "normalizedEventSetDigest"), NormalizedEventsBytes: eventsBytes,
		SelectedEventBytes: selectedBytes, RecordedAt: recordedAt, RequestDigest: stringMember(value, "requestDigest"),
		Value: value, Bytes: append([]byte(nil), canonical...),
	}, nil
}

func createEvaluationCapabilityEffectCurrentTurnEventReceipt(
	request evaluationCapabilityEffectCurrentTurnEventRequest,
	providerRequestDigest, responseDigest, dispatchDigest, transportDigest, spoolDigest string,
) (EvaluationCapabilityEffectCurrentTurnEventRecord, error) {
	base := map[string]any{
		"format": evaluationCapabilityEffectCurrentTurnEventReceiptFormat, "version": evaluationCapabilityEffectInputAuthorityVersion,
		"namespaceId": request.NamespaceID, "planDigest": request.PlanDigest, "repositoryCommit": request.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest, "turnIndex": request.TurnIndex,
		"invocationId": request.InvocationID, "requestRefAuthorityReceiptDigest": request.RequestRefAuthorityReceiptDigest,
		"requestRef": request.RequestRef, "targetRef": request.TargetRef, "providerRequestDigest": providerRequestDigest,
		"responseDigest": responseDigest, "dispatchIntentDigest": dispatchDigest, "transportReceiptDigest": transportDigest,
		"resultSpoolReceiptDigest": spoolDigest, "normalizedEventSetDigest": request.NormalizedEventSetDigest,
		"selectedEventDigest": request.SelectedEventDigest, "providerToolCallId": request.ProviderToolCallID,
		"toolId": request.ToolID, "argumentsDigest": request.ArgumentsDigest, "recordedAt": evaluationExportInstant(request.RecordedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, err
	}
	receipt := cloneEvaluationObject(base)
	receipt["receiptDigest"] = digest
	bytes, err := canonicaljson.Bytes(receipt)
	if err != nil || len(bytes) > maximumEvaluationCapabilityEffectInputAuthorityBytes {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, ErrInvalid
	}
	return EvaluationCapabilityEffectCurrentTurnEventRecord{
		NamespaceID: request.NamespaceID, PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit,
		AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TurnIndex: request.TurnIndex,
		InvocationID: request.InvocationID, RequestRefAuthorityReceiptDigest: request.RequestRefAuthorityReceiptDigest,
		RequestRef: request.RequestRef, TargetRef: request.TargetRef, ProviderRequestDigest: providerRequestDigest,
		ResponseDigest: responseDigest, DispatchIntentDigest: dispatchDigest, TransportReceiptDigest: transportDigest,
		ResultSpoolReceiptDigest: spoolDigest, NormalizedEventSetDigest: request.NormalizedEventSetDigest,
		SelectedEventDigest: request.SelectedEventDigest, ProviderToolCallID: request.ProviderToolCallID,
		ToolID: request.ToolID, ArgumentsDigest: request.ArgumentsDigest, RecordedAt: request.RecordedAt,
		ReceiptDigest: digest, NormalizedEventsBytes: append([]byte(nil), request.NormalizedEventsBytes...),
		SelectedEventBytes: append([]byte(nil), request.SelectedEventBytes...), ReceiptBytes: bytes,
	}, nil
}

func decodeEvaluationCapabilityEffectInputRegistryRequest(
	source []byte,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (evaluationCapabilityEffectInputRegistryRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "requestRefAuthorityReceiptDigest",
		"requestRef", "targetRef", "requestedAt", "requestDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectInputRegistryRequestFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID || stringMember(value, "planDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit ||
		!validEvaluationAgentControlIdentity(stringMember(value, "requestRef")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "targetRef")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "requestRefAuthorityReceiptDigest")) ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationCapabilityEffectInputRegistryRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	requestedAt, requestedErr := parseEvaluationServiceInstant(stringMember(value, "requestedAt"))
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationCapabilityEffectInputAuthorityVersion || requestedErr != nil || digestErr != nil ||
		digest != stringMember(value, "requestDigest") {
		return evaluationCapabilityEffectInputRegistryRequest{}, ErrConflict
	}
	return evaluationCapabilityEffectInputRegistryRequest{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		RequestRefAuthorityReceiptDigest: stringMember(value, "requestRefAuthorityReceiptDigest"),
		RequestRef:                       stringMember(value, "requestRef"), TargetRef: stringMember(value, "targetRef"),
		RequestedAt: requestedAt, RequestDigest: stringMember(value, "requestDigest"), Value: value,
		Bytes: append([]byte(nil), canonical...),
	}, nil
}

func createEvaluationCapabilityEffectInputRegistryReceipt(
	requestRef EvaluationCapabilityEffectRequestRefAuthorityRecord,
	source map[string]any,
) (EvaluationCapabilityEffectInputRegistryRecord, error) {
	base := map[string]any{
		"format": evaluationCapabilityEffectInputRegistryReceiptFormat, "version": evaluationCapabilityEffectInputAuthorityVersion,
		"bindingKind": requestRef.BindingKind, "capabilityId": requestRef.CapabilityID,
		"requestRef": requestRef.RequestRef, "targetRef": requestRef.TargetRef,
		"requestRefAuthority":              source["requestRefAuthority"],
		"requestRefAuthorityReceiptDigest": requestRef.ReceiptDigest,
		"sourceAttemptId":                  source["sourceAttemptId"], "sourceTurnIndex": source["sourceTurnIndex"],
		"sourceInvocationId": source["sourceInvocationId"], "sourceProviderRequestDigest": source["sourceProviderRequestDigest"],
		"sourceResponseDigest": source["sourceResponseDigest"], "sourceDispatchIntentDigest": source["sourceDispatchIntentDigest"],
		"sourceTransportReceiptDigest":   source["sourceTransportReceiptDigest"],
		"sourceResultSpoolReceiptDigest": source["sourceResultSpoolReceiptDigest"],
		"sourceNormalizedEventSetDigest": source["sourceNormalizedEventSetDigest"],
		"sourceObservationReceiptDigest": source["sourceObservationReceiptDigest"],
		"sourceFactKind":                 source["sourceFactKind"], "sourceProviderEventType": source["sourceProviderEventType"],
		"sourceProviderToolCallId": source["sourceProviderToolCallId"], "sourceToolId": source["sourceToolId"],
		"sourceArgumentsDigest": source["sourceArgumentsDigest"], "sourceHandleDigest": source["sourceHandleDigest"],
		"stateVaultSealRequest": source["stateVaultSealRequest"], "stateVaultSealReceipt": source["stateVaultSealReceipt"],
		"protocolFamily": requestRef.ProtocolFamily, "providerConfigurationId": requestRef.ProviderConfigurationID,
		"modelLineageDigest": requestRef.ModelLineageDigest, "adapterDigest": requestRef.AdapterDigest,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, err
	}
	receipt := cloneEvaluationObject(base)
	receipt["receiptDigest"] = digest
	receiptBytes, err := canonicaljson.Bytes(receipt)
	if err != nil || len(receiptBytes) > maximumEvaluationCapabilityEffectInputAuthorityBytes ||
		agentcontract.ValidateSanitizedAgentPayload(receipt) != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, ErrInvalid
	}
	sourceObservationDigest := ""
	if source["sourceObservationReceiptDigest"] != nil {
		sourceObservationDigest = stringMember(source, "sourceObservationReceiptDigest")
	}
	sourceTurnIndex, turnOK := evaluationCapabilityProbeNonnegativeInteger(source["sourceTurnIndex"])
	if !turnOK {
		return EvaluationCapabilityEffectInputRegistryRecord{}, ErrInvalid
	}
	return EvaluationCapabilityEffectInputRegistryRecord{
		NamespaceID: requestRef.NamespaceID, PlanDigest: requestRef.PlanDigest, RepositoryCommit: requestRef.RepositoryCommit,
		RequestRefAuthorityReceiptDigest: requestRef.ReceiptDigest, RequestRef: requestRef.RequestRef, TargetRef: requestRef.TargetRef,
		BindingKind: requestRef.BindingKind, SourceAttemptID: stringMember(source, "sourceAttemptId"), SourceTurnIndex: sourceTurnIndex,
		SourceInvocationID: stringMember(source, "sourceInvocationId"), SourceObservationReceiptDigest: sourceObservationDigest,
		SourceHandleDigest: stringMember(source, "sourceHandleDigest"), ReceiptDigest: digest, ReceiptBytes: receiptBytes,
	}, nil
}

func decodeEvaluationCapabilityEffectInputRegistryReceipt(
	source []byte,
) (EvaluationCapabilityEffectInputRegistryRecord, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "bindingKind", "capabilityId", "requestRef", "targetRef",
		"requestRefAuthority", "requestRefAuthorityReceiptDigest", "sourceAttemptId", "sourceTurnIndex",
		"sourceInvocationId", "sourceProviderRequestDigest", "sourceResponseDigest", "sourceDispatchIntentDigest",
		"sourceTransportReceiptDigest", "sourceResultSpoolReceiptDigest", "sourceNormalizedEventSetDigest",
		"sourceObservationReceiptDigest", "sourceFactKind", "sourceProviderEventType", "sourceProviderToolCallId",
		"sourceToolId", "sourceArgumentsDigest", "sourceHandleDigest", "stateVaultSealRequest", "stateVaultSealReceipt", "protocolFamily",
		"providerConfigurationId", "modelLineageDigest", "adapterDigest", "receiptDigest",
	}) || stringMember(value, "format") != evaluationCapabilityEffectInputRegistryReceiptFormat {
		return EvaluationCapabilityEffectInputRegistryRecord{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnOK := integerMember(value, "sourceTurnIndex")
	authorityValue, authorityOK := objectMember(value, "requestRefAuthority")
	authorityBytes, authorityBytesErr := canonicaljson.Bytes(authorityValue)
	authorityRecord, authorityErr := decodeEvaluationCapabilityEffectRequestRefAuthorityReceipt(authorityBytes)
	base := cloneEvaluationObject(value)
	delete(base, "receiptDigest")
	receiptDigest, digestErr := canonicaljson.Digest(base)
	profile, profileOK := evaluationCapabilityEffectInputProfiles[stringMember(value, "bindingKind")]
	if !versionOK || version != evaluationCapabilityEffectInputAuthorityVersion || !turnOK || turnIndex < 0 || turnIndex >= 7 ||
		!authorityOK || authorityBytesErr != nil || authorityErr != nil || !profileOK ||
		profile.CapabilityID != stringMember(value, "capabilityId") || profile.SourceFactKind != stringMember(value, "sourceFactKind") ||
		stringMember(value, "requestRef") != authorityRecord.RequestRef || stringMember(value, "targetRef") != authorityRecord.TargetRef ||
		stringMember(value, "requestRefAuthorityReceiptDigest") != authorityRecord.ReceiptDigest ||
		stringMember(value, "sourceAttemptId") != authorityRecord.AttemptID ||
		stringMember(value, "protocolFamily") != authorityRecord.ProtocolFamily ||
		stringMember(value, "providerConfigurationId") != authorityRecord.ProviderConfigurationID ||
		stringMember(value, "modelLineageDigest") != authorityRecord.ModelLineageDigest ||
		stringMember(value, "adapterDigest") != authorityRecord.AdapterDigest ||
		digestErr != nil || receiptDigest != stringMember(value, "receiptDigest") ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, ErrConflict
	}
	for _, field := range []string{"requestRef", "targetRef", "sourceAttemptId", "sourceInvocationId", "providerConfigurationId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return EvaluationCapabilityEffectInputRegistryRecord{}, ErrInvalid
		}
	}
	for _, field := range []string{
		"requestRefAuthorityReceiptDigest", "sourceProviderRequestDigest", "sourceResponseDigest",
		"sourceDispatchIntentDigest", "sourceTransportReceiptDigest", "sourceResultSpoolReceiptDigest",
		"sourceNormalizedEventSetDigest", "sourceHandleDigest", "modelLineageDigest", "adapterDigest", "receiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return EvaluationCapabilityEffectInputRegistryRecord{}, ErrInvalid
		}
	}
	observationDigest := ""
	if value["sourceObservationReceiptDigest"] != nil {
		observationDigest = stringMember(value, "sourceObservationReceiptDigest")
		if !evaluationDigestPattern.MatchString(observationDigest) {
			return EvaluationCapabilityEffectInputRegistryRecord{}, ErrInvalid
		}
	}
	stateVaultRequired := oneOfString(stringMember(value, "bindingKind"), "provider-job", "opaque-continuation")
	stateVaultRequestValue, stateVaultRequestPresent := objectMember(value, "stateVaultSealRequest")
	stateVaultReceiptValue, stateVaultReceiptPresent := objectMember(value, "stateVaultSealReceipt")
	if stateVaultRequired {
		if !stateVaultRequestPresent || !stateVaultReceiptPresent {
			return EvaluationCapabilityEffectInputRegistryRecord{}, ErrConflict
		}
		stateVaultRequestBytes, requestBytesErr := canonicaljson.Bytes(stateVaultRequestValue)
		stateVaultReceiptBytes, receiptBytesErr := canonicaljson.Bytes(stateVaultReceiptValue)
		stateVaultRequest, requestErr := decodeEvaluationNativeProviderStateVaultSealRequest(stateVaultRequestBytes)
		stateVaultReceipt, receiptErr := decodeEvaluationNativeProviderStateVaultSealReceipt(
			stateVaultReceiptBytes, stateVaultRequest,
		)
		expectedPurpose := "background-job-state"
		if stringMember(value, "bindingKind") == "opaque-continuation" {
			expectedPurpose = "reasoning-continuation-state"
		}
		if requestBytesErr != nil || receiptBytesErr != nil || requestErr != nil || receiptErr != nil ||
			stateVaultReceipt.Status != "sealed" || stateVaultRequest.Purpose != expectedPurpose ||
			stateVaultRequest.AttemptID != stringMember(value, "sourceAttemptId") ||
			stateVaultRequest.InvocationID != stringMember(value, "sourceInvocationId") ||
			stateVaultRequest.RequestDigest != stringMember(value, "sourceProviderRequestDigest") ||
			stateVaultRequest.ResponseDigest != stringMember(value, "sourceResponseDigest") ||
			stateVaultRequest.ProtocolFamily != stringMember(value, "protocolFamily") ||
			stateVaultRequest.ProviderConfigurationID != stringMember(value, "providerConfigurationId") ||
			stateVaultRequest.ModelLineageDigest != stringMember(value, "modelLineageDigest") ||
			stateVaultRequest.AdapterDigest != stringMember(value, "adapterDigest") {
			return EvaluationCapabilityEffectInputRegistryRecord{}, ErrConflict
		}
	} else if stateVaultRequestPresent || stateVaultReceiptPresent ||
		value["stateVaultSealRequest"] != nil || value["stateVaultSealReceipt"] != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, ErrConflict
	}
	if stringMember(value, "bindingKind") == "hosted-retrieval-query" {
		if observationDigest != "" || turnIndex != authorityRecord.TurnIndex ||
			stringMember(value, "sourceInvocationId") != authorityRecord.InvocationID ||
			stringMember(value, "sourceProviderEventType") != "tool-call" ||
			!validEvaluationAgentControlIdentity(stringMember(value, "sourceProviderToolCallId")) ||
			stringMember(value, "sourceToolId") != profile.ToolID ||
			!evaluationDigestPattern.MatchString(stringMember(value, "sourceArgumentsDigest")) {
			return EvaluationCapabilityEffectInputRegistryRecord{}, ErrConflict
		}
	} else if observationDigest == "" || turnIndex >= authorityRecord.TurnIndex ||
		value["sourceProviderEventType"] != nil || value["sourceProviderToolCallId"] != nil ||
		value["sourceToolId"] != nil || value["sourceArgumentsDigest"] != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, ErrConflict
	}
	return EvaluationCapabilityEffectInputRegistryRecord{
		NamespaceID: authorityRecord.NamespaceID, PlanDigest: authorityRecord.PlanDigest,
		RepositoryCommit:                 authorityRecord.RepositoryCommit,
		RequestRefAuthorityReceiptDigest: authorityRecord.ReceiptDigest, RequestRef: authorityRecord.RequestRef,
		TargetRef: authorityRecord.TargetRef, BindingKind: authorityRecord.BindingKind,
		SourceAttemptID: stringMember(value, "sourceAttemptId"), SourceTurnIndex: turnIndex,
		SourceInvocationID: stringMember(value, "sourceInvocationId"), SourceObservationReceiptDigest: observationDigest,
		SourceHandleDigest: stringMember(value, "sourceHandleDigest"), ReceiptDigest: receiptDigest,
		ReceiptBytes: append([]byte(nil), canonical...),
	}, nil
}

func decodeEvaluationCapabilityEffectReceiptValue(source json.RawMessage) (map[string]any, error) {
	return decodeCanonicalEvaluationObject(source, maximumEvaluationCapabilityEffectInputAuthorityBytes)
}
