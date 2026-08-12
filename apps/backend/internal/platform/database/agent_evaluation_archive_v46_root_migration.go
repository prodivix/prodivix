package database

// agentEvaluationArchiveV46RootStatements hard-cuts new publication onto the
// 46-family authority/evidence root. Historical v45 rows remain readable as
// migration input, while every new base publication must install its v46 side
// row in the same transaction.
func agentEvaluationArchiveV46RootStatements() []string {
	return []string{
		`ALTER TABLE agent_evaluation_authority_attestations
			ADD COLUMN IF NOT EXISTS v46_eligible BOOLEAN`,
		`ALTER TABLE agent_evaluation_evidence_roots
			ADD COLUMN IF NOT EXISTS v46_eligible BOOLEAN`,
		`DROP TRIGGER IF EXISTS agent_evaluation_authority_attestations_immutable_mutation
			ON agent_evaluation_authority_attestations`,
		`DROP TRIGGER IF EXISTS agent_evaluation_evidence_roots_immutable_mutation
			ON agent_evaluation_evidence_roots`,
		`UPDATE agent_evaluation_authority_attestations
			SET v46_eligible=FALSE WHERE v46_eligible IS NULL`,
		`UPDATE agent_evaluation_evidence_roots
			SET v46_eligible=FALSE WHERE v46_eligible IS NULL`,
		`ALTER TABLE agent_evaluation_authority_attestations
			ALTER COLUMN v45_eligible SET DEFAULT FALSE,
			ALTER COLUMN v46_eligible SET DEFAULT TRUE,
			ALTER COLUMN v46_eligible SET NOT NULL`,
		`ALTER TABLE agent_evaluation_evidence_roots
			ALTER COLUMN v45_eligible SET DEFAULT FALSE,
			ALTER COLUMN v46_eligible SET DEFAULT TRUE,
			ALTER COLUMN v46_eligible SET NOT NULL`,
		`DROP TRIGGER IF EXISTS agent_evaluation_authority_attestations_v45_insert
			ON agent_evaluation_authority_attestations`,
		`DROP TRIGGER IF EXISTS agent_evaluation_evidence_roots_v45_insert
			ON agent_evaluation_evidence_roots`,
		`DROP TRIGGER IF EXISTS agent_evaluation_authority_attestations_v45_roots_required
			ON agent_evaluation_authority_attestations`,
		`DROP TRIGGER IF EXISTS agent_evaluation_evidence_roots_v45_roots_required
			ON agent_evaluation_evidence_roots`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_authority_attestation_v46_roots (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			attestation_digest TEXT NOT NULL,
			attempt_authority_owner_receipt_set_digest TEXT NOT NULL,
			provider_capability_observation_receipt_set_digest TEXT NOT NULL,
			capability_specific_receipt_set_digest TEXT NOT NULL,
			validated_human_metric_observation_set_digest TEXT NOT NULL,
			capability_probe_admission_set_digest TEXT NOT NULL,
			capability_probe_reference_receipt_set_digest TEXT NOT NULL,
			runtime_fact_source_owner_registration_set_digest TEXT NOT NULL,
			capability_probe_provider_resource_cleanup_set_digest TEXT NOT NULL,
			hosted_retrieval_runtime_resource_cleanup_set_digest TEXT NOT NULL,
			hosted_retrieval_runtime_resource_lifecycle_journal_set_digest TEXT NOT NULL,
			hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest TEXT NOT NULL,
			capability_effect_provider_runtime_journal_set_digest TEXT NOT NULL,
			optional_capability_fact_source_set_digest TEXT NOT NULL,
			optional_capability_fact_authority_set_digest TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id, plan_digest),
			UNIQUE (
				namespace_id, plan_digest, attestation_digest,
				attempt_authority_owner_receipt_set_digest,
				provider_capability_observation_receipt_set_digest,
				capability_specific_receipt_set_digest,
				validated_human_metric_observation_set_digest,
				capability_probe_admission_set_digest,
				capability_probe_reference_receipt_set_digest,
				runtime_fact_source_owner_registration_set_digest,
				capability_probe_provider_resource_cleanup_set_digest,
				hosted_retrieval_runtime_resource_cleanup_set_digest,
				hosted_retrieval_runtime_resource_lifecycle_journal_set_digest,
				hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest,
				capability_effect_provider_runtime_journal_set_digest,
				optional_capability_fact_source_set_digest,
				optional_capability_fact_authority_set_digest
			),
			FOREIGN KEY (namespace_id, plan_digest, attestation_digest)
				REFERENCES agent_evaluation_authority_attestations(
					namespace_id, plan_digest, attestation_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_evaluation_authority_attestation_v46_roots_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND attestation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND attempt_authority_owner_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND provider_capability_observation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_specific_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND validated_human_metric_observation_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_probe_admission_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_probe_reference_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND runtime_fact_source_owner_registration_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_probe_provider_resource_cleanup_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND hosted_retrieval_runtime_resource_cleanup_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND hosted_retrieval_runtime_resource_lifecycle_journal_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_effect_provider_runtime_journal_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND optional_capability_fact_source_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND optional_capability_fact_authority_set_digest ~ '^sha256-[a-f0-9]{64}$'
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_evidence_root_v46_roots (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			root_digest TEXT NOT NULL,
			authority_attestation_digest TEXT NOT NULL,
			attempt_authority_owner_receipt_set_digest TEXT NOT NULL,
			provider_capability_observation_receipt_set_digest TEXT NOT NULL,
			capability_specific_receipt_set_digest TEXT NOT NULL,
			validated_human_metric_observation_set_digest TEXT NOT NULL,
			capability_probe_admission_set_digest TEXT NOT NULL,
			capability_probe_reference_receipt_set_digest TEXT NOT NULL,
			runtime_fact_source_owner_registration_set_digest TEXT NOT NULL,
			capability_probe_provider_resource_cleanup_set_digest TEXT NOT NULL,
			hosted_retrieval_runtime_resource_cleanup_set_digest TEXT NOT NULL,
			hosted_retrieval_runtime_resource_lifecycle_journal_set_digest TEXT NOT NULL,
			hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest TEXT NOT NULL,
			capability_effect_provider_runtime_journal_set_digest TEXT NOT NULL,
			optional_capability_fact_source_set_digest TEXT NOT NULL,
			optional_capability_fact_authority_set_digest TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id, plan_digest),
			UNIQUE (
				namespace_id, plan_digest, root_digest, authority_attestation_digest,
				attempt_authority_owner_receipt_set_digest,
				provider_capability_observation_receipt_set_digest,
				capability_specific_receipt_set_digest,
				validated_human_metric_observation_set_digest,
				capability_probe_admission_set_digest,
				capability_probe_reference_receipt_set_digest,
				runtime_fact_source_owner_registration_set_digest,
				capability_probe_provider_resource_cleanup_set_digest,
				hosted_retrieval_runtime_resource_cleanup_set_digest,
				hosted_retrieval_runtime_resource_lifecycle_journal_set_digest,
				hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest,
				capability_effect_provider_runtime_journal_set_digest,
				optional_capability_fact_source_set_digest,
				optional_capability_fact_authority_set_digest
			),
			FOREIGN KEY (namespace_id, plan_digest, root_digest)
				REFERENCES agent_evaluation_evidence_roots(
					namespace_id, plan_digest, root_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (
				namespace_id, plan_digest, authority_attestation_digest,
				attempt_authority_owner_receipt_set_digest,
				provider_capability_observation_receipt_set_digest,
				capability_specific_receipt_set_digest,
				validated_human_metric_observation_set_digest,
				capability_probe_admission_set_digest,
				capability_probe_reference_receipt_set_digest,
				runtime_fact_source_owner_registration_set_digest,
				capability_probe_provider_resource_cleanup_set_digest,
				hosted_retrieval_runtime_resource_cleanup_set_digest,
				hosted_retrieval_runtime_resource_lifecycle_journal_set_digest,
				hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest,
				capability_effect_provider_runtime_journal_set_digest,
				optional_capability_fact_source_set_digest,
				optional_capability_fact_authority_set_digest
			) REFERENCES agent_evaluation_authority_attestation_v46_roots(
				namespace_id, plan_digest, attestation_digest,
				attempt_authority_owner_receipt_set_digest,
				provider_capability_observation_receipt_set_digest,
				capability_specific_receipt_set_digest,
				validated_human_metric_observation_set_digest,
				capability_probe_admission_set_digest,
				capability_probe_reference_receipt_set_digest,
				runtime_fact_source_owner_registration_set_digest,
				capability_probe_provider_resource_cleanup_set_digest,
				hosted_retrieval_runtime_resource_cleanup_set_digest,
				hosted_retrieval_runtime_resource_lifecycle_journal_set_digest,
				hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest,
				capability_effect_provider_runtime_journal_set_digest,
				optional_capability_fact_source_set_digest,
				optional_capability_fact_authority_set_digest
			) ON DELETE RESTRICT,
			CONSTRAINT agent_evaluation_evidence_root_v46_roots_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND root_digest ~ '^sha256-[a-f0-9]{64}$'
				AND authority_attestation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND attempt_authority_owner_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND provider_capability_observation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_specific_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND validated_human_metric_observation_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_probe_admission_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_probe_reference_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND runtime_fact_source_owner_registration_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_probe_provider_resource_cleanup_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND hosted_retrieval_runtime_resource_cleanup_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND hosted_retrieval_runtime_resource_lifecycle_journal_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_effect_provider_runtime_journal_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND optional_capability_fact_source_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND optional_capability_fact_authority_set_digest ~ '^sha256-[a-f0-9]{64}$'
			)
		)`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_v46_publication_insert()
			RETURNS trigger AS $$
		BEGIN
			IF NEW.v46_eligible IS DISTINCT FROM TRUE
				OR NEW.v45_eligible IS DISTINCT FROM FALSE THEN
				RAISE EXCEPTION 'new evaluation publication must use v46 authority'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_authority_attestations_v46_insert
			BEFORE INSERT ON agent_evaluation_authority_attestations
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_v46_publication_insert()`,
		`CREATE TRIGGER agent_evaluation_evidence_roots_v46_insert
			BEFORE INSERT ON agent_evaluation_evidence_roots
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_v46_publication_insert()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_attestation_v46_roots_binding()
			RETURNS trigger AS $$
		DECLARE
			base_v45_eligible BOOLEAN;
			base_v46_eligible BOOLEAN;
			base_issued_at TIMESTAMPTZ;
		BEGIN
			SELECT v45_eligible,v46_eligible,issued_at
			INTO base_v45_eligible,base_v46_eligible,base_issued_at
			FROM agent_evaluation_authority_attestations
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND attestation_digest=NEW.attestation_digest
			FOR SHARE;
			IF NOT FOUND OR base_v45_eligible IS DISTINCT FROM FALSE
				OR base_v46_eligible IS DISTINCT FROM TRUE
				OR base_issued_at IS DISTINCT FROM NEW.created_at THEN
				RAISE EXCEPTION 'evaluation attestation v46 roots drifted from current authority'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_attestation_v46_roots_exact_binding
			BEFORE INSERT ON agent_evaluation_authority_attestation_v46_roots
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_attestation_v46_roots_binding()`,
		`CREATE TRIGGER agent_evaluation_attestation_v46_roots_immutable_mutation
			BEFORE UPDATE OR DELETE ON agent_evaluation_authority_attestation_v46_roots
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_evidence_root_v46_roots_binding()
			RETURNS trigger AS $$
		DECLARE
			base_v45_eligible BOOLEAN;
			base_v46_eligible BOOLEAN;
			base_recorded_at TIMESTAMPTZ;
		BEGIN
			SELECT v45_eligible,v46_eligible,recorded_at
			INTO base_v45_eligible,base_v46_eligible,base_recorded_at
			FROM agent_evaluation_evidence_roots
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND root_digest=NEW.root_digest
			FOR SHARE;
			IF NOT FOUND OR base_v45_eligible IS DISTINCT FROM FALSE
				OR base_v46_eligible IS DISTINCT FROM TRUE
				OR base_recorded_at IS DISTINCT FROM NEW.created_at THEN
				RAISE EXCEPTION 'evaluation evidence-root v46 roots drifted from current authority'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_evidence_root_v46_roots_exact_binding
			BEFORE INSERT ON agent_evaluation_evidence_root_v46_roots
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_evidence_root_v46_roots_binding()`,
		`CREATE TRIGGER agent_evaluation_evidence_root_v46_roots_immutable_mutation
			BEFORE UPDATE OR DELETE ON agent_evaluation_evidence_root_v46_roots
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_attestation_v46_roots()
			RETURNS trigger AS $$
		BEGIN
			IF NEW.v46_eligible AND NOT EXISTS (
				SELECT 1 FROM agent_evaluation_authority_attestation_v46_roots
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND attestation_digest=NEW.attestation_digest
			) THEN
				RAISE EXCEPTION 'current evaluation attestation lacks v46 authority roots'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_evaluation_authority_attestations_v46_roots_required
			AFTER INSERT ON agent_evaluation_authority_attestations
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_attestation_v46_roots()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_evidence_root_v46_roots()
			RETURNS trigger AS $$
		BEGIN
			IF NEW.v46_eligible AND NOT EXISTS (
				SELECT 1 FROM agent_evaluation_evidence_root_v46_roots
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND root_digest=NEW.root_digest
			) THEN
				RAISE EXCEPTION 'current evaluation evidence root lacks v46 authority roots'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_evaluation_evidence_roots_v46_roots_required
			AFTER INSERT ON agent_evaluation_evidence_roots
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_evidence_root_v46_roots()`,
		`CREATE TRIGGER agent_evaluation_authority_attestations_immutable_mutation
			BEFORE UPDATE OR DELETE ON agent_evaluation_authority_attestations
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_evaluation_evidence_roots_immutable_mutation
			BEFORE UPDATE OR DELETE ON agent_evaluation_evidence_roots
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}
}
