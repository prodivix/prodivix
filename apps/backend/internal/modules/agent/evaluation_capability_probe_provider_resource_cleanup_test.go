package agent

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationCapabilityProbeProviderResourceCleanupTestRepository struct {
	record        EvaluationCapabilityProbeProviderResourceCleanupRecord
	deletionBytes []byte
	listRecords   []evaluationCapabilityProbeProviderResourceCleanupListRecord
	claimCalls    int
	dispatchCalls int
	storeCalls    int
	sealCalls     int
}

func (repository *evaluationCapabilityProbeProviderResourceCleanupTestRepository) ListEvaluationCapabilityProbeProviderResourceCleanups(
	context.Context,
	EvaluationAuthority,
	string,
) ([]evaluationCapabilityProbeProviderResourceCleanupListRecord, error) {
	return repository.listRecords, nil
}

func (repository *evaluationCapabilityProbeProviderResourceCleanupTestRepository) ClaimEvaluationCapabilityProbeProviderResourceCleanup(
	_ context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	ownerImplementationDigest string,
	claimedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error) {
	repository.claimCalls++
	if repository.record.State != "" {
		return repository.record, true, nil
	}
	repository.record = EvaluationCapabilityProbeProviderResourceCleanupRecord{
		NamespaceID: authority.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		CleanupRequestDigest:              request.CleanupRequestDigest,
		ResourceRegistrationRequestDigest: request.ResourceRegistrationRequestDigest,
		DeletionAuthorityReceiptDigest:    request.DeletionAuthorityReceiptDigest,
		State:                             "claimed", ClaimGeneration: 1, OwnerImplementationDigest: ownerImplementationDigest,
		AuthorityIssuerID: authority.PrincipalID, RequestBytes: append([]byte(nil), request.Bytes...),
		DeletionAuthorityReceiptBytes: append([]byte(nil), repository.deletionBytes...),
		V46Eligible:                   true, ClaimedAt: claimedAt,
	}
	return repository.record, false, nil
}

func (repository *evaluationCapabilityProbeProviderResourceCleanupTestRepository) MarkEvaluationCapabilityProbeProviderResourceCleanupDispatched(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeProviderResourceCleanupRequest,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error) {
	repository.dispatchCalls++
	repository.record.State, repository.record.StageDigest = "dispatched", stageDigest
	repository.record.DispatchedAt = dispatchedAt
	return repository.record, false, nil
}

func (repository *evaluationCapabilityProbeProviderResourceCleanupTestRepository) GetEvaluationCapabilityProbeProviderResourceCleanup(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeProviderResourceCleanupRequest,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, error) {
	if repository.record.State == "" {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, ErrNotFound
	}
	return repository.record, nil
}

func (repository *evaluationCapabilityProbeProviderResourceCleanupTestRepository) StoreEvaluationCapabilityProbeProviderResourceCleanupResult(
	_ context.Context,
	_ EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	stageDigest string,
	receipt evaluationCapabilityProbeProviderResourceCleanupReceipt,
	ownerAdmissionDigest string,
	dispatchAckDigest string,
	storedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error) {
	repository.storeCalls++
	if repository.record.State != "dispatched" || repository.record.StageDigest != stageDigest {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, ErrConflict
	}
	replayed := repository.record.DispatchAckDigest != ""
	ingressDigest, _ := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
		request.CleanupRequestDigest, dispatchAckDigest, receipt.CleanupReceiptDigest,
	)
	ingressReceiptDigest, _ := evaluationCapabilityProbeProviderResourceCleanupIngressReceiptDigest(
		ingressDigest, receipt.CleanupReceiptDigest,
	)
	repository.record.CleanupReceiptDigest = receipt.CleanupReceiptDigest
	repository.record.OwnerAdmissionDigest = ownerAdmissionDigest
	repository.record.DispatchAckDigest = dispatchAckDigest
	repository.record.ResultIngressDigest = ingressDigest
	repository.record.ResultIngressReceiptDigest = ingressReceiptDigest
	repository.record.CleanupReceiptBytes = append([]byte(nil), receipt.Bytes...)
	repository.record.CompletedAt = receipt.CompletedAt
	repository.record.DispatchedAt = storedAt
	return repository.record, replayed, nil
}

func (repository *evaluationCapabilityProbeProviderResourceCleanupTestRepository) SealEvaluationCapabilityProbeProviderResourceCleanup(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeProviderResourceCleanupRequest,
	responseDigest string,
	response []byte,
	sealedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error) {
	repository.sealCalls++
	replayed := repository.record.State == "sealed"
	repository.record.State = "sealed"
	repository.record.ResponseDigest = responseDigest
	repository.record.ResponseBytes = append([]byte(nil), response...)
	repository.record.SealedAt = sealedAt
	return repository.record, replayed, nil
}

type evaluationCapabilityProbeProviderResourceCleanupTestAuthority struct {
	repository           *evaluationCapabilityProbeProviderResourceCleanupTestRepository
	authority            EvaluationAuthority
	request              evaluationCapabilityProbeProviderResourceCleanupRequest
	receipt              evaluationCapabilityProbeProviderResourceCleanupReceipt
	implementationDigest string
	storedAt             time.Time
	executeCalls         int
	reconcileCalls       int
}

func (owner *evaluationCapabilityProbeProviderResourceCleanupTestAuthority) CapabilityProbeProviderResourceCleanupImplementationDigest() (string, bool) {
	return owner.implementationDigest, true
}

func (owner *evaluationCapabilityProbeProviderResourceCleanupTestAuthority) StageCapabilityProbeProviderResourceCleanup(
	_ context.Context,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (string, error) {
	return evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(owner.request, request.OwnerImplementationDigest)
}

func (owner *evaluationCapabilityProbeProviderResourceCleanupTestAuthority) ExecuteCapabilityProbeProviderResourceCleanup(
	ctx context.Context,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult, error) {
	owner.executeCalls++
	ownerAdmission, _ := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
		request.CleanupRequestDigest, request.StageDigest, request.OwnerImplementationDigest,
	)
	dispatchAck, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
		request.CleanupRequestDigest, request.StageDigest, ownerAdmission, owner.receipt.CleanupReceiptDigest,
	)
	record, _, err := owner.repository.StoreEvaluationCapabilityProbeProviderResourceCleanupResult(
		ctx, owner.authority, owner.request, request.StageDigest, owner.receipt,
		ownerAdmission, dispatchAck, owner.storedAt,
	)
	return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{
		CleanupReceiptDigest: record.CleanupReceiptDigest, OwnerAdmissionDigest: record.OwnerAdmissionDigest,
		ResultIngressReceiptDigest: record.ResultIngressReceiptDigest,
	}, err
}

func (owner *evaluationCapabilityProbeProviderResourceCleanupTestAuthority) ReconcileCapabilityProbeProviderResourceCleanup(
	_ context.Context,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult, bool, error) {
	owner.reconcileCalls++
	if request.DispatchAckDigest != owner.repository.record.DispatchAckDigest ||
		request.ResultIngressDigest != owner.repository.record.ResultIngressDigest ||
		request.ResultIngressReceiptDigest != owner.repository.record.ResultIngressReceiptDigest ||
		!bytes.Equal(request.SealedProviderResourceCleanupReceipt, owner.repository.record.CleanupReceiptBytes) {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, ErrConflict
	}
	return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{
		CleanupReceiptDigest:       owner.repository.record.CleanupReceiptDigest,
		OwnerAdmissionDigest:       owner.repository.record.OwnerAdmissionDigest,
		ResultIngressReceiptDigest: owner.repository.record.ResultIngressReceiptDigest,
	}, true, nil
}

func evaluationCapabilityProbeProviderResourceCleanupTestFixture(
	t *testing.T,
) (EvaluationAuthority, evaluationCapabilityProbeProviderResourceCleanupRequest, evaluationCapabilityProbeProviderResourceCleanupReceipt, []byte, time.Time, string) {
	t.Helper()
	authority, resourceRequest, resourceResult, _, now, _ := evaluationCapabilityProbeProviderResourceTestFixture(t)
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	cleanup := evaluationCapabilityProbePlanTestResourceCleanup(t, plan, resourceRequest, resourceResult)
	return authority, cleanup.request, cleanup.receipt, resourceResult.DeletionAuthorityReceiptBytes,
		now, cleanup.ownerImplementationDigest
}

func evaluationCapabilityProbeProviderResourceCleanupTestHTTP(
	t *testing.T,
	handler http.Handler,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	token string,
) *httptest.ResponseRecorder {
	t.Helper()
	httpRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/evaluations/"+handlerNamespace(request)+"/capability-probe-provider-resource-cleanups",
		bytes.NewReader(request.Bytes),
	)
	httpRequest.Header.Set("Authorization", "Bearer "+token)
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", request.CleanupRequestDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httpRequest)
	return response
}

func handlerNamespace(_ evaluationCapabilityProbeProviderResourceCleanupRequest) string {
	return "evaluation.probe-resource-test"
}

func TestEvaluationCapabilityProbeProviderResourceCleanupSealsAfterDurableIngressAndReconcilesACKLoss(t *testing.T) {
	authority, request, receipt, deletionBytes, now, implementationDigest :=
		evaluationCapabilityProbeProviderResourceCleanupTestFixture(t)
	const token = "provider-resource-cleanup-ledger-token-0000000001"
	for _, ackLoss := range []bool{false, true} {
		repository := &evaluationCapabilityProbeProviderResourceCleanupTestRepository{deletionBytes: deletionBytes}
		owner := &evaluationCapabilityProbeProviderResourceCleanupTestAuthority{
			repository: repository, authority: authority, request: request, receipt: receipt,
			implementationDigest: implementationDigest, storedAt: now,
		}
		if ackLoss {
			_, _, _ = repository.ClaimEvaluationCapabilityProbeProviderResourceCleanup(
				context.Background(), authority, request, implementationDigest, now.Add(-time.Hour),
			)
			stageDigest, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(request, implementationDigest)
			_, _, _ = repository.MarkEvaluationCapabilityProbeProviderResourceCleanupDispatched(
				context.Background(), authority, request, stageDigest, now.Add(-time.Hour),
			)
			ownerAdmission, _ := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
				request.CleanupRequestDigest, stageDigest, implementationDigest,
			)
			dispatchAck, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
				request.CleanupRequestDigest, stageDigest, ownerAdmission, receipt.CleanupReceiptDigest,
			)
			_, _, _ = repository.StoreEvaluationCapabilityProbeProviderResourceCleanupResult(
				context.Background(), authority, request, stageDigest, receipt, ownerAdmission, dispatchAck, now,
			)
		}
		handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
			NamespaceID: authority.NamespaceID, ServiceToken: token,
			CapabilityProbeProviderResourceCleanupAuthority: owner,
			AttemptAuthorityResponseScanner:                 &evaluationAttemptAuthorityTestScanner{},
			Clock:                                           func() time.Time { return now },
		})
		if err != nil {
			t.Fatal(err)
		}
		response := evaluationCapabilityProbeProviderResourceCleanupTestHTTP(t, handler, request, token)
		if response.Code != http.StatusOK || repository.record.State != "sealed" || repository.sealCalls != 1 ||
			(!ackLoss && (owner.executeCalls != 1 || owner.reconcileCalls != 0 || repository.storeCalls != 1)) ||
			(ackLoss && (owner.executeCalls != 0 || owner.reconcileCalls != 1)) {
			t.Fatalf("ackLoss=%v status=%d state=%s execute=%d reconcile=%d store=%d seal=%d body=%s",
				ackLoss, response.Code, repository.record.State, owner.executeCalls, owner.reconcileCalls,
				repository.storeCalls, repository.sealCalls, response.Body.String())
		}
	}
}

func TestEvaluationCapabilityProbeProviderResourceCleanupRequiresScannerBeforeStore(t *testing.T) {
	authority, request, receipt, deletionBytes, now, implementationDigest :=
		evaluationCapabilityProbeProviderResourceCleanupTestFixture(t)
	repository := &evaluationCapabilityProbeProviderResourceCleanupTestRepository{deletionBytes: deletionBytes}
	_, _, _ = repository.ClaimEvaluationCapabilityProbeProviderResourceCleanup(
		context.Background(), authority, request, implementationDigest, now.Add(-time.Hour),
	)
	stageDigest, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(request, implementationDigest)
	_, _, _ = repository.MarkEvaluationCapabilityProbeProviderResourceCleanupDispatched(
		context.Background(), authority, request, stageDigest, now.Add(-time.Hour),
	)
	ownerAdmission, _ := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
		request.CleanupRequestDigest, stageDigest, implementationDigest,
	)
	dispatchAck, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
		request.CleanupRequestDigest, stageDigest, ownerAdmission, receipt.CleanupReceiptDigest,
	)
	resultIngress, _ := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
		request.CleanupRequestDigest, dispatchAck, receipt.CleanupReceiptDigest,
	)
	ingress := map[string]any{
		"format":      evaluationCapabilityProbeProviderResourceCleanupIngressEnvelopeFormat,
		"version":     evaluationCapabilityProbeProviderResourceCleanupVersion,
		"namespaceId": authority.NamespaceID, "repositoryCommit": request.RepositoryCommit,
		"cleanupRequestDigest":              request.CleanupRequestDigest,
		"resourceRegistrationRequestDigest": request.ResourceRegistrationRequestDigest,
		"ownerImplementationDigest":         implementationDigest, "stageDigest": stageDigest,
		"cleanupReceipt": receipt.Value, "cleanupReceiptDigest": receipt.CleanupReceiptDigest,
		"ownerAdmissionDigest": ownerAdmission, "dispatchAckDigest": dispatchAck,
		"resultIngressDigest": resultIngress,
	}
	encoded, _ := canonicaljson.Bytes(ingress)
	const token = "provider-resource-cleanup-ledger-token-0000000001"
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: authority.NamespaceID, ServiceToken: token,
		AttemptAuthorityResponseScanner: &evaluationAttemptAuthorityTestScanner{reject: true},
		Clock:                           func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	httpRequest := httptest.NewRequest(http.MethodPost,
		"/v1/evaluations/"+authority.NamespaceID+"/capability-probe-provider-resource-cleanup-results",
		bytes.NewReader(encoded))
	httpRequest.Header.Set("Authorization", "Bearer "+token)
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", request.CleanupRequestDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httpRequest)
	if response.Code != http.StatusForbidden || repository.storeCalls != 0 {
		t.Fatalf("status=%d store=%d body=%s", response.Code, repository.storeCalls, response.Body.String())
	}
}

func TestEvaluationCapabilityProbeProviderResourceCleanupLoopbackBindsSealedReceiptAndFences(t *testing.T) {
	authority, request, receipt, deletionBytes, _, implementationDigest :=
		evaluationCapabilityProbeProviderResourceCleanupTestFixture(t)
	stageDigest, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(request, implementationDigest)
	ownerAdmission, _ := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
		request.CleanupRequestDigest, stageDigest, implementationDigest,
	)
	dispatchAck, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
		request.CleanupRequestDigest, stageDigest, ownerAdmission, receipt.CleanupReceiptDigest,
	)
	resultIngress, _ := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
		request.CleanupRequestDigest, dispatchAck, receipt.CleanupReceiptDigest,
	)
	ingressReceipt, _ := evaluationCapabilityProbeProviderResourceCleanupIngressReceiptDigest(
		resultIngress, receipt.CleanupReceiptDigest,
	)
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, httpRequest *http.Request) {
		calls++
		source, _ := io.ReadAll(httpRequest.Body)
		value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationLoopbackAuthorityBytes)
		if err != nil {
			t.Fatal(err)
		}
		mode := stringMember(value, "mode")
		response := map[string]any{
			"format": evaluationLoopbackAuthorityResponseFormat, "version": evaluationLoopbackAuthorityVersion,
			"serviceKind": "provider-capability", "mode": mode, "requestDigest": request.CleanupRequestDigest,
			"ownerImplementationDigest": implementationDigest, "stageDigest": stageDigest,
		}
		if mode != "stage" {
			response["cleanupReceiptDigest"] = receipt.CleanupReceiptDigest
			response["ownerAdmissionDigest"] = ownerAdmission
			response["dispatchAckDigest"] = dispatchAck
			response["resultIngressDigest"] = resultIngress
			response["resultIngressReceiptDigest"] = ingressReceipt
		}
		if mode == "reconcile" {
			response["reconciled"] = true
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, response)
	}))
	defer server.Close()
	client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: "provider-resource-cleanup-owner-token-0000000001", Purpose: "preplan",
	})
	if err != nil {
		t.Fatal(err)
	}
	client.capabilityProbeResourceCleanupImplementationDigest = implementationDigest
	authorityRequest := EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest{
		NamespaceID: authority.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		CleanupRequestDigest: request.CleanupRequestDigest, OwnerImplementationDigest: implementationDigest,
		ClaimGeneration: 1, Request: request.Bytes, DeletionAuthorityReceipt: deletionBytes,
	}
	if actual, err := client.StageCapabilityProbeProviderResourceCleanup(context.Background(), authorityRequest); err != nil || actual != stageDigest {
		t.Fatalf("stage=%s err=%v", actual, err)
	}
	authorityRequest.StageDigest = stageDigest
	if _, err := client.ExecuteCapabilityProbeProviderResourceCleanup(context.Background(), authorityRequest); err != nil {
		t.Fatal(err)
	}
	authorityRequest.DispatchAckDigest, authorityRequest.ResultIngressDigest = dispatchAck, resultIngress
	authorityRequest.ResultIngressReceiptDigest = ingressReceipt
	authorityRequest.SealedProviderResourceCleanupReceipt = receipt.Bytes
	if _, reconciled, err := client.ReconcileCapabilityProbeProviderResourceCleanup(
		context.Background(), authorityRequest,
	); err != nil || !reconciled {
		t.Fatalf("reconciled=%v err=%v", reconciled, err)
	}
	forged := authorityRequest
	forged.ResultIngressDigest = evaluationBoundedExportTestDigest(t, "forged-cleanup-ingress")
	if _, _, err := client.ReconcileCapabilityProbeProviderResourceCleanup(context.Background(), forged); err == nil || calls != 3 {
		t.Fatalf("forged ingress err=%v calls=%d", err, calls)
	}
}

func TestEvaluationCapabilityProbeProviderResourceCleanupListRebuildsCanonicalLifecycle(t *testing.T) {
	authority, resourceRequest, resourceResult, claimedAt, now, resourceImplementationDigest :=
		evaluationCapabilityProbeProviderResourceTestFixture(t)
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	cleanup := evaluationCapabilityProbePlanTestResourceCleanup(t, plan, resourceRequest, resourceResult)
	resourceStage, _ := evaluationCapabilityProbeProviderResourceStageDigest(resourceRequest, resourceImplementationDigest)
	resourceAdmission, _ := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
		resourceRequest.RequestDigest, resourceResult.ResultDigest, resourceImplementationDigest, resourceStage,
	)
	resourceAck, _ := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
		resourceRequest.RequestDigest, resourceResult.ResultDigest, resourceAdmission,
		resourceImplementationDigest, resourceStage,
	)
	registrationResponse, _, err := evaluationCapabilityProbeProviderResourceRegistrationResponse(
		resourceRequest, resourceImplementationDigest, resourceStage, resourceAck, resourceResult,
	)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationCapabilityProbeProviderResourceCleanupTestRepository{
		listRecords: []evaluationCapabilityProbeProviderResourceCleanupListRecord{{
			ResourceRegistrationRequestBytes: resourceRequest.Bytes,
			ProviderResourceResultBytes:      resourceResult.Bytes,
			RegistrationResponseBytes:        registrationResponse,
			CleanupRequestBytes:              cleanup.request.Bytes,
			DeletionAuthorityReceiptBytes:    resourceResult.DeletionAuthorityReceiptBytes,
			CleanupResponseBytes:             cleanup.responseBytes,
			ClaimedAt:                        claimedAt, SealedAt: now,
		}},
	}
	const token = "provider-resource-cleanup-ledger-token-0000000001"
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: authority.NamespaceID, ServiceToken: token,
		AttemptAuthorityResponseScanner: &evaluationAttemptAuthorityTestScanner{},
	})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet,
		"/v1/evaluations/"+authority.NamespaceID+"/capability-probe-provider-resource-cleanups/"+
			resourceRequest.RepositoryCommit, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	value, decodeErr := decodeCanonicalEvaluationObject(
		response.Body.Bytes(), maximumEvaluationCapabilityProbeProviderResourceCleanupListBytes,
	)
	records, recordsOK := arrayMember(value, "records")
	base := cloneEvaluationObject(value)
	delete(base, "listDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if response.Code != http.StatusOK || decodeErr != nil || !recordsOK || len(records) != 1 || digestErr != nil ||
		digest != stringMember(value, "listDigest") {
		t.Fatalf("status=%d records=%d decode=%v digest=%v body=%s",
			response.Code, len(records), decodeErr, digestErr, response.Body.String())
	}
}
