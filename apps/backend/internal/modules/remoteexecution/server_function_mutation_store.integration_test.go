package remoteexecution

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

type serverFunctionMutationAttempt struct {
	result *ServerFunctionExecutionStateResult
	err    error
}

func TestServerFunctionLiveMutationPostgreSQLGate(t *testing.T) {
	database := openDataGatewayReplayPostgreSQL(t)
	seedDataGatewayReplayPostgreSQLWorkspace(t, database)
	store := NewStore(database)
	const executionID = "postgres-server-mutation"
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := store.RecordExecution(ctx, ExecutionAuthority{
		ExecutionID:        executionID,
		WorkspaceID:        "postgres-replay-workspace",
		OwnerID:            "postgres-replay-owner",
		SessionID:          "postgres-server-session",
		SnapshotID:         "snapshot-server-mutation",
		PartitionRevisions: map[string]string{"workspace": "1", "document:code-auth:content": "7"},
	}); err != nil {
		t.Fatalf("record Server Function mutation execution: %v", err)
	}

	key := ServerFunctionExecutionStateMutationKey{
		ExecutionID: executionID, ArtifactID: "code-auth", ExportName: "putState", InvocationID: "mutation-concurrent", StateKey: "profile",
	}
	start := make(chan struct{})
	outcomes := make(chan serverFunctionMutationAttempt, 24)
	var wait sync.WaitGroup
	for range 24 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			result, err := store.ApplyServerFunctionExecutionStateMutation(context.Background(), key, strings.Repeat("a", 64), json.RawMessage(`{"displayName":"Ada"}`))
			outcomes <- serverFunctionMutationAttempt{result: result, err: err}
		}()
	}
	close(start)
	wait.Wait()
	close(outcomes)
	for outcome := range outcomes {
		if outcome.err != nil || outcome.result == nil || outcome.result.Key != "profile" || outcome.result.Revision != 1 {
			t.Fatalf("concurrent exact replay drifted: result=%+v err=%v", outcome.result, outcome.err)
		}
	}
	var stateCount, replayCount, revision int
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(MAX(revision), 0) FROM remote_server_function_execution_state WHERE execution_id = $1`, executionID).Scan(&stateCount, &revision); err != nil {
		t.Fatalf("inspect Server Function execution state: %v", err)
	}
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_mutation_replays WHERE execution_id = $1`, executionID).Scan(&replayCount); err != nil {
		t.Fatalf("inspect Server Function mutation replay: %v", err)
	}
	if stateCount != 1 || replayCount != 1 || revision != 1 {
		t.Fatalf("exact replay was not atomic: states=%d replays=%d revision=%d", stateCount, replayCount, revision)
	}

	if result, err := store.ApplyServerFunctionExecutionStateMutation(ctx, key, strings.Repeat("b", 64), json.RawMessage(`{"displayName":"Mallory"}`)); result != nil || !errors.Is(err, ErrServerFunctionReplayConflict) {
		t.Fatalf("identity drift was not fenced: result=%+v err=%v", result, err)
	}
	secondKey := key
	secondKey.InvocationID = "mutation-second"
	second, err := store.ApplyServerFunctionExecutionStateMutation(ctx, secondKey, strings.Repeat("c", 64), json.RawMessage(`{"displayName":"Grace"}`))
	if err != nil || second == nil || second.Revision != 2 {
		t.Fatalf("second durable mutation did not advance state: result=%+v err=%v", second, err)
	}

	cancelledContext, cancelMutation := context.WithCancel(context.Background())
	cancelMutation()
	cancelledKey := key
	cancelledKey.InvocationID = "mutation-cancelled"
	if result, err := store.ApplyServerFunctionExecutionStateMutation(cancelledContext, cancelledKey, strings.Repeat("d", 64), json.RawMessage(`true`)); result != nil || err == nil {
		t.Fatalf("cancelled mutation was not rolled back: result=%+v err=%v", result, err)
	}
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_mutation_replays WHERE execution_id = $1`, executionID).Scan(&replayCount); err != nil || replayCount != 2 {
		t.Fatalf("cancelled mutation created durable replay state: count=%d err=%v", replayCount, err)
	}

	recordCapacityExecution := func(executionID string) {
		t.Helper()
		if err := store.RecordExecution(ctx, ExecutionAuthority{
			ExecutionID: executionID, WorkspaceID: "postgres-replay-workspace", OwnerID: "postgres-replay-owner", SessionID: "postgres-server-session",
			SnapshotID: "snapshot-" + executionID, PartitionRevisions: map[string]string{"workspace": "1", "document:code-auth:content": "7"},
		}); err != nil {
			t.Fatalf("record capacity execution %q: %v", executionID, err)
		}
	}
	const replayCapacityExecution = "postgres-server-replay-capacity"
	recordCapacityExecution(replayCapacityExecution)
	if _, err := database.ExecContext(ctx, `INSERT INTO remote_server_function_mutation_replays (execution_id, artifact_id, export_name, invocation_id, request_hash, result_json)
SELECT $1, 'code-auth', 'putState', 'preloaded-' || value::text, $2, '{"key":"existing","value":true,"revision":1}'::jsonb
FROM generate_series(1, $3) AS value`, replayCapacityExecution, strings.Repeat("e", 64), maximumServerFunctionMutationReplays); err != nil {
		t.Fatalf("preload Server Function replay capacity: %v", err)
	}
	capacityKey := key
	capacityKey.ExecutionID = replayCapacityExecution
	capacityKey.InvocationID = "capacity-overflow"
	if result, err := store.ApplyServerFunctionExecutionStateMutation(ctx, capacityKey, strings.Repeat("f", 64), json.RawMessage(`true`)); result != nil || !errors.Is(err, ErrServerFunctionReplayCapacity) {
		t.Fatalf("replay capacity was not fenced: result=%+v err=%v", result, err)
	}

	const concurrentCapacityExecution = "postgres-server-concurrent-capacity"
	recordCapacityExecution(concurrentCapacityExecution)
	if _, err := database.ExecContext(ctx, `INSERT INTO remote_server_function_mutation_replays (execution_id, artifact_id, export_name, invocation_id, request_hash, result_json)
SELECT $1, 'code-auth', 'putState', 'preloaded-' || value::text, $2, '{"key":"existing","value":true,"revision":1}'::jsonb
FROM generate_series(1, $3) AS value`, concurrentCapacityExecution, strings.Repeat("2", 64), maximumServerFunctionMutationReplays-1); err != nil {
		t.Fatalf("preload concurrent replay capacity: %v", err)
	}
	startCapacity := make(chan struct{})
	capacityOutcomes := make(chan serverFunctionMutationAttempt, 16)
	for index := range 16 {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-startCapacity
			contender := key
			contender.ExecutionID = concurrentCapacityExecution
			contender.ExportName = "putState" + strconv.Itoa(index)
			contender.InvocationID = "capacity-contender-" + strconv.Itoa(index)
			result, err := store.ApplyServerFunctionExecutionStateMutation(context.Background(), contender, strings.Repeat(strconv.FormatInt(int64((index%8)+1), 10), 64), json.RawMessage(`true`))
			capacityOutcomes <- serverFunctionMutationAttempt{result: result, err: err}
		}(index)
	}
	close(startCapacity)
	wait.Wait()
	close(capacityOutcomes)
	succeeded, exhausted := 0, 0
	for outcome := range capacityOutcomes {
		switch {
		case outcome.err == nil && outcome.result != nil:
			succeeded++
		case errors.Is(outcome.err, ErrServerFunctionReplayCapacity):
			exhausted++
		default:
			t.Fatalf("unexpected concurrent capacity outcome: result=%+v err=%v", outcome.result, outcome.err)
		}
	}
	if succeeded != 1 || exhausted != 15 {
		t.Fatalf("final replay capacity slot was not serialized: succeeded=%d exhausted=%d", succeeded, exhausted)
	}
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_mutation_replays WHERE execution_id = $1`, concurrentCapacityExecution).Scan(&replayCount); err != nil || replayCount != maximumServerFunctionMutationReplays {
		t.Fatalf("concurrent replay capacity exceeded: count=%d err=%v", replayCount, err)
	}

	const stateCapacityExecution = "postgres-server-state-capacity"
	recordCapacityExecution(stateCapacityExecution)
	if _, err := database.ExecContext(ctx, `INSERT INTO remote_server_function_execution_state (execution_id, artifact_id, export_name, state_key, value_json, revision)
SELECT $1, 'code-auth', 'putState', 'state-' || value::text, 'true'::jsonb, 1
FROM generate_series(1, $2) AS value`, stateCapacityExecution, maximumServerFunctionExecutionStateEntries); err != nil {
		t.Fatalf("preload Server Function state capacity: %v", err)
	}
	stateCapacityKey := key
	stateCapacityKey.ExecutionID = stateCapacityExecution
	stateCapacityKey.InvocationID = "state-capacity-overflow"
	stateCapacityKey.StateKey = "state-overflow"
	if result, err := store.ApplyServerFunctionExecutionStateMutation(ctx, stateCapacityKey, strings.Repeat("1", 64), json.RawMessage(`true`)); result != nil || !errors.Is(err, ErrServerFunctionReplayCapacity) {
		t.Fatalf("state capacity was not fenced: result=%+v err=%v", result, err)
	}

	if _, err := database.ExecContext(ctx, `DELETE FROM remote_execution_grants WHERE execution_id = $1`, executionID); err != nil {
		t.Fatalf("delete Server Function execution authority: %v", err)
	}
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_execution_state WHERE execution_id = $1`, executionID).Scan(&stateCount); err != nil || stateCount != 0 {
		t.Fatalf("execution state did not cascade with authority: count=%d err=%v", stateCount, err)
	}
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_mutation_replays WHERE execution_id = $1`, executionID).Scan(&replayCount); err != nil || replayCount != 0 {
		t.Fatalf("mutation replay did not cascade with authority: count=%d err=%v", replayCount, err)
	}
}
