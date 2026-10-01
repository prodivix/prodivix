package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
)

func verificationPlanAgentRevision(plan g3.VerificationPlanGrant) map[string]any {
	ids := make([]string, 0, len(plan.TargetPartitionRevisions.DocumentRevisions))
	for id := range plan.TargetPartitionRevisions.DocumentRevisions {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	docs := make([]any, 0, len(ids))
	for _, id := range ids {
		revision := plan.TargetPartitionRevisions.DocumentRevisions[id]
		docs = append(docs, map[string]any{"documentId": id, "contentRev": revision.ContentRev, "metaRev": revision.MetaRev})
	}
	return map[string]any{"workspaceRev": plan.TargetPartitionRevisions.WorkspaceRev, "routeRev": plan.TargetPartitionRevisions.RouteRev, "opSeq": plan.TargetPartitionRevisions.OpSeq, "documents": docs}
}

func retainsRuntimeRollbackPlan(approved, actual g3.VerificationPlanGrant) bool {
	if approved.WorkspaceID != actual.WorkspaceID || approved.ScenarioRegistryDigest != actual.ScenarioRegistryDigest || approved.PolicyRevision != actual.PolicyRevision || approved.PolicyDigest != actual.PolicyDigest || approved.PolicyEvaluationInstant != actual.PolicyEvaluationInstant || approved.SemanticSchemaDigest != actual.SemanticSchemaDigest || approved.ProviderSetDigest != actual.ProviderSetDigest || approved.CompilerDigest != actual.CompilerDigest || approved.PlannerDigest != actual.PlannerDigest || approved.AdapterRegistryDigest != actual.AdapterRegistryDigest || !sameMember(approved.RetentionRequest, actual.RetentionRequest) {
		return false
	}
	retained := map[string]bool{}
	for _, cell := range actual.Cells {
		if cell.Requirement != "required" {
			continue
		}
		source, err := json.Marshal(cell)
		if err != nil {
			return false
		}
		digest, err := agentcontract.StableVerificationCellDigest(source)
		if err != nil {
			return false
		}
		retained[digest] = true
	}
	required := 0
	for _, cell := range approved.Cells {
		if cell.Requirement != "required" {
			continue
		}
		required++
		source, err := json.Marshal(cell)
		if err != nil {
			return false
		}
		digest, err := agentcontract.StableVerificationCellDigest(source)
		if err != nil || !retained[digest] {
			return false
		}
	}
	return required > 0
}

// A caller cannot turn a rollback ACK into an arbitrary weaker Plan. The old
// failed public Plan and every required stable cell remain authoritative.
func authorizeRuntimeRollbackPlanTx(ctx context.Context, tx *sql.Tx, workspaceID, runID string, mutation mutationReceiptFact, planning planningFact, input RuntimeVerificationAuthorization) error {
	actual, _, err := g3.DecodeVerificationPlanWire(input.PlanWire)
	if err != nil || actual.WorkspaceID != workspaceID || actual.PlanDigest != input.PlanDigest || actual.TargetRevision != input.WorkspaceRevision || !sameMember(verificationPlanAgentRevision(actual), mutation.TargetRevision) {
		return ErrUnauthorized
	}
	matches, err := workspaceRevisionMatchesTx(ctx, tx, workspaceID, mutation.TargetRevision)
	if err != nil {
		return err
	}
	if !matches {
		return ErrUnauthorized
	}
	var source []byte
	err = tx.QueryRowContext(ctx, `SELECT j.plan_wire_bytes FROM agent_runtime_g3_driver_jobs j JOIN agent_runtime_verification_runs l ON l.workspace_id=j.workspace_id AND l.verification_run_id=j.verification_run_id JOIN agent_verification_closure_receipts c ON c.workspace_id=j.workspace_id AND c.run_id=j.agent_run_id AND c.plan_digest=j.plan_digest JOIN agent_verification_plan_bindings b ON b.workspace_id=c.workspace_id AND b.binding_id=c.binding_id WHERE j.workspace_id=$1 AND j.agent_run_id=$2 AND j.plan_digest=$3 AND b.mutation_kind='commit' AND c.verdict='unsatisfied' LIMIT 1 FOR SHARE OF j`, workspaceID, runID, planning.VerificationPlanDigest).Scan(&source)
	if err != nil {
		return ErrUnauthorized
	}
	approved, _, err := g3.DecodeVerificationPlanWire(source)
	if err != nil || !retainsRuntimeRollbackPlan(approved, actual) {
		return ErrUnauthorized
	}
	return nil
}
