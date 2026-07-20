package database

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

const pirWireMigrationPostgreSQLTestURL = "PRODIVIX_BACKEND_POSTGRES_TEST_URL"

func openPIRWireMigrationPostgreSQL(t *testing.T) *sql.DB {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv(pirWireMigrationPostgreSQLTestURL))
	if databaseURL == "" {
		t.Skipf("set %s to run the real PostgreSQL PIR wire migration Gate", pirWireMigrationPostgreSQLTestURL)
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
		t.Fatal(err)
	}
	schema := "prodivix_pir_wire_migration_" + hex.EncodeToString(suffix[:])
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	var testDatabase *sql.DB
	t.Cleanup(func() {
		if testDatabase != nil {
			_ = testDatabase.Close()
		}
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()
		_, _ = admin.ExecContext(cleanupCtx, "DROP SCHEMA IF EXISTS "+quotedSchema+" CASCADE")
		_ = admin.Close()
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
	if err := testDatabase.PingContext(ctx); err != nil {
		t.Fatalf("connect to isolated PostgreSQL integration schema: %v", err)
	}
	if err := RunMigrations(ctx, testDatabase); err != nil {
		t.Fatalf("migrate isolated PostgreSQL integration schema: %v", err)
	}
	return testDatabase
}

func TestPIRWireMigrationPostgreSQLGate(t *testing.T) {
	database := openPIRWireMigrationPostgreSQL(t)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	now := time.Now().UTC().Truncate(time.Microsecond)
	legacy := `{"version":"1.4","ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","kind":"element","type":"container"}},"childIdsById":{"root":[]}}}}`
	unsupported := `{"version":"1.2","ui":{}}`
	current := `{"version":"1.6","ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","kind":"element","type":"container"}},"childIdsById":{"root":[]}}}}`

	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)`, []any{"pir-migration-owner", "pir-migration@example.test", "PIR Migration", []byte("integration-only"), now}},
		{`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at) VALUES ($1,$2,'project',$3,$4,$4)`, []any{"pir-migration-project", "pir-migration-owner", "PIR Migration", now}},
		{`INSERT INTO workspaces (id, project_id, owner_id, name, op_seq, created_at, updated_at) VALUES ($1,$2,$3,$4,17,$5,$5)`, []any{"pir-migration-workspace", "pir-migration-project", "pir-migration-owner", "PIR Migration", now}},
		{`ALTER TABLE workspace_documents DROP CONSTRAINT workspace_documents_pir_wire_v1_6_check`, nil},
		{`INSERT INTO workspace_documents (workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES ($1,$2,'pir-page',$3,$4,7,2,$5::jsonb,'[]'::jsonb,$6)`, []any{"pir-migration-workspace", "legacy", "Legacy", "/legacy.pir.json", legacy, now}},
		{`INSERT INTO workspace_documents (workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES ($1,$2,'pir-component',$3,$4,9,3,$5::jsonb,'[]'::jsonb,$6)`, []any{"pir-migration-workspace", "unsupported", "Unsupported", "/unsupported.pir.json", unsupported, now}},
		{`DELETE FROM schema_migrations WHERE version = 12`, nil},
	}
	for _, statement := range statements {
		if _, err := database.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}

	if err := RunMigrations(ctx, database); err == nil {
		t.Fatal("unsupported PIR wire must roll back the complete coordinated migration")
	}
	var legacyVersion string
	if err := database.QueryRowContext(ctx, `SELECT content_json->>'version' FROM workspace_documents WHERE workspace_id=$1 AND id=$2`, "pir-migration-workspace", "legacy").Scan(&legacyVersion); err != nil {
		t.Fatal(err)
	}
	if legacyVersion != "1.4" {
		t.Fatalf("failed rollout must preserve legacy content, got %s", legacyVersion)
	}
	var migrationRecorded bool
	if err := database.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=12)`).Scan(&migrationRecorded); err != nil {
		t.Fatal(err)
	}
	if migrationRecorded {
		t.Fatal("failed rollout must not record migration completion")
	}

	if _, err := database.ExecContext(ctx, `UPDATE workspace_documents SET content_json=$1::jsonb WHERE workspace_id=$2 AND id=$3`, current, "pir-migration-workspace", "unsupported"); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(ctx, database); err != nil {
		t.Fatalf("complete coordinated migration: %v", err)
	}
	var legacyRevision, unsupportedRevision, opSeq int64
	if err := database.QueryRowContext(ctx, `SELECT content_json->>'version', content_rev FROM workspace_documents WHERE workspace_id=$1 AND id=$2`, "pir-migration-workspace", "legacy").Scan(&legacyVersion, &legacyRevision); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `SELECT content_rev FROM workspace_documents WHERE workspace_id=$1 AND id=$2`, "pir-migration-workspace", "unsupported").Scan(&unsupportedRevision); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `SELECT op_seq FROM workspaces WHERE id=$1`, "pir-migration-workspace").Scan(&opSeq); err != nil {
		t.Fatal(err)
	}
	if legacyVersion != "1.6" || legacyRevision != 7 || unsupportedRevision != 9 || opSeq != 17 {
		t.Fatalf("wire-only rollout changed authoring revisions: version=%s legacyRev=%d unsupportedRev=%d opSeq=%d", legacyVersion, legacyRevision, unsupportedRevision, opSeq)
	}
	if _, err := database.ExecContext(
		ctx,
		`INSERT INTO workspace_documents (workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES ($1,$2,'pir-layout',$3,$4,1,1,$5::jsonb,'[]'::jsonb,$6)`,
		"pir-migration-workspace",
		"late-legacy",
		"Late Legacy",
		"/late-legacy.pir.json",
		legacy,
		now,
	); err == nil {
		t.Fatal("persisted v1.6 constraint must reject legacy writes after rollout")
	}
}
