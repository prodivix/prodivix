package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6Statements installs
// the durable first-delivery fence, encrypted lifecycle spool, journal archive
// owner and v46 health projection. The provider may only be called after the
// first-delivery claim function commits; every later claim is reconcile-only.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6Statements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			authority_digest TEXT,
			lifecycle_claim_receipt_digest TEXT,
			intent_id TEXT NOT NULL,
			intent_digest TEXT NOT NULL,
			protocol_family TEXT NOT NULL,
			capability_profile_id TEXT NOT NULL,
			budget_reservation_id TEXT NOT NULL,
			budget_reservation_authority_digest TEXT NOT NULL,
			operation TEXT NOT NULL,
			mutation_kind TEXT NOT NULL,
			mutation_sequence BIGINT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			intent_json JSONB NOT NULL,
			intent_bytes BYTEA NOT NULL,
			resource_id TEXT GENERATED ALWAYS AS (intent_json->>'resourceId') STORED,
			resource_role TEXT GENERATED ALWAYS AS (intent_json->>'resourceRole') STORED,
			v46_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,intent_digest),
			UNIQUE (namespace_id,intent_id),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,registration_request_digest
			) REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_registration_requests(
				namespace_id,plan_digest,repository_commit,request_digest
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_intent_identity_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND protocol_family IN ('gemini-interactions','openai-responses')
				AND capability_profile_id IN (
					'g4-provider-hosted-retrieval-core','g4-provider-hosted-retrieval-document'
				)
				AND operation IN ('create','delete')
				AND mutation_kind IN (
					'create-primary','delete-resource','upload-content',
					'upload-content-finalize','upload-content-start'
				)
				AND mutation_sequence BETWEEN 0 AND 3
				AND ((operation='create' AND authority_digest IS NULL
					AND lifecycle_claim_receipt_digest IS NULL
					AND mutation_kind<>'delete-resource')
					OR (operation='delete' AND authority_digest IS NOT NULL
						AND lifecycle_claim_receipt_digest IS NOT NULL
						AND mutation_kind='delete-resource' AND mutation_sequence=0
						AND resource_id IS NOT NULL
						AND resource_role IN ('auxiliary','primary')))
				AND v46_eligible
			),
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_intent_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND registration_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (authority_digest IS NULL OR authority_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (lifecycle_claim_receipt_digest IS NULL
					OR lifecycle_claim_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND budget_reservation_authority_digest ~ '^sha256-[a-f0-9]{64}$'
			),
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_intent_bytes_check CHECK (
				octet_length(intent_bytes) BETWEEN 1 AND 16384
				AND intent_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(intent_json),'UTF8')
			)
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_create_intent_once
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents(
				namespace_id,plan_digest,repository_commit,registration_request_digest,
				operation,mutation_sequence
			) WHERE operation='create'`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_delete_known_id_once
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents(
				namespace_id,plan_digest,repository_commit,registration_request_digest,
				operation,resource_id
			) WHERE operation='delete'`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests (
			namespace_id TEXT NOT NULL,
			intent_digest TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			lifecycle_owner_instance_id TEXT NOT NULL,
			expected_dispatch_ledger_revision BIGINT NOT NULL,
			expected_dispatch_generation BIGINT NOT NULL,
			expected_prior_stage_claim_receipt_digest TEXT,
			expected_prior_claim_expires_at TIMESTAMPTZ,
			requested_at TIMESTAMPTZ NOT NULL,
			minimum_claim_expires_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,request_digest),
			FOREIGN KEY (namespace_id,intent_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents(
					namespace_id,intent_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_claim_request_check CHECK (
				intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND expected_dispatch_ledger_revision>=0
				AND expected_dispatch_generation>=0
				AND ((expected_dispatch_generation=0
					AND expected_dispatch_ledger_revision=0
					AND expected_prior_stage_claim_receipt_digest IS NULL
					AND expected_prior_claim_expires_at IS NULL)
					OR (expected_dispatch_generation>=1
						AND expected_dispatch_ledger_revision>=expected_dispatch_generation
						AND expected_prior_stage_claim_receipt_digest
							~ '^sha256-[a-f0-9]{64}$'
						AND expected_prior_claim_expires_at IS NOT NULL))
				AND minimum_claim_expires_at>requested_at
				AND minimum_claim_expires_at<=requested_at+INTERVAL '125 seconds'
				AND octet_length(request_bytes) BETWEEN 1 AND 16384
				AND request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts (
			namespace_id TEXT NOT NULL,
			intent_digest TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			dispatch_authority_issuer_id TEXT NOT NULL,
			dispatch_authority_implementation_digest TEXT NOT NULL,
			dispatch_ledger_revision BIGINT NOT NULL,
			lifecycle_owner_instance_id TEXT NOT NULL,
			dispatch_generation BIGINT NOT NULL,
			generation_transition TEXT NOT NULL,
			delivery_disposition TEXT NOT NULL,
			claimed_at TIMESTAMPTZ NOT NULL,
			claim_expires_at TIMESTAMPTZ NOT NULL,
			prior_transport_receipt_digest TEXT,
			sealed_journal_record_digest TEXT,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,receipt_digest),
			UNIQUE (namespace_id,request_digest),
			FOREIGN KEY (namespace_id,request_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests(
					namespace_id,request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_claim_receipt_check CHECK (
				intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_ledger_revision>=1 AND dispatch_generation>=1
				AND generation_transition IN (
					'expired-owner-takeover','generation-retained','initial-first-delivery'
				)
				AND delivery_disposition IN (
					'dispatch-authorized-first-delivery','reconcile-only-replay','sealed-read-only'
				)
				AND claim_expires_at>claimed_at
				AND claim_expires_at<=claimed_at+INTERVAL '125 seconds'
				AND (prior_transport_receipt_digest IS NULL
					OR prior_transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (sealed_journal_record_digest IS NULL
					OR sealed_journal_record_digest ~ '^sha256-[a-f0-9]{64}$')
				AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`ALTER TABLE agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests
			ADD CONSTRAINT agent_eval_hosted_runtime_lifecycle_claim_request_prior_fk
			FOREIGN KEY (namespace_id,expected_prior_stage_claim_receipt_digest)
			REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts(
				namespace_id,receipt_digest
			) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current (
			namespace_id TEXT NOT NULL,
			intent_digest TEXT NOT NULL,
			current_revision BIGINT NOT NULL,
			dispatch_ledger_revision BIGINT NOT NULL,
			dispatch_generation BIGINT NOT NULL,
			ever_dispatch_authorized BOOLEAN NOT NULL,
			current_claim_receipt_digest TEXT NOT NULL,
			lifecycle_owner_instance_id TEXT NOT NULL,
			claim_expires_at TIMESTAMPTZ NOT NULL,
			prior_transport_receipt_digest TEXT,
			sealed_journal_record_digest TEXT,
			updated_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id,intent_digest),
			FOREIGN KEY (namespace_id,intent_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents(
					namespace_id,intent_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,current_claim_receipt_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_claim_current_check CHECK (
				current_revision>=1 AND dispatch_ledger_revision>=dispatch_generation
				AND dispatch_generation>=1 AND ever_dispatch_authorized
				AND (prior_transport_receipt_digest IS NULL
					OR prior_transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (sealed_journal_record_digest IS NULL
					OR sealed_journal_record_digest ~ '^sha256-[a-f0-9]{64}$')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts (
			namespace_id TEXT NOT NULL,
			intent_digest TEXT NOT NULL,
			dispatch_claim_receipt_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			dispatch_state TEXT NOT NULL,
			outcome TEXT NOT NULL,
			started_at TIMESTAMPTZ NOT NULL,
			completed_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,receipt_digest),
			UNIQUE (namespace_id,intent_digest),
			FOREIGN KEY (namespace_id,intent_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents(
					namespace_id,intent_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,dispatch_claim_receipt_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_transport_check CHECK (
				dispatch_state IN ('dispatched','not-dispatched')
				AND outcome IN ('completed','failed','post-dispatch-unknown')
				AND completed_at>=started_at
				AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			authority_digest TEXT,
			lifecycle_claim_receipt_digest TEXT,
			frozen_run_digest TEXT NOT NULL,
			run_config_artifact_binding_digest TEXT NOT NULL,
			lifecycle_expires_at TIMESTAMPTZ NOT NULL,
			resource_id TEXT,
			resource_role TEXT,
			spool_ref TEXT NOT NULL,
			operation TEXT NOT NULL,
			dispatch_intent_set_digest TEXT NOT NULL,
			dispatch_stage_claim_receipt_set_digest TEXT NOT NULL,
			dispatch_stage_claim_history_set_digest TEXT NOT NULL,
			transport_receipt_set_digest TEXT NOT NULL,
			business_result_digest TEXT NOT NULL,
			plaintext_digest TEXT NOT NULL,
			envelope_digest TEXT NOT NULL,
			envelope_json JSONB NOT NULL,
			envelope_bytes BYTEA NOT NULL,
			spool_write_envelope_json JSONB NOT NULL,
			spool_write_envelope_bytes BYTEA NOT NULL,
			aad_digest TEXT NOT NULL,
			aad_json JSONB NOT NULL,
			aad_bytes BYTEA NOT NULL,
			algorithm TEXT NOT NULL,
			key_id TEXT NOT NULL,
			key_version BIGINT NOT NULL,
			key_ref_digest TEXT NOT NULL,
			encryption_profile_digest TEXT NOT NULL,
			ciphertext_digest TEXT NOT NULL,
			ciphertext_bytes BYTEA NOT NULL,
			ciphertext_byte_length BIGINT NOT NULL,
			nonce_bytes BYTEA NOT NULL,
			authentication_tag_bytes BYTEA NOT NULL,
			spool_receipt_digest TEXT NOT NULL,
			spool_receipt_json JSONB NOT NULL,
			spool_receipt_bytes BYTEA NOT NULL,
			transport_store_request_digest TEXT NOT NULL,
			transport_store_request_json JSONB NOT NULL,
			transport_store_request_bytes BYTEA NOT NULL,
			expected_prior_transport_store_receipt_digest TEXT,
			transport_store_receipt_digest TEXT NOT NULL,
			transport_store_receipt_json JSONB NOT NULL,
			transport_store_receipt_bytes BYTEA NOT NULL,
			transport_store_receipt_history_digest TEXT NOT NULL,
			transport_store_receipt_history_json JSONB NOT NULL,
			transport_store_receipt_history_bytes BYTEA NOT NULL,
			superseded_spool_receipt_digest TEXT,
			superseded_spool_destroyed_at TIMESTAMPTZ,
			transport_authority_issuer_id TEXT NOT NULL,
			transport_authority_implementation_digest TEXT NOT NULL,
			transport_ledger_revision BIGINT NOT NULL,
			transport_stored_at TIMESTAMPTZ NOT NULL,
			state TEXT NOT NULL,
			disposition TEXT,
			business_seal_kind TEXT,
			business_seal_receipt_digest TEXT,
			retention_policy_digest TEXT NOT NULL,
			spooled_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			cleared_at TIMESTAMPTZ,
			expiry_cleared_at TIMESTAMPTZ,
			disposition_receipt_digest TEXT,
			disposition_receipt_json JSONB,
			disposition_receipt_bytes BYTEA,
			v46_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,spool_ref),
			UNIQUE (namespace_id,envelope_digest),
			UNIQUE (namespace_id,spool_receipt_digest),
			UNIQUE (namespace_id,transport_store_request_digest),
			UNIQUE (namespace_id,transport_store_receipt_digest),
			UNIQUE (namespace_id,transport_store_receipt_history_digest),
			FOREIGN KEY (namespace_id,expected_prior_transport_store_receipt_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
					namespace_id,transport_store_receipt_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,registration_request_digest
			) REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_registration_requests(
				namespace_id,plan_digest,repository_commit,request_digest
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_spool_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND frozen_run_digest ~ '^sha256-[a-f0-9]{64}$'
				AND run_config_artifact_binding_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_intent_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_stage_claim_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_stage_claim_history_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND business_result_digest ~ '^sha256-[a-f0-9]{64}$'
				AND plaintext_digest ~ '^sha256-[a-f0-9]{64}$'
				AND envelope_digest ~ '^sha256-[a-f0-9]{64}$'
				AND aad_digest ~ '^sha256-[a-f0-9]{64}$'
				AND ciphertext_digest ~ '^sha256-[a-f0-9]{64}$'
				AND key_ref_digest ~ '^sha256-[a-f0-9]{64}$'
				AND encryption_profile_digest ~ '^sha256-[a-f0-9]{64}$'
				AND retention_policy_digest ~ '^sha256-[a-f0-9]{64}$'
				AND algorithm='aes-256-gcm' AND key_version=1
				AND spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_store_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_store_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_store_receipt_history_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (expected_prior_transport_store_receipt_digest IS NULL
					OR expected_prior_transport_store_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (superseded_spool_receipt_digest IS NULL
					OR superseded_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND transport_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_ledger_revision>=1
				AND ((expected_prior_transport_store_receipt_digest IS NULL
						AND superseded_spool_receipt_digest IS NULL
						AND superseded_spool_destroyed_at IS NULL)
					OR (expected_prior_transport_store_receipt_digest IS NOT NULL
						AND superseded_spool_receipt_digest IS NOT NULL
						AND superseded_spool_destroyed_at IS NOT NULL
						AND superseded_spool_destroyed_at<=transport_stored_at))
				AND (disposition_receipt_digest IS NULL
					OR disposition_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND operation IN ('create','delete') AND v46_eligible
			),
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_spool_time_check CHECK (
				expires_at>spooled_at AND expires_at<=lifecycle_expires_at
				AND transport_stored_at>=spooled_at AND transport_stored_at<expires_at
				AND expires_at<=spooled_at+INTERVAL '8 days'
			),
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_spool_bytes_check CHECK (
				octet_length(envelope_bytes) BETWEEN 1 AND 65536
				AND envelope_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(envelope_json),'UTF8')
				AND octet_length(spool_write_envelope_bytes) BETWEEN 1 AND 524288
				AND spool_write_envelope_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(spool_write_envelope_json),'UTF8')
				AND octet_length(aad_bytes) BETWEEN 1 AND 65536
				AND aad_bytes=convert_to(agent_evaluation_canonical_jsonb_text(aad_json),'UTF8')
				AND octet_length(spool_receipt_bytes) BETWEEN 1 AND 65536
				AND spool_receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(spool_receipt_json),'UTF8')
				AND octet_length(transport_store_request_bytes) BETWEEN 1 AND 524288
				AND transport_store_request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(transport_store_request_json),'UTF8')
				AND octet_length(transport_store_receipt_bytes) BETWEEN 1 AND 65536
				AND transport_store_receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(transport_store_receipt_json),'UTF8')
				AND octet_length(transport_store_receipt_history_bytes) BETWEEN 1 AND 32768
				AND transport_store_receipt_history_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(
						transport_store_receipt_history_json),'UTF8')
				AND (disposition_receipt_bytes IS NULL
					OR octet_length(disposition_receipt_bytes) BETWEEN 1 AND 65536)
				AND ((state='active' AND disposition IS NULL AND business_seal_kind IS NULL
					AND business_seal_receipt_digest IS NULL AND cleared_at IS NULL
					AND expiry_cleared_at IS NULL
					AND disposition_receipt_digest IS NULL
					AND disposition_receipt_json IS NULL
					AND disposition_receipt_bytes IS NULL
					AND ciphertext_byte_length=octet_length(ciphertext_bytes)
					AND ciphertext_byte_length BETWEEN 1 AND 262144
					AND octet_length(nonce_bytes)=12
					AND octet_length(authentication_tag_bytes)=16)
					OR (state='retained-encrypted'
						AND disposition='retained-encrypted-for-recovery'
						AND business_seal_kind='recovery-pending'
						AND business_seal_receipt_digest IS NULL
						AND cleared_at IS NULL AND expiry_cleared_at IS NULL
						AND disposition_receipt_digest IS NOT NULL
						AND disposition_receipt_json IS NOT NULL
						AND disposition_receipt_bytes=convert_to(
							agent_evaluation_canonical_jsonb_text(disposition_receipt_json),'UTF8')
						AND ciphertext_byte_length=octet_length(ciphertext_bytes)
						AND ciphertext_byte_length BETWEEN 1 AND 262144
						AND octet_length(nonce_bytes)=12
						AND octet_length(authentication_tag_bytes)=16)
					OR (state='destroyed'
						AND ((disposition='destroyed-after-business-seal'
							AND business_seal_kind IN (
								'abandoned-before-provider-effect','cleanup-result',
								'partial-create-result','registration-result'
							) AND business_seal_receipt_digest IS NOT NULL
							AND expiry_cleared_at IS NULL)
							OR (disposition='retained-encrypted-for-recovery'
								AND business_seal_kind='recovery-pending'
								AND business_seal_receipt_digest IS NULL
								AND expiry_cleared_at IS NOT NULL)
							OR (disposition='destroyed-after-prefix-supersession'
								AND business_seal_kind='transport-prefix-superseded'
								AND business_seal_receipt_digest IS NOT NULL
								AND expiry_cleared_at IS NULL))
						AND cleared_at IS NOT NULL
						AND disposition_receipt_digest IS NOT NULL
						AND disposition_receipt_json IS NOT NULL
						AND disposition_receipt_bytes=convert_to(
							agent_evaluation_canonical_jsonb_text(disposition_receipt_json),'UTF8')
						AND ciphertext_byte_length=0
						AND octet_length(ciphertext_bytes)=0 AND octet_length(nonce_bytes)=0
						AND octet_length(authentication_tag_bytes)=0))
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_spool_expiry
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
				namespace_id,state,expires_at,registration_request_digest
			)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_spool_current
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
				namespace_id,registration_request_digest,operation
			) WHERE state IN ('active','retained-encrypted')`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_transport_first
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
				namespace_id,registration_request_digest,operation
			) WHERE expected_prior_transport_store_receipt_digest IS NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_transport_successor
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
				namespace_id,expected_prior_transport_store_receipt_digest
			) WHERE expected_prior_transport_store_receipt_digest IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_transport_history
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
				namespace_id,registration_request_digest,operation,
				transport_ledger_revision,transport_store_receipt_digest
			)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spool_expiry_tombstones (
			namespace_id TEXT NOT NULL,
			spool_ref TEXT NOT NULL,
			spool_receipt_digest TEXT NOT NULL,
			envelope_digest TEXT NOT NULL,
			ciphertext_digest TEXT NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			cleared_at TIMESTAMPTZ NOT NULL,
			tombstone_digest TEXT NOT NULL,
			tombstone_json JSONB NOT NULL,
			tombstone_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,spool_ref),
			UNIQUE (namespace_id,tombstone_digest),
			FOREIGN KEY (namespace_id,spool_ref)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
					namespace_id,spool_ref
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_spool_expiry_check CHECK (
				spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND envelope_digest ~ '^sha256-[a-f0-9]{64}$'
				AND ciphertext_digest ~ '^sha256-[a-f0-9]{64}$'
				AND tombstone_digest ~ '^sha256-[a-f0-9]{64}$'
				AND cleared_at>=expires_at
				AND octet_length(tombstone_bytes) BETWEEN 1 AND 16384
				AND tombstone_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(tombstone_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			operation TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			authority_digest TEXT,
			lifecycle_claim_receipt_digest TEXT,
			record_digest TEXT NOT NULL,
			result_spool_ref TEXT NOT NULL,
			result_spool_receipt_digest TEXT NOT NULL,
			result_spool_disposition_receipt_digest TEXT NOT NULL,
			business_outcome TEXT NOT NULL,
			completed_at TIMESTAMPTZ NOT NULL,
			record_json JSONB NOT NULL,
			record_bytes BYTEA NOT NULL,
			v46_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,record_digest),
			UNIQUE (namespace_id,registration_request_digest,operation,record_digest),
			FOREIGN KEY (namespace_id,result_spool_ref)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
					namespace_id,spool_ref
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_journal_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND result_spool_disposition_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND operation IN ('create','delete')
				AND business_outcome IN (
					'abandoned-before-provider-effect','already-absent','created-and-uploaded',
					'deleted','partial-create-requires-cleanup'
				)
				AND octet_length(record_bytes) BETWEEN 1 AND 139264
				AND record_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(record_json),'UTF8')
				AND v46_eligible
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			operation TEXT NOT NULL,
			dispatch_intent_set_digest TEXT NOT NULL,
			dispatch_stage_claim_receipt_set_digest TEXT NOT NULL,
			transport_receipt_set_digest TEXT NOT NULL,
			business_result_digest TEXT NOT NULL,
			result_spool_ref TEXT NOT NULL,
			result_spool_receipt_digest TEXT NOT NULL,
			state TEXT NOT NULL,
			current_revision BIGINT NOT NULL,
			latest_reconciliation_observation_digest TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id,registration_request_digest,operation),
			UNIQUE (namespace_id,transport_receipt_set_digest),
			FOREIGN KEY (namespace_id,result_spool_ref)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools(
					namespace_id,spool_ref
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_unfinished_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_intent_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_stage_claim_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND business_result_digest ~ '^sha256-[a-f0-9]{64}$'
				AND result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND operation IN ('create','delete')
				AND state IN ('pending','resolved') AND current_revision>=1
				AND ((state='pending' AND latest_reconciliation_observation_digest IS NULL)
					OR (state='resolved' AND latest_reconciliation_observation_digest
						~ '^sha256-[a-f0-9]{64}$'))
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_unfinished_recovery
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations(
				namespace_id,state,updated_at,registration_request_digest
			)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations (
			namespace_id TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			operation TEXT NOT NULL,
			dispatch_intent_digest TEXT NOT NULL,
			dispatch_stage_claim_receipt_digest TEXT NOT NULL,
			transport_receipt_digest TEXT NOT NULL,
			mutation_kind TEXT NOT NULL,
			mutation_sequence BIGINT NOT NULL,
			request_digest TEXT NOT NULL,
			observation_store_request_digest TEXT NOT NULL,
			observation_projection_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			observation_outcome TEXT NOT NULL,
			resource_id TEXT,
			resource_role TEXT,
			resource_manifest_digest TEXT,
			http_status BIGINT NOT NULL,
			provider_request_id TEXT,
			observation_authority_issuer_id TEXT NOT NULL,
			observation_authority_implementation_digest TEXT NOT NULL,
			owner_ledger_revision BIGINT NOT NULL,
			requested_at TIMESTAMPTZ NOT NULL,
			observed_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			observation_store_request_json JSONB NOT NULL,
			observation_store_request_bytes BYTEA NOT NULL,
			observation_projection_json JSONB NOT NULL,
			observation_projection_bytes BYTEA NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,receipt_digest),
			UNIQUE (namespace_id,request_digest),
			UNIQUE (namespace_id,observation_store_request_digest),
			UNIQUE (namespace_id,observation_projection_digest),
			UNIQUE (namespace_id,transport_receipt_digest),
			UNIQUE (namespace_id,registration_request_digest,operation,mutation_sequence),
			FOREIGN KEY (namespace_id,dispatch_stage_claim_receipt_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,registration_request_digest,operation)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations(
					namespace_id,registration_request_digest,operation
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_reconciliation_check CHECK (
				dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_stage_claim_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND observation_store_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND observation_projection_digest ~ '^sha256-[a-f0-9]{64}$'
				AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND observation_authority_issuer_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND observation_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_ledger_revision>=1
				AND mutation_kind IN (
					'create-primary','delete-resource','upload-content',
					'upload-content-finalize','upload-content-start'
				)
				AND mutation_sequence BETWEEN 0 AND 3
				AND observation_outcome IN (
					'accepted','already-absent','created','deleted','uploaded'
				)
				AND (resource_manifest_digest IS NULL
					OR resource_manifest_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (resource_role IS NULL OR resource_role IN ('auxiliary','primary'))
				AND http_status BETWEEN 100 AND 599 AND observed_at>=requested_at
				AND octet_length(request_bytes) BETWEEN 1 AND 65536
				AND request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
				AND octet_length(observation_store_request_bytes) BETWEEN 1 AND 131072
				AND observation_store_request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(observation_store_request_json),'UTF8')
				AND octet_length(observation_projection_bytes) BETWEEN 1 AND 65536
				AND observation_projection_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(observation_projection_json),'UTF8')
				AND octet_length(receipt_bytes) BETWEEN 1 AND 65536
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_journal_archives (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			operation TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			journal_record_digest TEXT NOT NULL,
			budget_closure_projection_digest TEXT NOT NULL,
			archive_record_digest TEXT NOT NULL,
			record_json JSONB NOT NULL,
			record_bytes BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			v46_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,archive_record_digest),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
				operation,registration_request_digest,journal_record_digest
			),
			FOREIGN KEY (namespace_id,journal_record_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals(
					namespace_id,record_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_archive_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND budget_closure_projection_digest ~ '^sha256-[a-f0-9]{64}$'
				AND archive_record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND operation IN ('create','delete')
				AND octet_length(record_bytes) BETWEEN 1 AND 155648
				AND record_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(record_json),'UTF8')
				AND v46_eligible
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_archive_order
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_journal_archives(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
				operation,registration_request_digest,archive_record_digest
			)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_lifecycle_archive_page
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_journal_archives(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
				archive_record_digest
			) WHERE v46_eligible`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_journal_archive_roots (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			family_digest TEXT NOT NULL,
			closure_status TEXT NOT NULL,
			record_count BIGINT NOT NULL,
			creation_record_set_digest TEXT NOT NULL,
			cleanup_record_set_digest TEXT NOT NULL,
			family_json JSONB NOT NULL,
			family_bytes BYTEA NOT NULL,
			sealed_at TIMESTAMPTZ NOT NULL,
			v46_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,runtime_resource_set_id),
			UNIQUE (namespace_id,family_digest),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id
			) REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_sets(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_archive_root_check CHECK (
				family_digest ~ '^sha256-[a-f0-9]{64}$'
				AND creation_record_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND cleanup_record_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND closure_status='zeroed'
				AND record_count BETWEEN 8 AND 88
				AND octet_length(family_bytes) BETWEEN 1 AND 13697024
				AND family_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(family_json),'UTF8')
				AND v46_eligible
			)
		)`,
	}
}
