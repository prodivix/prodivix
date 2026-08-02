package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type AuditExport struct {
	WorkspaceID  string
	TaskID       string
	RunID        string
	FromSequence int64
	ToSequence   int64
	EventCount   int
	RootDigest   string
	HeadDigest   string
	FactBytes    []byte
	ExportedAt   time.Time
}

func (repository *Repository) ExportAudit(
	ctx context.Context,
	workspaceID string,
	runID string,
	fromSequence int64,
	limit int,
	exportedAt time.Time,
) (AuditExport, error) {
	if err := repository.available(); err != nil {
		return AuditExport{}, err
	}
	if workspaceID == "" || runID == "" || fromSequence < 1 || limit < 1 ||
		limit > maximumAuditEvents || exportedAt.IsZero() {
		return AuditExport{}, ErrInvalid
	}
	exportedAt = canonicalTime(exportedAt)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.db.QueryContext(ctx, `SELECT event_bytes
FROM agent_run_events
WHERE workspace_id = $1 AND run_id = $2 AND sequence >= $3
ORDER BY sequence
LIMIT $4`, workspaceID, runID, fromSequence, limit)
	if err != nil {
		return AuditExport{}, err
	}
	defer rows.Close()
	values := make([]any, 0, limit)
	var taskID, previous, root, head string
	var expected = fromSequence
	for rows.Next() {
		var bytes []byte
		if err := rows.Scan(&bytes); err != nil {
			return AuditExport{}, err
		}
		event, err := decodeEventFact(bytes)
		if err != nil {
			return AuditExport{}, fmt.Errorf("decode persisted Agent audit event: %w", err)
		}
		if event.Sequence != expected || event.RunID != runID ||
			(len(values) > 0 && event.PreviousEventDigest != previous) {
			return AuditExport{}, conflict("persisted Agent audit chain is not contiguous")
		}
		if len(values) == 0 {
			taskID = event.TaskID
			root = event.EventDigest
		} else if event.TaskID != taskID {
			return AuditExport{}, conflict("persisted Agent audit task identity drifted")
		}
		values = append(values, event.Value)
		previous = event.EventDigest
		head = event.EventDigest
		expected++
	}
	if err := rows.Err(); err != nil {
		return AuditExport{}, err
	}
	if len(values) == 0 {
		var marker int
		if err := repository.db.QueryRowContext(ctx, `SELECT 1 FROM agent_runs
WHERE workspace_id = $1 AND run_id = $2`, workspaceID, runID).Scan(&marker); errors.Is(err, sql.ErrNoRows) {
			return AuditExport{}, ErrNotFound
		} else if err != nil {
			return AuditExport{}, err
		}
		return AuditExport{}, ErrNotFound
	}
	toSequence := fromSequence + int64(len(values)) - 1
	base := map[string]any{
		"taskId":          taskID,
		"runId":           runID,
		"fromSequence":    fromSequence,
		"toSequence":      toSequence,
		"eventCount":      len(values),
		"events":          values,
		"chainRootDigest": root,
		"chainHeadDigest": head,
		"exportedAt":      exportedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return AuditExport{}, err
	}
	value := make(map[string]any, len(base)+1)
	for key, entry := range base {
		value[key] = entry
	}
	value["exportDigest"] = digest
	envelope := map[string]any{
		"wireVersion": 1,
		"factType":    "audit-export",
		"value":       value,
	}
	factBytes, err := canonicaljson.Bytes(envelope)
	if err != nil {
		return AuditExport{}, err
	}
	if err := agentcontract.ValidateControlFact(json.RawMessage(factBytes)); err != nil {
		return AuditExport{}, fmt.Errorf("persisted Agent audit export failed its contract: %w", err)
	}
	return AuditExport{
		WorkspaceID: workspaceID, TaskID: taskID, RunID: runID,
		FromSequence: fromSequence, ToSequence: toSequence,
		EventCount: len(values), RootDigest: root, HeadDigest: head,
		FactBytes: factBytes, ExportedAt: exportedAt,
	}, nil
}
