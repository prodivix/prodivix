package database

import (
	"context"
	"database/sql"
	"fmt"
)

// agentEvaluationAuthenticityV3MigrationWithPreflight preserves the deployed
// v33 statement sequence while adding a fail-closed check for databases that
// already contain v29-v31 review candidates. Those candidates can only move to
// the turn-journal FK when their exact terminal response authority is present.
func agentEvaluationAuthenticityV3MigrationWithPreflight() migration {
	migration := agentEvaluationAuthenticityV3Migration()
	migration.preflight = preflightAgentEvaluationAuthenticityV3
	return migration
}

func preflightAgentEvaluationAuthenticityV3(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `LOCK TABLE agent_evaluation_review_candidates,
		agent_evaluation_invocation_turn_receipts IN SHARE MODE`); err != nil {
		return fmt.Errorf("lock immutable review and turn authority: %w", err)
	}
	var missingCount int64
	err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
		FROM agent_evaluation_review_candidates candidate
		LEFT JOIN agent_evaluation_invocation_turn_receipts turn_receipt
		  ON turn_receipt.namespace_id=candidate.namespace_id
		 AND turn_receipt.plan_digest=candidate.plan_digest
		 AND turn_receipt.attempt_id=candidate.attempt_id
		 AND turn_receipt.descriptor_digest=candidate.descriptor_digest
		 AND turn_receipt.response_artifact_digest=candidate.response_digest
		WHERE turn_receipt.attempt_id IS NULL`).Scan(&missingCount)
	if err != nil {
		return fmt.Errorf("inspect review candidate turn authority: %w", err)
	}
	if missingCount != 0 {
		return fmt.Errorf(
			"%d immutable review candidate(s) lack exact v32 terminal turn authority; rebuild the turn journal before v33",
			missingCount,
		)
	}
	return nil
}
