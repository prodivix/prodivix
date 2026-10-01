package auth

import (
	"bytes"
	"database/sql"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
)

func TestAvatarUploadAcceptsValidAVIFBytes(t *testing.T) {
	image, err := os.ReadFile("testdata/avatar.avif")
	if err != nil {
		t.Fatal(err)
	}
	t.Chdir(t.TempDir())
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("UPDATE users SET avatar_url").WithArgs(sqlmock.AnyArg(), "usr_avatar").WillReturnRows(
		sqlmock.NewRows([]string{"id", "email", "name", "description", "avatar_url", "password_hash", "created_at"}).AddRow("usr_avatar", "avatar@example.com", "Avatar", "", "avatar.avif", "", time.Now()))
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile(avatarFormField, "avatar.avif")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(image); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(NewUserStore(db), NewSessionStore(db), time.Hour)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set(contextAuthUserKey, &User{ID: "usr_avatar"}); c.Next() })
	router.PUT("/avatar", handler.HandleUpdateAvatar)
	request := httptest.NewRequest(http.MethodPut, "/avatar", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("AVIF upload returned %d: %s", response.Code, response.Body.String())
	}
	files, err := filepath.Glob("data/uploads/avatars/usr_avatar/*.avif")
	if err != nil || len(files) != 1 {
		t.Fatalf("AVIF file was not stored: %v %v", files, err)
	}
	stored, err := os.ReadFile(files[0])
	if err != nil || !bytes.Equal(stored, image) {
		t.Fatal("stored AVIF bytes changed")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLogoutReportsRevocationFailureAndAllowsRetry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectExec("DELETE FROM sessions").WithArgs(authTokenDigest("logout-token")).WillReturnError(sql.ErrConnDone)
	mock.ExpectExec("DELETE FROM sessions").WithArgs(authTokenDigest("logout-token")).WillReturnResult(sqlmock.NewResult(0, 1))
	router := gin.New()
	router.POST("/logout", NewHandler(NewUserStore(db), NewSessionStore(db), time.Hour).HandleLogout)
	for _, status := range []int{http.StatusInternalServerError, http.StatusNoContent} {
		request := httptest.NewRequest(http.MethodPost, "/logout", nil)
		request.Header.Set("Authorization", "Bearer logout-token")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != status {
			t.Fatalf("logout returned %d, want %d", response.Code, status)
		}
		if strings.Contains(response.Body.String(), "logout-token") {
			t.Fatal("response exposed session token")
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
