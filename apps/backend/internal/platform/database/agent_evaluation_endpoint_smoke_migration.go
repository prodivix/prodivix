package database

// agentEvaluationEndpointSmokeMigration owns the production endpoint-smoke
// journal. It deliberately does not reuse the per-attempt transport journal:
// smoke targets have their own dispatch fence, encrypted replay spool, terminal
// evidence, qualification report, and atomic evidence commit.
func agentEvaluationEndpointSmokeMigration() migration {
	return migration{
		version: 40,
		name:    "g4-agent-evaluation-endpoint-smoke-journal",
		statements: []string{
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_budget_reservations_exact_demand
				ON agent_evaluation_budget_reservations(namespace_id, plan_digest, reservation_id, demand_digest)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_budget_settlements_exact_digest
				ON agent_evaluation_budget_settlements(namespace_id, plan_digest, reservation_id, settlement_digest)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_source_receipts_exact_partition
				ON agent_evaluation_source_receipts(namespace_id, plan_digest, receipt_digest)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_source_receipts_exact_authority
				ON agent_evaluation_source_receipts(
					namespace_id, plan_digest, source_receipt_id, source_content_digest, receipt_digest
				)`,
			`ALTER TABLE agent_evaluation_authority_attestations
				ADD COLUMN IF NOT EXISTS endpoint_smoke_dispatch_intent_set_digest TEXT NOT NULL
					DEFAULT 'sha256-9fb0151b607896b0eab50870c2985203b8c1e404519bcc77400d1074253f0107',
				ADD COLUMN IF NOT EXISTS endpoint_smoke_transport_receipt_set_digest TEXT NOT NULL
					DEFAULT 'sha256-ba80f9043bc3ff6a8d00f8b3159036e631e8185896169bb2a5170e79202c8e3d',
				ADD COLUMN IF NOT EXISTS endpoint_smoke_result_spool_receipt_set_digest TEXT NOT NULL
					DEFAULT 'sha256-e215f2c9032aa51c69bbf2f3f408479c148a35e29a40502ca4f9f34a9ef6086e',
				ADD COLUMN IF NOT EXISTS endpoint_smoke_result_spool_disposition_receipt_set_digest TEXT NOT NULL
					DEFAULT 'sha256-9d7331d98a3d2c7a2a2a8baa7d411c57d3b6da5b20c9826afe6a19cda42869b4',
				ADD COLUMN IF NOT EXISTS endpoint_smoke_validation_failure_receipt_set_digest TEXT NOT NULL
					DEFAULT 'sha256-1128139c5a1ccc08ffb4c28d200b5e1e4f9767f3eaa38ae3630750d777b2141e'`,
			`ALTER TABLE agent_evaluation_authority_attestations
				ALTER COLUMN endpoint_smoke_dispatch_intent_set_digest DROP DEFAULT,
				ALTER COLUMN endpoint_smoke_transport_receipt_set_digest DROP DEFAULT,
				ALTER COLUMN endpoint_smoke_result_spool_receipt_set_digest DROP DEFAULT,
				ALTER COLUMN endpoint_smoke_result_spool_disposition_receipt_set_digest DROP DEFAULT,
				ALTER COLUMN endpoint_smoke_validation_failure_receipt_set_digest DROP DEFAULT,
				ADD CONSTRAINT agent_evaluation_authority_attestations_endpoint_smoke_v40_digest_check CHECK (
					endpoint_smoke_dispatch_intent_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_transport_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_result_spool_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_result_spool_disposition_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_validation_failure_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				)`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ADD COLUMN IF NOT EXISTS endpoint_smoke_dispatch_intent_set_digest TEXT NOT NULL
					DEFAULT 'sha256-9fb0151b607896b0eab50870c2985203b8c1e404519bcc77400d1074253f0107',
				ADD COLUMN IF NOT EXISTS endpoint_smoke_transport_receipt_set_digest TEXT NOT NULL
					DEFAULT 'sha256-ba80f9043bc3ff6a8d00f8b3159036e631e8185896169bb2a5170e79202c8e3d',
				ADD COLUMN IF NOT EXISTS endpoint_smoke_result_spool_receipt_set_digest TEXT NOT NULL
					DEFAULT 'sha256-e215f2c9032aa51c69bbf2f3f408479c148a35e29a40502ca4f9f34a9ef6086e',
				ADD COLUMN IF NOT EXISTS endpoint_smoke_result_spool_disposition_receipt_set_digest TEXT NOT NULL
					DEFAULT 'sha256-9d7331d98a3d2c7a2a2a8baa7d411c57d3b6da5b20c9826afe6a19cda42869b4',
				ADD COLUMN IF NOT EXISTS endpoint_smoke_validation_failure_receipt_set_digest TEXT NOT NULL
					DEFAULT 'sha256-1128139c5a1ccc08ffb4c28d200b5e1e4f9767f3eaa38ae3630750d777b2141e'`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ALTER COLUMN endpoint_smoke_dispatch_intent_set_digest DROP DEFAULT,
				ALTER COLUMN endpoint_smoke_transport_receipt_set_digest DROP DEFAULT,
				ALTER COLUMN endpoint_smoke_result_spool_receipt_set_digest DROP DEFAULT,
				ALTER COLUMN endpoint_smoke_result_spool_disposition_receipt_set_digest DROP DEFAULT,
				ALTER COLUMN endpoint_smoke_validation_failure_receipt_set_digest DROP DEFAULT,
				ADD CONSTRAINT agent_evaluation_evidence_roots_endpoint_smoke_v40_digest_check CHECK (
					endpoint_smoke_dispatch_intent_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_transport_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_result_spool_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_result_spool_disposition_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_validation_failure_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_dispatch_intents (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				intent_id TEXT NOT NULL,
				smoke_target_id TEXT NOT NULL,
				smoke_target_digest TEXT NOT NULL,
				endpoint_class TEXT NOT NULL,
				protocol_family TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				model_id TEXT NOT NULL,
				immutable_model_version TEXT NOT NULL,
				model_lineage_digest TEXT NOT NULL,
				inference_configuration_digest TEXT NOT NULL,
				adapter_digest TEXT NOT NULL,
				pricing_authority_digest TEXT NOT NULL,
				response_spool_encryption_policy_digest TEXT NOT NULL,
				smoke_profile_digest TEXT NOT NULL,
				invocation_id TEXT NOT NULL,
				budget_reservation_id TEXT NOT NULL,
				demand_digest TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				endpoint_id TEXT NOT NULL,
				request_body_digest TEXT NOT NULL,
				request_bytes BIGINT NOT NULL,
				intent_digest TEXT NOT NULL,
				intent_json JSONB NOT NULL,
				intent_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, smoke_target_id),
				UNIQUE (namespace_id, plan_digest, intent_id),
				UNIQUE (namespace_id, plan_digest, invocation_id),
				UNIQUE (namespace_id, intent_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, intent_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, budget_reservation_id, demand_digest)
					REFERENCES agent_evaluation_budget_reservations(namespace_id, plan_digest, reservation_id, demand_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_dispatch_intents_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_dispatch_intents_protocol_check
					CHECK (protocol_family IN ('openai-responses', 'anthropic-messages', 'gemini-interactions', 'openai-compatible')),
				CONSTRAINT agent_evaluation_endpoint_smoke_dispatch_intents_endpoint_check
					CHECK (endpoint_class IN ('first-party-hosted', 'aggregator', 'self-hosted', 'local')),
				CONSTRAINT agent_evaluation_endpoint_smoke_dispatch_intents_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND inference_configuration_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND pricing_authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_spool_encryption_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND demand_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_body_digest ~ '^sha256-[a-f0-9]{64}$'
					AND intent_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_dispatch_intents_size_check CHECK (
					request_bytes BETWEEN 1 AND 16777216
					AND octet_length(intent_bytes) BETWEEN 1 AND 8388608
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_dispatch_intents_immutable_mutation
				ON agent_evaluation_endpoint_smoke_dispatch_intents`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_dispatch_intents_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_dispatch_intents
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_dispatch_intents_finalized_mutation
				ON agent_evaluation_endpoint_smoke_dispatch_intents`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_dispatch_intents_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_dispatch_intents
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_transport_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				smoke_target_id TEXT NOT NULL,
				smoke_target_digest TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				protocol_family TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				invocation_id TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				endpoint_id TEXT NOT NULL,
				endpoint_class TEXT NOT NULL,
				request_body_digest TEXT NOT NULL,
				request_bytes BIGINT NOT NULL,
				response_bytes BIGINT NOT NULL,
				http_status BIGINT,
				response_header_digest TEXT,
				response_body_digest TEXT,
				provider_request_id TEXT,
				provider_identity_kind TEXT,
				provider_response_id TEXT,
				resolved_model_id TEXT,
				resolved_model_version TEXT,
				sse_event_count BIGINT NOT NULL,
				dispatch_state TEXT NOT NULL,
				outcome TEXT NOT NULL,
				error_category TEXT,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				closed_at TIMESTAMPTZ NOT NULL,
				turn_digest TEXT NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, smoke_target_id),
				UNIQUE (namespace_id, plan_digest, receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, invocation_id),
				UNIQUE (namespace_id, plan_digest, provider_configuration_id, provider_request_id),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest, receipt_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest, receipt_digest, response_body_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest, provider_request_id, response_header_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest)
					REFERENCES agent_evaluation_endpoint_smoke_dispatch_intents(namespace_id, plan_digest, smoke_target_id, invocation_id, intent_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, provider_configuration_id, provider_request_id)
					REFERENCES agent_evaluation_provider_requests(namespace_id, plan_digest, provider_configuration_id, provider_request_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_protocol_check
					CHECK (protocol_family IN ('openai-responses', 'anthropic-messages', 'gemini-interactions', 'openai-compatible')),
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_endpoint_check
					CHECK (endpoint_class IN ('first-party-hosted', 'aggregator', 'self-hosted', 'local')),
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_identity_check CHECK (
					(provider_identity_kind IS NULL) = (provider_response_id IS NULL)
					AND (provider_identity_kind IS NULL OR provider_identity_kind IN ('interaction-id', 'message-id', 'response-id'))
					AND (resolved_model_version IS NULL OR resolved_model_id IS NOT NULL)
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_state_check CHECK (
					dispatch_state IN ('dispatched', 'not-dispatched')
					AND outcome IN ('completed', 'failed', 'post-dispatch-unknown')
					AND (
						(outcome = 'completed'
							AND dispatch_state = 'dispatched'
							AND http_status BETWEEN 200 AND 299
							AND response_header_digest IS NOT NULL
							AND response_body_digest IS NOT NULL
							AND provider_request_id IS NOT NULL
							AND error_category IS NULL)
						OR (outcome <> 'completed' AND error_category IS NOT NULL)
					)
					AND (outcome <> 'post-dispatch-unknown' OR dispatch_state = 'dispatched')
					AND (
						dispatch_state <> 'not-dispatched'
						OR (outcome = 'failed'
							AND http_status IS NULL
							AND response_header_digest IS NULL
							AND response_body_digest IS NULL
							AND provider_request_id IS NULL
							AND provider_identity_kind IS NULL
							AND provider_response_id IS NULL
							AND resolved_model_id IS NULL
							AND resolved_model_version IS NULL
							AND response_bytes = 0
							AND sse_event_count = 0)
					)
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_error_check CHECK (
					error_category IS NULL OR error_category IN (
						'G4_RUNNER_ABORTED',
						'G4_RUNNER_CAPTURE_FAILED',
						'G4_RUNNER_CONFIGURATION_INVALID',
						'G4_RUNNER_DISABLED',
						'G4_RUNNER_EGRESS_DENIED',
						'G4_RUNNER_PRODUCTION_COMPOSITION_UNAVAILABLE',
						'G4_RUNNER_PROVIDER_AUTH_REJECTED',
						'G4_RUNNER_PROVIDER_RATE_LIMITED',
						'G4_RUNNER_PROVIDER_REJECTED',
						'G4_RUNNER_RESPONSE_INVALID',
						'G4_RUNNER_RESPONSE_SECRET_LEAK',
						'G4_RUNNER_RESPONSE_TOO_LARGE',
						'G4_RUNNER_SECRET_UNAVAILABLE',
						'G4_RUNNER_SECRET_USE_DENIED',
						'G4_RUNNER_SERVER_ONLY',
						'G4_RUNNER_TRANSPORT_FAILED'
					)
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_body_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (response_header_digest IS NULL OR response_header_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (response_body_digest IS NULL OR response_body_digest ~ '^sha256-[a-f0-9]{64}$')
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND turn_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_bounds_check CHECK (
					request_bytes BETWEEN 1 AND 16777216
					AND response_bytes BETWEEN 0 AND 16777216
					AND sse_event_count BETWEEN 0 AND 9007199254740991
					AND (http_status IS NULL OR http_status BETWEEN 100 AND 599)
					AND octet_length(receipt_bytes) BETWEEN 1 AND 8388608
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_transport_receipts_time_check CHECK (
					completed_at >= started_at AND closed_at >= completed_at
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_transport_receipts_immutable_mutation
				ON agent_evaluation_endpoint_smoke_transport_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_transport_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_transport_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_transport_receipts_finalized_mutation
				ON agent_evaluation_endpoint_smoke_transport_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_transport_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_transport_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_result_spool_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				smoke_target_id TEXT NOT NULL,
				smoke_target_digest TEXT NOT NULL,
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
				retention_class TEXT NOT NULL,
				retention_policy_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, smoke_target_id),
				UNIQUE (namespace_id, spool_ref),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, envelope_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest, response_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, spool_ref, receipt_digest, envelope_digest, ciphertext_digest, aad_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, spool_ref, receipt_digest, retention_policy_digest),
				UNIQUE (
					namespace_id,
					plan_digest,
					smoke_target_id,
					smoke_target_digest,
					invocation_id,
					spool_ref,
					receipt_digest,
					dispatch_intent_digest,
					transport_receipt_digest,
					response_body_digest,
					normalized_event_set_digest,
					key_id,
					key_version,
					envelope_digest,
					ciphertext_digest,
					aad_digest,
					created_at,
					expires_at
				),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest, transport_receipt_digest, response_body_digest)
					REFERENCES agent_evaluation_endpoint_smoke_transport_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest, receipt_digest, response_body_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_receipts_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_receipts_algorithm_check
					CHECK (algorithm = 'aes-256-gcm'),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_receipts_retention_check
					CHECK (retention_class = 'endpoint-smoke-resume-only' AND expires_at > created_at),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_receipts_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND encryption_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND key_ref_digest ~ '^sha256-[a-f0-9]{64}$'
					AND aad_digest ~ '^sha256-[a-f0-9]{64}$'
					AND envelope_digest ~ '^sha256-[a-f0-9]{64}$'
					AND ciphertext_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_body_digest ~ '^sha256-[a-f0-9]{64}$'
					AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND retention_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_receipts_bounds_check CHECK (
					key_version BETWEEN 1 AND 9007199254740991
					AND ciphertext_size_bytes BETWEEN 1 AND 16777216
					AND octet_length(receipt_bytes) BETWEEN 1 AND 8388608
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_result_spool_receipts_immutable_mutation
				ON agent_evaluation_endpoint_smoke_result_spool_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_result_spool_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_result_spool_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_result_spool_receipts_finalized_mutation
				ON agent_evaluation_endpoint_smoke_result_spool_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_result_spool_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_result_spool_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_result_spool_payloads (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				namespace_digest TEXT NOT NULL,
				smoke_target_id TEXT NOT NULL,
				smoke_target_digest TEXT NOT NULL,
				invocation_id TEXT NOT NULL,
				spool_ref TEXT NOT NULL,
				spool_receipt_digest TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				response_body_digest TEXT NOT NULL,
				normalized_event_set_digest TEXT NOT NULL,
				key_id TEXT NOT NULL,
				key_version BIGINT NOT NULL,
				nonce_bytes BYTEA NOT NULL,
				authentication_tag_bytes BYTEA NOT NULL,
				ciphertext_bytes BYTEA NOT NULL,
				ciphertext_digest TEXT NOT NULL,
				ciphertext_size_bytes BIGINT NOT NULL,
				aad_digest TEXT NOT NULL,
				aad_json JSONB NOT NULL,
				aad_bytes BYTEA NOT NULL,
				envelope_digest TEXT NOT NULL,
				envelope_json JSONB NOT NULL,
				envelope_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, smoke_target_id),
				UNIQUE (namespace_id, spool_ref),
				UNIQUE (namespace_id, envelope_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id,
					plan_digest,
					smoke_target_id,
					smoke_target_digest,
					invocation_id,
					spool_ref,
					spool_receipt_digest,
					dispatch_intent_digest,
					transport_receipt_digest,
					response_body_digest,
					normalized_event_set_digest,
					key_id,
					key_version,
					envelope_digest,
					ciphertext_digest,
					aad_digest,
					created_at,
					expires_at
				) REFERENCES agent_evaluation_endpoint_smoke_result_spool_receipts(
					namespace_id,
					plan_digest,
					smoke_target_id,
					smoke_target_digest,
					invocation_id,
					spool_ref,
					receipt_digest,
					dispatch_intent_digest,
					transport_receipt_digest,
					response_body_digest,
					normalized_event_set_digest,
					key_id,
					key_version,
					envelope_digest,
					ciphertext_digest,
					aad_digest,
					created_at,
					expires_at
				)
					ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_payloads_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_payloads_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND namespace_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_body_digest ~ '^sha256-[a-f0-9]{64}$'
					AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND ciphertext_digest ~ '^sha256-[a-f0-9]{64}$'
					AND aad_digest ~ '^sha256-[a-f0-9]{64}$'
					AND envelope_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_payloads_bounds_check CHECK (
					key_version BETWEEN 1 AND 9007199254740991
					AND octet_length(nonce_bytes) = 12
					AND octet_length(authentication_tag_bytes) = 16
					AND ciphertext_size_bytes BETWEEN 1 AND 16777216
					AND octet_length(ciphertext_bytes) = ciphertext_size_bytes
					AND octet_length(aad_bytes) BETWEEN 1 AND 65536
					AND octet_length(envelope_bytes) BETWEEN 1 AND 22369622
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_payloads_expiry_check
					CHECK (expires_at > created_at)
			)`,
			`CREATE OR REPLACE FUNCTION reject_agent_evaluation_endpoint_smoke_spool_payload_update()
			RETURNS trigger AS $$
			BEGIN
				RAISE EXCEPTION 'agent evaluation endpoint-smoke spool payloads are immutable';
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_result_spool_payloads_immutable_update
				ON agent_evaluation_endpoint_smoke_result_spool_payloads`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_result_spool_payloads_immutable_update
				BEFORE UPDATE ON agent_evaluation_endpoint_smoke_result_spool_payloads
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_endpoint_smoke_spool_payload_update()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_result_spool_payloads_finalized_mutation
				ON agent_evaluation_endpoint_smoke_result_spool_payloads`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_result_spool_payloads_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_result_spool_payloads
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_spool_disposition_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				smoke_target_id TEXT NOT NULL,
				smoke_target_digest TEXT NOT NULL,
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
				PRIMARY KEY (namespace_id, plan_digest, smoke_target_id),
				UNIQUE (namespace_id, spool_ref),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, spool_receipt_digest, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, spool_ref, spool_receipt_digest, retention_policy_digest)
					REFERENCES agent_evaluation_endpoint_smoke_result_spool_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, spool_ref, receipt_digest, retention_policy_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_dispositions_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_dispositions_state_check CHECK (
					(disposition = 'consumed-and-destroyed' AND retained_until IS NULL)
					OR (disposition = 'retained-encrypted' AND retained_until > disposed_at)
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_dispositions_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND retention_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_result_spool_dispositions_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_result_spool_dispositions_immutable_mutation
				ON agent_evaluation_endpoint_smoke_spool_disposition_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_result_spool_dispositions_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_spool_disposition_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_result_spool_dispositions_finalized_mutation
				ON agent_evaluation_endpoint_smoke_spool_disposition_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_result_spool_dispositions_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_spool_disposition_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE OR REPLACE FUNCTION authorize_agent_evaluation_endpoint_smoke_spool_payload_delete()
			RETURNS trigger AS $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_endpoint_smoke_spool_disposition_receipts disposition
					WHERE disposition.namespace_id = OLD.namespace_id
						AND disposition.plan_digest = OLD.plan_digest
						AND disposition.smoke_target_id = OLD.smoke_target_id
						AND disposition.invocation_id = OLD.invocation_id
						AND disposition.spool_ref = OLD.spool_ref
						AND disposition.disposition = 'consumed-and-destroyed'
				) THEN
					RAISE EXCEPTION 'agent evaluation endpoint-smoke spool payload deletion requires an immutable consumed disposition';
				END IF;
				RETURN OLD;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_result_spool_payloads_authorized_delete
				ON agent_evaluation_endpoint_smoke_result_spool_payloads`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_result_spool_payloads_authorized_delete
				BEFORE DELETE ON agent_evaluation_endpoint_smoke_result_spool_payloads
				FOR EACH ROW EXECUTE FUNCTION authorize_agent_evaluation_endpoint_smoke_spool_payload_delete()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_validation_failure_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				smoke_target_id TEXT NOT NULL,
				smoke_target_digest TEXT NOT NULL,
				invocation_id TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				spool_receipt_digest TEXT NOT NULL,
				validator_policy_digest TEXT NOT NULL,
				validation_category TEXT NOT NULL,
				finding_digest TEXT NOT NULL,
				observed_at TIMESTAMPTZ NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, smoke_target_id),
				UNIQUE (namespace_id, plan_digest, receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest)
					REFERENCES agent_evaluation_endpoint_smoke_dispatch_intents(namespace_id, plan_digest, smoke_target_id, invocation_id, intent_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest, transport_receipt_digest)
					REFERENCES agent_evaluation_endpoint_smoke_transport_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest, receipt_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, spool_receipt_digest)
					REFERENCES agent_evaluation_endpoint_smoke_result_spool_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_validation_failure_receipts_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_validation_failure_receipts_category_check
					CHECK (validation_category IN ('expected-output-mismatch', 'normalized-result-contract-invalid')),
				CONSTRAINT agent_evaluation_endpoint_smoke_validation_failure_receipts_policy_check
					CHECK (validator_policy_digest = 'sha256-c5121d37a55eb840789c67809258f49175337ba632b2fe3c50bef38519b0f01b'),
				CONSTRAINT agent_evaluation_endpoint_smoke_validation_failure_receipts_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND validator_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND finding_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_validation_failure_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_validation_failure_receipts_immutable_mutation
				ON agent_evaluation_endpoint_smoke_validation_failure_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_validation_failure_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_validation_failure_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_validation_failure_receipts_finalized_mutation
				ON agent_evaluation_endpoint_smoke_validation_failure_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_validation_failure_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_validation_failure_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_terminal_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				smoke_target_id TEXT NOT NULL,
				smoke_target_digest TEXT NOT NULL,
				endpoint_class TEXT NOT NULL,
				protocol_family TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				model_id TEXT NOT NULL,
				immutable_model_version TEXT NOT NULL,
				model_lineage_digest TEXT NOT NULL,
				inference_configuration_digest TEXT NOT NULL,
				adapter_digest TEXT NOT NULL,
				pricing_authority_digest TEXT NOT NULL,
				response_spool_encryption_policy_digest TEXT NOT NULL,
				smoke_profile_digest TEXT NOT NULL,
				invocation_id TEXT NOT NULL,
				budget_reservation_id TEXT NOT NULL,
				demand_digest TEXT NOT NULL,
				settlement_digest TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				outcome TEXT NOT NULL,
				failure_category TEXT,
				provider_request_id TEXT,
				response_header_digest TEXT,
				response_digest TEXT,
				resolved_model_id TEXT,
				resolved_model_version TEXT,
				resolved_model_identity_digest TEXT,
				spool_receipt_digest TEXT,
				spool_disposition_receipt_digest TEXT,
				validation_failure_receipt_digest TEXT,
				usage_source_digest TEXT,
				cost_source_digest TEXT,
				usage_source_receipt_digest TEXT,
				cost_source_receipt_digest TEXT,
				pricing_snapshot_ref TEXT,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, smoke_target_id),
				UNIQUE (namespace_id, plan_digest, receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, invocation_id),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, dispatch_intent_digest)
					REFERENCES agent_evaluation_endpoint_smoke_dispatch_intents(namespace_id, plan_digest, smoke_target_id, invocation_id, intent_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, transport_receipt_digest)
					REFERENCES agent_evaluation_endpoint_smoke_transport_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, transport_receipt_digest, provider_request_id, response_header_digest)
					REFERENCES agent_evaluation_endpoint_smoke_transport_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest, provider_request_id, response_header_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, provider_configuration_id, provider_request_id)
					REFERENCES agent_evaluation_provider_requests(namespace_id, plan_digest, provider_configuration_id, provider_request_id) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, spool_receipt_digest, response_digest)
					REFERENCES agent_evaluation_endpoint_smoke_result_spool_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest, response_digest) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, spool_receipt_digest, spool_disposition_receipt_digest)
					REFERENCES agent_evaluation_endpoint_smoke_spool_disposition_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, spool_receipt_digest, receipt_digest) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (namespace_id, plan_digest, smoke_target_id, invocation_id, validation_failure_receipt_digest)
					REFERENCES agent_evaluation_endpoint_smoke_validation_failure_receipts(namespace_id, plan_digest, smoke_target_id, invocation_id, receipt_digest) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (namespace_id, plan_digest, usage_source_receipt_digest)
					REFERENCES agent_evaluation_source_receipts(namespace_id, plan_digest, receipt_digest) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (namespace_id, plan_digest, cost_source_receipt_digest)
					REFERENCES agent_evaluation_source_receipts(namespace_id, plan_digest, receipt_digest) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (namespace_id, plan_digest, budget_reservation_id, demand_digest)
					REFERENCES agent_evaluation_budget_reservations(namespace_id, plan_digest, reservation_id, demand_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, budget_reservation_id, settlement_digest)
					REFERENCES agent_evaluation_budget_settlements(namespace_id, plan_digest, reservation_id, settlement_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_protocol_check
					CHECK (protocol_family IN ('openai-responses', 'anthropic-messages', 'gemini-interactions', 'openai-compatible')),
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_endpoint_check
					CHECK (endpoint_class IN ('first-party-hosted', 'aggregator', 'self-hosted', 'local')),
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_outcome_check CHECK (
					outcome IN ('passed', 'failed')
					AND ((outcome = 'passed' AND failure_category IS NULL) OR (outcome = 'failed' AND failure_category IN (
						'transport-not-dispatched',
						'transport-post-dispatch-unknown',
						'transport-failed',
						'provider-response-invalid',
						'model-identity-drift',
						'usage-unavailable',
						'cost-unavailable'
					)))
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_authority_shape_check CHECK (
					((provider_request_id IS NULL AND response_header_digest IS NULL AND response_digest IS NULL)
						OR (provider_request_id IS NOT NULL AND response_header_digest IS NOT NULL AND response_digest IS NOT NULL))
					AND ((resolved_model_id IS NULL AND resolved_model_version IS NULL AND resolved_model_identity_digest IS NULL)
						OR (resolved_model_id IS NOT NULL AND resolved_model_identity_digest IS NOT NULL))
					AND ((spool_receipt_digest IS NULL AND spool_disposition_receipt_digest IS NULL)
						OR (spool_receipt_digest IS NOT NULL AND spool_disposition_receipt_digest IS NOT NULL AND response_digest IS NOT NULL))
					AND ((usage_source_digest IS NULL AND usage_source_receipt_digest IS NULL)
						OR (usage_source_digest IS NOT NULL AND usage_source_receipt_digest IS NOT NULL))
					AND ((cost_source_digest IS NULL AND cost_source_receipt_digest IS NULL AND pricing_snapshot_ref IS NULL)
						OR (cost_source_digest IS NOT NULL AND cost_source_receipt_digest IS NOT NULL
							AND usage_source_digest IS NOT NULL AND pricing_snapshot_ref IS NOT NULL))
					AND ((failure_category = 'provider-response-invalid') = (validation_failure_receipt_digest IS NOT NULL))
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_result_check CHECK (
					(outcome <> 'passed' OR (
						provider_request_id IS NOT NULL
						AND resolved_model_id IS NOT NULL
						AND spool_receipt_digest IS NOT NULL
						AND usage_source_digest IS NOT NULL
						AND cost_source_digest IS NOT NULL
					))
					AND (failure_category NOT IN ('transport-not-dispatched', 'transport-post-dispatch-unknown') OR (
						provider_request_id IS NULL
						AND resolved_model_id IS NULL
						AND spool_receipt_digest IS NULL
						AND usage_source_digest IS NULL
					))
					AND (failure_category <> 'model-identity-drift' OR resolved_model_id IS NOT NULL)
					AND (failure_category <> 'provider-response-invalid' OR (
						provider_request_id IS NOT NULL
						AND spool_receipt_digest IS NOT NULL
						AND usage_source_digest IS NULL
						AND cost_source_digest IS NULL
					))
					AND (failure_category <> 'usage-unavailable' OR (
						provider_request_id IS NOT NULL
						AND resolved_model_id IS NOT NULL
						AND spool_receipt_digest IS NOT NULL
						AND usage_source_digest IS NULL
						AND cost_source_digest IS NULL
					))
					AND (failure_category <> 'cost-unavailable' OR (
						provider_request_id IS NOT NULL
						AND resolved_model_id IS NOT NULL
						AND spool_receipt_digest IS NOT NULL
						AND usage_source_digest IS NOT NULL
						AND cost_source_digest IS NULL
					))
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND inference_configuration_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND pricing_authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_spool_encryption_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND smoke_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND demand_digest ~ '^sha256-[a-f0-9]{64}$'
					AND settlement_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (response_header_digest IS NULL OR response_header_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (response_digest IS NULL OR response_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (resolved_model_identity_digest IS NULL OR resolved_model_identity_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (spool_receipt_digest IS NULL OR spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (spool_disposition_receipt_digest IS NULL OR spool_disposition_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (validation_failure_receipt_digest IS NULL OR validation_failure_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (usage_source_digest IS NULL OR usage_source_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (cost_source_digest IS NULL OR cost_source_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (usage_source_receipt_digest IS NULL OR usage_source_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (cost_source_receipt_digest IS NULL OR cost_source_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_time_check
					CHECK (completed_at >= started_at),
				CONSTRAINT agent_evaluation_endpoint_smoke_terminal_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_terminal_receipts_immutable_mutation
				ON agent_evaluation_endpoint_smoke_terminal_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_terminal_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_terminal_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_terminal_receipts_finalized_mutation
				ON agent_evaluation_endpoint_smoke_terminal_receipts`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_terminal_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_terminal_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_qualification_reports (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				endpoint_smoke_dispatch_intent_set_digest TEXT NOT NULL,
				endpoint_smoke_transport_receipt_set_digest TEXT NOT NULL,
				endpoint_smoke_result_spool_receipt_set_digest TEXT NOT NULL,
				endpoint_smoke_result_spool_disposition_receipt_set_digest TEXT NOT NULL,
				endpoint_smoke_receipt_set_digest TEXT NOT NULL,
				qualified_target_count BIGINT NOT NULL,
				budget_reservation_id TEXT NOT NULL,
				outcome TEXT NOT NULL,
				failure_code TEXT,
				completed_at TIMESTAMPTZ NOT NULL,
				report_digest TEXT NOT NULL,
				report_json JSONB NOT NULL,
				report_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, report_digest),
				UNIQUE (
					namespace_id,
					plan_digest,
					report_digest,
					endpoint_smoke_dispatch_intent_set_digest,
					endpoint_smoke_transport_receipt_set_digest,
					endpoint_smoke_result_spool_receipt_set_digest,
					endpoint_smoke_result_spool_disposition_receipt_set_digest,
					endpoint_smoke_receipt_set_digest,
					budget_reservation_id
				),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, budget_reservation_id)
					REFERENCES agent_evaluation_budget_reservations(namespace_id, plan_digest, reservation_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_qualification_reports_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_qualification_reports_outcome_check CHECK (
					(outcome = 'completed' AND failure_code IS NULL)
					OR (outcome = 'failed' AND failure_code = 'endpoint-smoke-qualification-failed')
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_qualification_reports_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_dispatch_intent_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_transport_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_result_spool_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_result_spool_disposition_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND report_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_qualification_reports_bounds_check CHECK (
					qualified_target_count BETWEEN 0 AND 5
					AND octet_length(report_bytes) BETWEEN 1 AND 1048576
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_qualification_reports_immutable_mutation
				ON agent_evaluation_endpoint_smoke_qualification_reports`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_qualification_reports_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_qualification_reports
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_qualification_reports_finalized_mutation
				ON agent_evaluation_endpoint_smoke_qualification_reports`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_qualification_reports_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_qualification_reports
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_source_receipt_refs (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				source_receipt_id TEXT NOT NULL,
				source_content_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, source_receipt_id),
				UNIQUE (namespace_id, plan_digest, source_content_digest),
				UNIQUE (namespace_id, plan_digest, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, source_receipt_id, source_content_digest, receipt_digest)
					REFERENCES agent_evaluation_source_receipts(namespace_id, plan_digest, source_receipt_id, source_content_digest, receipt_digest) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				CONSTRAINT agent_evaluation_endpoint_smoke_source_receipt_refs_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_content_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_source_receipt_refs_immutable_mutation
				ON agent_evaluation_endpoint_smoke_source_receipt_refs`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_source_receipt_refs_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_source_receipt_refs
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_source_receipt_refs_finalized_mutation
				ON agent_evaluation_endpoint_smoke_source_receipt_refs`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_source_receipt_refs_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_source_receipt_refs
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE TABLE IF NOT EXISTS agent_evaluation_endpoint_smoke_evidence_commits (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				configuration_digest TEXT NOT NULL,
				budget_reservation_id TEXT NOT NULL,
				demand_digest TEXT NOT NULL,
				settlement_digest TEXT NOT NULL,
				endpoint_smoke_dispatch_intent_set_digest TEXT NOT NULL,
				endpoint_smoke_transport_receipt_set_digest TEXT NOT NULL,
				endpoint_smoke_result_spool_receipt_set_digest TEXT NOT NULL,
				endpoint_smoke_result_spool_disposition_receipt_set_digest TEXT NOT NULL,
				endpoint_smoke_validation_failure_receipt_set_digest TEXT NOT NULL,
				endpoint_smoke_receipt_set_digest TEXT NOT NULL,
				source_receipt_set_digest TEXT NOT NULL,
				dispatch_intent_count BIGINT NOT NULL,
				transport_receipt_count BIGINT NOT NULL,
				result_spool_receipt_count BIGINT NOT NULL,
				result_spool_disposition_receipt_count BIGINT NOT NULL,
				validation_failure_receipt_count BIGINT NOT NULL,
				endpoint_smoke_receipt_count BIGINT NOT NULL,
				source_receipt_count BIGINT NOT NULL,
				report_digest TEXT NOT NULL,
				commit_digest TEXT NOT NULL,
				commit_json JSONB NOT NULL,
				commit_bytes BYTEA NOT NULL,
				committed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, report_digest),
				UNIQUE (namespace_id, commit_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, budget_reservation_id, demand_digest)
					REFERENCES agent_evaluation_budget_reservations(namespace_id, plan_digest, reservation_id, demand_digest) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, budget_reservation_id, settlement_digest)
					REFERENCES agent_evaluation_budget_settlements(namespace_id, plan_digest, reservation_id, settlement_digest) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id,
					plan_digest,
					report_digest,
					endpoint_smoke_dispatch_intent_set_digest,
					endpoint_smoke_transport_receipt_set_digest,
					endpoint_smoke_result_spool_receipt_set_digest,
					endpoint_smoke_result_spool_disposition_receipt_set_digest,
					endpoint_smoke_receipt_set_digest,
					budget_reservation_id
				) REFERENCES agent_evaluation_endpoint_smoke_qualification_reports(
					namespace_id,
					plan_digest,
					report_digest,
					endpoint_smoke_dispatch_intent_set_digest,
					endpoint_smoke_transport_receipt_set_digest,
					endpoint_smoke_result_spool_receipt_set_digest,
					endpoint_smoke_result_spool_disposition_receipt_set_digest,
					endpoint_smoke_receipt_set_digest,
					budget_reservation_id
				) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_endpoint_smoke_evidence_commits_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_endpoint_smoke_evidence_commits_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND configuration_digest ~ '^sha256-[a-f0-9]{64}$'
					AND demand_digest ~ '^sha256-[a-f0-9]{64}$'
					AND settlement_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_dispatch_intent_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_transport_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_result_spool_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_result_spool_disposition_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_validation_failure_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND endpoint_smoke_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND report_digest ~ '^sha256-[a-f0-9]{64}$'
					AND commit_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_evidence_commits_count_check CHECK (
					dispatch_intent_count BETWEEN 1 AND 5
					AND transport_receipt_count = dispatch_intent_count
					AND endpoint_smoke_receipt_count = dispatch_intent_count
					AND result_spool_receipt_count BETWEEN 0 AND transport_receipt_count
					AND result_spool_disposition_receipt_count = result_spool_receipt_count
					AND validation_failure_receipt_count BETWEEN 0 AND endpoint_smoke_receipt_count
					AND source_receipt_count BETWEEN 0 AND 128
				),
				CONSTRAINT agent_evaluation_endpoint_smoke_evidence_commits_bytes_check
					CHECK (octet_length(commit_bytes) BETWEEN 1 AND 67108864)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_evidence_commits_immutable_mutation
				ON agent_evaluation_endpoint_smoke_evidence_commits`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_evidence_commits_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_evidence_commits
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_evidence_commits_finalized_mutation
				ON agent_evaluation_endpoint_smoke_evidence_commits`,
			`CREATE TRIGGER agent_evaluation_endpoint_smoke_evidence_commits_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_endpoint_smoke_evidence_commits
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,

			`CREATE OR REPLACE FUNCTION require_agent_evaluation_endpoint_smoke_completed_transport_spool()
			RETURNS trigger AS $$
			BEGIN
				IF NEW.outcome = 'completed' AND (
					NOT EXISTS (
						SELECT 1 FROM agent_evaluation_endpoint_smoke_result_spool_receipts receipt
						WHERE receipt.namespace_id = NEW.namespace_id
							AND receipt.plan_digest = NEW.plan_digest
							AND receipt.smoke_target_id = NEW.smoke_target_id
							AND receipt.invocation_id = NEW.invocation_id
							AND receipt.transport_receipt_digest = NEW.receipt_digest
					) OR NOT EXISTS (
						SELECT 1 FROM agent_evaluation_endpoint_smoke_result_spool_payloads payload
						WHERE payload.namespace_id = NEW.namespace_id
							AND payload.plan_digest = NEW.plan_digest
							AND payload.smoke_target_id = NEW.smoke_target_id
							AND payload.invocation_id = NEW.invocation_id
							AND payload.transport_receipt_digest = NEW.receipt_digest
					)
				) THEN
					RAISE EXCEPTION 'completed agent evaluation endpoint-smoke transport requires an encrypted result spool';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_transport_receipts_require_spool
				ON agent_evaluation_endpoint_smoke_transport_receipts`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_endpoint_smoke_transport_receipts_require_spool
				AFTER INSERT ON agent_evaluation_endpoint_smoke_transport_receipts
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_endpoint_smoke_completed_transport_spool()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_endpoint_smoke_spool_completed_transport()
			RETURNS trigger AS $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_endpoint_smoke_transport_receipts receipt
					WHERE receipt.namespace_id = NEW.namespace_id
						AND receipt.plan_digest = NEW.plan_digest
						AND receipt.smoke_target_id = NEW.smoke_target_id
						AND receipt.invocation_id = NEW.invocation_id
						AND receipt.receipt_digest = NEW.transport_receipt_digest
						AND receipt.outcome = 'completed'
				) THEN
					RAISE EXCEPTION 'agent evaluation endpoint-smoke result spool requires a completed transport';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_result_spool_receipts_require_completed_transport
				ON agent_evaluation_endpoint_smoke_result_spool_receipts`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_endpoint_smoke_result_spool_receipts_require_completed_transport
				AFTER INSERT ON agent_evaluation_endpoint_smoke_result_spool_receipts
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_endpoint_smoke_spool_completed_transport()`,

			`CREATE OR REPLACE FUNCTION require_agent_evaluation_endpoint_smoke_evidence_commit_complete()
			RETURNS trigger AS $$
			DECLARE
				qualified_count BIGINT;
				provider_response_invalid_count BIGINT;
			BEGIN
				IF (SELECT count(*) FROM agent_evaluation_endpoint_smoke_dispatch_intents
						WHERE namespace_id = NEW.namespace_id AND plan_digest = NEW.plan_digest) <> NEW.dispatch_intent_count
					OR (SELECT count(*) FROM agent_evaluation_endpoint_smoke_transport_receipts
						WHERE namespace_id = NEW.namespace_id AND plan_digest = NEW.plan_digest) <> NEW.transport_receipt_count
					OR (SELECT count(*) FROM agent_evaluation_endpoint_smoke_result_spool_receipts
						WHERE namespace_id = NEW.namespace_id AND plan_digest = NEW.plan_digest) <> NEW.result_spool_receipt_count
					OR (SELECT count(*) FROM agent_evaluation_endpoint_smoke_spool_disposition_receipts
						WHERE namespace_id = NEW.namespace_id AND plan_digest = NEW.plan_digest) <> NEW.result_spool_disposition_receipt_count
					OR (SELECT count(*) FROM agent_evaluation_endpoint_smoke_terminal_receipts
						WHERE namespace_id = NEW.namespace_id AND plan_digest = NEW.plan_digest) <> NEW.endpoint_smoke_receipt_count
					OR (SELECT count(*) FROM agent_evaluation_endpoint_smoke_validation_failure_receipts
						WHERE namespace_id = NEW.namespace_id AND plan_digest = NEW.plan_digest) <> NEW.validation_failure_receipt_count
					OR (SELECT count(*) FROM agent_evaluation_endpoint_smoke_source_receipt_refs
						WHERE namespace_id = NEW.namespace_id AND plan_digest = NEW.plan_digest) <> NEW.source_receipt_count
				THEN
					RAISE EXCEPTION 'agent evaluation endpoint-smoke evidence commit has an incomplete journal denominator';
				END IF;
				SELECT count(*) INTO qualified_count
				FROM agent_evaluation_endpoint_smoke_terminal_receipts
				WHERE namespace_id = NEW.namespace_id
					AND plan_digest = NEW.plan_digest
					AND outcome = 'passed';
				SELECT count(*) INTO provider_response_invalid_count
				FROM agent_evaluation_endpoint_smoke_terminal_receipts
				WHERE namespace_id = NEW.namespace_id
					AND plan_digest = NEW.plan_digest
					AND outcome = 'failed'
					AND failure_category = 'provider-response-invalid';
				IF provider_response_invalid_count <> NEW.validation_failure_receipt_count THEN
					RAISE EXCEPTION 'agent evaluation endpoint-smoke validation-failure denominator drifted';
				END IF;
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_endpoint_smoke_qualification_reports report
					WHERE report.namespace_id = NEW.namespace_id
						AND report.plan_digest = NEW.plan_digest
						AND report.report_digest = NEW.report_digest
						AND report.qualified_target_count = qualified_count
				) THEN
					RAISE EXCEPTION 'agent evaluation endpoint-smoke qualification report denominator drifted';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_endpoint_smoke_evidence_commits_require_complete
				ON agent_evaluation_endpoint_smoke_evidence_commits`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_endpoint_smoke_evidence_commits_require_complete
				AFTER INSERT ON agent_evaluation_endpoint_smoke_evidence_commits
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_endpoint_smoke_evidence_commit_complete()`,
		},
	}
}
