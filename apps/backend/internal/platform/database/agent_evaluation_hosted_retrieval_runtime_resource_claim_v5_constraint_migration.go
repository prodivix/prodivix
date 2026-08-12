package database

// agentEvaluationHostedRetrievalRuntimeResourceClaimV5ConstraintStatements
// validates both v5 claim sources and seals their common receipt into the
// resource current-state CAS. The public request shapes remain source-specific;
// the exact25 receipt is the single durable terminal owner for a generation.
func agentEvaluationHostedRetrievalRuntimeResourceClaimV5ConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_recovery_claim_request()
			RETURNS trigger AS $$
		DECLARE
			page_row agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages%ROWTYPE;
			candidate JSONB;
			candidate_count BIGINT;
		BEGIN
			SELECT * INTO page_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages
			WHERE namespace_id=NEW.namespace_id AND page_digest=NEW.recovery_page_digest
			FOR SHARE;
			SELECT COUNT(*),MIN(value::text)::jsonb
			INTO candidate_count,candidate
			FROM jsonb_array_elements(page_row.candidates_json) member(value)
			WHERE value->>'candidateDigest'=NEW.candidate_digest;
			IF page_row.page_digest IS NULL OR candidate_count<>1
				OR candidate->>'namespaceId'<>NEW.namespace_id
				OR candidate->>'planDigest'<>NEW.plan_digest
				OR candidate->>'repositoryCommit'<>NEW.repository_commit
				OR candidate->>'authorityDigest'<>NEW.authority_digest
				OR candidate->>'activeStateDigest'<>NEW.expected_active_state_digest
				OR NEW.claimed_at<page_row.scanned_at
				OR NEW.cleanup_owner_instance_id !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>11
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','purpose','recoveryPageDigest','candidate',
					'candidateDigest','expectedActiveStateDigest','cleanupOwnerInstanceId',
					'claimedAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.cleanup.claim'
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'recoveryPageDigest'<>NEW.recovery_page_digest
				OR NEW.request_json->'candidate'<>candidate
				OR NEW.request_json->>'candidateDigest'<>NEW.candidate_digest
				OR NEW.request_json->>'expectedActiveStateDigest'<>NEW.expected_active_state_digest
				OR NEW.request_json->>'cleanupOwnerInstanceId'<>NEW.cleanup_owner_instance_id
				OR (NEW.request_json->>'claimedAt')::timestamptz<>NEW.claimed_at THEN
				RAISE EXCEPTION 'hosted runtime recovery claim request drifted from its stored page'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_claim_requests_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_recovery_claim_request()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_claim_requests_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_claim_requests_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_hosted_runtime_source_claim_receipt()
			RETURNS trigger AS $$
		DECLARE
			expected_source TEXT;
		BEGIN
			expected_source:=CASE
				WHEN TG_TABLE_NAME='agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests'
				THEN 'post-matrix' ELSE 'recovery' END;
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts receipt
				WHERE receipt.namespace_id=NEW.namespace_id
					AND receipt.request_digest=NEW.request_digest
					AND receipt.claim_source=expected_source
			) THEN
				RAISE EXCEPTION 'hosted runtime claim request lacks its unified receipt'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_post_matrix_claim_receipt_required
			AFTER INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_source_claim_receipt()`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_recovery_claim_receipt_required
			AFTER INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_source_claim_receipt()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_claim_receipt()
			RETURNS trigger AS $$
		DECLARE
			post_request agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests%ROWTYPE;
			recovery_request agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests%ROWTYPE;
			claim_row agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims%ROWTYPE;
			cleanup_request agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests%ROWTYPE;
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			registration_row agent_evaluation_hosted_retrieval_runtime_resource_registration_results%ROWTYPE;
			set_row agent_evaluation_hosted_retrieval_runtime_resource_sets%ROWTYPE;
			root_row agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots%ROWTYPE;
			fence_row agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences%ROWTYPE;
			prior_state JSONB;
			overdue_json JSONB:='null'::jsonb;
			transition JSONB;
		BEGIN
			SELECT * INTO claim_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.cleanup_claim_authority_receipt_digest
			FOR SHARE;
			SELECT * INTO cleanup_request
			FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests
			WHERE namespace_id=NEW.namespace_id AND request_digest=NEW.cleanup_request_digest
			FOR SHARE;
			SELECT * INTO resource_row
			FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND authority_digest=NEW.authority_digest
			FOR UPDATE;
			SELECT * INTO registration_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND registration_request_digest=resource_row.registration_request_digest
			FOR SHARE;
			SELECT * INTO set_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=resource_row.runtime_resource_set_id
			FOR SHARE;
			SELECT * INTO root_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
			WHERE namespace_id=NEW.namespace_id
				AND root_digest=cleanup_request.read_lease_ledger_root_digest
			FOR SHARE;
			SELECT * INTO fence_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences
			WHERE namespace_id=NEW.namespace_id
				AND fence_digest=cleanup_request.run_terminal_fence_digest
			FOR SHARE;
			prior_state:=agent_evaluation_hosted_runtime_active_state_by_digest(
				NEW.namespace_id,NEW.plan_digest,NEW.repository_commit,NEW.authority_digest,
				NEW.expected_active_state_digest
			);
			IF cleanup_request.overdue_receipt_digest IS NOT NULL THEN
				SELECT receipt_json INTO overdue_json
				FROM agent_evaluation_hosted_retrieval_runtime_resource_overdue_receipts
				WHERE namespace_id=NEW.namespace_id
					AND receipt_digest=cleanup_request.overdue_receipt_digest;
				IF overdue_json IS NULL THEN
					RAISE EXCEPTION 'hosted runtime cleanup claim receipt lost its overdue evidence'
						USING ERRCODE='23514';
				END IF;
			END IF;
			IF NEW.claim_source='post-matrix' THEN
				SELECT * INTO post_request
				FROM agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests
				WHERE namespace_id=NEW.namespace_id AND request_digest=NEW.request_digest
				FOR SHARE;
				IF post_request.request_digest IS NULL
					OR post_request.plan_digest<>NEW.plan_digest
					OR post_request.repository_commit<>NEW.repository_commit
					OR post_request.authority_digest<>NEW.authority_digest
					OR post_request.terminal_fence_derive_receipt_digest<>
						NEW.claim_source_receipt_digest
					OR cleanup_request.run_terminal_fence_digest<>
						post_request.request_json#>>'{terminalFenceDeriveReceipt,runTerminalFenceDigest}'
					OR post_request.claimed_at<>NEW.claimed_at
					OR NEW.claim_expires_at<post_request.minimum_claim_expires_at THEN
					RAISE EXCEPTION 'hosted runtime post-matrix claim receipt lost its derive request'
						USING ERRCODE='23514';
				END IF;
			ELSE
				SELECT * INTO recovery_request
				FROM agent_evaluation_hosted_retrieval_runtime_resource_recovery_claim_requests
				WHERE namespace_id=NEW.namespace_id AND request_digest=NEW.request_digest
				FOR SHARE;
				IF recovery_request.request_digest IS NULL
					OR recovery_request.plan_digest<>NEW.plan_digest
					OR recovery_request.repository_commit<>NEW.repository_commit
					OR recovery_request.authority_digest<>NEW.authority_digest
					OR recovery_request.recovery_page_digest<>NEW.claim_source_receipt_digest
					OR recovery_request.candidate_digest<>NEW.candidate_digest
					OR recovery_request.expected_active_state_digest<>
						NEW.expected_active_state_digest
					OR cleanup_request.resource_set_commitment_digest<>
						recovery_request.request_json#>>'{candidate,resourceSetCommitmentDigest}'
					OR cleanup_request.read_lease_ledger_root_digest<>
						recovery_request.request_json#>>'{candidate,readLeaseLedgerRootDigest}'
					OR cleanup_request.run_terminal_fence_digest<>
						recovery_request.request_json#>>'{candidate,storedRunTerminalFenceDigest}'
					OR recovery_request.claimed_at<>NEW.claimed_at THEN
					RAISE EXCEPTION 'hosted runtime recovery claim receipt lost its stored request'
						USING ERRCODE='23514';
				END IF;
			END IF;
			transition:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-state-transition',
				'version',1,'claimSource',NEW.claim_source,
				'recoveryAuthorityIssuerId',NEW.recovery_authority_issuer_id,
				'recoveryAuthorityImplementationDigest',NEW.recovery_authority_implementation_digest,
				'claimLedgerRevision',NEW.claim_ledger_revision,'requestDigest',NEW.request_digest,
				'claimSourceReceiptDigest',NEW.claim_source_receipt_digest,
				'candidateDigest',to_jsonb(NEW.candidate_digest),
				'expectedActiveStateDigest',NEW.expected_active_state_digest,
				'claimedStateDigest',NEW.claimed_state_digest,
				'cleanupClaimAuthorityReceiptDigest',NEW.cleanup_claim_authority_receipt_digest
			);
			IF claim_row.receipt_digest IS NULL OR cleanup_request.request_digest IS NULL
				OR resource_row.authority_digest IS NULL OR registration_row.registration_result_digest IS NULL
				OR set_row.authority_set_digest IS NULL OR root_row.root_digest IS NULL
				OR fence_row.fence_digest IS NULL OR prior_state IS NULL
				OR claim_row.plan_digest<>NEW.plan_digest
				OR claim_row.repository_commit<>NEW.repository_commit
				OR claim_row.authority_digest<>NEW.authority_digest
				OR claim_row.claim_generation<>NEW.claim_generation
				OR claim_row.claim_ledger_revision<>NEW.claim_ledger_revision
				OR claim_row.expected_active_state_digest<>NEW.expected_active_state_digest
				OR claim_row.claimed_state_digest<>NEW.claimed_state_digest
				OR claim_row.claimed_at<>NEW.claimed_at OR claim_row.claim_expires_at<>NEW.claim_expires_at
				OR claim_row.claim_authority_issuer_id<>NEW.recovery_authority_issuer_id
				OR claim_row.claim_authority_implementation_digest<>
					NEW.recovery_authority_implementation_digest
				OR cleanup_request.plan_digest<>NEW.plan_digest
				OR cleanup_request.repository_commit<>NEW.repository_commit
				OR cleanup_request.authority_digest<>NEW.authority_digest
				OR cleanup_request.cleanup_claim_authority_receipt_digest<>
					NEW.cleanup_claim_authority_receipt_digest
				OR cleanup_request.claim_generation<>NEW.claim_generation
				OR cleanup_request.prior_active_state_digest<>NEW.expected_active_state_digest
				OR cleanup_request.requested_at<>NEW.claimed_at
				OR cleanup_request.cleanup_owner_instance_id<>claim_row.cleanup_owner_instance_id
				OR agent_evaluation_canonical_jsonb_digest(transition)<>NEW.claim_state_transition_digest
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>25
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','claimSource','requestDigest','claimSourceReceiptDigest',
					'candidateDigest','recoveryAuthorityIssuerId','recoveryAuthorityImplementationDigest',
					'claimLedgerRevision','expectedActiveStateDigest','cleanupClaimAuthorityReceipt',
					'cleanupClaimAuthorityReceiptDigest','registrationResult','resourceSetCommitment',
					'storedPriorActiveState','readLeaseLedgerRoot','storedRunTerminalFence','overdueReceipt',
					'cleanupRequest','cleanupClaimGeneration','claimedStateDigest',
					'claimStateTransitionDigest','claimedAt','claimExpiresAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR NEW.receipt_json->>'claimSource'<>NEW.claim_source
				OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
				OR NEW.receipt_json->>'claimSourceReceiptDigest'<>NEW.claim_source_receipt_digest
				OR NEW.receipt_json->>'candidateDigest' IS DISTINCT FROM NEW.candidate_digest
				OR NEW.receipt_json->>'recoveryAuthorityIssuerId'<>NEW.recovery_authority_issuer_id
				OR NEW.receipt_json->>'recoveryAuthorityImplementationDigest'<>
					NEW.recovery_authority_implementation_digest
				OR (NEW.receipt_json->>'claimLedgerRevision')::bigint<>NEW.claim_ledger_revision
				OR NEW.receipt_json->>'expectedActiveStateDigest'<>NEW.expected_active_state_digest
				OR NEW.receipt_json->'cleanupClaimAuthorityReceipt'<>claim_row.receipt_json
				OR NEW.receipt_json->>'cleanupClaimAuthorityReceiptDigest'<>
					NEW.cleanup_claim_authority_receipt_digest
				OR NEW.receipt_json->'registrationResult'<>registration_row.registration_result_json
				OR NEW.receipt_json->'resourceSetCommitment'<>set_row.resource_set_commitment_json
				OR NEW.receipt_json->'storedPriorActiveState'<>prior_state
				OR NEW.receipt_json->'readLeaseLedgerRoot'<>root_row.root_json
				OR NEW.receipt_json->'storedRunTerminalFence'<>fence_row.fence_json
				OR NEW.receipt_json->'overdueReceipt' IS DISTINCT FROM overdue_json
				OR NEW.receipt_json->'cleanupRequest'<>cleanup_request.request_json
				OR (NEW.receipt_json->>'cleanupClaimGeneration')::bigint<>NEW.claim_generation
				OR NEW.receipt_json->>'claimedStateDigest'<>NEW.claimed_state_digest
				OR NEW.receipt_json->>'claimStateTransitionDigest'<>NEW.claim_state_transition_digest
				OR (NEW.receipt_json->>'claimedAt')::timestamptz<>NEW.claimed_at
				OR (NEW.receipt_json->>'claimExpiresAt')::timestamptz<>NEW.claim_expires_at THEN
				RAISE EXCEPTION 'hosted runtime cleanup claim receipt drifted from durable claim context'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_claim_receipts_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_claim_receipt()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_claim_receipts_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_claim_receipts_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_hosted_runtime_cleanup_claim_receipt_cas()
			RETURNS trigger AS $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims claim
				  ON claim.namespace_id=NEW.namespace_id
				 AND claim.receipt_digest=NEW.cleanup_claim_authority_receipt_digest
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests request
				  ON request.namespace_id=NEW.namespace_id
				 AND request.request_digest=NEW.cleanup_request_digest
				WHERE resource.namespace_id=NEW.namespace_id AND resource.plan_digest=NEW.plan_digest
					AND resource.repository_commit=NEW.repository_commit
					AND resource.authority_digest=NEW.authority_digest
					AND resource.lifecycle='cleanup-in-progress'
					AND resource.current_cleanup_claim_receipt_digest=NEW.receipt_digest
					AND resource.cleanup_request_digest=NEW.cleanup_request_digest
					AND resource.active_owner_instance_id=claim.cleanup_owner_instance_id
					AND resource.claim_generation=NEW.claim_generation
					AND resource.current_state_digest=NEW.claimed_state_digest
					AND request.cleanup_claim_authority_receipt_digest=claim.receipt_digest
			) THEN
				RAISE EXCEPTION 'hosted runtime cleanup claim receipt was not atomically installed as current'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_cleanup_claim_receipt_cas_required
			AFTER INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_cleanup_claim_receipt_cas()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_result_read_request()
			RETURNS trigger AS $$
		DECLARE
			claim_receipt agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts%ROWTYPE;
		BEGIN
			SELECT * INTO claim_receipt
			FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.recovery_claim_receipt_digest
			FOR SHARE;
			IF claim_receipt.receipt_digest IS NULL
				OR claim_receipt.authority_digest<>NEW.authority_digest
				OR claim_receipt.cleanup_request_digest<>NEW.cleanup_request_digest
				OR (claim_receipt.claim_source='post-matrix' AND
					NEW.request_json->>'purpose'<>
						'hosted-retrieval-runtime-resource.cleanup.post-matrix.result.read')
				OR (claim_receipt.claim_source='recovery' AND
					NEW.request_json->>'purpose'<>
						'hosted-retrieval-runtime-resource.cleanup.result.read')
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>9
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','purpose','authorityDigest','cleanupRequestDigest',
					'recoveryClaimReceiptDigest','requestedAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-result-read-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'authorityDigest'<>NEW.authority_digest
				OR NEW.request_json->>'cleanupRequestDigest'<>NEW.cleanup_request_digest
				OR NEW.request_json->>'recoveryClaimReceiptDigest'<>
					NEW.recovery_claim_receipt_digest
				OR (NEW.request_json->>'requestedAt')::timestamptz<>NEW.requested_at THEN
				RAISE EXCEPTION 'hosted runtime cleanup result read request drifted from its stored claim'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_result_read_requests_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_result_read_request()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_result_read_requests_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_result_read_requests_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_result_read_receipt()
			RETURNS trigger AS $$
		DECLARE
			request_row agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests%ROWTYPE;
			cleanup_row agent_evaluation_hosted_retrieval_runtime_resource_cleanups%ROWTYPE;
			archive_row agent_evaluation_hosted_retrieval_runtime_resource_cleanup_archives%ROWTYPE;
			expected_cleanup JSONB:='null'::jsonb;
			expected_archive JSONB:='null'::jsonb;
			expected_residual JSONB:='null'::jsonb;
		BEGIN
			SELECT * INTO request_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests
			WHERE namespace_id=NEW.namespace_id AND request_digest=NEW.request_digest
			FOR SHARE;
			SELECT * INTO cleanup_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanups
			WHERE namespace_id=NEW.namespace_id
				AND authority_digest=request_row.authority_digest
				AND cleanup_request_digest=request_row.cleanup_request_digest
			FOR SHARE;
			IF cleanup_row.cleanup_receipt_digest IS NOT NULL THEN
				SELECT * INTO archive_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_archives
				WHERE namespace_id=NEW.namespace_id
					AND authority_digest=request_row.authority_digest
					AND cleanup_receipt_digest=cleanup_row.cleanup_receipt_digest
				FOR SHARE;
			END IF;
			IF NEW.status='cleaned' THEN
				expected_cleanup:=cleanup_row.cleanup_receipt_json;
				expected_archive:=archive_row.record_json;
				expected_residual:='[]'::jsonb;
			END IF;
			IF request_row.request_digest IS NULL OR NEW.read_at<request_row.requested_at
				OR (NEW.status='pending' AND
					(cleanup_row.cleanup_receipt_digest IS NOT NULL OR archive_row.record_digest IS NOT NULL))
				OR (NEW.status='cleaned' AND
					(cleanup_row.cleanup_receipt_digest IS NULL OR archive_row.record_digest IS NULL
						OR NEW.read_at<cleanup_row.completed_at))
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>9
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','requestDigest','status','cleanupReceipt','cleanupArchiveRecord',
					'residualProviderResourceIds','readAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-result-read-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
				OR NEW.receipt_json->>'status'<>NEW.status
				OR NEW.receipt_json->'cleanupReceipt'<>expected_cleanup
				OR NEW.receipt_json->'cleanupArchiveRecord'<>expected_archive
				OR NEW.receipt_json->'residualProviderResourceIds'<>expected_residual
				OR (NEW.receipt_json->>'readAt')::timestamptz<>NEW.read_at THEN
				RAISE EXCEPTION 'hosted runtime cleanup result read receipt drifted from durable cleanup'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_result_read_receipts_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_result_read_receipt()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_result_read_receipts_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_result_read_receipts_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_hosted_runtime_cleanup_result_read_receipt()
			RETURNS trigger AS $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts receipt
				WHERE receipt.namespace_id=NEW.namespace_id
					AND receipt.request_digest=NEW.request_digest
			) THEN
				RAISE EXCEPTION 'hosted runtime cleanup result read request lacks its receipt'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_cleanup_result_read_receipt_required
			AFTER INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_cleanup_result_read_receipt()`,
	}
}
