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
