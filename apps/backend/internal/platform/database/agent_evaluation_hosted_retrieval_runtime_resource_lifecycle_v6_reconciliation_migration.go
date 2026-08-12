package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ReconciliationStatements
// keeps every post-dispatch unknown operation unfinished until durable bounded
// GET observations cover the unknown transport set. Only that stored proof can
// authorize a known business result and final immutable journal seal.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ReconciliationStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_lifecycle_claim_history_is_prefix(
			stored_history JSONB,current_history JSONB
		) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
			SELECT COALESCE(
				jsonb_typeof(stored_history)='object'
				AND jsonb_typeof(current_history)='object'
				AND stored_history->>'operation'=current_history->>'operation'
				AND stored_history->>'registrationRequestDigest'=
					current_history->>'registrationRequestDigest'
				AND stored_history->>'dispatchIntentSetDigest'=
					current_history->>'dispatchIntentSetDigest'
				AND stored_history->'initialClaimReceiptSet'=
					current_history->'initialClaimReceiptSet'
				AND NOT EXISTS (
					SELECT 1
					FROM (
						SELECT receipt,receipt->>'dispatchIntentDigest' AS intent_digest,
							row_number() OVER (PARTITION BY receipt->>'dispatchIntentDigest'
								ORDER BY ordinality) AS chain_index
						FROM jsonb_array_elements(stored_history->'receipts')
							WITH ORDINALITY member(receipt,ordinality)
					) stored
					LEFT JOIN (
						SELECT receipt,receipt->>'dispatchIntentDigest' AS intent_digest,
							row_number() OVER (PARTITION BY receipt->>'dispatchIntentDigest'
								ORDER BY ordinality) AS chain_index
						FROM jsonb_array_elements(current_history->'receipts')
							WITH ORDINALITY member(receipt,ordinality)
					) candidate_current
					  ON candidate_current.intent_digest=stored.intent_digest
					 AND candidate_current.chain_index=stored.chain_index
					WHERE candidate_current.receipt IS DISTINCT FROM stored.receipt
				),FALSE)
		$$`,
		`CREATE OR REPLACE FUNCTION stage_agent_evaluation_hosted_runtime_lifecycle_unfinished()
			RETURNS trigger AS $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents intent
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts transport
				  ON transport.namespace_id=intent.namespace_id
				 AND transport.intent_digest=intent.intent_digest
				WHERE intent.namespace_id=NEW.namespace_id
					AND intent.registration_request_digest=NEW.registration_request_digest
					AND intent.operation=NEW.operation
					AND transport.outcome='post-dispatch-unknown'
			) THEN
				INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations(
					namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
					registration_request_digest,operation,dispatch_intent_set_digest,
					dispatch_stage_claim_receipt_set_digest,transport_receipt_set_digest,
					business_result_digest,result_spool_ref,result_spool_receipt_digest,
					state,current_revision,created_at,updated_at
				) VALUES (
					NEW.namespace_id,NEW.plan_digest,NEW.repository_commit,NEW.runtime_resource_set_id,
					NEW.registration_request_digest,NEW.operation,NEW.dispatch_intent_set_digest,
					NEW.dispatch_stage_claim_receipt_set_digest,NEW.transport_receipt_set_digest,
					NEW.business_result_digest,NEW.spool_ref,NEW.spool_receipt_digest,
					'pending',1,NEW.spooled_at,NEW.spooled_at
				) ON CONFLICT (namespace_id,registration_request_digest,operation) DO UPDATE SET
					dispatch_intent_set_digest=EXCLUDED.dispatch_intent_set_digest,
					dispatch_stage_claim_receipt_set_digest=
						EXCLUDED.dispatch_stage_claim_receipt_set_digest,
					transport_receipt_set_digest=EXCLUDED.transport_receipt_set_digest,
					business_result_digest=EXCLUDED.business_result_digest,
					result_spool_ref=EXCLUDED.result_spool_ref,
					result_spool_receipt_digest=EXCLUDED.result_spool_receipt_digest,
					current_revision=
						agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations.current_revision+1,
					updated_at=GREATEST(
						agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations.updated_at,
						EXCLUDED.updated_at)
				WHERE agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations.state='pending';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_spool_unfinished
			AFTER INSERT
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			FOR EACH ROW EXECUTE FUNCTION stage_agent_evaluation_hosted_runtime_lifecycle_unfinished()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_reconciliation_observation()
			RETURNS trigger AS $$
		DECLARE
			unfinished_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations%ROWTYPE;
			intent_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents%ROWTYPE;
			claim_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts%ROWTYPE;
			current_claim agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current%ROWTYPE;
			transport_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts%ROWTYPE;
			spool_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools%ROWTYPE;
		BEGIN
			SELECT * INTO unfinished_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations
			WHERE namespace_id=NEW.namespace_id
				AND registration_request_digest=NEW.registration_request_digest
				AND operation=NEW.operation
			FOR UPDATE;
			SELECT * INTO intent_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents
			WHERE namespace_id=NEW.namespace_id AND intent_digest=NEW.dispatch_intent_digest
			FOR SHARE;
			SELECT * INTO claim_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.dispatch_stage_claim_receipt_digest
			FOR SHARE;
			SELECT * INTO current_claim
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current
			WHERE namespace_id=NEW.namespace_id AND intent_digest=NEW.dispatch_intent_digest
			FOR SHARE;
			SELECT * INTO transport_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts
			WHERE namespace_id=NEW.namespace_id AND receipt_digest=NEW.transport_receipt_digest
			FOR SHARE;
			SELECT * INTO spool_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			WHERE namespace_id=NEW.namespace_id AND spool_ref=unfinished_row.result_spool_ref
			FOR SHARE;
			IF unfinished_row.state<>'pending' OR spool_row.spool_ref IS NULL
				OR spool_row.state NOT IN ('active','retained-encrypted')
				OR NEW.observed_at>=spool_row.expires_at
				OR intent_row.intent_digest IS NULL
				OR intent_row.registration_request_digest<>NEW.registration_request_digest
				OR intent_row.operation<>NEW.operation
				OR intent_row.mutation_kind<>NEW.mutation_kind
				OR intent_row.mutation_sequence<>NEW.mutation_sequence
				OR claim_row.receipt_digest IS NULL
				OR claim_row.intent_digest<>NEW.dispatch_intent_digest
				OR claim_row.delivery_disposition<>'reconcile-only-replay'
				OR claim_row.prior_transport_receipt_digest<>NEW.transport_receipt_digest
				OR current_claim.current_claim_receipt_digest<>claim_row.receipt_digest
				OR NEW.requested_at<claim_row.claimed_at
				OR NEW.requested_at>=claim_row.claim_expires_at
				OR transport_row.receipt_digest IS NULL
				OR transport_row.intent_digest<>NEW.dispatch_intent_digest
				OR transport_row.outcome<>'post-dispatch-unknown'
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>13
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','purpose','dispatchIntentDigest',
					'dispatchStageClaimReceiptDigest','transportReceiptDigest',
					'mutationKind','mutationSequence','providerConfigurationId','endpointId',
					'method','requestedAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.read'
				OR NEW.request_json->>'dispatchIntentDigest'<>NEW.dispatch_intent_digest
				OR NEW.request_json->>'dispatchStageClaimReceiptDigest'<>
					NEW.dispatch_stage_claim_receipt_digest
				OR NEW.request_json->>'transportReceiptDigest'<>NEW.transport_receipt_digest
				OR NEW.request_json->>'mutationKind'<>NEW.mutation_kind
				OR (NEW.request_json->>'mutationSequence')::bigint<>NEW.mutation_sequence
				OR NEW.request_json->>'providerConfigurationId'<>
					intent_row.intent_json->>'providerConfigurationId'
				OR NEW.request_json->>'endpointId'<>intent_row.intent_json->>'endpointId'
				OR NEW.request_json->>'method'<>'GET'
				OR (NEW.request_json->>'requestedAt')::timestamptz<>NEW.requested_at
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR NEW.requested_at<transport_row.completed_at
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>19
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','request','requestDigest','observationAuthorityIssuerId',
					'observationAuthorityImplementationDigest','dispatchIntentDigest',
					'dispatchStageClaimReceiptDigest','transportReceiptDigest',
					'mutationKind','mutationSequence','observationOutcome',
					'resourceId','resourceRole','resourceManifestDigest','httpStatus',
					'providerRequestId','observedAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR NEW.receipt_json->'request'<>NEW.request_json
				OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
				OR NEW.receipt_json->>'observationAuthorityIssuerId'
					<>NEW.observation_authority_issuer_id
				OR NEW.receipt_json->>'observationAuthorityImplementationDigest'
					<>NEW.observation_authority_implementation_digest
				OR NEW.receipt_json->>'dispatchIntentDigest'<>NEW.dispatch_intent_digest
				OR NEW.receipt_json->>'dispatchStageClaimReceiptDigest'<>
					NEW.dispatch_stage_claim_receipt_digest
				OR NEW.receipt_json->>'transportReceiptDigest'<>NEW.transport_receipt_digest
				OR NEW.receipt_json->>'mutationKind'<>NEW.mutation_kind
				OR (NEW.receipt_json->>'mutationSequence')::bigint<>NEW.mutation_sequence
				OR NEW.receipt_json->>'observationOutcome'<>NEW.observation_outcome
				OR NEW.receipt_json->>'resourceId' IS DISTINCT FROM NEW.resource_id
				OR NEW.receipt_json->>'resourceRole' IS DISTINCT FROM NEW.resource_role
				OR NEW.receipt_json->>'resourceManifestDigest' IS DISTINCT FROM
					NEW.resource_manifest_digest
				OR (NEW.receipt_json->>'httpStatus')::bigint<>NEW.http_status
				OR NEW.receipt_json->>'providerRequestId' IS DISTINCT FROM NEW.provider_request_id
				OR (NEW.receipt_json->>'observedAt')::timestamptz<>NEW.observed_at
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest
				OR jsonb_typeof(NEW.observation_store_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(
					NEW.observation_store_request_json)<>8
				OR NOT (NEW.observation_store_request_json ?& ARRAY[
					'format','version','purpose','authorizationRequest',
					'authorizationRequestDigest','observationProjection',
					'observationProjectionDigest','requestDigest'
				])
				OR NEW.observation_store_request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-store-request'
				OR (NEW.observation_store_request_json->>'version')::bigint<>1
				OR NEW.observation_store_request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.store'
				OR NEW.observation_store_request_json->'authorizationRequest'<>NEW.request_json
				OR NEW.observation_store_request_json->>'authorizationRequestDigest'<>
					NEW.request_digest
				OR NEW.observation_store_request_json->'observationProjection'<>
					NEW.observation_projection_json
				OR NEW.observation_store_request_json->>'observationProjectionDigest'<>
					NEW.observation_projection_digest
				OR NEW.observation_store_request_json->>'requestDigest'<>
					NEW.observation_store_request_digest
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.observation_store_request_json-'requestDigest')<>
					NEW.observation_store_request_digest
				OR jsonb_typeof(NEW.observation_projection_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(
					NEW.observation_projection_json)<>22
				OR NOT (NEW.observation_projection_json ?& ARRAY[
					'format','version','dispatchIntentDigest',
					'dispatchStageClaimReceiptDigest','transportReceiptDigest',
					'mutationKind','mutationSequence','providerConfigurationId','endpointId',
					'method','observationOutcome','resourceId','resourceRole',
					'resourceManifestDigest','httpStatus','providerRequestId',
					'requestProjectionDigest','responseProjectionDigest','responseBodyDigest',
					'responseBytes','observedAt','projectionDigest'
				])
				OR NEW.observation_projection_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-projection'
				OR (NEW.observation_projection_json->>'version')::bigint<>1
				OR NEW.observation_projection_json->>'dispatchIntentDigest'<>
					NEW.dispatch_intent_digest
				OR NEW.observation_projection_json->>'dispatchStageClaimReceiptDigest'<>
					NEW.dispatch_stage_claim_receipt_digest
				OR NEW.observation_projection_json->>'transportReceiptDigest'<>
					NEW.transport_receipt_digest
				OR NEW.observation_projection_json->>'mutationKind'<>NEW.mutation_kind
				OR (NEW.observation_projection_json->>'mutationSequence')::bigint<>
					NEW.mutation_sequence
				OR NEW.observation_projection_json->>'providerConfigurationId'<>
					NEW.request_json->>'providerConfigurationId'
				OR NEW.observation_projection_json->>'endpointId'<>
					NEW.request_json->>'endpointId'
				OR NEW.observation_projection_json->>'method'<>'GET'
				OR NEW.observation_projection_json->>'observationOutcome'<>
					NEW.observation_outcome
				OR NEW.observation_projection_json->>'resourceId' IS DISTINCT FROM NEW.resource_id
				OR NEW.observation_projection_json->>'resourceRole' IS DISTINCT FROM NEW.resource_role
				OR NEW.observation_projection_json->>'resourceManifestDigest' IS DISTINCT FROM
					NEW.resource_manifest_digest
				OR (NEW.observation_projection_json->>'httpStatus')::bigint<>NEW.http_status
				OR NEW.observation_projection_json->>'providerRequestId' IS DISTINCT FROM
					NEW.provider_request_id
				OR NEW.observation_projection_json->>'requestProjectionDigest'
					!~ '^sha256-[a-f0-9]{64}$'
				OR NEW.observation_projection_json->>'responseProjectionDigest'
					!~ '^sha256-[a-f0-9]{64}$'
				OR NEW.observation_projection_json->>'responseBodyDigest'
					!~ '^sha256-[a-f0-9]{64}$'
				OR (NEW.observation_projection_json->>'responseBytes')::bigint
					NOT BETWEEN 0 AND 16777216
				OR (NEW.observation_projection_json->>'observedAt')::timestamptz<>NEW.observed_at
				OR NEW.observation_projection_json->>'projectionDigest'<>
					NEW.observation_projection_digest
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.observation_projection_json-'projectionDigest')<>
					NEW.observation_projection_digest
				OR NEW.observed_at<NEW.requested_at
				OR NEW.owner_ledger_revision<>0
				OR (NEW.mutation_kind='delete-resource' AND NOT (
					(NEW.observation_outcome='already-absent' AND NEW.http_status=404)
					OR (NEW.observation_outcome='deleted' AND NEW.http_status BETWEEN 200 AND 299)))
				OR (NEW.mutation_kind<>'delete-resource'
					AND NEW.http_status NOT BETWEEN 200 AND 299) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle reconciliation observation is not bounded proof'
					USING ERRCODE='23514';
			END IF;
			NEW.owner_ledger_revision:=
				advance_agent_evaluation_hosted_runtime_lifecycle_owner_ledger(
					NEW.namespace_id,NEW.observed_at);
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_reconciliation_exact
			BEFORE INSERT
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_reconciliation_observation()`,
		`CREATE OR REPLACE FUNCTION store_agent_evaluation_hosted_runtime_lifecycle_reconciliation_observation(
			candidate_namespace_id TEXT,candidate_store_request_json JSONB,
			candidate_store_request_bytes BYTEA,candidate_observation_authority_issuer_id TEXT,
			candidate_observation_authority_implementation_digest TEXT
		) RETURNS TABLE (
			receipt_json JSONB,receipt_bytes BYTEA,receipt_digest TEXT,
			owner_ledger_revision BIGINT
		) LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			existing agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations%ROWTYPE;
			prior_observation agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations%ROWTYPE;
			intent_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents%ROWTYPE;
			authorization_request JSONB:=candidate_store_request_json->'authorizationRequest';
			projection JSONB:=candidate_store_request_json->'observationProjection';
			store_request_digest_value TEXT:=candidate_store_request_json->>'requestDigest';
			authorization_request_digest_value TEXT:=
				candidate_store_request_json->>'authorizationRequestDigest';
			projection_digest_value TEXT:=
				candidate_store_request_json->>'observationProjectionDigest';
			receipt_base JSONB;
			receipt_value JSONB;
			receipt_digest_value TEXT;
			ledger_revision_value BIGINT;
		BEGIN
			IF candidate_namespace_id IS NULL OR store_request_digest_value IS NULL
				OR authorization_request_digest_value IS NULL
				OR projection_digest_value IS NULL THEN
				RAISE EXCEPTION 'hosted runtime lifecycle reconciliation store request is incomplete'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(candidate_namespace_id||chr(31)||
				store_request_digest_value||chr(31)||'lifecycle-reconciliation-store',0));
			SELECT * INTO existing
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations
			WHERE namespace_id=candidate_namespace_id
				AND observation_store_request_digest=store_request_digest_value
			FOR UPDATE;
			IF existing.receipt_digest IS NOT NULL THEN
				IF existing.observation_store_request_json<>candidate_store_request_json
					OR existing.observation_store_request_bytes<>
						candidate_store_request_bytes THEN
					RAISE EXCEPTION 'hosted runtime lifecycle reconciliation store replay changed bytes'
						USING ERRCODE='23514';
				END IF;
				RETURN QUERY SELECT existing.receipt_json,existing.receipt_bytes,
					existing.receipt_digest,existing.owner_ledger_revision;
				RETURN;
			END IF;
			IF jsonb_typeof(candidate_store_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(candidate_store_request_json)<>8
				OR store_request_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR authorization_request_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR projection_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR candidate_store_request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-store-request'
				OR (candidate_store_request_json->>'version')::bigint<>1
				OR candidate_store_request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.store'
				OR agent_evaluation_canonical_jsonb_digest(
					candidate_store_request_json-'requestDigest')<>store_request_digest_value
				OR candidate_store_request_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(candidate_store_request_json),'UTF8')
				OR candidate_observation_authority_issuer_id !~
					'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				OR candidate_observation_authority_implementation_digest !~
					'^sha256-[a-f0-9]{64}$' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle reconciliation store request is invalid'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(candidate_namespace_id||chr(31)||
				authorization_request->>'transportReceiptDigest'||chr(31)||
				'lifecycle-reconciliation-observation',0));
			SELECT * INTO prior_observation
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations
			WHERE namespace_id=candidate_namespace_id
				AND (request_digest=authorization_request_digest_value
					OR transport_receipt_digest=authorization_request->>'transportReceiptDigest'
					OR observation_projection_digest=projection_digest_value)
			LIMIT 1 FOR UPDATE;
			IF prior_observation.receipt_digest IS NOT NULL THEN
				RAISE EXCEPTION 'hosted runtime lifecycle reconciliation observation lost first-store CAS'
					USING ERRCODE='40001';
			END IF;
			SELECT * INTO intent_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents
			WHERE namespace_id=candidate_namespace_id
				AND intent_digest=authorization_request->>'dispatchIntentDigest'
			FOR SHARE;
			IF intent_row.intent_digest IS NULL THEN
				RAISE EXCEPTION 'hosted runtime lifecycle reconciliation intent is unavailable'
					USING ERRCODE='23514';
			END IF;
			receipt_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-receipt',
				'version',1,'request',authorization_request,
				'requestDigest',authorization_request_digest_value,
				'observationAuthorityIssuerId',candidate_observation_authority_issuer_id,
				'observationAuthorityImplementationDigest',
					candidate_observation_authority_implementation_digest,
				'dispatchIntentDigest',authorization_request->>'dispatchIntentDigest',
				'dispatchStageClaimReceiptDigest',
					authorization_request->>'dispatchStageClaimReceiptDigest',
				'transportReceiptDigest',authorization_request->>'transportReceiptDigest',
				'mutationKind',authorization_request->>'mutationKind',
				'mutationSequence',(authorization_request->>'mutationSequence')::bigint,
				'observationOutcome',projection->>'observationOutcome',
				'resourceId',projection->'resourceId','resourceRole',projection->'resourceRole',
				'resourceManifestDigest',projection->'resourceManifestDigest',
				'httpStatus',(projection->>'httpStatus')::bigint,
				'providerRequestId',projection->'providerRequestId',
				'observedAt',projection->'observedAt');
			receipt_digest_value:=agent_evaluation_canonical_jsonb_digest(receipt_base);
			receipt_value:=receipt_base||jsonb_build_object(
				'receiptDigest',receipt_digest_value);
			INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations(
				namespace_id,registration_request_digest,operation,dispatch_intent_digest,
				dispatch_stage_claim_receipt_digest,transport_receipt_digest,mutation_kind,
				mutation_sequence,request_digest,observation_store_request_digest,
				observation_projection_digest,receipt_digest,observation_outcome,resource_id,
				resource_role,resource_manifest_digest,http_status,provider_request_id,
				observation_authority_issuer_id,observation_authority_implementation_digest,
				owner_ledger_revision,requested_at,observed_at,request_json,request_bytes,
				observation_store_request_json,observation_store_request_bytes,
				observation_projection_json,observation_projection_bytes,
				receipt_json,receipt_bytes
			) VALUES (
				candidate_namespace_id,intent_row.registration_request_digest,intent_row.operation,
				intent_row.intent_digest,
				authorization_request->>'dispatchStageClaimReceiptDigest',
				authorization_request->>'transportReceiptDigest',intent_row.mutation_kind,
				intent_row.mutation_sequence,authorization_request_digest_value,
				store_request_digest_value,projection_digest_value,receipt_digest_value,
				projection->>'observationOutcome',projection->>'resourceId',
				projection->>'resourceRole',projection->>'resourceManifestDigest',
				(projection->>'httpStatus')::bigint,projection->>'providerRequestId',
				candidate_observation_authority_issuer_id,
				candidate_observation_authority_implementation_digest,0,
				(authorization_request->>'requestedAt')::timestamptz,
				(projection->>'observedAt')::timestamptz,authorization_request,
				convert_to(agent_evaluation_canonical_jsonb_text(authorization_request),'UTF8'),
				candidate_store_request_json,candidate_store_request_bytes,projection,
				convert_to(agent_evaluation_canonical_jsonb_text(projection),'UTF8'),receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8')
			) RETURNING agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations.owner_ledger_revision
			INTO ledger_revision_value;
			RETURN QUERY SELECT receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8'),
				receipt_digest_value,ledger_revision_value;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_lifecycle_reconciliation_set(
			candidate_namespace_id TEXT,candidate_registration_request_digest TEXT,
			candidate_operation TEXT
		) RETURNS JSONB LANGUAGE plpgsql STABLE PARALLEL RESTRICTED AS $$
		DECLARE
			unknown_count BIGINT;
			observation_count BIGINT;
			sequence_exact BOOLEAN;
			receipts JSONB;
			receipt_digests JSONB;
			set_base JSONB;
			set_digest TEXT;
		BEGIN
			SELECT COUNT(*) INTO unknown_count
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents intent
			JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts transport
			  ON transport.namespace_id=intent.namespace_id
			 AND transport.intent_digest=intent.intent_digest
			WHERE intent.namespace_id=candidate_namespace_id
				AND intent.registration_request_digest=candidate_registration_request_digest
				AND intent.operation=candidate_operation
				AND transport.outcome='post-dispatch-unknown';
			WITH ordered AS (
				SELECT observation.*,
					row_number() OVER (ORDER BY mutation_sequence)-1 AS expected_sequence
				FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations observation
				WHERE observation.namespace_id=candidate_namespace_id
					AND observation.registration_request_digest=
						candidate_registration_request_digest
					AND observation.operation=candidate_operation
			)
			SELECT COUNT(*),COALESCE(bool_and(mutation_sequence=expected_sequence),FALSE),
				jsonb_agg(receipt_json ORDER BY mutation_sequence),
				jsonb_agg(to_jsonb(receipt_digest) ORDER BY mutation_sequence)
			INTO observation_count,sequence_exact,receipts,receipt_digests
			FROM ordered;
			IF unknown_count<1 OR observation_count<>unknown_count OR NOT sequence_exact THEN
				RETURN NULL;
			END IF;
			set_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-receipt-set',
				'version',1,'operation',candidate_operation,
				'registrationRequestDigest',candidate_registration_request_digest,
				'receipts',receipts,'receiptDigests',receipt_digests
			);
			set_digest:=agent_evaluation_canonical_jsonb_digest(set_base);
			RETURN set_base||jsonb_build_object('setDigest',set_digest);
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION resolve_agent_evaluation_hosted_runtime_lifecycle_unfinished()
			RETURNS trigger AS $$
		DECLARE
			observation_set JSONB;
		BEGIN
			observation_set:=agent_evaluation_hosted_runtime_lifecycle_reconciliation_set(
				NEW.namespace_id,NEW.registration_request_digest,NEW.operation);
			IF observation_set IS NOT NULL THEN
				UPDATE agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations
				SET state='resolved',current_revision=current_revision+1,
					latest_reconciliation_observation_digest=observation_set->>'setDigest',
					updated_at=GREATEST(updated_at,NEW.observed_at)
				WHERE namespace_id=NEW.namespace_id
					AND registration_request_digest=NEW.registration_request_digest
					AND operation=NEW.operation AND state='pending';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_reconciliation_resolve
			AFTER INSERT
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations
			FOR EACH ROW EXECUTE FUNCTION resolve_agent_evaluation_hosted_runtime_lifecycle_unfinished()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_reconciliation_immutable
			BEFORE UPDATE OR DELETE
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_reconciliation_observations
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_journal_seal()
			RETURNS trigger AS $$
		DECLARE
			spool_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools%ROWTYPE;
			unfinished_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations%ROWTYPE;
			expected_observation_set JSONB;
			unknown_count BIGINT;
			intent_count BIGINT;
			sealed_count BIGINT;
			business_result JSONB:=NEW.record_json->'businessResult';
		BEGIN
			SELECT * INTO spool_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			WHERE namespace_id=NEW.namespace_id AND spool_ref=NEW.result_spool_ref
			FOR SHARE;
			SELECT * INTO unfinished_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_operations
			WHERE namespace_id=NEW.namespace_id
				AND registration_request_digest=NEW.registration_request_digest
				AND operation=NEW.operation
			FOR SHARE;
			SELECT COUNT(*) INTO unknown_count
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents intent
			JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts transport
			  ON transport.namespace_id=intent.namespace_id
			 AND transport.intent_digest=intent.intent_digest
			WHERE intent.namespace_id=NEW.namespace_id
				AND intent.registration_request_digest=NEW.registration_request_digest
				AND intent.operation=NEW.operation
				AND transport.outcome='post-dispatch-unknown';
			expected_observation_set:=agent_evaluation_hosted_runtime_lifecycle_reconciliation_set(
				NEW.namespace_id,NEW.registration_request_digest,NEW.operation);
			IF spool_row.spool_ref IS NULL OR spool_row.state<>'destroyed'
				OR spool_row.disposition<>'destroyed-after-business-seal'
				OR spool_row.business_seal_kind='recovery-pending'
				OR spool_row.spool_receipt_digest<>NEW.result_spool_receipt_digest
				OR spool_row.disposition_receipt_digest<>
					NEW.result_spool_disposition_receipt_digest
				OR spool_row.registration_request_digest<>NEW.registration_request_digest
				OR spool_row.operation<>NEW.operation
				OR jsonb_typeof(NEW.record_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.record_json)<>21
				OR NOT (NEW.record_json ?& ARRAY[
					'format','version','operation','registrationRequestDigest','authorityDigest',
					'lifecycleClaimReceiptDigest','dispatchIntentSet','dispatchIntentSetDigest',
					'dispatchStageClaimReceiptSet','dispatchStageClaimReceiptSetDigest',
					'dispatchStageClaimHistorySet','dispatchStageClaimHistorySetDigest',
					'transportReceiptSet','transportReceiptSetDigest','businessResult',
					'businessResultDigest','resultSpoolReceipt','resultSpoolReceiptDigest',
					'resultSpoolDispositionReceipt','resultSpoolDispositionReceiptDigest','recordDigest'
				])
				OR NEW.record_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-record'
				OR (NEW.record_json->>'version')::bigint<>1
				OR NEW.record_json->>'operation'<>NEW.operation
				OR NEW.record_json->>'registrationRequestDigest'<>
					NEW.registration_request_digest
				OR NEW.record_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
				OR NEW.record_json->>'lifecycleClaimReceiptDigest' IS DISTINCT FROM
					NEW.lifecycle_claim_receipt_digest
				OR NEW.record_json->>'dispatchIntentSetDigest'<>
					NEW.record_json#>>'{dispatchIntentSet,setDigest}'
				OR NEW.record_json->>'dispatchStageClaimReceiptSetDigest'<>
					NEW.record_json#>>'{dispatchStageClaimReceiptSet,setDigest}'
				OR NEW.record_json->>'dispatchStageClaimHistorySetDigest'<>
					NEW.record_json#>>'{dispatchStageClaimHistorySet,setDigest}'
				OR jsonb_typeof(NEW.record_json->'dispatchStageClaimHistorySet')<>'object'
				OR agent_evaluation_jsonb_object_key_count(
					NEW.record_json->'dispatchStageClaimHistorySet')<>10
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.record_json->'dispatchStageClaimHistorySet'-'setDigest')<>
					NEW.record_json->>'dispatchStageClaimHistorySetDigest'
				OR NOT agent_evaluation_hosted_runtime_lifecycle_claim_history_is_prefix(
					spool_row.transport_store_request_json->'dispatchStageClaimHistorySet',
					NEW.record_json->'dispatchStageClaimHistorySet')
				OR NEW.record_json#>'{dispatchStageClaimHistorySet,receipts}' IS DISTINCT FROM (
					SELECT jsonb_agg(receipt.receipt_json ORDER BY intent_order.ordinality,
						receipt.claimed_at,receipt.receipt_digest COLLATE "C")
					FROM jsonb_array_elements_text(NEW.record_json#>
						'{dispatchIntentSet,intentDigests}')
						WITH ORDINALITY intent_order(intent_digest,ordinality)
					JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts receipt
					  ON receipt.namespace_id=NEW.namespace_id
					 AND receipt.intent_digest=intent_order.intent_digest)
				OR NEW.record_json#>'{dispatchStageClaimHistorySet,receiptDigests}'
					IS DISTINCT FROM (
					SELECT jsonb_agg(to_jsonb(receipt.receipt_digest)
						ORDER BY intent_order.ordinality,receipt.claimed_at,
							receipt.receipt_digest COLLATE "C")
					FROM jsonb_array_elements_text(NEW.record_json#>
						'{dispatchIntentSet,intentDigests}')
						WITH ORDINALITY intent_order(intent_digest,ordinality)
					JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts receipt
					  ON receipt.namespace_id=NEW.namespace_id
					 AND receipt.intent_digest=intent_order.intent_digest)
				OR NEW.record_json->>'transportReceiptSetDigest'<>
					NEW.record_json#>>'{transportReceiptSet,setDigest}'
				OR NEW.record_json->>'businessResultDigest'<>business_result->>'resultDigest'
				OR NEW.record_json->>'businessResultDigest'<>spool_row.business_result_digest
				OR NEW.record_json->'resultSpoolReceipt'<>spool_row.spool_receipt_json
				OR NEW.record_json->>'resultSpoolReceiptDigest'<>spool_row.spool_receipt_digest
				OR NEW.record_json->'resultSpoolDispositionReceipt'<>
					spool_row.disposition_receipt_json
				OR NEW.record_json->>'resultSpoolDispositionReceiptDigest'<>
					spool_row.disposition_receipt_digest
				OR NEW.record_json->>'recordDigest'<>NEW.record_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.record_json-'recordDigest')<>
					NEW.record_digest
				OR business_result->>'outcome'='provider-outcome-unresolved'
				OR (business_result->>'completedAt')::timestamptz<>NEW.completed_at
				OR (unknown_count=0 AND (
					business_result->'reconciliationObservationReceiptSet'<>'null'::jsonb
					OR business_result->'reconciliationObservationReceiptSetDigest'<>'null'::jsonb))
				OR (unknown_count>0 AND (
					unfinished_row.state<>'resolved' OR expected_observation_set IS NULL
					OR business_result->'reconciliationObservationReceiptSet'<>
						expected_observation_set
					OR business_result->>'reconciliationObservationReceiptSetDigest'<>
						unfinished_row.latest_reconciliation_observation_digest)) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle final journal lacks bounded known outcome proof'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*) INTO intent_count
			FROM jsonb_array_elements(NEW.record_json#>'{dispatchIntentSet,intents}');
			UPDATE agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current current_claim
			SET current_revision=current_revision+1,
				sealed_journal_record_digest=NEW.record_digest,
				updated_at=GREATEST(updated_at,NEW.completed_at)
			FROM jsonb_array_elements(NEW.record_json#>'{dispatchIntentSet,intents}') intent
			WHERE current_claim.namespace_id=NEW.namespace_id
				AND current_claim.intent_digest=intent->>'intentDigest'
				AND current_claim.prior_transport_receipt_digest IS NOT NULL
				AND current_claim.sealed_journal_record_digest IS NULL;
			GET DIAGNOSTICS sealed_count=ROW_COUNT;
			IF intent_count<1 OR sealed_count<>intent_count THEN
				RAISE EXCEPTION 'hosted runtime lifecycle final journal lost claim-current CAS'
					USING ERRCODE='40001';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_journal_exact
			BEFORE INSERT
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_journal_seal()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_journal_immutable
			BEFORE UPDATE OR DELETE
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}
}
