package database

func agentEvaluationVerificationGrantAuthenticityMigration() migration {
	return migration{
		version: 36,
		name:    "g4-agent-evaluation-verification-grant-authenticity",
		statements: []string{
			`ALTER TABLE agent_evaluation_authority_attestations
				ADD COLUMN IF NOT EXISTS verification_attempt_grant_receipt_set_digest TEXT`,
			`ALTER TABLE agent_evaluation_authority_attestations
				ALTER COLUMN verification_attempt_grant_receipt_set_digest SET NOT NULL`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ADD COLUMN IF NOT EXISTS verification_attempt_grant_receipt_set_digest TEXT`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ALTER COLUMN verification_attempt_grant_receipt_set_digest SET NOT NULL`,
			`DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_authority_verification_grant_digest_check') THEN
					ALTER TABLE agent_evaluation_authority_attestations
						ADD CONSTRAINT eval_authority_verification_grant_digest_check CHECK (
							verification_attempt_grant_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
						);
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_root_verification_grant_digest_check') THEN
					ALTER TABLE agent_evaluation_evidence_roots
						ADD CONSTRAINT eval_root_verification_grant_digest_check CHECK (
							verification_attempt_grant_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
						);
				END IF;
			END $$`,
		},
	}
}
