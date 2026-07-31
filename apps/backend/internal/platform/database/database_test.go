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

	evidence := migrations[len(migrations)-3]
	if evidence.version != 19 ||
		evidence.name != "verification-evidence-plane" ||
		len(evidence.statements) < 20 {
		t.Fatalf(
			"migration before last = %d %q, want Verification Evidence plane",
			evidence.version,
			evidence.name,
		)
	}
	ledger := migrations[len(migrations)-2]
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
	last := migrations[len(migrations)-1]
	if last.version != 21 ||
		last.name != "verification-run-registry" ||
		len(last.statements) < 7 {
		t.Fatalf(
			"last migration = %d %q, want Verification run registry",
			last.version,
			last.name,
		)
	}
	runStatements := strings.Join(last.statements, "\n")
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
