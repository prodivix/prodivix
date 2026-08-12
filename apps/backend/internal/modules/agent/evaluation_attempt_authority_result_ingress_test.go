package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationAttemptAuthorityResultIngressFixture struct {
	Authority         EvaluationAuthority
	Partition         EvaluationPlanPartition
	Plan              evaluationPlanFact
	Binding           EvaluationControlledAuthorityRequestBinding
	StageDigest       string
	Response          []byte
	ResponseDigest    string
	DispatchAckDigest string
	Ingress           map[string]any
	IngressDigest     string
	ReceiptDigest     string
}

func evaluationAttemptAuthorityTestResultIngressFixture(
	t *testing.T,
) evaluationAttemptAuthorityResultIngressFixture {
	t.Helper()
	effect := evaluationOptionalFactTestEffectFixture(
		t, "provider.isolated-cache", "sealed-provider-response-metadata", "produced",
		evaluationOptionalFactTestCacheFact(t),
	)
	intent, err := decodeCanonicalEvaluationObject(effect.Owner.PreEffectIntentBytes, 16_384)
	if err != nil {
		t.Fatal(err)
	}
	observationSetDigest := evaluationServiceTestDigest(t, "shared-effect-prior-observation-set")
	envelope := map[string]any{
		"namespaceId": effect.Authority.NamespaceID, "planDigest": effect.Partition.PlanDigest,
		"repositoryCommit": effect.Partition.RepositoryCommit, "attemptId": effect.Request.AttemptID,
		"descriptorDigest": effect.Request.DescriptorDigest, "shardLeaseOwnerId": "shard-owner.shared-effect",
		"shardLeaseGeneration": json.Number("1"), "verificationGrantGeneration": json.Number("1"),
		"verificationAttemptGrantReceiptSetDigest": evaluationServiceTestDigest(t, "shared-effect-grants"),
		"requestDigest": effect.Owner.RequestDigest,
	}
	route, _ := evaluationAttemptAuthorityRouteFor([]string{"capability-runtime", "execute-tool"})
	binding, err := evaluationAttemptAuthorityRequestBinding(
		effect.Partition, route, envelope, observationSetDigest, effect.Owner.OwnerImplementationDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	binding.PreEffectIntentDigest = stringMember(intent, "intentDigest")
	binding.PreEffectIntentBytes = append([]byte(nil), effect.Owner.PreEffectIntentBytes...)
	dispatchEnvelope := evaluationAttemptAuthorityIngressEnvelope(effect.Authority, effect.Partition, binding)
	stageDigest, err := evaluationAttemptAuthorityDispatchStageDigest(
		route, effect.Partition, dispatchEnvelope, observationSetDigest, effect.Owner.OwnerImplementationDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	responseDigest, err := evaluationCanonicalByteDigest(
		effect.Owner.ResponseBytes, maximumEvaluationAttemptAuthorityResponseBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	var response any
	if err := decodeEvaluationServiceRawJSON(effect.Owner.ResponseBytes, &response); err != nil {
		t.Fatal(err)
	}
	canonicalResponse, err := canonicaljson.Bytes(response)
	if err != nil {
		t.Fatal(err)
	}
	ingress := map[string]any{
		"format": evaluationAttemptAuthorityResultIngressFormat, "version": evaluationAttemptAuthorityVersion,
		"namespaceId": effect.Authority.NamespaceID, "planDigest": effect.Partition.PlanDigest,
		"repositoryCommit": effect.Partition.RepositoryCommit, "serviceKind": binding.ServiceKind,
		"operation": binding.Operation, "routeBinding": binding.RouteBinding,
		"attemptId": binding.AttemptID, "descriptorDigest": binding.DescriptorDigest,
		"shardLeaseOwnerId": binding.ShardLeaseOwnerID, "shardLeaseGeneration": binding.ShardLeaseGeneration,
		"verificationGrantGeneration":                   binding.VerificationGrantGeneration,
		"verificationAttemptGrantReceiptSetDigest":      binding.VerificationGrantReceiptSetDigest,
		"providerCapabilityObservationReceiptSetDigest": binding.ProviderCapabilityObservationReceiptSetDigest,
		"requestDigest": binding.RequestDigest, "requestBindingDigest": binding.RequestBindingDigest,
		"ownerImplementationDigest": binding.OwnerImplementationDigest, "stageDigest": stageDigest,
		"preEffectIntent": intent, "preEffectIntentDigest": binding.PreEffectIntentDigest,
		"response": response, "responseDigest": responseDigest,
	}
	dispatchAckDigest, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, effect.Partition, ingress, observationSetDigest, stageDigest,
		effect.Owner.OwnerImplementationDigest, canonicalResponse,
	)
	if err != nil {
		t.Fatal(err)
	}
	ingress["dispatchAckDigest"] = dispatchAckDigest
	ingressDigest, err := canonicaljson.Digest(ingress)
	if err != nil {
		t.Fatal(err)
	}
	ingress["ingressDigest"] = ingressDigest
	receiptDigest, err := evaluationAttemptAuthorityResultIngressReceiptDigest(
		binding.RequestDigest, ingressDigest, responseDigest, dispatchAckDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	plannedAt := time.Date(2026, time.August, 9, 5, 0, 0, 0, time.UTC)
	return evaluationAttemptAuthorityResultIngressFixture{
		Authority: effect.Authority, Partition: effect.Partition,
		Plan: evaluationPlanFact{
			PlanID: "plan/shared-effect", PlanDigest: effect.Partition.PlanDigest,
			RepositoryCommit: effect.Partition.RepositoryCommit, PlannedAt: plannedAt,
			ExpiresAt: plannedAt.Add(7 * 24 * time.Hour),
		},
		Binding: binding, StageDigest: stageDigest, Response: canonicalResponse,
		ResponseDigest: responseDigest, DispatchAckDigest: dispatchAckDigest,
		Ingress: ingress, IngressDigest: ingressDigest, ReceiptDigest: receiptDigest,
	}
}

func evaluationAttemptAuthorityTestResultIngressHandler(
	t *testing.T,
	fixture evaluationAttemptAuthorityResultIngressFixture,
	scanner *evaluationAttemptAuthorityTestScanner,
) (*EvaluationServiceHandler, *evaluationAttemptAuthorityTestRepository) {
	t.Helper()
	repository := &evaluationAttemptAuthorityTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: fixture.Plan},
		record: EvaluationControlledAuthorityRequestRecord{
			NamespaceID: fixture.Authority.NamespaceID, PlanDigest: fixture.Partition.PlanDigest,
			RepositoryCommit: fixture.Partition.RepositoryCommit, V46Eligible: true,
			EvaluationControlledAuthorityRequestBinding: fixture.Binding,
			State: "dispatched", ClaimGeneration: 1, StageDigest: fixture.StageDigest,
			DispatchedAt: time.Date(2026, time.August, 9, 5, 0, 1, 0, time.UTC),
		},
	}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: fixture.Authority.NamespaceID, ServiceToken: evaluationServiceTestToken,
		AttemptAuthorityResponseScanner: scanner,
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler, repository
}

func evaluationAttemptAuthorityTestResultIngressRequest(
	t *testing.T,
	fixture evaluationAttemptAuthorityResultIngressFixture,
	value map[string]any,
) *http.Request {
	t.Helper()
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	target := fmt.Sprintf(
		"/v1/evaluations/%s/%s/%s/attempt-authority-results",
		fixture.Authority.NamespaceID, fixture.Partition.PlanDigest, fixture.Partition.RepositoryCommit,
	)
	request := authorizedEvaluationServiceRequest(http.MethodPost, target, bytes.NewReader(source))
	request.Header.Set("Idempotency-Key", fixture.Binding.RequestDigest)
	return request
}

func TestEvaluationAttemptAuthorityResultIngressSealsBeforeReturnAndReplaysExact(t *testing.T) {
	fixture := evaluationAttemptAuthorityTestResultIngressFixture(t)
	handler, repository := evaluationAttemptAuthorityTestResultIngressHandler(
		t, fixture, &evaluationAttemptAuthorityTestScanner{},
	)
	for replay := 0; replay < 2; replay++ {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, evaluationAttemptAuthorityTestResultIngressRequest(t, fixture, fixture.Ingress))
		if response.Code != http.StatusOK {
			t.Fatalf("replay=%d status=%d body=%s", replay, response.Code, response.Body.String())
		}
		body, err := decodeCanonicalEvaluationObject(response.Body.Bytes(), maximumEvaluationServiceControlBytes)
		if err != nil || body["replayed"] != (replay == 1) ||
			stringMember(body, "resultIngressReceiptDigest") != fixture.ReceiptDigest ||
			stringMember(body, "responseDigest") != fixture.ResponseDigest ||
			stringMember(body, "dispatchAckDigest") != fixture.DispatchAckDigest {
			t.Fatalf("replay=%d body=%s err=%v", replay, response.Body.String(), err)
		}
	}
	if repository.ownerResultCalls != 2 || repository.record.State != "dispatched" ||
		repository.record.ResponseDigest != fixture.ResponseDigest ||
		!bytes.Equal(repository.record.ResponseBytes, fixture.Response) ||
		repository.record.DispatchAckDigest != fixture.DispatchAckDigest {
		t.Fatalf("durable result drifted: calls=%d record=%#v", repository.ownerResultCalls, repository.record)
	}
}

func TestEvaluationAttemptAuthorityResultIngressRejectsRecomputedFakeFenceAndCanary(t *testing.T) {
	fixture := evaluationAttemptAuthorityTestResultIngressFixture(t)
	scanner := &evaluationAttemptAuthorityTestScanner{}
	handler, repository := evaluationAttemptAuthorityTestResultIngressHandler(t, fixture, scanner)

	swapped := cloneEvaluationObject(fixture.Ingress)
	delete(swapped, "ingressDigest")
	swapped["stageDigest"] = evaluationServiceTestDigest(t, "recomputed-fake-stage")
	envelope := evaluationAttemptAuthorityIngressEnvelope(fixture.Authority, fixture.Partition, fixture.Binding)
	route, _ := evaluationAttemptAuthorityRouteFor([]string{"capability-runtime", "execute-tool"})
	ack, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, fixture.Partition, envelope, fixture.Binding.ProviderCapabilityObservationReceiptSetDigest,
		stringMember(swapped, "stageDigest"), fixture.Binding.OwnerImplementationDigest, fixture.Response,
	)
	if err != nil {
		t.Fatal(err)
	}
	swapped["dispatchAckDigest"] = ack
	swapped["ingressDigest"] = ownerStateTestDigest(t, swapped)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, evaluationAttemptAuthorityTestResultIngressRequest(t, fixture, swapped))
	if response.Code != http.StatusConflict || repository.ownerResultCalls != 0 {
		t.Fatalf("fully recomputed fake fence reached repository: status=%d calls=%d body=%s",
			response.Code, repository.ownerResultCalls, response.Body.String())
	}

	scanner.reject = true
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, evaluationAttemptAuthorityTestResultIngressRequest(t, fixture, fixture.Ingress))
	if response.Code != http.StatusForbidden || repository.ownerResultCalls != 0 {
		t.Fatalf("dynamic scanner rejection reached repository: status=%d calls=%d body=%s",
			response.Code, repository.ownerResultCalls, response.Body.String())
	}

	missing := cloneEvaluationObject(fixture.Ingress)
	delete(missing, "preEffectIntent")
	delete(missing, "ingressDigest")
	missing["ingressDigest"] = ownerStateTestDigest(t, missing)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, evaluationAttemptAuthorityTestResultIngressRequest(t, fixture, missing))
	if response.Code != http.StatusBadRequest || repository.ownerResultCalls != 0 {
		t.Fatalf("omitted pre-effect authority reached repository: status=%d calls=%d body=%s",
			response.Code, repository.ownerResultCalls, response.Body.String())
	}
}

func TestEvaluationAttemptAuthorityResultIngressResponseShapeIsCanonical(t *testing.T) {
	fixture := evaluationAttemptAuthorityTestResultIngressFixture(t)
	source := mustCanonicalEvaluationAttemptAuthorityIngress(t, fixture.Ingress)
	value, binding, response, responseDigest, ingressDigest, err := decodeEvaluationAttemptAuthorityResultIngress(
		source, fixture.Authority, fixture.Partition,
	)
	if err != nil || binding.RequestDigest != fixture.Binding.RequestDigest ||
		!bytes.Equal(response, fixture.Response) || responseDigest != fixture.ResponseDigest ||
		ingressDigest != fixture.IngressDigest || stringMember(value, "requestBindingDigest") != fixture.Binding.RequestBindingDigest {
		t.Fatalf("decode binding=%#v responseDigest=%s ingress=%s err=%v", binding, responseDigest, ingressDigest, err)
	}
}

func mustCanonicalEvaluationAttemptAuthorityIngress(t *testing.T, value map[string]any) []byte {
	t.Helper()
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	var decoded any
	if err := json.Unmarshal(source, &decoded); err != nil {
		t.Fatal(err)
	}
	return source
}
