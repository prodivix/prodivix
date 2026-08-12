package database

func agentEvaluationHostedRetrievalRuntimeResourceDiscoveryConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_registration_set_lookup_request()
			RETURNS trigger AS $$
		DECLARE
			plan_row agent_evaluation_plans%ROWTYPE;
			run_config_frozen_digest TEXT;
			expected_bindings JSONB;
		BEGIN
			SELECT * INTO plan_row
			FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR SHARE;
			SELECT frozen_run_digest INTO run_config_frozen_digest
			FROM agent_evaluation_production_run_config_artifacts
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND binding_digest=NEW.run_config_artifact_binding_digest
			FOR SHARE;
			SELECT jsonb_agg(jsonb_build_object(
				'protocolFamily',target->>'protocolFamily',
				'capabilityProfileId',target->>'capabilityProfileId',
				'registrationIntentDigest',
					target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,hostedRetrievalRuntimeResourceRegistrationIntentDigest}'
			) ORDER BY target->>'protocolFamily' COLLATE "C",target->>'capabilityProfileId' COLLATE "C")
			INTO expected_bindings
			FROM jsonb_array_elements(plan_row.plan_json#>'{value,capabilityQualificationTargets}') target
			WHERE target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,hostedRetrievalRuntimeResourceRegistrationIntentDigest}'
				IS NOT NULL;
			IF plan_row.plan_digest IS NULL
				OR NOT agent_evaluation_hosted_runtime_plan_intent_set_valid(plan_row.plan_json)
				OR run_config_frozen_digest<>NEW.frozen_run_digest
				OR NEW.registration_intent_bindings_json<>expected_bindings
				OR jsonb_typeof(NEW.registration_intent_bindings_json)<>'array'
				OR jsonb_array_length(NEW.registration_intent_bindings_json)<>4
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(NEW.registration_intent_bindings_json) binding
					WHERE jsonb_typeof(binding)<>'object'
						OR agent_evaluation_jsonb_object_key_count(binding)<>3
						OR NOT (binding ?& ARRAY[
							'protocolFamily','capabilityProfileId','registrationIntentDigest'
						])
				) OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>10
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','repositoryCommit','planDigest','frozenRunDigest',
					'runConfigArtifactBindingDigest','registrationIntentBindings','requestedAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-set-lookup-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.request_json->>'planDigest'<>NEW.plan_digest
				OR NEW.request_json->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR NEW.request_json->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR NEW.request_json->'registrationIntentBindings'<>expected_bindings
				OR (NEW.request_json->>'requestedAt')::timestamptz<>NEW.requested_at THEN
				RAISE EXCEPTION 'hosted runtime registration-set lookup request drifted from frozen plan'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lookup_requests_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_registration_set_lookup_request()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lookup_requests_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lookup_requests_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_registration_set_lookup_receipt()
			RETURNS trigger AS $$
		DECLARE
			request_row agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests%ROWTYPE;
			set_row agent_evaluation_hosted_retrieval_runtime_resource_sets%ROWTYPE;
			expected_results JSONB;
			registration_count BIGINT;
			minimum_resource_expires_at TIMESTAMPTZ;
			next_revision BIGINT;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
				chr(31)||'hosted-runtime-registration-set-lookup',0
			));
			SELECT * INTO request_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_requests
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit AND request_digest=NEW.request_digest
			FOR SHARE;
			SELECT * INTO set_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=NEW.runtime_resource_set_id
			FOR SHARE;
			SELECT COUNT(*),jsonb_agg(registration_result_json ORDER BY
				protocol_family COLLATE "C",capability_profile_id COLLATE "C"),MIN(expires_at)
			INTO registration_count,expected_results,minimum_resource_expires_at
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=NEW.runtime_resource_set_id;
			SELECT COALESCE(MAX(lookup_ledger_revision),0)+1 INTO next_revision
			FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit;
			IF request_row.request_digest IS NULL OR set_row.authority_set_digest IS NULL
				OR registration_count<>4 OR NEW.lookup_ledger_revision<>next_revision
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>18
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','requestDigest','namespaceId','repositoryCommit','planDigest',
					'frozenRunDigest','runConfigArtifactBindingDigest','runtimeResourceSetId',
					'lookupAuthorityIssuerId','lookupAuthorityImplementationDigest','lookupLedgerRevision',
					'registrationResults','authoritySet','resourceSetCommitment','checkedAt','expiresAt',
					'receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-set-lookup-receipt'
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
				OR NEW.receipt_json->>'lookupAuthorityIssuerId'<>NEW.lookup_authority_issuer_id
				OR NEW.receipt_json->>'lookupAuthorityImplementationDigest'<>
					NEW.lookup_authority_implementation_digest
				OR (NEW.receipt_json->>'lookupLedgerRevision')::bigint<>NEW.lookup_ledger_revision
				OR NEW.receipt_json->'registrationResults'<>expected_results
				OR NEW.receipt_json->'authoritySet'<>set_row.authority_set_json
				OR NEW.receipt_json->'resourceSetCommitment'<>set_row.resource_set_commitment_json
				OR (NEW.receipt_json->>'checkedAt')::timestamptz<>NEW.checked_at
				OR (NEW.receipt_json->>'expiresAt')::timestamptz<>NEW.expires_at
				OR NEW.checked_at<request_row.requested_at
				OR NEW.expires_at>minimum_resource_expires_at THEN
				RAISE EXCEPTION 'hosted runtime registration-set lookup receipt was not rederived from exact4'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lookup_receipts_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_registration_set_lookup_receipt()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lookup_receipts_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lookup_receipts_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_registration_set_lookup_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
	}
}
