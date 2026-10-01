package database

func agentTaskOutputMigration() migration {
	return migration{version: 53, name: "agent-runtime-task-output", statements: []string{
		`CREATE TABLE agent_task_outputs (
		workspace_id TEXT NOT NULL,
		run_id TEXT NOT NULL,
		task_id TEXT NOT NULL,
		output_id TEXT NOT NULL,
		generation BIGINT NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
		model_invocation_id TEXT NOT NULL,
		output_digest TEXT NOT NULL CHECK(output_digest ~ '^sha256-[a-f0-9]{64}$'),
		output_bytes BYTEA NOT NULL CHECK(octet_length(output_bytes)<=524288),
		recorded_at TIMESTAMPTZ NOT NULL,
		PRIMARY KEY(workspace_id,output_id),
		UNIQUE(workspace_id,run_id,model_invocation_id),
		FOREIGN KEY(workspace_id,run_id) REFERENCES agent_runs(workspace_id,run_id) ON DELETE CASCADE,
		FOREIGN KEY(workspace_id,task_id) REFERENCES agent_tasks(workspace_id,task_id) ON DELETE CASCADE
		)`,
		`CREATE TRIGGER agent_task_outputs_immutable_update BEFORE UPDATE ON agent_task_outputs
		FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}}
}
