package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type Repository struct {
	db                            *sql.DB
	closureSnapshotBarrier        func()
	artifactCommitBarrier         func(workspaceID string, digest string)
	artifactDeletionLeaseBarrier  func(ArtifactDeletionLease)
	artifactDeletionScanBarrier   func()
	retentionEvidenceLockBarrier  func(operation string, evidenceID string)
	workspaceAuthorityLockBarrier func(operation string, promotionID string)
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func repositoryContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 10*time.Second)
}

func (repository *Repository) VerifyWorkspaceProject(
	ctx context.Context,
	workspaceID string,
	projectID string,
) error {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var marker int
	err := repository.db.QueryRowContext(ctx, `SELECT 1
FROM workspaces
WHERE id = $1 AND project_id = $2`, workspaceID, projectID).Scan(&marker)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func (repository *Repository) FindPromotionReplay(
	ctx context.Context,
	workspaceID string,
	actorID string,
	idempotencyKeyHash string,
) (Promotion, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	promotion, err := scanPromotion(repository.db.QueryRowContext(
		ctx,
		promotionSelect+`
WHERE workspace_id = $1 AND actor_id = $2 AND idempotency_key_hash = $3`,
		workspaceID,
		actorID,
		idempotencyKeyHash,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return Promotion{}, false, nil
	}
	if err != nil {
		return Promotion{}, false, err
	}
	return promotion, true, nil
}

func (repository *Repository) FindPromotionByCandidateID(
	ctx context.Context,
	workspaceID string,
	candidateID string,
) (Promotion, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	promotion, err := scanPromotion(repository.db.QueryRowContext(
		ctx,
		promotionSelect+`
WHERE workspace_id = $1 AND candidate_id = $2`,
		workspaceID,
		candidateID,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return Promotion{}, false, nil
	}
	if err != nil {
		return Promotion{}, false, err
	}
	return promotion, true, nil
}

type createPromotionInput struct {
	Promotion          Promotion
	IdempotencyKeyHash string
}

func (repository *Repository) CreatePromotion(
	ctx context.Context,
	input createPromotionInput,
) (Promotion, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if repository == nil || repository.db == nil {
		return Promotion{}, false, errors.New("verification repository is unavailable")
	}
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return Promotion{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := repository.lockCurrentWorkspaceAuthorityTx(
		ctx,
		tx,
		authorityLockCreate,
		input.Promotion,
	); err != nil {
		return Promotion{}, false, err
	}
	statementBytes := nullableBytes(input.Promotion.StatementBytes)
	statementDigest := nullableString(input.Promotion.StatementDigest)
	result, err := tx.ExecContext(ctx, `INSERT INTO verification_promotions (
	id, workspace_id, project_id, candidate_id, candidate_digest,
	idempotency_key_hash, capability_hash, nonce_hash, actor_id, state,
		requested_trust, retention_class, maximum_closure_evidence_records,
		evidence_id, evidence_created_at,
		candidate_json, candidate_bytes, attempt_grant_id, attempt_grant_digest,
		protect_release_evidence, attestation_statement_bytes,
		attestation_statement_digest, deadline, version, created_at, updated_at
) VALUES (
	$1, $2, $3, $4, $5,
	$6, $7, $8, $9, 'staging',
	$10, $11, $12, $13, $14,
	$15::jsonb, $16, $17, $18,
	$19, $20, $21, $22, 1, $23, $23
)
ON CONFLICT DO NOTHING`,
		input.Promotion.ID, input.Promotion.WorkspaceID, input.Promotion.ProjectID,
		input.Promotion.Candidate.CandidateID, input.Promotion.CandidateDigest,
		input.IdempotencyKeyHash, input.Promotion.CapabilityHash, nullableString(input.Promotion.NonceHash),
		input.Promotion.ActorID, input.Promotion.Trust, input.Promotion.Retention,
		input.Promotion.MaximumClosureEvidenceRecords,
		input.Promotion.EvidenceID, input.Promotion.EvidenceCreatedAt,
		string(input.Promotion.CandidateBytes), input.Promotion.CandidateBytes,
		input.Promotion.AttemptGrantID, input.Promotion.AttemptGrantDigest,
		input.Promotion.ProtectReleaseEvidence,
		statementBytes, statementDigest, input.Promotion.Deadline,
		input.Promotion.EvidenceCreatedAt,
	)
	if err != nil {
		return Promotion{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return Promotion{}, false, err
	}
	if rows == 0 {
		existing, lookupErr := scanPromotion(tx.QueryRowContext(ctx, promotionSelect+`
WHERE workspace_id = $1 AND idempotency_key_hash = $2
FOR UPDATE`, input.Promotion.WorkspaceID, input.IdempotencyKeyHash))
		if errors.Is(lookupErr, sql.ErrNoRows) {
			return Promotion{}, false, ErrConflict
		}
		if lookupErr != nil {
			return Promotion{}, false, lookupErr
		}
		if existing.CandidateDigest != input.Promotion.CandidateDigest ||
			existing.Candidate.CandidateID != input.Promotion.Candidate.CandidateID ||
			existing.ActorID != input.Promotion.ActorID ||
			!bytes.Equal(existing.CandidateBytes, input.Promotion.CandidateBytes) ||
			existing.AttemptGrantID != input.Promotion.AttemptGrantID ||
			existing.AttemptGrantDigest != input.Promotion.AttemptGrantDigest ||
			existing.ProtectReleaseEvidence != input.Promotion.ProtectReleaseEvidence ||
			!bytes.Equal(existing.VerificationPlanBytes, input.Promotion.VerificationPlanBytes) ||
			existing.MaximumClosureEvidenceRecords != input.Promotion.MaximumClosureEvidenceRecords {
			return Promotion{}, false, ErrConflict
		}
		if err := claimAttemptGrantTx(
			ctx,
			tx,
			existing,
			input.Promotion.EvidenceCreatedAt,
		); err != nil {
			return Promotion{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return Promotion{}, false, err
		}
		return existing, true, nil
	}
	if err := claimAttemptGrantTx(
		ctx,
		tx,
		input.Promotion,
		input.Promotion.EvidenceCreatedAt,
	); err != nil {
		return Promotion{}, false, err
	}
	for _, artifact := range input.Promotion.Candidate.Artifacts {
		if _, err := tx.ExecContext(ctx, `INSERT INTO verification_promotion_artifacts (
			promotion_id, artifact_id, logical_path, kind, source_trace_digest,
			expected_digest, expected_size, expected_media_type, scan_state
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
			input.Promotion.ID, artifact.ID, artifact.Path, artifact.Kind,
			nullableString(artifact.SourceTraceDigest), artifact.ExpectedDigest,
			artifact.ExpectedSize, artifact.ExpectedMediaType,
		); err != nil {
			return Promotion{}, false, err
		}
	}
	if err := appendAudit(ctx, tx, input.Promotion.WorkspaceID, "", input.Promotion.ID,
		input.Promotion.ActorID, "promotion.created", map[string]any{
			"candidateDigest":        input.Promotion.CandidateDigest,
			"attemptGrantDigest":     input.Promotion.AttemptGrantDigest,
			"trust":                  input.Promotion.Trust,
			"retention":              input.Promotion.Retention,
			"protectReleaseEvidence": input.Promotion.ProtectReleaseEvidence,
		}, input.Promotion.EvidenceCreatedAt); err != nil {
		return Promotion{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return Promotion{}, false, err
	}
	return input.Promotion, false, nil
}

func (repository *Repository) GetPromotion(
	ctx context.Context,
	workspaceID string,
	promotionID string,
) (Promotion, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	promotion, err := scanPromotion(repository.db.QueryRowContext(ctx, promotionSelect+`
WHERE workspace_id = $1 AND id = $2`, workspaceID, promotionID))
	if errors.Is(err, sql.ErrNoRows) {
		return Promotion{}, ErrNotFound
	}
	return promotion, err
}

type PromotionArtifactRow struct {
	Artifact          CandidateArtifact
	StagingLocator    string
	ObservedDigest    string
	ObservedSize      int64
	ObservedMediaType string
	ScanState         string
}

func (repository *Repository) RecordStagedArtifact(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	artifactID string,
	capabilityHash string,
	stored StoredObject,
	observedMediaType string,
	stagingLocator string,
	now time.Time,
) (PromotionArtifactRow, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return PromotionArtifactRow{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var state, expectedDigest, expectedMediaType, existingLocator string
	var deadline time.Time
	var expectedSize int64
	err = tx.QueryRowContext(ctx, `SELECT p.state, p.deadline,
	a.expected_digest, a.expected_size, a.expected_media_type,
	COALESCE(a.staging_locator, '')
FROM verification_promotions p
JOIN verification_promotion_artifacts a ON a.promotion_id = p.id
WHERE p.workspace_id = $1 AND p.id = $2 AND a.artifact_id = $3
	AND p.capability_hash = $4
FOR UPDATE OF p, a`, workspaceID, promotionID, artifactID, capabilityHash).
		Scan(&state, &deadline, &expectedDigest, &expectedSize, &expectedMediaType, &existingLocator)
	if errors.Is(err, sql.ErrNoRows) {
		return PromotionArtifactRow{}, ErrUnauthorized
	}
	if err != nil {
		return PromotionArtifactRow{}, err
	}
	if state == "committed" {
		return PromotionArtifactRow{}, ErrConflict
	}
	if state != "staging" || !now.Before(deadline) {
		return PromotionArtifactRow{}, ErrExpired
	}
	if stored.Digest != expectedDigest || stored.Size != expectedSize || observedMediaType != expectedMediaType {
		return PromotionArtifactRow{}, ErrArtifactRejected
	}
	if existingLocator != "" && existingLocator != stagingLocator {
		return PromotionArtifactRow{}, ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `UPDATE verification_promotion_artifacts
SET staging_locator = $4, observed_digest = $5, observed_size = $6,
	observed_media_type = $7, scan_state = 'accepted', uploaded_at = $8
WHERE promotion_id = $1 AND artifact_id = $2
	AND expected_digest = $3`,
		promotionID, artifactID, expectedDigest, stagingLocator, stored.Digest,
		stored.Size, observedMediaType, now.UTC()); err != nil {
		return PromotionArtifactRow{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE verification_promotions
SET version = version + 1, updated_at = $2
WHERE id = $1`, promotionID, now.UTC()); err != nil {
		return PromotionArtifactRow{}, err
	}
	if err := tx.Commit(); err != nil {
		return PromotionArtifactRow{}, err
	}
	return repository.GetPromotionArtifact(ctx, promotionID, artifactID)
}

func (repository *Repository) GetPromotionArtifact(
	ctx context.Context,
	promotionID string,
	artifactID string,
) (PromotionArtifactRow, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var row PromotionArtifactRow
	err := repository.db.QueryRowContext(ctx, `SELECT artifact_id, logical_path, kind,
	COALESCE(source_trace_digest, ''), expected_digest, expected_size, expected_media_type,
	COALESCE(staging_locator, ''), COALESCE(observed_digest, ''),
	COALESCE(observed_size, 0), COALESCE(observed_media_type, ''), scan_state
FROM verification_promotion_artifacts
WHERE promotion_id = $1 AND artifact_id = $2`, promotionID, artifactID).Scan(
		&row.Artifact.ID, &row.Artifact.Path, &row.Artifact.Kind,
		&row.Artifact.SourceTraceDigest,
		&row.Artifact.ExpectedDigest, &row.Artifact.ExpectedSize, &row.Artifact.ExpectedMediaType,
		&row.StagingLocator, &row.ObservedDigest, &row.ObservedSize,
		&row.ObservedMediaType, &row.ScanState,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return PromotionArtifactRow{}, ErrNotFound
	}
	return row, err
}

func (repository *Repository) ListPromotionArtifacts(
	ctx context.Context,
	promotionID string,
) ([]PromotionArtifactRow, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.db.QueryContext(ctx, `SELECT artifact_id, logical_path, kind,
	COALESCE(source_trace_digest, ''), expected_digest, expected_size, expected_media_type,
	COALESCE(staging_locator, ''), COALESCE(observed_digest, ''),
	COALESCE(observed_size, 0), COALESCE(observed_media_type, ''), scan_state
FROM verification_promotion_artifacts
WHERE promotion_id = $1
ORDER BY artifact_id`, promotionID)
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

func (repository *Repository) LocatorReferenced(
	ctx context.Context,
	locator string,
	durable bool,
) (bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	query := `SELECT EXISTS (
		SELECT 1 FROM verification_promotion_artifacts WHERE staging_locator = $1
	)`
	if durable {
		query = `SELECT EXISTS (
			SELECT 1 FROM verification_artifacts WHERE store_locator = $1
		)`
	}
	var referenced bool
	if err := repository.db.QueryRowContext(ctx, query, locator).Scan(&referenced); err != nil {
		return false, err
	}
	return referenced, nil
}

const promotionSelect = `SELECT id, workspace_id, project_id, candidate_digest,
	actor_id, state, requested_trust, retention_class,
	maximum_closure_evidence_records, evidence_id,
	evidence_created_at, candidate_bytes,
	attempt_grant_id, attempt_grant_digest, protect_release_evidence,
	(SELECT plan_bytes FROM verification_attempt_grants attempt_grant
		WHERE attempt_grant.id = verification_promotions.attempt_grant_id),
	COALESCE(attestation_statement_bytes, ''::bytea),
	COALESCE(attestation_statement_digest, ''),
	COALESCE(manifest_digest, ''), capability_hash,
	COALESCE(nonce_hash, ''), deadline, version
FROM verification_promotions
`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanPromotion(row rowScanner) (Promotion, error) {
	var promotion Promotion
	var trust, retention string
	var candidateBytes, planBytes, statementBytes []byte
	err := row.Scan(
		&promotion.ID, &promotion.WorkspaceID, &promotion.ProjectID, &promotion.CandidateDigest,
		&promotion.ActorID, &promotion.State, &trust, &retention,
		&promotion.MaximumClosureEvidenceRecords, &promotion.EvidenceID,
		&promotion.EvidenceCreatedAt, &candidateBytes,
		&promotion.AttemptGrantID, &promotion.AttemptGrantDigest,
		&promotion.ProtectReleaseEvidence, &planBytes,
		&statementBytes,
		&promotion.StatementDigest, &promotion.ManifestDigest, &promotion.CapabilityHash,
		&promotion.NonceHash, &promotion.Deadline, &promotion.Version,
	)
	if err != nil {
		return Promotion{}, err
	}
	if err := jsonUnmarshalStrictStored(candidateBytes, &promotion.Candidate); err != nil {
		return Promotion{}, fmt.Errorf("decode stored verification candidate: %w", err)
	}
	promotion.CandidateBytes = append([]byte(nil), candidateBytes...)
	plan, canonicalPlanBytes, err := decodeCanonicalVerificationPlan(planBytes)
	if err != nil {
		return Promotion{}, fmt.Errorf("decode stored VerificationPlan: %w", err)
	}
	if !bytes.Equal(planBytes, canonicalPlanBytes) ||
		plan.PlanDigest != promotion.Candidate.PlanDigest ||
		!digestPattern.MatchString(promotion.AttemptGrantDigest) {
		return Promotion{}, errors.New("decode stored VerificationPlan: promotion identity mismatch")
	}
	promotion.VerificationPlan = plan
	promotion.VerificationPlanBytes = append([]byte(nil), planBytes...)
	promotion.Trust = TrustClass(trust)
	promotion.Retention = RetentionClass(retention)
	if len(statementBytes) > 0 {
		var envelope EvidenceStatementEnvelope
		if err := jsonUnmarshalStrictStored(statementBytes, &envelope); err != nil {
			return Promotion{}, fmt.Errorf("decode stored verification statement: %w", err)
		}
		if envelope.Format != evidenceStatementFormat || envelope.Version != 1 {
			return Promotion{}, errors.New("decode stored verification statement: unsupported envelope")
		}
		promotion.Statement = &envelope.Statement
		promotion.StatementBytes = append([]byte(nil), statementBytes...)
	}
	return promotion, nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullableBytes(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return value
}
