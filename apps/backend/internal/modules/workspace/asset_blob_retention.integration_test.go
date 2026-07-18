package workspace

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"os"
	"strings"
	"testing"
	"time"

	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

const workspaceAssetRetentionPostgreSQLTestURL = "PRODIVIX_BACKEND_POSTGRES_TEST_URL"

func openWorkspaceAssetRetentionPostgreSQL(t *testing.T) *sql.DB {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv(workspaceAssetRetentionPostgreSQLTestURL))
	if databaseURL == "" {
		t.Skipf("set %s to run the real PostgreSQL asset retention Gate", workspaceAssetRetentionPostgreSQLTestURL)
	}
	adminConfig, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse PostgreSQL integration URL: %v", err)
	}
	admin := stdlib.OpenDB(*adminConfig)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		_ = admin.Close()
		t.Fatalf("connect to PostgreSQL integration database: %v", err)
	}

	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatalf("create PostgreSQL test schema suffix: %v", err)
	}
	schema := "prodivix_asset_retention_" + hex.EncodeToString(suffix[:])
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	var testDatabase *sql.DB
	t.Cleanup(func() {
		if testDatabase != nil {
			if err := testDatabase.Close(); err != nil {
				t.Errorf("close PostgreSQL integration database: %v", err)
			}
		}
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()
		if _, err := admin.ExecContext(cleanupCtx, "DROP SCHEMA IF EXISTS "+quotedSchema+" CASCADE"); err != nil {
			t.Errorf("drop PostgreSQL integration schema: %v", err)
		}
		if err := admin.Close(); err != nil {
			t.Errorf("close PostgreSQL integration admin database: %v", err)
		}
	})
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		t.Fatalf("create PostgreSQL integration schema: %v", err)
	}

	testConfig := adminConfig.Copy()
	if testConfig.RuntimeParams == nil {
		testConfig.RuntimeParams = make(map[string]string)
	}
	testConfig.RuntimeParams["search_path"] = schema
	testDatabase = stdlib.OpenDB(*testConfig)
	testDatabase.SetMaxOpenConns(16)
	testDatabase.SetMaxIdleConns(16)
	if err := testDatabase.PingContext(ctx); err != nil {
		t.Fatalf("connect to isolated PostgreSQL integration schema: %v", err)
	}
	if err := backenddatabase.RunMigrations(ctx, testDatabase); err != nil {
		t.Fatalf("migrate isolated PostgreSQL integration schema: %v", err)
	}
	return testDatabase
}

func seedWorkspaceAssetRetentionWorkspace(t *testing.T, database *sql.DB, suffix string, now time.Time) string {
	t.Helper()
	ownerID := "asset-retention-owner-" + suffix
	projectID := "asset-retention-project-" + suffix
	workspaceID := "asset-retention-workspace-" + suffix
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)`,
		ownerID,
		ownerID+"@example.test",
		"Asset Retention Gate",
		[]byte("integration-only"),
		now,
	); err != nil {
		t.Fatalf("seed asset retention owner: %v", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at) VALUES ($1, $2, 'project', $3, $4, $4)`,
		projectID,
		ownerID,
		"Asset Retention Gate",
		now,
	); err != nil {
		t.Fatalf("seed asset retention project: %v", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO workspaces (id, project_id, owner_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`,
		workspaceID,
		projectID,
		ownerID,
		"Asset Retention Gate",
		now,
	); err != nil {
		t.Fatalf("seed asset retention workspace: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit asset retention workspace: %v", err)
	}
	return workspaceID
}

func insertWorkspaceAssetRetentionBlob(
	t *testing.T,
	database *sql.DB,
	workspaceID string,
	contents []byte,
	createdAt time.Time,
	unreferencedSince *time.Time,
) string {
	t.Helper()
	digest := computeWorkspaceAssetDigest(contents)
	if _, err := database.Exec(
		`INSERT INTO workspace_asset_blobs (
	workspace_id, digest, media_type, byte_length, contents, created_at, unreferenced_since
) VALUES ($1, $2, 'image/png', $3, $4, $5, $6)`,
		workspaceID,
		digest,
		len(contents),
		contents,
		createdAt,
		unreferencedSince,
	); err != nil {
		t.Fatalf("insert asset retention blob: %v", err)
	}
	return digest
}

func insertWorkspaceAssetRetentionDocument(
	t *testing.T,
	tx interface {
		ExecContext(context.Context, string, ...any) (sql.Result, error)
	},
	workspaceID string,
	documentID string,
	digest string,
	updatedAt time.Time,
) WorkspaceDocumentRecord {
	t.Helper()
	document := workspaceAssetRetentionDocument(documentID, digest)
	if _, err := tx.ExecContext(
		context.Background(),
		`INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
) VALUES ($1, $2, 'asset', $3, $4, 1, 1, $5::jsonb, '[]'::jsonb, $6)`,
		workspaceID,
		documentID,
		documentID,
		"assets/"+documentID+".json",
		string(document.Content),
		updatedAt,
	); err != nil {
		t.Fatalf("insert asset retention document: %v", err)
	}
	return document
}

func workspaceAssetRetentionBlobMarker(t *testing.T, database *sql.DB, workspaceID string, digest string) (bool, sql.NullTime) {
	t.Helper()
	var marker sql.NullTime
	err := database.QueryRow(
		`SELECT unreferenced_since FROM workspace_asset_blobs WHERE workspace_id = $1 AND digest = $2`,
		workspaceID,
		digest,
	).Scan(&marker)
	if err == sql.ErrNoRows {
		return false, sql.NullTime{}
	}
	if err != nil {
		t.Fatalf("read asset retention blob marker: %v", err)
	}
	return true, marker
}

func TestWorkspaceAssetBlobRetentionPostgreSQLGate(t *testing.T) {
	database := openWorkspaceAssetRetentionPostgreSQL(t)
	store := NewWorkspaceStore(database)
	now := time.Date(2026, time.July, 18, 16, 0, 0, 0, time.UTC)
	retention := 7 * 24 * time.Hour
	cutoff := now.Add(-retention)
	old := cutoff.Add(-time.Hour)
	young := cutoff.Add(time.Hour)
	workspaceA := seedWorkspaceAssetRetentionWorkspace(t, database, "a", now)
	workspaceB := seedWorkspaceAssetRetentionWorkspace(t, database, "b", now)
	workspaceC := seedWorkspaceAssetRetentionWorkspace(t, database, "c", now)

	referencedDigest := insertWorkspaceAssetRetentionBlob(t, database, workspaceA, []byte{1}, old, &old)
	insertWorkspaceAssetRetentionDocument(t, database, workspaceA, "asset-referenced", referencedDigest, old)
	orphanDigest := insertWorkspaceAssetRetentionBlob(t, database, workspaceA, []byte{2}, old, &old)
	cutoffDigest := insertWorkspaceAssetRetentionBlob(t, database, workspaceA, []byte{3}, cutoff, &cutoff)
	observedDigest := insertWorkspaceAssetRetentionBlob(t, database, workspaceA, []byte{4}, old, nil)
	youngDigest := insertWorkspaceAssetRetentionBlob(t, database, workspaceA, []byte{5}, young, &young)
	sharedContents := []byte{6}
	crossTenantOrphanDigest := insertWorkspaceAssetRetentionBlob(t, database, workspaceA, sharedContents, old, &old)
	crossTenantReferencedDigest := insertWorkspaceAssetRetentionBlob(t, database, workspaceB, sharedContents, old, &old)
	insertWorkspaceAssetRetentionDocument(t, database, workspaceB, "asset-shared", crossTenantReferencedDigest, old)

	result, err := store.SweepWorkspaceAssetBlobOrphans(context.Background(), WorkspaceAssetBlobSweepPolicy{
		ObservedAt:      now,
		OrphanRetention: retention,
		WorkspaceLimit:  16,
		BlobLimit:       64,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.ObservedWorkspaces != 2 || result.ProtectedBlobs != 2 || result.MarkedOrphans != 1 || result.DeletedBlobs != 2 {
		t.Fatalf("unexpected PostgreSQL mark/sweep result: %#v", result)
	}
	if exists, marker := workspaceAssetRetentionBlobMarker(t, database, workspaceA, referencedDigest); !exists || marker.Valid {
		t.Fatalf("referenced blob must be protected with a NULL orphan marker: exists=%v marker=%v", exists, marker)
	}
	if exists, _ := workspaceAssetRetentionBlobMarker(t, database, workspaceA, orphanDigest); exists {
		t.Fatal("expired unreferenced blob must be deleted")
	}
	if exists, _ := workspaceAssetRetentionBlobMarker(t, database, workspaceA, crossTenantOrphanDigest); exists {
		t.Fatal("another Workspace reference must not protect a tenant-local orphan")
	}
	if exists, marker := workspaceAssetRetentionBlobMarker(t, database, workspaceB, crossTenantReferencedDigest); !exists || marker.Valid {
		t.Fatalf("same-digest referenced tenant blob must remain protected: exists=%v marker=%v", exists, marker)
	}
	if exists, marker := workspaceAssetRetentionBlobMarker(t, database, workspaceA, observedDigest); !exists || !marker.Valid || !marker.Time.Equal(now) {
		t.Fatalf("newly observed orphan must start a fresh retention window: exists=%v marker=%v", exists, marker)
	}
	if exists, marker := workspaceAssetRetentionBlobMarker(t, database, workspaceA, cutoffDigest); !exists || !marker.Valid || !marker.Time.Equal(cutoff) {
		t.Fatalf("exact cutoff must not be deleted: exists=%v marker=%v", exists, marker)
	}
	if exists, marker := workspaceAssetRetentionBlobMarker(t, database, workspaceA, youngDigest); !exists || !marker.Valid || !marker.Time.Equal(young) {
		t.Fatalf("young orphan must remain untouched: exists=%v marker=%v", exists, marker)
	}

	t.Run("durable dereference starts a full grace window", func(t *testing.T) {
		dereferencedAt := now.Add(time.Hour)
		tx, err := database.BeginTx(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = tx.Rollback() }()
		if _, err := tx.Exec(`SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE`, workspaceA); err != nil {
			t.Fatal(err)
		}
		previous := map[string]WorkspaceDocumentRecord{
			"asset-referenced": workspaceAssetRetentionDocument("asset-referenced", referencedDigest),
		}
		if err := reconcileWorkspaceAssetBlobReferenceRetention(
			context.Background(), tx, workspaceA, previous, nil, dereferencedAt,
		); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(`DELETE FROM workspace_documents WHERE workspace_id = $1 AND id = $2`, workspaceA, "asset-referenced"); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		if exists, marker := workspaceAssetRetentionBlobMarker(t, database, workspaceA, referencedDigest); !exists || !marker.Valid || !marker.Time.Equal(dereferencedAt) {
			t.Fatalf("dereference must mark, not delete, the blob: exists=%v marker=%v", exists, marker)
		}

		atBoundary, err := store.SweepWorkspaceAssetBlobOrphans(context.Background(), WorkspaceAssetBlobSweepPolicy{
			ObservedAt: dereferencedAt.Add(retention), OrphanRetention: retention, WorkspaceLimit: 16, BlobLimit: 64,
		})
		if err != nil {
			t.Fatal(err)
		}
		_ = atBoundary
		if exists, _ := workspaceAssetRetentionBlobMarker(t, database, workspaceA, referencedDigest); !exists {
			t.Fatal("exact retention boundary must keep the dereferenced blob")
		}
		afterBoundary, err := store.SweepWorkspaceAssetBlobOrphans(context.Background(), WorkspaceAssetBlobSweepPolicy{
			ObservedAt: dereferencedAt.Add(retention).Add(time.Microsecond), OrphanRetention: retention, WorkspaceLimit: 16, BlobLimit: 64,
		})
		if err != nil {
			t.Fatal(err)
		}
		if afterBoundary.DeletedBlobs != 1 {
			t.Fatalf("expired dereferenced blob must be swept: %#v", afterBoundary)
		}
	})

	t.Run("authoring workspace lock fences the sweep", func(t *testing.T) {
		lockedOld := now.Add(-2 * retention)
		lockedDigest := insertWorkspaceAssetRetentionBlob(t, database, workspaceC, []byte{7}, lockedOld, &lockedOld)
		tx, err := database.BeginTx(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = tx.Rollback() }()
		if _, err := tx.Exec(`SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE`, workspaceC); err != nil {
			t.Fatal(err)
		}
		whileLocked, err := store.SweepWorkspaceAssetBlobOrphans(context.Background(), WorkspaceAssetBlobSweepPolicy{
			ObservedAt: now, OrphanRetention: retention, WorkspaceLimit: 16, BlobLimit: 64,
		})
		if err != nil {
			t.Fatal(err)
		}
		if whileLocked.DeletedBlobs != 0 {
			t.Fatalf("locked authoring Workspace must be skipped: %#v", whileLocked)
		}
		if exists, _ := workspaceAssetRetentionBlobMarker(t, database, workspaceC, lockedDigest); !exists {
			t.Fatal("sweep must not delete from a locked authoring Workspace")
		}
		current := map[string]WorkspaceDocumentRecord{
			"asset-locked": workspaceAssetRetentionDocument("asset-locked", lockedDigest),
		}
		if err := reconcileWorkspaceAssetBlobReferenceRetention(
			context.Background(), tx, workspaceC, nil, current, now,
		); err != nil {
			t.Fatal(err)
		}
		insertWorkspaceAssetRetentionDocument(t, tx, workspaceC, "asset-locked", lockedDigest, now)
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		if _, err := store.SweepWorkspaceAssetBlobOrphans(context.Background(), WorkspaceAssetBlobSweepPolicy{
			ObservedAt: now.Add(retention), OrphanRetention: retention, WorkspaceLimit: 16, BlobLimit: 64,
		}); err != nil {
			t.Fatal(err)
		}
		if exists, marker := workspaceAssetRetentionBlobMarker(t, database, workspaceC, lockedDigest); !exists || marker.Valid {
			t.Fatalf("committed reference must remain protected: exists=%v marker=%v", exists, marker)
		}
	})
}
