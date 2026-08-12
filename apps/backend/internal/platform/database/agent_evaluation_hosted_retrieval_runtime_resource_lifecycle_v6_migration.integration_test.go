package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func assertAgentEvaluationHostedV6Schema(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, table := range []string{
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_journal_archives",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_journal_archive_roots",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_seal_receipts",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_prepares",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_claim_history",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_claim_current",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_pages",
		"agent_evaluation_authority_attestation_v46_roots",
		"agent_evaluation_evidence_root_v46_roots",
	} {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, table).Scan(&exists); err != nil {
			t.Fatalf("read hosted v6 table %q: %v", table, err)
		}
		if !exists {
			t.Fatalf("hosted v6 table %q was not installed", table)
		}
	}
	var migrationName string
	if err := db.QueryRowContext(ctx,
		`SELECT name FROM schema_migrations WHERE version=46`).Scan(&migrationName); err != nil {
		t.Fatalf("read hosted v6 migration registry: %v", err)
	}
	if migrationName != "g4-agent-evaluation-hosted-lifecycle-v6" {
		t.Fatalf("hosted v6 migration name=%q", migrationName)
	}
	var functionExists bool
	if err := db.QueryRowContext(ctx, `SELECT to_regprocedure(
		'claim_agent_evaluation_hosted_runtime_lifecycle_dispatch(text,text,jsonb,bytea,text,text,timestamp with time zone,timestamp with time zone)'
	) IS NOT NULL`).Scan(&functionExists); err != nil {
		t.Fatalf("read hosted lifecycle claim function: %v", err)
	}
	if !functionExists {
		t.Fatal("hosted lifecycle claim function was not installed")
	}
	for _, signature := range []string{
		"store_agent_evaluation_hosted_runtime_lifecycle_transport(text,jsonb,bytea,text,text,timestamp with time zone)",
		"agent_evaluation_hosted_runtime_lifecycle_transport_store_receipt_history(text,text,text)",
		"store_agent_evaluation_hosted_runtime_lifecycle_reconciliation_observation(text,jsonb,bytea,text,text)",
		"read_agent_evaluation_hosted_runtime_lifecycle_transport_recovery(text,jsonb,bytea,text,text,timestamp with time zone,timestamp with time zone)",
		"acknowledge_agent_evaluation_hosted_runtime_lifecycle_seal(text,jsonb,bytea,text,text,text,timestamp with time zone)",
		"claim_agent_evaluation_hosted_runtime_lifecycle_partial_cleanup(text,text,text,timestamp with time zone,timestamp with time zone)",
		"read_agent_evaluation_hosted_runtime_lifecycle_unfinished_dispatches(text,jsonb,bytea,text,text,timestamp with time zone,timestamp with time zone)",
	} {
		if err := db.QueryRowContext(ctx, `SELECT to_regprocedure($1) IS NOT NULL`, signature).
			Scan(&functionExists); err != nil {
			t.Fatalf("read hosted lifecycle function %q: %v", signature, err)
		}
		if !functionExists {
			t.Fatalf("hosted lifecycle function %q was not installed", signature)
		}
	}
}

func TestAgentEvaluationHostedV6MigrationPostgreSQLFreshAndV45Upgrade(t *testing.T) {
	t.Run("fresh", func(t *testing.T) {
		db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 46)
		assertAgentEvaluationHostedV6Schema(t, db)
	})
	t.Run("upgrade-from-v45", func(t *testing.T) {
		db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 45)
		if err := RunMigrations(context.Background(), db, 2*time.Minute); err != nil {
			t.Fatalf("upgrade v45 schema through hosted v6: %v", err)
		}
		assertAgentEvaluationHostedV6Schema(t, db)
	})
}

func createHostedLifecycleTempShadowTables(t *testing.T, db *sql.DB, tables ...string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	var schema string
	if err := db.QueryRowContext(ctx, `SELECT current_schema()`).Scan(&schema); err != nil {
		t.Fatalf("resolve hosted lifecycle fixture schema: %v", err)
	}
	for _, table := range tables {
		target := pgx.Identifier{table}.Sanitize()
		source := pgx.Identifier{schema, table}.Sanitize()
		if _, err := db.ExecContext(ctx, fmt.Sprintf(
			"CREATE TEMP TABLE %s (LIKE %s INCLUDING ALL)", target, source)); err != nil {
			t.Fatalf("shadow hosted lifecycle table %s: %v", table, err)
		}
	}
}

func TestAgentEvaluationHostedV6MigrationPostgreSQLSpoolLifetimeAndUnknownSeal(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 46)
	createHostedLifecycleTempShadowTables(t, db,
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals",
	)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	digest := "sha256-" + strings.Repeat("a", 64)
	repositoryCommit := strings.Repeat("b", 40)
	spooledAt := time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC)
	insertSpool := func(namespaceID, spoolRef string, expiresAt, lifecycleExpiresAt time.Time) error {
		_, err := db.ExecContext(ctx, `INSERT INTO
			agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
				registration_request_digest,frozen_run_digest,run_config_artifact_binding_digest,
				lifecycle_expires_at,spool_ref,operation,dispatch_intent_set_digest,
				dispatch_stage_claim_receipt_set_digest,
				dispatch_stage_claim_history_set_digest,transport_receipt_set_digest,
				business_result_digest,plaintext_digest,envelope_digest,envelope_json,envelope_bytes,
				spool_write_envelope_json,spool_write_envelope_bytes,
				aad_digest,aad_json,aad_bytes,algorithm,key_id,key_version,key_ref_digest,
				encryption_profile_digest,ciphertext_digest,ciphertext_bytes,ciphertext_byte_length,
				nonce_bytes,authentication_tag_bytes,spool_receipt_digest,spool_receipt_json,
				spool_receipt_bytes,transport_store_request_digest,transport_store_request_json,
				transport_store_request_bytes,transport_store_receipt_digest,
				transport_store_receipt_json,transport_store_receipt_bytes,
				transport_store_receipt_history_digest,
				transport_store_receipt_history_json,transport_store_receipt_history_bytes,
				transport_authority_issuer_id,transport_authority_implementation_digest,
				transport_ledger_revision,transport_stored_at,state,retention_policy_digest,
				spooled_at,expires_at,v46_eligible
			) VALUES (
				$1,$2,$3,'set.fixture',$2,$2,$2,$4,$5,'create',$2,$2,$2,$2,$2,$2,$2,
				'{}'::jsonb,convert_to('{}','UTF8'),'{}'::jsonb,convert_to('{}','UTF8'),
				$2,'{}'::jsonb,convert_to('{}','UTF8'),
				'aes-256-gcm','key.fixture',1,$2,$2,$2,decode('00','hex'),1,
				decode(repeat('00',12),'hex'),decode(repeat('00',16),'hex'),$2,
				'{}'::jsonb,convert_to('{}','UTF8'),$2,'{}'::jsonb,convert_to('{}','UTF8'),
				$2,'{}'::jsonb,convert_to('{}','UTF8'),$2,'{}'::jsonb,
				convert_to('{}','UTF8'),'authority.fixture',$2,1,$6,
				'active',$2,$6,$7,TRUE
			)`, namespaceID, digest, repositoryCommit, lifecycleExpiresAt, spoolRef,
			spooledAt, expiresAt)
		return err
	}
	if err := insertSpool("namespace.spool-125001", "spool.125001",
		spooledAt.Add(125001*time.Millisecond), spooledAt.Add(8*24*time.Hour)); err != nil {
		t.Fatalf("125001ms encrypted recovery spool was rejected: %v", err)
	}
	if err := insertSpool("namespace.spool-eight-days-plus-one", "spool.eight-days-plus-one",
		spooledAt.Add(8*24*time.Hour+time.Millisecond),
		spooledAt.Add(8*24*time.Hour+time.Millisecond)); err == nil ||
		!strings.Contains(err.Error(), "agent_eval_hosted_runtime_lifecycle_spool_time_check") {
		t.Fatalf("8d+1ms encrypted recovery spool error=%v", err)
	}
	resourceExpiry := spooledAt.Add(4 * time.Hour)
	if err := insertSpool("namespace.spool-resource-expiry", "spool.resource-expiry",
		resourceExpiry.Add(time.Microsecond), resourceExpiry); err == nil ||
		!strings.Contains(err.Error(), "agent_eval_hosted_runtime_lifecycle_spool_time_check") {
		t.Fatalf("spool beyond stored resource expiry error=%v", err)
	}
	_, err := db.ExecContext(ctx, `INSERT INTO
		agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals(
			namespace_id,plan_digest,repository_commit,runtime_resource_set_id,operation,
			registration_request_digest,record_digest,result_spool_ref,
			result_spool_receipt_digest,result_spool_disposition_receipt_digest,
			business_outcome,completed_at,record_json,record_bytes,v46_eligible
		) VALUES (
			'namespace.unknown-seal',$1,$2,'set.fixture','create',$1,$1,'spool.fixture',
			$1,$1,'provider-outcome-unresolved',$3,'{}'::jsonb,
			convert_to('{}','UTF8'),TRUE
		)`, digest, repositoryCommit, spooledAt)
	if err == nil || !strings.Contains(err.Error(), "agent_eval_hosted_runtime_lifecycle_journal_check") {
		t.Fatalf("unresolved Provider outcome final journal error=%v", err)
	}
}

type hostedLifecycleClaimResult struct {
	receiptJSON            []byte
	receiptBytes           []byte
	receiptDigest          string
	generationTransition   string
	deliveryDisposition    string
	dispatchGeneration     int64
	dispatchLedgerRevision int64
}

func TestAgentEvaluationHostedV6MigrationPostgreSQLStageClaimCAS(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 46)
	createHostedLifecycleTempShadowTables(t, db,
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current",
		"agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers",
	)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	const namespaceID = "namespace.lifecycle-claim-cas"
	baseAt := time.Date(2026, 8, 12, 1, 0, 0, 0, time.UTC)
	if _, err := db.ExecContext(ctx, `INSERT INTO
		agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers(
			namespace_id,ledger_revision,updated_at
		) VALUES ($1,37,$2)`, namespaceID, baseAt.Add(-time.Hour)); err != nil {
		t.Fatalf("seed hosted lifecycle owner ledger: %v", err)
	}
	intentDigests := make([]string, 4)
	for index, character := range []string{"a", "b", "c", "d"} {
		intentDigests[index] = "sha256-" + strings.Repeat(character, 64)
		registrationDigest := "sha256-" + strings.Repeat(fmt.Sprintf("%x", index+5), 64)
		if _, err := db.ExecContext(ctx, `INSERT INTO
			agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
				registration_request_digest,intent_id,intent_digest,protocol_family,
				capability_profile_id,budget_reservation_id,budget_reservation_authority_digest,
				operation,mutation_kind,mutation_sequence,created_at,intent_json,intent_bytes,
				v46_eligible
			) VALUES (
				$1,$2,$3,'set.fixture',$4,$5,$6,'gemini-interactions',
				'g4-provider-hosted-retrieval-core','budget.fixture',$2,'create','create-primary',
				0,$7,'{}'::jsonb,convert_to('{}','UTF8'),TRUE
			)`, namespaceID, "sha256-"+strings.Repeat("e", 64), strings.Repeat("f", 40),
			registrationDigest, fmt.Sprintf("intent.fixture.%d", index), intentDigests[index], baseAt); err != nil {
			t.Fatalf("seed hosted lifecycle intent %d: %v", index, err)
		}
	}
	claim := func(intentDigest, ownerID string, expectedLedger, expectedGeneration int64,
		priorDigest *string, priorExpiry *time.Time, requestedAt, minimumExpiresAt,
		claimedAt, claimExpiresAt time.Time) (hostedLifecycleClaimResult, error) {
		request := map[string]any{
			"format":                               "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-request",
			"version":                              1,
			"purpose":                              "hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim",
			"dispatchIntentDigest":                 intentDigest,
			"lifecycleOwnerInstanceId":             ownerID,
			"expectedDispatchLedgerRevision":       expectedLedger,
			"expectedDispatchGeneration":           expectedGeneration,
			"expectedPriorStageClaimReceiptDigest": priorDigest,
			"expectedPriorClaimExpiresAt":          priorExpiry,
			"requestedAt":                          requestedAt.Format(time.RFC3339Nano),
			"minimumClaimExpiresAt":                minimumExpiresAt.Format(time.RFC3339Nano),
		}
		withoutDigest, err := json.Marshal(request)
		if err != nil {
			return hostedLifecycleClaimResult{}, err
		}
		var requestDigest string
		if err := db.QueryRowContext(ctx,
			`SELECT agent_evaluation_canonical_jsonb_digest($1::jsonb)`, withoutDigest,
		).Scan(&requestDigest); err != nil {
			return hostedLifecycleClaimResult{}, err
		}
		request["requestDigest"] = requestDigest
		withDigest, err := json.Marshal(request)
		if err != nil {
			return hostedLifecycleClaimResult{}, err
		}
		var requestBytes []byte
		if err := db.QueryRowContext(ctx, `SELECT convert_to(
			agent_evaluation_canonical_jsonb_text($1::jsonb),'UTF8')`, withDigest).Scan(&requestBytes); err != nil {
			return hostedLifecycleClaimResult{}, err
		}
		var result hostedLifecycleClaimResult
		err = db.QueryRowContext(ctx, `SELECT receipt_json,receipt_bytes,receipt_digest,
			generation_transition,delivery_disposition,dispatch_generation,dispatch_ledger_revision
			FROM claim_agent_evaluation_hosted_runtime_lifecycle_dispatch(
				$1,$2,$3::jsonb,$4,$5,$6,$7,$8
			)`, namespaceID, intentDigest, withDigest, requestBytes, "authority.lifecycle.fixture",
			"sha256-"+strings.Repeat("9", 64), claimedAt, claimExpiresAt).Scan(
			&result.receiptJSON, &result.receiptBytes, &result.receiptDigest,
			&result.generationTransition, &result.deliveryDisposition,
			&result.dispatchGeneration, &result.dispatchLedgerRevision,
		)
		return result, err
	}
	var first hostedLifecycleClaimResult
	firstExpiry := baseAt.Add(120 * time.Second)
	for index, intentDigest := range intentDigests {
		result, err := claim(intentDigest, fmt.Sprintf("owner.initial.%d", index), 0, 0,
			nil, nil, baseAt, baseAt.Add(60*time.Second), baseAt, firstExpiry)
		if err != nil {
			t.Fatalf("claim initial first delivery %d: %v", index, err)
		}
		if result.generationTransition != "initial-first-delivery" ||
			result.deliveryDisposition != "dispatch-authorized-first-delivery" ||
			result.dispatchGeneration != 1 || result.dispatchLedgerRevision != 1 {
			t.Fatalf("initial claim %d result=%+v", index, result)
		}
		if index == 0 {
			first = result
		}
	}
	var globalRevision int64
	if err := db.QueryRowContext(ctx, `SELECT ledger_revision FROM
		agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers WHERE namespace_id=$1`,
		namespaceID).Scan(&globalRevision); err != nil {
		t.Fatal(err)
	}
	if globalRevision != 41 {
		t.Fatalf("four per-intent first claims global revision=%d, want 41", globalRevision)
	}
	assertCASFailure := func(name string, expectedLedger, expectedGeneration int64,
		priorDigest string, priorExpiry time.Time) {
		t.Helper()
		_, err := claim(intentDigests[0], "owner.stale."+name, expectedLedger,
			expectedGeneration, &priorDigest, &priorExpiry, baseAt.Add(10*time.Second),
			baseAt.Add(20*time.Second), baseAt.Add(10*time.Second), baseAt.Add(100*time.Second))
		if err == nil || !strings.Contains(err.Error(), "reconcile generation drifted") {
			t.Fatalf("%s CAS error=%v", name, err)
		}
	}
	assertCASFailure("revision", 2, 1, first.receiptDigest, firstExpiry)
	assertCASFailure("prior-digest", 1, 1,
		"sha256-"+strings.Repeat("8", 64), firstExpiry)
	assertCASFailure("prior-expiry", 1, 1, first.receiptDigest, firstExpiry.Add(time.Microsecond))
	earlyRequestedAt := baseAt.Add(30 * time.Second)
	earlyExpiry := earlyRequestedAt.Add(100 * time.Second)
	_, err := claim(intentDigests[0], "owner.foreign-live", 1, 1, &first.receiptDigest,
		&firstExpiry, earlyRequestedAt, earlyRequestedAt.Add(time.Second),
		earlyRequestedAt, earlyExpiry)
	if err == nil || !strings.Contains(err.Error(), "live generation owner drifted") {
		t.Fatalf("foreign owner stole unexpired generation error=%v", err)
	}
	early, err := claim(intentDigests[0], "owner.initial.0", 1, 1, &first.receiptDigest,
		&firstExpiry, earlyRequestedAt, earlyRequestedAt.Add(time.Second),
		earlyRequestedAt, earlyExpiry)
	if err != nil {
		t.Fatalf("generation-retained claim: %v", err)
	}
	if early.generationTransition != "generation-retained" || early.dispatchGeneration != 1 ||
		early.dispatchLedgerRevision != 1 ||
		early.deliveryDisposition != "reconcile-only-replay" {
		t.Fatalf("pre-expiry claim minted takeover: %+v", early)
	}
	takeoverExpiry := earlyExpiry.Add(120 * time.Second)
	takeover, err := claim(intentDigests[0], "owner.takeover", 1, 1,
		&early.receiptDigest, &earlyExpiry, earlyExpiry, earlyExpiry.Add(time.Second),
		earlyExpiry, takeoverExpiry)
	if err != nil {
		t.Fatalf("expired owner takeover: %v", err)
	}
	if takeover.generationTransition != "expired-owner-takeover" ||
		takeover.deliveryDisposition != "reconcile-only-replay" ||
		takeover.dispatchGeneration != 2 || takeover.dispatchLedgerRevision != 2 {
		t.Fatalf("expired owner takeover result=%+v", takeover)
	}
	transportDigest := "sha256-" + strings.Repeat("6", 64)
	journalDigest := "sha256-" + strings.Repeat("7", 64)
	if _, err := db.ExecContext(ctx, `UPDATE
		agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current
		SET current_revision=current_revision+1,prior_transport_receipt_digest=$3,
			sealed_journal_record_digest=$4,updated_at=$5
		WHERE namespace_id=$1 AND intent_digest=$2`, namespaceID, intentDigests[0],
		transportDigest, journalDigest, takeoverExpiry); err != nil {
		t.Fatalf("seal hosted lifecycle fixture current: %v", err)
	}
	sealedRequestedAt := takeoverExpiry.Add(time.Second)
	sealedExpiry := sealedRequestedAt.Add(120 * time.Second)
	sealed, err := claim(intentDigests[0], "owner.takeover", 2, 2,
		&takeover.receiptDigest, &takeoverExpiry, sealedRequestedAt,
		sealedRequestedAt.Add(time.Second), sealedRequestedAt, sealedExpiry)
	if err != nil {
		t.Fatalf("sealed read claim: %v", err)
	}
	if sealed.generationTransition != "generation-retained" ||
		sealed.deliveryDisposition != "sealed-read-only" ||
		sealed.dispatchGeneration != 2 || sealed.dispatchLedgerRevision != 2 {
		t.Fatalf("sealed read claim result=%+v", sealed)
	}
}

func TestAgentEvaluationHostedV6MigrationPostgreSQLPartialCleanupClaimExpiry(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 46)
	createHostedLifecycleTempShadowTables(t, db,
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_prepares",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_claim_history",
		"agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_claim_current",
	)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	const namespaceID = "namespace.lifecycle-partial-expiry"
	registrationDigest := "sha256-" + strings.Repeat("1", 64)
	journalDigest := "sha256-" + strings.Repeat("2", 64)
	authorityDigest := "sha256-" + strings.Repeat("3", 64)
	planDigest := "sha256-" + strings.Repeat("4", 64)
	baseAt := time.Date(2026, 8, 12, 3, 0, 0, 0, time.UTC)
	knownIDs := `[{"resourceId":"provider.partial.fixture","resourceRole":"primary"}]`
	if _, err := db.ExecContext(ctx, `INSERT INTO
		agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_prepares(
			namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
			registration_request_digest,partial_journal_record_digest,
			partial_cleanup_authority_digest,known_resource_ids_json,known_resource_ids_bytes,
			state,current_revision,created_at,expires_at,updated_at,release_eligible
		) VALUES ($1,$2,$3,'set.partial.fixture',$4,$5,$6,$7::jsonb,
			convert_to(agent_evaluation_canonical_jsonb_text($7::jsonb),'UTF8'),
			'cleanup-pending',1,$8,$9,$8,FALSE)`, namespaceID, planDigest,
		strings.Repeat("5", 40), registrationDigest, journalDigest, authorityDigest,
		knownIDs, baseAt.Add(-time.Minute), baseAt.Add(-time.Second)); err != nil {
		t.Fatalf("seed overdue partial cleanup prepare: %v", err)
	}
	claim := func(owner string, claimedAt, expiresAt time.Time) (string, int64, int64, error) {
		var receiptJSON []byte
		var receiptBytes []byte
		var receiptDigest string
		var generation int64
		var revision int64
		err := db.QueryRowContext(ctx, `SELECT receipt_json,receipt_bytes,receipt_digest,
			claim_generation,claim_revision
			FROM claim_agent_evaluation_hosted_runtime_lifecycle_partial_cleanup(
				$1,$2,$3,$4,$5)`, namespaceID, registrationDigest, owner,
			claimedAt, expiresAt).Scan(&receiptJSON, &receiptBytes, &receiptDigest,
			&generation, &revision)
		return receiptDigest, generation, revision, err
	}
	firstExpiry := baseAt.Add(30 * time.Second)
	firstDigest, generation, revision, err := claim("owner.partial.initial", baseAt, firstExpiry)
	if err != nil {
		t.Fatalf("claim overdue partial prepare without a terminal fence: %v", err)
	}
	if generation != 1 || revision != 1 {
		t.Fatalf("initial partial claim generation=%d revision=%d", generation, revision)
	}
	if _, _, _, err := claim("owner.partial.foreign", baseAt.Add(time.Second),
		baseAt.Add(20*time.Second)); err == nil ||
		!strings.Contains(err.Error(), "has a live owner") {
		t.Fatalf("foreign owner stole live partial cleanup claim: %v", err)
	}
	replayDigest, replayGeneration, replayRevision, err := claim(
		"owner.partial.initial", baseAt.Add(time.Second), baseAt.Add(20*time.Second))
	if err != nil || replayDigest != firstDigest || replayGeneration != 1 || replayRevision != 1 {
		t.Fatalf("same-owner partial claim replay digest=%q generation=%d revision=%d err=%v",
			replayDigest, replayGeneration, replayRevision, err)
	}
	_, generation, revision, err = claim("owner.partial.takeover", firstExpiry,
		firstExpiry.Add(30*time.Second))
	if err != nil {
		t.Fatalf("take over expired partial cleanup claim: %v", err)
	}
	if generation != 2 || revision != 2 {
		t.Fatalf("partial takeover generation=%d revision=%d", generation, revision)
	}
}
