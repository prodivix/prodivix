package verification

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func TestEd25519AttestationVerifierBindsStatementAndProjectsSecretFreeClaims(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{0x42}, ed25519.SeedSize))
	publicKey := privateKey.Public().(ed25519.PublicKey)
	verifier, err := NewEd25519AttestationVerifier([]AttestationKey{{
		ID: "ci-key-1", PublicKey: publicKey, Issuer: "https://issuer.example",
		Audience: "prodivix-verification", Subject: "repo:prodivix/main",
		Trust: TrustCIAttested,
	}}, 7, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	promotion, presentation := signedAttestationFixture(t, privateKey)
	verified, err := verifier.Verify(
		context.Background(), promotion, presentation, mustVectorTime(t, vectorNowText),
	)
	if err != nil {
		t.Fatalf("verify deterministic CI attestation: %v", err)
	}
	if verified.Trust != TrustCIAttested ||
		verified.PersistedClaims.StatementDigest != promotion.StatementDigest ||
		verified.PersistedClaims.CheckKind != promotion.Statement.CheckKind ||
		verified.PersistedClaims.TargetID != promotion.Statement.TargetID ||
		verified.PersistedClaims.TargetPolicyDigest != promotion.Statement.TargetPolicyDigest ||
		verified.PersistedClaims.NormalizationDigest != promotion.Statement.NormalizationDigest ||
		verified.PersistedClaims.CI == nil ||
		*verified.PersistedClaims.CI != *promotion.Statement.Producer.CI ||
		verified.ProofDigest != digestBytes(mustDecodeSignature(t, presentation.Signature)) ||
		verified.PersistedClaims.ProofDigest != verified.ProofDigest ||
		verified.PersistedClaims.NonceDigest == "" ||
		verified.PersistedClaims.ReplayKey == "" {
		t.Fatalf("verified claims did not preserve the exact safe binding: %#v", verified.PersistedClaims)
	}
	expectedPresentationDigest, err := deriveAttestationPresentationDigest(
		presentation.Algorithm,
		presentation.KeyID,
		verified.ClaimsDigest,
		verified.ProofDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	if verified.AttestationDigest != expectedPresentationDigest ||
		verified.PersistedClaims.AttestationDigest != expectedPresentationDigest {
		t.Fatalf(
			"attestation digest was not derived from the verified presentation: got %s want %s",
			verified.AttestationDigest,
			expectedPresentationDigest,
		)
	}
	if bytes.Contains(verified.ClaimsJSON, []byte(presentation.Nonce)) ||
		bytes.Contains(verified.ClaimsJSON, []byte(presentation.Signature)) {
		t.Fatal("persisted verified claims leaked nonce or signature material")
	}

	for name, mutate := range map[string]func(*AttestationPresentation){
		"audience": func(value *AttestationPresentation) { value.Audience = "other" },
		"nonce":    func(value *AttestationPresentation) { value.Nonce = "other-nonce" },
		"plan":     func(value *AttestationPresentation) { value.PlanDigest = repeatedDigest('9') },
		"check-kind": func(value *AttestationPresentation) {
			value.CheckKind = "security"
		},
		"target-id": func(value *AttestationPresentation) {
			value.TargetID = "other-target"
		},
		"target-policy": func(value *AttestationPresentation) {
			value.TargetPolicyDigest = repeatedDigest('8')
		},
		"execution": func(value *AttestationPresentation) {
			value.ExecutionDigest = repeatedDigest('7')
		},
		"normalization": func(value *AttestationPresentation) {
			value.NormalizationDigest = repeatedDigest('6')
		},
		"ci": func(value *AttestationPresentation) {
			changed := *value.CI
			changed.Commit = "sha1-" + string(bytes.Repeat([]byte{'1'}, 40))
			value.CI = &changed
		},
		"missing-ci": func(value *AttestationPresentation) {
			value.CI = nil
		},
		"expiry": func(value *AttestationPresentation) {
			value.ExpiresAt = "2026-07-28T00:00:01.000Z"
		},
		"signature": func(value *AttestationPresentation) {
			value.Signature = base64.RawStdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))
		},
	} {
		t.Run(name, func(t *testing.T) {
			changed := presentation
			mutate(&changed)
			if _, err := verifier.Verify(
				context.Background(), promotion, changed, mustVectorTime(t, vectorNowText),
			); err == nil {
				t.Fatal("tampered attestation was accepted")
			}
		})
	}
}

func TestCandidateCannotSelfReportAttestationPresentationDigest(t *testing.T) {
	candidate := verificationVectorCandidate(t, nil, "legacy-attestation-digest")
	encoded, err := json.Marshal(candidate)
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(encoded, &value); err != nil {
		t.Fatal(err)
	}
	provenance, ok := value["provenance"].(map[string]any)
	if !ok {
		t.Fatal("candidate provenance was not an object")
	}
	provenance["attestationPresentationDigest"] = repeatedDigest('9')
	encoded, err = json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var decoded EvidenceCandidate
	if err := jsonUnmarshalStrictStored(encoded, &decoded); err == nil {
		t.Fatal("legacy self-reported attestation presentation digest was accepted")
	}
}

func TestEd25519AttestationVerifierEnforcesCanonicalTimeWindow(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{0x24}, ed25519.SeedSize))
	verifier, err := NewEd25519AttestationVerifier([]AttestationKey{{
		ID: "ci-key-1", PublicKey: privateKey.Public().(ed25519.PublicKey),
		Issuer: "https://issuer.example", Audience: "prodivix-verification",
		Subject: "repo:prodivix/main", Trust: TrustCIAttested,
	}}, 7, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	promotion, base := signedAttestationFixture(t, privateKey)
	for name, mutate := range map[string]func(*AttestationPresentation){
		"issued-after-verification": func(value *AttestationPresentation) {
			value.IssuedAt = "2026-07-28T00:00:03.000Z"
			value.NotBefore = value.IssuedAt
			value.ExpiresAt = "2026-07-28T00:07:03.000Z"
		},
		"not-before-after-verification": func(value *AttestationPresentation) {
			value.NotBefore = "2026-07-28T00:00:03.000Z"
		},
		"maximum-lifetime-from-issued-at": func(value *AttestationPresentation) {
			value.ExpiresAt = "2026-07-28T00:10:03.000Z"
		},
	} {
		t.Run(name, func(t *testing.T) {
			presentation := base
			mutate(&presentation)
			signAttestationPresentation(t, privateKey, &presentation)
			if _, err := verifier.Verify(
				context.Background(), promotion, presentation, mustVectorTime(t, vectorNowText),
			); err == nil {
				t.Fatal("validly signed out-of-window attestation was accepted")
			}
		})
	}
}

func signedAttestationFixture(
	t *testing.T,
	privateKey ed25519.PrivateKey,
) (Promotion, AttestationPresentation) {
	t.Helper()
	candidate := verificationVectorCandidate(t, nil, "ci-vector")
	candidate.Provenance.Origin = "ci"
	candidate.Provenance.CI = verificationVectorCIIdentity()
	candidate.CandidateDigest = mustDigestWithoutField(t, candidate, "candidateDigest")
	createdAt := mustVectorTime(t, vectorNowText)
	statement, statementDigest, statementBytes, err := buildEvidenceStatement(
		candidate, "evidence-ci-vector", createdAt, RetentionSession,
	)
	if err != nil {
		t.Fatal(err)
	}
	artifactSetDigest, err := evidenceArtifactSetDigest(statement.Artifacts)
	if err != nil {
		t.Fatal(err)
	}
	producerDigest := mustCanonicalDigest(t, statement.Producer)
	executionDigest := mustCanonicalDigest(t, statement.Execution)
	nonce := "nonce-ci-vector-0123456789"
	presentation := AttestationPresentation{
		Format: attestationClaimsFormat, Version: 1, Trust: TrustCIAttested,
		Issuer: "https://issuer.example", Audience: "prodivix-verification",
		Subject: "repo:prodivix/main", Nonce: nonce,
		IssuedAt: vectorNowText, NotBefore: vectorNowText,
		ExpiresAt: "2026-07-28T00:07:02.000Z", PolicyGeneration: 7,
		StatementDigest: statementDigest, CandidateDigest: statement.CandidateDigest,
		EvidenceCoreDigest: statement.EvidenceCoreDigest,
		ArtifactSetDigest:  artifactSetDigest,
		ProjectID:          candidate.ProjectID, WorkspaceID: candidate.WorkspaceID,
		WorkspaceRevision:        candidate.WorkspaceRevision,
		ExecutableSnapshotDigest: candidate.ExecutableSnapshotDigest,
		PlanDigest:               candidate.PlanDigest, CellID: candidate.CellID,
		CheckID: candidate.CheckID, CheckKind: candidate.CheckKind,
		TargetID: candidate.TargetID, TargetPolicyDigest: statement.TargetPolicyDigest,
		AttemptID:      candidate.AttemptID,
		ProducerDigest: producerDigest, ExecutionDigest: executionDigest,
		ToolchainDigest:     candidate.Toolchain.ToolchainDigest,
		NormalizationDigest: statement.NormalizationDigest,
		CI:                  cloneCIIdentity(candidate.Provenance.CI),
		Algorithm:           "Ed25519", KeyID: "ci-key-1",
	}
	signAttestationPresentation(t, privateKey, &presentation)
	return Promotion{
		Candidate: candidate, CandidateDigest: candidate.CandidateDigest,
		EvidenceID: "evidence-ci-vector", EvidenceCreatedAt: createdAt,
		Trust: TrustCIAttested, Retention: RetentionSession,
		NonceHash: secretHash(nonce), Statement: statement,
		StatementDigest: statementDigest, StatementBytes: statementBytes,
	}, presentation
}

func signAttestationPresentation(
	t *testing.T,
	privateKey ed25519.PrivateKey,
	presentation *AttestationPresentation,
) {
	t.Helper()
	claimsBytes, err := canonicalBytes(attestationClaimSetForPresentation(*presentation))
	if err != nil {
		t.Fatal(err)
	}
	presentation.Signature = base64.RawStdEncoding.EncodeToString(
		ed25519.Sign(privateKey, claimsBytes),
	)
}

func mustDecodeSignature(t *testing.T, value string) []byte {
	t.Helper()
	decoded, err := decodeSignature(value)
	if err != nil {
		t.Fatal(err)
	}
	return decoded
}
