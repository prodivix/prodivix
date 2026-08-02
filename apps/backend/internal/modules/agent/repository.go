package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const maximumAuditEvents = 1_000

type Repository struct {
	db *sql.DB
}

// PrincipalAuthority is populated from authenticated transport state, never
// from the Task payload itself.
type PrincipalAuthority struct {
	Kind        string
	PrincipalID string
	ProjectID   string
	WorkspaceID string
}

type TaskRecord struct {
	WorkspaceID string
	ProjectID   string
	TaskID      string
	TaskDigest  string
	Mode        string
	FactBytes   []byte
	CreatedAt   time.Time
}

type RunRecord struct {
	WorkspaceID       string
	TaskID            string
	RunID             string
	Generation        int64
	Attempt           int64
	Phase             string
	Outcome           string
	Cursor            int64
	CallbackAuthority string
	CleanupState      string
	BudgetRevision    int64
	SnapshotDigest    string
	FactBytes         []byte
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func NewRepository(database *sql.DB) *Repository {
	return &Repository{db: database}
}

func repositoryContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 10*time.Second)
}

func (repository *Repository) available() error {
	if repository == nil || repository.db == nil {
		return errors.New("agent control repository is unavailable")
	}
	return nil
}

func (repository *Repository) CreateTask(
	ctx context.Context,
	authority PrincipalAuthority,
	factBytes []byte,
) (TaskRecord, bool, error) {
	if err := repository.available(); err != nil {
		return TaskRecord{}, false, err
	}
	task, err := decodeTaskFact(factBytes)
	if err != nil {
		return TaskRecord{}, false, err
	}
	if authority.Kind != task.ActorKind || authority.PrincipalID != task.ActorID ||
		authority.ProjectID != task.ProjectID || authority.WorkspaceID != task.WorkspaceID ||
		(authority.Kind != "user" && authority.Kind != "service") {
		return TaskRecord{}, false, ErrUnauthorized
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return TaskRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var workspaceOwnerID string
	if err := tx.QueryRowContext(ctx, `SELECT owner_id
FROM workspaces
WHERE id = $1 AND project_id = $2
FOR SHARE`, task.WorkspaceID, task.ProjectID).Scan(&workspaceOwnerID); errors.Is(err, sql.ErrNoRows) {
		return TaskRecord{}, false, ErrNotFound
	} else if err != nil {
		return TaskRecord{}, false, err
	}
	if task.ActorKind == "user" && workspaceOwnerID != task.ActorID {
		return TaskRecord{}, false, ErrUnauthorized
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_tasks (
	workspace_id, task_id, project_id, actor_kind, actor_id, mode,
	idempotency_key, task_digest, policy_digest, task_json, task_bytes, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
ON CONFLICT DO NOTHING`,
		task.WorkspaceID, task.TaskID, task.ProjectID, task.ActorKind, task.ActorID,
		task.Mode, task.IdempotencyKey, task.TaskDigest, task.PolicyDigest,
		string(task.Canonical), task.Canonical, task.CreatedAt,
	)
	if err != nil {
		return TaskRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return TaskRecord{}, false, err
	}
	if rows == 0 {
		var existing []byte
		err := tx.QueryRowContext(ctx, `SELECT task_bytes
FROM agent_tasks
WHERE workspace_id = $1 AND actor_kind = $2 AND actor_id = $3 AND idempotency_key = $4
FOR SHARE`, task.WorkspaceID, task.ActorKind, task.ActorID, task.IdempotencyKey).Scan(&existing)
		if errors.Is(err, sql.ErrNoRows) {
			return TaskRecord{}, false, ErrConflict
		}
		if err != nil {
			return TaskRecord{}, false, err
		}
		if !bytes.Equal(existing, task.Canonical) {
			return TaskRecord{}, false, conflict("Task idempotency key was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return TaskRecord{}, false, err
		}
		return taskRecord(task), true, nil
	}
	if err := tx.Commit(); err != nil {
		return TaskRecord{}, false, err
	}
	return taskRecord(task), false, nil
}

func (repository *Repository) CreateRun(
	ctx context.Context,
	workspaceID string,
	runFactBytes []byte,
	eventFactBytes []byte,
) (RunRecord, bool, error) {
	if err := repository.available(); err != nil {
		return RunRecord{}, false, err
	}
	run, err := decodeRunFact(runFactBytes)
	if err != nil {
		return RunRecord{}, false, err
	}
	event, err := decodeEventFact(eventFactBytes)
	if err != nil {
		return RunRecord{}, false, err
	}
	run.WorkspaceID = workspaceID
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return RunRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	task, err := loadTaskTx(ctx, tx, workspaceID, run.TaskID)
	if err != nil {
		return RunRecord{}, false, err
	}
	if err := validateInitialRun(task, run, event); err != nil {
		return RunRecord{}, false, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_runs (
	workspace_id, run_id, task_id, task_digest,
	create_idempotency_key, create_request_digest,
	generation, attempt, phase, outcome, cursor, callback_authority,
	cleanup_state, budget_revision, latest_event_digest,
	snapshot_digest, snapshot_json, snapshot_bytes, created_at, updated_at
) VALUES (
	$1, $2, $3, $4, $5, $6,
	$7, $8, $9, NULLIF($10, ''), $11, $12,
	$13, $14, NULLIF($15, ''),
	$16, $17::jsonb, $18, $19, $20
)
ON CONFLICT DO NOTHING`,
		workspaceID, run.RunID, run.TaskID, run.TaskDigest,
		event.IdempotencyKey, event.RequestDigest,
		run.Generation, run.Attempt, run.Phase, run.Outcome, run.Cursor,
		run.CallbackAuthority, run.CleanupState, run.BudgetRevision,
		run.LatestEventDigest, run.SnapshotDigest, string(run.Canonical),
		run.Canonical, run.CreatedAt, run.UpdatedAt,
	)
	if err != nil {
		return RunRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return RunRecord{}, false, err
	}
	if rows == 0 {
		var existingRun, existingEvent []byte
		err := tx.QueryRowContext(ctx, `SELECT r.snapshot_bytes, e.event_bytes
FROM agent_runs r
JOIN agent_run_events e
	ON e.workspace_id = r.workspace_id AND e.run_id = r.run_id AND e.sequence = 1
WHERE r.workspace_id = $1 AND r.task_id = $2 AND r.create_idempotency_key = $3
FOR SHARE OF r, e`, workspaceID, run.TaskID, event.IdempotencyKey).Scan(&existingRun, &existingEvent)
		if errors.Is(err, sql.ErrNoRows) {
			return RunRecord{}, false, ErrConflict
		}
		if err != nil {
			return RunRecord{}, false, err
		}
		if !bytes.Equal(existingRun, run.Canonical) || !bytes.Equal(existingEvent, event.Canonical) {
			return RunRecord{}, false, conflict("Run create idempotency key was reused with different input")
		}
		if err := tx.Commit(); err != nil {
			return RunRecord{}, false, err
		}
		return runRecord(run), true, nil
	}
	if err := insertEventTx(ctx, tx, workspaceID, event); err != nil {
		return RunRecord{}, false, err
	}
	if err := syncRunProjectionTx(ctx, tx, run); err != nil {
		return RunRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return RunRecord{}, false, err
	}
	return runRecord(run), false, nil
}

func (repository *Repository) GetTask(
	ctx context.Context,
	workspaceID string,
	taskID string,
) (TaskRecord, error) {
	if err := repository.available(); err != nil {
		return TaskRecord{}, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var bytes []byte
	if err := repository.db.QueryRowContext(ctx, `SELECT task_bytes
FROM agent_tasks WHERE workspace_id = $1 AND task_id = $2`, workspaceID, taskID).Scan(&bytes); errors.Is(err, sql.ErrNoRows) {
		return TaskRecord{}, ErrNotFound
	} else if err != nil {
		return TaskRecord{}, err
	}
	task, err := decodeTaskFact(bytes)
	if err != nil {
		return TaskRecord{}, err
	}
	return taskRecord(task), nil
}

func (repository *Repository) GetRun(
	ctx context.Context,
	workspaceID string,
	runID string,
) (RunRecord, error) {
	if err := repository.available(); err != nil {
		return RunRecord{}, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var bytes []byte
	if err := repository.db.QueryRowContext(ctx, `SELECT snapshot_bytes
FROM agent_runs WHERE workspace_id = $1 AND run_id = $2`, workspaceID, runID).Scan(&bytes); errors.Is(err, sql.ErrNoRows) {
		return RunRecord{}, ErrNotFound
	} else if err != nil {
		return RunRecord{}, err
	}
	run, err := decodeRunFact(bytes)
	if err != nil {
		return RunRecord{}, err
	}
	run.WorkspaceID = workspaceID
	return runRecord(run), nil
}

func taskRecord(task taskFact) TaskRecord {
	return TaskRecord{
		WorkspaceID: task.WorkspaceID, ProjectID: task.ProjectID, TaskID: task.TaskID,
		TaskDigest: task.TaskDigest, Mode: task.Mode,
		FactBytes: append([]byte(nil), task.Canonical...), CreatedAt: task.CreatedAt,
	}
}

func runRecord(run runFact) RunRecord {
	return RunRecord{
		WorkspaceID: run.WorkspaceID, TaskID: run.TaskID, RunID: run.RunID,
		Generation: run.Generation, Attempt: run.Attempt, Phase: run.Phase,
		Outcome: run.Outcome, Cursor: run.Cursor,
		CallbackAuthority: run.CallbackAuthority, CleanupState: run.CleanupState,
		BudgetRevision: run.BudgetRevision, SnapshotDigest: run.SnapshotDigest,
		FactBytes: append([]byte(nil), run.Canonical...), CreatedAt: run.CreatedAt,
		UpdatedAt: run.UpdatedAt,
	}
}

func loadTaskTx(ctx context.Context, tx *sql.Tx, workspaceID, taskID string) (taskFact, error) {
	var bytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT task_bytes
FROM agent_tasks WHERE workspace_id = $1 AND task_id = $2
FOR SHARE`, workspaceID, taskID).Scan(&bytes); errors.Is(err, sql.ErrNoRows) {
		return taskFact{}, ErrNotFound
	} else if err != nil {
		return taskFact{}, err
	}
	return decodeTaskFact(bytes)
}

func insertEventTx(ctx context.Context, tx *sql.Tx, workspaceID string, event eventFact) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_run_events (
	workspace_id, run_id, sequence, event_id, generation, family, type,
	idempotency_key, request_digest, payload_digest, previous_event_digest,
	event_digest, event_json, event_bytes, occurred_at
) VALUES (
	$1, $2, $3, $4, $5, $6, $7,
	$8, $9, $10, NULLIF($11, ''),
	$12, $13::jsonb, $14, $15
)`, workspaceID, event.RunID, event.Sequence, stringMember(event.Value, "eventId"),
		event.Generation, event.Family, event.Type, event.IdempotencyKey,
		event.RequestDigest, event.PayloadDigest, event.PreviousEventDigest,
		event.EventDigest, string(event.Canonical), event.Canonical, event.OccurredAt)
	return err
}

func scanRunFactTx(ctx context.Context, tx *sql.Tx, workspaceID, runID string) (runFact, error) {
	var snapshot []byte
	if err := tx.QueryRowContext(ctx, `SELECT snapshot_bytes
FROM agent_runs
WHERE workspace_id = $1 AND run_id = $2
FOR UPDATE`, workspaceID, runID).Scan(&snapshot); errors.Is(err, sql.ErrNoRows) {
		return runFact{}, ErrNotFound
	} else if err != nil {
		return runFact{}, err
	}
	run, err := decodeRunFact(snapshot)
	if err != nil {
		return runFact{}, fmt.Errorf("decode persisted AgentRun: %w", err)
	}
	run.WorkspaceID = workspaceID
	return run, nil
}
