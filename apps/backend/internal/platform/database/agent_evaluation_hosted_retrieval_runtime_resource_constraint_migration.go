package database

func agentEvaluationHostedRetrievalRuntimeResourceConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_plan_intent_set_valid(
			candidate JSONB
		) RETURNS BOOLEAN
		LANGUAGE sql STABLE PARALLEL SAFE AS $$
			WITH hosted AS (
				SELECT target,
					target->>'protocolFamily' AS protocol_family,
					target->>'capabilityProfileId' AS capability_profile_id,
					target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,hostedRetrievalRuntimeResourceRegistrationIntentDigest}' AS intent_digest,
					target#>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority}' AS runtime_authority,
					target->'optionalCapabilitySupportAuthority' AS optional_authority
				FROM jsonb_array_elements(COALESCE(
					candidate#>'{value,capabilityQualificationTargets}','[]'::jsonb
				)) target
				WHERE target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,hostedRetrievalRuntimeResourceRegistrationIntentDigest}'
					IS NOT NULL
			)
			SELECT COALESCE(
				COUNT(*)=4
				AND COUNT(DISTINCT protocol_family||chr(31)||capability_profile_id)=4
				AND bool_and(
					protocol_family IN ('gemini-interactions','openai-responses')
					AND capability_profile_id IN (
						'g4-provider-hosted-retrieval-core',
						'g4-provider-hosted-retrieval-document'
					)
					AND optional_authority->>'capabilityId'='provider.hosted-retrieval'
					AND runtime_authority->>'capabilityId'='provider.hosted-retrieval'
					AND runtime_authority->>'protocolFamily'=protocol_family
					AND runtime_authority->>'capabilityProfileId'=capability_profile_id
					AND intent_digest ~ '^sha256-[a-f0-9]{64}$'
				)
				AND array_agg(
					protocol_family||chr(31)||capability_profile_id
					ORDER BY protocol_family COLLATE "C",capability_profile_id COLLATE "C"
				)=ARRAY[
					'gemini-interactions'||chr(31)||'g4-provider-hosted-retrieval-core',
					'gemini-interactions'||chr(31)||'g4-provider-hosted-retrieval-document',
					'openai-responses'||chr(31)||'g4-provider-hosted-retrieval-core',
					'openai-responses'||chr(31)||'g4-provider-hosted-retrieval-document'
				],FALSE)
			FROM hosted
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_registration()
			RETURNS trigger AS $$
		DECLARE
			request JSONB:=NEW.registration_request_json;
			intent JSONB:=NEW.registration_request_json->'registrationIntent';
			budget JSONB:=NEW.registration_request_json->'budgetReservationAuthority';
			network JSONB:=NEW.registration_request_json->'networkPolicyAuthority';
			result JSONB:=NEW.registration_result_json;
			authority JSONB:=NEW.authority_json;
			deletion_receipt JSONB:=NEW.deletion_authority_receipt_json;
			deletion_projection JSONB:=NEW.deletion_authority_receipt_json->'deletionRequestProjection';
			staged_request ae_hrrr_registration_requests%ROWTYPE;
			plan_row agent_evaluation_plans%ROWTYPE;
			run_config_frozen_digest TEXT;
			budget_ledger_revision BIGINT;
			budget_demand_digest TEXT;
			budget_demand_bytes BYTEA;
			budget_reserved_at TIMESTAMPTZ;
			budget_settlement_exists BOOLEAN;
			matching_plan_intents BIGINT;
			registration_count BIGINT;
			existing_set_id TEXT;
			auxiliary_count BIGINT;
			canonical_auxiliary_count BIGINT;
		BEGIN
			SELECT * INTO staged_request
			FROM ae_hrrr_registration_requests
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND request_digest=NEW.registration_request_digest
			FOR SHARE;
			IF NOT FOUND OR staged_request.request_json<>NEW.registration_request_json
				OR staged_request.request_bytes<>NEW.registration_request_bytes
				OR staged_request.runtime_resource_set_id<>NEW.runtime_resource_set_id
				OR staged_request.registration_intent_digest<>NEW.registration_intent_digest
				OR staged_request.protocol_family<>NEW.protocol_family
				OR staged_request.capability_profile_id<>NEW.capability_profile_id
				OR staged_request.provider_configuration_id<>NEW.provider_configuration_id
				OR staged_request.provider_configuration_digest<>NEW.provider_configuration_digest THEN
				RAISE EXCEPTION 'hosted runtime registration result lacks its durable pre-Provider stage'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(request)<>'object'
				OR agent_evaluation_jsonb_object_key_count(request)<>26
				OR NOT (request ?& ARRAY[
					'format','version','namespaceId','repositoryCommit','planDigest','frozenRunDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','registrationIntent',
					'registrationIntentDigest','providerConfigurationId','providerConfigurationDigest',
					'protocolFamily','modelId','modelLineageDigest','adapterDigest','capabilityProfileId',
					'capabilityProfileDigest','probeProgramDigest','publicResourceDescriptorDigest',
					'budgetReservationAuthority','budgetReservationAuthorityDigest',
					'networkPolicyAuthority','networkPolicyAuthorityDigest','minimumExpiresAt','requestDigest'
				])
				OR request->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-request'
				OR (request->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(request-'requestDigest')<>
					NEW.registration_request_digest
				OR request->>'requestDigest'<>NEW.registration_request_digest
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
				OR agent_evaluation_canonical_jsonb_digest(budget-'authorityDigest')<>
					NEW.budget_reservation_authority_digest
				OR budget->>'authorityDigest'<>NEW.budget_reservation_authority_digest
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
				OR network->>'purpose'<>'hosted-retrieval-runtime-resource-lifecycle'
				OR network->>'endpointClass'<>'first-party-hosted'
				OR network->'allowedOperations'<>'["create","delete","query","upload"]'::jsonb
				OR agent_evaluation_canonical_jsonb_digest(network-'authorityDigest')<>
					NEW.network_policy_authority_digest
				OR network->>'authorityDigest'<>NEW.network_policy_authority_digest THEN
				RAISE EXCEPTION 'hosted retrieval runtime registration request is not exact'
					USING ERRCODE='23514';
			END IF;

			IF jsonb_typeof(result)<>'object'
				OR agent_evaluation_jsonb_object_key_count(result)<>9
				OR NOT (result ?& ARRAY[
					'format','version','registrationRequestDigest','registrationRequest','authority',
					'authorityDigest','deletionAuthorityReceipt','deletionAuthorityReceiptDigest','resultDigest'
				])
				OR result->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-result'
				OR agent_evaluation_canonical_jsonb_digest(result-'resultDigest')<>
					NEW.registration_result_digest
				OR result->>'resultDigest'<>NEW.registration_result_digest
				OR result->'registrationRequest'<>request
				OR result->'authority'<>authority
				OR result->'deletionAuthorityReceipt'<>deletion_receipt
				OR jsonb_typeof(authority)<>'object'
				OR agent_evaluation_jsonb_object_key_count(authority)<>34
				OR NOT (authority ?& ARRAY[
					'format','version','registrationRequestDigest','planDigest','frozenRunDigest',
					'runConfigArtifactBindingDigest','runtimeResourceSetId','registrationIntentDigest',
					'providerConfigurationId','providerConfigurationDigest','protocolFamily','modelId',
					'modelLineageDigest','adapterDigest','capabilityProfileId','capabilityProfileDigest',
					'probeProgramDigest','publicResourceDescriptorDigest','budgetReservationAuthority',
					'budgetReservationAuthorityDigest','networkPolicyAuthority','networkPolicyAuthorityDigest',
					'providerResourceKind','providerResourceId','auxiliaryResourceIds','resourceManifestDigest',
					'contentUploadReceiptDigest','creationDispatchIntentSetDigest',
					'creationTransportReceiptSetDigest','creationResultSpoolReceiptSetDigest',
					'deletionAuthorityReceiptDigest','registeredAt','expiresAt','authorityDigest'
				])
				OR authority->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-authority'
				OR agent_evaluation_canonical_jsonb_digest(authority-'authorityDigest')<>
					NEW.authority_digest
				OR authority->>'authorityDigest'<>NEW.authority_digest
				OR authority->'budgetReservationAuthority'<>budget
				OR authority->'networkPolicyAuthority'<>network
				OR jsonb_typeof(deletion_receipt)<>'object'
				OR agent_evaluation_jsonb_object_key_count(deletion_receipt)<>15
				OR jsonb_typeof(deletion_projection)<>'object'
				OR agent_evaluation_jsonb_object_key_count(deletion_projection)<>9
				OR deletion_receipt->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-deletion-authority-receipt'
				OR deletion_projection->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-deletion-request-projection'
				OR agent_evaluation_canonical_jsonb_digest(deletion_projection-'projectionDigest')<>
					deletion_projection->>'projectionDigest'
				OR agent_evaluation_canonical_jsonb_digest(
					deletion_receipt-'deletionAuthorityReceiptDigest'
				)<>NEW.deletion_authority_receipt_digest
				OR deletion_receipt->>'deletionAuthorityReceiptDigest'<>
					NEW.deletion_authority_receipt_digest THEN
				RAISE EXCEPTION 'hosted retrieval runtime registration result is not exact'
					USING ERRCODE='23514';
			END IF;

			IF request->>'namespaceId'<>NEW.namespace_id
				OR request->>'repositoryCommit'<>NEW.repository_commit
				OR request->>'planDigest'<>NEW.plan_digest
				OR request->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR request->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR request->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR request->>'registrationIntentDigest'<>NEW.registration_intent_digest
				OR request->>'protocolFamily'<>NEW.protocol_family
				OR request->>'capabilityProfileId'<>NEW.capability_profile_id
				OR request->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR request->>'providerConfigurationDigest'<>NEW.provider_configuration_digest
				OR request->>'budgetReservationAuthorityDigest'<>
					NEW.budget_reservation_authority_digest
				OR request->>'networkPolicyAuthorityDigest'<>NEW.network_policy_authority_digest
				OR intent->>'protocolFamily'<>NEW.protocol_family
				OR intent->>'capabilityProfileId'<>NEW.capability_profile_id
				OR intent->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR intent->>'providerConfigurationDigest'<>NEW.provider_configuration_digest
				OR authority->>'registrationRequestDigest'<>NEW.registration_request_digest
				OR authority->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR authority->>'registrationIntentDigest'<>NEW.registration_intent_digest
				OR authority->>'protocolFamily'<>NEW.protocol_family
				OR authority->>'capabilityProfileId'<>NEW.capability_profile_id
				OR authority->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR authority->>'providerConfigurationDigest'<>NEW.provider_configuration_digest
				OR authority->>'providerResourceKind'<>NEW.provider_resource_kind
				OR authority->>'providerResourceId'<>NEW.provider_resource_id
				OR authority->>'resourceManifestDigest'<>NEW.resource_manifest_digest
				OR authority->>'deletionAuthorityReceiptDigest'<>
					NEW.deletion_authority_receipt_digest
				OR (authority->>'registeredAt')::timestamptz<>NEW.registered_at
				OR (authority->>'expiresAt')::timestamptz<>NEW.expires_at
				OR result->>'registrationRequestDigest'<>NEW.registration_request_digest
				OR result->>'authorityDigest'<>NEW.authority_digest
				OR result->>'deletionAuthorityReceiptDigest'<>
					NEW.deletion_authority_receipt_digest
				OR deletion_receipt->>'registrationRequestDigest'<>
					NEW.registration_request_digest
				OR deletion_receipt->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR deletion_receipt->>'providerResourceKind'<>NEW.provider_resource_kind
				OR deletion_receipt->>'providerResourceId'<>NEW.provider_resource_id
				OR deletion_receipt->>'deletionRouteBinding'<>
					'hosted-retrieval-runtime-resource.delete'
				OR deletion_receipt->'deletionRequestProjection'<>deletion_projection
				OR deletion_receipt->>'deletionRequestProjectionDigest'<>
					deletion_projection->>'projectionDigest'
				OR (deletion_receipt->>'registeredAt')::timestamptz<>NEW.registered_at
				OR (deletion_receipt->>'expiresAt')::timestamptz<>NEW.expires_at
				OR deletion_projection->>'registrationRequestDigest'<>
					NEW.registration_request_digest
				OR deletion_projection->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR deletion_projection->>'protocolFamily'<>NEW.protocol_family
				OR deletion_projection->>'providerResourceKind'<>NEW.provider_resource_kind
				OR deletion_projection->>'providerResourceId'<>NEW.provider_resource_id
				OR deletion_projection->'auxiliaryResourceIds'<>
					authority->'auxiliaryResourceIds'
				OR (request->>'minimumExpiresAt')::timestamptz>NEW.expires_at THEN
				RAISE EXCEPTION 'hosted retrieval runtime registration scalar binding drifted'
					USING ERRCODE='23514';
			END IF;

			SELECT COUNT(*),COUNT(DISTINCT value)
			INTO auxiliary_count,canonical_auxiliary_count
			FROM jsonb_array_elements_text(authority->'auxiliaryResourceIds') WITH ORDINALITY entry(value,ordinality);
			IF auxiliary_count>20 OR auxiliary_count<>canonical_auxiliary_count
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements_text(authority->'auxiliaryResourceIds')
						WITH ORDINALITY entry(value,ordinality)
					WHERE value=NEW.provider_resource_id OR value !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					OR (ordinality>1 AND value COLLATE "C"<=
						(authority->'auxiliaryResourceIds'->>(ordinality::int-2)) COLLATE "C")
				) THEN
				RAISE EXCEPTION 'hosted retrieval runtime auxiliary resources are not canonical'
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
				AND reservation_id=NEW.budget_reservation_id FOR SHARE;
			SELECT EXISTS (
				SELECT 1 FROM agent_evaluation_budget_settlements
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND reservation_id=NEW.budget_reservation_id
			) INTO budget_settlement_exists;
			SELECT COUNT(*) INTO matching_plan_intents
			FROM jsonb_array_elements(plan_row.plan_json#>'{value,capabilityQualificationTargets}') target
			WHERE target->>'protocolFamily'=NEW.protocol_family
				AND target->>'capabilityProfileId'=NEW.capability_profile_id
				AND target->>'providerConfigurationId'=NEW.provider_configuration_id
				AND target->>'providerIdentityDigest'=NEW.provider_configuration_digest
				AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,hostedRetrievalRuntimeResourceRegistrationIntentDigest}'=
					NEW.registration_intent_digest;
			IF plan_row.plan_digest IS NULL
				OR NOT agent_evaluation_hosted_runtime_plan_intent_set_valid(plan_row.plan_json)
				OR matching_plan_intents<>1
				OR run_config_frozen_digest<>NEW.frozen_run_digest
				OR budget_ledger_revision IS DISTINCT FROM (budget->>'ledgerRevision')::bigint
				OR budget_demand_digest IS DISTINCT FROM budget->>'demandDigest'
				OR 'sha256-'||encode(digest(budget_demand_bytes,'sha256'),'hex') IS DISTINCT FROM
					budget->>'demandBytesDigest'
				OR budget_reserved_at IS DISTINCT FROM (budget->>'reservedAt')::timestamptz
				OR budget_settlement_exists
				OR budget->>'namespaceId'<>NEW.namespace_id
				OR budget->>'planDigest'<>NEW.plan_digest
				OR budget->>'reservationId'<>NEW.budget_reservation_id
				OR budget->>'reservePolicyDigest'<>
					plan_row.plan_json#>>'{value,budget,reservePolicyDigest}'
				OR budget->>'budgetDigest'<>plan_row.plan_json#>>'{value,budget,budgetDigest}'
				OR network->>'namespaceId'<>NEW.namespace_id
				OR network->>'repositoryCommit'<>NEW.repository_commit
				OR network->>'planDigest'<>NEW.plan_digest
				OR network->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR network->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR network->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR network->>'providerConfigurationDigest'<>NEW.provider_configuration_digest
				OR network->>'protocolFamily'<>NEW.protocol_family
				OR NEW.registered_at<plan_row.planned_at OR NEW.expires_at>plan_row.expires_at THEN
				RAISE EXCEPTION 'hosted retrieval runtime registration lacks frozen plan, budget, or network authority'
					USING ERRCODE='23514';
			END IF;

			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id||chr(31)||NEW.plan_digest||chr(31)||NEW.repository_commit||
				chr(31)||'hosted-runtime-registration',0));
			SELECT COUNT(*),MIN(runtime_resource_set_id)
			INTO registration_count,existing_set_id
			FROM ae_hrrr_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit;
			IF registration_count>=4
				OR (existing_set_id IS NOT NULL AND existing_set_id<>NEW.runtime_resource_set_id) THEN
				RAISE EXCEPTION 'hosted retrieval runtime registration set is full or split'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_exact
			BEFORE INSERT ON ae_hrrr_registration_results
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_registration()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_immutable
			BEFORE UPDATE OR DELETE ON ae_hrrr_registration_results
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON ae_hrrr_registration_results
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_resource_set()
			RETURNS trigger AS $$
		DECLARE
			expected_authorities JSONB;
			expected_authority_digests JSONB;
			expected_bindings JSONB;
			registration_count BIGINT;
			minimum_registered_at TIMESTAMPTZ;
			minimum_expires_at TIMESTAMPTZ;
		BEGIN
			SELECT COUNT(*),jsonb_agg(authority_json ORDER BY
				protocol_family COLLATE "C",capability_profile_id COLLATE "C"),
				jsonb_agg(to_jsonb(authority_digest) ORDER BY
					protocol_family COLLATE "C",capability_profile_id COLLATE "C"),
				jsonb_agg(jsonb_build_object(
					'authorityDigest',authority_digest,
					'registrationIntentDigest',registration_intent_digest,
					'protocolFamily',protocol_family,
					'capabilityProfileId',capability_profile_id,
					'providerConfigurationDigest',provider_configuration_digest,
					'budgetReservationId',budget_reservation_id,
					'budgetReservationAuthorityDigest',budget_reservation_authority_digest,
					'networkPolicyAuthorityDigest',network_policy_authority_digest
				) ORDER BY protocol_family COLLATE "C",capability_profile_id COLLATE "C"),
				MIN(registered_at),MIN(expires_at)
			INTO registration_count,expected_authorities,expected_authority_digests,
				expected_bindings,minimum_registered_at,minimum_expires_at
			FROM ae_hrrr_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=NEW.runtime_resource_set_id;
			IF registration_count<>4
				OR jsonb_typeof(NEW.authority_set_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.authority_set_json)<>9
				OR NOT (NEW.authority_set_json ?& ARRAY[
					'format','version','planDigest','frozenRunDigest','runConfigArtifactBindingDigest',
					'runtimeResourceSetId','authorities','authorityDigests','authoritySetDigest'
				])
				OR NEW.authority_set_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-authority-set'
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.authority_set_json-'authoritySetDigest')<>NEW.authority_set_digest
				OR NEW.authority_set_json->>'authoritySetDigest'<>NEW.authority_set_digest
				OR NEW.authority_set_json->'authorities'<>expected_authorities
				OR NEW.authority_set_json->'authorityDigests'<>expected_authority_digests
				OR jsonb_typeof(NEW.resource_set_commitment_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.resource_set_commitment_json)<>9
				OR NOT (NEW.resource_set_commitment_json ?& ARRAY[
					'format','version','planDigest','frozenRunDigest','runConfigArtifactBindingDigest',
					'runtimeResourceSetId','authoritySetDigest','authorityBindings','commitmentDigest'
				])
				OR NEW.resource_set_commitment_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-set-commitment'
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.resource_set_commitment_json-'commitmentDigest')<>
					NEW.resource_set_commitment_digest
				OR NEW.resource_set_commitment_json->>'commitmentDigest'<>
					NEW.resource_set_commitment_digest
				OR NEW.resource_set_commitment_json->'authorityBindings'<>expected_bindings
				OR NEW.authority_set_json->>'planDigest'<>NEW.plan_digest
				OR NEW.authority_set_json->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR NEW.authority_set_json->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR NEW.authority_set_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR NEW.resource_set_commitment_json->>'planDigest'<>NEW.plan_digest
				OR NEW.resource_set_commitment_json->>'frozenRunDigest'<>NEW.frozen_run_digest
				OR NEW.resource_set_commitment_json->>'runConfigArtifactBindingDigest'<>
					NEW.run_config_artifact_binding_digest
				OR NEW.resource_set_commitment_json->>'runtimeResourceSetId'<>
					NEW.runtime_resource_set_id
				OR NEW.resource_set_commitment_json->>'authoritySetDigest'<>NEW.authority_set_digest
				OR NEW.sealed_at<minimum_registered_at OR NEW.sealed_at>=minimum_expires_at THEN
				RAISE EXCEPTION 'hosted retrieval runtime resource set is not exact4'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_resource_sets_exact
			BEFORE INSERT ON ae_hrrr_sets
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_resource_set()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_resource_sets_immutable
			BEFORE UPDATE OR DELETE ON ae_hrrr_sets
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_resource_sets_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON ae_hrrr_sets
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_resource_state()
			RETURNS trigger AS $$
		DECLARE
			registration ae_hrrr_registration_results%ROWTYPE;
			resource_set ae_hrrr_sets%ROWTYPE;
			active_state JSONB:=NEW.stored_active_state_json;
		BEGIN
			SELECT * INTO registration
			FROM ae_hrrr_registration_results
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND registration_request_digest=NEW.registration_request_digest FOR SHARE;
			SELECT * INTO resource_set
			FROM ae_hrrr_sets
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND runtime_resource_set_id=NEW.runtime_resource_set_id FOR SHARE;
			IF registration.authority_digest IS NULL OR resource_set.authority_set_digest IS NULL
				OR registration.authority_digest<>NEW.authority_digest
				OR registration.runtime_resource_set_id<>NEW.runtime_resource_set_id
				OR registration.provider_resource_kind<>NEW.provider_resource_kind
				OR registration.provider_resource_id<>NEW.provider_resource_id
				OR registration.expires_at<>NEW.resource_expires_at
				OR resource_set.resource_set_commitment_digest<>
					NEW.resource_set_commitment_digest
				OR jsonb_typeof(active_state)<>'object'
				OR agent_evaluation_jsonb_object_key_count(active_state)<>10
				OR NOT (active_state ?& ARRAY[
					'format','version','authorityDigest','resourceSetCommitmentDigest',
					'activeOwnerInstanceId','claimGeneration','lifecycle','readLeaseNotAfter',
					'updatedAt','stateDigest'
				])
				OR active_state->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-active-state'
				OR active_state->>'lifecycle'<>'active'
				OR agent_evaluation_canonical_jsonb_digest(active_state-'stateDigest')<>
					NEW.stored_active_state_digest
				OR active_state->>'stateDigest'<>NEW.stored_active_state_digest
				OR active_state->>'authorityDigest'<>NEW.authority_digest
				OR active_state->>'resourceSetCommitmentDigest'<>
					NEW.resource_set_commitment_digest
				OR active_state->>'activeOwnerInstanceId'<>NEW.stored_active_owner_instance_id
				OR (active_state->>'claimGeneration')::bigint<>NEW.stored_active_claim_generation
				OR active_state->'readLeaseNotAfter' IS DISTINCT FROM
					COALESCE(to_jsonb(NEW.stored_active_read_lease_not_after),'null'::jsonb)
				OR (active_state->>'updatedAt')::timestamptz<>NEW.stored_active_updated_at
				OR NEW.stored_active_updated_at<registration.registered_at
				OR NEW.stored_active_updated_at>=registration.expires_at
				OR (NEW.stored_active_read_lease_not_after IS NOT NULL AND (
					NEW.stored_active_read_lease_not_after<=NEW.stored_active_updated_at
					OR NEW.stored_active_read_lease_not_after>
						NEW.stored_active_updated_at+INTERVAL '180 seconds'
					OR NEW.stored_active_read_lease_not_after>registration.expires_at
				)) THEN
				RAISE EXCEPTION 'hosted retrieval runtime active state drifted from exact registration set'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='INSERT' THEN
				IF NEW.lifecycle<>'active' OR NEW.current_state_digest<>NEW.stored_active_state_digest
					OR NEW.current_state_json<>NEW.stored_active_state_json
					OR NEW.current_state_bytes<>NEW.stored_active_state_bytes
					OR NEW.current_cleanup_claim_receipt_digest IS NOT NULL
					OR NEW.cleanup_request_digest IS NOT NULL OR NEW.cleanup_receipt_digest IS NOT NULL THEN
					RAISE EXCEPTION 'new hosted retrieval runtime resource is not active'
						USING ERRCODE='23514';
				END IF;
			ELSIF ROW(
				NEW.namespace_id,NEW.plan_digest,NEW.repository_commit,NEW.authority_digest,
				NEW.registration_request_digest,NEW.runtime_resource_set_id,
				NEW.resource_set_commitment_digest,NEW.provider_resource_kind,
				NEW.provider_resource_id,NEW.resource_expires_at,
				NEW.stored_active_state_digest,NEW.stored_active_state_json,
				NEW.stored_active_state_bytes,NEW.stored_active_owner_instance_id,
				NEW.stored_active_claim_generation,NEW.stored_active_read_lease_not_after,
				NEW.stored_active_updated_at,NEW.v45_eligible
			) IS DISTINCT FROM ROW(
				OLD.namespace_id,OLD.plan_digest,OLD.repository_commit,OLD.authority_digest,
				OLD.registration_request_digest,OLD.runtime_resource_set_id,
				OLD.resource_set_commitment_digest,OLD.provider_resource_kind,
				OLD.provider_resource_id,OLD.resource_expires_at,
				OLD.stored_active_state_digest,OLD.stored_active_state_json,
				OLD.stored_active_state_bytes,OLD.stored_active_owner_instance_id,
				OLD.stored_active_claim_generation,OLD.stored_active_read_lease_not_after,
				OLD.stored_active_updated_at,OLD.v45_eligible
			) OR NOT (
				(OLD.lifecycle='active' AND NEW.lifecycle IN ('active','cleanup-in-progress'))
				OR (OLD.lifecycle='cleanup-in-progress' AND NEW.lifecycle IN ('cleanup-in-progress','cleaned'))
				OR (OLD.lifecycle='cleaned' AND NEW.lifecycle='cleaned'
					AND NEW IS NOT DISTINCT FROM OLD)
			) THEN
				RAISE EXCEPTION 'hosted retrieval runtime lifecycle transition is invalid'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_resources_exact
			BEFORE INSERT OR UPDATE ON agent_evaluation_hosted_retrieval_runtime_resources
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_resource_state()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_resources_no_delete
			BEFORE DELETE ON agent_evaluation_hosted_retrieval_runtime_resources
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_resources_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resources
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
	}
}
