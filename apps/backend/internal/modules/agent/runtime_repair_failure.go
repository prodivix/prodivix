package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
	"github.com/gin-gonic/gin"
)

type RuntimeRepairFailureMaterial struct {
	ParentTask     json.RawMessage   `json:"parentTask"`
	Plan           json.RawMessage   `json:"plan"`
	Closure        json.RawMessage   `json:"closure"`
	ClosureReceipt json.RawMessage   `json:"closureReceipt"`
	Evidence       []json.RawMessage `json:"evidence"`
}

func (gateway *RuntimeGateway) publishRepairFailure(c *gin.Context) {
	var input struct {
		runtimeAuthorityRequest
		ClosureReceiptID string          `json:"closureReceiptId"`
		Closure          json.RawMessage `json:"closure"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	err = gateway.repository.StoreRuntimeRepairFailure(c.Request.Context(), c.Param("workspaceId"), c.Param("runId"), input.ClosureReceiptID, input.Closure, lease, gateway.clock)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"recorded": true, "closureReceiptId": input.ClosureReceiptID})
}

// Original Closure bytes are captured before terminalization, under the same
// callback authority which published the exact public Plan/Evidence receipt.
func (repository *Repository) StoreRuntimeRepairFailure(ctx context.Context, workspaceID, runID, receiptID string, source json.RawMessage, lease RunLeaseAuthority, clock func() time.Time) error {
	if err := repository.available(); err != nil {
		return err
	}
	if clock == nil || !agentcontractIdentity(runID) || !agentcontractIdentity(receiptID) {
		return ErrInvalid
	}
	closure, _, err := verificationcontract.ReadClosureReference(source)
	if err != nil {
		return ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	authority := PrincipalAuthority{Kind: "service", PrincipalID: RuntimePrincipalID, WorkspaceID: workspaceID}
	if err := tx.QueryRowContext(ctx, `SELECT project_id FROM workspaces WHERE id=$1 FOR SHARE`, workspaceID).Scan(&authority.ProjectID); err != nil {
		return err
	}
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return err
	}
	run, err := scanRunFactTx(ctx, tx, workspaceID, runID)
	if err != nil {
		return err
	}
	guard := &RuntimeLeaseGuard{Authority: lease, Clock: clock}
	if (run.Phase != "verifying" && run.Phase != "repairing") || run.CallbackAuthority != "active" {
		return ErrUnauthorized
	}
	if err := authorizeRuntimeLeaseTx(ctx, tx, workspaceID, runID, guard, run); err != nil {
		return err
	}
	_, receipt, err := loadVerificationClosureReceiptTx(ctx, tx, workspaceID, receiptID)
	if err != nil {
		return err
	}
	if receipt.RunID != runID || receipt.TaskID != run.TaskID || receipt.Verdict == "satisfied" || closure["workspaceId"] != workspaceID || closure["planDigest"] != receipt.PlanDigest || closure["closureDigest"] != receipt.ClosureDigest || closure["verdict"] != receipt.Verdict || closure["evidenceSetDigest"] != receipt.EvidenceSetDigest {
		return ErrUnauthorized
	}
	var planBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT j.plan_wire_bytes FROM agent_runtime_g3_driver_jobs j JOIN agent_verification_closure_runs r ON r.workspace_id=j.workspace_id AND r.verification_run_id=j.verification_run_id WHERE r.workspace_id=$1 AND r.closure_receipt_id=$2 AND j.agent_run_id=$3 ORDER BY j.verification_run_id COLLATE "C" LIMIT 1`, workspaceID, receiptID, runID).Scan(&planBytes); err != nil {
		return err
	}
	plan, _, err := g3.DecodeVerificationPlanWire(planBytes)
	if err != nil {
		return err
	}
	if closure["planDigest"] != plan.PlanDigest || !sameMember(closure["targetPartitionRevisions"], plan.TargetPartitionRevisions) || !sameMember(closure["targetRevision"], plan.TargetRevision) || closure["policyDigest"] != plan.PolicyDigest || closure["scenarioRegistryDigest"] != plan.ScenarioRegistryDigest || closure["semanticSchemaDigest"] != plan.SemanticSchemaDigest || closure["providerSetDigest"] != plan.ProviderSetDigest || closure["adapterRegistryDigest"] != plan.AdapterRegistryDigest || closure["impactDigest"] != plan.ImpactDigest || closure["compilerDigest"] != plan.CompilerDigest || closure["plannerDigest"] != plan.PlannerDigest {
		return ErrUnauthorized
	}
	// The receipt owner already checked every G3 snapshot and promoted manifest.
	if _, err := runtimeRepairEvidenceTx(ctx, tx, workspaceID, receipt); err != nil {
		return err
	}
	canonical, err := canonicaljson.Bytes(json.RawMessage(source))
	if err != nil {
		return err
	}
	var existingPlan, existingClosure []byte
	err = tx.QueryRowContext(ctx, `SELECT plan_wire_bytes,closure_wire_bytes FROM agent_runtime_repair_failures WHERE workspace_id=$1 AND parent_run_id=$2 FOR SHARE`, workspaceID, runID).Scan(&existingPlan, &existingClosure)
	if err == nil {
		if !bytes.Equal(existingPlan, planBytes) || !bytes.Equal(existingClosure, canonical) {
			return ErrConflict
		}
		return tx.Commit()
	}
	if err != sql.ErrNoRows {
		return err
	}
	if err := authorizeRuntimeLeaseTx(ctx, tx, workspaceID, runID, guard, run); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_runtime_repair_failures(workspace_id,parent_run_id,parent_task_id,closure_receipt_id,plan_wire_bytes,closure_wire_bytes,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, workspaceID, runID, run.TaskID, receiptID, planBytes, canonical, clock())
	if err != nil {
		return err
	}
	return tx.Commit()
}

func runtimeRepairEvidenceTx(ctx context.Context, tx *sql.Tx, workspaceID string, receipt verificationClosureReceiptFact) ([]json.RawMessage, error) {
	result := make([]json.RawMessage, 0, len(receipt.EvidenceRefs))
	owner := g3.NewRepository(nil)
	for _, ref := range receipt.EvidenceRefs {
		manifest, err := owner.GetEvidenceManifestTx(ctx, tx, workspaceID, ref.EvidenceID)
		if err != nil {
			return nil, err
		}
		if manifest.ManifestDigest != ref.ManifestDigest || manifest.Evidence.PlanDigest != receipt.PlanDigest || string(manifest.Evidence.Result.Outcome) != ref.Outcome {
			return nil, ErrConflict
		}
		wire, err := canonicaljson.Bytes(struct {
			g3.VerificationEvidenceManifest
			WireVersion int `json:"wireVersion"`
		}{manifest, 1})
		if err != nil {
			return nil, err
		}
		result = append(result, wire)
	}
	return result, nil
}

func (repository *Repository) RuntimeRepairFailureForTask(ctx context.Context, workspaceID, taskID string) (*RuntimeRepairFailureMaterial, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var parentTask, receiptID string
	var plan, closure []byte
	err = tx.QueryRowContext(ctx, `SELECT f.parent_task_id,f.closure_receipt_id,f.plan_wire_bytes,f.closure_wire_bytes FROM agent_runtime_repair_delegations d JOIN agent_runtime_repair_failures f ON f.workspace_id=d.workspace_id AND f.parent_run_id=d.parent_run_id WHERE d.workspace_id=$1 AND d.child_task_id=$2`, workspaceID, taskID).Scan(&parentTask, &receiptID, &plan, &closure)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	parent, err := loadTaskTx(ctx, tx, workspaceID, parentTask)
	if err != nil {
		return nil, err
	}
	_, receipt, err := loadVerificationClosureReceiptTx(ctx, tx, workspaceID, receiptID)
	if err != nil {
		return nil, err
	}
	evidence, err := runtimeRepairEvidenceTx(ctx, tx, workspaceID, receipt)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &RuntimeRepairFailureMaterial{ParentTask: parent.Canonical, Plan: plan, Closure: closure, ClosureReceipt: receipt.Canonical, Evidence: evidence}, nil
}
