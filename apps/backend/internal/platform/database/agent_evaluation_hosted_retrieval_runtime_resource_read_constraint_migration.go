package database

// agentEvaluationHostedRetrievalRuntimeResourceReadConstraintStatements binds
// every read lease to the current durable resource state and derives ledger
// roots exclusively from stored read receipts.
func agentEvaluationHostedRetrievalRuntimeResourceReadConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_read()
			RETURNS trigger AS $$
		DECLARE
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			set_row agent_evaluation_hosted_retrieval_runtime_resource_sets%ROWTYPE;
			request_record JSONB;
			receipt_record JSONB;
			active_state JSONB;
			next_revision BIGINT;
			minimum_expires_at TIMESTAMPTZ;
		BEGIN
			request_record:=NEW.request_json;
			receipt_record:=NEW.receipt_json;
			active_state:=receipt_record->'activeState';
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
					chr(31)||NEW.authority_digest||chr(31)||'hosted-runtime-read',0
			));
			IF EXISTS (
				SELECT 1
				FROM agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots root
				WHERE root.namespace_id=NEW.namespace_id AND root.plan_digest=NEW.plan_digest
					AND root.repository_commit=NEW.repository_commit
					AND root.authority_digest=NEW.authority_digest
			) THEN
				RAISE EXCEPTION 'hosted runtime read ledger is already sealed'
					USING ERRCODE='23514';
			END IF;
			SELECT * INTO resource_row
			FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND authority_digest=NEW.authority_digest
			FOR UPDATE;
			SELECT * INTO set_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=resource_row.runtime_resource_set_id
			FOR SHARE;
			SELECT COALESCE(MAX(ledger_revision),0)+1 INTO next_revision
			FROM agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND authority_digest=NEW.authority_digest;
			IF NOT FOUND OR resource_row.lifecycle<>'active'
				OR resource_row.active_owner_instance_id<>NEW.active_owner_instance_id
				OR resource_row.claim_generation<>NEW.claim_generation
				OR NEW.ledger_revision<>next_revision THEN
				RAISE EXCEPTION 'hosted runtime read lost its active resource CAS'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(request_record)<>'object'
				OR agent_evaluation_jsonb_object_key_count(request_record)<>13
				OR NOT (request_record ?& ARRAY[
					'format','version','namespaceId','repositoryCommit','planDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','authorityDigest',
					'resourceSetCommitmentDigest','readerOwnerInstanceId','readLeaseId',
					'minimumExpiresAt','requestDigest'
				])
				OR request_record->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-request'
				OR (request_record->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(request_record-'requestDigest')<>
					NEW.request_digest
				OR request_record->>'requestDigest'<>NEW.request_digest
				OR request_record->>'namespaceId'<>NEW.namespace_id
				OR request_record->>'repositoryCommit'<>NEW.repository_commit
				OR request_record->>'planDigest'<>NEW.plan_digest
				OR request_record->>'runConfigArtifactBindingDigest'<>
					set_row.run_config_artifact_binding_digest
				OR request_record->>'runtimeResourceSetId'<>resource_row.runtime_resource_set_id
				OR request_record->>'authorityDigest'<>NEW.authority_digest
				OR request_record->>'resourceSetCommitmentDigest'<>
					resource_row.resource_set_commitment_digest
				OR request_record->>'readerOwnerInstanceId'<>NEW.reader_owner_instance_id
				OR request_record->>'readLeaseId'<>NEW.read_lease_id THEN
				RAISE EXCEPTION 'hosted runtime read request canonical record drifted'
					USING ERRCODE='23514';
			END IF;
			minimum_expires_at:=(request_record->>'minimumExpiresAt')::timestamptz;
			IF jsonb_typeof(receipt_record)<>'object'
				OR agent_evaluation_jsonb_object_key_count(receipt_record)<>17
				OR NOT (receipt_record ?& ARRAY[
					'format','version','readRequestDigest','planDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','authorityDigest',
					'resourceSetCommitmentDigest','readLeaseId','activeOwnerInstanceId',
					'claimGeneration','activeState','activeStateDigest','lifecycle','checkedAt',
					'expiresAt','receiptDigest'
				])
				OR receipt_record->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-receipt'
				OR (receipt_record->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(receipt_record-'receiptDigest')<>
					NEW.receipt_digest
				OR receipt_record->>'receiptDigest'<>NEW.receipt_digest
				OR receipt_record->>'readRequestDigest'<>NEW.request_digest
				OR receipt_record->>'planDigest'<>NEW.plan_digest
				OR receipt_record->>'runConfigArtifactBindingDigest'<>
					request_record->>'runConfigArtifactBindingDigest'
				OR receipt_record->>'runtimeResourceSetId'<>resource_row.runtime_resource_set_id
				OR receipt_record->>'authorityDigest'<>NEW.authority_digest
				OR receipt_record->>'resourceSetCommitmentDigest'<>
					resource_row.resource_set_commitment_digest
				OR receipt_record->>'readLeaseId'<>NEW.read_lease_id
				OR receipt_record->>'activeOwnerInstanceId'<>NEW.active_owner_instance_id
				OR (receipt_record->>'claimGeneration')::bigint<>NEW.claim_generation
				OR receipt_record->>'activeStateDigest'<>NEW.active_state_digest
				OR receipt_record->>'lifecycle'<>'active'
				OR (receipt_record->>'checkedAt')::timestamptz<>NEW.checked_at
				OR (receipt_record->>'expiresAt')::timestamptz<>NEW.expires_at
				OR jsonb_typeof(active_state)<>'object'
				OR agent_evaluation_jsonb_object_key_count(active_state)<>10
				OR NOT (active_state ?& ARRAY[
					'format','version','authorityDigest','resourceSetCommitmentDigest',
					'activeOwnerInstanceId','claimGeneration','lifecycle','readLeaseNotAfter',
					'updatedAt','stateDigest'
				])
				OR active_state->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-active-state'
				OR (active_state->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(active_state-'stateDigest')<>
					NEW.active_state_digest
				OR active_state->>'stateDigest'<>NEW.active_state_digest
				OR active_state->>'authorityDigest'<>NEW.authority_digest
				OR active_state->>'resourceSetCommitmentDigest'<>
					resource_row.resource_set_commitment_digest
				OR active_state->>'activeOwnerInstanceId'<>NEW.active_owner_instance_id
				OR (active_state->>'claimGeneration')::bigint<>NEW.claim_generation
				OR active_state->>'lifecycle'<>'active'
				OR (active_state->>'readLeaseNotAfter')::timestamptz<>NEW.expires_at
				OR (active_state->>'updatedAt')::timestamptz<>NEW.checked_at
				OR NEW.checked_at<resource_row.current_state_updated_at
				OR NEW.expires_at<minimum_expires_at
				OR NEW.expires_at<NEW.checked_at+INTERVAL '155 seconds'
				OR NEW.expires_at>resource_row.resource_expires_at THEN
				RAISE EXCEPTION 'hosted runtime read receipt canonical record drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_reads_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_read()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_reads_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_reads_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_hosted_runtime_read_state()
			RETURNS trigger AS $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_hosted_retrieval_runtime_resources resource
				WHERE resource.namespace_id=NEW.namespace_id
					AND resource.plan_digest=NEW.plan_digest
					AND resource.repository_commit=NEW.repository_commit
					AND resource.authority_digest=NEW.authority_digest
					AND resource.lifecycle='active'
					AND resource.active_owner_instance_id=NEW.active_owner_instance_id
					AND resource.claim_generation=NEW.claim_generation
					AND resource.read_lease_not_after=NEW.expires_at
					AND resource.current_state_digest=NEW.active_state_digest
					AND resource.current_state_json=NEW.receipt_json->'activeState'
					AND resource.current_state_bytes=convert_to(
						agent_evaluation_canonical_jsonb_text(NEW.receipt_json->'activeState'),'UTF8')
					AND resource.current_state_updated_at=NEW.checked_at
			) THEN
				RAISE EXCEPTION 'hosted runtime read was not atomically committed to current state'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_hosted_runtime_read_state_required
			AFTER INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_hosted_runtime_read_state()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_read_root()
			RETURNS trigger AS $$
		DECLARE
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			set_row agent_evaluation_hosted_retrieval_runtime_resource_sets%ROWTYPE;
			lease_ids JSONB;
			request_digests JSONB;
			receipt_digests JSONB;
			state_digests JSONB;
			expected_count BIGINT;
			expected_min_generation BIGINT;
			expected_max_generation BIGINT;
			expected_first_checked TIMESTAMPTZ;
			expected_last_expires TIMESTAMPTZ;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
					chr(31)||NEW.authority_digest||chr(31)||'hosted-runtime-read',0
			));
			SELECT * INTO resource_row
			FROM agent_evaluation_hosted_retrieval_runtime_resources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND authority_digest=NEW.authority_digest
			FOR SHARE;
			SELECT * INTO set_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=resource_row.runtime_resource_set_id
			FOR SHARE;
			SELECT COUNT(*),MIN(claim_generation),MAX(claim_generation),MIN(checked_at),MAX(expires_at),
				COALESCE(jsonb_agg(to_jsonb(read_lease_id) ORDER BY request_digest COLLATE "C"),'[]'::jsonb),
				COALESCE(jsonb_agg(to_jsonb(request_digest) ORDER BY request_digest COLLATE "C"),'[]'::jsonb),
				COALESCE(jsonb_agg(to_jsonb(receipt_digest) ORDER BY request_digest COLLATE "C"),'[]'::jsonb),
				COALESCE(jsonb_agg(to_jsonb(active_state_digest) ORDER BY request_digest COLLATE "C"),'[]'::jsonb)
			INTO expected_count,expected_min_generation,expected_max_generation,
				expected_first_checked,expected_last_expires,lease_ids,request_digests,
				receipt_digests,state_digests
			FROM agent_evaluation_hosted_retrieval_runtime_resource_read_receipts
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND authority_digest=NEW.authority_digest
				AND ledger_revision<=NEW.ledger_revision;
			IF NOT FOUND OR expected_count<>NEW.read_lease_count
				OR (expected_count=0 AND NEW.ledger_revision<>1)
				OR (expected_count>0 AND NEW.ledger_revision<>expected_count)
				OR NEW.minimum_claim_generation IS DISTINCT FROM expected_min_generation
				OR NEW.maximum_claim_generation IS DISTINCT FROM expected_max_generation
				OR NEW.first_checked_at IS DISTINCT FROM expected_first_checked
				OR NEW.last_expires_at IS DISTINCT FROM expected_last_expires
				OR jsonb_typeof(NEW.root_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.root_json)<>21
				OR NOT (NEW.root_json ?& ARRAY[
					'format','version','ledgerAuthorityIssuerId','ledgerAuthorityImplementationDigest',
					'ledgerRevision','planDigest','runConfigArtifactBindingDigest',
					'runtimeResourceSetId','authorityDigest','resourceSetCommitmentDigest',
					'readLeaseCount','readLeaseIdSetDigest','readRequestDigestSetDigest',
					'readReceiptDigestSetDigest','activeStateDigestSetDigest',
					'minimumClaimGeneration','maximumClaimGeneration','firstCheckedAt',
					'lastExpiresAt','sealedAt','rootDigest'
				])
				OR NEW.root_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-lease-ledger-root'
				OR (NEW.root_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.root_json-'rootDigest')<>NEW.root_digest
				OR NEW.root_json->>'rootDigest'<>NEW.root_digest
				OR (NEW.root_json->>'ledgerRevision')::bigint<>NEW.ledger_revision
				OR NEW.root_json->>'planDigest'<>NEW.plan_digest
				OR NEW.root_json->>'runConfigArtifactBindingDigest'<>
					set_row.run_config_artifact_binding_digest
				OR NEW.root_json->>'runtimeResourceSetId'<>resource_row.runtime_resource_set_id
				OR NEW.root_json->>'authorityDigest'<>NEW.authority_digest
				OR NEW.root_json->>'resourceSetCommitmentDigest'<>NEW.resource_set_commitment_digest
				OR NEW.resource_set_commitment_digest<>resource_row.resource_set_commitment_digest
				OR (NEW.root_json->>'readLeaseCount')::bigint<>NEW.read_lease_count
				OR NEW.root_json->>'readLeaseIdSetDigest'<>
					agent_evaluation_canonical_jsonb_digest(lease_ids)
				OR NEW.root_json->>'readRequestDigestSetDigest'<>
					agent_evaluation_canonical_jsonb_digest(request_digests)
				OR NEW.root_json->>'readReceiptDigestSetDigest'<>
					agent_evaluation_canonical_jsonb_digest(receipt_digests)
				OR NEW.root_json->>'activeStateDigestSetDigest'<>
					agent_evaluation_canonical_jsonb_digest(state_digests)
				OR (NEW.root_json->>'minimumClaimGeneration')::bigint IS DISTINCT FROM
					NEW.minimum_claim_generation
				OR (NEW.root_json->>'maximumClaimGeneration')::bigint IS DISTINCT FROM
					NEW.maximum_claim_generation
				OR (NEW.root_json->>'firstCheckedAt')::timestamptz IS DISTINCT FROM
					NEW.first_checked_at
				OR (NEW.root_json->>'lastExpiresAt')::timestamptz IS DISTINCT FROM NEW.last_expires_at
				OR (NEW.root_json->>'sealedAt')::timestamptz<>NEW.sealed_at
				OR (expected_count>0 AND NEW.sealed_at<expected_last_expires) THEN
				RAISE EXCEPTION 'hosted runtime read ledger root drifted from durable reads'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_read_roots_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_read_root()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_read_roots_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_read_roots_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
	}
}
