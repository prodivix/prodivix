package config

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address            string
	Environment        string
	TokenTTL           time.Duration
	AllowedOrigins     []string
	DatabaseURL        string
	DBMaxOpenConns     int
	DBMaxIdleConns     int
	DBMaxLifetime      time.Duration
	GitHub             GitHubAppConfig
	RemoteRunner       RemoteRunnerConfig
	RemotePreview      RemotePreviewHostConfig
	AssetDelivery      AssetDeliveryHostConfig
	AssetBlobRetention WorkspaceAssetBlobRetentionConfig
	EnvironmentSecrets EnvironmentSecretStoreConfig
}

type WorkspaceAssetBlobRetentionConfig struct {
	OrphanRetention time.Duration
	SweepInterval   time.Duration
	WorkspaceLimit  int
	BlobLimit       int
}

type EnvironmentSecretStoreConfig struct {
	MasterKey         string
	ActiveKeyID       string
	Keys              map[string]string
	RotationInterval  time.Duration
	RotationBatchSize int
}

var environmentSecretKeyIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$`)

func validEnvironmentSecretKey(encoded string) bool {
	for _, encoding := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		decoded, err := encoding.DecodeString(encoded)
		valid := err == nil && len(decoded) == 32
		for index := range decoded {
			decoded[index] = 0
		}
		if valid {
			return true
		}
	}
	return false
}

func parseEnvironmentSecretKeyRing(raw string) (map[string]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return map[string]string{}, nil
	}
	if len(raw) > 64*1024 {
		return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS exceeds its configuration budget")
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	opening, err := decoder.Token()
	if err != nil || opening != json.Delim('{') {
		return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS must be a JSON object with 1 to 16 keys")
	}
	keys := map[string]string{}
	for decoder.More() {
		rawKeyID, err := decoder.Token()
		keyID, ok := rawKeyID.(string)
		if err != nil || !ok {
			return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS must contain only string key material")
		}
		if _, duplicate := keys[keyID]; duplicate {
			return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS contains a duplicate key id")
		}
		var encoded string
		if err := decoder.Decode(&encoded); err != nil {
			return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS must contain only string key material")
		}
		if !environmentSecretKeyIDPattern.MatchString(keyID) || !validEnvironmentSecretKey(encoded) {
			return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS contains an invalid key id or key material")
		}
		keys[keyID] = encoded
		if len(keys) > 16 {
			return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS must be a JSON object with 1 to 16 keys")
		}
	}
	closing, err := decoder.Token()
	if err != nil || closing != json.Delim('}') || len(keys) == 0 {
		return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS must be a JSON object with 1 to 16 keys")
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return nil, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS must contain exactly one JSON object")
	}
	return keys, nil
}

type RemoteRunnerConfig struct {
	BaseURL                      string
	ClientToken                  string
	Timeout                      time.Duration
	ExecutionAuthorityTTL        time.Duration
	ServerFunctionAllowedOrigins []string
	SecretBrokerToken            string
}

type RemotePreviewHostConfig struct {
	BaseURL       string
	PublicBaseURL string
	Token         string
	Timeout       time.Duration
	TTL           time.Duration
}

type AssetDeliveryHostConfig struct {
	BaseURL       string
	PublicBaseURL string
	Token         string
	Timeout       time.Duration
	TTL           time.Duration
}

type GitHubAppConfig struct {
	AppID         string
	ClientID      string
	ClientSecret  string
	PrivateKey    string
	WebhookSecret string
	SetupURL      string
}

func LoadConfig() (Config, error) {
	address := getEnv("BACKEND_ADDR", ":8080")
	environment := strings.ToLower(getEnv("APP_ENV", "development"))
	tokenTTL := getEnvDuration("BACKEND_TOKEN_TTL", 24*time.Hour)
	allowed := parseCSV(getEnv("BACKEND_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174"))
	databaseURL := strings.TrimSpace(os.Getenv("BACKEND_DB_URL"))
	if databaseURL == "" {
		if environment != "development" && environment != "test" {
			return Config{}, errors.New("BACKEND_DB_URL is required outside development and test")
		}
		databaseURL = "postgres://postgres:postgres@localhost:5432/prodivix?sslmode=disable"
	}
	if environment == "production" && strings.Contains(strings.ToLower(databaseURL), "postgres:postgres@") {
		return Config{}, errors.New("BACKEND_DB_URL must not use the default postgres password in production")
	}
	dbMaxOpenConns := getEnvInt("BACKEND_DB_MAX_OPEN_CONNS", 10)
	dbMaxIdleConns := getEnvInt("BACKEND_DB_MAX_IDLE_CONNS", 5)
	dbMaxLifetime := getEnvDuration("BACKEND_DB_MAX_LIFETIME", 30*time.Minute)
	assetBlobOrphanRetention, err := getEnvPositiveDuration("BACKEND_ASSET_BLOB_ORPHAN_RETENTION", 7*24*time.Hour)
	if err != nil {
		return Config{}, err
	}
	assetBlobSweepInterval, err := getEnvPositiveDuration("BACKEND_ASSET_BLOB_SWEEP_INTERVAL", time.Hour)
	if err != nil {
		return Config{}, err
	}
	assetBlobSweepWorkspaceLimit, err := getEnvBoundedPositiveInt("BACKEND_ASSET_BLOB_SWEEP_WORKSPACE_LIMIT", 32, 1024)
	if err != nil {
		return Config{}, err
	}
	assetBlobSweepBlobLimit, err := getEnvBoundedPositiveInt("BACKEND_ASSET_BLOB_SWEEP_BLOB_LIMIT", 256, 4096)
	if err != nil {
		return Config{}, err
	}
	remoteExecutionAuthorityTTL, err := getEnvPositiveDuration("REMOTE_RUNNER_EXECUTION_AUTHORITY_TTL", 2*time.Minute)
	if err != nil {
		return Config{}, err
	}
	environmentSecretRotationInterval, err := getEnvPositiveDuration("BACKEND_ENVIRONMENT_SECRET_ROTATION_INTERVAL", 5*time.Minute)
	if err != nil {
		return Config{}, err
	}
	environmentSecretRotationBatchSize, err := getEnvBoundedPositiveInt("BACKEND_ENVIRONMENT_SECRET_ROTATION_BATCH_SIZE", 64, 256)
	if err != nil {
		return Config{}, err
	}
	environmentSecretMasterKey := strings.TrimSpace(getEnv("BACKEND_ENVIRONMENT_SECRET_KEY", ""))
	if environmentSecretMasterKey != "" && !validEnvironmentSecretKey(environmentSecretMasterKey) {
		return Config{}, errors.New("BACKEND_ENVIRONMENT_SECRET_KEY must be base64-encoded 256-bit material")
	}
	environmentSecretKeys, err := parseEnvironmentSecretKeyRing(os.Getenv("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS"))
	if err != nil {
		return Config{}, err
	}
	environmentSecretActiveKeyID := strings.TrimSpace(os.Getenv("BACKEND_ENVIRONMENT_SECRET_KMS_ACTIVE_KEY_ID"))
	if len(environmentSecretKeys) == 0 && environmentSecretMasterKey != "" {
		environmentSecretKeys["legacy-v1"] = environmentSecretMasterKey
		environmentSecretActiveKeyID = "legacy-v1"
	}
	if len(environmentSecretKeys) > 0 {
		if !environmentSecretKeyIDPattern.MatchString(environmentSecretActiveKeyID) {
			return Config{}, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_ACTIVE_KEY_ID is required and must be canonical")
		}
		if _, ok := environmentSecretKeys[environmentSecretActiveKeyID]; !ok {
			return Config{}, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_ACTIVE_KEY_ID is not present in BACKEND_ENVIRONMENT_SECRET_KMS_KEYS")
		}
	} else if environmentSecretActiveKeyID != "" {
		return Config{}, errors.New("BACKEND_ENVIRONMENT_SECRET_KMS_KEYS is required when an active key id is configured")
	}
	config := Config{
		Address:        address,
		Environment:    environment,
		TokenTTL:       tokenTTL,
		AllowedOrigins: allowed,
		DatabaseURL:    databaseURL,
		DBMaxOpenConns: dbMaxOpenConns,
		DBMaxIdleConns: dbMaxIdleConns,
		DBMaxLifetime:  dbMaxLifetime,
		GitHub: GitHubAppConfig{
			AppID:         getEnv("GITHUB_APP_ID", ""),
			ClientID:      getEnv("GITHUB_APP_CLIENT_ID", ""),
			ClientSecret:  getEnv("GITHUB_APP_CLIENT_SECRET", ""),
			PrivateKey:    getEnv("GITHUB_APP_PRIVATE_KEY", ""),
			WebhookSecret: getEnv("GITHUB_APP_WEBHOOK_SECRET", ""),
			SetupURL:      getEnv("GITHUB_APP_SETUP_URL", ""),
		},
		RemoteRunner: RemoteRunnerConfig{
			BaseURL:                      strings.TrimRight(getEnv("REMOTE_RUNNER_CONTROL_PLANE_URL", ""), "/"),
			ClientToken:                  getEnv("REMOTE_RUNNER_CONTROL_PLANE_TOKEN", ""),
			Timeout:                      getEnvDuration("REMOTE_RUNNER_GATEWAY_TIMEOUT", 30*time.Second),
			ExecutionAuthorityTTL:        remoteExecutionAuthorityTTL,
			ServerFunctionAllowedOrigins: append([]string(nil), allowed...),
			SecretBrokerToken:            getEnv("REMOTE_RUNNER_SECRET_BROKER_TOKEN", ""),
		},
		RemotePreview: RemotePreviewHostConfig{
			BaseURL:       strings.TrimRight(getEnv("REMOTE_PREVIEW_HOST_URL", ""), "/"),
			PublicBaseURL: strings.TrimRight(getEnv("REMOTE_PREVIEW_PUBLIC_BASE_URL", ""), "/"),
			Token:         getEnv("REMOTE_PREVIEW_HOST_TOKEN", ""),
			Timeout:       getEnvDuration("REMOTE_PREVIEW_HOST_TIMEOUT", 30*time.Second),
			TTL:           getEnvDuration("REMOTE_PREVIEW_SESSION_TTL", 10*time.Minute),
		},
		AssetDelivery: AssetDeliveryHostConfig{
			BaseURL:       strings.TrimRight(getEnv("ASSET_DELIVERY_HOST_URL", ""), "/"),
			PublicBaseURL: strings.TrimRight(getEnv("ASSET_DELIVERY_PUBLIC_BASE_URL", ""), "/"),
			Token:         getEnv("ASSET_DELIVERY_HOST_TOKEN", ""),
			Timeout:       getEnvDuration("ASSET_DELIVERY_HOST_TIMEOUT", 30*time.Second),
			TTL:           getEnvDuration("ASSET_DELIVERY_SESSION_TTL", 10*time.Minute),
		},
		AssetBlobRetention: WorkspaceAssetBlobRetentionConfig{
			OrphanRetention: assetBlobOrphanRetention,
			SweepInterval:   assetBlobSweepInterval,
			WorkspaceLimit:  assetBlobSweepWorkspaceLimit,
			BlobLimit:       assetBlobSweepBlobLimit,
		},
		EnvironmentSecrets: EnvironmentSecretStoreConfig{
			MasterKey:         environmentSecretMasterKey,
			ActiveKeyID:       environmentSecretActiveKeyID,
			Keys:              environmentSecretKeys,
			RotationInterval:  environmentSecretRotationInterval,
			RotationBatchSize: environmentSecretRotationBatchSize,
		},
	}
	if err := validateOptionalCapabilities(config); err != nil {
		return Config{}, err
	}
	return config, nil
}

func validateOptionalCapabilities(config Config) error {
	if config.AssetBlobRetention.OrphanRetention <= 0 {
		return errors.New("BACKEND_ASSET_BLOB_ORPHAN_RETENTION must be positive")
	}
	if config.AssetBlobRetention.SweepInterval <= 0 {
		return errors.New("BACKEND_ASSET_BLOB_SWEEP_INTERVAL must be positive")
	}
	if config.AssetBlobRetention.WorkspaceLimit <= 0 || config.AssetBlobRetention.WorkspaceLimit > 1024 {
		return errors.New("BACKEND_ASSET_BLOB_SWEEP_WORKSPACE_LIMIT must be between 1 and 1024")
	}
	if config.AssetBlobRetention.BlobLimit <= 0 || config.AssetBlobRetention.BlobLimit > 4096 {
		return errors.New("BACKEND_ASSET_BLOB_SWEEP_BLOB_LIMIT must be between 1 and 4096")
	}
	if config.RemoteRunner.BaseURL != "" && config.RemoteRunner.ClientToken == "" {
		return errors.New("REMOTE_RUNNER_CONTROL_PLANE_TOKEN is required when REMOTE_RUNNER_CONTROL_PLANE_URL is configured")
	}
	if config.RemoteRunner.ExecutionAuthorityTTL <= 0 || config.RemoteRunner.ExecutionAuthorityTTL > 5*time.Minute {
		return errors.New("REMOTE_RUNNER_EXECUTION_AUTHORITY_TTL must be positive and at most 5m")
	}
	if config.RemotePreview.BaseURL != "" && config.RemotePreview.Token == "" {
		return errors.New("REMOTE_PREVIEW_HOST_TOKEN is required when REMOTE_PREVIEW_HOST_URL is configured")
	}
	if config.AssetDelivery.BaseURL != "" && config.AssetDelivery.Token == "" {
		return errors.New("ASSET_DELIVERY_HOST_TOKEN is required when ASSET_DELIVERY_HOST_URL is configured")
	}
	if config.AssetDelivery.BaseURL != "" && config.AssetDelivery.PublicBaseURL == "" {
		return errors.New("ASSET_DELIVERY_PUBLIC_BASE_URL is required when ASSET_DELIVERY_HOST_URL is configured")
	}
	githubConfigured := config.GitHub.AppID != "" || config.GitHub.ClientID != "" || config.GitHub.ClientSecret != "" || config.GitHub.PrivateKey != ""
	if githubConfigured {
		required := []struct {
			name  string
			value string
		}{
			{name: "GITHUB_APP_ID", value: config.GitHub.AppID},
			{name: "GITHUB_APP_CLIENT_ID", value: config.GitHub.ClientID},
			{name: "GITHUB_APP_CLIENT_SECRET", value: config.GitHub.ClientSecret},
			{name: "GITHUB_APP_PRIVATE_KEY", value: config.GitHub.PrivateKey},
		}
		for _, entry := range required {
			if strings.TrimSpace(entry.value) == "" {
				return fmt.Errorf("%s is required when the GitHub App API capability is configured", entry.name)
			}
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	if parsed, err := time.ParseDuration(value); err == nil {
		return parsed
	}
	if seconds, err := strconv.Atoi(value); err == nil {
		return time.Duration(seconds) * time.Second
	}
	return fallback
}

func getEnvPositiveDuration(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		if seconds, secondsErr := strconv.Atoi(value); secondsErr == nil {
			parsed = time.Duration(seconds) * time.Second
		} else {
			return 0, fmt.Errorf("%s must be a duration or integer seconds", key)
		}
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("%s must be positive", key)
	}
	return parsed, nil
}

func parseCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func getEnvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func getEnvBoundedPositiveInt(key string, fallback int, maximum int) (int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 || parsed > maximum {
		return 0, fmt.Errorf("%s must be between 1 and %d", key, maximum)
	}
	return parsed, nil
}
