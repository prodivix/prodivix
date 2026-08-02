package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"
)

type VerificationPlanBindingRecord struct {
	WorkspaceID       string
	BindingID         string
	TaskID            string
	RunID             string
	MutationReceiptID string
	VerificationRunID string
	ActualPlanDigest  string
	PlanCompatibility string
	BindingDigest     string
	FactBytes         []byte
	BoundAt           time.Time
}

type VerificationClosureReceiptRecord struct {
	WorkspaceID   string
	ReceiptID     string
	BindingID     string
	RunID         string
	ClosureDigest string
	Verdict       string
	ReceiptDigest string
	FactBytes     []byte
	EvaluatedAt   time.Time
}

type RepairRoundReceiptRecord struct {
	WorkspaceID   string
	ReceiptID     string
	RepairRoundID string
	RunID         string
	Round         int64
	State         string
	ReceiptDigest string
	FactBytes     []byte
	RecordedAt    time.Time
}

// The control reducer validates proof shape. This query validates that every
// digest is backed by one immutable V5/V6/G3 ledger lineage before success.
func validateApplySuccessLedgerTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	taskID string,
	runID string,
	event eventFact,
) error {
	proof, ok := objectMember(event.Data, "successProof")
	if !ok {
		return conflict("apply success is missing its durable proof")
	}
	var matches int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
FROM agent_proposals p
JOIN agent_proposal_previews pv
	ON pv.workspace_id = p.workspace_id AND pv.proposal_id = p.proposal_id
JOIN agent_approval_decisions a
	ON a.workspace_id = p.workspace_id AND a.proposal_id = p.proposal_id
	AND a.preview_id = pv.preview_id AND a.decision = 'approved'
JOIN agent_workspace_mutation_receipts m
	ON m.workspace_id = p.workspace_id AND m.proposal_id = p.proposal_id
	AND m.preview_id = pv.preview_id AND m.decision_id = a.decision_id
	AND m.kind = 'commit' AND m.state = 'acknowledged'
JOIN agent_verification_plan_bindings b
	ON b.workspace_id = p.workspace_id AND b.mutation_receipt_id = m.receipt_id
	AND b.task_id = p.task_id AND b.run_id = p.run_id
	AND b.mutation_kind = 'commit'
JOIN agent_verification_closure_receipts c
	ON c.workspace_id = b.workspace_id AND c.binding_id = b.binding_id
	AND c.task_id = b.task_id AND c.run_id = b.run_id
	AND c.verdict = 'satisfied' AND c.plan_digest = b.actual_plan_digest
WHERE p.workspace_id = $1 AND p.task_id = $2 AND p.run_id = $3
	AND p.proposal_digest = $4
	AND a.decision_digest = $5
	AND pv.transaction_digest = $6 AND m.transaction_digest = $6
	AND m.receipt_digest = $7
	AND b.approved_plan_digest = $8
	AND b.actual_plan_digest = $9
	AND b.plan_compatibility = $10
	AND b.target_revision_digest = m.target_revision_digest
	AND c.closure_digest = $11`,
		workspaceID, taskID, runID,
		stringMember(proof, "proposalDigest"), stringMember(proof, "approvalDigest"),
		stringMember(proof, "transactionDigest"), stringMember(proof, "commitAckDigest"),
		stringMember(proof, "committedPlanDigest"), stringMember(proof, "actualPlanDigest"),
		stringMember(proof, "planCompatibility"), stringMember(proof, "verificationClosureDigest"),
	).Scan(&matches); err != nil {
		return err
	}
	if matches != 1 {
		return conflict("apply success proof is not backed by one exact approval, ACK, actual Plan, promoted Evidence, and satisfied Closure")
	}

	var failedClosures int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
FROM agent_verification_closure_receipts
WHERE workspace_id = $1 AND task_id = $2 AND run_id = $3
	AND verdict IN ('unsatisfied', 'stale')`, workspaceID, taskID, runID).Scan(&failedClosures); err != nil {
		return err
	}
	if failedClosures == 0 {
		return nil
	}

	// Once this run has observed a failed Closure, a later green rerun is not
	// enough. The successful proposal and Plan must be the exact output of a
	// failure-grounded repair receipt that retained the failed regression set.
	var repairMatches int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
FROM agent_verification_plan_bindings b
JOIN agent_proposals p
	ON p.workspace_id = b.workspace_id AND p.proposal_id = b.proposal_id
JOIN agent_verification_closure_receipts success
	ON success.workspace_id = b.workspace_id AND success.binding_id = b.binding_id
	AND success.verdict = 'satisfied'
JOIN agent_repair_round_receipts repair
	ON repair.workspace_id = b.workspace_id AND repair.task_id = b.task_id
	AND repair.run_id = b.run_id AND repair.state = 'proposal-bound'
	AND repair.proposal_id = b.proposal_id
	AND repair.verification_plan_digest = b.approved_plan_digest
	AND repair.regression_requirement_set_digest = b.regression_requirement_set_digest
JOIN agent_verification_closure_receipts failed
	ON failed.workspace_id = repair.workspace_id
	AND failed.receipt_id = repair.failed_closure_receipt_id
	AND failed.task_id = repair.task_id AND failed.run_id = repair.run_id
	AND failed.verdict IN ('unsatisfied', 'stale')
WHERE b.workspace_id = $1 AND b.task_id = $2 AND b.run_id = $3
	AND p.proposal_digest = $4
	AND b.approved_plan_digest = $5
	AND b.actual_plan_digest = $6
	AND b.plan_compatibility = $7
	AND success.closure_digest = $8`,
		workspaceID, taskID, runID,
		stringMember(proof, "proposalDigest"),
		stringMember(proof, "committedPlanDigest"),
		stringMember(proof, "actualPlanDigest"),
		stringMember(proof, "planCompatibility"),
		stringMember(proof, "verificationClosureDigest"),
	).Scan(&repairMatches); err != nil {
		return err
	}
	if repairMatches != 1 {
		return conflict("apply success after a failed closure requires one exact failure-grounded repair proposal and retained regression set")
	}
	return nil
}

func (repository *Repository) StoreVerificationPlanBinding(
	ctx context.Context,
	authority PrincipalAuthority,
	factBytes []byte,
) (VerificationPlanBindingRecord, bool, error) {
	if err := repository.available(); err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	binding, err := decodeVerificationPlanBinding(factBytes)
	if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	if authority.Kind != "service" || binding.ProducerKind != authority.Kind || binding.ProducerID != authority.PrincipalID {
		return VerificationPlanBindingRecord{}, false, ErrUnauthorized
	}
	_, mutation, err := loadMutationReceiptByIDTx(ctx, tx, authority.WorkspaceID, binding.MutationReceiptID)
	if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	_, planning, preview, err := loadProposalPreviewRecordTx(ctx, tx, authority.WorkspaceID, binding.ProposalID)
	if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	_, approval, err := loadApprovalRecordTx(ctx, tx, authority.WorkspaceID, binding.PreviewID)
	if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, binding.RunID)
	if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	workspaceRevision, ok := integerMember(binding.TargetRevision, "workspaceRev")
	if !ok {
		return VerificationPlanBindingRecord{}, false, ErrInvalid
	}
	var verificationWorkspaceRevision int64
	var verificationPlanDigest string
	if err := tx.QueryRowContext(ctx, `SELECT workspace_revision, plan_digest
FROM verification_runs
WHERE workspace_id = $1 AND id = $2
FOR SHARE`, authority.WorkspaceID, binding.VerificationRunID).Scan(
		&verificationWorkspaceRevision, &verificationPlanDigest,
	); errors.Is(err, sql.ErrNoRows) {
		return VerificationPlanBindingRecord{}, false, ErrNotFound
	} else if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	if mutation.State != "acknowledged" || mutation.Kind != binding.MutationKind ||
		mutation.TaskID != binding.TaskID || mutation.RunID != binding.RunID ||
		mutation.ProposalID != binding.ProposalID || mutation.PreviewID != binding.PreviewID ||
		mutation.DecisionID != binding.DecisionID || mutation.TargetRevisionDigest != binding.TargetRevisionDigest ||
		planning.VerificationPlanDigest != binding.ApprovedPlanDigest || preview.PreviewID != binding.PreviewID ||
		approval.DecisionID != binding.DecisionID || approval.Decision != "approved" ||
		run.TaskID != binding.TaskID || (run.Phase != "verifying" && run.Phase != "repairing") ||
		verificationWorkspaceRevision != workspaceRevision || verificationPlanDigest != binding.ActualPlanDigest {
		return VerificationPlanBindingRecord{}, false, conflict("verification binding does not match the approved ACK, actual Plan, Run, and revision")
	}
	if binding.MutationKind == "rollback" {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT 1
FROM agent_verification_closure_receipts
WHERE workspace_id = $1 AND task_id = $2 AND run_id = $3 AND verdict IN ('unsatisfied', 'stale')
LIMIT 1
FOR SHARE`, authority.WorkspaceID, binding.TaskID, binding.RunID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
			return VerificationPlanBindingRecord{}, false, conflict("rollback verification requires the preserved failed Closure")
		} else if err != nil {
			return VerificationPlanBindingRecord{}, false, err
		}
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_verification_plan_bindings (
	workspace_id, binding_id, task_id, run_id, proposal_id, preview_id, decision_id,
	mutation_receipt_id, mutation_kind, verification_run_id, target_revision_digest,
	approved_plan_digest, actual_plan_digest, plan_compatibility, impact_digest,
	policy_digest, approved_required_cell_set_digest, actual_required_cell_set_digest,
	regression_requirement_set_digest, producer_kind, producer_id, binding_digest,
	binding_json, binding_bytes, bound_at
) VALUES (
	$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
	$14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, $24, $25
) ON CONFLICT DO NOTHING`,
		authority.WorkspaceID, binding.BindingID, binding.TaskID, binding.RunID,
		binding.ProposalID, binding.PreviewID, binding.DecisionID, binding.MutationReceiptID,
		binding.MutationKind, binding.VerificationRunID, binding.TargetRevisionDigest,
		binding.ApprovedPlanDigest, binding.ActualPlanDigest, binding.PlanCompatibility,
		binding.ImpactDigest, binding.PolicyDigest, binding.ApprovedRequiredCellSetDigest,
		binding.ActualRequiredCellSetDigest, binding.RegressionRequirementSetDigest,
		binding.ProducerKind, binding.ProducerID, binding.BindingDigest,
		string(binding.Canonical), binding.Canonical, binding.BoundAt,
	)
	if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	if rows == 0 {
		record, existing, err := loadVerificationPlanBindingTx(ctx, tx, authority.WorkspaceID, binding.BindingID)
		if errors.Is(err, ErrNotFound) {
			return VerificationPlanBindingRecord{}, false, conflict("verification binding identity or lineage was reused")
		}
		if err != nil {
			return VerificationPlanBindingRecord{}, false, err
		}
		if !bytes.Equal(existing.Canonical, binding.Canonical) {
			return VerificationPlanBindingRecord{}, false, conflict("verification binding identity was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return VerificationPlanBindingRecord{}, false, err
		}
		return record, true, nil
	}
	if err := tx.Commit(); err != nil {
		return VerificationPlanBindingRecord{}, false, err
	}
	return verificationPlanBindingRecord(authority.WorkspaceID, binding), false, nil
}

func (repository *Repository) StoreVerificationClosureReceipt(
	ctx context.Context,
	authority PrincipalAuthority,
	factBytes []byte,
) (VerificationClosureReceiptRecord, bool, error) {
	if err := repository.available(); err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	receipt, err := decodeVerificationClosureReceipt(factBytes)
	if err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	if authority.Kind != "service" || receipt.ProducerKind != authority.Kind || receipt.ProducerID != authority.PrincipalID {
		return VerificationClosureReceiptRecord{}, false, ErrUnauthorized
	}
	_, binding, err := loadVerificationPlanBindingTx(ctx, tx, authority.WorkspaceID, receipt.BindingID)
	if err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	var verificationWorkspaceRevision int64
	var verificationPlanDigest, closureDigest, closureVerdict string
	if err := tx.QueryRowContext(ctx, `SELECT workspace_revision, plan_digest,
	COALESCE(snapshot_json->>'closureDigest', ''), COALESCE(snapshot_json->>'closureVerdict', '')
FROM verification_runs
WHERE workspace_id = $1 AND id = $2
FOR SHARE`, authority.WorkspaceID, receipt.VerificationRunID).Scan(
		&verificationWorkspaceRevision, &verificationPlanDigest, &closureDigest, &closureVerdict,
	); errors.Is(err, sql.ErrNoRows) {
		return VerificationClosureReceiptRecord{}, false, ErrNotFound
	} else if err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	workspaceRevision, ok := integerMember(receipt.TargetRevision, "workspaceRev")
	if !ok {
		return VerificationClosureReceiptRecord{}, false, ErrInvalid
	}
	if binding.TaskID != receipt.TaskID || binding.RunID != receipt.RunID ||
		binding.VerificationRunID != receipt.VerificationRunID || binding.TargetRevisionDigest != receipt.TargetRevisionDigest ||
		binding.ActualPlanDigest != receipt.PlanDigest || verificationWorkspaceRevision != workspaceRevision ||
		verificationPlanDigest != receipt.PlanDigest || closureDigest != receipt.ClosureDigest || closureVerdict != receipt.Verdict {
		return VerificationClosureReceiptRecord{}, false, conflict("Closure receipt does not match the bound G3 Run, Plan, revision, and evaluated verdict")
	}
	for _, ref := range receipt.EvidenceRefs {
		var workspaceID, planDigest, manifestDigest, outcome string
		var evidenceRevision int64
		if err := tx.QueryRowContext(ctx, `SELECT workspace_id, workspace_revision, plan_digest, manifest_digest, outcome
FROM verification_evidence
WHERE id = $1
FOR SHARE`, ref.EvidenceID).Scan(
			&workspaceID, &evidenceRevision, &planDigest, &manifestDigest, &outcome,
		); errors.Is(err, sql.ErrNoRows) {
			return VerificationClosureReceiptRecord{}, false, ErrNotFound
		} else if err != nil {
			return VerificationClosureReceiptRecord{}, false, err
		}
		if workspaceID != authority.WorkspaceID || evidenceRevision != workspaceRevision || planDigest != receipt.PlanDigest ||
			manifestDigest != ref.ManifestDigest || outcome != ref.Outcome {
			return VerificationClosureReceiptRecord{}, false, conflict("Closure receipt Evidence does not match the promoted immutable manifest")
		}
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_verification_closure_receipts (
	workspace_id, receipt_id, binding_id, task_id, run_id, verification_run_id,
	target_revision_digest, plan_digest, evidence_set_digest, verified_evidence_view_digest,
	closure_digest, verdict, producer_kind, producer_id, receipt_digest,
	receipt_json, receipt_bytes, evaluated_at
) VALUES (
	$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
	$13, $14, $15, $16::jsonb, $17, $18
) ON CONFLICT DO NOTHING`, authority.WorkspaceID, receipt.ReceiptID, receipt.BindingID,
		receipt.TaskID, receipt.RunID, receipt.VerificationRunID, receipt.TargetRevisionDigest,
		receipt.PlanDigest, receipt.EvidenceSetDigest, receipt.VerifiedEvidenceViewDigest,
		receipt.ClosureDigest, receipt.Verdict, receipt.ProducerKind, receipt.ProducerID,
		receipt.ReceiptDigest, string(receipt.Canonical), receipt.Canonical, receipt.EvaluatedAt,
	)
	if err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	if rows == 0 {
		record, existing, err := loadVerificationClosureReceiptTx(ctx, tx, authority.WorkspaceID, receipt.ReceiptID)
		if errors.Is(err, ErrNotFound) {
			return VerificationClosureReceiptRecord{}, false, conflict("Closure receipt identity or binding was reused")
		}
		if err != nil {
			return VerificationClosureReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing.Canonical, receipt.Canonical) {
			return VerificationClosureReceiptRecord{}, false, conflict("Closure receipt identity was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return VerificationClosureReceiptRecord{}, false, err
		}
		return record, true, nil
	}
	for _, ref := range receipt.EvidenceRefs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO agent_verification_closure_evidence (
		workspace_id, closure_receipt_id, evidence_id, manifest_digest, outcome
	) VALUES ($1, $2, $3, $4, $5)`, authority.WorkspaceID, receipt.ReceiptID,
			ref.EvidenceID, ref.ManifestDigest, ref.Outcome); err != nil {
			return VerificationClosureReceiptRecord{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return VerificationClosureReceiptRecord{}, false, err
	}
	return verificationClosureReceiptRecord(authority.WorkspaceID, receipt), false, nil
}

func (repository *Repository) StoreRepairRoundReceipt(
	ctx context.Context,
	authority PrincipalAuthority,
	factBytes []byte,
) (RepairRoundReceiptRecord, bool, error) {
	if err := repository.available(); err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	receipt, err := decodeRepairRoundReceipt(factBytes)
	if err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	if authority.Kind != "service" || receipt.ProducerKind != authority.Kind || receipt.ProducerID != authority.PrincipalID {
		return RepairRoundReceiptRecord{}, false, ErrUnauthorized
	}
	_, failedClosure, err := loadVerificationClosureReceiptTx(ctx, tx, authority.WorkspaceID, receipt.FailedClosureReceiptID)
	if err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	task, err := loadTaskTx(ctx, tx, authority.WorkspaceID, receipt.TaskID)
	if err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, receipt.RunID)
	if err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	ledger, _ := objectMember(run.Value, "budgetLedger")
	budget, _ := objectMember(task.Spec, "budget")
	maximumRepairRounds, ok := integerMember(budget, "maxRepairRounds")
	if !ok {
		return RepairRoundReceiptRecord{}, false, ErrInvalid
	}
	if failedClosure.TaskID != receipt.TaskID || failedClosure.RunID != receipt.RunID ||
		failedClosure.ClosureDigest != receipt.FailedClosureDigest || failedClosure.Verdict == "satisfied" ||
		(run.Phase != "verifying" && run.Phase != "repairing") ||
		stringMember(ledger, "ledgerDigest") != receipt.CumulativeBudgetLedgerDigest {
		return RepairRoundReceiptRecord{}, false, conflict("repair receipt does not bind the preserved failed Closure and current budget ledger")
	}
	rows, err := tx.QueryContext(ctx, `SELECT manifest_digest
FROM agent_verification_closure_evidence
WHERE workspace_id = $1 AND closure_receipt_id = $2 AND outcome <> 'passed'
ORDER BY manifest_digest ASC
FOR SHARE`, authority.WorkspaceID, receipt.FailedClosureReceiptID)
	if err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	var failedDigests []string
	for rows.Next() {
		var digest string
		if err := rows.Scan(&digest); err != nil {
			_ = rows.Close()
			return RepairRoundReceiptRecord{}, false, err
		}
		failedDigests = append(failedDigests, digest)
	}
	if err := rows.Close(); err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	if !slices.Equal(failedDigests, receipt.FailedEvidenceManifestDigests) {
		return RepairRoundReceiptRecord{}, false, conflict("repair receipt dropped or invented failed Evidence")
	}
	if record, existing, err := loadRepairRoundReceiptTx(ctx, tx, authority.WorkspaceID, receipt.ReceiptID); err == nil {
		if !bytes.Equal(existing.Canonical, receipt.Canonical) {
			return RepairRoundReceiptRecord{}, false, conflict("repair receipt identity was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		return record, true, nil
	} else if !errors.Is(err, ErrNotFound) {
		return RepairRoundReceiptRecord{}, false, err
	}
	if receipt.State == "started" || receipt.State == "blocked" {
		var maximumRound int64
		if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(round), 0)
FROM agent_repair_round_receipts
WHERE workspace_id = $1 AND run_id = $2 AND state = 'started'`, authority.WorkspaceID, receipt.RunID).Scan(&maximumRound); err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		if receipt.Round != maximumRound+1 || (receipt.State == "started" && receipt.Round > maximumRepairRounds) {
			return RepairRoundReceiptRecord{}, false, conflict("repair round is non-sequential or exceeds the Task budget")
		}
	} else {
		var startedBytes []byte
		if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
FROM agent_repair_round_receipts
WHERE workspace_id = $1 AND repair_round_id = $2 AND state = 'started'
FOR SHARE`, authority.WorkspaceID, receipt.RepairRoundID).Scan(&startedBytes); errors.Is(err, sql.ErrNoRows) {
			return RepairRoundReceiptRecord{}, false, ErrNotFound
		} else if err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		started, err := decodeRepairRoundReceipt(startedBytes)
		if err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		if started.Round != receipt.Round || started.FailedClosureReceiptID != receipt.FailedClosureReceiptID ||
			started.CounterexampleSetDigest != receipt.CounterexampleSetDigest ||
			started.RegressionRequirementSetDigest != receipt.RegressionRequirementSetDigest ||
			started.FailureContextPackDigest != receipt.FailureContextPackDigest ||
			started.CumulativeBudgetLedgerDigest != receipt.CumulativeBudgetLedgerDigest {
			return RepairRoundReceiptRecord{}, false, conflict("repair proposal binding drifted from its started round")
		}
		_, proposal, err := loadProposalRecordTx(ctx, tx, authority.WorkspaceID, receipt.ProposalID)
		if err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		_, planning, preview, err := loadProposalPreviewRecordTx(ctx, tx, authority.WorkspaceID, receipt.ProposalID)
		if err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		_, approval, err := loadApprovalRecordTx(ctx, tx, authority.WorkspaceID, receipt.PreviewID)
		if err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		var failedProposalID string
		if err := tx.QueryRowContext(ctx, `SELECT b.proposal_id
FROM agent_verification_closure_receipts c
JOIN agent_verification_plan_bindings b
	ON b.workspace_id = c.workspace_id AND b.binding_id = c.binding_id
WHERE c.workspace_id = $1 AND c.receipt_id = $2
FOR SHARE OF b, c`, authority.WorkspaceID, receipt.FailedClosureReceiptID).Scan(&failedProposalID); err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		if proposal.TaskID != receipt.TaskID || proposal.RunID != receipt.RunID || proposal.ProposalID == failedProposalID ||
			preview.PreviewID != receipt.PreviewID || approval.DecisionID != receipt.DecisionID || approval.Decision != "approved" ||
			planning.TransactionDigest != receipt.TransactionDigest || planning.VerificationPlanDigest != receipt.VerificationPlanDigest {
			return RepairRoundReceiptRecord{}, false, conflict("repair must use a fresh approved proposal, preview, Transaction, and Plan")
		}
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_repair_round_receipts (
	workspace_id, receipt_id, repair_round_id, state, task_id, run_id, round,
	failed_closure_receipt_id, failed_closure_digest, failure_context_pack_digest,
	counterexample_set_digest, regression_requirement_set_digest, cumulative_budget_ledger_digest,
	proposal_id, preview_id, decision_id, transaction_digest, verification_plan_digest,
	block_reason, producer_kind, producer_id, receipt_digest, receipt_json, receipt_bytes, recorded_at
) VALUES (
	$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
	NULLIF($14, ''), NULLIF($15, ''), NULLIF($16, ''), NULLIF($17, ''), NULLIF($18, ''),
	NULLIF($19, ''), $20, $21, $22, $23::jsonb, $24, $25
) ON CONFLICT DO NOTHING`, authority.WorkspaceID, receipt.ReceiptID, receipt.RepairRoundID,
		receipt.State, receipt.TaskID, receipt.RunID, receipt.Round, receipt.FailedClosureReceiptID,
		receipt.FailedClosureDigest, receipt.FailureContextPackDigest, receipt.CounterexampleSetDigest,
		receipt.RegressionRequirementSetDigest, receipt.CumulativeBudgetLedgerDigest,
		receipt.ProposalID, receipt.PreviewID, receipt.DecisionID, receipt.TransactionDigest,
		receipt.VerificationPlanDigest, receipt.BlockReason, receipt.ProducerKind, receipt.ProducerID,
		receipt.ReceiptDigest, string(receipt.Canonical), receipt.Canonical, receipt.RecordedAt,
	)
	if err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	if inserted == 0 {
		record, existing, err := loadRepairRoundReceiptTx(ctx, tx, authority.WorkspaceID, receipt.ReceiptID)
		if errors.Is(err, ErrNotFound) {
			return RepairRoundReceiptRecord{}, false, conflict("repair receipt identity or lifecycle was reused")
		}
		if err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing.Canonical, receipt.Canonical) {
			return RepairRoundReceiptRecord{}, false, conflict("repair receipt identity was reused with different immutable input")
		}
		if err := tx.Commit(); err != nil {
			return RepairRoundReceiptRecord{}, false, err
		}
		return record, true, nil
	}
	if err := tx.Commit(); err != nil {
		return RepairRoundReceiptRecord{}, false, err
	}
	return repairRoundReceiptRecord(authority.WorkspaceID, receipt), false, nil
}

func loadVerificationPlanBindingTx(ctx context.Context, tx *sql.Tx, workspaceID, bindingID string) (VerificationPlanBindingRecord, verificationPlanBindingFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT binding_bytes
FROM agent_verification_plan_bindings
WHERE workspace_id = $1 AND binding_id = $2
FOR SHARE`, workspaceID, bindingID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return VerificationPlanBindingRecord{}, verificationPlanBindingFact{}, ErrNotFound
	} else if err != nil {
		return VerificationPlanBindingRecord{}, verificationPlanBindingFact{}, err
	}
	binding, err := decodeVerificationPlanBinding(source)
	if err != nil {
		return VerificationPlanBindingRecord{}, verificationPlanBindingFact{}, fmt.Errorf("decode persisted verification Plan binding: %w", err)
	}
	return verificationPlanBindingRecord(workspaceID, binding), binding, nil
}

func loadVerificationClosureReceiptTx(ctx context.Context, tx *sql.Tx, workspaceID, receiptID string) (VerificationClosureReceiptRecord, verificationClosureReceiptFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
FROM agent_verification_closure_receipts
WHERE workspace_id = $1 AND receipt_id = $2
FOR SHARE`, workspaceID, receiptID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return VerificationClosureReceiptRecord{}, verificationClosureReceiptFact{}, ErrNotFound
	} else if err != nil {
		return VerificationClosureReceiptRecord{}, verificationClosureReceiptFact{}, err
	}
	receipt, err := decodeVerificationClosureReceipt(source)
	if err != nil {
		return VerificationClosureReceiptRecord{}, verificationClosureReceiptFact{}, fmt.Errorf("decode persisted verification Closure receipt: %w", err)
	}
	return verificationClosureReceiptRecord(workspaceID, receipt), receipt, nil
}

func loadRepairRoundReceiptTx(ctx context.Context, tx *sql.Tx, workspaceID, receiptID string) (RepairRoundReceiptRecord, repairRoundReceiptFact, error) {
	var source []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
FROM agent_repair_round_receipts
WHERE workspace_id = $1 AND receipt_id = $2
FOR SHARE`, workspaceID, receiptID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return RepairRoundReceiptRecord{}, repairRoundReceiptFact{}, ErrNotFound
	} else if err != nil {
		return RepairRoundReceiptRecord{}, repairRoundReceiptFact{}, err
	}
	receipt, err := decodeRepairRoundReceipt(source)
	if err != nil {
		return RepairRoundReceiptRecord{}, repairRoundReceiptFact{}, fmt.Errorf("decode persisted repair receipt: %w", err)
	}
	return repairRoundReceiptRecord(workspaceID, receipt), receipt, nil
}

func verificationPlanBindingRecord(workspaceID string, binding verificationPlanBindingFact) VerificationPlanBindingRecord {
	return VerificationPlanBindingRecord{
		WorkspaceID: workspaceID, BindingID: binding.BindingID, TaskID: binding.TaskID,
		RunID: binding.RunID, MutationReceiptID: binding.MutationReceiptID,
		VerificationRunID: binding.VerificationRunID, ActualPlanDigest: binding.ActualPlanDigest,
		PlanCompatibility: binding.PlanCompatibility, BindingDigest: binding.BindingDigest,
		FactBytes: append([]byte(nil), binding.Canonical...), BoundAt: binding.BoundAt,
	}
}

func verificationClosureReceiptRecord(workspaceID string, receipt verificationClosureReceiptFact) VerificationClosureReceiptRecord {
	return VerificationClosureReceiptRecord{
		WorkspaceID: workspaceID, ReceiptID: receipt.ReceiptID, BindingID: receipt.BindingID,
		RunID: receipt.RunID, ClosureDigest: receipt.ClosureDigest, Verdict: receipt.Verdict,
		ReceiptDigest: receipt.ReceiptDigest, FactBytes: append([]byte(nil), receipt.Canonical...),
		EvaluatedAt: receipt.EvaluatedAt,
	}
}

func repairRoundReceiptRecord(workspaceID string, receipt repairRoundReceiptFact) RepairRoundReceiptRecord {
	return RepairRoundReceiptRecord{
		WorkspaceID: workspaceID, ReceiptID: receipt.ReceiptID, RepairRoundID: receipt.RepairRoundID,
		RunID: receipt.RunID, Round: receipt.Round, State: receipt.State,
		ReceiptDigest: receipt.ReceiptDigest, FactBytes: append([]byte(nil), receipt.Canonical...),
		RecordedAt: receipt.RecordedAt,
	}
}
