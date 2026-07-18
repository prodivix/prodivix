package workspace

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func workspaceAssetRetentionPolicy() WorkspaceAssetBlobSweepPolicy {
	return WorkspaceAssetBlobSweepPolicy{
		ObservedAt:      time.Date(2026, time.July, 18, 12, 0, 0, 0, time.UTC),
		OrphanRetention: 7 * 24 * time.Hour,
		WorkspaceLimit:  8,
		BlobLimit:       64,
	}
}

func TestWorkspaceAssetBlobSweepIsBoundedAndAtomic(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	policy := workspaceAssetRetentionPolicy()
	cutoff := policy.ObservedAt.Add(-policy.OrphanRetention)

	mock.ExpectBegin()
	mock.ExpectQuery("WITH candidate_workspaces AS MATERIALIZED").
		WithArgs(cutoff, policy.WorkspaceLimit, policy.BlobLimit, policy.ObservedAt).
		WillReturnRows(sqlmock.NewRows([]string{
			"observed_workspaces", "protected_blobs", "marked_orphans", "deleted_blobs", "deleted_bytes",
		}).AddRow(3, 2, 1, 4, 8192))
	mock.ExpectCommit()

	result, err := NewWorkspaceStore(db).SweepWorkspaceAssetBlobOrphans(context.Background(), policy)
	if err != nil {
		t.Fatal(err)
	}
	if result.ObservedWorkspaces != 3 || result.ProtectedBlobs != 2 || result.MarkedOrphans != 1 ||
		result.DeletedBlobs != 4 || result.DeletedBytes != 8192 {
		t.Fatalf("unexpected sweep result: %#v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceAssetBlobSweepRollsBackOnFailure(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	policy := workspaceAssetRetentionPolicy()
	expected := errors.New("retention query failed")

	mock.ExpectBegin()
	mock.ExpectQuery("WITH candidate_workspaces AS MATERIALIZED").
		WithArgs(policy.ObservedAt.Add(-policy.OrphanRetention), policy.WorkspaceLimit, policy.BlobLimit, policy.ObservedAt).
		WillReturnError(expected)
	mock.ExpectRollback()

	if _, err := NewWorkspaceStore(db).SweepWorkspaceAssetBlobOrphans(context.Background(), policy); !errors.Is(err, expected) {
		t.Fatalf("expected atomic rollback error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceAssetBlobSweepRejectsUnsafePolicyBeforeDatabaseAccess(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	base := workspaceAssetRetentionPolicy()
	for _, mutate := range []func(*WorkspaceAssetBlobSweepPolicy){
		func(policy *WorkspaceAssetBlobSweepPolicy) { policy.ObservedAt = time.Time{} },
		func(policy *WorkspaceAssetBlobSweepPolicy) { policy.OrphanRetention = 0 },
		func(policy *WorkspaceAssetBlobSweepPolicy) { policy.WorkspaceLimit = 0 },
		func(policy *WorkspaceAssetBlobSweepPolicy) {
			policy.WorkspaceLimit = MaxWorkspaceAssetBlobSweepWorkspaces + 1
		},
		func(policy *WorkspaceAssetBlobSweepPolicy) { policy.BlobLimit = 0 },
		func(policy *WorkspaceAssetBlobSweepPolicy) { policy.BlobLimit = MaxWorkspaceAssetBlobSweepBlobs + 1 },
	} {
		policy := base
		mutate(&policy)
		if _, err := NewWorkspaceStore(db).SweepWorkspaceAssetBlobOrphans(context.Background(), policy); !errors.Is(err, ErrWorkspaceAssetBlobSweepInvalid) {
			t.Fatalf("expected invalid sweep policy, got %v", err)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func workspaceAssetRetentionDocument(id string, digest string) WorkspaceDocumentRecord {
	return WorkspaceDocumentRecord{
		ID:   id,
		Type: WorkspaceDocumentTypeAsset,
		Content: []byte(`{"kind":"asset","mime":"image/png","size":3,"blob":{"kind":"workspace-blob","digest":"` + digest +
			`","byteLength":3,"mediaType":"image/png"}}`),
	}
}

func TestWorkspaceAssetBlobReferenceReconciliationProtectsCurrentAndMarksRemoved(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	oldDigest := "sha256-" + strings.Repeat("a", 64)
	currentDigest := "sha256-" + strings.Repeat("b", 64)
	previous := map[string]WorkspaceDocumentRecord{
		"asset-old": workspaceAssetRetentionDocument("asset-old", oldDigest),
	}
	current := map[string]WorkspaceDocumentRecord{
		"asset-current": workspaceAssetRetentionDocument("asset-current", currentDigest),
	}
	observedAt := time.Date(2026, time.July, 18, 13, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE workspace_asset_blobs\nSET unreferenced_since = NULL")).
		WithArgs("workspace-1", `["`+currentDigest+`"]`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE workspace_asset_blobs\nSET unreferenced_since = $3")).
		WithArgs("workspace-1", `["`+oldDigest+`"]`, observedAt).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := reconcileWorkspaceAssetBlobReferenceRetention(
		context.Background(),
		tx,
		"workspace-1",
		previous,
		current,
		observedAt,
	); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceAssetBlobReferenceReconciliationPropagatesWriteFailure(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	digest := "sha256-" + strings.Repeat("c", 64)
	current := map[string]WorkspaceDocumentRecord{
		"asset-current": workspaceAssetRetentionDocument("asset-current", digest),
	}
	expected := errors.New("retention write failed")

	mock.ExpectBegin()
	mock.ExpectExec("UPDATE workspace_asset_blobs").WillReturnError(expected)
	mock.ExpectRollback()
	tx, err := db.BeginTx(context.Background(), &sql.TxOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if err := reconcileWorkspaceAssetBlobReferenceRetention(
		context.Background(), tx, "workspace-1", nil, current, time.Now(),
	); !errors.Is(err, expected) {
		t.Fatalf("expected retention write failure, got %v", err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
