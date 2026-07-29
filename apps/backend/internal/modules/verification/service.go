package verification

import (
	"context"
	"errors"
	"time"
)

type WorkspacePermissionResolver interface {
	ResolveWorkspaceExecutionPermissions(ctx context.Context, principalID string, workspaceID string) ([]string, error)
}

type ServiceConfig struct {
	PromotionTTL            time.Duration
	SessionRetention        time.Duration
	TombstoneGrace          time.Duration
	AttestationMaxLifetime  time.Duration
	RetentionSweepInterval  time.Duration
	RetentionSweepBatchSize int
	ResumeKey               []byte
}

type Service struct {
	repository     *Repository
	store          ArtifactObjectStore
	permissions    WorkspacePermissionResolver
	targetPolicies TargetPolicyAuthority
	attemptGrants  AttemptGrantAuthority
	candidates     *CandidateValidator
	artifacts      *ArtifactValidator
	attestations   AttestationVerifier
	config         ServiceConfig
	resumeKey      []byte
	now            func() time.Time
}

func NewService(
	repository *Repository,
	store ArtifactObjectStore,
	permissions WorkspacePermissionResolver,
	targetPolicies TargetPolicyAuthority,
	attemptGrants AttemptGrantAuthority,
	candidateValidator *CandidateValidator,
	attestationVerifier AttestationVerifier,
	config ServiceConfig,
) (*Service, error) {
	if repository == nil || repository.db == nil || store == nil || permissions == nil ||
		targetPolicies == nil ||
		attemptGrants == nil ||
		candidateValidator == nil || config.PromotionTTL <= 0 ||
		config.SessionRetention <= 0 || config.TombstoneGrace < 0 ||
		config.RetentionSweepInterval <= 0 || config.RetentionSweepBatchSize <= 0 ||
		config.RetentionSweepBatchSize > 1000 || len(config.ResumeKey) != 32 {
		return nil, errors.New("verification service configuration is invalid")
	}
	return &Service{
		repository: repository, store: store, permissions: permissions,
		targetPolicies: targetPolicies,
		attemptGrants:  attemptGrants,
		candidates:     candidateValidator, artifacts: NewArtifactValidator(candidateValidator),
		attestations: attestationVerifier, config: config,
		resumeKey: append([]byte(nil), config.ResumeKey...),
		now:       func() time.Time { return time.Now().UTC() },
	}, nil
}

func (service *Service) requirePermission(
	ctx context.Context,
	principalID string,
	workspaceID string,
	required string,
) error {
	if validateIdentifier(principalID, "principal id") != nil ||
		validateIdentifier(workspaceID, "workspace id") != nil {
		return ErrUnauthorized
	}
	permissions, err := service.permissions.ResolveWorkspaceExecutionPermissions(ctx, principalID, workspaceID)
	if err != nil {
		return ErrUnauthorized
	}
	for _, permission := range permissions {
		if permission == required {
			return nil
		}
	}
	return ErrUnauthorized
}
