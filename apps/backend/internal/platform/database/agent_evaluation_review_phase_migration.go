package database

// agentEvaluationReviewPhaseMigration keeps the machine-sealed review lease
// digest on every durable human-review and final authenticity boundary. The
// columns remain nullable so partitions with no human-review report preserve a
// canonical absence all the way through finalization.
func agentEvaluationReviewPhaseMigration() migration {
	return migration{
		version: 38,
		name:    "g4-agent-evaluation-review-phase-binding",
		statements: []string{
			`ALTER TABLE agent_evaluation_authority_attestations
				ADD COLUMN IF NOT EXISTS review_lease_digest TEXT`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ADD COLUMN IF NOT EXISTS review_lease_digest TEXT`,
			`ALTER TABLE agent_evaluation_validated_human_review_artifacts
				ADD COLUMN IF NOT EXISTS review_lease_digest TEXT`,
			`DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_authority_review_lease_digest_check') THEN
					ALTER TABLE agent_evaluation_authority_attestations
						ADD CONSTRAINT eval_authority_review_lease_digest_check CHECK (
							review_lease_digest IS NULL OR review_lease_digest ~ '^sha256-[a-f0-9]{64}$'
						);
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_root_review_lease_digest_check') THEN
					ALTER TABLE agent_evaluation_evidence_roots
						ADD CONSTRAINT eval_root_review_lease_digest_check CHECK (
							review_lease_digest IS NULL OR review_lease_digest ~ '^sha256-[a-f0-9]{64}$'
						);
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_validated_human_review_lease_digest_check') THEN
					ALTER TABLE agent_evaluation_validated_human_review_artifacts
						ADD CONSTRAINT eval_validated_human_review_lease_digest_check CHECK (
							review_lease_digest IS NULL OR review_lease_digest ~ '^sha256-[a-f0-9]{64}$'
						);
				END IF;
			END $$`,
		},
	}
}
