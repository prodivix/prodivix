package auth

import (
	"bytes"
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

func TestHandleRegisterDoesNotRevealExistingEmail(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const insert = `INSERT INTO users (id, email, name, description, avatar_url, password_hash, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)`
	for _, testCase := range []struct {
		name        string
		insertError error
	}{
		{name: "new email"},
		{name: "existing email", insertError: &pgconn.PgError{Code: "23505"}},
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
				bytes.NewBufferString(`{"email":"user@example.com","password":"password","name":"User"}`),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			router.ServeHTTP(response, request)

			if response.Code != http.StatusAccepted {
				t.Fatalf("unexpected status: %d: %s", response.Code, response.Body.String())
			}
			if response.Body.String() != `{"accepted":true}` {
				t.Fatalf("unexpected response: %s", response.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
