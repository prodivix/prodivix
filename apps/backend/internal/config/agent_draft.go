package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

// AgentDraftProviderConfig is deployment-only transport configuration; it holds references, never credential values.
type AgentDraftProviderConfig struct {
	ID                       string   `json:"id"`
	DisplayName              string   `json:"displayName"`
	BaseURL                  string   `json:"baseURL"`
	Models                   []string `json:"models"`
	CredentialEnvironmentKey string   `json:"credentialEnvironmentKey"`
}

func loadAgentDraftProviders(environment string) ([]AgentDraftProviderConfig, error) {
	raw := strings.TrimSpace(os.Getenv("BACKEND_AGENT_DRAFT_PROVIDERS"))
	if raw == "" {
		return nil, nil
	}
	if err := canonicaljson.ValidateRaw([]byte(raw), 32_768); err != nil {
		return nil, errors.New("BACKEND_AGENT_DRAFT_PROVIDERS must be bounded, unambiguous JSON")
	}
	var providers []AgentDraftProviderConfig
	decoder := json.NewDecoder(bytes.NewReader([]byte(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&providers); err != nil || len(providers) == 0 || len(providers) > 16 {
		return nil, errors.New("BACKEND_AGENT_DRAFT_PROVIDERS must contain 1 to 16 providers")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, errors.New("BACKEND_AGENT_DRAFT_PROVIDERS contains trailing data")
	}
	names := map[string]bool{}
	for _, provider := range providers {
		parsed, err := url.Parse(provider.BaseURL)
		local := environment == "development" || environment == "test"
		if err != nil || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Scheme != "https" && !(local && parsed.Scheme == "http" && isLoopbackHost(parsed.Hostname()))) {
			return nil, errors.New("Agent draft provider endpoint must be HTTPS; loopback HTTP is local-only")
		}
		if provider.ID == "" || len(provider.ID) > 256 || strings.TrimSpace(provider.ID) != provider.ID || names[provider.ID] || strings.TrimSpace(provider.DisplayName) == "" || len(provider.DisplayName) > 256 || len(provider.Models) == 0 || len(provider.Models) > 64 || !regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,127}$`).MatchString(provider.CredentialEnvironmentKey) {
			return nil, errors.New("Agent draft provider identity, models or credential reference is invalid")
		}
		names[provider.ID] = true
		models := map[string]bool{}
		for _, model := range provider.Models {
			if model == "" || len(model) > 256 || strings.TrimSpace(model) != model || models[model] {
				return nil, errors.New("Agent draft provider model identity is invalid")
			}
			models[model] = true
		}
	}
	return providers, nil
}
