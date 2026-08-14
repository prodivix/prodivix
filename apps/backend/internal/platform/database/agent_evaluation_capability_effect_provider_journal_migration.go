package database

// agentEvaluationCapabilityEffectProviderJournalStatements installs the
// server-owned Provider shared-effect journal. Raw encrypted spool envelopes
// are held only until a result or abandonment transaction records the exact
// disposition receipt; immutable metadata remains available for replay and
// archive verification.
func agentEvaluationCapabilityEffectProviderJournalStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION agent_evaluation_canonical_jsonb_text(candidate JSONB)
			RETURNS TEXT LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
		DECLARE
			result TEXT;
		BEGIN
			IF candidate IS NULL THEN
				RETURN NULL;
			END IF;
			CASE jsonb_typeof(candidate)
				WHEN 'object' THEN
					SELECT '{'||COALESCE(string_agg(
						to_jsonb(member.key)::text||':'||
						agent_evaluation_canonical_jsonb_text(member.value),
						',' ORDER BY member.key COLLATE "C"
					),'')||'}'
					INTO result FROM jsonb_each(candidate) member;
					RETURN result;
				WHEN 'array' THEN
					SELECT '['||COALESCE(string_agg(
						agent_evaluation_canonical_jsonb_text(element.value),
						',' ORDER BY element.ordinality
					),'')||']'
					INTO result
					FROM jsonb_array_elements(candidate) WITH ORDINALITY element(value,ordinality);
					RETURN result;
				ELSE
					RETURN candidate::text;
			END CASE;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_canonical_jsonb_digest(candidate JSONB)
			RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
				SELECT 'sha256-'||encode(public.digest(
					convert_to(agent_evaluation_canonical_jsonb_text(candidate),'UTF8'),
					'sha256'
				),'hex')
			$$`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_base64url_decode(candidate TEXT)
			RETURNS BYTEA LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
		DECLARE
			decoded BYTEA;
			canonical TEXT;
		BEGIN
			IF candidate IS NULL OR candidate='' OR candidate !~ '^[A-Za-z0-9_-]+$'
				OR length(candidate)%4=1 THEN
				RETURN NULL;
			END IF;
			BEGIN
				decoded:=decode(
					rpad(translate(candidate,'-_','+/'),((length(candidate)+3)/4)*4,'='),
					'base64'
				);
			EXCEPTION WHEN OTHERS THEN
				RETURN NULL;
			END;
			canonical:=rtrim(translate(replace(encode(decoded,'base64'),E'\n',''),'+/','-_'),'=');
			IF canonical<>candidate THEN
				RETURN NULL;
			END IF;
			RETURN decoded;
		END;
		$$`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM agent_evaluation_controlled_authority_requests
				WHERE v45_eligible AND service_kind='provider-capability'
					AND operation='tool.execute'
					AND route_binding='capability-runtime/execute-tool'
					AND state IN ('dispatched','sealed')
				GROUP BY namespace_id,plan_digest,repository_commit,attempt_id,
					descriptor_digest,pre_effect_intent_digest
				HAVING COUNT(*)<>1
			) THEN
				RAISE EXCEPTION 'provider journal controlled pre-effect identity is ambiguous'
					USING ERRCODE='23514';
			END IF;
		END $$`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_controlled_provider_pre_effect
			ON agent_evaluation_controlled_authority_requests(
				namespace_id,plan_digest,repository_commit,attempt_id,
				descriptor_digest,pre_effect_intent_digest
			) WHERE v45_eligible AND service_kind='provider-capability'
				AND operation='tool.execute'
				AND route_binding='capability-runtime/execute-tool'
				AND state IN ('dispatched','sealed')`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_stages (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT NOT NULL,
			owner_request_digest TEXT NOT NULL,
			controlled_request_digest TEXT NOT NULL,
			record_digest TEXT NOT NULL,
			attempt_id TEXT NOT NULL,
			descriptor_digest TEXT NOT NULL,
			turn_index BIGINT NOT NULL,
			invocation_id TEXT NOT NULL,
			owner_request_id TEXT NOT NULL,
			runtime_fact_source_authority_digest TEXT NOT NULL,
			pre_effect_intent_digest TEXT NOT NULL,
			stage_digest TEXT NOT NULL,
			binding_kind TEXT NOT NULL,
			capability_id TEXT NOT NULL,
			provider_resource_set_commitment_digest TEXT,
			provider_resource_authority_digest TEXT,
			provider_resource_read_request_digest TEXT,
			provider_resource_read_receipt_digest TEXT,
			expires_at TIMESTAMPTZ NOT NULL,
			sealed_at TIMESTAMPTZ NOT NULL,
			record_json JSONB NOT NULL,
			record_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,owner_request_digest),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
			),
			UNIQUE (namespace_id,record_digest),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,attempt_id,turn_index,invocation_id
			),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			CONSTRAINT agent_eval_provider_journal_stage_identity_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND owner_instance_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND turn_index BETWEEN 0 AND 6
				AND binding_kind IN (
					'hosted-retrieval-query','opaque-continuation','provider-cache','provider-job'
				)
				AND capability_id IN (
					'provider.background-job','provider.hosted-retrieval',
					'provider.isolated-cache','provider.reasoning-continuation'
				)
				AND v45_eligible
			),
			CONSTRAINT agent_eval_provider_journal_stage_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND controlled_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
				AND runtime_fact_source_authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND pre_effect_intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (provider_resource_set_commitment_digest IS NULL OR
					provider_resource_set_commitment_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (provider_resource_authority_digest IS NULL OR
					provider_resource_authority_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (provider_resource_read_request_digest IS NULL OR
					provider_resource_read_request_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (provider_resource_read_receipt_digest IS NULL OR
					provider_resource_read_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
			),
			CONSTRAINT agent_eval_provider_journal_stage_time_check CHECK (
				expires_at>sealed_at AND expires_at<=sealed_at+INTERVAL '125 seconds'
			),
			CONSTRAINT agent_eval_provider_journal_stage_bytes_check CHECK (
				octet_length(record_bytes) BETWEEN 1 AND CASE binding_kind
					WHEN 'hosted-retrieval-query' THEN 49152 ELSE 32768 END
				AND record_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(record_json),'UTF8'
				)
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_provider_journal_stages_attempt
			ON agent_evaluation_capability_effect_provider_journal_stages(
				namespace_id,plan_digest,repository_commit,owner_instance_id,
				attempt_id,owner_request_digest
			)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_executions (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT NOT NULL,
			owner_request_digest TEXT NOT NULL,
			execution_sequence BIGINT NOT NULL,
			write_digest TEXT NOT NULL,
			record_digest TEXT NOT NULL,
			prior_execution_record_digest TEXT,
			stage_digest TEXT NOT NULL,
			execution_receipt_digest TEXT NOT NULL,
			operation TEXT NOT NULL,
			dispatch_intent_digest TEXT NOT NULL,
			transport_receipt_digest TEXT NOT NULL,
			spool_receipt_digest TEXT,
			spool_ref TEXT,
			spool_aad_digest TEXT,
			spool_envelope_digest TEXT,
			ciphertext_digest TEXT,
			ciphertext_size_bytes BIGINT,
			response_body_digest TEXT,
			response_projection_digest TEXT NOT NULL,
			retrieval_citation_resource_id TEXT,
			response_digest TEXT NOT NULL,
			normalized_event_set_digest TEXT NOT NULL,
			executed_at TIMESTAMPTZ NOT NULL,
			sealed_at TIMESTAMPTZ NOT NULL,
			record_json JSONB NOT NULL,
			record_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,
				owner_request_digest,execution_sequence
			),
			UNIQUE (namespace_id,record_digest),
			UNIQUE (namespace_id,write_digest),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
			)
				REFERENCES agent_evaluation_capability_effect_provider_journal_stages(
					namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_provider_journal_execution_sequence_check
				CHECK (execution_sequence BETWEEN 0 AND 4),
			CONSTRAINT agent_eval_provider_journal_execution_operation_check CHECK (
				operation IN (
					'background-poll','hosted-retrieval-query','continuation-resume',
					'cache-cold','cache-warm'
				)
			),
			CONSTRAINT agent_eval_provider_journal_execution_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND write_digest ~ '^sha256-[a-f0-9]{64}$'
				AND record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (prior_execution_record_digest IS NULL OR
					prior_execution_record_digest ~ '^sha256-[a-f0-9]{64}$')
				AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
				AND execution_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (spool_receipt_digest IS NULL OR spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (spool_aad_digest IS NULL OR spool_aad_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (spool_envelope_digest IS NULL OR spool_envelope_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (ciphertext_digest IS NULL OR ciphertext_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (response_body_digest IS NULL OR response_body_digest ~ '^sha256-[a-f0-9]{64}$')
				AND response_projection_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (retrieval_citation_resource_id IS NULL OR (
					retrieval_citation_resource_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND retrieval_citation_resource_id !~* '(^|[^A-Za-z0-9_])Bearer[[:space:]]+[A-Za-z0-9._~+/=-]{8,}'
					AND retrieval_citation_resource_id !~* '(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{8,}'
				))
				AND response_digest ~ '^sha256-[a-f0-9]{64}$'
				AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
			),
			CONSTRAINT agent_eval_provider_journal_execution_spool_bundle_check CHECK (
				(spool_receipt_digest IS NULL AND spool_ref IS NULL AND spool_aad_digest IS NULL
					AND spool_envelope_digest IS NULL AND ciphertext_digest IS NULL
					AND ciphertext_size_bytes IS NULL AND response_body_digest IS NULL)
				OR (spool_receipt_digest IS NOT NULL AND spool_ref IS NOT NULL
					AND spool_aad_digest IS NOT NULL AND spool_envelope_digest IS NOT NULL
					AND ciphertext_digest IS NOT NULL
					AND ciphertext_size_bytes BETWEEN 1 AND 262144
					AND response_body_digest IS NOT NULL)
			),
			CONSTRAINT agent_eval_provider_journal_execution_bytes_check CHECK (
				octet_length(record_bytes) BETWEEN 1 AND 24576
				AND record_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(record_json),'UTF8'
				)
				AND octet_length(convert_to(agent_evaluation_canonical_jsonb_text(
					record_json-'executionReceipt'
				),'UTF8'))<=7680
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_provider_journal_executions_terminal
			ON agent_evaluation_capability_effect_provider_journal_executions(
				namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest,
				execution_sequence DESC
			)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_spool_payloads (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT NOT NULL,
			owner_request_digest TEXT NOT NULL,
			execution_sequence BIGINT NOT NULL,
			spool_ref TEXT NOT NULL,
			spool_receipt_digest TEXT NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			spool_envelope_json JSONB NOT NULL,
			spool_envelope_bytes BYTEA NOT NULL,
			ciphertext_present BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,
				owner_request_digest,execution_sequence
			),
			UNIQUE (namespace_id,spool_ref),
			UNIQUE (namespace_id,spool_receipt_digest),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,
				owner_request_digest,execution_sequence
			) REFERENCES agent_evaluation_capability_effect_provider_journal_executions(
				namespace_id,plan_digest,repository_commit,owner_instance_id,
				owner_request_digest,execution_sequence
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_provider_journal_spool_payload_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
			),
			CONSTRAINT agent_eval_provider_journal_spool_payload_bytes_check CHECK (
				ciphertext_present
				AND octet_length(spool_envelope_bytes) BETWEEN 1 AND 524288
				AND spool_envelope_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(spool_envelope_json),'UTF8'
				)
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_provider_journal_spool_payload_expiry
			ON agent_evaluation_capability_effect_provider_journal_spool_payloads(
				namespace_id,repository_commit,owner_instance_id,expires_at,spool_ref
			)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_spool_dispositions (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT NOT NULL,
			owner_request_digest TEXT NOT NULL,
			execution_sequence BIGINT NOT NULL,
			receipt_digest TEXT NOT NULL,
			disposition TEXT NOT NULL,
			result_seal_receipt_digest TEXT,
			abandonment_reason TEXT,
			disposed_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,
				owner_request_digest,execution_sequence
			),
			UNIQUE (namespace_id,receipt_digest),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,
				owner_request_digest,execution_sequence
			) REFERENCES agent_evaluation_capability_effect_provider_journal_executions(
				namespace_id,plan_digest,repository_commit,owner_instance_id,
				owner_request_digest,execution_sequence
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_provider_journal_spool_disposition_shape_check CHECK (
				(disposition='consumed-and-destroyed' AND result_seal_receipt_digest IS NOT NULL
					AND abandonment_reason IS NULL)
				OR (disposition='abandoned-and-destroyed' AND result_seal_receipt_digest IS NULL
					AND abandonment_reason IN (
						'attempt-terminal','cleanup-requested','stage-expired'
					))
			),
			CONSTRAINT agent_eval_provider_journal_spool_disposition_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (result_seal_receipt_digest IS NULL OR
					result_seal_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
			),
			CONSTRAINT agent_eval_provider_journal_spool_disposition_bytes_check CHECK (
				octet_length(receipt_bytes) BETWEEN 1 AND 65536
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8'
				)
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_results (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT NOT NULL,
			owner_request_digest TEXT NOT NULL,
			record_digest TEXT NOT NULL,
			stage_digest TEXT NOT NULL,
			terminal_execution_record_digest TEXT NOT NULL,
			result_seal_receipt_digest TEXT NOT NULL,
			result_status TEXT NOT NULL,
			business_result_digest TEXT NOT NULL,
			source_fact_kind TEXT,
			source_fact_digest TEXT,
			consumed_input_source_fact_digest TEXT,
			state_vault_retire_request_digest TEXT,
			state_vault_retirement_receipt_digest TEXT,
			next_state_vault_seal_request_digest TEXT,
			next_state_vault_seal_receipt_digest TEXT,
			provider_resource_set_commitment_digest TEXT,
			provider_resource_authority_digest TEXT,
			provider_resource_read_request_digest TEXT,
			provider_resource_read_receipt_digest TEXT,
			sealed_at TIMESTAMPTZ NOT NULL,
			record_json JSONB NOT NULL,
			record_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
			),
			UNIQUE (namespace_id,record_digest),
			UNIQUE (namespace_id,result_seal_receipt_digest),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
			)
				REFERENCES agent_evaluation_capability_effect_provider_journal_stages(
					namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_provider_journal_result_status_check
				CHECK (result_status IN ('produced','failed','unavailable') AND v45_eligible),
			CONSTRAINT agent_eval_provider_journal_result_source_check CHECK (
				(source_fact_kind IS NULL)=(source_fact_digest IS NULL)
				AND (source_fact_kind IS NULL OR source_fact_kind IN (
					'opaque-continuation','provider-cache-receipt',
					'provider-job-receipt','retrieval-query-receipt'
				))
			),
			CONSTRAINT agent_eval_provider_journal_result_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
				AND terminal_execution_record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND result_seal_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND business_result_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (source_fact_digest IS NULL OR source_fact_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (consumed_input_source_fact_digest IS NULL OR
					consumed_input_source_fact_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (state_vault_retire_request_digest IS NULL OR
					state_vault_retire_request_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (state_vault_retirement_receipt_digest IS NULL OR
					state_vault_retirement_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (next_state_vault_seal_request_digest IS NULL OR
					next_state_vault_seal_request_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (next_state_vault_seal_receipt_digest IS NULL OR
					next_state_vault_seal_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (provider_resource_set_commitment_digest IS NULL OR
					provider_resource_set_commitment_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (provider_resource_authority_digest IS NULL OR
					provider_resource_authority_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (provider_resource_read_request_digest IS NULL OR
					provider_resource_read_request_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (provider_resource_read_receipt_digest IS NULL OR
					provider_resource_read_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
			),
			CONSTRAINT agent_eval_provider_journal_result_bytes_check CHECK (
				octet_length(record_bytes) BETWEEN 1 AND 49152
				AND record_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(record_json),'UTF8'
				)
				AND octet_length(convert_to(agent_evaluation_canonical_jsonb_text(
					record_json-'businessResult'
				),'UTF8'))<=32256
			)
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_provider_journal_result_consumed_source
			ON agent_evaluation_capability_effect_provider_journal_results(
				namespace_id,plan_digest,repository_commit,consumed_input_source_fact_digest
			) WHERE consumed_input_source_fact_digest IS NOT NULL`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_abandonments (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT NOT NULL,
			owner_request_digest TEXT NOT NULL,
			record_digest TEXT NOT NULL,
			stage_digest TEXT NOT NULL,
			last_execution_record_digest TEXT,
			reason TEXT NOT NULL,
			abandoned_at TIMESTAMPTZ NOT NULL,
			record_json JSONB NOT NULL,
			record_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
			),
			UNIQUE (namespace_id,record_digest),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
			)
				REFERENCES agent_evaluation_capability_effect_provider_journal_stages(
					namespace_id,plan_digest,repository_commit,owner_instance_id,owner_request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_provider_journal_abandonment_reason_check CHECK (
				reason IN ('attempt-terminal','cleanup-requested','stage-expired') AND v45_eligible
			),
			CONSTRAINT agent_eval_provider_journal_abandonment_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (last_execution_record_digest IS NULL OR
					last_execution_record_digest ~ '^sha256-[a-f0-9]{64}$')
			),
			CONSTRAINT agent_eval_provider_journal_abandonment_bytes_check CHECK (
				octet_length(record_bytes) BETWEEN 1 AND 49152
				AND record_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(record_json),'UTF8'
				)
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_cleanup_requests (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			attempt_id TEXT NOT NULL,
			reason TEXT NOT NULL,
			requested_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,request_digest
			),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,owner_instance_id,attempt_id
			),
			UNIQUE (namespace_id,request_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			CONSTRAINT agent_eval_provider_journal_cleanup_request_reason_check
				CHECK (reason IN ('attempt-terminal','cleanup-requested','stage-expired')),
			CONSTRAINT agent_eval_provider_journal_cleanup_request_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND request_digest ~ '^sha256-[a-f0-9]{64}$'
			),
			CONSTRAINT agent_eval_provider_journal_cleanup_request_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 131072
				AND request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(request_json),'UTF8'
				)
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_provider_journal_cleanup_receipts (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			destroyed_encrypted_spool_count BIGINT NOT NULL,
			abandonment_disposition_receipt_digests JSONB NOT NULL,
			abandonment_record_digests JSONB NOT NULL,
			residual_encrypted_spool_count BIGINT NOT NULL,
			unfinished_owner_count BIGINT NOT NULL,
			completed_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,request_digest
			),
			UNIQUE (namespace_id,receipt_digest),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,owner_instance_id,request_digest
			)
				REFERENCES agent_evaluation_capability_effect_provider_journal_cleanup_requests(
					namespace_id,plan_digest,repository_commit,owner_instance_id,request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_provider_journal_cleanup_receipt_zero_check CHECK (
				residual_encrypted_spool_count=0 AND unfinished_owner_count=0
				AND destroyed_encrypted_spool_count BETWEEN 0 AND 23520
			),
			CONSTRAINT agent_eval_provider_journal_cleanup_receipt_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
			),
			CONSTRAINT agent_eval_provider_journal_cleanup_receipt_bytes_check CHECK (
				octet_length(receipt_bytes) BETWEEN 1 AND 131072
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8'
				)
			)
		)`,
	}
}
