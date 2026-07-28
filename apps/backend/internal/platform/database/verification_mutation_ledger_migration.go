package database

func verificationMutationLedgerMigration() migration {
	return migration{
		version: 20,
		name:    "verification-mutation-ledger",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS verification_mutation_requests (
				workspace_id TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				idempotency_key_hash TEXT NOT NULL,
				operation TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				request_json JSONB NOT NULL,
				request_bytes BYTEA NOT NULL,
				result_json JSONB NOT NULL,
				result_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, actor_id, idempotency_key_hash),
				CONSTRAINT verification_mutation_requests_key_hash_check CHECK (
					idempotency_key_hash ~ '^[a-f0-9]{64}$'
				),
				CONSTRAINT verification_mutation_requests_request_digest_check CHECK (
					request_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_mutation_requests_operation_check CHECK (
					operation IN (
						'evidence.supersede',
						'retention.protect',
						'retention.release',
						'evidence.tombstone',
						'trust.revoke'
					)
				),
				CONSTRAINT verification_mutation_requests_bytes_check CHECK (
					octet_length(request_bytes) BETWEEN 1 AND 32768
					AND octet_length(result_bytes) BETWEEN 1 AND 32768
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_mutation_requests_created
				ON verification_mutation_requests(workspace_id, created_at DESC)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_revocation_evidence_scope
				ON verification_trust_revocations(workspace_id, evidence_id)
				WHERE evidence_id IS NOT NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_revocation_issuer_scope
				ON verification_trust_revocations(workspace_id, issuer)
				WHERE evidence_id IS NULL AND issuer IS NOT NULL AND key_id IS NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_revocation_key_scope
				ON verification_trust_revocations(workspace_id, issuer, key_id)
				WHERE evidence_id IS NULL AND issuer IS NOT NULL AND key_id IS NOT NULL`,
			`DROP TRIGGER IF EXISTS verification_mutation_requests_immutable_mutation
				ON verification_mutation_requests`,
			`CREATE TRIGGER verification_mutation_requests_immutable_mutation
				BEFORE UPDATE OR DELETE ON verification_mutation_requests
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
		},
	}
}
