package agent

import (
	"context"
	"fmt"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationCapabilityEffectProviderRuntimeArchiveSourceRow struct {
	stageBytes                []byte
	resultBytes               []byte
	effectSourceReceiptDigest string
}

func queryEvaluationCapabilityEffectProviderRuntimeArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCapabilityEffectProviderRuntimeArchiveRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return nil, err
	}
	rows, err := queryer.QueryContext(ctx, `SELECT stage.record_bytes,result.record_bytes,
		source.source_effect_receipt_digest
	FROM agent_evaluation_capability_effect_provider_journal_stages AS stage
	JOIN agent_evaluation_capability_effect_provider_journal_results AS result
	  ON result.namespace_id=stage.namespace_id AND result.plan_digest=stage.plan_digest
	 AND result.repository_commit=stage.repository_commit
	 AND result.owner_instance_id=stage.owner_instance_id
	 AND result.owner_request_digest=stage.owner_request_digest AND result.v46_eligible
	JOIN agent_evaluation_optional_capability_fact_sources AS source
	  ON source.namespace_id=stage.namespace_id AND source.plan_digest=stage.plan_digest
	 AND source.repository_commit=stage.repository_commit AND source.attempt_id=stage.attempt_id
	 AND source.turn_index=stage.turn_index
	 AND source.source_pre_effect_intent_digest=stage.pre_effect_intent_digest
	 AND source.source_effect_receipt_json#>>'{ownerRequestDigest}'=stage.owner_request_digest
	 AND source.provider_runtime_journal_result_record_digest=result.record_digest
	 AND source.provider_runtime_result_seal_receipt_digest=result.result_seal_receipt_digest
	 AND source.v46_eligible
	WHERE stage.namespace_id=$1 AND stage.plan_digest=$2 AND stage.repository_commit=$3
	  AND stage.v46_eligible
	ORDER BY stage.attempt_id COLLATE "C",stage.turn_index,stage.owner_request_digest COLLATE "C"
	LIMIT $4`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make(map[string]evaluationCapabilityEffectProviderRuntimeArchiveSourceRow)
	orderedOwners := make([]string, 0)
	stages := make(map[string]EvaluationCapabilityEffectProviderJournalStageRecord)
	for rows.Next() {
		var row evaluationCapabilityEffectProviderRuntimeArchiveSourceRow
		if err := rows.Scan(&row.stageBytes, &row.resultBytes, &row.effectSourceReceiptDigest); err != nil {
			return nil, err
		}
		stage, err := decodeEvaluationCapabilityEffectProviderJournalStageRecord(row.stageBytes)
		if err != nil || stage.NamespaceID != authority.NamespaceID || stage.PlanDigest != partition.PlanDigest ||
			stage.RepositoryCommit != partition.RepositoryCommit ||
			!evaluationDigestPattern.MatchString(row.effectSourceReceiptDigest) {
			return nil, ErrConflict
		}
		if _, duplicate := entries[stage.OwnerRequestDigest]; duplicate {
			return nil, conflict("evaluation Provider runtime journal archive source is duplicated")
		}
		entries[stage.OwnerRequestDigest] = row
		stages[stage.OwnerRequestDigest] = stage
		orderedOwners = append(orderedOwners, stage.OwnerRequestDigest)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(entries) > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords {
		return nil, conflict("evaluation Provider runtime journal archive exceeds its record capacity")
	}

	executionRows, err := queryer.QueryContext(ctx, `SELECT execution.owner_request_digest,execution.record_bytes
	FROM agent_evaluation_capability_effect_provider_journal_executions AS execution
	JOIN agent_evaluation_capability_effect_provider_journal_stages AS stage
	  ON stage.namespace_id=execution.namespace_id AND stage.plan_digest=execution.plan_digest
	 AND stage.repository_commit=execution.repository_commit
	 AND stage.owner_instance_id=execution.owner_instance_id
	 AND stage.owner_request_digest=execution.owner_request_digest AND stage.v46_eligible
	JOIN agent_evaluation_capability_effect_provider_journal_results AS result
	  ON result.namespace_id=stage.namespace_id AND result.plan_digest=stage.plan_digest
	 AND result.repository_commit=stage.repository_commit
	 AND result.owner_instance_id=stage.owner_instance_id
	 AND result.owner_request_digest=stage.owner_request_digest AND result.v46_eligible
	JOIN agent_evaluation_optional_capability_fact_sources AS source
	  ON source.namespace_id=stage.namespace_id AND source.plan_digest=stage.plan_digest
	 AND source.repository_commit=stage.repository_commit AND source.attempt_id=stage.attempt_id
	 AND source.turn_index=stage.turn_index
	 AND source.source_pre_effect_intent_digest=stage.pre_effect_intent_digest
	 AND source.source_effect_receipt_json#>>'{ownerRequestDigest}'=stage.owner_request_digest
	 AND source.provider_runtime_journal_result_record_digest=result.record_digest
	 AND source.provider_runtime_result_seal_receipt_digest=result.result_seal_receipt_digest
	 AND source.v46_eligible
	WHERE execution.namespace_id=$1 AND execution.plan_digest=$2 AND execution.repository_commit=$3
	  AND execution.v46_eligible
	ORDER BY execution.owner_request_digest COLLATE "C",execution.execution_sequence
	LIMIT $4`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords*maximumEvaluationCapabilityEffectProviderJournalOwnerExecutions+1)
	if err != nil {
		return nil, err
	}
	defer executionRows.Close()
	executions := make(map[string][]EvaluationCapabilityEffectProviderJournalExecutionRecord, len(entries))
	for executionRows.Next() {
		var ownerRequestDigest string
		var recordBytes []byte
		if err := executionRows.Scan(&ownerRequestDigest, &recordBytes); err != nil {
			return nil, err
		}
		stage, relevant := stages[ownerRequestDigest]
		if !relevant {
			continue
		}
		value, err := decodeCanonicalEvaluationObject(recordBytes, maximumEvaluationCapabilityEffectProviderJournalExecutionBytes)
		if err != nil {
			return nil, err
		}
		chain := executions[ownerRequestDigest]
		var prior *EvaluationCapabilityEffectProviderJournalExecutionRecord
		if len(chain) > 0 {
			prior = &chain[len(chain)-1]
		}
		record, err := decodeEvaluationCapabilityEffectProviderJournalExecutionRecord(value, stage, prior)
		if err != nil {
			return nil, err
		}
		executions[ownerRequestDigest] = append(chain, record)
	}
	if err := executionRows.Err(); err != nil {
		return nil, err
	}

	records := make([]EvaluationCapabilityEffectProviderRuntimeArchiveRecord, 0, len(entries))
	var totalBytes int64
	for _, ownerRequestDigest := range orderedOwners {
		row := entries[ownerRequestDigest]
		stage := stages[ownerRequestDigest]
		chain := executions[ownerRequestDigest]
		result, err := decodeEvaluationCapabilityEffectProviderJournalResultRecord(row.resultBytes, stage, chain)
		if err != nil {
			return nil, err
		}
		executionValues := make([]any, len(chain))
		for index := range chain {
			executionValues[index] = chain[index].Value
		}
		base := map[string]any{
			"format":                    evaluationCapabilityEffectProviderRuntimeArchiveFormat,
			"version":                   int64(1),
			"attemptId":                 stage.AttemptID,
			"turnIndex":                 stage.TurnIndex,
			"ownerRequestDigest":        stage.OwnerRequestDigest,
			"preEffectIntentDigest":     stage.PreEffectIntentDigest,
			"stageRecord":               stage.Value,
			"executionRecords":          executionValues,
			"resultRecord":              result.Value,
			"effectSourceReceiptDigest": row.effectSourceReceiptDigest,
		}
		recordDigest, err := canonicaljson.Digest(base)
		if err != nil {
			return nil, err
		}
		value := cloneEvaluationObject(base)
		value["recordDigest"] = recordDigest
		recordBytes, err := canonicaljson.Bytes(value)
		if err != nil || len(recordBytes) < 1 || len(recordBytes) > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecordBytes {
			return nil, fmt.Errorf("%w: evaluation Provider runtime journal archive record is unbounded", ErrConflict)
		}
		totalBytes += int64(len(recordBytes))
		if totalBytes > maximumEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBytes {
			return nil, conflict("evaluation Provider runtime journal archive exceeds its family capacity")
		}
		records = append(records, EvaluationCapabilityEffectProviderRuntimeArchiveRecord{
			NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest,
			RepositoryCommit: partition.RepositoryCommit, AttemptID: stage.AttemptID,
			TurnIndex: stage.TurnIndex, OwnerRequestDigest: stage.OwnerRequestDigest,
			PreEffectIntentDigest:                    stage.PreEffectIntentDigest,
			EffectSourceReceiptDigest:                row.effectSourceReceiptDigest,
			ProviderRuntimeJournalResultRecordDigest: result.RecordDigest,
			ProviderRuntimeResultSealReceiptDigest:   result.ResultSealReceiptDigest,
			RecordDigest:                             recordDigest, RecordBytes: recordBytes,
		})
	}
	return records, nil
}
