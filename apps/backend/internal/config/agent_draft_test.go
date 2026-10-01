package config

import (
	"encoding/json"
	"testing"
)

func TestAgentDraftConfigurationKeepsCredentialReferencesOnServer(t *testing.T) {
	value := AgentDraftProviderConfig{ID: "configured", DisplayName: "Configured", BaseURL: "https://provider.example.test/v1", Models: []string{"model"}, CredentialEnvironmentKey: "PRODIVIX_TEST_PROVIDER_KEY"}
	raw, _ := json.Marshal([]AgentDraftProviderConfig{value})
	t.Setenv("BACKEND_AGENT_DRAFT_PROVIDERS", string(raw))
	providers, err := loadAgentDraftProviders("production")
	if err != nil || len(providers) != 1 {
		t.Fatalf("configuration admission failed: %v", err)
	}
	for _, endpoint := range []string{"http://provider.example.test/v1", "https://user:secret@provider.example.test/v1", "https://provider.example.test/v1?key=secret", "https://provider.example.test/v1#fragment"} {
		invalid := value
		invalid.BaseURL = endpoint
		raw, _ := json.Marshal([]AgentDraftProviderConfig{invalid})
		t.Setenv("BACKEND_AGENT_DRAFT_PROVIDERS", string(raw))
		if _, err := loadAgentDraftProviders("production"); err == nil {
			t.Fatal("untrusted endpoint admitted")
		}
	}
	t.Setenv("BACKEND_AGENT_DRAFT_PROVIDERS", `[{"id":"provider","apiKey":"secret"}]`)
	if _, err := loadAgentDraftProviders("test"); err == nil {
		t.Fatal("credential value admitted into provider config")
	}
	t.Setenv("BACKEND_AGENT_DRAFT_PROVIDERS", "")
	providers, err = loadAgentDraftProviders("production")
	if err != nil || len(providers) != 0 {
		t.Fatal("unconfigured provider catalog must remain empty")
	}
}
