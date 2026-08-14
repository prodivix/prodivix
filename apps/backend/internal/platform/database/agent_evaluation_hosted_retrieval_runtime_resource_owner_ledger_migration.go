package database

// agentEvaluationHostedRetrievalRuntimeResourceOwnerLedgerStatements installs
// the namespace-scoped monotonic revision consumed by preactivation health.
// Read-lease expiry changes health counts through the caller's checkedAt and
// never mutates or decrements this ledger.
func agentEvaluationHostedRetrievalRuntimeResourceOwnerLedgerStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS ae_hrrr_owner_ledgers (
			namespace_id TEXT PRIMARY KEY,
			ledger_revision BIGINT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			CONSTRAINT agent_eval_hosted_runtime_owner_ledger_revision_check
				CHECK (ledger_revision>=1)
		)`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_owner_ledger_monotonic()
			RETURNS trigger AS $$
		BEGIN
			IF TG_OP='DELETE' THEN
				RAISE EXCEPTION 'hosted runtime owner ledger is non-monotonic'
					USING ERRCODE='23514';
			ELSIF TG_OP='INSERT' THEN
				IF NEW.ledger_revision<>1 THEN
					RAISE EXCEPTION 'hosted runtime owner ledger is non-monotonic'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.namespace_id<>OLD.namespace_id
				OR NEW.ledger_revision<>OLD.ledger_revision+1
				OR NEW.updated_at<OLD.updated_at THEN
				RAISE EXCEPTION 'hosted runtime owner ledger is non-monotonic'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='DELETE' THEN RETURN OLD; END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_owner_ledger_monotonic
			BEFORE INSERT OR UPDATE OR DELETE
			ON ae_hrrr_owner_ledgers
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_owner_ledger_monotonic()`,
		`INSERT INTO ae_hrrr_owner_ledgers(
			namespace_id,ledger_revision,updated_at
		)
		SELECT namespace_id,1,MAX(planned_at)
		FROM agent_evaluation_plans
		GROUP BY namespace_id
		ON CONFLICT (namespace_id) DO NOTHING`,
		`CREATE OR REPLACE FUNCTION ensure_agent_evaluation_hosted_runtime_owner_ledger()
			RETURNS trigger AS $$
		BEGIN
			INSERT INTO ae_hrrr_owner_ledgers(
				namespace_id,ledger_revision,updated_at
			) VALUES (NEW.namespace_id,1,NEW.planned_at)
			ON CONFLICT (namespace_id) DO NOTHING;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_plans_hosted_runtime_owner_ledger
			AFTER INSERT ON agent_evaluation_plans
			FOR EACH ROW EXECUTE FUNCTION ensure_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE OR REPLACE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()
			RETURNS trigger AS $$
		DECLARE
			candidate_namespace_id TEXT;
		BEGIN
			candidate_namespace_id:=CASE WHEN TG_OP='DELETE' THEN OLD.namespace_id ELSE NEW.namespace_id END;
			INSERT INTO ae_hrrr_owner_ledgers(
				namespace_id,ledger_revision,updated_at
			) VALUES (candidate_namespace_id,1,clock_timestamp())
			ON CONFLICT (namespace_id) DO UPDATE SET
				ledger_revision=
					ae_hrrr_owner_ledgers.ledger_revision+1,
				updated_at=EXCLUDED.updated_at;
			IF TG_OP='DELETE' THEN RETURN OLD; END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_owner_revision
			AFTER INSERT ON ae_hrrr_registration_results
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_stage_owner_revision
			AFTER INSERT ON ae_hrrr_registration_requests
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_set_owner_revision
			AFTER INSERT ON ae_hrrr_sets
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_resource_owner_revision
			AFTER INSERT OR UPDATE ON agent_evaluation_hosted_retrieval_runtime_resources
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_read_owner_revision
			AFTER INSERT ON ae_hrrr_read_receipts
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_read_root_owner_revision
			AFTER INSERT ON ae_hrrr_read_lease_ledger_roots
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_overdue_owner_revision
			AFTER INSERT ON ae_hrrr_overdue_receipts
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_owner_revision
			AFTER INSERT ON ae_hrrr_run_terminal_fences
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_derive_request_owner_revision
			AFTER INSERT ON ae_hrrr_terminal_fence_derive_requests
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_derive_receipt_owner_revision
			AFTER INSERT ON ae_hrrr_terminal_fence_derive_receipts
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_post_matrix_claim_request_owner_revision
			AFTER INSERT ON ae_hrrr_post_matrix_cleanup_claim_requests
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_claim_owner_revision
			AFTER INSERT ON ae_hrrr_cleanup_claims
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_claim_receipt_owner_revision
			AFTER INSERT ON ae_hrrr_cleanup_claim_receipts
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_request_owner_revision
			AFTER INSERT ON ae_hrrr_cleanup_requests
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_owner_revision
			AFTER INSERT ON ae_hrrr_cleanups
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_archive_owner_revision
			AFTER INSERT ON ae_hrrr_cleanup_archives
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lookup_request_owner_revision
			AFTER INSERT ON ae_hrrr_registration_set_lookup_requests
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lookup_receipt_owner_revision
			AFTER INSERT ON ae_hrrr_registration_set_lookup_receipts
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_scan_owner_revision
			AFTER INSERT ON ae_hrrr_recovery_scan_requests
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_snapshot_owner_revision
			AFTER INSERT ON ae_hrrr_recovery_scan_snapshots
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_page_owner_revision
			AFTER INSERT ON ae_hrrr_recovery_pages
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_claim_request_owner_revision
			AFTER INSERT ON ae_hrrr_recovery_claim_requests
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_result_read_request_owner_revision
			AFTER INSERT ON ae_hrrr_cleanup_result_read_requests
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_result_read_receipt_owner_revision
			AFTER INSERT ON ae_hrrr_cleanup_result_read_receipts
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_resources_health
			ON agent_evaluation_hosted_retrieval_runtime_resources(
				namespace_id,lifecycle,read_lease_not_after,resource_expires_at
			)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_cleanup_claim_receipts_health
			ON ae_hrrr_cleanup_claim_receipts(
				namespace_id,claim_expires_at,authority_digest
			)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_registration_results_health
			ON ae_hrrr_registration_results(
				namespace_id,expires_at,plan_digest,repository_commit,registration_request_digest
			)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_hosted_runtime_resources_registration
			ON agent_evaluation_hosted_retrieval_runtime_resources(
				namespace_id,plan_digest,repository_commit,registration_request_digest
			)`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_resource_owner_storage_summary(
			candidate_namespace_id TEXT,
			candidate_summarized_at TIMESTAMPTZ
		) RETURNS TABLE (
			ledger_revision BIGINT,
			registration_count BIGINT,
			active_resource_count BIGINT,
			active_read_lease_count BIGINT,
			unfinished_cleanup_count BIGINT,
			overdue_count BIGINT
		) LANGUAGE sql STABLE PARALLEL RESTRICTED AS $$
			SELECT ledger.ledger_revision,
				(SELECT COUNT(*)
				 FROM ae_hrrr_registration_results registration
				 WHERE registration.namespace_id=candidate_namespace_id),
				(SELECT COUNT(*)
				 FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				 WHERE resource.namespace_id=candidate_namespace_id
					AND resource.lifecycle='active'),
				(SELECT COUNT(*)
				 FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				 WHERE resource.namespace_id=candidate_namespace_id
					AND resource.lifecycle='active'
					AND resource.read_lease_not_after>candidate_summarized_at),
				((SELECT COUNT(*)
				  FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				  WHERE resource.namespace_id=candidate_namespace_id
					 AND (
						 resource.lifecycle='cleanup-in-progress'
						 OR (resource.lifecycle='cleaned' AND NOT EXISTS (
							 SELECT 1
							 FROM ae_hrrr_registration_results registration
							 JOIN agent_evaluation_budget_settlements settlement
							   ON settlement.namespace_id=registration.namespace_id
							  AND settlement.plan_digest=registration.plan_digest
							  AND settlement.reservation_id=registration.budget_reservation_id
							 WHERE registration.namespace_id=resource.namespace_id
								 AND registration.plan_digest=resource.plan_digest
								 AND registration.repository_commit=resource.repository_commit
								 AND registration.registration_request_digest=
									 resource.registration_request_digest
						 ))
					 ))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_registration_results registration
					WHERE registration.namespace_id=candidate_namespace_id
					  AND NOT EXISTS (
						  SELECT 1
						  FROM agent_evaluation_hosted_retrieval_runtime_resources resource
						  WHERE resource.namespace_id=registration.namespace_id
							AND resource.plan_digest=registration.plan_digest
							AND resource.repository_commit=registration.repository_commit
							AND resource.registration_request_digest=
								registration.registration_request_digest
					  ))),
				((SELECT COUNT(*)
				  FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				  WHERE resource.namespace_id=candidate_namespace_id
					 AND resource.lifecycle<>'cleaned'
					 AND (
						 resource.resource_expires_at<candidate_summarized_at
						 OR (resource.lifecycle='cleanup-in-progress' AND EXISTS (
							 SELECT 1
							 FROM ae_hrrr_cleanup_claim_receipts claim
							 WHERE claim.namespace_id=resource.namespace_id
								 AND claim.plan_digest=resource.plan_digest
								 AND claim.repository_commit=resource.repository_commit
								 AND claim.authority_digest=resource.authority_digest
								 AND claim.claim_expires_at<candidate_summarized_at
						 ))
					 )
				 )
				 + (SELECT COUNT(*)
					FROM ae_hrrr_registration_results registration
					WHERE registration.namespace_id=candidate_namespace_id
					  AND registration.expires_at<candidate_summarized_at
					  AND NOT EXISTS (
						  SELECT 1
						  FROM agent_evaluation_hosted_retrieval_runtime_resources resource
						  WHERE resource.namespace_id=registration.namespace_id
							AND resource.plan_digest=registration.plan_digest
							AND resource.repository_commit=registration.repository_commit
							AND resource.registration_request_digest=
								registration.registration_request_digest
					  )))
			FROM ae_hrrr_owner_ledgers ledger
			WHERE ledger.namespace_id=candidate_namespace_id
		$$`,
	}
}
