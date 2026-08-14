package database

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"
)

func rewindAgentEvaluationFinalizationAuthorityMigrations(
	t *testing.T,
	ctx context.Context,
	database *sql.DB,
) {
	t.Helper()
	for _, statement := range []string{
		`DROP TABLE IF EXISTS agent_evaluation_evidence_root_v45_roots CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_authority_attestation_v45_roots CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_capability_effect_input_authority_registry_receipts CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_capability_effect_current_turn_events CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_capability_effect_request_ref_authorities CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_owner_state_cas_artifacts CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_owner_state_operations CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_owner_states CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_provider_capability_observation_commit_links CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_capability_specific_receipts CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_provider_capability_observation_receipts CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_optional_fact_authorities CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_optional_capability_fact_sources CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_plan_capability_probe_admission_links CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_capability_probe_reference_receipts CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_capability_probe_response_spools CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_capability_probe_admissions CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_runtime_fact_source_owner_registrations CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_attempt_authority_commit_links CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_attempt_authority_owner_receipts CASCADE`,
		`DROP TRIGGER agent_evaluation_authority_attestations_v45_roots_required
			ON agent_evaluation_authority_attestations`,
		`DROP TRIGGER agent_evaluation_authority_attestations_v45_insert
			ON agent_evaluation_authority_attestations`,
		`DROP TRIGGER agent_evaluation_evidence_roots_v45_roots_required
			ON agent_evaluation_evidence_roots`,
		`DROP TRIGGER agent_evaluation_evidence_roots_v45_insert
			ON agent_evaluation_evidence_roots`,
		`DROP TRIGGER agent_evaluation_plans_capability_probe_links_required
			ON agent_evaluation_plans`,
		`DROP TRIGGER agent_evaluation_plans_runtime_fact_source_registrations_required
			ON agent_evaluation_plans`,
		`DROP FUNCTION require_agent_evaluation_evidence_root_v45_roots()`,
		`DROP FUNCTION require_agent_evaluation_attestation_v45_roots()`,
		`DROP FUNCTION enforce_agent_evaluation_evidence_root_v45_roots_binding()`,
		`DROP FUNCTION enforce_agent_evaluation_attestation_v45_roots_binding()`,
		`DROP FUNCTION enforce_agent_evaluation_v45_publication_insert()`,
		`DROP FUNCTION enforce_agent_evaluation_provider_observation_commit_link_binding()`,
		`DROP FUNCTION enforce_agent_evaluation_attempt_authority_commit_link_binding()`,
		`DROP FUNCTION enforce_agent_evaluation_capability_specific_observation_binding()`,
		`DROP FUNCTION enforce_agent_evaluation_provider_capability_observation_binding()`,
		`DROP FUNCTION enforce_agent_evaluation_optional_fact_transition()`,
		`DROP FUNCTION enforce_agent_evaluation_optional_fact_source_reference()`,
		`DROP FUNCTION enforce_agent_evaluation_optional_fact_capacity()`,
		`DROP FUNCTION enforce_agent_evaluation_optional_capability_fact_source_binding()`,
		`DROP FUNCTION require_agent_evaluation_plan_capability_probe_links()`,
		`DROP FUNCTION enforce_agent_evaluation_plan_capability_probe_link()`,
		`DROP FUNCTION reject_agent_evaluation_capability_probe_spool_linked_insert()`,
		`DROP FUNCTION require_agent_evaluation_capability_probe_reference_parent()`,
		`DROP FUNCTION require_agent_evaluation_capability_probe_reference_set()`,
		`DROP FUNCTION enforce_agent_evaluation_capability_probe_reference_binding()`,
		`DROP FUNCTION enforce_agent_evaluation_capability_probe_response_spool_binding()`,
		`DROP FUNCTION enforce_agent_evaluation_capability_probe_admission_transition()`,
		`DROP FUNCTION require_agent_evaluation_plan_runtime_fact_source_registrations()`,
		`DROP FUNCTION enforce_agent_evaluation_runtime_fact_source_registration_transition()`,
		`DROP FUNCTION enforce_agent_evaluation_runtime_fact_source_registration_capacity()`,
		`DROP FUNCTION enforce_agent_evaluation_attempt_authority_owner_receipt_binding()`,
		`ALTER TABLE agent_evaluation_authority_attestations
			DROP COLUMN v45_eligible`,
		`ALTER TABLE agent_evaluation_evidence_roots
			DROP CONSTRAINT agent_evaluation_evidence_roots_v45_exact_identity_key,
			DROP COLUMN v45_eligible`,
		`ALTER TABLE agent_evaluation_controlled_authority_requests
			DROP CONSTRAINT agent_evaluation_controlled_authority_v45_stage_check,
			DROP CONSTRAINT agent_evaluation_controlled_authority_v45_response_check,
			DROP CONSTRAINT agent_eval_controlled_authority_v45_g3_cell_admission_check,
			DROP COLUMN v45_eligible,
			DROP COLUMN stage_digest,
			DROP COLUMN dispatch_ack_digest,
			DROP COLUMN provider_capability_observation_receipt_set_digest,
			ADD CONSTRAINT agent_evaluation_controlled_authority_response_check CHECK (
				(state = 'claimed' AND response_digest IS NULL AND response_bytes IS NULL
					AND dispatched_at IS NULL AND sealed_at IS NULL)
				OR (state = 'dispatched' AND response_digest IS NULL AND response_bytes IS NULL
					AND dispatched_at IS NOT NULL AND sealed_at IS NULL)
				OR (state = 'sealed' AND response_digest IS NOT NULL AND sealed_at IS NOT NULL
					AND dispatched_at IS NOT NULL
					AND (response_bytes IS NULL OR octet_length(response_bytes) BETWEEN 1 AND 33554432))
			)`,
		`ALTER TABLE agent_evaluation_attempts
			DROP CONSTRAINT agent_evaluation_attempts_v45_exact_identity_key`,
		`DELETE FROM schema_migrations WHERE version=45`,
		`DROP TABLE IF EXISTS agent_evaluation_validated_human_metric_observations CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_validated_human_metric_observation_sets CASCADE`,
		`DROP TABLE IF EXISTS agent_evaluation_finalization_intents CASCADE`,
		`ALTER TABLE agent_evaluation_finalizations
			DROP CONSTRAINT agent_evaluation_finalizations_human_metric_digest_check,
			DROP COLUMN validated_human_metric_observation_set_digest`,
		`DELETE FROM schema_migrations WHERE version=44`,
	} {
		if _, err := database.ExecContext(ctx, statement); err != nil {
			t.Fatalf("rewind isolated v44 statement: %v", err)
		}
	}
	restoredStatements := 0
	for _, statement := range agentEvaluationControlledAuthorityMigration().statements {
		trimmed := strings.TrimSpace(statement)
		if strings.HasPrefix(trimmed,
			"CREATE OR REPLACE FUNCTION enforce_agent_evaluation_controlled_authority_transition()") ||
			strings.HasPrefix(trimmed,
				"DROP TRIGGER IF EXISTS agent_evaluation_controlled_authority_transition") ||
			strings.HasPrefix(trimmed,
				"CREATE TRIGGER agent_evaluation_controlled_authority_transition") {
			if _, err := database.ExecContext(ctx, statement); err != nil {
				t.Fatalf("restore recorded v41 controlled-authority transition: %v", err)
			}
			restoredStatements++
		}
	}
	if restoredStatements != 3 {
		t.Fatalf("restored %d recorded v41 controlled-authority statements, want 3", restoredStatements)
	}
}

func TestAgentEvaluationFinalizationAuthorityMigrationPostgreSQLV43Upgrade(t *testing.T) {
	db := openPIRWireMigrationPostgreSQL(t)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	// The helper creates an isolated disposable schema. Rewind v45 first and
	// then v44 so the second migration run starts at the exact already-deployed
	// v43 boundary and proves the subsequent upgrade remains ordered.
	rewindAgentEvaluationFinalizationAuthorityMigrations(t, ctx, db)
	if err := runMigrations(ctx, db, []migration{agentEvaluationFinalizationAuthorityMigration()}, 2*time.Minute); err != nil {
		t.Fatalf("upgrade isolated v43 schema to v44: %v", err)
	}

	for _, table := range []string{
		"agent_evaluation_validated_human_metric_observation_sets",
		"agent_evaluation_validated_human_metric_observations",
		"agent_evaluation_finalization_intents",
	} {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, table).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("v44 table %q was not installed", table)
		}
	}
	var columnRequired bool
	if err := db.QueryRowContext(ctx, `SELECT is_nullable='NO'
		FROM information_schema.columns
		WHERE table_schema=current_schema()
		  AND table_name='agent_evaluation_finalizations'
		  AND column_name='validated_human_metric_observation_set_digest'`).Scan(&columnRequired); err != nil {
		t.Fatal(err)
	}
	if !columnRequired {
		t.Fatal("v44 finalization human metric digest column is nullable")
	}
	var versionRecorded bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM schema_migrations
		WHERE version=44 AND name='g4-agent-evaluation-finalization-authority'
	)`).Scan(&versionRecorded); err != nil {
		t.Fatal(err)
	}
	if !versionRecorded {
		t.Fatal("v44 migration was not recorded")
	}
}

func TestAgentEvaluationFinalizationAuthorityMigrationPostgreSQLRejectsPopulatedV43(t *testing.T) {
	db := openPIRWireMigrationPostgreSQL(t)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	rewindAgentEvaluationFinalizationAuthorityMigrations(t, ctx, db)

	namespaceID := "migration-v43-finalized"
	planDigest := "sha256-" + strings.Repeat("1", 64)
	repositoryCommit := strings.Repeat("a", 40)
	digest := "sha256-" + strings.Repeat("2", 64)
	plannedAt := time.Date(2026, 8, 8, 1, 2, 3, 0, time.UTC)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_plans (
		namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
		plan_json,plan_bytes,planned_at,expires_at
	) VALUES ($1,'plan.v43-finalized',$2,$3,11640,'{}'::jsonb,$4,$5,$6)`,
		namespaceID, planDigest, repositoryCommit, []byte("{}"), plannedAt, plannedAt.Add(24*time.Hour)); err != nil {
		t.Fatalf("seed populated v43 plan: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_finalizations (
		namespace_id,plan_digest,repository_commit,review_lease_digest,
		validated_human_review_artifact_digest,metric_report_digest,grader_report_digest,
		human_review_report_digest,holdout_execution_receipt_digest,manifest_digest,
		report_digest,report_bytes,completed_at
	) VALUES ($1,$2,$3,$4,$4,$4,$4,$4,$4,$4,$4,$5,$6)`,
		namespaceID, planDigest, repositoryCommit, digest, []byte("{}"), plannedAt.Add(time.Hour)); err != nil {
		t.Fatalf("seed populated v43 finalization: %v", err)
	}

	err := runMigrations(ctx, db, []migration{agentEvaluationFinalizationAuthorityMigration()}, 2*time.Minute)
	if err == nil || !strings.Contains(err.Error(), "existing finalization lacks validated human metric authority") {
		t.Fatalf("populated v43 upgrade error = %v, want fail-closed human authority preflight", err)
	}
	var versionRecorded, columnExists, setTableExists bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM schema_migrations WHERE version=44
	)`).Scan(&versionRecorded); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema=current_schema() AND table_name='agent_evaluation_finalizations'
		  AND column_name='validated_human_metric_observation_set_digest'
	)`).Scan(&columnExists); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT to_regclass(
		'agent_evaluation_validated_human_metric_observation_sets'
	) IS NOT NULL`).Scan(&setTableExists); err != nil {
		t.Fatal(err)
	}
	if versionRecorded || columnExists || setTableExists {
		t.Fatalf("failed v44 migration left partial authority state: version=%v column=%v table=%v",
			versionRecorded, columnExists, setTableExists)
	}
}
