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
	return repository.appendTransition(ctx, workspaceID, authority, nil, nil, nextRunFactBytes, eventFactBytes)
}

func (repository *Repository) AppendRuntimeTransition(ctx context.Context, workspaceID string, guard RuntimeLeaseGuard, nextRunFactBytes, eventFactBytes []byte) (RunRecord, bool, error) {
	if guard.Clock == nil {
		return RunRecord{}, false, ErrUnauthorized
	}
	return repository.appendTransition(ctx, workspaceID, guard.Authority, &guard, nil, nextRunFactBytes, eventFactBytes)
}

type runtimeBootstrapExpectation struct {
	Cursor    int64
	Digest    string
	Kind      string
	CommandID string
}

// BootstrapRuntimeRun admits the sole trusted, lease-free first attempt. All
// later transitions require the generation-bound Run lease.
func (repository *Repository) BootstrapRuntimeRun(ctx context.Context, workspaceID string, expectedCursor int64, expectedDigest string, nextRunFactBytes, eventFactBytes []byte) (RunRecord, bool, error) {
	if expectedCursor != 1 || !canonicalDigestPattern.MatchString(expectedDigest) {
		return RunRecord{}, false, ErrInvalid
	}
	return repository.appendTransition(ctx, workspaceID, RunLeaseAuthority{}, nil, &runtimeBootstrapExpectation{Cursor: expectedCursor, Digest: expectedDigest, Kind: "start"}, nextRunFactBytes, eventFactBytes)
}

func (repository *Repository) CancelRuntimeRun(ctx context.Context, workspaceID, runID, commandID string, expectedCursor int64, expectedDigest string, nextRunFactBytes, eventFactBytes []byte) (RunRecord, bool, error) {
	if expectedCursor < 1 || commandID == "" || !canonicalDigestPattern.MatchString(expectedDigest) {
		return RunRecord{}, false, ErrInvalid
	}
	next, err := decodeRunFact(nextRunFactBytes)
	if err != nil {
		return RunRecord{}, false, err
	}
	if next.RunID != runID {
		return RunRecord{}, false, ErrUnauthorized
	}
	return repository.appendTransition(ctx, workspaceID, RunLeaseAuthority{}, nil, &runtimeBootstrapExpectation{Cursor: expectedCursor, Digest: expectedDigest, Kind: "cancel", CommandID: commandID}, nextRunFactBytes, eventFactBytes)
}

func (repository *Repository) appendTransition(ctx context.Context, workspaceID string, authority RunLeaseAuthority, guard *RuntimeLeaseGuard, bootstrap *runtimeBootstrapExpectation, nextRunFactBytes, eventFactBytes []byte) (RunRecord, bool, error) {
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
	if guard != nil || bootstrap != nil {
		producer, ok := objectMember(event.Value, "producer")
		if !ok || stringMember(producer, "kind") != "service" || stringMember(producer, "principalId") != RuntimePrincipalID {
			return RunRecord{}, false, ErrUnauthorized
		}
	}
	if bootstrap != nil && bootstrap.Kind == "start" && (event.Type != "run.started" || event.Generation != 1 || next.Generation != 1 || next.CallbackAuthority != "active" || next.Phase != "preparing") {
		return RunRecord{}, false, ErrUnauthorized
	}
	if bootstrap != nil && bootstrap.Kind == "cancel" {
		allowed := event.Type == "run.cancel-requested" || event.Type == "cleanup.acknowledged" || (event.Type == "run.terminal" && next.Outcome == "cancelled")
		if !allowed || (next.Phase != "cancelling" && next.Phase != "terminal") || next.CallbackAuthority != "revoked" {
			return RunRecord{}, false, ErrUnauthorized
		}
	}
	if guard != nil && event.Type == "run.cancel-requested" {
		return RunRecord{}, false, ErrUnauthorized
	}
	next.WorkspaceID = workspaceID
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return RunRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if bootstrap != nil {
		var id string
		if err := tx.QueryRowContext(ctx, `SELECT id FROM workspaces WHERE id=$1 FOR SHARE`, workspaceID).Scan(&id); errors.Is(err, sql.ErrNoRows) {
			return RunRecord{}, false, ErrNotFound
		} else if err != nil {
			return RunRecord{}, false, err
		}
	}
	current, err := scanRunFactTx(ctx, tx, workspaceID, next.RunID)
	if err != nil {
		return RunRecord{}, false, err
	}
	if bootstrap != nil && bootstrap.Kind == "cancel" {
		var source []byte
		if err := tx.QueryRowContext(ctx, `SELECT command_bytes FROM agent_run_user_commands WHERE workspace_id=$1 AND command_id=$2 FOR SHARE`, workspaceID, bootstrap.CommandID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
			return RunRecord{}, false, ErrUnauthorized
		} else if err != nil {
			return RunRecord{}, false, err
		}
		command, err := decodeRunUserCommand(source)
		if err != nil {
			return RunRecord{}, false, err
		}
		if command.Kind != "cancel" || command.RunID != current.RunID || command.TaskID != current.TaskID || command.ExpectedGeneration+1 != next.Generation || event.OccurredAt.Before(command.RequestedAt) {
			return RunRecord{}, false, ErrUnauthorized
		}
		if event.Type == "run.cancel-requested" {
			if command.ExpectedSnapshotDigest != bootstrap.Digest {
				return RunRecord{}, false, ErrUnauthorized
			}
		} else {
			var matches bool
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_runtime_cancellations WHERE workspace_id=$1 AND run_id=$2 AND generation=$3 AND command_id=$4)`, workspaceID, current.RunID, next.Generation, command.CommandID).Scan(&matches); err != nil {
				return RunRecord{}, false, err
			}
			if !matches {
				return RunRecord{}, false, ErrUnauthorized
			}
		}
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
	if bootstrap != nil {
		if current.Cursor != bootstrap.Cursor || current.SnapshotDigest != bootstrap.Digest {
			return RunRecord{}, false, ErrConflict
		}
		if bootstrap.Kind == "start" {
			if current.Phase != "queued" || current.Generation != 0 || current.CallbackAuthority != "revoked" {
				return RunRecord{}, false, ErrConflict
			}
			if pending, err := hasPendingRuntimeCancellationTx(ctx, tx, workspaceID, current); err != nil {
				return RunRecord{}, false, err
			} else if pending {
				return RunRecord{}, false, ErrUnauthorized
			}
		} else if event.Type != "run.cancel-requested" && (current.Phase != "cancelling" || current.CallbackAuthority != "revoked") {
			return RunRecord{}, false, ErrUnauthorized
		}
	} else if guard != nil {
		if err := authorizeRuntimeLeaseTx(ctx, tx, workspaceID, next.RunID, guard, current); err != nil {
			return RunRecord{}, false, err
		}
	} else if err := authorizeRunLeaseTx(ctx, tx, workspaceID, next.RunID, authority, current); err != nil {
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
	if bootstrap != nil && bootstrap.Kind == "cancel" && event.Type == "cleanup.acknowledged" {
		var pending bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_runtime_verification_runs l
JOIN verification_runs v ON v.workspace_id=l.workspace_id AND v.id=l.verification_run_id
LEFT JOIN agent_runtime_g3_driver_jobs j ON j.workspace_id=l.workspace_id AND j.verification_run_id=l.verification_run_id
WHERE l.workspace_id=$1 AND l.agent_run_id=$2 AND
(v.status IN('queued','running','cancelling') OR (j.verification_run_id IS NOT NULL AND j.cleanup_receipt_bytes IS NULL)))`, workspaceID, current.RunID).Scan(&pending); err != nil {
			return RunRecord{}, false, err
		}
		if pending {
			return RunRecord{}, false, ErrUnauthorized
		}
	}
	if guard != nil {
		if err := authorizeRuntimeLeaseTx(ctx, tx, workspaceID, next.RunID, guard, current); err != nil {
			return RunRecord{}, false, err
		}
	}
	if err := insertEventTx(ctx, tx, workspaceID, event); err != nil {
		return RunRecord{}, false, err
	}
	if bootstrap != nil && bootstrap.Kind == "cancel" && event.Type == "run.cancel-requested" {
		if _, err := tx.ExecContext(ctx, `INSERT INTO agent_runtime_cancellations(workspace_id,run_id,generation,command_id,event_id,event_digest) VALUES($1,$2,$3,$4,$5,$6)`, workspaceID, current.RunID, next.Generation, bootstrap.CommandID, stringMember(event.Value, "eventId"), event.EventDigest); err != nil {
			return RunRecord{}, false, err
		}
	}
	result, err := tx.ExecContext(ctx, `UPDATE agent_runs
SET generation = $5::BIGINT, attempt = $6::BIGINT, phase = $7::TEXT, outcome = NULLIF($8::TEXT, ''),
	cursor = $9, callback_authority = $10, cleanup_state = $11,
	budget_revision = $12, latest_event_digest = NULLIF($13, ''),
	snapshot_digest = $14, snapshot_json = $15::jsonb, snapshot_bytes = $16,
	lease_generation = CASE WHEN $7::TEXT = 'terminal' OR lease_id IS NULL THEN NULL ELSE $5::BIGINT END,
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

func hasPendingRuntimeCancellationTx(ctx context.Context, tx *sql.Tx, workspaceID string, run runFact) (bool, error) {
	var pending bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_run_user_commands WHERE workspace_id=$1 AND run_id=$2 AND kind='cancel' AND expected_generation=$3 AND expected_snapshot_digest=$4)`, workspaceID, run.RunID, run.Generation, run.SnapshotDigest).Scan(&pending)
	return pending, err
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

func canonicalTime(value time.Time) time.Time {
	return value.UTC().Truncate(time.Millisecond)
}

func requiredDuration(start, end time.Time) error {
	if start.IsZero() || !end.After(start) {
		return fmt.Errorf("%w: lease interval must be positive", ErrInvalid)
	}
	return nil
}
