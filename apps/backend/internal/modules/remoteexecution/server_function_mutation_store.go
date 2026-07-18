package remoteexecution

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
)

func validServerFunctionMutationKey(key ServerFunctionExecutionStateMutationKey) bool {
	if !serverFunctionStateKey.MatchString(key.StateKey) {
		return false
	}
	for _, value := range []string{key.ExecutionID, key.ArtifactID, key.ExportName, key.InvocationID} {
		if _, ok := normalizedDataGatewayID(value); !ok {
			return false
		}
	}
	_, artifactOK := normalizedServerFunctionID(key.ArtifactID, false)
	_, exportOK := normalizedServerFunctionID(key.ExportName, true)
	return artifactOK && exportOK
}

func canonicalServerFunctionStateValue(raw json.RawMessage) (json.RawMessage, any, error) {
	if len(raw) == 0 || int64(len(raw)) > maximumServerFunctionRequestBytes {
		return nil, nil, ErrServerFunctionInputInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, nil, ErrServerFunctionInputInvalid
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, nil, ErrServerFunctionInputInvalid
	}
	nodes := 0
	if !serverFunctionExecutionValueAllowed(value, 0, &nodes) {
		return nil, nil, ErrServerFunctionInputInvalid
	}
	canonical, err := json.Marshal(value)
	if err != nil || int64(len(canonical)) > maximumServerFunctionRequestBytes {
		return nil, nil, ErrServerFunctionInputInvalid
	}
	return json.RawMessage(canonical), value, nil
}

func decodeServerFunctionExecutionStateResult(raw []byte, key ServerFunctionExecutionStateMutationKey) (*ServerFunctionExecutionStateResult, error) {
	if len(raw) == 0 || int64(len(raw)) > maximumServerFunctionRequestBytes+1024 {
		return nil, ErrServerFunctionReplayConflict
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	var result ServerFunctionExecutionStateResult
	if err := decoder.Decode(&result); err != nil {
		return nil, ErrServerFunctionReplayConflict
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, ErrServerFunctionReplayConflict
	}
	nodes := 0
	if result.Key != key.StateKey || result.Revision < 1 || !serverFunctionExecutionValueAllowed(result.Value, 0, &nodes) {
		return nil, ErrServerFunctionReplayConflict
	}
	return &result, nil
}

// ApplyServerFunctionExecutionStateMutation commits the effect and replay result atomically.
func (store *Store) ApplyServerFunctionExecutionStateMutation(ctx context.Context, key ServerFunctionExecutionStateMutationKey, requestHash string, rawValue json.RawMessage) (*ServerFunctionExecutionStateResult, error) {
	if store == nil || store.db == nil || !validServerFunctionMutationKey(key) || !validDataGatewayRequestHash(requestHash) {
		return nil, ErrServerFunctionReplayConflict
	}
	valueJSON, value, err := canonicalServerFunctionStateValue(rawValue)
	if err != nil {
		return nil, err
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	lockIdentity := "server-function:" + key.ExecutionID
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, lockIdentity); err != nil {
		return nil, err
	}
	var storedHash string
	var storedResult []byte
	err = tx.QueryRowContext(ctx, `SELECT request_hash, result_json
FROM remote_server_function_mutation_replays
WHERE execution_id = $1 AND artifact_id = $2 AND export_name = $3 AND invocation_id = $4`, key.ExecutionID, key.ArtifactID, key.ExportName, key.InvocationID).Scan(&storedHash, &storedResult)
	if err == nil {
		if storedHash != requestHash {
			return nil, ErrServerFunctionReplayConflict
		}
		result, decodeErr := decodeServerFunctionExecutionStateResult(storedResult, key)
		if decodeErr != nil {
			return nil, decodeErr
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return result, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	var replayCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_mutation_replays WHERE execution_id = $1`, key.ExecutionID).Scan(&replayCount); err != nil {
		return nil, err
	}
	if replayCount >= maximumServerFunctionMutationReplays {
		return nil, ErrServerFunctionReplayCapacity
	}
	var existingState int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM remote_server_function_execution_state
WHERE execution_id = $1 AND artifact_id = $2 AND export_name = $3 AND state_key = $4`, key.ExecutionID, key.ArtifactID, key.ExportName, key.StateKey).Scan(&existingState)
	if errors.Is(err, sql.ErrNoRows) {
		var stateCount int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_execution_state WHERE execution_id = $1`, key.ExecutionID).Scan(&stateCount); err != nil {
			return nil, err
		}
		if stateCount >= maximumServerFunctionExecutionStateEntries {
			return nil, ErrServerFunctionReplayCapacity
		}
	} else if err != nil {
		return nil, err
	}
	var revision int64
	err = tx.QueryRowContext(ctx, `INSERT INTO remote_server_function_execution_state (execution_id, artifact_id, export_name, state_key, value_json, revision)
VALUES ($1, $2, $3, $4, $5, 1)
ON CONFLICT (execution_id, artifact_id, export_name, state_key) DO UPDATE
SET value_json = EXCLUDED.value_json,
	revision = remote_server_function_execution_state.revision + 1,
	updated_at = NOW()
RETURNING revision`, key.ExecutionID, key.ArtifactID, key.ExportName, key.StateKey, valueJSON).Scan(&revision)
	if err != nil {
		return nil, err
	}
	if revision < 1 {
		return nil, ErrServerFunctionReplayConflict
	}
	result := &ServerFunctionExecutionStateResult{Key: key.StateKey, Value: value, Revision: revision}
	resultJSON, err := json.Marshal(result)
	if err != nil || int64(len(resultJSON)) > maximumServerFunctionRequestBytes+1024 {
		return nil, ErrServerFunctionOutputInvalid
	}
	inserted, err := tx.ExecContext(ctx, `INSERT INTO remote_server_function_mutation_replays (execution_id, artifact_id, export_name, invocation_id, request_hash, result_json)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (execution_id, artifact_id, export_name, invocation_id) DO NOTHING`, key.ExecutionID, key.ArtifactID, key.ExportName, key.InvocationID, requestHash, resultJSON)
	if err != nil {
		return nil, err
	}
	rows, err := inserted.RowsAffected()
	if err != nil || rows != 1 {
		return nil, ErrServerFunctionReplayConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}
