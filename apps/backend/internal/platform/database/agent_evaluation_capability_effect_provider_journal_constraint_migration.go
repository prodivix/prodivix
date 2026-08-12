package database

func agentEvaluationCapabilityEffectProviderJournalConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_journal_stage()
			RETURNS trigger AS $$
		DECLARE
			controlled_digest TEXT;
			source_claim_digest TEXT;
			pre_effect JSONB;
			stage_request JSONB;
			resource_commitment JSONB;
			resource_authority JSONB;
			read_request JSONB;
			read_receipt JSONB;
			hosted_authority_digest TEXT;
			stage_count BIGINT;
		BEGIN
			pre_effect:=NEW.record_json->'preEffectIntent';
			stage_request:=NEW.record_json->'stageRequest';
			IF jsonb_typeof(NEW.record_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.record_json)<>17
				OR NOT (NEW.record_json ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
					'descriptorDigest','turnIndex','invocationId','ownerRequestId',
					'ownerRequestDigest','runtimeFactSourceAuthorityDigest','preEffectIntentDigest',
					'preEffectIntent','stageRequest','sealedAt','recordDigest'
				])
				OR NEW.record_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-journal-stage-record'
				OR (NEW.record_json->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(NEW.record_json-'recordDigest')
					IS DISTINCT FROM NEW.record_digest
				OR NEW.record_json->>'recordDigest' IS DISTINCT FROM NEW.record_digest
				OR jsonb_typeof(pre_effect)<>'object'
				OR agent_evaluation_jsonb_object_key_count(pre_effect)<>23
				OR NOT (pre_effect ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
					'descriptorDigest','caseId','materialDigest','turnIndex','invocationId','toolId',
					'toolCallId','providerToolCallId','providerRequestDigest','argumentsDigest',
					'requestedAt','inputAuthorityBinding','runtimeFactSourceAuthority',
					'registrationReceiptDigest','ownerRequestId','ownerRequestDigest','intentDigest'
				])
				OR pre_effect->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-pre-effect-intent'
				OR (pre_effect->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(pre_effect-'intentDigest')
					IS DISTINCT FROM NEW.pre_effect_intent_digest
				OR pre_effect->>'intentDigest' IS DISTINCT FROM NEW.pre_effect_intent_digest
				OR jsonb_typeof(stage_request)<>'object'
				OR agent_evaluation_jsonb_object_key_count(stage_request)<>20
				OR NOT (stage_request ?& ARRAY[
					'format','version','intentDigest','ownerRequestId','ownerRequestDigest',
					'bindingKind','capabilityId','readinessReceipt','readinessReceiptDigest',
					'requestProjection','nativeSourceReceipt','stateVaultResolveRequest',
					'stateVaultResolveReceipt','providerResourceSetCommitment',
					'providerResourceAuthority','providerResourceReadRequest',
					'providerResourceReadReceipt','stagedAt','expiresAt','stageDigest'
				])
				OR stage_request->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-stage-request'
				OR (stage_request->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(stage_request-'stageDigest')
					IS DISTINCT FROM NEW.stage_digest
				OR stage_request->>'stageDigest' IS DISTINCT FROM NEW.stage_digest
				OR NEW.record_json->>'namespaceId' IS DISTINCT FROM NEW.namespace_id
				OR NEW.record_json->>'planDigest' IS DISTINCT FROM NEW.plan_digest
				OR NEW.record_json->>'repositoryCommit' IS DISTINCT FROM NEW.repository_commit
				OR NEW.record_json->>'attemptId' IS DISTINCT FROM NEW.attempt_id
				OR NEW.record_json->>'descriptorDigest' IS DISTINCT FROM NEW.descriptor_digest
				OR (NEW.record_json->>'turnIndex')::bigint IS DISTINCT FROM NEW.turn_index
				OR NEW.record_json->>'invocationId' IS DISTINCT FROM NEW.invocation_id
				OR NEW.record_json->>'ownerRequestId' IS DISTINCT FROM NEW.owner_request_id
				OR NEW.record_json->>'ownerRequestDigest' IS DISTINCT FROM NEW.owner_request_digest
				OR NEW.record_json->>'runtimeFactSourceAuthorityDigest' IS DISTINCT FROM
					NEW.runtime_fact_source_authority_digest
				OR NEW.record_json->>'preEffectIntentDigest' IS DISTINCT FROM NEW.pre_effect_intent_digest
				OR (NEW.record_json->>'sealedAt')::timestamptz IS DISTINCT FROM NEW.sealed_at
				OR pre_effect->>'namespaceId' IS DISTINCT FROM NEW.namespace_id
				OR pre_effect->>'planDigest' IS DISTINCT FROM NEW.plan_digest
				OR pre_effect->>'repositoryCommit' IS DISTINCT FROM NEW.repository_commit
				OR pre_effect->>'attemptId' IS DISTINCT FROM NEW.attempt_id
				OR pre_effect->>'descriptorDigest' IS DISTINCT FROM NEW.descriptor_digest
				OR (pre_effect->>'turnIndex')::bigint IS DISTINCT FROM NEW.turn_index
				OR pre_effect->>'invocationId' IS DISTINCT FROM NEW.invocation_id
				OR pre_effect->>'ownerRequestId' IS DISTINCT FROM NEW.owner_request_id
				OR pre_effect->>'ownerRequestDigest' IS DISTINCT FROM NEW.owner_request_digest
				OR pre_effect#>>'{runtimeFactSourceAuthority,authorityDigest}' IS DISTINCT FROM
					NEW.runtime_fact_source_authority_digest
				OR stage_request->>'intentDigest' IS DISTINCT FROM NEW.pre_effect_intent_digest
				OR stage_request->>'ownerRequestId' IS DISTINCT FROM NEW.owner_request_id
				OR stage_request->>'ownerRequestDigest' IS DISTINCT FROM NEW.owner_request_digest
				OR stage_request->>'bindingKind' IS DISTINCT FROM NEW.binding_kind
				OR stage_request->>'capabilityId' IS DISTINCT FROM NEW.capability_id
				OR (stage_request->>'stagedAt')::timestamptz IS DISTINCT FROM NEW.sealed_at
				OR (stage_request->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at
			THEN
				RAISE EXCEPTION 'Provider journal stage canonical record drifted'
					USING ERRCODE='23514';
			END IF;

			resource_commitment:=stage_request->'providerResourceSetCommitment';
			resource_authority:=stage_request->'providerResourceAuthority';
			read_request:=stage_request->'providerResourceReadRequest';
			read_receipt:=stage_request->'providerResourceReadReceipt';
			IF NEW.binding_kind='hosted-retrieval-query' THEN
				IF jsonb_typeof(resource_commitment)<>'object'
					OR jsonb_typeof(resource_authority)<>'object'
					OR jsonb_typeof(read_request)<>'object'
					OR jsonb_typeof(read_receipt)<>'object'
					OR resource_commitment->>'commitmentDigest' IS DISTINCT FROM
						NEW.provider_resource_set_commitment_digest
					OR resource_authority->>'authorityDigest' IS DISTINCT FROM
						NEW.provider_resource_authority_digest
					OR read_request->>'requestDigest' IS DISTINCT FROM
						NEW.provider_resource_read_request_digest
					OR read_receipt->>'receiptDigest' IS DISTINCT FROM
						NEW.provider_resource_read_receipt_digest THEN
					RAISE EXCEPTION 'hosted Provider journal stage lacks exact resource authorities'
						USING ERRCODE='23514';
				END IF;
				SELECT registration.authority_digest INTO hosted_authority_digest
				FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results registration
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_sets resource_set
				  ON resource_set.namespace_id=registration.namespace_id
				 AND resource_set.plan_digest=registration.plan_digest
				 AND resource_set.repository_commit=registration.repository_commit
				 AND resource_set.runtime_resource_set_id=registration.runtime_resource_set_id
				JOIN agent_evaluation_hosted_retrieval_runtime_resources resource
				  ON resource.namespace_id=registration.namespace_id
				 AND resource.plan_digest=registration.plan_digest
				 AND resource.repository_commit=registration.repository_commit
				 AND resource.authority_digest=registration.authority_digest
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_read_receipts stored_read
				  ON stored_read.namespace_id=resource.namespace_id
				 AND stored_read.plan_digest=resource.plan_digest
				 AND stored_read.repository_commit=resource.repository_commit
				 AND stored_read.authority_digest=resource.authority_digest
				WHERE registration.namespace_id=NEW.namespace_id
					AND registration.plan_digest=NEW.plan_digest
					AND registration.repository_commit=NEW.repository_commit
					AND registration.authority_digest=NEW.provider_resource_authority_digest
					AND registration.authority_json=resource_authority
					AND resource.resource_set_commitment_digest=
						NEW.provider_resource_set_commitment_digest
					AND resource_set.resource_set_commitment_digest=
						NEW.provider_resource_set_commitment_digest
					AND resource_set.resource_set_commitment_json=resource_commitment
					AND stored_read.request_digest=NEW.provider_resource_read_request_digest
					AND stored_read.receipt_digest=NEW.provider_resource_read_receipt_digest
					AND stored_read.request_json=read_request
					AND stored_read.receipt_json=read_receipt
					AND resource.lifecycle='active'
					AND resource.current_state_digest=stored_read.active_state_digest
					AND resource.current_state_json=stored_read.receipt_json->'activeState'
					AND resource.active_owner_instance_id=stored_read.active_owner_instance_id
					AND resource.claim_generation=stored_read.claim_generation
					AND resource.read_lease_not_after=stored_read.expires_at
					AND NEW.sealed_at>=stored_read.checked_at
					AND NEW.sealed_at<stored_read.expires_at
				FOR SHARE OF registration,resource_set,resource,stored_read;
				IF hosted_authority_digest IS NULL THEN
					RAISE EXCEPTION 'hosted Provider journal stage lacks its durable active read lease'
						USING ERRCODE='23514';
				END IF;
			ELSIF resource_commitment IS DISTINCT FROM 'null'::jsonb
				OR resource_authority IS DISTINCT FROM 'null'::jsonb
				OR read_request IS DISTINCT FROM 'null'::jsonb
				OR read_receipt IS DISTINCT FROM 'null'::jsonb
				OR NEW.provider_resource_set_commitment_digest IS NOT NULL
				OR NEW.provider_resource_authority_digest IS NOT NULL
				OR NEW.provider_resource_read_request_digest IS NOT NULL
				OR NEW.provider_resource_read_receipt_digest IS NOT NULL THEN
				RAISE EXCEPTION 'non-hosted Provider journal stage carries resource authorities'
					USING ERRCODE='23514';
			END IF;

			SELECT request_digest INTO controlled_digest
			FROM agent_evaluation_controlled_authority_requests controlled
			WHERE controlled.namespace_id=NEW.namespace_id
				AND controlled.plan_digest=NEW.plan_digest
				AND controlled.repository_commit=NEW.repository_commit
				AND controlled.service_kind='provider-capability'
				AND controlled.operation='tool.execute'
				AND controlled.route_binding='capability-runtime/execute-tool'
				AND controlled.attempt_id=NEW.attempt_id
				AND controlled.descriptor_digest=NEW.descriptor_digest
				AND controlled.pre_effect_intent_digest=NEW.pre_effect_intent_digest
				AND controlled.pre_effect_intent_json=pre_effect
				AND controlled.pre_effect_intent_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(pre_effect),'UTF8'
				)
				AND controlled.state IN ('dispatched','sealed')
				AND controlled.v45_eligible
			FOR SHARE;
			IF controlled_digest IS NULL OR controlled_digest<>NEW.controlled_request_digest THEN
				RAISE EXCEPTION 'Provider journal stage lacks its exact dispatched controlled authority'
					USING ERRCODE='23514';
			END IF;
			IF NEW.binding_kind<>'hosted-retrieval-query' THEN
				SELECT claim.claim_digest INTO source_claim_digest
				FROM agent_evaluation_capability_effect_source_consumption_claims claim
				WHERE claim.namespace_id=NEW.namespace_id
					AND claim.plan_digest=NEW.plan_digest
					AND claim.repository_commit=NEW.repository_commit
					AND (claim.owner_instance_id IS NULL OR
						claim.owner_instance_id=NEW.owner_instance_id)
					AND claim.request_ref_authority_receipt_digest=
						pre_effect#>>'{inputAuthorityBinding,requestRefAuthorityReceiptDigest}'
					AND claim.source_handle_digest=
						pre_effect#>>'{inputAuthorityBinding,sourceHandleDigest}'
					AND claim.attempt_id=NEW.attempt_id
					AND claim.descriptor_digest=NEW.descriptor_digest
					AND claim.turn_index=NEW.turn_index
					AND claim.invocation_id=NEW.invocation_id
					AND claim.binding_kind=NEW.binding_kind
					AND claim.status IN ('claimed','consumed')
				FOR SHARE;
				IF source_claim_digest IS NULL THEN
					RAISE EXCEPTION 'Provider journal stage lacks its claimed input source authority'
						USING ERRCODE='23514';
				END IF;
			END IF;

			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
				chr(31)||'capability-effect-provider-journal-stage',0
			));
			IF NOT EXISTS (
				SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_stages
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND owner_request_digest=NEW.owner_request_digest
			) THEN
				SELECT COUNT(*) INTO stage_count
				FROM agent_evaluation_capability_effect_provider_journal_stages
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit;
				IF stage_count>=5880 OR (stage_count+1)*196608>1156055040 THEN
					RAISE EXCEPTION 'Provider journal owner-request capacity exceeded'
						USING ERRCODE='23514';
				END IF;
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_stages_exact
			BEFORE INSERT ON agent_evaluation_capability_effect_provider_journal_stages
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_journal_stage()`,
		`CREATE TRIGGER agent_eval_provider_journal_stages_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_stages
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_provider_journal_stages_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_stages
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_journal_execution()
			RETURNS trigger AS $$
		DECLARE
			stage_row agent_evaluation_capability_effect_provider_journal_stages%ROWTYPE;
			citation_match_count BIGINT;
			receipt JSONB;
			response JSONB;
			spool_receipt JSONB;
			spool_aad JSONB;
			spool_authority JSONB;
			prior_record_digest TEXT;
			prior_receipt_digest TEXT;
			expected_operation TEXT;
			first_sequence BIGINT;
			maximum_sequence BIGINT;
		BEGIN
			SELECT * INTO stage_row
			FROM agent_evaluation_capability_effect_provider_journal_stages
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest
			FOR SHARE;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'Provider journal execution stage is missing'
					USING ERRCODE='23514';
			END IF;
			IF EXISTS (
				SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_results
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND owner_instance_id=NEW.owner_instance_id
					AND owner_request_digest=NEW.owner_request_digest
			) OR EXISTS (
				SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_abandonments
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND owner_instance_id=NEW.owner_instance_id
					AND owner_request_digest=NEW.owner_request_digest
			) THEN
				RAISE EXCEPTION 'terminal Provider journal owner rejects another execution'
					USING ERRCODE='23514';
			END IF;
			receipt:=NEW.record_json->'executionReceipt';
			response:=receipt->'responseProjection';
			spool_receipt:=receipt->'resultSpoolReceipt';
			spool_aad:=NEW.record_json->'spoolAad';
			spool_authority:=NEW.record_json->'spoolEnvelopeAuthority';
			IF jsonb_typeof(NEW.record_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.record_json)<>21
				OR NOT (NEW.record_json ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
					'descriptorDigest','turnIndex','invocationId','ownerRequestId',
					'ownerRequestDigest','runtimeFactSourceAuthorityDigest','preEffectIntentDigest',
					'stageDigest','executionSequence','priorExecutionRecordDigest',
					'executionReceipt','spoolAad','spoolEnvelopeAuthority','sealedAt','recordDigest'
				])
				OR NEW.record_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-journal-execution-record'
				OR (NEW.record_json->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(NEW.record_json-'recordDigest')
					IS DISTINCT FROM NEW.record_digest
				OR NEW.record_json->>'recordDigest' IS DISTINCT FROM NEW.record_digest
				OR jsonb_typeof(receipt)<>'object'
				OR agent_evaluation_jsonb_object_key_count(receipt)<>16
				OR NOT (receipt ?& ARRAY[
					'format','version','stageDigest','readinessReceiptDigest','requestProjection',
					'cacheWarmAuthority','dispatchIntent','transportReceipt','resultSpoolReceipt',
					'responseProjection','pollSequence','priorExecutionReceiptDigest',
					'executionStatus','dispatchAckDigest','executedAt','receiptDigest'
				])
				OR receipt->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-execution-receipt'
				OR (receipt->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(receipt-'receiptDigest')
					IS DISTINCT FROM NEW.execution_receipt_digest
				OR receipt->>'receiptDigest' IS DISTINCT FROM NEW.execution_receipt_digest
				OR jsonb_typeof(response)<>'object'
				OR agent_evaluation_jsonb_object_key_count(response)<>24
				OR NOT (response ?& ARRAY[
					'format','version','requestDigest','requestProjectionDigest','protocolFamily',
					'operation','transportOutcome','httpStatus','responseBodyDigest',
					'sealedResponseJsonDigest','responseDigest','normalizedEventSetDigest',
					'providerStateReferenceKind','providerStateReferenceDigest','providerStatus',
					'terminalEventType','usageVectorDigest','cachedTokenCount','outputTextDigest',
					'outputMarkerObserved','retrievalCitationResourceId','denialKind','observedAt',
					'projectionDigest'
				])
				OR response->>'format' IS DISTINCT FROM
					'prodivix.agent-native-provider-capability-runtime-response-projection'
				OR (response->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(response-'projectionDigest')
					IS DISTINCT FROM NEW.response_projection_digest
				OR NEW.record_json->>'namespaceId' IS DISTINCT FROM stage_row.namespace_id
				OR NEW.record_json->>'planDigest' IS DISTINCT FROM stage_row.plan_digest
				OR NEW.record_json->>'repositoryCommit' IS DISTINCT FROM stage_row.repository_commit
				OR NEW.record_json->>'attemptId' IS DISTINCT FROM stage_row.attempt_id
				OR NEW.record_json->>'descriptorDigest' IS DISTINCT FROM stage_row.descriptor_digest
				OR (NEW.record_json->>'turnIndex')::bigint IS DISTINCT FROM stage_row.turn_index
				OR NEW.record_json->>'invocationId' IS DISTINCT FROM stage_row.invocation_id
				OR NEW.record_json->>'ownerRequestId' IS DISTINCT FROM stage_row.owner_request_id
				OR NEW.record_json->>'ownerRequestDigest' IS DISTINCT FROM stage_row.owner_request_digest
				OR NEW.record_json->>'runtimeFactSourceAuthorityDigest' IS DISTINCT FROM
					stage_row.runtime_fact_source_authority_digest
				OR NEW.record_json->>'preEffectIntentDigest' IS DISTINCT FROM
					stage_row.pre_effect_intent_digest
				OR NEW.record_json->>'stageDigest' IS DISTINCT FROM stage_row.stage_digest
				OR (NEW.record_json->>'executionSequence')::bigint IS DISTINCT FROM NEW.execution_sequence
				OR NEW.record_json->>'priorExecutionRecordDigest' IS DISTINCT FROM
					NEW.prior_execution_record_digest
				OR (NEW.record_json->>'sealedAt')::timestamptz IS DISTINCT FROM NEW.sealed_at
				OR receipt->>'stageDigest' IS DISTINCT FROM NEW.stage_digest
				OR (receipt->>'pollSequence')::bigint IS DISTINCT FROM NEW.execution_sequence
				OR receipt#>>'{requestProjection,operation}' IS DISTINCT FROM NEW.operation
				OR receipt#>>'{dispatchIntent,intentDigest}' IS DISTINCT FROM NEW.dispatch_intent_digest
				OR receipt#>>'{transportReceipt,receiptDigest}' IS DISTINCT FROM NEW.transport_receipt_digest
				OR receipt#>>'{responseProjection,responseBodyDigest}' IS DISTINCT FROM NEW.response_body_digest
				OR receipt#>>'{responseProjection,projectionDigest}' IS DISTINCT FROM NEW.response_projection_digest
				OR receipt#>>'{responseProjection,retrievalCitationResourceId}' IS DISTINCT FROM
					NEW.retrieval_citation_resource_id
				OR receipt#>>'{responseProjection,responseDigest}' IS DISTINCT FROM NEW.response_digest
				OR receipt#>>'{responseProjection,normalizedEventSetDigest}' IS DISTINCT FROM
					NEW.normalized_event_set_digest
				OR (receipt->>'executedAt')::timestamptz IS DISTINCT FROM NEW.executed_at
				OR NEW.executed_at IS DISTINCT FROM NEW.sealed_at
				OR NEW.executed_at<stage_row.sealed_at OR NEW.executed_at>=stage_row.expires_at
			THEN
				RAISE EXCEPTION 'Provider journal execution canonical record drifted'
					USING ERRCODE='23514';
			END IF;

			IF stage_row.binding_kind='hosted-retrieval-query' THEN
				SELECT COUNT(*) INTO citation_match_count
				FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results registration
				JOIN agent_evaluation_hosted_retrieval_runtime_resources resource
				  ON resource.namespace_id=registration.namespace_id
				 AND resource.plan_digest=registration.plan_digest
				 AND resource.repository_commit=registration.repository_commit
				 AND resource.authority_digest=registration.authority_digest
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_read_receipts stored_read
				  ON stored_read.namespace_id=resource.namespace_id
				 AND stored_read.plan_digest=resource.plan_digest
				 AND stored_read.repository_commit=resource.repository_commit
				 AND stored_read.authority_digest=resource.authority_digest
				CROSS JOIN LATERAL (
					SELECT registration.provider_resource_id AS resource_id
					UNION ALL
					SELECT value FROM jsonb_array_elements_text(
						registration.authority_json->'auxiliaryResourceIds'
					) auxiliary(value)
				) cited
				WHERE registration.namespace_id=NEW.namespace_id
					AND registration.plan_digest=NEW.plan_digest
					AND registration.repository_commit=NEW.repository_commit
					AND registration.authority_digest=stage_row.provider_resource_authority_digest
					AND resource.resource_set_commitment_digest=
						stage_row.provider_resource_set_commitment_digest
					AND stored_read.receipt_digest=stage_row.provider_resource_read_receipt_digest
					AND resource.lifecycle='active'
					AND resource.current_state_digest=stored_read.active_state_digest
					AND resource.read_lease_not_after=stored_read.expires_at
					AND NEW.executed_at<stored_read.expires_at
					AND cited.resource_id=NEW.retrieval_citation_resource_id;
				IF NEW.retrieval_citation_resource_id IS NULL OR citation_match_count<>1 THEN
					RAISE EXCEPTION 'hosted Provider execution citation is absent, foreign, or ambiguous'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.retrieval_citation_resource_id IS NOT NULL THEN
				RAISE EXCEPTION 'non-hosted Provider execution carries a retrieval citation'
					USING ERRCODE='23514';
			END IF;

			CASE stage_row.binding_kind
				WHEN 'hosted-retrieval-query' THEN
					first_sequence:=0; maximum_sequence:=0; expected_operation:='hosted-retrieval-query';
				WHEN 'opaque-continuation' THEN
					first_sequence:=0; maximum_sequence:=0; expected_operation:='continuation-resume';
				WHEN 'provider-cache' THEN
					first_sequence:=0; maximum_sequence:=1;
					expected_operation:=CASE NEW.execution_sequence WHEN 0 THEN 'cache-cold' ELSE 'cache-warm' END;
				WHEN 'provider-job' THEN
					first_sequence:=1; maximum_sequence:=4; expected_operation:='background-poll';
			END CASE;
			IF NEW.execution_sequence<first_sequence OR NEW.execution_sequence>maximum_sequence
				OR NEW.operation<>expected_operation THEN
				RAISE EXCEPTION 'Provider journal execution sequence exceeds its binding program'
					USING ERRCODE='23514';
			END IF;
			IF NEW.execution_sequence=first_sequence THEN
				IF NEW.prior_execution_record_digest IS NOT NULL
					OR receipt->'priorExecutionReceiptDigest' IS DISTINCT FROM 'null'::jsonb THEN
					RAISE EXCEPTION 'first Provider journal execution has a prior record'
						USING ERRCODE='23514';
				END IF;
			ELSE
				SELECT record_digest,execution_receipt_digest
				INTO prior_record_digest,prior_receipt_digest
				FROM agent_evaluation_capability_effect_provider_journal_executions
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND owner_instance_id=NEW.owner_instance_id
					AND owner_request_digest=NEW.owner_request_digest
					AND execution_sequence=NEW.execution_sequence-1
				FOR SHARE;
				IF prior_record_digest IS NULL
					OR NEW.prior_execution_record_digest<>prior_record_digest
					OR receipt->>'priorExecutionReceiptDigest' IS DISTINCT FROM prior_receipt_digest THEN
					RAISE EXCEPTION 'Provider journal execution chain is non-contiguous'
						USING ERRCODE='23514';
				END IF;
			END IF;

			IF NEW.response_body_digest IS NULL THEN
				IF spool_receipt IS DISTINCT FROM 'null'::jsonb
					OR spool_aad IS DISTINCT FROM 'null'::jsonb
					OR spool_authority IS DISTINCT FROM 'null'::jsonb THEN
					RAISE EXCEPTION 'bodyless Provider execution carries spool metadata'
						USING ERRCODE='23514';
				END IF;
			ELSE
				IF jsonb_typeof(spool_receipt)<>'object'
					OR agent_evaluation_jsonb_object_key_count(spool_receipt)<>32
					OR jsonb_typeof(spool_aad)<>'object'
					OR agent_evaluation_jsonb_object_key_count(spool_aad)<>18
					OR jsonb_typeof(spool_authority)<>'object'
					OR agent_evaluation_jsonb_object_key_count(spool_authority)<>14
					OR spool_receipt->>'receiptDigest' IS DISTINCT FROM NEW.spool_receipt_digest
					OR spool_receipt->>'spoolRef' IS DISTINCT FROM NEW.spool_ref
					OR spool_receipt->>'aadDigest' IS DISTINCT FROM NEW.spool_aad_digest
					OR spool_receipt->>'envelopeDigest' IS DISTINCT FROM NEW.spool_envelope_digest
					OR spool_receipt->>'ciphertextDigest' IS DISTINCT FROM NEW.ciphertext_digest
					OR (spool_receipt->>'ciphertextSizeBytes')::bigint IS DISTINCT FROM
						NEW.ciphertext_size_bytes
					OR spool_receipt->>'responseBodyDigest' IS DISTINCT FROM NEW.response_body_digest
					OR spool_receipt->>'responseProjectionDigest' IS DISTINCT FROM
						NEW.response_projection_digest
					OR spool_receipt->>'responseDigest' IS DISTINCT FROM NEW.response_digest
					OR spool_receipt->>'normalizedEventSetDigest' IS DISTINCT FROM
						NEW.normalized_event_set_digest
					OR agent_evaluation_canonical_jsonb_digest(spool_receipt-'receiptDigest')
						IS DISTINCT FROM NEW.spool_receipt_digest
					OR agent_evaluation_canonical_jsonb_digest(spool_aad) IS DISTINCT FROM
						NEW.spool_aad_digest
					OR spool_authority->>'spoolRef' IS DISTINCT FROM NEW.spool_ref
					OR spool_authority->>'aadDigest' IS DISTINCT FROM NEW.spool_aad_digest
					OR spool_authority->>'envelopeDigest' IS DISTINCT FROM NEW.spool_envelope_digest
					OR spool_authority->>'ciphertextDigest' IS DISTINCT FROM NEW.ciphertext_digest
					OR (spool_authority->>'ciphertextSizeBytes')::bigint IS DISTINCT FROM
						NEW.ciphertext_size_bytes
					OR (spool_receipt->>'createdAt')::timestamptz IS DISTINCT FROM
						(response->>'observedAt')::timestamptz
					OR (spool_receipt->>'expiresAt')::timestamptz>stage_row.expires_at THEN
					RAISE EXCEPTION 'Provider journal execution spool metadata drifted'
						USING ERRCODE='23514';
				END IF;
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_executions_exact
			BEFORE INSERT ON agent_evaluation_capability_effect_provider_journal_executions
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_journal_execution()`,
		`CREATE TRIGGER agent_eval_provider_journal_executions_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_executions
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_provider_journal_executions_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_executions
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_journal_spool_payload()
			RETURNS trigger AS $$
		DECLARE
			execution_row agent_evaluation_capability_effect_provider_journal_executions%ROWTYPE;
			ciphertext BYTEA;
			envelope_authority JSONB;
		BEGIN
			SELECT * INTO execution_row
			FROM agent_evaluation_capability_effect_provider_journal_executions
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest
				AND execution_sequence=NEW.execution_sequence
			FOR SHARE;
			IF NOT FOUND OR execution_row.spool_receipt_digest IS NULL
				OR execution_row.spool_ref<>NEW.spool_ref
				OR execution_row.spool_receipt_digest<>NEW.spool_receipt_digest
				OR (execution_row.record_json#>>'{executionReceipt,resultSpoolReceipt,expiresAt}')::timestamptz
					IS DISTINCT FROM NEW.expires_at THEN
				RAISE EXCEPTION 'Provider journal spool payload lacks exact execution metadata'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.spool_envelope_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.spool_envelope_json)<>15
				OR NOT (NEW.spool_envelope_json ?& ARRAY[
					'format','version','spoolId','algorithm','keyId','keyVersion','keyRefDigest',
					'encryptionProfileDigest','nonceBase64Url','authenticationTagBase64Url',
					'ciphertextBase64Url','ciphertextDigest','ciphertextSizeBytes','aadDigest',
					'envelopeDigest'
				])
				OR NEW.spool_envelope_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-provider-result-spool-envelope'
				OR (NEW.spool_envelope_json->>'version')::bigint IS DISTINCT FROM 1
				OR NEW.spool_envelope_json->>'spoolId' IS DISTINCT FROM NEW.spool_ref
				OR NEW.spool_envelope_json->>'algorithm' IS DISTINCT FROM 'aes-256-gcm'
				OR NEW.spool_envelope_json->>'ciphertextDigest' IS DISTINCT FROM
					execution_row.ciphertext_digest
				OR (NEW.spool_envelope_json->>'ciphertextSizeBytes')::bigint IS DISTINCT FROM
					execution_row.ciphertext_size_bytes
				OR NEW.spool_envelope_json->>'aadDigest' IS DISTINCT FROM
					execution_row.spool_aad_digest
				OR NEW.spool_envelope_json->>'envelopeDigest' IS DISTINCT FROM
					execution_row.spool_envelope_digest
				OR octet_length(agent_evaluation_base64url_decode(
					NEW.spool_envelope_json->>'nonceBase64Url'
				)) IS DISTINCT FROM 12
				OR octet_length(agent_evaluation_base64url_decode(
					NEW.spool_envelope_json->>'authenticationTagBase64Url'
				)) IS DISTINCT FROM 16 THEN
				RAISE EXCEPTION 'Provider journal spool envelope shape drifted'
					USING ERRCODE='23514';
			END IF;
			ciphertext:=agent_evaluation_base64url_decode(
				NEW.spool_envelope_json->>'ciphertextBase64Url'
			);
			IF ciphertext IS NULL OR octet_length(ciphertext)<>execution_row.ciphertext_size_bytes
				OR 'sha256-'||encode(digest(ciphertext,'sha256'),'hex')<>
					execution_row.ciphertext_digest THEN
				RAISE EXCEPTION 'Provider journal spool ciphertext digest drifted'
					USING ERRCODE='23514';
			END IF;
			envelope_authority:=jsonb_build_object(
				'algorithm',NEW.spool_envelope_json->'algorithm',
				'keyId',NEW.spool_envelope_json->'keyId',
				'keyVersion',NEW.spool_envelope_json->'keyVersion',
				'keyRefDigest',NEW.spool_envelope_json->'keyRefDigest',
				'encryptionProfileDigest',NEW.spool_envelope_json->'encryptionProfileDigest',
				'nonceBase64Url',NEW.spool_envelope_json->'nonceBase64Url',
				'authenticationTagBase64Url',NEW.spool_envelope_json->'authenticationTagBase64Url',
				'ciphertextDigest',NEW.spool_envelope_json->'ciphertextDigest',
				'ciphertextSizeBytes',NEW.spool_envelope_json->'ciphertextSizeBytes',
				'aadDigest',NEW.spool_envelope_json->'aadDigest'
			);
			IF agent_evaluation_canonical_jsonb_digest(envelope_authority)<>
				execution_row.spool_envelope_digest THEN
				RAISE EXCEPTION 'Provider journal spool envelope authority digest drifted'
					USING ERRCODE='23514';
			END IF;
			IF agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
				'format','prodivix.agent-evaluation-capability-effect-provider-journal-execution-write',
				'version',1,
				'executionRecord',execution_row.record_json,
				'spoolEnvelope',NEW.spool_envelope_json
			))<>execution_row.write_digest
				OR octet_length(convert_to(agent_evaluation_canonical_jsonb_text(
					jsonb_build_object(
						'format','prodivix.agent-evaluation-capability-effect-provider-journal-execution-write',
						'version',1,
						'executionRecord',execution_row.record_json,
						'spoolEnvelope',NEW.spool_envelope_json,
						'writeDigest',execution_row.write_digest
					)
				),'UTF8'))>589824 THEN
				RAISE EXCEPTION 'Provider journal encrypted execution write drifted or is unbounded'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_spool_payloads_exact
			BEFORE INSERT ON agent_evaluation_capability_effect_provider_journal_spool_payloads
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_journal_spool_payload()`,
		`CREATE OR REPLACE FUNCTION reject_agent_evaluation_provider_journal_spool_payload_update()
			RETURNS trigger AS $$
		BEGIN
			RAISE EXCEPTION 'Provider journal encrypted spool payloads cannot be updated'
				USING ERRCODE='23514';
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_spool_payloads_no_update
			BEFORE UPDATE ON agent_evaluation_capability_effect_provider_journal_spool_payloads
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_provider_journal_spool_payload_update()`,
		`CREATE TRIGGER agent_eval_provider_journal_spool_payloads_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_spool_payloads
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_journal_spool_disposition()
			RETURNS trigger AS $$
		DECLARE
			execution_row agent_evaluation_capability_effect_provider_journal_executions%ROWTYPE;
			spool_receipt JSONB;
		BEGIN
			SELECT * INTO execution_row
			FROM agent_evaluation_capability_effect_provider_journal_executions
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest
				AND execution_sequence=NEW.execution_sequence
			FOR SHARE;
			spool_receipt:=execution_row.record_json#>'{executionReceipt,resultSpoolReceipt}';
			IF NOT FOUND OR execution_row.spool_receipt_digest IS NULL
				OR NOT EXISTS (
					SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_spool_payloads payload
					WHERE payload.namespace_id=NEW.namespace_id
						AND payload.plan_digest=NEW.plan_digest
						AND payload.repository_commit=NEW.repository_commit
						AND payload.owner_instance_id=NEW.owner_instance_id
						AND payload.owner_request_digest=NEW.owner_request_digest
						AND payload.execution_sequence=NEW.execution_sequence
				)
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>19
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','spoolRef','spoolReceiptDigest','planDigest',
					'repositoryCommit','attemptId','descriptorDigest','turnIndex','invocationId',
					'ownerRequestDigest','stageDigest','executionSequence','disposition',
					'resultSealReceiptDigest','abandonmentReason','retentionPolicyDigest',
					'disposedAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-spool-disposition-receipt'
				OR (NEW.receipt_json->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')
					IS DISTINCT FROM NEW.receipt_digest
				OR NEW.receipt_json->>'receiptDigest' IS DISTINCT FROM NEW.receipt_digest
				OR NEW.receipt_json->>'spoolRef' IS DISTINCT FROM execution_row.spool_ref
				OR NEW.receipt_json->>'spoolReceiptDigest' IS DISTINCT FROM
					execution_row.spool_receipt_digest
				OR NEW.receipt_json->>'planDigest' IS DISTINCT FROM NEW.plan_digest
				OR NEW.receipt_json->>'repositoryCommit' IS DISTINCT FROM NEW.repository_commit
				OR NEW.receipt_json->>'attemptId' IS DISTINCT FROM
					execution_row.record_json->>'attemptId'
				OR NEW.receipt_json->>'descriptorDigest' IS DISTINCT FROM
					execution_row.record_json->>'descriptorDigest'
				OR (NEW.receipt_json->>'turnIndex')::bigint IS DISTINCT FROM
					(execution_row.record_json->>'turnIndex')::bigint
				OR NEW.receipt_json->>'invocationId' IS DISTINCT FROM
					execution_row.record_json->>'invocationId'
				OR NEW.receipt_json->>'ownerRequestDigest' IS DISTINCT FROM NEW.owner_request_digest
				OR NEW.receipt_json->>'stageDigest' IS DISTINCT FROM execution_row.stage_digest
				OR (NEW.receipt_json->>'executionSequence')::bigint IS DISTINCT FROM
					NEW.execution_sequence
				OR NEW.receipt_json->>'disposition' IS DISTINCT FROM NEW.disposition
				OR NEW.receipt_json->>'resultSealReceiptDigest' IS DISTINCT FROM
					NEW.result_seal_receipt_digest
				OR NEW.receipt_json->>'abandonmentReason' IS DISTINCT FROM NEW.abandonment_reason
				OR NEW.receipt_json->>'retentionPolicyDigest' IS DISTINCT FROM
					spool_receipt->>'retentionPolicyDigest'
				OR (NEW.receipt_json->>'disposedAt')::timestamptz IS DISTINCT FROM NEW.disposed_at
				OR NEW.disposed_at<(execution_row.sealed_at)
				OR NEW.disposed_at>=(spool_receipt->>'expiresAt')::timestamptz THEN
				RAISE EXCEPTION 'Provider journal spool disposition drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_spool_dispositions_exact
			BEFORE INSERT ON agent_evaluation_capability_effect_provider_journal_spool_dispositions
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_journal_spool_disposition()`,
		`CREATE TRIGGER agent_eval_provider_journal_spool_dispositions_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_spool_dispositions
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_provider_journal_spool_dispositions_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_spool_dispositions
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION authorize_agent_evaluation_provider_journal_spool_payload_delete()
			RETURNS trigger AS $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_capability_effect_provider_journal_spool_dispositions disposition
				WHERE disposition.namespace_id=OLD.namespace_id
					AND disposition.plan_digest=OLD.plan_digest
					AND disposition.repository_commit=OLD.repository_commit
					AND disposition.owner_instance_id=OLD.owner_instance_id
					AND disposition.owner_request_digest=OLD.owner_request_digest
					AND disposition.execution_sequence=OLD.execution_sequence
			) THEN
				RAISE EXCEPTION 'Provider journal spool deletion requires its durable disposition'
					USING ERRCODE='23514';
			END IF;
			RETURN OLD;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_spool_payloads_authorized_delete
			BEFORE DELETE ON agent_evaluation_capability_effect_provider_journal_spool_payloads
			FOR EACH ROW EXECUTE FUNCTION authorize_agent_evaluation_provider_journal_spool_payload_delete()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_provider_journal_execution_write()
			RETURNS trigger AS $$
		DECLARE
			execution_row agent_evaluation_capability_effect_provider_journal_executions%ROWTYPE;
			payload_json JSONB;
			payload_count BIGINT;
			write_base JSONB;
			write_record JSONB;
		BEGIN
			IF TG_OP='DELETE' THEN
				SELECT * INTO execution_row
				FROM agent_evaluation_capability_effect_provider_journal_executions
				WHERE namespace_id=OLD.namespace_id AND plan_digest=OLD.plan_digest
					AND repository_commit=OLD.repository_commit
					AND owner_instance_id=OLD.owner_instance_id
					AND owner_request_digest=OLD.owner_request_digest
					AND execution_sequence=OLD.execution_sequence;
			ELSE
				SELECT * INTO execution_row
				FROM agent_evaluation_capability_effect_provider_journal_executions
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND owner_instance_id=NEW.owner_instance_id
					AND owner_request_digest=NEW.owner_request_digest
					AND execution_sequence=NEW.execution_sequence;
			END IF;
			IF NOT FOUND THEN
				RETURN NULL;
			END IF;
			SELECT COUNT(*),MIN(spool_envelope_json::text)::jsonb
			INTO payload_count,payload_json
			FROM agent_evaluation_capability_effect_provider_journal_spool_payloads
			WHERE namespace_id=execution_row.namespace_id
				AND plan_digest=execution_row.plan_digest
				AND repository_commit=execution_row.repository_commit
				AND owner_instance_id=execution_row.owner_instance_id
				AND owner_request_digest=execution_row.owner_request_digest
				AND execution_sequence=execution_row.execution_sequence;
			IF (execution_row.spool_receipt_digest IS NULL AND payload_count<>0)
				OR (execution_row.spool_receipt_digest IS NOT NULL
					AND payload_count<>1
					AND NOT EXISTS (
						SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_spool_dispositions
						WHERE namespace_id=execution_row.namespace_id
							AND plan_digest=execution_row.plan_digest
							AND repository_commit=execution_row.repository_commit
							AND owner_instance_id=execution_row.owner_instance_id
							AND owner_request_digest=execution_row.owner_request_digest
							AND execution_sequence=execution_row.execution_sequence
					)) THEN
				RAISE EXCEPTION 'Provider journal execution ACK lacks its encrypted spool'
					USING ERRCODE='23514';
			END IF;
			IF payload_count=0 AND execution_row.spool_receipt_digest IS NOT NULL THEN
				RETURN NULL;
			END IF;
			write_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-capability-effect-provider-journal-execution-write',
				'version',1,
				'executionRecord',execution_row.record_json,
				'spoolEnvelope',CASE WHEN payload_count=1 THEN payload_json ELSE 'null'::jsonb END
			);
			IF agent_evaluation_canonical_jsonb_digest(write_base)<>execution_row.write_digest THEN
				RAISE EXCEPTION 'Provider journal execution write digest drifted'
					USING ERRCODE='23514';
			END IF;
			write_record:=write_base||jsonb_build_object('writeDigest',execution_row.write_digest);
			IF octet_length(convert_to(agent_evaluation_canonical_jsonb_text(write_record),'UTF8'))>589824 THEN
				RAISE EXCEPTION 'Provider journal execution write exceeds its bounded envelope'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_execution_write_required
			AFTER INSERT ON agent_evaluation_capability_effect_provider_journal_executions
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_execution_write()`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_payload_write_required
			AFTER INSERT OR DELETE ON agent_evaluation_capability_effect_provider_journal_spool_payloads
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_execution_write()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_journal_result()
			RETURNS trigger AS $$
		DECLARE
			stage_row agent_evaluation_capability_effect_provider_journal_stages%ROWTYPE;
			terminal_row agent_evaluation_capability_effect_provider_journal_executions%ROWTYPE;
			result_seal JSONB;
			business_result JSONB;
			effect_fact JSONB;
			stateful BOOLEAN;
			vault_count BIGINT;
			latest_sequence BIGINT;
			expected_business_status TEXT;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
					chr(31)||NEW.owner_instance_id||chr(31)||NEW.owner_request_digest||
					chr(31)||'provider-journal-terminal',0
			));
			SELECT * INTO stage_row
			FROM agent_evaluation_capability_effect_provider_journal_stages
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest
			FOR SHARE;
			IF NOT FOUND OR EXISTS (
				SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_abandonments
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND owner_instance_id=NEW.owner_instance_id
					AND owner_request_digest=NEW.owner_request_digest
			) THEN
				RAISE EXCEPTION 'Provider journal result lacks a live unique owner'
					USING ERRCODE='23514';
			END IF;
			SELECT * INTO terminal_row
			FROM agent_evaluation_capability_effect_provider_journal_executions
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest
				AND record_digest=NEW.terminal_execution_record_digest
			FOR SHARE;
			SELECT MAX(execution_sequence) INTO latest_sequence
			FROM agent_evaluation_capability_effect_provider_journal_executions
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest;
			IF terminal_row.record_digest IS NULL OR latest_sequence IS NULL
				OR terminal_row.execution_sequence<>latest_sequence
				OR terminal_row.record_json#>>'{executionReceipt,executionStatus}'='in-progress' THEN
				RAISE EXCEPTION 'Provider journal result lacks its terminal execution'
					USING ERRCODE='23514';
			END IF;

			result_seal:=NEW.record_json->'resultSealReceipt';
			business_result:=NEW.record_json->'businessResult';
			effect_fact:=NEW.record_json->'effectSourceFact';
			IF jsonb_typeof(NEW.record_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.record_json)<>25
				OR NOT (NEW.record_json ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
					'descriptorDigest','turnIndex','invocationId','ownerRequestId',
					'ownerRequestDigest','runtimeFactSourceAuthorityDigest','preEffectIntentDigest',
					'stageDigest','terminalExecutionRecordDigest','businessResult','effectSourceFact',
					'stateVaultRetireRequest','stateVaultRetirementReceipt',
					'nextStateVaultSealRequest','nextStateVaultSealReceipt','resultSealReceipt',
					'spoolDispositionReceipts','sealedAt','recordDigest'
				])
				OR NEW.record_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-journal-result-record'
				OR (NEW.record_json->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(NEW.record_json-'recordDigest')
					IS DISTINCT FROM NEW.record_digest
				OR NEW.record_json->>'recordDigest' IS DISTINCT FROM NEW.record_digest
				OR jsonb_typeof(result_seal)<>'object'
				OR agent_evaluation_jsonb_object_key_count(result_seal)<>20
				OR NOT (result_seal ?& ARRAY[
					'format','version','stageDigest','executionReceiptDigest','readinessReceiptDigest',
					'resultStatus','businessResultDigest','sourceFactKind','sourceFactDigest',
					'stateVaultRetireRequestDigest','stateVaultRetirementReceiptDigest',
					'nextStateVaultSealRequestDigest','nextStateVaultSealReceiptDigest',
					'providerResourceSetCommitmentDigest','providerResourceAuthorityDigest',
					'providerResourceReadRequestDigest','providerResourceReadReceiptDigest',
					'consumedInputSourceFactDigest','sealedAt','receiptDigest'
				])
				OR result_seal->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-result-seal-receipt'
				OR (result_seal->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(result_seal-'receiptDigest')
					IS DISTINCT FROM NEW.result_seal_receipt_digest
				OR result_seal->>'receiptDigest' IS DISTINCT FROM NEW.result_seal_receipt_digest
				OR jsonb_typeof(business_result)<>'object'
				OR agent_evaluation_jsonb_object_key_count(business_result)<>5
				OR NOT (business_result ?& ARRAY[
					'status','providerStatus','outputText','responseDigest','resultDigest'
				])
				OR agent_evaluation_canonical_jsonb_digest(business_result-'resultDigest')
					IS DISTINCT FROM NEW.business_result_digest
				OR business_result->>'resultDigest' IS DISTINCT FROM NEW.business_result_digest
				OR NEW.record_json->>'namespaceId' IS DISTINCT FROM stage_row.namespace_id
				OR NEW.record_json->>'planDigest' IS DISTINCT FROM stage_row.plan_digest
				OR NEW.record_json->>'repositoryCommit' IS DISTINCT FROM stage_row.repository_commit
				OR NEW.record_json->>'attemptId' IS DISTINCT FROM stage_row.attempt_id
				OR NEW.record_json->>'descriptorDigest' IS DISTINCT FROM stage_row.descriptor_digest
				OR (NEW.record_json->>'turnIndex')::bigint IS DISTINCT FROM stage_row.turn_index
				OR NEW.record_json->>'invocationId' IS DISTINCT FROM stage_row.invocation_id
				OR NEW.record_json->>'ownerRequestId' IS DISTINCT FROM stage_row.owner_request_id
				OR NEW.record_json->>'ownerRequestDigest' IS DISTINCT FROM stage_row.owner_request_digest
				OR NEW.record_json->>'runtimeFactSourceAuthorityDigest' IS DISTINCT FROM
					stage_row.runtime_fact_source_authority_digest
				OR NEW.record_json->>'preEffectIntentDigest' IS DISTINCT FROM
					stage_row.pre_effect_intent_digest
				OR NEW.record_json->>'stageDigest' IS DISTINCT FROM stage_row.stage_digest
				OR NEW.record_json->>'terminalExecutionRecordDigest' IS DISTINCT FROM
					NEW.terminal_execution_record_digest
				OR (NEW.record_json->>'sealedAt')::timestamptz IS DISTINCT FROM NEW.sealed_at
				OR result_seal->>'stageDigest' IS DISTINCT FROM stage_row.stage_digest
				OR result_seal->>'executionReceiptDigest' IS DISTINCT FROM
					terminal_row.execution_receipt_digest
				OR result_seal->>'resultStatus' IS DISTINCT FROM NEW.result_status
				OR result_seal->>'businessResultDigest' IS DISTINCT FROM NEW.business_result_digest
				OR result_seal->>'sourceFactKind' IS DISTINCT FROM NEW.source_fact_kind
				OR result_seal->>'sourceFactDigest' IS DISTINCT FROM NEW.source_fact_digest
				OR result_seal->>'consumedInputSourceFactDigest' IS DISTINCT FROM
					NEW.consumed_input_source_fact_digest
				OR (result_seal->>'sealedAt')::timestamptz IS DISTINCT FROM NEW.sealed_at
				OR NEW.sealed_at<terminal_row.executed_at
				OR NEW.sealed_at>=stage_row.expires_at
				OR NEW.sealed_at>terminal_row.executed_at+INTERVAL '30 seconds' THEN
				RAISE EXCEPTION 'Provider journal result canonical record drifted'
					USING ERRCODE='23514';
			END IF;

			expected_business_status:=CASE NEW.result_status
				WHEN 'produced' THEN 'completed' ELSE NEW.result_status END;
			IF business_result->>'status'<>expected_business_status
				OR business_result->>'status'<>terminal_row.record_json#>>'{executionReceipt,executionStatus}'
				OR business_result->>'responseDigest'<>terminal_row.response_digest
				OR (NEW.source_fact_digest IS NULL)<>(effect_fact='null'::jsonb)
				OR (NEW.source_fact_digest IS NOT NULL AND (
					jsonb_typeof(effect_fact)<>'object'
					OR agent_evaluation_jsonb_object_key_count(effect_fact)<>3
					OR effect_fact->>'factKind'<>NEW.source_fact_kind
					OR effect_fact->>'factDigest'<>NEW.source_fact_digest
				)) THEN
				RAISE EXCEPTION 'Provider journal business result or source fact drifted'
					USING ERRCODE='23514';
			END IF;

			stateful:=stage_row.binding_kind IN ('provider-job','opaque-continuation');
			IF stateful THEN
				IF jsonb_typeof(NEW.record_json->'stateVaultRetireRequest')<>'object'
					OR jsonb_typeof(NEW.record_json->'stateVaultRetirementReceipt')<>'object'
					OR result_seal->>'stateVaultRetireRequestDigest' IS DISTINCT FROM
						NEW.state_vault_retire_request_digest
					OR result_seal->>'stateVaultRetirementReceiptDigest' IS DISTINCT FROM
						NEW.state_vault_retirement_receipt_digest THEN
					RAISE EXCEPTION 'stateful Provider journal result lacks vault retirement'
						USING ERRCODE='23514';
				END IF;
				SELECT COUNT(*) INTO vault_count
				FROM agent_evaluation_native_provider_state_vault_records vault
				WHERE vault.namespace_id=NEW.namespace_id
					AND vault.plan_digest=NEW.plan_digest
					AND vault.repository_commit=NEW.repository_commit
					AND vault.status='retired' AND vault.disposition='consumed'
					AND vault.recovery_request_digest IS NULL AND vault.v45_eligible
					AND vault.retire_request_digest=NEW.state_vault_retire_request_digest
					AND vault.retirement_receipt_digest=NEW.state_vault_retirement_receipt_digest
					AND vault.retire_request_json=NEW.record_json->'stateVaultRetireRequest'
					AND vault.retirement_receipt_json=NEW.record_json->'stateVaultRetirementReceipt'
					AND vault.seal_request_json=stage_row.record_json#>'{preEffectIntent,inputAuthorityBinding,stateVaultSealRequest}'
					AND vault.seal_receipt_json=stage_row.record_json#>'{preEffectIntent,inputAuthorityBinding,stateVaultSealReceipt}';
				IF vault_count<>1 THEN
					RAISE EXCEPTION 'Provider journal result lacks exact consumed vault record'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.record_json->'stateVaultRetireRequest' IS DISTINCT FROM 'null'::jsonb
				OR NEW.record_json->'stateVaultRetirementReceipt' IS DISTINCT FROM 'null'::jsonb
				OR NEW.state_vault_retire_request_digest IS NOT NULL
				OR NEW.state_vault_retirement_receipt_digest IS NOT NULL
				OR result_seal->'stateVaultRetireRequestDigest' IS DISTINCT FROM 'null'::jsonb
				OR result_seal->'stateVaultRetirementReceiptDigest' IS DISTINCT FROM 'null'::jsonb THEN
				RAISE EXCEPTION 'stateless Provider journal result carries vault retirement'
					USING ERRCODE='23514';
			END IF;

			IF stage_row.binding_kind='opaque-continuation' AND NEW.result_status='produced' THEN
				IF jsonb_typeof(NEW.record_json->'nextStateVaultSealRequest')<>'object'
					OR jsonb_typeof(NEW.record_json->'nextStateVaultSealReceipt')<>'object'
					OR result_seal->>'nextStateVaultSealRequestDigest' IS DISTINCT FROM
						NEW.next_state_vault_seal_request_digest
					OR result_seal->>'nextStateVaultSealReceiptDigest' IS DISTINCT FROM
						NEW.next_state_vault_seal_receipt_digest THEN
					RAISE EXCEPTION 'continuation Provider journal result lacks next vault seal'
						USING ERRCODE='23514';
				END IF;
				SELECT COUNT(*) INTO vault_count
				FROM agent_evaluation_native_provider_state_vault_records vault
				WHERE vault.namespace_id=NEW.namespace_id
					AND vault.plan_digest=NEW.plan_digest
					AND vault.repository_commit=NEW.repository_commit
					AND vault.status='active' AND vault.v45_eligible
					AND vault.seal_request_digest=NEW.next_state_vault_seal_request_digest
					AND vault.seal_receipt_digest=NEW.next_state_vault_seal_receipt_digest
					AND vault.seal_request_json=NEW.record_json->'nextStateVaultSealRequest'
					AND vault.seal_receipt_json=NEW.record_json->'nextStateVaultSealReceipt';
				IF vault_count<>1 THEN
					RAISE EXCEPTION 'continuation Provider journal result lacks exact active next vault seal'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.record_json->'nextStateVaultSealRequest' IS DISTINCT FROM 'null'::jsonb
				OR NEW.record_json->'nextStateVaultSealReceipt' IS DISTINCT FROM 'null'::jsonb
				OR NEW.next_state_vault_seal_request_digest IS NOT NULL
				OR NEW.next_state_vault_seal_receipt_digest IS NOT NULL
				OR result_seal->'nextStateVaultSealRequestDigest' IS DISTINCT FROM 'null'::jsonb
				OR result_seal->'nextStateVaultSealReceiptDigest' IS DISTINCT FROM 'null'::jsonb THEN
				RAISE EXCEPTION 'Provider journal result carries unexpected next vault seal'
					USING ERRCODE='23514';
			END IF;

			IF result_seal->>'providerResourceSetCommitmentDigest' IS DISTINCT FROM
					NEW.provider_resource_set_commitment_digest
				OR result_seal->>'providerResourceAuthorityDigest' IS DISTINCT FROM
					NEW.provider_resource_authority_digest
				OR result_seal->>'providerResourceReadRequestDigest' IS DISTINCT FROM
					NEW.provider_resource_read_request_digest
				OR result_seal->>'providerResourceReadReceiptDigest' IS DISTINCT FROM
					NEW.provider_resource_read_receipt_digest
				OR NEW.provider_resource_set_commitment_digest IS DISTINCT FROM
					stage_row.provider_resource_set_commitment_digest
				OR NEW.provider_resource_authority_digest IS DISTINCT FROM
					stage_row.provider_resource_authority_digest
				OR NEW.provider_resource_read_request_digest IS DISTINCT FROM
					stage_row.provider_resource_read_request_digest
				OR NEW.provider_resource_read_receipt_digest IS DISTINCT FROM
					stage_row.provider_resource_read_receipt_digest THEN
				RAISE EXCEPTION 'Provider journal result resource authority digests drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_results_exact
			BEFORE INSERT ON agent_evaluation_capability_effect_provider_journal_results
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_journal_result()`,
		`CREATE TRIGGER agent_eval_provider_journal_results_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_results
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_provider_journal_results_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_results
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_journal_abandonment()
			RETURNS trigger AS $$
		DECLARE
			stage_row agent_evaluation_capability_effect_provider_journal_stages%ROWTYPE;
			latest_record_digest TEXT;
			latest_sealed_at TIMESTAMPTZ;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
					chr(31)||NEW.owner_instance_id||chr(31)||NEW.owner_request_digest||
					chr(31)||'provider-journal-terminal',0
			));
			SELECT * INTO stage_row
			FROM agent_evaluation_capability_effect_provider_journal_stages
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest
			FOR SHARE;
			IF NOT FOUND OR EXISTS (
				SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_results
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND owner_instance_id=NEW.owner_instance_id
					AND owner_request_digest=NEW.owner_request_digest
			) THEN
				RAISE EXCEPTION 'Provider journal abandonment lacks a live unique owner'
					USING ERRCODE='23514';
			END IF;
			SELECT record_digest,sealed_at INTO latest_record_digest,latest_sealed_at
			FROM agent_evaluation_capability_effect_provider_journal_executions
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest
			ORDER BY execution_sequence DESC LIMIT 1 FOR SHARE;
			IF NEW.last_execution_record_digest IS DISTINCT FROM latest_record_digest
				OR NEW.abandoned_at<COALESCE(latest_sealed_at,stage_row.sealed_at)
				OR (NEW.reason='stage-expired' AND NEW.abandoned_at<stage_row.expires_at) THEN
				RAISE EXCEPTION 'Provider journal abandonment terminal position drifted'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.record_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.record_json)<>19
				OR NOT (NEW.record_json ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
					'descriptorDigest','turnIndex','invocationId','ownerRequestId',
					'ownerRequestDigest','runtimeFactSourceAuthorityDigest','preEffectIntentDigest',
					'stageDigest','lastExecutionRecordDigest','reason','spoolDispositionReceipts',
					'abandonedAt','recordDigest'
				])
				OR NEW.record_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-journal-abandonment-record'
				OR (NEW.record_json->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(NEW.record_json-'recordDigest')
					IS DISTINCT FROM NEW.record_digest
				OR NEW.record_json->>'recordDigest' IS DISTINCT FROM NEW.record_digest
				OR NEW.record_json->>'namespaceId' IS DISTINCT FROM stage_row.namespace_id
				OR NEW.record_json->>'planDigest' IS DISTINCT FROM stage_row.plan_digest
				OR NEW.record_json->>'repositoryCommit' IS DISTINCT FROM stage_row.repository_commit
				OR NEW.record_json->>'attemptId' IS DISTINCT FROM stage_row.attempt_id
				OR NEW.record_json->>'descriptorDigest' IS DISTINCT FROM stage_row.descriptor_digest
				OR (NEW.record_json->>'turnIndex')::bigint IS DISTINCT FROM stage_row.turn_index
				OR NEW.record_json->>'invocationId' IS DISTINCT FROM stage_row.invocation_id
				OR NEW.record_json->>'ownerRequestId' IS DISTINCT FROM stage_row.owner_request_id
				OR NEW.record_json->>'ownerRequestDigest' IS DISTINCT FROM stage_row.owner_request_digest
				OR NEW.record_json->>'runtimeFactSourceAuthorityDigest' IS DISTINCT FROM
					stage_row.runtime_fact_source_authority_digest
				OR NEW.record_json->>'preEffectIntentDigest' IS DISTINCT FROM
					stage_row.pre_effect_intent_digest
				OR NEW.record_json->>'stageDigest' IS DISTINCT FROM stage_row.stage_digest
				OR NEW.record_json->>'lastExecutionRecordDigest' IS DISTINCT FROM
					NEW.last_execution_record_digest
				OR NEW.record_json->>'reason' IS DISTINCT FROM NEW.reason
				OR (NEW.record_json->>'abandonedAt')::timestamptz IS DISTINCT FROM NEW.abandoned_at
				OR jsonb_typeof(NEW.record_json->'spoolDispositionReceipts')<>'array' THEN
				RAISE EXCEPTION 'Provider journal abandonment canonical record drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_abandonments_exact
			BEFORE INSERT ON agent_evaluation_capability_effect_provider_journal_abandonments
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_journal_abandonment()`,
		`CREATE TRIGGER agent_eval_provider_journal_abandonments_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_abandonments
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_provider_journal_abandonments_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_abandonments
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_provider_journal_archive_projection(
			candidate_namespace_id TEXT,
			candidate_plan_digest TEXT,
			candidate_repository_commit TEXT,
			candidate_owner_instance_id TEXT,
			candidate_owner_request_digest TEXT,
			candidate_result JSONB
		) RETURNS JSONB LANGUAGE plpgsql STABLE PARALLEL RESTRICTED AS $$
		DECLARE
			stage_row agent_evaluation_capability_effect_provider_journal_stages%ROWTYPE;
			executions JSONB;
			placeholder_digest TEXT;
		BEGIN
			SELECT * INTO STRICT stage_row
			FROM agent_evaluation_capability_effect_provider_journal_stages
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND owner_instance_id=candidate_owner_instance_id
				AND owner_request_digest=candidate_owner_request_digest;
			SELECT COALESCE(jsonb_agg(record_json ORDER BY execution_sequence),'[]'::jsonb)
			INTO executions
			FROM agent_evaluation_capability_effect_provider_journal_executions
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND owner_instance_id=candidate_owner_instance_id
				AND owner_request_digest=candidate_owner_request_digest;
			placeholder_digest:=agent_evaluation_canonical_jsonb_digest(
				'{"capabilityEffectProviderArchivePlaceholder":1}'::jsonb
			);
			RETURN jsonb_build_object(
				'format','prodivix.agent-evaluation-capability-effect-provider-runtime-archive-record',
				'version',1,
				'attemptId',stage_row.attempt_id,
				'turnIndex',stage_row.turn_index,
				'ownerRequestDigest',stage_row.owner_request_digest,
				'preEffectIntentDigest',stage_row.pre_effect_intent_digest,
				'stageRecord',stage_row.record_json,
				'executionRecords',executions,
				'resultRecord',candidate_result,
				'effectSourceReceiptDigest',placeholder_digest,
				'recordDigest',placeholder_digest
			);
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_provider_journal_terminal_closure()
			RETURNS trigger AS $$
		DECLARE
			candidate_namespace_id TEXT;
			candidate_plan_digest TEXT;
			candidate_repository_commit TEXT;
			candidate_owner_instance_id TEXT;
			candidate_owner_request_digest TEXT;
			stage_row agent_evaluation_capability_effect_provider_journal_stages%ROWTYPE;
			result_row agent_evaluation_capability_effect_provider_journal_results%ROWTYPE;
			abandonment_row agent_evaluation_capability_effect_provider_journal_abandonments%ROWTYPE;
			disposition_records JSONB;
			disposition_count BIGINT;
			spool_count BIGINT;
			payload_count BIGINT;
			invalid_count BIGINT;
		BEGIN
			IF TG_OP='DELETE' THEN
				candidate_namespace_id:=OLD.namespace_id;
				candidate_plan_digest:=OLD.plan_digest;
				candidate_repository_commit:=OLD.repository_commit;
				candidate_owner_instance_id:=OLD.owner_instance_id;
				candidate_owner_request_digest:=OLD.owner_request_digest;
			ELSE
				candidate_namespace_id:=NEW.namespace_id;
				candidate_plan_digest:=NEW.plan_digest;
				candidate_repository_commit:=NEW.repository_commit;
				candidate_owner_instance_id:=NEW.owner_instance_id;
				candidate_owner_request_digest:=NEW.owner_request_digest;
			END IF;
			SELECT * INTO stage_row
			FROM agent_evaluation_capability_effect_provider_journal_stages
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND owner_instance_id=candidate_owner_instance_id
				AND owner_request_digest=candidate_owner_request_digest;
			IF NOT FOUND THEN RETURN NULL; END IF;
			SELECT * INTO result_row
			FROM agent_evaluation_capability_effect_provider_journal_results
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND owner_instance_id=candidate_owner_instance_id
				AND owner_request_digest=candidate_owner_request_digest;
			SELECT * INTO abandonment_row
			FROM agent_evaluation_capability_effect_provider_journal_abandonments
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND owner_instance_id=candidate_owner_instance_id
				AND owner_request_digest=candidate_owner_request_digest;
			IF (result_row.record_digest IS NULL)=(abandonment_row.record_digest IS NULL) THEN
				RAISE EXCEPTION 'Provider journal owner requires exactly one terminal record'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*) INTO spool_count
			FROM agent_evaluation_capability_effect_provider_journal_executions
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND owner_instance_id=candidate_owner_instance_id
				AND owner_request_digest=candidate_owner_request_digest
				AND spool_receipt_digest IS NOT NULL;
			SELECT COUNT(*) INTO payload_count
			FROM agent_evaluation_capability_effect_provider_journal_spool_payloads
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND owner_instance_id=candidate_owner_instance_id
				AND owner_request_digest=candidate_owner_request_digest;
			SELECT COUNT(*),COALESCE(jsonb_agg(disposition.receipt_json
				ORDER BY disposition.execution_sequence),'[]'::jsonb)
			INTO disposition_count,disposition_records
			FROM agent_evaluation_capability_effect_provider_journal_spool_dispositions disposition
			WHERE disposition.namespace_id=candidate_namespace_id
				AND disposition.plan_digest=candidate_plan_digest
				AND disposition.repository_commit=candidate_repository_commit
				AND disposition.owner_instance_id=candidate_owner_instance_id
				AND disposition.owner_request_digest=candidate_owner_request_digest;
			IF spool_count<>disposition_count OR payload_count<>0 THEN
				RAISE EXCEPTION 'terminal Provider journal owner retains encrypted spool state'
					USING ERRCODE='23514';
			END IF;
			IF result_row.record_digest IS NOT NULL THEN
				SELECT COUNT(*) INTO invalid_count
				FROM agent_evaluation_capability_effect_provider_journal_spool_dispositions disposition
				WHERE disposition.namespace_id=candidate_namespace_id
					AND disposition.plan_digest=candidate_plan_digest
					AND disposition.repository_commit=candidate_repository_commit
					AND disposition.owner_instance_id=candidate_owner_instance_id
					AND disposition.owner_request_digest=candidate_owner_request_digest
					AND (disposition.disposition<>'consumed-and-destroyed'
						OR disposition.result_seal_receipt_digest<>
							result_row.result_seal_receipt_digest
						OR disposition.abandonment_reason IS NOT NULL
						OR disposition.disposed_at<>result_row.sealed_at);
				IF invalid_count<>0 OR result_row.record_json->'spoolDispositionReceipts'<>
					disposition_records THEN
					RAISE EXCEPTION 'Provider journal result disposition set drifted'
						USING ERRCODE='23514';
				END IF;
				IF octet_length(convert_to(agent_evaluation_canonical_jsonb_text(
					agent_evaluation_provider_journal_archive_projection(
						candidate_namespace_id,candidate_plan_digest,candidate_repository_commit,
						candidate_owner_instance_id,candidate_owner_request_digest,
						result_row.record_json
					)
				),'UTF8'))>196608 THEN
					RAISE EXCEPTION 'Provider journal result cannot enter bounded archive'
						USING ERRCODE='23514';
				END IF;
			ELSE
				SELECT COUNT(*) INTO invalid_count
				FROM agent_evaluation_capability_effect_provider_journal_spool_dispositions disposition
				WHERE disposition.namespace_id=candidate_namespace_id
					AND disposition.plan_digest=candidate_plan_digest
					AND disposition.repository_commit=candidate_repository_commit
					AND disposition.owner_instance_id=candidate_owner_instance_id
					AND disposition.owner_request_digest=candidate_owner_request_digest
					AND (disposition.disposition<>'abandoned-and-destroyed'
						OR disposition.result_seal_receipt_digest IS NOT NULL
						OR disposition.abandonment_reason<>abandonment_row.reason
						OR disposition.disposed_at<>abandonment_row.abandoned_at);
				IF invalid_count<>0 OR abandonment_row.record_json->'spoolDispositionReceipts'<>
					disposition_records THEN
					RAISE EXCEPTION 'Provider journal abandonment disposition set drifted'
						USING ERRCODE='23514';
				END IF;
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_results_terminal_closure
			AFTER INSERT ON agent_evaluation_capability_effect_provider_journal_results
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_terminal_closure()`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_abandonments_terminal_closure
			AFTER INSERT ON agent_evaluation_capability_effect_provider_journal_abandonments
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_terminal_closure()`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_dispositions_terminal_closure
			AFTER INSERT ON agent_evaluation_capability_effect_provider_journal_spool_dispositions
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_terminal_closure()`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_payload_delete_terminal_closure
			AFTER DELETE ON agent_evaluation_capability_effect_provider_journal_spool_payloads
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_terminal_closure()`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_jsonb_digest_array_strictly_sorted(
			candidate JSONB,
			maximum_count BIGINT
		) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
			SELECT COALESCE(
				jsonb_typeof(candidate)='array'
				AND jsonb_array_length(candidate)<=maximum_count
				AND NOT EXISTS (
					SELECT 1 FROM (
						SELECT value,lag(value) OVER (ORDER BY ordinality) AS prior
						FROM jsonb_array_elements_text(candidate) WITH ORDINALITY item(value,ordinality)
					) ordered
					WHERE value !~ '^sha256-[a-f0-9]{64}$'
						OR (prior IS NOT NULL AND prior COLLATE "C">=value COLLATE "C")
				),FALSE
			$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_journal_cleanup_request()
			RETURNS trigger AS $$
		BEGIN
			IF jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>9
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit',
					'attemptId','reason','requestedAt','requestDigest'
				])
				OR NEW.request_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-journal-cleanup-request'
				OR (NEW.request_json->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')
					IS DISTINCT FROM NEW.request_digest
				OR NEW.request_json->>'requestDigest' IS DISTINCT FROM NEW.request_digest
				OR NEW.request_json->>'namespaceId' IS DISTINCT FROM NEW.namespace_id
				OR NEW.request_json->>'planDigest' IS DISTINCT FROM NEW.plan_digest
				OR NEW.request_json->>'repositoryCommit' IS DISTINCT FROM NEW.repository_commit
				OR NEW.request_json->>'attemptId' IS DISTINCT FROM NEW.attempt_id
				OR NEW.request_json->>'reason' IS DISTINCT FROM NEW.reason
				OR (NEW.request_json->>'requestedAt')::timestamptz IS DISTINCT FROM NEW.requested_at THEN
				RAISE EXCEPTION 'Provider journal cleanup request drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_cleanup_requests_exact
			BEFORE INSERT ON agent_evaluation_capability_effect_provider_journal_cleanup_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_journal_cleanup_request()`,
		`CREATE TRIGGER agent_eval_provider_journal_cleanup_requests_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_cleanup_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_provider_journal_cleanup_requests_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_cleanup_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_journal_cleanup_receipt()
			RETURNS trigger AS $$
		DECLARE
			request_row agent_evaluation_capability_effect_provider_journal_cleanup_requests%ROWTYPE;
		BEGIN
			SELECT * INTO request_row
			FROM agent_evaluation_capability_effect_provider_journal_cleanup_requests
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND request_digest=NEW.request_digest
			FOR SHARE;
			IF NOT FOUND
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>10
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','requestDigest','destroyedEncryptedSpoolCount',
					'abandonmentDispositionReceiptDigests','abandonmentRecordDigests',
					'residualEncryptedSpoolCount','unfinishedOwnerCount','completedAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-provider-journal-cleanup-receipt'
				OR (NEW.receipt_json->>'version')::bigint IS DISTINCT FROM 1
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')
					IS DISTINCT FROM NEW.receipt_digest
				OR NEW.receipt_json->>'receiptDigest' IS DISTINCT FROM NEW.receipt_digest
				OR NEW.receipt_json->>'requestDigest' IS DISTINCT FROM NEW.request_digest
				OR (NEW.receipt_json->>'destroyedEncryptedSpoolCount')::bigint IS DISTINCT FROM
					NEW.destroyed_encrypted_spool_count
				OR NEW.receipt_json->'abandonmentDispositionReceiptDigests' IS DISTINCT FROM
					NEW.abandonment_disposition_receipt_digests
				OR NEW.receipt_json->'abandonmentRecordDigests' IS DISTINCT FROM
					NEW.abandonment_record_digests
				OR (NEW.receipt_json->>'residualEncryptedSpoolCount')::bigint IS DISTINCT FROM 0
				OR (NEW.receipt_json->>'unfinishedOwnerCount')::bigint IS DISTINCT FROM 0
				OR (NEW.receipt_json->>'completedAt')::timestamptz IS DISTINCT FROM NEW.completed_at
				OR NEW.completed_at<request_row.requested_at
				OR NOT agent_evaluation_jsonb_digest_array_strictly_sorted(
					NEW.abandonment_disposition_receipt_digests,23520
				)
				OR NOT agent_evaluation_jsonb_digest_array_strictly_sorted(
					NEW.abandonment_record_digests,5880
				)
				OR jsonb_array_length(NEW.abandonment_disposition_receipt_digests)<>
					NEW.destroyed_encrypted_spool_count
				OR NEW.destroyed_encrypted_spool_count>
					4*jsonb_array_length(NEW.abandonment_record_digests) THEN
				RAISE EXCEPTION 'Provider journal cleanup receipt drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_provider_journal_cleanup_receipts_exact
			BEFORE INSERT ON agent_evaluation_capability_effect_provider_journal_cleanup_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_journal_cleanup_receipt()`,
		`CREATE TRIGGER agent_eval_provider_journal_cleanup_receipts_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_cleanup_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_provider_journal_cleanup_receipts_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_provider_journal_cleanup_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_provider_journal_cleanup_closure()
			RETURNS trigger AS $$
		DECLARE
			request_row agent_evaluation_capability_effect_provider_journal_cleanup_requests%ROWTYPE;
			expected_dispositions JSONB;
			expected_abandonments JSONB;
			residual_count BIGINT;
			unfinished_count BIGINT;
		BEGIN
			SELECT * INTO STRICT request_row
			FROM agent_evaluation_capability_effect_provider_journal_cleanup_requests
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND request_digest=NEW.request_digest;
			SELECT COUNT(*) INTO residual_count
			FROM agent_evaluation_capability_effect_provider_journal_spool_payloads payload
			JOIN agent_evaluation_capability_effect_provider_journal_stages stage
			  ON stage.namespace_id=payload.namespace_id AND stage.plan_digest=payload.plan_digest
			 AND stage.repository_commit=payload.repository_commit
			 AND stage.owner_instance_id=payload.owner_instance_id
			 AND stage.owner_request_digest=payload.owner_request_digest
			WHERE stage.namespace_id=NEW.namespace_id AND stage.plan_digest=NEW.plan_digest
				AND stage.repository_commit=NEW.repository_commit
				AND stage.owner_instance_id=NEW.owner_instance_id
				AND stage.attempt_id=request_row.attempt_id;
			SELECT COUNT(*) INTO unfinished_count
			FROM agent_evaluation_capability_effect_provider_journal_stages stage
			WHERE stage.namespace_id=NEW.namespace_id AND stage.plan_digest=NEW.plan_digest
				AND stage.repository_commit=NEW.repository_commit
				AND stage.owner_instance_id=NEW.owner_instance_id
				AND stage.attempt_id=request_row.attempt_id
				AND NOT EXISTS (
					SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_results result
					WHERE result.namespace_id=stage.namespace_id AND result.plan_digest=stage.plan_digest
						AND result.repository_commit=stage.repository_commit
						AND result.owner_instance_id=stage.owner_instance_id
						AND result.owner_request_digest=stage.owner_request_digest
				) AND NOT EXISTS (
					SELECT 1 FROM agent_evaluation_capability_effect_provider_journal_abandonments abandonment
					WHERE abandonment.namespace_id=stage.namespace_id
						AND abandonment.plan_digest=stage.plan_digest
						AND abandonment.repository_commit=stage.repository_commit
						AND abandonment.owner_instance_id=stage.owner_instance_id
						AND abandonment.owner_request_digest=stage.owner_request_digest
				);
			SELECT COALESCE(jsonb_agg(to_jsonb(disposition.receipt_digest)
				ORDER BY disposition.receipt_digest COLLATE "C"),'[]'::jsonb)
			INTO expected_dispositions
			FROM agent_evaluation_capability_effect_provider_journal_spool_dispositions disposition
			JOIN agent_evaluation_capability_effect_provider_journal_stages stage
			  ON stage.namespace_id=disposition.namespace_id AND stage.plan_digest=disposition.plan_digest
			 AND stage.repository_commit=disposition.repository_commit
			 AND stage.owner_instance_id=disposition.owner_instance_id
			 AND stage.owner_request_digest=disposition.owner_request_digest
			WHERE stage.namespace_id=NEW.namespace_id AND stage.plan_digest=NEW.plan_digest
				AND stage.repository_commit=NEW.repository_commit
				AND stage.owner_instance_id=NEW.owner_instance_id
				AND stage.attempt_id=request_row.attempt_id
				AND disposition.disposition='abandoned-and-destroyed'
				AND disposition.abandonment_reason=request_row.reason
				AND disposition.disposed_at BETWEEN request_row.requested_at AND NEW.completed_at;
			SELECT COALESCE(jsonb_agg(to_jsonb(abandonment.record_digest)
				ORDER BY abandonment.record_digest COLLATE "C"),'[]'::jsonb)
			INTO expected_abandonments
			FROM agent_evaluation_capability_effect_provider_journal_abandonments abandonment
			JOIN agent_evaluation_capability_effect_provider_journal_stages stage
			  ON stage.namespace_id=abandonment.namespace_id AND stage.plan_digest=abandonment.plan_digest
			 AND stage.repository_commit=abandonment.repository_commit
			 AND stage.owner_instance_id=abandonment.owner_instance_id
			 AND stage.owner_request_digest=abandonment.owner_request_digest
			WHERE stage.namespace_id=NEW.namespace_id AND stage.plan_digest=NEW.plan_digest
				AND stage.repository_commit=NEW.repository_commit
				AND stage.owner_instance_id=NEW.owner_instance_id
				AND stage.attempt_id=request_row.attempt_id
				AND abandonment.reason=request_row.reason
				AND abandonment.abandoned_at BETWEEN request_row.requested_at AND NEW.completed_at;
			IF residual_count<>0 OR unfinished_count<>0
				OR NEW.abandonment_disposition_receipt_digests<>expected_dispositions
				OR NEW.abandonment_record_digests<>expected_abandonments THEN
				RAISE EXCEPTION 'Provider journal cleanup receipt is not zero-residual'
					USING ERRCODE='23514';
			END IF;
			IF request_row.reason='attempt-terminal' AND NOT EXISTS (
				SELECT 1 FROM agent_evaluation_attempts attempt
				WHERE attempt.namespace_id=NEW.namespace_id AND attempt.plan_digest=NEW.plan_digest
					AND attempt.attempt_id=request_row.attempt_id
			) THEN
				RAISE EXCEPTION 'attempt-terminal Provider journal cleanup lacks terminal attempt ledger'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_cleanup_zero_required
			AFTER INSERT ON agent_evaluation_capability_effect_provider_journal_cleanup_receipts
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_cleanup_closure()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_optional_fact_provider_journal_link()
			RETURNS trigger AS $$
		BEGIN
			IF NEW.native_bootstrap_source_request_digest IS NOT NULL THEN
				RETURN NEW;
			END IF;
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_capability_effect_provider_journal_results result
				JOIN agent_evaluation_capability_effect_provider_journal_stages stage
				  ON stage.namespace_id=result.namespace_id AND stage.plan_digest=result.plan_digest
				 AND stage.repository_commit=result.repository_commit
				 AND stage.owner_instance_id=result.owner_instance_id
				 AND stage.owner_request_digest=result.owner_request_digest
				JOIN agent_evaluation_capability_effect_provider_journal_executions execution
				  ON execution.namespace_id=result.namespace_id
				 AND execution.plan_digest=result.plan_digest
				 AND execution.repository_commit=result.repository_commit
				 AND execution.owner_instance_id=result.owner_instance_id
				 AND execution.owner_request_digest=result.owner_request_digest
				 AND execution.record_digest=result.terminal_execution_record_digest
				WHERE result.namespace_id=NEW.namespace_id AND result.plan_digest=NEW.plan_digest
					AND result.repository_commit=NEW.repository_commit
					AND result.record_digest=NEW.provider_runtime_journal_result_record_digest
					AND result.result_seal_receipt_digest=
						NEW.provider_runtime_result_seal_receipt_digest
					AND stage.attempt_id=NEW.attempt_id AND stage.turn_index=NEW.turn_index
					AND stage.invocation_id=NEW.invocation_id
					AND stage.pre_effect_intent_digest=NEW.source_pre_effect_intent_digest
					AND stage.record_json->'preEffectIntent'=NEW.source_pre_effect_intent_json
					AND stage.owner_request_digest=NEW.source_owner_request_digest
					AND stage.runtime_fact_source_authority_digest=NEW.target_authority_digest
					AND result.business_result_digest=NEW.source_business_result_digest
					AND result.source_fact_kind IS NOT DISTINCT FROM NEW.fact_kind
					AND result.source_fact_digest IS NOT DISTINCT FROM NEW.fact_digest
					AND execution.dispatch_intent_digest=NEW.dispatch_intent_digest
					AND execution.transport_receipt_digest=NEW.transport_receipt_digest
					AND execution.spool_receipt_digest IS NOT DISTINCT FROM
						NEW.result_spool_receipt_digest
					AND execution.response_digest=NEW.response_digest
					AND execution.normalized_event_set_digest=NEW.normalized_event_set_digest
					AND execution.record_json#>>'{executionReceipt,dispatchAckDigest}'=
						NEW.source_owner_dispatch_ack_digest
					AND NEW.source_effect_receipt_json->>'providerRuntimeJournalResultRecordDigest'=
						result.record_digest
					AND NEW.source_effect_receipt_json->>'providerRuntimeResultSealReceiptDigest'=
						result.result_seal_receipt_digest
					AND NEW.source_effect_receipt_json->>'businessResultDigest'=
						result.business_result_digest
					AND NEW.source_effect_receipt_json->>'sourceFactKind' IS NOT DISTINCT FROM
						result.source_fact_kind
					AND NEW.source_effect_receipt_json->>'sourceFactDigest' IS NOT DISTINCT FROM
						result.source_fact_digest
					AND NEW.source_effect_receipt_json->>'dispatchAckDigest'=
						execution.record_json#>>'{executionReceipt,dispatchAckDigest}'
					AND NEW.source_effect_receipt_json->>'transportReceiptDigest'=
						execution.transport_receipt_digest
					AND NEW.source_effect_receipt_json->>'resultSpoolReceiptDigest' IS NOT DISTINCT FROM
						execution.spool_receipt_digest
					AND NEW.source_effect_receipt_json->>'normalizedEventSetDigest'=
						execution.normalized_event_set_digest
			) THEN
				RAISE EXCEPTION 'optional shared fact lacks exact Provider runtime journal result'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_optional_fact_sources_provider_journal_link
			BEFORE INSERT ON agent_evaluation_optional_capability_fact_sources
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_optional_fact_provider_journal_link()`,
	}
}
