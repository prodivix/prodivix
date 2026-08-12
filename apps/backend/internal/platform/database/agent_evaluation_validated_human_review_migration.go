package database

func agentEvaluationValidatedHumanReviewMigration() migration {
	return migration{
		version: 34,
		name:    "g4-agent-evaluation-evidence-extensions",
		statements: []string{
			`ALTER TABLE agent_evaluation_authority_attestations
				ADD COLUMN IF NOT EXISTS capability_execution_receipt_set_digest TEXT,
				ADD COLUMN IF NOT EXISTS validated_human_review_artifact_set_digest TEXT`,
			`ALTER TABLE agent_evaluation_authority_attestations
				ALTER COLUMN capability_execution_receipt_set_digest SET NOT NULL,
				ALTER COLUMN validated_human_review_artifact_set_digest SET NOT NULL`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ADD COLUMN IF NOT EXISTS capability_execution_receipt_set_digest TEXT,
				ADD COLUMN IF NOT EXISTS validated_human_review_artifact_set_digest TEXT`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ALTER COLUMN capability_execution_receipt_set_digest SET NOT NULL,
				ALTER COLUMN validated_human_review_artifact_set_digest SET NOT NULL`,
			`DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_authority_extended_digest_check') THEN
					ALTER TABLE agent_evaluation_authority_attestations ADD CONSTRAINT eval_authority_extended_digest_check CHECK (
						capability_execution_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
						AND validated_human_review_artifact_set_digest ~ '^sha256-[a-f0-9]{64}$'
					);
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_root_extended_digest_check') THEN
					ALTER TABLE agent_evaluation_evidence_roots ADD CONSTRAINT eval_root_extended_digest_check CHECK (
						capability_execution_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
						AND validated_human_review_artifact_set_digest ~ '^sha256-[a-f0-9]{64}$'
					);
				END IF;
			END $$`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_validated_human_review_artifacts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				artifact_id TEXT NOT NULL,
				review_artifact_digest TEXT NOT NULL,
				human_review_report_type TEXT NOT NULL DEFAULT 'evaluation-human-review-report',
				human_review_report_id TEXT NOT NULL,
				human_review_report_digest TEXT NOT NULL,
				blinded_artifact_set_digest TEXT NOT NULL,
				adjudication_digest TEXT NOT NULL,
				artifact_digest TEXT NOT NULL,
				artifact_json JSONB NOT NULL,
				artifact_bytes BYTEA NOT NULL,
				validated_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, artifact_id),
				UNIQUE (namespace_id, artifact_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, human_review_report_type, human_review_report_id)
					REFERENCES agent_evaluation_artifacts(namespace_id, plan_digest, fact_type, fact_id) ON DELETE RESTRICT,
				CONSTRAINT eval_validated_human_review_type_check
					CHECK (human_review_report_type = 'evaluation-human-review-report'),
				CONSTRAINT eval_validated_human_review_digest_check CHECK (
					review_artifact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND human_review_report_digest ~ '^sha256-[a-f0-9]{64}$'
					AND blinded_artifact_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adjudication_digest ~ '^sha256-[a-f0-9]{64}$'
					AND artifact_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT eval_validated_human_review_bytes_check
					CHECK (octet_length(artifact_bytes) BETWEEN 1 AND 16842752)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_validated_human_review_immutable_mutation
				ON agent_evaluation_validated_human_review_artifacts`,
			`CREATE TRIGGER agent_evaluation_validated_human_review_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_validated_human_review_artifacts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_validated_human_review_finalized_mutation
				ON agent_evaluation_validated_human_review_artifacts`,
			`CREATE TRIGGER agent_evaluation_validated_human_review_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_validated_human_review_artifacts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_execution_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				capability_execution_receipt_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				case_id TEXT NOT NULL,
				case_digest TEXT NOT NULL,
				target_id TEXT NOT NULL,
				target_digest TEXT NOT NULL,
				capability_profile_id TEXT NOT NULL,
				capability_id TEXT NOT NULL,
				support_expectation TEXT NOT NULL,
				capability_descriptor_digest TEXT NOT NULL,
				outcome TEXT NOT NULL,
				verdict TEXT NOT NULL,
				policy_digest TEXT NOT NULL,
				tool_registry_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				observed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, capability_execution_receipt_id),
				UNIQUE (namespace_id, plan_digest, attempt_id, capability_descriptor_digest),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id)
					REFERENCES agent_evaluation_attempts(namespace_id, plan_digest, attempt_id)
					ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, turn_index)
					REFERENCES agent_evaluation_invocation_turn_receipts(namespace_id, plan_digest, attempt_id, turn_index)
					ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				CONSTRAINT eval_capability_execution_turn_check CHECK (turn_index BETWEEN 0 AND 64),
				CONSTRAINT eval_capability_execution_support_check
					CHECK (support_expectation IN ('required', 'expected-blocked')),
				CONSTRAINT eval_capability_execution_outcome_check CHECK (outcome IN ('supported', 'unsupported', 'failed')),
				CONSTRAINT eval_capability_execution_verdict_check CHECK (verdict IN ('passed', 'failed')),
				CONSTRAINT eval_capability_execution_digest_check CHECK (
					case_digest ~ '^sha256-[a-f0-9]{64}$'
					AND target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND tool_registry_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT eval_capability_execution_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 65536)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_capability_execution_immutable_mutation
				ON agent_evaluation_capability_execution_receipts`,
			`CREATE TRIGGER agent_evaluation_capability_execution_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_capability_execution_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_capability_execution_finalized_mutation
				ON agent_evaluation_capability_execution_receipts`,
			`CREATE TRIGGER agent_evaluation_capability_execution_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_execution_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		},
	}
}
