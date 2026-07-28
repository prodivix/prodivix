package verification

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
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

func (repository *Repository) GetEvidenceRecord(
	ctx context.Context,
	workspaceID string,
	evidenceID string,
	observedAt time.Time,
) (EvidenceRecord, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{
		ReadOnly: true, Isolation: sql.LevelRepeatableRead,
	})
	if err != nil {
		return EvidenceRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	record, err := loadEvidenceRecord(ctx, tx, workspaceID, evidenceID, observedAt)
	if err != nil {
		return EvidenceRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return EvidenceRecord{}, err
	}
	return record, nil
}

func (repository *Repository) ListEvidence(
	ctx context.Context,
	workspaceID string,
	filter ListFilter,
	observedAt time.Time,
) (EvidencePage, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 100 {
		filter.Limit = 100
	}
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{
		ReadOnly: true, Isolation: sql.LevelRepeatableRead,
	})
	if err != nil {
		return EvidencePage{}, err
	}
	defer func() { _ = tx.Rollback() }()
	page, err := listEvidenceInSnapshot(ctx, tx, workspaceID, filter, observedAt)
	if err != nil {
		return EvidencePage{}, err
	}
	if err := tx.Commit(); err != nil {
		return EvidencePage{}, err
	}
	return page, nil
}

func listEvidenceInSnapshot(
	ctx context.Context,
	queryer readQueryer,
	workspaceID string,
	filter ListFilter,
	observedAt time.Time,
) (EvidencePage, error) {
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 100 {
		filter.Limit = 100
	}
	conditions := []string{"workspace_id = $1"}
	args := []any{workspaceID}
	add := func(condition string, value any) {
		args = append(args, value)
		conditions = append(conditions, fmt.Sprintf(condition, len(args)))
	}
	if filter.WorkspaceRevisionSet {
		add("workspace_revision = $%d", filter.WorkspaceRevision)
	}
	if filter.PlanDigest != "" {
		add("plan_digest = $%d", filter.PlanDigest)
	}
	if filter.CellID != "" {
		add("cell_id = $%d", filter.CellID)
	}
	if filter.Trust != "" {
		add("trust_class = $%d", filter.Trust)
	}
	if filter.Outcome != "" {
		add("outcome = $%d", filter.Outcome)
	}
	if !filter.CursorCreatedAt.IsZero() {
		args = append(args, filter.CursorCreatedAt.UTC(), filter.CursorID)
		conditions = append(conditions, fmt.Sprintf("(created_at, id) < ($%d, $%d)", len(args)-1, len(args)))
	}
	args = append(args, filter.Limit+1)
	query := `SELECT id
FROM verification_evidence
WHERE ` + strings.Join(conditions, " AND ") + `
ORDER BY created_at DESC, id DESC
LIMIT $` + strconv.Itoa(len(args))
	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return EvidencePage{}, err
	}
	ids := make([]string, 0, filter.Limit+1)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return EvidencePage{}, err
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return EvidencePage{}, err
	}
	hasNext := len(ids) > filter.Limit
	if hasNext {
		ids = ids[:filter.Limit]
	}
	records := make([]EvidenceRecord, 0, len(ids))
	for _, id := range ids {
		record, err := loadEvidenceRecord(ctx, queryer, workspaceID, id, observedAt)
		if err != nil {
			return EvidencePage{}, err
		}
		records = append(records, record)
	}
	page := EvidencePage{Records: records}
	if hasNext && len(records) > 0 {
		last := records[len(records)-1].Evidence
		createdAt, err := parseInstant(last.CreatedAt)
		if err != nil {
			return EvidencePage{}, err
		}
		cursor, err := encodeEvidenceCursor(createdAt, last.ID)
		if err != nil {
			return EvidencePage{}, err
		}
		page.NextCursor = cursor
	}
	return page, nil
}

type readQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func loadEvidenceRecord(
	ctx context.Context,
	queryer readQueryer,
	workspaceID string,
	evidenceID string,
	observedAt time.Time,
) (EvidenceRecord, error) {
	var manifestBytes []byte
	var expiresAt sql.NullTime
	err := queryer.QueryRowContext(ctx, `SELECT manifest_bytes, expires_at
FROM verification_evidence
WHERE workspace_id = $1 AND id = $2`, workspaceID, evidenceID).Scan(&manifestBytes, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return EvidenceRecord{}, ErrNotFound
	}
	if err != nil {
		return EvidenceRecord{}, err
	}
	var fullManifest VerificationEvidenceManifest
	if err := jsonUnmarshalStrictStored(manifestBytes, &fullManifest); err != nil {
		return EvidenceRecord{}, err
	}
	evidence, err := projectEvidenceManifest(fullManifest)
	if err != nil {
		return EvidenceRecord{}, coded("VER-5001", "Stored Evidence manifest digest is invalid.", ErrConflict)
	}
	type persistedArtifact struct {
		ID, Path, Digest, NormalizedDigest, SourceTraceDigest, MediaType, Kind string
		Size, PhysicalSize                                                     int64
	}
	rows, err := queryer.QueryContext(ctx, `SELECT ea.artifact_id, ea.logical_path,
	ea.artifact_digest, COALESCE(ea.normalized_digest, ''),
	COALESCE(ea.source_trace_digest, ''), ea.media_type, ea.kind,
	ea.byte_length, a.byte_length
FROM verification_evidence_artifacts ea
JOIN verification_artifacts a
	ON a.workspace_id = ea.workspace_id AND a.digest = ea.artifact_digest
WHERE ea.evidence_id = $1
ORDER BY ea.artifact_id`, evidenceID)
	if err != nil {
		return EvidenceRecord{}, err
	}
	persisted := map[string]persistedArtifact{}
	for rows.Next() {
		var artifact persistedArtifact
		if err := rows.Scan(&artifact.ID, &artifact.Path, &artifact.Digest,
			&artifact.NormalizedDigest, &artifact.SourceTraceDigest,
			&artifact.MediaType, &artifact.Kind, &artifact.Size,
			&artifact.PhysicalSize); err != nil {
			_ = rows.Close()
			return EvidenceRecord{}, err
		}
		persisted[artifact.ID] = artifact
	}
	if err := rows.Close(); err != nil {
		return EvidenceRecord{}, err
	}
	descriptors := make([]ArtifactDescriptor, 0, len(evidence.Artifacts))
	manifestArtifactIDs := make(map[string]struct{}, len(evidence.Artifacts))
	for _, manifest := range evidence.Artifacts {
		manifestArtifactIDs[manifest.ID] = struct{}{}
		descriptor := ArtifactDescriptor{
			ID: manifest.ID, Path: manifest.Path, Kind: manifest.Kind, Digest: manifest.Digest,
			NormalizedDigest: manifest.NormalizedDigest, Size: manifest.Size,
			SourceTraceDigest: manifest.SourceTraceDigest,
			MediaType:         manifest.MediaType, Availability: "deleted",
		}
		if stored, ok := persisted[manifest.ID]; ok {
			if stored.Path != manifest.Path ||
				stored.Digest != manifest.Digest ||
				stored.NormalizedDigest != manifest.NormalizedDigest ||
				stored.SourceTraceDigest != manifest.SourceTraceDigest ||
				stored.Size != manifest.Size || stored.PhysicalSize != manifest.Size ||
				stored.MediaType != manifest.MediaType ||
				stored.Kind != string(manifest.Kind) {
				return EvidenceRecord{}, coded(
					"VER-5001",
					"Stored Evidence artifact relation does not match its signed manifest.",
					ErrConflict,
				)
			}
			descriptor.Availability = "available"
		}
		descriptors = append(descriptors, descriptor)
	}
	for artifactID := range persisted {
		if _, exists := manifestArtifactIDs[artifactID]; !exists {
			return EvidenceRecord{}, coded(
				"VER-5001",
				"Stored Evidence contains an artifact relation outside its signed manifest.",
				ErrConflict,
			)
		}
	}
	trustStatus := "unverified"
	var attestationDigest, proofDigest, nonceDigest, replayKey, issuer, keyID string
	var storedClaims []byte
	var attestationExpiry sql.NullTime
	attestationErr := queryer.QueryRowContext(ctx, `SELECT attestation_digest, proof_digest,
	nonce_digest, replay_key, issuer, key_id, expires_at, claims_bytes
FROM verification_attestations
WHERE evidence_id = $1`, evidenceID).Scan(
		&attestationDigest, &proofDigest, &nonceDigest, &replayKey,
		&issuer, &keyID, &attestationExpiry, &storedClaims,
	)
	if attestationErr == nil {
		if fullManifest.VerifiedProvenance.Claims == nil ||
			fullManifest.VerifiedProvenance.Claims.AttestationDigest != attestationDigest ||
			fullManifest.VerifiedProvenance.Claims.ProofDigest != proofDigest ||
			fullManifest.VerifiedProvenance.Claims.NonceDigest != nonceDigest ||
			fullManifest.VerifiedProvenance.Claims.ReplayKey != replayKey {
			return EvidenceRecord{}, coded("VER-5003", "Stored attestation does not match the final manifest.", ErrConflict)
		}
		claims := fullManifest.VerifiedProvenance.Claims
		expectedAttestationDigest, digestErr := deriveAttestationPresentationDigest(
			claims.Algorithm,
			claims.KeyID,
			claims.ClaimsDigest,
			claims.ProofDigest,
		)
		expectedReplayKey, _, replayErr := canonicalDigest(map[string]any{
			"format":      "prodivix.verification-attestation-replay-key",
			"version":     1,
			"issuer":      claims.Issuer,
			"audience":    claims.Audience,
			"nonceDigest": claims.NonceDigest,
		})
		if digestErr != nil || replayErr != nil ||
			expectedAttestationDigest != claims.AttestationDigest ||
			expectedReplayKey != claims.ReplayKey {
			return EvidenceRecord{}, coded("VER-5003", "Stored attestation digest chain is invalid.", ErrConflict)
		}
		canonicalClaims, err := canonicalBytes(*fullManifest.VerifiedProvenance.Claims)
		if err != nil || string(canonicalClaims) != string(storedClaims) {
			return EvidenceRecord{}, coded("VER-5003", "Stored attestation claims do not match the final manifest.", ErrConflict)
		}
		trustStatus = "verified"
		if !observedAt.Before(attestationExpiry.Time) {
			trustStatus = "expired"
		}
	} else if !errors.Is(attestationErr, sql.ErrNoRows) {
		return EvidenceRecord{}, attestationErr
	}
	if (evidence.Provenance.Trust == TrustRemoteAttested || evidence.Provenance.Trust == TrustCIAttested) &&
		attestationErr != nil {
		trustStatus = "unverified"
	}
	revocationDigests, err := loadRevocationDigests(ctx, queryer, workspaceID, evidenceID, issuer, keyID, observedAt)
	if err != nil {
		return EvidenceRecord{}, err
	}
	if len(revocationDigests) > 0 {
		trustStatus = "revoked"
	}
	retentionState := "active"
	tombstoneDigest := ""
	var tombstone struct {
		ManifestDigest, PlanDigest, CellID, AttemptID, Reason, ActorID string
		DeletedAt, PurgeAfter                                          time.Time
		PurgedAt                                                       sql.NullTime
	}
	tombstoneErr := queryer.QueryRowContext(ctx, `SELECT manifest_digest, plan_digest,
	cell_id, attempt_id, reason, actor_id, deleted_at, purge_after, purged_at
FROM verification_tombstones
WHERE evidence_id = $1`, evidenceID).Scan(
		&tombstone.ManifestDigest, &tombstone.PlanDigest, &tombstone.CellID,
		&tombstone.AttemptID, &tombstone.Reason, &tombstone.ActorID,
		&tombstone.DeletedAt, &tombstone.PurgeAfter, &tombstone.PurgedAt,
	)
	if tombstoneErr == nil {
		retentionState = "tombstoned"
		if tombstone.PurgedAt.Valid {
			retentionState = "references-released"
		}
		tombstoneDigest, _, err = canonicalDigest(map[string]any{
			"evidenceId": evidenceID, "manifestDigest": tombstone.ManifestDigest,
			"planDigest": tombstone.PlanDigest, "cellId": tombstone.CellID,
			"attemptId": tombstone.AttemptID, "reason": tombstone.Reason,
			"actorId":   tombstone.ActorID,
			"deletedAt": formatInstant(tombstone.DeletedAt),
		})
		if err != nil {
			return EvidenceRecord{}, err
		}
	} else if !errors.Is(tombstoneErr, sql.ErrNoRows) {
		return EvidenceRecord{}, tombstoneErr
	}
	supersededBy := ""
	err = queryer.QueryRowContext(ctx, `SELECT new_evidence_id
FROM verification_supersessions
WHERE old_evidence_id = $1
ORDER BY created_at DESC, new_evidence_id DESC
LIMIT 1`, evidenceID).Scan(&supersededBy)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return EvidenceRecord{}, err
	}
	availability := make([]VerifiedArtifactAvailability, 0, len(descriptors))
	for _, descriptor := range descriptors {
		status := descriptor.Availability
		if status != "available" {
			status = "deleted"
		}
		availability = append(availability, VerifiedArtifactAvailability{
			ArtifactID: descriptor.ID, Digest: descriptor.Digest, Status: status,
		})
	}
	materializedDigest, err := materializedEvidenceDigest(evidence)
	if err != nil {
		return EvidenceRecord{}, err
	}
	view := VerifiedViewRecord{
		EvidenceID: evidence.ID, ManifestDigest: evidence.ManifestDigest,
		MaterializedEvidenceDigest: materializedDigest,
		EffectiveTrust:             evidence.Provenance.Trust, TrustStatus: trustStatus,
		AttestationDigest: evidence.Provenance.AttestationDigest,
		RetentionState:    retentionState, SupersededByEvidenceID: supersededBy,
		RevocationRecordDigests: revocationDigests, TombstoneDigest: tombstoneDigest,
		Artifacts: availability,
	}
	if expiresAt.Valid {
		view.RetentionExpiresAt = formatInstant(expiresAt.Time)
		if retentionState == "active" && !observedAt.Before(expiresAt.Time) {
			view.TrustStatus = "expired"
		}
	}
	activeProtections, err := loadActiveRetentionProtections(
		ctx,
		queryer,
		workspaceID,
		evidenceID,
	)
	if err != nil {
		return EvidenceRecord{}, err
	}
	recordDigest, _, err := digestWithoutField(view, "recordDigest")
	if err != nil {
		return EvidenceRecord{}, err
	}
	view.RecordDigest = recordDigest
	return EvidenceRecord{
		Evidence:          evidence,
		Artifacts:         descriptors,
		VerifiedView:      view,
		ActiveProtections: activeProtections,
	}, nil
}

func loadRevocationDigests(
	ctx context.Context,
	queryer readQueryer,
	workspaceID string,
	evidenceID string,
	issuer string,
	keyID string,
	observedAt time.Time,
) ([]string, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT record_bytes
FROM verification_trust_revocations
WHERE workspace_id = $1 AND effective_at <= $2 AND created_at <= $2
	AND (
		evidence_id = $3
		OR (evidence_id IS NULL AND issuer = $4 AND key_id IS NULL)
		OR (evidence_id IS NULL AND issuer = $4 AND key_id = $5)
	)
ORDER BY id`, workspaceID, observedAt.UTC(), evidenceID,
		nullableString(issuer), nullableString(keyID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	digests := make([]string, 0)
	for rows.Next() {
		var encoded []byte
		if err := rows.Scan(&encoded); err != nil {
			return nil, err
		}
		record, err := decodeTrustRevocationRecord(encoded)
		if err != nil {
			return nil, err
		}
		digests = append(digests, record.RecordDigest)
	}
	sort.Strings(digests)
	return digests, rows.Err()
}

func decodeTrustRevocationRecord(encoded []byte) (TrustRevocationRecord, error) {
	var record TrustRevocationRecord
	if err := jsonUnmarshalStrictStored(encoded, &record); err != nil ||
		record.Format != "prodivix.verification-trust-revocation" ||
		record.Version != 1 || !digestPattern.MatchString(record.RecordDigest) {
		return TrustRevocationRecord{}, ErrConflict
	}
	digest, _, err := digestWithoutField(record, "recordDigest")
	if err != nil || digest != record.RecordDigest {
		return TrustRevocationRecord{}, ErrConflict
	}
	canonical, err := canonicalBytes(record)
	if err != nil || !bytes.Equal(canonical, encoded) {
		return TrustRevocationRecord{}, ErrConflict
	}
	return record, nil
}

func (repository *Repository) EffectiveRevocationDigest(
	ctx context.Context,
	workspaceID string,
	observedAt time.Time,
	records []VerifiedViewRecord,
) (string, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	return effectiveRevocationDigest(ctx, repository.db, workspaceID, observedAt, records)
}

func effectiveRevocationDigest(
	ctx context.Context,
	queryer readQueryer,
	workspaceID string,
	observedAt time.Time,
	records []VerifiedViewRecord,
) (string, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT record_bytes
FROM verification_trust_revocations
WHERE workspace_id = $1 AND effective_at <= $2 AND created_at <= $2
ORDER BY id`, workspaceID, observedAt.UTC())
	if err != nil {
		return "", err
	}
	defer rows.Close()
	type recordIdentity struct {
		ID           string `json:"id"`
		RecordDigest string `json:"recordDigest"`
	}
	effective := make([]recordIdentity, 0)
	for rows.Next() {
		var encoded []byte
		if err := rows.Scan(&encoded); err != nil {
			return "", err
		}
		record, err := decodeTrustRevocationRecord(encoded)
		if err != nil {
			return "", err
		}
		effective = append(effective, recordIdentity{
			ID: record.ID, RecordDigest: record.RecordDigest,
		})
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	revokedIDs := make([]string, 0)
	for _, record := range records {
		if len(record.RevocationRecordDigests) > 0 {
			revokedIDs = append(revokedIDs, record.EvidenceID)
		}
	}
	sort.Strings(revokedIDs)
	digest, _, err := canonicalDigest(struct {
		Format             string           `json:"format"`
		Version            int              `json:"version"`
		EvaluationInstant  string           `json:"evaluationInstant"`
		Records            []recordIdentity `json:"records"`
		RevokedEvidenceIDs []string         `json:"revokedEvidenceIds"`
	}{
		Format: "prodivix.verification-revocation-view", Version: 1,
		EvaluationInstant: formatInstant(observedAt), Records: effective,
		RevokedEvidenceIDs: revokedIDs,
	})
	return digest, err
}

func (repository *Repository) ClosureView(
	ctx context.Context,
	workspaceID string,
	filter ListFilter,
	observedAt time.Time,
) (ClosureView, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{
		ReadOnly: true, Isolation: sql.LevelRepeatableRead,
	})
	if err != nil {
		return ClosureView{}, err
	}
	defer func() { _ = tx.Rollback() }()

	filter.Limit = 100
	all := make([]EvidenceRecord, 0)
	for {
		page, err := listEvidenceInSnapshot(ctx, tx, workspaceID, filter, observedAt)
		if err != nil {
			return ClosureView{}, err
		}
		all = append(all, page.Records...)
		if len(all) > 1000 || (len(all) == 1000 && page.NextCursor != "") {
			return ClosureView{}, coded(
				"VER-6002",
				"Closure Evidence set exceeds the Backend query budget.",
				ErrInvalid,
			)
		}
		if page.NextCursor == "" {
			break
		}
		createdAt, id, err := DecodeEvidenceCursor(page.NextCursor)
		if err != nil {
			return ClosureView{}, err
		}
		filter.CursorCreatedAt, filter.CursorID = createdAt, id
	}

	records := make([]VerifiedViewRecord, 0, len(all))
	for _, record := range all {
		records = append(records, record.VerifiedView)
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].EvidenceID < records[right].EvidenceID
	})
	byID := make(map[string]struct{}, len(records))
	for _, record := range records {
		byID[record.EvidenceID] = struct{}{}
	}
	for _, record := range records {
		if record.SupersededByEvidenceID != "" {
			if _, exists := byID[record.SupersededByEvidenceID]; !exists {
				return ClosureView{}, coded(
					"VER-6002",
					"Closure Evidence supersession target is absent.",
					ErrConflict,
				)
			}
		}
	}

	if repository.closureSnapshotBarrier != nil {
		repository.closureSnapshotBarrier()
	}
	revocationDigest, err := effectiveRevocationDigest(
		ctx,
		tx,
		workspaceID,
		observedAt,
		records,
	)
	if err != nil {
		return ClosureView{}, err
	}
	view := ClosureView{
		Format:                   "prodivix.verification-evidence-view.v1",
		ClosureEvaluationInstant: formatInstant(observedAt),
		Records:                  records,
		RevocationRecordDigest:   revocationDigest,
	}
	viewDigest, _, err := digestWithoutField(view, "viewDigest")
	if err != nil {
		return ClosureView{}, err
	}
	view.ViewDigest = viewDigest
	if err := tx.Commit(); err != nil {
		return ClosureView{}, err
	}
	return view, nil
}

type evidenceCursor struct {
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func encodeEvidenceCursor(createdAt time.Time, id string) (string, error) {
	encoded, err := canonicalBytes(evidenceCursor{
		CreatedAt: formatInstant(createdAt), ID: id,
	})
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(encoded), nil
}

func DecodeEvidenceCursor(value string) (time.Time, string, error) {
	if value == "" {
		return time.Time{}, "", nil
	}
	if len(value) > 1024 {
		return time.Time{}, "", ErrInvalid
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return time.Time{}, "", ErrInvalid
	}
	var cursor evidenceCursor
	if err := jsonUnmarshalStrictStored(decoded, &cursor); err != nil ||
		validateIdentifier(cursor.ID, "cursor id") != nil {
		return time.Time{}, "", ErrInvalid
	}
	createdAt, err := parseInstant(cursor.CreatedAt)
	if err != nil {
		return time.Time{}, "", ErrInvalid
	}
	return createdAt, cursor.ID, nil
}

type ArtifactContent struct {
	Locator   string
	Digest    string
	MediaType string
	Size      int64
	Kind      ArtifactKind
}

func (repository *Repository) ResolveArtifactContent(
	ctx context.Context,
	workspaceID string,
	evidenceID string,
	artifactID string,
) (ArtifactContent, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var evidenceExists, tombstoned bool
	if err := repository.db.QueryRowContext(ctx, `SELECT
	EXISTS (
		SELECT 1 FROM verification_evidence
		WHERE workspace_id = $1 AND id = $2
	),
	EXISTS (
		SELECT 1 FROM verification_tombstones
		WHERE workspace_id = $1 AND evidence_id = $2
	)`, workspaceID, evidenceID).Scan(&evidenceExists, &tombstoned); err != nil {
		return ArtifactContent{}, err
	}
	if !evidenceExists {
		return ArtifactContent{}, ErrNotFound
	}
	if tombstoned {
		return ArtifactContent{}, ErrExpired
	}
	var content ArtifactContent
	var physicalSize int64
	err := repository.db.QueryRowContext(ctx, `SELECT a.store_locator, a.digest,
	ea.media_type, ea.byte_length, ea.kind, a.byte_length
FROM verification_evidence e
JOIN verification_evidence_artifacts ea ON ea.evidence_id = e.id
JOIN verification_artifacts a
	ON a.workspace_id = ea.workspace_id AND a.digest = ea.artifact_digest
	WHERE e.workspace_id = $1 AND e.id = $2 AND ea.artifact_id = $3`,
		workspaceID, evidenceID, artifactID).Scan(
		&content.Locator, &content.Digest, &content.MediaType,
		&content.Size, &content.Kind, &physicalSize,
	)
	if errors.Is(err, sql.ErrNoRows) {
		if err := repository.db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM verification_tombstones
			WHERE workspace_id = $1 AND evidence_id = $2
		)`, workspaceID, evidenceID).Scan(&tombstoned); err != nil {
			return ArtifactContent{}, err
		}
		if tombstoned {
			return ArtifactContent{}, ErrExpired
		}
		return ArtifactContent{}, ErrNotFound
	}
	if err != nil {
		return ArtifactContent{}, err
	}
	if physicalSize != content.Size {
		return ArtifactContent{}, coded(
			"VER-5001",
			"Stored artifact bytes do not match the signed Evidence relation.",
			ErrConflict,
		)
	}
	return content, nil
}
