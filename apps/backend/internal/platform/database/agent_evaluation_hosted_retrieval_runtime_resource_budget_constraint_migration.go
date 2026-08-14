package database

// agentEvaluationHostedRetrievalRuntimeResourceBudgetConstraintStatements
// binds each exact registration intent to a distinct existing reservation and
// accepts its settlement only after either durable cleanup or conservative
// full reconciliation. Cleanup may commit first; owner health and release
// remain incomplete until all four reservation settlements are durable.
func agentEvaluationHostedRetrievalRuntimeResourceBudgetConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_budget_settlement()
			RETURNS trigger AS $$
		DECLARE
			hosted_request_count BIGINT;
			request_row ae_hrrr_registration_requests%ROWTYPE;
			reservation_row agent_evaluation_budget_reservations%ROWTYPE;
			registration_row ae_hrrr_registration_results%ROWTYPE;
			cleanup_row ae_hrrr_cleanups%ROWTYPE;
			archive_row ae_hrrr_cleanup_archives%ROWTYPE;
			requires_reconciliation BOOLEAN;
			expected_key_count BIGINT;
		BEGIN
			SELECT COUNT(*) INTO hosted_request_count
			FROM ae_hrrr_registration_requests request
			WHERE request.namespace_id=NEW.namespace_id AND request.plan_digest=NEW.plan_digest
				AND request.request_json#>>'{budgetReservationAuthority,reservationId}'=
					NEW.reservation_id;
			IF hosted_request_count=0 THEN RETURN NEW; END IF;
			IF hosted_request_count<>1 THEN
				RAISE EXCEPTION 'hosted runtime budget reservation is ambiguously bound'
					USING ERRCODE='23514';
			END IF;
			SELECT * INTO STRICT request_row
			FROM ae_hrrr_registration_requests request
			WHERE request.namespace_id=NEW.namespace_id AND request.plan_digest=NEW.plan_digest
				AND request.request_json#>>'{budgetReservationAuthority,reservationId}'=
					NEW.reservation_id
			FOR SHARE;
			SELECT * INTO reservation_row
			FROM agent_evaluation_budget_reservations reservation
			WHERE reservation.namespace_id=NEW.namespace_id
				AND reservation.plan_digest=NEW.plan_digest
				AND reservation.reservation_id=NEW.reservation_id
			FOR SHARE;
			SELECT * INTO registration_row
			FROM ae_hrrr_registration_results registration
			WHERE registration.namespace_id=request_row.namespace_id
				AND registration.plan_digest=request_row.plan_digest
				AND registration.repository_commit=request_row.repository_commit
				AND registration.registration_request_digest=request_row.request_digest
			FOR SHARE;
			IF registration_row.registration_result_digest IS NOT NULL THEN
				SELECT * INTO cleanup_row
				FROM ae_hrrr_cleanups cleanup
				WHERE cleanup.namespace_id=registration_row.namespace_id
					AND cleanup.plan_digest=registration_row.plan_digest
					AND cleanup.repository_commit=registration_row.repository_commit
					AND cleanup.authority_digest=registration_row.authority_digest
				FOR SHARE;
			END IF;
			IF cleanup_row.cleanup_receipt_digest IS NOT NULL THEN
				SELECT * INTO archive_row
				FROM ae_hrrr_cleanup_archives archive
				WHERE archive.namespace_id=cleanup_row.namespace_id
					AND archive.plan_digest=cleanup_row.plan_digest
					AND archive.repository_commit=cleanup_row.repository_commit
					AND archive.authority_digest=cleanup_row.authority_digest
				FOR SHARE;
			END IF;
			requires_reconciliation:=CASE NEW.settlement_json->'requiresReconciliation'
				WHEN 'true'::jsonb THEN TRUE WHEN 'false'::jsonb THEN FALSE ELSE NULL END;
			expected_key_count:=CASE WHEN requires_reconciliation THEN 6 ELSE 5 END;
			IF reservation_row.reservation_id IS NULL
				OR request_row.repository_commit IS NULL
				OR request_row.request_json#>>'{budgetReservationAuthority,demandDigest}'<>
					reservation_row.demand_digest
				OR request_row.request_json#>>'{budgetReservationAuthority,demandBytesDigest}'<>
					'sha256-'||encode(digest(reservation_row.demand_bytes,'sha256'),'hex')
				OR jsonb_typeof(NEW.settlement_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.settlement_json)<>
					expected_key_count
				OR NOT (NEW.settlement_json ?& ARRAY[
					'actual','charged','requiresReconciliation','settledAt','settlementDigest'
				])
				OR requires_reconciliation IS NULL
				OR NEW.settlement_json->'actual'<>reservation_row.demand_json
				OR NEW.settlement_json->'charged'<>reservation_row.demand_json
				OR NEW.settlement_json->>'settlementDigest'<>NEW.settlement_digest
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.settlement_json-'settlementDigest')<>NEW.settlement_digest
				OR (NEW.settlement_json->>'settledAt')::timestamptz<>NEW.settled_at
				OR NEW.settlement_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(NEW.settlement_json),'UTF8') THEN
				RAISE EXCEPTION 'hosted runtime budget settlement drifted from its reservation'
					USING ERRCODE='23514';
			END IF;
			IF cleanup_row.cleanup_receipt_digest IS NOT NULL THEN
				IF archive_row.record_digest IS NULL OR requires_reconciliation
					OR NEW.settlement_json ? 'reconciliationReason'
					OR NEW.settled_at<>cleanup_row.completed_at THEN
					RAISE EXCEPTION 'hosted runtime clean settlement lacks its cleanup archive'
						USING ERRCODE='23514';
				END IF;
			ELSIF NOT requires_reconciliation
				OR NOT (NEW.settlement_json ? 'reconciliationReason')
				OR NEW.settlement_json->>'reconciliationReason' NOT IN (
					'worker-loss','timeout','provider-disconnect','ack-loss'
				)
				OR NEW.settled_at<reservation_row.reserved_at THEN
				RAISE EXCEPTION 'hosted runtime budget without clean evidence requires full reconciliation'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_budget_settlements_exact
			BEFORE INSERT ON agent_evaluation_budget_settlements
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_budget_settlement()`,
		`CREATE OR REPLACE FUNCTION bump_agent_evaluation_hosted_runtime_budget_settlement_owner_ledger()
			RETURNS trigger AS $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM ae_hrrr_registration_requests request
				WHERE request.namespace_id=NEW.namespace_id AND request.plan_digest=NEW.plan_digest
					AND request.request_json#>>'{budgetReservationAuthority,reservationId}'=
						NEW.reservation_id
			) THEN
				INSERT INTO ae_hrrr_owner_ledgers(
					namespace_id,ledger_revision,updated_at
				) VALUES (NEW.namespace_id,1,clock_timestamp())
				ON CONFLICT (namespace_id) DO UPDATE SET
					ledger_revision=
						ae_hrrr_owner_ledgers.ledger_revision+1,
					updated_at=GREATEST(
						ae_hrrr_owner_ledgers.updated_at,
						EXCLUDED.updated_at
					);
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_budget_settlement_owner_revision
			AFTER INSERT ON agent_evaluation_budget_settlements
			FOR EACH ROW EXECUTE FUNCTION
				bump_agent_evaluation_hosted_runtime_budget_settlement_owner_ledger()`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_cleanup_archive_family_budget_complete(
			candidate_namespace_id TEXT,
			candidate_plan_digest TEXT,
			candidate_repository_commit TEXT,
			candidate_runtime_resource_set_id TEXT
		) RETURNS BOOLEAN
		LANGUAGE sql STABLE PARALLEL RESTRICTED AS $$
			SELECT COALESCE(
				COUNT(*)=4
				AND COUNT(DISTINCT registration.budget_reservation_id)=4
				AND COUNT(settlement.reservation_id)=4,
				FALSE
			)
			FROM ae_hrrr_cleanup_archives archive
			JOIN ae_hrrr_registration_results registration
			  ON registration.namespace_id=archive.namespace_id
			 AND registration.plan_digest=archive.plan_digest
			 AND registration.repository_commit=archive.repository_commit
			 AND registration.runtime_resource_set_id=archive.runtime_resource_set_id
			 AND registration.authority_digest=archive.authority_digest
			LEFT JOIN agent_evaluation_budget_settlements settlement
			  ON settlement.namespace_id=registration.namespace_id
			 AND settlement.plan_digest=registration.plan_digest
			 AND settlement.reservation_id=registration.budget_reservation_id
			WHERE archive.namespace_id=candidate_namespace_id
				AND archive.plan_digest=candidate_plan_digest
				AND archive.repository_commit=candidate_repository_commit
				AND archive.runtime_resource_set_id=candidate_runtime_resource_set_id
		$$`,
	}
}
