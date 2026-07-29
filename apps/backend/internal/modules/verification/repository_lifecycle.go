package verification

import (
	"context"
	"database/sql"
	"errors"
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

func safeReason(value string) bool {
	return value == strings.TrimSpace(value) && len(value) >= 1 && len(value) <= 512 &&
		!strings.ContainsAny(value, "\x00\r\n")
}
