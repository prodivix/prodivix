package database

func agentControlPlaneMigration() migration {
	return migration{
		version: 23,
		name:    "g4-agent-control-plane",
		statements: []string{
			`CREATE OR REPLACE FUNCTION reject_agent_immutable_mutation()
				RETURNS trigger
				LANGUAGE plpgsql
				AS $$
				BEGIN
					RAISE EXCEPTION 'agent immutable row cannot be modified';
				END;
				$$`,
			`CREATE TABLE IF NOT EXISTS agent_tasks (
				workspace_id TEXT NOT NULL,
				task_id TEXT NOT NULL,
				project_id TEXT NOT NULL,
				actor_kind TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				mode TEXT NOT NULL,
				idempotency_key TEXT NOT NULL,
				task_digest TEXT NOT NULL,
				policy_digest TEXT NOT NULL,
				task_json JSONB NOT NULL,
				task_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, task_id),
				UNIQUE (workspace_id, actor_kind, actor_id, idempotency_key),
				CONSTRAINT agent_tasks_actor_kind_check CHECK (actor_kind IN ('user', 'service')),
				CONSTRAINT agent_tasks_mode_check CHECK (mode IN ('explain', 'plan', 'propose', 'apply')),
				CONSTRAINT agent_tasks_digest_check CHECK (
					task_digest ~ '^sha256-[a-f0-9]{64}$'
					AND policy_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_tasks_bytes_check CHECK (octet_length(task_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_tasks_workspace_created
				ON agent_tasks(workspace_id, created_at DESC, task_id DESC)`,
			`DROP TRIGGER IF EXISTS agent_tasks_immutable_mutation ON agent_tasks`,
			`CREATE TRIGGER agent_tasks_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_tasks
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_runs (
				workspace_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				task_id TEXT NOT NULL,
				task_digest TEXT NOT NULL,
				create_idempotency_key TEXT NOT NULL,
				create_request_digest TEXT NOT NULL,
				generation BIGINT NOT NULL,
				attempt BIGINT NOT NULL,
				phase TEXT NOT NULL,
				outcome TEXT,
				cursor BIGINT NOT NULL,
				callback_authority TEXT NOT NULL,
				cleanup_state TEXT NOT NULL,
				budget_revision BIGINT NOT NULL,
				latest_event_digest TEXT,
				snapshot_digest TEXT NOT NULL,
				snapshot_json JSONB NOT NULL,
				snapshot_bytes BYTEA NOT NULL,
				lease_id TEXT,
				lease_holder_id TEXT,
				lease_generation BIGINT,
				lease_expires_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, run_id),
				UNIQUE (workspace_id, task_id, create_idempotency_key),
				FOREIGN KEY (workspace_id, task_id)
					REFERENCES agent_tasks(workspace_id, task_id) ON DELETE RESTRICT,
				CONSTRAINT agent_runs_safe_integer_check CHECK (
					generation BETWEEN 0 AND 9007199254740991
					AND attempt BETWEEN 0 AND 9007199254740991
					AND cursor BETWEEN 0 AND 9007199254740991
					AND budget_revision BETWEEN 0 AND 9007199254740991
					AND (lease_generation IS NULL OR lease_generation BETWEEN 0 AND 9007199254740991)
				),
				CONSTRAINT agent_runs_phase_check CHECK (
					phase IN ('queued', 'preparing', 'running', 'awaiting-approval', 'committing', 'verifying', 'repairing', 'cancelling', 'terminal')
				),
				CONSTRAINT agent_runs_outcome_check CHECK (
					(phase = 'terminal' AND outcome IN ('succeeded', 'failed', 'blocked', 'cancelled', 'budget-exhausted', 'infrastructure-error'))
					OR (phase <> 'terminal' AND outcome IS NULL)
				),
				CONSTRAINT agent_runs_callback_authority_check CHECK (callback_authority IN ('active', 'revoked')),
				CONSTRAINT agent_runs_cleanup_state_check CHECK (cleanup_state IN ('not-required', 'pending', 'clean', 'residual')),
				CONSTRAINT agent_runs_digest_check CHECK (
					task_digest ~ '^sha256-[a-f0-9]{64}$'
					AND create_request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND snapshot_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (latest_event_digest IS NULL OR latest_event_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_runs_lease_tuple_check CHECK (
					(lease_id IS NULL AND lease_holder_id IS NULL AND lease_generation IS NULL AND lease_expires_at IS NULL)
					OR (lease_id IS NOT NULL AND lease_holder_id IS NOT NULL AND lease_generation IS NOT NULL AND lease_expires_at IS NOT NULL)
				),
				CONSTRAINT agent_runs_bytes_check CHECK (octet_length(snapshot_bytes) BETWEEN 1 AND 8388608),
				CONSTRAINT agent_runs_time_check CHECK (updated_at >= created_at)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_runs_claimable
				ON agent_runs(phase, lease_expires_at, updated_at, run_id)
				WHERE phase <> 'terminal'`,
			`CREATE INDEX IF NOT EXISTS idx_agent_runs_task_updated
				ON agent_runs(workspace_id, task_id, updated_at DESC, run_id DESC)`,
			`CREATE TABLE IF NOT EXISTS agent_run_attempts (
				workspace_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				attempt BIGINT NOT NULL,
				recorded_sequence BIGINT NOT NULL,
				attempt_id TEXT NOT NULL,
				generation BIGINT NOT NULL,
				parent_attempt_id TEXT,
				reason TEXT NOT NULL,
				outcome TEXT,
				failure_digest TEXT,
				attempt_digest TEXT NOT NULL,
				attempt_json JSONB NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ,
				PRIMARY KEY (workspace_id, run_id, attempt, recorded_sequence),
				UNIQUE (workspace_id, run_id, attempt_digest),
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				CONSTRAINT agent_run_attempts_number_check CHECK (
					attempt BETWEEN 1 AND 9007199254740991
					AND recorded_sequence BETWEEN 1 AND 9007199254740991
					AND generation BETWEEN 1 AND 9007199254740991
				),
				CONSTRAINT agent_run_attempts_reason_check CHECK (reason IN ('initial', 'retry', 'process-recovery', 'provider-disconnect')),
				CONSTRAINT agent_run_attempts_outcome_check CHECK (
					outcome IS NULL OR outcome IN ('succeeded', 'failed', 'blocked', 'cancelled', 'budget-exhausted', 'infrastructure-error', 'superseded')
				),
				CONSTRAINT agent_run_attempts_digest_check CHECK (
					attempt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (failure_digest IS NULL OR failure_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_run_attempts_lifecycle_check CHECK (
					(completed_at IS NULL AND outcome IS NULL)
					OR (completed_at IS NOT NULL AND outcome IS NOT NULL AND completed_at >= started_at)
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_run_attempts_immutable_mutation ON agent_run_attempts`,
			`CREATE TRIGGER agent_run_attempts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_run_attempts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_run_events (
				workspace_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				sequence BIGINT NOT NULL,
				event_id TEXT NOT NULL,
				generation BIGINT NOT NULL,
				family TEXT NOT NULL,
				type TEXT NOT NULL,
				idempotency_key TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				payload_digest TEXT NOT NULL,
				previous_event_digest TEXT,
				event_digest TEXT NOT NULL,
				event_json JSONB NOT NULL,
				event_bytes BYTEA NOT NULL,
				occurred_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, run_id, sequence),
				UNIQUE (workspace_id, run_id, event_id),
				UNIQUE (workspace_id, run_id, idempotency_key),
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				CONSTRAINT agent_run_events_number_check CHECK (
					sequence BETWEEN 1 AND 9007199254740991
					AND generation BETWEEN 0 AND 9007199254740991
				),
				CONSTRAINT agent_run_events_family_check CHECK (family IN ('run', 'model', 'tool', 'budget', 'security')),
				CONSTRAINT agent_run_events_digest_check CHECK (
					request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND payload_digest ~ '^sha256-[a-f0-9]{64}$'
					AND event_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (previous_event_digest IS NULL OR previous_event_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_run_events_bytes_check CHECK (octet_length(event_bytes) BETWEEN 1 AND 1048576)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_run_events_replay
				ON agent_run_events(workspace_id, run_id, sequence)`,
			`DROP TRIGGER IF EXISTS agent_run_events_immutable_mutation ON agent_run_events`,
			`CREATE TRIGGER agent_run_events_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_run_events
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_run_operations (
				workspace_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				operation_id TEXT NOT NULL,
				kind TEXT NOT NULL,
				idempotency_key TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				generation BIGINT NOT NULL,
				state TEXT NOT NULL,
				callback_authority TEXT NOT NULL,
				dispatch_state TEXT NOT NULL DEFAULT 'ready',
				dispatch_lease_id TEXT,
				dispatch_holder_id TEXT,
				dispatch_lease_expires_at TIMESTAMPTZ,
				result_digest TEXT,
				operation_digest TEXT NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				settled_at TIMESTAMPTZ,
				PRIMARY KEY (workspace_id, run_id, operation_id),
				UNIQUE (workspace_id, run_id, idempotency_key),
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				CONSTRAINT agent_run_operations_kind_check CHECK (kind IN ('model-stream', 'tool-execution', 'awaiting-approval', 'commit-ack', 'verification')),
				CONSTRAINT agent_run_operations_state_check CHECK (state IN ('started', 'reconciliation-required', 'settled', 'cancelled')),
				CONSTRAINT agent_run_operations_callback_check CHECK (callback_authority IN ('active', 'revoked')),
				CONSTRAINT agent_run_operations_dispatch_state_check CHECK (dispatch_state IN ('ready', 'claimed', 'dispatched', 'reconciliation-required', 'settled', 'cancelled')),
				CONSTRAINT agent_run_operations_dispatch_lease_check CHECK (
					(dispatch_state = 'claimed' AND dispatch_lease_id IS NOT NULL AND dispatch_holder_id IS NOT NULL AND dispatch_lease_expires_at IS NOT NULL)
					OR (dispatch_state <> 'claimed' AND dispatch_lease_id IS NULL AND dispatch_holder_id IS NULL AND dispatch_lease_expires_at IS NULL)
				),
				CONSTRAINT agent_run_operations_digest_check CHECK (
					request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND operation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (result_digest IS NULL OR result_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_run_operations_lifecycle_check CHECK (
					(state = 'started' AND callback_authority = 'active' AND settled_at IS NULL)
					OR (state <> 'started' AND callback_authority = 'revoked' AND settled_at IS NOT NULL)
				)
			)`,
			`CREATE TABLE IF NOT EXISTS agent_budget_reservations (
				workspace_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				reservation_id TEXT NOT NULL,
				demand_digest TEXT NOT NULL,
				demand_json JSONB NOT NULL,
				status TEXT NOT NULL,
				settlement_digest TEXT,
				settlement_json JSONB,
				reconciliation_reason TEXT,
				reserved_at TIMESTAMPTZ NOT NULL,
				settled_at TIMESTAMPTZ,
				PRIMARY KEY (workspace_id, run_id, reservation_id),
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				CONSTRAINT agent_budget_reservations_status_check CHECK (status IN ('reserved', 'settled')),
				CONSTRAINT agent_budget_reservations_digest_check CHECK (
					demand_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (settlement_digest IS NULL OR settlement_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_budget_reservations_lifecycle_check CHECK (
					(status = 'reserved' AND settlement_digest IS NULL AND settlement_json IS NULL AND settled_at IS NULL)
					OR (status = 'settled' AND settlement_digest IS NOT NULL AND settlement_json IS NOT NULL AND settled_at IS NOT NULL)
				)
			)`,
		},
	}
}
