package database

// agentEvaluationReviewLeaseMigration permits the bounded export reference
// tables to hold one pre-finalization human-review lease. Review leases have
// no semantic authority attestation or final manifest yet; their immutable
// machine-phase and eligible-review commitments occupy the existing semantic
// root and commitments columns.
func agentEvaluationReviewLeaseMigration() migration {
	return migration{
		version: 39,
		name:    "g4-agent-evaluation-bounded-review-leases",
		statements: []string{
			`ALTER TABLE agent_evaluation_export_leases
				ALTER COLUMN evidence_set_digest DROP NOT NULL,
				ALTER COLUMN authority_payload_digest DROP NOT NULL,
				ALTER COLUMN authority_attestation_digest DROP NOT NULL,
				ALTER COLUMN evaluation_manifest_digest DROP NOT NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_one_human_review_lease
				ON agent_evaluation_export_leases(namespace_id, plan_digest, repository_commit)
				WHERE lease_kind = 'human-review'`,
		},
	}
}
