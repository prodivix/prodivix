package agent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func newEvaluationCapabilityEffectProviderJournalHandlerTest(
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
	journal, err := NewEvaluationCapabilityEffectProviderJournal(
		EvaluationCapabilityEffectProviderJournalConfig{
			Repository: repository, OwnerInstanceID: "g4-provider-journal-owner-test", Clock: clock,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		CapabilityEffectProviderJournal: journal,
		OwnerActivationRequired:         true,
		OwnerAuthorityPurpose:           "full-attempt",
		Clock:                           clock,
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler, mock
}

func newEvaluationCapabilityEffectProviderJournalRecoveryHandlerTest(
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
	journal, err := NewEvaluationCapabilityEffectProviderJournal(
		EvaluationCapabilityEffectProviderJournalConfig{
			Repository: repository, OwnerInstanceID: "g4-provider-journal-owner-test", Clock: clock,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	vault, err := NewRepositoryEvaluationNativeProviderStateVaultRecovery(
		repository, make([]byte, 32), "g4-native-provider-state-vault-recovery-test", clock,
	)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		CapabilityEffectProviderJournal: journal, NativeProviderStateVault: vault, Clock: clock,
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler, mock
}

func evaluationCapabilityEffectProviderJournalHealthTestRequest() *http.Request {
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/"+
			evaluationCapabilityEffectProviderJournalRouteSegment+"/health",
		nil,
	)
	request.Header.Set("Authorization", "Bearer "+evaluationServiceTestToken)
	request.Header.Set(
		evaluationCapabilityEffectProviderJournalPurposeHeader,
		evaluationCapabilityEffectProviderJournalPurpose,
	)
	return request
}

func TestCapabilityEffectProviderJournalHealthIsReachableBeforeOwnerActivation(t *testing.T) {
	checkedAt := time.Date(2026, 8, 11, 4, 5, 6, 789_000_000, time.UTC)
	handler, mock := newEvaluationCapabilityEffectProviderJournalHandlerTest(t, func() time.Time { return checkedAt })
	mock.ExpectQuery(`SELECT\s+\(SELECT COUNT\(\*\) FROM agent_evaluation_capability_effect_provider_journal_spool_payloads`).
		WithArgs(evaluationServiceTestNamespace, "g4-provider-journal-owner-test", checkedAt).
		WillReturnRows(sqlmock.NewRows([]string{
			"residual", "expired", "unfinished", "overdue", "abandoned",
		}).AddRow(int64(0), int64(0), int64(0), int64(0), int64(0)))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, evaluationCapabilityEffectProviderJournalHealthTestRequest())

	if response.Code != http.StatusOK ||
		!strings.Contains(response.Body.String(), `"status":"healthy"`) ||
		!strings.Contains(response.Body.String(), `"ownerInstanceId":"g4-provider-journal-owner-test"`) {
		t.Fatalf("unexpected journal health response: status=%d body=%s", response.Code, response.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCapabilityEffectProviderJournalHealthIsOwnerBound(t *testing.T) {
	checkedAt := time.Date(2026, 8, 11, 4, 15, 16, 789_000_000, time.UTC)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	repository := NewRepository(database)
	ownerA, err := NewEvaluationCapabilityEffectProviderJournal(EvaluationCapabilityEffectProviderJournalConfig{
		Repository: repository, OwnerInstanceID: "g4-provider-journal-owner-a", Clock: func() time.Time { return checkedAt },
	})
	if err != nil {
		t.Fatal(err)
	}
	ownerB, err := NewEvaluationCapabilityEffectProviderJournal(EvaluationCapabilityEffectProviderJournalConfig{
		Repository: repository, OwnerInstanceID: "g4-provider-journal-owner-b", Clock: func() time.Time { return checkedAt },
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, expectation := range []struct {
		owner string
		row   []int64
	}{
		{owner: "g4-provider-journal-owner-a", row: []int64{0, 0, 0, 0, 0}},
		{owner: "g4-provider-journal-owner-b", row: []int64{1, 1, 1, 1, 0}},
	} {
		mock.ExpectQuery(`SELECT\s+\(SELECT COUNT\(\*\) FROM agent_evaluation_capability_effect_provider_journal_spool_payloads`).
			WithArgs(evaluationServiceTestNamespace, expectation.owner, checkedAt).
			WillReturnRows(sqlmock.NewRows([]string{
				"residual", "expired", "unfinished", "overdue", "abandoned",
			}).AddRow(expectation.row[0], expectation.row[1], expectation.row[2], expectation.row[3], expectation.row[4]))
	}
	authority := EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: evaluationServiceTestNamespace}
	responseA, healthyA, err := ownerA.Health(t.Context(), authority)
	if err != nil || !healthyA || !strings.Contains(string(responseA), `"ownerInstanceId":"g4-provider-journal-owner-a"`) {
		t.Fatalf("owner A health drifted: healthy=%v err=%v body=%s", healthyA, err, responseA)
	}
	responseB, healthyB, err := ownerB.Health(t.Context(), authority)
	if err != nil || healthyB || !strings.Contains(string(responseB), `"ownerInstanceId":"g4-provider-journal-owner-b"`) ||
		!strings.Contains(string(responseB), `"overdueUnfinishedOwnerCount":1`) {
		t.Fatalf("owner B health drifted: healthy=%v err=%v body=%s", healthyB, err, responseB)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCapabilityEffectProviderJournalPreplanExposesHealthOnly(t *testing.T) {
	checkedAt := time.Date(2026, 8, 11, 4, 25, 26, 789_000_000, time.UTC)
	handler, mock := newEvaluationCapabilityEffectProviderJournalHandlerTest(t, func() time.Time { return checkedAt })
	handler.ownerAuthorityPurpose = "preplan"
	mock.ExpectQuery(`SELECT\s+\(SELECT COUNT\(\*\) FROM agent_evaluation_capability_effect_provider_journal_spool_payloads`).
		WithArgs(evaluationServiceTestNamespace, "g4-provider-journal-owner-test", checkedAt).
		WillReturnRows(sqlmock.NewRows([]string{
			"residual", "expired", "unfinished", "overdue", "abandoned",
		}).AddRow(int64(0), int64(0), int64(0), int64(0), int64(0)))
	healthResponse := httptest.NewRecorder()
	handler.ServeHTTP(healthResponse, evaluationCapabilityEffectProviderJournalHealthTestRequest())
	if healthResponse.Code != http.StatusOK {
		t.Fatalf("preplan journal health was unavailable: status=%d body=%s", healthResponse.Code, healthResponse.Body.String())
	}
	planDigest := evaluationServiceTestDigest(t, "journal preplan")
	writeRequest := httptest.NewRequest(http.MethodPost,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/"+planDigest+"/0123456789012345678901234567890123456789/"+
			evaluationCapabilityEffectProviderJournalRouteSegment+"/stages", strings.NewReader(`{}`))
	writeRequest.Header.Set("Authorization", "Bearer "+evaluationServiceTestToken)
	writeRequest.Header.Set(evaluationCapabilityEffectProviderJournalPurposeHeader, evaluationCapabilityEffectProviderJournalPurpose)
	writeResponse := httptest.NewRecorder()
	handler.ServeHTTP(writeResponse, writeRequest)
	if writeResponse.Code != http.StatusNotFound {
		t.Fatalf("preplan journal write route was exposed: status=%d body=%s", writeResponse.Code, writeResponse.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCapabilityEffectProviderJournalRouteRequiresOneExactPurpose(t *testing.T) {
	handler, mock := newEvaluationCapabilityEffectProviderJournalHandlerTest(t, time.Now)
	for _, mutate := range []func(*http.Request){
		func(request *http.Request) {
			request.Header.Del(evaluationCapabilityEffectProviderJournalPurposeHeader)
		},
		func(request *http.Request) {
			request.Header.Set(evaluationCapabilityEffectProviderJournalPurposeHeader, "wrong-purpose")
		},
		func(request *http.Request) {
			request.Header.Add(
				evaluationCapabilityEffectProviderJournalPurposeHeader,
				evaluationCapabilityEffectProviderJournalPurpose,
			)
		},
	} {
		request := evaluationCapabilityEffectProviderJournalHealthTestRequest()
		mutate(request)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusForbidden {
			t.Fatalf("non-exact purpose reached journal: status=%d body=%s", response.Code, response.Body.String())
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCapabilityEffectProviderJournalRecoveryAllowsReadAndCleanupRoutesOnly(t *testing.T) {
	checkedAt := time.Date(2026, 8, 11, 5, 6, 7, 890_000_000, time.UTC)
	handler, mock := newEvaluationCapabilityEffectProviderJournalRecoveryHandlerTest(t, func() time.Time { return checkedAt })
	mock.ExpectQuery(`SELECT\s+\(SELECT COUNT\(\*\) FROM agent_evaluation_capability_effect_provider_journal_spool_payloads`).
		WithArgs(evaluationServiceTestNamespace, "g4-provider-journal-owner-test", checkedAt).
		WillReturnRows(sqlmock.NewRows([]string{
			"residual", "expired", "unfinished", "overdue", "abandoned",
		}).AddRow(int64(0), int64(0), int64(0), int64(0), int64(0)))
	healthResponse := httptest.NewRecorder()
	handler.ServeHTTP(healthResponse, evaluationCapabilityEffectProviderJournalHealthTestRequest())
	if healthResponse.Code != http.StatusOK {
		t.Fatalf("recovery journal health was unavailable: status=%d body=%s", healthResponse.Code, healthResponse.Body.String())
	}

	planDigest := evaluationServiceTestDigest(t, "journal recovery plan")
	commit := "0123456789012345678901234567890123456789"
	attemptID := "attempt-journal-recovery-01"
	mock.ExpectQuery(`SELECT\s+\(SELECT COUNT\(\*\) FROM agent_evaluation_capability_effect_provider_journal_spool_payloads payload`).
		WithArgs(evaluationServiceTestNamespace, planDigest, commit, "g4-provider-journal-owner-test", attemptID).
		WillReturnRows(sqlmock.NewRows([]string{
			"residual", "unfinished", "abandoned_spools", "abandoned_owners",
		}).AddRow(int64(0), int64(0), int64(0), int64(0)))
	zeroRequest := httptest.NewRequest(http.MethodGet,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/"+planDigest+"/"+commit+"/"+
			evaluationCapabilityEffectProviderJournalRouteSegment+"/attempts/"+attemptID+"/zero-residual", nil)
	zeroRequest.Header.Set("Authorization", "Bearer "+evaluationServiceTestToken)
	zeroRequest.Header.Set(evaluationCapabilityEffectProviderJournalPurposeHeader, evaluationCapabilityEffectProviderJournalPurpose)
	zeroResponse := httptest.NewRecorder()
	handler.ServeHTTP(zeroResponse, zeroRequest)
	if zeroResponse.Code != http.StatusOK || !strings.Contains(zeroResponse.Body.String(), `"unfinishedOwnerCount":0`) {
		t.Fatalf("recovery journal zero receipt failed: status=%d body=%s", zeroResponse.Code, zeroResponse.Body.String())
	}

	base := "/v1/evaluations/" + evaluationServiceTestNamespace + "/" + planDigest + "/" + commit + "/" +
		evaluationCapabilityEffectProviderJournalRouteSegment + "/"
	for _, path := range []string{base + "cleanup", base + "owner-requests/" + evaluationServiceTestDigest(t, "owner")} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		if !handler.evaluationCapabilityEffectProviderJournalRecoveryRoute(request) {
			t.Fatalf("recovery route was rejected: %s", path)
		}
	}
	for _, path := range []string{base + "stages", base + "executions", base + "results"} {
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
		request.Header.Set("Authorization", "Bearer "+evaluationServiceTestToken)
		request.Header.Set(evaluationCapabilityEffectProviderJournalPurposeHeader, evaluationCapabilityEffectProviderJournalPurpose)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Fatalf("recovery write route was exposed: path=%s status=%d body=%s", path, response.Code, response.Body.String())
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCapabilityEffectProviderJournalConstructorFailsClosedWithoutRepository(t *testing.T) {
	journal, err := NewEvaluationCapabilityEffectProviderJournal(
		EvaluationCapabilityEffectProviderJournalConfig{OwnerInstanceID: "g4-provider-journal-owner-test"},
	)
	if err == nil || journal != nil {
		t.Fatalf("journal without durable repository was accepted: journal=%#v err=%v", journal, err)
	}
}
