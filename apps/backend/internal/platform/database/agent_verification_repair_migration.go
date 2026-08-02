package database

func agentVerificationRepairMigration() migration {
	return migration{
		version: 25,
		name:    "g4-agent-verification-repair-ledger",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_verification_plan_bindings (
				workspace_id TEXT NOT NULL,
				binding_id TEXT NOT NULL,
				task_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				proposal_id TEXT NOT NULL,
				preview_id TEXT NOT NULL,
				decision_id TEXT NOT NULL,
				mutation_receipt_id TEXT NOT NULL,
				mutation_kind TEXT NOT NULL,
				verification_run_id TEXT NOT NULL,
				target_revision_digest TEXT NOT NULL,
				approved_plan_digest TEXT NOT NULL,
				actual_plan_digest TEXT NOT NULL,
				plan_compatibility TEXT NOT NULL,
				impact_digest TEXT NOT NULL,
				policy_digest TEXT NOT NULL,
				approved_required_cell_set_digest TEXT NOT NULL,
				actual_required_cell_set_digest TEXT NOT NULL,
				regression_requirement_set_digest TEXT NOT NULL,
				producer_kind TEXT NOT NULL,
				producer_id TEXT NOT NULL,
				binding_digest TEXT NOT NULL,
				binding_json JSONB NOT NULL,
				binding_bytes BYTEA NOT NULL,
				bound_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, binding_id),
				UNIQUE (workspace_id, mutation_receipt_id, verification_run_id),
				UNIQUE (workspace_id, binding_digest),
				FOREIGN KEY (workspace_id, task_id)
					REFERENCES agent_tasks(workspace_id, task_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, proposal_id)
					REFERENCES agent_proposals(workspace_id, proposal_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, mutation_receipt_id)
					REFERENCES agent_workspace_mutation_receipts(workspace_id, receipt_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, verification_run_id)
					REFERENCES verification_runs(workspace_id, id) ON DELETE RESTRICT,
				CONSTRAINT agent_verification_plan_bindings_kind_check CHECK (mutation_kind IN ('commit', 'rollback')),
				CONSTRAINT agent_verification_plan_bindings_compatibility_check CHECK (
					plan_compatibility IN ('exact', 'compatible', 'post-rollback')
					AND ((mutation_kind = 'rollback') = (plan_compatibility = 'post-rollback'))
					AND (plan_compatibility <> 'exact' OR approved_plan_digest = actual_plan_digest)
				),
				CONSTRAINT agent_verification_plan_bindings_producer_check CHECK (producer_kind = 'service'),
				CONSTRAINT agent_verification_plan_bindings_digest_check CHECK (
					target_revision_digest ~ '^sha256-[a-f0-9]{64}$'
					AND approved_plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND actual_plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND impact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND approved_required_cell_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND actual_required_cell_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND regression_requirement_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND binding_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_verification_plan_bindings_bytes_check CHECK (octet_length(binding_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_verification_plan_bindings_run
				ON agent_verification_plan_bindings(workspace_id, run_id, bound_at DESC, binding_id DESC)`,
			`DROP TRIGGER IF EXISTS agent_verification_plan_bindings_immutable_mutation ON agent_verification_plan_bindings`,
			`CREATE TRIGGER agent_verification_plan_bindings_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_verification_plan_bindings
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_verification_closure_receipts (
				workspace_id TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				binding_id TEXT NOT NULL,
				task_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				verification_run_id TEXT NOT NULL,
				target_revision_digest TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				evidence_set_digest TEXT NOT NULL,
				verified_evidence_view_digest TEXT NOT NULL,
				closure_digest TEXT NOT NULL,
				verdict TEXT NOT NULL,
				producer_kind TEXT NOT NULL,
				producer_id TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				evaluated_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, receipt_id),
				UNIQUE (workspace_id, binding_id, closure_digest),
				UNIQUE (workspace_id, receipt_digest),
				FOREIGN KEY (workspace_id, binding_id)
					REFERENCES agent_verification_plan_bindings(workspace_id, binding_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, verification_run_id)
					REFERENCES verification_runs(workspace_id, id) ON DELETE RESTRICT,
				CONSTRAINT agent_verification_closure_receipts_verdict_check CHECK (verdict IN ('satisfied', 'unsatisfied', 'stale')),
				CONSTRAINT agent_verification_closure_receipts_producer_check CHECK (producer_kind = 'service'),
				CONSTRAINT agent_verification_closure_receipts_digest_check CHECK (
					target_revision_digest ~ '^sha256-[a-f0-9]{64}$'
					AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND evidence_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND verified_evidence_view_digest ~ '^sha256-[a-f0-9]{64}$'
					AND closure_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_verification_closure_receipts_bytes_check CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_verification_closure_receipts_run
				ON agent_verification_closure_receipts(workspace_id, run_id, evaluated_at DESC, receipt_id DESC)`,
			`DROP TRIGGER IF EXISTS agent_verification_closure_receipts_immutable_mutation ON agent_verification_closure_receipts`,
			`CREATE TRIGGER agent_verification_closure_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_verification_closure_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_verification_closure_evidence (
				workspace_id TEXT NOT NULL,
				closure_receipt_id TEXT NOT NULL,
				evidence_id TEXT NOT NULL,
				manifest_digest TEXT NOT NULL,
				outcome TEXT NOT NULL,
				PRIMARY KEY (workspace_id, closure_receipt_id, evidence_id),
				UNIQUE (workspace_id, closure_receipt_id, manifest_digest),
				FOREIGN KEY (workspace_id, closure_receipt_id)
					REFERENCES agent_verification_closure_receipts(workspace_id, receipt_id) ON DELETE RESTRICT,
				FOREIGN KEY (evidence_id)
					REFERENCES verification_evidence(id) ON DELETE RESTRICT,
				CONSTRAINT agent_verification_closure_evidence_outcome_check CHECK (outcome IN ('passed', 'failed', 'blocked', 'cancelled', 'infrastructure-error')),
				CONSTRAINT agent_verification_closure_evidence_digest_check CHECK (manifest_digest ~ '^sha256-[a-f0-9]{64}$')
			)`,
			`DROP TRIGGER IF EXISTS agent_verification_closure_evidence_immutable_mutation ON agent_verification_closure_evidence`,
			`CREATE TRIGGER agent_verification_closure_evidence_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_verification_closure_evidence
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_repair_round_receipts (
				workspace_id TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				repair_round_id TEXT NOT NULL,
				state TEXT NOT NULL,
				task_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				round INTEGER NOT NULL,
				failed_closure_receipt_id TEXT NOT NULL,
				failed_closure_digest TEXT NOT NULL,
				failure_context_pack_digest TEXT NOT NULL,
				counterexample_set_digest TEXT NOT NULL,
				regression_requirement_set_digest TEXT NOT NULL,
				cumulative_budget_ledger_digest TEXT NOT NULL,
				proposal_id TEXT,
				preview_id TEXT,
				decision_id TEXT,
				transaction_digest TEXT,
				verification_plan_digest TEXT,
				block_reason TEXT,
				producer_kind TEXT NOT NULL,
				producer_id TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				recorded_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, receipt_id),
				UNIQUE (workspace_id, repair_round_id, state),
				UNIQUE (workspace_id, receipt_digest),
				FOREIGN KEY (workspace_id, task_id)
					REFERENCES agent_tasks(workspace_id, task_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, run_id)
					REFERENCES agent_runs(workspace_id, run_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, failed_closure_receipt_id)
					REFERENCES agent_verification_closure_receipts(workspace_id, receipt_id) ON DELETE RESTRICT,
				FOREIGN KEY (workspace_id, proposal_id)
					REFERENCES agent_proposals(workspace_id, proposal_id) ON DELETE RESTRICT,
				CONSTRAINT agent_repair_round_receipts_state_check CHECK (state IN ('started', 'proposal-bound', 'blocked')),
				CONSTRAINT agent_repair_round_receipts_round_check CHECK (round BETWEEN 1 AND 1000),
				CONSTRAINT agent_repair_round_receipts_producer_check CHECK (producer_kind = 'service'),
				CONSTRAINT agent_repair_round_receipts_block_check CHECK (
					block_reason IS NULL OR block_reason IN ('repair-forbidden', 'repair-round-exhausted', 'budget-exhausted', 'permission-denied', 'regression-requirement-missing', 'authority-drift')
				),
				CONSTRAINT agent_repair_round_receipts_lifecycle_check CHECK (
					(state = 'started' AND proposal_id IS NULL AND preview_id IS NULL AND decision_id IS NULL AND transaction_digest IS NULL AND verification_plan_digest IS NULL AND block_reason IS NULL)
					OR (state = 'proposal-bound' AND proposal_id IS NOT NULL AND preview_id IS NOT NULL AND decision_id IS NOT NULL AND transaction_digest IS NOT NULL AND verification_plan_digest IS NOT NULL AND block_reason IS NULL)
					OR (state = 'blocked' AND proposal_id IS NULL AND preview_id IS NULL AND decision_id IS NULL AND transaction_digest IS NULL AND verification_plan_digest IS NULL AND block_reason IS NOT NULL)
				),
				CONSTRAINT agent_repair_round_receipts_digest_check CHECK (
					failed_closure_digest ~ '^sha256-[a-f0-9]{64}$'
					AND failure_context_pack_digest ~ '^sha256-[a-f0-9]{64}$'
					AND counterexample_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND regression_requirement_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND cumulative_budget_ledger_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (transaction_digest IS NULL OR transaction_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (verification_plan_digest IS NULL OR verification_plan_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_repair_round_receipts_bytes_check CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 8388608)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_repair_round_receipts_run
				ON agent_repair_round_receipts(workspace_id, run_id, round DESC, recorded_at DESC)`,
			`DROP TRIGGER IF EXISTS agent_repair_round_receipts_immutable_mutation ON agent_repair_round_receipts`,
			`CREATE TRIGGER agent_repair_round_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_repair_round_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
