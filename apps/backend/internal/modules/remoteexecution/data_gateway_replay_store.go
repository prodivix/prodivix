package remoteexecution

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const (
	dataGatewayMutationReplayPending       = "pending"
	dataGatewayMutationReplayRetryable     = "retryable"
	dataGatewayMutationReplaySucceeded     = "succeeded"
	dataGatewayMutationReplayIndeterminate = "indeterminate"
)

func validDataGatewayRequestHash(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, character := range value {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return false
		}
	}
	return true
}

func validDataGatewayMutationReplayKey(key DataGatewayMutationReplayKey) bool {
	if key.Sequence < 0 {
		return false
	}
	for _, value := range []string{key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID} {
		if _, ok := normalizedDataGatewayID(value); !ok {
			return false
		}
	}
	return true
}

func validDataGatewayMutationReplayPolicy(policy DataGatewayMutationReplayPolicy) bool {
	return policy.Attempt >= 1 && policy.MaximumAttempts >= 1 && policy.MaximumAttempts <= maximumDataGatewayRetryAttempts && policy.Attempt <= policy.MaximumAttempts
}

func decodeDataGatewayReplayResult(contents []byte, key DataGatewayMutationReplayKey, attempt int64) (*DataGatewayResult, error) {
	if len(contents) == 0 || int64(len(contents)) > maximumDataGatewayReplayBytes {
		return nil, ErrDataGatewayReplayConflict
	}
	decoder := json.NewDecoder(bytes.NewReader(contents))
	decoder.DisallowUnknownFields()
	var result DataGatewayResult
	if err := decoder.Decode(&result); err != nil {
		return nil, ErrDataGatewayReplayConflict
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, ErrDataGatewayReplayConflict
	}
	correlation := result.Network.Correlation
	if !result.Network.Redacted || result.Network.Format != "prodivix.execution-network-trace.v1" || result.Network.RequestID != key.InvocationID+":"+fmt.Sprint(attempt) || result.Network.Phase != "runtime" || (result.Network.RuntimeZone != "server" && result.Network.RuntimeZone != "edge") || result.Network.Mode != "live" || result.Network.Adapter != "core.http" || result.Network.Protocol != "https" || result.Network.Outcome != "allowed" || correlation.Kind != "data-operation" || correlation.DocumentID != key.DocumentID || correlation.OperationID != key.OperationID || correlation.InvocationID != key.InvocationID || correlation.Sequence != key.Sequence || correlation.Attempt != attempt {
		return nil, ErrDataGatewayReplayConflict
	}
	return &result, nil
}

func projectDataGatewayReplayAttempt(result *DataGatewayResult, key DataGatewayMutationReplayKey, attempt int64) *DataGatewayResult {
	projected := *result
	projected.Network = result.Network
	projected.Network.RequestID = key.InvocationID + ":" + fmt.Sprint(attempt)
	projected.Network.Correlation = result.Network.Correlation
	projected.Network.Correlation.Attempt = attempt
	return &projected
}

func resolveDataGatewayMutationReplayClaim(key DataGatewayMutationReplayKey, requestHash string, policy DataGatewayMutationReplayPolicy, storedHash string, status string, storedResult []byte, storedAttempt int64, storedMaximumAttempts int64) (*DataGatewayMutationReplayClaim, error) {
	if storedHash != requestHash || storedMaximumAttempts != policy.MaximumAttempts || policy.Attempt > storedMaximumAttempts {
		return nil, ErrDataGatewayReplayConflict
	}
	switch status {
	case dataGatewayMutationReplaySucceeded:
		replayed, err := decodeDataGatewayReplayResult(storedResult, key, storedAttempt)
		if err != nil {
			return nil, err
		}
		return &DataGatewayMutationReplayClaim{Result: projectDataGatewayReplayAttempt(replayed, key, policy.Attempt)}, nil
	case dataGatewayMutationReplayPending, dataGatewayMutationReplayRetryable, dataGatewayMutationReplayIndeterminate:
		return nil, ErrDataGatewayReplayUnsafe
	default:
		return nil, ErrDataGatewayReplayConflict
	}
}

// ClaimDataGatewayMutation durably reserves an invocation before any external effect is attempted.
func (store *Store) ClaimDataGatewayMutation(ctx context.Context, key DataGatewayMutationReplayKey, requestHash string, policy DataGatewayMutationReplayPolicy) (*DataGatewayMutationReplayClaim, error) {
	if !validDataGatewayMutationReplayKey(key) || !validDataGatewayRequestHash(requestHash) || !validDataGatewayMutationReplayPolicy(policy) {
		return nil, ErrDataGatewayReplayConflict
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	// The lock must be acquired in its own statement. A lock inside the capacity
	// query would retain the statement snapshot taken before waiting and allow
	// concurrent claimers to observe the same final free slot.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, key.ExecutionID); err != nil {
		return nil, err
	}
	var storedHash, status string
	var storedResult []byte
	var storedAttempt, storedMaximumAttempts int64
	err = tx.QueryRowContext(ctx, `SELECT request_hash, status, result_json, attempt, maximum_attempts
FROM remote_data_mutation_replays
WHERE execution_id = $1 AND document_id = $2 AND operation_id = $3 AND invocation_id = $4`, key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID).Scan(&storedHash, &status, &storedResult, &storedAttempt, &storedMaximumAttempts)
	if err == nil {
		if storedHash == requestHash && storedMaximumAttempts == policy.MaximumAttempts && status == dataGatewayMutationReplayRetryable && policy.Attempt == storedAttempt+1 && policy.Attempt <= storedMaximumAttempts {
			updated, updateErr := tx.ExecContext(ctx, `UPDATE remote_data_mutation_replays
SET status = 'pending', attempt = $6, updated_at = NOW()
WHERE execution_id = $1 AND document_id = $2 AND operation_id = $3 AND invocation_id = $4 AND request_hash = $5 AND status = 'retryable' AND attempt = $7 AND maximum_attempts = $8`, key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID, requestHash, policy.Attempt, storedAttempt, storedMaximumAttempts)
			if updateErr != nil {
				return nil, updateErr
			}
			rows, rowsErr := updated.RowsAffected()
			if rowsErr != nil {
				return nil, rowsErr
			}
			if rows != 1 {
				return nil, ErrDataGatewayReplayUnsafe
			}
			if err := tx.Commit(); err != nil {
				return nil, err
			}
			return &DataGatewayMutationReplayClaim{Acquired: true}, nil
		}
		return resolveDataGatewayMutationReplayClaim(key, requestHash, policy, storedHash, status, storedResult, storedAttempt, storedMaximumAttempts)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_data_mutation_replays WHERE execution_id = $1`, key.ExecutionID).Scan(&count); err != nil {
		return nil, err
	}
	if count >= maximumDataGatewayReplays {
		return nil, ErrDataGatewayReplayCapacity
	}
	if policy.Attempt != 1 {
		return nil, ErrDataGatewayReplayUnsafe
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO remote_data_mutation_replays (execution_id, document_id, operation_id, invocation_id, request_hash, status, attempt, maximum_attempts)
VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
ON CONFLICT (execution_id, document_id, operation_id, invocation_id) DO NOTHING`, key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID, requestHash, policy.Attempt, policy.MaximumAttempts)
	if err != nil {
		return nil, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}
	if rows == 1 {
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return &DataGatewayMutationReplayClaim{Acquired: true}, nil
	}
	err = tx.QueryRowContext(ctx, `SELECT request_hash, status, result_json, attempt, maximum_attempts
FROM remote_data_mutation_replays
WHERE execution_id = $1 AND document_id = $2 AND operation_id = $3 AND invocation_id = $4`, key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID).Scan(&storedHash, &status, &storedResult, &storedAttempt, &storedMaximumAttempts)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrDataGatewayReplayConflict
	}
	if err != nil {
		return nil, err
	}
	return resolveDataGatewayMutationReplayClaim(key, requestHash, policy, storedHash, status, storedResult, storedAttempt, storedMaximumAttempts)
}

func (store *Store) CompleteDataGatewayMutation(ctx context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64, result DataGatewayResult) error {
	if !validDataGatewayMutationReplayKey(key) || !validDataGatewayRequestHash(requestHash) || attempt < 1 || attempt > maximumDataGatewayRetryAttempts {
		return ErrDataGatewayReplayConflict
	}
	contents, err := json.Marshal(result)
	if err != nil {
		return err
	}
	if _, err := decodeDataGatewayReplayResult(contents, key, attempt); err != nil {
		return err
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	updated, err := store.db.ExecContext(ctx, `UPDATE remote_data_mutation_replays
SET status = 'succeeded', result_json = $6, updated_at = NOW()
WHERE execution_id = $1 AND document_id = $2 AND operation_id = $3 AND invocation_id = $4 AND request_hash = $5 AND status = 'pending' AND attempt = $7`, key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID, requestHash, contents, attempt)
	if err != nil {
		return err
	}
	rows, err := updated.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrDataGatewayReplayConflict
	}
	return nil
}

// ReleaseDataGatewayMutationRetry permits exactly the next attempt after a retryable upstream outcome.
func (store *Store) ReleaseDataGatewayMutationRetry(ctx context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64) error {
	if !validDataGatewayMutationReplayKey(key) || !validDataGatewayRequestHash(requestHash) || attempt < 1 || attempt > maximumDataGatewayRetryAttempts {
		return ErrDataGatewayReplayConflict
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	updated, err := store.db.ExecContext(ctx, `UPDATE remote_data_mutation_replays
SET status = 'retryable', result_json = NULL, updated_at = NOW()
WHERE execution_id = $1 AND document_id = $2 AND operation_id = $3 AND invocation_id = $4 AND request_hash = $5 AND attempt = $6 AND attempt < maximum_attempts AND status IN ('pending', 'retryable')`, key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID, requestHash, attempt)
	if err != nil {
		return err
	}
	rows, err := updated.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrDataGatewayReplayConflict
	}
	return nil
}

// FenceDataGatewayMutation permanently blocks automatic replay when an effect outcome is not durably known.
func (store *Store) FenceDataGatewayMutation(ctx context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64) error {
	if !validDataGatewayMutationReplayKey(key) || !validDataGatewayRequestHash(requestHash) || attempt < 1 || attempt > maximumDataGatewayRetryAttempts {
		return ErrDataGatewayReplayConflict
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	updated, err := store.db.ExecContext(ctx, `UPDATE remote_data_mutation_replays
SET status = 'indeterminate', result_json = NULL, updated_at = NOW()
WHERE execution_id = $1 AND document_id = $2 AND operation_id = $3 AND invocation_id = $4 AND request_hash = $5 AND attempt = $6 AND status IN ('pending', 'indeterminate')`, key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID, requestHash, attempt)
	if err != nil {
		return err
	}
	rows, err := updated.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrDataGatewayReplayConflict
	}
	return nil
}
