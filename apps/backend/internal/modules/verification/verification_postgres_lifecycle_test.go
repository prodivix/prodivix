package verification

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"sync"
	"testing"
	"time"
)

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
