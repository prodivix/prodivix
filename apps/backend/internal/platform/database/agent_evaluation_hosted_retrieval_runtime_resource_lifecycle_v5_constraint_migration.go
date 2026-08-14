package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV5ConstraintStatements
// binds the v5 terminal-fence derive and normal post-matrix claim ledgers to
// the frozen plan, the Backend-derived terminal fence and the exact resource.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV5ConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_fence_derive_request()
			RETURNS trigger AS $$
		DECLARE
			set_row ae_hrrr_sets%ROWTYPE;
			expected_shard_ids JSONB;
			expected_shard_count BIGINT;
			expected_shard_id_set_digest TEXT;
		BEGIN
			SELECT * INTO set_row
			FROM ae_hrrr_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=NEW.runtime_resource_set_id
			FOR SHARE;
			SELECT COUNT(*),jsonb_agg(to_jsonb(shard_id) ORDER BY shard_id COLLATE "C")
			INTO expected_shard_count,expected_shard_ids
			FROM (
				SELECT DISTINCT 'evaluation-shard:'||substring(
					agent_evaluation_canonical_jsonb_digest(
						jsonb_build_object('targetId',target->>'targetId')) FROM 8
				) AS shard_id
				FROM agent_evaluation_plans plan,
					jsonb_array_elements(plan.plan_json#>'{value,capabilityQualificationTargets}') target
				WHERE plan.namespace_id=NEW.namespace_id AND plan.plan_digest=NEW.plan_digest
					AND plan.repository_commit=NEW.repository_commit
			) shards;
			expected_shard_id_set_digest:=agent_evaluation_canonical_jsonb_digest(
				jsonb_build_object(
					'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-id-set',
					'version',1,'shardIds',expected_shard_ids
				)
			);
			IF set_row.authority_set_digest IS NULL
				OR NEW.frozen_run_digest<>set_row.frozen_run_digest
				OR NEW.run_config_artifact_binding_digest<>set_row.run_config_artifact_binding_digest
				OR NEW.resource_set_commitment_digest<>set_row.resource_set_commitment_digest
				OR NEW.expected_shard_count<>expected_shard_count
				OR NEW.expected_shard_id_set_digest<>expected_shard_id_set_digest
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>14
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','purpose','repositoryCommit','planDigest',
					'frozenRunDigest','runConfigArtifactBindingDigest','runtimeResourceSetId',
					'resourceSetCommitmentDigest','expectedShardCount','expectedShardIdSetDigest',
					'requestedAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-fence-derive-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.terminal-fence.derive'
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.request_json->>'planDigest'<>NEW.plan_digest
				OR NEW.request_json->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR NEW.request_json->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR NEW.request_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR NEW.request_json->>'resourceSetCommitmentDigest'<>
					NEW.resource_set_commitment_digest
				OR (NEW.request_json->>'expectedShardCount')::bigint<>NEW.expected_shard_count
				OR NEW.request_json->>'expectedShardIdSetDigest'<>NEW.expected_shard_id_set_digest
				OR (NEW.request_json->>'requestedAt')::timestamptz<>NEW.requested_at THEN
				RAISE EXCEPTION 'hosted runtime terminal-fence derive request drifted from frozen plan'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_derive_requests_exact
			BEFORE INSERT ON ae_hrrr_terminal_fence_derive_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_fence_derive_request()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_derive_requests_immutable
			BEFORE UPDATE OR DELETE ON ae_hrrr_terminal_fence_derive_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_derive_requests_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON ae_hrrr_terminal_fence_derive_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_fence_derive_receipt()
			RETURNS trigger AS $$
		DECLARE
			request_row ae_hrrr_terminal_fence_derive_requests%ROWTYPE;
			fence_row ae_hrrr_run_terminal_fences%ROWTYPE;
		BEGIN
			SELECT * INTO request_row
			FROM ae_hrrr_terminal_fence_derive_requests
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND request_digest=NEW.request_digest
			FOR SHARE;
			SELECT * INTO fence_row
			FROM ae_hrrr_run_terminal_fences
			WHERE namespace_id=NEW.namespace_id AND fence_digest=NEW.run_terminal_fence_digest
			FOR SHARE;
			IF request_row.request_digest IS NULL OR fence_row.fence_digest IS NULL
				OR NEW.runtime_resource_set_id<>request_row.runtime_resource_set_id
				OR NEW.resource_set_commitment_digest<>request_row.resource_set_commitment_digest
				OR NEW.expected_shard_count<>request_row.expected_shard_count
				OR NEW.expected_shard_id_set_digest<>request_row.expected_shard_id_set_digest
				OR fence_row.plan_digest<>NEW.plan_digest
				OR fence_row.repository_commit<>NEW.repository_commit
				OR fence_row.runtime_resource_set_id<>NEW.runtime_resource_set_id
				OR fence_row.expected_shard_count<>NEW.expected_shard_count
				OR fence_row.terminal_shard_id_set_digest<>NEW.expected_shard_id_set_digest
				OR fence_row.sealed_at<>NEW.checked_at
				OR NEW.checked_at<request_row.requested_at
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>17
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','requestDigest','namespaceId','repositoryCommit','planDigest',
					'frozenRunDigest','runConfigArtifactBindingDigest','runtimeResourceSetId',
					'resourceSetCommitmentDigest','expectedShardCount','expectedShardIdSetDigest',
					'runTerminalFence','runTerminalFenceDigest','checkedAt','expiresAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-fence-derive-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
				OR NEW.receipt_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.receipt_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.receipt_json->>'planDigest'<>NEW.plan_digest
				OR NEW.receipt_json->>'frozenRunDigest'<>request_row.frozen_run_digest
				OR NEW.receipt_json->>'runConfigArtifactBindingDigest'<>
					request_row.run_config_artifact_binding_digest
				OR NEW.receipt_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR NEW.receipt_json->>'resourceSetCommitmentDigest'<>
					NEW.resource_set_commitment_digest
				OR (NEW.receipt_json->>'expectedShardCount')::bigint<>NEW.expected_shard_count
				OR NEW.receipt_json->>'expectedShardIdSetDigest'<>NEW.expected_shard_id_set_digest
				OR NEW.receipt_json->'runTerminalFence'<>fence_row.fence_json
				OR NEW.receipt_json->>'runTerminalFenceDigest'<>NEW.run_terminal_fence_digest
				OR (NEW.receipt_json->>'checkedAt')::timestamptz<>NEW.checked_at
				OR (NEW.receipt_json->>'expiresAt')::timestamptz<>NEW.expires_at THEN
				RAISE EXCEPTION 'hosted runtime terminal-fence derive receipt drifted from durable fence'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_derive_receipts_exact
			BEFORE INSERT ON ae_hrrr_terminal_fence_derive_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_fence_derive_receipt()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_derive_receipts_immutable
			BEFORE UPDATE OR DELETE ON ae_hrrr_terminal_fence_derive_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_fence_derive_receipts_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON ae_hrrr_terminal_fence_derive_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_hosted_runtime_fence_derive_receipt()
			RETURNS trigger AS $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1
				FROM ae_hrrr_terminal_fence_derive_receipts receipt
				WHERE receipt.namespace_id=NEW.namespace_id
					AND receipt.plan_digest=NEW.plan_digest
					AND receipt.repository_commit=NEW.repository_commit
					AND receipt.request_digest=NEW.request_digest
			) THEN
				RAISE EXCEPTION 'hosted runtime terminal-fence derive request lacks its stored receipt'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_fence_derive_receipt_required
			AFTER INSERT ON ae_hrrr_terminal_fence_derive_requests
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_fence_derive_receipt()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_post_matrix_claim_request()
			RETURNS trigger AS $$
		DECLARE
			derive_row ae_hrrr_terminal_fence_derive_receipts%ROWTYPE;
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			registration_row ae_hrrr_registration_results%ROWTYPE;
		BEGIN
			SELECT * INTO derive_row
			FROM ae_hrrr_terminal_fence_derive_receipts
			WHERE namespace_id=NEW.namespace_id
				AND receipt_digest=NEW.terminal_fence_derive_receipt_digest
			FOR SHARE;
			SELECT * INTO resource_row
			FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND authority_digest=NEW.authority_digest
			FOR SHARE;
			SELECT * INTO registration_row
			FROM ae_hrrr_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND registration_request_digest=resource_row.registration_request_digest
			FOR SHARE;
			IF derive_row.receipt_digest IS NULL OR resource_row.authority_digest IS NULL
				OR registration_row.authority_digest<>NEW.authority_digest
				OR derive_row.plan_digest<>NEW.plan_digest
				OR derive_row.repository_commit<>NEW.repository_commit
				OR derive_row.runtime_resource_set_id<>NEW.runtime_resource_set_id
				OR resource_row.runtime_resource_set_id<>NEW.runtime_resource_set_id
				OR derive_row.resource_set_commitment_digest<>NEW.resource_set_commitment_digest
				OR resource_row.resource_set_commitment_digest<>NEW.resource_set_commitment_digest
				OR NEW.claimed_at<derive_row.checked_at OR NEW.claimed_at>=derive_row.expires_at
				OR NEW.cleanup_owner_instance_id !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>17
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','purpose','repositoryCommit','planDigest',
					'frozenRunDigest','runConfigArtifactBindingDigest','runtimeResourceSetId',
					'authorityDigest','resourceSetCommitmentDigest','terminalFenceDeriveReceipt',
					'terminalFenceDeriveReceiptDigest','cleanupOwnerInstanceId','claimedAt',
					'minimumClaimExpiresAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-post-matrix-cleanup-claim-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.cleanup.post-matrix.claim'
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.request_json->>'planDigest'<>NEW.plan_digest
				OR NEW.request_json->>'frozenRunDigest'<>derive_row.receipt_json->>'frozenRunDigest'
				OR NEW.request_json->>'runConfigArtifactBindingDigest'<>
					derive_row.receipt_json->>'runConfigArtifactBindingDigest'
				OR NEW.request_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR NEW.request_json->>'authorityDigest'<>NEW.authority_digest
				OR NEW.request_json->>'resourceSetCommitmentDigest'<>
					NEW.resource_set_commitment_digest
				OR NEW.request_json->'terminalFenceDeriveReceipt'<>derive_row.receipt_json
				OR NEW.request_json->>'terminalFenceDeriveReceiptDigest'<>
					NEW.terminal_fence_derive_receipt_digest
				OR NEW.request_json->>'cleanupOwnerInstanceId'<>NEW.cleanup_owner_instance_id
				OR (NEW.request_json->>'claimedAt')::timestamptz<>NEW.claimed_at
				OR (NEW.request_json->>'minimumClaimExpiresAt')::timestamptz<>
					NEW.minimum_claim_expires_at THEN
				RAISE EXCEPTION 'hosted runtime post-matrix claim request drifted from durable fence context'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_post_matrix_claim_requests_exact
			BEFORE INSERT ON ae_hrrr_post_matrix_cleanup_claim_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_post_matrix_claim_request()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_post_matrix_claim_requests_immutable
			BEFORE UPDATE OR DELETE ON ae_hrrr_post_matrix_cleanup_claim_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_post_matrix_claim_requests_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON ae_hrrr_post_matrix_cleanup_claim_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
	}
}
