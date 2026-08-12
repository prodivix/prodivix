package database

import (
	"context"
	"database/sql"
	"fmt"
)

// preflightAgentEvaluationAttemptAuthority freezes the v41 publication
// surfaces and the path-only v42/v43 closures while v45 classifies each
// existing row. Claimed attempt authority
// remains eligible for strict v45 dispatch. Already-dispatched attempt authority,
// G3 cell admission, and already-published roots remain byte-identical, become
// permanently ineligible for v45 closure, and require a fresh attempt; no
// missing digest is synthesized.
func preflightAgentEvaluationAttemptAuthority(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `LOCK TABLE agent_evaluation_controlled_authority_requests,
		agent_evaluation_authority_attestations, agent_evaluation_evidence_roots,
		agent_evaluation_holdout_closures, agent_evaluation_archive_closures IN SHARE MODE`); err != nil {
		return fmt.Errorf("lock pre-v45 attempt authority, publications, and path-only closures: %w", err)
	}
	return nil
}
