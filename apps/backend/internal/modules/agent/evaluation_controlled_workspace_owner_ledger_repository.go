package agent

import (
	"context"
	"database/sql"
)

func (repository *Repository) ListEvaluationControlledWorkspaceOwnerLedgerRecords(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationControlledWorkspaceOwnerLedgerRecord, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	if err := validateEvaluationPartition(partition); err != nil || !validEvaluationAgentControlIdentity(attemptID) {
		return nil, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.db.QueryContext(ctx, `SELECT
		operation, request_digest, response_bytes, claimed_at, sealed_at
	FROM agent_evaluation_controlled_authority_requests
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind='controlled-workspace' AND attempt_id=$4
		AND state='sealed' AND v46_eligible AND response_bytes IS NOT NULL
	ORDER BY claimed_at ASC, request_digest COLLATE "C" ASC
	LIMIT $5`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		attemptID, maximumEvaluationControlledWorkspaceOwnerLedgerRecords+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationControlledWorkspaceOwnerLedgerRecord, 0, 16)
	aggregateBytes := 0
	for rows.Next() {
		var record EvaluationControlledWorkspaceOwnerLedgerRecord
		var sealedAt sql.NullTime
		if err := rows.Scan(
			&record.Operation, &record.RequestDigest, &record.ResponseBytes, &record.ClaimedAt, &sealedAt,
		); err != nil {
			return nil, err
		}
		record.SealedAt = sealedAt.Time
		aggregateBytes += len(record.ResponseBytes)
		if !evaluationControlledWorkspaceOwnerLedgerOperation(record.Operation) ||
			!evaluationDigestPattern.MatchString(record.RequestDigest) || record.ClaimedAt.IsZero() ||
			record.SealedAt.IsZero() || len(record.ResponseBytes) == 0 ||
			len(record.ResponseBytes) > maximumEvaluationControlledAuthorityResponseBytes ||
			aggregateBytes > maximumEvaluationControlledWorkspaceOwnerLedgerHistoryBytes {
			return nil, ErrConflict
		}
		record.ResponseBytes = append([]byte(nil), record.ResponseBytes...)
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) > maximumEvaluationControlledWorkspaceOwnerLedgerRecords {
		return nil, ErrConflict
	}
	return records, nil
}
