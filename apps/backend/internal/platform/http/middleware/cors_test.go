package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSAllowsRemoteCapabilityHeadersPreflight(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(CORS([]string{"https://studio.example.com"}))
	router.POST("/api/remote-executions/:executionId/terminal-sessions/:terminalSessionId/read", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	request := httptest.NewRequest(
		http.MethodOptions,
		"/api/remote-executions/execution-1/terminal-sessions/terminal-1/read",
		nil,
	)
	request.Header.Set("Origin", "https://studio.example.com")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	request.Header.Set(
		"Access-Control-Request-Headers",
		"authorization,content-type,x-prodivix-terminal-token,x-prodivix-server-function-intent",
	)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected preflight 204, got %d", response.Code)
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "https://studio.example.com" {
		t.Fatalf("expected exact allowed origin, got %q", response.Header().Get("Access-Control-Allow-Origin"))
	}
	if !strings.Contains(strings.ToLower(response.Header().Get("Access-Control-Allow-Headers")), "x-prodivix-terminal-token") {
		t.Fatalf("terminal token header missing from CORS allowlist: %q", response.Header().Get("Access-Control-Allow-Headers"))
	}
	if !strings.Contains(strings.ToLower(response.Header().Get("Access-Control-Allow-Headers")), "x-prodivix-server-function-intent") {
		t.Fatalf("Server Function mutation intent header missing from CORS allowlist: %q", response.Header().Get("Access-Control-Allow-Headers"))
	}
}
