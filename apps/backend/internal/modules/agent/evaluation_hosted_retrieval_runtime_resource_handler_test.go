package agent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func newEvaluationHostedRetrievalRuntimeResourceHandlerTest(
	t *testing.T,
	clock func() time.Time,
) (*EvaluationServiceHandler, sqlmock.Sqlmock) {
	t.Helper()
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	repository := NewRepository(database)
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(
		EvaluationHostedRetrievalRuntimeResourceConfig{Repository: repository, Clock: clock},
	)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		HostedRetrievalRuntimeResource:     owner,
		HostedRetrievalRuntimeResourceRole: "preplan",
		OwnerActivationRequired:            true,
		OwnerAuthorityPurpose:              "preplan",
		Clock:                              clock,
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler, mock
}

func newEvaluationHostedRetrievalRuntimeResourceRoleHandlerTest(
	t *testing.T,
	role string,
	ownerPurpose string,
	activationRequired bool,
) *EvaluationServiceHandler {
	t.Helper()
	database, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	repository := NewRepository(database)
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(
		EvaluationHostedRetrievalRuntimeResourceConfig{Repository: repository},
	)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		HostedRetrievalRuntimeResource: owner, HostedRetrievalRuntimeResourceRole: role,
		OwnerAuthorityPurpose: ownerPurpose, OwnerActivationRequired: activationRequired,
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func evaluationHostedRetrievalRuntimeResourcePOSTTestRequest(route string, purpose string) *http.Request {
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/"+route,
		strings.NewReader("{}"),
	)
	request.Header.Set("Authorization", "Bearer "+evaluationServiceTestToken)
	request.Header.Set("Content-Type", "application/json; charset=utf-8")
	request.Header.Set("Idempotency-Key", "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	request.Header.Set(evaluationHostedRetrievalRuntimeResourcePurposeHeader, purpose)
	return request
}

func evaluationHostedRetrievalRuntimeResourceOwnerHealthTestRequest() *http.Request {
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/"+
			evaluationHostedRetrievalRuntimeResourceOwnerHealthRouteSegment,
		nil,
	)
	request.Header.Set("Authorization", "Bearer "+evaluationServiceTestToken)
	request.Header.Set(
		evaluationHostedRetrievalRuntimeResourcePurposeHeader,
		evaluationHostedRetrievalRuntimeResourceOwnerHealthPurpose,
	)
	return request
}

func TestHostedRetrievalRuntimeResourceOwnerHealthIsLiveAndReachableBeforeActivation(t *testing.T) {
	checkedAt := time.Date(2026, 8, 11, 8, 9, 10, 123_000_000, time.UTC)
	source, err := createEvaluationHostedRetrievalRuntimeResourceOwnerHealthReceipt(
		evaluationServiceTestNamespace,
		evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary{
			LedgerRevision: 7, RegistrationCount: 4, ActiveResourceCount: 4,
			ActiveReadLeaseCount: 1,
		},
		checkedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	receipt, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceOwnerHealthBytes)
	storage, storageOK := objectMember(receipt, "storageSummary")
	if err != nil || !storageOK || !exactEvaluationKeys(receipt, []string{
		"format", "version", "purpose", "namespaceId", "ownerAuthorityIssuerId", "implementationDigest",
		"schemaContractDigest", "supportedOperations", "storageSummary", "storageSummaryDigest", "status",
		"checkedAt", "expiresAt", "receiptDigest",
	}) || stringMember(receipt, "ownerAuthorityIssuerId") != evaluationHostedRetrievalRuntimeResourceOwnerAuthorityIssuerID ||
		stringMember(receipt, "implementationDigest") != evaluationHostedRetrievalRuntimeResourceOwnerImplementationDigest ||
		stringMember(receipt, "schemaContractDigest") != evaluationHostedRetrievalRuntimeResourceOwnerHealthSchemaContractDigest ||
		stringMember(receipt, "storageSummaryDigest") != stringMember(storage, "summaryDigest") ||
		stringMember(storage, "summarizedAt") != evaluationExportInstant(checkedAt) ||
		stringMember(receipt, "checkedAt") != evaluationExportInstant(checkedAt) ||
		stringMember(receipt, "expiresAt") != evaluationExportInstant(checkedAt.Add(125*time.Second)) ||
		stringMember(receipt, "status") != "ready" {
		t.Fatalf("hosted owner health drifted: %#v err=%v", receipt, err)
	}
}

func TestHostedRetrievalRuntimeResourceOwnerHealthRejectsUnfinishedOrOverdueBacklog(t *testing.T) {
	checkedAt := time.Date(2026, 8, 11, 9, 10, 11, 0, time.UTC)
	for _, summary := range []evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary{
		{LedgerRevision: 11, RegistrationCount: 4, ActiveResourceCount: 2, UnfinishedCleanupCount: 1},
		{LedgerRevision: 11, RegistrationCount: 4, ActiveResourceCount: 2, OverdueCount: 1},
	} {
		if _, err := createEvaluationHostedRetrievalRuntimeResourceOwnerHealthReceipt(
			evaluationServiceTestNamespace, summary, checkedAt,
		); err == nil {
			t.Fatalf("hosted owner health accepted backlog: %#v", summary)
		}
	}
}

func TestHostedRetrievalRuntimeResourceHealthAllowsActiveResourcesAndPreplanRequiresZero(t *testing.T) {
	summary := evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary{
		LedgerRevision: 12, RegistrationCount: 4, ActiveResourceCount: 4, ActiveReadLeaseCount: 2,
	}
	if !evaluationHostedRetrievalRuntimeResourceOwnerHealthReady(summary) {
		t.Fatal("generic hosted health rejected legal active resources and read leases")
	}
	if evaluationHostedRetrievalRuntimeResourcePreplanStorageZero(summary) {
		t.Fatal("preplan zero helper accepted active resources and read leases")
	}
	summary.ActiveResourceCount, summary.ActiveReadLeaseCount = 0, 0
	if !evaluationHostedRetrievalRuntimeResourcePreplanStorageZero(summary) {
		t.Fatal("preplan zero helper rejected a zero-residual summary")
	}
}

func TestHostedRetrievalRuntimeResourceOwnerHealthIsReadyOnlyWithZeroBacklog(t *testing.T) {
	checkedAt := time.Date(2026, 8, 12, 8, 0, 0, 0, time.UTC)
	for _, testCase := range []struct {
		name    string
		summary evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary
		status  int
	}{
		{
			name: "active resources and leases with zero backlog",
			summary: evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary{
				LedgerRevision: 13, RegistrationCount: 4, ActiveResourceCount: 4, ActiveReadLeaseCount: 2,
			},
			status: http.StatusOK,
		},
		{
			name: "unfinished lifecycle work",
			summary: evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary{
				LedgerRevision: 14, RegistrationCount: 4, ActiveResourceCount: 2, UnfinishedCleanupCount: 1,
			},
			status: http.StatusServiceUnavailable,
		},
		{
			name: "overdue lifecycle work",
			summary: evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary{
				LedgerRevision: 15, RegistrationCount: 4, ActiveResourceCount: 2, OverdueCount: 1,
			},
			status: http.StatusServiceUnavailable,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			handler, mock := newEvaluationHostedRetrievalRuntimeResourceHandlerTest(t, func() time.Time { return checkedAt })
			mock.ExpectQuery("agent_evaluation_hosted_runtime_resource_owner_storage_summary").
				WithArgs(evaluationServiceTestNamespace, checkedAt).
				WillReturnRows(sqlmock.NewRows([]string{
					"ledger_revision", "registration_count", "active_resource_count", "active_read_lease_count",
					"unfinished_cleanup_count", "overdue_count",
				}).AddRow(
					testCase.summary.LedgerRevision, testCase.summary.RegistrationCount,
					testCase.summary.ActiveResourceCount, testCase.summary.ActiveReadLeaseCount,
					testCase.summary.UnfinishedCleanupCount, testCase.summary.OverdueCount,
				))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, evaluationHostedRetrievalRuntimeResourceOwnerHealthTestRequest())
			if response.Code != testCase.status {
				t.Fatalf("health status=%d, want %d body=%s", response.Code, testCase.status, response.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestHostedRetrievalRuntimeResourceOwnerHealthRequiresExactPurposeAndRepository(t *testing.T) {
	handler, mock := newEvaluationHostedRetrievalRuntimeResourceHandlerTest(t, time.Now)
	for _, mutate := range []func(*http.Request){
		func(request *http.Request) { request.Header.Del(evaluationHostedRetrievalRuntimeResourcePurposeHeader) },
		func(request *http.Request) {
			request.Header.Set(evaluationHostedRetrievalRuntimeResourcePurposeHeader, "foreign-purpose")
		},
		func(request *http.Request) {
			request.Header.Add(evaluationHostedRetrievalRuntimeResourcePurposeHeader, evaluationHostedRetrievalRuntimeResourceOwnerHealthPurpose)
		},
	} {
		request := evaluationHostedRetrievalRuntimeResourceOwnerHealthTestRequest()
		mutate(request)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusForbidden {
			t.Fatalf("non-exact hosted health purpose was accepted: status=%d body=%s", response.Code, response.Body.String())
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}

	database, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	repository := NewRepository(database)
	withoutOwner, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
	})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	withoutOwner.ServeHTTP(response, evaluationHostedRetrievalRuntimeResourceOwnerHealthTestRequest())
	if response.Code != http.StatusNotFound {
		t.Fatalf("process without a hosted role exposed its health route: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestHostedRetrievalRuntimeResourceRolesExposeOnlyTheirPurposeBoundRoutes(t *testing.T) {
	tests := []struct {
		name               string
		role               string
		ownerPurpose       string
		activationRequired bool
		route              string
		purpose            string
		wantStatus         int
	}{
		{
			name: "full lookup is reachable before activation", role: "full-attempt",
			ownerPurpose: "full-attempt", activationRequired: true,
			route:      evaluationHostedRetrievalRuntimeResourceResultsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceRegistrationSetReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "full cannot prepare", role: "full-attempt",
			ownerPurpose: "full-attempt", activationRequired: true,
			route:      evaluationHostedRetrievalRuntimeResourceRegistrationsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourcePreparePurpose,
			wantStatus: http.StatusNotFound,
		},
		{
			name: "full read is reachable before activation", role: "full-attempt",
			ownerPurpose: "full-attempt", activationRequired: true,
			route:      evaluationHostedRetrievalRuntimeResourceReadsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "preplan is health only", role: "preplan",
			ownerPurpose: "preplan", activationRequired: true,
			route:      evaluationHostedRetrievalRuntimeResourceResultsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceRegistrationSetReadPurpose,
			wantStatus: http.StatusNotFound,
		},
		{
			name: "prepare owns registration", role: "prepare",
			route:      evaluationHostedRetrievalRuntimeResourceRegistrationsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourcePreparePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "prepare owns registration result", role: "prepare",
			route:      evaluationHostedRetrievalRuntimeResourceResultsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourcePreparePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "prepare owns lifecycle create stage", role: "prepare",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "prepare can verify lifecycle unfinished zero state", role: "prepare",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "prepare owns lifecycle create seal", role: "prepare",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "cleanup owns terminal fence derive", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceTerminalFencesRouteSegment + "/derive",
			purpose:    evaluationHostedRetrievalRuntimeResourceTerminalFencePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "cleanup owns post matrix claim", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupClaimPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "cleanup owns provider cleanup seal", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceCleanupsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupExecutePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "cleanup owns result read", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceCleanupResultsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupResultReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "cleanup owns lifecycle delete stage", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "cleanup can verify lifecycle unfinished zero state", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "cleanup owns lifecycle delete seal", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "cleanup cannot read active resources", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceReadsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceReadPurpose,
			wantStatus: http.StatusNotFound,
		},
		{
			name: "recovery cannot prepare", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceRegistrationsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourcePreparePurpose,
			wantStatus: http.StatusNotFound,
		},
		{
			name: "recovery owns candidate scan", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceRecoveryCandidatesRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceRecoveryListPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns cleanup claim", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceRecoveryCleanupClaimPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns provider cleanup seal", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceCleanupsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceRecoveryCleanupExecutePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns result read", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceCleanupResultsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceRecoveryCleanupResultReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns reconcile-only lifecycle stage", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns lifecycle unfinished discovery", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns encrypted lifecycle transport read", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns lifecycle reconciliation observation store", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStorePurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns lifecycle archive read", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "recovery owns reconciled lifecycle seal", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "full cannot stage lifecycle dispatch", role: "full-attempt",
			ownerPurpose: "full-attempt", activationRequired: true,
			route:      evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose,
			wantStatus: http.StatusNotFound,
		},
		{
			name: "cleanup cannot use recovery purpose", role: "cleanup",
			route:      evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourceRecoveryCleanupClaimPurpose,
			wantStatus: http.StatusNotFound,
		},
		{
			name: "recovery cannot use post matrix purpose", role: "recovery",
			route:      evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment,
			purpose:    evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupClaimPurpose,
			wantStatus: http.StatusNotFound,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := newEvaluationHostedRetrievalRuntimeResourceRoleHandlerTest(
				t, test.role, test.ownerPurpose, test.activationRequired,
			)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, evaluationHostedRetrievalRuntimeResourcePOSTTestRequest(test.route, test.purpose))
			if response.Code != test.wantStatus {
				t.Fatalf("hosted role route status drifted: got=%d want=%d body=%s", response.Code, test.wantStatus, response.Body.String())
			}
		})
	}
}
