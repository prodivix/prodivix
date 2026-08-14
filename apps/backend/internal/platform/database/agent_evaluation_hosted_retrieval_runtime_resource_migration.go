package database

// agentEvaluationHostedRetrievalRuntimeResourceStatements installs the
// independent durable owner for the exact four hosted-retrieval runtime
// resources. Registration history remains immutable after cleanup; only the
// current lifecycle row participates in read-lease and cleanup CAS updates.
func agentEvaluationHostedRetrievalRuntimeResourceStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS ae_hrrr_registration_requests (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			frozen_run_digest TEXT NOT NULL,
			run_config_artifact_binding_digest TEXT NOT NULL,
			registration_intent_digest TEXT NOT NULL,
			protocol_family TEXT NOT NULL,
			capability_profile_id TEXT NOT NULL,
			provider_configuration_id TEXT NOT NULL,
			provider_configuration_digest TEXT NOT NULL,
			minimum_expires_at TIMESTAMPTZ NOT NULL,
			staged_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,request_digest),
			UNIQUE (namespace_id,request_digest),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,protocol_family,capability_profile_id
			),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,run_config_artifact_binding_digest
			) REFERENCES agent_evaluation_production_run_config_artifacts(
				namespace_id,plan_digest,repository_commit,binding_digest
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_registration_stage_identity_check CHECK (
				protocol_family IN ('gemini-interactions','openai-responses')
				AND capability_profile_id IN (
					'g4-provider-hosted-retrieval-core','g4-provider-hosted-retrieval-document'
				)
				AND v45_eligible
			),
			CONSTRAINT agent_eval_hosted_runtime_registration_stage_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 16384
				AND request_bytes=convert_to(agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
			)
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_registration_stage_budget
			ON ae_hrrr_registration_requests(
				namespace_id,plan_digest,repository_commit,
				(request_json#>>'{budgetReservationAuthority,reservationId}')
			)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_registration_results (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			registration_result_digest TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			frozen_run_digest TEXT NOT NULL,
			run_config_artifact_binding_digest TEXT NOT NULL,
			registration_intent_digest TEXT NOT NULL,
			protocol_family TEXT NOT NULL,
			capability_profile_id TEXT NOT NULL,
			provider_configuration_id TEXT NOT NULL,
			provider_configuration_digest TEXT NOT NULL,
			budget_reservation_id TEXT NOT NULL,
			budget_reservation_authority_digest TEXT NOT NULL,
			network_policy_authority_digest TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			provider_resource_kind TEXT NOT NULL,
			provider_resource_id TEXT NOT NULL,
			resource_manifest_digest TEXT NOT NULL,
			deletion_authority_receipt_digest TEXT NOT NULL,
			registered_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			registration_request_json JSONB NOT NULL,
			registration_request_bytes BYTEA NOT NULL,
			registration_result_json JSONB NOT NULL,
			registration_result_bytes BYTEA NOT NULL,
			authority_json JSONB NOT NULL,
			authority_bytes BYTEA NOT NULL,
			deletion_authority_receipt_json JSONB NOT NULL,
			deletion_authority_receipt_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,registration_request_digest
			),
			UNIQUE (namespace_id,registration_result_digest),
			UNIQUE (namespace_id,authority_digest),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,protocol_family,capability_profile_id
			),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,budget_reservation_id
			),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,registration_request_digest
			) REFERENCES ae_hrrr_registration_requests(
				namespace_id,plan_digest,repository_commit,request_digest
			) ON DELETE RESTRICT,
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,run_config_artifact_binding_digest
			) REFERENCES agent_evaluation_production_run_config_artifacts(
				namespace_id,plan_digest,repository_commit,binding_digest
			) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,plan_digest,budget_reservation_id)
				REFERENCES agent_evaluation_budget_reservations(
					namespace_id,plan_digest,reservation_id
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_registration_identity_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND protocol_family IN ('gemini-interactions','openai-responses')
				AND capability_profile_id IN (
					'g4-provider-hosted-retrieval-core',
					'g4-provider-hosted-retrieval-document'
				)
				AND provider_resource_kind=CASE protocol_family
					WHEN 'gemini-interactions' THEN 'gemini-file-search-store-name'
					ELSE 'openai-vector-store-id' END
				AND v45_eligible
			),
			CONSTRAINT agent_eval_hosted_runtime_registration_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND registration_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND registration_result_digest ~ '^sha256-[a-f0-9]{64}$'
				AND frozen_run_digest ~ '^sha256-[a-f0-9]{64}$'
				AND run_config_artifact_binding_digest ~ '^sha256-[a-f0-9]{64}$'
				AND registration_intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND provider_configuration_digest ~ '^sha256-[a-f0-9]{64}$'
				AND budget_reservation_authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND network_policy_authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND resource_manifest_digest ~ '^sha256-[a-f0-9]{64}$'
				AND deletion_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
			),
			CONSTRAINT agent_eval_hosted_runtime_registration_time_check CHECK (
				expires_at>registered_at
				AND expires_at<=registered_at+INTERVAL '8 days'
			),
			CONSTRAINT agent_eval_hosted_runtime_registration_bytes_check CHECK (
				octet_length(registration_request_bytes) BETWEEN 1 AND 16384
				AND octet_length(registration_result_bytes) BETWEEN 1 AND 32768
				AND octet_length(authority_bytes) BETWEEN 1 AND 16384
				AND octet_length(deletion_authority_receipt_bytes) BETWEEN 1 AND 16384
				AND registration_request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(registration_request_json),'UTF8')
				AND registration_result_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(registration_result_json),'UTF8')
				AND authority_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(authority_json),'UTF8')
				AND deletion_authority_receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(deletion_authority_receipt_json),'UTF8')
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_registration_set
			ON ae_hrrr_registration_results(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
				protocol_family,capability_profile_id
			)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_sets (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			frozen_run_digest TEXT NOT NULL,
			run_config_artifact_binding_digest TEXT NOT NULL,
			authority_set_digest TEXT NOT NULL,
			resource_set_commitment_digest TEXT NOT NULL,
			authority_set_json JSONB NOT NULL,
			authority_set_bytes BYTEA NOT NULL,
			resource_set_commitment_json JSONB NOT NULL,
			resource_set_commitment_bytes BYTEA NOT NULL,
			sealed_at TIMESTAMPTZ NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,runtime_resource_set_id),
			UNIQUE (namespace_id,authority_set_digest),
			UNIQUE (namespace_id,resource_set_commitment_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_set_digest_check CHECK (
				authority_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND resource_set_commitment_digest ~ '^sha256-[a-f0-9]{64}$'
				AND frozen_run_digest ~ '^sha256-[a-f0-9]{64}$'
				AND run_config_artifact_binding_digest ~ '^sha256-[a-f0-9]{64}$'
				AND v45_eligible
			),
			CONSTRAINT agent_eval_hosted_runtime_set_bytes_check CHECK (
				octet_length(authority_set_bytes) BETWEEN 1 AND 16384
				AND octet_length(resource_set_commitment_bytes) BETWEEN 1 AND 16384
				AND authority_set_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(authority_set_json),'UTF8')
				AND resource_set_commitment_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(resource_set_commitment_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resources (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			resource_set_commitment_digest TEXT NOT NULL,
			provider_resource_kind TEXT NOT NULL,
			provider_resource_id TEXT NOT NULL,
			resource_expires_at TIMESTAMPTZ NOT NULL,
			active_owner_instance_id TEXT NOT NULL,
			claim_generation BIGINT NOT NULL,
			lifecycle TEXT NOT NULL,
			read_lease_not_after TIMESTAMPTZ,
			stored_active_state_digest TEXT NOT NULL,
			stored_active_state_json JSONB NOT NULL,
			stored_active_state_bytes BYTEA NOT NULL,
			stored_active_owner_instance_id TEXT NOT NULL,
			stored_active_claim_generation BIGINT NOT NULL,
			stored_active_read_lease_not_after TIMESTAMPTZ,
			stored_active_updated_at TIMESTAMPTZ NOT NULL,
			current_state_digest TEXT NOT NULL,
			current_state_json JSONB NOT NULL,
			current_state_bytes BYTEA NOT NULL,
			current_state_updated_at TIMESTAMPTZ NOT NULL,
			current_cleanup_claim_receipt_digest TEXT,
			cleanup_request_digest TEXT,
			cleanup_receipt_digest TEXT,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,authority_digest),
			UNIQUE (namespace_id,provider_resource_id),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,registration_request_digest
			) REFERENCES ae_hrrr_registration_results(
				namespace_id,plan_digest,repository_commit,registration_request_digest
			) ON DELETE RESTRICT,
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id
			) REFERENCES ae_hrrr_sets(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_resource_lifecycle_check CHECK (
				claim_generation>=1 AND stored_active_claim_generation>=1
				AND lifecycle IN ('active','cleanup-in-progress','cleaned')
				AND stored_active_state_digest ~ '^sha256-[a-f0-9]{64}$'
				AND current_state_digest ~ '^sha256-[a-f0-9]{64}$'
				AND ((lifecycle='active' AND current_cleanup_claim_receipt_digest IS NULL
					AND cleanup_request_digest IS NULL
					AND cleanup_receipt_digest IS NULL
					AND current_state_json->>'stateDigest'=current_state_digest
					AND current_state_json->>'activeOwnerInstanceId'=active_owner_instance_id
					AND (current_state_json->>'claimGeneration')::bigint=claim_generation
					AND (current_state_json->>'readLeaseNotAfter')::timestamptz
						IS NOT DISTINCT FROM read_lease_not_after
					AND (current_state_json->>'updatedAt')::timestamptz=current_state_updated_at)
					OR (lifecycle='cleanup-in-progress'
						AND current_cleanup_claim_receipt_digest IS NOT NULL
						AND cleanup_request_digest IS NOT NULL
						AND cleanup_receipt_digest IS NULL)
					OR (lifecycle='cleaned' AND current_cleanup_claim_receipt_digest IS NOT NULL
						AND cleanup_request_digest IS NOT NULL
						AND cleanup_receipt_digest IS NOT NULL))
				AND (current_cleanup_claim_receipt_digest IS NULL OR
					current_cleanup_claim_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (cleanup_request_digest IS NULL OR
					cleanup_request_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (cleanup_receipt_digest IS NULL OR
					cleanup_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND v45_eligible
			),
			CONSTRAINT agent_eval_hosted_runtime_resource_active_bytes_check CHECK (
				octet_length(stored_active_state_bytes) BETWEEN 1 AND 16384
				AND octet_length(current_state_bytes) BETWEEN 1 AND 16384
				AND stored_active_state_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(stored_active_state_json),'UTF8')
				AND current_state_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(current_state_json),'UTF8')
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_resources_recovery
			ON agent_evaluation_hosted_retrieval_runtime_resources(
				namespace_id,lifecycle,resource_expires_at,authority_digest
			)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_read_receipts (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			ledger_revision BIGINT NOT NULL,
			request_digest TEXT NOT NULL,
			receipt_digest TEXT NOT NULL,
			read_lease_id TEXT NOT NULL,
			reader_owner_instance_id TEXT NOT NULL,
			active_owner_instance_id TEXT NOT NULL,
			claim_generation BIGINT NOT NULL,
			active_state_digest TEXT NOT NULL,
			checked_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,authority_digest,ledger_revision),
			UNIQUE (namespace_id,request_digest),
			UNIQUE (namespace_id,receipt_digest),
			UNIQUE (namespace_id,read_lease_id),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,authority_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resources(
					namespace_id,plan_digest,repository_commit,authority_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_read_revision_check CHECK (
				ledger_revision BETWEEN 1 AND 14040 AND claim_generation>=1
			),
			CONSTRAINT agent_eval_hosted_runtime_read_time_check CHECK (
				expires_at>checked_at
				AND expires_at<=checked_at+INTERVAL '180 seconds'
			),
			CONSTRAINT agent_eval_hosted_runtime_read_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 16384
				AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
				AND request_bytes=convert_to(agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
				AND receipt_bytes=convert_to(agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_read_lease_ledger_roots (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			ledger_revision BIGINT NOT NULL,
			root_digest TEXT NOT NULL,
			resource_set_commitment_digest TEXT NOT NULL,
			read_lease_count BIGINT NOT NULL,
			minimum_claim_generation BIGINT,
			maximum_claim_generation BIGINT,
			first_checked_at TIMESTAMPTZ,
			last_expires_at TIMESTAMPTZ,
			sealed_at TIMESTAMPTZ NOT NULL,
			root_json JSONB NOT NULL,
			root_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,authority_digest,ledger_revision),
			UNIQUE (namespace_id,root_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit,authority_digest)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resources(
					namespace_id,plan_digest,repository_commit,authority_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_read_root_count_check CHECK (
				ledger_revision>=1 AND read_lease_count BETWEEN 0 AND 14040
				AND ((read_lease_count=0 AND minimum_claim_generation IS NULL
					AND maximum_claim_generation IS NULL AND first_checked_at IS NULL
					AND last_expires_at IS NULL)
					OR (read_lease_count>0 AND minimum_claim_generation>=1
						AND maximum_claim_generation>=minimum_claim_generation
						AND first_checked_at IS NOT NULL AND last_expires_at>first_checked_at))
			),
			CONSTRAINT agent_eval_hosted_runtime_read_root_bytes_check CHECK (
				octet_length(root_bytes) BETWEEN 1 AND 16384
				AND root_bytes=convert_to(agent_evaluation_canonical_jsonb_text(root_json),'UTF8')
			)
		)`,
	}
}
