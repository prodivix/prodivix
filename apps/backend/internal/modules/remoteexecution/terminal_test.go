package remoteexecution

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
)

func terminalSessionFixture(now time.Time, token string) []byte {
	value := map[string]any{
		"protocol": "prodivix.remote-terminal",
		"version":  1,
		"snapshot": map[string]any{
			"terminalSessionId":            "terminal-1",
			"executionId":                  "execution-1",
			"jobId":                        "execution-1",
			"providerId":                   "prodivix.remote.preview",
			"providerVersion":              "1",
			"capability":                   "shell",
			"status":                       "open",
			"revision":                     1,
			"size":                         map[string]any{"columns": 80, "rows": 24},
			"openedAt":                     now.Add(-time.Second).UnixMilli(),
			"updatedAt":                    now.UnixMilli(),
			"leaseExpiresAt":               now.Add(5 * time.Minute).UnixMilli(),
			"latestOutputCursor":           0,
			"earliestRetainedOutputCursor": 0,
			"retainedOutputBytes":          0,
			"droppedOutputRecords":         0,
			"droppedOutputBytes":           0,
			"latestClientSequence":         0,
		},
		"access": map[string]any{
			"token":     token,
			"expiresAt": now.Add(time.Minute).UnixMilli(),
		},
	}
	body, _ := json.Marshal(value)
	return body
}

func terminalHandlerFixture(t *testing.T, controlPlane http.Handler) (*Handler, *fakeGrantStore, func()) {
	t.Helper()
	server := httptest.NewServer(controlPlane)
	store := &fakeGrantStore{
		workspaceOwner: map[string]string{},
		executionOwner: map[string]string{"execution-1": "user-1"},
	}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{
		BaseURL:     server.URL,
		ClientToken: "service-token",
		Timeout:     time.Second,
	}, backendconfig.RemotePreviewHostConfig{})
	return handler, store, server.Close
}

func TestTerminalGatewayIssuesShortSessionWithoutExposingServiceCredential(t *testing.T) {
	now := time.Now()
	var authorization string
	handler, _, closeServer := terminalHandlerFixture(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		authorization = request.Header.Get("Authorization")
		if request.URL.Path != "/v1/executions/execution-1/terminal-sessions" {
			t.Fatalf("unexpected Terminal path: %s", request.URL.Path)
		}
		response.Header().Set("Content-Type", "application/json")
		response.WriteHeader(http.StatusCreated)
		_, _ = response.Write(terminalSessionFixture(now, "terminal-access-token"))
	}))
	defer closeServer()
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/terminal-sessions", strings.NewReader(`{"size":{"columns":80,"rows":24}}`))
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusCreated || authorization != "Bearer service-token" {
		t.Fatalf("Terminal open failed: status=%d auth=%q body=%s", response.Code, authorization, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "terminal-access-token") || strings.Contains(response.Body.String(), "service-token") {
		t.Fatalf("Terminal credential boundary drifted: %s", response.Body.String())
	}
}

func TestTerminalGatewayForwardsOnlyShortTokenAndStrictActionShape(t *testing.T) {
	proxied := 0
	var authorization string
	handler, _, closeServer := terminalHandlerFixture(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		proxied++
		authorization = request.Header.Get("Authorization")
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `{"terminalSessionId":"terminal-1","executionId":"execution-1","jobId":"execution-1","status":"open","afterCursor":0,"nextCursor":0,"latestCursor":0,"earliestAvailableCursor":0,"gap":false,"hasMore":false,"records":[]}`)
	}))
	defer closeServer()
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/terminal-sessions/terminal-1/read", strings.NewReader(`{"afterCursor":0}`))
	request.Header.Set("X-Prodivix-Terminal-Token", "terminal-access-token")
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusOK || authorization != "Bearer terminal-access-token" || proxied != 1 {
		t.Fatalf("Terminal read boundary failed: status=%d auth=%q proxied=%d body=%s", response.Code, authorization, proxied, response.Body.String())
	}

	invalid := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/terminal-sessions/terminal-1/read", strings.NewReader(`{"afterCursor":0,"credential":"must-not-proxy"}`))
	invalid.Header.Set("X-Prodivix-Terminal-Token", "terminal-access-token")
	invalidResponse := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(invalidResponse, invalid)
	if invalidResponse.Code != http.StatusBadRequest || proxied != 1 || strings.Contains(invalidResponse.Body.String(), "must-not-proxy") {
		t.Fatalf("Terminal unknown field reached service: status=%d proxied=%d body=%s", invalidResponse.Code, proxied, invalidResponse.Body.String())
	}
}

func TestTerminalGatewayBlocksCredentialEchoAndInvalidSessionEnvelope(t *testing.T) {
	now := time.Now()
	responses := [][]byte{
		bytes.Replace(terminalSessionFixture(now, "terminal-access-token"), []byte(`"access":`), []byte(`"unknown":"terminal-access-token","access":`), 1),
		[]byte(`{"terminalSessionId":"terminal-1","executionId":"execution-1","jobId":"execution-1","status":"open","afterCursor":0,"nextCursor":1,"latestCursor":1,"earliestAvailableCursor":1,"gap":false,"hasMore":false,"records":[{"terminalSessionId":"terminal-1","executionId":"execution-1","jobId":"execution-1","cursor":1,"emittedAt":1,"stream":"stdout","data":"service-token","byteLength":13,"redacted":false,"truncated":false}]}`),
	}
	index := 0
	handler, _, closeServer := terminalHandlerFixture(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		if index == 0 {
			response.WriteHeader(http.StatusCreated)
		}
		_, _ = response.Write(responses[index])
		index++
	}))
	defer closeServer()

	open := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/terminal-sessions", strings.NewReader(`{"size":{"columns":80,"rows":24}}`))
	openResponse := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(openResponse, open)
	if openResponse.Code != http.StatusBadGateway || strings.Contains(openResponse.Body.String(), "terminal-access-token") {
		t.Fatalf("invalid Terminal session reached client: status=%d body=%s", openResponse.Code, openResponse.Body.String())
	}

	read := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/terminal-sessions/terminal-1/read", strings.NewReader(`{"afterCursor":0}`))
	read.Header.Set("X-Prodivix-Terminal-Token", "terminal-access-token")
	readResponse := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(readResponse, read)
	if readResponse.Code != http.StatusBadGateway || strings.Contains(readResponse.Body.String(), "service-token") {
		t.Fatalf("credential echo reached Terminal client: status=%d body=%s", readResponse.Code, readResponse.Body.String())
	}
}
