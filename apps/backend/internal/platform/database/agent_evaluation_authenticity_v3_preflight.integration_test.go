package database

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func resetAgentEvaluationMigrationSchemaAtV32(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	var schema string
	if err := db.QueryRowContext(ctx, `SELECT current_schema()`).Scan(&schema); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(schema, "prodivix_pir_wire_migration_") {
		t.Fatalf("refusing to reset unexpected PostgreSQL schema %q", schema)
	}
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := db.ExecContext(ctx, "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
		t.Fatalf("drop isolated migration schema: %v", err)
	}
	if _, err := db.ExecContext(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatalf("recreate isolated migration schema: %v", err)
	}
	migrations := migrationSet()
	throughV32 := make([]migration, 0, len(migrations))
	for _, migration := range migrations {
		if migration.version <= 32 {
			throughV32 = append(throughV32, migration)
		}
	}
	if err := runMigrations(ctx, db, throughV32, 2*time.Minute); err != nil {
		t.Fatalf("install isolated v32 schema: %v", err)
	}
}

func evaluationMigrationDigest(character string) string {
	return "sha256-" + strings.Repeat(character, 64)
}

func seedPopulatedAgentEvaluationV32(t *testing.T, db *sql.DB, includeTurnAuthority bool) (string, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	namespaceID := "migration-v32"
	planDigest := evaluationMigrationDigest("1")
	descriptorDigest := evaluationMigrationDigest("2")
	responseDigest := evaluationMigrationDigest("3")
	executionDigest := evaluationMigrationDigest("4")
	scanDigest := evaluationMigrationDigest("5")
	candidateDigest := evaluationMigrationDigest("6")
	now := time.Date(2026, 8, 8, 1, 2, 3, 0, time.UTC)
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO agent_evaluation_plans (
			namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
			plan_json,plan_bytes,planned_at,expires_at
		) VALUES ($1,'plan.v32',$2,$3,11640,'{}'::jsonb,$4,$5,$6)`,
			[]any{namespaceID, planDigest, strings.Repeat("a", 40), []byte("{}"), now, now.Add(24 * time.Hour)}},
		{`INSERT INTO agent_evaluation_attempts (
			namespace_id,plan_digest,attempt_id,descriptor_digest,sampling_identity_digest,
			independent_run_id,shard_id,case_id,target_id,status,outcome,attempt_digest,
			attempt_json,attempt_bytes,started_at,completed_at
		) VALUES ($1,$2,'attempt.v32',$3,$4,'run.v32','shard.v32','case.v32','target.v32',
			'completed','passed',$5,'{}'::jsonb,$6,$7,$8)`,
			[]any{namespaceID, planDigest, descriptorDigest, evaluationMigrationDigest("7"),
				evaluationMigrationDigest("8"), []byte("{}"), now, now.Add(time.Minute)}},
		{`INSERT INTO agent_evaluation_provider_requests (
			namespace_id,plan_digest,repository_commit,provider_configuration_id,provider_request_id,
			receipt_kind,receipt_identity,recorded_at
		) VALUES ($1,$2,$3,'provider.v32','request.v32','invocation','invocation.v32',$4)`,
			[]any{namespaceID, planDigest, strings.Repeat("a", 40), now}},
		{`INSERT INTO agent_evaluation_invocation_receipts (
			namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,
			provider_configuration_id,model_lineage_digest,provider_request_id,
			invocation_outcome,invocation_receipt_digest,response_artifact_digest,evidence_digest,
			evidence_json,evidence_bytes,started_at,completed_at,transport_receipt_digest,
			resolved_model_id,resolved_model_version,resolved_model_identity_digest
		) VALUES ($1,$2,$3,'attempt.v32',$4,'target.v32','provider.v32',$5,'request.v32',
			'completed',$6,$7,$8,'{}'::jsonb,$9,$10,$11,$12,'model.v32','version.v32',$13)`,
			[]any{namespaceID, planDigest, strings.Repeat("a", 40), descriptorDigest,
				evaluationMigrationDigest("9"), evaluationMigrationDigest("a"), responseDigest,
				evaluationMigrationDigest("b"), []byte("{}"), now, now.Add(30 * time.Second),
				evaluationMigrationDigest("c"), evaluationMigrationDigest("d")}},
		{`INSERT INTO agent_evaluation_execution_receipts (
			namespace_id,plan_digest,repository_commit,execution_receipt_id,attempt_id,descriptor_digest,
			model_invocations,tool_calls,repair_rounds,transactions,artifact_bytes,elapsed_ms,
			receipt_digest,receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,'execution.v32','attempt.v32',$4,1,0,0,0,1,100,$5,'{}'::jsonb,$6)`,
			[]any{namespaceID, planDigest, strings.Repeat("a", 40), descriptorDigest, executionDigest, []byte("{}")}},
		{`INSERT INTO agent_evaluation_review_raster_scan_receipts (
			namespace_id,plan_digest,repository_commit,scan_receipt_id,attempt_id,descriptor_digest,
			projection_authority_digest,media_type,width,height,byte_length,policy_digest,bytes_digest,
			decoded_pixel_digest,metadata_profile_digest,canary_set_digest,fingerprint_set_digest,
			finding_count,verdict,receipt_digest,receipt_json,receipt_bytes,scanned_at
		) VALUES ($1,$2,$3,'scan.v32','attempt.v32',$4,$5,'image/png',1,1,1,$6,$7,$8,$9,$10,$11,
			0,'safe',$12,'{}'::jsonb,$13,$14)`,
			[]any{namespaceID, planDigest, strings.Repeat("a", 40), descriptorDigest,
				evaluationMigrationDigest("e"), evaluationMigrationDigest("f"), evaluationMigrationDigest("0"),
				evaluationMigrationDigest("1"), evaluationMigrationDigest("2"), evaluationMigrationDigest("3"),
				evaluationMigrationDigest("4"), scanDigest, []byte("{}"), now.Add(40 * time.Second)}},
		{`INSERT INTO agent_evaluation_review_candidates (
			namespace_id,plan_digest,repository_commit,attempt_id,candidate_id,descriptor_digest,
			response_digest,execution_receipt_digest,grader_artifact_digest,projection_authority_digest,
			media_type,width,height,bytes_digest,byte_length,public_artifact_scan_digest,candidate_digest,
			candidate_json,candidate_bytes,generated_at
		) VALUES ($1,$2,$3,'attempt.v32','candidate.v32',$4,$5,$6,$7,$8,'image/png',1,1,$9,1,$10,$11,
			'{}'::jsonb,$12,$13)`,
			[]any{namespaceID, planDigest, strings.Repeat("a", 40), descriptorDigest, responseDigest,
				executionDigest, evaluationMigrationDigest("5"), evaluationMigrationDigest("6"),
				evaluationMigrationDigest("7"), scanDigest, candidateDigest, []byte("{}"), now.Add(50 * time.Second)}},
		{`INSERT INTO agent_evaluation_blind_review_mappings (
			namespace_id,plan_digest,repository_commit,mapping_id,candidate_id,attempt_id,candidate_digest,
			bytes_digest,rubric_digest,randomized_presentation_policy_digest,randomized_presentation_id,
			mapping_digest,mapping_json,mapping_bytes,created_at
		) VALUES ($1,$2,$3,'mapping.v32','candidate.v32','attempt.v32',$4,$5,$6,$7,$8,$9,'{}'::jsonb,$10,$11)`,
			[]any{namespaceID, planDigest, strings.Repeat("a", 40), candidateDigest,
				evaluationMigrationDigest("7"), evaluationMigrationDigest("8"), evaluationMigrationDigest("9"),
				"blind-review:" + strings.Repeat("A", 43), evaluationMigrationDigest("a"), []byte("{}"), now.Add(time.Minute)}},
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("seed populated v32 authority: %v\n%s", err, statement.query)
		}
	}
	if includeTurnAuthority {
		turnStatements := []struct {
			query string
			args  []any
		}{
			{`INSERT INTO agent_evaluation_budget_reservations (
				namespace_id,plan_digest,reservation_id,ledger_revision,demand_digest,demand_json,demand_bytes,reserved_at
			) VALUES ($1,$2,'reservation.v32',0,$3,'{}'::jsonb,$4,$5)`,
				[]any{namespaceID, planDigest, evaluationMigrationDigest("b"), []byte("{}"), now}},
			{`INSERT INTO agent_evaluation_transport_dispatch_intents (
				namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,descriptor_json,descriptor_bytes,
				turn_index,budget_reservation_id,intent_id,invocation_id,protocol_family,provider_configuration_id,
				model_lineage_digest,inference_configuration_digest,demand_digest,request_digest,endpoint_id,
				endpoint_class,request_body_digest,request_bytes,intent_digest,intent_json,intent_bytes,created_at
			) VALUES ($1,$2,$3,'attempt.v32',$4,'{}'::jsonb,$5,0,'reservation.v32','intent.v32','turn-invocation.v32',
				'openai-responses','provider.v32',$6,$7,$8,$9,'endpoint.v32','first-party-hosted',$10,1,$11,
				'{}'::jsonb,$12,$13)`,
				[]any{namespaceID, planDigest, strings.Repeat("a", 40), descriptorDigest, []byte("{}"),
					evaluationMigrationDigest("c"), evaluationMigrationDigest("d"), evaluationMigrationDigest("b"),
					evaluationMigrationDigest("e"), evaluationMigrationDigest("f"), evaluationMigrationDigest("0"),
					[]byte("{}"), now}},
			{`INSERT INTO agent_evaluation_transport_receipts (
				namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,intent_digest,
				receipt_id,invocation_id,provider_configuration_id,provider_request_id,dispatch_state,outcome,
				response_body_digest,receipt_digest,receipt_json,receipt_bytes,started_at,completed_at,closed_at
			) VALUES ($1,$2,$3,'attempt.v32',$4,0,$5,'transport.v32','turn-invocation.v32','provider.v32',NULL,
				'not-dispatched','failed',NULL,$6,'{}'::jsonb,$7,$8,$9,$10)`,
				[]any{namespaceID, planDigest, strings.Repeat("a", 40), descriptorDigest,
					evaluationMigrationDigest("0"), evaluationMigrationDigest("1"), []byte("{}"),
					now, now.Add(time.Second), now.Add(2 * time.Second)}},
			{`INSERT INTO agent_evaluation_invocation_turn_receipts (
				namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,invocation_id,status,
				dispatch_state,terminal,dispatch_intent_digest,transport_receipt_digest,response_artifact_digest,
				evidence_digest,receipt_json,receipt_bytes
			) VALUES ($1,$2,$3,'attempt.v32',$4,0,'turn-invocation.v32','completed','not-dispatched',TRUE,$5,$6,$7,$8,
				'{}'::jsonb,$9)`,
				[]any{namespaceID, planDigest, strings.Repeat("a", 40), descriptorDigest,
					evaluationMigrationDigest("0"), evaluationMigrationDigest("1"), responseDigest,
					evaluationMigrationDigest("2"), []byte("{}")}},
		}
		for _, statement := range turnStatements {
			if _, err := db.ExecContext(ctx, statement.query, statement.args...); err != nil {
				t.Fatalf("seed v32 terminal turn authority: %v\n%s", err, statement.query)
			}
		}
	}
	return namespaceID, planDigest
}

func TestAgentEvaluationAuthenticityV3PopulatedPostgreSQLUpgrade(t *testing.T) {
	db := openPIRWireMigrationPostgreSQL(t)
	resetAgentEvaluationMigrationSchemaAtV32(t, db)
	namespaceID, planDigest := seedPopulatedAgentEvaluationV32(t, db, true)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	if err := RunMigrations(ctx, db, 2*time.Minute); err != nil {
		t.Fatalf("upgrade populated v32 schema to current: %v", err)
	}
	var candidateCount, mappingCount int64
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_evaluation_review_candidates
		WHERE namespace_id=$1 AND plan_digest=$2`, namespaceID, planDigest).Scan(&candidateCount); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_evaluation_blind_review_mappings
		WHERE namespace_id=$1 AND plan_digest=$2`, namespaceID, planDigest).Scan(&mappingCount); err != nil {
		t.Fatal(err)
	}
	if candidateCount != 1 || mappingCount != 1 {
		t.Fatalf("populated authority was not preserved: candidates=%d mappings=%d", candidateCount, mappingCount)
	}
	var v33Applied bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=33)`).Scan(&v33Applied); err != nil {
		t.Fatal(err)
	}
	if !v33Applied {
		t.Fatal("v33 migration was not recorded after a valid populated upgrade")
	}
}

func TestAgentEvaluationAuthenticityV3PreflightRejectsUnboundCandidatePostgreSQL(t *testing.T) {
	db := openPIRWireMigrationPostgreSQL(t)
	resetAgentEvaluationMigrationSchemaAtV32(t, db)
	namespaceID, planDigest := seedPopulatedAgentEvaluationV32(t, db, false)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	err := RunMigrations(ctx, db, 2*time.Minute)
	if err == nil || !strings.Contains(err.Error(), "lack exact v32 terminal turn authority") {
		t.Fatalf("unbound populated v32 upgrade did not fail with its exact preflight: %v", err)
	}
	var candidateCount int64
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_evaluation_review_candidates
		WHERE namespace_id=$1 AND plan_digest=$2`, namespaceID, planDigest).Scan(&candidateCount); err != nil {
		t.Fatal(err)
	}
	var v33Applied bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=33)`).Scan(&v33Applied); err != nil {
		t.Fatal(err)
	}
	if candidateCount != 1 || v33Applied {
		t.Fatalf("failed v33 preflight mutated authority: candidates=%d applied=%v", candidateCount, v33Applied)
	}
}
