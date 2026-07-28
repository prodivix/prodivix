package verification

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
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

func (service *Service) CreatePromotion(
	ctx context.Context,
	principalID string,
	workspaceID string,
	idempotencyKey string,
	candidate EvidenceCandidate,
) (CreatePromotionResult, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.write"); err != nil {
		return CreatePromotionResult{}, err
	}
	if idempotencyKey != candidate.Promotion.IdempotencyKey {
		return CreatePromotionResult{}, coded("VER-4002", "Idempotency header does not match the candidate.", ErrInvalid)
	}
	sanitizedCandidate := candidate
	sanitizedCandidate.Promotion.IdempotencyKey = ""
	candidateBytes, err := canonicalBytes(sanitizedCandidate)
	if err != nil {
		return CreatePromotionResult{}, err
	}
	stored, found, err := service.repository.FindPromotionReplay(
		ctx,
		workspaceID,
		principalID,
		secretHash(idempotencyKey),
	)
	if err != nil {
		return CreatePromotionResult{}, err
	}
	if found {
		if !bytes.Equal(stored.CandidateBytes, candidateBytes) {
			return CreatePromotionResult{}, ErrConflict
		}
		return service.createPromotionResult(stored), nil
	}
	stored, found, err = service.repository.FindPromotionByCandidateID(
		ctx,
		workspaceID,
		candidate.CandidateID,
	)
	if err != nil {
		return CreatePromotionResult{}, err
	}
	if found {
		return CreatePromotionResult{}, ErrConflict
	}
	trust, err := service.candidates.Validate(&candidate, workspaceID)
	if err != nil {
		return CreatePromotionResult{}, err
	}
	attemptGrant, err := service.attemptGrants.ResolvePromotionAttempt(
		ctx,
		workspaceID,
		candidate,
		trust,
	)
	if err != nil {
		return CreatePromotionResult{}, err
	}
	verificationPlan, canonicalPlanBytes, err := decodeCanonicalVerificationPlan(
		attemptGrant.CanonicalPlanBytes,
	)
	if err != nil ||
		attemptGrant.Authority != "verification-attempt-grant" ||
		attemptGrant.PlanDigest != candidate.PlanDigest ||
		verificationPlan.PlanDigest != candidate.PlanDigest {
		return CreatePromotionResult{}, attemptGrantFailure(
			"Attempt grant resolution is not canonical or does not match the Candidate.",
		)
	}
	if !bytes.Equal(
		canonicalPlanBytes,
		attemptGrant.CanonicalPlanBytes,
	) {
		return CreatePromotionResult{}, attemptGrantFailure(
			"Attempt grant Plan bytes are not canonical.",
		)
	}
	if err := service.repository.VerifyWorkspaceProject(ctx, workspaceID, candidate.ProjectID); err != nil {
		return CreatePromotionResult{}, err
	}
	now := canonicalTime(service.now())
	deadline, _ := parseInstant(candidate.Promotion.Deadline)
	if deadline.After(now.Add(service.config.PromotionTTL)) {
		return CreatePromotionResult{}, coded("VER-4002", "Promotion deadline exceeds the Backend TTL.", ErrInvalid)
	}
	evidenceID := evidenceIDForCandidate(candidate.CandidateDigest)
	promotionID := promotionIDForCandidate(workspaceID, candidate.CandidateID, candidate.CandidateDigest)
	capability := service.derivePromotionSecret(
		"upload-capability",
		workspaceID,
		promotionID,
		candidate.CandidateDigest,
	)
	promotion := Promotion{
		ID: promotionID, WorkspaceID: workspaceID, ProjectID: candidate.ProjectID,
		Candidate: sanitizedCandidate, CandidateBytes: candidateBytes,
		CandidateDigest: candidate.CandidateDigest, ActorID: principalID, State: "staging",
		VerificationPlan:       verificationPlan,
		VerificationPlanBytes:  canonicalPlanBytes,
		AttemptGrantID:         attemptGrant.GrantID,
		AttemptGrantDigest:     attemptGrant.GrantDigest,
		ProtectReleaseEvidence: attemptGrant.ProtectReleaseEvidence,
		Trust:                  trust, Retention: attemptGrant.Retention, EvidenceID: evidenceID,
		EvidenceCreatedAt: now, CapabilityHash: secretHash(capability),
		Deadline: deadline, Version: 1,
		MaximumClosureEvidenceRecords: attemptGrant.MaximumClosureEvidenceRecords,
	}
	stored, _, err = service.repository.CreatePromotion(ctx, createPromotionInput{
		Promotion: promotion, IdempotencyKeyHash: secretHash(idempotencyKey),
	})
	if err != nil {
		return CreatePromotionResult{}, err
	}
	return service.createPromotionResult(stored), nil
}

func (service *Service) createPromotionResult(
	stored Promotion,
) CreatePromotionResult {
	result := CreatePromotionResult{
		PromotionID: stored.ID, EvidenceID: stored.EvidenceID, State: stored.State,
		CreatedAt: formatInstant(stored.EvidenceCreatedAt),
		Deadline:  formatInstant(stored.Deadline),
	}
	if stored.State == "staging" || stored.State == "verification-pending" {
		result.UploadCapability = service.derivePromotionSecret(
			"upload-capability",
			stored.WorkspaceID,
			stored.ID,
			stored.CandidateDigest,
		)
		if stored.State == "verification-pending" &&
			stored.Statement != nil &&
			stored.StatementDigest != "" {
			result.AttestationNonce = service.derivePromotionSecret(
				"attestation-nonce",
				stored.ID,
				stored.StatementDigest,
			)
			result.AttestationStatement = stored.Statement
			result.AttestationStatementDigest = stored.StatementDigest
		}
	}
	return result
}

func (service *Service) UploadArtifact(
	ctx context.Context,
	principalID string,
	workspaceID string,
	promotionID string,
	artifactID string,
	capability string,
	mediaType string,
	body io.Reader,
) (ArtifactDescriptor, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.write"); err != nil {
		return ArtifactDescriptor{}, err
	}
	promotion, err := service.authorizePromotion(ctx, workspaceID, promotionID, capability)
	if err != nil {
		return ArtifactDescriptor{}, err
	}
	if promotion.State != "staging" || !service.now().Before(promotion.Deadline) {
		return ArtifactDescriptor{}, ErrExpired
	}
	var expected *CandidateArtifact
	for index := range promotion.Candidate.Artifacts {
		if promotion.Candidate.Artifacts[index].ID == artifactID {
			expected = &promotion.Candidate.Artifacts[index]
			break
		}
	}
	if expected == nil {
		return ArtifactDescriptor{}, ErrNotFound
	}
	if mediaType != expected.ExpectedMediaType {
		return ArtifactDescriptor{}, coded("VER-5005", "Artifact Content-Type does not match its candidate descriptor.", ErrArtifactRejected)
	}
	if err := service.artifacts.PreflightForCandidate(&promotion.Candidate, *expected); err != nil {
		_ = service.repository.MarkPromotionFailed(
			context.WithoutCancel(ctx),
			workspaceID,
			promotionID,
			diagnosticCode(err, "VER-5005"),
			service.now(),
		)
		return ArtifactDescriptor{}, err
	}
	stored, err := service.store.PutStaging(ctx, promotion.ID, artifactID, body, expected.ExpectedSize)
	if err != nil {
		if errors.Is(err, ErrArtifactRejected) {
			_ = service.repository.MarkPromotionFailed(
				context.WithoutCancel(ctx),
				workspaceID,
				promotionID,
				diagnosticCode(err, "VER-5005"),
				service.now(),
			)
		}
		return ArtifactDescriptor{}, err
	}
	validated, err := service.artifacts.ValidateForCandidate(
		ctx,
		service.store,
		&promotion.Candidate,
		*expected,
		stored.Locator,
	)
	if err != nil {
		_ = service.store.DeleteStaging(context.WithoutCancel(ctx), stored.Locator)
		if errors.Is(err, ErrArtifactRejected) {
			_ = service.repository.MarkPromotionFailed(
				context.WithoutCancel(ctx),
				workspaceID,
				promotionID,
				diagnosticCode(err, "VER-5005"),
				service.now(),
			)
		}
		return ArtifactDescriptor{}, err
	}
	row, err := service.repository.RecordStagedArtifact(
		ctx, workspaceID, promotionID, artifactID, secretHash(capability),
		stored, mediaType, stored.Locator, service.now(),
	)
	if err != nil {
		return ArtifactDescriptor{}, err
	}
	return ArtifactDescriptor{
		ID: row.Artifact.ID, Path: row.Artifact.Path, Kind: row.Artifact.Kind,
		Digest: row.ObservedDigest, NormalizedDigest: validated.NormalizedDigest,
		SourceTraceDigest: expected.SourceTraceDigest,
		Size:              row.ObservedSize,
		MediaType:         row.ObservedMediaType,
		Availability:      "available",
	}, nil
}

func (service *Service) FinalizePromotion(
	ctx context.Context,
	principalID string,
	workspaceID string,
	promotionID string,
	capability string,
	presentation *AttestationPresentation,
) (EvidenceRecord, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.write"); err != nil {
		return EvidenceRecord{}, err
	}
	promotion, err := service.authorizePromotion(ctx, workspaceID, promotionID, capability)
	if err != nil {
		return EvidenceRecord{}, err
	}
	now := canonicalTime(service.now())
	if promotion.State == "committed" {
		return service.repository.GetEvidenceRecord(ctx, workspaceID, promotion.EvidenceID, now)
	}
	if (promotion.State != "staging" && promotion.State != "verification-pending") ||
		!now.Before(promotion.Deadline) {
		return EvidenceRecord{}, ErrExpired
	}
	attested := promotion.Trust == TrustRemoteAttested || promotion.Trust == TrustCIAttested
	if promotion.State == "staging" && attested && presentation != nil {
		return EvidenceRecord{}, coded(
			"VER-5003",
			"Attestation proof cannot precede the server-bound Evidence statement.",
			ErrAttestationRejected,
		)
	}
	if promotion.State == "verification-pending" && !attested {
		return EvidenceRecord{}, ErrConflict
	}
	if _, err := service.attemptGrants.RevalidatePromotionAttempt(
		ctx,
		promotion,
	); err != nil {
		return EvidenceRecord{}, err
	}
	rows, err := service.repository.ListPromotionArtifacts(ctx, promotion.ID)
	if err != nil {
		return EvidenceRecord{}, err
	}
	if len(rows) != len(promotion.Candidate.Artifacts) {
		return service.replayCommittedOrError(ctx, workspaceID, promotionID, ErrArtifactMissing)
	}
	type pendingArtifactPromotion struct {
		row       PromotionArtifactRow
		validated ValidatedArtifact
		locator   string
	}
	pending := make([]pendingArtifactPromotion, 0, len(rows))
	leaseTargets := make([]ArtifactLeaseTarget, 0, len(rows))
	for _, row := range rows {
		if row.ScanState != "accepted" || row.StagingLocator == "" {
			return service.replayCommittedOrError(ctx, workspaceID, promotionID, ErrArtifactMissing)
		}
		validated, err := service.artifacts.ValidateForCandidate(
			ctx,
			service.store,
			&promotion.Candidate,
			row.Artifact,
			row.StagingLocator,
		)
		if err != nil {
			if errors.Is(err, ErrArtifactMissing) {
				return service.replayCommittedOrError(ctx, workspaceID, promotionID, err)
			}
			if errors.Is(err, ErrArtifactRejected) {
				_ = service.repository.MarkPromotionFailed(
					context.WithoutCancel(ctx),
					workspaceID,
					promotionID,
					diagnosticCode(err, "VER-5005"),
					now,
				)
			}
			return EvidenceRecord{}, err
		}
		locator, err := service.store.DurableLocator(
			workspaceID,
			row.Artifact.ExpectedDigest,
		)
		if err != nil {
			return EvidenceRecord{}, err
		}
		pending = append(pending, pendingArtifactPromotion{
			row: row, validated: validated, locator: locator,
		})
		leaseTargets = append(leaseTargets, ArtifactLeaseTarget{
			WorkspaceID: workspaceID,
			Digest:      row.Artifact.ExpectedDigest,
			Locator:     locator,
		})
	}
	var leases []ArtifactOperationLease
	claimDeadline := time.Now().Add(5 * time.Second)
	for {
		leases, err = service.repository.ClaimArtifactPromotionLeases(
			ctx,
			promotion.ID,
			leaseTargets,
			now,
			promotion.Deadline.Add(service.config.PromotionTTL),
		)
		if err == nil {
			break
		}
		if !errors.Is(err, errArtifactPromotionBusy) {
			return service.replayCommittedOrError(ctx, workspaceID, promotionID, err)
		}
		current, currentErr := service.repository.GetPromotion(ctx, workspaceID, promotionID)
		if currentErr == nil && current.State == "committed" {
			return service.repository.GetEvidenceRecord(
				ctx,
				workspaceID,
				current.EvidenceID,
				canonicalTime(service.now()),
			)
		}
		if time.Now().After(claimDeadline) {
			return EvidenceRecord{}, err
		}
		timer := time.NewTimer(10 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return EvidenceRecord{}, ctx.Err()
		case <-timer.C:
		}
	}
	defer func() {
		_ = service.repository.ReleaseArtifactPromotionLeases(
			context.WithoutCancel(ctx),
			leases,
		)
	}()
	leaseByLocator := make(map[string]ArtifactOperationLease, len(leases))
	for _, lease := range leases {
		leaseByLocator[lease.Locator] = lease
	}
	committed := make([]CommittedArtifact, 0, len(pending))
	for _, item := range pending {
		row := item.row
		durable, err := service.store.Promote(
			ctx, workspaceID, row.Artifact.ExpectedDigest,
			row.Artifact.ExpectedSize, row.StagingLocator,
		)
		if err != nil {
			if errors.Is(err, ErrArtifactMissing) {
				return service.replayCommittedOrError(ctx, workspaceID, promotionID, err)
			}
			return EvidenceRecord{}, err
		}
		lease, exists := leaseByLocator[item.locator]
		if !exists || durable.Locator != item.locator {
			return EvidenceRecord{}, coded(
				"VER-5005",
				"Artifact store returned a locator outside the claimed promotion lease.",
				ErrConflict,
			)
		}
		committed = append(committed, CommittedArtifact{
			Validated: item.validated, Stored: durable, OperationLease: lease,
		})
	}
	statementEvidence := materializeEvidenceBody(
		promotion.Candidate,
		promotion.EvidenceID,
		promotion.EvidenceCreatedAt,
		promotion.Retention,
		manifestArtifactsForCommitted(committed),
		EvidenceProvenance{},
	)
	statement, statementDigest, statementBytes, err := buildEvidenceStatementForEvidence(
		promotion.Candidate,
		statementEvidence,
	)
	if err != nil {
		return EvidenceRecord{}, err
	}
	if attested {
		nonce := service.derivePromotionSecret(
			"attestation-nonce",
			promotion.ID,
			statementDigest,
		)
		if promotion.State == "staging" {
			prepared, err := service.repository.PrepareAttestationChallenge(
				ctx,
				workspaceID,
				promotionID,
				secretHash(capability),
				*statement,
				statementBytes,
				statementDigest,
				secretHash(nonce),
				now,
			)
			if err != nil {
				return service.replayCommittedOrError(ctx, workspaceID, promotionID, err)
			}
			if prepared.State == "committed" {
				return service.repository.GetEvidenceRecord(
					ctx,
					workspaceID,
					prepared.EvidenceID,
					now,
				)
			}
			return EvidenceRecord{}, service.attestationChallenge(prepared, nonce)
		}
		if promotion.Statement == nil ||
			promotion.StatementDigest != statementDigest ||
			!hmac.Equal(promotion.StatementBytes, statementBytes) ||
			promotion.NonceHash != secretHash(nonce) {
			return EvidenceRecord{}, coded(
				"VER-5003",
				"Prepared Evidence statement no longer matches the durable artifact set.",
				ErrAttestationRejected,
			)
		}
		if presentation == nil {
			return EvidenceRecord{}, service.attestationChallenge(promotion, nonce)
		}
	} else {
		promotion.Statement = statement
		promotion.StatementDigest = statementDigest
		promotion.StatementBytes = statementBytes
	}
	verified, err := service.verifyAttestation(ctx, promotion, presentation, now)
	if err != nil {
		return EvidenceRecord{}, err
	}
	evidence, manifestBytes, expiresAt, err := service.buildEvidence(promotion, committed, verified)
	if err != nil {
		return EvidenceRecord{}, err
	}
	if _, err := service.attemptGrants.RevalidatePromotionAttempt(
		ctx,
		promotion,
	); err != nil {
		return EvidenceRecord{}, err
	}
	if err := service.repository.CommitEvidence(ctx, CommitEvidenceInput{
		Promotion: promotion, CapabilityHash: secretHash(capability),
		Evidence: evidence, ManifestBytes: manifestBytes, Artifacts: committed,
		Attestation: verified, ExpiresAt: expiresAt, CommittedAt: now,
	}); err != nil {
		return EvidenceRecord{}, err
	}
	for _, artifact := range committed {
		_ = service.store.DeleteStaging(context.WithoutCancel(ctx), artifact.Validated.StagingLocator)
	}
	return service.repository.GetEvidenceRecord(ctx, workspaceID, evidence.ID, now)
}

func (service *Service) replayCommittedOrError(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	cause error,
) (EvidenceRecord, error) {
	current, err := service.repository.GetPromotion(ctx, workspaceID, promotionID)
	if err == nil && current.State == "committed" {
		return service.repository.GetEvidenceRecord(
			ctx, workspaceID, current.EvidenceID, canonicalTime(service.now()),
		)
	}
	return EvidenceRecord{}, cause
}

func (service *Service) attestationChallenge(
	promotion Promotion,
	nonce string,
) error {
	if promotion.State != "verification-pending" ||
		promotion.Statement == nil ||
		promotion.StatementDigest == "" ||
		nonce == "" {
		return ErrConflict
	}
	statement := *promotion.Statement
	return &AttestationChallengeError{
		Promotion: CreatePromotionResult{
			PromotionID:                promotion.ID,
			EvidenceID:                 promotion.EvidenceID,
			State:                      promotion.State,
			CreatedAt:                  formatInstant(promotion.EvidenceCreatedAt),
			Deadline:                   formatInstant(promotion.Deadline),
			AttestationNonce:           nonce,
			AttestationStatement:       &statement,
			AttestationStatementDigest: promotion.StatementDigest,
		},
	}
}

func (service *Service) verifyAttestation(
	ctx context.Context,
	promotion Promotion,
	presentation *AttestationPresentation,
	now time.Time,
) (*VerifiedAttestation, error) {
	attested := promotion.Trust == TrustRemoteAttested || promotion.Trust == TrustCIAttested
	if !attested {
		if presentation != nil {
			return nil, coded("VER-5003", "Unattested Evidence cannot carry an attestation.", ErrAttestationRejected)
		}
		return nil, nil
	}
	if presentation == nil || service.attestations == nil {
		return nil, coded("VER-5003", "Attested Evidence requires a configured verifier.", ErrAttestationRejected)
	}
	verified, err := service.attestations.Verify(ctx, promotion, *presentation, now)
	if err != nil {
		return nil, err
	}
	return verified, nil
}

func manifestArtifactsForCommitted(
	artifacts []CommittedArtifact,
) []ArtifactManifest {
	manifestArtifacts := make([]ArtifactManifest, 0, len(artifacts))
	for _, artifact := range artifacts {
		manifestArtifacts = append(manifestArtifacts, ArtifactManifest{
			ID:                artifact.Validated.Candidate.ID,
			Path:              artifact.Validated.Candidate.Path,
			Kind:              artifact.Validated.Candidate.Kind,
			Digest:            artifact.Stored.Digest,
			NormalizedDigest:  artifact.Validated.NormalizedDigest,
			SourceTraceDigest: artifact.Validated.Candidate.SourceTraceDigest,
			Size:              artifact.Stored.Size,
			MediaType:         artifact.Validated.Candidate.ExpectedMediaType,
		})
	}
	sort.Slice(manifestArtifacts, func(left, right int) bool {
		if manifestArtifacts[left].ID != manifestArtifacts[right].ID {
			return manifestArtifacts[left].ID < manifestArtifacts[right].ID
		}
		if manifestArtifacts[left].Kind != manifestArtifacts[right].Kind {
			return manifestArtifacts[left].Kind < manifestArtifacts[right].Kind
		}
		return manifestArtifacts[left].Digest < manifestArtifacts[right].Digest
	})
	return manifestArtifacts
}

func (service *Service) buildEvidence(
	promotion Promotion,
	artifacts []CommittedArtifact,
	attestation *VerifiedAttestation,
) (VerificationEvidence, []byte, *time.Time, error) {
	candidate := promotion.Candidate
	manifestArtifacts := manifestArtifactsForCommitted(artifacts)
	provenance := EvidenceProvenance{
		Trust: promotion.Trust, ProducerID: candidate.Provenance.ProducerID,
		IssuedAt: candidate.Provenance.IssuedAt, ExpiresAt: candidate.Provenance.ExpiresAt,
	}
	if attestation != nil {
		provenance.AttestationDigest = attestation.AttestationDigest
		provenance.IssuedAt = formatInstant(attestation.IssuedAt)
		provenance.ExpiresAt = formatInstant(attestation.ExpiresAt)
		if attestation.PersistedClaims.CI != nil {
			value := *attestation.PersistedClaims.CI
			provenance.CI = &value
		}
	}
	evidenceBody := materializeEvidenceBody(
		candidate,
		promotion.EvidenceID,
		promotion.EvidenceCreatedAt,
		promotion.Retention,
		manifestArtifacts,
		provenance,
	)
	persistedProvenance := PersistedProvenance{
		Kind: "unattested", Trust: promotion.Trust,
		ProducerID: candidate.Provenance.ProducerID,
		IssuedAt:   candidate.Provenance.IssuedAt, ExpiresAt: candidate.Provenance.ExpiresAt,
	}
	if attestation != nil {
		persistedProvenance = PersistedProvenance{
			Kind: "attested", Claims: &attestation.PersistedClaims,
		}
	}
	if promotion.Statement == nil {
		return VerificationEvidence{}, nil, nil, ErrConflict
	}
	statementDigest, statementBytes, err := evidenceStatementDigest(*promotion.Statement)
	if err != nil || statementDigest != promotion.StatementDigest ||
		string(statementBytes) != string(promotion.StatementBytes) {
		return VerificationEvidence{}, nil, nil, ErrConflict
	}
	manifest := VerificationEvidenceManifest{
		Format:          "prodivix.verification-evidence-manifest",
		CandidateDigest: promotion.CandidateDigest, Statement: *promotion.Statement,
		StatementDigest: promotion.StatementDigest, VerifiedProvenance: persistedProvenance,
		Evidence: evidenceBody,
	}
	manifestDigest, _, err := digestWithoutField(manifest, "manifestDigest")
	if err != nil {
		return VerificationEvidence{}, nil, nil, err
	}
	manifest.ManifestDigest = manifestDigest
	evidence, err := projectEvidenceManifest(manifest)
	if err != nil {
		return VerificationEvidence{}, nil, nil, err
	}
	manifestBytes, err := canonicalBytes(manifest)
	if err != nil {
		return VerificationEvidence{}, nil, nil, err
	}
	var expiresAt *time.Time
	if promotion.Retention == RetentionSession {
		value := promotion.EvidenceCreatedAt.Add(service.config.SessionRetention).UTC()
		expiresAt = &value
	}
	return evidence, manifestBytes, expiresAt, nil
}

func (service *Service) ListEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	filter ListFilter,
) (EvidencePage, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return EvidencePage{}, err
	}
	return service.repository.ListEvidence(ctx, workspaceID, filter, service.now())
}

func (service *Service) GetEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	evidenceID string,
) (EvidenceRecord, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return EvidenceRecord{}, err
	}
	return service.repository.GetEvidenceRecord(ctx, workspaceID, evidenceID, service.now())
}

func (service *Service) ResolveArtifact(
	ctx context.Context,
	principalID string,
	workspaceID string,
	evidenceID string,
	artifactID string,
) (ArtifactContent, io.ReadCloser, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return ArtifactContent{}, nil, err
	}
	content, err := service.repository.ResolveArtifactContent(ctx, workspaceID, evidenceID, artifactID)
	if err != nil {
		return ArtifactContent{}, nil, err
	}
	reader, err := service.store.OpenDurable(ctx, content.Locator)
	if err != nil {
		return ArtifactContent{}, nil, err
	}
	return content, reader, nil
}

func (service *Service) CompareEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	leftID string,
	rightID string,
) (ComparisonDescriptor, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return ComparisonDescriptor{}, err
	}
	left, err := service.repository.GetEvidenceRecord(ctx, workspaceID, leftID, service.now())
	if err != nil {
		return ComparisonDescriptor{}, err
	}
	right, err := service.repository.GetEvidenceRecord(ctx, workspaceID, rightID, service.now())
	if err != nil {
		return ComparisonDescriptor{}, err
	}
	comparison, err := service.targetPolicies.ResolveComparisonPolicy(ctx, workspaceID)
	if err != nil {
		return ComparisonDescriptor{}, err
	}
	if err := validateTargetPolicyComparison(comparison); err != nil {
		return ComparisonDescriptor{}, err
	}
	policy := comparison.ComparisonPolicy()
	return compareEvidence(left.Evidence, right.Evidence, &policy)
}

func (service *Service) ClosureView(
	ctx context.Context,
	principalID string,
	workspaceID string,
	filter ListFilter,
) (ClosureView, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return ClosureView{}, err
	}
	observedAt := canonicalTime(service.now())
	return service.repository.ClosureView(ctx, workspaceID, filter, observedAt)
}

func (service *Service) authorizePromotion(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	capability string,
) (Promotion, error) {
	if len(capability) < 32 || len(capability) > 512 {
		return Promotion{}, ErrUnauthorized
	}
	promotion, err := service.repository.GetPromotion(ctx, workspaceID, promotionID)
	if err != nil {
		return Promotion{}, err
	}
	expected := []byte(promotion.CapabilityHash)
	actual := []byte(secretHash(capability))
	if len(expected) != len(actual) || subtle.ConstantTimeCompare(expected, actual) != 1 {
		return Promotion{}, ErrUnauthorized
	}
	return promotion, nil
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

func randomToken(source io.Reader, byteLength int) (string, error) {
	buffer := make([]byte, byteLength)
	if _, err := io.ReadFull(source, buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func (service *Service) derivePromotionSecret(
	purpose string,
	parts ...string,
) string {
	mac := hmac.New(sha256.New, service.resumeKey)
	_, _ = mac.Write([]byte("prodivix.verification.resume.v1"))
	_, _ = mac.Write([]byte{0})
	_, _ = mac.Write([]byte(purpose))
	for _, part := range parts {
		_, _ = mac.Write([]byte{0})
		_, _ = mac.Write([]byte(part))
	}
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func evidenceIDForCandidate(candidateDigest string) string {
	return "evidence-" + strings.TrimPrefix(candidateDigest, "sha256-")[:40]
}

func promotionIDForCandidate(workspaceID string, candidateID string, candidateDigest string) string {
	value := digestBytes([]byte(workspaceID + "\x00" + candidateID + "\x00" + candidateDigest))
	return "promotion-" + strings.TrimPrefix(value, "sha256-")[:40]
}

func compareEvidence(
	left VerificationEvidence,
	right VerificationEvidence,
	policy *ComparisonPolicy,
) (ComparisonDescriptor, error) {
	mismatches := make([]string, 0)
	add := func(name string, leftValue any, rightValue any) {
		leftBytes, _ := canonicalBytes(leftValue)
		rightBytes, _ := canonicalBytes(rightValue)
		if string(leftBytes) != string(rightBytes) {
			mismatches = append(mismatches, name)
		}
	}
	add("project-id", left.ProjectID, right.ProjectID)
	add("workspace-id", left.WorkspaceID, right.WorkspaceID)
	add("workspace-revision", left.WorkspaceRevision, right.WorkspaceRevision)
	add("partition-revisions", left.PartitionRevisions, right.PartitionRevisions)
	add("executable-snapshot", left.ExecutableSnapshotDigest, right.ExecutableSnapshotDigest)
	add("scenario-id", scenarioField(left.Scenario, "id"), scenarioField(right.Scenario, "id"))
	add("scenario-revision", scenarioField(left.Scenario, "revision"), scenarioField(right.Scenario, "revision"))
	add("scenario-digest", scenarioField(left.Scenario, "digest"), scenarioField(right.Scenario, "digest"))
	add("scenario-program", scenarioField(left.Scenario, "program"), scenarioField(right.Scenario, "program"))
	add("policy-revision", left.PolicyRevision, right.PolicyRevision)
	add("policy-digest", left.PolicyDigest, right.PolicyDigest)
	add("impact-digest", left.ImpactDigest, right.ImpactDigest)
	add("plan-digest", left.PlanDigest, right.PlanDigest)
	add("cell-id", left.CellID, right.CellID)
	add("check-id", left.CheckID, right.CheckID)
	add("check-kind", left.CheckKind, right.CheckKind)
	add("target-id", left.TargetID, right.TargetID)
	add("surface", left.Run.Surface, right.Run.Surface)
	add("framework-target", left.Run.FrameworkTarget, right.Run.FrameworkTarget)
	add("runtime-zone", left.Run.RuntimeZone, right.Run.RuntimeZone)
	add("browser-engine", left.Run.BrowserEngine, right.Run.BrowserEngine)
	add("operating-system", left.Run.OperatingSystemIdentity, right.Run.OperatingSystemIdentity)
	add("viewport", left.Run.Viewport, right.Run.Viewport)
	add("device-pixel-ratio", left.Run.DevicePixelRatio, right.Run.DevicePixelRatio)
	add("color-scheme", left.Run.ColorScheme, right.Run.ColorScheme)
	add("motion", left.Run.Motion, right.Run.Motion)
	add("locale", left.Run.Locale, right.Run.Locale)
	add("timezone", left.Run.Timezone, right.Run.Timezone)
	add("font-set", left.Run.FontSetDigest, right.Run.FontSetDigest)
	add("sandbox-image", left.Run.SandboxImageDigest, right.Run.SandboxImageDigest)
	add("tool-package", left.Toolchain.PackageName, right.Toolchain.PackageName)
	add("tool-version", left.Toolchain.PackageVersion, right.Toolchain.PackageVersion)
	add("tool-major", packageMajor(left.Toolchain.PackageVersion), packageMajor(right.Toolchain.PackageVersion))
	add("tool-build", left.Toolchain.BuildDigest, right.Toolchain.BuildDigest)
	add("toolchain", left.Toolchain.ToolchainDigest, right.Toolchain.ToolchainDigest)
	add("adapter-schema", left.Toolchain.SchemaDigest, right.Toolchain.SchemaDigest)
	add("normalization-package", left.Normalization.PackageName, right.Normalization.PackageName)
	add("normalization-version", left.Normalization.PackageVersion, right.Normalization.PackageVersion)
	add("normalization-build", left.Normalization.BuildDigest, right.Normalization.BuildDigest)
	add("normalization-toolchain", left.Normalization.ToolchainDigest, right.Normalization.ToolchainDigest)
	add("normalization-schema", left.Normalization.SchemaDigest, right.Normalization.SchemaDigest)
	add("control-profile", left.Controls.ProfileDigest, right.Controls.ProfileDigest)
	add("applied-controls", left.Controls.AppliedDigest, right.Controls.AppliedDigest)
	add("fixture-set", left.Inputs.FixtureSetDigests, right.Inputs.FixtureSetDigests)
	add("baseline-set", left.Inputs.BaselineSetDigest, right.Inputs.BaselineSetDigest)
	add("input-digest", left.Inputs.InputDigest, right.Inputs.InputDigest)
	add("dependency-lock", left.DependencyLockDigest, right.DependencyLockDigest)
	add("redaction-policy", left.RedactionPolicyID, right.RedactionPolicyID)
	add("target-policy", left.TargetPolicy, right.TargetPolicy)
	sort.Strings(mismatches)
	incompatible := map[string]struct{}{
		"project-id": {}, "workspace-id": {}, "scenario-id": {},
		"scenario-digest": {}, "scenario-program": {}, "check-id": {},
		"check-kind": {}, "target-id": {},
	}
	allowed := map[string]struct{}{}
	var normalizedPolicy *ComparisonPolicy
	if policy != nil {
		if validateCanonicalText(policy.ID, "comparison policy id", 512) != nil ||
			!digestPattern.MatchString(policy.Digest) {
			return ComparisonDescriptor{}, ErrInvalid
		}
		fields, err := sortedUnique(policy.AllowedMismatchFields)
		if err != nil {
			return ComparisonDescriptor{}, ErrInvalid
		}
		validFields := map[string]struct{}{}
		for _, field := range comparisonFields() {
			validFields[field] = struct{}{}
		}
		for _, field := range fields {
			if _, valid := validFields[field]; !valid {
				return ComparisonDescriptor{}, ErrInvalid
			}
			if _, unsafe := incompatible[field]; unsafe {
				return ComparisonDescriptor{}, ErrInvalid
			}
			allowed[field] = struct{}{}
		}
		normalizedPolicy = &ComparisonPolicy{
			ID: policy.ID, Digest: policy.Digest, AllowedMismatchFields: fields,
		}
	}
	compatibility := "exact-compatible"
	if len(mismatches) > 0 {
		compatibility = "view-only"
	}
	for _, field := range mismatches {
		if _, hard := incompatible[field]; hard {
			compatibility = "incompatible"
			break
		}
	}
	if compatibility == "view-only" && normalizedPolicy != nil {
		accepted := true
		for _, field := range mismatches {
			if _, exists := allowed[field]; !exists {
				accepted = false
				break
			}
		}
		if accepted {
			compatibility = "policy-compatible"
		}
	}
	evidenceDigests := []string{left.ManifestDigest, right.ManifestDigest}
	sort.Strings(evidenceDigests)
	digestInput := struct {
		Compatibility         string    `json:"compatibility"`
		EvidenceDigests       []string  `json:"evidenceDigests"`
		MismatchFields        []string  `json:"mismatchFields"`
		PolicyID              string    `json:"policyId,omitempty"`
		PolicyDigest          string    `json:"policyDigest,omitempty"`
		AllowedMismatchFields *[]string `json:"allowedMismatchFields,omitempty"`
	}{
		Compatibility: compatibility, EvidenceDigests: evidenceDigests,
		MismatchFields: mismatches,
	}
	result := ComparisonDescriptor{
		Compatibility: compatibility, LeftEvidenceID: left.ID,
		RightEvidenceID: right.ID, MismatchFields: mismatches,
	}
	if normalizedPolicy != nil {
		result.PolicyID, result.PolicyDigest = normalizedPolicy.ID, normalizedPolicy.Digest
		digestInput.PolicyID, digestInput.PolicyDigest = normalizedPolicy.ID, normalizedPolicy.Digest
		digestInput.AllowedMismatchFields = &normalizedPolicy.AllowedMismatchFields
	}
	comparisonDigest, _, err := canonicalDigest(digestInput)
	if err != nil {
		return ComparisonDescriptor{}, err
	}
	result.ComparisonDigest = comparisonDigest
	return result, nil
}

func comparisonFields() []string {
	return []string{
		"adapter-schema", "applied-controls", "baseline-set", "browser-engine",
		"cell-id", "check-id", "check-kind", "color-scheme", "control-profile",
		"dependency-lock", "device-pixel-ratio", "executable-snapshot", "fixture-set",
		"font-set", "framework-target", "impact-digest", "input-digest", "locale",
		"motion", "normalization-build", "normalization-package", "normalization-schema",
		"normalization-toolchain", "normalization-version", "operating-system",
		"partition-revisions", "plan-digest", "policy-digest", "policy-revision",
		"project-id", "redaction-policy", "runtime-zone", "sandbox-image",
		"scenario-digest", "scenario-id", "scenario-program", "scenario-revision",
		"surface", "target-id", "target-policy", "timezone", "tool-build",
		"tool-major", "tool-package", "tool-version", "toolchain", "viewport",
		"workspace-id", "workspace-revision",
	}
}

func scenarioField(scenario *ScenarioIdentity, field string) any {
	if scenario == nil {
		return nil
	}
	switch field {
	case "id":
		return scenario.ID
	case "revision":
		return scenario.Revision
	case "digest":
		return scenario.Digest
	default:
		return scenario.ProgramDigest
	}
}

func packageMajor(value string) string {
	value = strings.TrimPrefix(strings.TrimSpace(value), "v")
	major := strings.SplitN(value, ".", 2)[0]
	if _, err := strconv.ParseUint(major, 10, 64); err != nil {
		return ""
	}
	return major
}

func parsePositiveInt64(value string) (int64, error) {
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || !validRevision(parsed) {
		return 0, fmt.Errorf("invalid revision")
	}
	return parsed, nil
}
