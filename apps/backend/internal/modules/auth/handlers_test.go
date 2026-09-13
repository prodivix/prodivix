package auth

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	backendtext "github.com/Prodivix/prodivix/apps/backend/internal/platform/text"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

func TestProfileWritesBoundBodyAndDisplayText(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	handler := NewHandler(NewUserStore(db), NewSessionStore(db), time.Hour)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(contextAuthUserKey, &User{ID: "user-1"})
		c.Next()
	})
	router.PATCH("/users/me", handler.HandleUpdateMe)

	for _, testCase := range []struct {
		name string
		body string
	}{
		{name: "oversized body", body: `{"name":"` + strings.Repeat("a", maxAuthJSONBytes) + `"}`},
		{name: "unbounded display name", body: `{"name":"` + strings.Repeat("a", backendtext.MaxDisplayNameRunes+1) + `"}`},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPatch, "/users/me", bytes.NewBufferString(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected the profile write to be rejected, got %d", response.Code)
			}
		})
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected database access: %v", err)
	}
}

func TestHandleRegisterDistinguishesCreatedEmailConflictAndDatabaseFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const insert = `INSERT INTO users (id, email, name, description, avatar_url, password_hash, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)`
	for _, testCase := range []struct {
		name        string
		insertError error
		status      int
		code        string
	}{
		{name: "new email", status: http.StatusCreated},
		{name: "existing email", insertError: &pgconn.PgError{Code: "23505", ConstraintName: "users_email_key"}, status: http.StatusConflict, code: "API-4009"},
		{name: "unrelated unique conflict", insertError: &pgconn.PgError{Code: "23505", ConstraintName: "users_pkey"}, status: http.StatusInternalServerError, code: "API-5001"},
		{name: "database unavailable", insertError: sql.ErrConnDone, status: http.StatusInternalServerError, code: "API-5001"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			expectation := mock.ExpectExec(regexp.QuoteMeta(insert)).WithArgs(
				sqlmock.AnyArg(),
				"user@example.com",
				"User",
				"",
				"",
				sqlmock.AnyArg(),
				sqlmock.AnyArg(),
			)
			if testCase.insertError == nil {
				expectation.WillReturnResult(sqlmock.NewResult(1, 1))
			} else {
				expectation.WillReturnError(testCase.insertError)
			}

			handler := NewHandler(NewUserStore(db), NewSessionStore(db), time.Hour)
			router := gin.New()
			router.POST("/auth/register", handler.HandleRegister)
			request := httptest.NewRequest(
				http.MethodPost,
				"/auth/register",
				bytes.NewBufferString(`{"email":" User@EXAMPLE.com ","password":"password","name":"User"}`),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			router.ServeHTTP(response, request)

			if response.Code != testCase.status {
				t.Fatalf("unexpected status: %d: %s", response.Code, response.Body.String())
			}
			if testCase.code == "" {
				if response.Body.String() != `{"created":true}` {
					t.Fatalf("unexpected registration result: %s", response.Body.String())
				}
			} else {
				var result struct {
					Error struct {
						Code string `json:"code"`
					} `json:"error"`
				}
				if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || result.Error.Code != testCase.code {
					t.Fatalf("unexpected registration error: %s", response.Body.String())
				}
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestRegistrationAndRecoveryRejectInvalidEmailAddresses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, email := range []string{
		"@",
		"user@",
		"Name <user@example.test>",
		"user@example.test,other@example.test",
		"user@example.test\r\nBcc: other@example.test",
		strings.Repeat("a", 244) + "@example.test",
	} {
		handler := NewHandler(nil, nil, time.Hour)
		router := gin.New()
		router.POST("/register", handler.HandleRegister)
		router.POST("/forgot", handler.HandleForgotPassword)
		body, err := json.Marshal(map[string]string{"email": email, "password": "valid-password"})
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{"/register", "/forgot"} {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body)))
			if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"code":"API-4001"`) {
				t.Fatalf("%s accepted an invalid email: %d", path, response.Code)
			}
		}
	}
}

func TestRepeatedRegistrationPreservesExistingPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	hash, err := bcrypt.GenerateFromPassword([]byte("original-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectExec("INSERT INTO users").WillReturnError(&pgconn.PgError{Code: "23505", ConstraintName: "users_email_key"})
	userRow := func() *sqlmock.Rows {
		return sqlmock.NewRows([]string{"id", "email", "name", "description", "avatar_url", "password_hash", "created_at"}).
			AddRow("usr_existing", "user@example.com", "Original", "", "", hash, time.Now().UTC())
	}
	mock.ExpectQuery("SELECT id, email, name").WithArgs("user@example.com").WillReturnRows(userRow())
	mock.ExpectQuery("SELECT id, email, name").WithArgs("user@example.com").WillReturnRows(userRow())
	mock.ExpectExec("INSERT INTO sessions").WillReturnResult(sqlmock.NewResult(1, 1))
	handler := NewHandler(NewUserStore(db), NewSessionStore(db), time.Hour)
	router := gin.New()
	router.POST("/auth/register", handler.HandleRegister)
	router.POST("/auth/login", handler.HandleLogin)
	for _, attempt := range []struct {
		path, password string
		status         int
	}{
		{"/auth/register", "replacement-password", http.StatusConflict},
		{"/auth/login", "replacement-password", http.StatusUnauthorized},
		{"/auth/login", "original-password", http.StatusOK},
	} {
		body, err := json.Marshal(map[string]string{"email": "user@example.com", "password": attempt.password, "name": "Replacement"})
		if err != nil {
			t.Fatal(err)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, attempt.path, bytes.NewReader(body)))
		if response.Code != attempt.status {
			t.Fatalf("%s: expected %d, got %d", attempt.path, attempt.status, response.Code)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRegistrationRateLimitDoesNotConsumeLoginAllowance(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler := NewHandler(NewUserStore(db), NewSessionStore(db), time.Hour)
	now := time.Unix(1_700_000_000, 0)
	handler.registrations.now = func() time.Time { return now }
	router := gin.New()
	router.POST("/auth/register", handler.HandleRegister)
	router.POST("/auth/login", handler.HandleLogin)
	for attempt := 0; attempt < authLimitPerAccount; attempt++ {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"email":"user@example.com","password":"short"}`)))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("attempt %d: expected validation error, got %d", attempt, response.Code)
		}
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"email":"User@example.com","password":"new-password"}`)))
	if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") != "300" {
		t.Fatalf("expected registration rate limit with retry deadline, got %d", response.Code)
	}
	if !strings.Contains(response.Body.String(), `"code":"API-4290"`) {
		t.Fatal("missing rate-limit diagnostic")
	}
	mock.ExpectQuery("SELECT id, email, name").WithArgs("user@example.com").WillReturnError(sql.ErrNoRows)
	login := httptest.NewRecorder()
	router.ServeHTTP(login, httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"email":"user@example.com","password":"password"}`)))
	if login.Code != http.StatusUnauthorized {
		t.Fatalf("registration blocked login: %d", login.Code)
	}
	now = now.Add(authLimitWindow)
	reopened := httptest.NewRecorder()
	router.ServeHTTP(reopened, httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"email":"user@example.com","password":"short"}`)))
	if reopened.Code != http.StatusBadRequest {
		t.Fatalf("expired registration limit did not reopen: %d", reopened.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
