package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendworkspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
)

type workspaceAssetBlobSweepCall struct {
	policy backendworkspace.WorkspaceAssetBlobSweepPolicy
}

type fakeWorkspaceAssetBlobSweepStore struct {
	calls  chan workspaceAssetBlobSweepCall
	result backendworkspace.WorkspaceAssetBlobSweepResult
	err    error
}

func (store *fakeWorkspaceAssetBlobSweepStore) SweepWorkspaceAssetBlobOrphans(
	_ context.Context,
	policy backendworkspace.WorkspaceAssetBlobSweepPolicy,
) (backendworkspace.WorkspaceAssetBlobSweepResult, error) {
	store.calls <- workspaceAssetBlobSweepCall{policy: policy}
	return store.result, store.err
}

func workspaceAssetBlobMaintenanceConfig() backendconfig.WorkspaceAssetBlobRetentionConfig {
	return backendconfig.WorkspaceAssetBlobRetentionConfig{
		OrphanRetention: 7 * 24 * time.Hour,
		SweepInterval:   time.Hour,
		WorkspaceLimit:  12,
		BlobLimit:       96,
	}
}

func TestWorkspaceAssetBlobMaintenanceRunsImmediatelyAndStops(t *testing.T) {
	store := &fakeWorkspaceAssetBlobSweepStore{calls: make(chan workspaceAssetBlobSweepCall, 2)}
	fixedNow := time.Date(2026, time.July, 18, 14, 0, 0, 0, time.UTC)
	maintenance := NewWorkspaceAssetBlobMaintenance(store, workspaceAssetBlobMaintenanceConfig())
	maintenance.now = func() time.Time { return fixedNow }
	maintenance.logf = func(string, ...any) {}

	maintenance.Start(context.Background())
	maintenance.Start(context.Background())
	select {
	case call := <-store.calls:
		if call.policy.ObservedAt != fixedNow ||
			call.policy.OrphanRetention != 7*24*time.Hour ||
			call.policy.WorkspaceLimit != 12 ||
			call.policy.BlobLimit != 96 {
			t.Fatalf("unexpected maintenance policy: %#v", call.policy)
		}
	case <-time.After(time.Second):
		t.Fatal("expected immediate asset blob maintenance cycle")
	}
	maintenance.Close()
	maintenance.Close()
	select {
	case <-store.calls:
		t.Fatal("duplicate Start must not create a second maintenance loop")
	default:
	}
}

func TestWorkspaceAssetBlobMaintenanceLogsOnlyAggregateOutcome(t *testing.T) {
	store := &fakeWorkspaceAssetBlobSweepStore{
		calls: make(chan workspaceAssetBlobSweepCall, 1),
		result: backendworkspace.WorkspaceAssetBlobSweepResult{
			ObservedWorkspaces: 2,
			ProtectedBlobs:     1,
			MarkedOrphans:      3,
			DeletedBlobs:       4,
			DeletedBytes:       1024,
		},
	}
	maintenance := NewWorkspaceAssetBlobMaintenance(store, workspaceAssetBlobMaintenanceConfig())
	maintenance.now = func() time.Time { return time.Date(2026, time.July, 18, 15, 0, 0, 0, time.UTC) }
	var logged string
	maintenance.logf = func(format string, args ...any) { logged = fmt.Sprintf(format, args...) }

	maintenance.sweep(context.Background())
	if !strings.Contains(logged, "workspaces=2 protected=1 marked=3 deleted=4 deleted_bytes=1024") {
		t.Fatalf("expected aggregate retention log, got %q", logged)
	}
}

func TestWorkspaceAssetBlobMaintenanceReportsCycleFailure(t *testing.T) {
	store := &fakeWorkspaceAssetBlobSweepStore{
		calls: make(chan workspaceAssetBlobSweepCall, 1),
		err:   errors.New("database unavailable"),
	}
	maintenance := NewWorkspaceAssetBlobMaintenance(store, workspaceAssetBlobMaintenanceConfig())
	maintenance.now = time.Now
	var logged string
	maintenance.logf = func(format string, args ...any) { logged = fmt.Sprintf(format, args...) }

	maintenance.sweep(context.Background())
	if !strings.Contains(logged, "retention sweep failed") || strings.Contains(logged, "workspace-") {
		t.Fatalf("expected metadata-only maintenance failure log, got %q", logged)
	}
}
