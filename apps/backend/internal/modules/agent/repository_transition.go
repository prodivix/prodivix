package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type RunLeaseAuthority struct {
	LeaseID    string
	HolderID   string
	Generation int64
	ObservedAt time.Time
}

func (repository *Repository) AppendTransition(
	ctx context.Context,
	workspaceID string,
	authority RunLeaseAuthority,
	nextRunFactBytes []byte,
	eventFactBytes []byte,
) (RunRecord, bool, error) {
	if err := repository.available(); err != nil {
		return RunRecord{}, false, err
	}
	next, err := decodeRunFact(nextRunFactBytes)
	if err != nil {
		return RunRecord{}, false, err
	}
	event, err := decodeEventFact(eventFactBytes)
	if err != nil {
		return RunRecord{}, false, err
	}
	next.WorkspaceID = workspaceID
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return RunRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	current, err := scanRunFactTx(ctx, tx, workspaceID, next.RunID)
	if err != nil {
		return RunRecord{}, false, err
	}
	if replay, found, err := findEventReplayTx(
		ctx, tx, workspaceID, next.RunID, event, next.Canonical, current.Canonical,
	); err != nil {
		return RunRecord{}, false, err
	} else if found {
		if err := tx.Commit(); err != nil {
			return RunRecord{}, false, err
		}
		return replay, true, nil
	}
	if err := authorizeRunLeaseTx(ctx, tx, workspaceID, next.RunID, authority, current); err != nil {
		return RunRecord{}, false, err
	}
	task, err := loadTaskTx(ctx, tx, workspaceID, current.TaskID)
	if err != nil {
		return RunRecord{}, false, err
	}
	if err := validateRunTransition(task.Mode, current, next, event); err != nil {
		return RunRecord{}, false, err
	}
	if task.Mode == "apply" && event.Type == "run.terminal" && next.Outcome == "succeeded" {
		if err := validateApplySuccessLedgerTx(ctx, tx, workspaceID, current.TaskID, current.RunID, event); err != nil {
			return RunRecord{}, false, err
		}
	}
	if err := insertEventTx(ctx, tx, workspaceID, event); err != nil {
		return RunRecord{}, false, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE agent_runs
SET generation = $5::BIGINT, attempt = $6::BIGINT, phase = $7::TEXT, outcome = NULLIF($8::TEXT, ''),
	cursor = $9, callback_authority = $10, cleanup_state = $11,
	budget_revision = $12, latest_event_digest = NULLIF($13, ''),
	snapshot_digest = $14, snapshot_json = $15::jsonb, snapshot_bytes = $16,
	lease_generation = CASE WHEN $7::TEXT = 'terminal' THEN NULL ELSE $5::BIGINT END,
	lease_id = CASE WHEN $7::TEXT = 'terminal' THEN NULL ELSE lease_id END,
	lease_holder_id = CASE WHEN $7::TEXT = 'terminal' THEN NULL ELSE lease_holder_id END,
	lease_expires_at = CASE WHEN $7::TEXT = 'terminal' THEN NULL ELSE lease_expires_at END,
	updated_at = $17
WHERE workspace_id = $1 AND run_id = $2 AND cursor = $3 AND snapshot_digest = $4`,
		workspaceID, next.RunID, current.Cursor, current.SnapshotDigest,
		next.Generation, next.Attempt, next.Phase, next.Outcome, next.Cursor,
		next.CallbackAuthority, next.CleanupState, next.BudgetRevision,
		next.LatestEventDigest, next.SnapshotDigest, string(next.Canonical),
		next.Canonical, next.UpdatedAt,
	)
	if err != nil {
		return RunRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		if err != nil {
			return RunRecord{}, false, err
		}
		return RunRecord{}, false, ErrConflict
	}
	if err := syncRunProjectionTx(ctx, tx, next); err != nil {
		return RunRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return RunRecord{}, false, err
	}
	return runRecord(next), false, nil
}

func findEventReplayTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	runID string,
	event eventFact,
	nextBytes []byte,
	currentBytes []byte,
) (RunRecord, bool, error) {
	var storedEvent []byte
	err := tx.QueryRowContext(ctx, `SELECT event_bytes
FROM agent_run_events
WHERE workspace_id = $1 AND run_id = $2 AND idempotency_key = $3
FOR SHARE`, workspaceID, runID, event.IdempotencyKey).Scan(&storedEvent)
	if errors.Is(err, sql.ErrNoRows) {
		var reused int
		err = tx.QueryRowContext(ctx, `SELECT 1
FROM agent_run_events
WHERE workspace_id = $1 AND run_id = $2 AND event_id = $3
FOR SHARE`, workspaceID, runID, stringMember(event.Value, "eventId")).Scan(&reused)
		if errors.Is(err, sql.ErrNoRows) {
			return RunRecord{}, false, nil
		}
		if err != nil {
			return RunRecord{}, false, err
		}
		return RunRecord{}, false, conflict("Agent event id was reused")
	}
	if err != nil {
		return RunRecord{}, false, err
	}
	if !bytes.Equal(storedEvent, event.Canonical) {
		return RunRecord{}, false, conflict("Agent event idempotency key was reused with different input")
	}
	if !bytes.Equal(nextBytes, currentBytes) {
		return RunRecord{}, false, conflict("idempotent event replay supplied a different resulting snapshot")
	}
	current, err := decodeRunFact(currentBytes)
	if err != nil {
		return RunRecord{}, false, err
	}
	current.WorkspaceID = workspaceID
	return runRecord(current), true, nil
}

func authorizeRunLeaseTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	runID string,
	authority RunLeaseAuthority,
	current runFact,
) error {
	if authority.LeaseID == "" || authority.HolderID == "" || authority.ObservedAt.IsZero() ||
		authority.Generation != current.Generation {
		return ErrUnauthorized
	}
	var leaseID, holderID sql.NullString
	var leaseGeneration sql.NullInt64
	var expiresAt sql.NullTime
	if err := tx.QueryRowContext(ctx, `SELECT lease_id, lease_holder_id, lease_generation, lease_expires_at
FROM agent_runs WHERE workspace_id = $1 AND run_id = $2`, workspaceID, runID).
		Scan(&leaseID, &holderID, &leaseGeneration, &expiresAt); err != nil {
		return err
	}
	observedAt := authority.ObservedAt.UTC()
	if !leaseID.Valid || !holderID.Valid || !leaseGeneration.Valid || !expiresAt.Valid ||
		leaseID.String != authority.LeaseID || holderID.String != authority.HolderID ||
		leaseGeneration.Int64 != authority.Generation || !expiresAt.Time.After(observedAt) {
		return ErrUnauthorized
	}
	return nil
}

func syncRunProjectionTx(ctx context.Context, tx *sql.Tx, run runFact) error {
	if err := syncAttemptsTx(ctx, tx, run); err != nil {
		return err
	}
	if err := syncPendingOperationTx(ctx, tx, run); err != nil {
		return err
	}
	if err := fenceSupersededOperationDispatchTx(ctx, tx, run); err != nil {
		return err
	}
	return syncBudgetReservationsTx(ctx, tx, run)
}

func fenceSupersededOperationDispatchTx(ctx context.Context, tx *sql.Tx, run runFact) error {
	_, err := tx.ExecContext(ctx, `UPDATE agent_run_operations
SET dispatch_state = 'reconciliation-required', dispatch_lease_id = NULL,
	dispatch_holder_id = NULL, dispatch_lease_expires_at = NULL
WHERE workspace_id = $1 AND run_id = $2 AND (generation < $3 OR $4 = 'terminal')
	AND state = 'started'
	AND dispatch_state IN ('ready', 'claimed', 'dispatched')`,
		run.WorkspaceID, run.RunID, run.Generation, run.Phase,
	)
	return err
}

func syncAttemptsTx(ctx context.Context, tx *sql.Tx, run runFact) error {
	attempts, ok := arrayMember(run.Value, "attempts")
	if !ok {
		return invalid("Run attempts are missing")
	}
	for _, raw := range attempts {
		attempt, err := requireObject(raw, "attempt")
		if err != nil {
			return err
		}
		attemptNumber, ok := integerMember(attempt, "attempt")
		if !ok {
			return ErrInvalid
		}
		generation, ok := integerMember(attempt, "generation")
		if !ok {
			return ErrInvalid
		}
		startedAt, err := instantMember(attempt, "startedAt")
		if err != nil {
			return err
		}
		var completedAt any
		if stringMember(attempt, "completedAt") != "" {
			parsed, err := instantMember(attempt, "completedAt")
			if err != nil {
				return err
			}
			completedAt = parsed
		}
		attemptJSON, err := canonicalMember(attempt)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO agent_run_attempts (
		workspace_id, run_id, attempt, recorded_sequence, attempt_id, generation,
		parent_attempt_id, reason, outcome, failure_digest, attempt_digest,
		attempt_json, started_at, completed_at
	) VALUES (
		$1, $2, $3, $4, $5, $6,
		NULLIF($7, ''), $8, NULLIF($9, ''), NULLIF($10, ''), $11,
		$12::jsonb, $13, $14
	) ON CONFLICT (workspace_id, run_id, attempt_digest) DO NOTHING`,
			run.WorkspaceID, run.RunID, attemptNumber, run.Cursor,
			stringMember(attempt, "attemptId"), generation,
			stringMember(attempt, "parentAttemptId"), stringMember(attempt, "reason"),
			stringMember(attempt, "outcome"), stringMember(attempt, "failureDigest"),
			stringMember(attempt, "attemptDigest"), string(attemptJSON), startedAt,
			completedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func syncPendingOperationTx(ctx context.Context, tx *sql.Tx, run runFact) error {
	operation, exists := objectMember(run.Value, "pendingOperation")
	if !exists {
		return nil
	}
	operationID := stringMember(operation, "operationId")
	generation, ok := integerMember(operation, "generation")
	if !ok {
		return ErrInvalid
	}
	startedAt, err := instantMember(operation, "startedAt")
	if err != nil {
		return err
	}
	var settledAt any
	if stringMember(operation, "settledAt") != "" {
		parsed, err := instantMember(operation, "settledAt")
		if err != nil {
			return err
		}
		settledAt = parsed
	}
	var existing struct {
		kind, key, request, state, callback, digest string
		generation                                  int64
	}
	err = tx.QueryRowContext(ctx, `SELECT kind, idempotency_key, request_digest,
	generation, state, callback_authority, operation_digest
FROM agent_run_operations
WHERE workspace_id = $1 AND run_id = $2 AND operation_id = $3
FOR UPDATE`, run.WorkspaceID, run.RunID, operationID).Scan(
		&existing.kind, &existing.key, &existing.request, &existing.generation,
		&existing.state, &existing.callback, &existing.digest,
	)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = tx.ExecContext(ctx, `INSERT INTO agent_run_operations (
			workspace_id, run_id, operation_id, kind, idempotency_key,
			request_digest, generation, state, callback_authority, dispatch_state,
			result_digest, operation_digest, started_at, settled_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
			CASE $8 WHEN 'started' THEN 'ready' WHEN 'settled' THEN 'settled'
				WHEN 'cancelled' THEN 'cancelled' ELSE 'reconciliation-required' END,
			NULLIF($10, ''), $11, $12, $13)`,
			run.WorkspaceID, run.RunID, operationID, stringMember(operation, "kind"),
			stringMember(operation, "idempotencyKey"), stringMember(operation, "requestDigest"),
			generation, stringMember(operation, "state"), stringMember(operation, "callbackAuthority"),
			stringMember(operation, "resultDigest"), stringMember(operation, "operationDigest"),
			startedAt, settledAt,
		)
		return err
	}
	if err != nil {
		return err
	}
	if existing.kind != stringMember(operation, "kind") ||
		existing.key != stringMember(operation, "idempotencyKey") ||
		existing.request != stringMember(operation, "requestDigest") ||
		existing.generation != generation {
		return conflict("operation identity changed after it was recorded")
	}
	if existing.digest == stringMember(operation, "operationDigest") {
		return nil
	}
	if existing.state != "started" || stringMember(operation, "state") == "started" {
		return conflict("operation lifecycle was rewritten")
	}
	result, err := tx.ExecContext(ctx, `UPDATE agent_run_operations
SET state = $4, callback_authority = $5,
	dispatch_state = CASE $4 WHEN 'settled' THEN 'settled'
		WHEN 'cancelled' THEN 'cancelled' ELSE 'reconciliation-required' END,
	dispatch_lease_id = NULL, dispatch_holder_id = NULL,
	dispatch_lease_expires_at = NULL, result_digest = NULLIF($6, ''),
	operation_digest = $7, settled_at = $8
WHERE workspace_id = $1 AND run_id = $2 AND operation_id = $3
	AND state = 'started' AND operation_digest = $9`,
		run.WorkspaceID, run.RunID, operationID,
		stringMember(operation, "state"), stringMember(operation, "callbackAuthority"),
		stringMember(operation, "resultDigest"), stringMember(operation, "operationDigest"),
		settledAt, existing.digest,
	)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows != 1 {
		return ErrConflict
	}
	return nil
}

func syncBudgetReservationsTx(ctx context.Context, tx *sql.Tx, run runFact) error {
	ledger, ok := objectMember(run.Value, "budgetLedger")
	if !ok {
		return ErrInvalid
	}
	reservations, ok := arrayMember(ledger, "reservations")
	if !ok {
		return ErrInvalid
	}
	for _, raw := range reservations {
		reservation, err := requireObject(raw, "budget reservation")
		if err != nil {
			return err
		}
		demand, ok := objectMember(reservation, "demand")
		if !ok {
			return ErrInvalid
		}
		demandBytes, err := canonicalMember(demand)
		if err != nil {
			return err
		}
		reservedAt, err := instantMember(reservation, "reservedAt")
		if err != nil {
			return err
		}
		reservationID := stringMember(reservation, "reservationId")
		var existingDemand, existingStatus string
		var existingSettlement sql.NullString
		err = tx.QueryRowContext(ctx, `SELECT demand_digest, status, settlement_digest
FROM agent_budget_reservations
WHERE workspace_id = $1 AND run_id = $2 AND reservation_id = $3
FOR UPDATE`, run.WorkspaceID, run.RunID, reservationID).Scan(
			&existingDemand, &existingStatus, &existingSettlement,
		)
		if errors.Is(err, sql.ErrNoRows) {
			if stringMember(reservation, "status") == "settled" {
				return conflict("budget reservation cannot appear already settled")
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO agent_budget_reservations (
				workspace_id, run_id, reservation_id, demand_digest, demand_json,
				status, reserved_at
			) VALUES ($1, $2, $3, $4, $5::jsonb, 'reserved', $6)`,
				run.WorkspaceID, run.RunID, reservationID,
				stringMember(reservation, "demandDigest"), string(demandBytes), reservedAt,
			); err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if existingDemand != stringMember(reservation, "demandDigest") {
			return conflict("budget reservation demand drifted")
		}
		if stringMember(reservation, "status") == "reserved" {
			if existingStatus != "reserved" {
				return conflict("settled budget reservation cannot reopen")
			}
			continue
		}
		settlement, ok := objectMember(reservation, "settlement")
		if !ok {
			return ErrInvalid
		}
		settlementDigest := stringMember(settlement, "settlementDigest")
		if existingStatus == "settled" {
			if !existingSettlement.Valid || existingSettlement.String != settlementDigest {
				return conflict("budget reservation settlement drifted")
			}
			continue
		}
		settledAt, err := instantMember(settlement, "settledAt")
		if err != nil {
			return err
		}
		settlementBytes, err := canonicalMember(settlement)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE agent_budget_reservations
SET status = 'settled', settlement_digest = $4, settlement_json = $5::jsonb,
	reconciliation_reason = NULLIF($6, ''), settled_at = $7
WHERE workspace_id = $1 AND run_id = $2 AND reservation_id = $3 AND status = 'reserved'`,
			run.WorkspaceID, run.RunID, reservationID, settlementDigest,
			string(settlementBytes), stringMember(settlement, "reconciliationReason"), settledAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func canonicalTime(value time.Time) time.Time {
	return value.UTC().Truncate(time.Millisecond)
}

func requiredDuration(start, end time.Time) error {
	if start.IsZero() || !end.After(start) {
		return fmt.Errorf("%w: lease interval must be positive", ErrInvalid)
	}
	return nil
}
