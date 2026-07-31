package verification

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

func (repository *Repository) CreateVerificationRun(
	ctx context.Context,
	actorID string,
	wire VerificationRunSnapshotWire,
	canonicalWireBytes []byte,
) (VerificationRunSnapshotWire, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	createdAt, updatedAt, err := verificationRunTimes(
		wire.VerificationRunSnapshot,
	)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	tx, err := repository.db.BeginTx(
		ctx,
		&sql.TxOptions{Isolation: sql.LevelSerializable},
	)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `INSERT INTO verification_runs (
	workspace_id, id, actor_id, workspace_revision, plan_digest,
	surface, scope, provider_id, origin, status, cursor,
	snapshot_digest, snapshot_json, snapshot_bytes, created_at, updated_at
) VALUES (
	$1, $2, $3, $4, $5,
	$6, $7, $8, $9, $10, $11,
	$12, $13::jsonb, $14, $15, $16
)
ON CONFLICT DO NOTHING`,
		wire.WorkspaceID,
		wire.RunID,
		actorID,
		wire.WorkspaceRevision,
		wire.PlanDigest,
		wire.Surface,
		wire.Scope,
		wire.ProviderID,
		wire.Origin,
		wire.Status,
		wire.Cursor,
		wire.SnapshotDigest,
		string(canonicalWireBytes),
		canonicalWireBytes,
		createdAt,
		updatedAt,
	)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	if rows == 0 {
		var existingActor string
		var existingBytes []byte
		err := tx.QueryRowContext(ctx, `SELECT actor_id, snapshot_bytes
FROM verification_runs
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`,
			wire.WorkspaceID,
			wire.RunID,
		).Scan(&existingActor, &existingBytes)
		if errors.Is(err, sql.ErrNoRows) {
			return VerificationRunSnapshotWire{}, false, ErrConflict
		}
		if err != nil {
			return VerificationRunSnapshotWire{}, false, err
		}
		if existingActor != actorID || !bytes.Equal(existingBytes, canonicalWireBytes) {
			return VerificationRunSnapshotWire{}, false, ErrConflict
		}
		existing, _, err := decodeVerificationRunSnapshotWire(
			json.RawMessage(existingBytes),
		)
		if err != nil {
			return VerificationRunSnapshotWire{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return VerificationRunSnapshotWire{}, false, err
		}
		return existing, true, nil
	}
	if err := tx.Commit(); err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	return wire, false, nil
}

func (repository *Repository) AppendVerificationRunEvent(
	ctx context.Context,
	actorID string,
	workspaceID string,
	runID string,
	event VerificationRunEventWire,
	eventBytes []byte,
) (VerificationRunSnapshotWire, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(
		ctx,
		&sql.TxOptions{Isolation: sql.LevelSerializable},
	)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var currentActor string
	var currentBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT actor_id, snapshot_bytes
FROM verification_runs
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`,
		workspaceID,
		runID,
	).Scan(&currentActor, &currentBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return VerificationRunSnapshotWire{}, false, ErrNotFound
	}
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	if currentActor != actorID {
		return VerificationRunSnapshotWire{}, false, ErrUnauthorized
	}
	current, _, err := decodeVerificationRunSnapshotWire(
		json.RawMessage(currentBytes),
	)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	if event.Cursor <= current.Cursor {
		var existingBytes []byte
		err := tx.QueryRowContext(ctx, `SELECT event_bytes
FROM verification_run_events
WHERE workspace_id = $1 AND run_id = $2 AND cursor = $3`,
			workspaceID,
			runID,
			event.Cursor,
		).Scan(&existingBytes)
		if errors.Is(err, sql.ErrNoRows) ||
			(err == nil && !bytes.Equal(existingBytes, eventBytes)) {
			return VerificationRunSnapshotWire{}, false, ErrConflict
		}
		if err != nil {
			return VerificationRunSnapshotWire{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return VerificationRunSnapshotWire{}, false, err
		}
		return current, true, nil
	}
	if event.Kind == "cell-promoted" {
		var acceptedEvidenceID string
		err := tx.QueryRowContext(ctx, `SELECT id
FROM verification_evidence
WHERE id = $1
	AND workspace_id = $2
	AND plan_digest = $3
	AND cell_id = $4
	AND attempt_id = $5
	AND manifest_json->>'candidateDigest' = $6
FOR SHARE`,
			event.EvidenceID,
			workspaceID,
			current.PlanDigest,
			event.CellID,
			event.AttemptID,
			event.CandidateDigest,
		).Scan(&acceptedEvidenceID)
		if errors.Is(err, sql.ErrNoRows) {
			return VerificationRunSnapshotWire{}, false, ErrConflict
		}
		if err != nil {
			return VerificationRunSnapshotWire{}, false, err
		}
	}
	next, err := applyVerificationRunEvent(
		current.VerificationRunSnapshot,
		event.VerificationRunEvent,
	)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	nextWire, nextBytes, err := verificationRunSnapshotWire(next)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	occurredAt, _ := parseInstant(event.OccurredAt)
	if _, err := tx.ExecContext(ctx, `INSERT INTO verification_run_events (
	workspace_id, run_id, cursor, event_id, event_digest, kind,
	event_json, event_bytes, occurred_at
) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
		workspaceID,
		runID,
		event.Cursor,
		event.EventID,
		event.EventDigest,
		event.Kind,
		string(eventBytes),
		eventBytes,
		occurredAt,
	); err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE verification_runs
SET status = $4, cursor = $5, snapshot_digest = $6,
	snapshot_json = $7::jsonb, snapshot_bytes = $8, updated_at = $9
WHERE workspace_id = $1 AND id = $2
	AND cursor = $3 AND snapshot_digest = $10`,
		workspaceID,
		runID,
		current.Cursor,
		next.Status,
		next.Cursor,
		next.SnapshotDigest,
		string(nextBytes),
		nextBytes,
		occurredAt,
		current.SnapshotDigest,
	)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		if err != nil {
			return VerificationRunSnapshotWire{}, false, err
		}
		return VerificationRunSnapshotWire{}, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	return nextWire, false, nil
}

func (repository *Repository) GetVerificationRun(
	ctx context.Context,
	workspaceID string,
	runID string,
	afterCursor int64,
) (VerificationRunRecord, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var snapshotBytes []byte
	err := repository.db.QueryRowContext(ctx, `SELECT snapshot_bytes
FROM verification_runs
WHERE workspace_id = $1 AND id = $2`,
		workspaceID,
		runID,
	).Scan(&snapshotBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return VerificationRunRecord{}, ErrNotFound
	}
	if err != nil {
		return VerificationRunRecord{}, err
	}
	snapshot, _, err := decodeVerificationRunSnapshotWire(
		json.RawMessage(snapshotBytes),
	)
	if err != nil {
		return VerificationRunRecord{}, err
	}
	events, err := repository.listVerificationRunEvents(
		ctx,
		workspaceID,
		runID,
		afterCursor,
	)
	if err != nil {
		return VerificationRunRecord{}, err
	}
	return VerificationRunRecord{Snapshot: snapshot, Events: events}, nil
}

func (repository *Repository) ListVerificationRuns(
	ctx context.Context,
	workspaceID string,
	workspaceRevision *int64,
	planDigest string,
	limit int,
) ([]VerificationRunSnapshotWire, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.db.QueryContext(ctx, `SELECT snapshot_bytes
FROM verification_runs
WHERE workspace_id = $1
	AND ($2::bigint IS NULL OR workspace_revision = $2)
	AND ($3 = '' OR plan_digest = $3)
ORDER BY updated_at DESC, id DESC
LIMIT $4`,
		workspaceID,
		workspaceRevision,
		planDigest,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := make([]VerificationRunSnapshotWire, 0)
	for rows.Next() {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return nil, err
		}
		run, _, err := decodeVerificationRunSnapshotWire(json.RawMessage(payload))
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

func (repository *Repository) listVerificationRunEvents(
	ctx context.Context,
	workspaceID string,
	runID string,
	afterCursor int64,
) ([]VerificationRunEventWire, error) {
	rows, err := repository.db.QueryContext(ctx, `SELECT event_bytes
FROM verification_run_events
WHERE workspace_id = $1 AND run_id = $2 AND cursor > $3
ORDER BY cursor`,
		workspaceID,
		runID,
		afterCursor,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]VerificationRunEventWire, 0)
	for rows.Next() {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return nil, err
		}
		event, _, err := decodeVerificationRunEventWire(json.RawMessage(payload))
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}
