package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6TransportStatements
// owns byte-exact, idempotent transport-store and final-seal acknowledgements.
// The namespace owner ledger is advanced once for each new request digest;
// an exact retry returns the originally persisted receipt bytes.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6TransportStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION advance_agent_evaluation_hosted_runtime_lifecycle_owner_ledger(
			candidate_namespace_id TEXT,candidate_observed_at TIMESTAMPTZ
		) RETURNS BIGINT LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			next_revision BIGINT;
		BEGIN
			INSERT INTO ae_hrrr_owner_ledgers(
				namespace_id,ledger_revision,updated_at
			) VALUES (candidate_namespace_id,1,candidate_observed_at)
			ON CONFLICT (namespace_id) DO UPDATE SET
				ledger_revision=
					ae_hrrr_owner_ledgers.ledger_revision+1,
				updated_at=GREATEST(
					ae_hrrr_owner_ledgers.updated_at,
					EXCLUDED.updated_at)
			RETURNING ledger_revision INTO next_revision;
			RETURN next_revision;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_jsonb_array_is_prefix(
			stored_values JSONB,current_values JSONB
		) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
			SELECT COALESCE(
				jsonb_typeof(stored_values)='array'
				AND jsonb_typeof(current_values)='array'
				AND jsonb_array_length(stored_values)<=jsonb_array_length(current_values)
				AND NOT EXISTS (
					SELECT 1
					FROM jsonb_array_elements(stored_values)
						WITH ORDINALITY stored(value,ordinality)
					WHERE (current_values->((stored.ordinality-1)::int))
						IS DISTINCT FROM stored.value),FALSE)
		$$`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_lifecycle_claim_history_is_progressive_prefix(
			stored_history JSONB,current_history JSONB
		) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
			SELECT COALESCE(
				jsonb_typeof(stored_history)='object'
				AND jsonb_typeof(current_history)='object'
				AND stored_history->>'operation'=current_history->>'operation'
				AND stored_history->>'registrationRequestDigest'=
					current_history->>'registrationRequestDigest'
				AND agent_evaluation_jsonb_array_is_prefix(
					stored_history#>'{initialClaimReceiptSet,receipts}',
					current_history#>'{initialClaimReceiptSet,receipts}')
				AND agent_evaluation_jsonb_array_is_prefix(
					stored_history#>'{initialClaimReceiptSet,receiptDigests}',
					current_history#>'{initialClaimReceiptSet,receiptDigests}')
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
					WHERE candidate_current.receipt IS DISTINCT FROM stored.receipt),FALSE)
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_transport_store_exact()
			RETURNS trigger AS $$
		DECLARE
			request_value JSONB:=NEW.transport_store_request_json;
			intent_set JSONB:=request_value->'dispatchIntentSet';
			claim_set JSONB:=request_value->'dispatchStageClaimReceiptSet';
			claim_history_set JSONB:=request_value->'dispatchStageClaimHistorySet';
			transport_set JSONB:=request_value->'transportReceiptSet';
			write_envelope JSONB:=request_value->'spoolWriteEnvelope';
			receipt_value JSONB:=NEW.transport_store_receipt_json;
			history_value JSONB:=NEW.transport_store_receipt_history_json;
			prior_store ae_hrrr_lifecycle_result_spools%ROWTYPE;
			decoded_nonce BYTEA;
			decoded_tag BYTEA;
			decoded_ciphertext BYTEA;
			expected_intents JSONB;
			expected_claims JSONB;
			expected_claim_history JSONB;
			expected_transports JSONB;
			expected_history_receipts JSONB;
			expected_history_receipt_digests JSONB;
		BEGIN
			decoded_nonce:=agent_evaluation_base64url_decode(
				write_envelope->>'nonceBase64Url');
			decoded_tag:=agent_evaluation_base64url_decode(
				write_envelope->>'authenticationTagBase64Url');
			decoded_ciphertext:=agent_evaluation_base64url_decode(
				write_envelope->>'ciphertextBase64Url');
			SELECT jsonb_agg(intent.intent_json ORDER BY member.ordinality)
			INTO expected_intents
			FROM jsonb_array_elements_text(intent_set->'intentDigests')
				WITH ORDINALITY member(digest,ordinality)
			JOIN ae_hrrr_lifecycle_dispatch_intents intent
			  ON intent.namespace_id=NEW.namespace_id AND intent.intent_digest=member.digest;
			SELECT jsonb_agg(receipt.receipt_json ORDER BY member.ordinality)
			INTO expected_claims
			FROM jsonb_array_elements_text(claim_set->'receiptDigests')
				WITH ORDINALITY member(digest,ordinality)
			JOIN ae_hrrr_lifecycle_dispatch_claim_receipts receipt
			  ON receipt.namespace_id=NEW.namespace_id AND receipt.receipt_digest=member.digest;
			WITH intent_order AS (
				SELECT digest,ordinality
				FROM jsonb_array_elements_text(intent_set->'intentDigests')
					WITH ORDINALITY member(digest,ordinality)
			)
			SELECT jsonb_agg(receipt.receipt_json ORDER BY intent_order.ordinality,
				receipt.claimed_at,receipt.receipt_digest COLLATE "C")
			INTO expected_claim_history
			FROM intent_order
			JOIN ae_hrrr_lifecycle_dispatch_claim_receipts receipt
			  ON receipt.namespace_id=NEW.namespace_id
			 AND receipt.intent_digest=intent_order.digest;
			SELECT jsonb_agg(receipt.receipt_json ORDER BY member.ordinality)
			INTO expected_transports
			FROM jsonb_array_elements_text(transport_set->'receiptDigests')
				WITH ORDINALITY member(digest,ordinality)
			JOIN ae_hrrr_lifecycle_transport_receipts receipt
			  ON receipt.namespace_id=NEW.namespace_id AND receipt.receipt_digest=member.digest;
			IF NEW.expected_prior_transport_store_receipt_digest IS NOT NULL THEN
				SELECT * INTO prior_store
				FROM ae_hrrr_lifecycle_result_spools
				WHERE namespace_id=NEW.namespace_id
					AND transport_store_receipt_digest=
						NEW.expected_prior_transport_store_receipt_digest
				FOR SHARE;
			END IF;
			expected_history_receipts:=COALESCE(
				prior_store.transport_store_receipt_history_json->'receipts','[]'::jsonb)
				||jsonb_build_array(receipt_value);
			expected_history_receipt_digests:=COALESCE(
				prior_store.transport_store_receipt_history_json->'receiptDigests','[]'::jsonb)
				||jsonb_build_array(NEW.transport_store_receipt_digest);
			IF jsonb_typeof(request_value)<>'object'
				OR agent_evaluation_jsonb_object_key_count(request_value)<>13
				OR NOT (request_value ?& ARRAY[
					'format','version','purpose','expectedPriorTransportStoreReceiptDigest',
					'dispatchIntentSet',
					'dispatchStageClaimReceiptSet','dispatchStageClaimHistorySet',
					'transportReceiptSet','spoolAad',
					'spoolWriteEnvelope','spoolEnvelopeAuthority','spoolReceipt','requestDigest'
				])
				OR request_value->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-request'
				OR (request_value->>'version')::bigint<>1
				OR request_value->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.transport'
				OR request_value->>'expectedPriorTransportStoreReceiptDigest'
					IS DISTINCT FROM NEW.expected_prior_transport_store_receipt_digest
				OR request_value->>'requestDigest'<>NEW.transport_store_request_digest
				OR agent_evaluation_canonical_jsonb_digest(request_value-'requestDigest')<>
					NEW.transport_store_request_digest
				OR NEW.transport_store_request_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(request_value),'UTF8')
				OR jsonb_typeof(intent_set)<>'object'
				OR agent_evaluation_jsonb_object_key_count(intent_set)<>8
				OR intent_set->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-intent-set'
				OR (intent_set->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(intent_set-'setDigest')<>
					intent_set->>'setDigest'
				OR intent_set->'intents' IS DISTINCT FROM expected_intents
				OR jsonb_array_length(intent_set->'intents')<1
				OR intent_set->'intentDigests' IS DISTINCT FROM
					(SELECT jsonb_agg(element->'intentDigest' ORDER BY ordinality)
					 FROM jsonb_array_elements(intent_set->'intents')
					 WITH ORDINALITY item(element,ordinality))
				OR jsonb_typeof(claim_set)<>'object'
				OR agent_evaluation_jsonb_object_key_count(claim_set)<>9
				OR claim_set->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-receipt-set'
				OR (claim_set->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(claim_set-'setDigest')<>
					claim_set->>'setDigest'
				OR claim_set->'receipts' IS DISTINCT FROM expected_claims
				OR claim_set->'receiptDigests' IS DISTINCT FROM
					(SELECT jsonb_agg(element->'receiptDigest' ORDER BY ordinality)
					 FROM jsonb_array_elements(claim_set->'receipts')
					 WITH ORDINALITY item(element,ordinality))
				OR jsonb_typeof(claim_history_set)<>'object'
				OR agent_evaluation_jsonb_object_key_count(claim_history_set)<>10
				OR claim_history_set->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-history-set'
				OR (claim_history_set->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(claim_history_set-'setDigest')<>
					claim_history_set->>'setDigest'
				OR claim_history_set->'initialClaimReceiptSet'<>claim_set
				OR claim_history_set->>'initialClaimReceiptSetDigest'<>claim_set->>'setDigest'
				OR claim_history_set->'receipts' IS DISTINCT FROM expected_claim_history
				OR claim_history_set->'receiptDigests' IS DISTINCT FROM
					(SELECT jsonb_agg(element->'receiptDigest' ORDER BY ordinality)
					 FROM jsonb_array_elements(claim_history_set->'receipts')
					 WITH ORDINALITY item(element,ordinality))
				OR jsonb_typeof(transport_set)<>'object'
				OR agent_evaluation_jsonb_object_key_count(transport_set)<>10
				OR transport_set->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-receipt-set'
				OR (transport_set->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(transport_set-'setDigest')<>
					transport_set->>'setDigest'
				OR transport_set->'receipts' IS DISTINCT FROM expected_transports
				OR transport_set->'receiptDigests' IS DISTINCT FROM
					(SELECT jsonb_agg(element->'receiptDigest' ORDER BY ordinality)
					 FROM jsonb_array_elements(transport_set->'receipts')
					 WITH ORDINALITY item(element,ordinality))
				OR intent_set->>'operation'<>NEW.operation
				OR claim_set->>'operation'<>NEW.operation
				OR claim_history_set->>'operation'<>NEW.operation
				OR transport_set->>'operation'<>NEW.operation
				OR intent_set->>'registrationRequestDigest'<>NEW.registration_request_digest
				OR claim_set->>'registrationRequestDigest'<>NEW.registration_request_digest
				OR claim_history_set->>'registrationRequestDigest'<>
					NEW.registration_request_digest
				OR transport_set->>'registrationRequestDigest'<>NEW.registration_request_digest
				OR intent_set->>'lifecycleClaimReceiptDigest' IS DISTINCT FROM
					NEW.lifecycle_claim_receipt_digest
				OR claim_set->>'lifecycleClaimReceiptDigest' IS DISTINCT FROM
					NEW.lifecycle_claim_receipt_digest
				OR transport_set->>'lifecycleClaimReceiptDigest' IS DISTINCT FROM
					NEW.lifecycle_claim_receipt_digest
				OR claim_set->>'dispatchIntentSetDigest'<>intent_set->>'setDigest'
				OR claim_history_set->>'dispatchIntentSetDigest'<>intent_set->>'setDigest'
				OR transport_set->>'dispatchIntentSetDigest'<>intent_set->>'setDigest'
				OR transport_set->>'dispatchStageClaimReceiptSetDigest'<>
					claim_set->>'setDigest'
				OR intent_set->>'setDigest'<>NEW.dispatch_intent_set_digest
				OR claim_set->>'setDigest'<>NEW.dispatch_stage_claim_receipt_set_digest
				OR claim_history_set->>'setDigest'<>
					NEW.dispatch_stage_claim_history_set_digest
				OR transport_set->>'setDigest'<>NEW.transport_receipt_set_digest
				OR request_value->'spoolAad'<>NEW.aad_json
				OR request_value->'spoolEnvelopeAuthority'<>NEW.envelope_json
				OR request_value->'spoolReceipt'<>NEW.spool_receipt_json
				OR jsonb_typeof(write_envelope)<>'object'
				OR agent_evaluation_jsonb_object_key_count(write_envelope)<>15
				OR NOT (write_envelope ?& ARRAY[
					'format','version','spoolId','algorithm','keyId','keyVersion','keyRefDigest',
					'encryptionProfileDigest','nonceBase64Url','authenticationTagBase64Url',
					'ciphertextBase64Url','ciphertextDigest','ciphertextSizeBytes','aadDigest',
					'envelopeDigest'
				])
				OR write_envelope->>'format'<>
					'prodivix.agent-evaluation-provider-result-spool-envelope'
				OR (write_envelope->>'version')::bigint<>1
				OR write_envelope->>'spoolId'<>NEW.spool_ref
				OR write_envelope->>'algorithm'<>NEW.algorithm
				OR write_envelope->>'keyId'<>NEW.key_id
				OR (write_envelope->>'keyVersion')::bigint<>NEW.key_version
				OR write_envelope->>'keyRefDigest'<>NEW.key_ref_digest
				OR write_envelope->>'encryptionProfileDigest'<>NEW.encryption_profile_digest
				OR write_envelope->>'nonceBase64Url'<>
					NEW.envelope_json->>'nonceBase64Url'
				OR write_envelope->>'authenticationTagBase64Url'<>
					NEW.envelope_json->>'authenticationTagBase64Url'
				OR write_envelope->>'ciphertextDigest'<>NEW.ciphertext_digest
				OR (write_envelope->>'ciphertextSizeBytes')::bigint<>
					NEW.ciphertext_byte_length
				OR write_envelope->>'aadDigest'<>NEW.aad_digest
				OR write_envelope->>'envelopeDigest'<>NEW.envelope_digest
				OR agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
					'algorithm',NEW.algorithm,'keyId',NEW.key_id,'keyVersion',NEW.key_version,
					'keyRefDigest',NEW.key_ref_digest,
					'encryptionProfileDigest',NEW.encryption_profile_digest,
					'nonceBase64Url',write_envelope->>'nonceBase64Url',
					'authenticationTagBase64Url',write_envelope->>'authenticationTagBase64Url',
					'ciphertextDigest',NEW.ciphertext_digest,
					'ciphertextSizeBytes',NEW.ciphertext_byte_length,
					'aadDigest',NEW.aad_digest
				))<>NEW.envelope_digest
				OR decoded_nonce IS NULL OR decoded_nonce<>NEW.nonce_bytes
				OR decoded_tag IS NULL OR decoded_tag<>NEW.authentication_tag_bytes
				OR decoded_ciphertext IS NULL OR decoded_ciphertext<>NEW.ciphertext_bytes
				OR NEW.spool_write_envelope_json<>write_envelope
				OR NEW.spool_write_envelope_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(write_envelope),'UTF8')
				OR jsonb_typeof(receipt_value)<>'object'
				OR agent_evaluation_jsonb_object_key_count(receipt_value)<>20
				OR NOT (receipt_value ?& ARRAY[
					'format','version','requestDigest','operation','registrationRequestDigest',
					'expectedPriorTransportStoreReceiptDigest','transportAuthorityIssuerId',
					'transportAuthorityImplementationDigest','transportLedgerRevision',
					'dispatchIntentSetDigest','dispatchStageClaimReceiptSetDigest',
					'dispatchStageClaimHistorySetDigest','transportReceiptSetDigest',
					'spoolAadDigest','spoolEnvelopeDigest',
					'spoolReceiptDigest','supersededSpoolReceiptDigest',
					'supersededSpoolDestroyedAt','storedAt','receiptDigest'
				])
				OR receipt_value->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt'
				OR (receipt_value->>'version')::bigint<>1
				OR receipt_value->>'requestDigest'<>NEW.transport_store_request_digest
				OR receipt_value->>'operation'<>NEW.operation
				OR receipt_value->>'registrationRequestDigest'<>
					NEW.registration_request_digest
				OR receipt_value->>'expectedPriorTransportStoreReceiptDigest'
					IS DISTINCT FROM NEW.expected_prior_transport_store_receipt_digest
				OR receipt_value->>'transportAuthorityIssuerId'<>
					NEW.transport_authority_issuer_id
				OR receipt_value->>'transportAuthorityImplementationDigest'<>
					NEW.transport_authority_implementation_digest
				OR (receipt_value->>'transportLedgerRevision')::bigint<>
					NEW.transport_ledger_revision
				OR receipt_value->>'dispatchIntentSetDigest'<>NEW.dispatch_intent_set_digest
				OR receipt_value->>'dispatchStageClaimReceiptSetDigest'<>
					NEW.dispatch_stage_claim_receipt_set_digest
				OR receipt_value->>'dispatchStageClaimHistorySetDigest'<>
					NEW.dispatch_stage_claim_history_set_digest
				OR receipt_value->>'transportReceiptSetDigest'<>NEW.transport_receipt_set_digest
				OR receipt_value->>'spoolAadDigest'<>NEW.aad_digest
				OR receipt_value->>'spoolEnvelopeDigest'<>NEW.envelope_digest
				OR receipt_value->>'spoolReceiptDigest'<>NEW.spool_receipt_digest
				OR receipt_value->>'supersededSpoolReceiptDigest'
					IS DISTINCT FROM NEW.superseded_spool_receipt_digest
				OR (receipt_value->>'supersededSpoolDestroyedAt')::timestamptz
					IS DISTINCT FROM NEW.superseded_spool_destroyed_at
				OR (receipt_value->>'storedAt')::timestamptz<>NEW.transport_stored_at
				OR receipt_value->>'receiptDigest'<>NEW.transport_store_receipt_digest
				OR agent_evaluation_canonical_jsonb_digest(receipt_value-'receiptDigest')<>
					NEW.transport_store_receipt_digest
				OR NEW.transport_store_receipt_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8')
				OR (NEW.expected_prior_transport_store_receipt_digest IS NOT NULL
					AND prior_store.spool_ref IS NULL)
				OR jsonb_typeof(history_value)<>'object'
				OR agent_evaluation_jsonb_object_key_count(history_value)<>7
				OR NOT (history_value ?& ARRAY[
					'format','version','operation','registrationRequestDigest','receipts',
					'receiptDigests','historyDigest'
				])
				OR history_value->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt-history'
				OR (history_value->>'version')::bigint<>1
				OR history_value->>'operation'<>NEW.operation
				OR history_value->>'registrationRequestDigest'<>
					NEW.registration_request_digest
				OR history_value->'receipts' IS DISTINCT FROM expected_history_receipts
				OR history_value->'receiptDigests' IS DISTINCT FROM
					expected_history_receipt_digests
				OR jsonb_array_length(history_value->'receipts') NOT BETWEEN 1 AND 4
				OR history_value->>'historyDigest'<>
					NEW.transport_store_receipt_history_digest
				OR agent_evaluation_canonical_jsonb_digest(history_value-'historyDigest')<>
					NEW.transport_store_receipt_history_digest
				OR NEW.transport_store_receipt_history_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(history_value),'UTF8') THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport store drifted from exact wire'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_transport_store_exact
			BEFORE INSERT
			ON ae_hrrr_lifecycle_result_spools
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_transport_store_exact()`,
		`CREATE OR REPLACE FUNCTION store_agent_evaluation_hosted_runtime_lifecycle_transport(
			candidate_namespace_id TEXT,candidate_request_json JSONB,candidate_request_bytes BYTEA,
			candidate_transport_authority_issuer_id TEXT,
			candidate_transport_authority_implementation_digest TEXT,
			candidate_stored_at TIMESTAMPTZ
		) RETURNS TABLE (
			receipt_json JSONB,receipt_bytes BYTEA,receipt_digest TEXT,
			receipt_history_json JSONB,receipt_history_bytes BYTEA,
			receipt_history_digest TEXT,
			transport_ledger_revision BIGINT
		) LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			existing ae_hrrr_lifecycle_result_spools%ROWTYPE;
			prior_store ae_hrrr_lifecycle_result_spools%ROWTYPE;
			aad JSONB:=candidate_request_json->'spoolAad';
			write_envelope JSONB:=candidate_request_json->'spoolWriteEnvelope';
			envelope JSONB:=candidate_request_json->'spoolEnvelopeAuthority';
			spool_receipt JSONB:=candidate_request_json->'spoolReceipt';
			intent_set JSONB:=candidate_request_json->'dispatchIntentSet';
			claim_set JSONB:=candidate_request_json->'dispatchStageClaimReceiptSet';
			claim_history_set JSONB:=candidate_request_json->'dispatchStageClaimHistorySet';
			transport_set JSONB:=candidate_request_json->'transportReceiptSet';
			request_digest_value TEXT:=candidate_request_json->>'requestDigest';
			expected_prior_receipt_digest_value TEXT:=
				candidate_request_json->>'expectedPriorTransportStoreReceiptDigest';
			ledger_revision_value BIGINT;
			receipt_base JSONB;
			receipt_value JSONB;
			receipt_digest_value TEXT;
			history_base JSONB;
			history_value JSONB;
			history_digest_value TEXT;
			supersession_base JSONB;
			supersession_value JSONB;
			supersession_digest_value TEXT;
			updated_count BIGINT;
			ciphertext BYTEA;
			nonce BYTEA;
			authentication_tag BYTEA;
		BEGIN
			IF candidate_namespace_id IS NULL OR request_digest_value IS NULL THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport store request is incomplete'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(
				candidate_namespace_id||chr(31)||request_digest_value,0));
			SELECT * INTO existing
			FROM ae_hrrr_lifecycle_result_spools
			WHERE namespace_id=candidate_namespace_id
				AND transport_store_request_digest=request_digest_value
			FOR UPDATE;
			IF existing.spool_ref IS NOT NULL THEN
				IF existing.transport_store_request_json<>candidate_request_json
					OR existing.transport_store_request_bytes<>candidate_request_bytes THEN
					RAISE EXCEPTION 'hosted runtime lifecycle transport request digest replay changed bytes'
						USING ERRCODE='23514';
				END IF;
				RETURN QUERY SELECT existing.transport_store_receipt_json,
					existing.transport_store_receipt_bytes,
					existing.transport_store_receipt_digest,
					existing.transport_store_receipt_history_json,
					existing.transport_store_receipt_history_bytes,
					existing.transport_store_receipt_history_digest,
					existing.transport_ledger_revision;
				RETURN;
			END IF;
			ciphertext:=agent_evaluation_base64url_decode(write_envelope->>'ciphertextBase64Url');
			nonce:=agent_evaluation_base64url_decode(write_envelope->>'nonceBase64Url');
			authentication_tag:=agent_evaluation_base64url_decode(
				write_envelope->>'authenticationTagBase64Url');
			IF jsonb_typeof(candidate_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(candidate_request_json)<>13
				OR candidate_request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-request'
				OR (candidate_request_json->>'version')::bigint<>1
				OR candidate_request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.transport'
				OR (expected_prior_receipt_digest_value IS NOT NULL
					AND expected_prior_receipt_digest_value !~ '^sha256-[a-f0-9]{64}$')
				OR aad->>'namespaceId'<>candidate_namespace_id
				OR request_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR agent_evaluation_canonical_jsonb_digest(
					candidate_request_json-'requestDigest')<>request_digest_value
				OR candidate_request_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(candidate_request_json),'UTF8')
				OR candidate_transport_authority_issuer_id !~
					'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				OR candidate_transport_authority_implementation_digest !~
					'^sha256-[a-f0-9]{64}$'
				OR ciphertext IS NULL OR nonce IS NULL OR authentication_tag IS NULL
				OR octet_length(ciphertext) NOT BETWEEN 1 AND 262144
				OR octet_length(nonce)<>12 OR octet_length(authentication_tag)<>16
				OR candidate_stored_at<(spool_receipt->>'createdAt')::timestamptz
				OR candidate_stored_at>=(spool_receipt->>'expiresAt')::timestamptz THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport store request is invalid'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(candidate_namespace_id||chr(31)||
				aad->>'registrationRequestDigest'||chr(31)||aad->>'operation'||chr(31)||
				'lifecycle-transport-prefix',0));
			SELECT * INTO prior_store
			FROM ae_hrrr_lifecycle_result_spools
			WHERE namespace_id=candidate_namespace_id
				AND registration_request_digest=aad->>'registrationRequestDigest'
				AND operation=aad->>'operation'
			ORDER BY transport_stored_at DESC,transport_ledger_revision DESC,
				transport_store_request_digest COLLATE "C" DESC
			LIMIT 1 FOR UPDATE;
			IF (prior_store.spool_ref IS NULL
				AND expected_prior_receipt_digest_value IS NOT NULL)
				OR (prior_store.spool_ref IS NOT NULL
					AND expected_prior_receipt_digest_value IS DISTINCT FROM
						prior_store.transport_store_receipt_digest) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport store lost prior receipt CAS'
					USING ERRCODE='40001';
			END IF;
			IF prior_store.spool_ref IS NOT NULL AND (
				prior_store.state NOT IN ('active','retained-encrypted')
				OR candidate_stored_at<prior_store.transport_stored_at
				OR candidate_stored_at>=prior_store.expires_at
				OR prior_store.plan_digest<>aad->>'planDigest'
				OR prior_store.repository_commit<>aad->>'repositoryCommit'
				OR prior_store.runtime_resource_set_id<>aad->>'runtimeResourceSetId'
				OR prior_store.frozen_run_digest<>aad->>'frozenRunDigest'
				OR prior_store.run_config_artifact_binding_digest<>
					aad->>'runConfigArtifactBindingDigest'
				OR prior_store.authority_digest IS DISTINCT FROM aad->>'authorityDigest'
				OR prior_store.lifecycle_claim_receipt_digest IS DISTINCT FROM
					aad->>'lifecycleClaimReceiptDigest'
				OR NOT agent_evaluation_jsonb_array_is_prefix(
					prior_store.transport_store_request_json#>'{dispatchIntentSet,intents}',
					intent_set->'intents')
				OR NOT agent_evaluation_jsonb_array_is_prefix(
					prior_store.transport_store_request_json#>'{dispatchIntentSet,intentDigests}',
					intent_set->'intentDigests')
				OR NOT agent_evaluation_jsonb_array_is_prefix(
					prior_store.transport_store_request_json#>
						'{dispatchStageClaimReceiptSet,receipts}',claim_set->'receipts')
				OR NOT agent_evaluation_jsonb_array_is_prefix(
					prior_store.transport_store_request_json#>
						'{dispatchStageClaimReceiptSet,receiptDigests}',claim_set->'receiptDigests')
				OR NOT agent_evaluation_hosted_runtime_lifecycle_claim_history_is_progressive_prefix(
					prior_store.transport_store_request_json->'dispatchStageClaimHistorySet',
					claim_history_set)
				OR NOT agent_evaluation_jsonb_array_is_prefix(
					prior_store.transport_store_request_json#>'{transportReceiptSet,receipts}',
					transport_set->'receipts')
				OR NOT agent_evaluation_jsonb_array_is_prefix(
					prior_store.transport_store_request_json#>'{transportReceiptSet,receiptDigests}',
					transport_set->'receiptDigests')
				OR jsonb_array_length(transport_set->'receipts')<=jsonb_array_length(
					prior_store.transport_store_request_json#>'{transportReceiptSet,receipts}')
			) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport store is not a current prefix extension'
					USING ERRCODE='40001';
			END IF;
			ledger_revision_value:=COALESCE(prior_store.transport_ledger_revision+1,1);
			PERFORM advance_agent_evaluation_hosted_runtime_lifecycle_owner_ledger(
				candidate_namespace_id,candidate_stored_at);
			receipt_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt',
				'version',1,'requestDigest',request_digest_value,
				'operation',aad->>'operation',
				'registrationRequestDigest',aad->>'registrationRequestDigest',
				'expectedPriorTransportStoreReceiptDigest',
					to_jsonb(expected_prior_receipt_digest_value),
				'transportAuthorityIssuerId',candidate_transport_authority_issuer_id,
				'transportAuthorityImplementationDigest',
					candidate_transport_authority_implementation_digest,
				'transportLedgerRevision',ledger_revision_value,
				'dispatchIntentSetDigest',intent_set->>'setDigest',
				'dispatchStageClaimReceiptSetDigest',claim_set->>'setDigest',
				'dispatchStageClaimHistorySetDigest',claim_history_set->>'setDigest',
				'transportReceiptSetDigest',transport_set->>'setDigest',
				'spoolAadDigest',envelope->>'aadDigest',
				'spoolEnvelopeDigest',envelope->>'envelopeDigest',
				'spoolReceiptDigest',spool_receipt->>'receiptDigest',
				'supersededSpoolReceiptDigest',CASE WHEN prior_store.spool_ref IS NULL
					THEN 'null'::jsonb ELSE to_jsonb(prior_store.spool_receipt_digest) END,
				'supersededSpoolDestroyedAt',CASE WHEN prior_store.spool_ref IS NULL
					THEN 'null'::jsonb ELSE to_jsonb(candidate_stored_at) END,
				'storedAt',to_jsonb(candidate_stored_at));
			receipt_digest_value:=agent_evaluation_canonical_jsonb_digest(receipt_base);
			receipt_value:=receipt_base||jsonb_build_object(
				'receiptDigest',receipt_digest_value);
			history_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt-history',
				'version',1,'operation',aad->>'operation',
				'registrationRequestDigest',aad->>'registrationRequestDigest',
				'receipts',COALESCE(
					prior_store.transport_store_receipt_history_json->'receipts','[]'::jsonb)
					||jsonb_build_array(receipt_value),
				'receiptDigests',COALESCE(
					prior_store.transport_store_receipt_history_json->'receiptDigests','[]'::jsonb)
					||jsonb_build_array(receipt_digest_value));
			history_digest_value:=agent_evaluation_canonical_jsonb_digest(history_base);
			history_value:=history_base||jsonb_build_object(
				'historyDigest',history_digest_value);
			IF jsonb_array_length(history_value->'receipts')>4
				OR octet_length(convert_to(
					agent_evaluation_canonical_jsonb_text(history_value),'UTF8'))>32768 THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport store history exceeds bound'
					USING ERRCODE='23514';
			END IF;
			IF prior_store.spool_ref IS NOT NULL THEN
				supersession_base:=jsonb_build_object(
					'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-result-spool-disposition-receipt',
					'version',1,'spoolRef',prior_store.spool_ref,
					'spoolReceiptDigest',prior_store.spool_receipt_digest,
					'operation',prior_store.operation,
					'registrationRequestDigest',prior_store.registration_request_digest,
					'authorityDigest',to_jsonb(prior_store.authority_digest),
					'lifecycleClaimReceiptDigest',
						to_jsonb(prior_store.lifecycle_claim_receipt_digest),
					'disposition','destroyed-after-prefix-supersession',
					'businessSealKind','transport-prefix-superseded',
					'businessSealReceiptDigest',receipt_digest_value,
					'encryptionState','destroyed','envelopeDigest',prior_store.envelope_digest,
					'ciphertextDigest',prior_store.ciphertext_digest,
					'retentionPolicyDigest',prior_store.retention_policy_digest,
					'createdAt',to_jsonb(prior_store.spooled_at),
					'retainedUntil',to_jsonb(prior_store.expires_at),
					'disposedAt',to_jsonb(candidate_stored_at));
				supersession_digest_value:=agent_evaluation_canonical_jsonb_digest(
					supersession_base);
				supersession_value:=supersession_base||jsonb_build_object(
					'receiptDigest',supersession_digest_value);
				UPDATE ae_hrrr_lifecycle_result_spools
				SET state='destroyed',disposition='destroyed-after-prefix-supersession',
					business_seal_kind='transport-prefix-superseded',
					business_seal_receipt_digest=receipt_digest_value,
					cleared_at=candidate_stored_at,expiry_cleared_at=NULL,
					disposition_receipt_digest=supersession_digest_value,
					disposition_receipt_json=supersession_value,
					disposition_receipt_bytes=convert_to(
						agent_evaluation_canonical_jsonb_text(supersession_value),'UTF8'),
					ciphertext_bytes=''::bytea,ciphertext_byte_length=0,
					nonce_bytes=''::bytea,authentication_tag_bytes=''::bytea
				WHERE namespace_id=candidate_namespace_id
					AND spool_ref=prior_store.spool_ref
					AND state=prior_store.state;
				GET DIAGNOSTICS updated_count=ROW_COUNT;
				IF updated_count<>1 THEN
					RAISE EXCEPTION 'hosted runtime lifecycle transport prefix lost current CAS'
						USING ERRCODE='40001';
				END IF;
			END IF;
			INSERT INTO ae_hrrr_lifecycle_result_spools(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
				registration_request_digest,authority_digest,lifecycle_claim_receipt_digest,
				frozen_run_digest,run_config_artifact_binding_digest,lifecycle_expires_at,
				resource_id,resource_role,spool_ref,operation,dispatch_intent_set_digest,
				dispatch_stage_claim_receipt_set_digest,
				dispatch_stage_claim_history_set_digest,transport_receipt_set_digest,
				business_result_digest,plaintext_digest,envelope_digest,envelope_json,envelope_bytes,
				spool_write_envelope_json,spool_write_envelope_bytes,aad_digest,aad_json,aad_bytes,
				algorithm,key_id,key_version,key_ref_digest,encryption_profile_digest,
				ciphertext_digest,ciphertext_bytes,ciphertext_byte_length,nonce_bytes,
				authentication_tag_bytes,spool_receipt_digest,spool_receipt_json,spool_receipt_bytes,
				transport_store_request_digest,transport_store_request_json,
				transport_store_request_bytes,expected_prior_transport_store_receipt_digest,
				transport_store_receipt_digest,
				transport_store_receipt_json,transport_store_receipt_bytes,
				transport_store_receipt_history_digest,transport_store_receipt_history_json,
				transport_store_receipt_history_bytes,
				superseded_spool_receipt_digest,superseded_spool_destroyed_at,
				transport_authority_issuer_id,transport_authority_implementation_digest,
				transport_ledger_revision,transport_stored_at,state,retention_policy_digest,
				spooled_at,expires_at,v46_eligible
			) VALUES (
				candidate_namespace_id,aad->>'planDigest',aad->>'repositoryCommit',
				aad->>'runtimeResourceSetId',aad->>'registrationRequestDigest',
				aad->>'authorityDigest',aad->>'lifecycleClaimReceiptDigest',
				aad->>'frozenRunDigest',aad->>'runConfigArtifactBindingDigest',
				(aad->>'lifecycleExpiresAt')::timestamptz,aad->>'resourceId',aad->>'resourceRole',
				envelope->>'spoolRef',aad->>'operation',intent_set->>'setDigest',
				claim_set->>'setDigest',claim_history_set->>'setDigest',transport_set->>'setDigest',
				aad->>'businessResultDigest',aad->>'plaintextDigest',
				envelope->>'envelopeDigest',envelope,
				convert_to(agent_evaluation_canonical_jsonb_text(envelope),'UTF8'),
				write_envelope,convert_to(
					agent_evaluation_canonical_jsonb_text(write_envelope),'UTF8'),
				envelope->>'aadDigest',aad,
				convert_to(agent_evaluation_canonical_jsonb_text(aad),'UTF8'),
				envelope->>'algorithm',envelope->>'keyId',(envelope->>'keyVersion')::bigint,
				envelope->>'keyRefDigest',envelope->>'encryptionProfileDigest',
				envelope->>'ciphertextDigest',ciphertext,octet_length(ciphertext),nonce,
				authentication_tag,spool_receipt->>'receiptDigest',spool_receipt,
				convert_to(agent_evaluation_canonical_jsonb_text(spool_receipt),'UTF8'),
				request_digest_value,candidate_request_json,candidate_request_bytes,
				expected_prior_receipt_digest_value,
				receipt_digest_value,receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8'),
				history_digest_value,history_value,
				convert_to(agent_evaluation_canonical_jsonb_text(history_value),'UTF8'),
				CASE WHEN prior_store.spool_ref IS NULL THEN NULL
					ELSE prior_store.spool_receipt_digest END,
				CASE WHEN prior_store.spool_ref IS NULL THEN NULL
					ELSE candidate_stored_at END,
				candidate_transport_authority_issuer_id,
				candidate_transport_authority_implementation_digest,ledger_revision_value,
				candidate_stored_at,'active',spool_receipt->>'retentionPolicyDigest',
				(spool_receipt->>'createdAt')::timestamptz,
				(spool_receipt->>'expiresAt')::timestamptz,TRUE
			);
			RETURN QUERY SELECT receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8'),
				receipt_digest_value,history_value,
				convert_to(agent_evaluation_canonical_jsonb_text(history_value),'UTF8'),
				history_digest_value,ledger_revision_value;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_lifecycle_transport_store_receipt_history(
			candidate_namespace_id TEXT,candidate_registration_request_digest TEXT,
			candidate_operation TEXT
		) RETURNS JSONB LANGUAGE plpgsql STABLE PARALLEL RESTRICTED AS $$
		DECLARE
			receipt_count BIGINT;
			chain_exact BOOLEAN;
			receipts JSONB;
			receipt_digests JSONB;
			history_base JSONB;
			history_value JSONB;
		BEGIN
			WITH ordered AS (
				SELECT spool.*,
					row_number() OVER (ORDER BY transport_ledger_revision,
						transport_store_receipt_digest COLLATE "C") AS chain_index,
					lag(transport_store_receipt_digest) OVER (ORDER BY transport_ledger_revision,
						transport_store_receipt_digest COLLATE "C") AS prior_receipt_digest,
					lag(spool_receipt_digest) OVER (ORDER BY transport_ledger_revision,
						transport_store_receipt_digest COLLATE "C") AS prior_spool_receipt_digest
				FROM ae_hrrr_lifecycle_result_spools spool
				WHERE namespace_id=candidate_namespace_id
					AND registration_request_digest=candidate_registration_request_digest
					AND operation=candidate_operation
			)
			SELECT COUNT(*),COALESCE(bool_and(
				transport_ledger_revision=chain_index
				AND expected_prior_transport_store_receipt_digest IS NOT DISTINCT FROM
					prior_receipt_digest
				AND superseded_spool_receipt_digest IS NOT DISTINCT FROM
					prior_spool_receipt_digest
				AND ((chain_index=1 AND superseded_spool_destroyed_at IS NULL)
					OR (chain_index>1 AND superseded_spool_destroyed_at IS NOT NULL))
			),FALSE),
			jsonb_agg(receipt_json ORDER BY chain_index),
			jsonb_agg(to_jsonb(transport_store_receipt_digest) ORDER BY chain_index)
			INTO receipt_count,chain_exact,receipts,receipt_digests
			FROM ordered;
			IF receipt_count NOT BETWEEN 1 AND 4 OR NOT chain_exact THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport store history is incomplete'
					USING ERRCODE='23514';
			END IF;
			history_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt-history',
				'version',1,'operation',candidate_operation,
				'registrationRequestDigest',candidate_registration_request_digest,
				'receipts',receipts,'receiptDigests',receipt_digests);
			history_value:=history_base||jsonb_build_object(
				'historyDigest',agent_evaluation_canonical_jsonb_digest(history_base));
			IF octet_length(convert_to(
				agent_evaluation_canonical_jsonb_text(history_value),'UTF8'))>32768 THEN
				RAISE EXCEPTION 'hosted runtime lifecycle transport store history exceeds bound'
					USING ERRCODE='23514';
			END IF;
			RETURN history_value;
		END;
		$$`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_lifecycle_seal_receipts (
			namespace_id TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			seal_authority_issuer_id TEXT NOT NULL,
			seal_authority_implementation_digest TEXT NOT NULL,
			seal_ledger_revision BIGINT NOT NULL,
			journal_record_digest TEXT NOT NULL,
			spool_disposition_receipt_digest TEXT NOT NULL,
			archive_record_digest TEXT NOT NULL,
			sealed_at TIMESTAMPTZ NOT NULL,
			receipt_digest TEXT NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,request_digest),
			UNIQUE (namespace_id,receipt_digest),
			UNIQUE (namespace_id,journal_record_digest),
			FOREIGN KEY (namespace_id,journal_record_digest)
				REFERENCES ae_hrrr_lifecycle_transport_journals(
					namespace_id,record_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,archive_record_digest)
				REFERENCES ae_hrrr_lifecycle_journal_archives(
					namespace_id,archive_record_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_seal_receipt_check CHECK (
				request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND seal_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND seal_ledger_revision>=1
				AND journal_record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND spool_disposition_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND archive_record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND octet_length(request_bytes) BETWEEN 1 AND 524288
				AND request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
				AND octet_length(receipt_bytes) BETWEEN 1 AND 65536
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_seal_receipt_exact()
			RETURNS trigger AS $$
		DECLARE
			journal_row ae_hrrr_lifecycle_transport_journals%ROWTYPE;
			archive_row ae_hrrr_lifecycle_journal_archives%ROWTYPE;
			spool_row ae_hrrr_lifecycle_result_spools%ROWTYPE;
		BEGIN
			SELECT * INTO journal_row
			FROM ae_hrrr_lifecycle_transport_journals
			WHERE namespace_id=NEW.namespace_id AND record_digest=NEW.journal_record_digest
			FOR SHARE;
			SELECT * INTO archive_row
			FROM ae_hrrr_lifecycle_journal_archives
			WHERE namespace_id=NEW.namespace_id AND archive_record_digest=NEW.archive_record_digest
			FOR SHARE;
			SELECT * INTO spool_row
			FROM ae_hrrr_lifecycle_result_spools
			WHERE namespace_id=NEW.namespace_id
				AND disposition_receipt_digest=NEW.spool_disposition_receipt_digest
			FOR SHARE;
			IF journal_row.record_digest IS NULL OR archive_row.archive_record_digest IS NULL
				OR spool_row.spool_ref IS NULL OR spool_row.state<>'destroyed'
				OR archive_row.journal_record_digest<>journal_row.record_digest
				OR journal_row.result_spool_ref<>spool_row.spool_ref
				OR NEW.sealed_at<archive_row.created_at
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>6
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','purpose','journalRecord','spoolDispositionReceipt',
					'requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.seal'
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR NEW.request_json->'journalRecord'<>journal_row.record_json
				OR NEW.request_json->'spoolDispositionReceipt'<>spool_row.disposition_receipt_json
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>11
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','requestDigest','sealAuthorityIssuerId',
					'sealAuthorityImplementationDigest','sealLedgerRevision','journalRecordDigest',
					'spoolDispositionReceiptDigest','archiveRecordDigest','sealedAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
				OR NEW.receipt_json->>'sealAuthorityIssuerId'<>NEW.seal_authority_issuer_id
				OR NEW.receipt_json->>'sealAuthorityImplementationDigest'<>
					NEW.seal_authority_implementation_digest
				OR (NEW.receipt_json->>'sealLedgerRevision')::bigint<>NEW.seal_ledger_revision
				OR NEW.receipt_json->>'journalRecordDigest'<>NEW.journal_record_digest
				OR NEW.receipt_json->>'spoolDispositionReceiptDigest'<>
					NEW.spool_disposition_receipt_digest
				OR NEW.receipt_json->>'archiveRecordDigest'<>NEW.archive_record_digest
				OR (NEW.receipt_json->>'sealedAt')::timestamptz<>NEW.sealed_at
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest THEN
				RAISE EXCEPTION 'hosted runtime lifecycle seal receipt drifted from exact wire'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_seal_receipt_exact
			BEFORE INSERT
			ON ae_hrrr_lifecycle_seal_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_seal_receipt_exact()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_seal_receipt_immutable
			BEFORE UPDATE OR DELETE
			ON ae_hrrr_lifecycle_seal_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION acknowledge_agent_evaluation_hosted_runtime_lifecycle_seal(
			candidate_namespace_id TEXT,candidate_request_json JSONB,candidate_request_bytes BYTEA,
			candidate_archive_record_digest TEXT,candidate_seal_authority_issuer_id TEXT,
			candidate_seal_authority_implementation_digest TEXT,candidate_sealed_at TIMESTAMPTZ
		) RETURNS TABLE (
			receipt_json JSONB,receipt_bytes BYTEA,receipt_digest TEXT,
			archive_record_digest TEXT,seal_ledger_revision BIGINT
		) LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			existing ae_hrrr_lifecycle_seal_receipts%ROWTYPE;
			request_digest_value TEXT:=candidate_request_json->>'requestDigest';
			journal_digest_value TEXT:=candidate_request_json#>>'{journalRecord,recordDigest}';
			disposition_digest_value TEXT:=
				candidate_request_json#>>'{spoolDispositionReceipt,receiptDigest}';
			ledger_revision_value BIGINT;
			receipt_base JSONB;
			receipt_value JSONB;
			receipt_digest_value TEXT;
		BEGIN
			IF candidate_namespace_id IS NULL OR request_digest_value IS NULL THEN
				RAISE EXCEPTION 'hosted runtime lifecycle seal request is incomplete'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(
				candidate_namespace_id||chr(31)||request_digest_value,0));
			SELECT * INTO existing
			FROM ae_hrrr_lifecycle_seal_receipts
			WHERE namespace_id=candidate_namespace_id AND request_digest=request_digest_value
			FOR UPDATE;
			IF existing.request_digest IS NOT NULL THEN
				IF existing.request_json<>candidate_request_json
					OR existing.request_bytes<>candidate_request_bytes
					OR existing.archive_record_digest<>candidate_archive_record_digest THEN
					RAISE EXCEPTION 'hosted runtime lifecycle seal request digest replay changed bytes'
						USING ERRCODE='23514';
				END IF;
				RETURN QUERY SELECT existing.receipt_json,existing.receipt_bytes,
					existing.receipt_digest,existing.archive_record_digest,
					existing.seal_ledger_revision;
				RETURN;
			END IF;
			IF jsonb_typeof(candidate_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(candidate_request_json)<>6
				OR candidate_request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-request'
				OR (candidate_request_json->>'version')::bigint<>1
				OR candidate_request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.seal'
				OR request_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR journal_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR disposition_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR candidate_archive_record_digest !~ '^sha256-[a-f0-9]{64}$'
				OR agent_evaluation_canonical_jsonb_digest(
					candidate_request_json-'requestDigest')<>request_digest_value
				OR candidate_request_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(candidate_request_json),'UTF8')
				OR candidate_seal_authority_issuer_id !~
					'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				OR candidate_seal_authority_implementation_digest !~
					'^sha256-[a-f0-9]{64}$' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle seal request is invalid'
					USING ERRCODE='23514';
			END IF;
			ledger_revision_value:=advance_agent_evaluation_hosted_runtime_lifecycle_owner_ledger(
				candidate_namespace_id,candidate_sealed_at);
			receipt_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-receipt',
				'version',1,'requestDigest',request_digest_value,
				'sealAuthorityIssuerId',candidate_seal_authority_issuer_id,
				'sealAuthorityImplementationDigest',
					candidate_seal_authority_implementation_digest,
				'sealLedgerRevision',ledger_revision_value,
				'journalRecordDigest',journal_digest_value,
				'spoolDispositionReceiptDigest',disposition_digest_value,
				'archiveRecordDigest',candidate_archive_record_digest,
				'sealedAt',to_jsonb(candidate_sealed_at));
			receipt_digest_value:=agent_evaluation_canonical_jsonb_digest(receipt_base);
			receipt_value:=receipt_base||jsonb_build_object(
				'receiptDigest',receipt_digest_value);
			INSERT INTO ae_hrrr_lifecycle_seal_receipts(
				namespace_id,request_digest,request_json,request_bytes,
				seal_authority_issuer_id,seal_authority_implementation_digest,
				seal_ledger_revision,journal_record_digest,spool_disposition_receipt_digest,
				archive_record_digest,sealed_at,receipt_digest,receipt_json,receipt_bytes
			) VALUES (
				candidate_namespace_id,request_digest_value,candidate_request_json,
				candidate_request_bytes,candidate_seal_authority_issuer_id,
				candidate_seal_authority_implementation_digest,ledger_revision_value,
				journal_digest_value,disposition_digest_value,candidate_archive_record_digest,
				candidate_sealed_at,receipt_digest_value,receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8')
			);
			RETURN QUERY SELECT receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8'),
				receipt_digest_value,candidate_archive_record_digest,ledger_revision_value;
		END;
		$$`,
	}
}
