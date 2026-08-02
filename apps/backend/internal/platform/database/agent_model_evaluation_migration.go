package database

func agentModelEvaluationMigration() migration {
	return migration{
		version: 27,
		name:    "g4-agent-model-evaluation-ledger",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_evaluation_plans (
				namespace_id TEXT NOT NULL,
				evaluation_plan_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				planned_journey_count BIGINT NOT NULL,
				plan_json JSONB NOT NULL,
				plan_bytes BYTEA NOT NULL,
				planned_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, evaluation_plan_id),
				CONSTRAINT agent_evaluation_plans_commit_check CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_plans_journey_check CHECK (planned_journey_count >= 11640),
				CONSTRAINT agent_evaluation_plans_digest_check CHECK (plan_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT agent_evaluation_plans_expiry_check CHECK (expires_at > planned_at),
				CONSTRAINT agent_evaluation_plans_bytes_check CHECK (octet_length(plan_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_plans_immutable_mutation ON agent_evaluation_plans`,
			`CREATE TRIGGER agent_evaluation_plans_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_plans
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_budget_ledgers (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				revision BIGINT NOT NULL DEFAULT 0,
				updated_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				FOREIGN KEY (namespace_id, plan_digest)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_budget_ledgers_revision_check CHECK (revision >= 0)
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_attempts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				sampling_identity_digest TEXT NOT NULL,
				independent_run_id TEXT NOT NULL,
				shard_id TEXT NOT NULL,
				case_id TEXT NOT NULL,
				target_id TEXT NOT NULL,
				status TEXT NOT NULL,
				outcome TEXT NOT NULL,
				attempt_digest TEXT NOT NULL,
				attempt_json JSONB NOT NULL,
				attempt_bytes BYTEA NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id),
				UNIQUE (namespace_id, plan_digest, descriptor_digest),
				UNIQUE (namespace_id, plan_digest, sampling_identity_digest),
				UNIQUE (namespace_id, plan_digest, independent_run_id),
				UNIQUE (namespace_id, attempt_digest),
				FOREIGN KEY (namespace_id, plan_digest)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_attempts_status_check CHECK (status IN ('completed', 'provider-error', 'timed-out', 'rate-limited', 'schema-failed', 'blocked', 'cancelled', 'infrastructure-error')),
				CONSTRAINT agent_evaluation_attempts_outcome_check CHECK (outcome IN ('passed', 'failed', 'inconclusive')),
				CONSTRAINT agent_evaluation_attempts_nonterminal_check CHECK (status = 'completed' OR outcome = 'inconclusive'),
				CONSTRAINT agent_evaluation_attempts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND sampling_identity_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attempt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_attempts_bytes_check CHECK (octet_length(attempt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_attempts_shard
				ON agent_evaluation_attempts(namespace_id, plan_digest, shard_id, attempt_id)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_attempts_immutable_mutation ON agent_evaluation_attempts`,
			`CREATE TRIGGER agent_evaluation_attempts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_attempts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_checkpoints (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				shard_id TEXT NOT NULL,
				revision BIGINT NOT NULL,
				lease_owner_id TEXT NOT NULL,
				lease_generation BIGINT NOT NULL,
				state TEXT NOT NULL,
				checkpoint_digest TEXT NOT NULL,
				checkpoint_json JSONB NOT NULL,
				checkpoint_bytes BYTEA NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, shard_id, revision),
				UNIQUE (namespace_id, checkpoint_digest),
				FOREIGN KEY (namespace_id, plan_digest)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_checkpoints_revision_check CHECK (revision >= 0 AND lease_generation >= 0),
				CONSTRAINT agent_evaluation_checkpoints_state_check CHECK (state IN ('running', 'completed', 'incomplete')),
				CONSTRAINT agent_evaluation_checkpoints_digest_check CHECK (checkpoint_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT agent_evaluation_checkpoints_bytes_check CHECK (octet_length(checkpoint_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_checkpoints_latest_revision
				ON agent_evaluation_checkpoints(namespace_id, plan_digest, shard_id, revision DESC)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_checkpoints_immutable_mutation ON agent_evaluation_checkpoints`,
			`CREATE TRIGGER agent_evaluation_checkpoints_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_checkpoints
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_artifacts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				fact_type TEXT NOT NULL,
				fact_id TEXT NOT NULL,
				fact_digest TEXT NOT NULL,
				outcome TEXT,
				fact_json JSONB NOT NULL,
				fact_bytes BYTEA NOT NULL,
				recorded_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, fact_type, fact_id),
				UNIQUE (namespace_id, fact_digest),
				FOREIGN KEY (namespace_id, plan_digest)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_artifacts_type_check CHECK (fact_type IN ('evaluation-metric-report', 'evaluation-grader-report', 'evaluation-human-review-report', 'evaluation-holdout-receipt', 'evaluation-manifest')),
				CONSTRAINT agent_evaluation_artifacts_outcome_check CHECK (outcome IS NULL OR outcome IN ('satisfied', 'unsatisfied', 'incomplete', 'expired')),
				CONSTRAINT agent_evaluation_artifacts_digest_check CHECK (fact_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT agent_evaluation_artifacts_bytes_check CHECK (octet_length(fact_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_artifacts_immutable_mutation ON agent_evaluation_artifacts`,
			`CREATE TRIGGER agent_evaluation_artifacts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_artifacts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_shard_leases (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				shard_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				generation BIGINT NOT NULL,
				lease_digest TEXT NOT NULL,
				acquired_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, shard_id),
				FOREIGN KEY (namespace_id, plan_digest)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_shard_leases_generation_check CHECK (generation >= 1),
				CONSTRAINT agent_evaluation_shard_leases_expiry_check CHECK (expires_at > acquired_at),
				CONSTRAINT agent_evaluation_shard_leases_digest_check CHECK (lease_digest ~ '^sha256-[a-f0-9]{64}$')
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_budget_reservations (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				reservation_id TEXT NOT NULL,
				ledger_revision BIGINT NOT NULL,
				demand_digest TEXT NOT NULL,
				demand_json JSONB NOT NULL,
				demand_bytes BYTEA NOT NULL,
				reserved_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, reservation_id),
				UNIQUE (namespace_id, plan_digest, ledger_revision),
				FOREIGN KEY (namespace_id, plan_digest)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_budget_reservations_revision_check CHECK (ledger_revision >= 0),
				CONSTRAINT agent_evaluation_budget_reservations_digest_check CHECK (demand_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT agent_evaluation_budget_reservations_bytes_check CHECK (octet_length(demand_bytes) BETWEEN 1 AND 1048576)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_budget_reservations_immutable_mutation ON agent_evaluation_budget_reservations`,
			`CREATE TRIGGER agent_evaluation_budget_reservations_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_budget_reservations
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_budget_settlements (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				reservation_id TEXT NOT NULL,
				ledger_revision BIGINT NOT NULL,
				settlement_digest TEXT NOT NULL,
				settlement_json JSONB NOT NULL,
				settlement_bytes BYTEA NOT NULL,
				settled_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, reservation_id),
				UNIQUE (namespace_id, plan_digest, ledger_revision),
				FOREIGN KEY (namespace_id, plan_digest, reservation_id)
					REFERENCES agent_evaluation_budget_reservations(namespace_id, plan_digest, reservation_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_budget_settlements_revision_check CHECK (ledger_revision >= 0),
				CONSTRAINT agent_evaluation_budget_settlements_digest_check CHECK (settlement_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT agent_evaluation_budget_settlements_bytes_check CHECK (octet_length(settlement_bytes) BETWEEN 1 AND 1048576)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_budget_settlements_immutable_mutation ON agent_evaluation_budget_settlements`,
			`CREATE TRIGGER agent_evaluation_budget_settlements_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_budget_settlements
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
