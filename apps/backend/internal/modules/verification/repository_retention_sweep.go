package verification

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

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
