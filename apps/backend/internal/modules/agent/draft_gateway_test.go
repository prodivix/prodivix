package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	"github.com/gin-gonic/gin"
)

const draftGatewayFixture = `{"providerId":"configured","modelId":"model","draft":{"id":"draft.test","intent":"Plan a hero","context":{"entries":[{"id":"document","title":"Document","authority":"user-provided","instructionBoundary":"data-only","value":{"title":"Hero"}}]},"allowedTools":[],"responseMode":"json","streaming":false,"budget":{"maxOutputTokens":4096,"timeoutMs":1000}}}`

func serveDraft(gateway *DraftGateway, source string, authenticated bool) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/agent/drafts", strings.NewReader(source))
	c.Request.Header.Set("Content-Type", "application/json")
	if authenticated {
		c.Set("authUser", &backendauth.User{ID: "user.test"})
	}
	gateway.Generate(c)
	return response
}

func TestDraftGatewayUsesCallbackBoundServerCredentialAndReturnsOnlyValidatedPlan(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("PRODIVIX_DRAFT_TEST_KEY", "fixture-server-secret")
	var called atomic.Int64
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called.Add(1)
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer fixture-server-secret" {
			t.Error("server authority was not bound to configured transport")
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Error("invalid provider body")
		}
		if body["stream"] != false || body["model"] != "model" || body["tools"] != nil {
			t.Error("unexpected draft capabilities")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": `{"goal":"Plan a hero","assumptions":[],"milestones":[{"id":"inspect","title":"Inspect layout"}]}`}}}})
	}))
	defer provider.Close()
	gateway := NewDraftGateway([]backendconfig.AgentDraftProviderConfig{{ID: "configured", DisplayName: "Configured", BaseURL: provider.URL + "/v1", Models: []string{"model"}, CredentialEnvironmentKey: "PRODIVIX_DRAFT_TEST_KEY"}})
	response := serveDraft(gateway, draftGatewayFixture, true)
	if response.Code != http.StatusOK || called.Load() != 1 || strings.Contains(response.Body.String(), "fixture-server-secret") || !strings.Contains(response.Body.String(), `"status":"planned"`) {
		t.Fatalf("status=%d calls=%d", response.Code, called.Load())
	}
	catalog := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(catalog)
	c.Set("authUser", &backendauth.User{ID: "user.test"})
	gateway.Catalog(c)
	for _, forbidden := range []string{"credentialEnvironmentKey", "baseURL", "fixture-server-secret", "PRODIVIX_DRAFT_TEST_KEY"} {
		if strings.Contains(catalog.Body.String(), forbidden) {
			t.Fatal("catalog leaked private transport authority")
		}
	}
	if catalog.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("catalog must not be cached")
	}
}

func TestDraftGatewayRejectsUnauthorizedAndExpandedAuthorityBeforeProviderEffect(t *testing.T) {
	var called atomic.Int64
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer provider.Close()
	t.Setenv("PRODIVIX_DRAFT_TEST_KEY", "fixture-server-secret")
	gateway := NewDraftGateway([]backendconfig.AgentDraftProviderConfig{{ID: "configured", BaseURL: provider.URL, Models: []string{"model"}, CredentialEnvironmentKey: "PRODIVIX_DRAFT_TEST_KEY"}})
	if serveDraft(gateway, draftGatewayFixture, false).Code != http.StatusUnauthorized {
		t.Fatal("unauthenticated draft admitted")
	}
	for _, source := range []string{
		strings.Replace(draftGatewayFixture, `"allowedTools":[]`, `"allowedTools":["write"]`, 1),
		strings.Replace(draftGatewayFixture, `"streaming":false`, `"streaming":true`, 1),
		strings.Replace(draftGatewayFixture, `"id":"draft.test"`, `"id":"draft.test","apiKey":"browser-secret"`, 1),
		strings.Replace(draftGatewayFixture, `"instructionBoundary":"data-only"`, `"instructionBoundary":"system"`, 1),
		strings.Replace(draftGatewayFixture, `"modelId":"model"`, `"modelId":"model","modelId":"other"`, 1),
		strings.Replace(draftGatewayFixture, `"timeoutMs":1000`, `"timeoutMs":300001`, 1),
	} {
		if response := serveDraft(gateway, source, true); response.Code != http.StatusBadRequest {
			t.Fatalf("invalid draft status=%d", response.Code)
		}
	}
	if called.Load() != 0 {
		t.Fatal("invalid draft reached provider")
	}
	if serveDraft(NewDraftGateway(nil), draftGatewayFixture, true).Code != http.StatusServiceUnavailable {
		t.Fatal("unconfigured draft must report unavailable")
	}
}

func TestDraftGatewayBoundsTimeAndRejectsProviderSecretOrMutationOutput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("PRODIVIX_DRAFT_TEST_KEY", "fixture-server-secret")
	for _, output := range []string{
		`{"goal":"fixture-server-secret","assumptions":[],"milestones":[]}`,
		`{"goal":"Plan","assumptions":[],"milestones":[],"actions":[{"kind":"write"}]}`,
		`{"goal":"Plan","assumptions":[],"milestones":[{"id":"step","title":"Step","description":null}]}`,
	} {
		provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": output}}}})
		}))
		gateway := NewDraftGateway([]backendconfig.AgentDraftProviderConfig{{ID: "configured", BaseURL: provider.URL, Models: []string{"model"}, CredentialEnvironmentKey: "PRODIVIX_DRAFT_TEST_KEY"}})
		response := serveDraft(gateway, draftGatewayFixture, true)
		provider.Close()
		if response.Code != http.StatusBadGateway || strings.Contains(response.Body.String(), output) || strings.Contains(response.Body.String(), "fixture-server-secret") {
			t.Fatal("untrusted provider response crossed plan-only boundary")
		}
	}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(time.Second):
		}
		w.WriteHeader(http.StatusGatewayTimeout)
	}))
	defer provider.Close()
	gateway := NewDraftGateway([]backendconfig.AgentDraftProviderConfig{{ID: "configured", BaseURL: provider.URL, Models: []string{"model"}, CredentialEnvironmentKey: "PRODIVIX_DRAFT_TEST_KEY"}})
	start := time.Now()
	response := serveDraft(gateway, strings.Replace(draftGatewayFixture, `"timeoutMs":1000`, `"timeoutMs":25`, 1), true)
	if response.Code != http.StatusBadGateway || time.Since(start) > 500*time.Millisecond {
		t.Fatal("absolute draft deadline did not stop transport")
	}
}
