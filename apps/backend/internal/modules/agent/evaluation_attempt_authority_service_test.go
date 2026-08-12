package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationAttemptAuthorityTestRepository struct {
	*evaluationServiceFakeRepository
	record           EvaluationControlledAuthorityRequestRecord
	ownerReceipt     EvaluationAttemptAuthorityOwnerReceiptRecord
	claimCalls       int
	dispatchCalls    int
	sealCalls        int
	ownerResultCalls int
	dispatchError    error
}

func (repository *evaluationAttemptAuthorityTestRepository) ClaimEvaluationControlledAuthorityRequest(
	_ context.Context,
	_ EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.claimCalls++
	created := repository.record.State == ""
	if created {
		repository.record = EvaluationControlledAuthorityRequestRecord{
			PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
			EvaluationControlledAuthorityRequestBinding: binding,
			State: "claimed", ClaimGeneration: 1, ClaimedAt: claimedAt,
		}
	}
	return repository.record, created, nil
}

func (repository *evaluationAttemptAuthorityTestRepository) MarkEvaluationControlledAuthorityDispatched(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.dispatchCalls++
	if repository.dispatchError != nil {
		err := repository.dispatchError
		repository.dispatchError = nil
		return repository.record, false, err
	}
	if repository.record.State == "claimed" {
		repository.record.State = "dispatched"
		repository.record.DispatchedAt = dispatchedAt
	}
	return repository.record, repository.dispatchCalls > 1, nil
}

func (repository *evaluationAttemptAuthorityTestRepository) MarkEvaluationAttemptAuthorityDispatched(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	_ int64,
	stageDigest string,
	providerCapabilityObservationReceiptSetDigest string,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.dispatchCalls++
	if repository.record.State == "claimed" {
		repository.record.State = "dispatched"
		repository.record.StageDigest = stageDigest
		repository.record.ProviderCapabilityObservationReceiptSetDigest = providerCapabilityObservationReceiptSetDigest
		repository.record.EvaluationControlledAuthorityRequestBinding.ProviderCapabilityObservationReceiptSetDigest =
			binding.ProviderCapabilityObservationReceiptSetDigest
		repository.record.DispatchedAt = dispatchedAt
	}
	if repository.dispatchError != nil {
		err := repository.dispatchError
		repository.dispatchError = nil
		return repository.record, false, err
	}
	return repository.record, repository.dispatchCalls > 1, nil
}

func (repository *evaluationAttemptAuthorityTestRepository) SealEvaluationControlledAuthorityRequest(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	responseDigest string,
	responseBytes []byte,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.sealCalls++
	replayed := repository.record.State == "sealed"
	if !replayed {
		repository.record.State = "sealed"
		repository.record.ResponseDigest = responseDigest
		repository.record.ResponseBytes = append([]byte(nil), responseBytes...)
		repository.record.SealedAt = sealedAt
	}
	return repository.record, replayed, nil
}

func (repository *evaluationAttemptAuthorityTestRepository) GetEvaluationAttemptAuthorityOwnerReceipt(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
) (EvaluationAttemptAuthorityOwnerReceiptRecord, error) {
	if len(repository.ownerReceipt.ReceiptBytes) == 0 {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrNotFound
	}
	return repository.ownerReceipt, nil
}

func (repository *evaluationAttemptAuthorityTestRepository) StoreEvaluationAttemptAuthorityOwnerResult(
	_ context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	stageDigest string,
	responseDigest string,
	responseBytes []byte,
	dispatchAckDigest string,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.ownerResultCalls++
	if err := validateEvaluationAttemptAuthorityDurableOwnerResult(
		authority, partition, binding, stageDigest, responseDigest, responseBytes, dispatchAckDigest,
	); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	replayed := repository.record.DispatchAckDigest != "" || repository.record.State == "sealed"
	if replayed {
		if repository.record.ResponseDigest != responseDigest ||
			!bytes.Equal(repository.record.ResponseBytes, responseBytes) ||
			repository.record.DispatchAckDigest != dispatchAckDigest {
			return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
		}
		return repository.record, true, nil
	}
	if repository.record.State != "dispatched" || repository.record.StageDigest != stageDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	repository.record.ResponseDigest = responseDigest
	repository.record.ResponseBytes = append([]byte(nil), responseBytes...)
	repository.record.DispatchAckDigest = dispatchAckDigest
	return repository.record, false, nil
}

func (repository *evaluationAttemptAuthorityTestRepository) SealEvaluationAttemptAuthorityRequest(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	responseDigest string,
	responseBytes []byte,
	dispatchAckDigest string,
	_ []EvaluationProviderCapabilityObservationReceiptRecord,
	receipt EvaluationAttemptAuthorityOwnerReceiptRecord,
) (EvaluationControlledAuthorityRequestRecord, EvaluationAttemptAuthorityOwnerReceiptRecord, bool, error) {
	repository.sealCalls++
	replayed := repository.record.State == "sealed"
	if !replayed {
		repository.record.State = "sealed"
		repository.record.ResponseDigest = responseDigest
		repository.record.ResponseBytes = append([]byte(nil), responseBytes...)
		repository.record.DispatchAckDigest = dispatchAckDigest
		repository.record.SealedAt = receipt.CompletedAt
		repository.ownerReceipt = receipt
	}
	return repository.record, repository.ownerReceipt, replayed, nil
}

type evaluationAttemptAuthorityTestOwner struct {
	implementationDigest string
	result               EvaluationAttemptAuthorityResult
	executeCalls         int
	effectCalls          int
	reconcileCalls       int
	durable              map[string]EvaluationAttemptAuthorityResult
}

func (owner *evaluationAttemptAuthorityTestOwner) StageAttemptAuthority(
	_ context.Context,
	request EvaluationAttemptAuthorityRequest,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-attempt-authority-dispatch-stage", "version": int64(1),
		"serviceKind": request.ServiceKind, "operation": request.Operation, "routeBinding": request.RouteBinding,
		"namespaceId": request.NamespaceID, "planDigest": request.PlanDigest,
		"repositoryCommit": request.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "shardLeaseOwnerId": request.ShardLeaseOwnerID,
		"shardLeaseGeneration":                          request.ShardLeaseGeneration,
		"verificationGrantGeneration":                   request.VerificationGrantGeneration,
		"verificationAttemptGrantReceiptSetDigest":      request.VerificationAttemptGrantReceiptSetDigest,
		"requestDigest":                                 request.RequestDigest,
		"providerCapabilityObservationReceiptSetDigest": request.ProviderCapabilityObservationReceiptSetDigest,
		"ownerImplementationDigest":                     request.OwnerImplementationDigest, "claimGeneration": int64(1),
	})
}

func (owner *evaluationAttemptAuthorityTestOwner) AttemptAuthorityImplementationDigest(
	serviceKind string,
) (string, bool) {
	return owner.implementationDigest, serviceKind == "provider-capability"
}

func (owner *evaluationAttemptAuthorityTestOwner) ExecuteAttemptAuthority(
	_ context.Context,
	request EvaluationAttemptAuthorityRequest,
) (EvaluationAttemptAuthorityResult, error) {
	owner.executeCalls++
	if result, ok := owner.durable[request.RequestDigest]; ok {
		return result, nil
	}
	owner.effectCalls++
	owner.durable[request.RequestDigest] = owner.result
	return owner.result, nil
}

func (owner *evaluationAttemptAuthorityTestOwner) ReconcileAttemptAuthority(
	_ context.Context,
	request EvaluationAttemptAuthorityRequest,
) (EvaluationAttemptAuthorityResult, bool, error) {
	owner.reconcileCalls++
	result, ok := owner.durable[request.RequestDigest]
	return result, ok, nil
}

type evaluationAttemptAuthorityTestScanner struct {
	reject bool
	calls  int
}

func (scanner *evaluationAttemptAuthorityTestScanner) ScanAttemptAuthorityPublicResponse(
	_ context.Context,
	_ string,
	_ string,
	_ []byte,
) error {
	scanner.calls++
	if scanner.reject {
		return ErrUnauthorized
	}
	return nil
}

func evaluationAttemptAuthorityTestRequest(
	t *testing.T,
	plan evaluationPlanFact,
	ownerImplementationDigest string,
) (*http.Request, map[string]any, json.RawMessage) {
	t.Helper()
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil || len(planned) == 0 {
		t.Fatalf("planned attempts=%d err=%v", len(planned), err)
	}
	descriptor := planned[0]
	capabilityDescriptorDigest := evaluationServiceTestDigest(t, "attempt-authority-capability-descriptor")
	providerRequestDigest := evaluationServiceTestDigest(t, "attempt-authority-provider-request")
	resultDigest := evaluationServiceTestDigest(t, "attempt-authority-result")
	result := map[string]any{"ok": true}
	actualResultDigest, err := canonicaljson.Digest(result)
	if err != nil {
		t.Fatal(err)
	}
	if resultDigest == actualResultDigest {
		t.Fatal("test digest labels unexpectedly collided")
	}
	payload := map[string]any{
		"namespaceId":                              evaluationServiceTestNamespace,
		"shardLeaseOwnerId":                        "evaluation-worker.test",
		"shardLeaseGeneration":                     int64(3),
		"verificationGrantGeneration":              int64(5),
		"verificationAttemptGrantReceiptSetDigest": evaluationServiceTestDigest(t, "attempt-authority-grant-set"),
		"planDigest":                               plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": descriptor.AttemptID, "descriptorDigest": descriptor.DescriptorDigest,
		"caseId":         descriptor.CaseID,
		"caseDigest":     evaluationServiceTestDigest(t, "attempt-authority-case"),
		"materialDigest": evaluationServiceTestDigest(t, "attempt-authority-material"),
		"capabilityDescriptor": map[string]any{
			"descriptorDigest":     capabilityDescriptorDigest,
			"expectedReceiptKinds": []any{"capability-unavailable-receipt"},
		},
		"loopPolicyDigest": evaluationServiceTestDigest(t, "attempt-authority-loop"),
		"turnIndex":        int64(0), "invocationId": "invocation.test",
		"toolCallId": "tool-call.test", "providerToolCallId": "provider-tool-call.test",
		"toolId": "web-search", "arguments": map[string]any{"query": "public"},
		"argumentsDigest":        evaluationServiceTestDigest(t, "attempt-authority-arguments"),
		"requestDigest":          providerRequestDigest,
		"executionAuthorityKind": "observation-control",
		"maximumToolResultBytes": int64(4_096),
	}
	argumentsDigest, err := canonicaljson.Digest(payload["arguments"])
	if err != nil {
		t.Fatal(err)
	}
	payload["argumentsDigest"] = argumentsDigest
	target := evaluationPlanObjectByIdentity(
		plan.Value["capabilityQualificationTargets"], "targetId", stringMember(descriptor.Descriptor, "targetId"),
	)
	provider := evaluationPlanObjectByIdentity(
		plan.Value["providerConfigurations"], "providerConfigurationId", stringMember(target, "providerConfigurationId"),
	)
	adapter, adapterOK := objectMember(provider, "adapter")
	if target == nil || provider == nil || !adapterOK {
		t.Fatal("attempt authority observation plan binding is missing")
	}
	terminalEventBase := map[string]any{
		"eventId": "provider-event.test", "invocationId": "invocation.test", "sequence": int64(0),
		"type": "completed", "payloadDigest": actualResultDigest, "occurredAt": "2026-08-08T00:00:00.400Z",
	}
	terminalEventDigest, err := canonicaljson.Digest(terminalEventBase)
	if err != nil {
		t.Fatal(err)
	}
	terminalEvent := cloneEvaluationObject(terminalEventBase)
	terminalEvent["eventDigest"] = terminalEventDigest
	observationFacts := []any{map[string]any{
		"factKind": "provider-event", "factDigest": terminalEventDigest, "value": terminalEvent,
	}}
	observationProjection := map[string]any{
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": descriptor.AttemptID, "descriptorDigest": descriptor.DescriptorDigest,
		"turnIndex": int64(0), "invocationId": "invocation.test", "requestDigest": providerRequestDigest,
		"responseDigest":           actualResultDigest,
		"protocolFamily":           stringMember(target, "protocolFamily"),
		"providerConfigurationId":  stringMember(target, "providerConfigurationId"),
		"modelLineageDigest":       stringMember(target, "modelLineageDigest"),
		"adapterDigest":            stringMember(adapter, "adapterDigest"),
		"dispatchIntentDigest":     evaluationServiceTestDigest(t, "attempt-authority-observation-intent"),
		"transportReceiptDigest":   evaluationServiceTestDigest(t, "attempt-authority-observation-transport"),
		"resultSpoolReceiptDigest": evaluationServiceTestDigest(t, "attempt-authority-observation-spool"),
		"normalizedEventSetDigest": evaluationServiceTestDigest(t, "attempt-authority-observation-events"),
		"factDigests": []any{map[string]any{
			"factKind": "provider-event", "factDigest": terminalEventDigest,
		}},
	}
	observationBase := map[string]any{
		"format": evaluationProviderCapabilityObservationFormat, "version": int64(1),
		"observationReceiptId": "observation-receipt.test",
		"planDigest":           observationProjection["planDigest"], "repositoryCommit": observationProjection["repositoryCommit"],
		"attemptId": observationProjection["attemptId"], "descriptorDigest": observationProjection["descriptorDigest"],
		"turnIndex": observationProjection["turnIndex"], "invocationId": observationProjection["invocationId"],
		"requestDigest": observationProjection["requestDigest"], "responseDigest": observationProjection["responseDigest"],
		"protocolFamily":          observationProjection["protocolFamily"],
		"providerConfigurationId": observationProjection["providerConfigurationId"],
		"modelLineageDigest":      observationProjection["modelLineageDigest"], "adapterDigest": observationProjection["adapterDigest"],
		"dispatchIntentDigest":     observationProjection["dispatchIntentDigest"],
		"transportReceiptDigest":   observationProjection["transportReceiptDigest"],
		"resultSpoolReceiptDigest": observationProjection["resultSpoolReceiptDigest"],
		"normalizedEventSetDigest": observationProjection["normalizedEventSetDigest"],
		"facts":                    observationFacts, "observedAt": "2026-08-08T00:00:00.500Z",
	}
	recomputeEvaluationProviderObservationReceiptDigests(t, observationBase)
	observationReceipt := cloneEvaluationObject(observationBase)
	payload["providerCapabilityObservationReceipt"] = observationReceipt
	payloadDigest, err := canonicaljson.Digest(payload)
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]any{
		"format":      evaluationAttemptAuthorityRequestFormat,
		"version":     evaluationAttemptAuthorityVersion,
		"serviceKind": "capability-runtime", "operation": "execute-tool",
		"namespaceId": evaluationServiceTestNamespace,
		"planDigest":  plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": descriptor.AttemptID, "descriptorDigest": descriptor.DescriptorDigest,
		"descriptor":                               descriptor.Descriptor,
		"shardLeaseOwnerId":                        payload["shardLeaseOwnerId"],
		"shardLeaseGeneration":                     payload["shardLeaseGeneration"],
		"verificationGrantGeneration":              payload["verificationGrantGeneration"],
		"verificationAttemptGrantReceiptSetDigest": payload["verificationAttemptGrantReceiptSetDigest"],
		"claimGeneration":                          int64(1), "payloadDigest": payloadDigest,
	}
	requestDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	envelope := cloneEvaluationObject(base)
	envelope["requestDigest"] = requestDigest
	envelope["payload"] = payload
	source, err := canonicaljson.Bytes(envelope)
	if err != nil {
		t.Fatal(err)
	}
	decodedEnvelope, err := decodeCanonicalEvaluationObject(source, maximumEvaluationAttemptAuthorityRequestBytes)
	if err != nil {
		t.Fatal(err)
	}
	ownerFactBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-owner-fact", "version": int64(1),
		"authorityKind": "capability-denial", "category": "capability-unavailable-receipt",
		"authorityId":                   "provider-capability.test",
		"authorityImplementationDigest": ownerImplementationDigest,
		"authorityRequestDigest":        requestDigest,
		"authorityResultDigest":         actualResultDigest,
		"policyDigest":                  evaluationServiceTestDigest(t, "attempt-authority-policy"),
		"reasonCode":                    "capability-unavailable",
		"decisionDigest":                actualResultDigest,
		"observedAt":                    "2026-08-08T00:00:00.000Z",
	}
	ownerFactDigest, err := canonicaljson.Digest(ownerFactBase)
	if err != nil {
		t.Fatal(err)
	}
	ownerFact := cloneEvaluationObject(ownerFactBase)
	ownerFact["factDigest"] = ownerFactDigest
	receiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-specific-receipt", "version": int64(1),
		"receiptId": "capability-receipt.test", "receiptKind": "capability-unavailable-receipt",
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": descriptor.AttemptID, "descriptorDigest": descriptor.DescriptorDigest,
		"caseId": descriptor.CaseID, "materialDigest": payload["materialDigest"],
		"capabilityDescriptorDigest": capabilityDescriptorDigest,
		"turnIndex":                  int64(0), "invocationId": "invocation.test",
		"toolId": "web-search", "toolCallId": "tool-call.test",
		"providerToolCallId":                         "provider-tool-call.test",
		"providerCapabilityObservationReceiptDigest": stringMember(observationReceipt, "receiptDigest"),
		"requestDigest":                              providerRequestDigest, "resultDigest": actualResultDigest,
		"startedAt": "2026-08-08T00:00:00.000Z", "completedAt": "2026-08-08T00:00:01.000Z",
	}
	authoritySemanticDigest, err := canonicaljson.Digest(map[string]any{
		"authorityKind": "capability-denial", "receiptKind": "capability-unavailable-receipt",
		"factDigest": ownerFactDigest,
	})
	if err != nil {
		t.Fatal(err)
	}
	receiptBase["authority"] = map[string]any{
		"authorityKind": "capability-denial", "receiptKind": "capability-unavailable-receipt",
		"factDigest": ownerFactDigest, "semanticDigest": authoritySemanticDigest, "fact": ownerFact,
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		t.Fatal(err)
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["receiptDigest"] = receiptDigest
	ownerResponse, err := canonicaljson.Bytes(map[string]any{
		"executionAuthorityKind": "observation-control",
		"outcome":                "supported", "result": result, "resultDigest": actualResultDigest,
		"continuationReceiptDigest": receiptDigest,
		"specificReceipts":          []any{receipt},
	})
	if err != nil {
		t.Fatal(err)
	}
	request := authorizedEvaluationServiceRequest(
		http.MethodPost, evaluationServiceTestURL(plan, "capability-runtime/execute-tool"),
		bytes.NewReader(source),
	)
	request.Header.Set("Idempotency-Key", requestDigest)
	_ = ownerImplementationDigest
	return request, decodedEnvelope, ownerResponse
}

func evaluationAttemptAuthorityTestFences(
	t *testing.T,
	plan evaluationPlanFact,
	route evaluationAttemptAuthorityRoute,
	envelope map[string]any,
	ownerImplementationDigest string,
) (string, string) {
	t.Helper()
	descriptor, descriptorOK := objectMember(envelope, "descriptor")
	payload, payloadOK := objectMember(envelope, "payload")
	if !descriptorOK || !payloadOK {
		t.Fatal("attempt authority fixture descriptor or payload is missing")
	}
	_, observationSetDigest, err := evaluationProviderCapabilityObservationSetDigestFromPayload(
		route, plan, descriptor, payload,
	)
	if err != nil {
		t.Fatal(err)
	}
	stageDigest, err := evaluationAttemptAuthorityDispatchStageDigest(
		route, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		envelope, observationSetDigest, ownerImplementationDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	return observationSetDigest, stageDigest
}

func evaluationAttemptAuthorityTestHandler(
	t *testing.T,
	repository *evaluationAttemptAuthorityTestRepository,
	owner *evaluationAttemptAuthorityTestOwner,
	scanner *evaluationAttemptAuthorityTestScanner,
) *EvaluationServiceHandler {
	t.Helper()
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		AttemptAuthority: owner, AttemptAuthorityResponseScanner: scanner,
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func TestEvaluationAttemptAuthoritySealsSafeResponseAndReplaysCurrentEnvelope(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	implementationDigest := evaluationServiceTestDigest(t, "provider-capability-implementation")
	repository := &evaluationAttemptAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	request, envelope, ownerResponse := evaluationAttemptAuthorityTestRequest(t, plan, implementationDigest)
	route, _ := evaluationAttemptAuthorityRouteFor([]string{"capability-runtime", "execute-tool"})
	observationSetDigest, stageDigest := evaluationAttemptAuthorityTestFences(t, plan, route, envelope, implementationDigest)
	dispatchAckDigest, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		envelope, observationSetDigest, stageDigest, implementationDigest, ownerResponse,
	)
	if err != nil {
		t.Fatal(err)
	}
	payloadValue, _ := objectMember(envelope, "payload")
	payloadBytes, _ := canonicaljson.Bytes(payloadValue)
	if err := validateEvaluationAttemptAuthorityOwnerResponse(route, payloadBytes, ownerResponse); err != nil {
		t.Fatalf("owner response fixture invalid: %v response=%s", err, ownerResponse)
	}
	fixtureExecuteBinding, err := evaluationAttemptAuthorityExecuteBindingFromPayload(payloadValue)
	if err != nil {
		t.Fatalf("execute binding fixture invalid: %v", err)
	}
	projection, _, err := evaluationAttemptAuthorityResponseProjection(
		route.ServiceKind, route.Operation, ownerResponse, &fixtureExecuteBinding, nil,
	)
	if err != nil {
		t.Fatalf("response projection fixture invalid: %v", err)
	}
	binding, err := evaluationAttemptAuthorityRequestBinding(
		EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		route, envelope, observationSetDigest, implementationDigest,
	)
	if err != nil {
		t.Fatalf("request binding fixture invalid: %v", err)
	}
	if err := validateEvaluationControlledAuthorityBinding(
		EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		binding,
	); err != nil {
		t.Fatalf("controlled authority binding fixture invalid: %v binding=%#v", err, binding)
	}
	if _, err := validateEvaluationAttemptAuthorityResponseProjection(
		projection, route.ServiceKind, route.Operation,
	); err != nil {
		t.Fatalf("response projection validator rejected fixture: %v projection=%#v", err, projection)
	}
	if _, err := createEvaluationAttemptAuthorityOwnerReceipt(
		EvaluationAuthority{
			Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal,
			NamespaceID: evaluationServiceTestNamespace,
		},
		EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		binding, projection, time.Now().UTC(),
	); err != nil {
		t.Fatalf("owner receipt fixture invalid: %v projection=%v", err, projection)
	}
	owner := &evaluationAttemptAuthorityTestOwner{
		implementationDigest: implementationDigest,
		result: EvaluationAttemptAuthorityResult{
			Response: ownerResponse, DispatchAckDigest: dispatchAckDigest,
		},
		durable: make(map[string]EvaluationAttemptAuthorityResult),
	}
	scanner := &evaluationAttemptAuthorityTestScanner{}
	handler := evaluationAttemptAuthorityTestHandler(t, repository, owner, scanner)
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, request)
	if first.Code != http.StatusOK || repository.record.State != "sealed" || repository.sealCalls != 1 ||
		owner.effectCalls != 1 || !bytes.Equal(repository.record.ResponseBytes, ownerResponse) {
		t.Fatalf("first status=%d state=%s seals=%d effects=%d body=%s",
			first.Code, repository.record.State, repository.sealCalls, owner.effectCalls, first.Body.String())
	}
	var firstValue map[string]any
	if err := json.Unmarshal(first.Body.Bytes(), &firstValue); err != nil || firstValue["replayed"] != false {
		t.Fatalf("first response=%s err=%v", first.Body.String(), err)
	}
	authorityReceiptValue, ok := firstValue["authorityReceipt"].(map[string]any)
	if !ok {
		t.Fatalf("first response lacks full authority receipt: %s", first.Body.String())
	}
	authorityReceiptBytes, err := canonicaljson.Bytes(authorityReceiptValue)
	if err != nil {
		t.Fatal(err)
	}
	authorityReceipt, err := decodeEvaluationAttemptAuthorityOwnerReceipt(authorityReceiptBytes)
	if err != nil || authorityReceipt.ServiceKind != "capability-runtime" ||
		authorityReceipt.Operation != "execute-tool" ||
		authorityReceipt.OwnerImplementationDigest != implementationDigest ||
		!bytes.Equal(authorityReceipt.ReceiptBytes, repository.ownerReceipt.ReceiptBytes) {
		t.Fatalf("authority receipt=%#v persisted=%s err=%v",
			authorityReceipt, repository.ownerReceipt.ReceiptBytes, err)
	}
	executeBinding, err := evaluationAttemptAuthorityExecuteBindingFromPayload(payloadValue)
	if err != nil {
		t.Fatal(err)
	}
	_, projectionDigest, err := evaluationAttemptAuthorityResponseProjection(
		"capability-runtime", "execute-tool", ownerResponse, &executeBinding, nil,
	)
	if err != nil || authorityReceipt.ResponseDigest != projectionDigest ||
		bytes.Contains(authorityReceipt.ReceiptBytes, []byte(`"result":{"ok":true}`)) {
		t.Fatalf("projection=%s receipt=%#v err=%v", projectionDigest, authorityReceipt, err)
	}
	replayRequest, _, _ := evaluationAttemptAuthorityTestRequest(t, plan, implementationDigest)
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, replayRequest)
	var secondValue map[string]any
	if err := json.Unmarshal(second.Body.Bytes(), &secondValue); err != nil ||
		second.Code != http.StatusOK || secondValue["replayed"] != true || owner.executeCalls != 1 {
		t.Fatalf("replay status=%d executes=%d body=%s err=%v",
			second.Code, owner.executeCalls, second.Body.String(), err)
	}
	if !sameEvaluationCanonicalValue(firstValue["authorityReceipt"], secondValue["authorityReceipt"]) {
		t.Fatalf("replay receipt drifted first=%v second=%v", firstValue["authorityReceipt"], secondValue["authorityReceipt"])
	}
}

func TestEvaluationAttemptAuthorityDispatchMarkAcknowledgementLossFailsClosedWithoutDurableOwnerResult(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	implementationDigest := evaluationServiceTestDigest(t, "provider-capability-crash-implementation")
	repository := &evaluationAttemptAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		dispatchError:                   errors.New("simulated dispatch mark acknowledgement loss"),
	}
	request, envelope, ownerResponse := evaluationAttemptAuthorityTestRequest(t, plan, implementationDigest)
	route, _ := evaluationAttemptAuthorityRouteFor([]string{"capability-runtime", "execute-tool"})
	observationSetDigest, stageDigest := evaluationAttemptAuthorityTestFences(t, plan, route, envelope, implementationDigest)
	dispatchAckDigest, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		envelope, observationSetDigest, stageDigest, implementationDigest, ownerResponse,
	)
	if err != nil {
		t.Fatal(err)
	}
	owner := &evaluationAttemptAuthorityTestOwner{
		implementationDigest: implementationDigest,
		result:               EvaluationAttemptAuthorityResult{Response: ownerResponse, DispatchAckDigest: dispatchAckDigest},
		durable:              make(map[string]EvaluationAttemptAuthorityResult),
	}
	handler := evaluationAttemptAuthorityTestHandler(t, repository, owner, &evaluationAttemptAuthorityTestScanner{})
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, request)
	if first.Code != http.StatusInternalServerError || repository.record.State != "dispatched" || owner.effectCalls != 0 {
		t.Fatalf("first status=%d state=%s effects=%d body=%s",
			first.Code, repository.record.State, owner.effectCalls, first.Body.String())
	}
	retry, _, _ := evaluationAttemptAuthorityTestRequest(t, plan, implementationDigest)
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, retry)
	if second.Code != http.StatusServiceUnavailable || owner.executeCalls != 0 || owner.effectCalls != 0 || owner.reconcileCalls != 1 ||
		repository.record.State != "dispatched" {
		t.Fatalf("retry status=%d executes=%d effects=%d reconciles=%d state=%s body=%s",
			second.Code, owner.executeCalls, owner.effectCalls, owner.reconcileCalls,
			repository.record.State, second.Body.String())
	}
}

func TestEvaluationAttemptAuthorityDispatchedWithoutAckReconcilesDurableOwnerResultWithoutExecute(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	implementationDigest := evaluationServiceTestDigest(t, "provider-capability-reconcile-implementation")
	repository := &evaluationAttemptAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		dispatchError:                   errors.New("simulated dispatch acknowledgement loss"),
	}
	request, envelope, ownerResponse := evaluationAttemptAuthorityTestRequest(t, plan, implementationDigest)
	route, _ := evaluationAttemptAuthorityRouteFor([]string{"capability-runtime", "execute-tool"})
	observationSetDigest, stageDigest := evaluationAttemptAuthorityTestFences(t, plan, route, envelope, implementationDigest)
	dispatchAckDigest, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		envelope, observationSetDigest, stageDigest, implementationDigest, ownerResponse,
	)
	if err != nil {
		t.Fatal(err)
	}
	owner := &evaluationAttemptAuthorityTestOwner{
		implementationDigest: implementationDigest,
		result:               EvaluationAttemptAuthorityResult{Response: ownerResponse, DispatchAckDigest: dispatchAckDigest},
		durable:              make(map[string]EvaluationAttemptAuthorityResult),
	}
	handler := evaluationAttemptAuthorityTestHandler(t, repository, owner, &evaluationAttemptAuthorityTestScanner{})
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, request)
	if first.Code != http.StatusInternalServerError || repository.record.State != "dispatched" ||
		owner.executeCalls != 0 || owner.reconcileCalls != 0 {
		t.Fatalf("first status=%d state=%s executes=%d reconciles=%d body=%s",
			first.Code, repository.record.State, owner.executeCalls, owner.reconcileCalls, first.Body.String())
	}
	owner.durable[stringMember(envelope, "requestDigest")] = owner.result
	retry, _, _ := evaluationAttemptAuthorityTestRequest(t, plan, implementationDigest)
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, retry)
	if second.Code != http.StatusOK || repository.record.State != "sealed" || owner.executeCalls != 0 ||
		owner.effectCalls != 0 || owner.reconcileCalls != 1 || repository.sealCalls != 1 {
		t.Fatalf("retry status=%d state=%s executes=%d effects=%d reconciles=%d seals=%d body=%s",
			second.Code, repository.record.State, owner.executeCalls, owner.effectCalls,
			owner.reconcileCalls, repository.sealCalls, second.Body.String())
	}
}

func TestEvaluationAttemptAuthorityScannerRejectsBeforePersistence(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	implementationDigest := evaluationServiceTestDigest(t, "provider-capability-scan-implementation")
	repository := &evaluationAttemptAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	request, envelope, ownerResponse := evaluationAttemptAuthorityTestRequest(t, plan, implementationDigest)
	route, _ := evaluationAttemptAuthorityRouteFor([]string{"capability-runtime", "execute-tool"})
	observationSetDigest, stageDigest := evaluationAttemptAuthorityTestFences(t, plan, route, envelope, implementationDigest)
	dispatchAckDigest, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		envelope, observationSetDigest, stageDigest, implementationDigest, ownerResponse,
	)
	if err != nil {
		t.Fatal(err)
	}
	owner := &evaluationAttemptAuthorityTestOwner{
		implementationDigest: implementationDigest,
		result:               EvaluationAttemptAuthorityResult{Response: ownerResponse, DispatchAckDigest: dispatchAckDigest},
		durable:              make(map[string]EvaluationAttemptAuthorityResult),
	}
	handler := evaluationAttemptAuthorityTestHandler(
		t, repository, owner, &evaluationAttemptAuthorityTestScanner{reject: true},
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || repository.sealCalls != 0 || len(repository.record.ResponseBytes) != 0 ||
		len(repository.ownerReceipt.ReceiptBytes) != 0 {
		t.Fatalf("status=%d seals=%d persisted=%d receipt=%d body=%s",
			response.Code, repository.sealCalls, len(repository.record.ResponseBytes),
			len(repository.ownerReceipt.ReceiptBytes), response.Body.String())
	}
}

func TestEvaluationAttemptAuthorityFailsClosedWithoutReadyOwner(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationAttemptAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	request, _, _ := evaluationAttemptAuthorityTestRequest(t, plan, evaluationServiceTestDigest(t, "unused"))
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
	})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable || repository.getCalls != 0 || repository.claimCalls != 0 {
		t.Fatalf("status=%d planCalls=%d claimCalls=%d body=%s",
			response.Code, repository.getCalls, repository.claimCalls, response.Body.String())
	}
}

func storeEvaluationAttemptAuthorityGrantReceipt(
	t *testing.T,
	repository *Repository,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	planned evaluationStatusPlannedAttempt,
	cellID string,
	generation int64,
	issuedAt time.Time,
	expiresAt time.Time,
) EvaluationVerificationAttemptGrantReceiptRecord {
	t.Helper()
	descriptorBytes, err := canonicaljson.Bytes(planned.Descriptor)
	if err != nil {
		t.Fatal(err)
	}
	verificationPlanDigest := evaluationServiceTestDigest(t, "attempt-authority-verification-plan-"+cellID)
	issue := evaluationVerificationAttemptGrantIssue{
		Format: evaluationVerificationAttemptGrantIssueFormat, Version: evaluationVerificationAttemptGrantVersion,
		NamespaceID: authority.NamespaceID, EvaluationPlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, EvaluationAttemptID: planned.AttemptID,
		DescriptorDigest:           planned.DescriptorDigest,
		CapabilityDescriptorDigest: stringMember(planned.Descriptor, "capabilityDescriptorDigest"),
		CaseID:                     planned.CaseID, Descriptor: descriptorBytes, Generation: generation,
		WorkspaceID: "workspace.attempt-authority", WorkspaceRevision: 7,
		ProjectID: "project.attempt-authority", VerificationPlanDigest: verificationPlanDigest,
		VerificationPlan: json.RawMessage(`{"format":"prodivix.verification-plan","planDigest":"` + verificationPlanDigest + `"}`),
		CellID:           cellID,
		Run: backendverification.RunIdentity{
			RunID: "run." + cellID, ProviderID: "provider.attempt-authority",
			JobID: "job." + cellID, SessionID: "session." + cellID,
			ParentAttemptID: planned.AttemptID, Surface: "preview", FrameworkTarget: "react-vite",
			RuntimeZone: "sandbox", Viewport: backendverification.ViewportIdentity{
				ID: "viewport.attempt-authority", Width: 1280, Height: 720,
			},
			DevicePixelRatio: 1, ColorScheme: "light", Motion: "reduced",
			Locale: "en-US", Timezone: "UTC",
			FontSetDigest: evaluationServiceTestDigest(t, "attempt-authority-fonts"),
		},
		TrustCeiling: backendverification.TrustLocalUnattested,
		ExpiresAt:    evaluationVerificationGrantInstant(expiresAt),
	}
	issue.RequestDigest, err = canonicaljson.Digest(issue.base())
	if err != nil {
		t.Fatal(err)
	}
	bindingDigest, err := canonicaljson.Digest(issue.binding())
	if err != nil {
		t.Fatal(err)
	}
	issuedBy := "g4-evaluation." + bindingDigest[len("sha256-"):]
	issuer := &evaluationVerificationGrantTestIssuer{
		verificationPlanDigest: verificationPlanDigest, workspaceRevision: issue.WorkspaceRevision,
		issuedAt: issuedAt,
	}
	grantRecord, err := issuer.IssueTrustedAttemptGrant(context.Background(), backendverification.TrustedAttemptGrantIssue{
		WorkspaceID: issue.WorkspaceID, ProjectID: issue.ProjectID,
		Plan: issue.VerificationPlan, CellID: issue.CellID, AttemptID: issue.EvaluationAttemptID,
		Run: issue.Run, ProducerID: evaluationVerificationAttemptGrantProducerID,
		TrustCeiling: issue.TrustCeiling, IssuedBy: issuedBy, ExpiresAt: expiresAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.db.ExecContext(context.Background(), `INSERT INTO verification_attempt_grants (
		id, workspace_id, project_id, workspace_revision, partition_revisions_digest,
		policy_revision, policy_digest, policy_evaluation_instant, impact_digest,
		plan_digest, plan_json, plan_bytes, cell_id, check_id, check_kind, target_id,
		attempt_id, run_id, provider_id, job_id, session_id, producer_id, trust_ceiling,
		successful_retention_class, failed_retention_class, protect_release_evidence,
		maximum_closure_evidence_records, grant_digest, issued_by, issued_at, expires_at, created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)`,
		grantRecord.ID, grantRecord.WorkspaceID, grantRecord.ProjectID, grantRecord.WorkspaceRevision,
		grantRecord.PartitionRevisionsDigest, grantRecord.PolicyRevision, grantRecord.PolicyDigest,
		grantRecord.PolicyEvaluationInstant, grantRecord.ImpactDigest, grantRecord.PlanDigest,
		string(issue.VerificationPlan), []byte(issue.VerificationPlan), grantRecord.CellID,
		grantRecord.CheckID, grantRecord.CheckKind, grantRecord.TargetID, grantRecord.AttemptID,
		grantRecord.RunID, grantRecord.ProviderID, grantRecord.JobID, grantRecord.SessionID,
		grantRecord.ProducerID, string(grantRecord.TrustCeiling),
		string(grantRecord.RetentionRequest.Successful), string(grantRecord.RetentionRequest.Failed),
		grantRecord.RetentionRequest.ProtectReleaseEvidence, grantRecord.MaximumClosureEvidenceRecords,
		grantRecord.GrantDigest, grantRecord.IssuedBy, grantRecord.IssuedAt,
		grantRecord.ExpiresAt, grantRecord.IssuedAt,
	); err != nil {
		t.Fatalf("store Verification AttemptGrant authority row: %v", err)
	}
	grant := evaluationVerificationAttemptGrantFromRecord(grantRecord)
	receiptBase := evaluationVerificationAttemptGrantReceiptBase{
		Format: evaluationVerificationAttemptGrantReceiptFormat, Version: evaluationVerificationAttemptGrantVersion,
		NamespaceID: issue.NamespaceID, EvaluationPlanDigest: issue.EvaluationPlanDigest,
		RepositoryCommit: issue.RepositoryCommit, EvaluationAttemptID: issue.EvaluationAttemptID,
		DescriptorDigest: issue.DescriptorDigest, CapabilityDescriptorDigest: issue.CapabilityDescriptorDigest,
		CaseID: issue.CaseID, Generation: issue.Generation,
		VerificationPlanDigest: issue.VerificationPlanDigest, CellID: issue.CellID,
		RequestDigest: issue.RequestDigest, IssuanceBindingDigest: bindingDigest, Grant: grant,
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		t.Fatal(err)
	}
	receipt := evaluationVerificationAttemptGrantReceipt{
		evaluationVerificationAttemptGrantReceiptBase: receiptBase,
		ReceiptDigest: receiptDigest,
	}
	record, replayed, err := repository.StoreEvaluationVerificationAttemptGrantReceipt(
		context.Background(), authority, partition, issue, receipt,
	)
	if err != nil || replayed {
		t.Fatalf("store grant cell=%s replayed=%v err=%v", cellID, replayed, err)
	}
	return record
}

func TestEvaluationAttemptAuthorityPostgreSQLLeaseGrantSetAndJournalFences(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	repositoryA, repositoryB := NewRepository(databaseA), NewRepository(databaseB)
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.attempt-authority.integration",
		NamespaceID: "evaluation.g4-attempt-authority",
	}
	if _, _, err := repositoryA.StoreEvaluationPlan(context.Background(), authority, vector.Facts.Plan); err != nil {
		t.Fatal(err)
	}
	partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil || len(planned) == 0 {
		t.Fatalf("planned attempts=%d err=%v", len(planned), err)
	}
	expected := planned[0]
	leaseAcquiredAt := plan.PlannedAt.Add(time.Millisecond)
	window := plan.ExpiresAt.Sub(leaseAcquiredAt)
	if window < 4*time.Second {
		t.Fatalf("plan window=%s is too short for authority integration", window)
	}
	leaseExpiresAt := leaseAcquiredAt.Add(window * 3 / 4)
	claimAt := leaseAcquiredAt.Add(window / 2)
	lease, replayed, err := repositoryA.ClaimEvaluationShard(
		context.Background(), authority, plan.PlanDigest, expected.ShardID,
		"evaluation-worker.integration", leaseAcquiredAt, leaseExpiresAt,
	)
	if err != nil || replayed || lease.Generation < 1 {
		t.Fatalf("lease=%#v replayed=%v err=%v", lease, replayed, err)
	}
	grantIssuedAt := leaseAcquiredAt.Add(window / 4)
	records := []EvaluationVerificationAttemptGrantReceiptRecord{
		storeEvaluationAttemptAuthorityGrantReceipt(
			t, repositoryA, authority, partition, expected, "cell.attempt-authority.a", 5,
			grantIssuedAt, leaseExpiresAt,
		),
		storeEvaluationAttemptAuthorityGrantReceipt(
			t, repositoryA, authority, partition, expected, "cell.attempt-authority.b", 5,
			grantIssuedAt, leaseExpiresAt,
		),
	}
	fullSetDigest, err := evaluationVerificationAttemptGrantReceiptSetDigest(records)
	if err != nil {
		t.Fatal(err)
	}
	subsetDigest, err := evaluationVerificationAttemptGrantReceiptSetDigest(records[:1])
	if err != nil {
		t.Fatal(err)
	}
	emptyObservationSetDigest, err := evaluationProviderCapabilityObservationReceiptSetDigest(nil)
	if err != nil {
		t.Fatal(err)
	}
	binding := EvaluationControlledAuthorityRequestBinding{
		ServiceKind: "provider-capability", Operation: "tool.execute",
		RouteBinding:              "capability-runtime/execute-tool",
		RequestDigest:             evaluationServiceTestDigest(t, "attempt-authority-pg-request"),
		RequestBindingDigest:      evaluationServiceTestDigest(t, "attempt-authority-pg-binding"),
		OwnerImplementationDigest: evaluationServiceTestDigest(t, "attempt-authority-pg-owner-implementation"),
		AttemptID:                 expected.AttemptID, DescriptorDigest: expected.DescriptorDigest,
		ShardLeaseOwnerID: lease.OwnerID, ShardLeaseGeneration: lease.Generation,
		VerificationGrantGeneration: 5, VerificationGrantReceiptSetDigest: fullSetDigest,
		ProviderCapabilityObservationReceiptSetDigest: emptyObservationSetDigest,
	}
	negative := []struct {
		name   string
		mutate func(*EvaluationControlledAuthorityRequestBinding)
	}{
		{name: "same generation wrong owner", mutate: func(value *EvaluationControlledAuthorityRequestBinding) {
			value.ShardLeaseOwnerID = "evaluation-worker.impersonated"
		}},
		{name: "stale shard generation", mutate: func(value *EvaluationControlledAuthorityRequestBinding) {
			value.ShardLeaseGeneration++
		}},
		{name: "grant subset", mutate: func(value *EvaluationControlledAuthorityRequestBinding) {
			value.VerificationGrantReceiptSetDigest = subsetDigest
		}},
		{name: "grant set swap", mutate: func(value *EvaluationControlledAuthorityRequestBinding) {
			value.VerificationGrantReceiptSetDigest = evaluationServiceTestDigest(t, "attempt-authority-swapped-set")
		}},
		{name: "grant generation swap", mutate: func(value *EvaluationControlledAuthorityRequestBinding) {
			value.VerificationGrantGeneration++
		}},
		{name: "descriptor swap", mutate: func(value *EvaluationControlledAuthorityRequestBinding) {
			value.DescriptorDigest = evaluationServiceTestDigest(t, "attempt-authority-swapped-descriptor")
		}},
		{name: "attempt swap", mutate: func(value *EvaluationControlledAuthorityRequestBinding) {
			value.AttemptID = "evaluation-attempt.swapped"
		}},
	}
	for index, test := range negative {
		candidate := binding
		candidate.RequestDigest = evaluationServiceTestDigest(t, "attempt-authority-negative-request-"+test.name)
		candidate.RequestBindingDigest = evaluationServiceTestDigest(t, "attempt-authority-negative-binding-"+test.name)
		test.mutate(&candidate)
		if _, _, err := repositoryA.ClaimEvaluationControlledAuthorityRequest(
			context.Background(), authority, partition, candidate, claimAt.Add(time.Duration(index)*time.Nanosecond),
		); !errors.Is(err, ErrConflict) {
			t.Fatalf("%s error=%v, want conflict", test.name, err)
		}
	}
	claimed, created, err := repositoryA.ClaimEvaluationControlledAuthorityRequest(
		context.Background(), authority, partition, binding, claimAt,
	)
	if err != nil || !created || claimed.State != "claimed" ||
		claimed.OwnerImplementationDigest != binding.OwnerImplementationDigest {
		t.Fatalf("claim=%#v created=%v err=%v", claimed, created, err)
	}
	replayedClaim, created, err := repositoryB.ClaimEvaluationControlledAuthorityRequest(
		context.Background(), authority, partition, binding, claimAt.Add(time.Millisecond),
	)
	if err != nil || created || replayedClaim.ClaimedAt != claimed.ClaimedAt {
		t.Fatalf("replay=%#v created=%v err=%v", replayedClaim, created, err)
	}
	stageDigest := evaluationServiceTestDigest(t, "attempt-authority-pg-stage")
	dispatched, replayed, err := repositoryA.MarkEvaluationAttemptAuthorityDispatched(
		context.Background(), authority, partition, binding, 1, stageDigest,
		emptyObservationSetDigest, claimAt.Add(time.Millisecond),
	)
	if err != nil || replayed || dispatched.State != "dispatched" {
		t.Fatalf("dispatch=%#v replayed=%v err=%v", dispatched, replayed, err)
	}
	result := map[string]any{"public": "bounded"}
	resultDigest, err := canonicaljson.Digest(result)
	if err != nil {
		t.Fatal(err)
	}
	specificReceiptDigest := evaluationServiceTestDigest(t, "attempt-authority-pg-specific")
	ownerResponse, err := canonicaljson.Bytes(map[string]any{
		"outcome": "supported", "result": result, "resultDigest": resultDigest,
		"continuationReceiptDigest": specificReceiptDigest,
		"specificReceipts": []any{map[string]any{
			"receiptKind": "capability-unavailable-receipt", "receiptDigest": specificReceiptDigest,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	journalResponseDigest, err := evaluationCanonicalByteDigest(
		ownerResponse, maximumEvaluationAttemptAuthorityResponseBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	executeBinding := evaluationAttemptAuthorityExecuteBinding{
		InvocationID: "invocation.pg", TurnIndex: 0, ToolID: "web-search",
		ToolCallID: "tool-call.pg", ProviderToolCallID: "provider-tool-call.pg",
		ProviderRequestDigest: evaluationServiceTestDigest(t, "attempt-authority-pg-provider-request"),
	}
	responseProjection, projectionDigest, err := evaluationAttemptAuthorityResponseProjection(
		"capability-runtime", "execute-tool", ownerResponse, &executeBinding, nil,
	)
	if err != nil || projectionDigest == journalResponseDigest {
		t.Fatalf("projection=%s raw=%s err=%v", projectionDigest, journalResponseDigest, err)
	}
	ownerReceipt, err := createEvaluationAttemptAuthorityOwnerReceipt(
		authority, partition, binding, responseProjection, claimAt.Add(2*time.Millisecond),
	)
	if err != nil {
		t.Fatal(err)
	}
	dispatchAckDigest := evaluationServiceTestDigest(t, "attempt-authority-pg-dispatch-ack")
	sealed, storedReceipt, replayed, err := repositoryA.SealEvaluationAttemptAuthorityRequest(
		context.Background(), authority, partition, binding, 1, journalResponseDigest,
		ownerResponse, dispatchAckDigest, nil, ownerReceipt,
	)
	if err != nil || replayed || sealed.State != "sealed" ||
		storedReceipt.ReceiptDigest != ownerReceipt.ReceiptDigest ||
		storedReceipt.ServiceKind != "capability-runtime" || storedReceipt.ResponseDigest != projectionDigest {
		t.Fatalf("sealed=%#v receipt=%#v replayed=%v err=%v", sealed, storedReceipt, replayed, err)
	}
	driftedCandidate, err := createEvaluationAttemptAuthorityOwnerReceipt(
		authority, partition, binding, responseProjection, claimAt.Add(3*time.Millisecond),
	)
	if err != nil {
		t.Fatal(err)
	}
	_, replayReceipt, replayed, err := repositoryB.SealEvaluationAttemptAuthorityRequest(
		context.Background(), authority, partition, binding, 1, journalResponseDigest,
		ownerResponse, dispatchAckDigest, nil, driftedCandidate,
	)
	if err != nil || !replayed || replayReceipt.ReceiptDigest != ownerReceipt.ReceiptDigest ||
		!bytes.Equal(replayReceipt.ReceiptBytes, ownerReceipt.ReceiptBytes) {
		t.Fatalf("seal replay=%#v replayed=%v err=%v", replayReceipt, replayed, err)
	}
}
