package verification

import (
	"context"
	"crypto/hmac"
	"errors"
	"sort"
	"time"
)

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
