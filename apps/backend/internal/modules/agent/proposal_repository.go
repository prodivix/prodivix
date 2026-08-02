package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type ProposalRecord struct {
	WorkspaceID       string
	ProposalID        string
	TaskID            string
	RunID             string
	ProposalDigest    string
	ContextPackDigest string
	FactBytes         []byte
	ReceivedAt        time.Time
}

type ProposalPreviewRecord struct {
	WorkspaceID       string
	ProposalID        string
	PreviewID         string
	PlanningDigest    string
	PreviewDigest     string
	TransactionDigest string
	PlanningFactBytes []byte
	PreviewFactBytes  []byte
	PlannedAt         time.Time
	ExpiresAt         time.Time
}

type ApprovalDecisionRecord struct {
	WorkspaceID    string
	DecisionID     string
	ProposalID     string
	PreviewID      string
	Decision       string
	ActorID        string
	DecisionDigest string
	FactBytes      []byte
	DecidedAt      time.Time
	ExpiresAt      time.Time
}

func (repository *Repository) StoreProposal(
	ctx context.Context,
	authority PrincipalAuthority,
	factBytes []byte,
) (ProposalRecord, bool, error) {
	if err := repository.available(); err != nil {
		return ProposalRecord{}, false, err
	}
	proposal, err := decodeProposal(factBytes)
	if err != nil {
		return ProposalRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return ProposalRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return ProposalRecord{}, false, err
	}
	task, err := loadTaskTx(ctx, tx, authority.WorkspaceID, proposal.TaskID)
	if err != nil {
		return ProposalRecord{}, false, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, proposal.RunID)
	if err != nil {
		return ProposalRecord{}, false, err
	}
	repairPlanning := run.Phase == "repairing"
	if task.ProjectID != authority.ProjectID || task.WorkspaceID != authority.WorkspaceID ||
		(task.Mode != "propose" && task.Mode != "apply") ||
		run.TaskID != task.TaskID || proposal.TaskID != task.TaskID || proposal.RunID != run.RunID ||
		(run.Phase != "running" && run.Phase != "repairing") ||
		(!repairPlanning && !sameMember(proposal.BaseRevision, task.Spec["baseRevision"])) {
		return ProposalRecord{}, false, conflict("proposal does not bind an active Task, Run, and base revision")
	}
	runValue, _ := objectMember(run.Value, "run")
	if !repairPlanning && !sameMember(proposal.BaseRevision, runValue["baseRevision"]) {
		return ProposalRecord{}, false, conflict("proposal base revision drifted from the durable Run")
	}
	if contextDigest := stringMember(runValue, "contextPackDigest"); !repairPlanning && contextDigest != "" && contextDigest != proposal.ContextPackDigest {
		return ProposalRecord{}, false, conflict("proposal Context Pack digest drifted from the durable Run")
	}
	matches, err := workspaceRevisionMatchesTx(ctx, tx, authority.WorkspaceID, proposal.BaseRevision)
	if err != nil {
		return ProposalRecord{}, false, err
	}
	if !matches {
		return ProposalRecord{}, false, conflict("proposal base revision is stale")
	}
	receivedAt := time.Now().UTC()
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_proposals (
	workspace_id, proposal_id, task_id, run_id, proposal_digest,
	context_pack_digest, base_revision_digest, proposal_json, proposal_bytes, received_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
ON CONFLICT DO NOTHING`,
		authority.WorkspaceID, proposal.ProposalID, proposal.TaskID, proposal.RunID,
		proposal.ProposalDigest, proposal.ContextPackDigest, proposal.BaseRevisionDigest,
		string(proposal.Canonical), proposal.Canonical, receivedAt,
	)
	if err != nil {
		return ProposalRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return ProposalRecord{}, false, err
	}
	if rows == 0 {
		record, existing, err := loadProposalRecordTx(ctx, tx, authority.WorkspaceID, proposal.ProposalID)
		if errors.Is(err, ErrNotFound) {
			return ProposalRecord{}, false, conflict("proposal identity or digest was reused")
		}
		if err != nil {
			return ProposalRecord{}, false, err
		}
		if !bytes.Equal(existing.Canonical, proposal.Canonical) {
			return ProposalRecord{}, false, conflict("proposal identity was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return ProposalRecord{}, false, err
		}
		return record, true, nil
	}
	if err := tx.Commit(); err != nil {
		return ProposalRecord{}, false, err
	}
	return proposalRecord(authority.WorkspaceID, proposal, receivedAt), false, nil
}

func (repository *Repository) StoreProposalPreview(
	ctx context.Context,
	authority PrincipalAuthority,
	planningFactBytes []byte,
	previewFactBytes []byte,
) (ProposalPreviewRecord, bool, error) {
	if err := repository.available(); err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	planning, err := decodePlanning(planningFactBytes)
	if err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	preview, err := decodePreview(previewFactBytes)
	if err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	proposalRecordValue, proposal, err := loadProposalRecordTx(ctx, tx, authority.WorkspaceID, planning.ProposalID)
	if err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, proposal.RunID)
	if err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	if proposalRecordValue.ProposalID != preview.ProposalID ||
		planning.ProposalID != proposal.ProposalID ||
		(run.Phase != "running" && run.Phase != "repairing") ||
		!sameMember(planning.BaseRevision, proposal.BaseRevision) ||
		!proposalPreviewBindingsMatch(planning, preview) {
		return ProposalPreviewRecord{}, false, conflict("proposal preview does not bind the exact domain planning receipt")
	}
	matches, err := workspaceRevisionMatchesTx(ctx, tx, authority.WorkspaceID, planning.BaseRevision)
	if err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	if !matches {
		return ProposalPreviewRecord{}, false, conflict("proposal preview base revision is stale")
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_proposal_previews (
	workspace_id, proposal_id, preview_id, planning_digest, preview_digest,
	proposed_snapshot_digest, transaction_digest, reverse_transaction_digest,
	semantic_diff_digest, impact_digest, verification_plan_digest, source_trace_digest,
	planning_json, planning_bytes, preview_json, preview_bytes, planned_at, expires_at
) VALUES (
	$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
	$13::jsonb, $14, $15::jsonb, $16, $17, $18
)
ON CONFLICT DO NOTHING`,
		authority.WorkspaceID, planning.ProposalID, preview.PreviewID,
		planning.PlanningDigest, preview.PreviewDigest, planning.ProposedSnapshotDigest,
		planning.TransactionDigest, planning.ReverseTransactionDigest,
		planning.SemanticDiffDigest, planning.ImpactDigest, planning.VerificationPlanDigest,
		planning.SourceTraceDigest, string(planning.Canonical), planning.Canonical,
		string(preview.Canonical), preview.Canonical, planning.PlannedAt, planning.ExpiresAt,
	)
	if err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	if rows == 0 {
		record, existingPlanning, existingPreview, err := loadProposalPreviewRecordTx(
			ctx, tx, authority.WorkspaceID, planning.ProposalID,
		)
		if errors.Is(err, ErrNotFound) {
			return ProposalPreviewRecord{}, false, conflict("proposal or preview identity was reused")
		}
		if err != nil {
			return ProposalPreviewRecord{}, false, err
		}
		if !bytes.Equal(existingPlanning.Canonical, planning.Canonical) ||
			!bytes.Equal(existingPreview.Canonical, preview.Canonical) {
			return ProposalPreviewRecord{}, false, conflict("proposal preview identity was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return ProposalPreviewRecord{}, false, err
		}
		return record, true, nil
	}
	if err := tx.Commit(); err != nil {
		return ProposalPreviewRecord{}, false, err
	}
	return proposalPreviewRecord(authority.WorkspaceID, planning, preview), false, nil
}

func (repository *Repository) DecideProposal(
	ctx context.Context,
	authority PrincipalAuthority,
	factBytes []byte,
) (ApprovalDecisionRecord, bool, error) {
	if err := repository.available(); err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	approval, err := decodeApproval(factBytes)
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	proposalRecordValue, proposal, err := loadProposalByPreviewTx(ctx, tx, authority.WorkspaceID, approval.PreviewID)
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	previewRecord, planning, preview, err := loadProposalPreviewRecordTx(
		ctx, tx, authority.WorkspaceID, proposal.ProposalID,
	)
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	task, err := loadTaskTx(ctx, tx, authority.WorkspaceID, proposal.TaskID)
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, proposal.RunID)
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	if authority.Kind != "user" || authority.PrincipalID != approval.ActorID ||
		approval.ActorKind != "user" || task.ActorKind != "user" || task.ActorID != approval.ActorID ||
		task.Mode != "apply" || run.Phase != "awaiting-approval" ||
		proposalRecordValue.ProposalID != proposal.ProposalID || previewRecord.PreviewID != approval.PreviewID ||
		approval.TaskID != proposal.TaskID || approval.RunID != proposal.RunID ||
		approval.PreviewDigest != preview.PreviewDigest ||
		approval.TransactionDigest != planning.TransactionDigest ||
		approval.ImpactDigest != planning.ImpactDigest ||
		approval.VerificationPlanDigest != planning.VerificationPlanDigest ||
		approval.PolicyDigest != task.PolicyDigest || approval.GrantID != task.InitialGrantID ||
		!sameMember(approval.BaseRevision, proposal.BaseRevision) ||
		approval.DecidedAt.Before(planning.PlannedAt) ||
		!approval.DecidedAt.Before(preview.ExpiresAt) || approval.ExpiresAt.After(preview.ExpiresAt) {
		return ApprovalDecisionRecord{}, false, conflict("approval does not bind the exact actor, preview, policy, grant, and lifetime")
	}
	matches, err := workspaceRevisionMatchesTx(ctx, tx, authority.WorkspaceID, approval.BaseRevision)
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	if !matches {
		return ApprovalDecisionRecord{}, false, conflict("approval base revision is stale")
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_approval_decisions (
	workspace_id, decision_id, proposal_id, preview_id, task_id, run_id,
	decision, actor_kind, actor_id, grant_id, policy_digest, rollback_authorization,
	decision_digest, approval_json, approval_bytes, decided_at, expires_at
) VALUES (
	$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
	$13, $14::jsonb, $15, $16, $17
)
ON CONFLICT DO NOTHING`,
		authority.WorkspaceID, approval.DecisionID, proposal.ProposalID, approval.PreviewID,
		approval.TaskID, approval.RunID, approval.Decision, approval.ActorKind, approval.ActorID,
		approval.GrantID, approval.PolicyDigest, approval.RollbackAuthorization,
		approval.DecisionDigest, string(approval.Canonical), approval.Canonical,
		approval.DecidedAt, approval.ExpiresAt,
	)
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	if rows == 0 {
		record, existing, err := loadApprovalRecordTx(ctx, tx, authority.WorkspaceID, approval.PreviewID)
		if errors.Is(err, ErrNotFound) {
			return ApprovalDecisionRecord{}, false, conflict("approval decision or preview identity was reused")
		}
		if err != nil {
			return ApprovalDecisionRecord{}, false, err
		}
		if !bytes.Equal(existing.Canonical, approval.Canonical) {
			return ApprovalDecisionRecord{}, false, conflict("approval decision identity was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return ApprovalDecisionRecord{}, false, err
		}
		return record, true, nil
	}
	if err := tx.Commit(); err != nil {
		return ApprovalDecisionRecord{}, false, err
	}
	return approvalRecord(authority.WorkspaceID, proposal.ProposalID, approval), false, nil
}

func authorizeProposalWorkspaceTx(
	ctx context.Context,
	tx *sql.Tx,
	authority PrincipalAuthority,
) error {
	if (authority.Kind != "user" && authority.Kind != "service") ||
		strings.TrimSpace(authority.PrincipalID) == "" ||
		strings.TrimSpace(authority.ProjectID) == "" || strings.TrimSpace(authority.WorkspaceID) == "" {
		return ErrUnauthorized
	}
	var projectID, ownerID string
	if err := tx.QueryRowContext(ctx, `SELECT project_id, owner_id
FROM workspaces
WHERE id = $1
FOR SHARE`, authority.WorkspaceID).Scan(&projectID, &ownerID); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if projectID != authority.ProjectID || (authority.Kind == "user" && ownerID != authority.PrincipalID) {
		return ErrUnauthorized
	}
	return nil
}

func workspaceRevisionMatchesTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	revision map[string]any,
) (bool, error) {
	workspaceRev, workspaceOK := integerMember(revision, "workspaceRev")
	routeRev, routeOK := integerMember(revision, "routeRev")
	opSeq, opOK := integerMember(revision, "opSeq")
	documents, documentsOK := arrayMember(revision, "documents")
	if !workspaceOK || !routeOK || !opOK || !documentsOK {
		return false, ErrInvalid
	}
	var currentWorkspaceRev, currentRouteRev, currentOpSeq int64
	if err := tx.QueryRowContext(ctx, `SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR SHARE`, workspaceID).Scan(&currentWorkspaceRev, &currentRouteRev, &currentOpSeq); errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotFound
	} else if err != nil {
		return false, err
	}
	if workspaceRev != currentWorkspaceRev || routeRev != currentRouteRev || opSeq != currentOpSeq {
		return false, nil
	}
	rows, err := tx.QueryContext(ctx, `SELECT id, content_rev, meta_rev
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY id ASC
FOR SHARE`, workspaceID)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	index := 0
	for rows.Next() {
		if index >= len(documents) {
			return false, nil
		}
		expected, ok := documents[index].(map[string]any)
		if !ok {
			return false, ErrInvalid
		}
		var id string
		var contentRev, metaRev int64
		if err := rows.Scan(&id, &contentRev, &metaRev); err != nil {
			return false, err
		}
		expectedContent, contentOK := integerMember(expected, "contentRev")
		expectedMeta, metaOK := integerMember(expected, "metaRev")
		if !contentOK || !metaOK || stringMember(expected, "documentId") != id ||
			expectedContent != contentRev || expectedMeta != metaRev {
			return false, nil
		}
		index++
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	return index == len(documents), nil
}

func proposalPreviewBindingsMatch(planning planningFact, preview previewFact) bool {
	if planning.ProposalID != preview.ProposalID ||
		planning.ProposedSnapshotDigest != preview.ProposedSnapshotDigest ||
		planning.TransactionDigest != preview.TransactionDigest ||
		planning.ReverseTransactionDigest != preview.ReverseTransactionDigest ||
		planning.SemanticDiffDigest != preview.SemanticDiffDigest ||
		planning.ImpactDigest != preview.ImpactDigest ||
		planning.VerificationPlanDigest != preview.VerificationPlanDigest ||
		!planning.ExpiresAt.Equal(preview.ExpiresAt) ||
		!sameMember(planning.BaseRevision, preview.BaseRevision) {
		return false
	}
	for _, field := range []string{
		"impactSetRef", "verificationPlanRef", "requiredCapabilities", "risks", "diagnosticRefs",
	} {
		if !sameMember(planning.Value[field], preview.Value[field]) {
			return false
		}
	}
	return true
}

func loadProposalRecordTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	proposalID string,
) (ProposalRecord, proposalFact, error) {
	var source []byte
	var receivedAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT proposal_bytes, received_at
FROM agent_proposals
WHERE workspace_id = $1 AND proposal_id = $2
FOR SHARE`, workspaceID, proposalID).Scan(&source, &receivedAt); errors.Is(err, sql.ErrNoRows) {
		return ProposalRecord{}, proposalFact{}, ErrNotFound
	} else if err != nil {
		return ProposalRecord{}, proposalFact{}, err
	}
	proposal, err := decodeProposal(source)
	if err != nil {
		return ProposalRecord{}, proposalFact{}, fmt.Errorf("decode persisted Agent proposal: %w", err)
	}
	return proposalRecord(workspaceID, proposal, receivedAt), proposal, nil
}

func loadProposalByPreviewTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	previewID string,
) (ProposalRecord, proposalFact, error) {
	var proposalID string
	if err := tx.QueryRowContext(ctx, `SELECT proposal_id
FROM agent_proposal_previews
WHERE workspace_id = $1 AND preview_id = $2
FOR SHARE`, workspaceID, previewID).Scan(&proposalID); errors.Is(err, sql.ErrNoRows) {
		return ProposalRecord{}, proposalFact{}, ErrNotFound
	} else if err != nil {
		return ProposalRecord{}, proposalFact{}, err
	}
	return loadProposalRecordTx(ctx, tx, workspaceID, proposalID)
}

func loadProposalPreviewRecordTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	proposalID string,
) (ProposalPreviewRecord, planningFact, previewFact, error) {
	var planningBytes, previewBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT planning_bytes, preview_bytes
FROM agent_proposal_previews
WHERE workspace_id = $1 AND proposal_id = $2
FOR SHARE`, workspaceID, proposalID).Scan(&planningBytes, &previewBytes); errors.Is(err, sql.ErrNoRows) {
		return ProposalPreviewRecord{}, planningFact{}, previewFact{}, ErrNotFound
	} else if err != nil {
		return ProposalPreviewRecord{}, planningFact{}, previewFact{}, err
	}
	planning, err := decodePlanning(planningBytes)
	if err != nil {
		return ProposalPreviewRecord{}, planningFact{}, previewFact{}, fmt.Errorf("decode persisted Agent planning receipt: %w", err)
	}
	preview, err := decodePreview(previewBytes)
	if err != nil {
		return ProposalPreviewRecord{}, planningFact{}, previewFact{}, fmt.Errorf("decode persisted Agent preview: %w", err)
	}
	return proposalPreviewRecord(workspaceID, planning, preview), planning, preview, nil
}

func loadApprovalRecordTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	previewID string,
) (ApprovalDecisionRecord, approvalFact, error) {
	var proposalID string
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT proposal_id, approval_bytes
FROM agent_approval_decisions
WHERE workspace_id = $1 AND preview_id = $2
FOR SHARE`, workspaceID, previewID).Scan(&proposalID, &source); errors.Is(err, sql.ErrNoRows) {
		return ApprovalDecisionRecord{}, approvalFact{}, ErrNotFound
	} else if err != nil {
		return ApprovalDecisionRecord{}, approvalFact{}, err
	}
	approval, err := decodeApproval(source)
	if err != nil {
		return ApprovalDecisionRecord{}, approvalFact{}, fmt.Errorf("decode persisted Agent approval: %w", err)
	}
	return approvalRecord(workspaceID, proposalID, approval), approval, nil
}

func proposalRecord(workspaceID string, proposal proposalFact, receivedAt time.Time) ProposalRecord {
	return ProposalRecord{
		WorkspaceID: workspaceID, ProposalID: proposal.ProposalID,
		TaskID: proposal.TaskID, RunID: proposal.RunID,
		ProposalDigest: proposal.ProposalDigest, ContextPackDigest: proposal.ContextPackDigest,
		FactBytes: append([]byte(nil), proposal.Canonical...), ReceivedAt: receivedAt,
	}
}

func proposalPreviewRecord(workspaceID string, planning planningFact, preview previewFact) ProposalPreviewRecord {
	return ProposalPreviewRecord{
		WorkspaceID: workspaceID, ProposalID: planning.ProposalID, PreviewID: preview.PreviewID,
		PlanningDigest: planning.PlanningDigest, PreviewDigest: preview.PreviewDigest,
		TransactionDigest: planning.TransactionDigest,
		PlanningFactBytes: append([]byte(nil), planning.Canonical...),
		PreviewFactBytes:  append([]byte(nil), preview.Canonical...),
		PlannedAt:         planning.PlannedAt, ExpiresAt: planning.ExpiresAt,
	}
}

func approvalRecord(workspaceID string, proposalID string, approval approvalFact) ApprovalDecisionRecord {
	return ApprovalDecisionRecord{
		WorkspaceID: workspaceID, DecisionID: approval.DecisionID,
		ProposalID: proposalID, PreviewID: approval.PreviewID,
		Decision: approval.Decision, ActorID: approval.ActorID,
		DecisionDigest: approval.DecisionDigest,
		FactBytes:      append([]byte(nil), approval.Canonical...),
		DecidedAt:      approval.DecidedAt, ExpiresAt: approval.ExpiresAt,
	}
}
