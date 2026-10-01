package verification

import (
	"bytes"
	"context"
	"database/sql"
	"io"
)

// WriteAuthorization runs before owner locks and again immediately before the
// durable effect. It must be idempotent and confined to the supplied transaction.
type WriteAuthorization func(context.Context, *sql.Tx) error
type writeAuthorizationKey struct{}

func authorizedWriteContext(ctx context.Context, authorize WriteAuthorization) (context.Context, error) {
	if authorize == nil {
		return nil, ErrUnauthorized
	}
	return context.WithValue(ctx, writeAuthorizationKey{}, authorize), nil
}

func authorizeVerificationWrite(ctx context.Context, tx *sql.Tx) error {
	if authorize, ok := ctx.Value(writeAuthorizationKey{}).(WriteAuthorization); ok {
		return authorize(ctx, tx)
	}
	return nil
}

func checkVerificationWriteAuthorization(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeVerificationWrite(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (service *Service) CreatePromotionWithAuthorization(ctx context.Context, principalID, workspaceID, idempotencyKey string, candidate EvidenceCandidate, authorize WriteAuthorization) (CreatePromotionResult, error) {
	ctx, err := authorizedWriteContext(ctx, authorize)
	if err != nil {
		return CreatePromotionResult{}, err
	}
	if err := checkVerificationWriteAuthorization(ctx, service.repository.db); err != nil {
		return CreatePromotionResult{}, err
	}
	return service.CreatePromotion(ctx, principalID, workspaceID, idempotencyKey, candidate)
}

func (service *Service) UploadArtifactWithAuthorization(ctx context.Context, principalID, workspaceID, promotionID, artifactID, capability, mediaType string, body io.Reader, authorize WriteAuthorization) (ArtifactDescriptor, error) {
	ctx, err := authorizedWriteContext(ctx, authorize)
	if err != nil {
		return ArtifactDescriptor{}, err
	}
	if err := checkVerificationWriteAuthorization(ctx, service.repository.db); err != nil {
		return ArtifactDescriptor{}, err
	}
	return service.UploadArtifact(ctx, principalID, workspaceID, promotionID, artifactID, capability, mediaType, body)
}

func (service *Service) FinalizePromotionWithAuthorization(ctx context.Context, principalID, workspaceID, promotionID, capability string, presentation *AttestationPresentation, authorize WriteAuthorization) (EvidenceRecord, error) {
	ctx, err := authorizedWriteContext(ctx, authorize)
	if err != nil {
		return EvidenceRecord{}, err
	}
	if err := checkVerificationWriteAuthorization(ctx, service.repository.db); err != nil {
		return EvidenceRecord{}, err
	}
	return service.FinalizePromotion(ctx, principalID, workspaceID, promotionID, capability, presentation)
}

func (authority *PostgreSQLAttemptGrantAuthority) IssueTrustedAttemptGrantWithAuthorization(ctx context.Context, input TrustedAttemptGrantIssue, authorize WriteAuthorization) (AttemptGrantRecord, error) {
	ctx, err := authorizedWriteContext(ctx, authorize)
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	if authority == nil || authority.db == nil || authority.now == nil {
		return AttemptGrantRecord{}, ErrUnauthorized
	}
	if err := checkVerificationWriteAuthorization(ctx, authority.db); err != nil {
		return AttemptGrantRecord{}, err
	}
	if err := validateTrustedAttemptGrantIssueIdentity(input); err != nil {
		return AttemptGrantRecord{}, err
	}
	plan, planBytes, err := decodeVerificationPlanWire(input.Plan)
	if err != nil {
		return AttemptGrantRecord{}, err
	}
	existing, found, lookupErr := authority.findAttemptGrantByIdentity(ctx, input.WorkspaceID, plan.PlanDigest, input.CellID, input.AttemptID)
	if lookupErr == nil && found {
		cell, err := uniqueSupportedAttemptGrantCell(plan, input.CellID)
		if err != nil {
			return AttemptGrantRecord{}, err
		}
		if err := validateIssuedRunAgainstPlanCell(input.Run, cell); err != nil {
			return AttemptGrantRecord{}, err
		}
		if !bytes.Equal(existing.PlanBytes, planBytes) || existing.ProjectID != input.ProjectID || existing.RunID != input.Run.RunID || existing.ProviderID != input.Run.ProviderID || existing.JobID != input.Run.JobID || existing.SessionID != input.Run.SessionID || existing.ProducerID != input.ProducerID || existing.TrustCeiling != input.TrustCeiling || existing.IssuedBy != input.IssuedBy || !existing.ExpiresAt.Equal(canonicalTime(input.ExpiresAt)) {
			return AttemptGrantRecord{}, ErrConflict
		}
		if !canonicalTime(authority.now()).Before(existing.ExpiresAt) {
			return AttemptGrantRecord{}, ErrExpired
		}
		return existing, nil
	}
	if lookupErr != nil {
		return AttemptGrantRecord{}, lookupErr
	}
	return authority.IssueTrustedAttemptGrant(ctx, input)
}
