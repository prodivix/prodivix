package verification

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"io"
	"strings"
)

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
	return service.createPromotion(ctx, principalID, workspaceID, idempotencyKey, candidate)
}

// createPromotion is the canonical promotion implementation shared by the
// authenticated user surface and the purpose-bound agent-evaluation owner.
// Callers must establish their authority before entering this method.
func (service *Service) createPromotion(
	ctx context.Context,
	principalID string,
	workspaceID string,
	idempotencyKey string,
	candidate EvidenceCandidate,
) (CreatePromotionResult, error) {
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
	return service.uploadArtifact(
		ctx, workspaceID, promotionID, artifactID, capability, mediaType, body,
	)
}

// uploadArtifact is entered only after a user permission check or a successful
// purpose-bound service credential check.
func (service *Service) uploadArtifact(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	artifactID string,
	capability string,
	mediaType string,
	body io.Reader,
) (ArtifactDescriptor, error) {
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
