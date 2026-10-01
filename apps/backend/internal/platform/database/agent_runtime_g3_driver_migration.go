package database

func agentRuntimeG3DriverMigration() migration {
	return migration{version: 52, name: "agent-runtime-g3-driver-context", statements: []string{
		`CREATE TABLE agent_runtime_g3_driver_jobs (
		workspace_id TEXT NOT NULL, verification_run_id TEXT NOT NULL,
		agent_run_id TEXT NOT NULL, task_id TEXT NOT NULL,
		request_digest TEXT NOT NULL CHECK(request_digest ~ '^sha256-[a-f0-9]{64}$'),
		plan_digest TEXT NOT NULL CHECK(plan_digest ~ '^sha256-[a-f0-9]{64}$'),
		plan_wire_bytes BYTEA NOT NULL CHECK(octet_length(plan_wire_bytes) BETWEEN 1 AND 67108864),
		provider_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
		cleanup_receipt_bytes BYTEA, cleaned_at TIMESTAMPTZ,
		PRIMARY KEY(workspace_id,verification_run_id),
		FOREIGN KEY(workspace_id,verification_run_id) REFERENCES agent_runtime_verification_runs(workspace_id,verification_run_id) ON DELETE CASCADE,
		CHECK((cleanup_receipt_bytes IS NULL)=(cleaned_at IS NULL)),
		CHECK(cleaned_at IS NULL OR cleaned_at>=created_at)
		)`,
		`CREATE INDEX agent_runtime_g3_driver_jobs_agent_idx ON agent_runtime_g3_driver_jobs(workspace_id,agent_run_id)`,
		`CREATE FUNCTION validate_agent_runtime_g3_driver_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
		IF ROW(NEW.workspace_id,NEW.verification_run_id,NEW.agent_run_id,NEW.task_id,NEW.request_digest,NEW.plan_digest,NEW.plan_wire_bytes,NEW.provider_id,NEW.created_at)
		IS DISTINCT FROM ROW(OLD.workspace_id,OLD.verification_run_id,OLD.agent_run_id,OLD.task_id,OLD.request_digest,OLD.plan_digest,OLD.plan_wire_bytes,OLD.provider_id,OLD.created_at)
		OR (OLD.cleanup_receipt_bytes IS NOT NULL AND ROW(NEW.cleanup_receipt_bytes,NEW.cleaned_at) IS DISTINCT FROM ROW(OLD.cleanup_receipt_bytes,OLD.cleaned_at))
		OR NEW.cleanup_receipt_bytes IS NULL OR NEW.cleaned_at IS NULL THEN RAISE EXCEPTION 'Runtime G3 driver identity and cleanup receipt are immutable'; END IF;
		RETURN NEW; END $$`,
		`CREATE TRIGGER agent_runtime_g3_driver_immutable_identity BEFORE UPDATE ON agent_runtime_g3_driver_jobs FOR EACH ROW EXECUTE FUNCTION validate_agent_runtime_g3_driver_update()`,
	}}
}
