package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6RecoveryReadStatements
// returns the original encrypted transport record only to the current
// reconcile-only claim owner and persists the exact bounded read authority.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6RecoveryReadStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS ae_hrrr_lifecycle_transport_recovery_reads (
			namespace_id TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			dispatch_intent_digest TEXT NOT NULL,
			dispatch_stage_claim_receipt_digest TEXT NOT NULL,
			expected_prior_transport_receipt_digest TEXT NOT NULL,
			spool_ref TEXT NOT NULL,
			lifecycle_owner_instance_id TEXT NOT NULL,
			recovery_authority_issuer_id TEXT NOT NULL,
			recovery_authority_implementation_digest TEXT NOT NULL,
			owner_ledger_revision BIGINT NOT NULL,
			requested_at TIMESTAMPTZ NOT NULL,
			minimum_receipt_expires_at TIMESTAMPTZ NOT NULL,
			read_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			receipt_digest TEXT NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,request_digest),
			UNIQUE (namespace_id,receipt_digest),
			FOREIGN KEY (namespace_id,spool_ref)
				REFERENCES ae_hrrr_lifecycle_result_spools(
					namespace_id,spool_ref
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,dispatch_intent_digest)
				REFERENCES ae_hrrr_lifecycle_dispatch_intents(
					namespace_id,intent_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,dispatch_stage_claim_receipt_digest)
				REFERENCES ae_hrrr_lifecycle_dispatch_claim_receipts(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,expected_prior_transport_receipt_digest)
				REFERENCES ae_hrrr_lifecycle_transport_receipts(
					namespace_id,receipt_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_recovery_read_check CHECK (
				request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_stage_claim_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND expected_prior_transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND recovery_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_ledger_revision>=1
				AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND minimum_receipt_expires_at>requested_at
				AND minimum_receipt_expires_at<=requested_at+INTERVAL '125 seconds'
				AND read_at>=requested_at AND expires_at>read_at
				AND expires_at<=read_at+INTERVAL '125 seconds'
				AND expires_at>=minimum_receipt_expires_at
				AND octet_length(request_bytes) BETWEEN 1 AND 65536
				AND request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
				AND octet_length(receipt_bytes) BETWEEN 1 AND 524288
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_recovery_read_exact()
			RETURNS trigger AS $$
		DECLARE
			spool_row ae_hrrr_lifecycle_result_spools%ROWTYPE;
			claim_row ae_hrrr_lifecycle_dispatch_claim_receipts%ROWTYPE;
			current_row ae_hrrr_lifecycle_dispatch_claim_current%ROWTYPE;
			current_selected_claim JSONB;
		BEGIN
			SELECT * INTO spool_row
			FROM ae_hrrr_lifecycle_result_spools
			WHERE namespace_id=NEW.namespace_id AND spool_ref=NEW.spool_ref
			FOR SHARE;
			SELECT * INTO claim_row
			FROM ae_hrrr_lifecycle_dispatch_claim_receipts
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.dispatch_stage_claim_receipt_digest
			FOR SHARE;
			SELECT * INTO current_row
			FROM ae_hrrr_lifecycle_dispatch_claim_current
			WHERE namespace_id=NEW.namespace_id
				AND intent_digest=NEW.dispatch_intent_digest
			FOR SHARE;
			SELECT element INTO current_selected_claim
			FROM jsonb_array_elements(NEW.receipt_json#>
				'{currentDispatchStageClaimHistorySet,receipts}')
				WITH ORDINALITY item(element,ordinality)
			WHERE element->>'dispatchIntentDigest'=NEW.dispatch_intent_digest
			ORDER BY ordinality DESC LIMIT 1;
			IF spool_row.spool_ref IS NULL OR claim_row.receipt_digest IS NULL
				OR current_row.current_claim_receipt_digest<>claim_row.receipt_digest
				OR spool_row.state NOT IN ('active','retained-encrypted')
				OR NEW.read_at<spool_row.transport_stored_at OR NEW.read_at>=spool_row.expires_at
				OR NEW.expires_at>spool_row.expires_at OR NEW.read_at<claim_row.claimed_at
				OR NEW.read_at>=claim_row.claim_expires_at OR NEW.expires_at>claim_row.claim_expires_at
				OR claim_row.intent_digest<>NEW.dispatch_intent_digest
				OR claim_row.lifecycle_owner_instance_id<>NEW.lifecycle_owner_instance_id
				OR claim_row.delivery_disposition<>'reconcile-only-replay'
				OR claim_row.prior_transport_receipt_digest<>
					NEW.expected_prior_transport_receipt_digest
				OR current_selected_claim<>claim_row.receipt_json
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>12
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','purpose','namespaceId','dispatchIntentDigest',
					'dispatchStageClaimReceiptDigest','expectedPriorTransportReceiptDigest',
					'spoolRef','lifecycleOwnerInstanceId','requestedAt',
					'minimumReceiptExpiresAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-recovery-read-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.transport.recovery.read'
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'dispatchIntentDigest'<>NEW.dispatch_intent_digest
				OR NEW.request_json->>'dispatchStageClaimReceiptDigest'<>
					NEW.dispatch_stage_claim_receipt_digest
				OR NEW.request_json->>'expectedPriorTransportReceiptDigest'<>
					NEW.expected_prior_transport_receipt_digest
				OR NEW.request_json->>'spoolRef'<>NEW.spool_ref
				OR NEW.request_json->>'lifecycleOwnerInstanceId'<>
					NEW.lifecycle_owner_instance_id
				OR (NEW.request_json->>'requestedAt')::timestamptz<>NEW.requested_at
				OR (NEW.request_json->>'minimumReceiptExpiresAt')::timestamptz<>
					NEW.minimum_receipt_expires_at
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>19
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','request','requestDigest','recoveryAuthorityIssuerId',
					'recoveryAuthorityImplementationDigest',
					'storedDispatchStageClaimHistorySet','currentDispatchStageClaimHistorySet',
					'dispatchIntentSet','dispatchStageClaimReceiptSet','transportReceiptSet',
					'spoolAad','spoolWriteEnvelope','spoolEnvelopeAuthority','spoolReceipt',
					'transportStoreReceipt','readAt','expiresAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-recovery-read-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR NEW.receipt_json->'request'<>NEW.request_json
				OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
				OR NEW.receipt_json->>'recoveryAuthorityIssuerId'<>
					NEW.recovery_authority_issuer_id
				OR NEW.receipt_json->>'recoveryAuthorityImplementationDigest'<>
					NEW.recovery_authority_implementation_digest
				OR NEW.receipt_json->'dispatchIntentSet'<>
					spool_row.transport_store_request_json->'dispatchIntentSet'
				OR NEW.receipt_json->'dispatchStageClaimReceiptSet'<>
					spool_row.transport_store_request_json->'dispatchStageClaimReceiptSet'
				OR NEW.receipt_json->'storedDispatchStageClaimHistorySet'<>
					spool_row.transport_store_request_json->'dispatchStageClaimHistorySet'
				OR jsonb_typeof(NEW.receipt_json->
					'currentDispatchStageClaimHistorySet')<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json->
					'currentDispatchStageClaimHistorySet')<>10
				OR NOT ((NEW.receipt_json->'currentDispatchStageClaimHistorySet') ?& ARRAY[
					'format','version','operation','registrationRequestDigest',
					'dispatchIntentSetDigest','initialClaimReceiptSet',
					'initialClaimReceiptSetDigest','receipts','receiptDigests','setDigest'
				])
				OR NEW.receipt_json#>>'{currentDispatchStageClaimHistorySet,format}'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-history-set'
				OR (NEW.receipt_json#>>'{currentDispatchStageClaimHistorySet,version}')::bigint<>1
				OR NEW.receipt_json#>>'{currentDispatchStageClaimHistorySet,initialClaimReceiptSetDigest}'<>
					NEW.receipt_json#>>'{currentDispatchStageClaimHistorySet,initialClaimReceiptSet,setDigest}'
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.receipt_json->'currentDispatchStageClaimHistorySet'-'setDigest')<>
					NEW.receipt_json#>>'{currentDispatchStageClaimHistorySet,setDigest}'
				OR NEW.receipt_json#>'{currentDispatchStageClaimHistorySet,receipts}'
					IS DISTINCT FROM (
						SELECT jsonb_agg(receipt.receipt_json ORDER BY intent_order.ordinality,
							receipt.claimed_at,receipt.receipt_digest COLLATE "C")
						FROM jsonb_array_elements_text(spool_row.transport_store_request_json#>
							'{dispatchIntentSet,intentDigests}')
							WITH ORDINALITY intent_order(intent_digest,ordinality)
						JOIN ae_hrrr_lifecycle_dispatch_claim_receipts receipt
						  ON receipt.namespace_id=NEW.namespace_id
						 AND receipt.intent_digest=intent_order.intent_digest)
				OR NEW.receipt_json#>'{currentDispatchStageClaimHistorySet,receiptDigests}'
					IS DISTINCT FROM (
						SELECT jsonb_agg(to_jsonb(receipt.receipt_digest)
							ORDER BY intent_order.ordinality,receipt.claimed_at,
								receipt.receipt_digest COLLATE "C")
						FROM jsonb_array_elements_text(spool_row.transport_store_request_json#>
							'{dispatchIntentSet,intentDigests}')
							WITH ORDINALITY intent_order(intent_digest,ordinality)
						JOIN ae_hrrr_lifecycle_dispatch_claim_receipts receipt
						  ON receipt.namespace_id=NEW.namespace_id
						 AND receipt.intent_digest=intent_order.intent_digest)
				OR NEW.receipt_json->'transportReceiptSet'<>
					spool_row.transport_store_request_json->'transportReceiptSet'
				OR NEW.receipt_json->'spoolAad'<>spool_row.aad_json
				OR NEW.receipt_json->'spoolWriteEnvelope'<>spool_row.spool_write_envelope_json
				OR NEW.receipt_json->'spoolEnvelopeAuthority'<>spool_row.envelope_json
				OR NEW.receipt_json->'spoolReceipt'<>spool_row.spool_receipt_json
				OR NEW.receipt_json->'transportStoreReceipt'<>
					spool_row.transport_store_receipt_json
				OR (NEW.receipt_json->>'readAt')::timestamptz<>NEW.read_at
				OR (NEW.receipt_json->>'expiresAt')::timestamptz<>NEW.expires_at
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest
				OR NOT agent_evaluation_hosted_runtime_lifecycle_claim_history_is_prefix(
					NEW.receipt_json->'storedDispatchStageClaimHistorySet',
					NEW.receipt_json->'currentDispatchStageClaimHistorySet') THEN
				RAISE EXCEPTION 'hosted runtime lifecycle recovery read drifted from exact authority'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_recovery_read_exact
			BEFORE INSERT
			ON ae_hrrr_lifecycle_transport_recovery_reads
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_recovery_read_exact()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_recovery_read_immutable
			BEFORE UPDATE OR DELETE
			ON ae_hrrr_lifecycle_transport_recovery_reads
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION read_agent_evaluation_hosted_runtime_lifecycle_transport_recovery(
			candidate_namespace_id TEXT,candidate_request_json JSONB,candidate_request_bytes BYTEA,
			candidate_recovery_authority_issuer_id TEXT,
			candidate_recovery_authority_implementation_digest TEXT,
			candidate_read_at TIMESTAMPTZ,candidate_expires_at TIMESTAMPTZ
		) RETURNS TABLE (
			receipt_json JSONB,receipt_bytes BYTEA,receipt_digest TEXT,
			owner_ledger_revision BIGINT
		) LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			existing ae_hrrr_lifecycle_transport_recovery_reads%ROWTYPE;
			spool_row ae_hrrr_lifecycle_result_spools%ROWTYPE;
			claim_row ae_hrrr_lifecycle_dispatch_claim_receipts%ROWTYPE;
			current_row ae_hrrr_lifecycle_dispatch_claim_current%ROWTYPE;
			request_digest_value TEXT:=candidate_request_json->>'requestDigest';
			intent_digest_value TEXT:=candidate_request_json->>'dispatchIntentDigest';
			claim_digest_value TEXT:=candidate_request_json->>'dispatchStageClaimReceiptDigest';
			prior_transport_digest_value TEXT:=
				candidate_request_json->>'expectedPriorTransportReceiptDigest';
			spool_ref_value TEXT:=candidate_request_json->>'spoolRef';
			owner_instance_value TEXT:=candidate_request_json->>'lifecycleOwnerInstanceId';
			requested_at_value TIMESTAMPTZ:=(candidate_request_json->>'requestedAt')::timestamptz;
			minimum_expires_at_value TIMESTAMPTZ:=
				(candidate_request_json->>'minimumReceiptExpiresAt')::timestamptz;
			initial_claim_set JSONB;
			stored_history_value JSONB;
			current_history_receipts JSONB;
			current_history_receipt_digests JSONB;
			current_history_base JSONB;
			current_history_value JSONB;
			current_history_digest TEXT;
			current_selected_claim JSONB;
			ledger_revision_value BIGINT;
			receipt_base JSONB;
			receipt_value JSONB;
			receipt_digest_value TEXT;
		BEGIN
			IF candidate_namespace_id IS NULL OR request_digest_value IS NULL THEN
				RAISE EXCEPTION 'hosted runtime lifecycle recovery read request is incomplete'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(
				candidate_namespace_id||chr(31)||request_digest_value,0));
			SELECT * INTO existing
			FROM ae_hrrr_lifecycle_transport_recovery_reads
			WHERE namespace_id=candidate_namespace_id AND request_digest=request_digest_value
			FOR UPDATE;
			IF existing.request_digest IS NOT NULL THEN
				IF existing.request_json<>candidate_request_json
					OR existing.request_bytes<>candidate_request_bytes THEN
					RAISE EXCEPTION 'hosted runtime lifecycle recovery read digest replay changed bytes'
						USING ERRCODE='23514';
				END IF;
				RETURN QUERY SELECT existing.receipt_json,existing.receipt_bytes,
					existing.receipt_digest,existing.owner_ledger_revision;
				RETURN;
			END IF;
			SELECT * INTO spool_row
			FROM ae_hrrr_lifecycle_result_spools
			WHERE namespace_id=candidate_namespace_id AND spool_ref=spool_ref_value
			FOR SHARE;
			SELECT * INTO claim_row
			FROM ae_hrrr_lifecycle_dispatch_claim_receipts
			WHERE namespace_id=candidate_namespace_id AND receipt_digest=claim_digest_value
			FOR SHARE;
			SELECT * INTO current_row
			FROM ae_hrrr_lifecycle_dispatch_claim_current
			WHERE namespace_id=candidate_namespace_id AND intent_digest=intent_digest_value
			FOR SHARE;
			IF jsonb_typeof(candidate_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(candidate_request_json)<>12
				OR candidate_request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-recovery-read-request'
				OR (candidate_request_json->>'version')::bigint<>1
				OR candidate_request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.transport.recovery.read'
				OR candidate_request_json->>'namespaceId'<>candidate_namespace_id
				OR request_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR agent_evaluation_canonical_jsonb_digest(
					candidate_request_json-'requestDigest')<>request_digest_value
				OR candidate_request_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(candidate_request_json),'UTF8')
				OR requested_at_value>=minimum_expires_at_value
				OR minimum_expires_at_value>requested_at_value+INTERVAL '125 seconds'
				OR candidate_read_at<requested_at_value
				OR candidate_read_at>=candidate_expires_at
				OR candidate_expires_at<minimum_expires_at_value
				OR candidate_expires_at>candidate_read_at+INTERVAL '125 seconds'
				OR candidate_recovery_authority_issuer_id !~
					'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				OR candidate_recovery_authority_implementation_digest !~
					'^sha256-[a-f0-9]{64}$'
				OR spool_row.spool_ref IS NULL OR spool_row.state NOT IN ('active','retained-encrypted')
				OR candidate_read_at<spool_row.transport_stored_at
				OR candidate_read_at>=spool_row.expires_at
				OR candidate_expires_at>spool_row.expires_at
				OR claim_row.receipt_digest IS NULL OR claim_row.intent_digest<>intent_digest_value
				OR current_row.current_claim_receipt_digest<>claim_digest_value
				OR claim_row.lifecycle_owner_instance_id<>owner_instance_value
				OR claim_row.delivery_disposition<>'reconcile-only-replay'
				OR claim_row.prior_transport_receipt_digest<>prior_transport_digest_value
				OR candidate_read_at<claim_row.claimed_at
				OR candidate_read_at>=claim_row.claim_expires_at
				OR candidate_expires_at>claim_row.claim_expires_at
				OR NOT (spool_row.transport_store_request_json#>
					'{transportReceiptSet,receiptDigests}' @> jsonb_build_array(
						prior_transport_digest_value)) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle recovery read request is invalid or stale'
					USING ERRCODE='23514';
			END IF;
			initial_claim_set:=spool_row.transport_store_request_json->
				'dispatchStageClaimReceiptSet';
			stored_history_value:=spool_row.transport_store_request_json->
				'dispatchStageClaimHistorySet';
			WITH intent_order AS (
				SELECT digest,ordinality
				FROM jsonb_array_elements_text(spool_row.transport_store_request_json#>
					'{dispatchIntentSet,intentDigests}')
					WITH ORDINALITY member(digest,ordinality)
			), history AS (
				SELECT receipt.receipt_json,receipt.receipt_digest,intent_order.ordinality,
					receipt.claimed_at
				FROM intent_order
				JOIN ae_hrrr_lifecycle_dispatch_claim_receipts receipt
				  ON receipt.namespace_id=candidate_namespace_id
				 AND receipt.intent_digest=intent_order.digest
			)
			SELECT jsonb_agg(receipt_json ORDER BY ordinality,claimed_at,
					receipt_digest COLLATE "C"),
				jsonb_agg(to_jsonb(receipt_digest) ORDER BY ordinality,claimed_at,
					receipt_digest COLLATE "C")
			INTO current_history_receipts,current_history_receipt_digests
			FROM history;
			current_history_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-history-set',
				'version',1,'operation',spool_row.operation,
				'registrationRequestDigest',spool_row.registration_request_digest,
				'dispatchIntentSetDigest',spool_row.dispatch_intent_set_digest,
				'initialClaimReceiptSet',initial_claim_set,
				'initialClaimReceiptSetDigest',initial_claim_set->>'setDigest',
				'receipts',current_history_receipts,
				'receiptDigests',current_history_receipt_digests);
			current_history_digest:=agent_evaluation_canonical_jsonb_digest(current_history_base);
			current_history_value:=current_history_base||jsonb_build_object(
				'setDigest',current_history_digest);
			SELECT element INTO current_selected_claim
			FROM jsonb_array_elements(current_history_receipts)
				WITH ORDINALITY item(element,ordinality)
			WHERE element->>'dispatchIntentDigest'=intent_digest_value
			ORDER BY ordinality DESC LIMIT 1;
			IF current_selected_claim<>claim_row.receipt_json
				OR NOT agent_evaluation_hosted_runtime_lifecycle_claim_history_is_prefix(
					stored_history_value,current_history_value) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle recovery history is not a current prefix extension'
					USING ERRCODE='23514';
			END IF;
			ledger_revision_value:=advance_agent_evaluation_hosted_runtime_lifecycle_owner_ledger(
				candidate_namespace_id,candidate_read_at);
			receipt_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-recovery-read-receipt',
				'version',1,'request',candidate_request_json,'requestDigest',request_digest_value,
				'recoveryAuthorityIssuerId',candidate_recovery_authority_issuer_id,
				'recoveryAuthorityImplementationDigest',
					candidate_recovery_authority_implementation_digest,
				'storedDispatchStageClaimHistorySet',stored_history_value,
				'currentDispatchStageClaimHistorySet',current_history_value,
				'dispatchIntentSet',spool_row.transport_store_request_json->'dispatchIntentSet',
				'dispatchStageClaimReceiptSet',initial_claim_set,
				'transportReceiptSet',spool_row.transport_store_request_json->'transportReceiptSet',
				'spoolAad',spool_row.aad_json,
				'spoolWriteEnvelope',spool_row.spool_write_envelope_json,
				'spoolEnvelopeAuthority',spool_row.envelope_json,
				'spoolReceipt',spool_row.spool_receipt_json,
				'transportStoreReceipt',spool_row.transport_store_receipt_json,
				'readAt',to_jsonb(candidate_read_at),'expiresAt',to_jsonb(candidate_expires_at));
			receipt_digest_value:=agent_evaluation_canonical_jsonb_digest(receipt_base);
			receipt_value:=receipt_base||jsonb_build_object(
				'receiptDigest',receipt_digest_value);
			INSERT INTO ae_hrrr_lifecycle_transport_recovery_reads(
				namespace_id,request_digest,request_json,request_bytes,dispatch_intent_digest,
				dispatch_stage_claim_receipt_digest,expected_prior_transport_receipt_digest,
				spool_ref,lifecycle_owner_instance_id,recovery_authority_issuer_id,
				recovery_authority_implementation_digest,owner_ledger_revision,requested_at,
				minimum_receipt_expires_at,read_at,expires_at,receipt_digest,receipt_json,
				receipt_bytes
			) VALUES (
				candidate_namespace_id,request_digest_value,candidate_request_json,
				candidate_request_bytes,intent_digest_value,claim_digest_value,
				prior_transport_digest_value,spool_ref_value,owner_instance_value,
				candidate_recovery_authority_issuer_id,
				candidate_recovery_authority_implementation_digest,ledger_revision_value,
				requested_at_value,minimum_expires_at_value,candidate_read_at,candidate_expires_at,
				receipt_digest_value,receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8')
			);
			RETURN QUERY SELECT receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8'),
				receipt_digest_value,ledger_revision_value;
		END;
		$$`,
	}
}
