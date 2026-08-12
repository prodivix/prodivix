package agent

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationCapabilityProbeProviderResourceTestFixture(
	t *testing.T,
) (EvaluationAuthority, evaluationCapabilityProbeProviderResourceRegistrationRequest, evaluationCapabilityProbeProviderResourceResult, time.Time, time.Time, string) {
	t.Helper()
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "evaluation.probe-resource-test",
	}
	providers := make(map[string]map[string]any)
	for _, raw := range plan.Value["providerConfigurations"].([]any) {
		provider := raw.(map[string]any)
		providers[stringMember(provider, "providerConfigurationId")] = provider
	}
	models := make(map[string]map[string]any)
	for _, raw := range plan.Value["modelConfigurations"].([]any) {
		model := raw.(map[string]any)
		models[stringMember(model, "lineageDigest")] = model
	}
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		target := raw.(map[string]any)
		if stringMember(target, "protocolFamily") != "gemini-interactions" ||
			stringMember(target, "capabilityProfileId") != "g4-provider-hosted-retrieval-core" {
			continue
		}
		optional, ok := objectMember(target, "optionalCapabilitySupportAuthority")
		if !ok {
			t.Fatal("retrieval target has no optional authority")
		}
		program, programErr := expectedEvaluationCapabilityProbeProgram(
			stringMember(optional, "qualificationCapabilityProfileId"),
			stringMember(optional, "qualificationCapabilityProfileDigest"),
		)
		if programErr != nil {
			t.Fatal(programErr)
		}
		request, result, claimedAt := evaluationCapabilityProbePlanTestResource(
			t, plan, authority, target,
			providers[stringMember(target, "providerConfigurationId")],
			models[stringMember(target, "modelLineageDigest")], program,
		)
		if request == nil || result == nil {
			t.Fatal("supported retrieval target has no resource fixture")
		}
		return authority, *request, *result, claimedAt, plan.PlannedAt,
			evaluationBoundedExportTestDigest(t, "provider-resource-owner-implementation")
	}
	t.Fatal("vector has no Gemini retrieval resource target")
	return EvaluationAuthority{}, evaluationCapabilityProbeProviderResourceRegistrationRequest{},
		evaluationCapabilityProbeProviderResourceResult{}, time.Time{}, time.Time{}, ""
}

type evaluationCapabilityProbeProviderResourceTestRepository struct {
	record        EvaluationCapabilityProbeProviderResourceRegistrationRecord
	claimCalls    int
	dispatchCalls int
	storeCalls    int
	sealCalls     int
}

func (repository *evaluationCapabilityProbeProviderResourceTestRepository) ClaimEvaluationCapabilityProbeProviderResource(
	_ context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	ownerImplementationDigest string,
	claimedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error) {
	repository.claimCalls++
	if repository.record.State != "" {
		return repository.record, true, nil
	}
	repository.record = EvaluationCapabilityProbeProviderResourceRegistrationRecord{
		NamespaceID: request.NamespaceID, RepositoryCommit: request.RepositoryCommit, RequestDigest: request.RequestDigest,
		State: "claimed", ClaimGeneration: 1, ProviderConfigurationID: request.ProviderConfigurationID,
		ProviderConfigurationDigest: request.ProviderConfigurationDigest, ProtocolFamily: request.ProtocolFamily,
		ModelID: request.ModelID, ModelLineageDigest: request.ModelLineageDigest, AdapterDigest: request.AdapterDigest,
		CapabilityProfileID: request.CapabilityProfileID, ProbeProgramDigest: request.ProbeProgramDigest,
		PublicResourceDescriptorDigest: request.PublicResourceDigest, MinimumExpiresAt: request.MinimumExpiresAt,
		OwnerImplementationDigest: ownerImplementationDigest, AuthorityIssuerID: authority.PrincipalID,
		RequestBytes: append([]byte(nil), request.Bytes...), ClaimedAt: claimedAt, V46Eligible: true,
	}
	return repository.record, false, nil
}

func (repository *evaluationCapabilityProbeProviderResourceTestRepository) MarkEvaluationCapabilityProbeProviderResourceDispatched(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeProviderResourceRegistrationRequest,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error) {
	repository.dispatchCalls++
	repository.record.State, repository.record.StageDigest = "dispatched", stageDigest
	repository.record.DispatchedAt = dispatchedAt
	return repository.record, false, nil
}

func (repository *evaluationCapabilityProbeProviderResourceTestRepository) GetEvaluationCapabilityProbeProviderResource(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeProviderResourceRegistrationRequest,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, error) {
	if repository.record.State == "" {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, ErrNotFound
	}
	return repository.record, nil
}

func (repository *evaluationCapabilityProbeProviderResourceTestRepository) StoreEvaluationCapabilityProbeProviderResourceResult(
	_ context.Context,
	_ EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	stageDigest string,
	ingressDigest string,
	result evaluationCapabilityProbeProviderResourceResult,
	ownerAdmissionDigest string,
	dispatchAckDigest string,
	storedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error) {
	repository.storeCalls++
	replayed := repository.record.DispatchAckDigest != ""
	receiptDigest, err := evaluationCapabilityProbeProviderResourceIngressReceiptDigest(
		request.RequestDigest, ingressDigest, result.ResultDigest, dispatchAckDigest,
	)
	if err != nil || repository.record.State != "dispatched" || repository.record.StageDigest != stageDigest {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, ErrConflict
	}
	repository.record.ResourceResultDigest = result.ResultDigest
	repository.record.OwnerAdmissionDigest = ownerAdmissionDigest
	repository.record.DispatchAckDigest = dispatchAckDigest
	repository.record.ResultIngressDigest = ingressDigest
	repository.record.ResultIngressReceiptDigest = receiptDigest
	repository.record.ResourceManifestDigest = result.ResourceManifestDigest
	repository.record.ContentUploadReceiptDigest = result.ContentUploadReceiptDigest
	repository.record.DeletionAuthorityReceiptDigest = result.DeletionAuthorityReceiptDigest
	repository.record.ProviderResourceAuthorityDigest = result.ProviderResourceAuthorityDigest
	repository.record.RegisteredAt, repository.record.ExpiresAt = result.RegisteredAt, result.ExpiresAt
	repository.record.ResultBytes = append([]byte(nil), result.Bytes...)
	repository.record.DispatchedAt = storedAt
	return repository.record, replayed, nil
}

func (repository *evaluationCapabilityProbeProviderResourceTestRepository) SealEvaluationCapabilityProbeProviderResource(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeProviderResourceRegistrationRequest,
	receiptDigest string,
	response []byte,
	sealedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error) {
	repository.sealCalls++
	replayed := repository.record.State == "sealed"
	repository.record.State = "sealed"
	repository.record.RegistrationReceiptDigest = receiptDigest
	repository.record.ResponseBytes = append([]byte(nil), response...)
	repository.record.SealedAt = sealedAt
	return repository.record, replayed, nil
}

type evaluationCapabilityProbeProviderResourceTestAuthority struct {
	repository           *evaluationCapabilityProbeProviderResourceTestRepository
	authority            EvaluationAuthority
	request              evaluationCapabilityProbeProviderResourceRegistrationRequest
	result               evaluationCapabilityProbeProviderResourceResult
	implementationDigest string
	ingressDigest        string
	storedAt             time.Time
	executeCalls         int
	reconcileCalls       int
}

func (authority *evaluationCapabilityProbeProviderResourceTestAuthority) CapabilityProbeProviderResourceImplementationDigest() (string, bool) {
	return authority.implementationDigest, true
}

func (authority *evaluationCapabilityProbeProviderResourceTestAuthority) StageCapabilityProbeProviderResource(
	_ context.Context,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) (string, error) {
	return evaluationCapabilityProbeProviderResourceStageDigest(authority.request, request.OwnerImplementationDigest)
}

func (authority *evaluationCapabilityProbeProviderResourceTestAuthority) ExecuteCapabilityProbeProviderResource(
	ctx context.Context,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) (EvaluationCapabilityProbeProviderResourceAuthorityResult, error) {
	authority.executeCalls++
	ownerAdmissionDigest, _ := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
		request.RequestDigest, authority.result.ResultDigest, request.OwnerImplementationDigest, request.StageDigest,
	)
	dispatchAckDigest, _ := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
		request.RequestDigest, authority.result.ResultDigest, ownerAdmissionDigest,
		request.OwnerImplementationDigest, request.StageDigest,
	)
	record, _, err := authority.repository.StoreEvaluationCapabilityProbeProviderResourceResult(
		ctx, authority.authority, authority.request, request.StageDigest, authority.ingressDigest,
		authority.result, ownerAdmissionDigest, dispatchAckDigest, authority.storedAt,
	)
	return EvaluationCapabilityProbeProviderResourceAuthorityResult{
		ResourceResultDigest: record.ResourceResultDigest, OwnerAdmissionDigest: record.OwnerAdmissionDigest,
		ResultIngressReceiptDigest: record.ResultIngressReceiptDigest,
	}, err
}

func (authority *evaluationCapabilityProbeProviderResourceTestAuthority) ReconcileCapabilityProbeProviderResource(
	_ context.Context,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) (EvaluationCapabilityProbeProviderResourceAuthorityResult, bool, error) {
	authority.reconcileCalls++
	if request.DispatchAckDigest != authority.repository.record.DispatchAckDigest ||
		request.ResultIngressDigest != authority.repository.record.ResultIngressDigest ||
		request.ResultIngressReceiptDigest != authority.repository.record.ResultIngressReceiptDigest ||
		!bytes.Equal(request.SealedProviderResourceResult, authority.repository.record.ResultBytes) {
		return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, false, ErrConflict
	}
	return EvaluationCapabilityProbeProviderResourceAuthorityResult{
		ResourceResultDigest:       authority.repository.record.ResourceResultDigest,
		OwnerAdmissionDigest:       authority.repository.record.OwnerAdmissionDigest,
		ResultIngressReceiptDigest: authority.repository.record.ResultIngressReceiptDigest,
	}, true, nil
}

func evaluationCapabilityProbeProviderResourceTestHTTP(
	t *testing.T,
	handler http.Handler,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	token string,
) *httptest.ResponseRecorder {
	t.Helper()
	httpRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/evaluations/"+request.NamespaceID+"/capability-probe-provider-resource-registrations",
		bytes.NewReader(request.Bytes),
	)
	httpRequest.Header.Set("Authorization", "Bearer "+token)
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", request.RequestDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httpRequest)
	return response
}

func TestEvaluationCapabilityProbeProviderResourceSealsOnlyAfterDurableResultIngress(t *testing.T) {
	authorityIdentity, request, result, claimedAt, now, implementationDigest :=
		evaluationCapabilityProbeProviderResourceTestFixture(t)
	repository := &evaluationCapabilityProbeProviderResourceTestRepository{}
	ingressDigest, _ := canonicaljson.Digest(map[string]any{"providerResourceIngress": request.RequestDigest})
	owner := &evaluationCapabilityProbeProviderResourceTestAuthority{
		repository: repository, authority: authorityIdentity, request: request, result: result,
		implementationDigest: implementationDigest, ingressDigest: ingressDigest, storedAt: now,
	}
	clockCalls := 0
	clock := func() time.Time {
		clockCalls++
		if clockCalls == 1 {
			return claimedAt
		}
		return now
	}
	const token = "provider-resource-ledger-token-00000000000001"
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: request.NamespaceID, ServiceToken: token,
		CapabilityProbeProviderResourceAuthority: owner, Clock: clock,
	})
	if err != nil {
		t.Fatal(err)
	}
	response := evaluationCapabilityProbeProviderResourceTestHTTP(t, handler, request, token)
	if response.Code != http.StatusOK || owner.executeCalls != 1 || owner.reconcileCalls != 0 ||
		repository.storeCalls != 1 || repository.sealCalls != 1 || repository.record.State != "sealed" {
		t.Fatalf("status=%d execute=%d reconcile=%d store=%d seal=%d state=%s body=%s",
			response.Code, owner.executeCalls, owner.reconcileCalls, repository.storeCalls,
			repository.sealCalls, repository.record.State, response.Body.String())
	}
	first := append([]byte(nil), response.Body.Bytes()...)
	replay := evaluationCapabilityProbeProviderResourceTestHTTP(t, handler, request, token)
	if replay.Code != http.StatusOK || !bytes.Equal(first, replay.Body.Bytes()) || owner.executeCalls != 1 ||
		repository.storeCalls != 1 || repository.sealCalls != 1 {
		t.Fatalf("replay status=%d execute=%d store=%d seal=%d body=%s",
			replay.Code, owner.executeCalls, repository.storeCalls, repository.sealCalls, replay.Body.String())
	}
}

func TestEvaluationCapabilityProbeProviderResourceRejectsRecommittedInvalidDeletionProjection(t *testing.T) {
	_, request, result, claimedAt, now, _ := evaluationCapabilityProbeProviderResourceTestFixture(t)
	value, err := decodeCanonicalEvaluationObject(result.Bytes, maximumEvaluationCapabilityProbeProviderResourceResultBytes)
	if err != nil {
		t.Fatal(err)
	}
	deletion, ok := objectMember(value, "deletionAuthorityReceipt")
	if !ok {
		t.Fatal("provider resource result has no deletion authority receipt")
	}
	projection, ok := objectMember(deletion, "deletionRequestProjection")
	if !ok {
		t.Fatal("deletion authority receipt has no request projection")
	}
	projection["auxiliaryResourceIds"] = []any{result.ProviderResourceID}
	projectionDigest, _ := canonicaljson.Digest(projection)
	deletion["deletionRequestProjectionDigest"] = projectionDigest
	deletionBase := cloneEvaluationObject(deletion)
	delete(deletionBase, "deletionAuthorityReceiptDigest")
	deletion["deletionAuthorityReceiptDigest"], _ = canonicaljson.Digest(deletionBase)
	resultBase := cloneEvaluationObject(value)
	delete(resultBase, "resultDigest")
	value["resultDigest"], _ = canonicaljson.Digest(resultBase)
	if _, err := decodeEvaluationCapabilityProbeProviderResourceResult(value, request, claimedAt, now); err == nil {
		t.Fatal("fully recommitted deletion projection containing its primary resource was accepted")
	}
}

func TestEvaluationCapabilityProbeProviderResourceACKLossReconcilesSealedResultWithoutExecute(t *testing.T) {
	authorityIdentity, request, result, claimedAt, now, implementationDigest :=
		evaluationCapabilityProbeProviderResourceTestFixture(t)
	repository := &evaluationCapabilityProbeProviderResourceTestRepository{}
	_, _, _ = repository.ClaimEvaluationCapabilityProbeProviderResource(
		context.Background(), authorityIdentity, request, implementationDigest, claimedAt,
	)
	stageDigest, _ := evaluationCapabilityProbeProviderResourceStageDigest(request, implementationDigest)
	_, _, _ = repository.MarkEvaluationCapabilityProbeProviderResourceDispatched(
		context.Background(), authorityIdentity, request, stageDigest, claimedAt,
	)
	ingressDigest, _ := canonicaljson.Digest(map[string]any{"providerResourceIngress": request.RequestDigest})
	ownerAdmissionDigest, _ := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
		request.RequestDigest, result.ResultDigest, implementationDigest, stageDigest,
	)
	dispatchAckDigest, _ := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
		request.RequestDigest, result.ResultDigest, ownerAdmissionDigest, implementationDigest, stageDigest,
	)
	_, _, _ = repository.StoreEvaluationCapabilityProbeProviderResourceResult(
		context.Background(), authorityIdentity, request, stageDigest, ingressDigest,
		result, ownerAdmissionDigest, dispatchAckDigest, now,
	)
	owner := &evaluationCapabilityProbeProviderResourceTestAuthority{
		repository: repository, authority: authorityIdentity, request: request, result: result,
		implementationDigest: implementationDigest, ingressDigest: ingressDigest, storedAt: now,
	}
	const token = "provider-resource-ledger-token-00000000000001"
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: request.NamespaceID, ServiceToken: token,
		CapabilityProbeProviderResourceAuthority: owner, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	response := evaluationCapabilityProbeProviderResourceTestHTTP(t, handler, request, token)
	if response.Code != http.StatusOK || owner.executeCalls != 0 || owner.reconcileCalls != 1 ||
		repository.sealCalls != 1 || repository.record.State != "sealed" {
		t.Fatalf("status=%d execute=%d reconcile=%d seal=%d state=%s body=%s",
			response.Code, owner.executeCalls, owner.reconcileCalls, repository.sealCalls,
			repository.record.State, response.Body.String())
	}
}

func TestEvaluationCapabilityProbeProviderResourceLoopbackBindsDurableIngressAndSealedResult(t *testing.T) {
	_, request, result, _, _, implementationDigest := evaluationCapabilityProbeProviderResourceTestFixture(t)
	stageDigest, _ := evaluationCapabilityProbeProviderResourceStageDigest(request, implementationDigest)
	ownerAdmissionDigest, _ := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
		request.RequestDigest, result.ResultDigest, implementationDigest, stageDigest,
	)
	dispatchAckDigest, _ := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
		request.RequestDigest, result.ResultDigest, ownerAdmissionDigest, implementationDigest, stageDigest,
	)
	ingressDigest, _ := canonicaljson.Digest(map[string]any{"providerResourceIngress": request.RequestDigest})
	ingressReceiptDigest, _ := evaluationCapabilityProbeProviderResourceIngressReceiptDigest(
		request.RequestDigest, ingressDigest, result.ResultDigest, dispatchAckDigest,
	)
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, httpRequest *http.Request) {
		calls++
		source, err := io.ReadAll(httpRequest.Body)
		if err != nil {
			t.Fatal(err)
		}
		value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationLoopbackAuthorityBytes)
		if err != nil {
			t.Fatal(err)
		}
		mode := stringMember(value, "mode")
		required := []string{
			"format", "version", "serviceKind", "mode", "namespaceId", "repositoryCommit", "operation",
			"routeBinding", "requestDigest", "ownerImplementationDigest", "claimGeneration", "payload",
		}
		if mode == "execute" {
			required = append(required, "stageDigest")
		}
		if mode == "reconcile" {
			required = append(required, "stageDigest", "dispatchAckDigest", "resultIngressDigest",
				"resultIngressReceiptDigest", "sealedProviderResourceResult")
		}
		if !exactEvaluationKeys(value, required) || stringMember(value, "serviceKind") != "provider-capability" ||
			stringMember(value, "operation") != evaluationCapabilityProbeProviderResourceOperation ||
			stringMember(value, "routeBinding") != evaluationCapabilityProbeProviderResourceRouteBinding ||
			!bytes.Equal(mustEvaluationCanonicalBytes(t, value["payload"]), request.Bytes) {
			t.Fatalf("invalid %s provider resource loopback request: %#v", mode, value)
		}
		response := map[string]any{
			"format": evaluationLoopbackAuthorityResponseFormat, "version": evaluationLoopbackAuthorityVersion,
			"serviceKind": "provider-capability", "mode": mode, "requestDigest": request.RequestDigest,
			"ownerImplementationDigest": implementationDigest, "stageDigest": stageDigest,
		}
		if mode != "stage" {
			response["resourceResultDigest"] = result.ResultDigest
			response["ownerAdmissionDigest"] = ownerAdmissionDigest
			response["dispatchAckDigest"] = dispatchAckDigest
			response["resultIngressDigest"] = ingressDigest
			response["resultIngressReceiptDigest"] = ingressReceiptDigest
		}
		if mode == "reconcile" {
			response["reconciled"] = true
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, response)
	}))
	defer server.Close()
	client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: "provider-resource-owner-token-00000000000001", Purpose: "preplan",
	})
	if err != nil {
		t.Fatal(err)
	}
	client.capabilityProbeResourceImplementationDigest = implementationDigest
	authorityRequest := EvaluationCapabilityProbeProviderResourceAuthorityRequest{
		NamespaceID: request.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		RequestDigest: request.RequestDigest, OwnerImplementationDigest: implementationDigest,
		ClaimGeneration: 1, Request: request.Bytes,
	}
	actualStage, err := client.StageCapabilityProbeProviderResource(context.Background(), authorityRequest)
	if err != nil || actualStage != stageDigest {
		t.Fatalf("stage=%s err=%v", actualStage, err)
	}
	authorityRequest.StageDigest = stageDigest
	if _, err := client.ExecuteCapabilityProbeProviderResource(context.Background(), authorityRequest); err != nil {
		t.Fatal(err)
	}
	authorityRequest.DispatchAckDigest = dispatchAckDigest
	authorityRequest.ResultIngressDigest = ingressDigest
	authorityRequest.ResultIngressReceiptDigest = ingressReceiptDigest
	authorityRequest.SealedProviderResourceResult = result.Bytes
	if _, reconciled, err := client.ReconcileCapabilityProbeProviderResource(
		context.Background(), authorityRequest,
	); err != nil || !reconciled {
		t.Fatalf("reconciled=%v err=%v", reconciled, err)
	}
	forged := authorityRequest
	forged.ResultIngressDigest = evaluationBoundedExportTestDigest(t, "swapped-provider-resource-ingress")
	if _, _, err := client.ReconcileCapabilityProbeProviderResource(context.Background(), forged); err == nil || calls != 3 {
		t.Fatalf("forged ingress err=%v calls=%d", err, calls)
	}
	forged = authorityRequest
	forged.SealedProviderResourceResult = []byte(strings.Replace(
		string(result.Bytes), result.ProviderResourceID, result.ProviderResourceID+"-swap", 1,
	))
	if _, _, err := client.ReconcileCapabilityProbeProviderResource(context.Background(), forged); err == nil || calls != 3 {
		t.Fatalf("forged sealed result err=%v calls=%d", err, calls)
	}
	forged = authorityRequest
	forged.OwnerImplementationDigest = evaluationBoundedExportTestDigest(t, "swapped-provider-resource-owner")
	if _, _, err := client.ReconcileCapabilityProbeProviderResource(context.Background(), forged); err == nil || calls != 3 {
		t.Fatalf("forged provider resource implementation err=%v calls=%d", err, calls)
	}
}
