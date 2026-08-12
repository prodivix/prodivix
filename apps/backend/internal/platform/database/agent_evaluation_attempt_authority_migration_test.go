package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"strings"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func beginAttemptAuthorityPreflightTest(t *testing.T) (*sql.Tx, sqlmock.Sqlmock, func()) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectBegin()
	tx, err := db.Begin()
	if err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	cleanup := func() {
		mock.ExpectRollback()
		_ = tx.Rollback()
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
		_ = db.Close()
	}
	return tx, mock, cleanup
}

func expectAttemptAuthorityPreflightLock(mock sqlmock.Sqlmock) {
	mock.ExpectExec("LOCK TABLE agent_evaluation_controlled_authority_requests").
		WillReturnResult(sqlmock.NewResult(0, 0))
}

func TestAgentEvaluationAttemptAuthorityPreflightLocksV41FactsForClassification(t *testing.T) {
	tx, mock, cleanup := beginAttemptAuthorityPreflightTest(t)
	defer cleanup()
	expectAttemptAuthorityPreflightLock(mock)

	if err := preflightAgentEvaluationAttemptAuthority(context.Background(), tx); err != nil {
		t.Fatalf("preflight recoverable v41 rows: %v", err)
	}
}

func TestAgentEvaluationAttemptAuthorityV45QuarantinesLegacyWithoutSyntheticRoots(t *testing.T) {
	statements := strings.Join(agentEvaluationAttemptAuthorityMigration().statements, "\n")
	for _, fragment := range []string{
		"ADD COLUMN IF NOT EXISTS v45_eligible BOOLEAN",
		"state IN ('dispatched', 'sealed')",
		"SET v45_eligible=FALSE WHERE v45_eligible IS NULL",
		"agent_evaluation_authority_attestation_v45_roots",
		"agent_evaluation_evidence_root_v45_roots",
		"DEFERRABLE INITIALLY DEFERRED",
		"new controlled authority rows must use v45 authority",
		"new evaluation publication must use v45 authority",
		"legacy controlled authority requires a new v45 attempt",
		"legacy attempt cannot accept v45 provider observations",
		"legacy attempt cannot accept v45 capability-specific facts",
		"operation='verification.cell.admit'",
		"route_binding='g3-cell-admission'",
		"agent_evaluation_controlled_authority_v45_response_check",
		"agent_eval_controlled_authority_v45_g3_cell_admission_check",
		"G3 cell admission acknowledgement transition is invalid",
		"G3 cell admission seal drifted from its acknowledged response",
		"selected_runtime_fact_envelope_set_digest TEXT NOT NULL",
		"source_authority_set_digest TEXT NOT NULL",
		"'factAuthorities'",
		"'selectedRuntimeFactEnvelopeSetDigest'",
		"'sourceAuthoritySetDigest'",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_admissions",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_response_spools",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_reference_receipts",
		"prodivix.agent-evaluation-capability-probe-encrypted-response-spool-source-receipt",
		"enforce_agent_evaluation_capability_probe_response_spool_binding",
		"ciphertext_byte_length=octet_length(ciphertext_bytes)",
		"[A-Za-z0-9._:@/-]{0,255}",
		"agent_evaluation_capability_probe_response_spools_linked_insert",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_plan_capability_probe_admission_links",
		"prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt",
		"agent_evaluation_capability_probe_references_required",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_runtime_fact_source_owner_registrations",
		"prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt",
		"agent_evaluation_plans_runtime_fact_source_registrations_required",
		"registration_receipt_digest TEXT NOT NULL",
		"source_request_digest TEXT NOT NULL",
		"INTERVAL '8 days'",
		"registered_at IS NULL OR registered_at >= claimed_at",
		"registration_count >= 15",
		"'g4-provider-background-job'",
		"'sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195'",
		"'g4-provider-hosted-retrieval-core'",
		"'sha256-666c6df670c77605562ff82765013291f99045f36edcb8db0af209267c91565d'",
		"'g4-provider-hosted-retrieval-document'",
		"'sha256-8ced3fda38a88c0819a6a2d4603e453f515a9c98efadc7c270af194349c5b90e'",
		"'g4-provider-isolated-cache'",
		"'sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103'",
		"'g4-provider-reasoning-continuation'",
		"'sha256-5c84287b4c1e16fb0c1eda862a8e44754503a3fa0a4b61a16e2d2f2465072d34'",
		"optional_authority->'runtimeFactSourceAuthority'",
		"target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,authorityDigest}'",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_optional_capability_fact_sources",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_optional_fact_authorities",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_request_ref_authorities",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_current_turn_events",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_input_authority_registry_receipts",
		"selected_source_observation_receipt_digest TEXT",
		"selected_source_handle_digest TEXT",
		"prodivix.agent-evaluation-capability-effect-request-ref-authority-request",
		"prodivix.agent-evaluation-capability-effect-current-turn-event-request",
		"prodivix.agent-evaluation-capability-effect-input-authority-registry-receipt",
		"enforce_agent_evaluation_capability_effect_request_ref_binding",
		"enforce_agent_evaluation_capability_effect_current_event_binding",
		"enforce_agent_evaluation_capability_effect_registry_binding",
		"capability-effect selected source fact is missing, ambiguous, or stale",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>31",
		"'stateVaultSealRequest','stateVaultSealReceipt'",
		"bootstrap.target_id=ref.request_json#>>'{descriptor,targetId}'",
		"bootstrap.runtime_fact_source_authority_digest=",
		"bootstrap.registration_receipt_digest=ref.registration_receipt_digest",
		"bootstrap.fact_digest=NEW.source_handle_digest",
		"bootstrap.fact_json=selected_fact",
		"'provider-job' THEN 'provider-job-active-status'",
		"vault.status='active' AND vault.v45_eligible",
		"vault.provider_state_reference_digest=",
		"vault.seal_request_json=",
		"capability-effect stateful registry lacks one exact active state-vault seal",
		"source_seal_digest TEXT NOT NULL",
		"native_bootstrap_source_request_digest TEXT",
		"native_bootstrap_source_receipt_digest TEXT",
		"native_provider_source_receipt_digest TEXT",
		"native_provider_source_digest TEXT",
		"source_pre_effect_intent_digest TEXT",
		"source_pre_effect_intent_json JSONB",
		"source_effect_receipt_digest TEXT",
		"source_effect_receipt_json JSONB",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_native_optional_capability_bootstrap_sources",
		"native optional bootstrap lacks exact plan, registration, and probe authority",
		"pre_effect_intent_digest TEXT",
		"prodivix.agent-evaluation-capability-pre-effect-intent",
		"route_binding='capability-runtime/execute-tool'",
		"shared-effect result ingress conflicts with durable state",
		"shared-effect seal drifted from its durable result ingress",
		"octet_length(response_bytes) BETWEEN 1 AND 33554432",
		"shared-effect owner receipt projection drifted from durable preimages",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_owner_states",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_owner_state_operations",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_owner_state_cas_artifacts",
		"agent_evaluation_owner_stateful_operation",
		"session.reconcile-dispatched",
		"promotions/{promotionId}/artifacts/{artifactId}",
		"prodivix.agent-evaluation-owner-state-bundle",
		"agent_evaluation_owner_state_checkpoint_valid",
		"'{snapshot,initialCheckpoint}'",
		"'{snapshot,currentCheckpoint}'",
		"prodivix.agent-evaluation-sealed-owner-operation",
		"owner-state result acknowledgement transition is invalid",
		"owner-state seal drifted from its durable result acknowledgement",
		"uploadCapability",
		"attestationNonce",
		"evaluation owner-state family exceeds frozen 8GiB capacity",
		"capability_probe_admission_set_digest TEXT NOT NULL",
		"capability_probe_reference_receipt_set_digest TEXT NOT NULL",
		"runtime_fact_source_owner_registration_set_digest TEXT NOT NULL",
		"capability_probe_provider_resource_cleanup_set_digest TEXT NOT NULL",
		"optional_capability_fact_source_set_digest TEXT NOT NULL",
		"optional_capability_fact_authority_set_digest TEXT NOT NULL",
		"5880",
		"8589934592",
		"receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 legacy quarantine omits %q", fragment)
		}
	}
}

func TestAgentEvaluationProviderResourceCleanupV45UsesSealedExactAuthority(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_cleanups",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_cleanup_receipts",
		"resource_registration_request_digest TEXT NOT NULL",
		"deletion_authority_receipt_digest TEXT NOT NULL",
		"cleanup_receipt_digest TEXT",
		"result_ingress_receipt_digest TEXT",
		"record_count>=4",
		"resourceResults",
		"auxiliaryResourceIds",
		"reject_agent_evaluation_repository_commit_finalized_mutation",
		"probeProviderResourceCleanupReceipt",
		"cleanup.completed_at<=plan_record.planned_at",
		"capability_probe_provider_resource_cleanup_set_digest TEXT NOT NULL",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 provider-resource cleanup authority omits %q", fragment)
		}
	}
}

func TestAgentEvaluationNativeProviderStateVaultV45UsesOneDestructiveLifecycle(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_native_provider_state_vault_records",
		"vault_owner_instance_id TEXT NOT NULL",
		"UNIQUE (namespace_id,seal_request_digest)",
		"UNIQUE (namespace_id,seal_receipt_digest)",
		"UNIQUE (namespace_id,resolve_request_digest)",
		"UNIQUE (namespace_id,retirement_receipt_digest)",
		"octet_length(ciphertext_bytes) BETWEEN 17 AND 528",
		"octet_length(ciphertext_nonce)=12",
		"octet_length(wrapped_state_key_bytes)=48",
		"status='retired' AND ciphertext_bytes IS NULL",
		"status='expired-unqualified'",
		"forced_expiry_tombstone_digest TEXT",
		"maximum-lifecycle-ack-window-elapsed",
		"NEW.forced_expired_at<=NEW.expires_at+INTERVAL '30 seconds'",
		"request_expires_at<>request_observed_at+INTERVAL '125 seconds'",
		"NEW.sealed_at>request_observed_at+INTERVAL '30 seconds'",
		"record_count>=5880",
		"nativeProviderStateVaultEncryption,authority",
		"seal_request_json->>'format' IS DISTINCT FROM",
		"seal_receipt_json->'retirementRequired' IS DISTINCT FROM 'true'::jsonb",
		"aad->>'attemptId' IS DISTINCT FROM NEW.attempt_id",
		"run_config_authority->>'keyReferenceDigest' ~ '^sha256-[a-f0-9]{64}$'",
		"resolve_request_json->>'taskId' IS DISTINCT FROM NEW.task_id",
		"resolve_receipt_json->>'providerStateReferenceDigest' IS DISTINCT FROM",
		"retire_request_json->>'disposition' IS DISTINCT FROM NEW.disposition",
		"retirement_receipt_json->>'stateKeyDestructionReceiptDigest' ~ '^sha256-[a-f0-9]{64}$'",
		"agent_evaluation_native_provider_state_vault_instance_active",
		"agent_evaluation_native_provider_state_vault_expired_active",
		"native optional bootstrap lacks exact active state-vault seal",
		"'provider-job-active-status','provider-job-terminal-status'",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 native Provider state vault omits %q", fragment)
		}
	}
}

func TestAgentEvaluationNativeProviderStateVaultRecoveryV45UsesExactZeroResidualFence(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_native_provider_state_vault_recoveries",
		"recovery_request_digest TEXT",
		"UNIQUE ( namespace_id,plan_digest,repository_commit,vault_owner_instance_id )",
		"agent_eval_native_provider_state_vault_recovery_member_fk FOREIGN KEY",
		"DEFERRABLE INITIALLY DEFERRED",
		"WHERE recovery_request_digest IS NOT NULL",
		"agent_evaluation_jsonb_object_key_count(NEW.recovery_request_json)<>10",
		"agent_evaluation_jsonb_object_key_count(NEW.recovery_receipt_json)<>18",
		"owner-crash-recovery",
		"native-provider-state-vault-recovery-terminal-record-set",
		"sha256(convert_to(terminal_set_canonical,'UTF8'))",
		"member.recovery_request_digest=NEW.recovery_request_digest",
		"member.ciphertext_bytes IS NOT NULL",
		"member.forced_expired_at IS DISTINCT FROM NEW.completed_at",
		"residual_count<>0",
		"native Provider state vault owner is recovery-fenced",
		"native Provider state vault recovery member is already sealed",
		"BEFORE UPDATE OR DELETE ON agent_evaluation_native_provider_state_vault_recoveries",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 native Provider state vault recovery omits %q", fragment)
		}
	}
}

func TestAgentEvaluationCapabilityEffectInputAuthorityV45UsesFrozenDurableSources(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"UNIQUE ( namespace_id, plan_digest, repository_commit, attempt_id, turn_index )",
		"binding_kind='hosted-retrieval-query' AND selected_source_observation_receipt_digest IS NULL",
		"binding_kind<>'hosted-retrieval-query' AND turn_index>=1",
		"target_ref<>selected_source_handle_digest",
		"registration.state='sealed' AND registration.v45_eligible",
		"observation_turn>=NEW.turn_index",
		"fact_count<>1 OR selected_fact_count<>1",
		"later.turn_index>observation_turn AND later.turn_index<NEW.turn_index",
		"provider_payload->>'name'<>NEW.tool_id",
		"ref_found:=FOUND",
		"event_found:=FOUND",
		"observation_found:=FOUND",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>31",
		"sourceObservationReceiptDigest'<>'null'::jsonb",
		"agent_evaluation_transport_dispatch_intents intent",
		"agent_evaluation_transport_receipts transport",
		"agent_evaluation_provider_result_spool_receipts spool",
		"CURRENT_TIMESTAMP>=ref.expires_at",
		"NEW.issued_at<CURRENT_TIMESTAMP-INTERVAL '30 seconds'",
		"NEW.issued_at>CURRENT_TIMESTAMP+INTERVAL '30 seconds'",
		"family_count>=5880",
		"committed_bytes+incoming_bytes>8589934592",
		"reject_agent_immutable_mutation()",
		"reject_agent_evaluation_finalized_mutation()",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 capability-effect input authority omits %q", fragment)
		}
	}
}

func TestAgentEvaluationProviderResourceAndNativeBootstrapV45UseDurableRawAuthorities(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_registrations",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_manifests",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_content_upload_receipts",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts",
		"agent_evaluation_jsonb_object_key_count(NEW.request_json)<>9",
		"agent_evaluation_jsonb_object_key_count(resource)<>18",
		"probeProviderResourceAuthority",
		"result_ingress_digest TEXT",
		"result_ingress_receipt_digest TEXT",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>12",
		"deletionRequestProjection",
		"auxiliaryResourceIds",
		"jsonb_array_length(auxiliary_resource_ids)>32",
		"capability probe provider resource exceeds frozen registration capacity",
		"capability probe provider resource lacks exact atomic components",
		"plan target provider-resource authority drifted from admission",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_native_optional_capability_bootstrap_sources",
		"native_bootstrap_source_request_digest TEXT",
		"native_bootstrap_source_receipt_digest TEXT",
		"result_spool_aad_digest TEXT NOT NULL",
		"result_spool_envelope_digest TEXT NOT NULL",
		"native optional bootstrap exceeds frozen attempt capacity",
		"native optional bootstrap drifted from raw transport/spool authority",
		"native optional bootstrap lacks exact plan, registration, and probe authority",
		"agent_evaluation_jsonb_object_key_count( NEW.native_provider_source_receipt_json )<>17",
		"native_source->>'sourceKind'='provider-job-active-status'",
		"native_source->>'providerStatus' IN ('in-progress','queued')",
		"agent_evaluation_jsonb_object_key_count(NEW.fact_json->'value')=8",
		"NEW.fact_json#>>'{value,callbackAuthority}'='active'",
		"executionIdentityAuthority",
		"cacheIsolationAuthorityDigest",
		"NEW.observed_at>transport_completed_at+INTERVAL '30 seconds'",
		"agent_eval_optional_fact_native_bootstrap_fk",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 provider-resource/native-bootstrap authority omits %q", fragment)
		}
	}
}

func TestAgentEvaluationProductionRunConfigArtifactV45ReplacesPathAuthority(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_production_run_config_artifacts",
		"PRIMARY KEY (namespace_id, plan_digest, repository_commit)",
		"UNIQUE (namespace_id, plan_digest, repository_commit, binding_digest)",
		"agent_evaluation_production_run_config_artifact_binding_valid",
		"run_config_artifact_binding_digest TEXT NOT NULL",
		"run_config_artifact_binding_json JSONB NOT NULL",
		"run_config_artifact_binding_bytes BYTEA NOT NULL",
		"DROP COLUMN IF EXISTS source_config_path",
		"agent_eval_holdout_run_config_artifact_binding_fk",
		"agent_eval_archive_run_config_artifact_binding_fk",
		"runConfigByteLength",
		"production-run-config.json",
		"16777216",
		"65536",
		"NEW.stored_at<plan_planned_at OR NEW.stored_at>plan_expires_at",
		"path-only evaluation closure requires a fresh run-config artifact qualification",
		"reject_agent_immutable_mutation()",
		"reject_agent_evaluation_finalized_mutation()",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 production run-config artifact authority omits %q", fragment)
		}
	}
}

func TestAgentEvaluationOwnerStateV45UsesOneDurableCASOwner(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"agent_evaluation_owner_state_operations",
		"agent_evaluation_owner_states",
		"agent_evaluation_owner_state_cas_artifacts",
		"prior_owner_state_revision BIGINT NOT NULL",
		"prior_owner_state_root_digest TEXT",
		"owner_state_revision=prior_owner_state_revision+1",
		"byte_length BETWEEN 1 AND 8388608",
		"artifact_count>=128",
		"25165824",
		"7864320",
		"8589934592",
		"DEFERRABLE INITIALLY DEFERRED",
		"evaluation owner-state bundle contains an uncommitted CAS descriptor",
		"evaluation owner state lacks one exact sealed operation",
		"owner-state journal lacks one exact durable operation",
		"agent_evaluation_owner_state_contains_forbidden_material",
		"idx_agent_evaluation_owner_states_bounded_list",
		"owner_state_id COLLATE \"C\"",
		"bundle_json#>>'{snapshot,state}' IN ('active','destroyed')",
		"'registered','active','prepared','finalized','destroyed'",
		"responseProjectionDigest",
		"agent_evaluation_controlled_authority_owner_state_operation",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 owner-state authority omits %q", fragment)
		}
	}
	for _, duplicateOwnerColumn := range []string{
		"ADD COLUMN IF NOT EXISTS owner_state_id",
		"ADD COLUMN IF NOT EXISTS prior_owner_state_revision",
		"ADD COLUMN IF NOT EXISTS prior_owner_state_root_digest",
	} {
		if strings.Contains(statements, duplicateOwnerColumn) {
			t.Fatalf("controlled journal became a second owner via %q", duplicateOwnerColumn)
		}
	}
}

func TestAgentEvaluationRuntimeFactSourceRegistrationOnlyAdmitsCanonicalFactBackedProfiles(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, exactTuple := range []string{
		"'g4-provider-background-job', 'sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195', 'provider.background-job', 'sealed-provider-response-metadata'",
		"'g4-provider-hosted-retrieval-core', 'sha256-666c6df670c77605562ff82765013291f99045f36edcb8db0af209267c91565d', 'provider.hosted-retrieval', 'sealed-hosted-owner-result'",
		"'g4-provider-hosted-retrieval-document', 'sha256-8ced3fda38a88c0819a6a2d4603e453f515a9c98efadc7c270af194349c5b90e', 'provider.hosted-retrieval', 'sealed-hosted-owner-result'",
		"'g4-provider-isolated-cache', 'sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103', 'provider.isolated-cache', 'sealed-provider-response-metadata'",
		"'g4-provider-reasoning-continuation', 'sha256-5c84287b4c1e16fb0c1eda862a8e44754503a3fa0a4b61a16e2d2f2465072d34', 'provider.reasoning-continuation', 'sealed-provider-response-metadata'",
	} {
		if !strings.Contains(statements, exactTuple) {
			t.Fatalf("v45 runtime-fact registration omits exact profile authority tuple %q", exactTuple)
		}
	}
	if !strings.Contains(statements,
		"(registered_at IS NULL OR registered_at >= claimed_at)") {
		t.Fatal("v45 runtime-fact registration permits pre-claim owner health")
	}
}

func TestAgentEvaluationProviderObservationRequiresCurrentFactAuthorityBinding(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"jsonb_object_keys(fact_authority)) <> 19",
		"'sourceKind'", "'routeBinding'", "'registrationAuthorityIssuerId'",
		"'registrationReceiptDigest'", "'runtimeFactSourceAuthorityDigest'",
		"fact_authority->>'sourceKind' IS NOT NULL",
		"authority.source_kind=fact_authority->>'sourceKind'",
		"authority.source_authority_route_binding= fact_authority->>'routeBinding'",
		"authority.source_registration_authority_issuer_id= fact_authority->>'registrationAuthorityIssuerId'",
		"authority.source_registration_receipt_digest= fact_authority->>'registrationReceiptDigest'",
		"authority.target_authority_digest= fact_authority->>'runtimeFactSourceAuthorityDigest'",
		"authority.source_owner_stage_digest= fact_authority->>'stageDigest'",
		"authority.source_owner_dispatch_ack_digest= fact_authority->>'dispatchAckDigest'",
		"source.source_effect_receipt_json->>'transportReceiptDigest'= fact_authority->>'transportReceiptDigest'",
		"source.source_effect_receipt_json->>'resultSpoolReceiptDigest'= fact_authority->>'resultSpoolReceiptDigest'",
		"source.source_effect_receipt_json->>'normalizedEventSetDigest'= fact_authority->>'normalizedEventSetDigest'",
		"source.source_pre_effect_intent_digest= authority.source_pre_effect_intent_digest",
		"source.source_effect_receipt_digest= authority.source_effect_receipt_digest",
		"agent_evaluation_optional_capability_fact_sources source",
		"agent_evaluation_runtime_fact_source_owner_registrations registration",
		"runtimeFactSourceAuthority,authorityDigest",
		"NEW.runtime_fact_envelope_json )) <> 31",
		"NEW.fact_authority_json )) <> 19",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 provider observation omits current fact authority binding %q", fragment)
		}
	}
	if strings.Contains(statements, "jsonb_object_keys(fact_authority)) <> 14") {
		t.Fatal("v45 provider observation still admits the legacy 14-key fact authority")
	}
}

func TestAgentEvaluationOptionalFactSourceSeparatesEffectLocalAndJournalAuthority(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"spool.transport_receipt_digest=transport.receipt_digest",
		"spool.response_body_digest=transport.response_body_digest",
		"(NEW.source_effect_receipt_json->>'sealedAt')::timestamptz>= transport.completed_at",
		"(NEW.source_effect_receipt_json->>'sealedAt')::timestamptz<= owner.completed_at",
		"(NEW.source_receipt_json->>'observedAt')::timestamptz=GREATEST(",
		"wire.response_json#>>'{effectSourceReceipt,transportReceiptDigest}'= NEW.transport_receipt_digest",
		"NEW.source_effect_receipt_json ? 'resultSpoolReceiptDigest'",
		"wire.response_json#>'{effectSourceReceipt,resultSpoolReceiptDigest}' IS NOT DISTINCT FROM COALESCE(",
		"to_jsonb(NEW.result_spool_receipt_digest), 'null'::jsonb",
		"wire.response_json#>>'{effectSourceReceipt,normalizedEventSetDigest}'= NEW.normalized_event_set_digest",
		"wire.response_json->'effectSourceFact'=NEW.fact_json",
		"source.sealed_at<=NEW.staged_at",
		"(runtime_fact_envelope_json->>'observedAt')::timestamptz<=sealed_at",
		"(source.source_receipt_json->>'observedAt')::timestamptz= (NEW.runtime_fact_envelope_json->>'observedAt')::timestamptz",
		"'capability-effect-owner-request.' || substring(",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 optional fact source omits split local/journal authority %q", fragment)
		}
	}
	for _, legacyEquality := range []string{
		"NEW.pre_effect_intent_json->>'ownerRequestDigest' <> NEW.request_digest",
		"NEW.source_pre_effect_intent_json->>'ownerRequestDigest'= NEW.source_owner_request_digest",
	} {
		if strings.Contains(statements, legacyEquality) {
			t.Fatalf("v45 optional fact source still collapses independent owner identities %q", legacyEquality)
		}
	}
}

func TestAgentEvaluationOptionalFactInnerResultSpoolIsNullableAndObservedFailClosed(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"result_spool_receipt_digest TEXT, normalized_event_set_digest TEXT NOT NULL",
		"(result_spool_receipt_digest IS NULL OR result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$')",
		"source_receipt_json ? 'resultSpoolReceiptDigest'",
		"source_receipt_json->'resultSpoolReceiptDigest' IS NOT DISTINCT FROM COALESCE(to_jsonb(result_spool_receipt_digest), 'null'::jsonb)",
		"source_receipt_json->>'outcome'='observed' AND fact_json IS NOT NULL AND result_spool_receipt_digest IS NOT NULL",
		"outcome='observed' AND result_spool_receipt_digest IS NOT NULL",
		"source.result_spool_receipt_digest IS NOT DISTINCT FROM NEW.result_spool_receipt_digest",
		"JOIN agent_evaluation_provider_result_spool_receipts spool",
		"spool.response_digest=NEW.response_digest",
		"provider_runtime_journal_result_record_digest TEXT",
		"provider_runtime_result_seal_receipt_digest TEXT",
		"provider_runtime_journal_result_record_digest IS NULL AND provider_runtime_result_seal_receipt_digest IS NULL",
		"provider_runtime_journal_result_record_digest IS NOT NULL AND provider_runtime_result_seal_receipt_digest IS NOT NULL",
		"source_effect_receipt_json->>'providerRuntimeJournalResultRecordDigest'= provider_runtime_journal_result_record_digest",
		"source_effect_receipt_json->>'providerRuntimeResultSealReceiptDigest'= provider_runtime_result_seal_receipt_digest",
		"agent_evaluation_jsonb_object_key_count(NEW.source_effect_receipt_json)<>25",
		"'stateVaultResolveRequest','stateVaultResolveReceipt','stateVaultRetireRequest', 'stateVaultRetirementReceipt'",
		"binding_kind IN ('provider-job','opaque-continuation')",
		"jsonb_typeof(NEW.source_effect_receipt_json->'stateVaultResolveRequest')<>'object'",
		"NEW.source_effect_receipt_json->'stateVaultResolveRequest' IS DISTINCT FROM 'null'::jsonb",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 optional fact nullable inner spool contract omits %q", fragment)
		}
	}
}

func TestAgentEvaluationCapabilityEffectProviderJournalUsesOneDurableTerminalLedger(t *testing.T) {
	statements := strings.Join(strings.Fields(strings.Join(
		agentEvaluationAttemptAuthorityMigration().statements, "\n",
	)), " ")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_stages",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_executions",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_spool_payloads",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_spool_dispositions",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_results",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_abandonments",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_cleanup_requests",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_cleanup_receipts",
		"agent_evaluation_jsonb_object_key_count(stage_request)<>20",
		"agent_evaluation_jsonb_object_key_count(receipt)<>16",
		"agent_evaluation_jsonb_object_key_count(response)<>24",
		"retrieval_citation_resource_id TEXT",
		"'outputMarkerObserved','retrievalCitationResourceId','denialKind','observedAt'",
		"hosted Provider execution citation is absent, foreign, or ambiguous",
		"non-hosted Provider execution carries a retrieval citation",
		"hosted Provider journal stage lacks its durable active read lease",
		"resource.current_state_digest=stored_read.active_state_digest",
		"agent_evaluation_jsonb_object_key_count(spool_receipt)<>32",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>19",
		"agent_evaluation_jsonb_object_key_count(NEW.record_json)<>25",
		"idx_agent_eval_provider_journal_result_consumed_source",
		"WHERE consumed_input_source_fact_digest IS NOT NULL",
		"Provider journal owner requires exactly one terminal record",
		"Provider journal execution ACK lacks its encrypted spool",
		"Provider journal result disposition set drifted",
		"residual_encrypted_spool_count=0 AND unfinished_owner_count=0",
		"bodyless Provider execution carries spool metadata",
		"'executionReceipt','spoolAad','spoolEnvelopeAuthority'",
		"payload_count=0 AND execution_row.spool_receipt_digest IS NOT NULL",
		"RETURN NULL",
		"octet_length(record_bytes) BETWEEN 1 AND 24576",
		"WHEN 'hosted-retrieval-query' THEN 49152 ELSE 32768 END",
		"family_count>=5880",
		"(stage_count+1)*196608>1156055040",
		"provider_runtime_journal_result_record_digest",
		"provider_runtime_result_seal_receipt_digest",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_source_consumption_claims",
		"idx_agent_eval_capability_effect_live_source_claim",
		"WHERE status IN ('claimed','consumed')",
		"prodivix.agent-evaluation-capability-effect-source-consumption-claim",
		"capability-effect request-ref lacks its durable source-consumption claim",
		"Provider journal stage did not atomically consume its input source",
		"Provider journal result lacks its terminal source-consumption claim",
		"Provider journal abandonment lacks its consumed source claim",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 capability-effect Provider journal omits %q", fragment)
		}
	}
}

func TestAgentEvaluationHostedRetrievalRuntimeResourceUsesMonotonicOwnerAndDurableCleanup(t *testing.T) {
	migrationStatements := agentEvaluationAttemptAuthorityMigration().statements
	statements := strings.Join(strings.Fields(strings.Join(migrationStatements, "\n")), " ")
	for _, fragment := range []string{
		"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers",
		"ledger_revision= agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers.ledger_revision+1",
		"NEW.ledger_revision<>OLD.ledger_revision+1",
		"hosted runtime owner ledger is non-monotonic",
		"agent_evaluation_hosted_runtime_resource_owner_storage_summary",
		"idx_agent_eval_hosted_runtime_registration_results_health",
		"idx_agent_eval_hosted_runtime_resources_registration",
		"resource.read_lease_not_after>candidate_summarized_at",
		"hosted runtime read ledger is already sealed",
		"NEW.authority_digest||chr(31)||'hosted-runtime-read'",
		"resource.resource_expires_at<candidate_summarized_at",
		"registration.expires_at<candidate_summarized_at",
		"claim.claim_expires_at<candidate_summarized_at",
		"resource.registration_request_digest= registration.registration_request_digest",
		"resource.current_cleanup_claim_receipt_digest",
		"current_cleanup_claim_receipt_digest TEXT",
		"authority_digest,claim_generation",
		"authority_digest,request_digest",
		"agent_evaluation_hosted_runtime_terminal_fence",
		"COUNT(DISTINCT value->>'shardId')",
		"attempt_json#>>'{value,descriptor,descriptorDigest}'=descriptor_digest",
		"attempt_json#>>'{value,attemptDigest}'=attempt_digest",
		"attempt_json#>>'{value,status}'=status",
		"(attempt_json#>>'{value,completedAt}')::timestamptz=completed_at",
		"total_attempt_count<>plan_row.planned_journey_count",
		"checkpoint_json#>>'{value,state}'<>'completed'",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_requests",
		"agent_evaluation_jsonb_object_key_count(NEW.request_json)<>14",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_receipts",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>17",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests",
		"hosted-retrieval-runtime-resource.cleanup.post-matrix.claim",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests",
		"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts",
		"agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>25",
		"claim_source IN ('post-matrix','recovery')",
		"octet_length(receipt_bytes) BETWEEN 1 AND 245760",
		"cleanup claim receipt was not atomically installed as current",
		"idx_agent_eval_hosted_runtime_registration_stage_budget",
		"hosted-runtime-budget.'||substring(",
		"CREATE TRIGGER agent_eval_hosted_runtime_budget_settlements_exact",
		"hosted runtime budget without clean evidence requires full reconciliation",
		"agent_eval_hosted_runtime_budget_settlement_owner_revision",
		"agent_evaluation_hosted_runtime_cleanup_archive_family_budget_complete",
		"resource.lifecycle='cleaned' AND NOT EXISTS",
		"agent_eval_hosted_runtime_cleanup_archive_materializer",
		"NEW.cleanup_receipt_json->'resourceResults'<>( SELECT jsonb_agg(value ORDER BY value->>'resourceId' COLLATE \"C\")",
		"prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-archive-record",
		"agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots",
		"SELECT ledger_revision INTO owner_ledger_revision FROM agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers",
		"hosted runtime recovery scan revision drifted from owner ledger",
		"hosted runtime recovery page drifted from its durable snapshot",
		"detected_at>resource_expires_at",
	} {
		if !strings.Contains(statements, fragment) {
			t.Fatalf("v45 hosted retrieval runtime resource authority omits %q", fragment)
		}
	}
	if strings.Contains(statements,
		"read_lease_not_after<candidate_summarized_at") || strings.Contains(statements,
		"read_lease_not_after<=candidate_summarized_at") {
		t.Fatal("hosted owner health treats a naturally expired read lease as overdue")
	}
	if strings.Count(statements,
		"NEW.authority_digest||chr(31)||'hosted-runtime-read'") < 2 {
		t.Fatal("hosted read issuance and ledger-root sealing do not share one authority lock")
	}
	if strings.Contains(statements, "MAX(scan_ledger_revision)") {
		t.Fatal("hosted recovery scan uses a private revision instead of the monotonic owner ledger")
	}
	var overdueTable, claimTable, requestTable string
	for _, statement := range migrationStatements {
		normalized := strings.Join(strings.Fields(statement), " ")
		switch {
		case strings.Contains(normalized,
			"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_overdue_receipts"):
			overdueTable = normalized
		case strings.Contains(normalized,
			"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims"):
			claimTable = normalized
		case strings.Contains(normalized,
			"CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests"):
			requestTable = normalized
		}
	}
	if strings.Contains(overdueTable, "claim_generation") ||
		!strings.Contains(claimTable,
			"PRIMARY KEY ( namespace_id,plan_digest,repository_commit,authority_digest,claim_generation )") ||
		!strings.Contains(requestTable,
			"PRIMARY KEY ( namespace_id,plan_digest,repository_commit,authority_digest,request_digest )") {
		t.Fatalf("hosted cleanup history keys drifted: overdue=%q claim=%q request=%q",
			overdueTable, claimTable, requestTable)
	}
}

// The v41 statement sequence may already be recorded by production schemas.
// This fingerprint makes any later byte edit explicit and reviewable while v45
// carries every new authority column, table, trigger, and constraint.
func TestAgentEvaluationControlledAuthorityV41StatementBytesAreFrozen(t *testing.T) {
	migration := agentEvaluationControlledAuthorityMigration()
	if migration.version != 41 || migration.name != "g4-agent-evaluation-controlled-authority-journal" {
		t.Fatalf("controlled-authority migration identity = %d %q", migration.version, migration.name)
	}
	digest := sha256.Sum256([]byte(strings.Join(migration.statements, "\x00")))
	actual := hex.EncodeToString(digest[:])
	const expected = "c6c830ef9750fca161255d98bbe3df13a9638a4e41107f06aabe10e30e6346df"
	if actual != expected {
		t.Fatalf("v41 controlled-authority statement fingerprint = %s, want %s", actual, expected)
	}
}
