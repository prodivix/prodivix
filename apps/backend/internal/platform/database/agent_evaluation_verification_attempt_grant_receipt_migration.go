package database

func agentEvaluationVerificationAttemptGrantReceiptMigration() migration {
	return migration{
		version: 35,
		name:    "g4-agent-evaluation-verification-attempt-grant-receipts",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS agent_evaluation_verification_attempt_grant_receipts (
				namespace_id TEXT NOT NULL,
				evaluation_plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				capability_descriptor_digest TEXT NOT NULL,
				generation BIGINT NOT NULL,
				workspace_id TEXT NOT NULL,
				workspace_revision BIGINT NOT NULL,
				verification_plan_digest TEXT NOT NULL,
				cell_id TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				request_json JSONB NOT NULL,
				request_bytes BYTEA NOT NULL,
				issuance_binding_digest TEXT NOT NULL,
				verification_attempt_grant_id TEXT NOT NULL,
				verification_attempt_grant_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				issued_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (
					namespace_id, evaluation_plan_digest, attempt_id, generation,
					verification_plan_digest, cell_id
				),
				UNIQUE (namespace_id, request_digest),
				UNIQUE (namespace_id, receipt_digest),
				FOREIGN KEY (namespace_id, evaluation_plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (verification_attempt_grant_id)
					REFERENCES verification_attempt_grants(id) ON DELETE RESTRICT,
				FOREIGN KEY (verification_attempt_grant_digest)
					REFERENCES verification_attempt_grants(grant_digest) ON DELETE RESTRICT,
				CONSTRAINT eval_verification_attempt_grant_generation_check
					CHECK (generation BETWEEN 1 AND 9007199254740991),
				CONSTRAINT eval_verification_attempt_grant_revision_check
					CHECK (workspace_revision BETWEEN 1 AND 9007199254740991),
				CONSTRAINT eval_verification_attempt_grant_repository_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT eval_verification_attempt_grant_digest_check CHECK (
					evaluation_plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND verification_plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND issuance_binding_digest ~ '^sha256-[a-f0-9]{64}$'
					AND verification_attempt_grant_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT eval_verification_attempt_grant_bytes_check CHECK (
					octet_length(request_bytes) BETWEEN 1 AND 8388608
					AND octet_length(receipt_bytes) BETWEEN 1 AND 262144
				),
				CONSTRAINT eval_verification_attempt_grant_expiry_check
					CHECK (expires_at > issued_at)
			)`,
			`DROP TRIGGER IF EXISTS agent_evaluation_verification_attempt_grant_receipts_immutable_mutation
				ON agent_evaluation_verification_attempt_grant_receipts`,
			`CREATE TRIGGER agent_evaluation_verification_attempt_grant_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_verification_attempt_grant_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS agent_evaluation_verification_attempt_grant_receipts_finalized_mutation
				ON agent_evaluation_verification_attempt_grant_receipts`,
			`CREATE TRIGGER agent_evaluation_verification_attempt_grant_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_verification_attempt_grant_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		},
	}
}
