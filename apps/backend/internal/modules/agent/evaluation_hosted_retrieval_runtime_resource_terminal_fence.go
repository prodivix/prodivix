package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceTerminalFenceAuthorityIssuerID    = "authority.prodivix.hosted-retrieval-runtime-terminal-ledger"
	evaluationHostedRetrievalRuntimeResourceTerminalFenceImplementationFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-fence-implementation"
)

type evaluationHostedRetrievalRuntimeResourceTerminalCheckpoint struct {
	ShardID          string
	LeaseGeneration  int64
	CheckpointDigest string
	UpdatedAt        time.Time
}

func evaluationHostedRetrievalRuntimeResourceTerminalFenceImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                 evaluationHostedRetrievalRuntimeResourceTerminalFenceImplementationFormat,
		"version":                evaluationHostedRetrievalRuntimeResourceVersion,
		"fenceAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceTerminalFenceAuthorityIssuerID,
	})
}

func evaluationHostedRetrievalRuntimeResourceTerminalOutcome(statuses []string) (string, error) {
	outcome := "completed"
	for _, status := range statuses {
		switch status {
		case "completed":
		case "cancelled":
			if outcome == "completed" {
				outcome = "cancelled"
			}
		case "provider-error", "timed-out", "rate-limited", "schema-failed", "blocked", "infrastructure-error":
			outcome = "failed"
		default:
			return "", ErrConflict
		}
	}
	return outcome, nil
}

func createEvaluationHostedRetrievalRuntimeResourceTerminalFenceTx(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
	checkedAt time.Time,
) (map[string]any, []byte, error) {
	partition := EvaluationPlanPartition{PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit}
	planRecord, err := loadEvaluationPlanRecord(ctx, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, nil, err
	}
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return nil, nil, ErrConflict
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return nil, nil, err
	}
	expectedByShard := make(map[string]map[string]evaluationStatusPlannedAttempt)
	for _, attempt := range planned {
		if expectedByShard[attempt.ShardID] == nil {
			expectedByShard[attempt.ShardID] = make(map[string]evaluationStatusPlannedAttempt)
		}
		if _, duplicate := expectedByShard[attempt.ShardID][attempt.AttemptID]; duplicate {
			return nil, nil, ErrConflict
		}
		expectedByShard[attempt.ShardID][attempt.AttemptID] = attempt
	}
	expectedShardIDs := make([]string, 0, len(expectedByShard))
	for shardID := range expectedByShard {
		expectedShardIDs = append(expectedShardIDs, shardID)
	}
	expectedShardIDs = sortedEvaluationHostedRetrievalRuntimeResourceStrings(expectedShardIDs)
	expectedShardSetDigest, err := canonicaljson.Digest(map[string]any{
		"format":   "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-id-set",
		"version":  evaluationHostedRetrievalRuntimeResourceVersion,
		"shardIds": expectedShardIDs,
	})
	if err != nil || int64(len(expectedShardIDs)) != request.ExpectedShardCount || expectedShardSetDigest != request.ExpectedShardIDSetDigest {
		return nil, nil, ErrConflict
	}
	var frozenRunDigest, bindingDigest, commitmentDigest string
	err = tx.QueryRowContext(ctx, `SELECT frozen_run_digest,run_config_artifact_binding_digest,resource_set_commitment_digest
		FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND runtime_resource_set_id=$4 FOR SHARE`,
		authority.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RuntimeResourceSetID).Scan(
		&frozenRunDigest, &bindingDigest, &commitmentDigest,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	if frozenRunDigest != request.FrozenRunDigest || bindingDigest != request.RunConfigArtifactBindingDigest ||
		commitmentDigest != request.ResourceSetCommitmentDigest {
		return nil, nil, ErrConflict
	}
	checkpointRows, err := tx.QueryContext(ctx, `SELECT DISTINCT ON (shard_id)
		shard_id,lease_generation,checkpoint_digest,updated_at
		FROM agent_evaluation_checkpoints
		WHERE namespace_id=$1 AND plan_digest=$2 AND state='completed'
		ORDER BY shard_id COLLATE "C",revision DESC`, authority.NamespaceID, request.PlanDigest)
	if err != nil {
		return nil, nil, err
	}
	checkpoints := make(map[string]evaluationHostedRetrievalRuntimeResourceTerminalCheckpoint, len(expectedShardIDs))
	for checkpointRows.Next() {
		var checkpoint evaluationHostedRetrievalRuntimeResourceTerminalCheckpoint
		if err := checkpointRows.Scan(&checkpoint.ShardID, &checkpoint.LeaseGeneration, &checkpoint.CheckpointDigest, &checkpoint.UpdatedAt); err != nil {
			_ = checkpointRows.Close()
			return nil, nil, err
		}
		if _, expected := expectedByShard[checkpoint.ShardID]; !expected || checkpoint.LeaseGeneration < 1 ||
			!evaluationDigestPattern.MatchString(checkpoint.CheckpointDigest) || checkpoint.UpdatedAt.IsZero() {
			_ = checkpointRows.Close()
			return nil, nil, ErrConflict
		}
		checkpoints[checkpoint.ShardID] = checkpoint
	}
	if err := checkpointRows.Close(); err != nil {
		return nil, nil, err
	}
	if len(checkpoints) != len(expectedShardIDs) {
		return nil, nil, ErrConflict
	}
	attemptRows, err := tx.QueryContext(ctx, `SELECT attempt_id,shard_id,status,attempt_digest,completed_at,attempt_bytes
		FROM agent_evaluation_attempts WHERE namespace_id=$1 AND plan_digest=$2
		ORDER BY shard_id COLLATE "C",attempt_id COLLATE "C" FOR SHARE`, authority.NamespaceID, request.PlanDigest)
	if err != nil {
		return nil, nil, err
	}
	attemptsByShard := make(map[string][]evaluationAttemptFact, len(expectedShardIDs))
	seenAttempts := make(map[string]struct{}, len(planned))
	for attemptRows.Next() {
		var attemptID, shardID, status, attemptDigest string
		var completedAt time.Time
		var source []byte
		if err := attemptRows.Scan(&attemptID, &shardID, &status, &attemptDigest, &completedAt, &source); err != nil {
			_ = attemptRows.Close()
			return nil, nil, err
		}
		expected, ok := expectedByShard[shardID][attemptID]
		if !ok {
			_ = attemptRows.Close()
			return nil, nil, ErrConflict
		}
		decoded, err := decodeEvaluationAttempt(source)
		if err != nil || !bytes.Equal(source, decoded.Canonical) || decoded.AttemptID != attemptID || decoded.ShardID != shardID ||
			decoded.Status != status || decoded.AttemptDigest != attemptDigest || !decoded.CompletedAt.Equal(completedAt) ||
			decoded.DescriptorDigest != expected.DescriptorDigest {
			_ = attemptRows.Close()
			return nil, nil, ErrConflict
		}
		if _, duplicate := seenAttempts[attemptID]; duplicate {
			_ = attemptRows.Close()
			return nil, nil, ErrConflict
		}
		seenAttempts[attemptID] = struct{}{}
		attemptsByShard[shardID] = append(attemptsByShard[shardID], decoded)
	}
	if err := attemptRows.Close(); err != nil {
		return nil, nil, err
	}
	if len(seenAttempts) != len(planned) {
		return nil, nil, ErrConflict
	}
	terminalRecords := make([]any, 0, len(expectedShardIDs))
	shardAttemptSets := make([]any, 0, len(expectedShardIDs))
	shardGenerations := make([]any, 0, len(expectedShardIDs))
	allTerminalAt := time.Time{}
	globalOutcome := "completed"
	for _, shardID := range expectedShardIDs {
		attempts := attemptsByShard[shardID]
		if len(attempts) != len(expectedByShard[shardID]) || len(attempts) == 0 {
			return nil, nil, ErrConflict
		}
		sort.Slice(attempts, func(left, right int) bool {
			return bytes.Compare([]byte(attempts[left].AttemptID), []byte(attempts[right].AttemptID)) < 0
		})
		attemptIDs := make([]any, len(attempts))
		terminalAttempts := make([]any, len(attempts))
		statuses := make([]string, len(attempts))
		terminalAt := checkpoints[shardID].UpdatedAt
		for index, attempt := range attempts {
			attemptIDs[index] = attempt.AttemptID
			statuses[index] = attempt.Status
			terminalAttempts[index] = map[string]any{
				"attemptId": attempt.AttemptID, "attemptDigest": attempt.AttemptDigest,
				"status": attempt.Status, "completedAt": evaluationExportInstant(attempt.CompletedAt),
			}
			if attempt.CompletedAt.After(terminalAt) {
				terminalAt = attempt.CompletedAt
			}
		}
		shardOutcome, err := evaluationHostedRetrievalRuntimeResourceTerminalOutcome(statuses)
		if err != nil {
			return nil, nil, err
		}
		if shardOutcome == "failed" || shardOutcome == "cancelled" && globalOutcome == "completed" {
			globalOutcome = shardOutcome
		}
		if terminalAt.After(allTerminalAt) {
			allTerminalAt = terminalAt
		}
		attemptIDSetDigest, err := canonicaljson.Digest(map[string]any{
			"format":  "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-attempt-id-set",
			"version": evaluationHostedRetrievalRuntimeResourceVersion, "shardId": shardID, "attemptIds": attemptIDs,
		})
		if err != nil {
			return nil, nil, err
		}
		attemptResultSetDigest, err := canonicaljson.Digest(map[string]any{
			"format":  "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-attempt-result-set",
			"version": evaluationHostedRetrievalRuntimeResourceVersion, "shardId": shardID, "terminalAttempts": terminalAttempts,
		})
		if err != nil {
			return nil, nil, err
		}
		checkpoint := checkpoints[shardID]
		recordBase := map[string]any{
			"shardId": shardID, "shardLeaseGeneration": checkpoint.LeaseGeneration, "checkpointDigest": checkpoint.CheckpointDigest,
			"terminalAttemptCount": int64(len(attempts)), "terminalAttemptIdSetDigest": attemptIDSetDigest,
			"terminalAttemptResultSetDigest": attemptResultSetDigest, "terminalOutcome": shardOutcome,
			"terminalAt": evaluationExportInstant(terminalAt),
		}
		record, _, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(recordBase, "terminalRecordDigest")
		if err != nil {
			return nil, nil, err
		}
		terminalRecords = append(terminalRecords, record)
		shardAttemptSets = append(shardAttemptSets, map[string]any{
			"shardId": shardID, "terminalAttemptCount": int64(len(attempts)), "terminalAttemptIdSetDigest": attemptIDSetDigest,
		})
		shardGenerations = append(shardGenerations, map[string]any{"shardId": shardID, "shardLeaseGeneration": checkpoint.LeaseGeneration})
	}
	if checkedAt.Before(allTerminalAt) {
		return nil, nil, ErrConflict
	}
	terminalAttemptIDSetDigest, err := canonicaljson.Digest(map[string]any{
		"format":  "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-attempt-id-set",
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "shardAttemptSets": shardAttemptSets,
	})
	if err != nil {
		return nil, nil, err
	}
	generationSetDigest, err := canonicaljson.Digest(map[string]any{
		"format":  "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-lease-generation-set",
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "generations": shardGenerations,
	})
	if err != nil {
		return nil, nil, err
	}
	resultSetDigest, err := canonicaljson.Digest(map[string]any{
		"format":  "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-result-set",
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "terminalShardRecords": terminalRecords,
	})
	if err != nil {
		return nil, nil, err
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceTerminalFenceImplementationDigest()
	if err != nil {
		return nil, nil, err
	}
	fenceBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceTerminalFenceFormat, "version": evaluationHostedRetrievalRuntimeResourceVersion,
		"fenceId":                            "hosted-runtime-terminal-fence." + strings.TrimPrefix(request.PlanDigest, "sha256-"),
		"fenceAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceTerminalFenceAuthorityIssuerID,
		"fenceAuthorityImplementationDigest": implementationDigest, "fenceLedgerRevision": int64(1),
		"namespaceId": request.NamespaceID, "repositoryCommit": request.RepositoryCommit, "planDigest": request.PlanDigest,
		"frozenRunDigest": request.FrozenRunDigest, "runConfigArtifactBindingDigest": request.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId": request.RuntimeResourceSetID, "expectedShardCount": int64(len(expectedShardIDs)),
		"terminalShardCount": int64(len(expectedShardIDs)), "terminalShardIdSetDigest": expectedShardSetDigest,
		"terminalAttemptIdSetDigest": terminalAttemptIDSetDigest, "terminalShardLeaseGenerationSetDigest": generationSetDigest,
		"terminalShardResultSetDigest": resultSetDigest, "terminalOutcome": globalOutcome,
		"allShardsTerminalAt": evaluationExportInstant(allTerminalAt), "sealedAt": evaluationExportInstant(checkedAt),
	}
	fence, fenceBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(fenceBase, "fenceDigest")
	if err != nil || len(fenceBytes) > maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes {
		return nil, nil, ErrConflict
	}
	expectedShardBytes, err := canonicaljson.Bytes(expectedShardIDs)
	if err != nil {
		return nil, nil, err
	}
	terminalRecordsBytes, err := canonicaljson.Bytes(terminalRecords)
	if err != nil {
		return nil, nil, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences (
		namespace_id,plan_digest,repository_commit,runtime_resource_set_id,fence_digest,fence_id,
		fence_authority_issuer_id,fence_authority_implementation_digest,fence_ledger_revision,
		expected_shard_count,terminal_shard_count,terminal_shard_id_set_digest,terminal_attempt_id_set_digest,
		terminal_shard_lease_generation_set_digest,terminal_shard_result_set_digest,terminal_outcome,
		all_shards_terminal_at,sealed_at,expected_shard_ids_json,expected_shard_ids_bytes,
		terminal_shard_records_json,terminal_shard_records_bytes,fence_json,fence_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19::jsonb,$20,$21::jsonb,$22,TRUE)`,
		request.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RuntimeResourceSetID,
		stringMember(fence, "fenceDigest"), stringMember(fence, "fenceId"), evaluationHostedRetrievalRuntimeResourceTerminalFenceAuthorityIssuerID,
		implementationDigest, int64(len(expectedShardIDs)), expectedShardSetDigest, terminalAttemptIDSetDigest,
		generationSetDigest, resultSetDigest, globalOutcome, allTerminalAt, checkedAt, string(expectedShardBytes), expectedShardBytes,
		string(terminalRecordsBytes), terminalRecordsBytes, string(fenceBytes), fenceBytes)
	if err != nil {
		return nil, nil, err
	}
	return fence, fenceBytes, nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) DeriveTerminalFence(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil || validateEvaluationAuthority(authority) != nil ||
		request.NamespaceID != authority.NamespaceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	checkedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if checkedAt.IsZero() || checkedAt.Before(request.RequestedAt) {
		return nil, false, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingRequest, existingReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT request.request_bytes,receipt.receipt_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_requests request
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_receipts receipt
		  ON receipt.namespace_id=request.namespace_id AND receipt.plan_digest=request.plan_digest
		 AND receipt.repository_commit=request.repository_commit AND receipt.request_digest=request.request_digest
		WHERE request.namespace_id=$1 AND request.plan_digest=$2 AND request.repository_commit=$3 AND request.request_digest=$4 FOR SHARE`,
		request.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RequestDigest).Scan(&existingRequest, &existingReceipt)
	if err == nil {
		if !bytes.Equal(existingRequest, request.Canonical) {
			return nil, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return existingReceipt, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_requests (
		namespace_id,plan_digest,repository_commit,request_digest,frozen_run_digest,run_config_artifact_binding_digest,
		runtime_resource_set_id,resource_set_commitment_digest,expected_shard_count,expected_shard_id_set_digest,
		requested_at,request_json,request_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`, request.NamespaceID,
		request.PlanDigest, request.RepositoryCommit, request.RequestDigest, request.FrozenRunDigest,
		request.RunConfigArtifactBindingDigest, request.RuntimeResourceSetID, request.ResourceSetCommitmentDigest,
		request.ExpectedShardCount, request.ExpectedShardIDSetDigest, request.RequestedAt, string(request.Canonical), request.Canonical)
	if err != nil {
		return nil, false, err
	}
	var fenceBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT fence_bytes FROM agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND runtime_resource_set_id=$4 FOR SHARE`,
		request.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.RuntimeResourceSetID).Scan(&fenceBytes)
	var fence map[string]any
	if err == nil {
		fence, err = decodeCanonicalEvaluationObject(fenceBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
		if err != nil || validateEvaluationHostedArchiveSelfDigest(fence, evaluationHostedTerminalFenceKeys,
			evaluationHostedRetrievalRuntimeResourceTerminalFenceFormat, "fenceDigest") != nil {
			return nil, false, ErrConflict
		}
	} else if errors.Is(err, sql.ErrNoRows) {
		fence, fenceBytes, err = createEvaluationHostedRetrievalRuntimeResourceTerminalFenceTx(ctx, tx, authority, request, checkedAt)
		if err != nil {
			return nil, false, err
		}
	} else {
		return nil, false, err
	}
	expiresAt := checkedAt.Add(125 * time.Second)
	receiptBase := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptFormat,
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "requestDigest": request.RequestDigest,
		"namespaceId": request.NamespaceID, "repositoryCommit": request.RepositoryCommit, "planDigest": request.PlanDigest,
		"frozenRunDigest": request.FrozenRunDigest, "runConfigArtifactBindingDigest": request.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId": request.RuntimeResourceSetID, "resourceSetCommitmentDigest": request.ResourceSetCommitmentDigest,
		"expectedShardCount": request.ExpectedShardCount, "expectedShardIdSetDigest": request.ExpectedShardIDSetDigest,
		"runTerminalFence": fence, "runTerminalFenceDigest": stringMember(fence, "fenceDigest"),
		"checkedAt": evaluationExportInstant(checkedAt), "expiresAt": evaluationExportInstant(expiresAt),
	}
	receipt, receiptBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(receiptBase, "receiptDigest")
	if err != nil || len(receiptBytes) > evaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptMaxBytes {
		return nil, false, ErrConflict
	}
	if _, err = decodeEvaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveReceiptValue(receipt); err != nil {
		return nil, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_receipts (
		namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,runtime_resource_set_id,
		resource_set_commitment_digest,expected_shard_count,expected_shard_id_set_digest,run_terminal_fence_digest,
		checked_at,expires_at,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`, request.NamespaceID, request.PlanDigest,
		request.RepositoryCommit, request.RequestDigest, stringMember(receipt, "receiptDigest"), request.RuntimeResourceSetID,
		request.ResourceSetCommitmentDigest, request.ExpectedShardCount, request.ExpectedShardIDSetDigest,
		stringMember(fence, "fenceDigest"), checkedAt, expiresAt, string(receiptBytes), receiptBytes)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return receiptBytes, false, nil
}
