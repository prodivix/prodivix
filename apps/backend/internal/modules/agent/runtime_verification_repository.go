package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

type RuntimeVerificationAuthorization struct {
	AgentRunID        string
	Lease             RunLeaseAuthority
	Clock             func() time.Time
	VerificationRunID string
	WorkspaceRevision int64
	PlanDigest        string
	Surface           string
	Kind              string
	PlanWire          json.RawMessage
}

type runtimeVerificationLink struct {
	AgentRunID           string
	Generation           int64
	MutationReceiptID    string
	OwnerID              string
	WorkspaceRevision    int64
	TargetRevisionDigest string
	PlanDigest           string
	Surface              string
}

// AuthorizeRuntimeVerification is called inside the G3 write transaction. It
// locks Workspace -> AgentRun -> linked G3 Run, matching Agent ledger lock order.
// The deferred FK makes the create link and the G3 initial snapshot one commit.
func (repository *Repository) AuthorizeRuntimeVerification(ctx context.Context, tx *sql.Tx, workspaceID string, input RuntimeVerificationAuthorization) error {
	if tx == nil || input.Clock == nil || workspaceID == "" || input.AgentRunID == "" || input.VerificationRunID == "" || (input.Kind != "create" && input.Kind != "append") {
		return ErrUnauthorized
	}
	var ownerID, projectID string
	if err := tx.QueryRowContext(ctx, `SELECT owner_id, project_id FROM workspaces WHERE id = $1 FOR SHARE`, workspaceID).Scan(&ownerID, &projectID); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	run, err := scanRunFactTx(ctx, tx, workspaceID, input.AgentRunID)
	if err != nil {
		return err
	}
	if (run.Phase != "verifying" && run.Phase != "repairing") || run.CallbackAuthority != "active" {
		return ErrUnauthorized
	}
	if err := authorizeRuntimeLeaseTx(ctx, tx, workspaceID, run.RunID, &RuntimeLeaseGuard{Authority: input.Lease, Clock: input.Clock}, run); err != nil {
		return err
	}
	task, err := loadTaskTx(ctx, tx, workspaceID, run.TaskID)
	if err != nil {
		return err
	}
	if task.Mode != "apply" || task.ProjectID != projectID {
		return ErrUnauthorized
	}

	var link runtimeVerificationLink
	if input.Kind == "append" {
		if err := tx.QueryRowContext(ctx, `SELECT agent_run_id, agent_generation, mutation_receipt_id, owner_id, workspace_revision, target_revision_digest, plan_digest, surface
FROM agent_runtime_verification_runs WHERE workspace_id = $1 AND verification_run_id = $2 FOR SHARE`, workspaceID, input.VerificationRunID).Scan(&link.AgentRunID, &link.Generation, &link.MutationReceiptID, &link.OwnerID, &link.WorkspaceRevision, &link.TargetRevisionDigest, &link.PlanDigest, &link.Surface); errors.Is(err, sql.ErrNoRows) {
			return ErrUnauthorized
		} else if err != nil {
			return err
		}
		if link.AgentRunID != run.RunID || link.Generation != run.Generation || link.OwnerID != ownerID {
			return ErrUnauthorized
		}
		var actualOwner, actualPlan, actualSurface string
		var actualRevision int64
		if err := tx.QueryRowContext(ctx, `SELECT actor_id, workspace_revision, plan_digest, surface FROM verification_runs WHERE workspace_id = $1 AND id = $2 FOR SHARE`, workspaceID, input.VerificationRunID).Scan(&actualOwner, &actualRevision, &actualPlan, &actualSurface); errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		if actualOwner != link.OwnerID || actualRevision != link.WorkspaceRevision || actualPlan != link.PlanDigest || actualSurface != link.Surface ||
			(input.WorkspaceRevision != 0 && input.WorkspaceRevision != link.WorkspaceRevision) || (input.PlanDigest != "" && input.PlanDigest != link.PlanDigest) || (input.Surface != "" && input.Surface != link.Surface) {
			return ErrUnauthorized
		}
	}

	var receiptSource []byte
	if input.Kind == "create" {
		if input.WorkspaceRevision < 1 || !canonicalDigestPattern.MatchString(input.PlanDigest) || (input.Surface != "preview" && input.Surface != "export" && input.Surface != "ci") {
			return ErrInvalid
		}
		err := tx.QueryRowContext(ctx, `SELECT agent_run_id,agent_generation,mutation_receipt_id,owner_id,workspace_revision,target_revision_digest,plan_digest,surface FROM agent_runtime_verification_runs WHERE workspace_id=$1 AND verification_run_id=$2 FOR SHARE`, workspaceID, input.VerificationRunID).Scan(&link.AgentRunID, &link.Generation, &link.MutationReceiptID, &link.OwnerID, &link.WorkspaceRevision, &link.TargetRevisionDigest, &link.PlanDigest, &link.Surface)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil {
			if link.AgentRunID != run.RunID || link.Generation != run.Generation || link.OwnerID != ownerID || link.PlanDigest != input.PlanDigest || link.WorkspaceRevision != input.WorkspaceRevision || link.Surface != input.Surface {
				return ErrUnauthorized
			}
			err = tx.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_workspace_mutation_receipts WHERE workspace_id=$1 AND receipt_id=$2 FOR SHARE`, workspaceID, link.MutationReceiptID).Scan(&receiptSource)
		} else {
			err = tx.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_workspace_mutation_receipts
WHERE workspace_id = $1 AND run_id = $2 AND kind IN ('commit','rollback') AND state = 'acknowledged'
ORDER BY completed_at DESC NULLS LAST, started_at DESC, kind COLLATE "C" DESC, receipt_id COLLATE "C" DESC LIMIT 1 FOR SHARE`, workspaceID, run.RunID).Scan(&receiptSource)
		}
		if errors.Is(err, sql.ErrNoRows) {
			return ErrUnauthorized
		} else if err != nil {
			return err
		}
	} else {
		if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_workspace_mutation_receipts WHERE workspace_id = $1 AND receipt_id = $2 FOR SHARE`, workspaceID, link.MutationReceiptID).Scan(&receiptSource); errors.Is(err, sql.ErrNoRows) {
			return ErrUnauthorized
		} else if err != nil {
			return err
		}
	}
	mutation, err := decodeMutationReceipt(receiptSource)
	if err != nil {
		return err
	}
	_, proposal, err := loadProposalRecordTx(ctx, tx, workspaceID, mutation.ProposalID)
	if err != nil {
		return err
	}
	_, planning, preview, err := loadProposalPreviewRecordTx(ctx, tx, workspaceID, mutation.ProposalID)
	if err != nil {
		return err
	}
	_, approval, err := loadApprovalRecordTx(ctx, tx, workspaceID, mutation.PreviewID)
	if err != nil {
		return err
	}
	revision, ok := integerMember(mutation.TargetRevision, "workspaceRev")
	if !ok || mutation.State != "acknowledged" || (mutation.Kind != "commit" && mutation.Kind != "rollback") || mutation.RunID != run.RunID || mutation.TaskID != task.TaskID || proposal.RunID != run.RunID || proposal.TaskID != task.TaskID || approval.ActorKind != "user" || approval.ActorID != ownerID || approval.Decision != "approved" || approval.DecisionID != mutation.DecisionID || preview.PreviewID != mutation.PreviewID || planning.TransactionDigest != mutation.TransactionDigest {
		return ErrUnauthorized
	}
	if input.Kind == "append" {
		if link.MutationReceiptID != mutation.ReceiptID || link.TargetRevisionDigest != mutation.TargetRevisionDigest || link.WorkspaceRevision != revision || (mutation.Kind == "commit" && link.PlanDigest != planning.VerificationPlanDigest) || (mutation.Kind == "rollback" && approval.RollbackAuthorization != "on-unsatisfied-closure") {
			return ErrUnauthorized
		}
		return nil
	}
	// A refined actual Plan needs a separately verified owner compatibility proof;
	// the default runtime lane cannot authorize an arbitrary caller plan digest.
	if input.WorkspaceRevision != revision || (mutation.Kind == "commit" && input.PlanDigest != planning.VerificationPlanDigest) {
		return ErrUnauthorized
	}
	if mutation.Kind == "rollback" {
		if approval.RollbackAuthorization != "on-unsatisfied-closure" || mutation.ReverseTransactionDigest != planning.ReverseTransactionDigest {
			return ErrUnauthorized
		}
		if err := authorizeRuntimeRollbackPlanTx(ctx, tx, workspaceID, run.RunID, mutation, planning, input); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_runtime_verification_runs (
workspace_id, verification_run_id, agent_run_id, agent_generation, mutation_receipt_id, owner_id, workspace_revision, target_revision_digest, plan_digest, surface, created_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`, workspaceID, input.VerificationRunID, run.RunID, run.Generation, mutation.ReceiptID, ownerID, revision, mutation.TargetRevisionDigest, input.PlanDigest, input.Surface, canonicalTime(input.Clock())); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `SELECT agent_run_id, agent_generation, mutation_receipt_id, owner_id, workspace_revision, target_revision_digest, plan_digest, surface
FROM agent_runtime_verification_runs WHERE workspace_id = $1 AND verification_run_id = $2 FOR SHARE`, workspaceID, input.VerificationRunID).Scan(&link.AgentRunID, &link.Generation, &link.MutationReceiptID, &link.OwnerID, &link.WorkspaceRevision, &link.TargetRevisionDigest, &link.PlanDigest, &link.Surface); err != nil {
		return err
	}
	if link.AgentRunID != run.RunID || link.Generation != run.Generation || link.MutationReceiptID != mutation.ReceiptID || link.OwnerID != ownerID || link.WorkspaceRevision != revision || link.TargetRevisionDigest != mutation.TargetRevisionDigest || link.PlanDigest != input.PlanDigest || link.Surface != input.Surface {
		return ErrUnauthorized
	}
	return nil
}

func authorizeRuntimeVerificationLinkTx(ctx context.Context, tx *sql.Tx, workspaceID, runID string, generation int64, mutationReceiptID, targetRevisionDigest, planDigest string, workspaceRevision int64, ref verificationRunRefFact) error {
	var matches bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_runtime_verification_runs l
JOIN verification_runs v ON v.workspace_id=l.workspace_id AND v.id=l.verification_run_id
JOIN workspaces w ON w.id=l.workspace_id
WHERE l.workspace_id=$1 AND l.verification_run_id=$2 AND l.agent_run_id=$3 AND l.agent_generation=$4
AND l.mutation_receipt_id=$5 AND l.target_revision_digest=$6 AND l.plan_digest=$7 AND l.workspace_revision=$8 AND l.surface=$9
AND v.actor_id=l.owner_id AND w.owner_id=l.owner_id AND v.workspace_revision=l.workspace_revision AND v.plan_digest=l.plan_digest AND v.surface=l.surface)`, workspaceID, ref.VerificationRunID, runID, generation, mutationReceiptID, targetRevisionDigest, planDigest, workspaceRevision, ref.Surface).Scan(&matches)
	if err != nil {
		return err
	}
	if !matches {
		return ErrUnauthorized
	}
	return nil
}
