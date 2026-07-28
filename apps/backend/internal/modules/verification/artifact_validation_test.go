package verification

import (
	"bytes"
	"compress/zlib"
	"context"
	"crypto/ed25519"
	"encoding/binary"
	"encoding/json"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
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

func TestArtifactValidatorAcceptsFullyDecodedBoundedRasterImages(t *testing.T) {
	for _, format := range []string{"png", "jpeg"} {
		t.Run(format, func(t *testing.T) {
			body := encodedArtifactImage(t, format, 3, 2)
			mediaType := "image/" + format
			if format == "jpeg" {
				mediaType = "image/jpeg"
			}
			validated, err := validateStagedArtifact(
				t,
				NewArtifactValidator(nil),
				ArtifactScreenshot,
				mediaType,
				body,
			)
			if err != nil {
				t.Fatalf("validate bounded %s raster: %v", format, err)
			}
			if validated.NormalizedDigest != digestBytes(body) {
				t.Fatalf("normalized digest = %q, want raw image digest", validated.NormalizedDigest)
			}
		})
	}
}

func TestArtifactValidatorDoesNotTextScanCompressedRasterBytes(t *testing.T) {
	body := pngWithLiteralRasterPayload(t, []byte("<script>"))
	if !bytes.Contains(body, []byte("<script>")) {
		t.Fatal("PNG fixture must expose the active-text canary inside its compressed stream")
	}
	if !bytes.Contains(body, []byte("IDAT")) {
		t.Fatal("PNG fixture is missing its Secret canary chunk type")
	}
	if _, err := validateStagedArtifact(
		t,
		NewArtifactValidator(NewCandidateValidator([]string{"IDAT"})),
		ArtifactScreenshot,
		"image/png",
		body,
	); err != nil {
		t.Fatalf("valid compressed raster bytes were treated as text: %v", err)
	}
}

func TestArtifactValidatorRejectsCorruptRasterPayloadsAfterStructuralChecks(t *testing.T) {
	validPNG := encodedArtifactImage(t, "png", 3, 2)
	corruptPNG := corruptArtifactPNGIDAT(t, validPNG)
	if !strictPNG(corruptPNG) {
		t.Fatal("corrupt PNG fixture must retain the allowed chunk structure")
	}

	validJPEG := encodedArtifactImage(t, "jpeg", 8, 8)
	corruptJPEG := truncateArtifactJPEGEntropy(t, validJPEG)
	if !strictJPEG(corruptJPEG) {
		t.Fatal("corrupt JPEG fixture must retain the allowed marker structure")
	}

	for name, fixture := range map[string]struct {
		mediaType string
		body      []byte
	}{
		"png-crc-and-idat": {
			mediaType: "image/png",
			body:      corruptPNG,
		},
		"jpeg-entropy": {
			mediaType: "image/jpeg",
			body:      corruptJPEG,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := validateStagedArtifact(
				t,
				NewArtifactValidator(nil),
				ArtifactScreenshot,
				fixture.mediaType,
				fixture.body,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("corrupt raster accepted: %v", err)
			}
		})
	}
}

func TestArtifactValidatorRejectsImageDecodeBombsBeforeRasterDecode(t *testing.T) {
	fixtures := map[string]struct {
		body      []byte
		mediaType string
		strict    func([]byte) bool
		config    func([]byte) error
	}{
		"png": {
			body:      oversizedArtifactPNG(maximumImageDimension+1, 1),
			mediaType: "image/png",
			strict:    strictPNG,
			config: func(body []byte) error {
				_, err := png.DecodeConfig(bytes.NewReader(body))
				return err
			},
		},
		"png-pixel-budget": {
			body:      oversizedArtifactPNG(maximumImageDimension, 5_000),
			mediaType: "image/png",
			strict:    strictPNG,
			config: func(body []byte) error {
				_, err := png.DecodeConfig(bytes.NewReader(body))
				return err
			},
		},
		"jpeg": {
			body: oversizedArtifactJPEG(
				t,
				encodedArtifactImage(t, "jpeg", 8, 8),
				maximumImageDimension+1,
				1,
			),
			mediaType: "image/jpeg",
			strict:    strictJPEG,
			config: func(body []byte) error {
				_, err := jpeg.DecodeConfig(bytes.NewReader(body))
				return err
			},
		},
	}
	for name, fixture := range fixtures {
		t.Run(name, func(t *testing.T) {
			if !fixture.strict(fixture.body) {
				t.Fatalf("oversized %s fixture must retain the allowed structure", name)
			}
			if err := fixture.config(fixture.body); err != nil {
				t.Fatalf("oversized %s config fixture is invalid: %v", name, err)
			}
			_, err := validateStagedArtifact(
				t,
				NewArtifactValidator(nil),
				ArtifactScreenshot,
				fixture.mediaType,
				fixture.body,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("%s image decode bomb accepted: %v", name, err)
			}
		})
	}
}

func TestArtifactValidatorRejectsImageStructuralBomb(t *testing.T) {
	header := make([]byte, 13)
	binary.BigEndian.PutUint32(header[0:4], 1)
	binary.BigEndian.PutUint32(header[4:8], 1)
	header[8], header[9] = 8, 2
	body := append([]byte(nil), 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n')
	body = appendArtifactPNGChunk(body, "IHDR", header)
	for range maximumImageStructuralEntries {
		body = appendArtifactPNGChunk(body, "IDAT", nil)
	}
	body = appendArtifactPNGChunk(body, "IEND", nil)

	if strictPNG(body) {
		t.Fatal("PNG structural bomb was accepted")
	}
	if _, err := validateStagedArtifact(
		t,
		NewArtifactValidator(nil),
		ArtifactScreenshot,
		"image/png",
		body,
	); err == nil || !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("PNG structural bomb reached durable acceptance: %v", err)
	}
}

func TestVerificationPromotionDiagnosticsKeepCanonicalClassification(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{0x35}, ed25519.SeedSize))
	attestationVerifier, err := NewEd25519AttestationVerifier([]AttestationKey{{
		ID: "ci-key-1", PublicKey: privateKey.Public().(ed25519.PublicKey),
		Issuer: "https://issuer.example", Audience: "prodivix-verification",
		Subject: "repo:prodivix/main", Trust: TrustCIAttested,
	}}, 7, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	promotion, presentation := signedAttestationFixture(t, privateKey)

	for _, testCase := range []struct {
		name string
		want string
		run  func(*testing.T) error
	}{
		{
			name: "digest-identity",
			want: "VER-5001",
			run: func(t *testing.T) error {
				store, artifact, locator := stageArtifactValidationFixture(
					t,
					ArtifactReplayRecord,
					"application/json",
					[]byte(`{"ok":true}`),
				)
				artifact.ExpectedDigest = repeatedDigest('0')
				_, err := NewArtifactValidator(nil).validateArtifactBody(
					context.Background(),
					store,
					artifact,
					locator,
				)
				return err
			},
		},
		{
			name: "secret-pii",
			want: "VER-5002",
			run: func(t *testing.T) error {
				_, err := validateStagedArtifact(
					t,
					NewArtifactValidator(nil),
					ArtifactBuildLog,
					"text/plain",
					[]byte("owner@example.invalid"),
				)
				return err
			},
		},
		{
			name: "attestation",
			want: "VER-5003",
			run: func(t *testing.T) error {
				changed := presentation
				changed.PlanDigest = repeatedDigest('9')
				_, err := attestationVerifier.Verify(
					context.Background(),
					promotion,
					changed,
					mustVectorTime(t, vectorNowText),
				)
				return err
			},
		},
		{
			name: "artifact-structure",
			want: "VER-5005",
			run: func(t *testing.T) error {
				body := corruptArtifactPNGIDAT(
					t,
					encodedArtifactImage(t, "png", 3, 2),
				)
				_, err := validateStagedArtifact(
					t,
					NewArtifactValidator(nil),
					ArtifactScreenshot,
					"image/png",
					body,
				)
				return err
			},
		},
		{
			name: "active-content",
			want: "VER-5005",
			run: func(t *testing.T) error {
				_, err := validateStagedArtifact(
					t,
					NewArtifactValidator(nil),
					ArtifactBuildLog,
					"text/plain",
					[]byte("<script>alert(1)</script>"),
				)
				return err
			},
		},
		{
			name: "archive",
			want: "VER-5005",
			run: func(t *testing.T) error {
				_, err := validateStagedArtifact(
					t,
					NewArtifactValidator(nil),
					ArtifactBuildLog,
					"text/plain",
					[]byte{'P', 'K', 0x03, 0x04, 0x00},
				)
				return err
			},
		},
		{
			name: "target-capture",
			want: "VER-5005",
			run: func(t *testing.T) error {
				candidate := &EvidenceCandidate{
					PolicyDigest: repeatedDigest('b'),
					TargetID:     "target-sensitive",
					Redaction: RedactionIdentity{TargetPolicy: TargetPolicy{
						Authority:        "verification-policy",
						PolicyDigest:     repeatedDigest('b'),
						SemanticTargetID: "target-sensitive",
						Capture:          "forbidden-sensitive",
					}},
				}
				return NewArtifactValidator(nil).PreflightForCandidate(
					candidate,
					artifactValidationCandidate(
						ArtifactScreenshot,
						"image/png",
						encodedArtifactImage(t, "png", 3, 2),
					),
				)
			},
		},
		{
			name: "object-store-boundary",
			want: "VER-5005",
			run: func(t *testing.T) error {
				store, err := NewFilesystemArtifactStore(t.TempDir())
				if err != nil {
					t.Fatal(err)
				}
				_, err = store.OpenStaging(context.Background(), "../escape")
				return err
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			err := testCase.run(t)
			if err == nil {
				t.Fatal("diagnostic fixture unexpectedly succeeded")
			}
			if got := diagnosticCode(err, "VER-5005"); got != testCase.want {
				t.Fatalf("diagnostic code = %q, want %q: %v", got, testCase.want, err)
			}
		})
	}
}

func TestArtifactValidatorEnforcesAuthoritativeTargetCapturePolicy(t *testing.T) {
	body := encodedArtifactImage(t, "png", 3, 2)
	base := &EvidenceCandidate{
		PolicyDigest: repeatedDigest('b'),
		TargetID:     "target-raster",
	}
	base.Redaction.TargetPolicy = TargetPolicy{
		Authority:        "verification-policy",
		PolicyDigest:     base.PolicyDigest,
		SemanticTargetID: base.TargetID,
		Capture:          "allowed",
	}

	for _, capture := range []string{"allowed", "masked"} {
		t.Run(capture, func(t *testing.T) {
			candidate := *base
			candidate.Redaction.TargetPolicy.Capture = capture
			if _, err := validateStagedArtifactForCandidate(
				t,
				NewArtifactValidator(nil),
				&candidate,
				ArtifactScreenshot,
				"image/png",
				body,
			); err != nil {
				t.Fatalf("%s target policy rejected a valid bounded image: %v", capture, err)
			}
		})
	}

	t.Run("forbidden-sensitive", func(t *testing.T) {
		candidate := *base
		candidate.Redaction.TargetPolicy.Capture = "forbidden-sensitive"
		probe := &artifactStoreAccessProbe{}
		_, err := NewArtifactValidator(nil).ValidateForCandidate(
			context.Background(),
			probe,
			&candidate,
			artifactValidationCandidate(ArtifactScreenshot, "image/png", body),
			"staging/forbidden-must-not-exist",
		)
		if err == nil || !errors.Is(err, ErrArtifactRejected) {
			t.Fatalf("sensitive target image capture was accepted: %v", err)
		}
		if probe.openCalls != 0 {
			t.Fatalf("forbidden target accessed staging %d times", probe.openCalls)
		}
	})

	for name, mutate := range map[string]func(*EvidenceCandidate){
		"missing": func(candidate *EvidenceCandidate) {
			candidate.Redaction.TargetPolicy = TargetPolicy{}
		},
		"policy-mismatch": func(candidate *EvidenceCandidate) {
			candidate.Redaction.TargetPolicy.PolicyDigest = repeatedDigest('c')
		},
		"target-mismatch": func(candidate *EvidenceCandidate) {
			candidate.Redaction.TargetPolicy.SemanticTargetID = "other-target"
		},
		"unsupported-capture": func(candidate *EvidenceCandidate) {
			candidate.Redaction.TargetPolicy.Capture = "pixel-coordinate-mask"
		},
	} {
		t.Run(name, func(t *testing.T) {
			candidate := *base
			mutate(&candidate)
			probe := &artifactStoreAccessProbe{}
			_, err := NewArtifactValidator(nil).ValidateForCandidate(
				context.Background(),
				probe,
				&candidate,
				artifactValidationCandidate(ArtifactScreenshot, "image/png", body),
				"staging/invalid-policy-must-not-exist",
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("invalid target policy was accepted: %v", err)
			}
			if probe.openCalls != 0 {
				t.Fatalf("invalid target policy accessed staging %d times", probe.openCalls)
			}
		})
	}

	masked := *base
	masked.Redaction.TargetPolicy.Capture = "masked"
	corrupt := corruptArtifactPNGIDAT(t, body)
	if _, err := validateStagedArtifactForCandidate(
		t,
		NewArtifactValidator(nil),
		&masked,
		ArtifactScreenshot,
		"image/png",
		corrupt,
	); err == nil || !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("masked target bypassed full raster validation: %v", err)
	}

	digest, err := artifactTargetPolicyDigest(base.Redaction.TargetPolicy)
	if err != nil {
		t.Fatalf("digest target policy: %v", err)
	}
	if want := mustCanonicalDigest(t, base.Redaction.TargetPolicy); digest != want {
		t.Fatalf("target policy digest = %q, want %q", digest, want)
	}
}

func TestUploadArtifactRejectsForbiddenTargetBeforeStaging(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	now := mustVectorTime(t, vectorNowText)
	body := encodedArtifactImage(t, "png", 3, 2)
	artifact := artifactValidationCandidate(ArtifactScreenshot, "image/png", body)
	candidate := verificationVectorCandidate(t, nil, "sensitive-upload")
	candidate.TargetID = "target-sensitive"
	candidate.Artifacts = []CandidateArtifact{artifact}
	candidate.Redaction.TargetPolicy = TargetPolicy{
		Authority:        "verification-policy",
		PolicyDigest:     repeatedDigest('b'),
		SemanticTargetID: "target-sensitive",
		Capture:          "forbidden-sensitive",
	}
	planWire := verificationPlanForCandidate(
		t,
		&candidate,
		TrustLocalUnattested,
		AuthoritativeRetentionRequest{
			Successful: RetentionSession,
			Failed:     RetentionChange,
		},
	)
	_, planBytes, err := decodeVerificationPlanWire(planWire)
	if err != nil {
		t.Fatalf("encode stored Plan: %v", err)
	}
	candidateBytes, err := canonicalBytes(candidate)
	if err != nil {
		t.Fatalf("encode stored candidate: %v", err)
	}
	capability := strings.Repeat("c", 32)
	mock.ExpectQuery(`(?s)SELECT id, workspace_id.*FROM verification_promotions.*WHERE workspace_id = \$1 AND id = \$2`).
		WithArgs("workspace-sensitive", "promotion-sensitive").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "workspace_id", "project_id", "candidate_digest",
			"actor_id", "state", "requested_trust", "retention_class",
			"maximum_closure_evidence_records", "evidence_id", "evidence_created_at", "candidate_bytes",
			"attempt_grant_id", "attempt_grant_digest", "protect_release_evidence", "verification_plan_bytes",
			"attestation_statement_bytes", "attestation_statement_digest",
			"manifest_digest", "capability_hash", "nonce_hash", "deadline", "version",
		}).AddRow(
			"promotion-sensitive", "workspace-sensitive", "project-sensitive",
			repeatedDigest('c'), "user-sensitive", "staging",
			string(TrustLocalUnattested), string(RetentionSession), 1000, "evidence-sensitive",
			now, candidateBytes, "attempt-grant-sensitive", repeatedDigest('d'), false,
			planBytes, []byte{}, "", "", secretHash(capability), "",
			now.Add(time.Hour), int64(1),
		))
	mock.ExpectExec(`(?s)UPDATE verification_promotions.*SET state = 'failed'`).
		WithArgs(
			"workspace-sensitive",
			"promotion-sensitive",
			"VER-5005",
			now.UTC(),
		).
		WillReturnResult(sqlmock.NewResult(0, 1))

	probe := &artifactStoreAccessProbe{}
	service := &Service{
		repository:  NewRepository(database),
		store:       probe,
		permissions: allowVerificationPermissions{},
		artifacts:   NewArtifactValidator(nil),
		now:         func() time.Time { return now },
	}
	_, err = service.UploadArtifact(
		context.Background(),
		"user-sensitive",
		"workspace-sensitive",
		"promotion-sensitive",
		artifact.ID,
		capability,
		"image/png",
		bytes.NewReader(body),
	)
	if err == nil || !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("forbidden target upload was accepted: %v", err)
	}
	if code := diagnosticCode(err, ""); code != "VER-5005" {
		t.Fatalf("forbidden target diagnostic = %q, want VER-5005", code)
	}
	if probe.putCalls != 0 || probe.openCalls != 0 {
		t.Fatalf(
			"forbidden target touched staging: put=%d open=%d",
			probe.putCalls,
			probe.openCalls,
		)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUploadArtifactRecordsTheExactRejectedDiagnostic(t *testing.T) {
	now := mustVectorTime(t, vectorNowText)
	body := verificationReplayArtifactBody(t, "")
	artifact := artifactValidationCandidate(
		ArtifactReplayRecord,
		"application/json",
		body,
	)
	candidate := verificationVectorCandidate(t, nil, "upload-code")
	candidate.TargetID = "target-upload-code"
	artifact.SourceTraceDigest = mustCanonicalDigest(t, candidate.SourceTraces[0])
	candidate.Artifacts = []CandidateArtifact{artifact}
	candidate.Redaction.TargetPolicy = TargetPolicy{
		Authority:        "verification-policy",
		PolicyDigest:     repeatedDigest('b'),
		SemanticTargetID: "target-upload-code",
		Capture:          "allowed",
	}
	planWire := verificationPlanForCandidate(
		t,
		&candidate,
		TrustLocalUnattested,
		AuthoritativeRetentionRequest{
			Successful: RetentionSession,
			Failed:     RetentionChange,
		},
	)
	_, planBytes, err := decodeVerificationPlanWire(planWire)
	if err != nil {
		t.Fatal(err)
	}
	candidateBytes, err := canonicalBytes(candidate)
	if err != nil {
		t.Fatal(err)
	}
	capability := strings.Repeat("d", 32)

	for _, code := range []string{"VER-5001", "VER-5002", "VER-5005"} {
		t.Run(code, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery(`(?s)SELECT id, workspace_id.*FROM verification_promotions.*WHERE workspace_id = \$1 AND id = \$2`).
				WithArgs("workspace-upload-code", "promotion-upload-code").
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "workspace_id", "project_id", "candidate_digest",
					"actor_id", "state", "requested_trust", "retention_class",
					"maximum_closure_evidence_records", "evidence_id", "evidence_created_at", "candidate_bytes",
					"attempt_grant_id", "attempt_grant_digest", "protect_release_evidence", "verification_plan_bytes",
					"attestation_statement_bytes", "attestation_statement_digest",
					"manifest_digest", "capability_hash", "nonce_hash", "deadline", "version",
				}).AddRow(
					"promotion-upload-code", "workspace-upload-code", "project-upload-code",
					repeatedDigest('c'), "user-upload-code", "staging",
					string(TrustLocalUnattested), string(RetentionSession),
					1000, "evidence-upload-code", now, candidateBytes,
					"attempt-grant-upload-code", repeatedDigest('d'), false, planBytes,
					[]byte{}, "", "",
					secretHash(capability), "", now.Add(time.Hour), int64(1),
				))
			mock.ExpectExec(`(?s)UPDATE verification_promotions.*SET state = 'failed'`).
				WithArgs(
					"workspace-upload-code",
					"promotion-upload-code",
					code,
					now.UTC(),
				).
				WillReturnResult(sqlmock.NewResult(0, 1))
			service := &Service{
				repository: NewRepository(database),
				store: &artifactPutFailureStore{
					err: coded(code, "injected rejected upload", ErrArtifactRejected),
				},
				permissions: allowVerificationPermissions{},
				artifacts:   NewArtifactValidator(nil),
				now:         func() time.Time { return now },
			}
			_, err = service.UploadArtifact(
				context.Background(),
				"user-upload-code",
				"workspace-upload-code",
				"promotion-upload-code",
				artifact.ID,
				capability,
				"application/json",
				bytes.NewReader(body),
			)
			if err == nil || diagnosticCode(err, "") != code {
				t.Fatalf("rejected upload error = %v, want %s", err, code)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestArtifactValidatorRejectsSecretsPIIActiveContentAndArchives(t *testing.T) {
	validator := NewArtifactValidator(NewCandidateValidator([]string{"known-canary"}))
	directCredential := "AKIA" + "ABCDEFGHIJKLMNOP"
	for name, fixture := range map[string]struct {
		body      []byte
		kind      ArtifactKind
		mediaType string
		sensitive string
	}{
		"secret-canary": {
			body:      []byte("known-canary"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
			sensitive: "known-canary",
		},
		"authorization": {
			body:      []byte("Authorization: Bearer private-access-token"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
			sensitive: "private-access-token",
		},
		"cookie": {
			body:      []byte("Set-Cookie: session=private-cookie-value"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
			sensitive: "private-cookie-value",
		},
		"pii": {
			body:      []byte("owner@example.invalid"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
			sensitive: "owner@example.invalid",
		},
		"pii-government-id": {
			body:      []byte("123-45-6789"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
			sensitive: "123-45-6789",
		},
		"direct-credential": {
			body:      []byte(directCredential),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
			sensitive: directCredential,
		},
		"high-entropy-text": {
			body:      []byte("Aa0Bb1Cc2Dd3Ee4Ff5Gg6Hh7Ii8Jj9Kk-_+/=LmN"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
			sensitive: "Aa0Bb1Cc2Dd3Ee4Ff5Gg6Hh7Ii8Jj9Kk-_+/=LmN",
		},
		"high-entropy-json": {
			body:      []byte(`{"token":"Aa0Bb1Cc2Dd3Ee4Ff5Gg6Hh7Ii8Jj9Kk-_+/=LmN"}`),
			kind:      ArtifactReplayRecord,
			mediaType: "application/json",
			sensitive: "Aa0Bb1Cc2Dd3Ee4Ff5Gg6Hh7Ii8Jj9Kk-_+/=LmN",
		},
		"active-html": {
			body:      []byte("<script>alert(1)</script>"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
		},
		"active-javascript": {
			body:      []byte("const payload = 1;"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
		},
		"zip-archive": {
			body:      []byte{'P', 'K', 0x03, 0x04, 0x00},
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
		},
		"tar-archive": {
			body:      artifactTarHeader(),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
		},
		"unsupported-pdf": {
			body:      []byte("%PDF-1.7"),
			kind:      ArtifactBuildLog,
			mediaType: "text/plain",
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := validateStagedArtifact(
				t,
				validator,
				fixture.kind,
				fixture.mediaType,
				fixture.body,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("unsafe artifact accepted: %v", err)
			}
			if fixture.sensitive != "" && strings.Contains(err.Error(), fixture.sensitive) {
				t.Fatalf("artifact rejection echoed sensitive value %q", fixture.sensitive)
			}
		})
	}
}

func TestArtifactValidatorAllowsExplicitRedactionMarkers(t *testing.T) {
	body := []byte(
		"Authorization: [REDACTED]\n" +
			"Cookie: <redacted>\n" +
			"API_KEY=redacted\n" +
			"password=***",
	)
	if _, err := validateStagedArtifact(
		t,
		NewArtifactValidator(nil),
		ArtifactBuildLog,
		"text/plain",
		body,
	); err != nil {
		t.Fatalf("explicit text redaction marker was rejected: %v", err)
	}

	// Structured artifacts cannot use a redaction marker to introduce fields
	// that their class schema does not own.
	if _, err := validateStagedArtifact(
		t,
		NewArtifactValidator(nil),
		ArtifactReplayRecord,
		"application/json",
		[]byte(
			`{"authorization":"[REDACTED]","client_secret":"***","cookie":"<redacted>"}`,
		),
	); err == nil || !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("redacted but schema-foreign JSON fields were accepted: %v", err)
	}
}

func TestCandidateArtifactPathsFailClosed(t *testing.T) {
	for _, unsafePath := range []string{
		"../secret.json",
		"reports/../../secret.json",
		"/absolute.json",
		`reports\windows.json`,
		"reports//duplicate.json",
	} {
		t.Run(unsafePath, func(t *testing.T) {
			err := validateArtifacts([]CandidateArtifact{{
				ID:                "artifact-path",
				Path:              unsafePath,
				StagingArtifactID: "staging-path",
				Kind:              ArtifactReplayRecord,
				ExpectedDigest:    repeatedDigest('a'),
				ExpectedSize:      2,
				ExpectedMediaType: "application/json",
			}})
			if err == nil {
				t.Fatalf("unsafe artifact path %q was accepted", unsafePath)
			}
		})
	}
}

func TestCandidateValidatorRejectsSecretCanaryInTargetIdentity(t *testing.T) {
	validator := NewCandidateValidator([]string{"known-canary"})
	validator.now = func() time.Time {
		return mustVectorTime(t, vectorNowText)
	}
	candidate := verificationVectorCandidate(t, nil, "sensitive-target")
	candidate.TargetID = "known-canary"
	candidate.Redaction.TargetPolicy.SemanticTargetID = candidate.TargetID
	candidate.CandidateDigest = mustDigestWithoutField(t, candidate, "candidateDigest")

	_, err := validator.Validate(&candidate, candidate.WorkspaceID)
	if err == nil || !errors.Is(err, ErrInvalid) {
		t.Fatalf("target identity Secret canary was accepted: %v", err)
	}
	if strings.Contains(err.Error(), "known-canary") {
		t.Fatal("candidate rejection echoed the target Secret canary")
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

func encodedArtifactImage(t *testing.T, format string, width int, height int) []byte {
	t.Helper()
	raster := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			raster.SetNRGBA(x, y, color.NRGBA{
				R: uint8(30 + x*20),
				G: uint8(40 + y*20),
				B: 120,
				A: 255,
			})
		}
	}
	var output bytes.Buffer
	var err error
	switch format {
	case "png":
		err = png.Encode(&output, raster)
	case "jpeg":
		err = jpeg.Encode(&output, raster, &jpeg.Options{Quality: 90})
	default:
		t.Fatalf("unsupported test image format %q", format)
	}
	if err != nil {
		t.Fatalf("encode %s fixture: %v", format, err)
	}
	return output.Bytes()
}

func corruptArtifactPNGIDAT(t *testing.T, body []byte) []byte {
	t.Helper()
	result := append([]byte(nil), body...)
	for offset := 8; offset+12 <= len(result); {
		length := int(binary.BigEndian.Uint32(result[offset : offset+4]))
		if offset+12+length > len(result) {
			t.Fatal("PNG fixture has an invalid chunk boundary")
		}
		if string(result[offset+4:offset+8]) == "IDAT" && length > 0 {
			result[offset+8] ^= 0x80
			return result
		}
		offset += 12 + length
	}
	t.Fatal("PNG fixture has no non-empty IDAT chunk")
	return nil
}

func truncateArtifactJPEGEntropy(t *testing.T, body []byte) []byte {
	t.Helper()
	for offset := 2; offset+4 <= len(body); {
		if body[offset] != 0xff {
			t.Fatal("JPEG fixture has an invalid marker boundary")
		}
		marker := body[offset+1]
		length := int(binary.BigEndian.Uint16(body[offset+2 : offset+4]))
		if length < 2 || offset+2+length > len(body) {
			t.Fatal("JPEG fixture has an invalid segment length")
		}
		if marker == 0xda {
			scanStart := offset + 2 + length
			if scanStart >= len(body)-2 {
				t.Fatal("JPEG fixture has no entropy payload")
			}
			result := append([]byte(nil), body[:scanStart+1]...)
			return append(result, 0xff, 0xd9)
		}
		offset += 2 + length
	}
	t.Fatal("JPEG fixture has no start-of-scan segment")
	return nil
}

func oversizedArtifactPNG(width uint32, height uint32) []byte {
	header := make([]byte, 13)
	binary.BigEndian.PutUint32(header[0:4], width)
	binary.BigEndian.PutUint32(header[4:8], height)
	header[8], header[9] = 8, 2

	output := append([]byte(nil), 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n')
	output = appendArtifactPNGChunk(output, "IHDR", header)
	output = appendArtifactPNGChunk(output, "IDAT", []byte{})
	output = appendArtifactPNGChunk(output, "IEND", []byte{})
	return output
}

func oversizedArtifactJPEG(
	t *testing.T,
	body []byte,
	width uint16,
	height uint16,
) []byte {
	t.Helper()
	result := append([]byte(nil), body...)
	for offset := 2; offset+4 <= len(result); {
		if result[offset] != 0xff {
			t.Fatal("JPEG fixture has an invalid marker boundary")
		}
		marker := result[offset+1]
		length := int(binary.BigEndian.Uint16(result[offset+2 : offset+4]))
		if length < 2 || offset+2+length > len(result) {
			t.Fatal("JPEG fixture has an invalid segment length")
		}
		if marker == 0xc0 || marker == 0xc2 {
			if length < 8 {
				t.Fatal("JPEG frame header fixture is too short")
			}
			binary.BigEndian.PutUint16(result[offset+5:offset+7], height)
			binary.BigEndian.PutUint16(result[offset+7:offset+9], width)
			return result
		}
		offset += 2 + length
	}
	t.Fatal("JPEG fixture has no frame header")
	return nil
}

func pngWithLiteralRasterPayload(t *testing.T, pixels []byte) []byte {
	t.Helper()
	if len(pixels) == 0 || len(pixels) > maximumImageDimension {
		t.Fatal("literal PNG fixture pixel width is invalid")
	}
	header := make([]byte, 13)
	binary.BigEndian.PutUint32(header[0:4], uint32(len(pixels)))
	binary.BigEndian.PutUint32(header[4:8], 1)
	header[8], header[9] = 8, 0

	var compressed bytes.Buffer
	writer, err := zlib.NewWriterLevel(&compressed, zlib.NoCompression)
	if err != nil {
		t.Fatalf("create uncompressed zlib fixture: %v", err)
	}
	if _, err := writer.Write(append([]byte{0}, pixels...)); err != nil {
		t.Fatalf("write PNG scanline fixture: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close PNG scanline fixture: %v", err)
	}

	output := append([]byte(nil), 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n')
	output = appendArtifactPNGChunk(output, "IHDR", header)
	output = appendArtifactPNGChunk(output, "IDAT", compressed.Bytes())
	return appendArtifactPNGChunk(output, "IEND", nil)
}

func appendArtifactPNGChunk(destination []byte, kind string, payload []byte) []byte {
	length := make([]byte, 4)
	binary.BigEndian.PutUint32(length, uint32(len(payload)))
	destination = append(destination, length...)
	chunkStart := len(destination)
	destination = append(destination, kind...)
	destination = append(destination, payload...)
	checksum := make([]byte, 4)
	binary.BigEndian.PutUint32(
		checksum,
		crc32.ChecksumIEEE(destination[chunkStart:]),
	)
	return append(destination, checksum...)
}

func artifactTarHeader() []byte {
	body := make([]byte, 512)
	copy(body[257:], "ustar")
	return body
}

type artifactStoreAccessProbe struct {
	ArtifactObjectStore
	putCalls  int
	openCalls int
}

type artifactPutFailureStore struct {
	ArtifactObjectStore
	err error
}

func (store *artifactPutFailureStore) PutStaging(
	context.Context,
	string,
	string,
	io.Reader,
	int64,
) (StoredObject, error) {
	return StoredObject{}, store.err
}

func (probe *artifactStoreAccessProbe) PutStaging(
	context.Context,
	string,
	string,
	io.Reader,
	int64,
) (StoredObject, error) {
	probe.putCalls++
	return StoredObject{}, errors.New("artifact staging must not be created")
}

func (probe *artifactStoreAccessProbe) OpenStaging(
	context.Context,
	string,
) (io.ReadCloser, error) {
	probe.openCalls++
	return nil, errors.New("artifact staging must not be accessed")
}
