package database

func agentEvaluationHostedRetrievalRuntimeResourceCleanupStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS ae_hrrr_overdue_receipts (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			resource_expires_at TIMESTAMPTZ NOT NULL,
			detected_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,authority_digest),
			UNIQUE (namespace_id,receipt_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,authority_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resources(
					namespace_id,plan_digest,repository_commit,authority_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_overdue_time_check CHECK (
				detected_at>resource_expires_at
			),
			CONSTRAINT agent_eval_hosted_runtime_overdue_bytes_check CHECK (
				octet_length(receipt_bytes) BETWEEN 1 AND 16384
				AND receipt_bytes=convert_to(agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_run_terminal_fences (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			fence_digest TEXT NOT NULL,
			fence_id TEXT NOT NULL,
			fence_authority_issuer_id TEXT NOT NULL,
			fence_authority_implementation_digest TEXT NOT NULL,
			fence_ledger_revision BIGINT NOT NULL,
			expected_shard_count BIGINT NOT NULL,
			terminal_shard_count BIGINT NOT NULL,
			terminal_shard_id_set_digest TEXT NOT NULL,
			terminal_attempt_id_set_digest TEXT NOT NULL,
			terminal_shard_lease_generation_set_digest TEXT NOT NULL,
			terminal_shard_result_set_digest TEXT NOT NULL,
			terminal_outcome TEXT NOT NULL,
			all_shards_terminal_at TIMESTAMPTZ NOT NULL,
			sealed_at TIMESTAMPTZ NOT NULL,
			expected_shard_ids_json JSONB NOT NULL,
			expected_shard_ids_bytes BYTEA NOT NULL,
			terminal_shard_records_json JSONB NOT NULL,
			terminal_shard_records_bytes BYTEA NOT NULL,
			fence_json JSONB NOT NULL,
			fence_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,runtime_resource_set_id),
			UNIQUE (namespace_id,fence_digest),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id
			) REFERENCES ae_hrrr_sets(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_fence_count_check CHECK (
				fence_ledger_revision>=1
				AND expected_shard_count BETWEEN 1 AND 1024
				AND terminal_shard_count=expected_shard_count
				AND terminal_outcome IN ('cancelled','completed','failed')
				AND sealed_at>=all_shards_terminal_at
				AND v45_eligible
			),
			CONSTRAINT agent_eval_hosted_runtime_fence_bytes_check CHECK (
				octet_length(expected_shard_ids_bytes) BETWEEN 1 AND 1048576
				AND octet_length(terminal_shard_records_bytes) BETWEEN 1 AND 16777216
				AND octet_length(fence_bytes) BETWEEN 1 AND 16384
				AND expected_shard_ids_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(expected_shard_ids_json),'UTF8')
				AND terminal_shard_records_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(terminal_shard_records_json),'UTF8')
				AND fence_bytes=convert_to(agent_evaluation_canonical_jsonb_text(fence_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_cleanup_claims (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			claim_id TEXT NOT NULL,
			claim_authority_issuer_id TEXT NOT NULL,
			claim_authority_implementation_digest TEXT NOT NULL,
			claim_ledger_revision BIGINT NOT NULL,
			expected_active_state_digest TEXT NOT NULL,
			cleanup_owner_instance_id TEXT NOT NULL,
			claim_generation BIGINT NOT NULL,
			claimed_state_digest TEXT NOT NULL,
			claimed_at TIMESTAMPTZ NOT NULL,
			claim_expires_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,authority_digest,claim_generation
			),
			UNIQUE (namespace_id,receipt_digest),
			UNIQUE (namespace_id,claim_id),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,authority_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resources(
					namespace_id,plan_digest,repository_commit,authority_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_cleanup_claim_revision_check CHECK (
				claim_ledger_revision>=1 AND claim_generation>=1
				AND claim_expires_at>claimed_at
				AND claim_expires_at<=claimed_at+INTERVAL '15 minutes'
			),
			CONSTRAINT agent_eval_hosted_runtime_cleanup_claim_bytes_check CHECK (
				octet_length(receipt_bytes) BETWEEN 1 AND 16384
				AND receipt_bytes=convert_to(agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_cleanup_requests (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			resource_set_commitment_digest TEXT NOT NULL,
			read_lease_ledger_root_digest TEXT NOT NULL,
			cleanup_claim_authority_receipt_digest TEXT NOT NULL,
			deletion_authority_receipt_digest TEXT NOT NULL,
			cleanup_owner_instance_id TEXT NOT NULL,
			claim_generation BIGINT NOT NULL,
			prior_active_state_digest TEXT NOT NULL,
			run_terminal_fence_digest TEXT NOT NULL,
			cleanup_reason TEXT NOT NULL,
			overdue_receipt_digest TEXT,
			requested_at TIMESTAMPTZ NOT NULL,
			deletion_not_before TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,authority_digest,request_digest
			),
			UNIQUE (namespace_id,request_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,authority_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resources(
					namespace_id,plan_digest,repository_commit,authority_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,cleanup_claim_authority_receipt_digest)
				REFERENCES ae_hrrr_cleanup_claims(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,read_lease_ledger_root_digest)
				REFERENCES ae_hrrr_read_lease_ledger_roots(
					namespace_id,root_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,run_terminal_fence_digest)
				REFERENCES ae_hrrr_run_terminal_fences(
					namespace_id,fence_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,overdue_receipt_digest)
				REFERENCES ae_hrrr_overdue_receipts(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_cleanup_reason_check CHECK (
				cleanup_reason IN ('expired','matrix-terminal','owner-shutdown','startup-reconcile')
				AND claim_generation>=1 AND deletion_not_before>=requested_at
			),
			CONSTRAINT agent_eval_hosted_runtime_cleanup_request_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 24576
				AND request_bytes=convert_to(agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_cleanups (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			cleanup_request_digest TEXT NOT NULL,
			cleanup_receipt_digest TEXT NOT NULL,
			resource_set_commitment_digest TEXT NOT NULL,
			read_lease_ledger_root_digest TEXT NOT NULL,
			cleanup_claim_authority_receipt_digest TEXT NOT NULL,
			deletion_authority_receipt_digest TEXT NOT NULL,
			run_terminal_fence_digest TEXT NOT NULL,
			cleanup_owner_instance_id TEXT NOT NULL,
			claim_generation BIGINT NOT NULL,
			prior_active_state_digest TEXT NOT NULL,
			resource_result_set_digest TEXT NOT NULL,
			terminal_state_digest TEXT NOT NULL,
			completed_at TIMESTAMPTZ NOT NULL,
			cleanup_receipt_json JSONB NOT NULL,
			cleanup_receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,authority_digest),
			UNIQUE (namespace_id,cleanup_receipt_digest),
			UNIQUE (namespace_id,cleanup_request_digest),
			FOREIGN KEY (namespace_id,cleanup_request_digest)
				REFERENCES ae_hrrr_cleanup_requests(
					namespace_id,request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_cleanup_zero_check CHECK (
				claim_generation>=1
				AND octet_length(cleanup_receipt_bytes) BETWEEN 1 AND 32768
				AND cleanup_receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(cleanup_receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_cleanup_archives (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			record_digest TEXT NOT NULL,
			cleanup_receipt_digest TEXT NOT NULL,
			record_json JSONB NOT NULL,
			record_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,authority_digest),
			UNIQUE (namespace_id,record_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,authority_digest)
				REFERENCES ae_hrrr_cleanups(
					namespace_id,plan_digest,repository_commit,authority_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_cleanup_archive_bytes_check CHECK (
				v45_eligible AND octet_length(record_bytes) BETWEEN 1 AND 196608
				AND record_bytes=convert_to(agent_evaluation_canonical_jsonb_text(record_json),'UTF8')
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_cleanup_archive_order
			ON ae_hrrr_cleanup_archives(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,authority_digest
			)`,
		`DO $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint
				WHERE conname='agent_eval_hosted_runtime_resource_current_cleanup_request_fk'
			) THEN
				ALTER TABLE agent_evaluation_hosted_retrieval_runtime_resources
					ADD CONSTRAINT agent_eval_hosted_runtime_resource_current_cleanup_request_fk
					FOREIGN KEY (namespace_id,cleanup_request_digest)
					REFERENCES ae_hrrr_cleanup_requests(
						namespace_id,request_digest
					)
					DEFERRABLE INITIALLY DEFERRED;
			END IF;
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint
				WHERE conname='agent_eval_hosted_runtime_resource_cleanup_receipt_fk'
			) THEN
				ALTER TABLE agent_evaluation_hosted_retrieval_runtime_resources
					ADD CONSTRAINT agent_eval_hosted_runtime_resource_cleanup_receipt_fk
					FOREIGN KEY (namespace_id,cleanup_receipt_digest)
					REFERENCES ae_hrrr_cleanups(
						namespace_id,cleanup_receipt_digest
					)
					DEFERRABLE INITIALLY DEFERRED;
			END IF;
		END;
		$$`,
	}
}
