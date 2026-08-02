package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

type ProductSupplementRecord struct {
	WorkspaceID      string
	SupplementID     string
	TaskID           string
	RunID            string
	Generation       int64
	SnapshotDigest   string
	SupplementDigest string
	FactBytes        []byte
	ProjectedAt      time.Time
}

type RunUserCommandRecord struct {
	WorkspaceID   string
	CommandID     string
	TaskID        string
	RunID         string
	Kind          string
	ActorID       string
	CommandDigest string
	FactBytes     []byte
	RequestedAt   time.Time
}

type ProductLedgerBundle struct {
	Task                 json.RawMessage   `json:"task"`
	Run                  json.RawMessage   `json:"run"`
	Events               []json.RawMessage `json:"events"`
	Proposal             json.RawMessage   `json:"proposal,omitempty"`
	Planning             json.RawMessage   `json:"planning,omitempty"`
	Preview              json.RawMessage   `json:"preview,omitempty"`
	Approval             json.RawMessage   `json:"approval,omitempty"`
	Mutations            []json.RawMessage `json:"mutations"`
	VerificationBindings []json.RawMessage `json:"verificationBindings"`
	VerificationClosures []json.RawMessage `json:"verificationClosures"`
	RepairRounds         []json.RawMessage `json:"repairRounds"`
	Supplement           json.RawMessage   `json:"supplement,omitempty"`
	Commands             []json.RawMessage `json:"commands"`
	CurrentRevision      map[string]any    `json:"currentRevision"`
	ActorAuthorized      bool              `json:"actorAuthorized"`
}

func (repository *Repository) StoreProductSupplement(
	ctx context.Context,
	authority PrincipalAuthority,
	factBytes []byte,
) (ProductSupplementRecord, bool, error) {
	if err := repository.available(); err != nil {
		return ProductSupplementRecord{}, false, err
	}
	supplement, err := decodeProductSupplement(factBytes)
	if err != nil {
		return ProductSupplementRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return ProductSupplementRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return ProductSupplementRecord{}, false, err
	}
	if authority.Kind != "service" || supplement.ProducerID != authority.PrincipalID {
		return ProductSupplementRecord{}, false, ErrUnauthorized
	}
	task, err := loadTaskTx(ctx, tx, authority.WorkspaceID, supplement.TaskID)
	if err != nil {
		return ProductSupplementRecord{}, false, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, supplement.RunID)
	if err != nil {
		return ProductSupplementRecord{}, false, err
	}
	if run.TaskID != task.TaskID || supplement.TaskID != task.TaskID ||
		supplement.Generation != run.Generation || supplement.RunSnapshotDigest != run.SnapshotDigest ||
		supplement.ProjectedAt.Before(run.UpdatedAt) {
		return ProductSupplementRecord{}, false, conflict("product supplement does not bind the current durable Task and Run snapshot")
	}
	runtime, _ := objectMember(supplement.Value, "runtime")
	ledger, _ := objectMember(run.Value, "budgetLedger")
	if stringMember(runtime, "budgetLedgerDigest") != stringMember(ledger, "ledgerDigest") {
		return ProductSupplementRecord{}, false, conflict("product runtime summary drifted from the Run budget ledger")
	}
	if contextPack, present := objectMember(supplement.Value, "context"); present {
		runValue, _ := objectMember(run.Value, "run")
		if stringMember(contextPack, "taskId") != task.TaskID || stringMember(contextPack, "runId") != run.RunID ||
			(stringMember(runValue, "contextPackDigest") != "" && stringMember(contextPack, "manifestDigest") != stringMember(runValue, "contextPackDigest")) {
			return ProductSupplementRecord{}, false, conflict("product Context metadata drifted from the Run")
		}
	}
	if supplement.ProposalID != "" {
		_, planning, preview, err := loadProposalPreviewRecordTx(ctx, tx, authority.WorkspaceID, supplement.ProposalID)
		if err != nil {
			return ProductSupplementRecord{}, false, err
		}
		review, _ := objectMember(supplement.Value, "proposalReview")
		rollback, _ := objectMember(review, "rollback")
		if preview.PreviewID != supplement.PreviewID || stringMember(review, "semanticDiffDigest") != planning.SemanticDiffDigest ||
			stringMember(review, "impactDigest") != planning.ImpactDigest || stringMember(review, "verificationPlanDigest") != planning.VerificationPlanDigest ||
			stringMember(rollback, "reverseTransactionDigest") != planning.ReverseTransactionDigest {
			return ProductSupplementRecord{}, false, conflict("product proposal review drifted from the exact preview")
		}
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_product_supplements (
	workspace_id, supplement_id, task_id, run_id, generation, run_snapshot_digest,
	proposal_id, preview_id, producer_id, supplement_digest,
	supplement_json, supplement_bytes, projected_at
) VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), NULLIF($8, ''), $9, $10, $11::jsonb, $12, $13)
ON CONFLICT DO NOTHING`, authority.WorkspaceID, supplement.SupplementID, supplement.TaskID,
		supplement.RunID, supplement.Generation, supplement.RunSnapshotDigest,
		supplement.ProposalID, supplement.PreviewID, supplement.ProducerID,
		supplement.SupplementDigest, string(supplement.Canonical), supplement.Canonical,
		supplement.ProjectedAt)
	if err != nil {
		return ProductSupplementRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return ProductSupplementRecord{}, false, err
	}
	if inserted == 0 {
		record, existing, err := loadProductSupplementTx(ctx, tx, authority.WorkspaceID, supplement.RunID, supplement.RunSnapshotDigest)
		if errors.Is(err, ErrNotFound) {
			return ProductSupplementRecord{}, false, conflict("product supplement identity or Run snapshot was reused")
		}
		if err != nil {
			return ProductSupplementRecord{}, false, err
		}
		if !bytes.Equal(existing.Canonical, supplement.Canonical) {
			return ProductSupplementRecord{}, false, conflict("product supplement was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return ProductSupplementRecord{}, false, err
		}
		return record, true, nil
	}
	if err := tx.Commit(); err != nil {
		return ProductSupplementRecord{}, false, err
	}
	return productSupplementRecord(authority.WorkspaceID, supplement), false, nil
}

func (repository *Repository) StoreRunUserCommand(
	ctx context.Context,
	authority PrincipalAuthority,
	expectedRunID string,
	factBytes []byte,
) (RunUserCommandRecord, bool, error) {
	if err := repository.available(); err != nil {
		return RunUserCommandRecord{}, false, err
	}
	command, err := decodeRunUserCommand(factBytes)
	if err != nil {
		return RunUserCommandRecord{}, false, err
	}
	if expectedRunID == "" || command.RunID != expectedRunID {
		return RunUserCommandRecord{}, false, conflict("Run command path identity drifted from its fact")
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return RunUserCommandRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return RunUserCommandRecord{}, false, err
	}
	if authority.Kind != "user" || command.ActorID != authority.PrincipalID {
		return RunUserCommandRecord{}, false, ErrUnauthorized
	}
	task, err := loadTaskTx(ctx, tx, authority.WorkspaceID, command.TaskID)
	if err != nil {
		return RunUserCommandRecord{}, false, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, command.RunID)
	if err != nil {
		return RunUserCommandRecord{}, false, err
	}
	if task.ActorKind != "user" || task.ActorID != command.ActorID || run.TaskID != task.TaskID ||
		command.ExpectedGeneration != run.Generation || command.ExpectedSnapshotDigest != run.SnapshotDigest ||
		command.RequestedAt.Before(run.CreatedAt) || run.Phase == "terminal" || run.Phase == "cancelling" {
		return RunUserCommandRecord{}, false, conflict("Run command does not bind the current actor and active snapshot")
	}
	if command.Kind == "recover" {
		pending, _ := objectMember(run.Value, "pendingOperation")
		if run.CleanupState != "residual" && stringMember(pending, "state") != "reconciliation-required" {
			return RunUserCommandRecord{}, false, conflict("Run recovery is not currently eligible")
		}
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_run_user_commands (
	workspace_id, command_id, task_id, run_id, kind, actor_id,
	expected_generation, expected_snapshot_digest, idempotency_key, command_digest,
	command_json, command_bytes, requested_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
ON CONFLICT DO NOTHING`, authority.WorkspaceID, command.CommandID, command.TaskID,
		command.RunID, command.Kind, command.ActorID, command.ExpectedGeneration,
		command.ExpectedSnapshotDigest, command.IdempotencyKey, command.CommandDigest,
		string(command.Canonical), command.Canonical, command.RequestedAt)
	if err != nil {
		return RunUserCommandRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return RunUserCommandRecord{}, false, err
	}
	if inserted == 0 {
		record, existing, err := loadRunUserCommandTx(ctx, tx, authority.WorkspaceID, command.ActorID, command.IdempotencyKey)
		if errors.Is(err, ErrNotFound) {
			return RunUserCommandRecord{}, false, conflict("Run command identity, snapshot, or idempotency key was reused")
		}
		if err != nil {
			return RunUserCommandRecord{}, false, err
		}
		if !bytes.Equal(existing.Canonical, command.Canonical) {
			return RunUserCommandRecord{}, false, conflict("Run command idempotency key was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return RunUserCommandRecord{}, false, err
		}
		return record, true, nil
	}
	if err := tx.Commit(); err != nil {
		return RunUserCommandRecord{}, false, err
	}
	return runUserCommandRecord(authority.WorkspaceID, command), false, nil
}

func (repository *Repository) GetProductLedgerBundle(
	ctx context.Context,
	authority PrincipalAuthority,
	runID string,
) (ProductLedgerBundle, error) {
	if err := repository.available(); err != nil {
		return ProductLedgerBundle{}, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProductWorkspaceReadTx(ctx, tx, authority); err != nil {
		return ProductLedgerBundle{}, err
	}
	run, err := loadRunFactReadTx(ctx, tx, authority.WorkspaceID, runID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	task, err := loadTaskReadTx(ctx, tx, authority.WorkspaceID, run.TaskID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	if authority.Kind == "user" && task.ActorID != authority.PrincipalID {
		return ProductLedgerBundle{}, ErrUnauthorized
	}
	events, err := queryFactBytes(ctx, tx, `SELECT event_bytes FROM agent_run_events
WHERE workspace_id = $1 AND run_id = $2 ORDER BY sequence ASC`, authority.WorkspaceID, runID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	proposal, err := queryOptionalFactBytes(ctx, tx, `SELECT proposal_bytes FROM agent_proposals
WHERE workspace_id = $1 AND run_id = $2 ORDER BY received_at DESC, proposal_id DESC LIMIT 1`, authority.WorkspaceID, runID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	var planning, preview, approval json.RawMessage
	if len(proposal) > 0 {
		decoded, decodeErr := decodeProposal(proposal)
		if decodeErr != nil {
			return ProductLedgerBundle{}, decodeErr
		}
		if err := tx.QueryRowContext(ctx, `SELECT planning_bytes, preview_bytes FROM agent_proposal_previews
WHERE workspace_id = $1 AND proposal_id = $2`, authority.WorkspaceID, decoded.ProposalID).Scan(&planning, &preview); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return ProductLedgerBundle{}, err
		}
		if len(preview) > 0 {
			previewFactValue, decodeErr := decodePreview(preview)
			if decodeErr != nil {
				return ProductLedgerBundle{}, decodeErr
			}
			approval, err = queryOptionalFactBytes(ctx, tx, `SELECT approval_bytes FROM agent_approval_decisions
WHERE workspace_id = $1 AND preview_id = $2`, authority.WorkspaceID, previewFactValue.PreviewID)
			if err != nil {
				return ProductLedgerBundle{}, err
			}
		}
	}
	mutations, err := queryFactBytes(ctx, tx, `SELECT receipt_bytes FROM agent_workspace_mutation_receipts
WHERE workspace_id = $1 AND run_id = $2 ORDER BY started_at ASC, receipt_id ASC`, authority.WorkspaceID, runID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	bindings, err := queryFactBytes(ctx, tx, `SELECT binding_bytes FROM agent_verification_plan_bindings
WHERE workspace_id = $1 AND run_id = $2 ORDER BY bound_at ASC, binding_id ASC`, authority.WorkspaceID, runID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	closures, err := queryFactBytes(ctx, tx, `SELECT receipt_bytes FROM agent_verification_closure_receipts
WHERE workspace_id = $1 AND run_id = $2 ORDER BY evaluated_at ASC, receipt_id ASC`, authority.WorkspaceID, runID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	repairs, err := queryFactBytes(ctx, tx, `SELECT receipt_bytes FROM agent_repair_round_receipts
WHERE workspace_id = $1 AND run_id = $2 ORDER BY round ASC, recorded_at ASC, receipt_id ASC`, authority.WorkspaceID, runID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	supplement, err := queryOptionalFactBytes(ctx, tx, `SELECT supplement_bytes FROM agent_product_supplements
WHERE workspace_id = $1 AND run_id = $2 AND run_snapshot_digest = $3
ORDER BY projected_at DESC, supplement_id DESC LIMIT 1`, authority.WorkspaceID, runID, run.SnapshotDigest)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	commands, err := queryFactBytes(ctx, tx, `SELECT command_bytes FROM agent_run_user_commands
WHERE workspace_id = $1 AND run_id = $2 ORDER BY requested_at ASC, command_id ASC`, authority.WorkspaceID, runID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	revision, err := currentAgentWorkspaceRevisionTx(ctx, tx, authority.WorkspaceID)
	if err != nil {
		return ProductLedgerBundle{}, err
	}
	bundle := ProductLedgerBundle{
		Task: json.RawMessage(append([]byte(nil), task.Canonical...)), Run: json.RawMessage(append([]byte(nil), run.Canonical...)),
		Events: events, Proposal: proposal, Planning: planning, Preview: preview, Approval: approval,
		Mutations: mutations, VerificationBindings: bindings, VerificationClosures: closures,
		RepairRounds: repairs, Supplement: supplement, Commands: commands,
		CurrentRevision: revision, ActorAuthorized: true,
	}
	if err := tx.Commit(); err != nil {
		return ProductLedgerBundle{}, err
	}
	return bundle, nil
}

func queryOptionalFactBytes(ctx context.Context, tx *sql.Tx, query string, args ...any) (json.RawMessage, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	return json.RawMessage(append([]byte(nil), source...)), nil
}

func queryFactBytes(ctx context.Context, tx *sql.Tx, query string, args ...any) ([]json.RawMessage, error) {
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]json.RawMessage, 0)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		result = append(result, json.RawMessage(append([]byte(nil), source...)))
	}
	return result, rows.Err()
}

func currentAgentWorkspaceRevisionTx(ctx context.Context, tx *sql.Tx, workspaceID string) (map[string]any, error) {
	var workspaceRev, routeRev, opSeq int64
	if err := tx.QueryRowContext(ctx, `SELECT workspace_rev, route_rev, op_seq FROM workspaces WHERE id = $1`, workspaceID).Scan(&workspaceRev, &routeRev, &opSeq); err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id, content_rev, meta_rev FROM workspace_documents WHERE workspace_id = $1`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	documents := make([]map[string]any, 0)
	for rows.Next() {
		var id string
		var contentRev, metaRev int64
		if err := rows.Scan(&id, &contentRev, &metaRev); err != nil {
			return nil, err
		}
		documents = append(documents, map[string]any{"documentId": id, "contentRev": contentRev, "metaRev": metaRev})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(documents, func(left, right int) bool {
		return documents[left]["documentId"].(string) < documents[right]["documentId"].(string)
	})
	documentValues := make([]any, len(documents))
	for index := range documents {
		documentValues[index] = documents[index]
	}
	return map[string]any{"workspaceRev": workspaceRev, "routeRev": routeRev, "opSeq": opSeq, "documents": documentValues}, nil
}

func authorizeProductWorkspaceReadTx(
	ctx context.Context,
	tx *sql.Tx,
	authority PrincipalAuthority,
) error {
	if (authority.Kind != "user" && authority.Kind != "service") ||
		strings.TrimSpace(authority.PrincipalID) == "" ||
		strings.TrimSpace(authority.ProjectID) == "" ||
		strings.TrimSpace(authority.WorkspaceID) == "" {
		return ErrUnauthorized
	}
	var projectID, ownerID string
	if err := tx.QueryRowContext(ctx, `SELECT project_id, owner_id FROM workspaces
WHERE id = $1`, authority.WorkspaceID).Scan(&projectID, &ownerID); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if projectID != authority.ProjectID || (authority.Kind == "user" && ownerID != authority.PrincipalID) {
		return ErrUnauthorized
	}
	return nil
}

func loadTaskReadTx(ctx context.Context, tx *sql.Tx, workspaceID, taskID string) (taskFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT task_bytes FROM agent_tasks
WHERE workspace_id = $1 AND task_id = $2`, workspaceID, taskID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return taskFact{}, ErrNotFound
	} else if err != nil {
		return taskFact{}, err
	}
	return decodeTaskFact(source)
}

func loadRunFactReadTx(ctx context.Context, tx *sql.Tx, workspaceID, runID string) (runFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT snapshot_bytes FROM agent_runs
WHERE workspace_id = $1 AND run_id = $2`, workspaceID, runID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return runFact{}, ErrNotFound
	} else if err != nil {
		return runFact{}, err
	}
	run, err := decodeRunFact(source)
	if err != nil {
		return runFact{}, fmt.Errorf("decode persisted AgentRun: %w", err)
	}
	run.WorkspaceID = workspaceID
	return run, nil
}

func loadProductSupplementTx(ctx context.Context, tx *sql.Tx, workspaceID, runID, snapshotDigest string) (ProductSupplementRecord, productSupplementFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT supplement_bytes FROM agent_product_supplements
WHERE workspace_id = $1 AND run_id = $2 AND run_snapshot_digest = $3
FOR SHARE`, workspaceID, runID, snapshotDigest).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return ProductSupplementRecord{}, productSupplementFact{}, ErrNotFound
	} else if err != nil {
		return ProductSupplementRecord{}, productSupplementFact{}, err
	}
	supplement, err := decodeProductSupplement(source)
	if err != nil {
		return ProductSupplementRecord{}, productSupplementFact{}, fmt.Errorf("decode persisted product supplement: %w", err)
	}
	return productSupplementRecord(workspaceID, supplement), supplement, nil
}

func loadRunUserCommandTx(ctx context.Context, tx *sql.Tx, workspaceID, actorID, idempotencyKey string) (RunUserCommandRecord, runUserCommandFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT command_bytes FROM agent_run_user_commands
WHERE workspace_id = $1 AND actor_id = $2 AND idempotency_key = $3
FOR SHARE`, workspaceID, actorID, idempotencyKey).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return RunUserCommandRecord{}, runUserCommandFact{}, ErrNotFound
	} else if err != nil {
		return RunUserCommandRecord{}, runUserCommandFact{}, err
	}
	command, err := decodeRunUserCommand(source)
	if err != nil {
		return RunUserCommandRecord{}, runUserCommandFact{}, fmt.Errorf("decode persisted Run user command: %w", err)
	}
	return runUserCommandRecord(workspaceID, command), command, nil
}

func productSupplementRecord(workspaceID string, supplement productSupplementFact) ProductSupplementRecord {
	return ProductSupplementRecord{WorkspaceID: workspaceID, SupplementID: supplement.SupplementID, TaskID: supplement.TaskID,
		RunID: supplement.RunID, Generation: supplement.Generation, SnapshotDigest: supplement.RunSnapshotDigest,
		SupplementDigest: supplement.SupplementDigest, FactBytes: append([]byte(nil), supplement.Canonical...), ProjectedAt: supplement.ProjectedAt}
}

func runUserCommandRecord(workspaceID string, command runUserCommandFact) RunUserCommandRecord {
	return RunUserCommandRecord{WorkspaceID: workspaceID, CommandID: command.CommandID, TaskID: command.TaskID,
		RunID: command.RunID, Kind: command.Kind, ActorID: command.ActorID,
		CommandDigest: command.CommandDigest, FactBytes: append([]byte(nil), command.Canonical...), RequestedAt: command.RequestedAt}
}
