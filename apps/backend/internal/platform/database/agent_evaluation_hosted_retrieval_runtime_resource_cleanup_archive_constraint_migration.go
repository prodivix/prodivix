package database

func agentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_receipt()
			RETURNS trigger AS $$
		DECLARE
			request_row ae_hrrr_cleanup_requests%ROWTYPE;
			claim_row ae_hrrr_cleanup_claims%ROWTYPE;
			claim_receipt_row ae_hrrr_cleanup_claim_receipts%ROWTYPE;
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			registration_row ae_hrrr_registration_results%ROWTYPE;
			result_record JSONB;
			result_digests JSONB;
			expected_resource_ids JSONB;
			expected_result_count BIGINT;
			actual_result_count BIGINT;
			distinct_result_count BIGINT;
			maximum_completed_at TIMESTAMPTZ;
			terminal_state JSONB;
		BEGIN
			SELECT * INTO request_row
			FROM ae_hrrr_cleanup_requests
			WHERE namespace_id=NEW.namespace_id
				AND request_digest=NEW.cleanup_request_digest
			FOR SHARE;
			SELECT * INTO claim_row
			FROM ae_hrrr_cleanup_claims
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.cleanup_claim_authority_receipt_digest
			FOR SHARE;
			SELECT * INTO resource_row
			FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND authority_digest=NEW.authority_digest
			FOR UPDATE;
			SELECT * INTO claim_receipt_row
			FROM ae_hrrr_cleanup_claim_receipts
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=resource_row.current_cleanup_claim_receipt_digest
			FOR SHARE;
			SELECT * INTO registration_row
			FROM ae_hrrr_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND registration_request_digest=resource_row.registration_request_digest
			FOR SHARE;
			expected_resource_ids:=
				(registration_row.authority_json->'auxiliaryResourceIds')||
				jsonb_build_array(registration_row.provider_resource_id);
			SELECT jsonb_agg(value ORDER BY value COLLATE "C") INTO expected_resource_ids
			FROM jsonb_array_elements_text(expected_resource_ids) member(value);
			expected_result_count:=jsonb_array_length(expected_resource_ids);
			IF request_row.request_digest IS NULL OR claim_row.receipt_digest IS NULL
				OR claim_receipt_row.receipt_digest IS NULL
				OR resource_row.lifecycle<>'cleanup-in-progress'
				OR request_row.plan_digest<>NEW.plan_digest
				OR request_row.repository_commit<>NEW.repository_commit
				OR request_row.authority_digest<>NEW.authority_digest
				OR claim_row.plan_digest<>NEW.plan_digest
				OR claim_row.repository_commit<>NEW.repository_commit
				OR claim_row.authority_digest<>NEW.authority_digest
				OR claim_receipt_row.cleanup_claim_authority_receipt_digest<>
					NEW.cleanup_claim_authority_receipt_digest
				OR claim_receipt_row.cleanup_request_digest<>NEW.cleanup_request_digest
				OR claim_receipt_row.claim_generation<>NEW.claim_generation
				OR resource_row.cleanup_request_digest<>NEW.cleanup_request_digest
				OR NEW.cleanup_request_digest<>request_row.request_digest
				OR NEW.resource_set_commitment_digest<>request_row.resource_set_commitment_digest
				OR NEW.read_lease_ledger_root_digest<>request_row.read_lease_ledger_root_digest
				OR NEW.cleanup_claim_authority_receipt_digest<>
					request_row.cleanup_claim_authority_receipt_digest
				OR NEW.deletion_authority_receipt_digest<>request_row.deletion_authority_receipt_digest
				OR NEW.run_terminal_fence_digest<>request_row.run_terminal_fence_digest
				OR NEW.cleanup_owner_instance_id<>request_row.cleanup_owner_instance_id
				OR NEW.claim_generation<>request_row.claim_generation
				OR NEW.prior_active_state_digest<>request_row.prior_active_state_digest
				OR NEW.completed_at<request_row.deletion_not_before
				OR NEW.completed_at>=claim_row.claim_expires_at
				OR jsonb_typeof(NEW.cleanup_receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.cleanup_receipt_json)<>29
				OR NOT (NEW.cleanup_receipt_json ?& ARRAY[
					'format','version','cleanupRequestDigest','planDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','authorityDigest',
					'resourceSetCommitmentDigest','readLeaseLedgerRootDigest',
					'cleanupClaimAuthorityReceiptDigest','deletionAuthorityReceiptDigest',
					'protocolFamily','providerResourceKind','providerResourceId','auxiliaryResourceIds',
					'runTerminalFenceDigest','cleanupReason','overdueReceiptDigest',
					'cleanupOwnerInstanceId','claimGeneration','priorActiveStateDigest',
					'deletionNotBefore','resourceResults','resourceResultSetDigest',
					'residualProviderResourceIds','terminalLifecycle','terminalStateDigest',
					'completedAt','cleanupReceiptDigest'
				])
				OR NEW.cleanup_receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-receipt'
				OR (NEW.cleanup_receipt_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.cleanup_receipt_json-'cleanupReceiptDigest')<>NEW.cleanup_receipt_digest
				OR NEW.cleanup_receipt_json->>'cleanupReceiptDigest'<>NEW.cleanup_receipt_digest
				OR NEW.cleanup_receipt_json->>'cleanupRequestDigest'<>NEW.cleanup_request_digest
				OR NEW.cleanup_receipt_json->>'planDigest'<>NEW.plan_digest
				OR NEW.cleanup_receipt_json->>'runConfigArtifactBindingDigest'<>
					request_row.request_json->>'runConfigArtifactBindingDigest'
				OR NEW.cleanup_receipt_json->>'runtimeResourceSetId'<>resource_row.runtime_resource_set_id
				OR NEW.cleanup_receipt_json->>'authorityDigest'<>NEW.authority_digest
				OR NEW.cleanup_receipt_json->>'resourceSetCommitmentDigest'<>
					NEW.resource_set_commitment_digest
				OR NEW.cleanup_receipt_json->>'readLeaseLedgerRootDigest'<>
					NEW.read_lease_ledger_root_digest
				OR NEW.cleanup_receipt_json->>'cleanupClaimAuthorityReceiptDigest'<>
					NEW.cleanup_claim_authority_receipt_digest
				OR NEW.cleanup_receipt_json->>'deletionAuthorityReceiptDigest'<>
					NEW.deletion_authority_receipt_digest
				OR NEW.cleanup_receipt_json->>'protocolFamily'<>registration_row.protocol_family
				OR NEW.cleanup_receipt_json->>'providerResourceKind'<>
					registration_row.provider_resource_kind
				OR NEW.cleanup_receipt_json->>'providerResourceId'<>
					registration_row.provider_resource_id
				OR NEW.cleanup_receipt_json->'auxiliaryResourceIds'<>
					registration_row.authority_json->'auxiliaryResourceIds'
				OR NEW.cleanup_receipt_json->>'runTerminalFenceDigest'<>
					NEW.run_terminal_fence_digest
				OR NEW.cleanup_receipt_json->>'cleanupReason'<>request_row.cleanup_reason
				OR NEW.cleanup_receipt_json->>'overdueReceiptDigest' IS DISTINCT FROM
					request_row.overdue_receipt_digest
				OR NEW.cleanup_receipt_json->>'cleanupOwnerInstanceId'<>
					NEW.cleanup_owner_instance_id
				OR (NEW.cleanup_receipt_json->>'claimGeneration')::bigint<>NEW.claim_generation
				OR NEW.cleanup_receipt_json->>'priorActiveStateDigest'<>
					NEW.prior_active_state_digest
				OR (NEW.cleanup_receipt_json->>'deletionNotBefore')::timestamptz<>
					request_row.deletion_not_before
				OR NEW.cleanup_receipt_json->'residualProviderResourceIds'<>'[]'::jsonb
				OR NEW.cleanup_receipt_json->>'terminalLifecycle'<>'cleaned'
				OR NEW.cleanup_receipt_json->>'terminalStateDigest'<>NEW.terminal_state_digest
				OR (NEW.cleanup_receipt_json->>'completedAt')::timestamptz<>NEW.completed_at THEN
				RAISE EXCEPTION 'hosted runtime cleanup receipt drifted from durable cleanup authority'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.cleanup_receipt_json->'resourceResults')<>'array' THEN
				RAISE EXCEPTION 'hosted runtime cleanup resource results are not an array'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*),COUNT(DISTINCT value->>'resourceId'),
				jsonb_agg(to_jsonb(value->>'resultDigest') ORDER BY value->>'resourceId' COLLATE "C"),
				MAX((value->>'completedAt')::timestamptz)
			INTO actual_result_count,distinct_result_count,result_digests,maximum_completed_at
			FROM jsonb_array_elements(NEW.cleanup_receipt_json->'resourceResults') member(value);
			IF actual_result_count<>expected_result_count OR distinct_result_count<>expected_result_count
				OR NEW.cleanup_receipt_json->'resourceResults'<>(
					SELECT jsonb_agg(value ORDER BY value->>'resourceId' COLLATE "C")
					FROM jsonb_array_elements(
						NEW.cleanup_receipt_json->'resourceResults') member(value)
				)
				OR (SELECT jsonb_agg(to_jsonb(value->>'resourceId')
					ORDER BY value->>'resourceId' COLLATE "C")
					FROM jsonb_array_elements(NEW.cleanup_receipt_json->'resourceResults') member(value)
				)<>expected_resource_ids
				OR NEW.cleanup_receipt_json->'resourceResultSetDigest'<>
					to_jsonb(agent_evaluation_canonical_jsonb_digest(result_digests))
				OR maximum_completed_at<>NEW.completed_at THEN
				RAISE EXCEPTION 'hosted runtime cleanup resource result set is incomplete or noncanonical'
					USING ERRCODE='23514';
			END IF;
			FOR result_record IN
				SELECT value FROM jsonb_array_elements(NEW.cleanup_receipt_json->'resourceResults')
			LOOP
				IF jsonb_typeof(result_record)<>'object'
					OR agent_evaluation_jsonb_object_key_count(result_record)<>13
					OR NOT (result_record ?& ARRAY[
						'format','version','resourceId','resourceRole','outcome',
						'cleanupClaimAuthorityReceiptDigest','dispatchIntentDigest',
						'transportReceiptDigest','resultSpoolReceiptDigest',
						'resultSpoolDispositionReceiptDigest','dispatchCreatedAt','completedAt','resultDigest'
					])
					OR result_record->>'format'<>
						'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-resource-result'
					OR (result_record->>'version')::bigint<>1
					OR agent_evaluation_canonical_jsonb_digest(result_record-'resultDigest')<>
						result_record->>'resultDigest'
					OR result_record->>'outcome' NOT IN ('already-absent','deleted')
					OR result_record->>'cleanupClaimAuthorityReceiptDigest'<>
						NEW.cleanup_claim_authority_receipt_digest
					OR result_record->>'dispatchIntentDigest' !~ '^sha256-[a-f0-9]{64}$'
					OR result_record->>'transportReceiptDigest' !~ '^sha256-[a-f0-9]{64}$'
					OR result_record->>'resultSpoolReceiptDigest' !~ '^sha256-[a-f0-9]{64}$'
					OR result_record->>'resultSpoolDispositionReceiptDigest' !~ '^sha256-[a-f0-9]{64}$'
					OR (result_record->>'dispatchCreatedAt')::timestamptz<request_row.deletion_not_before
					OR (result_record->>'completedAt')::timestamptz<
						(result_record->>'dispatchCreatedAt')::timestamptz
					OR (result_record->>'completedAt')::timestamptz>=claim_row.claim_expires_at
					OR (result_record->>'resourceId'=registration_row.provider_resource_id)<>
						(result_record->>'resourceRole'='primary')
					OR result_record->>'resourceRole' NOT IN ('auxiliary','primary') THEN
					RAISE EXCEPTION 'hosted runtime cleanup resource result drifted'
						USING ERRCODE='23514';
				END IF;
			END LOOP;
			terminal_state:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-state',
				'version',1,'authorityDigest',NEW.authority_digest,
				'cleanupRequestDigest',NEW.cleanup_request_digest,
				'cleanupOwnerInstanceId',NEW.cleanup_owner_instance_id,
				'claimGeneration',NEW.claim_generation,
				'readLeaseLedgerRootDigest',NEW.read_lease_ledger_root_digest,
				'cleanupClaimAuthorityReceiptDigest',NEW.cleanup_claim_authority_receipt_digest,
				'completedAt',NEW.cleanup_receipt_json->'completedAt',
				'lifecycle','cleaned','residualProviderResourceIds','[]'::jsonb
			);
			IF agent_evaluation_canonical_jsonb_digest(terminal_state)<>NEW.terminal_state_digest THEN
				RAISE EXCEPTION 'hosted runtime cleanup terminal state digest drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanups_exact
			BEFORE INSERT ON ae_hrrr_cleanups
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_receipt()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanups_immutable
			BEFORE UPDATE OR DELETE ON ae_hrrr_cleanups
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanups_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON ae_hrrr_cleanups
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_archive()
			RETURNS trigger AS $$
		DECLARE
			cleanup_row ae_hrrr_cleanups%ROWTYPE;
			request_row ae_hrrr_cleanup_requests%ROWTYPE;
			claim_row ae_hrrr_cleanup_claims%ROWTYPE;
			registration_row ae_hrrr_registration_results%ROWTYPE;
			set_row ae_hrrr_sets%ROWTYPE;
			root_row ae_hrrr_read_lease_ledger_roots%ROWTYPE;
			fence_row ae_hrrr_run_terminal_fences%ROWTYPE;
			overdue_json JSONB;
			archive_count BIGINT;
			archive_bytes BIGINT;
		BEGIN
			SELECT * INTO cleanup_row FROM ae_hrrr_cleanups
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND authority_digest=NEW.authority_digest;
			SELECT * INTO request_row FROM ae_hrrr_cleanup_requests
			WHERE namespace_id=NEW.namespace_id
				AND request_digest=cleanup_row.cleanup_request_digest;
			SELECT * INTO claim_row FROM ae_hrrr_cleanup_claims
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=cleanup_row.cleanup_claim_authority_receipt_digest;
			SELECT * INTO registration_row
			FROM ae_hrrr_registration_results
			WHERE namespace_id=NEW.namespace_id AND authority_digest=NEW.authority_digest;
			SELECT * INTO set_row FROM ae_hrrr_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=NEW.runtime_resource_set_id;
			SELECT * INTO root_row
			FROM ae_hrrr_read_lease_ledger_roots
			WHERE namespace_id=NEW.namespace_id AND root_digest=request_row.read_lease_ledger_root_digest;
			SELECT * INTO fence_row
			FROM ae_hrrr_run_terminal_fences
			WHERE namespace_id=NEW.namespace_id AND fence_digest=request_row.run_terminal_fence_digest;
			IF request_row.overdue_receipt_digest IS NULL THEN overdue_json:='null'::jsonb;
			ELSE
				SELECT receipt_json INTO overdue_json
				FROM ae_hrrr_overdue_receipts
				WHERE namespace_id=NEW.namespace_id AND receipt_digest=request_row.overdue_receipt_digest;
			END IF;
			IF cleanup_row.cleanup_receipt_digest IS NULL OR registration_row.authority_digest IS NULL
				OR set_row.authority_set_digest IS NULL OR root_row.root_digest IS NULL
				OR fence_row.fence_digest IS NULL
				OR NEW.cleanup_receipt_digest<>cleanup_row.cleanup_receipt_digest
				OR NEW.runtime_resource_set_id<>registration_row.runtime_resource_set_id
				OR jsonb_typeof(NEW.record_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.record_json)<>21
				OR NOT (NEW.record_json ?& ARRAY[
					'format','version','repositoryCommit','planDigest','frozenRunDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','registrationRequestDigest',
					'authorityDigest','cleanupRequestDigest','cleanupReceiptDigest',
					'registrationResult','resourceSetCommitment','cleanupRequest',
					'storedCleanupClaimAuthorityReceipt','storedPriorActiveState','readLeaseLedgerRoot',
					'storedRunTerminalFence','overdueReceipt','cleanupReceipt','recordDigest'
				])
				OR NEW.record_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-archive-record'
				OR (NEW.record_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.record_json-'recordDigest')<>NEW.record_digest
				OR NEW.record_json->>'recordDigest'<>NEW.record_digest
				OR NEW.record_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.record_json->>'planDigest'<>NEW.plan_digest
				OR NEW.record_json->>'frozenRunDigest'<>set_row.frozen_run_digest
				OR NEW.record_json->>'runConfigArtifactBindingDigest'<>
					set_row.run_config_artifact_binding_digest
				OR NEW.record_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR NEW.record_json->>'registrationRequestDigest'<>
					registration_row.registration_request_digest
				OR NEW.record_json->>'authorityDigest'<>NEW.authority_digest
				OR NEW.record_json->>'cleanupRequestDigest'<>request_row.request_digest
				OR NEW.record_json->>'cleanupReceiptDigest'<>cleanup_row.cleanup_receipt_digest
				OR NEW.record_json->'registrationResult'<>registration_row.registration_result_json
				OR NEW.record_json->'resourceSetCommitment'<>set_row.resource_set_commitment_json
				OR NEW.record_json->'cleanupRequest'<>request_row.request_json
				OR NEW.record_json->'storedCleanupClaimAuthorityReceipt'<>claim_row.receipt_json
				OR NEW.record_json->'storedPriorActiveState'<>request_row.request_json->'priorActiveState'
				OR NEW.record_json->'readLeaseLedgerRoot'<>root_row.root_json
				OR NEW.record_json->'storedRunTerminalFence'<>fence_row.fence_json
				OR NEW.record_json->'overdueReceipt'<>overdue_json
				OR NEW.record_json->'cleanupReceipt'<>cleanup_row.cleanup_receipt_json THEN
				RAISE EXCEPTION 'hosted runtime cleanup archive drifted from durable lifecycle'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
				chr(31)||'hosted-runtime-cleanup-archive',0));
			SELECT COUNT(*),COALESCE(SUM(octet_length(record_bytes)),0)
			INTO archive_count,archive_bytes
			FROM ae_hrrr_cleanup_archives
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit;
			IF archive_count>=4 OR archive_bytes+octet_length(NEW.record_bytes)>786432
				OR NOT agent_evaluation_hosted_runtime_plan_intent_set_valid((
					SELECT plan_json FROM agent_evaluation_plans
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit
				)) THEN
				RAISE EXCEPTION 'hosted runtime cleanup archive exact4 family is full or foreign'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_archives_exact
			BEFORE INSERT ON ae_hrrr_cleanup_archives
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_archive()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_archives_immutable
			BEFORE UPDATE OR DELETE ON ae_hrrr_cleanup_archives
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_archives_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON ae_hrrr_cleanup_archives
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION materialize_agent_evaluation_hosted_runtime_cleanup_archive()
			RETURNS trigger AS $$
		DECLARE
			request_row ae_hrrr_cleanup_requests%ROWTYPE;
			claim_row ae_hrrr_cleanup_claims%ROWTYPE;
			registration_row ae_hrrr_registration_results%ROWTYPE;
			set_row ae_hrrr_sets%ROWTYPE;
			root_row ae_hrrr_read_lease_ledger_roots%ROWTYPE;
			fence_row ae_hrrr_run_terminal_fences%ROWTYPE;
			overdue_json JSONB;
			record_base JSONB;
			record_digest TEXT;
			record_json JSONB;
		BEGIN
			SELECT * INTO STRICT request_row FROM ae_hrrr_cleanup_requests
			WHERE namespace_id=NEW.namespace_id AND request_digest=NEW.cleanup_request_digest;
			SELECT * INTO STRICT claim_row FROM ae_hrrr_cleanup_claims
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.cleanup_claim_authority_receipt_digest;
			SELECT * INTO STRICT registration_row
			FROM ae_hrrr_registration_results
			WHERE namespace_id=NEW.namespace_id AND authority_digest=NEW.authority_digest;
			SELECT * INTO STRICT set_row FROM ae_hrrr_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=registration_row.runtime_resource_set_id;
			SELECT * INTO STRICT root_row
			FROM ae_hrrr_read_lease_ledger_roots
			WHERE namespace_id=NEW.namespace_id AND root_digest=NEW.read_lease_ledger_root_digest;
			SELECT * INTO STRICT fence_row
			FROM ae_hrrr_run_terminal_fences
			WHERE namespace_id=NEW.namespace_id AND fence_digest=NEW.run_terminal_fence_digest;
			IF request_row.overdue_receipt_digest IS NULL THEN overdue_json:='null'::jsonb;
			ELSE
				SELECT receipt_json INTO STRICT overdue_json
				FROM ae_hrrr_overdue_receipts
				WHERE namespace_id=NEW.namespace_id AND receipt_digest=request_row.overdue_receipt_digest;
			END IF;
			record_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-archive-record',
				'version',1,'repositoryCommit',NEW.repository_commit,'planDigest',NEW.plan_digest,
				'frozenRunDigest',set_row.frozen_run_digest,
				'runConfigArtifactBindingDigest',set_row.run_config_artifact_binding_digest,
				'runtimeResourceSetId',registration_row.runtime_resource_set_id,
				'registrationRequestDigest',registration_row.registration_request_digest,
				'authorityDigest',NEW.authority_digest,'cleanupRequestDigest',NEW.cleanup_request_digest,
				'cleanupReceiptDigest',NEW.cleanup_receipt_digest,
				'registrationResult',registration_row.registration_result_json,
				'resourceSetCommitment',set_row.resource_set_commitment_json,
				'cleanupRequest',request_row.request_json,
				'storedCleanupClaimAuthorityReceipt',claim_row.receipt_json,
				'storedPriorActiveState',request_row.request_json->'priorActiveState',
				'readLeaseLedgerRoot',root_row.root_json,
				'storedRunTerminalFence',fence_row.fence_json,
				'overdueReceipt',overdue_json,'cleanupReceipt',NEW.cleanup_receipt_json
			);
			record_digest:=agent_evaluation_canonical_jsonb_digest(record_base);
			record_json:=record_base||jsonb_build_object('recordDigest',record_digest);
			INSERT INTO ae_hrrr_cleanup_archives(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,authority_digest,
				record_digest,cleanup_receipt_digest,record_json,record_bytes,v45_eligible
			) VALUES (
				NEW.namespace_id,NEW.plan_digest,NEW.repository_commit,
				registration_row.runtime_resource_set_id,NEW.authority_digest,record_digest,
				NEW.cleanup_receipt_digest,record_json,
				convert_to(agent_evaluation_canonical_jsonb_text(record_json),'UTF8'),TRUE
			);
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_archive_materializer
			AFTER INSERT ON ae_hrrr_cleanups
			FOR EACH ROW EXECUTE FUNCTION materialize_agent_evaluation_hosted_runtime_cleanup_archive()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_hosted_runtime_cleanup_closure()
			RETURNS trigger AS $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				JOIN ae_hrrr_cleanup_claim_receipts claim_receipt
				  ON claim_receipt.namespace_id=resource.namespace_id
				 AND claim_receipt.receipt_digest=resource.current_cleanup_claim_receipt_digest
				JOIN ae_hrrr_cleanup_archives archive
				  ON archive.namespace_id=resource.namespace_id AND archive.plan_digest=resource.plan_digest
				 AND archive.repository_commit=resource.repository_commit
				 AND archive.authority_digest=resource.authority_digest
				WHERE resource.namespace_id=NEW.namespace_id AND resource.plan_digest=NEW.plan_digest
					AND resource.repository_commit=NEW.repository_commit
					AND resource.authority_digest=NEW.authority_digest
					AND resource.lifecycle='cleaned'
					AND resource.cleanup_request_digest=NEW.cleanup_request_digest
					AND claim_receipt.cleanup_claim_authority_receipt_digest=
						NEW.cleanup_claim_authority_receipt_digest
					AND claim_receipt.cleanup_request_digest=NEW.cleanup_request_digest
					AND resource.cleanup_receipt_digest=NEW.cleanup_receipt_digest
					AND resource.current_state_digest=NEW.terminal_state_digest
					AND archive.cleanup_receipt_digest=NEW.cleanup_receipt_digest
			) THEN
				RAISE EXCEPTION 'hosted runtime cleanup lacks cleaned tombstone or archive'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_cleanup_closure_required
			AFTER INSERT ON ae_hrrr_cleanups
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_cleanup_closure()`,
	}
}
