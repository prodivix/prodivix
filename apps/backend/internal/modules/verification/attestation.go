package verification

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	attestationClaimsFormat       = "prodivix.verification-attestation-claims"
	attestationPresentationFormat = "prodivix.verification-attestation-presentation"
	attestationVerifierID         = "prodivix.backend.ed25519.v1"
	evidenceStatementFormat       = "prodivix.verification-evidence-statement"
	artifactSetFormat             = "prodivix.verification-artifact-set"
)

type AttestationKey struct {
	ID        string
	PublicKey ed25519.PublicKey
	Issuer    string
	Audience  string
	Subject   string
	Trust     TrustClass
}

type AttestationVerifier interface {
	Verify(ctx context.Context, promotion Promotion, presentation AttestationPresentation, verificationInstant time.Time) (*VerifiedAttestation, error)
}

type Ed25519AttestationVerifier struct {
	keys             map[string]AttestationKey
	policyGeneration int64
	maximumLifetime  time.Duration
}

func NewEd25519AttestationVerifier(
	keys []AttestationKey,
	policyGeneration int64,
	maximumLifetime time.Duration,
) (*Ed25519AttestationVerifier, error) {
	if policyGeneration < 1 || maximumLifetime <= 0 || maximumLifetime > time.Hour {
		return nil, errors.New("verification attestation policy is invalid")
	}
	keySet := make(map[string]AttestationKey, len(keys))
	for _, key := range keys {
		if validateIdentifier(key.ID, "attestation key id") != nil ||
			validateCanonicalText(key.Issuer, "attestation issuer", 4096) != nil ||
			validateCanonicalText(key.Audience, "attestation audience", 4096) != nil ||
			validateCanonicalText(key.Subject, "attestation subject", 4096) != nil ||
			len(key.PublicKey) != ed25519.PublicKeySize ||
			(key.Trust != TrustRemoteAttested && key.Trust != TrustCIAttested) {
			return nil, errors.New("verification attestation key is invalid")
		}
		if _, duplicate := keySet[key.ID]; duplicate {
			return nil, errors.New("verification attestation key ids must be unique")
		}
		key.PublicKey = append(ed25519.PublicKey(nil), key.PublicKey...)
		keySet[key.ID] = key
	}
	return &Ed25519AttestationVerifier{
		keys: keySet, policyGeneration: policyGeneration, maximumLifetime: maximumLifetime,
	}, nil
}

type attestationClaimSet struct {
	Format                   string                `json:"format"`
	Version                  int                   `json:"version"`
	Trust                    TrustClass            `json:"trust"`
	Issuer                   string                `json:"issuer"`
	Audience                 string                `json:"audience"`
	Subject                  string                `json:"subject"`
	Nonce                    string                `json:"nonce"`
	IssuedAt                 string                `json:"issuedAt"`
	NotBefore                string                `json:"notBefore"`
	ExpiresAt                string                `json:"expiresAt"`
	PolicyGeneration         int64                 `json:"policyGeneration"`
	StatementDigest          string                `json:"statementDigest"`
	CandidateDigest          string                `json:"candidateDigest"`
	EvidenceCoreDigest       string                `json:"evidenceCoreDigest"`
	ArtifactSetDigest        string                `json:"artifactSetDigest"`
	ProjectID                string                `json:"projectId"`
	WorkspaceID              string                `json:"workspaceId"`
	WorkspaceRevision        int64                 `json:"workspaceRevision"`
	ExecutableSnapshotDigest string                `json:"executableSnapshotDigest"`
	PlanDigest               string                `json:"planDigest"`
	CellID                   string                `json:"cellId"`
	CheckID                  string                `json:"checkId"`
	CheckKind                string                `json:"checkKind"`
	TargetID                 string                `json:"targetId"`
	TargetPolicyDigest       string                `json:"targetPolicyDigest"`
	AttemptID                string                `json:"attemptId"`
	ProducerDigest           string                `json:"producerDigest"`
	ExecutionDigest          string                `json:"executionDigest"`
	ToolchainDigest          string                `json:"toolchainDigest"`
	NormalizationDigest      string                `json:"normalizationDigest"`
	CI                       *CIRepositoryIdentity `json:"ci,omitempty"`
}

func (verifier *Ed25519AttestationVerifier) Verify(
	ctx context.Context,
	promotion Promotion,
	presentation AttestationPresentation,
	verificationInstant time.Time,
) (*VerifiedAttestation, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if verifier == nil || promotion.Statement == nil ||
		presentation.Format != attestationClaimsFormat || presentation.Version != 1 ||
		presentation.Algorithm != "Ed25519" || presentation.PolicyGeneration != verifier.policyGeneration {
		return nil, coded("VER-5003", "Evidence attestation is invalid.", ErrAttestationRejected)
	}
	key, exists := verifier.keys[presentation.KeyID]
	if !exists || key.Trust != promotion.Trust ||
		presentation.Trust != promotion.Trust ||
		presentation.Issuer != key.Issuer ||
		presentation.Audience != key.Audience ||
		presentation.Subject != key.Subject ||
		secretHash(presentation.Nonce) != promotion.NonceHash ||
		presentation.StatementDigest != promotion.StatementDigest {
		return nil, coded("VER-5003", "Evidence attestation is invalid.", ErrAttestationRejected)
	}
	artifactSetDigest, err := evidenceArtifactSetDigest(promotion.Statement.Artifacts)
	if err != nil {
		return nil, err
	}
	producerDigest, _, err := canonicalDigest(promotion.Statement.Producer)
	if err != nil {
		return nil, err
	}
	executionDigest, _, err := canonicalDigest(promotion.Statement.Execution)
	if err != nil {
		return nil, err
	}
	expected := *promotion.Statement
	if !validCheckKind(expected.CheckKind) ||
		validateIdentifier(expected.TargetID, "statement.targetId") != nil ||
		!digestPattern.MatchString(expected.TargetPolicyDigest) ||
		!digestPattern.MatchString(expected.NormalizationDigest) ||
		!statementTrustMatchesPresentation(expected.Producer, presentation) {
		return nil, coded("VER-5003", "Evidence attestation is invalid.", ErrAttestationRejected)
	}
	if presentation.ArtifactSetDigest != artifactSetDigest ||
		presentation.CandidateDigest != expected.CandidateDigest ||
		presentation.EvidenceCoreDigest != expected.EvidenceCoreDigest ||
		presentation.ProjectID != expected.ProjectID ||
		presentation.WorkspaceID != expected.WorkspaceID ||
		presentation.WorkspaceRevision != expected.WorkspaceRevision ||
		presentation.ExecutableSnapshotDigest != expected.ExecutableSnapshotDigest ||
		presentation.PlanDigest != expected.PlanDigest ||
		presentation.CellID != expected.CellID ||
		presentation.CheckID != expected.CheckID ||
		presentation.CheckKind != expected.CheckKind ||
		presentation.TargetID != expected.TargetID ||
		presentation.TargetPolicyDigest != expected.TargetPolicyDigest ||
		presentation.AttemptID != expected.AttemptID ||
		presentation.ProducerDigest != producerDigest ||
		presentation.ExecutionDigest != executionDigest ||
		presentation.ToolchainDigest != expected.ToolchainDigest ||
		presentation.NormalizationDigest != expected.NormalizationDigest {
		return nil, coded("VER-5003", "Evidence attestation is invalid.", ErrAttestationRejected)
	}
	issuedAt, issuedErr := parseInstant(presentation.IssuedAt)
	notBefore, notBeforeErr := parseInstant(presentation.NotBefore)
	expiresAt, expiresErr := parseInstant(presentation.ExpiresAt)
	verificationInstant = canonicalTime(verificationInstant)
	if issuedErr != nil || notBeforeErr != nil || expiresErr != nil ||
		issuedAt.After(notBefore) ||
		issuedAt.After(verificationInstant) ||
		verificationInstant.Before(notBefore) || !verificationInstant.Before(expiresAt) ||
		expiresAt.Sub(issuedAt) > verifier.maximumLifetime {
		return nil, coded("VER-5003", "Evidence attestation is invalid.", ErrAttestationRejected)
	}
	claims := attestationClaimSetForPresentation(presentation)
	claimsDigest, claimsBytes, err := canonicalDigest(claims)
	if err != nil {
		return nil, err
	}
	signature, err := decodeSignature(presentation.Signature)
	if err != nil || !ed25519.Verify(key.PublicKey, claimsBytes, signature) {
		return nil, coded("VER-5003", "Evidence attestation is invalid.", ErrAttestationRejected)
	}
	proofDigest := digestBytes(signature)
	attestationDigest, err := deriveAttestationPresentationDigest(
		presentation.Algorithm,
		presentation.KeyID,
		claimsDigest,
		proofDigest,
	)
	if err != nil {
		return nil, err
	}
	nonceDigest, _, err := canonicalDigest(map[string]any{
		"format":  "prodivix.verification-attestation-nonce",
		"version": 1,
		"nonce":   presentation.Nonce,
	})
	if err != nil {
		return nil, err
	}
	replayKey, _, err := canonicalDigest(map[string]any{
		"format":      "prodivix.verification-attestation-replay-key",
		"version":     1,
		"issuer":      presentation.Issuer,
		"audience":    presentation.Audience,
		"nonceDigest": nonceDigest,
	})
	if err != nil {
		return nil, err
	}
	persistedClaims := VerificationVerifiedClaims{
		Trust: presentation.Trust, Issuer: presentation.Issuer, Audience: presentation.Audience,
		Subject: presentation.Subject, KeyID: presentation.KeyID, Algorithm: presentation.Algorithm,
		IssuedAt: presentation.IssuedAt, NotBefore: presentation.NotBefore,
		ExpiresAt: presentation.ExpiresAt, NonceDigest: nonceDigest, ReplayKey: replayKey,
		ClaimsDigest: claimsDigest, ProofDigest: proofDigest, AttestationDigest: attestationDigest,
		VerifierID: attestationVerifierID, VerifierVersion: "1",
		VerifiedAt:         formatInstant(verificationInstant),
		PolicyGeneration:   presentation.PolicyGeneration,
		StatementDigest:    presentation.StatementDigest,
		CandidateDigest:    presentation.CandidateDigest,
		EvidenceCoreDigest: presentation.EvidenceCoreDigest,
		ArtifactSetDigest:  presentation.ArtifactSetDigest,
		ProjectID:          presentation.ProjectID, WorkspaceID: presentation.WorkspaceID,
		WorkspaceRevision:        presentation.WorkspaceRevision,
		ExecutableSnapshotDigest: presentation.ExecutableSnapshotDigest,
		PlanDigest:               presentation.PlanDigest, CellID: presentation.CellID,
		CheckID: presentation.CheckID, CheckKind: presentation.CheckKind,
		TargetID: presentation.TargetID, TargetPolicyDigest: presentation.TargetPolicyDigest,
		AttemptID: presentation.AttemptID, ProducerDigest: presentation.ProducerDigest,
		ExecutionDigest:     presentation.ExecutionDigest,
		ToolchainDigest:     presentation.ToolchainDigest,
		NormalizationDigest: presentation.NormalizationDigest,
		CI:                  cloneCIIdentity(presentation.CI),
	}
	safeBytes, err := canonicalBytes(persistedClaims)
	if err != nil {
		return nil, err
	}
	return &VerifiedAttestation{
		Trust: presentation.Trust, Issuer: presentation.Issuer, Audience: presentation.Audience,
		Subject: presentation.Subject, KeyID: presentation.KeyID, Algorithm: presentation.Algorithm,
		IssuedAt: issuedAt, NotBefore: notBefore, ExpiresAt: expiresAt,
		NonceDigest: nonceDigest, ReplayKey: replayKey, StatementDigest: presentation.StatementDigest,
		ArtifactSetDigest: presentation.ArtifactSetDigest, ClaimsDigest: claimsDigest,
		AttestationDigest: attestationDigest, ProofDigest: proofDigest, VerifierID: attestationVerifierID,
		VerifiedAt: verificationInstant, ClaimsJSON: json.RawMessage(safeBytes),
		PersistedClaims: persistedClaims,
	}, nil
}

func deriveAttestationPresentationDigest(
	algorithm string,
	keyID string,
	claimsDigest string,
	proofDigest string,
) (string, error) {
	digest, _, err := canonicalDigest(struct {
		Format       string `json:"format"`
		Version      int    `json:"version"`
		Algorithm    string `json:"algorithm"`
		KeyID        string `json:"keyId"`
		ClaimsDigest string `json:"claimsDigest"`
		ProofDigest  string `json:"proofDigest"`
	}{
		Format:       attestationPresentationFormat,
		Version:      1,
		Algorithm:    algorithm,
		KeyID:        keyID,
		ClaimsDigest: claimsDigest,
		ProofDigest:  proofDigest,
	})
	return digest, err
}

func statementTrustMatchesPresentation(
	producer ProducerStatement,
	presentation AttestationPresentation,
) bool {
	switch presentation.Trust {
	case TrustCIAttested:
		return producer.Origin == "ci" &&
			producer.CI != nil &&
			presentation.CI != nil &&
			validateCIRepositoryIdentity(*producer.CI) == nil &&
			validateCIRepositoryIdentity(*presentation.CI) == nil &&
			*producer.CI == *presentation.CI
	case TrustRemoteAttested:
		return producer.Origin == "remote" &&
			producer.CI == nil &&
			presentation.CI == nil
	default:
		return false
	}
}

func cloneCIIdentity(identity *CIRepositoryIdentity) *CIRepositoryIdentity {
	if identity == nil {
		return nil
	}
	clone := *identity
	return &clone
}

func attestationClaimSetForPresentation(
	presentation AttestationPresentation,
) attestationClaimSet {
	return attestationClaimSet{
		Format: presentation.Format, Version: presentation.Version, Trust: presentation.Trust,
		Issuer: presentation.Issuer, Audience: presentation.Audience, Subject: presentation.Subject,
		Nonce: presentation.Nonce, IssuedAt: presentation.IssuedAt, NotBefore: presentation.NotBefore,
		ExpiresAt: presentation.ExpiresAt, PolicyGeneration: presentation.PolicyGeneration,
		StatementDigest:    presentation.StatementDigest,
		CandidateDigest:    presentation.CandidateDigest,
		EvidenceCoreDigest: presentation.EvidenceCoreDigest,
		ArtifactSetDigest:  presentation.ArtifactSetDigest,
		ProjectID:          presentation.ProjectID, WorkspaceID: presentation.WorkspaceID,
		WorkspaceRevision:        presentation.WorkspaceRevision,
		ExecutableSnapshotDigest: presentation.ExecutableSnapshotDigest,
		PlanDigest:               presentation.PlanDigest, CellID: presentation.CellID,
		CheckID: presentation.CheckID, CheckKind: presentation.CheckKind,
		TargetID: presentation.TargetID, TargetPolicyDigest: presentation.TargetPolicyDigest,
		AttemptID:           presentation.AttemptID,
		ProducerDigest:      presentation.ProducerDigest,
		ExecutionDigest:     presentation.ExecutionDigest,
		ToolchainDigest:     presentation.ToolchainDigest,
		NormalizationDigest: presentation.NormalizationDigest,
		CI:                  cloneCIIdentity(presentation.CI),
	}
}

func decodeSignature(value string) ([]byte, error) {
	if value != strings.TrimSpace(value) || len(value) > 512 {
		return nil, errors.New("signature is invalid")
	}
	for _, encoding := range []*base64.Encoding{
		base64.RawStdEncoding, base64.StdEncoding, base64.RawURLEncoding, base64.URLEncoding,
	} {
		decoded, err := encoding.DecodeString(value)
		if err == nil && len(decoded) == ed25519.SignatureSize {
			return decoded, nil
		}
	}
	return nil, fmt.Errorf("signature is not Ed25519")
}

func buildEvidenceStatement(
	candidate EvidenceCandidate,
	evidenceID string,
	createdAt time.Time,
	retention RetentionClass,
) (*EvidenceStatement, string, []byte, error) {
	artifacts := make([]ArtifactManifest, len(candidate.Artifacts))
	for index, artifact := range candidate.Artifacts {
		artifacts[index] = ArtifactManifest{
			ID: artifact.ID, Path: artifact.Path, Kind: artifact.Kind,
			Digest:            artifact.ExpectedDigest,
			SourceTraceDigest: artifact.SourceTraceDigest,
			Size:              artifact.ExpectedSize,
			MediaType:         artifact.ExpectedMediaType,
		}
	}
	evidence := materializeEvidenceBody(
		candidate,
		evidenceID,
		createdAt,
		retention,
		artifacts,
		EvidenceProvenance{},
	)
	return buildEvidenceStatementForEvidence(candidate, evidence)
}

func buildEvidenceStatementForEvidence(
	candidate EvidenceCandidate,
	evidence VerificationEvidence,
) (*EvidenceStatement, string, []byte, error) {
	partitionDigest, _, err := canonicalDigest(candidate.PartitionRevisions)
	if err != nil {
		return nil, "", nil, err
	}
	targetPolicyDigest, err := artifactTargetPolicyDigest(candidate.Redaction.TargetPolicy)
	if err != nil {
		return nil, "", nil, err
	}
	normalizationDigest, _, err := canonicalDigest(candidate.Normalization)
	if err != nil {
		return nil, "", nil, err
	}
	var ci *CIRepositoryIdentity
	if candidate.Provenance.CI != nil {
		value := *candidate.Provenance.CI
		ci = &value
	}
	evidenceCoreDigest, err := createEvidenceCoreDigest(candidate.CandidateDigest, evidence)
	if err != nil {
		return nil, "", nil, err
	}
	statement := &EvidenceStatement{
		EvidenceID: evidence.ID, CandidateID: candidate.CandidateID,
		CandidateDigest: candidate.CandidateDigest, EvidenceCoreDigest: evidenceCoreDigest,
		ProjectID: candidate.ProjectID, WorkspaceID: candidate.WorkspaceID,
		WorkspaceRevision: candidate.WorkspaceRevision, PartitionRevisionsDigest: partitionDigest,
		ExecutableSnapshotDigest: candidate.ExecutableSnapshotDigest,
		PolicyDigest:             candidate.PolicyDigest, TargetPolicyDigest: targetPolicyDigest,
		PlanDigest: candidate.PlanDigest,
		CellID:     candidate.CellID, CheckID: candidate.CheckID,
		CheckKind: candidate.CheckKind, TargetID: candidate.TargetID,
		AttemptID: candidate.AttemptID,
		Producer: ProducerStatement{
			Origin:     candidate.Provenance.Origin,
			ProducerID: candidate.Provenance.ProducerID, ProviderID: candidate.Provenance.ProviderID,
			RunID: candidate.Run.RunID, JobID: candidate.Run.JobID, SessionID: candidate.Run.SessionID,
			SandboxImageDigest: candidate.Run.SandboxImageDigest, CI: ci,
		},
		Execution: EvidenceExecutionStatement{
			Surface: candidate.Run.Surface, FrameworkTarget: candidate.Run.FrameworkTarget,
			RuntimeZone: candidate.Run.RuntimeZone, BrowserEngine: candidate.Run.BrowserEngine,
			OperatingSystemIdentity: candidate.Run.OperatingSystemIdentity,
			Viewport:                candidate.Run.Viewport, DevicePixelRatio: candidate.Run.DevicePixelRatio,
			ColorScheme: candidate.Run.ColorScheme, Motion: candidate.Run.Motion,
			Locale: candidate.Run.Locale, Timezone: candidate.Run.Timezone,
			FontSetDigest:      candidate.Run.FontSetDigest,
			SandboxImageDigest: candidate.Run.SandboxImageDigest,
		},
		ToolchainDigest: candidate.Toolchain.ToolchainDigest, NormalizationDigest: normalizationDigest,
		ControlDigest: candidate.Controls.AppliedDigest, InputDigest: candidate.Inputs.InputDigest,
		ResultDigest: candidate.Result.NormalizedResultDigest, SourceTraceDigest: candidate.SourceTraceDigest,
		CreatedAt: evidence.CreatedAt, Retention: evidence.Retention,
		Artifacts: sortedEvidenceArtifactStatements(evidence.Artifacts),
	}
	digest, encoded, err := evidenceStatementDigest(*statement)
	return statement, digest, encoded, err
}

func sortedEvidenceArtifactStatements(
	artifacts []ArtifactManifest,
) []EvidenceArtifactStatement {
	result := make([]EvidenceArtifactStatement, len(artifacts))
	for index, artifact := range artifacts {
		result[index] = EvidenceArtifactStatement{
			ID: artifact.ID, Path: artifact.Path, Kind: artifact.Kind,
			Digest:            artifact.Digest,
			SourceTraceDigest: artifact.SourceTraceDigest,
			Size:              artifact.Size,
			MediaType:         artifact.MediaType,
		}
	}
	sort.Slice(result, func(left, right int) bool {
		if result[left].ID != result[right].ID {
			return result[left].ID < result[right].ID
		}
		if result[left].Kind != result[right].Kind {
			return result[left].Kind < result[right].Kind
		}
		return result[left].Digest < result[right].Digest
	})
	return result
}

func evidenceStatementDigest(statement EvidenceStatement) (string, []byte, error) {
	return canonicalDigest(EvidenceStatementEnvelope{
		Format: evidenceStatementFormat, Version: 1, Statement: statement,
	})
}

func evidenceArtifactSetDigest(artifacts []EvidenceArtifactStatement) (string, error) {
	normalized := append([]EvidenceArtifactStatement(nil), artifacts...)
	sort.Slice(normalized, func(left, right int) bool {
		if normalized[left].ID != normalized[right].ID {
			return normalized[left].ID < normalized[right].ID
		}
		if normalized[left].Kind != normalized[right].Kind {
			return normalized[left].Kind < normalized[right].Kind
		}
		return normalized[left].Digest < normalized[right].Digest
	})
	digest, _, err := canonicalDigest(struct {
		Format    string                      `json:"format"`
		Version   int                         `json:"version"`
		Artifacts []EvidenceArtifactStatement `json:"artifacts"`
	}{
		Format: artifactSetFormat, Version: 1, Artifacts: normalized,
	})
	return digest, err
}
