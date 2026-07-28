package verification

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	"github.com/gin-gonic/gin"
)

func TestVerificationRoutesFailClosedWithoutAuthenticatedUser(t *testing.T) {
	router := verificationTestRouter(NewHandler(nil), false)
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/workspaces/workspace-1/verification/evidence",
		nil,
	)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("unauthenticated status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestVerificationMutationIntentFailsClosedWithCanonicalDiagnostic(t *testing.T) {
	router := verificationTestRouter(NewHandler(nil), true)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/workspaces/workspace-1/verification/promotions",
		bytes.NewReader([]byte(`{}`)),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("missing intent status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
	if code := verificationErrorCode(t, recorder); code != "VER-4002" {
		t.Fatalf("missing intent diagnostic = %q, want VER-4002", code)
	}
}

func TestVerificationMutationsRequireIdempotencyKey(t *testing.T) {
	router := verificationTestRouter(NewHandler(nil), true)
	cases := []struct {
		method string
		path   string
		intent string
	}{
		{
			method: http.MethodPost,
			path:   "/api/workspaces/workspace-1/verification/evidence/evidence-1/supersede",
			intent: "supersede",
		},
		{
			method: http.MethodPost,
			path:   "/api/workspaces/workspace-1/verification/evidence/evidence-1/retention",
			intent: "retention",
		},
		{
			method: http.MethodDelete,
			path:   "/api/workspaces/workspace-1/verification/evidence/evidence-1",
			intent: "delete",
		},
		{
			method: http.MethodPost,
			path:   "/api/workspaces/workspace-1/verification/revocations",
			intent: "revoke",
		},
	}
	for _, testCase := range cases {
		request := httptest.NewRequest(testCase.method, testCase.path, bytes.NewReader([]byte(`{}`)))
		request.Header.Set(verificationIntentHeader, testCase.intent)
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusBadRequest {
			t.Errorf("%s %s status = %d, want %d", testCase.method, testCase.path, recorder.Code, http.StatusBadRequest)
			continue
		}
		if code := verificationErrorCode(t, recorder); code != "VER-4002" {
			t.Errorf("%s %s diagnostic = %q, want VER-4002", testCase.method, testCase.path, code)
		}
	}
}

func TestVerificationMutationsRequireOperationSpecificPreconditions(t *testing.T) {
	router := verificationTestRouter(NewHandler(nil), true)
	cases := []struct {
		method string
		path   string
		intent string
		body   string
	}{
		{
			method: http.MethodPost,
			path:   "/api/workspaces/workspace-1/verification/evidence/evidence-1/supersede",
			intent: "supersede",
			body:   `{"newEvidenceId":"evidence-2","reason":"retry"}`,
		},
		{
			method: http.MethodPost,
			path:   "/api/workspaces/workspace-1/verification/evidence/evidence-1/retention",
			intent: "retention",
			body:   `{"action":"protect","kind":"change","externalRef":"change-1","expectedProtectionState":"absent"}`,
		},
		{
			method: http.MethodDelete,
			path:   "/api/workspaces/workspace-1/verification/evidence/evidence-1?reason=cleanup",
			intent: "delete",
			body:   `{}`,
		},
		{
			method: http.MethodPost,
			path:   "/api/workspaces/workspace-1/verification/revocations",
			intent: "revoke",
			body:   `{"evidenceId":"evidence-1","reasonCode":"compromised","reason":"compromised","effectiveAt":"2026-07-28T00:00:02.000Z"}`,
		},
	}
	for _, testCase := range cases {
		request := httptest.NewRequest(testCase.method, testCase.path, bytes.NewReader([]byte(testCase.body)))
		request.Header.Set(verificationIntentHeader, testCase.intent)
		request.Header.Set("Idempotency-Key", "mutation-request-key-0001")
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusPreconditionRequired {
			t.Errorf("%s %s status = %d, want %d: %s", testCase.method, testCase.path, recorder.Code, http.StatusPreconditionRequired, recorder.Body.String())
		}
	}
}

func TestArtifactHTTPDownloadVerifiesBytesAndSetsSafeAttachmentHeaders(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	body := verificationConsoleArtifactBody(t)
	digest := digestBytes(body)
	store, err := NewFilesystemArtifactStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	staged, err := store.PutStaging(
		context.Background(), "promotion-1", "artifact-1",
		bytes.NewReader(body), int64(len(body)),
	)
	if err != nil {
		t.Fatal(err)
	}
	durable, err := store.Promote(
		context.Background(), "workspace-1", digest, int64(len(body)), staged.Locator,
	)
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectQuery(`(?s)SELECT\s+EXISTS.*verification_tombstones`).
		WithArgs("workspace-1", "evidence-1").
		WillReturnRows(sqlmock.NewRows([]string{"evidence_exists", "tombstoned"}).AddRow(true, false))
	mock.ExpectQuery(`(?s)SELECT a\.store_locator.*verification_evidence_artifacts`).
		WithArgs("workspace-1", "evidence-1", "artifact-1").
		WillReturnRows(sqlmock.NewRows([]string{
			"store_locator", "digest", "media_type", "byte_length", "kind", "physical_byte_length",
		}).AddRow(
			durable.Locator, digest, "application/json", len(body),
			string(ArtifactConsoleSummary), len(body),
		))
	service := &Service{
		repository:  NewRepository(database),
		store:       store,
		permissions: allowVerificationPermissions{},
	}
	router := verificationTestRouter(NewHandler(service), true)
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/workspaces/workspace-1/verification/evidence/evidence-1/artifacts/artifact-1/content",
		nil,
	)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("download status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if !bytes.Equal(recorder.Body.Bytes(), body) {
		t.Fatalf("download body = %q, want %q", recorder.Body.Bytes(), body)
	}
	expectedHeaders := map[string]string{
		"Content-Type":            "application/json",
		"Content-Disposition":     `attachment; filename="artifact-1"`,
		"X-Content-Type-Options":  "nosniff",
		"Content-Security-Policy": "sandbox; default-src 'none'",
		"Cache-Control":           "private, no-store",
		"ETag":                    `"` + digest + `"`,
	}
	for name, want := range expectedHeaders {
		if got := recorder.Header().Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTombstonedArtifactHTTPDownloadIsGoneAfterGC(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery(`(?s)SELECT\s+EXISTS.*verification_tombstones`).
		WithArgs("workspace-1", "evidence-1").
		WillReturnRows(sqlmock.NewRows([]string{"evidence_exists", "tombstoned"}).AddRow(true, true))
	service := &Service{
		repository:  NewRepository(database),
		permissions: allowVerificationPermissions{},
	}
	router := verificationTestRouter(NewHandler(service), true)
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/workspaces/workspace-1/verification/evidence/evidence-1/artifacts/artifact-1/content",
		nil,
	)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusGone {
		t.Fatalf("tombstoned download status = %d, want %d", recorder.Code, http.StatusGone)
	}
	if code := verificationErrorCode(t, recorder); code != "VER-6001" {
		t.Fatalf("tombstoned download diagnostic = %q, want VER-6001", code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestExpiredEvidenceHTTPErrorIsExplicitGone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	respondVerificationError(context, ErrExpired)
	if recorder.Code != http.StatusGone {
		t.Fatalf("expired status = %d, want %d", recorder.Code, http.StatusGone)
	}
	var response struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Error.Code != "VER-6001" {
		t.Fatalf("expired diagnostic = %q, want VER-6001", response.Error.Code)
	}
}

func TestStrictHTTPJSONRejectsUnpairedUnicodeSurrogatesAndAcceptsPairs(t *testing.T) {
	type requestBody struct {
		Value string `json:"value"`
	}

	for _, body := range []string{
		`{"value":"\ud800"}`,
		`{"value":"\udc00"}`,
		`{"value":"\ud83d\u0061"}`,
	} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(body))
		var target requestBody
		if decodeStrictJSON(context, 1024, &target) {
			t.Fatalf("HTTP strict decoder accepted %s", body)
		}
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("HTTP strict decoder status = %d, want %d", recorder.Code, http.StatusBadRequest)
		}
		if code := verificationErrorCode(t, recorder); code != "VER-5001" {
			t.Fatalf("HTTP strict decoder diagnostic = %q, want VER-5001", code)
		}
	}

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/",
		bytes.NewBufferString(`{"value":"\uD83D\uDE00"}`),
	)
	var target requestBody
	if !decodeStrictJSON(context, 1024, &target) {
		t.Fatalf("HTTP strict decoder rejected valid surrogate pair: %s", recorder.Body.String())
	}
	if target.Value != "😀" {
		t.Fatalf("decoded HTTP value = %q, want astral scalar", target.Value)
	}
}

func TestClosureResponseUsesOnlyCanonicalVerifiedEvidenceViewKey(t *testing.T) {
	response := verifiedEvidenceViewResponse(ClosureView{
		Format: "prodivix.verification-evidence-view.v1",
	})
	if len(response) != 1 {
		t.Fatalf("closure response fields = %d, want exactly 1", len(response))
	}
	if _, exists := response["verifiedEvidenceView"]; !exists {
		t.Fatal("closure response omitted canonical verifiedEvidenceView")
	}
	if _, exists := response["closureView"]; exists {
		t.Fatal("closure response retained removed closureView compatibility key")
	}
}

func verificationTestRouter(handler *Handler, authenticated bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	requireAuth := func(c *gin.Context) {
		if authenticated {
			c.Set("authUser", &backendauth.User{ID: "user-1"})
		}
		c.Next()
	}
	RegisterRoutes(router.Group("/api"), handler.Routes(requireAuth))
	return router
}

func verificationErrorCode(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()
	var response struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response.Error.Code
}
