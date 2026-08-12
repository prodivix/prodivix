package database

func agentEvaluationHostedRetrievalRuntimeResourceFenceConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_overdue_receipt()
			RETURNS trigger AS $$
		DECLARE
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
		BEGIN
			SELECT * INTO resource_row
			FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND authority_digest=NEW.authority_digest
			FOR SHARE;
			IF NOT FOUND OR NEW.resource_expires_at<>resource_row.resource_expires_at
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>12
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','planDigest','runConfigArtifactBindingDigest',
					'runtimeResourceSetId','authorityDigest','providerResourceKind',
					'providerResourceId','resourceExpiresAt','detectedAt','disposition','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-overdue-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.receipt_json-'receiptDigest')<>
					NEW.receipt_digest
				OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest
				OR NEW.receipt_json->>'planDigest'<>NEW.plan_digest
				OR NEW.receipt_json->>'runtimeResourceSetId'<>resource_row.runtime_resource_set_id
				OR NEW.receipt_json->>'authorityDigest'<>NEW.authority_digest
				OR NEW.receipt_json->>'providerResourceKind'<>resource_row.provider_resource_kind
				OR NEW.receipt_json->>'providerResourceId'<>resource_row.provider_resource_id
				OR (NEW.receipt_json->>'resourceExpiresAt')::timestamptz<>NEW.resource_expires_at
				OR (NEW.receipt_json->>'detectedAt')::timestamptz<>NEW.detected_at
				OR NEW.receipt_json->>'disposition'<>'cleanup-required' THEN
				RAISE EXCEPTION 'hosted runtime overdue receipt drifted from durable resource'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_overdue_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_overdue_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_overdue_receipt()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_overdue_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_overdue_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_terminal_fence()
			RETURNS trigger AS $$
		DECLARE
			plan_row agent_evaluation_plans%ROWTYPE;
			set_row agent_evaluation_hosted_retrieval_runtime_resource_sets%ROWTYPE;
			expected_shard_ids JSONB;
			expected_shard_count BIGINT;
			shard_record JSONB;
			current_shard_id TEXT;
			checkpoint_generation BIGINT;
			checkpoint_revision BIGINT;
			checkpoint_digest TEXT;
			checkpoint_updated_at TIMESTAMPTZ;
			checkpoint_json JSONB;
			attempt_count BIGINT;
			attempt_ids JSONB;
			terminal_attempts JSONB;
			attempt_rows_valid BOOLEAN;
			expected_attempt_id_set_digest TEXT;
			expected_attempt_result_set_digest TEXT;
			expected_terminal_at TIMESTAMPTZ;
			expected_shard_outcome TEXT;
			expected_global_outcome TEXT:='completed';
			expected_all_terminal_at TIMESTAMPTZ;
			shard_attempt_sets JSONB;
			shard_generations JSONB;
			terminal_records JSONB;
			terminal_shard_distinct_count BIGINT;
			total_attempt_count BIGINT;
		BEGIN
			SELECT * INTO plan_row
			FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR SHARE;
			SELECT * INTO set_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=NEW.runtime_resource_set_id
			FOR SHARE;
			SELECT COUNT(*),jsonb_agg(to_jsonb(shard_id) ORDER BY shard_id COLLATE "C")
			INTO expected_shard_count,expected_shard_ids
			FROM (
				SELECT DISTINCT 'evaluation-shard:'||substring(
					agent_evaluation_canonical_jsonb_digest(jsonb_build_object('targetId',target->>'targetId'))
					FROM 8
				) AS shard_id
				FROM jsonb_array_elements(plan_row.plan_json#>'{value,capabilityQualificationTargets}') target
			) shards;
			SELECT COUNT(DISTINCT value->>'shardId')
			INTO terminal_shard_distinct_count
			FROM jsonb_array_elements(NEW.terminal_shard_records_json) member(value);
			SELECT COUNT(*) INTO total_attempt_count
			FROM agent_evaluation_attempts attempt
			WHERE attempt.namespace_id=NEW.namespace_id AND attempt.plan_digest=NEW.plan_digest;
			IF plan_row.plan_digest IS NULL OR set_row.authority_set_digest IS NULL
				OR expected_shard_count NOT BETWEEN 1 AND 1024
				OR NEW.expected_shard_count<>expected_shard_count
				OR NEW.terminal_shard_count<>expected_shard_count
				OR NEW.expected_shard_ids_json<>expected_shard_ids
				OR jsonb_typeof(NEW.terminal_shard_records_json)<>'array'
				OR jsonb_array_length(NEW.terminal_shard_records_json)<>expected_shard_count
				OR terminal_shard_distinct_count<>expected_shard_count
				OR total_attempt_count<>plan_row.planned_journey_count
				OR EXISTS (
					SELECT 1 FROM agent_evaluation_attempts attempt
					WHERE attempt.namespace_id=NEW.namespace_id
						AND attempt.plan_digest=NEW.plan_digest
						AND NOT (expected_shard_ids ? attempt.shard_id)
				) THEN
				RAISE EXCEPTION 'hosted runtime terminal fence shard set drifted from frozen plan'
					USING ERRCODE='23514';
			END IF;

			FOR shard_record IN
				SELECT value FROM jsonb_array_elements(NEW.terminal_shard_records_json)
					WITH ORDINALITY member(value,ordinality)
				ORDER BY value->>'shardId' COLLATE "C"
			LOOP
				current_shard_id:=shard_record->>'shardId';
				IF jsonb_typeof(shard_record)<>'object'
					OR agent_evaluation_jsonb_object_key_count(shard_record)<>9
					OR NOT (shard_record ?& ARRAY[
						'shardId','shardLeaseGeneration','checkpointDigest','terminalAttemptCount',
						'terminalAttemptIdSetDigest','terminalAttemptResultSetDigest',
						'terminalOutcome','terminalAt','terminalRecordDigest'
					])
					OR NOT (expected_shard_ids ? current_shard_id)
					OR agent_evaluation_canonical_jsonb_digest(shard_record-'terminalRecordDigest')<>
						shard_record->>'terminalRecordDigest' THEN
					RAISE EXCEPTION 'hosted runtime terminal shard record is not canonical'
						USING ERRCODE='23514';
				END IF;
				SELECT agent_evaluation_checkpoints.lease_generation,
					agent_evaluation_checkpoints.revision,
					agent_evaluation_checkpoints.checkpoint_digest,
					agent_evaluation_checkpoints.updated_at,
					agent_evaluation_checkpoints.checkpoint_json
				INTO checkpoint_generation,checkpoint_revision,checkpoint_digest,
					checkpoint_updated_at,checkpoint_json
				FROM agent_evaluation_checkpoints
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND agent_evaluation_checkpoints.shard_id=current_shard_id AND state='completed'
				ORDER BY revision DESC LIMIT 1 FOR SHARE;
				SELECT COUNT(*),
					jsonb_agg(to_jsonb(attempt_id) ORDER BY attempt_id COLLATE "C"),
					jsonb_agg(jsonb_build_object(
						'attemptId',attempt_id,'attemptDigest',attempt_digest,'status',status,
						'completedAt',attempt_json#>'{value,completedAt}'
					) ORDER BY attempt_id COLLATE "C"),
					MAX(completed_at),
					CASE WHEN bool_or(status NOT IN ('completed','cancelled')) THEN 'failed'
						WHEN bool_or(status='cancelled') THEN 'cancelled' ELSE 'completed' END,
					BOOL_AND(
						jsonb_typeof(attempt_json)='object'
						AND attempt_json#>>'{value,descriptor,attemptId}'=attempt_id
						AND attempt_json#>>'{value,descriptor,descriptorDigest}'=descriptor_digest
						AND attempt_json#>>'{value,descriptor,shardId}'=shard_id
						AND attempt_json#>>'{value,attemptDigest}'=attempt_digest
						AND attempt_json#>>'{value,status}'=status
						AND (attempt_json#>>'{value,completedAt}')::timestamptz=completed_at
						AND shard_id='evaluation-shard:'||substring(
							agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
								'targetId',attempt_json#>>'{value,descriptor,targetId}'
							)) FROM 8
						)
						AND EXISTS (
							SELECT 1
							FROM jsonb_array_elements(
								plan_row.plan_json#>'{value,capabilityQualificationTargets}'
							) target
							WHERE target->>'targetId'=
								attempt_json#>>'{value,descriptor,targetId}'
						)
					)
				INTO attempt_count,attempt_ids,terminal_attempts,expected_terminal_at,
					expected_shard_outcome,attempt_rows_valid
				FROM agent_evaluation_attempts attempt
				WHERE attempt.namespace_id=NEW.namespace_id AND attempt.plan_digest=NEW.plan_digest
					AND attempt.shard_id=current_shard_id;
				expected_terminal_at:=GREATEST(checkpoint_updated_at,expected_terminal_at);
				expected_attempt_id_set_digest:=agent_evaluation_canonical_jsonb_digest(
					jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-attempt-id-set',
						'version',1,'shardId',current_shard_id,'attemptIds',attempt_ids
					)
				);
				expected_attempt_result_set_digest:=agent_evaluation_canonical_jsonb_digest(
					jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-attempt-result-set',
						'version',1,'shardId',current_shard_id,'terminalAttempts',terminal_attempts
					)
				);
				IF checkpoint_digest IS NULL OR checkpoint_generation<1
					OR checkpoint_json#>>'{value,planDigest}'<>NEW.plan_digest
					OR checkpoint_json#>>'{value,shardId}'<>current_shard_id
					OR (checkpoint_json#>>'{value,revision}')::bigint<>checkpoint_revision
					OR (checkpoint_json#>>'{value,leaseGeneration}')::bigint<>checkpoint_generation
					OR checkpoint_json#>>'{value,state}'<>'completed'
					OR checkpoint_json#>>'{value,checkpointDigest}'<>checkpoint_digest
					OR (checkpoint_json#>>'{value,updatedAt}')::timestamptz<>checkpoint_updated_at
					OR attempt_count<1 OR NOT COALESCE(attempt_rows_valid,FALSE)
					OR (shard_record->>'shardLeaseGeneration')::bigint<>checkpoint_generation
					OR shard_record->>'checkpointDigest'<>checkpoint_digest
					OR (shard_record->>'terminalAttemptCount')::bigint<>attempt_count
					OR shard_record->>'terminalAttemptIdSetDigest'<>expected_attempt_id_set_digest
					OR shard_record->>'terminalAttemptResultSetDigest'<>expected_attempt_result_set_digest
					OR shard_record->>'terminalOutcome'<>expected_shard_outcome
					OR (shard_record->>'terminalAt')::timestamptz<>expected_terminal_at THEN
					RAISE EXCEPTION 'hosted runtime terminal shard record drifted from checkpoint or attempts'
						USING ERRCODE='23514';
				END IF;
				IF expected_shard_outcome='failed' THEN expected_global_outcome:='failed';
				ELSIF expected_shard_outcome='cancelled' AND expected_global_outcome='completed' THEN
					expected_global_outcome:='cancelled';
				END IF;
				expected_all_terminal_at:=GREATEST(expected_all_terminal_at,expected_terminal_at);
			END LOOP;
			SELECT jsonb_agg(jsonb_build_object(
				'shardId',value->>'shardId',
				'terminalAttemptCount',(value->>'terminalAttemptCount')::bigint,
				'terminalAttemptIdSetDigest',value->>'terminalAttemptIdSetDigest'
			) ORDER BY value->>'shardId' COLLATE "C"),
			jsonb_agg(jsonb_build_object(
				'shardId',value->>'shardId',
				'shardLeaseGeneration',(value->>'shardLeaseGeneration')::bigint
			) ORDER BY value->>'shardId' COLLATE "C"),
			jsonb_agg(value ORDER BY value->>'shardId' COLLATE "C")
			INTO shard_attempt_sets,shard_generations,terminal_records
			FROM jsonb_array_elements(NEW.terminal_shard_records_json) member(value);
			IF NEW.terminal_shard_records_json<>terminal_records
				OR NEW.fence_id<>'hosted-runtime-terminal-fence.'||substring(NEW.plan_digest FROM 8)
				OR NEW.fence_authority_issuer_id<>
					'authority.prodivix.hosted-retrieval-runtime-terminal-ledger'
				OR NEW.fence_authority_implementation_digest<>
					agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-fence-implementation',
						'version',1,
						'fenceAuthorityIssuerId',
							'authority.prodivix.hosted-retrieval-runtime-terminal-ledger'
					))
				OR NEW.fence_ledger_revision<>1
				OR NEW.terminal_shard_id_set_digest<>agent_evaluation_canonical_jsonb_digest(
					jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-id-set',
						'version',1,'shardIds',expected_shard_ids
					))
				OR NEW.terminal_attempt_id_set_digest<>agent_evaluation_canonical_jsonb_digest(
					jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-attempt-id-set',
						'version',1,'shardAttemptSets',shard_attempt_sets
					))
				OR NEW.terminal_shard_lease_generation_set_digest<>
					agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-lease-generation-set',
						'version',1,'generations',shard_generations))
				OR NEW.terminal_shard_result_set_digest<>agent_evaluation_canonical_jsonb_digest(
					jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-result-set',
						'version',1,'terminalShardRecords',terminal_records))
				OR NEW.terminal_outcome<>expected_global_outcome
				OR NEW.all_shards_terminal_at<>expected_all_terminal_at
				OR jsonb_typeof(NEW.fence_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.fence_json)<>22
				OR NOT (NEW.fence_json ?& ARRAY[
					'format','version','fenceId','fenceAuthorityIssuerId',
					'fenceAuthorityImplementationDigest','fenceLedgerRevision','namespaceId',
					'repositoryCommit','planDigest','frozenRunDigest','runConfigArtifactBindingDigest',
					'runtimeResourceSetId','expectedShardCount','terminalShardCount',
					'terminalShardIdSetDigest','terminalAttemptIdSetDigest',
					'terminalShardLeaseGenerationSetDigest','terminalShardResultSetDigest',
					'terminalOutcome','allShardsTerminalAt','sealedAt','fenceDigest'
				])
				OR NEW.fence_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-run-terminal-fence'
				OR (NEW.fence_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.fence_json-'fenceDigest')<>NEW.fence_digest
				OR NEW.fence_json->>'fenceDigest'<>NEW.fence_digest
				OR NEW.fence_json->>'fenceId'<>NEW.fence_id
				OR NEW.fence_json->>'fenceAuthorityIssuerId'<>NEW.fence_authority_issuer_id
				OR NEW.fence_json->>'fenceAuthorityImplementationDigest'<>
					NEW.fence_authority_implementation_digest
				OR (NEW.fence_json->>'fenceLedgerRevision')::bigint<>NEW.fence_ledger_revision
				OR NEW.fence_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.fence_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.fence_json->>'planDigest'<>NEW.plan_digest
				OR NEW.fence_json->>'frozenRunDigest'<>set_row.frozen_run_digest
				OR NEW.fence_json->>'runConfigArtifactBindingDigest'<>
					set_row.run_config_artifact_binding_digest
				OR NEW.fence_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR (NEW.fence_json->>'expectedShardCount')::bigint<>NEW.expected_shard_count
				OR (NEW.fence_json->>'terminalShardCount')::bigint<>NEW.terminal_shard_count
				OR NEW.fence_json->>'terminalShardIdSetDigest'<>NEW.terminal_shard_id_set_digest
				OR NEW.fence_json->>'terminalAttemptIdSetDigest'<>NEW.terminal_attempt_id_set_digest
				OR NEW.fence_json->>'terminalShardLeaseGenerationSetDigest'<>
					NEW.terminal_shard_lease_generation_set_digest
				OR NEW.fence_json->>'terminalShardResultSetDigest'<>
					NEW.terminal_shard_result_set_digest
				OR NEW.fence_json->>'terminalOutcome'<>NEW.terminal_outcome
				OR (NEW.fence_json->>'allShardsTerminalAt')::timestamptz<>NEW.all_shards_terminal_at
				OR (NEW.fence_json->>'sealedAt')::timestamptz<>NEW.sealed_at THEN
				RAISE EXCEPTION 'hosted runtime terminal fence was not derived from durable terminal ledgers'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_terminal_fences_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_terminal_fence()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_terminal_fences_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_terminal_fences_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
	}
}
