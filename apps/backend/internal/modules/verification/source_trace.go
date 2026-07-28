package verification

import (
	"bytes"
	"encoding/json"
	"io"
	"sort"
)

const (
	maximumSourceTraces                = 256
	maximumSourceTraceBytes            = 256 * 1024
	maximumSourceTraceLabelBytes       = 1024
	maximumSourceRefTextBytes          = 4096
	maximumSafeInteger           int64 = 9007199254740991
)

type sourceRefFieldKind uint8

const (
	sourceRefIdentifier sourceRefFieldKind = iota
	sourceRefDigest
	sourceRefPositiveInteger
	sourceRefText
)

type sourceRefShape struct {
	required map[string]sourceRefFieldKind
	optional map[string]sourceRefFieldKind
}

var sourceRefShapes = map[string]sourceRefShape{
	"workspace": {
		required: map[string]sourceRefFieldKind{"workspaceId": sourceRefIdentifier},
	},
	"workspace-node": {
		required: map[string]sourceRefFieldKind{
			"workspaceId": sourceRefIdentifier,
			"nodeId":      sourceRefIdentifier,
		},
	},
	"document": {
		required: map[string]sourceRefFieldKind{"documentId": sourceRefIdentifier},
		optional: map[string]sourceRefFieldKind{"workspaceId": sourceRefIdentifier},
	},
	"pir-node": {
		required: map[string]sourceRefFieldKind{
			"documentId": sourceRefIdentifier,
			"nodeId":     sourceRefIdentifier,
		},
	},
	"inspector-field": {
		required: map[string]sourceRefFieldKind{
			"documentId": sourceRefIdentifier,
			"nodeId":     sourceRefIdentifier,
			"fieldPath":  sourceRefText,
		},
	},
	"route": {
		required: map[string]sourceRefFieldKind{"routeId": sourceRefIdentifier},
	},
	"nodegraph-node": {
		required: map[string]sourceRefFieldKind{
			"documentId": sourceRefIdentifier,
			"nodeId":     sourceRefIdentifier,
		},
	},
	"nodegraph-port": {
		required: map[string]sourceRefFieldKind{
			"documentId": sourceRefIdentifier,
			"nodeId":     sourceRefIdentifier,
			"portId":     sourceRefIdentifier,
		},
	},
	"animation-timeline": {
		required: map[string]sourceRefFieldKind{
			"documentId": sourceRefIdentifier,
			"timelineId": sourceRefIdentifier,
		},
	},
	"animation-track": {
		required: map[string]sourceRefFieldKind{
			"documentId": sourceRefIdentifier,
			"timelineId": sourceRefIdentifier,
			"bindingId":  sourceRefIdentifier,
			"trackId":    sourceRefIdentifier,
		},
	},
	"data-source": {
		required: map[string]sourceRefFieldKind{"documentId": sourceRefIdentifier},
	},
	"data-operation": {
		required: map[string]sourceRefFieldKind{
			"documentId":  sourceRefIdentifier,
			"operationId": sourceRefIdentifier,
		},
	},
	"code-artifact": {
		required: map[string]sourceRefFieldKind{"artifactId": sourceRefIdentifier},
	},
	"behavior-scenario": {
		required: map[string]sourceRefFieldKind{"documentId": sourceRefIdentifier},
	},
	"behavior-step": {
		required: map[string]sourceRefFieldKind{
			"documentId": sourceRefIdentifier,
			"stepId":     sourceRefIdentifier,
		},
		optional: map[string]sourceRefFieldKind{"assertionId": sourceRefIdentifier},
	},
	"behavior-replay-record": {
		required: map[string]sourceRefFieldKind{
			"planDigest": sourceRefDigest,
			"cellId":     sourceRefIdentifier,
			"attemptId":  sourceRefIdentifier,
		},
	},
	"verification-policy": {
		required: map[string]sourceRefFieldKind{"documentId": sourceRefIdentifier},
	},
	"verification-plan-cell": {
		required: map[string]sourceRefFieldKind{
			"planDigest": sourceRefDigest,
			"cellId":     sourceRefIdentifier,
		},
	},
	"verification-evidence": {
		required: map[string]sourceRefFieldKind{
			"planDigest": sourceRefDigest,
			"cellId":     sourceRefIdentifier,
			"attemptId":  sourceRefIdentifier,
		},
	},
	"verification-closure": {
		required: map[string]sourceRefFieldKind{"planDigest": sourceRefDigest},
	},
	"operation": {
		required: map[string]sourceRefFieldKind{"operation": sourceRefText},
	},
	"theme-token": {
		required: map[string]sourceRefFieldKind{
			"themeId":   sourceRefIdentifier,
			"tokenPath": sourceRefText,
		},
	},
	"viewport": {
		required: map[string]sourceRefFieldKind{
			"width":  sourceRefPositiveInteger,
			"height": sourceRefPositiveInteger,
		},
		optional: map[string]sourceRefFieldKind{"routeId": sourceRefIdentifier},
	},
	"runtime-dom": {
		required: map[string]sourceRefFieldKind{"stablePath": sourceRefText},
		optional: map[string]sourceRefFieldKind{"routeId": sourceRefIdentifier},
	},
	"component-slot": {
		required: map[string]sourceRefFieldKind{
			"documentId": sourceRefIdentifier,
			"nodeId":     sourceRefIdentifier,
			"slotName":   sourceRefIdentifier,
		},
	},
}

type sourceRefFieldValue struct {
	text    string
	number  int64
	present bool
}

func (ref *DiagnosticTargetRef) UnmarshalJSON(data []byte) error {
	type wire DiagnosticTargetRef
	var decoded wire
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return coded("VER-4002", "Source reference contains trailing JSON.", ErrInvalid)
		}
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	*ref = DiagnosticTargetRef(decoded)
	ref.presentFields = make(map[string]struct{}, len(fields))
	for field := range fields {
		ref.presentFields[field] = struct{}{}
	}
	return nil
}

func (trace *VerificationEvidenceSourceTrace) UnmarshalJSON(data []byte) error {
	type wire VerificationEvidenceSourceTrace
	var decoded wire
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return coded("VER-4002", "Source trace contains trailing JSON.", ErrInvalid)
		}
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	*trace = VerificationEvidenceSourceTrace(decoded)
	trace.presentFields = make(map[string]struct{}, len(fields))
	for field := range fields {
		trace.presentFields[field] = struct{}{}
	}
	return nil
}

func sourceRefFieldIsPresent(ref DiagnosticTargetRef, field string, inferred bool) bool {
	if ref.presentFields == nil {
		return inferred
	}
	_, present := ref.presentFields[field]
	return present
}

func sourceRefValues(ref DiagnosticTargetRef) map[string]sourceRefFieldValue {
	values := map[string]sourceRefFieldValue{
		"workspaceId": {
			text: ref.WorkspaceID, present: sourceRefFieldIsPresent(ref, "workspaceId", ref.WorkspaceID != ""),
		},
		"documentId": {
			text: ref.DocumentID, present: sourceRefFieldIsPresent(ref, "documentId", ref.DocumentID != ""),
		},
		"nodeId": {
			text: ref.NodeID, present: sourceRefFieldIsPresent(ref, "nodeId", ref.NodeID != ""),
		},
		"fieldPath": {
			text: ref.FieldPath, present: sourceRefFieldIsPresent(ref, "fieldPath", ref.FieldPath != ""),
		},
		"routeId": {
			text: ref.RouteID, present: sourceRefFieldIsPresent(ref, "routeId", ref.RouteID != ""),
		},
		"portId": {
			text: ref.PortID, present: sourceRefFieldIsPresent(ref, "portId", ref.PortID != ""),
		},
		"timelineId": {
			text: ref.TimelineID, present: sourceRefFieldIsPresent(ref, "timelineId", ref.TimelineID != ""),
		},
		"bindingId": {
			text: ref.BindingID, present: sourceRefFieldIsPresent(ref, "bindingId", ref.BindingID != ""),
		},
		"trackId": {
			text: ref.TrackID, present: sourceRefFieldIsPresent(ref, "trackId", ref.TrackID != ""),
		},
		"operationId": {
			text: ref.OperationID, present: sourceRefFieldIsPresent(ref, "operationId", ref.OperationID != ""),
		},
		"artifactId": {
			text: ref.ArtifactID, present: sourceRefFieldIsPresent(ref, "artifactId", ref.ArtifactID != ""),
		},
		"stepId": {
			text: ref.StepID, present: sourceRefFieldIsPresent(ref, "stepId", ref.StepID != ""),
		},
		"assertionId": {
			text: ref.AssertionID, present: sourceRefFieldIsPresent(ref, "assertionId", ref.AssertionID != ""),
		},
		"planDigest": {
			text: ref.PlanDigest, present: sourceRefFieldIsPresent(ref, "planDigest", ref.PlanDigest != ""),
		},
		"cellId": {
			text: ref.CellID, present: sourceRefFieldIsPresent(ref, "cellId", ref.CellID != ""),
		},
		"attemptId": {
			text: ref.AttemptID, present: sourceRefFieldIsPresent(ref, "attemptId", ref.AttemptID != ""),
		},
		"operation": {
			text: ref.Operation, present: sourceRefFieldIsPresent(ref, "operation", ref.Operation != ""),
		},
		"themeId": {
			text: ref.ThemeID, present: sourceRefFieldIsPresent(ref, "themeId", ref.ThemeID != ""),
		},
		"tokenPath": {
			text: ref.TokenPath, present: sourceRefFieldIsPresent(ref, "tokenPath", ref.TokenPath != ""),
		},
		"width": {
			number: ref.Width, present: sourceRefFieldIsPresent(ref, "width", ref.Width != 0),
		},
		"height": {
			number: ref.Height, present: sourceRefFieldIsPresent(ref, "height", ref.Height != 0),
		},
		"stablePath": {
			text: ref.StablePath, present: sourceRefFieldIsPresent(ref, "stablePath", ref.StablePath != ""),
		},
		"slotName": {
			text: ref.SlotName, present: sourceRefFieldIsPresent(ref, "slotName", ref.SlotName != ""),
		},
	}
	return values
}

func validateSourceRef(ref DiagnosticTargetRef) error {
	shape, ok := sourceRefShapes[ref.Kind]
	if !ok {
		return coded("VER-4002", "EvidenceCandidate contains an unsupported source reference kind.", ErrInvalid)
	}
	values := sourceRefValues(ref)
	for name, value := range values {
		requiredKind, required := shape.required[name]
		optionalKind, optional := shape.optional[name]
		if value.present && !required && !optional {
			return coded("VER-4002", "EvidenceCandidate source reference contains a field outside its selected kind.", ErrInvalid)
		}
		if required && !value.present {
			return coded("VER-4002", "EvidenceCandidate source reference is missing a required identity field.", ErrInvalid)
		}
		if !value.present {
			continue
		}
		fieldKind := optionalKind
		if required {
			fieldKind = requiredKind
		}
		switch fieldKind {
		case sourceRefIdentifier:
			if err := validateIdentifier(value.text, "sourceTraces.sourceRef."+name); err != nil {
				return err
			}
		case sourceRefDigest:
			if !digestPattern.MatchString(value.text) {
				return coded("VER-4002", "EvidenceCandidate source reference digest is invalid.", ErrInvalid)
			}
		case sourceRefPositiveInteger:
			if value.number < 1 || value.number > maximumSafeInteger {
				return coded("VER-4002", "EvidenceCandidate source reference coordinate is invalid.", ErrInvalid)
			}
		case sourceRefText:
			if err := validateCanonicalText(
				value.text,
				"sourceTraces.sourceRef."+name,
				maximumSourceRefTextBytes,
			); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateSourceSpan(span SourceSpan) error {
	if validateIdentifier(span.ArtifactID, "sourceTraces.sourceSpan.artifactId") != nil ||
		span.StartLine < 1 || span.StartLine > maximumSafeInteger ||
		span.StartColumn < 1 || span.StartColumn > maximumSafeInteger ||
		span.EndLine < 1 || span.EndLine > maximumSafeInteger ||
		span.EndColumn < 1 || span.EndColumn > maximumSafeInteger ||
		span.EndLine < span.StartLine ||
		(span.EndLine == span.StartLine && span.EndColumn < span.StartColumn) {
		return coded("VER-4002", "EvidenceCandidate source span is invalid.", ErrInvalid)
	}
	return nil
}

type normalizedSourceTraceSet struct {
	traces       []VerificationEvidenceSourceTrace
	traceDigests map[string]struct{}
	digest       string
	encoded      []byte
}

func normalizeSourceTraceSet(
	traces []VerificationEvidenceSourceTrace,
) (normalizedSourceTraceSet, error) {
	if len(traces) < 1 || len(traces) > maximumSourceTraces {
		return normalizedSourceTraceSet{}, coded(
			"VER-4002",
			"EvidenceCandidate source trace count is outside its budget.",
			ErrInvalid,
		)
	}
	type keyedTrace struct {
		key   string
		trace VerificationEvidenceSourceTrace
	}
	keyed := make([]keyedTrace, 0, len(traces))
	for _, trace := range traces {
		if err := validateSourceRef(trace.SourceRef); err != nil {
			return normalizedSourceTraceSet{}, err
		}
		_, sourceSpanPresent := trace.presentFields["sourceSpan"]
		if trace.SourceSpan != nil {
			if err := validateSourceSpan(*trace.SourceSpan); err != nil {
				return normalizedSourceTraceSet{}, err
			}
		} else if trace.presentFields != nil && sourceSpanPresent {
			return normalizedSourceTraceSet{}, coded(
				"VER-4002",
				"EvidenceCandidate source span must be a non-null object.",
				ErrInvalid,
			)
		}
		_, labelPresent := trace.presentFields["label"]
		if trace.Label != "" || trace.presentFields != nil && labelPresent {
			if err := validateCanonicalText(
				trace.Label,
				"sourceTraces.label",
				maximumSourceTraceLabelBytes,
			); err != nil {
				return normalizedSourceTraceSet{}, err
			}
		}
		cloned := trace
		if trace.SourceSpan != nil {
			span := *trace.SourceSpan
			cloned.SourceSpan = &span
		}
		encoded, err := canonicalBytes(cloned)
		if err != nil {
			return normalizedSourceTraceSet{}, coded(
				"VER-4002",
				"EvidenceCandidate source trace is not canonical JSON.",
				err,
			)
		}
		keyed = append(keyed, keyedTrace{key: string(encoded), trace: cloned})
	}
	sort.SliceStable(keyed, func(left, right int) bool {
		return keyed[left].key < keyed[right].key
	})
	normalized := make([]VerificationEvidenceSourceTrace, len(keyed))
	traceDigests := make(map[string]struct{}, len(keyed))
	for index, entry := range keyed {
		normalized[index] = entry.trace
		digest, _, err := canonicalDigest(entry.trace)
		if err != nil {
			return normalizedSourceTraceSet{}, err
		}
		traceDigests[digest] = struct{}{}
	}
	digest, encoded, err := canonicalDigest(normalized)
	if err != nil {
		return normalizedSourceTraceSet{}, err
	}
	if len(encoded) > maximumSourceTraceBytes {
		return normalizedSourceTraceSet{}, coded(
			"VER-4002",
			"EvidenceCandidate source traces exceed their canonical byte budget.",
			ErrInvalid,
		)
	}
	return normalizedSourceTraceSet{
		traces: normalized, traceDigests: traceDigests, digest: digest, encoded: encoded,
	}, nil
}

func normalizeCandidateSourceTraces(candidate *EvidenceCandidate) (map[string]struct{}, error) {
	normalized, err := normalizeSourceTraceSet(candidate.SourceTraces)
	if err != nil {
		return nil, err
	}
	if normalized.digest != candidate.SourceTraceDigest {
		return nil, coded(
			"VER-5001",
			"EvidenceCandidate source trace digest does not match its canonical source traces.",
			ErrInvalid,
		)
	}
	candidate.SourceTraces = normalized.traces
	return normalized.traceDigests, nil
}

func validateCandidateArtifactSourceTraces(
	artifacts []CandidateArtifact,
	traceDigests map[string]struct{},
) error {
	for _, artifact := range artifacts {
		if artifact.SourceTraceDigest == "" {
			continue
		}
		if _, ok := traceDigests[artifact.SourceTraceDigest]; !ok {
			return coded(
				"VER-5001",
				"EvidenceCandidate artifact source trace digest does not identify one canonical source trace.",
				ErrInvalid,
			)
		}
	}
	return nil
}

func validateEvidenceSourceTraces(evidence VerificationEvidence) error {
	normalized, err := normalizeSourceTraceSet(evidence.SourceTraces)
	if err != nil || normalized.digest != evidence.SourceTraceDigest {
		return ErrConflict
	}
	original, err := canonicalBytes(evidence.SourceTraces)
	if err != nil || !bytes.Equal(original, normalized.encoded) {
		return ErrConflict
	}
	for _, artifact := range evidence.Artifacts {
		if artifact.SourceTraceDigest == "" {
			continue
		}
		if _, ok := normalized.traceDigests[artifact.SourceTraceDigest]; !ok {
			return ErrConflict
		}
	}
	return nil
}
