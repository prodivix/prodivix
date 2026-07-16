package remoteexecution

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

var ErrExecutionNotFound = errors.New("remote execution not found")

type GrantStore interface {
	VerifyWorkspaceOwner(ctx context.Context, ownerID string, workspaceID string) error
	RecordExecution(ctx context.Context, ownerID string, workspaceID string, executionID string) error
	VerifyExecutionOwner(ctx context.Context, ownerID string, executionID string) error
}

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 5*time.Second)
}

func (store *Store) VerifyWorkspaceOwner(ctx context.Context, ownerID string, workspaceID string) error {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	var marker int
	err := store.db.QueryRowContext(ctx, `SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2`, strings.TrimSpace(workspaceID), strings.TrimSpace(ownerID)).Scan(&marker)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrExecutionNotFound
	}
	return err
}

func (store *Store) RecordExecution(ctx context.Context, ownerID string, workspaceID string, executionID string) error {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	result, err := store.db.ExecContext(ctx, `INSERT INTO remote_execution_grants (execution_id, workspace_id, owner_id)
VALUES ($1, $2, $3)
ON CONFLICT (execution_id) DO UPDATE SET execution_id = EXCLUDED.execution_id
WHERE remote_execution_grants.workspace_id = EXCLUDED.workspace_id AND remote_execution_grants.owner_id = EXCLUDED.owner_id`, strings.TrimSpace(executionID), strings.TrimSpace(workspaceID), strings.TrimSpace(ownerID))
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrExecutionNotFound
	}
	return nil
}

func (store *Store) VerifyExecutionOwner(ctx context.Context, ownerID string, executionID string) error {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	var marker int
	err := store.db.QueryRowContext(ctx, `SELECT 1 FROM remote_execution_grants WHERE execution_id = $1 AND owner_id = $2`, strings.TrimSpace(executionID), strings.TrimSpace(ownerID)).Scan(&marker)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrExecutionNotFound
	}
	return err
}
