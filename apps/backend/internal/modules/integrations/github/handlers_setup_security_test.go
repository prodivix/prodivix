package github

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	"github.com/gin-gonic/gin"
)

// Deliberately without ClientID/ClientSecret so NewHandler builds no real
// verifier; each test supplies its own authority.
func testGitHubConfig() backendconfig.GitHubAppConfig {
	return backendconfig.GitHubAppConfig{AppID: "1", SetupURL: "https://github.com/apps/test/installations/new"}
}

type stubUserIdentityVerifier struct {
	identity           GitHubUserIdentity
	accessibleID       int64
	exchangeShouldFail bool
	seenInstallationID int64
}

func (stub *stubUserIdentityVerifier) ExchangeUserAuthorization(_ context.Context, code string) (string, error) {
	if stub.exchangeShouldFail || code == "" {
		return "", ErrUserAuthorizationUnavailable
	}
	return "user-token", nil
}

func (stub *stubUserIdentityVerifier) ResolveUserIdentity(_ context.Context, _ string) (GitHubUserIdentity, error) {
	return stub.identity, nil
}

func (stub *stubUserIdentityVerifier) UserCanAccessInstallation(_ context.Context, _ string, installationID int64) (bool, error) {
	stub.seenInstallationID = installationID
	return installationID == stub.accessibleID, nil
}

func expectStateConsumption(mock sqlmock.Sqlmock, userID string) {
	tokenHash := installationSetupTokenHash("setup-state")
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT user_id
		FROM github_installation_setup_states
		WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
		FOR UPDATE`)).WithArgs(tokenHash).WillReturnRows(
		sqlmock.NewRows([]string{"user_id"}).AddRow(userID),
	)
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE github_installation_setup_states
		SET consumed_at = NOW()
		WHERE token_hash = $1`)).WithArgs(tokenHash).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
}

func completeSetup(handler *Handler, installationID string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(
		http.MethodGet,
		"/integrations/github/installations/setup/callback?state=setup-state&code=auth-code&installation_id="+installationID,
		nil,
	)
	handler.HandleCompleteSetup(c)
	return recorder
}

// The core of H-SEC-01: installation_id arrives from the client, so a grant may
// only follow GitHub confirming that this account reaches that installation.
func TestCompleteSetupRejectsAnInstallationTheGitHubAccountCannotAccess(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	expectStateConsumption(mock, "usr_attacker")
	verifier := &stubUserIdentityVerifier{
		identity:     GitHubUserIdentity{ID: 777, Login: "attacker"},
		accessibleID: 11,
	}
	handler := NewHandler(NewStore(db), nil, testGitHubConfig(), "test").WithUserIdentityVerifier(verifier)

	recorder := completeSetup(handler, "999")

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected the claim to be refused: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if verifier.seenInstallationID != 999 {
		t.Fatalf("expected GitHub to be asked about the requested installation: got %d", verifier.seenInstallationID)
	}
	// The state was still consumed, and no access row was written.
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCompleteSetupRejectsACallbackWithoutUserAuthorization(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	expectStateConsumption(mock, "usr_1")
	verifier := &stubUserIdentityVerifier{
		identity:           GitHubUserIdentity{ID: 1, Login: "owner"},
		accessibleID:       42,
		exchangeShouldFail: true,
	}
	handler := NewHandler(NewStore(db), nil, testGitHubConfig(), "test").WithUserIdentityVerifier(verifier)

	recorder := completeSetup(handler, "42")

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected an unauthorized callback to fail closed: status=%d", recorder.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCompleteSetupGrantsAccessOnlyAfterGitHubConfirmsIt(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	expectStateConsumption(mock, "usr_1")
	mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO github_user_identities (
		user_id, github_user_id, github_login, created_at, updated_at
	) VALUES ($1, $2, $3, NOW(), NOW())
	ON CONFLICT (user_id) DO UPDATE
	SET github_user_id = EXCLUDED.github_user_id,
	    github_login = EXCLUDED.github_login,
	    updated_at = NOW()
	WHERE github_user_identities.github_user_id = EXCLUDED.github_user_id
	RETURNING user_id`)).WithArgs("usr_1", int64(555), "owner").WillReturnRows(
		sqlmock.NewRows([]string{"user_id"}).AddRow("usr_1"),
	)
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO github_installation_user_access (
		user_id, installation_id, status, created_at, updated_at
	)
	SELECT $1, installation_id, 'active', NOW(), NOW()
	FROM github_installations
	WHERE installation_id = $2 AND status = 'active'
	ON CONFLICT (user_id, installation_id) DO UPDATE
	SET status = 'active', updated_at = NOW()`)).WithArgs("usr_1", int64(42)).WillReturnResult(sqlmock.NewResult(0, 1))
	verifier := &stubUserIdentityVerifier{
		identity:     GitHubUserIdentity{ID: 555, Login: "owner"},
		accessibleID: 42,
	}
	handler := NewHandler(NewStore(db), nil, testGitHubConfig(), "test").WithUserIdentityVerifier(verifier)

	recorder := completeSetup(handler, "42")

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected the confirmed installation to connect: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Connected bool `json:"connected"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil || !body.Connected {
		t.Fatalf("expected a connected response: body=%s err=%v", recorder.Body.String(), err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// Without a configured verifier there is no authority to answer the ownership
// question, so the callback must not fall back to trusting installation_id.
func TestCompleteSetupFailsClosedWithoutAVerifier(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	expectStateConsumption(mock, "usr_1")
	handler := NewHandler(NewStore(db), nil, testGitHubConfig(), "test")

	recorder := completeSetup(handler, "42")

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected an unconfigured verifier to fail closed: status=%d", recorder.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
