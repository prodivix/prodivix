package database

func agentRuntimeVerificationLinkMigration() migration {
	return migration{version: 50, name: "agent-runtime-verification-run-link", statements: []string{
		`CREATE TABLE agent_runtime_verification_runs (
			workspace_id TEXT NOT NULL,
			verification_run_id TEXT NOT NULL,
			agent_run_id TEXT NOT NULL,
			agent_generation BIGINT NOT NULL CHECK (agent_generation BETWEEN 0 AND 9007199254740991),
			mutation_receipt_id TEXT NOT NULL,
			owner_id TEXT NOT NULL,
			workspace_revision BIGINT NOT NULL CHECK (workspace_revision BETWEEN 1 AND 9007199254740991),
			target_revision_digest TEXT NOT NULL CHECK (target_revision_digest ~ '^sha256-[a-f0-9]{64}$'),
			plan_digest TEXT NOT NULL CHECK (plan_digest ~ '^sha256-[a-f0-9]{64}$'),
			surface TEXT NOT NULL CHECK (surface IN ('preview','export','ci')),
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (workspace_id, verification_run_id),
			FOREIGN KEY (workspace_id, agent_run_id) REFERENCES agent_runs(workspace_id, run_id) ON DELETE CASCADE,
			FOREIGN KEY (workspace_id, mutation_receipt_id) REFERENCES agent_workspace_mutation_receipts(workspace_id, receipt_id),
			FOREIGN KEY (workspace_id, verification_run_id) REFERENCES verification_runs(workspace_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
		)`,
		`CREATE INDEX agent_runtime_verification_runs_agent_idx ON agent_runtime_verification_runs(workspace_id, agent_run_id)`,
		`CREATE TRIGGER agent_runtime_verification_runs_immutable_update BEFORE UPDATE ON agent_runtime_verification_runs
		FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TABLE agent_runtime_cancellations (
			workspace_id TEXT NOT NULL,
			run_id TEXT NOT NULL,
			generation BIGINT NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
			command_id TEXT NOT NULL,
			event_id TEXT NOT NULL,
			event_digest TEXT NOT NULL CHECK (event_digest ~ '^sha256-[a-f0-9]{64}$'),
			PRIMARY KEY (workspace_id, run_id, generation),
			UNIQUE (workspace_id, command_id),
			FOREIGN KEY (workspace_id, run_id) REFERENCES agent_runs(workspace_id, run_id) ON DELETE CASCADE,
			FOREIGN KEY (workspace_id, command_id) REFERENCES agent_run_user_commands(workspace_id, command_id),
			FOREIGN KEY (workspace_id, run_id, event_id) REFERENCES agent_run_events(workspace_id, run_id, event_id) DEFERRABLE INITIALLY DEFERRED
		)`,
		`CREATE TRIGGER agent_runtime_cancellations_immutable_update BEFORE UPDATE ON agent_runtime_cancellations
		FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}}
}
