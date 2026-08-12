package database

import (
	"strings"
	"testing"
)

func TestAgentEvaluationArchiveClosureMigrationPostgreSQLGate(t *testing.T) {
	db := openPIRWireMigrationPostgreSQL(t)
	var tableName string
	if err := db.QueryRow(`SELECT to_regclass('agent_evaluation_archive_closures')::text`).Scan(&tableName); err != nil {
		t.Fatal(err)
	}
	if tableName != "agent_evaluation_archive_closures" {
		t.Fatalf("archive closure table = %q", tableName)
	}
	rows, err := db.Query(`SELECT pg_get_constraintdef(oid)
		FROM pg_constraint
		WHERE conrelid='agent_evaluation_archive_closures'::regclass
		ORDER BY conname`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var constraints strings.Builder
	for rows.Next() {
		var definition string
		if err := rows.Scan(&definition); err != nil {
			t.Fatal(err)
		}
		constraints.WriteString(definition)
		constraints.WriteByte('\n')
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	for _, fragment := range []string{
		"PRIMARY KEY (namespace_id, plan_digest)",
		"UNIQUE (namespace_id, export_lease_id)",
		"FOREIGN KEY (namespace_id, export_lease_id)",
		"octet_length(closure_bytes) >= 1",
	} {
		if !strings.Contains(constraints.String(), fragment) {
			t.Fatalf("archive closure PostgreSQL constraints omit %q: %s", fragment, constraints.String())
		}
	}
	var immutableTriggerCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM pg_trigger
		WHERE tgrelid='agent_evaluation_archive_closures'::regclass
		AND NOT tgisinternal AND tgname='agent_evaluation_archive_closures_immutable_mutation'`).Scan(&immutableTriggerCount); err != nil {
		t.Fatal(err)
	}
	if immutableTriggerCount != 1 {
		t.Fatalf("archive closure immutable trigger count = %d", immutableTriggerCount)
	}
}
