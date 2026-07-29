package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"
)

type CommittedArtifact struct {
	Validated      ValidatedArtifact
	Stored         StoredObject
	OperationLease ArtifactOperationLease
}

type CommitEvidenceInput struct {
	Promotion      Promotion
	CapabilityHash string
	Evidence       VerificationEvidence
	ManifestBytes  []byte
	Artifacts      []CommittedArtifact
	Attestation    *VerifiedAttestation
	ExpiresAt      *time.Time
	CommittedAt    time.Time
}

func (repository *Repository) CommitEvidence(
	ctx context.Context,
	input CommitEvidenceInput,
) error {
	var last error
	for attempt := 0; attempt < 4; attempt++ {
		last = repository.commitEvidenceOnce(ctx, input)
		if !retryablePostgreSQLTransaction(last) {
			return last
		}
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	return last
}

func (repository *Repository) commitEvidenceOnce(
	ctx context.Context,
	input CommitEvidenceInput,
) error {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	current, err := scanPromotion(tx.QueryRowContext(ctx, promotionSelect+`
WHERE workspace_id = $1 AND id = $2 AND capability_hash = $3
FOR UPDATE`, input.Promotion.WorkspaceID, input.Promotion.ID, input.CapabilityHash))
	if errors.Is(err, sql.ErrNoRows) {
		return ErrUnauthorized
	}
	if err != nil {
		return err
	}
	if current.State == "committed" {
		if current.ManifestDigest != input.Evidence.ManifestDigest ||
			current.EvidenceID != input.Evidence.ID {
			return ErrConflict
		}
		return tx.Commit()
	}
	if err := repository.lockCurrentWorkspaceAuthorityTx(
		ctx,
		tx,
		authorityLockCommit,
		current,
	); err != nil {
		return err
	}
	expectedState := "staging"
	if current.Trust == TrustRemoteAttested || current.Trust == TrustCIAttested {
		expectedState = "verification-pending"
	}
	if current.State != expectedState || !input.CommittedAt.Before(current.Deadline) {
		return ErrExpired
	}
	if current.CandidateDigest != input.Promotion.CandidateDigest ||
		current.EvidenceID != input.Evidence.ID ||
		current.EvidenceCreatedAt.UTC() != input.Promotion.EvidenceCreatedAt.UTC() ||
		input.Evidence.Supersedes != "" {
		return ErrConflict
	}
	if expectedState == "verification-pending" &&
		(current.StatementDigest == "" ||
			current.StatementDigest != input.Promotion.StatementDigest ||
			!bytes.Equal(current.StatementBytes, input.Promotion.StatementBytes)) {
		return ErrConflict
	}
	if current.MaximumClosureEvidenceRecords < 1 ||
		current.MaximumClosureEvidenceRecords != input.Promotion.MaximumClosureEvidenceRecords {
		return coded(
			"VER-5001",
			"Promotion closure budget no longer matches its authoritative grant.",
			ErrConflict,
		)
	}
	if _, err := tx.ExecContext(
		ctx,
		`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
		current.WorkspaceID,
		input.Evidence.PlanDigest,
	); err != nil {
		return err
	}
	var closureEvidenceCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
FROM verification_evidence
WHERE workspace_id = $1 AND plan_digest = $2`,
		current.WorkspaceID,
		input.Evidence.PlanDigest,
	).Scan(&closureEvidenceCount); err != nil {
		return err
	}
	if closureEvidenceCount >= current.MaximumClosureEvidenceRecords {
		return coded(
			"VER-5001",
			"Verification closure Evidence budget is exhausted.",
			ErrConflict,
		)
	}
	var tombstoneMarker int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM verification_tombstones WHERE evidence_id = $1`,
		input.Evidence.ID).Scan(&tombstoneMarker)
	if err == nil {
		return ErrConflict
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	promotionArtifacts, err := listPromotionArtifactsTx(ctx, tx, current.ID)
	if err != nil {
		return err
	}
	if len(promotionArtifacts) != len(input.Artifacts) {
		return ErrArtifactMissing
	}
	artifactByID := make(map[string]CommittedArtifact, len(input.Artifacts))
	for _, artifact := range input.Artifacts {
		artifactByID[artifact.Validated.Candidate.ID] = artifact
	}
	for _, expected := range promotionArtifacts {
		artifact, exists := artifactByID[expected.Artifact.ID]
		if !exists || expected.ScanState != "accepted" ||
			expected.StagingLocator != artifact.Validated.StagingLocator ||
			expected.ObservedDigest != artifact.Validated.Candidate.ExpectedDigest ||
			expected.ObservedSize != artifact.Validated.Candidate.ExpectedSize ||
			expected.ObservedMediaType != artifact.Validated.Candidate.ExpectedMediaType ||
			artifact.Stored.Digest != expected.Artifact.ExpectedDigest ||
			artifact.Stored.Size != expected.Artifact.ExpectedSize {
			return ErrArtifactRejected
		}
		if artifact.OperationLease.OwnerID != current.ID ||
			artifact.OperationLease.WorkspaceID != current.WorkspaceID ||
			artifact.OperationLease.Digest != artifact.Stored.Digest ||
			artifact.OperationLease.Locator != artifact.Stored.Locator {
			return coded("VER-5005", "Artifact promotion lease does not match the promotion.", ErrConflict)
		}
		if err := verifyArtifactPromotionLeaseTx(
			ctx,
			tx,
			artifact.OperationLease,
			input.CommittedAt,
		); err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `INSERT INTO verification_artifacts (
			workspace_id, digest, byte_length,
			store_locator, scanner_version, created_at
		) VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT DO NOTHING`,
			current.WorkspaceID, artifact.Stored.Digest, expected.Artifact.ExpectedSize,
			artifact.Stored.Locator, "prodivix.verification-artifact-scanner.v1",
			input.CommittedAt.UTC(),
		)
		if err != nil {
			return err
		}
		rows, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if rows == 0 {
			var digest, locator string
			var size int64
			if err := tx.QueryRowContext(ctx, `SELECT digest, byte_length, store_locator
FROM verification_artifacts
WHERE workspace_id = $1 AND digest = $2
FOR SHARE`, current.WorkspaceID, artifact.Stored.Digest).Scan(
				&digest, &size, &locator,
			); err != nil {
				return err
			}
			if digest != artifact.Stored.Digest ||
				size != expected.Artifact.ExpectedSize ||
				locator != artifact.Stored.Locator {
				return ErrConflict
			}
		}
		if repository.artifactCommitBarrier != nil {
			repository.artifactCommitBarrier(current.WorkspaceID, artifact.Stored.Digest)
		}
	}
	manifestJSON := string(input.ManifestBytes)
	result, err := tx.ExecContext(ctx, `INSERT INTO verification_evidence (
	id, workspace_id, project_id, workspace_revision, policy_revision,
	plan_digest, impact_digest, cell_id, check_id, attempt_id, outcome,
	trust_class, retention_class, expires_at, manifest_digest,
	manifest_json, manifest_bytes, created_by, created_at
) VALUES (
	$1, $2, $3, $4, $5,
	$6, $7, $8, $9, $10, $11,
	$12, $13, $14, $15, $16::jsonb, $17, $18, $19
)
ON CONFLICT DO NOTHING`,
		input.Evidence.ID, input.Evidence.WorkspaceID, input.Evidence.ProjectID,
		input.Evidence.WorkspaceRevision, input.Evidence.PolicyRevision,
		input.Evidence.PlanDigest, input.Evidence.ImpactDigest, input.Evidence.CellID,
		input.Evidence.CheckID, input.Evidence.AttemptID, input.Evidence.Result.Outcome,
		input.Evidence.Provenance.Trust, input.Evidence.Retention, nullableTime(input.ExpiresAt),
		input.Evidence.ManifestDigest, manifestJSON, input.ManifestBytes,
		current.ActorID, input.Promotion.EvidenceCreatedAt.UTC(),
	)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if inserted == 0 {
		var evidenceID, manifestDigest string
		err := tx.QueryRowContext(ctx, `SELECT id, manifest_digest
FROM verification_evidence
WHERE workspace_id = $1 AND plan_digest = $2 AND cell_id = $3 AND attempt_id = $4
FOR SHARE`, input.Evidence.WorkspaceID, input.Evidence.PlanDigest,
			input.Evidence.CellID, input.Evidence.AttemptID).Scan(&evidenceID, &manifestDigest)
		if err != nil || evidenceID != input.Evidence.ID || manifestDigest != input.Evidence.ManifestDigest {
			return ErrConflict
		}
	}
	if inserted > 0 {
		for _, expected := range promotionArtifacts {
			artifact := artifactByID[expected.Artifact.ID]
			if _, err := tx.ExecContext(ctx, `INSERT INTO verification_evidence_artifacts (
				evidence_id, workspace_id, artifact_id, artifact_digest, logical_path,
				kind, normalized_digest, source_trace_digest, byte_length, media_type
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
				input.Evidence.ID, current.WorkspaceID, expected.Artifact.ID,
				artifact.Stored.Digest, expected.Artifact.Path,
				expected.Artifact.Kind,
				nullableString(artifact.Validated.NormalizedDigest),
				nullableString(expected.Artifact.SourceTraceDigest),
				expected.Artifact.ExpectedSize,
				expected.Artifact.ExpectedMediaType,
			); err != nil {
				return err
			}
		}
		if input.Attestation != nil {
			if _, err := tx.ExecContext(ctx, `INSERT INTO verification_attestations (
				evidence_id, trust_class, statement_digest, attestation_digest,
				proof_digest, nonce_digest, replay_key, issuer, audience, subject, key_id,
				verifier_id, issued_at, not_before, expires_at, verified_at,
				claims_json, claims_bytes
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
				$11, $12, $13, $14, $15, $16, $17::jsonb, $18
			)`,
				input.Evidence.ID, input.Attestation.Trust, input.Attestation.StatementDigest,
				input.Attestation.AttestationDigest, input.Attestation.ProofDigest,
				input.Attestation.NonceDigest, input.Attestation.ReplayKey, input.Attestation.Issuer,
				input.Attestation.Audience, input.Attestation.Subject, input.Attestation.KeyID,
				input.Attestation.VerifierID, input.Attestation.IssuedAt,
				input.Attestation.NotBefore, input.Attestation.ExpiresAt,
				input.Attestation.VerifiedAt, string(input.Attestation.ClaimsJSON),
				[]byte(input.Attestation.ClaimsJSON),
			); err != nil {
				return coded("VER-5003", "Evidence attestation was replayed or conflicts with an existing proof.", ErrAttestationRejected)
			}
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE verification_promotion_artifacts
SET staging_locator = NULL
WHERE promotion_id = $1`, current.ID); err != nil {
		return err
	}
	result, err = tx.ExecContext(ctx, `UPDATE verification_promotions
SET state = 'committed', manifest_digest = $2,
	version = version + 1, updated_at = $3
WHERE id = $1 AND state = $4`,
		current.ID, input.Evidence.ManifestDigest, input.CommittedAt.UTC(), expectedState)
	if err != nil {
		return err
	}
	updated, err := result.RowsAffected()
	if err != nil || updated != 1 {
		return ErrConflict
	}
	if err := appendAudit(ctx, tx, current.WorkspaceID, input.Evidence.ID, current.ID,
		current.ActorID, "evidence.committed", map[string]any{
			"manifestDigest": input.Evidence.ManifestDigest,
			"artifactCount":  len(input.Artifacts),
			"trust":          input.Evidence.Provenance.Trust,
		}, input.CommittedAt); err != nil {
		return err
	}
	return tx.Commit()
}

func retryablePostgreSQLTransaction(err error) bool {
	if err == nil {
		return false
	}
	var sqlState interface{ SQLState() string }
	if !errors.As(err, &sqlState) {
		return false
	}
	switch sqlState.SQLState() {
	case "40001", "40P01":
		return true
	default:
		return false
	}
}

func listPromotionArtifactsTx(ctx context.Context, tx *sql.Tx, promotionID string) ([]PromotionArtifactRow, error) {
	rows, err := tx.QueryContext(ctx, `SELECT artifact_id, logical_path, kind,
	COALESCE(source_trace_digest, ''), expected_digest, expected_size, expected_media_type,
	COALESCE(staging_locator, ''), COALESCE(observed_digest, ''),
	COALESCE(observed_size, 0), COALESCE(observed_media_type, ''), scan_state
FROM verification_promotion_artifacts
WHERE promotion_id = $1
ORDER BY artifact_id
FOR SHARE`, promotionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]PromotionArtifactRow, 0)
	for rows.Next() {
		var row PromotionArtifactRow
		if err := rows.Scan(
			&row.Artifact.ID, &row.Artifact.Path, &row.Artifact.Kind,
			&row.Artifact.SourceTraceDigest,
			&row.Artifact.ExpectedDigest, &row.Artifact.ExpectedSize, &row.Artifact.ExpectedMediaType,
			&row.StagingLocator, &row.ObservedDigest, &row.ObservedSize,
			&row.ObservedMediaType, &row.ScanState,
		); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func nullableTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC()
}

func (repository *Repository) MarkPromotionFailed(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	code string,
	now time.Time,
) error {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	_, err := repository.db.ExecContext(ctx, `UPDATE verification_promotions
SET state = 'failed', failure_code = $3, version = version + 1, updated_at = $4
WHERE workspace_id = $1 AND id = $2 AND state IN ('staging', 'verification-pending')`,
		workspaceID, promotionID, code, now.UTC())
	return err
}
