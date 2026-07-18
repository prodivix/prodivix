package config

import (
	"testing"
	"time"
)

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

func TestLoadConfigUsesBoundedRemoteExecutionAuthorityTTL(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("REMOTE_RUNNER_EXECUTION_AUTHORITY_TTL", "")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if config.RemoteRunner.ExecutionAuthorityTTL != 2*time.Minute {
		t.Fatalf("unexpected execution authority TTL: %s", config.RemoteRunner.ExecutionAuthorityTTL)
	}

	for _, value := range []string{"0", "not-a-duration", "5m1s"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("APP_ENV", "test")
			t.Setenv("REMOTE_RUNNER_EXECUTION_AUTHORITY_TTL", value)
			if _, err := LoadConfig(); err == nil {
				t.Fatalf("expected execution authority TTL %q to fail closed", value)
			}
		})
	}
}

func TestLoadConfigCopiesServerFunctionMutationOriginsIntoRemoteGateway(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("BACKEND_ALLOWED_ORIGINS", "https://studio.example.test,http://localhost:5173")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if len(config.RemoteRunner.ServerFunctionAllowedOrigins) != 2 ||
		config.RemoteRunner.ServerFunctionAllowedOrigins[0] != "https://studio.example.test" ||
		config.RemoteRunner.ServerFunctionAllowedOrigins[1] != "http://localhost:5173" {
		t.Fatalf("unexpected Server Function mutation origins: %#v", config.RemoteRunner.ServerFunctionAllowedOrigins)
	}
	config.AllowedOrigins[0] = "https://mutated.example.test"
	if config.RemoteRunner.ServerFunctionAllowedOrigins[0] != "https://studio.example.test" {
		t.Fatal("Server Function mutation origins must not alias the mutable CORS slice")
	}
}

func TestLoadConfigRejectsPartiallyConfiguredAssetDeliveryHost(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("ASSET_DELIVERY_HOST_URL", "http://asset-delivery.internal")
	t.Setenv("ASSET_DELIVERY_HOST_TOKEN", "")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected partially configured Asset Delivery Host to fail")
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

func TestLoadConfigUsesBoundedWorkspaceAssetBlobRetentionDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("BACKEND_ASSET_BLOB_ORPHAN_RETENTION", "")
	t.Setenv("BACKEND_ASSET_BLOB_SWEEP_INTERVAL", "")
	t.Setenv("BACKEND_ASSET_BLOB_SWEEP_WORKSPACE_LIMIT", "")
	t.Setenv("BACKEND_ASSET_BLOB_SWEEP_BLOB_LIMIT", "")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if config.AssetBlobRetention.OrphanRetention != 7*24*time.Hour ||
		config.AssetBlobRetention.SweepInterval != time.Hour ||
		config.AssetBlobRetention.WorkspaceLimit != 32 ||
		config.AssetBlobRetention.BlobLimit != 256 {
		t.Fatalf("unexpected asset blob retention defaults: %#v", config.AssetBlobRetention)
	}
}

func TestLoadConfigRejectsUnsafeWorkspaceAssetBlobRetention(t *testing.T) {
	for _, test := range []struct {
		name  string
		key   string
		value string
	}{
		{name: "negative retention", key: "BACKEND_ASSET_BLOB_ORPHAN_RETENTION", value: "-1s"},
		{name: "malformed retention", key: "BACKEND_ASSET_BLOB_ORPHAN_RETENTION", value: "one-week"},
		{name: "negative interval", key: "BACKEND_ASSET_BLOB_SWEEP_INTERVAL", value: "-1s"},
		{name: "zero workspace batch", key: "BACKEND_ASSET_BLOB_SWEEP_WORKSPACE_LIMIT", value: "0"},
		{name: "workspace batch overflow", key: "BACKEND_ASSET_BLOB_SWEEP_WORKSPACE_LIMIT", value: "1025"},
		{name: "malformed blob batch", key: "BACKEND_ASSET_BLOB_SWEEP_BLOB_LIMIT", value: "many"},
		{name: "blob batch overflow", key: "BACKEND_ASSET_BLOB_SWEEP_BLOB_LIMIT", value: "4097"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("APP_ENV", "test")
			t.Setenv(test.key, test.value)
			if _, err := LoadConfig(); err == nil {
				t.Fatalf("expected %s to fail closed", test.key)
			}
		})
	}
}
