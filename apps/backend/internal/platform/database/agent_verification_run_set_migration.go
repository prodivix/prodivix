package database

func agentVerificationRunSetMigration() migration {
	return migration{
		version: 28,
		name:    "g4-agent-verification-run-set-ledger",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_verification_plan_binding_runs (
				workspace_id TEXT NOT NULL,
				binding_id TEXT NOT NULL,
				verification_run_id TEXT NOT NULL,
				surface TEXT NOT NULL,
				selected_cell_set_digest TEXT NOT NULL,
				PRIMARY KEY (workspace_id, binding_id, verification_run_id),
				UNIQUE (workspace_id, binding_id, surface),
				FOREIGN KEY (workspace_id, binding_id)
					REFERENCES agent_verification_plan_bindings(workspace_id, binding_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, verification_run_id)
					REFERENCES verification_runs(workspace_id, id) ON DELETE RESTRICT,
				CONSTRAINT agent_verification_plan_binding_runs_surface_check
					CHECK (surface IN ('preview', 'export', 'ci')),
				CONSTRAINT agent_verification_plan_binding_runs_digest_check
					CHECK (selected_cell_set_digest ~ '^sha256-[a-f0-9]{64}$')
			)`,
			`DROP TRIGGER IF EXISTS agent_verification_plan_binding_runs_immutable_mutation
				ON agent_verification_plan_binding_runs`,
			`CREATE TRIGGER agent_verification_plan_binding_runs_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_verification_plan_binding_runs
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_verification_closure_runs (
				workspace_id TEXT NOT NULL,
				closure_receipt_id TEXT NOT NULL,
				verification_run_id TEXT NOT NULL,
				surface TEXT NOT NULL,
				selected_cell_set_digest TEXT NOT NULL,
				snapshot_digest TEXT NOT NULL,
				PRIMARY KEY (workspace_id, closure_receipt_id, verification_run_id),
				UNIQUE (workspace_id, closure_receipt_id, surface),
				FOREIGN KEY (workspace_id, closure_receipt_id)
					REFERENCES agent_verification_closure_receipts(workspace_id, receipt_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, verification_run_id)
					REFERENCES verification_runs(workspace_id, id) ON DELETE RESTRICT,
				CONSTRAINT agent_verification_closure_runs_surface_check
					CHECK (surface IN ('preview', 'export', 'ci')),
				CONSTRAINT agent_verification_closure_runs_digest_check CHECK (
					selected_cell_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND snapshot_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_verification_closure_runs_immutable_mutation
				ON agent_verification_closure_runs`,
			`CREATE TRIGGER agent_verification_closure_runs_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_verification_closure_runs
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
