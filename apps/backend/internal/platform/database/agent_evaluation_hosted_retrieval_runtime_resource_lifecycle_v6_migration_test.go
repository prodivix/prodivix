package database

import (
	"strings"
	"testing"
)

func TestAgentEvaluationHostedRuntimeLifecycleV6MigrationOwnsFirstDeliverySpoolAndArchive(t *testing.T) {
	statements := strings.Join(
		append(
			agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6Statements(),
			agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ConstraintStatements()...,
		),
		"\n",
	)
	for _, fragment := range []string{
		"ae_hrrr_lifecycle_dispatch_intents",
		"ae_hrrr_lifecycle_dispatch_claim_requests",
		"ae_hrrr_lifecycle_dispatch_claim_receipts",
		"ae_hrrr_lifecycle_dispatch_claim_current",
		"ever_dispatch_authorized BOOLEAN NOT NULL",
		"dispatch-authorized-first-delivery",
		"reconcile-only-replay",
		"expected_dispatch_ledger_revision BIGINT NOT NULL",
		"expected_prior_stage_claim_receipt_digest TEXT",
		"expected_prior_claim_expires_at TIMESTAMPTZ",
		"agent_evaluation_jsonb_object_key_count(candidate_request_json)<>12",
		"'expectedDispatchLedgerRevision','expectedDispatchGeneration'",
		"'expectedPriorStageClaimReceiptDigest','expectedPriorClaimExpiresAt'",
		"generation_transition TEXT NOT NULL",
		"'generationTransition',generation_transition",
		"generation_transition:='initial-first-delivery'",
		"generation_transition:='generation-retained'",
		"generation_transition:='expired-owner-takeover'",
		"dispatch_generation:=current_row.dispatch_generation+1",
		"dispatch_ledger_revision:=current_row.dispatch_ledger_revision+1",
		"claim_agent_evaluation_hosted_runtime_lifecycle_dispatch",
		"hosted-runtime-lifecycle-first-delivery",
		"ae_hrrr_lifecycle_result_spools",
		"aad_digest TEXT NOT NULL",
		"agent_evaluation_jsonb_object_key_count(NEW.aad_json)<>21",
		"agent_evaluation_jsonb_object_key_count(NEW.spool_receipt_json)<>36",
		"'maximumAgeMs',691200000",
		"expires_at<=spooled_at+INTERVAL '8 days'",
		"NEW.lifecycle_expires_at<>LEAST(",
		"COALESCE(resource_row.resource_expires_at,registration_row.expires_at",
		"ciphertext_digest TEXT NOT NULL",
		"octet_length(ciphertext_bytes)=0",
		"ae_hrrr_lifecycle_transport_journals",
		"'deleted','partial-create-requires-cleanup'",
		"ae_hrrr_lifecycle_journal_archives",
		"ae_hrrr_lifecycle_journal_archive_roots",
		"transport_store_receipt_history_digest TEXT NOT NULL",
		"octet_length(transport_store_receipt_history_bytes) BETWEEN 1 AND 32768",
		"idx_agent_eval_hosted_runtime_lifecycle_archive_page",
		"octet_length(record_bytes) BETWEEN 1 AND 139264",
		"octet_length(record_bytes) BETWEEN 1 AND 155648",
		"octet_length(family_bytes) BETWEEN 1 AND 13697024",
		"record_count BETWEEN 8 AND 88",
		"v46_eligible BOOLEAN NOT NULL DEFAULT TRUE",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("lifecycle v6 migration is missing %q", fragment)
		}
	}
	if strings.Contains(
		strings.Join(agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6Statements(), "\n"),
		"'provider-outcome-unresolved'",
	) {
		t.Fatal("unresolved Provider outcome must remain unfinished and cannot enter a final journal")
	}
}

func TestAgentEvaluationHostedRuntimeLifecycleV6TransportStoreAndSealAreDurable(t *testing.T) {
	statements := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6TransportStatements(),
		"\n",
	)
	for _, fragment := range []string{
		"store_agent_evaluation_hosted_runtime_lifecycle_transport",
		"agent_evaluation_jsonb_object_key_count(request_value)<>13",
		"expectedPriorTransportStoreReceiptDigest",
		"prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-request",
		"dispatchStageClaimHistorySet",
		"dispatchStageClaimHistorySetDigest",
		"agent_evaluation_jsonb_object_key_count(receipt_value)<>20",
		"supersededSpoolReceiptDigest",
		"supersededSpoolDestroyedAt",
		"prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt",
		"existing.transport_store_receipt_bytes",
		"existing.transport_store_receipt_history_bytes",
		"agent_evaluation_hosted_runtime_lifecycle_transport_store_receipt_history",
		"transport store lost prior receipt CAS",
		"ledger_revision_value:=COALESCE(prior_store.transport_ledger_revision+1,1)",
		"transport_store_request_json<>candidate_request_json",
		"advance_agent_evaluation_hosted_runtime_lifecycle_owner_ledger",
		"agent_evaluation_jsonb_array_is_prefix",
		"agent_evaluation_hosted_runtime_lifecycle_claim_history_is_progressive_prefix",
		"lifecycle-transport-prefix",
		"transport store is not a current prefix extension",
		"destroyed-after-prefix-supersession",
		"transport-prefix-superseded",
		"ciphertext_bytes=''::bytea",
		"transport prefix lost current CAS",
		"ae_hrrr_lifecycle_seal_receipts",
		"acknowledge_agent_evaluation_hosted_runtime_lifecycle_seal",
		"agent_evaluation_jsonb_object_key_count(NEW.request_json)<>6",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>11",
		"existing.receipt_bytes",
		"spool_row.state<>'destroyed'",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("lifecycle v6 transport persistence is missing %q", fragment)
		}
	}
	constraints := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ConstraintStatements(),
		"\n",
	)
	for _, fragment := range []string{
		"'ciphertextSizeBytes',NEW.ciphertext_byte_length",
		"'aadDigest',NEW.aad_digest",
		"NEW.transport_store_request_json<>OLD.transport_store_request_json",
		"NEW.transport_stored_at<>OLD.transport_stored_at",
	} {
		if !strings.Contains(constraints, fragment) {
			t.Fatalf("lifecycle v6 spool authority constraint is missing %q", fragment)
		}
	}
	if !strings.Contains(strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6Statements(), "\n"),
		"idx_agent_eval_hosted_runtime_lifecycle_spool_current") {
		t.Fatal("lifecycle v6 progressive store lacks a single-current prefix index")
	}
}

func TestAgentEvaluationHostedRuntimeLifecycleV6ReconciliationStoreAndArchiveReadAreBounded(t *testing.T) {
	reconciliation := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ReconciliationStatements(),
		"\n",
	)
	for _, fragment := range []string{
		"store_agent_evaluation_hosted_runtime_lifecycle_reconciliation_observation",
		"agent_evaluation_jsonb_object_key_count(NEW.request_json)<>13",
		"NEW.observation_projection_json)<>22",
		"NEW.observation_store_request_json)<>8",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>19",
		"dispatchStageClaimReceiptDigest",
		"observation_store_request_digest=store_request_digest_value",
		"reconciliation observation lost first-store CAS",
		"existing.observation_store_request_bytes",
		"advance_agent_evaluation_hosted_runtime_lifecycle_owner_ledger",
		"result_spool_ref=EXCLUDED.result_spool_ref",
	} {
		if !strings.Contains(reconciliation, fragment) {
			t.Fatalf("lifecycle v6 reconciliation ingress is missing %q", fragment)
		}
	}
	physical := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6Statements(),
		"\n",
	)
	for _, fragment := range []string{
		"observation_store_request_digest TEXT NOT NULL",
		"observation_projection_digest TEXT NOT NULL",
		"UNIQUE (namespace_id,registration_request_digest,operation,mutation_sequence)",
		"idx_agent_eval_hosted_runtime_lifecycle_archive_page",
		"archive_record_digest",
		") WHERE v46_eligible",
	} {
		if !strings.Contains(physical, fragment) {
			t.Fatalf("lifecycle v6 observation/archive physical owner is missing %q", fragment)
		}
	}
}

func TestAgentEvaluationHostedRuntimeLifecycleV6RecoveryReadIsCurrentClaimBounded(t *testing.T) {
	statements := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6RecoveryReadStatements(),
		"\n",
	)
	for _, fragment := range []string{
		"ae_hrrr_lifecycle_transport_recovery_reads",
		"read_agent_evaluation_hosted_runtime_lifecycle_transport_recovery",
		"agent_evaluation_jsonb_object_key_count(candidate_request_json)<>12",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>19",
		"storedDispatchStageClaimHistorySet",
		"currentDispatchStageClaimHistorySet",
		"hosted-retrieval-runtime-resource.lifecycle-journal.transport.recovery.read",
		"current_row.current_claim_receipt_digest<>claim_digest_value",
		"claim_row.delivery_disposition<>'reconcile-only-replay'",
		"claim_row.prior_transport_receipt_digest<>prior_transport_digest_value",
		"candidate_read_at>=spool_row.expires_at",
		"candidate_expires_at>candidate_read_at+INTERVAL '125 seconds'",
		"existing.receipt_bytes",
		"dispatchStageClaimHistorySet",
		"agent_evaluation_hosted_runtime_lifecycle_claim_history_is_prefix(",
		"hosted runtime lifecycle recovery history is not a current prefix extension",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("lifecycle v6 recovery read is missing %q", fragment)
		}
	}
}

func TestAgentEvaluationHostedRuntimeLifecycleV6PartialCleanupOwnsKnownIDs(t *testing.T) {
	physical := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6PartialCleanupPhysicalStatements(),
		"\n",
	)
	constraints := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6PartialCleanupConstraintStatements(),
		"\n",
	)
	dispatch := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ConstraintStatements(),
		"\n",
	)
	health := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6HealthStatements(),
		"\n",
	)
	for _, fragment := range []string{
		"ae_hrrr_lifecycle_partial_cleanup_prepares",
		"ae_hrrr_lifecycle_partial_cleanup_claim_history",
		"ae_hrrr_lifecycle_partial_cleanup_claim_current",
		"release_eligible BOOLEAN NOT NULL DEFAULT FALSE",
		"claim_agent_evaluation_hosted_runtime_lifecycle_partial_cleanup",
		"generation_transition='expired-owner-takeover'",
		"partial cleanup takeover lost expiry CAS",
		"partial cleanup prepare cannot be deleted",
		"partial create permanently freezes registration result",
		"known_resource_ids_json<>expected_known_ids",
		"partial_cleanup_authority_digest<>expected_authority_digest",
		"state='cleaned'",
	} {
		if !strings.Contains(physical+constraints, fragment) {
			t.Fatalf("lifecycle v6 partial cleanup owner is missing %q", fragment)
		}
	}
	for _, fragment := range []string{
		"partial_prepare.state='cleanup-claimed'",
		"partial_current.current_claim_receipt_digest=",
		"partial_current.claim_expires_at>NEW.created_at",
		"partial_prepare.known_resource_ids_json",
		"registration_row.registration_request_digest IS NULL",
	} {
		if !strings.Contains(dispatch, fragment) {
			t.Fatalf("lifecycle v6 partial delete authority is missing %q", fragment)
		}
	}
	for _, fragment := range []string{
		"partial_prepare_owner_revision",
		"prepare.state<>'cleaned'",
		"prepare.expires_at<=candidate_summarized_at",
		"claim.claim_expires_at<=candidate_summarized_at",
		"journal.business_outcome='abandoned-before-provider-effect'",
	} {
		if !strings.Contains(health, fragment) {
			t.Fatalf("lifecycle v6 partial cleanup health is missing %q", fragment)
		}
	}
	if strings.Contains(constraints, "run_terminal_fence") ||
		strings.Contains(constraints, "candidate_claimed_at>=prepare.expires_at") ||
		strings.Contains(constraints, "candidate_claim_expires_at>prepare.expires_at") {
		t.Fatal("partial cleanup expiry recovery gained a terminal-fence or prepare-expiry dependency")
	}
}

func TestAgentEvaluationHostedRuntimeLifecycleV6UnfinishedDiscoveryIsSnapshotBounded(t *testing.T) {
	statements := strings.Join(
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6UnfinishedDiscoveryStatements(),
		"\n",
	)
	for _, fragment := range []string{
		"agent_evaluation_jsonb_object_key_count(candidate_request_json)<>15",
		"agent_evaluation_jsonb_object_key_count(candidate)<>13",
		"'version',1,'registrationRequest',registration_row.request_json",
		"'registrationRequestDigest',registration_row.request_digest",
		"candidate->>'registrationRequestDigest'<>",
		"candidate#>>'{registrationRequest,requestDigest}'<>",
		"request.request_json=candidate->'registrationRequest'",
		"unfinished candidate lacks durable registration request",
		"agent_evaluation_jsonb_object_key_count(NEW.page_json)<>14",
		"page_size_value NOT BETWEEN 1 AND 8",
		"candidate_snapshot_at>requested_at_value+INTERVAL '125 seconds'",
		"transport-stored-before-seal",
		"staged-before-transport",
		"existing.page_bytes",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("lifecycle v6 unfinished discovery is missing %q", fragment)
		}
	}
}

func TestAgentEvaluationHostedRuntimeLifecycleV6BudgetRecoveryAndHealthAreCurrent(t *testing.T) {
	statements := strings.Join(agentEvaluationHostedV6Migration().statements, "\n")
	for _, fragment := range []string{
		"agent_evaluation_hosted_runtime_v6_budget_floor_valid",
		"maximum>=210 FROM normalized WHERE unit='hosted-search-query'",
		"maximum>=222 FROM normalized WHERE unit='hosted-tool-call'",
		"maximum>=310 FROM normalized WHERE unit='provider-upload-byte'",
		"maximum>=214272000 FROM normalized",
		"ae_hrrr_lifecycle_unfinished_operations",
		"reconciliationObservationReceiptSet",
		"state IN ('active','retained-encrypted')",
		"sealed_journal_record_digest IS NULL",
		"ae_hrrr_lifecycle_journal_archives",
		"ae_hrrr_lifecycle_journal_archive_roots",
		"expected_closure_kind TEXT",
		"expected_closure_kind:=CASE",
		"candidate_budget_closure_projection->>'closureKind'<>expected_closure_kind",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("lifecycle v6 budget/recovery/health is missing %q", fragment)
		}
	}
	if strings.Contains(statements, "END THEN") {
		t.Fatal("v46 PL/pgSQL still uses ambiguous CASE ... END THEN")
	}
}

func TestAgentEvaluationHostedV6IsIndependentlyRecordedAfterV45(t *testing.T) {
	migration := agentEvaluationHostedV6Migration()
	if migration.version != 46 {
		t.Fatalf("hosted lifecycle migration version=%d, want 46", migration.version)
	}
	if migration.name != "g4-agent-evaluation-hosted-lifecycle-v6" {
		t.Fatalf("hosted lifecycle migration name=%q", migration.name)
	}
	statements := strings.Join(migration.statements, "\n")
	for _, fragment := range []string{
		"ae_hrrr_lifecycle_dispatch_intents",
		"ae_hrrr_lifecycle_result_spools",
		"ADD COLUMN IF NOT EXISTS v46_eligible BOOLEAN",
		"SET LOCAL session_replication_role = 'replica'",
		"SET LOCAL session_replication_role = 'origin'",
		"agent_evaluation_authority_attestation_v46_roots",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("independent v46 migration is missing %q", fragment)
		}
	}
	legacy := agentEvaluationAttemptAuthorityMigration()
	if legacy.version != 45 {
		t.Fatalf("attempt authority migration version=%d, want 45", legacy.version)
	}
	legacyStatements := strings.Join(legacy.statements, "\n")
	if strings.Contains(legacyStatements,
		"ae_hrrr_lifecycle_dispatch_intents") {
		t.Fatal("already-recorded v45 migration still owns hosted lifecycle v6")
	}
}

func TestAgentEvaluationArchiveV46RootHardCutIncludesLifecycleJournalFamily(t *testing.T) {
	statements := strings.Join(agentEvaluationArchiveV46RootStatements(), "\n")
	for _, fragment := range []string{
		"agent_evaluation_authority_attestation_v46_roots",
		"agent_evaluation_evidence_root_v46_roots",
		"hosted_retrieval_runtime_resource_lifecycle_journal_set_digest TEXT NOT NULL",
		"hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest TEXT NOT NULL",
		"enforce_agent_evaluation_v46_publication_insert",
		"NEW.v45_eligible IS DISTINCT FROM FALSE",
		"agent_evaluation_authority_attestations_v46_roots_required",
		"agent_evaluation_evidence_roots_v46_roots_required",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("archive v46 hard cut is missing %q", fragment)
		}
	}
}

func TestAgentEvaluationV46EligibilityCoversEveryProductionConsumerTable(t *testing.T) {
	statements := strings.Join(agentEvaluationV46EligibilityStatements(), "\n")
	for _, table := range []string{
		"agent_evaluation_controlled_authority_requests",
		"agent_evaluation_attempt_authority_owner_receipts",
		"agent_evaluation_capability_effect_provider_journal_abandonments",
		"agent_evaluation_capability_effect_provider_journal_executions",
		"agent_evaluation_capability_effect_provider_journal_results",
		"agent_evaluation_capability_effect_provider_journal_stages",
		"agent_evaluation_capability_effect_source_consumption_claims",
		"agent_evaluation_capability_probe_provider_resource_cleanups",
		"agent_evaluation_capability_probe_provider_resource_registrations",
		"ae_hrrr_cleanup_archives",
		"ae_hrrr_registration_requests",
		"ae_hrrr_registration_results",
		"ae_hrrr_run_terminal_fences",
		"ae_hrrr_sets",
		"agent_evaluation_hosted_retrieval_runtime_resources",
		"agent_evaluation_native_optional_capability_bootstrap_sources",
		"agent_evaluation_native_provider_state_vault_records",
		"agent_evaluation_native_provider_state_vault_recoveries",
		"agent_evaluation_optional_capability_fact_sources",
		"agent_evaluation_optional_fact_authorities",
		"agent_evaluation_owner_state_cas_artifacts",
		"agent_evaluation_owner_state_operations",
		"agent_evaluation_owner_states",
		"agent_evaluation_provider_capability_observation_commit_links",
		"agent_evaluation_runtime_fact_source_owner_registrations",
	} {
		if !strings.Contains(statements, "ALTER TABLE "+table+" ADD COLUMN IF NOT EXISTS v46_eligible BOOLEAN") {
			t.Fatalf("v46 eligibility migration does not cover %s", table)
		}
	}
	if strings.Contains(statements, "v45_eligible") {
		t.Fatal("current eligibility owner consumes v45 eligibility")
	}
}
