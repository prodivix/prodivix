package verification

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

func (repository *Repository) SupersedeEvidence(
	ctx context.Context,
	workspaceID string,
	oldEvidenceID string,
	newEvidenceID string,
	reason string,
	actorID string,
	now time.Time,
	idempotencyKey string,
	expectedOldEvidenceState string,
	expectedNewEvidenceState string,
	expectedSupersessionState string,
) (bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if oldEvidenceID == newEvidenceID || !safeReason(reason) ||
		expectedOldEvidenceState != "active" ||
		expectedNewEvidenceState != "active" ||
		expectedSupersessionState != "none" {
		return false, ErrInvalid
	}
	now = canonicalTime(now)
	request, err := prepareMutationLedgerRequest(
		workspaceID, actorID, idempotencyKey, mutationSupersede,
		supersedeMutationPayload{
			OldEvidenceID: oldEvidenceID, NewEvidenceID: newEvidenceID,
			Reason: reason, ExpectedOldEvidenceState: expectedOldEvidenceState,
			ExpectedNewEvidenceState:  expectedNewEvidenceState,
			ExpectedSupersessionState: expectedSupersessionState,
		},
	)
	if err != nil {
		return false, err
	}
	_, replayed, err := runMutationWithRetry(ctx, func() (supersedeMutationResult, bool, error) {
		return repository.supersedeEvidenceOnce(
			ctx, request, oldEvidenceID, newEvidenceID, reason, actorID, now,
		)
	})
	return replayed, err
}

func (repository *Repository) supersedeEvidenceOnce(
	ctx context.Context,
	request mutationLedgerRequest,
	oldEvidenceID string,
	newEvidenceID string,
	reason string,
	actorID string,
	now time.Time,
) (supersedeMutationResult, bool, error) {
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return supersedeMutationResult{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	replayBytes, replayed, err := lockMutationRequest(ctx, tx, request)
	if err != nil {
		return supersedeMutationResult{}, false, err
	}
	if replayed {
		result, err := decodeMutationResult[supersedeMutationResult](replayBytes)
		return result, true, err
	}
	oldRecord, err := loadEvidenceRecord(ctx, tx, request.WorkspaceID, oldEvidenceID, now)
	if err != nil {
		return supersedeMutationResult{}, false, err
	}
	newRecord, err := loadEvidenceRecord(ctx, tx, request.WorkspaceID, newEvidenceID, now)
	if err != nil {
		return supersedeMutationResult{}, false, err
	}
	if oldRecord.VerifiedView.RetentionState != "active" ||
		newRecord.VerifiedView.RetentionState != "active" ||
		!sameSupersessionLineage(oldRecord.Evidence, newRecord.Evidence) {
		return supersedeMutationResult{}, false, ErrConflict
	}
	oldCompletedAt, oldTimeErr := parseInstant(oldRecord.Evidence.Timing.CompletedAt)
	newCompletedAt, newTimeErr := parseInstant(newRecord.Evidence.Timing.CompletedAt)
	if oldTimeErr != nil || newTimeErr != nil || newCompletedAt.Before(oldCompletedAt) {
		return supersedeMutationResult{}, false, ErrConflict
	}
	var existingTarget string
	existingErr := tx.QueryRowContext(ctx, `SELECT new_evidence_id
FROM verification_supersessions
WHERE old_evidence_id = $1
FOR UPDATE`, oldEvidenceID).Scan(&existingTarget)
	if existingErr == nil {
		return supersedeMutationResult{}, false, ErrConflict
	}
	if existingErr != nil && !errors.Is(existingErr, sql.ErrNoRows) {
		return supersedeMutationResult{}, false, existingErr
	}
	var createsCycle bool
	if err := tx.QueryRowContext(ctx, `WITH RECURSIVE lineage(evidence_id) AS (
	SELECT new_evidence_id
	FROM verification_supersessions
	WHERE old_evidence_id = $1
	UNION
	SELECT s.new_evidence_id
	FROM verification_supersessions s
	JOIN lineage l ON s.old_evidence_id = l.evidence_id
)
SELECT EXISTS (SELECT 1 FROM lineage WHERE evidence_id = $2)`,
		newEvidenceID, oldEvidenceID).Scan(&createsCycle); err != nil {
		return supersedeMutationResult{}, false, err
	}
	if createsCycle {
		return supersedeMutationResult{}, false, ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO verification_supersessions (
	old_evidence_id, new_evidence_id, workspace_id, reason, actor_id, created_at
) VALUES ($1, $2, $3, $4, $5, $6)
`, oldEvidenceID, newEvidenceID, request.WorkspaceID,
		reason, actorID, now.UTC()); err != nil {
		return supersedeMutationResult{}, false, err
	}
	if err := appendAudit(ctx, tx, request.WorkspaceID, oldEvidenceID, "", actorID,
		"evidence.superseded", map[string]any{
			"newEvidenceId": newEvidenceID, "reason": reason,
		}, now); err != nil {
		return supersedeMutationResult{}, false, err
	}
	result := supersedeMutationResult{Superseded: true}
	if err := storeMutationResult(ctx, tx, request, result, now); err != nil {
		return supersedeMutationResult{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return supersedeMutationResult{}, false, err
	}
	return result, false, nil
}

func sameSupersessionLineage(previous VerificationEvidence, next VerificationEvidence) bool {
	return previous.WorkspaceID == next.WorkspaceID &&
		previous.CheckID == next.CheckID &&
		previous.CheckKind == next.CheckKind &&
		previous.TargetID == next.TargetID
}

func (repository *Repository) ProtectEvidence(
	ctx context.Context,
	workspaceID string,
	evidenceID string,
	kind string,
	externalRef string,
	actorID string,
	now time.Time,
	idempotencyKey string,
	expectedEvidenceState string,
	expectedProtectionState string,
) (RetentionProtection, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if (kind != "change" && kind != "release") ||
		validateIdentifier(externalRef, "retention external ref") != nil ||
		expectedEvidenceState != "active" ||
		expectedProtectionState != "absent" {
		return RetentionProtection{}, false, ErrInvalid
	}
	now = canonicalTime(now)
	request, err := prepareMutationLedgerRequest(
		workspaceID, actorID, idempotencyKey, mutationProtect,
		protectMutationPayload{
			EvidenceID: evidenceID, Kind: kind, ExternalRef: externalRef,
			ExpectedEvidenceState:   expectedEvidenceState,
			ExpectedProtectionState: expectedProtectionState,
		},
	)
	if err != nil {
		return RetentionProtection{}, false, err
	}
	return runMutationWithRetry(ctx, func() (RetentionProtection, bool, error) {
		return repository.protectEvidenceOnce(
			ctx, request, evidenceID, kind, externalRef, actorID, now,
		)
	})
}

func (repository *Repository) protectEvidenceOnce(
	ctx context.Context,
	request mutationLedgerRequest,
	evidenceID string,
	kind string,
	externalRef string,
	actorID string,
	now time.Time,
) (RetentionProtection, bool, error) {
	protectionDigest := digestBytes([]byte(request.WorkspaceID + "\x00" + evidenceID + "\x00" + kind + "\x00" + externalRef))
	protectionID := "protection-" + strings.TrimPrefix(protectionDigest, "sha256-")[:40]
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return RetentionProtection{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	replayBytes, replayed, err := lockMutationRequest(ctx, tx, request)
	if err != nil {
		return RetentionProtection{}, false, err
	}
	if replayed {
		result, err := decodeMutationResult[retentionMutationResult](replayBytes)
		return result.Protection, true, err
	}
	var expiresAt sql.NullTime
	if err := tx.QueryRowContext(ctx, `SELECT expires_at
FROM verification_evidence
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`, request.WorkspaceID, evidenceID).Scan(&expiresAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return RetentionProtection{}, false, ErrConflict
		}
		return RetentionProtection{}, false, err
	}
	if repository.retentionEvidenceLockBarrier != nil {
		repository.retentionEvidenceLockBarrier(mutationProtect, evidenceID)
	}
	if expiresAt.Valid && !expiresAt.Time.After(now.UTC()) {
		return RetentionProtection{}, false, ErrConflict
	}
	var tombstoned bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
	SELECT 1 FROM verification_tombstones
	WHERE workspace_id = $1 AND evidence_id = $2
)`, request.WorkspaceID, evidenceID).Scan(&tombstoned); err != nil {
		return RetentionProtection{}, false, err
	}
	if tombstoned {
		return RetentionProtection{}, false, ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO verification_retention_protections (
	id, evidence_id, workspace_id, kind, external_ref, actor_id,
	active, version, created_at
) VALUES ($1, $2, $3, $4, $5, $6, TRUE, 1, $7)
`, protectionID, evidenceID, request.WorkspaceID, kind, externalRef, actorID, now.UTC()); err != nil {
		return RetentionProtection{}, false, err
	}
	protection := RetentionProtection{
		ID: protectionID, EvidenceID: evidenceID, Kind: kind,
		ExternalRef: externalRef, Active: true, Version: 1,
	}
	if err := appendAudit(ctx, tx, request.WorkspaceID, evidenceID, "", actorID,
		"retention.protected", map[string]any{
			"protectionId": protection.ID, "kind": kind, "externalRef": externalRef,
		}, now); err != nil {
		return RetentionProtection{}, false, err
	}
	if err := storeMutationResult(
		ctx, tx, request, retentionMutationResult{Protection: protection}, now,
	); err != nil {
		return RetentionProtection{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return RetentionProtection{}, false, err
	}
	return protection, false, nil
}

func (repository *Repository) ReleaseProtection(
	ctx context.Context,
	workspaceID string,
	evidenceID string,
	protectionID string,
	expectedKind string,
	expectedExternalRef string,
	expectedVersion int64,
	actorID string,
	now time.Time,
	idempotencyKey string,
	expectedProtectionState string,
) (RetentionProtection, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if expectedVersion < 1 ||
		validateIdentifier(protectionID, "protection id") != nil ||
		(expectedKind != "change" && expectedKind != "release" && expectedKind != "legal-hold") ||
		validateIdentifier(expectedExternalRef, "retention external ref") != nil ||
		expectedProtectionState != "active" {
		return RetentionProtection{}, false, ErrPreconditionRequired
	}
	now = canonicalTime(now)
	request, err := prepareMutationLedgerRequest(
		workspaceID, actorID, idempotencyKey, mutationRelease,
		releaseMutationPayload{
			EvidenceID: evidenceID, ProtectionID: protectionID,
			Kind: expectedKind, ExternalRef: expectedExternalRef,
			ExpectedProtectionState: expectedProtectionState,
			ExpectedVersion:         expectedVersion,
		},
	)
	if err != nil {
		return RetentionProtection{}, false, err
	}
	return runMutationWithRetry(ctx, func() (RetentionProtection, bool, error) {
		return repository.releaseProtectionOnce(
			ctx, request, evidenceID, protectionID, expectedKind,
			expectedExternalRef, expectedVersion, actorID, now,
		)
	})
}

func (repository *Repository) releaseProtectionOnce(
	ctx context.Context,
	request mutationLedgerRequest,
	evidenceID string,
	protectionID string,
	expectedKind string,
	expectedExternalRef string,
	expectedVersion int64,
	actorID string,
	now time.Time,
) (RetentionProtection, bool, error) {
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return RetentionProtection{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	replayBytes, replayed, err := lockMutationRequest(ctx, tx, request)
	if err != nil {
		return RetentionProtection{}, false, err
	}
	if replayed {
		result, err := decodeMutationResult[retentionMutationResult](replayBytes)
		return result.Protection, true, err
	}
	var evidenceMarker int
	err = tx.QueryRowContext(ctx, `SELECT 1
FROM verification_evidence
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`, request.WorkspaceID, evidenceID).Scan(&evidenceMarker)
	if errors.Is(err, sql.ErrNoRows) {
		return RetentionProtection{}, false, ErrNotFound
	}
	if err != nil {
		return RetentionProtection{}, false, err
	}
	if repository.retentionEvidenceLockBarrier != nil {
		repository.retentionEvidenceLockBarrier(mutationRelease, evidenceID)
	}
	var kind, externalRef string
	var version int64
	var active bool
	err = tx.QueryRowContext(ctx, `SELECT kind, external_ref, active, version
FROM verification_retention_protections
WHERE id = $1 AND workspace_id = $2 AND evidence_id = $3
FOR UPDATE`, protectionID, request.WorkspaceID, evidenceID).Scan(
		&kind, &externalRef, &active, &version,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return RetentionProtection{}, false, ErrNotFound
	}
	if err != nil {
		return RetentionProtection{}, false, err
	}
	if version != expectedVersion || !active ||
		kind != expectedKind || externalRef != expectedExternalRef {
		return RetentionProtection{}, false, ErrConflict
	}
	if kind == "legal-hold" {
		return RetentionProtection{}, false, ErrUnauthorized
	}
	if _, err := tx.ExecContext(ctx, `UPDATE verification_retention_protections
SET active = FALSE, released_at = $2, version = version + 1
WHERE id = $1`, protectionID, now.UTC()); err != nil {
		return RetentionProtection{}, false, err
	}
	version++
	protection := RetentionProtection{
		ID: protectionID, EvidenceID: evidenceID, Kind: kind,
		ExternalRef: externalRef, Active: false, Version: version,
	}
	if err := appendAudit(ctx, tx, request.WorkspaceID, evidenceID, "", actorID,
		"retention.released", map[string]any{
			"protectionId": protectionID, "expectedVersion": expectedVersion,
		}, now); err != nil {
		return RetentionProtection{}, false, err
	}
	if err := storeMutationResult(
		ctx, tx, request, retentionMutationResult{Protection: protection}, now,
	); err != nil {
		return RetentionProtection{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return RetentionProtection{}, false, err
	}
	return protection, false, nil
}

func (repository *Repository) TombstoneEvidence(
	ctx context.Context,
	workspaceID string,
	evidenceID string,
	reason string,
	actorID string,
	now time.Time,
	grace time.Duration,
	idempotencyKey string,
	expectedState string,
) (bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if !safeReason(reason) || grace < 0 || expectedState != "active" {
		return false, ErrInvalid
	}
	now = canonicalTime(now)
	request, err := prepareMutationLedgerRequest(
		workspaceID, actorID, idempotencyKey, mutationTombstone,
		tombstoneMutationPayload{
			EvidenceID: evidenceID, Reason: reason, ExpectedState: expectedState,
		},
	)
	if err != nil {
		return false, err
	}
	_, replayed, err := runMutationWithRetry(ctx, func() (tombstoneMutationResult, bool, error) {
		return repository.tombstoneEvidenceOnce(
			ctx, request, evidenceID, reason, actorID, now, grace,
		)
	})
	return replayed, err
}

func (repository *Repository) tombstoneEvidenceOnce(
	ctx context.Context,
	request mutationLedgerRequest,
	evidenceID string,
	reason string,
	actorID string,
	now time.Time,
	grace time.Duration,
) (tombstoneMutationResult, bool, error) {
	// The Evidence row is the retention state mutex. READ COMMITTED is
	// intentional: after waiting for a concurrent Protect/Release/Sweep holder,
	// subsequent protection and tombstone reads must observe that holder's
	// committed state instead of a pre-lock serializable snapshot.
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return tombstoneMutationResult{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	replayBytes, replayed, err := lockMutationRequest(ctx, tx, request)
	if err != nil {
		return tombstoneMutationResult{}, false, err
	}
	if replayed {
		result, err := decodeMutationResult[tombstoneMutationResult](replayBytes)
		return result, true, err
	}
	var projectID, manifestDigest, planDigest, cellID, attemptID string
	err = tx.QueryRowContext(ctx, `SELECT project_id, manifest_digest, plan_digest, cell_id, attempt_id
FROM verification_evidence
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`, request.WorkspaceID, evidenceID).Scan(
		&projectID, &manifestDigest, &planDigest, &cellID, &attemptID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return tombstoneMutationResult{}, false, ErrNotFound
	}
	if err != nil {
		return tombstoneMutationResult{}, false, err
	}
	if repository.retentionEvidenceLockBarrier != nil {
		repository.retentionEvidenceLockBarrier(mutationTombstone, evidenceID)
	}
	var alreadyTombstoned bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
	SELECT 1 FROM verification_tombstones
	WHERE workspace_id = $1 AND evidence_id = $2
)`, request.WorkspaceID, evidenceID).Scan(&alreadyTombstoned); err != nil {
		return tombstoneMutationResult{}, false, err
	}
	if alreadyTombstoned {
		return tombstoneMutationResult{}, false, ErrConflict
	}
	var protectionCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
FROM verification_retention_protections
WHERE evidence_id = $1 AND active`, evidenceID).Scan(&protectionCount); err != nil {
		return tombstoneMutationResult{}, false, err
	}
	if protectionCount > 0 {
		return tombstoneMutationResult{}, false, ErrRetentionProtected
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO verification_tombstones (
	evidence_id, workspace_id, project_id, manifest_digest, plan_digest,
	cell_id, attempt_id, reason, actor_id, deleted_at, purge_after, version
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)
`, evidenceID, request.WorkspaceID, projectID, manifestDigest,
		planDigest, cellID, attemptID, reason, actorID, now.UTC(),
		now.Add(grace).UTC()); err != nil {
		return tombstoneMutationResult{}, false, err
	}
	if err := appendAudit(ctx, tx, request.WorkspaceID, evidenceID, "", actorID,
		"evidence.tombstoned", map[string]any{
			"manifestDigest": manifestDigest, "reason": reason,
			"purgeAfter": formatInstant(now.Add(grace)),
		}, now); err != nil {
		return tombstoneMutationResult{}, false, err
	}
	result := tombstoneMutationResult{Tombstoned: true}
	if err := storeMutationResult(ctx, tx, request, result, now); err != nil {
		return tombstoneMutationResult{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return tombstoneMutationResult{}, false, err
	}
	return result, false, nil
}

type RevocationInput struct {
	EvidenceID  string
	Issuer      string
	KeyID       string
	ReasonCode  string
	Reason      string
	EffectiveAt time.Time
}

func (repository *Repository) CreateRevocation(
	ctx context.Context,
	workspaceID string,
	input RevocationInput,
	actorID string,
	now time.Time,
	idempotencyKey string,
	expectedScopeState string,
) (string, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	evidenceScope := input.EvidenceID != "" && input.Issuer == "" && input.KeyID == ""
	issuerScope := input.EvidenceID == "" && input.Issuer != "" && input.KeyID == ""
	keyScope := input.EvidenceID == "" && input.Issuer != "" && input.KeyID != ""
	if (!evidenceScope && !issuerScope && !keyScope) ||
		validateIdentifier(input.ReasonCode, "revocation reason code") != nil ||
		!safeReason(input.Reason) || input.EffectiveAt.Before(now.Add(-time.Minute)) ||
		input.EffectiveAt.After(now.Add(24*time.Hour)) ||
		expectedScopeState != "unrevoked" {
		return "", false, ErrInvalid
	}
	if input.EvidenceID != "" && validateIdentifier(input.EvidenceID, "revocation Evidence scope") != nil {
		return "", false, ErrInvalid
	}
	if input.KeyID != "" && validateIdentifier(input.KeyID, "revocation key scope") != nil {
		return "", false, ErrInvalid
	}
	if input.Issuer != "" && validateCanonicalText(input.Issuer, "revocation issuer scope", 4096) != nil {
		return "", false, ErrInvalid
	}
	now = canonicalTime(now)
	input.EffectiveAt = canonicalTime(input.EffectiveAt)
	request, err := prepareMutationLedgerRequest(
		workspaceID, actorID, idempotencyKey, mutationRevocation,
		revocationMutationPayload{
			EvidenceID: input.EvidenceID, Issuer: input.Issuer, KeyID: input.KeyID,
			ReasonCode: input.ReasonCode, Reason: input.Reason,
			EffectiveAt:        formatInstant(input.EffectiveAt),
			ExpectedScopeState: expectedScopeState,
		},
	)
	if err != nil {
		return "", false, err
	}
	result, replayed, err := runMutationWithRetry(ctx, func() (revocationMutationResult, bool, error) {
		return repository.createRevocationOnce(ctx, request, input, actorID, now)
	})
	return result.RevocationID, replayed, err
}

func (repository *Repository) createRevocationOnce(
	ctx context.Context,
	request mutationLedgerRequest,
	input RevocationInput,
	actorID string,
	now time.Time,
) (revocationMutationResult, bool, error) {
	idDigest := digestBytes([]byte(fmt.Sprintf("%s\x00%s\x00%s\x00%s\x00%s\x00%s",
		request.WorkspaceID, input.EvidenceID, input.Issuer, input.KeyID,
		formatInstant(input.EffectiveAt), input.ReasonCode+"\x00"+input.Reason+"\x00"+actorID)))
	id := "revocation-" + strings.TrimPrefix(idDigest, "sha256-")[:40]
	record, recordBytes, err := buildTrustRevocationRecord(
		id, input, actorID, now,
	)
	if err != nil {
		return revocationMutationResult{}, false, err
	}
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return revocationMutationResult{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	replayBytes, replayed, err := lockMutationRequest(ctx, tx, request)
	if err != nil {
		return revocationMutationResult{}, false, err
	}
	if replayed {
		result, err := decodeMutationResult[revocationMutationResult](replayBytes)
		return result, true, err
	}
	scopeIdentity := fmt.Sprintf(
		"revocation:%s:%s:%s:%s",
		request.WorkspaceID, input.EvidenceID, input.Issuer, input.KeyID,
	)
	if err := lockMutationResource(ctx, tx, scopeIdentity); err != nil {
		return revocationMutationResult{}, false, err
	}
	if input.EvidenceID != "" {
		var marker int
		if err := tx.QueryRowContext(ctx, `SELECT 1 FROM verification_evidence
WHERE workspace_id = $1 AND id = $2 FOR SHARE`, request.WorkspaceID, input.EvidenceID).Scan(&marker); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return revocationMutationResult{}, false, ErrNotFound
			}
			return revocationMutationResult{}, false, err
		}
	}
	var scopeExists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
	SELECT 1
	FROM verification_trust_revocations
	WHERE workspace_id = $1
		AND evidence_id IS NOT DISTINCT FROM $2::text
		AND issuer IS NOT DISTINCT FROM $3::text
		AND key_id IS NOT DISTINCT FROM $4::text
)`, request.WorkspaceID, nullableString(input.EvidenceID),
		nullableString(input.Issuer), nullableString(input.KeyID)).Scan(&scopeExists); err != nil {
		return revocationMutationResult{}, false, err
	}
	if scopeExists {
		return revocationMutationResult{}, false, ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO verification_trust_revocations (
	id, workspace_id, evidence_id, issuer, key_id, reason_code, reason,
	actor_id, effective_at, created_at, record_digest, record_json, record_bytes
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
		id, request.WorkspaceID, nullableString(input.EvidenceID),
		nullableString(input.Issuer), nullableString(input.KeyID), input.ReasonCode,
		input.Reason, actorID, input.EffectiveAt.UTC(), now.UTC(), record.RecordDigest,
		string(recordBytes), recordBytes); err != nil {
		return revocationMutationResult{}, false, err
	}
	if err := appendAudit(ctx, tx, request.WorkspaceID, input.EvidenceID, "", actorID,
		"trust.revoked", map[string]any{
			"revocationId": id, "evidenceId": nullableString(input.EvidenceID),
			"issuer": nullableString(input.Issuer), "keyId": nullableString(input.KeyID),
			"effectiveAt": formatInstant(input.EffectiveAt),
		}, now); err != nil {
		return revocationMutationResult{}, false, err
	}
	result := revocationMutationResult{RevocationID: id}
	if err := storeMutationResult(ctx, tx, request, result, now); err != nil {
		return revocationMutationResult{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return revocationMutationResult{}, false, err
	}
	return result, false, nil
}

func buildTrustRevocationRecord(
	id string,
	input RevocationInput,
	actorID string,
	recordedAt time.Time,
) (TrustRevocationRecord, []byte, error) {
	var scope any
	switch {
	case input.EvidenceID != "":
		scope = struct {
			Kind       string `json:"kind"`
			EvidenceID string `json:"evidenceId"`
		}{Kind: "evidence", EvidenceID: input.EvidenceID}
	case input.KeyID != "":
		scope = struct {
			Kind   string `json:"kind"`
			Issuer string `json:"issuer"`
			KeyID  string `json:"keyId"`
		}{Kind: "key", Issuer: input.Issuer, KeyID: input.KeyID}
	default:
		scope = struct {
			Kind   string `json:"kind"`
			Issuer string `json:"issuer"`
		}{Kind: "issuer", Issuer: input.Issuer}
	}
	record := TrustRevocationRecord{
		Format: "prodivix.verification-trust-revocation", Version: 1,
		ID: id, Scope: scope, ReasonCode: input.ReasonCode, Reason: input.Reason,
		ActorID: actorID, RecordedAt: formatInstant(recordedAt),
		EffectiveAt: formatInstant(input.EffectiveAt),
	}
	digest, _, err := digestWithoutField(record, "recordDigest")
	if err != nil {
		return TrustRevocationRecord{}, nil, err
	}
	record.RecordDigest = digest
	encoded, err := canonicalBytes(record)
	return record, encoded, err
}

type SweepWork struct {
	Result                 RetentionSweepResult
	StagingLocators        []string
	ArtifactDeletionLeases []ArtifactDeletionLease
}

type ArtifactDeletionLease struct {
	WorkspaceID string
	Digest      string
	Locator     string
	Token       string
}

func (repository *Repository) SweepRetention(
	ctx context.Context,
	policy RetentionSweepPolicy,
) (SweepWork, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if policy.ObservedAt.IsZero() || policy.TombstoneGrace < 0 ||
		policy.PromotionTTL <= 0 || policy.BatchSize < 1 || policy.BatchSize > 1000 {
		return SweepWork{}, ErrInvalid
	}
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return SweepWork{}, err
	}
	defer func() { _ = tx.Rollback() }()
	work := SweepWork{}
	promotionRows, err := tx.QueryContext(ctx, `SELECT p.id
FROM verification_promotions p
WHERE p.state IN ('staging', 'verification-pending', 'failed')
	AND p.deadline <= $1
ORDER BY p.deadline, p.id
LIMIT $2
FOR UPDATE SKIP LOCKED`, policy.ObservedAt.UTC(), policy.BatchSize)
	if err != nil {
		return SweepWork{}, err
	}
	promotionIDs := make([]string, 0)
	for promotionRows.Next() {
		var id string
		if err := promotionRows.Scan(&id); err != nil {
			_ = promotionRows.Close()
			return SweepWork{}, err
		}
		promotionIDs = append(promotionIDs, id)
	}
	if err := promotionRows.Close(); err != nil {
		return SweepWork{}, err
	}
	for _, promotionID := range promotionIDs {
		rows, err := tx.QueryContext(ctx, `SELECT staging_locator
FROM verification_promotion_artifacts
WHERE promotion_id = $1 AND staging_locator IS NOT NULL`, promotionID)
		if err != nil {
			return SweepWork{}, err
		}
		for rows.Next() {
			var locator string
			if err := rows.Scan(&locator); err != nil {
				_ = rows.Close()
				return SweepWork{}, err
			}
			work.StagingLocators = append(work.StagingLocators, locator)
		}
		if err := rows.Close(); err != nil {
			return SweepWork{}, err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE verification_promotion_artifacts
SET staging_locator = NULL
WHERE promotion_id = $1`, promotionID); err != nil {
			return SweepWork{}, err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE verification_promotions
SET state = 'failed', failure_code = COALESCE(failure_code, 'VER-6001'),
	version = version + 1, updated_at = $2
WHERE id = $1 AND state <> 'committed'`, promotionID, policy.ObservedAt.UTC()); err != nil {
			return SweepWork{}, err
		}
		work.Result.ExpiredPromotions++
	}
	evidenceRows, err := tx.QueryContext(ctx, `SELECT e.id, e.workspace_id, e.project_id,
	e.manifest_digest, e.plan_digest, e.cell_id, e.attempt_id
FROM verification_evidence e
WHERE e.expires_at IS NOT NULL AND e.expires_at <= $1
ORDER BY e.expires_at, e.id
LIMIT $2
FOR UPDATE OF e SKIP LOCKED`, policy.ObservedAt.UTC(), policy.BatchSize)
	if err != nil {
		return SweepWork{}, err
	}
	type expiringEvidence struct {
		ID, WorkspaceID, ProjectID, ManifestDigest, PlanDigest, CellID, AttemptID string
	}
	expiring := make([]expiringEvidence, 0)
	for evidenceRows.Next() {
		var evidence expiringEvidence
		if err := evidenceRows.Scan(&evidence.ID, &evidence.WorkspaceID, &evidence.ProjectID,
			&evidence.ManifestDigest, &evidence.PlanDigest, &evidence.CellID, &evidence.AttemptID); err != nil {
			_ = evidenceRows.Close()
			return SweepWork{}, err
		}
		expiring = append(expiring, evidence)
	}
	if err := evidenceRows.Close(); err != nil {
		return SweepWork{}, err
	}
	for _, evidence := range expiring {
		if repository.retentionEvidenceLockBarrier != nil {
			repository.retentionEvidenceLockBarrier("retention.sweep-tombstone", evidence.ID)
		}
		var tombstoned, protected bool
		if err := tx.QueryRowContext(ctx, `SELECT
	EXISTS (
		SELECT 1 FROM verification_tombstones WHERE evidence_id = $1
	),
	EXISTS (
		SELECT 1 FROM verification_retention_protections
		WHERE evidence_id = $1 AND active
	)`, evidence.ID).Scan(&tombstoned, &protected); err != nil {
			return SweepWork{}, err
		}
		if tombstoned || protected {
			continue
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO verification_tombstones (
			evidence_id, workspace_id, project_id, manifest_digest, plan_digest,
			cell_id, attempt_id, reason, actor_id, deleted_at, purge_after, version
		) VALUES ($1, $2, $3, $4, $5, $6, $7, 'retention-expired',
			'system:verification-retention', $8, $9, 1)`,
			evidence.ID, evidence.WorkspaceID, evidence.ProjectID,
			evidence.ManifestDigest, evidence.PlanDigest, evidence.CellID, evidence.AttemptID,
			policy.ObservedAt.UTC(), policy.ObservedAt.Add(policy.TombstoneGrace).UTC()); err != nil {
			return SweepWork{}, err
		}
		if err := appendAudit(ctx, tx, evidence.WorkspaceID, evidence.ID, "",
			"system:verification-retention", "evidence.expired", map[string]any{
				"manifestDigest": evidence.ManifestDigest,
			}, policy.ObservedAt); err != nil {
			return SweepWork{}, err
		}
		work.Result.TombstonedEvidence++
	}
	tombstoneRows, err := tx.QueryContext(ctx, `SELECT t.evidence_id
FROM verification_tombstones t
WHERE t.purged_at IS NULL AND t.purge_after <= $1
ORDER BY t.purge_after, t.evidence_id
LIMIT $2
FOR UPDATE OF t SKIP LOCKED`, policy.ObservedAt.UTC(), policy.BatchSize)
	if err != nil {
		return SweepWork{}, err
	}
	tombstoneIDs := make([]string, 0)
	for tombstoneRows.Next() {
		var id string
		if err := tombstoneRows.Scan(&id); err != nil {
			_ = tombstoneRows.Close()
			return SweepWork{}, err
		}
		tombstoneIDs = append(tombstoneIDs, id)
	}
	if err := tombstoneRows.Close(); err != nil {
		return SweepWork{}, err
	}
	for _, evidenceID := range tombstoneIDs {
		var evidenceMarker int
		err := tx.QueryRowContext(ctx, `SELECT 1
FROM verification_evidence
WHERE id = $1
FOR UPDATE`, evidenceID).Scan(&evidenceMarker)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return SweepWork{}, err
		}
		if repository.retentionEvidenceLockBarrier != nil {
			repository.retentionEvidenceLockBarrier("retention.sweep-purge", evidenceID)
		}
		var protected bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
	SELECT 1 FROM verification_retention_protections
	WHERE evidence_id = $1 AND active
)`, evidenceID).Scan(&protected); err != nil {
			return SweepWork{}, err
		}
		if protected {
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE verification_tombstones
SET purged_at = $2, version = version + 1
WHERE evidence_id = $1 AND purged_at IS NULL`, evidenceID, policy.ObservedAt.UTC()); err != nil {
			return SweepWork{}, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM verification_evidence_artifacts
WHERE evidence_id = $1`, evidenceID); err != nil {
			return SweepWork{}, err
		}
		work.Result.ReleasedReferences++
	}

	if repository.artifactDeletionScanBarrier != nil {
		repository.artifactDeletionScanBarrier()
	}
	artifactRows, err := tx.QueryContext(ctx, `SELECT a.workspace_id, a.digest,
	a.store_locator
FROM verification_artifacts a
WHERE NOT EXISTS (
		SELECT 1
		FROM verification_evidence_artifacts ea
		WHERE ea.workspace_id = a.workspace_id
			AND ea.artifact_digest = a.digest
	)
ORDER BY a.workspace_id, a.digest
LIMIT $1
FOR UPDATE OF a SKIP LOCKED`, policy.BatchSize)
	if err != nil {
		return SweepWork{}, err
	}
	type artifactLeaseCandidate struct {
		WorkspaceID string
		Digest      string
		Locator     string
	}
	leaseCandidates := make([]artifactLeaseCandidate, 0, policy.BatchSize)
	for artifactRows.Next() {
		var candidate artifactLeaseCandidate
		if err := artifactRows.Scan(
			&candidate.WorkspaceID,
			&candidate.Digest,
			&candidate.Locator,
		); err != nil {
			_ = artifactRows.Close()
			return SweepWork{}, err
		}
		leaseCandidates = append(leaseCandidates, candidate)
	}
	if err := artifactRows.Close(); err != nil {
		return SweepWork{}, err
	}
	for _, candidate := range leaseCandidates {
		lease, claimed, err := claimReferencedArtifactDeletionLeaseTx(
			ctx,
			tx,
			ArtifactLeaseTarget{
				WorkspaceID: candidate.WorkspaceID,
				Digest:      candidate.Digest,
				Locator:     candidate.Locator,
			},
			policy.ObservedAt,
		)
		if err != nil {
			return SweepWork{}, err
		}
		if !claimed {
			continue
		}
		work.ArtifactDeletionLeases = append(work.ArtifactDeletionLeases, lease)
	}
	if err := tx.Commit(); err != nil {
		return SweepWork{}, err
	}
	return work, nil
}

func (repository *Repository) ConfirmArtifactDeletionLease(
	ctx context.Context,
	lease ArtifactDeletionLease,
) (bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	var mode, token, workspaceID, digest string
	err = tx.QueryRowContext(ctx, `SELECT mode, token,
	COALESCE(workspace_id, ''), COALESCE(digest, '')
FROM verification_artifact_operation_leases
WHERE locator = $1
FOR UPDATE`, lease.Locator).Scan(&mode, &token, &workspaceID, &digest)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if mode != artifactOperationDeletion || token != lease.Token ||
		workspaceID != lease.WorkspaceID || digest != lease.Digest {
		return false, nil
	}
	if lease.WorkspaceID == "" {
		var referenced bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
	SELECT 1 FROM verification_artifacts WHERE store_locator = $1
)`, lease.Locator).Scan(&referenced); err != nil {
			return false, err
		}
		if referenced {
			return false, ErrConflict
		}
	} else {
		var locator string
		err = tx.QueryRowContext(ctx, `SELECT store_locator
FROM verification_artifacts
WHERE workspace_id = $1 AND digest = $2
FOR UPDATE`, lease.WorkspaceID, lease.Digest).Scan(&locator)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if locator != lease.Locator {
			return false, ErrConflict
		}
		var references int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
FROM verification_evidence_artifacts
WHERE workspace_id = $1 AND artifact_digest = $2`,
			lease.WorkspaceID, lease.Digest).Scan(&references); err != nil {
			return false, err
		}
		if references != 0 {
			return false, ErrConflict
		}
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func (repository *Repository) CompleteArtifactDeletionLease(
	ctx context.Context,
	lease ArtifactDeletionLease,
) (bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	var deletedArtifact int64 = 1
	if lease.WorkspaceID != "" {
		result, err := tx.ExecContext(ctx, `DELETE FROM verification_artifacts a
WHERE a.workspace_id = $1 AND a.digest = $2
	AND a.store_locator = $3
	AND NOT EXISTS (
		SELECT 1
		FROM verification_evidence_artifacts ea
		WHERE ea.workspace_id = a.workspace_id
			AND ea.artifact_digest = a.digest
	)`, lease.WorkspaceID, lease.Digest, lease.Locator)
		if err != nil {
			return false, err
		}
		deletedArtifact, err = result.RowsAffected()
		if err != nil {
			return false, err
		}
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM verification_artifact_operation_leases
WHERE locator = $1 AND mode = 'deletion' AND token = $2
	AND COALESCE(workspace_id, '') = $3 AND COALESCE(digest, '') = $4`,
		lease.Locator, lease.Token, lease.WorkspaceID, lease.Digest)
	if err != nil {
		return false, err
	}
	deletedLease, err := result.RowsAffected()
	if err != nil || deletedLease != 1 || deletedArtifact != 1 {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func safeReason(value string) bool {
	return value == strings.TrimSpace(value) && len(value) >= 1 && len(value) <= 512 &&
		!strings.ContainsAny(value, "\x00\r\n")
}
