package verification

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

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
