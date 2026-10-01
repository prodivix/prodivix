package agent

import (
	"context"
	"database/sql"
	"time"
)

type RuntimeLeaseGuard struct {
	Authority RunLeaseAuthority
	Clock     func() time.Time
}

func authorizeRuntimeLeaseTx(ctx context.Context, tx *sql.Tx, workspaceID, runID string, guard *RuntimeLeaseGuard, run runFact) error {
	if guard == nil {
		return nil
	}
	if guard.Clock == nil {
		return ErrUnauthorized
	}
	if run.CallbackAuthority != "active" || run.Phase == "queued" || run.Phase == "cancelling" || run.Phase == "terminal" {
		return ErrUnauthorized
	}
	authority := guard.Authority
	authority.ObservedAt = canonicalTime(guard.Clock())
	if err := authorizeRunLeaseTx(ctx, tx, workspaceID, runID, authority, run); err != nil {
		return err
	}
	pending, err := hasPendingRuntimeCancellationTx(ctx, tx, workspaceID, run)
	if err != nil {
		return err
	}
	if pending {
		return ErrUnauthorized
	}
	return nil
}
