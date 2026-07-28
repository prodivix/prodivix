package verification

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"testing"
	"time"
)

func TestEvidenceManifestProjectionPreservesAndBindsCurrentTrustFields(t *testing.T) {
	manifest, evidence := localManifestFixture(t)
	if evidence.CheckKind != manifest.Statement.CheckKind ||
		evidence.TargetID != manifest.Statement.TargetID ||
		evidence.Normalization != verificationVectorNormalization() ||
		evidence.TargetPolicy != verificationVectorTargetPolicy() ||
		evidence.Run.Viewport != verificationVectorViewport() {
		t.Fatalf("current trust fields were dropped from Evidence: %#v", evidence)
	}

	mutations := map[string]func(*VerificationEvidenceManifest){
		"check-kind": func(value *VerificationEvidenceManifest) {
			value.Evidence.CheckKind = "security"
		},
		"target-id": func(value *VerificationEvidenceManifest) {
			value.Evidence.TargetID = "other-target"
		},
		"normalization": func(value *VerificationEvidenceManifest) {
			value.Evidence.Normalization.PackageVersion = "9.9.9"
		},
		"target-policy": func(value *VerificationEvidenceManifest) {
			value.Evidence.TargetPolicy.Capture = "masked"
		},
		"execution": func(value *VerificationEvidenceManifest) {
			value.Evidence.Run.Viewport.Width++
		},
		"policy-revision": func(value *VerificationEvidenceManifest) {
			value.Evidence.PolicyRevision++
		},
		"impact": func(value *VerificationEvidenceManifest) {
			value.Evidence.ImpactDigest = repeatedDigest('9')
		},
		"policy-evaluation-instant": func(value *VerificationEvidenceManifest) {
			value.Evidence.PolicyEvaluationInstant = "2026-07-28T00:00:01.000Z"
		},
		"timing": func(value *VerificationEvidenceManifest) {
			value.Evidence.Timing.DurationMS++
		},
		"controls": func(value *VerificationEvidenceManifest) {
			value.Evidence.Controls.AppliedDigest = repeatedDigest('9')
		},
		"dependency-lock": func(value *VerificationEvidenceManifest) {
			value.Evidence.DependencyLockDigest = repeatedDigest('9')
		},
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			changed := cloneEvidenceManifest(t, manifest)
			mutate(&changed)
			refreshManifestDigest(t, &changed)
			if _, err := projectEvidenceManifest(changed); err == nil {
				t.Fatal("self-digested manifest with a broken statement binding was accepted")
			}
		})
	}
}

func TestEvidenceCoreDigestBindsArtifactLogicalAndNormalizedIdentity(t *testing.T) {
	manifest := artifactManifestFixture(t)
	for name, mutate := range map[string]func(*VerificationEvidenceManifest){
		"normalized-digest": func(value *VerificationEvidenceManifest) {
			value.Evidence.Artifacts[0].NormalizedDigest = repeatedDigest('9')
		},
		"logical-path": func(value *VerificationEvidenceManifest) {
			value.Evidence.Artifacts[0].Path = "reports/renamed.json"
		},
		"source-trace": func(value *VerificationEvidenceManifest) {
			value.Evidence.Artifacts[0].SourceTraceDigest = ""
		},
	} {
		t.Run(name, func(t *testing.T) {
			changed := cloneEvidenceManifest(t, manifest)
			mutate(&changed)
			refreshManifestDigest(t, &changed)
			if _, err := projectEvidenceManifest(changed); err == nil {
				t.Fatal("self-digested manifest changed an artifact identity bound by EvidenceCoreDigest")
			}
		})
	}
}

func TestCIAttestedManifestPreservesExactRepositoryIdentityAcrossEveryProjection(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{0x42}, ed25519.SeedSize))
	verifier, err := NewEd25519AttestationVerifier([]AttestationKey{{
		ID: "ci-key-1", PublicKey: privateKey.Public().(ed25519.PublicKey),
		Issuer: "https://issuer.example", Audience: "prodivix-verification",
		Subject: "repo:prodivix/main", Trust: TrustCIAttested,
	}}, 7, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	promotion, presentation := signedAttestationFixture(t, privateKey)
	verified, err := verifier.Verify(
		context.Background(), promotion, presentation, mustVectorTime(t, vectorNowText),
	)
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{config: ServiceConfig{SessionRetention: time.Hour}}
	evidence, manifestBytes, _, err := service.buildEvidence(promotion, nil, verified)
	if err != nil {
		t.Fatal(err)
	}
	var manifest VerificationEvidenceManifest
	if err := jsonUnmarshalStrictStored(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	want := verificationVectorCIIdentity()
	if evidence.Provenance.CI == nil ||
		manifest.Statement.Producer.CI == nil ||
		manifest.VerifiedProvenance.Claims == nil ||
		manifest.VerifiedProvenance.Claims.CI == nil ||
		*evidence.Provenance.CI != *want ||
		*manifest.Statement.Producer.CI != *want ||
		*manifest.VerifiedProvenance.Claims.CI != *want {
		t.Fatalf("CI identity was not preserved exactly: %#v", manifest)
	}

	for name, mutate := range map[string]func(*VerificationEvidenceManifest){
		"evidence-ci": func(value *VerificationEvidenceManifest) {
			value.Evidence.Provenance.CI.Commit = "sha1-" + string(bytes.Repeat([]byte{'1'}, 40))
		},
		"claims-ci": func(value *VerificationEvidenceManifest) {
			value.VerifiedProvenance.Claims.CI.Ref = "refs/heads/other"
		},
		"missing-evidence-ci": func(value *VerificationEvidenceManifest) {
			value.Evidence.Provenance.CI = nil
		},
		"missing-claims-ci": func(value *VerificationEvidenceManifest) {
			value.VerifiedProvenance.Claims.CI = nil
		},
	} {
		t.Run(name, func(t *testing.T) {
			changed := cloneEvidenceManifest(t, manifest)
			mutate(&changed)
			refreshManifestDigest(t, &changed)
			if _, err := projectEvidenceManifest(changed); err == nil {
				t.Fatal("manifest with mismatched CI identity was accepted")
			}
		})
	}
}

func TestEvidenceComparisonCoversSemanticAndExecutionEnvironmentIdentity(t *testing.T) {
	_, base := localManifestFixture(t)
	exact, err := compareEvidence(base, base, nil)
	if err != nil || exact.Compatibility != "exact-compatible" ||
		len(exact.MismatchFields) != 0 {
		t.Fatalf("exact comparison = %#v, %v", exact, err)
	}

	checkKind := base
	checkKind.CheckKind = "security"
	incompatible, err := compareEvidence(base, checkKind, nil)
	if err != nil || incompatible.Compatibility != "incompatible" ||
		!containsComparisonField(incompatible.MismatchFields, "check-kind") {
		t.Fatalf("check-kind comparison = %#v, %v", incompatible, err)
	}

	target := base
	target.TargetID = "other-target"
	target.TargetPolicy.SemanticTargetID = target.TargetID
	incompatible, err = compareEvidence(base, target, nil)
	if err != nil || incompatible.Compatibility != "incompatible" ||
		!containsComparisonField(incompatible.MismatchFields, "target-id") ||
		!containsComparisonField(incompatible.MismatchFields, "target-policy") {
		t.Fatalf("semantic target comparison = %#v, %v", incompatible, err)
	}

	environment := base
	environment.Run.Viewport.Width++
	environment.Normalization.PackageVersion = "9.9.9"
	viewOnly, err := compareEvidence(base, environment, nil)
	if err != nil || viewOnly.Compatibility != "view-only" ||
		!containsComparisonField(viewOnly.MismatchFields, "viewport") ||
		!containsComparisonField(viewOnly.MismatchFields, "normalization-version") {
		t.Fatalf("environment comparison = %#v, %v", viewOnly, err)
	}
	policy := &ComparisonPolicy{
		ID: "comparison-policy-v5", Digest: repeatedDigest('9'),
		AllowedMismatchFields: []string{"normalization-version", "viewport"},
	}
	compatible, err := compareEvidence(base, environment, policy)
	if err != nil || compatible.Compatibility != "policy-compatible" {
		t.Fatalf("policy comparison = %#v, %v", compatible, err)
	}
}

func TestSupersessionLineageRejectsCrossTargetEvidence(t *testing.T) {
	_, previous := localManifestFixture(t)
	next := previous
	next.AttemptID = "attempt-next"
	next.PlanDigest = repeatedDigest('8')
	next.WorkspaceRevision++
	if !sameSupersessionLineage(previous, next) {
		t.Fatal("cross-Plan same-target retry was rejected as a supersession lineage")
	}
	next.TargetID = "target-other"
	next.TargetPolicy.SemanticTargetID = next.TargetID
	if sameSupersessionLineage(previous, next) {
		t.Fatal("cross-target Evidence was accepted as one supersession lineage")
	}
	next.TargetID = previous.TargetID
	next.CheckKind = "security"
	if sameSupersessionLineage(previous, next) {
		t.Fatal("cross-check-kind Evidence was accepted as one supersession lineage")
	}
}

func localManifestFixture(t *testing.T) (VerificationEvidenceManifest, VerificationEvidence) {
	t.Helper()
	candidate := verificationVectorCandidate(t, nil, "manifest")
	createdAt := mustVectorTime(t, vectorNowText)
	statement, statementDigest, statementBytes, err := buildEvidenceStatement(
		candidate, "evidence-manifest", createdAt, RetentionSession,
	)
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{config: ServiceConfig{SessionRetention: time.Hour}}
	evidence, manifestBytes, _, err := service.buildEvidence(Promotion{
		Candidate: candidate, CandidateDigest: candidate.CandidateDigest,
		EvidenceID: "evidence-manifest", EvidenceCreatedAt: createdAt,
		Trust: TrustLocalUnattested, Retention: RetentionSession,
		Statement: statement, StatementDigest: statementDigest,
		StatementBytes: statementBytes,
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	var manifest VerificationEvidenceManifest
	if err := jsonUnmarshalStrictStored(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	return manifest, evidence
}

func artifactManifestFixture(t *testing.T) VerificationEvidenceManifest {
	t.Helper()
	body := []byte(`{"fixture":"artifact-core"}`)
	candidate := verificationVectorCandidate(t, body, "manifest-artifact")
	createdAt := mustVectorTime(t, vectorNowText)
	candidateArtifact := candidate.Artifacts[0]
	artifact := ArtifactManifest{
		ID: candidateArtifact.ID, Path: candidateArtifact.Path,
		Kind: candidateArtifact.Kind, Digest: candidateArtifact.ExpectedDigest,
		NormalizedDigest:  repeatedDigest('0'),
		SourceTraceDigest: candidateArtifact.SourceTraceDigest,
		Size:              candidateArtifact.ExpectedSize, MediaType: candidateArtifact.ExpectedMediaType,
	}
	statementBody := materializeEvidenceBody(
		candidate,
		"evidence-manifest-artifact",
		createdAt,
		RetentionSession,
		[]ArtifactManifest{artifact},
		EvidenceProvenance{},
	)
	statement, statementDigest, statementBytes, err := buildEvidenceStatementForEvidence(
		candidate,
		statementBody,
	)
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{config: ServiceConfig{SessionRetention: time.Hour}}
	_, manifestBytes, _, err := service.buildEvidence(Promotion{
		Candidate: candidate, CandidateDigest: candidate.CandidateDigest,
		EvidenceID: "evidence-manifest-artifact", EvidenceCreatedAt: createdAt,
		Trust: TrustLocalUnattested, Retention: RetentionSession,
		Statement: statement, StatementDigest: statementDigest,
		StatementBytes: statementBytes,
	}, []CommittedArtifact{{
		Validated: ValidatedArtifact{
			Candidate: candidateArtifact, NormalizedDigest: artifact.NormalizedDigest,
		},
		Stored: StoredObject{
			Digest: artifact.Digest, Size: artifact.Size,
		},
	}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var manifest VerificationEvidenceManifest
	if err := jsonUnmarshalStrictStored(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	return manifest
}

func cloneEvidenceManifest(
	t *testing.T,
	manifest VerificationEvidenceManifest,
) VerificationEvidenceManifest {
	t.Helper()
	encoded, err := canonicalBytes(manifest)
	if err != nil {
		t.Fatal(err)
	}
	var clone VerificationEvidenceManifest
	if err := jsonUnmarshalStrictStored(encoded, &clone); err != nil {
		t.Fatal(err)
	}
	return clone
}

func refreshManifestDigest(t *testing.T, manifest *VerificationEvidenceManifest) {
	t.Helper()
	manifest.ManifestDigest = ""
	digest, _, err := digestWithoutField(*manifest, "manifestDigest")
	if err != nil {
		t.Fatal(err)
	}
	manifest.ManifestDigest = digest
}

func containsComparisonField(fields []string, expected string) bool {
	for _, field := range fields {
		if field == expected {
			return true
		}
	}
	return false
}

func verificationVectorNormalization() ImplementationIdentity {
	return ImplementationIdentity{
		PackageName: "@prodivix/verification-normalizer", PackageVersion: "1.0.0",
		BuildDigest: repeatedDigest('9'), ToolchainDigest: repeatedDigest('a'),
		SchemaDigest: repeatedDigest('b'),
	}
}

func verificationVectorTargetPolicy() TargetPolicy {
	return TargetPolicy{
		Authority: "verification-policy", PolicyDigest: repeatedDigest('b'),
		SemanticTargetID: "target-vector", Capture: "allowed",
	}
}

func verificationVectorViewport() ViewportIdentity {
	return ViewportIdentity{ID: "viewport-vector", Width: 1280, Height: 720}
}
