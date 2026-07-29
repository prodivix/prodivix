package verification

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"testing"
)

func TestArtifactValidatorAcceptsBoundedClassSpecificJSONSchemas(t *testing.T) {
	for _, kind := range []ArtifactKind{
		ArtifactAccessibilityReport,
		ArtifactTrace,
		ArtifactNetworkSummary,
		ArtifactConsoleSummary,
		ArtifactCoverageSummary,
		ArtifactPerformanceProfile,
		ArtifactSecurityReport,
		ArtifactReplayRecord,
	} {
		t.Run(string(kind), func(t *testing.T) {
			body, sourceTraceDigest := classSpecificArtifactFixture(t, kind)
			mediaType := "application/json"
			if kind == ArtifactSecurityReport {
				mediaType = "application/vnd.prodivix.security-report+json"
			}
			validated, err := validateClassSpecificArtifact(
				t,
				kind,
				mediaType,
				body,
				sourceTraceDigest,
			)
			if err != nil {
				t.Fatalf("validate %s fixture: %v", kind, err)
			}
			var value any
			if err := json.Unmarshal(body, &value); err != nil {
				t.Fatal(err)
			}
			expectedDigest, _, err := canonicalDigest(value)
			if err != nil {
				t.Fatal(err)
			}
			if validated.NormalizedDigest != expectedDigest {
				t.Fatalf(
					"%s normalized digest = %q, want %q",
					kind,
					validated.NormalizedDigest,
					expectedDigest,
				)
			}
		})
	}
}

func TestArtifactValidatorRejectsUnknownFieldsForEveryJSONClass(t *testing.T) {
	for _, kind := range []ArtifactKind{
		ArtifactAccessibilityReport,
		ArtifactTrace,
		ArtifactNetworkSummary,
		ArtifactConsoleSummary,
		ArtifactCoverageSummary,
		ArtifactPerformanceProfile,
		ArtifactSecurityReport,
		ArtifactReplayRecord,
	} {
		t.Run(string(kind), func(t *testing.T) {
			value, sourceTraceDigest := classSpecificArtifactValue(kind)
			value["rawPayload"] = "must-not-survive"
			body := marshalArtifactFixture(t, value)
			_, err := validateClassSpecificArtifact(
				t,
				kind,
				"application/json",
				body,
				sourceTraceDigest,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("%s accepted an unknown field: %v", kind, err)
			}
		})
	}
}

func TestArtifactValidatorRejectsJSONEnvelopeAndClassConfusion(t *testing.T) {
	for name, mutate := range map[string]func(map[string]any){
		"format": func(value map[string]any) {
			value["format"] = "prodivix.verification-artifact.other"
		},
		"version": func(value map[string]any) {
			value["version"] = float64(2)
		},
		"kind": func(value map[string]any) {
			value["kind"] = string(ArtifactSecurityReport)
		},
		"missing": func(value map[string]any) {
			delete(value, "summary")
		},
	} {
		t.Run(name, func(t *testing.T) {
			value, sourceTraceDigest := classSpecificArtifactValue(
				ArtifactAccessibilityReport,
			)
			mutate(value)
			_, err := validateClassSpecificArtifact(
				t,
				ArtifactAccessibilityReport,
				"application/json",
				marshalArtifactFixture(t, value),
				sourceTraceDigest,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("invalid artifact envelope accepted: %v", err)
			}
		})
	}

	body := marshalArtifactFixture(t, map[string]any{
		"format":  artifactJSONFormat,
		"version": float64(artifactJSONVersion),
		"kind":    "future-report",
		"summary": map[string]any{},
	})
	if _, err := validateClassSpecificArtifact(
		t,
		ArtifactKind("future-report"),
		"application/json",
		body,
		"",
	); err == nil || !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("unknown JSON artifact kind accepted: %v", err)
	}
}

func TestArtifactValidatorHardCutsNetworkRequestMaterial(t *testing.T) {
	for _, forbidden := range []string{
		"query", "body", "headers", "cookie", "url",
	} {
		t.Run(forbidden, func(t *testing.T) {
			value, sourceTraceDigest := classSpecificArtifactValue(
				ArtifactNetworkSummary,
			)
			operations := value["operations"].([]any)
			operations[0].(map[string]any)[forbidden] = "forbidden"
			_, err := validateClassSpecificArtifact(
				t,
				ArtifactNetworkSummary,
				"application/json",
				marshalArtifactFixture(t, value),
				sourceTraceDigest,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("network %s material accepted: %v", forbidden, err)
			}
		})
	}
}

func TestArtifactValidatorHardCutsRawTraceConsoleAndFindingMaterial(t *testing.T) {
	for _, testCase := range []struct {
		name  string
		kind  ArtifactKind
		field string
		entry func(map[string]any) map[string]any
	}{
		{
			name: "trace-source", kind: ArtifactTrace, field: "source",
			entry: func(value map[string]any) map[string]any {
				return value["events"].([]any)[0].(map[string]any)
			},
		},
		{
			name: "trace-stack", kind: ArtifactTrace, field: "stack",
			entry: func(value map[string]any) map[string]any {
				return value["events"].([]any)[0].(map[string]any)
			},
		},
		{
			name: "trace-dom", kind: ArtifactTrace, field: "dom",
			entry: func(value map[string]any) map[string]any {
				return value["events"].([]any)[0].(map[string]any)
			},
		},
		{
			name: "console-message", kind: ArtifactConsoleSummary, field: "message",
			entry: func(value map[string]any) map[string]any {
				return value["events"].([]any)[0].(map[string]any)
			},
		},
		{
			name: "a11y-dom", kind: ArtifactAccessibilityReport, field: "dom",
			entry: func(value map[string]any) map[string]any {
				summary := value["summary"].(map[string]any)
				return summary["violations"].([]any)[0].(map[string]any)
			},
		},
		{
			name: "security-payload", kind: ArtifactSecurityReport, field: "payload",
			entry: func(value map[string]any) map[string]any {
				summary := value["summary"].(map[string]any)
				return summary["findings"].([]any)[0].(map[string]any)
			},
		},
		{
			name: "coverage-percentage", kind: ArtifactCoverageSummary, field: "percentage",
			entry: func(value map[string]any) map[string]any {
				summary := value["summary"].(map[string]any)
				return summary["lines"].(map[string]any)
			},
		},
		{
			name: "performance-raw-samples", kind: ArtifactPerformanceProfile, field: "rawSamples",
			entry: func(value map[string]any) map[string]any {
				return value["summary"].(map[string]any)
			},
		},
		{
			name: "replay-raw-events", kind: ArtifactReplayRecord, field: "events",
			entry: func(value map[string]any) map[string]any {
				return value["summary"].(map[string]any)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			value, sourceTraceDigest := classSpecificArtifactValue(testCase.kind)
			testCase.entry(value)[testCase.field] = "forbidden"
			_, err := validateClassSpecificArtifact(
				t,
				testCase.kind,
				"application/json",
				marshalArtifactFixture(t, value),
				sourceTraceDigest,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("%s raw material accepted: %v", testCase.name, err)
			}
		})
	}
}

func TestArtifactValidatorBindsStructuredLocationsToCandidateSourceTrace(t *testing.T) {
	for _, kind := range []ArtifactKind{
		ArtifactAccessibilityReport,
		ArtifactTrace,
		ArtifactConsoleSummary,
		ArtifactSecurityReport,
		ArtifactReplayRecord,
	} {
		t.Run(string(kind), func(t *testing.T) {
			value, sourceTraceDigest := classSpecificArtifactValue(kind)
			forged := repeatedDigest('7')
			switch kind {
			case ArtifactTrace, ArtifactConsoleSummary:
				value["sourceTraceDigest"] = forged
			case ArtifactReplayRecord:
				value["sourceTraceDigest"] = forged
			case ArtifactAccessibilityReport:
				summary := value["summary"].(map[string]any)
				violation := summary["violations"].([]any)[0].(map[string]any)
				violation["sourceTraceDigest"] = forged
			case ArtifactSecurityReport:
				summary := value["summary"].(map[string]any)
				finding := summary["findings"].([]any)[0].(map[string]any)
				finding["sourceTraceDigest"] = forged
			}
			_, err := validateClassSpecificArtifact(
				t,
				kind,
				"application/json",
				marshalArtifactFixture(t, value),
				sourceTraceDigest,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("%s accepted a forged source trace ref: %v", kind, err)
			}
		})
	}
}

func TestArtifactValidatorBindsArtifactSourceTraceToCandidateAuthority(t *testing.T) {
	candidate := verificationVectorCandidate(t, nil, "artifact-source-authority")
	artifact := CandidateArtifact{
		Kind:              ArtifactReplayRecord,
		ExpectedMediaType: "application/json",
		SourceTraceDigest: mustCanonicalDigest(t, candidate.SourceTraces[0]),
	}
	validator := NewArtifactValidator(nil)
	if err := validator.PreflightForCandidate(&candidate, artifact); err != nil {
		t.Fatalf("canonical candidate source trace was rejected: %v", err)
	}

	artifact.SourceTraceDigest = repeatedDigest('7')
	if err := validator.PreflightForCandidate(&candidate, artifact); err == nil ||
		!errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("unbound candidate source trace was accepted: %v", err)
	}
}

func TestArtifactValidatorEnforcesClassSpecificBudgets(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		kind   ArtifactKind
		mutate func(map[string]any)
	}{
		{
			name: "trace-events", kind: ArtifactTrace,
			mutate: func(value map[string]any) {
				event := value["events"].([]any)[0]
				value["events"] = make([]any, maximumArtifactTraceEvents+1)
				for index := range value["events"].([]any) {
					value["events"].([]any)[index] = event
				}
			},
		},
		{
			name: "network-operations", kind: ArtifactNetworkSummary,
			mutate: func(value map[string]any) {
				operation := value["operations"].([]any)[0]
				value["operations"] = make([]any, maximumArtifactNetworkOperations+1)
				for index := range value["operations"].([]any) {
					value["operations"].([]any)[index] = operation
				}
			},
		},
		{
			name: "console-events", kind: ArtifactConsoleSummary,
			mutate: func(value map[string]any) {
				event := value["events"].([]any)[0]
				value["events"] = make([]any, maximumArtifactConsoleEvents+1)
				for index := range value["events"].([]any) {
					value["events"].([]any)[index] = event
				}
			},
		},
		{
			name: "a11y-violations", kind: ArtifactAccessibilityReport,
			mutate: func(value map[string]any) {
				summary := value["summary"].(map[string]any)
				violation := summary["violations"].([]any)[0]
				summary["violations"] =
					make([]any, maximumArtifactAccessibilityViolations+1)
				for index := range summary["violations"].([]any) {
					summary["violations"].([]any)[index] = violation
				}
			},
		},
		{
			name: "coverage-total", kind: ArtifactCoverageSummary,
			mutate: func(value map[string]any) {
				summary := value["summary"].(map[string]any)
				summary["lines"].(map[string]any)["total"] =
					float64(maximumArtifactCount + 1)
			},
		},
		{
			name: "performance-duration", kind: ArtifactPerformanceProfile,
			mutate: func(value map[string]any) {
				value["summary"].(map[string]any)["durationMs"] =
					float64(maximumArtifactDurationMS + 1)
			},
		},
		{
			name: "security-findings", kind: ArtifactSecurityReport,
			mutate: func(value map[string]any) {
				finding := value["summary"].(map[string]any)["findings"].([]any)[0]
				value["summary"].(map[string]any)["findings"] =
					make([]any, maximumArtifactSecurityFindings+1)
				for index := range value["summary"].(map[string]any)["findings"].([]any) {
					value["summary"].(map[string]any)["findings"].([]any)[index] =
						finding
				}
			},
		},
		{
			name: "replay-events", kind: ArtifactReplayRecord,
			mutate: func(value map[string]any) {
				value["summary"].(map[string]any)["eventCount"] =
					float64(maximumArtifactCount + 1)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			value, sourceTraceDigest := classSpecificArtifactValue(testCase.kind)
			testCase.mutate(value)
			_, err := validateClassSpecificArtifact(
				t,
				testCase.kind,
				"application/json",
				marshalArtifactFixture(t, value),
				sourceTraceDigest,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("%s budget overflow accepted: %v", testCase.name, err)
			}
		})
	}
}

func TestArtifactValidatorEnforcesStructuredJSONByteBudget(t *testing.T) {
	body := bytes.Repeat([]byte{' '}, maximumArtifactJSONBytes+1)
	if err := validateArtifactJSONObject(body); err == nil {
		t.Fatal("structured JSON byte budget overflow was accepted")
	}
}

func TestArtifactValidatorAcceptsCanonicalMaximumTraceEventBudget(t *testing.T) {
	value, sourceTraceDigest := classSpecificArtifactValue(ArtifactTrace)
	template := value["events"].([]any)[0].(map[string]any)
	events := make([]any, maximumArtifactTraceEvents)
	for index := range events {
		event := make(map[string]any, len(template))
		for field, entry := range template {
			event[field] = entry
		}
		event["sequence"] = index
		event["eventId"] = "trace.event." + strconv.Itoa(index)
		events[index] = event
	}
	value["events"] = events
	if _, err := validateClassSpecificArtifact(
		t,
		ArtifactTrace,
		"application/json",
		marshalArtifactFixture(t, value),
		sourceTraceDigest,
	); err != nil {
		t.Fatalf("canonical maximum trace event budget was rejected: %v", err)
	}
}

func TestStructuredArtifactMediaMatchesCoreContract(t *testing.T) {
	for _, mediaType := range []string{
		"application/json",
		"application/vnd.prodivix.trace+json",
	} {
		if !allowedArtifactMedia(ArtifactTrace, mediaType) {
			t.Fatalf("Core structured media %q was rejected", mediaType)
		}
	}
	for _, mediaType := range []string{
		"text/prodivix+json",
		"application/+json",
		"text/plain",
	} {
		if allowedArtifactMedia(ArtifactTrace, mediaType) {
			t.Fatalf("non-Core structured media %q was accepted", mediaType)
		}
	}
	if !allowedArtifactMedia(ArtifactConsoleSummary, "application/json") ||
		allowedArtifactMedia(ArtifactConsoleSummary, "text/plain") {
		t.Fatal("console-summary media contract diverged from Core")
	}
	if _, err := validateClassSpecificArtifact(
		t,
		ArtifactTrace,
		"application/vnd.prodivix.trace+json",
		[]byte("not-json"),
		repeatedDigest('6'),
	); err == nil || !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("vendor JSON media bypassed JSON sniffing: %v", err)
	}
}

func TestArtifactValidatorRejectsLoneJSONSurrogatesWithoutRewriting(t *testing.T) {
	body, sourceTraceDigest := classSpecificArtifactFixture(
		t,
		ArtifactNetworkSummary,
	)
	validPair := bytes.Replace(
		body,
		[]byte(`/catalog/{itemId}`),
		[]byte(`/catalog/\uD83D\uDE00`),
		1,
	)
	if _, err := validateClassSpecificArtifact(
		t,
		ArtifactNetworkSummary,
		"application/json",
		validPair,
		sourceTraceDigest,
	); err != nil {
		t.Fatalf("valid surrogate pair was rejected: %v", err)
	}

	for name, replacement := range map[string][]byte{
		"high": []byte(`/catalog/\uD83D`),
		"low":  []byte(`/catalog/\uDE00`),
	} {
		t.Run(name, func(t *testing.T) {
			body := bytes.Replace(
				body,
				[]byte(`/catalog/{itemId}`),
				replacement,
				1,
			)
			_, err := validateClassSpecificArtifact(
				t,
				ArtifactNetworkSummary,
				"application/json",
				body,
				sourceTraceDigest,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("lone %s surrogate was accepted: %v", name, err)
			}
		})
	}
}

func TestArtifactValidatorRejectsEveryNegativeZeroSpelling(t *testing.T) {
	body, sourceTraceDigest := classSpecificArtifactFixture(t, ArtifactTrace)
	for _, spelling := range []string{"-0", "-0.0", "-0e0"} {
		t.Run(spelling, func(t *testing.T) {
			changed := bytes.Replace(
				body,
				[]byte(`"durationMs":4.25`),
				[]byte(`"durationMs":`+spelling),
				1,
			)
			if bytes.Equal(changed, body) {
				t.Fatal("negative-zero fixture replacement did not apply")
			}
			if _, err := validateClassSpecificArtifact(
				t,
				ArtifactTrace,
				"application/json",
				changed,
				sourceTraceDigest,
			); err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("negative zero %q was accepted: %v", spelling, err)
			}
		})
	}
}

func TestArtifactValidatorRejectsDuplicateEnvelopeMembersBeforeDecoding(t *testing.T) {
	body, sourceTraceDigest := classSpecificArtifactFixture(t, ArtifactTrace)
	duplicate := bytes.Replace(
		body,
		[]byte(`"format":"prodivix.verification-artifact"`),
		[]byte(
			`"format":"prodivix.verification-artifact.other",`+
				`"format":"prodivix.verification-artifact"`,
		),
		1,
	)
	if bytes.Equal(duplicate, body) {
		t.Fatal("duplicate-member fixture replacement did not apply")
	}
	if _, err := validateClassSpecificArtifact(
		t,
		ArtifactTrace,
		"application/json",
		duplicate,
		sourceTraceDigest,
	); err == nil || !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("duplicate envelope member was accepted: %v", err)
	}
}

func validateClassSpecificArtifact(
	t *testing.T,
	kind ArtifactKind,
	mediaType string,
	body []byte,
	sourceTraceDigest string,
) (ValidatedArtifact, error) {
	t.Helper()
	store, artifact, locator := stageArtifactValidationFixture(
		t,
		kind,
		mediaType,
		body,
	)
	artifact.SourceTraceDigest = sourceTraceDigest
	return NewArtifactValidator(nil).validateArtifactBody(
		context.Background(),
		store,
		artifact,
		locator,
	)
}

func classSpecificArtifactFixture(
	t *testing.T,
	kind ArtifactKind,
) ([]byte, string) {
	t.Helper()
	value, sourceTraceDigest := classSpecificArtifactValue(kind)
	return marshalArtifactFixture(t, value), sourceTraceDigest
}

func classSpecificArtifactValue(kind ArtifactKind) (map[string]any, string) {
	sourceTraceDigest := repeatedDigest('6')
	value := map[string]any{
		"format":  artifactJSONFormat,
		"version": artifactJSONVersion,
		"kind":    string(kind),
	}
	switch kind {
	case ArtifactAccessibilityReport:
		value["summary"] = map[string]any{
			"passed":     4,
			"failed":     1,
			"incomplete": 0,
			"violations": []any{map[string]any{
				"ruleId":            "a11y.color-contrast",
				"impact":            "serious",
				"nodeCount":         1,
				"diagnosticCodes":   []any{"A11Y_COLOR_CONTRAST"},
				"sourceTraceDigest": sourceTraceDigest,
			}},
		}
	case ArtifactTrace:
		value["sourceTraceDigest"] = sourceTraceDigest
		value["events"] = []any{map[string]any{
			"sequence":          0,
			"eventId":           "trace.navigation.0",
			"category":          "navigation",
			"timestampOffsetMs": 12.5,
			"durationMs":        4.25,
			"diagnosticCodes":   []any{},
			"sourceTraceDigest": sourceTraceDigest,
		}}
	case ArtifactNetworkSummary:
		value["operations"] = []any{map[string]any{
			"method":       "GET",
			"host":         "api.example.invalid",
			"pathTemplate": "/catalog/{itemId}",
			"status":       200,
			"timing": map[string]any{
				"startOffsetMs": 25.5,
				"durationMs":    31.75,
			},
			"operationId": "catalog.read",
		}}
	case ArtifactConsoleSummary:
		value["sourceTraceDigest"] = sourceTraceDigest
		value["events"] = []any{map[string]any{
			"sequence":          0,
			"eventId":           "console.error.0",
			"level":             "error",
			"timestampOffsetMs": 48.5,
			"diagnosticCodes":   []any{"RUNTIME_CONSOLE_ERROR"},
			"sourceTraceDigest": sourceTraceDigest,
		}}
	case ArtifactCoverageSummary:
		value["summary"] = map[string]any{
			"lines":      map[string]any{"covered": 90, "total": 100},
			"functions":  map[string]any{"covered": 18, "total": 20},
			"branches":   map[string]any{"covered": 42, "total": 50},
			"statements": map[string]any{"covered": 95, "total": 110},
		}
	case ArtifactPerformanceProfile:
		value["summary"] = map[string]any{
			"durationMs":               2500.25,
			"sampleCount":              250,
			"largestContentfulPaintMs": 1200.5,
			"cumulativeLayoutShift":    0.025,
			"interactionToNextPaintMs": nil,
			"totalBlockingTimeMs":      45.75,
		}
	case ArtifactSecurityReport:
		value["summary"] = map[string]any{
			"passed": 7,
			"failed": 1,
			"findings": []any{map[string]any{
				"ruleId":            "security.mixed-content",
				"severity":          "high",
				"count":             1,
				"diagnosticCodes":   []any{"SEC_MIXED_CONTENT"},
				"sourceTraceDigest": sourceTraceDigest,
			}},
		}
	case ArtifactReplayRecord:
		value["sourceTraceDigest"] = sourceTraceDigest
		value["summary"] = map[string]any{
			"eventCount":      12,
			"assertionCount":  3,
			"durationMs":      1800.5,
			"outcome":         "passed",
			"diagnosticCodes": []any{},
		}
	}
	return value, sourceTraceDigest
}

func marshalArtifactFixture(t *testing.T, value any) []byte {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal artifact fixture: %v", err)
	}
	return body
}

func validateStagedArtifactForCandidate(
	t *testing.T,
	validator *ArtifactValidator,
	candidate *EvidenceCandidate,
	kind ArtifactKind,
	mediaType string,
	body []byte,
) (ValidatedArtifact, error) {
	t.Helper()
	store, artifact, locator := stageArtifactValidationFixture(
		t,
		kind,
		mediaType,
		body,
	)
	return validator.ValidateForCandidate(
		context.Background(),
		store,
		candidate,
		artifact,
		locator,
	)
}

func validateStagedArtifact(
	t *testing.T,
	validator *ArtifactValidator,
	kind ArtifactKind,
	mediaType string,
	body []byte,
) (ValidatedArtifact, error) {
	t.Helper()
	store, artifact, locator := stageArtifactValidationFixture(
		t,
		kind,
		mediaType,
		body,
	)
	return validator.validateArtifactBody(
		context.Background(),
		store,
		artifact,
		locator,
	)
}

func stageArtifactValidationFixture(
	t *testing.T,
	kind ArtifactKind,
	mediaType string,
	body []byte,
) (ArtifactObjectStore, CandidateArtifact, string) {
	t.Helper()
	store, err := NewFilesystemArtifactStore(t.TempDir())
	if err != nil {
		t.Fatalf("create artifact store: %v", err)
	}
	staged, err := store.PutStaging(
		context.Background(),
		"promotion-security",
		"artifact-security",
		bytes.NewReader(body),
		int64(len(body)),
	)
	if err != nil {
		t.Fatalf("stage artifact: %v", err)
	}
	return store, artifactValidationCandidate(kind, mediaType, body), staged.Locator
}

func artifactValidationCandidate(
	kind ArtifactKind,
	mediaType string,
	body []byte,
) CandidateArtifact {
	return CandidateArtifact{
		ID:                "artifact-security",
		Path:              "reports/security",
		StagingArtifactID: "staging-security",
		Kind:              kind,
		ExpectedDigest:    digestBytes(body),
		ExpectedSize:      int64(len(body)),
		ExpectedMediaType: mediaType,
	}
}
