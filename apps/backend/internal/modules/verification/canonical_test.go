package verification

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

type verificationCanonicalVectorFixture struct {
	Format        string             `json:"format"`
	Version       int                `json:"version"`
	EvidenceID    string             `json:"evidenceId"`
	CreatedAt     string             `json:"createdAt"`
	Retention     RetentionClass     `json:"retention"`
	CanonicalJSON string             `json:"canonicalJson"`
	Candidate     json.RawMessage    `json:"candidate"`
	Artifacts     []ArtifactManifest `json:"artifacts"`
	Expected      struct {
		NormalizedResultDigest     string `json:"normalizedResultDigest"`
		CandidateDigest            string `json:"candidateDigest"`
		StatementDigest            string `json:"statementDigest"`
		ManifestDigest             string `json:"manifestDigest"`
		MaterializedEvidenceDigest string `json:"materializedEvidenceDigest"`
	} `json:"expected"`
}

// The fixture is generated exclusively by @prodivix/shared canonicalJsonText
// and @prodivix/verification through `pnpm g3:sync-wire`. Go independently
// decodes the strict Candidate and recomputes every digest.
func TestTypeScriptGoCanonicalEvidenceVector(t *testing.T) {
	fixtureBytes, err := os.ReadFile("testdata/verification-canonical-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := validateJSONObject(fixtureBytes); err != nil {
		t.Fatalf("TS canonical fixture is not strict JSON: %v", err)
	}
	var fixture verificationCanonicalVectorFixture
	if err := jsonUnmarshalStrictStored(fixtureBytes, &fixture); err != nil {
		t.Fatalf("decode TS canonical fixture: %v", err)
	}
	if fixture.Format != "prodivix.verification-canonical-vector" ||
		fixture.Version != 1 ||
		fixture.Retention != RetentionSession {
		t.Fatalf("unsupported TS canonical fixture identity: %#v", fixture)
	}
	canonical, err := canonicalBytes(map[string]any{
		"é": "café", "😀": "雪", "decimal": 1.25, "tiny": 0.000001,
		"integer": int64(9007199254740991),
	})
	if err != nil {
		t.Fatal(err)
	}
	if string(canonical) != fixture.CanonicalJSON {
		t.Fatalf("canonical JSON drifted:\n got %s\nwant %s", canonical, fixture.CanonicalJSON)
	}

	if err := validateJSONObject(fixture.Candidate); err != nil {
		t.Fatalf("TS Candidate is not strict JSON: %v", err)
	}
	var candidate EvidenceCandidate
	if err := jsonUnmarshalStrictStored(fixture.Candidate, &candidate); err != nil {
		t.Fatalf("decode TS Candidate: %v", err)
	}
	if candidate.Result.NormalizedResultDigest != fixture.Expected.NormalizedResultDigest {
		t.Fatalf("normalized result digest drifted: %s", candidate.Result.NormalizedResultDigest)
	}
	if candidate.CandidateDigest != fixture.Expected.CandidateDigest {
		t.Fatalf("candidate digest drifted: %s", candidate.CandidateDigest)
	}
	validator := NewCandidateValidator(nil)
	createdAt := mustVectorTime(t, fixture.CreatedAt)
	validator.now = func() time.Time { return createdAt }
	if trust, err := validator.Validate(&candidate, candidate.WorkspaceID); err != nil ||
		trust != TrustLocalUnattested {
		t.Fatalf("TS vector did not pass strict Backend intake: trust=%q err=%v", trust, err)
	}

	statementEvidence := materializeEvidenceBody(
		candidate,
		fixture.EvidenceID,
		createdAt,
		fixture.Retention,
		fixture.Artifacts,
		EvidenceProvenance{},
	)
	statement, statementDigest, statementBytes, err := buildEvidenceStatementForEvidence(
		candidate,
		statementEvidence,
	)
	if err != nil {
		t.Fatal(err)
	}
	if statementDigest != fixture.Expected.StatementDigest {
		t.Fatalf("statement digest drifted: %s", statementDigest)
	}
	service := &Service{config: ServiceConfig{SessionRetention: time.Hour}}
	committedArtifacts := make([]CommittedArtifact, len(fixture.Artifacts))
	candidateArtifacts := make(map[string]CandidateArtifact, len(candidate.Artifacts))
	for _, artifact := range candidate.Artifacts {
		candidateArtifacts[artifact.ID] = artifact
	}
	for index, artifact := range fixture.Artifacts {
		candidateArtifact, exists := candidateArtifacts[artifact.ID]
		if !exists {
			t.Fatalf("fixture artifact %q is absent from Candidate", artifact.ID)
		}
		committedArtifacts[index] = CommittedArtifact{
			Validated: ValidatedArtifact{
				Candidate:        candidateArtifact,
				NormalizedDigest: artifact.NormalizedDigest,
			},
			Stored: StoredObject{
				Digest: artifact.Digest,
				Size:   artifact.Size,
			},
		}
	}
	evidence, manifestBytes, _, err := service.buildEvidence(Promotion{
		Candidate: candidate, CandidateDigest: candidate.CandidateDigest,
		EvidenceID: fixture.EvidenceID, EvidenceCreatedAt: createdAt,
		Trust: TrustLocalUnattested, Retention: fixture.Retention,
		Statement: statement, StatementDigest: statementDigest,
		StatementBytes: statementBytes,
	}, committedArtifacts, nil)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.ManifestDigest != fixture.Expected.ManifestDigest {
		t.Fatalf("manifest digest drifted: %s\nmanifest=%s", evidence.ManifestDigest, manifestBytes)
	}
	materialized, err := materializedEvidenceDigest(evidence)
	if err != nil {
		t.Fatal(err)
	}
	if materialized != fixture.Expected.MaterializedEvidenceDigest {
		t.Fatalf("materialized Evidence digest drifted: %s", materialized)
	}
}

func TestCanonicalIntakeRejectsUnsafeNonCanonicalAndOutOfContractValues(t *testing.T) {
	for _, body := range [][]byte{
		[]byte(`{"safe":1,"safe":2}`),
		[]byte(`{"__proto__":{"polluted":true}}`),
		[]byte(`{"constructor":1}`),
		[]byte(`{"prototype":1}`),
		[]byte("{\"value\":\"e\u0301\"}"),
		[]byte(`{"value":"\ud800"}`),
		[]byte(`{"value":"\udc00"}`),
		[]byte(`{"value":"\ud83d\u0061"}`),
		[]byte(`{"\ud800":"value"}`),
		{0xff, '{', '}'},
	} {
		if err := validateJSONObject(body); err == nil {
			t.Fatalf("strict JSON accepted %q", body)
		}
	}
	for _, identifier := range []string{"bad/path", "bad+value", strings.Repeat("a", 257)} {
		if err := validateIdentifier(identifier, "vector"); err == nil {
			t.Fatalf("identifier accepted out-of-contract value %q", identifier)
		}
	}
	for _, instant := range []string{
		"2026-07-28T00:00:00.1234Z",
		"2026-07-28T00:00:00+00:00",
		"2026-07-28T00:00:00.000001Z",
	} {
		if _, err := parseInstant(instant); err == nil {
			t.Fatalf("instant accepted %q", instant)
		}
	}
}

func TestCanonicalIntakeAcceptsAstralUnicodeAndEscapedSurrogateText(t *testing.T) {
	for _, body := range [][]byte{
		[]byte(`{"value":"\uD83D\uDE00"}`),
		[]byte(`{"value":"😀"}`),
		[]byte(`{"value":"\\ud800"}`),
		[]byte(`{"\uD83D\uDE00":"astral-key"}`),
	} {
		if err := validateJSONObject(body); err != nil {
			t.Fatalf("strict JSON rejected valid Unicode %q: %v", body, err)
		}
	}
}

func TestStrictStoredCandidateAndManifestRejectUnpairedUnicodeSurrogates(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		body   []byte
		target any
	}{
		{
			name:   "candidate",
			body:   []byte(`{"candidateId":"\ud800"}`),
			target: &EvidenceCandidate{},
		},
		{
			name:   "manifest",
			body:   []byte(`{"format":"\udc00"}`),
			target: &VerificationEvidenceManifest{},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if err := jsonUnmarshalStrictStored(testCase.body, testCase.target); err == nil {
				t.Fatal("stored strict decoder accepted an unpaired Unicode surrogate")
			}
		})
	}

	var candidate EvidenceCandidate
	if err := jsonUnmarshalStrictStored(
		[]byte(`{"candidateId":"\uD83D\uDE00"}`),
		&candidate,
	); err != nil {
		t.Fatalf("stored strict decoder rejected valid surrogate pair: %v", err)
	}
	if candidate.CandidateID != "😀" {
		t.Fatalf("decoded candidateId = %q, want astral scalar", candidate.CandidateID)
	}
}
