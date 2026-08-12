package database

func agentModelEvaluationAuthenticityMigration() migration {
	return migration{
		version: 29,
		name:    "g4-agent-model-evaluation-authenticity-ledger",
		statements: []string{
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_plans_exact_partition
				ON agent_evaluation_plans(namespace_id, plan_digest, repository_commit)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_provider_requests (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				provider_request_id TEXT NOT NULL,
				receipt_kind TEXT NOT NULL,
				receipt_identity TEXT NOT NULL,
				recorded_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, provider_configuration_id, provider_request_id),
				UNIQUE (namespace_id, plan_digest, receipt_kind, receipt_identity),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_provider_requests_kind_check
					CHECK (receipt_kind IN ('endpoint-smoke', 'invocation'))
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_requests_immutable_mutation ON agent_evaluation_provider_requests`,
			`CREATE TRIGGER agent_evaluation_provider_requests_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_provider_requests
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				smoke_target_id TEXT NOT NULL,
				smoke_target_digest TEXT NOT NULL,
				protocol_family TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				provider_request_id TEXT NOT NULL,
				adapter_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, smoke_target_id),
				UNIQUE (namespace_id, plan_digest, receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, provider_configuration_id, provider_request_id)
					REFERENCES agent_evaluation_provider_requests(namespace_id, plan_digest, provider_configuration_id, provider_request_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_receipts_protocol_check
					CHECK (protocol_family IN ('openai-responses', 'anthropic-messages', 'gemini-interactions', 'openai-compatible')),
				CONSTRAINT agent_evaluation_endpoint_smoke_receipts_digest_check CHECK (
					smoke_target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_receipts_time_check CHECK (completed_at >= started_at),
				CONSTRAINT agent_evaluation_endpoint_smoke_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_receipts_immutable_mutation ON agent_evaluation_endpoint_smoke_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_invocation_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				target_id TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				model_lineage_digest TEXT NOT NULL,
				provider_request_id TEXT,
				execution_failure_authority_receipt_digest TEXT,
				invocation_outcome TEXT NOT NULL,
				invocation_receipt_digest TEXT NOT NULL,
				response_artifact_digest TEXT,
				evidence_digest TEXT NOT NULL,
				evidence_json JSONB NOT NULL,
				evidence_bytes BYTEA NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id),
				UNIQUE (namespace_id, plan_digest, descriptor_digest),
				UNIQUE (namespace_id, plan_digest, attempt_id, descriptor_digest, response_artifact_digest),
				UNIQUE (namespace_id, invocation_receipt_digest),
				UNIQUE (namespace_id, evidence_digest),
				UNIQUE (namespace_id, execution_failure_authority_receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, provider_configuration_id, provider_request_id)
					REFERENCES agent_evaluation_provider_requests(namespace_id, plan_digest, provider_configuration_id, provider_request_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_invocation_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (execution_failure_authority_receipt_digest IS NULL OR execution_failure_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND invocation_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (response_artifact_digest IS NULL OR response_artifact_digest ~ '^sha256-[a-f0-9]{64}$')
					AND evidence_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_invocation_receipts_authority_check CHECK (
					(provider_request_id IS NULL) <> (execution_failure_authority_receipt_digest IS NULL)
					AND (invocation_outcome <> 'completed' OR (provider_request_id IS NOT NULL AND response_artifact_digest IS NOT NULL))
				),
				CONSTRAINT agent_evaluation_invocation_receipts_outcome_check CHECK (
					invocation_outcome IN ('completed', 'refused', 'safety-blocked', 'truncated', 'schema-failed', 'provider-error', 'cancelled', 'timed-out', 'partial')
				),
				CONSTRAINT agent_evaluation_invocation_receipts_time_check CHECK (completed_at >= started_at),
				CONSTRAINT agent_evaluation_invocation_receipts_bytes_check
					CHECK (octet_length(evidence_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_invocation_receipts_immutable_mutation ON agent_evaluation_invocation_receipts`,
			`CREATE TRIGGER agent_evaluation_invocation_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_invocation_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_source_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				source_receipt_id TEXT NOT NULL,
				source_kind TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				model_lineage_digest TEXT,
				provider_request_id TEXT,
				execution_failure_authority_receipt_digest TEXT,
				source_uri TEXT,
				source_content_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				observed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, source_receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, source_content_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_source_receipts_kind_check
					CHECK (source_kind IN ('provider-reported-usage', 'provider-reported-cost', 'pricing-snapshot', 'cost-calculation')),
				CONSTRAINT agent_evaluation_source_receipts_digest_check CHECK (
					(model_lineage_digest IS NULL OR model_lineage_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (execution_failure_authority_receipt_digest IS NULL OR execution_failure_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND source_content_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_source_receipts_authority_check CHECK (
					(source_kind = 'pricing-snapshot' AND provider_request_id IS NULL AND execution_failure_authority_receipt_digest IS NULL)
					OR (source_kind <> 'pricing-snapshot'
						AND ((provider_request_id IS NULL) <> (execution_failure_authority_receipt_digest IS NULL))
						AND (execution_failure_authority_receipt_digest IS NULL OR source_uri IS NOT NULL))
				),
				CONSTRAINT agent_evaluation_source_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_source_receipts_immutable_mutation ON agent_evaluation_source_receipts`,
			`CREATE TRIGGER agent_evaluation_source_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_source_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_execution_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				execution_receipt_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				model_invocations BIGINT NOT NULL,
				tool_calls BIGINT NOT NULL,
				repair_rounds BIGINT NOT NULL,
				transactions BIGINT NOT NULL,
				artifact_bytes BIGINT NOT NULL,
				elapsed_ms BIGINT NOT NULL,
				tool_receipt_set_digest TEXT,
				transaction_receipt_set_digest TEXT,
				verification_closure_digest TEXT,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id),
				UNIQUE (namespace_id, plan_digest, execution_receipt_id),
				UNIQUE (namespace_id, plan_digest, attempt_id, descriptor_digest, receipt_digest),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_execution_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (tool_receipt_set_digest IS NULL OR tool_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (transaction_receipt_set_digest IS NULL OR transaction_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (verification_closure_digest IS NULL OR verification_closure_digest ~ '^sha256-[a-f0-9]{64}$')
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_execution_receipts_count_check CHECK (
					model_invocations BETWEEN 1 AND 9007199254740991
					AND tool_calls BETWEEN 0 AND 9007199254740991
					AND repair_rounds BETWEEN 0 AND 9007199254740991
					AND transactions BETWEEN 0 AND 9007199254740991
					AND artifact_bytes BETWEEN 0 AND 9007199254740991
					AND elapsed_ms BETWEEN 0 AND 9007199254740991
					AND (tool_calls > 0) = (tool_receipt_set_digest IS NOT NULL)
					AND (transactions > 0) = (transaction_receipt_set_digest IS NOT NULL)
				),
				CONSTRAINT agent_evaluation_execution_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_execution_receipts_immutable_mutation ON agent_evaluation_execution_receipts`,
			`CREATE TRIGGER agent_evaluation_execution_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_execution_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_review_raster_scan_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				scan_receipt_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				projection_authority_digest TEXT NOT NULL,
				media_type TEXT NOT NULL,
				width BIGINT NOT NULL,
				height BIGINT NOT NULL,
				byte_length BIGINT NOT NULL,
				policy_digest TEXT NOT NULL,
				bytes_digest TEXT NOT NULL,
				decoded_pixel_digest TEXT NOT NULL,
				metadata_profile_digest TEXT NOT NULL,
				canary_set_digest TEXT NOT NULL,
				fingerprint_set_digest TEXT NOT NULL,
				finding_count BIGINT NOT NULL,
				verdict TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				scanned_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, scan_receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, attempt_id, bytes_digest, policy_digest, canary_set_digest, fingerprint_set_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id)
					REFERENCES agent_evaluation_attempts(namespace_id, plan_digest, attempt_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_review_raster_scan_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND projection_authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND bytes_digest ~ '^sha256-[a-f0-9]{64}$'
					AND decoded_pixel_digest ~ '^sha256-[a-f0-9]{64}$'
					AND metadata_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND canary_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND fingerprint_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_review_raster_scan_receipts_media_check
					CHECK (media_type IN ('image/png', 'image/webp')),
				CONSTRAINT agent_evaluation_review_raster_scan_receipts_bounds_check CHECK (
					width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096
					AND width * height <= 16777216
					AND byte_length BETWEEN 1 AND 2097152
				),
				CONSTRAINT agent_evaluation_review_raster_scan_receipts_verdict_check CHECK (
					(verdict = 'safe' AND finding_count = 0)
					OR (verdict = 'blocked' AND finding_count BETWEEN 1 AND 4096)
				),
				CONSTRAINT agent_evaluation_review_raster_scan_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_review_raster_scan_receipts_immutable_mutation
				ON agent_evaluation_review_raster_scan_receipts`,
			`CREATE TRIGGER agent_evaluation_review_raster_scan_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_review_raster_scan_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_review_candidates (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				candidate_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				response_digest TEXT NOT NULL,
				execution_receipt_digest TEXT NOT NULL,
				grader_artifact_digest TEXT NOT NULL,
				projection_authority_digest TEXT NOT NULL,
				media_type TEXT NOT NULL,
				width BIGINT NOT NULL,
				height BIGINT NOT NULL,
				bytes_digest TEXT NOT NULL,
				byte_length BIGINT NOT NULL,
				public_artifact_scan_digest TEXT NOT NULL,
				candidate_digest TEXT NOT NULL,
				candidate_json JSONB NOT NULL,
				candidate_bytes BYTEA NOT NULL,
				generated_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id),
				UNIQUE (namespace_id, candidate_id),
				UNIQUE (namespace_id, candidate_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id)
					REFERENCES agent_evaluation_attempts(namespace_id, plan_digest, attempt_id) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, descriptor_digest, response_digest)
					REFERENCES agent_evaluation_invocation_receipts(namespace_id, plan_digest, attempt_id, descriptor_digest, response_artifact_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, descriptor_digest, execution_receipt_digest)
					REFERENCES agent_evaluation_execution_receipts(namespace_id, plan_digest, attempt_id, descriptor_digest, receipt_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, public_artifact_scan_digest)
					REFERENCES agent_evaluation_review_raster_scan_receipts(namespace_id, receipt_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_review_candidates_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND execution_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND grader_artifact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND projection_authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND bytes_digest ~ '^sha256-[a-f0-9]{64}$'
					AND public_artifact_scan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND candidate_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_review_candidates_media_check
					CHECK (media_type IN ('image/png', 'image/webp')),
				CONSTRAINT agent_evaluation_review_candidates_raster_bounds_check CHECK (
					width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096
					AND width * height <= 16777216
					AND byte_length BETWEEN 1 AND 2097152
				),
				CONSTRAINT agent_evaluation_review_candidates_bytes_check
					CHECK (octet_length(candidate_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_review_candidates_immutable_mutation ON agent_evaluation_review_candidates`,
			`CREATE TRIGGER agent_evaluation_review_candidates_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_review_candidates
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_authority_attestations (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				authority_id TEXT NOT NULL,
				key_id TEXT NOT NULL,
				evidence_set_digest TEXT NOT NULL,
				endpoint_smoke_set_digest TEXT NOT NULL,
				invocation_receipt_set_digest TEXT NOT NULL,
				source_receipt_set_digest TEXT NOT NULL,
				execution_receipt_set_digest TEXT NOT NULL,
				attestation_digest TEXT NOT NULL,
				attestation_json JSONB NOT NULL,
				attestation_bytes BYTEA NOT NULL,
				issued_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, attestation_digest),
				UNIQUE (namespace_id, plan_digest, attestation_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_authority_attestations_digest_check CHECK (
					evidence_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND invocation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND execution_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attestation_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_authority_attestations_bytes_check
					CHECK (octet_length(attestation_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_authority_attestations_immutable_mutation ON agent_evaluation_authority_attestations`,
			`CREATE TRIGGER agent_evaluation_authority_attestations_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_authority_attestations
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE OR REPLACE FUNCTION reject_agent_evaluation_finalized_mutation() RETURNS TRIGGER AS $$
			DECLARE
				evaluation_namespace_id TEXT;
				evaluation_plan_digest TEXT;
			BEGIN
				IF TG_OP = 'DELETE' THEN
					evaluation_namespace_id := OLD.namespace_id;
					evaluation_plan_digest := OLD.plan_digest;
				ELSE
					evaluation_namespace_id := NEW.namespace_id;
					evaluation_plan_digest := NEW.plan_digest;
				END IF;
				PERFORM 1 FROM agent_evaluation_plans
					WHERE namespace_id = evaluation_namespace_id AND plan_digest = evaluation_plan_digest
					FOR SHARE;
				IF EXISTS (
					SELECT 1 FROM agent_evaluation_authority_attestations
					WHERE namespace_id = evaluation_namespace_id AND plan_digest = evaluation_plan_digest
				) THEN
					RAISE EXCEPTION 'authority-attested evaluation partition is finalized'
						USING ERRCODE = '23514';
				END IF;
				IF TG_OP = 'DELETE' THEN
					RETURN OLD;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
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
					'agent_evaluation_invocation_receipts',
					'agent_evaluation_source_receipts',
					'agent_evaluation_execution_receipts',
					'agent_evaluation_review_raster_scan_receipts',
					'agent_evaluation_review_candidates'
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
			`CREATE TABLE IF NOT EXISTS agent_evaluation_evidence_roots (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				root_id TEXT NOT NULL,
				evidence_set_digest TEXT NOT NULL,
				endpoint_smoke_set_digest TEXT NOT NULL,
				invocation_receipt_set_digest TEXT NOT NULL,
				source_receipt_set_digest TEXT NOT NULL,
				execution_receipt_set_digest TEXT NOT NULL,
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
				CONSTRAINT agent_evaluation_evidence_roots_digest_check CHECK (
					evidence_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND invocation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND execution_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_attestation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND evaluation_manifest_digest ~ '^sha256-[a-f0-9]{64}$'
					AND bundle_digest ~ '^sha256-[a-f0-9]{64}$'
					AND bundle_artifact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND root_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_evidence_roots_size_check
					CHECK (bundle_artifact_size BETWEEN 1 AND 536870912),
				CONSTRAINT agent_evaluation_evidence_roots_bytes_check
					CHECK (octet_length(root_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_evidence_roots_immutable_mutation ON agent_evaluation_evidence_roots`,
			`CREATE TRIGGER agent_evaluation_evidence_roots_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_evidence_roots
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
