package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"
)

func queryEvaluationCapabilityProbeProviderResourceCleanup(
	ctx context.Context,
	database interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, error) {
	var record EvaluationCapabilityProbeProviderResourceCleanupRecord
	var stageDigest, cleanupReceiptDigest, ownerAdmissionDigest, dispatchAckDigest sql.NullString
	var resultIngressDigest, resultIngressReceiptDigest, responseDigest sql.NullString
	var cleanupReceiptBytes, responseBytes []byte
	var dispatchedAt, completedAt, sealedAt sql.NullTime
	err := database.QueryRowContext(ctx, `SELECT
		c.namespace_id,c.repository_commit,c.cleanup_request_digest,c.resource_registration_request_digest,
		c.deletion_authority_receipt_digest,c.state,c.claim_generation,c.owner_implementation_digest,
		c.authority_issuer_id,c.stage_digest,c.cleanup_receipt_digest,c.owner_admission_digest,c.dispatch_ack_digest,
		c.result_ingress_digest,c.result_ingress_receipt_digest,c.response_digest,c.request_bytes,d.receipt_bytes,
		r.receipt_bytes,c.response_bytes,c.v46_eligible,c.claimed_at,c.dispatched_at,c.completed_at,c.sealed_at
	FROM ae_cppr_cleanups c
	JOIN ae_cppr_deletion_authority_receipts d
	  ON d.namespace_id=c.namespace_id AND d.repository_commit=c.repository_commit
	 AND d.request_digest=c.resource_registration_request_digest
	 AND d.deletion_authority_receipt_digest=c.deletion_authority_receipt_digest
	LEFT JOIN ae_cppr_cleanup_receipts r
	  ON r.namespace_id=c.namespace_id AND r.repository_commit=c.repository_commit
	 AND r.cleanup_request_digest=c.cleanup_request_digest AND r.cleanup_receipt_digest=c.cleanup_receipt_digest
	WHERE c.namespace_id=$1 AND c.repository_commit=$2 AND c.cleanup_request_digest=$3`,
		authority.NamespaceID, request.RepositoryCommit, request.CleanupRequestDigest,
	).Scan(
		&record.NamespaceID, &record.RepositoryCommit, &record.CleanupRequestDigest,
		&record.ResourceRegistrationRequestDigest, &record.DeletionAuthorityReceiptDigest,
		&record.State, &record.ClaimGeneration, &record.OwnerImplementationDigest, &record.AuthorityIssuerID,
		&stageDigest, &cleanupReceiptDigest, &ownerAdmissionDigest, &dispatchAckDigest,
		&resultIngressDigest, &resultIngressReceiptDigest, &responseDigest,
		&record.RequestBytes, &record.DeletionAuthorityReceiptBytes, &cleanupReceiptBytes, &responseBytes,
		&record.V46Eligible, &record.ClaimedAt, &dispatchedAt, &completedAt, &sealedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, err
	}
	record.StageDigest = stageDigest.String
	record.CleanupReceiptDigest = cleanupReceiptDigest.String
	record.OwnerAdmissionDigest = ownerAdmissionDigest.String
	record.DispatchAckDigest = dispatchAckDigest.String
	record.ResultIngressDigest = resultIngressDigest.String
	record.ResultIngressReceiptDigest = resultIngressReceiptDigest.String
	record.ResponseDigest = responseDigest.String
	record.CleanupReceiptBytes = append([]byte(nil), cleanupReceiptBytes...)
	record.ResponseBytes = append([]byte(nil), responseBytes...)
	if dispatchedAt.Valid {
		record.DispatchedAt = dispatchedAt.Time.UTC()
	}
	if completedAt.Valid {
		record.CompletedAt = completedAt.Time.UTC()
	}
	if sealedAt.Valid {
		record.SealedAt = sealedAt.Time.UTC()
	}
	return record, nil
}

func evaluationCapabilityProbeProviderResourceCleanupRecordMatchesRequest(
	record EvaluationCapabilityProbeProviderResourceCleanupRecord,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	ownerImplementationDigest string,
) bool {
	return record.NamespaceID == authority.NamespaceID && record.RepositoryCommit == request.RepositoryCommit &&
		record.CleanupRequestDigest == request.CleanupRequestDigest &&
		record.ResourceRegistrationRequestDigest == request.ResourceRegistrationRequestDigest &&
		record.DeletionAuthorityReceiptDigest == request.DeletionAuthorityReceiptDigest &&
		record.ClaimGeneration == 1 && record.OwnerImplementationDigest == ownerImplementationDigest &&
		record.AuthorityIssuerID == authority.PrincipalID && record.V46Eligible && bytes.Equal(record.RequestBytes, request.Bytes)
}

func (repository *Repository) ClaimEvaluationCapabilityProbeProviderResourceCleanup(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	ownerImplementationDigest string,
	claimedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	if validateEvaluationAuthority(authority) != nil || !evaluationDigestPattern.MatchString(ownerImplementationDigest) ||
		claimedAt.IsZero() || request.RepositoryCommit == "" || request.CleanupRequestDigest == "" {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, ErrInvalid
	}
	claimedAt = claimedAt.UTC().Truncate(time.Millisecond)
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(writeContext, `INSERT INTO ae_cppr_cleanups (
		namespace_id,repository_commit,cleanup_request_digest,resource_registration_request_digest,
		deletion_authority_receipt_digest,state,claim_generation,owner_implementation_digest,authority_issuer_id,
		request_json,request_bytes,v46_eligible,claimed_at,updated_at
	) SELECT $1,$2,$3,$4,$5,'claimed',1,$6,$7,$8::jsonb,$9,TRUE,$10,$10
	FROM ae_cppr_registrations p
	JOIN ae_cppr_deletion_authority_receipts d
	  ON d.namespace_id=p.namespace_id AND d.repository_commit=p.repository_commit AND d.request_digest=p.request_digest
	 AND d.deletion_authority_receipt_digest=p.deletion_authority_receipt_digest
	WHERE p.namespace_id=$1 AND p.repository_commit=$2 AND p.request_digest=$4
	  AND p.deletion_authority_receipt_digest=$5 AND p.state='sealed' AND p.v46_eligible
	ON CONFLICT DO NOTHING`, authority.NamespaceID, request.RepositoryCommit, request.CleanupRequestDigest,
		request.ResourceRegistrationRequestDigest, request.DeletionAuthorityReceiptDigest,
		ownerImplementationDigest, authority.PrincipalID, string(request.Bytes), request.Bytes, claimedAt)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeProviderResourceCleanup(writeContext, repository.db, authority, request)
	if err != nil || !evaluationCapabilityProbeProviderResourceCleanupRecordMatchesRequest(
		record, authority, request, ownerImplementationDigest,
	) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	return record, inserted == 0, nil
}

func (repository *Repository) MarkEvaluationCapabilityProbeProviderResourceCleanupDispatched(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	if validateEvaluationAuthority(authority) != nil || !evaluationDigestPattern.MatchString(stageDigest) || dispatchedAt.IsZero() {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, ErrInvalid
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	var ownerImplementationDigest string
	if err := repository.db.QueryRowContext(writeContext, `SELECT owner_implementation_digest
		FROM ae_cppr_cleanups
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`,
		authority.NamespaceID, request.RepositoryCommit, request.CleanupRequestDigest).Scan(&ownerImplementationDigest); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	expected, err := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(request, ownerImplementationDigest)
	if err != nil || expected != stageDigest {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, ErrConflict
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	result, err := repository.db.ExecContext(writeContext, `UPDATE ae_cppr_cleanups
	SET state='dispatched',stage_digest=$4,dispatched_at=$5,updated_at=$5
	WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3
	  AND state='claimed' AND claim_generation=1`, authority.NamespaceID, request.RepositoryCommit,
		request.CleanupRequestDigest, stageDigest, dispatchedAt)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeProviderResourceCleanup(writeContext, repository.db, authority, request)
	if err != nil || record.State != "dispatched" && record.State != "sealed" || record.StageDigest != stageDigest {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	return record, updated == 0, nil
}

func (repository *Repository) GetEvaluationCapabilityProbeProviderResourceCleanup(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, err
	}
	if validateEvaluationAuthority(authority) != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	return queryEvaluationCapabilityProbeProviderResourceCleanup(readContext, repository.db, authority, request)
}

func (repository *Repository) StoreEvaluationCapabilityProbeProviderResourceCleanupResult(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	stageDigest string,
	receipt evaluationCapabilityProbeProviderResourceCleanupReceipt,
	ownerAdmissionDigest string,
	dispatchAckDigest string,
	storedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	if validateEvaluationAuthority(authority) != nil || storedAt.IsZero() ||
		!evaluationDigestPattern.MatchString(stageDigest) || !evaluationDigestPattern.MatchString(ownerAdmissionDigest) ||
		!evaluationDigestPattern.MatchString(dispatchAckDigest) || receipt.CompletedAt.After(storedAt.UTC().Truncate(time.Millisecond)) {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, ErrInvalid
	}
	storedAt = storedAt.UTC().Truncate(time.Millisecond)
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var state, storedStage, ownerImplementationDigest string
	var existingAck sql.NullString
	if err := tx.QueryRowContext(writeContext, `SELECT state,stage_digest,owner_implementation_digest,dispatch_ack_digest
		FROM ae_cppr_cleanups
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3 FOR UPDATE`,
		authority.NamespaceID, request.RepositoryCommit, request.CleanupRequestDigest,
	).Scan(&state, &storedStage, &ownerImplementationDigest, &existingAck); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, ErrNotFound
		}
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	expectedAdmission, admissionErr := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
		request.CleanupRequestDigest, stageDigest, ownerImplementationDigest,
	)
	expectedAck, ackErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
		request.CleanupRequestDigest, stageDigest, expectedAdmission, receipt.CleanupReceiptDigest,
	)
	ingressDigest, ingressErr := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
		request.CleanupRequestDigest, expectedAck, receipt.CleanupReceiptDigest,
	)
	ingressReceiptDigest, ingressReceiptErr := evaluationCapabilityProbeProviderResourceCleanupIngressReceiptDigest(
		ingressDigest, receipt.CleanupReceiptDigest,
	)
	if state != "dispatched" && state != "sealed" || storedStage != stageDigest || admissionErr != nil || ackErr != nil ||
		ingressErr != nil || ingressReceiptErr != nil || expectedAdmission != ownerAdmissionDigest || expectedAck != dispatchAckDigest ||
		receipt.RequestDigest != request.ResourceRegistrationRequestDigest ||
		receipt.DeletionReceiptDigest != request.DeletionAuthorityReceiptDigest {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, ErrConflict
	}
	componentResult, err := tx.ExecContext(writeContext, `INSERT INTO ae_cppr_cleanup_receipts (
		namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest,receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT DO NOTHING`, authority.NamespaceID,
		request.RepositoryCommit, request.CleanupRequestDigest, receipt.CleanupReceiptDigest,
		string(receipt.Bytes), receipt.Bytes, storedAt)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	componentInserted, err := componentResult.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	if componentInserted == 0 {
		var existingDigest string
		var existingBytes []byte
		if err := tx.QueryRowContext(writeContext, `SELECT cleanup_receipt_digest,receipt_bytes
			FROM ae_cppr_cleanup_receipts
			WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3 FOR SHARE`,
			authority.NamespaceID, request.RepositoryCommit, request.CleanupRequestDigest,
		).Scan(&existingDigest, &existingBytes); err != nil || existingDigest != receipt.CleanupReceiptDigest ||
			!bytes.Equal(existingBytes, receipt.Bytes) {
			if err == nil {
				err = ErrConflict
			}
			return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
		}
	}
	result, err := tx.ExecContext(writeContext, `UPDATE ae_cppr_cleanups SET
		cleanup_receipt_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,result_ingress_digest=$7,
		result_ingress_receipt_digest=$8,completed_at=$9,updated_at=$10
	WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3 AND state='dispatched'
	  AND stage_digest=$11 AND dispatch_ack_digest IS NULL`, authority.NamespaceID, request.RepositoryCommit,
		request.CleanupRequestDigest, receipt.CleanupReceiptDigest, ownerAdmissionDigest, dispatchAckDigest,
		ingressDigest, ingressReceiptDigest, receipt.CompletedAt, storedAt, stageDigest)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeProviderResourceCleanup(writeContext, repository.db, authority, request)
	if err != nil || record.CleanupReceiptDigest != receipt.CleanupReceiptDigest ||
		record.OwnerAdmissionDigest != ownerAdmissionDigest || record.DispatchAckDigest != dispatchAckDigest ||
		record.ResultIngressDigest != ingressDigest || record.ResultIngressReceiptDigest != ingressReceiptDigest ||
		!bytes.Equal(record.CleanupReceiptBytes, receipt.Bytes) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	return record, updated == 0 || existingAck.Valid, nil
}

func (repository *Repository) SealEvaluationCapabilityProbeProviderResourceCleanup(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	responseDigest string,
	response []byte,
	sealedAt time.Time,
) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	if validateEvaluationAuthority(authority) != nil || !evaluationDigestPattern.MatchString(responseDigest) ||
		sealedAt.IsZero() || len(response) == 0 || len(response) > maximumEvaluationCapabilityProbeProviderResourceCleanupResponseBytes {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, ErrInvalid
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(writeContext, `UPDATE ae_cppr_cleanups SET
		state='sealed',response_digest=$4,response_json=$5::jsonb,response_bytes=$6,sealed_at=$7,updated_at=$7
	WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3 AND state='dispatched'
	  AND cleanup_receipt_digest IS NOT NULL AND dispatch_ack_digest IS NOT NULL AND result_ingress_receipt_digest IS NOT NULL`,
		authority.NamespaceID, request.RepositoryCommit, request.CleanupRequestDigest,
		responseDigest, string(response), response, sealedAt)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	record, err := queryEvaluationCapabilityProbeProviderResourceCleanup(writeContext, repository.db, authority, request)
	if err != nil || record.State != "sealed" || record.ResponseDigest != responseDigest ||
		!bytes.Equal(record.ResponseBytes, response) || record.SealedAt.IsZero() {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityProbeProviderResourceCleanupRecord{}, false, err
	}
	return record, updated == 0, nil
}

func (repository *Repository) ListEvaluationCapabilityProbeProviderResourceCleanups(
	ctx context.Context,
	authority EvaluationAuthority,
	repositoryCommit string,
) ([]evaluationCapabilityProbeProviderResourceCleanupListRecord, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	if validateEvaluationAuthority(authority) != nil || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return nil, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.db.QueryContext(readContext, `SELECT
		p.request_bytes,p.result_bytes,p.response_bytes,d.receipt_bytes,c.request_bytes,c.response_bytes,
		p.claimed_at,p.sealed_at
	FROM ae_cppr_registrations p
	JOIN ae_cppr_deletion_authority_receipts d
	  ON d.namespace_id=p.namespace_id AND d.repository_commit=p.repository_commit AND d.request_digest=p.request_digest
	 AND d.deletion_authority_receipt_digest=p.deletion_authority_receipt_digest
	LEFT JOIN ae_cppr_cleanups c
	  ON c.namespace_id=p.namespace_id AND c.repository_commit=p.repository_commit
	 AND c.resource_registration_request_digest=p.request_digest
	WHERE p.namespace_id=$1 AND p.repository_commit=$2 AND p.state='sealed' AND p.v46_eligible
	ORDER BY p.request_digest COLLATE "C" LIMIT 5`, authority.NamespaceID, repositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]evaluationCapabilityProbeProviderResourceCleanupListRecord, 0, maximumEvaluationCapabilityProbeProviderResourceRegistrations)
	for rows.Next() {
		var record evaluationCapabilityProbeProviderResourceCleanupListRecord
		if err := rows.Scan(&record.ResourceRegistrationRequestBytes, &record.ProviderResourceResultBytes,
			&record.RegistrationResponseBytes, &record.DeletionAuthorityReceiptBytes,
			&record.CleanupRequestBytes, &record.CleanupResponseBytes, &record.ClaimedAt, &record.SealedAt); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) > int(maximumEvaluationCapabilityProbeProviderResourceRegistrations) {
		return nil, ErrConflict
	}
	return records, nil
}
