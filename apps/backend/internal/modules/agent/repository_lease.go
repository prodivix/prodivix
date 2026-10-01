package agent

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type RunLease struct {
	WorkspaceID string
	RunID       string
	LeaseID     string
	HolderID    string
	Generation  int64
	AcquiredAt  time.Time
	ExpiresAt   time.Time
}

type OperationDispatchClaim struct {
	WorkspaceID            string
	RunID                  string
	OperationID            string
	Generation             int64
	LeaseID                string
	HolderID               string
	ExpiresAt              time.Time
	DispatchState          string
	ReconciliationRequired bool
	Replayed               bool
}

func (repository *Repository) ClaimRun(
	ctx context.Context,
	workspaceID string,
	runID string,
	leaseID string,
	holderID string,
	expectedGeneration int64,
	observedAt time.Time,
	expiresAt time.Time,
) (RunLease, bool, error) {
	return repository.claimRun(ctx, workspaceID, runID, leaseID, holderID, expectedGeneration, observedAt, expiresAt, nil)
}

func (repository *Repository) RuntimeClaimRun(ctx context.Context, workspaceID, runID, leaseID, holderID string, expectedGeneration int64, expiresAt time.Time, clock func() time.Time) (RunLease, bool, error) {
	if clock == nil || expectedGeneration < 1 {
		return RunLease{}, false, ErrUnauthorized
	}
	return repository.claimRun(ctx, workspaceID, runID, leaseID, holderID, expectedGeneration, clock(), expiresAt, clock)
}

func (repository *Repository) claimRun(ctx context.Context, workspaceID, runID, leaseID, holderID string, expectedGeneration int64, observedAt, expiresAt time.Time, clock func() time.Time) (RunLease, bool, error) {
	if err := repository.available(); err != nil {
		return RunLease{}, false, err
	}
	observedAt = canonicalTime(observedAt)
	expiresAt = canonicalTime(expiresAt)
	if workspaceID == "" || runID == "" || leaseID == "" || holderID == "" ||
		expectedGeneration < 0 || requiredDuration(observedAt, expiresAt) != nil {
		return RunLease{}, false, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return RunLease{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var generation int64
	var phase string
	var currentID, currentHolder sql.NullString
	var currentGeneration sql.NullInt64
	var currentExpiry sql.NullTime
	err = tx.QueryRowContext(ctx, `SELECT generation, phase,
	lease_id, lease_holder_id, lease_generation, lease_expires_at
FROM agent_runs
WHERE workspace_id = $1 AND run_id = $2
FOR UPDATE`, workspaceID, runID).Scan(
		&generation, &phase, &currentID, &currentHolder, &currentGeneration, &currentExpiry,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return RunLease{}, false, ErrNotFound
	}
	if err != nil {
		return RunLease{}, false, err
	}
	if clock != nil {
		observedAt = canonicalTime(clock())
		if requiredRuntimeLeaseDuration(observedAt, expiresAt) != nil {
			return RunLease{}, false, ErrInvalid
		}
		var callback string
		if err := tx.QueryRowContext(ctx, `SELECT callback_authority FROM agent_runs WHERE workspace_id=$1 AND run_id=$2`, workspaceID, runID).Scan(&callback); err != nil {
			return RunLease{}, false, err
		}
		if callback != "active" || phase == "queued" || phase == "cancelling" {
			return RunLease{}, false, ErrUnauthorized
		}
		run, err := scanRunFactTx(ctx, tx, workspaceID, runID)
		if err != nil {
			return RunLease{}, false, err
		}
		if pending, err := hasPendingRuntimeCancellationTx(ctx, tx, workspaceID, run); err != nil {
			return RunLease{}, false, err
		} else if pending {
			return RunLease{}, false, ErrUnauthorized
		}
	}
	if phase == "terminal" {
		return RunLease{}, false, ErrTerminal
	}
	if generation != expectedGeneration {
		return RunLease{}, false, ErrUnauthorized
	}
	lease := RunLease{
		WorkspaceID: workspaceID, RunID: runID, LeaseID: leaseID,
		HolderID: holderID, Generation: generation,
		AcquiredAt: observedAt, ExpiresAt: expiresAt,
	}
	if currentID.Valid && currentExpiry.Valid && currentExpiry.Time.After(observedAt) {
		if currentID.String == leaseID && currentHolder.String == holderID &&
			currentGeneration.Int64 == generation && currentExpiry.Time.Equal(expiresAt) {
			if err := tx.Commit(); err != nil {
				return RunLease{}, false, err
			}
			return lease, true, nil
		}
		return RunLease{}, false, ErrLeaseBusy
	}
	if _, err := tx.ExecContext(ctx, `UPDATE agent_runs
SET lease_id = $3, lease_holder_id = $4, lease_generation = $5,
	lease_expires_at = $6
WHERE workspace_id = $1 AND run_id = $2 AND generation = $5 AND phase <> 'terminal'`,
		workspaceID, runID, leaseID, holderID, generation, expiresAt,
	); err != nil {
		return RunLease{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return RunLease{}, false, err
	}
	return lease, false, nil
}

func (repository *Repository) RenewRunLease(
	ctx context.Context,
	authority RunLeaseAuthority,
	workspaceID string,
	runID string,
	expiresAt time.Time,
) (RunLease, error) {
	if err := repository.available(); err != nil {
		return RunLease{}, err
	}
	authority.ObservedAt = canonicalTime(authority.ObservedAt)
	expiresAt = canonicalTime(expiresAt)
	if requiredDuration(authority.ObservedAt, expiresAt) != nil {
		return RunLease{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_runs
SET lease_expires_at = $7
WHERE workspace_id = $1 AND run_id = $2 AND lease_id = $3
	AND lease_holder_id = $4 AND lease_generation = $5
	AND lease_expires_at > $6 AND generation = $5 AND phase <> 'terminal'`,
		workspaceID, runID, authority.LeaseID, authority.HolderID,
		authority.Generation, authority.ObservedAt, expiresAt,
	)
	if err != nil {
		return RunLease{}, err
	}
	rows, _ := result.RowsAffected()
	if rows != 1 {
		return RunLease{}, ErrUnauthorized
	}
	return RunLease{
		WorkspaceID: workspaceID, RunID: runID, LeaseID: authority.LeaseID,
		HolderID: authority.HolderID, Generation: authority.Generation,
		AcquiredAt: authority.ObservedAt, ExpiresAt: expiresAt,
	}, nil
}

func requiredRuntimeLeaseDuration(start, end time.Time) error {
	if requiredDuration(start, end) != nil || end.Sub(start) > 10*time.Minute {
		return ErrInvalid
	}
	return nil
}

func (repository *Repository) RuntimeRenewRunLease(ctx context.Context, authority RunLeaseAuthority, workspaceID, runID string, expiresAt time.Time, clock func() time.Time) (RunLease, error) {
	if err := repository.available(); err != nil {
		return RunLease{}, err
	}
	if clock == nil || authority.Generation < 1 {
		return RunLease{}, ErrUnauthorized
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return RunLease{}, err
	}
	defer func() { _ = tx.Rollback() }()
	run, err := scanRunFactTx(ctx, tx, workspaceID, runID)
	if err != nil {
		return RunLease{}, err
	}
	if run.CallbackAuthority != "active" || run.Phase == "queued" || run.Phase == "cancelling" || run.Phase == "terminal" {
		return RunLease{}, ErrUnauthorized
	}
	authority.ObservedAt, expiresAt = canonicalTime(clock()), canonicalTime(expiresAt)
	if requiredRuntimeLeaseDuration(authority.ObservedAt, expiresAt) != nil {
		return RunLease{}, ErrInvalid
	}
	if err := authorizeRuntimeLeaseTx(ctx, tx, workspaceID, runID, &RuntimeLeaseGuard{Authority: authority, Clock: clock}, run); err != nil {
		return RunLease{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE agent_runs SET lease_expires_at=$3 WHERE workspace_id=$1 AND run_id=$2`, workspaceID, runID, expiresAt); err != nil {
		return RunLease{}, err
	}
	if err := tx.Commit(); err != nil {
		return RunLease{}, err
	}
	return RunLease{WorkspaceID: workspaceID, RunID: runID, LeaseID: authority.LeaseID, HolderID: authority.HolderID, Generation: authority.Generation, AcquiredAt: authority.ObservedAt, ExpiresAt: expiresAt}, nil
}

func (repository *Repository) ClaimOperationDispatch(
	ctx context.Context,
	workspaceID string,
	runID string,
	operationID string,
	leaseID string,
	holderID string,
	generation int64,
	observedAt time.Time,
	expiresAt time.Time,
) (OperationDispatchClaim, error) {
	return repository.claimOperationDispatch(ctx, workspaceID, runID, operationID, leaseID, holderID, generation, observedAt, expiresAt, nil)
}

func (repository *Repository) ClaimRuntimeOperationDispatch(ctx context.Context, workspaceID, runID, operationID, leaseID, holderID string, guard RuntimeLeaseGuard, expiresAt time.Time) (OperationDispatchClaim, error) {
	if guard.Clock == nil {
		return OperationDispatchClaim{}, ErrUnauthorized
	}
	return repository.claimOperationDispatch(ctx, workspaceID, runID, operationID, leaseID, holderID, guard.Authority.Generation, guard.Clock(), expiresAt, &guard)
}

func (repository *Repository) claimOperationDispatch(ctx context.Context, workspaceID, runID, operationID, leaseID, holderID string, generation int64, observedAt, expiresAt time.Time, guard *RuntimeLeaseGuard) (OperationDispatchClaim, error) {
	if err := repository.available(); err != nil {
		return OperationDispatchClaim{}, err
	}
	observedAt = canonicalTime(observedAt)
	expiresAt = canonicalTime(expiresAt)
	if workspaceID == "" || runID == "" || operationID == "" || leaseID == "" || holderID == "" ||
		generation < 0 || requiredDuration(observedAt, expiresAt) != nil {
		return OperationDispatchClaim{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return OperationDispatchClaim{}, err
	}
	defer func() { _ = tx.Rollback() }()
	// Lock the Run before its operation, matching transition projection order.
	if guard != nil {
		run, err := scanRunFactTx(ctx, tx, workspaceID, runID)
		if err != nil {
			return OperationDispatchClaim{}, err
		}
		if run.CallbackAuthority != "active" || run.Phase == "cancelling" || run.Phase == "terminal" {
			return OperationDispatchClaim{}, ErrUnauthorized
		}
		if err := authorizeRuntimeLeaseTx(ctx, tx, workspaceID, runID, guard, run); err != nil {
			return OperationDispatchClaim{}, err
		}
		observedAt = canonicalTime(guard.Clock())
		if requiredDuration(observedAt, expiresAt) != nil {
			return OperationDispatchClaim{}, ErrInvalid
		}
	}
	var runGeneration, operationGeneration int64
	var phase, operationState, dispatchState string
	var currentLease, currentHolder sql.NullString
	var currentExpiry sql.NullTime
	err = tx.QueryRowContext(ctx, `SELECT r.generation, r.phase, o.generation, o.state, o.dispatch_state,
	o.dispatch_lease_id, o.dispatch_holder_id, o.dispatch_lease_expires_at
FROM agent_run_operations o
JOIN agent_runs r ON r.workspace_id = o.workspace_id AND r.run_id = o.run_id
WHERE o.workspace_id = $1 AND o.run_id = $2 AND o.operation_id = $3
FOR UPDATE OF r, o`, workspaceID, runID, operationID).Scan(
		&runGeneration, &phase, &operationGeneration, &operationState, &dispatchState,
		&currentLease, &currentHolder, &currentExpiry,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return OperationDispatchClaim{}, ErrNotFound
	}
	if err != nil {
		return OperationDispatchClaim{}, err
	}
	if guard != nil {
		run, err := scanRunFactTx(ctx, tx, workspaceID, runID)
		if err != nil {
			return OperationDispatchClaim{}, err
		}
		if err := authorizeRuntimeLeaseTx(ctx, tx, workspaceID, runID, guard, run); err != nil {
			return OperationDispatchClaim{}, err
		}
		observedAt = canonicalTime(guard.Clock())
		if requiredDuration(observedAt, expiresAt) != nil {
			return OperationDispatchClaim{}, ErrInvalid
		}
	}
	if phase == "terminal" || operationState != "started" ||
		runGeneration != generation || operationGeneration != generation {
		return OperationDispatchClaim{}, ErrUnauthorized
	}
	claim := OperationDispatchClaim{
		WorkspaceID: workspaceID, RunID: runID, OperationID: operationID,
		Generation: generation, LeaseID: leaseID, HolderID: holderID,
		ExpiresAt: expiresAt, DispatchState: dispatchState,
	}
	switch dispatchState {
	case "ready":
		if _, err := tx.ExecContext(ctx, `UPDATE agent_run_operations
SET dispatch_state = 'claimed', dispatch_lease_id = $4,
	dispatch_holder_id = $5, dispatch_lease_expires_at = $6
WHERE workspace_id = $1 AND run_id = $2 AND operation_id = $3
	AND dispatch_state = 'ready'`, workspaceID, runID, operationID, leaseID, holderID, expiresAt); err != nil {
			return OperationDispatchClaim{}, err
		}
		claim.DispatchState = "claimed"
	case "claimed":
		if currentExpiry.Valid && currentExpiry.Time.After(observedAt) {
			if currentLease.String != leaseID || currentHolder.String != holderID ||
				!currentExpiry.Time.Equal(expiresAt) {
				return OperationDispatchClaim{}, ErrLeaseBusy
			}
			claim.DispatchState = "claimed"
			claim.Replayed = true
			break
		}
		if _, err := tx.ExecContext(ctx, `UPDATE agent_run_operations
SET dispatch_state = 'reconciliation-required', dispatch_lease_id = NULL,
	dispatch_holder_id = NULL, dispatch_lease_expires_at = NULL
WHERE workspace_id = $1 AND run_id = $2 AND operation_id = $3
	AND dispatch_state = 'claimed'`, workspaceID, runID, operationID); err != nil {
			return OperationDispatchClaim{}, err
		}
		claim.DispatchState = "reconciliation-required"
		claim.ReconciliationRequired = true
		claim.LeaseID = ""
		claim.HolderID = ""
		claim.ExpiresAt = time.Time{}
	case "dispatched", "reconciliation-required":
		claim.ReconciliationRequired = true
		claim.Replayed = true
		claim.LeaseID = ""
		claim.HolderID = ""
		claim.ExpiresAt = time.Time{}
	default:
		return OperationDispatchClaim{}, ErrUnauthorized
	}
	if err := tx.Commit(); err != nil {
		return OperationDispatchClaim{}, err
	}
	return claim, nil
}

func (repository *Repository) MarkOperationDispatched(
	ctx context.Context,
	claim OperationDispatchClaim,
	observedAt time.Time,
) (bool, error) {
	if err := repository.available(); err != nil {
		return false, err
	}
	observedAt = canonicalTime(observedAt)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_run_operations o
SET dispatch_state = 'dispatched', dispatch_lease_id = NULL,
	dispatch_holder_id = NULL, dispatch_lease_expires_at = NULL
FROM agent_runs r
WHERE o.workspace_id = $1 AND o.run_id = $2 AND o.operation_id = $3
	AND o.dispatch_state = 'claimed' AND o.dispatch_lease_id = $4
	AND o.dispatch_holder_id = $5 AND o.dispatch_lease_expires_at > $6
	AND r.workspace_id = o.workspace_id AND r.run_id = o.run_id
	AND r.generation = $7 AND r.phase <> 'terminal'`,
		claim.WorkspaceID, claim.RunID, claim.OperationID, claim.LeaseID,
		claim.HolderID, observedAt, claim.Generation,
	)
	if err != nil {
		return false, err
	}
	rows, _ := result.RowsAffected()
	if rows == 1 {
		return false, nil
	}
	var dispatchState string
	err = repository.db.QueryRowContext(ctx, `SELECT dispatch_state
FROM agent_run_operations
WHERE workspace_id = $1 AND run_id = $2 AND operation_id = $3`,
		claim.WorkspaceID, claim.RunID, claim.OperationID).Scan(&dispatchState)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotFound
	}
	if err != nil {
		return false, err
	}
	if dispatchState == "dispatched" {
		return true, nil
	}
	return false, ErrUnauthorized
}

func (repository *Repository) MarkRuntimeOperationDispatched(ctx context.Context, claim OperationDispatchClaim, guard RuntimeLeaseGuard) (bool, error) {
	if err := repository.available(); err != nil {
		return false, err
	}
	if guard.Clock == nil || claim.Generation != guard.Authority.Generation || claim.LeaseID == "" || claim.HolderID == "" {
		return false, ErrUnauthorized
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	run, err := scanRunFactTx(ctx, tx, claim.WorkspaceID, claim.RunID)
	if err != nil {
		return false, err
	}
	if run.CallbackAuthority != "active" || run.Phase == "cancelling" || run.Phase == "terminal" {
		return false, ErrUnauthorized
	}
	if err := authorizeRuntimeLeaseTx(ctx, tx, claim.WorkspaceID, claim.RunID, &guard, run); err != nil {
		return false, err
	}
	var state, operationState string
	var generation int64
	var leaseID, holderID sql.NullString
	var expiresAt sql.NullTime
	if err := tx.QueryRowContext(ctx, `SELECT dispatch_state, state, generation, dispatch_lease_id, dispatch_holder_id, dispatch_lease_expires_at
FROM agent_run_operations WHERE workspace_id = $1 AND run_id = $2 AND operation_id = $3 FOR UPDATE`, claim.WorkspaceID, claim.RunID, claim.OperationID).Scan(&state, &operationState, &generation, &leaseID, &holderID, &expiresAt); errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotFound
	} else if err != nil {
		return false, err
	}
	if generation != claim.Generation || operationState != "started" {
		return false, ErrUnauthorized
	}
	if state == "dispatched" {
		if err := tx.Commit(); err != nil {
			return false, err
		}
		return true, nil
	}
	observedAt := canonicalTime(guard.Clock())
	if state != "claimed" || !leaseID.Valid || !holderID.Valid || !expiresAt.Valid || leaseID.String != claim.LeaseID || holderID.String != claim.HolderID || !expiresAt.Time.After(observedAt) {
		return false, ErrUnauthorized
	}
	// Refresh the Run lease after the operation lock too: neither lock wait may
	// authorize a provider dispatch using a clock captured before acquisition.
	if err := authorizeRuntimeLeaseTx(ctx, tx, claim.WorkspaceID, claim.RunID, &guard, run); err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE agent_run_operations SET dispatch_state = 'dispatched', dispatch_lease_id = NULL, dispatch_holder_id = NULL, dispatch_lease_expires_at = NULL
WHERE workspace_id = $1 AND run_id = $2 AND operation_id = $3`, claim.WorkspaceID, claim.RunID, claim.OperationID); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return false, nil
}
