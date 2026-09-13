package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
)

type resetMailerFixture struct {
	recipients, links []string
	err               error
}

func (fixture *resetMailerFixture) Send(_ context.Context, recipient, link string) error {
	fixture.recipients = append(fixture.recipients, recipient)
	fixture.links = append(fixture.links, link)
	return fixture.err
}

func TestForgotPasswordReturnsAcceptedForKnownAndUnknownEmails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, known := range []bool{false, true} {
		db, mock, err := sqlmock.New()
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		query := mock.ExpectQuery("INSERT INTO auth_password_resets").WithArgs("user@example.test", sqlmock.AnyArg(), 1800.0)
		if known {
			query.WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow("usr_1"))
		} else {
			query.WillReturnError(sql.ErrNoRows)
		}
		mail := &resetMailerFixture{}
		handler := NewHandler(NewUserStore(db), NewSessionStore(db), time.Hour)
		handler.SetPasswordResetService(NewPasswordResetService(NewPasswordResetStore(db), mail, "https://app.example.test/auth/reset-password", 30*time.Minute))
		router := gin.New()
		router.POST("/auth/forgot-password", handler.HandleForgotPassword)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/auth/forgot-password", strings.NewReader(`{"email":" User@EXAMPLE.test "}`)))
		if response.Code != http.StatusAccepted || response.Body.String() != `{"accepted":true}` {
			t.Fatalf("unexpected reset request status %d", response.Code)
		}
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("recovery response can be cached")
		}
		if known && (len(mail.links) != 1 || !strings.HasPrefix(mail.links[0], "https://app.example.test/auth/reset-password#token=")) {
			t.Fatal("reset link was not delivered through the configured mail channel")
		}
		if !known && len(mail.links) != 0 {
			t.Fatal("unknown account received a reset email")
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	}
}

func TestFailedEmailDeliveryRevokesItsToken(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	digest := &captureStringArgument{}
	mock.ExpectQuery("INSERT INTO auth_password_resets").WithArgs("user@example.test", digest, 1800.0).WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow("usr_1"))
	mock.ExpectExec("DELETE FROM auth_password_resets").WithArgs(digest).WillReturnResult(sqlmock.NewResult(0, 1))
	service := NewPasswordResetService(NewPasswordResetStore(db), &resetMailerFixture{err: errors.New("mail unavailable")}, "https://app.example.test/auth/reset-password", 30*time.Minute)
	if err := service.request(context.Background(), "user@example.test"); err == nil {
		t.Fatal("mail failure was hidden")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordResetRollsBackIfSessionRevocationFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectBegin()
	mock.ExpectQuery("DELETE FROM auth_password_resets").WithArgs("digest").WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow("usr_1"))
	mock.ExpectExec("UPDATE users SET password_hash").WithArgs([]byte("new-hash"), "usr_1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM sessions").WithArgs("usr_1").WillReturnError(sql.ErrConnDone)
	mock.ExpectRollback()
	if err := NewPasswordResetStore(db).Complete(context.Background(), "digest", []byte("new-hash")); err == nil {
		t.Fatal("partial password reset was accepted")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestResetRejectsMalformedTokensAndUnavailableDelivery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(nil, nil, time.Hour)
	router := gin.New()
	router.POST("/reset", handler.HandleResetPassword)
	router.POST("/forgot", handler.HandleForgotPassword)
	for _, attempt := range []struct {
		path, body string
		status     int
	}{
		{"/reset", `{"token":"invalid","password":"new-password"}`, 400},
		{"/reset", `{"token":"` + strings.Repeat("A", 64) + `","password":"new-password"}`, 400},
		{"/forgot", `{"email":"user@example.test"}`, 503},
		{"/forgot", `{"email":"user@example.test\r\nBcc: other@example.test"}`, 400},
	} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, attempt.path, strings.NewReader(attempt.body)))
		if response.Code != attempt.status {
			t.Fatalf("%s: expected %d, got %d", attempt.path, attempt.status, response.Code)
		}
	}
}

func TestRecoveryLimitsRequestAndRedemptionIndependently(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(nil, nil, time.Hour)
	router := gin.New()
	router.POST("/reset", handler.HandleResetPassword)
	router.POST("/forgot", handler.HandleForgotPassword)
	for _, attempt := range []struct {
		path, body string
		status     int
	}{
		{"/forgot", `{"email":"user@example.test"}`, 503},
		{"/reset", `{"token":"` + strings.Repeat("a", 64) + `","password":"short"}`, 400},
	} {
		for index := 0; index <= authLimitPerAccount; index++ {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, attempt.path, strings.NewReader(attempt.body)))
			if index < authLimitPerAccount {
				if response.Code != attempt.status {
					t.Fatalf("%s request %d: expected %d, got %d", attempt.path, index, attempt.status, response.Code)
				}
			} else if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") == "" {
				t.Fatalf("%s did not enforce its own retry window", attempt.path)
			}
		}
	}
}
