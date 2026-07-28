package verification

import (
	"bytes"
	"context"
	"crypto/ed25519"
	cryptorand "crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
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

func assertEvidenceAppendOnlyGate(
	t *testing.T,
	database *sql.DB,
	record EvidenceRecord,
) {
	t.Helper()
	ctx := context.Background()
	var beforeDigest string
	var beforeManifest []byte
	if err := database.QueryRowContext(
		ctx,
		`SELECT manifest_digest, manifest_bytes
FROM verification_evidence
WHERE workspace_id = $1 AND id = $2`,
		record.Evidence.WorkspaceID,
		record.Evidence.ID,
	).Scan(&beforeDigest, &beforeManifest); err != nil {
		t.Fatalf("read immutable Evidence baseline: %v", err)
	}
	if _, err := database.ExecContext(
		ctx,
		`UPDATE verification_evidence SET outcome = 'failed' WHERE id = $1`,
		record.Evidence.ID,
	); err == nil {
		t.Fatal("direct durable Evidence UPDATE bypassed append-only enforcement")
	}
	if _, err := database.ExecContext(
		ctx,
		`DELETE FROM verification_evidence WHERE id = $1`,
		record.Evidence.ID,
	); err == nil {
		t.Fatal("direct durable Evidence DELETE bypassed append-only enforcement")
	}
	var afterDigest string
	var afterManifest []byte
	if err := database.QueryRowContext(
		ctx,
		`SELECT manifest_digest, manifest_bytes
FROM verification_evidence
WHERE workspace_id = $1 AND id = $2`,
		record.Evidence.WorkspaceID,
		record.Evidence.ID,
	).Scan(&afterDigest, &afterManifest); err != nil {
		t.Fatalf("reload immutable Evidence after rejected mutations: %v", err)
	}
	if beforeDigest != record.Evidence.ManifestDigest ||
		afterDigest != beforeDigest ||
		!bytes.Equal(afterManifest, beforeManifest) {
		t.Fatal("rejected direct mutation changed the durable Evidence row or manifest")
	}
}

func runRetentionEvidenceLockRaceGate(
	t *testing.T,
	database *sql.DB,
	serviceA *Service,
	serviceB *Service,
	clock *verificationGateClock,
) {
	t.Helper()
	ctx := context.Background()
	type protectionResult struct {
		protection RetentionProtection
		err        error
	}
	type tombstoneResult struct {
		replayed bool
		err      error
	}

	sweepCandidate := verificationPostgreSQLCandidate(t, nil, "retention-sweep-race")
	var sessionPolicy map[string]any
	if err := json.Unmarshal(verificationPolicyWireFixture(), &sessionPolicy); err != nil {
		t.Fatal(err)
	}
	retentionRequest, ok := sessionPolicy["retentionRequest"].(map[string]any)
	if !ok {
		t.Fatal("VerificationPolicy fixture omitted retentionRequest")
	}
	retentionRequest["successful"] = string(RetentionSession)
	sessionPolicyBytes, err := canonicalBytes(sessionPolicy)
	if err != nil {
		t.Fatal(err)
	}
	normalizedSessionPolicy, _, err := normalizePersistedVerificationPolicy(
		sessionPolicyBytes,
	)
	if err != nil {
		t.Fatalf("normalize session-retention policy fixture: %v", err)
	}
	sessionPolicyDigest, _, err := canonicalDigest(normalizedSessionPolicy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`UPDATE workspace_documents
SET content_rev = 2, content_json = $2::jsonb, updated_at = $3
WHERE workspace_id = $1 AND id = 'policy.default'`,
		sweepCandidate.WorkspaceID,
		string(sessionPolicyBytes),
		clock.Now(),
	); err != nil {
		t.Fatalf("install session-retention policy fixture: %v", err)
	}
	sweepCandidate.PartitionRevisions.DocumentRevisions["policy.default"] =
		DocumentRevision{ContentRev: 2, MetaRev: 1}
	sweepCandidate.PolicyRevision = 2
	sweepCandidate.PolicyDigest = sessionPolicyDigest
	sweepCandidate.Redaction.TargetPolicy.PolicyDigest = sessionPolicyDigest
	sweepCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		sweepCandidate,
		"candidateDigest",
	)
	originalSessionRetention := serviceA.config.SessionRetention
	serviceA.config.SessionRetention = time.Second
	_, sweepRecord := promoteVerificationGateCandidate(
		t,
		serviceA,
		&sweepCandidate,
		nil,
		nil,
		nil,
	)
	serviceA.config.SessionRetention = originalSessionRetention
	if _, err := database.Exec(`UPDATE workspace_documents
SET content_rev = 1, content_json = $2::jsonb, updated_at = $3
WHERE workspace_id = $1 AND id = 'policy.default'`,
		sweepCandidate.WorkspaceID,
		string(verificationPolicyWireFixture()),
		clock.Now(),
	); err != nil {
		t.Fatalf("restore canonical VerificationPolicy fixture: %v", err)
	}
	clock.Set(clock.Now().Add(2 * time.Second))
	sweepLocked := make(chan struct{})
	sweepResume := make(chan struct{})
	var sweepLockOnce sync.Once
	serviceA.repository.retentionEvidenceLockBarrier = func(operation string, evidenceID string) {
		if operation != "retention.sweep-tombstone" ||
			evidenceID != sweepRecord.Evidence.ID {
			return
		}
		sweepLockOnce.Do(func() { close(sweepLocked) })
		<-sweepResume
	}
	type retentionSweepResult struct {
		result RetentionSweepResult
		err    error
	}
	sweepOutcome := make(chan retentionSweepResult, 1)
	go func() {
		result, err := serviceA.SweepRetention(ctx)
		sweepOutcome <- retentionSweepResult{result: result, err: err}
	}()
	select {
	case <-sweepLocked:
	case <-time.After(5 * time.Second):
		close(sweepResume)
		t.Fatal("retention sweep did not lock the target Evidence")
	}
	protectOutcome := make(chan protectionResult, 1)
	go func() {
		protection, _, err := serviceB.ProtectEvidence(
			ctx,
			"owner-vector",
			sweepCandidate.WorkspaceID,
			sweepRecord.Evidence.ID,
			"change",
			"change-retention-sweep-race",
			"mutation-protect-sweep-race-001",
			"active",
			"absent",
		)
		protectOutcome <- protectionResult{protection: protection, err: err}
	}()
	select {
	case outcome := <-protectOutcome:
		close(sweepResume)
		t.Fatalf("Protect bypassed the sweep Evidence lock: %#v, %v", outcome.protection, outcome.err)
	case <-time.After(50 * time.Millisecond):
	}
	close(sweepResume)
	swept := <-sweepOutcome
	serviceA.repository.retentionEvidenceLockBarrier = nil
	if swept.err != nil || swept.result.TombstonedEvidence < 1 {
		t.Fatalf("sweep-first retention race = %#v, %v", swept.result, swept.err)
	}
	protected := <-protectOutcome
	if !errors.Is(protected.err, ErrConflict) {
		t.Fatalf("Protect after sweep tombstone = %#v, %v", protected.protection, protected.err)
	}
	assertEvidenceRetentionTerminalState(
		t,
		database,
		sweepRecord.Evidence.ID,
		true,
		0,
	)

	protectCandidate := verificationPostgreSQLCandidate(t, nil, "retention-protect-race")
	protectCandidate.PlanDigest = repeatedDigest('2')
	protectCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		protectCandidate,
		"candidateDigest",
	)
	_, protectRecord := promoteVerificationGateCandidate(
		t,
		serviceA,
		&protectCandidate,
		nil,
		nil,
		nil,
	)
	protectLocked := make(chan struct{})
	protectResume := make(chan struct{})
	var protectLockOnce sync.Once
	serviceA.repository.retentionEvidenceLockBarrier = func(operation string, evidenceID string) {
		if operation != mutationProtect || evidenceID != protectRecord.Evidence.ID {
			return
		}
		protectLockOnce.Do(func() { close(protectLocked) })
		<-protectResume
	}
	protectFirstOutcome := make(chan protectionResult, 1)
	go func() {
		protection, _, err := serviceA.ProtectEvidence(
			ctx,
			"owner-vector",
			protectCandidate.WorkspaceID,
			protectRecord.Evidence.ID,
			"release",
			"release-retention-protect-race",
			"mutation-protect-tombstone-race-001",
			"active",
			"absent",
		)
		protectFirstOutcome <- protectionResult{protection: protection, err: err}
	}()
	select {
	case <-protectLocked:
	case <-time.After(5 * time.Second):
		close(protectResume)
		t.Fatal("Protect did not lock the target Evidence")
	}
	tombstoneOutcome := make(chan tombstoneResult, 1)
	go func() {
		replayed, err := serviceB.TombstoneEvidence(
			ctx,
			"owner-vector",
			protectCandidate.WorkspaceID,
			protectRecord.Evidence.ID,
			"retention-lock-race",
			"mutation-tombstone-protect-race-001",
			"active",
		)
		tombstoneOutcome <- tombstoneResult{replayed: replayed, err: err}
	}()
	select {
	case outcome := <-tombstoneOutcome:
		close(protectResume)
		t.Fatalf("Tombstone bypassed the Protect Evidence lock: %#v", outcome)
	case <-time.After(50 * time.Millisecond):
	}
	close(protectResume)
	protectFirst := <-protectFirstOutcome
	serviceA.repository.retentionEvidenceLockBarrier = nil
	if protectFirst.err != nil || !protectFirst.protection.Active {
		t.Fatalf("protect-first retention race = %#v, %v", protectFirst.protection, protectFirst.err)
	}
	tombstoned := <-tombstoneOutcome
	if !errors.Is(tombstoned.err, ErrRetentionProtected) || tombstoned.replayed {
		t.Fatalf("Tombstone after Protect = %#v", tombstoned)
	}
	assertEvidenceRetentionTerminalState(
		t,
		database,
		protectRecord.Evidence.ID,
		false,
		1,
	)
}

func assertEvidenceRetentionTerminalState(
	t *testing.T,
	database *sql.DB,
	evidenceID string,
	tombstoned bool,
	activeProtections int,
) {
	t.Helper()
	var storedTombstone bool
	var storedProtections int
	if err := database.QueryRow(`SELECT
	EXISTS (SELECT 1 FROM verification_tombstones WHERE evidence_id = $1),
	(SELECT COUNT(*) FROM verification_retention_protections
		WHERE evidence_id = $1 AND active)`, evidenceID).Scan(
		&storedTombstone,
		&storedProtections,
	); err != nil {
		t.Fatal(err)
	}
	if storedTombstone != tombstoned || storedProtections != activeProtections {
		t.Fatalf(
			"Evidence %q retention state = tombstone %t, protections %d; want %t, %d",
			evidenceID,
			storedTombstone,
			storedProtections,
			tombstoned,
			activeProtections,
		)
	}
}

func runArtifactDeletionLeaseRaceGate(
	t *testing.T,
	database *sql.DB,
	serviceA *Service,
	serviceB *Service,
	clock *verificationGateClock,
) {
	t.Helper()
	ctx := context.Background()

	gcFirstBody := verificationReplayArtifactBody(t, "PG_GC_FIRST")
	gcFirstOld := verificationPostgreSQLCandidate(t, gcFirstBody, "gc-first-old")
	gcFirstOld.PlanDigest = repeatedDigest('a')
	gcFirstOld.CandidateDigest = mustDigestWithoutField(t, gcFirstOld, "candidateDigest")
	_, gcFirstOldRecord := promoteVerificationGateCandidate(
		t,
		serviceA,
		&gcFirstOld,
		gcFirstBody,
		nil,
		nil,
	)
	gcFirstNew := verificationPostgreSQLCandidate(t, gcFirstBody, "gc-first-new")
	gcFirstNew.PlanDigest = repeatedDigest('b')
	gcFirstNew.CandidateDigest = mustDigestWithoutField(t, gcFirstNew, "candidateDigest")
	gcFirstPromotion := createUploadedArtifactPromotion(
		t,
		serviceB,
		&gcFirstNew,
		gcFirstBody,
	)
	if _, err := serviceB.TombstoneEvidence(
		ctx,
		"owner-vector",
		gcFirstOld.WorkspaceID,
		gcFirstOldRecord.Evidence.ID,
		"gc-race",
		"mutation-tombstone-gc-race-001",
		"active",
	); err != nil {
		t.Fatalf("tombstone GC-first source Evidence: %v", err)
	}
	clock.Set(clock.Now().Add(time.Second))
	leaseEntered := make(chan struct{})
	leaseResume := make(chan struct{})
	var leaseOnce sync.Once
	serviceA.repository.artifactDeletionLeaseBarrier = func(lease ArtifactDeletionLease) {
		if lease.Digest != gcFirstNew.Artifacts[0].ExpectedDigest {
			return
		}
		leaseOnce.Do(func() { close(leaseEntered) })
		<-leaseResume
	}
	type sweepResult struct {
		result RetentionSweepResult
		err    error
	}
	gcFirstSweep := make(chan sweepResult, 1)
	go func() {
		result, err := serviceA.SweepRetention(ctx)
		gcFirstSweep <- sweepResult{result: result, err: err}
	}()
	select {
	case <-leaseEntered:
	case <-time.After(5 * time.Second):
		close(leaseResume)
		t.Fatal("GC-first sweep did not acquire the artifact deletion lease")
	}
	if _, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		gcFirstNew.WorkspaceID,
		gcFirstPromotion.PromotionID,
		gcFirstPromotion.UploadCapability,
		nil,
	); !errors.Is(err, ErrConflict) {
		close(leaseResume)
		t.Fatalf("Finalize reused a deleting artifact: %v", err)
	}
	assertVerificationAttemptEvidenceCount(
		t,
		database,
		gcFirstNew.WorkspaceID,
		gcFirstNew.AttemptID,
		0,
	)
	close(leaseResume)
	outcome := <-gcFirstSweep
	serviceA.repository.artifactDeletionLeaseBarrier = nil
	if outcome.err != nil || outcome.result.DeletedArtifacts != 1 {
		t.Fatalf("GC-first leased deletion = %#v, %v", outcome.result, outcome.err)
	}
	gcFirstRecord, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		gcFirstNew.WorkspaceID,
		gcFirstPromotion.PromotionID,
		gcFirstPromotion.UploadCapability,
		nil,
	)
	if err != nil {
		t.Fatalf("Finalize retry after leased deletion completed: %v", err)
	}
	assertArtifactReadable(
		t,
		serviceA,
		gcFirstRecord,
		gcFirstNew,
		gcFirstBody,
	)

	finalizeFirstBody := verificationReplayArtifactBody(t, "PG_FINALIZE_FIRST")
	finalizeFirstOld := verificationPostgreSQLCandidate(
		t,
		finalizeFirstBody,
		"finalize-first-old",
	)
	finalizeFirstOld.PlanDigest = repeatedDigest('c')
	finalizeFirstOld.CandidateDigest = mustDigestWithoutField(
		t,
		finalizeFirstOld,
		"candidateDigest",
	)
	_, finalizeFirstOldRecord := promoteVerificationGateCandidate(
		t,
		serviceA,
		&finalizeFirstOld,
		finalizeFirstBody,
		nil,
		nil,
	)
	finalizeFirstNew := verificationPostgreSQLCandidate(
		t,
		finalizeFirstBody,
		"finalize-first-new",
	)
	finalizeFirstNew.PlanDigest = repeatedDigest('e')
	finalizeFirstNew.CandidateDigest = mustDigestWithoutField(
		t,
		finalizeFirstNew,
		"candidateDigest",
	)
	finalizeFirstPromotion := createUploadedArtifactPromotion(
		t,
		serviceB,
		&finalizeFirstNew,
		finalizeFirstBody,
	)
	if _, err := serviceA.TombstoneEvidence(
		ctx,
		"owner-vector",
		finalizeFirstOld.WorkspaceID,
		finalizeFirstOldRecord.Evidence.ID,
		"finalize-race",
		"mutation-tombstone-finalize-race-001",
		"active",
	); err != nil {
		t.Fatalf("tombstone Finalize-first source Evidence: %v", err)
	}
	clock.Set(clock.Now().Add(time.Second))

	commitEntered := make(chan struct{})
	commitResume := make(chan struct{})
	var commitOnce sync.Once
	serviceB.repository.artifactCommitBarrier = func(_ string, digest string) {
		if digest != finalizeFirstNew.Artifacts[0].ExpectedDigest {
			return
		}
		commitOnce.Do(func() { close(commitEntered) })
		<-commitResume
	}
	finalizeResult := make(chan artifactFinalizeResult, 1)
	go func() {
		record, err := serviceB.FinalizePromotion(
			ctx,
			"owner-vector",
			finalizeFirstNew.WorkspaceID,
			finalizeFirstPromotion.PromotionID,
			finalizeFirstPromotion.UploadCapability,
			nil,
		)
		finalizeResult <- artifactFinalizeResult{record: record, err: err}
	}()
	select {
	case <-commitEntered:
	case <-time.After(5 * time.Second):
		close(commitResume)
		t.Fatal("Finalize-first promotion did not lock the durable artifact row")
	}

	scanEntered := make(chan struct{})
	scanResume := make(chan struct{})
	var scanOnce sync.Once
	serviceA.repository.artifactDeletionScanBarrier = func() {
		scanOnce.Do(func() { close(scanEntered) })
		<-scanResume
	}
	finalizeFirstSweep := make(chan sweepResult, 1)
	go func() {
		result, err := serviceA.SweepRetention(ctx)
		finalizeFirstSweep <- sweepResult{result: result, err: err}
	}()
	select {
	case <-scanEntered:
	case <-time.After(5 * time.Second):
		close(scanResume)
		close(commitResume)
		t.Fatal("Finalize-first sweep did not reach the deletion scan")
	}
	close(scanResume)
	close(commitResume)
	finalized := <-finalizeResult
	serviceB.repository.artifactCommitBarrier = nil
	if finalized.err != nil {
		t.Fatalf("Finalize-first promotion failed: %v", finalized.err)
	}
	swept := <-finalizeFirstSweep
	serviceA.repository.artifactDeletionScanBarrier = nil
	if swept.err != nil || swept.result.DeletedArtifacts != 0 {
		t.Fatalf("Finalize-first sweep deleted a newly referenced artifact: %#v, %v", swept.result, swept.err)
	}
	assertArtifactReadable(
		t,
		serviceA,
		finalized.record,
		finalizeFirstNew,
		finalizeFirstBody,
	)
	finalizeFirstLocator, err := serviceA.store.DurableLocator(
		finalizeFirstNew.WorkspaceID,
		finalizeFirstNew.Artifacts[0].ExpectedDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	var activeDeletionLeases int
	if err := database.QueryRow(`SELECT COUNT(*)
FROM verification_artifact_operation_leases
WHERE locator = $1 AND mode = 'deletion'`,
		finalizeFirstLocator,
	).Scan(&activeDeletionLeases); err != nil || activeDeletionLeases != 0 {
		t.Fatalf("referenced artifact retained %d deletion leases: %v", activeDeletionLeases, err)
	}

	orphanBody := verificationReplayArtifactBody(t, "PG_ORPHAN_FIRST")
	orphanCrash := verificationPostgreSQLCandidate(t, orphanBody, "orphan-crash")
	orphanCrash.PlanDigest = repeatedDigest('7')
	orphanCrash.CandidateDigest = mustDigestWithoutField(t, orphanCrash, "candidateDigest")
	orphanCrashPromotion := createUploadedArtifactPromotion(
		t,
		serviceA,
		&orphanCrash,
		orphanBody,
	)
	orphanCrashRows, err := serviceA.repository.ListPromotionArtifacts(
		ctx,
		orphanCrashPromotion.PromotionID,
	)
	if err != nil || len(orphanCrashRows) != 1 {
		t.Fatalf("load crash promotion artifact: %#v, %v", orphanCrashRows, err)
	}
	orphanObject, err := serviceA.store.Promote(
		ctx,
		orphanCrash.WorkspaceID,
		orphanCrash.Artifacts[0].ExpectedDigest,
		orphanCrash.Artifacts[0].ExpectedSize,
		orphanCrashRows[0].StagingLocator,
	)
	if err != nil {
		t.Fatalf("simulate crash after durable promotion: %v", err)
	}
	filesystemStore := serviceA.store.(*faultInjectingArtifactStore).
		ArtifactObjectStore.(*FilesystemArtifactStore)
	orphanPath, err := filesystemStore.resolve(orphanObject.Locator, "objects")
	if err != nil {
		t.Fatal(err)
	}
	orphanOld := clock.Now().Add(-2 * serviceA.config.PromotionTTL)
	if err := os.Chtimes(orphanPath, orphanOld, orphanOld); err != nil {
		t.Fatal(err)
	}

	orphanNew := verificationPostgreSQLCandidate(t, orphanBody, "orphan-new")
	orphanNew.PlanDigest = repeatedDigest('8')
	orphanNew.CandidateDigest = mustDigestWithoutField(t, orphanNew, "candidateDigest")
	orphanNewPromotion := createUploadedArtifactPromotion(
		t,
		serviceB,
		&orphanNew,
		orphanBody,
	)
	orphanLeaseEntered := make(chan struct{})
	orphanLeaseResume := make(chan struct{})
	var orphanLeaseOnce sync.Once
	serviceA.repository.artifactDeletionLeaseBarrier = func(lease ArtifactDeletionLease) {
		if lease.Locator != orphanObject.Locator || lease.WorkspaceID != "" {
			return
		}
		orphanLeaseOnce.Do(func() { close(orphanLeaseEntered) })
		<-orphanLeaseResume
	}
	orphanSweep := make(chan sweepResult, 1)
	go func() {
		result, err := serviceA.SweepRetention(ctx)
		orphanSweep <- sweepResult{result: result, err: err}
	}()
	select {
	case <-orphanLeaseEntered:
	case <-time.After(5 * time.Second):
		close(orphanLeaseResume)
		t.Fatal("orphan cleanup did not acquire the shared deletion lease")
	}
	if _, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		orphanNew.WorkspaceID,
		orphanNewPromotion.PromotionID,
		orphanNewPromotion.UploadCapability,
		nil,
	); !errors.Is(err, ErrConflict) {
		close(orphanLeaseResume)
		t.Fatalf("promotion reused an orphan under deletion: %v", err)
	}
	assertVerificationAttemptEvidenceCount(
		t,
		database,
		orphanNew.WorkspaceID,
		orphanNew.AttemptID,
		0,
	)
	close(orphanLeaseResume)
	orphanSweepResult := <-orphanSweep
	serviceA.repository.artifactDeletionLeaseBarrier = nil
	if orphanSweepResult.err != nil || orphanSweepResult.result.RecoveredOrphans != 1 {
		t.Fatalf(
			"orphan leased deletion = %#v, %v",
			orphanSweepResult.result,
			orphanSweepResult.err,
		)
	}
	orphanRecord, err := serviceB.FinalizePromotion(
		ctx,
		"owner-vector",
		orphanNew.WorkspaceID,
		orphanNewPromotion.PromotionID,
		orphanNewPromotion.UploadCapability,
		nil,
	)
	if err != nil {
		t.Fatalf("promotion retry after orphan deletion: %v", err)
	}
	assertArtifactReadable(t, serviceB, orphanRecord, orphanNew, orphanBody)

	clock.Set(mustVectorTime(t, vectorNowText))
	assertArtifactLogicalIdentityProjectionGate(t, database, serviceB)
}

func assertWorkspaceDeletionPreservesDurableEvidenceIdentity(
	t *testing.T,
	database *sql.DB,
	promotionID string,
	evidenceID string,
) {
	t.Helper()
	ctx := context.Background()
	var grantID string
	if err := database.QueryRowContext(
		ctx,
		`SELECT attempt_grant_id FROM verification_promotions WHERE id = $1`,
		promotionID,
	).Scan(&grantID); err != nil {
		t.Fatalf("load durable AttemptGrant identity before Workspace deletion: %v", err)
	}
	if _, err := database.ExecContext(
		ctx,
		`DELETE FROM projects WHERE id = $1`,
		"project-vector",
	); err != nil {
		t.Fatalf("delete Project/Workspace with durable Verification identity: %v", err)
	}
	for label, check := range map[string]struct {
		query    string
		argument string
	}{
		"workspace removed": {
			query:    `SELECT COUNT(*) FROM workspaces WHERE id = $1`,
			argument: "workspace-vector",
		},
		"grant retained": {
			query:    `SELECT COUNT(*) FROM verification_attempt_grants WHERE id = $1`,
			argument: grantID,
		},
		"promotion retained": {
			query:    `SELECT COUNT(*) FROM verification_promotions WHERE id = $1`,
			argument: promotionID,
		},
		"evidence retained": {
			query:    `SELECT COUNT(*) FROM verification_evidence WHERE id = $1`,
			argument: evidenceID,
		},
	} {
		var count int
		if err := database.QueryRowContext(
			ctx,
			check.query,
			check.argument,
		).Scan(&count); err != nil {
			t.Fatalf("%s query failed: %v", label, err)
		}
		want := 1
		if label == "workspace removed" {
			want = 0
		}
		if count != want {
			t.Fatalf("%s count = %d, want %d", label, count, want)
		}
	}
}

func assertArtifactLogicalIdentityProjectionGate(
	t *testing.T,
	database *sql.DB,
	service *Service,
) {
	t.Helper()
	body := encodedArtifactImage(t, "png", 3, 2)

	screenshot := verificationPostgreSQLCandidate(t, body, "logical-screenshot")
	screenshot.Artifacts[0].Path = "visual/screenshot.png"
	screenshot.Artifacts[0].Kind = ArtifactScreenshot
	screenshot.Artifacts[0].ExpectedMediaType = "image/png"
	screenshot.CandidateDigest = mustDigestWithoutField(
		t,
		screenshot,
		"candidateDigest",
	)
	_, screenshotRecord := promoteVerificationGateCandidate(
		t,
		service,
		&screenshot,
		body,
		nil,
		nil,
	)

	visualDiff := verificationPostgreSQLCandidate(t, body, "logical-visual-diff")
	visualDiff.Artifacts[0].Path = "visual/diff.png"
	visualDiff.Artifacts[0].Kind = ArtifactVisualDiff
	visualDiff.Artifacts[0].ExpectedMediaType = "image/png"
	visualDiff.Artifacts[0].SourceTraceDigest = ""
	visualDiff.CandidateDigest = mustDigestWithoutField(
		t,
		visualDiff,
		"candidateDigest",
	)
	_, visualDiffRecord := promoteVerificationGateCandidate(
		t,
		service,
		&visualDiff,
		body,
		nil,
		nil,
	)

	var physicalRows int
	if err := database.QueryRow(
		`SELECT COUNT(*) FROM verification_artifacts
WHERE workspace_id = $1 AND digest = $2`,
		screenshot.WorkspaceID,
		digestBytes(body),
	).Scan(&physicalRows); err != nil {
		t.Fatal(err)
	}
	if physicalRows != 1 {
		t.Fatalf(
			"same bytes produced %d physical artifact rows, want 1",
			physicalRows,
		)
	}

	for _, expected := range []struct {
		evidenceID        string
		artifactID        string
		path              string
		kind              ArtifactKind
		sourceTraceDigest string
	}{
		{
			evidenceID:        screenshotRecord.Evidence.ID,
			artifactID:        screenshot.Artifacts[0].ID,
			path:              "visual/screenshot.png",
			kind:              ArtifactScreenshot,
			sourceTraceDigest: screenshot.Artifacts[0].SourceTraceDigest,
		},
		{
			evidenceID: visualDiffRecord.Evidence.ID,
			artifactID: visualDiff.Artifacts[0].ID,
			path:       "visual/diff.png",
			kind:       ArtifactVisualDiff,
		},
	} {
		var path, kind, observedSourceTrace, mediaType string
		if err := database.QueryRow(
			`SELECT logical_path, kind, COALESCE(source_trace_digest, ''), media_type
FROM verification_evidence_artifacts
WHERE evidence_id = $1 AND artifact_id = $2`,
			expected.evidenceID,
			expected.artifactID,
		).Scan(&path, &kind, &observedSourceTrace, &mediaType); err != nil {
			t.Fatal(err)
		}
		if path != expected.path ||
			kind != string(expected.kind) ||
			observedSourceTrace != expected.sourceTraceDigest ||
			mediaType != "image/png" {
			t.Fatalf(
				"logical artifact projection = path %q kind %q sourceTrace %q media %q",
				path,
				kind,
				observedSourceTrace,
				mediaType,
			)
		}
	}
	assertArtifactReadable(t, service, screenshotRecord, screenshot, body)
	assertArtifactReadable(t, service, visualDiffRecord, visualDiff, body)
}

func createUploadedArtifactPromotion(
	t *testing.T,
	service *Service,
	candidate *EvidenceCandidate,
	body []byte,
) CreatePromotionResult {
	t.Helper()
	ctx := context.Background()
	body = issueVerificationGateArtifactAttemptGrant(
		t,
		service,
		candidate,
		body,
	)
	promotion, err := service.CreatePromotion(
		ctx,
		"owner-vector",
		candidate.WorkspaceID,
		candidate.Promotion.IdempotencyKey,
		*candidate,
	)
	if err != nil {
		t.Fatalf("create artifact race promotion: %v", err)
	}
	if _, err := service.UploadArtifact(
		ctx,
		"owner-vector",
		candidate.WorkspaceID,
		promotion.PromotionID,
		candidate.Artifacts[0].ID,
		promotion.UploadCapability,
		candidate.Artifacts[0].ExpectedMediaType,
		bytes.NewReader(body),
	); err != nil {
		t.Fatalf("upload artifact race promotion: %v", err)
	}
	return promotion
}

func assertArtifactReadable(
	t *testing.T,
	service *Service,
	record EvidenceRecord,
	candidate EvidenceCandidate,
	expected []byte,
) {
	t.Helper()
	_, reader, err := service.ResolveArtifact(
		context.Background(),
		"owner-vector",
		candidate.WorkspaceID,
		record.Evidence.ID,
		candidate.Artifacts[0].ID,
	)
	if err != nil {
		t.Fatalf("resolve concurrently retained artifact: %v", err)
	}
	defer reader.Close()
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(body, expected) {
		t.Fatalf("retained artifact bytes = %q, want %q", body, expected)
	}
}

func runClosureSnapshotConsistencyGate(
	t *testing.T,
	database *sql.DB,
	reader *Service,
	writer *Service,
	clock *verificationGateClock,
) {
	t.Helper()
	ctx := context.Background()

	revocationCandidate := verificationPostgreSQLCandidate(t, nil, "snapshot-revocation")
	revocationCandidate.PlanDigest = repeatedDigest('4')
	revocationCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		revocationCandidate,
		"candidateDigest",
	)
	_, revocationRecord := promoteVerificationGateCandidate(
		t,
		reader,
		&revocationCandidate,
		nil,
		nil,
		nil,
	)
	revocationFilter := ListFilter{PlanDigest: revocationRecord.Evidence.PlanDigest}
	oldRevocationView, err := writer.ClosureView(
		ctx,
		"owner-vector",
		revocationCandidate.WorkspaceID,
		revocationFilter,
	)
	if err != nil {
		t.Fatalf("build old revocation Closure snapshot: %v", err)
	}
	assertClosureViewDigest(t, oldRevocationView)

	revocationSnapshot := startBlockedClosureSnapshot(
		t,
		reader,
		revocationCandidate.WorkspaceID,
		revocationFilter,
	)
	if _, _, err := writer.CreateRevocation(
		ctx,
		"owner-vector",
		revocationCandidate.WorkspaceID,
		RevocationInput{
			EvidenceID:  revocationRecord.Evidence.ID,
			ReasonCode:  "snapshot-revocation",
			Reason:      "exercise closure snapshot isolation",
			EffectiveAt: clock.Now(),
		},
		"mutation-revocation-snapshot-001",
		"unrevoked",
	); err != nil {
		revocationSnapshot.release()
		t.Fatalf("commit concurrent Closure revocation: %v", err)
	}
	revocationSnapshot.release()
	duringRevocation := revocationSnapshot.result(t)
	assertClosureViewDigest(t, duringRevocation)
	duringRecord := closureViewRecord(t, duringRevocation, revocationRecord.Evidence.ID)
	if duringRecord.TrustStatus == "revoked" ||
		len(duringRecord.RevocationRecordDigests) != 0 ||
		duringRevocation.RevocationRecordDigest != oldRevocationView.RevocationRecordDigest {
		t.Fatalf(
			"Closure mixed pre-revocation records with post-revocation aggregate: %#v",
			duringRevocation,
		)
	}
	newRevocationView, err := writer.ClosureView(
		ctx,
		"owner-vector",
		revocationCandidate.WorkspaceID,
		revocationFilter,
	)
	if err != nil {
		t.Fatalf("build new revocation Closure snapshot: %v", err)
	}
	assertClosureViewDigest(t, newRevocationView)
	newRevocationRecord := closureViewRecord(
		t,
		newRevocationView,
		revocationRecord.Evidence.ID,
	)
	if newRevocationRecord.TrustStatus != "revoked" ||
		len(newRevocationRecord.RevocationRecordDigests) != 1 ||
		newRevocationView.RevocationRecordDigest == oldRevocationView.RevocationRecordDigest {
		t.Fatalf("post-revocation Closure snapshot did not advance atomically: %#v", newRevocationView)
	}

	tombstoneCandidate := verificationPostgreSQLCandidate(t, nil, "snapshot-tombstone")
	tombstoneCandidate.PlanDigest = repeatedDigest('5')
	tombstoneCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		tombstoneCandidate,
		"candidateDigest",
	)
	_, tombstoneRecord := promoteVerificationGateCandidate(
		t,
		reader,
		&tombstoneCandidate,
		nil,
		nil,
		nil,
	)
	tombstoneFilter := ListFilter{PlanDigest: tombstoneRecord.Evidence.PlanDigest}
	oldTombstoneView, err := writer.ClosureView(
		ctx,
		"owner-vector",
		tombstoneCandidate.WorkspaceID,
		tombstoneFilter,
	)
	if err != nil {
		t.Fatalf("build old tombstone Closure snapshot: %v", err)
	}
	assertClosureViewDigest(t, oldTombstoneView)

	tombstoneSnapshot := startBlockedClosureSnapshot(
		t,
		reader,
		tombstoneCandidate.WorkspaceID,
		tombstoneFilter,
	)
	if _, err := writer.TombstoneEvidence(
		ctx,
		"owner-vector",
		tombstoneCandidate.WorkspaceID,
		tombstoneRecord.Evidence.ID,
		"snapshot-isolation",
		"mutation-tombstone-snapshot-001",
		"active",
	); err != nil {
		tombstoneSnapshot.release()
		t.Fatalf("commit concurrent Closure tombstone: %v", err)
	}
	tombstoneSnapshot.release()
	duringTombstone := tombstoneSnapshot.result(t)
	assertClosureViewDigest(t, duringTombstone)
	duringTombstoneRecord := closureViewRecord(
		t,
		duringTombstone,
		tombstoneRecord.Evidence.ID,
	)
	if duringTombstoneRecord.RetentionState != "active" ||
		duringTombstoneRecord.TombstoneDigest != "" ||
		duringTombstone.RevocationRecordDigest != oldTombstoneView.RevocationRecordDigest {
		t.Fatalf(
			"Closure mixed pre-tombstone records with post-tombstone state: %#v",
			duringTombstone,
		)
	}
	newTombstoneView, err := writer.ClosureView(
		ctx,
		"owner-vector",
		tombstoneCandidate.WorkspaceID,
		tombstoneFilter,
	)
	if err != nil {
		t.Fatalf("build new tombstone Closure snapshot: %v", err)
	}
	assertClosureViewDigest(t, newTombstoneView)
	newTombstoneRecord := closureViewRecord(
		t,
		newTombstoneView,
		tombstoneRecord.Evidence.ID,
	)
	if newTombstoneRecord.RetentionState != "tombstoned" ||
		newTombstoneRecord.TombstoneDigest == "" ||
		newTombstoneRecord.RecordDigest == duringTombstoneRecord.RecordDigest {
		t.Fatalf("post-tombstone Closure snapshot did not advance atomically: %#v", newTombstoneView)
	}

	var snapshotAuditRows int
	if err := database.QueryRow(`SELECT COUNT(*)
FROM verification_audit_events
WHERE evidence_id IN ($1, $2)
	AND kind IN ('trust.revoked', 'evidence.tombstoned')`,
		revocationRecord.Evidence.ID,
		tombstoneRecord.Evidence.ID,
	).Scan(&snapshotAuditRows); err != nil || snapshotAuditRows != 2 {
		t.Fatalf("snapshot mutation audit rows = %d, %v; want 2", snapshotAuditRows, err)
	}
}

type blockedClosureSnapshot struct {
	release func()
	result  func(*testing.T) ClosureView
}

func startBlockedClosureSnapshot(
	t *testing.T,
	service *Service,
	workspaceID string,
	filter ListFilter,
) blockedClosureSnapshot {
	t.Helper()
	entered := make(chan struct{})
	resume := make(chan struct{})
	var once sync.Once
	service.repository.closureSnapshotBarrier = func() {
		once.Do(func() { close(entered) })
		<-resume
	}
	type closureResult struct {
		view ClosureView
		err  error
	}
	result := make(chan closureResult, 1)
	go func() {
		view, err := service.ClosureView(
			context.Background(),
			"owner-vector",
			workspaceID,
			filter,
		)
		result <- closureResult{view: view, err: err}
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		close(resume)
		t.Fatal("Closure snapshot did not reach the transaction barrier")
	}
	var releaseOnce sync.Once
	return blockedClosureSnapshot{
		release: func() {
			releaseOnce.Do(func() { close(resume) })
		},
		result: func(t *testing.T) ClosureView {
			t.Helper()
			select {
			case outcome := <-result:
				service.repository.closureSnapshotBarrier = nil
				if outcome.err != nil {
					t.Fatalf("finish blocked Closure snapshot: %v", outcome.err)
				}
				return outcome.view
			case <-time.After(5 * time.Second):
				t.Fatal("Closure snapshot did not finish after releasing the barrier")
				return ClosureView{}
			}
		},
	}
}

func closureViewRecord(
	t *testing.T,
	view ClosureView,
	evidenceID string,
) VerifiedViewRecord {
	t.Helper()
	for _, record := range view.Records {
		if record.EvidenceID == evidenceID {
			return record
		}
	}
	t.Fatalf("Closure view omitted Evidence %q: %#v", evidenceID, view)
	return VerifiedViewRecord{}
}

func assertClosureViewDigest(t *testing.T, view ClosureView) {
	t.Helper()
	expected, _, err := digestWithoutField(view, "viewDigest")
	if err != nil {
		t.Fatal(err)
	}
	if view.ViewDigest != expected {
		t.Fatalf("Closure view digest = %q, want %q", view.ViewDigest, expected)
	}
	for _, record := range view.Records {
		expectedRecord, _, err := digestWithoutField(record, "recordDigest")
		if err != nil {
			t.Fatal(err)
		}
		if record.RecordDigest != expectedRecord {
			t.Fatalf(
				"Closure record %q digest = %q, want %q",
				record.EvidenceID,
				record.RecordDigest,
				expectedRecord,
			)
		}
	}
}

func runWorkspaceAuthorityTOCTOUGate(t *testing.T) {
	t.Helper()
	for _, testCase := range []struct {
		name      string
		operation string
		attested  bool
	}{
		{name: "create", operation: authorityLockCreate},
		{name: "attestation prepare", operation: authorityLockPrepare, attested: true},
		{name: "evidence commit", operation: authorityLockCommit},
	} {
		testCase := testCase
		t.Run("workspace authority drift/"+testCase.name, func(t *testing.T) {
			databaseA, databaseB := openVerificationPostgreSQL(t)
			seedVerificationPostgreSQLWorkspace(t, databaseA)
			store, err := NewFilesystemArtifactStore(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			clock := &verificationGateClock{value: mustVectorTime(t, vectorNowText)}
			service := newVerificationGateService(t, databaseA, store, clock, nil)
			candidate := verificationPostgreSQLCandidate(
				t,
				nil,
				"authority-"+strings.ReplaceAll(testCase.name, " ", "-"),
			)
			if testCase.attested {
				candidate.Provenance.Origin = "ci"
				candidate.Provenance.CI = verificationVectorCIIdentity()
				candidate.CandidateDigest = mustDigestWithoutField(
					t,
					candidate,
					"candidateDigest",
				)
			}
			issueVerificationGateAttemptGrant(t, service, &candidate)

			var promotion CreatePromotionResult
			if testCase.operation != authorityLockCreate {
				promotion, err = service.CreatePromotion(
					context.Background(),
					"owner-vector",
					candidate.WorkspaceID,
					candidate.Promotion.IdempotencyKey,
					candidate,
				)
				if err != nil {
					t.Fatalf("stage authority-race promotion: %v", err)
				}
			}
			beforePromotions := verificationTableCount(
				t,
				databaseA,
				"verification_promotions",
			)
			beforeClaims := verificationTableCount(
				t,
				databaseA,
				"verification_attempt_grant_claims",
			)
			beforeEvidence := verificationTableCount(
				t,
				databaseA,
				"verification_evidence",
			)

			reached := make(chan struct{})
			release := make(chan struct{})
			var barrierOnce sync.Once
			service.repository.workspaceAuthorityLockBarrier = func(
				operation string,
				promotionID string,
			) {
				if operation != testCase.operation {
					return
				}
				barrierOnce.Do(func() {
					close(reached)
					<-release
				})
			}
			result := make(chan error, 1)
			go func() {
				if testCase.operation == authorityLockCreate {
					_, err := service.CreatePromotion(
						context.Background(),
						"owner-vector",
						candidate.WorkspaceID,
						candidate.Promotion.IdempotencyKey,
						candidate,
					)
					result <- err
					return
				}
				_, err := service.FinalizePromotion(
					context.Background(),
					"owner-vector",
					candidate.WorkspaceID,
					promotion.PromotionID,
					promotion.UploadCapability,
					nil,
				)
				result <- err
			}()
			select {
			case <-reached:
			case <-time.After(5 * time.Second):
				close(release)
				t.Fatal("workspace authority transition did not reach its transaction barrier")
			}
			if _, err := databaseB.Exec(`UPDATE workspaces
SET workspace_rev = workspace_rev + 1,
	op_seq = op_seq + 1,
	updated_at = $2
WHERE id = $1`, candidate.WorkspaceID, clock.Now()); err != nil {
				close(release)
				t.Fatalf("advance canonical Workspace authority: %v", err)
			}
			close(release)
			var transitionErr error
			select {
			case transitionErr = <-result:
			case <-time.After(5 * time.Second):
				t.Fatal("workspace authority transition did not finish after barrier release")
			}
			if !errors.Is(transitionErr, ErrConflict) ||
				diagnosticCode(transitionErr, "") != "VER-5001" {
				t.Fatalf(
					"authority drift transition = %v, want VER-5001 conflict",
					transitionErr,
				)
			}
			if got := verificationTableCount(
				t,
				databaseA,
				"verification_evidence",
			); got != beforeEvidence {
				t.Fatalf("authority drift persisted %d Evidence rows, had %d", got, beforeEvidence)
			}
			if got := verificationTableCount(
				t,
				databaseA,
				"verification_attempt_grant_claims",
			); got != beforeClaims {
				t.Fatalf("authority drift changed claim count to %d, had %d", got, beforeClaims)
			}
			if got := verificationTableCount(
				t,
				databaseA,
				"verification_promotions",
			); got != beforePromotions {
				t.Fatalf("authority drift changed promotion count to %d, had %d", got, beforePromotions)
			}
			if testCase.operation != authorityLockCreate {
				var state string
				if err := databaseA.QueryRow(
					`SELECT state FROM verification_promotions WHERE id = $1`,
					promotion.PromotionID,
				).Scan(&state); err != nil {
					t.Fatal(err)
				}
				if state != "staging" {
					t.Fatalf("authority drift left promotion state %q, want staging", state)
				}
			}
		})
	}
}

func runPromotionRecoveryGate(t *testing.T) {
	t.Helper()
	t.Run("lost response and restart recovery", func(t *testing.T) {
		databaseA, databaseB := openVerificationPostgreSQL(t)
		seedVerificationPostgreSQLWorkspace(t, databaseA)
		store, err := NewFilesystemArtifactStore(t.TempDir())
		if err != nil {
			t.Fatal(err)
		}
		clock := &verificationGateClock{value: mustVectorTime(t, vectorNowText)}
		serviceA := newVerificationGateService(t, databaseA, store, clock, nil)
		serviceB := newVerificationGateService(t, databaseB, store, clock, nil)
		ctx := context.Background()

		deadlineCandidate := verificationPostgreSQLCandidate(
			t,
			nil,
			"lost-response-deadline",
		)
		issueVerificationGateAttemptGrant(t, serviceA, &deadlineCandidate)
		deadlinePromotion, err := serviceA.CreatePromotion(
			ctx,
			"owner-vector",
			deadlineCandidate.WorkspaceID,
			deadlineCandidate.Promotion.IdempotencyKey,
			deadlineCandidate,
		)
		if err != nil {
			t.Fatalf("stage deadline recovery promotion: %v", err)
		}
		deadline, err := parseInstant(deadlineCandidate.Promotion.Deadline)
		if err != nil {
			t.Fatal(err)
		}
		freshExpiredCandidate := verificationPostgreSQLCandidate(
			t,
			nil,
			"lost-response-fresh-expired",
		)
		issueVerificationGateAttemptGrant(t, serviceA, &freshExpiredCandidate)
		clock.Set(deadline.Add(time.Second))
		deadlineReplay, err := serviceB.CreatePromotion(
			ctx,
			"owner-vector",
			deadlineCandidate.WorkspaceID,
			deadlineCandidate.Promotion.IdempotencyKey,
			deadlineCandidate,
		)
		if err != nil || deadlineReplay != deadlinePromotion {
			t.Fatalf(
				"deadline-drift exact replay = %#v, %v; want %#v",
				deadlineReplay,
				err,
				deadlinePromotion,
			)
		}
		if _, err := serviceB.CreatePromotion(
			ctx,
			"owner-vector",
			freshExpiredCandidate.WorkspaceID,
			freshExpiredCandidate.Promotion.IdempotencyKey,
			freshExpiredCandidate,
		); err == nil {
			t.Fatal("fresh promotion was accepted after its Candidate deadline")
		}

		clock.Set(mustVectorTime(t, vectorNowText))
		workspaceCandidate := verificationPostgreSQLCandidate(
			t,
			nil,
			"lost-response-workspace",
		)
		issueVerificationGateAttemptGrant(t, serviceA, &workspaceCandidate)
		workspacePromotion, err := serviceA.CreatePromotion(
			ctx,
			"owner-vector",
			workspaceCandidate.WorkspaceID,
			workspaceCandidate.Promotion.IdempotencyKey,
			workspaceCandidate,
		)
		if err != nil {
			t.Fatalf("stage Workspace-drift recovery promotion: %v", err)
		}
		if _, err := databaseA.Exec(`UPDATE workspaces
SET workspace_rev = 2, op_seq = 2, updated_at = $2
WHERE id = $1`, workspaceCandidate.WorkspaceID, clock.Now()); err != nil {
			t.Fatal(err)
		}
		workspaceReplay, err := serviceB.CreatePromotion(
			ctx,
			"owner-vector",
			workspaceCandidate.WorkspaceID,
			workspaceCandidate.Promotion.IdempotencyKey,
			workspaceCandidate,
		)
		if err != nil || workspaceReplay != workspacePromotion {
			t.Fatalf(
				"Workspace-drift exact replay = %#v, %v; want %#v",
				workspaceReplay,
				err,
				workspacePromotion,
			)
		}
		if _, err := serviceB.FinalizePromotion(
			ctx,
			"owner-vector",
			workspaceCandidate.WorkspaceID,
			workspacePromotion.PromotionID,
			workspacePromotion.UploadCapability,
			nil,
		); diagnosticCode(err, "") != "VER-5001" {
			t.Fatalf("Workspace-drift finalize = %v, want VER-5001", err)
		}
		if _, err := databaseA.Exec(`UPDATE workspaces
SET workspace_rev = 1, op_seq = 1, updated_at = $2
WHERE id = $1`, workspaceCandidate.WorkspaceID, clock.Now()); err != nil {
			t.Fatal(err)
		}

		policyCandidate := verificationPostgreSQLCandidate(
			t,
			nil,
			"lost-response-policy",
		)
		issueVerificationGateAttemptGrant(t, serviceA, &policyCandidate)
		policyPromotion, err := serviceA.CreatePromotion(
			ctx,
			"owner-vector",
			policyCandidate.WorkspaceID,
			policyCandidate.Promotion.IdempotencyKey,
			policyCandidate,
		)
		if err != nil {
			t.Fatalf("stage policy-drift recovery promotion: %v", err)
		}
		if _, err := databaseA.Exec(`UPDATE workspace_documents
SET content_rev = content_rev + 1, updated_at = $2
WHERE workspace_id = $1 AND id = 'policy.default'`,
			policyCandidate.WorkspaceID,
			clock.Now(),
		); err != nil {
			t.Fatal(err)
		}
		policyReplay, err := serviceB.CreatePromotion(
			ctx,
			"owner-vector",
			policyCandidate.WorkspaceID,
			policyCandidate.Promotion.IdempotencyKey,
			policyCandidate,
		)
		if err != nil || policyReplay != policyPromotion {
			t.Fatalf(
				"policy-drift exact replay = %#v, %v; want %#v",
				policyReplay,
				err,
				policyPromotion,
			)
		}
		if _, err := serviceB.FinalizePromotion(
			ctx,
			"owner-vector",
			policyCandidate.WorkspaceID,
			policyPromotion.PromotionID,
			policyPromotion.UploadCapability,
			nil,
		); diagnosticCode(err, "") != "VER-5001" {
			t.Fatalf("policy-drift finalize = %v, want VER-5001", err)
		}
		if got := verificationTableCount(
			t,
			databaseA,
			"verification_evidence",
		); got != 0 {
			t.Fatalf("recovery drift cases persisted %d Evidence rows", got)
		}
		if got := verificationTableCount(
			t,
			databaseA,
			"verification_promotions",
		); got != 3 {
			t.Fatalf("recovery drift promotion count = %d, want 3", got)
		}
		if got := verificationTableCount(
			t,
			databaseA,
			"verification_attempt_grant_claims",
		); got != 3 {
			t.Fatalf("recovery drift claim count = %d, want 3", got)
		}
	})
}

func runMaximumClosureEvidenceGate(t *testing.T) {
	t.Helper()
	t.Run("maximum closure Evidence last slot", func(t *testing.T) {
		databaseA, databaseB := openVerificationPostgreSQL(t)
		seedVerificationPostgreSQLWorkspace(t, databaseA)
		store, err := NewFilesystemArtifactStore(t.TempDir())
		if err != nil {
			t.Fatal(err)
		}
		clock := &verificationGateClock{value: mustVectorTime(t, vectorNowText)}
		serviceA := newVerificationGateService(t, databaseA, store, clock, nil)
		serviceB := newVerificationGateService(t, databaseB, store, clock, nil)

		var boundedPolicy map[string]any
		if err := json.Unmarshal(verificationPolicyWireFixture(), &boundedPolicy); err != nil {
			t.Fatal(err)
		}
		budgets, ok := boundedPolicy["budgets"].(map[string]any)
		if !ok {
			t.Fatal("VerificationPolicy fixture omitted budgets")
		}
		budgets["maximumClosureEvidenceRecords"] = 1
		boundedPolicyBytes, err := canonicalBytes(boundedPolicy)
		if err != nil {
			t.Fatal(err)
		}
		normalizedPolicy, _, err := normalizePersistedVerificationPolicy(
			boundedPolicyBytes,
		)
		if err != nil {
			t.Fatalf("normalize bounded closure policy: %v", err)
		}
		policyDigest, _, err := canonicalDigest(normalizedPolicy)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := databaseA.Exec(`UPDATE workspace_documents
SET content_rev = 2, content_json = $2::jsonb, updated_at = $3
WHERE workspace_id = $1 AND id = 'policy.default'`,
			"workspace-vector",
			string(boundedPolicyBytes),
			clock.Now(),
		); err != nil {
			t.Fatalf("install bounded closure policy: %v", err)
		}
		configureCandidate := func(candidate *EvidenceCandidate) {
			candidate.PartitionRevisions.DocumentRevisions["policy.default"] =
				DocumentRevision{ContentRev: 2, MetaRev: 1}
			candidate.PolicyRevision = 2
			candidate.PolicyDigest = policyDigest
			candidate.Redaction.TargetPolicy.PolicyDigest = policyDigest
			candidate.CandidateDigest = mustDigestWithoutField(
				t,
				*candidate,
				"candidateDigest",
			)
		}
		first := verificationPostgreSQLCandidate(t, nil, "closure-last-slot-a")
		second := verificationPostgreSQLCandidate(t, nil, "closure-last-slot-b")
		configureCandidate(&first)
		configureCandidate(&second)
		issueVerificationGateAttemptGrant(t, serviceA, &first)
		issueVerificationGateAttemptGrant(t, serviceB, &second)
		firstPromotion, err := serviceA.CreatePromotion(
			context.Background(),
			"owner-vector",
			first.WorkspaceID,
			first.Promotion.IdempotencyKey,
			first,
		)
		if err != nil {
			t.Fatalf("stage first closure candidate: %v", err)
		}
		secondPromotion, err := serviceB.CreatePromotion(
			context.Background(),
			"owner-vector",
			second.WorkspaceID,
			second.Promotion.IdempotencyKey,
			second,
		)
		if err != nil {
			t.Fatalf("stage second closure candidate: %v", err)
		}
		if first.PlanDigest != second.PlanDigest {
			t.Fatalf(
				"last-slot candidates resolved different Plans: %q vs %q",
				first.PlanDigest,
				second.PlanDigest,
			)
		}

		start := make(chan struct{})
		results := make(chan error, 2)
		for _, attempt := range []struct {
			service   *Service
			candidate EvidenceCandidate
			promotion CreatePromotionResult
		}{
			{service: serviceA, candidate: first, promotion: firstPromotion},
			{service: serviceB, candidate: second, promotion: secondPromotion},
		} {
			attempt := attempt
			go func() {
				<-start
				_, err := attempt.service.FinalizePromotion(
					context.Background(),
					"owner-vector",
					attempt.candidate.WorkspaceID,
					attempt.promotion.PromotionID,
					attempt.promotion.UploadCapability,
					nil,
				)
				results <- err
			}()
		}
		close(start)
		successes := 0
		conflicts := 0
		for index := 0; index < 2; index++ {
			err := <-results
			switch {
			case err == nil:
				successes++
			case errors.Is(err, ErrConflict) &&
				diagnosticCode(err, "") == "VER-5001":
				conflicts++
			default:
				t.Fatalf("last-slot finalize returned unexpected error: %v", err)
			}
		}
		if successes != 1 || conflicts != 1 {
			t.Fatalf(
				"last-slot outcomes = successes %d conflicts %d, want 1/1",
				successes,
				conflicts,
			)
		}
		if got := verificationTableCount(
			t,
			databaseA,
			"verification_evidence",
		); got != 1 {
			t.Fatalf("last-slot race persisted %d Evidence rows, want 1", got)
		}
		if got := verificationTableCount(
			t,
			databaseA,
			"verification_promotions",
		); got != 2 {
			t.Fatalf("last-slot race promotion count = %d, want 2", got)
		}
		if got := verificationTableCount(
			t,
			databaseA,
			"verification_attempt_grant_claims",
		); got != 2 {
			t.Fatalf("last-slot race claim count = %d, want 2", got)
		}
		var committed, staging int
		if err := databaseA.QueryRow(`SELECT
COUNT(*) FILTER (WHERE state = 'committed'),
COUNT(*) FILTER (WHERE state = 'staging')
FROM verification_promotions`).Scan(&committed, &staging); err != nil {
			t.Fatal(err)
		}
		if committed != 1 || staging != 1 {
			t.Fatalf(
				"last-slot promotion states = committed %d staging %d, want 1/1",
				committed,
				staging,
			)
		}
	})
}

func verificationTableCount(
	t *testing.T,
	database *sql.DB,
	table string,
) int {
	t.Helper()
	allowed := map[string]struct{}{
		"verification_attempt_grant_claims": {},
		"verification_evidence":             {},
		"verification_promotions":           {},
	}
	if _, ok := allowed[table]; !ok {
		t.Fatalf("unsupported Verification count table %q", table)
	}
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func newVerificationGateService(
	t *testing.T,
	database *sql.DB,
	store ArtifactObjectStore,
	clock *verificationGateClock,
	verifier AttestationVerifier,
) *Service {
	t.Helper()
	validator := NewCandidateValidator(nil)
	validator.now = clock.Now
	config := ServiceConfig{
		PromotionTTL: 15 * time.Minute, SessionRetention: time.Hour,
		TombstoneGrace: 0, AttestationMaxLifetime: 10 * time.Minute,
		RetentionSweepInterval: time.Hour, RetentionSweepBatchSize: 100,
		ResumeKey: bytes.Repeat([]byte{0x73}, 32),
	}
	targetPolicies := NewPostgreSQLTargetPolicyAuthority(database)
	attemptGrants := newPostgreSQLAttemptGrantAuthority(database, targetPolicies)
	attemptGrants.now = clock.Now
	service, err := NewService(
		NewRepository(database), store, allowVerificationPermissions{},
		targetPolicies,
		attemptGrants,
		validator, verifier, config,
	)
	if err != nil {
		t.Fatal(err)
	}
	service.now = clock.Now
	return service
}

func issueVerificationGateAttemptGrant(
	t *testing.T,
	service *Service,
	candidate *EvidenceCandidate,
) AttemptGrantRecord {
	t.Helper()
	authority, ok := service.attemptGrants.(*PostgreSQLAttemptGrantAuthority)
	if !ok {
		t.Fatal("Verification Gate service does not expose its PostgreSQL attempt authority")
	}
	trust, err := trustForOrigin(candidate.Provenance.Origin)
	if err != nil {
		t.Fatal(err)
	}
	targetPolicy, err := service.targetPolicies.ResolvePromotionPolicy(
		context.Background(),
		candidate.WorkspaceID,
		*candidate,
	)
	if err != nil {
		t.Fatalf("resolve target policy before trusted AttemptGrant issuance: %v", err)
	}
	retention, ok := authoritativeRetentionForOutcome(
		targetPolicy.RetentionRequest,
		candidate.Result.Outcome,
	)
	if !ok {
		t.Fatalf(
			"target policy has no retention mapping for outcome %q",
			candidate.Result.Outcome,
		)
	}
	candidate.RequestedRetention = retention
	plan := verificationPlanForCandidate(
		t,
		candidate,
		trust,
		targetPolicy.RetentionRequest,
	)
	startedAt, err := parseInstant(candidate.Timing.StartedAt)
	if err != nil {
		t.Fatal(err)
	}
	expiresAt, err := parseInstant(candidate.Promotion.Deadline)
	if err != nil {
		t.Fatal(err)
	}
	runtimeNow := authority.now
	authority.now = func() time.Time {
		return canonicalTime(startedAt.Add(-time.Second))
	}
	record, err := authority.IssueTrustedAttemptGrant(
		context.Background(),
		TrustedAttemptGrantIssue{
			WorkspaceID:  candidate.WorkspaceID,
			ProjectID:    candidate.ProjectID,
			Plan:         plan,
			CellID:       candidate.CellID,
			AttemptID:    candidate.AttemptID,
			Run:          candidate.Run,
			ProducerID:   candidate.Provenance.ProducerID,
			TrustCeiling: trust,
			IssuedBy:     "trusted-test-scheduler",
			ExpiresAt:    expiresAt,
		},
	)
	authority.now = runtimeNow
	if err != nil {
		t.Fatalf("issue trusted AttemptGrant for %s: %v", candidate.CandidateID, err)
	}
	return record
}

func issueVerificationGateArtifactAttemptGrant(
	t *testing.T,
	service *Service,
	candidate *EvidenceCandidate,
	body []byte,
) []byte {
	t.Helper()
	issueVerificationGateAttemptGrant(t, service, candidate)
	if len(candidate.Artifacts) != 1 {
		t.Fatalf(
			"artifact AttemptGrant fixture has %d artifacts, want 1",
			len(candidate.Artifacts),
		)
	}
	artifact := &candidate.Artifacts[0]
	if !isArtifactJSONMediaType(artifact.ExpectedMediaType) {
		return body
	}
	var envelope map[string]any
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("decode artifact fixture before source-trace binding: %v", err)
	}
	if _, exists := envelope["sourceTraceDigest"]; !exists {
		return body
	}
	envelope["sourceTraceDigest"] = artifact.SourceTraceDigest
	rebound, err := canonicalBytes(envelope)
	if err != nil {
		t.Fatalf("re-encode artifact fixture after source-trace binding: %v", err)
	}
	if len(rebound) != len(body) {
		t.Fatalf(
			"source-trace binding changed the planned artifact byte budget from %d to %d",
			len(body),
			len(rebound),
		)
	}
	copy(body, rebound)
	artifact.ExpectedDigest = digestBytes(rebound)
	artifact.ExpectedSize = int64(len(rebound))
	candidate.CandidateDigest = mustDigestWithoutField(
		t,
		*candidate,
		"candidateDigest",
	)
	return rebound
}

func assertTargetPolicyAuthorityGate(
	t *testing.T,
	database *sql.DB,
	service *Service,
) {
	t.Helper()
	ctx := context.Background()
	valid := verificationPostgreSQLCandidate(t, nil, "policy-authority-valid")
	resolution, err := service.targetPolicies.ResolvePromotionPolicy(
		ctx,
		valid.WorkspaceID,
		valid,
	)
	if err != nil {
		t.Fatalf("resolve authoritative VerificationPolicy: %v", err)
	}
	if resolution.PolicyID != "policy.default" ||
		resolution.PolicyRevision != 1 ||
		resolution.PolicyDigest != verificationPolicyCurrentDigest ||
		resolution.TargetPolicy.Capture != "allowed" ||
		resolution.MaximumClosureEvidenceRecords != 1000 ||
		resolution.Comparison.Authority != "verification-policy" ||
		len(resolution.Comparison.AllowedMismatchFields) != 2 ||
		resolution.Comparison.AllowedMismatchFields[0] != "browser-engine" ||
		resolution.Comparison.AllowedMismatchFields[1] != "operating-system" {
		t.Fatalf("unexpected authoritative VerificationPolicy projection: %+v", resolution)
	}
	comparison, err := service.targetPolicies.ResolveComparisonPolicy(
		ctx,
		valid.WorkspaceID,
	)
	if err != nil {
		t.Fatalf("resolve authoritative comparison policy: %v", err)
	}
	if comparison.Authority != resolution.Comparison.Authority ||
		comparison.PolicyID != resolution.Comparison.PolicyID ||
		comparison.PolicyDigest != resolution.Comparison.PolicyDigest ||
		len(comparison.AllowedMismatchFields) != 2 {
		t.Fatalf("comparison projection drifted from promotion authority: %+v", comparison)
	}

	cases := []struct {
		name   string
		mutate func(*EvidenceCandidate)
	}{
		{
			name: "policy digest drift",
			mutate: func(candidate *EvidenceCandidate) {
				candidate.PolicyDigest = repeatedDigest('0')
				candidate.Redaction.TargetPolicy.PolicyDigest = candidate.PolicyDigest
			},
		},
		{
			name: "route revision drift",
			mutate: func(candidate *EvidenceCandidate) {
				candidate.PartitionRevisions.RouteRev++
			},
		},
		{
			name: "self reported capture bypass",
			mutate: func(candidate *EvidenceCandidate) {
				candidate.Redaction.TargetPolicy.Capture = "masked"
			},
		},
		{
			name: "policy document revision omitted",
			mutate: func(candidate *EvidenceCandidate) {
				candidate.PartitionRevisions.DocumentRevisions = map[string]DocumentRevision{}
			},
		},
	}
	for index, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			candidate := verificationPostgreSQLCandidate(
				t,
				nil,
				fmt.Sprintf("policy-reject-%d", index),
			)
			testCase.mutate(&candidate)
			candidate.CandidateDigest = mustDigestWithoutField(t, candidate, "candidateDigest")
			_, err := service.targetPolicies.ResolvePromotionPolicy(
				ctx,
				candidate.WorkspaceID,
				candidate,
			)
			if err == nil || diagnosticCode(err, "") != "VER-5001" {
				t.Fatalf("authority mismatch was not rejected with VER-5001: %v", err)
			}
		})
	}
	var promotionCount int
	if err := database.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM verification_promotions`,
	).Scan(&promotionCount); err != nil {
		t.Fatal(err)
	}
	if promotionCount != 0 {
		t.Fatalf("authority rejection persisted %d promotion rows", promotionCount)
	}
}

func promoteVerificationGateCandidate(
	t *testing.T,
	service *Service,
	candidate *EvidenceCandidate,
	artifactBody []byte,
	privateKey ed25519.PrivateKey,
	verifier AttestationVerifier,
) (CreatePromotionResult, EvidenceRecord) {
	t.Helper()
	ctx := context.Background()
	if artifactBody != nil {
		artifactBody = issueVerificationGateArtifactAttemptGrant(
			t,
			service,
			candidate,
			artifactBody,
		)
	} else {
		issueVerificationGateAttemptGrant(t, service, candidate)
	}
	promotion, err := service.CreatePromotion(
		ctx, "owner-vector", candidate.WorkspaceID,
		candidate.Promotion.IdempotencyKey, *candidate,
	)
	if err != nil {
		t.Fatalf("create promotion %s: %v", candidate.CandidateID, err)
	}
	if artifactBody != nil {
		if _, err := service.UploadArtifact(
			ctx, "owner-vector", candidate.WorkspaceID, promotion.PromotionID,
			candidate.Artifacts[0].ID, promotion.UploadCapability,
			candidate.Artifacts[0].ExpectedMediaType, bytes.NewReader(artifactBody),
		); err != nil {
			t.Fatalf("upload promotion %s: %v", candidate.CandidateID, err)
		}
	}
	var presentation *AttestationPresentation
	if verifier != nil &&
		(candidate.Provenance.Origin == "remote" || candidate.Provenance.Origin == "ci") {
		promotion = prepareVerificationGateAttestationChallenge(
			t,
			service,
			*candidate,
			promotion,
		)
		signed := signVerificationGateAttestation(t, *candidate, promotion, privateKey)
		presentation = &signed
	}
	record, err := service.FinalizePromotion(
		ctx, "owner-vector", candidate.WorkspaceID, promotion.PromotionID,
		promotion.UploadCapability, presentation,
	)
	if err != nil {
		t.Fatalf("finalize promotion %s: %v", candidate.CandidateID, err)
	}
	return promotion, record
}

func prepareVerificationGateAttestationChallenge(
	t *testing.T,
	service *Service,
	candidate EvidenceCandidate,
	promotion CreatePromotionResult,
) CreatePromotionResult {
	t.Helper()
	_, err := service.FinalizePromotion(
		context.Background(),
		"owner-vector",
		candidate.WorkspaceID,
		promotion.PromotionID,
		promotion.UploadCapability,
		nil,
	)
	var challenge *AttestationChallengeError
	if !errors.As(err, &challenge) {
		t.Fatalf("prepare attestation challenge %s: %v", candidate.CandidateID, err)
	}
	prepared := challenge.Promotion
	prepared.UploadCapability = promotion.UploadCapability
	if prepared.State != "verification-pending" ||
		prepared.AttestationNonce == "" ||
		prepared.AttestationStatement == nil ||
		prepared.AttestationStatementDigest == "" {
		t.Fatalf("incomplete attestation challenge: %#v", prepared)
	}
	return prepared
}

func signVerificationGateAttestation(
	t *testing.T,
	candidate EvidenceCandidate,
	promotion CreatePromotionResult,
	privateKey ed25519.PrivateKey,
) AttestationPresentation {
	t.Helper()
	if promotion.AttestationStatement == nil {
		t.Fatal("attested promotion omitted statement")
	}
	statement := promotion.AttestationStatement
	artifactSetDigest, err := evidenceArtifactSetDigest(promotion.AttestationStatement.Artifacts)
	if err != nil {
		t.Fatal(err)
	}
	presentation := AttestationPresentation{
		Format: attestationClaimsFormat, Version: 1, Trust: TrustCIAttested,
		Issuer: "https://issuer.example", Audience: "prodivix-verification",
		Subject: "repo:prodivix/main", Nonce: promotion.AttestationNonce,
		IssuedAt: vectorNowText, NotBefore: vectorNowText,
		ExpiresAt: "2026-07-28T00:07:02.000Z", PolicyGeneration: 11,
		StatementDigest:    promotion.AttestationStatementDigest,
		CandidateDigest:    statement.CandidateDigest,
		EvidenceCoreDigest: statement.EvidenceCoreDigest,
		ArtifactSetDigest:  artifactSetDigest, ProjectID: statement.ProjectID,
		WorkspaceID: statement.WorkspaceID, WorkspaceRevision: statement.WorkspaceRevision,
		ExecutableSnapshotDigest: statement.ExecutableSnapshotDigest,
		PlanDigest:               statement.PlanDigest, CellID: statement.CellID,
		CheckID: statement.CheckID, CheckKind: statement.CheckKind,
		TargetID:            statement.TargetID,
		TargetPolicyDigest:  statement.TargetPolicyDigest,
		AttemptID:           statement.AttemptID,
		ProducerDigest:      mustCanonicalDigest(t, statement.Producer),
		ExecutionDigest:     mustCanonicalDigest(t, statement.Execution),
		ToolchainDigest:     statement.ToolchainDigest,
		NormalizationDigest: statement.NormalizationDigest,
		CI:                  cloneCIIdentity(statement.Producer.CI),
		Algorithm:           "Ed25519", KeyID: "ci-gate-key",
	}
	signAttestationPresentation(t, privateKey, &presentation)
	return presentation
}

func assertVerificationRowCount(t *testing.T, database *sql.DB, table string, expected int) {
	t.Helper()
	if table != "verification_evidence" && table != "verification_artifacts" {
		t.Fatalf("unsupported row-count table %q", table)
	}
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf("%s row count = %d, want %d", table, count, expected)
	}
}

func assertVerificationAttemptEvidenceCount(
	t *testing.T,
	database *sql.DB,
	workspaceID string,
	attemptID string,
	expected int,
) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*)
FROM verification_evidence
WHERE workspace_id = $1 AND attempt_id = $2`, workspaceID, attemptID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf(
			"Evidence count for attempt %q = %d, want %d",
			attemptID,
			count,
			expected,
		)
	}
}

func assertVerificationArtifactDigestCount(
	t *testing.T,
	database *sql.DB,
	workspaceID string,
	digest string,
	expected int,
) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*)
FROM verification_artifacts
WHERE workspace_id = $1 AND digest = $2`, workspaceID, digest).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf(
			"durable artifact row count for %q = %d, want %d",
			digest,
			count,
			expected,
		)
	}
}

func assertVerificationPromotionState(
	t *testing.T,
	database *sql.DB,
	promotionID string,
	expectedState string,
	expectedFailureCode string,
) {
	t.Helper()
	var state, failureCode string
	if err := database.QueryRow(`SELECT state, COALESCE(failure_code, '')
FROM verification_promotions
WHERE id = $1`, promotionID).Scan(&state, &failureCode); err != nil {
		t.Fatal(err)
	}
	if state != expectedState || failureCode != expectedFailureCode {
		t.Fatalf(
			"promotion %q state = (%q, %q), want (%q, %q)",
			promotionID,
			state,
			failureCode,
			expectedState,
			expectedFailureCode,
		)
	}
}

func assertVerificationPromotionArtifactState(
	t *testing.T,
	database *sql.DB,
	promotionID string,
	artifactID string,
	expectedScanState string,
	expectLocator bool,
) {
	t.Helper()
	var scanState, locator string
	if err := database.QueryRow(`SELECT scan_state, COALESCE(staging_locator, '')
FROM verification_promotion_artifacts
WHERE promotion_id = $1 AND artifact_id = $2`, promotionID, artifactID).
		Scan(&scanState, &locator); err != nil {
		t.Fatal(err)
	}
	if scanState != expectedScanState || (locator != "") != expectLocator {
		t.Fatalf(
			"promotion artifact %q state = (%q, locator=%t), want (%q, locator=%t)",
			artifactID,
			scanState,
			locator != "",
			expectedScanState,
			expectLocator,
		)
	}
}

func assertVerificationAuditCount(
	t *testing.T,
	database *sql.DB,
	evidenceID string,
	kind string,
	expected int,
) {
	t.Helper()
	var count int
	if err := database.QueryRow(
		`SELECT COUNT(*)
		FROM verification_audit_events
		WHERE evidence_id = $1 AND kind = $2`,
		evidenceID, kind,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf("audit count for %s/%s = %d, want %d", evidenceID, kind, count, expected)
	}
}

func assertVerificationMutationCount(
	t *testing.T,
	database *sql.DB,
	operation string,
	expected int,
) {
	t.Helper()
	var count int
	if err := database.QueryRow(
		`SELECT COUNT(*)
		FROM verification_mutation_requests
		WHERE operation = $1`,
		operation,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf("mutation ledger count for %s = %d, want %d", operation, count, expected)
	}
}

func openVerificationPostgreSQL(t *testing.T) (*sql.DB, *sql.DB) {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv(verificationPostgreSQLTestURL))
	if databaseURL == "" {
		t.Skipf("set %s to run the real PostgreSQL Verification Evidence Gate", verificationPostgreSQLTestURL)
	}
	adminConfig, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse PostgreSQL integration URL: %v", err)
	}
	admin := stdlib.OpenDB(*adminConfig)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		_ = admin.Close()
		t.Fatalf("connect to PostgreSQL integration database: %v", err)
	}
	var suffix [8]byte
	if _, err := cryptorand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "prodivix_verification_" + hex.EncodeToString(suffix[:])
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		t.Fatalf("create PostgreSQL integration schema: %v", err)
	}
	openPool := func() *sql.DB {
		config := adminConfig.Copy()
		if config.RuntimeParams == nil {
			config.RuntimeParams = make(map[string]string)
		}
		config.RuntimeParams["search_path"] = schema
		database := stdlib.OpenDB(*config)
		database.SetMaxOpenConns(16)
		database.SetMaxIdleConns(16)
		if err := database.PingContext(ctx); err != nil {
			t.Fatalf("connect isolated PostgreSQL pool: %v", err)
		}
		return database
	}
	databaseA := openPool()
	if err := backenddatabase.RunMigrations(ctx, databaseA, 2*time.Minute); err != nil {
		t.Fatalf("migrate isolated PostgreSQL schema: %v", err)
	}
	databaseB := openPool()
	t.Cleanup(func() {
		_ = databaseA.Close()
		_ = databaseB.Close()
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()
		if _, err := admin.ExecContext(
			cleanupCtx, "DROP SCHEMA IF EXISTS "+quotedSchema+" CASCADE",
		); err != nil {
			t.Errorf("drop PostgreSQL Verification schema: %v", err)
		}
		_ = admin.Close()
	})
	return databaseA, databaseB
}

func seedVerificationPostgreSQLWorkspace(t *testing.T, database *sql.DB) {
	t.Helper()
	now := mustVectorTime(t, vectorNowText)
	tx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{
			`INSERT INTO users (id, email, name, password_hash, created_at)
			 VALUES ($1, $2, $3, $4, $5)`,
			[]any{"owner-vector", "owner-vector@example.test", "Verification Gate", []byte("integration-only"), now},
		},
		{
			`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at)
			 VALUES ($1, $2, 'project', $3, $4, $4)`,
			[]any{"project-vector", "owner-vector", "Verification Gate", now},
		},
		{
			`INSERT INTO workspaces (id, project_id, owner_id, name, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $5)`,
			[]any{"workspace-vector", "project-vector", "owner-vector", "Verification Gate", now},
		},
		{
			`INSERT INTO workspace_documents (
				workspace_id, id, doc_type, name, path, content_rev, meta_rev,
				content_json, capabilities_json, updated_at
			) VALUES (
				$1, $2, 'verification-policy', $3, $4, 1, 1, $5::jsonb, '[]'::jsonb, $6
			)`,
			[]any{
				"workspace-vector",
				"policy.default",
				"Default verification policy",
				"verification/policy.default.json",
				string(verificationPolicyWireFixture()),
				now,
			},
		},
	} {
		if _, err := tx.Exec(statement.query, statement.args...); err != nil {
			t.Fatalf("seed PostgreSQL Verification fixture: %v", err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
}
