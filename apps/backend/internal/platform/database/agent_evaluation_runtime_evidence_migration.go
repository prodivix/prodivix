package database

func agentEvaluationRuntimeEvidenceMigration() migration {
	return migration{
		version: 30,
		name:    "g4-agent-evaluation-runtime-evidence",
		statements: []string{
			`ALTER TABLE agent_evaluation_invocation_receipts
				ADD COLUMN IF NOT EXISTS transport_receipt_digest TEXT,
				ADD COLUMN IF NOT EXISTS resolved_model_id TEXT,
				ADD COLUMN IF NOT EXISTS resolved_model_version TEXT,
				ADD COLUMN IF NOT EXISTS resolved_model_identity_digest TEXT`,
			`ALTER TABLE agent_evaluation_invocation_receipts
				ALTER COLUMN transport_receipt_digest SET NOT NULL,
				ALTER COLUMN resolved_model_identity_digest SET NOT NULL`,
			`ALTER TABLE agent_evaluation_invocation_receipts
				DROP CONSTRAINT IF EXISTS agent_evaluation_invocation_receipts_resolved_model_digest_check,
				ADD CONSTRAINT agent_evaluation_invocation_receipts_resolved_model_digest_check CHECK (
					transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND resolved_model_identity_digest ~ '^sha256-[a-f0-9]{64}$'
				)`,
			`ALTER TABLE agent_evaluation_execution_receipts
				DROP CONSTRAINT IF EXISTS agent_evaluation_execution_receipts_count_check,
				ADD CONSTRAINT agent_evaluation_execution_receipts_count_check CHECK (
					model_invocations BETWEEN 0 AND 9007199254740991
					AND tool_calls BETWEEN 0 AND 9007199254740991
					AND repair_rounds BETWEEN 0 AND 9007199254740991
					AND transactions BETWEEN 0 AND 9007199254740991
					AND artifact_bytes BETWEEN 0 AND 9007199254740991
					AND elapsed_ms BETWEEN 0 AND 9007199254740991
					AND (tool_calls > 0) = (tool_receipt_set_digest IS NOT NULL)
					AND (transactions > 0) = (transaction_receipt_set_digest IS NOT NULL)
				)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_result_submission_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				invocation_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				case_id TEXT NOT NULL,
				case_digest TEXT NOT NULL,
				material_digest TEXT NOT NULL,
				submission_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id),
				UNIQUE (namespace_id, plan_digest, descriptor_digest),
				UNIQUE (namespace_id, plan_digest, invocation_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, attempt_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_result_submission_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND case_digest ~ '^sha256-[a-f0-9]{64}$'
					AND material_digest ~ '^sha256-[a-f0-9]{64}$'
					AND submission_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_result_submission_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 262144)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_result_submission_receipts_immutable_mutation
				ON agent_evaluation_result_submission_receipts`,
			`CREATE TRIGGER agent_evaluation_result_submission_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_result_submission_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_result_submission_receipts_finalized_mutation
				ON agent_evaluation_result_submission_receipts`,
			`CREATE TRIGGER agent_evaluation_result_submission_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_result_submission_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_controlled_runtime_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				case_id TEXT NOT NULL,
				case_digest TEXT NOT NULL,
				material_digest TEXT NOT NULL,
				submission_receipt_digest TEXT NOT NULL,
				runtime_authority_id TEXT NOT NULL,
				verification_closure_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, attempt_id),
				UNIQUE (namespace_id, plan_digest, descriptor_digest),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, submission_receipt_digest)
					REFERENCES agent_evaluation_result_submission_receipts(namespace_id, plan_digest, attempt_id, receipt_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_controlled_runtime_receipts_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND case_digest ~ '^sha256-[a-f0-9]{64}$'
					AND material_digest ~ '^sha256-[a-f0-9]{64}$'
					AND submission_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND verification_closure_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_controlled_runtime_receipts_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 2097152)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_controlled_runtime_receipts_immutable_mutation
				ON agent_evaluation_controlled_runtime_receipts`,
			`CREATE TRIGGER agent_evaluation_controlled_runtime_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_controlled_runtime_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_controlled_runtime_receipts_finalized_mutation
				ON agent_evaluation_controlled_runtime_receipts`,
			`CREATE TRIGGER agent_evaluation_controlled_runtime_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_controlled_runtime_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		},
	}
}
