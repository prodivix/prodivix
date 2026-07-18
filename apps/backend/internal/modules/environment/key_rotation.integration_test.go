package environment

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

const environmentKeyRotationPostgreSQLTestURL = "PRODIVIX_BACKEND_POSTGRES_TEST_URL"

func openEnvironmentKeyRotationPostgreSQL(t *testing.T) *sql.DB {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv(environmentKeyRotationPostgreSQLTestURL))
	if databaseURL == "" {
		t.Skipf("set %s to run the real PostgreSQL environment Secret key rotation Gate", environmentKeyRotationPostgreSQLTestURL)
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
	schema := "prodivix_environment_rotation_" + hex.EncodeToString(suffix[:])
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

func seedEnvironmentKeyRotationWorkspace(t *testing.T, database *sql.DB, now time.Time) {
	t.Helper()
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)`, []any{"rotation-owner", "rotation-owner@example.test", "Rotation Owner", []byte("integration-only"), now}},
		{`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at) VALUES ($1,$2,'project',$3,$4,$4)`, []any{"rotation-project", "rotation-owner", "Rotation Project", now}},
		{`INSERT INTO workspaces (id, project_id, owner_id, name, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`, []any{"rotation-workspace", "rotation-project", "rotation-owner", "Rotation Workspace", now}},
		{`INSERT INTO sessions (token, id, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4,$5)`, []any{"rotation-session-token", "rotation-session", "rotation-owner", now, now.Add(time.Hour)}},
	}
	for _, statement := range statements {
		if _, err := database.Exec(statement.query, statement.args...); err != nil {
			t.Fatalf("seed environment key rotation workspace: %v", err)
		}
	}
}

func TestEnvironmentSecretKeyRotationPostgreSQLGate(t *testing.T) {
	database := openEnvironmentKeyRotationPostgreSQL(t)
	now := time.Now().UTC()
	seedEnvironmentKeyRotationWorkspace(t, database, now)
	oldKey := encodedKey(0x11)
	newKey := encodedKey(0x77)
	oldStore := NewStoreWithKeyRing(database, "", "key-old", map[string]string{"key-old": oldKey})
	secrets := map[string]string{}
	for index := 0; index < 8; index++ {
		secrets[fmt.Sprintf("binding-%d", index)] = fmt.Sprintf("rotation-secret-canary-%d", index)
	}
	snapshot, err := oldStore.PutSnapshot(t.Context(), PutSnapshotInput{
		Principal:   PrincipalSession{PrincipalID: "rotation-owner", SessionID: "rotation-session"},
		WorkspaceID: "rotation-workspace", EnvironmentID: "rotation-environment", Mode: "live", PublicBindings: map[string]any{}, Secrets: secrets,
	})
	if err != nil {
		t.Fatalf("create old-key environment snapshot: %v", err)
	}
	originalCiphertexts := map[string]string{}
	rows, err := database.Query(`SELECT binding_id, encode(ciphertext, 'hex') FROM execution_environment_secret_materials WHERE environment_id=$1 AND revision=$2`, snapshot.EnvironmentID, snapshot.Revision)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var bindingID, ciphertext string
		if err := rows.Scan(&bindingID, &ciphertext); err != nil {
			t.Fatal(err)
		}
		originalCiphertexts[bindingID] = ciphertext
	}
	_ = rows.Close()

	rotatingStore := NewStoreWithKeyRing(database, "", "key-new", map[string]string{"key-old": oldKey, "key-new": newKey})
	start := make(chan struct{})
	results := make(chan SecretKeyRotationResult, 4)
	errorsByWorker := make(chan error, 4)
	var wait sync.WaitGroup
	for range 4 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			result, err := rotatingStore.RotateSecretMaterials(context.Background(), SecretKeyRotationPolicy{BatchSize: 2})
			results <- result
			errorsByWorker <- err
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	close(errorsByWorker)
	for err := range errorsByWorker {
		if err != nil {
			t.Fatalf("concurrent key rotation: %v", err)
		}
	}
	rotatedCount := 0
	for result := range results {
		rotatedCount += result.RewrappedMaterials
	}
	if rotatedCount != len(secrets) {
		t.Fatalf("concurrent rotation did not claim every row exactly once: rotated=%d expected=%d", rotatedCount, len(secrets))
	}
	var activeCount, unchangedCiphertextCount, auditCount, auditRewrapped int
	if err := database.QueryRow(`SELECT COUNT(*), COUNT(*) FILTER (WHERE encode(ciphertext, 'hex') = CASE binding_id `+
		`WHEN 'binding-0' THEN $1 WHEN 'binding-1' THEN $2 WHEN 'binding-2' THEN $3 WHEN 'binding-3' THEN $4 `+
		`WHEN 'binding-4' THEN $5 WHEN 'binding-5' THEN $6 WHEN 'binding-6' THEN $7 WHEN 'binding-7' THEN $8 END) `+
		`FROM execution_environment_secret_materials WHERE environment_id=$9 AND revision=$10 AND key_id='key-new'`,
		originalCiphertexts["binding-0"], originalCiphertexts["binding-1"], originalCiphertexts["binding-2"], originalCiphertexts["binding-3"],
		originalCiphertexts["binding-4"], originalCiphertexts["binding-5"], originalCiphertexts["binding-6"], originalCiphertexts["binding-7"],
		snapshot.EnvironmentID, snapshot.Revision).Scan(&activeCount, &unchangedCiphertextCount); err != nil {
		t.Fatal(err)
	}
	if activeCount != len(secrets) || unchangedCiphertextCount != len(secrets) {
		t.Fatalf("rotation rewrote Secret ciphertext or missed rows: active=%d unchanged=%d", activeCount, unchangedCiphertextCount)
	}
	if err := database.QueryRow(`SELECT COUNT(*), COALESCE(SUM(rewrapped_count),0) FROM execution_environment_key_rotation_audit`).Scan(&auditCount, &auditRewrapped); err != nil {
		t.Fatal(err)
	}
	if auditCount == 0 || auditRewrapped != len(secrets) {
		t.Fatalf("rotation audit is incomplete: rows=%d rewrapped=%d", auditCount, auditRewrapped)
	}

	newOnlyStore := NewStoreWithKeyRing(database, "", "key-new", map[string]string{"key-new": newKey})
	grant, err := newOnlyStore.IssueGrant(t.Context(), IssueGrantInput{
		Principal:   PrincipalSession{PrincipalID: "rotation-owner", SessionID: "rotation-session"},
		WorkspaceID: snapshot.WorkspaceID, EnvironmentID: snapshot.EnvironmentID, Revision: snapshot.Revision,
		ProviderID: "rotation-provider", ProviderIsolation: "remote-isolated", ExecutionClass: "isolated-runner", RuntimeZone: "server",
		PurposeKind: "server-function", ResourceID: "rotation/read", SecretBindings: []SecretBindingGrant{{BindingID: "binding-0", Field: "key"}}, ExpiresAt: time.Now().UTC().Add(time.Minute),
	})
	if err != nil {
		t.Fatalf("issue post-rotation grant: %v", err)
	}
	var resolved string
	err = newOnlyStore.UseSecret(t.Context(), UseSecretInput{
		GrantID: grant.GrantID, Principal: grant.Principal, WorkspaceID: grant.WorkspaceID, EnvironmentID: grant.EnvironmentID, Revision: grant.Revision,
		ProviderID: grant.ProviderID, PurposeKind: grant.PurposeKind, ResourceID: grant.ResourceID, BindingID: "binding-0", Field: "key",
	}, func(material []byte) error {
		resolved = string(material)
		return nil
	})
	if err != nil || resolved != secrets["binding-0"] {
		t.Fatalf("active key could not resolve a rotated Secret: resolved=%q err=%v", resolved, err)
	}
	oldOnlyStore := NewStoreWithKeyRing(database, "", "key-old", map[string]string{"key-old": oldKey})
	if err := oldOnlyStore.UseSecret(t.Context(), UseSecretInput{
		GrantID: grant.GrantID, Principal: grant.Principal, WorkspaceID: grant.WorkspaceID, EnvironmentID: grant.EnvironmentID, Revision: grant.Revision,
		ProviderID: grant.ProviderID, PurposeKind: grant.PurposeKind, ResourceID: grant.ResourceID, BindingID: "binding-0", Field: "key",
	}, func([]byte) error { return nil }); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("retired key unexpectedly resolved a rotated Secret: %v", err)
	}
}
