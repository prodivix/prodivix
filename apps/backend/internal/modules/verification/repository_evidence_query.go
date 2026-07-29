package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

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
