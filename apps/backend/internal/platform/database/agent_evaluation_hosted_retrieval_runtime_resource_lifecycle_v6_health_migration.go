package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6HealthStatements
// folds the current lifecycle owner into the existing six-column readiness
// summary. Every durable v6 write also advances the namespace owner ledger so
// a previously observed healthy revision cannot hide later unfinished work.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6HealthStatements() []string {
	return []string{
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_intent_owner_revision
			AFTER INSERT ON ae_hrrr_lifecycle_dispatch_intents
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_transport_owner_revision
			AFTER INSERT ON ae_hrrr_lifecycle_transport_receipts
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_spool_owner_revision
			AFTER UPDATE
			ON ae_hrrr_lifecycle_result_spools
			FOR EACH ROW WHEN (NEW.disposition IS DISTINCT FROM
				'destroyed-after-prefix-supersession')
			EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_journal_owner_revision
			AFTER INSERT ON ae_hrrr_lifecycle_transport_journals
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_unfinished_owner_revision
			AFTER INSERT OR UPDATE
			ON ae_hrrr_lifecycle_unfinished_operations
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_archive_owner_revision
			AFTER INSERT
			ON ae_hrrr_lifecycle_journal_archives
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_archive_root_owner_revision
			AFTER INSERT
			ON ae_hrrr_lifecycle_journal_archive_roots
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_prepare_owner_revision
			AFTER INSERT OR UPDATE
			ON ae_hrrr_lifecycle_partial_cleanup_prepares
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_claim_history_owner_revision
			AFTER INSERT
			ON ae_hrrr_lifecycle_partial_cleanup_claim_history
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_claim_current_owner_revision
			AFTER INSERT OR UPDATE
			ON ae_hrrr_lifecycle_partial_cleanup_claim_current
			FOR EACH ROW EXECUTE FUNCTION bump_agent_evaluation_hosted_runtime_owner_ledger()`,
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
				 WHERE registration.namespace_id=candidate_namespace_id
					AND registration.v46_eligible),
				(SELECT COUNT(*)
				 FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				 WHERE resource.namespace_id=candidate_namespace_id
					AND resource.v46_eligible AND resource.lifecycle='active'),
				(SELECT COUNT(*)
				 FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				 WHERE resource.namespace_id=candidate_namespace_id
					AND resource.v46_eligible AND resource.lifecycle='active'
					AND resource.read_lease_not_after>candidate_summarized_at),
				((SELECT COUNT(*)
				  FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				  WHERE resource.namespace_id=candidate_namespace_id AND resource.v46_eligible
					 AND (resource.lifecycle='cleanup-in-progress'
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
						))))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_registration_requests request
					WHERE request.namespace_id=candidate_namespace_id AND request.v46_eligible
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_registration_results registration
						  WHERE registration.namespace_id=request.namespace_id
							AND registration.plan_digest=request.plan_digest
							AND registration.repository_commit=request.repository_commit
							AND registration.registration_request_digest=request.request_digest
						  )
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_partial_cleanup_prepares prepare
						  WHERE prepare.namespace_id=request.namespace_id
							AND prepare.registration_request_digest=request.request_digest
					  )
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_transport_journals journal
						  WHERE journal.namespace_id=request.namespace_id
							AND journal.registration_request_digest=request.request_digest
							AND journal.operation='create'
							AND journal.business_outcome='abandoned-before-provider-effect'
					  ))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_partial_cleanup_prepares prepare
					WHERE prepare.namespace_id=candidate_namespace_id
					  AND prepare.state<>'cleaned')
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_journal_archives archive
					WHERE archive.namespace_id=candidate_namespace_id AND archive.v46_eligible
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_seal_receipts seal
						  WHERE seal.namespace_id=archive.namespace_id
							AND seal.archive_record_digest=archive.archive_record_digest
					  ))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_dispatch_claim_current claim
					WHERE claim.namespace_id=candidate_namespace_id
					  AND claim.sealed_journal_record_digest IS NULL)
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_result_spools spool
					WHERE spool.namespace_id=candidate_namespace_id AND spool.v46_eligible
					  AND spool.state IN ('active','retained-encrypted'))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_unfinished_operations unfinished
					WHERE unfinished.namespace_id=candidate_namespace_id
					  AND unfinished.state='pending')
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_transport_journals journal
					WHERE journal.namespace_id=candidate_namespace_id AND journal.v46_eligible
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_journal_archives archive
						  WHERE archive.namespace_id=journal.namespace_id
							AND archive.journal_record_digest=journal.record_digest
						  ))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_sets resource_set
					WHERE resource_set.namespace_id=candidate_namespace_id
					  AND resource_set.v46_eligible
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_journal_archive_roots root
						  WHERE root.namespace_id=resource_set.namespace_id
							AND root.plan_digest=resource_set.plan_digest
							AND root.repository_commit=resource_set.repository_commit
							AND root.runtime_resource_set_id=resource_set.runtime_resource_set_id
							AND root.v46_eligible AND root.closure_status='zeroed'
					  ))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_registration_requests request
					WHERE request.namespace_id=candidate_namespace_id AND request.v46_eligible
					  AND NOT EXISTS (
						  SELECT 1 FROM agent_evaluation_budget_settlements settlement
						  WHERE settlement.namespace_id=request.namespace_id
							AND settlement.plan_digest=request.plan_digest
							AND settlement.reservation_id=
								request.request_json#>>'{budgetReservationAuthority,reservationId}'
					  ))),
				((SELECT COUNT(*)
				  FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				  WHERE resource.namespace_id=candidate_namespace_id AND resource.v46_eligible
					 AND resource.lifecycle<>'cleaned'
					 AND (resource.resource_expires_at<candidate_summarized_at
						OR (resource.lifecycle='cleanup-in-progress' AND EXISTS (
							SELECT 1
							FROM ae_hrrr_cleanup_claim_receipts claim
							WHERE claim.namespace_id=resource.namespace_id
								AND claim.plan_digest=resource.plan_digest
								AND claim.repository_commit=resource.repository_commit
								AND claim.authority_digest=resource.authority_digest
								AND claim.claim_expires_at<candidate_summarized_at)))
				 )
				 + (SELECT COUNT(*)
					FROM ae_hrrr_registration_requests request
					WHERE request.namespace_id=candidate_namespace_id AND request.v46_eligible
					  AND request.minimum_expires_at<candidate_summarized_at
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_registration_results registration
						  WHERE registration.namespace_id=request.namespace_id
							AND registration.plan_digest=request.plan_digest
							AND registration.repository_commit=request.repository_commit
							AND registration.registration_request_digest=request.request_digest
						  )
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_partial_cleanup_prepares prepare
						  WHERE prepare.namespace_id=request.namespace_id
							AND prepare.registration_request_digest=request.request_digest
					  )
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_transport_journals journal
						  WHERE journal.namespace_id=request.namespace_id
							AND journal.registration_request_digest=request.request_digest
							AND journal.operation='create'
							AND journal.business_outcome='abandoned-before-provider-effect'
					  ))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_partial_cleanup_prepares prepare
					LEFT JOIN ae_hrrr_lifecycle_partial_cleanup_claim_current claim
					  ON claim.namespace_id=prepare.namespace_id
					 AND claim.registration_request_digest=prepare.registration_request_digest
					WHERE prepare.namespace_id=candidate_namespace_id
					  AND prepare.state<>'cleaned'
					  AND (prepare.expires_at<=candidate_summarized_at
						OR claim.claim_expires_at<=candidate_summarized_at))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_dispatch_claim_current claim
					WHERE claim.namespace_id=candidate_namespace_id
					  AND claim.sealed_journal_record_digest IS NULL
					  AND claim.claim_expires_at<=candidate_summarized_at)
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_result_spools spool
					WHERE spool.namespace_id=candidate_namespace_id AND spool.v46_eligible
					  AND spool.state IN ('active','retained-encrypted')
					  AND spool.expires_at<=candidate_summarized_at)
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_unfinished_operations unfinished
					JOIN ae_hrrr_registration_requests request
					  ON request.namespace_id=unfinished.namespace_id
					 AND request.request_digest=unfinished.registration_request_digest
					LEFT JOIN ae_hrrr_registration_results registration
					  ON registration.namespace_id=request.namespace_id
					 AND registration.plan_digest=request.plan_digest
					 AND registration.repository_commit=request.repository_commit
					 AND registration.registration_request_digest=request.request_digest
					LEFT JOIN agent_evaluation_hosted_retrieval_runtime_resources resource
					  ON resource.namespace_id=registration.namespace_id
					 AND resource.plan_digest=registration.plan_digest
					 AND resource.repository_commit=registration.repository_commit
					 AND resource.registration_request_digest=registration.registration_request_digest
					JOIN agent_evaluation_plans plan
					  ON plan.namespace_id=request.namespace_id AND plan.plan_digest=request.plan_digest
					 AND plan.repository_commit=request.repository_commit
					WHERE unfinished.namespace_id=candidate_namespace_id
					  AND unfinished.state='pending'
					  AND LEAST(plan.expires_at,COALESCE(resource.resource_expires_at,
						registration.expires_at,request.minimum_expires_at))<=candidate_summarized_at)
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_transport_journals journal
					WHERE journal.namespace_id=candidate_namespace_id AND journal.v46_eligible
					  AND journal.completed_at+INTERVAL '125 seconds'<=candidate_summarized_at
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_journal_archives archive
						  WHERE archive.namespace_id=journal.namespace_id
							AND archive.journal_record_digest=journal.record_digest
					  ))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_journal_archives archive
					WHERE archive.namespace_id=candidate_namespace_id AND archive.v46_eligible
					  AND archive.created_at+INTERVAL '125 seconds'<=candidate_summarized_at
					  AND NOT EXISTS (
						  SELECT 1
						  FROM ae_hrrr_lifecycle_seal_receipts seal
						  WHERE seal.namespace_id=archive.namespace_id
							AND seal.archive_record_digest=archive.archive_record_digest
					  ))
				 + (SELECT COUNT(*)
					FROM ae_hrrr_lifecycle_journal_archive_roots root
					WHERE root.namespace_id=candidate_namespace_id AND root.v46_eligible
					  AND root.closure_status<>'zeroed'
					  AND root.sealed_at+INTERVAL '125 seconds'<=candidate_summarized_at))
			FROM ae_hrrr_owner_ledgers ledger
			WHERE ledger.namespace_id=candidate_namespace_id
		$$`,
	}
}
