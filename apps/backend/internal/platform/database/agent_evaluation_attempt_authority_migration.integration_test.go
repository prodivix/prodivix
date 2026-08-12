package database

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

type v41AttemptAuthorityFixture struct {
	namespaceID               string
	planDigest                string
	repositoryCommit          string
	attemptID                 string
	descriptorDigest          string
	providerRequestDigest     string
	workspaceRequestDigest    string
	ownerImplementationDigest string
	claimedAt                 time.Time
}

func attemptAuthorityMigrationDigest(label string) string {
	digest := sha256.Sum256([]byte(label))
	return "sha256-" + hex.EncodeToString(digest[:])
}

func attemptAuthorityMigrationCanonicalBytes(t *testing.T, value any) []byte {
	t.Helper()
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatalf("encode canonical migration fixture: %v", err)
	}
	return encoded
}

func attemptAuthorityMigrationCanonicalDigest(t *testing.T, value any) string {
	t.Helper()
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatalf("digest canonical migration fixture: %v", err)
	}
	return digest
}

func attemptAuthorityMigrationSelfDigest(t *testing.T, value map[string]any, key string) string {
	t.Helper()
	digest := attemptAuthorityMigrationCanonicalDigest(t, value)
	value[key] = digest
	return digest
}

func seedV41AttemptAuthorityFixture(t *testing.T, db *sql.DB, providerState string) v41AttemptAuthorityFixture {
	t.Helper()
	fixture := v41AttemptAuthorityFixture{
		namespaceID:               "namespace.v41.attempt-authority",
		planDigest:                attemptAuthorityMigrationDigest("v41-plan"),
		repositoryCommit:          strings.Repeat("a", 40),
		attemptID:                 "attempt-v41-upgrade",
		descriptorDigest:          attemptAuthorityMigrationDigest("v41-descriptor"),
		providerRequestDigest:     attemptAuthorityMigrationDigest("v41-provider-request"),
		workspaceRequestDigest:    attemptAuthorityMigrationDigest("v41-workspace-request"),
		ownerImplementationDigest: attemptAuthorityMigrationDigest("v41-owner-implementation"),
		claimedAt:                 time.Date(2026, time.August, 9, 1, 2, 3, 0, time.UTC),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_plans (
		namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
		plan_json,plan_bytes,planned_at,expires_at
	) VALUES ($1,$2,$3,$4,11640,$5::jsonb,$6,$7,$8)`, fixture.namespaceID,
		"plan-v41-attempt-authority", fixture.planDigest, fixture.repositoryCommit,
		`{"fixture":"v41-attempt-authority"}`, []byte(`{"fixture":"v41-attempt-authority"}`),
		fixture.claimedAt.Add(-time.Hour), fixture.claimedAt.Add(24*time.Hour)); err != nil {
		t.Fatalf("seed v41 evaluation plan: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,state,claim_generation,claimed_at
	) VALUES ($1,$2,$3,'controlled-workspace','workspace.prepare','loopback-v41',$4,$5,'claimed',1,$6)`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, fixture.workspaceRequestDigest,
		attemptAuthorityMigrationDigest("v41-workspace-binding"), fixture.claimedAt); err != nil {
		t.Fatalf("seed recoverable v41 workspace authority: %v", err)
	}
	var dispatchedAt any
	if providerState == "dispatched" {
		dispatchedAt = fixture.claimedAt.Add(time.Second)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,grant_digest,shard_lease_owner_id,shard_lease_generation,
		verification_grant_generation,verification_grant_receipt_set_digest,state,
		claim_generation,claimed_at,dispatched_at
	) VALUES ($1,$2,$3,'provider-capability','tool.execute','loopback-v41',$4,$5,$6,$7,
		$8,$9,'lease-owner-v41',1,1,$10,$11,1,$12,$13)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, fixture.providerRequestDigest,
		attemptAuthorityMigrationDigest("v41-provider-binding"), fixture.ownerImplementationDigest,
		fixture.attemptID, fixture.descriptorDigest, attemptAuthorityMigrationDigest("v41-grant"),
		attemptAuthorityMigrationDigest("v41-verification-grant-set"), providerState,
		fixture.claimedAt, dispatchedAt); err != nil {
		t.Fatalf("seed v41 provider authority in state %q: %v", providerState, err)
	}
	return fixture
}

func seedV41G3CellAdmissionFixture(
	t *testing.T,
	db *sql.DB,
	fixture v41AttemptAuthorityFixture,
) (string, string) {
	t.Helper()
	requestDigest := attemptAuthorityMigrationDigest("v41-g3-cell-admission-request")
	if _, err := db.Exec(`INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,generation,state,claim_generation,claimed_at,dispatched_at
	) VALUES ($1,$2,$3,'controlled-workspace','verification.cell.admit','g3-cell-admission',
		$4,$5,$6,'attempt-v41-g3-cell',$7,1,'dispatched',1,$8,$9)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, requestDigest,
		attemptAuthorityMigrationDigest("v41-g3-cell-admission-binding"),
		attemptAuthorityMigrationDigest("v41-g3-cell-admission-owner"),
		attemptAuthorityMigrationDigest("v41-g3-cell-admission-descriptor"), fixture.claimedAt,
		fixture.claimedAt.Add(1500*time.Millisecond)); err != nil {
		t.Fatalf("seed dispatched v41 G3 cell admission: %v", err)
	}
	malformedClaimedRequestDigest := attemptAuthorityMigrationDigest("v41-g3-cell-admission-malformed-claim")
	if _, err := db.Exec(`INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,state,claim_generation,claimed_at
	) VALUES ($1,$2,$3,'controlled-workspace','verification.cell.admit','g3-cell-admission',
		$4,$5,'claimed',1,$6)`, fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit,
		malformedClaimedRequestDigest,
		attemptAuthorityMigrationDigest("v41-g3-cell-admission-malformed-binding"), fixture.claimedAt); err != nil {
		t.Fatalf("seed legally populated v41 G3 claim without current binding: %v", err)
	}
	return requestDigest, malformedClaimedRequestDigest
}

func seedV41LegacyOwnerStatefulFixture(
	t *testing.T,
	db *sql.DB,
	fixture v41AttemptAuthorityFixture,
) string {
	t.Helper()
	requestDigest := attemptAuthorityMigrationDigest("v41-owner-state-request")
	if _, err := db.Exec(`INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,grant_digest,generation,state,claim_generation,claimed_at
	) VALUES ($1,$2,$3,'controlled-workspace','session.load-or-reattach','sessions/load-or-reattach',
		$4,$5,$6,'attempt-v41-owner-state',$7,$8,1,'claimed',1,$9)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, requestDigest,
		attemptAuthorityMigrationDigest("v41-owner-state-binding"),
		attemptAuthorityMigrationDigest("v41-owner-state-implementation"),
		attemptAuthorityMigrationDigest("v41-owner-state-descriptor"),
		attemptAuthorityMigrationDigest("v41-owner-state-grant"), fixture.claimedAt); err != nil {
		t.Fatalf("seed legal v41 owner-state claim: %v", err)
	}
	return requestDigest
}

func seedV41LegacyPublication(t *testing.T, db *sql.DB, fixture v41AttemptAuthorityFixture) string {
	t.Helper()
	attestationDigest := attemptAuthorityMigrationDigest("v41-legacy-attestation")
	rootDigest := attemptAuthorityMigrationDigest("v41-legacy-root")
	if err := insertEvaluationPublicationFixture(
		t, db, "agent_evaluation_authority_attestations", fixture,
		attestationDigest, rootDigest, nil,
	); err != nil {
		t.Fatalf("seed populated v41 authority attestation: %v", err)
	}
	if err := insertEvaluationPublicationFixture(
		t, db, "agent_evaluation_evidence_roots", fixture,
		attestationDigest, rootDigest, nil,
	); err != nil {
		t.Fatalf("seed populated v41 evidence root: %v", err)
	}
	return attestationDigest
}

func insertEvaluationPublicationFixture(
	t *testing.T,
	db *sql.DB,
	table string,
	fixture v41AttemptAuthorityFixture,
	attestationDigest string,
	rootDigest string,
	v45Eligible *bool,
) error {
	t.Helper()
	rows, err := db.Query(`SELECT column_name,data_type
		FROM information_schema.columns
		WHERE table_schema=current_schema() AND table_name=$1
		ORDER BY ordinal_position`, table)
	if err != nil {
		return fmt.Errorf("read %s columns: %w", table, err)
	}
	columns := make([]string, 0, 48)
	expressions := make([]string, 0, 48)
	arguments := make([]any, 0, 48)
	for rows.Next() {
		var column, dataType string
		if err := rows.Scan(&column, &dataType); err != nil {
			_ = rows.Close()
			return err
		}
		if column == "v45_eligible" && v45Eligible == nil {
			continue
		}
		columns = append(columns, pgx.Identifier{column}.Sanitize())
		placeholder := fmt.Sprintf("$%d", len(arguments)+1)
		var value any
		switch dataType {
		case "text":
			switch column {
			case "namespace_id":
				value = fixture.namespaceID
			case "plan_digest":
				value = fixture.planDigest
			case "repository_commit":
				value = fixture.repositoryCommit
			case "attestation_digest", "authority_attestation_digest":
				value = attestationDigest
			case "root_digest":
				value = rootDigest
			case "bundle_digest":
				value = attemptAuthorityMigrationDigest("v41-legacy-bundle")
			default:
				if strings.HasSuffix(column, "_digest") {
					value = attemptAuthorityMigrationDigest("v41-legacy-" + column)
				} else {
					value = "v41-legacy-" + strings.ReplaceAll(column, "_", "-")
				}
			}
		case "jsonb":
			value = `{"legacy":"v41"}`
			placeholder += "::jsonb"
		case "bytea":
			value = []byte(`{"legacy":"v41"}`)
		case "bigint":
			value = int64(1)
		case "boolean":
			if v45Eligible == nil {
				_ = rows.Close()
				return fmt.Errorf("unsupported defaultless %s.%s boolean", table, column)
			}
			value = *v45Eligible
		case "timestamp with time zone":
			value = fixture.claimedAt.Add(5 * time.Minute)
		default:
			_ = rows.Close()
			return fmt.Errorf("unsupported %s.%s migration fixture type %q", table, column, dataType)
		}
		expressions = append(expressions, placeholder)
		arguments = append(arguments, value)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	statement := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		pgx.Identifier{table}.Sanitize(), strings.Join(columns, ","), strings.Join(expressions, ","))
	_, err = db.Exec(statement, arguments...)
	return err
}

func openAgentEvaluationMigrationPostgreSQLAtVersion(t *testing.T, maximumVersion int64) *sql.DB {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv(pirWireMigrationPostgreSQLTestURL))
	if databaseURL == "" {
		t.Skipf("set %s to run the real PostgreSQL attempt-authority migration Gate", pirWireMigrationPostgreSQLTestURL)
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
	if _, err := rand.Read(suffix[:]); err != nil {
		_ = admin.Close()
		t.Fatal(err)
	}
	schema := "prodivix_attempt_authority_migration_" + hex.EncodeToString(suffix[:])
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		_ = admin.Close()
		t.Fatalf("create PostgreSQL integration schema: %v", err)
	}
	testConfig := adminConfig.Copy()
	if testConfig.RuntimeParams == nil {
		testConfig.RuntimeParams = make(map[string]string)
	}
	testConfig.RuntimeParams["search_path"] = schema
	db := stdlib.OpenDB(*testConfig)
	t.Cleanup(func() {
		_ = db.Close()
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()
		_, _ = admin.ExecContext(cleanupCtx, "DROP SCHEMA IF EXISTS "+quotedSchema+" CASCADE")
		_ = admin.Close()
	})
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("connect to isolated PostgreSQL integration schema: %v", err)
	}
	all := migrationSet()
	selected := make([]migration, 0, len(all))
	for _, candidate := range all {
		if candidate.version <= maximumVersion {
			selected = append(selected, candidate)
		}
	}
	if len(selected) == 0 || selected[len(selected)-1].version != maximumVersion {
		t.Fatalf("migration version %d is not registered", maximumVersion)
	}
	if err := runMigrations(context.Background(), db, selected, 2*time.Minute); err != nil {
		t.Fatalf("migrate isolated PostgreSQL schema through v%d: %v", maximumVersion, err)
	}
	return db
}

func assertAgentEvaluationAttemptAuthorityV45Schema(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, table := range []string{
		"agent_evaluation_controlled_authority_requests",
		"agent_evaluation_attempt_authority_owner_receipts",
		"agent_evaluation_runtime_fact_source_owner_registrations",
		"agent_evaluation_capability_probe_admissions",
		"agent_evaluation_capability_probe_response_spools",
		"agent_evaluation_capability_probe_reference_receipts",
		"agent_evaluation_plan_capability_probe_admission_links",
		"agent_evaluation_capability_probe_provider_resource_registrations",
		"agent_evaluation_capability_probe_provider_resource_manifests",
		"agent_evaluation_capability_probe_provider_resource_content_upload_receipts",
		"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts",
		"agent_evaluation_capability_probe_provider_resource_cleanups",
		"agent_evaluation_capability_probe_provider_resource_cleanup_receipts",
		"agent_evaluation_owner_states",
		"agent_evaluation_owner_state_operations",
		"agent_evaluation_owner_state_cas_artifacts",
		"agent_evaluation_optional_capability_fact_sources",
		"agent_evaluation_optional_fact_authorities",
		"agent_evaluation_native_optional_capability_bootstrap_sources",
		"agent_evaluation_native_provider_state_vault_records",
		"agent_evaluation_native_provider_state_vault_recoveries",
		"agent_evaluation_production_run_config_artifacts",
		"agent_evaluation_capability_effect_request_ref_authorities",
		"agent_evaluation_capability_effect_current_turn_events",
		"agent_evaluation_capability_effect_input_authority_registry_receipts",
		"agent_evaluation_capability_effect_provider_journal_stages",
		"agent_evaluation_capability_effect_provider_journal_executions",
		"agent_evaluation_capability_effect_provider_journal_spool_payloads",
		"agent_evaluation_capability_effect_provider_journal_spool_dispositions",
		"agent_evaluation_capability_effect_provider_journal_results",
		"agent_evaluation_capability_effect_provider_journal_abandonments",
		"agent_evaluation_capability_effect_provider_journal_cleanup_requests",
		"agent_evaluation_capability_effect_provider_journal_cleanup_receipts",
		"agent_evaluation_capability_effect_source_consumption_claims",
		"agent_evaluation_hosted_retrieval_runtime_resource_registration_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_registration_results",
		"agent_evaluation_hosted_retrieval_runtime_resource_sets",
		"agent_evaluation_hosted_retrieval_runtime_resources",
		"agent_evaluation_hosted_retrieval_runtime_resource_read_receipts",
		"agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots",
		"agent_evaluation_hosted_retrieval_runtime_resource_overdue_receipts",
		"agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences",
		"agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims",
		"agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_cleanups",
		"agent_evaluation_hosted_retrieval_runtime_resource_cleanup_archives",
		"agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts",
		"agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_receipts",
		"agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots",
		"agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages",
		"agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts",
		"agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts",
		"agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers",
		"agent_evaluation_provider_capability_observation_receipts",
		"agent_evaluation_capability_specific_receipts",
		"agent_evaluation_attempt_authority_commit_links",
		"agent_evaluation_provider_capability_observation_commit_links",
		"agent_evaluation_authority_attestation_v45_roots",
		"agent_evaluation_evidence_root_v45_roots",
	} {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, table).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("v45 table %q was not installed", table)
		}
	}
	var citationNullable bool
	if err := db.QueryRowContext(ctx, `SELECT is_nullable='YES'
		FROM information_schema.columns
		WHERE table_schema=current_schema()
			AND table_name='agent_evaluation_capability_effect_provider_journal_executions'
			AND column_name='retrieval_citation_resource_id'`).Scan(&citationNullable); err != nil {
		t.Fatalf("read Provider journal retrieval citation column: %v", err)
	}
	if !citationNullable {
		t.Fatal("Provider journal retrieval citation column is missing or not nullable")
	}
	var ownerSummaryInstalled bool
	if err := db.QueryRowContext(ctx, `SELECT to_regprocedure(
		'agent_evaluation_hosted_runtime_resource_owner_storage_summary(text,timestamp with time zone)'
	) IS NOT NULL`).Scan(&ownerSummaryInstalled); err != nil {
		t.Fatalf("read hosted runtime owner summary function: %v", err)
	}
	if !ownerSummaryInstalled {
		t.Fatal("hosted runtime owner summary function was not installed")
	}
	var currentClaimTarget string
	if err := db.QueryRowContext(ctx, `SELECT confrelid::regclass::text
		FROM pg_constraint
		WHERE conrelid='agent_evaluation_hosted_retrieval_runtime_resources'::regclass
			AND conname='agent_eval_hosted_runtime_resource_current_claim_fk'`).Scan(
		&currentClaimTarget,
	); err != nil {
		t.Fatalf("read hosted runtime current claim foreign key: %v", err)
	}
	if !strings.HasSuffix(currentClaimTarget,
		"agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts") {
		t.Fatalf("hosted runtime current claim points to %q", currentClaimTarget)
	}
	for _, trigger := range []string{
		"agent_eval_hosted_runtime_fence_derive_receipt_required",
		"agent_eval_hosted_runtime_post_matrix_claim_receipt_required",
		"agent_eval_hosted_runtime_recovery_claim_receipt_required",
		"agent_eval_hosted_runtime_cleanup_claim_receipt_cas_required",
		"agent_eval_hosted_runtime_cleanup_result_read_receipt_required",
	} {
		var installed bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM pg_trigger WHERE tgname=$1 AND NOT tgisinternal
		)`, trigger).Scan(&installed); err != nil {
			t.Fatalf("read hosted runtime v5 trigger %s: %v", trigger, err)
		}
		if !installed {
			t.Fatalf("hosted runtime v5 trigger %q was not installed", trigger)
		}
	}
	var runConfigArtifactColumnCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.columns
		WHERE table_schema=current_schema()
			AND table_name='agent_evaluation_production_run_config_artifacts'`).
		Scan(&runConfigArtifactColumnCount); err != nil {
		t.Fatalf("read production run-config artifact columns: %v", err)
	}
	if runConfigArtifactColumnCount != 14 {
		t.Fatalf("production run-config artifact columns=%d, want 14", runConfigArtifactColumnCount)
	}
	for table, want := range map[string]int{
		"agent_evaluation_capability_probe_provider_resource_registrations":               41,
		"agent_evaluation_capability_probe_provider_resource_manifests":                   7,
		"agent_evaluation_capability_probe_provider_resource_content_upload_receipts":     7,
		"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts": 7,
		"agent_evaluation_capability_probe_provider_resource_cleanups":                    26,
		"agent_evaluation_capability_probe_provider_resource_cleanup_receipts":            7,
		"agent_evaluation_native_optional_capability_bootstrap_sources":                   60,
		"agent_evaluation_native_provider_state_vault_records":                            55,
		"agent_evaluation_native_provider_state_vault_recoveries":                         16,
	} {
		var got int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.columns
			WHERE table_schema=current_schema() AND table_name=$1`, table).Scan(&got); err != nil {
			t.Fatalf("read %s columns: %v", table, err)
		}
		if got != want {
			t.Fatalf("%s columns=%d, want %d", table, got, want)
		}
	}
	for _, table := range []string{
		"agent_evaluation_holdout_closures",
		"agent_evaluation_archive_closures",
	} {
		for _, column := range []string{
			"run_config_artifact_binding_digest",
			"run_config_artifact_binding_json",
			"run_config_artifact_binding_bytes",
		} {
			var required bool
			if err := db.QueryRowContext(ctx, `SELECT is_nullable='NO'
				FROM information_schema.columns
				WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2`,
				table, column).Scan(&required); err != nil {
				t.Fatalf("read run-config artifact binding column %s.%s: %v", table, column, err)
			}
			if !required {
				t.Fatalf("run-config artifact binding column %s.%s remains nullable", table, column)
			}
		}
		var pathColumnCount, bindingForeignKeyCount int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.columns
			WHERE table_schema=current_schema() AND table_name=$1 AND column_name='source_config_path'`,
			table).Scan(&pathColumnCount); err != nil {
			t.Fatalf("read legacy source-config path column %s: %v", table, err)
		}
		if pathColumnCount != 0 {
			t.Fatalf("legacy source-config path remains authoritative on %s", table)
		}
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pg_constraint
			WHERE conrelid=to_regclass($1) AND contype='f'
				AND confrelid='agent_evaluation_production_run_config_artifacts'::regclass`,
			table).Scan(&bindingForeignKeyCount); err != nil {
			t.Fatalf("read run-config artifact binding FK %s: %v", table, err)
		}
		if bindingForeignKeyCount != 1 {
			t.Fatalf("run-config artifact binding FK count %s=%d, want 1", table, bindingForeignKeyCount)
		}
	}
	var controlledEligibilityRequired, controlledEligibilityDefaultsCurrent bool
	if err := db.QueryRowContext(ctx, `SELECT is_nullable='NO',column_default LIKE 'true%'
		FROM information_schema.columns
		WHERE table_schema=current_schema()
			AND table_name='agent_evaluation_controlled_authority_requests'
			AND column_name='v45_eligible'`).
		Scan(&controlledEligibilityRequired, &controlledEligibilityDefaultsCurrent); err != nil {
		t.Fatalf("read controlled-authority v45 eligibility: %v", err)
	}
	if !controlledEligibilityRequired || !controlledEligibilityDefaultsCurrent {
		t.Fatal("controlled-authority v45 eligibility is not strict/current by default")
	}
	for _, table := range []string{"agent_evaluation_authority_attestations", "agent_evaluation_evidence_roots"} {
		var required, defaultsCurrent bool
		if err := db.QueryRowContext(ctx, `SELECT is_nullable='NO',column_default LIKE 'true%'
			FROM information_schema.columns
			WHERE table_schema=current_schema() AND table_name=$1 AND column_name='v45_eligible'`,
			table).Scan(&required, &defaultsCurrent); err != nil {
			t.Fatalf("read v45 eligibility column %s: %v", table, err)
		}
		if !required || !defaultsCurrent {
			t.Fatalf("v45 eligibility column %s is not strict/current by default", table)
		}
	}
	for _, table := range []string{
		"agent_evaluation_authority_attestation_v45_roots",
		"agent_evaluation_evidence_root_v45_roots",
	} {
		for _, column := range []string{
			"attempt_authority_owner_receipt_set_digest",
			"provider_capability_observation_receipt_set_digest",
			"capability_specific_receipt_set_digest",
			"validated_human_metric_observation_set_digest",
			"capability_probe_admission_set_digest",
			"capability_probe_reference_receipt_set_digest",
			"runtime_fact_source_owner_registration_set_digest",
			"capability_probe_provider_resource_cleanup_set_digest",
			"optional_capability_fact_source_set_digest",
			"optional_capability_fact_authority_set_digest",
			"created_at",
		} {
			var required bool
			if err := db.QueryRowContext(ctx, `SELECT is_nullable='NO'
				FROM information_schema.columns
				WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2`, table, column).Scan(&required); err != nil {
				t.Fatalf("read v45 extension column %s.%s: %v", table, column, err)
			}
			if !required {
				t.Fatalf("v45 extension column %s.%s remains nullable", table, column)
			}
		}
	}
	var misplacedRootColumnCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_schema=current_schema()
			AND table_name IN ('agent_evaluation_authority_attestations','agent_evaluation_evidence_roots')
			AND column_name IN (
				'attempt_authority_owner_receipt_set_digest',
				'provider_capability_observation_receipt_set_digest',
				'capability_specific_receipt_set_digest',
				'validated_human_metric_observation_set_digest',
				'capability_probe_admission_set_digest',
				'capability_probe_reference_receipt_set_digest',
				'runtime_fact_source_owner_registration_set_digest',
				'capability_probe_provider_resource_cleanup_set_digest',
				'optional_capability_fact_source_set_digest',
				'optional_capability_fact_authority_set_digest'
			)`).Scan(&misplacedRootColumnCount); err != nil {
		t.Fatalf("read v45 base publication columns: %v", err)
	}
	if misplacedRootColumnCount != 0 {
		t.Fatalf("v45 authority roots leaked into %d legacy base publication columns", misplacedRootColumnCount)
	}
	for _, column := range []string{
		"selected_runtime_fact_envelope_set_digest",
		"source_authority_set_digest",
	} {
		var required bool
		if err := db.QueryRowContext(ctx, `SELECT is_nullable='NO'
			FROM information_schema.columns
			WHERE table_schema=current_schema()
				AND table_name='agent_evaluation_provider_capability_observation_receipts'
				AND column_name=$1`, column).Scan(&required); err != nil {
			t.Fatalf("read v45 provider-observation authority root %s: %v", column, err)
		}
		if !required {
			t.Fatalf("v45 provider-observation authority root %s remains nullable", column)
		}
	}
	var generatedObservationReference bool
	if err := db.QueryRowContext(ctx, `SELECT is_generated='ALWAYS'
		FROM information_schema.columns
		WHERE table_schema=current_schema()
			AND table_name='agent_evaluation_capability_specific_receipts'
			AND column_name='provider_capability_observation_receipt_digest'`).
		Scan(&generatedObservationReference); err != nil {
		t.Fatalf("read v45 generated provider-observation reference: %v", err)
	}
	if !generatedObservationReference {
		t.Fatal("v45 capability-specific provider-observation reference is not generated from receipt_json")
	}
	for table, fragments := range map[string][]string{
		"agent_evaluation_capability_probe_admissions": {
			"UNIQUE (namespace_id, repository_commit, evidence_digest)",
			"state = ANY",
			"minimum_expires_at",
			"reference_bundle_bytes",
			"262144",
		},
		"agent_evaluation_runtime_fact_source_owner_registrations": {
			"shared-durable-capability",
			"registration_receipt_digest",
			"owner_health_bytes",
			"receipt_bytes",
			"65536",
			"8 days",
			"registered_at >= claimed_at",
			"g4-provider-background-job",
			"sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195",
			"g4-provider-hosted-retrieval-core",
			"sha256-666c6df670c77605562ff82765013291f99045f36edcb8db0af209267c91565d",
			"g4-provider-hosted-retrieval-document",
			"sha256-8ced3fda38a88c0819a6a2d4603e453f515a9c98efadc7c270af194349c5b90e",
			"g4-provider-isolated-cache",
			"sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103",
			"g4-provider-reasoning-continuation",
			"sha256-5c84287b4c1e16fb0c1eda862a8e44754503a3fa0a4b61a16e2d2f2465072d34",
		},
		"agent_evaluation_capability_probe_reference_receipts": {
			"agent_evaluation_capability_probe_admissions",
			"ordinal",
			"source_receipt_digest",
			"receipt_bytes",
			"1048576",
		},
		"agent_evaluation_capability_probe_response_spools": {
			"agent_evaluation_capability_probe_admissions",
			"admission_request_digest",
			"[A-Za-z0-9._:@/-]{0,255}",
			"ciphertext_byte_length = octet_length(ciphertext_bytes)",
			"ciphertext_byte_length >= 1",
			"ciphertext_byte_length <= 262144",
			"response_digest",
			"transport_receipt_digest",
			"envelope_digest",
			"ciphertext_digest",
			"aad_digest",
			"encryption_profile_digest",
			"key_ref_digest",
			"expires_at > spooled_at",
		},
		"agent_evaluation_plan_capability_probe_admission_links": {
			"agent_evaluation_capability_probe_admissions",
			"agent_evaluation_plans",
			"authority_digest",
			"evidence_digest",
		},
		"agent_evaluation_capability_probe_provider_resource_registrations": {
			"gemini-interactions",
			"openai-responses",
			"g4-provider-hosted-retrieval-core",
			"g4-provider-hosted-retrieval-document",
			"result_ingress_digest",
			"result_ingress_receipt_digest",
			"resource_manifest_digest",
			"content_upload_receipt_digest",
			"deletion_authority_receipt_digest",
			"provider_resource_authority_digest",
			"registration_receipt_digest",
			"8 days",
			"262144",
			"65536",
		},
		"agent_evaluation_capability_probe_provider_resource_manifests": {
			"agent_evaluation_capability_probe_provider_resource_registrations",
			"manifest_digest",
			"receipt_bytes",
			"65536",
		},
		"agent_evaluation_capability_probe_provider_resource_content_upload_receipts": {
			"agent_evaluation_capability_probe_provider_resource_registrations",
			"content_upload_receipt_digest",
			"receipt_bytes",
			"65536",
		},
		"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts": {
			"agent_evaluation_capability_probe_provider_resource_registrations",
			"deletion_authority_receipt_digest",
			"receipt_bytes",
			"16384",
		},
		"agent_evaluation_capability_probe_provider_resource_cleanups": {
			"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts",
			"resource_registration_request_digest",
			"deletion_authority_receipt_digest",
			"cleanup_receipt_digest",
			"result_ingress_digest",
			"result_ingress_receipt_digest",
			"131072",
		},
		"agent_evaluation_capability_probe_provider_resource_cleanup_receipts": {
			"agent_evaluation_capability_probe_provider_resource_cleanups",
			"cleanup_receipt_digest",
			"receipt_bytes",
			"65536",
		},
		"agent_evaluation_optional_capability_fact_sources": {
			"agent_evaluation_plans",
			"agent_evaluation_runtime_fact_source_owner_registrations",
			"source_seal_digest",
			"source_request_digest",
			"registration_receipt_digest",
			"source_receipt_bytes",
			"source_pre_effect_intent_digest",
			"source_pre_effect_intent_json",
			"source_pre_effect_intent_bytes",
			"source_effect_receipt_digest",
			"provider_runtime_journal_result_record_digest",
			"provider_runtime_result_seal_receipt_digest",
			"source_effect_receipt_json",
			"source_effect_receipt_bytes",
			"source_effect_fact_digest",
			"native_bootstrap_source_request_digest",
			"native_bootstrap_source_receipt_digest",
			"native_provider_source_receipt_digest",
			"native_provider_source_digest",
			"v45_eligible",
			"turn_index >= 0",
			"turn_index <= 6",
		},
		"agent_evaluation_optional_fact_authorities": {
			"agent_evaluation_optional_capability_fact_sources",
			"source_seal_digest",
			"dispatch_ack_digest",
			"runtime_fact_envelope_digest",
			"source_pre_effect_intent_digest",
			"source_effect_receipt_digest",
			"source_effect_fact_digest",
		},
		"agent_evaluation_native_optional_capability_bootstrap_sources": {
			"agent_evaluation_plans",
			"agent_evaluation_runtime_fact_source_owner_registrations",
			"turn_index = 0",
			"native_provider_source_receipt_digest",
			"result_spool_aad_digest",
			"result_spool_envelope_digest",
			"runtime_fact_source_authority_digest",
			"probe_program_digest",
			"source_request_digest",
			"source_receipt_digest",
			"optional_authority_request_digest",
			"32768",
			"16384",
			"65536",
			"30 seconds",
		},
		"agent_evaluation_native_provider_state_vault_records": {
			"agent_evaluation_plans",
			"vault_owner_instance_id",
			"seal_request_json",
			"seal_receipt_json",
			"resolve_request_json",
			"resolve_receipt_json",
			"retire_request_json",
			"retirement_receipt_json",
			"forced_expiry_tombstone_digest",
			"forced_expiry_tombstone_json",
			"forced_expiry_tombstone_bytes",
			"forced_expired_at",
			"expired-unqualified",
			"maximum-lifecycle-ack-window-elapsed",
			"ciphertext_bytes",
			"wrapped_state_key_bytes",
			"125 seconds",
			"30 seconds",
			"5880",
		},
		"agent_evaluation_production_run_config_artifacts": {
			"agent_evaluation_plans",
			"binding_digest",
			"binding_json",
			"binding_bytes",
			"run_config_json",
			"run_config_bytes",
			"source_config_digest",
			"frozen_run_digest",
			"ingress_digest",
			"receipt_digest",
			"receipt_bytes",
			"16777216",
			"65536",
		},
		"agent_evaluation_capability_effect_request_ref_authorities": {
			"agent_evaluation_plans",
			"agent_evaluation_runtime_fact_source_owner_registrations",
			"agent_evaluation_provider_capability_observation_receipts",
			"selected_source_observation_receipt_digest",
			"selected_source_handle_digest",
			"expires_at <= (issued_at + '00:02:05'::interval)",
			"target_ref <> selected_source_handle_digest",
			"16384",
		},
		"agent_evaluation_capability_effect_current_turn_events": {
			"agent_evaluation_capability_effect_request_ref_authorities",
			"agent_evaluation_transport_dispatch_intents",
			"agent_evaluation_transport_receipts",
			"agent_evaluation_provider_result_spool_receipts",
			"request_ref_authority_receipt_digest",
			"normalized_events_bytes",
			"selected_event_bytes",
			"131072",
			"65536",
		},
		"agent_evaluation_capability_effect_input_authority_registry_receipts": {
			"agent_evaluation_capability_effect_request_ref_authorities",
			"agent_evaluation_provider_capability_observation_receipts",
			"request_ref_authority_receipt_digest",
			"source_observation_receipt_digest",
			"source_handle_digest",
			"16384",
		},
		"agent_evaluation_controlled_authority_requests": {
			"verification.cell.admit",
			"g3-cell-admission",
			"owner_implementation_digest",
			"stage_digest",
			"dispatch_ack_digest",
			"pre_effect_intent_digest",
			"pre_effect_intent_json",
			"pre_effect_intent_bytes",
			"16384",
			"1048576",
		},
		"agent_evaluation_owner_states": {
			"agent_evaluation_plans",
			"v45_eligible",
			"owner_state_id",
			"root_digest",
			"snapshot_digest",
			"prepared",
			"bundle_json",
			"bundle_bytes",
			"25165824",
			"7864320",
		},
		"agent_evaluation_owner_state_operations": {
			"agent_evaluation_controlled_authority_requests",
			"prior_owner_state_revision",
			"prior_owner_state_root_digest",
			"public_result_json",
			"sealed_operation_json",
			"owner_state_revision = (prior_owner_state_revision + 1)",
			"33619968",
		},
		"agent_evaluation_owner_state_cas_artifacts": {
			"agent_evaluation_owner_state_operations",
			"owner_state_id",
			"artifact_identity_digest",
			"descriptor_digest",
			"cas_receipt_digest",
			"byte_length = octet_length(content_bytes)",
			"8388608",
		},
		"agent_evaluation_provider_capability_observation_receipts": {
			"agent_evaluation_transport_dispatch_intents",
			"agent_evaluation_transport_receipts",
			"agent_evaluation_provider_result_spool_receipts",
			"jsonb_array_length",
			"octet_length(receipt_bytes)",
			"convert_from(receipt_bytes",
			"selected_runtime_fact_envelope_set_digest",
			"source_authority_set_digest",
		},
		"agent_evaluation_attempt_authority_commit_links": {
			"FOREIGN KEY (namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest)",
			"agent_evaluation_attempt_authority_owner_receipts",
			"FOREIGN KEY (namespace_id, plan_digest, attempt_id, attempt_digest)",
			"agent_evaluation_attempts",
		},
		"agent_evaluation_provider_capability_observation_commit_links": {
			"FOREIGN KEY (namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest)",
			"agent_evaluation_provider_capability_observation_receipts",
			"FOREIGN KEY (namespace_id, plan_digest, attempt_id, attempt_digest)",
			"agent_evaluation_attempts",
		},
		"agent_evaluation_capability_specific_receipts": {
			"provider_capability_observation_receipt_digest",
			"agent_evaluation_provider_capability_observation_receipts",
		},
		"agent_evaluation_authority_attestation_v45_roots": {
			"agent_evaluation_authority_attestations",
			"attestation_digest",
			"attempt_authority_owner_receipt_set_digest",
			"provider_capability_observation_receipt_set_digest",
			"capability_specific_receipt_set_digest",
			"validated_human_metric_observation_set_digest",
			"capability_probe_admission_set_digest",
			"capability_probe_reference_receipt_set_digest",
			"runtime_fact_source_owner_registration_set_digest",
			"capability_probe_provider_resource_cleanup_set_digest",
			"optional_capability_fact_source_set_digest",
			"optional_capability_fact_authority_set_digest",
		},
		"agent_evaluation_evidence_root_v45_roots": {
			"agent_evaluation_evidence_roots",
			"agent_evaluation_authority_attestation_v45_roots",
			"root_digest",
			"authority_attestation_digest",
			"provider_capability_observation_receipt_set_digest",
			"capability_probe_admission_set_digest",
			"capability_probe_reference_receipt_set_digest",
			"runtime_fact_source_owner_registration_set_digest",
			"capability_probe_provider_resource_cleanup_set_digest",
			"optional_capability_fact_source_set_digest",
			"optional_capability_fact_authority_set_digest",
		},
	} {
		var definitions string
		if err := db.QueryRowContext(ctx, `SELECT COALESCE(string_agg(pg_get_constraintdef(oid), E'\n'), '')
			FROM pg_constraint WHERE conrelid=to_regclass($1)`, table).Scan(&definitions); err != nil {
			t.Fatalf("read v45 constraints for %s: %v", table, err)
		}
		for _, fragment := range fragments {
			if !strings.Contains(definitions, fragment) {
				t.Fatalf("v45 constraints for %s omit %q:\n%s", table, fragment, definitions)
			}
		}
	}
	var ownerStateUpdatedAtRequired bool
	if err := db.QueryRowContext(ctx, `SELECT is_nullable='NO'
		FROM information_schema.columns
		WHERE table_schema=current_schema()
			AND table_name='agent_evaluation_owner_states'
			AND column_name='updated_at'`).Scan(&ownerStateUpdatedAtRequired); err != nil {
		t.Fatalf("read v45 owner-state updated_at authority: %v", err)
	}
	if !ownerStateUpdatedAtRequired {
		t.Fatal("v45 owner-state updated_at remains nullable")
	}
	var ownerStateListIndexDefinition string
	if err := db.QueryRowContext(ctx, `SELECT indexdef FROM pg_indexes
		WHERE schemaname=current_schema()
			AND tablename='agent_evaluation_owner_states'
			AND indexname='idx_agent_evaluation_owner_states_bounded_list'`).
		Scan(&ownerStateListIndexDefinition); err != nil {
		t.Fatalf("read v45 owner-state bounded-list index: %v", err)
	}
	if !strings.Contains(ownerStateListIndexDefinition, `owner_state_id COLLATE "C"`) ||
		!strings.Contains(ownerStateListIndexDefinition, "WHERE v45_eligible") {
		t.Fatalf("v45 owner-state bounded-list index drifted: %s", ownerStateListIndexDefinition)
	}
	var controlledTransitionDefinition string
	if err := db.QueryRowContext(ctx, `SELECT pg_get_functiondef(
		'enforce_agent_evaluation_controlled_authority_transition()'::regprocedure
	)`).Scan(&controlledTransitionDefinition); err != nil {
		t.Fatalf("read v45 controlled-authority transition: %v", err)
	}
	for _, fragment := range []string{
		"OLD.state='dispatched' AND NEW.state='dispatched'",
		"G3 cell admission acknowledgement transition is invalid",
		"G3 cell admission seal drifted from its acknowledged response",
	} {
		if !strings.Contains(strings.ReplaceAll(controlledTransitionDefinition, " ", ""), strings.ReplaceAll(fragment, " ", "")) {
			t.Fatalf("v45 controlled-authority transition omits %q", fragment)
		}
	}
	var observationBindingDefinition string
	if err := db.QueryRowContext(ctx, `SELECT pg_get_functiondef(
		'enforce_agent_evaluation_provider_capability_observation_binding()'::regprocedure
	)`).Scan(&observationBindingDefinition); err != nil {
		t.Fatalf("read v45 provider-observation binding: %v", err)
	}
	compactObservationBinding := strings.Join(strings.Fields(observationBindingDefinition), " ")
	for _, fragment := range []string{
		"jsonb_object_keys(fact_authority)) <> 19",
		"sourceKind", "routeBinding", "registrationAuthorityIssuerId",
		"registrationReceiptDigest", "runtimeFactSourceAuthorityDigest",
		"agent_evaluation_optional_capability_fact_sources source",
		"agent_evaluation_runtime_fact_source_owner_registrations registration",
		"optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,authorityDigest",
	} {
		if !strings.Contains(compactObservationBinding, fragment) {
			t.Fatalf("v45 provider-observation binding omits %q", fragment)
		}
	}
	var optionalFactTransitionDefinition string
	if err := db.QueryRowContext(ctx, `SELECT pg_get_functiondef(
		'enforce_agent_evaluation_optional_fact_transition()'::regprocedure
	)`).Scan(&optionalFactTransitionDefinition); err != nil {
		t.Fatalf("read v45 optional-fact transition: %v", err)
	}
	var capabilityProbeSpoolBindingDefinition string
	if err := db.QueryRowContext(ctx, `SELECT pg_get_functiondef(
		'enforce_agent_evaluation_capability_probe_response_spool_binding()'::regprocedure
	)`).Scan(&capabilityProbeSpoolBindingDefinition); err != nil {
		t.Fatalf("read capability-probe encrypted response spool binding: %v", err)
	}
	compactCapabilityProbeSpoolBinding := strings.Join(strings.Fields(capabilityProbeSpoolBindingDefinition), " ")
	for _, fragment := range []string{
		"parent_state<>'dispatched'", "parent_dispatch_ack_digest IS NOT NULL",
		"probeProgram,providerRequestIntent,requestPhases",
		"probeProgram,hardLimits,maximumResponseBytes", "FOR SHARE",
	} {
		if !strings.Contains(compactCapabilityProbeSpoolBinding, fragment) {
			t.Fatalf("capability-probe encrypted response spool binding omits %q", fragment)
		}
	}
	var capabilityProbeReferenceBindingDefinition string
	if err := db.QueryRowContext(ctx, `SELECT pg_get_functiondef(
		'enforce_agent_evaluation_capability_probe_reference_binding()'::regprocedure
	)`).Scan(&capabilityProbeReferenceBindingDefinition); err != nil {
		t.Fatalf("read capability-probe reference binding: %v", err)
	}
	compactCapabilityProbeReferenceBinding := strings.Join(strings.Fields(capabilityProbeReferenceBindingDefinition), " ")
	for _, fragment := range []string{
		"prodivix.agent-evaluation-capability-probe-encrypted-response-spool-source-receipt",
		"jsonb_object_keys(source_receipt))<>14", "jsonb_object_keys(spool_entry))<>12",
		"agent_evaluation_capability_probe_response_spools spool", "octet_length(spool.ciphertext_bytes)",
		"stored_spool_count<>expected_spool_count", "FOR SHARE",
	} {
		if !strings.Contains(compactCapabilityProbeReferenceBinding, fragment) {
			t.Fatalf("capability-probe reference binding omits encrypted spool authority %q", fragment)
		}
	}
	compactOptionalFactTransition := strings.Join(strings.Fields(optionalFactTransitionDefinition), " ")
	for _, fragment := range []string{
		"NEW.runtime_fact_envelope_json )) <> 31",
		"NEW.fact_authority_json )) <> 19",
	} {
		if !strings.Contains(compactOptionalFactTransition, fragment) {
			t.Fatalf("v45 optional-fact transition omits %q", fragment)
		}
	}
	var optionalCapacityDefinition string
	if err := db.QueryRowContext(ctx, `SELECT pg_get_functiondef(
		'enforce_agent_evaluation_optional_fact_capacity()'::regprocedure
	)`).Scan(&optionalCapacityDefinition); err != nil {
		t.Fatalf("read v45 optional-fact capacity authority: %v", err)
	}
	for _, fragment := range []string{"5880", "8589934592", "FOR UPDATE"} {
		if !strings.Contains(optionalCapacityDefinition, fragment) {
			t.Fatalf("v45 optional-fact capacity authority omits %q", fragment)
		}
	}
	for function, fragments := range map[string][]string{
		"enforce_agent_evaluation_capability_effect_request_ref_binding()": {
			"registration.state='sealed'", "selected source fact is missing, ambiguous, or stale", "FOR UPDATE",
		},
		"enforce_agent_evaluation_capability_effect_current_event_binding()": {
			"agent_evaluation_transport_dispatch_intents", "agent_evaluation_transport_receipts",
			"agent_evaluation_provider_result_spool_receipts", "FOR SHARE",
		},
		"enforce_agent_evaluation_capability_effect_registry_binding()": {
			"requestRefAuthority", "sourceObservationReceiptDigest", "object_key_count(NEW.receipt_json) <> 29",
		},
		"enforce_agent_evaluation_capability_effect_input_capacity()": {
			"5880", "8589934592", "FOR UPDATE",
		},
		"enforce_agent_evaluation_production_run_config_artifact_binding()": {
			"agent_evaluation_plans", "stored_at", "FOR SHARE",
		},
		"enforce_agent_evaluation_probe_provider_resource_transition()": {
			"resourceManifest", "contentUploadReceipt", "deletionAuthorityReceipt",
			"providerResourceAuthority", "result_ingress_receipt_digest", "exact atomic components",
		},
		"enforce_agent_evaluation_probe_admission_provider_resource()": {
			"probeProviderResourceAuthority", "agent_evaluation_capability_probe_provider_resource_registrations",
			"state='sealed'", "FOR SHARE",
		},
		"enforce_agent_evaluation_plan_probe_provider_resource_link()": {
			"optionalCapabilitySupportAuthority,probeProviderResourceAuthority",
			"agent_evaluation_capability_probe_provider_resource_registrations",
			"registered_at<=plan_record.planned_at", "expires_at>=plan_record.expires_at",
		},
		"enforce_agent_evaluation_probe_provider_resource_cleanup_capacity()": {
			"record_count>=4", "pg_advisory_xact_lock",
		},
		"reject_agent_evaluation_repository_commit_finalized_mutation()": {
			"agent_evaluation_plans", "agent_evaluation_finalizations",
			"agent_evaluation_authority_attestations", "repository_commit",
		},
		"enforce_agent_evaluation_probe_provider_resource_cleanup_transition()": {
			"cleanupReceipt", "result_ingress_receipt_digest", "exact durable receipt",
		},
		"enforce_agent_evaluation_probe_provider_resource_cleanup_receipt()": {
			"resourceResults", "auxiliaryResourceIds", "cleanup receipt is incomplete", "FOR SHARE",
		},
		"enforce_agent_evaluation_plan_probe_provider_resource_cleanup_link()": {
			"probeProviderResourceDeletionAuthorityReceipt", "probeProviderResourceCleanupReceipt",
			"agent_evaluation_capability_probe_provider_resource_cleanup_receipts",
			"cleanup.completed_at<=plan_record.planned_at", "FOR SHARE",
		},
		"enforce_agent_evaluation_native_optional_bootstrap_capacity()": {
			"840", "FOR UPDATE",
		},
		"enforce_agent_evaluation_native_optional_bootstrap_binding()": {
			"agent_evaluation_transport_dispatch_intents", "agent_evaluation_transport_receipts",
			"agent_evaluation_provider_result_spool_receipts", "agent_evaluation_provider_result_spool_payloads",
			"transportCompletedAt", "INTERVAL '30 seconds'",
			"executionIdentityAuthority", "cacheIsolationAuthorityDigest",
			"agent_evaluation_jsonb_object_key_count( NEW.native_provider_source_receipt_json )<>17",
			"optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,authorityDigest",
			"optionalCapabilitySupportAuthority,probeEvidence,probeProgram,programDigest",
		},
	} {
		var definition string
		if err := db.QueryRowContext(ctx, `SELECT pg_get_functiondef($1::regprocedure)`, function).
			Scan(&definition); err != nil {
			t.Fatalf("read capability-effect input authority function %s: %v", function, err)
		}
		compact := strings.Join(strings.Fields(definition), " ")
		for _, fragment := range fragments {
			if !strings.Contains(compact, fragment) {
				t.Fatalf("capability-effect input authority function %s omits %q: %s", function, fragment, compact)
			}
		}
	}
	var registrationCapacityDefinition string
	if err := db.QueryRowContext(ctx, `SELECT pg_get_functiondef(
		'enforce_agent_evaluation_runtime_fact_source_registration_capacity()'::regprocedure
	)`).Scan(&registrationCapacityDefinition); err != nil {
		t.Fatalf("read runtime-fact source registration capacity authority: %v", err)
	}
	for _, fragment := range []string{"15", "pg_advisory_xact_lock", "hashtextextended"} {
		if !strings.Contains(registrationCapacityDefinition, fragment) {
			t.Fatalf("runtime-fact source registration capacity authority omits %q", fragment)
		}
	}
	var planProbeCompletenessTriggers int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pg_trigger
		WHERE tgrelid='agent_evaluation_plans'::regclass AND NOT tgisinternal
			AND tgname='agent_evaluation_plans_capability_probe_links_required'`).
		Scan(&planProbeCompletenessTriggers); err != nil {
		t.Fatalf("read plan probe completeness trigger: %v", err)
	}
	if planProbeCompletenessTriggers != 1 {
		t.Fatalf("plan probe completeness triggers=%d, want 1", planProbeCompletenessTriggers)
	}
	var planRegistrationCompletenessTriggers int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pg_trigger
		WHERE tgrelid='agent_evaluation_plans'::regclass AND NOT tgisinternal
			AND tgname='agent_evaluation_plans_runtime_fact_source_registrations_required'`).
		Scan(&planRegistrationCompletenessTriggers); err != nil {
		t.Fatalf("read plan runtime-fact registration trigger: %v", err)
	}
	if planRegistrationCompletenessTriggers != 1 {
		t.Fatalf("plan runtime-fact registration triggers=%d, want 1", planRegistrationCompletenessTriggers)
	}
	for table, minimumTriggerCount := range map[string]int{
		"agent_evaluation_runtime_fact_source_owner_registrations":                        2,
		"agent_evaluation_capability_probe_admissions":                                    2,
		"agent_evaluation_capability_probe_response_spools":                               3,
		"agent_evaluation_capability_probe_reference_receipts":                            3,
		"agent_evaluation_plan_capability_probe_admission_links":                          4,
		"agent_evaluation_capability_probe_provider_resource_registrations":               2,
		"agent_evaluation_capability_probe_provider_resource_manifests":                   3,
		"agent_evaluation_capability_probe_provider_resource_content_upload_receipts":     3,
		"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts": 3,
		"agent_evaluation_capability_probe_provider_resource_cleanups":                    3,
		"agent_evaluation_capability_probe_provider_resource_cleanup_receipts":            3,
		"agent_evaluation_optional_capability_fact_sources":                               3,
		"agent_evaluation_optional_fact_authorities":                                      4,
		"agent_evaluation_native_optional_capability_bootstrap_sources":                   5,
		"agent_evaluation_native_provider_state_vault_records":                            2,
		"agent_evaluation_production_run_config_artifacts":                                3,
		"agent_evaluation_capability_effect_request_ref_authorities":                      4,
		"agent_evaluation_capability_effect_current_turn_events":                          4,
		"agent_evaluation_capability_effect_input_authority_registry_receipts":            4,
		"agent_evaluation_owner_states":                                                   3,
		"agent_evaluation_owner_state_operations":                                         3,
		"agent_evaluation_owner_state_cas_artifacts":                                      2,
		"agent_evaluation_attempt_authority_owner_receipts":                               3,
		"agent_evaluation_provider_capability_observation_receipts":                       3,
		"agent_evaluation_capability_specific_receipts":                                   3,
		"agent_evaluation_attempt_authority_commit_links":                                 3,
		"agent_evaluation_provider_capability_observation_commit_links":                   3,
		"agent_evaluation_authority_attestation_v45_roots":                                2,
		"agent_evaluation_evidence_root_v45_roots":                                        2,
		"agent_evaluation_authority_attestations":                                         3,
		"agent_evaluation_evidence_roots":                                                 3,
	} {
		var triggerCount int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pg_trigger
			WHERE tgrelid=to_regclass($1) AND NOT tgisinternal`, table).Scan(&triggerCount); err != nil {
			t.Fatalf("read v45 triggers for %s: %v", table, err)
		}
		if triggerCount < minimumTriggerCount {
			t.Fatalf("v45 table %s has %d binding/immutability triggers, want at least %d",
				table, triggerCount, minimumTriggerCount)
		}
	}
	var recorded bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM schema_migrations
		WHERE version=45 AND name='g4-agent-evaluation-attempt-authority-facts'
	)`).Scan(&recorded); err != nil {
		t.Fatal(err)
	}
	if !recorded {
		t.Fatal("v45 attempt-authority migration was not recorded")
	}
}

func assertAgentEvaluationFreshV45AuthorityTablesNotBackfilled(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, table := range []string{
		"agent_evaluation_capability_probe_admissions",
		"agent_evaluation_capability_probe_response_spools",
		"agent_evaluation_capability_probe_reference_receipts",
		"agent_evaluation_plan_capability_probe_admission_links",
		"agent_evaluation_capability_probe_provider_resource_registrations",
		"agent_evaluation_capability_probe_provider_resource_manifests",
		"agent_evaluation_capability_probe_provider_resource_content_upload_receipts",
		"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts",
		"agent_evaluation_capability_probe_provider_resource_cleanups",
		"agent_evaluation_capability_probe_provider_resource_cleanup_receipts",
		"agent_evaluation_runtime_fact_source_owner_registrations",
		"agent_evaluation_owner_states",
		"agent_evaluation_owner_state_operations",
		"agent_evaluation_owner_state_cas_artifacts",
		"agent_evaluation_optional_capability_fact_sources",
		"agent_evaluation_optional_fact_authorities",
		"agent_evaluation_native_optional_capability_bootstrap_sources",
		"agent_evaluation_native_provider_state_vault_records",
		"agent_evaluation_production_run_config_artifacts",
		"agent_evaluation_capability_effect_request_ref_authorities",
		"agent_evaluation_capability_effect_current_turn_events",
		"agent_evaluation_capability_effect_input_authority_registry_receipts",
	} {
		var rowCount int64
		query := "SELECT COUNT(*) FROM " + pgx.Identifier{table}.Sanitize()
		if err := db.QueryRowContext(ctx, query).Scan(&rowCount); err != nil {
			t.Fatalf("read fresh-only v45 table %s: %v", table, err)
		}
		if rowCount != 0 {
			t.Fatalf("populated v41 migration synthesized %d rows in fresh-only v45 table %s",
				rowCount, table)
		}
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLV41Upgrade(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 41)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, table := range []string{
		"agent_evaluation_attempt_authority_owner_receipts",
		"agent_evaluation_runtime_fact_source_owner_registrations",
		"agent_evaluation_capability_probe_admissions",
		"agent_evaluation_capability_probe_response_spools",
		"agent_evaluation_capability_probe_reference_receipts",
		"agent_evaluation_plan_capability_probe_admission_links",
		"agent_evaluation_capability_probe_provider_resource_registrations",
		"agent_evaluation_capability_probe_provider_resource_manifests",
		"agent_evaluation_capability_probe_provider_resource_content_upload_receipts",
		"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts",
		"agent_evaluation_capability_probe_provider_resource_cleanups",
		"agent_evaluation_capability_probe_provider_resource_cleanup_receipts",
		"agent_evaluation_owner_states",
		"agent_evaluation_owner_state_operations",
		"agent_evaluation_owner_state_cas_artifacts",
		"agent_evaluation_optional_capability_fact_sources",
		"agent_evaluation_optional_fact_authorities",
		"agent_evaluation_native_optional_capability_bootstrap_sources",
		"agent_evaluation_native_provider_state_vault_records",
		"agent_evaluation_production_run_config_artifacts",
		"agent_evaluation_capability_effect_request_ref_authorities",
		"agent_evaluation_capability_effect_current_turn_events",
		"agent_evaluation_capability_effect_input_authority_registry_receipts",
		"agent_evaluation_provider_capability_observation_receipts",
		"agent_evaluation_capability_specific_receipts",
		"agent_evaluation_attempt_authority_commit_links",
		"agent_evaluation_provider_capability_observation_commit_links",
		"agent_evaluation_authority_attestation_v45_roots",
		"agent_evaluation_evidence_root_v45_roots",
	} {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, table).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if exists {
			t.Fatalf("recorded v41 schema unexpectedly contains later table %q", table)
		}
	}
	fixture := seedV41AttemptAuthorityFixture(t, db, "claimed")
	var v41Name string
	var v41AppliedAt time.Time
	if err := db.QueryRowContext(ctx, `SELECT name,applied_at FROM schema_migrations WHERE version=41`).
		Scan(&v41Name, &v41AppliedAt); err != nil {
		t.Fatalf("read recorded v41 identity: %v", err)
	}
	if err := RunMigrations(context.Background(), db, 2*time.Minute); err != nil {
		t.Fatalf("upgrade populated isolated v41 schema through v45: %v", err)
	}
	assertAgentEvaluationAttemptAuthorityV45Schema(t, db)
	assertAgentEvaluationFreshV45AuthorityTablesNotBackfilled(t, db)
	var upgradedV41Name string
	var upgradedV41AppliedAt time.Time
	if err := db.QueryRowContext(ctx, `SELECT name,applied_at FROM schema_migrations WHERE version=41`).
		Scan(&upgradedV41Name, &upgradedV41AppliedAt); err != nil {
		t.Fatalf("read v41 identity after v45 upgrade: %v", err)
	}
	if upgradedV41Name != v41Name || !upgradedV41AppliedAt.Equal(v41AppliedAt) {
		t.Fatalf("v41 migration registry drifted during v45 upgrade: before=%q/%s after=%q/%s",
			v41Name, v41AppliedAt, upgradedV41Name, upgradedV41AppliedAt)
	}
	var ownerImplementationDigest, attemptID, descriptorDigest, state string
	var v45Eligible bool
	var stageDigest, dispatchAckDigest, observationSetDigest sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT owner_implementation_digest,attempt_id,
		descriptor_digest,state,v45_eligible,stage_digest,dispatch_ack_digest,
		provider_capability_observation_receipt_set_digest
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='provider-capability' AND request_digest=$4`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit,
		fixture.providerRequestDigest).Scan(&ownerImplementationDigest, &attemptID,
		&descriptorDigest, &state, &v45Eligible, &stageDigest, &dispatchAckDigest,
		&observationSetDigest); err != nil {
		t.Fatalf("read populated v41 row after v45 upgrade: %v", err)
	}
	if ownerImplementationDigest != fixture.ownerImplementationDigest || attemptID != fixture.attemptID ||
		descriptorDigest != fixture.descriptorDigest || state != "claimed" || !v45Eligible || stageDigest.Valid ||
		dispatchAckDigest.Valid || observationSetDigest.Valid {
		t.Fatalf("populated v41 claim drifted during v45 upgrade: owner=%q attempt=%q descriptor=%q state=%q stage=%v ack=%v observations=%v",
			ownerImplementationDigest, attemptID, descriptorDigest, state, stageDigest, dispatchAckDigest, observationSetDigest)
	}

	dispatchedAt := fixture.claimedAt.Add(2 * time.Second)
	stage := attemptAuthorityMigrationDigest("v45-stage")
	observations := attemptAuthorityMigrationDigest("v45-provider-observation-set")
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched',dispatched_at=$5,stage_digest=$6,
			provider_capability_observation_receipt_set_digest=$7
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='provider-capability' AND request_digest=$4`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, fixture.providerRequestDigest,
		dispatchedAt, stage, observations); err != nil {
		t.Fatalf("dispatch upgraded v41 provider claim with v45 fences: %v", err)
	}
	sealedAt := dispatchedAt.Add(time.Second)
	responseDigest := attemptAuthorityMigrationDigest("v45-provider-response")
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed',response_digest=$5,response_bytes=$6,sealed_at=$7
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='provider-capability' AND request_digest=$4`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, fixture.providerRequestDigest,
		responseDigest, []byte(`{"sealed":true}`), sealedAt); err == nil {
		t.Fatal("v45 sealed transition accepted a missing dispatch acknowledgement")
	}
	dispatchAck := attemptAuthorityMigrationDigest("v45-dispatch-ack")
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed',response_digest=$5,response_bytes=$6,sealed_at=$7,
			dispatch_ack_digest=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='provider-capability' AND request_digest=$4`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, fixture.providerRequestDigest,
		responseDigest, []byte(`{"sealed":true}`), sealedAt, dispatchAck); err != nil {
		t.Fatalf("seal upgraded v41 provider claim with exact v45 acknowledgement: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET stage_digest=$5
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='provider-capability' AND request_digest=$4`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, fixture.providerRequestDigest,
		attemptAuthorityMigrationDigest("tampered-stage")); err == nil {
		t.Fatal("v45 sealed authority accepted a swapped stage fence")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET stage_digest=$5
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='controlled-workspace' AND request_digest=$4`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, fixture.workspaceRequestDigest,
		attemptAuthorityMigrationDigest("non-attempt-stage")); err == nil {
		t.Fatal("v45 non-attempt authority accepted an attempt stage fence")
	}
	ownerReceiptDigest := attemptAuthorityMigrationDigest("v45-attempt-owner-receipt")
	verificationGrantSet := attemptAuthorityMigrationDigest("v41-verification-grant-set")
	insertOwnerReceipt := func(ownerResponseDigest, receiptDigest string) error {
		responseProjection := map[string]any{
			"serviceKind": "capability-runtime", "operation": "execute-tool",
			"invocationId": "invocation-v41", "turnIndex": 0,
			"toolId": "tool-v41", "toolCallId": "tool-call-v41",
			"providerToolCallId":    "provider-tool-call-v41",
			"providerRequestDigest": fixture.providerRequestDigest, "outcome": "supported",
			"resultDigest":              ownerResponseDigest,
			"continuationReceiptDigest": attemptAuthorityMigrationDigest("v41-continuation"),
			"specificReceiptDigests":    []any{},
		}
		ownerJSON, err := json.Marshal(map[string]any{
			"format": "prodivix.agent-evaluation-attempt-authority-owner-receipt", "version": 1,
			"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
			"repositoryCommit": fixture.repositoryCommit, "serviceKind": "capability-runtime",
			"operation": "execute-tool", "attemptId": fixture.attemptID,
			"descriptorDigest": fixture.descriptorDigest, "shardLeaseOwnerId": "lease-owner-v41",
			"shardLeaseGeneration": 1, "verificationGrantGeneration": 1,
			"verificationAttemptGrantReceiptSetDigest": verificationGrantSet,
			"requestDigest": fixture.providerRequestDigest, "responseProjection": responseProjection,
			"responseDigest":            ownerResponseDigest,
			"ownerImplementationDigest": fixture.ownerImplementationDigest,
			"completedAt":               sealedAt, "receiptDigest": receiptDigest,
		})
		if err != nil {
			return err
		}
		_, err = db.ExecContext(ctx, `INSERT INTO agent_evaluation_attempt_authority_owner_receipts (
			namespace_id,plan_digest,repository_commit,journal_service_kind,service_kind,
			operation,attempt_id,descriptor_digest,shard_lease_owner_id,shard_lease_generation,
			verification_grant_generation,verification_grant_receipt_set_digest,request_digest,
			response_digest,owner_implementation_digest,completed_at,receipt_digest,receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,'provider-capability','capability-runtime','execute-tool',$4,$5,
			'lease-owner-v41',1,1,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`, fixture.namespaceID,
			fixture.planDigest, fixture.repositoryCommit, fixture.attemptID, fixture.descriptorDigest,
			verificationGrantSet, fixture.providerRequestDigest, ownerResponseDigest,
			fixture.ownerImplementationDigest, sealedAt, receiptDigest, string(ownerJSON), ownerJSON)
		return err
	}
	if err := insertOwnerReceipt(responseDigest, ownerReceiptDigest); err != nil {
		t.Fatalf("insert exact v45 attempt-authority owner receipt: %v", err)
	}
	attemptDigest := attemptAuthorityMigrationDigest("v45-joined-attempt")
	attemptCompletedAt := sealedAt.Add(time.Second)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_attempts (
		namespace_id,plan_digest,attempt_id,descriptor_digest,sampling_identity_digest,
		independent_run_id,shard_id,case_id,target_id,status,outcome,attempt_digest,
		attempt_json,attempt_bytes,started_at,completed_at
	) VALUES ($1,$2,$3,$4,$5,'independent-run-v45','shard-v45','case-v45','target-v45',
		'completed','passed',$6,$7::jsonb,$8,$9,$10)`, fixture.namespaceID, fixture.planDigest,
		fixture.attemptID, fixture.descriptorDigest, attemptAuthorityMigrationDigest("v45-sampling"),
		attemptDigest, `{"attempt":"joined"}`, []byte(`{"attempt":"joined"}`),
		fixture.claimedAt, attemptCompletedAt); err != nil {
		t.Fatalf("insert v45 joined attempt: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_attempt_authority_commit_links (
		namespace_id,plan_digest,repository_commit,attempt_id,receipt_digest,attempt_digest,committed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7)`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, fixture.attemptID, ownerReceiptDigest,
		attemptAuthorityMigrationDigest("swapped-attempt"), attemptCompletedAt); err == nil {
		t.Fatal("v45 atomic owner link accepted a swapped attempt digest")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_attempt_authority_commit_links (
		namespace_id,plan_digest,repository_commit,attempt_id,receipt_digest,attempt_digest,committed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7)`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, fixture.attemptID, ownerReceiptDigest,
		attemptDigest, attemptCompletedAt); err != nil {
		t.Fatalf("insert exact v45 atomic owner link: %v", err)
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLQuarantinesLegacyV41Facts(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 41)
	fixture := seedV41AttemptAuthorityFixture(t, db, "dispatched")
	g3RequestDigest, malformedG3ClaimRequestDigest := seedV41G3CellAdmissionFixture(t, db, fixture)
	ownerStateRequestDigest := seedV41LegacyOwnerStatefulFixture(t, db, fixture)
	attestationDigest := seedV41LegacyPublication(t, db, fixture)
	var legacyV41Row, v41Name string
	var legacyV41G3Row, legacyV41OwnerStateRow, legacyV41Attestation, legacyV41Root string
	var v41AppliedAt time.Time
	if err := db.QueryRow(`SELECT to_jsonb(authority)::text
		FROM agent_evaluation_controlled_authority_requests authority
		WHERE namespace_id=$1 AND plan_digest=$2 AND service_kind='provider-capability'
			AND request_digest=$3`, fixture.namespaceID, fixture.planDigest,
		fixture.providerRequestDigest).Scan(&legacyV41Row); err != nil {
		t.Fatalf("read legacy v41 authority bytes: %v", err)
	}
	if err := db.QueryRow(`SELECT to_jsonb(attestation)::text
		FROM agent_evaluation_authority_attestations attestation
		WHERE namespace_id=$1 AND plan_digest=$2`, fixture.namespaceID,
		fixture.planDigest).Scan(&legacyV41Attestation); err != nil {
		t.Fatalf("read legacy v41 attestation bytes: %v", err)
	}
	if err := db.QueryRow(`SELECT to_jsonb(authority)::text
		FROM agent_evaluation_controlled_authority_requests authority
		WHERE namespace_id=$1 AND plan_digest=$2 AND service_kind='controlled-workspace'
			AND request_digest=$3`, fixture.namespaceID, fixture.planDigest,
		g3RequestDigest).Scan(&legacyV41G3Row); err != nil {
		t.Fatalf("read legacy v41 G3 admission bytes: %v", err)
	}
	if err := db.QueryRow(`SELECT to_jsonb(authority)::text
		FROM agent_evaluation_controlled_authority_requests authority
		WHERE namespace_id=$1 AND plan_digest=$2 AND service_kind='controlled-workspace'
			AND request_digest=$3`, fixture.namespaceID, fixture.planDigest,
		ownerStateRequestDigest).Scan(&legacyV41OwnerStateRow); err != nil {
		t.Fatalf("read legacy v41 owner-state claim bytes: %v", err)
	}
	if err := db.QueryRow(`SELECT to_jsonb(evidence_root)::text
		FROM agent_evaluation_evidence_roots evidence_root
		WHERE namespace_id=$1 AND plan_digest=$2`, fixture.namespaceID,
		fixture.planDigest).Scan(&legacyV41Root); err != nil {
		t.Fatalf("read legacy v41 evidence-root bytes: %v", err)
	}
	if err := db.QueryRow(`SELECT name,applied_at FROM schema_migrations WHERE version=41`).
		Scan(&v41Name, &v41AppliedAt); err != nil {
		t.Fatalf("read legacy v41 migration registry: %v", err)
	}
	if err := RunMigrations(context.Background(), db, 2*time.Minute); err != nil {
		t.Fatalf("upgrade v41 dispatch into legacy-ineligible quarantine: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	var v45Recorded, stageColumnExists bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM schema_migrations WHERE version=45
	), EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema=current_schema()
			AND table_name='agent_evaluation_controlled_authority_requests'
			AND column_name='stage_digest'
	)`).Scan(&v45Recorded, &stageColumnExists); err != nil {
		t.Fatal(err)
	}
	if !v45Recorded || !stageColumnExists {
		t.Fatalf("legacy quarantine upgrade is incomplete: recorded=%v stage_column=%v", v45Recorded, stageColumnExists)
	}
	assertAgentEvaluationFreshV45AuthorityTablesNotBackfilled(t, db)
	var quarantinedV41Row, quarantinedV41G3Row, quarantinedV41OwnerStateRow string
	var quarantinedV41Attestation, quarantinedV41Root, upgradedV41Name string
	var upgradedV41AppliedAt time.Time
	if err := db.QueryRowContext(ctx, `SELECT (to_jsonb(authority) - ARRAY[
		'v45_eligible','stage_digest','dispatch_ack_digest',
		'provider_capability_observation_receipt_set_digest',
		'pre_effect_intent_digest','pre_effect_intent_json','pre_effect_intent_bytes'
	])::text
		FROM agent_evaluation_controlled_authority_requests authority
		WHERE namespace_id=$1 AND plan_digest=$2 AND service_kind='provider-capability'
			AND request_digest=$3`, fixture.namespaceID, fixture.planDigest,
		fixture.providerRequestDigest).Scan(&quarantinedV41Row); err != nil {
		t.Fatalf("read quarantined v41 authority bytes: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT (to_jsonb(attestation)-'v45_eligible')::text
		FROM agent_evaluation_authority_attestations attestation
		WHERE namespace_id=$1 AND plan_digest=$2`, fixture.namespaceID,
		fixture.planDigest).Scan(&quarantinedV41Attestation); err != nil {
		t.Fatalf("read quarantined v41 attestation bytes: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT (to_jsonb(authority) - ARRAY[
		'v45_eligible','stage_digest','dispatch_ack_digest',
		'provider_capability_observation_receipt_set_digest',
		'pre_effect_intent_digest','pre_effect_intent_json','pre_effect_intent_bytes'
	])::text
		FROM agent_evaluation_controlled_authority_requests authority
		WHERE namespace_id=$1 AND plan_digest=$2 AND service_kind='controlled-workspace'
			AND request_digest=$3`, fixture.namespaceID, fixture.planDigest,
		g3RequestDigest).Scan(&quarantinedV41G3Row); err != nil {
		t.Fatalf("read quarantined v41 G3 admission bytes: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT (to_jsonb(authority) - ARRAY[
		'v45_eligible','stage_digest','dispatch_ack_digest',
		'provider_capability_observation_receipt_set_digest',
		'pre_effect_intent_digest','pre_effect_intent_json','pre_effect_intent_bytes'
	])::text
		FROM agent_evaluation_controlled_authority_requests authority
		WHERE namespace_id=$1 AND plan_digest=$2 AND service_kind='controlled-workspace'
			AND request_digest=$3`, fixture.namespaceID, fixture.planDigest,
		ownerStateRequestDigest).Scan(&quarantinedV41OwnerStateRow); err != nil {
		t.Fatalf("read quarantined v41 owner-state claim bytes: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT (to_jsonb(evidence_root)-'v45_eligible')::text
		FROM agent_evaluation_evidence_roots evidence_root
		WHERE namespace_id=$1 AND plan_digest=$2`, fixture.namespaceID,
		fixture.planDigest).Scan(&quarantinedV41Root); err != nil {
		t.Fatalf("read quarantined v41 evidence-root bytes: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT name,applied_at FROM schema_migrations WHERE version=41`).
		Scan(&upgradedV41Name, &upgradedV41AppliedAt); err != nil {
		t.Fatalf("read quarantined v41 migration registry: %v", err)
	}
	if quarantinedV41Row != legacyV41Row || quarantinedV41G3Row != legacyV41G3Row ||
		quarantinedV41OwnerStateRow != legacyV41OwnerStateRow ||
		quarantinedV41Attestation != legacyV41Attestation ||
		quarantinedV41Root != legacyV41Root || upgradedV41Name != v41Name ||
		!upgradedV41AppliedAt.Equal(v41AppliedAt) {
		t.Fatalf("legacy v41 bytes/registry drifted: request=%v g3=%v owner_state=%v attestation=%v root=%v before=%q/%s after=%q/%s",
			quarantinedV41Row == legacyV41Row, quarantinedV41G3Row == legacyV41G3Row,
			quarantinedV41OwnerStateRow == legacyV41OwnerStateRow,
			quarantinedV41Attestation == legacyV41Attestation,
			quarantinedV41Root == legacyV41Root, v41Name, v41AppliedAt,
			upgradedV41Name, upgradedV41AppliedAt)
	}
	var attestationEligible, rootEligible bool
	var v45ExtensionCount int
	if err := db.QueryRowContext(ctx, `SELECT attestation.v45_eligible,evidence_root.v45_eligible,
		(SELECT COUNT(*) FROM agent_evaluation_authority_attestation_v45_roots
			WHERE namespace_id=$1 AND plan_digest=$2) +
		(SELECT COUNT(*) FROM agent_evaluation_evidence_root_v45_roots
			WHERE namespace_id=$1 AND plan_digest=$2)
		FROM agent_evaluation_authority_attestations attestation
		JOIN agent_evaluation_evidence_roots evidence_root USING (namespace_id,plan_digest)
		WHERE attestation.namespace_id=$1 AND attestation.plan_digest=$2`, fixture.namespaceID,
		fixture.planDigest).Scan(&attestationEligible, &rootEligible, &v45ExtensionCount); err != nil {
		t.Fatalf("read legacy publication quarantine: %v", err)
	}
	if attestationEligible || rootEligible || v45ExtensionCount != 0 {
		t.Fatalf("legacy publication entered current v45 roots: attestation=%v root=%v extensions=%d",
			attestationEligible, rootEligible, v45ExtensionCount)
	}
	legacyRootSetDigest := attemptAuthorityMigrationDigest("legacy-synthetic-root-set")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_authority_attestation_v45_roots (
		namespace_id,plan_digest,attestation_digest,attempt_authority_owner_receipt_set_digest,
		provider_capability_observation_receipt_set_digest,capability_specific_receipt_set_digest,
		validated_human_metric_observation_set_digest,capability_probe_admission_set_digest,
		capability_probe_reference_receipt_set_digest,
		runtime_fact_source_owner_registration_set_digest,
		capability_probe_provider_resource_cleanup_set_digest,
		optional_capability_fact_source_set_digest,
		optional_capability_fact_authority_set_digest,created_at
	) VALUES ($1,$2,$3,$4,$4,$4,$4,$4,$4,$4,$4,$4,$4,$5)`, fixture.namespaceID, fixture.planDigest,
		attestationDigest, legacyRootSetDigest, fixture.claimedAt.Add(5*time.Minute)); err == nil {
		t.Fatal("legacy publication accepted synthetic v45 authority roots")
	}
	var state string
	var v45Eligible bool
	var dispatchedAt time.Time
	var stageDigest, dispatchAckDigest, observationSetDigest sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT state,v45_eligible,dispatched_at,stage_digest,
		dispatch_ack_digest,provider_capability_observation_receipt_set_digest
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND service_kind='provider-capability'
			AND request_digest=$3`, fixture.namespaceID, fixture.planDigest,
		fixture.providerRequestDigest).Scan(&state, &v45Eligible, &dispatchedAt, &stageDigest,
		&dispatchAckDigest, &observationSetDigest); err != nil {
		t.Fatal(err)
	}
	if state != "dispatched" || v45Eligible || !dispatchedAt.Equal(fixture.claimedAt.Add(time.Second)) ||
		stageDigest.Valid || dispatchAckDigest.Valid || observationSetDigest.Valid {
		t.Fatalf("legacy v41 dispatch quarantine drifted: state=%q eligible=%v dispatched_at=%s stage=%v ack=%v observations=%v",
			state, v45Eligible, dispatchedAt, stageDigest, dispatchAckDigest, observationSetDigest)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed',stage_digest=$4,dispatch_ack_digest=$5,
			provider_capability_observation_receipt_set_digest=$6,response_digest=$7,
			response_bytes=$8,sealed_at=$9
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, fixture.providerRequestDigest, attemptAuthorityMigrationDigest("legacy-stage"),
		attemptAuthorityMigrationDigest("legacy-ack"), attemptAuthorityMigrationDigest("legacy-observations"),
		attemptAuthorityMigrationDigest("legacy-response"), []byte(`{"legacy":true}`),
		dispatchedAt.Add(time.Second)); err == nil {
		t.Fatal("legacy-ineligible v41 dispatch entered a current v45 transition")
	}
	var g3Eligible bool
	var g3Stage, g3Ack sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT v45_eligible,stage_digest,dispatch_ack_digest
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, g3RequestDigest).Scan(&g3Eligible, &g3Stage, &g3Ack); err != nil {
		t.Fatalf("read quarantined v41 G3 admission: %v", err)
	}
	if g3Eligible || g3Stage.Valid || g3Ack.Valid {
		t.Fatalf("legacy v41 G3 admission escaped quarantine: eligible=%v stage=%v ack=%v",
			g3Eligible, g3Stage, g3Ack)
	}
	var malformedG3Eligible bool
	if err := db.QueryRowContext(ctx, `SELECT v45_eligible
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, malformedG3ClaimRequestDigest).Scan(&malformedG3Eligible); err != nil {
		t.Fatalf("read quarantined v41 malformed G3 claim: %v", err)
	}
	if malformedG3Eligible {
		t.Fatal("legally populated v41 G3 claim without current binding escaped quarantine")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_digest=$4,response_bytes=$5,dispatch_ack_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, g3RequestDigest, attemptAuthorityMigrationDigest("legacy-g3-response"),
		[]byte(`{"legacy":"g3-ack"}`), attemptAuthorityMigrationDigest("legacy-g3-ack")); err == nil {
		t.Fatal("legacy-ineligible v41 G3 admission accepted an acknowledged response")
	}
	var ownerStateEligible bool
	if err := db.QueryRowContext(ctx, `SELECT v45_eligible
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, ownerStateRequestDigest).Scan(&ownerStateEligible); err != nil {
		t.Fatalf("read quarantined v41 owner-state claim: %v", err)
	}
	if ownerStateEligible {
		t.Fatal("legal v41 owner-state claim escaped requalification quarantine")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched',stage_digest=$4,dispatched_at=$5
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, ownerStateRequestDigest,
		attemptAuthorityMigrationDigest("legacy-owner-state-stage"), fixture.claimedAt.Add(time.Second)); err == nil {
		t.Fatal("legacy-ineligible owner-state claim entered a current stage transition")
	}
	var commitLinkCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*)
		FROM agent_evaluation_attempt_authority_commit_links
		WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3`, fixture.namespaceID,
		fixture.planDigest, fixture.attemptID).Scan(&commitLinkCount); err != nil {
		t.Fatal(err)
	}
	if commitLinkCount != 0 {
		t.Fatalf("legacy-ineligible v41 authority produced %d current commit links", commitLinkCount)
	}
}

func exerciseFreshV45G3CellAdmissionJournal(
	t *testing.T,
	ctx context.Context,
	db *sql.DB,
	fixture v41AttemptAuthorityFixture,
) {
	t.Helper()
	requestDigest := attemptAuthorityMigrationDigest("fresh-v45-g3-cell-admission-request")
	ownerImplementationDigest := attemptAuthorityMigrationDigest("fresh-v45-g3-cell-admission-owner")
	descriptorDigest := attemptAuthorityMigrationDigest("fresh-v45-g3-cell-admission-descriptor")
	claimedAt := fixture.claimedAt.Add(10 * time.Minute)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,generation,state,claim_generation,claimed_at
	) VALUES ($1,$2,$3,'controlled-workspace','verification.cell.admit','g3-cell-admission',
		$4,$5,$6,'attempt-v45-g3-cell',$7,1,'claimed',1,$8)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, requestDigest,
		attemptAuthorityMigrationDigest("fresh-v45-g3-cell-admission-binding"),
		ownerImplementationDigest, descriptorDigest, claimedAt); err != nil {
		t.Fatalf("claim fresh v45 G3 cell admission: %v", err)
	}
	stageDigest := attemptAuthorityMigrationDigest("fresh-v45-g3-cell-admission-stage")
	dispatchedAt := claimedAt.Add(time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched',stage_digest=$4,dispatched_at=$5
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, stageDigest, dispatchedAt); err != nil {
		t.Fatalf("dispatch fresh v45 G3 cell admission: %v", err)
	}
	responseBytes := []byte(`{"admission":"acknowledged"}`)
	responseDigest := attemptAuthorityMigrationDigest(string(responseBytes))
	dispatchAckDigest := attemptAuthorityMigrationDigest("fresh-v45-g3-cell-admission-ack")
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET dispatch_ack_digest=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, dispatchAckDigest); err == nil {
		t.Fatal("G3 cell admission accepted a dispatch ACK without its response")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET stage_digest=$4,response_digest=$5,response_bytes=$6,dispatch_ack_digest=$7
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, attemptAuthorityMigrationDigest("swapped-g3-stage"),
		responseDigest, responseBytes, dispatchAckDigest); err == nil {
		t.Fatal("G3 cell admission acknowledgement accepted a swapped stage fence")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_digest=$4,response_bytes=$5,dispatch_ack_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, responseDigest, responseBytes, dispatchAckDigest); err != nil {
		t.Fatalf("acknowledge fresh v45 G3 cell admission: %v", err)
	}
	sealedAt := dispatchedAt.Add(time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed',sealed_at=$4,dispatch_ack_digest=$5
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, sealedAt, attemptAuthorityMigrationDigest("swapped-g3-ack")); err == nil {
		t.Fatal("G3 cell admission seal accepted a swapped dispatch ACK")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed',sealed_at=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, sealedAt); err != nil {
		t.Fatalf("seal fresh v45 G3 cell admission: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET stage_digest=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, attemptAuthorityMigrationDigest("late-g3-stage")); err == nil {
		t.Fatal("sealed G3 cell admission accepted a late stage mutation")
	}
	var state, storedOwner, storedStage, storedAck, storedResponseDigest string
	var storedResponseBytes []byte
	if err := db.QueryRowContext(ctx, `SELECT state,owner_implementation_digest,stage_digest,
		dispatch_ack_digest,response_digest,response_bytes
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest).Scan(&state, &storedOwner, &storedStage, &storedAck,
		&storedResponseDigest, &storedResponseBytes); err != nil {
		t.Fatalf("read sealed G3 cell admission journal: %v", err)
	}
	if state != "sealed" || storedOwner != ownerImplementationDigest || storedStage != stageDigest ||
		storedAck != dispatchAckDigest || storedResponseDigest != responseDigest ||
		!bytes.Equal(storedResponseBytes, responseBytes) {
		t.Fatalf("sealed G3 cell admission journal drifted: state=%q owner=%q stage=%q ack=%q response=%q bytes=%q",
			state, storedOwner, storedStage, storedAck, storedResponseDigest, storedResponseBytes)
	}
	ordinaryDispatchedAt := claimedAt.Add(2 * time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched',dispatched_at=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, fixture.workspaceRequestDigest, ordinaryDispatchedAt); err != nil {
		t.Fatalf("dispatch ordinary controlled-workspace authority: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_digest=$4,response_bytes=$5,dispatch_ack_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, fixture.workspaceRequestDigest, responseDigest, responseBytes,
		dispatchAckDigest); err == nil {
		t.Fatal("ordinary controlled-workspace authority accepted G3 acknowledgement fields")
	}
}

func exerciseFreshV45SharedEffectResultIngressJournal(
	t *testing.T,
	ctx context.Context,
	db *sql.DB,
	fixture v41AttemptAuthorityFixture,
) {
	t.Helper()
	attemptID := "attempt-v45-shared-effect-ingress"
	descriptorDigest := attemptAuthorityMigrationDigest("fresh-v45-shared-effect-descriptor")
	requestDigest := attemptAuthorityMigrationDigest("fresh-v45-shared-effect-request")
	ownerImplementationDigest := attemptAuthorityMigrationDigest("fresh-v45-shared-effect-owner")
	registrationReceiptDigest := attemptAuthorityMigrationDigest("fresh-v45-shared-effect-registration")
	runtimeAuthority := map[string]any{
		"kind": "shared-durable-capability", "sourceKind": "sealed-provider-response-metadata",
		"sourceAuthorityId":                   "runtime-fact-source.v45.shared-effect",
		"sourceAuthorityImplementationDigest": ownerImplementationDigest,
		"routeBinding":                        "optional-capability-facts", "capabilityProfileId": "g4-provider-isolated-cache",
		"capabilityProfileDigest": "sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103",
		"capabilityId":            "provider.isolated-cache", "protocolFamily": "responses",
		"providerConfigurationId": "provider-configuration.v45.shared-effect",
		"modelId":                 "model.v45.shared-effect", "modelLineageDigest": attemptAuthorityMigrationDigest("fresh-v45-shared-effect-model"),
		"adapterDigest":                 attemptAuthorityMigrationDigest("fresh-v45-shared-effect-adapter"),
		"registrationAuthorityIssuerId": "runtime-registration-authority.v45.shared-effect",
		"registrationReceiptDigest":     registrationReceiptDigest,
		"authorityDigest":               attemptAuthorityMigrationDigest("fresh-v45-shared-effect-runtime-authority"),
	}
	ownerIdentity := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-owner-request-identity", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": descriptorDigest, "caseId": "case.v45.shared-effect.ingress",
		"materialDigest": attemptAuthorityMigrationDigest("fresh-v45-shared-effect-material"),
		"turnIndex":      0, "invocationId": "invocation.v45.shared-effect.ingress",
		"toolId": "tool.v45.shared-effect", "toolCallId": "tool-call.v45.shared-effect",
		"providerToolCallId":               "provider-tool-call.v45.shared-effect",
		"providerRequestDigest":            attemptAuthorityMigrationDigest("fresh-v45-shared-effect-provider-request"),
		"argumentsDigest":                  attemptAuthorityMigrationDigest("fresh-v45-shared-effect-arguments"),
		"runtimeFactSourceAuthorityDigest": runtimeAuthority["authorityDigest"],
		"registrationReceiptDigest":        registrationReceiptDigest,
	}
	ownerIdentityDigest := attemptAuthorityMigrationCanonicalDigest(t, ownerIdentity)
	preEffectIntent := map[string]any{
		"format": "prodivix.agent-evaluation-capability-pre-effect-intent", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": descriptorDigest, "caseId": ownerIdentity["caseId"],
		"materialDigest": ownerIdentity["materialDigest"], "turnIndex": 0,
		"invocationId": ownerIdentity["invocationId"], "toolId": ownerIdentity["toolId"],
		"toolCallId": ownerIdentity["toolCallId"], "providerToolCallId": ownerIdentity["providerToolCallId"],
		"providerRequestDigest":      ownerIdentity["providerRequestDigest"],
		"argumentsDigest":            ownerIdentity["argumentsDigest"],
		"runtimeFactSourceAuthority": runtimeAuthority, "registrationReceiptDigest": registrationReceiptDigest,
		"ownerRequestId":     "capability-effect-owner-request." + strings.TrimPrefix(ownerIdentityDigest, "sha256-"),
		"ownerRequestDigest": ownerIdentityDigest,
	}
	preEffectIntentDigest := attemptAuthorityMigrationSelfDigest(t, preEffectIntent, "intentDigest")
	preEffectIntentBytes := attemptAuthorityMigrationCanonicalBytes(t, preEffectIntent)
	claimedAt := fixture.claimedAt.Add(20 * time.Minute)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,grant_digest,shard_lease_owner_id,shard_lease_generation,
		verification_grant_generation,verification_grant_receipt_set_digest,state,claim_generation,
		claimed_at,pre_effect_intent_digest,pre_effect_intent_json,pre_effect_intent_bytes
	) VALUES ($1,$2,$3,'provider-capability','tool.execute','capability-runtime/execute-tool',
		$4,$5,$6,$7,$8,$9,'lease-owner-v45-shared-effect',1,1,$10,'claimed',1,$11,$12,$13::jsonb,$14)`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, requestDigest,
		attemptAuthorityMigrationDigest("fresh-v45-shared-effect-binding"), ownerImplementationDigest,
		attemptID, descriptorDigest, attemptAuthorityMigrationDigest("fresh-v45-shared-effect-grant"),
		attemptAuthorityMigrationDigest("fresh-v45-shared-effect-verification-grants"), claimedAt,
		preEffectIntentDigest, string(preEffectIntentBytes), preEffectIntentBytes); err != nil {
		t.Fatalf("claim fresh v45 shared-effect authority: %v", err)
	}
	stageDigest := attemptAuthorityMigrationDigest("fresh-v45-shared-effect-stage")
	observationSetDigest := attemptAuthorityMigrationDigest("fresh-v45-shared-effect-observations")
	dispatchedAt := claimedAt.Add(time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched',stage_digest=$4,
			provider_capability_observation_receipt_set_digest=$5,dispatched_at=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, stageDigest, observationSetDigest, dispatchedAt); err != nil {
		t.Fatalf("dispatch fresh v45 shared-effect authority: %v", err)
	}
	response := map[string]any{
		"executionAuthorityKind": "shared-effect", "outcome": "supported",
		"result": map[string]any{"attemptId": attemptID, "status": "completed"},
	}
	responseBytes := attemptAuthorityMigrationCanonicalBytes(t, response)
	responseDigest := attemptAuthorityMigrationDigest(string(responseBytes))
	dispatchAckDigest := attemptAuthorityMigrationDigest("fresh-v45-shared-effect-dispatch-ack")
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET dispatch_ack_digest=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, dispatchAckDigest); err == nil {
		t.Fatal("shared-effect result ingress accepted an ACK without its response")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_digest=$4,response_bytes=$5
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, responseDigest, responseBytes); err == nil {
		t.Fatal("shared-effect result ingress accepted a response without its ACK")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_digest=$4,response_bytes=$5,dispatch_ack_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, responseDigest, responseBytes, dispatchAckDigest); err != nil {
		t.Fatalf("persist fresh v45 shared-effect result before return: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_digest=$4,response_bytes=$5,dispatch_ack_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, responseDigest, responseBytes, dispatchAckDigest); err != nil {
		t.Fatalf("replay exact fresh v45 shared-effect result ingress: %v", err)
	}
	for name, update := range map[string]string{
		"response digest": `response_digest='` + attemptAuthorityMigrationDigest("swapped-shared-effect-response") + `'`,
		"response bytes":  `response_bytes='{"executionAuthorityKind":"shared-effect","outcome":"failed"}'::bytea`,
		"dispatch ACK":    `dispatch_ack_digest='` + attemptAuthorityMigrationDigest("swapped-shared-effect-ack") + `'`,
	} {
		if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests SET `+update+`
			WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
			fixture.planDigest, requestDigest); err == nil {
			t.Fatalf("shared-effect result ingress accepted swapped %s", name)
		}
	}
	sealedAt := dispatchedAt.Add(time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed',sealed_at=$4,response_digest=$5
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, sealedAt,
		attemptAuthorityMigrationDigest("swapped-shared-effect-seal-response")); err == nil {
		t.Fatal("shared-effect seal accepted a response commitment swap")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed',sealed_at=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, sealedAt); err != nil {
		t.Fatalf("seal fresh v45 shared-effect result: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_bytes=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest, []byte(`{"late":"mutation"}`)); err == nil {
		t.Fatal("sealed shared-effect result accepted a late byte mutation")
	}
	var state, storedResponseDigest, storedAck string
	var storedResponseBytes []byte
	if err := db.QueryRowContext(ctx, `SELECT state,response_digest,response_bytes,dispatch_ack_digest
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, requestDigest).Scan(&state, &storedResponseDigest, &storedResponseBytes,
		&storedAck); err != nil {
		t.Fatalf("read sealed shared-effect result: %v", err)
	}
	if state != "sealed" || storedResponseDigest != responseDigest ||
		!bytes.Equal(storedResponseBytes, responseBytes) || storedAck != dispatchAckDigest {
		t.Fatalf("sealed shared-effect durable result drifted: state=%q response=%q ack=%q bytes=%q",
			state, storedResponseDigest, storedAck, storedResponseBytes)
	}
}

type v45CapabilityProbeFixture struct {
	namespaceID                      string
	repositoryCommit                 string
	planDigest                       string
	requestDigest                    string
	providerConfigurationID          string
	providerConfigurationDigest      string
	protocolFamily                   string
	modelID                          string
	modelLineageDigest               string
	capabilityProfileID              string
	capabilityProfileDigest          string
	capabilityDescriptorDigest       string
	capabilityID                     string
	adapterDigest                    string
	ownerImplementationDigest        string
	authorityIssuerID                string
	targetID                         string
	targetDigest                     string
	optionalSupportAuthorityDigest   string
	runtimeFactSourceAuthorityDigest string
	runtimeSourceAuthorityID         string
	runtimeSourceRouteBinding        string
	registrationAuthorityIssuerID    string
	registrationReceiptDigest        string
	stageDigest                      string
	dispatchAckDigest                string
	evidenceDigest                   string
	responseDigest                   string
	planJSON                         []byte
	plannedAt                        time.Time
	planExpiresAt                    time.Time
}

var v45RuntimeFactSourceRegistrationProfiles = []struct {
	profileID     string
	profileDigest string
	capabilityID  string
	sourceKind    string
}{
	{
		profileID:     "g4-provider-background-job",
		profileDigest: "sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195",
		capabilityID:  "provider.background-job", sourceKind: "sealed-provider-response-metadata",
	},
	{
		profileID:     "g4-provider-hosted-retrieval-core",
		profileDigest: "sha256-666c6df670c77605562ff82765013291f99045f36edcb8db0af209267c91565d",
		capabilityID:  "provider.hosted-retrieval", sourceKind: "sealed-hosted-owner-result",
	},
	{
		profileID:     "g4-provider-hosted-retrieval-document",
		profileDigest: "sha256-8ced3fda38a88c0819a6a2d4603e453f515a9c98efadc7c270af194349c5b90e",
		capabilityID:  "provider.hosted-retrieval", sourceKind: "sealed-hosted-owner-result",
	},
	{
		profileID:     "g4-provider-isolated-cache",
		profileDigest: "sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103",
		capabilityID:  "provider.isolated-cache", sourceKind: "sealed-provider-response-metadata",
	},
	{
		profileID:     "g4-provider-reasoning-continuation",
		profileDigest: "sha256-5c84287b4c1e16fb0c1eda862a8e44754503a3fa0a4b61a16e2d2f2465072d34",
		capabilityID:  "provider.reasoning-continuation", sourceKind: "sealed-provider-response-metadata",
	},
}

type v45CapabilityEffectRequestRefSeed struct {
	namespaceID                            string
	planDigest                             string
	repositoryCommit                       string
	attemptID                              string
	descriptorDigest                       string
	turnIndex                              int64
	invocationID                           string
	bindingKind                            string
	capabilityID                           string
	toolID                                 string
	targetRef                              string
	protocolFamily                         string
	providerConfigurationID                string
	modelLineageDigest                     string
	adapterDigest                          string
	runtimeFactSourceAuthorityDigest       string
	registrationReceiptDigest              string
	issuedAt                               time.Time
	expiresAt                              time.Time
	selectedSourceObservationReceiptDigest string
	selectedSourceHandleDigest             string
	requestDigest                          string
	authorityDigest                        string
	requestRef                             string
	receiptDigest                          string
	request                                map[string]any
	receipt                                map[string]any
	requestBytes                           []byte
	receiptBytes                           []byte
}

func buildV45CapabilityEffectRequestRefSeed(
	t *testing.T,
	seed v45CapabilityEffectRequestRefSeed,
	descriptor map[string]any,
) v45CapabilityEffectRequestRefSeed {
	t.Helper()
	requestBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-request-ref-authority-request", "version": 1,
		"namespaceId": seed.namespaceID, "planDigest": seed.planDigest,
		"repositoryCommit": seed.repositoryCommit, "attemptId": seed.attemptID,
		"descriptorDigest": seed.descriptorDigest, "descriptor": descriptor,
		"turnIndex": seed.turnIndex, "invocationId": seed.invocationID,
		"bindingKind": seed.bindingKind, "capabilityId": seed.capabilityID,
		"toolId": seed.toolID, "targetRef": seed.targetRef,
		"protocolFamily": seed.protocolFamily, "providerConfigurationId": seed.providerConfigurationID,
		"modelLineageDigest": seed.modelLineageDigest, "adapterDigest": seed.adapterDigest,
		"runtimeFactSourceAuthorityDigest": seed.runtimeFactSourceAuthorityDigest,
		"registrationReceiptDigest":        seed.registrationReceiptDigest,
		"issuedAt":                         seed.issuedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                        seed.expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	seed.requestDigest = attemptAuthorityMigrationCanonicalDigest(t, requestBase)
	seed.request = attemptAuthorityMigrationCloneObject(t, requestBase)
	seed.request["requestDigest"] = seed.requestDigest
	seed.requestBytes = attemptAuthorityMigrationCanonicalBytes(t, seed.request)
	authorityBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-request-ref-authority-receipt", "version": 1,
		"namespaceId": seed.namespaceID, "planDigest": seed.planDigest,
		"repositoryCommit": seed.repositoryCommit, "attemptId": seed.attemptID,
		"descriptorDigest": seed.descriptorDigest, "turnIndex": seed.turnIndex,
		"invocationId": seed.invocationID, "bindingKind": seed.bindingKind,
		"capabilityId": seed.capabilityID, "toolId": seed.toolID, "targetRef": seed.targetRef,
		"protocolFamily": seed.protocolFamily, "providerConfigurationId": seed.providerConfigurationID,
		"modelLineageDigest": seed.modelLineageDigest, "adapterDigest": seed.adapterDigest,
		"runtimeFactSourceAuthorityDigest": seed.runtimeFactSourceAuthorityDigest,
		"registrationReceiptDigest":        seed.registrationReceiptDigest,
		"issuedAt":                         seed.issuedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                        seed.expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	seed.authorityDigest = attemptAuthorityMigrationCanonicalDigest(t, authorityBase)
	seed.requestRef = "capability-effect-ref." + seed.bindingKind + "." +
		strings.TrimPrefix(seed.authorityDigest, "sha256-")
	receiptBase := attemptAuthorityMigrationCloneObject(t, authorityBase)
	receiptBase["authorityDigest"] = seed.authorityDigest
	receiptBase["requestRef"] = seed.requestRef
	seed.receiptDigest = attemptAuthorityMigrationCanonicalDigest(t, receiptBase)
	seed.receipt = attemptAuthorityMigrationCloneObject(t, receiptBase)
	seed.receipt["receiptDigest"] = seed.receiptDigest
	seed.receiptBytes = attemptAuthorityMigrationCanonicalBytes(t, seed.receipt)
	return seed
}

func insertV45CapabilityEffectRequestRefSeed(
	db *sql.DB,
	seed v45CapabilityEffectRequestRefSeed,
) error {
	_, err := db.Exec(`INSERT INTO agent_evaluation_capability_effect_request_ref_authorities (
		namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,attempt_id,
		descriptor_digest,turn_index,invocation_id,binding_kind,capability_id,tool_id,target_ref,
		protocol_family,provider_configuration_id,model_lineage_digest,adapter_digest,
		runtime_fact_source_authority_digest,registration_receipt_digest,issued_at,expires_at,
		authority_digest,request_ref,selected_source_observation_receipt_digest,
		selected_source_handle_digest,request_json,request_bytes,receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
		$21,$22,$23,NULLIF($24,''),NULLIF($25,''),$26::jsonb,$27,$28::jsonb,$29,$30)`,
		seed.namespaceID, seed.planDigest, seed.repositoryCommit, seed.requestDigest,
		seed.receiptDigest, seed.attemptID, seed.descriptorDigest, seed.turnIndex,
		seed.invocationID, seed.bindingKind, seed.capabilityID, seed.toolID, seed.targetRef,
		seed.protocolFamily, seed.providerConfigurationID, seed.modelLineageDigest,
		seed.adapterDigest, seed.runtimeFactSourceAuthorityDigest, seed.registrationReceiptDigest,
		seed.issuedAt, seed.expiresAt, seed.authorityDigest, seed.requestRef,
		seed.selectedSourceObservationReceiptDigest, seed.selectedSourceHandleDigest,
		string(seed.requestBytes), seed.requestBytes, string(seed.receiptBytes), seed.receiptBytes,
		seed.issuedAt,
	)
	return err
}

type v45CapabilityEffectRetrievalFixture struct {
	namespaceID                      string
	planDigest                       string
	repositoryCommit                 string
	plannedAt                        time.Time
	planExpiresAt                    time.Time
	providerConfigurationID          string
	protocolFamily                   string
	modelID                          string
	modelLineageDigest               string
	adapterDigest                    string
	capabilityProfileID              string
	capabilityProfileDigest          string
	capabilityDescriptorDigest       string
	capabilityID                     string
	targetID                         string
	targetDigest                     string
	runtimeSourceAuthorityID         string
	runtimeSourceRouteBinding        string
	ownerImplementationDigest        string
	registrationAuthorityIssuerID    string
	registrationReceiptDigest        string
	runtimeFactSourceAuthorityDigest string
	attemptID                        string
	descriptorDigest                 string
	descriptor                       map[string]any
}

func withV45MigrationFixtureUserTriggersDisabled(
	t *testing.T,
	db *sql.DB,
	table string,
	insert func() error,
) {
	t.Helper()
	identifier := pgx.Identifier{table}.Sanitize()
	if _, err := db.Exec("ALTER TABLE " + identifier + " DISABLE TRIGGER USER"); err != nil {
		t.Fatalf("disable %s fixture triggers: %v", table, err)
	}
	defer func() {
		if _, err := db.Exec("ALTER TABLE " + identifier + " ENABLE TRIGGER USER"); err != nil {
			t.Fatalf("restore %s fixture triggers: %v", table, err)
		}
	}()
	if err := insert(); err != nil {
		t.Fatalf("seed %s fixture: %v", table, err)
	}
}

func seedV45CapabilityEffectRetrievalFixture(
	t *testing.T,
	db *sql.DB,
) v45CapabilityEffectRetrievalFixture {
	t.Helper()
	now := time.Now().UTC().Truncate(time.Millisecond)
	fixture := v45CapabilityEffectRetrievalFixture{
		namespaceID:                   "namespace.v45.capability-effect-input",
		planDigest:                    attemptAuthorityMigrationDigest("v45-capability-effect-input-plan"),
		repositoryCommit:              strings.Repeat("e", 40),
		plannedAt:                     now.Add(-time.Minute),
		planExpiresAt:                 now.Add(time.Hour),
		providerConfigurationID:       "provider.configuration.v45-capability-effect",
		protocolFamily:                "openai-responses",
		modelID:                       "model.v45-capability-effect",
		modelLineageDigest:            attemptAuthorityMigrationDigest("v45-capability-effect-model-lineage"),
		adapterDigest:                 attemptAuthorityMigrationDigest("v45-capability-effect-adapter"),
		capabilityProfileID:           v45RuntimeFactSourceRegistrationProfiles[1].profileID,
		capabilityProfileDigest:       v45RuntimeFactSourceRegistrationProfiles[1].profileDigest,
		capabilityDescriptorDigest:    attemptAuthorityMigrationDigest("v45-capability-effect-descriptor"),
		capabilityID:                  "provider.hosted-retrieval",
		targetID:                      "target.v45.capability-effect-retrieval",
		targetDigest:                  attemptAuthorityMigrationDigest("v45-capability-effect-target"),
		runtimeSourceAuthorityID:      "authority.runtime-fact-source.v45-capability-effect",
		runtimeSourceRouteBinding:     "runtime-fact-source.v45-capability-effect",
		ownerImplementationDigest:     attemptAuthorityMigrationDigest("v45-capability-effect-owner"),
		registrationAuthorityIssuerID: "authority.runtime-fact-registration.v45-capability-effect",
	}
	claimedAt := fixture.plannedAt.Add(-time.Minute)
	registeredAt := claimedAt.Add(2 * time.Second)
	updatedAt := registeredAt.Add(time.Second)
	sealedAt := updatedAt.Add(time.Second)
	registrationExpiresAt := fixture.planExpiresAt.Add(10 * time.Minute)
	registrationRequestBase := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-request", "version": 1,
		"namespaceId": fixture.namespaceID, "repositoryCommit": fixture.repositoryCommit,
		"sourceAuthorityKind":                 "shared-durable-capability",
		"sourceKind":                          "sealed-hosted-owner-result",
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"capabilityProfileId":                 fixture.capabilityProfileID,
		"capabilityProfileDigest":             fixture.capabilityProfileDigest,
		"capabilityId":                        fixture.capabilityID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"minimumExpiresAt": fixture.planExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	registrationRequestDigest := attemptAuthorityMigrationCanonicalDigest(t, registrationRequestBase)
	registrationRequest := attemptAuthorityMigrationCloneObject(t, registrationRequestBase)
	registrationRequest["requestDigest"] = registrationRequestDigest
	registrationRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, registrationRequest)
	registrationStageDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-stage", "version": 1,
		"requestDigest":                 registrationRequestDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
	})
	ownerHealthBase := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-health", "version": 1,
		"requestDigest":                       registrationRequestDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceKind":                          "sealed-hosted-owner-result", "routeBinding": fixture.runtimeSourceRouteBinding,
		"status": "ready", "checkedAt": registeredAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt": registrationExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	ownerHealthDigest := attemptAuthorityMigrationCanonicalDigest(t, ownerHealthBase)
	ownerHealth := attemptAuthorityMigrationCloneObject(t, ownerHealthBase)
	ownerHealth["healthDigest"] = ownerHealthDigest
	ownerHealthBytes := attemptAuthorityMigrationCanonicalBytes(t, ownerHealth)
	ownerAdmissionDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-admission", "version": 1,
		"requestDigest": registrationRequestDigest, "ownerHealthDigest": ownerHealthDigest,
		"stageDigest": registrationStageDigest,
	})
	dispatchAckDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-dispatch-ack", "version": 1,
		"requestDigest": registrationRequestDigest, "ownerHealthDigest": ownerHealthDigest,
		"ownerAdmissionDigest": ownerAdmissionDigest, "stageDigest": registrationStageDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
	})
	registrationReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt", "version": 1,
		"namespaceId": fixture.namespaceID, "repositoryCommit": fixture.repositoryCommit,
		"requestDigest": registrationRequestDigest, "sourceAuthorityKind": "shared-durable-capability",
		"sourceKind": "sealed-hosted-owner-result", "sourceAuthorityId": fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"capabilityProfileId":                 fixture.capabilityProfileID,
		"capabilityProfileDigest":             fixture.capabilityProfileDigest,
		"capabilityId":                        fixture.capabilityID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
		"ownerHealthDigest":             ownerHealthDigest, "ownerAdmissionDigest": ownerAdmissionDigest,
		"stageDigest": registrationStageDigest, "dispatchAckDigest": dispatchAckDigest,
		"registeredAt": registeredAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":    registrationExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	fixture.registrationReceiptDigest = attemptAuthorityMigrationCanonicalDigest(t, registrationReceiptBase)
	registrationReceipt := attemptAuthorityMigrationCloneObject(t, registrationReceiptBase)
	registrationReceipt["registrationReceiptDigest"] = fixture.registrationReceiptDigest
	registrationReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, registrationReceipt)
	withV45MigrationFixtureUserTriggersDisabled(t, db,
		"agent_evaluation_runtime_fact_source_owner_registrations", func() error {
			_, err := db.Exec(`INSERT INTO agent_evaluation_runtime_fact_source_owner_registrations (
				namespace_id,repository_commit,request_digest,source_authority_kind,source_kind,
				source_authority_id,source_authority_implementation_digest,route_binding,
				capability_profile_id,capability_profile_digest,capability_id,protocol_family,
				provider_configuration_id,model_id,model_lineage_digest,adapter_digest,minimum_expires_at,
				registration_authority_issuer_id,state,claim_generation,stage_digest,owner_health_digest,
				owner_admission_digest,dispatch_ack_digest,registered_at,expires_at,
				registration_receipt_digest,request_json,request_bytes,owner_health_json,owner_health_bytes,
				receipt_json,receipt_bytes,v45_eligible,claimed_at,dispatched_at,sealed_at,updated_at
			) VALUES ($1,$2,$3,'shared-durable-capability','sealed-hosted-owner-result',$4,$5,$6,$7,$8,
				$9,$10,$11,$12,$13,$14,$15,$16,'sealed',1,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,
				$25,$26::jsonb,$27,$28::jsonb,$29,TRUE,$30,$31,$32,$33)`, fixture.namespaceID,
				fixture.repositoryCommit, registrationRequestDigest, fixture.runtimeSourceAuthorityID,
				fixture.ownerImplementationDigest, fixture.runtimeSourceRouteBinding,
				fixture.capabilityProfileID, fixture.capabilityProfileDigest, fixture.capabilityID,
				fixture.protocolFamily, fixture.providerConfigurationID, fixture.modelID,
				fixture.modelLineageDigest, fixture.adapterDigest, fixture.planExpiresAt,
				fixture.registrationAuthorityIssuerID, registrationStageDigest, ownerHealthDigest,
				ownerAdmissionDigest, dispatchAckDigest, registeredAt, registrationExpiresAt,
				fixture.registrationReceiptDigest, string(registrationRequestBytes), registrationRequestBytes,
				string(ownerHealthBytes), ownerHealthBytes, string(registrationReceiptBytes),
				registrationReceiptBytes, claimedAt, claimedAt.Add(time.Second), sealedAt, updatedAt)
			return err
		})
	runtimeAuthorityBase := map[string]any{
		"kind": "shared-durable-capability", "sourceKind": "sealed-hosted-owner-result",
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"capabilityProfileId":                 fixture.capabilityProfileID,
		"capabilityProfileDigest":             fixture.capabilityProfileDigest,
		"capabilityId":                        fixture.capabilityID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":     fixture.registrationReceiptDigest,
	}
	fixture.runtimeFactSourceAuthorityDigest = attemptAuthorityMigrationCanonicalDigest(t, runtimeAuthorityBase)
	runtimeAuthority := attemptAuthorityMigrationCloneObject(t, runtimeAuthorityBase)
	runtimeAuthority["authorityDigest"] = fixture.runtimeFactSourceAuthorityDigest
	target := map[string]any{
		"targetId": fixture.targetID, "targetDigest": fixture.targetDigest,
		"capabilityProfileId":     fixture.capabilityProfileID,
		"capabilityProfileDigest": fixture.capabilityProfileDigest,
		"protocolFamily":          fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID,
		"modelId":                 fixture.modelID, "modelLineageDigest": fixture.modelLineageDigest,
		"optionalCapabilitySupportAuthority": map[string]any{
			"supportExpectation": "required", "capabilityId": fixture.capabilityID,
			"runtimeFactSourceAuthority": runtimeAuthority,
			"resolvedCapabilityDescriptor": map[string]any{
				"descriptorDigest": fixture.capabilityDescriptorDigest,
			},
		},
	}
	planValue := map[string]any{
		"value": map[string]any{"capabilityQualificationTargets": []any{target}},
	}
	planBytes := attemptAuthorityMigrationCanonicalBytes(t, planValue)
	withV45MigrationFixtureUserTriggersDisabled(t, db, "agent_evaluation_plans", func() error {
		_, err := db.Exec(`INSERT INTO agent_evaluation_plans (
			namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
			plan_json,plan_bytes,planned_at,expires_at
		) VALUES ($1,'plan.v45.capability-effect-input',$2,$3,5880,$4::jsonb,$5,$6,$7)`,
			fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, string(planBytes), planBytes,
			fixture.plannedAt, fixture.planExpiresAt)
		return err
	})
	caseID := "case.v45.capability-effect-retrieval"
	samplingBase := map[string]any{
		"planDigest": fixture.planDigest, "caseId": caseID,
		"capabilityDescriptorDigest": fixture.capabilityDescriptorDigest,
		"targetId":                   fixture.targetID, "targetDigest": fixture.targetDigest,
		"riskClass": "ordinary", "repetitionIndex": 0,
	}
	samplingDigest := attemptAuthorityMigrationCanonicalDigest(t, samplingBase)
	shardDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{"targetId": fixture.targetID})
	fixture.attemptID = "evaluation-attempt:" + strings.TrimPrefix(samplingDigest, "sha256-")
	descriptorBase := map[string]any{
		"attemptId": fixture.attemptID, "planDigest": fixture.planDigest,
		"shardId": "evaluation-shard:" + strings.TrimPrefix(shardDigest, "sha256-"),
		"caseId":  caseID, "capabilityDescriptorDigest": fixture.capabilityDescriptorDigest,
		"targetId": fixture.targetID, "targetDigest": fixture.targetDigest,
		"riskClass": "ordinary", "repetitionIndex": 0, "samplingIdentityDigest": samplingDigest,
	}
	fixture.descriptorDigest = attemptAuthorityMigrationCanonicalDigest(t, descriptorBase)
	fixture.descriptor = attemptAuthorityMigrationCloneObject(t, descriptorBase)
	fixture.descriptor["descriptorDigest"] = fixture.descriptorDigest
	return fixture
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLRunConfigArtifactBinding(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	fixture := seedV41AttemptAuthorityFixture(t, db, "claimed")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	runConfig := map[string]any{
		"format": "prodivix.agent-evaluation-production-run-config", "version": 1,
		"evaluationPlanId": "plan-v41-attempt-authority",
	}
	runConfigBytes := attemptAuthorityMigrationCanonicalBytes(t, runConfig)
	sourceConfigDigest := attemptAuthorityMigrationCanonicalDigest(t, runConfig)
	frozenRunDigest := attemptAuthorityMigrationDigest("v45-run-config-frozen-run")
	bindingBase := map[string]any{
		"format": "prodivix.agent-evaluation-production-run-config-artifact-binding", "version": 1,
		"sourcePlanArtifactName":   "g4-production-run-config",
		"sourcePlanArtifactDigest": "sha256:" + strings.Repeat("b", 64),
		"sourcePlanWorkflowRunId":  "123456789", "sourcePlanWorkflowRunAttempt": 1,
		"runConfigFileName": "production-run-config.json", "runConfigByteLength": len(runConfigBytes),
		"runConfigCanonicalBytesDigest": sourceConfigDigest, "sourceConfigDigest": sourceConfigDigest,
		"frozenRunDigest": frozenRunDigest, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit,
	}
	bindingDigest := attemptAuthorityMigrationCanonicalDigest(t, bindingBase)
	binding := attemptAuthorityMigrationCloneObject(t, bindingBase)
	binding["bindingDigest"] = bindingDigest
	bindingBytes := attemptAuthorityMigrationCanonicalBytes(t, binding)
	storedAt := fixture.claimedAt
	ingressBase := map[string]any{
		"format": "prodivix.agent-evaluation-production-run-config-artifact-ingress", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "runConfigArtifactBinding": binding,
		"runConfig": runConfig,
	}
	ingressDigest := attemptAuthorityMigrationCanonicalDigest(t, ingressBase)
	receiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-production-run-config-artifact-ingress-receipt", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "bindingDigest": bindingDigest,
		"sourceConfigDigest": sourceConfigDigest,
		"storedAt":           storedAt.Format("2006-01-02T15:04:05.000Z"),
		"ingressDigest":      ingressDigest,
	}
	receiptDigest := attemptAuthorityMigrationCanonicalDigest(t, receiptBase)
	receipt := attemptAuthorityMigrationCloneObject(t, receiptBase)
	receipt["receiptDigest"] = receiptDigest
	receiptBytes := attemptAuthorityMigrationCanonicalBytes(t, receipt)
	insertArtifact := func(
		storedBindingDigest string,
		storedBinding map[string]any,
		storedBindingBytes []byte,
		storedTime time.Time,
	) error {
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_production_run_config_artifacts (
			namespace_id,plan_digest,repository_commit,binding_digest,binding_json,binding_bytes,
			run_config_json,run_config_bytes,source_config_digest,frozen_run_digest,ingress_digest,
			receipt_digest,receipt_bytes,stored_at
		) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)`,
			fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, storedBindingDigest,
			string(attemptAuthorityMigrationCanonicalBytes(t, storedBinding)), storedBindingBytes,
			string(runConfigBytes), runConfigBytes, sourceConfigDigest, frozenRunDigest, ingressDigest,
			receiptDigest, receiptBytes, storedTime)
		return err
	}
	if err := insertArtifact(bindingDigest, binding, bindingBytes, fixture.claimedAt.Add(-2*time.Hour)); err == nil {
		t.Fatal("production run-config artifact accepted storedAt outside its plan window")
	}
	if err := insertArtifact(
		attemptAuthorityMigrationDigest("v45-run-config-swapped-binding"), binding, bindingBytes, storedAt,
	); err == nil {
		t.Fatal("production run-config artifact accepted a swapped binding digest")
	}
	if err := insertArtifact(bindingDigest, binding, bindingBytes, storedAt); err != nil {
		t.Fatalf("store exact production run-config artifact: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_production_run_config_artifacts
		SET ingress_digest=$1 WHERE namespace_id=$2 AND plan_digest=$3 AND repository_commit=$4`,
		attemptAuthorityMigrationDigest("v45-run-config-late-mutation"), fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit); err == nil {
		t.Fatal("production run-config artifact accepted a late mutation")
	}
	insertHoldout := func(
		storedBindingDigest string,
		storedBinding map[string]any,
		storedBindingBytes []byte,
		receiptLabel string,
	) error {
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_holdout_closures (
			namespace_id,plan_digest,repository_commit,run_config_artifact_binding_digest,
			run_config_artifact_binding_json,run_config_artifact_binding_bytes,source_config_digest,
			frozen_run_digest,config_commitment_digest,config_commitment_bytes,
			protected_evidence_set_digest,access_policy_digest,encrypted_corpus_digest,
			secret_canary_set_digest,protected_holdout_canary_set_digest,scan_receipt_digest,
			receipt_digest,receipt_bytes,sealed_at
		) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
			fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, storedBindingDigest,
			string(attemptAuthorityMigrationCanonicalBytes(t, storedBinding)), storedBindingBytes,
			sourceConfigDigest, frozenRunDigest,
			attemptAuthorityMigrationDigest("v45-run-config-commitment"), []byte(`{}`),
			attemptAuthorityMigrationDigest("v45-run-config-protected-evidence"),
			attemptAuthorityMigrationDigest("v45-run-config-access-policy"),
			attemptAuthorityMigrationDigest("v45-run-config-encrypted-corpus"),
			attemptAuthorityMigrationDigest("v45-run-config-secret-canary"),
			attemptAuthorityMigrationDigest("v45-run-config-protected-canary"),
			attemptAuthorityMigrationDigest("v45-run-config-scan"),
			attemptAuthorityMigrationDigest(receiptLabel), []byte(`{}`), storedAt.Add(time.Second))
		return err
	}
	missingBinding := attemptAuthorityMigrationCloneObject(t, binding)
	missingBindingDigest := attemptAuthorityMigrationDigest("v45-run-config-missing-artifact")
	missingBinding["bindingDigest"] = missingBindingDigest
	missingBindingBytes := attemptAuthorityMigrationCanonicalBytes(t, missingBinding)
	if err := insertHoldout(
		missingBindingDigest, missingBinding, missingBindingBytes, "v45-run-config-missing-holdout-receipt",
	); err == nil {
		t.Fatal("holdout closure accepted a missing run-config artifact binding")
	}
	if err := insertHoldout(bindingDigest, binding, bindingBytes, "v45-run-config-holdout-receipt"); err != nil {
		t.Fatalf("store holdout closure with exact run-config artifact binding: %v", err)
	}
	var storedBindingJSON []byte
	if err := db.QueryRowContext(ctx, `SELECT run_config_artifact_binding_json::text
		FROM agent_evaluation_holdout_closures
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit).Scan(&storedBindingJSON); err != nil {
		t.Fatalf("read holdout run-config artifact binding: %v", err)
	}
	var storedBindingValue map[string]any
	if err := json.Unmarshal(storedBindingJSON, &storedBindingValue); err != nil ||
		storedBindingValue["bindingDigest"] != bindingDigest {
		t.Fatalf("holdout run-config artifact binding drifted: value=%v err=%v", storedBindingValue, err)
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLRejectsPathOnlyClosureUpgrade(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 44)
	fixture := seedV41AttemptAuthorityFixture(t, db, "claimed")
	legacyPath := "specs/evaluation/production-run-config.json"
	if _, err := db.Exec(`INSERT INTO agent_evaluation_holdout_closures (
		namespace_id,plan_digest,repository_commit,source_config_path,source_config_digest,
		frozen_run_digest,config_commitment_digest,config_commitment_bytes,
		protected_evidence_set_digest,access_policy_digest,encrypted_corpus_digest,
		secret_canary_set_digest,protected_holdout_canary_set_digest,scan_receipt_digest,
		receipt_digest,receipt_bytes,sealed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, legacyPath,
		attemptAuthorityMigrationDigest("v44-path-source-config"),
		attemptAuthorityMigrationDigest("v44-path-frozen-run"),
		attemptAuthorityMigrationDigest("v44-path-commitment"), []byte(`{}`),
		attemptAuthorityMigrationDigest("v44-path-protected-evidence"),
		attemptAuthorityMigrationDigest("v44-path-access-policy"),
		attemptAuthorityMigrationDigest("v44-path-corpus"),
		attemptAuthorityMigrationDigest("v44-path-secret-canary"),
		attemptAuthorityMigrationDigest("v44-path-protected-canary"),
		attemptAuthorityMigrationDigest("v44-path-scan"),
		attemptAuthorityMigrationDigest("v44-path-receipt"), []byte(`{}`), fixture.claimedAt,
	); err != nil {
		t.Fatalf("seed path-only v44 holdout closure: %v", err)
	}
	err := RunMigrations(context.Background(), db, 2*time.Minute)
	if err == nil || !strings.Contains(err.Error(), "path-only evaluation closure") {
		t.Fatalf("path-only v44 closure upgrade error=%v, want fail-closed preflight", err)
	}
	var preservedPath string
	if err := db.QueryRow(`SELECT source_config_path FROM agent_evaluation_holdout_closures
		WHERE namespace_id=$1 AND plan_digest=$2`, fixture.namespaceID, fixture.planDigest).Scan(&preservedPath); err != nil {
		t.Fatalf("read preserved path-only closure: %v", err)
	}
	if preservedPath != legacyPath {
		t.Fatalf("path-only closure bytes drifted: path=%q want=%q", preservedPath, legacyPath)
	}
	var v45Recorded bool
	if err := db.QueryRow(`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=45)`).Scan(&v45Recorded); err != nil {
		t.Fatalf("read failed v45 migration registry: %v", err)
	}
	if v45Recorded {
		t.Fatal("failed path-only closure upgrade recorded v45")
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityEffectInputAuthority(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	fixture := seedV45CapabilityEffectRetrievalFixture(t, db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	issuedAt := time.Now().UTC().Truncate(time.Millisecond)
	requestRefSeed := buildV45CapabilityEffectRequestRefSeed(t, v45CapabilityEffectRequestRefSeed{
		namespaceID: fixture.namespaceID, planDigest: fixture.planDigest,
		repositoryCommit: fixture.repositoryCommit, attemptID: fixture.attemptID,
		descriptorDigest: fixture.descriptorDigest, turnIndex: 0,
		invocationID: "invocation.v45.capability-effect-retrieval",
		bindingKind:  "hosted-retrieval-query", capabilityID: fixture.capabilityID,
		toolID: "provider.retrieval.search", targetRef: "business-target.v45.retrieval",
		protocolFamily: fixture.protocolFamily, providerConfigurationID: fixture.providerConfigurationID,
		modelLineageDigest: fixture.modelLineageDigest, adapterDigest: fixture.adapterDigest,
		runtimeFactSourceAuthorityDigest: fixture.runtimeFactSourceAuthorityDigest,
		registrationReceiptDigest:        fixture.registrationReceiptDigest,
		issuedAt:                         issuedAt, expiresAt: issuedAt.Add(2 * time.Minute),
	}, fixture.descriptor)
	swappedRegistration := requestRefSeed
	swappedRegistration.registrationReceiptDigest = attemptAuthorityMigrationDigest(
		"v45-capability-effect-swapped-registration",
	)
	swappedRegistration = buildV45CapabilityEffectRequestRefSeed(t, swappedRegistration, fixture.descriptor)
	if err := insertV45CapabilityEffectRequestRefSeed(db, swappedRegistration); err == nil {
		t.Fatal("retrieval request-ref accepted a swapped runtime registration")
	}
	if err := insertV45CapabilityEffectRequestRefSeed(db, requestRefSeed); err != nil {
		t.Fatalf("store retrieval request-ref authority: %v", err)
	}

	arguments := map[string]any{"requestRef": requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef}
	argumentsDigest := attemptAuthorityMigrationCanonicalDigest(t, arguments)
	providerToolCallID := "provider-tool-call.v45.capability-effect"
	payload := map[string]any{
		"itemId": providerToolCallID, "name": "provider.retrieval.search",
		"arguments": arguments, "argumentsDigest": argumentsDigest,
	}
	payloadDigest := attemptAuthorityMigrationCanonicalDigest(t, payload)
	recordedAt := issuedAt.Add(4 * time.Second)
	durableBase := map[string]any{
		"eventId":      "event.v45.capability-effect.tool-call",
		"invocationId": requestRefSeed.invocationID, "sequence": 0, "type": "tool-call",
		"payloadDigest": payloadDigest, "occurredAt": recordedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	selectedEventDigest := attemptAuthorityMigrationCanonicalDigest(t, durableBase)
	durableEvent := attemptAuthorityMigrationCloneObject(t, durableBase)
	durableEvent["eventDigest"] = selectedEventDigest
	selectedEvent := map[string]any{"durableEvent": durableEvent, "payload": payload}
	normalizedEvents := []any{selectedEvent}
	normalizedEventSetDigest := attemptAuthorityMigrationCanonicalDigest(t, normalizedEvents)
	selectedEventBytes := attemptAuthorityMigrationCanonicalBytes(t, selectedEvent)
	normalizedEventsBytes := attemptAuthorityMigrationCanonicalBytes(t, normalizedEvents)
	currentRequestBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-current-turn-event-request", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": fixture.attemptID,
		"descriptorDigest": fixture.descriptorDigest, "turnIndex": 0,
		"invocationId":                     requestRefSeed.invocationID,
		"requestRefAuthorityReceiptDigest": requestRefSeed.receiptDigest,
		"requestRef":                       requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef,
		"providerToolCallId": providerToolCallID, "toolId": "provider.retrieval.search",
		"argumentsDigest": argumentsDigest, "selectedEventDigest": selectedEventDigest,
		"normalizedEvents": normalizedEvents, "normalizedEventSetDigest": normalizedEventSetDigest,
		"recordedAt": recordedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	providerRequestDigest := attemptAuthorityMigrationDigest("v45-capability-effect-provider-request")
	responseDigest := attemptAuthorityMigrationDigest("v45-capability-effect-provider-response")
	dispatchIntentDigest := attemptAuthorityMigrationDigest("v45-capability-effect-dispatch")
	transportReceiptDigest := attemptAuthorityMigrationDigest("v45-capability-effect-transport")
	resultSpoolReceiptDigest := attemptAuthorityMigrationDigest("v45-capability-effect-spool")
	currentReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-current-turn-event-receipt", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": fixture.attemptID,
		"descriptorDigest": fixture.descriptorDigest, "turnIndex": 0,
		"invocationId":                     requestRefSeed.invocationID,
		"requestRefAuthorityReceiptDigest": requestRefSeed.receiptDigest,
		"requestRef":                       requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef,
		"providerRequestDigest": providerRequestDigest, "responseDigest": responseDigest,
		"dispatchIntentDigest": dispatchIntentDigest, "transportReceiptDigest": transportReceiptDigest,
		"resultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"normalizedEventSetDigest": normalizedEventSetDigest, "selectedEventDigest": selectedEventDigest,
		"providerToolCallId": providerToolCallID, "toolId": "provider.retrieval.search",
		"argumentsDigest": argumentsDigest,
		"recordedAt":      recordedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	insertCurrentEvent := func(
		requestBase map[string]any,
		receiptBase map[string]any,
		selectedDigest string,
		storedResponseDigest string,
	) error {
		requestDigest := attemptAuthorityMigrationCanonicalDigest(t, requestBase)
		request := attemptAuthorityMigrationCloneObject(t, requestBase)
		request["requestDigest"] = requestDigest
		requestBytes := attemptAuthorityMigrationCanonicalBytes(t, request)
		receiptDigest := attemptAuthorityMigrationCanonicalDigest(t, receiptBase)
		receipt := attemptAuthorityMigrationCloneObject(t, receiptBase)
		receipt["receiptDigest"] = receiptDigest
		receiptBytes := attemptAuthorityMigrationCanonicalBytes(t, receipt)
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_current_turn_events (
			namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,
			request_ref_authority_receipt_digest,request_ref,target_ref,attempt_id,descriptor_digest,
			turn_index,invocation_id,provider_request_digest,response_digest,dispatch_intent_digest,
			transport_receipt_digest,result_spool_receipt_digest,normalized_event_set_digest,
			selected_event_digest,provider_tool_call_id,tool_id,arguments_digest,recorded_at,
			request_json,request_bytes,normalized_events_json,normalized_events_bytes,
			selected_event_json,selected_event_bytes,receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
			$21,$22,$23::jsonb,$24,$25::jsonb,$26,$27::jsonb,$28,$29::jsonb,$30)`,
			fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, requestDigest,
			receiptDigest, requestRefSeed.receiptDigest, requestRefSeed.requestRef,
			requestRefSeed.targetRef, fixture.attemptID, fixture.descriptorDigest,
			requestRefSeed.invocationID, providerRequestDigest, storedResponseDigest,
			dispatchIntentDigest, transportReceiptDigest, resultSpoolReceiptDigest,
			normalizedEventSetDigest, selectedDigest, providerToolCallID, "provider.retrieval.search",
			argumentsDigest, recordedAt, string(requestBytes), requestBytes,
			string(normalizedEventsBytes), normalizedEventsBytes, string(selectedEventBytes),
			selectedEventBytes, string(receiptBytes), receiptBytes)
		return err
	}
	if err := insertCurrentEvent(currentRequestBase, currentReceiptBase, selectedEventDigest, responseDigest); err == nil {
		t.Fatal("retrieval current event accepted a missing raw transport tuple")
	}

	registryRequestedAt := issuedAt.Add(5 * time.Second)
	registryRequestBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-input-authority-registry-request", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit":                 fixture.repositoryCommit,
		"requestRefAuthorityReceiptDigest": requestRefSeed.receiptDigest,
		"requestRef":                       requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef,
		"requestedAt": registryRequestedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	registryRequestDigest := attemptAuthorityMigrationCanonicalDigest(t, registryRequestBase)
	registryRequest := attemptAuthorityMigrationCloneObject(t, registryRequestBase)
	registryRequest["requestDigest"] = registryRequestDigest
	registryRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, registryRequest)
	registryReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-input-authority-registry-receipt", "version": 1,
		"bindingKind": requestRefSeed.bindingKind, "capabilityId": requestRefSeed.capabilityID,
		"requestRef": requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef,
		"requestRefAuthority":              requestRefSeed.receipt,
		"requestRefAuthorityReceiptDigest": requestRefSeed.receiptDigest,
		"sourceAttemptId":                  fixture.attemptID, "sourceTurnIndex": 0,
		"sourceInvocationId":          requestRefSeed.invocationID,
		"sourceProviderRequestDigest": providerRequestDigest, "sourceResponseDigest": responseDigest,
		"sourceDispatchIntentDigest":     dispatchIntentDigest,
		"sourceTransportReceiptDigest":   transportReceiptDigest,
		"sourceResultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"sourceNormalizedEventSetDigest": normalizedEventSetDigest,
		"sourceObservationReceiptDigest": nil, "sourceFactKind": "provider-event",
		"sourceProviderEventType": "tool-call", "sourceProviderToolCallId": providerToolCallID,
		"sourceToolId": "provider.retrieval.search", "sourceArgumentsDigest": argumentsDigest,
		"sourceHandleDigest":    selectedEventDigest,
		"stateVaultSealRequest": nil, "stateVaultSealReceipt": nil,
		"protocolFamily":          fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID,
		"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
	}
	insertRegistry := func(receiptBase map[string]any, sourceHandle string) error {
		receiptDigest := attemptAuthorityMigrationCanonicalDigest(t, receiptBase)
		receipt := attemptAuthorityMigrationCloneObject(t, receiptBase)
		receipt["receiptDigest"] = receiptDigest
		receiptBytes := attemptAuthorityMigrationCanonicalBytes(t, receipt)
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_input_authority_registry_receipts (
			namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,
			request_ref_authority_receipt_digest,request_ref,target_ref,binding_kind,
			source_attempt_id,source_turn_index,source_invocation_id,source_observation_receipt_digest,
			source_handle_digest,requested_at,request_json,request_bytes,receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,NULL,$12,$13,$14::jsonb,$15,$16::jsonb,$17)`,
			fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, registryRequestDigest,
			receiptDigest, requestRefSeed.receiptDigest, requestRefSeed.requestRef,
			requestRefSeed.targetRef, requestRefSeed.bindingKind, fixture.attemptID,
			requestRefSeed.invocationID, sourceHandle, registryRequestedAt,
			string(registryRequestBytes), registryRequestBytes, string(receiptBytes), receiptBytes)
		return err
	}
	if err := insertRegistry(registryReceiptBase, selectedEventDigest); err == nil {
		t.Fatal("retrieval input registry accepted a missing current-turn event")
	}

	rawCreatedAt := issuedAt.Add(time.Second)
	rawCompletedAt := issuedAt.Add(3 * time.Second)
	demandDigest := attemptAuthorityMigrationDigest("v45-capability-effect-demand")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_budget_reservations (
		namespace_id,plan_digest,reservation_id,ledger_revision,demand_digest,demand_json,demand_bytes,reserved_at
	) VALUES ($1,$2,'reservation.v45.capability-effect',0,$3,'{}'::jsonb,$4,$5)`,
		fixture.namespaceID, fixture.planDigest, demandDigest, []byte(`{}`), rawCreatedAt); err != nil {
		t.Fatalf("store retrieval budget reservation: %v", err)
	}
	descriptorBytes := attemptAuthorityMigrationCanonicalBytes(t, fixture.descriptor)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_transport_dispatch_intents (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,descriptor_json,
		descriptor_bytes,turn_index,budget_reservation_id,intent_id,invocation_id,protocol_family,
		provider_configuration_id,model_lineage_digest,inference_configuration_digest,demand_digest,
		request_digest,endpoint_id,endpoint_class,request_body_digest,request_bytes,intent_digest,
		intent_json,intent_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,0,'reservation.v45.capability-effect',
		'intent.v45.capability-effect',$8,$9,$10,$11,$12,$13,$14,
		'endpoint.v45.capability-effect','first-party-hosted',$14,1,$15,'{}'::jsonb,$16,$17)`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, fixture.attemptID,
		fixture.descriptorDigest, string(descriptorBytes), descriptorBytes, requestRefSeed.invocationID,
		fixture.protocolFamily, fixture.providerConfigurationID, fixture.modelLineageDigest,
		attemptAuthorityMigrationDigest("v45-capability-effect-inference"), demandDigest,
		providerRequestDigest, dispatchIntentDigest, []byte(`{}`), rawCreatedAt); err != nil {
		t.Fatalf("store retrieval dispatch intent: %v", err)
	}
	responseBodyDigest := attemptAuthorityMigrationDigest("v45-capability-effect-response-body")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_transport_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,
		intent_digest,receipt_id,invocation_id,provider_configuration_id,provider_request_id,
		dispatch_state,outcome,response_body_digest,receipt_digest,receipt_json,receipt_bytes,
		started_at,completed_at,closed_at
	) VALUES ($1,$2,$3,$4,$5,0,$6,'transport.v45.capability-effect',$7,$8,NULL,
		'dispatched','completed',$9,$10,'{}'::jsonb,$11,$12,$13,$13)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, fixture.attemptID, fixture.descriptorDigest,
		dispatchIntentDigest, requestRefSeed.invocationID, fixture.providerConfigurationID,
		responseBodyDigest, transportReceiptDigest, []byte(`{}`), rawCreatedAt, rawCompletedAt); err != nil {
		t.Fatalf("store retrieval transport receipt: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_result_spool_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,
		invocation_id,spool_ref,dispatch_intent_digest,transport_receipt_digest,algorithm,
		encryption_profile_digest,key_ref_digest,key_id,key_version,aad_digest,envelope_digest,
		ciphertext_digest,ciphertext_size_bytes,response_body_digest,normalized_event_set_digest,
		response_digest,opaque_continuation_digest,retention_class,retention_policy_digest,
		receipt_digest,receipt_json,receipt_bytes,created_at,expires_at
	) VALUES ($1,$2,$3,$4,$5,0,$6,'spool.v45.capability-effect',$7,$8,'aes-256-gcm',
		$9,$10,'key.v45.capability-effect',1,$11,$12,$13,1,$14,$15,$16,NULL,
		'attempt-resume-only',$17,$18,'{}'::jsonb,$19,$20,$21)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, fixture.attemptID, fixture.descriptorDigest,
		requestRefSeed.invocationID, dispatchIntentDigest, transportReceiptDigest,
		attemptAuthorityMigrationDigest("v45-capability-effect-encryption"),
		attemptAuthorityMigrationDigest("v45-capability-effect-key-ref"),
		attemptAuthorityMigrationDigest("v45-capability-effect-aad"),
		attemptAuthorityMigrationDigest("v45-capability-effect-envelope"),
		attemptAuthorityMigrationDigest("v45-capability-effect-ciphertext"), responseBodyDigest,
		normalizedEventSetDigest, responseDigest,
		attemptAuthorityMigrationDigest("v45-capability-effect-retention"),
		resultSpoolReceiptDigest, []byte(`{}`), rawCompletedAt, fixture.planExpiresAt); err != nil {
		t.Fatalf("store retrieval result spool receipt: %v", err)
	}
	swappedResponseReceipt := attemptAuthorityMigrationCloneObject(t, currentReceiptBase)
	swappedResponseDigest := attemptAuthorityMigrationDigest("v45-capability-effect-swapped-response")
	swappedResponseReceipt["responseDigest"] = swappedResponseDigest
	if err := insertCurrentEvent(
		currentRequestBase, swappedResponseReceipt, selectedEventDigest, swappedResponseDigest,
	); err == nil {
		t.Fatal("retrieval current event accepted a recomputed response-root swap")
	}
	swappedSelectedRequest := attemptAuthorityMigrationCloneObject(t, currentRequestBase)
	swappedSelectedReceipt := attemptAuthorityMigrationCloneObject(t, currentReceiptBase)
	swappedSelectedDigest := attemptAuthorityMigrationDigest("v45-capability-effect-swapped-event")
	swappedSelectedRequest["selectedEventDigest"] = swappedSelectedDigest
	swappedSelectedReceipt["selectedEventDigest"] = swappedSelectedDigest
	if err := insertCurrentEvent(
		swappedSelectedRequest, swappedSelectedReceipt, swappedSelectedDigest, responseDigest,
	); err == nil {
		t.Fatal("retrieval current event accepted a selected-event swap")
	}
	if err := insertCurrentEvent(
		currentRequestBase, currentReceiptBase, selectedEventDigest, responseDigest,
	); err != nil {
		t.Fatalf("store retrieval current-turn event: %v", err)
	}
	stateVaultLeak := attemptAuthorityMigrationCloneObject(t, registryReceiptBase)
	stateVaultLeak["stateVaultSealRequest"] = map[string]any{"unexpected": "stateful-preimage"}
	if err := insertRegistry(stateVaultLeak, selectedEventDigest); err == nil {
		t.Fatal("retrieval input registry accepted a state-vault preimage")
	}
	swappedRegistryReceipt := attemptAuthorityMigrationCloneObject(t, registryReceiptBase)
	swappedRegistryHandle := attemptAuthorityMigrationDigest("v45-capability-effect-swapped-registry-handle")
	swappedRegistryReceipt["sourceHandleDigest"] = swappedRegistryHandle
	if err := insertRegistry(swappedRegistryReceipt, swappedRegistryHandle); err == nil {
		t.Fatal("retrieval input registry accepted a selected-event source swap")
	}
	if err := insertRegistry(registryReceiptBase, selectedEventDigest); err != nil {
		t.Fatalf("store retrieval input authority registry receipt: %v", err)
	}
	for table := range map[string]struct{}{
		"agent_evaluation_capability_effect_request_ref_authorities":           {},
		"agent_evaluation_capability_effect_current_turn_events":               {},
		"agent_evaluation_capability_effect_input_authority_registry_receipts": {},
	} {
		var count int
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+pgx.Identifier{table}.Sanitize()+
			" WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3",
			fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit).Scan(&count); err != nil {
			t.Fatalf("read %s capability-effect rows: %v", table, err)
		}
		if count != 1 {
			t.Fatalf("%s capability-effect rows=%d, want 1", table, count)
		}
		if _, err := db.ExecContext(ctx, "UPDATE "+pgx.Identifier{table}.Sanitize()+
			" SET repository_commit=repository_commit WHERE namespace_id=$1 AND plan_digest=$2",
			fixture.namespaceID, fixture.planDigest); err == nil {
			t.Fatalf("%s accepted a late mutation", table)
		}
	}
}

func attemptAuthorityMigrationJSON(t *testing.T, value any) []byte {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func attemptAuthorityMigrationCloneObject(t *testing.T, value map[string]any) map[string]any {
	t.Helper()
	encoded := attemptAuthorityMigrationJSON(t, value)
	var clone map[string]any
	if err := json.Unmarshal(encoded, &clone); err != nil {
		t.Fatal(err)
	}
	return clone
}

type attemptAuthorityMigrationStateVaultSeal struct {
	ownerInstanceID              string
	authorityDigest              string
	purpose                      string
	attemptID                    string
	invocationID                 string
	generation                   int64
	taskID                       string
	runID                        string
	providerStateReferenceKind   string
	providerStateReferenceDigest string
	opaqueProviderStateRef       string
	sealRequestDigest            string
	sealRequest                  map[string]any
	sealRequestBytes             []byte
	sealReceiptDigest            string
	sealReceipt                  map[string]any
	sealReceiptBytes             []byte
	stateKeyCreationDigest       string
	aadDigest                    string
	aadBytes                     []byte
	ciphertextDigest             string
	ciphertextBytes              []byte
	ciphertextNonce              []byte
	wrappedStateKeyDigest        string
	wrappedStateKeyBytes         []byte
	wrappedStateKeyNonce         []byte
	expiresAt                    time.Time
	sealedAt                     time.Time
}

func attemptAuthorityMigrationStateVaultAuthority(t *testing.T) map[string]any {
	t.Helper()
	implementationDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"component": "production-native-provider-state-vault", "version": 1,
		"algorithm": "aes-256-gcm", "ciphertextEncoding": "identity-safe-base64url",
		"plaintextResidency": "callback-only",
	})
	keyReferenceDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"keyId": "g4-model-evaluation-native-provider-state-vault", "keyVersion": 1,
		"keyEnvironmentName": "PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64",
		"keyRef":             "secret://g4-model-evaluation/native-provider-state-vault",
	})
	encryptionProfileDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"algorithm": "aes-256-gcm", "nonceBytes": 12, "authenticationTagBytes": 16,
		"aadFormat": "prodivix.agent-native-provider-state-vault-aad", "aadVersion": 1,
		"maximumPlaintextBytes": 512,
	})
	retentionPolicyDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"maximumAgeMs": 125000, "disposition": "expire-after-source-seal-or-maximum-lifetime",
	})
	deletionReceiptPolicyDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"plaintextResidency": "callback-only", "encryptedReferenceDisposition": "cryptographic-expiry",
		"deletionReceipt": "source-seal-or-expiry-authority",
	})
	authority := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-authority", "version": 1,
		"authorityId":                   "evaluation.native-provider-state-vault.owner.v1",
		"authorityImplementationDigest": implementationDigest,
		"storageMode":                   "server-side-vault-record",
		"cryptographicExpiryMode":       "per-state-data-key-destroy",
		"algorithm":                     "aes-256-gcm",
		"keyReferenceDigest":            keyReferenceDigest,
		"keyVersion":                    1,
		"encryptionProfileDigest":       encryptionProfileDigest,
		"retentionPolicyDigest":         retentionPolicyDigest,
		"deletionReceiptPolicyDigest":   deletionReceiptPolicyDigest,
		"maximumLifetimeMs":             125000,
		"maximumLifecycleAckDelayMs":    30000,
		"reconciliationMode":            "request-digest-idempotent",
	}
	attemptAuthorityMigrationSelfDigest(t, authority, "authorityDigest")
	return authority
}

func seedAttemptAuthorityMigrationStateVaultRunConfig(
	t *testing.T,
	db *sql.DB,
	namespaceID, planDigest, repositoryCommit string,
	storedAt time.Time,
	authority map[string]any,
) {
	t.Helper()
	runConfig := map[string]any{
		"format": "prodivix.agent-evaluation-production-run-config", "version": 1,
		"nativeProviderStateVaultEncryption": map[string]any{"authority": authority},
	}
	runConfigBytes := attemptAuthorityMigrationCanonicalBytes(t, runConfig)
	sourceConfigDigest := attemptAuthorityMigrationCanonicalDigest(t, runConfig)
	frozenRunDigest := attemptAuthorityMigrationDigest("v45-state-vault-frozen-run-" + planDigest)
	binding := map[string]any{
		"format": "prodivix.agent-evaluation-production-run-config-artifact-binding", "version": 1,
		"sourcePlanArtifactName":   "g4-production-run-config",
		"sourcePlanArtifactDigest": "sha256:" + strings.Repeat("d", 64),
		"sourcePlanWorkflowRunId":  "987654321", "sourcePlanWorkflowRunAttempt": 1,
		"runConfigFileName": "production-run-config.json", "runConfigByteLength": len(runConfigBytes),
		"runConfigCanonicalBytesDigest": sourceConfigDigest, "sourceConfigDigest": sourceConfigDigest,
		"frozenRunDigest": frozenRunDigest, "planDigest": planDigest,
		"repositoryCommit": repositoryCommit,
	}
	bindingDigest := attemptAuthorityMigrationSelfDigest(t, binding, "bindingDigest")
	bindingBytes := attemptAuthorityMigrationCanonicalBytes(t, binding)
	ingressBase := map[string]any{
		"format": "prodivix.agent-evaluation-production-run-config-artifact-ingress", "version": 1,
		"namespaceId": namespaceID, "planDigest": planDigest, "repositoryCommit": repositoryCommit,
		"runConfigArtifactBinding": binding, "runConfig": runConfig,
	}
	ingressDigest := attemptAuthorityMigrationCanonicalDigest(t, ingressBase)
	receipt := map[string]any{
		"format": "prodivix.agent-evaluation-production-run-config-artifact-ingress-receipt", "version": 1,
		"namespaceId": namespaceID, "planDigest": planDigest, "repositoryCommit": repositoryCommit,
		"bindingDigest": bindingDigest, "sourceConfigDigest": sourceConfigDigest,
		"storedAt": storedAt.Format("2006-01-02T15:04:05.000Z"), "ingressDigest": ingressDigest,
	}
	receiptDigest := attemptAuthorityMigrationSelfDigest(t, receipt, "receiptDigest")
	receiptBytes := attemptAuthorityMigrationCanonicalBytes(t, receipt)
	if _, err := db.Exec(`INSERT INTO agent_evaluation_production_run_config_artifacts (
		namespace_id,plan_digest,repository_commit,binding_digest,binding_json,binding_bytes,
		run_config_json,run_config_bytes,source_config_digest,frozen_run_digest,ingress_digest,
		receipt_digest,receipt_bytes,stored_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)`,
		namespaceID, planDigest, repositoryCommit, bindingDigest, string(bindingBytes), bindingBytes,
		string(runConfigBytes), runConfigBytes, sourceConfigDigest, frozenRunDigest, ingressDigest,
		receiptDigest, receiptBytes, storedAt); err != nil {
		t.Fatalf("store state-vault run-config artifact: %v", err)
	}
}

func newAttemptAuthorityMigrationStateVaultSeal(
	t *testing.T,
	namespaceID, planDigest, repositoryCommit, ownerInstanceID string,
	authority map[string]any,
	purpose, attemptID, invocationID, taskID, runID string,
	generation int64,
	protocolFamily, providerStateReferenceKind, providerStateReference string,
	probeProgramDigest, capabilityProfileDigest, providerRequestDigest,
	providerResponseDigest, responseBodyDigest, sealedResponseJSONDigest,
	providerConfigurationID, modelLineageDigest, adapterDigest string,
	observedAt, sealedAt time.Time,
) attemptAuthorityMigrationStateVaultSeal {
	t.Helper()
	authorityDigest := authority["authorityDigest"].(string)
	providerStateReferenceDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"kind": providerStateReferenceKind, "value": providerStateReference,
	})
	expiresAt := observedAt.Add(125 * time.Second)
	sealRequest := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-seal-request", "version": 1,
		"authorityDigest": authorityDigest, "purpose": purpose, "attemptId": attemptID,
		"protocolFamily": protocolFamily, "providerStateReferenceKind": providerStateReferenceKind,
		"providerStateReferenceDigest": providerStateReferenceDigest,
		"probeProgramDigest":           probeProgramDigest,
		"capabilityProfileDigest":      capabilityProfileDigest,
		"invocationId":                 invocationID, "requestDigest": providerRequestDigest,
		"responseDigest": providerResponseDigest, "responseBodyDigest": responseBodyDigest,
		"sealedResponseJsonDigest": sealedResponseJSONDigest,
		"providerConfigurationId":  providerConfigurationID,
		"modelLineageDigest":       modelLineageDigest, "adapterDigest": adapterDigest,
		"taskId": taskID, "runId": runID, "generation": generation,
		"observedAt": observedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":  expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	sealRequestDigest := attemptAuthorityMigrationSelfDigest(t, sealRequest, "sealRequestDigest")
	sealRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, sealRequest)
	aad := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-aad", "version": 1,
		"authorityDigest": authorityDigest, "namespaceId": namespaceID, "planDigest": planDigest,
		"repositoryCommit": repositoryCommit, "sealRequestDigest": sealRequestDigest,
		"providerStateReferenceDigest": providerStateReferenceDigest, "purpose": purpose,
		"attemptId": attemptID, "invocationId": invocationID, "generation": generation,
		"expiresAt": expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	aadBytes := attemptAuthorityMigrationCanonicalBytes(t, aad)
	aadDigest := attemptAuthorityMigrationCanonicalDigest(t, aad)
	ciphertextBytes := []byte("encrypted-native-provider-state-" + invocationID)
	ciphertextDigest := attemptAuthorityMigrationDigest(string(ciphertextBytes))
	wrappedStateKeyBytes := bytes.Repeat([]byte{byte(generation%251 + 1)}, 48)
	wrappedStateKeyDigest := attemptAuthorityMigrationDigest(string(wrappedStateKeyBytes))
	creationDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-state-key-creation", "version": 1,
		"authorityDigest": authorityDigest, "sealRequestDigest": sealRequestDigest, "keyVersion": 1,
		"aadDigest": aadDigest, "ciphertextDigest": ciphertextDigest,
		"wrappedStateKeyDigest": wrappedStateKeyDigest,
		"createdAt":             sealedAt.Format("2006-01-02T15:04:05.000Z"),
	})
	opaqueDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-opaque-ref", "version": 1,
		"authorityDigest": authorityDigest, "sealRequestDigest": sealRequestDigest,
		"stateKeyCreationReceiptDigest": creationDigest,
	})
	opaqueRef := "state-vault-ref." + strings.TrimPrefix(opaqueDigest, "sha256-")
	sealReceipt := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-seal-receipt", "version": 1,
		"authorityDigest": authorityDigest, "sealRequestDigest": sealRequestDigest,
		"providerStateReferenceDigest": providerStateReferenceDigest, "status": "sealed",
		"opaqueProviderStateRef": opaqueRef, "stateKeyCreationReceiptDigest": creationDigest,
		"sealedAt":  sealedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt": expiresAt.Format("2006-01-02T15:04:05.000Z"), "retirementRequired": true,
	}
	sealReceiptDigest := attemptAuthorityMigrationSelfDigest(t, sealReceipt, "receiptDigest")
	sealReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, sealReceipt)
	return attemptAuthorityMigrationStateVaultSeal{
		ownerInstanceID: ownerInstanceID, authorityDigest: authorityDigest, purpose: purpose,
		attemptID: attemptID, invocationID: invocationID, generation: generation,
		taskID: taskID, runID: runID, providerStateReferenceKind: providerStateReferenceKind,
		providerStateReferenceDigest: providerStateReferenceDigest, opaqueProviderStateRef: opaqueRef,
		sealRequestDigest: sealRequestDigest, sealRequest: sealRequest, sealRequestBytes: sealRequestBytes,
		sealReceiptDigest: sealReceiptDigest, sealReceipt: sealReceipt, sealReceiptBytes: sealReceiptBytes,
		stateKeyCreationDigest: creationDigest, aadDigest: aadDigest,
		aadBytes: aadBytes, ciphertextDigest: ciphertextDigest,
		ciphertextBytes: ciphertextBytes, ciphertextNonce: bytes.Repeat([]byte{3}, 12),
		wrappedStateKeyDigest: wrappedStateKeyDigest,
		wrappedStateKeyBytes:  wrappedStateKeyBytes, wrappedStateKeyNonce: bytes.Repeat([]byte{4}, 12),
		expiresAt: expiresAt, sealedAt: sealedAt,
	}
}

func recomputeAttemptAuthorityMigrationStateVaultSealRequest(
	t *testing.T,
	record attemptAuthorityMigrationStateVaultSeal,
	mutate func(map[string]any),
) attemptAuthorityMigrationStateVaultSeal {
	t.Helper()
	sealRequest := attemptAuthorityMigrationCloneObject(t, record.sealRequest)
	delete(sealRequest, "sealRequestDigest")
	mutate(sealRequest)
	sealRequestDigest := attemptAuthorityMigrationSelfDigest(t, sealRequest, "sealRequestDigest")
	sealRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, sealRequest)
	var aad map[string]any
	if err := json.Unmarshal(record.aadBytes, &aad); err != nil {
		t.Fatal(err)
	}
	aad["sealRequestDigest"] = sealRequestDigest
	aadBytes := attemptAuthorityMigrationCanonicalBytes(t, aad)
	aadDigest := attemptAuthorityMigrationCanonicalDigest(t, aad)
	creationDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-state-key-creation", "version": 1,
		"authorityDigest": record.authorityDigest, "sealRequestDigest": sealRequestDigest,
		"keyVersion": 1, "aadDigest": aadDigest, "ciphertextDigest": record.ciphertextDigest,
		"wrappedStateKeyDigest": record.wrappedStateKeyDigest,
		"createdAt":             record.sealedAt.Format("2006-01-02T15:04:05.000Z"),
	})
	opaqueDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-opaque-ref", "version": 1,
		"authorityDigest": record.authorityDigest, "sealRequestDigest": sealRequestDigest,
		"stateKeyCreationReceiptDigest": creationDigest,
	})
	opaqueRef := "state-vault-ref." + strings.TrimPrefix(opaqueDigest, "sha256-")
	sealReceipt := attemptAuthorityMigrationCloneObject(t, record.sealReceipt)
	delete(sealReceipt, "receiptDigest")
	sealReceipt["sealRequestDigest"] = sealRequestDigest
	sealReceipt["opaqueProviderStateRef"] = opaqueRef
	sealReceipt["stateKeyCreationReceiptDigest"] = creationDigest
	sealReceiptDigest := attemptAuthorityMigrationSelfDigest(t, sealReceipt, "receiptDigest")
	sealReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, sealReceipt)
	record.sealRequest, record.sealRequestDigest, record.sealRequestBytes =
		sealRequest, sealRequestDigest, sealRequestBytes
	record.aadBytes, record.aadDigest = aadBytes, aadDigest
	record.stateKeyCreationDigest = creationDigest
	record.opaqueProviderStateRef = opaqueRef
	record.sealReceipt, record.sealReceiptDigest, record.sealReceiptBytes =
		sealReceipt, sealReceiptDigest, sealReceiptBytes
	return record
}

func recomputeAttemptAuthorityMigrationStateVaultAAD(
	t *testing.T,
	record attemptAuthorityMigrationStateVaultSeal,
	mutate func(map[string]any),
) attemptAuthorityMigrationStateVaultSeal {
	t.Helper()
	var aad map[string]any
	if err := json.Unmarshal(record.aadBytes, &aad); err != nil {
		t.Fatal(err)
	}
	mutate(aad)
	aadBytes := attemptAuthorityMigrationCanonicalBytes(t, aad)
	aadDigest := attemptAuthorityMigrationCanonicalDigest(t, aad)
	creationDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-state-key-creation", "version": 1,
		"authorityDigest": record.authorityDigest, "sealRequestDigest": record.sealRequestDigest,
		"keyVersion": 1, "aadDigest": aadDigest, "ciphertextDigest": record.ciphertextDigest,
		"wrappedStateKeyDigest": record.wrappedStateKeyDigest,
		"createdAt":             record.sealedAt.Format("2006-01-02T15:04:05.000Z"),
	})
	opaqueDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-opaque-ref", "version": 1,
		"authorityDigest": record.authorityDigest, "sealRequestDigest": record.sealRequestDigest,
		"stateKeyCreationReceiptDigest": creationDigest,
	})
	opaqueRef := "state-vault-ref." + strings.TrimPrefix(opaqueDigest, "sha256-")
	sealReceipt := attemptAuthorityMigrationCloneObject(t, record.sealReceipt)
	delete(sealReceipt, "receiptDigest")
	sealReceipt["opaqueProviderStateRef"] = opaqueRef
	sealReceipt["stateKeyCreationReceiptDigest"] = creationDigest
	sealReceiptDigest := attemptAuthorityMigrationSelfDigest(t, sealReceipt, "receiptDigest")
	sealReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, sealReceipt)
	record.aadBytes, record.aadDigest = aadBytes, aadDigest
	record.stateKeyCreationDigest = creationDigest
	record.opaqueProviderStateRef = opaqueRef
	record.sealReceipt, record.sealReceiptDigest, record.sealReceiptBytes =
		sealReceipt, sealReceiptDigest, sealReceiptBytes
	return record
}

func insertAttemptAuthorityMigrationStateVaultSeal(
	db *sql.DB,
	namespaceID, planDigest, repositoryCommit string,
	record attemptAuthorityMigrationStateVaultSeal,
	sealRequestBytes []byte,
	authorityDigest string,
	expiresAt time.Time,
) error {
	_, err := db.Exec(`INSERT INTO agent_evaluation_native_provider_state_vault_records (
		namespace_id,plan_digest,repository_commit,vault_owner_instance_id,authority_digest,purpose,
		attempt_id,invocation_id,generation,task_id,run_id,provider_state_reference_kind,
		provider_state_reference_digest,opaque_provider_state_ref,seal_request_digest,
		seal_request_json,seal_request_bytes,seal_receipt_digest,seal_receipt_json,seal_receipt_bytes,
		state_key_creation_receipt_digest,aad_digest,aad_bytes,ciphertext_digest,ciphertext_bytes,
		ciphertext_nonce,wrapped_state_key_digest,wrapped_state_key_bytes,wrapped_state_key_nonce,
		status,expires_at,sealed_at,created_at,updated_at,v45_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,
		$18,$19::jsonb,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,'active',$30,$31,$31,$31,TRUE)
		ON CONFLICT DO NOTHING`,
		namespaceID, planDigest, repositoryCommit, record.ownerInstanceID, authorityDigest, record.purpose,
		record.attemptID, record.invocationID, record.generation, record.taskID, record.runID,
		record.providerStateReferenceKind, record.providerStateReferenceDigest,
		record.opaqueProviderStateRef, record.sealRequestDigest, string(sealRequestBytes),
		sealRequestBytes, record.sealReceiptDigest, string(record.sealReceiptBytes), record.sealReceiptBytes,
		record.stateKeyCreationDigest, record.aadDigest, record.aadBytes, record.ciphertextDigest,
		record.ciphertextBytes, record.ciphertextNonce, record.wrappedStateKeyDigest,
		record.wrappedStateKeyBytes, record.wrappedStateKeyNonce, expiresAt, record.sealedAt)
	return err
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLNativeProviderStateVault(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	namespaceID := "namespace.v45.state-vault"
	planDigest := attemptAuthorityMigrationDigest("v45-state-vault-plan")
	repositoryCommit := strings.Repeat("9", 40)
	plannedAt := time.Date(2026, time.August, 9, 12, 0, 0, 0, time.UTC)
	planExpiresAt := plannedAt.Add(7 * 24 * time.Hour)
	planValue := map[string]any{"fixture": "v45-native-provider-state-vault"}
	planBytes := attemptAuthorityMigrationCanonicalBytes(t, planValue)
	withV45MigrationFixtureUserTriggersDisabled(t, db, "agent_evaluation_plans", func() error {
		_, err := db.Exec(`INSERT INTO agent_evaluation_plans (
			namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
			plan_json,plan_bytes,planned_at,expires_at
		) VALUES ($1,'plan.v45.state-vault',$2,$3,11640,$4::jsonb,$5,$6,$7)`,
			namespaceID, planDigest, repositoryCommit, string(planBytes), planBytes,
			plannedAt, planExpiresAt)
		return err
	})
	authority := attemptAuthorityMigrationStateVaultAuthority(t)
	seedAttemptAuthorityMigrationStateVaultRunConfig(
		t, db, namespaceID, planDigest, repositoryCommit, plannedAt, authority,
	)
	seal := newAttemptAuthorityMigrationStateVaultSeal(
		t, namespaceID, planDigest, repositoryCommit, "vault.owner.instance-a", authority,
		"background-job-state", "attempt.v45.state-vault", "invocation.v45.state-vault.source",
		"task.v45.state-vault", "run.v45.state-vault", 1,
		"openai-responses", "response-id", "response.v45.state-vault.callback-local",
		attemptAuthorityMigrationDigest("v45-state-vault-probe-program"),
		attemptAuthorityMigrationDigest("v45-state-vault-capability-profile"),
		attemptAuthorityMigrationDigest("v45-state-vault-provider-request"),
		attemptAuthorityMigrationDigest("v45-state-vault-provider-response"),
		attemptAuthorityMigrationDigest("v45-state-vault-response-body"),
		attemptAuthorityMigrationDigest("v45-state-vault-sealed-response-json"),
		"provider.configuration.v45-state-vault",
		attemptAuthorityMigrationDigest("v45-state-vault-model-lineage"),
		attemptAuthorityMigrationDigest("v45-state-vault-adapter"),
		plannedAt.Add(time.Minute), plannedAt.Add(time.Minute+500*time.Millisecond),
	)
	badRunConfigNamespace := namespaceID + ".null-run-config"
	badRunConfigPlanDigest := attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-plan")
	badRunConfigPlanValue := map[string]any{"fixture": "v45-native-provider-state-vault-null-run-config"}
	badRunConfigPlanBytes := attemptAuthorityMigrationCanonicalBytes(t, badRunConfigPlanValue)
	withV45MigrationFixtureUserTriggersDisabled(t, db, "agent_evaluation_plans", func() error {
		_, err := db.Exec(`INSERT INTO agent_evaluation_plans (
			namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
			plan_json,plan_bytes,planned_at,expires_at
		) VALUES ($1,'plan.v45.state-vault-null-run-config',$2,$3,11640,$4::jsonb,$5,$6,$7)`,
			badRunConfigNamespace, badRunConfigPlanDigest, repositoryCommit,
			string(badRunConfigPlanBytes), badRunConfigPlanBytes, plannedAt, planExpiresAt)
		return err
	})
	badRunConfigAuthority := attemptAuthorityMigrationCloneObject(t, authority)
	delete(badRunConfigAuthority, "authorityDigest")
	badRunConfigAuthority["keyReferenceDigest"] = nil
	attemptAuthorityMigrationSelfDigest(t, badRunConfigAuthority, "authorityDigest")
	seedAttemptAuthorityMigrationStateVaultRunConfig(
		t, db, badRunConfigNamespace, badRunConfigPlanDigest, repositoryCommit,
		plannedAt, badRunConfigAuthority,
	)
	badRunConfigSeal := newAttemptAuthorityMigrationStateVaultSeal(
		t, badRunConfigNamespace, badRunConfigPlanDigest, repositoryCommit,
		"vault.owner.instance-null-run-config", badRunConfigAuthority, "background-job-state",
		"attempt.v45.state-vault-null-run-config", "invocation.v45.state-vault-null-run-config",
		"task.v45.state-vault-null-run-config", "run.v45.state-vault-null-run-config", 1,
		"openai-responses", "response-id", "response.v45.state-vault.null-run-config",
		attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-probe"),
		attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-profile"),
		attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-request"),
		attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-response"),
		attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-body"),
		attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-json"),
		"provider.configuration.v45-state-vault-null-run-config",
		attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-model"),
		attemptAuthorityMigrationDigest("v45-state-vault-null-run-config-adapter"),
		plannedAt.Add(time.Minute), plannedAt.Add(time.Minute+500*time.Millisecond),
	)
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, badRunConfigNamespace, badRunConfigPlanDigest, repositoryCommit,
		badRunConfigSeal, badRunConfigSeal.sealRequestBytes,
		badRunConfigSeal.authorityDigest, badRunConfigSeal.expiresAt,
	); err == nil {
		t.Fatal("native Provider state vault accepted a recomputed run-config authority with an explicit null")
	}
	nullSealRequest := recomputeAttemptAuthorityMigrationStateVaultSealRequest(t, seal,
		func(request map[string]any) { request["providerConfigurationId"] = nil })
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, nullSealRequest,
		nullSealRequest.sealRequestBytes, nullSealRequest.authorityDigest,
		nullSealRequest.expiresAt,
	); err == nil {
		t.Fatal("native Provider state vault accepted a fully recomputed seal request explicit null")
	}
	nullAAD := recomputeAttemptAuthorityMigrationStateVaultAAD(t, seal,
		func(aad map[string]any) { aad["attemptId"] = nil })
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, nullAAD, nullAAD.sealRequestBytes,
		nullAAD.authorityDigest, nullAAD.expiresAt,
	); err == nil {
		t.Fatal("native Provider state vault accepted a fully recomputed AAD explicit null")
	}
	nullSealReceipt := seal
	nullSealReceiptValue := attemptAuthorityMigrationCloneObject(t, seal.sealReceipt)
	delete(nullSealReceiptValue, "receiptDigest")
	nullSealReceiptValue["retirementRequired"] = nil
	nullSealReceipt.sealReceiptDigest =
		attemptAuthorityMigrationSelfDigest(t, nullSealReceiptValue, "receiptDigest")
	nullSealReceipt.sealReceipt = nullSealReceiptValue
	nullSealReceipt.sealReceiptBytes =
		attemptAuthorityMigrationCanonicalBytes(t, nullSealReceiptValue)
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, nullSealReceipt,
		nullSealReceipt.sealRequestBytes, nullSealReceipt.authorityDigest,
		nullSealReceipt.expiresAt,
	); err == nil {
		t.Fatal("native Provider state vault accepted a fully recomputed seal receipt explicit null")
	}
	canaryRequest := attemptAuthorityMigrationCloneObject(t, seal.sealRequest)
	canaryRequest["credentialCanary"] = "state-vault-secret-canary"
	canaryBytes := attemptAuthorityMigrationCanonicalBytes(t, canaryRequest)
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, seal, canaryBytes,
		seal.authorityDigest, seal.expiresAt,
	); err == nil {
		t.Fatal("native Provider state vault accepted a secret canary in the seal request")
	}
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, seal, seal.sealRequestBytes,
		attemptAuthorityMigrationDigest("v45-state-vault-swapped-authority"), seal.expiresAt,
	); err == nil {
		t.Fatal("native Provider state vault accepted a swapped authority digest")
	}
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, seal, seal.sealRequestBytes,
		seal.authorityDigest, seal.expiresAt.Add(time.Millisecond),
	); err == nil {
		t.Fatal("native Provider state vault accepted a 125s lifetime swap")
	}
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, seal, seal.sealRequestBytes,
		seal.authorityDigest, seal.expiresAt,
	); err != nil {
		t.Fatalf("store native Provider state vault seal: %v", err)
	}
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, seal, seal.sealRequestBytes,
		seal.authorityDigest, seal.expiresAt,
	); err != nil {
		t.Fatalf("replay exact native Provider state vault seal: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_native_provider_state_vault_records
		SET vault_owner_instance_id='vault.owner.instance-foreign'
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4`, namespaceID, planDigest, repositoryCommit,
		seal.opaqueProviderStateRef); err == nil {
		t.Fatal("native Provider state vault accepted a foreign owner-instance swap")
	}
	resolveRequestedAt := seal.sealedAt.Add(time.Second)
	resolveRequest := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-resolve-request", "version": 1,
		"authorityDigest": seal.authorityDigest, "opaqueProviderStateRef": seal.opaqueProviderStateRef,
		"sealRequestDigest": seal.sealRequestDigest, "sealReceiptDigest": seal.sealReceiptDigest,
		"purpose": seal.purpose, "providerStateReferenceKind": seal.providerStateReferenceKind,
		"providerStateReferenceDigest": seal.providerStateReferenceDigest,
		"sourceAttemptId":              seal.attemptID, "sourceInvocationId": seal.invocationID,
		"sourceGeneration": seal.generation, "consumerAttemptId": seal.attemptID,
		"consumerInvocationId": "invocation.v45.state-vault.consumer", "consumerGeneration": seal.generation,
		"taskId": seal.taskID, "runId": seal.runID,
		"requestedAt": resolveRequestedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":   seal.expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	resolveRequestDigest := attemptAuthorityMigrationSelfDigest(t, resolveRequest, "resolveRequestDigest")
	resolveRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, resolveRequest)
	resolvedAt := resolveRequestedAt.Add(500 * time.Millisecond)
	resolveReceipt := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-resolve-receipt", "version": 1,
		"authorityDigest": seal.authorityDigest, "resolveRequestDigest": resolveRequestDigest,
		"sealReceiptDigest": seal.sealReceiptDigest, "opaqueProviderStateRef": seal.opaqueProviderStateRef,
		"status": "resolved", "providerStateReferenceDigest": seal.providerStateReferenceDigest,
		"callbackLocalProviderStateHandleDigest": seal.providerStateReferenceDigest,
		"resolvedAt":                             resolvedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                              seal.expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	resolveReceiptDigest := attemptAuthorityMigrationSelfDigest(t, resolveReceipt, "receiptDigest")
	resolveReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, resolveReceipt)
	nullResolveRequest := attemptAuthorityMigrationCloneObject(t, resolveRequest)
	delete(nullResolveRequest, "resolveRequestDigest")
	nullResolveRequest["taskId"] = nil
	nullResolveRequestDigest :=
		attemptAuthorityMigrationSelfDigest(t, nullResolveRequest, "resolveRequestDigest")
	nullResolveRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, nullResolveRequest)
	nullResolveRequestReceipt := attemptAuthorityMigrationCloneObject(t, resolveReceipt)
	delete(nullResolveRequestReceipt, "receiptDigest")
	nullResolveRequestReceipt["resolveRequestDigest"] = nullResolveRequestDigest
	nullResolveRequestReceiptDigest :=
		attemptAuthorityMigrationSelfDigest(t, nullResolveRequestReceipt, "receiptDigest")
	nullResolveRequestReceiptBytes :=
		attemptAuthorityMigrationCanonicalBytes(t, nullResolveRequestReceipt)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_native_provider_state_vault_records SET
		resolve_request_digest=$5,resolve_request_json=$6::jsonb,resolve_request_bytes=$7,
		resolve_receipt_digest=$8,resolve_receipt_json=$9::jsonb,resolve_receipt_bytes=$10,
		resolved_at=$11,updated_at=$11
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4 AND resolve_request_digest IS NULL`,
		namespaceID, planDigest, repositoryCommit, seal.opaqueProviderStateRef,
		nullResolveRequestDigest, string(nullResolveRequestBytes), nullResolveRequestBytes,
		nullResolveRequestReceiptDigest, string(nullResolveRequestReceiptBytes),
		nullResolveRequestReceiptBytes, resolvedAt); err == nil {
		t.Fatal("native Provider state vault accepted a fully recomputed resolve request explicit null")
	}
	nullResolveReceipt := attemptAuthorityMigrationCloneObject(t, resolveReceipt)
	delete(nullResolveReceipt, "receiptDigest")
	nullResolveReceipt["providerStateReferenceDigest"] = nil
	nullResolveReceiptDigest :=
		attemptAuthorityMigrationSelfDigest(t, nullResolveReceipt, "receiptDigest")
	nullResolveReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, nullResolveReceipt)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_native_provider_state_vault_records SET
		resolve_request_digest=$5,resolve_request_json=$6::jsonb,resolve_request_bytes=$7,
		resolve_receipt_digest=$8,resolve_receipt_json=$9::jsonb,resolve_receipt_bytes=$10,
		resolved_at=$11,updated_at=$11
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4 AND resolve_request_digest IS NULL`,
		namespaceID, planDigest, repositoryCommit, seal.opaqueProviderStateRef,
		resolveRequestDigest, string(resolveRequestBytes), resolveRequestBytes,
		nullResolveReceiptDigest, string(nullResolveReceiptBytes), nullResolveReceiptBytes,
		resolvedAt); err == nil {
		t.Fatal("native Provider state vault accepted a fully recomputed resolve receipt explicit null")
	}
	swappedResolveReceipt := attemptAuthorityMigrationCloneObject(t, resolveReceipt)
	swappedResolveReceipt["callbackLocalProviderStateHandleDigest"] =
		attemptAuthorityMigrationDigest("v45-state-vault-swapped-callback")
	swappedResolveBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedResolveReceipt)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_native_provider_state_vault_records SET
		resolve_request_digest=$5,resolve_request_json=$6::jsonb,resolve_request_bytes=$7,
		resolve_receipt_digest=$8,resolve_receipt_json=$9::jsonb,resolve_receipt_bytes=$10,
		resolved_at=$11,updated_at=$11
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4 AND resolve_request_digest IS NULL`,
		namespaceID, planDigest, repositoryCommit, seal.opaqueProviderStateRef,
		resolveRequestDigest, string(resolveRequestBytes), resolveRequestBytes,
		resolveReceiptDigest, string(swappedResolveBytes), swappedResolveBytes, resolvedAt); err == nil {
		t.Fatal("native Provider state vault accepted a swapped resolve receipt")
	}
	resolveUpdate := `UPDATE agent_evaluation_native_provider_state_vault_records SET
		resolve_request_digest=$5,resolve_request_json=$6::jsonb,resolve_request_bytes=$7,
		resolve_receipt_digest=$8,resolve_receipt_json=$9::jsonb,resolve_receipt_bytes=$10,
		resolved_at=$11,updated_at=$11
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4 AND resolve_request_digest IS NULL`
	if _, err := db.ExecContext(ctx, resolveUpdate, namespaceID, planDigest, repositoryCommit,
		seal.opaqueProviderStateRef, resolveRequestDigest, string(resolveRequestBytes),
		resolveRequestBytes, resolveReceiptDigest, string(resolveReceiptBytes),
		resolveReceiptBytes, resolvedAt); err != nil {
		t.Fatalf("resolve native Provider state vault record: %v", err)
	}
	if _, err := db.ExecContext(ctx, resolveUpdate, namespaceID, planDigest, repositoryCommit,
		seal.opaqueProviderStateRef, resolveRequestDigest, string(resolveRequestBytes),
		resolveRequestBytes, resolveReceiptDigest, string(resolveReceiptBytes),
		resolveReceiptBytes, resolvedAt); err != nil {
		t.Fatalf("replay exact state-vault resolve: %v", err)
	}
	retireRequestedAt := resolvedAt.Add(time.Second)
	retireRequest := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-retire-request", "version": 1,
		"authorityDigest": seal.authorityDigest, "opaqueProviderStateRef": seal.opaqueProviderStateRef,
		"sealRequestDigest": seal.sealRequestDigest, "sealReceiptDigest": seal.sealReceiptDigest,
		"resolveReceiptDigest": resolveReceiptDigest, "purpose": seal.purpose,
		"sourceAttemptId": seal.attemptID, "sourceInvocationId": seal.invocationID,
		"sourceGeneration": seal.generation, "consumerAttemptId": seal.attemptID,
		"consumerInvocationId": "invocation.v45.state-vault.consumer", "consumerGeneration": seal.generation,
		"disposition": "consumed",
		"requestedAt": retireRequestedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":   seal.expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	retireRequestDigest := attemptAuthorityMigrationSelfDigest(t, retireRequest, "retireRequestDigest")
	retireRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, retireRequest)
	retiredAt := retireRequestedAt.Add(500 * time.Millisecond)
	destructionDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-state-key-destruction", "version": 1,
		"authorityDigest": seal.authorityDigest, "opaqueProviderStateRef": seal.opaqueProviderStateRef,
		"stateKeyCreationReceiptDigest": seal.stateKeyCreationDigest,
		"retireRequestDigest":           retireRequestDigest,
		"wrappedStateKeyDigest":         seal.wrappedStateKeyDigest,
		"retiredAt":                     retiredAt.Format("2006-01-02T15:04:05.000Z"),
	})
	deletionDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-opaque-record-deletion", "version": 1,
		"authorityDigest": seal.authorityDigest, "opaqueProviderStateRef": seal.opaqueProviderStateRef,
		"sealRequestDigest": seal.sealRequestDigest, "retireRequestDigest": retireRequestDigest,
		"ciphertextDigest": seal.ciphertextDigest,
		"retiredAt":        retiredAt.Format("2006-01-02T15:04:05.000Z"),
	})
	cryptographicExpiryDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-cryptographic-expiry", "version": 1,
		"authorityDigest": seal.authorityDigest, "opaqueProviderStateRef": seal.opaqueProviderStateRef,
		"stateKeyCreationReceiptDigest":     seal.stateKeyCreationDigest,
		"stateKeyDestructionReceiptDigest":  destructionDigest,
		"opaqueRecordDeletionReceiptDigest": deletionDigest,
		"retiredAt":                         retiredAt.Format("2006-01-02T15:04:05.000Z"),
	})
	retirementReceipt := map[string]any{
		"format": "prodivix.agent-native-provider-state-vault-retirement-receipt", "version": 1,
		"authorityDigest": seal.authorityDigest, "retireRequestDigest": retireRequestDigest,
		"sealReceiptDigest": seal.sealReceiptDigest, "opaqueProviderStateRef": seal.opaqueProviderStateRef,
		"stateKeyCreationReceiptDigest": seal.stateKeyCreationDigest,
		"resolveReceiptDigest":          resolveReceiptDigest, "disposition": "consumed",
		"stateKeyDestructionReceiptDigest":  destructionDigest,
		"opaqueRecordDeletionReceiptDigest": deletionDigest,
		"cryptographicExpiryReceiptDigest":  cryptographicExpiryDigest,
		"retiredAt":                         retiredAt.Format("2006-01-02T15:04:05.000Z"),
	}
	retirementReceiptDigest := attemptAuthorityMigrationSelfDigest(t, retirementReceipt, "receiptDigest")
	retirementReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, retirementReceipt)
	retireUpdate := `UPDATE agent_evaluation_native_provider_state_vault_records SET
		retire_request_digest=$5,retire_request_json=$6::jsonb,retire_request_bytes=$7,
		retirement_receipt_digest=$8,retirement_receipt_json=$9::jsonb,
		retirement_receipt_bytes=$10,disposition='consumed',retired_at=$11,status='retired',
		ciphertext_bytes=NULL,ciphertext_nonce=NULL,wrapped_state_key_bytes=NULL,
		wrapped_state_key_nonce=NULL,updated_at=$11
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4 AND status='active' AND retire_request_digest IS NULL`
	nullRetireRequest := attemptAuthorityMigrationCloneObject(t, retireRequest)
	delete(nullRetireRequest, "retireRequestDigest")
	nullRetireRequest["purpose"] = nil
	nullRetireRequestDigest :=
		attemptAuthorityMigrationSelfDigest(t, nullRetireRequest, "retireRequestDigest")
	nullRetireRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, nullRetireRequest)
	nullRetireRequestReceipt := attemptAuthorityMigrationCloneObject(t, retirementReceipt)
	delete(nullRetireRequestReceipt, "receiptDigest")
	nullRetireRequestReceipt["retireRequestDigest"] = nullRetireRequestDigest
	nullRetireRequestReceiptDigest :=
		attemptAuthorityMigrationSelfDigest(t, nullRetireRequestReceipt, "receiptDigest")
	nullRetireRequestReceiptBytes :=
		attemptAuthorityMigrationCanonicalBytes(t, nullRetireRequestReceipt)
	if _, err := db.ExecContext(ctx, retireUpdate, namespaceID, planDigest, repositoryCommit,
		seal.opaqueProviderStateRef, nullRetireRequestDigest, string(nullRetireRequestBytes),
		nullRetireRequestBytes, nullRetireRequestReceiptDigest,
		string(nullRetireRequestReceiptBytes), nullRetireRequestReceiptBytes, retiredAt); err == nil {
		t.Fatal("native Provider state vault accepted a fully recomputed retire request explicit null")
	}
	nullRetirementReceipt := attemptAuthorityMigrationCloneObject(t, retirementReceipt)
	delete(nullRetirementReceipt, "receiptDigest")
	nullRetirementReceipt["stateKeyDestructionReceiptDigest"] = nil
	nullRetirementReceiptDigest :=
		attemptAuthorityMigrationSelfDigest(t, nullRetirementReceipt, "receiptDigest")
	nullRetirementReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, nullRetirementReceipt)
	if _, err := db.ExecContext(ctx, retireUpdate, namespaceID, planDigest, repositoryCommit,
		seal.opaqueProviderStateRef, retireRequestDigest, string(retireRequestBytes), retireRequestBytes,
		nullRetirementReceiptDigest, string(nullRetirementReceiptBytes),
		nullRetirementReceiptBytes, retiredAt); err == nil {
		t.Fatal("native Provider state vault accepted a fully recomputed retirement receipt explicit null")
	}
	if _, err := db.ExecContext(ctx, strings.Replace(retireUpdate,
		"ciphertext_bytes=NULL", "ciphertext_bytes=ciphertext_bytes", 1),
		namespaceID, planDigest, repositoryCommit, seal.opaqueProviderStateRef,
		retireRequestDigest, string(retireRequestBytes), retireRequestBytes,
		retirementReceiptDigest, string(retirementReceiptBytes), retirementReceiptBytes,
		retiredAt); err == nil {
		t.Fatal("native Provider state vault retirement preserved encrypted state bytes")
	}
	if _, err := db.ExecContext(ctx, retireUpdate, namespaceID, planDigest, repositoryCommit,
		seal.opaqueProviderStateRef, retireRequestDigest, string(retireRequestBytes),
		retireRequestBytes, retirementReceiptDigest, string(retirementReceiptBytes),
		retirementReceiptBytes, retiredAt); err != nil {
		t.Fatalf("retire native Provider state vault record: %v", err)
	}
	var status, storedOwner string
	var secretsDestroyed bool
	if err := db.QueryRowContext(ctx, `SELECT status,vault_owner_instance_id,
		ciphertext_bytes IS NULL AND ciphertext_nonce IS NULL
			AND wrapped_state_key_bytes IS NULL AND wrapped_state_key_nonce IS NULL
		FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4`, namespaceID, planDigest, repositoryCommit,
		seal.opaqueProviderStateRef).Scan(&status, &storedOwner, &secretsDestroyed); err != nil {
		t.Fatalf("read retired native Provider state vault record: %v", err)
	}
	if status != "retired" || storedOwner != seal.ownerInstanceID || !secretsDestroyed {
		t.Fatalf("retired state-vault record drifted: status=%q owner=%q destroyed=%t",
			status, storedOwner, secretsDestroyed)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4`, namespaceID, planDigest, repositoryCommit,
		seal.opaqueProviderStateRef); err == nil {
		t.Fatal("native Provider state vault accepted late record deletion")
	}
	foreign := newAttemptAuthorityMigrationStateVaultSeal(
		t, namespaceID, planDigest, repositoryCommit, "vault.owner.instance-b", authority,
		"background-job-state", "attempt.v45.state-vault", "invocation.v45.state-vault.foreign",
		"task.v45.state-vault", "run.v45.state-vault", 2,
		"openai-responses", "response-id", "response.v45.state-vault.foreign",
		attemptAuthorityMigrationDigest("v45-state-vault-probe-program"),
		attemptAuthorityMigrationDigest("v45-state-vault-capability-profile"),
		attemptAuthorityMigrationDigest("v45-state-vault-foreign-request"),
		attemptAuthorityMigrationDigest("v45-state-vault-foreign-response"),
		attemptAuthorityMigrationDigest("v45-state-vault-foreign-body"),
		attemptAuthorityMigrationDigest("v45-state-vault-foreign-json"),
		"provider.configuration.v45-state-vault",
		attemptAuthorityMigrationDigest("v45-state-vault-model-lineage"),
		attemptAuthorityMigrationDigest("v45-state-vault-adapter"),
		plannedAt.Add(2*time.Minute), plannedAt.Add(2*time.Minute+500*time.Millisecond),
	)
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, foreign, foreign.sealRequestBytes,
		foreign.authorityDigest, foreign.expiresAt,
	); err != nil {
		t.Fatalf("store foreign-instance state-vault seal: %v", err)
	}
	var instanceAActive, instanceBActive, globallyExpired int64
	sweepAt := foreign.expiresAt
	if err := db.QueryRowContext(ctx, `SELECT
		COUNT(*) FILTER (WHERE vault_owner_instance_id='vault.owner.instance-a' AND status='active'),
		COUNT(*) FILTER (WHERE vault_owner_instance_id='vault.owner.instance-b' AND status='active'),
		COUNT(*) FILTER (WHERE status='active' AND expires_at<=$2)
		FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND repository_commit=$3`, namespaceID, sweepAt, repositoryCommit).
		Scan(&instanceAActive, &instanceBActive, &globallyExpired); err != nil {
		t.Fatalf("read instance-scoped state-vault sweep authority: %v", err)
	}
	if instanceAActive != 0 || instanceBActive != 1 || globallyExpired != 1 {
		t.Fatalf("state-vault instance isolation drifted: A=%d B=%d expired=%d",
			instanceAActive, instanceBActive, globallyExpired)
	}
	forcedExpiryTombstone := func(forcedExpiredAt time.Time) (map[string]any, string, []byte) {
		base := map[string]any{
			"format":  "prodivix.agent-evaluation-native-provider-state-vault-forced-expiry-tombstone",
			"version": 1, "namespaceId": namespaceID, "planDigest": planDigest,
			"repositoryCommit": repositoryCommit, "vaultOwnerInstanceId": foreign.ownerInstanceID,
			"authorityDigest":        foreign.authorityDigest,
			"opaqueProviderStateRef": foreign.opaqueProviderStateRef,
			"sealRequestDigest":      foreign.sealRequestDigest, "sealReceiptDigest": foreign.sealReceiptDigest,
			"stateKeyCreationReceiptDigest": foreign.stateKeyCreationDigest,
			"aadDigest":                     foreign.aadDigest, "ciphertextDigest": foreign.ciphertextDigest,
			"wrappedStateKeyDigest": foreign.wrappedStateKeyDigest,
			"expiresAt":             foreign.expiresAt.Format("2006-01-02T15:04:05.000Z"),
			"forcedExpiredAt":       forcedExpiredAt.Format("2006-01-02T15:04:05.000Z"),
			"reason":                "maximum-lifecycle-ack-window-elapsed",
		}
		digest := attemptAuthorityMigrationSelfDigest(t, base, "tombstoneDigest")
		return base, digest, attemptAuthorityMigrationCanonicalBytes(t, base)
	}
	forcedExpiryUpdate := `UPDATE agent_evaluation_native_provider_state_vault_records SET
		forced_expiry_tombstone_digest=$5,forced_expiry_tombstone_json=$6::jsonb,
		forced_expiry_tombstone_bytes=$7,forced_expired_at=$8,status='expired-unqualified',
		ciphertext_bytes=NULL,ciphertext_nonce=NULL,wrapped_state_key_bytes=NULL,
		wrapped_state_key_nonce=NULL,updated_at=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4 AND status='active'
			AND retire_request_digest IS NULL AND forced_expiry_tombstone_digest IS NULL`
	earlyForcedAt := foreign.expiresAt.Add(30 * time.Second)
	_, earlyForcedDigest, earlyForcedBytes := forcedExpiryTombstone(earlyForcedAt)
	if _, err := db.ExecContext(ctx, forcedExpiryUpdate, namespaceID, planDigest, repositoryCommit,
		foreign.opaqueProviderStateRef, earlyForcedDigest, string(earlyForcedBytes),
		earlyForcedBytes, earlyForcedAt); err == nil {
		t.Fatal("native Provider state vault accepted forced expiry at the ordinary ACK boundary")
	}
	forcedExpiredAt := earlyForcedAt.Add(time.Millisecond)
	forcedTombstone, forcedTombstoneDigest, forcedTombstoneBytes :=
		forcedExpiryTombstone(forcedExpiredAt)
	nullForcedTombstone := attemptAuthorityMigrationCloneObject(t, forcedTombstone)
	delete(nullForcedTombstone, "tombstoneDigest")
	nullForcedTombstone["reason"] = nil
	nullForcedTombstoneDigest :=
		attemptAuthorityMigrationSelfDigest(t, nullForcedTombstone, "tombstoneDigest")
	nullForcedTombstoneBytes := attemptAuthorityMigrationCanonicalBytes(t, nullForcedTombstone)
	if _, err := db.ExecContext(ctx, forcedExpiryUpdate, namespaceID, planDigest, repositoryCommit,
		foreign.opaqueProviderStateRef, nullForcedTombstoneDigest,
		string(nullForcedTombstoneBytes), nullForcedTombstoneBytes, forcedExpiredAt); err == nil {
		t.Fatal("native Provider state vault accepted a fully recomputed forced-expiry explicit null")
	}
	if _, err := db.ExecContext(ctx, forcedExpiryUpdate, namespaceID, planDigest, repositoryCommit,
		foreign.opaqueProviderStateRef, forcedTombstoneDigest, string(forcedTombstoneBytes),
		forcedTombstoneBytes, forcedExpiredAt); err != nil {
		t.Fatalf("force-expire overdue foreign-instance state-vault record: %v", err)
	}
	var forcedStatus, forcedOwner, storedForcedDigest string
	var forcedSecretsDestroyed bool
	var storedForcedBytes []byte
	var storedForcedAt time.Time
	if err := db.QueryRowContext(ctx, `SELECT status,vault_owner_instance_id,
		forced_expiry_tombstone_digest,forced_expiry_tombstone_bytes,forced_expired_at,
		ciphertext_bytes IS NULL AND ciphertext_nonce IS NULL
			AND wrapped_state_key_bytes IS NULL AND wrapped_state_key_nonce IS NULL
		FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4`, namespaceID, planDigest, repositoryCommit,
		foreign.opaqueProviderStateRef).Scan(&forcedStatus, &forcedOwner, &storedForcedDigest,
		&storedForcedBytes, &storedForcedAt, &forcedSecretsDestroyed); err != nil {
		t.Fatalf("read forced-expiry tombstone: %v", err)
	}
	if forcedStatus != "expired-unqualified" || forcedOwner != foreign.ownerInstanceID ||
		storedForcedDigest != forcedTombstoneDigest ||
		!bytes.Equal(storedForcedBytes, forcedTombstoneBytes) ||
		!storedForcedAt.Equal(forcedExpiredAt) || !forcedSecretsDestroyed {
		t.Fatalf("forced-expiry tombstone drifted: status=%q owner=%q digest=%q destroyed=%t",
			forcedStatus, forcedOwner, storedForcedDigest, forcedSecretsDestroyed)
	}
	result, err := db.ExecContext(ctx, forcedExpiryUpdate, namespaceID, planDigest, repositoryCommit,
		foreign.opaqueProviderStateRef, forcedTombstoneDigest, string(forcedTombstoneBytes),
		forcedTombstoneBytes, forcedExpiredAt)
	if err != nil {
		t.Fatalf("replay exact forced-expiry tombstone: %v", err)
	}
	if rows, rowsErr := result.RowsAffected(); rowsErr != nil || rows != 0 {
		t.Fatalf("forced-expiry replay rewrote durable state: rows=%d err=%v", rows, rowsErr)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_native_provider_state_vault_records
		SET forced_expiry_tombstone_digest=$5
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4`, namespaceID, planDigest, repositoryCommit,
		foreign.opaqueProviderStateRef,
		attemptAuthorityMigrationDigest("v45-state-vault-late-forced-expiry-swap")); err == nil {
		t.Fatal("native Provider state vault accepted a late forced-expiry tombstone swap")
	}
	var remainingActive, forcedUnqualified int64
	if err := db.QueryRowContext(ctx, `SELECT
		COUNT(*) FILTER (WHERE status='active'),
		COUNT(*) FILTER (WHERE status='expired-unqualified')
		FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND repository_commit=$2`, namespaceID, repositoryCommit).
		Scan(&remainingActive, &forcedUnqualified); err != nil {
		t.Fatalf("read post-outage state-vault qualification: %v", err)
	}
	if remainingActive != 0 || forcedUnqualified != 1 {
		t.Fatalf("post-outage state-vault qualification drifted: active=%d forced=%d",
			remainingActive, forcedUnqualified)
	}
	recovery := newAttemptAuthorityMigrationStateVaultSeal(
		t, namespaceID, planDigest, repositoryCommit, "vault.owner.instance-recovery", authority,
		"background-job-state", "attempt.v45.state-vault.recovery",
		"invocation.v45.state-vault.recovery", "task.v45.state-vault.recovery",
		"run.v45.state-vault.recovery", 3, "openai-responses", "response-id",
		"response.v45.state-vault.recovery",
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-probe"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-profile"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-request"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-response"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-body"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-json"),
		"provider.configuration.v45-state-vault",
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-model"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-adapter"),
		plannedAt.Add(5*time.Minute), plannedAt.Add(5*time.Minute+500*time.Millisecond),
	)
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, recovery, recovery.sealRequestBytes,
		recovery.authorityDigest, recovery.expiresAt,
	); err != nil {
		t.Fatalf("store state-vault recovery member: %v", err)
	}
	recoveryCompletedAt := recovery.expiresAt.Add(30*time.Second + time.Millisecond)
	recoveryRequestedAt := recoveryCompletedAt.Add(-time.Millisecond)
	recoveryRequest := map[string]any{
		"format":  "prodivix.agent-evaluation-native-provider-state-vault-recovery-request",
		"version": 1, "namespaceId": namespaceID, "planDigest": planDigest,
		"repositoryCommit": repositoryCommit, "vaultOwnerInstanceId": recovery.ownerInstanceID,
		"authorityDigest": recovery.authorityDigest, "reason": "owner-crash-recovery",
		"requestedAt": recoveryRequestedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	recoveryRequestDigest :=
		attemptAuthorityMigrationSelfDigest(t, recoveryRequest, "recoveryRequestDigest")
	recoveryRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, recoveryRequest)
	recoveryTombstone := map[string]any{
		"format":  "prodivix.agent-evaluation-native-provider-state-vault-forced-expiry-tombstone",
		"version": 1, "namespaceId": namespaceID, "planDigest": planDigest,
		"repositoryCommit": repositoryCommit, "vaultOwnerInstanceId": recovery.ownerInstanceID,
		"authorityDigest":               recovery.authorityDigest,
		"opaqueProviderStateRef":        recovery.opaqueProviderStateRef,
		"sealRequestDigest":             recovery.sealRequestDigest,
		"sealReceiptDigest":             recovery.sealReceiptDigest,
		"stateKeyCreationReceiptDigest": recovery.stateKeyCreationDigest,
		"aadDigest":                     recovery.aadDigest, "ciphertextDigest": recovery.ciphertextDigest,
		"wrappedStateKeyDigest": recovery.wrappedStateKeyDigest,
		"expiresAt":             recovery.expiresAt.Format("2006-01-02T15:04:05.000Z"),
		"forcedExpiredAt":       recoveryCompletedAt.Format("2006-01-02T15:04:05.000Z"),
		"reason":                "maximum-lifecycle-ack-window-elapsed",
	}
	recoveryTombstoneDigest :=
		attemptAuthorityMigrationSelfDigest(t, recoveryTombstone, "tombstoneDigest")
	recoveryTombstoneBytes := attemptAuthorityMigrationCanonicalBytes(t, recoveryTombstone)
	terminalRecord := map[string]any{
		"opaqueProviderStateRef": recovery.opaqueProviderStateRef,
		"sealRequestDigest":      recovery.sealRequestDigest,
		"terminalKind":           "forced-expiry-tombstone",
		"terminalDigest":         recoveryTombstoneDigest,
		"disposition":            nil,
	}
	terminalRecordSetDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format":  "prodivix.agent-evaluation-native-provider-state-vault-recovery-terminal-record-set",
		"version": 1, "records": []any{terminalRecord},
	})
	buildRecoveryReceipt := func(root string) (map[string]any, string, []byte) {
		receipt := map[string]any{
			"format":  "prodivix.agent-evaluation-native-provider-state-vault-recovery-receipt",
			"version": 1, "recoveryRequestDigest": recoveryRequestDigest,
			"namespaceId": namespaceID, "planDigest": planDigest,
			"repositoryCommit": repositoryCommit, "vaultOwnerInstanceId": recovery.ownerInstanceID,
			"authorityDigest": recovery.authorityDigest, "reason": "owner-crash-recovery",
			"retiredRecordCount": 0, "cancelledRetirementCount": 0,
			"consumedRetirementCount": 0, "expiredRetirementCount": 0,
			"forcedExpiryTombstoneCount": 1, "terminalRecordSetDigest": root,
			"residualActiveEncryptedRecordCount": 0,
			"completedAt":                        recoveryCompletedAt.Format("2006-01-02T15:04:05.000Z"),
		}
		digest := attemptAuthorityMigrationSelfDigest(t, receipt, "receiptDigest")
		return receipt, digest, attemptAuthorityMigrationCanonicalBytes(t, receipt)
	}
	storeRecovery := func(root string) error {
		_, receiptDigest, receiptBytes := buildRecoveryReceipt(root)
		tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		if _, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_native_provider_state_vault_records SET
			forced_expiry_tombstone_digest=$5,forced_expiry_tombstone_json=$6::jsonb,
			forced_expiry_tombstone_bytes=$7,forced_expired_at=$8,status='expired-unqualified',
			ciphertext_bytes=NULL,ciphertext_nonce=NULL,wrapped_state_key_bytes=NULL,
			wrapped_state_key_nonce=NULL,recovery_request_digest=$9,updated_at=$8
			WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
				AND opaque_provider_state_ref=$4 AND status='active'
				AND retire_request_digest IS NULL AND forced_expiry_tombstone_digest IS NULL
				AND recovery_request_digest IS NULL`, namespaceID, planDigest, repositoryCommit,
			recovery.opaqueProviderStateRef, recoveryTombstoneDigest, string(recoveryTombstoneBytes),
			recoveryTombstoneBytes, recoveryCompletedAt, recoveryRequestDigest); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_native_provider_state_vault_recoveries(
			namespace_id,plan_digest,repository_commit,vault_owner_instance_id,authority_digest,
			recovery_request_digest,recovery_request_json,recovery_request_bytes,recovery_receipt_digest,
			recovery_receipt_json,recovery_receipt_bytes,terminal_record_set_digest,retired_record_count,
			forced_expiry_tombstone_count,completed_at,v45_eligible
		) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12,0,1,$13,TRUE)`,
			namespaceID, planDigest, repositoryCommit, recovery.ownerInstanceID,
			recovery.authorityDigest, recoveryRequestDigest, string(recoveryRequestBytes),
			recoveryRequestBytes, receiptDigest, string(receiptBytes), receiptBytes, root,
			recoveryCompletedAt); err != nil {
			return err
		}
		return tx.Commit()
	}
	if err := storeRecovery(attemptAuthorityMigrationDigest("v45-state-vault-recovery-fake-root")); err == nil {
		t.Fatal("native Provider state vault recovery accepted a caller-minted terminal root")
	}
	if err := storeRecovery(terminalRecordSetDigest); err != nil {
		t.Fatalf("store exact native Provider state vault recovery: %v", err)
	}
	var storedRecoveryRequestDigest, storedRecoveryReceiptDigest string
	var storedRecoveryRequestBytes, storedRecoveryReceiptBytes []byte
	var recoveryResidual int64
	if err := db.QueryRowContext(ctx, `SELECT recovery_request_digest,recovery_request_bytes,
		recovery_receipt_digest,recovery_receipt_bytes,
		(SELECT COUNT(*) FROM agent_evaluation_native_provider_state_vault_records record
		 WHERE record.namespace_id=recovery.namespace_id
			AND record.plan_digest=recovery.plan_digest
			AND record.repository_commit=recovery.repository_commit
			AND record.vault_owner_instance_id=recovery.vault_owner_instance_id
			AND record.status='active')
		FROM agent_evaluation_native_provider_state_vault_recoveries recovery
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND vault_owner_instance_id=$4`, namespaceID, planDigest, repositoryCommit,
		recovery.ownerInstanceID).Scan(&storedRecoveryRequestDigest, &storedRecoveryRequestBytes,
		&storedRecoveryReceiptDigest, &storedRecoveryReceiptBytes, &recoveryResidual); err != nil {
		t.Fatalf("read native Provider state vault recovery: %v", err)
	}
	_, expectedRecoveryReceiptDigest, expectedRecoveryReceiptBytes :=
		buildRecoveryReceipt(terminalRecordSetDigest)
	if storedRecoveryRequestDigest != recoveryRequestDigest ||
		!bytes.Equal(storedRecoveryRequestBytes, recoveryRequestBytes) ||
		storedRecoveryReceiptDigest != expectedRecoveryReceiptDigest ||
		!bytes.Equal(storedRecoveryReceiptBytes, expectedRecoveryReceiptBytes) || recoveryResidual != 0 {
		t.Fatalf("state-vault recovery drifted: request=%q receipt=%q residual=%d",
			storedRecoveryRequestDigest, storedRecoveryReceiptDigest, recoveryResidual)
	}
	var storedMemberRecoveryDigest string
	var recoveredMemberSecretsDestroyed bool
	if err := db.QueryRowContext(ctx, `SELECT recovery_request_digest,
		ciphertext_bytes IS NULL AND ciphertext_nonce IS NULL
			AND wrapped_state_key_bytes IS NULL AND wrapped_state_key_nonce IS NULL
		FROM agent_evaluation_native_provider_state_vault_records
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND opaque_provider_state_ref=$4`, namespaceID, planDigest, repositoryCommit,
		recovery.opaqueProviderStateRef).Scan(
		&storedMemberRecoveryDigest, &recoveredMemberSecretsDestroyed,
	); err != nil {
		t.Fatalf("read native Provider state vault recovery member: %v", err)
	}
	if storedMemberRecoveryDigest != recoveryRequestDigest || !recoveredMemberSecretsDestroyed {
		t.Fatalf("state-vault recovery member drifted: request=%q destroyed=%t",
			storedMemberRecoveryDigest, recoveredMemberSecretsDestroyed)
	}
	postRecoverySeal := newAttemptAuthorityMigrationStateVaultSeal(
		t, namespaceID, planDigest, repositoryCommit, recovery.ownerInstanceID, authority,
		"background-job-state", "attempt.v45.state-vault.recovery.post-fence",
		"invocation.v45.state-vault.recovery.post-fence", "task.v45.state-vault.recovery",
		"run.v45.state-vault.recovery", 4, "openai-responses", "response-id",
		"response.v45.state-vault.recovery.post-fence",
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-post-probe"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-post-profile"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-post-request"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-post-response"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-post-body"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-post-json"),
		"provider.configuration.v45-state-vault",
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-post-model"),
		attemptAuthorityMigrationDigest("v45-state-vault-recovery-post-adapter"),
		recoveryCompletedAt.Add(time.Second), recoveryCompletedAt.Add(1500*time.Millisecond),
	)
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, namespaceID, planDigest, repositoryCommit, postRecoverySeal,
		postRecoverySeal.sealRequestBytes, postRecoverySeal.authorityDigest,
		postRecoverySeal.expiresAt,
	); err == nil {
		t.Fatal("native Provider state vault accepted an active seal after owner recovery fence")
	}
}

type v45OptionalSharedEffectOwnerFixture struct {
	ownerRequestDigest                       string
	ownerIdentityDigest                      string
	ownerReceiptDigest                       string
	ownerStageDigest                         string
	ownerDispatchAckDigest                   string
	preEffectIntentDigest                    string
	preEffectIntent                          map[string]any
	preEffectIntentBytes                     []byte
	effectSourceReceiptDigest                string
	effectSourceReceipt                      map[string]any
	effectSourceReceiptBytes                 []byte
	providerRuntimeJournalResultRecordDigest string
	providerRuntimeResultSealReceiptDigest   string
	effectSourceFactDigest                   string
	businessResultDigest                     string
}

func seedV45OptionalSharedEffectOwner(
	t *testing.T,
	db *sql.DB,
	fixture v45CapabilityProbeFixture,
	attemptID string,
	attemptDescriptorDigest string,
	invocationID string,
	providerRequestDigest string,
	transportReceiptDigest string,
	resultSpoolReceiptDigest any,
	normalizedEventSetDigest string,
	sourceKind string,
	outcome string,
	fact map[string]any,
	sealedAt time.Time,
) v45OptionalSharedEffectOwnerFixture {
	t.Helper()
	ctx := context.Background()
	runtimeAuthority := map[string]any{
		"kind": "shared-durable-capability", "sourceKind": sourceKind,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"capabilityProfileId":                 fixture.capabilityProfileID,
		"capabilityProfileDigest":             fixture.capabilityProfileDigest,
		"capabilityId":                        fixture.capabilityID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":     fixture.registrationReceiptDigest,
		"authorityDigest":               fixture.runtimeFactSourceAuthorityDigest,
	}
	caseID := "case.v45.optional.shared-effect"
	materialDigest := attemptAuthorityMigrationDigest(attemptID + ".material")
	argumentsDigest := attemptAuthorityMigrationDigest(attemptID + ".arguments")
	toolID, toolCallID := "tool.v45.optional", "tool-call.v45.optional"
	providerToolCallID := "provider-tool-call.v45.optional"
	ownerIdentity := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-owner-request-identity", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": attemptDescriptorDigest, "caseId": caseID, "materialDigest": materialDigest,
		"turnIndex": 0, "invocationId": invocationID, "toolId": toolID, "toolCallId": toolCallID,
		"providerToolCallId": providerToolCallID, "providerRequestDigest": providerRequestDigest,
		"argumentsDigest":                  argumentsDigest,
		"runtimeFactSourceAuthorityDigest": fixture.runtimeFactSourceAuthorityDigest,
		"registrationReceiptDigest":        fixture.registrationReceiptDigest,
	}
	ownerIdentityDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, ownerIdentity)),
	)
	ownerRequestID := "capability-effect-owner-request." + strings.TrimPrefix(ownerIdentityDigest, "sha256-")
	ownerRequestDigest := attemptAuthorityMigrationDigest(attemptID + ".controlled-owner-request")
	if ownerRequestDigest == ownerIdentityDigest {
		t.Fatal("shared-effect controlled request unexpectedly collapsed into its owner identity")
	}
	preEffectBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-pre-effect-intent", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": attemptDescriptorDigest, "caseId": caseID, "materialDigest": materialDigest,
		"turnIndex": 0, "invocationId": invocationID, "toolId": toolID, "toolCallId": toolCallID,
		"providerToolCallId": providerToolCallID, "providerRequestDigest": providerRequestDigest,
		"argumentsDigest": argumentsDigest, "runtimeFactSourceAuthority": runtimeAuthority,
		"registrationReceiptDigest": fixture.registrationReceiptDigest,
		"ownerRequestId":            ownerRequestID, "ownerRequestDigest": ownerIdentityDigest,
	}
	preEffectIntentDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, preEffectBase)),
	)
	preEffectIntent := attemptAuthorityMigrationCloneObject(t, preEffectBase)
	preEffectIntent["intentDigest"] = preEffectIntentDigest
	preEffectIntentBytes := attemptAuthorityMigrationJSON(t, preEffectIntent)
	ownerStageDigest := attemptAuthorityMigrationDigest(attemptID + ".owner-stage")
	ownerDispatchAckDigest := attemptAuthorityMigrationDigest(attemptID + ".owner-dispatch-ack")
	providerRuntimeJournalResultRecordDigest := attemptAuthorityMigrationDigest(
		attemptID + ".provider-runtime-journal-result-record",
	)
	providerRuntimeResultSealReceiptDigest := attemptAuthorityMigrationDigest(
		attemptID + ".provider-runtime-result-seal-receipt",
	)
	result := map[string]any{"attemptId": attemptID, "outcome": outcome}
	businessResultDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, result)),
	)
	effectStatus := map[string]string{
		"observed": "produced", "unavailable": "unavailable", "failed": "failed",
	}[outcome]
	ownerOutcome := map[string]string{
		"observed": "supported", "unavailable": "unsupported", "failed": "failed",
	}[outcome]
	var effectFact any
	var effectFactDigest any
	var effectFactKind any
	if fact != nil {
		effectFact = fact
		effectFactDigest = fact["factDigest"]
		effectFactKind = fact["factKind"]
	}
	effectReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-source-receipt", "version": 1,
		"intentDigest": preEffectIntentDigest, "ownerRequestId": ownerRequestID,
		"ownerRequestDigest": ownerIdentityDigest, "runtimeFactSourceAuthority": runtimeAuthority,
		"registrationReceiptDigest": fixture.registrationReceiptDigest,
		"effectStatus":              effectStatus, "businessResultDigest": businessResultDigest,
		"sourceFactKind": effectFactKind, "sourceFactDigest": effectFactDigest,
		"providerRuntimeJournalResultRecordDigest": providerRuntimeJournalResultRecordDigest,
		"providerRuntimeResultSealReceiptDigest":   providerRuntimeResultSealReceiptDigest,
		"stageDigest":                              ownerStageDigest, "dispatchAckDigest": ownerDispatchAckDigest,
		"transportReceiptDigest":   transportReceiptDigest,
		"resultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"normalizedEventSetDigest": normalizedEventSetDigest,
		"stateVaultResolveRequest": nil, "stateVaultResolveReceipt": nil,
		"stateVaultRetireRequest": nil, "stateVaultRetirementReceipt": nil,
		"specificReceiptDigests": []any{},
		"sealedAt":               sealedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	effectSourceReceiptDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, effectReceiptBase)),
	)
	effectSourceReceipt := attemptAuthorityMigrationCloneObject(t, effectReceiptBase)
	effectSourceReceipt["receiptDigest"] = effectSourceReceiptDigest
	effectSourceReceiptBytes := attemptAuthorityMigrationJSON(t, effectSourceReceipt)
	continuationReceiptDigest := attemptAuthorityMigrationDigest(attemptID + ".continuation")
	rawResponse := map[string]any{
		"executionAuthorityKind": "shared-effect", "outcome": ownerOutcome,
		"result": result, "resultDigest": businessResultDigest,
		"continuationReceiptDigest": continuationReceiptDigest,
		"effectSourceReceipt":       effectSourceReceipt, "effectSourceFact": effectFact,
		"specificReceipts": []any{},
	}
	rawResponseBytes := attemptAuthorityMigrationJSON(t, rawResponse)
	rawResponseDigest := attemptAuthorityMigrationDigest(string(rawResponseBytes))
	observationSetDigest := attemptAuthorityMigrationDigest(attemptID + ".owner-observations")
	verificationGrantSetDigest := attemptAuthorityMigrationDigest(attemptID + ".verification-grants")
	claimedAt, dispatchedAt := sealedAt.Add(-2*time.Second), sealedAt.Add(-time.Second)
	insertControlled := func(intentDigest string, intent map[string]any, intentBytes []byte) error {
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,grant_digest,shard_lease_owner_id,shard_lease_generation,
		verification_grant_generation,verification_grant_receipt_set_digest,state,claim_generation,
		response_digest,response_bytes,claimed_at,dispatched_at,sealed_at,v45_eligible,
		stage_digest,dispatch_ack_digest,provider_capability_observation_receipt_set_digest,
		pre_effect_intent_digest,pre_effect_intent_json,pre_effect_intent_bytes
	) VALUES ($1,$2,$3,'provider-capability','tool.execute','capability-runtime/execute-tool',
		$4,$5,$6,$7,$8,$9,'lease-owner-v45-optional',1,1,$10,'sealed',1,$11,$12,$13,$14,$15,
		TRUE,$16,$17,$18,$19,$20::jsonb,$21)`, fixture.namespaceID, fixture.planDigest,
			fixture.repositoryCommit, ownerRequestDigest,
			attemptAuthorityMigrationDigest(attemptID+".owner-binding"), fixture.ownerImplementationDigest,
			attemptID, attemptDescriptorDigest, attemptAuthorityMigrationDigest(attemptID+".grant"),
			verificationGrantSetDigest, rawResponseDigest, rawResponseBytes, claimedAt, dispatchedAt,
			sealedAt, ownerStageDigest, ownerDispatchAckDigest, observationSetDigest,
			intentDigest, string(attemptAuthorityMigrationJSON(t, intent)), intentBytes)
		return err
	}
	tamperedPreEffect := attemptAuthorityMigrationCloneObject(t, preEffectIntent)
	tamperedPreEffect["ownerRequestId"] = "capability-effect-owner-request.swapped"
	tamperedPreEffectBase := attemptAuthorityMigrationCloneObject(t, tamperedPreEffect)
	delete(tamperedPreEffectBase, "intentDigest")
	tamperedPreEffectDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, tamperedPreEffectBase)),
	)
	tamperedPreEffect["intentDigest"] = tamperedPreEffectDigest
	tamperedPreEffectBytes := attemptAuthorityMigrationJSON(t, tamperedPreEffect)
	if err := insertControlled(tamperedPreEffectDigest, tamperedPreEffect, tamperedPreEffectBytes); err == nil {
		t.Fatal("shared-effect controlled authority accepted a swapped pre-effect owner identity")
	}
	if err := insertControlled(preEffectIntentDigest, preEffectIntent, preEffectIntentBytes); err != nil {
		t.Fatalf("store shared-effect controlled authority: %v", err)
	}
	projection := map[string]any{
		"serviceKind": "capability-runtime", "operation": "execute-tool",
		"executionAuthorityKind": "shared-effect", "invocationId": invocationID, "turnIndex": 0,
		"toolId": toolID, "toolCallId": toolCallID, "providerToolCallId": providerToolCallID,
		"providerRequestDigest": providerRequestDigest, "outcome": ownerOutcome,
		"resultDigest": businessResultDigest, "continuationReceiptDigest": continuationReceiptDigest,
		"preEffectIntentDigest":     preEffectIntentDigest,
		"effectSourceReceiptDigest": effectSourceReceiptDigest,
		"effectSourceFactDigest":    effectFactDigest, "specificReceiptDigests": []any{},
	}
	projectionDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, projection)))
	ownerReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-attempt-authority-owner-receipt", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "serviceKind": "capability-runtime",
		"operation": "execute-tool", "attemptId": attemptID, "descriptorDigest": attemptDescriptorDigest,
		"shardLeaseOwnerId": "lease-owner-v45-optional", "shardLeaseGeneration": 1,
		"verificationGrantGeneration":              1,
		"verificationAttemptGrantReceiptSetDigest": verificationGrantSetDigest,
		"requestDigest":                            ownerRequestDigest, "responseProjection": projection,
		"responseDigest": projectionDigest, "ownerImplementationDigest": fixture.ownerImplementationDigest,
		"completedAt": sealedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	ownerReceiptDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, ownerReceiptBase)),
	)
	ownerReceipt := attemptAuthorityMigrationCloneObject(t, ownerReceiptBase)
	ownerReceipt["receiptDigest"] = ownerReceiptDigest
	ownerReceiptBytes := attemptAuthorityMigrationJSON(t, ownerReceipt)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_attempt_authority_owner_receipts (
		namespace_id,plan_digest,repository_commit,journal_service_kind,service_kind,operation,
		attempt_id,descriptor_digest,shard_lease_owner_id,shard_lease_generation,
		verification_grant_generation,verification_grant_receipt_set_digest,request_digest,
		response_digest,owner_implementation_digest,completed_at,receipt_digest,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,'provider-capability','capability-runtime','execute-tool',$4,$5,
		'lease-owner-v45-optional',1,1,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, attemptID, attemptDescriptorDigest,
		verificationGrantSetDigest, ownerRequestDigest, projectionDigest,
		fixture.ownerImplementationDigest, sealedAt, ownerReceiptDigest,
		string(ownerReceiptBytes), ownerReceiptBytes); err != nil {
		t.Fatalf("store shared-effect owner receipt: %v", err)
	}
	effectSourceFactDigest := ""
	if fact != nil {
		effectSourceFactDigest, _ = fact["factDigest"].(string)
	}
	return v45OptionalSharedEffectOwnerFixture{
		ownerRequestDigest: ownerRequestDigest, ownerIdentityDigest: ownerIdentityDigest,
		ownerReceiptDigest: ownerReceiptDigest,
		ownerStageDigest:   ownerStageDigest, ownerDispatchAckDigest: ownerDispatchAckDigest,
		preEffectIntentDigest: preEffectIntentDigest, preEffectIntent: preEffectIntent,
		preEffectIntentBytes:      preEffectIntentBytes,
		effectSourceReceiptDigest: effectSourceReceiptDigest, effectSourceReceipt: effectSourceReceipt,
		effectSourceReceiptBytes:                 effectSourceReceiptBytes,
		providerRuntimeJournalResultRecordDigest: providerRuntimeJournalResultRecordDigest,
		providerRuntimeResultSealReceiptDigest:   providerRuntimeResultSealReceiptDigest,
		effectSourceFactDigest:                   effectSourceFactDigest,
		businessResultDigest:                     businessResultDigest,
	}
}

func seedSealedV45CapabilityProbeAdmission(
	t *testing.T,
	db *sql.DB,
	exerciseEncryptedSpoolNegatives ...bool,
) v45CapabilityProbeFixture {
	t.Helper()
	fixture := v45CapabilityProbeFixture{
		namespaceID:                    "namespace.v45.capability-probe",
		repositoryCommit:               strings.Repeat("b", 40),
		planDigest:                     attemptAuthorityMigrationDigest("v45-capability-probe-plan"),
		providerConfigurationID:        "provider.configuration.v45-probe",
		providerConfigurationDigest:    attemptAuthorityMigrationDigest("v45-probe-provider"),
		protocolFamily:                 "openai-responses",
		modelID:                        "model.v45-probe",
		modelLineageDigest:             attemptAuthorityMigrationDigest("v45-probe-model-lineage"),
		capabilityProfileID:            v45RuntimeFactSourceRegistrationProfiles[0].profileID,
		capabilityProfileDigest:        v45RuntimeFactSourceRegistrationProfiles[0].profileDigest,
		capabilityDescriptorDigest:     attemptAuthorityMigrationDigest("v45-probe-capability-descriptor"),
		capabilityID:                   "provider.background-job",
		adapterDigest:                  attemptAuthorityMigrationDigest("v45-probe-adapter"),
		ownerImplementationDigest:      attemptAuthorityMigrationDigest("v45-probe-owner"),
		authorityIssuerID:              "authority.capability-probe.v45",
		targetID:                       "target.v45-probe",
		targetDigest:                   attemptAuthorityMigrationDigest("v45-probe-target"),
		optionalSupportAuthorityDigest: attemptAuthorityMigrationDigest("v45-probe-support-authority"),
		runtimeSourceAuthorityID:       "authority.runtime-fact-source.v45",
		runtimeSourceRouteBinding:      "runtime-fact-source.v45",
		registrationAuthorityIssuerID:  "authority.runtime-fact-registration.v45",
		plannedAt:                      time.Date(2026, time.August, 9, 10, 0, 10, 0, time.UTC),
		planExpiresAt:                  time.Date(2026, time.August, 16, 10, 0, 10, 0, time.UTC),
	}
	claimedAt := fixture.plannedAt.Add(-10 * time.Second)
	dispatchedAt := claimedAt.Add(time.Second)
	referenceObservedAt := claimedAt.Add(1500 * time.Millisecond)
	referencesCreatedAt := claimedAt.Add(2 * time.Second)
	probedAt := claimedAt.Add(3 * time.Second)
	expiresAt := fixture.planExpiresAt.Add(time.Hour)
	sealedAt := claimedAt.Add(5 * time.Second)
	profileProjectionBase := map[string]any{
		"format": "prodivix.agent-capability-probe-profile-projection", "version": 1,
		"capabilityProfileId":     fixture.capabilityProfileID,
		"capabilityProfileDigest": fixture.capabilityProfileDigest,
		"capabilityId":            fixture.capabilityID, "inputClass": "bounded-public-text",
		"deliveryMode": "background", "providerStateMode": "provider-background-job",
		"toolExecutionLocus": "none", "cacheMode": "disabled", "reasoningMode": "none",
		"minimumParallelToolCalls": 0,
	}
	profileProjectionDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, profileProjectionBase)),
	)
	profileProjection := attemptAuthorityMigrationCloneObject(t, profileProjectionBase)
	profileProjection["projectionDigest"] = profileProjectionDigest
	publicPayload := map[string]any{
		"marker":       "prodivix-capability-probe-v1",
		"instruction":  "Complete the bounded public marker task in background mode.",
		"documentText": nil,
	}
	publicPayloadDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, publicPayload)),
	)
	requestPhases := []any{"submit", "poll-terminal"}
	probeProgramBase := map[string]any{
		"format": "prodivix.agent-capability-probe-program", "version": 1,
		"programId":         "capability-probe." + fixture.capabilityProfileID,
		"profileProjection": profileProjection, "profileProjectionDigest": profileProjectionDigest,
		"providerRequestIntent": map[string]any{
			"intentKind": "background-job-lifecycle", "publicPayload": publicPayload,
			"publicPayloadDigest": publicPayloadDigest, "requestPhases": requestPhases,
			"requiredToolNames": []any{}, "publicProbeResource": nil,
		},
		"observationContract": map[string]any{
			"supportedRequirements": []any{map[string]any{
				"factKind": "provider-job-receipt", "minimumCount": 1, "providerEventType": nil,
			}},
			"unsupportedDenialKinds": []any{
				"provider-declared-unsupported", "provider-feature-unavailable", "provider-request-denied",
			},
			"inconclusiveDenialKinds": []any{
				"normalized-response-incomplete", "probe-execution-timeout", "provider-response-unavailable",
			},
		},
		"hardLimits": map[string]any{
			"maximumRequestBytes": 16384, "maximumResponseBytes": 262144,
			"maximumNormalizedFacts": 16, "maximumToolCalls": 0,
			"maximumProviderRoundTrips": 6, "maximumPollAttempts": 4,
			"maximumSingleDispatchMs": 30000, "maximumExecutionDurationMs": 120000,
		},
	}
	probeProgramDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, probeProgramBase)),
	)
	probeProgram := attemptAuthorityMigrationCloneObject(t, probeProgramBase)
	probeProgram["programDigest"] = probeProgramDigest
	declaredProfileDigests := []any{fixture.capabilityProfileDigest}
	declaredProfileSetDigest := attemptAuthorityMigrationDigest("v45-probe-declared-profile-set")
	providerConfiguration := map[string]any{
		"providerConfigurationId": fixture.providerConfigurationID,
		"adapter": map[string]any{
			"protocolFamily": fixture.protocolFamily,
			"adapterDigest":  fixture.adapterDigest,
		},
	}
	modelLineage := map[string]any{
		"modelId":       fixture.modelID,
		"lineageDigest": fixture.modelLineageDigest,
	}
	requestBase := map[string]any{
		"format":                               "prodivix.agent-evaluation-capability-probe-admission-request",
		"version":                              1,
		"namespaceId":                          fixture.namespaceID,
		"repositoryCommit":                     fixture.repositoryCommit,
		"providerConfiguration":                providerConfiguration,
		"modelLineage":                         modelLineage,
		"qualificationCapabilityProfileId":     fixture.capabilityProfileID,
		"qualificationCapabilityProfileDigest": fixture.capabilityProfileDigest,
		"capabilityId":                         fixture.capabilityID,
		"declaredCapabilityProfileDigests":     declaredProfileDigests,
		"probeProgram":                         probeProgram,
		"probeProviderResourceAuthority":       nil,
		"minimumExpiresAt":                     fixture.planExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	fixture.requestDigest = attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, requestBase)))
	request := make(map[string]any, len(requestBase)+1)
	for key, value := range requestBase {
		request[key] = value
	}
	request["requestDigest"] = fixture.requestDigest
	requestBytes := attemptAuthorityMigrationJSON(t, request)
	fixture.stageDigest = attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-admission-stage", "version": 1,
		"requestDigest": fixture.requestDigest, "ownerImplementationDigest": fixture.ownerImplementationDigest,
	})))
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_probe_admissions (
		namespace_id,repository_commit,request_digest,state,claim_generation,
		provider_configuration_id,provider_configuration_digest,protocol_family,model_id,
		model_lineage_digest,qualification_capability_profile_id,
		qualification_capability_profile_digest,capability_id,
		declared_capability_profile_set_digest,minimum_expires_at,adapter_digest,
		owner_implementation_digest,request_json,request_bytes,claimed_at
	) VALUES ($1,$2,$3,'claimed',1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18)`,
		fixture.namespaceID, fixture.repositoryCommit, fixture.requestDigest,
		fixture.providerConfigurationID, fixture.providerConfigurationDigest,
		fixture.protocolFamily, fixture.modelID, fixture.modelLineageDigest,
		fixture.capabilityProfileID, fixture.capabilityProfileDigest, fixture.capabilityID,
		declaredProfileSetDigest, fixture.planExpiresAt, fixture.adapterDigest,
		fixture.ownerImplementationDigest, string(requestBytes), requestBytes, claimedAt); err != nil {
		t.Fatalf("claim v45 capability probe admission: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_admissions
		SET state='dispatched',stage_digest=$4,dispatched_at=$5
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.repositoryCommit, fixture.requestDigest, fixture.stageDigest, dispatchedAt); err != nil {
		t.Fatalf("dispatch v45 capability probe admission: %v", err)
	}
	encryptionPolicyDigest := attemptAuthorityMigrationDigest("v45-probe-encryption-policy")
	insertEncryptedSpool := func(
		entry map[string]any,
		ciphertextBytes []byte,
		phase string,
		sequence int,
	) error {
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_probe_response_spools (
			namespace_id,repository_commit,admission_request_digest,phase,sequence,spool_ref,
			response_digest,transport_receipt_digest,envelope_digest,ciphertext_digest,
			ciphertext_bytes,ciphertext_byte_length,aad_digest,encryption_profile_digest,
			key_ref_digest,spooled_at,expires_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
			fixture.namespaceID, fixture.repositoryCommit, fixture.requestDigest, phase, sequence,
			entry["spoolRef"], entry["responseDigest"], entry["transportReceiptDigest"],
			entry["envelopeDigest"], entry["ciphertextDigest"], ciphertextBytes,
			entry["ciphertextByteLength"], entry["aadDigest"], entry["encryptionProfileDigest"],
			entry["keyRefDigest"], dispatchedAt.Add(250*time.Millisecond), expiresAt)
		return err
	}
	spoolReceipts := make([]any, 0, len(requestPhases))
	for index, rawPhase := range requestPhases {
		phase := rawPhase.(string)
		ciphertextBytes := []byte(fmt.Sprintf("v45-probe-ciphertext-%d", index))
		spoolEntryBase := map[string]any{
			"phase": phase, "sequence": index,
			"transportReceiptDigest": attemptAuthorityMigrationDigest(
				fmt.Sprintf("v45-probe-spool-transport-%d", index),
			),
			"responseDigest": attemptAuthorityMigrationDigest(
				fmt.Sprintf("v45-probe-spool-response-%d", index),
			),
			"spoolRef": fmt.Sprintf("capability-probe-spool.v45.%d", index),
			"envelopeDigest": attemptAuthorityMigrationDigest(
				fmt.Sprintf("v45-probe-spool-envelope-%d", index),
			),
			"ciphertextDigest":     attemptAuthorityMigrationDigest(string(ciphertextBytes)),
			"ciphertextByteLength": len(ciphertextBytes),
			"aadDigest": attemptAuthorityMigrationDigest(
				fmt.Sprintf("v45-probe-spool-aad-%d", index),
			),
			"encryptionProfileDigest": attemptAuthorityMigrationDigest(
				fmt.Sprintf("v45-probe-spool-encryption-profile-%d", index),
			),
			"keyRefDigest": attemptAuthorityMigrationDigest(
				fmt.Sprintf("v45-probe-spool-key-ref-%d", index),
			),
		}
		spoolReceiptDigest := attemptAuthorityMigrationDigest(
			string(attemptAuthorityMigrationJSON(t, spoolEntryBase)),
		)
		spoolEntry := attemptAuthorityMigrationCloneObject(t, spoolEntryBase)
		spoolEntry["spoolReceiptDigest"] = spoolReceiptDigest
		spoolReceipts = append(spoolReceipts, spoolEntry)
		if len(exerciseEncryptedSpoolNegatives) > 0 && exerciseEncryptedSpoolNegatives[0] && index == 0 {
			oversizedCiphertext := make([]byte, 262145)
			oversizedEntry := attemptAuthorityMigrationCloneObject(t, spoolEntryBase)
			oversizedEntry["ciphertextDigest"] = attemptAuthorityMigrationDigest(string(oversizedCiphertext))
			oversizedEntry["ciphertextByteLength"] = len(oversizedCiphertext)
			if err := insertEncryptedSpool(oversizedEntry, oversizedCiphertext, phase, index); err == nil {
				t.Fatal("capability probe response spool accepted ciphertext above the frozen program cap")
			}
			phaseSwappedEntry := attemptAuthorityMigrationCloneObject(t, spoolEntryBase)
			phaseSwappedEntry["phase"] = requestPhases[1]
			if err := insertEncryptedSpool(
				phaseSwappedEntry, ciphertextBytes, requestPhases[1].(string), index,
			); err == nil {
				t.Fatal("capability probe response spool accepted a swapped program phase/sequence fence")
			}
		}
		if err := insertEncryptedSpool(spoolEntryBase, ciphertextBytes, phase, index); err != nil {
			t.Fatalf("store v45 capability probe encrypted response spool %d: %v", index, err)
		}
	}
	spoolReceiptSetDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, map[string]any{"spoolReceipts": spoolReceipts})),
	)

	referenceKinds := []string{
		"probe-request", "probe-response", "dispatch", "transport",
		"encrypted-response-spool", "normalized-event-set",
	}
	referenceFormats := []string{
		"prodivix.agent-evaluation-capability-probe-request",
		"prodivix.agent-evaluation-capability-probe-response",
		"prodivix.agent-evaluation-capability-probe-dispatch-receipt",
		"prodivix.agent-evaluation-capability-probe-transport-receipt",
		"prodivix.agent-evaluation-capability-probe-encrypted-response-spool-receipt",
		"prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt",
	}
	referenceBundle := make([]any, 0, len(referenceKinds))
	referenceRoots := make([]any, 0, len(referenceKinds))
	referenceDigests := make([]string, 0, len(referenceKinds))
	var previousReceiptDigest any
	for index, kind := range referenceKinds {
		sourceReceipt := map[string]any{"kind": kind, "sealed": true}
		if index == 4 {
			sourceReceipt = map[string]any{
				"format":  "prodivix.agent-evaluation-capability-probe-encrypted-response-spool-source-receipt",
				"version": 1, "admissionRequestDigest": fixture.requestDigest,
				"probeProgramDigest":          probeProgramDigest,
				"profileProjectionDigest":     profileProjectionDigest,
				"providerConfigurationDigest": fixture.providerConfigurationDigest,
				"modelLineageDigest":          fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
				"ownerImplementationDigest": fixture.ownerImplementationDigest,
				"authorityIssuerId":         fixture.authorityIssuerID,
				"observedAt":                referenceObservedAt.Format("2006-01-02T15:04:05.000Z"),
				"encryptionPolicyDigest":    encryptionPolicyDigest,
				"spoolReceipts":             spoolReceipts, "spoolReceiptSetDigest": spoolReceiptSetDigest,
			}
		}
		sourceReceiptDigest := attemptAuthorityMigrationDigest(
			string(attemptAuthorityMigrationJSON(t, sourceReceipt)),
		)
		receipt := map[string]any{
			"format":                               referenceFormats[index],
			"version":                              1,
			"admissionRequestDigest":               fixture.requestDigest,
			"providerConfigurationDigest":          fixture.providerConfigurationDigest,
			"modelLineageDigest":                   fixture.modelLineageDigest,
			"qualificationCapabilityProfileDigest": fixture.capabilityProfileDigest,
			"capabilityId":                         fixture.capabilityID,
			"probeProgramDigest":                   probeProgramDigest,
			"profileProjectionDigest":              profileProjectionDigest,
			"adapterDigest":                        fixture.adapterDigest,
			"ownerImplementationDigest":            fixture.ownerImplementationDigest,
			"authorityIssuerId":                    fixture.authorityIssuerID,
			"previousReceiptDigest":                previousReceiptDigest,
			"observedAt":                           referenceObservedAt.Format("2006-01-02T15:04:05.000Z"),
			"sourceReceipt":                        sourceReceipt,
			"sourceReceiptDigest":                  sourceReceiptDigest,
		}
		receiptBytes := attemptAuthorityMigrationJSON(t, receipt)
		receiptDigest := attemptAuthorityMigrationDigest(string(receiptBytes))
		referenceDigests = append(referenceDigests, receiptDigest)
		referenceBundle = append(referenceBundle, map[string]any{
			"kind": kind, "receipt": receipt, "receiptDigest": receiptDigest,
		})
		referenceRoots = append(referenceRoots, map[string]any{
			"kind": kind, "receiptDigest": receiptDigest,
		})
		previousReceiptDigest = receiptDigest
	}
	referenceBundleBytes := attemptAuthorityMigrationJSON(t, referenceBundle)
	referenceReceiptSetDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, map[string]any{"references": referenceRoots})),
	)
	storeReference := func(index int, entry map[string]any) error {
		receipt := entry["receipt"].(map[string]any)
		receiptBytes := attemptAuthorityMigrationJSON(t, receipt)
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_probe_reference_receipts (
			namespace_id,repository_commit,request_digest,ordinal,kind,receipt_digest,
			source_receipt_digest,receipt_json,receipt_bytes,created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`, fixture.namespaceID,
			fixture.repositoryCommit, fixture.requestDigest, index, entry["kind"],
			entry["receiptDigest"], receipt["sourceReceiptDigest"], string(receiptBytes),
			receiptBytes, referencesCreatedAt)
		return err
	}
	for index := 0; index < 4; index++ {
		entry := referenceBundle[index].(map[string]any)
		if err := storeReference(index, entry); err != nil {
			t.Fatalf("store durable capability probe reference %d: %v", index, err)
		}
	}
	if len(exerciseEncryptedSpoolNegatives) > 0 && exerciseEncryptedSpoolNegatives[0] {
		assertRecomputedSpoolReferenceRejected := func(
			label string,
			mutate func(sourceReceipt map[string]any),
		) {
			t.Helper()
			validEntry := referenceBundle[4].(map[string]any)
			validReceipt := validEntry["receipt"].(map[string]any)
			mutatedReceipt := attemptAuthorityMigrationCloneObject(t, validReceipt)
			mutatedSource := attemptAuthorityMigrationCloneObject(
				t, mutatedReceipt["sourceReceipt"].(map[string]any),
			)
			mutate(mutatedSource)
			for _, rawEntry := range mutatedSource["spoolReceipts"].([]any) {
				entry := rawEntry.(map[string]any)
				delete(entry, "spoolReceiptDigest")
				entry["spoolReceiptDigest"] = attemptAuthorityMigrationDigest(
					string(attemptAuthorityMigrationJSON(t, entry)),
				)
			}
			mutatedSource["spoolReceiptSetDigest"] = attemptAuthorityMigrationDigest(
				string(attemptAuthorityMigrationJSON(t, map[string]any{
					"spoolReceipts": mutatedSource["spoolReceipts"],
				})),
			)
			mutatedReceipt["sourceReceipt"] = mutatedSource
			mutatedReceipt["sourceReceiptDigest"] = attemptAuthorityMigrationDigest(
				string(attemptAuthorityMigrationJSON(t, mutatedSource)),
			)
			mutatedEntry := map[string]any{
				"kind":          validEntry["kind"],
				"receipt":       mutatedReceipt,
				"receiptDigest": attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, mutatedReceipt))),
			}
			if err := storeReference(4, mutatedEntry); err == nil {
				t.Fatalf("capability probe encrypted spool reference accepted %s after full digest recomputation", label)
			}
		}
		assertRecomputedSpoolReferenceRejected("a missing raw spool", func(source map[string]any) {
			entries := source["spoolReceipts"].([]any)
			entries[0].(map[string]any)["spoolRef"] = "capability-probe-spool.v45.missing"
		})
		for _, field := range []string{
			"phase", "sequence", "transportReceiptDigest", "responseDigest", "spoolRef",
			"envelopeDigest", "ciphertextDigest", "aadDigest", "encryptionProfileDigest", "keyRefDigest",
		} {
			field := field
			assertRecomputedSpoolReferenceRejected("a swapped "+field, func(source map[string]any) {
				entries := source["spoolReceipts"].([]any)
				entries[0].(map[string]any)[field] = entries[1].(map[string]any)[field]
			})
		}
		assertRecomputedSpoolReferenceRejected("a swapped ciphertextByteLength", func(source map[string]any) {
			entries := source["spoolReceipts"].([]any)
			entries[0].(map[string]any)["ciphertextByteLength"] = float64(1)
		})
	}
	for index := 4; index < len(referenceBundle); index++ {
		entry := referenceBundle[index].(map[string]any)
		if err := storeReference(index, entry); err != nil {
			t.Fatalf("store durable capability probe reference %d: %v", index, err)
		}
	}
	var waitingState string
	var waitingAck sql.NullString
	var storedReferenceCount int
	if err := db.QueryRowContext(ctx, `SELECT admission.state,admission.dispatch_ack_digest,
		(SELECT COUNT(*) FROM agent_evaluation_capability_probe_reference_receipts reference
		 WHERE reference.namespace_id=admission.namespace_id
		   AND reference.repository_commit=admission.repository_commit
		   AND reference.request_digest=admission.request_digest)
		FROM agent_evaluation_capability_probe_admissions admission
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.repositoryCommit, fixture.requestDigest).Scan(&waitingState, &waitingAck,
		&storedReferenceCount); err != nil {
		t.Fatalf("read pre-ACK capability probe references: %v", err)
	}
	if waitingState != "dispatched" || waitingAck.Valid || storedReferenceCount != 6 {
		t.Fatalf("pre-ACK capability probe state=%q ack=%v references=%d",
			waitingState, waitingAck, storedReferenceCount)
	}

	jobFactDigest := attemptAuthorityMigrationDigest("v45-probe-job-fact")
	semanticProofBase := map[string]any{
		"proofKind": "background-job-lifecycle", "jobReceiptDigest": jobFactDigest,
		"jobIdDigest":            attemptAuthorityMigrationDigest("v45-probe-job-id"),
		"submitRequestDigest":    attemptAuthorityMigrationDigest("v45-probe-submit-request"),
		"pollResponseDigest":     attemptAuthorityMigrationDigest("v45-probe-poll-response"),
		"terminalResponseDigest": attemptAuthorityMigrationDigest("v45-probe-terminal-response"),
	}
	semanticProof := attemptAuthorityMigrationCloneObject(t, semanticProofBase)
	semanticProof["proofDigest"] = attemptAuthorityMigrationCanonicalDigest(t, semanticProofBase)
	observedLimitsBase := map[string]any{
		"requestBytes": 1024, "responseBytes": 2048, "normalizedFactCount": 1,
		"toolCallCount": 0, "providerRoundTripCount": 2, "pollAttemptCount": 1,
		"observedMaximumSingleDispatchMs": 1000, "observedExecutionDurationMs": 2000,
	}
	observedLimits := attemptAuthorityMigrationCloneObject(t, observedLimitsBase)
	observedLimitDigest := attemptAuthorityMigrationCanonicalDigest(t, observedLimitsBase)
	observedLimits["limitDigest"] = observedLimitDigest
	normalizedObservationBase := map[string]any{
		"format": "prodivix.agent-capability-probe-program-observation", "version": 1,
		"observationSource": "normalized-provider-response", "probeProgramDigest": probeProgramDigest,
		"profileProjectionDigest":     profileProjectionDigest,
		"providerConfigurationDigest": fixture.providerConfigurationDigest,
		"modelLineageDigest":          fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"probeRequestDigest": referenceDigests[0], "providerResponseDigest": referenceDigests[1],
		"normalizedEventSetDigest": referenceDigests[5], "status": "supported",
		"observedFacts": []any{map[string]any{
			"factKind": "provider-job-receipt", "factDigest": jobFactDigest, "providerEventType": nil,
		}},
		"semanticProof": semanticProof, "denial": nil, "observedLimits": observedLimits,
		"observedLimitDigest": observedLimitDigest,
		"observedAt":          probedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	normalizedObservation := attemptAuthorityMigrationCloneObject(t, normalizedObservationBase)
	normalizedObservationDigest := attemptAuthorityMigrationCanonicalDigest(t, normalizedObservationBase)
	normalizedObservation["observationDigest"] = normalizedObservationDigest
	probedCapabilityBase := map[string]any{
		"normalizedObservationDigest": normalizedObservationDigest,
		"observedLimitDigest":         observedLimitDigest, "observedProfileDigest": fixture.capabilityProfileDigest,
		"probeProgramDigest": probeProgramDigest, "profileProjectionDigest": profileProjectionDigest,
		"status": "supported",
	}
	probeReceiptBase := map[string]any{
		"probeId":                     "probe.v45.background-job",
		"providerConfigurationDigest": fixture.providerConfigurationDigest,
		"modelLineageDigest":          fixture.modelLineageDigest,
		"requestedProfileDigest":      fixture.capabilityProfileDigest,
		"declaredCapabilityDigest":    declaredProfileSetDigest,
		"probedCapabilityDigest":      attemptAuthorityMigrationCanonicalDigest(t, probedCapabilityBase),
		"status":                      "supported",
		"observedProfileDigest":       fixture.capabilityProfileDigest,
		"observedLimitDigest":         observedLimitDigest,
		"probeProgramDigest":          probeProgramDigest,
		"profileProjectionDigest":     profileProjectionDigest,
		"normalizedObservationDigest": normalizedObservationDigest,
		"probedAt":                    probedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                   expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	probeReceiptDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, probeReceiptBase)),
	)
	probeReceipt := make(map[string]any, len(probeReceiptBase)+1)
	for key, value := range probeReceiptBase {
		probeReceipt[key] = value
	}
	probeReceipt["receiptDigest"] = probeReceiptDigest
	probeEvidenceBase := map[string]any{
		"authorityKind":             "sealed-provider-capability-probe",
		"authorityIssuerId":         fixture.authorityIssuerID,
		"ownerImplementationDigest": fixture.ownerImplementationDigest,
		"adapterDigest":             fixture.adapterDigest,
		"probeRequestDigest":        referenceDigests[0],
		"probeResponseDigest":       referenceDigests[1],
		"dispatchReceiptDigest":     referenceDigests[2],
		"transportReceiptDigest":    referenceDigests[3],
		"responseSpoolDigest":       referenceDigests[4],
		"normalizedEventSetDigest":  referenceDigests[5],
		"probeProgram":              probeProgram,
		"normalizedObservation":     normalizedObservation,
		"receipt":                   probeReceipt,
	}
	fixture.evidenceDigest = attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, probeEvidenceBase)),
	)
	probeEvidence := make(map[string]any, len(probeEvidenceBase)+1)
	for key, value := range probeEvidenceBase {
		probeEvidence[key] = value
	}
	probeEvidence["evidenceDigest"] = fixture.evidenceDigest
	ownerAdmissionDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-owner-admission", "version": 1,
		"requestDigest": fixture.requestDigest, "evidenceDigest": fixture.evidenceDigest,
		"ownerImplementationDigest": fixture.ownerImplementationDigest, "stageDigest": fixture.stageDigest,
	})))
	fixture.dispatchAckDigest = attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-dispatch-ack", "version": 1,
		"requestDigest": fixture.requestDigest, "evidenceDigest": fixture.evidenceDigest,
		"ownerImplementationDigest": fixture.ownerImplementationDigest,
		"ownerAdmissionDigest":      ownerAdmissionDigest, "stageDigest": fixture.stageDigest,
	})))
	responseBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-admission-response", "version": 1,
		"requestDigest": fixture.requestDigest, "probeEvidence": probeEvidence,
		"ownerImplementationDigest": fixture.ownerImplementationDigest,
		"ownerAdmissionDigest":      ownerAdmissionDigest, "stageDigest": fixture.stageDigest,
		"dispatchAckDigest": fixture.dispatchAckDigest,
	}
	admissionReceiptDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, responseBase)),
	)
	response := make(map[string]any, len(responseBase)+1)
	for key, value := range responseBase {
		response[key] = value
	}
	response["admissionReceiptDigest"] = admissionReceiptDigest
	responseBytes := attemptAuthorityMigrationJSON(t, response)
	fixture.responseDigest = attemptAuthorityMigrationDigest(string(responseBytes))
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_admissions SET
		dispatch_ack_digest=$4,authority_issuer_id=$5,owner_admission_digest=$6,
		reference_receipt_set_digest=$7,evidence_digest=$8,probe_receipt_digest=$9,
		probe_status='supported',observed_profile_digest=$10,probed_at=$11,expires_at=$12,
		admission_receipt_digest=$13,response_digest=$14,reference_bundle_json=$15::jsonb,
		reference_bundle_bytes=$16,response_json=$17::jsonb,response_bytes=$18
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.repositoryCommit, fixture.requestDigest, fixture.dispatchAckDigest,
		fixture.authorityIssuerID, ownerAdmissionDigest, referenceReceiptSetDigest,
		fixture.evidenceDigest, probeReceiptDigest, fixture.capabilityProfileDigest,
		probedAt, expiresAt, admissionReceiptDigest, fixture.responseDigest,
		string(referenceBundleBytes), referenceBundleBytes, string(responseBytes), responseBytes); err != nil {
		t.Fatalf("acknowledge v45 capability probe admission: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_admissions
		SET state='sealed',sealed_at=$4
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.repositoryCommit, fixture.requestDigest, sealedAt); err != nil {
		t.Fatalf("seal v45 capability probe admission: %v", err)
	}
	registrationRequestBase := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-request", "version": 1,
		"namespaceId": fixture.namespaceID, "repositoryCommit": fixture.repositoryCommit,
		"sourceAuthorityKind":                 "shared-durable-capability",
		"sourceKind":                          "sealed-provider-response-metadata",
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"capabilityProfileId":                 fixture.capabilityProfileID,
		"capabilityProfileDigest":             fixture.capabilityProfileDigest,
		"capabilityId":                        fixture.capabilityID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"minimumExpiresAt": fixture.planExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	registrationRequestDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, registrationRequestBase)),
	)
	registrationRequest := make(map[string]any, len(registrationRequestBase)+1)
	for key, value := range registrationRequestBase {
		registrationRequest[key] = value
	}
	registrationRequest["requestDigest"] = registrationRequestDigest
	registrationRequestBytes := attemptAuthorityMigrationJSON(t, registrationRequest)
	registrationClaimedAt := claimedAt
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_runtime_fact_source_owner_registrations (
		namespace_id,repository_commit,request_digest,source_authority_kind,source_kind,
		source_authority_id,source_authority_implementation_digest,route_binding,
		capability_profile_id,capability_profile_digest,capability_id,protocol_family,
		provider_configuration_id,model_id,model_lineage_digest,adapter_digest,minimum_expires_at,
		registration_authority_issuer_id,state,claim_generation,request_json,request_bytes,
		v45_eligible,claimed_at
	) VALUES ($1,$2,$3,'shared-durable-capability','sealed-provider-response-metadata',
		$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'claimed',1,$17::jsonb,$18,TRUE,$19)`,
		fixture.namespaceID, fixture.repositoryCommit, registrationRequestDigest,
		fixture.runtimeSourceAuthorityID, fixture.ownerImplementationDigest,
		fixture.runtimeSourceRouteBinding, fixture.capabilityProfileID,
		fixture.capabilityProfileDigest, fixture.capabilityID, fixture.protocolFamily,
		fixture.providerConfigurationID, fixture.modelID, fixture.modelLineageDigest,
		fixture.adapterDigest, fixture.planExpiresAt, fixture.registrationAuthorityIssuerID,
		string(registrationRequestBytes), registrationRequestBytes, registrationClaimedAt); err != nil {
		t.Fatalf("claim runtime-fact source owner registration: %v", err)
	}
	registrationStageDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-stage", "version": 1,
		"requestDigest":                 registrationRequestDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
	})))
	registrationDispatchedAt := registrationClaimedAt.Add(time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_runtime_fact_source_owner_registrations
		SET state='dispatched',stage_digest=$4,dispatched_at=$5
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.repositoryCommit, registrationRequestDigest, registrationStageDigest,
		registrationDispatchedAt); err != nil {
		t.Fatalf("dispatch runtime-fact source owner registration: %v", err)
	}
	registeredAt := registrationClaimedAt.Add(3 * time.Second)
	registrationExpiresAt := fixture.planExpiresAt.Add(30 * time.Minute)
	ownerHealthBase := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-health", "version": 1,
		"requestDigest":                       registrationRequestDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceKind":                          "sealed-provider-response-metadata",
		"routeBinding":                        fixture.runtimeSourceRouteBinding, "status": "ready",
		"checkedAt": registeredAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt": registrationExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	ownerHealthDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, ownerHealthBase)),
	)
	ownerHealth := make(map[string]any, len(ownerHealthBase)+1)
	for key, value := range ownerHealthBase {
		ownerHealth[key] = value
	}
	ownerHealth["healthDigest"] = ownerHealthDigest
	ownerHealthBytes := attemptAuthorityMigrationJSON(t, ownerHealth)
	ownerRegistrationAdmissionDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-admission", "version": 1,
		"requestDigest": registrationRequestDigest, "ownerHealthDigest": ownerHealthDigest,
		"stageDigest": registrationStageDigest,
	})))
	registrationDispatchAckDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-dispatch-ack", "version": 1,
		"requestDigest": registrationRequestDigest, "ownerHealthDigest": ownerHealthDigest,
		"ownerAdmissionDigest": ownerRegistrationAdmissionDigest, "stageDigest": registrationStageDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
	})))
	registrationReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt", "version": 1,
		"namespaceId": fixture.namespaceID, "repositoryCommit": fixture.repositoryCommit,
		"requestDigest": registrationRequestDigest, "sourceAuthorityKind": "shared-durable-capability",
		"sourceKind":                          "sealed-provider-response-metadata",
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"capabilityProfileId":                 fixture.capabilityProfileID,
		"capabilityProfileDigest":             fixture.capabilityProfileDigest,
		"capabilityId":                        fixture.capabilityID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
		"ownerHealthDigest":             ownerHealthDigest,
		"ownerAdmissionDigest":          ownerRegistrationAdmissionDigest,
		"stageDigest":                   registrationStageDigest, "dispatchAckDigest": registrationDispatchAckDigest,
		"registeredAt": registeredAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":    registrationExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	fixture.registrationReceiptDigest = attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, registrationReceiptBase)),
	)
	registrationReceipt := make(map[string]any, len(registrationReceiptBase)+1)
	for key, value := range registrationReceiptBase {
		registrationReceipt[key] = value
	}
	registrationReceipt["registrationReceiptDigest"] = fixture.registrationReceiptDigest
	registrationReceiptBytes := attemptAuthorityMigrationJSON(t, registrationReceipt)
	registrationAcknowledgedAt := registrationClaimedAt.Add(4 * time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_runtime_fact_source_owner_registrations SET
		owner_health_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,
		registered_at=$7,expires_at=$8,registration_receipt_digest=$9,
		owner_health_json=$10::jsonb,owner_health_bytes=$11,receipt_json=$12::jsonb,
		receipt_bytes=$13,updated_at=$14
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.repositoryCommit, registrationRequestDigest, ownerHealthDigest,
		ownerRegistrationAdmissionDigest, registrationDispatchAckDigest, registeredAt,
		registrationExpiresAt, fixture.registrationReceiptDigest, string(ownerHealthBytes),
		ownerHealthBytes, string(registrationReceiptBytes), registrationReceiptBytes,
		registrationAcknowledgedAt); err != nil {
		t.Fatalf("acknowledge runtime-fact source owner registration: %v", err)
	}
	registrationSealedAt := registrationClaimedAt.Add(5 * time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_runtime_fact_source_owner_registrations
		SET state='sealed',sealed_at=$4,updated_at=$4
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.repositoryCommit, registrationRequestDigest, registrationSealedAt); err != nil {
		t.Fatalf("seal runtime-fact source owner registration: %v", err)
	}
	runtimeFactSourceAuthorityBase := map[string]any{
		"kind": "shared-durable-capability", "sourceKind": "sealed-provider-response-metadata",
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"capabilityProfileId":                 fixture.capabilityProfileID,
		"capabilityProfileDigest":             fixture.capabilityProfileDigest,
		"capabilityId":                        fixture.capabilityID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"registrationAuthorityIssuerId": fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":     fixture.registrationReceiptDigest,
	}
	fixture.runtimeFactSourceAuthorityDigest = attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, runtimeFactSourceAuthorityBase)),
	)
	runtimeFactSourceAuthority := make(map[string]any, len(runtimeFactSourceAuthorityBase)+1)
	for key, value := range runtimeFactSourceAuthorityBase {
		runtimeFactSourceAuthority[key] = value
	}
	runtimeFactSourceAuthority["authorityDigest"] = fixture.runtimeFactSourceAuthorityDigest
	optionalSupportAuthorityBase := map[string]any{
		"qualificationCapabilityProfileId":     fixture.capabilityProfileID,
		"qualificationCapabilityProfileDigest": fixture.capabilityProfileDigest,
		"capabilityId":                         fixture.capabilityID,
		"supportExpectation":                   "required",
		"declaredCapabilityProfileDigests":     declaredProfileDigests,
		"runtimeFactSourceAuthority":           runtimeFactSourceAuthority,
		"resolvedCapabilityDescriptor": map[string]any{
			"descriptorDigest": fixture.capabilityDescriptorDigest,
		},
		"probeEvidence": probeEvidence,
	}
	fixture.optionalSupportAuthorityDigest = attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, optionalSupportAuthorityBase)),
	)
	optionalSupportAuthority := attemptAuthorityMigrationCloneObject(t, optionalSupportAuthorityBase)
	optionalSupportAuthority["authorityDigest"] = fixture.optionalSupportAuthorityDigest
	target := map[string]any{
		"targetId":                           fixture.targetID,
		"targetDigest":                       fixture.targetDigest,
		"capabilityProfileId":                fixture.capabilityProfileID,
		"capabilityProfileDigest":            fixture.capabilityProfileDigest,
		"protocolFamily":                     fixture.protocolFamily,
		"providerConfigurationId":            fixture.providerConfigurationID,
		"providerIdentityDigest":             fixture.providerConfigurationDigest,
		"modelId":                            fixture.modelID,
		"modelLineageDigest":                 fixture.modelLineageDigest,
		"optionalCapabilitySupportAuthority": optionalSupportAuthority,
	}
	fixture.planJSON = attemptAuthorityMigrationJSON(t, map[string]any{
		"value": map[string]any{
			"capabilityQualificationTargets": []any{target},
			"providerConfigurations":         []any{providerConfiguration},
			"modelConfigurations":            []any{modelLineage},
		},
	})
	planTx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := planTx.ExecContext(ctx, `INSERT INTO agent_evaluation_plans (
		namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
		plan_json,plan_bytes,planned_at,expires_at
	) VALUES ($1,'plan.v45.capability-probe',$2,$3,11640,$4::jsonb,$5,$6,$7)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, string(fixture.planJSON), fixture.planJSON,
		fixture.plannedAt, fixture.planExpiresAt); err != nil {
		_ = planTx.Rollback()
		t.Fatalf("store v45 capability probe plan: %v", err)
	}
	if _, err := planTx.ExecContext(ctx, `INSERT INTO agent_evaluation_plan_capability_probe_admission_links (
		namespace_id,plan_digest,repository_commit,target_id,target_digest,authority_digest,
		evidence_digest,request_digest,created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, fixture.targetID, fixture.targetDigest,
		fixture.optionalSupportAuthorityDigest, fixture.evidenceDigest, fixture.requestDigest,
		fixture.plannedAt); err != nil {
		_ = planTx.Rollback()
		t.Fatalf("link v45 plan to sealed capability probe admission: %v", err)
	}
	if err := planTx.Commit(); err != nil {
		t.Fatalf("commit exact v45 capability probe plan/link: %v", err)
	}
	return fixture
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeAdmission(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	fixture := seedSealedV45CapabilityProbeAdmission(t, db, true)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	var state, stageDigest, dispatchAckDigest, responseDigest string
	var references, encryptedSpools int
	if err := db.QueryRowContext(ctx, `SELECT admission.state,admission.stage_digest,
		admission.dispatch_ack_digest,admission.response_digest,
		(SELECT COUNT(*) FROM agent_evaluation_capability_probe_reference_receipts reference
		 WHERE reference.namespace_id=admission.namespace_id
		   AND reference.repository_commit=admission.repository_commit
		   AND reference.request_digest=admission.request_digest),
		(SELECT COUNT(*) FROM agent_evaluation_capability_probe_response_spools spool
		 WHERE spool.namespace_id=admission.namespace_id
		   AND spool.repository_commit=admission.repository_commit
		   AND spool.admission_request_digest=admission.request_digest)
		FROM agent_evaluation_capability_probe_admissions admission
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.repositoryCommit, fixture.requestDigest).Scan(&state, &stageDigest,
		&dispatchAckDigest, &responseDigest, &references, &encryptedSpools); err != nil {
		t.Fatalf("read sealed capability probe admission: %v", err)
	}
	if state != "sealed" || stageDigest != fixture.stageDigest ||
		dispatchAckDigest != fixture.dispatchAckDigest || responseDigest != fixture.responseDigest ||
		references != 6 || encryptedSpools != 2 {
		t.Fatalf("sealed capability probe drifted: state=%q stage=%q ack=%q response=%q refs=%d spools=%d",
			state, stageDigest, dispatchAckDigest, responseDigest, references, encryptedSpools)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_admissions
		SET stage_digest=$4 WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		fixture.namespaceID, fixture.repositoryCommit, fixture.requestDigest,
		attemptAuthorityMigrationDigest("swapped-capability-probe-stage")); err == nil {
		t.Fatal("sealed capability probe admission accepted a swapped stage fence")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_reference_receipts
		SET source_receipt_digest=$4
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 AND ordinal=0`,
		fixture.namespaceID, fixture.repositoryCommit, fixture.requestDigest,
		attemptAuthorityMigrationDigest("swapped-capability-probe-source")); err == nil {
		t.Fatal("durable capability probe reference accepted a late source swap")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_response_spools
		SET response_digest=$4
		WHERE namespace_id=$1 AND repository_commit=$2
			AND admission_request_digest=$3 AND sequence=0`, fixture.namespaceID,
		fixture.repositoryCommit, fixture.requestDigest,
		attemptAuthorityMigrationDigest("swapped-capability-probe-spool-response")); err == nil {
		t.Fatal("durable capability probe response spool accepted a late metadata swap")
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM agent_evaluation_capability_probe_response_spools
		WHERE namespace_id=$1 AND repository_commit=$2
			AND admission_request_digest=$3 AND sequence=0`, fixture.namespaceID,
		fixture.repositoryCommit, fixture.requestDigest); err == nil {
		t.Fatal("durable capability probe response spool accepted a late deletion")
	}
	lateCiphertext := []byte("late-plan-linked-capability-probe-spool")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_probe_response_spools (
		namespace_id,repository_commit,admission_request_digest,phase,sequence,spool_ref,
		response_digest,transport_receipt_digest,envelope_digest,ciphertext_digest,
		ciphertext_bytes,ciphertext_byte_length,aad_digest,encryption_profile_digest,
		key_ref_digest,spooled_at,expires_at
	) VALUES ($1,$2,$3,'late',2,'capability-probe-spool.v45.late',$4,$5,$6,$7,
		$8,$9,$10,$11,$12,$13,$14)`, fixture.namespaceID, fixture.repositoryCommit,
		fixture.requestDigest, attemptAuthorityMigrationDigest("late-spool-response"),
		attemptAuthorityMigrationDigest("late-spool-transport"),
		attemptAuthorityMigrationDigest("late-spool-envelope"),
		attemptAuthorityMigrationDigest(string(lateCiphertext)), lateCiphertext,
		len(lateCiphertext), attemptAuthorityMigrationDigest("late-spool-aad"),
		attemptAuthorityMigrationDigest("late-spool-encryption-profile"),
		attemptAuthorityMigrationDigest("late-spool-key-ref"), fixture.plannedAt,
		fixture.planExpiresAt); err == nil || !strings.Contains(err.Error(), "plan-linked") {
		t.Fatalf("plan-linked capability probe accepted a late spool insert: %v", err)
	}
	assertRuntimeFactSourcePlanRejected := func(
		label string,
		mutate func(target map[string]any, optional map[string]any),
		want string,
	) {
		t.Helper()
		var plan map[string]any
		if err := json.Unmarshal(fixture.planJSON, &plan); err != nil {
			t.Fatal(err)
		}
		value := plan["value"].(map[string]any)
		target := value["capabilityQualificationTargets"].([]any)[0].(map[string]any)
		optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
		mutate(target, optional)
		planBytes := attemptAuthorityMigrationJSON(t, plan)
		planDigest := attemptAuthorityMigrationDigest("v45-runtime-fact-source-plan-" + label)
		tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = tx.Rollback() }()
		if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_plans (
			namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
			plan_json,plan_bytes,planned_at,expires_at
		) VALUES ($1,$2,$3,$4,11640,$5::jsonb,$6,$7,$8)`, fixture.namespaceID,
			"plan.v45.runtime-fact-source."+label, planDigest, fixture.repositoryCommit,
			string(planBytes), planBytes, fixture.plannedAt, fixture.planExpiresAt); err != nil {
			t.Fatalf("stage %s runtime-fact source plan: %v", label, err)
		}
		_, err = tx.ExecContext(ctx,
			`SET CONSTRAINTS agent_evaluation_plans_runtime_fact_source_registrations_required IMMEDIATE`)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%s runtime-fact source plan error = %v, want %q", label, err, want)
		}
	}
	assertRuntimeFactSourcePlanRejected("top-level", func(target, optional map[string]any) {
		target["runtimeFactSourceAuthority"] = optional["runtimeFactSourceAuthority"]
		delete(optional, "runtimeFactSourceAuthority")
	}, "outside its optional capability authority")
	assertRuntimeFactSourcePlanRejected("fact-backed-missing", func(_ map[string]any, optional map[string]any) {
		delete(optional, "runtimeFactSourceAuthority")
	}, "presence drifted from fact-backed capability")
	assertRuntimeFactSourcePlanRejected("parallel-present", func(_ map[string]any, optional map[string]any) {
		optional["capabilityId"] = "provider.parallel-tool"
		runtimeAuthority := optional["runtimeFactSourceAuthority"].(map[string]any)
		runtimeAuthority["capabilityId"] = "provider.parallel-tool"
	}, "presence drifted from fact-backed capability")
	insertCapacityRegistration := func(index int, mutations ...func(map[string]any)) (string, error) {
		t.Helper()
		sourceAuthorityID := fmt.Sprintf("authority.runtime-fact-source.capacity.%02d", index)
		requestBase := map[string]any{
			"format":  "prodivix.agent-evaluation-runtime-fact-source-owner-registration-request",
			"version": 1, "namespaceId": fixture.namespaceID,
			"repositoryCommit":                    fixture.repositoryCommit,
			"sourceAuthorityKind":                 "shared-durable-capability",
			"sourceKind":                          "sealed-provider-response-metadata",
			"sourceAuthorityId":                   sourceAuthorityID,
			"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
			"routeBinding":                        fmt.Sprintf("runtime-fact-source.capacity.%02d", index),
			"capabilityProfileId":                 fixture.capabilityProfileID,
			"capabilityProfileDigest":             fixture.capabilityProfileDigest,
			"capabilityId":                        fixture.capabilityID, "protocolFamily": fixture.protocolFamily,
			"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
			"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
			"minimumExpiresAt": fixture.planExpiresAt.Format("2006-01-02T15:04:05.000Z"),
		}
		for _, mutate := range mutations {
			mutate(requestBase)
		}
		requestDigest := attemptAuthorityMigrationDigest(
			string(attemptAuthorityMigrationJSON(t, requestBase)),
		)
		request := attemptAuthorityMigrationCloneObject(t, requestBase)
		request["requestDigest"] = requestDigest
		requestBytes := attemptAuthorityMigrationJSON(t, request)
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_runtime_fact_source_owner_registrations (
			namespace_id,repository_commit,request_digest,source_authority_kind,source_kind,
			source_authority_id,source_authority_implementation_digest,route_binding,
			capability_profile_id,capability_profile_digest,capability_id,protocol_family,
			provider_configuration_id,model_id,model_lineage_digest,adapter_digest,
			minimum_expires_at,registration_authority_issuer_id,state,claim_generation,
			request_json,request_bytes,v45_eligible,claimed_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
			'claimed',1,$19::jsonb,$20,TRUE,$21)
		ON CONFLICT DO NOTHING`, fixture.namespaceID, fixture.repositoryCommit, requestDigest,
			requestBase["sourceAuthorityKind"], requestBase["sourceKind"],
			requestBase["sourceAuthorityId"], requestBase["sourceAuthorityImplementationDigest"],
			requestBase["routeBinding"], requestBase["capabilityProfileId"],
			requestBase["capabilityProfileDigest"], requestBase["capabilityId"],
			requestBase["protocolFamily"], requestBase["providerConfigurationId"],
			requestBase["modelId"], requestBase["modelLineageDigest"],
			requestBase["adapterDigest"], fixture.planExpiresAt, fixture.registrationAuthorityIssuerID,
			string(requestBytes), requestBytes, fixture.plannedAt.Add(-time.Minute))
		return requestDigest, err
	}
	assertRegistrationRejected := func(label string, mutate func(map[string]any)) {
		t.Helper()
		if _, err := insertCapacityRegistration(90+len(label), mutate); err == nil {
			t.Fatalf("runtime-fact source registration accepted %s identity drift", label)
		}
	}
	assertRegistrationRejected("unknown-profile", func(request map[string]any) {
		request["capabilityProfileId"] = "g4-provider-fabricated-cache"
		request["capabilityProfileDigest"] = attemptAuthorityMigrationDigest("fabricated-profile")
	})
	assertRegistrationRejected("profile-digest", func(request map[string]any) {
		request["capabilityProfileDigest"] = v45RuntimeFactSourceRegistrationProfiles[1].profileDigest
	})
	assertRegistrationRejected("profile-capability", func(request map[string]any) {
		request["capabilityId"] = "provider.isolated-cache"
	})
	assertRegistrationRejected("capability-source-kind", func(request map[string]any) {
		request["sourceKind"] = "sealed-hosted-owner-result"
	})
	var replayCapacityRequest string
	for index := 1; index <= 14; index++ {
		profile := v45RuntimeFactSourceRegistrationProfiles[index%len(v45RuntimeFactSourceRegistrationProfiles)]
		requestDigest, err := insertCapacityRegistration(index, func(request map[string]any) {
			request["capabilityProfileId"] = profile.profileID
			request["capabilityProfileDigest"] = profile.profileDigest
			request["capabilityId"] = profile.capabilityID
			request["sourceKind"] = profile.sourceKind
		})
		if err != nil {
			t.Fatalf("store runtime-fact source registration %d of 15: %v", index+1, err)
		}
		if index == 14 {
			replayCapacityRequest = requestDigest
		}
	}
	replayProfile := v45RuntimeFactSourceRegistrationProfiles[14%len(v45RuntimeFactSourceRegistrationProfiles)]
	if _, err := insertCapacityRegistration(14, func(request map[string]any) {
		request["capabilityProfileId"] = replayProfile.profileID
		request["capabilityProfileDigest"] = replayProfile.profileDigest
		request["capabilityId"] = replayProfile.capabilityID
		request["sourceKind"] = replayProfile.sourceKind
	}); err != nil {
		t.Fatalf("replay the fifteenth runtime-fact source registration: %v", err)
	}
	if replayCapacityRequest == "" {
		t.Fatal("runtime-fact source registration replay fixture was not recorded")
	}
	if _, err := insertCapacityRegistration(15); err == nil {
		t.Fatal("runtime-fact source registration accepted a sixteenth exact scope")
	}
	missingLinkPlanDigest := attemptAuthorityMigrationDigest("v45-capability-probe-missing-link-plan")
	missingTx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := missingTx.ExecContext(ctx, `INSERT INTO agent_evaluation_plans (
		namespace_id,evaluation_plan_id,plan_digest,repository_commit,planned_journey_count,
		plan_json,plan_bytes,planned_at,expires_at
	) VALUES ($1,'plan.v45.capability-probe.missing-link',$2,$3,11640,$4::jsonb,$5,$6,$7)`,
		fixture.namespaceID, missingLinkPlanDigest, fixture.repositoryCommit,
		string(fixture.planJSON), fixture.planJSON, fixture.plannedAt, fixture.planExpiresAt); err != nil {
		_ = missingTx.Rollback()
		t.Fatalf("stage missing-link probe plan: %v", err)
	}
	if err := missingTx.Commit(); err == nil {
		t.Fatal("optional capability plan committed without its sealed admission link")
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResource(t *testing.T) {
	testAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResource(t, false)
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResourceCleanup(t *testing.T) {
	testAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResource(t, true)
}

func testAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResource(
	t *testing.T,
	exerciseCleanup bool,
) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	namespaceID := "namespace.v45.provider-resource"
	repositoryCommit := strings.Repeat("6", 40)
	claimedAt := time.Date(2026, time.August, 9, 8, 0, 0, 0, time.UTC)
	dispatchedAt := claimedAt.Add(time.Second)
	registeredAt := claimedAt.Add(3 * time.Second)
	storedAt := claimedAt.Add(4 * time.Second)
	sealedAt := claimedAt.Add(5 * time.Second)
	minimumExpiresAt := claimedAt.Add(6 * 24 * time.Hour)
	expiresAt := claimedAt.Add(7 * 24 * time.Hour)
	ownerImplementationDigest := attemptAuthorityMigrationDigest("v45-provider-resource-owner")
	authorityIssuerID := "authority.provider-resource.v45"
	adapterDigest := attemptAuthorityMigrationDigest("v45-provider-resource-adapter")
	modelLineageDigest := attemptAuthorityMigrationDigest("v45-provider-resource-model")
	probeProgramDigest := attemptAuthorityMigrationDigest("v45-provider-resource-program")
	publicResourceDigest := attemptAuthorityMigrationDigest("v45-provider-resource-public")
	providerConfiguration := map[string]any{
		"providerConfigurationId": "provider.configuration.v45.resource",
		"adapter": map[string]any{
			"protocolFamily": "gemini-interactions", "adapterDigest": adapterDigest,
		},
	}
	modelLineage := map[string]any{
		"modelId": "model.v45.provider-resource", "lineageDigest": modelLineageDigest,
	}
	probeProgram := map[string]any{
		"programDigest": probeProgramDigest,
		"profileProjection": map[string]any{
			"capabilityProfileId": "g4-provider-hosted-retrieval-core",
			"capabilityId":        "provider.hosted-retrieval",
		},
		"providerRequestIntent": map[string]any{
			"publicProbeResource": map[string]any{"descriptorDigest": publicResourceDigest},
		},
	}
	requestBase := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-registration-request",
		"version": 1, "namespaceId": namespaceID, "repositoryCommit": repositoryCommit,
		"providerConfiguration": providerConfiguration, "modelLineage": modelLineage,
		"probeProgram":     probeProgram,
		"minimumExpiresAt": minimumExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	requestDigest := attemptAuthorityMigrationCanonicalDigest(t, requestBase)
	request := attemptAuthorityMigrationCloneObject(t, requestBase)
	request["requestDigest"] = requestDigest
	requestBytes := attemptAuthorityMigrationCanonicalBytes(t, request)
	providerConfigurationDigest := attemptAuthorityMigrationCanonicalDigest(t, providerConfiguration)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_probe_provider_resource_registrations (
		namespace_id,repository_commit,request_digest,state,claim_generation,
		provider_configuration_id,provider_configuration_digest,protocol_family,
		model_id,model_lineage_digest,adapter_digest,capability_profile_id,
		probe_program_digest,public_resource_descriptor_digest,minimum_expires_at,
		owner_implementation_digest,authority_issuer_id,request_json,request_bytes,
		v45_eligible,claimed_at,updated_at
	) VALUES ($1,$2,$3,'claimed',1,$4,$5,'gemini-interactions',$6,$7,$8,
		'g4-provider-hosted-retrieval-core',$9,$10,$11,$12,$13,$14::jsonb,$15,TRUE,$16,$16)`,
		namespaceID, repositoryCommit, requestDigest, providerConfiguration["providerConfigurationId"],
		providerConfigurationDigest, modelLineage["modelId"], modelLineageDigest, adapterDigest,
		probeProgramDigest, publicResourceDigest, minimumExpiresAt, ownerImplementationDigest,
		authorityIssuerID, string(requestBytes), requestBytes, claimedAt); err != nil {
		t.Fatalf("claim provider resource: %v", err)
	}
	stageDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-provider-resource-stage", "version": 1,
		"requestDigest": requestDigest, "ownerImplementationDigest": ownerImplementationDigest,
	})
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_registrations
		SET state='dispatched',stage_digest=$4,dispatched_at=$5,updated_at=$5
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		namespaceID, repositoryCommit, requestDigest, stageDigest, dispatchedAt); err != nil {
		t.Fatalf("dispatch provider resource: %v", err)
	}
	resourceID := "resource.v45.provider"
	manifestBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-provider-resource-manifest", "version": 1,
		"requestDigest": requestDigest, "probeProgramDigest": probeProgramDigest,
		"publicResourceDescriptorDigest": publicResourceDigest, "protocolFamily": "gemini-interactions",
		"providerConfigurationId": providerConfiguration["providerConfigurationId"],
		"modelId":                 modelLineage["modelId"], "modelLineageDigest": modelLineageDigest,
		"adapterDigest": adapterDigest, "providerResourceKind": "gemini-file-search-store-name",
		"providerResourceId": resourceID, "contentDigest": attemptAuthorityMigrationDigest("resource-content"),
		"documentBytesDigest": attemptAuthorityMigrationDigest("resource-document"),
		"registeredAt":        registeredAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":           expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	manifestDigest := attemptAuthorityMigrationCanonicalDigest(t, manifestBase)
	manifest := attemptAuthorityMigrationCloneObject(t, manifestBase)
	manifest["manifestDigest"] = manifestDigest
	manifestBytes := attemptAuthorityMigrationCanonicalBytes(t, manifest)
	uploadBase := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-content-upload-receipt",
		"version": 1, "requestDigest": requestDigest, "resourceManifestDigest": manifestDigest,
		"publicResourceDescriptorDigest": publicResourceDigest,
		"providerResourceKind":           "gemini-file-search-store-name", "providerResourceId": resourceID,
		"contentDigest": manifest["contentDigest"], "documentBytesDigest": manifest["documentBytesDigest"],
		"dispatchIntentDigest":   attemptAuthorityMigrationDigest("resource-upload-dispatch"),
		"transportReceiptDigest": attemptAuthorityMigrationDigest("resource-upload-transport"),
		"responseSpoolDigest":    attemptAuthorityMigrationDigest("resource-upload-spool"),
		"uploadedAt":             claimedAt.Add(2 * time.Second).Format("2006-01-02T15:04:05.000Z"),
	}
	uploadDigest := attemptAuthorityMigrationCanonicalDigest(t, uploadBase)
	upload := attemptAuthorityMigrationCloneObject(t, uploadBase)
	upload["contentUploadReceiptDigest"] = uploadDigest
	uploadBytes := attemptAuthorityMigrationCanonicalBytes(t, upload)
	deletionProjection := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-deletion-request-projection",
		"version": 1, "requestDigest": requestDigest, "protocolFamily": "gemini-interactions",
		"providerResourceKind": "gemini-file-search-store-name", "providerResourceId": resourceID,
		"auxiliaryResourceIds": []any{},
	}
	deletionProjectionDigest := attemptAuthorityMigrationCanonicalDigest(t, deletionProjection)
	deletionBase := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-deletion-authority-receipt",
		"version": 1, "requestDigest": requestDigest, "resourceManifestDigest": manifestDigest,
		"providerResourceKind": "gemini-file-search-store-name", "providerResourceId": resourceID,
		"deletionRouteBinding":            "provider-resource.delete",
		"deletionRequestProjection":       deletionProjection,
		"deletionRequestProjectionDigest": deletionProjectionDigest,
		"registeredAt":                    registeredAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                       expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	deletionDigest := attemptAuthorityMigrationCanonicalDigest(t, deletionBase)
	deletion := attemptAuthorityMigrationCloneObject(t, deletionBase)
	deletion["deletionAuthorityReceiptDigest"] = deletionDigest
	deletionBytes := attemptAuthorityMigrationCanonicalBytes(t, deletion)
	swappedProjection := attemptAuthorityMigrationCloneObject(t, deletionProjection)
	swappedProjection["auxiliaryResourceIds"] = []any{"provider-file.z", "provider-file.a"}
	swappedDeletion := attemptAuthorityMigrationCloneObject(t, deletionBase)
	swappedDeletion["deletionRequestProjection"] = swappedProjection
	swappedDeletion["deletionRequestProjectionDigest"] =
		attemptAuthorityMigrationCanonicalDigest(t, swappedProjection)
	swappedDeletionDigest := attemptAuthorityMigrationCanonicalDigest(t, swappedDeletion)
	swappedDeletion["deletionAuthorityReceiptDigest"] = swappedDeletionDigest
	swappedDeletionBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedDeletion)
	if _, err := db.ExecContext(ctx, `INSERT INTO
		agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts (
		namespace_id,repository_commit,request_digest,deletion_authority_receipt_digest,
		receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, namespaceID, repositoryCommit, requestDigest,
		swappedDeletionDigest, string(swappedDeletionBytes), swappedDeletionBytes, storedAt); err == nil {
		t.Fatal("provider resource deletion authority accepted non-canonical auxiliary resource order")
	}
	resourceAuthorityBase := map[string]any{
		"format": "prodivix.agent-capability-probe-provider-resource-authority", "version": 1,
		"capabilityProfileId": "g4-provider-hosted-retrieval-core",
		"probeProgramDigest":  probeProgramDigest, "publicResourceDescriptorDigest": publicResourceDigest,
		"protocolFamily": "gemini-interactions", "providerConfigurationId": providerConfiguration["providerConfigurationId"],
		"modelId": modelLineage["modelId"], "modelLineageDigest": modelLineageDigest,
		"adapterDigest": adapterDigest, "providerResourceKind": "gemini-file-search-store-name",
		"providerResourceId": resourceID, "resourceManifestDigest": manifestDigest,
		"contentUploadReceiptDigest": uploadDigest, "deletionAuthorityReceiptDigest": deletionDigest,
		"registeredAt": registeredAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":    expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	resourceAuthorityDigest := attemptAuthorityMigrationCanonicalDigest(t, resourceAuthorityBase)
	resourceAuthority := attemptAuthorityMigrationCloneObject(t, resourceAuthorityBase)
	resourceAuthority["authorityDigest"] = resourceAuthorityDigest
	resultBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-provider-resource-result", "version": 1,
		"requestDigest": requestDigest, "resourceManifest": manifest,
		"contentUploadReceipt": upload, "deletionAuthorityReceipt": deletion,
		"providerResourceAuthority": resourceAuthority,
	}
	resourceResultDigest := attemptAuthorityMigrationCanonicalDigest(t, resultBase)
	result := attemptAuthorityMigrationCloneObject(t, resultBase)
	result["resultDigest"] = resourceResultDigest
	resultBytes := attemptAuthorityMigrationCanonicalBytes(t, result)
	ownerAdmissionDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-provider-resource-owner-admission", "version": 1,
		"requestDigest": requestDigest, "resourceResultDigest": resourceResultDigest,
		"ownerImplementationDigest": ownerImplementationDigest, "stageDigest": stageDigest,
	})
	dispatchAckDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-provider-resource-dispatch-ack", "version": 1,
		"requestDigest": requestDigest, "resourceResultDigest": resourceResultDigest,
		"ownerAdmissionDigest": ownerAdmissionDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"stageDigest": stageDigest,
	})
	ingressDigest := attemptAuthorityMigrationDigest("provider-resource-ingress")
	ingressReceiptDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-capability-probe-provider-resource-result-ingress-receipt", "version": 1,
		"requestDigest": requestDigest, "ingressDigest": ingressDigest,
		"resourceResultDigest": resourceResultDigest, "dispatchAckDigest": dispatchAckDigest,
	})
	for _, component := range []struct {
		table, digestColumn, digest string
		value                       map[string]any
		bytes                       []byte
	}{
		{"agent_evaluation_capability_probe_provider_resource_manifests", "manifest_digest", manifestDigest, manifest, manifestBytes},
		{"agent_evaluation_capability_probe_provider_resource_content_upload_receipts", "content_upload_receipt_digest", uploadDigest, upload, uploadBytes},
		{"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts", "deletion_authority_receipt_digest", deletionDigest, deletion, deletionBytes},
	} {
		query := "INSERT INTO " + pgx.Identifier{component.table}.Sanitize() +
			" (namespace_id,repository_commit,request_digest," + component.digestColumn +
			",receipt_json,receipt_bytes,created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)"
		if _, err := db.ExecContext(ctx, query, namespaceID, repositoryCommit, requestDigest,
			component.digest, string(component.bytes), component.bytes, storedAt); err != nil {
			t.Fatalf("store provider resource component %s: %v", component.table, err)
		}
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_registrations SET
		resource_result_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,
		result_ingress_digest=$7,result_ingress_receipt_digest=$8,resource_manifest_digest=$9,
		content_upload_receipt_digest=$10,deletion_authority_receipt_digest=$11,
		provider_resource_authority_digest=$12,registered_at=$13,expires_at=$14,
		result_json=$15::jsonb,result_bytes=$16,updated_at=$17
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, namespaceID,
		repositoryCommit, requestDigest, resourceResultDigest, ownerAdmissionDigest, dispatchAckDigest,
		ingressDigest, ingressReceiptDigest, manifestDigest, uploadDigest, deletionDigest,
		resourceAuthorityDigest, registeredAt, expiresAt, string(resultBytes), resultBytes, storedAt); err != nil {
		t.Fatalf("acknowledge provider resource result: %v", err)
	}
	responseBase := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-registration-response",
		"version": 1, "requestDigest": requestDigest, "providerResourceAuthority": resourceAuthority,
		"resourceResultDigest": resourceResultDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"stageDigest": stageDigest, "dispatchAckDigest": dispatchAckDigest,
	}
	registrationReceiptDigest := attemptAuthorityMigrationCanonicalDigest(t, responseBase)
	response := attemptAuthorityMigrationCloneObject(t, responseBase)
	response["registrationReceiptDigest"] = registrationReceiptDigest
	responseBytes := attemptAuthorityMigrationCanonicalBytes(t, response)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_registrations
		SET state='sealed',registration_receipt_digest=$4,response_json=$5::jsonb,
			response_bytes=$6,sealed_at=$7,updated_at=$7
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, namespaceID,
		repositoryCommit, requestDigest, registrationReceiptDigest, string(responseBytes), responseBytes,
		sealedAt); err != nil {
		t.Fatalf("seal provider resource: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_probe_provider_resource_manifests (
		namespace_id,repository_commit,request_digest,manifest_digest,receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT DO NOTHING`, namespaceID,
		repositoryCommit, requestDigest, manifestDigest, string(manifestBytes), manifestBytes,
		sealedAt.Add(time.Second)); err != nil {
		t.Fatalf("replay exact provider resource component: %v", err)
	}
	swappedManifest := attemptAuthorityMigrationCloneObject(t, manifest)
	swappedManifest["providerResourceId"] = "resource.v45.swapped"
	swappedManifestBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedManifest)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_probe_provider_resource_manifests (
		namespace_id,repository_commit,request_digest,manifest_digest,receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT DO NOTHING`, namespaceID,
		repositoryCommit, requestDigest, manifestDigest, string(swappedManifestBytes), swappedManifestBytes,
		sealedAt.Add(time.Second)); err == nil {
		t.Fatal("provider resource component replay accepted swapped bytes")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_registrations
		SET stage_digest=$4 WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		namespaceID, repositoryCommit, requestDigest, attemptAuthorityMigrationDigest("swapped-resource-stage")); err == nil {
		t.Fatal("sealed provider resource accepted a stage fence swap")
	}
	var state string
	var storedResult, storedReceipt string
	if err := db.QueryRowContext(ctx, `SELECT state,resource_result_digest,registration_receipt_digest
		FROM agent_evaluation_capability_probe_provider_resource_registrations
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`, namespaceID,
		repositoryCommit, requestDigest).Scan(&state, &storedResult, &storedReceipt); err != nil {
		t.Fatalf("read sealed provider resource: %v", err)
	}
	if state != "sealed" || storedResult != resourceResultDigest || storedReceipt != registrationReceiptDigest {
		t.Fatalf("sealed provider resource drifted: state=%q result=%q receipt=%q", state, storedResult, storedReceipt)
	}
	if !exerciseCleanup {
		return
	}
	cleanupClaimedAt := sealedAt.Add(time.Second)
	cleanupDispatchedAt := cleanupClaimedAt.Add(time.Second)
	cleanupCompletedAt := cleanupDispatchedAt.Add(time.Second)
	cleanupStoredAt := cleanupCompletedAt.Add(time.Second)
	cleanupSealedAt := cleanupStoredAt.Add(time.Second)
	cleanupRequestBase := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-request",
		"version": 1, "repositoryCommit": repositoryCommit,
		"resourceRegistrationRequestDigest": requestDigest,
		"deletionAuthorityReceiptDigest":    deletionDigest,
	}
	cleanupRequestDigest := attemptAuthorityMigrationCanonicalDigest(t, cleanupRequestBase)
	cleanupRequest := attemptAuthorityMigrationCloneObject(t, cleanupRequestBase)
	cleanupRequest["cleanupRequestDigest"] = cleanupRequestDigest
	cleanupRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, cleanupRequest)
	if _, err := db.ExecContext(ctx, `INSERT INTO
		agent_evaluation_capability_probe_provider_resource_cleanups (
		namespace_id,repository_commit,cleanup_request_digest,resource_registration_request_digest,
		deletion_authority_receipt_digest,state,claim_generation,owner_implementation_digest,
		authority_issuer_id,request_json,request_bytes,v45_eligible,claimed_at,updated_at
	) VALUES ($1,$2,$3,$4,$5,'claimed',1,$6,$7,$8::jsonb,$9,TRUE,$10,$10)`, namespaceID,
		repositoryCommit, cleanupRequestDigest, requestDigest, deletionDigest,
		ownerImplementationDigest, authorityIssuerID, string(cleanupRequestBytes), cleanupRequestBytes,
		cleanupClaimedAt); err != nil {
		t.Fatalf("claim provider resource cleanup: %v", err)
	}
	cleanupAuthorityStageDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-stage",
		"version": 1, "cleanupRequestDigest": cleanupRequestDigest,
		"ownerImplementationDigest": ownerImplementationDigest,
	})
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_cleanups
		SET state='dispatched',stage_digest=$4,dispatched_at=$5,updated_at=$5
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`, namespaceID,
		repositoryCommit, cleanupRequestDigest, cleanupAuthorityStageDigest, cleanupDispatchedAt); err != nil {
		t.Fatalf("dispatch provider resource cleanup: %v", err)
	}
	cleanupInnerStageDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-stage",
		"version": 1, "requestDigest": requestDigest,
		"deletionAuthorityReceiptDigest":  deletionDigest,
		"deletionRequestProjectionDigest": deletionProjectionDigest,
	})
	cleanupResourceResultBase := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-resource-result",
		"version": 1, "resourceId": resourceID, "resourceRole": "primary",
		"outcome":                "already-absent",
		"dispatchIntentDigest":   attemptAuthorityMigrationDigest("provider-resource-cleanup-dispatch"),
		"transportReceiptDigest": attemptAuthorityMigrationDigest("provider-resource-cleanup-transport"),
		"completedAt":            cleanupCompletedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	cleanupResourceResultDigest := attemptAuthorityMigrationCanonicalDigest(t, cleanupResourceResultBase)
	cleanupResourceResult := attemptAuthorityMigrationCloneObject(t, cleanupResourceResultBase)
	cleanupResourceResult["resultDigest"] = cleanupResourceResultDigest
	cleanupResourceResults := []any{cleanupResourceResult}
	cleanupResourceResultSetDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"resourceResults": []any{map[string]any{
			"resourceId": resourceID, "resultDigest": cleanupResourceResultDigest,
		}},
	})
	cleanupInnerAckDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-dispatch-ack",
		"version": 1, "requestDigest": requestDigest,
		"deletionAuthorityReceiptDigest": deletionDigest,
		"cleanupStageDigest":             cleanupInnerStageDigest,
		"resourceResultSetDigest":        cleanupResourceResultSetDigest,
	})
	cleanupReceiptBase := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-receipt",
		"version": 1, "requestDigest": requestDigest,
		"deletionAuthorityReceiptDigest":  deletionDigest,
		"deletionRequestProjectionDigest": deletionProjectionDigest,
		"protocolFamily":                  "gemini-interactions", "providerResourceKind": "gemini-file-search-store-name",
		"providerResourceId": resourceID, "auxiliaryResourceIds": []any{},
		"cleanupStageDigest": cleanupInnerStageDigest, "cleanupDispatchAckDigest": cleanupInnerAckDigest,
		"resourceResults": cleanupResourceResults, "resourceResultSetDigest": cleanupResourceResultSetDigest,
		"completedAt": cleanupCompletedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	cleanupReceiptDigest := attemptAuthorityMigrationCanonicalDigest(t, cleanupReceiptBase)
	cleanupReceipt := attemptAuthorityMigrationCloneObject(t, cleanupReceiptBase)
	cleanupReceipt["cleanupReceiptDigest"] = cleanupReceiptDigest
	cleanupReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, cleanupReceipt)
	cleanupOwnerAdmissionDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-owner-admission",
		"version": 1, "cleanupRequestDigest": cleanupRequestDigest,
		"stageDigest": cleanupAuthorityStageDigest, "ownerImplementationDigest": ownerImplementationDigest,
	})
	cleanupAuthorityAckDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-dispatch-ack",
		"version": 1, "cleanupRequestDigest": cleanupRequestDigest,
		"stageDigest": cleanupAuthorityStageDigest, "ownerAdmissionDigest": cleanupOwnerAdmissionDigest,
		"cleanupReceiptDigest": cleanupReceiptDigest,
	})
	cleanupIngressDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress",
		"version": 1, "cleanupRequestDigest": cleanupRequestDigest,
		"dispatchAckDigest": cleanupAuthorityAckDigest, "cleanupReceiptDigest": cleanupReceiptDigest,
	})
	cleanupIngressReceiptDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress-receipt",
		"version": 1, "resultIngressDigest": cleanupIngressDigest,
		"cleanupReceiptDigest": cleanupReceiptDigest,
	})
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_cleanups SET
		cleanup_receipt_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,
		result_ingress_digest=$7,result_ingress_receipt_digest=$8,completed_at=$9,updated_at=$10
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`, namespaceID,
		repositoryCommit, cleanupRequestDigest, cleanupReceiptDigest, cleanupOwnerAdmissionDigest,
		cleanupAuthorityAckDigest, cleanupIngressDigest, cleanupIngressReceiptDigest,
		cleanupCompletedAt, cleanupStoredAt); err == nil {
		t.Fatal("provider resource cleanup accepted result before its durable cleanup receipt")
	}
	swappedCleanupReceipt := attemptAuthorityMigrationCloneObject(t, cleanupReceipt)
	swappedCleanupReceipt["auxiliaryResourceIds"] = []any{"provider-file.v45.swapped"}
	swappedCleanupReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedCleanupReceipt)
	if _, err := db.ExecContext(ctx, `INSERT INTO
		agent_evaluation_capability_probe_provider_resource_cleanup_receipts (
		namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest,
		receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, namespaceID, repositoryCommit,
		cleanupRequestDigest, cleanupReceiptDigest, string(swappedCleanupReceiptBytes),
		swappedCleanupReceiptBytes, cleanupStoredAt); err == nil {
		t.Fatal("provider resource cleanup accepted swapped auxiliary resource authority")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO
		agent_evaluation_capability_probe_provider_resource_cleanup_receipts (
		namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest,
		receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, namespaceID, repositoryCommit,
		cleanupRequestDigest, cleanupReceiptDigest, string(cleanupReceiptBytes), cleanupReceiptBytes,
		cleanupStoredAt); err != nil {
		t.Fatalf("store provider resource cleanup receipt: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_cleanups SET
		cleanup_receipt_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,
		result_ingress_digest=$7,result_ingress_receipt_digest=$8,completed_at=$9,updated_at=$10
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`, namespaceID,
		repositoryCommit, cleanupRequestDigest, cleanupReceiptDigest, cleanupOwnerAdmissionDigest,
		cleanupAuthorityAckDigest, cleanupIngressDigest, cleanupIngressReceiptDigest,
		cleanupCompletedAt, cleanupStoredAt); err != nil {
		t.Fatalf("acknowledge provider resource cleanup result: %v", err)
	}
	cleanupResponseBase := map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-response",
		"version": 1, "repositoryCommit": repositoryCommit,
		"resourceRegistrationRequestDigest": requestDigest, "cleanupRequestDigest": cleanupRequestDigest,
		"deletionAuthorityReceiptDigest": deletionDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"stageDigest": cleanupAuthorityStageDigest, "ownerAdmissionDigest": cleanupOwnerAdmissionDigest,
		"dispatchAckDigest": cleanupAuthorityAckDigest, "resultIngressDigest": cleanupIngressDigest,
		"resultIngressReceiptDigest": cleanupIngressReceiptDigest, "cleanupReceipt": cleanupReceipt,
	}
	cleanupResponseDigest := attemptAuthorityMigrationCanonicalDigest(t, cleanupResponseBase)
	cleanupResponse := attemptAuthorityMigrationCloneObject(t, cleanupResponseBase)
	cleanupResponse["responseDigest"] = cleanupResponseDigest
	cleanupResponseBytes := attemptAuthorityMigrationCanonicalBytes(t, cleanupResponse)
	swappedCleanupResponse := attemptAuthorityMigrationCloneObject(t, cleanupResponse)
	swappedCleanupResponse["dispatchAckDigest"] = attemptAuthorityMigrationDigest("cleanup-ack-swapped")
	swappedCleanupResponseBase := attemptAuthorityMigrationCloneObject(t, swappedCleanupResponse)
	delete(swappedCleanupResponseBase, "responseDigest")
	swappedCleanupResponseDigest := attemptAuthorityMigrationCanonicalDigest(t, swappedCleanupResponseBase)
	swappedCleanupResponse["responseDigest"] = swappedCleanupResponseDigest
	swappedCleanupResponseBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedCleanupResponse)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_cleanups
		SET state='sealed',response_digest=$4,response_json=$5::jsonb,response_bytes=$6,
			sealed_at=$7,updated_at=$7
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`, namespaceID,
		repositoryCommit, cleanupRequestDigest, swappedCleanupResponseDigest,
		string(swappedCleanupResponseBytes), swappedCleanupResponseBytes, cleanupSealedAt); err == nil {
		t.Fatal("provider resource cleanup accepted swapped response acknowledgement")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_cleanups
		SET state='sealed',response_digest=$4,response_json=$5::jsonb,response_bytes=$6,
			sealed_at=$7,updated_at=$7
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`, namespaceID,
		repositoryCommit, cleanupRequestDigest, cleanupResponseDigest,
		string(cleanupResponseBytes), cleanupResponseBytes, cleanupSealedAt); err != nil {
		t.Fatalf("seal provider resource cleanup: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO
		agent_evaluation_capability_probe_provider_resource_cleanup_receipts (
		namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest,
		receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT DO NOTHING`, namespaceID,
		repositoryCommit, cleanupRequestDigest, cleanupReceiptDigest, string(cleanupReceiptBytes),
		cleanupReceiptBytes, cleanupSealedAt.Add(time.Second)); err != nil {
		t.Fatalf("replay exact provider resource cleanup receipt: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_capability_probe_provider_resource_cleanups
		SET stage_digest=$4 WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`,
		namespaceID, repositoryCommit, cleanupRequestDigest,
		attemptAuthorityMigrationDigest("late-cleanup-stage-swap")); err == nil {
		t.Fatal("sealed provider resource cleanup accepted late stage mutation")
	}
	var cleanupState, storedCleanupReceipt, storedCleanupResponse string
	if err := db.QueryRowContext(ctx, `SELECT state,cleanup_receipt_digest,response_digest
		FROM agent_evaluation_capability_probe_provider_resource_cleanups
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`, namespaceID,
		repositoryCommit, cleanupRequestDigest).Scan(&cleanupState, &storedCleanupReceipt,
		&storedCleanupResponse); err != nil {
		t.Fatalf("read sealed provider resource cleanup: %v", err)
	}
	if cleanupState != "sealed" || storedCleanupReceipt != cleanupReceiptDigest ||
		storedCleanupResponse != cleanupResponseDigest {
		t.Fatalf("sealed provider resource cleanup drifted: state=%q receipt=%q response=%q",
			cleanupState, storedCleanupReceipt, storedCleanupResponse)
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLNativeOptionalBootstrapSource(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	fixture := seedSealedV45CapabilityProbeAdmission(t, db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	attemptID := "attempt.v45.native-bootstrap"
	descriptorDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-descriptor")
	invocationID := "invocation.v45.native-bootstrap"
	providerRequestDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-request")
	providerResponseDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-response")
	dispatchIntentDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-dispatch")
	transportReceiptDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-transport")
	resultSpoolReceiptDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-spool")
	normalizedEventSetDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-events")
	rawStartedAt := time.Now().UTC().Truncate(time.Millisecond).Add(-10 * time.Second)
	rawCompletedAt := rawStartedAt.Add(time.Second)
	observedAt := rawCompletedAt.Add(500 * time.Millisecond)
	bootstrapSealedAt := rawCompletedAt.Add(time.Second)
	outerSealedAt := bootstrapSealedAt.Add(time.Second)
	descriptor := map[string]any{
		"attemptId": attemptID, "descriptorDigest": descriptorDigest,
		"targetId": fixture.targetID, "targetDigest": fixture.targetDigest,
		"capabilityDescriptorDigest": fixture.capabilityDescriptorDigest,
	}
	descriptorBytes := attemptAuthorityMigrationCanonicalBytes(t, descriptor)
	demandDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-demand")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_budget_reservations (
		namespace_id,plan_digest,reservation_id,ledger_revision,demand_digest,demand_json,demand_bytes,reserved_at
	) VALUES ($1,$2,'reservation.v45.native-bootstrap',0,$3,'{}'::jsonb,$4,$5)`, fixture.namespaceID,
		fixture.planDigest, demandDigest, []byte(`{}`), rawStartedAt); err != nil {
		t.Fatalf("store native bootstrap budget reservation: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_transport_dispatch_intents (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,descriptor_json,
		descriptor_bytes,turn_index,budget_reservation_id,intent_id,invocation_id,protocol_family,
		provider_configuration_id,model_lineage_digest,inference_configuration_digest,demand_digest,
		request_digest,endpoint_id,endpoint_class,request_body_digest,request_bytes,intent_digest,
		intent_json,intent_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,0,'reservation.v45.native-bootstrap',
		'intent.v45.native-bootstrap',$8,$9,$10,$11,$12,$13,$14,
		'endpoint.v45.native-bootstrap','first-party-hosted',$14,1,$15,'{}'::jsonb,$16,$17)`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, attemptID, descriptorDigest,
		string(descriptorBytes), descriptorBytes, invocationID, fixture.protocolFamily,
		fixture.providerConfigurationID, fixture.modelLineageDigest,
		attemptAuthorityMigrationDigest("v45-native-bootstrap-inference"), demandDigest,
		providerRequestDigest, dispatchIntentDigest, []byte(`{}`), rawStartedAt); err != nil {
		t.Fatalf("store native bootstrap dispatch intent: %v", err)
	}
	responseBodyDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-response-body")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_transport_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,
		intent_digest,receipt_id,invocation_id,provider_configuration_id,provider_request_id,
		dispatch_state,outcome,response_body_digest,receipt_digest,receipt_json,receipt_bytes,
		started_at,completed_at,closed_at
	) VALUES ($1,$2,$3,$4,$5,0,$6,'transport.v45.native-bootstrap',$7,$8,NULL,
		'dispatched','completed',$9,$10,'{}'::jsonb,$11,$12,$13,$13)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, attemptID, descriptorDigest, dispatchIntentDigest,
		invocationID, fixture.providerConfigurationID, responseBodyDigest, transportReceiptDigest,
		[]byte(`{}`), rawStartedAt, rawCompletedAt); err != nil {
		t.Fatalf("store native bootstrap transport receipt: %v", err)
	}
	aad := map[string]any{
		"format": "prodivix.agent-evaluation-provider-result-spool-aad", "version": 1,
		"namespaceDigest": attemptAuthorityMigrationDigest(fixture.namespaceID),
		"planDigest":      fixture.planDigest, "repositoryCommit": fixture.repositoryCommit,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": 0,
		"invocationId": invocationID, "dispatchIntentDigest": dispatchIntentDigest,
		"transportReceiptDigest": transportReceiptDigest, "responseBodyDigest": responseBodyDigest,
		"normalizedEventSetDigest": normalizedEventSetDigest,
	}
	aadBytes := attemptAuthorityMigrationCanonicalBytes(t, aad)
	aadDigest := attemptAuthorityMigrationCanonicalDigest(t, aad)
	nonce := bytes.Repeat([]byte{1}, 12)
	tag := bytes.Repeat([]byte{2}, 16)
	ciphertext := []byte("sealed-native-bootstrap-ciphertext")
	ciphertextDigest := attemptAuthorityMigrationDigest(string(ciphertext))
	keyRefDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-key-ref")
	encryptionProfileDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-encryption")
	envelopeBase := map[string]any{
		"algorithm": "aes-256-gcm", "keyId": "key.v45.native-bootstrap", "keyVersion": 1,
		"keyRefDigest": keyRefDigest, "encryptionProfileDigest": encryptionProfileDigest,
		"nonceBase64Url":             base64.RawURLEncoding.EncodeToString(nonce),
		"authenticationTagBase64Url": base64.RawURLEncoding.EncodeToString(tag),
		"ciphertextDigest":           ciphertextDigest, "ciphertextSizeBytes": len(ciphertext),
		"aadDigest": aadDigest,
	}
	envelopeDigest := attemptAuthorityMigrationCanonicalDigest(t, envelopeBase)
	envelope := attemptAuthorityMigrationCloneObject(t, envelopeBase)
	envelope["format"] = "prodivix.agent-evaluation-provider-result-spool-envelope"
	envelope["version"] = 1
	envelope["spoolId"] = "spool.v45.native-bootstrap"
	envelope["ciphertextBase64Url"] = base64.RawURLEncoding.EncodeToString(ciphertext)
	envelope["envelopeDigest"] = envelopeDigest
	envelopeBytes := attemptAuthorityMigrationCanonicalBytes(t, envelope)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_result_spool_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,
		invocation_id,spool_ref,dispatch_intent_digest,transport_receipt_digest,algorithm,
		encryption_profile_digest,key_ref_digest,key_id,key_version,aad_digest,envelope_digest,
		ciphertext_digest,ciphertext_size_bytes,response_body_digest,normalized_event_set_digest,
		response_digest,opaque_continuation_digest,retention_class,retention_policy_digest,
		receipt_digest,receipt_json,receipt_bytes,created_at,expires_at
	) VALUES ($1,$2,$3,$4,$5,0,$6,'spool.v45.native-bootstrap',$7,$8,'aes-256-gcm',
		$9,$10,'key.v45.native-bootstrap',1,$11,$12,$13,$14,$15,$16,$17,NULL,
		'attempt-resume-only',$18,$19,'{}'::jsonb,$20,$21,$22)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, attemptID, descriptorDigest, invocationID,
		dispatchIntentDigest, transportReceiptDigest, encryptionProfileDigest, keyRefDigest,
		aadDigest, envelopeDigest, ciphertextDigest, len(ciphertext), responseBodyDigest,
		normalizedEventSetDigest, providerResponseDigest,
		attemptAuthorityMigrationDigest("v45-native-bootstrap-retention"), resultSpoolReceiptDigest,
		[]byte(`{}`), rawCompletedAt, fixture.planExpiresAt); err != nil {
		t.Fatalf("store native bootstrap spool receipt: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_result_spool_payloads (
		namespace_id,plan_digest,repository_commit,attempt_id,turn_index,spool_ref,key_id,key_version,
		nonce_bytes,authentication_tag_bytes,ciphertext_bytes,ciphertext_digest,ciphertext_size_bytes,
		aad_json,aad_bytes,envelope_json,envelope_bytes,envelope_digest,created_at,expires_at
	) VALUES ($1,$2,$3,$4,0,'spool.v45.native-bootstrap','key.v45.native-bootstrap',1,
		$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13,$14,$15,$16)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, attemptID, nonce, tag, ciphertext, ciphertextDigest,
		len(ciphertext), string(aadBytes), aadBytes, string(envelopeBytes), envelopeBytes,
		envelopeDigest, rawCompletedAt, fixture.planExpiresAt); err != nil {
		t.Fatalf("store native bootstrap encrypted spool payload: %v", err)
	}
	var plan map[string]any
	if err := json.Unmarshal(fixture.planJSON, &plan); err != nil {
		t.Fatal(err)
	}
	target := plan["value"].(map[string]any)["capabilityQualificationTargets"].([]any)[0].(map[string]any)
	optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
	runtimeAuthority := optional["runtimeFactSourceAuthority"].(map[string]any)
	probeEvidence := optional["probeEvidence"].(map[string]any)
	probeProgram := probeEvidence["probeProgram"].(map[string]any)
	probeProgramDigest := probeProgram["programDigest"].(string)
	stateVaultAuthority := attemptAuthorityMigrationStateVaultAuthority(t)
	seedAttemptAuthorityMigrationStateVaultRunConfig(
		t, db, fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit,
		fixture.plannedAt, stateVaultAuthority,
	)
	stateVault := newAttemptAuthorityMigrationStateVaultSeal(
		t, fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit,
		"vault.owner.native-bootstrap", stateVaultAuthority, "background-job-state",
		attemptID, invocationID, "task.v45.native-bootstrap", "run.v45.native-bootstrap", 1,
		fixture.protocolFamily, "response-id", "response.v45.native-bootstrap",
		probeProgramDigest, fixture.capabilityProfileDigest, providerRequestDigest,
		providerResponseDigest, responseBodyDigest,
		attemptAuthorityMigrationDigest("v45-native-bootstrap-sealed-response-json"),
		fixture.providerConfigurationID, fixture.modelLineageDigest, fixture.adapterDigest,
		rawCompletedAt, rawCompletedAt.Add(250*time.Millisecond),
	)
	if err := insertAttemptAuthorityMigrationStateVaultSeal(
		db, fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit,
		stateVault, stateVault.sealRequestBytes, stateVault.authorityDigest, stateVault.expiresAt,
	); err != nil {
		t.Fatalf("store native bootstrap state-vault seal: %v", err)
	}
	providerStateReferenceDigest := stateVault.providerStateReferenceDigest
	nativeSource := map[string]any{
		"sourceKind":                   "provider-job-active-status",
		"providerStateReferenceDigest": providerStateReferenceDigest,
		"opaqueProviderStateRef":       stateVault.opaqueProviderStateRef,
		"stateVaultAuthorityDigest":    stateVault.authorityDigest,
		"stateVaultSealRequestDigest":  stateVault.sealRequestDigest,
		"stateVaultSealReceiptDigest":  stateVault.sealReceiptDigest,
		"taskId":                       "task.v45.native-bootstrap",
		"runId":                        "run.v45.native-bootstrap",
		"generation":                   1,
		"providerStatus":               "in-progress",
	}
	nativeProviderSourceDigest := attemptAuthorityMigrationCanonicalDigest(t, nativeSource)
	executionIdentityBase := map[string]any{
		"format": "prodivix.agent-native-provider-execution-identity-authority", "version": 1,
		"invocationId": invocationID, "taskId": nativeSource["taskId"], "runId": nativeSource["runId"],
		"generation": nativeSource["generation"],
	}
	executionIdentityDigest := attemptAuthorityMigrationCanonicalDigest(t, executionIdentityBase)
	executionIdentity := attemptAuthorityMigrationCloneObject(t, executionIdentityBase)
	executionIdentity["authorityDigest"] = executionIdentityDigest
	factValueBase := map[string]any{
		"providerJobId": "provider-job." + strings.TrimPrefix(providerStateReferenceDigest, "sha256-"),
		"taskId":        nativeSource["taskId"], "runId": nativeSource["runId"],
		"generation": 1, "invocationId": invocationID, "phase": "running",
		"callbackAuthority": "active",
	}
	factDigest := attemptAuthorityMigrationCanonicalDigest(t, factValueBase)
	factValue := attemptAuthorityMigrationCloneObject(t, factValueBase)
	factValue["receiptDigest"] = factDigest
	nativeReceiptFact := map[string]any{"factType": "provider-job-receipt", "value": factValue}
	nativeReceiptBase := map[string]any{
		"format": "prodivix.agent-native-provider-optional-capability-source-receipt", "version": 1,
		"protocolFamily": fixture.protocolFamily, "capabilityProfileId": fixture.capabilityProfileID,
		"capabilityProfileDigest": fixture.capabilityProfileDigest, "invocationId": invocationID,
		"requestDigest": providerRequestDigest, "responseDigest": providerResponseDigest,
		"providerConfigurationId": fixture.providerConfigurationID,
		"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"executionIdentityAuthority": executionIdentity,
		"source":                     nativeSource, "sourceDigest": nativeProviderSourceDigest, "fact": nativeReceiptFact,
		"observedAt": observedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	nativeProviderSourceReceiptDigest := attemptAuthorityMigrationCanonicalDigest(t, nativeReceiptBase)
	nativeProviderSourceReceipt := attemptAuthorityMigrationCloneObject(t, nativeReceiptBase)
	nativeProviderSourceReceipt["receiptDigest"] = nativeProviderSourceReceiptDigest
	nativeProviderSourceReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, nativeProviderSourceReceipt)
	fact := map[string]any{
		"factKind": "provider-job-receipt", "factDigest": factDigest, "value": factValue,
	}
	factBytes := attemptAuthorityMigrationCanonicalBytes(t, fact)
	ingressBase := map[string]any{
		"format": "prodivix.agent-evaluation-native-optional-capability-bootstrap-close-ingress", "version": 1,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": 0,
		"invocationId": invocationID, "providerRequestDigest": providerRequestDigest,
		"providerResponseDigest": providerResponseDigest, "dispatchIntentDigest": dispatchIntentDigest,
		"transportReceiptDigest": transportReceiptDigest, "resultSpoolAADigest": aadDigest,
		"resultSpoolEnvelopeDigest": envelopeDigest, "normalizedEventSetDigest": normalizedEventSetDigest,
		"outcome": "observed", "nativeSourceReceipt": nativeProviderSourceReceipt,
	}
	ingressDigest := attemptAuthorityMigrationCanonicalDigest(t, ingressBase)
	ingress := attemptAuthorityMigrationCloneObject(t, ingressBase)
	ingress["ingressDigest"] = ingressDigest
	ingressBytes := attemptAuthorityMigrationCanonicalBytes(t, ingress)
	sourceRequestBase := map[string]any{
		"format": "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-request", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": descriptorDigest, "turnIndex": 0, "invocationId": invocationID,
		"providerRequestDigest": providerRequestDigest, "providerResponseDigest": providerResponseDigest,
		"protocolFamily": fixture.protocolFamily, "providerConfigurationId": fixture.providerConfigurationID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"dispatchIntentDigest": dispatchIntentDigest, "transportReceiptDigest": transportReceiptDigest,
		"resultSpoolReceiptDigest":   resultSpoolReceiptDigest,
		"normalizedEventSetDigest":   normalizedEventSetDigest,
		"transportCompletedAt":       rawCompletedAt.Format("2006-01-02T15:04:05.000Z"),
		"runtimeFactSourceAuthority": runtimeAuthority, "probeProgramDigest": probeProgramDigest,
		"outcome": "observed", "nativeSourceReceipt": nativeProviderSourceReceipt,
		"nativeSourceReceiptDigest": nativeProviderSourceReceiptDigest,
		"fact":                      fact, "observedAt": observedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	sourceRequestDigest := attemptAuthorityMigrationCanonicalDigest(t, sourceRequestBase)
	sourceRequest := attemptAuthorityMigrationCloneObject(t, sourceRequestBase)
	sourceRequest["requestDigest"] = sourceRequestDigest
	sourceRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, sourceRequest)
	sourceOwnerStageDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-stage", "version": 1,
		"sourceRequestDigest": sourceRequestDigest, "sourceAuthorityId": fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"runtimeFactSourceAuthorityDigest":    fixture.runtimeFactSourceAuthorityDigest,
	})
	sourceOwnerAckDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-dispatch-ack", "version": 1,
		"sourceRequestDigest": sourceRequestDigest, "sourceOwnerStageDigest": sourceOwnerStageDigest,
		"outcome": "observed", "nativeSourceReceiptDigest": nativeProviderSourceReceiptDigest,
		"factDigest": factDigest,
		"sealedAt":   bootstrapSealedAt.Format("2006-01-02T15:04:05.000Z"),
	})
	sourceReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-receipt", "version": 1,
		"sourceRequest": sourceRequest, "sourceRequestDigest": sourceRequestDigest,
		"sourceOwnerStageDigest":       sourceOwnerStageDigest,
		"sourceOwnerDispatchAckDigest": sourceOwnerAckDigest,
		"sealedAt":                     bootstrapSealedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	sourceReceiptDigest := attemptAuthorityMigrationCanonicalDigest(t, sourceReceiptBase)
	sourceReceipt := attemptAuthorityMigrationCloneObject(t, sourceReceiptBase)
	sourceReceipt["receiptDigest"] = sourceReceiptDigest
	sourceReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, sourceReceipt)
	optionalAuthorityRequest := map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-authority-request", "version": 1,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "targetId": fixture.targetID,
		"targetDigest": fixture.targetDigest, "capabilityProfileId": fixture.capabilityProfileID,
		"capabilityProfileDigest":    fixture.capabilityProfileDigest,
		"capabilityDescriptorDigest": fixture.capabilityDescriptorDigest, "capabilityId": fixture.capabilityID,
		"supportExpectation": "required", "turnIndex": 0, "invocationId": invocationID,
		"protocolFamily": fixture.protocolFamily, "providerConfigurationId": fixture.providerConfigurationID,
		"modelId": fixture.modelID, "modelLineageDigest": fixture.modelLineageDigest,
		"adapterDigest": fixture.adapterDigest, "providerRequestDigest": providerRequestDigest,
		"responseDigest": providerResponseDigest, "dispatchIntentDigest": dispatchIntentDigest,
		"transportReceiptDigest": transportReceiptDigest, "resultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"normalizedEventSetDigest": normalizedEventSetDigest,
		"source": map[string]any{
			"kind":                               "sealed-provider-response-metadata",
			"nativeBootstrapSourceRequestDigest": sourceRequestDigest,
		},
	}
	optionalAuthorityRequestDigest := attemptAuthorityMigrationCanonicalDigest(t, optionalAuthorityRequest)
	optionalAuthorityRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, optionalAuthorityRequest)
	bootstrapInsert := `INSERT INTO agent_evaluation_native_optional_capability_bootstrap_sources (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,target_digest,
		capability_profile_id,capability_profile_digest,capability_descriptor_digest,capability_id,
		support_expectation,turn_index,invocation_id,protocol_family,provider_configuration_id,model_id,
		model_lineage_digest,adapter_digest,provider_request_digest,provider_response_digest,
		dispatch_intent_digest,transport_receipt_digest,result_spool_receipt_digest,result_spool_aad_digest,
		result_spool_envelope_digest,normalized_event_set_digest,source_authority_id,
		source_authority_implementation_digest,source_authority_route_binding,registration_authority_issuer_id,
		registration_receipt_digest,runtime_fact_source_authority_digest,probe_program_digest,outcome,
		native_provider_source_receipt_digest,native_provider_source_digest,fact_kind,fact_digest,
		ingress_digest,ingress_json,ingress_bytes,native_provider_source_receipt_json,
		native_provider_source_receipt_bytes,fact_json,fact_bytes,source_request_digest,source_request_json,
		source_request_bytes,source_owner_stage_digest,source_owner_dispatch_ack_digest,source_receipt_digest,
		source_receipt_json,source_receipt_bytes,optional_authority_request_digest,
		optional_authority_request_json,optional_authority_request_bytes,observed_at,sealed_at,v45_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'required',0,$12,$13,$14,$15,$16,$17,$18,
		$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,'observed',$33,$34,
		'provider-job-receipt',$35,$36,$37::jsonb,$38,$39::jsonb,$40,$41::jsonb,$42,
		$43,$44::jsonb,$45,$46,$47,$48,$49::jsonb,$50,$51,$52::jsonb,$53,$54,$55,TRUE)`
	bootstrapArgs := []any{fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit,
		attemptID, descriptorDigest, fixture.targetID, fixture.targetDigest, fixture.capabilityProfileID,
		fixture.capabilityProfileDigest, fixture.capabilityDescriptorDigest, fixture.capabilityID,
		invocationID, fixture.protocolFamily, fixture.providerConfigurationID, fixture.modelID,
		fixture.modelLineageDigest, fixture.adapterDigest, providerRequestDigest, providerResponseDigest,
		dispatchIntentDigest, transportReceiptDigest, resultSpoolReceiptDigest, aadDigest, envelopeDigest,
		normalizedEventSetDigest, fixture.runtimeSourceAuthorityID, fixture.ownerImplementationDigest,
		fixture.runtimeSourceRouteBinding, fixture.registrationAuthorityIssuerID,
		fixture.registrationReceiptDigest, fixture.runtimeFactSourceAuthorityDigest, probeProgramDigest,
		nativeProviderSourceReceiptDigest, nativeProviderSourceDigest, factDigest,
		ingressDigest, string(ingressBytes), ingressBytes,
		string(nativeProviderSourceReceiptBytes), nativeProviderSourceReceiptBytes,
		string(factBytes), factBytes, sourceRequestDigest, string(sourceRequestBytes), sourceRequestBytes,
		sourceOwnerStageDigest, sourceOwnerAckDigest, sourceReceiptDigest,
		string(sourceReceiptBytes), sourceReceiptBytes, optionalAuthorityRequestDigest,
		string(optionalAuthorityRequestBytes), optionalAuthorityRequestBytes, observedAt,
		bootstrapSealedAt}
	for _, negative := range []struct {
		name  string
		index int
		value any
	}{
		{"native receipt digest", 32, attemptAuthorityMigrationDigest("swapped-native-receipt")},
		{"native source digest", 33, attemptAuthorityMigrationDigest("swapped-native-source")},
		{"derived fact digest", 34, attemptAuthorityMigrationDigest("swapped-native-fact")},
		{"raw provider response", 18, attemptAuthorityMigrationDigest("swapped-native-response")},
		{"provider configuration", 13, "provider.configuration.v45.swapped"},
		{"capability profile digest", 8, attemptAuthorityMigrationDigest("swapped-native-profile")},
		{"model lineage", 15, attemptAuthorityMigrationDigest("swapped-native-model")},
		{"adapter", 16, attemptAuthorityMigrationDigest("swapped-native-adapter")},
		{"observed time", 53, rawCompletedAt.Add(-time.Millisecond)},
	} {
		args := append([]any(nil), bootstrapArgs...)
		args[negative.index] = negative.value
		if _, err := db.ExecContext(ctx, bootstrapInsert, args...); err == nil {
			t.Fatalf("typed native bootstrap accepted swapped %s", negative.name)
		}
	}
	swappedIdentityBase := attemptAuthorityMigrationCloneObject(t, executionIdentityBase)
	swappedIdentityBase["taskId"] = "task.v45.native-bootstrap-swapped"
	swappedIdentity := attemptAuthorityMigrationCloneObject(t, swappedIdentityBase)
	swappedIdentity["authorityDigest"] =
		attemptAuthorityMigrationCanonicalDigest(t, swappedIdentityBase)
	swappedNativeReceiptBase := attemptAuthorityMigrationCloneObject(t, nativeReceiptBase)
	swappedNativeReceiptBase["executionIdentityAuthority"] = swappedIdentity
	swappedNativeReceiptDigest :=
		attemptAuthorityMigrationCanonicalDigest(t, swappedNativeReceiptBase)
	swappedNativeReceipt := attemptAuthorityMigrationCloneObject(t, swappedNativeReceiptBase)
	swappedNativeReceipt["receiptDigest"] = swappedNativeReceiptDigest
	swappedNativeReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedNativeReceipt)
	swappedIngressBase := attemptAuthorityMigrationCloneObject(t, ingressBase)
	swappedIngressBase["nativeSourceReceipt"] = swappedNativeReceipt
	swappedIngressDigest := attemptAuthorityMigrationCanonicalDigest(t, swappedIngressBase)
	swappedIngress := attemptAuthorityMigrationCloneObject(t, swappedIngressBase)
	swappedIngress["ingressDigest"] = swappedIngressDigest
	swappedIngressBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedIngress)
	swappedSourceRequestBase := attemptAuthorityMigrationCloneObject(t, sourceRequestBase)
	swappedSourceRequestBase["nativeSourceReceipt"] = swappedNativeReceipt
	swappedSourceRequestBase["nativeSourceReceiptDigest"] = swappedNativeReceiptDigest
	swappedSourceRequestDigest :=
		attemptAuthorityMigrationCanonicalDigest(t, swappedSourceRequestBase)
	swappedSourceRequest := attemptAuthorityMigrationCloneObject(t, swappedSourceRequestBase)
	swappedSourceRequest["requestDigest"] = swappedSourceRequestDigest
	swappedSourceRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedSourceRequest)
	swappedSourceOwnerStageDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-stage", "version": 1,
		"sourceRequestDigest":                 swappedSourceRequestDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"runtimeFactSourceAuthorityDigest":    fixture.runtimeFactSourceAuthorityDigest,
	})
	swappedSourceOwnerAckDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-native-optional-capability-bootstrap-source-dispatch-ack", "version": 1,
		"sourceRequestDigest":    swappedSourceRequestDigest,
		"sourceOwnerStageDigest": swappedSourceOwnerStageDigest,
		"outcome":                "observed", "nativeSourceReceiptDigest": swappedNativeReceiptDigest,
		"factDigest": factDigest,
		"sealedAt":   bootstrapSealedAt.Format("2006-01-02T15:04:05.000Z"),
	})
	swappedSourceReceiptBase := attemptAuthorityMigrationCloneObject(t, sourceReceiptBase)
	swappedSourceReceiptBase["sourceRequest"] = swappedSourceRequest
	swappedSourceReceiptBase["sourceRequestDigest"] = swappedSourceRequestDigest
	swappedSourceReceiptBase["sourceOwnerStageDigest"] = swappedSourceOwnerStageDigest
	swappedSourceReceiptBase["sourceOwnerDispatchAckDigest"] = swappedSourceOwnerAckDigest
	swappedSourceReceiptDigest :=
		attemptAuthorityMigrationCanonicalDigest(t, swappedSourceReceiptBase)
	swappedSourceReceipt := attemptAuthorityMigrationCloneObject(t, swappedSourceReceiptBase)
	swappedSourceReceipt["receiptDigest"] = swappedSourceReceiptDigest
	swappedSourceReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, swappedSourceReceipt)
	swappedOptionalAuthorityRequest :=
		attemptAuthorityMigrationCloneObject(t, optionalAuthorityRequest)
	swappedOptionalAuthorityRequest["source"].(map[string]any)["nativeBootstrapSourceRequestDigest"] = swappedSourceRequestDigest
	swappedOptionalAuthorityRequestDigest :=
		attemptAuthorityMigrationCanonicalDigest(t, swappedOptionalAuthorityRequest)
	swappedOptionalAuthorityRequestBytes :=
		attemptAuthorityMigrationCanonicalBytes(t, swappedOptionalAuthorityRequest)
	swappedIdentityArgs := append([]any(nil), bootstrapArgs...)
	swappedIdentityArgs[32] = swappedNativeReceiptDigest
	swappedIdentityArgs[35] = swappedIngressDigest
	swappedIdentityArgs[36] = string(swappedIngressBytes)
	swappedIdentityArgs[37] = swappedIngressBytes
	swappedIdentityArgs[38] = string(swappedNativeReceiptBytes)
	swappedIdentityArgs[39] = swappedNativeReceiptBytes
	swappedIdentityArgs[42] = swappedSourceRequestDigest
	swappedIdentityArgs[43] = string(swappedSourceRequestBytes)
	swappedIdentityArgs[44] = swappedSourceRequestBytes
	swappedIdentityArgs[45] = swappedSourceOwnerStageDigest
	swappedIdentityArgs[46] = swappedSourceOwnerAckDigest
	swappedIdentityArgs[47] = swappedSourceReceiptDigest
	swappedIdentityArgs[48] = string(swappedSourceReceiptBytes)
	swappedIdentityArgs[49] = swappedSourceReceiptBytes
	swappedIdentityArgs[50] = swappedOptionalAuthorityRequestDigest
	swappedIdentityArgs[51] = string(swappedOptionalAuthorityRequestBytes)
	swappedIdentityArgs[52] = swappedOptionalAuthorityRequestBytes
	if _, err := db.ExecContext(ctx, bootstrapInsert, swappedIdentityArgs...); err == nil {
		t.Fatal("typed native bootstrap accepted a recomputed execution identity/source swap")
	}
	if _, err := db.ExecContext(ctx, bootstrapInsert, bootstrapArgs...); err != nil {
		t.Fatalf("store typed native optional bootstrap source: %v", err)
	}
	outerSourceBase := map[string]any{
		"kind": "sealed-provider-response-metadata", "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": descriptorDigest, "turnIndex": 0, "invocationId": invocationID,
		"providerRequestDigest": providerRequestDigest, "responseDigest": providerResponseDigest,
		"dispatchIntentDigest": dispatchIntentDigest, "transportReceiptDigest": transportReceiptDigest,
		"resultSpoolReceiptDigest":           resultSpoolReceiptDigest,
		"normalizedEventSetDigest":           normalizedEventSetDigest,
		"nativeBootstrapSourceRequestDigest": sourceRequestDigest,
		"nativeBootstrapSourceReceiptDigest": sourceReceiptDigest,
		"ownerStageDigest":                   sourceOwnerStageDigest, "ownerDispatchAckDigest": sourceOwnerAckDigest,
		"nativeProviderSourceReceiptDigest": nativeProviderSourceReceiptDigest,
		"nativeProviderSourceDigest":        nativeProviderSourceDigest,
		"nativeProviderSourceFactDigest":    factDigest, "outcome": "observed",
	}
	outerSourceDigest := attemptAuthorityMigrationCanonicalDigest(t, outerSourceBase)
	outerReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": descriptorDigest, "targetId": fixture.targetID,
		"targetDigest": fixture.targetDigest, "capabilityProfileId": fixture.capabilityProfileID,
		"capabilityProfileDigest":    fixture.capabilityProfileDigest,
		"capabilityDescriptorDigest": fixture.capabilityDescriptorDigest, "capabilityId": fixture.capabilityID,
		"supportExpectation": "required", "turnIndex": 0, "invocationId": invocationID,
		"protocolFamily": fixture.protocolFamily, "providerConfigurationId": fixture.providerConfigurationID,
		"modelId": fixture.modelID, "modelLineageDigest": fixture.modelLineageDigest,
		"adapterDigest": fixture.adapterDigest, "providerRequestDigest": providerRequestDigest,
		"responseDigest": providerResponseDigest, "dispatchIntentDigest": dispatchIntentDigest,
		"transportReceiptDigest": transportReceiptDigest, "resultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"normalizedEventSetDigest":            normalizedEventSetDigest,
		"targetAuthorityDigest":               fixture.runtimeFactSourceAuthorityDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceAuthorityRouteBinding":         fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"sourceKind":                          "sealed-provider-response-metadata", "sourceDigest": outerSourceDigest,
		"sourceRequestDigest": optionalAuthorityRequestDigest,
		"ownerStageDigest":    sourceOwnerStageDigest, "ownerDispatchAckDigest": sourceOwnerAckDigest,
		"nativeBootstrapSourceRequestDigest": sourceRequestDigest,
		"nativeBootstrapSourceReceiptDigest": sourceReceiptDigest,
		"nativeProviderSourceReceiptDigest":  nativeProviderSourceReceiptDigest,
		"nativeProviderSourceDigest":         nativeProviderSourceDigest,
		"nativeProviderSourceFactDigest":     factDigest, "outcome": "observed",
		"fact":       fact,
		"observedAt": observedAt.Format("2006-01-02T15:04:05.000Z"),
		"sealedAt":   outerSealedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	outerSourceSealDigest := attemptAuthorityMigrationCanonicalDigest(t, outerReceiptBase)
	outerReceipt := attemptAuthorityMigrationCloneObject(t, outerReceiptBase)
	outerReceipt["sourceSealDigest"] = outerSourceSealDigest
	outerReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, outerReceipt)
	insertOuterSource := `INSERT INTO agent_evaluation_optional_capability_fact_sources (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,target_digest,
		capability_profile_id,capability_profile_digest,capability_descriptor_digest,capability_id,
		support_expectation,turn_index,invocation_id,protocol_family,provider_configuration_id,model_id,
		model_lineage_digest,adapter_digest,provider_request_digest,response_digest,dispatch_intent_digest,
		transport_receipt_digest,result_spool_receipt_digest,normalized_event_set_digest,source_request_digest,
		target_authority_digest,source_authority_id,source_authority_implementation_digest,
		source_authority_route_binding,registration_authority_issuer_id,registration_receipt_digest,
		source_kind,source_digest,native_bootstrap_source_request_digest,native_bootstrap_source_receipt_digest,
		native_provider_source_receipt_digest,native_provider_source_digest,source_owner_request_digest,
		source_owner_receipt_digest,source_owner_stage_digest,source_owner_dispatch_ack_digest,
		source_pre_effect_intent_digest,source_pre_effect_intent_json,source_pre_effect_intent_bytes,
		source_effect_receipt_digest,source_effect_receipt_json,source_effect_receipt_bytes,
		source_effect_fact_digest,source_business_result_digest,fact_kind,fact_digest,fact_json,fact_bytes,
		source_seal_digest,source_receipt_json,source_receipt_bytes,sealed_at,v45_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'required',0,$12,$13,$14,$15,$16,$17,$18,
		$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,'sealed-provider-response-metadata',$31,
		$32,$33,$34,$35,NULL,NULL,$36,$37,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
		'provider-job-receipt',$38,$39::jsonb,$40,$41,$42::jsonb,$43,$44,TRUE)`
	if _, err := db.ExecContext(ctx, insertOuterSource, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, attemptID, descriptorDigest, fixture.targetID, fixture.targetDigest,
		fixture.capabilityProfileID, fixture.capabilityProfileDigest, fixture.capabilityDescriptorDigest,
		fixture.capabilityID, invocationID, fixture.protocolFamily, fixture.providerConfigurationID,
		fixture.modelID, fixture.modelLineageDigest, fixture.adapterDigest, providerRequestDigest,
		providerResponseDigest, dispatchIntentDigest, transportReceiptDigest, resultSpoolReceiptDigest,
		normalizedEventSetDigest, optionalAuthorityRequestDigest, fixture.runtimeFactSourceAuthorityDigest,
		fixture.runtimeSourceAuthorityID, fixture.ownerImplementationDigest, fixture.runtimeSourceRouteBinding,
		fixture.registrationAuthorityIssuerID, fixture.registrationReceiptDigest, outerSourceDigest,
		sourceRequestDigest, sourceReceiptDigest, nativeProviderSourceReceiptDigest,
		nativeProviderSourceDigest, sourceOwnerStageDigest, sourceOwnerAckDigest, factDigest,
		string(factBytes), factBytes, outerSourceSealDigest, string(outerReceiptBytes),
		outerReceiptBytes, outerSealedAt); err != nil {
		t.Fatalf("seal optional source from typed native bootstrap: %v", err)
	}
	var storedBootstrapReceipt, storedOuterSeal string
	var storedBootstrapBytes []byte
	if err := db.QueryRowContext(ctx, `SELECT bootstrap.source_receipt_digest,bootstrap.source_receipt_bytes,
		source.source_seal_digest FROM agent_evaluation_native_optional_capability_bootstrap_sources bootstrap
		JOIN agent_evaluation_optional_capability_fact_sources source
		  ON source.namespace_id=bootstrap.namespace_id AND source.plan_digest=bootstrap.plan_digest
		 AND source.repository_commit=bootstrap.repository_commit AND source.attempt_id=bootstrap.attempt_id
		 AND source.turn_index=bootstrap.turn_index
		WHERE bootstrap.namespace_id=$1 AND bootstrap.plan_digest=$2 AND bootstrap.attempt_id=$3`,
		fixture.namespaceID, fixture.planDigest, attemptID).Scan(&storedBootstrapReceipt,
		&storedBootstrapBytes, &storedOuterSeal); err != nil {
		t.Fatalf("read native bootstrap/optional source join: %v", err)
	}
	if storedBootstrapReceipt != sourceReceiptDigest || !bytes.Equal(storedBootstrapBytes, sourceReceiptBytes) ||
		storedOuterSeal != outerSourceSealDigest {
		t.Fatalf("native bootstrap ACK-loss authority drifted: receipt=%q outer=%q", storedBootstrapReceipt, storedOuterSeal)
	}
	if factDigest == providerStateReferenceDigest {
		t.Fatal("native bootstrap collapsed the selected fact digest into the provider state reference digest")
	}
	attemptDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-attempt")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_attempts (
		namespace_id,plan_digest,attempt_id,descriptor_digest,sampling_identity_digest,
		independent_run_id,shard_id,case_id,target_id,status,outcome,attempt_digest,
		attempt_json,attempt_bytes,started_at,completed_at
	) VALUES ($1,$2,$3,$4,$5,'independent-run.v45.native-bootstrap',
		'shard.v45.native-bootstrap','case.v45.native-bootstrap',$6,'completed','passed',$7,
		$8::jsonb,$9,$10,$11)`, fixture.namespaceID, fixture.planDigest, attemptID,
		descriptorDigest, attemptAuthorityMigrationDigest("v45-native-bootstrap-sampling"),
		fixture.targetID, attemptDigest, `{"attempt":"native-bootstrap"}`,
		[]byte(`{"attempt":"native-bootstrap"}`), rawStartedAt, outerSealedAt.Add(time.Second)); err != nil {
		t.Fatalf("store native bootstrap attempt: %v", err)
	}
	runtimeEnvelopeDigest := attemptAuthorityMigrationDigest("v45-native-bootstrap-runtime-envelope")
	factAuthorityBase := map[string]any{
		"format": "prodivix.agent-evaluation-provider-capability-fact-authority", "version": 1,
		"factKind": "provider-job-receipt", "factDigest": factDigest,
		"sourceAuthorityKind":                 "shared-durable-capability",
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceKind":                          "sealed-provider-response-metadata",
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"runtimeFactSourceAuthorityDigest":    fixture.runtimeFactSourceAuthorityDigest,
		"stageDigest":                         sourceOwnerStageDigest,
		"dispatchAckDigest":                   sourceOwnerAckDigest,
		"transportReceiptDigest":              transportReceiptDigest,
		"resultSpoolReceiptDigest":            resultSpoolReceiptDigest,
		"normalizedEventSetDigest":            normalizedEventSetDigest,
		"runtimeFactEnvelopeDigest":           runtimeEnvelopeDigest,
	}
	factAuthorityDigest := attemptAuthorityMigrationCanonicalDigest(t, factAuthorityBase)
	factAuthority := attemptAuthorityMigrationCloneObject(t, factAuthorityBase)
	factAuthority["authorityDigest"] = factAuthorityDigest
	selectedEnvelopeSetDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"runtimeFactEnvelopeDigests": []any{runtimeEnvelopeDigest},
	})
	sourceAuthoritySetDigest := attemptAuthorityMigrationCanonicalDigest(t, map[string]any{
		"authorityDigests": []any{factAuthorityDigest},
	})
	observationProjection := map[string]any{
		"planDigest": fixture.planDigest, "repositoryCommit": fixture.repositoryCommit,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": 0,
		"invocationId": invocationID, "requestDigest": providerRequestDigest,
		"responseDigest": providerResponseDigest, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID,
		"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"dispatchIntentDigest":                 dispatchIntentDigest,
		"transportReceiptDigest":               transportReceiptDigest,
		"resultSpoolReceiptDigest":             resultSpoolReceiptDigest,
		"normalizedEventSetDigest":             normalizedEventSetDigest,
		"selectedRuntimeFactEnvelopeSetDigest": selectedEnvelopeSetDigest,
		"sourceAuthoritySetDigest":             sourceAuthoritySetDigest,
		"factDigests": []any{map[string]any{
			"factKind": "provider-job-receipt", "factDigest": factDigest,
		}},
		"factAuthorityDigests": []any{map[string]any{
			"factKind": "provider-job-receipt", "factDigest": factDigest,
			"authorityDigest": factAuthorityDigest,
		}},
	}
	observationDigest := attemptAuthorityMigrationCanonicalDigest(t, observationProjection)
	observationReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-provider-capability-observation-receipt", "version": 1,
		"observationReceiptId": "observation.v45.native-bootstrap",
		"planDigest":           fixture.planDigest, "repositoryCommit": fixture.repositoryCommit,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": 0,
		"invocationId": invocationID, "requestDigest": providerRequestDigest,
		"responseDigest": providerResponseDigest, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID,
		"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"dispatchIntentDigest":     dispatchIntentDigest,
		"transportReceiptDigest":   transportReceiptDigest,
		"resultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"normalizedEventSetDigest": normalizedEventSetDigest,
		"facts":                    []any{fact}, "factAuthorities": []any{factAuthority},
		"selectedRuntimeFactEnvelopeSetDigest": selectedEnvelopeSetDigest,
		"sourceAuthoritySetDigest":             sourceAuthoritySetDigest,
		"observationDigest":                    observationDigest,
		"observedAt":                           observedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	observationReceiptDigest := attemptAuthorityMigrationCanonicalDigest(t, observationReceiptBase)
	observationReceipt := attemptAuthorityMigrationCloneObject(t, observationReceiptBase)
	observationReceipt["receiptDigest"] = observationReceiptDigest
	observationReceiptBytes := attemptAuthorityMigrationCanonicalBytes(t, observationReceipt)
	withV45MigrationFixtureUserTriggersDisabled(t, db,
		"agent_evaluation_provider_capability_observation_receipts", func() error {
			_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_capability_observation_receipts (
				namespace_id,plan_digest,repository_commit,observation_receipt_id,attempt_id,
				descriptor_digest,turn_index,invocation_id,request_digest,response_digest,
				protocol_family,provider_configuration_id,model_lineage_digest,adapter_digest,
				dispatch_intent_digest,transport_receipt_digest,result_spool_receipt_digest,
				normalized_event_set_digest,selected_runtime_fact_envelope_set_digest,
				source_authority_set_digest,observation_digest,observed_at,receipt_digest,
				receipt_json,receipt_bytes
			) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
				$18,$19,$20,$21,$22,$23::jsonb,$24)`, fixture.namespaceID, fixture.planDigest,
				fixture.repositoryCommit, observationReceiptBase["observationReceiptId"], attemptID,
				descriptorDigest, invocationID, providerRequestDigest, providerResponseDigest,
				fixture.protocolFamily, fixture.providerConfigurationID, fixture.modelLineageDigest,
				fixture.adapterDigest, dispatchIntentDigest, transportReceiptDigest,
				resultSpoolReceiptDigest, normalizedEventSetDigest, selectedEnvelopeSetDigest,
				sourceAuthoritySetDigest, observationDigest, observedAt, observationReceiptDigest,
				string(observationReceiptBytes), observationReceiptBytes)
			return err
		})
	inputIssuedAt := time.Now().UTC().Truncate(time.Millisecond)
	requestRefSeed := buildV45CapabilityEffectRequestRefSeed(t, v45CapabilityEffectRequestRefSeed{
		namespaceID: fixture.namespaceID, planDigest: fixture.planDigest,
		repositoryCommit: fixture.repositoryCommit, attemptID: attemptID,
		descriptorDigest: descriptorDigest, turnIndex: 1,
		invocationID: "invocation.v45.native-bootstrap.registry",
		bindingKind:  "provider-job", capabilityID: fixture.capabilityID,
		toolID: "provider.background-job.poll", targetRef: "target-ref.v45.native-bootstrap",
		protocolFamily: fixture.protocolFamily, providerConfigurationID: fixture.providerConfigurationID,
		modelLineageDigest: fixture.modelLineageDigest, adapterDigest: fixture.adapterDigest,
		runtimeFactSourceAuthorityDigest:       fixture.runtimeFactSourceAuthorityDigest,
		registrationReceiptDigest:              fixture.registrationReceiptDigest,
		issuedAt:                               inputIssuedAt,
		expiresAt:                              inputIssuedAt.Add(2 * time.Minute),
		selectedSourceObservationReceiptDigest: observationReceiptDigest,
		selectedSourceHandleDigest:             factDigest,
	}, descriptor)
	if err := insertV45CapabilityEffectRequestRefSeed(db, requestRefSeed); err != nil {
		t.Fatalf("store native provider-job request-ref: %v", err)
	}
	registryRequestBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-input-authority-registry-request", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit":                 fixture.repositoryCommit,
		"requestRefAuthorityReceiptDigest": requestRefSeed.receiptDigest,
		"requestRef":                       requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef,
		"requestedAt": inputIssuedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	registryRequestDigest := attemptAuthorityMigrationCanonicalDigest(t, registryRequestBase)
	registryRequest := attemptAuthorityMigrationCloneObject(t, registryRequestBase)
	registryRequest["requestDigest"] = registryRequestDigest
	registryRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, registryRequest)
	registryReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-input-authority-registry-receipt", "version": 1,
		"bindingKind": requestRefSeed.bindingKind, "capabilityId": requestRefSeed.capabilityID,
		"requestRef": requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef,
		"requestRefAuthority":              requestRefSeed.receipt,
		"requestRefAuthorityReceiptDigest": requestRefSeed.receiptDigest,
		"sourceAttemptId":                  attemptID, "sourceTurnIndex": 0, "sourceInvocationId": invocationID,
		"sourceProviderRequestDigest": providerRequestDigest, "sourceResponseDigest": providerResponseDigest,
		"sourceDispatchIntentDigest":     dispatchIntentDigest,
		"sourceTransportReceiptDigest":   transportReceiptDigest,
		"sourceResultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"sourceNormalizedEventSetDigest": normalizedEventSetDigest,
		"sourceObservationReceiptDigest": observationReceiptDigest,
		"sourceFactKind":                 "provider-job-receipt", "sourceProviderEventType": nil,
		"sourceProviderToolCallId": nil, "sourceToolId": nil, "sourceArgumentsDigest": nil,
		"sourceHandleDigest":      factDigest,
		"stateVaultSealRequest":   stateVault.sealRequest,
		"stateVaultSealReceipt":   stateVault.sealReceipt,
		"protocolFamily":          fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID,
		"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
	}
	insertRegistry := func(receiptBase map[string]any, sourceHandle string) error {
		t.Helper()
		receiptDigest := attemptAuthorityMigrationCanonicalDigest(t, receiptBase)
		receipt := attemptAuthorityMigrationCloneObject(t, receiptBase)
		receipt["receiptDigest"] = receiptDigest
		receiptBytes := attemptAuthorityMigrationCanonicalBytes(t, receipt)
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_input_authority_registry_receipts (
			namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,
			request_ref_authority_receipt_digest,request_ref,target_ref,binding_kind,
			source_attempt_id,source_turn_index,source_invocation_id,source_observation_receipt_digest,
			source_handle_digest,requested_at,request_json,request_bytes,receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,$15::jsonb,$16,$17::jsonb,$18)`,
			fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, registryRequestDigest,
			receiptDigest, requestRefSeed.receiptDigest, requestRefSeed.requestRef,
			requestRefSeed.targetRef, requestRefSeed.bindingKind, attemptID, invocationID,
			observationReceiptDigest, sourceHandle, inputIssuedAt, string(registryRequestBytes),
			registryRequestBytes, string(receiptBytes), receiptBytes)
		return err
	}
	collapsedHandleReceipt := attemptAuthorityMigrationCloneObject(t, registryReceiptBase)
	collapsedHandleReceipt["sourceHandleDigest"] = providerStateReferenceDigest
	if err := insertRegistry(collapsedHandleReceipt, providerStateReferenceDigest); err == nil {
		t.Fatal("native provider-job registry accepted provider state reference digest as its source handle")
	}
	if err := insertRegistry(registryReceiptBase, factDigest); err != nil {
		t.Fatalf("store exact native provider-job registry with active state vault: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_native_optional_capability_bootstrap_sources
		SET source_owner_stage_digest=$4 WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3`,
		fixture.namespaceID, fixture.planDigest, attemptID,
		attemptAuthorityMigrationDigest("swapped-native-bootstrap-stage")); err == nil {
		t.Fatal("typed native bootstrap accepted a late stage fence swap")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_optional_capability_fact_sources
		SET native_bootstrap_source_receipt_digest=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3`, fixture.namespaceID,
		fixture.planDigest, attemptID,
		attemptAuthorityMigrationDigest("swapped-native-bootstrap-receipt")); err == nil {
		t.Fatal("optional source accepted a late native bootstrap receipt swap")
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM agent_evaluation_native_optional_capability_bootstrap_sources
		WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3`, fixture.namespaceID,
		fixture.planDigest, attemptID); err == nil {
		t.Fatal("typed native bootstrap accepted late deletion")
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOptionalFactAuthorityUnavailableLifecycle(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	fixture := seedSealedV45CapabilityProbeAdmission(t, db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	attemptID := "attempt.v45.optional-fact"
	descriptorDigest := attemptAuthorityMigrationDigest("v45-optional-fact-descriptor")
	invocationID := "invocation.v45.optional-fact"
	providerRequestDigest := attemptAuthorityMigrationDigest("v45-optional-provider-request")
	responseDigest := attemptAuthorityMigrationDigest("v45-optional-provider-response")
	dispatchIntentDigest := attemptAuthorityMigrationDigest("v45-optional-dispatch-intent")
	transportReceiptDigest := attemptAuthorityMigrationDigest("v45-optional-transport-receipt")
	resultSpoolReceiptDigest := attemptAuthorityMigrationDigest("v45-optional-result-spool")
	normalizedEventSetDigest := attemptAuthorityMigrationDigest("v45-optional-normalized-events")
	sourceRequestDigest := attemptAuthorityMigrationDigest("v45-optional-source-request")
	sourceDigest := attemptAuthorityMigrationDigest("v45-optional-source")
	rawCreatedAt := fixture.plannedAt.Add(time.Minute)
	sourceSealedAt := rawCreatedAt.Add(2 * time.Second)
	demandDigest := attemptAuthorityMigrationDigest("v45-optional-demand")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_budget_reservations (
		namespace_id,plan_digest,reservation_id,ledger_revision,demand_digest,demand_json,
		demand_bytes,reserved_at
	) VALUES ($1,$2,'reservation.v45.optional-fact',0,$3,'{}'::jsonb,$4,$5)`,
		fixture.namespaceID, fixture.planDigest, demandDigest, []byte(`{}`), rawCreatedAt); err != nil {
		t.Fatalf("store optional-fact budget reservation: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_transport_dispatch_intents (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,descriptor_json,
		descriptor_bytes,turn_index,budget_reservation_id,intent_id,invocation_id,protocol_family,
		provider_configuration_id,model_lineage_digest,inference_configuration_digest,demand_digest,
		request_digest,endpoint_id,endpoint_class,request_body_digest,request_bytes,intent_digest,
		intent_json,intent_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,$6,0,'reservation.v45.optional-fact',
		'intent.v45.optional-fact',$7,$8,$9,$10,$11,$12,$13,'endpoint.v45.optional-fact',
		'first-party-hosted',$13,1,$14,'{}'::jsonb,$6,$15)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, attemptID, descriptorDigest, []byte(`{}`),
		invocationID, fixture.protocolFamily, fixture.providerConfigurationID,
		fixture.modelLineageDigest, attemptAuthorityMigrationDigest("v45-optional-inference"),
		demandDigest, providerRequestDigest, dispatchIntentDigest, rawCreatedAt); err != nil {
		t.Fatalf("store optional-fact dispatch intent: %v", err)
	}
	responseBodyDigest := attemptAuthorityMigrationDigest("v45-optional-response-body")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_transport_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,
		intent_digest,receipt_id,invocation_id,provider_configuration_id,provider_request_id,
		dispatch_state,outcome,response_body_digest,receipt_digest,receipt_json,receipt_bytes,
		started_at,completed_at,closed_at
	) VALUES ($1,$2,$3,$4,$5,0,$6,'transport.v45.optional-fact',$7,$8,NULL,
		'dispatched','completed',$9,$10,'{}'::jsonb,$11,$12,$13,$13)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, attemptID, descriptorDigest,
		dispatchIntentDigest, invocationID, fixture.providerConfigurationID,
		responseBodyDigest, transportReceiptDigest, []byte(`{}`), rawCreatedAt,
		rawCreatedAt.Add(time.Second)); err != nil {
		t.Fatalf("store optional-fact transport receipt: %v", err)
	}
	spoolAuthorityDigest := attemptAuthorityMigrationDigest("v45-optional-spool-authority")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_result_spool_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,
		invocation_id,spool_ref,dispatch_intent_digest,transport_receipt_digest,algorithm,
		encryption_profile_digest,key_ref_digest,key_id,key_version,aad_digest,envelope_digest,
		ciphertext_digest,ciphertext_size_bytes,response_body_digest,normalized_event_set_digest,
		response_digest,opaque_continuation_digest,retention_class,retention_policy_digest,
		receipt_digest,receipt_json,receipt_bytes,created_at,expires_at
	) VALUES ($1,$2,$3,$4,$5,0,$6,'spool.v45.optional-fact',$7,$8,'aes-256-gcm',
		$9,$9,'key.v45.optional-fact',1,$9,$10,$9,1,$11,$12,$13,NULL,
		'attempt-resume-only',$9,$14,'{}'::jsonb,$15,$16,$17)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, attemptID, descriptorDigest, invocationID,
		dispatchIntentDigest, transportReceiptDigest, spoolAuthorityDigest,
		attemptAuthorityMigrationDigest("v45-optional-encrypted-envelope"), responseBodyDigest,
		normalizedEventSetDigest, responseDigest, resultSpoolReceiptDigest, []byte(`{}`),
		rawCreatedAt.Add(time.Second), rawCreatedAt.Add(time.Hour)); err != nil {
		t.Fatalf("store optional-fact result spool receipt: %v", err)
	}
	localTransportReceiptDigest := attemptAuthorityMigrationDigest("v45-optional-unavailable-local-transport")
	var localResultSpoolReceiptDigest any
	localNormalizedEventSetDigest := attemptAuthorityMigrationDigest("v45-optional-unavailable-local-events")
	owner := seedV45OptionalSharedEffectOwner(t, db, fixture, attemptID, descriptorDigest,
		invocationID, providerRequestDigest, localTransportReceiptDigest,
		localResultSpoolReceiptDigest, localNormalizedEventSetDigest,
		"sealed-provider-response-metadata", "unavailable", nil, sourceSealedAt)
	sourceReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": descriptorDigest, "targetId": fixture.targetID,
		"targetDigest": fixture.targetDigest, "capabilityProfileId": fixture.capabilityProfileID,
		"capabilityProfileDigest":    fixture.capabilityProfileDigest,
		"capabilityDescriptorDigest": fixture.capabilityDescriptorDigest,
		"capabilityId":               fixture.capabilityID, "supportExpectation": "required",
		"turnIndex": 0, "invocationId": invocationID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"providerRequestDigest": providerRequestDigest, "responseDigest": responseDigest,
		"dispatchIntentDigest": dispatchIntentDigest, "transportReceiptDigest": localTransportReceiptDigest,
		"resultSpoolReceiptDigest":            localResultSpoolReceiptDigest,
		"normalizedEventSetDigest":            localNormalizedEventSetDigest,
		"sourceRequestDigest":                 sourceRequestDigest,
		"targetAuthorityDigest":               fixture.runtimeFactSourceAuthorityDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceAuthorityRouteBinding":         fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"sourceKind":                          "sealed-provider-response-metadata", "sourceDigest": sourceDigest,
		"ownerRequestDigest":        owner.ownerRequestDigest,
		"ownerReceiptDigest":        owner.ownerReceiptDigest,
		"ownerStageDigest":          owner.ownerStageDigest,
		"ownerDispatchAckDigest":    owner.ownerDispatchAckDigest,
		"preEffectIntentDigest":     owner.preEffectIntentDigest,
		"effectSourceReceiptDigest": owner.effectSourceReceiptDigest,
		"effectSourceFactDigest":    nil,
		"businessResultDigest":      owner.businessResultDigest,
		"outcome":                   "unavailable", "observedAt": sourceSealedAt.Format("2006-01-02T15:04:05.000Z"),
		"sealedAt": sourceSealedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	sourceSealDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, sourceReceiptBase)),
	)
	sourceReceipt := make(map[string]any, len(sourceReceiptBase)+1)
	for key, value := range sourceReceiptBase {
		sourceReceipt[key] = value
	}
	sourceReceipt["sourceSealDigest"] = sourceSealDigest
	sourceReceiptBytes := attemptAuthorityMigrationJSON(t, sourceReceipt)
	insertSource := `INSERT INTO agent_evaluation_optional_capability_fact_sources (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,
		target_digest,capability_profile_id,capability_profile_digest,capability_descriptor_digest,
		capability_id,support_expectation,turn_index,invocation_id,protocol_family,
		provider_configuration_id,model_id,model_lineage_digest,adapter_digest,
		provider_request_digest,response_digest,dispatch_intent_digest,transport_receipt_digest,
		result_spool_receipt_digest,normalized_event_set_digest,source_request_digest,
		target_authority_digest,
		source_authority_id,source_authority_implementation_digest,source_authority_route_binding,
		registration_authority_issuer_id,registration_receipt_digest,source_kind,source_digest,
		source_owner_request_digest,source_owner_receipt_digest,source_owner_stage_digest,
		source_owner_dispatch_ack_digest,source_pre_effect_intent_digest,
		source_pre_effect_intent_json,source_pre_effect_intent_bytes,source_effect_receipt_digest,
		provider_runtime_journal_result_record_digest,provider_runtime_result_seal_receipt_digest,
		source_effect_receipt_json,source_effect_receipt_bytes,source_effect_fact_digest,
		source_business_result_digest,
		source_seal_digest,source_receipt_json,source_receipt_bytes,sealed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'required',0,$12,$13,$14,$15,$16,$17,
		$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
		'sealed-provider-response-metadata',$31,$32,$33,$34,$35,$36,$37::jsonb,$38,$39,
		$40,$41,$42::jsonb,$43,$44,$45,$46,$47::jsonb,$48,$49)`
	insertUnavailableSource := func(effectReceiptBytes []byte) error {
		_, err := db.ExecContext(ctx, insertSource, fixture.namespaceID, fixture.planDigest,
			fixture.repositoryCommit, attemptID, descriptorDigest, fixture.targetID, fixture.targetDigest,
			fixture.capabilityProfileID, fixture.capabilityProfileDigest,
			fixture.capabilityDescriptorDigest, fixture.capabilityID, invocationID,
			fixture.protocolFamily, fixture.providerConfigurationID, fixture.modelID,
			fixture.modelLineageDigest, fixture.adapterDigest, providerRequestDigest, responseDigest,
			dispatchIntentDigest, localTransportReceiptDigest, localResultSpoolReceiptDigest,
			localNormalizedEventSetDigest, sourceRequestDigest, fixture.runtimeFactSourceAuthorityDigest,
			fixture.runtimeSourceAuthorityID, fixture.ownerImplementationDigest,
			fixture.runtimeSourceRouteBinding, fixture.registrationAuthorityIssuerID,
			fixture.registrationReceiptDigest, sourceDigest, owner.ownerRequestDigest,
			owner.ownerReceiptDigest, owner.ownerStageDigest, owner.ownerDispatchAckDigest,
			owner.preEffectIntentDigest, string(owner.preEffectIntentBytes), owner.preEffectIntentBytes,
			owner.effectSourceReceiptDigest, owner.providerRuntimeJournalResultRecordDigest,
			owner.providerRuntimeResultSealReceiptDigest, string(effectReceiptBytes),
			effectReceiptBytes, nil, owner.businessResultDigest, sourceSealDigest,
			string(sourceReceiptBytes), sourceReceiptBytes, sourceSealedAt)
		return err
	}
	extraKeyEffectReceipt := attemptAuthorityMigrationCloneObject(t, owner.effectSourceReceipt)
	extraKeyEffectReceipt["unexpected"] = true
	if err := insertUnavailableSource(attemptAuthorityMigrationJSON(t, extraKeyEffectReceipt)); err == nil {
		t.Fatal("optional-fact source accepted an extra effect receipt key")
	}
	halfVaultEffectReceipt := attemptAuthorityMigrationCloneObject(t, owner.effectSourceReceipt)
	halfVaultEffectReceipt["stateVaultResolveRequest"] = map[string]any{}
	if err := insertUnavailableSource(attemptAuthorityMigrationJSON(t, halfVaultEffectReceipt)); err == nil {
		t.Fatal("stateless optional-fact source accepted a half-present vault lifecycle")
	}
	if err := insertUnavailableSource(owner.effectSourceReceiptBytes); err != nil {
		t.Fatalf("store sealed optional-fact source: %v", err)
	}
	var storedJournalResultRecordDigest, storedResultSealReceiptDigest string
	if err := db.QueryRowContext(ctx, `SELECT provider_runtime_journal_result_record_digest,
		provider_runtime_result_seal_receipt_digest
		FROM agent_evaluation_optional_capability_fact_sources
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND source_seal_digest=$4`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, sourceSealDigest).Scan(
		&storedJournalResultRecordDigest, &storedResultSealReceiptDigest,
	); err != nil {
		t.Fatalf("read optional-fact Provider runtime journal bridge: %v", err)
	}
	if storedJournalResultRecordDigest != owner.providerRuntimeJournalResultRecordDigest ||
		storedResultSealReceiptDigest != owner.providerRuntimeResultSealReceiptDigest {
		t.Fatal("optional-fact Provider runtime journal bridge drifted")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_optional_capability_fact_sources
		SET source_digest=$4 WHERE namespace_id=$1 AND plan_digest=$2 AND source_seal_digest=$3`,
		fixture.namespaceID, fixture.planDigest, sourceSealDigest,
		attemptAuthorityMigrationDigest("swapped-optional-source")); err == nil {
		t.Fatal("sealed optional-fact source accepted a late source swap")
	}
	authorityRequest := map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-authority-stage-request", "version": 1,
		"planDigest": fixture.planDigest, "repositoryCommit": fixture.repositoryCommit,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": 0,
		"sourceSealDigest": sourceSealDigest,
	}
	authorityRequestBytes := attemptAuthorityMigrationJSON(t, authorityRequest)
	authorityRequestDigest := attemptAuthorityMigrationDigest(string(authorityRequestBytes))
	stageDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-authority-stage", "version": 1,
		"authorityRequestDigest":              authorityRequestDigest,
		"targetAuthorityDigest":               fixture.runtimeFactSourceAuthorityDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceAuthorityRouteBinding":         fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"sourceKind":                          "sealed-provider-response-metadata", "sourceDigest": sourceDigest,
	})))
	stageAuthority := `INSERT INTO agent_evaluation_optional_fact_authorities (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,
		target_digest,capability_profile_id,capability_profile_digest,capability_descriptor_digest,
		capability_id,support_expectation,turn_index,invocation_id,protocol_family,
		provider_configuration_id,model_id,model_lineage_digest,adapter_digest,
		provider_request_digest,response_digest,dispatch_intent_digest,transport_receipt_digest,
		result_spool_receipt_digest,normalized_event_set_digest,target_authority_digest,
		source_authority_id,source_authority_implementation_digest,source_authority_route_binding,
		source_registration_authority_issuer_id,source_registration_receipt_digest,
		source_kind,source_digest,
		source_seal_digest,authority_request_digest,state,claim_generation,v45_eligible,
		stage_digest,staged_at,source_owner_request_digest,source_owner_receipt_digest,
		source_owner_stage_digest,source_owner_dispatch_ack_digest,
		source_pre_effect_intent_digest,source_effect_receipt_digest,
		source_effect_fact_digest,source_business_result_digest,request_json,request_bytes
	) SELECT source.namespace_id,source.plan_digest,source.repository_commit,source.attempt_id,
		source.descriptor_digest,source.target_id,source.target_digest,source.capability_profile_id,
		source.capability_profile_digest,source.capability_descriptor_digest,source.capability_id,
		source.support_expectation,source.turn_index,source.invocation_id,source.protocol_family,
		source.provider_configuration_id,source.model_id,source.model_lineage_digest,
		source.adapter_digest,source.provider_request_digest,source.response_digest,
		source.dispatch_intent_digest,source.transport_receipt_digest,
		source.result_spool_receipt_digest,source.normalized_event_set_digest,
		source.target_authority_digest,source.source_authority_id,
		source.source_authority_implementation_digest,source.source_authority_route_binding,
		source.registration_authority_issuer_id,source.registration_receipt_digest,
		source.source_kind,source.source_digest,
		$4,$5,'staged',1,TRUE,$6,$7,source.source_owner_request_digest,
		source.source_owner_receipt_digest,source.source_owner_stage_digest,
		source.source_owner_dispatch_ack_digest,source.source_pre_effect_intent_digest,
		source.source_effect_receipt_digest,source.source_effect_fact_digest,
		source.source_business_result_digest,$8::jsonb,$9
	FROM agent_evaluation_optional_capability_fact_sources source
	WHERE source.namespace_id=$1 AND source.plan_digest=$2 AND source.repository_commit=$3
		AND source.source_seal_digest=$10`
	if _, err := db.ExecContext(ctx, stageAuthority, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, attemptAuthorityMigrationDigest("fake-optional-source-seal"),
		authorityRequestDigest, stageDigest, sourceSealedAt.Add(time.Second),
		string(authorityRequestBytes), authorityRequestBytes, sourceSealDigest); err == nil {
		t.Fatal("optional-fact authority staged against a fake source seal")
	}
	if _, err := db.ExecContext(ctx, stageAuthority, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, sourceSealDigest, authorityRequestDigest, stageDigest,
		sourceSealedAt.Add(time.Second), string(authorityRequestBytes), authorityRequestBytes,
		sourceSealDigest); err != nil {
		t.Fatalf("stage optional-fact authority from sealed source: %v", err)
	}
	dispatchAckDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-authority-dispatch-ack", "version": 1,
		"authorityRequestDigest": authorityRequestDigest, "stageDigest": stageDigest,
		"targetAuthorityDigest":               fixture.runtimeFactSourceAuthorityDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceAuthorityRouteBinding":         fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"sourceKind":                          "sealed-provider-response-metadata", "sourceDigest": sourceDigest,
		"outcome": "unavailable", "observedAt": sourceSealedAt.Format("2006-01-02T15:04:05.000Z"),
	})))
	responseBase := map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-authority-response", "version": 1,
		"outcome": "unavailable", "authorityRequestDigest": authorityRequestDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"stageDigest":                         stageDigest,
		"dispatchAckDigest":                   dispatchAckDigest,
		"runtimeFactEnvelopes":                []any{}, "factAuthorities": []any{},
	}
	resultDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, responseBase)))
	response := make(map[string]any, len(responseBase)+1)
	for key, value := range responseBase {
		response[key] = value
	}
	response["resultDigest"] = resultDigest
	responseBytes := attemptAuthorityMigrationJSON(t, response)
	sealedAt := sourceSealedAt.Add(2 * time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_optional_fact_authorities SET
		state='sealed',outcome='unavailable',dispatch_ack_digest=$4,result_digest=$5,
		response_json=$6::jsonb,response_bytes=$7,sealed_at=$8,stage_digest=$9
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND attempt_id=$10 AND turn_index=0`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, dispatchAckDigest, resultDigest, string(responseBytes),
		responseBytes, sealedAt, attemptAuthorityMigrationDigest("fake-optional-stage"),
		attemptID); err == nil {
		t.Fatal("optional-fact authority seal accepted a fake stage fence")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_optional_fact_authorities SET
		state='sealed',outcome='unavailable',dispatch_ack_digest=$4,result_digest=$5,
		response_json=$6::jsonb,response_bytes=$7,sealed_at=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND attempt_id=$9 AND turn_index=0`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, dispatchAckDigest, resultDigest, string(responseBytes),
		responseBytes, sealedAt, attemptID); err != nil {
		t.Fatalf("seal unavailable optional-fact authority: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_optional_fact_authorities
		SET dispatch_ack_digest=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND attempt_id=$5 AND turn_index=0`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, attemptAuthorityMigrationDigest("late-optional-ack"),
		attemptID); err == nil {
		t.Fatal("sealed optional-fact authority accepted a late acknowledgement swap")
	}
	var state, outcome, storedSourceSeal, storedStage, storedAck, storedResult string
	var storedResultSpool sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT state,outcome,source_seal_digest,stage_digest,
		dispatch_ack_digest,result_digest,result_spool_receipt_digest
		FROM agent_evaluation_optional_fact_authorities
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND attempt_id=$4 AND turn_index=0`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, attemptID).Scan(&state, &outcome, &storedSourceSeal,
		&storedStage, &storedAck, &storedResult, &storedResultSpool); err != nil {
		t.Fatalf("read sealed optional-fact authority: %v", err)
	}
	if state != "sealed" || outcome != "unavailable" || storedSourceSeal != sourceSealDigest ||
		storedStage != stageDigest || storedAck != dispatchAckDigest || storedResult != resultDigest ||
		storedResultSpool.Valid {
		t.Fatalf("sealed optional-fact authority drifted: state=%q outcome=%q source=%q stage=%q ack=%q result=%q",
			state, outcome, storedSourceSeal, storedStage, storedAck, storedResult)
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOptionalFactAuthority(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	fixture := seedSealedV45CapabilityProbeAdmission(t, db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	attemptID := "attempt.v45.optional-fact.observed"
	descriptorDigest := attemptAuthorityMigrationDigest("v45-optional-fact-observed-descriptor")
	invocationID := "invocation.v45.optional-fact.observed"
	providerRequestDigest := attemptAuthorityMigrationDigest("v45-optional-observed-provider-request")
	responseDigest := attemptAuthorityMigrationDigest("v45-optional-observed-provider-response")
	dispatchIntentDigest := attemptAuthorityMigrationDigest("v45-optional-observed-dispatch-intent")
	transportReceiptDigest := attemptAuthorityMigrationDigest("v45-optional-observed-transport-receipt")
	resultSpoolReceiptDigest := attemptAuthorityMigrationDigest("v45-optional-observed-result-spool")
	rawCreatedAt := fixture.plannedAt.Add(2 * time.Minute)
	rawCompletedAt := rawCreatedAt.Add(time.Second)
	sourceSealedAt := rawCreatedAt.Add(2 * time.Second)
	observedAt := sourceSealedAt
	stagedAt := sourceSealedAt.Add(time.Second)
	sealedAt := stagedAt.Add(time.Second)

	providerJobBase := map[string]any{
		"providerJobId": "provider-job.v45.optional", "taskId": "task.v45.optional",
		"runId": "run.v45.optional", "generation": 1, "invocationId": invocationID,
		"phase": "accepted", "callbackAuthority": "active",
	}
	providerJobDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, providerJobBase)),
	)
	providerJob := attemptAuthorityMigrationCloneObject(t, providerJobBase)
	providerJob["receiptDigest"] = providerJobDigest
	fact := map[string]any{
		"factKind": "provider-job-receipt", "factDigest": providerJobDigest,
		"value": providerJob,
	}
	factBytes := attemptAuthorityMigrationJSON(t, fact)
	normalizedEventSetDigest := attemptAuthorityMigrationDigest("v45-optional-observed-normalized-events")

	demandDigest := attemptAuthorityMigrationDigest("v45-optional-observed-demand")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_budget_reservations (
		namespace_id,plan_digest,reservation_id,ledger_revision,demand_digest,demand_json,
		demand_bytes,reserved_at
	) VALUES ($1,$2,'reservation.v45.optional-fact.observed',0,$3,'{}'::jsonb,$4,$5)`,
		fixture.namespaceID, fixture.planDigest, demandDigest, []byte(`{}`), rawCreatedAt); err != nil {
		t.Fatalf("store observed optional-fact budget reservation: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_transport_dispatch_intents (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,descriptor_json,
		descriptor_bytes,turn_index,budget_reservation_id,intent_id,invocation_id,protocol_family,
		provider_configuration_id,model_lineage_digest,inference_configuration_digest,demand_digest,
		request_digest,endpoint_id,endpoint_class,request_body_digest,request_bytes,intent_digest,
		intent_json,intent_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,$6,0,'reservation.v45.optional-fact.observed',
		'intent.v45.optional-fact.observed',$7,$8,$9,$10,$11,$12,$13,
		'endpoint.v45.optional-fact.observed','first-party-hosted',$13,1,$14,'{}'::jsonb,$6,$15)`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, attemptID,
		descriptorDigest, []byte(`{}`), invocationID, fixture.protocolFamily,
		fixture.providerConfigurationID, fixture.modelLineageDigest,
		attemptAuthorityMigrationDigest("v45-optional-observed-inference"), demandDigest,
		providerRequestDigest, dispatchIntentDigest, rawCreatedAt); err != nil {
		t.Fatalf("store observed optional-fact dispatch intent: %v", err)
	}
	responseBodyDigest := attemptAuthorityMigrationDigest("v45-optional-observed-response-body")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_transport_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,
		intent_digest,receipt_id,invocation_id,provider_configuration_id,provider_request_id,
		dispatch_state,outcome,response_body_digest,receipt_digest,receipt_json,receipt_bytes,
		started_at,completed_at,closed_at
	) VALUES ($1,$2,$3,$4,$5,0,$6,'transport.v45.optional-fact.observed',$7,$8,NULL,
		'dispatched','completed',$9,$10,'{}'::jsonb,$11,$12,$13,$13)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, attemptID, descriptorDigest,
		dispatchIntentDigest, invocationID, fixture.providerConfigurationID, responseBodyDigest,
		transportReceiptDigest, []byte(`{}`), rawCreatedAt, rawCompletedAt); err != nil {
		t.Fatalf("store observed optional-fact transport receipt: %v", err)
	}
	spoolAuthorityDigest := attemptAuthorityMigrationDigest("v45-optional-observed-spool-authority")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_result_spool_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,
		invocation_id,spool_ref,dispatch_intent_digest,transport_receipt_digest,algorithm,
		encryption_profile_digest,key_ref_digest,key_id,key_version,aad_digest,envelope_digest,
		ciphertext_digest,ciphertext_size_bytes,response_body_digest,normalized_event_set_digest,
		response_digest,opaque_continuation_digest,retention_class,retention_policy_digest,
		receipt_digest,receipt_json,receipt_bytes,created_at,expires_at
	) VALUES ($1,$2,$3,$4,$5,0,$6,'spool.v45.optional-fact.observed',$7,$8,'aes-256-gcm',
		$9,$9,'key.v45.optional-fact.observed',1,$9,$10,$9,1,$11,$12,$13,NULL,
		'attempt-resume-only',$9,$14,'{}'::jsonb,$15,$16,$17)`, fixture.namespaceID,
		fixture.planDigest, fixture.repositoryCommit, attemptID, descriptorDigest, invocationID,
		dispatchIntentDigest, transportReceiptDigest, spoolAuthorityDigest,
		attemptAuthorityMigrationDigest("v45-optional-observed-encrypted-envelope"),
		responseBodyDigest, normalizedEventSetDigest, responseDigest, resultSpoolReceiptDigest,
		[]byte(`{}`), rawCompletedAt, rawCreatedAt.Add(time.Hour)); err != nil {
		t.Fatalf("store observed optional-fact result spool receipt: %v", err)
	}
	localTransportReceiptDigest := attemptAuthorityMigrationDigest("v45-optional-local-transport")
	localResultSpoolReceiptDigest := attemptAuthorityMigrationDigest("v45-optional-local-spool")
	localNormalizedEventSetDigest := attemptAuthorityMigrationDigest("v45-optional-local-events")
	owner := seedV45OptionalSharedEffectOwner(t, db, fixture, attemptID, descriptorDigest,
		invocationID, providerRequestDigest, localTransportReceiptDigest,
		localResultSpoolReceiptDigest, localNormalizedEventSetDigest,
		"sealed-provider-response-metadata", "observed", fact, sourceSealedAt)
	sourceDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
		"kind": "sealed-provider-response-metadata", "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": descriptorDigest, "turnIndex": 0, "invocationId": invocationID,
		"providerRequestDigest": providerRequestDigest, "responseDigest": responseDigest,
		"dispatchIntentDigest":      dispatchIntentDigest,
		"transportReceiptDigest":    localTransportReceiptDigest,
		"resultSpoolReceiptDigest":  localResultSpoolReceiptDigest,
		"normalizedEventSetDigest":  localNormalizedEventSetDigest,
		"ownerRequestDigest":        owner.ownerRequestDigest,
		"ownerReceiptDigest":        owner.ownerReceiptDigest,
		"ownerStageDigest":          owner.ownerStageDigest,
		"ownerDispatchAckDigest":    owner.ownerDispatchAckDigest,
		"preEffectIntentDigest":     owner.preEffectIntentDigest,
		"effectSourceReceiptDigest": owner.effectSourceReceiptDigest,
		"effectSourceFactDigest":    owner.effectSourceFactDigest,
		"businessResultDigest":      owner.businessResultDigest,
		"outcome":                   "observed", "factDigest": providerJobDigest,
	})))

	sourceRequestProjection := map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-authority-request", "version": 1,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest,
		"targetId": fixture.targetID, "targetDigest": fixture.targetDigest,
		"capabilityProfileId":        fixture.capabilityProfileID,
		"capabilityProfileDigest":    fixture.capabilityProfileDigest,
		"capabilityDescriptorDigest": fixture.capabilityDescriptorDigest,
		"capabilityId":               fixture.capabilityID, "supportExpectation": "required", "turnIndex": 0,
		"invocationId": invocationID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"providerRequestDigest": providerRequestDigest, "responseDigest": responseDigest,
		"dispatchIntentDigest":     dispatchIntentDigest,
		"transportReceiptDigest":   localTransportReceiptDigest,
		"resultSpoolReceiptDigest": localResultSpoolReceiptDigest,
		"normalizedEventSetDigest": localNormalizedEventSetDigest,
		"source": map[string]any{
			"kind":                      "sealed-provider-response-metadata",
			"ownerRequestDigest":        owner.ownerRequestDigest,
			"ownerReceiptDigest":        owner.ownerReceiptDigest,
			"effectSourceReceiptDigest": owner.effectSourceReceiptDigest,
		},
	}
	sourceRequestDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, sourceRequestProjection)),
	)
	sourceReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": descriptorDigest, "targetId": fixture.targetID,
		"targetDigest": fixture.targetDigest, "capabilityProfileId": fixture.capabilityProfileID,
		"capabilityProfileDigest":    fixture.capabilityProfileDigest,
		"capabilityDescriptorDigest": fixture.capabilityDescriptorDigest,
		"capabilityId":               fixture.capabilityID, "supportExpectation": "required", "turnIndex": 0,
		"invocationId": invocationID, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID, "modelId": fixture.modelID,
		"modelLineageDigest": fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"providerRequestDigest": providerRequestDigest, "responseDigest": responseDigest,
		"dispatchIntentDigest":                dispatchIntentDigest,
		"transportReceiptDigest":              localTransportReceiptDigest,
		"resultSpoolReceiptDigest":            localResultSpoolReceiptDigest,
		"normalizedEventSetDigest":            localNormalizedEventSetDigest,
		"targetAuthorityDigest":               fixture.runtimeFactSourceAuthorityDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceAuthorityRouteBinding":         fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"sourceKind":                          "sealed-provider-response-metadata", "sourceDigest": sourceDigest,
		"ownerRequestDigest":        owner.ownerRequestDigest,
		"ownerReceiptDigest":        owner.ownerReceiptDigest,
		"ownerStageDigest":          owner.ownerStageDigest,
		"ownerDispatchAckDigest":    owner.ownerDispatchAckDigest,
		"preEffectIntentDigest":     owner.preEffectIntentDigest,
		"effectSourceReceiptDigest": owner.effectSourceReceiptDigest,
		"effectSourceFactDigest":    owner.effectSourceFactDigest,
		"businessResultDigest":      owner.businessResultDigest,
		"sourceRequestDigest":       sourceRequestDigest, "outcome": "observed",
		"observedAt": observedAt.Format("2006-01-02T15:04:05.000Z"),
		"sealedAt":   sourceSealedAt.Format("2006-01-02T15:04:05.000Z"),
		"fact":       fact,
	}
	buildSourceReceipt := func(base map[string]any) (string, []byte) {
		t.Helper()
		digest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, base)))
		receipt := attemptAuthorityMigrationCloneObject(t, base)
		receipt["sourceSealDigest"] = digest
		return digest, attemptAuthorityMigrationJSON(t, receipt)
	}
	sourceSealDigest, sourceReceiptBytes := buildSourceReceipt(sourceReceiptBase)
	insertSource := func(
		registrationReceiptDigest string,
		ownerRequestDigest string,
		sealDigest string,
		receiptBytes []byte,
		resultSpoolReceiptDigest any,
	) error {
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_optional_capability_fact_sources (
			namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,
			target_digest,capability_profile_id,capability_profile_digest,capability_descriptor_digest,
			capability_id,support_expectation,turn_index,invocation_id,protocol_family,
			provider_configuration_id,model_id,model_lineage_digest,adapter_digest,
			provider_request_digest,response_digest,dispatch_intent_digest,transport_receipt_digest,
			result_spool_receipt_digest,normalized_event_set_digest,source_request_digest,
			target_authority_digest,
			source_authority_id,source_authority_implementation_digest,source_authority_route_binding,
			registration_authority_issuer_id,registration_receipt_digest,source_kind,source_digest,
			source_owner_request_digest,source_owner_receipt_digest,source_owner_stage_digest,
			source_owner_dispatch_ack_digest,source_pre_effect_intent_digest,
			source_pre_effect_intent_json,source_pre_effect_intent_bytes,source_effect_receipt_digest,
			provider_runtime_journal_result_record_digest,provider_runtime_result_seal_receipt_digest,
			source_effect_receipt_json,source_effect_receipt_bytes,source_effect_fact_digest,
			source_business_result_digest,fact_kind,fact_digest,fact_json,fact_bytes,
			source_seal_digest,source_receipt_json,source_receipt_bytes,sealed_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'required',0,$12,$13,$14,$15,$16,$17,
			$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
			'sealed-provider-response-metadata',$31,$32,$33,$34,$35,$36,$37::jsonb,$38,$39,
			$40,$41,$42::jsonb,$43,$44,$45,'provider-job-receipt',$46,$47::jsonb,$48,$49,
			$50::jsonb,$51,$52)`, fixture.namespaceID, fixture.planDigest,
			fixture.repositoryCommit, attemptID, descriptorDigest, fixture.targetID, fixture.targetDigest,
			fixture.capabilityProfileID, fixture.capabilityProfileDigest,
			fixture.capabilityDescriptorDigest, fixture.capabilityID, invocationID,
			fixture.protocolFamily, fixture.providerConfigurationID, fixture.modelID,
			fixture.modelLineageDigest, fixture.adapterDigest, providerRequestDigest, responseDigest,
			dispatchIntentDigest, localTransportReceiptDigest, resultSpoolReceiptDigest,
			localNormalizedEventSetDigest, sourceRequestDigest, fixture.runtimeFactSourceAuthorityDigest,
			fixture.runtimeSourceAuthorityID, fixture.ownerImplementationDigest,
			fixture.runtimeSourceRouteBinding, fixture.registrationAuthorityIssuerID,
			registrationReceiptDigest, sourceDigest, ownerRequestDigest,
			owner.ownerReceiptDigest, owner.ownerStageDigest, owner.ownerDispatchAckDigest,
			owner.preEffectIntentDigest, string(owner.preEffectIntentBytes), owner.preEffectIntentBytes,
			owner.effectSourceReceiptDigest, owner.providerRuntimeJournalResultRecordDigest,
			owner.providerRuntimeResultSealReceiptDigest, string(owner.effectSourceReceiptBytes),
			owner.effectSourceReceiptBytes, owner.effectSourceFactDigest, owner.businessResultDigest,
			providerJobDigest, string(factBytes), factBytes, sealDigest, string(receiptBytes),
			receiptBytes, sourceSealedAt)
		return err
	}
	tamperedRegistrationReceipt := attemptAuthorityMigrationDigest("swapped-runtime-source-registration")
	tamperedSourceBase := attemptAuthorityMigrationCloneObject(t, sourceReceiptBase)
	tamperedSourceBase["registrationReceiptDigest"] = tamperedRegistrationReceipt
	tamperedSourceSeal, tamperedSourceBytes := buildSourceReceipt(tamperedSourceBase)
	if err := insertSource(
		tamperedRegistrationReceipt, owner.ownerRequestDigest, tamperedSourceSeal, tamperedSourceBytes,
		localResultSpoolReceiptDigest,
	); err == nil {
		t.Fatal("observed optional-fact source accepted a recomputed swapped owner registration")
	}
	tamperedOwnerRequestBase := attemptAuthorityMigrationCloneObject(t, sourceReceiptBase)
	tamperedOwnerRequestBase["ownerRequestDigest"] = owner.ownerIdentityDigest
	tamperedOwnerRequestSeal, tamperedOwnerRequestBytes := buildSourceReceipt(tamperedOwnerRequestBase)
	if err := insertSource(
		fixture.registrationReceiptDigest, owner.ownerIdentityDigest,
		tamperedOwnerRequestSeal, tamperedOwnerRequestBytes,
		localResultSpoolReceiptDigest,
	); err == nil {
		t.Fatal("observed optional-fact source accepted the pre-effect identity as its journal request")
	}
	tamperedObservedAtBase := attemptAuthorityMigrationCloneObject(t, sourceReceiptBase)
	tamperedObservedAtBase["observedAt"] = rawCompletedAt.Format("2006-01-02T15:04:05.000Z")
	tamperedObservedAtSeal, tamperedObservedAtBytes := buildSourceReceipt(tamperedObservedAtBase)
	if err := insertSource(
		fixture.registrationReceiptDigest, owner.ownerRequestDigest,
		tamperedObservedAtSeal, tamperedObservedAtBytes,
		localResultSpoolReceiptDigest,
	); err == nil {
		t.Fatal("observed optional-fact source accepted a recomputed owner observation time swap")
	}
	nullSpoolSourceBase := attemptAuthorityMigrationCloneObject(t, sourceReceiptBase)
	nullSpoolSourceBase["resultSpoolReceiptDigest"] = nil
	nullSpoolSourceSeal, nullSpoolSourceBytes := buildSourceReceipt(nullSpoolSourceBase)
	if err := insertSource(
		fixture.registrationReceiptDigest, owner.ownerRequestDigest,
		nullSpoolSourceSeal, nullSpoolSourceBytes, nil,
	); err == nil {
		t.Fatal("observed optional-fact source accepted a null inner result spool receipt")
	}
	if err := insertSource(
		fixture.registrationReceiptDigest, owner.ownerRequestDigest, sourceSealDigest, sourceReceiptBytes,
		localResultSpoolReceiptDigest,
	); err != nil {
		t.Fatalf("store observed optional-fact source: %v", err)
	}

	stageRequest := func(sealDigest string) (string, []byte) {
		request := map[string]any{
			"format":  "prodivix.agent-evaluation-optional-capability-fact-authority-stage-request",
			"version": 1, "planDigest": fixture.planDigest,
			"repositoryCommit": fixture.repositoryCommit, "attemptId": attemptID,
			"descriptorDigest": descriptorDigest, "turnIndex": 0, "sourceSealDigest": sealDigest,
		}
		bytesValue := attemptAuthorityMigrationJSON(t, request)
		return attemptAuthorityMigrationDigest(string(bytesValue)), bytesValue
	}
	stageFence := func(requestDigest string) string {
		return attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, map[string]any{
			"format": "prodivix.agent-evaluation-optional-capability-fact-authority-stage", "version": 1,
			"authorityRequestDigest":              requestDigest,
			"targetAuthorityDigest":               fixture.runtimeFactSourceAuthorityDigest,
			"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
			"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
			"sourceAuthorityRouteBinding":         fixture.runtimeSourceRouteBinding,
			"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
			"registrationReceiptDigest":           fixture.registrationReceiptDigest,
			"sourceKind":                          "sealed-provider-response-metadata", "sourceDigest": sourceDigest,
		})))
	}
	authorityRequestDigest, authorityRequestBytes := stageRequest(sourceSealDigest)
	stageDigest := stageFence(authorityRequestDigest)
	stageAuthority := func(
		sealDigest, requestDigest, fence string,
		requestBytes []byte,
		stageTime time.Time,
	) error {
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_optional_fact_authorities (
			namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,
			target_digest,capability_profile_id,capability_profile_digest,capability_descriptor_digest,
			capability_id,support_expectation,turn_index,invocation_id,protocol_family,
			provider_configuration_id,model_id,model_lineage_digest,adapter_digest,
			provider_request_digest,response_digest,dispatch_intent_digest,transport_receipt_digest,
			result_spool_receipt_digest,normalized_event_set_digest,target_authority_digest,
			source_authority_id,source_authority_implementation_digest,source_authority_route_binding,
			source_registration_authority_issuer_id,source_registration_receipt_digest,
			source_kind,source_digest,source_seal_digest,authority_request_digest,state,
			claim_generation,v45_eligible,stage_digest,staged_at,
			source_owner_request_digest,source_owner_receipt_digest,
			source_owner_stage_digest,source_owner_dispatch_ack_digest,
			source_pre_effect_intent_digest,source_effect_receipt_digest,
			source_effect_fact_digest,source_business_result_digest,request_json,request_bytes
		) SELECT source.namespace_id,source.plan_digest,source.repository_commit,source.attempt_id,
			source.descriptor_digest,source.target_id,source.target_digest,source.capability_profile_id,
			source.capability_profile_digest,source.capability_descriptor_digest,source.capability_id,
			source.support_expectation,source.turn_index,source.invocation_id,source.protocol_family,
			source.provider_configuration_id,source.model_id,source.model_lineage_digest,
			source.adapter_digest,source.provider_request_digest,source.response_digest,
			source.dispatch_intent_digest,source.transport_receipt_digest,
			source.result_spool_receipt_digest,source.normalized_event_set_digest,
			source.target_authority_digest,source.source_authority_id,
			source.source_authority_implementation_digest,source.source_authority_route_binding,
			source.registration_authority_issuer_id,source.registration_receipt_digest,
			source.source_kind,source.source_digest,$4,$5,'staged',1,TRUE,$6,$7,
			source.source_owner_request_digest,source.source_owner_receipt_digest,
			source.source_owner_stage_digest,source.source_owner_dispatch_ack_digest,
			source.source_pre_effect_intent_digest,source.source_effect_receipt_digest,
			source.source_effect_fact_digest,source.source_business_result_digest,$8::jsonb,$9
		FROM agent_evaluation_optional_capability_fact_sources source
		WHERE source.namespace_id=$1 AND source.plan_digest=$2 AND source.repository_commit=$3
			AND source.source_seal_digest=$10`, fixture.namespaceID, fixture.planDigest,
			fixture.repositoryCommit, sealDigest, requestDigest, fence, stageTime,
			string(requestBytes), requestBytes, sourceSealDigest)
		return err
	}
	fakeSourceSeal := attemptAuthorityMigrationDigest("swapped-observed-optional-source-seal")
	fakeRequestDigest, fakeRequestBytes := stageRequest(fakeSourceSeal)
	if err := stageAuthority(
		fakeSourceSeal, fakeRequestDigest, stageFence(fakeRequestDigest), fakeRequestBytes, stagedAt,
	); err == nil {
		t.Fatal("observed optional-fact authority staged against a recomputed fake source seal")
	}
	if err := stageAuthority(
		sourceSealDigest, authorityRequestDigest, stageDigest, authorityRequestBytes,
		sourceSealedAt.Add(-time.Millisecond),
	); err == nil {
		t.Fatal("observed optional-fact authority staged before its sealed source")
	}
	if err := stageAuthority(
		sourceSealDigest, authorityRequestDigest, stageDigest, authorityRequestBytes, stagedAt,
	); err != nil {
		t.Fatalf("stage observed optional-fact authority: %v", err)
	}

	dispatchAckBase := map[string]any{
		"format":  "prodivix.agent-evaluation-optional-capability-fact-authority-dispatch-ack",
		"version": 1, "authorityRequestDigest": authorityRequestDigest, "stageDigest": stageDigest,
		"targetAuthorityDigest":               fixture.runtimeFactSourceAuthorityDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceAuthorityRouteBinding":         fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"sourceKind":                          "sealed-provider-response-metadata", "sourceDigest": sourceDigest,
		"outcome": "observed", "observedAt": observedAt.Format("2006-01-02T15:04:05.000Z"),
		"factKind": "provider-job-receipt", "factDigest": providerJobDigest,
	}
	dispatchAckDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, dispatchAckBase)),
	)
	runtimeEnvelopeBase := map[string]any{
		"format": "prodivix.agent-evaluation-provider-capability-runtime-fact-envelope", "version": 1,
		"sourceAuthorityKind":                 "shared-durable-capability",
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceKind":                          "sealed-provider-response-metadata",
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"runtimeFactSourceAuthorityDigest":    fixture.runtimeFactSourceAuthorityDigest,
		"stageDigest":                         owner.ownerStageDigest,
		"dispatchAckDigest":                   owner.ownerDispatchAckDigest,
		"planDigest":                          fixture.planDigest, "repositoryCommit": fixture.repositoryCommit,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": 0,
		"invocationId": invocationID, "requestDigest": providerRequestDigest,
		"responseDigest": responseDigest, "protocolFamily": fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID,
		"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
		"dispatchIntentDigest":     dispatchIntentDigest,
		"transportReceiptDigest":   localTransportReceiptDigest,
		"resultSpoolReceiptDigest": localResultSpoolReceiptDigest,
		"normalizedEventSetDigest": localNormalizedEventSetDigest,
		"observedAt":               observedAt.Format("2006-01-02T15:04:05.000Z"), "fact": fact,
	}
	runtimeEnvelopeDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, runtimeEnvelopeBase)),
	)
	runtimeEnvelope := attemptAuthorityMigrationCloneObject(t, runtimeEnvelopeBase)
	runtimeEnvelope["envelopeDigest"] = runtimeEnvelopeDigest
	runtimeEnvelopeBytes := attemptAuthorityMigrationJSON(t, runtimeEnvelope)
	factAuthorityBase := map[string]any{
		"format": "prodivix.agent-evaluation-provider-capability-fact-authority", "version": 1,
		"factKind": "provider-job-receipt", "factDigest": providerJobDigest,
		"sourceAuthorityKind":                 "shared-durable-capability",
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"sourceKind":                          "sealed-provider-response-metadata",
		"routeBinding":                        fixture.runtimeSourceRouteBinding,
		"registrationAuthorityIssuerId":       fixture.registrationAuthorityIssuerID,
		"registrationReceiptDigest":           fixture.registrationReceiptDigest,
		"runtimeFactSourceAuthorityDigest":    fixture.runtimeFactSourceAuthorityDigest,
		"stageDigest":                         owner.ownerStageDigest,
		"dispatchAckDigest":                   owner.ownerDispatchAckDigest,
		"transportReceiptDigest":              localTransportReceiptDigest,
		"resultSpoolReceiptDigest":            localResultSpoolReceiptDigest,
		"normalizedEventSetDigest":            localNormalizedEventSetDigest,
		"runtimeFactEnvelopeDigest":           runtimeEnvelopeDigest,
	}
	factAuthorityDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, factAuthorityBase)),
	)
	factAuthority := attemptAuthorityMigrationCloneObject(t, factAuthorityBase)
	factAuthority["authorityDigest"] = factAuthorityDigest
	factAuthorityBytes := attemptAuthorityMigrationJSON(t, factAuthority)
	responseBase := map[string]any{
		"format":  "prodivix.agent-evaluation-optional-capability-fact-authority-response",
		"version": 1, "outcome": "observed", "authorityRequestDigest": authorityRequestDigest,
		"sourceAuthorityId":                   fixture.runtimeSourceAuthorityID,
		"sourceAuthorityImplementationDigest": fixture.ownerImplementationDigest,
		"stageDigest":                         stageDigest, "dispatchAckDigest": dispatchAckDigest,
		"runtimeFactEnvelopes": []any{runtimeEnvelope}, "factAuthorities": []any{factAuthority},
	}
	resultDigest := attemptAuthorityMigrationDigest(string(attemptAuthorityMigrationJSON(t, responseBase)))
	response := attemptAuthorityMigrationCloneObject(t, responseBase)
	response["resultDigest"] = resultDigest
	responseBytes := attemptAuthorityMigrationJSON(t, response)
	sealAuthority := func(
		ackDigest string,
		envelopeDigest string,
		authorityDigest string,
		resultDigest string,
		envelopeBytes []byte,
		authorityBytes []byte,
		responseBytes []byte,
	) error {
		_, err := db.ExecContext(ctx, `UPDATE agent_evaluation_optional_fact_authorities SET
		state='sealed',outcome='observed',fact_kind='provider-job-receipt',fact_digest=$4,
		dispatch_ack_digest=$5,runtime_fact_envelope_digest=$6,fact_authority_digest=$7,
		result_digest=$8,sealed_at=$9,fact_json=$10::jsonb,fact_bytes=$11,
		runtime_fact_envelope_json=$12::jsonb,runtime_fact_envelope_bytes=$13,
		fact_authority_json=$14::jsonb,fact_authority_bytes=$15,
		response_json=$16::jsonb,response_bytes=$17
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND attempt_id=$18 AND turn_index=0`, fixture.namespaceID, fixture.planDigest,
			fixture.repositoryCommit, providerJobDigest, ackDigest, envelopeDigest,
			authorityDigest, resultDigest, sealedAt, string(factBytes), factBytes,
			string(envelopeBytes), envelopeBytes, string(authorityBytes), authorityBytes,
			string(responseBytes), responseBytes, attemptID)
		return err
	}

	swappedAckBase := attemptAuthorityMigrationCloneObject(t, dispatchAckBase)
	swappedAckBase["observedAt"] = sealedAt.Format("2006-01-02T15:04:05.000Z")
	swappedAckDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, swappedAckBase)),
	)
	swappedEnvelopeBase := attemptAuthorityMigrationCloneObject(t, runtimeEnvelopeBase)
	swappedEnvelopeBase["observedAt"] = sealedAt.Format("2006-01-02T15:04:05.000Z")
	swappedEnvelopeDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, swappedEnvelopeBase)),
	)
	swappedEnvelope := attemptAuthorityMigrationCloneObject(t, swappedEnvelopeBase)
	swappedEnvelope["envelopeDigest"] = swappedEnvelopeDigest
	swappedEnvelopeBytes := attemptAuthorityMigrationJSON(t, swappedEnvelope)
	swappedFactAuthorityBase := attemptAuthorityMigrationCloneObject(t, factAuthorityBase)
	swappedFactAuthorityBase["runtimeFactEnvelopeDigest"] = swappedEnvelopeDigest
	swappedFactAuthorityDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, swappedFactAuthorityBase)),
	)
	swappedFactAuthority := attemptAuthorityMigrationCloneObject(t, swappedFactAuthorityBase)
	swappedFactAuthority["authorityDigest"] = swappedFactAuthorityDigest
	swappedFactAuthorityBytes := attemptAuthorityMigrationJSON(t, swappedFactAuthority)
	swappedResponseBase := attemptAuthorityMigrationCloneObject(t, responseBase)
	swappedResponseBase["dispatchAckDigest"] = swappedAckDigest
	swappedResponseBase["runtimeFactEnvelopes"] = []any{swappedEnvelope}
	swappedResponseBase["factAuthorities"] = []any{swappedFactAuthority}
	swappedResultDigest := attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, swappedResponseBase)),
	)
	swappedResponse := attemptAuthorityMigrationCloneObject(t, swappedResponseBase)
	swappedResponse["resultDigest"] = swappedResultDigest
	swappedResponseBytes := attemptAuthorityMigrationJSON(t, swappedResponse)
	if err := sealAuthority(
		swappedAckDigest, swappedEnvelopeDigest, swappedFactAuthorityDigest,
		swappedResultDigest, swappedEnvelopeBytes, swappedFactAuthorityBytes, swappedResponseBytes,
	); err == nil {
		t.Fatal("observed optional-fact authority accepted a fully recomputed source observedAt swap")
	}
	if err := sealAuthority(
		dispatchAckDigest, runtimeEnvelopeDigest, factAuthorityDigest, resultDigest,
		runtimeEnvelopeBytes, factAuthorityBytes, responseBytes,
	); err != nil {
		t.Fatalf("seal observed optional-fact authority: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_optional_fact_authorities
		SET dispatch_ack_digest=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND attempt_id=$5 AND turn_index=0`, fixture.namespaceID, fixture.planDigest,
		fixture.repositoryCommit, attemptAuthorityMigrationDigest("late-observed-optional-ack"),
		attemptID); err == nil {
		t.Fatal("sealed observed optional-fact authority accepted a late acknowledgement swap")
	}

	attemptDigest := attemptAuthorityMigrationDigest("v45-optional-observed-attempt")
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_attempts (
		namespace_id,plan_digest,attempt_id,descriptor_digest,sampling_identity_digest,
		independent_run_id,shard_id,case_id,target_id,status,outcome,attempt_digest,
		attempt_json,attempt_bytes,started_at,completed_at
	) VALUES ($1,$2,$3,$4,$5,'independent-run.v45.optional','shard.v45.optional',
		'case.v45.optional',$6,'completed','passed',$7,$8::jsonb,$9,$10,$11)`,
		fixture.namespaceID, fixture.planDigest, attemptID, descriptorDigest,
		attemptAuthorityMigrationDigest("v45-optional-observed-sampling"), fixture.targetID,
		attemptDigest, `{"attempt":"optional-observed"}`, []byte(`{"attempt":"optional-observed"}`),
		rawCreatedAt, sealedAt.Add(time.Second)); err != nil {
		t.Fatalf("store observed optional-fact attempt: %v", err)
	}

	recomputeFactAuthority := func(base map[string]any, field string, value any) map[string]any {
		t.Helper()
		mutated := attemptAuthorityMigrationCloneObject(t, base)
		mutated[field] = value
		mutated["authorityDigest"] = attemptAuthorityMigrationDigest(
			string(attemptAuthorityMigrationJSON(t, mutated)),
		)
		return mutated
	}
	legacyFactAuthority := attemptAuthorityMigrationCloneObject(t, factAuthorityBase)
	for _, field := range []string{
		"sourceKind", "routeBinding", "registrationAuthorityIssuerId",
		"registrationReceiptDigest", "runtimeFactSourceAuthorityDigest",
	} {
		delete(legacyFactAuthority, field)
	}
	legacyFactAuthority["authorityDigest"] = attemptAuthorityMigrationDigest(
		string(attemptAuthorityMigrationJSON(t, legacyFactAuthority)),
	)
	insertObservation := func(label string, authority map[string]any) error {
		t.Helper()
		runtimeDigest := authority["runtimeFactEnvelopeDigest"].(string)
		authorityDigest := authority["authorityDigest"].(string)
		selectedEnvelopeSetDigest := attemptAuthorityMigrationDigest(
			string(attemptAuthorityMigrationJSON(t, map[string]any{
				"runtimeFactEnvelopeDigests": []any{runtimeDigest},
			})),
		)
		sourceAuthoritySetDigest := attemptAuthorityMigrationDigest(
			string(attemptAuthorityMigrationJSON(t, map[string]any{
				"authorityDigests": []any{authorityDigest},
			})),
		)
		observationProjection := map[string]any{
			"planDigest": fixture.planDigest, "repositoryCommit": fixture.repositoryCommit,
			"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": 0,
			"invocationId": invocationID, "requestDigest": providerRequestDigest,
			"responseDigest": responseDigest, "protocolFamily": fixture.protocolFamily,
			"providerConfigurationId": fixture.providerConfigurationID,
			"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
			"dispatchIntentDigest":                 dispatchIntentDigest,
			"transportReceiptDigest":               transportReceiptDigest,
			"resultSpoolReceiptDigest":             resultSpoolReceiptDigest,
			"normalizedEventSetDigest":             normalizedEventSetDigest,
			"selectedRuntimeFactEnvelopeSetDigest": selectedEnvelopeSetDigest,
			"sourceAuthoritySetDigest":             sourceAuthoritySetDigest,
			"factDigests": []any{map[string]any{
				"factKind": "provider-job-receipt", "factDigest": providerJobDigest,
			}},
			"factAuthorityDigests": []any{map[string]any{
				"factKind": "provider-job-receipt", "factDigest": providerJobDigest,
				"authorityDigest": authorityDigest,
			}},
		}
		observationDigest := attemptAuthorityMigrationDigest(
			string(attemptAuthorityMigrationJSON(t, observationProjection)),
		)
		receiptBase := map[string]any{
			"format": "prodivix.agent-evaluation-provider-capability-observation-receipt", "version": 1,
			"observationReceiptId": "observation.v45.optional." + label,
			"planDigest":           fixture.planDigest, "repositoryCommit": fixture.repositoryCommit,
			"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": 0,
			"invocationId": invocationID, "requestDigest": providerRequestDigest,
			"responseDigest": responseDigest, "protocolFamily": fixture.protocolFamily,
			"providerConfigurationId": fixture.providerConfigurationID,
			"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
			"dispatchIntentDigest":     dispatchIntentDigest,
			"transportReceiptDigest":   transportReceiptDigest,
			"resultSpoolReceiptDigest": resultSpoolReceiptDigest,
			"normalizedEventSetDigest": normalizedEventSetDigest,
			"facts":                    []any{fact}, "factAuthorities": []any{authority},
			"selectedRuntimeFactEnvelopeSetDigest": selectedEnvelopeSetDigest,
			"sourceAuthoritySetDigest":             sourceAuthoritySetDigest,
			"observationDigest":                    observationDigest,
			"observedAt":                           observedAt.Format("2006-01-02T15:04:05.000Z"),
		}
		receiptDigest := attemptAuthorityMigrationDigest(
			string(attemptAuthorityMigrationJSON(t, receiptBase)),
		)
		receipt := attemptAuthorityMigrationCloneObject(t, receiptBase)
		receipt["receiptDigest"] = receiptDigest
		receiptBytes := attemptAuthorityMigrationJSON(t, receipt)
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_capability_observation_receipts (
			namespace_id,plan_digest,repository_commit,observation_receipt_id,attempt_id,
			descriptor_digest,turn_index,invocation_id,request_digest,response_digest,
			protocol_family,provider_configuration_id,model_lineage_digest,adapter_digest,
			dispatch_intent_digest,transport_receipt_digest,result_spool_receipt_digest,
			normalized_event_set_digest,selected_runtime_fact_envelope_set_digest,
			source_authority_set_digest,observation_digest,observed_at,receipt_digest,
			receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
			$18,$19,$20,$21,$22,$23::jsonb,$24)`, fixture.namespaceID, fixture.planDigest,
			fixture.repositoryCommit, receiptBase["observationReceiptId"], attemptID,
			descriptorDigest, invocationID, providerRequestDigest, responseDigest,
			fixture.protocolFamily, fixture.providerConfigurationID, fixture.modelLineageDigest,
			fixture.adapterDigest, dispatchIntentDigest, transportReceiptDigest,
			resultSpoolReceiptDigest, normalizedEventSetDigest, selectedEnvelopeSetDigest,
			sourceAuthoritySetDigest, observationDigest, observedAt, receiptDigest,
			string(receiptBytes), receiptBytes)
		return err
	}
	if err := insertObservation("legacy-14-key-authority", legacyFactAuthority); err == nil {
		t.Fatal("provider observation accepted the legacy 14-key fact authority")
	}
	for _, testCase := range []struct {
		label string
		field string
		value any
	}{
		{label: "swapped-stage", field: "stageDigest", value: attemptAuthorityMigrationDigest("swapped-observation-stage")},
		{label: "swapped-ack", field: "dispatchAckDigest", value: attemptAuthorityMigrationDigest("swapped-observation-ack")},
		{label: "swapped-local-transport", field: "transportReceiptDigest", value: attemptAuthorityMigrationDigest("swapped-observation-local-transport")},
		{label: "swapped-local-spool", field: "resultSpoolReceiptDigest", value: attemptAuthorityMigrationDigest("swapped-observation-local-spool")},
		{label: "swapped-local-events", field: "normalizedEventSetDigest", value: attemptAuthorityMigrationDigest("swapped-observation-local-events")},
		{label: "swapped-runtime-envelope", field: "runtimeFactEnvelopeDigest", value: attemptAuthorityMigrationDigest("swapped-observation-runtime-envelope")},
		{label: "swapped-fact-authority", field: "sourceAuthorityId", value: "authority.runtime-fact-source.swapped"},
		{label: "swapped-source-kind", field: "sourceKind", value: "sealed-hosted-owner-result"},
		{label: "swapped-route-binding", field: "routeBinding", value: "runtime-fact-source.swapped"},
		{label: "swapped-registration-issuer", field: "registrationAuthorityIssuerId", value: "authority.runtime-fact-registration.swapped"},
		{label: "swapped-registration-receipt", field: "registrationReceiptDigest", value: attemptAuthorityMigrationDigest("swapped-observation-registration-receipt")},
		{label: "swapped-runtime-source-authority", field: "runtimeFactSourceAuthorityDigest", value: attemptAuthorityMigrationDigest("swapped-observation-runtime-source-authority")},
	} {
		mutated := recomputeFactAuthority(factAuthorityBase, testCase.field, testCase.value)
		if err := insertObservation(testCase.label, mutated); err == nil {
			t.Fatalf("provider observation accepted %s with recomputed outer commitments", testCase.label)
		}
	}
	if err := insertObservation("valid", factAuthority); err != nil {
		t.Fatalf("store provider observation with exact shared durable authority: %v", err)
	}
	var observationCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*)
		FROM agent_evaluation_provider_capability_observation_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND attempt_id=$4`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, attemptID).Scan(
		&observationCount,
	); err != nil {
		t.Fatalf("read exact observed optional-fact observation: %v", err)
	}
	if observationCount != 1 {
		t.Fatalf("observed optional-fact observation count = %d, want 1", observationCount)
	}
	var observationReceiptDigest string
	if err := db.QueryRowContext(ctx, `SELECT receipt_digest
		FROM agent_evaluation_provider_capability_observation_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND attempt_id=$4`,
		fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, attemptID,
	).Scan(&observationReceiptDigest); err != nil {
		t.Fatalf("read shared-effect observation receipt for capability input: %v", err)
	}
	inputIssuedAt := time.Now().UTC().Truncate(time.Millisecond)
	inputDescriptor := map[string]any{
		"attemptId": attemptID, "planDigest": fixture.planDigest,
		"targetId": fixture.targetID, "targetDigest": fixture.targetDigest,
		"descriptorDigest": descriptorDigest,
	}
	requestRefSeed := buildV45CapabilityEffectRequestRefSeed(t, v45CapabilityEffectRequestRefSeed{
		namespaceID: fixture.namespaceID, planDigest: fixture.planDigest,
		repositoryCommit: fixture.repositoryCommit, attemptID: attemptID,
		descriptorDigest: descriptorDigest, turnIndex: 1,
		invocationID: "invocation.v45.capability-effect.provider-job",
		bindingKind:  "provider-job", capabilityID: fixture.capabilityID,
		toolID: "provider.background-job.poll", targetRef: "target-ref.v45.provider-job",
		protocolFamily: fixture.protocolFamily, providerConfigurationID: fixture.providerConfigurationID,
		modelLineageDigest: fixture.modelLineageDigest, adapterDigest: fixture.adapterDigest,
		runtimeFactSourceAuthorityDigest:       fixture.runtimeFactSourceAuthorityDigest,
		registrationReceiptDigest:              fixture.registrationReceiptDigest,
		issuedAt:                               inputIssuedAt,
		expiresAt:                              inputIssuedAt.Add(2 * time.Minute),
		selectedSourceObservationReceiptDigest: observationReceiptDigest,
		selectedSourceHandleDigest:             providerJobDigest,
	}, inputDescriptor)
	missingSource := requestRefSeed
	missingSource.selectedSourceObservationReceiptDigest = ""
	missingSource.selectedSourceHandleDigest = ""
	if err := insertV45CapabilityEffectRequestRefSeed(db, missingSource); err == nil {
		t.Fatal("provider-job request-ref accepted a missing immutable prior source selection")
	}
	swappedSource := requestRefSeed
	swappedSource.selectedSourceHandleDigest = attemptAuthorityMigrationDigest("swapped-capability-effect-source-handle")
	if err := insertV45CapabilityEffectRequestRefSeed(db, swappedSource); err == nil {
		t.Fatal("provider-job request-ref accepted a swapped prior source fact")
	}
	collapsedTarget := requestRefSeed
	collapsedTarget.targetRef = providerJobDigest
	collapsedTarget = buildV45CapabilityEffectRequestRefSeed(t, collapsedTarget, inputDescriptor)
	if err := insertV45CapabilityEffectRequestRefSeed(db, collapsedTarget); err == nil {
		t.Fatal("provider-job request-ref collapsed the business target into its hidden source handle")
	}
	if err := insertV45CapabilityEffectRequestRefSeed(db, requestRefSeed); err != nil {
		t.Fatalf("store provider-job request-ref with hidden durable source selection: %v", err)
	}
	registryRequestedAt := inputIssuedAt.Add(30 * time.Second)
	registryRequestBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-input-authority-registry-request", "version": 1,
		"namespaceId": fixture.namespaceID, "planDigest": fixture.planDigest,
		"repositoryCommit":                 fixture.repositoryCommit,
		"requestRefAuthorityReceiptDigest": requestRefSeed.receiptDigest,
		"requestRef":                       requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef,
		"requestedAt": registryRequestedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	registryRequestDigest := attemptAuthorityMigrationCanonicalDigest(t, registryRequestBase)
	registryRequest := attemptAuthorityMigrationCloneObject(t, registryRequestBase)
	registryRequest["requestDigest"] = registryRequestDigest
	registryRequestBytes := attemptAuthorityMigrationCanonicalBytes(t, registryRequest)
	registryReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-input-authority-registry-receipt", "version": 1,
		"bindingKind": requestRefSeed.bindingKind, "capabilityId": requestRefSeed.capabilityID,
		"requestRef": requestRefSeed.requestRef, "targetRef": requestRefSeed.targetRef,
		"requestRefAuthority":              requestRefSeed.receipt,
		"requestRefAuthorityReceiptDigest": requestRefSeed.receiptDigest,
		"sourceAttemptId":                  attemptID, "sourceTurnIndex": 0, "sourceInvocationId": invocationID,
		"sourceProviderRequestDigest": providerRequestDigest, "sourceResponseDigest": responseDigest,
		"sourceDispatchIntentDigest":     dispatchIntentDigest,
		"sourceTransportReceiptDigest":   transportReceiptDigest,
		"sourceResultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"sourceNormalizedEventSetDigest": normalizedEventSetDigest,
		"sourceObservationReceiptDigest": observationReceiptDigest,
		"sourceFactKind":                 "provider-job-receipt", "sourceProviderEventType": nil,
		"sourceProviderToolCallId": nil, "sourceToolId": nil, "sourceArgumentsDigest": nil,
		"sourceHandleDigest":      providerJobDigest,
		"stateVaultSealRequest":   map[string]any{"unlinked": "seal-request"},
		"stateVaultSealReceipt":   map[string]any{"unlinked": "seal-receipt"},
		"protocolFamily":          fixture.protocolFamily,
		"providerConfigurationId": fixture.providerConfigurationID,
		"modelLineageDigest":      fixture.modelLineageDigest, "adapterDigest": fixture.adapterDigest,
	}
	insertRegistry := func(receiptBase map[string]any, sourceHandle string) error {
		receiptDigest := attemptAuthorityMigrationCanonicalDigest(t, receiptBase)
		receipt := attemptAuthorityMigrationCloneObject(t, receiptBase)
		receipt["receiptDigest"] = receiptDigest
		receiptBytes := attemptAuthorityMigrationCanonicalBytes(t, receipt)
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_effect_input_authority_registry_receipts (
			namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,
			request_ref_authority_receipt_digest,request_ref,target_ref,binding_kind,
			source_attempt_id,source_turn_index,source_invocation_id,source_observation_receipt_digest,
			source_handle_digest,requested_at,request_json,request_bytes,receipt_json,receipt_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,$15::jsonb,$16,$17::jsonb,$18)`,
			fixture.namespaceID, fixture.planDigest, fixture.repositoryCommit, registryRequestDigest,
			receiptDigest, requestRefSeed.receiptDigest, requestRefSeed.requestRef,
			requestRefSeed.targetRef, requestRefSeed.bindingKind, attemptID, invocationID,
			observationReceiptDigest, sourceHandle, registryRequestedAt, string(registryRequestBytes),
			registryRequestBytes, string(receiptBytes), receiptBytes)
		return err
	}
	legacyRegistryReceipt := attemptAuthorityMigrationCloneObject(t, registryReceiptBase)
	delete(legacyRegistryReceipt, "stateVaultSealRequest")
	delete(legacyRegistryReceipt, "stateVaultSealReceipt")
	if err := insertRegistry(legacyRegistryReceipt, providerJobDigest); err == nil {
		t.Fatal("provider-job input registry accepted the legacy 29-key receipt")
	}
	swappedRegistryReceipt := attemptAuthorityMigrationCloneObject(t, registryReceiptBase)
	swappedRegistryHandle := attemptAuthorityMigrationDigest("swapped-capability-effect-registry-handle")
	swappedRegistryReceipt["sourceHandleDigest"] = swappedRegistryHandle
	if err := insertRegistry(swappedRegistryReceipt, swappedRegistryHandle); err == nil {
		t.Fatal("provider-job input registry accepted a source-handle swap")
	}
	if err := insertRegistry(registryReceiptBase, providerJobDigest); err == nil {
		t.Fatal("provider-job input registry accepted a shared-effect fact without native bootstrap/vault lineage")
	}
}

type v45OwnerStateLifecycleFixture struct {
	ownerStateID              string
	stageDigest               string
	artifactRef               string
	artifactKind              string
	mediaType                 string
	artifactDigest            string
	artifactBytes             []byte
	artifactIdentityDigest    string
	uploadDigest              string
	casReceiptDigest          string
	descriptorDigest          string
	descriptor                map[string]any
	publicResult              map[string]any
	publicResultBytes         []byte
	responseDigest            string
	ownerStateRevision        int64
	ownerStateRootDigest      string
	ownerStateBundle          map[string]any
	ownerStateBundleBytes     []byte
	snapshotDigest            string
	dispatchAckDigest         string
	resultReceiptDigest       string
	sealedOperation           map[string]any
	sealedOperationBytes      []byte
	priorOwnerStateRevision   int64
	priorOwnerStateRootDigest string
}

func buildV45ControlledOwnerStateLifecycleFixture(
	t *testing.T,
	base v41AttemptAuthorityFixture,
	requestDigest string,
	ownerImplementationDigest string,
	attemptID string,
	attemptDescriptorDigest string,
	grantDigest string,
	generation int64,
	operation string,
	routeBinding string,
	artifactLabel string,
	priorRevision int64,
	priorRootDigest string,
) v45OwnerStateLifecycleFixture {
	t.Helper()
	identity := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-identity", "version": int64(1),
		"serviceKind": "controlled-workspace", "namespaceId": base.namespaceID,
		"planDigest": base.planDigest, "repositoryCommit": base.repositoryCommit,
		"attemptId": attemptID, "descriptorDigest": attemptDescriptorDigest,
		"generation": generation, "grantDigest": grantDigest,
	}
	ownerStateID := attemptAuthorityMigrationCanonicalDigest(t, identity)
	stage := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-stage", "version": int64(1),
		"serviceKind": "controlled-workspace", "operation": operation, "routeBinding": routeBinding,
		"requestDigest": requestDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"ownerStateId": ownerStateID, "priorOwnerStateRevision": priorRevision,
		"priorOwnerStateRootDigest": nil,
	}
	if priorRootDigest != "" {
		stage["priorOwnerStateRootDigest"] = priorRootDigest
	}
	stageDigest := attemptAuthorityMigrationCanonicalDigest(t, stage)
	artifactBytes := attemptAuthorityMigrationCanonicalBytes(t, map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-test-artifact", "version": int64(1),
		"artifactLabel": artifactLabel,
	})
	artifactDigestBytes := sha256.Sum256(artifactBytes)
	artifactDigest := "sha256-" + hex.EncodeToString(artifactDigestBytes[:])
	artifactRef := "owner-state-artifact." + artifactLabel
	artifactKind := "workspace-snapshot"
	mediaType := "application/json"
	artifactIdentity := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-cas-artifact-identity", "version": int64(1),
		"artifactRef": artifactRef, "artifactKind": artifactKind, "mediaType": mediaType,
		"artifactDigest": artifactDigest, "byteLength": int64(len(artifactBytes)),
	}
	artifactIdentityDigest := attemptAuthorityMigrationCanonicalDigest(t, artifactIdentity)
	uploadBase := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-cas-ingress", "version": int64(1),
		"serviceKind": "controlled-workspace", "requestDigest": requestDigest,
		"ownerImplementationDigest": ownerImplementationDigest, "stageDigest": stageDigest,
		"ownerStateId": ownerStateID, "artifactRef": artifactRef, "artifactKind": artifactKind,
		"mediaType": mediaType, "artifactDigest": artifactDigest, "byteLength": int64(len(artifactBytes)),
		"contentBase64":          base64.StdEncoding.EncodeToString(artifactBytes),
		"artifactIdentityDigest": artifactIdentityDigest,
	}
	uploadDigest := attemptAuthorityMigrationCanonicalDigest(t, uploadBase)
	casReceipt := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-cas-receipt", "version": int64(1),
		"serviceKind": "controlled-workspace", "requestDigest": requestDigest,
		"ownerImplementationDigest": ownerImplementationDigest, "stageDigest": stageDigest,
		"ownerStateId": ownerStateID, "artifactIdentityDigest": artifactIdentityDigest,
		"uploadDigest": uploadDigest,
	}
	casReceiptDigest := attemptAuthorityMigrationCanonicalDigest(t, casReceipt)
	descriptor := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-cas-descriptor", "version": int64(1),
		"artifactRef": artifactRef, "artifactKind": artifactKind, "mediaType": mediaType,
		"artifactDigest": artifactDigest, "byteLength": int64(len(artifactBytes)),
		"casReceiptDigest": casReceiptDigest,
	}
	casDescriptorDigest := attemptAuthorityMigrationSelfDigest(t, descriptor, "descriptorDigest")
	publicResult := map[string]any{"facts": []any{}}
	publicResultBytes := attemptAuthorityMigrationCanonicalBytes(t, publicResult)
	responseDigest := attemptAuthorityMigrationCanonicalDigest(t, publicResult)
	revision := priorRevision + 1
	workspaceSnapshot := map[string]any{"format": "owner-state-test-workspace", "revision": revision}
	toolDefinitions := []any{}
	actionRegistry := []any{}
	g3VerificationPlan := map[string]any{"format": "owner-state-test-g3-plan", "revision": revision}
	adapterRegistry := []any{}
	artifactDescriptors := []any{}
	initialCheckpoint := map[string]any{
		"checkpointRef": "checkpoint-owner-state-initial", "attemptId": attemptID,
		"grantDigest": grantDigest, "generation": generation,
		"snapshotDigest":                 attemptAuthorityMigrationDigest("owner-state-initial-checkpoint-snapshot"),
		"securePersistenceReceiptDigest": attemptAuthorityMigrationDigest("owner-state-initial-checkpoint-persistence"),
	}
	initialCheckpointDigest := attemptAuthorityMigrationSelfDigest(t, initialCheckpoint, "checkpointDigest")
	currentCheckpoint := map[string]any{
		"checkpointRef": "checkpoint-owner-state-" + artifactLabel, "attemptId": attemptID,
		"grantDigest": grantDigest, "generation": generation,
		"predecessorCheckpointDigest":    initialCheckpointDigest,
		"snapshotDigest":                 attemptAuthorityMigrationDigest(fmt.Sprintf("owner-state-checkpoint-snapshot-%d", revision)),
		"securePersistenceReceiptDigest": attemptAuthorityMigrationDigest(fmt.Sprintf("owner-state-checkpoint-persistence-%d", revision)),
	}
	currentCheckpointDigest := attemptAuthorityMigrationSelfDigest(t, currentCheckpoint, "checkpointDigest")
	snapshot := map[string]any{
		"format": "prodivix.agent-evaluation-controlled-workspace-owner-state-snapshot", "version": int64(1),
		"namespaceId": base.namespaceID, "planDigest": base.planDigest,
		"repositoryCommit": base.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": attemptDescriptorDigest, "caseId": "case-owner-state",
		"materialDigest": attemptAuthorityMigrationDigest("owner-state-material"),
		"fixtureDigest":  attemptAuthorityMigrationDigest("owner-state-fixture"),
		"grantDigest":    grantDigest, "generation": generation,
		"sessionId": "session-owner-state", "isolationPolicyDigest": attemptAuthorityMigrationDigest("owner-state-isolation"),
		"revision": revision, "state": "active",
		"initialCheckpoint":            initialCheckpoint,
		"initialCheckpointDigest":      initialCheckpointDigest,
		"currentCheckpoint":            currentCheckpoint,
		"currentCheckpointDigest":      currentCheckpointDigest,
		"workspaceSnapshot":            workspaceSnapshot,
		"workspaceSnapshotDigest":      attemptAuthorityMigrationCanonicalDigest(t, workspaceSnapshot),
		"toolDefinitions":              toolDefinitions,
		"toolDefinitionSetDigest":      attemptAuthorityMigrationCanonicalDigest(t, toolDefinitions),
		"actionRegistry":               actionRegistry,
		"actionRegistryDigest":         attemptAuthorityMigrationCanonicalDigest(t, actionRegistry),
		"g3VerificationPlan":           g3VerificationPlan,
		"verificationPlanDigest":       attemptAuthorityMigrationCanonicalDigest(t, g3VerificationPlan),
		"adapterRegistry":              adapterRegistry,
		"adapterRegistryDigest":        attemptAuthorityMigrationCanonicalDigest(t, adapterRegistry),
		"finalWorkspaceSnapshotDigest": nil,
		"artifactDescriptors":          artifactDescriptors,
		"artifactDescriptorSetDigest":  attemptAuthorityMigrationCanonicalDigest(t, artifactDescriptors),
		"finalAuthorityReceiptDigest":  nil, "cleanupReceiptDigest": nil,
	}
	snapshotDigest := attemptAuthorityMigrationSelfDigest(t, snapshot, "snapshotDigest")
	recentOperation := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-operation-record", "version": int64(1),
		"sequence": revision, "operation": operation, "routeBinding": routeBinding,
		"requestDigest": requestDigest, "stageDigest": stageDigest, "responseDigest": responseDigest,
	}
	attemptAuthorityMigrationSelfDigest(t, recentOperation, "recordDigest")
	casArtifacts := []any{descriptor}
	recentOperations := []any{recentOperation}
	bundle := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-bundle", "version": int64(1),
		"serviceKind": "controlled-workspace", "namespaceId": base.namespaceID,
		"planDigest": base.planDigest, "repositoryCommit": base.repositoryCommit,
		"ownerStateId": ownerStateID, "revision": revision,
		"previousOwnerStateRootDigest": nil, "snapshotKind": "controlled-workspace",
		"snapshot": snapshot, "snapshotDigest": snapshotDigest,
		"casArtifacts":             casArtifacts,
		"casArtifactSetDigest":     attemptAuthorityMigrationCanonicalDigest(t, casArtifacts),
		"recentOperations":         recentOperations,
		"recentOperationSetDigest": attemptAuthorityMigrationCanonicalDigest(t, recentOperations),
	}
	if priorRootDigest != "" {
		bundle["previousOwnerStateRootDigest"] = priorRootDigest
	}
	ownerStateRootDigest := attemptAuthorityMigrationCanonicalDigest(t, bundle)
	ownerStateBundleBytes := attemptAuthorityMigrationCanonicalBytes(t, bundle)
	dispatchAck := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-dispatch-ack", "version": int64(1),
		"serviceKind": "controlled-workspace", "operation": operation, "routeBinding": routeBinding,
		"requestDigest": requestDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"ownerStateId": ownerStateID, "priorOwnerStateRevision": priorRevision,
		"priorOwnerStateRootDigest": nil, "stageDigest": stageDigest,
		"responseDigest": responseDigest, "ownerStateRevision": revision,
		"ownerStateRootDigest": ownerStateRootDigest,
	}
	if priorRootDigest != "" {
		dispatchAck["priorOwnerStateRootDigest"] = priorRootDigest
	}
	dispatchAckDigest := attemptAuthorityMigrationCanonicalDigest(t, dispatchAck)
	sealed := map[string]any{
		"format": "prodivix.agent-evaluation-sealed-owner-operation", "version": int64(1),
		"serviceKind": "controlled-workspace", "operation": operation, "routeBinding": routeBinding,
		"requestDigest": requestDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"ownerStateId": ownerStateID, "priorOwnerStateRevision": priorRevision,
		"priorOwnerStateRootDigest": nil, "stageDigest": stageDigest,
		"publicResult": publicResult, "responseDigest": responseDigest,
		"ownerStateRevision": revision, "ownerStateRootDigest": ownerStateRootDigest,
		"dispatchAckDigest": dispatchAckDigest,
	}
	if priorRootDigest != "" {
		sealed["priorOwnerStateRootDigest"] = priorRootDigest
	}
	resultReceiptDigest := attemptAuthorityMigrationSelfDigest(t, sealed, "resultReceiptDigest")
	return v45OwnerStateLifecycleFixture{
		ownerStateID: ownerStateID, stageDigest: stageDigest,
		artifactRef: artifactRef, artifactKind: artifactKind, mediaType: mediaType,
		artifactDigest: artifactDigest, artifactBytes: artifactBytes,
		artifactIdentityDigest: artifactIdentityDigest, uploadDigest: uploadDigest,
		casReceiptDigest: casReceiptDigest, descriptorDigest: casDescriptorDigest, descriptor: descriptor,
		publicResult: publicResult, publicResultBytes: publicResultBytes, responseDigest: responseDigest,
		ownerStateRevision: revision, ownerStateRootDigest: ownerStateRootDigest,
		ownerStateBundle: bundle, ownerStateBundleBytes: ownerStateBundleBytes,
		snapshotDigest: snapshotDigest, dispatchAckDigest: dispatchAckDigest,
		resultReceiptDigest: resultReceiptDigest, sealedOperation: sealed,
		sealedOperationBytes:    attemptAuthorityMigrationCanonicalBytes(t, sealed),
		priorOwnerStateRevision: priorRevision, priorOwnerStateRootDigest: priorRootDigest,
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOwnerStateLifecycle(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	assertAgentEvaluationAttemptAuthorityV45Schema(t, db)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	base := seedV41AttemptAuthorityFixture(t, db, "claimed")
	attemptID := "attempt-owner-state-current"
	attemptDescriptorDigest := attemptAuthorityMigrationDigest("owner-state-attempt-descriptor")
	grantDigest := attemptAuthorityMigrationDigest("owner-state-grant")
	ownerImplementationDigest := attemptAuthorityMigrationDigest("owner-state-implementation")
	requestDigest := attemptAuthorityMigrationDigest("owner-state-request-1")
	operation := "session.load-or-reattach"
	routeBinding := "sessions/load-or-reattach"
	claimedAt := base.claimedAt.Add(30 * time.Minute)
	sealedAt := claimedAt.Add(3 * time.Second)
	fixture := buildV45ControlledOwnerStateLifecycleFixture(
		t, base, requestDigest, ownerImplementationDigest, attemptID, attemptDescriptorDigest,
		grantDigest, 1, operation, routeBinding, "bootstrap", 0, "",
	)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,grant_digest,generation,state,claim_generation,claimed_at
	) VALUES ($1,$2,$3,'controlled-workspace',$4,$5,$6,$7,$8,$9,$10,$11,1,'claimed',1,$12)`,
		base.namespaceID, base.planDigest, base.repositoryCommit, operation, routeBinding,
		requestDigest, attemptAuthorityMigrationDigest("owner-state-binding-1"), ownerImplementationDigest,
		attemptID, attemptDescriptorDigest, grantDigest, claimedAt); err != nil {
		t.Fatalf("claim current owner-state request: %v", err)
	}
	dispatchedAt := claimedAt.Add(time.Second)
	stageTx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := stageTx.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_state_operations (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,owner_implementation_digest,owner_state_id,prior_owner_state_revision,
		prior_owner_state_root_digest,stage_digest,state,staged_at
	) VALUES ($1,$2,$3,'controlled-workspace',$4,$5,$6,$7,$8,0,NULL,$9,'staged',$10)`,
		base.namespaceID, base.planDigest, base.repositoryCommit, operation, routeBinding,
		requestDigest, ownerImplementationDigest, fixture.ownerStateID, fixture.stageDigest,
		dispatchedAt); err != nil {
		_ = stageTx.Rollback()
		t.Fatalf("stage current owner-state operation: %v", err)
	}
	if _, err := stageTx.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched',owner_implementation_digest=$6,stage_digest=$7,dispatched_at=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='claimed'`, base.namespaceID,
		base.planDigest, base.repositoryCommit, "controlled-workspace", requestDigest,
		ownerImplementationDigest, fixture.stageDigest, dispatchedAt); err != nil {
		_ = stageTx.Rollback()
		t.Fatalf("bind current owner-state journal stage: %v", err)
	}
	if err := stageTx.Commit(); err != nil {
		t.Fatalf("commit current owner-state stage-before-execute: %v", err)
	}
	insertCAS := func(stageDigest, ownerDigest string, byteLength int64, content []byte, artifactRef string) error {
		_, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_state_cas_artifacts (
			namespace_id,plan_digest,repository_commit,service_kind,owner_state_id,request_digest,
			owner_implementation_digest,stage_digest,artifact_ref,artifact_kind,media_type,
			artifact_digest,byte_length,content_bytes,artifact_identity_digest,descriptor_digest,
			upload_digest,cas_receipt_digest,uploaded_at
		) VALUES ($1,$2,$3,'controlled-workspace',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
			base.namespaceID, base.planDigest, base.repositoryCommit, fixture.ownerStateID, requestDigest,
			ownerDigest, stageDigest, artifactRef, fixture.artifactKind, fixture.mediaType,
			fixture.artifactDigest, byteLength, content, fixture.artifactIdentityDigest,
			fixture.descriptorDigest, fixture.uploadDigest, fixture.casReceiptDigest,
			dispatchedAt.Add(500*time.Millisecond))
		return err
	}
	if err := insertCAS(attemptAuthorityMigrationDigest("swapped-owner-state-stage"), ownerImplementationDigest,
		int64(len(fixture.artifactBytes)), fixture.artifactBytes, "owner-state-artifact.swapped-stage"); err == nil {
		t.Fatal("owner-state CAS accepted a swapped stage fence")
	}
	if err := insertCAS(fixture.stageDigest, attemptAuthorityMigrationDigest("swapped-owner-state-implementation"),
		int64(len(fixture.artifactBytes)), fixture.artifactBytes, "owner-state-artifact.swapped-owner"); err == nil {
		t.Fatal("owner-state CAS accepted a swapped implementation fence")
	}
	if err := insertCAS(fixture.stageDigest, ownerImplementationDigest, 8388609,
		[]byte{1}, "owner-state-artifact.oversize"); err == nil {
		t.Fatal("owner-state CAS accepted an oversize or length-drifted artifact")
	}
	if err := insertCAS(fixture.stageDigest, ownerImplementationDigest,
		int64(len(fixture.artifactBytes)), fixture.artifactBytes, fixture.artifactRef); err != nil {
		t.Fatalf("store exact owner-state CAS artifact: %v", err)
	}
	resultTx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := resultTx.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_states (
		namespace_id,plan_digest,repository_commit,service_kind,owner_state_id,revision,
		root_digest,snapshot_kind,snapshot_digest,bundle_json,bundle_bytes,updated_at
	) VALUES ($1,$2,$3,'controlled-workspace',$4,$5,$6,'controlled-workspace',$7,$8::jsonb,$9,$10)`,
		base.namespaceID, base.planDigest, base.repositoryCommit, fixture.ownerStateID,
		fixture.ownerStateRevision, fixture.ownerStateRootDigest, fixture.snapshotDigest,
		string(fixture.ownerStateBundleBytes), fixture.ownerStateBundleBytes, sealedAt); err != nil {
		_ = resultTx.Rollback()
		t.Fatalf("store current owner-state bundle: %v", err)
	}
	if _, err := resultTx.ExecContext(ctx, `UPDATE agent_evaluation_owner_state_operations
		SET state='sealed',response_digest=$6,public_result_json=$7::jsonb,public_result_bytes=$8,
			owner_state_revision=$9,owner_state_root_digest=$10,dispatch_ack_digest=$11,
			result_receipt_digest=$12,sealed_operation_json=$13::jsonb,sealed_operation_bytes=$14,sealed_at=$15
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='staged'`, base.namespaceID,
		base.planDigest, base.repositoryCommit, "controlled-workspace", requestDigest,
		fixture.responseDigest, string(fixture.publicResultBytes), fixture.publicResultBytes,
		fixture.ownerStateRevision, fixture.ownerStateRootDigest, fixture.dispatchAckDigest,
		fixture.resultReceiptDigest, string(fixture.sealedOperationBytes), fixture.sealedOperationBytes,
		sealedAt); err != nil {
		_ = resultTx.Rollback()
		t.Fatalf("seal exact owner-state operation: %v", err)
	}
	if _, err := resultTx.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET dispatch_ack_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='dispatched'`, base.namespaceID,
		base.planDigest, base.repositoryCommit, "controlled-workspace", requestDigest,
		fixture.dispatchAckDigest); err != nil {
		_ = resultTx.Rollback()
		t.Fatalf("persist owner-state result ACK: %v", err)
	}
	if err := resultTx.Commit(); err != nil {
		t.Fatalf("commit atomic owner-state result/current/journal join: %v", err)
	}
	outerResponse := map[string]any{"ownerState": "sealed", "revision": fixture.ownerStateRevision}
	outerResponseBytes := attemptAuthorityMigrationCanonicalBytes(t, outerResponse)
	outerResponseDigest := attemptAuthorityMigrationCanonicalDigest(t, outerResponse)
	journalSealedAt := sealedAt.Add(time.Second)
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed',response_digest=$6,response_bytes=$7,sealed_at=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='dispatched'`, base.namespaceID,
		base.planDigest, base.repositoryCommit, "controlled-workspace", requestDigest,
		outerResponseDigest, outerResponseBytes, journalSealedAt); err != nil {
		t.Fatalf("seal owner-state HTTP journal after durable result: %v", err)
	}
	var storedRevision int64
	var storedRoot, storedResultReceipt, storedAck string
	var storedBundle, storedSealedOperation []byte
	if err := db.QueryRowContext(ctx, `SELECT current_state.revision,current_state.root_digest,
		current_state.bundle_bytes,operation_record.result_receipt_digest,
		operation_record.dispatch_ack_digest,operation_record.sealed_operation_bytes
		FROM agent_evaluation_owner_states current_state
		JOIN agent_evaluation_owner_state_operations operation_record
			ON operation_record.namespace_id=current_state.namespace_id
			AND operation_record.plan_digest=current_state.plan_digest
			AND operation_record.repository_commit=current_state.repository_commit
			AND operation_record.service_kind=current_state.service_kind
			AND operation_record.owner_state_id=current_state.owner_state_id
			AND operation_record.owner_state_revision=current_state.revision
		WHERE current_state.namespace_id=$1 AND current_state.plan_digest=$2
			AND current_state.repository_commit=$3 AND current_state.service_kind='controlled-workspace'
			AND current_state.owner_state_id=$4`, base.namespaceID, base.planDigest,
		base.repositoryCommit, fixture.ownerStateID).Scan(&storedRevision, &storedRoot,
		&storedBundle, &storedResultReceipt, &storedAck, &storedSealedOperation); err != nil {
		t.Fatalf("read cross-host owner-state reconcile authority: %v", err)
	}
	if storedRevision != fixture.ownerStateRevision || storedRoot != fixture.ownerStateRootDigest ||
		storedResultReceipt != fixture.resultReceiptDigest || storedAck != fixture.dispatchAckDigest ||
		!bytes.Equal(storedBundle, fixture.ownerStateBundleBytes) ||
		!bytes.Equal(storedSealedOperation, fixture.sealedOperationBytes) {
		t.Fatal("cross-host reconcile authority drifted from the sealed current state/operation")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_owner_state_operations
		SET result_receipt_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5`, base.namespaceID, base.planDigest,
		base.repositoryCommit, "controlled-workspace", requestDigest,
		attemptAuthorityMigrationDigest("late-owner-state-result-receipt")); err == nil {
		t.Fatal("sealed owner-state operation accepted a late result-receipt mutation")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET dispatch_ack_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5`, base.namespaceID, base.planDigest,
		base.repositoryCommit, "controlled-workspace", requestDigest,
		attemptAuthorityMigrationDigest("late-owner-state-ack")); err == nil {
		t.Fatal("sealed owner-state journal accepted a late ACK mutation")
	}
	if _, err := db.ExecContext(ctx, `UPDATE agent_evaluation_owner_states
		SET revision=revision+2
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='controlled-workspace' AND owner_state_id=$4`, base.namespaceID,
		base.planDigest, base.repositoryCommit, fixture.ownerStateID); err == nil {
		t.Fatal("current owner state accepted a skipped revision")
	}

	missingRequestDigest := attemptAuthorityMigrationDigest("owner-state-missing-cas-request")
	missingOperation := "session.preflight"
	missingRoute := "sessions/{sessionId}/preflight"
	missing := buildV45ControlledOwnerStateLifecycleFixture(
		t, base, missingRequestDigest, ownerImplementationDigest, attemptID, attemptDescriptorDigest,
		grantDigest, 1, missingOperation, missingRoute, "missing", fixture.ownerStateRevision,
		fixture.ownerStateRootDigest,
	)
	missingClaimedAt := journalSealedAt.Add(time.Second)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,grant_digest,generation,state,claim_generation,claimed_at
	) VALUES ($1,$2,$3,'controlled-workspace',$4,$5,$6,$7,$8,$9,$10,$11,1,'claimed',1,$12)`,
		base.namespaceID, base.planDigest, base.repositoryCommit, missingOperation, missingRoute,
		missingRequestDigest, attemptAuthorityMigrationDigest("owner-state-missing-cas-binding"),
		ownerImplementationDigest, attemptID, attemptDescriptorDigest, grantDigest, missingClaimedAt); err != nil {
		t.Fatalf("claim missing-CAS owner-state request: %v", err)
	}
	missingDispatchedAt := missingClaimedAt.Add(time.Second)
	missingStageTx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := missingStageTx.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_state_operations (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,owner_implementation_digest,owner_state_id,prior_owner_state_revision,
		prior_owner_state_root_digest,stage_digest,state,staged_at
	) VALUES ($1,$2,$3,'controlled-workspace',$4,$5,$6,$7,$8,$9,$10,$11,'staged',$12)`,
		base.namespaceID, base.planDigest, base.repositoryCommit, missingOperation, missingRoute,
		missingRequestDigest, ownerImplementationDigest, missing.ownerStateID,
		missing.priorOwnerStateRevision, missing.priorOwnerStateRootDigest, missing.stageDigest,
		missingDispatchedAt); err != nil {
		_ = missingStageTx.Rollback()
		t.Fatalf("stage missing-CAS owner-state operation: %v", err)
	}
	if _, err := missingStageTx.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='dispatched',stage_digest=$6,dispatched_at=$7
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5`, base.namespaceID, base.planDigest,
		base.repositoryCommit, "controlled-workspace", missingRequestDigest,
		missing.stageDigest, missingDispatchedAt); err != nil {
		_ = missingStageTx.Rollback()
		t.Fatalf("bind missing-CAS journal stage: %v", err)
	}
	if err := missingStageTx.Commit(); err != nil {
		t.Fatalf("commit missing-CAS stage: %v", err)
	}
	missingResultAt := missingDispatchedAt.Add(time.Second)
	missingResultTx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := missingResultTx.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_states (
		namespace_id,plan_digest,repository_commit,service_kind,owner_state_id,revision,
		root_digest,snapshot_kind,snapshot_digest,bundle_json,bundle_bytes,updated_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$4,$8,$9::jsonb,$10,$11)
	ON CONFLICT (namespace_id,plan_digest,repository_commit,service_kind,owner_state_id)
	DO UPDATE SET revision=EXCLUDED.revision,root_digest=EXCLUDED.root_digest,
		snapshot_kind=EXCLUDED.snapshot_kind,snapshot_digest=EXCLUDED.snapshot_digest,
		bundle_json=EXCLUDED.bundle_json,bundle_bytes=EXCLUDED.bundle_bytes,updated_at=EXCLUDED.updated_at
	WHERE agent_evaluation_owner_states.revision=$12
		AND agent_evaluation_owner_states.root_digest IS NOT DISTINCT FROM $13`, base.namespaceID,
		base.planDigest, base.repositoryCommit, "controlled-workspace", missing.ownerStateID,
		missing.ownerStateRevision, missing.ownerStateRootDigest, missing.snapshotDigest,
		string(missing.ownerStateBundleBytes), missing.ownerStateBundleBytes, missingResultAt,
		missing.priorOwnerStateRevision, missing.priorOwnerStateRootDigest); err != nil {
		_ = missingResultTx.Rollback()
		t.Fatalf("stage missing-CAS current state update: %v", err)
	}
	if _, err := missingResultTx.ExecContext(ctx, `UPDATE agent_evaluation_owner_state_operations
		SET state='sealed',response_digest=$6,public_result_json=$7::jsonb,public_result_bytes=$8,
			owner_state_revision=$9,owner_state_root_digest=$10,dispatch_ack_digest=$11,
			result_receipt_digest=$12,sealed_operation_json=$13::jsonb,sealed_operation_bytes=$14,sealed_at=$15
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5`, base.namespaceID, base.planDigest,
		base.repositoryCommit, "controlled-workspace", missingRequestDigest, missing.responseDigest,
		string(missing.publicResultBytes), missing.publicResultBytes, missing.ownerStateRevision,
		missing.ownerStateRootDigest, missing.dispatchAckDigest, missing.resultReceiptDigest,
		string(missing.sealedOperationBytes), missing.sealedOperationBytes, missingResultAt); err != nil {
		_ = missingResultTx.Rollback()
		t.Fatalf("stage missing-CAS sealed operation: %v", err)
	}
	if _, err := missingResultTx.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET dispatch_ack_digest=$6
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5`, base.namespaceID, base.planDigest,
		base.repositoryCommit, "controlled-workspace", missingRequestDigest,
		missing.dispatchAckDigest); err != nil {
		_ = missingResultTx.Rollback()
		t.Fatalf("stage missing-CAS journal ACK: %v", err)
	}
	if err := missingResultTx.Commit(); err == nil || !strings.Contains(err.Error(), "uncommitted CAS descriptor") {
		_ = missingResultTx.Rollback()
		t.Fatalf("missing-CAS owner-state result commit error = %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT revision FROM agent_evaluation_owner_states
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='controlled-workspace' AND owner_state_id=$4`, base.namespaceID,
		base.planDigest, base.repositoryCommit, fixture.ownerStateID).Scan(&storedRevision); err != nil {
		t.Fatal(err)
	}
	if storedRevision != fixture.ownerStateRevision {
		t.Fatalf("missing-CAS rollback advanced current revision to %d", storedRevision)
	}

	fakePriorRequestDigest := attemptAuthorityMigrationDigest("owner-state-fake-prior-request")
	fakePrior := buildV45ControlledOwnerStateLifecycleFixture(
		t, base, fakePriorRequestDigest, ownerImplementationDigest, attemptID, attemptDescriptorDigest,
		grantDigest, 1, missingOperation, missingRoute, "fake-prior", fixture.ownerStateRevision,
		attemptAuthorityMigrationDigest("swapped-owner-state-prior-root"),
	)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_authority_requests (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,request_binding_digest,owner_implementation_digest,attempt_id,
		descriptor_digest,grant_digest,generation,state,claim_generation,claimed_at
	) VALUES ($1,$2,$3,'controlled-workspace',$4,$5,$6,$7,$8,$9,$10,$11,1,'claimed',1,$12)`,
		base.namespaceID, base.planDigest, base.repositoryCommit, missingOperation, missingRoute,
		fakePriorRequestDigest, attemptAuthorityMigrationDigest("owner-state-fake-prior-binding"),
		ownerImplementationDigest, attemptID, attemptDescriptorDigest, grantDigest,
		missingClaimedAt.Add(5*time.Second)); err != nil {
		t.Fatalf("claim fake-prior owner-state request: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_state_operations (
		namespace_id,plan_digest,repository_commit,service_kind,operation,route_binding,
		request_digest,owner_implementation_digest,owner_state_id,prior_owner_state_revision,
		prior_owner_state_root_digest,stage_digest,state,staged_at
	) VALUES ($1,$2,$3,'controlled-workspace',$4,$5,$6,$7,$8,$9,$10,$11,'staged',$12)`,
		base.namespaceID, base.planDigest, base.repositoryCommit, missingOperation, missingRoute,
		fakePriorRequestDigest, ownerImplementationDigest, fakePrior.ownerStateID,
		fakePrior.priorOwnerStateRevision, fakePrior.priorOwnerStateRootDigest, fakePrior.stageDigest,
		missingClaimedAt.Add(6*time.Second)); err == nil {
		t.Fatal("owner-state stage accepted a swapped prior root")
	}

	verificationOwnerStateID := attemptAuthorityMigrationDigest("verification-owner-state-id")
	verificationSnapshotDigest := attemptAuthorityMigrationDigest("verification-owner-state-snapshot")
	verificationSnapshot := map[string]any{
		"format":  "prodivix.agent-evaluation-verification-evidence-owner-state-snapshot",
		"version": int64(1), "namespaceId": base.namespaceID, "planDigest": base.planDigest,
		"repositoryCommit": base.repositoryCommit, "attemptId": attemptID,
		"descriptorDigest": attemptDescriptorDigest, "generation": int64(1),
		"authorityDigest": attemptAuthorityMigrationDigest("verification-owner-authority"),
		"revision":        int64(1), "state": "registered", "snapshotDigest": verificationSnapshotDigest,
		"uploadCapability": "callback-bound-secret", "attestationNonce": "callback-bound-nonce",
		"attestationNonceDigest": attemptAuthorityMigrationDigest("nonce-digest"),
	}
	verificationRecent := []any{map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-operation-record", "version": int64(1),
		"sequence": int64(1), "operation": "promotion.create", "routeBinding": "promotions",
		"requestDigest":  attemptAuthorityMigrationDigest("verification-owner-request"),
		"stageDigest":    attemptAuthorityMigrationDigest("verification-owner-stage"),
		"responseDigest": attemptAuthorityMigrationDigest("verification-owner-response"),
		"recordDigest":   attemptAuthorityMigrationDigest("verification-owner-record"),
	}}
	verificationBundle := map[string]any{
		"format": "prodivix.agent-evaluation-owner-state-bundle", "version": int64(1),
		"serviceKind": "verification-evidence", "namespaceId": base.namespaceID,
		"planDigest": base.planDigest, "repositoryCommit": base.repositoryCommit,
		"ownerStateId": verificationOwnerStateID, "revision": int64(1),
		"previousOwnerStateRootDigest": nil, "snapshotKind": "verification-evidence",
		"snapshot": verificationSnapshot, "snapshotDigest": verificationSnapshotDigest,
		"casArtifacts": []any{}, "casArtifactSetDigest": attemptAuthorityMigrationCanonicalDigest(t, []any{}),
		"recentOperations":         verificationRecent,
		"recentOperationSetDigest": attemptAuthorityMigrationCanonicalDigest(t, verificationRecent),
	}
	verificationBundleBytes := attemptAuthorityMigrationCanonicalBytes(t, verificationBundle)
	if _, err := db.ExecContext(ctx, `INSERT INTO agent_evaluation_owner_states (
		namespace_id,plan_digest,repository_commit,service_kind,owner_state_id,revision,
		root_digest,snapshot_kind,snapshot_digest,bundle_json,bundle_bytes,updated_at
	) VALUES ($1,$2,$3,'verification-evidence',$4,1,$5,'verification-evidence',$6,$7::jsonb,$8,$9)`,
		base.namespaceID, base.planDigest, base.repositoryCommit, verificationOwnerStateID,
		attemptAuthorityMigrationCanonicalDigest(t, verificationBundle), verificationSnapshotDigest,
		string(verificationBundleBytes), verificationBundleBytes, journalSealedAt.Add(10*time.Second)); err == nil {
		t.Fatal("verification owner-state persistence accepted raw uploadCapability/attestationNonce material")
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLFreshV45(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	assertAgentEvaluationAttemptAuthorityV45Schema(t, db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	fixture := seedV41AttemptAuthorityFixture(t, db, "claimed")
	var claimedCurrent bool
	if err := db.QueryRowContext(ctx, `SELECT v45_eligible
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND request_digest=$3`, fixture.namespaceID,
		fixture.planDigest, fixture.providerRequestDigest).Scan(&claimedCurrent); err != nil {
		t.Fatalf("read fresh v45 attempt authority: %v", err)
	}
	if !claimedCurrent {
		t.Fatal("fresh v45 attempt authority was not classified current")
	}
	exerciseFreshV45G3CellAdmissionJournal(t, ctx, db, fixture)
	exerciseFreshV45SharedEffectResultIngressJournal(t, ctx, db, fixture)
	attestationDigest := attemptAuthorityMigrationDigest("fresh-v45-attestation")
	rootDigest := attemptAuthorityMigrationDigest("fresh-v45-root")
	if err := insertEvaluationPublicationFixture(
		t, db, "agent_evaluation_authority_attestations", fixture,
		attestationDigest, rootDigest, nil,
	); err == nil || !strings.Contains(err.Error(), "lacks v45 authority roots") {
		t.Fatalf("fresh v45 attestation without atomic roots error = %v", err)
	}
	legacyEligible := false
	if err := insertEvaluationPublicationFixture(
		t, db, "agent_evaluation_authority_attestations", fixture,
		attestationDigest, rootDigest, &legacyEligible,
	); err == nil || !strings.Contains(err.Error(), "new evaluation publication must use v45 authority") {
		t.Fatalf("fresh v45 attestation with legacy eligibility error = %v", err)
	}
	var appliedAt time.Time
	if err := db.QueryRowContext(ctx, `SELECT applied_at FROM schema_migrations WHERE version=45`).Scan(&appliedAt); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(context.Background(), db, 2*time.Minute); err != nil {
		t.Fatalf("re-run applied v45 migration: %v", err)
	}
	var repeatedAppliedAt time.Time
	if err := db.QueryRowContext(ctx, `SELECT applied_at FROM schema_migrations WHERE version=45`).Scan(&repeatedAppliedAt); err != nil {
		t.Fatal(err)
	}
	if !repeatedAppliedAt.Equal(appliedAt) {
		t.Fatalf("applied v45 migration replayed: before=%s after=%s", appliedAt, repeatedAppliedAt)
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLHostedOwnerHealthBoundaries(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	db.SetMaxIdleConns(0)
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatalf("begin hosted owner health fixture: %v", err)
	}
	defer func() { _ = tx.Rollback() }()
	for _, statement := range []string{
		`CREATE TEMP TABLE agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers (
			namespace_id TEXT PRIMARY KEY,ledger_revision BIGINT NOT NULL,updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TEMP TABLE agent_evaluation_hosted_retrieval_runtime_resource_registration_results (
			namespace_id TEXT NOT NULL,plan_digest TEXT NOT NULL,repository_commit TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,budget_reservation_id TEXT NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TEMP TABLE agent_evaluation_hosted_retrieval_runtime_resource_registration_requests (
			namespace_id TEXT NOT NULL,plan_digest TEXT NOT NULL,request_json JSONB NOT NULL
		)`,
		`CREATE TEMP TABLE agent_evaluation_hosted_retrieval_runtime_resources (
			namespace_id TEXT NOT NULL,plan_digest TEXT NOT NULL,repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,lifecycle TEXT NOT NULL,read_lease_not_after TIMESTAMPTZ,
			resource_expires_at TIMESTAMPTZ NOT NULL,current_cleanup_claim_receipt_digest TEXT,
			registration_request_digest TEXT NOT NULL
		)`,
		`CREATE TEMP TABLE agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts (
			namespace_id TEXT NOT NULL,plan_digest TEXT NOT NULL,repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,receipt_digest TEXT NOT NULL,claim_expires_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TEMP TABLE hosted_runtime_owner_mutations (
			namespace_id TEXT NOT NULL,mutation_id TEXT PRIMARY KEY
		)`,
		`CREATE TEMP TABLE agent_evaluation_budget_settlements (
			namespace_id TEXT NOT NULL,plan_digest TEXT NOT NULL,reservation_id TEXT NOT NULL
		)`,
		`CREATE TRIGGER hosted_runtime_owner_mutation_revision
			AFTER INSERT OR DELETE ON hosted_runtime_owner_mutations
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER hosted_runtime_budget_settlement_revision
			AFTER INSERT ON agent_evaluation_budget_settlements
			FOR EACH ROW EXECUTE FUNCTION
				bump_agent_evaluation_hosted_runtime_budget_settlement_owner_ledger()`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			t.Fatalf("prepare hosted owner health fixture: %v", err)
		}
	}
	namespaceID := "namespace.hosted-owner-health"
	checkedAt := time.Date(2026, time.August, 12, 12, 0, 0, 0, time.UTC)
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers
		(namespace_id,ledger_revision,updated_at) VALUES ($1,1,$2)`, namespaceID, checkedAt.Add(-time.Minute)); err != nil {
		t.Fatalf("seed hosted owner ledger: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_registration_results
		(namespace_id,plan_digest,repository_commit,registration_request_digest,budget_reservation_id,expires_at)
		VALUES ($1,'plan-health','commit-health','request-health','reservation-health',$2)`,
		namespaceID, checkedAt.Add(time.Hour)); err != nil {
		t.Fatalf("seed hosted registration count: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_registration_requests
		(namespace_id,plan_digest,request_json) VALUES (
			$1,'plan-health',jsonb_build_object(
				'budgetReservationAuthority',jsonb_build_object('reservationId','reservation-health')
			)
		)`, namespaceID); err != nil {
		t.Fatalf("seed hosted registration request budget: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resources (
		namespace_id,plan_digest,repository_commit,authority_digest,lifecycle,
		read_lease_not_after,resource_expires_at,current_cleanup_claim_receipt_digest,
		registration_request_digest
	) VALUES ($1,'plan-health','commit-health','authority-health','active',$2,$2,NULL,'request-health')`,
		namespaceID, checkedAt); err != nil {
		t.Fatalf("seed exact-expiry hosted resource: %v", err)
	}
	assertSummary := func(wantRegistrations, wantActive, wantActiveLeases, wantUnfinished, wantOverdue int64) {
		t.Helper()
		var revision, registrations, active, activeLeases, unfinished, overdue int64
		if err := tx.QueryRowContext(ctx, `SELECT * FROM
			agent_evaluation_hosted_runtime_resource_owner_storage_summary($1,$2)`,
			namespaceID, checkedAt).Scan(
			&revision, &registrations, &active, &activeLeases, &unfinished, &overdue,
		); err != nil {
			t.Fatalf("read hosted owner storage summary: %v", err)
		}
		if revision < 1 || registrations != wantRegistrations || active != wantActive ||
			activeLeases != wantActiveLeases || unfinished != wantUnfinished || overdue != wantOverdue {
			t.Fatalf("hosted owner summary=(%d,%d,%d,%d,%d,%d), want revision>=1 counts=(%d,%d,%d,%d,%d)",
				revision, registrations, active, activeLeases, unfinished, overdue,
				wantRegistrations, wantActive, wantActiveLeases, wantUnfinished, wantOverdue)
		}
	}
	assertSummary(1, 1, 0, 0, 0)
	if _, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_hosted_retrieval_runtime_resources
		SET resource_expires_at=$2 WHERE namespace_id=$1`, namespaceID, checkedAt.Add(-time.Millisecond)); err != nil {
		t.Fatalf("advance hosted resource one millisecond past expiry: %v", err)
	}
	assertSummary(1, 1, 0, 0, 1)
	if _, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_hosted_retrieval_runtime_resources
		SET lifecycle='cleanup-in-progress',resource_expires_at=$2,
			current_cleanup_claim_receipt_digest='claim-health'
		WHERE namespace_id=$1`, namespaceID, checkedAt.Add(time.Hour)); err != nil {
		t.Fatalf("seed hosted cleanup-in-progress resource: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO
		agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts (
			namespace_id,plan_digest,repository_commit,authority_digest,receipt_digest,claim_expires_at
		) VALUES ($1,'plan-health','commit-health','authority-health','claim-health',$2)`,
		namespaceID, checkedAt); err != nil {
		t.Fatalf("seed exact-expiry hosted cleanup claim: %v", err)
	}
	assertSummary(1, 0, 0, 1, 0)
	if _, err := tx.ExecContext(ctx, `UPDATE
		agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts
		SET claim_expires_at=$2 WHERE namespace_id=$1`, namespaceID, checkedAt.Add(-time.Millisecond)); err != nil {
		t.Fatalf("advance hosted cleanup claim one millisecond past expiry: %v", err)
	}
	assertSummary(1, 0, 0, 1, 1)
	if _, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_hosted_retrieval_runtime_resources
		SET lifecycle='cleaned',current_cleanup_claim_receipt_digest=NULL
		WHERE namespace_id=$1`, namespaceID); err != nil {
		t.Fatalf("seal hosted resource before budget settlement: %v", err)
	}
	assertSummary(1, 0, 0, 1, 0)
	var beforeSettlementRevision, afterSettlementRevision int64
	if err := tx.QueryRowContext(ctx, `SELECT ledger_revision FROM
		agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers WHERE namespace_id=$1`,
		namespaceID).Scan(&beforeSettlementRevision); err != nil {
		t.Fatalf("read hosted revision before budget settlement: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_budget_settlements(
		namespace_id,plan_digest,reservation_id
	) VALUES ($1,'plan-health','reservation-health')`, namespaceID); err != nil {
		t.Fatalf("seal hosted budget settlement: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `SELECT ledger_revision FROM
		agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers WHERE namespace_id=$1`,
		namespaceID).Scan(&afterSettlementRevision); err != nil {
		t.Fatalf("read hosted revision after budget settlement: %v", err)
	}
	if afterSettlementRevision <= beforeSettlementRevision {
		t.Fatalf("hosted budget settlement kept owner revision=%d after %d",
			afterSettlementRevision, beforeSettlementRevision)
	}
	assertSummary(1, 0, 0, 0, 0)
	if _, err := tx.ExecContext(ctx, `INSERT INTO
		agent_evaluation_hosted_retrieval_runtime_resource_registration_results (
			namespace_id,plan_digest,repository_commit,registration_request_digest,
			budget_reservation_id,expires_at
		) VALUES ($1,'plan-health','commit-health','request-partial','reservation-partial',$2)`,
		namespaceID, checkedAt); err != nil {
		t.Fatalf("seed exact-expiry partial hosted registration: %v", err)
	}
	assertSummary(2, 0, 0, 1, 0)
	if _, err := tx.ExecContext(ctx, `UPDATE
		agent_evaluation_hosted_retrieval_runtime_resource_registration_results
		SET expires_at=$2 WHERE namespace_id=$1 AND registration_request_digest='request-partial'`,
		namespaceID, checkedAt.Add(-time.Millisecond)); err != nil {
		t.Fatalf("advance partial hosted registration one millisecond past expiry: %v", err)
	}
	assertSummary(2, 0, 0, 1, 1)
	if _, err := tx.ExecContext(ctx, `INSERT INTO hosted_runtime_owner_mutations(namespace_id,mutation_id)
		VALUES ($1,'a')`, namespaceID); err != nil {
		t.Fatalf("record first hosted owner mutation: %v", err)
	}
	var firstRevision, swappedRevision, mutationCount int64
	if err := tx.QueryRowContext(ctx, `SELECT ledger_revision FROM
		agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers WHERE namespace_id=$1`,
		namespaceID).Scan(&firstRevision); err != nil {
		t.Fatalf("read first hosted owner revision: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM hosted_runtime_owner_mutations WHERE mutation_id='a'`); err != nil {
		t.Fatalf("remove first hosted owner mutation: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO hosted_runtime_owner_mutations(namespace_id,mutation_id)
		VALUES ($1,'b')`, namespaceID); err != nil {
		t.Fatalf("record swapped hosted owner mutation: %v", err)
	}
	if err := tx.QueryRowContext(ctx, `SELECT ledger_revision,
		(SELECT COUNT(*) FROM hosted_runtime_owner_mutations)
		FROM agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers WHERE namespace_id=$1`,
		namespaceID).Scan(&swappedRevision, &mutationCount); err != nil {
		t.Fatalf("read swapped hosted owner revision: %v", err)
	}
	if mutationCount != 1 || swappedRevision <= firstRevision {
		t.Fatalf("same-count hosted mutation swap kept revision=%d after %d with count=%d",
			swappedRevision, firstRevision, mutationCount)
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLHostedReadLedgerRootFreezesLateRead(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	db.SetMaxIdleConns(0)
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatalf("begin hosted read-ledger freeze fixture: %v", err)
	}
	defer func() { _ = tx.Rollback() }()
	var schema string
	if err := tx.QueryRowContext(ctx, `SELECT current_schema()`).Scan(&schema); err != nil {
		t.Fatalf("resolve hosted read-ledger fixture schema: %v", err)
	}
	rootSource := pgx.Identifier{schema,
		"agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots"}.Sanitize()
	readSource := pgx.Identifier{schema,
		"agent_evaluation_hosted_retrieval_runtime_resource_read_receipts"}.Sanitize()
	for _, statement := range []string{
		fmt.Sprintf(`CREATE TEMP TABLE agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
			AS SELECT * FROM %s WITH NO DATA`, rootSource),
		fmt.Sprintf(`CREATE TEMP TABLE agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
			AS SELECT * FROM %s WITH NO DATA`, readSource),
		`CREATE TRIGGER hosted_runtime_late_read_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_read()`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			t.Fatalf("prepare hosted read-ledger freeze fixture: %v", err)
		}
	}
	const (
		namespaceID      = "namespace.hosted-read-root-freeze"
		planDigest       = "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
		repositoryCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
		authorityDigest  = "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	)
	if _, err := tx.ExecContext(ctx, `INSERT INTO
		agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots(
			namespace_id,plan_digest,repository_commit,authority_digest
		) VALUES ($1,$2,$3,$4)`, namespaceID, planDigest, repositoryCommit, authorityDigest); err != nil {
		t.Fatalf("seed sealed hosted read-ledger root: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `SAVEPOINT hosted_runtime_late_read`); err != nil {
		t.Fatalf("save hosted late-read fixture: %v", err)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO
		agent_evaluation_hosted_retrieval_runtime_resource_read_receipts(
			namespace_id,plan_digest,repository_commit,authority_digest,request_json,receipt_json
		) VALUES ($1,$2,$3,$4,'{}'::jsonb,'{}'::jsonb)`,
		namespaceID, planDigest, repositoryCommit, authorityDigest)
	if err == nil || !strings.Contains(err.Error(), "hosted runtime read ledger is already sealed") {
		t.Fatalf("late hosted read after ledger root seal error=%v", err)
	}
	if _, rollbackErr := tx.ExecContext(ctx, `ROLLBACK TO SAVEPOINT hosted_runtime_late_read`); rollbackErr != nil {
		t.Fatalf("restore hosted late-read fixture: %v", rollbackErr)
	}
}

func TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLHostedCleanupResultReadCapacity(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
	db.SetMaxIdleConns(0)
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatalf("begin hosted cleanup-result capacity fixture: %v", err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `CREATE TEMP TABLE
		agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts
		(LIKE agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts
		INCLUDING CONSTRAINTS)`); err != nil {
		t.Fatalf("shadow hosted cleanup-result receipt table: %v", err)
	}
	canonicalAtSize := func(size int) []byte {
		t.Helper()
		value := map[string]any{"payload": strings.Repeat("a", size-len(`{"payload":""}`))}
		result := attemptAuthorityMigrationCanonicalBytes(t, value)
		if len(result) != size {
			t.Fatalf("hosted cleanup-result capacity fixture bytes=%d, want %d", len(result), size)
		}
		return result
	}
	insertReceipt := func(requestDigest, receiptDigest string, receiptBytes []byte) error {
		_, insertErr := tx.ExecContext(ctx, `INSERT INTO
			agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts (
			namespace_id,request_digest,receipt_digest,status,read_at,receipt_json,receipt_bytes
		) VALUES ('namespace.hosted-result-capacity',$1,$2,'pending',$3,$4::jsonb,$5)`,
			requestDigest, receiptDigest, time.Date(2026, time.August, 12, 12, 0, 0, 0, time.UTC),
			string(receiptBytes), receiptBytes)
		return insertErr
	}
	if err := insertReceipt("request-over-old-cap", "receipt-over-old-cap", canonicalAtSize(196609)); err != nil {
		t.Fatalf("hosted cleanup-result receipt above archive-only cap was rejected: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `SAVEPOINT hosted_cleanup_result_oversized`); err != nil {
		t.Fatalf("save hosted cleanup-result oversized fixture: %v", err)
	}
	if err := insertReceipt("request-over-cap", "receipt-over-cap", canonicalAtSize(245761)); err == nil {
		t.Fatal("hosted cleanup-result receipt above 245760 bytes was accepted")
	}
	if _, err := tx.ExecContext(ctx, `ROLLBACK TO SAVEPOINT hosted_cleanup_result_oversized`); err != nil {
		t.Fatalf("restore hosted cleanup-result oversized fixture: %v", err)
	}
}
