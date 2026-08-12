package database

// agentEvaluationHostedRetrievalRuntimeResourceDiscoveryRecoveryStatements
// persists registration-set discovery and the recovery scanner/claim/result
// ledgers. Candidate pages are evidence records; constraint triggers rederive
// their eligibility from the canonical registration, resource, lease and run
// terminal ledgers.
func agentEvaluationHostedRetrievalRuntimeResourceDiscoveryRecoveryStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			frozen_run_digest TEXT NOT NULL,
			run_config_artifact_binding_digest TEXT NOT NULL,
			registration_intent_bindings_json JSONB NOT NULL,
			requested_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,request_digest),
			UNIQUE (namespace_id,request_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,run_config_artifact_binding_digest
			) REFERENCES agent_evaluation_production_run_config_artifacts(
				namespace_id,plan_digest,repository_commit,binding_digest
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lookup_request_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 16384
				AND request_bytes=convert_to(agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			lookup_authority_issuer_id TEXT NOT NULL,
			lookup_authority_implementation_digest TEXT NOT NULL,
			lookup_ledger_revision BIGINT NOT NULL,
			checked_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,request_digest),
			UNIQUE (namespace_id,receipt_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,request_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests(
					namespace_id,plan_digest,repository_commit,request_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,runtime_resource_set_id)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_sets(
					namespace_id,plan_digest,repository_commit,runtime_resource_set_id
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lookup_receipt_time_check CHECK (
				lookup_ledger_revision>=1 AND expires_at>checked_at
				AND expires_at<=checked_at+INTERVAL '125 seconds'
			),
			CONSTRAINT agent_eval_hosted_runtime_lookup_receipt_bytes_check CHECK (
				octet_length(receipt_bytes) BETWEEN 1 AND 180224
				AND receipt_bytes=convert_to(agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_requests (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			frozen_run_digest TEXT NOT NULL,
			run_config_artifact_binding_digest TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			resource_set_commitment_digest TEXT NOT NULL,
			expected_shard_count BIGINT NOT NULL,
			expected_shard_id_set_digest TEXT NOT NULL,
			requested_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,request_digest),
			UNIQUE (namespace_id,request_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,runtime_resource_set_id)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_sets(
					namespace_id,plan_digest,repository_commit,runtime_resource_set_id
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_fence_derive_request_check CHECK (
				expected_shard_count BETWEEN 1 AND 1024
				AND octet_length(request_bytes) BETWEEN 1 AND 16384
				AND request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_receipts (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			resource_set_commitment_digest TEXT NOT NULL,
			expected_shard_count BIGINT NOT NULL,
			expected_shard_id_set_digest TEXT NOT NULL,
			run_terminal_fence_digest TEXT NOT NULL,
			checked_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,request_digest),
			UNIQUE (namespace_id,receipt_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,request_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_requests(
					namespace_id,plan_digest,repository_commit,request_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,run_terminal_fence_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences(
					namespace_id,fence_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_fence_derive_receipt_check CHECK (
				expected_shard_count BETWEEN 1 AND 1024
				AND expires_at>checked_at
				AND expires_at<=checked_at+INTERVAL '125 seconds'
				AND octet_length(receipt_bytes) BETWEEN 1 AND 32768
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			resource_set_commitment_digest TEXT NOT NULL,
			terminal_fence_derive_receipt_digest TEXT NOT NULL,
			cleanup_owner_instance_id TEXT NOT NULL,
			claimed_at TIMESTAMPTZ NOT NULL,
			minimum_claim_expires_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,authority_digest),
			UNIQUE (namespace_id,request_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,authority_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resources(
					namespace_id,plan_digest,repository_commit,authority_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,terminal_fence_derive_receipt_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_terminal_fence_derive_receipts(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_post_matrix_claim_request_check CHECK (
				minimum_claim_expires_at>claimed_at
				AND minimum_claim_expires_at<=claimed_at+INTERVAL '15 minutes'
				AND octet_length(request_bytes) BETWEEN 1 AND 49152
				AND request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests (
			namespace_id TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			scan_ledger_revision BIGINT NOT NULL DEFAULT 1,
			page_size BIGINT NOT NULL,
			cursor_digest TEXT,
			cursor_json JSONB NOT NULL,
			requested_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,request_digest),
			CONSTRAINT agent_eval_hosted_runtime_recovery_scan_page_size_check
				CHECK (scan_ledger_revision>=1 AND page_size BETWEEN 1 AND 64),
			CONSTRAINT agent_eval_hosted_runtime_recovery_scan_request_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 16384
				AND request_bytes=convert_to(agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots (
			namespace_id TEXT NOT NULL,
			scan_ledger_revision BIGINT NOT NULL,
			candidate_set_digest TEXT NOT NULL,
			candidates_json JSONB NOT NULL,
			candidates_bytes BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id,scan_ledger_revision),
			UNIQUE (namespace_id,candidate_set_digest,scan_ledger_revision),
			CONSTRAINT agent_eval_hosted_runtime_recovery_snapshot_bytes_check CHECK (
				scan_ledger_revision>=1
				AND octet_length(candidates_bytes) BETWEEN 2 AND 1048576
				AND candidates_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(candidates_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages (
			namespace_id TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			page_digest TEXT NOT NULL,
			recovery_authority_issuer_id TEXT NOT NULL,
			recovery_authority_implementation_digest TEXT NOT NULL,
			scan_ledger_revision BIGINT NOT NULL,
			candidate_set_digest TEXT NOT NULL,
			candidates_json JSONB NOT NULL,
			next_cursor_json JSONB NOT NULL,
			scanned_at TIMESTAMPTZ NOT NULL,
			page_json JSONB NOT NULL,
			page_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,request_digest),
			UNIQUE (namespace_id,page_digest),
			FOREIGN KEY (namespace_id,request_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests(
					namespace_id,request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_recovery_page_revision_check
				CHECK (scan_ledger_revision>=1),
			CONSTRAINT agent_eval_hosted_runtime_recovery_page_bytes_check CHECK (
				octet_length(page_bytes) BETWEEN 1 AND 65536
				AND page_bytes=convert_to(agent_evaluation_canonical_jsonb_text(page_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			recovery_page_digest TEXT NOT NULL,
			candidate_digest TEXT NOT NULL,
			expected_active_state_digest TEXT NOT NULL,
			cleanup_owner_instance_id TEXT NOT NULL,
			claimed_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,authority_digest,request_digest
			),
			UNIQUE (namespace_id,request_digest),
			UNIQUE (namespace_id,recovery_page_digest,candidate_digest),
			FOREIGN KEY (namespace_id,recovery_page_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages(
					namespace_id,page_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_recovery_claim_request_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 16384
				AND request_bytes=convert_to(agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			claim_generation BIGINT NOT NULL,
			request_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			claim_source TEXT NOT NULL,
			claim_source_receipt_digest TEXT NOT NULL,
			candidate_digest TEXT,
			recovery_authority_issuer_id TEXT NOT NULL,
			recovery_authority_implementation_digest TEXT NOT NULL,
			claim_ledger_revision BIGINT NOT NULL,
			expected_active_state_digest TEXT NOT NULL,
			cleanup_claim_authority_receipt_digest TEXT NOT NULL,
			cleanup_request_digest TEXT NOT NULL,
			claimed_state_digest TEXT NOT NULL,
			claim_state_transition_digest TEXT NOT NULL,
			claimed_at TIMESTAMPTZ NOT NULL,
			claim_expires_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,authority_digest,claim_generation
			),
			UNIQUE (namespace_id,request_digest),
			UNIQUE (namespace_id,receipt_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,authority_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resources(
					namespace_id,plan_digest,repository_commit,authority_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,cleanup_claim_authority_receipt_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,cleanup_request_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests(
					namespace_id,request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_cleanup_claim_receipt_source_check CHECK (
				claim_source IN ('post-matrix','recovery')
				AND ((claim_source='post-matrix' AND candidate_digest IS NULL)
					OR (claim_source='recovery' AND candidate_digest IS NOT NULL))
				AND claim_generation>=1 AND claim_ledger_revision>=1
				AND claim_expires_at>claimed_at
				AND claim_expires_at<=claimed_at+INTERVAL '15 minutes'
			),
			CONSTRAINT agent_eval_hosted_runtime_cleanup_claim_receipt_bytes_check CHECK (
				octet_length(receipt_bytes) BETWEEN 1 AND 196608
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`DO $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint
				WHERE conname='agent_eval_hosted_runtime_resource_current_claim_fk'
			) THEN
				ALTER TABLE agent_evaluation_hosted_retrieval_runtime_resources
					ADD CONSTRAINT agent_eval_hosted_runtime_resource_current_claim_fk
					FOREIGN KEY (namespace_id,current_cleanup_claim_receipt_digest)
					REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts(
						namespace_id,receipt_digest
					)
					DEFERRABLE INITIALLY DEFERRED;
			END IF;
		END;
		$$`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests (
			namespace_id TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			cleanup_request_digest TEXT NOT NULL,
			recovery_claim_receipt_digest TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			requested_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,request_digest),
			UNIQUE (
				namespace_id,authority_digest,cleanup_request_digest,
				recovery_claim_receipt_digest,request_digest
			),
			FOREIGN KEY (namespace_id,recovery_claim_receipt_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_result_read_request_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 16384
				AND request_bytes=convert_to(agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts (
			namespace_id TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			status TEXT NOT NULL,
			read_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,request_digest),
			UNIQUE (namespace_id,receipt_digest),
			FOREIGN KEY (namespace_id,request_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests(
					namespace_id,request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_result_read_status_check
				CHECK (status IN ('pending','cleaned')),
			CONSTRAINT agent_eval_hosted_runtime_result_read_receipt_bytes_check CHECK (
				octet_length(receipt_bytes) BETWEEN 1 AND 245760
				AND receipt_bytes=convert_to(agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_recovery_candidate_order
			ON agent_evaluation_hosted_retrieval_runtime_resources(
				namespace_id,current_state_updated_at,authority_digest
			) WHERE lifecycle<>'cleaned'`,
	}
}
