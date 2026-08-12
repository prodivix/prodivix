package database

// agentEvaluationAuthenticityV3Migration is an alpha hard cut from the
// terminal-only invocation evidence root to the ordered turn journal. Legacy
// authority/root rows cannot prove the v3 evidence sets, so the migration
// intentionally discards only those two derived finalization records. All
// underlying immutable evidence remains intact and can be finalized again.
func agentEvaluationAuthenticityV3Migration() migration {
	return migration{
		version: 33,
		name:    "g4-agent-evaluation-authenticity-v3-hard-cut",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_evaluation_pre_dispatch_failure_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				failure_receipt_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				stage TEXT NOT NULL,
				reason_code TEXT NOT NULL,
				policy_digest TEXT NOT NULL,
				input_digest TEXT NOT NULL,
				finding_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				occurred_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id, turn_index),
				UNIQUE (namespace_id, plan_digest, failure_receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, attempt_id, turn_index, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_pre_dispatch_failure_receipts_turn_check
					CHECK (turn_index BETWEEN 0 AND 64),
				CONSTRAINT agent_evaluation_pre_dispatch_failure_receipts_stage_reason_check CHECK (
					(stage = 'protected-material-resolution' AND reason_code IN (
						'protected-material-unavailable', 'protected-material-integrity-failed',
						'protected-material-policy-rejected', 'protected-material-leak-blocked'
					)) OR (stage = 'invocation-payload-encoding' AND reason_code = 'invocation-payload-invalid')
					OR (stage = 'budget-admission' AND reason_code = 'budget-admission-rejected')
					OR (stage = 'dispatch-admission' AND reason_code = 'cancelled-before-dispatch')
				),
				CONSTRAINT agent_evaluation_pre_dispatch_failure_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND input_digest ~ '^sha256-[a-f0-9]{64}$'
					AND finding_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_pre_dispatch_failure_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 65536)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_pre_dispatch_failure_receipts_immutable_mutation
				ON agent_evaluation_pre_dispatch_failure_receipts`,
			`CREATE TRIGGER agent_evaluation_pre_dispatch_failure_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_pre_dispatch_failure_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`ALTER TABLE agent_evaluation_invocation_turn_receipts
				ADD COLUMN IF NOT EXISTS response_artifact_digest TEXT,
				ADD COLUMN IF NOT EXISTS pre_dispatch_failure_receipt_digest TEXT`,
			`ALTER TABLE agent_evaluation_invocation_turn_receipts
				DROP CONSTRAINT IF EXISTS agent_evaluation_invocation_turn_receipts_response_digest_check,
				ADD CONSTRAINT agent_evaluation_invocation_turn_receipts_response_digest_check
					CHECK (response_artifact_digest IS NULL OR response_artifact_digest ~ '^sha256-[a-f0-9]{64}$')`,
			`ALTER TABLE agent_evaluation_invocation_turn_receipts
				DROP CONSTRAINT IF EXISTS eval_turn_pre_dispatch_check,
				ADD CONSTRAINT eval_turn_pre_dispatch_check CHECK (
					(dispatch_state = 'not-created') = (pre_dispatch_failure_receipt_digest IS NOT NULL)
					AND (pre_dispatch_failure_receipt_digest IS NULL OR pre_dispatch_failure_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				DROP CONSTRAINT IF EXISTS eval_turn_pre_dispatch_fk,
				ADD CONSTRAINT eval_turn_pre_dispatch_fk
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, turn_index, pre_dispatch_failure_receipt_digest)
				REFERENCES agent_evaluation_pre_dispatch_failure_receipts (
					namespace_id, plan_digest, attempt_id, turn_index, receipt_digest
				) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_invocation_turn_response
				ON agent_evaluation_invocation_turn_receipts (
					namespace_id, plan_digest, attempt_id, descriptor_digest, response_artifact_digest
				)`,
			`DO $$
			DECLARE
				constraint_name TEXT;
			BEGIN
				SELECT con.conname INTO constraint_name
				FROM pg_constraint con
				WHERE con.conrelid = 'agent_evaluation_review_candidates'::regclass
					AND con.contype = 'f'
					AND con.confrelid = 'agent_evaluation_invocation_receipts'::regclass;
				IF constraint_name IS NOT NULL THEN
					EXECUTE format('ALTER TABLE agent_evaluation_review_candidates DROP CONSTRAINT %I', constraint_name);
				END IF;
			END;
			$$`,
			`ALTER TABLE agent_evaluation_review_candidates
				DROP CONSTRAINT IF EXISTS agent_evaluation_review_candidates_terminal_turn_fkey,
				ADD CONSTRAINT agent_evaluation_review_candidates_terminal_turn_fkey
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, descriptor_digest, response_digest)
				REFERENCES agent_evaluation_invocation_turn_receipts (
					namespace_id, plan_digest, attempt_id, descriptor_digest, response_artifact_digest
				) ON DELETE RESTRICT`,
			`DROP TABLE IF EXISTS agent_evaluation_evidence_roots`,
			`DROP TABLE IF EXISTS agent_evaluation_authority_attestations`,
			`CREATE TABLE agent_evaluation_authority_attestations (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				authority_id TEXT NOT NULL,
				key_id TEXT NOT NULL,
				evidence_set_digest TEXT NOT NULL,
				endpoint_smoke_set_digest TEXT NOT NULL,
				transport_dispatch_intent_set_digest TEXT NOT NULL,
				transport_receipt_set_digest TEXT NOT NULL,
				provider_result_spool_receipt_set_digest TEXT NOT NULL,
				provider_result_spool_disposition_receipt_set_digest TEXT NOT NULL,
				invocation_turn_receipt_set_digest TEXT NOT NULL,
				invocation_turn_set_receipt_set_digest TEXT NOT NULL,
				result_submission_receipt_set_digest TEXT NOT NULL,
				controlled_runtime_receipt_set_digest TEXT NOT NULL,
				capability_execution_receipt_set_digest TEXT NOT NULL,
				validated_human_review_artifact_set_digest TEXT NOT NULL,
				review_raster_scan_receipt_set_digest TEXT NOT NULL,
				review_candidate_ref_set_digest TEXT NOT NULL,
					blind_review_mapping_set_digest TEXT NOT NULL,
					pre_dispatch_failure_receipt_set_digest TEXT NOT NULL,
				source_receipt_set_digest TEXT NOT NULL,
				execution_receipt_set_digest TEXT NOT NULL,
				holdout_execution_receipt_digest TEXT NOT NULL,
				secret_canary_set_digest TEXT NOT NULL,
				protected_holdout_canary_set_digest TEXT NOT NULL,
				attestation_digest TEXT NOT NULL,
				attestation_json JSONB NOT NULL,
				attestation_bytes BYTEA NOT NULL,
				issued_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, attestation_digest),
				UNIQUE (namespace_id, plan_digest, attestation_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_authority_attestations_v3_digest_check CHECK (
					evidence_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_dispatch_intent_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_result_spool_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_result_spool_disposition_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND invocation_turn_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND invocation_turn_set_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND result_submission_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND controlled_runtime_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_execution_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND validated_human_review_artifact_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND review_raster_scan_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND review_candidate_ref_set_digest ~ '^sha256-[a-f0-9]{64}$'
						AND blind_review_mapping_set_digest ~ '^sha256-[a-f0-9]{64}$'
						AND pre_dispatch_failure_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND execution_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND holdout_execution_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND secret_canary_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND protected_holdout_canary_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attestation_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_authority_attestations_v3_bytes_check
					CHECK (octet_length(attestation_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_authority_attestations_immutable_mutation
				ON agent_evaluation_authority_attestations`,
			`CREATE TRIGGER agent_evaluation_authority_attestations_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_authority_attestations
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE agent_evaluation_evidence_roots (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				root_id TEXT NOT NULL,
				evidence_set_digest TEXT NOT NULL,
				endpoint_smoke_set_digest TEXT NOT NULL,
				transport_dispatch_intent_set_digest TEXT NOT NULL,
				transport_receipt_set_digest TEXT NOT NULL,
				provider_result_spool_receipt_set_digest TEXT NOT NULL,
				provider_result_spool_disposition_receipt_set_digest TEXT NOT NULL,
				invocation_turn_receipt_set_digest TEXT NOT NULL,
				invocation_turn_set_receipt_set_digest TEXT NOT NULL,
				result_submission_receipt_set_digest TEXT NOT NULL,
				controlled_runtime_receipt_set_digest TEXT NOT NULL,
				capability_execution_receipt_set_digest TEXT NOT NULL,
				validated_human_review_artifact_set_digest TEXT NOT NULL,
				review_raster_scan_receipt_set_digest TEXT NOT NULL,
				review_candidate_ref_set_digest TEXT NOT NULL,
					blind_review_mapping_set_digest TEXT NOT NULL,
					pre_dispatch_failure_receipt_set_digest TEXT NOT NULL,
				source_receipt_set_digest TEXT NOT NULL,
				execution_receipt_set_digest TEXT NOT NULL,
				holdout_execution_receipt_digest TEXT NOT NULL,
				secret_canary_set_digest TEXT NOT NULL,
				protected_holdout_canary_set_digest TEXT NOT NULL,
				authority_attestation_digest TEXT NOT NULL,
				evaluation_manifest_digest TEXT NOT NULL,
				bundle_digest TEXT NOT NULL,
				bundle_artifact_digest TEXT NOT NULL,
				bundle_artifact_size BIGINT NOT NULL,
				root_digest TEXT NOT NULL,
				root_json JSONB NOT NULL,
				root_bytes BYTEA NOT NULL,
				recorded_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, root_id),
				UNIQUE (namespace_id, root_digest),
				UNIQUE (namespace_id, bundle_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, authority_attestation_digest)
					REFERENCES agent_evaluation_authority_attestations(namespace_id, plan_digest, attestation_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_evidence_roots_v3_digest_check CHECK (
					evidence_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_dispatch_intent_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_result_spool_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_result_spool_disposition_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND invocation_turn_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND invocation_turn_set_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND result_submission_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND controlled_runtime_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_execution_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND validated_human_review_artifact_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND review_raster_scan_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND review_candidate_ref_set_digest ~ '^sha256-[a-f0-9]{64}$'
						AND blind_review_mapping_set_digest ~ '^sha256-[a-f0-9]{64}$'
						AND pre_dispatch_failure_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND execution_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND holdout_execution_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND secret_canary_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND protected_holdout_canary_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_attestation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND evaluation_manifest_digest ~ '^sha256-[a-f0-9]{64}$'
					AND bundle_digest ~ '^sha256-[a-f0-9]{64}$'
					AND bundle_artifact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND root_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_evidence_roots_v3_size_check
					CHECK (bundle_artifact_size BETWEEN 1 AND 536870912),
				CONSTRAINT agent_evaluation_evidence_roots_v3_bytes_check
					CHECK (octet_length(root_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_evidence_roots_immutable_mutation
				ON agent_evaluation_evidence_roots`,
			`CREATE TRIGGER agent_evaluation_evidence_roots_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_evidence_roots
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DO $$
			DECLARE
				evaluation_table TEXT;
				evaluation_trigger TEXT;
			BEGIN
				FOREACH evaluation_table IN ARRAY ARRAY[
					'agent_evaluation_budget_ledgers',
					'agent_evaluation_attempts',
					'agent_evaluation_checkpoints',
					'agent_evaluation_artifacts',
					'agent_evaluation_shard_leases',
					'agent_evaluation_budget_reservations',
					'agent_evaluation_budget_settlements',
					'agent_evaluation_provider_requests',
					'agent_evaluation_endpoint_smoke_receipts',
					'agent_evaluation_source_receipts',
					'agent_evaluation_execution_receipts',
					'agent_evaluation_review_raster_scan_receipts',
					'agent_evaluation_review_candidates',
					'agent_evaluation_result_submission_receipts',
					'agent_evaluation_controlled_runtime_receipts',
					'agent_evaluation_blind_review_mappings',
					'agent_evaluation_transport_dispatch_intents',
					'agent_evaluation_pre_dispatch_failure_receipts',
					'agent_evaluation_transport_receipts',
					'agent_evaluation_provider_result_spool_receipts',
					'agent_evaluation_provider_result_spool_access_receipts',
					'agent_evaluation_provider_result_spool_dispositions',
					'agent_evaluation_invocation_turn_receipts',
					'agent_evaluation_invocation_turn_set_receipts'
				] LOOP
					evaluation_trigger := evaluation_table || '_finalized_mutation';
					EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', evaluation_trigger, evaluation_table);
					EXECUTE format(
						'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()',
						evaluation_trigger,
						evaluation_table
					);
				END LOOP;
			END;
			$$`,
		},
	}
}
