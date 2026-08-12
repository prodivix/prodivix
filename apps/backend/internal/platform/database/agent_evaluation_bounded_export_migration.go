package database

// agentEvaluationBoundedExportMigration materializes only immutable record
// references for a sealed evaluation partition. Large canonical fact bodies
// remain in their owning tables and are read through bounded family pages.
func agentEvaluationBoundedExportMigration() migration {
	return migration{
		version: 37,
		name:    "g4-agent-evaluation-bounded-export-leases",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_evaluation_export_leases (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				lease_kind TEXT NOT NULL,
				lease_id TEXT NOT NULL,
				lease_digest TEXT NOT NULL,
				cursor_key_binding_digest TEXT NOT NULL,
				evidence_set_digest TEXT NOT NULL,
				authority_payload_digest TEXT NOT NULL,
				authority_attestation_digest TEXT NOT NULL,
				evaluation_manifest_digest TEXT NOT NULL,
				semantic_root_digest TEXT NOT NULL,
				commitments_digest TEXT NOT NULL,
				commitments_bytes BYTEA NOT NULL,
				family_count BIGINT NOT NULL,
				total_record_count BIGINT NOT NULL,
				total_record_bytes BIGINT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, lease_id),
				UNIQUE (namespace_id, lease_digest),
				UNIQUE (namespace_id, plan_digest, lease_kind, cursor_key_binding_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, authority_attestation_digest)
					REFERENCES agent_evaluation_authority_attestations(namespace_id, plan_digest, attestation_digest) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_export_leases_kind_check
					CHECK (lease_kind IN ('evidence-archive', 'human-review')),
				CONSTRAINT agent_evaluation_export_leases_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_export_leases_digest_check CHECK (
					lease_digest ~ '^sha256-[a-f0-9]{64}$'
					AND cursor_key_binding_digest ~ '^sha256-[a-f0-9]{64}$'
					AND evidence_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_payload_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_attestation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND evaluation_manifest_digest ~ '^sha256-[a-f0-9]{64}$'
					AND semantic_root_digest ~ '^sha256-[a-f0-9]{64}$'
					AND commitments_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_export_leases_bounds_check CHECK (
					family_count BETWEEN 1 AND 64
					AND total_record_count BETWEEN 1 AND 2000000
					AND total_record_bytes BETWEEN 1 AND 8589934592
					AND octet_length(commitments_bytes) BETWEEN 1 AND 1048576
				),
				CONSTRAINT agent_evaluation_export_leases_expiry_check CHECK (expires_at > created_at)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_export_leases_immutable_mutation
				ON agent_evaluation_export_leases`,
			`CREATE TRIGGER agent_evaluation_export_leases_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_export_leases
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_export_lease_families (
				namespace_id TEXT NOT NULL,
				lease_id TEXT NOT NULL,
				family TEXT NOT NULL,
				family_index BIGINT NOT NULL,
				record_count BIGINT NOT NULL,
				total_bytes BIGINT NOT NULL,
				semantic_digest TEXT NOT NULL,
				record_set_digest TEXT NOT NULL,
				first_order_key TEXT,
				last_order_key TEXT,
				PRIMARY KEY (namespace_id, lease_id, family),
				UNIQUE (namespace_id, lease_id, family_index),
				FOREIGN KEY (namespace_id, lease_id)
					REFERENCES agent_evaluation_export_leases(namespace_id, lease_id)
					ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				CONSTRAINT agent_evaluation_export_lease_families_index_check
					CHECK (family_index BETWEEN 0 AND 63),
				CONSTRAINT agent_evaluation_export_lease_families_bounds_check CHECK (
					record_count BETWEEN 0 AND 2000000
					AND total_bytes BETWEEN 0 AND 8589934592
				),
				CONSTRAINT agent_evaluation_export_lease_families_digest_check CHECK (
					semantic_digest ~ '^sha256-[a-f0-9]{64}$'
					AND record_set_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_export_lease_families_range_check CHECK (
					(record_count = 0 AND total_bytes = 0 AND first_order_key IS NULL AND last_order_key IS NULL)
					OR (record_count > 0 AND total_bytes > 0 AND first_order_key IS NOT NULL AND last_order_key IS NOT NULL)
				)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_export_lease_families_immutable_mutation
				ON agent_evaluation_export_lease_families`,
			`CREATE TRIGGER agent_evaluation_export_lease_families_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_export_lease_families
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_export_lease_records (
				namespace_id TEXT NOT NULL,
				lease_id TEXT NOT NULL,
				family TEXT NOT NULL,
				record_ordinal BIGINT NOT NULL,
				order_key TEXT NOT NULL,
				record_digest TEXT NOT NULL,
				byte_length BIGINT NOT NULL,
				inline_value_bytes BYTEA,
				PRIMARY KEY (namespace_id, lease_id, family, record_ordinal),
				UNIQUE (namespace_id, lease_id, family, order_key),
				UNIQUE (namespace_id, lease_id, family, record_digest),
				FOREIGN KEY (namespace_id, lease_id, family)
					REFERENCES agent_evaluation_export_lease_families(namespace_id, lease_id, family)
					ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				CONSTRAINT agent_evaluation_export_lease_records_ordinal_check
					CHECK (record_ordinal BETWEEN 0 AND 1999999),
				CONSTRAINT agent_evaluation_export_lease_records_digest_check
					CHECK (record_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT agent_evaluation_export_lease_records_bytes_check CHECK (
					byte_length BETWEEN 1 AND 16777216
					AND (inline_value_bytes IS NULL OR octet_length(inline_value_bytes) = byte_length)
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_export_lease_records_page
				ON agent_evaluation_export_lease_records(namespace_id, lease_id, family, record_ordinal, order_key)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_export_lease_records_immutable_mutation
				ON agent_evaluation_export_lease_records`,
			`CREATE TRIGGER agent_evaluation_export_lease_records_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_export_lease_records
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		},
	}
}
