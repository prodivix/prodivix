package database

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func expectMigrationSession(mock sqlmock.Sqlmock) {
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(regexp.QuoteMeta(`SELECT pg_advisory_lock($1)`)).
		WithArgs(migrationAdvisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 1))
}

func expectMigrationSessionRelease(mock sqlmock.Sqlmock) {
	mock.ExpectExec(regexp.QuoteMeta(`SELECT pg_advisory_unlock($1)`)).
		WithArgs(migrationAdvisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 1))
}

func expectPendingCheck(mock sqlmock.Sqlmock, version int64, applied bool) {
	mock.ExpectQuery("SELECT EXISTS").
		WithArgs(version).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(applied))
}

// A failing migration must not discard the migrations that already succeeded,
// otherwise every restart repeats the same work and fails at the same place.
func TestAFailingMigrationKeepsEarlierMigrationsCommitted(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	migrations := []migration{
		{version: 1, name: "first", statements: []string{`CREATE TABLE first ()`}},
		{version: 2, name: "second", statements: []string{`CREATE TABLE second ()`}},
	}

	expectMigrationSession(mock)
	mock.ExpectBegin()
	expectPendingCheck(mock, 1, false)
	mock.ExpectExec("CREATE TABLE first").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO schema_migrations").WithArgs(int64(1), "first").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	expectPendingCheck(mock, 2, false)
	mock.ExpectExec("CREATE TABLE second").WillReturnError(errors.New("relation already exists"))
	mock.ExpectRollback()
	expectMigrationSessionRelease(mock)

	if err := runMigrations(context.Background(), db, migrations, time.Minute); err == nil {
		t.Fatal("expected the failing migration to be reported")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("migration 1 was not committed independently of migration 2: %v", err)
	}
}

func TestAppliedMigrationsAreSkippedWithoutReplayingStatements(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	migrations := []migration{
		{version: 1, name: "first", statements: []string{`CREATE TABLE first ()`}},
		{version: 2, name: "second", run: func(context.Context, *sql.Tx) error {
			t.Fatal("an applied migration must not run its data rewrite again")
			return nil
		}},
	}

	expectMigrationSession(mock)
	for _, version := range []int64{1, 2} {
		mock.ExpectBegin()
		expectPendingCheck(mock, version, true)
		mock.ExpectRollback()
	}
	expectMigrationSessionRelease(mock)

	if err := runMigrations(context.Background(), db, migrations, time.Minute); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// The budget belongs to one migration, so a slow data rewrite cannot consume
// the time the migrations after it need.
func TestEachMigrationReceivesItsOwnBudget(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	const budget = 400 * time.Millisecond
	remaining := make([]time.Duration, 0, 2)
	recordRemaining := func(ctx context.Context, _ *sql.Tx) error {
		deadline, ok := ctx.Deadline()
		if !ok {
			t.Fatal("a migration must run under a deadline")
		}
		remaining = append(remaining, time.Until(deadline))
		return nil
	}
	migrations := []migration{
		{version: 1, name: "first", run: func(ctx context.Context, tx *sql.Tx) error {
			// A slow migration is the whole point: a shared budget would leave
			// the next migration with whatever this one did not spend.
			time.Sleep(budget / 2)
			return recordRemaining(ctx, tx)
		}},
		{version: 2, name: "second", run: recordRemaining},
	}

	expectMigrationSession(mock)
	for _, version := range []int64{1, 2} {
		mock.ExpectBegin()
		expectPendingCheck(mock, version, false)
		mock.ExpectExec("INSERT INTO schema_migrations").
			WithArgs(version, migrations[version-1].name).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectCommit()
	}
	expectMigrationSessionRelease(mock)

	if err := runMigrations(context.Background(), db, migrations, budget); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	if len(remaining) != 2 {
		t.Fatalf("expected both migrations to run, got %d", len(remaining))
	}
	if remaining[1] <= remaining[0] {
		t.Fatalf(
			"the second migration inherited the first migration's remaining time (%v) instead of its own budget (%v)",
			remaining[0],
			remaining[1],
		)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestMigrationSetVersionsAreUniqueAndOrdered(t *testing.T) {
	previous := int64(0)
	for _, migration := range migrationSet() {
		if migration.version <= previous {
			t.Fatalf("migration %q has version %d, which does not follow %d", migration.name, migration.version, previous)
		}
		previous = migration.version
	}
}

func TestG3WorkspaceDocumentMigrationIsRegistered(t *testing.T) {
	migrations := migrationSet()
	byVersion := make(map[int64]migration, len(migrations))
	for _, registered := range migrations {
		byVersion[registered.version] = registered
	}
	g3 := migrations[15]
	if g3.version != 16 || g3.name != "g3-behavior-verification-workspace-documents" {
		t.Fatalf("migration 16 = %d %q, want G3 workspace document migration", g3.version, g3.name)
	}
	if len(g3.statements) != 2 {
		t.Fatalf("G3 migration statements = %d, want 2", len(g3.statements))
	}
	for _, documentType := range []string{
		"behavior-scenario",
		"behavior-control-profile",
		"behavior-fixture-set",
		"verification-policy",
		"verification-baseline-set",
	} {
		if !strings.Contains(g3.statements[0], "'"+documentType+"'") {
			t.Fatalf("G3 migration omits document type %q", documentType)
		}
	}
	if !strings.Contains(g3.statements[1], "idx_workspace_documents_single_verification_policy") {
		t.Fatal("G3 migration must enforce one verification-policy per workspace")
	}

	evidence := byVersion[19]
	if evidence.version != 19 ||
		evidence.name != "verification-evidence-plane" ||
		len(evidence.statements) < 20 {
		t.Fatalf(
			"migration before last = %d %q, want Verification Evidence plane",
			evidence.version,
			evidence.name,
		)
	}
	ledger := byVersion[20]
	if ledger.version != 20 ||
		ledger.name != "verification-mutation-ledger" ||
		len(ledger.statements) < 7 {
		t.Fatalf(
			"migration before last = %d %q, want Verification mutation ledger",
			ledger.version,
			ledger.name,
		)
	}
	for _, fragment := range []string{
		"PRIMARY KEY (workspace_id, actor_id, idempotency_key_hash)",
		"request_bytes BYTEA NOT NULL",
		"result_bytes BYTEA NOT NULL",
	} {
		if !strings.Contains(ledger.statements[0], fragment) {
			t.Fatalf("Verification mutation ledger omits %q", fragment)
		}
	}
	if !strings.Contains(ledger.statements[6], "reject_verification_immutable_mutation") {
		t.Fatal("Verification mutation ledger must be immutable after commit")
	}
	runs := byVersion[21]
	if runs.version != 21 ||
		runs.name != "verification-run-registry" ||
		len(runs.statements) < 7 {
		t.Fatalf(
			"migration before last = %d %q, want Verification run registry",
			runs.version,
			runs.name,
		)
	}
	agent := byVersion[22]
	if agent.version != 22 ||
		agent.name != "g4-agent-policy-workspace-document" ||
		len(agent.statements) != 2 {
		t.Fatalf(
			"last migration = %d %q, want G4 AgentPolicy workspace document",
			agent.version,
			agent.name,
		)
	}
	if !strings.Contains(agent.statements[0], "'agent-policy'") ||
		!strings.Contains(agent.statements[1], "idx_workspace_documents_single_agent_policy") {
		t.Fatal("G4 migration must admit one agent-policy per workspace")
	}
	control := byVersion[23]
	if control.version != 23 ||
		control.name != "g4-agent-control-plane" ||
		len(control.statements) < 17 {
		t.Fatalf(
			"last migration = %d %q, want G4 Agent control plane",
			control.version,
			control.name,
		)
	}
	controlStatements := strings.Join(control.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_tasks",
		"CREATE TABLE IF NOT EXISTS agent_runs",
		"CREATE TABLE IF NOT EXISTS agent_run_attempts",
		"CREATE TABLE IF NOT EXISTS agent_run_events",
		"CREATE TABLE IF NOT EXISTS agent_run_operations",
		"CREATE TABLE IF NOT EXISTS agent_budget_reservations",
		"UNIQUE (workspace_id, run_id, idempotency_key)",
		"agent_run_events_immutable_mutation",
		"lease_generation",
	} {
		if !strings.Contains(controlStatements, fragment) {
			t.Fatalf("G4 Agent control plane omits %q", fragment)
		}
	}
	proposal := byVersion[24]
	if proposal.version != 24 ||
		proposal.name != "g4-agent-proposal-approval-ledger" ||
		len(proposal.statements) < 18 {
		t.Fatalf(
			"last migration = %d %q, want G4 Agent proposal and approval ledger",
			proposal.version,
			proposal.name,
		)
	}
	proposalStatements := strings.Join(proposal.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_proposals",
		"CREATE TABLE IF NOT EXISTS agent_proposal_previews",
		"CREATE TABLE IF NOT EXISTS agent_approval_decisions",
		"CREATE TABLE IF NOT EXISTS agent_workspace_mutation_receipts",
		"UNIQUE (workspace_id, preview_id)",
		"idx_agent_workspace_mutation_receipts_terminal",
		"agent_workspace_mutation_receipts_immutable_mutation",
	} {
		if !strings.Contains(proposalStatements, fragment) {
			t.Fatalf("G4 Agent proposal and approval ledger omits %q", fragment)
		}
	}
	verification := byVersion[25]
	if verification.version != 25 ||
		verification.name != "g4-agent-verification-repair-ledger" ||
		len(verification.statements) < 14 {
		t.Fatalf(
			"last migration = %d %q, want G4 Agent verification and repair ledger",
			verification.version,
			verification.name,
		)
	}
	verificationStatements := strings.Join(verification.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_verification_plan_bindings",
		"CREATE TABLE IF NOT EXISTS agent_verification_closure_receipts",
		"CREATE TABLE IF NOT EXISTS agent_verification_closure_evidence",
		"CREATE TABLE IF NOT EXISTS agent_repair_round_receipts",
		"plan_compatibility IN ('exact', 'compatible', 'post-rollback')",
		"agent_verification_closure_evidence_immutable_mutation",
		"agent_repair_round_receipts_immutable_mutation",
	} {
		if !strings.Contains(verificationStatements, fragment) {
			t.Fatalf("G4 Agent verification and repair ledger omits %q", fragment)
		}
	}
	product := byVersion[26]
	if product.version != 26 ||
		product.name != "g4-agent-product-ledger" ||
		len(product.statements) < 8 {
		t.Fatalf(
			"last migration = %d %q, want G4 Agent product ledger",
			product.version,
			product.name,
		)
	}
	productStatements := strings.Join(product.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_product_supplements",
		"CREATE TABLE IF NOT EXISTS agent_run_user_commands",
		"UNIQUE (workspace_id, actor_id, idempotency_key)",
		"agent_product_supplements_immutable_mutation",
		"agent_run_user_commands_immutable_mutation",
	} {
		if !strings.Contains(productStatements, fragment) {
			t.Fatalf("G4 Agent product ledger omits %q", fragment)
		}
	}
	evaluation := byVersion[27]
	if evaluation.version != 27 ||
		evaluation.name != "g4-agent-model-evaluation-ledger" ||
		len(evaluation.statements) < 20 {
		t.Fatalf(
			"last migration = %d %q, want G4 Agent model evaluation ledger",
			evaluation.version,
			evaluation.name,
		)
	}
	evaluationStatements := strings.Join(evaluation.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_plans",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_attempts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_checkpoints",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_artifacts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_shard_leases",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_budget_ledgers",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_budget_reservations",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_budget_settlements",
		"planned_journey_count >= 11640",
		"agent_evaluation_artifacts_immutable_mutation",
	} {
		if !strings.Contains(evaluationStatements, fragment) {
			t.Fatalf("G4 Agent model evaluation ledger omits %q", fragment)
		}
	}
	runSet := byVersion[28]
	if runSet.version != 28 ||
		runSet.name != "g4-agent-verification-run-set-ledger" ||
		len(runSet.statements) < 6 {
		t.Fatalf(
			"last migration = %d %q, want G4 Agent verification Run-set ledger",
			runSet.version,
			runSet.name,
		)
	}
	runSetStatements := strings.Join(runSet.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_verification_plan_binding_runs",
		"CREATE TABLE IF NOT EXISTS agent_verification_closure_runs",
		"UNIQUE (workspace_id, binding_id, surface)",
		"UNIQUE (workspace_id, closure_receipt_id, surface)",
		"agent_verification_closure_runs_immutable_mutation",
	} {
		if !strings.Contains(runSetStatements, fragment) {
			t.Fatalf("G4 Agent verification Run-set ledger omits %q", fragment)
		}
	}
	runStatements := strings.Join(runs.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS verification_runs",
		"CREATE TABLE IF NOT EXISTS verification_run_events",
		"PRIMARY KEY (workspace_id, run_id, cursor)",
		"verification_run_events_immutable_mutation",
	} {
		if !strings.Contains(runStatements, fragment) {
			t.Fatalf("Verification run registry omits %q", fragment)
		}
	}
	authenticity := byVersion[29]
	if authenticity.version != 29 ||
		authenticity.name != "g4-agent-model-evaluation-authenticity-ledger" ||
		len(authenticity.statements) < 15 {
		t.Fatalf(
			"last migration = %d %q, want G4 Agent model evaluation authenticity ledger",
			authenticity.version,
			authenticity.name,
		)
	}
	authenticityStatements := strings.Join(authenticity.statements, "\n")
	for _, fragment := range []string{
		"idx_agent_evaluation_plans_exact_partition",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_provider_requests",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_invocation_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_source_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_execution_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_review_raster_scan_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_review_candidates",
		"execution_failure_authority_receipt_digest TEXT",
		"execution_receipt_digest TEXT NOT NULL",
		"media_type IN ('image/png', 'image/webp')",
		"width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096",
		"byte_length BETWEEN 1 AND 2097152",
		"decoded_pixel_digest TEXT NOT NULL",
		"(verdict = 'safe' AND finding_count = 0)",
		"REFERENCES agent_evaluation_review_raster_scan_receipts(namespace_id, receipt_digest)",
		"REFERENCES agent_evaluation_invocation_receipts(namespace_id, plan_digest, attempt_id, descriptor_digest, response_artifact_digest)",
		"REFERENCES agent_evaluation_execution_receipts(namespace_id, plan_digest, attempt_id, descriptor_digest, receipt_digest)",
		"execution_receipt_set_digest TEXT NOT NULL",
		"UNIQUE (namespace_id, plan_digest, source_content_digest)",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_authority_attestations",
		"reject_agent_evaluation_finalized_mutation",
		"agent_evaluation_budget_ledgers",
		"agent_evaluation_execution_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_evidence_roots",
		"bundle_artifact_size BETWEEN 1 AND 536870912",
		"agent_evaluation_evidence_roots_immutable_mutation",
	} {
		if !strings.Contains(authenticityStatements, fragment) {
			t.Fatalf("G4 Agent model evaluation authenticity ledger omits %q", fragment)
		}
	}
	stagingStatements := strings.Split(authenticityStatements, "CREATE TABLE IF NOT EXISTS agent_evaluation_review_raster_scan_receipts")[0]
	if strings.Contains(stagingStatements, "REFERENCES agent_evaluation_attempts") {
		t.Fatal("G4 authenticity receipts must support immutable crash staging before the attempt is published")
	}
	runtimeEvidence := byVersion[30]
	if runtimeEvidence.version != 30 || runtimeEvidence.name != "g4-agent-evaluation-runtime-evidence" {
		t.Fatalf("last migration = %d %q, want G4 Agent evaluation runtime evidence", runtimeEvidence.version, runtimeEvidence.name)
	}
	runtimeEvidenceStatements := strings.Join(runtimeEvidence.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_result_submission_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_controlled_runtime_receipts",
		"agent_evaluation_result_submission_receipts_finalized_mutation",
		"agent_evaluation_controlled_runtime_receipts_finalized_mutation",
	} {
		if !strings.Contains(runtimeEvidenceStatements, fragment) {
			t.Fatalf("G4 Agent evaluation runtime evidence ledger omits %q", fragment)
		}
	}
	blindReview := byVersion[31]
	if blindReview.version != 31 || blindReview.name != "g4-agent-evaluation-blind-review-mapping" {
		t.Fatalf("last migration = %d %q, want G4 Agent blind review mapping", blindReview.version, blindReview.name)
	}
	blindReviewStatements := strings.Join(blindReview.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_blind_review_mappings",
		"randomized_presentation_id ~ '^blind-review:[A-Za-z0-9_-]{43}$'",
		"agent_evaluation_blind_review_mappings_immutable_mutation",
		"agent_evaluation_blind_review_mappings_finalized_mutation",
	} {
		if !strings.Contains(blindReviewStatements, fragment) {
			t.Fatalf("G4 Agent blind review mapping ledger omits %q", fragment)
		}
	}
	turnJournal := byVersion[32]
	if turnJournal.version != 32 || turnJournal.name != "g4-agent-evaluation-turn-journal" {
		t.Fatalf("last migration = %d %q, want G4 Agent evaluation turn journal", turnJournal.version, turnJournal.name)
	}
	turnJournalStatements := strings.Join(turnJournal.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_transport_dispatch_intents",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_transport_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_provider_result_spool_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_provider_result_spool_payloads",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_provider_result_spool_dispositions",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_invocation_turn_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_invocation_turn_set_receipts",
		"octet_length(nonce_bytes) = 12",
		"octet_length(authentication_tag_bytes) = 16",
		"ciphertext_size_bytes BETWEEN 1 AND 16777216",
		"authorize_agent_evaluation_spool_payload_delete",
		"require_agent_evaluation_completed_transport_spool",
		"DEFERRABLE INITIALLY DEFERRED",
		"agent_evaluation_transport_dispatch_intents_immutable_mutation",
		"agent_evaluation_invocation_turn_set_receipts_finalized_mutation",
	} {
		if !strings.Contains(turnJournalStatements, fragment) {
			t.Fatalf("G4 Agent evaluation turn journal omits %q", fragment)
		}
	}
	authenticityV3 := byVersion[33]
	if authenticityV3.version != 33 || authenticityV3.name != "g4-agent-evaluation-authenticity-v3-hard-cut" {
		t.Fatalf("last migration = %d %q, want G4 Agent evaluation authenticity v3 hard cut", authenticityV3.version, authenticityV3.name)
	}
	authenticityV3Statements := strings.Join(authenticityV3.statements, "\n")
	for _, fragment := range []string{
		"response_artifact_digest TEXT",
		"agent_evaluation_review_candidates_terminal_turn_fkey",
		"transport_dispatch_intent_set_digest TEXT NOT NULL",
		"provider_result_spool_disposition_receipt_set_digest TEXT NOT NULL",
		"blind_review_mapping_set_digest TEXT NOT NULL",
		"holdout_execution_receipt_digest TEXT NOT NULL",
		"protected_holdout_canary_set_digest TEXT NOT NULL",
		"agent_evaluation_provider_result_spool_access_receipts",
	} {
		if !strings.Contains(authenticityV3Statements, fragment) {
			t.Fatalf("G4 Agent evaluation authenticity v3 hard cut omits %q", fragment)
		}
	}
	validatedHumanReview := byVersion[34]
	if validatedHumanReview.version != 34 || validatedHumanReview.name != "g4-agent-evaluation-evidence-extensions" {
		t.Fatalf("last migration = %d %q, want G4 Agent evaluation evidence extensions", validatedHumanReview.version, validatedHumanReview.name)
	}
	validatedHumanReviewStatements := strings.Join(validatedHumanReview.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_validated_human_review_artifacts",
		"human_review_report_type = 'evaluation-human-review-report'",
		"octet_length(artifact_bytes) BETWEEN 1 AND 16842752",
		"agent_evaluation_validated_human_review_immutable_mutation",
		"agent_evaluation_validated_human_review_finalized_mutation",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_execution_receipts",
		"UNIQUE (namespace_id, plan_digest, attempt_id, capability_descriptor_digest)",
		"agent_evaluation_capability_execution_immutable_mutation",
		"agent_evaluation_capability_execution_finalized_mutation",
	} {
		if !strings.Contains(validatedHumanReviewStatements, fragment) {
			t.Fatalf("G4 Agent validated human review ledger omits %q", fragment)
		}
	}
	verificationAttemptGrantReceipts := byVersion[35]
	if verificationAttemptGrantReceipts.version != 35 ||
		verificationAttemptGrantReceipts.name != "g4-agent-evaluation-verification-attempt-grant-receipts" {
		t.Fatalf(
			"last migration = %d %q, want G4 evaluation Verification AttemptGrant receipts",
			verificationAttemptGrantReceipts.version,
			verificationAttemptGrantReceipts.name,
		)
	}
	verificationAttemptGrantReceiptStatements := strings.Join(verificationAttemptGrantReceipts.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_verification_attempt_grant_receipts",
		"FOREIGN KEY (namespace_id, evaluation_plan_digest, repository_commit)",
		"FOREIGN KEY (verification_attempt_grant_digest)",
		"octet_length(request_bytes) BETWEEN 1 AND 8388608",
		"agent_evaluation_verification_attempt_grant_receipts_immutable_mutation",
		"agent_evaluation_verification_attempt_grant_receipts_finalized_mutation",
	} {
		if !strings.Contains(verificationAttemptGrantReceiptStatements, fragment) {
			t.Fatalf("G4 evaluation Verification AttemptGrant receipt ledger omits %q", fragment)
		}
	}
	verificationGrantAuthenticity := byVersion[36]
	if verificationGrantAuthenticity.version != 36 ||
		verificationGrantAuthenticity.name != "g4-agent-evaluation-verification-grant-authenticity" {
		t.Fatalf("last migration = %d %q, want verification grant authenticity roots",
			verificationGrantAuthenticity.version, verificationGrantAuthenticity.name)
	}
	verificationGrantAuthenticityStatements := strings.Join(verificationGrantAuthenticity.statements, "\n")
	for _, fragment := range []string{
		"verification_attempt_grant_receipt_set_digest TEXT",
		"eval_authority_verification_grant_digest_check",
		"eval_root_verification_grant_digest_check",
	} {
		if !strings.Contains(verificationGrantAuthenticityStatements, fragment) {
			t.Fatalf("G4 Verification AttemptGrant authenticity migration omits %q", fragment)
		}
	}
	boundedExport := byVersion[37]
	if boundedExport.version != 37 || boundedExport.name != "g4-agent-evaluation-bounded-export-leases" {
		t.Fatalf("last migration = %d %q, want G4 bounded evaluation export leases",
			boundedExport.version, boundedExport.name)
	}
	boundedExportStatements := strings.Join(boundedExport.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_export_leases",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_export_lease_families",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_export_lease_records",
		"lease_kind IN ('evidence-archive', 'human-review')",
		"total_record_count BETWEEN 1 AND 2000000",
		"byte_length BETWEEN 1 AND 16777216",
		"agent_evaluation_export_lease_records_page",
		"agent_evaluation_export_leases_immutable_mutation",
		"agent_evaluation_export_lease_records_immutable_mutation",
		"DEFERRABLE INITIALLY DEFERRED",
	} {
		if !strings.Contains(boundedExportStatements, fragment) {
			t.Fatalf("G4 bounded evaluation export migration omits %q", fragment)
		}
	}
	reviewPhase := byVersion[38]
	if reviewPhase.version != 38 || reviewPhase.name != "g4-agent-evaluation-review-phase-binding" {
		t.Fatalf("last migration = %d %q, want G4 evaluation review phase binding",
			reviewPhase.version, reviewPhase.name)
	}
	reviewPhaseStatements := strings.Join(reviewPhase.statements, "\n")
	for _, fragment := range []string{
		"ALTER TABLE agent_evaluation_authority_attestations",
		"ALTER TABLE agent_evaluation_evidence_roots",
		"ALTER TABLE agent_evaluation_validated_human_review_artifacts",
		"ADD COLUMN IF NOT EXISTS review_lease_digest TEXT",
		"eval_authority_review_lease_digest_check",
		"eval_root_review_lease_digest_check",
		"eval_validated_human_review_lease_digest_check",
		"review_lease_digest IS NULL OR review_lease_digest ~ '^sha256-[a-f0-9]{64}$'",
	} {
		if !strings.Contains(reviewPhaseStatements, fragment) {
			t.Fatalf("G4 evaluation review phase migration omits %q", fragment)
		}
	}
	reviewLease := byVersion[39]
	if reviewLease.version != 39 || reviewLease.name != "g4-agent-evaluation-bounded-review-leases" {
		t.Fatalf("last migration = %d %q, want G4 bounded evaluation review leases",
			reviewLease.version, reviewLease.name)
	}
	reviewLeaseStatements := strings.Join(reviewLease.statements, "\n")
	for _, fragment := range []string{
		"ALTER COLUMN evidence_set_digest DROP NOT NULL",
		"ALTER COLUMN authority_attestation_digest DROP NOT NULL",
		"idx_agent_evaluation_one_human_review_lease",
		"WHERE lease_kind = 'human-review'",
	} {
		if !strings.Contains(reviewLeaseStatements, fragment) {
			t.Fatalf("G4 bounded evaluation review lease migration omits %q", fragment)
		}
	}
	controlledAuthorityStatements := strings.Join(byVersion[41].statements, "\n")
	for _, laterTable := range []string{
		"agent_evaluation_attempt_authority_owner_receipts",
		"agent_evaluation_runtime_fact_source_owner_registrations",
		"agent_evaluation_capability_probe_admissions",
		"agent_evaluation_capability_probe_response_spools",
		"agent_evaluation_capability_probe_reference_receipts",
		"agent_evaluation_plan_capability_probe_admission_links",
		"agent_evaluation_optional_capability_fact_sources",
		"agent_evaluation_optional_fact_authorities",
		"agent_evaluation_provider_capability_observation_receipts",
		"agent_evaluation_capability_specific_receipts",
		"agent_evaluation_attempt_authority_commit_links",
		"agent_evaluation_provider_capability_observation_commit_links",
	} {
		if strings.Contains(controlledAuthorityStatements, laterTable) {
			t.Fatalf("recorded v41 migration unexpectedly owns later table %q", laterTable)
		}
	}
	attemptAuthority := byVersion[45]
	if attemptAuthority.version != 45 || attemptAuthority.name != "g4-agent-evaluation-attempt-authority-facts" {
		t.Fatalf("migration = %d %q, want G4 attempt authority facts",
			attemptAuthority.version, attemptAuthority.name)
	}
	attemptAuthorityStatements := strings.Join(attemptAuthority.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_attempt_authority_owner_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_runtime_fact_source_owner_registrations",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_admissions",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_response_spools",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_reference_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_plan_capability_probe_admission_links",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_optional_capability_fact_sources",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_optional_fact_authorities",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_provider_capability_observation_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_specific_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_attempt_authority_commit_links",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_provider_capability_observation_commit_links",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_authority_attestation_v45_roots",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_evidence_root_v45_roots",
		"ADD COLUMN IF NOT EXISTS v45_eligible BOOLEAN",
		"provider_capability_observation_receipt_digest TEXT GENERATED ALWAYS AS",
		"agent_evaluation_attempts_v45_exact_identity_key",
		"provider_capability_observation_receipt_set_digest",
		"attempt_authority_owner_receipt_set_digest TEXT NOT NULL",
		"validated_human_metric_observation_set_digest TEXT NOT NULL",
		"agent_evaluation_controlled_authority_v45_response_check",
		"agent_eval_controlled_authority_v45_g3_cell_admission_check",
		"operation='verification.cell.admit'",
		"route_binding='g3-cell-admission'",
		"selected_runtime_fact_envelope_set_digest TEXT NOT NULL",
		"source_authority_set_digest TEXT NOT NULL",
		"'factAuthorities'",
		"'runtimeFactSourceAuthorityDigest'",
		"jsonb_object_keys(fact_authority)) <> 19",
		"prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt",
		"prodivix.agent-evaluation-capability-probe-encrypted-response-spool-source-receipt",
		"enforce_agent_evaluation_capability_probe_response_spool_binding",
		"ciphertext_byte_length=octet_length(ciphertext_bytes)",
		"[A-Za-z0-9._:@/-]{0,255}",
		"agent_evaluation_capability_probe_references_required",
		"prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt",
		"agent_evaluation_plans_runtime_fact_source_registrations_required",
		"registration_receipt_digest TEXT NOT NULL",
		"source_request_digest TEXT NOT NULL",
		"INTERVAL '8 days'",
		"registered_at IS NULL OR registered_at >= claimed_at",
		"'g4-provider-background-job'",
		"'sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195'",
		"'g4-provider-hosted-retrieval-core'",
		"'sha256-666c6df670c77605562ff82765013291f99045f36edcb8db0af209267c91565d'",
		"'g4-provider-hosted-retrieval-document'",
		"'sha256-8ced3fda38a88c0819a6a2d4603e453f515a9c98efadc7c270af194349c5b90e'",
		"'g4-provider-isolated-cache'",
		"'sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103'",
		"'g4-provider-reasoning-continuation'",
		"'sha256-5c84287b4c1e16fb0c1eda862a8e44754503a3fa0a4b61a16e2d2f2465072d34'",
		"optional_authority->'runtimeFactSourceAuthority'",
		"target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,authorityDigest}'",
		"'provider.background-job'",
		"'provider.hosted-retrieval'",
		"'provider.isolated-cache'",
		"'provider.reasoning-continuation'",
		"source_seal_digest TEXT NOT NULL",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_stages",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_executions",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_results",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_abandonments",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_cleanup_receipts",
		"consumed_input_source_fact_digest",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_source_consumption_claims",
		"request_ref_authority_receipt_digest TEXT NOT NULL",
		"5880",
		"8589934592",
		"DEFERRABLE INITIALLY DEFERRED",
		"octet_length(receipt_bytes) BETWEEN 1 AND 16384",
	} {
		if !strings.Contains(attemptAuthorityStatements, fragment) {
			t.Fatalf("G4 attempt authority migration omits %q", fragment)
		}
	}
	if strings.Contains(attemptAuthorityStatements, "target#>>'{runtimeFactSourceAuthority") ||
		strings.Contains(attemptAuthorityStatements, "target->'runtimeFactSourceAuthority'") ||
		strings.Contains(attemptAuthorityStatements, "'provider.parallel-tool'") {
		t.Fatal("G4 attempt authority migration admits a top-level or parallel runtime fact source authority")
	}
	if attemptAuthority.preflight == nil {
		t.Fatal("G4 attempt authority migration omits its populated-v41 preflight")
	}
	archiveClosure := byVersion[43]
	if archiveClosure.version != 43 || archiveClosure.name != "g4-agent-evaluation-evidence-archive-closure" {
		t.Fatalf("migration = %d %q, want G4 evaluation archive closure",
			archiveClosure.version, archiveClosure.name)
	}
	archiveClosureStatements := strings.Join(archiveClosure.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_archive_closures",
		"PRIMARY KEY (namespace_id, plan_digest)",
		"UNIQUE (namespace_id, export_lease_id)",
		"FOREIGN KEY (namespace_id, export_lease_id)",
		"review_lease_digest IS NULL OR review_lease_digest ~ '^sha256-[a-f0-9]{64}$'",
		"octet_length(closure_bytes) BETWEEN 1 AND 25296896",
		"agent_evaluation_archive_closures_immutable_mutation",
	} {
		if !strings.Contains(archiveClosureStatements, fragment) {
			t.Fatalf("G4 evaluation archive closure migration omits %q", fragment)
		}
	}
	finalizationAuthority := byVersion[44]
	if finalizationAuthority.version != 44 || finalizationAuthority.name != "g4-agent-evaluation-finalization-authority" {
		t.Fatalf("migration = %d %q, want G4 evaluation finalization authority",
			finalizationAuthority.version, finalizationAuthority.name)
	}
	finalizationAuthorityStatements := strings.Join(finalizationAuthority.statements, "\n")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_validated_human_metric_observation_sets",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_validated_human_metric_observations",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_finalization_intents",
		"validated_human_metric_observation_set_digest",
		"existing finalization lacks validated human metric authority",
		"agent_evaluation_validated_human_metrics_finalized_mutation",
		"agent_evaluation_finalization_intents_finalized_mutation",
	} {
		if !strings.Contains(finalizationAuthorityStatements, fragment) {
			t.Fatalf("G4 evaluation finalization authority migration omits %q", fragment)
		}
	}
}

func TestVerificationEvidenceMigrationKeepsEvidenceOutsideWorkspaceCascade(t *testing.T) {
	migration := verificationEvidenceMigration()
	if migration.version != 19 || migration.name != "verification-evidence-plane" {
		t.Fatalf("migration = %d %q, want version 19 Verification Evidence plane", migration.version, migration.name)
	}
	statements := strings.Join(migration.statements, "\n")
	for _, table := range []string{
		"verification_attempt_grants",
		"verification_promotions",
		"verification_attempt_grant_claims",
		"verification_promotion_artifacts",
		"verification_artifacts",
		"verification_evidence",
		"verification_evidence_artifacts",
		"verification_attestations",
		"verification_supersessions",
		"verification_trust_revocations",
		"verification_retention_protections",
		"verification_tombstones",
		"verification_audit_events",
	} {
		if !strings.Contains(statements, "CREATE TABLE IF NOT EXISTS "+table) {
			t.Fatalf("Verification Evidence migration omits %s", table)
		}
	}
	var grantStatement, evidenceStatement string
	for _, statement := range migration.statements {
		switch {
		case strings.Contains(
			statement,
			"CREATE TABLE IF NOT EXISTS verification_attempt_grants",
		):
			grantStatement = statement
		case strings.Contains(
			statement,
			"CREATE TABLE IF NOT EXISTS verification_evidence (",
		):
			evidenceStatement = statement
		}
	}
	if grantStatement == "" || evidenceStatement == "" {
		t.Fatal("Verification durable authority tables were not found")
	}
	if strings.Contains(grantStatement, "REFERENCES workspaces") ||
		strings.Contains(grantStatement, "REFERENCES projects") ||
		strings.Contains(grantStatement, "ON DELETE CASCADE") {
		t.Fatal("immutable attempt grants must not block or cascade with project deletion")
	}
	for _, fragment := range []string{
		"successful_retention_class TEXT NOT NULL",
		"failed_retention_class TEXT NOT NULL",
		"UNIQUE (workspace_id, plan_digest, cell_id, attempt_id)",
	} {
		if !strings.Contains(grantStatement, fragment) {
			t.Fatalf("attempt grant authority omits %q", fragment)
		}
	}
	if strings.Contains(grantStatement, "outcome TEXT") {
		t.Fatal("pre-run attempt grants must not bind a result outcome")
	}
	if strings.Contains(evidenceStatement, "REFERENCES workspaces") ||
		strings.Contains(evidenceStatement, "ON DELETE CASCADE") {
		t.Fatal("durable Verification Evidence must not cascade with Canonical Workspace")
	}
	for _, trigger := range []string{
		"verification_attempt_grants_immutable_mutation",
		"verification_attempt_grant_claims_immutable_mutation",
		"reject_verification_immutable_mutation",
	} {
		if !strings.Contains(statements, trigger) {
			t.Fatalf("Verification Evidence migration omits immutable guard %q", trigger)
		}
	}
}
