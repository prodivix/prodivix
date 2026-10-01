package database

func agentRuntimeAdmissionMigration() migration {
	return migration{version: 51, name: "agent-runtime-task-admission", statements: []string{
		`CREATE TABLE agent_runtime_admissions (
		workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
		admission_id TEXT NOT NULL,
		actor_id TEXT NOT NULL,
		project_id TEXT NOT NULL,
		task_id TEXT NOT NULL,
		idempotency_key TEXT NOT NULL,
		challenge_digest TEXT NOT NULL CHECK (challenge_digest ~ '^sha256-[a-f0-9]{64}$'),
		actor_authorization_digest TEXT NOT NULL CHECK (actor_authorization_digest ~ '^sha256-[a-f0-9]{64}$'),
		task_bytes BYTEA NOT NULL CHECK (octet_length(task_bytes) <= 8388608),
		observed_at TIMESTAMPTZ NOT NULL,
		expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > observed_at),
		status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','admitted','blocked')),
		result_bytes BYTEA CHECK (octet_length(result_bytes) <= 8388608),
		PRIMARY KEY(workspace_id, admission_id),
		UNIQUE(admission_id),
		UNIQUE(workspace_id, actor_id, idempotency_key),
		UNIQUE(workspace_id, task_id),
		CHECK ((status = 'pending') = (result_bytes IS NULL))
		)`,
		`CREATE INDEX agent_runtime_admissions_pending_idx ON agent_runtime_admissions(observed_at) WHERE status = 'pending'`,
	}}
}
