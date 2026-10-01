package agent

import (
	"context"
	"database/sql"
	"encoding/json"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
)

func runtimeRepairCounterexamplesTx(ctx context.Context, tx *sql.Tx, workspaceID, taskID string) (map[string]any, error) {
	var bytes []byte
	err := tx.QueryRowContext(ctx, `SELECT request_wire_bytes FROM agent_runtime_repair_delegations WHERE workspace_id=$1 AND child_task_id=$2 FOR SHARE`, workspaceID, taskID).Scan(&bytes)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var wire map[string]any
	if err := json.Unmarshal(bytes, &wire); err != nil {
		return nil, err
	}
	value, ok := wire["value"].(map[string]any)
	if !ok {
		return nil, ErrConflict
	}
	counterexamples, ok := value["counterexamples"].(map[string]any)
	if !ok {
		return nil, ErrConflict
	}
	return counterexamples, nil
}

func authorizeRuntimeRepairPlanTx(ctx context.Context, tx *sql.Tx, workspaceID, taskID string, plan g3.VerificationPlanGrant) error {
	counterexamples, err := runtimeRepairCounterexamplesTx(ctx, tx, workspaceID, taskID)
	if err != nil || counterexamples == nil {
		return err
	}
	current := map[string]bool{}
	for _, cell := range plan.Cells {
		if cell.Requirement != "required" {
			continue
		}
		source, err := json.Marshal(cell)
		if err != nil {
			return err
		}
		digest, err := agentcontract.StableVerificationCellDigest(source)
		if err != nil {
			return err
		}
		current[digest] = true
	}
	requirements, ok := counterexamples["requirements"].([]any)
	if !ok {
		return ErrConflict
	}
	for _, raw := range requirements {
		requirement, ok := raw.(map[string]any)
		if !ok || !current[stringMember(requirement, "stableCellDigest")] {
			return conflict("repair Plan dropped or changed a required counterexample")
		}
	}
	return nil
}
