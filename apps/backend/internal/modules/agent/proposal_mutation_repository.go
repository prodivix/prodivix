package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type WorkspaceMutationReceiptRecord struct {
	WorkspaceID   string
	ReceiptID     string
	OperationID   string
	Kind          string
	State         string
	ProposalID    string
	DecisionID    string
	ReceiptDigest string
	FactBytes     []byte
	StartedAt     time.Time
	CompletedAt   *time.Time
}

func (repository *Repository) RecordWorkspaceMutation(
	ctx context.Context,
	authority PrincipalAuthority,
	factBytes []byte,
) (WorkspaceMutationReceiptRecord, bool, error) {
	if err := repository.available(); err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	receipt, err := decodeMutationReceipt(factBytes)
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	if receipt.ProducerKind != authority.Kind || receipt.ProducerID != authority.PrincipalID {
		return WorkspaceMutationReceiptRecord{}, false, ErrUnauthorized
	}
	_, proposal, err := loadProposalRecordTx(ctx, tx, authority.WorkspaceID, receipt.ProposalID)
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	_, planning, preview, err := loadProposalPreviewRecordTx(ctx, tx, authority.WorkspaceID, receipt.ProposalID)
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	_, approval, err := loadApprovalRecordTx(ctx, tx, authority.WorkspaceID, receipt.PreviewID)
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	task, err := loadTaskTx(ctx, tx, authority.WorkspaceID, proposal.TaskID)
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, proposal.RunID)
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	if task.Mode != "apply" || approval.Decision != "approved" ||
		receipt.TaskID != proposal.TaskID || receipt.RunID != proposal.RunID ||
		receipt.PreviewID != preview.PreviewID || receipt.DecisionID != approval.DecisionID ||
		receipt.TransactionDigest != planning.TransactionDigest ||
		receipt.ReverseTransactionDigest != planning.ReverseTransactionDigest ||
		receipt.StartedAt.After(approval.ExpiresAt) ||
		(receipt.Kind == "rollback" && approval.RollbackAuthorization != "on-unsatisfied-closure") {
		return WorkspaceMutationReceiptRecord{}, false, conflict("Workspace mutation receipt does not bind the approved proposal authority")
	}
	if receipt.State == "started" {
		if err := validateStartedWorkspaceMutationTx(ctx, tx, authority.WorkspaceID, run, proposal, planning, approval, receipt); err != nil {
			return WorkspaceMutationReceiptRecord{}, false, err
		}
	} else if err := validateTerminalWorkspaceMutationTx(ctx, tx, authority.WorkspaceID, run, receipt); err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_workspace_mutation_receipts (
	workspace_id, receipt_id, operation_id, kind, state, task_id, run_id,
	proposal_id, preview_id, decision_id, base_revision_digest,
	transaction_digest, reverse_transaction_digest, request_digest,
	producer_kind, producer_id, target_revision_digest, mutation_digest,
	conflict_digest, receipt_digest, receipt_json, receipt_bytes, started_at, completed_at
) VALUES (
	$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
	$13, $14, $15, $16, NULLIF($17, ''), NULLIF($18, ''), NULLIF($19, ''),
	$20, $21::jsonb, $22, $23, $24
)
ON CONFLICT DO NOTHING`,
		authority.WorkspaceID, receipt.ReceiptID, receipt.OperationID, receipt.Kind, receipt.State,
		receipt.TaskID, receipt.RunID, receipt.ProposalID, receipt.PreviewID, receipt.DecisionID,
		receipt.BaseRevisionDigest, receipt.TransactionDigest, receipt.ReverseTransactionDigest,
		receipt.RequestDigest, receipt.ProducerKind, receipt.ProducerID,
		receipt.TargetRevisionDigest, receipt.MutationDigest, receipt.ConflictDigest,
		receipt.ReceiptDigest, string(receipt.Canonical), receipt.Canonical,
		receipt.StartedAt, receipt.CompletedAt,
	)
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	if rows == 0 {
		record, existing, err := loadMutationReceiptByIDTx(ctx, tx, authority.WorkspaceID, receipt.ReceiptID)
		if errors.Is(err, ErrNotFound) {
			return WorkspaceMutationReceiptRecord{}, false, conflict("Workspace mutation operation already has an incompatible lifecycle receipt")
		}
		if err != nil {
			return WorkspaceMutationReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing.Canonical, receipt.Canonical) {
			return WorkspaceMutationReceiptRecord{}, false, conflict("Workspace mutation receipt identity was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return WorkspaceMutationReceiptRecord{}, false, err
		}
		return record, true, nil
	}
	if err := tx.Commit(); err != nil {
		return WorkspaceMutationReceiptRecord{}, false, err
	}
	return mutationReceiptRecord(authority.WorkspaceID, receipt), false, nil
}

func validateStartedWorkspaceMutationTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	run runFact,
	proposal proposalFact,
	planning planningFact,
	approval approvalFact,
	receipt mutationReceiptFact,
) error {
	if receipt.Kind == "commit" {
		if run.Phase != "committing" || !sameMember(receipt.BaseRevision, proposal.BaseRevision) {
			return conflict("commit start does not bind the approved base revision and committing Run")
		}
	} else {
		if run.Phase != "verifying" && run.Phase != "repairing" && run.Phase != "committing" {
			return conflict("rollback start is outside an authorized Run phase")
		}
		commit, err := loadAcknowledgedCommitTx(ctx, tx, workspaceID, proposal.ProposalID, approval.DecisionID)
		if err != nil {
			return err
		}
		if commit.TargetRevision == nil || !sameMember(receipt.BaseRevision, commit.TargetRevision) ||
			commit.ReverseTransactionDigest != planning.ReverseTransactionDigest {
			return conflict("rollback start does not bind the exact acknowledged commit reverse Transaction")
		}
	}
	matches, err := workspaceRevisionMatchesTx(ctx, tx, workspaceID, receipt.BaseRevision)
	if err != nil {
		return err
	}
	if !matches {
		return conflict("Workspace mutation base revision is stale")
	}
	return nil
}

func validateTerminalWorkspaceMutationTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	run runFact,
	receipt mutationReceiptFact,
) error {
	started, err := loadStartedMutationTx(ctx, tx, workspaceID, receipt.OperationID)
	if err != nil {
		return err
	}
	if started.Kind != receipt.Kind || started.TaskID != receipt.TaskID || started.RunID != receipt.RunID ||
		started.ProposalID != receipt.ProposalID || started.PreviewID != receipt.PreviewID ||
		started.DecisionID != receipt.DecisionID || started.TransactionDigest != receipt.TransactionDigest ||
		started.ReverseTransactionDigest != receipt.ReverseTransactionDigest ||
		started.RequestDigest != receipt.RequestDigest || started.ProducerKind != receipt.ProducerKind ||
		started.ProducerID != receipt.ProducerID || !started.StartedAt.Equal(receipt.StartedAt) ||
		!sameMember(started.BaseRevision, receipt.BaseRevision) {
		return conflict("terminal Workspace mutation receipt drifted from its exact started receipt")
	}
	if receipt.Kind == "commit" && run.Phase != "committing" && run.Phase != "verifying" {
		return conflict("commit acknowledgement is outside the committing Run")
	}
	if receipt.Kind == "rollback" && run.Phase != "verifying" && run.Phase != "repairing" && run.Phase != "committing" {
		return conflict("rollback acknowledgement is outside an authorized Run phase")
	}
	if receipt.State == "acknowledged" {
		matches, err := workspaceRevisionMatchesTx(ctx, tx, workspaceID, receipt.TargetRevision)
		if err != nil {
			return err
		}
		if !matches {
			return conflict("Workspace mutation ACK target revision does not match Atomic Commit state")
		}
	}
	return nil
}

func loadStartedMutationTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	operationID string,
) (mutationReceiptFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
FROM agent_workspace_mutation_receipts
WHERE workspace_id = $1 AND operation_id = $2 AND state = 'started'
FOR SHARE`, workspaceID, operationID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return mutationReceiptFact{}, ErrNotFound
	} else if err != nil {
		return mutationReceiptFact{}, err
	}
	receipt, err := decodeMutationReceipt(source)
	if err != nil {
		return mutationReceiptFact{}, fmt.Errorf("decode persisted started Workspace mutation: %w", err)
	}
	return receipt, nil
}

func loadAcknowledgedCommitTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	proposalID string,
	decisionID string,
) (mutationReceiptFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
FROM agent_workspace_mutation_receipts
WHERE workspace_id = $1 AND proposal_id = $2 AND decision_id = $3
	AND kind = 'commit' AND state = 'acknowledged'
FOR SHARE`, workspaceID, proposalID, decisionID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return mutationReceiptFact{}, ErrNotFound
	} else if err != nil {
		return mutationReceiptFact{}, err
	}
	receipt, err := decodeMutationReceipt(source)
	if err != nil {
		return mutationReceiptFact{}, fmt.Errorf("decode persisted acknowledged commit: %w", err)
	}
	return receipt, nil
}

func loadMutationReceiptByIDTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	receiptID string,
) (WorkspaceMutationReceiptRecord, mutationReceiptFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
FROM agent_workspace_mutation_receipts
WHERE workspace_id = $1 AND receipt_id = $2
FOR SHARE`, workspaceID, receiptID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return WorkspaceMutationReceiptRecord{}, mutationReceiptFact{}, ErrNotFound
	} else if err != nil {
		return WorkspaceMutationReceiptRecord{}, mutationReceiptFact{}, err
	}
	receipt, err := decodeMutationReceipt(source)
	if err != nil {
		return WorkspaceMutationReceiptRecord{}, mutationReceiptFact{}, fmt.Errorf("decode persisted Workspace mutation receipt: %w", err)
	}
	return mutationReceiptRecord(workspaceID, receipt), receipt, nil
}

func mutationReceiptRecord(workspaceID string, receipt mutationReceiptFact) WorkspaceMutationReceiptRecord {
	var completedAt *time.Time
	if receipt.CompletedAt != nil {
		value := *receipt.CompletedAt
		completedAt = &value
	}
	return WorkspaceMutationReceiptRecord{
		WorkspaceID: workspaceID, ReceiptID: receipt.ReceiptID,
		OperationID: receipt.OperationID, Kind: receipt.Kind, State: receipt.State,
		ProposalID: receipt.ProposalID, DecisionID: receipt.DecisionID,
		ReceiptDigest: receipt.ReceiptDigest, FactBytes: append([]byte(nil), receipt.Canonical...),
		StartedAt: receipt.StartedAt, CompletedAt: completedAt,
	}
}
