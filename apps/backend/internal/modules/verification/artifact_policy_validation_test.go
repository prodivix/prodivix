package verification

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

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
