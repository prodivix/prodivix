package app

import (
	"context"
	"log"
	"sync"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

type environmentSecretKeyRotationStore interface {
	Available() bool
	RotateSecretMaterials(ctx context.Context, policy backendenvironment.SecretKeyRotationPolicy) (backendenvironment.SecretKeyRotationResult, error)
}

type EnvironmentSecretKeyRotationMaintenance struct {
	store  environmentSecretKeyRotationStore
	config backendconfig.EnvironmentSecretStoreConfig
	now    func() time.Time
	logf   func(format string, args ...any)

	mutex   sync.Mutex
	started bool
	cancel  context.CancelFunc
	done    chan struct{}
}

func NewEnvironmentSecretKeyRotationMaintenance(store environmentSecretKeyRotationStore, config backendconfig.EnvironmentSecretStoreConfig) *EnvironmentSecretKeyRotationMaintenance {
	return &EnvironmentSecretKeyRotationMaintenance{
		store:  store,
		config: config,
		now:    func() time.Time { return time.Now().UTC() },
		logf:   log.Printf,
	}
}

func (maintenance *EnvironmentSecretKeyRotationMaintenance) Start(parent context.Context) {
	if maintenance == nil || maintenance.store == nil || !maintenance.store.Available() || maintenance.config.RotationInterval <= 0 || maintenance.config.RotationBatchSize <= 0 {
		return
	}
	if parent == nil {
		parent = context.Background()
	}
	maintenance.mutex.Lock()
	if maintenance.started {
		maintenance.mutex.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parent)
	maintenance.started = true
	maintenance.cancel = cancel
	maintenance.done = make(chan struct{})
	done := maintenance.done
	maintenance.mutex.Unlock()
	go maintenance.run(ctx, done)
}

func (maintenance *EnvironmentSecretKeyRotationMaintenance) Close() {
	if maintenance == nil {
		return
	}
	maintenance.mutex.Lock()
	if !maintenance.started {
		maintenance.mutex.Unlock()
		return
	}
	cancel := maintenance.cancel
	done := maintenance.done
	maintenance.started = false
	maintenance.cancel = nil
	maintenance.done = nil
	maintenance.mutex.Unlock()
	cancel()
	<-done
}

func (maintenance *EnvironmentSecretKeyRotationMaintenance) run(ctx context.Context, done chan struct{}) {
	defer close(done)
	maintenance.rotate(ctx)
	ticker := time.NewTicker(maintenance.config.RotationInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			maintenance.rotate(ctx)
		}
	}
}

func (maintenance *EnvironmentSecretKeyRotationMaintenance) rotate(ctx context.Context) {
	result, err := maintenance.store.RotateSecretMaterials(ctx, backendenvironment.SecretKeyRotationPolicy{
		ObservedAt: maintenance.now().UTC(),
		BatchSize:  maintenance.config.RotationBatchSize,
	})
	if err != nil {
		if ctx.Err() == nil {
			maintenance.logf("environment Secret key rotation failed")
		}
		return
	}
	if result.RewrappedMaterials == 0 {
		return
	}
	maintenance.logf(
		"environment Secret key rotation: active_key=%s rewrapped=%d migrated_legacy=%d remaining=%d",
		result.ActiveKeyID,
		result.RewrappedMaterials,
		result.MigratedLegacy,
		result.RemainingMaterials,
	)
}
