package verification

import (
	"context"
	"database/sql"
	"errors"
)

// RetireVerificationRunPromotionsWithAuthorization uses the existing promotion
// and staging owners. Committed evidence remains governed by retention; failed
// attempts lose staging bytes before a driver can acknowledge resource cleanup.
func (service *Service) RetireVerificationRunPromotionsWithAuthorization(ctx context.Context, principalID, workspaceID, runID string, authorize WriteAuthorization) error {
	if authorize == nil {
		return ErrUnauthorized
	}
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.write"); err != nil {
		return err
	}
	tx, err := service.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorize(ctx, tx); err != nil {
		return err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,state FROM verification_promotions WHERE workspace_id=$1 AND candidate_json->'run'->>'runId'=$2 ORDER BY id COLLATE "C" FOR UPDATE`, workspaceID, runID)
	if err != nil {
		return err
	}
	type promotionState struct{ id, state string }
	promotions := []promotionState{}
	for rows.Next() {
		var item promotionState
		if err := rows.Scan(&item.id, &item.state); err != nil {
			_ = rows.Close()
			return err
		}
		promotions = append(promotions, item)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := authorize(ctx, tx); err != nil {
		return err
	}
	for _, item := range promotions {
		if item.state == "staging" || item.state == "verification-pending" {
			if _, err := tx.ExecContext(ctx, `UPDATE verification_promotions SET state='failed',failure_code='VER-5004',version=version+1,updated_at=$2 WHERE id=$1`, item.id, canonicalTime(service.now())); err != nil {
				return err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	var cleanupErrors []error
	for _, item := range promotions {
		if item.state == "committed" {
			continue
		}
		artifacts, err := service.repository.ListPromotionArtifacts(ctx, item.id)
		if err != nil {
			cleanupErrors = append(cleanupErrors, err)
			continue
		}
		for _, artifact := range artifacts {
			if artifact.StagingLocator != "" {
				if err := service.store.DeleteStaging(ctx, artifact.StagingLocator); err != nil {
					cleanupErrors = append(cleanupErrors, err)
				}
			}
		}
	}
	return errors.Join(cleanupErrors...)
}
