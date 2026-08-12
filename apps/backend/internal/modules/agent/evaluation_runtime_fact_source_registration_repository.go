package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func queryEvaluationRuntimeFactSourceRegistration(
	ctx context.Context,
	database interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	request evaluationRuntimeFactSourceRegistrationRequest,
) (EvaluationRuntimeFactSourceRegistrationRecord, error) {
	var record EvaluationRuntimeFactSourceRegistrationRecord
	var ownerHealthDigest, ownerAdmissionDigest, dispatchAckDigest, receiptDigest sql.NullString
	var ownerHealthBytes, receiptBytes []byte
	var registeredAt, expiresAt, dispatchedAt, sealedAt sql.NullTime
	err := database.QueryRowContext(ctx, `SELECT
		namespace_id,repository_commit,request_digest,source_authority_kind,source_kind,
		source_authority_id,source_authority_implementation_digest,route_binding,
		capability_profile_id,capability_profile_digest,capability_id,protocol_family,
		provider_configuration_id,model_id,model_lineage_digest,adapter_digest,minimum_expires_at,
		registration_authority_issuer_id,state,claim_generation,stage_digest,
		owner_health_digest,owner_admission_digest,dispatch_ack_digest,registered_at,expires_at,
		registration_receipt_digest,request_bytes,owner_health_bytes,receipt_bytes,v46_eligible,
		claimed_at,dispatched_at,sealed_at
	FROM agent_evaluation_runtime_fact_source_owner_registrations
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
	).Scan(
		&record.NamespaceID, &record.RepositoryCommit, &record.RequestDigest, &record.SourceAuthorityKind,
		&record.SourceKind, &record.SourceAuthorityID, &record.SourceAuthorityImplementationDigest,
		&record.RouteBinding, &record.CapabilityProfileID, &record.CapabilityProfileDigest,
		&record.CapabilityID, &record.ProtocolFamily, &record.ProviderConfigurationID, &record.ModelID,
		&record.ModelLineageDigest, &record.AdapterDigest, &record.MinimumExpiresAt,
		&record.RegistrationAuthorityIssuerID, &record.State, &record.ClaimGeneration, &record.StageDigest,
		&ownerHealthDigest, &ownerAdmissionDigest, &dispatchAckDigest, &registeredAt, &expiresAt,
		&receiptDigest, &record.RequestBytes, &ownerHealthBytes, &receiptBytes, &record.V46Eligible,
		&record.ClaimedAt, &dispatchedAt, &sealedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, err
	}
	record.OwnerHealthDigest, record.OwnerAdmissionDigest = ownerHealthDigest.String, ownerAdmissionDigest.String
	record.DispatchAckDigest, record.RegistrationReceiptDigest = dispatchAckDigest.String, receiptDigest.String
	record.OwnerHealthBytes, record.ReceiptBytes = append([]byte(nil), ownerHealthBytes...), append([]byte(nil), receiptBytes...)
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
	if record.State == "sealed" {
		receipt, decodeErr := decodeCanonicalEvaluationObject(record.ReceiptBytes, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes)
		if decodeErr != nil || stringMember(receipt, "registrationReceiptDigest") != record.RegistrationReceiptDigest ||
			stringMember(receipt, "dispatchAckDigest") != record.DispatchAckDigest ||
			stringMember(receipt, "ownerHealthDigest") != record.OwnerHealthDigest {
			return EvaluationRuntimeFactSourceRegistrationRecord{}, ErrConflict
		}
		base := cloneEvaluationObject(receipt)
		delete(base, "registrationReceiptDigest")
		digest, digestErr := canonicaljson.Digest(base)
		if digestErr != nil || digest != record.RegistrationReceiptDigest {
			return EvaluationRuntimeFactSourceRegistrationRecord{}, ErrConflict
		}
	}
	return record, nil
}

func evaluationRuntimeFactSourceRegistrationMatchesRequest(
	record EvaluationRuntimeFactSourceRegistrationRecord,
	request evaluationRuntimeFactSourceRegistrationRequest,
	authority EvaluationAuthority,
) bool {
	return record.NamespaceID == request.NamespaceID && record.RepositoryCommit == request.RepositoryCommit &&
		record.RequestDigest == request.RequestDigest && record.SourceAuthorityKind == request.SourceAuthorityKind &&
		record.SourceKind == request.SourceKind && record.SourceAuthorityID == request.SourceAuthorityID &&
		record.SourceAuthorityImplementationDigest == request.SourceAuthorityImplementationDigest &&
		record.RouteBinding == request.RouteBinding && record.CapabilityProfileID == request.CapabilityProfileID &&
		record.CapabilityProfileDigest == request.CapabilityProfileDigest && record.CapabilityID == request.CapabilityID &&
		record.ProtocolFamily == request.ProtocolFamily && record.ProviderConfigurationID == request.ProviderConfigurationID &&
		record.ModelID == request.ModelID && record.ModelLineageDigest == request.ModelLineageDigest &&
		record.AdapterDigest == request.AdapterDigest && record.MinimumExpiresAt.Equal(request.MinimumExpiresAt) &&
		record.RegistrationAuthorityIssuerID == authority.PrincipalID && record.ClaimGeneration == 1 &&
		bytes.Equal(record.RequestBytes, request.Bytes)
}

func (repository *Repository) ClaimEvaluationRuntimeFactSourceRegistration(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationRuntimeFactSourceRegistrationRequest,
	claimedAt time.Time,
) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || claimedAt.IsZero() || !request.MinimumExpiresAt.After(claimedAt) ||
		request.MinimumExpiresAt.After(claimedAt.Add(maximumEvaluationRuntimeFactSourceRegistrationLifetime)) {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, ErrInvalid
	}
	claimedAt = claimedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `INSERT INTO agent_evaluation_runtime_fact_source_owner_registrations (
		namespace_id,repository_commit,request_digest,source_authority_kind,source_kind,
		source_authority_id,source_authority_implementation_digest,route_binding,
		capability_profile_id,capability_profile_digest,capability_id,protocol_family,
		provider_configuration_id,model_id,model_lineage_digest,adapter_digest,minimum_expires_at,
		registration_authority_issuer_id,state,claim_generation,request_json,request_bytes,v46_eligible,claimed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'claimed',1,$19::jsonb,$20,TRUE,$21)
	ON CONFLICT DO NOTHING`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest, request.SourceAuthorityKind,
		request.SourceKind, request.SourceAuthorityID, request.SourceAuthorityImplementationDigest,
		request.RouteBinding, request.CapabilityProfileID, request.CapabilityProfileDigest, request.CapabilityID,
		request.ProtocolFamily, request.ProviderConfigurationID, request.ModelID, request.ModelLineageDigest,
		request.AdapterDigest, request.MinimumExpiresAt, authority.PrincipalID, string(request.Bytes), request.Bytes, claimedAt,
	)
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	record, err := queryEvaluationRuntimeFactSourceRegistration(ctx, repository.db, authority, request)
	if err != nil || !evaluationRuntimeFactSourceRegistrationMatchesRequest(record, request, authority) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	return record, inserted == 0, nil
}

func (repository *Repository) MarkEvaluationRuntimeFactSourceRegistrationDispatched(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationRuntimeFactSourceRegistrationRequest,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	expected, err := evaluationRuntimeFactSourceRegistrationStageDigest(request, authority.PrincipalID)
	if authority.NamespaceID != request.NamespaceID || err != nil || stageDigest != expected || dispatchedAt.IsZero() {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, ErrInvalid
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_runtime_fact_source_owner_registrations
	SET state='dispatched',stage_digest=$4,dispatched_at=$5
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3
		AND state='claimed' AND claim_generation=1`, authority.NamespaceID, request.RepositoryCommit,
		request.RequestDigest, stageDigest, dispatchedAt)
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	record, err := queryEvaluationRuntimeFactSourceRegistration(ctx, repository.db, authority, request)
	if err != nil || record.StageDigest != stageDigest || record.State != "dispatched" && record.State != "sealed" {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	return record, updated == 0, nil
}

func (repository *Repository) AcknowledgeEvaluationRuntimeFactSourceRegistration(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationRuntimeFactSourceRegistrationRequest,
	sealed evaluationRuntimeFactSourceRegistrationSealedValue,
	acknowledgedAt time.Time,
) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || acknowledgedAt.IsZero() ||
		len(sealed.OwnerHealthBytes) == 0 || len(sealed.OwnerHealthBytes) > maximumEvaluationRuntimeFactSourceRegistrationResponseBytes ||
		len(sealed.ReceiptBytes) == 0 || len(sealed.ReceiptBytes) > maximumEvaluationRuntimeFactSourceRegistrationResponseBytes ||
		sealed.RegisteredAt.IsZero() || !sealed.ExpiresAt.After(sealed.RegisteredAt) {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, ErrInvalid
	}
	for _, digest := range []string{
		sealed.OwnerHealthDigest, sealed.OwnerAdmissionDigest, sealed.DispatchAckDigest, sealed.RegistrationReceiptDigest,
	} {
		if !evaluationDigestPattern.MatchString(digest) {
			return EvaluationRuntimeFactSourceRegistrationRecord{}, false, ErrInvalid
		}
	}
	acknowledgedAt = acknowledgedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_runtime_fact_source_owner_registrations SET
		owner_health_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,
		registered_at=$7,expires_at=$8,registration_receipt_digest=$9,
		owner_health_json=$10::jsonb,owner_health_bytes=$11,receipt_json=$12::jsonb,receipt_bytes=$13,
		updated_at=$14
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3
		AND state='dispatched' AND claim_generation=1 AND dispatch_ack_digest IS NULL`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest, sealed.OwnerHealthDigest,
		sealed.OwnerAdmissionDigest, sealed.DispatchAckDigest, sealed.RegisteredAt, sealed.ExpiresAt,
		sealed.RegistrationReceiptDigest, string(sealed.OwnerHealthBytes), sealed.OwnerHealthBytes,
		string(sealed.ReceiptBytes), sealed.ReceiptBytes, acknowledgedAt,
	)
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	record, err := queryEvaluationRuntimeFactSourceRegistration(ctx, repository.db, authority, request)
	if err != nil || record.DispatchAckDigest != sealed.DispatchAckDigest ||
		record.RegistrationReceiptDigest != sealed.RegistrationReceiptDigest ||
		!bytes.Equal(record.OwnerHealthBytes, sealed.OwnerHealthBytes) || !bytes.Equal(record.ReceiptBytes, sealed.ReceiptBytes) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	return record, updated == 0, nil
}

func (repository *Repository) SealEvaluationRuntimeFactSourceRegistration(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationRuntimeFactSourceRegistrationRequest,
	registrationReceiptDigest, dispatchAckDigest string,
	sealedAt time.Time,
) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || !evaluationDigestPattern.MatchString(registrationReceiptDigest) ||
		!evaluationDigestPattern.MatchString(dispatchAckDigest) || sealedAt.IsZero() {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, ErrInvalid
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_runtime_fact_source_owner_registrations
	SET state='sealed',sealed_at=$6,updated_at=$6
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3
		AND state='dispatched' AND registration_receipt_digest=$4 AND dispatch_ack_digest=$5`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
		registrationReceiptDigest, dispatchAckDigest, sealedAt)
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	record, err := queryEvaluationRuntimeFactSourceRegistration(ctx, repository.db, authority, request)
	if err != nil || record.State != "sealed" || record.RegistrationReceiptDigest != registrationReceiptDigest ||
		record.DispatchAckDigest != dispatchAckDigest || record.SealedAt.IsZero() {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationRuntimeFactSourceRegistrationRecord{}, false, err
	}
	return record, updated == 0, nil
}
