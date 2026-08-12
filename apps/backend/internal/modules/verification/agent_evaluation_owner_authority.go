package verification

import (
	"context"
	"errors"
	"io"
)

const (
	AgentEvaluationOwnerAuthorityPurpose = "agent-evaluation-verification-owner"

	agentEvaluationOwnerPrincipalID    = "agent-evaluation-verification-owner.v1"
	agentEvaluationOwnerRequestFormat  = "prodivix.verification-agent-evaluation-owner-request"
	agentEvaluationOwnerResponseFormat = "prodivix.verification-agent-evaluation-owner-response"
	agentEvaluationOwnerHealthFormat   = "prodivix.verification-agent-evaluation-owner-health"
	agentEvaluationOwnerWireVersion    = 1

	maximumAgentEvaluationOwnerRequestBytes  = 2 * 1024 * 1024
	maximumAgentEvaluationOwnerResponseBytes = 32 * 1024 * 1024
)

type AgentEvaluationOwnerAuthorityConfig struct {
	Token string
}

type agentEvaluationOwnerService interface {
	CreatePromotion(
		context.Context,
		string,
		string,
		EvidenceCandidate,
	) (CreatePromotionResult, error)
	UploadArtifact(
		context.Context,
		string,
		string,
		string,
		string,
		string,
		io.Reader,
	) (ArtifactDescriptor, error)
	PreparePromotion(
		context.Context,
		string,
		string,
		string,
	) (CreatePromotionResult, error)
	FinalCommitPromotion(
		context.Context,
		string,
		string,
		string,
		AttestationPresentation,
	) (VerificationEvidenceManifest, error)
	ResolveExactVerifiedView(
		context.Context,
		string,
		[]string,
	) (agentEvaluationExactVerifiedViewSnapshot, error)
}

type canonicalAgentEvaluationOwnerService struct {
	service *Service
}

func (owner canonicalAgentEvaluationOwnerService) CreatePromotion(
	ctx context.Context,
	workspaceID string,
	idempotencyKey string,
	candidate EvidenceCandidate,
) (CreatePromotionResult, error) {
	return owner.service.createPromotion(
		ctx,
		agentEvaluationOwnerPrincipalID,
		workspaceID,
		idempotencyKey,
		candidate,
	)
}

func (owner canonicalAgentEvaluationOwnerService) UploadArtifact(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	artifactID string,
	capability string,
	mediaType string,
	body io.Reader,
) (ArtifactDescriptor, error) {
	return owner.service.uploadArtifact(
		ctx, workspaceID, promotionID, artifactID, capability, mediaType, body,
	)
}

func (owner canonicalAgentEvaluationOwnerService) PreparePromotion(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	capability string,
) (CreatePromotionResult, error) {
	_, err := owner.service.finalizePromotion(
		ctx, workspaceID, promotionID, capability, nil,
	)
	var challenge *AttestationChallengeError
	if !errors.As(err, &challenge) || challenge == nil ||
		challenge.Promotion.State != "verification-pending" ||
		challenge.Promotion.PromotionID != promotionID ||
		challenge.Promotion.AttestationNonce == "" ||
		challenge.Promotion.AttestationStatement == nil ||
		!digestPattern.MatchString(challenge.Promotion.AttestationStatementDigest) {
		if err != nil {
			return CreatePromotionResult{}, err
		}
		return CreatePromotionResult{}, ErrConflict
	}
	return challenge.Promotion, nil
}

func (owner canonicalAgentEvaluationOwnerService) FinalCommitPromotion(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	capability string,
	presentation AttestationPresentation,
) (VerificationEvidenceManifest, error) {
	record, err := owner.service.finalizePromotion(
		ctx, workspaceID, promotionID, capability, &presentation,
	)
	if err != nil {
		return VerificationEvidenceManifest{}, err
	}
	manifest, err := owner.service.repository.GetEvidenceManifest(
		ctx, workspaceID, record.Evidence.ID,
	)
	if err != nil {
		return VerificationEvidenceManifest{}, err
	}
	if manifest.Evidence.ID != record.Evidence.ID ||
		manifest.ManifestDigest != record.Evidence.ManifestDigest {
		return VerificationEvidenceManifest{}, ErrConflict
	}
	return manifest, nil
}

func (owner canonicalAgentEvaluationOwnerService) ResolveExactVerifiedView(
	ctx context.Context,
	workspaceID string,
	evidenceIDs []string,
) (agentEvaluationExactVerifiedViewSnapshot, error) {
	return owner.service.repository.AgentEvaluationExactVerifiedView(
		ctx,
		workspaceID,
		evidenceIDs,
		canonicalTime(owner.service.now()),
	)
}

type agentEvaluationOwnerCreateRequest struct {
	Format         string            `json:"format"`
	Version        int               `json:"version"`
	Purpose        string            `json:"purpose"`
	Operation      string            `json:"operation"`
	WorkspaceID    string            `json:"workspaceId"`
	IdempotencyKey string            `json:"idempotencyKey"`
	Candidate      EvidenceCandidate `json:"candidate"`
	RequestDigest  string            `json:"requestDigest"`
}

type agentEvaluationOwnerPromotionRequest struct {
	Format           string                   `json:"format"`
	Version          int                      `json:"version"`
	Purpose          string                   `json:"purpose"`
	Operation        string                   `json:"operation"`
	WorkspaceID      string                   `json:"workspaceId"`
	PromotionID      string                   `json:"promotionId"`
	UploadCapability string                   `json:"uploadCapability"`
	Attestation      *AttestationPresentation `json:"attestation"`
	RequestDigest    string                   `json:"requestDigest"`
}

type agentEvaluationOwnerVerifiedViewRequest struct {
	Format        string   `json:"format"`
	Version       int      `json:"version"`
	Purpose       string   `json:"purpose"`
	Operation     string   `json:"operation"`
	WorkspaceID   string   `json:"workspaceId"`
	EvidenceIDs   []string `json:"evidenceIds"`
	RequestDigest string   `json:"requestDigest"`
}

type agentEvaluationOwnerArtifactRequestProjection struct {
	Format                 string `json:"format"`
	Version                int    `json:"version"`
	Purpose                string `json:"purpose"`
	Operation              string `json:"operation"`
	WorkspaceID            string `json:"workspaceId"`
	PromotionID            string `json:"promotionId"`
	ArtifactID             string `json:"artifactId"`
	UploadCapabilityDigest string `json:"uploadCapabilityDigest"`
	ArtifactDigest         string `json:"artifactDigest"`
	ArtifactSize           int64  `json:"artifactSize"`
	MediaType              string `json:"mediaType"`
}

type agentEvaluationOwnerCreateResponse struct {
	Format           string `json:"format"`
	Version          int    `json:"version"`
	Purpose          string `json:"purpose"`
	Operation        string `json:"operation"`
	RequestDigest    string `json:"requestDigest"`
	PromotionID      string `json:"promotionId"`
	EvidenceID       string `json:"evidenceId"`
	UploadCapability string `json:"uploadCapability"`
	ResponseDigest   string `json:"responseDigest"`
}

type agentEvaluationOwnerArtifactResponse struct {
	Format         string             `json:"format"`
	Version        int                `json:"version"`
	Purpose        string             `json:"purpose"`
	Operation      string             `json:"operation"`
	RequestDigest  string             `json:"requestDigest"`
	PromotionID    string             `json:"promotionId"`
	Artifact       ArtifactDescriptor `json:"artifact"`
	ResponseDigest string             `json:"responseDigest"`
}

type agentEvaluationOwnerPrepareResponse struct {
	Format                     string            `json:"format"`
	Version                    int               `json:"version"`
	Purpose                    string            `json:"purpose"`
	Operation                  string            `json:"operation"`
	RequestDigest              string            `json:"requestDigest"`
	PromotionID                string            `json:"promotionId"`
	EvidenceID                 string            `json:"evidenceId"`
	AttestationNonce           string            `json:"attestationNonce"`
	AttestationStatement       EvidenceStatement `json:"attestationStatement"`
	AttestationStatementDigest string            `json:"attestationStatementDigest"`
	ResponseDigest             string            `json:"responseDigest"`
}

type agentEvaluationOwnerFinalCommitResponse struct {
	Format         string                                   `json:"format"`
	Version        int                                      `json:"version"`
	Purpose        string                                   `json:"purpose"`
	Operation      string                                   `json:"operation"`
	RequestDigest  string                                   `json:"requestDigest"`
	PromotionID    string                                   `json:"promotionId"`
	EvidenceID     string                                   `json:"evidenceId"`
	Manifest       agentEvaluationOwnerEvidenceManifestWire `json:"manifest"`
	ResponseDigest string                                   `json:"responseDigest"`
}

type agentEvaluationOwnerVerifiedViewResponse struct {
	Format         string                                     `json:"format"`
	Version        int                                        `json:"version"`
	Purpose        string                                     `json:"purpose"`
	Operation      string                                     `json:"operation"`
	RequestDigest  string                                     `json:"requestDigest"`
	EvidenceIDs    []string                                   `json:"evidenceIds"`
	View           agentEvaluationOwnerVerifiedViewWire       `json:"view"`
	Manifests      []agentEvaluationOwnerEvidenceManifestWire `json:"manifests"`
	ResponseDigest string                                     `json:"responseDigest"`
}

// The direct owner boundary carries the public verification wire version while
// the canonical repository model and its existing digests remain unchanged.
type agentEvaluationOwnerEvidenceManifestWire struct {
	VerificationEvidenceManifest
	WireVersion int `json:"wireVersion"`
}

type agentEvaluationOwnerVerifiedViewWire struct {
	ClosureView
	WireVersion int `json:"wireVersion"`
}

func agentEvaluationOwnerManifestWire(
	manifest VerificationEvidenceManifest,
) agentEvaluationOwnerEvidenceManifestWire {
	return agentEvaluationOwnerEvidenceManifestWire{
		VerificationEvidenceManifest: manifest,
		WireVersion:                  agentEvaluationOwnerWireVersion,
	}
}

func agentEvaluationOwnerViewWire(view ClosureView) agentEvaluationOwnerVerifiedViewWire {
	return agentEvaluationOwnerVerifiedViewWire{
		ClosureView: view,
		WireVersion: agentEvaluationOwnerWireVersion,
	}
}

type agentEvaluationOwnerHealthResponse struct {
	Format               string `json:"format"`
	Version              int    `json:"version"`
	Purpose              string `json:"purpose"`
	ImplementationDigest string `json:"implementationDigest"`
}

func agentEvaluationOwnerImplementationDigest() (string, error) {
	digest, _, err := canonicalDigest(struct {
		Format          string   `json:"format"`
		Version         int      `json:"version"`
		Purpose         string   `json:"purpose"`
		Operations      []string `json:"operations"`
		AttestationFlow string   `json:"attestationFlow"`
		CurrentView     string   `json:"currentView"`
	}{
		Format:  "prodivix.verification-agent-evaluation-owner-implementation",
		Version: 1,
		Purpose: AgentEvaluationOwnerAuthorityPurpose,
		Operations: []string{
			"artifact.upload",
			"promotion.create",
			"promotion.final-commit",
			"promotion.prepare",
			"verified-view.resolve",
		},
		AttestationFlow: "server-bound-prepare-sign-final-commit",
		CurrentView:     "exact-id-repeatable-read-with-full-manifest-wire-v1",
	})
	return digest, err
}

func validateAgentEvaluationOwnerRequestBase(
	format string,
	version int,
	purpose string,
	operation string,
	expectedOperation string,
	workspaceID string,
	expectedWorkspaceID string,
	requestDigest string,
) error {
	if format != agentEvaluationOwnerRequestFormat ||
		version != agentEvaluationOwnerWireVersion ||
		purpose != AgentEvaluationOwnerAuthorityPurpose ||
		operation != expectedOperation ||
		workspaceID != expectedWorkspaceID ||
		validateIdentifier(workspaceID, "workspaceId") != nil ||
		!digestPattern.MatchString(requestDigest) {
		return ErrInvalid
	}
	return nil
}

func validateAgentEvaluationOwnerPromotionResult(
	result CreatePromotionResult,
	promotionID string,
) error {
	if result.PromotionID != promotionID ||
		validateIdentifier(result.PromotionID, "promotionId") != nil ||
		validateIdentifier(result.EvidenceID, "evidenceId") != nil ||
		result.AttestationStatement == nil || result.AttestationNonce == "" ||
		!digestPattern.MatchString(result.AttestationStatementDigest) {
		return ErrConflict
	}
	return nil
}

func validateAgentEvaluationOwnerExactSnapshot(
	snapshot agentEvaluationExactVerifiedViewSnapshot,
	evidenceIDs []string,
) error {
	if snapshot.View.Format != "prodivix.verification-evidence-view.v1" ||
		len(snapshot.View.Records) != len(evidenceIDs) ||
		len(snapshot.Manifests) != len(evidenceIDs) ||
		!digestPattern.MatchString(snapshot.View.RevocationRecordDigest) ||
		!digestPattern.MatchString(snapshot.View.ViewDigest) {
		return ErrConflict
	}
	if _, err := parseInstant(snapshot.View.ClosureEvaluationInstant); err != nil {
		return ErrConflict
	}
	viewDigest, _, err := digestWithoutField(snapshot.View, "viewDigest")
	if err != nil || viewDigest != snapshot.View.ViewDigest {
		return ErrConflict
	}
	for index, evidenceID := range evidenceIDs {
		record := snapshot.View.Records[index]
		manifest := snapshot.Manifests[index]
		projected, err := projectEvidenceManifest(manifest)
		recordDigest, _, recordErr := digestWithoutField(record, "recordDigest")
		if err != nil || recordErr != nil ||
			recordDigest != record.RecordDigest ||
			record.EvidenceID != evidenceID || manifest.Evidence.ID != evidenceID ||
			projected.ID != evidenceID ||
			record.ManifestDigest != manifest.ManifestDigest ||
			projected.ManifestDigest != manifest.ManifestDigest {
			return ErrConflict
		}
	}
	return nil
}
