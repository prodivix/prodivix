package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ConstraintStatements
// validates the v6 lifecycle wire and exposes the only first-delivery claim
// transition. Provider dispatch authority is consumed exactly once per intent;
// replay can only reconcile the already-authorized generation.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_dispatch_intent()
			RETURNS trigger AS $$
		DECLARE
			request_row agent_evaluation_hosted_retrieval_runtime_resource_registration_requests%ROWTYPE;
			registration_row agent_evaluation_hosted_retrieval_runtime_resource_registration_results%ROWTYPE;
			partial_prepare agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_prepares%ROWTYPE;
			partial_current agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_claim_current%ROWTYPE;
			expected_mutation_kind TEXT;
		BEGIN
			SELECT * INTO request_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_requests
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND request_digest=NEW.registration_request_digest
			FOR SHARE;
			SELECT * INTO registration_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND registration_request_digest=NEW.registration_request_digest
			FOR SHARE;
			SELECT * INTO partial_prepare
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_prepares
			WHERE namespace_id=NEW.namespace_id
				AND registration_request_digest=NEW.registration_request_digest
			FOR SHARE;
			SELECT * INTO partial_current
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_partial_cleanup_claim_current
			WHERE namespace_id=NEW.namespace_id
				AND registration_request_digest=NEW.registration_request_digest
			FOR SHARE;
			expected_mutation_kind:=CASE
				WHEN NEW.operation='delete' THEN 'delete-resource'
				WHEN NEW.protocol_family='gemini-interactions' AND NEW.mutation_sequence=0
					THEN 'create-primary'
				WHEN NEW.protocol_family='gemini-interactions' AND NEW.mutation_sequence=1
					THEN 'upload-content-start'
				WHEN NEW.protocol_family='gemini-interactions' AND NEW.mutation_sequence=2
					THEN 'upload-content-finalize'
				WHEN NEW.protocol_family='openai-responses' AND NEW.mutation_sequence=0
					THEN 'upload-content'
				WHEN NEW.protocol_family='openai-responses' AND NEW.mutation_sequence=1
					THEN 'create-primary'
				ELSE NULL END;
			IF request_row.request_digest IS NULL OR expected_mutation_kind IS NULL
				OR NEW.mutation_kind<>expected_mutation_kind
				OR NEW.runtime_resource_set_id<>request_row.runtime_resource_set_id
				OR NEW.protocol_family<>request_row.protocol_family
				OR NEW.capability_profile_id<>request_row.capability_profile_id
				OR NEW.budget_reservation_id<>
					request_row.request_json#>>'{budgetReservationAuthority,reservationId}'
				OR NEW.budget_reservation_authority_digest<>
					request_row.request_json->>'budgetReservationAuthorityDigest'
				OR (NEW.operation='delete' AND NOT (
					(registration_row.authority_digest IS NOT NULL
						AND NEW.authority_digest=registration_row.authority_digest
						AND EXISTS (
							SELECT 1
							FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts claim
							WHERE claim.namespace_id=NEW.namespace_id
								AND claim.receipt_digest=NEW.lifecycle_claim_receipt_digest
								AND claim.authority_digest=NEW.authority_digest
						))
					OR (registration_row.registration_request_digest IS NULL
						AND partial_prepare.registration_request_digest IS NOT NULL
						AND partial_prepare.plan_digest=NEW.plan_digest
						AND partial_prepare.repository_commit=NEW.repository_commit
						AND partial_prepare.runtime_resource_set_id=NEW.runtime_resource_set_id
						AND partial_prepare.state='cleanup-claimed'
						AND partial_current.current_claim_receipt_digest=
							NEW.lifecycle_claim_receipt_digest
						AND partial_current.partial_cleanup_authority_digest=
							NEW.authority_digest
						AND partial_current.claim_expires_at>NEW.created_at
						AND EXISTS (
							SELECT 1
							FROM jsonb_array_elements(
								partial_prepare.known_resource_ids_json) known
							WHERE known->>'resourceId'=NEW.intent_json->>'resourceId'
								AND known->>'resourceRole'=NEW.intent_json->>'resourceRole'
						))
				))
				OR jsonb_typeof(NEW.intent_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.intent_json)<>35
				OR NOT (NEW.intent_json ?& ARRAY[
					'format','version','intentId','lifecycleOwnerAuthorityIssuerId',
					'lifecycleOwnerImplementationDigest','namespaceId','repositoryCommit',
					'planDigest','frozenRunDigest','runConfigArtifactBindingDigest',
					'runtimeResourceSetId','registrationIntentDigest','registrationRequestDigest',
					'authorityDigest','lifecycleClaimReceiptDigest','protocolFamily',
					'capabilityProfileId','providerConfigurationId','providerConfigurationDigest',
					'budgetReservationId','budgetReservationAuthorityDigest','operation',
					'mutationKind','mutationSequence','resourceId','resourceRole','endpointId',
					'endpointClass','method','requestProjectionDigest','requestBodyDigest',
					'requestBytes','providerIdempotencyKeyBinding','createdAt','intentDigest'
				])
				OR NEW.intent_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-intent'
				OR (NEW.intent_json->>'version')::bigint<>1
				OR NEW.intent_json->>'intentId'<>NEW.intent_id
				OR NEW.intent_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.intent_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.intent_json->>'planDigest'<>NEW.plan_digest
				OR NEW.intent_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR NEW.intent_json->>'registrationRequestDigest'<>NEW.registration_request_digest
				OR NEW.intent_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
				OR NEW.intent_json->>'lifecycleClaimReceiptDigest' IS DISTINCT FROM
					NEW.lifecycle_claim_receipt_digest
				OR NEW.intent_json->>'protocolFamily'<>NEW.protocol_family
				OR NEW.intent_json->>'capabilityProfileId'<>NEW.capability_profile_id
				OR NEW.intent_json->>'budgetReservationId'<>NEW.budget_reservation_id
				OR NEW.intent_json->>'budgetReservationAuthorityDigest'<>
					NEW.budget_reservation_authority_digest
				OR NEW.intent_json->>'operation'<>NEW.operation
				OR NEW.intent_json->>'mutationKind'<>NEW.mutation_kind
				OR (NEW.intent_json->>'mutationSequence')::bigint<>NEW.mutation_sequence
				OR (NEW.intent_json->>'createdAt')::timestamptz<>NEW.created_at
				OR NEW.intent_json->>'intentDigest'<>NEW.intent_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.intent_json-'intentDigest')<>
					NEW.intent_digest THEN
				RAISE EXCEPTION 'hosted runtime lifecycle dispatch intent drifted from its durable registration'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_dispatch_intents_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_dispatch_intent()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_dispatch_intents_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_claim_current()
			RETURNS trigger AS $$
		DECLARE
			receipt_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts%ROWTYPE;
			request_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests%ROWTYPE;
		BEGIN
			IF TG_OP='DELETE' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle current claim cannot be deleted'
					USING ERRCODE='23514';
			END IF;
			SELECT * INTO receipt_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.current_claim_receipt_digest
			FOR SHARE;
			IF receipt_row.receipt_digest IS NULL
				OR receipt_row.intent_digest<>NEW.intent_digest
				OR receipt_row.dispatch_ledger_revision<>NEW.dispatch_ledger_revision
				OR receipt_row.dispatch_generation<>NEW.dispatch_generation
				OR receipt_row.lifecycle_owner_instance_id<>NEW.lifecycle_owner_instance_id
				OR receipt_row.claim_expires_at<>NEW.claim_expires_at
				OR (receipt_row.prior_transport_receipt_digest IS NOT NULL
					AND receipt_row.prior_transport_receipt_digest IS DISTINCT FROM
						NEW.prior_transport_receipt_digest)
				OR (receipt_row.sealed_journal_record_digest IS NOT NULL
					AND receipt_row.sealed_journal_record_digest IS DISTINCT FROM
						NEW.sealed_journal_record_digest) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle current claim lost its history receipt'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='INSERT' THEN
				IF NEW.current_revision<>1 OR NEW.dispatch_ledger_revision<>1
					OR NEW.dispatch_generation<>1
					OR receipt_row.generation_transition<>'initial-first-delivery'
					OR receipt_row.delivery_disposition<>
						'dispatch-authorized-first-delivery'
					OR receipt_row.prior_transport_receipt_digest IS DISTINCT FROM
						NEW.prior_transport_receipt_digest
					OR receipt_row.sealed_journal_record_digest IS DISTINCT FROM
						NEW.sealed_journal_record_digest THEN
					RAISE EXCEPTION 'hosted runtime lifecycle first-delivery current state is invalid'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.namespace_id<>OLD.namespace_id OR NEW.intent_digest<>OLD.intent_digest
				OR NOT OLD.ever_dispatch_authorized OR NOT NEW.ever_dispatch_authorized
				OR NEW.current_revision<>OLD.current_revision+1
				OR NEW.updated_at<OLD.updated_at
				OR (OLD.prior_transport_receipt_digest IS NOT NULL
					AND NEW.prior_transport_receipt_digest<>
						OLD.prior_transport_receipt_digest)
				OR (OLD.sealed_journal_record_digest IS NOT NULL
					AND NEW.sealed_journal_record_digest<>
						OLD.sealed_journal_record_digest) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle current claim is non-monotonic'
					USING ERRCODE='23514';
			ELSIF NEW.current_claim_receipt_digest=OLD.current_claim_receipt_digest THEN
				IF NEW.dispatch_ledger_revision<>OLD.dispatch_ledger_revision
					OR NEW.dispatch_generation<>OLD.dispatch_generation
					OR NEW.lifecycle_owner_instance_id<>OLD.lifecycle_owner_instance_id
					OR NEW.claim_expires_at<>OLD.claim_expires_at THEN
					RAISE EXCEPTION 'hosted runtime lifecycle enrichment changed claim authority'
						USING ERRCODE='23514';
				END IF;
			ELSE
				SELECT * INTO request_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests
				WHERE namespace_id=NEW.namespace_id AND request_digest=receipt_row.request_digest
				FOR SHARE;
				IF request_row.request_digest IS NULL
					OR request_row.expected_dispatch_ledger_revision<>
						OLD.dispatch_ledger_revision
					OR request_row.expected_dispatch_generation<>OLD.dispatch_generation
					OR request_row.expected_prior_stage_claim_receipt_digest<>
						OLD.current_claim_receipt_digest
					OR request_row.expected_prior_claim_expires_at<>OLD.claim_expires_at
					OR receipt_row.prior_transport_receipt_digest IS DISTINCT FROM
						OLD.prior_transport_receipt_digest
					OR receipt_row.sealed_journal_record_digest IS DISTINCT FROM
						OLD.sealed_journal_record_digest
					OR NEW.prior_transport_receipt_digest IS DISTINCT FROM
						receipt_row.prior_transport_receipt_digest
					OR NEW.sealed_journal_record_digest IS DISTINCT FROM
						receipt_row.sealed_journal_record_digest
					OR (receipt_row.generation_transition='expired-owner-takeover' AND (
						OLD.sealed_journal_record_digest IS NOT NULL
						OR request_row.requested_at<OLD.claim_expires_at
						OR NEW.dispatch_generation<>OLD.dispatch_generation+1
						OR NEW.dispatch_ledger_revision<>OLD.dispatch_ledger_revision+1
						OR receipt_row.delivery_disposition<>'reconcile-only-replay'))
					OR (receipt_row.generation_transition='generation-retained' AND (
						NEW.dispatch_generation<>OLD.dispatch_generation
						OR NEW.dispatch_ledger_revision<>OLD.dispatch_ledger_revision
						OR receipt_row.delivery_disposition<>CASE
							WHEN OLD.sealed_journal_record_digest IS NULL
							THEN 'reconcile-only-replay' ELSE 'sealed-read-only' END))
					OR receipt_row.generation_transition='initial-first-delivery' THEN
					RAISE EXCEPTION 'hosted runtime lifecycle generation CAS drifted'
						USING ERRCODE='40001';
				END IF;
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_claim_current_exact
			BEFORE INSERT OR UPDATE OR DELETE
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_claim_current()`,
		`CREATE OR REPLACE FUNCTION claim_agent_evaluation_hosted_runtime_lifecycle_dispatch(
			candidate_namespace_id TEXT,
			candidate_intent_digest TEXT,
			candidate_request_json JSONB,
			candidate_request_bytes BYTEA,
			candidate_dispatch_authority_issuer_id TEXT,
			candidate_dispatch_authority_implementation_digest TEXT,
			candidate_claimed_at TIMESTAMPTZ,
			candidate_claim_expires_at TIMESTAMPTZ
		) RETURNS TABLE (
			receipt_json JSONB,
			receipt_bytes BYTEA,
			receipt_digest TEXT,
			generation_transition TEXT,
			delivery_disposition TEXT,
			dispatch_generation BIGINT,
			dispatch_ledger_revision BIGINT
		) LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			intent_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents%ROWTYPE;
			current_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current%ROWTYPE;
			request_digest_value TEXT;
			owner_instance_id TEXT;
			expected_ledger_revision BIGINT;
			expected_generation BIGINT;
			expected_prior_receipt_digest TEXT;
			expected_prior_claim_expires_at TIMESTAMPTZ;
			requested_at_value TIMESTAMPTZ;
			minimum_expires_at_value TIMESTAMPTZ;
			prior_receipt_digest TEXT;
			sealed_record_digest TEXT;
			receipt_base JSONB;
		BEGIN
			IF candidate_namespace_id IS NULL OR candidate_intent_digest IS NULL
				OR candidate_dispatch_authority_issuer_id IS NULL
				OR candidate_dispatch_authority_implementation_digest !~ '^sha256-[a-f0-9]{64}$'
				OR jsonb_typeof(candidate_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(candidate_request_json)<>12
				OR NOT (candidate_request_json ?& ARRAY[
					'format','version','purpose','dispatchIntentDigest','lifecycleOwnerInstanceId',
					'expectedDispatchLedgerRevision','expectedDispatchGeneration',
					'expectedPriorStageClaimReceiptDigest','expectedPriorClaimExpiresAt',
					'requestedAt','minimumClaimExpiresAt','requestDigest'
				])
				OR candidate_request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-request'
				OR (candidate_request_json->>'version')::bigint<>1
				OR candidate_request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim'
				OR candidate_request_json->>'dispatchIntentDigest'<>candidate_intent_digest
				OR candidate_request_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(candidate_request_json),'UTF8') THEN
				RAISE EXCEPTION 'hosted runtime lifecycle dispatch claim request is invalid'
					USING ERRCODE='23514';
			END IF;
			request_digest_value:=candidate_request_json->>'requestDigest';
			owner_instance_id:=candidate_request_json->>'lifecycleOwnerInstanceId';
			expected_ledger_revision:=
				(candidate_request_json->>'expectedDispatchLedgerRevision')::bigint;
			expected_generation:=(candidate_request_json->>'expectedDispatchGeneration')::bigint;
			expected_prior_receipt_digest:=
				candidate_request_json->>'expectedPriorStageClaimReceiptDigest';
			expected_prior_claim_expires_at:=
				(candidate_request_json->>'expectedPriorClaimExpiresAt')::timestamptz;
			requested_at_value:=(candidate_request_json->>'requestedAt')::timestamptz;
			minimum_expires_at_value:=
				(candidate_request_json->>'minimumClaimExpiresAt')::timestamptz;
			IF request_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR agent_evaluation_canonical_jsonb_digest(
					candidate_request_json-'requestDigest')<>request_digest_value
				OR expected_ledger_revision<0 OR expected_generation<0
				OR (expected_generation=0 AND (
					expected_ledger_revision<>0 OR expected_prior_receipt_digest IS NOT NULL
					OR expected_prior_claim_expires_at IS NOT NULL))
				OR (expected_generation>0 AND (
					expected_ledger_revision<expected_generation
					OR expected_prior_receipt_digest !~ '^sha256-[a-f0-9]{64}$'
					OR expected_prior_claim_expires_at IS NULL))
				OR minimum_expires_at_value<=requested_at_value
				OR minimum_expires_at_value>requested_at_value+INTERVAL '125 seconds'
				OR candidate_claimed_at<requested_at_value
				OR candidate_claim_expires_at<minimum_expires_at_value
				OR candidate_claim_expires_at>candidate_claimed_at+INTERVAL '125 seconds' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle dispatch claim time or digest is invalid'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(
				candidate_namespace_id||chr(31)||candidate_intent_digest||chr(31)||
				'hosted-runtime-lifecycle-first-delivery',0));
			SELECT * INTO intent_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents
			WHERE namespace_id=candidate_namespace_id AND intent_digest=candidate_intent_digest
			FOR SHARE;
			IF intent_row.intent_digest IS NULL THEN
				RAISE EXCEPTION 'hosted runtime lifecycle dispatch intent is absent'
					USING ERRCODE='23514';
			END IF;
			SELECT * INTO current_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current
			WHERE namespace_id=candidate_namespace_id AND intent_digest=candidate_intent_digest
			FOR UPDATE;
			IF current_row.intent_digest IS NULL THEN
				IF expected_generation<>0 OR expected_ledger_revision<>0
					OR expected_prior_receipt_digest IS NOT NULL
					OR expected_prior_claim_expires_at IS NOT NULL THEN
					RAISE EXCEPTION 'hosted runtime lifecycle first delivery generation drifted'
						USING ERRCODE='40001';
				END IF;
				delivery_disposition:='dispatch-authorized-first-delivery';
				dispatch_generation:=1;
				dispatch_ledger_revision:=1;
				generation_transition:='initial-first-delivery';
				prior_receipt_digest:=NULL;
				sealed_record_digest:=NULL;
			ELSE
				IF NOT current_row.ever_dispatch_authorized
					OR expected_ledger_revision<>current_row.dispatch_ledger_revision
					OR expected_generation<>current_row.dispatch_generation
					OR expected_prior_receipt_digest<>
						current_row.current_claim_receipt_digest
					OR expected_prior_claim_expires_at<>current_row.claim_expires_at THEN
					RAISE EXCEPTION 'hosted runtime lifecycle reconcile generation drifted'
						USING ERRCODE='40001';
				END IF;
				prior_receipt_digest:=current_row.prior_transport_receipt_digest;
				sealed_record_digest:=current_row.sealed_journal_record_digest;
				IF sealed_record_digest IS NULL
					AND requested_at_value>=current_row.claim_expires_at THEN
					dispatch_generation:=current_row.dispatch_generation+1;
					dispatch_ledger_revision:=current_row.dispatch_ledger_revision+1;
					generation_transition:='expired-owner-takeover';
					delivery_disposition:='reconcile-only-replay';
				ELSE
					IF owner_instance_id<>current_row.lifecycle_owner_instance_id THEN
						RAISE EXCEPTION 'hosted runtime lifecycle live generation owner drifted'
							USING ERRCODE='40001';
					END IF;
					dispatch_generation:=current_row.dispatch_generation;
					dispatch_ledger_revision:=current_row.dispatch_ledger_revision;
					generation_transition:='generation-retained';
					delivery_disposition:=CASE
						WHEN sealed_record_digest IS NOT NULL THEN 'sealed-read-only'
						ELSE 'reconcile-only-replay' END;
				END IF;
			END IF;
			UPDATE agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers
			SET ledger_revision=ledger_revision+1,
				updated_at=GREATEST(updated_at,candidate_claimed_at)
			WHERE namespace_id=candidate_namespace_id
			;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'hosted runtime lifecycle owner ledger is absent'
					USING ERRCODE='23514';
			END IF;
			INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests(
				namespace_id,intent_digest,request_digest,lifecycle_owner_instance_id,
				expected_dispatch_ledger_revision,expected_dispatch_generation,
				expected_prior_stage_claim_receipt_digest,expected_prior_claim_expires_at,
				requested_at,minimum_claim_expires_at,request_json,request_bytes
			) VALUES (
				candidate_namespace_id,candidate_intent_digest,request_digest_value,
				owner_instance_id,expected_ledger_revision,expected_generation,
				expected_prior_receipt_digest,expected_prior_claim_expires_at,requested_at_value,
				minimum_expires_at_value,candidate_request_json,candidate_request_bytes
			);
			receipt_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-receipt',
				'version',1,'claimRequest',candidate_request_json,
				'claimRequestDigest',request_digest_value,
				'dispatchIntentDigest',candidate_intent_digest,
				'dispatchAuthorityIssuerId',candidate_dispatch_authority_issuer_id,
				'dispatchAuthorityImplementationDigest',
					candidate_dispatch_authority_implementation_digest,
				'dispatchLedgerRevision',dispatch_ledger_revision,
				'lifecycleOwnerInstanceId',owner_instance_id,
				'dispatchGeneration',dispatch_generation,
				'generationTransition',generation_transition,
				'deliveryDisposition',delivery_disposition,
				'claimedAt',to_jsonb(candidate_claimed_at),
				'claimExpiresAt',to_jsonb(candidate_claim_expires_at),
				'priorTransportReceiptDigest',to_jsonb(prior_receipt_digest),
				'sealedJournalRecordDigest',to_jsonb(sealed_record_digest)
			);
			receipt_digest:=agent_evaluation_canonical_jsonb_digest(receipt_base);
			receipt_json:=receipt_base||jsonb_build_object('receiptDigest',receipt_digest);
			receipt_bytes:=convert_to(agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8');
			INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts(
				namespace_id,intent_digest,request_digest,receipt_digest,
				dispatch_authority_issuer_id,dispatch_authority_implementation_digest,
				dispatch_ledger_revision,lifecycle_owner_instance_id,dispatch_generation,
				generation_transition,delivery_disposition,claimed_at,claim_expires_at,
				prior_transport_receipt_digest,sealed_journal_record_digest,
				receipt_json,receipt_bytes
			) VALUES (
				candidate_namespace_id,candidate_intent_digest,request_digest_value,receipt_digest,
				candidate_dispatch_authority_issuer_id,
				candidate_dispatch_authority_implementation_digest,dispatch_ledger_revision,
				owner_instance_id,dispatch_generation,generation_transition,
				delivery_disposition,candidate_claimed_at,
				candidate_claim_expires_at,prior_receipt_digest,sealed_record_digest,
				receipt_json,receipt_bytes
			);
			IF current_row.intent_digest IS NULL THEN
				INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current(
					namespace_id,intent_digest,current_revision,dispatch_ledger_revision,
					dispatch_generation,
					ever_dispatch_authorized,current_claim_receipt_digest,
					lifecycle_owner_instance_id,claim_expires_at,prior_transport_receipt_digest,
					sealed_journal_record_digest,updated_at
				) VALUES (
					candidate_namespace_id,candidate_intent_digest,1,dispatch_ledger_revision,
					dispatch_generation,TRUE,
					receipt_digest,owner_instance_id,candidate_claim_expires_at,
					prior_receipt_digest,sealed_record_digest,candidate_claimed_at
				);
			ELSE
				UPDATE agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current
				SET current_revision=current_revision+1,
					dispatch_ledger_revision=claim_agent_evaluation_hosted_runtime_lifecycle_dispatch.dispatch_ledger_revision,
					dispatch_generation=claim_agent_evaluation_hosted_runtime_lifecycle_dispatch.dispatch_generation,
					current_claim_receipt_digest=receipt_digest,
					lifecycle_owner_instance_id=owner_instance_id,
					claim_expires_at=candidate_claim_expires_at,
					updated_at=candidate_claimed_at
				WHERE namespace_id=candidate_namespace_id
					AND intent_digest=candidate_intent_digest;
			END IF;
			RETURN NEXT;
		END;
		$$`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_claim_requests_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_claim_receipts_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION seal_agent_evaluation_hosted_runtime_lifecycle_transport_receipt()
			RETURNS trigger AS $$
		DECLARE
			claim_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts%ROWTYPE;
			current_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current%ROWTYPE;
			current_receipt agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts%ROWTYPE;
			updated_count BIGINT;
		BEGIN
			SELECT * INTO claim_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.dispatch_claim_receipt_digest
			FOR SHARE;
			SELECT * INTO current_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current
			WHERE namespace_id=NEW.namespace_id AND intent_digest=NEW.intent_digest
			FOR UPDATE;
			SELECT * INTO current_receipt
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=current_row.current_claim_receipt_digest
			FOR SHARE;
			IF claim_row.receipt_digest IS NULL OR claim_row.intent_digest<>NEW.intent_digest
				OR claim_row.delivery_disposition<>'dispatch-authorized-first-delivery'
				OR current_row.intent_digest IS NULL OR NOT current_row.ever_dispatch_authorized
				OR current_row.prior_transport_receipt_digest IS NOT NULL
				OR current_row.sealed_journal_record_digest IS NOT NULL
				OR current_receipt.receipt_digest IS NULL
				OR current_receipt.intent_digest<>claim_row.intent_digest
				OR current_receipt.delivery_disposition NOT IN (
					'dispatch-authorized-first-delivery','reconcile-only-replay'
				)
				OR current_receipt.prior_transport_receipt_digest IS NOT NULL
				OR NEW.started_at<claim_row.claimed_at OR NEW.started_at>=claim_row.claim_expires_at
				OR NEW.receipt_json->>'dispatchIntentDigest'<>NEW.intent_digest
				OR NEW.receipt_json->>'dispatchStageClaimReceiptDigest'<>
					NEW.dispatch_claim_receipt_digest
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport receipt lacks first-delivery authority'
					USING ERRCODE='23514';
			END IF;
			UPDATE agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current
			SET current_revision=current_revision+1,
				prior_transport_receipt_digest=NEW.receipt_digest,
				updated_at=GREATEST(updated_at,NEW.completed_at)
			WHERE namespace_id=NEW.namespace_id AND intent_digest=NEW.intent_digest
				AND ever_dispatch_authorized
				AND current_claim_receipt_digest=current_row.current_claim_receipt_digest
				AND prior_transport_receipt_digest IS NULL
				AND sealed_journal_record_digest IS NULL;
			GET DIAGNOSTICS updated_count=ROW_COUNT;
			IF updated_count<>1 THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport receipt lost current CAS'
					USING ERRCODE='40001';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_transport_receipts_exact
			AFTER INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts
			FOR EACH ROW EXECUTE FUNCTION seal_agent_evaluation_hosted_runtime_lifecycle_transport_receipt()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_transport_receipts_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_spool_insert()
			RETURNS trigger AS $$
		DECLARE
			request_row agent_evaluation_hosted_retrieval_runtime_resource_registration_requests%ROWTYPE;
			registration_row agent_evaluation_hosted_retrieval_runtime_resource_registration_results%ROWTYPE;
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			plan_row agent_evaluation_plans%ROWTYPE;
			expected_key_ref_digest TEXT;
			expected_profile_digest TEXT;
			expected_retention_digest TEXT;
			nonce_base64url TEXT;
			tag_base64url TEXT;
		BEGIN
			SELECT * INTO request_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_requests
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND request_digest=NEW.registration_request_digest
			FOR SHARE;
			SELECT * INTO registration_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND registration_request_digest=NEW.registration_request_digest
			FOR SHARE;
			SELECT * INTO resource_row
			FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND registration_request_digest=NEW.registration_request_digest
			FOR SHARE;
			SELECT * INTO plan_row
			FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR SHARE;
			expected_key_ref_digest:=agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
				'keyId','key.g4-model-eval.hosted-retrieval-runtime-resource-lifecycle-spool.v1',
				'keyVersion',1,
				'keyEnvironmentName',
					'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64',
				'keyRef','secret.g4-model-eval.hosted-retrieval-runtime-resource-lifecycle-spool.aes256gcm.v1'
			));
			expected_profile_digest:=agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
				'algorithm','aes-256-gcm',
				'aadFormat','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-aad',
				'aadVersion',1,'keyRefDigest',expected_key_ref_digest,
				'maximumCiphertextBytes',262144
			));
			expected_retention_digest:=agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
				'retentionClass','hosted-resource-lifecycle-reconcile-only',
				'maximumAgeMs',691200000,
				'disposition','destroy-on-business-seal-or-expiry'
			));
			nonce_base64url:=replace(replace(rtrim(encode(NEW.nonce_bytes,'base64'),'='),'+','-'),'/','_');
			tag_base64url:=replace(replace(rtrim(encode(NEW.authentication_tag_bytes,'base64'),'='),'+','-'),'/','_');
			IF request_row.request_digest IS NULL OR plan_row.plan_digest IS NULL
				OR NEW.runtime_resource_set_id<>request_row.runtime_resource_set_id
				OR NEW.frozen_run_digest<>request_row.frozen_run_digest
				OR NEW.run_config_artifact_binding_digest<>
					request_row.run_config_artifact_binding_digest
				OR NEW.spooled_at<plan_row.planned_at
				OR NEW.lifecycle_expires_at<>LEAST(
					plan_row.expires_at,
					COALESCE(resource_row.resource_expires_at,registration_row.expires_at,
						request_row.minimum_expires_at))
				OR NEW.spool_ref<>'hosted-lifecycle-spool.'||substring(NEW.aad_digest FROM 8)
				OR NEW.key_id<>'key.g4-model-eval.hosted-retrieval-runtime-resource-lifecycle-spool.v1'
				OR NEW.key_ref_digest<>expected_key_ref_digest
				OR NEW.encryption_profile_digest<>expected_profile_digest
				OR NEW.retention_policy_digest<>expected_retention_digest
				OR NEW.ciphertext_digest<>
					'sha256-'||encode(digest(NEW.ciphertext_bytes,'sha256'),'hex')
				OR jsonb_typeof(NEW.aad_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.aad_json)<>21
				OR NOT (NEW.aad_json ?& ARRAY[
					'format','version','namespaceId','repositoryCommit','planDigest','frozenRunDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','lifecycleExpiresAt',
					'registrationRequestDigest',
					'authorityDigest','lifecycleClaimReceiptDigest','operation','resourceId','resourceRole',
					'dispatchIntentSetDigest','dispatchStageClaimReceiptSetDigest',
					'dispatchStageClaimHistorySetDigest',
					'transportReceiptSetDigest','businessResultDigest','plaintextDigest'
				])
				OR NEW.aad_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-aad'
				OR (NEW.aad_json->>'version')::bigint<>1
				OR NEW.aad_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.aad_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.aad_json->>'planDigest'<>NEW.plan_digest
				OR NEW.aad_json->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR NEW.aad_json->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR NEW.aad_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR (NEW.aad_json->>'lifecycleExpiresAt')::timestamptz<>
					NEW.lifecycle_expires_at
				OR NEW.aad_json->>'registrationRequestDigest'<>NEW.registration_request_digest
				OR NEW.aad_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
				OR NEW.aad_json->>'lifecycleClaimReceiptDigest' IS DISTINCT FROM
					NEW.lifecycle_claim_receipt_digest
				OR NEW.aad_json->>'operation'<>NEW.operation
				OR NEW.aad_json->>'resourceId' IS DISTINCT FROM NEW.resource_id
				OR NEW.aad_json->>'resourceRole' IS DISTINCT FROM NEW.resource_role
				OR NEW.aad_json->>'dispatchIntentSetDigest'<>NEW.dispatch_intent_set_digest
				OR NEW.aad_json->>'dispatchStageClaimReceiptSetDigest'<>
					NEW.dispatch_stage_claim_receipt_set_digest
				OR NEW.aad_json->>'dispatchStageClaimHistorySetDigest'<>
					NEW.dispatch_stage_claim_history_set_digest
				OR NEW.aad_json->>'transportReceiptSetDigest'<>NEW.transport_receipt_set_digest
				OR NEW.aad_json->>'businessResultDigest'<>NEW.business_result_digest
				OR NEW.aad_json->>'plaintextDigest'<>NEW.plaintext_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.aad_json)<>NEW.aad_digest
				OR (NEW.operation='create' AND (
					NEW.authority_digest IS NOT NULL OR NEW.lifecycle_claim_receipt_digest IS NOT NULL
					OR NEW.resource_id IS NOT NULL OR NEW.resource_role IS NOT NULL))
				OR (NEW.operation='delete' AND (
					NEW.authority_digest IS NULL OR NEW.lifecycle_claim_receipt_digest IS NULL
					OR NEW.resource_id IS NULL OR NEW.resource_role NOT IN ('auxiliary','primary')))
				OR jsonb_typeof(NEW.envelope_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.envelope_json)<>15
				OR NOT (NEW.envelope_json ?& ARRAY[
					'format','version','spoolRef','algorithm','keyId','keyVersion','keyRefDigest',
					'encryptionProfileDigest','nonceBase64Url','authenticationTagBase64Url',
					'ciphertextDigest','ciphertextSizeBytes','aadDigest','plaintextDigest','envelopeDigest'
				])
				OR NEW.envelope_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-envelope-authority'
				OR (NEW.envelope_json->>'version')::bigint<>1
				OR NEW.envelope_json->>'spoolRef'<>NEW.spool_ref
				OR NEW.envelope_json->>'algorithm'<>NEW.algorithm
				OR NEW.envelope_json->>'keyId'<>NEW.key_id
				OR (NEW.envelope_json->>'keyVersion')::bigint<>NEW.key_version
				OR NEW.envelope_json->>'keyRefDigest'<>NEW.key_ref_digest
				OR NEW.envelope_json->>'encryptionProfileDigest'<>NEW.encryption_profile_digest
				OR NEW.envelope_json->>'nonceBase64Url'<>nonce_base64url
				OR NEW.envelope_json->>'authenticationTagBase64Url'<>tag_base64url
				OR NEW.envelope_json->>'ciphertextDigest'<>NEW.ciphertext_digest
				OR (NEW.envelope_json->>'ciphertextSizeBytes')::bigint<>NEW.ciphertext_byte_length
				OR NEW.envelope_json->>'aadDigest'<>NEW.aad_digest
				OR NEW.envelope_json->>'plaintextDigest'<>NEW.plaintext_digest
				OR NEW.envelope_json->>'envelopeDigest'<>NEW.envelope_digest
				OR agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
					'algorithm',NEW.algorithm,'keyId',NEW.key_id,
					'keyVersion',NEW.key_version,'keyRefDigest',NEW.key_ref_digest,
					'encryptionProfileDigest',NEW.encryption_profile_digest,
					'nonceBase64Url',nonce_base64url,
					'authenticationTagBase64Url',tag_base64url,
					'ciphertextDigest',NEW.ciphertext_digest,
					'ciphertextSizeBytes',NEW.ciphertext_byte_length,
					'aadDigest',NEW.aad_digest
				))<>NEW.envelope_digest
				OR jsonb_typeof(NEW.spool_receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.spool_receipt_json)<>36
				OR NOT (NEW.spool_receipt_json ?& ARRAY[
					'format','version','spoolRef','namespaceId','repositoryCommit','planDigest',
					'frozenRunDigest','runConfigArtifactBindingDigest','runtimeResourceSetId',
					'lifecycleExpiresAt',
					'registrationRequestDigest','authorityDigest','lifecycleClaimReceiptDigest',
					'operation','resourceId','resourceRole','dispatchIntentSetDigest',
					'dispatchStageClaimReceiptSetDigest','dispatchStageClaimHistorySetDigest',
					'transportReceiptSetDigest',
					'businessResultDigest','algorithm','keyId','keyVersion','keyRefDigest',
					'encryptionProfileDigest','aadDigest','envelopeDigest','ciphertextDigest',
					'ciphertextSizeBytes','plaintextDigest','retentionClass',
					'retentionPolicyDigest','createdAt','expiresAt','receiptDigest'
				])
				OR NEW.spool_receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-result-spool-receipt'
				OR (NEW.spool_receipt_json->>'version')::bigint<>1
				OR NEW.spool_receipt_json->>'spoolRef'<>NEW.spool_ref
				OR NEW.spool_receipt_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.spool_receipt_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.spool_receipt_json->>'planDigest'<>NEW.plan_digest
				OR NEW.spool_receipt_json->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR NEW.spool_receipt_json->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR NEW.spool_receipt_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR (NEW.spool_receipt_json->>'lifecycleExpiresAt')::timestamptz<>
					NEW.lifecycle_expires_at
				OR NEW.spool_receipt_json->>'registrationRequestDigest'<>NEW.registration_request_digest
				OR NEW.spool_receipt_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
				OR NEW.spool_receipt_json->>'lifecycleClaimReceiptDigest' IS DISTINCT FROM
					NEW.lifecycle_claim_receipt_digest
				OR NEW.spool_receipt_json->>'operation'<>NEW.operation
				OR NEW.spool_receipt_json->>'resourceId' IS DISTINCT FROM NEW.resource_id
				OR NEW.spool_receipt_json->>'resourceRole' IS DISTINCT FROM NEW.resource_role
				OR NEW.spool_receipt_json->>'dispatchIntentSetDigest'<>NEW.dispatch_intent_set_digest
				OR NEW.spool_receipt_json->>'dispatchStageClaimReceiptSetDigest'<>
					NEW.dispatch_stage_claim_receipt_set_digest
				OR NEW.spool_receipt_json->>'dispatchStageClaimHistorySetDigest'<>
					NEW.dispatch_stage_claim_history_set_digest
				OR NEW.spool_receipt_json->>'transportReceiptSetDigest'<>NEW.transport_receipt_set_digest
				OR NEW.spool_receipt_json->>'businessResultDigest'<>NEW.business_result_digest
				OR NEW.spool_receipt_json->>'algorithm'<>NEW.algorithm
				OR NEW.spool_receipt_json->>'keyId'<>NEW.key_id
				OR (NEW.spool_receipt_json->>'keyVersion')::bigint<>NEW.key_version
				OR NEW.spool_receipt_json->>'keyRefDigest'<>NEW.key_ref_digest
				OR NEW.spool_receipt_json->>'encryptionProfileDigest'<>NEW.encryption_profile_digest
				OR NEW.spool_receipt_json->>'aadDigest'<>NEW.aad_digest
				OR NEW.spool_receipt_json->>'envelopeDigest'<>NEW.envelope_digest
				OR NEW.spool_receipt_json->>'ciphertextDigest'<>NEW.ciphertext_digest
				OR (NEW.spool_receipt_json->>'ciphertextSizeBytes')::bigint<>
					NEW.ciphertext_byte_length
				OR NEW.spool_receipt_json->>'plaintextDigest'<>NEW.plaintext_digest
				OR NEW.spool_receipt_json->>'retentionClass'<>
					'hosted-resource-lifecycle-reconcile-only'
				OR NEW.spool_receipt_json->>'retentionPolicyDigest'<>NEW.retention_policy_digest
				OR (NEW.spool_receipt_json->>'createdAt')::timestamptz<>NEW.spooled_at
				OR (NEW.spool_receipt_json->>'expiresAt')::timestamptz<>NEW.expires_at
				OR NEW.spool_receipt_json->>'receiptDigest'<>NEW.spool_receipt_digest
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.spool_receipt_json-'receiptDigest')<>NEW.spool_receipt_digest THEN
				RAISE EXCEPTION 'hosted runtime lifecycle encrypted spool drifted from exact authority'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_spools_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_spool_insert()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_spool_transition()
			RETURNS trigger AS $$
		BEGIN
			IF TG_OP='DELETE' OR NEW.namespace_id<>OLD.namespace_id OR NEW.spool_ref<>OLD.spool_ref
				OR NEW.plan_digest<>OLD.plan_digest OR NEW.repository_commit<>OLD.repository_commit
				OR NEW.registration_request_digest<>OLD.registration_request_digest
				OR NEW.envelope_digest<>OLD.envelope_digest
				OR NEW.aad_digest<>OLD.aad_digest OR NEW.ciphertext_digest<>OLD.ciphertext_digest
				OR NEW.dispatch_stage_claim_history_set_digest<>
					OLD.dispatch_stage_claim_history_set_digest
				OR NEW.spool_receipt_digest<>OLD.spool_receipt_digest
				OR NEW.spool_receipt_bytes<>OLD.spool_receipt_bytes
				OR NEW.spool_write_envelope_json<>OLD.spool_write_envelope_json
				OR NEW.spool_write_envelope_bytes<>OLD.spool_write_envelope_bytes
				OR NEW.transport_store_request_digest<>OLD.transport_store_request_digest
				OR NEW.transport_store_request_json<>OLD.transport_store_request_json
				OR NEW.transport_store_request_bytes<>OLD.transport_store_request_bytes
				OR NEW.transport_store_receipt_digest<>OLD.transport_store_receipt_digest
				OR NEW.transport_store_receipt_json<>OLD.transport_store_receipt_json
				OR NEW.transport_store_receipt_bytes<>OLD.transport_store_receipt_bytes
				OR NEW.transport_authority_issuer_id<>OLD.transport_authority_issuer_id
				OR NEW.transport_authority_implementation_digest<>
					OLD.transport_authority_implementation_digest
				OR NEW.transport_ledger_revision<>OLD.transport_ledger_revision
				OR NEW.transport_stored_at<>OLD.transport_stored_at
				OR OLD.state='destroyed'
				OR (OLD.state='active' AND NEW.state NOT IN ('retained-encrypted','destroyed'))
				OR (OLD.state='retained-encrypted' AND NEW.state<>'destroyed')
				OR (NEW.state='retained-encrypted' AND (
					NEW.ciphertext_bytes<>OLD.ciphertext_bytes OR NEW.nonce_bytes<>OLD.nonce_bytes
					OR NEW.authentication_tag_bytes<>OLD.authentication_tag_bytes))
				OR (NEW.state='destroyed' AND (
					octet_length(NEW.ciphertext_bytes)<>0 OR octet_length(NEW.nonce_bytes)<>0
					OR octet_length(NEW.authentication_tag_bytes)<>0)) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle encrypted spool transition is invalid'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_spools_transition
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_spool_transition()`,
		`CREATE OR REPLACE FUNCTION read_agent_evaluation_hosted_runtime_lifecycle_spool(
			candidate_namespace_id TEXT,candidate_spool_ref TEXT,candidate_observed_at TIMESTAMPTZ
		) RETURNS TABLE (
			envelope_json JSONB,envelope_bytes BYTEA,ciphertext_bytes BYTEA,
			nonce_bytes BYTEA,authentication_tag_bytes BYTEA,spool_receipt_json JSONB
		) LANGUAGE sql STABLE PARALLEL RESTRICTED AS $$
			SELECT spool.envelope_json,spool.envelope_bytes,spool.ciphertext_bytes,
				spool.nonce_bytes,spool.authentication_tag_bytes,spool.spool_receipt_json
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools spool
			WHERE spool.namespace_id=candidate_namespace_id AND spool.spool_ref=candidate_spool_ref
				AND spool.state IN ('active','retained-encrypted')
				AND candidate_observed_at>=spool.spooled_at
				AND candidate_observed_at<spool.expires_at
		$$`,
		`CREATE OR REPLACE FUNCTION dispose_agent_evaluation_hosted_runtime_lifecycle_spool(
			candidate_namespace_id TEXT,candidate_spool_ref TEXT,
			candidate_disposition_json JSONB,candidate_disposition_bytes BYTEA
		) RETURNS JSONB LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			spool agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools%ROWTYPE;
			disposition_value TEXT;
			destroyed BOOLEAN;
			disposed_at_value TIMESTAMPTZ;
			receipt_digest_value TEXT;
		BEGIN
			SELECT * INTO spool
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			WHERE namespace_id=candidate_namespace_id AND spool_ref=candidate_spool_ref
			FOR UPDATE;
			IF spool.spool_ref IS NULL OR spool.state<>'active'
				OR jsonb_typeof(candidate_disposition_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(candidate_disposition_json)<>19
				OR NOT (candidate_disposition_json ?& ARRAY[
					'format','version','spoolRef','spoolReceiptDigest','operation',
					'registrationRequestDigest','authorityDigest','lifecycleClaimReceiptDigest',
					'disposition','businessSealKind','businessSealReceiptDigest','encryptionState',
					'envelopeDigest','ciphertextDigest','retentionPolicyDigest','createdAt',
					'retainedUntil','disposedAt','receiptDigest'
				])
				OR candidate_disposition_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-result-spool-disposition-receipt'
				OR (candidate_disposition_json->>'version')::bigint<>1
				OR candidate_disposition_json->>'spoolRef'<>spool.spool_ref
				OR candidate_disposition_json->>'spoolReceiptDigest'<>spool.spool_receipt_digest
				OR candidate_disposition_json->>'operation'<>spool.operation
				OR candidate_disposition_json->>'registrationRequestDigest'<>
					spool.registration_request_digest
				OR candidate_disposition_json->>'authorityDigest' IS DISTINCT FROM spool.authority_digest
				OR candidate_disposition_json->>'lifecycleClaimReceiptDigest' IS DISTINCT FROM
					spool.lifecycle_claim_receipt_digest
				OR candidate_disposition_json->>'envelopeDigest'<>spool.envelope_digest
				OR candidate_disposition_json->>'ciphertextDigest'<>spool.ciphertext_digest
				OR candidate_disposition_json->>'retentionPolicyDigest'<>
					spool.retention_policy_digest
				OR (candidate_disposition_json->>'createdAt')::timestamptz<>spool.spooled_at
				OR (candidate_disposition_json->>'retainedUntil')::timestamptz<>spool.expires_at
				OR candidate_disposition_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(candidate_disposition_json),'UTF8') THEN
				RAISE EXCEPTION 'hosted runtime lifecycle spool disposition drifted'
					USING ERRCODE='23514';
			END IF;
			disposition_value:=candidate_disposition_json->>'disposition';
			destroyed:=disposition_value='destroyed-after-business-seal';
			disposed_at_value:=(candidate_disposition_json->>'disposedAt')::timestamptz;
			receipt_digest_value:=candidate_disposition_json->>'receiptDigest';
			IF disposed_at_value<spool.spooled_at OR disposed_at_value>=spool.expires_at
				OR receipt_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR agent_evaluation_canonical_jsonb_digest(
					candidate_disposition_json-'receiptDigest')<>receipt_digest_value
				OR (destroyed AND (
					candidate_disposition_json->>'encryptionState'<>'destroyed'
					OR candidate_disposition_json->>'businessSealKind'='recovery-pending'
					OR candidate_disposition_json->>'businessSealReceiptDigest' IS NULL))
				OR (NOT destroyed AND (
					disposition_value<>'retained-encrypted-for-recovery'
					OR candidate_disposition_json->>'encryptionState'<>'retained-encrypted'
					OR candidate_disposition_json->>'businessSealKind'<>'recovery-pending'
					OR candidate_disposition_json->>'businessSealReceiptDigest' IS NOT NULL)) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle spool disposition semantics are invalid'
					USING ERRCODE='23514';
			END IF;
			UPDATE agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			SET state=CASE WHEN destroyed THEN 'destroyed' ELSE 'retained-encrypted' END,
				disposition=disposition_value,
				business_seal_kind=candidate_disposition_json->>'businessSealKind',
				business_seal_receipt_digest=
					candidate_disposition_json->>'businessSealReceiptDigest',
				cleared_at=CASE WHEN destroyed THEN disposed_at_value ELSE NULL END,
				disposition_receipt_digest=receipt_digest_value,
				disposition_receipt_json=candidate_disposition_json,
				disposition_receipt_bytes=candidate_disposition_bytes,
				ciphertext_bytes=CASE WHEN destroyed THEN ''::bytea ELSE ciphertext_bytes END,
				ciphertext_byte_length=CASE WHEN destroyed THEN 0 ELSE ciphertext_byte_length END,
				nonce_bytes=CASE WHEN destroyed THEN ''::bytea ELSE nonce_bytes END,
				authentication_tag_bytes=
					CASE WHEN destroyed THEN ''::bytea ELSE authentication_tag_bytes END
			WHERE namespace_id=candidate_namespace_id AND spool_ref=candidate_spool_ref;
			RETURN candidate_disposition_json;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION expire_agent_evaluation_hosted_runtime_lifecycle_spool(
			candidate_namespace_id TEXT,candidate_spool_ref TEXT,candidate_cleared_at TIMESTAMPTZ
		) RETURNS JSONB LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			spool agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools%ROWTYPE;
			disposition_base JSONB;
			disposition_json_value JSONB;
			disposition_digest TEXT;
			disposed_at_value TIMESTAMPTZ;
			tombstone_base JSONB;
			tombstone_value JSONB;
			tombstone_digest_value TEXT;
		BEGIN
			SELECT * INTO spool
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			WHERE namespace_id=candidate_namespace_id AND spool_ref=candidate_spool_ref
			FOR UPDATE;
			IF spool.spool_ref IS NULL OR spool.state='destroyed'
				OR candidate_cleared_at<spool.expires_at THEN
				RAISE EXCEPTION 'hosted runtime lifecycle spool is not expiry-clearable'
					USING ERRCODE='23514';
			END IF;
			IF spool.state='active' THEN
				disposed_at_value:=spool.expires_at-INTERVAL '1 microsecond';
				disposition_base:=jsonb_build_object(
					'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-result-spool-disposition-receipt',
					'version',1,'spoolRef',spool.spool_ref,
					'spoolReceiptDigest',spool.spool_receipt_digest,'operation',spool.operation,
					'registrationRequestDigest',spool.registration_request_digest,
					'authorityDigest',to_jsonb(spool.authority_digest),
					'lifecycleClaimReceiptDigest',to_jsonb(spool.lifecycle_claim_receipt_digest),
					'disposition','retained-encrypted-for-recovery',
					'businessSealKind','recovery-pending','businessSealReceiptDigest','null'::jsonb,
					'encryptionState','retained-encrypted','envelopeDigest',spool.envelope_digest,
					'ciphertextDigest',spool.ciphertext_digest,
					'retentionPolicyDigest',spool.retention_policy_digest,
					'createdAt',to_jsonb(spool.spooled_at),'retainedUntil',to_jsonb(spool.expires_at),
					'disposedAt',to_jsonb(disposed_at_value)
				);
				disposition_digest:=agent_evaluation_canonical_jsonb_digest(disposition_base);
				disposition_json_value:=disposition_base||
					jsonb_build_object('receiptDigest',disposition_digest);
			ELSE
				disposition_digest:=spool.disposition_receipt_digest;
				disposition_json_value:=spool.disposition_receipt_json;
			END IF;
			tombstone_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-expiry-tombstone',
				'version',1,'spoolRef',spool.spool_ref,'spoolReceiptDigest',spool.spool_receipt_digest,
				'envelopeDigest',spool.envelope_digest,'ciphertextDigest',spool.ciphertext_digest,
				'expiresAt',to_jsonb(spool.expires_at),'clearedAt',to_jsonb(candidate_cleared_at)
			);
			tombstone_digest_value:=agent_evaluation_canonical_jsonb_digest(tombstone_base);
			tombstone_value:=tombstone_base||jsonb_build_object(
				'tombstoneDigest',tombstone_digest_value);
			UPDATE agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools
			SET state='destroyed',disposition='retained-encrypted-for-recovery',
				business_seal_kind='recovery-pending',business_seal_receipt_digest=NULL,
				cleared_at=candidate_cleared_at,expiry_cleared_at=candidate_cleared_at,
				disposition_receipt_digest=disposition_digest,
				disposition_receipt_json=disposition_json_value,
				disposition_receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(disposition_json_value),'UTF8'),
				ciphertext_bytes=''::bytea,ciphertext_byte_length=0,
				nonce_bytes=''::bytea,authentication_tag_bytes=''::bytea
			WHERE namespace_id=candidate_namespace_id AND spool_ref=candidate_spool_ref;
			INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spool_expiry_tombstones(
				namespace_id,spool_ref,spool_receipt_digest,envelope_digest,ciphertext_digest,
				expires_at,cleared_at,tombstone_digest,tombstone_json,tombstone_bytes
			) VALUES (
				candidate_namespace_id,candidate_spool_ref,spool.spool_receipt_digest,
				spool.envelope_digest,spool.ciphertext_digest,spool.expires_at,candidate_cleared_at,
				tombstone_digest_value,tombstone_value,
				convert_to(agent_evaluation_canonical_jsonb_text(tombstone_value),'UTF8')
			);
			RETURN tombstone_value;
		END;
		$$`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_spool_expiry_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spool_expiry_tombstones
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}
}
