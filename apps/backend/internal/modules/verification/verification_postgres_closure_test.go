package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

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
