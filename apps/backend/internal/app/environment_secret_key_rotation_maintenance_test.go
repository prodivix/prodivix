package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

type fakeEnvironmentSecretKeyRotationStore struct {
	available bool
	result    backendenvironment.SecretKeyRotationResult
	err       error
	policies  []backendenvironment.SecretKeyRotationPolicy
}

func (store *fakeEnvironmentSecretKeyRotationStore) Available() bool {
	return store.available
}

func (store *fakeEnvironmentSecretKeyRotationStore) RotateSecretMaterials(_ context.Context, policy backendenvironment.SecretKeyRotationPolicy) (backendenvironment.SecretKeyRotationResult, error) {
	store.policies = append(store.policies, policy)
	return store.result, store.err
}

func TestEnvironmentSecretKeyRotationMaintenanceLogsOnlyAggregateMetadata(t *testing.T) {
	store := &fakeEnvironmentSecretKeyRotationStore{available: true, result: backendenvironment.SecretKeyRotationResult{
		ActiveKeyID: "key-2026-07", RewrappedMaterials: 4, MigratedLegacy: 1, RemainingMaterials: 2,
	}}
	maintenance := NewEnvironmentSecretKeyRotationMaintenance(store, backendconfig.EnvironmentSecretStoreConfig{RotationInterval: time.Minute, RotationBatchSize: 8})
	observedAt := time.Unix(2_000, 0).UTC()
	maintenance.now = func() time.Time { return observedAt }
	var logLine string
	maintenance.logf = func(format string, args ...any) { logLine = fmt.Sprintf(format, args...) }
	maintenance.rotate(t.Context())
	if len(store.policies) != 1 || store.policies[0].ObservedAt != observedAt || store.policies[0].BatchSize != 8 {
		t.Fatalf("unexpected rotation policy: %#v", store.policies)
	}
	if logLine != "environment Secret key rotation: active_key=key-2026-07 rewrapped=4 migrated_legacy=1 remaining=2" {
		t.Fatalf("unexpected aggregate rotation log: %q", logLine)
	}
}

func TestEnvironmentSecretKeyRotationMaintenanceDoesNotLogProviderErrors(t *testing.T) {
	canary := "provider-secret-canary"
	store := &fakeEnvironmentSecretKeyRotationStore{available: true, err: errors.New(canary)}
	maintenance := NewEnvironmentSecretKeyRotationMaintenance(store, backendconfig.EnvironmentSecretStoreConfig{RotationInterval: time.Minute, RotationBatchSize: 8})
	var logLine string
	maintenance.logf = func(format string, args ...any) { logLine = fmt.Sprintf(format, args...) }
	maintenance.rotate(t.Context())
	if strings.Contains(logLine, canary) || logLine != "environment Secret key rotation failed" {
		t.Fatalf("rotation error leaked provider material: %q", logLine)
	}
}
