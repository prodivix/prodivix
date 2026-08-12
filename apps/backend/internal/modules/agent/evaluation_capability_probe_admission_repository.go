package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func queryEvaluationCapabilityProbeAdmission(
	ctx context.Context,
	database interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	request evaluationCapabilityProbeAdmissionRequest,
) (EvaluationCapabilityProbeAdmissionRecord, error) {
	var record EvaluationCapabilityProbeAdmissionRecord
	var stage, dispatchAck, issuer, ownerAdmission, referenceRoot, evidenceDigest sql.NullString
	var probeReceipt, probeStatus, observedProfile, admissionReceipt, responseDigest sql.NullString
	var referenceBytes, responseBytes []byte
	var dispatchedAt, probedAt, expiresAt, sealedAt sql.NullTime
	err := database.QueryRowContext(ctx, `SELECT
		namespace_id, repository_commit, request_digest, state, claim_generation,
		provider_configuration_id, provider_configuration_digest, protocol_family,
		model_id, model_lineage_digest, qualification_capability_profile_id,
		qualification_capability_profile_digest, capability_id,
		declared_capability_profile_set_digest, minimum_expires_at, adapter_digest,
		owner_implementation_digest, stage_digest, dispatch_ack_digest, authority_issuer_id,
		owner_admission_digest, reference_receipt_set_digest, evidence_digest,
		probe_receipt_digest, probe_status, observed_profile_digest, probed_at, expires_at,
		admission_receipt_digest, response_digest, request_bytes, reference_bundle_bytes,
		response_bytes, claimed_at, dispatched_at, sealed_at
	FROM agent_evaluation_capability_probe_admissions
	WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
	).Scan(
		&record.NamespaceID, &record.RepositoryCommit, &record.RequestDigest, &record.State, &record.ClaimGeneration,
		&record.ProviderConfigurationID, &record.ProviderConfigurationDigest, &record.ProtocolFamily,
		&record.ModelID, &record.ModelLineageDigest, &record.QualificationCapabilityProfileID,
		&record.QualificationCapabilityProfileDigest, &record.CapabilityID,
		&record.DeclaredCapabilityProfileSetDigest, &record.MinimumExpiresAt, &record.AdapterDigest,
		&record.OwnerImplementationDigest, &stage, &dispatchAck, &issuer, &ownerAdmission, &referenceRoot,
		&evidenceDigest, &probeReceipt, &probeStatus, &observedProfile, &probedAt, &expiresAt,
		&admissionReceipt, &responseDigest, &record.RequestBytes, &referenceBytes, &responseBytes,
		&record.ClaimedAt, &dispatchedAt, &sealedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityProbeAdmissionRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, err
	}
	record.StageDigest, record.DispatchAckDigest = stage.String, dispatchAck.String
	record.AuthorityIssuerID, record.OwnerAdmissionDigest = issuer.String, ownerAdmission.String
	record.ReferenceReceiptSetDigest, record.EvidenceDigest = referenceRoot.String, evidenceDigest.String
	record.ProbeReceiptDigest, record.ProbeStatus = probeReceipt.String, probeStatus.String
	record.ObservedProfileDigest, record.AdmissionReceiptDigest = observedProfile.String, admissionReceipt.String
	record.ResponseDigest = responseDigest.String
	record.ReferenceBundleBytes, record.ResponseBytes = referenceBytes, responseBytes
	if dispatchedAt.Valid {
		record.DispatchedAt = dispatchedAt.Time.UTC()
	}
	if probedAt.Valid {
		record.ProbedAt = probedAt.Time.UTC()
	}
	if expiresAt.Valid {
		record.ExpiresAt = expiresAt.Time.UTC()
	}
	if sealedAt.Valid {
		record.SealedAt = sealedAt.Time.UTC()
	}
	return record, nil
}

func evaluationCapabilityProbeRecordMatchesClaim(
	record EvaluationCapabilityProbeAdmissionRecord,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
) bool {
	return record.NamespaceID == request.NamespaceID && record.RepositoryCommit == request.RepositoryCommit &&
		record.RequestDigest == request.RequestDigest && record.ClaimGeneration == 1 &&
		record.ProviderConfigurationID == request.ProviderConfigurationID &&
		record.ProviderConfigurationDigest == request.ProviderConfigurationDigest &&
		record.ProtocolFamily == request.ProtocolFamily && record.ModelID == request.ModelID &&
		record.ModelLineageDigest == request.ModelLineageDigest &&
		record.QualificationCapabilityProfileID == request.QualificationCapabilityProfileID &&
		record.QualificationCapabilityProfileDigest == request.QualificationCapabilityProfileDigest &&
		record.CapabilityID == request.CapabilityID &&
		record.DeclaredCapabilityProfileSetDigest == request.DeclaredCapabilityProfileSetDigest &&
		record.MinimumExpiresAt.Equal(request.MinimumExpiresAt) && record.AdapterDigest == request.AdapterDigest &&
		record.OwnerImplementationDigest == ownerImplementationDigest && bytes.Equal(record.RequestBytes, request.Bytes)
}

func (repository *Repository) ClaimEvaluationCapabilityProbeAdmission(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
	claimedAt time.Time,
) (EvaluationCapabilityProbeAdmissionRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || !evaluationDigestPattern.MatchString(ownerImplementationDigest) ||
		claimedAt.IsZero() || request.MinimumExpiresAt.Before(claimedAt) {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, ErrInvalid
	}
	claimedAt = claimedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_probe_admissions (
		namespace_id, repository_commit, request_digest, state, claim_generation,
		provider_configuration_id, provider_configuration_digest, protocol_family,
		model_id, model_lineage_digest, qualification_capability_profile_id,
		qualification_capability_profile_digest, capability_id,
		declared_capability_profile_set_digest, minimum_expires_at, adapter_digest,
		owner_implementation_digest, request_json, request_bytes, claimed_at
	) VALUES (
		$1,$2,$3,'claimed',1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18
	) ON CONFLICT DO NOTHING`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
		request.ProviderConfigurationID, request.ProviderConfigurationDigest, request.ProtocolFamily,
		request.ModelID, request.ModelLineageDigest, request.QualificationCapabilityProfileID,
		request.QualificationCapabilityProfileDigest, request.CapabilityID,
		request.DeclaredCapabilityProfileSetDigest, request.MinimumExpiresAt, request.AdapterDigest,
		ownerImplementationDigest, string(request.Bytes), request.Bytes, claimedAt,
	)
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeAdmission(ctx, repository.db, authority, request)
	if err != nil || !evaluationCapabilityProbeRecordMatchesClaim(record, request, ownerImplementationDigest) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	return record, inserted == 0, nil
}

func (repository *Repository) MarkEvaluationCapabilityProbeAdmissionDispatched(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeAdmissionRequest,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationCapabilityProbeAdmissionRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || !evaluationDigestPattern.MatchString(stageDigest) || dispatchedAt.IsZero() {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, ErrInvalid
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_admissions
		SET state='dispatched', stage_digest=$4, dispatched_at=$5
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3
			AND state='claimed' AND claim_generation=1`, authority.NamespaceID,
		request.RepositoryCommit, request.RequestDigest, stageDigest, dispatchedAt)
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeAdmission(ctx, repository.db, authority, request)
	if err != nil || record.StageDigest != stageDigest || record.State != "dispatched" && record.State != "sealed" {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	return record, updated == 0, nil
}

func (repository *Repository) AcknowledgeEvaluationCapabilityProbeAdmission(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeAdmissionRequest,
	sealed evaluationCapabilityProbeAdmissionSealedValue,
	acknowledgedAt time.Time,
) (EvaluationCapabilityProbeAdmissionRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	responseDigest, responseErr := evaluationCanonicalByteDigest(sealed.ResponseBytes, maximumEvaluationCapabilityProbeResponseBytes)
	if authority.NamespaceID != request.NamespaceID || acknowledgedAt.IsZero() || responseErr != nil ||
		responseDigest != sealed.ResponseDigest || len(sealed.ReferenceBundleBytes) == 0 ||
		len(sealed.ReferenceBundleBytes) > maximumEvaluationCapabilityProbeReferenceBytes {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, ErrInvalid
	}
	for _, digest := range []string{
		sealed.OwnerAdmissionDigest, sealed.ReferenceReceiptSetDigest, sealed.EvidenceDigest,
		sealed.ProbeReceiptDigest, sealed.AdmissionReceiptDigest, sealed.ResponseDigest, sealed.DispatchAckDigest,
	} {
		if !evaluationDigestPattern.MatchString(digest) {
			return EvaluationCapabilityProbeAdmissionRecord{}, false, ErrInvalid
		}
	}
	acknowledgedAt = acknowledgedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := requireEvaluationCapabilityProbeReferenceReceipts(
		ctx, tx, authority, request, sealed.ReferenceBundleBytes,
	); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_admissions SET
		dispatch_ack_digest=$4, authority_issuer_id=$5, owner_admission_digest=$6,
		reference_receipt_set_digest=$7, evidence_digest=$8, probe_receipt_digest=$9,
		probe_status=$10, observed_profile_digest=NULLIF($11,''), probed_at=$12, expires_at=$13,
		admission_receipt_digest=$14, response_digest=$15,
		reference_bundle_json=$16::jsonb, reference_bundle_bytes=$17,
		response_json=$18::jsonb, response_bytes=$19
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3
			AND state='dispatched' AND claim_generation=1 AND dispatch_ack_digest IS NULL`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
		sealed.DispatchAckDigest, sealed.AuthorityIssuerID, sealed.OwnerAdmissionDigest,
		sealed.ReferenceReceiptSetDigest, sealed.EvidenceDigest, sealed.ProbeReceiptDigest,
		sealed.ProbeStatus, sealed.ObservedProfileDigest, sealed.ProbedAt, sealed.ExpiresAt,
		sealed.AdmissionReceiptDigest, sealed.ResponseDigest,
		string(sealed.ReferenceBundleBytes), sealed.ReferenceBundleBytes,
		string(sealed.ResponseBytes), sealed.ResponseBytes,
	)
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeAdmission(ctx, tx, authority, request)
	if err != nil || record.DispatchAckDigest != sealed.DispatchAckDigest ||
		record.ResponseDigest != sealed.ResponseDigest || !bytes.Equal(record.ResponseBytes, sealed.ResponseBytes) ||
		!bytes.Equal(record.ReferenceBundleBytes, sealed.ReferenceBundleBytes) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	return record, updated == 0, nil
}

func decodeEvaluationCapabilityProbeReferenceValues(source []byte) ([]any, error) {
	var values []any
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	if err := decoder.Decode(&values); err != nil || len(values) != len(evaluationCapabilityProbeReferenceKinds) ||
		decoder.Decode(&struct{}{}) == nil {
		return nil, ErrInvalid
	}
	return values, nil
}

func requireEvaluationCapabilityProbeReferenceReceipts(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	request evaluationCapabilityProbeAdmissionRequest,
	referenceBundleBytes []byte,
) error {
	referenceValues, err := decodeEvaluationCapabilityProbeReferenceValues(referenceBundleBytes)
	if err != nil {
		return err
	}
	for index, raw := range referenceValues {
		entry, ok := raw.(map[string]any)
		receipt, receiptOK := objectMember(entry, "receipt")
		if !ok || !receiptOK {
			return ErrInvalid
		}
		receiptBytes, err := canonicaljson.Bytes(receipt)
		if err != nil {
			return err
		}
		var storedKind, storedReceiptDigest, storedSourceDigest string
		var storedReceiptBytes []byte
		if err := queryer.QueryRowContext(ctx, `SELECT kind, receipt_digest, source_receipt_digest, receipt_bytes
			FROM agent_evaluation_capability_probe_reference_receipts
			WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 AND ordinal=$4
			FOR SHARE`, authority.NamespaceID, request.RepositoryCommit, request.RequestDigest, index).Scan(
			&storedKind, &storedReceiptDigest, &storedSourceDigest, &storedReceiptBytes,
		); errors.Is(err, sql.ErrNoRows) {
			return conflict("evaluation capability probe raw authority receipt is missing")
		} else if err != nil {
			return err
		}
		if storedKind != stringMember(entry, "kind") || storedReceiptDigest != stringMember(entry, "receiptDigest") ||
			storedSourceDigest != stringMember(receipt, "sourceReceiptDigest") || !bytes.Equal(storedReceiptBytes, receiptBytes) {
			return conflict("evaluation capability probe raw authority receipt drifted")
		}
	}
	return nil
}

func (repository *Repository) SealEvaluationCapabilityProbeAdmission(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeAdmissionRequest,
	responseDigest string,
	dispatchAckDigest string,
	sealedAt time.Time,
) (EvaluationCapabilityProbeAdmissionRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	if authority.NamespaceID != request.NamespaceID || sealedAt.IsZero() ||
		!evaluationDigestPattern.MatchString(responseDigest) || !evaluationDigestPattern.MatchString(dispatchAckDigest) {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, ErrInvalid
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_admissions
		SET state='sealed', sealed_at=$6
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3
			AND state='dispatched' AND response_digest=$4 AND dispatch_ack_digest=$5
			AND response_bytes IS NOT NULL AND reference_bundle_bytes IS NOT NULL`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
		responseDigest, dispatchAckDigest, sealedAt)
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeAdmission(ctx, repository.db, authority, request)
	if err != nil || record.State != "sealed" || record.ResponseDigest != responseDigest ||
		record.DispatchAckDigest != dispatchAckDigest {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeAdmissionRecord{}, false, err
	}
	return record, updated == 0, nil
}
