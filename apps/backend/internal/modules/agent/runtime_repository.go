package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	backendworkspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
)

type RuntimeWorkItem struct {
	WorkspaceID string          `json:"workspaceId"`
	Task        json.RawMessage `json:"task"`
	Run         json.RawMessage `json:"run,omitempty"`
}

// Runtime work is service state; the context reader below uses the canonical
// Workspace owner instead of copying its persistence format into Agent rows.
func (repository *Repository) ListRuntimeWork(ctx context.Context, limit int, now time.Time) ([]RuntimeWorkItem, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	if limit < 1 || limit > 100 {
		return nil, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.db.QueryContext(ctx, `SELECT t.workspace_id, t.task_bytes, r.snapshot_bytes
FROM agent_tasks t
LEFT JOIN LATERAL (
 SELECT snapshot_bytes, phase, lease_expires_at FROM agent_runs
 WHERE workspace_id = t.workspace_id AND task_id = t.task_id
 ORDER BY created_at DESC, run_id COLLATE "C" DESC LIMIT 1
) r ON true
WHERE r.phase IS NULL OR (r.phase <> 'terminal' AND (r.lease_expires_at IS NULL OR r.lease_expires_at <= $1))
ORDER BY t.created_at, t.workspace_id COLLATE "C", t.task_id COLLATE "C" LIMIT $2`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]RuntimeWorkItem, 0)
	for rows.Next() {
		var item RuntimeWorkItem
		var taskBytes, runBytes []byte
		if err := rows.Scan(&item.WorkspaceID, &taskBytes, &runBytes); err != nil {
			return nil, err
		}
		if _, err := decodeTaskFact(taskBytes); err != nil {
			return nil, err
		}
		if len(runBytes) > 0 {
			if _, err := decodeRunFact(runBytes); err != nil {
				return nil, err
			}
		}
		item.Task, item.Run = taskBytes, runBytes
		items = append(items, item)
	}
	return items, rows.Err()
}

func (repository *Repository) RuntimeContext(ctx context.Context, workspaceID, taskID string) (TaskRecord, any, error) {
	task, err := repository.GetTask(ctx, workspaceID, taskID)
	if err != nil {
		return TaskRecord{}, nil, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var ownerID string
	if err := repository.db.QueryRowContext(ctx, `SELECT owner_id FROM workspaces WHERE id = $1 AND project_id = $2`, workspaceID, task.ProjectID).Scan(&ownerID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return TaskRecord{}, nil, ErrNotFound
		}
		return TaskRecord{}, nil, err
	}
	snapshot, err := backendworkspace.NewWorkspaceStore(repository.db).GetSnapshotForOwner(ctx, ownerID, workspaceID)
	if err != nil {
		return TaskRecord{}, nil, err
	}
	return task, backendworkspace.BuildSnapshotResponse(snapshot), nil
}

func (repository *Repository) FindTaskRun(ctx context.Context, authority PrincipalAuthority, taskID string) (string, error) {
	if err := repository.available(); err != nil {
		return "", err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return "", err
	}
	task, err := loadTaskTx(ctx, tx, authority.WorkspaceID, taskID)
	if err != nil {
		return "", err
	}
	if task.ProjectID != authority.ProjectID {
		return "", ErrUnauthorized
	}
	var runID string
	err = tx.QueryRowContext(ctx, `SELECT run_id FROM agent_runs WHERE workspace_id = $1 AND task_id = $2 ORDER BY created_at DESC, run_id COLLATE "C" DESC LIMIT 1`, authority.WorkspaceID, taskID).Scan(&runID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return runID, nil
}
