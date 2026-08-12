package database

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

func TestAgentEvaluationEndpointSmokeMigrationPostgreSQLGate(t *testing.T) {
	db := openPIRWireMigrationPostgreSQL(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	conn, err := db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := applyMigration(ctx, conn, agentEvaluationEndpointSmokeMigration(), 90*time.Second); err != nil {
		t.Fatalf("apply endpoint-smoke v40 migration: %v", err)
	}

	tables := []string{
		"agent_evaluation_endpoint_smoke_dispatch_intents",
		"agent_evaluation_endpoint_smoke_transport_receipts",
		"agent_evaluation_endpoint_smoke_result_spool_receipts",
		"agent_evaluation_endpoint_smoke_result_spool_payloads",
		"agent_evaluation_endpoint_smoke_spool_disposition_receipts",
		"agent_evaluation_endpoint_smoke_validation_failure_receipts",
		"agent_evaluation_endpoint_smoke_terminal_receipts",
		"agent_evaluation_endpoint_smoke_qualification_reports",
		"agent_evaluation_endpoint_smoke_source_receipt_refs",
		"agent_evaluation_endpoint_smoke_evidence_commits",
	}
	for _, table := range tables {
		var relation sql.NullString
		if err := db.QueryRowContext(ctx, `SELECT to_regclass($1)::text`, table).Scan(&relation); err != nil {
			t.Fatal(err)
		}
		if !relation.Valid || relation.String != table {
			t.Fatalf("missing v40 endpoint-smoke relation %s", table)
		}
	}

	for _, table := range []string{"agent_evaluation_authority_attestations", "agent_evaluation_evidence_roots"} {
		var count int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.columns
			WHERE table_schema=current_schema() AND table_name=$1
			  AND column_name IN (
				'endpoint_smoke_dispatch_intent_set_digest',
				'endpoint_smoke_transport_receipt_set_digest',
				'endpoint_smoke_result_spool_receipt_set_digest',
				'endpoint_smoke_result_spool_disposition_receipt_set_digest',
				'endpoint_smoke_validation_failure_receipt_set_digest'
			  ) AND is_nullable='NO'`, table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 5 {
			t.Fatalf("%s has %d required endpoint-smoke roots, want 5", table, count)
		}
	}

	var validationForeignKeys, immutableTriggers int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM pg_constraint
		WHERE conrelid='agent_evaluation_endpoint_smoke_validation_failure_receipts'::regclass
		  AND contype='f'`).Scan(&validationForeignKeys); err != nil {
		t.Fatal(err)
	}
	if validationForeignKeys < 4 {
		t.Fatalf("validation-failure receipt has %d foreign keys, want at least 4", validationForeignKeys)
	}
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM pg_trigger
		WHERE tgrelid = ANY(ARRAY[
			'agent_evaluation_endpoint_smoke_validation_failure_receipts'::regclass,
			'agent_evaluation_endpoint_smoke_source_receipt_refs'::regclass,
			'agent_evaluation_endpoint_smoke_evidence_commits'::regclass
		]) AND NOT tgisinternal`).Scan(&immutableTriggers); err != nil {
		t.Fatal(err)
	}
	if immutableTriggers < 6 {
		t.Fatalf("v40 final facts expose only %d user triggers, want immutable and finalization fences", immutableTriggers)
	}
}
