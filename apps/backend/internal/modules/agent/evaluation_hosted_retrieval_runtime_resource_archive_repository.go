package agent

import (
	"context"
	"fmt"
	"sort"
)

const (
	maximumEvaluationHostedRetrievalRuntimeResourceCleanupRequestBytes       = 24_576
	maximumEvaluationHostedRetrievalRuntimeResourceCleanupReceiptBytes       = 32_768
	maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords     = 4
	maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes = 196_608
	maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyBytes = 786_432
)

// EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord is the
// ciphertext-free release projection for one member of the exact four-member
// hosted resource authority set.
type EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord struct {
	NamespaceID                    string
	PlanDigest                     string
	RepositoryCommit               string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	ProtocolFamily                 string
	CapabilityProfileID            string
	RegistrationIntent             string
	AuthorityDigest                string
	AuthoritySetDigest             string
	CommitmentDigest               string
	TerminalFenceDigest            string
	CleanupReceiptDigest           string
	RecordDigest                   string
	RecordBytes                    []byte
	value                          map[string]any
}

// queryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords reads
// only immutable, zero-residual cleanup projections. The online hosted owner
// materializes this table in the same transaction that seals cleanup.
func queryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return nil, err
	}
	rows, err := queryer.QueryContext(ctx, `SELECT namespace_id,plan_digest,repository_commit,
		runtime_resource_set_id,authority_digest,record_digest,cleanup_receipt_digest,record_json,record_bytes
	FROM ae_hrrr_cleanup_archives
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND v46_eligible
	ORDER BY repository_commit COLLATE "C",runtime_resource_set_id COLLATE "C",authority_digest COLLATE "C"
	LIMIT 5`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord, 0, 4)
	for rows.Next() {
		var namespaceID, planDigest, repositoryCommit, runtimeResourceSetID string
		var authorityDigest, recordDigest, cleanupReceiptDigest string
		var recordJSON, recordBytes []byte
		if err := rows.Scan(
			&namespaceID, &planDigest, &repositoryCommit,
			&runtimeResourceSetID, &authorityDigest, &recordDigest, &cleanupReceiptDigest, &recordJSON, &recordBytes,
		); err != nil {
			return nil, err
		}
		record, decodeErr := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			recordBytes, authority.NamespaceID, partition,
		)
		if decodeErr != nil || namespaceID != record.NamespaceID || planDigest != record.PlanDigest ||
			repositoryCommit != record.RepositoryCommit || runtimeResourceSetID != record.RuntimeResourceSetID ||
			authorityDigest != record.AuthorityDigest || recordDigest != record.RecordDigest ||
			cleanupReceiptDigest != record.CleanupReceiptDigest ||
			!evaluationJSONColumnMatchesCanonical(recordJSON, record.RecordBytes,
				maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes) {
			return nil, ErrConflict
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		return evaluationHostedArchiveIdentity(records[left].ProtocolFamily, records[left].CapabilityProfileID) <
			evaluationHostedArchiveIdentity(records[right].ProtocolFamily, records[right].CapabilityProfileID)
	})
	var planBytes []byte
	if err := queryer.QueryRowContext(ctx, `SELECT plan_bytes FROM agent_evaluation_plans
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&planBytes); err != nil {
		return nil, err
	}
	plan, err := decodeEvaluationPlan(planBytes)
	if err != nil || plan.PlanDigest != partition.PlanDigest || plan.RepositoryCommit != partition.RepositoryCommit {
		return nil, fmt.Errorf("%w: hosted retrieval cleanup archive plan is invalid", ErrConflict)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(plan, records); err != nil {
		return nil, err
	}
	if len(records) == maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords {
		var budgetComplete bool
		if err := queryer.QueryRowContext(ctx, `SELECT agent_evaluation_hosted_runtime_cleanup_archive_family_budget_complete(
			$1,$2,$3,$4)`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
			records[0].RuntimeResourceSetID).Scan(&budgetComplete); err != nil || !budgetComplete {
			return nil, ErrConflict
		}
	}
	return records, nil
}
