package database

func agentEvaluationHostedRetrievalRuntimeResourceRegistrationStageConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_registration_stage()
			RETURNS trigger AS $$
		DECLARE
			request_record JSONB:=NEW.request_json;
			intent JSONB:=NEW.request_json->'registrationIntent';
			budget JSONB:=NEW.request_json->'budgetReservationAuthority';
			network JSONB:=NEW.request_json->'networkPolicyAuthority';
			plan_row agent_evaluation_plans%ROWTYPE;
			run_config_frozen_digest TEXT;
			budget_ledger_revision BIGINT;
			budget_demand_digest TEXT;
			budget_demand_bytes BYTEA;
			budget_reserved_at TIMESTAMPTZ;
			budget_settlement_exists BOOLEAN;
			matching_target_count BIGINT;
			staged_count BIGINT;
			existing_set_id TEXT;
			expected_reservation_id TEXT;
		BEGIN
			expected_reservation_id:='hosted-runtime-budget.'||substring(
				agent_evaluation_canonical_jsonb_digest(jsonb_build_object(
					'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-budget-reservation-id',
					'version',1,'planDigest',NEW.plan_digest,
					'runtimeResourceSetId',NEW.runtime_resource_set_id,
					'registrationIntentDigest',NEW.registration_intent_digest
				)) FROM 8
			);
			IF jsonb_typeof(request_record)<>'object'
				OR agent_evaluation_jsonb_object_key_count(request_record)<>26
				OR NOT (request_record ?& ARRAY[
					'format','version','namespaceId','repositoryCommit','planDigest','frozenRunDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','registrationIntent',
					'registrationIntentDigest','providerConfigurationId','providerConfigurationDigest',
					'protocolFamily','modelId','modelLineageDigest','adapterDigest','capabilityProfileId',
					'capabilityProfileDigest','probeProgramDigest','publicResourceDescriptorDigest',
					'budgetReservationAuthority','budgetReservationAuthorityDigest',
					'networkPolicyAuthority','networkPolicyAuthorityDigest','minimumExpiresAt','requestDigest'
				])
				OR request_record->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-request'
				OR (request_record->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(request_record-'requestDigest')<>NEW.request_digest
				OR request_record->>'requestDigest'<>NEW.request_digest
				OR request_record->>'namespaceId'<>NEW.namespace_id
				OR request_record->>'repositoryCommit'<>NEW.repository_commit
				OR request_record->>'planDigest'<>NEW.plan_digest
				OR request_record->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR request_record->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR request_record->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR request_record->>'registrationIntentDigest'<>NEW.registration_intent_digest
				OR request_record->>'protocolFamily'<>NEW.protocol_family
				OR request_record->>'capabilityProfileId'<>NEW.capability_profile_id
				OR request_record->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR request_record->>'providerConfigurationDigest'<>NEW.provider_configuration_digest
				OR (request_record->>'minimumExpiresAt')::timestamptz<>NEW.minimum_expires_at
				OR jsonb_typeof(intent)<>'object'
				OR agent_evaluation_jsonb_object_key_count(intent)<>16
				OR NOT (intent ?& ARRAY[
					'format','version','providerConfigurationId','providerConfigurationDigest',
					'protocolFamily','modelId','modelLineageDigest','adapterDigest','capabilityProfileId',
					'capabilityProfileDigest','probeProgramDigest','publicResourceDescriptorDigest',
					'maximumResourceLifetimeMs','minimumQueryReadLeaseMs','requiredOperations','intentDigest'
				])
				OR intent->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-intent'
				OR (intent->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(intent-'intentDigest')<>
					NEW.registration_intent_digest
				OR intent->>'intentDigest'<>NEW.registration_intent_digest
				OR intent->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR intent->>'providerConfigurationDigest'<>NEW.provider_configuration_digest
				OR intent->>'protocolFamily'<>NEW.protocol_family
				OR intent->>'capabilityProfileId'<>NEW.capability_profile_id
				OR (intent->>'maximumResourceLifetimeMs')::bigint<>691200000
				OR (intent->>'minimumQueryReadLeaseMs')::bigint<>155000
				OR intent->'requiredOperations'<>'["create","delete","query","upload"]'::jsonb
				OR jsonb_typeof(budget)<>'object'
				OR agent_evaluation_jsonb_object_key_count(budget)<>12
				OR NOT (budget ?& ARRAY[
					'format','version','namespaceId','planDigest','reservePolicyDigest','budgetDigest',
					'reservationId','ledgerRevision','demandDigest','demandBytesDigest','reservedAt',
					'authorityDigest'
				])
				OR budget->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-budget-reservation-authority'
				OR (budget->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(budget-'authorityDigest')<>
					request_record->>'budgetReservationAuthorityDigest'
				OR budget->>'authorityDigest'<>request_record->>'budgetReservationAuthorityDigest'
				OR budget->>'reservationId'<>expected_reservation_id
				OR jsonb_typeof(network)<>'object'
				OR agent_evaluation_jsonb_object_key_count(network)<>14
				OR NOT (network ?& ARRAY[
					'format','version','namespaceId','repositoryCommit','planDigest','frozenRunDigest',
					'runConfigArtifactBindingDigest','providerConfigurationId',
					'providerConfigurationDigest','protocolFamily','purpose','endpointClass',
					'allowedOperations','authorityDigest'
				])
				OR network->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-network-policy-authority'
				OR (network->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(network-'authorityDigest')<>
					request_record->>'networkPolicyAuthorityDigest'
				OR network->>'authorityDigest'<>request_record->>'networkPolicyAuthorityDigest'
				OR network->>'purpose'<>'hosted-retrieval-runtime-resource-lifecycle'
				OR network->>'endpointClass'<>'first-party-hosted'
				OR network->'allowedOperations'<>'["create","delete","query","upload"]'::jsonb
				OR NEW.minimum_expires_at<=NEW.staged_at THEN
				RAISE EXCEPTION 'hosted runtime registration stage request is not exact'
					USING ERRCODE='23514';
			END IF;
			SELECT * INTO plan_row FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit FOR SHARE;
			SELECT frozen_run_digest INTO run_config_frozen_digest
			FROM agent_evaluation_production_run_config_artifacts
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND binding_digest=NEW.run_config_artifact_binding_digest FOR SHARE;
			SELECT ledger_revision,demand_digest,demand_bytes,reserved_at
			INTO budget_ledger_revision,budget_demand_digest,budget_demand_bytes,budget_reserved_at
			FROM agent_evaluation_budget_reservations
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND reservation_id=budget->>'reservationId' FOR SHARE;
			SELECT EXISTS (
				SELECT 1 FROM agent_evaluation_budget_settlements
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND reservation_id=budget->>'reservationId'
			) INTO budget_settlement_exists;
			SELECT COUNT(*) INTO matching_target_count
			FROM jsonb_array_elements(plan_row.plan_json#>'{value,capabilityQualificationTargets}') target
			WHERE target->>'protocolFamily'=NEW.protocol_family
				AND target->>'capabilityProfileId'=NEW.capability_profile_id
				AND target->>'providerConfigurationId'=NEW.provider_configuration_id
				AND target->>'providerIdentityDigest'=NEW.provider_configuration_digest
				AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,hostedRetrievalRuntimeResourceRegistrationIntentDigest}'=
					NEW.registration_intent_digest;
			IF plan_row.plan_digest IS NULL
				OR NOT agent_evaluation_hosted_runtime_plan_intent_set_valid(plan_row.plan_json)
				OR matching_target_count<>1 OR run_config_frozen_digest<>NEW.frozen_run_digest
				OR budget_ledger_revision IS DISTINCT FROM (budget->>'ledgerRevision')::bigint
				OR budget_demand_digest IS DISTINCT FROM budget->>'demandDigest'
				OR 'sha256-'||encode(digest(budget_demand_bytes,'sha256'),'hex')<>
					budget->>'demandBytesDigest'
				OR budget_reserved_at IS DISTINCT FROM (budget->>'reservedAt')::timestamptz
				OR budget_settlement_exists
				OR budget->>'namespaceId'<>NEW.namespace_id OR budget->>'planDigest'<>NEW.plan_digest
				OR budget->>'reservePolicyDigest'<>plan_row.plan_json#>>'{value,budget,reservePolicyDigest}'
				OR budget->>'budgetDigest'<>plan_row.plan_json#>>'{value,budget,budgetDigest}'
				OR network->>'namespaceId'<>NEW.namespace_id
				OR network->>'repositoryCommit'<>NEW.repository_commit
				OR network->>'planDigest'<>NEW.plan_digest
				OR network->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR network->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR network->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR network->>'providerConfigurationDigest'<>NEW.provider_configuration_digest
				OR network->>'protocolFamily'<>NEW.protocol_family THEN
				RAISE EXCEPTION 'hosted runtime registration stage lacks frozen authorities'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
				chr(31)||'hosted-runtime-registration-stage',0));
			SELECT COUNT(*),MIN(runtime_resource_set_id) INTO staged_count,existing_set_id
			FROM ae_hrrr_registration_requests
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit;
			IF staged_count>=4 OR (existing_set_id IS NOT NULL AND existing_set_id<>NEW.runtime_resource_set_id) THEN
				RAISE EXCEPTION 'hosted runtime registration stage set is full or split'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_stages_exact
			BEFORE INSERT ON ae_hrrr_registration_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_registration_stage()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_stages_immutable
			BEFORE UPDATE OR DELETE ON ae_hrrr_registration_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_stages_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON ae_hrrr_registration_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
	}
}
