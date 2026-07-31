package database

func verificationRunMigration() migration {
	return migration{
		version: 21,
		name:    "verification-run-registry",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS verification_runs (
				workspace_id TEXT NOT NULL,
				id TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				workspace_revision BIGINT NOT NULL,
				plan_digest TEXT NOT NULL,
				surface TEXT NOT NULL,
				scope TEXT NOT NULL,
				provider_id TEXT NOT NULL,
				origin TEXT NOT NULL,
				status TEXT NOT NULL,
				cursor BIGINT NOT NULL,
				snapshot_digest TEXT NOT NULL,
				snapshot_json JSONB NOT NULL,
				snapshot_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, id),
				CONSTRAINT verification_runs_revision_cursor_check CHECK (
					workspace_revision BETWEEN 0 AND 9007199254740991
					AND cursor BETWEEN 0 AND 9007199254740991
				),
				CONSTRAINT verification_runs_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND snapshot_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_runs_surface_check CHECK (
					surface IN ('preview', 'export', 'ci')
				),
				CONSTRAINT verification_runs_scope_check CHECK (
					scope IN ('impacted', 'required', 'all', 'cell')
				),
				CONSTRAINT verification_runs_origin_check CHECK (
					origin IN ('web', 'cli', 'ci')
				),
				CONSTRAINT verification_runs_status_check CHECK (
					status IN (
						'queued', 'running', 'cancelling', 'completed',
						'failed', 'blocked', 'cancelled', 'interrupted'
					)
				),
				CONSTRAINT verification_runs_bytes_check CHECK (
					octet_length(snapshot_bytes) BETWEEN 1 AND 67108864
				),
				CONSTRAINT verification_runs_time_check CHECK (
					updated_at >= created_at
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_runs_workspace_updated
				ON verification_runs(workspace_id, updated_at DESC, id DESC)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_runs_plan
				ON verification_runs(
					workspace_id, workspace_revision, plan_digest, updated_at DESC
				)`,
			`CREATE TABLE IF NOT EXISTS verification_run_events (
				workspace_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				cursor BIGINT NOT NULL,
				event_id TEXT NOT NULL,
				event_digest TEXT NOT NULL,
				kind TEXT NOT NULL,
				event_json JSONB NOT NULL,
				event_bytes BYTEA NOT NULL,
				occurred_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, run_id, cursor),
				UNIQUE (workspace_id, run_id, event_id),
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES verification_runs(workspace_id, id) ON DELETE RESTRICT,
				CONSTRAINT verification_run_events_cursor_check CHECK (
					cursor BETWEEN 1 AND 9007199254740991
				),
				CONSTRAINT verification_run_events_digest_check CHECK (
					event_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_run_events_kind_check CHECK (
					kind IN (
						'run-started', 'cell-started', 'cell-reported',
						'cell-promoted', 'run-cancel-requested',
						'run-interrupted', 'run-completed', 'closure-evaluated'
					)
				),
				CONSTRAINT verification_run_events_bytes_check CHECK (
					octet_length(event_bytes) BETWEEN 1 AND 1048576
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_run_events_replay
				ON verification_run_events(workspace_id, run_id, cursor)`,
			`DROP TRIGGER IF EXISTS verification_run_events_immutable_mutation
				ON verification_run_events`,
			`CREATE TRIGGER verification_run_events_immutable_mutation
				BEFORE UPDATE OR DELETE ON verification_run_events
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
		},
	}
}
