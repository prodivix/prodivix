package database

// agentEvaluationArchiveClosureMigration persists the signed archive index,
// attestation and v2 root as one immutable crash-fenced fact. The archive
// shards remain outside PostgreSQL and are addressed only by their signed
// digests.
func agentEvaluationArchiveClosureMigration() migration {
	return migration{
		version: 43,
		name:    "g4-agent-evaluation-evidence-archive-closure",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_evaluation_archive_closures (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				export_lease_id TEXT NOT NULL,
				export_lease_digest TEXT NOT NULL,
				source_config_path TEXT NOT NULL,
				source_config_digest TEXT NOT NULL,
				frozen_run_digest TEXT NOT NULL,
				evidence_set_digest TEXT NOT NULL,
				authority_payload_digest TEXT NOT NULL,
				authority_attestation_digest TEXT NOT NULL,
				review_lease_digest TEXT,
				evaluation_manifest_digest TEXT NOT NULL,
				index_digest TEXT NOT NULL,
				archive_attestation_digest TEXT NOT NULL,
				root_digest TEXT NOT NULL,
				closure_digest TEXT NOT NULL,
				closure_bytes BYTEA NOT NULL,
				recorded_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (namespace_id, export_lease_id),
				UNIQUE (namespace_id, export_lease_digest),
				UNIQUE (namespace_id, index_digest),
				UNIQUE (namespace_id, archive_attestation_digest),
				UNIQUE (namespace_id, root_digest),
				UNIQUE (namespace_id, closure_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, export_lease_id)
					REFERENCES agent_evaluation_export_leases(namespace_id, lease_id) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_archive_closures_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_archive_closures_path_check CHECK (
					octet_length(source_config_path) BETWEEN 1 AND 255
					AND source_config_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'
					AND source_config_path NOT LIKE '/%'
					AND source_config_path NOT LIKE '%//%'
					AND source_config_path NOT LIKE '%/'
					AND source_config_path !~ '(^|/)\.\.?(/|$)'
				),
				CONSTRAINT agent_evaluation_archive_closures_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND export_lease_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_config_digest ~ '^sha256-[a-f0-9]{64}$'
					AND frozen_run_digest ~ '^sha256-[a-f0-9]{64}$'
					AND evidence_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_payload_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_attestation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (review_lease_digest IS NULL OR review_lease_digest ~ '^sha256-[a-f0-9]{64}$')
					AND evaluation_manifest_digest ~ '^sha256-[a-f0-9]{64}$'
					AND index_digest ~ '^sha256-[a-f0-9]{64}$'
					AND archive_attestation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND root_digest ~ '^sha256-[a-f0-9]{64}$'
					AND closure_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_archive_closures_bytes_check
					CHECK (octet_length(closure_bytes) BETWEEN 1 AND 25296896)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_archive_closures_immutable_mutation
				ON agent_evaluation_archive_closures`,
			`CREATE TRIGGER agent_evaluation_archive_closures_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_archive_closures
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
