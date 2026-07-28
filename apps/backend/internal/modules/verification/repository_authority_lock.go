package verification

import (
	"context"
	"database/sql"
	"errors"
)

const (
	authorityLockCreate  = "promotion-create"
	authorityLockPrepare = "attestation-prepare"
	authorityLockCommit  = "evidence-commit"
)

// lockCurrentWorkspaceAuthorityTx serializes the final durable transition
// against every canonical Workspace commit. Canonical commits update and lock
// this root row, so a transaction either observes the exact Candidate root
// revision or completes before the next authority revision becomes current.
func (repository *Repository) lockCurrentWorkspaceAuthorityTx(
	ctx context.Context,
	tx *sql.Tx,
	operation string,
	promotion Promotion,
) error {
	if repository.workspaceAuthorityLockBarrier != nil {
		repository.workspaceAuthorityLockBarrier(operation, promotion.ID)
	}
	var projectID string
	var workspaceRevision int64
	var routeRevision int64
	var operationSequence int64
	err := tx.QueryRowContext(ctx, `SELECT project_id, workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR SHARE`, promotion.WorkspaceID).Scan(
		&projectID,
		&workspaceRevision,
		&routeRevision,
		&operationSequence,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return coded(
			"VER-5001",
			"Canonical Workspace authority is no longer available.",
			ErrConflict,
		)
	}
	if retryablePostgreSQLTransaction(err) {
		return coded(
			"VER-5001",
			"Canonical Workspace authority changed during the durable Evidence transition.",
			ErrConflict,
		)
	}
	if err != nil {
		return err
	}
	candidate := promotion.Candidate
	if candidate.WorkspaceID != promotion.WorkspaceID ||
		candidate.ProjectID != promotion.ProjectID ||
		projectID != promotion.ProjectID ||
		candidate.WorkspaceRevision != workspaceRevision ||
		candidate.PartitionRevisions.WorkspaceRev != workspaceRevision ||
		candidate.PartitionRevisions.RouteRev != routeRevision ||
		candidate.PartitionRevisions.OpSeq != operationSequence {
		return coded(
			"VER-5001",
			"Canonical Workspace authority changed before the durable Evidence transition.",
			ErrConflict,
		)
	}
	return nil
}
