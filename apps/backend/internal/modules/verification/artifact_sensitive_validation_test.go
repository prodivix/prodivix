package verification

import (
	"errors"
	"strings"
	"testing"
	"time"
)

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

func TestSensitiveScannerAllowsCanonicalUUIDBackedIdentities(t *testing.T) {
	validator := NewCandidateValidator(nil)
	for _, identity := range []string{
		"run-550e8400-e29b-41d4-a716-446655440000",
		"attempt-run-550e8400-e29b-41d4-a716-446655440000-1",
	} {
		if validator.containsSensitiveText([]byte(identity)) {
			t.Fatalf("canonical UUID-backed identity was classified as a credential: %s", identity)
		}
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
