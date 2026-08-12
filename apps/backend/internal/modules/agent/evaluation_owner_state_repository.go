package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationOwnerStateRepository interface {
	GetEvaluationOwnerState(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		string,
	) (EvaluationOwnerStateRecord, error)
	StageEvaluationOwnerStateDispatch(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		EvaluationOwnerStatePrior,
		time.Time,
	) (EvaluationOwnerStateDispatchRecord, bool, error)
	StoreEvaluationOwnerStateCASArtifact(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationOwnerStateCASRecord,
		time.Time,
	) (EvaluationOwnerStateCASRecord, bool, error)
	GetEvaluationOwnerStateCASArtifact(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		string,
		string,
	) (EvaluationOwnerStateCASRecord, error)
	StoreEvaluationOwnerStateResult(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationOwnerStateTransition,
		string,
		string,
		string,
		string,
		time.Time,
	) (EvaluationOwnerStateDispatchRecord, bool, error)
	GetEvaluationOwnerStateDispatch(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		string,
	) (EvaluationOwnerStateDispatchRecord, error)
}

func scanEvaluationOwnerState(row interface{ Scan(...any) error }) (EvaluationOwnerStateRecord, error) {
	var record EvaluationOwnerStateRecord
	var eligible bool
	err := row.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &eligible,
		&record.ServiceKind, &record.OwnerStateID, &record.Revision, &record.RootDigest,
		&record.SnapshotKind, &record.SnapshotDigest, &record.SnapshotState, &record.BundleBytes,
		&record.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationOwnerStateRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationOwnerStateRecord{}, err
	}
	if !eligible {
		return EvaluationOwnerStateRecord{}, conflict("evaluation owner state is legacy-ineligible and requires requalification")
	}
	return record, nil
}

func queryEvaluationOwnerState(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	serviceKind string,
	ownerStateID string,
	forUpdate bool,
) (EvaluationOwnerStateRecord, error) {
	lock := ""
	if forUpdate {
		lock = " FOR UPDATE"
	}
	return scanEvaluationOwnerState(queryer.QueryRowContext(ctx, `SELECT
		namespace_id, plan_digest, repository_commit, v46_eligible, service_kind,
		owner_state_id, revision, root_digest, snapshot_kind, snapshot_digest,
		bundle_json#>>'{snapshot,state}', bundle_bytes, updated_at
	FROM agent_evaluation_owner_states
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND owner_state_id=$5`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, serviceKind, ownerStateID))
}

func (repository *Repository) GetEvaluationOwnerState(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	serviceKind string,
	ownerStateID string,
) (EvaluationOwnerStateRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationOwnerStateRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOwnerStateRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil ||
		!oneOfString(serviceKind, "controlled-workspace", "verification-evidence") ||
		!evaluationDigestPattern.MatchString(ownerStateID) {
		return EvaluationOwnerStateRecord{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	record, err := queryEvaluationOwnerState(ctx, repository.db, authority, partition, serviceKind, ownerStateID, false)
	if err != nil {
		return EvaluationOwnerStateRecord{}, err
	}
	bundle, root, err := decodeEvaluationOwnerStateBundle(
		record.BundleBytes, serviceKind, authority.NamespaceID, partition, ownerStateID,
		record.Revision, evaluationOwnerStatePreviousRoot(record.BundleBytes),
	)
	snapshot, _ := objectMember(bundle, "snapshot")
	if err != nil || root != record.RootDigest || record.SnapshotState != stringMember(snapshot, "state") ||
		record.UpdatedAt.IsZero() {
		return EvaluationOwnerStateRecord{}, ErrConflict
	}
	return record, nil
}

func evaluationOwnerStatePreviousRoot(source []byte) string {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationOwnerStateOuterBytes)
	if err != nil || value["previousOwnerStateRootDigest"] == nil {
		return ""
	}
	return stringMember(value, "previousOwnerStateRootDigest")
}

func validateEvaluationOwnerStatePrior(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	prior EvaluationOwnerStatePrior,
) error {
	if !evaluationOwnerStatefulOperation(binding.ServiceKind, binding.Operation, binding.RouteBinding) ||
		!evaluationDigestPattern.MatchString(binding.OwnerImplementationDigest) ||
		prior.OwnerImplementationDigest != binding.OwnerImplementationDigest ||
		!evaluationDigestPattern.MatchString(prior.OwnerStateID) || prior.Revision < 0 {
		return ErrInvalid
	}
	if prior.Revision == 0 {
		if len(prior.Bundle) != 0 || prior.RootDigest != "" {
			return ErrInvalid
		}
		return nil
	}
	if len(prior.Bundle) == 0 || !evaluationDigestPattern.MatchString(prior.RootDigest) {
		return ErrInvalid
	}
	_, root, err := decodeEvaluationOwnerStateBundle(
		prior.Bundle, binding.ServiceKind, authority.NamespaceID, partition, prior.OwnerStateID,
		prior.Revision, evaluationOwnerStatePreviousRoot(prior.Bundle),
	)
	if err != nil || root != prior.RootDigest {
		return ErrConflict
	}
	return nil
}

func scanEvaluationOwnerStateDispatch(row *sql.Row) (EvaluationOwnerStateDispatchRecord, error) {
	var record EvaluationOwnerStateDispatchRecord
	var eligible bool
	var priorRoot, dispatchAck, responseDigest, ownerStateRoot, resultReceipt sql.NullString
	var ownerStateRevision sql.NullInt64
	var publicResult []byte
	var state string
	err := row.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &eligible,
		&record.ServiceKind, &record.Operation, &record.RouteBinding, &record.RequestDigest,
		&record.OwnerImplementationDigest, &record.OwnerStateID, &record.PriorRevision,
		&priorRoot, &record.StageDigest, &state, &responseDigest, &publicResult,
		&ownerStateRevision, &ownerStateRoot, &dispatchAck, &resultReceipt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationOwnerStateDispatchRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, err
	}
	if !eligible {
		return EvaluationOwnerStateDispatchRecord{}, conflict("evaluation owner-state operation is legacy-ineligible and requires requalification")
	}
	record.PriorRootDigest = priorRoot.String
	record.ResponseDigest = responseDigest.String
	record.PublicResultBytes = append([]byte(nil), publicResult...)
	record.OwnerStateRevision = ownerStateRevision.Int64
	record.OwnerStateRootDigest = ownerStateRoot.String
	record.DispatchAckDigest = dispatchAck.String
	record.ResultReceiptDigest = resultReceipt.String
	if state == "staged" {
		if record.ResponseDigest != "" || len(record.PublicResultBytes) != 0 || record.OwnerStateRevision != 0 ||
			record.OwnerStateRootDigest != "" || record.DispatchAckDigest != "" || record.ResultReceiptDigest != "" {
			return EvaluationOwnerStateDispatchRecord{}, ErrConflict
		}
	} else if state == "sealed" {
		if !evaluationDigestPattern.MatchString(record.ResponseDigest) || len(record.PublicResultBytes) == 0 ||
			record.OwnerStateRevision != record.PriorRevision+1 ||
			!evaluationDigestPattern.MatchString(record.OwnerStateRootDigest) ||
			!evaluationDigestPattern.MatchString(record.DispatchAckDigest) ||
			!evaluationDigestPattern.MatchString(record.ResultReceiptDigest) {
			return EvaluationOwnerStateDispatchRecord{}, ErrConflict
		}
	} else {
		return EvaluationOwnerStateDispatchRecord{}, ErrConflict
	}
	return record, nil
}

func queryEvaluationOwnerStateDispatch(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	serviceKind string,
	requestDigest string,
	forUpdate bool,
) (EvaluationOwnerStateDispatchRecord, error) {
	lock := ""
	if forUpdate {
		lock = " FOR UPDATE"
	}
	return scanEvaluationOwnerStateDispatch(queryer.QueryRowContext(ctx, `SELECT
		namespace_id, plan_digest, repository_commit, v46_eligible, service_kind, operation,
		route_binding, request_digest, owner_implementation_digest, owner_state_id,
		prior_owner_state_revision, prior_owner_state_root_digest, stage_digest, state,
		response_digest, public_result_bytes, owner_state_revision, owner_state_root_digest,
		dispatch_ack_digest, result_receipt_digest
	FROM agent_evaluation_owner_state_operations
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND request_digest=$5`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, serviceKind, requestDigest))
}

func (repository *Repository) StageEvaluationOwnerStateDispatch(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	prior EvaluationOwnerStatePrior,
	dispatchedAt time.Time,
) (EvaluationOwnerStateDispatchRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		validateEvaluationOwnerStatePrior(authority, partition, binding, prior) != nil || dispatchedAt.IsZero() {
		return EvaluationOwnerStateDispatchRecord{}, false, ErrInvalid
	}
	stageDigest, err := evaluationOwnerStateStageDigest(
		binding.ServiceKind, binding.Operation, binding.RouteBinding, binding.RequestDigest,
		binding.OwnerImplementationDigest, prior.OwnerStateID, prior.Revision, prior.RootDigest,
	)
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	dispatchedAt = dispatchedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	current, currentErr := queryEvaluationOwnerState(
		ctx, tx, authority, partition, binding.ServiceKind, prior.OwnerStateID, true,
	)
	if prior.Revision == 0 {
		if currentErr == nil || !errors.Is(currentErr, ErrNotFound) {
			if currentErr == nil {
				return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
			}
			return EvaluationOwnerStateDispatchRecord{}, false, currentErr
		}
	} else if currentErr != nil || current.Revision != prior.Revision || current.RootDigest != prior.RootDigest ||
		!bytes.Equal(current.BundleBytes, prior.Bundle) {
		if currentErr != nil {
			return EvaluationOwnerStateDispatchRecord{}, false, currentErr
		}
		return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_state_operations (
		namespace_id, plan_digest, repository_commit, service_kind, operation, route_binding,
		request_digest, owner_implementation_digest, owner_state_id, prior_owner_state_revision,
		prior_owner_state_root_digest, stage_digest, state, staged_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'staged',$13)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		binding.ServiceKind, binding.Operation, binding.RouteBinding, binding.RequestDigest,
		binding.OwnerImplementationDigest, prior.OwnerStateID, prior.Revision,
		nullableEvaluationControlledString(prior.RootDigest), stageDigest, dispatchedAt)
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	if inserted == 1 {
		journal, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched', owner_implementation_digest=$6, stage_digest=$7, dispatched_at=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='claimed'
			AND claim_generation=1 AND v46_eligible`, authority.NamespaceID, partition.PlanDigest,
			partition.RepositoryCommit, binding.ServiceKind, binding.RequestDigest,
			binding.OwnerImplementationDigest, stageDigest, dispatchedAt)
		if err != nil {
			return EvaluationOwnerStateDispatchRecord{}, false, err
		}
		updated, err := journal.RowsAffected()
		if err != nil || updated != 1 {
			if err != nil {
				return EvaluationOwnerStateDispatchRecord{}, false, err
			}
			return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
		}
	}
	record, err := queryEvaluationOwnerStateDispatch(
		ctx, tx, authority, partition, binding.ServiceKind, binding.RequestDigest, false,
	)
	if err != nil || record.StageDigest != stageDigest || record.OwnerStateID != prior.OwnerStateID ||
		record.PriorRevision != prior.Revision || record.PriorRootDigest != prior.RootDigest {
		if err != nil {
			return EvaluationOwnerStateDispatchRecord{}, false, err
		}
		return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	return record, inserted == 0, nil
}

func (repository *Repository) GetEvaluationOwnerStateDispatch(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	serviceKind string,
	requestDigest string,
) (EvaluationOwnerStateDispatchRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil ||
		!oneOfString(serviceKind, "controlled-workspace", "verification-evidence") ||
		!evaluationDigestPattern.MatchString(requestDigest) {
		return EvaluationOwnerStateDispatchRecord{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	return queryEvaluationOwnerStateDispatch(ctx, repository.db, authority, partition, serviceKind, requestDigest, false)
}

func evaluationOwnerStateCASReceiptDigest(record EvaluationOwnerStateCASRecord) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-cas-receipt", "version": evaluationOwnerStateVersion,
		"serviceKind": record.ServiceKind, "requestDigest": record.RequestDigest,
		"ownerImplementationDigest": record.OwnerImplementationDigest, "stageDigest": record.StageDigest,
		"ownerStateId": record.OwnerStateID, "artifactIdentityDigest": record.ArtifactIdentityDigest,
		"uploadDigest": record.UploadDigest,
	})
}

func evaluationOwnerStateCASArtifactIdentityDigest(record EvaluationOwnerStateCASRecord) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":      "prodivix.agent-evaluation-owner-state-cas-artifact-identity",
		"version":     evaluationOwnerStateVersion,
		"artifactRef": record.ArtifactRef, "artifactKind": record.ArtifactKind,
		"mediaType": record.MediaType, "artifactDigest": record.ArtifactDigest,
		"byteLength": record.ByteLength,
	})
}

func evaluationOwnerStateCASDescriptor(record EvaluationOwnerStateCASRecord) (map[string]any, error) {
	base := map[string]any{
		"format": evaluationOwnerStateCASDescriptorFormat, "version": evaluationOwnerStateVersion,
		"artifactRef": record.ArtifactRef, "artifactKind": record.ArtifactKind, "mediaType": record.MediaType,
		"artifactDigest": record.ArtifactDigest, "byteLength": record.ByteLength,
		"casReceiptDigest": record.CASReceiptDigest,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	base["descriptorDigest"] = digest
	return base, nil
}

func (repository *Repository) StoreEvaluationOwnerStateCASArtifact(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	record EvaluationOwnerStateCASRecord,
	uploadedAt time.Time,
) (EvaluationOwnerStateCASRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationOwnerStateCASRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOwnerStateCASRecord{}, false, err
	}
	digest := fmt.Sprintf("sha256-%x", sha256.Sum256(record.ContentBytes))
	identityDigest, identityErr := evaluationOwnerStateCASArtifactIdentityDigest(record)
	receiptDigest, receiptErr := evaluationOwnerStateCASReceiptDigest(record)
	descriptor, descriptorErr := evaluationOwnerStateCASDescriptor(record)
	if err := validateEvaluationPartition(partition); err != nil || uploadedAt.IsZero() ||
		!oneOfString(record.ServiceKind, "controlled-workspace", "verification-evidence") ||
		!evaluationDigestPattern.MatchString(record.RequestDigest) ||
		!evaluationDigestPattern.MatchString(record.OwnerImplementationDigest) ||
		!evaluationDigestPattern.MatchString(record.StageDigest) ||
		!evaluationDigestPattern.MatchString(record.OwnerStateID) ||
		!validEvaluationAgentControlIdentity(record.ArtifactRef) ||
		!validEvaluationAgentControlIdentity(record.ArtifactKind) ||
		!validVerificationEvidenceMediaType(record.MediaType) ||
		len(record.ContentBytes) == 0 || len(record.ContentBytes) > maximumEvaluationOwnerStateCASArtifactBytes ||
		record.ByteLength != int64(len(record.ContentBytes)) || record.ArtifactDigest != digest ||
		!evaluationDigestPattern.MatchString(record.ArtifactIdentityDigest) ||
		!evaluationDigestPattern.MatchString(record.DescriptorDigest) ||
		!evaluationDigestPattern.MatchString(record.UploadDigest) ||
		!evaluationDigestPattern.MatchString(record.CASReceiptDigest) || identityErr != nil ||
		receiptErr != nil || descriptorErr != nil || identityDigest != record.ArtifactIdentityDigest ||
		receiptDigest != record.CASReceiptDigest ||
		stringMember(descriptor, "descriptorDigest") != record.DescriptorDigest {
		return EvaluationOwnerStateCASRecord{}, false, ErrInvalid
	}
	uploadedAt = uploadedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationOwnerStateCASRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	dispatch, err := queryEvaluationOwnerStateDispatch(
		ctx, tx, authority, partition, record.ServiceKind, record.RequestDigest, true,
	)
	if err != nil || dispatch.StageDigest != record.StageDigest ||
		dispatch.OwnerImplementationDigest != record.OwnerImplementationDigest ||
		dispatch.OwnerStateID != record.OwnerStateID {
		if err != nil {
			return EvaluationOwnerStateCASRecord{}, false, err
		}
		return EvaluationOwnerStateCASRecord{}, false, ErrConflict
	}
	var currentBytes int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(byte_length),0)
		FROM agent_evaluation_owner_state_cas_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND owner_state_id=$5 AND artifact_ref<>$6`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, record.ServiceKind, dispatch.OwnerStateID, record.ArtifactRef).Scan(&currentBytes); err != nil {
		return EvaluationOwnerStateCASRecord{}, false, err
	}
	if currentBytes+record.ByteLength > int64(evaluationOwnerStateMaximumBytes(record.ServiceKind)) {
		return EvaluationOwnerStateCASRecord{}, false, ErrConflict
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_state_cas_artifacts (
		namespace_id, plan_digest, repository_commit, service_kind, owner_state_id, request_digest,
		owner_implementation_digest, stage_digest, artifact_ref, artifact_kind, media_type,
		artifact_digest, byte_length, content_bytes, artifact_identity_digest, descriptor_digest,
		upload_digest, cas_receipt_digest, uploaded_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		record.ServiceKind, dispatch.OwnerStateID, record.RequestDigest, record.OwnerImplementationDigest,
		record.StageDigest, record.ArtifactRef, record.ArtifactKind, record.MediaType, record.ArtifactDigest,
		record.ByteLength, record.ContentBytes, record.ArtifactIdentityDigest, record.DescriptorDigest,
		record.UploadDigest, record.CASReceiptDigest, uploadedAt)
	if err != nil {
		return EvaluationOwnerStateCASRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationOwnerStateCASRecord{}, false, err
	}
	var stored EvaluationOwnerStateCASRecord
	stored.NamespaceID, stored.PlanDigest, stored.RepositoryCommit = authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit
	stored.OwnerStateID = dispatch.OwnerStateID
	err = tx.QueryRowContext(ctx, `SELECT service_kind, request_digest, owner_implementation_digest,
		stage_digest, artifact_ref, artifact_kind, media_type, artifact_digest, byte_length,
		content_bytes, artifact_identity_digest, descriptor_digest, upload_digest, cas_receipt_digest
	FROM agent_evaluation_owner_state_cas_artifacts
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND owner_state_id=$5 AND artifact_ref=$6`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, record.ServiceKind, dispatch.OwnerStateID,
		record.ArtifactRef).Scan(&stored.ServiceKind, &stored.RequestDigest, &stored.OwnerImplementationDigest,
		&stored.StageDigest, &stored.ArtifactRef, &stored.ArtifactKind, &stored.MediaType,
		&stored.ArtifactDigest, &stored.ByteLength, &stored.ContentBytes, &stored.ArtifactIdentityDigest,
		&stored.DescriptorDigest, &stored.UploadDigest, &stored.CASReceiptDigest)
	if err != nil {
		return EvaluationOwnerStateCASRecord{}, false, err
	}
	if !bytes.Equal(stored.ContentBytes, record.ContentBytes) || stored.DescriptorDigest != record.DescriptorDigest ||
		stored.UploadDigest != record.UploadDigest || stored.CASReceiptDigest != record.CASReceiptDigest {
		return EvaluationOwnerStateCASRecord{}, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return EvaluationOwnerStateCASRecord{}, false, err
	}
	return stored, inserted == 0, nil
}

func scanEvaluationOwnerStateCASArtifact(row interface{ Scan(...any) error }) (EvaluationOwnerStateCASRecord, error) {
	var record EvaluationOwnerStateCASRecord
	var eligible bool
	err := row.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &eligible,
		&record.ServiceKind, &record.OwnerStateID, &record.RequestDigest,
		&record.OwnerImplementationDigest, &record.StageDigest, &record.ArtifactRef,
		&record.ArtifactKind, &record.MediaType, &record.ArtifactDigest, &record.ByteLength,
		&record.ContentBytes, &record.ArtifactIdentityDigest, &record.DescriptorDigest,
		&record.UploadDigest, &record.CASReceiptDigest,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationOwnerStateCASRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationOwnerStateCASRecord{}, err
	}
	if !eligible {
		return EvaluationOwnerStateCASRecord{}, conflict("evaluation owner-state CAS artifact is legacy-ineligible and requires requalification")
	}
	return record, nil
}

func (repository *Repository) GetEvaluationOwnerStateCASArtifact(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	serviceKind string,
	ownerStateID string,
	artifactRef string,
) (EvaluationOwnerStateCASRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationOwnerStateCASRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOwnerStateCASRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil ||
		!oneOfString(serviceKind, "controlled-workspace", "verification-evidence") ||
		!evaluationDigestPattern.MatchString(ownerStateID) ||
		!validEvaluationAgentControlIdentity(artifactRef) {
		return EvaluationOwnerStateCASRecord{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	return scanEvaluationOwnerStateCASArtifact(repository.db.QueryRowContext(ctx, `SELECT
		namespace_id, plan_digest, repository_commit, v46_eligible, service_kind,
		owner_state_id, request_digest, owner_implementation_digest, stage_digest,
		artifact_ref, artifact_kind, media_type, artifact_digest, byte_length,
		content_bytes, artifact_identity_digest, descriptor_digest, upload_digest, cas_receipt_digest
	FROM agent_evaluation_owner_state_cas_artifacts
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND owner_state_id=$5 AND artifact_ref=$6`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		serviceKind, ownerStateID, artifactRef))
}

func evaluationOwnerStateSealedOperationValue(
	transition EvaluationOwnerStateTransition,
	serviceKind, operation, routeBinding, requestDigest string,
) (map[string]any, error) {
	var publicResult any
	if err := decodeEvaluationServiceRawJSON(transition.PublicResult, &publicResult); err != nil {
		return nil, ErrInvalid
	}
	base := map[string]any{
		"format": evaluationOwnerStateSealedOperationFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": serviceKind, "operation": operation, "routeBinding": routeBinding,
		"requestDigest": requestDigest, "ownerImplementationDigest": transition.OwnerImplementationDigest,
		"ownerStateId": transition.OwnerStateID, "priorOwnerStateRevision": transition.PriorRevision,
		"priorOwnerStateRootDigest": nil, "stageDigest": transition.StageDigest,
		"publicResult": publicResult, "responseDigest": transition.ResponseDigest,
		"ownerStateRevision": transition.OwnerStateRevision, "ownerStateRootDigest": transition.OwnerStateRootDigest,
		"dispatchAckDigest": transition.DispatchAckDigest,
	}
	if transition.PriorRootDigest != "" {
		base["priorOwnerStateRootDigest"] = transition.PriorRootDigest
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	base["resultReceiptDigest"] = digest
	return base, nil
}

func validateEvaluationOwnerStateTransition(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	transition EvaluationOwnerStateTransition,
	serviceKind, operation, routeBinding, requestDigest string,
) (map[string]any, error) {
	if !evaluationOwnerStatefulOperation(serviceKind, operation, routeBinding) ||
		!evaluationDigestPattern.MatchString(requestDigest) ||
		!evaluationDigestPattern.MatchString(transition.OwnerImplementationDigest) ||
		!evaluationDigestPattern.MatchString(transition.OwnerStateID) ||
		transition.PriorRevision < 0 || transition.OwnerStateRevision != transition.PriorRevision+1 ||
		(transition.PriorRevision == 0 && transition.PriorRootDigest != "") ||
		(transition.PriorRevision > 0 && !evaluationDigestPattern.MatchString(transition.PriorRootDigest)) ||
		!evaluationDigestPattern.MatchString(transition.StageDigest) ||
		!evaluationDigestPattern.MatchString(transition.ResponseDigest) ||
		!evaluationDigestPattern.MatchString(transition.DispatchAckDigest) ||
		!evaluationDigestPattern.MatchString(transition.OwnerStateRootDigest) ||
		!evaluationDigestPattern.MatchString(transition.ResultReceiptDigest) {
		return nil, ErrInvalid
	}
	publicResultValue, err := decodeCanonicalEvaluationObject(transition.PublicResult, maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil {
		return nil, err
	}
	responseDigest, err := canonicaljson.Digest(publicResultValue)
	if err != nil || responseDigest != transition.ResponseDigest {
		return nil, ErrConflict
	}
	bundleValue, root, err := decodeEvaluationOwnerStateBundle(
		transition.OwnerStateBundle, serviceKind, authority.NamespaceID, partition,
		transition.OwnerStateID, transition.OwnerStateRevision, transition.PriorRootDigest,
	)
	if err != nil || root != transition.OwnerStateRootDigest {
		return nil, ErrConflict
	}
	recent, recentOK := bundleValue["recentOperations"].([]any)
	if !recentOK || len(recent) == 0 {
		return nil, ErrConflict
	}
	last, lastOK := recent[len(recent)-1].(map[string]any)
	lastSequence, sequenceOK := integerMember(last, "sequence")
	if !lastOK || !sequenceOK ||
		lastSequence != transition.OwnerStateRevision || stringMember(last, "operation") != operation ||
		stringMember(last, "routeBinding") != routeBinding || stringMember(last, "requestDigest") != requestDigest ||
		stringMember(last, "stageDigest") != transition.StageDigest ||
		stringMember(last, "responseDigest") != transition.ResponseDigest {
		return nil, ErrConflict
	}
	stage, err := evaluationOwnerStateStageDigest(
		serviceKind, operation, routeBinding, requestDigest, transition.OwnerImplementationDigest,
		transition.OwnerStateID, transition.PriorRevision, transition.PriorRootDigest,
	)
	if err != nil || stage != transition.StageDigest {
		return nil, ErrConflict
	}
	ack, err := evaluationOwnerStateDispatchAckDigest(transition, serviceKind, operation, routeBinding, requestDigest)
	if err != nil || ack != transition.DispatchAckDigest {
		return nil, ErrConflict
	}
	sealed, err := evaluationOwnerStateSealedOperationValue(transition, serviceKind, operation, routeBinding, requestDigest)
	if err != nil || stringMember(sealed, "resultReceiptDigest") != transition.ResultReceiptDigest {
		return nil, ErrConflict
	}
	return sealed, nil
}

func (repository *Repository) StoreEvaluationOwnerStateResult(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	transition EvaluationOwnerStateTransition,
	serviceKind, operation, routeBinding, requestDigest string,
	sealedAt time.Time,
) (EvaluationOwnerStateDispatchRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	sealedValue, err := validateEvaluationOwnerStateTransition(
		authority, partition, transition, serviceKind, operation, routeBinding, requestDigest,
	)
	if err != nil || sealedAt.IsZero() {
		return EvaluationOwnerStateDispatchRecord{}, false, ErrInvalid
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	bundleValue, _, _ := decodeEvaluationOwnerStateBundle(
		transition.OwnerStateBundle, serviceKind, authority.NamespaceID, partition,
		transition.OwnerStateID, transition.OwnerStateRevision, transition.PriorRootDigest,
	)
	snapshot, _ := objectMember(bundleValue, "snapshot")
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	dispatch, err := queryEvaluationOwnerStateDispatch(ctx, tx, authority, partition, serviceKind, requestDigest, true)
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	if dispatch.Operation != operation || dispatch.RouteBinding != routeBinding ||
		dispatch.OwnerImplementationDigest != transition.OwnerImplementationDigest ||
		dispatch.OwnerStateID != transition.OwnerStateID || dispatch.PriorRevision != transition.PriorRevision ||
		dispatch.PriorRootDigest != transition.PriorRootDigest || dispatch.StageDigest != transition.StageDigest {
		return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
	}
	if dispatch.ResultReceiptDigest != "" {
		if dispatch.ResultReceiptDigest != transition.ResultReceiptDigest ||
			dispatch.DispatchAckDigest != transition.DispatchAckDigest ||
			dispatch.OwnerStateRootDigest != transition.OwnerStateRootDigest {
			return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
		}
		return dispatch, true, tx.Commit()
	}
	current, currentErr := queryEvaluationOwnerState(ctx, tx, authority, partition, serviceKind, transition.OwnerStateID, true)
	if transition.PriorRevision == 0 {
		if currentErr == nil || !errors.Is(currentErr, ErrNotFound) {
			return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
		}
	} else if currentErr != nil || current.Revision != transition.PriorRevision || current.RootDigest != transition.PriorRootDigest {
		return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
	}
	descriptors, _ := bundleValue["casArtifacts"].([]any)
	for _, raw := range descriptors {
		descriptor, _ := raw.(map[string]any)
		var exists bool
		err := tx.QueryRowContext(ctx, `SELECT EXISTS(
			SELECT 1 FROM agent_evaluation_owner_state_cas_artifacts
			WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
				AND service_kind=$4 AND owner_state_id=$5 AND artifact_ref=$6
				AND artifact_digest=$7 AND byte_length=$8 AND cas_receipt_digest=$9
				AND descriptor_digest=$10 AND v46_eligible
		)`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, serviceKind,
			transition.OwnerStateID, stringMember(descriptor, "artifactRef"), stringMember(descriptor, "artifactDigest"),
			descriptor["byteLength"], stringMember(descriptor, "casReceiptDigest"),
			stringMember(descriptor, "descriptorDigest")).Scan(&exists)
		if err != nil || !exists {
			if err != nil {
				return EvaluationOwnerStateDispatchRecord{}, false, err
			}
			return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
		}
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_states (
		namespace_id, plan_digest, repository_commit, service_kind, owner_state_id, revision,
		root_digest, snapshot_kind, snapshot_digest, bundle_json, bundle_bytes, updated_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
	ON CONFLICT (namespace_id,plan_digest,repository_commit,service_kind,owner_state_id)
	DO UPDATE SET revision=EXCLUDED.revision, root_digest=EXCLUDED.root_digest,
		snapshot_kind=EXCLUDED.snapshot_kind, snapshot_digest=EXCLUDED.snapshot_digest,
		bundle_json=EXCLUDED.bundle_json, bundle_bytes=EXCLUDED.bundle_bytes, updated_at=EXCLUDED.updated_at
	WHERE agent_evaluation_owner_states.revision=$13 AND
		agent_evaluation_owner_states.root_digest IS NOT DISTINCT FROM $14`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, serviceKind, transition.OwnerStateID,
		transition.OwnerStateRevision, transition.OwnerStateRootDigest, stringMember(bundleValue, "snapshotKind"),
		stringMember(snapshot, "snapshotDigest"), string(transition.OwnerStateBundle), transition.OwnerStateBundle,
		sealedAt, transition.PriorRevision, nullableEvaluationControlledString(transition.PriorRootDigest))
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	changed, err := result.RowsAffected()
	if err != nil || changed != 1 {
		if err != nil {
			return EvaluationOwnerStateDispatchRecord{}, false, err
		}
		return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
	}
	sealedBytes, err := canonicaljson.Bytes(sealedValue)
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	result, err = tx.ExecContext(ctx, `UPDATE agent_evaluation_owner_state_operations
	SET state='sealed', response_digest=$6, public_result_json=$7::jsonb, public_result_bytes=$8,
		owner_state_revision=$9, owner_state_root_digest=$10, dispatch_ack_digest=$11,
		result_receipt_digest=$12, sealed_operation_json=$13::jsonb, sealed_operation_bytes=$14, sealed_at=$15
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND request_digest=$5 AND state='staged'`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, serviceKind, requestDigest,
		transition.ResponseDigest, string(transition.PublicResult), transition.PublicResult,
		transition.OwnerStateRevision, transition.OwnerStateRootDigest, transition.DispatchAckDigest,
		transition.ResultReceiptDigest, string(sealedBytes), sealedBytes, sealedAt)
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	changed, err = result.RowsAffected()
	if err != nil || changed != 1 {
		if err != nil {
			return EvaluationOwnerStateDispatchRecord{}, false, err
		}
		return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
	}
	result, err = tx.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
	SET dispatch_ack_digest=$6
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND request_digest=$5 AND state='dispatched'
		AND stage_digest=$7 AND v46_eligible`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, serviceKind, requestDigest, transition.DispatchAckDigest, transition.StageDigest)
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	changed, err = result.RowsAffected()
	if err != nil || changed != 1 {
		if err != nil {
			return EvaluationOwnerStateDispatchRecord{}, false, err
		}
		return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
	}
	stored, err := queryEvaluationOwnerStateDispatch(ctx, tx, authority, partition, serviceKind, requestDigest, false)
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	return stored, false, nil
}
