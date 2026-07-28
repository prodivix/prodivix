package verification

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

const (
	vectorNowText      = "2026-07-28T00:00:02.000Z"
	vectorDeadlineText = "2026-07-28T00:10:00.000Z"
)

func repeatedDigest(character byte) string {
	value := make([]byte, 64)
	for index := range value {
		value[index] = character
	}
	return "sha256-" + string(value)
}

func verificationVectorCIIdentity() *CIRepositoryIdentity {
	return &CIRepositoryIdentity{
		Repository: "github:prodivix/prodivix",
		Ref:        "refs/heads/main",
		Commit:     "sha1-0123456789abcdef0123456789abcdef01234567",
	}
}

func verificationVectorCandidate(t *testing.T, artifactBody []byte, attemptSuffix string) EvidenceCandidate {
	t.Helper()
	if attemptSuffix == "" {
		attemptSuffix = "vector"
	}
	summary := json.RawMessage(`{"decimal":1.25,"integer":9007199254740991,"tiny":0.000001,"é":"café","😀":"雪"}`)
	result := NormalizedResult{
		Outcome: "passed", Summary: summary,
		DiagnosticCodes: []string{}, AppliedExemptionIDs: []string{},
	}
	result.NormalizedResultDigest = mustCanonicalDigest(t, struct {
		Outcome             string          `json:"outcome"`
		Summary             json.RawMessage `json:"summary"`
		DiagnosticCodes     []string        `json:"diagnosticCodes"`
		AppliedExemptionIDs []string        `json:"appliedExemptionIds"`
	}{
		Outcome: result.Outcome, Summary: result.Summary,
		DiagnosticCodes:     result.DiagnosticCodes,
		AppliedExemptionIDs: result.AppliedExemptionIDs,
	})
	artifacts := []CandidateArtifact{}
	if artifactBody != nil {
		artifacts = append(artifacts, CandidateArtifact{
			ID: "artifact-" + attemptSuffix, Path: "reports/" + attemptSuffix + ".json",
			StagingArtifactID: "staging-" + attemptSuffix,
			Kind:              ArtifactReplayRecord, ExpectedDigest: digestBytes(artifactBody),
			ExpectedSize: int64(len(artifactBody)), ExpectedMediaType: "application/json",
		})
	}
	idempotencyKey := "idempotency-" + attemptSuffix
	if attemptSuffix == "vector" {
		idempotencyKey = "idempotency-key-1"
	}
	sourceTraces := verificationVectorSourceTraces()
	if len(artifacts) > 0 {
		artifacts[0].SourceTraceDigest = mustCanonicalDigest(t, sourceTraces[0])
	}
	candidate := EvidenceCandidate{
		CandidateID: "candidate-" + attemptSuffix, ProjectID: "project-vector",
		WorkspaceID: "workspace-vector", WorkspaceRevision: 0,
		PartitionRevisions: PartitionRevisions{
			WorkspaceRev: 0, RouteRev: 0, OpSeq: 0,
			DocumentRevisions: map[string]DocumentRevision{},
		},
		ExecutableSnapshotDigest: repeatedDigest('a'), PolicyRevision: 0,
		PolicyDigest: repeatedDigest('b'), ImpactDigest: repeatedDigest('c'),
		PlanDigest:              repeatedDigest('d'),
		PolicyEvaluationInstant: "2026-07-28T00:00:00.000Z",
		CellID:                  "cell-vector", CheckID: "check-vector", CheckKind: "unit",
		TargetID: "target-vector", AttemptID: "attempt-" + attemptSuffix,
		Run: RunIdentity{
			RunID: "run-" + attemptSuffix, ProviderID: "provider-vector",
			Surface: "preview", FrameworkTarget: "react-vite", RuntimeZone: "browser",
			Viewport:         ViewportIdentity{ID: "viewport-vector", Width: 1280, Height: 720},
			DevicePixelRatio: 1.25, ColorScheme: "dark", Motion: "reduced",
			Locale: "zh-CN", Timezone: "Asia/Shanghai",
			FontSetDigest: repeatedDigest('e'),
		},
		Timing: TimingIdentity{
			StartedAt:   "2026-07-28T00:00:00.000Z",
			CompletedAt: "2026-07-28T00:00:01.250Z", DurationMS: 1250,
		},
		Result: result,
		Provenance: CandidateProvenance{
			Origin: "local", ProducerID: "producer-vector", ProviderID: "provider-vector",
			IssuedAt:  "2026-07-28T00:00:01.250Z",
			ExpiresAt: "2026-07-29T00:00:00.000Z",
		},
		Toolchain: ImplementationIdentity{
			PackageName: "@prodivix/vector", PackageVersion: "1.2.3",
			BuildDigest: repeatedDigest('f'), ToolchainDigest: repeatedDigest('1'),
			SchemaDigest: repeatedDigest('2'),
		},
		Normalization: ImplementationIdentity{
			PackageName: "@prodivix/verification-normalizer", PackageVersion: "1.0.0",
			BuildDigest: repeatedDigest('9'), ToolchainDigest: repeatedDigest('a'),
			SchemaDigest: repeatedDigest('b'),
		},
		Controls: ControlIdentity{
			ProfileDigest: repeatedDigest('3'), AppliedDigest: repeatedDigest('4'),
		},
		Inputs: InputIdentity{
			ExecutableSnapshotDigest: repeatedDigest('a'),
			FixtureSetDigests:        []string{}, InputDigest: repeatedDigest('5'),
		},
		Artifacts: artifacts, SourceTraces: sourceTraces,
		SourceTraceDigest:    mustCanonicalDigest(t, sourceTraces),
		DependencyLockDigest: repeatedDigest('7'),
		Redaction: RedactionIdentity{
			PolicyID: "redaction-vector", ScannerSetDigest: repeatedDigest('8'),
			DroppedFieldCounts: map[string]int{"字段": 1}, Safe: true,
			TargetPolicy: TargetPolicy{
				Authority: "verification-policy", PolicyDigest: repeatedDigest('b'),
				SemanticTargetID: "target-vector", Capture: "allowed",
			},
		},
		RequestedRetention: RetentionSession,
		Promotion: PromotionIdentity{
			IdempotencyKey: idempotencyKey,
			Deadline:       vectorDeadlineText,
		},
	}
	candidate.CandidateDigest = mustDigestWithoutField(t, candidate, "candidateDigest")
	return candidate
}

func verificationVectorSourceTraces() []VerificationEvidenceSourceTrace {
	return []VerificationEvidenceSourceTrace{{
		SourceRef: DiagnosticTargetRef{
			Kind:       "verification-plan-cell",
			PlanDigest: repeatedDigest('d'),
			CellID:     "cell-vector",
		},
		Label: "向量",
	}}
}

func verificationReplayArtifactBody(t *testing.T, diagnosticCode string) []byte {
	t.Helper()
	diagnosticCodes := []string{}
	if diagnosticCode != "" {
		if validateIdentifier(diagnosticCode, "diagnosticCode") != nil {
			t.Fatalf("invalid replay fixture diagnostic code")
		}
		diagnosticCodes = append(diagnosticCodes, diagnosticCode)
	}
	body, err := canonicalBytes(map[string]any{
		"format":  artifactJSONFormat,
		"version": artifactJSONVersion,
		"kind":    string(ArtifactReplayRecord),
		"sourceTraceDigest": mustCanonicalDigest(
			t,
			verificationVectorSourceTraces()[0],
		),
		"summary": map[string]any{
			"eventCount":      1,
			"assertionCount":  1,
			"durationMs":      1,
			"outcome":         "passed",
			"diagnosticCodes": diagnosticCodes,
		},
	})
	if err != nil {
		t.Fatalf("encode replay artifact fixture: %v", err)
	}
	return body
}

func verificationConsoleArtifactBody(t *testing.T) []byte {
	t.Helper()
	body, err := canonicalBytes(map[string]any{
		"format":  artifactJSONFormat,
		"version": artifactJSONVersion,
		"kind":    string(ArtifactConsoleSummary),
		"sourceTraceDigest": mustCanonicalDigest(
			t,
			verificationVectorSourceTraces()[0],
		),
		"events": []any{},
	})
	if err != nil {
		t.Fatalf("encode console artifact fixture: %v", err)
	}
	return body
}

func mustCanonicalDigest(t *testing.T, value any) string {
	t.Helper()
	digest, _, err := canonicalDigest(value)
	if err != nil {
		t.Fatalf("canonical digest: %v", err)
	}
	return digest
}

func mustDigestWithoutField(t *testing.T, value any, field string) string {
	t.Helper()
	digest, _, err := digestWithoutField(value, field)
	if err != nil {
		t.Fatalf("canonical digest without %s: %v", field, err)
	}
	return digest
}

func mustVectorTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := parseInstant(value)
	if err != nil {
		t.Fatalf("parse fixture instant %q: %v", value, err)
	}
	return parsed
}

type allowVerificationPermissions struct{}

func (allowVerificationPermissions) ResolveWorkspaceExecutionPermissions(
	context.Context,
	string,
	string,
) ([]string, error) {
	return []string{"workspace.read", "workspace.write", "workspace.owner"}, nil
}
