package database

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

func TestEnvironmentRevisionModeMigrationPreservesKnownCurrentAndFencesUnknownHistory(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 47)
	ctx := context.Background()
	for _, statement := range []string{
		`DROP TABLE execution_environment_revisions CASCADE`,
		`DROP TABLE execution_environments CASCADE`,
		`CREATE TABLE execution_environments (id TEXT PRIMARY KEY, mode TEXT NOT NULL, current_revision TEXT NOT NULL)`,
		`CREATE TABLE execution_environment_revisions (environment_id TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(environment_id, revision))`,
		`INSERT INTO execution_environments VALUES ('environment', 'live', 'current')`,
		`INSERT INTO execution_environment_revisions VALUES ('environment', 'historical'), ('environment', 'current')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if err := runMigrations(ctx, db, []migration{environmentRevisionModeMigration()}, time.Minute); err != nil {
		t.Fatal(err)
	}
	var current string
	var historical sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT mode FROM execution_environment_revisions WHERE revision='current'`).Scan(&current); err != nil || current != "live" {
		t.Fatalf("current mode = %q, %v", current, err)
	}
	if err := db.QueryRowContext(ctx, `SELECT mode FROM execution_environment_revisions WHERE revision='historical'`).Scan(&historical); err != nil || historical.Valid {
		t.Fatalf("invented historical mode = %#v, %v", historical, err)
	}
	for _, statement := range []string{
		`INSERT INTO execution_environment_revisions (environment_id,revision) VALUES ('environment','missing-mode')`,
		`INSERT INTO execution_environment_revisions VALUES ('environment','invalid-mode','unknown')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err == nil {
			t.Fatal("new revision accepted an unknown mode")
		}
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO execution_environment_revisions VALUES ('environment','new-mock','mock')`); err != nil {
		t.Fatal(err)
	}
}
