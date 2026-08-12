package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationServiceTestNamespace = "evaluation.g4-service-test"
	evaluationServiceTestToken     = "ledger-test-token-with-at-least-thirty-two-bytes"
)

type evaluationServiceFakeRepository struct {
	plan           evaluationPlanFact
	getError       error
	storeError     error
	getCalls       int
	storeCalls     int
	lastAuthority  EvaluationAuthority
	lastPartition  EvaluationPlanPartition
	lastStoredPlan []byte
	storeReplay    bool
}

type evaluationServiceBudgetFakeRepository struct {
	*evaluationServiceFakeRepository
	snapshot           EvaluationBudgetSnapshot
	settlementBytes    []byte
	settlementExpected int64
	settlementCalls    int
}

type evaluationServiceExportFakeRepository struct {
	lease         EvaluationExportLease
	records       []EvaluationExportSourceRecord
	sourceBinding EvaluationEvidenceExportSourceBinding
	openCalls     int
	readCalls     int
}

type evaluationServiceReviewLeaseFakeRepository struct {
	*evaluationServiceFakeRepository
	lease     EvaluationReviewLease
	records   []EvaluationExportSourceRecord
	openCalls int
	readCalls int
}

func (repository *evaluationServiceReviewLeaseFakeRepository) OpenEvaluationReviewLease(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ time.Time,
	_ string,
) (EvaluationReviewLease, bool, error) {
	repository.openCalls++
	return repository.lease, false, nil
}

func (repository *evaluationServiceReviewLeaseFakeRepository) GetEvaluationReviewLease(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	leaseID string,
	_ string,
) (EvaluationReviewLease, error) {
	if leaseID != repository.lease.LeaseID {
		return EvaluationReviewLease{}, ErrNotFound
	}
	return repository.lease, nil
}

func (repository *evaluationServiceReviewLeaseFakeRepository) ReadEvaluationReviewLeasePage(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ string,
	_ string,
	_ string,
	firstOrdinal int64,
	_ int64,
	_ int64,
	_ time.Time,
) (EvaluationExportRecordPage, error) {
	repository.readCalls++
	if firstOrdinal < 0 || firstOrdinal >= int64(len(repository.records)) {
		return EvaluationExportRecordPage{}, ErrNotFound
	}
	return EvaluationExportRecordPage{
		Records: repository.records[firstOrdinal : firstOrdinal+1], FirstRecordOrdinal: firstOrdinal,
		HasMore: firstOrdinal+1 < int64(len(repository.records)),
	}, nil
}

func (repository *evaluationServiceExportFakeRepository) OpenEvaluationEvidenceExportLease(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	sourceBinding EvaluationEvidenceExportSourceBinding,
	_ time.Time,
	_ string,
) (EvaluationExportLease, bool, error) {
	repository.openCalls++
	repository.sourceBinding = sourceBinding
	return repository.lease, false, nil
}

func (repository *evaluationServiceExportFakeRepository) GetEvaluationEvidenceExportLease(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	leaseID string,
	_ string,
) (EvaluationExportLease, error) {
	if leaseID != repository.lease.LeaseID {
		return EvaluationExportLease{}, ErrNotFound
	}
	return repository.lease, nil
}

func (repository *evaluationServiceExportFakeRepository) ReadEvaluationEvidenceExportPage(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ string,
	_ string,
	_ string,
	firstOrdinal int64,
	_ int64,
	_ int64,
	_ time.Time,
) (EvaluationExportRecordPage, error) {
	repository.readCalls++
	if firstOrdinal < 0 || firstOrdinal >= int64(len(repository.records)) {
		return EvaluationExportRecordPage{}, ErrNotFound
	}
	return EvaluationExportRecordPage{
		Records: repository.records[firstOrdinal : firstOrdinal+1], FirstRecordOrdinal: firstOrdinal,
		HasMore: firstOrdinal+1 < int64(len(repository.records)),
	}, nil
}

func (repository *evaluationServiceFakeRepository) GetEvaluationPlan(
	_ context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationPlanRecord, error) {
	repository.getCalls++
	repository.lastAuthority = authority
	repository.lastPartition = partition
	if repository.getError != nil {
		return EvaluationPlanRecord{}, repository.getError
	}
	return EvaluationPlanRecord{
		EvaluationFactRecord: EvaluationFactRecord{
			NamespaceID: authority.NamespaceID, PlanDigest: repository.plan.PlanDigest,
			FactType: "evaluation-plan", FactID: repository.plan.PlanID,
			FactDigest: repository.plan.PlanDigest, FactBytes: append([]byte(nil), repository.plan.Canonical...),
			RecordedAt: repository.plan.PlannedAt,
		},
		PlanID: repository.plan.PlanID, RepositoryCommit: repository.plan.RepositoryCommit,
		PlannedJourneyCount: repository.plan.PlannedJourneyCount,
		PlannedAt:           repository.plan.PlannedAt, ExpiresAt: repository.plan.ExpiresAt,
	}, nil
}

func (repository *evaluationServiceFakeRepository) StoreEvaluationPlan(
	_ context.Context,
	authority EvaluationAuthority,
	source []byte,
) (EvaluationFactRecord, bool, error) {
	repository.storeCalls++
	repository.lastAuthority = authority
	repository.lastStoredPlan = append([]byte(nil), source...)
	if repository.storeError != nil {
		return EvaluationFactRecord{}, false, repository.storeError
	}
	return EvaluationFactRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: repository.plan.PlanDigest,
		FactType: "evaluation-plan", FactID: repository.plan.PlanID,
		FactDigest: repository.plan.PlanDigest, FactBytes: append([]byte(nil), repository.plan.Canonical...),
		RecordedAt: repository.plan.PlannedAt,
	}, repository.storeReplay, nil
}

func (repository *evaluationServiceBudgetFakeRepository) GetEvaluationBudgetSnapshot(
	_ context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationBudgetSnapshot, error) {
	result := repository.snapshot
	result.NamespaceID, result.PlanDigest = authority.NamespaceID, partition.PlanDigest
	return result, nil
}

func (repository *evaluationServiceBudgetFakeRepository) ReserveEvaluationBudget(
	context.Context,
	EvaluationAuthority,
	string,
	string,
	int64,
	[]byte,
	time.Time,
) (EvaluationBudgetReservationRecord, bool, error) {
	return EvaluationBudgetReservationRecord{}, false, ErrInvalid
}

func (repository *evaluationServiceBudgetFakeRepository) SettleEvaluationBudget(
	_ context.Context,
	authority EvaluationAuthority,
	planDigest string,
	reservationID string,
	expectedRevision int64,
	settlementBytes []byte,
) (EvaluationBudgetSettlementRecord, bool, error) {
	repository.settlementCalls++
	repository.settlementExpected = expectedRevision
	repository.settlementBytes = append([]byte(nil), settlementBytes...)
	settlement, err := decodeEvaluationBudgetSettlement(
		settlementBytes,
		mustDecodeEvaluationServiceDemand(repository.snapshot.Reservations[0].DemandBytes),
		repository.snapshot.Reservations[0].ReservedAt,
	)
	if err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	return EvaluationBudgetSettlementRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: planDigest, ReservationID: reservationID,
		LedgerRevision: expectedRevision + 1, SettlementDigest: settlement.Digest,
		SettlementBytes: settlement.Canonical, SettledAt: settlement.SettledAt,
	}, false, nil
}

func mustDecodeEvaluationServiceDemand(source []byte) evaluationBudgetDemand {
	demand, err := decodeEvaluationBudgetDemand(source, true)
	if err != nil {
		panic(err)
	}
	return demand
}

func newEvaluationServiceTestHandler(t *testing.T, repository any, verifier EvaluationAuthorityAttestationVerifier) *EvaluationServiceHandler {
	t.Helper()
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID:         evaluationServiceTestNamespace,
		ServiceToken:        evaluationServiceTestToken,
		AttestationVerifier: verifier,
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func evaluationServiceTestURL(plan evaluationPlanFact, suffix string) string {
	return fmt.Sprintf("/v1/evaluations/%s/%s/%s/%s", evaluationServiceTestNamespace, plan.PlanDigest, plan.RepositoryCommit, suffix)
}

func evaluationServiceTestDigest(t *testing.T, label string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"label": label})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func authorizedEvaluationServiceRequest(method, target string, body *bytes.Reader) *http.Request {
	request := httptest.NewRequest(method, target, body)
	request.Header.Set("Authorization", "Bearer "+evaluationServiceTestToken)
	request.Header.Set("Content-Type", "application/json")
	return request
}

func TestEvaluationServiceStoresPlanWithinFixedAuthorityAndExactPartition(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceFakeRepository{plan: plan}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	request := authorizedEvaluationServiceRequest(http.MethodPut, evaluationServiceTestURL(plan, "plan"), bytes.NewReader(plan.Canonical))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated || repository.storeCalls != 1 || !bytes.Equal(repository.lastStoredPlan, plan.Canonical) {
		t.Fatalf("unexpected plan store response: status=%d calls=%d body=%s", response.Code, repository.storeCalls, response.Body.String())
	}
	if repository.lastAuthority != (EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: evaluationServiceTestNamespace,
	}) {
		t.Fatalf("unexpected fixed authority: %#v", repository.lastAuthority)
	}
	var body struct {
		Fact     json.RawMessage `json:"fact"`
		Replayed bool            `json:"replayed"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body.Replayed || !bytes.Equal(body.Fact, plan.Canonical) {
		t.Fatalf("unexpected response envelope: %s", response.Body.String())
	}
}

func TestEvaluationServiceRequiresOneExactBearerCredential(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceFakeRepository{plan: plan}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	target := evaluationServiceTestURL(plan, "plan")
	tests := []struct {
		name   string
		header []string
	}{
		{name: "missing"},
		{name: "wrong", header: []string{"Bearer a-different-token-with-at-least-thirty-two-bytes"}},
		{name: "wrong scheme", header: []string{"Basic " + evaluationServiceTestToken}},
		{name: "duplicate", header: []string{"Bearer " + evaluationServiceTestToken, "Bearer " + evaluationServiceTestToken}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, target, nil)
			for _, value := range test.header {
				request.Header.Add("Authorization", value)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusUnauthorized || strings.Contains(response.Body.String(), evaluationServiceTestToken) {
				t.Fatalf("unexpected auth response: status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}
	if repository.getCalls != 0 || repository.storeCalls != 0 {
		t.Fatalf("unauthorized requests reached repository: get=%d store=%d", repository.getCalls, repository.storeCalls)
	}
}

func TestEvaluationServiceHealthCheckExposesNoLedgerData(t *testing.T) {
	repository := &evaluationServiceFakeRepository{}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent || response.Body.Len() != 0 ||
		repository.getCalls != 0 || repository.storeCalls != 0 {
		t.Fatalf("unexpected health response: status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestEvaluationServiceOwnerActivationKeepsBootstrapAuthorityAvailableUntilExactPin(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceFakeRepository{plan: plan}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		ControlledWorkspaceResponseScanner: &evaluationControlledWorkspaceTestScanner{},
		OwnerAuthorityPurpose:              "full-attempt", OwnerActivationRequired: true,
		Clock: func() time.Time { return time.Date(2026, 8, 11, 1, 2, 3, 456_000_000, time.UTC) },
	})
	if err != nil {
		t.Fatal(err)
	}

	health := httptest.NewRecorder()
	handler.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if health.Code != http.StatusServiceUnavailable {
		t.Fatalf("pre-activation public health status=%d body=%s", health.Code, health.Body.String())
	}

	blocked := httptest.NewRecorder()
	handler.ServeHTTP(blocked, authorizedEvaluationServiceRequest(
		http.MethodGet, evaluationServiceTestURL(plan, "plan"), bytes.NewReader(nil),
	))
	if blocked.Code != http.StatusServiceUnavailable || repository.getCalls != 0 {
		t.Fatalf("pre-activation ledger route escaped the gate: status=%d gets=%d", blocked.Code, repository.getCalls)
	}

	bootstrap := httptest.NewRecorder()
	bootstrapRequest := authorizedEvaluationServiceRequest(
		http.MethodGet,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/controlled-workspace-owner/health",
		bytes.NewReader(nil),
	)
	bootstrapRequest.Header.Set(
		evaluationControlledWorkspaceOwnerLedgerPurposeHeader,
		evaluationControlledWorkspaceOwnerLedgerPurpose,
	)
	handler.ServeHTTP(bootstrap, bootstrapRequest)
	if bootstrap.Code != http.StatusOK || !strings.Contains(bootstrap.Body.String(), `"status":"ready"`) {
		t.Fatalf("bootstrap direct authority is unavailable: status=%d body=%s", bootstrap.Code, bootstrap.Body.String())
	}

	activationPath := "/v1/evaluations/" + evaluationServiceTestNamespace + "/owner-activation/health"
	activation := httptest.NewRecorder()
	handler.ServeHTTP(activation, authorizedEvaluationServiceRequest(
		http.MethodGet, activationPath, bytes.NewReader(nil),
	))
	var activationBody map[string]any
	if activation.Code != http.StatusOK || json.Unmarshal(activation.Body.Bytes(), &activationBody) != nil ||
		activationBody["phase"] != "bootstrap" || activationBody["status"] != "waiting-for-owner-authority" ||
		activationBody["ownerAuthorityHealthDigest"] != nil || activationBody["activatedAt"] != nil {
		t.Fatalf("bootstrap activation health drifted: status=%d body=%s", activation.Code, activation.Body.String())
	}

	ownerHealthDigest := evaluationServiceTestDigest(t, "full-attempt-owner-health")
	if err := handler.ActivateOwnerAuthority("full-attempt", ownerHealthDigest); err != nil {
		t.Fatal(err)
	}
	if err := handler.ActivateOwnerAuthority("full-attempt", ownerHealthDigest); err != nil {
		t.Fatalf("exact activation replay failed: %v", err)
	}
	if err := handler.ActivateOwnerAuthority(
		"full-attempt", evaluationServiceTestDigest(t, "swapped-owner-health"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("owner health swap error=%v, want ErrConflict", err)
	}
	if err := handler.ActivateOwnerAuthority("preplan", ownerHealthDigest); !errors.Is(err, ErrInvalid) {
		t.Fatalf("owner purpose swap error=%v, want ErrInvalid", err)
	}

	health = httptest.NewRecorder()
	handler.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if health.Code != http.StatusNoContent {
		t.Fatalf("activated public health status=%d body=%s", health.Code, health.Body.String())
	}
	activation = httptest.NewRecorder()
	handler.ServeHTTP(activation, authorizedEvaluationServiceRequest(
		http.MethodGet, activationPath, bytes.NewReader(nil),
	))
	activationBody = nil
	if activation.Code != http.StatusOK || json.Unmarshal(activation.Body.Bytes(), &activationBody) != nil ||
		activationBody["phase"] != "active" || activationBody["status"] != "ready" ||
		activationBody["ownerAuthorityHealthDigest"] != ownerHealthDigest ||
		activationBody["activatedAt"] != "2026-08-11T01:02:03.456Z" {
		t.Fatalf("active activation health drifted: status=%d body=%s", activation.Code, activation.Body.String())
	}
}

func TestEvaluationServiceRejectsOversizedBodyBeforeRepositoryMutation(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceFakeRepository{plan: plan}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	request := authorizedEvaluationServiceRequest(http.MethodPut, evaluationServiceTestURL(plan, "plan"), bytes.NewReader([]byte("{}")))
	request.ContentLength = maximumEvaluationServiceFactBytes + 1
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge || repository.storeCalls != 0 {
		t.Fatalf("unexpected body-limit response: status=%d calls=%d body=%s", response.Code, repository.storeCalls, response.Body.String())
	}
}

func TestEvaluationServiceRejectsChunkedControlBodyOverHardCap(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceFakeRepository{plan: plan}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	target := evaluationServiceTestURL(plan, "leases/shard-1/claim")
	request := authorizedEvaluationServiceRequest(
		http.MethodPost,
		target,
		bytes.NewReader(bytes.Repeat([]byte("x"), maximumEvaluationServiceControlBytes+1)),
	)
	request.ContentLength = -1
	request.TransferEncoding = []string{"chunked"}
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge || repository.getCalls != 1 {
		t.Fatalf("unexpected streamed body-limit response: status=%d gets=%d body=%s", response.Code, repository.getCalls, response.Body.String())
	}
}

func TestEvaluationServiceRejectsNamespaceAndPlanPartitionDriftBeforeMutation(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceFakeRepository{plan: plan}
	handler := newEvaluationServiceTestHandler(t, repository, nil)

	wrongNamespaceURL := strings.Replace(evaluationServiceTestURL(plan, "plan"), evaluationServiceTestNamespace, "evaluation.other", 1)
	request := authorizedEvaluationServiceRequest(http.MethodPut, wrongNamespaceURL, bytes.NewReader(plan.Canonical))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("unexpected namespace response: status=%d body=%s", response.Code, response.Body.String())
	}

	wrongDigest := "sha256-" + strings.Repeat("0", 64)
	wrongPartitionURL := strings.Replace(evaluationServiceTestURL(plan, "plan"), plan.PlanDigest, wrongDigest, 1)
	request = authorizedEvaluationServiceRequest(http.MethodPut, wrongPartitionURL, bytes.NewReader(plan.Canonical))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || repository.storeCalls != 0 {
		t.Fatalf("unexpected partition response: status=%d calls=%d body=%s", response.Code, repository.storeCalls, response.Body.String())
	}
}

func TestEvaluationServiceReconcilesBudgetByChargingDurableReservation(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	demandBytes, _ := evaluationBudgetFixtures(t, 1)
	reservedAt, err := time.Parse(time.RFC3339Nano, "2026-01-01T00:00:00.000Z")
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceBudgetFakeRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		snapshot: EvaluationBudgetSnapshot{
			Revision: 0,
			Reservations: []EvaluationBudgetReservationRecord{{
				ReservationID: "reservation-1", LedgerRevision: 0,
				DemandBytes: demandBytes, ReservedAt: reservedAt,
			}},
		},
	}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	query := url.Values{
		"expectedRevision": {"0"},
		"reason":           {"provider-disconnect"},
		"settledAt":        {"2026-01-01T00:00:01.000Z"},
	}
	target := evaluationServiceTestURL(plan, "budget/reconciliations/reservation-1") + "?" + query.Encode()
	request := authorizedEvaluationServiceRequest(http.MethodPut, target, bytes.NewReader(nil))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated || repository.settlementCalls != 1 || repository.settlementExpected != 0 {
		t.Fatalf("unexpected reconciliation response: status=%d calls=%d body=%s", response.Code, repository.settlementCalls, response.Body.String())
	}
	settlement, err := decodeEvaluationBudgetSettlement(
		repository.settlementBytes,
		mustDecodeEvaluationServiceDemand(demandBytes),
		reservedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !settlement.RequiresReconciliation || settlement.ReconciliationReason != "provider-disconnect" ||
		!bytes.Equal(settlement.Charged.Canonical, demandBytes) {
		t.Fatalf("reconciliation did not charge the durable reservation: %#v", settlement)
	}
}

func TestEvaluationServiceForwardsExactPartitionOnRead(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceFakeRepository{plan: plan}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	request := authorizedEvaluationServiceRequest(http.MethodGet, evaluationServiceTestURL(plan, "plan"), bytes.NewReader(nil))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	expectedPartition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	if response.Code != http.StatusOK || repository.getCalls != 1 || repository.lastPartition != expectedPartition {
		t.Fatalf("exact partition was not forwarded: status=%d calls=%d partition=%#v", response.Code, repository.getCalls, repository.lastPartition)
	}
}

func TestEvaluationServiceFailsClosedWithoutCapabilityOrAttestationTrustRoot(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	handler := newEvaluationServiceTestHandler(t, struct{}{}, nil)

	request := authorizedEvaluationServiceRequest(http.MethodGet, evaluationServiceTestURL(plan, "plan"), bytes.NewReader(nil))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("missing repository capability did not fail closed: %d %s", response.Code, response.Body.String())
	}

	request = authorizedEvaluationServiceRequest(http.MethodPut, evaluationServiceTestURL(plan, "authority-attestation"), bytes.NewReader([]byte("{}")))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("missing trust root did not fail closed: %d %s", response.Code, response.Body.String())
	}
}

func TestEvaluationServiceDoesNotExposeRepositoryErrorsOrRawToken(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	secretText := "sk-sensitive-provider-material"
	repository := &evaluationServiceFakeRepository{plan: plan, getError: errors.New("database failed near " + secretText)}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	if strings.Contains(fmt.Sprintf("%+v", handler), evaluationServiceTestToken) {
		t.Fatal("handler retained the raw service token")
	}
	request := authorizedEvaluationServiceRequest(http.MethodGet, evaluationServiceTestURL(plan, "plan"), bytes.NewReader(nil))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), secretText) {
		t.Fatalf("repository detail leaked: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestEvaluationServiceUsesBoundedExportLeasePagesAndAuthenticatedCursors(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	digest := func(value string) string {
		result, err := canonicaljson.Digest(map[string]any{"value": value})
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	families := make([]EvaluationExportFamilySummary, len(evaluationEvidenceExportFamilies))
	for index, family := range evaluationEvidenceExportFamilies {
		families[index] = EvaluationExportFamilySummary{
			Family: family, FamilyIndex: int64(index), ExpectedRecordSetDigest: digest(family + ".records"),
			ExpectedSemanticDigest: digest(family + ".semantic"),
		}
	}
	sourceIndex, _ := evaluationExportFamilyIndex("sourceReceipts")
	families[sourceIndex].ExpectedRecordCount = 2
	families[sourceIndex].ExpectedTotalBytes = 256
	createdAt := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	lease := EvaluationExportLease{
		Partition: EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		LeaseID:   "evaluation-export:test", LeaseDigest: digest("lease"), Families: families,
		TotalRecordCount: 2, TotalRecordBytes: 256, CreatedAt: createdAt, ExpiresAt: createdAt.Add(2 * time.Hour),
		CreatedAtText: evaluationExportInstant(createdAt), ExpiresAtText: evaluationExportInstant(createdAt.Add(2 * time.Hour)),
	}
	records := make([]EvaluationExportSourceRecord, 2)
	for index, identity := range []string{"source.a", "source.b"} {
		value := map[string]any{"sourceReceiptId": identity, "receiptDigest": digest(identity)}
		canonical, err := canonicaljson.Bytes(value)
		if err != nil {
			t.Fatal(err)
		}
		contentDigest, err := canonicaljson.Digest(value)
		if err != nil {
			t.Fatal(err)
		}
		orderKey, err := evaluationExportOrderKey(identity)
		if err != nil {
			t.Fatal(err)
		}
		records[index] = EvaluationExportSourceRecord{
			OrderKey: orderKey, RecordDigest: value["receiptDigest"].(string), ContentDigest: contentDigest,
			ByteLength: int64(len(canonical)), Value: json.RawMessage(canonical),
		}
	}
	repository := &evaluationServiceExportFakeRepository{lease: lease, records: records}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	sourceBinding := EvaluationEvidenceExportSourceBinding{
		SourceConfigDigest: digest("source-config"), FrozenRunDigest: digest("frozen-run"),
	}
	sourceBinding.RunConfigArtifactBinding = evaluationTestRunConfigArtifactBinding(
		t, plan.PlanDigest, plan.RepositoryCommit, sourceBinding.SourceConfigDigest, sourceBinding.FrozenRunDigest,
	)
	sourceBody, err := canonicaljson.Bytes(sourceBinding)
	if err != nil {
		t.Fatal(err)
	}
	openURL := evaluationServiceTestURL(plan, "export-leases")
	openResponse := httptest.NewRecorder()
	handler.ServeHTTP(openResponse, authorizedEvaluationServiceRequest(http.MethodPost, openURL, bytes.NewReader(sourceBody)))
	if openResponse.Code != http.StatusCreated || repository.openCalls != 1 || repository.sourceBinding != sourceBinding {
		t.Fatalf("unexpected export lease open: status=%d calls=%d binding=%#v body=%s",
			openResponse.Code, repository.openCalls, repository.sourceBinding, openResponse.Body.String())
	}
	for _, invalidBody := range [][]byte{
		[]byte(`{"sourceConfigDigest":"` + sourceBinding.SourceConfigDigest + `","frozenRunDigest":"` + sourceBinding.FrozenRunDigest + `"}`),
		append(append([]byte(nil), sourceBody[:len(sourceBody)-1]...), []byte(`,"extra":true}`)...),
	} {
		invalidResponse := httptest.NewRecorder()
		handler.ServeHTTP(invalidResponse, authorizedEvaluationServiceRequest(http.MethodPost, openURL, bytes.NewReader(invalidBody)))
		if invalidResponse.Code != http.StatusBadRequest || repository.openCalls != 1 {
			t.Fatalf("invalid export source reached repository: status=%d calls=%d body=%s",
				invalidResponse.Code, repository.openCalls, invalidResponse.Body.String())
		}
	}
	pageURL := evaluationServiceTestURL(plan, "export-leases/"+lease.LeaseID+"/families/sourceReceipts")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, authorizedEvaluationServiceRequest(http.MethodGet, pageURL, bytes.NewReader(nil)))
	if response.Code != http.StatusOK || response.Body.Len() > maximumEvaluationServiceExportPageBytes || repository.readCalls != 1 {
		t.Fatalf("unexpected bounded page response: status=%d reads=%d bytes=%d body=%s",
			response.Code, repository.readCalls, response.Body.Len(), response.Body.String())
	}
	var page map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	nextCursor, _ := page["nextCursor"].(string)
	pageDigest, _ := page["pageDigest"].(string)
	delete(page, "pageDigest")
	calculatedPageDigest, err := canonicaljson.Digest(page)
	if err != nil || nextCursor == "" || pageDigest != calculatedPageDigest {
		t.Fatalf("page digest/cursor drifted: next=%q digest=%q calculated=%q", nextCursor, pageDigest, calculatedPageDigest)
	}
	replacement := "A"
	if strings.HasSuffix(nextCursor, replacement) {
		replacement = "B"
	}
	tamperedCursor := nextCursor[:len(nextCursor)-1] + replacement
	tamperedResponse := httptest.NewRecorder()
	handler.ServeHTTP(tamperedResponse, authorizedEvaluationServiceRequest(
		http.MethodGet, pageURL+"?cursor="+url.QueryEscape(tamperedCursor), bytes.NewReader(nil),
	))
	if tamperedResponse.Code != http.StatusForbidden || repository.readCalls != 1 {
		t.Fatalf("tampered cursor reached repository: status=%d reads=%d body=%s",
			tamperedResponse.Code, repository.readCalls, tamperedResponse.Body.String())
	}
}

func TestEvaluationServiceMonolithicSnapshotRoutesFailClosed(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	handler := newEvaluationServiceTestHandler(t, &evaluationServiceFakeRepository{plan: plan}, nil)
	for _, testCase := range []struct {
		method string
		path   string
	}{{http.MethodGet, "snapshot"}, {http.MethodPost, "export"}} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, authorizedEvaluationServiceRequest(
			testCase.method, evaluationServiceTestURL(plan, testCase.path), bytes.NewReader(nil),
		))
		if response.Code != http.StatusServiceUnavailable {
			t.Fatalf("legacy %s route status=%d body=%s", testCase.path, response.Code, response.Body.String())
		}
	}
}

func TestEvaluationServiceReviewLeaseUsesBoundedAuthenticatedPages(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	createdAt := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	families := make([]EvaluationExportFamilySummary, len(evaluationReviewLeaseFamilies))
	for index, family := range evaluationReviewLeaseFamilies {
		families[index] = EvaluationExportFamilySummary{
			Family: family, FamilyIndex: int64(index),
			ExpectedRecordSetDigest: evaluationServiceTestDigest(t, family+".records"),
			ExpectedSemanticDigest:  evaluationServiceTestDigest(t, family+".semantic"),
		}
	}
	attemptIndex, _ := evaluationReviewLeaseFamilySpecFor("attempts")
	families[attemptIndex.Index].ExpectedRecordCount = 2
	families[attemptIndex.Index].ExpectedTotalBytes = 256
	commitments := EvaluationReviewLeaseCommitments{
		Format: evaluationReviewLeaseFormat, Version: 1, PlanDigest: plan.PlanDigest,
		RepositoryCommit: plan.RepositoryCommit, MachinePhaseDigest: evaluationServiceTestDigest(t, "machine-phase"),
		EligibleAttemptSetDigest:           families[0].ExpectedSemanticDigest,
		InvocationTurnReceiptSetDigest:     families[1].ExpectedSemanticDigest,
		InvocationTurnSetReceiptSetDigest:  families[2].ExpectedSemanticDigest,
		ExecutionReceiptSetDigest:          families[3].ExpectedSemanticDigest,
		ReviewRasterScanReceiptSetDigest:   families[4].ExpectedSemanticDigest,
		ReviewCandidateRefSetDigest:        families[5].ExpectedSemanticDigest,
		BlindReviewMappingSetDigest:        evaluationServiceTestDigest(t, "blind-mapping-set"),
		RandomizedPresentationPolicyDigest: evaluationServiceTestDigest(t, "presentation-policy"),
		CreatedAt:                          evaluationExportInstant(createdAt), ExpiresAt: evaluationExportInstant(createdAt.Add(2 * time.Hour)),
	}
	reviewLeaseDigest, err := canonicaljson.Digest(commitments)
	if err != nil {
		t.Fatal(err)
	}
	lease := EvaluationReviewLease{
		Partition: EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		LeaseID:   "evaluation-review-lease:test", ReviewLeaseDigest: reviewLeaseDigest,
		Commitments: commitments, Families: families, TotalRecordCount: 2, TotalRecordBytes: 256,
		CreatedAt: createdAt, ExpiresAt: createdAt.Add(2 * time.Hour),
		CreatedAtText: commitments.CreatedAt, ExpiresAtText: commitments.ExpiresAt,
	}
	records := make([]EvaluationExportSourceRecord, 2)
	for index, identity := range []string{"attempt.a", "attempt.b"} {
		value := map[string]any{"attemptId": identity, "attemptDigest": evaluationServiceTestDigest(t, identity)}
		canonical, err := canonicaljson.Bytes(value)
		if err != nil {
			t.Fatal(err)
		}
		contentDigest, err := canonicaljson.Digest(value)
		if err != nil {
			t.Fatal(err)
		}
		orderKey, err := evaluationExportOrderKey(identity)
		if err != nil {
			t.Fatal(err)
		}
		records[index] = EvaluationExportSourceRecord{
			OrderKey: orderKey, RecordDigest: value["attemptDigest"].(string), ContentDigest: contentDigest,
			ByteLength: int64(len(canonical)), Value: json.RawMessage(canonical),
		}
	}
	repository := &evaluationServiceReviewLeaseFakeRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		lease:                           lease,
		records:                         records,
	}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	openResponse := httptest.NewRecorder()
	handler.ServeHTTP(openResponse, authorizedEvaluationServiceRequest(
		http.MethodPost, evaluationServiceTestURL(plan, "review-leases"), bytes.NewReader(nil),
	))
	if openResponse.Code != http.StatusCreated || repository.openCalls != 1 ||
		!strings.Contains(openResponse.Body.String(), reviewLeaseDigest) {
		t.Fatalf("unexpected review lease open: status=%d calls=%d body=%s",
			openResponse.Code, repository.openCalls, openResponse.Body.String())
	}
	pageURL := evaluationServiceTestURL(plan, "review-leases/"+lease.LeaseID+"/families/attempts")
	pageResponse := httptest.NewRecorder()
	handler.ServeHTTP(pageResponse, authorizedEvaluationServiceRequest(http.MethodGet, pageURL, bytes.NewReader(nil)))
	if pageResponse.Code != http.StatusOK || repository.readCalls != 1 ||
		pageResponse.Body.Len() > maximumEvaluationServiceExportPageBytes {
		t.Fatalf("unexpected review lease page: status=%d reads=%d bytes=%d body=%s",
			pageResponse.Code, repository.readCalls, pageResponse.Body.Len(), pageResponse.Body.String())
	}
	var page map[string]any
	if err := json.Unmarshal(pageResponse.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if next, _ := page["nextCursor"].(string); next == "" {
		t.Fatal("review lease first page omitted its authenticated continuation cursor")
	}
}

func TestEvaluationBoundedStatusRebuildsCurrentPlanDenominator(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	attempt, err := decodeEvaluationAttempt(vector.Facts.Attempt)
	if err != nil {
		t.Fatal(err)
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		t.Fatal(err)
	}
	if int64(len(planned)) != plan.PlannedJourneyCount {
		t.Fatalf("planned denominator=%d want=%d", len(planned), plan.PlannedJourneyCount)
	}
	found := false
	for _, descriptor := range planned {
		if descriptor.AttemptID == attempt.AttemptID {
			found = descriptor.ShardID == attempt.ShardID
			break
		}
	}
	if !found {
		t.Fatal("bounded status schedule drifted from the canonical attempt vector")
	}
}

func TestEvaluationServiceConstructorRejectsWeakAuthorityConfiguration(t *testing.T) {
	if _, err := NewEvaluationServiceHandler(struct{}{}, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: "short",
	}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("weak token accepted: %v", err)
	}
	if _, err := NewEvaluationServiceHandler(struct{}{}, EvaluationServiceHandlerConfig{
		NamespaceID: "invalid namespace", ServiceToken: evaluationServiceTestToken,
	}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid namespace accepted: %v", err)
	}
}

func TestEvaluationServiceTokenUsesCanonicalASCIIAlphabet(t *testing.T) {
	valid := []string{
		strings.Repeat("a", 32),
		strings.Repeat("A0._~+/-", 4),
		strings.Repeat("z", 30) + "==",
		strings.Repeat("x", 4_096),
	}
	for _, token := range valid {
		if !validEvaluationServiceToken(token) {
			t.Fatalf("canonical service token was rejected: %q", token)
		}
	}
	invalid := []string{
		strings.Repeat("a", 31),
		strings.Repeat("a", 4_097),
		strings.Repeat("a", 31) + "!",
		strings.Repeat("a", 31) + "=a",
		strings.Repeat("a", 31) + "===",
		strings.Repeat("a", 31) + "\n",
		strings.Repeat("a", 31) + "\t",
		strings.Repeat("a", 31) + "\x00",
		strings.Repeat("a", 31) + `"`,
		strings.Repeat("a", 31) + `\`,
		strings.Repeat("a", 31) + " ",
		strings.Repeat("a", 31) + "é",
	}
	for _, token := range invalid {
		if validEvaluationServiceToken(token) {
			t.Fatalf("noncanonical service token was accepted: %q", token)
		}
	}
}
