package verification

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const verificationPostgreSQLTestURL = "PRODIVIX_BACKEND_POSTGRES_TEST_URL"

type verificationGateClock struct {
	mutex sync.RWMutex
	value time.Time
}

type artifactFinalizeResult struct {
	record EvidenceRecord
	err    error
}

type interruptedArtifactUpload struct {
	prefix []byte
}

func (reader *interruptedArtifactUpload) Read(destination []byte) (int, error) {
	if len(reader.prefix) == 0 {
		return 0, errors.New("injected artifact upload interruption")
	}
	count := copy(destination, reader.prefix)
	reader.prefix = reader.prefix[count:]
	return count, nil
}

func (clock *verificationGateClock) Now() time.Time {
	clock.mutex.RLock()
	defer clock.mutex.RUnlock()
	return clock.value
}

func (clock *verificationGateClock) Set(value time.Time) {
	clock.mutex.Lock()
	clock.value = canonicalTime(value)
	clock.mutex.Unlock()
}

type faultInjectingArtifactStore struct {
	ArtifactObjectStore
	mutex                sync.Mutex
	failDurableDelete    bool
	remainingPromoteFail int
}

func (store *faultInjectingArtifactStore) DeleteDurable(ctx context.Context, locator string) error {
	store.mutex.Lock()
	fail := store.failDurableDelete
	store.mutex.Unlock()
	if fail {
		return errors.New("injected durable object deletion failure")
	}
	return store.ArtifactObjectStore.DeleteDurable(ctx, locator)
}

func (store *faultInjectingArtifactStore) Promote(
	ctx context.Context,
	workspaceID string,
	expectedDigest string,
	expectedSize int64,
	stagingLocator string,
) (StoredObject, error) {
	store.mutex.Lock()
	if store.remainingPromoteFail > 0 {
		store.remainingPromoteFail--
		store.mutex.Unlock()
		return StoredObject{}, errors.New("injected durable object promotion failure")
	}
	store.mutex.Unlock()
	return store.ArtifactObjectStore.Promote(
		ctx,
		workspaceID,
		expectedDigest,
		expectedSize,
		stagingLocator,
	)
}

func (store *faultInjectingArtifactStore) SetDeleteFailure(fail bool) {
	store.mutex.Lock()
	store.failDurableDelete = fail
	store.mutex.Unlock()
}

func (store *faultInjectingArtifactStore) FailNextPromote() {
	store.mutex.Lock()
	store.remainingPromoteFail++
	store.mutex.Unlock()
}

func TestVerificationEvidencePostgreSQLGate(t *testing.T) {
	databaseA, databaseB := openVerificationPostgreSQL(t)
	seedVerificationPostgreSQLWorkspace(t, databaseA)
	filesystemStore, err := NewFilesystemArtifactStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	faultStore := &faultInjectingArtifactStore{ArtifactObjectStore: filesystemStore}
	clock := &verificationGateClock{value: mustVectorTime(t, vectorNowText)}
	privateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{0x51}, ed25519.SeedSize))
	rotatedPrivateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{0x52}, ed25519.SeedSize))
	verifier, err := NewEd25519AttestationVerifier([]AttestationKey{
		{
			ID: "ci-gate-key", PublicKey: privateKey.Public().(ed25519.PublicKey),
			Issuer: "https://issuer.example", Audience: "prodivix-verification",
			Subject: "repo:prodivix/main", Trust: TrustCIAttested,
		},
		{
			ID:        "ci-gate-key-rotated",
			PublicKey: rotatedPrivateKey.Public().(ed25519.PublicKey),
			Issuer:    "https://issuer.example", Audience: "prodivix-verification",
			Subject: "repo:prodivix/main", Trust: TrustCIAttested,
		},
	}, 11, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	serviceA := newVerificationGateService(t, databaseA, faultStore, clock, verifier)
	serviceB := newVerificationGateService(t, databaseB, faultStore, clock, verifier)
	ctx := context.Background()
	assertTargetPolicyAuthorityGate(t, databaseA, serviceA)
	runWorkspaceAuthorityTOCTOUGate(t)
	runPromotionRecoveryGate(t)
	runMaximumClosureEvidenceGate(t)

	artifactBody := verificationReplayArtifactBody(t, "PG_SHARED")
	firstCandidate := verificationPostgreSQLCandidate(t, artifactBody, "first")
	artifactBody = issueVerificationGateArtifactAttemptGrant(
		t,
		serviceA,
		&firstCandidate,
		artifactBody,
	)
	created, err := serviceA.CreatePromotion(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstCandidate.Promotion.IdempotencyKey, firstCandidate,
	)
	if err != nil {
		t.Fatalf("create first promotion: %v", err)
	}
	replayedCreate, err := serviceB.CreatePromotion(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstCandidate.Promotion.IdempotencyKey, firstCandidate,
	)
	if err != nil || replayedCreate != created {
		t.Fatalf("cross-replica exact Create replay = %#v, %v; want %#v", replayedCreate, err, created)
	}
	uploadedFirst, err := serviceA.UploadArtifact(
		ctx, "owner-vector", firstCandidate.WorkspaceID, created.PromotionID,
		firstCandidate.Artifacts[0].ID, created.UploadCapability,
		"application/json", bytes.NewReader(artifactBody),
	)
	if err != nil {
		t.Fatalf("upload first artifact: %v", err)
	}
	if uploadedFirst.SourceTraceDigest != firstCandidate.Artifacts[0].SourceTraceDigest {
		t.Fatalf(
			"upload descriptor source trace = %q, want %q",
			uploadedFirst.SourceTraceDigest,
			firstCandidate.Artifacts[0].SourceTraceDigest,
		)
	}
	persistedFirstArtifact, err := serviceA.repository.GetPromotionArtifact(
		ctx,
		created.PromotionID,
		firstCandidate.Artifacts[0].ID,
	)
	if err != nil {
		t.Fatalf("reload staged artifact identity: %v", err)
	}
	if persistedFirstArtifact.Artifact.SourceTraceDigest !=
		firstCandidate.Artifacts[0].SourceTraceDigest {
		t.Fatalf(
			"staged artifact source trace = %q, want %q",
			persistedFirstArtifact.Artifact.SourceTraceDigest,
			firstCandidate.Artifacts[0].SourceTraceDigest,
		)
	}

	type finalizeResult struct {
		record EvidenceRecord
		err    error
	}
	start := make(chan struct{})
	results := make(chan finalizeResult, 2)
	var wait sync.WaitGroup
	for _, service := range []*Service{serviceA, serviceB} {
		service := service
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			record, err := service.FinalizePromotion(
				ctx, "owner-vector", firstCandidate.WorkspaceID,
				created.PromotionID, created.UploadCapability, nil,
			)
			results <- finalizeResult{record: record, err: err}
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	var firstRecord EvidenceRecord
	for result := range results {
		if result.err != nil {
			t.Fatalf("concurrent finalize failed: %v", result.err)
		}
		if firstRecord.Evidence.ID == "" {
			firstRecord = result.record
		} else if result.record.Evidence.ID != firstRecord.Evidence.ID ||
			result.record.Evidence.ManifestDigest != firstRecord.Evidence.ManifestDigest {
			t.Fatalf("replicas returned different Evidence: %#v vs %#v", firstRecord, result.record)
		}
	}
	assertEvidenceAppendOnlyGate(t, databaseA, firstRecord)
	assertVerificationRowCount(t, databaseA, "verification_evidence", 1)

	restarted := newVerificationGateService(t, databaseB, faultStore, clock, verifier)
	replayed, err := restarted.FinalizePromotion(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		created.PromotionID, created.UploadCapability, nil,
	)
	if err != nil || replayed.Evidence.ManifestDigest != firstRecord.Evidence.ManifestDigest {
		t.Fatalf("restart finalize replay = %#v, %v", replayed, err)
	}
	conflict := firstCandidate
	conflict.Promotion.IdempotencyKey = "idempotency-conflict"
	conflict.ImpactDigest = repeatedDigest('9')
	conflict.CandidateDigest = mustDigestWithoutField(t, conflict, "candidateDigest")
	if _, err := restarted.CreatePromotion(
		ctx, "owner-vector", conflict.WorkspaceID,
		conflict.Promotion.IdempotencyKey, conflict,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("same candidate identity with a different digest = %v, want conflict", err)
	}

	secondCandidate := verificationPostgreSQLCandidate(t, artifactBody, "second")
	secondCandidate.Artifacts[0].ExpectedMediaType =
		"application/vnd.prodivix.replay-record+json"
	secondCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		secondCandidate,
		"candidateDigest",
	)
	secondPromotion, secondRecord := promoteVerificationGateCandidate(
		t, serviceB, &secondCandidate, artifactBody, nil, nil,
	)
	if secondPromotion.PromotionID == created.PromotionID ||
		secondRecord.Evidence.ID == firstRecord.Evidence.ID {
		t.Fatal("independent attempt reused promotion or Evidence identity")
	}
	assertVerificationRowCount(t, databaseA, "verification_evidence", 2)

	type booleanMutationResult struct {
		replayed bool
		err      error
	}
	supersedeStart := make(chan struct{})
	supersedeResults := make(chan booleanMutationResult, 2)
	wait = sync.WaitGroup{}
	for _, service := range []*Service{serviceA, serviceB} {
		service := service
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-supersedeStart
			replayed, err := service.SupersedeEvidence(
				ctx, "owner-vector", firstCandidate.WorkspaceID,
				firstRecord.Evidence.ID, secondRecord.Evidence.ID, "new-attempt",
				"mutation-supersede-0001", "active", "active", "none",
			)
			supersedeResults <- booleanMutationResult{replayed: replayed, err: err}
		}()
	}
	close(supersedeStart)
	wait.Wait()
	close(supersedeResults)
	supersedeReplayCount := 0
	for result := range supersedeResults {
		if result.err != nil {
			t.Fatalf("concurrent supersede failed: %v", result.err)
		}
		if result.replayed {
			supersedeReplayCount++
		}
	}
	if supersedeReplayCount != 1 {
		t.Fatalf("concurrent supersede replay count = %d, want 1", supersedeReplayCount)
	}
	if replayed, err := restarted.SupersedeEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, secondRecord.Evidence.ID, "new-attempt",
		"mutation-supersede-0001", "active", "active", "none",
	); err != nil || !replayed {
		t.Fatalf("restart supersede replay = %t, %v", replayed, err)
	}
	if _, err := restarted.SupersedeEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, secondRecord.Evidence.ID, "different-reason",
		"mutation-supersede-0001", "active", "active", "none",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("same supersede key with different payload = %v, want conflict", err)
	}
	if _, err := restarted.SupersedeEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, secondRecord.Evidence.ID, "new-attempt",
		"mutation-supersede-0002", "active", "active", "none",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale supersession state precondition = %v, want conflict", err)
	}
	assertVerificationAuditCount(t, databaseA, firstRecord.Evidence.ID, "evidence.superseded", 1)
	assertVerificationMutationCount(t, databaseA, mutationSupersede, 1)

	ciCandidate := verificationPostgreSQLCandidate(t, nil, "ci-gate")
	ciCandidate.Provenance.Origin = "ci"
	ciCandidate.Provenance.CI = verificationVectorCIIdentity()
	ciCandidate.CandidateDigest = mustDigestWithoutField(t, ciCandidate, "candidateDigest")
	ciPromotion, ciRecord := promoteVerificationGateCandidate(
		t, serviceA, &ciCandidate, nil, privateKey, verifier,
	)
	ciPresentation := signVerificationGateAttestation(t, ciCandidate, ciPromotion, privateKey)
	ciClaimsDigest := mustCanonicalDigest(
		t,
		attestationClaimSetForPresentation(ciPresentation),
	)
	ciProofDigest := digestBytes(mustDecodeSignature(t, ciPresentation.Signature))
	expectedAttestationDigest, err := deriveAttestationPresentationDigest(
		ciPresentation.Algorithm,
		ciPresentation.KeyID,
		ciClaimsDigest,
		ciProofDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	if ciRecord.Evidence.Provenance.Trust != TrustCIAttested ||
		ciRecord.VerifiedView.TrustStatus != "verified" ||
		ciRecord.VerifiedView.AttestationDigest != expectedAttestationDigest {
		t.Fatalf("CI-attested Evidence did not materialize verified trust: %#v", ciRecord)
	}
	if ciRecord.Evidence.CheckKind != ciCandidate.CheckKind ||
		ciRecord.Evidence.TargetID != ciCandidate.TargetID ||
		ciRecord.Evidence.Normalization != ciCandidate.Normalization ||
		ciRecord.Evidence.TargetPolicy != ciCandidate.Redaction.TargetPolicy ||
		ciRecord.Evidence.Run != (EvidenceRunIdentity{
			RunID: ciCandidate.Run.RunID, ProviderID: ciCandidate.Run.ProviderID,
			JobID: ciCandidate.Run.JobID, SessionID: ciCandidate.Run.SessionID,
			ParentAttemptID: ciCandidate.Run.ParentAttemptID,
			Surface:         ciCandidate.Run.Surface, FrameworkTarget: ciCandidate.Run.FrameworkTarget,
			RuntimeZone: ciCandidate.Run.RuntimeZone, BrowserEngine: ciCandidate.Run.BrowserEngine,
			OperatingSystemIdentity: ciCandidate.Run.OperatingSystemIdentity,
			Viewport:                ciCandidate.Run.Viewport, DevicePixelRatio: ciCandidate.Run.DevicePixelRatio,
			ColorScheme: ciCandidate.Run.ColorScheme, Motion: ciCandidate.Run.Motion,
			Locale: ciCandidate.Run.Locale, Timezone: ciCandidate.Run.Timezone,
			FontSetDigest:      ciCandidate.Run.FontSetDigest,
			SandboxImageDigest: ciCandidate.Run.SandboxImageDigest,
		}) ||
		ciRecord.Evidence.Provenance.CI == nil ||
		*ciRecord.Evidence.Provenance.CI != *ciCandidate.Provenance.CI {
		t.Fatalf("repository roundtrip dropped current trust fields: %#v", ciRecord.Evidence)
	}
	if ciPromotion.AttestationNonce == "" || ciPromotion.AttestationStatementDigest == "" {
		t.Fatal("CI promotion omitted its server-owned nonce or statement")
	}
	restartedCIRecord, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		ciCandidate.WorkspaceID,
		ciPromotion.PromotionID,
		ciPromotion.UploadCapability,
		&ciPresentation,
	)
	if err != nil ||
		restartedCIRecord.Evidence.ManifestDigest != ciRecord.Evidence.ManifestDigest {
		t.Fatalf("restart exact attestation replay = %#v, %v", restartedCIRecord, err)
	}
	var storedProofDigest, storedNonceDigest, storedReplayKey string
	var storedClaimsBytes []byte
	if err := databaseA.QueryRow(`SELECT proof_digest, nonce_digest, replay_key, claims_bytes
FROM verification_attestations
WHERE evidence_id = $1`, ciRecord.Evidence.ID).Scan(
		&storedProofDigest,
		&storedNonceDigest,
		&storedReplayKey,
		&storedClaimsBytes,
	); err != nil {
		t.Fatalf("load durable attestation identity: %v", err)
	}
	expectedNonceDigest, _, err := canonicalDigest(map[string]any{
		"format":  "prodivix.verification-attestation-nonce",
		"version": 1,
		"nonce":   ciPresentation.Nonce,
	})
	if err != nil {
		t.Fatal(err)
	}
	expectedReplayKey, _, err := canonicalDigest(map[string]any{
		"format":      "prodivix.verification-attestation-replay-key",
		"version":     1,
		"issuer":      ciPresentation.Issuer,
		"audience":    ciPresentation.Audience,
		"nonceDigest": expectedNonceDigest,
	})
	if err != nil {
		t.Fatal(err)
	}
	if storedProofDigest != ciProofDigest ||
		storedNonceDigest != expectedNonceDigest ||
		storedReplayKey != expectedReplayKey ||
		bytes.Contains(storedClaimsBytes, []byte(ciPresentation.Nonce)) ||
		bytes.Contains(storedClaimsBytes, []byte(ciPresentation.Signature)) {
		t.Fatalf(
			"durable attestation identity is incomplete or secret-bearing: proof=%q nonce=%q replay=%q claims=%s",
			storedProofDigest,
			storedNonceDigest,
			storedReplayKey,
			storedClaimsBytes,
		)
	}
	assertVerificationRowCount(t, databaseA, "verification_evidence", 3)

	replayCandidate := verificationPostgreSQLCandidate(t, nil, "ci-replay")
	replayCandidate.Provenance.Origin = "ci"
	replayCandidate.Provenance.CI = verificationVectorCIIdentity()
	replayCandidate.CandidateDigest = mustDigestWithoutField(t, replayCandidate, "candidateDigest")
	issueVerificationGateAttemptGrant(t, serviceB, &replayCandidate)
	replayPromotion, err := serviceB.CreatePromotion(
		ctx, "owner-vector", replayCandidate.WorkspaceID,
		replayCandidate.Promotion.IdempotencyKey, replayCandidate,
	)
	if err != nil {
		t.Fatalf("create replay probe promotion: %v", err)
	}
	replayPromotion = prepareVerificationGateAttestationChallenge(
		t,
		serviceB,
		replayCandidate,
		replayPromotion,
	)
	replayPresentation := ciPresentation
	if _, err := serviceB.FinalizePromotion(
		ctx, "owner-vector", replayCandidate.WorkspaceID,
		replayPromotion.PromotionID, replayPromotion.UploadCapability,
		&replayPresentation,
	); !errors.Is(err, ErrAttestationRejected) {
		t.Fatalf("replayed attestation presentation = %v, want rejection", err)
	}
	assertVerificationRowCount(t, databaseA, "verification_evidence", 3)

	invalidThenValidCandidate := verificationPostgreSQLCandidate(t, nil, "ci-invalid-then-valid")
	invalidThenValidCandidate.Provenance.Origin = "ci"
	invalidThenValidCandidate.Provenance.CI = verificationVectorCIIdentity()
	invalidThenValidCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		invalidThenValidCandidate,
		"candidateDigest",
	)
	issueVerificationGateAttemptGrant(t, serviceA, &invalidThenValidCandidate)
	invalidThenValidPromotion, err := serviceA.CreatePromotion(
		ctx,
		"owner-vector",
		invalidThenValidCandidate.WorkspaceID,
		invalidThenValidCandidate.Promotion.IdempotencyKey,
		invalidThenValidCandidate,
	)
	if err != nil {
		t.Fatalf("create invalid-then-valid promotion: %v", err)
	}
	invalidThenValidPromotion = prepareVerificationGateAttestationChallenge(
		t,
		serviceA,
		invalidThenValidCandidate,
		invalidThenValidPromotion,
	)
	validAfterInvalid := signVerificationGateAttestation(
		t,
		invalidThenValidCandidate,
		invalidThenValidPromotion,
		privateKey,
	)
	invalidPresentation := validAfterInvalid
	invalidPresentation.Signature = base64.RawStdEncoding.EncodeToString(
		make([]byte, ed25519.SignatureSize),
	)
	if _, err := serviceA.FinalizePromotion(
		ctx,
		"owner-vector",
		invalidThenValidCandidate.WorkspaceID,
		invalidThenValidPromotion.PromotionID,
		invalidThenValidPromotion.UploadCapability,
		&invalidPresentation,
	); !errors.Is(err, ErrAttestationRejected) {
		t.Fatalf("invalid attestation = %v, want rejection", err)
	}
	assertVerificationAttemptEvidenceCount(
		t,
		databaseA,
		invalidThenValidCandidate.WorkspaceID,
		invalidThenValidCandidate.AttemptID,
		0,
	)
	if _, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		invalidThenValidCandidate.WorkspaceID,
		invalidThenValidPromotion.PromotionID,
		invalidThenValidPromotion.UploadCapability,
		&validAfterInvalid,
	); err != nil {
		t.Fatalf("valid retry after invalid attestation: %v", err)
	}

	rotationCandidate := verificationPostgreSQLCandidate(t, nil, "ci-key-rotation")
	rotationCandidate.Provenance.Origin = "ci"
	rotationCandidate.Provenance.CI = verificationVectorCIIdentity()
	rotationCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		rotationCandidate,
		"candidateDigest",
	)
	issueVerificationGateAttemptGrant(t, serviceA, &rotationCandidate)
	rotationPromotion, err := serviceA.CreatePromotion(
		ctx,
		"owner-vector",
		rotationCandidate.WorkspaceID,
		rotationCandidate.Promotion.IdempotencyKey,
		rotationCandidate,
	)
	if err != nil {
		t.Fatalf("create key-rotation promotion: %v", err)
	}
	rotationPromotion = prepareVerificationGateAttestationChallenge(
		t,
		serviceA,
		rotationCandidate,
		rotationPromotion,
	)
	rotationPresentation := signVerificationGateAttestation(
		t,
		rotationCandidate,
		rotationPromotion,
		privateKey,
	)
	rotationPresentation.KeyID = "ci-gate-key-rotated"
	signAttestationPresentation(t, rotatedPrivateKey, &rotationPresentation)
	type attestationFinalizeResult struct {
		record EvidenceRecord
		err    error
	}
	rotationStart := make(chan struct{})
	rotationResults := make(chan attestationFinalizeResult, 2)
	wait = sync.WaitGroup{}
	for _, service := range []*Service{serviceA, serviceB} {
		service := service
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-rotationStart
			record, err := service.FinalizePromotion(
				ctx,
				"owner-vector",
				rotationCandidate.WorkspaceID,
				rotationPromotion.PromotionID,
				rotationPromotion.UploadCapability,
				&rotationPresentation,
			)
			rotationResults <- attestationFinalizeResult{record: record, err: err}
		}()
	}
	close(rotationStart)
	wait.Wait()
	close(rotationResults)
	rotationManifestDigest := ""
	for result := range rotationResults {
		if result.err != nil {
			t.Fatalf("concurrent key-rotation finalize: %v", result.err)
		}
		if rotationManifestDigest == "" {
			rotationManifestDigest = result.record.Evidence.ManifestDigest
		} else if rotationManifestDigest != result.record.Evidence.ManifestDigest {
			t.Fatalf(
				"concurrent key-rotation manifests differ: %q and %q",
				rotationManifestDigest,
				result.record.Evidence.ManifestDigest,
			)
		}
		if result.record.VerifiedView.AttestationDigest == expectedAttestationDigest {
			t.Fatal("key rotation reused the previous attestation presentation digest")
		}
	}
	assertVerificationAttemptEvidenceCount(
		t,
		databaseA,
		rotationCandidate.WorkspaceID,
		rotationCandidate.AttemptID,
		1,
	)

	sameNonceCandidate := verificationPostgreSQLCandidate(t, nil, "ci-same-nonce")
	sameNonceCandidate.Provenance.Origin = "ci"
	sameNonceCandidate.Provenance.CI = verificationVectorCIIdentity()
	sameNonceCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		sameNonceCandidate,
		"candidateDigest",
	)
	issueVerificationGateAttemptGrant(t, serviceA, &sameNonceCandidate)
	sameNoncePromotion, err := serviceA.CreatePromotion(
		ctx,
		"owner-vector",
		sameNonceCandidate.WorkspaceID,
		sameNonceCandidate.Promotion.IdempotencyKey,
		sameNonceCandidate,
	)
	if err != nil {
		t.Fatalf("create same-nonce replay probe: %v", err)
	}
	sameNoncePromotion = prepareVerificationGateAttestationChallenge(
		t,
		serviceA,
		sameNonceCandidate,
		sameNoncePromotion,
	)
	if _, err := databaseA.Exec(
		`UPDATE verification_promotions SET nonce_hash = $2 WHERE id = $1`,
		sameNoncePromotion.PromotionID,
		secretHash(ciPresentation.Nonce),
	); err != nil {
		t.Fatalf("install same-nonce replay probe: %v", err)
	}
	sameNoncePresentation := signVerificationGateAttestation(
		t,
		sameNonceCandidate,
		sameNoncePromotion,
		privateKey,
	)
	sameNoncePresentation.Nonce = ciPresentation.Nonce
	signAttestationPresentation(t, privateKey, &sameNoncePresentation)
	if _, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		sameNonceCandidate.WorkspaceID,
		sameNoncePromotion.PromotionID,
		sameNoncePromotion.UploadCapability,
		&sameNoncePresentation,
	); !errors.Is(err, ErrAttestationRejected) {
		t.Fatalf("same nonce with different claims/signature = %v, want replay rejection", err)
	}
	assertVerificationAttemptEvidenceCount(
		t,
		databaseA,
		sameNonceCandidate.WorkspaceID,
		sameNonceCandidate.AttemptID,
		0,
	)

	revocationInput := RevocationInput{
		EvidenceID:  ciRecord.Evidence.ID,
		ReasonCode:  "key-compromised",
		Reason:      "CI attestation key compromised",
		EffectiveAt: clock.Now(),
	}
	type revocationResult struct {
		id       string
		replayed bool
		err      error
	}
	revocationStart := make(chan struct{})
	revocationResults := make(chan revocationResult, 2)
	wait = sync.WaitGroup{}
	for _, service := range []*Service{serviceA, serviceB} {
		service := service
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-revocationStart
			id, replayed, err := service.CreateRevocation(
				ctx, "owner-vector", ciCandidate.WorkspaceID, revocationInput,
				"mutation-revocation-0001", "unrevoked",
			)
			revocationResults <- revocationResult{id: id, replayed: replayed, err: err}
		}()
	}
	close(revocationStart)
	wait.Wait()
	close(revocationResults)
	revocationID := ""
	revocationReplayCount := 0
	for result := range revocationResults {
		if result.err != nil {
			t.Fatalf("concurrent revocation failed: %v", result.err)
		}
		if revocationID == "" {
			revocationID = result.id
		} else if revocationID != result.id {
			t.Fatalf("concurrent revocation ids = %q and %q", revocationID, result.id)
		}
		if result.replayed {
			revocationReplayCount++
		}
	}
	if revocationReplayCount != 1 {
		t.Fatalf("concurrent revocation replay count = %d, want 1", revocationReplayCount)
	}
	if id, replayed, err := restarted.CreateRevocation(
		ctx, "owner-vector", ciCandidate.WorkspaceID, revocationInput,
		"mutation-revocation-0001", "unrevoked",
	); err != nil || !replayed || id != revocationID {
		t.Fatalf("restart revocation replay = %q, %t, %v", id, replayed, err)
	}
	changedRevocation := revocationInput
	changedRevocation.Reason = "different reason"
	if _, _, err := restarted.CreateRevocation(
		ctx, "owner-vector", ciCandidate.WorkspaceID, changedRevocation,
		"mutation-revocation-0001", "unrevoked",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("same revocation key with different payload = %v, want conflict", err)
	}
	if _, _, err := restarted.CreateRevocation(
		ctx, "owner-vector", ciCandidate.WorkspaceID, revocationInput,
		"mutation-revocation-0002", "unrevoked",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale unrevoked scope precondition = %v, want conflict", err)
	}
	assertVerificationAuditCount(t, databaseA, ciRecord.Evidence.ID, "trust.revoked", 1)
	assertVerificationMutationCount(t, databaseA, mutationRevocation, 1)

	legalHoldID := "legal-hold-ci-0001"
	if _, err := databaseA.Exec(`INSERT INTO verification_retention_protections (
		id, evidence_id, workspace_id, kind, external_ref, actor_id,
		active, version, created_at
	) VALUES ($1, $2, $3, 'legal-hold', $4, 'system:legal', TRUE, 1, $5)`,
		legalHoldID, ciRecord.Evidence.ID, ciCandidate.WorkspaceID,
		"legal-case-1", clock.Now()); err != nil {
		t.Fatalf("seed legal hold: %v", err)
	}
	if _, _, err := serviceA.ReleaseProtection(
		ctx, "owner-vector", ciCandidate.WorkspaceID, ciRecord.Evidence.ID,
		legalHoldID, "legal-hold", "legal-case-1", 1,
		"mutation-release-legal-0001", "active",
	); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("legal hold release = %v, want hard-cut denial", err)
	}
	var legalHoldActive bool
	if err := databaseA.QueryRow(
		`SELECT active FROM verification_retention_protections WHERE id = $1`,
		legalHoldID,
	).Scan(&legalHoldActive); err != nil || !legalHoldActive {
		t.Fatalf("legal hold active = %t, %v; release crossed hard cut", legalHoldActive, err)
	}
	legalHoldRecord, err := restarted.GetEvidence(
		ctx,
		"owner-vector",
		ciCandidate.WorkspaceID,
		ciRecord.Evidence.ID,
	)
	if err != nil {
		t.Fatalf("restart legal-hold projection read: %v", err)
	}
	if len(legalHoldRecord.ActiveProtections) != 1 ||
		legalHoldRecord.ActiveProtections[0].ID != legalHoldID ||
		legalHoldRecord.ActiveProtections[0].Kind != "legal-hold" {
		t.Fatalf(
			"legal-hold Evidence projection = %#v",
			legalHoldRecord.ActiveProtections,
		)
	}

	type protectionMutationResult struct {
		protection RetentionProtection
		replayed   bool
		err        error
	}
	protectStart := make(chan struct{})
	protectResults := make(chan protectionMutationResult, 2)
	wait = sync.WaitGroup{}
	for _, service := range []*Service{serviceA, serviceB} {
		service := service
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-protectStart
			protection, replayed, err := service.ProtectEvidence(
				ctx, "owner-vector", firstCandidate.WorkspaceID,
				firstRecord.Evidence.ID, "change", "change-42",
				"mutation-protect-first-001", "active", "absent",
			)
			protectResults <- protectionMutationResult{
				protection: protection, replayed: replayed, err: err,
			}
		}()
	}
	close(protectStart)
	wait.Wait()
	close(protectResults)
	var protection RetentionProtection
	protectReplayCount := 0
	for result := range protectResults {
		if result.err != nil {
			t.Fatalf("concurrent protect failed: %v", result.err)
		}
		if protection.ID == "" {
			protection = result.protection
		} else if protection != result.protection {
			t.Fatalf("concurrent protect results differ: %#v vs %#v", protection, result.protection)
		}
		if result.replayed {
			protectReplayCount++
		}
	}
	if protectReplayCount != 1 {
		t.Fatalf("concurrent protect replay count = %d, want 1", protectReplayCount)
	}
	if replayedProtection, replayed, err := restarted.ProtectEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, "change", "change-42",
		"mutation-protect-first-001", "active", "absent",
	); err != nil || !replayed || replayedProtection != protection {
		t.Fatalf("restart protect replay = %#v, %t, %v", replayedProtection, replayed, err)
	}
	protectedRecord, err := restarted.GetEvidence(
		ctx,
		"owner-vector",
		firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID,
	)
	if err != nil {
		t.Fatalf("restart active protection read: %v", err)
	}
	if len(protectedRecord.ActiveProtections) != 1 ||
		protectedRecord.ActiveProtections[0] != protection {
		t.Fatalf(
			"restart active protection projection = %#v",
			protectedRecord.ActiveProtections,
		)
	}
	if _, _, err := restarted.ProtectEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, "change", "change-43",
		"mutation-protect-first-001", "active", "absent",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("same protect key with different payload = %v, want conflict", err)
	}
	if _, _, err := restarted.ProtectEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, "change", "change-42",
		"mutation-protect-first-002", "active", "absent",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale absent protection precondition = %v, want conflict", err)
	}
	assertVerificationAuditCount(t, databaseA, firstRecord.Evidence.ID, "retention.protected", 1)
	assertVerificationMutationCount(t, databaseA, mutationProtect, 1)

	if _, err := serviceA.TombstoneEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, "manual-cleanup",
		"mutation-tombstone-first-001", "active",
	); !errors.Is(err, ErrRetentionProtected) {
		t.Fatalf("protected tombstone = %v, want retention conflict", err)
	}
	assertVerificationMutationCount(t, databaseA, mutationTombstone, 0)

	releaseStart := make(chan struct{})
	releaseResults := make(chan protectionMutationResult, 2)
	wait = sync.WaitGroup{}
	for _, service := range []*Service{serviceA, serviceB} {
		service := service
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-releaseStart
			released, replayed, err := service.ReleaseProtection(
				ctx, "owner-vector", firstCandidate.WorkspaceID,
				firstRecord.Evidence.ID, protection.ID, protection.Kind,
				protection.ExternalRef, protection.Version,
				"mutation-release-first-001", "active",
			)
			releaseResults <- protectionMutationResult{
				protection: released, replayed: replayed, err: err,
			}
		}()
	}
	close(releaseStart)
	wait.Wait()
	close(releaseResults)
	var releasedProtection RetentionProtection
	releaseReplayCount := 0
	for result := range releaseResults {
		if result.err != nil {
			t.Fatalf("concurrent release failed: %v", result.err)
		}
		if releasedProtection.ID == "" {
			releasedProtection = result.protection
		} else if releasedProtection != result.protection {
			t.Fatalf("concurrent release results differ: %#v vs %#v", releasedProtection, result.protection)
		}
		if result.replayed {
			releaseReplayCount++
		}
	}
	if releaseReplayCount != 1 || releasedProtection.Active ||
		releasedProtection.Version != protection.Version+1 {
		t.Fatalf("concurrent release = %#v, replay count %d", releasedProtection, releaseReplayCount)
	}
	if replayedProtection, replayed, err := restarted.ReleaseProtection(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, protection.ID, protection.Kind,
		protection.ExternalRef, protection.Version,
		"mutation-release-first-001", "active",
	); err != nil || !replayed || replayedProtection != releasedProtection {
		t.Fatalf("restart release replay = %#v, %t, %v", replayedProtection, replayed, err)
	}
	releasedRecord, err := restarted.GetEvidence(
		ctx,
		"owner-vector",
		firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID,
	)
	if err != nil {
		t.Fatalf("restart released protection read: %v", err)
	}
	if len(releasedRecord.ActiveProtections) != 0 {
		t.Fatalf(
			"released active protection projection = %#v",
			releasedRecord.ActiveProtections,
		)
	}
	if _, _, err := restarted.ReleaseProtection(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, protection.ID, protection.Kind,
		protection.ExternalRef, protection.Version,
		"mutation-release-first-002", "active",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale release version/state precondition = %v, want conflict", err)
	}
	assertVerificationAuditCount(t, databaseA, firstRecord.Evidence.ID, "retention.released", 1)
	assertVerificationMutationCount(t, databaseA, mutationRelease, 1)

	tombstoneStart := make(chan struct{})
	tombstoneResults := make(chan booleanMutationResult, 2)
	wait = sync.WaitGroup{}
	for _, service := range []*Service{serviceA, serviceB} {
		service := service
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-tombstoneStart
			replayed, err := service.TombstoneEvidence(
				ctx, "owner-vector", firstCandidate.WorkspaceID,
				firstRecord.Evidence.ID, "manual-cleanup",
				"mutation-tombstone-first-001", "active",
			)
			tombstoneResults <- booleanMutationResult{replayed: replayed, err: err}
		}()
	}
	close(tombstoneStart)
	wait.Wait()
	close(tombstoneResults)
	tombstoneReplayCount := 0
	for result := range tombstoneResults {
		if result.err != nil {
			t.Fatalf("concurrent tombstone failed: %v", result.err)
		}
		if result.replayed {
			tombstoneReplayCount++
		}
	}
	if tombstoneReplayCount != 1 {
		t.Fatalf("concurrent tombstone replay count = %d, want 1", tombstoneReplayCount)
	}
	if replayed, err := restarted.TombstoneEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, "manual-cleanup",
		"mutation-tombstone-first-001", "active",
	); err != nil || !replayed {
		t.Fatalf("restart tombstone replay = %t, %v", replayed, err)
	}
	if _, err := restarted.TombstoneEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, "different-reason",
		"mutation-tombstone-first-001", "active",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("same tombstone key with different payload = %v, want conflict", err)
	}
	if _, err := restarted.TombstoneEvidence(
		ctx, "owner-vector", firstCandidate.WorkspaceID,
		firstRecord.Evidence.ID, "manual-cleanup",
		"mutation-tombstone-first-002", "active",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale active tombstone precondition = %v, want conflict", err)
	}
	assertVerificationAuditCount(t, databaseA, firstRecord.Evidence.ID, "evidence.tombstoned", 1)
	assertVerificationMutationCount(t, databaseA, mutationTombstone, 1)
	clock.Set(clock.Now().Add(time.Second))
	if _, err := serviceA.SweepRetention(ctx); err != nil {
		t.Fatalf("release first Evidence references: %v", err)
	}
	assertVerificationRowCount(t, databaseA, "verification_artifacts", 1)
	if _, reader, err := serviceA.ResolveArtifact(
		ctx, "owner-vector", secondCandidate.WorkspaceID,
		secondRecord.Evidence.ID, secondCandidate.Artifacts[0].ID,
	); err != nil {
		t.Fatalf("shared object was deleted with its first reference: %v", err)
	} else {
		_ = reader.Close()
	}

	var durableLocator string
	if err := databaseA.QueryRow(
		`SELECT store_locator FROM verification_artifacts WHERE workspace_id = $1 AND digest = $2`,
		secondCandidate.WorkspaceID, secondCandidate.Artifacts[0].ExpectedDigest,
	).Scan(&durableLocator); err != nil {
		t.Fatalf("load durable locator before GC failure: %v", err)
	}
	durablePath, err := filesystemStore.resolve(durableLocator, "objects")
	if err != nil {
		t.Fatal(err)
	}
	old := mustVectorTime(t, vectorNowText).Add(-24 * time.Hour)
	if err := os.Chtimes(durablePath, old, old); err != nil {
		t.Fatal(err)
	}
	if replayed, err := serviceB.TombstoneEvidence(
		ctx, "owner-vector", secondCandidate.WorkspaceID,
		secondRecord.Evidence.ID, "manual-cleanup",
		"mutation-tombstone-second-001", "active",
	); err != nil || replayed {
		t.Fatalf("tombstone final shared reference = replay %t, %v", replayed, err)
	}
	if replayed, err := serviceA.TombstoneEvidence(
		ctx, "owner-vector", secondCandidate.WorkspaceID,
		secondRecord.Evidence.ID, "manual-cleanup",
		"mutation-tombstone-second-001", "active",
	); err != nil || !replayed {
		t.Fatalf("cross-pool tombstone replay = %t, %v", replayed, err)
	}
	clock.Set(clock.Now().Add(time.Second))
	faultStore.SetDeleteFailure(true)
	if _, err := serviceB.SweepRetention(ctx); err == nil {
		t.Fatal("injected object-store deletion failure was not reported")
	}
	assertVerificationRowCount(t, databaseA, "verification_artifacts", 1)
	var deletionToken string
	if err := databaseA.QueryRow(`SELECT token
FROM verification_artifact_operation_leases
WHERE locator = $1 AND mode = 'deletion'`,
		durableLocator,
	).Scan(&deletionToken); err != nil || deletionToken == "" {
		t.Fatalf("failed object deletion did not retain its deletion lease: %q, %v", deletionToken, err)
	}
	if _, err := os.Stat(durablePath); err != nil {
		t.Fatalf("failure probe object disappeared unexpectedly: %v", err)
	}

	recoveredService := newVerificationGateService(t, databaseA, filesystemStore, clock, verifier)
	recovery, err := recoveredService.SweepRetention(ctx)
	if err != nil {
		t.Fatalf("restart orphan reconciliation: %v", err)
	}
	if recovery.DeletedArtifacts != 1 {
		t.Fatalf("restart completed %d leased deletions, want 1", recovery.DeletedArtifacts)
	}
	assertVerificationRowCount(t, databaseA, "verification_artifacts", 0)
	if _, err := os.Stat(durablePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("untracked durable object survived recovery: %v", err)
	}
	if _, _, err := recoveredService.ResolveArtifact(
		ctx, "owner-vector", secondCandidate.WorkspaceID,
		secondRecord.Evidence.ID, secondCandidate.Artifacts[0].ID,
	); !errors.Is(err, ErrExpired) {
		t.Fatalf("deleted Evidence artifact = %v, want explicit expired/deleted state", err)
	}

	stagingOrphan, err := filesystemStore.PutStaging(
		ctx, "orphan-promotion", "orphan-artifact",
		bytes.NewReader(artifactBody), int64(len(artifactBody)),
	)
	if err != nil {
		t.Fatal(err)
	}
	stagingPath, err := filesystemStore.resolve(stagingOrphan.Locator, "staging")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(stagingPath, old, old); err != nil {
		t.Fatal(err)
	}
	recovery, err = recoveredService.SweepRetention(ctx)
	if err != nil || recovery.RecoveredOrphans < 1 {
		t.Fatalf("staging orphan recovery = %#v, %v", recovery, err)
	}
	if _, err := os.Stat(stagingPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("untracked staging object survived recovery: %v", err)
	}

	uploadRetryBody := verificationReplayArtifactBody(t, "PG_UPLOAD_RETRY")
	uploadRetryCandidate := verificationPostgreSQLCandidate(t, uploadRetryBody, "upload-retry")
	uploadRetryBody = issueVerificationGateArtifactAttemptGrant(
		t,
		serviceA,
		&uploadRetryCandidate,
		uploadRetryBody,
	)
	uploadRetryPromotion, err := serviceA.CreatePromotion(
		ctx,
		"owner-vector",
		uploadRetryCandidate.WorkspaceID,
		uploadRetryCandidate.Promotion.IdempotencyKey,
		uploadRetryCandidate,
	)
	if err != nil {
		t.Fatalf("create interrupted-upload promotion: %v", err)
	}
	partial := append([]byte(nil), uploadRetryBody[:len(uploadRetryBody)/2]...)
	if _, err := serviceA.UploadArtifact(
		ctx,
		"owner-vector",
		uploadRetryCandidate.WorkspaceID,
		uploadRetryPromotion.PromotionID,
		uploadRetryCandidate.Artifacts[0].ID,
		uploadRetryPromotion.UploadCapability,
		"application/json",
		&interruptedArtifactUpload{prefix: partial},
	); err == nil {
		t.Fatal("interrupted artifact upload unexpectedly succeeded")
	}
	assertVerificationAttemptEvidenceCount(
		t,
		databaseA,
		uploadRetryCandidate.WorkspaceID,
		uploadRetryCandidate.AttemptID,
		0,
	)
	assertVerificationPromotionState(
		t,
		databaseA,
		uploadRetryPromotion.PromotionID,
		"staging",
		"",
	)
	assertVerificationPromotionArtifactState(
		t,
		databaseA,
		uploadRetryPromotion.PromotionID,
		uploadRetryCandidate.Artifacts[0].ID,
		"pending",
		false,
	)
	partialLocator := filepath.Join(
		"staging",
		storeComponent(uploadRetryPromotion.PromotionID),
		storeComponent(uploadRetryCandidate.Artifacts[0].ID)+".blob",
	)
	partialPath, err := filesystemStore.resolve(partialLocator, "staging")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(partialPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("interrupted upload left a visible staging object: %v", err)
	}
	if _, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		uploadRetryCandidate.WorkspaceID,
		uploadRetryPromotion.PromotionID,
		uploadRetryPromotion.UploadCapability,
		nil,
	); !errors.Is(err, ErrArtifactMissing) {
		t.Fatalf("partial upload finalize = %v, want missing artifact", err)
	}
	if _, err := serviceB.UploadArtifact(
		ctx,
		"owner-vector",
		uploadRetryCandidate.WorkspaceID,
		uploadRetryPromotion.PromotionID,
		uploadRetryCandidate.Artifacts[0].ID,
		uploadRetryPromotion.UploadCapability,
		"application/json",
		bytes.NewReader(uploadRetryBody),
	); err != nil {
		t.Fatalf("retry complete artifact upload: %v", err)
	}
	uploadRetryRecord, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		uploadRetryCandidate.WorkspaceID,
		uploadRetryPromotion.PromotionID,
		uploadRetryPromotion.UploadCapability,
		nil,
	)
	if err != nil {
		t.Fatalf("finalize retried artifact upload: %v", err)
	}
	uploadRetryReplay, err := serviceA.FinalizePromotion(
		ctx,
		"owner-vector",
		uploadRetryCandidate.WorkspaceID,
		uploadRetryPromotion.PromotionID,
		uploadRetryPromotion.UploadCapability,
		nil,
	)
	if err != nil ||
		uploadRetryReplay.Evidence.ManifestDigest != uploadRetryRecord.Evidence.ManifestDigest {
		t.Fatalf("replay retried artifact promotion = %#v, %v", uploadRetryReplay, err)
	}
	assertVerificationAttemptEvidenceCount(
		t,
		databaseA,
		uploadRetryCandidate.WorkspaceID,
		uploadRetryCandidate.AttemptID,
		1,
	)
	assertVerificationAuditCount(
		t,
		databaseA,
		uploadRetryRecord.Evidence.ID,
		"evidence.committed",
		1,
	)

	promoteRetryBody := verificationReplayArtifactBody(t, "PG_PROMOTE_RETRY")
	promoteRetryCandidate := verificationPostgreSQLCandidate(t, promoteRetryBody, "promote-retry")
	promoteRetryBody = issueVerificationGateArtifactAttemptGrant(
		t,
		serviceA,
		&promoteRetryCandidate,
		promoteRetryBody,
	)
	promoteRetryPromotion, err := serviceA.CreatePromotion(
		ctx,
		"owner-vector",
		promoteRetryCandidate.WorkspaceID,
		promoteRetryCandidate.Promotion.IdempotencyKey,
		promoteRetryCandidate,
	)
	if err != nil {
		t.Fatalf("create Promote-outage promotion: %v", err)
	}
	if _, err := serviceA.UploadArtifact(
		ctx,
		"owner-vector",
		promoteRetryCandidate.WorkspaceID,
		promoteRetryPromotion.PromotionID,
		promoteRetryCandidate.Artifacts[0].ID,
		promoteRetryPromotion.UploadCapability,
		"application/json",
		bytes.NewReader(promoteRetryBody),
	); err != nil {
		t.Fatalf("upload Promote-outage artifact: %v", err)
	}
	faultStore.FailNextPromote()
	if _, err := serviceA.FinalizePromotion(
		ctx,
		"owner-vector",
		promoteRetryCandidate.WorkspaceID,
		promoteRetryPromotion.PromotionID,
		promoteRetryPromotion.UploadCapability,
		nil,
	); err == nil {
		t.Fatal("injected object-store Promote failure was not reported")
	}
	assertVerificationAttemptEvidenceCount(
		t,
		databaseA,
		promoteRetryCandidate.WorkspaceID,
		promoteRetryCandidate.AttemptID,
		0,
	)
	assertVerificationArtifactDigestCount(
		t,
		databaseA,
		promoteRetryCandidate.WorkspaceID,
		promoteRetryCandidate.Artifacts[0].ExpectedDigest,
		0,
	)
	assertVerificationPromotionState(
		t,
		databaseA,
		promoteRetryPromotion.PromotionID,
		"staging",
		"",
	)
	assertVerificationPromotionArtifactState(
		t,
		databaseA,
		promoteRetryPromotion.PromotionID,
		promoteRetryCandidate.Artifacts[0].ID,
		"accepted",
		true,
	)
	assertVerificationAuditCount(
		t,
		databaseA,
		promoteRetryPromotion.EvidenceID,
		"evidence.committed",
		0,
	)
	promoteDigestHex := strings.TrimPrefix(
		promoteRetryCandidate.Artifacts[0].ExpectedDigest,
		"sha256-",
	)
	promoteDurableLocator := filepath.Join(
		"objects",
		storeComponent(promoteRetryCandidate.WorkspaceID),
		promoteDigestHex[:2],
		promoteDigestHex+".blob",
	)
	promoteDurablePath, err := filesystemStore.resolve(promoteDurableLocator, "objects")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(promoteDurablePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed Promote left a durable object: %v", err)
	}
	recoveredPromoteService := newVerificationGateService(
		t,
		databaseB,
		faultStore,
		clock,
		verifier,
	)
	promoteRetryRecord, err := recoveredPromoteService.FinalizePromotion(
		ctx,
		"owner-vector",
		promoteRetryCandidate.WorkspaceID,
		promoteRetryPromotion.PromotionID,
		promoteRetryPromotion.UploadCapability,
		nil,
	)
	if err != nil {
		t.Fatalf("retry finalize after object-store recovery: %v", err)
	}
	promoteRetryReplay, err := serviceA.FinalizePromotion(
		ctx,
		"owner-vector",
		promoteRetryCandidate.WorkspaceID,
		promoteRetryPromotion.PromotionID,
		promoteRetryPromotion.UploadCapability,
		nil,
	)
	if err != nil ||
		promoteRetryReplay.Evidence.ManifestDigest != promoteRetryRecord.Evidence.ManifestDigest {
		t.Fatalf("replay recovered Promote = %#v, %v", promoteRetryReplay, err)
	}
	assertVerificationAttemptEvidenceCount(
		t,
		databaseA,
		promoteRetryCandidate.WorkspaceID,
		promoteRetryCandidate.AttemptID,
		1,
	)
	assertVerificationArtifactDigestCount(
		t,
		databaseA,
		promoteRetryCandidate.WorkspaceID,
		promoteRetryCandidate.Artifacts[0].ExpectedDigest,
		1,
	)
	assertVerificationAuditCount(
		t,
		databaseA,
		promoteRetryRecord.Evidence.ID,
		"evidence.committed",
		1,
	)
	if _, err := os.Stat(promoteDurablePath); err != nil {
		t.Fatalf("recovered Promote did not install the durable object: %v", err)
	}
	runClosureSnapshotConsistencyGate(
		t,
		databaseA,
		serviceA,
		serviceB,
		clock,
	)
	runRetentionEvidenceLockRaceGate(
		t,
		databaseA,
		serviceA,
		serviceB,
		clock,
	)
	faultStore.SetDeleteFailure(false)
	runArtifactDeletionLeaseRaceGate(
		t,
		databaseA,
		serviceA,
		serviceB,
		clock,
	)
	assertWorkspaceDeletionPreservesDurableEvidenceIdentity(
		t,
		databaseA,
		created.PromotionID,
		firstRecord.Evidence.ID,
	)
}
