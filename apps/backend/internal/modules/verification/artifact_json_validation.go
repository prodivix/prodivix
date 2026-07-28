package verification

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"strings"
	"unicode/utf8"
)

const (
	artifactJSONFormat                     = "prodivix.verification-artifact"
	artifactJSONVersion                    = 1
	maximumArtifactJSONBytes               = 8 * 1024 * 1024
	maximumArtifactJSONMembers             = 100_000
	maximumArtifactJSONStringBytes         = 1024 * 1024
	maximumArtifactFieldBytes              = 512
	maximumArtifactPathTemplateBytes       = 1_024
	maximumArtifactDiagnosticRefs          = 128
	maximumArtifactDiagnosticsPerEntry     = 16
	maximumArtifactTraceEvents             = 4_096
	maximumArtifactConsoleEvents           = 2_048
	maximumArtifactNetworkOperations       = 2_048
	maximumArtifactAccessibilityViolations = 1_024
	maximumArtifactSecurityFindings        = 1_024
	maximumArtifactCount                   = 1_000_000_000
	maximumArtifactDurationMS              = 86_400_000
)

var (
	artifactEnvelopeFields = []string{"format", "version", "kind"}
	artifactTraceFields    = []string{
		"format", "version", "kind", "sourceTraceDigest", "events",
	}
	artifactSummaryFields = []string{"format", "version", "kind", "summary"}
	artifactReplayFields  = []string{
		"format", "version", "kind", "sourceTraceDigest", "summary",
	}
)

func isArtifactJSONMediaType(mediaType string) bool {
	return mediaTypePattern.MatchString(mediaType) &&
		(mediaType == "application/json" ||
			(strings.HasPrefix(mediaType, "application/") &&
				strings.HasSuffix(mediaType, "+json") &&
				len(mediaType) > len("application/+json")))
}

// validateArtifactJSONObject reuses the canonical JSON token validator while
// applying the artifact-specific byte budget. Candidate wire JSON remains
// independently capped by maximumCandidateBytes.
func validateArtifactJSONObject(body []byte) error {
	if len(body) == 0 || len(body) > maximumArtifactJSONBytes || !utf8.Valid(body) {
		return errors.New("artifact JSON is empty or exceeds its byte budget")
	}
	if err := validateJSONUnicodeEscapes(body); err != nil {
		return invalidJSONUnicodeEscapeError(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := validateJSONValueWithin(
		decoder,
		0,
		new(int),
		maximumJSONDepth,
		maximumArtifactJSONMembers,
		maximumArtifactJSONStringBytes,
	); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return errors.New("artifact JSON must contain exactly one value")
	}
	return nil
}

func validateArtifactJSONSchema(artifact CandidateArtifact, value any) error {
	var object map[string]any
	var ok bool
	switch artifact.Kind {
	case ArtifactTrace, ArtifactConsoleSummary:
		object, ok = exactArtifactJSONObject(value, artifactTraceFields, nil)
	case ArtifactReplayRecord:
		object, ok = exactArtifactJSONObject(value, artifactReplayFields, nil)
	case ArtifactAccessibilityReport, ArtifactCoverageSummary,
		ArtifactPerformanceProfile, ArtifactSecurityReport:
		object, ok = exactArtifactJSONObject(value, artifactSummaryFields, nil)
	case ArtifactNetworkSummary:
		object, ok = exactArtifactJSONObject(
			value,
			append(append([]string(nil), artifactEnvelopeFields...), "operations"),
			nil,
		)
	default:
		return errors.New("artifact kind has no structured schema")
	}
	if !ok ||
		object["format"] != artifactJSONFormat ||
		object["version"] != float64(artifactJSONVersion) ||
		object["kind"] != string(artifact.Kind) {
		return errors.New("artifact JSON envelope is invalid")
	}

	switch artifact.Kind {
	case ArtifactAccessibilityReport:
		return validateAccessibilityArtifactSummary(artifact, object["summary"])
	case ArtifactTrace:
		return validateTraceArtifact(artifact, object)
	case ArtifactNetworkSummary:
		return validateNetworkArtifactOperations(object["operations"])
	case ArtifactConsoleSummary:
		return validateConsoleArtifact(artifact, object)
	case ArtifactCoverageSummary:
		return validateCoverageArtifactSummary(object["summary"])
	case ArtifactPerformanceProfile:
		return validatePerformanceArtifactSummary(object["summary"])
	case ArtifactSecurityReport:
		return validateSecurityArtifactSummary(artifact, object["summary"])
	case ArtifactReplayRecord:
		return validateReplayArtifactSummary(artifact, object)
	default:
		return errors.New("artifact kind has no structured schema")
	}
}

func validateAccessibilityArtifactSummary(
	artifact CandidateArtifact,
	value any,
) error {
	summary, ok := exactArtifactJSONObject(
		value,
		[]string{"passed", "failed", "incomplete", "violations"},
		nil,
	)
	if !ok ||
		!artifactCountWithin(summary["passed"], maximumArtifactCount, true) ||
		!artifactCountWithin(summary["failed"], maximumArtifactCount, true) ||
		!artifactCountWithin(summary["incomplete"], maximumArtifactCount, true) {
		return errors.New("accessibility summary counts are invalid")
	}
	violations, ok := artifactJSONArray(
		summary["violations"],
		maximumArtifactAccessibilityViolations,
	)
	if !ok {
		return errors.New("accessibility violation budget exceeded")
	}
	diagnosticCount := 0
	for _, value := range violations {
		violation, ok := exactArtifactJSONObject(
			value,
			[]string{"ruleId", "impact", "nodeCount", "diagnosticCodes"},
			[]string{"sourceTraceDigest"},
		)
		if !ok ||
			!artifactIdentifier(violation["ruleId"]) ||
			!artifactStringEnum(
				violation["impact"],
				"minor", "moderate", "serious", "critical",
			) ||
			!artifactCountWithin(violation["nodeCount"], maximumArtifactCount, false) ||
			!validateArtifactDiagnosticRefs(
				violation["diagnosticCodes"],
				&diagnosticCount,
			) ||
			!validateOptionalArtifactSourceTrace(artifact, violation) {
			return errors.New("accessibility violation is invalid")
		}
	}
	return nil
}

func validateTraceArtifact(artifact CandidateArtifact, object map[string]any) error {
	if !validateArtifactSourceTrace(artifact, object["sourceTraceDigest"]) {
		return errors.New("trace artifact source trace is invalid")
	}
	events, ok := artifactJSONArray(object["events"], maximumArtifactTraceEvents)
	if !ok {
		return errors.New("trace event budget exceeded")
	}
	previousSequence := int64(-1)
	eventIDs := make(map[string]struct{}, len(events))
	diagnosticCount := 0
	for _, value := range events {
		event, ok := exactArtifactJSONObject(
			value,
			[]string{
				"sequence", "eventId", "category", "timestampOffsetMs",
				"durationMs", "diagnosticCodes",
			},
			[]string{"sourceTraceDigest"},
		)
		sequence, sequenceOK := artifactInteger(
			event["sequence"],
			maximumArtifactCount,
			true,
		)
		eventID, eventIDOK := artifactIdentifierValue(event["eventId"])
		if !ok || !sequenceOK || sequence <= previousSequence || !eventIDOK ||
			!artifactIdentifier(event["category"]) ||
			!artifactNumberWithin(
				event["timestampOffsetMs"],
				maximumArtifactDurationMS,
			) ||
			!artifactNumberWithin(event["durationMs"], maximumArtifactDurationMS) ||
			!validateArtifactDiagnosticRefs(
				event["diagnosticCodes"],
				&diagnosticCount,
			) ||
			!validateOptionalArtifactSourceTrace(artifact, event) {
			return errors.New("trace event is invalid")
		}
		if _, duplicate := eventIDs[eventID]; duplicate {
			return errors.New("trace event ids must be unique")
		}
		eventIDs[eventID] = struct{}{}
		previousSequence = sequence
	}
	return nil
}

func validateNetworkArtifactOperations(value any) error {
	operations, ok := artifactJSONArray(value, maximumArtifactNetworkOperations)
	if !ok {
		return errors.New("network operation budget exceeded")
	}
	operationIDs := make(map[string]struct{}, len(operations))
	for _, value := range operations {
		operation, ok := exactArtifactJSONObject(
			value,
			[]string{
				"method", "host", "pathTemplate", "status", "timing", "operationId",
			},
			nil,
		)
		operationID, operationIDOK := artifactIdentifierValue(operation["operationId"])
		status, statusOK := artifactInteger(operation["status"], 599, true)
		if !ok ||
			!artifactStringEnum(
				operation["method"],
				"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
			) ||
			!validArtifactHost(operation["host"]) ||
			!validArtifactPathTemplate(operation["pathTemplate"]) ||
			!statusOK || (status != 0 && status < 100) ||
			!validArtifactTiming(operation["timing"]) ||
			!operationIDOK {
			return errors.New("network operation is invalid")
		}
		if _, duplicate := operationIDs[operationID]; duplicate {
			return errors.New("network operation ids must be unique")
		}
		operationIDs[operationID] = struct{}{}
	}
	return nil
}

func validateConsoleArtifact(artifact CandidateArtifact, object map[string]any) error {
	if !validateArtifactSourceTrace(artifact, object["sourceTraceDigest"]) {
		return errors.New("console artifact source trace is invalid")
	}
	events, ok := artifactJSONArray(object["events"], maximumArtifactConsoleEvents)
	if !ok {
		return errors.New("console event budget exceeded")
	}
	previousSequence := int64(-1)
	eventIDs := make(map[string]struct{}, len(events))
	diagnosticCount := 0
	for _, value := range events {
		event, ok := exactArtifactJSONObject(
			value,
			[]string{
				"sequence", "eventId", "level", "timestampOffsetMs",
				"diagnosticCodes",
			},
			[]string{"sourceTraceDigest"},
		)
		sequence, sequenceOK := artifactInteger(
			event["sequence"],
			maximumArtifactCount,
			true,
		)
		eventID, eventIDOK := artifactIdentifierValue(event["eventId"])
		if !ok || !sequenceOK || sequence <= previousSequence || !eventIDOK ||
			!artifactStringEnum(event["level"], "debug", "info", "warning", "error") ||
			!artifactNumberWithin(
				event["timestampOffsetMs"],
				maximumArtifactDurationMS,
			) ||
			!validateArtifactDiagnosticRefs(
				event["diagnosticCodes"],
				&diagnosticCount,
			) ||
			!validateOptionalArtifactSourceTrace(artifact, event) {
			return errors.New("console event is invalid")
		}
		if _, duplicate := eventIDs[eventID]; duplicate {
			return errors.New("console event ids must be unique")
		}
		eventIDs[eventID] = struct{}{}
		previousSequence = sequence
	}
	return nil
}

func validateCoverageArtifactSummary(value any) error {
	summary, ok := exactArtifactJSONObject(
		value,
		[]string{"lines", "functions", "branches", "statements"},
		nil,
	)
	if !ok {
		return errors.New("coverage summary is invalid")
	}
	for _, field := range []string{"lines", "functions", "branches", "statements"} {
		metric, ok := exactArtifactJSONObject(
			summary[field],
			[]string{"covered", "total"},
			nil,
		)
		covered, coveredOK := artifactInteger(
			metric["covered"],
			maximumArtifactCount,
			true,
		)
		total, totalOK := artifactInteger(
			metric["total"],
			maximumArtifactCount,
			true,
		)
		if !ok || !coveredOK || !totalOK || covered > total {
			return errors.New("coverage metric is invalid")
		}
	}
	return nil
}

func validatePerformanceArtifactSummary(value any) error {
	summary, ok := exactArtifactJSONObject(
		value,
		[]string{
			"durationMs", "sampleCount", "largestContentfulPaintMs",
			"cumulativeLayoutShift", "interactionToNextPaintMs",
			"totalBlockingTimeMs",
		},
		nil,
	)
	if !ok ||
		!artifactNumberWithin(summary["durationMs"], maximumArtifactDurationMS) ||
		!artifactCountWithin(summary["sampleCount"], maximumArtifactCount, true) ||
		!artifactNullableNumberWithin(
			summary["largestContentfulPaintMs"],
			maximumArtifactDurationMS,
		) ||
		!artifactNullableNumberWithin(
			summary["cumulativeLayoutShift"],
			1_000,
		) ||
		!artifactNullableNumberWithin(
			summary["interactionToNextPaintMs"],
			maximumArtifactDurationMS,
		) ||
		!artifactNullableNumberWithin(
			summary["totalBlockingTimeMs"],
			maximumArtifactDurationMS,
		) {
		return errors.New("performance summary is invalid")
	}
	return nil
}

func validateSecurityArtifactSummary(
	artifact CandidateArtifact,
	value any,
) error {
	summary, ok := exactArtifactJSONObject(
		value,
		[]string{"passed", "failed", "findings"},
		nil,
	)
	if !ok ||
		!artifactCountWithin(summary["passed"], maximumArtifactCount, true) ||
		!artifactCountWithin(summary["failed"], maximumArtifactCount, true) {
		return errors.New("security summary counts are invalid")
	}
	findings, ok := artifactJSONArray(
		summary["findings"],
		maximumArtifactSecurityFindings,
	)
	if !ok {
		return errors.New("security finding budget exceeded")
	}
	diagnosticCount := 0
	for _, value := range findings {
		finding, ok := exactArtifactJSONObject(
			value,
			[]string{"ruleId", "severity", "count", "diagnosticCodes"},
			[]string{"sourceTraceDigest"},
		)
		if !ok ||
			!artifactIdentifier(finding["ruleId"]) ||
			!artifactStringEnum(
				finding["severity"],
				"info", "low", "medium", "high", "critical",
			) ||
			!artifactCountWithin(finding["count"], maximumArtifactCount, false) ||
			!validateArtifactDiagnosticRefs(
				finding["diagnosticCodes"],
				&diagnosticCount,
			) ||
			!validateOptionalArtifactSourceTrace(artifact, finding) {
			return errors.New("security finding is invalid")
		}
	}
	return nil
}

func validateReplayArtifactSummary(
	artifact CandidateArtifact,
	object map[string]any,
) error {
	if !validateArtifactSourceTrace(artifact, object["sourceTraceDigest"]) {
		return errors.New("replay artifact source trace is invalid")
	}
	summary, ok := exactArtifactJSONObject(
		object["summary"],
		[]string{
			"eventCount", "assertionCount", "durationMs", "outcome",
			"diagnosticCodes",
		},
		nil,
	)
	diagnosticCount := 0
	if !ok ||
		!artifactCountWithin(summary["eventCount"], maximumArtifactCount, true) ||
		!artifactCountWithin(summary["assertionCount"], maximumArtifactCount, true) ||
		!artifactNumberWithin(summary["durationMs"], maximumArtifactDurationMS) ||
		!artifactStringEnum(
			summary["outcome"],
			"passed", "failed", "blocked", "cancelled", "infrastructure-error",
		) ||
		!validateArtifactDiagnosticRefs(
			summary["diagnosticCodes"],
			&diagnosticCount,
		) {
		return errors.New("replay summary is invalid")
	}
	return nil
}

func exactArtifactJSONObject(
	value any,
	required []string,
	optional []string,
) (map[string]any, bool) {
	object, ok := value.(map[string]any)
	if !ok || len(object) < len(required) || len(object) > len(required)+len(optional) {
		return nil, false
	}
	allowed := make(map[string]struct{}, len(required)+len(optional))
	for _, field := range required {
		if _, present := object[field]; !present {
			return nil, false
		}
		allowed[field] = struct{}{}
	}
	for _, field := range optional {
		allowed[field] = struct{}{}
	}
	for field := range object {
		if _, present := allowed[field]; !present {
			return nil, false
		}
	}
	return object, true
}

func artifactJSONArray(value any, maximum int) ([]any, bool) {
	values, ok := value.([]any)
	return values, ok && len(values) <= maximum
}

func artifactInteger(value any, maximum int64, allowZero bool) (int64, bool) {
	number, ok := value.(float64)
	if !ok || math.IsNaN(number) || math.IsInf(number, 0) ||
		(number == 0 && math.Signbit(number)) ||
		math.Trunc(number) != number || number > float64(maximum) ||
		number < 0 || (!allowZero && number == 0) {
		return 0, false
	}
	return int64(number), true
}

func artifactCountWithin(value any, maximum int64, allowZero bool) bool {
	_, ok := artifactInteger(value, maximum, allowZero)
	return ok
}

func artifactNumberWithin(value any, maximum float64) bool {
	number, ok := value.(float64)
	return ok && !math.IsNaN(number) && !math.IsInf(number, 0) &&
		!(number == 0 && math.Signbit(number)) &&
		number >= 0 && number <= maximum
}

func artifactNullableNumberWithin(value any, maximum float64) bool {
	return value == nil || artifactNumberWithin(value, maximum)
}

func artifactIdentifier(value any) bool {
	_, ok := artifactIdentifierValue(value)
	return ok
}

func artifactIdentifierValue(value any) (string, bool) {
	text, ok := value.(string)
	return text, ok && len(text) <= maximumArtifactFieldBytes &&
		identifierPattern.MatchString(text)
}

func artifactStringEnum(value any, allowed ...string) bool {
	text, ok := value.(string)
	if !ok {
		return false
	}
	for _, candidate := range allowed {
		if text == candidate {
			return true
		}
	}
	return false
}

func validateArtifactDiagnosticRefs(value any, total *int) bool {
	diagnostics, ok := artifactJSONArray(value, maximumArtifactDiagnosticsPerEntry)
	if !ok {
		return false
	}
	previous := ""
	for _, value := range diagnostics {
		diagnostic, ok := artifactIdentifierValue(value)
		if !ok || (previous != "" && previous >= diagnostic) {
			return false
		}
		previous = diagnostic
		*total++
		if *total > maximumArtifactDiagnosticRefs {
			return false
		}
	}
	return true
}

func validateArtifactSourceTrace(artifact CandidateArtifact, value any) bool {
	digest, ok := value.(string)
	return ok && artifact.SourceTraceDigest != "" &&
		digest == artifact.SourceTraceDigest && digestPattern.MatchString(digest)
}

func validateOptionalArtifactSourceTrace(
	artifact CandidateArtifact,
	object map[string]any,
) bool {
	value, present := object["sourceTraceDigest"]
	return !present || validateArtifactSourceTrace(artifact, value)
}

func validArtifactHost(value any) bool {
	host, ok := value.(string)
	if !ok || len(host) < 1 || len(host) > 253 || host != strings.ToLower(host) ||
		strings.ContainsAny(host, ":/?#@\\") || strings.Contains(host, "..") {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) < 1 || len(label) > 63 ||
			label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, character := range label {
			if (character < 'a' || character > 'z') &&
				(character < '0' || character > '9') &&
				character != '-' {
				return false
			}
		}
	}
	return true
}

func validArtifactPathTemplate(value any) bool {
	pathTemplate, ok := value.(string)
	if !ok || len(pathTemplate) < 1 ||
		len(pathTemplate) > maximumArtifactPathTemplateBytes ||
		!strings.HasPrefix(pathTemplate, "/") ||
		strings.ContainsAny(pathTemplate, "?#\\") ||
		strings.Contains(pathTemplate, "://") {
		return false
	}
	for _, character := range pathTemplate {
		if character <= 0x1f || character == 0x7f {
			return false
		}
	}
	return true
}

func validArtifactTiming(value any) bool {
	timing, ok := exactArtifactJSONObject(
		value,
		[]string{"startOffsetMs", "durationMs"},
		nil,
	)
	return ok &&
		artifactNumberWithin(timing["startOffsetMs"], maximumArtifactDurationMS) &&
		artifactNumberWithin(timing["durationMs"], maximumArtifactDurationMS)
}
