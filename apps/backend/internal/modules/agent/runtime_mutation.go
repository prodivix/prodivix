package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	backendworkspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

type runtimeCommitRequest struct {
	runtimeAuthorityRequest
	Receipt json.RawMessage `json:"receipt"`
	Request json.RawMessage `json:"request"`
}

func (gateway *RuntimeGateway) commitWorkspace(c *gin.Context) {
	var input runtimeCommitRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	principal, err := gateway.serviceAuthority(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	receipt, err := decodeMutationReceipt(input.Receipt)
	if err != nil || receipt.RunID != c.Param("runId") || receipt.State != "started" || (receipt.Kind != "commit" && receipt.Kind != "rollback") {
		respondAgentError(c, ErrInvalid)
		return
	}
	request, err := backendworkspace.DecodeWorkspaceOperationCommitRequest(bytes.NewReader(input.Request))
	if err != nil || request.Operation.Kind != "transaction" || request.Operation.Transaction == nil || request.Operation.Transaction.ID != receipt.OperationID {
		respondAgentError(c, ErrInvalid)
		return
	}
	var rawRequest map[string]any
	decoder := json.NewDecoder(bytes.NewReader(input.Request))
	decoder.UseNumber()
	if err := decoder.Decode(&rawRequest); err != nil {
		respondAgentError(c, ErrInvalid)
		return
	}
	requestDigest, err := canonicaljson.Digest(rawRequest)
	if err != nil || requestDigest != receipt.RequestDigest {
		respondAgentError(c, ErrConflict)
		return
	}
	operation, ok := objectMember(rawRequest, "operation")
	if !ok {
		respondAgentError(c, ErrInvalid)
		return
	}
	transaction, ok := objectMember(operation, "transaction")
	if !ok {
		respondAgentError(c, ErrInvalid)
		return
	}
	transactionDigest, err := canonicaljson.Digest(transaction)
	expectedTransactionDigest := receipt.TransactionDigest
	if receipt.Kind == "rollback" {
		expectedTransactionDigest = receipt.ReverseTransactionDigest
	}
	if err != nil || transactionDigest != expectedTransactionDigest {
		respondAgentError(c, ErrConflict)
		return
	}
	if err := gateway.repository.ensureRuntimeStartedMutation(c.Request.Context(), principal, RuntimeLeaseGuard{Authority: lease, Clock: gateway.clock}, receipt); err != nil {
		respondAgentError(c, err)
		return
	}
	var ownerID string
	if err := gateway.repository.db.QueryRowContext(c.Request.Context(), `SELECT owner_id FROM workspaces WHERE id = $1 AND project_id = $2`, principal.WorkspaceID, principal.ProjectID).Scan(&ownerID); err != nil {
		respondAgentError(c, err)
		return
	}
	result, err := backendworkspace.NewWorkspaceStore(gateway.repository.db).CommitWorkspaceOperationWithAuthorization(c.Request.Context(), backendworkspace.CommitWorkspaceOperationParams{WorkspaceID: principal.WorkspaceID, OwnerID: ownerID, Request: request}, func(ctx context.Context, tx *sql.Tx) error {
		run, err := scanRunFactTx(ctx, tx, principal.WorkspaceID, receipt.RunID)
		if err != nil {
			return err
		}
		lease.ObservedAt = gateway.clock().UTC()
		if err := authorizeRuntimeLeaseTx(ctx, tx, principal.WorkspaceID, receipt.RunID, &RuntimeLeaseGuard{Authority: lease, Clock: gateway.clock}, run); err != nil {
			return err
		}
		_, proposal, err := loadProposalRecordTx(ctx, tx, principal.WorkspaceID, receipt.ProposalID)
		if err != nil {
			return err
		}
		_, planning, _, err := loadProposalPreviewRecordTx(ctx, tx, principal.WorkspaceID, receipt.ProposalID)
		if err != nil {
			return err
		}
		_, approval, err := loadApprovalRecordTx(ctx, tx, principal.WorkspaceID, receipt.PreviewID)
		if err != nil {
			return err
		}
		if approval.Decision != "approved" || approval.ActorID != ownerID || !approval.ExpiresAt.After(lease.ObservedAt) ||
			approval.DecisionID != receipt.DecisionID || planning.TransactionDigest != receipt.TransactionDigest || proposal.RunID != run.RunID {
			return ErrUnauthorized
		}
		if receipt.Kind == "rollback" {
			if approval.RollbackAuthorization != "on-unsatisfied-closure" || planning.ReverseTransactionDigest != transactionDigest {
				return ErrUnauthorized
			}
			var failed bool
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_verification_closure_receipts c JOIN agent_verification_plan_bindings b ON b.workspace_id=c.workspace_id AND b.binding_id=c.binding_id WHERE c.workspace_id=$1 AND c.run_id=$2 AND b.proposal_id=$3 AND b.decision_id=$4 AND b.mutation_kind='commit' AND c.verdict='unsatisfied')`, principal.WorkspaceID, run.RunID, proposal.ProposalID, approval.DecisionID).Scan(&failed); err != nil {
				return err
			}
			if !failed {
				return ErrUnauthorized
			}
		} else if planning.TransactionDigest != transactionDigest {
			return ErrUnauthorized
		}
		return validateStartedWorkspaceMutationTx(ctx, tx, principal.WorkspaceID, run, proposal, planning, approval, receipt)
	})
	if err != nil {
		if failure := backendworkspace.MapStoreError(err); failure != nil && failure.Status != http.StatusInternalServerError {
			c.JSON(failure.Status, failure.Payload)
			return
		}
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, backendworkspace.BuildMutationSuccessPayload(result, receipt.OperationID))
}

type runtimeMutationRequest struct {
	runtimeAuthorityRequest
	Receipt json.RawMessage `json:"receipt"`
}

func (gateway *RuntimeGateway) mutation(c *gin.Context) {
	var input runtimeMutationRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	principal, err := gateway.serviceAuthority(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	receipt, err := decodeMutationReceipt(input.Receipt)
	if err != nil || receipt.RunID != c.Param("runId") {
		respondAgentError(c, ErrInvalid)
		return
	}
	record, replayed, err := gateway.repository.RecordRuntimeWorkspaceMutation(c.Request.Context(), principal, RuntimeLeaseGuard{Authority: lease, Clock: gateway.clock}, input.Receipt)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"receipt": json.RawMessage(record.FactBytes), "replayed": replayed})
}

// ACK loss retries the stored exact request, even after its base revision advanced.
func (repository *Repository) ensureRuntimeStartedMutation(ctx context.Context, principal PrincipalAuthority, guard RuntimeLeaseGuard, receipt mutationReceiptFact) error {
	var existing []byte
	err := repository.db.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_workspace_mutation_receipts WHERE workspace_id = $1 AND receipt_id = $2`, principal.WorkspaceID, receipt.ReceiptID).Scan(&existing)
	if err == nil {
		if !bytes.Equal(existing, receipt.Canonical) {
			return ErrConflict
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, _, err = repository.RecordRuntimeWorkspaceMutation(ctx, principal, guard, receipt.Canonical)
	return err
}
