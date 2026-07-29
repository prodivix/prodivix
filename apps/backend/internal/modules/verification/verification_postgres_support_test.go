package verification

import (
	"bytes"
	"context"
	"crypto/ed25519"
	cryptorand "crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

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
