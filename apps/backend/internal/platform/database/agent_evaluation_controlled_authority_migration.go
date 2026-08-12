package database

// agentEvaluationControlledAuthorityMigration adds the server-only durable
// dispatch journal shared by the controlled Workspace, Verification Evidence,
// provider-capability, and attempt-grading bridges. Request bodies are deliberately excluded: protected
// holdout material, upload capabilities, attestation nonces, and secret
// canaries remain callback-bound. The journal retains only exact canonical
// commitments and bounded, explicitly persistable acknowledgements.
func agentEvaluationControlledAuthorityMigration() migration {
	return migration{
		version: 41,
		name:    "g4-agent-evaluation-controlled-authority-journal",
		statements: []string{
			// Migration v35 predates the shared finalized-partition trigger's
			// plan_digest column convention. Keep its external column name while
			// installing an exact trigger that resolves evaluation_plan_digest.
			`CREATE OR REPLACE FUNCTION reject_agent_evaluation_verification_grant_finalized_mutation()
				RETURNS TRIGGER AS $$
			DECLARE
				evaluation_namespace_id TEXT;
				evaluation_plan_digest_value TEXT;
			BEGIN
				IF TG_OP = 'DELETE' THEN
					evaluation_namespace_id := OLD.namespace_id;
					evaluation_plan_digest_value := OLD.evaluation_plan_digest;
				ELSE
					evaluation_namespace_id := NEW.namespace_id;
					evaluation_plan_digest_value := NEW.evaluation_plan_digest;
				END IF;
				PERFORM 1 FROM agent_evaluation_plans
					WHERE namespace_id = evaluation_namespace_id
						AND plan_digest = evaluation_plan_digest_value FOR SHARE;
				IF EXISTS (
					SELECT 1 FROM agent_evaluation_finalizations
					WHERE namespace_id = evaluation_namespace_id
						AND plan_digest = evaluation_plan_digest_value
				) OR EXISTS (
					SELECT 1 FROM agent_evaluation_authority_attestations
					WHERE namespace_id = evaluation_namespace_id
						AND plan_digest = evaluation_plan_digest_value
				) THEN
					RAISE EXCEPTION 'finalized evaluation partition is immutable'
						USING ERRCODE = '23514';
				END IF;
				IF TG_OP = 'DELETE' THEN
					RETURN OLD;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_verification_attempt_grant_receipts_finalized_mutation
				ON agent_evaluation_verification_attempt_grant_receipts`,
			`CREATE TRIGGER agent_evaluation_verification_attempt_grant_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_verification_attempt_grant_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_verification_grant_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_controlled_authority_requests (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				service_kind TEXT NOT NULL,
				operation TEXT NOT NULL,
				route_binding TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				request_binding_digest TEXT NOT NULL,
				owner_implementation_digest TEXT,
				attempt_id TEXT,
				descriptor_digest TEXT,
				grant_digest TEXT,
				generation BIGINT,
				shard_lease_owner_id TEXT,
				shard_lease_generation BIGINT,
				verification_grant_generation BIGINT,
				verification_grant_receipt_set_digest TEXT,
				state TEXT NOT NULL,
				claim_generation BIGINT NOT NULL,
				response_digest TEXT,
				response_bytes BYTEA,
				claimed_at TIMESTAMPTZ NOT NULL,
				dispatched_at TIMESTAMPTZ,
				sealed_at TIMESTAMPTZ,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, service_kind, request_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_controlled_authority_service_check
					CHECK (service_kind IN (
						'controlled-workspace', 'verification-evidence',
						'provider-capability', 'attempt-grading'
					)),
				CONSTRAINT agent_evaluation_controlled_authority_state_check
					CHECK (state IN ('claimed', 'dispatched', 'sealed')),
				CONSTRAINT agent_evaluation_controlled_authority_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_controlled_authority_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_binding_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (owner_implementation_digest IS NULL
						OR owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (descriptor_digest IS NULL OR descriptor_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (grant_digest IS NULL OR grant_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (verification_grant_receipt_set_digest IS NULL
						OR verification_grant_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (response_digest IS NULL OR response_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_evaluation_controlled_authority_generation_check CHECK (
					claim_generation = 1
					AND (generation IS NULL OR generation BETWEEN 1 AND 9007199254740991)
					AND (shard_lease_generation IS NULL OR shard_lease_generation BETWEEN 1 AND 9007199254740991)
					AND (verification_grant_generation IS NULL OR verification_grant_generation BETWEEN 1 AND 9007199254740991)
					AND (
						(service_kind IN ('controlled-workspace', 'verification-evidence')
							AND shard_lease_owner_id IS NULL AND shard_lease_generation IS NULL
							AND verification_grant_generation IS NULL
							AND verification_grant_receipt_set_digest IS NULL)
						OR (service_kind IN ('provider-capability', 'attempt-grading')
							AND generation IS NULL AND owner_implementation_digest IS NOT NULL
							AND shard_lease_owner_id IS NOT NULL
							AND shard_lease_generation IS NOT NULL
							AND verification_grant_generation IS NOT NULL
							AND verification_grant_receipt_set_digest IS NOT NULL)
					)
				),
				CONSTRAINT agent_evaluation_controlled_authority_response_check CHECK (
					(state = 'claimed' AND response_digest IS NULL AND response_bytes IS NULL
						AND dispatched_at IS NULL AND sealed_at IS NULL)
					OR (state = 'dispatched' AND response_digest IS NULL AND response_bytes IS NULL
						AND dispatched_at IS NOT NULL AND sealed_at IS NULL)
					OR (state = 'sealed' AND response_digest IS NOT NULL AND sealed_at IS NOT NULL
						AND dispatched_at IS NOT NULL
						AND (response_bytes IS NULL OR octet_length(response_bytes) BETWEEN 1 AND 33554432))
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_controlled_authority_attempt
				ON agent_evaluation_controlled_authority_requests(
					namespace_id, plan_digest, repository_commit, service_kind,
					attempt_id, generation, operation
				)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_controlled_authority_transition()
				RETURNS trigger AS $$
			BEGIN
				IF TG_OP = 'DELETE' THEN
					RAISE EXCEPTION 'agent evaluation controlled authority rows are append-only';
				END IF;
				IF OLD.namespace_id IS DISTINCT FROM NEW.namespace_id
					OR OLD.plan_digest IS DISTINCT FROM NEW.plan_digest
					OR OLD.repository_commit IS DISTINCT FROM NEW.repository_commit
					OR OLD.service_kind IS DISTINCT FROM NEW.service_kind
					OR OLD.operation IS DISTINCT FROM NEW.operation
					OR OLD.route_binding IS DISTINCT FROM NEW.route_binding
					OR OLD.request_digest IS DISTINCT FROM NEW.request_digest
					OR OLD.request_binding_digest IS DISTINCT FROM NEW.request_binding_digest
					OR OLD.owner_implementation_digest IS DISTINCT FROM NEW.owner_implementation_digest
					OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
					OR OLD.descriptor_digest IS DISTINCT FROM NEW.descriptor_digest
					OR OLD.grant_digest IS DISTINCT FROM NEW.grant_digest
					OR OLD.generation IS DISTINCT FROM NEW.generation
					OR OLD.shard_lease_owner_id IS DISTINCT FROM NEW.shard_lease_owner_id
					OR OLD.shard_lease_generation IS DISTINCT FROM NEW.shard_lease_generation
					OR OLD.verification_grant_generation IS DISTINCT FROM NEW.verification_grant_generation
					OR OLD.verification_grant_receipt_set_digest IS DISTINCT FROM NEW.verification_grant_receipt_set_digest
					OR OLD.claim_generation IS DISTINCT FROM NEW.claim_generation
					OR OLD.claimed_at IS DISTINCT FROM NEW.claimed_at THEN
					RAISE EXCEPTION 'agent evaluation controlled authority binding is immutable';
				END IF;
				IF OLD.state = 'claimed' AND NEW.state = 'dispatched' THEN
					IF NEW.dispatched_at IS NULL OR NEW.response_digest IS NOT NULL
						OR NEW.response_bytes IS NOT NULL OR NEW.sealed_at IS NOT NULL THEN
						RAISE EXCEPTION 'agent evaluation controlled authority dispatch transition is invalid';
					END IF;
					RETURN NEW;
				END IF;
				IF OLD.state <> 'dispatched' OR NEW.state <> 'sealed'
					OR OLD.dispatched_at IS DISTINCT FROM NEW.dispatched_at
					OR NEW.response_digest IS NULL OR NEW.sealed_at IS NULL THEN
					RAISE EXCEPTION 'agent evaluation controlled authority transition is invalid';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`DROP TRIGGER IF EXISTS agent_evaluation_controlled_authority_transition
				ON agent_evaluation_controlled_authority_requests`,
			`CREATE TRIGGER agent_evaluation_controlled_authority_transition
				BEFORE UPDATE OR DELETE ON agent_evaluation_controlled_authority_requests
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_controlled_authority_transition()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_verification_sandbox_registrations (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				generation BIGINT NOT NULL,
				workspace_id TEXT NOT NULL,
				workspace_revision BIGINT NOT NULL,
				verification_plan_digest TEXT NOT NULL,
				authority_digest TEXT NOT NULL,
				grant_receipt_set_digest TEXT NOT NULL,
				idempotency_key_digest TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				registration_id TEXT NOT NULL,
				registration_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				response_bytes BYTEA NOT NULL,
				registered_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, attempt_id),
				UNIQUE (namespace_id, plan_digest, repository_commit, authority_digest),
				UNIQUE (namespace_id, registration_id),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_verification_sandbox_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_verification_sandbox_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND verification_plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND grant_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND idempotency_key_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND registration_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_verification_sandbox_bounds_check CHECK (
					generation BETWEEN 1 AND 9007199254740991
					AND workspace_revision BETWEEN 1 AND 9007199254740991
					AND octet_length(response_bytes) BETWEEN 1 AND 65536
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_verification_sandbox_immutable_mutation
				ON agent_evaluation_verification_sandbox_registrations`,
			`CREATE TRIGGER agent_evaluation_verification_sandbox_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_verification_sandbox_registrations
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
