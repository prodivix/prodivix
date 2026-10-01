package database

func agentRuntimeRepairMigration() migration {
	return migration{version: 54, name: "agent-runtime-repair-delegation", statements: []string{
		`CREATE TABLE agent_runtime_repair_failures (
		workspace_id TEXT NOT NULL,parent_run_id TEXT NOT NULL,parent_task_id TEXT NOT NULL,closure_receipt_id TEXT NOT NULL,
		plan_wire_bytes BYTEA NOT NULL CHECK(octet_length(plan_wire_bytes) BETWEEN 1 AND 67108864),
		closure_wire_bytes BYTEA NOT NULL CHECK(octet_length(closure_wire_bytes) BETWEEN 1 AND 67108864),recorded_at TIMESTAMPTZ NOT NULL,
		PRIMARY KEY(workspace_id,parent_run_id),UNIQUE(workspace_id,closure_receipt_id),
		FOREIGN KEY(workspace_id,parent_run_id) REFERENCES agent_runs(workspace_id,run_id) ON DELETE CASCADE,
		FOREIGN KEY(workspace_id,closure_receipt_id) REFERENCES agent_verification_closure_receipts(workspace_id,receipt_id) ON DELETE CASCADE)`,
		`CREATE TABLE agent_runtime_repair_delegations (
		workspace_id TEXT NOT NULL,parent_run_id TEXT NOT NULL,parent_task_id TEXT NOT NULL,child_task_id TEXT NOT NULL,
		request_id TEXT NOT NULL,request_digest TEXT NOT NULL CHECK(request_digest ~ '^sha256-[a-f0-9]{64}$'),
		request_wire_bytes BYTEA NOT NULL CHECK(octet_length(request_wire_bytes) BETWEEN 1 AND 8388608),
		admission_id TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL,
		PRIMARY KEY(workspace_id,parent_run_id),UNIQUE(workspace_id,child_task_id),UNIQUE(workspace_id,request_id),
		FOREIGN KEY(workspace_id,parent_run_id) REFERENCES agent_runtime_repair_failures(workspace_id,parent_run_id) ON DELETE CASCADE,
		FOREIGN KEY(workspace_id,admission_id) REFERENCES agent_runtime_admissions(workspace_id,admission_id) ON DELETE CASCADE)`,
		`CREATE FUNCTION reject_agent_runtime_repair_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Runtime repair failure material and budget delegation are immutable'; END $$`,
		`CREATE TRIGGER agent_runtime_repair_failures_immutable BEFORE UPDATE ON agent_runtime_repair_failures FOR EACH ROW EXECUTE FUNCTION reject_agent_runtime_repair_update()`,
		`CREATE TRIGGER agent_runtime_repair_delegations_immutable BEFORE UPDATE ON agent_runtime_repair_delegations FOR EACH ROW EXECUTE FUNCTION reject_agent_runtime_repair_update()`,
	}}
}
