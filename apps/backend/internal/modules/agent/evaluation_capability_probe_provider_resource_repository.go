package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"
)

func queryEvaluationCapabilityProbeProviderResource(
	ctx context.Context,
	database interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, error) {
	var record EvaluationCapabilityProbeProviderResourceRegistrationRecord
	var stageDigest, resultDigest, ownerAdmissionDigest, dispatchAckDigest sql.NullString
	var ingressDigest, ingressReceiptDigest, manifestDigest, uploadDigest, deletionDigest, resourceAuthorityDigest sql.NullString
	var registrationReceiptDigest sql.NullString
	var resultBytes, responseBytes []byte
	var registeredAt, expiresAt, dispatchedAt, sealedAt sql.NullTime
	err := database.QueryRowContext(ctx, `SELECT
		namespace_id,repository_commit,request_digest,state,claim_generation,
		provider_configuration_id,provider_configuration_digest,protocol_family,
		model_id,model_lineage_digest,adapter_digest,capability_profile_id,
		probe_program_digest,public_resource_descriptor_digest,minimum_expires_at,
		owner_implementation_digest,authority_issuer_id,stage_digest,
		resource_result_digest,owner_admission_digest,dispatch_ack_digest,result_ingress_digest,result_ingress_receipt_digest,
		resource_manifest_digest,content_upload_receipt_digest,deletion_authority_receipt_digest,
		provider_resource_authority_digest,registration_receipt_digest,registered_at,expires_at,
		request_bytes,result_bytes,response_bytes,v46_eligible,claimed_at,dispatched_at,sealed_at
	FROM ae_cppr_registrations
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
	).Scan(
		&record.NamespaceID, &record.RepositoryCommit, &record.RequestDigest, &record.State, &record.ClaimGeneration,
		&record.ProviderConfigurationID, &record.ProviderConfigurationDigest, &record.ProtocolFamily,
		&record.ModelID, &record.ModelLineageDigest, &record.AdapterDigest, &record.CapabilityProfileID,
		&record.ProbeProgramDigest, &record.PublicResourceDescriptorDigest, &record.MinimumExpiresAt,
		&record.OwnerImplementationDigest, &record.AuthorityIssuerID, &stageDigest,
		&resultDigest, &ownerAdmissionDigest, &dispatchAckDigest, &ingressDigest, &ingressReceiptDigest,
		&manifestDigest, &uploadDigest, &deletionDigest, &resourceAuthorityDigest,
		&registrationReceiptDigest, &registeredAt, &expiresAt, &record.RequestBytes,
		&resultBytes, &responseBytes, &record.V46Eligible, &record.ClaimedAt, &dispatchedAt, &sealedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, err
	}
	record.StageDigest, record.ResourceResultDigest = stageDigest.String, resultDigest.String
	record.OwnerAdmissionDigest, record.DispatchAckDigest = ownerAdmissionDigest.String, dispatchAckDigest.String
	record.ResultIngressDigest, record.ResultIngressReceiptDigest = ingressDigest.String, ingressReceiptDigest.String
	record.ResourceManifestDigest, record.ContentUploadReceiptDigest = manifestDigest.String, uploadDigest.String
	record.DeletionAuthorityReceiptDigest = deletionDigest.String
	record.ProviderResourceAuthorityDigest = resourceAuthorityDigest.String
	record.RegistrationReceiptDigest = registrationReceiptDigest.String
	record.ResultBytes, record.ResponseBytes = append([]byte(nil), resultBytes...), append([]byte(nil), responseBytes...)
	if registeredAt.Valid {
		record.RegisteredAt = registeredAt.Time.UTC()
	}
	if expiresAt.Valid {
		record.ExpiresAt = expiresAt.Time.UTC()
	}
	if dispatchedAt.Valid {
		record.DispatchedAt = dispatchedAt.Time.UTC()
	}
	if sealedAt.Valid {
		record.SealedAt = sealedAt.Time.UTC()
	}
	return record, nil
}

func evaluationCapabilityProbeProviderResourceRecordMatchesRequest(
	record EvaluationCapabilityProbeProviderResourceRegistrationRecord,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	authority EvaluationAuthority,
	ownerImplementationDigest string,
) bool {
	return record.NamespaceID == request.NamespaceID && record.RepositoryCommit == request.RepositoryCommit &&
		record.RequestDigest == request.RequestDigest && record.ProviderConfigurationID == request.ProviderConfigurationID &&
		record.ProviderConfigurationDigest == request.ProviderConfigurationDigest && record.ProtocolFamily == request.ProtocolFamily &&
		record.ModelID == request.ModelID && record.ModelLineageDigest == request.ModelLineageDigest &&
		record.AdapterDigest == request.AdapterDigest && record.CapabilityProfileID == request.CapabilityProfileID &&
		record.ProbeProgramDigest == request.ProbeProgramDigest &&
		record.PublicResourceDescriptorDigest == request.PublicResourceDigest &&
		record.MinimumExpiresAt.Equal(request.MinimumExpiresAt) &&
		record.OwnerImplementationDigest == ownerImplementationDigest &&
		record.AuthorityIssuerID == authority.PrincipalID && record.ClaimGeneration == 1 && record.V46Eligible &&
		bytes.Equal(record.RequestBytes, request.Bytes)
}

func (repository *Repository) ClaimEvaluationCapabilityProbeProviderResource(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	ownerImplementationDigest string,
	claimedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || !evaluationDigestPattern.MatchString(ownerImplementationDigest) ||
		claimedAt.IsZero() || !request.MinimumExpiresAt.After(claimedAt) ||
		request.MinimumExpiresAt.After(claimedAt.Add(maximumEvaluationCapabilityProbeProviderResourceLifetime)) {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, ErrInvalid
	}
	claimedAt = claimedAt.UTC().Truncate(time.Millisecond)
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(writeContext, `INSERT INTO ae_cppr_registrations (
		namespace_id,repository_commit,request_digest,state,claim_generation,
		provider_configuration_id,provider_configuration_digest,protocol_family,
		model_id,model_lineage_digest,adapter_digest,capability_profile_id,
		probe_program_digest,public_resource_descriptor_digest,minimum_expires_at,
		owner_implementation_digest,authority_issuer_id,request_json,request_bytes,v46_eligible,claimed_at,updated_at
	) VALUES ($1,$2,$3,'claimed',1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,TRUE,$18,$18)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
		request.ProviderConfigurationID, request.ProviderConfigurationDigest, request.ProtocolFamily,
		request.ModelID, request.ModelLineageDigest, request.AdapterDigest, request.CapabilityProfileID,
		request.ProbeProgramDigest, request.PublicResourceDigest, request.MinimumExpiresAt,
		ownerImplementationDigest, authority.PrincipalID, string(request.Bytes), request.Bytes, claimedAt)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeProviderResource(writeContext, repository.db, authority, request)
	if err != nil || !evaluationCapabilityProbeProviderResourceRecordMatchesRequest(
		record, request, authority, ownerImplementationDigest,
	) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	return record, inserted == 0, nil
}

func (repository *Repository) MarkEvaluationCapabilityProbeProviderResourceDispatched(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if validateEvaluationAuthority(authority) != nil || authority.NamespaceID != request.NamespaceID ||
		!evaluationDigestPattern.MatchString(stageDigest) || dispatchedAt.IsZero() {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, ErrInvalid
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	var ownerImplementationDigest string
	if err := repository.db.QueryRowContext(writeContext, `SELECT owner_implementation_digest
		FROM ae_cppr_registrations
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest).Scan(&ownerImplementationDigest); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	expected, err := evaluationCapabilityProbeProviderResourceStageDigest(request, ownerImplementationDigest)
	if err != nil || expected != stageDigest {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, ErrConflict
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	result, err := repository.db.ExecContext(writeContext, `UPDATE ae_cppr_registrations
	SET state='dispatched',stage_digest=$4,dispatched_at=$5,updated_at=$5
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 AND state='claimed' AND claim_generation=1`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest, stageDigest, dispatchedAt)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeProviderResource(writeContext, repository.db, authority, request)
	if err != nil || record.StageDigest != stageDigest || record.State != "dispatched" && record.State != "sealed" {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	return record, updated == 0, nil
}

func (repository *Repository) GetEvaluationCapabilityProbeProviderResource(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, err
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	return queryEvaluationCapabilityProbeProviderResource(readContext, repository.db, authority, request)
}

func storeEvaluationCapabilityProbeProviderResourceComponent(
	ctx context.Context,
	tx *sql.Tx,
	table string,
	digestColumn string,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	digest string,
	component []byte,
	createdAt time.Time,
) error {
	query := `INSERT INTO ` + table + ` (
		namespace_id,repository_commit,request_digest,` + digestColumn + `,receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT DO NOTHING`
	result, err := tx.ExecContext(ctx, query, authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
		digest, string(component), component, createdAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted == 1 {
		return err
	}
	var existingDigest string
	var existingBytes []byte
	selectQuery := `SELECT ` + digestColumn + `,receipt_bytes FROM ` + table + `
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 FOR SHARE`
	if err := tx.QueryRowContext(ctx, selectQuery, authority.NamespaceID, request.RepositoryCommit, request.RequestDigest).
		Scan(&existingDigest, &existingBytes); err != nil || existingDigest != digest || !bytes.Equal(existingBytes, component) {
		if err != nil {
			return err
		}
		return ErrConflict
	}
	return nil
}

func (repository *Repository) StoreEvaluationCapabilityProbeProviderResourceResult(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	stageDigest string,
	ingressDigest string,
	resourceResult evaluationCapabilityProbeProviderResourceResult,
	ownerAdmissionDigest string,
	dispatchAckDigest string,
	storedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || storedAt.IsZero() ||
		!evaluationDigestPattern.MatchString(stageDigest) || !evaluationDigestPattern.MatchString(ingressDigest) ||
		!evaluationDigestPattern.MatchString(ownerAdmissionDigest) || !evaluationDigestPattern.MatchString(dispatchAckDigest) {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, ErrInvalid
	}
	storedAt = storedAt.UTC().Truncate(time.Millisecond)
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var state, storedStage, ownerImplementationDigest string
	var existingAck sql.NullString
	var claimedAt time.Time
	if err := tx.QueryRowContext(writeContext, `SELECT state,stage_digest,owner_implementation_digest,dispatch_ack_digest,claimed_at
		FROM ae_cppr_registrations
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 FOR UPDATE`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
	).Scan(&state, &storedStage, &ownerImplementationDigest, &existingAck, &claimedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, ErrNotFound
		}
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	expectedOwnerAdmission, err := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
		request.RequestDigest, resourceResult.ResultDigest, ownerImplementationDigest, stageDigest,
	)
	expectedAck, ackErr := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
		request.RequestDigest, resourceResult.ResultDigest, expectedOwnerAdmission, ownerImplementationDigest, stageDigest,
	)
	ingressReceiptDigest, receiptErr := evaluationCapabilityProbeProviderResourceIngressReceiptDigest(
		request.RequestDigest, ingressDigest, resourceResult.ResultDigest, expectedAck,
	)
	if state != "dispatched" && state != "sealed" || storedStage != stageDigest || claimedAt.IsZero() ||
		err != nil || ackErr != nil || receiptErr != nil || expectedOwnerAdmission != ownerAdmissionDigest || expectedAck != dispatchAckDigest {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, ErrConflict
	}
	if err := storeEvaluationCapabilityProbeProviderResourceComponent(
		writeContext, tx, "ae_cppr_manifests", "manifest_digest",
		authority, request, resourceResult.ResourceManifestDigest, resourceResult.ResourceManifestBytes, storedAt,
	); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if err := storeEvaluationCapabilityProbeProviderResourceComponent(
		writeContext, tx, "ae_cppr_content_upload_receipts", "content_upload_receipt_digest",
		authority, request, resourceResult.ContentUploadReceiptDigest, resourceResult.ContentUploadReceiptBytes, storedAt,
	); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if err := storeEvaluationCapabilityProbeProviderResourceComponent(
		writeContext, tx, "ae_cppr_deletion_authority_receipts", "deletion_authority_receipt_digest",
		authority, request, resourceResult.DeletionAuthorityReceiptDigest, resourceResult.DeletionAuthorityReceiptBytes, storedAt,
	); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `UPDATE ae_cppr_registrations SET
		resource_result_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,result_ingress_digest=$7,
		result_ingress_receipt_digest=$8,resource_manifest_digest=$9,content_upload_receipt_digest=$10,
		deletion_authority_receipt_digest=$11,provider_resource_authority_digest=$12,registered_at=$13,expires_at=$14,
		result_json=$15::jsonb,result_bytes=$16,updated_at=$17
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 AND state='dispatched'
		AND stage_digest=$18 AND dispatch_ack_digest IS NULL`, authority.NamespaceID, request.RepositoryCommit,
		request.RequestDigest, resourceResult.ResultDigest, ownerAdmissionDigest, dispatchAckDigest, ingressDigest, ingressReceiptDigest,
		resourceResult.ResourceManifestDigest, resourceResult.ContentUploadReceiptDigest,
		resourceResult.DeletionAuthorityReceiptDigest, resourceResult.ProviderResourceAuthorityDigest,
		resourceResult.RegisteredAt, resourceResult.ExpiresAt, string(resourceResult.Bytes), resourceResult.Bytes,
		storedAt, stageDigest)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	var record EvaluationCapabilityProbeProviderResourceRegistrationRecord
	// Query through the transaction so component rows and the main ACK are one atomic authority.
	var responseBytes []byte
	err = tx.QueryRowContext(writeContext, `SELECT state,resource_result_digest,owner_admission_digest,
		dispatch_ack_digest,result_ingress_digest,result_ingress_receipt_digest,resource_manifest_digest,
		content_upload_receipt_digest,deletion_authority_receipt_digest,provider_resource_authority_digest,
		registered_at,expires_at,result_bytes,response_bytes
	FROM ae_cppr_registrations
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 FOR SHARE`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
	).Scan(&record.State, &record.ResourceResultDigest, &record.OwnerAdmissionDigest, &record.DispatchAckDigest,
		&record.ResultIngressDigest, &record.ResultIngressReceiptDigest, &record.ResourceManifestDigest, &record.ContentUploadReceiptDigest,
		&record.DeletionAuthorityReceiptDigest, &record.ProviderResourceAuthorityDigest,
		&record.RegisteredAt, &record.ExpiresAt, &record.ResultBytes, &responseBytes)
	if err != nil || record.ResourceResultDigest != resourceResult.ResultDigest ||
		record.OwnerAdmissionDigest != ownerAdmissionDigest || record.DispatchAckDigest != dispatchAckDigest ||
		record.ResultIngressDigest != ingressDigest ||
		record.ResultIngressReceiptDigest != ingressReceiptDigest ||
		!bytes.Equal(record.ResultBytes, resourceResult.Bytes) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	full, err := queryEvaluationCapabilityProbeProviderResource(writeContext, repository.db, authority, request)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	return full, updated == 0 || existingAck.Valid, nil
}

func (repository *Repository) SealEvaluationCapabilityProbeProviderResource(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	registrationReceiptDigest string,
	response []byte,
	sealedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || !evaluationDigestPattern.MatchString(registrationReceiptDigest) ||
		sealedAt.IsZero() || len(response) == 0 || len(response) > maximumEvaluationCapabilityProbeProviderResourceResponseBytes {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, ErrInvalid
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(writeContext, `UPDATE ae_cppr_registrations SET
		state='sealed',registration_receipt_digest=$4,response_json=$5::jsonb,response_bytes=$6,sealed_at=$7,updated_at=$7
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 AND state='dispatched'
		AND dispatch_ack_digest IS NOT NULL AND result_ingress_receipt_digest IS NOT NULL`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
		registrationReceiptDigest, string(response), response, sealedAt)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeProviderResource(writeContext, repository.db, authority, request)
	if err != nil || record.State != "sealed" || record.RegistrationReceiptDigest != registrationReceiptDigest ||
		!bytes.Equal(record.ResponseBytes, response) || record.SealedAt.IsZero() {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeProviderResourceRegistrationRecord{}, false, err
	}
	return record, updated == 0, nil
}
