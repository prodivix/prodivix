package remoteexecution

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

const backendPostgreSQLTestURL = "PRODIVIX_BACKEND_POSTGRES_TEST_URL"

type dataGatewayReplayAttempt struct {
	claim *DataGatewayMutationReplayClaim
	err   error
}

func randomPostgreSQLSchema(t *testing.T) string {
	t.Helper()
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatalf("create PostgreSQL test schema suffix: %v", err)
	}
	return "prodivix_backend_replay_" + hex.EncodeToString(suffix[:])
}

func openDataGatewayReplayPostgreSQL(t *testing.T) *sql.DB {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv(backendPostgreSQLTestURL))
	if databaseURL == "" {
		t.Skipf("set %s to run the real PostgreSQL replay Gate", backendPostgreSQLTestURL)
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

	schema := randomPostgreSQLSchema(t)
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
	testDatabase.SetMaxOpenConns(32)
	testDatabase.SetMaxIdleConns(32)
	if err := testDatabase.PingContext(ctx); err != nil {
		t.Fatalf("connect to isolated PostgreSQL integration schema: %v", err)
	}
	if err := backenddatabase.RunMigrations(ctx, testDatabase); err != nil {
		t.Fatalf("migrate isolated PostgreSQL integration schema: %v", err)
	}
	return testDatabase
}

func seedDataGatewayReplayPostgreSQLWorkspace(t *testing.T, database *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	now := time.Now().UTC()
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin PostgreSQL replay fixture: %v", err)
	}
	defer func() { _ = tx.Rollback() }()
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)`, []any{"postgres-replay-owner", "postgres-replay@example.com", "Replay Gate", []byte("integration-only"), now}},
		{`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at) VALUES ($1, $2, 'project', $3, $4, $4)`, []any{"postgres-replay-project", "postgres-replay-owner", "Replay Gate", now}},
		{`INSERT INTO workspaces (id, project_id, owner_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`, []any{"postgres-replay-workspace", "postgres-replay-project", "postgres-replay-owner", "Replay Gate", now}},
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("seed PostgreSQL replay fixture: %v", err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit PostgreSQL replay fixture: %v", err)
	}
}

func recordDataGatewayReplayExecution(t *testing.T, store *Store, executionID string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := store.RecordExecution(ctx, ExecutionAuthority{
		ExecutionID:        executionID,
		WorkspaceID:        "postgres-replay-workspace",
		OwnerID:            "postgres-replay-owner",
		SnapshotID:         "snapshot-" + executionID,
		PartitionRevisions: map[string]string{"workspace": "1"},
	}); err != nil {
		t.Fatalf("record PostgreSQL replay execution %q: %v", executionID, err)
	}
}

func claimDataGatewayReplayConcurrently(store *Store, keys []DataGatewayMutationReplayKey, requestHash string, policy DataGatewayMutationReplayPolicy) []dataGatewayReplayAttempt {
	start := make(chan struct{})
	outcomes := make(chan dataGatewayReplayAttempt, len(keys))
	var wait sync.WaitGroup
	for _, key := range keys {
		key := key
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			claim, err := store.ClaimDataGatewayMutation(context.Background(), key, requestHash, policy)
			outcomes <- dataGatewayReplayAttempt{claim: claim, err: err}
		}()
	}
	close(start)
	wait.Wait()
	close(outcomes)
	result := make([]dataGatewayReplayAttempt, 0, len(keys))
	for outcome := range outcomes {
		result = append(result, outcome)
	}
	return result
}

func dataGatewayReplayRowCount(t *testing.T, database *sql.DB, executionID string) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var count int
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_data_mutation_replays WHERE execution_id = $1`, executionID).Scan(&count); err != nil {
		t.Fatalf("count PostgreSQL replay rows: %v", err)
	}
	return count
}

func successfulDataGatewayReplayResult(key DataGatewayMutationReplayKey) DataGatewayResult {
	return DataGatewayResult{
		Value: map[string]any{"id": "created-1", "status": "created"},
		Empty: false,
		Network: dataGatewayNetworkTrace{
			Format:       "prodivix.execution-network-trace.v1",
			RequestID:    key.InvocationID + ":1",
			Phase:        "runtime",
			RuntimeZone:  "server",
			Mode:         "live",
			Adapter:      "core.http",
			Method:       "POST",
			SanitizedURL: "https://api.example.com/items",
			Protocol:     "https",
			StartedAt:    1,
			CompletedAt:  2,
			DurationMS:   1,
			Outcome:      "allowed",
			Status:       201,
			Correlation: dataGatewayCorrelation{
				Kind:         "data-operation",
				DocumentID:   key.DocumentID,
				OperationID:  key.OperationID,
				InvocationID: key.InvocationID,
				Sequence:     key.Sequence,
				Attempt:      1,
			},
			Redacted: true,
		},
	}
}

func TestDataGatewayMutationReplayPostgreSQLGate(t *testing.T) {
	database := openDataGatewayReplayPostgreSQL(t)
	seedDataGatewayReplayPostgreSQLWorkspace(t, database)
	store := NewStore(database)

	t.Run("serializes concurrent claims for one invocation", func(t *testing.T) {
		const executionID = "postgres-replay-concurrent"
		recordDataGatewayReplayExecution(t, store, executionID)
		key := DataGatewayMutationReplayKey{
			ExecutionID: executionID, DocumentID: "data-orders", OperationID: "create", InvocationID: "invocation-one", Sequence: 1,
		}
		keys := make([]DataGatewayMutationReplayKey, 24)
		for index := range keys {
			keys[index] = key
		}
		acquired, unsafe := 0, 0
		for _, outcome := range claimDataGatewayReplayConcurrently(store, keys, strings.Repeat("a", 64), DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 1}) {
			switch {
			case outcome.err == nil && outcome.claim != nil && outcome.claim.Acquired:
				acquired++
			case errors.Is(outcome.err, ErrDataGatewayReplayUnsafe):
				unsafe++
			default:
				t.Fatalf("unexpected concurrent replay claim: claim=%+v err=%v", outcome.claim, outcome.err)
			}
		}
		if acquired != 1 || unsafe != len(keys)-1 {
			t.Fatalf("expected one acquired and %d fenced claims, got acquired=%d fenced=%d", len(keys)-1, acquired, unsafe)
		}
		if count := dataGatewayReplayRowCount(t, database, executionID); count != 1 {
			t.Fatalf("expected one durable replay row, got %d", count)
		}
	})

	t.Run("serializes the final capacity slot", func(t *testing.T) {
		const executionID = "postgres-replay-capacity"
		recordDataGatewayReplayExecution(t, store, executionID)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := database.ExecContext(ctx, `INSERT INTO remote_data_mutation_replays (execution_id, document_id, operation_id, invocation_id, request_hash, status)
SELECT $1, 'data-capacity', 'create', 'preloaded-' || value::text, $2, 'pending'
FROM generate_series(1, $3) AS value`, executionID, strings.Repeat("b", 64), maximumDataGatewayReplays-1); err != nil {
			t.Fatalf("preload PostgreSQL replay capacity: %v", err)
		}
		keys := make([]DataGatewayMutationReplayKey, 16)
		for index := range keys {
			keys[index] = DataGatewayMutationReplayKey{
				ExecutionID:  executionID,
				DocumentID:   "data-capacity",
				OperationID:  "create",
				InvocationID: fmt.Sprintf("capacity-contender-%d", index),
				Sequence:     int64(index + 1),
			}
		}
		acquired, capacity := 0, 0
		for _, outcome := range claimDataGatewayReplayConcurrently(store, keys, strings.Repeat("c", 64), DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 1}) {
			switch {
			case outcome.err == nil && outcome.claim != nil && outcome.claim.Acquired:
				acquired++
			case errors.Is(outcome.err, ErrDataGatewayReplayCapacity):
				capacity++
			default:
				t.Fatalf("unexpected capacity replay claim: claim=%+v err=%v", outcome.claim, outcome.err)
			}
		}
		if acquired != 1 || capacity != len(keys)-1 {
			t.Fatalf("expected one final slot and %d capacity rejections, got acquired=%d rejected=%d", len(keys)-1, acquired, capacity)
		}
		if count := dataGatewayReplayRowCount(t, database, executionID); count != maximumDataGatewayReplays {
			t.Fatalf("expected bounded replay row count %d, got %d", maximumDataGatewayReplays, count)
		}
	})

	t.Run("serializes each explicitly released retry attempt", func(t *testing.T) {
		const executionID = "postgres-replay-retry"
		recordDataGatewayReplayExecution(t, store, executionID)
		key := DataGatewayMutationReplayKey{
			ExecutionID: executionID, DocumentID: "data-orders", OperationID: "create", InvocationID: "invocation-retry", Sequence: 11,
		}
		requestHash := strings.Repeat("9", 64)
		if claim, err := store.ClaimDataGatewayMutation(context.Background(), key, requestHash, DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 3}); err != nil || claim == nil || !claim.Acquired {
			t.Fatalf("claim retry attempt one: claim=%+v err=%v", claim, err)
		}
		if err := store.ReleaseDataGatewayMutationRetry(context.Background(), key, requestHash, 1); err != nil {
			t.Fatalf("release retry attempt one: %v", err)
		}
		keys := make([]DataGatewayMutationReplayKey, 16)
		for index := range keys {
			keys[index] = key
		}
		acquired, unsafe := 0, 0
		for _, outcome := range claimDataGatewayReplayConcurrently(store, keys, requestHash, DataGatewayMutationReplayPolicy{Attempt: 2, MaximumAttempts: 3}) {
			switch {
			case outcome.err == nil && outcome.claim != nil && outcome.claim.Acquired:
				acquired++
			case errors.Is(outcome.err, ErrDataGatewayReplayUnsafe):
				unsafe++
			default:
				t.Fatalf("unexpected concurrent retry claim: claim=%+v err=%v", outcome.claim, outcome.err)
			}
		}
		if acquired != 1 || unsafe != len(keys)-1 {
			t.Fatalf("expected one retry claim and %d fenced duplicates, got acquired=%d fenced=%d", len(keys)-1, acquired, unsafe)
		}
		if err := store.ReleaseDataGatewayMutationRetry(context.Background(), key, requestHash, 2); err != nil {
			t.Fatalf("release retry attempt two: %v", err)
		}
		if claim, err := store.ClaimDataGatewayMutation(context.Background(), key, requestHash, DataGatewayMutationReplayPolicy{Attempt: 3, MaximumAttempts: 3}); err != nil || claim == nil || !claim.Acquired {
			t.Fatalf("claim final retry attempt: claim=%+v err=%v", claim, err)
		}
		result := successfulDataGatewayReplayResult(key)
		result.Network.RequestID = key.InvocationID + ":3"
		result.Network.Correlation.Attempt = 3
		if err := store.CompleteDataGatewayMutation(context.Background(), key, requestHash, 3, result); err != nil {
			t.Fatalf("complete final retry attempt: %v", err)
		}
	})

	t.Run("replays success and fences identity drift and ambiguity", func(t *testing.T) {
		const executionID = "postgres-replay-result"
		recordDataGatewayReplayExecution(t, store, executionID)
		key := DataGatewayMutationReplayKey{
			ExecutionID: executionID, DocumentID: "data-orders", OperationID: "create", InvocationID: "invocation-result", Sequence: 7,
		}
		requestHash := strings.Repeat("d", 64)
		policy := DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 1}
		claim, err := store.ClaimDataGatewayMutation(context.Background(), key, requestHash, policy)
		if err != nil || claim == nil || !claim.Acquired {
			t.Fatalf("acquire replay claim: claim=%+v err=%v", claim, err)
		}
		result := successfulDataGatewayReplayResult(key)
		if err := store.CompleteDataGatewayMutation(context.Background(), key, requestHash, 1, result); err != nil {
			t.Fatalf("complete replay claim: %v", err)
		}
		replayed, err := store.ClaimDataGatewayMutation(context.Background(), key, requestHash, policy)
		if err != nil || replayed == nil || replayed.Acquired || replayed.Result == nil {
			t.Fatalf("read completed replay: claim=%+v err=%v", replayed, err)
		}
		if !reflect.DeepEqual(replayed.Result, &result) {
			t.Fatalf("completed replay changed result:\nwant: %#v\n got: %#v", result, replayed.Result)
		}
		if _, err := store.ClaimDataGatewayMutation(context.Background(), key, strings.Repeat("e", 64), policy); !errors.Is(err, ErrDataGatewayReplayConflict) {
			t.Fatalf("expected identity conflict, got %v", err)
		}

		ambiguousKey := DataGatewayMutationReplayKey{
			ExecutionID: executionID, DocumentID: "data-orders", OperationID: "create", InvocationID: "invocation-ambiguous", Sequence: 8,
		}
		ambiguousHash := strings.Repeat("f", 64)
		if claim, err := store.ClaimDataGatewayMutation(context.Background(), ambiguousKey, ambiguousHash, policy); err != nil || claim == nil || !claim.Acquired {
			t.Fatalf("acquire ambiguous replay claim: claim=%+v err=%v", claim, err)
		}
		if err := store.FenceDataGatewayMutation(context.Background(), ambiguousKey, ambiguousHash, 1); err != nil {
			t.Fatalf("fence ambiguous replay claim: %v", err)
		}
		if _, err := store.ClaimDataGatewayMutation(context.Background(), ambiguousKey, ambiguousHash, policy); !errors.Is(err, ErrDataGatewayReplayUnsafe) {
			t.Fatalf("expected indeterminate replay fence, got %v", err)
		}
	})

	t.Run("cascades replay rows with execution authority", func(t *testing.T) {
		const executionID = "postgres-replay-cascade"
		recordDataGatewayReplayExecution(t, store, executionID)
		key := DataGatewayMutationReplayKey{
			ExecutionID: executionID, DocumentID: "data-orders", OperationID: "delete", InvocationID: "invocation-delete", Sequence: 1,
		}
		if claim, err := store.ClaimDataGatewayMutation(context.Background(), key, strings.Repeat("a", 64), DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 1}); err != nil || claim == nil || !claim.Acquired {
			t.Fatalf("acquire replay claim before cascade: claim=%+v err=%v", claim, err)
		}
		if _, err := database.ExecContext(context.Background(), `DELETE FROM remote_execution_grants WHERE execution_id = $1`, executionID); err != nil {
			t.Fatalf("delete execution authority: %v", err)
		}
		if count := dataGatewayReplayRowCount(t, database, executionID); count != 0 {
			t.Fatalf("expected replay rows to cascade, got %d", count)
		}
	})
}
