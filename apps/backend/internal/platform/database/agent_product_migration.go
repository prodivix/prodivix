package database

func agentProductMigration() migration {
	return migration{
		version: 26,
		name:    "g4-agent-product-ledger",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_product_supplements (
				workspace_id TEXT NOT NULL,
				supplement_id TEXT NOT NULL,
				task_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				generation BIGINT NOT NULL,
				run_snapshot_digest TEXT NOT NULL,
				proposal_id TEXT,
				preview_id TEXT,
				producer_id TEXT NOT NULL,
				supplement_digest TEXT NOT NULL,
				supplement_json JSONB NOT NULL,
				supplement_bytes BYTEA NOT NULL,
				projected_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, supplement_id),
				UNIQUE (workspace_id, run_id, run_snapshot_digest),
				UNIQUE (workspace_id, supplement_digest),
				FOREIGN KEY (workspace_id, task_id)
					REFERENCES agent_tasks(workspace_id, task_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, proposal_id)
					REFERENCES agent_proposals(workspace_id, proposal_id) ON DELETE RESTRICT,
				CONSTRAINT agent_product_supplements_generation_check CHECK (generation >= 0),
				CONSTRAINT agent_product_supplements_review_check CHECK ((proposal_id IS NULL) = (preview_id IS NULL)),
				CONSTRAINT agent_product_supplements_digest_check CHECK (
					run_snapshot_digest ~ '^sha256-[a-f0-9]{64}$'
					AND supplement_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_product_supplements_bytes_check CHECK (octet_length(supplement_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_product_supplements_run
				ON agent_product_supplements(workspace_id, run_id, generation DESC, projected_at DESC)`,
			`DROP TRIGGER IF EXISTS agent_product_supplements_immutable_mutation ON agent_product_supplements`,
			`CREATE TRIGGER agent_product_supplements_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_product_supplements
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_run_user_commands (
				workspace_id TEXT NOT NULL,
				command_id TEXT NOT NULL,
				task_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				kind TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				expected_generation BIGINT NOT NULL,
				expected_snapshot_digest TEXT NOT NULL,
				idempotency_key TEXT NOT NULL,
				command_digest TEXT NOT NULL,
				command_json JSONB NOT NULL,
				command_bytes BYTEA NOT NULL,
				requested_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, command_id),
				UNIQUE (workspace_id, actor_id, idempotency_key),
				UNIQUE (workspace_id, run_id, kind, expected_generation, expected_snapshot_digest),
				UNIQUE (workspace_id, command_digest),
				FOREIGN KEY (workspace_id, task_id)
					REFERENCES agent_tasks(workspace_id, task_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				CONSTRAINT agent_run_user_commands_kind_check CHECK (kind IN ('cancel', 'recover')),
				CONSTRAINT agent_run_user_commands_generation_check CHECK (expected_generation >= 0),
				CONSTRAINT agent_run_user_commands_digest_check CHECK (
					expected_snapshot_digest ~ '^sha256-[a-f0-9]{64}$'
					AND command_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_run_user_commands_bytes_check CHECK (octet_length(command_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_run_user_commands_run
				ON agent_run_user_commands(workspace_id, run_id, requested_at ASC, command_id ASC)`,
			`DROP TRIGGER IF EXISTS agent_run_user_commands_immutable_mutation ON agent_run_user_commands`,
			`CREATE TRIGGER agent_run_user_commands_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_run_user_commands
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
