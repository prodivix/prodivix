package database

func verificationEvidenceMigration() migration {
	return migration{
		version: 19,
		name:    "verification-evidence-plane",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS verification_attempt_grants (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				project_id TEXT NOT NULL,
				workspace_revision BIGINT NOT NULL,
				partition_revisions_digest TEXT NOT NULL,
				policy_revision BIGINT NOT NULL,
				policy_digest TEXT NOT NULL,
				policy_evaluation_instant TIMESTAMPTZ NOT NULL,
				impact_digest TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				plan_json JSONB NOT NULL,
				plan_bytes BYTEA NOT NULL,
				cell_id TEXT NOT NULL,
				check_id TEXT NOT NULL,
				check_kind TEXT NOT NULL,
				target_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				run_id TEXT NOT NULL,
				provider_id TEXT NOT NULL,
				job_id TEXT,
				session_id TEXT,
				producer_id TEXT NOT NULL,
				trust_ceiling TEXT NOT NULL,
				successful_retention_class TEXT NOT NULL,
				failed_retention_class TEXT NOT NULL,
				protect_release_evidence BOOLEAN NOT NULL,
				maximum_closure_evidence_records INTEGER NOT NULL,
				grant_digest TEXT NOT NULL UNIQUE,
				issued_by TEXT NOT NULL,
				issued_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				CONSTRAINT verification_attempt_grants_revision_check CHECK (
					workspace_revision BETWEEN 0 AND 9007199254740991
					AND policy_revision BETWEEN 0 AND 9007199254740991
				),
				CONSTRAINT verification_attempt_grants_digest_check CHECK (
					partition_revisions_digest ~ '^sha256-[a-f0-9]{64}$'
					AND policy_digest ~ '^sha256-[a-f0-9]{64}$'
					AND impact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND grant_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_attempt_grants_check_kind_check CHECK (
					check_kind IN ('diagnostics', 'build', 'unit', 'integration', 'e2e', 'visual', 'accessibility', 'performance', 'security')
				),
				CONSTRAINT verification_attempt_grants_trust_check CHECK (
					trust_ceiling IN ('local-unattested', 'remote-attested', 'ci-attested', 'imported-untrusted')
				),
				CONSTRAINT verification_attempt_grants_retention_check CHECK (
					successful_retention_class IN ('session', 'change', 'release')
					AND failed_retention_class IN ('session', 'change', 'release')
				),
				CONSTRAINT verification_attempt_grants_closure_evidence_budget_check CHECK (
					maximum_closure_evidence_records BETWEEN 1 AND 1000
				),
				CONSTRAINT verification_attempt_grants_expiry_check CHECK (
					expires_at > issued_at
				),
				UNIQUE (workspace_id, plan_digest, cell_id, attempt_id)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_attempt_grants_expiry
				ON verification_attempt_grants(expires_at, workspace_id)`,
			`CREATE TABLE IF NOT EXISTS verification_promotions (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				project_id TEXT NOT NULL,
				candidate_id TEXT NOT NULL,
				candidate_digest TEXT NOT NULL,
				idempotency_key_hash TEXT NOT NULL,
				capability_hash TEXT NOT NULL,
				nonce_hash TEXT,
				actor_id TEXT NOT NULL,
				state TEXT NOT NULL,
				requested_trust TEXT NOT NULL,
				retention_class TEXT NOT NULL,
				maximum_closure_evidence_records INTEGER NOT NULL,
				evidence_id TEXT NOT NULL,
				evidence_created_at TIMESTAMPTZ NOT NULL,
				candidate_json JSONB NOT NULL,
				candidate_bytes BYTEA NOT NULL,
				attempt_grant_id TEXT NOT NULL REFERENCES verification_attempt_grants(id) ON DELETE RESTRICT,
				attempt_grant_digest TEXT NOT NULL,
				protect_release_evidence BOOLEAN NOT NULL,
				attestation_statement_bytes BYTEA,
				attestation_statement_digest TEXT,
				manifest_digest TEXT,
				failure_code TEXT,
				deadline TIMESTAMPTZ NOT NULL,
				version BIGINT NOT NULL DEFAULT 1,
				created_at TIMESTAMPTZ NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL,
				CONSTRAINT verification_promotions_candidate_digest_check CHECK (candidate_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT verification_promotions_attempt_grant_digest_check CHECK (attempt_grant_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT verification_promotions_idempotency_hash_check CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
				CONSTRAINT verification_promotions_capability_hash_check CHECK (capability_hash ~ '^[a-f0-9]{64}$'),
				CONSTRAINT verification_promotions_nonce_hash_check CHECK (nonce_hash IS NULL OR nonce_hash ~ '^[a-f0-9]{64}$'),
				CONSTRAINT verification_promotions_state_check CHECK (state IN ('staging', 'verification-pending', 'finalizing', 'committed', 'failed')),
				CONSTRAINT verification_promotions_trust_check CHECK (requested_trust IN ('local-unattested', 'remote-attested', 'ci-attested', 'imported-untrusted')),
				CONSTRAINT verification_promotions_retention_check CHECK (retention_class IN ('session', 'change', 'release')),
				CONSTRAINT verification_promotions_closure_evidence_budget_check CHECK (maximum_closure_evidence_records BETWEEN 1 AND 1000),
				CONSTRAINT verification_promotions_manifest_digest_check CHECK (manifest_digest IS NULL OR manifest_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT verification_promotions_statement_digest_check CHECK (attestation_statement_digest IS NULL OR attestation_statement_digest ~ '^sha256-[a-f0-9]{64}$'),
				CONSTRAINT verification_promotions_version_check CHECK (version >= 1),
				CONSTRAINT verification_promotions_deadline_check CHECK (deadline > created_at),
				CONSTRAINT verification_promotions_state_payload_check CHECK (
					(state = 'staging' AND manifest_digest IS NULL AND failure_code IS NULL)
					OR (state = 'verification-pending'
						AND nonce_hash IS NOT NULL
						AND attestation_statement_bytes IS NOT NULL
						AND attestation_statement_digest IS NOT NULL
						AND manifest_digest IS NULL AND failure_code IS NULL)
					OR (state = 'finalizing' AND manifest_digest IS NULL AND failure_code IS NULL)
					OR (state = 'committed' AND manifest_digest IS NOT NULL AND failure_code IS NULL)
					OR (state = 'failed' AND manifest_digest IS NULL AND failure_code IS NOT NULL)
				),
				UNIQUE (workspace_id, candidate_id),
				UNIQUE (workspace_id, idempotency_key_hash),
				UNIQUE (workspace_id, evidence_id)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_promotions_deadline
				ON verification_promotions(deadline)
				WHERE state IN ('staging', 'verification-pending', 'failed')`,
			`CREATE TABLE IF NOT EXISTS verification_attempt_grant_claims (
				grant_id TEXT PRIMARY KEY REFERENCES verification_attempt_grants(id) ON DELETE RESTRICT,
				promotion_id TEXT NOT NULL UNIQUE REFERENCES verification_promotions(id) ON DELETE RESTRICT,
				candidate_digest TEXT NOT NULL,
				claimed_at TIMESTAMPTZ NOT NULL,
				CONSTRAINT verification_attempt_grant_claims_candidate_digest_check CHECK (
					candidate_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`CREATE TABLE IF NOT EXISTS verification_promotion_artifacts (
				promotion_id TEXT NOT NULL REFERENCES verification_promotions(id) ON DELETE CASCADE,
				artifact_id TEXT NOT NULL,
				logical_path TEXT NOT NULL,
				kind TEXT NOT NULL,
				source_trace_digest TEXT,
				expected_digest TEXT NOT NULL,
				expected_size BIGINT NOT NULL,
				expected_media_type TEXT NOT NULL,
				staging_locator TEXT,
				observed_digest TEXT,
				observed_size BIGINT,
				observed_media_type TEXT,
				scan_state TEXT NOT NULL DEFAULT 'pending',
				uploaded_at TIMESTAMPTZ,
				PRIMARY KEY (promotion_id, artifact_id),
				UNIQUE (promotion_id, logical_path),
				CONSTRAINT verification_promotion_artifacts_digest_check CHECK (
					expected_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (observed_digest IS NULL OR observed_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT verification_promotion_artifacts_source_trace_digest_check CHECK (
					source_trace_digest IS NULL
					OR source_trace_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_promotion_artifacts_size_check CHECK (
					expected_size BETWEEN 0 AND 16777216
					AND (observed_size IS NULL OR observed_size BETWEEN 0 AND 16777216)
				),
				CONSTRAINT verification_promotion_artifacts_scan_check CHECK (scan_state IN ('pending', 'accepted', 'rejected'))
			)`,
			`ALTER TABLE verification_promotion_artifacts
				ADD COLUMN IF NOT EXISTS source_trace_digest TEXT,
				DROP CONSTRAINT IF EXISTS verification_promotion_artifacts_source_trace_digest_check,
				ADD CONSTRAINT verification_promotion_artifacts_source_trace_digest_check CHECK (
					source_trace_digest IS NULL
					OR source_trace_digest ~ '^sha256-[a-f0-9]{64}$'
				)`,
			`CREATE TABLE IF NOT EXISTS verification_artifacts (
				workspace_id TEXT NOT NULL,
				digest TEXT NOT NULL,
				byte_length BIGINT NOT NULL,
				store_locator TEXT NOT NULL,
				scanner_version TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (workspace_id, digest),
				CONSTRAINT verification_artifacts_digest_check CHECK (
					digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_artifacts_size_check CHECK (byte_length BETWEEN 0 AND 16777216)
			)`,
			`CREATE TABLE IF NOT EXISTS verification_artifact_operation_leases (
				locator TEXT PRIMARY KEY,
				mode TEXT NOT NULL,
				token TEXT NOT NULL UNIQUE,
				owner_id TEXT NOT NULL,
				workspace_id TEXT,
				digest TEXT,
				acquired_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				CONSTRAINT verification_artifact_operation_leases_mode_check CHECK (
					mode IN ('promotion', 'deletion')
				),
				CONSTRAINT verification_artifact_operation_leases_token_check CHECK (
					token ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_artifact_operation_leases_digest_check CHECK (
					digest IS NULL OR digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_artifact_operation_leases_identity_check CHECK (
					(workspace_id IS NULL AND digest IS NULL)
					OR (workspace_id IS NOT NULL AND digest IS NOT NULL)
				),
				CONSTRAINT verification_artifact_operation_leases_time_check CHECK (
					expires_at > acquired_at
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_artifact_operation_leases_expiry
				ON verification_artifact_operation_leases(expires_at, locator)`,
			`CREATE TABLE IF NOT EXISTS verification_evidence (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				project_id TEXT NOT NULL,
				workspace_revision BIGINT NOT NULL,
				policy_revision BIGINT NOT NULL,
				plan_digest TEXT NOT NULL,
				impact_digest TEXT NOT NULL,
				cell_id TEXT NOT NULL,
				check_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				outcome TEXT NOT NULL,
				trust_class TEXT NOT NULL,
				retention_class TEXT NOT NULL,
				expires_at TIMESTAMPTZ,
				manifest_digest TEXT NOT NULL UNIQUE,
				manifest_json JSONB NOT NULL,
				manifest_bytes BYTEA NOT NULL,
				created_by TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				CONSTRAINT verification_evidence_revision_check CHECK (
					workspace_revision BETWEEN 0 AND 9007199254740991
					AND policy_revision BETWEEN 0 AND 9007199254740991
				),
				CONSTRAINT verification_evidence_digest_check CHECK (
					manifest_digest ~ '^sha256-[a-f0-9]{64}$'
					AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND impact_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_evidence_outcome_check CHECK (outcome IN ('passed', 'failed', 'blocked', 'cancelled', 'infrastructure-error')),
				CONSTRAINT verification_evidence_trust_check CHECK (trust_class IN ('local-unattested', 'remote-attested', 'ci-attested', 'imported-untrusted')),
				CONSTRAINT verification_evidence_retention_check CHECK (retention_class IN ('session', 'change', 'release')),
				CONSTRAINT verification_evidence_expiry_check CHECK (
					(retention_class = 'session' AND expires_at IS NOT NULL AND expires_at > created_at)
					OR (retention_class IN ('change', 'release') AND expires_at IS NULL)
				),
				UNIQUE (workspace_id, plan_digest, cell_id, attempt_id)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_evidence_workspace_created
				ON verification_evidence(workspace_id, created_at DESC, id DESC)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_evidence_closure
				ON verification_evidence(workspace_id, workspace_revision, plan_digest, cell_id, created_at DESC)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_evidence_expiry
				ON verification_evidence(expires_at)
				WHERE expires_at IS NOT NULL`,
			`CREATE TABLE IF NOT EXISTS verification_evidence_artifacts (
				evidence_id TEXT NOT NULL REFERENCES verification_evidence(id) ON DELETE RESTRICT,
				workspace_id TEXT NOT NULL,
				artifact_id TEXT NOT NULL,
				artifact_digest TEXT NOT NULL,
				logical_path TEXT NOT NULL,
				kind TEXT NOT NULL,
				normalized_digest TEXT,
				source_trace_digest TEXT,
				byte_length BIGINT NOT NULL,
				media_type TEXT NOT NULL,
				PRIMARY KEY (evidence_id, artifact_id),
				UNIQUE (evidence_id, logical_path),
				CONSTRAINT verification_evidence_artifacts_digest_check CHECK (
					artifact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (normalized_digest IS NULL OR normalized_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_trace_digest IS NULL OR source_trace_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT verification_evidence_artifacts_size_check CHECK (
					byte_length BETWEEN 0 AND 16777216
				),
				FOREIGN KEY (workspace_id, artifact_digest)
					REFERENCES verification_artifacts(workspace_id, digest) ON DELETE RESTRICT
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_evidence_artifact_digest
				ON verification_evidence_artifacts(workspace_id, artifact_digest)`,
			`CREATE TABLE IF NOT EXISTS verification_attestations (
				evidence_id TEXT PRIMARY KEY REFERENCES verification_evidence(id) ON DELETE RESTRICT,
				trust_class TEXT NOT NULL,
				statement_digest TEXT NOT NULL,
				attestation_digest TEXT NOT NULL UNIQUE,
				proof_digest TEXT NOT NULL UNIQUE,
				nonce_digest TEXT NOT NULL,
				replay_key TEXT NOT NULL UNIQUE,
				issuer TEXT NOT NULL,
				audience TEXT NOT NULL,
				subject TEXT NOT NULL,
				key_id TEXT NOT NULL,
				verifier_id TEXT NOT NULL,
				issued_at TIMESTAMPTZ NOT NULL,
				not_before TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				verified_at TIMESTAMPTZ NOT NULL,
				claims_json JSONB NOT NULL,
				claims_bytes BYTEA NOT NULL,
				CONSTRAINT verification_attestations_digest_check CHECK (
					statement_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attestation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND proof_digest ~ '^sha256-[a-f0-9]{64}$'
					AND nonce_digest ~ '^sha256-[a-f0-9]{64}$'
					AND replay_key ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_attestations_trust_check CHECK (trust_class IN ('remote-attested', 'ci-attested')),
				CONSTRAINT verification_attestations_time_check CHECK (issued_at <= not_before AND not_before < expires_at)
			)`,
			`CREATE TABLE IF NOT EXISTS verification_supersessions (
				old_evidence_id TEXT NOT NULL REFERENCES verification_evidence(id) ON DELETE RESTRICT,
				new_evidence_id TEXT NOT NULL REFERENCES verification_evidence(id) ON DELETE RESTRICT,
				workspace_id TEXT NOT NULL,
				reason TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (old_evidence_id, new_evidence_id),
				UNIQUE (old_evidence_id),
				CONSTRAINT verification_supersessions_distinct_check CHECK (old_evidence_id <> new_evidence_id)
			)`,
			`CREATE TABLE IF NOT EXISTS verification_trust_revocations (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				evidence_id TEXT,
				issuer TEXT,
				key_id TEXT,
				reason_code TEXT NOT NULL,
				reason TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				effective_at TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				record_digest TEXT NOT NULL UNIQUE,
				record_json JSONB NOT NULL,
				record_bytes BYTEA NOT NULL,
				CONSTRAINT verification_trust_revocations_digest_check CHECK (
					record_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_trust_revocations_scope_check CHECK (
					(evidence_id IS NOT NULL AND issuer IS NULL AND key_id IS NULL)
					OR (evidence_id IS NULL AND issuer IS NOT NULL AND key_id IS NULL)
					OR (evidence_id IS NULL AND issuer IS NOT NULL AND key_id IS NOT NULL)
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_revocations_workspace
				ON verification_trust_revocations(workspace_id, effective_at DESC)`,
			`CREATE TABLE IF NOT EXISTS verification_retention_protections (
				id TEXT PRIMARY KEY,
				evidence_id TEXT NOT NULL REFERENCES verification_evidence(id) ON DELETE RESTRICT,
				workspace_id TEXT NOT NULL,
				kind TEXT NOT NULL,
				external_ref TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				active BOOLEAN NOT NULL DEFAULT TRUE,
				version BIGINT NOT NULL DEFAULT 1,
				created_at TIMESTAMPTZ NOT NULL,
				released_at TIMESTAMPTZ,
				CONSTRAINT verification_retention_protections_kind_check CHECK (kind IN ('change', 'release', 'legal-hold')),
				CONSTRAINT verification_retention_protections_version_check CHECK (version >= 1),
				CONSTRAINT verification_retention_protections_state_check CHECK (
					(active AND released_at IS NULL) OR (NOT active AND released_at IS NOT NULL)
				),
				UNIQUE (evidence_id, kind, external_ref)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_active_protections
				ON verification_retention_protections(evidence_id)
				WHERE active`,
			`CREATE TABLE IF NOT EXISTS verification_tombstones (
				evidence_id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				project_id TEXT NOT NULL,
				manifest_digest TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				cell_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				reason TEXT NOT NULL,
				actor_id TEXT NOT NULL,
				deleted_at TIMESTAMPTZ NOT NULL,
				purge_after TIMESTAMPTZ NOT NULL,
				purged_at TIMESTAMPTZ,
				version BIGINT NOT NULL DEFAULT 1,
				CONSTRAINT verification_tombstones_digest_check CHECK (
					manifest_digest ~ '^sha256-[a-f0-9]{64}$' AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT verification_tombstones_time_check CHECK (
					purge_after >= deleted_at AND (purged_at IS NULL OR purged_at >= deleted_at)
				),
				CONSTRAINT verification_tombstones_version_check CHECK (version >= 1)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_tombstones_purge
				ON verification_tombstones(purge_after)
				WHERE purged_at IS NULL`,
			`CREATE TABLE IF NOT EXISTS verification_audit_events (
				id BIGSERIAL PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				evidence_id TEXT,
				promotion_id TEXT,
				actor_id TEXT NOT NULL,
				kind TEXT NOT NULL,
				details_json JSONB NOT NULL,
				occurred_at TIMESTAMPTZ NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS idx_verification_audit_workspace
				ON verification_audit_events(workspace_id, occurred_at DESC, id DESC)`,
			`CREATE OR REPLACE FUNCTION reject_verification_immutable_mutation()
				RETURNS trigger
				LANGUAGE plpgsql
				AS $$
				BEGIN
					RAISE EXCEPTION 'verification immutable row cannot be modified';
				END;
				$$`,
			`DROP TRIGGER IF EXISTS verification_evidence_immutable_update ON verification_evidence`,
			`CREATE TRIGGER verification_evidence_immutable_update
				BEFORE UPDATE OR DELETE ON verification_evidence
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS verification_attempt_grants_immutable_mutation ON verification_attempt_grants`,
			`CREATE TRIGGER verification_attempt_grants_immutable_mutation
				BEFORE UPDATE OR DELETE ON verification_attempt_grants
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS verification_attempt_grant_claims_immutable_mutation ON verification_attempt_grant_claims`,
			`CREATE TRIGGER verification_attempt_grant_claims_immutable_mutation
				BEFORE UPDATE OR DELETE ON verification_attempt_grant_claims
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
			`CREATE OR REPLACE FUNCTION guard_verification_evidence_artifact_mutation()
				RETURNS trigger
				LANGUAGE plpgsql
				AS $$
				BEGIN
					IF TG_OP = 'UPDATE' OR NOT EXISTS (
						SELECT 1
						FROM verification_tombstones t
						WHERE t.evidence_id = OLD.evidence_id
							AND t.purged_at IS NOT NULL
					) THEN
						RAISE EXCEPTION 'verification Evidence artifact relation cannot be modified';
					END IF;
					RETURN OLD;
				END;
				$$`,
			`DROP TRIGGER IF EXISTS verification_evidence_artifacts_guard ON verification_evidence_artifacts`,
			`CREATE TRIGGER verification_evidence_artifacts_guard
				BEFORE UPDATE OR DELETE ON verification_evidence_artifacts
				FOR EACH ROW EXECUTE FUNCTION guard_verification_evidence_artifact_mutation()`,
			`DROP TRIGGER IF EXISTS verification_attestations_immutable_mutation ON verification_attestations`,
			`CREATE TRIGGER verification_attestations_immutable_mutation
				BEFORE UPDATE OR DELETE ON verification_attestations
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS verification_supersessions_immutable_mutation ON verification_supersessions`,
			`CREATE TRIGGER verification_supersessions_immutable_mutation
				BEFORE UPDATE OR DELETE ON verification_supersessions
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS verification_revocations_immutable_mutation ON verification_trust_revocations`,
			`CREATE TRIGGER verification_revocations_immutable_mutation
				BEFORE UPDATE OR DELETE ON verification_trust_revocations
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
			`DROP TRIGGER IF EXISTS verification_audit_immutable_mutation ON verification_audit_events`,
			`CREATE TRIGGER verification_audit_immutable_mutation
				BEFORE UPDATE OR DELETE ON verification_audit_events
				FOR EACH ROW EXECUTE FUNCTION reject_verification_immutable_mutation()`,
		},
	}
}
