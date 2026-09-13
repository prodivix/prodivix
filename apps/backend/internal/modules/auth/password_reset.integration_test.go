package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	backendidentity "github.com/Prodivix/prodivix/apps/backend/internal/platform/identity"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
)

func openAuthTestDatabase(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("PRODIVIX_BACKEND_POSTGRES_TEST_URL")
	if dsn == "" {
		t.Skip("set PRODIVIX_BACKEND_POSTGRES_TEST_URL for the real PostgreSQL auth Gate")
	}
	settings, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid PostgreSQL test configuration")
	}
	admin := stdlib.OpenDB(*settings)
	suffix, err := backendidentity.NewRandomHex(8)
	if err != nil {
		t.Fatal(err)
	}
	schema := "auth_test_" + suffix
	quoted := pgx.Identifier{schema}.Sanitize()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+quoted); err != nil {
		_ = admin.Close()
		t.Fatal(err)
	}
	testSettings := settings.Copy()
	testSettings.RuntimeParams["search_path"] = schema
	db := stdlib.OpenDB(*testSettings)
	t.Cleanup(func() {
		_ = db.Close()
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()
		if _, err := admin.ExecContext(cleanupCtx, "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Error(err)
		}
		_ = admin.Close()
	})
	if err := backenddatabase.RunMigrations(ctx, db, 2*time.Minute); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestPasswordRecoveryPostgreSQLLifecycle(t *testing.T) {
	db := openAuthTestDatabase(t)
	gin.SetMode(gin.TestMode)
	users, sessions := NewUserStore(db), NewSessionStore(db)
	store := NewPasswordResetStore(db)
	mail := &resetMailerFixture{}
	handler := NewHandler(users, sessions, time.Hour)
	handler.SetPasswordResetService(NewPasswordResetService(store, mail, "https://app.example.test/auth/reset-password", 30*time.Minute))
	router := gin.New()
	RegisterRoutes(router.Group("/api"), handler.Routes(handler.RequireAuth()))
	request := func(path string, body any) *httptest.ResponseRecorder {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/auth/"+path, bytes.NewReader(data)))
		return response
	}
	assertStatus := func(response *httptest.ResponseRecorder, status int) {
		t.Helper()
		if response.Code != status {
			t.Fatalf("expected HTTP %d, got %d", status, response.Code)
		}
	}
	const email = "user@example.test"
	assertStatus(request("register", map[string]string{"email": email, "name": "Original", "password": "original-password"}), 201)
	assertStatus(request("register", map[string]string{"email": " USER@EXAMPLE.TEST ", "name": "Replacement", "password": "replacement-password"}), 409)
	userBeforeReset, found := users.GetByEmail(email)
	if !found || userBeforeReset.Name != "Original" {
		t.Fatal("duplicate registration changed the account")
	}
	assertStatus(request("login", map[string]string{"email": email, "password": "replacement-password"}), 401)
	login := request("login", map[string]string{"email": email, "password": "original-password"})
	assertStatus(login, 200)
	var session struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(login.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	if _, valid := sessions.Get(session.Token); !valid {
		t.Fatal("original session is not usable")
	}
	assertStatus(request("forgot-password", map[string]string{"email": "unknown@example.test"}), 202)
	if len(mail.links) != 0 {
		t.Fatal("unknown account received mail")
	}
	latestToken := func() string {
		t.Helper()
		if len(mail.links) == 0 {
			t.Fatal("password reset mail was not delivered")
		}
		link, err := url.Parse(mail.links[len(mail.links)-1])
		if err != nil || link.RawQuery != "" {
			t.Fatal("reset token was placed in the request URL")
		}
		fragment, _ := url.ParseQuery(link.Fragment)
		return fragment.Get("token")
	}
	assertStatus(request("forgot-password", map[string]string{"email": email}), 202)
	oldToken := latestToken()
	assertStatus(request("forgot-password", map[string]string{"email": email}), 202)
	token := latestToken()
	if token == oldToken {
		t.Fatal("reset token was reused")
	}
	var storedDigest string
	if err := db.QueryRow(`SELECT token_digest FROM auth_password_resets WHERE user_id = $1`, userBeforeReset.ID).Scan(&storedDigest); err != nil {
		t.Fatal(err)
	}
	if storedDigest == token || storedDigest != authTokenDigest(token) {
		t.Fatal("reset token was not stored as a digest")
	}
	assertStatus(request("reset-password", map[string]string{"token": oldToken, "password": "new-password"}), 400)
	assertStatus(request("reset-password", map[string]string{"token": token, "password": "short"}), 400)
	assertStatus(request("reset-password", map[string]string{"token": token, "password": strings.Repeat("x", 73)}), 400)
	assertStatus(request("reset-password", map[string]string{"token": token, "password": "new-password"}), 204)
	assertStatus(request("reset-password", map[string]string{"token": token, "password": "another-password"}), 400)
	if _, valid := sessions.Get(session.Token); valid {
		t.Fatal("old session survived password reset")
	}
	if _, err := sessions.Create(userBeforeReset, time.Hour); !errors.Is(err, ErrCredentialsChanged) {
		t.Fatal("login with a stale verified password created a session after reset")
	}
	assertStatus(request("login", map[string]string{"email": email, "password": "original-password"}), 401)
	assertStatus(request("login", map[string]string{"email": email, "password": "new-password"}), 200)
	userAfterReset, found := users.GetByEmail(email)
	if !found || userAfterReset.ID != userBeforeReset.ID || userAfterReset.Name != "Original" {
		t.Fatal("password reset changed account identity or profile")
	}

	assertStatus(request("forgot-password", map[string]string{"email": email}), 202)
	expiredToken := latestToken()
	if _, err := db.Exec(`UPDATE auth_password_resets SET created_at=NOW()-interval '1 hour', expires_at=NOW()-interval '1 second' WHERE user_id=$1`, userBeforeReset.ID); err != nil {
		t.Fatal(err)
	}
	assertStatus(request("reset-password", map[string]string{"token": expiredToken, "password": "expired-password"}), 400)

	t.Run("only one concurrent redemption commits", func(t *testing.T) {
		assertStatus(request("forgot-password", map[string]string{"email": email}), 202)
		digest := authTokenDigest(latestToken())
		hash, err := bcrypt.GenerateFromPassword([]byte("concurrent-password"), bcrypt.MinCost)
		if err != nil {
			t.Fatal(err)
		}
		results := make(chan error, 2)
		for i := 0; i < 2; i++ {
			go func() { results <- store.Complete(context.Background(), digest, hash) }()
		}
		first, second := <-results, <-results
		if !((first == nil && errors.Is(second, ErrInvalidResetToken)) || (second == nil && errors.Is(first, ErrInvalidResetToken))) {
			t.Fatal("concurrent reset token was not consumed exactly once")
		}
	})
}
