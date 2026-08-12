package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationNativeProviderStateVaultSelectColumns = `namespace_id,plan_digest,repository_commit,vault_owner_instance_id,
	authority_digest,purpose,attempt_id,invocation_id,generation,task_id,run_id,
	provider_state_reference_kind,provider_state_reference_digest,opaque_provider_state_ref,
	seal_request_digest,seal_request_bytes,seal_receipt_digest,seal_receipt_bytes,
	state_key_creation_receipt_digest,aad_digest,aad_bytes,ciphertext_digest,ciphertext_bytes,ciphertext_nonce,
	wrapped_state_key_digest,wrapped_state_key_bytes,wrapped_state_key_nonce,status,expires_at,sealed_at,
	resolve_request_digest,resolve_request_bytes,resolve_receipt_digest,resolve_receipt_bytes,resolved_at,
	retire_request_digest,retire_request_bytes,retirement_receipt_digest,retirement_receipt_bytes,
	disposition,retired_at,forced_expiry_tombstone_digest,forced_expiry_tombstone_bytes,forced_expired_at,
	recovery_request_digest,created_at,updated_at,v46_eligible`

type repositoryEvaluationNativeProviderStateVault struct {
	repository *Repository
}

const evaluationNativeProviderStateVaultRecoverySelectColumns = `recovery_request_bytes,recovery_receipt_bytes`

func scanEvaluationNativeProviderStateVaultRecovery(
	scanner interface{ Scan(...any) error },
) (evaluationNativeProviderStateVaultRecoveryRequest, evaluationNativeProviderStateVaultRecoveryReceipt, error) {
	var requestBytes, receiptBytes []byte
	if err := scanner.Scan(&requestBytes, &receiptBytes); err != nil {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, err
	}
	request, err := decodeEvaluationNativeProviderStateVaultRecoveryRequest(requestBytes)
	if err != nil {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, err
	}
	receipt, err := decodeEvaluationNativeProviderStateVaultRecoveryReceipt(receiptBytes)
	if err != nil || matchEvaluationNativeProviderStateVaultRecoveryReceipt(receipt, request) != nil {
		if err != nil {
			return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, err
		}
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrConflict
	}
	return request, receipt, nil
}

func (repository *repositoryEvaluationNativeProviderStateVault) CheckEvaluationNativeProviderStateVaultAuthority(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	expected EvaluationNativeProviderStateVaultAuthority,
) error {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		validateEvaluationNativeProviderStateVaultAuthority(expected) != nil {
		return ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	var runConfigBytes []byte
	err := repository.repository.db.QueryRowContext(readContext, `SELECT run_config_bytes
		FROM agent_evaluation_production_run_config_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&runConfigBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	value, _, err := decodeEvaluationJSONObject(runConfigBytes, maximumEvaluationProductionRunConfigArtifactBytes)
	if err != nil {
		return ErrConflict
	}
	profile, ok := objectMember(value, "nativeProviderStateVaultEncryption")
	if !ok {
		return ErrConflict
	}
	authorityValue, ok := objectMember(profile, "authority")
	if !ok {
		return ErrConflict
	}
	authorityBytes, err := canonicaljson.Bytes(authorityValue)
	expectedBytes, expectedErr := canonicaljson.Bytes(expected)
	if err != nil || expectedErr != nil || !bytes.Equal(authorityBytes, expectedBytes) {
		return conflict("evaluation native Provider state vault authority drifted")
	}
	return nil
}

func scanEvaluationNativeProviderStateVaultRecord(scanner interface{ Scan(...any) error }) (EvaluationNativeProviderStateVaultRecord, error) {
	var record EvaluationNativeProviderStateVaultRecord
	var sealRequestBytes, sealReceiptBytes []byte
	var sealRequestDigest, sealReceiptDigest, stateKeyCreationReceiptDigest string
	var expiresAt, sealedAt time.Time
	var ciphertextBytes, ciphertextNonce, wrappedKeyBytes, wrappedKeyNonce []byte
	var resolveRequestDigest, resolveReceiptDigest, retireRequestDigest, retirementReceiptDigest, disposition sql.NullString
	var resolveRequestBytes, resolveReceiptBytes, retireRequestBytes, retirementReceiptBytes []byte
	var forcedExpiryTombstoneDigest sql.NullString
	var recoveryRequestDigest sql.NullString
	var forcedExpiryTombstoneBytes []byte
	var resolvedAt, retiredAt, forcedExpiredAt sql.NullTime
	if err := scanner.Scan(
		&record.NamespaceID, &record.Partition.PlanDigest, &record.Partition.RepositoryCommit,
		&record.OwnerInstanceID, &record.AuthorityDigest, &record.Purpose, &record.AttemptID, &record.InvocationID, &record.Generation,
		&record.TaskID, &record.RunID, &record.ProviderStateReferenceKind, &record.ProviderStateReferenceDigest,
		&record.OpaqueProviderStateRef, &sealRequestDigest, &sealRequestBytes, &sealReceiptDigest, &sealReceiptBytes,
		&stateKeyCreationReceiptDigest, &record.AADDigest, &record.AADBytes, &record.CiphertextDigest, &ciphertextBytes,
		&ciphertextNonce, &record.WrappedStateKeyDigest, &wrappedKeyBytes, &wrappedKeyNonce, &record.Status,
		&expiresAt, &sealedAt, &resolveRequestDigest, &resolveRequestBytes, &resolveReceiptDigest,
		&resolveReceiptBytes, &resolvedAt, &retireRequestDigest, &retireRequestBytes,
		&retirementReceiptDigest, &retirementReceiptBytes, &disposition, &retiredAt,
		&forcedExpiryTombstoneDigest, &forcedExpiryTombstoneBytes, &forcedExpiredAt,
		&recoveryRequestDigest,
		&record.CreatedAt, &record.UpdatedAt, &record.V46Eligible,
	); err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, err
	}
	sealRequest, err := decodeEvaluationNativeProviderStateVaultSealRequest(sealRequestBytes)
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, err
	}
	sealReceipt, err := decodeEvaluationNativeProviderStateVaultSealReceipt(sealReceiptBytes, sealRequest)
	if err != nil || sealRequest.SealRequestDigest != sealRequestDigest ||
		sealReceipt.ReceiptDigest != sealReceiptDigest ||
		sealReceipt.StateKeyCreationReceiptDigest != stateKeyCreationReceiptDigest ||
		!sealRequest.ExpiresAt.Equal(expiresAt) || !sealReceipt.SealedAt.Equal(sealedAt) {
		if err != nil {
			return EvaluationNativeProviderStateVaultRecord{}, err
		}
		return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
	}
	record.SealRequest, record.SealReceipt = sealRequest, sealReceipt
	record.CiphertextBytes = append([]byte(nil), ciphertextBytes...)
	record.CiphertextNonce = append([]byte(nil), ciphertextNonce...)
	record.WrappedStateKeyBytes = append([]byte(nil), wrappedKeyBytes...)
	record.WrappedStateKeyNonce = append([]byte(nil), wrappedKeyNonce...)
	record.Disposition = disposition.String
	if resolveRequestDigest.Valid {
		request, err := decodeEvaluationNativeProviderStateVaultResolveRequest(resolveRequestBytes)
		if err != nil || request.ResolveRequestDigest != resolveRequestDigest.String {
			return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
		}
		receipt, err := decodeEvaluationNativeProviderStateVaultResolveReceipt(resolveReceiptBytes, request)
		if err != nil || receipt.ReceiptDigest != resolveReceiptDigest.String || !resolvedAt.Valid ||
			!receipt.ResolvedAt.Equal(resolvedAt.Time) {
			return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
		}
		record.ResolveRequest, record.ResolveReceipt = &request, &receipt
	} else if len(resolveRequestBytes) != 0 || resolveReceiptDigest.Valid || len(resolveReceiptBytes) != 0 || resolvedAt.Valid {
		return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
	}
	if retireRequestDigest.Valid {
		request, err := decodeEvaluationNativeProviderStateVaultRetireRequest(retireRequestBytes)
		if err != nil || request.RetireRequestDigest != retireRequestDigest.String {
			return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
		}
		receipt, err := decodeEvaluationNativeProviderStateVaultRetirementReceipt(retirementReceiptBytes, request, sealReceipt)
		if err != nil || receipt.ReceiptDigest != retirementReceiptDigest.String || !retiredAt.Valid ||
			!receipt.RetiredAt.Equal(retiredAt.Time) {
			return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
		}
		record.RetireRequest, record.RetirementReceipt = &request, &receipt
	} else if len(retireRequestBytes) != 0 || retirementReceiptDigest.Valid || len(retirementReceiptBytes) != 0 || retiredAt.Valid {
		return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
	}
	if forcedExpiryTombstoneDigest.Valid {
		tombstone, err := decodeEvaluationNativeProviderStateVaultForcedExpiryTombstone(forcedExpiryTombstoneBytes)
		if err != nil || tombstone.TombstoneDigest != forcedExpiryTombstoneDigest.String || !forcedExpiredAt.Valid ||
			!tombstone.ForcedExpiredAt.Equal(forcedExpiredAt.Time) {
			return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
		}
		record.ForcedExpiryTombstone = &tombstone
	} else if len(forcedExpiryTombstoneBytes) != 0 || forcedExpiredAt.Valid {
		return EvaluationNativeProviderStateVaultRecord{}, ErrConflict
	}
	record.RecoveryRequestDigest = recoveryRequestDigest.String
	if err := validateEvaluationNativeProviderStateVaultRecord(record); err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, err
	}
	return record, nil
}

func validateEvaluationNativeProviderStateVaultRecord(record EvaluationNativeProviderStateVaultRecord) error {
	if !validEvaluationServiceIdentity(record.NamespaceID) || validateEvaluationPartition(record.Partition) != nil ||
		!validEvaluationAgentControlIdentity(record.OwnerInstanceID) ||
		!evaluationDigestPattern.MatchString(record.AuthorityDigest) || record.AuthorityDigest != record.SealRequest.AuthorityDigest ||
		record.Purpose != record.SealRequest.Purpose || record.AttemptID != record.SealRequest.AttemptID ||
		record.InvocationID != record.SealRequest.InvocationID || record.Generation != record.SealRequest.Generation ||
		record.TaskID != record.SealRequest.TaskID || record.RunID != record.SealRequest.RunID ||
		record.ProviderStateReferenceKind != record.SealRequest.ProviderStateReferenceKind ||
		record.ProviderStateReferenceDigest != record.SealRequest.ProviderStateReferenceDigest ||
		record.OpaqueProviderStateRef != record.SealReceipt.OpaqueProviderStateRef ||
		!evaluationDigestPattern.MatchString(record.AADDigest) || len(record.AADBytes) == 0 ||
		!evaluationDigestPattern.MatchString(record.CiphertextDigest) ||
		!evaluationDigestPattern.MatchString(record.WrappedStateKeyDigest) || !record.V46Eligible ||
		!oneOfString(record.Status, "active", "retired", "expired-unqualified") {
		return ErrInvalid
	}
	if record.RecoveryRequestDigest != "" && !evaluationDigestPattern.MatchString(record.RecoveryRequestDigest) {
		return ErrInvalid
	}
	if record.Status == "active" {
		if record.RecoveryRequestDigest != "" || len(record.CiphertextBytes) == 0 || len(record.CiphertextNonce) != 12 ||
			len(record.WrappedStateKeyBytes) == 0 || len(record.WrappedStateKeyNonce) != 12 ||
			record.RetirementReceipt != nil || record.RetireRequest != nil || record.ForcedExpiryTombstone != nil || record.Disposition != "" {
			return ErrConflict
		}
	} else if record.Status == "retired" {
		if len(record.CiphertextBytes) != 0 || len(record.CiphertextNonce) != 0 ||
			len(record.WrappedStateKeyBytes) != 0 || len(record.WrappedStateKeyNonce) != 0 ||
			record.RetirementReceipt == nil || record.RetireRequest == nil ||
			record.ForcedExpiryTombstone != nil || record.Disposition != record.RetireRequest.Disposition {
			return ErrConflict
		}
	} else {
		if len(record.CiphertextBytes) != 0 || len(record.CiphertextNonce) != 0 ||
			len(record.WrappedStateKeyBytes) != 0 || len(record.WrappedStateKeyNonce) != 0 ||
			record.RetirementReceipt != nil || record.RetireRequest != nil || record.Disposition != "" ||
			record.ForcedExpiryTombstone == nil {
			return ErrConflict
		}
		tombstone := record.ForcedExpiryTombstone
		if tombstone.NamespaceID != record.NamespaceID || tombstone.Partition != record.Partition ||
			tombstone.OwnerInstanceID != record.OwnerInstanceID || tombstone.AuthorityDigest != record.AuthorityDigest ||
			tombstone.OpaqueProviderStateRef != record.OpaqueProviderStateRef ||
			tombstone.SealRequestDigest != record.SealRequest.SealRequestDigest ||
			tombstone.SealReceiptDigest != record.SealReceipt.ReceiptDigest ||
			tombstone.StateKeyCreationReceiptDigest != record.SealReceipt.StateKeyCreationReceiptDigest ||
			tombstone.AADDigest != record.AADDigest || tombstone.CiphertextDigest != record.CiphertextDigest ||
			tombstone.WrappedStateKeyDigest != record.WrappedStateKeyDigest ||
			!tombstone.ExpiresAt.Equal(record.SealRequest.ExpiresAt) {
			return ErrConflict
		}
	}
	return nil
}

func (repository *repositoryEvaluationNativeProviderStateVault) StoreEvaluationNativeProviderStateVaultSeal(
	ctx context.Context,
	authority EvaluationAuthority,
	record EvaluationNativeProviderStateVaultRecord,
) (EvaluationNativeProviderStateVaultRecord, bool, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil ||
		validateEvaluationNativeProviderStateVaultRecord(record) != nil || record.NamespaceID != authority.NamespaceID {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrInvalid
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	existing, existingErr := scanEvaluationNativeProviderStateVaultRecord(tx.QueryRowContext(writeContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+`
		 FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND seal_request_digest=$4 FOR SHARE`,
		record.NamespaceID, record.Partition.PlanDigest, record.Partition.RepositoryCommit, record.SealRequest.SealRequestDigest))
	if existingErr == nil {
		if !bytes.Equal(existing.SealRequest.Bytes, record.SealRequest.Bytes) ||
			existing.OwnerInstanceID != record.OwnerInstanceID ||
			existing.ProviderStateReferenceDigest != record.ProviderStateReferenceDigest {
			return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return EvaluationNativeProviderStateVaultRecord{}, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(existingErr, sql.ErrNoRows) {
		return EvaluationNativeProviderStateVaultRecord{}, false, existingErr
	}
	var count int64
	if err := tx.QueryRowContext(writeContext, `SELECT COUNT(*)
		FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND repository_commit=$2`, record.NamespaceID, record.Partition.RepositoryCommit).Scan(&count); err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	if count >= maximumEvaluationNativeProviderStateVaultRecords {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_native_provider_state_vault_records (
		namespace_id,plan_digest,repository_commit,vault_owner_instance_id,authority_digest,purpose,attempt_id,invocation_id,generation,
		task_id,run_id,provider_state_reference_kind,provider_state_reference_digest,opaque_provider_state_ref,
		seal_request_digest,seal_request_json,seal_request_bytes,seal_receipt_digest,seal_receipt_json,
		seal_receipt_bytes,state_key_creation_receipt_digest,aad_digest,aad_bytes,ciphertext_digest,
		ciphertext_bytes,ciphertext_nonce,wrapped_state_key_digest,wrapped_state_key_bytes,wrapped_state_key_nonce,
		status,expires_at,sealed_at,created_at,updated_at,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19::jsonb,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,TRUE)
	ON CONFLICT DO NOTHING`,
		record.NamespaceID, record.Partition.PlanDigest, record.Partition.RepositoryCommit, record.OwnerInstanceID,
		record.AuthorityDigest, record.Purpose, record.AttemptID, record.InvocationID, record.Generation, record.TaskID, record.RunID,
		record.ProviderStateReferenceKind, record.ProviderStateReferenceDigest, record.OpaqueProviderStateRef,
		record.SealRequest.SealRequestDigest, string(record.SealRequest.Bytes), record.SealRequest.Bytes,
		record.SealReceipt.ReceiptDigest, string(record.SealReceipt.Bytes), record.SealReceipt.Bytes,
		record.SealReceipt.StateKeyCreationReceiptDigest, record.AADDigest, record.AADBytes, record.CiphertextDigest,
		record.CiphertextBytes, record.CiphertextNonce, record.WrappedStateKeyDigest, record.WrappedStateKeyBytes,
		record.WrappedStateKeyNonce, record.Status, record.SealRequest.ExpiresAt, record.SealReceipt.SealedAt,
		record.CreatedAt, record.UpdatedAt,
	)
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	stored, err := scanEvaluationNativeProviderStateVaultRecord(tx.QueryRowContext(writeContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+`
		 FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND seal_request_digest=$4 FOR SHARE`,
		record.NamespaceID, record.Partition.PlanDigest, record.Partition.RepositoryCommit, record.SealRequest.SealRequestDigest))
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	if !bytes.Equal(stored.SealRequest.Bytes, record.SealRequest.Bytes) ||
		stored.OwnerInstanceID != record.OwnerInstanceID ||
		stored.ProviderStateReferenceDigest != record.ProviderStateReferenceDigest {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	return stored, rows == 0, nil
}

func (repository *repositoryEvaluationNativeProviderStateVault) LoadEvaluationNativeProviderStateVaultRecord(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	opaqueRef string,
) (EvaluationNativeProviderStateVaultRecord, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		!validEvaluationAgentControlIdentity(opaqueRef) {
		return EvaluationNativeProviderStateVaultRecord{}, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	record, err := scanEvaluationNativeProviderStateVaultRecord(repository.repository.db.QueryRowContext(readContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+`
		 FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, opaqueRef))
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationNativeProviderStateVaultRecord{}, ErrNotFound
	}
	return record, err
}

func loadEvaluationNativeProviderStateVaultRecordBySeal(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	sealRequestDigest string,
	sealReceiptDigest string,
	forShare bool,
) (EvaluationNativeProviderStateVaultRecord, error) {
	if queryer == nil || validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		!evaluationDigestPattern.MatchString(sealRequestDigest) || !evaluationDigestPattern.MatchString(sealReceiptDigest) {
		return EvaluationNativeProviderStateVaultRecord{}, ErrInvalid
	}
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	record, err := scanEvaluationNativeProviderStateVaultRecord(queryer.QueryRowContext(ctx,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+`
		 FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		 AND seal_request_digest=$4 AND seal_receipt_digest=$5`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, sealRequestDigest, sealReceiptDigest))
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationNativeProviderStateVaultRecord{}, ErrNotFound
	}
	return record, err
}

func loadEvaluationNativeProviderStateVaultSeal(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	bootstrap EvaluationNativeOptionalBootstrapSourceRecord,
	requireActive bool,
) (*EvaluationNativeProviderStateVaultRecord, map[string]any, error) {
	if bootstrap.Outcome != "observed" {
		return nil, nil, nil
	}
	value, _, err := decodeEvaluationJSONObject(
		bootstrap.NativeProviderSourceReceiptBytes, maximumEvaluationNativeOptionalSourceBytes,
	)
	if err != nil {
		return nil, nil, err
	}
	source, ok := objectMember(value, "source")
	if !ok {
		return nil, nil, ErrConflict
	}
	sourceKind := stringMember(source, "sourceKind")
	if sourceKind == "provider-cache-usage" {
		return nil, source, nil
	}
	if !oneOfString(
		sourceKind, "provider-job-active-status", "provider-job-terminal-status", "provider-stored-continuation",
	) || requireActive && sourceKind == "provider-job-terminal-status" {
		return nil, nil, ErrConflict
	}
	record, err := loadEvaluationNativeProviderStateVaultRecordBySeal(
		ctx, queryer, authority, partition,
		stringMember(source, "stateVaultSealRequestDigest"),
		stringMember(source, "stateVaultSealReceiptDigest"), true,
	)
	if err != nil {
		return nil, nil, err
	}
	expectedPurpose := "background-job-state"
	if sourceKind == "provider-stored-continuation" {
		expectedPurpose = "reasoning-continuation-state"
	}
	if requireActive && record.Status != "active" ||
		!oneOfString(record.Status, "active", "retired") ||
		record.AuthorityDigest != stringMember(source, "stateVaultAuthorityDigest") ||
		record.OpaqueProviderStateRef != stringMember(source, "opaqueProviderStateRef") ||
		record.ProviderStateReferenceDigest != stringMember(source, "providerStateReferenceDigest") ||
		record.Purpose != expectedPurpose || record.AttemptID != bootstrap.AttemptID ||
		record.InvocationID != bootstrap.InvocationID || record.Generation != mustEvaluationInteger(source, "generation") ||
		record.TaskID != stringMember(source, "taskId") || record.RunID != stringMember(source, "runId") ||
		record.SealRequest.ProtocolFamily != bootstrap.ProtocolFamily ||
		record.SealRequest.ProbeProgramDigest != bootstrap.ProbeProgramDigest ||
		record.SealRequest.CapabilityProfileDigest != bootstrap.CapabilityProfileDigest ||
		record.SealRequest.RequestDigest != bootstrap.ProviderRequestDigest ||
		record.SealRequest.ResponseDigest != bootstrap.ProviderResponseDigest ||
		record.SealRequest.ProviderConfigurationID != bootstrap.ProviderConfigurationID ||
		record.SealRequest.ModelLineageDigest != bootstrap.ModelLineageDigest ||
		record.SealRequest.AdapterDigest != bootstrap.AdapterDigest {
		return nil, nil, conflict("evaluation native Provider state vault seal drifted")
	}
	if sourceKind == "provider-stored-continuation" {
		sourceExpiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(source, "expiresAt"))
		if expiresErr != nil || !sourceExpiresAt.Equal(record.SealRequest.ExpiresAt) {
			return nil, nil, conflict("evaluation native Provider state vault expiry drifted")
		}
	}
	return &record, source, nil
}

func requireEvaluationNativeProviderStateVaultSeal(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	bootstrap EvaluationNativeOptionalBootstrapSourceRecord,
	requireActive bool,
) error {
	_, _, err := loadEvaluationNativeProviderStateVaultSeal(
		ctx, queryer, authority, partition, bootstrap, requireActive,
	)
	return err
}

func (repository *repositoryEvaluationNativeProviderStateVault) StoreEvaluationNativeProviderStateVaultResolve(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	opaqueRef string,
	request evaluationNativeProviderStateVaultResolveRequest,
	receipt evaluationNativeProviderStateVaultResolveReceipt,
) (EvaluationNativeProviderStateVaultRecord, bool, error) {
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(writeContext, `UPDATE agent_evaluation_native_provider_state_vault_records SET
		resolve_request_digest=$5,resolve_request_json=$6::jsonb,resolve_request_bytes=$7,
		resolve_receipt_digest=$8,resolve_receipt_json=$9::jsonb,resolve_receipt_bytes=$10,resolved_at=$11,updated_at=$11
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4
		AND resolve_request_digest IS NULL`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, opaqueRef,
		request.ResolveRequestDigest, string(request.Bytes), request.Bytes, receipt.ReceiptDigest,
		string(receipt.Bytes), receipt.Bytes, receipt.ResolvedAt)
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	stored, err := scanEvaluationNativeProviderStateVaultRecord(tx.QueryRowContext(writeContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+` FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, opaqueRef))
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	if stored.ResolveRequest == nil || stored.ResolveReceipt == nil ||
		!bytes.Equal(stored.ResolveRequest.Bytes, request.Bytes) || !bytes.Equal(stored.ResolveReceipt.Bytes, receipt.Bytes) {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	return stored, rows == 0, nil
}

func (repository *repositoryEvaluationNativeProviderStateVault) StoreEvaluationNativeProviderStateVaultRetirement(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	opaqueRef string,
	request evaluationNativeProviderStateVaultRetireRequest,
	receipt evaluationNativeProviderStateVaultRetirementReceipt,
) (EvaluationNativeProviderStateVaultRecord, bool, error) {
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(writeContext, `UPDATE agent_evaluation_native_provider_state_vault_records SET
		retire_request_digest=$5,retire_request_json=$6::jsonb,retire_request_bytes=$7,
		retirement_receipt_digest=$8,retirement_receipt_json=$9::jsonb,retirement_receipt_bytes=$10,
		disposition=$11,retired_at=$12,status='retired',ciphertext_bytes=NULL,ciphertext_nonce=NULL,
		wrapped_state_key_bytes=NULL,wrapped_state_key_nonce=NULL,updated_at=$12
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4
		AND status='active' AND retire_request_digest IS NULL AND recovery_request_digest IS NULL`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, opaqueRef,
		request.RetireRequestDigest, string(request.Bytes), request.Bytes, receipt.ReceiptDigest,
		string(receipt.Bytes), receipt.Bytes, request.Disposition, receipt.RetiredAt)
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	stored, err := scanEvaluationNativeProviderStateVaultRecord(tx.QueryRowContext(writeContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+` FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, opaqueRef))
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	if stored.RetireRequest == nil || stored.RetirementReceipt == nil ||
		!bytes.Equal(stored.RetireRequest.Bytes, request.Bytes) || !bytes.Equal(stored.RetirementReceipt.Bytes, receipt.Bytes) {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	return stored, rows == 0, nil
}

func (repository *repositoryEvaluationNativeProviderStateVault) StoreEvaluationNativeProviderStateVaultForcedExpiry(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	opaqueRef string,
	tombstone evaluationNativeProviderStateVaultForcedExpiryTombstone,
) (EvaluationNativeProviderStateVaultRecord, bool, error) {
	decoded, err := decodeEvaluationNativeProviderStateVaultForcedExpiryTombstone(tombstone.Bytes)
	if repository == nil || repository.repository == nil || repository.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		!validEvaluationAgentControlIdentity(opaqueRef) || err != nil ||
		decoded.NamespaceID != authority.NamespaceID || decoded.Partition != partition ||
		decoded.OpaqueProviderStateRef != opaqueRef || decoded.TombstoneDigest != tombstone.TombstoneDigest {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrInvalid
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(writeContext, `UPDATE agent_evaluation_native_provider_state_vault_records SET
		forced_expiry_tombstone_digest=$5,forced_expiry_tombstone_json=$6::jsonb,
		forced_expiry_tombstone_bytes=$7,forced_expired_at=$8,status='expired-unqualified',
		ciphertext_bytes=NULL,ciphertext_nonce=NULL,wrapped_state_key_bytes=NULL,wrapped_state_key_nonce=NULL,
		updated_at=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4
		AND status='active' AND retire_request_digest IS NULL AND forced_expiry_tombstone_digest IS NULL
		AND recovery_request_digest IS NULL`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, opaqueRef,
		decoded.TombstoneDigest, string(decoded.Bytes), decoded.Bytes, decoded.ForcedExpiredAt)
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	stored, err := scanEvaluationNativeProviderStateVaultRecord(tx.QueryRowContext(writeContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+` FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, opaqueRef))
	if err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	if stored.ForcedExpiryTombstone == nil ||
		!bytes.Equal(stored.ForcedExpiryTombstone.Bytes, decoded.Bytes) {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, err
	}
	return stored, rows == 0, nil
}

func (repository *repositoryEvaluationNativeProviderStateVault) LookupEvaluationNativeProviderStateVaultRetirement(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	retireRequestDigest string,
) (EvaluationNativeProviderStateVaultRecord, error) {
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	record, err := scanEvaluationNativeProviderStateVaultRecord(repository.repository.db.QueryRowContext(readContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+` FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND retire_request_digest=$4`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, retireRequestDigest))
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationNativeProviderStateVaultRecord{}, ErrNotFound
	}
	return record, err
}

func (repository *repositoryEvaluationNativeProviderStateVault) ListEvaluationNativeProviderStateVaultActive(
	ctx context.Context,
	authority EvaluationAuthority,
	repositoryCommit string,
	ownerInstanceID string,
	now time.Time,
	expiredAcrossInstances bool,
	limit int,
) ([]EvaluationNativeProviderStateVaultRecord, error) {
	if !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) ||
		!validEvaluationAgentControlIdentity(ownerInstanceID) || now.IsZero() ||
		limit < 1 || limit > maximumEvaluationNativeProviderStateVaultRecords+1 {
		return nil, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	var rows *sql.Rows
	var err error
	if expiredAcrossInstances {
		rows, err = repository.repository.db.QueryContext(readContext,
			`SELECT `+evaluationNativeProviderStateVaultSelectColumns+` FROM agent_evaluation_native_provider_state_vault_records
			 WHERE namespace_id=$1 AND repository_commit=$2 AND status='active' AND expires_at<=$3
			 ORDER BY expires_at,opaque_provider_state_ref COLLATE "C" LIMIT $4`,
			authority.NamespaceID, repositoryCommit, now, limit)
	} else {
		rows, err = repository.repository.db.QueryContext(readContext,
			`SELECT `+evaluationNativeProviderStateVaultSelectColumns+` FROM agent_evaluation_native_provider_state_vault_records
			 WHERE namespace_id=$1 AND repository_commit=$2 AND vault_owner_instance_id=$3 AND status='active'
			 ORDER BY expires_at,opaque_provider_state_ref COLLATE "C" LIMIT $4`,
			authority.NamespaceID, repositoryCommit, ownerInstanceID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationNativeProviderStateVaultRecord, 0, limit)
	for rows.Next() {
		record, err := scanEvaluationNativeProviderStateVaultRecord(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (repository *repositoryEvaluationNativeProviderStateVault) ListEvaluationNativeProviderStateVaultActiveForRecovery(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerInstanceID string,
	limit int,
) ([]EvaluationNativeProviderStateVaultRecord, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		!validEvaluationAgentControlIdentity(ownerInstanceID) || limit < 1 ||
		limit > maximumEvaluationNativeProviderStateVaultRecords+1 {
		return nil, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.repository.db.QueryContext(readContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+` FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND vault_owner_instance_id=$4 AND status='active'
		 ORDER BY opaque_provider_state_ref COLLATE "C" LIMIT $5`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, ownerInstanceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationNativeProviderStateVaultRecord, 0, limit)
	for rows.Next() {
		record, err := scanEvaluationNativeProviderStateVaultRecord(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (repository *repositoryEvaluationNativeProviderStateVault) StoreEvaluationNativeProviderStateVaultRecovery(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerInstanceID string,
	request evaluationNativeProviderStateVaultRecoveryRequest,
	dispositions []evaluationNativeProviderStateVaultRecoveryDisposition,
	receipt evaluationNativeProviderStateVaultRecoveryReceipt,
) (evaluationNativeProviderStateVaultRecoveryReceipt, bool, error) {
	decodedRequest, requestErr := decodeEvaluationNativeProviderStateVaultRecoveryRequest(request.Bytes)
	decodedReceipt, receiptErr := decodeEvaluationNativeProviderStateVaultRecoveryReceipt(receipt.Bytes)
	terminalSetDigest, terminalErr := evaluationNativeProviderStateVaultRecoveryTerminalRecordSetDigest(dispositions)
	if repository == nil || repository.repository == nil || repository.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		!validEvaluationAgentControlIdentity(ownerInstanceID) || requestErr != nil || receiptErr != nil || terminalErr != nil ||
		decodedRequest.NamespaceID != authority.NamespaceID || decodedRequest.Partition != partition ||
		decodedRequest.OwnerInstanceID != ownerInstanceID || decodedReceipt.TerminalRecordSetDigest != terminalSetDigest ||
		matchEvaluationNativeProviderStateVaultRecoveryReceipt(decodedReceipt, decodedRequest) != nil ||
		len(dispositions) > maximumEvaluationNativeProviderStateVaultRecords {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrInvalid
	}
	request, receipt = decodedRequest, decodedReceipt
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	storedRequest, storedReceipt, existingErr := scanEvaluationNativeProviderStateVaultRecovery(tx.QueryRowContext(
		writeContext,
		`SELECT `+evaluationNativeProviderStateVaultRecoverySelectColumns+` FROM agent_evaluation_native_provider_state_vault_recoveries
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND recovery_request_digest=$4 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, request.RecoveryRequestDigest,
	))
	if existingErr == nil {
		if !bytes.Equal(storedRequest.Bytes, request.Bytes) || !bytes.Equal(storedReceipt.Bytes, receipt.Bytes) {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
		}
		return storedReceipt, true, nil
	}
	if !errors.Is(existingErr, sql.ErrNoRows) {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, existingErr
	}
	rows, err := tx.QueryContext(writeContext,
		`SELECT `+evaluationNativeProviderStateVaultSelectColumns+` FROM agent_evaluation_native_provider_state_vault_records
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND vault_owner_instance_id=$4 AND status='active'
		 ORDER BY opaque_provider_state_ref COLLATE "C" FOR UPDATE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, ownerInstanceID)
	if err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	active := make([]EvaluationNativeProviderStateVaultRecord, 0, len(dispositions))
	for rows.Next() {
		record, scanErr := scanEvaluationNativeProviderStateVaultRecord(rows)
		if scanErr != nil {
			_ = rows.Close()
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, scanErr
		}
		active = append(active, record)
		if len(active) > maximumEvaluationNativeProviderStateVaultRecords {
			_ = rows.Close()
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
	}
	if err := rows.Close(); err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	if len(active) != len(dispositions) {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
	}
	byReference := make(map[string]evaluationNativeProviderStateVaultRecoveryDisposition, len(dispositions))
	for _, disposition := range dispositions {
		if _, exists := byReference[disposition.OpaqueProviderStateRef]; exists {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
		byReference[disposition.OpaqueProviderStateRef] = disposition
	}
	for _, record := range active {
		disposition, exists := byReference[record.OpaqueProviderStateRef]
		if !exists || disposition.SealRequestDigest != record.SealRequest.SealRequestDigest {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
		var result sql.Result
		if disposition.ForcedExpiryTombstone != nil {
			tombstone := disposition.ForcedExpiryTombstone
			decodedTombstone, decodeErr := decodeEvaluationNativeProviderStateVaultForcedExpiryTombstone(tombstone.Bytes)
			if decodeErr != nil || decodedTombstone.TombstoneDigest != tombstone.TombstoneDigest ||
				tombstone.OpaqueProviderStateRef != record.OpaqueProviderStateRef ||
				tombstone.SealRequestDigest != record.SealRequest.SealRequestDigest ||
				tombstone.OwnerInstanceID != ownerInstanceID || tombstone.Partition != partition {
				return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
			}
			result, err = tx.ExecContext(writeContext, `UPDATE agent_evaluation_native_provider_state_vault_records SET
				forced_expiry_tombstone_digest=$5,forced_expiry_tombstone_json=$6::jsonb,
				forced_expiry_tombstone_bytes=$7,forced_expired_at=$8,status='expired-unqualified',
				ciphertext_bytes=NULL,ciphertext_nonce=NULL,wrapped_state_key_bytes=NULL,wrapped_state_key_nonce=NULL,
				recovery_request_digest=$10,updated_at=$8
				WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4
				AND vault_owner_instance_id=$9 AND status='active' AND retire_request_digest IS NULL
				AND forced_expiry_tombstone_digest IS NULL AND recovery_request_digest IS NULL`,
				authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, record.OpaqueProviderStateRef,
				tombstone.TombstoneDigest, string(tombstone.Bytes), tombstone.Bytes, tombstone.ForcedExpiredAt,
				ownerInstanceID, request.RecoveryRequestDigest)
		} else {
			retireRequest, retirementReceipt := disposition.RetireRequest, disposition.RetirementReceipt
			if retireRequest == nil || retirementReceipt == nil ||
				retireRequest.OpaqueProviderStateRef != record.OpaqueProviderStateRef ||
				retireRequest.SealRequestDigest != record.SealRequest.SealRequestDigest ||
				matchEvaluationNativeProviderStateVaultRetireRequest(*retireRequest, record) != nil {
				return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
			}
			decodedRetirementReceipt, decodeErr := decodeEvaluationNativeProviderStateVaultRetirementReceipt(
				retirementReceipt.Bytes, *retireRequest, record.SealReceipt,
			)
			if decodeErr != nil || decodedRetirementReceipt.ReceiptDigest != retirementReceipt.ReceiptDigest {
				return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
			}
			result, err = tx.ExecContext(writeContext, `UPDATE agent_evaluation_native_provider_state_vault_records SET
				retire_request_digest=$5,retire_request_json=$6::jsonb,retire_request_bytes=$7,
				retirement_receipt_digest=$8,retirement_receipt_json=$9::jsonb,retirement_receipt_bytes=$10,
				disposition=$11,retired_at=$12,status='retired',ciphertext_bytes=NULL,ciphertext_nonce=NULL,
				wrapped_state_key_bytes=NULL,wrapped_state_key_nonce=NULL,recovery_request_digest=$14,updated_at=$12
				WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND opaque_provider_state_ref=$4
				AND vault_owner_instance_id=$13 AND status='active' AND retire_request_digest IS NULL
				AND recovery_request_digest IS NULL`,
				authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, record.OpaqueProviderStateRef,
				retireRequest.RetireRequestDigest, string(retireRequest.Bytes), retireRequest.Bytes,
				retirementReceipt.ReceiptDigest, string(retirementReceipt.Bytes), retirementReceipt.Bytes,
				retireRequest.Disposition, retirementReceipt.RetiredAt, ownerInstanceID, request.RecoveryRequestDigest)
		}
		if err != nil {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
		}
		updated, rowsErr := result.RowsAffected()
		if rowsErr != nil || updated != 1 {
			if rowsErr != nil {
				return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, rowsErr
			}
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
	}
	var residual int64
	if err := tx.QueryRowContext(writeContext, `SELECT COUNT(*) FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND vault_owner_instance_id=$4 AND status='active'`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, ownerInstanceID).Scan(&residual); err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	if residual != 0 {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_native_provider_state_vault_recoveries(
		namespace_id,plan_digest,repository_commit,vault_owner_instance_id,authority_digest,
		recovery_request_digest,recovery_request_json,recovery_request_bytes,recovery_receipt_digest,
		recovery_receipt_json,recovery_receipt_bytes,terminal_record_set_digest,retired_record_count,
		forced_expiry_tombstone_count,completed_at,v46_eligible)
		VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,TRUE)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, ownerInstanceID, request.AuthorityDigest,
		request.RecoveryRequestDigest, string(request.Bytes), request.Bytes, receipt.ReceiptDigest,
		string(receipt.Bytes), receipt.Bytes, receipt.TerminalRecordSetDigest, receipt.RetiredRecordCount,
		receipt.ForcedExpiryTombstoneCount, receipt.CompletedAt); err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	storedRequest, storedReceipt, err = scanEvaluationNativeProviderStateVaultRecovery(tx.QueryRowContext(
		writeContext,
		`SELECT `+evaluationNativeProviderStateVaultRecoverySelectColumns+` FROM agent_evaluation_native_provider_state_vault_recoveries
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND recovery_request_digest=$4 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, request.RecoveryRequestDigest,
	))
	if err != nil || !bytes.Equal(storedRequest.Bytes, request.Bytes) || !bytes.Equal(storedReceipt.Bytes, receipt.Bytes) {
		if err != nil {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
		}
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	return storedReceipt, false, nil
}

func (repository *repositoryEvaluationNativeProviderStateVault) LookupEvaluationNativeProviderStateVaultRecovery(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	recoveryRequestDigest string,
) (evaluationNativeProviderStateVaultRecoveryRequest, evaluationNativeProviderStateVaultRecoveryReceipt, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		!evaluationDigestPattern.MatchString(recoveryRequestDigest) {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	request, receipt, err := scanEvaluationNativeProviderStateVaultRecovery(repository.repository.db.QueryRowContext(
		readContext,
		`SELECT `+evaluationNativeProviderStateVaultRecoverySelectColumns+` FROM agent_evaluation_native_provider_state_vault_recoveries
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND recovery_request_digest=$4`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, recoveryRequestDigest,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrNotFound
	}
	return request, receipt, err
}

func (repository *repositoryEvaluationNativeProviderStateVault) CountEvaluationNativeProviderStateVaultActiveForRecovery(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerInstanceID string,
) (int64, error) {
	if repository == nil || repository.repository == nil || repository.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		!validEvaluationAgentControlIdentity(ownerInstanceID) {
		return 0, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	var count int64
	err := repository.repository.db.QueryRowContext(readContext, `SELECT COUNT(*) FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND vault_owner_instance_id=$4 AND status='active'`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, ownerInstanceID).Scan(&count)
	return count, err
}

func (repository *repositoryEvaluationNativeProviderStateVault) EvaluationNativeProviderStateVaultSummary(
	ctx context.Context,
	authority EvaluationAuthority,
	ownerInstanceID string,
	now time.Time,
) (EvaluationNativeProviderStateVaultSummary, error) {
	if !validEvaluationAgentControlIdentity(ownerInstanceID) || now.IsZero() {
		return EvaluationNativeProviderStateVaultSummary{}, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	var summary EvaluationNativeProviderStateVaultSummary
	err := repository.repository.db.QueryRowContext(readContext, `SELECT
		COUNT(*),COUNT(*) FILTER (WHERE status='active'),COUNT(*) FILTER (WHERE status='retired'),
		COUNT(*) FILTER (WHERE disposition='cancelled'),COUNT(*) FILTER (WHERE disposition='consumed'),
		COUNT(*) FILTER (WHERE disposition='expired'),COUNT(*) FILTER (WHERE status='expired-unqualified'),
		COUNT(*) FILTER (WHERE status='active' AND expires_at<$3)
		FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND vault_owner_instance_id=$2`,
		authority.NamespaceID, ownerInstanceID, now).Scan(
		&summary.SealedRecordCount, &summary.ActiveEncryptedRecordCount, &summary.RetiredRecordCount,
		&summary.CancelledRetirementCount, &summary.ConsumedRetirementCount,
		&summary.ExpiredRetirementCount, &summary.ForcedExpiryTombstoneCount,
		&summary.OverdueActiveRecordCount,
	)
	return summary, err
}
