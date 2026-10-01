package database

func hostedLifecycleDeletionFenceMigration() migration {
	return migration{version: 49, name: "hosted-lifecycle-deletion-time-admission", statements: []string{
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_lifecycle_deletion_not_before(
			candidate_namespace TEXT,candidate_authority TEXT,candidate_claim TEXT
		) RETURNS TIMESTAMPTZ AS $$
		DECLARE result TIMESTAMPTZ;
		BEGIN
			SELECT request.deletion_not_before INTO result
			FROM ae_hrrr_cleanup_claim_receipts claim JOIN ae_hrrr_cleanup_requests request
			ON request.namespace_id=claim.namespace_id AND request.request_digest=claim.cleanup_request_digest
			AND request.authority_digest=claim.authority_digest
			WHERE claim.namespace_id=candidate_namespace AND claim.authority_digest=candidate_authority
			AND claim.receipt_digest=candidate_claim;
			IF result IS NULL THEN
				SELECT claimed_at INTO result FROM ae_hrrr_lifecycle_partial_cleanup_claim_history
				WHERE namespace_id=candidate_namespace AND partial_cleanup_authority_digest=candidate_authority
				AND claim_receipt_digest=candidate_claim;
			END IF;
			IF result IS NULL THEN RAISE EXCEPTION 'hosted lifecycle deletion has no durable time authority' USING ERRCODE='23514'; END IF;
			RETURN result;
		END; $$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_deletion_fence()
		RETURNS trigger AS $$
		DECLARE intent ae_hrrr_lifecycle_dispatch_intents%ROWTYPE; admitted_at TIMESTAMPTZ; not_before TIMESTAMPTZ;
		BEGIN
			IF TG_TABLE_NAME='ae_hrrr_lifecycle_dispatch_intents' THEN
				intent := NEW; admitted_at := NEW.created_at;
			ELSE
				IF TG_TABLE_NAME='ae_hrrr_lifecycle_dispatch_claim_receipts' THEN
					IF NEW.delivery_disposition<>'dispatch-authorized-first-delivery' THEN RETURN NEW; END IF;
				END IF;
				SELECT * INTO intent FROM ae_hrrr_lifecycle_dispatch_intents
				WHERE namespace_id=NEW.namespace_id AND intent_digest=NEW.intent_digest FOR SHARE;
				IF TG_TABLE_NAME='ae_hrrr_lifecycle_dispatch_claim_receipts' THEN admitted_at := NEW.claimed_at;
				ELSE admitted_at := NEW.started_at; END IF;
			END IF;
			IF intent.operation='delete' THEN
				not_before := agent_evaluation_hosted_runtime_lifecycle_deletion_not_before(
					intent.namespace_id,intent.authority_digest,intent.lifecycle_claim_receipt_digest);
				IF intent.created_at<not_before OR admitted_at<not_before OR clock_timestamp()<not_before THEN
					RAISE EXCEPTION 'hosted lifecycle deletion precedes its read lease fence' USING ERRCODE='23514';
				END IF;
			END IF;
			RETURN NEW;
		END; $$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_lifecycle_deletion_intent_time BEFORE INSERT ON ae_hrrr_lifecycle_dispatch_intents FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_deletion_fence()`,
		`CREATE TRIGGER agent_eval_hosted_lifecycle_deletion_claim_time BEFORE INSERT ON ae_hrrr_lifecycle_dispatch_claim_receipts FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_deletion_fence()`,
		`CREATE TRIGGER agent_eval_hosted_lifecycle_deletion_transport_time BEFORE INSERT ON ae_hrrr_lifecycle_transport_receipts FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_deletion_fence()`,
	}}
}
