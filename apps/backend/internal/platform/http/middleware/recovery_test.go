package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRecoveryNeverLogsCredentialHeaders(t *testing.T) {
	gin.SetMode(gin.DebugMode)
	t.Cleanup(func() { gin.SetMode(gin.TestMode) })

	var logged bytes.Buffer
	router := gin.New()
	router.Use(Recovery(&logged))
	router.POST("/api/remote-executions/:executionId/terminal-sessions/:terminalSessionId/read", func(*gin.Context) {
		var missing map[string]string
		missing["boom"] = "panic on a nil map write"
	})

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/remote-executions/execution-1/terminal-sessions/terminal-1/read",
		strings.NewReader("{}"),
	)
	request.Header.Set("Authorization", "Bearer session-token-authorization")
	request.Header.Set("X-Auth-Token", "session-token-x-auth")
	request.Header.Set("X-Prodivix-Terminal-Token", "terminal-token-secret")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected recovered panic to answer 500, got %d", response.Code)
	}
	record := logged.String()
	if record == "" {
		t.Fatal("expected the recovered panic to be logged")
	}
	for _, secret := range []string{
		"session-token-authorization",
		"session-token-x-auth",
		"terminal-token-secret",
	} {
		if strings.Contains(record, secret) {
			t.Fatalf("recovery log leaked a credential header value: %q", record)
		}
	}
	if !strings.Contains(record, "/api/remote-executions/:executionId/terminal-sessions/:terminalSessionId/read") {
		t.Fatalf("expected the matched route template in the recovery log, got %q", record)
	}
}
