package remoteexecution

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestIsolatedSecretResolutionPostgreSQLAttemptRecoveryGate(t *testing.T) {
	database := openDataGatewayReplayPostgreSQL(t)
	seedDataGatewayReplayPostgreSQLWorkspace(t, database)
	store := NewStore(database)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	const executionID = "postgres-isolated-secret-recovery"
	if err := store.RecordExecution(ctx, ExecutionAuthority{
		ExecutionID:        executionID,
		WorkspaceID:        "postgres-replay-workspace",
		OwnerID:            "postgres-replay-owner",
		SessionID:          "postgres-secret-recovery-session",
		SnapshotID:         "snapshot-isolated-secret-recovery",
		PartitionRevisions: map[string]string{"workspace": "1", "document:code-secret:content": "7"},
		Environment:        &EnvironmentReference{EnvironmentID: "environment-production", Revision: "revision-1", Mode: "live"},
	}); err != nil {
		t.Fatalf("record isolated Secret recovery execution: %v", err)
	}
	keyForAttempt := func(attempt int64) IsolatedSecretResolutionKey {
		return IsolatedSecretResolutionKey{
			ExecutionID:        executionID,
			WorkerID:           fmt.Sprintf("worker-%d", attempt),
			WorkerAttempt:      attempt,
			ArtifactID:         "code-secret",
			ExportName:         "useSecret",
			InvocationID:       "invocation-secret",
			RecipientPublicKey: strings.Repeat(string(rune('a'+attempt)), 43),
		}
	}
	first := keyForAttempt(1)
	if reservation, err := store.ReserveIsolatedSecretResolution(ctx, first); err != nil || reservation.Kind != "reserved" {
		t.Fatalf("reserve first Secret attempt: reservation=%#v err=%v", reservation, err)
	}
	if err := store.CompleteIsolatedSecretResolution(ctx, first, json.RawMessage(`{"attempt":1}`)); err != nil {
		t.Fatalf("complete first Secret attempt: %v", err)
	}

	const finalAttempt int64 = 8
	start := make(chan struct{})
	errorsByAttempt := make(chan error, finalAttempt-1)
	var wait sync.WaitGroup
	for attempt := int64(2); attempt <= finalAttempt; attempt++ {
		attempt := attempt
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			reservation, err := store.ReserveIsolatedSecretResolution(context.Background(), keyForAttempt(attempt))
			if err == nil && reservation.Kind != "reserved" {
				err = fmt.Errorf("attempt %d returned %q", attempt, reservation.Kind)
			}
			if err != nil && !errors.Is(err, ErrIsolatedSecretResolutionConflict) {
				err = fmt.Errorf("attempt %d returned unexpected error: %w", attempt, err)
			}
			errorsByAttempt <- err
		}()
	}
	close(start)
	wait.Wait()
	close(errorsByAttempt)
	for err := range errorsByAttempt {
		if err != nil && !errors.Is(err, ErrIsolatedSecretResolutionConflict) {
			t.Fatal(err)
		}
	}
	var storedAttempt, rowCount int64
	var storedWorker string
	var envelope []byte
	if err := database.QueryRowContext(ctx, `SELECT worker_attempt, worker_id, envelope_json, (SELECT COUNT(*) FROM remote_isolated_secret_resolutions WHERE execution_id=$1) FROM remote_isolated_secret_resolutions WHERE execution_id=$1`, executionID).Scan(&storedAttempt, &storedWorker, &envelope, &rowCount); err != nil {
		t.Fatalf("inspect recovered Secret attempt: %v", err)
	}
	if storedAttempt != finalAttempt || storedWorker != "worker-8" || len(envelope) != 0 || rowCount != 1 {
		t.Fatalf("highest attempt did not atomically supersede prior ciphertext: attempt=%d worker=%q envelope=%q rows=%d", storedAttempt, storedWorker, envelope, rowCount)
	}
	for attempt := int64(1); attempt < finalAttempt; attempt++ {
		if err := store.CompleteIsolatedSecretResolution(ctx, keyForAttempt(attempt), json.RawMessage(fmt.Sprintf(`{"attempt":%d}`, attempt))); !errors.Is(err, ErrIsolatedSecretResolutionConflict) {
			t.Fatalf("superseded attempt %d completed after recovery: %v", attempt, err)
		}
	}
	finalKey := keyForAttempt(finalAttempt)
	finalEnvelope := json.RawMessage(`{"attempt":8}`)
	if err := store.CompleteIsolatedSecretResolution(ctx, finalKey, finalEnvelope); err != nil {
		t.Fatalf("complete final recovered attempt: %v", err)
	}
	reservation, err := store.ReserveIsolatedSecretResolution(ctx, finalKey)
	var replayed struct {
		Attempt int64 `json:"attempt"`
	}
	if err != nil || reservation == nil || reservation.Kind != "existing" || json.Unmarshal(reservation.Envelope, &replayed) != nil || replayed.Attempt != finalAttempt {
		t.Fatalf("replay final recovered envelope: reservation=%#v decoded=%#v err=%v", reservation, replayed, err)
	}
	if reservation, err := store.ReserveIsolatedSecretResolution(ctx, first); reservation != nil || !errors.Is(err, ErrIsolatedSecretResolutionConflict) {
		t.Fatalf("superseded attempt was not durably revoked: reservation=%#v err=%v", reservation, err)
	}
}
