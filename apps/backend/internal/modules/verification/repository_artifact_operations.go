package verification

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	artifactOperationPromotion = "promotion"
	artifactOperationDeletion  = "deletion"
)

type ArtifactLeaseTarget struct {
	WorkspaceID string
	Digest      string
	Locator     string
}

type ArtifactOperationLease struct {
	Mode        string
	Token       string
	OwnerID     string
	WorkspaceID string
	Digest      string
	Locator     string
	ExpiresAt   time.Time
}

func (repository *Repository) ClaimArtifactPromotionLeases(
	ctx context.Context,
	ownerID string,
	targets []ArtifactLeaseTarget,
	observedAt time.Time,
	expiresAt time.Time,
) ([]ArtifactOperationLease, error) {
	var last error
	for attempt := 0; attempt < 4; attempt++ {
		leases, err := repository.claimArtifactPromotionLeasesOnce(
			ctx,
			ownerID,
			targets,
			observedAt,
			expiresAt,
		)
		if !retryablePostgreSQLTransaction(err) {
			return leases, err
		}
		last = err
		if err := ctx.Err(); err != nil {
			return nil, err
		}
	}
	return nil, last
}

func (repository *Repository) claimArtifactPromotionLeasesOnce(
	ctx context.Context,
	ownerID string,
	targets []ArtifactLeaseTarget,
	observedAt time.Time,
	expiresAt time.Time,
) ([]ArtifactOperationLease, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	observedAt = canonicalTime(observedAt)
	expiresAt = canonicalTime(expiresAt)
	if validateIdentifier(ownerID, "artifact lease owner") != nil ||
		!expiresAt.After(observedAt) {
		return nil, ErrInvalid
	}
	unique := make(map[string]ArtifactLeaseTarget, len(targets))
	for _, target := range targets {
		if validateArtifactLeaseTarget(target) != nil {
			return nil, ErrInvalid
		}
		if previous, exists := unique[target.Locator]; exists {
			if previous != target {
				return nil, ErrConflict
			}
			continue
		}
		unique[target.Locator] = target
	}
	ordered := make([]ArtifactLeaseTarget, 0, len(unique))
	for _, target := range unique {
		ordered = append(ordered, target)
	}
	sort.Slice(ordered, func(left, right int) bool {
		return ordered[left].Locator < ordered[right].Locator
	})
	if len(ordered) == 0 {
		return []ArtifactOperationLease{}, nil
	}

	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	leases := make([]ArtifactOperationLease, 0, len(ordered))
	for index, target := range ordered {
		if _, err := tx.ExecContext(ctx, `DELETE FROM verification_artifact_operation_leases
WHERE locator = $1 AND mode = 'promotion' AND expires_at <= $2`,
			target.Locator, observedAt.UTC()); err != nil {
			return nil, err
		}
		token := artifactOperationToken(
			artifactOperationPromotion,
			ownerID,
			target.Locator,
			index,
		)
		result, err := tx.ExecContext(ctx, `INSERT INTO verification_artifact_operation_leases (
	locator, mode, token, owner_id, workspace_id, digest, acquired_at, expires_at
) VALUES ($1, 'promotion', $2, $3, $4, $5, $6, $7)
ON CONFLICT DO NOTHING`,
			target.Locator, token, ownerID, target.WorkspaceID, target.Digest,
			observedAt.UTC(), expiresAt.UTC())
		if err != nil {
			return nil, err
		}
		inserted, err := result.RowsAffected()
		if err != nil {
			return nil, err
		}
		if inserted != 1 {
			var currentMode string
			modeErr := tx.QueryRowContext(ctx, `SELECT mode
FROM verification_artifact_operation_leases
WHERE locator = $1`, target.Locator).Scan(&currentMode)
			cause := ErrConflict
			if modeErr == nil && currentMode == artifactOperationPromotion {
				cause = errors.Join(ErrConflict, errArtifactPromotionBusy)
			} else if modeErr == nil && currentMode == artifactOperationDeletion {
				cause = errors.Join(ErrConflict, errArtifactDeletionBusy)
			}
			return nil, coded(
				"VER-5005",
				"Artifact is busy with another promotion or deletion; retry finalization.",
				cause,
			)
		}
		leases = append(leases, ArtifactOperationLease{
			Mode: artifactOperationPromotion, Token: token, OwnerID: ownerID,
			WorkspaceID: target.WorkspaceID, Digest: target.Digest,
			Locator: target.Locator, ExpiresAt: expiresAt,
		})
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return leases, nil
}

func (repository *Repository) ReleaseArtifactPromotionLeases(
	ctx context.Context,
	leases []ArtifactOperationLease,
) error {
	if len(leases) == 0 {
		return nil
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, lease := range leases {
		if _, err := tx.ExecContext(ctx, `DELETE FROM verification_artifact_operation_leases
WHERE locator = $1 AND mode = 'promotion' AND token = $2 AND owner_id = $3`,
			lease.Locator, lease.Token, lease.OwnerID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func verifyArtifactPromotionLeaseTx(
	ctx context.Context,
	tx *sql.Tx,
	lease ArtifactOperationLease,
	committedAt time.Time,
) error {
	var mode, token, ownerID, workspaceID, digest string
	var expiresAt time.Time
	err := tx.QueryRowContext(ctx, `SELECT mode, token, owner_id,
	COALESCE(workspace_id, ''), COALESCE(digest, ''), expires_at
FROM verification_artifact_operation_leases
WHERE locator = $1
FOR UPDATE`, lease.Locator).Scan(
		&mode, &token, &ownerID, &workspaceID, &digest, &expiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return coded("VER-5005", "Artifact promotion lease is missing.", ErrConflict)
	}
	if err != nil {
		return err
	}
	if mode != artifactOperationPromotion || token != lease.Token ||
		ownerID != lease.OwnerID || workspaceID != lease.WorkspaceID ||
		digest != lease.Digest || !committedAt.Before(expiresAt) {
		return coded("VER-5005", "Artifact promotion lease is stale.", ErrConflict)
	}
	return nil
}

func (repository *Repository) ClaimOrphanArtifactDeletionLease(
	ctx context.Context,
	locator string,
	observedAt time.Time,
) (ArtifactDeletionLease, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	observedAt = canonicalTime(observedAt)
	if !safeArtifactLocator(locator) || observedAt.IsZero() {
		return ArtifactDeletionLease{}, false, ErrInvalid
	}
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM verification_artifact_operation_leases
WHERE locator = $1 AND mode = 'promotion' AND expires_at <= $2`,
		locator, observedAt.UTC()); err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	var referenced bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
	SELECT 1 FROM verification_artifacts WHERE store_locator = $1
)`, locator).Scan(&referenced); err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	if referenced {
		return ArtifactDeletionLease{}, false, nil
	}
	lease, found, err := artifactDeletionLeaseByLocatorTx(ctx, tx, locator)
	if err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	if found {
		if lease.WorkspaceID != "" || lease.Digest != "" {
			return ArtifactDeletionLease{}, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return ArtifactDeletionLease{}, false, err
		}
		return lease, true, nil
	}
	lease = ArtifactDeletionLease{
		Locator: locator,
		Token: artifactOperationToken(
			artifactOperationDeletion,
			"verification-orphan-reconciler",
			locator,
			0,
		),
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO verification_artifact_operation_leases (
	locator, mode, token, owner_id, workspace_id, digest, acquired_at, expires_at
) VALUES ($1, 'deletion', $2, 'verification-orphan-reconciler',
	NULL, NULL, $3, $4)
ON CONFLICT DO NOTHING`,
		locator, lease.Token, observedAt.UTC(), longLivedLeaseExpiry(observedAt))
	if err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	if inserted != 1 {
		return ArtifactDeletionLease{}, false, nil
	}
	if err := tx.Commit(); err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	return lease, true, nil
}

func claimReferencedArtifactDeletionLeaseTx(
	ctx context.Context,
	tx *sql.Tx,
	target ArtifactLeaseTarget,
	observedAt time.Time,
) (ArtifactDeletionLease, bool, error) {
	if validateArtifactLeaseTarget(target) != nil {
		return ArtifactDeletionLease{}, false, ErrInvalid
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM verification_artifact_operation_leases
WHERE locator = $1 AND mode = 'promotion' AND expires_at <= $2`,
		target.Locator, observedAt.UTC()); err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	lease, found, err := artifactDeletionLeaseByLocatorTx(ctx, tx, target.Locator)
	if err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	if found {
		if lease.WorkspaceID != target.WorkspaceID || lease.Digest != target.Digest {
			return ArtifactDeletionLease{}, false, ErrConflict
		}
		return lease, true, nil
	}
	lease = ArtifactDeletionLease{
		WorkspaceID: target.WorkspaceID,
		Digest:      target.Digest,
		Locator:     target.Locator,
		Token: artifactOperationToken(
			artifactOperationDeletion,
			"verification-retention-sweeper",
			target.Locator,
			0,
		),
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO verification_artifact_operation_leases (
	locator, mode, token, owner_id, workspace_id, digest, acquired_at, expires_at
)
SELECT $1, 'deletion', $2, 'verification-retention-sweeper',
	$3, $4, $5, $6
WHERE EXISTS (
	SELECT 1 FROM verification_artifacts
	WHERE workspace_id = $3 AND digest = $4 AND store_locator = $1
)
AND NOT EXISTS (
	SELECT 1 FROM verification_evidence_artifacts
	WHERE workspace_id = $3 AND artifact_digest = $4
)
ON CONFLICT DO NOTHING`,
		target.Locator, lease.Token, target.WorkspaceID, target.Digest,
		observedAt.UTC(), longLivedLeaseExpiry(observedAt))
	if err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	return lease, inserted == 1, nil
}

func artifactDeletionLeaseByLocatorTx(
	ctx context.Context,
	tx *sql.Tx,
	locator string,
) (ArtifactDeletionLease, bool, error) {
	var mode, token, workspaceID, digest string
	err := tx.QueryRowContext(ctx, `SELECT mode, token,
	COALESCE(workspace_id, ''), COALESCE(digest, '')
FROM verification_artifact_operation_leases
WHERE locator = $1
FOR UPDATE`, locator).Scan(&mode, &token, &workspaceID, &digest)
	if errors.Is(err, sql.ErrNoRows) {
		return ArtifactDeletionLease{}, false, nil
	}
	if err != nil {
		return ArtifactDeletionLease{}, false, err
	}
	if mode != artifactOperationDeletion {
		return ArtifactDeletionLease{}, false, nil
	}
	return ArtifactDeletionLease{
		WorkspaceID: workspaceID,
		Digest:      digest,
		Locator:     locator,
		Token:       token,
	}, true, nil
}

func validateArtifactLeaseTarget(target ArtifactLeaseTarget) error {
	if validateIdentifier(target.WorkspaceID, "workspace id") != nil ||
		!digestPattern.MatchString(target.Digest) ||
		!safeArtifactLocator(target.Locator) {
		return ErrInvalid
	}
	return nil
}

func safeArtifactLocator(locator string) bool {
	return locator != "" && locator == strings.TrimSpace(locator) &&
		len(locator) <= 4096 && !strings.ContainsAny(locator, "\x00\r\n")
}

func artifactOperationToken(mode string, ownerID string, locator string, index int) string {
	return digestBytes([]byte(
		mode + "\x00" + ownerID + "\x00" + locator + "\x00" +
			strconv.FormatInt(time.Now().UTC().UnixNano(), 10) + "\x00" +
			strconv.Itoa(index),
	))
}

func longLivedLeaseExpiry(observedAt time.Time) time.Time {
	return observedAt.AddDate(100, 0, 0).UTC()
}
