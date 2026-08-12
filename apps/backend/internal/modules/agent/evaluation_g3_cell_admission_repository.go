package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"
)

// AuthorizeEvaluationG3CellAdmissionGeneration binds pre-dispatch admission to
// the current, unexpired shard lease generation. The public request cannot
// select a stale generation even with a valid service credential.
func (repository *Repository) AuthorizeEvaluationG3CellAdmissionGeneration(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	shardID string,
	generation int64,
	observedAt time.Time,
) error {
	if err := repository.available(); err != nil {
		return err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return err
	}
	if err := validateEvaluationPartition(partition); err != nil ||
		!validEvaluationServiceIdentity(shardID) || generation < 1 || observedAt.IsZero() {
		return ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var currentGeneration int64
	var expiresAt time.Time
	err := repository.db.QueryRowContext(ctx, `SELECT generation, expires_at
		FROM agent_evaluation_shard_leases
		WHERE namespace_id=$1 AND plan_digest=$2 AND shard_id=$3`,
		authority.NamespaceID, partition.PlanDigest, shardID,
	).Scan(&currentGeneration, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if currentGeneration != generation || !expiresAt.After(observedAt.UTC()) {
		return ErrConflict
	}
	return nil
}

func (repository *Repository) MarkEvaluationG3CellAdmissionDispatched(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		!evaluationG3CellAdmissionBindingKind(binding) || claimGeneration != 1 ||
		!evaluationDigestPattern.MatchString(stageDigest) || dispatchedAt.IsZero() {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched', stage_digest=$6, dispatched_at=$7
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='claimed'
			AND claim_generation=1 AND v46_eligible`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, binding.ServiceKind, binding.RequestDigest, stageDigest, dispatchedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
	if err != nil || record.State != "dispatched" && record.State != "sealed" || record.StageDigest != stageDigest {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	return record, updated == 0, nil
}

func (repository *Repository) AcknowledgeEvaluationG3CellAdmission(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	responseDigest string,
	responseBytes []byte,
	dispatchAckDigest string,
	acknowledgedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	computed, digestErr := evaluationCanonicalByteDigest(responseBytes, maximumEvaluationG3CellAdmissionResponseBytes)
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		!evaluationG3CellAdmissionBindingKind(binding) || claimGeneration != 1 || acknowledgedAt.IsZero() ||
		digestErr != nil || computed != responseDigest ||
		!evaluationDigestPattern.MatchString(dispatchAckDigest) {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	acknowledgedAt = acknowledgedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_digest=$6, response_bytes=$7, dispatch_ack_digest=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='dispatched'
			AND claim_generation=1 AND v46_eligible AND dispatched_at <= $9
			AND response_digest IS NULL AND response_bytes IS NULL AND dispatch_ack_digest IS NULL`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		binding.ServiceKind, binding.RequestDigest, responseDigest, responseBytes,
		dispatchAckDigest, acknowledgedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
	if err != nil || record.State != "dispatched" && record.State != "sealed" ||
		record.ResponseDigest != responseDigest || !bytes.Equal(record.ResponseBytes, responseBytes) ||
		record.DispatchAckDigest != dispatchAckDigest {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	return record, updated == 0, nil
}

func (repository *Repository) SealEvaluationG3CellAdmission(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	responseDigest string,
	dispatchAckDigest string,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		!evaluationG3CellAdmissionBindingKind(binding) || claimGeneration != 1 || sealedAt.IsZero() ||
		!evaluationDigestPattern.MatchString(responseDigest) ||
		!evaluationDigestPattern.MatchString(dispatchAckDigest) {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrInvalid
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed', sealed_at=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='dispatched'
			AND claim_generation=1 AND v46_eligible
			AND response_digest=$6 AND dispatch_ack_digest=$7 AND response_bytes IS NOT NULL`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		binding.ServiceKind, binding.RequestDigest, responseDigest, dispatchAckDigest, sealedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, repository.db, authority, partition, binding)
	if err != nil || record.State != "sealed" || record.ResponseDigest != responseDigest ||
		record.DispatchAckDigest != dispatchAckDigest {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	return record, updated == 0, nil
}
