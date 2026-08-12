package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationArchiveNullableText(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func evaluationArchiveOptionalText(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func loadEvaluationArchiveClosureRecord(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	where string,
	arguments ...any,
) (EvaluationArchiveClosureRecord, evaluationArchiveClosure, error) {
	queryArguments := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	queryArguments = append(queryArguments, arguments...)
	var record EvaluationArchiveClosureRecord
	var reviewLeaseDigest sql.NullString
	var runConfigArtifactBindingDigest string
	var runConfigArtifactBindingJSON []byte
	err := queryer.QueryRowContext(ctx, `SELECT repository_commit,export_lease_id,export_lease_digest,
		run_config_artifact_binding_digest,run_config_artifact_binding_json,run_config_artifact_binding_bytes,
		source_config_digest,frozen_run_digest,evidence_set_digest,
		authority_payload_digest,authority_attestation_digest,review_lease_digest,
		evaluation_manifest_digest,index_digest,archive_attestation_digest,root_digest,
		closure_digest,closure_bytes,recorded_at
		FROM agent_evaluation_archive_closures
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 `+where,
		queryArguments...).Scan(
		&record.Partition.RepositoryCommit, &record.ExportLeaseID, &record.ExportLeaseDigest,
		&runConfigArtifactBindingDigest, &runConfigArtifactBindingJSON, &record.RunConfigArtifactBindingBytes,
		&record.SourceConfigDigest, &record.FrozenRunDigest,
		&record.EvidenceSetDigest, &record.AuthorityPayloadDigest, &record.AuthorityAttestationDigest,
		&reviewLeaseDigest, &record.EvaluationManifestDigest, &record.IndexDigest,
		&record.ArchiveAttestationDigest, &record.RootDigest, &record.ClosureDigest,
		&record.ClosureBytes, &record.RecordedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationArchiveClosureRecord{}, evaluationArchiveClosure{}, ErrNotFound
	}
	if err != nil {
		return EvaluationArchiveClosureRecord{}, evaluationArchiveClosure{}, err
	}
	record.NamespaceID = namespaceID
	record.Partition.PlanDigest = partition.PlanDigest
	record.ReviewLeaseDigest = evaluationArchiveOptionalText(reviewLeaseDigest)
	runConfigArtifactBinding, err := decodeEvaluationProductionRunConfigArtifactBindingBytes(record.RunConfigArtifactBindingBytes)
	if err != nil || runConfigArtifactBinding.BindingDigest != runConfigArtifactBindingDigest ||
		!evaluationJSONColumnMatchesCanonical(
			runConfigArtifactBindingJSON, record.RunConfigArtifactBindingBytes,
			maximumEvaluationRunConfigArtifactBindingBytes,
		) {
		return EvaluationArchiveClosureRecord{}, evaluationArchiveClosure{}, conflict("persisted evaluation archive run-config artifact binding drifted")
	}
	record.RunConfigArtifactBinding = runConfigArtifactBinding
	decoded, err := decodeEvaluationArchiveClosure(record.ClosureBytes)
	if err != nil || !evaluationArchiveClosureRecordMatches(record, decoded) {
		return EvaluationArchiveClosureRecord{}, evaluationArchiveClosure{}, conflict("persisted evaluation archive closure drifted")
	}
	return record, decoded, nil
}

func evaluationArchiveClosureRecordMatches(record EvaluationArchiveClosureRecord, decoded evaluationArchiveClosure) bool {
	return record.NamespaceID != "" && record.Partition.PlanDigest == decoded.Index.PlanDigest &&
		record.Partition.RepositoryCommit == decoded.Index.RepositoryCommit &&
		record.ExportLeaseID == decoded.ExportLeaseID && record.ExportLeaseDigest == decoded.ExportLeaseDigest &&
		sameEvaluationProductionRunConfigArtifactBinding(record.RunConfigArtifactBinding, decoded.RunConfigArtifactBinding) &&
		bytes.Equal(record.RunConfigArtifactBindingBytes, decoded.RunConfigArtifactBindingBytes) &&
		record.SourceConfigDigest == decoded.SourceConfigDigest &&
		record.FrozenRunDigest == decoded.FrozenRunDigest && record.EvidenceSetDigest == decoded.EvidenceSetDigest &&
		record.AuthorityPayloadDigest == decoded.AuthorityPayloadDigest &&
		record.AuthorityAttestationDigest == decoded.AuthorityAttestationDigest &&
		record.ReviewLeaseDigest == decoded.ReviewLeaseDigest &&
		record.EvaluationManifestDigest == decoded.EvaluationManifestDigest &&
		record.IndexDigest == decoded.IndexDigest &&
		record.ArchiveAttestationDigest == decoded.ArchiveAttestationDigest &&
		record.RootDigest == decoded.RootDigest && record.ClosureDigest == decoded.ClosureDigest &&
		bytes.Equal(record.ClosureBytes, decoded.ClosureBytes) && record.RecordedAt.Equal(decoded.RecordedAt)
}

func evaluationArchiveRootsEqual(left, right EvaluationEvidenceArchiveAuthorityRoots) bool {
	leftBytes, leftErr := canonicaljson.Bytes(left)
	rightBytes, rightErr := canonicaljson.Bytes(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}

func evaluationArchiveOptionalOrderKeyEqual(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func validateEvaluationArchiveClosureLease(
	closure evaluationArchiveClosure,
	lease EvaluationExportLease,
) error {
	commitments := lease.Commitments
	if closure.ExportLeaseID != lease.LeaseID || closure.ExportLeaseDigest != lease.LeaseDigest ||
		!sameEvaluationProductionRunConfigArtifactBinding(closure.Index.RunConfigArtifactBinding, commitments.RunConfigArtifactBinding) ||
		!bytes.Equal(closure.Index.RunConfigArtifactBindingBytes, evaluationProductionRunConfigArtifactBindingBytes(commitments.RunConfigArtifactBinding)) ||
		closure.Index.SourceConfigDigest != commitments.SourceConfigDigest ||
		closure.Index.FrozenRunDigest != commitments.FrozenRunDigest ||
		closure.Index.PlanDigest != commitments.PlanDigest ||
		closure.Index.RepositoryCommit != commitments.RepositoryCommit ||
		closure.Index.EvidenceSetDigest != commitments.EvidenceSetDigest ||
		closure.Index.AuthorityPayloadDigest != commitments.AuthorityPayloadDigest ||
		closure.Index.AuthorityAttestationDigest != commitments.AuthorityAttestationDigest ||
		closure.Index.ReviewLeaseDigest != commitments.ReviewLeaseDigest ||
		closure.Index.EvaluationManifestDigest != commitments.EvaluationManifestDigest ||
		!evaluationArchiveRootsEqual(closure.Index.AuthorityRoots, commitments.AuthorityRoots) ||
		len(closure.Index.Families) != len(lease.Families) || closure.Index.TotalRecordCount != lease.TotalRecordCount {
		return conflict("evaluation archive closure drifted from its immutable export lease")
	}
	for index, family := range closure.Index.Families {
		expected := lease.Families[index]
		if family.Family != expected.Family || family.FamilyIndex != expected.FamilyIndex ||
			family.RecordCount != expected.ExpectedRecordCount || family.SemanticDigest != expected.ExpectedSemanticDigest ||
			family.RecordSetDigest != expected.ExpectedRecordSetDigest ||
			!evaluationArchiveOptionalOrderKeyEqual(family.FirstOrderKey, expected.FirstOrderKey) ||
			!evaluationArchiveOptionalOrderKeyEqual(family.LastOrderKey, expected.LastOrderKey) {
			return conflict("evaluation archive family closure drifted from its materialized export lease")
		}
	}
	if closure.Index.CreatedAt.Before(lease.CreatedAt) || closure.Index.CreatedAt.After(lease.ExpiresAt) ||
		closure.Root.RecordedAt.Before(closure.Index.CreatedAt) || closure.Root.RecordedAt.After(lease.ExpiresAt) {
		return conflict("evaluation archive closure is outside its immutable export lease window")
	}
	return nil
}

// StoreEvaluationArchiveClosure atomically publishes the signed index,
// archive attestation and v2 root after revalidating their exact export lease.
func (repository *Repository) StoreEvaluationArchiveClosure(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	closureBytes []byte,
	cursorKeyBindingDigest string,
	verifier EvaluationAuthorityAttestationVerifier,
) (EvaluationArchiveClosureRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	if verifier == nil || !evaluationDigestPattern.MatchString(cursorKeyBindingDigest) {
		return EvaluationArchiveClosureRecord{}, false, ErrInvalid
	}
	closure, err := decodeEvaluationArchiveClosure(closureBytes)
	if err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	if closure.Index.PlanDigest != partition.PlanDigest || closure.Index.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationArchiveClosureRecord{}, false, conflict("evaluation archive closure belongs to another partition")
	}
	if err := verifier(ctx, EvaluationAuthorityAttestationVerification{
		AuthorityID: closure.Attestation.AuthorityID, KeyID: closure.Attestation.KeyID, Algorithm: "ed25519",
		AttestedPayloadDigest: closure.Attestation.AttestedPayloadDigest,
		AttestedPayloadBytes:  append([]byte(nil), closure.Attestation.AttestedPayloadBytes...),
		SignatureBase64URL:    closure.Attestation.Signature,
	}); err != nil {
		return EvaluationArchiveClosureRecord{}, false, fmt.Errorf("%w: evaluation archive signature verification failed: %v", ErrUnauthorized, err)
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationV46EligiblePartition(writeContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	if err := lockEvaluationPlanForFinalization(writeContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	lease, err := loadEvaluationExportLease(writeContext, tx, authority.NamespaceID, partition,
		closure.ExportLeaseID, evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest)
	if err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	if err := validateEvaluationArchiveClosureLease(closure, lease); err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	if err := validateEvaluationArchiveFinalizationAuthority(
		writeContext, tx, authority.NamespaceID, partition,
		EvaluationEvidenceExportSourceBinding{
			RunConfigArtifactBinding: closure.RunConfigArtifactBinding, SourceConfigDigest: closure.SourceConfigDigest,
			FrozenRunDigest: closure.FrozenRunDigest,
		},
		closure.Index.AuthorityRoots, lease.Families,
		closure.EvaluationManifestDigest, closure.ReviewLeaseDigest,
	); err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	if closure.RecordedAt.Before(plan.PlannedAt) || closure.RecordedAt.After(plan.ExpiresAt) ||
		closure.RecordedAt.After(time.Now().UTC().Add(time.Minute)) {
		return EvaluationArchiveClosureRecord{}, false, conflict("evaluation archive closure timestamp is outside its authority window")
	}
	record := closure.EvaluationArchiveClosureRecord
	record.NamespaceID, record.Partition = authority.NamespaceID, partition
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_archive_closures (
		namespace_id,plan_digest,repository_commit,export_lease_id,export_lease_digest,
		run_config_artifact_binding_digest,run_config_artifact_binding_json,run_config_artifact_binding_bytes,
		source_config_digest,frozen_run_digest,evidence_set_digest,
		authority_payload_digest,authority_attestation_digest,review_lease_digest,
		evaluation_manifest_digest,index_digest,archive_attestation_digest,root_digest,
		closure_digest,closure_bytes,recorded_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		record.ExportLeaseID, record.ExportLeaseDigest, record.RunConfigArtifactBinding.BindingDigest,
		record.RunConfigArtifactBindingBytes, record.RunConfigArtifactBindingBytes, record.SourceConfigDigest,
		record.FrozenRunDigest, record.EvidenceSetDigest, record.AuthorityPayloadDigest,
		record.AuthorityAttestationDigest, evaluationArchiveNullableText(record.ReviewLeaseDigest),
		record.EvaluationManifestDigest, record.IndexDigest, record.ArchiveAttestationDigest,
		record.RootDigest, record.ClosureDigest, record.ClosureBytes, record.RecordedAt)
	if err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, _, err := loadEvaluationArchiveClosureRecord(writeContext, tx, authority.NamespaceID, partition,
			`AND (export_lease_id=$4 OR export_lease_digest=$5 OR index_digest=$6 OR
			archive_attestation_digest=$7 OR root_digest=$8 OR closure_digest=$9) FOR SHARE`,
			record.ExportLeaseID, record.ExportLeaseDigest, record.IndexDigest,
			record.ArchiveAttestationDigest, record.RootDigest, record.ClosureDigest)
		if err != nil || !bytes.Equal(existing.ClosureBytes, record.ClosureBytes) {
			return EvaluationArchiveClosureRecord{}, false, conflict("evaluation archive closure identity was reused with different immutable bytes")
		}
		record = existing
	}
	if err := tx.Commit(); err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	return record, replayed, nil
}

func (repository *Repository) GetEvaluationArchiveClosure(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	cursorKeyBindingDigest string,
) (EvaluationArchiveClosureRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil || !evaluationDigestPattern.MatchString(cursorKeyBindingDigest) {
		return EvaluationArchiveClosureRecord{}, ErrInvalid
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(readContext, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationV46EligiblePartition(readContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	record, closure, err := loadEvaluationArchiveClosureRecord(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	lease, err := loadEvaluationExportLease(readContext, tx, authority.NamespaceID, partition,
		record.ExportLeaseID, evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest)
	if err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	if err := validateEvaluationArchiveClosureLease(closure, lease); err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	if err := validateEvaluationArchiveFinalizationAuthority(
		readContext, tx, authority.NamespaceID, partition,
		EvaluationEvidenceExportSourceBinding{
			RunConfigArtifactBinding: closure.RunConfigArtifactBinding, SourceConfigDigest: closure.SourceConfigDigest,
			FrozenRunDigest: closure.FrozenRunDigest,
		},
		closure.Index.AuthorityRoots, lease.Families,
		closure.EvaluationManifestDigest, closure.ReviewLeaseDigest,
	); err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationArchiveClosureRecord{}, err
	}
	return record, nil
}
