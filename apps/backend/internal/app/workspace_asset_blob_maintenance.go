package app

import (
	"context"
	"log"
	"sync"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendworkspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
)

type workspaceAssetBlobSweepStore interface {
	SweepWorkspaceAssetBlobOrphans(
		ctx context.Context,
		policy backendworkspace.WorkspaceAssetBlobSweepPolicy,
	) (backendworkspace.WorkspaceAssetBlobSweepResult, error)
}

type WorkspaceAssetBlobMaintenance struct {
	store  workspaceAssetBlobSweepStore
	config backendconfig.WorkspaceAssetBlobRetentionConfig
	now    func() time.Time
	logf   func(format string, args ...any)

	mutex   sync.Mutex
	started bool
	cancel  context.CancelFunc
	done    chan struct{}
}

func NewWorkspaceAssetBlobMaintenance(
	store workspaceAssetBlobSweepStore,
	config backendconfig.WorkspaceAssetBlobRetentionConfig,
) *WorkspaceAssetBlobMaintenance {
	return &WorkspaceAssetBlobMaintenance{
		store:  store,
		config: config,
		now:    func() time.Time { return time.Now().UTC() },
		logf:   log.Printf,
	}
}

func (maintenance *WorkspaceAssetBlobMaintenance) Start(parent context.Context) {
	if maintenance == nil || maintenance.store == nil {
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

func (maintenance *WorkspaceAssetBlobMaintenance) Close() {
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
	maintenance.mutex.Unlock()

	cancel()
	<-done
}

func (maintenance *WorkspaceAssetBlobMaintenance) run(ctx context.Context, done chan struct{}) {
	defer close(done)
	maintenance.sweep(ctx)
	ticker := time.NewTicker(maintenance.config.SweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			maintenance.sweep(ctx)
		}
	}
}

func (maintenance *WorkspaceAssetBlobMaintenance) sweep(ctx context.Context) {
	result, err := maintenance.store.SweepWorkspaceAssetBlobOrphans(
		ctx,
		backendworkspace.WorkspaceAssetBlobSweepPolicy{
			ObservedAt:      maintenance.now().UTC(),
			OrphanRetention: maintenance.config.OrphanRetention,
			WorkspaceLimit:  maintenance.config.WorkspaceLimit,
			BlobLimit:       maintenance.config.BlobLimit,
		},
	)
	if err != nil {
		if ctx.Err() == nil {
			maintenance.logf("workspace asset blob retention sweep failed: %v", err)
		}
		return
	}
	if result.ProtectedBlobs == 0 && result.MarkedOrphans == 0 && result.DeletedBlobs == 0 {
		return
	}
	maintenance.logf(
		"workspace asset blob retention sweep: workspaces=%d protected=%d marked=%d deleted=%d deleted_bytes=%d",
		result.ObservedWorkspaces,
		result.ProtectedBlobs,
		result.MarkedOrphans,
		result.DeletedBlobs,
		result.DeletedBytes,
	)
}
