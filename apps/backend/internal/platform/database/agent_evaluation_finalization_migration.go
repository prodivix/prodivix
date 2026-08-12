package database

// agentEvaluationFinalizationMigration adds the two immutable server-owned
// CAS records that close a production evaluation. The holdout record commits
// only encrypted-corpus and bounded evidence roots. The finalization record
// binds the exact review lease, validated human authority and the five
// canonical result facts written in the same transaction.
func agentEvaluationFinalizationMigration() migration {
	return migration{
		version: 42,
		name:    "g4-agent-evaluation-holdout-and-finalization",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_evaluation_holdout_closures (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				source_config_path TEXT NOT NULL,
				source_config_digest TEXT NOT NULL,
				frozen_run_digest TEXT NOT NULL,
				config_commitment_digest TEXT NOT NULL,
				config_commitment_bytes BYTEA NOT NULL,
				protected_evidence_set_digest TEXT NOT NULL,
				access_policy_digest TEXT NOT NULL,
				encrypted_corpus_digest TEXT NOT NULL,
				secret_canary_set_digest TEXT NOT NULL,
				protected_holdout_canary_set_digest TEXT NOT NULL,
				scan_receipt_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				sealed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_holdout_closures_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_holdout_closures_digest_check CHECK (
					source_config_digest ~ '^sha256-[a-f0-9]{64}$'
					AND frozen_run_digest ~ '^sha256-[a-f0-9]{64}$'
					AND config_commitment_digest ~ '^sha256-[a-f0-9]{64}$'
					AND protected_evidence_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND access_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND encrypted_corpus_digest ~ '^sha256-[a-f0-9]{64}$'
					AND secret_canary_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND protected_holdout_canary_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND scan_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_holdout_closures_source_path_check CHECK (
					source_config_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'
					AND source_config_path NOT LIKE '%//%'
					AND source_config_path NOT LIKE '/%'
					AND source_config_path NOT LIKE '%/'
					AND source_config_path !~ '(^|/)\.\.?(/|$)'
				),
				CONSTRAINT agent_evaluation_holdout_closures_bytes_check CHECK (
					octet_length(config_commitment_bytes) BETWEEN 1 AND 1048576
					AND octet_length(receipt_bytes) BETWEEN 1 AND 1048576
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_holdout_closures_immutable_mutation
				ON agent_evaluation_holdout_closures`,
			`CREATE TRIGGER agent_evaluation_holdout_closures_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_holdout_closures
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_finalizations (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				review_lease_digest TEXT NOT NULL,
				validated_human_review_artifact_digest TEXT NOT NULL,
				metric_report_digest TEXT NOT NULL,
				grader_report_digest TEXT NOT NULL,
				human_review_report_digest TEXT NOT NULL,
				holdout_execution_receipt_digest TEXT NOT NULL,
				manifest_digest TEXT NOT NULL,
				report_digest TEXT NOT NULL,
				report_bytes BYTEA NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, report_digest),
				UNIQUE (namespace_id, manifest_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_finalizations_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_finalizations_digest_check CHECK (
					review_lease_digest ~ '^sha256-[a-f0-9]{64}$'
					AND validated_human_review_artifact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND metric_report_digest ~ '^sha256-[a-f0-9]{64}$'
					AND grader_report_digest ~ '^sha256-[a-f0-9]{64}$'
					AND human_review_report_digest ~ '^sha256-[a-f0-9]{64}$'
					AND holdout_execution_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND manifest_digest ~ '^sha256-[a-f0-9]{64}$'
					AND report_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_finalizations_bytes_check
					CHECK (octet_length(report_bytes) BETWEEN 1 AND 8388608)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_finalizations_immutable_mutation
				ON agent_evaluation_finalizations`,
			`CREATE TRIGGER agent_evaluation_finalizations_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_finalizations
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			// Finalization itself is the first durable freeze boundary. Authority
			// attestation and archive-root publication happen afterwards and may
			// only add their own immutable facts.
			`CREATE OR REPLACE FUNCTION reject_agent_evaluation_finalized_mutation() RETURNS TRIGGER AS $$
			DECLARE
				evaluation_namespace_id TEXT;
				evaluation_plan_digest TEXT;
			BEGIN
				IF TG_OP = 'DELETE' THEN
					evaluation_namespace_id := OLD.namespace_id;
					evaluation_plan_digest := OLD.plan_digest;
				ELSE
					evaluation_namespace_id := NEW.namespace_id;
					evaluation_plan_digest := NEW.plan_digest;
				END IF;
				PERFORM 1 FROM agent_evaluation_plans
					WHERE namespace_id = evaluation_namespace_id
						AND plan_digest = evaluation_plan_digest FOR SHARE;
				IF EXISTS (
					SELECT 1 FROM agent_evaluation_finalizations
					WHERE namespace_id = evaluation_namespace_id
						AND plan_digest = evaluation_plan_digest
				) OR EXISTS (
					SELECT 1 FROM agent_evaluation_authority_attestations
					WHERE namespace_id = evaluation_namespace_id
						AND plan_digest = evaluation_plan_digest
				) THEN
					RAISE EXCEPTION 'finalized evaluation partition is immutable'
						USING ERRCODE = '23514';
				END IF;
				IF TG_OP = 'DELETE' THEN
					RETURN OLD;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
		},
	}
}
