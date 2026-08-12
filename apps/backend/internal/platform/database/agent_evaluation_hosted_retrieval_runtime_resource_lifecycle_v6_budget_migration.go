package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6BudgetStatements
// locks both the frozen plan floor and the material-derived exact-four
// lifecycle demand before any Provider lifecycle dispatch can become durable.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6BudgetStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_v6_budget_floor_valid(
			candidate_plan JSONB
		) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
			WITH limits AS (
				SELECT entry->>'unit' AS unit,entry->>'maximum' AS maximum
				FROM jsonb_array_elements(COALESCE(
					candidate_plan#>'{value,budget,budget,usageLimits}','[]'::jsonb
				)) entry
			), normalized AS (
				SELECT unit,CASE WHEN maximum ~ '^(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'
					THEN maximum::numeric ELSE NULL END AS maximum
				FROM limits
			)
			SELECT COALESCE(
				(SELECT maximum>=210 FROM normalized WHERE unit='hosted-search-query')
				AND (SELECT maximum>=222 FROM normalized WHERE unit='hosted-tool-call')
				AND (SELECT maximum>=310 FROM normalized WHERE unit='provider-upload-byte')
				AND (SELECT maximum>=214272000 FROM normalized
					WHERE unit='provider-storage-byte-second')
				AND CASE
					WHEN candidate_plan#>>'{value,budget,budget,maxToolCalls}'
						~ '^(0|[1-9][0-9]*)$'
					THEN (candidate_plan#>>'{value,budget,budget,maxToolCalls}')::numeric>=210
					ELSE FALSE END,
				FALSE)
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_v6_budget_demand()
			RETURNS trigger AS $$
		DECLARE
			plan_row agent_evaluation_plans%ROWTYPE;
			reservation_row agent_evaluation_budget_reservations%ROWTYPE;
			amount_count BIGINT;
			amount_units TEXT[];
			hosted_tool_calls NUMERIC;
			upload_bytes NUMERIC;
			storage_byte_seconds NUMERIC;
			binding_count BIGINT;
			reservation_count BIGINT;
			aggregate_hosted_tool_calls NUMERIC;
			aggregate_upload_bytes NUMERIC;
			aggregate_storage_byte_seconds NUMERIC;
		BEGIN
			SELECT * INTO plan_row
			FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR SHARE;
			SELECT * INTO reservation_row
			FROM agent_evaluation_budget_reservations
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND reservation_id=
					NEW.request_json#>>'{budgetReservationAuthority,reservationId}'
			FOR SHARE;
			SELECT COUNT(*),array_agg(amount->>'unit' ORDER BY ordinality),
				MAX(CASE WHEN amount->>'unit'='hosted-tool-call'
					AND amount->>'logicalAmount' ~ '^(0|[1-9][0-9]*)$'
					THEN (amount->>'logicalAmount')::numeric END),
				MAX(CASE WHEN amount->>'unit'='provider-upload-byte'
					AND amount->>'logicalAmount' ~ '^(0|[1-9][0-9]*)$'
					THEN (amount->>'logicalAmount')::numeric END),
				MAX(CASE WHEN amount->>'unit'='provider-storage-byte-second'
					AND amount->>'logicalAmount' ~ '^(0|[1-9][0-9]*)$'
					THEN (amount->>'logicalAmount')::numeric END)
			INTO amount_count,amount_units,hosted_tool_calls,upload_bytes,storage_byte_seconds
			FROM jsonb_array_elements(COALESCE(
				reservation_row.demand_json#>'{usage,amounts}','[]'::jsonb
			)) WITH ORDINALITY entry(amount,ordinality);
			IF plan_row.plan_digest IS NULL OR reservation_row.reservation_id IS NULL
				OR NOT agent_evaluation_hosted_runtime_v6_budget_floor_valid(plan_row.plan_json)
				OR reservation_row.demand_digest<>
					agent_evaluation_canonical_jsonb_digest(reservation_row.demand_json)
				OR reservation_row.demand_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(reservation_row.demand_json),'UTF8')
				OR agent_evaluation_jsonb_object_key_count(reservation_row.demand_json)<>8
				OR NOT (reservation_row.demand_json ?& ARRAY[
					'usage','cost','modelInvocations','toolCalls','repairRounds','transactions',
					'artifactBytes','elapsedMs'
				])
				OR reservation_row.demand_json->'cost'<>'[]'::jsonb
				OR reservation_row.demand_json->>'modelInvocations'<>'0'
				OR reservation_row.demand_json->>'toolCalls'<>'0'
				OR reservation_row.demand_json->>'repairRounds'<>'0'
				OR reservation_row.demand_json->>'transactions'<>'0'
				OR reservation_row.demand_json->>'artifactBytes'<>'0'
				OR reservation_row.demand_json->>'elapsedMs'<>'0'
				OR agent_evaluation_jsonb_object_key_count(
					reservation_row.demand_json->'usage')<>2
				OR reservation_row.demand_json#>>'{usage,vectorDigest}'<>
					agent_evaluation_canonical_jsonb_digest(
						reservation_row.demand_json#>'{usage,amounts}')
				OR amount_count<>3 OR amount_units<>ARRAY[
					'hosted-tool-call','provider-storage-byte-second','provider-upload-byte'
				]
				OR hosted_tool_calls<>3 OR upload_bytes<1
				OR storage_byte_seconds<>upload_bytes*691200
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(reservation_row.demand_json#>'{usage,amounts}') amount
					WHERE agent_evaluation_jsonb_object_key_count(amount)<>4
						OR NOT (amount ?& ARRAY[
							'unit','logicalAmount','billableAmount','confidence'
						])
						OR amount->>'logicalAmount'<>amount->>'billableAmount'
						OR amount->>'confidence'<>CASE amount->>'unit'
							WHEN 'provider-upload-byte' THEN 'measured' ELSE 'estimated' END
				) THEN
				RAISE EXCEPTION 'hosted runtime v6 lifecycle budget demand is not material-exact'
					USING ERRCODE='23514';
			END IF;
			WITH bindings AS (
				SELECT request.request_digest,
					request.request_json#>>'{budgetReservationAuthority,reservationId}'
						AS reservation_id
				FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_requests request
				WHERE request.namespace_id=NEW.namespace_id AND request.plan_digest=NEW.plan_digest
					AND request.repository_commit=NEW.repository_commit
					AND request.runtime_resource_set_id=NEW.runtime_resource_set_id
					AND request.v46_eligible
				UNION ALL
				SELECT NEW.request_digest,
					NEW.request_json#>>'{budgetReservationAuthority,reservationId}'
			), amounts AS (
				SELECT binding.request_digest,binding.reservation_id,amount->>'unit' AS unit,
					CASE WHEN amount->>'logicalAmount' ~ '^(0|[1-9][0-9]*)$'
						THEN (amount->>'logicalAmount')::numeric END AS logical_amount
				FROM bindings binding
				JOIN agent_evaluation_budget_reservations reservation
				  ON reservation.namespace_id=NEW.namespace_id
				 AND reservation.plan_digest=NEW.plan_digest
				 AND reservation.reservation_id=binding.reservation_id
				CROSS JOIN LATERAL jsonb_array_elements(
					reservation.demand_json#>'{usage,amounts}'
				) amount
			)
			SELECT COUNT(DISTINCT request_digest),COUNT(DISTINCT reservation_id),
				COALESCE(SUM(logical_amount) FILTER (WHERE unit='hosted-tool-call'),0),
				COALESCE(SUM(logical_amount) FILTER (WHERE unit='provider-upload-byte'),0),
				COALESCE(SUM(logical_amount)
					FILTER (WHERE unit='provider-storage-byte-second'),0)
			INTO binding_count,reservation_count,aggregate_hosted_tool_calls,
				aggregate_upload_bytes,aggregate_storage_byte_seconds
			FROM amounts;
			IF binding_count=4 AND (
				reservation_count<>4 OR aggregate_hosted_tool_calls<>12
				OR aggregate_upload_bytes<>310
				OR aggregate_storage_byte_seconds<>214272000
			) THEN
				RAISE EXCEPTION 'hosted runtime v6 exact-four lifecycle budget aggregate drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_stage_v6_budget_exact
			BEFORE INSERT
			ON agent_evaluation_hosted_retrieval_runtime_resource_registration_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_v6_budget_demand()`,
	}
}
