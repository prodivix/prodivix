package agent

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationRuntimeFactSourceRegistrationTestRepository struct {
	record           EvaluationRuntimeFactSourceRegistrationRecord
	acknowledgeCalls int
	sealCalls        int
}

func (repository *evaluationRuntimeFactSourceRegistrationTestRepository) ClaimEvaluationRuntimeFactSourceRegistration(
	context.Context, EvaluationAuthority, evaluationRuntimeFactSourceRegistrationRequest, time.Time,
) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error) {
	return repository.record, true, nil
}

func (repository *evaluationRuntimeFactSourceRegistrationTestRepository) MarkEvaluationRuntimeFactSourceRegistrationDispatched(
	context.Context, EvaluationAuthority, evaluationRuntimeFactSourceRegistrationRequest, string, time.Time,
) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error) {
	return EvaluationRuntimeFactSourceRegistrationRecord{}, false, errors.New("unexpected stage")
}

func (repository *evaluationRuntimeFactSourceRegistrationTestRepository) AcknowledgeEvaluationRuntimeFactSourceRegistration(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationRuntimeFactSourceRegistrationRequest,
	sealed evaluationRuntimeFactSourceRegistrationSealedValue,
	_ time.Time,
) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error) {
	repository.acknowledgeCalls++
	repository.record.OwnerHealthDigest = sealed.OwnerHealthDigest
	repository.record.OwnerAdmissionDigest = sealed.OwnerAdmissionDigest
	repository.record.DispatchAckDigest = sealed.DispatchAckDigest
	repository.record.RegisteredAt = sealed.RegisteredAt
	repository.record.ExpiresAt = sealed.ExpiresAt
	repository.record.RegistrationReceiptDigest = sealed.RegistrationReceiptDigest
	repository.record.OwnerHealthBytes = append([]byte(nil), sealed.OwnerHealthBytes...)
	repository.record.ReceiptBytes = append([]byte(nil), sealed.ReceiptBytes...)
	return repository.record, false, nil
}

func (repository *evaluationRuntimeFactSourceRegistrationTestRepository) SealEvaluationRuntimeFactSourceRegistration(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationRuntimeFactSourceRegistrationRequest,
	_, _ string,
	sealedAt time.Time,
) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error) {
	repository.sealCalls++
	repository.record.State = "sealed"
	repository.record.SealedAt = sealedAt
	return repository.record, false, nil
}

type evaluationRuntimeFactSourceRegistrationTestAuthority struct {
	result         EvaluationRuntimeFactSourceRegistrationAuthorityResult
	executeCalls   int
	reconcileCalls int
}

func (*evaluationRuntimeFactSourceRegistrationTestAuthority) RuntimeFactSourceRegistrationImplementationDigest() (string, bool) {
	return "sha256-314ef9cc3857615dfb53f642a94b16bcfdd12ef027c37094531f23f6ba83ea1f", true
}

func (authority *evaluationRuntimeFactSourceRegistrationTestAuthority) StageRuntimeFactSourceRegistration(
	context.Context, EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) (string, error) {
	return "", errors.New("unexpected stage")
}

func (authority *evaluationRuntimeFactSourceRegistrationTestAuthority) ExecuteRuntimeFactSourceRegistration(
	context.Context, EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) (EvaluationRuntimeFactSourceRegistrationAuthorityResult, error) {
	authority.executeCalls++
	return EvaluationRuntimeFactSourceRegistrationAuthorityResult{}, errors.New("unexpected execute")
}

func (authority *evaluationRuntimeFactSourceRegistrationTestAuthority) ReconcileRuntimeFactSourceRegistration(
	context.Context, EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) (EvaluationRuntimeFactSourceRegistrationAuthorityResult, bool, error) {
	authority.reconcileCalls++
	return authority.result, true, nil
}

func evaluationRuntimeFactSourceRegistrationTestRequest(
	t *testing.T,
	now time.Time,
) evaluationRuntimeFactSourceRegistrationRequest {
	t.Helper()
	base := map[string]any{
		"format":                              evaluationRuntimeFactSourceRegistrationRequestFormat,
		"version":                             evaluationRuntimeFactSourceRegistrationVersion,
		"namespaceId":                         "namespace.test",
		"repositoryCommit":                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"sourceAuthorityKind":                 "shared-durable-capability",
		"sourceKind":                          "sealed-provider-response-metadata",
		"sourceAuthorityId":                   "owner/runtime/cache/1",
		"sourceAuthorityImplementationDigest": evaluationOptionalFactTestDigest(t, "registration-owner-implementation"),
		"routeBinding":                        "provider/cache/runtime/execute",
		"capabilityProfileId":                 "g4-provider-isolated-cache",
		"capabilityProfileDigest": func() string {
			digest, err := canonicaljson.Digest(map[string]any{"profileId": "g4-provider-isolated-cache"})
			if err != nil {
				t.Fatal(err)
			}
			return digest
		}(),
		"capabilityId":            "provider.isolated-cache",
		"protocolFamily":          "openai-responses",
		"providerConfigurationId": "provider/configuration/1",
		"modelId":                 "model/immutable/1",
		"modelLineageDigest":      evaluationOptionalFactTestDigest(t, "registration-model"),
		"adapterDigest":           evaluationOptionalFactTestDigest(t, "registration-adapter"),
		"minimumExpiresAt":        now.Add(time.Hour).Format("2006-01-02T15:04:05.000Z"),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["requestDigest"] = digest
	encoded, err := canonicaljson.Bytes(base)
	if err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationRuntimeFactSourceRegistrationRequest(encoded, EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.test",
	})
	if err != nil {
		t.Fatal(err)
	}
	return request
}

func evaluationRuntimeFactSourceRegistrationTestResult(
	t *testing.T,
	request evaluationRuntimeFactSourceRegistrationRequest,
	stageDigest string,
	now time.Time,
) EvaluationRuntimeFactSourceRegistrationAuthorityResult {
	return evaluationRuntimeFactSourceRegistrationTestResultWithExpiry(
		t, request, stageDigest, now, now.Add(2*time.Hour),
	)
}

func evaluationRuntimeFactSourceRegistrationTestResultWithExpiry(
	t *testing.T,
	request evaluationRuntimeFactSourceRegistrationRequest,
	stageDigest string,
	now time.Time,
	expiresAt time.Time,
) EvaluationRuntimeFactSourceRegistrationAuthorityResult {
	t.Helper()
	healthBase := map[string]any{
		"format":                              evaluationRuntimeFactSourceOwnerHealthFormat,
		"version":                             evaluationRuntimeFactSourceRegistrationVersion,
		"requestDigest":                       request.RequestDigest,
		"sourceAuthorityId":                   request.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": request.SourceAuthorityImplementationDigest,
		"sourceKind":                          request.SourceKind,
		"routeBinding":                        request.RouteBinding,
		"status":                              "ready",
		"checkedAt":                           now.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                           expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	healthDigest, err := canonicaljson.Digest(healthBase)
	if err != nil {
		t.Fatal(err)
	}
	health := cloneEvaluationObject(healthBase)
	health["healthDigest"] = healthDigest
	healthBytes, err := canonicaljson.Bytes(health)
	if err != nil {
		t.Fatal(err)
	}
	ownerAdmission, err := evaluationRuntimeFactSourceOwnerAdmissionDigest(request.RequestDigest, healthDigest, stageDigest)
	if err != nil {
		t.Fatal(err)
	}
	return EvaluationRuntimeFactSourceRegistrationAuthorityResult{
		OwnerHealth: healthBytes, OwnerAdmissionDigest: ownerAdmission,
	}
}

func TestEvaluationRuntimeFactSourceRegistrationCapsLifetimeAtEightDays(t *testing.T) {
	now := time.Date(2026, 8, 9, 6, 0, 0, 0, time.UTC)
	request := evaluationRuntimeFactSourceRegistrationTestRequest(t, now)
	stageDigest, err := evaluationRuntimeFactSourceRegistrationStageDigest(request, evaluationServiceAuthorityPrincipal)
	if err != nil {
		t.Fatal(err)
	}
	checkedAt := now.Add(-time.Minute)
	exact := evaluationRuntimeFactSourceRegistrationTestResultWithExpiry(
		t, request, stageDigest, checkedAt,
		checkedAt.Add(maximumEvaluationRuntimeFactSourceRegistrationLifetime),
	)
	if _, err := evaluationRuntimeFactSourceRegistrationSealed(
		request, evaluationServiceAuthorityPrincipal, stageDigest, exact, checkedAt, now,
	); err != nil {
		t.Fatalf("exact eight-day registration lifetime was rejected: %v", err)
	}
	if _, err := evaluationRuntimeFactSourceRegistrationSealed(
		request, evaluationServiceAuthorityPrincipal, stageDigest, exact,
		checkedAt.Add(time.Millisecond), now,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("owner health checked before the durable claim was accepted: %v", err)
	}
	over := evaluationRuntimeFactSourceRegistrationTestResultWithExpiry(
		t, request, stageDigest, checkedAt,
		checkedAt.Add(maximumEvaluationRuntimeFactSourceRegistrationLifetime+time.Millisecond),
	)
	if _, err := evaluationRuntimeFactSourceRegistrationSealed(
		request, evaluationServiceAuthorityPrincipal, stageDigest, over, checkedAt, now,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("registration lifetime above eight days was accepted: %v", err)
	}
}

func TestEvaluationRuntimeFactSourceRegistrationCrossOwnerDigestVector(t *testing.T) {
	requestDigest := "sha256-" + strings.Repeat("1", 64)
	ownerHealthDigest := "sha256-" + strings.Repeat("2", 64)
	request := evaluationRuntimeFactSourceRegistrationRequest{RequestDigest: requestDigest}
	stageDigest, err := evaluationRuntimeFactSourceRegistrationStageDigest(
		request, evaluationServiceAuthorityPrincipal,
	)
	if err != nil {
		t.Fatal(err)
	}
	if stageDigest != "sha256-14b5676084d177f77212cc4513bfc73a997c90b66f0c77d605cdd4a4588cab02" {
		t.Fatalf("registration stage digest drifted: %s", stageDigest)
	}
	ownerAdmissionDigest, err := evaluationRuntimeFactSourceOwnerAdmissionDigest(
		requestDigest, ownerHealthDigest, stageDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	if ownerAdmissionDigest != "sha256-d3f680b832a18c3cb4bd14c2ae05f25a9acab5846bd68778d7fd5668d5452785" {
		t.Fatalf("registration owner admission digest drifted: %s", ownerAdmissionDigest)
	}
	dispatchAckDigest, err := evaluationRuntimeFactSourceRegistrationDispatchAckDigest(
		requestDigest, ownerHealthDigest, ownerAdmissionDigest, stageDigest,
		evaluationServiceAuthorityPrincipal,
	)
	if err != nil {
		t.Fatal(err)
	}
	if dispatchAckDigest != "sha256-bf8036bb8c8f718cbe9e23da49646f505fedb85ca58ea683e4cacfe7dbd7c682" {
		t.Fatalf("registration dispatch ACK digest drifted: %s", dispatchAckDigest)
	}
}

func TestEvaluationRuntimeFactSourceRegistrationSealsRealOwnerHealth(t *testing.T) {
	now := time.Date(2026, 8, 9, 6, 0, 0, 0, time.UTC)
	request := evaluationRuntimeFactSourceRegistrationTestRequest(t, now)
	stageDigest, err := evaluationRuntimeFactSourceRegistrationStageDigest(request, evaluationServiceAuthorityPrincipal)
	if err != nil {
		t.Fatal(err)
	}
	result := evaluationRuntimeFactSourceRegistrationTestResult(t, request, stageDigest, now)
	sealed, err := evaluationRuntimeFactSourceRegistrationSealed(
		request, evaluationServiceAuthorityPrincipal, stageDigest, result, now, now.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	if sealed.OwnerHealthDigest == "" || sealed.OwnerAdmissionDigest == "" || sealed.DispatchAckDigest == "" ||
		sealed.RegistrationReceiptDigest == "" || len(sealed.ReceiptBytes) == 0 {
		t.Fatalf("registration authority was not sealed: %#v", sealed)
	}
	receipt, err := decodeCanonicalEvaluationObject(sealed.ReceiptBytes, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes)
	if err != nil || stringMember(receipt, "sourceAuthorityId") != request.SourceAuthorityID ||
		stringMember(receipt, "registrationAuthorityIssuerId") != evaluationServiceAuthorityPrincipal {
		t.Fatalf("unexpected registration receipt: %#v %v", receipt, err)
	}
	archiveRecord := EvaluationRuntimeFactSourceRegistrationArchiveRecord{
		RequestDigest: request.RequestDigest, OwnerHealthDigest: sealed.OwnerHealthDigest,
		RegistrationReceiptDigest: sealed.RegistrationReceiptDigest,
		RequestBytes:              request.Bytes, OwnerHealthBytes: sealed.OwnerHealthBytes, ReceiptBytes: sealed.ReceiptBytes,
	}
	if err := evaluationRuntimeFactSourceRegistrationArchiveCanonicalRecord(
		EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID},
		request.RepositoryCommit, &archiveRecord,
	); err != nil {
		t.Fatal(err)
	}
	archiveValue, err := decodeCanonicalEvaluationObject(
		archiveRecord.RecordBytes, maximumEvaluationRuntimeFactSourceRegistrationArchiveRecordBytes,
	)
	if err != nil || !exactEvaluationKeys(archiveValue, []string{
		"format", "version", "registrationReceiptDigest", "requestDigest", "ownerHealthDigest",
		"request", "ownerHealth", "receipt", "recordDigest",
	}) || stringMember(archiveValue, "recordDigest") != archiveRecord.RecordDigest {
		t.Fatalf("registration archive wrapper drifted: %#v %v", archiveValue, err)
	}
	projection, err := evaluationOptionalFactArchiveFamilyProjection(
		0, 1, []EvaluationRuntimeFactSourceRegistrationArchiveRecord{archiveRecord}, nil, nil,
	)
	if err != nil || projection.RegistrationCount != 1 ||
		projection.RegistrationBytes != int64(len(archiveRecord.RecordBytes)) {
		t.Fatalf("registration archive family projection drifted: %#v %v", projection, err)
	}
}

func TestEvaluationRuntimeFactSourceRegistrationRejectsOwnerSwap(t *testing.T) {
	now := time.Date(2026, 8, 9, 6, 0, 0, 0, time.UTC)
	request := evaluationRuntimeFactSourceRegistrationTestRequest(t, now)
	stageDigest, _ := evaluationRuntimeFactSourceRegistrationStageDigest(request, evaluationServiceAuthorityPrincipal)
	result := evaluationRuntimeFactSourceRegistrationTestResult(t, request, stageDigest, now)
	health, _, _ := decodeEvaluationJSONObject(result.OwnerHealth, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes)
	health["sourceAuthorityImplementationDigest"] = evaluationOptionalFactTestDigest(t, "swapped-owner")
	healthBase := cloneEvaluationObject(health)
	delete(healthBase, "healthDigest")
	health["healthDigest"], _ = canonicaljson.Digest(healthBase)
	result.OwnerHealth, _ = canonicaljson.Bytes(health)
	result.OwnerAdmissionDigest, _ = evaluationRuntimeFactSourceOwnerAdmissionDigest(
		request.RequestDigest, stringMember(health, "healthDigest"), stageDigest,
	)
	if _, err := evaluationRuntimeFactSourceRegistrationSealed(
		request, evaluationServiceAuthorityPrincipal, stageDigest, result, now, now.Add(time.Second),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("owner implementation swap was accepted: %v", err)
	}
}

func TestEvaluationRuntimeFactSourceRegistrationAckLossReconcilesWithoutExecute(t *testing.T) {
	now := time.Date(2026, 8, 9, 6, 0, 0, 0, time.UTC)
	requestValue := evaluationRuntimeFactSourceRegistrationTestRequest(t, now)
	stageDigest, _ := evaluationRuntimeFactSourceRegistrationStageDigest(requestValue, evaluationServiceAuthorityPrincipal)
	owner := &evaluationRuntimeFactSourceRegistrationTestAuthority{
		result: evaluationRuntimeFactSourceRegistrationTestResult(t, requestValue, stageDigest, now),
	}
	repository := &evaluationRuntimeFactSourceRegistrationTestRepository{record: EvaluationRuntimeFactSourceRegistrationRecord{
		NamespaceID: requestValue.NamespaceID, RepositoryCommit: requestValue.RepositoryCommit,
		RequestDigest: requestValue.RequestDigest, SourceAuthorityKind: requestValue.SourceAuthorityKind,
		SourceKind: requestValue.SourceKind, SourceAuthorityID: requestValue.SourceAuthorityID,
		SourceAuthorityImplementationDigest: requestValue.SourceAuthorityImplementationDigest,
		RouteBinding:                        requestValue.RouteBinding, CapabilityProfileID: requestValue.CapabilityProfileID,
		CapabilityProfileDigest: requestValue.CapabilityProfileDigest, CapabilityID: requestValue.CapabilityID,
		ProtocolFamily: requestValue.ProtocolFamily, ProviderConfigurationID: requestValue.ProviderConfigurationID,
		ModelID: requestValue.ModelID, ModelLineageDigest: requestValue.ModelLineageDigest,
		AdapterDigest: requestValue.AdapterDigest, MinimumExpiresAt: requestValue.MinimumExpiresAt,
		RegistrationAuthorityIssuerID: evaluationServiceAuthorityPrincipal, State: "dispatched",
		ClaimGeneration: 1, StageDigest: stageDigest, RequestBytes: append([]byte(nil), requestValue.Bytes...),
		V46Eligible: true, ClaimedAt: now,
	}}
	serviceToken := strings.Repeat("r", 48)
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID:                            requestValue.NamespaceID,
		ServiceToken:                           serviceToken,
		RuntimeFactSourceRegistrationAuthority: owner,
		Clock:                                  func() time.Time { return now.Add(time.Second) },
	})
	if err != nil {
		t.Fatal(err)
	}
	httpRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/evaluations/namespace.test/runtime-fact-source-owner-registrations",
		strings.NewReader(string(requestValue.Bytes)),
	)
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", requestValue.RequestDigest)
	httpRequest.Header.Set("Authorization", "Bearer "+serviceToken)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httpRequest)
	if response.Code != http.StatusOK || owner.executeCalls != 0 || owner.reconcileCalls != 1 ||
		repository.acknowledgeCalls != 1 || repository.sealCalls != 1 {
		t.Fatalf("ACK-loss recovery drifted: status=%d execute=%d reconcile=%d acknowledge=%d seal=%d body=%s",
			response.Code, owner.executeCalls, owner.reconcileCalls, repository.acknowledgeCalls,
			repository.sealCalls, response.Body.String())
	}
}

func TestEvaluationRuntimeFactSourceRegistrationRejectsQueryBeforeOwnerDispatch(t *testing.T) {
	handler := &EvaluationServiceHandler{}
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/evaluations/namespace.test/runtime-fact-source-owner-registrations?probe=1",
		strings.NewReader("{}"),
	)
	response := httptest.NewRecorder()
	handler.handleEvaluationRuntimeFactSourceOwnerRegistration(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("registration query was not rejected exactly: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestEvaluationRuntimeFactSourceRegistrationLoopbackBindsIssuerAndSealedFences(t *testing.T) {
	now := time.Date(2026, 8, 9, 6, 0, 0, 0, time.UTC)
	registration := evaluationRuntimeFactSourceRegistrationTestRequest(t, now)
	stageDigest, err := evaluationRuntimeFactSourceRegistrationStageDigest(
		registration, evaluationServiceAuthorityPrincipal,
	)
	if err != nil {
		t.Fatal(err)
	}
	result := evaluationRuntimeFactSourceRegistrationTestResult(t, registration, stageDigest, now)
	sealed, err := evaluationRuntimeFactSourceRegistrationSealed(
		registration, evaluationServiceAuthorityPrincipal, stageDigest, result, now, now.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	ownerHealth, err := decodeCanonicalEvaluationObject(
		result.OwnerHealth, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, httpRequest *http.Request) {
		calls++
		if httpRequest.URL.Path != "/v1/capability-runtime/"+strings.TrimPrefix(httpRequest.URL.Path, "/v1/capability-runtime/") {
			t.Fatalf("unexpected loopback path: %s", httpRequest.URL.Path)
		}
		source, readErr := io.ReadAll(httpRequest.Body)
		if readErr != nil {
			t.Fatal(readErr)
		}
		value, decodeErr := decodeCanonicalEvaluationObject(source, maximumEvaluationLoopbackAuthorityBytes)
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		mode := stringMember(value, "mode")
		required := []string{
			"format", "version", "serviceKind", "mode", "namespaceId", "repositoryCommit", "operation",
			"routeBinding", "requestDigest", "registrationAuthorityIssuerId", "ownerImplementationDigest",
			"claimGeneration", "payload",
		}
		if mode == "execute" {
			required = append(required, "stageDigest")
		}
		if mode == "reconcile" {
			required = append(required, "stageDigest")
			if calls == 4 {
				required = append(required, "dispatchAckDigest", "sealedOwnerHealth")
			}
		}
		if !exactEvaluationKeys(value, required) || stringMember(value, "serviceKind") != "provider-capability" ||
			stringMember(value, "operation") != evaluationRuntimeFactSourceRegistrationOperation ||
			stringMember(value, "routeBinding") != evaluationRuntimeFactSourceRegistrationRouteBinding ||
			stringMember(value, "registrationAuthorityIssuerId") != evaluationServiceAuthorityPrincipal ||
			stringMember(value, "ownerImplementationDigest") != evaluationOptionalFactTestDigest(t, "registration-loopback-implementation") ||
			!bytes.Equal(mustEvaluationCanonicalBytes(t, value["payload"]), registration.Bytes) {
			t.Fatalf("invalid %s registration loopback request: %#v", mode, value)
		}
		response := map[string]any{
			"format": evaluationLoopbackAuthorityResponseFormat, "version": evaluationLoopbackAuthorityVersion,
			"serviceKind": "provider-capability", "mode": mode, "requestDigest": registration.RequestDigest,
			"registrationAuthorityIssuerId": evaluationServiceAuthorityPrincipal, "stageDigest": stageDigest,
		}
		if mode != "stage" {
			response["ownerHealth"] = ownerHealth
			response["ownerAdmissionDigest"] = result.OwnerAdmissionDigest
		}
		if mode == "reconcile" {
			response["dispatchAckDigest"], response["reconciled"] = sealed.DispatchAckDigest, true
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, response)
	}))
	defer server.Close()
	client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: "runtime-registration-owner-token-00000000001", Purpose: "preplan",
	})
	if err != nil {
		t.Fatal(err)
	}
	client.runtimeFactSourceRegistrationImplementationDigest = evaluationOptionalFactTestDigest(t, "registration-loopback-implementation")
	authorityRequest := EvaluationRuntimeFactSourceRegistrationAuthorityRequest{
		NamespaceID: registration.NamespaceID, RepositoryCommit: registration.RepositoryCommit,
		RequestDigest: registration.RequestDigest, RegistrationAuthorityIssuerID: evaluationServiceAuthorityPrincipal,
		OwnerImplementationDigest: evaluationOptionalFactTestDigest(t, "registration-loopback-implementation"),
		ClaimGeneration:           1, Request: registration.Bytes,
	}
	actualStage, err := client.StageRuntimeFactSourceRegistration(context.Background(), authorityRequest)
	if err != nil || actualStage != stageDigest {
		t.Fatalf("stage=%s err=%v", actualStage, err)
	}
	authorityRequest.StageDigest = stageDigest
	if _, err := client.ExecuteRuntimeFactSourceRegistration(context.Background(), authorityRequest); err != nil {
		t.Fatal(err)
	}
	if _, reconciled, err := client.ReconcileRuntimeFactSourceRegistration(
		context.Background(), authorityRequest,
	); err != nil || !reconciled {
		t.Fatalf("ACK-loss reconcile=%v err=%v", reconciled, err)
	}
	authorityRequest.DispatchAckDigest = sealed.DispatchAckDigest
	authorityRequest.SealedOwnerHealth = result.OwnerHealth
	if _, reconciled, err := client.ReconcileRuntimeFactSourceRegistration(
		context.Background(), authorityRequest,
	); err != nil || !reconciled {
		t.Fatalf("sealed reconcile=%v err=%v", reconciled, err)
	}
	forged := authorityRequest
	forged.RegistrationAuthorityIssuerID = "authority/registration/swap"
	if _, _, err := client.ReconcileRuntimeFactSourceRegistration(context.Background(), forged); err == nil || calls != 4 {
		t.Fatalf("forged issuer err=%v calls=%d", err, calls)
	}
	forged = authorityRequest
	forged.OwnerImplementationDigest = evaluationOptionalFactTestDigest(t, "registration-loopback-implementation-swap")
	if _, _, err := client.ReconcileRuntimeFactSourceRegistration(context.Background(), forged); err == nil || calls != 4 {
		t.Fatalf("forged registration implementation err=%v calls=%d", err, calls)
	}
	forged = authorityRequest
	forged.RepositoryCommit = "1123456789abcdef0123456789abcdef01234567"
	if _, _, err := client.ReconcileRuntimeFactSourceRegistration(context.Background(), forged); err == nil || calls != 4 {
		t.Fatalf("forged repository commit err=%v calls=%d", err, calls)
	}
	forged = authorityRequest
	forgedValue := cloneEvaluationObject(registration.Value)
	forgedValue["sourceAuthorityId"] = "runtime-source/swapped"
	delete(forgedValue, "requestDigest")
	forgedValue["requestDigest"], _ = canonicaljson.Digest(forgedValue)
	forged.Request, _ = canonicaljson.Bytes(forgedValue)
	if _, _, err := client.ReconcileRuntimeFactSourceRegistration(context.Background(), forged); err == nil || calls != 4 {
		t.Fatalf("forged canonical payload err=%v calls=%d", err, calls)
	}
}

func mustEvaluationCanonicalBytes(t *testing.T, value any) []byte {
	t.Helper()
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestEvaluationRuntimeFactSourceRegistrationRejectsParallelAndCapsFifteen(t *testing.T) {
	if maximumEvaluationRuntimeFactSourceRegistrations != 15 {
		t.Fatalf("registration bound=%d, want 15", maximumEvaluationRuntimeFactSourceRegistrations)
	}
	registrations := make([]EvaluationRuntimeFactSourceRegistrationArchiveRecord, maximumEvaluationRuntimeFactSourceRegistrations+1)
	if _, err := evaluationOptionalFactArchiveFamilyProjection(
		maximumEvaluationOptionalFactAuthorityRecords, maximumEvaluationRuntimeFactSourceRegistrations,
		registrations, nil, nil,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("registration +1 archive bound was accepted: %v", err)
	}
	now := time.Date(2026, 8, 9, 6, 0, 0, 0, time.UTC)
	request := evaluationRuntimeFactSourceRegistrationTestRequest(t, now)
	value := cloneEvaluationObject(request.Value)
	value["capabilityId"] = "provider.parallel-tool"
	delete(value, "requestDigest")
	value["requestDigest"], _ = canonicaljson.Digest(value)
	encoded, _ := canonicaljson.Bytes(value)
	if _, err := decodeEvaluationRuntimeFactSourceRegistrationRequest(encoded, EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID,
	}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("parallel tool was admitted as an optional fact source: %v", err)
	}
	value = cloneEvaluationObject(request.Value)
	value["capabilityProfileId"] = "g4-provider-hosted-retrieval-core"
	value["capabilityProfileDigest"], _ = canonicaljson.Digest(map[string]any{
		"profileId": "g4-provider-hosted-retrieval-core",
	})
	delete(value, "requestDigest")
	value["requestDigest"], _ = canonicaljson.Digest(value)
	encoded, _ = canonicaljson.Bytes(value)
	if _, err := decodeEvaluationRuntimeFactSourceRegistrationRequest(encoded, EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID,
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("capability profile/capability swap was accepted: %v", err)
	}
}
