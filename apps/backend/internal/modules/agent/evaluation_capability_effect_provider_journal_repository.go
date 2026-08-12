package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type repositoryEvaluationCapabilityEffectProviderJournal struct {
	repository      *Repository
	ownerInstanceID string
}

type evaluationCapabilityEffectProviderJournalSnapshotData struct {
	Stage       EvaluationCapabilityEffectProviderJournalStageRecord
	Executions  []EvaluationCapabilityEffectProviderJournalExecutionRecord
	Result      *EvaluationCapabilityEffectProviderJournalResultRecord
	Abandonment *EvaluationCapabilityEffectProviderJournalAbandonmentRecord
	Spools      map[int64]map[string]any
}

func evaluationCapabilityEffectProviderJournalNullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func loadEvaluationCapabilityEffectProviderJournalStageTx(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerRequestDigest string,
	ownerInstanceID string,
	lock string,
) (EvaluationCapabilityEffectProviderJournalStageRecord, error) {
	query := `SELECT record_bytes FROM agent_evaluation_capability_effect_provider_journal_stages
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_request_digest=$4 AND owner_instance_id=$5 AND v46_eligible` + lock
	var source []byte
	if err := tx.QueryRowContext(ctx, query, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, ownerRequestDigest, ownerInstanceID).Scan(&source); errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrNotFound
	} else if err != nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, err
	}
	record, err := decodeEvaluationCapabilityEffectProviderJournalStageRecord(source)
	if err != nil || record.NamespaceID != authority.NamespaceID || record.PlanDigest != partition.PlanDigest ||
		record.RepositoryCommit != partition.RepositoryCommit || record.OwnerRequestDigest != ownerRequestDigest {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, ErrConflict
	}
	return record, nil
}

func loadEvaluationCapabilityEffectProviderJournalExecutionsTx(
	ctx context.Context,
	tx *sql.Tx,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	ownerInstanceID string,
) ([]EvaluationCapabilityEffectProviderJournalExecutionRecord, error) {
	rows, err := tx.QueryContext(ctx, `SELECT record_bytes
		FROM agent_evaluation_capability_effect_provider_journal_executions
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_instance_id=$4 AND owner_request_digest=$5 AND v46_eligible
		ORDER BY execution_sequence FOR SHARE`, stage.NamespaceID, stage.PlanDigest,
		stage.RepositoryCommit, ownerInstanceID, stage.OwnerRequestDigest)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationCapabilityEffectProviderJournalExecutionRecord, 0, 4)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationCapabilityEffectProviderJournalExecutionBytes)
		if err != nil {
			return nil, err
		}
		var prior *EvaluationCapabilityEffectProviderJournalExecutionRecord
		if len(records) > 0 {
			prior = &records[len(records)-1]
		}
		record, err := decodeEvaluationCapabilityEffectProviderJournalExecutionRecord(value, stage, prior)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *repositoryEvaluationCapabilityEffectProviderJournal) StoreStage(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	record EvaluationCapabilityEffectProviderJournalStageRecord,
) (EvaluationCapabilityEffectProviderJournalStageRecord, bool, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, errEvaluationServiceUnavailable
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingOwnerInstanceID string
	var existing []byte
	err = tx.QueryRowContext(ctx, `SELECT owner_instance_id,record_bytes
		FROM agent_evaluation_capability_effect_provider_journal_stages
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_request_digest=$4 FOR UPDATE`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, record.OwnerRequestDigest).Scan(&existingOwnerInstanceID, &existing)
	if err == nil {
		if existingOwnerInstanceID != repository.ownerInstanceID || !bytes.Equal(existing, record.RecordBytes) {
			return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, ErrConflict
		}
		stored, err := decodeEvaluationCapabilityEffectProviderJournalStageRecord(existing)
		if err != nil {
			return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
		}
		return stored, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
	}
	var controlledRequestDigest string
	var controlledIntentBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT request_digest,pre_effect_intent_bytes
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND service_kind='provider-capability' AND operation='tool.execute'
		  AND route_binding='capability-runtime/execute-tool' AND attempt_id=$4
		  AND descriptor_digest=$5 AND pre_effect_intent_digest=$6
		  AND state='dispatched' AND v46_eligible FOR SHARE`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, record.AttemptID,
		record.DescriptorDigest, record.PreEffectIntentDigest).Scan(&controlledRequestDigest, &controlledIntentBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false,
			conflict("evaluation Provider journal stage lacks its dispatched controlled request")
	}
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
	}
	if !bytes.Equal(controlledIntentBytes, record.PreEffectIntentBytes) {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false,
			conflict("evaluation Provider journal stage pre-effect intent drifted")
	}
	if err := requireEvaluationCapabilityEffectSourceClaimForStageTx(ctx, tx, record, repository.ownerInstanceID); err != nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
	}
	// A durable stage ACK authorizes Provider dispatch. From this point the
	// source remains consumed even when the execution write ACK is lost.
	if err := consumeEvaluationCapabilityEffectSourceClaimTx(ctx, tx, record, repository.ownerInstanceID, record.SealedAt); err != nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_provider_journal_stages (
		namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest,controlled_request_digest,
		record_digest,attempt_id,descriptor_digest,turn_index,invocation_id,owner_request_id,
		runtime_fact_source_authority_digest,pre_effect_intent_digest,stage_digest,binding_kind,capability_id,
		provider_resource_set_commitment_digest,provider_resource_authority_digest,
		provider_resource_read_request_digest,provider_resource_read_receipt_digest,
		expires_at,sealed_at,record_json,record_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25,TRUE)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, record.OwnerRequestDigest,
		controlledRequestDigest, record.RecordDigest, record.AttemptID, record.DescriptorDigest, record.TurnIndex,
		record.InvocationID, record.OwnerRequestID, record.RuntimeFactSourceAuthorityDigest,
		record.PreEffectIntentDigest, record.StageDigest, record.BindingKind, record.CapabilityID,
		evaluationCapabilityEffectProviderJournalNullable(record.ProviderResourceSetCommitmentDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.ProviderResourceAuthorityDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.ProviderResourceReadRequestDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.ProviderResourceReadReceiptDigest),
		record.ExpiresAt, record.SealedAt, string(record.RecordBytes), record.RecordBytes)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityEffectProviderJournalStageRecord{}, false, err
	}
	return record, false, nil
}

func (repository *repositoryEvaluationCapabilityEffectProviderJournal) StoreExecution(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	source []byte,
) (EvaluationCapabilityEffectProviderJournalExecutionRecord, bool, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, errEvaluationServiceUnavailable
	}
	value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalExecutionWriteBytes)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	recordValue, ok := objectMember(value, "executionRecord")
	if !ok {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, ErrInvalid
	}
	ownerRequestDigest := stringMember(recordValue, "ownerRequestDigest")
	sequence, sequenceOK := integerMember(recordValue, "executionSequence")
	writeDigest := stringMember(value, "writeDigest")
	if !sequenceOK || !evaluationDigestPattern.MatchString(ownerRequestDigest) || !evaluationDigestPattern.MatchString(writeDigest) {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	stage, err := loadEvaluationCapabilityEffectProviderJournalStageTx(
		ctx, tx, authority, partition, ownerRequestDigest, repository.ownerInstanceID, " FOR UPDATE",
	)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	chain, err := loadEvaluationCapabilityEffectProviderJournalExecutionsTx(ctx, tx, stage, repository.ownerInstanceID)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	if sequence < int64(len(chain)) {
		stored := chain[sequence]
		var storedWriteDigest string
		if err := tx.QueryRowContext(ctx, `SELECT write_digest
			FROM agent_evaluation_capability_effect_provider_journal_executions
			WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			  AND owner_instance_id=$4 AND owner_request_digest=$5 AND execution_sequence=$6`, authority.NamespaceID,
			partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, ownerRequestDigest, sequence).Scan(&storedWriteDigest); err != nil {
			return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
		}
		if storedWriteDigest != writeDigest {
			return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
		}
		return stored, true, nil
	}
	if sequence != int64(len(chain)) {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false,
			conflict("evaluation Provider journal execution chain contains a gap")
	}
	var terminalCount int64
	if err := tx.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_results
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND owner_instance_id=$4 AND owner_request_digest=$5)+
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_abandonments
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND owner_instance_id=$4 AND owner_request_digest=$5)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, ownerRequestDigest).Scan(&terminalCount); err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	if terminalCount != 0 {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, ErrConflict
	}
	var prior *EvaluationCapabilityEffectProviderJournalExecutionRecord
	if len(chain) > 0 {
		prior = &chain[len(chain)-1]
	}
	write, err := decodeEvaluationCapabilityEffectProviderJournalExecutionWrite(source, stage, prior)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	record := write.ExecutionRecord
	if err := requireEvaluationCapabilityEffectProviderJournalCitationTx(ctx, tx, stage, record); err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	if err := consumeEvaluationCapabilityEffectSourceClaimTx(ctx, tx, stage, repository.ownerInstanceID, record.SealedAt); err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_provider_journal_executions (
		namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest,execution_sequence,write_digest,
		record_digest,prior_execution_record_digest,stage_digest,execution_receipt_digest,operation,
		dispatch_intent_digest,transport_receipt_digest,spool_receipt_digest,spool_ref,spool_aad_digest,
		spool_envelope_digest,ciphertext_digest,ciphertext_size_bytes,response_body_digest,
		response_projection_digest,response_digest,normalized_event_set_digest,retrieval_citation_resource_id,executed_at,sealed_at,
		record_json,record_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28::jsonb,$29,TRUE)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, record.OwnerRequestDigest,
		record.ExecutionSequence, write.WriteDigest, record.RecordDigest,
		evaluationCapabilityEffectProviderJournalNullable(record.PriorExecutionRecordDigest), record.StageDigest,
		record.ExecutionReceiptDigest, record.Operation, record.DispatchIntentDigest, record.TransportReceiptDigest,
		evaluationCapabilityEffectProviderJournalNullable(record.SpoolReceiptDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.SpoolRef),
		evaluationCapabilityEffectProviderJournalNullable(record.SpoolAADDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.SpoolEnvelopeDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.CiphertextDigest),
		func() any {
			if record.SpoolReceipt == nil {
				return nil
			}
			return record.CiphertextSizeBytes
		}(),
		evaluationCapabilityEffectProviderJournalNullable(record.ResponseBodyDigest), record.ResponseProjectionDigest,
		record.ResponseDigest, record.NormalizedEventSetDigest,
		evaluationCapabilityEffectProviderJournalNullable(record.RetrievalCitationResourceID), record.ExecutedAt, record.SealedAt,
		string(record.RecordBytes), record.RecordBytes)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	if write.SpoolEnvelope != nil {
		_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_provider_journal_spool_payloads (
			namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest,execution_sequence,
			spool_ref,spool_receipt_digest,expires_at,spool_envelope_json,spool_envelope_bytes,ciphertext_present
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,TRUE)`, authority.NamespaceID,
			partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, record.OwnerRequestDigest, record.ExecutionSequence,
			record.SpoolRef, record.SpoolReceiptDigest, record.SpoolReceipt.ExpiresAt,
			string(write.SpoolEnvelopeBytes), write.SpoolEnvelopeBytes)
		if err != nil {
			return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{}, false, err
	}
	return record, false, nil
}

func requireEvaluationCapabilityEffectProviderJournalCitationTx(
	ctx context.Context,
	tx *sql.Tx,
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	record EvaluationCapabilityEffectProviderJournalExecutionRecord,
) error {
	if stage.BindingKind != "hosted-retrieval-query" {
		if record.RetrievalCitationResourceID != "" {
			return conflict("non-hosted Provider journal execution carried a retrieval citation resource")
		}
		return nil
	}
	if record.RetrievalCitationResourceID == "" {
		return nil
	}
	var authorityBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT authority_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4
		FOR SHARE`, stage.NamespaceID, stage.PlanDigest, stage.RepositoryCommit,
		stage.ProviderResourceAuthorityDigest).Scan(&authorityBytes); errors.Is(err, sql.ErrNoRows) {
		return conflict("hosted Provider journal citation lacks its durable resource authority")
	} else if err != nil {
		return err
	}
	authority, err := decodeCanonicalEvaluationObject(authorityBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || stringMember(authority, "authorityDigest") != stage.ProviderResourceAuthorityDigest {
		return conflict("hosted Provider journal citation resource authority drifted")
	}
	if stringMember(authority, "providerResourceId") == record.RetrievalCitationResourceID {
		return nil
	}
	auxiliary, ok := arrayMember(authority, "auxiliaryResourceIds")
	if !ok {
		return ErrConflict
	}
	for _, candidate := range auxiliary {
		if candidate == record.RetrievalCitationResourceID {
			return nil
		}
	}
	return conflict("hosted Provider journal citation referenced a foreign resource")
}

func insertEvaluationCapabilityEffectProviderJournalDispositionTx(
	ctx context.Context,
	tx *sql.Tx,
	ownerInstanceID string,
	identity evaluationCapabilityEffectProviderJournalIdentity,
	disposition evaluationCapabilityEffectProviderSpoolDisposition,
) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_provider_journal_spool_dispositions (
		namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest,execution_sequence,receipt_digest,
		disposition,result_seal_receipt_digest,abandonment_reason,disposed_at,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`, identity.NamespaceID,
		identity.PlanDigest, identity.RepositoryCommit, ownerInstanceID, identity.OwnerRequestDigest, disposition.ExecutionSequence,
		disposition.ReceiptDigest, disposition.Disposition,
		evaluationCapabilityEffectProviderJournalNullable(disposition.ResultSealReceiptDigest),
		evaluationCapabilityEffectProviderJournalNullable(disposition.AbandonmentReason), disposition.DisposedAt,
		string(disposition.Canonical), disposition.Canonical)
	return err
}

func deleteEvaluationCapabilityEffectProviderJournalPayloadTx(
	ctx context.Context,
	tx *sql.Tx,
	ownerInstanceID string,
	identity evaluationCapabilityEffectProviderJournalIdentity,
	sequence int64,
) error {
	result, err := tx.ExecContext(ctx, `DELETE FROM agent_evaluation_capability_effect_provider_journal_spool_payloads
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_instance_id=$4 AND owner_request_digest=$5 AND execution_sequence=$6`, identity.NamespaceID,
		identity.PlanDigest, identity.RepositoryCommit, ownerInstanceID, identity.OwnerRequestDigest, sequence)
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		if err != nil {
			return err
		}
		return conflict("evaluation Provider journal terminal disposition lacks its encrypted payload")
	}
	return nil
}

func (repository *repositoryEvaluationCapabilityEffectProviderJournal) StoreResult(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	source []byte,
) (EvaluationCapabilityEffectProviderJournalResultRecord, bool, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, errEvaluationServiceUnavailable
	}
	value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalResultBytes)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	ownerRequestDigest := stringMember(value, "ownerRequestDigest")
	recordDigest := stringMember(value, "recordDigest")
	if !evaluationDigestPattern.MatchString(ownerRequestDigest) || !evaluationDigestPattern.MatchString(recordDigest) {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	stage, err := loadEvaluationCapabilityEffectProviderJournalStageTx(
		ctx, tx, authority, partition, ownerRequestDigest, repository.ownerInstanceID, " FOR UPDATE",
	)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	chain, err := loadEvaluationCapabilityEffectProviderJournalExecutionsTx(ctx, tx, stage, repository.ownerInstanceID)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	var existing []byte
	err = tx.QueryRowContext(ctx, `SELECT record_bytes
		FROM agent_evaluation_capability_effect_provider_journal_results
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_instance_id=$4 AND owner_request_digest=$5`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		repository.ownerInstanceID, ownerRequestDigest).Scan(&existing)
	if err == nil {
		if !bytes.Equal(existing, source) {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, ErrConflict
		}
		stored, err := decodeEvaluationCapabilityEffectProviderJournalResultRecord(existing, stage, chain)
		if err != nil {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
		}
		return stored, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	var abandonmentCount int64
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
		FROM agent_evaluation_capability_effect_provider_journal_abandonments
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_instance_id=$4 AND owner_request_digest=$5`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		repository.ownerInstanceID, ownerRequestDigest).Scan(&abandonmentCount); err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	if abandonmentCount != 0 {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, ErrConflict
	}
	record, err := decodeEvaluationCapabilityEffectProviderJournalResultRecord(source, stage, chain)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	if stage.BindingKind != "hosted-retrieval-query" {
		binding, ok := objectMember(stage.PreEffectIntent, "inputAuthorityBinding")
		if !ok || stringMember(binding, "sourceHandleDigest") != record.ConsumedInputSourceFactDigest {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, ErrConflict
		}
	}
	if err := terminalizeEvaluationCapabilityEffectSourceClaimTx(
		ctx, tx, stage, repository.ownerInstanceID, record.RecordDigest, "", record.SealedAt,
	); err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	for _, disposition := range record.SpoolDispositions {
		if err := insertEvaluationCapabilityEffectProviderJournalDispositionTx(ctx, tx, repository.ownerInstanceID, record.evaluationCapabilityEffectProviderJournalIdentity, disposition); err != nil {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
		}
		if err := deleteEvaluationCapabilityEffectProviderJournalPayloadTx(ctx, tx, repository.ownerInstanceID, record.evaluationCapabilityEffectProviderJournalIdentity, disposition.ExecutionSequence); err != nil {
			return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_provider_journal_results (
		namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest,record_digest,stage_digest,
		terminal_execution_record_digest,result_seal_receipt_digest,result_status,business_result_digest,
		source_fact_kind,source_fact_digest,consumed_input_source_fact_digest,state_vault_retire_request_digest,
		state_vault_retirement_receipt_digest,next_state_vault_seal_request_digest,next_state_vault_seal_receipt_digest,
		provider_resource_set_commitment_digest,provider_resource_authority_digest,
		provider_resource_read_request_digest,provider_resource_read_receipt_digest,sealed_at,
		record_json,record_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25,TRUE)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, record.OwnerRequestDigest,
		record.RecordDigest, record.StageDigest, record.TerminalExecutionRecordDigest, record.ResultSealReceiptDigest,
		record.ResultStatus, record.BusinessResultDigest,
		evaluationCapabilityEffectProviderJournalNullable(record.SourceFactKind),
		evaluationCapabilityEffectProviderJournalNullable(record.SourceFactDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.ConsumedInputSourceFactDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.StateVaultRetireRequestDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.StateVaultRetirementReceiptDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.NextStateVaultSealRequestDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.NextStateVaultSealReceiptDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.ProviderResourceSetCommitmentDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.ProviderResourceAuthorityDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.ProviderResourceReadRequestDigest),
		evaluationCapabilityEffectProviderJournalNullable(record.ProviderResourceReadReceiptDigest),
		record.SealedAt, string(record.RecordBytes), record.RecordBytes)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityEffectProviderJournalResultRecord{}, false, err
	}
	return record, false, nil
}

func createEvaluationCapabilityEffectProviderJournalAbandonment(
	stage EvaluationCapabilityEffectProviderJournalStageRecord,
	executions []EvaluationCapabilityEffectProviderJournalExecutionRecord,
	reason string,
	abandonedAt time.Time,
) (EvaluationCapabilityEffectProviderJournalAbandonmentRecord, error) {
	_, _, retentionPolicyDigest, err := evaluationCapabilityEffectProviderSpoolDigests()
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalAbandonmentRecord{}, err
	}
	dispositionValues := make([]any, 0, len(executions))
	for _, execution := range executions {
		if execution.SpoolReceipt == nil {
			continue
		}
		base := map[string]any{
			"format": evaluationCapabilityEffectProviderSpoolDispositionFormat, "version": int64(1),
			"spoolRef": execution.SpoolRef, "spoolReceiptDigest": execution.SpoolReceiptDigest,
			"planDigest": stage.PlanDigest, "repositoryCommit": stage.RepositoryCommit,
			"attemptId": stage.AttemptID, "descriptorDigest": stage.DescriptorDigest, "turnIndex": stage.TurnIndex,
			"invocationId": stage.InvocationID, "ownerRequestDigest": stage.OwnerRequestDigest,
			"stageDigest": stage.StageDigest, "executionSequence": execution.ExecutionSequence,
			"disposition": "abandoned-and-destroyed", "resultSealReceiptDigest": nil,
			"abandonmentReason": reason, "retentionPolicyDigest": retentionPolicyDigest,
			"disposedAt": evaluationCapabilityEffectProviderJournalInstant(abandonedAt),
		}
		digest, err := canonicaljson.Digest(base)
		if err != nil {
			return EvaluationCapabilityEffectProviderJournalAbandonmentRecord{}, err
		}
		value := cloneEvaluationObject(base)
		value["receiptDigest"] = digest
		dispositionValues = append(dispositionValues, value)
	}
	lastExecutionRecordDigest := any(nil)
	if len(executions) > 0 {
		lastExecutionRecordDigest = executions[len(executions)-1].RecordDigest
	}
	base := map[string]any{
		"format": evaluationCapabilityEffectProviderJournalAbandonmentFormat, "version": int64(1),
		"namespaceId": stage.NamespaceID, "planDigest": stage.PlanDigest, "repositoryCommit": stage.RepositoryCommit,
		"attemptId": stage.AttemptID, "descriptorDigest": stage.DescriptorDigest, "turnIndex": stage.TurnIndex,
		"invocationId": stage.InvocationID, "ownerRequestId": stage.OwnerRequestID,
		"ownerRequestDigest":               stage.OwnerRequestDigest,
		"runtimeFactSourceAuthorityDigest": stage.RuntimeFactSourceAuthorityDigest,
		"preEffectIntentDigest":            stage.PreEffectIntentDigest, "stageDigest": stage.StageDigest,
		"lastExecutionRecordDigest": lastExecutionRecordDigest, "reason": reason,
		"spoolDispositionReceipts": dispositionValues,
		"abandonedAt":              evaluationCapabilityEffectProviderJournalInstant(abandonedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationCapabilityEffectProviderJournalAbandonmentRecord{}, err
	}
	value := cloneEvaluationObject(base)
	value["recordDigest"] = digest
	return decodeEvaluationCapabilityEffectProviderJournalAbandonmentRecord(value, stage, executions)
}

func (repository *repositoryEvaluationCapabilityEffectProviderJournal) StoreCleanup(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationCapabilityEffectProviderJournalCleanupRequest,
	completedAt time.Time,
) (evaluationCapabilityEffectProviderJournalCleanupReceipt, bool, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, errEvaluationServiceUnavailable
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingRequest, existingReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT request.request_bytes,receipt.receipt_bytes
		FROM agent_evaluation_capability_effect_provider_journal_cleanup_requests AS request
		JOIN agent_evaluation_capability_effect_provider_journal_cleanup_receipts AS receipt
		  ON receipt.namespace_id=request.namespace_id AND receipt.plan_digest=request.plan_digest
		 AND receipt.repository_commit=request.repository_commit AND receipt.request_digest=request.request_digest
		 AND receipt.owner_instance_id=request.owner_instance_id
		WHERE request.namespace_id=$1 AND request.plan_digest=$2 AND request.repository_commit=$3
		  AND request.owner_instance_id=$4 AND request.attempt_id=$5 FOR UPDATE OF request`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, repository.ownerInstanceID, request.AttemptID).Scan(&existingRequest, &existingReceipt)
	if err == nil {
		if !bytes.Equal(existingRequest, request.Bytes) {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, ErrConflict
		}
		value, canonical, err := decodeEvaluationJSONObject(existingReceipt, maximumEvaluationCapabilityEffectProviderJournalCleanupBytes)
		if err != nil || stringMember(value, "requestDigest") != request.RequestDigest ||
			!evaluationCapabilityEffectProviderJournalSelfDigest(value, "receiptDigest") {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, ErrConflict
		}
		completed, err := evaluationInstant(value["completedAt"], "capability effect Provider journal cleanup receipt")
		if err != nil {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
		}
		receipt := evaluationCapabilityEffectProviderJournalCleanupReceipt{
			RequestDigest: request.RequestDigest, CompletedAt: completed,
			ReceiptDigest: stringMember(value, "receiptDigest"), Value: value, Bytes: canonical,
		}
		if err := tx.Commit(); err != nil {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
		}
		return receipt, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
	}
	if request.Reason == "attempt-terminal" {
		var attemptCompletedAt time.Time
		if err := tx.QueryRowContext(ctx, `SELECT completed_at FROM agent_evaluation_attempts
			WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND attempt_id=$4 FOR SHARE`,
			authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, request.AttemptID).Scan(&attemptCompletedAt); errors.Is(err, sql.ErrNoRows) {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, ErrConflict
		} else if err != nil {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
		} else if attemptCompletedAt.After(request.RequestedAt) {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, ErrConflict
		}
	}
	rows, err := tx.QueryContext(ctx, `SELECT stage.record_bytes
		FROM agent_evaluation_capability_effect_provider_journal_stages AS stage
		LEFT JOIN agent_evaluation_capability_effect_provider_journal_results AS result
		  ON result.namespace_id=stage.namespace_id AND result.plan_digest=stage.plan_digest
		 AND result.repository_commit=stage.repository_commit AND result.owner_instance_id=stage.owner_instance_id
		 AND result.owner_request_digest=stage.owner_request_digest
		LEFT JOIN agent_evaluation_capability_effect_provider_journal_abandonments AS abandonment
		  ON abandonment.namespace_id=stage.namespace_id AND abandonment.plan_digest=stage.plan_digest
		 AND abandonment.repository_commit=stage.repository_commit AND abandonment.owner_instance_id=stage.owner_instance_id
		 AND abandonment.owner_request_digest=stage.owner_request_digest
		WHERE stage.namespace_id=$1 AND stage.plan_digest=$2 AND stage.repository_commit=$3
		  AND stage.owner_instance_id=$4 AND stage.attempt_id=$5
		  AND result.record_digest IS NULL AND abandonment.record_digest IS NULL
		ORDER BY stage.owner_request_digest COLLATE "C" FOR UPDATE OF stage`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, request.AttemptID)
	if err != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
	}
	stages := make([]EvaluationCapabilityEffectProviderJournalStageRecord, 0)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			_ = rows.Close()
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
		}
		stage, err := decodeEvaluationCapabilityEffectProviderJournalStageRecord(source)
		if err != nil || request.Reason == "stage-expired" && stage.ExpiresAt.After(request.RequestedAt) {
			_ = rows.Close()
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, ErrConflict
		}
		stages = append(stages, stage)
	}
	if err := rows.Close(); err != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_provider_journal_cleanup_requests (
		namespace_id,plan_digest,repository_commit,owner_instance_id,request_digest,attempt_id,reason,requested_at,request_json,request_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, repository.ownerInstanceID, request.RequestDigest, request.AttemptID, request.Reason, request.RequestedAt,
		string(request.Bytes), request.Bytes)
	if err != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
	}
	dispositionDigests := make([]string, 0)
	abandonmentDigests := make([]string, 0, len(stages))
	for _, stage := range stages {
		executions, err := loadEvaluationCapabilityEffectProviderJournalExecutionsTx(ctx, tx, stage, repository.ownerInstanceID)
		if err != nil {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
		}
		abandonment, err := createEvaluationCapabilityEffectProviderJournalAbandonment(stage, executions, request.Reason, completedAt)
		if err != nil {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
		}
		if err := terminalizeEvaluationCapabilityEffectSourceClaimTx(
			ctx, tx, stage, repository.ownerInstanceID, "", abandonment.RecordDigest, abandonment.AbandonedAt,
		); err != nil {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
		}
		for _, disposition := range abandonment.SpoolDispositions {
			if err := insertEvaluationCapabilityEffectProviderJournalDispositionTx(ctx, tx, repository.ownerInstanceID, stage.evaluationCapabilityEffectProviderJournalIdentity, disposition); err != nil {
				return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
			}
			if err := deleteEvaluationCapabilityEffectProviderJournalPayloadTx(ctx, tx, repository.ownerInstanceID, stage.evaluationCapabilityEffectProviderJournalIdentity, disposition.ExecutionSequence); err != nil {
				return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
			}
			dispositionDigests = append(dispositionDigests, disposition.ReceiptDigest)
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_provider_journal_abandonments (
			namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest,record_digest,stage_digest,
			last_execution_record_digest,reason,abandoned_at,record_json,record_bytes,v46_eligible
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,TRUE)`, authority.NamespaceID,
			partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, stage.OwnerRequestDigest, abandonment.RecordDigest,
			abandonment.StageDigest, evaluationCapabilityEffectProviderJournalNullable(abandonment.LastExecutionRecordDigest),
			abandonment.Reason, abandonment.AbandonedAt, string(abandonment.RecordBytes), abandonment.RecordBytes)
		if err != nil {
			return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
		}
		abandonmentDigests = append(abandonmentDigests, abandonment.RecordDigest)
	}
	sort.Strings(dispositionDigests)
	sort.Strings(abandonmentDigests)
	receipt, err := createEvaluationCapabilityEffectProviderJournalCleanupReceipt(request, dispositionDigests, abandonmentDigests, completedAt)
	if err != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_provider_journal_cleanup_receipts (
		namespace_id,plan_digest,repository_commit,owner_instance_id,request_digest,receipt_digest,destroyed_encrypted_spool_count,
		abandonment_disposition_receipt_digests,abandonment_record_digests,residual_encrypted_spool_count,
		unfinished_owner_count,completed_at,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,0,0,$10,$11::jsonb,$12)`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, request.RequestDigest, receipt.ReceiptDigest,
		receipt.DestroyedEncryptedSpoolCount,
		string(mustEvaluationCapabilityEffectProviderJournalCanonical(receipt.AbandonmentDispositionReceiptDigests)),
		string(mustEvaluationCapabilityEffectProviderJournalCanonical(receipt.AbandonmentRecordDigests)),
		receipt.CompletedAt, string(receipt.Bytes), receipt.Bytes)
	if err != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return evaluationCapabilityEffectProviderJournalCleanupReceipt{}, false, err
	}
	return receipt, false, nil
}

func mustEvaluationCapabilityEffectProviderJournalCanonical(value any) []byte {
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		panic(err)
	}
	return canonical
}

func (repository *repositoryEvaluationCapabilityEffectProviderJournal) Summary(
	ctx context.Context,
	authority EvaluationAuthority,
	checkedAt time.Time,
) (evaluationCapabilityEffectProviderJournalSummary, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil {
		return evaluationCapabilityEffectProviderJournalSummary{}, errEvaluationServiceUnavailable
	}
	var summary evaluationCapabilityEffectProviderJournalSummary
	err := repository.repository.db.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_spool_payloads
		 WHERE namespace_id=$1 AND owner_instance_id=$2 AND ciphertext_present),
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_spool_payloads
		 WHERE namespace_id=$1 AND owner_instance_id=$2 AND ciphertext_present AND expires_at<=$3),
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_stages AS stage
		 WHERE stage.namespace_id=$1 AND stage.owner_instance_id=$2
		 AND NOT EXISTS (SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_results result
		  WHERE result.namespace_id=stage.namespace_id AND result.plan_digest=stage.plan_digest
		    AND result.repository_commit=stage.repository_commit AND result.owner_instance_id=stage.owner_instance_id
		    AND result.owner_request_digest=stage.owner_request_digest)
		 AND NOT EXISTS (SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_abandonments abandonment
		  WHERE abandonment.namespace_id=stage.namespace_id AND abandonment.plan_digest=stage.plan_digest
		    AND abandonment.repository_commit=stage.repository_commit AND abandonment.owner_instance_id=stage.owner_instance_id
		    AND abandonment.owner_request_digest=stage.owner_request_digest)),
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_stages AS stage
		 WHERE stage.namespace_id=$1 AND stage.owner_instance_id=$2 AND stage.expires_at<=$3
		 AND NOT EXISTS (SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_results result
		  WHERE result.namespace_id=stage.namespace_id AND result.plan_digest=stage.plan_digest
		    AND result.repository_commit=stage.repository_commit AND result.owner_instance_id=stage.owner_instance_id
		    AND result.owner_request_digest=stage.owner_request_digest)
		 AND NOT EXISTS (SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_abandonments abandonment
		  WHERE abandonment.namespace_id=stage.namespace_id AND abandonment.plan_digest=stage.plan_digest
		    AND abandonment.repository_commit=stage.repository_commit AND abandonment.owner_instance_id=stage.owner_instance_id
		    AND abandonment.owner_request_digest=stage.owner_request_digest)),
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_abandonments
		 WHERE namespace_id=$1 AND owner_instance_id=$2)`,
		authority.NamespaceID, repository.ownerInstanceID, checkedAt).Scan(&summary.ResidualEncryptedSpoolCount,
		&summary.ExpiredEncryptedSpoolCount, &summary.UnfinishedOwnerCount,
		&summary.OverdueUnfinishedOwnerCount, &summary.AbandonedOwnerCount)
	return summary, err
}

func (repository *repositoryEvaluationCapabilityEffectProviderJournal) AttemptSummary(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
) (evaluationCapabilityEffectProviderJournalAttemptSummary, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil {
		return evaluationCapabilityEffectProviderJournalAttemptSummary{}, errEvaluationServiceUnavailable
	}
	var summary evaluationCapabilityEffectProviderJournalAttemptSummary
	err := repository.repository.db.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_spool_payloads payload
		 JOIN agent_evaluation_capability_effect_provider_journal_stages stage
		   ON stage.namespace_id=payload.namespace_id AND stage.plan_digest=payload.plan_digest
		  AND stage.repository_commit=payload.repository_commit AND stage.owner_instance_id=payload.owner_instance_id
		  AND stage.owner_request_digest=payload.owner_request_digest
		 WHERE stage.namespace_id=$1 AND stage.plan_digest=$2 AND stage.repository_commit=$3
		   AND stage.owner_instance_id=$4 AND stage.attempt_id=$5),
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_stages stage
		 WHERE stage.namespace_id=$1 AND stage.plan_digest=$2 AND stage.repository_commit=$3
		 AND stage.owner_instance_id=$4 AND stage.attempt_id=$5
		 AND NOT EXISTS (SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_results result
		  WHERE result.namespace_id=stage.namespace_id AND result.plan_digest=stage.plan_digest
		    AND result.repository_commit=stage.repository_commit AND result.owner_instance_id=stage.owner_instance_id
		    AND result.owner_request_digest=stage.owner_request_digest)
		 AND NOT EXISTS (SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_abandonments abandonment
		  WHERE abandonment.namespace_id=stage.namespace_id AND abandonment.plan_digest=stage.plan_digest
		    AND abandonment.repository_commit=stage.repository_commit AND abandonment.owner_instance_id=stage.owner_instance_id
		    AND abandonment.owner_request_digest=stage.owner_request_digest)),
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_spool_dispositions disposition
		 JOIN agent_evaluation_capability_effect_provider_journal_stages stage
		   ON stage.namespace_id=disposition.namespace_id AND stage.plan_digest=disposition.plan_digest
		  AND stage.repository_commit=disposition.repository_commit AND stage.owner_instance_id=disposition.owner_instance_id
		  AND stage.owner_request_digest=disposition.owner_request_digest
		 WHERE stage.namespace_id=$1 AND stage.plan_digest=$2 AND stage.repository_commit=$3
		   AND stage.owner_instance_id=$4 AND stage.attempt_id=$5
		   AND disposition.disposition='abandoned-and-destroyed'),
		(SELECT COUNT(*) FROM agent_evaluation_capability_effect_provider_journal_abandonments abandonment
		 JOIN agent_evaluation_capability_effect_provider_journal_stages stage
		   ON stage.namespace_id=abandonment.namespace_id AND stage.plan_digest=abandonment.plan_digest
		  AND stage.repository_commit=abandonment.repository_commit AND stage.owner_instance_id=abandonment.owner_instance_id
		  AND stage.owner_request_digest=abandonment.owner_request_digest
		 WHERE stage.namespace_id=$1 AND stage.plan_digest=$2 AND stage.repository_commit=$3
		   AND stage.owner_instance_id=$4 AND stage.attempt_id=$5)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, repository.ownerInstanceID, attemptID).Scan(
		&summary.ResidualEncryptedSpoolCount, &summary.UnfinishedOwnerCount,
		&summary.AbandonedSpoolCount, &summary.AbandonedOwnerCount)
	return summary, err
}

func (repository *repositoryEvaluationCapabilityEffectProviderJournal) LoadSnapshot(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerRequestDigest string,
) (evaluationCapabilityEffectProviderJournalSnapshotData, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, errEvaluationServiceUnavailable
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
	}
	defer func() { _ = tx.Rollback() }()
	stage, err := loadEvaluationCapabilityEffectProviderJournalStageTx(
		ctx, tx, authority, partition, ownerRequestDigest, repository.ownerInstanceID, " FOR SHARE",
	)
	if err != nil {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
	}
	executions, err := loadEvaluationCapabilityEffectProviderJournalExecutionsTx(ctx, tx, stage, repository.ownerInstanceID)
	if err != nil {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
	}
	data := evaluationCapabilityEffectProviderJournalSnapshotData{Stage: stage, Executions: executions, Spools: make(map[int64]map[string]any)}
	var resultBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT record_bytes FROM agent_evaluation_capability_effect_provider_journal_results
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_instance_id=$4 AND owner_request_digest=$5`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		repository.ownerInstanceID, ownerRequestDigest).Scan(&resultBytes)
	if err == nil {
		result, err := decodeEvaluationCapabilityEffectProviderJournalResultRecord(resultBytes, stage, executions)
		if err != nil {
			return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
		}
		data.Result = &result
	} else if !errors.Is(err, sql.ErrNoRows) {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
	}
	var abandonmentBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT record_bytes FROM agent_evaluation_capability_effect_provider_journal_abandonments
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_instance_id=$4 AND owner_request_digest=$5`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		repository.ownerInstanceID, ownerRequestDigest).Scan(&abandonmentBytes)
	if err == nil {
		value, err := decodeCanonicalEvaluationObject(abandonmentBytes, maximumEvaluationCapabilityEffectProviderJournalResultBytes)
		if err != nil {
			return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
		}
		abandonment, err := decodeEvaluationCapabilityEffectProviderJournalAbandonmentRecord(value, stage, executions)
		if err != nil {
			return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
		}
		data.Abandonment = &abandonment
	} else if !errors.Is(err, sql.ErrNoRows) {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
	}
	if data.Result != nil && data.Abandonment != nil {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, ErrConflict
	}
	spoolRows, err := tx.QueryContext(ctx, `SELECT execution_sequence,spool_envelope_bytes
		FROM agent_evaluation_capability_effect_provider_journal_spool_payloads
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND owner_instance_id=$4 AND owner_request_digest=$5
		ORDER BY execution_sequence`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		repository.ownerInstanceID, ownerRequestDigest)
	if err != nil {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
	}
	for spoolRows.Next() {
		var sequence int64
		var source []byte
		if err := spoolRows.Scan(&sequence, &source); err != nil {
			_ = spoolRows.Close()
			return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
		}
		value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalExecutionWriteBytes)
		if err != nil {
			_ = spoolRows.Close()
			return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
		}
		data.Spools[sequence] = value
	}
	if err := spoolRows.Close(); err != nil {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
	}
	if err := tx.Commit(); err != nil {
		return evaluationCapabilityEffectProviderJournalSnapshotData{}, err
	}
	return data, nil
}
