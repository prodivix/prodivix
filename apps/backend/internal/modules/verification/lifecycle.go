package verification

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"
)

func (service *Service) SupersedeEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	oldEvidenceID string,
	newEvidenceID string,
	reason string,
	idempotencyKey string,
	expectedOldEvidenceState string,
	expectedNewEvidenceState string,
	expectedSupersessionState string,
) (bool, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.write"); err != nil {
		return false, err
	}
	if err := service.rejectSensitiveLifecycleText(reason); err != nil {
		return false, err
	}
	if validateMutationToken(idempotencyKey) != nil ||
		expectedOldEvidenceState != "active" ||
		expectedNewEvidenceState != "active" ||
		expectedSupersessionState != "none" {
		return false, ErrPreconditionRequired
	}
	return service.repository.SupersedeEvidence(
		ctx, workspaceID, oldEvidenceID, newEvidenceID, reason, principalID, service.now(),
		idempotencyKey, expectedOldEvidenceState, expectedNewEvidenceState,
		expectedSupersessionState,
	)
}

func (service *Service) ProtectEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	evidenceID string,
	kind string,
	externalRef string,
	idempotencyKey string,
	expectedEvidenceState string,
	expectedProtectionState string,
) (RetentionProtection, bool, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.owner"); err != nil {
		return RetentionProtection{}, false, err
	}
	if err := service.rejectSensitiveLifecycleText(externalRef); err != nil {
		return RetentionProtection{}, false, err
	}
	if err := validateRetentionProtectionExternalRef(externalRef); err != nil {
		return RetentionProtection{}, false, coded(
			diagnosticCode(err, "VER-5001"),
			"Retention external reference is invalid or unsafe.",
			ErrInvalid,
		)
	}
	if validateMutationToken(idempotencyKey) != nil ||
		expectedEvidenceState != "active" ||
		expectedProtectionState != "absent" {
		return RetentionProtection{}, false, ErrPreconditionRequired
	}
	return service.repository.ProtectEvidence(
		ctx, workspaceID, evidenceID, kind, externalRef, principalID, service.now(),
		idempotencyKey, expectedEvidenceState, expectedProtectionState,
	)
}

func (service *Service) ReleaseProtection(
	ctx context.Context,
	principalID string,
	workspaceID string,
	evidenceID string,
	protectionID string,
	kind string,
	externalRef string,
	expectedVersion int64,
	idempotencyKey string,
	expectedProtectionState string,
) (RetentionProtection, bool, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.owner"); err != nil {
		return RetentionProtection{}, false, err
	}
	if err := service.rejectSensitiveLifecycleText(externalRef); err != nil {
		return RetentionProtection{}, false, err
	}
	if err := validateRetentionProtectionExternalRef(externalRef); err != nil {
		return RetentionProtection{}, false, coded(
			diagnosticCode(err, "VER-5001"),
			"Retention external reference is invalid or unsafe.",
			ErrInvalid,
		)
	}
	if validateMutationToken(idempotencyKey) != nil ||
		expectedProtectionState != "active" || expectedVersion < 1 {
		return RetentionProtection{}, false, ErrPreconditionRequired
	}
	return service.repository.ReleaseProtection(
		ctx, workspaceID, evidenceID, protectionID, kind, externalRef,
		expectedVersion, principalID, service.now(), idempotencyKey,
		expectedProtectionState,
	)
}

func (service *Service) TombstoneEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	evidenceID string,
	reason string,
	idempotencyKey string,
	expectedState string,
) (bool, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.owner"); err != nil {
		return false, err
	}
	if err := service.rejectSensitiveLifecycleText(reason); err != nil {
		return false, err
	}
	if validateMutationToken(idempotencyKey) != nil || expectedState != "active" {
		return false, ErrPreconditionRequired
	}
	return service.repository.TombstoneEvidence(
		ctx, workspaceID, evidenceID, reason, principalID, service.now(),
		service.config.TombstoneGrace, idempotencyKey, expectedState,
	)
}

func (service *Service) CreateRevocation(
	ctx context.Context,
	principalID string,
	workspaceID string,
	input RevocationInput,
	idempotencyKey string,
	expectedScopeState string,
) (string, bool, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.owner"); err != nil {
		return "", false, err
	}
	if err := service.rejectSensitiveLifecycleText(
		input.Issuer,
		input.KeyID,
		input.ReasonCode,
		input.Reason,
	); err != nil {
		return "", false, err
	}
	if validateMutationToken(idempotencyKey) != nil || expectedScopeState != "unrevoked" {
		return "", false, ErrPreconditionRequired
	}
	return service.repository.CreateRevocation(
		ctx, workspaceID, input, principalID, service.now(),
		idempotencyKey, expectedScopeState,
	)
}

func (service *Service) rejectSensitiveLifecycleText(values ...string) error {
	if service == nil || service.candidates == nil {
		return coded("VER-5002", "Lifecycle text could not be screened safely.", ErrInvalid)
	}
	for _, value := range values {
		if service.candidates.containsSensitiveText([]byte(value)) {
			return coded(
				"VER-5002",
				"Lifecycle text contains Secret, credential, or PII material.",
				ErrInvalid,
			)
		}
	}
	return nil
}

func (service *Service) SweepRetention(ctx context.Context) (RetentionSweepResult, error) {
	work, err := service.repository.SweepRetention(ctx, RetentionSweepPolicy{
		ObservedAt: service.now(), TombstoneGrace: service.config.TombstoneGrace,
		PromotionTTL: service.config.PromotionTTL,
		BatchSize:    service.config.RetentionSweepBatchSize,
	})
	if err != nil {
		return RetentionSweepResult{}, err
	}
	var deletionErrors []error
	for _, locator := range work.StagingLocators {
		if err := service.store.DeleteStaging(context.WithoutCancel(ctx), locator); err != nil {
			deletionErrors = append(deletionErrors, err)
		}
	}
	for _, lease := range work.ArtifactDeletionLeases {
		confirmed, err := service.repository.ConfirmArtifactDeletionLease(ctx, lease)
		if err != nil {
			deletionErrors = append(deletionErrors, err)
			continue
		}
		if !confirmed {
			continue
		}
		if service.repository.artifactDeletionLeaseBarrier != nil {
			service.repository.artifactDeletionLeaseBarrier(lease)
		}
		if err := service.store.DeleteDurable(
			context.WithoutCancel(ctx),
			lease.Locator,
		); err != nil {
			deletionErrors = append(deletionErrors, err)
			continue
		}
		completed, err := service.repository.CompleteArtifactDeletionLease(ctx, lease)
		if err != nil {
			deletionErrors = append(deletionErrors, err)
			continue
		}
		if !completed {
			deletionErrors = append(
				deletionErrors,
				coded(
					"VER-5005",
					"Artifact deletion lease changed before completion.",
					ErrConflict,
				),
			)
			continue
		}
		work.Result.DeletedArtifacts++
	}
	recovered, reconcileErr := service.reconcileArtifactOrphans(ctx)
	work.Result.RecoveredOrphans += recovered
	if reconcileErr != nil {
		deletionErrors = append(deletionErrors, reconcileErr)
	}
	return work.Result, errors.Join(deletionErrors...)
}

func (service *Service) reconcileArtifactOrphans(ctx context.Context) (int, error) {
	cutoff := canonicalTime(service.now()).Add(-service.config.PromotionTTL)
	limit := service.config.RetentionSweepBatchSize
	var failures []error
	recovered := 0
	reconcileStaging := func(objects []StoredObjectInfo) {
		for _, object := range objects {
			referenced, err := service.repository.LocatorReferenced(ctx, object.Locator, false)
			if err != nil {
				failures = append(failures, err)
				continue
			}
			if referenced {
				continue
			}
			err = service.store.DeleteStaging(context.WithoutCancel(ctx), object.Locator)
			if err != nil {
				failures = append(failures, err)
			} else {
				recovered++
			}
		}
	}
	staging, err := service.store.ListStaging(ctx, cutoff, limit)
	if err != nil {
		failures = append(failures, err)
	} else {
		reconcileStaging(staging)
	}
	durable, err := service.store.ListDurable(ctx, cutoff, limit)
	if err != nil {
		failures = append(failures, err)
	} else {
		for _, object := range durable {
			lease, claimed, err := service.repository.ClaimOrphanArtifactDeletionLease(
				ctx,
				object.Locator,
				service.now(),
			)
			if err != nil {
				failures = append(failures, err)
				continue
			}
			if !claimed {
				continue
			}
			confirmed, err := service.repository.ConfirmArtifactDeletionLease(ctx, lease)
			if err != nil {
				failures = append(failures, err)
				continue
			}
			if !confirmed {
				continue
			}
			if service.repository.artifactDeletionLeaseBarrier != nil {
				service.repository.artifactDeletionLeaseBarrier(lease)
			}
			if err := service.store.DeleteDurable(
				context.WithoutCancel(ctx),
				object.Locator,
			); err != nil {
				failures = append(failures, err)
				continue
			}
			completed, err := service.repository.CompleteArtifactDeletionLease(ctx, lease)
			if err != nil {
				failures = append(failures, err)
				continue
			}
			if !completed {
				failures = append(failures, coded(
					"VER-5005",
					"Orphan artifact deletion lease changed before completion.",
					ErrConflict,
				))
				continue
			}
			recovered++
		}
	}
	cleaned, err := service.store.CleanupTemporary(ctx, cutoff, limit)
	if err != nil {
		failures = append(failures, err)
	} else {
		recovered += cleaned
	}
	return recovered, errors.Join(failures...)
}

type Maintenance struct {
	service *Service
	config  ServiceConfig
	now     func() time.Time
	logf    func(format string, args ...any)

	mutex   sync.Mutex
	started bool
	cancel  context.CancelFunc
	done    chan struct{}
}

func NewMaintenance(service *Service, config ServiceConfig) *Maintenance {
	return &Maintenance{
		service: service, config: config, now: func() time.Time { return time.Now().UTC() },
		logf: log.Printf,
	}
}

func (maintenance *Maintenance) Start(parent context.Context) {
	if maintenance == nil || maintenance.service == nil {
		return
	}
	if parent == nil {
		parent = context.Background()
	}
	maintenance.mutex.Lock()
	if maintenance.started {
		maintenance.mutex.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parent)
	maintenance.started = true
	maintenance.cancel = cancel
	maintenance.done = make(chan struct{})
	done := maintenance.done
	maintenance.mutex.Unlock()
	go maintenance.run(ctx, done)
}

func (maintenance *Maintenance) Close() {
	if maintenance == nil {
		return
	}
	maintenance.mutex.Lock()
	if !maintenance.started {
		maintenance.mutex.Unlock()
		return
	}
	cancel, done := maintenance.cancel, maintenance.done
	maintenance.mutex.Unlock()
	cancel()
	<-done
}

func (maintenance *Maintenance) run(ctx context.Context, done chan struct{}) {
	defer close(done)
	maintenance.sweep(ctx)
	ticker := time.NewTicker(maintenance.config.RetentionSweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			maintenance.sweep(ctx)
		}
	}
}

func (maintenance *Maintenance) sweep(ctx context.Context) {
	result, err := maintenance.service.SweepRetention(ctx)
	if err != nil {
		if ctx.Err() == nil {
			maintenance.logf("verification retention sweep failed: %v", err)
		}
		return
	}
	if result.ExpiredPromotions == 0 && result.TombstonedEvidence == 0 &&
		result.ReleasedReferences == 0 && result.DeletedArtifacts == 0 &&
		result.RecoveredOrphans == 0 {
		return
	}
	maintenance.logf(
		"verification retention sweep: promotions=%d tombstones=%d references=%d artifacts=%d orphans=%d",
		result.ExpiredPromotions, result.TombstonedEvidence,
		result.ReleasedReferences, result.DeletedArtifacts, result.RecoveredOrphans,
	)
}
