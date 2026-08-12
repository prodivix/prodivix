package database

func agentEvaluationTurnJournalMigration() migration {
	return migration{
		version: 32,
		name:    "g4-agent-evaluation-turn-journal",
		statements: []string{
			`ALTER TABLE agent_evaluation_provider_requests
				DROP CONSTRAINT IF EXISTS agent_evaluation_provider_requests_kind_check,
				ADD CONSTRAINT agent_evaluation_provider_requests_kind_check
					CHECK (receipt_kind IN ('endpoint-smoke', 'invocation', 'transport'))`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_transport_dispatch_intents (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				descriptor_json JSONB NOT NULL,
				descriptor_bytes BYTEA NOT NULL,
				turn_index BIGINT NOT NULL,
				budget_reservation_id TEXT NOT NULL,
				intent_id TEXT NOT NULL,
				invocation_id TEXT NOT NULL,
				protocol_family TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				model_lineage_digest TEXT NOT NULL,
				inference_configuration_digest TEXT NOT NULL,
				demand_digest TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				endpoint_id TEXT NOT NULL,
				endpoint_class TEXT NOT NULL,
				request_body_digest TEXT NOT NULL,
				request_bytes BIGINT NOT NULL,
				intent_digest TEXT NOT NULL,
				intent_json JSONB NOT NULL,
				intent_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id, turn_index),
				UNIQUE (namespace_id, plan_digest, attempt_id, turn_index, intent_digest),
				UNIQUE (namespace_id, plan_digest, intent_id),
				UNIQUE (namespace_id, plan_digest, invocation_id),
				UNIQUE (namespace_id, intent_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, budget_reservation_id)
					REFERENCES agent_evaluation_budget_reservations(namespace_id, plan_digest, reservation_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_transport_dispatch_intents_turn_check
					CHECK (turn_index BETWEEN 0 AND 9007199254740991),
				CONSTRAINT agent_evaluation_transport_dispatch_intents_protocol_check
					CHECK (protocol_family IN ('openai-responses', 'anthropic-messages', 'gemini-interactions', 'openai-compatible')),
				CONSTRAINT agent_evaluation_transport_dispatch_intents_endpoint_check
					CHECK (endpoint_class IN ('first-party-hosted', 'aggregator', 'self-hosted', 'local')),
				CONSTRAINT agent_evaluation_transport_dispatch_intents_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND inference_configuration_digest ~ '^sha256-[a-f0-9]{64}$'
					AND demand_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_body_digest ~ '^sha256-[a-f0-9]{64}$'
					AND intent_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_transport_dispatch_intents_size_check CHECK (
					request_bytes BETWEEN 0 AND 16777216
					AND octet_length(descriptor_bytes) BETWEEN 1 AND 1048576
					AND octet_length(intent_bytes) BETWEEN 1 AND 8388608
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_transport_dispatch_intents_immutable_mutation
				ON agent_evaluation_transport_dispatch_intents`,
			`CREATE TRIGGER agent_evaluation_transport_dispatch_intents_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_transport_dispatch_intents
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_transport_dispatch_intents_finalized_mutation
				ON agent_evaluation_transport_dispatch_intents`,
			`CREATE TRIGGER agent_evaluation_transport_dispatch_intents_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_transport_dispatch_intents
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_transport_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				intent_digest TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				invocation_id TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				provider_request_id TEXT,
				dispatch_state TEXT NOT NULL,
				outcome TEXT NOT NULL,
				response_body_digest TEXT,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				closed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id, turn_index),
				UNIQUE (namespace_id, plan_digest, attempt_id, turn_index, receipt_digest),
				UNIQUE (namespace_id, plan_digest, receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, turn_index, intent_digest)
					REFERENCES agent_evaluation_transport_dispatch_intents(namespace_id, plan_digest, attempt_id, turn_index, intent_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, provider_configuration_id, provider_request_id)
					REFERENCES agent_evaluation_provider_requests(namespace_id, plan_digest, provider_configuration_id, provider_request_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_transport_receipts_turn_check
					CHECK (turn_index BETWEEN 0 AND 9007199254740991),
				CONSTRAINT agent_evaluation_transport_receipts_state_check CHECK (
					dispatch_state IN ('dispatched', 'not-dispatched')
					AND outcome IN ('completed', 'failed', 'post-dispatch-unknown')
					AND (outcome <> 'completed' OR dispatch_state = 'dispatched')
					AND (outcome <> 'post-dispatch-unknown' OR dispatch_state = 'dispatched')
				),
				CONSTRAINT agent_evaluation_transport_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (response_body_digest IS NULL OR response_body_digest ~ '^sha256-[a-f0-9]{64}$')
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_transport_receipts_time_check CHECK (
					completed_at >= started_at AND closed_at >= completed_at
				),
				CONSTRAINT agent_evaluation_transport_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_transport_receipts_immutable_mutation
				ON agent_evaluation_transport_receipts`,
			`CREATE TRIGGER agent_evaluation_transport_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_transport_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_transport_receipts_finalized_mutation
				ON agent_evaluation_transport_receipts`,
			`CREATE TRIGGER agent_evaluation_transport_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_transport_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_provider_result_spool_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				spool_ref TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				algorithm TEXT NOT NULL,
				encryption_profile_digest TEXT NOT NULL,
				key_ref_digest TEXT NOT NULL,
				key_id TEXT NOT NULL,
				key_version BIGINT NOT NULL,
				aad_digest TEXT NOT NULL,
				envelope_digest TEXT NOT NULL,
				ciphertext_digest TEXT NOT NULL,
				ciphertext_size_bytes BIGINT NOT NULL,
				response_body_digest TEXT NOT NULL,
				normalized_event_set_digest TEXT NOT NULL,
				response_digest TEXT NOT NULL,
				opaque_continuation_digest TEXT,
				retention_class TEXT NOT NULL,
				retention_policy_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id, turn_index),
				UNIQUE (namespace_id, plan_digest, attempt_id, turn_index, receipt_digest),
				UNIQUE (namespace_id, spool_ref),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, envelope_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, turn_index, transport_receipt_digest)
					REFERENCES agent_evaluation_transport_receipts(namespace_id, plan_digest, attempt_id, turn_index, receipt_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_provider_result_spool_receipts_algorithm_check
					CHECK (algorithm = 'aes-256-gcm'),
				CONSTRAINT agent_evaluation_provider_result_spool_receipts_retention_check
					CHECK (retention_class = 'attempt-resume-only' AND expires_at > created_at),
				CONSTRAINT agent_evaluation_provider_result_spool_receipts_size_check CHECK (
					turn_index BETWEEN 0 AND 9007199254740991
					AND key_version BETWEEN 1 AND 9007199254740991
					AND ciphertext_size_bytes BETWEEN 1 AND 16777216
					AND octet_length(receipt_bytes) BETWEEN 1 AND 8388608
				),
				CONSTRAINT agent_evaluation_provider_result_spool_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND encryption_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND key_ref_digest ~ '^sha256-[a-f0-9]{64}$'
					AND retention_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND aad_digest ~ '^sha256-[a-f0-9]{64}$'
					AND envelope_digest ~ '^sha256-[a-f0-9]{64}$'
					AND ciphertext_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_body_digest ~ '^sha256-[a-f0-9]{64}$'
					AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (opaque_continuation_digest IS NULL OR opaque_continuation_digest ~ '^sha256-[a-f0-9]{64}$')
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_receipts_immutable_mutation
				ON agent_evaluation_provider_result_spool_receipts`,
			`CREATE TRIGGER agent_evaluation_provider_result_spool_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_provider_result_spool_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_receipts_finalized_mutation
				ON agent_evaluation_provider_result_spool_receipts`,
			`CREATE TRIGGER agent_evaluation_provider_result_spool_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_provider_result_spool_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_provider_result_spool_payloads (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				spool_ref TEXT NOT NULL,
				key_id TEXT NOT NULL,
				key_version BIGINT NOT NULL,
				nonce_bytes BYTEA NOT NULL,
				authentication_tag_bytes BYTEA NOT NULL,
				ciphertext_bytes BYTEA NOT NULL,
				ciphertext_digest TEXT NOT NULL,
				ciphertext_size_bytes BIGINT NOT NULL,
				aad_json JSONB NOT NULL,
				aad_bytes BYTEA NOT NULL,
				envelope_json JSONB NOT NULL,
				envelope_bytes BYTEA NOT NULL,
				envelope_digest TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id, turn_index),
				UNIQUE (namespace_id, spool_ref),
				UNIQUE (namespace_id, envelope_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_provider_result_spool_payloads_size_check CHECK (
					turn_index BETWEEN 0 AND 9007199254740991
					AND key_version BETWEEN 1 AND 9007199254740991
					AND octet_length(nonce_bytes) = 12
					AND octet_length(authentication_tag_bytes) = 16
					AND ciphertext_size_bytes BETWEEN 1 AND 16777216
					AND octet_length(ciphertext_bytes) = ciphertext_size_bytes
					AND octet_length(aad_bytes) BETWEEN 1 AND 65536
					AND octet_length(envelope_bytes) BETWEEN 1 AND 22369622
				),
				CONSTRAINT agent_evaluation_provider_result_spool_payloads_digest_check CHECK (
					ciphertext_digest ~ '^sha256-[a-f0-9]{64}$'
					AND envelope_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_provider_result_spool_payloads_expiry_check
					CHECK (expires_at > created_at)
			)`,
			`CREATE OR REPLACE FUNCTION reject_agent_evaluation_spool_payload_update()
			RETURNS trigger AS $$
			BEGIN
				RAISE EXCEPTION 'agent evaluation spool payloads are immutable';
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_payloads_immutable_update
				ON agent_evaluation_provider_result_spool_payloads`,
			`CREATE TRIGGER agent_evaluation_provider_result_spool_payloads_immutable_update
				BEFORE UPDATE ON agent_evaluation_provider_result_spool_payloads
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_spool_payload_update()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_provider_result_spool_access_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				spool_ref TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				expected_turn_digest TEXT NOT NULL,
				shard_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				lease_generation BIGINT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				accessed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, spool_ref, owner_id, lease_generation, expected_turn_digest),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, spool_ref)
					REFERENCES agent_evaluation_provider_result_spool_receipts(namespace_id, spool_ref) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_provider_result_spool_access_receipts_count_check CHECK (
					turn_index BETWEEN 0 AND 9007199254740991
					AND lease_generation BETWEEN 1 AND 9007199254740991
					AND octet_length(receipt_bytes) BETWEEN 1 AND 8388608
				),
				CONSTRAINT agent_evaluation_provider_result_spool_access_receipts_digest_check CHECK (
					expected_turn_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_access_receipts_immutable_mutation
				ON agent_evaluation_provider_result_spool_access_receipts`,
			`CREATE TRIGGER agent_evaluation_provider_result_spool_access_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_provider_result_spool_access_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_access_receipts_finalized_mutation
				ON agent_evaluation_provider_result_spool_access_receipts`,
			`CREATE TRIGGER agent_evaluation_provider_result_spool_access_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_provider_result_spool_access_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_provider_result_spool_dispositions (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				spool_ref TEXT NOT NULL,
				spool_receipt_digest TEXT NOT NULL,
				disposition TEXT NOT NULL,
				retention_policy_digest TEXT NOT NULL,
				retained_until TIMESTAMPTZ,
				disposed_at TIMESTAMPTZ NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id, turn_index),
				UNIQUE (namespace_id, spool_ref),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, turn_index, spool_receipt_digest)
					REFERENCES agent_evaluation_provider_result_spool_receipts(namespace_id, plan_digest, attempt_id, turn_index, receipt_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_provider_result_spool_dispositions_state_check CHECK (
					(disposition = 'consumed-and-destroyed' AND retained_until IS NULL)
					OR (disposition = 'retained-encrypted' AND retained_until > disposed_at)
				),
				CONSTRAINT agent_evaluation_provider_result_spool_dispositions_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND retention_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_provider_result_spool_dispositions_turn_check
					CHECK (turn_index BETWEEN 0 AND 9007199254740991),
				CONSTRAINT agent_evaluation_provider_result_spool_dispositions_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_dispositions_immutable_mutation
				ON agent_evaluation_provider_result_spool_dispositions`,
			`CREATE TRIGGER agent_evaluation_provider_result_spool_dispositions_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_provider_result_spool_dispositions
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_dispositions_finalized_mutation
				ON agent_evaluation_provider_result_spool_dispositions`,
			`CREATE TRIGGER agent_evaluation_provider_result_spool_dispositions_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_provider_result_spool_dispositions
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE OR REPLACE FUNCTION authorize_agent_evaluation_spool_payload_delete()
			RETURNS trigger AS $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_provider_result_spool_dispositions disposition
					WHERE disposition.namespace_id = OLD.namespace_id
						AND disposition.plan_digest = OLD.plan_digest
						AND disposition.attempt_id = OLD.attempt_id
						AND disposition.turn_index = OLD.turn_index
						AND disposition.spool_ref = OLD.spool_ref
						AND disposition.disposition = 'consumed-and-destroyed'
				) THEN
					RAISE EXCEPTION 'agent evaluation spool payload deletion requires an immutable disposition';
				END IF;
				RETURN OLD;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_payloads_authorized_delete
				ON agent_evaluation_provider_result_spool_payloads`,
			`CREATE TRIGGER agent_evaluation_provider_result_spool_payloads_authorized_delete
				BEFORE DELETE ON agent_evaluation_provider_result_spool_payloads
				FOR EACH ROW EXECUTE FUNCTION authorize_agent_evaluation_spool_payload_delete()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_invocation_turn_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				status TEXT NOT NULL,
				dispatch_state TEXT NOT NULL,
				terminal BOOLEAN NOT NULL,
				dispatch_intent_digest TEXT,
				transport_receipt_digest TEXT,
				provider_result_spool_receipt_digest TEXT,
				execution_failure_authority_receipt_digest TEXT,
				result_submission_receipt_digest TEXT,
				controlled_runtime_receipt_digest TEXT,
				response_artifact_digest TEXT,
				evidence_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id, turn_index),
				UNIQUE (namespace_id, plan_digest, attempt_id, turn_index, evidence_digest),
				UNIQUE (namespace_id, evidence_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, turn_index, dispatch_intent_digest)
					REFERENCES agent_evaluation_transport_dispatch_intents(namespace_id, plan_digest, attempt_id, turn_index, intent_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, turn_index, transport_receipt_digest)
					REFERENCES agent_evaluation_transport_receipts(namespace_id, plan_digest, attempt_id, turn_index, receipt_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, turn_index, provider_result_spool_receipt_digest)
					REFERENCES agent_evaluation_provider_result_spool_receipts(namespace_id, plan_digest, attempt_id, turn_index, receipt_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_invocation_turn_receipts_status_check CHECK (
					status IN ('completed', 'provider-error', 'timed-out', 'rate-limited', 'schema-failed', 'blocked', 'cancelled', 'infrastructure-error')
					AND dispatch_state IN ('not-created', 'not-dispatched', 'dispatched')
				),
				CONSTRAINT agent_evaluation_invocation_turn_receipts_shape_check CHECK (
					(dispatch_state = 'not-created' AND dispatch_intent_digest IS NULL AND transport_receipt_digest IS NULL AND provider_result_spool_receipt_digest IS NULL)
					OR (dispatch_state = 'not-dispatched' AND dispatch_intent_digest IS NOT NULL AND transport_receipt_digest IS NOT NULL AND provider_result_spool_receipt_digest IS NULL)
					OR (dispatch_state = 'dispatched' AND dispatch_intent_digest IS NOT NULL AND transport_receipt_digest IS NOT NULL)
				),
				CONSTRAINT agent_evaluation_invocation_turn_receipts_terminal_check
					CHECK (terminal OR status = 'completed'),
				CONSTRAINT agent_evaluation_invocation_turn_receipts_turn_check
					CHECK (turn_index BETWEEN 0 AND 9007199254740991),
				CONSTRAINT agent_evaluation_invocation_turn_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (dispatch_intent_digest IS NULL OR dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (transport_receipt_digest IS NULL OR transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (provider_result_spool_receipt_digest IS NULL OR provider_result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (execution_failure_authority_receipt_digest IS NULL OR execution_failure_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (result_submission_receipt_digest IS NULL OR result_submission_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (controlled_runtime_receipt_digest IS NULL OR controlled_runtime_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND evidence_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_invocation_turn_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_invocation_turn_receipts_immutable_mutation
				ON agent_evaluation_invocation_turn_receipts`,
			`CREATE TRIGGER agent_evaluation_invocation_turn_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_invocation_turn_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_invocation_turn_receipts_finalized_mutation
				ON agent_evaluation_invocation_turn_receipts`,
			`CREATE TRIGGER agent_evaluation_invocation_turn_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_invocation_turn_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_invocation_turn_set_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				terminal_turn_index BIGINT NOT NULL,
				terminal_status TEXT NOT NULL,
				dispatched_invocation_count BIGINT NOT NULL,
				turn_receipt_count BIGINT NOT NULL,
				source_receipt_set_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id),
				UNIQUE (namespace_id, plan_digest, descriptor_digest),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id)
					REFERENCES agent_evaluation_attempts(namespace_id, plan_digest, attempt_id) ON DELETE RESTRICT
					DEFERRABLE INITIALLY DEFERRED,
				CONSTRAINT agent_evaluation_invocation_turn_set_receipts_status_check
					CHECK (terminal_status IN ('completed', 'provider-error', 'timed-out', 'rate-limited', 'schema-failed', 'blocked', 'cancelled', 'infrastructure-error')),
				CONSTRAINT agent_evaluation_invocation_turn_set_receipts_count_check CHECK (
					turn_receipt_count BETWEEN 1 AND 9007199254740991
					AND terminal_turn_index = turn_receipt_count - 1
					AND dispatched_invocation_count BETWEEN 0 AND turn_receipt_count
				),
				CONSTRAINT agent_evaluation_invocation_turn_set_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_invocation_turn_set_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_invocation_turn_set_receipts_immutable_mutation
				ON agent_evaluation_invocation_turn_set_receipts`,
			`CREATE TRIGGER agent_evaluation_invocation_turn_set_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_invocation_turn_set_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_invocation_turn_set_receipts_finalized_mutation
				ON agent_evaluation_invocation_turn_set_receipts`,
			`CREATE TRIGGER agent_evaluation_invocation_turn_set_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_invocation_turn_set_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_completed_transport_spool()
			RETURNS trigger AS $$
			BEGIN
				IF NEW.outcome = 'completed' AND (
					NOT EXISTS (
						SELECT 1 FROM agent_evaluation_provider_result_spool_receipts receipt
						WHERE receipt.namespace_id = NEW.namespace_id
							AND receipt.plan_digest = NEW.plan_digest
							AND receipt.attempt_id = NEW.attempt_id
							AND receipt.turn_index = NEW.turn_index
							AND receipt.transport_receipt_digest = NEW.receipt_digest
					) OR NOT EXISTS (
						SELECT 1 FROM agent_evaluation_provider_result_spool_payloads payload
						WHERE payload.namespace_id = NEW.namespace_id
							AND payload.plan_digest = NEW.plan_digest
							AND payload.attempt_id = NEW.attempt_id
							AND payload.turn_index = NEW.turn_index
					)
				) THEN
					RAISE EXCEPTION 'completed agent evaluation transport requires an encrypted result spool';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_transport_receipts_require_spool
				ON agent_evaluation_transport_receipts`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_transport_receipts_require_spool
				AFTER INSERT ON agent_evaluation_transport_receipts
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_completed_transport_spool()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_spool_completed_transport()
			RETURNS trigger AS $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_transport_receipts receipt
					WHERE receipt.namespace_id = NEW.namespace_id
						AND receipt.plan_digest = NEW.plan_digest
						AND receipt.attempt_id = NEW.attempt_id
						AND receipt.turn_index = NEW.turn_index
						AND receipt.receipt_digest = NEW.transport_receipt_digest
						AND receipt.outcome = 'completed'
				) THEN
					RAISE EXCEPTION 'agent evaluation result spool requires a completed transport';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_provider_result_spool_receipts_require_completed_transport
				ON agent_evaluation_provider_result_spool_receipts`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_provider_result_spool_receipts_require_completed_transport
				AFTER INSERT ON agent_evaluation_provider_result_spool_receipts
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_spool_completed_transport()`,
		},
	}
}
