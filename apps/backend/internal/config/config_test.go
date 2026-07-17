package config

import "testing"

func TestLoadConfigRejectsMissingProductionDatabase(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("BACKEND_DB_URL", "")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected production database configuration to fail closed")
	}
}

func TestLoadConfigAllowsDevelopmentDatabaseFallback(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("BACKEND_DB_URL", "")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if config.DatabaseURL == "" {
		t.Fatal("expected development database fallback")
	}
}

func TestLoadConfigRejectsPartiallyConfiguredRemoteRunner(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("REMOTE_RUNNER_CONTROL_PLANE_URL", "https://runner.example.test")
	t.Setenv("REMOTE_RUNNER_CONTROL_PLANE_TOKEN", "")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected partial remote runner configuration to fail")
	}
}

func TestLoadConfigAllowsWebhookOnlyGitHubCapability(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("GITHUB_APP_WEBHOOK_SECRET", "webhook-secret")
	if _, err := LoadConfig(); err != nil {
		t.Fatalf("webhook verification must not require unused GitHub API credentials: %v", err)
	}
}

func TestLoadConfigRejectsPartialGitHubAPICapability(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("GITHUB_APP_ID", "123")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected partial GitHub API configuration to fail")
	}
}
