package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationCapabilityEffectInputAuthorityTestRepository struct {
	*evaluationServiceFakeRepository
	requestRef         EvaluationCapabilityEffectRequestRefAuthorityRecord
	currentEvent       EvaluationCapabilityEffectCurrentTurnEventRecord
	registry           EvaluationCapabilityEffectInputRegistryRecord
	requestRefReplay   bool
	currentEventReplay bool
	registryReplay     bool
	err                error
	calls              []string
}

func (repository *evaluationCapabilityEffectInputAuthorityTestRepository) StoreEvaluationCapabilityEffectRequestRefAuthority(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	input evaluationCapabilityEffectRequestRefAuthorityRequest,
	_ time.Time,
) (EvaluationCapabilityEffectRequestRefAuthorityRecord, bool, error) {
	repository.calls = append(repository.calls, "request-ref")
	if repository.err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, repository.err
	}
	if repository.requestRef.ReceiptDigest == "" {
		record, err := createEvaluationCapabilityEffectRequestRefAuthorityReceipt(input)
		return record, repository.requestRefReplay, err
	}
	return repository.requestRef, repository.requestRefReplay, nil
}

func (repository *evaluationCapabilityEffectInputAuthorityTestRepository) StoreEvaluationCapabilityEffectCurrentTurnEvent(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	input evaluationCapabilityEffectCurrentTurnEventRequest,
) (EvaluationCapabilityEffectCurrentTurnEventRecord, bool, error) {
	repository.calls = append(repository.calls, "current-event")
	if repository.err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, repository.err
	}
	if repository.currentEvent.ReceiptDigest == "" || repository.currentEvent.RequestRef != input.RequestRef {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, ErrConflict
	}
	return repository.currentEvent, repository.currentEventReplay, nil
}

func (repository *evaluationCapabilityEffectInputAuthorityTestRepository) ResolveEvaluationCapabilityEffectInputAuthority(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ evaluationCapabilityEffectInputRegistryRequest,
) (EvaluationCapabilityEffectInputRegistryRecord, bool, error) {
	repository.calls = append(repository.calls, "resolve")
	if repository.err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, repository.err
	}
	return repository.registry, repository.registryReplay, nil
}

func evaluationCapabilityEffectInputAuthorityFixture(
	t *testing.T,
	bindingKind string,
	turnIndex int64,
) (evaluationPlanFact, evaluationCapabilityEffectRequestRefAuthorityRequest, EvaluationCapabilityEffectRequestRefAuthorityRecord) {
	t.Helper()
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatalf("decode plan fixture: %v", err)
	}
	attempt, err := decodeEvaluationAttempt(vector.Facts.Attempt)
	if err != nil {
		t.Fatalf("decode attempt fixture: %v", err)
	}
	descriptor := attempt.Value["descriptor"].(map[string]any)
	descriptorBytes, err := canonicaljson.Bytes(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	var target map[string]any
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		candidate := raw.(map[string]any)
		if stringMember(candidate, "targetId") == attempt.TargetID {
			target = candidate
			break
		}
	}
	optional, _ := objectMember(target, "optionalCapabilitySupportAuthority")
	runtimeAuthority, _ := objectMember(optional, "runtimeFactSourceAuthority")
	profile := evaluationCapabilityEffectInputProfiles[bindingKind]
	issuedAt := plan.PlannedAt.Add(time.Hour).UTC().Truncate(time.Millisecond)
	base := map[string]any{
		"format":      evaluationCapabilityEffectRequestRefAuthorityRequestFormat,
		"version":     evaluationCapabilityEffectInputAuthorityVersion,
		"namespaceId": evaluationServiceTestNamespace, "planDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "attemptId": attempt.AttemptID,
		"descriptorDigest": attempt.DescriptorDigest, "descriptor": descriptor,
		"turnIndex": turnIndex, "invocationId": "invocation/capability-effect/test",
		"bindingKind": bindingKind, "capabilityId": profile.CapabilityID, "toolId": profile.ToolID,
		"targetRef":                        evaluationServiceTestDigest(t, "target-ref"),
		"protocolFamily":                   stringMember(target, "protocolFamily"),
		"providerConfigurationId":          stringMember(target, "providerConfigurationId"),
		"modelLineageDigest":               stringMember(target, "modelLineageDigest"),
		"adapterDigest":                    stringMember(runtimeAuthority, "adapterDigest"),
		"runtimeFactSourceAuthorityDigest": stringMember(runtimeAuthority, "authorityDigest"),
		"registrationReceiptDigest":        stringMember(runtimeAuthority, "registrationReceiptDigest"),
		"issuedAt":                         evaluationExportInstant(issuedAt), "expiresAt": evaluationExportInstant(issuedAt.Add(125 * time.Second)),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["requestDigest"] = digest
	requestBytes, err := canonicaljson.Bytes(base)
	if err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationCapabilityEffectRequestRefAuthorityRequest(
		requestBytes,
		EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: evaluationServiceTestNamespace},
		EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
	)
	if err != nil {
		t.Fatalf("decode request-ref fixture: %v", err)
	}
	request.DescriptorBytes = descriptorBytes
	receipt, err := createEvaluationCapabilityEffectRequestRefAuthorityReceipt(request)
	if err != nil {
		t.Fatalf("create request-ref fixture receipt: %v", err)
	}
	return plan, request, receipt
}

func evaluationCapabilityEffectCurrentTurnEventFixture(
	t *testing.T,
	requestRef EvaluationCapabilityEffectRequestRefAuthorityRecord,
) (evaluationCapabilityEffectCurrentTurnEventRequest, EvaluationCapabilityEffectCurrentTurnEventRecord) {
	t.Helper()
	arguments := map[string]any{"requestRef": requestRef.RequestRef, "targetRef": requestRef.TargetRef}
	argumentsDigest, _ := canonicaljson.Digest(arguments)
	payload := map[string]any{
		"id": "provider-call/retrieval/test", "name": requestRef.ToolID,
		"arguments": arguments, "argumentsDigest": argumentsDigest,
	}
	if requestRef.ProtocolFamily == "openai-responses" {
		payload["itemId"] = payload["id"]
		delete(payload, "id")
	}
	payloadDigest, _ := canonicaljson.Digest(payload)
	durableBase := map[string]any{
		"eventId": "provider-event/retrieval/test", "invocationId": requestRef.InvocationID,
		"sequence": int64(0), "type": "tool-call", "payloadDigest": payloadDigest,
		"occurredAt": evaluationExportInstant(requestRef.IssuedAt.Add(time.Second)),
	}
	eventDigest, _ := canonicaljson.Digest(durableBase)
	durable := cloneEvaluationObject(durableBase)
	durable["eventDigest"] = eventDigest
	event := map[string]any{"durableEvent": durable, "payload": payload}
	events := []any{event}
	eventSetDigest, _ := canonicaljson.Digest(events)
	base := map[string]any{
		"format":      evaluationCapabilityEffectCurrentTurnEventRequestFormat,
		"version":     evaluationCapabilityEffectInputAuthorityVersion,
		"namespaceId": requestRef.NamespaceID, "planDigest": requestRef.PlanDigest,
		"repositoryCommit": requestRef.RepositoryCommit, "attemptId": requestRef.AttemptID,
		"descriptorDigest": requestRef.DescriptorDigest, "turnIndex": requestRef.TurnIndex,
		"invocationId": requestRef.InvocationID, "requestRefAuthorityReceiptDigest": requestRef.ReceiptDigest,
		"requestRef": requestRef.RequestRef, "targetRef": requestRef.TargetRef,
		"providerToolCallId": stringMember(payload, "id"), "toolId": requestRef.ToolID,
		"argumentsDigest": argumentsDigest, "selectedEventDigest": eventDigest,
		"normalizedEvents": events, "normalizedEventSetDigest": eventSetDigest,
		"recordedAt": evaluationExportInstant(requestRef.IssuedAt.Add(2 * time.Second)),
	}
	if requestRef.ProtocolFamily == "openai-responses" {
		base["providerToolCallId"] = stringMember(payload, "itemId")
	}
	digest, _ := canonicaljson.Digest(base)
	base["requestDigest"] = digest
	bytes, err := canonicaljson.Bytes(base)
	if err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationCapabilityEffectCurrentTurnEventRequest(
		bytes, EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: requestRef.NamespaceID},
		EvaluationPlanPartition{PlanDigest: requestRef.PlanDigest, RepositoryCommit: requestRef.RepositoryCommit},
	)
	if err != nil {
		t.Fatal(err)
	}
	record, err := createEvaluationCapabilityEffectCurrentTurnEventReceipt(
		request, evaluationServiceTestDigest(t, "provider-request"), evaluationServiceTestDigest(t, "provider-response"),
		evaluationServiceTestDigest(t, "dispatch"), evaluationServiceTestDigest(t, "transport"),
		evaluationServiceTestDigest(t, "spool"),
	)
	if err != nil {
		t.Fatal(err)
	}
	return request, record
}

func TestEvaluationCapabilityEffectInputAuthorityRoutesSealAndResolveCanonicalReceipts(t *testing.T) {
	plan, requestRefInput, requestRef := evaluationCapabilityEffectInputAuthorityFixture(t, "provider-cache", 1)
	requestRefAuthority, err := evaluationCapabilityEffectRequestRefAuthorityValue(requestRef)
	if err != nil {
		t.Fatal(err)
	}
	source := map[string]any{
		"requestRefAuthority": requestRefAuthority, "sourceAttemptId": requestRef.AttemptID,
		"sourceTurnIndex": int64(0), "sourceInvocationId": "invocation/source/cache",
		"sourceProviderRequestDigest":    evaluationServiceTestDigest(t, "source-request"),
		"sourceResponseDigest":           evaluationServiceTestDigest(t, "source-response"),
		"sourceDispatchIntentDigest":     evaluationServiceTestDigest(t, "source-dispatch"),
		"sourceTransportReceiptDigest":   evaluationServiceTestDigest(t, "source-transport"),
		"sourceResultSpoolReceiptDigest": evaluationServiceTestDigest(t, "source-spool"),
		"sourceNormalizedEventSetDigest": evaluationServiceTestDigest(t, "source-events"),
		"sourceObservationReceiptDigest": evaluationServiceTestDigest(t, "source-observation"),
		"sourceFactKind":                 "provider-cache-receipt", "sourceProviderEventType": nil,
		"sourceProviderToolCallId": nil, "sourceToolId": nil, "sourceArgumentsDigest": nil,
		"sourceHandleDigest": evaluationServiceTestDigest(t, "source-cache-fact"),
	}
	registry, err := createEvaluationCapabilityEffectInputRegistryReceipt(requestRef, source)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(registry.ReceiptBytes); err != nil {
		t.Fatalf("decode canonical prior-source registry receipt: %v", err)
	}
	repository := &evaluationCapabilityEffectInputAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		requestRef:                      requestRef, registry: registry,
	}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	request := authorizedEvaluationServiceRequest(http.MethodPost,
		evaluationServiceTestURL(plan, "capability-effect-request-ref-authorities"),
		bytesReader(requestRefInput.Bytes),
	)
	request.Header.Set("Idempotency-Key", requestRefInput.RequestDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("request-ref status=%d body=%s", response.Code, response.Body.String())
	}

	registryBase := map[string]any{
		"format":      evaluationCapabilityEffectInputRegistryRequestFormat,
		"version":     evaluationCapabilityEffectInputAuthorityVersion,
		"namespaceId": evaluationServiceTestNamespace, "planDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "requestRefAuthorityReceiptDigest": requestRef.ReceiptDigest,
		"requestRef": requestRef.RequestRef, "targetRef": requestRef.TargetRef,
		"requestedAt": evaluationExportInstant(requestRef.IssuedAt.Add(time.Second)),
	}
	registryDigest, _ := canonicaljson.Digest(registryBase)
	registryBase["requestDigest"] = registryDigest
	registryBytes, _ := canonicaljson.Bytes(registryBase)
	resolve := authorizedEvaluationServiceRequest(http.MethodPost,
		evaluationServiceTestURL(plan, "capability-effect-input-authorities/resolve"), bytesReader(registryBytes))
	resolve.Header.Set("Idempotency-Key", registryDigest)
	resolved := httptest.NewRecorder()
	handler.ServeHTTP(resolved, resolve)
	if resolved.Code != http.StatusOK || len(repository.calls) != 2 || repository.calls[1] != "resolve" {
		t.Fatalf("resolve status=%d calls=%v body=%s", resolved.Code, repository.calls, resolved.Body.String())
	}
	var public struct {
		Receipt json.RawMessage `json:"receipt"`
	}
	if err := json.Unmarshal(resolved.Body.Bytes(), &public); err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(public.Receipt)
	if err != nil || decoded.ReceiptDigest != registry.ReceiptDigest {
		t.Fatalf("resolved registry receipt drifted: %+v err=%v", decoded, err)
	}
}

func TestEvaluationCapabilityEffectCurrentTurnEventRejectsFullyRecomputedSyntheticPayload(t *testing.T) {
	_, _, requestRef := evaluationCapabilityEffectInputAuthorityFixture(t, "hosted-retrieval-query", 0)
	request, _ := evaluationCapabilityEffectCurrentTurnEventFixture(t, requestRef)
	value := cloneEvaluationObject(request.Value)
	events := value["normalizedEvents"].([]any)
	event := events[0].(map[string]any)
	payload := cloneEvaluationObject(event["payload"].(map[string]any))
	payload["syntheticSupported"] = true
	payloadDigest, _ := canonicaljson.Digest(payload)
	durable := cloneEvaluationObject(event["durableEvent"].(map[string]any))
	durable["payloadDigest"] = payloadDigest
	delete(durable, "eventDigest")
	durable["eventDigest"], _ = canonicaljson.Digest(durable)
	tamperedEvent := map[string]any{"durableEvent": durable, "payload": payload}
	tamperedEvents := []any{tamperedEvent}
	value["normalizedEvents"] = tamperedEvents
	value["selectedEventDigest"] = durable["eventDigest"]
	value["normalizedEventSetDigest"], _ = canonicaljson.Digest(tamperedEvents)
	delete(value, "requestDigest")
	value["requestDigest"], _ = canonicaljson.Digest(value)
	bytes, _ := canonicaljson.Bytes(value)
	if _, err := decodeEvaluationCapabilityEffectCurrentTurnEventRequest(
		bytes, EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: requestRef.NamespaceID},
		EvaluationPlanPartition{PlanDigest: requestRef.PlanDigest, RepositoryCommit: requestRef.RepositoryCommit},
	); err == nil {
		t.Fatal("fully recomputed synthetic tool-call payload was accepted")
	}
}

func TestEvaluationCapabilityEffectCurrentTurnEventRejectsFullyRecomputedToolNameSwap(t *testing.T) {
	_, _, requestRef := evaluationCapabilityEffectInputAuthorityFixture(t, "hosted-retrieval-query", 0)
	request, _ := evaluationCapabilityEffectCurrentTurnEventFixture(t, requestRef)
	value := cloneEvaluationObject(request.Value)
	events := value["normalizedEvents"].([]any)
	event := events[0].(map[string]any)
	payload := cloneEvaluationObject(event["payload"].(map[string]any))
	payload["name"] = "provider.retrieval.forged"
	payloadDigest, _ := canonicaljson.Digest(payload)
	durable := cloneEvaluationObject(event["durableEvent"].(map[string]any))
	durable["payloadDigest"] = payloadDigest
	delete(durable, "eventDigest")
	durable["eventDigest"], _ = canonicaljson.Digest(durable)
	tamperedEvent := map[string]any{"durableEvent": durable, "payload": payload}
	tamperedEvents := []any{tamperedEvent}
	value["normalizedEvents"] = tamperedEvents
	value["selectedEventDigest"] = durable["eventDigest"]
	value["normalizedEventSetDigest"], _ = canonicaljson.Digest(tamperedEvents)
	delete(value, "requestDigest")
	value["requestDigest"], _ = canonicaljson.Digest(value)
	bytes, _ := canonicaljson.Bytes(value)
	if _, err := decodeEvaluationCapabilityEffectCurrentTurnEventRequest(
		bytes, EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: requestRef.NamespaceID},
		EvaluationPlanPartition{PlanDigest: requestRef.PlanDigest, RepositoryCommit: requestRef.RepositoryCommit},
	); err == nil {
		t.Fatal("fully recomputed tool-call name swap was accepted")
	}
}

func TestEvaluationCapabilityEffectCurrentTurnEventRouteSealsRawToolCallProjection(t *testing.T) {
	plan, _, requestRef := evaluationCapabilityEffectInputAuthorityFixture(t, "hosted-retrieval-query", 0)
	input, event := evaluationCapabilityEffectCurrentTurnEventFixture(t, requestRef)
	repository := &evaluationCapabilityEffectInputAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan}, currentEvent: event,
	}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	request := authorizedEvaluationServiceRequest(http.MethodPost,
		evaluationServiceTestURL(plan, "capability-effect-current-turn-events"), bytesReader(input.Bytes))
	request.Header.Set("Idempotency-Key", input.RequestDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || len(repository.calls) != 1 || repository.calls[0] != "current-event" {
		t.Fatalf("current event status=%d calls=%v body=%s", response.Code, repository.calls, response.Body.String())
	}
	var public struct {
		Format  string          `json:"format"`
		Receipt json.RawMessage `json:"receipt"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &public); err != nil {
		t.Fatal(err)
	}
	receipt, err := decodeCanonicalEvaluationObject(public.Receipt, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	if err != nil || public.Format != evaluationCapabilityEffectCurrentTurnEventResponseFormat ||
		stringMember(receipt, "receiptDigest") != event.ReceiptDigest {
		t.Fatalf("current event public receipt drifted: %v err=%v", receipt, err)
	}
}

func TestEvaluationCapabilityEffectInputRegistryRejectsMissingOrSwappedSourceAuthority(t *testing.T) {
	plan, _, requestRef := evaluationCapabilityEffectInputAuthorityFixture(t, "hosted-retrieval-query", 0)
	_, event := evaluationCapabilityEffectCurrentTurnEventFixture(t, requestRef)
	source, err := evaluationCapabilityEffectRegistrySourceFromCurrentEvent(requestRef, event)
	if err != nil {
		t.Fatal(err)
	}
	receipt, err := createEvaluationCapabilityEffectInputRegistryReceipt(requestRef, source)
	if err != nil {
		t.Fatal(err)
	}
	value, _, _ := decodeEvaluationJSONObject(receipt.ReceiptBytes, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	value["sourceObservationReceiptDigest"] = evaluationServiceTestDigest(t, "forged-observation")
	delete(value, "receiptDigest")
	value["receiptDigest"], _ = canonicaljson.Digest(value)
	bytes, _ := canonicaljson.Bytes(value)
	if _, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(bytes); err == nil {
		t.Fatal("retrieval registry receipt with a fully recomputed observation-source swap was accepted")
	}
	repository := &evaluationCapabilityEffectInputAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan}, err: ErrNotFound,
	}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	requestBase := map[string]any{
		"format": evaluationCapabilityEffectInputRegistryRequestFormat, "version": evaluationCapabilityEffectInputAuthorityVersion,
		"namespaceId": evaluationServiceTestNamespace, "planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"requestRefAuthorityReceiptDigest": requestRef.ReceiptDigest, "requestRef": requestRef.RequestRef,
		"targetRef": requestRef.TargetRef, "requestedAt": evaluationExportInstant(requestRef.IssuedAt.Add(time.Second)),
	}
	digest, _ := canonicaljson.Digest(requestBase)
	requestBase["requestDigest"] = digest
	requestBytes, _ := canonicaljson.Bytes(requestBase)
	request := authorizedEvaluationServiceRequest(http.MethodPost,
		evaluationServiceTestURL(plan, "capability-effect-input-authorities/resolve"), bytesReader(requestBytes))
	request.Header.Set("Idempotency-Key", digest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("missing durable source status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestEvaluationCapabilityEffectInputRegistryBindsDurableStateVaultPreimages(t *testing.T) {
	_, input, _ := evaluationCapabilityEffectInputAuthorityFixture(t, "provider-job", 1)
	input.ProtocolFamily = "openai-responses"
	input.ProviderConfigurationID = "provider.openai.state-vault.test"
	input.ModelLineageDigest = evaluationServiceTestDigest(t, "state-vault-model")
	input.AdapterDigest = evaluationServiceTestDigest(t, "state-vault-adapter")
	requestRef, err := createEvaluationCapabilityEffectRequestRefAuthorityReceipt(input)
	if err != nil {
		t.Fatal(err)
	}
	authorityValue, err := evaluationCapabilityEffectRequestRefAuthorityValue(requestRef)
	if err != nil {
		t.Fatal(err)
	}
	stateAuthority, err := newEvaluationNativeProviderStateVaultAuthority()
	if err != nil {
		t.Fatal(err)
	}
	observedAt := requestRef.IssuedAt.Add(-10 * time.Second)
	sourceInvocationID := "invocation/source/provider-job"
	sourceRequestDigest := evaluationServiceTestDigest(t, "state-vault-source-request")
	sourceResponseDigest := evaluationServiceTestDigest(t, "state-vault-source-response")
	stateReferenceDigest := evaluationServiceTestDigest(t, "state-vault-provider-reference")
	sourceFactDigest := evaluationServiceTestDigest(t, "state-vault-source-fact")
	sealBase := map[string]any{
		"format": evaluationNativeProviderStateVaultSealRequestFormat, "version": int64(1),
		"authorityDigest": stateAuthority.AuthorityDigest, "purpose": "background-job-state",
		"attemptId": requestRef.AttemptID, "protocolFamily": requestRef.ProtocolFamily,
		"providerStateReferenceKind": "response-id", "providerStateReferenceDigest": stateReferenceDigest,
		"probeProgramDigest":      evaluationServiceTestDigest(t, "state-vault-program"),
		"capabilityProfileDigest": "sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195",
		"invocationId":            sourceInvocationID, "requestDigest": sourceRequestDigest, "responseDigest": sourceResponseDigest,
		"responseBodyDigest":       evaluationServiceTestDigest(t, "state-vault-response-body"),
		"sealedResponseJsonDigest": evaluationServiceTestDigest(t, "state-vault-response-json"),
		"providerConfigurationId":  requestRef.ProviderConfigurationID, "modelLineageDigest": requestRef.ModelLineageDigest,
		"adapterDigest": requestRef.AdapterDigest, "taskId": "task.state-vault.registry", "runId": "run.state-vault.registry",
		"generation": int64(1), "observedAt": evaluationExportInstant(observedAt),
		"expiresAt": evaluationExportInstant(observedAt.Add(evaluationNativeProviderStateVaultLifetime)),
	}
	sealValue := cloneEvaluationObject(sealBase)
	sealValue["sealRequestDigest"], _ = canonicaljson.Digest(sealBase)
	sealBytes, _ := canonicaljson.Bytes(sealValue)
	sealRequest, err := decodeEvaluationNativeProviderStateVaultSealRequest(sealBytes)
	if err != nil {
		t.Fatal(err)
	}
	creationDigest := evaluationServiceTestDigest(t, "state-vault-key-creation")
	opaqueRef, _ := createEvaluationNativeProviderStateVaultOpaqueRef(
		stateAuthority.AuthorityDigest, sealRequest.SealRequestDigest, creationDigest,
	)
	sealReceipt, err := createEvaluationNativeProviderStateVaultSealReceipt(
		sealRequest, "sealed", opaqueRef, creationDigest, observedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	source := map[string]any{
		"requestRefAuthority": authorityValue, "sourceAttemptId": requestRef.AttemptID,
		"sourceTurnIndex": int64(0), "sourceInvocationId": sourceInvocationID,
		"sourceProviderRequestDigest": sourceRequestDigest, "sourceResponseDigest": sourceResponseDigest,
		"sourceDispatchIntentDigest":     evaluationServiceTestDigest(t, "state-vault-source-dispatch"),
		"sourceTransportReceiptDigest":   evaluationServiceTestDigest(t, "state-vault-source-transport"),
		"sourceResultSpoolReceiptDigest": evaluationServiceTestDigest(t, "state-vault-source-spool"),
		"sourceNormalizedEventSetDigest": evaluationServiceTestDigest(t, "state-vault-source-events"),
		"sourceObservationReceiptDigest": evaluationServiceTestDigest(t, "state-vault-source-observation"),
		"sourceFactKind":                 "provider-job-receipt", "sourceProviderEventType": nil,
		"sourceProviderToolCallId": nil, "sourceToolId": nil, "sourceArgumentsDigest": nil,
		"sourceHandleDigest":    sourceFactDigest,
		"stateVaultSealRequest": sealRequest.Value, "stateVaultSealReceipt": sealReceipt.Value,
	}
	receipt, err := createEvaluationCapabilityEffectInputRegistryReceipt(requestRef, source)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(receipt.ReceiptBytes); err != nil {
		t.Fatalf("state-vault registry receipt was rejected: %v", err)
	}
	if sourceFactDigest == stateReferenceDigest {
		t.Fatal("test fixture collapsed the fact and Provider state-reference digests")
	}
	missing, _, _ := decodeEvaluationJSONObject(receipt.ReceiptBytes, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	missing["stateVaultSealRequest"], missing["stateVaultSealReceipt"] = nil, nil
	delete(missing, "receiptDigest")
	missing["receiptDigest"], _ = canonicaljson.Digest(missing)
	missingBytes, _ := canonicaljson.Bytes(missing)
	if _, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(missingBytes); err == nil {
		t.Fatal("provider-job registry without durable state-vault preimages was accepted")
	}
	swapped := cloneEvaluationObject(source)
	swapped["sourceResponseDigest"] = evaluationServiceTestDigest(t, "state-vault-swapped-response")
	swappedReceipt, err := createEvaluationCapabilityEffectInputRegistryReceipt(requestRef, swapped)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(swappedReceipt.ReceiptBytes); err == nil {
		t.Fatal("recommitted state-vault response binding swap was accepted")
	}
}

func TestEvaluationCapabilityEffectSourceHandleUsesObservedFactDigest(t *testing.T) {
	factDigest := evaluationServiceTestDigest(t, "selected-observed-fact")
	providerStateReferenceDigest := evaluationServiceTestDigest(t, "provider-state-reference")
	fact := map[string]any{
		"factKind": "provider-job-receipt", "factDigest": factDigest,
		"value": map[string]any{
			"providerJobId": "provider-job." + providerStateReferenceDigest[len("sha256-"):],
		},
	}
	digest, err := evaluationCapabilityEffectSourceHandleDigest(fact, "provider-job-receipt")
	if err != nil || digest != factDigest || digest == providerStateReferenceDigest {
		t.Fatalf("source handle did not preserve the observed fact digest: %q %v", digest, err)
	}
}

func TestEvaluationCapabilityEffectTerminalJobCannotIssueRequestRef(t *testing.T) {
	active := map[string]any{
		"value": map[string]any{"phase": "running", "callbackAuthority": "active"},
	}
	terminal := map[string]any{
		"value": map[string]any{"phase": "terminal", "callbackAuthority": "revoked", "outcome": "completed"},
	}
	if !evaluationCapabilityEffectPriorSourceAvailable("provider-job", active) ||
		evaluationCapabilityEffectPriorSourceAvailable("provider-job", terminal) {
		t.Fatal("Provider job prior-source active/terminal disposition drifted")
	}
}

func TestEvaluationCapabilityEffectStatefulBootstrapJoinUsesObservedFactDigest(t *testing.T) {
	observedAt := time.Date(2026, 8, 9, 7, 0, 1, 0, time.UTC)
	factDigest := evaluationServiceTestDigest(t, "stateful-bootstrap-observed-fact")
	providerStateReferenceDigest := evaluationServiceTestDigest(t, "stateful-bootstrap-provider-state-reference")
	fact := map[string]any{
		"factKind":   "provider-job-receipt",
		"factDigest": factDigest,
		"value": map[string]any{
			"providerJobId":     "provider-job." + providerStateReferenceDigest[len("sha256-"):],
			"taskId":            "task/stateful/bootstrap/1",
			"runId":             "run/stateful/bootstrap/1",
			"generation":        int64(1),
			"invocationId":      "invocation/stateful/bootstrap/1",
			"phase":             "running",
			"callbackAuthority": "active",
			"receiptDigest":     evaluationServiceTestDigest(t, "stateful-bootstrap-job-receipt"),
		},
	}
	factBytes, err := canonicaljson.Bytes(fact)
	if err != nil {
		t.Fatal(err)
	}
	requestRef := EvaluationCapabilityEffectRequestRefAuthorityRecord{
		AttemptID: "attempt/stateful/bootstrap/1", DescriptorDigest: evaluationServiceTestDigest(t, "stateful-bootstrap-descriptor"),
		TurnIndex: 1, BindingKind: "provider-job", CapabilityID: "provider.background-job",
		ProtocolFamily: "openai-responses", ProviderConfigurationID: "provider.openai.stateful-bootstrap",
		ModelLineageDigest:               evaluationServiceTestDigest(t, "stateful-bootstrap-model"),
		AdapterDigest:                    evaluationServiceTestDigest(t, "stateful-bootstrap-adapter"),
		RuntimeFactSourceAuthorityDigest: evaluationServiceTestDigest(t, "stateful-bootstrap-runtime-authority"),
		RegistrationReceiptDigest:        evaluationServiceTestDigest(t, "stateful-bootstrap-registration"),
		SelectedSourceHandleDigest:       factDigest,
	}
	observation := EvaluationProviderCapabilityObservationReceiptRecord{
		AttemptID: requestRef.AttemptID, DescriptorDigest: requestRef.DescriptorDigest, TurnIndex: 0,
		InvocationID:             "invocation/stateful/bootstrap/1",
		RequestDigest:            evaluationServiceTestDigest(t, "stateful-bootstrap-request"),
		ResponseDigest:           evaluationServiceTestDigest(t, "stateful-bootstrap-response"),
		DispatchIntentDigest:     evaluationServiceTestDigest(t, "stateful-bootstrap-dispatch"),
		TransportReceiptDigest:   evaluationServiceTestDigest(t, "stateful-bootstrap-transport"),
		ResultSpoolReceiptDigest: evaluationServiceTestDigest(t, "stateful-bootstrap-spool"),
		NormalizedEventSetDigest: evaluationServiceTestDigest(t, "stateful-bootstrap-events"),
		ObservedAt:               observedAt,
	}
	bootstrap := EvaluationNativeOptionalBootstrapSourceRecord{
		AttemptID: observation.AttemptID, DescriptorDigest: observation.DescriptorDigest,
		TurnIndex: observation.TurnIndex, InvocationID: observation.InvocationID,
		CapabilityProfileID: "g4-provider-background-job", CapabilityID: requestRef.CapabilityID,
		ProtocolFamily: requestRef.ProtocolFamily, ProviderConfigurationID: requestRef.ProviderConfigurationID,
		ModelLineageDigest: requestRef.ModelLineageDigest, AdapterDigest: requestRef.AdapterDigest,
		ProviderRequestDigest: observation.RequestDigest, ProviderResponseDigest: observation.ResponseDigest,
		DispatchIntentDigest: observation.DispatchIntentDigest, TransportReceiptDigest: observation.TransportReceiptDigest,
		ResultSpoolReceiptDigest:         observation.ResultSpoolReceiptDigest,
		NormalizedEventSetDigest:         observation.NormalizedEventSetDigest,
		RuntimeFactSourceAuthorityDigest: requestRef.RuntimeFactSourceAuthorityDigest,
		RegistrationReceiptDigest:        requestRef.RegistrationReceiptDigest,
		Outcome:                          "observed", FactKind: "provider-job-receipt", FactDigest: factDigest,
		FactBytes: factBytes, ObservedAt: observedAt,
	}
	if factDigest == providerStateReferenceDigest {
		t.Fatal("test fixture collapsed observed fact and Provider state-reference digests")
	}
	if err := validateEvaluationCapabilityEffectStatefulBootstrapSource(
		requestRef, observation, fact, bootstrap,
	); err != nil {
		t.Fatalf("exact active bootstrap source was rejected: %v", err)
	}

	swapped := bootstrap
	swapped.FactDigest = providerStateReferenceDigest
	if err := validateEvaluationCapabilityEffectStatefulBootstrapSource(
		requestRef, observation, fact, swapped,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("Provider state-reference digest was accepted as the observed source handle: %v", err)
	}
}
