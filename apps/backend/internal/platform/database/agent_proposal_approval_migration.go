package database

func agentProposalApprovalMigration() migration {
	return migration{
		version: 24,
		name:    "g4-agent-proposal-approval-ledger",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_proposals (
				workspace_id TEXT NOT NULL,
				proposal_id TEXT NOT NULL,
				task_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				proposal_digest TEXT NOT NULL,
				context_pack_digest TEXT NOT NULL,
				base_revision_digest TEXT NOT NULL,
				proposal_json JSONB NOT NULL,
				proposal_bytes BYTEA NOT NULL,
				received_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, proposal_id),
				UNIQUE (workspace_id, run_id, proposal_digest),
				FOREIGN KEY (workspace_id, task_id)
					REFERENCES agent_tasks(workspace_id, task_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				CONSTRAINT agent_proposals_digest_check CHECK (
					proposal_digest ~ '^sha256-[a-f0-9]{64}$'
					AND context_pack_digest ~ '^sha256-[a-f0-9]{64}$'
					AND base_revision_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_proposals_bytes_check CHECK (octet_length(proposal_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_proposals_run_received
				ON agent_proposals(workspace_id, run_id, received_at DESC, proposal_id DESC)`,
			`DROP TRIGGER IF EXISTS agent_proposals_immutable_mutation ON agent_proposals`,
			`CREATE TRIGGER agent_proposals_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_proposals
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_proposal_previews (
				workspace_id TEXT NOT NULL,
				proposal_id TEXT NOT NULL,
				preview_id TEXT NOT NULL,
				planning_digest TEXT NOT NULL,
				preview_digest TEXT NOT NULL,
				proposed_snapshot_digest TEXT NOT NULL,
				transaction_digest TEXT NOT NULL,
				reverse_transaction_digest TEXT NOT NULL,
				semantic_diff_digest TEXT NOT NULL,
				impact_digest TEXT NOT NULL,
				verification_plan_digest TEXT NOT NULL,
				source_trace_digest TEXT NOT NULL,
				planning_json JSONB NOT NULL,
				planning_bytes BYTEA NOT NULL,
				preview_json JSONB NOT NULL,
				preview_bytes BYTEA NOT NULL,
				planned_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, proposal_id),
				UNIQUE (workspace_id, preview_id),
				FOREIGN KEY (workspace_id, proposal_id)
					REFERENCES agent_proposals(workspace_id, proposal_id) ON DELETE RESTRICT,
				CONSTRAINT agent_proposal_previews_digest_check CHECK (
					planning_digest ~ '^sha256-[a-f0-9]{64}$'
					AND preview_digest ~ '^sha256-[a-f0-9]{64}$'
					AND proposed_snapshot_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transaction_digest ~ '^sha256-[a-f0-9]{64}$'
					AND reverse_transaction_digest ~ '^sha256-[a-f0-9]{64}$'
					AND semantic_diff_digest ~ '^sha256-[a-f0-9]{64}$'
					AND impact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND verification_plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_trace_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_proposal_previews_lifetime_check CHECK (expires_at > planned_at),
				CONSTRAINT agent_proposal_previews_bytes_check CHECK (
					octet_length(planning_bytes) BETWEEN 1 AND 8388608
					AND octet_length(preview_bytes) BETWEEN 1 AND 8388608
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_proposal_previews_expiry
				ON agent_proposal_previews(expires_at, workspace_id, proposal_id)`,
			`DROP TRIGGER IF EXISTS agent_proposal_previews_immutable_mutation ON agent_proposal_previews`,
			`CREATE TRIGGER agent_proposal_previews_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_proposal_previews
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_approval_decisions (
				workspace_id TEXT NOT NULL,
				decision_id TEXT NOT NULL,
				proposal_id TEXT NOT NULL,
				preview_id TEXT NOT NULL,
				task_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				decision TEXT NOT NULL,
				actor_kind TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				grant_id TEXT NOT NULL,
				policy_digest TEXT NOT NULL,
				rollback_authorization TEXT NOT NULL,
				decision_digest TEXT NOT NULL,
				approval_json JSONB NOT NULL,
				approval_bytes BYTEA NOT NULL,
				decided_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, decision_id),
				UNIQUE (workspace_id, preview_id),
				FOREIGN KEY (workspace_id, proposal_id)
					REFERENCES agent_proposals(workspace_id, proposal_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, preview_id)
					REFERENCES agent_proposal_previews(workspace_id, preview_id) ON DELETE RESTRICT,
				CONSTRAINT agent_approval_decisions_decision_check CHECK (decision IN ('approved', 'rejected')),
				CONSTRAINT agent_approval_decisions_actor_check CHECK (actor_kind = 'user'),
				CONSTRAINT agent_approval_decisions_rollback_check CHECK (
					rollback_authorization IN ('none', 'on-unsatisfied-closure')
					AND (decision = 'approved' OR rollback_authorization = 'none')
				),
				CONSTRAINT agent_approval_decisions_digest_check CHECK (
					policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND decision_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_approval_decisions_lifetime_check CHECK (expires_at > decided_at),
				CONSTRAINT agent_approval_decisions_bytes_check CHECK (octet_length(approval_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_approval_decisions_run_decided
				ON agent_approval_decisions(workspace_id, run_id, decided_at DESC, decision_id DESC)`,
			`DROP TRIGGER IF EXISTS agent_approval_decisions_immutable_mutation ON agent_approval_decisions`,
			`CREATE TRIGGER agent_approval_decisions_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_approval_decisions
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_workspace_mutation_receipts (
				workspace_id TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				operation_id TEXT NOT NULL,
				kind TEXT NOT NULL,
				state TEXT NOT NULL,
				task_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				proposal_id TEXT NOT NULL,
				preview_id TEXT NOT NULL,
				decision_id TEXT NOT NULL,
				base_revision_digest TEXT NOT NULL,
				transaction_digest TEXT NOT NULL,
				reverse_transaction_digest TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				producer_kind TEXT NOT NULL,
				producer_id TEXT NOT NULL,
				target_revision_digest TEXT,
				mutation_digest TEXT,
				conflict_digest TEXT,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ,
				PRIMARY KEY (workspace_id, receipt_id),
				UNIQUE (workspace_id, receipt_digest),
				FOREIGN KEY (workspace_id, proposal_id)
					REFERENCES agent_proposals(workspace_id, proposal_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, decision_id)
					REFERENCES agent_approval_decisions(workspace_id, decision_id) ON DELETE RESTRICT,
				CONSTRAINT agent_workspace_mutation_receipts_kind_check CHECK (kind IN ('commit', 'rollback')),
				CONSTRAINT agent_workspace_mutation_receipts_state_check CHECK (
					state IN ('started', 'acknowledged', 'conflicted', 'reconciliation-required')
				),
				CONSTRAINT agent_workspace_mutation_receipts_producer_check CHECK (producer_kind IN ('user', 'service')),
				CONSTRAINT agent_workspace_mutation_receipts_digest_check CHECK (
					base_revision_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transaction_digest ~ '^sha256-[a-f0-9]{64}$'
					AND reverse_transaction_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (target_revision_digest IS NULL OR target_revision_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (mutation_digest IS NULL OR mutation_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (conflict_digest IS NULL OR conflict_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_workspace_mutation_receipts_lifecycle_check CHECK (
					(state = 'started' AND completed_at IS NULL AND target_revision_digest IS NULL AND mutation_digest IS NULL AND conflict_digest IS NULL)
					OR (state = 'acknowledged' AND completed_at IS NOT NULL AND target_revision_digest IS NOT NULL AND mutation_digest IS NOT NULL AND conflict_digest IS NULL)
					OR (state = 'conflicted' AND completed_at IS NOT NULL AND target_revision_digest IS NULL AND mutation_digest IS NULL AND conflict_digest IS NOT NULL)
					OR (state = 'reconciliation-required' AND completed_at IS NOT NULL AND target_revision_digest IS NULL AND mutation_digest IS NULL AND conflict_digest IS NULL)
				),
				CONSTRAINT agent_workspace_mutation_receipts_time_check CHECK (completed_at IS NULL OR completed_at >= started_at),
				CONSTRAINT agent_workspace_mutation_receipts_bytes_check CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspace_mutation_receipts_started
				ON agent_workspace_mutation_receipts(workspace_id, operation_id)
				WHERE state = 'started'`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspace_mutation_receipts_terminal
				ON agent_workspace_mutation_receipts(workspace_id, operation_id)
				WHERE state <> 'started'`,
			`CREATE INDEX IF NOT EXISTS idx_agent_workspace_mutation_receipts_run_started
				ON agent_workspace_mutation_receipts(workspace_id, run_id, started_at DESC, receipt_id DESC)`,
			`DROP TRIGGER IF EXISTS agent_workspace_mutation_receipts_immutable_mutation ON agent_workspace_mutation_receipts`,
			`CREATE TRIGGER agent_workspace_mutation_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_workspace_mutation_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
