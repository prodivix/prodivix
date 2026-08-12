package database

func agentEvaluationBlindReviewMigration() migration {
	return migration{
		version: 31,
		name:    "g4-agent-evaluation-blind-review-mapping",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_evaluation_blind_review_mappings (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				mapping_id TEXT NOT NULL,
				candidate_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				candidate_digest TEXT NOT NULL,
				bytes_digest TEXT NOT NULL,
				rubric_digest TEXT NOT NULL,
				randomized_presentation_policy_digest TEXT NOT NULL,
				randomized_presentation_id TEXT NOT NULL,
				mapping_digest TEXT NOT NULL,
				mapping_json JSONB NOT NULL,
				mapping_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, candidate_id),
				UNIQUE (namespace_id, plan_digest, attempt_id),
				UNIQUE (namespace_id, mapping_id),
				UNIQUE (namespace_id, randomized_presentation_id),
				UNIQUE (namespace_id, mapping_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id)
					REFERENCES agent_evaluation_review_candidates(namespace_id, plan_digest, attempt_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_blind_review_mappings_digest_check CHECK (
					candidate_digest ~ '^sha256-[a-f0-9]{64}$'
					AND bytes_digest ~ '^sha256-[a-f0-9]{64}$'
					AND rubric_digest ~ '^sha256-[a-f0-9]{64}$'
					AND randomized_presentation_policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND mapping_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_blind_review_mappings_presentation_check CHECK (
					randomized_presentation_id ~ '^blind-review:[A-Za-z0-9_-]{43}$'
				),
				CONSTRAINT agent_evaluation_blind_review_mappings_bytes_check
					CHECK (octet_length(mapping_bytes) BETWEEN 1 AND 65536)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_blind_review_mappings_immutable_mutation
				ON agent_evaluation_blind_review_mappings`,
			`CREATE TRIGGER agent_evaluation_blind_review_mappings_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_blind_review_mappings
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_blind_review_mappings_finalized_mutation
				ON agent_evaluation_blind_review_mappings`,
			`CREATE TRIGGER agent_evaluation_blind_review_mappings_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_blind_review_mappings
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		},
	}
}
