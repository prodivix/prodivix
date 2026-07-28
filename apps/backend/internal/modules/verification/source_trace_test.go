package verification

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestSourceTraceAcceptsEveryDiagnosticsTargetKind(t *testing.T) {
	t.Parallel()
	digest := repeatedDigest('a')
	refs := []DiagnosticTargetRef{
		{Kind: "workspace", WorkspaceID: "workspace"},
		{Kind: "workspace-node", WorkspaceID: "workspace", NodeID: "node"},
		{Kind: "document", WorkspaceID: "workspace", DocumentID: "document"},
		{Kind: "pir-node", DocumentID: "document", NodeID: "node"},
		{Kind: "inspector-field", DocumentID: "document", NodeID: "node", FieldPath: "props.title"},
		{Kind: "route", RouteID: "route"},
		{Kind: "nodegraph-node", DocumentID: "document", NodeID: "node"},
		{Kind: "nodegraph-port", DocumentID: "document", NodeID: "node", PortID: "port"},
		{Kind: "animation-timeline", DocumentID: "document", TimelineID: "timeline"},
		{
			Kind: "animation-track", DocumentID: "document", TimelineID: "timeline",
			BindingID: "binding", TrackID: "track",
		},
		{Kind: "data-source", DocumentID: "document"},
		{Kind: "data-operation", DocumentID: "document", OperationID: "operation"},
		{Kind: "code-artifact", ArtifactID: "artifact"},
		{Kind: "behavior-scenario", DocumentID: "document"},
		{Kind: "behavior-step", DocumentID: "document", StepID: "step", AssertionID: "assertion"},
		{Kind: "behavior-replay-record", PlanDigest: digest, CellID: "cell", AttemptID: "attempt"},
		{Kind: "verification-policy", DocumentID: "document"},
		{Kind: "verification-plan-cell", PlanDigest: digest, CellID: "cell"},
		{Kind: "verification-evidence", PlanDigest: digest, CellID: "cell", AttemptID: "attempt"},
		{Kind: "verification-closure", PlanDigest: digest},
		{Kind: "operation", Operation: "workspace.transaction.apply"},
		{Kind: "theme-token", ThemeID: "theme", TokenPath: "color.primary"},
		{Kind: "viewport", RouteID: "route", Width: 1280, Height: 720},
		{Kind: "runtime-dom", RouteID: "route", StablePath: "root/section[0]"},
		{Kind: "component-slot", DocumentID: "document", NodeID: "node", SlotName: "content"},
	}
	if len(refs) != len(sourceRefShapes) {
		t.Fatalf("source ref contract drifted: test=%d shapes=%d", len(refs), len(sourceRefShapes))
	}
	for _, ref := range refs {
		ref := ref
		t.Run(ref.Kind, func(t *testing.T) {
			t.Parallel()
			if err := validateSourceRef(ref); err != nil {
				t.Fatalf("valid %s source ref was rejected: %v", ref.Kind, err)
			}
		})
	}
}

func TestCandidateSourceTracesNormalizeAndBindArtifacts(t *testing.T) {
	t.Parallel()
	candidate := verificationVectorCandidate(t, []byte(`{"ok":true}`), "source-order")
	workspaceTrace := VerificationEvidenceSourceTrace{
		SourceRef: DiagnosticTargetRef{Kind: "workspace", WorkspaceID: candidate.WorkspaceID},
		Label:     "Workspace",
	}
	candidate.SourceTraces = append(candidate.SourceTraces, workspaceTrace)
	normalized, err := normalizeSourceTraceSet(candidate.SourceTraces)
	if err != nil {
		t.Fatal(err)
	}
	candidate.SourceTraceDigest = normalized.digest
	candidate.Artifacts[0].SourceTraceDigest = mustCanonicalDigest(t, workspaceTrace)
	candidate.SourceTraces = []VerificationEvidenceSourceTrace{
		normalized.traces[1],
		normalized.traces[0],
	}
	canonicalCandidate := candidate
	canonicalCandidate.SourceTraces = normalized.traces
	canonicalCandidate.CandidateDigest = ""
	candidate.CandidateDigest = mustDigestWithoutField(t, canonicalCandidate, "candidateDigest")

	validator := NewCandidateValidator(nil)
	validator.now = func() time.Time { return mustVectorTime(t, vectorNowText) }
	if _, err := validator.Validate(&candidate, candidate.WorkspaceID); err != nil {
		t.Fatalf("valid unsorted source traces were not normalized: %v", err)
	}
	actual, err := canonicalBytes(candidate.SourceTraces)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, normalized.encoded) {
		t.Fatalf("source traces were not canonically sorted: %s", actual)
	}
}

func TestSourceTraceValidationFailsClosed(t *testing.T) {
	t.Parallel()
	validTrace := VerificationEvidenceSourceTrace{
		SourceRef: DiagnosticTargetRef{
			Kind:       "verification-plan-cell",
			PlanDigest: repeatedDigest('d'),
			CellID:     "cell",
		},
		Label: "Confirmed source",
	}
	for name, traces := range map[string][]VerificationEvidenceSourceTrace{
		"empty": {},
		"unsupported-kind": {{
			SourceRef: DiagnosticTargetRef{Kind: "unsupported", WorkspaceID: "workspace"},
		}},
		"cross-kind-field": {{
			SourceRef: DiagnosticTargetRef{
				Kind: "workspace", WorkspaceID: "workspace", RouteID: "route",
			},
		}},
		"non-nfc-label": {{
			SourceRef: validTrace.SourceRef,
			Label:     "Cafe\u0301",
		}},
		"oversized-label": {{
			SourceRef: validTrace.SourceRef,
			Label:     strings.Repeat("x", maximumSourceTraceLabelBytes+1),
		}},
		"reversed-span": {{
			SourceRef: validTrace.SourceRef,
			SourceSpan: &SourceSpan{
				ArtifactID: "artifact", StartLine: 9, StartColumn: 2,
				EndLine: 9, EndColumn: 1,
			},
		}},
	} {
		name, traces := name, traces
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := normalizeSourceTraceSet(traces); !errors.Is(err, ErrInvalid) {
				t.Fatalf("invalid source traces were not rejected: %v", err)
			}
		})
	}

	tooMany := make([]VerificationEvidenceSourceTrace, maximumSourceTraces+1)
	for index := range tooMany {
		tooMany[index] = validTrace
	}
	if _, err := normalizeSourceTraceSet(tooMany); !errors.Is(err, ErrInvalid) {
		t.Fatalf("source trace count budget was not enforced: %v", err)
	}

	tooLarge := make([]VerificationEvidenceSourceTrace, maximumSourceTraces)
	for index := range tooLarge {
		tooLarge[index] = VerificationEvidenceSourceTrace{
			SourceRef: DiagnosticTargetRef{
				Kind:       "verification-plan-cell",
				PlanDigest: repeatedDigest('d'),
				CellID:     fmt.Sprintf("cell-%03d", index),
			},
			Label: strings.Repeat("x", maximumSourceTraceLabelBytes),
		}
	}
	if _, err := normalizeSourceTraceSet(tooLarge); !errors.Is(err, ErrInvalid) {
		t.Fatalf("source trace byte budget was not enforced: %v", err)
	}
}

func TestCandidateSourceTraceDigestAndArtifactBindingFailClosed(t *testing.T) {
	t.Parallel()
	for name, mutate := range map[string]func(*EvidenceCandidate){
		"set-digest": func(candidate *EvidenceCandidate) {
			candidate.SourceTraceDigest = repeatedDigest('0')
		},
		"artifact-trace": func(candidate *EvidenceCandidate) {
			candidate.Artifacts[0].SourceTraceDigest = repeatedDigest('0')
		},
	} {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			candidate := verificationVectorCandidate(t, []byte(`{"ok":true}`), "trace-"+name)
			mutate(&candidate)
			candidate.CandidateDigest = mustDigestWithoutField(t, candidate, "candidateDigest")
			validator := NewCandidateValidator(nil)
			validator.now = func() time.Time { return mustVectorTime(t, vectorNowText) }
			if _, err := validator.Validate(&candidate, candidate.WorkspaceID); !errors.Is(err, ErrInvalid) {
				t.Fatalf("invalid source trace binding was not rejected: %v", err)
			}
		})
	}
}

func TestSourceTraceStrictJSONRejectsRawSourceAndExcerpt(t *testing.T) {
	t.Parallel()
	for _, body := range [][]byte{
		[]byte(`[{"sourceRef":{"kind":"workspace","workspaceId":"workspace","source":"secret"}}]`),
		[]byte(`[{"sourceRef":{"kind":"workspace","workspaceId":"workspace"},"excerpt":"secret"}]`),
	} {
		var traces []VerificationEvidenceSourceTrace
		if err := jsonUnmarshalStrictStored(body, &traces); err == nil {
			t.Fatalf("out-of-contract source material was accepted: %s", body)
		}
	}
}

func TestSourceTraceWirePresenceCannotHideKindOrNullViolations(t *testing.T) {
	t.Parallel()
	for _, body := range [][]byte{
		[]byte(`[{"sourceRef":{"kind":"workspace","workspaceId":"workspace","width":0}}]`),
		[]byte(`[{"sourceRef":{"kind":"workspace","workspaceId":"workspace","routeId":null}}]`),
		[]byte(`[{"sourceRef":{"kind":"workspace","workspaceId":"workspace"},"label":null}]`),
		[]byte(`[{"sourceRef":{"kind":"workspace","workspaceId":"workspace"},"sourceSpan":null}]`),
	} {
		var traces []VerificationEvidenceSourceTrace
		if err := jsonUnmarshalStrictStored(body, &traces); err != nil {
			t.Fatalf("wire presence fixture did not decode: %v", err)
		}
		if _, err := normalizeSourceTraceSet(traces); !errors.Is(err, ErrInvalid) {
			t.Fatalf("hidden union/null violation was accepted: body=%s err=%v", body, err)
		}
	}
}

func TestEvidenceSourceTraceProjectionRequiresCanonicalBindings(t *testing.T) {
	t.Parallel()
	traces := []VerificationEvidenceSourceTrace{
		{
			SourceRef: DiagnosticTargetRef{
				Kind:       "verification-plan-cell",
				PlanDigest: repeatedDigest('d'),
				CellID:     "cell",
			},
			Label: "Cell",
		},
		{
			SourceRef: DiagnosticTargetRef{Kind: "workspace", WorkspaceID: "workspace"},
			Label:     "Workspace",
		},
	}
	normalized, err := normalizeSourceTraceSet(traces)
	if err != nil {
		t.Fatal(err)
	}
	evidence := VerificationEvidence{
		SourceTraces:      normalized.traces,
		SourceTraceDigest: normalized.digest,
		Artifacts: []ArtifactManifest{{
			ID: "artifact", SourceTraceDigest: mustCanonicalDigest(t, normalized.traces[0]),
		}},
	}
	if err := validateEvidenceSourceTraces(evidence); err != nil {
		t.Fatalf("valid Evidence source traces were rejected: %v", err)
	}

	reversed := evidence
	reversed.SourceTraces = []VerificationEvidenceSourceTrace{
		evidence.SourceTraces[1],
		evidence.SourceTraces[0],
	}
	if err := validateEvidenceSourceTraces(reversed); !errors.Is(err, ErrConflict) {
		t.Fatalf("non-canonical durable trace ordering was accepted: %v", err)
	}
	tampered := evidence
	tampered.SourceTraces = append([]VerificationEvidenceSourceTrace(nil), evidence.SourceTraces...)
	tampered.SourceTraces[0].Label = "Tampered"
	if err := validateEvidenceSourceTraces(tampered); !errors.Is(err, ErrConflict) {
		t.Fatalf("tampered durable trace was accepted: %v", err)
	}
	brokenArtifact := evidence
	brokenArtifact.Artifacts = append([]ArtifactManifest(nil), evidence.Artifacts...)
	brokenArtifact.Artifacts[0].SourceTraceDigest = repeatedDigest('0')
	if err := validateEvidenceSourceTraces(brokenArtifact); !errors.Is(err, ErrConflict) {
		t.Fatalf("unbound artifact trace digest was accepted: %v", err)
	}
}
