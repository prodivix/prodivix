package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"
)

func TestRuntimeDriverAttemptGrantAuthorizationPostgreSQLGate(t *testing.T) {
	db, _ := openVerificationPostgreSQL(t)
	seedVerificationPostgreSQLWorkspace(t, db)
	candidate := verificationPostgreSQLCandidate(t, nil, "runtime-authorized-attempt")
	plan := verificationPlanForCandidate(t, &candidate, TrustLocalUnattested, AuthoritativeRetentionRequest{Successful: RetentionChange, Failed: RetentionRelease, ProtectReleaseEvidence: true})
	now := mustVectorTime(t, "2026-07-27T23:59:59.000Z")
	authority := NewPostgreSQLAttemptGrantAuthority(db)
	authority.now = func() time.Time { return now }
	input := TrustedAttemptGrantIssue{WorkspaceID: candidate.WorkspaceID, ProjectID: candidate.ProjectID, Plan: plan, CellID: candidate.CellID, AttemptID: candidate.AttemptID, Run: candidate.Run, ProducerID: candidate.Provenance.ProducerID, TrustCeiling: TrustLocalUnattested, IssuedBy: "agent.runtime", ExpiresAt: now.Add(10 * time.Minute)}
	deny := func(context.Context, *sql.Tx) error { return ErrUnauthorized }
	if _, err := authority.IssueTrustedAttemptGrantWithAuthorization(context.Background(), input, deny); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("denied issuance err=%v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM verification_attempt_grants`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("unauthorized grants=%d err=%v", count, err)
	}
	allow := func(context.Context, *sql.Tx) error { return nil }
	first, err := authority.IssueTrustedAttemptGrantWithAuthorization(context.Background(), input, allow)
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Second)
	replayed, err := authority.IssueTrustedAttemptGrantWithAuthorization(context.Background(), input, allow)
	if err != nil || first.ID != replayed.ID || !first.IssuedAt.Equal(replayed.IssuedAt) {
		t.Fatalf("time-independent exact grant replay id=%s err=%v", replayed.ID, err)
	}
	input.Run.ProviderID = "another-provider"
	if _, err := authority.IssueTrustedAttemptGrantWithAuthorization(context.Background(), input, allow); !errors.Is(err, ErrConflict) {
		t.Fatalf("conflicting attempt replay err=%v", err)
	}
}

func TestRuntimeDriverPromotionArtifactAndFinalizeAuthorizationPostgreSQLGate(t *testing.T) {
	db, _ := openVerificationPostgreSQL(t)
	seedVerificationPostgreSQLWorkspace(t, db)
	store, err := NewFilesystemArtifactStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	clock := &verificationGateClock{value: mustVectorTime(t, vectorNowText)}
	service := newVerificationGateService(t, db, store, clock, nil)
	body := verificationReplayArtifactBody(t, "RUNTIME_DRIVER")
	candidate := verificationPostgreSQLCandidate(t, body, "runtime-owner-boundary")
	body = issueVerificationGateArtifactAttemptGrant(t, service, &candidate, body)
	ctx := context.Background()
	deny := func(context.Context, *sql.Tx) error { return ErrUnauthorized }
	allow := func(context.Context, *sql.Tx) error { return nil }
	if _, err := service.CreatePromotionWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, candidate.Promotion.IdempotencyKey, candidate, deny); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("denied promotion err=%v", err)
	}
	if count := verificationTableCount(t, db, "verification_promotions"); count != 0 {
		t.Fatalf("denied promotion rows=%d", count)
	}
	created, err := service.CreatePromotionWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, candidate.Promotion.IdempotencyKey, candidate, allow)
	if err != nil {
		t.Fatal(err)
	}
	// Revoke authority after bytes have been validated but before the owner
	// records them. Both metadata and staging bytes must remain absent.
	calls := 0
	lateDeny := func(context.Context, *sql.Tx) error {
		calls++
		if calls >= 3 {
			return ErrUnauthorized
		}
		return nil
	}
	if _, err := service.UploadArtifactWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, created.PromotionID, candidate.Artifacts[0].ID, created.UploadCapability, "application/json", bytes.NewReader(body), lateDeny); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cancelled artifact recording err=%v calls=%d", err, calls)
	}
	row, err := service.repository.GetPromotionArtifact(ctx, created.PromotionID, candidate.Artifacts[0].ID)
	if err != nil || row.ScanState != "pending" || row.StagingLocator != "" {
		t.Fatalf("denied staged row=%#v err=%v", row, err)
	}
	staging, err := store.ListStaging(ctx, time.Now().Add(time.Hour), 100)
	if err != nil || len(staging) != 0 {
		t.Fatalf("denied staging bytes=%d err=%v", len(staging), err)
	}
	if _, err := service.UploadArtifactWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, created.PromotionID, candidate.Artifacts[0].ID, created.UploadCapability, "application/json", bytes.NewReader(body), allow); err != nil {
		t.Fatal(err)
	}
	accepted, err := service.repository.GetPromotionArtifact(ctx, created.PromotionID, candidate.Artifacts[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	calls = 0
	if _, err := service.UploadArtifactWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, created.PromotionID, candidate.Artifacts[0].ID, created.UploadCapability, "application/json", bytes.NewReader(body), lateDeny); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("late stale retry err=%v", err)
	}
	reader, err := store.OpenStaging(ctx, accepted.StagingLocator)
	if err != nil {
		t.Fatalf("stale retry deleted accepted bytes: %v", err)
	}
	_ = reader.Close()
	if _, err := service.UploadArtifactWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, created.PromotionID, candidate.Artifacts[0].ID, created.UploadCapability, "application/json", bytes.NewReader(body), allow); err != nil {
		t.Fatalf("exact artifact retry err=%v", err)
	}
	staging, err = store.ListStaging(ctx, time.Now().Add(time.Hour), 100)
	if err != nil || len(staging) != 1 {
		t.Fatalf("exact retry leaked staging bytes=%d err=%v", len(staging), err)
	}
	calls = 0
	revokedDuringValidation := func(context.Context, *sql.Tx) error {
		calls++
		if calls >= 2 {
			return ErrUnauthorized
		}
		return nil
	}
	if _, err := service.UploadArtifactWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, created.PromotionID, candidate.Artifacts[0].ID, created.UploadCapability, "application/json", bytes.NewReader(bytes.Repeat([]byte{0}, len(body))), revokedDuringValidation); !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("invalid stale upload err=%v", err)
	}
	stillActive, err := service.repository.GetPromotion(ctx, candidate.WorkspaceID, created.PromotionID)
	if err != nil || stillActive.State != "staging" {
		t.Fatalf("stale rejected bytes poisoned current promotion=%s err=%v", stillActive.State, err)
	}
	calls = 0
	commitDeny := func(context.Context, *sql.Tx) error {
		calls++
		if calls >= 7 {
			return ErrUnauthorized
		}
		return nil
	}
	if _, err := service.FinalizePromotionWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, created.PromotionID, created.UploadCapability, nil, commitDeny); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cancelled evidence commit err=%v calls=%d", err, calls)
	}
	if count := verificationTableCount(t, db, "verification_evidence"); count != 0 {
		t.Fatalf("denied evidence rows=%d", count)
	}
	if err := service.RetireVerificationRunPromotionsWithAuthorization(ctx, "owner-vector", candidate.WorkspaceID, candidate.Run.RunID, allow); err != nil {
		t.Fatal(err)
	}
	current, err := service.repository.GetPromotion(ctx, candidate.WorkspaceID, created.PromotionID)
	if err != nil || current.State != "failed" {
		t.Fatalf("retired promotion=%#v err=%v", current, err)
	}
	staging, err = store.ListStaging(ctx, time.Now().Add(time.Hour), 100)
	if err != nil || len(staging) != 0 {
		t.Fatalf("retired staging bytes=%d err=%v", len(staging), err)
	}
}
