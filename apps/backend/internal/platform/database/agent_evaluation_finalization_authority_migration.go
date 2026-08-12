package database

// agentEvaluationFinalizationAuthorityMigration adds the immutable projected
// human-metric family and a durable finalization command time. It follows the
// already-deployed v42 holdout/finalization and v43 archive closure migrations.
func agentEvaluationFinalizationAuthorityMigration() migration {
	return migration{
		version: 44,
		name:    "g4-agent-evaluation-finalization-authority",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_evaluation_validated_human_metric_observation_sets (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				validated_human_review_artifact_digest TEXT NOT NULL,
				human_review_report_digest TEXT NOT NULL,
				observation_set_digest TEXT NOT NULL,
				observation_count BIGINT NOT NULL,
				observations_bytes BYTEA NOT NULL,
				observed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, observation_set_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest)
					REFERENCES agent_evaluation_validated_human_review_artifacts(namespace_id, plan_digest)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_validated_human_metric_sets_digest_check CHECK (
					validated_human_review_artifact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND human_review_report_digest ~ '^sha256-[a-f0-9]{64}$'
					AND observation_set_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_validated_human_metric_sets_count_check
					CHECK (observation_count BETWEEN 0 AND 72),
				CONSTRAINT agent_evaluation_validated_human_metric_sets_bytes_check
					CHECK (octet_length(observations_bytes) BETWEEN 2 AND 4194304)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_validated_human_metric_sets_immutable_mutation
				ON agent_evaluation_validated_human_metric_observation_sets`,
			`CREATE TRIGGER agent_evaluation_validated_human_metric_sets_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_validated_human_metric_observation_sets
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_validated_human_metric_sets_finalized_mutation
				ON agent_evaluation_validated_human_metric_observation_sets`,
			`CREATE TRIGGER agent_evaluation_validated_human_metric_sets_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_validated_human_metric_observation_sets
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_validated_human_metric_observations (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				observation_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				randomized_presentation_id TEXT NOT NULL,
				metric_id TEXT NOT NULL,
				observation_digest TEXT NOT NULL,
				observation_json JSONB NOT NULL,
				observation_bytes BYTEA NOT NULL,
				observed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, observation_id),
				UNIQUE (namespace_id, plan_digest, attempt_id, metric_id),
				UNIQUE (namespace_id, observation_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest)
					REFERENCES agent_evaluation_validated_human_metric_observation_sets(namespace_id, plan_digest)
					ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id)
					REFERENCES agent_evaluation_attempts(namespace_id, plan_digest, attempt_id)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_validated_human_metrics_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_validated_human_metrics_digest_check CHECK (
					descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND observation_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_validated_human_metrics_bytes_check
					CHECK (octet_length(observation_bytes) BETWEEN 1 AND 131072)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_validated_human_metrics_immutable_mutation
				ON agent_evaluation_validated_human_metric_observations`,
			`CREATE TRIGGER agent_evaluation_validated_human_metrics_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_validated_human_metric_observations
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_validated_human_metrics_finalized_mutation
				ON agent_evaluation_validated_human_metric_observations`,
			`CREATE TRIGGER agent_evaluation_validated_human_metrics_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_validated_human_metric_observations
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_finalization_intents (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				intent_digest TEXT NOT NULL,
				intent_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, intent_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_finalization_intents_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_finalization_intents_digest_check
					CHECK (intent_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT agent_evaluation_finalization_intents_bytes_check
					CHECK (octet_length(intent_bytes) BETWEEN 1 AND 4096)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_finalization_intents_immutable_mutation
				ON agent_evaluation_finalization_intents`,
			`CREATE TRIGGER agent_evaluation_finalization_intents_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_finalization_intents
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_finalization_intents_finalized_mutation
				ON agent_evaluation_finalization_intents`,
			`CREATE TRIGGER agent_evaluation_finalization_intents_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_finalization_intents
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`ALTER TABLE agent_evaluation_finalizations
				ADD COLUMN IF NOT EXISTS validated_human_metric_observation_set_digest TEXT`,
			`DO $$
			BEGIN
				IF EXISTS (SELECT 1 FROM agent_evaluation_finalizations
					WHERE validated_human_metric_observation_set_digest IS NULL) THEN
					RAISE EXCEPTION 'existing finalization lacks validated human metric authority'
						USING ERRCODE = '23514';
				END IF;
			END $$`,
			`ALTER TABLE agent_evaluation_finalizations
				ALTER COLUMN validated_human_metric_observation_set_digest SET NOT NULL`,
			`DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint
					WHERE conname = 'agent_evaluation_finalizations_human_metric_digest_check') THEN
					ALTER TABLE agent_evaluation_finalizations
						ADD CONSTRAINT agent_evaluation_finalizations_human_metric_digest_check
						CHECK (validated_human_metric_observation_set_digest ~ '^sha256-[a-f0-9]{64}$');
				END IF;
			END $$`,
		},
	}
}
