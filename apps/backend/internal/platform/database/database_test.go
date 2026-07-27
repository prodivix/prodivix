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
	last := migrations[len(migrations)-1]
	if last.version != 16 || last.name != "g3-behavior-verification-workspace-documents" {
		t.Fatalf("last migration = %d %q, want G3 workspace document migration", last.version, last.name)
	}
	if len(last.statements) != 2 {
		t.Fatalf("G3 migration statements = %d, want 2", len(last.statements))
	}
	for _, documentType := range []string{
		"behavior-scenario",
		"behavior-control-profile",
		"behavior-fixture-set",
		"verification-policy",
		"verification-baseline-set",
	} {
		if !strings.Contains(last.statements[0], "'"+documentType+"'") {
			t.Fatalf("G3 migration omits document type %q", documentType)
		}
	}
	if !strings.Contains(last.statements[1], "idx_workspace_documents_single_verification_policy") {
		t.Fatal("G3 migration must enforce one verification-policy per workspace")
	}
}
