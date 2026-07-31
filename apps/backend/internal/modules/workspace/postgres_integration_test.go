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

const workspacePostgreSQLTestURL = "PRODIVIX_BACKEND_POSTGRES_TEST_URL"

// openWorkspacePostgreSQLTestDatabase gives every real-database Gate an
// isolated migrated schema and removes it after the test.
func openWorkspacePostgreSQLTestDatabase(t *testing.T) *sql.DB {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv(workspacePostgreSQLTestURL))
	if databaseURL == "" {
		t.Skipf("set %s to run the real PostgreSQL Workspace Gate", workspacePostgreSQLTestURL)
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
	schema := "prodivix_workspace_" + hex.EncodeToString(suffix[:])
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
	if err := backenddatabase.RunMigrations(ctx, testDatabase, 2*time.Minute); err != nil {
		t.Fatalf("migrate isolated PostgreSQL integration schema: %v", err)
	}
	return testDatabase
}
