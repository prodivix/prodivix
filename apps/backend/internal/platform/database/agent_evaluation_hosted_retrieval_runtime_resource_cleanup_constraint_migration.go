package database

func agentEvaluationHostedRetrievalRuntimeResourceCleanupConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_active_state_by_digest(
			candidate_namespace_id TEXT,
			candidate_plan_digest TEXT,
			candidate_repository_commit TEXT,
			candidate_authority_digest TEXT,
			candidate_state_digest TEXT
		) RETURNS JSONB LANGUAGE plpgsql STABLE PARALLEL RESTRICTED AS $$
		DECLARE
			candidate JSONB;
			match_count BIGINT;
		BEGIN
			SELECT COUNT(*),MIN(state_json::text)::jsonb INTO match_count,candidate
			FROM (
				SELECT stored_active_state_json AS state_json
				FROM agent_evaluation_hosted_retrieval_runtime_resources
				WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
					AND repository_commit=candidate_repository_commit
					AND authority_digest=candidate_authority_digest
					AND stored_active_state_digest=candidate_state_digest
				UNION ALL
				SELECT receipt_json->'activeState'
				FROM agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
				WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
					AND repository_commit=candidate_repository_commit
					AND authority_digest=candidate_authority_digest
					AND active_state_digest=candidate_state_digest
			) states;
			IF match_count<>1 THEN RETURN NULL; END IF;
			RETURN candidate;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_claim()
			RETURNS trigger AS $$
		DECLARE
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			set_row agent_evaluation_hosted_retrieval_runtime_resource_sets%ROWTYPE;
			prior_claim_row agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts%ROWTYPE;
			prior_request_row agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests%ROWTYPE;
			claimed_state JSONB;
		BEGIN
			SELECT * INTO resource_row
			FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND authority_digest=NEW.authority_digest
			FOR UPDATE;
			SELECT * INTO set_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=resource_row.runtime_resource_set_id
			FOR SHARE;
			IF resource_row.lifecycle='active' THEN
				IF resource_row.lifecycle<>'active'
					OR NEW.expected_active_state_digest<>resource_row.current_state_digest THEN
					RAISE EXCEPTION 'hosted runtime cleanup claim lost its active-state CAS'
						USING ERRCODE='23514';
				END IF;
			ELSIF resource_row.lifecycle='cleanup-in-progress' THEN
				SELECT * INTO prior_claim_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND authority_digest=NEW.authority_digest
					AND receipt_digest=resource_row.current_cleanup_claim_receipt_digest
				FOR SHARE;
				SELECT * INTO prior_request_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND authority_digest=NEW.authority_digest
					AND request_digest=resource_row.cleanup_request_digest
				FOR SHARE;
				IF resource_row.lifecycle<>'cleanup-in-progress'
					OR prior_claim_row.receipt_digest IS NULL
					OR prior_request_row.request_digest IS NULL
					OR prior_claim_row.cleanup_request_digest<>prior_request_row.request_digest
					OR prior_claim_row.cleanup_claim_authority_receipt_digest<>
						prior_request_row.cleanup_claim_authority_receipt_digest
					OR prior_claim_row.claim_expires_at>=NEW.claimed_at
					OR prior_request_row.prior_active_state_digest<>
						NEW.expected_active_state_digest THEN
					RAISE EXCEPTION 'hosted runtime recovery claim did not take over one expired current claim'
						USING ERRCODE='23514';
				END IF;
			ELSE
				RAISE EXCEPTION 'hosted runtime cleanup claim cannot replace a cleaned resource'
					USING ERRCODE='23514';
			END IF;
			claimed_state:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claimed-state',
				'version',1,'authorityDigest',NEW.authority_digest,
				'resourceSetCommitmentDigest',resource_row.resource_set_commitment_digest,
				'cleanupOwnerInstanceId',NEW.cleanup_owner_instance_id,
				'claimGeneration',NEW.claim_generation,'claimedAt',NEW.receipt_json->'claimedAt',
				'lifecycle','cleanup-in-progress'
			);
			IF resource_row.authority_digest IS NULL
				OR NEW.claim_generation<>resource_row.claim_generation+1
				OR NEW.claimed_at<resource_row.current_state_updated_at
				OR agent_evaluation_canonical_jsonb_digest(claimed_state)<>NEW.claimed_state_digest
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>21
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','claimId','claimAuthorityIssuerId',
					'claimAuthorityImplementationDigest','claimLedgerRevision','namespaceId',
					'repositoryCommit','planDigest','frozenRunDigest','runConfigArtifactBindingDigest',
					'runtimeResourceSetId','authorityDigest','resourceSetCommitmentDigest',
					'expectedActiveStateDigest','cleanupOwnerInstanceId','claimGeneration',
					'claimedStateDigest','claimedAt','claimExpiresAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claim-authority-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR NEW.receipt_json->>'claimId'<>NEW.claim_id
				OR NEW.receipt_json->>'claimAuthorityIssuerId'<>NEW.claim_authority_issuer_id
				OR NEW.receipt_json->>'claimAuthorityImplementationDigest'<>
					NEW.claim_authority_implementation_digest
				OR (NEW.receipt_json->>'claimLedgerRevision')::bigint<>NEW.claim_ledger_revision
				OR NEW.receipt_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.receipt_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.receipt_json->>'planDigest'<>NEW.plan_digest
				OR NEW.receipt_json->>'frozenRunDigest'<>set_row.frozen_run_digest
				OR NEW.receipt_json->>'runConfigArtifactBindingDigest'<>
					set_row.run_config_artifact_binding_digest
				OR NEW.receipt_json->>'runtimeResourceSetId'<>resource_row.runtime_resource_set_id
				OR NEW.receipt_json->>'authorityDigest'<>NEW.authority_digest
				OR NEW.receipt_json->>'resourceSetCommitmentDigest'<>
					resource_row.resource_set_commitment_digest
				OR NEW.receipt_json->>'expectedActiveStateDigest'<>NEW.expected_active_state_digest
				OR NEW.receipt_json->>'cleanupOwnerInstanceId'<>NEW.cleanup_owner_instance_id
				OR (NEW.receipt_json->>'claimGeneration')::bigint<>NEW.claim_generation
				OR NEW.receipt_json->>'claimedStateDigest'<>NEW.claimed_state_digest
				OR (NEW.receipt_json->>'claimedAt')::timestamptz<>NEW.claimed_at
				OR (NEW.receipt_json->>'claimExpiresAt')::timestamptz<>NEW.claim_expires_at THEN
				RAISE EXCEPTION 'hosted runtime cleanup claim lost its active-state CAS'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_claims_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_claim()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_claims_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_claims_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_hosted_runtime_cleanup_claim_cas()
			RETURNS trigger AS $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts receipt
				  ON receipt.namespace_id=resource.namespace_id
				 AND receipt.receipt_digest=resource.current_cleanup_claim_receipt_digest
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests request
				  ON request.namespace_id=resource.namespace_id
				 AND request.request_digest=resource.cleanup_request_digest
				WHERE resource.namespace_id=NEW.namespace_id
					AND resource.plan_digest=NEW.plan_digest
					AND resource.repository_commit=NEW.repository_commit
					AND resource.authority_digest=NEW.authority_digest
					AND resource.lifecycle='cleanup-in-progress'
					AND resource.active_owner_instance_id=NEW.cleanup_owner_instance_id
					AND resource.claim_generation=NEW.claim_generation
					AND resource.current_state_digest=NEW.claimed_state_digest
					AND receipt.authority_digest=NEW.authority_digest
					AND receipt.claim_generation=NEW.claim_generation
					AND receipt.cleanup_claim_authority_receipt_digest=NEW.receipt_digest
					AND receipt.cleanup_request_digest=request.request_digest
					AND request.cleanup_claim_authority_receipt_digest=NEW.receipt_digest
					AND request.cleanup_owner_instance_id=NEW.cleanup_owner_instance_id
					AND request.claim_generation=NEW.claim_generation
			) THEN
				RAISE EXCEPTION 'hosted runtime cleanup claim was not atomically installed as current'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_cleanup_claim_cas_required
			AFTER INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_cleanup_claim_cas()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_request()
			RETURNS trigger AS $$
		DECLARE
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			registration_row agent_evaluation_hosted_retrieval_runtime_resource_registration_results%ROWTYPE;
			claim_row agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims%ROWTYPE;
			root_row agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots%ROWTYPE;
			fence_row agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences%ROWTYPE;
			prior_state JSONB;
			expected_not_before TIMESTAMPTZ;
		BEGIN
			SELECT * INTO resource_row FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND authority_digest=NEW.authority_digest
			FOR UPDATE;
			SELECT * INTO registration_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND registration_request_digest=resource_row.registration_request_digest FOR SHARE;
			SELECT * INTO claim_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.cleanup_claim_authority_receipt_digest
			FOR SHARE;
			SELECT * INTO root_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
			WHERE namespace_id=NEW.namespace_id AND root_digest=NEW.read_lease_ledger_root_digest
			FOR SHARE;
			SELECT * INTO fence_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences
			WHERE namespace_id=NEW.namespace_id AND fence_digest=NEW.run_terminal_fence_digest
			FOR SHARE;
			prior_state:=agent_evaluation_hosted_runtime_active_state_by_digest(
				NEW.namespace_id,NEW.plan_digest,NEW.repository_commit,NEW.authority_digest,
				NEW.prior_active_state_digest
			);
			expected_not_before:=GREATEST(
				NEW.requested_at,(prior_state->>'readLeaseNotAfter')::timestamptz
			);
			IF resource_row.authority_digest IS NULL OR claim_row.receipt_digest IS NULL
				OR root_row.root_digest IS NULL OR fence_row.fence_digest IS NULL OR prior_state IS NULL
				OR claim_row.expected_active_state_digest<>NEW.prior_active_state_digest
				OR claim_row.plan_digest<>NEW.plan_digest
				OR claim_row.repository_commit<>NEW.repository_commit
				OR claim_row.authority_digest<>NEW.authority_digest
				OR claim_row.receipt_digest<>NEW.cleanup_claim_authority_receipt_digest
				OR claim_row.cleanup_owner_instance_id<>NEW.cleanup_owner_instance_id
				OR claim_row.claim_generation<>NEW.claim_generation
				OR NEW.requested_at<claim_row.claimed_at OR NEW.requested_at>=claim_row.claim_expires_at
				OR registration_row.deletion_authority_receipt_digest<>
					NEW.deletion_authority_receipt_digest
				OR resource_row.resource_set_commitment_digest<>
					NEW.resource_set_commitment_digest
				OR root_row.plan_digest<>NEW.plan_digest OR root_row.repository_commit<>NEW.repository_commit
				OR root_row.authority_digest<>NEW.authority_digest
				OR root_row.resource_set_commitment_digest<>NEW.resource_set_commitment_digest
				OR root_row.last_expires_at IS DISTINCT FROM
					(prior_state->>'readLeaseNotAfter')::timestamptz
				OR root_row.sealed_at>NEW.requested_at
				OR fence_row.plan_digest<>NEW.plan_digest OR fence_row.repository_commit<>NEW.repository_commit
				OR fence_row.runtime_resource_set_id<>resource_row.runtime_resource_set_id
				OR fence_row.sealed_at>NEW.requested_at
				OR NEW.deletion_not_before<>expected_not_before
				OR ((NEW.cleanup_reason='expired')<>(NEW.overdue_receipt_digest IS NOT NULL))
				OR (NEW.overdue_receipt_digest IS NOT NULL AND NOT EXISTS (
					SELECT 1 FROM agent_evaluation_hosted_retrieval_runtime_resource_overdue_receipts overdue
					WHERE overdue.namespace_id=NEW.namespace_id
						AND overdue.plan_digest=NEW.plan_digest
						AND overdue.repository_commit=NEW.repository_commit
						AND overdue.authority_digest=NEW.authority_digest
						AND overdue.receipt_digest=NEW.overdue_receipt_digest
						AND overdue.detected_at<=NEW.requested_at
				))
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>25
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','repositoryCommit','planDigest','frozenRunDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','authorityDigest',
					'resourceSetCommitmentDigest','readLeaseLedgerRootDigest',
					'cleanupClaimAuthorityReceiptDigest','deletionAuthorityReceiptDigest',
					'cleanupOwnerInstanceId','claimGeneration','priorActiveState',
					'priorActiveStateDigest','claimedLifecycle','runTerminalFence',
					'runTerminalFenceDigest','cleanupReason','overdueReceiptDigest',
					'requestedAt','deletionNotBefore','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.request_json->>'planDigest'<>NEW.plan_digest
				OR NEW.request_json->>'frozenRunDigest'<>fence_row.fence_json->>'frozenRunDigest'
				OR NEW.request_json->>'runConfigArtifactBindingDigest'<>
					fence_row.fence_json->>'runConfigArtifactBindingDigest'
				OR NEW.request_json->>'runtimeResourceSetId'<>resource_row.runtime_resource_set_id
				OR NEW.request_json->>'authorityDigest'<>NEW.authority_digest
				OR NEW.request_json->>'resourceSetCommitmentDigest'<>
					NEW.resource_set_commitment_digest
				OR NEW.request_json->>'readLeaseLedgerRootDigest'<>
					NEW.read_lease_ledger_root_digest
				OR NEW.request_json->>'cleanupClaimAuthorityReceiptDigest'<>
					NEW.cleanup_claim_authority_receipt_digest
				OR NEW.request_json->>'deletionAuthorityReceiptDigest'<>
					NEW.deletion_authority_receipt_digest
				OR NEW.request_json->>'cleanupOwnerInstanceId'<>NEW.cleanup_owner_instance_id
				OR (NEW.request_json->>'claimGeneration')::bigint<>NEW.claim_generation
				OR NEW.request_json->'priorActiveState'<>prior_state
				OR NEW.request_json->>'priorActiveStateDigest'<>NEW.prior_active_state_digest
				OR NEW.request_json->>'claimedLifecycle'<>'cleanup-in-progress'
				OR NEW.request_json->'runTerminalFence'<>fence_row.fence_json
				OR NEW.request_json->>'runTerminalFenceDigest'<>NEW.run_terminal_fence_digest
				OR NEW.request_json->>'cleanupReason'<>NEW.cleanup_reason
				OR NEW.request_json->>'overdueReceiptDigest' IS DISTINCT FROM NEW.overdue_receipt_digest
				OR (NEW.request_json->>'requestedAt')::timestamptz<>NEW.requested_at
				OR (NEW.request_json->>'deletionNotBefore')::timestamptz<>NEW.deletion_not_before THEN
				RAISE EXCEPTION 'hosted runtime cleanup request drifted from durable claim, lease, or fence'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_requests_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_cleanup_request()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_requests_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_cleanup_requests_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_hosted_runtime_resource_state()
			RETURNS trigger AS $$
		DECLARE
			claimed_state JSONB;
			claimed_owner_instance_id TEXT;
			claimed_generation BIGINT;
			terminal_state JSONB;
		BEGIN
			IF NEW.lifecycle='active' THEN
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_hosted_retrieval_runtime_resource_read_receipts receipt
					WHERE receipt.namespace_id=NEW.namespace_id AND receipt.plan_digest=NEW.plan_digest
						AND receipt.repository_commit=NEW.repository_commit
						AND receipt.authority_digest=NEW.authority_digest
						AND receipt.active_state_digest=NEW.current_state_digest
						AND receipt.receipt_json->'activeState'=NEW.current_state_json
						AND receipt.checked_at=NEW.current_state_updated_at
				) AND NEW.current_state_digest<>NEW.stored_active_state_digest THEN
					RAISE EXCEPTION 'hosted runtime active state update lacks its read receipt'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.lifecycle='cleanup-in-progress' THEN
				SELECT jsonb_build_object(
					'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claimed-state',
					'version',1,'authorityDigest',NEW.authority_digest,
					'resourceSetCommitmentDigest',NEW.resource_set_commitment_digest,
					'cleanupOwnerInstanceId',claim.cleanup_owner_instance_id,
					'claimGeneration',claim.claim_generation,'claimedAt',claim.receipt_json->'claimedAt',
					'lifecycle','cleanup-in-progress'
				),claim.cleanup_owner_instance_id,claim.claim_generation
				INTO claimed_state,claimed_owner_instance_id,claimed_generation
				FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts outer_claim
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claims claim
				  ON claim.namespace_id=outer_claim.namespace_id
				 AND claim.receipt_digest=outer_claim.cleanup_claim_authority_receipt_digest
				JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests request
				  ON request.namespace_id=outer_claim.namespace_id
				 AND request.request_digest=outer_claim.cleanup_request_digest
				WHERE outer_claim.namespace_id=NEW.namespace_id
					AND outer_claim.plan_digest=NEW.plan_digest
					AND outer_claim.repository_commit=NEW.repository_commit
					AND outer_claim.authority_digest=NEW.authority_digest
					AND outer_claim.receipt_digest=NEW.current_cleanup_claim_receipt_digest
					AND outer_claim.cleanup_request_digest=NEW.cleanup_request_digest
					AND request.cleanup_claim_authority_receipt_digest=claim.receipt_digest;
				IF claimed_state IS NULL
					OR NEW.active_owner_instance_id<>claimed_owner_instance_id
					OR NEW.claim_generation<>claimed_generation
					OR agent_evaluation_canonical_jsonb_digest(claimed_state)<>NEW.current_state_digest
					OR claimed_state<>NEW.current_state_json THEN
					RAISE EXCEPTION 'hosted runtime cleanup claim was not atomically committed'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.lifecycle='cleaned' THEN
				SELECT jsonb_build_object(
					'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-state',
					'version',1,'authorityDigest',NEW.authority_digest,
					'cleanupRequestDigest',cleanup.cleanup_request_digest,
					'cleanupOwnerInstanceId',cleanup.cleanup_owner_instance_id,
					'claimGeneration',cleanup.claim_generation,
					'readLeaseLedgerRootDigest',cleanup.read_lease_ledger_root_digest,
					'cleanupClaimAuthorityReceiptDigest',cleanup.cleanup_claim_authority_receipt_digest,
					'completedAt',cleanup.cleanup_receipt_json->'completedAt',
					'lifecycle','cleaned','residualProviderResourceIds','[]'::jsonb
				) INTO terminal_state
				FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanups cleanup
				WHERE cleanup.namespace_id=NEW.namespace_id AND cleanup.plan_digest=NEW.plan_digest
					AND cleanup.repository_commit=NEW.repository_commit
					AND cleanup.authority_digest=NEW.authority_digest
					AND cleanup.cleanup_request_digest=NEW.cleanup_request_digest
					AND cleanup.cleanup_receipt_digest=NEW.cleanup_receipt_digest;
				IF terminal_state IS NULL
					OR NOT EXISTS (
						SELECT 1
						FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanups cleanup
						JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts claim_receipt
						  ON claim_receipt.namespace_id=cleanup.namespace_id
						 AND claim_receipt.receipt_digest=NEW.current_cleanup_claim_receipt_digest
						WHERE cleanup.namespace_id=NEW.namespace_id
							AND claim_receipt.cleanup_claim_authority_receipt_digest=
								cleanup.cleanup_claim_authority_receipt_digest
							AND claim_receipt.cleanup_request_digest=cleanup.cleanup_request_digest
							AND cleanup.cleanup_request_digest=NEW.cleanup_request_digest
							AND cleanup.cleanup_receipt_digest=NEW.cleanup_receipt_digest
					)
					OR agent_evaluation_canonical_jsonb_digest(terminal_state)<>NEW.current_state_digest
					OR terminal_state<>NEW.current_state_json THEN
					RAISE EXCEPTION 'hosted runtime cleaned state was not atomically committed'
						USING ERRCODE='23514';
				END IF;
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_resource_state_required
			AFTER UPDATE ON agent_evaluation_hosted_retrieval_runtime_resources
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_resource_state()`,
	}
}
