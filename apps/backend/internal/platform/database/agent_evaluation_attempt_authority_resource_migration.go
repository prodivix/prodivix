package database

// agentEvaluationAttemptAuthorityResourceStatements extends v45 with the
// fresh-only provider-resource and native optional bootstrap authority rows.
// Keeping the late additions separate leaves the already-deployed v41 bytes
// untouched and keeps the main migration readable.
func agentEvaluationAttemptAuthorityResourceStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_registrations (
			namespace_id TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			state TEXT NOT NULL,
			claim_generation BIGINT NOT NULL DEFAULT 1,
			provider_configuration_id TEXT NOT NULL,
			provider_configuration_digest TEXT NOT NULL,
			protocol_family TEXT NOT NULL,
			model_id TEXT NOT NULL,
			model_lineage_digest TEXT NOT NULL,
			adapter_digest TEXT NOT NULL,
			capability_profile_id TEXT NOT NULL,
			probe_program_digest TEXT NOT NULL,
			public_resource_descriptor_digest TEXT NOT NULL,
			minimum_expires_at TIMESTAMPTZ NOT NULL,
			owner_implementation_digest TEXT NOT NULL,
			authority_issuer_id TEXT NOT NULL,
			stage_digest TEXT,
			resource_result_digest TEXT,
			owner_admission_digest TEXT,
			dispatch_ack_digest TEXT,
			result_ingress_digest TEXT,
			result_ingress_receipt_digest TEXT,
			resource_manifest_digest TEXT,
			content_upload_receipt_digest TEXT,
			deletion_authority_receipt_digest TEXT,
			provider_resource_authority_digest TEXT,
			registration_receipt_digest TEXT,
			registered_at TIMESTAMPTZ,
			expires_at TIMESTAMPTZ,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			result_json JSONB,
			result_bytes BYTEA,
			response_json JSONB,
			response_bytes BYTEA,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			claimed_at TIMESTAMPTZ NOT NULL,
			dispatched_at TIMESTAMPTZ,
			sealed_at TIMESTAMPTZ,
			updated_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id, repository_commit, request_digest),
			UNIQUE (
				namespace_id,repository_commit,provider_configuration_digest,
				model_lineage_digest,capability_profile_id
			),
			UNIQUE (namespace_id,repository_commit,resource_result_digest),
			UNIQUE (namespace_id,repository_commit,result_ingress_digest),
			UNIQUE (namespace_id,repository_commit,result_ingress_receipt_digest),
			UNIQUE (namespace_id, repository_commit, provider_resource_authority_digest),
			UNIQUE (namespace_id, repository_commit, registration_receipt_digest),
			CONSTRAINT agent_eval_probe_provider_resource_identity_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND state IN ('claimed','dispatched','sealed')
				AND claim_generation=1 AND v45_eligible
				AND protocol_family IN ('gemini-interactions','openai-responses')
				AND capability_profile_id IN (
					'g4-provider-hosted-retrieval-core',
					'g4-provider-hosted-retrieval-document'
				)
			),
			CONSTRAINT agent_eval_probe_provider_resource_digest_check CHECK (
				request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND provider_configuration_digest ~ '^sha256-[a-f0-9]{64}$'
				AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
				AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
				AND probe_program_digest ~ '^sha256-[a-f0-9]{64}$'
				AND public_resource_descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
				AND owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (stage_digest IS NULL OR stage_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (resource_result_digest IS NULL OR resource_result_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (owner_admission_digest IS NULL OR owner_admission_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (dispatch_ack_digest IS NULL OR dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (result_ingress_digest IS NULL OR result_ingress_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (result_ingress_receipt_digest IS NULL OR result_ingress_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (resource_manifest_digest IS NULL OR resource_manifest_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (content_upload_receipt_digest IS NULL OR content_upload_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (deletion_authority_receipt_digest IS NULL OR deletion_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (provider_resource_authority_digest IS NULL OR provider_resource_authority_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (registration_receipt_digest IS NULL OR registration_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
			),
			CONSTRAINT agent_eval_probe_provider_resource_lifecycle_check CHECK (
				(state='claimed' AND stage_digest IS NULL AND dispatched_at IS NULL
					AND resource_result_digest IS NULL AND owner_admission_digest IS NULL
					AND dispatch_ack_digest IS NULL AND result_ingress_digest IS NULL
					AND result_ingress_receipt_digest IS NULL AND resource_manifest_digest IS NULL
					AND content_upload_receipt_digest IS NULL AND deletion_authority_receipt_digest IS NULL
					AND provider_resource_authority_digest IS NULL AND registration_receipt_digest IS NULL
					AND registered_at IS NULL AND expires_at IS NULL AND result_json IS NULL
					AND result_bytes IS NULL AND response_json IS NULL AND response_bytes IS NULL
					AND sealed_at IS NULL)
				OR (state='dispatched' AND stage_digest IS NOT NULL AND dispatched_at IS NOT NULL
					AND sealed_at IS NULL AND registration_receipt_digest IS NULL
					AND response_json IS NULL AND response_bytes IS NULL
					AND ((dispatch_ack_digest IS NULL AND resource_result_digest IS NULL
						AND owner_admission_digest IS NULL AND result_ingress_digest IS NULL
						AND result_ingress_receipt_digest IS NULL AND resource_manifest_digest IS NULL
						AND content_upload_receipt_digest IS NULL AND deletion_authority_receipt_digest IS NULL
						AND provider_resource_authority_digest IS NULL AND registered_at IS NULL
						AND expires_at IS NULL AND result_json IS NULL AND result_bytes IS NULL)
					OR (dispatch_ack_digest IS NOT NULL AND resource_result_digest IS NOT NULL
						AND owner_admission_digest IS NOT NULL AND result_ingress_digest IS NOT NULL
						AND result_ingress_receipt_digest IS NOT NULL AND resource_manifest_digest IS NOT NULL
						AND content_upload_receipt_digest IS NOT NULL AND deletion_authority_receipt_digest IS NOT NULL
						AND provider_resource_authority_digest IS NOT NULL AND registered_at IS NOT NULL
						AND expires_at IS NOT NULL AND result_json IS NOT NULL AND result_bytes IS NOT NULL)))
				OR (state='sealed' AND stage_digest IS NOT NULL AND dispatched_at IS NOT NULL
					AND resource_result_digest IS NOT NULL AND owner_admission_digest IS NOT NULL
					AND dispatch_ack_digest IS NOT NULL AND result_ingress_digest IS NOT NULL
					AND result_ingress_receipt_digest IS NOT NULL AND resource_manifest_digest IS NOT NULL
					AND content_upload_receipt_digest IS NOT NULL AND deletion_authority_receipt_digest IS NOT NULL
					AND provider_resource_authority_digest IS NOT NULL AND registration_receipt_digest IS NOT NULL
					AND registered_at IS NOT NULL AND expires_at IS NOT NULL AND result_json IS NOT NULL
					AND result_bytes IS NOT NULL AND response_json IS NOT NULL AND response_bytes IS NOT NULL
					AND sealed_at IS NOT NULL)
			),
			CONSTRAINT agent_eval_probe_provider_resource_time_check CHECK (
				minimum_expires_at>claimed_at
				AND minimum_expires_at<=claimed_at+INTERVAL '8 days'
				AND updated_at>=claimed_at
				AND (dispatched_at IS NULL OR dispatched_at>=claimed_at)
				AND (registered_at IS NULL OR registered_at BETWEEN claimed_at AND updated_at)
				AND (expires_at IS NULL OR (
					expires_at>registered_at AND expires_at>=minimum_expires_at
					AND expires_at<=registered_at+INTERVAL '8 days'
				))
				AND (sealed_at IS NULL OR sealed_at>=dispatched_at)
			),
			CONSTRAINT agent_eval_probe_provider_resource_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 262144
				AND request_json=convert_from(request_bytes,'UTF8')::jsonb
				AND (result_json IS NULL)=(result_bytes IS NULL)
				AND (result_json IS NULL OR (
					octet_length(result_bytes) BETWEEN 1 AND 262144
					AND result_json=convert_from(result_bytes,'UTF8')::jsonb
				))
				AND (response_json IS NULL)=(response_bytes IS NULL)
				AND (response_json IS NULL OR (
					octet_length(response_bytes) BETWEEN 1 AND 65536
					AND response_json=convert_from(response_bytes,'UTF8')::jsonb
				))
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_manifests (
			namespace_id TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			manifest_digest TEXT NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id,repository_commit,request_digest),
			UNIQUE (namespace_id,repository_commit,manifest_digest),
			UNIQUE (namespace_id,repository_commit,request_digest,manifest_digest),
			FOREIGN KEY (namespace_id,repository_commit,request_digest)
				REFERENCES agent_evaluation_capability_probe_provider_resource_registrations(
					namespace_id,repository_commit,request_digest
				) ON DELETE RESTRICT,
			CHECK (manifest_digest ~ '^sha256-[a-f0-9]{64}$'
				AND octet_length(receipt_bytes) BETWEEN 1 AND 65536
				AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_content_upload_receipts (
			namespace_id TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			content_upload_receipt_digest TEXT NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id,repository_commit,request_digest),
			UNIQUE (namespace_id,repository_commit,content_upload_receipt_digest),
			UNIQUE (
				namespace_id,repository_commit,request_digest,content_upload_receipt_digest
			),
			FOREIGN KEY (namespace_id,repository_commit,request_digest)
				REFERENCES agent_evaluation_capability_probe_provider_resource_registrations(
					namespace_id,repository_commit,request_digest
				) ON DELETE RESTRICT,
			CHECK (content_upload_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND octet_length(receipt_bytes) BETWEEN 1 AND 65536
				AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts (
			namespace_id TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			deletion_authority_receipt_digest TEXT NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id,repository_commit,request_digest),
			UNIQUE (namespace_id,repository_commit,deletion_authority_receipt_digest),
			UNIQUE (
				namespace_id,repository_commit,request_digest,deletion_authority_receipt_digest
			),
			FOREIGN KEY (namespace_id,repository_commit,request_digest)
				REFERENCES agent_evaluation_capability_probe_provider_resource_registrations(
					namespace_id,repository_commit,request_digest
				) ON DELETE RESTRICT,
			CHECK (deletion_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
				AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb)
		)`,
		`ALTER TABLE agent_evaluation_capability_probe_provider_resource_registrations
			ADD CONSTRAINT agent_eval_probe_provider_resource_manifest_fk FOREIGN KEY (
				namespace_id,repository_commit,request_digest,resource_manifest_digest
			) REFERENCES agent_evaluation_capability_probe_provider_resource_manifests(
				namespace_id,repository_commit,request_digest,manifest_digest
			) ON DELETE RESTRICT,
			ADD CONSTRAINT agent_eval_probe_provider_resource_upload_fk FOREIGN KEY (
				namespace_id,repository_commit,request_digest,content_upload_receipt_digest
			) REFERENCES agent_evaluation_capability_probe_provider_resource_content_upload_receipts(
				namespace_id,repository_commit,request_digest,content_upload_receipt_digest
			) ON DELETE RESTRICT,
			ADD CONSTRAINT agent_eval_probe_provider_resource_deletion_fk FOREIGN KEY (
				namespace_id,repository_commit,request_digest,deletion_authority_receipt_digest
			) REFERENCES agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts(
				namespace_id,repository_commit,request_digest,deletion_authority_receipt_digest
			) ON DELETE RESTRICT`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_probe_provider_resource_component()
			RETURNS trigger AS $$
		DECLARE
			parent_state TEXT;
			parent_stage TEXT;
			parent_protocol TEXT;
			parent_dispatched_at TIMESTAMPTZ;
			deletion_projection JSONB;
			auxiliary_resource_ids JSONB;
			existing_digest TEXT;
			existing_json JSONB;
			existing_bytes BYTEA;
		BEGIN
			IF TG_TABLE_NAME='agent_evaluation_capability_probe_provider_resource_manifests' THEN
				SELECT manifest_digest,receipt_json,receipt_bytes
				INTO existing_digest,existing_json,existing_bytes
				FROM agent_evaluation_capability_probe_provider_resource_manifests
				WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
					AND request_digest=NEW.request_digest FOR SHARE;
				IF FOUND THEN
					IF existing_digest<>NEW.manifest_digest OR existing_json<>NEW.receipt_json
						OR existing_bytes<>NEW.receipt_bytes THEN
						RAISE EXCEPTION 'provider resource component replay conflicts with durable bytes'
							USING ERRCODE='23514';
					END IF;
					RETURN NEW;
				END IF;
			ELSIF TG_TABLE_NAME='agent_evaluation_capability_probe_provider_resource_content_upload_receipts' THEN
				SELECT content_upload_receipt_digest,receipt_json,receipt_bytes
				INTO existing_digest,existing_json,existing_bytes
				FROM agent_evaluation_capability_probe_provider_resource_content_upload_receipts
				WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
					AND request_digest=NEW.request_digest FOR SHARE;
				IF FOUND THEN
					IF existing_digest<>NEW.content_upload_receipt_digest
						OR existing_json<>NEW.receipt_json OR existing_bytes<>NEW.receipt_bytes THEN
						RAISE EXCEPTION 'provider resource component replay conflicts with durable bytes'
							USING ERRCODE='23514';
					END IF;
					RETURN NEW;
				END IF;
			ELSE
				SELECT deletion_authority_receipt_digest,receipt_json,receipt_bytes
				INTO existing_digest,existing_json,existing_bytes
				FROM agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts
				WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
					AND request_digest=NEW.request_digest FOR SHARE;
				IF FOUND THEN
					IF existing_digest<>NEW.deletion_authority_receipt_digest
						OR existing_json<>NEW.receipt_json OR existing_bytes<>NEW.receipt_bytes THEN
						RAISE EXCEPTION 'provider resource component replay conflicts with durable bytes'
							USING ERRCODE='23514';
					END IF;
					RETURN NEW;
				END IF;
			END IF;
			SELECT state,stage_digest,protocol_family,dispatched_at
			INTO parent_state,parent_stage,parent_protocol,parent_dispatched_at
			FROM agent_evaluation_capability_probe_provider_resource_registrations
			WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
				AND request_digest=NEW.request_digest AND v45_eligible
			FOR SHARE;
			IF NOT FOUND OR parent_state NOT IN ('dispatched','sealed') OR parent_stage IS NULL
				OR NEW.created_at<parent_dispatched_at THEN
				RAISE EXCEPTION 'provider resource component lacks its dispatched authority'
					USING ERRCODE='23514';
			END IF;
			IF TG_TABLE_NAME='agent_evaluation_capability_probe_provider_resource_manifests' THEN
				IF jsonb_typeof(NEW.receipt_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>17
					OR NOT (NEW.receipt_json ?& ARRAY[
						'format','version','requestDigest','probeProgramDigest',
						'publicResourceDescriptorDigest','protocolFamily','providerConfigurationId',
						'modelId','modelLineageDigest','adapterDigest','providerResourceKind',
						'providerResourceId','contentDigest','documentBytesDigest','registeredAt',
						'expiresAt','manifestDigest'
					]) OR NEW.receipt_json->>'format'<>
						'prodivix.agent-evaluation-capability-probe-provider-resource-manifest'
					OR (NEW.receipt_json->>'version')::bigint<>1
					OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
					OR NEW.receipt_json->>'manifestDigest'<>NEW.manifest_digest THEN
					RAISE EXCEPTION 'provider resource manifest shape or digest binding is invalid'
						USING ERRCODE='23514';
				END IF;
			ELSIF TG_TABLE_NAME='agent_evaluation_capability_probe_provider_resource_content_upload_receipts' THEN
				IF jsonb_typeof(NEW.receipt_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>14
					OR NOT (NEW.receipt_json ?& ARRAY[
						'format','version','requestDigest','resourceManifestDigest',
						'publicResourceDescriptorDigest','providerResourceKind','providerResourceId',
						'contentDigest','documentBytesDigest','dispatchIntentDigest',
						'transportReceiptDigest','responseSpoolDigest','uploadedAt',
						'contentUploadReceiptDigest'
					]) OR NEW.receipt_json->>'format'<>
						'prodivix.agent-evaluation-capability-probe-provider-resource-content-upload-receipt'
					OR (NEW.receipt_json->>'version')::bigint<>1
					OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
					OR NEW.receipt_json->>'contentUploadReceiptDigest'<>
						NEW.content_upload_receipt_digest THEN
					RAISE EXCEPTION 'provider resource upload receipt shape or digest binding is invalid'
						USING ERRCODE='23514';
				END IF;
			ELSE
				deletion_projection:=NEW.receipt_json->'deletionRequestProjection';
				auxiliary_resource_ids:=CASE
					WHEN jsonb_typeof(deletion_projection->'auxiliaryResourceIds')='array'
					THEN deletion_projection->'auxiliaryResourceIds'
					ELSE '[]'::jsonb
				END;
				IF jsonb_typeof(NEW.receipt_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>12
					OR NOT (NEW.receipt_json ?& ARRAY[
						'format','version','requestDigest','resourceManifestDigest','providerResourceKind',
						'providerResourceId','deletionRouteBinding','deletionRequestProjection',
						'deletionRequestProjectionDigest',
						'registeredAt','expiresAt','deletionAuthorityReceiptDigest'
					]) OR NEW.receipt_json->>'format'<>
						'prodivix.agent-evaluation-capability-probe-provider-resource-deletion-authority-receipt'
					OR (NEW.receipt_json->>'version')::bigint<>1
					OR NEW.receipt_json->>'requestDigest'<>NEW.request_digest
					OR NEW.receipt_json->>'deletionRouteBinding'<>'provider-resource.delete'
					OR jsonb_typeof(deletion_projection)<>'object'
					OR agent_evaluation_jsonb_object_key_count(
						deletion_projection
					)<>7
					OR NOT (deletion_projection ?& ARRAY[
						'format','version','requestDigest','protocolFamily','providerResourceKind',
						'providerResourceId','auxiliaryResourceIds'
					])
					OR NEW.receipt_json#>>'{deletionRequestProjection,format}'<>
						'prodivix.agent-evaluation-capability-probe-provider-resource-deletion-request-projection'
					OR (NEW.receipt_json#>>'{deletionRequestProjection,version}')::bigint<>1
					OR NEW.receipt_json#>>'{deletionRequestProjection,requestDigest}'<>
						NEW.request_digest
					OR NEW.receipt_json#>>'{deletionRequestProjection,protocolFamily}'<>
						parent_protocol
					OR NEW.receipt_json#>>'{deletionRequestProjection,providerResourceKind}'<>
						NEW.receipt_json->>'providerResourceKind'
					OR NEW.receipt_json#>>'{deletionRequestProjection,providerResourceId}'<>
						NEW.receipt_json->>'providerResourceId'
					OR (parent_protocol='gemini-interactions' AND
						NEW.receipt_json->>'providerResourceKind'<>'gemini-file-search-store-name')
					OR (parent_protocol='openai-responses' AND
						NEW.receipt_json->>'providerResourceKind'<>'openai-vector-store-id')
					OR jsonb_typeof(deletion_projection->'auxiliaryResourceIds')<>'array'
					OR jsonb_array_length(auxiliary_resource_ids)>32
					OR EXISTS (
						SELECT 1 FROM jsonb_array_elements(auxiliary_resource_ids) AS element(value)
						WHERE jsonb_typeof(element.value)<>'string'
							OR element.value#>>'{}' !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
							OR element.value#>>'{}'=NEW.receipt_json->>'providerResourceId'
					)
					OR (
						SELECT COUNT(*)<>COUNT(DISTINCT element.value#>>'{}')
						FROM jsonb_array_elements(auxiliary_resource_ids) AS element(value)
					)
					OR auxiliary_resource_ids<>
						COALESCE((
							SELECT jsonb_agg(to_jsonb(element.value) ORDER BY element.value COLLATE "C")
							FROM jsonb_array_elements_text(auxiliary_resource_ids) AS element(value)
						), '[]'::jsonb)
					OR NEW.receipt_json->>'deletionAuthorityReceiptDigest'<>
						NEW.deletion_authority_receipt_digest THEN
					RAISE EXCEPTION 'provider resource deletion receipt shape or digest binding is invalid'
						USING ERRCODE='23514';
				END IF;
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_manifests_exact_binding
			BEFORE INSERT ON agent_evaluation_capability_probe_provider_resource_manifests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_provider_resource_component()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_uploads_exact_binding
			BEFORE INSERT ON agent_evaluation_capability_probe_provider_resource_content_upload_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_provider_resource_component()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_deletions_exact_binding
			BEFORE INSERT ON agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_provider_resource_component()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_manifests_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_probe_provider_resource_manifests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_uploads_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_probe_provider_resource_content_upload_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_deletions_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION reject_agent_evaluation_repository_commit_finalized_mutation()
			RETURNS trigger AS $$
		DECLARE
			evaluation_namespace_id TEXT;
			evaluation_repository_commit TEXT;
		BEGIN
			IF TG_OP='DELETE' THEN
				evaluation_namespace_id:=OLD.namespace_id;
				evaluation_repository_commit:=OLD.repository_commit;
			ELSE
				evaluation_namespace_id:=NEW.namespace_id;
				evaluation_repository_commit:=NEW.repository_commit;
			END IF;
			PERFORM 1 FROM agent_evaluation_plans
			WHERE namespace_id=evaluation_namespace_id
				AND repository_commit=evaluation_repository_commit
			FOR SHARE;
			IF EXISTS (
				SELECT 1
				FROM agent_evaluation_finalizations finalization
				JOIN agent_evaluation_plans plan
				  ON plan.namespace_id=finalization.namespace_id
				 AND plan.plan_digest=finalization.plan_digest
				WHERE plan.namespace_id=evaluation_namespace_id
				  AND plan.repository_commit=evaluation_repository_commit
			) OR EXISTS (
				SELECT 1
				FROM agent_evaluation_authority_attestations attestation
				JOIN agent_evaluation_plans plan
				  ON plan.namespace_id=attestation.namespace_id
				 AND plan.plan_digest=attestation.plan_digest
				WHERE plan.namespace_id=evaluation_namespace_id
				  AND plan.repository_commit=evaluation_repository_commit
			) THEN
				RAISE EXCEPTION 'finalized evaluation repository commit is immutable'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='DELETE' THEN RETURN OLD; END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_manifests_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_probe_provider_resource_manifests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_repository_commit_finalized_mutation()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_uploads_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_probe_provider_resource_content_upload_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_repository_commit_finalized_mutation()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_deletions_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_repository_commit_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_probe_provider_resource_capacity()
			RETURNS trigger AS $$
		DECLARE
			registration_count BIGINT;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id || chr(31) || NEW.repository_commit || chr(31) ||
				'capability-probe-provider-resource',0
			));
			IF EXISTS (
				SELECT 1 FROM agent_evaluation_capability_probe_provider_resource_registrations
				WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
					AND request_digest=NEW.request_digest
			) THEN
				RETURN NEW;
			END IF;
			SELECT COUNT(*) INTO registration_count
			FROM agent_evaluation_capability_probe_provider_resource_registrations
			WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit;
			IF registration_count>=4 THEN
				RAISE EXCEPTION 'capability probe provider resource exceeds frozen registration capacity'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resources_capacity
			BEFORE INSERT ON agent_evaluation_capability_probe_provider_resource_registrations
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_provider_resource_capacity()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_probe_provider_resource_transition()
			RETURNS trigger AS $$
		DECLARE
			expected_resource_kind TEXT;
			manifest JSONB;
			upload_receipt JSONB;
			deletion_receipt JSONB;
			resource_authority JSONB;
			component_count BIGINT;
		BEGIN
			IF TG_OP='DELETE' THEN
				RAISE EXCEPTION 'capability probe provider resource registration is immutable'
					USING ERRCODE='23514';
			END IF;
			expected_resource_kind := CASE NEW.protocol_family
				WHEN 'gemini-interactions' THEN 'gemini-file-search-store-name'
				WHEN 'openai-responses' THEN 'openai-vector-store-id'
				ELSE NULL END;
			IF jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>9
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','repositoryCommit','providerConfiguration',
					'modelLineage','probeProgram','minimumExpiresAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-capability-probe-provider-resource-registration-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR NEW.request_json#>>'{providerConfiguration,providerConfigurationId}'<>
					NEW.provider_configuration_id
				OR NEW.request_json#>>'{providerConfiguration,adapter,protocolFamily}'<>
					NEW.protocol_family
				OR NEW.request_json#>>'{providerConfiguration,adapter,adapterDigest}'<>NEW.adapter_digest
				OR NEW.request_json#>>'{modelLineage,modelId}'<>NEW.model_id
				OR NEW.request_json#>>'{modelLineage,lineageDigest}'<>NEW.model_lineage_digest
				OR NEW.request_json#>>'{probeProgram,programDigest}'<>NEW.probe_program_digest
				OR NEW.request_json#>>'{probeProgram,profileProjection,capabilityProfileId}'<>
					NEW.capability_profile_id
				OR NEW.request_json#>>'{probeProgram,profileProjection,capabilityId}'<>
					'provider.hosted-retrieval'
				OR NEW.request_json#>>'{probeProgram,providerRequestIntent,publicProbeResource,descriptorDigest}'<>
					NEW.public_resource_descriptor_digest
				OR (NEW.request_json->>'minimumExpiresAt')::timestamptz<>NEW.minimum_expires_at THEN
				RAISE EXCEPTION 'capability probe provider resource request binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='INSERT' THEN
				IF NEW.state<>'claimed' OR NEW.v45_eligible IS DISTINCT FROM TRUE
					OR NEW.updated_at IS DISTINCT FROM NEW.claimed_at THEN
					RAISE EXCEPTION 'capability probe provider resource must start claimed/current'
						USING ERRCODE='23514';
				END IF;
			ELSIF OLD.state='claimed' AND NEW.state='dispatched' THEN
				IF (to_jsonb(OLD)-ARRAY['state','stage_digest','dispatched_at','updated_at'])
					IS DISTINCT FROM
					(to_jsonb(NEW)-ARRAY['state','stage_digest','dispatched_at','updated_at'])
					OR NEW.updated_at IS DISTINCT FROM NEW.dispatched_at THEN
					RAISE EXCEPTION 'capability probe provider resource dispatch changed immutable fields'
						USING ERRCODE='23514';
				END IF;
			ELSIF OLD.state='dispatched' AND NEW.state='dispatched' THEN
				IF OLD.dispatch_ack_digest IS NOT NULL
					OR (to_jsonb(OLD)-ARRAY[
						'resource_result_digest','owner_admission_digest','dispatch_ack_digest',
						'result_ingress_digest','result_ingress_receipt_digest','resource_manifest_digest',
						'content_upload_receipt_digest','deletion_authority_receipt_digest',
						'provider_resource_authority_digest','registered_at','expires_at',
						'result_json','result_bytes','updated_at'
					]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY[
						'resource_result_digest','owner_admission_digest','dispatch_ack_digest',
						'result_ingress_digest','result_ingress_receipt_digest','resource_manifest_digest',
						'content_upload_receipt_digest','deletion_authority_receipt_digest',
						'provider_resource_authority_digest','registered_at','expires_at',
						'result_json','result_bytes','updated_at'
					]) THEN
					RAISE EXCEPTION 'capability probe provider resource result ingress changed immutable fields'
						USING ERRCODE='23514';
				END IF;
			ELSIF OLD.state='dispatched' AND NEW.state='sealed' THEN
				IF OLD.dispatch_ack_digest IS NULL
					OR (to_jsonb(OLD)-ARRAY[
						'state','registration_receipt_digest','response_json','response_bytes',
						'sealed_at','updated_at'
					]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY[
						'state','registration_receipt_digest','response_json','response_bytes',
						'sealed_at','updated_at'
					]) OR NEW.updated_at IS DISTINCT FROM NEW.sealed_at THEN
					RAISE EXCEPTION 'capability probe provider resource seal drifted from result ingress'
						USING ERRCODE='23514';
				END IF;
			ELSE
				RAISE EXCEPTION 'capability probe provider resource transition is invalid'
					USING ERRCODE='23514';
			END IF;
			IF NEW.dispatch_ack_digest IS NOT NULL THEN
				manifest:=NEW.result_json->'resourceManifest';
				upload_receipt:=NEW.result_json->'contentUploadReceipt';
				deletion_receipt:=NEW.result_json->'deletionAuthorityReceipt';
				resource_authority:=NEW.result_json->'providerResourceAuthority';
				IF jsonb_typeof(NEW.result_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.result_json)<>8
					OR NOT (NEW.result_json ?& ARRAY[
						'format','version','requestDigest','resourceManifest','contentUploadReceipt',
						'deletionAuthorityReceipt','providerResourceAuthority','resultDigest'
					]) OR NEW.result_json->>'format'<>
						'prodivix.agent-evaluation-capability-probe-provider-resource-result'
					OR (NEW.result_json->>'version')::bigint<>1
					OR NEW.result_json->>'requestDigest'<>NEW.request_digest
					OR NEW.result_json->>'resultDigest'<>NEW.resource_result_digest
					OR manifest->>'manifestDigest'<>NEW.resource_manifest_digest
					OR upload_receipt->>'contentUploadReceiptDigest'<>NEW.content_upload_receipt_digest
					OR deletion_receipt->>'deletionAuthorityReceiptDigest'<>
						NEW.deletion_authority_receipt_digest
					OR resource_authority->>'authorityDigest'<>
						NEW.provider_resource_authority_digest
					OR manifest->>'requestDigest'<>NEW.request_digest
					OR manifest->>'probeProgramDigest'<>NEW.probe_program_digest
					OR manifest->>'publicResourceDescriptorDigest'<>
						NEW.public_resource_descriptor_digest
					OR manifest->>'protocolFamily'<>NEW.protocol_family
					OR manifest->>'providerConfigurationId'<>NEW.provider_configuration_id
					OR manifest->>'modelId'<>NEW.model_id
					OR manifest->>'modelLineageDigest'<>NEW.model_lineage_digest
					OR manifest->>'adapterDigest'<>NEW.adapter_digest
					OR manifest->>'providerResourceKind'<>expected_resource_kind
					OR upload_receipt->>'requestDigest'<>NEW.request_digest
					OR upload_receipt->>'resourceManifestDigest'<>NEW.resource_manifest_digest
					OR upload_receipt->>'publicResourceDescriptorDigest'<>
						NEW.public_resource_descriptor_digest
					OR upload_receipt->>'providerResourceKind'<>expected_resource_kind
					OR upload_receipt->>'providerResourceId'<>manifest->>'providerResourceId'
					OR deletion_receipt->>'requestDigest'<>NEW.request_digest
					OR deletion_receipt->>'resourceManifestDigest'<>NEW.resource_manifest_digest
					OR deletion_receipt->>'providerResourceKind'<>expected_resource_kind
					OR deletion_receipt->>'providerResourceId'<>manifest->>'providerResourceId'
					OR resource_authority->>'capabilityProfileId'<>NEW.capability_profile_id
					OR resource_authority->>'probeProgramDigest'<>NEW.probe_program_digest
					OR resource_authority->>'publicResourceDescriptorDigest'<>
						NEW.public_resource_descriptor_digest
					OR resource_authority->>'protocolFamily'<>NEW.protocol_family
					OR resource_authority->>'providerConfigurationId'<>NEW.provider_configuration_id
					OR resource_authority->>'modelId'<>NEW.model_id
					OR resource_authority->>'modelLineageDigest'<>NEW.model_lineage_digest
					OR resource_authority->>'adapterDigest'<>NEW.adapter_digest
					OR resource_authority->>'providerResourceKind'<>expected_resource_kind
					OR resource_authority->>'providerResourceId'<>manifest->>'providerResourceId'
					OR resource_authority->>'resourceManifestDigest'<>NEW.resource_manifest_digest
					OR resource_authority->>'contentUploadReceiptDigest'<>
						NEW.content_upload_receipt_digest
					OR resource_authority->>'deletionAuthorityReceiptDigest'<>
						NEW.deletion_authority_receipt_digest
					OR (resource_authority->>'registeredAt')::timestamptz<>NEW.registered_at
					OR (resource_authority->>'expiresAt')::timestamptz<>NEW.expires_at
					OR (manifest->>'registeredAt')::timestamptz<>NEW.registered_at
					OR (manifest->>'expiresAt')::timestamptz<>NEW.expires_at
					OR (deletion_receipt->>'registeredAt')::timestamptz<>NEW.registered_at
					OR (deletion_receipt->>'expiresAt')::timestamptz<>NEW.expires_at
					OR (upload_receipt->>'uploadedAt')::timestamptz<NEW.claimed_at
					OR (upload_receipt->>'uploadedAt')::timestamptz>NEW.registered_at THEN
					RAISE EXCEPTION 'capability probe provider resource result drifted from its request'
						USING ERRCODE='23514';
				END IF;
				SELECT COUNT(*) INTO component_count
				FROM agent_evaluation_capability_probe_provider_resource_manifests manifest_row
				JOIN agent_evaluation_capability_probe_provider_resource_content_upload_receipts upload_row
				  ON upload_row.namespace_id=manifest_row.namespace_id
				 AND upload_row.repository_commit=manifest_row.repository_commit
				 AND upload_row.request_digest=manifest_row.request_digest
				JOIN agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts deletion_row
				  ON deletion_row.namespace_id=manifest_row.namespace_id
				 AND deletion_row.repository_commit=manifest_row.repository_commit
				 AND deletion_row.request_digest=manifest_row.request_digest
				WHERE manifest_row.namespace_id=NEW.namespace_id
					AND manifest_row.repository_commit=NEW.repository_commit
					AND manifest_row.request_digest=NEW.request_digest
					AND manifest_row.manifest_digest=NEW.resource_manifest_digest
					AND manifest_row.receipt_json=manifest
					AND upload_row.content_upload_receipt_digest=NEW.content_upload_receipt_digest
					AND upload_row.receipt_json=upload_receipt
					AND deletion_row.deletion_authority_receipt_digest=
						NEW.deletion_authority_receipt_digest
					AND deletion_row.receipt_json=deletion_receipt
					AND manifest_row.created_at=NEW.updated_at
					AND upload_row.created_at=NEW.updated_at
					AND deletion_row.created_at=NEW.updated_at;
				IF component_count<>1 THEN
					RAISE EXCEPTION 'capability probe provider resource lacks exact atomic components'
						USING ERRCODE='23514';
				END IF;
			END IF;
			IF NEW.state='sealed' THEN
				IF jsonb_typeof(NEW.response_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.response_json)<>9
					OR NOT (NEW.response_json ?& ARRAY[
						'format','version','requestDigest','providerResourceAuthority',
						'resourceResultDigest','ownerImplementationDigest','stageDigest',
						'dispatchAckDigest','registrationReceiptDigest'
					]) OR NEW.response_json->>'format'<>
						'prodivix.agent-evaluation-capability-probe-provider-resource-registration-response'
					OR (NEW.response_json->>'version')::bigint<>1
					OR NEW.response_json->>'requestDigest'<>NEW.request_digest
					OR NEW.response_json->'providerResourceAuthority'<>resource_authority
					OR NEW.response_json->>'resourceResultDigest'<>NEW.resource_result_digest
					OR NEW.response_json->>'ownerImplementationDigest'<>
						NEW.owner_implementation_digest
					OR NEW.response_json->>'stageDigest'<>NEW.stage_digest
					OR NEW.response_json->>'dispatchAckDigest'<>NEW.dispatch_ack_digest
					OR NEW.response_json->>'registrationReceiptDigest'<>
						NEW.registration_receipt_digest THEN
					RAISE EXCEPTION 'capability probe provider resource sealed response is invalid'
						USING ERRCODE='23514';
				END IF;
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resources_transition
			BEFORE INSERT OR UPDATE OR DELETE
			ON agent_evaluation_capability_probe_provider_resource_registrations
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_provider_resource_transition()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resources_finalized
			BEFORE INSERT OR UPDATE OR DELETE
			ON agent_evaluation_capability_probe_provider_resource_registrations
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_repository_commit_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_probe_admission_provider_resource()
			RETURNS trigger AS $$
		DECLARE
			resource JSONB;
			requires_resource BOOLEAN;
			resource_count BIGINT;
		BEGIN
			resource:=NEW.request_json->'probeProviderResourceAuthority';
			requires_resource:=NEW.qualification_capability_profile_id IN (
				'g4-provider-hosted-retrieval-core','g4-provider-hosted-retrieval-document'
			) AND NEW.protocol_family IN ('gemini-interactions','openai-responses');
			IF requires_resource IS DISTINCT FROM (jsonb_typeof(resource)='object') THEN
				RAISE EXCEPTION 'capability probe admission provider-resource presence drifted'
					USING ERRCODE='23514';
			END IF;
			IF NOT requires_resource THEN
				IF resource IS DISTINCT FROM 'null'::jsonb THEN
					RAISE EXCEPTION 'non-resource capability probe admission carried resource authority'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			IF agent_evaluation_jsonb_object_key_count(resource)<>18
				OR NOT (resource ?& ARRAY[
					'format','version','capabilityProfileId','probeProgramDigest',
					'publicResourceDescriptorDigest','protocolFamily','providerConfigurationId',
					'modelId','modelLineageDigest','adapterDigest','providerResourceKind',
					'providerResourceId','resourceManifestDigest','contentUploadReceiptDigest',
					'deletionAuthorityReceiptDigest','registeredAt','expiresAt','authorityDigest'
				]) OR resource->>'format'<>'prodivix.agent-capability-probe-provider-resource-authority'
				OR (resource->>'version')::bigint<>1
				OR resource->>'capabilityProfileId'<>NEW.qualification_capability_profile_id
				OR resource->>'probeProgramDigest'<>NEW.request_json#>>'{probeProgram,programDigest}'
				OR resource->>'protocolFamily'<>NEW.protocol_family
				OR resource->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR resource->>'modelId'<>NEW.model_id
				OR resource->>'modelLineageDigest'<>NEW.model_lineage_digest
				OR resource->>'adapterDigest'<>NEW.adapter_digest THEN
				RAISE EXCEPTION 'capability probe admission provider-resource shape is invalid'
					USING ERRCODE='23514';
			END IF;
			PERFORM 1
			FROM agent_evaluation_capability_probe_provider_resource_registrations registration
			WHERE registration.namespace_id=NEW.namespace_id
				AND registration.repository_commit=NEW.repository_commit
				AND registration.state='sealed' AND registration.v45_eligible
				AND registration.provider_resource_authority_digest=resource->>'authorityDigest'
			FOR SHARE;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'capability probe admission lacks sealed provider resource authority'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*) INTO resource_count
			FROM agent_evaluation_capability_probe_provider_resource_registrations registration
			WHERE registration.namespace_id=NEW.namespace_id
				AND registration.repository_commit=NEW.repository_commit
				AND registration.state='sealed' AND registration.v45_eligible
				AND registration.provider_resource_authority_digest=resource->>'authorityDigest'
				AND registration.provider_configuration_id=NEW.provider_configuration_id
				AND registration.provider_configuration_digest=NEW.provider_configuration_digest
				AND registration.protocol_family=NEW.protocol_family
				AND registration.model_id=NEW.model_id
				AND registration.model_lineage_digest=NEW.model_lineage_digest
				AND registration.adapter_digest=NEW.adapter_digest
				AND registration.capability_profile_id=NEW.qualification_capability_profile_id
				AND registration.probe_program_digest=resource->>'probeProgramDigest'
				AND registration.public_resource_descriptor_digest=
					resource->>'publicResourceDescriptorDigest'
				AND registration.resource_manifest_digest=resource->>'resourceManifestDigest'
				AND registration.content_upload_receipt_digest=resource->>'contentUploadReceiptDigest'
				AND registration.deletion_authority_receipt_digest=
					resource->>'deletionAuthorityReceiptDigest'
				AND registration.request_json->'providerConfiguration'=
					NEW.request_json->'providerConfiguration'
				AND registration.request_json->'modelLineage'=NEW.request_json->'modelLineage'
				AND registration.request_json->'probeProgram'=NEW.request_json->'probeProgram'
				AND registration.result_json->'providerResourceAuthority'=resource
				AND registration.response_json->'providerResourceAuthority'=resource
				AND registration.minimum_expires_at>=NEW.minimum_expires_at
				AND registration.sealed_at<=NEW.claimed_at
				AND (NEW.probed_at IS NULL OR registration.registered_at<=NEW.probed_at)
				AND (NEW.expires_at IS NULL OR registration.expires_at>=NEW.expires_at);
			IF resource_count<>1 THEN
				RAISE EXCEPTION 'capability probe admission lacks exact sealed provider resource'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_capability_probe_admissions_provider_resource
			BEFORE INSERT OR UPDATE ON agent_evaluation_capability_probe_admissions
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_admission_provider_resource()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_plan_probe_provider_resource_link()
			RETURNS trigger AS $$
		DECLARE
			plan_record RECORD;
			target JSONB;
			planned_resource JSONB;
			admission_resource JSONB;
			resource_count BIGINT;
		BEGIN
			SELECT plan_json,planned_at,expires_at INTO plan_record
			FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR SHARE;
			SELECT value INTO target FROM jsonb_array_elements(
				plan_record.plan_json#>'{value,capabilityQualificationTargets}'
			) value WHERE value->>'targetId'=NEW.target_id;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'capability probe provider-resource link target is absent'
					USING ERRCODE='23514';
			END IF;
			planned_resource:=COALESCE(
				target#>'{optionalCapabilitySupportAuthority,probeProviderResourceAuthority}',
				'null'::jsonb
			);
			SELECT request_json->'probeProviderResourceAuthority' INTO admission_resource
			FROM agent_evaluation_capability_probe_admissions
			WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
				AND request_digest=NEW.request_digest AND state='sealed';
			IF NOT FOUND OR admission_resource IS DISTINCT FROM planned_resource THEN
				RAISE EXCEPTION 'plan target provider-resource authority drifted from admission'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(planned_resource)<>'object' THEN
				RETURN NEW;
			END IF;
			PERFORM 1
			FROM agent_evaluation_capability_probe_provider_resource_registrations registration
			WHERE registration.namespace_id=NEW.namespace_id
				AND registration.repository_commit=NEW.repository_commit
				AND registration.state='sealed' AND registration.v45_eligible
				AND registration.provider_resource_authority_digest=
					planned_resource->>'authorityDigest'
			FOR SHARE;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'plan target provider resource is not durably sealed'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*) INTO resource_count
			FROM agent_evaluation_capability_probe_provider_resource_registrations registration
			WHERE registration.namespace_id=NEW.namespace_id
				AND registration.repository_commit=NEW.repository_commit
				AND registration.state='sealed' AND registration.v45_eligible
				AND registration.provider_resource_authority_digest=
					planned_resource->>'authorityDigest'
				AND registration.result_json->'providerResourceAuthority'=planned_resource
				AND registration.response_json->'providerResourceAuthority'=planned_resource
				AND registration.registered_at<=plan_record.planned_at
				AND registration.expires_at>=plan_record.expires_at;
			IF resource_count<>1 THEN
				RAISE EXCEPTION 'plan target lacks its current sealed provider resource'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_plan_capability_probe_links_provider_resource
			BEFORE INSERT ON agent_evaluation_plan_capability_probe_admission_links
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_plan_probe_provider_resource_link()`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_native_optional_capability_bootstrap_sources (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			attempt_id TEXT NOT NULL,
			descriptor_digest TEXT NOT NULL,
			target_id TEXT NOT NULL,
			target_digest TEXT NOT NULL,
			capability_profile_id TEXT NOT NULL,
			capability_profile_digest TEXT NOT NULL,
			capability_descriptor_digest TEXT NOT NULL,
			capability_id TEXT NOT NULL,
			support_expectation TEXT NOT NULL,
			turn_index BIGINT NOT NULL,
			invocation_id TEXT NOT NULL,
			protocol_family TEXT NOT NULL,
			provider_configuration_id TEXT NOT NULL,
			model_id TEXT NOT NULL,
			model_lineage_digest TEXT NOT NULL,
			adapter_digest TEXT NOT NULL,
			provider_request_digest TEXT NOT NULL,
			provider_response_digest TEXT NOT NULL,
			dispatch_intent_digest TEXT NOT NULL,
			transport_receipt_digest TEXT NOT NULL,
			result_spool_receipt_digest TEXT NOT NULL,
			result_spool_aad_digest TEXT NOT NULL,
			result_spool_envelope_digest TEXT NOT NULL,
			normalized_event_set_digest TEXT NOT NULL,
			source_authority_id TEXT NOT NULL,
			source_authority_implementation_digest TEXT NOT NULL,
			source_authority_route_binding TEXT NOT NULL,
			registration_authority_issuer_id TEXT NOT NULL,
			registration_receipt_digest TEXT NOT NULL,
			runtime_fact_source_authority_digest TEXT NOT NULL,
			probe_program_digest TEXT NOT NULL,
			outcome TEXT NOT NULL,
			native_provider_source_receipt_digest TEXT,
			native_provider_source_digest TEXT,
			fact_kind TEXT,
			fact_digest TEXT,
			ingress_digest TEXT NOT NULL,
			ingress_json JSONB NOT NULL,
			ingress_bytes BYTEA NOT NULL,
			native_provider_source_receipt_json JSONB,
			native_provider_source_receipt_bytes BYTEA,
			fact_json JSONB,
			fact_bytes BYTEA,
			source_request_digest TEXT NOT NULL,
			source_request_json JSONB NOT NULL,
			source_request_bytes BYTEA NOT NULL,
			source_owner_stage_digest TEXT NOT NULL,
			source_owner_dispatch_ack_digest TEXT NOT NULL,
			source_receipt_digest TEXT NOT NULL,
			source_receipt_json JSONB NOT NULL,
			source_receipt_bytes BYTEA NOT NULL,
			optional_authority_request_digest TEXT NOT NULL,
			optional_authority_request_json JSONB NOT NULL,
			optional_authority_request_bytes BYTEA NOT NULL,
			observed_at TIMESTAMPTZ NOT NULL,
			sealed_at TIMESTAMPTZ NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,attempt_id,turn_index),
			UNIQUE (namespace_id,plan_digest,repository_commit,ingress_digest),
			UNIQUE (namespace_id,plan_digest,repository_commit,source_request_digest),
			UNIQUE (namespace_id,plan_digest,repository_commit,source_receipt_digest),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,source_request_digest,source_receipt_digest
			),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,native_provider_source_receipt_digest
			),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,repository_commit,registration_receipt_digest)
				REFERENCES agent_evaluation_runtime_fact_source_owner_registrations(
					namespace_id,repository_commit,registration_receipt_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_native_optional_bootstrap_identity_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND turn_index=0
				AND protocol_family IN (
					'openai-responses','anthropic-messages','gemini-interactions'
				)
				AND support_expectation IN ('required','expected-blocked')
				AND outcome IN ('observed','unavailable','failed')
				AND v45_eligible
				AND (capability_profile_id,capability_profile_digest,capability_id) IN (
					('g4-provider-background-job',
					 'sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195',
					 'provider.background-job'),
					('g4-provider-isolated-cache',
					 'sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103',
					 'provider.isolated-cache'),
					('g4-provider-reasoning-continuation',
					 'sha256-5c84287b4c1e16fb0c1eda862a8e44754503a3fa0a4b61a16e2d2f2465072d34',
					 'provider.reasoning-continuation')
				)
				AND (protocol_family<>'anthropic-messages'
					OR capability_profile_id='g4-provider-isolated-cache')
			),
			CONSTRAINT agent_eval_native_optional_bootstrap_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
				AND target_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_profile_digest ~ '^sha256-[a-f0-9]{64}$'
				AND capability_descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
				AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
				AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
				AND provider_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND provider_response_digest ~ '^sha256-[a-f0-9]{64}$'
				AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
				AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND result_spool_aad_digest ~ '^sha256-[a-f0-9]{64}$'
				AND result_spool_envelope_digest ~ '^sha256-[a-f0-9]{64}$'
				AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
				AND source_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND registration_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND runtime_fact_source_authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND probe_program_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (native_provider_source_receipt_digest IS NULL OR
					native_provider_source_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (native_provider_source_digest IS NULL OR
					native_provider_source_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (fact_digest IS NULL OR fact_digest ~ '^sha256-[a-f0-9]{64}$')
				AND ingress_digest ~ '^sha256-[a-f0-9]{64}$'
				AND source_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND source_owner_stage_digest ~ '^sha256-[a-f0-9]{64}$'
				AND source_owner_dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$'
				AND source_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND optional_authority_request_digest ~ '^sha256-[a-f0-9]{64}$'
			),
			CONSTRAINT agent_eval_native_optional_bootstrap_outcome_check CHECK (
				(outcome='observed'
					AND native_provider_source_receipt_digest IS NOT NULL
					AND native_provider_source_digest IS NOT NULL
					AND fact_kind IS NOT NULL AND fact_digest IS NOT NULL
					AND native_provider_source_receipt_json IS NOT NULL
					AND native_provider_source_receipt_bytes IS NOT NULL
					AND fact_json IS NOT NULL AND fact_bytes IS NOT NULL)
				OR (outcome IN ('unavailable','failed')
					AND native_provider_source_receipt_digest IS NULL
					AND native_provider_source_digest IS NULL
					AND fact_kind IS NULL AND fact_digest IS NULL
					AND native_provider_source_receipt_json IS NULL
					AND native_provider_source_receipt_bytes IS NULL
					AND fact_json IS NULL AND fact_bytes IS NULL)
			),
			CONSTRAINT agent_eval_native_optional_bootstrap_bytes_check CHECK (
				octet_length(ingress_bytes) BETWEEN 1 AND 32768
				AND ingress_json=convert_from(ingress_bytes,'UTF8')::jsonb
				AND (native_provider_source_receipt_json IS NULL)=
					(native_provider_source_receipt_bytes IS NULL)
				AND (native_provider_source_receipt_bytes IS NULL OR (
					octet_length(native_provider_source_receipt_bytes) BETWEEN 1 AND 16384
					AND native_provider_source_receipt_json=
						convert_from(native_provider_source_receipt_bytes,'UTF8')::jsonb
				))
				AND (fact_json IS NULL)=(fact_bytes IS NULL)
				AND (fact_bytes IS NULL OR (
					octet_length(fact_bytes) BETWEEN 1 AND 16384
					AND fact_json=convert_from(fact_bytes,'UTF8')::jsonb
				))
				AND octet_length(source_request_bytes) BETWEEN 1 AND 32768
				AND source_request_json=convert_from(source_request_bytes,'UTF8')::jsonb
				AND octet_length(source_receipt_bytes) BETWEEN 1 AND 32768
				AND source_receipt_json=convert_from(source_receipt_bytes,'UTF8')::jsonb
				AND octet_length(optional_authority_request_bytes) BETWEEN 1 AND 65536
				AND optional_authority_request_json=
					convert_from(optional_authority_request_bytes,'UTF8')::jsonb
			),
			CONSTRAINT agent_eval_native_optional_bootstrap_time_check CHECK (
				sealed_at>=observed_at AND sealed_at<=observed_at+INTERVAL '30 seconds'
			)
		)`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_native_optional_bootstrap_capacity()
			RETURNS trigger AS $$
		DECLARE
			record_count BIGINT;
		BEGIN
			PERFORM 1 FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR UPDATE;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'native optional bootstrap lacks its frozen plan'
					USING ERRCODE='23514';
			END IF;
			IF EXISTS (
				SELECT 1 FROM agent_evaluation_native_optional_capability_bootstrap_sources
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit AND attempt_id=NEW.attempt_id
					AND turn_index=NEW.turn_index
			) THEN
				RETURN NEW;
			END IF;
			SELECT COUNT(*) INTO record_count
			FROM agent_evaluation_native_optional_capability_bootstrap_sources
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit;
			IF record_count>=840 THEN
				RAISE EXCEPTION 'native optional bootstrap exceeds frozen attempt capacity'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_native_optional_bootstrap_binding()
			RETURNS trigger AS $$
		DECLARE
			raw_count BIGINT;
			transport_completed_at TIMESTAMPTZ;
			frozen_count BIGINT;
			runtime_authority JSONB;
			execution_identity JSONB;
			native_source JSONB;
		BEGIN
			IF jsonb_typeof(NEW.ingress_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.ingress_json)<>16
				OR NOT (NEW.ingress_json ?& ARRAY[
					'format','version','attemptId','descriptorDigest','turnIndex','invocationId',
					'providerRequestDigest','providerResponseDigest','dispatchIntentDigest',
					'transportReceiptDigest','resultSpoolAADigest','resultSpoolEnvelopeDigest',
					'normalizedEventSetDigest','outcome','nativeSourceReceipt','ingressDigest'
				]) OR NEW.ingress_json->>'format'<>
					'prodivix.agent-evaluation-native-optional-capability-bootstrap-close-ingress'
				OR (NEW.ingress_json->>'version')::bigint<>1
				OR NEW.ingress_json->>'attemptId'<>NEW.attempt_id
				OR NEW.ingress_json->>'descriptorDigest'<>NEW.descriptor_digest
				OR (NEW.ingress_json->>'turnIndex')::bigint<>NEW.turn_index
				OR NEW.ingress_json->>'invocationId'<>NEW.invocation_id
				OR NEW.ingress_json->>'providerRequestDigest'<>NEW.provider_request_digest
				OR NEW.ingress_json->>'providerResponseDigest'<>NEW.provider_response_digest
				OR NEW.ingress_json->>'dispatchIntentDigest'<>NEW.dispatch_intent_digest
				OR NEW.ingress_json->>'transportReceiptDigest'<>NEW.transport_receipt_digest
				OR NEW.ingress_json->>'resultSpoolAADigest'<>NEW.result_spool_aad_digest
				OR NEW.ingress_json->>'resultSpoolEnvelopeDigest'<>NEW.result_spool_envelope_digest
				OR NEW.ingress_json->>'normalizedEventSetDigest'<>NEW.normalized_event_set_digest
				OR NEW.ingress_json->>'outcome'<>NEW.outcome
				OR NEW.ingress_json->>'ingressDigest'<>NEW.ingress_digest THEN
				RAISE EXCEPTION 'native optional bootstrap ingress binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.source_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.source_request_json)<>28
				OR NOT (NEW.source_request_json ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
					'descriptorDigest','turnIndex','invocationId','providerRequestDigest',
					'providerResponseDigest','protocolFamily','providerConfigurationId',
					'modelLineageDigest','adapterDigest','dispatchIntentDigest','transportReceiptDigest',
					'resultSpoolReceiptDigest','normalizedEventSetDigest','transportCompletedAt',
					'runtimeFactSourceAuthority','probeProgramDigest','outcome','nativeSourceReceipt',
					'nativeSourceReceiptDigest','fact','observedAt','requestDigest'
				]) OR NEW.source_request_json->>'format'<>
					'prodivix.agent-evaluation-native-optional-capability-bootstrap-source-request'
				OR (NEW.source_request_json->>'version')::bigint<>1
				OR NEW.source_request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.source_request_json->>'planDigest'<>NEW.plan_digest
				OR NEW.source_request_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.source_request_json->>'attemptId'<>NEW.attempt_id
				OR NEW.source_request_json->>'descriptorDigest'<>NEW.descriptor_digest
				OR (NEW.source_request_json->>'turnIndex')::bigint<>NEW.turn_index
				OR NEW.source_request_json->>'invocationId'<>NEW.invocation_id
				OR NEW.source_request_json->>'providerRequestDigest'<>NEW.provider_request_digest
				OR NEW.source_request_json->>'providerResponseDigest'<>NEW.provider_response_digest
				OR NEW.source_request_json->>'protocolFamily'<>NEW.protocol_family
				OR NEW.source_request_json->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR NEW.source_request_json->>'modelLineageDigest'<>NEW.model_lineage_digest
				OR NEW.source_request_json->>'adapterDigest'<>NEW.adapter_digest
				OR NEW.source_request_json->>'dispatchIntentDigest'<>NEW.dispatch_intent_digest
				OR NEW.source_request_json->>'transportReceiptDigest'<>NEW.transport_receipt_digest
				OR NEW.source_request_json->>'resultSpoolReceiptDigest'<>NEW.result_spool_receipt_digest
				OR NEW.source_request_json->>'normalizedEventSetDigest'<>NEW.normalized_event_set_digest
				OR NEW.source_request_json->>'probeProgramDigest'<>NEW.probe_program_digest
				OR NEW.source_request_json->>'outcome'<>NEW.outcome
				OR NEW.source_request_json->>'requestDigest'<>NEW.source_request_digest
				OR (NEW.source_request_json->>'observedAt')::timestamptz<>NEW.observed_at THEN
				RAISE EXCEPTION 'native optional bootstrap source request binding is invalid'
					USING ERRCODE='23514';
			END IF;
			runtime_authority:=NEW.source_request_json->'runtimeFactSourceAuthority';
			IF jsonb_typeof(runtime_authority)<>'object'
				OR agent_evaluation_jsonb_object_key_count(runtime_authority)<>16
				OR runtime_authority->>'kind'<>'shared-durable-capability'
				OR runtime_authority->>'sourceKind'<>'sealed-provider-response-metadata'
				OR runtime_authority->>'sourceAuthorityId'<>NEW.source_authority_id
				OR runtime_authority->>'sourceAuthorityImplementationDigest'<>
					NEW.source_authority_implementation_digest
				OR runtime_authority->>'routeBinding'<>NEW.source_authority_route_binding
				OR runtime_authority->>'capabilityProfileId'<>NEW.capability_profile_id
				OR runtime_authority->>'capabilityProfileDigest'<>NEW.capability_profile_digest
				OR runtime_authority->>'capabilityId'<>NEW.capability_id
				OR runtime_authority->>'protocolFamily'<>NEW.protocol_family
				OR runtime_authority->>'providerConfigurationId'<>NEW.provider_configuration_id
				OR runtime_authority->>'modelId'<>NEW.model_id
				OR runtime_authority->>'modelLineageDigest'<>NEW.model_lineage_digest
				OR runtime_authority->>'adapterDigest'<>NEW.adapter_digest
				OR runtime_authority->>'registrationAuthorityIssuerId'<>
					NEW.registration_authority_issuer_id
				OR runtime_authority->>'registrationReceiptDigest'<>NEW.registration_receipt_digest
				OR runtime_authority->>'authorityDigest'<>NEW.runtime_fact_source_authority_digest THEN
				RAISE EXCEPTION 'native optional bootstrap runtime source authority is invalid'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.source_receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.source_receipt_json)<>8
				OR NOT (NEW.source_receipt_json ?& ARRAY[
					'format','version','sourceRequest','sourceRequestDigest','sourceOwnerStageDigest',
					'sourceOwnerDispatchAckDigest','sealedAt','receiptDigest'
				]) OR NEW.source_receipt_json->>'format'<>
					'prodivix.agent-evaluation-native-optional-capability-bootstrap-source-receipt'
				OR (NEW.source_receipt_json->>'version')::bigint<>1
				OR NEW.source_receipt_json->'sourceRequest'<>NEW.source_request_json
				OR NEW.source_receipt_json->>'sourceRequestDigest'<>NEW.source_request_digest
				OR NEW.source_receipt_json->>'sourceOwnerStageDigest'<>NEW.source_owner_stage_digest
				OR NEW.source_receipt_json->>'sourceOwnerDispatchAckDigest'<>
					NEW.source_owner_dispatch_ack_digest
				OR (NEW.source_receipt_json->>'sealedAt')::timestamptz<>NEW.sealed_at
				OR NEW.source_receipt_json->>'receiptDigest'<>NEW.source_receipt_digest THEN
				RAISE EXCEPTION 'native optional bootstrap source receipt binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.optional_authority_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.optional_authority_request_json)<>25
				OR NEW.optional_authority_request_json->>'format'<>
					'prodivix.agent-evaluation-optional-capability-fact-authority-request'
				OR (NEW.optional_authority_request_json->>'version')::bigint<>1
				OR NEW.optional_authority_request_json->>'attemptId'<>NEW.attempt_id
				OR NEW.optional_authority_request_json->>'descriptorDigest'<>NEW.descriptor_digest
				OR NEW.optional_authority_request_json->>'targetId'<>NEW.target_id
				OR NEW.optional_authority_request_json->>'targetDigest'<>NEW.target_digest
				OR NEW.optional_authority_request_json->>'capabilityProfileId'<>NEW.capability_profile_id
				OR NEW.optional_authority_request_json->>'capabilityProfileDigest'<>NEW.capability_profile_digest
				OR NEW.optional_authority_request_json->>'capabilityDescriptorDigest'<>
					NEW.capability_descriptor_digest
				OR NEW.optional_authority_request_json->>'capabilityId'<>NEW.capability_id
				OR NEW.optional_authority_request_json->>'supportExpectation'<>NEW.support_expectation
				OR (NEW.optional_authority_request_json->>'turnIndex')::bigint<>NEW.turn_index
				OR NEW.optional_authority_request_json->>'invocationId'<>NEW.invocation_id
				OR NEW.optional_authority_request_json->>'protocolFamily'<>NEW.protocol_family
				OR NEW.optional_authority_request_json->>'providerConfigurationId'<>
					NEW.provider_configuration_id
				OR NEW.optional_authority_request_json->>'modelId'<>NEW.model_id
				OR NEW.optional_authority_request_json->>'modelLineageDigest'<>NEW.model_lineage_digest
				OR NEW.optional_authority_request_json->>'adapterDigest'<>NEW.adapter_digest
				OR NEW.optional_authority_request_json->>'providerRequestDigest'<>
					NEW.provider_request_digest
				OR NEW.optional_authority_request_json->>'responseDigest'<>NEW.provider_response_digest
				OR NEW.optional_authority_request_json->>'dispatchIntentDigest'<>
					NEW.dispatch_intent_digest
				OR NEW.optional_authority_request_json->>'transportReceiptDigest'<>
					NEW.transport_receipt_digest
				OR NEW.optional_authority_request_json->>'resultSpoolReceiptDigest'<>
					NEW.result_spool_receipt_digest
				OR NEW.optional_authority_request_json->>'normalizedEventSetDigest'<>
					NEW.normalized_event_set_digest
				OR NEW.optional_authority_request_json#>>'{source,kind}'<>
					'sealed-provider-response-metadata'
				OR NEW.optional_authority_request_json#>>'{source,nativeBootstrapSourceRequestDigest}'<>
					NEW.source_request_digest THEN
				RAISE EXCEPTION 'native optional bootstrap authority request binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF NEW.outcome='observed' THEN
				execution_identity:=
					NEW.native_provider_source_receipt_json->'executionIdentityAuthority';
				native_source:=NEW.native_provider_source_receipt_json->'source';
				IF jsonb_typeof(NEW.native_provider_source_receipt_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(
						NEW.native_provider_source_receipt_json
					)<>17
					OR NOT (NEW.native_provider_source_receipt_json ?& ARRAY[
						'format','version','protocolFamily','capabilityProfileId',
						'capabilityProfileDigest','invocationId','requestDigest',
						'responseDigest','providerConfigurationId','modelLineageDigest',
						'adapterDigest','executionIdentityAuthority','source','sourceDigest',
						'fact','observedAt','receiptDigest'
					])
					OR NEW.native_provider_source_receipt_json->>'format' IS DISTINCT FROM
						'prodivix.agent-native-provider-optional-capability-source-receipt'
					OR (NEW.native_provider_source_receipt_json->>'version')::bigint
						IS DISTINCT FROM 1
					OR NEW.native_provider_source_receipt_json->>'protocolFamily'
						IS DISTINCT FROM NEW.protocol_family
					OR NEW.native_provider_source_receipt_json->>'capabilityProfileId'
						IS DISTINCT FROM
						NEW.capability_profile_id
					OR NEW.native_provider_source_receipt_json->>'capabilityProfileDigest'
						IS DISTINCT FROM
						NEW.capability_profile_digest
					OR NEW.native_provider_source_receipt_json->>'invocationId'
						IS DISTINCT FROM NEW.invocation_id
					OR NEW.native_provider_source_receipt_json->>'requestDigest'
						IS DISTINCT FROM NEW.provider_request_digest
					OR NEW.native_provider_source_receipt_json->>'responseDigest'
						IS DISTINCT FROM NEW.provider_response_digest
					OR NEW.native_provider_source_receipt_json->>'providerConfigurationId'
						IS DISTINCT FROM
						NEW.provider_configuration_id
					OR NEW.native_provider_source_receipt_json->>'modelLineageDigest'
						IS DISTINCT FROM
						NEW.model_lineage_digest
					OR NEW.native_provider_source_receipt_json->>'adapterDigest'
						IS DISTINCT FROM NEW.adapter_digest
					OR NEW.native_provider_source_receipt_json->>'sourceDigest'
						IS DISTINCT FROM
						NEW.native_provider_source_digest
					OR NEW.native_provider_source_receipt_json->>'receiptDigest'
						IS DISTINCT FROM
						NEW.native_provider_source_receipt_digest
					OR (NEW.native_provider_source_receipt_json->>'observedAt')::timestamptz
						IS DISTINCT FROM
						NEW.observed_at
					OR jsonb_typeof(execution_identity)<>'object'
					OR agent_evaluation_jsonb_object_key_count(execution_identity)<>7
					OR NOT (execution_identity ?& ARRAY[
						'format','version','invocationId','taskId','runId','generation',
						'authorityDigest'
					])
					OR execution_identity->>'format' IS DISTINCT FROM
						'prodivix.agent-native-provider-execution-identity-authority'
					OR (execution_identity->>'version')::bigint IS DISTINCT FROM 1
					OR execution_identity->>'invocationId' IS DISTINCT FROM NEW.invocation_id
					OR execution_identity->>'taskId' IS NULL
					OR execution_identity->>'taskId' !~
						'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					OR execution_identity->>'runId' IS NULL
					OR execution_identity->>'runId' !~
						'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					OR (execution_identity->>'generation')::bigint IS NULL
					OR (execution_identity->>'generation')::bigint<0
					OR execution_identity->>'authorityDigest' IS NULL
					OR execution_identity->>'authorityDigest' !~ '^sha256-[a-f0-9]{64}$'
					OR NOT COALESCE(
						(native_source->>'sourceKind'='provider-job-active-status'
							AND NEW.capability_profile_id='g4-provider-background-job'
							AND agent_evaluation_jsonb_object_key_count(native_source)=10
							AND native_source ?& ARRAY[
								'sourceKind','providerStateReferenceDigest','opaqueProviderStateRef',
								'stateVaultAuthorityDigest','stateVaultSealRequestDigest',
								'stateVaultSealReceiptDigest','taskId','runId','generation',
								'providerStatus'
							]
							AND native_source->>'providerStateReferenceDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'opaqueProviderStateRef' ~
								'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
							AND native_source->>'stateVaultAuthorityDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'stateVaultSealRequestDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'stateVaultSealReceiptDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'taskId'=execution_identity->>'taskId'
							AND native_source->>'runId'=execution_identity->>'runId'
							AND (native_source->>'generation')::bigint=
								(execution_identity->>'generation')::bigint
							AND native_source->>'providerStatus' IN ('in-progress','queued')
							AND NEW.fact_kind='provider-job-receipt'
							AND jsonb_typeof(NEW.fact_json->'value')='object'
							AND agent_evaluation_jsonb_object_key_count(NEW.fact_json->'value')=8
							AND NEW.fact_json->'value' ?& ARRAY[
								'providerJobId','taskId','runId','generation','invocationId',
								'phase','callbackAuthority','receiptDigest'
							]
							AND NEW.fact_json#>>'{value,providerJobId}'=
								'provider-job.'||substring(
									native_source->>'providerStateReferenceDigest' FROM 8
								)
							AND NEW.fact_json#>>'{value,taskId}'=native_source->>'taskId'
							AND NEW.fact_json#>>'{value,runId}'=native_source->>'runId'
							AND (NEW.fact_json#>>'{value,generation}')::bigint=
								(native_source->>'generation')::bigint
							AND NEW.fact_json#>>'{value,invocationId}'=NEW.invocation_id
							AND NEW.fact_json#>>'{value,phase}'=CASE native_source->>'providerStatus'
								WHEN 'queued' THEN 'accepted' ELSE 'running' END
							AND NEW.fact_json#>>'{value,callbackAuthority}'='active'
							AND NEW.fact_json#>>'{value,receiptDigest}'=NEW.fact_digest)
						OR (native_source->>'sourceKind'='provider-job-terminal-status'
							AND NEW.capability_profile_id='g4-provider-background-job'
							AND agent_evaluation_jsonb_object_key_count(native_source)=10
							AND native_source ?& ARRAY[
								'sourceKind','providerStateReferenceDigest','opaqueProviderStateRef',
								'stateVaultAuthorityDigest','stateVaultSealRequestDigest',
								'stateVaultSealReceiptDigest','taskId','runId','generation',
								'providerStatus'
							]
							AND native_source->>'providerStateReferenceDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'opaqueProviderStateRef' ~
								'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
							AND native_source->>'stateVaultAuthorityDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'stateVaultSealRequestDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'stateVaultSealReceiptDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'taskId'=execution_identity->>'taskId'
							AND native_source->>'runId'=execution_identity->>'runId'
							AND (native_source->>'generation')::bigint=
								(execution_identity->>'generation')::bigint
							AND native_source->>'providerStatus' IN ('cancelled','completed','failed')
							AND NEW.fact_kind='provider-job-receipt'
							AND jsonb_typeof(NEW.fact_json->'value')='object'
							AND agent_evaluation_jsonb_object_key_count(NEW.fact_json->'value')=9
							AND NEW.fact_json->'value' ?& ARRAY[
								'providerJobId','taskId','runId','generation','invocationId',
								'phase','outcome','callbackAuthority','receiptDigest'
							]
							AND NEW.fact_json#>>'{value,providerJobId}'=
								'provider-job.'||substring(
									native_source->>'providerStateReferenceDigest' FROM 8
								)
							AND NEW.fact_json#>>'{value,taskId}'=native_source->>'taskId'
							AND NEW.fact_json#>>'{value,runId}'=native_source->>'runId'
							AND (NEW.fact_json#>>'{value,generation}')::bigint=
								(native_source->>'generation')::bigint
							AND NEW.fact_json#>>'{value,invocationId}'=NEW.invocation_id
							AND NEW.fact_json#>>'{value,phase}'='terminal'
							AND NEW.fact_json#>>'{value,outcome}'=native_source->>'providerStatus'
							AND NEW.fact_json#>>'{value,callbackAuthority}'='revoked'
							AND NEW.fact_json#>>'{value,receiptDigest}'=NEW.fact_digest)
						OR (native_source->>'sourceKind'='provider-cache-usage'
							AND NEW.capability_profile_id='g4-provider-isolated-cache'
							AND agent_evaluation_jsonb_object_key_count(native_source)=9
							AND native_source ?& ARRAY[
								'sourceKind','cacheIsolationAuthorityDigest','cacheKeyDigest',
								'prefixDescriptorDigest','usageVector','cachedTokenCount',
								'cacheScope','provenIsolation','providerRegion'
							]
							AND native_source->>'cacheIsolationAuthorityDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'cacheKeyDigest' ~ '^sha256-[a-f0-9]{64}$'
							AND native_source->>'prefixDescriptorDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND jsonb_typeof(native_source->'usageVector')='object'
							AND (native_source->>'cachedTokenCount')::bigint>0
							AND native_source->>'cacheScope' IN ('invocation','task','workspace')
							AND native_source->>'provenIsolation' IN
								('invocation','task','workspace')
							AND (native_source->'providerRegion'='null'::jsonb OR (
								jsonb_typeof(native_source->'providerRegion')='string'
								AND native_source->>'providerRegion' ~
									'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
							)))
						OR (native_source->>'sourceKind'='provider-stored-continuation'
							AND NEW.capability_profile_id='g4-provider-reasoning-continuation'
							AND agent_evaluation_jsonb_object_key_count(native_source)=10
							AND native_source ?& ARRAY[
								'sourceKind','providerStateReferenceDigest','opaqueProviderStateRef',
								'stateVaultAuthorityDigest','stateVaultSealRequestDigest',
								'stateVaultSealReceiptDigest','taskId','runId','generation','expiresAt'
							]
							AND native_source->>'providerStateReferenceDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'opaqueProviderStateRef' ~
								'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
							AND native_source->>'stateVaultAuthorityDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'stateVaultSealRequestDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'stateVaultSealReceiptDigest' ~
								'^sha256-[a-f0-9]{64}$'
							AND native_source->>'taskId'=execution_identity->>'taskId'
							AND native_source->>'runId'=execution_identity->>'runId'
							AND (native_source->>'generation')::bigint=
								(execution_identity->>'generation')::bigint
							AND (native_source->>'expiresAt')::timestamptz>NEW.observed_at
							AND (native_source->>'expiresAt')::timestamptz<=
								NEW.observed_at+INTERVAL '125 seconds'),
						FALSE
					)
					OR jsonb_typeof(NEW.native_provider_source_receipt_json->'fact')<>'object'
					OR agent_evaluation_jsonb_object_key_count(
						NEW.native_provider_source_receipt_json->'fact'
					)<>2
					OR NOT (NEW.native_provider_source_receipt_json->'fact' ?&
						ARRAY['factType','value'])
					OR NEW.native_provider_source_receipt_json#>>'{fact,factType}'
						IS DISTINCT FROM NEW.fact_kind
					OR jsonb_typeof(NEW.fact_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.fact_json)<>3
					OR NOT (NEW.fact_json ?& ARRAY['factKind','factDigest','value'])
					OR NEW.fact_json->>'factKind' IS DISTINCT FROM NEW.fact_kind
					OR NEW.fact_json->>'factDigest' IS DISTINCT FROM NEW.fact_digest
					OR NEW.native_provider_source_receipt_json#>'{fact,value}'
						IS DISTINCT FROM NEW.fact_json->'value'
					OR NEW.source_request_json->'nativeSourceReceipt'<>
						NEW.native_provider_source_receipt_json
					OR NEW.source_request_json->>'nativeSourceReceiptDigest'<>
						NEW.native_provider_source_receipt_digest
					OR NEW.source_request_json->'fact'<>NEW.fact_json
					OR NEW.ingress_json->'nativeSourceReceipt'<>
						NEW.native_provider_source_receipt_json THEN
					RAISE EXCEPTION 'native optional bootstrap observed fact binding is invalid'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.source_request_json->'nativeSourceReceipt' IS DISTINCT FROM 'null'::jsonb
				OR NEW.source_request_json->'nativeSourceReceiptDigest' IS DISTINCT FROM 'null'::jsonb
				OR NEW.source_request_json->'fact' IS DISTINCT FROM 'null'::jsonb
				OR NEW.ingress_json->'nativeSourceReceipt' IS DISTINCT FROM 'null'::jsonb THEN
				RAISE EXCEPTION 'native optional bootstrap empty outcome carried a fact'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*),MAX(transport.completed_at)
			INTO raw_count,transport_completed_at
			FROM agent_evaluation_transport_dispatch_intents intent
			JOIN agent_evaluation_transport_receipts transport
			  ON transport.namespace_id=intent.namespace_id
			 AND transport.plan_digest=intent.plan_digest
			 AND transport.attempt_id=intent.attempt_id
			 AND transport.turn_index=intent.turn_index
			JOIN agent_evaluation_provider_result_spool_receipts spool
			  ON spool.namespace_id=intent.namespace_id
			 AND spool.plan_digest=intent.plan_digest
			 AND spool.attempt_id=intent.attempt_id
			 AND spool.turn_index=intent.turn_index
			JOIN agent_evaluation_provider_result_spool_payloads payload
			  ON payload.namespace_id=intent.namespace_id
			 AND payload.plan_digest=intent.plan_digest
			 AND payload.attempt_id=intent.attempt_id
			 AND payload.turn_index=intent.turn_index
			WHERE intent.namespace_id=NEW.namespace_id
				AND intent.plan_digest=NEW.plan_digest
				AND intent.repository_commit=NEW.repository_commit
				AND transport.repository_commit=NEW.repository_commit
				AND spool.repository_commit=NEW.repository_commit
				AND payload.repository_commit=NEW.repository_commit
				AND intent.attempt_id=NEW.attempt_id
				AND intent.descriptor_digest=NEW.descriptor_digest
				AND transport.descriptor_digest=NEW.descriptor_digest
				AND spool.descriptor_digest=NEW.descriptor_digest
				AND intent.descriptor_json->>'targetId'=NEW.target_id
				AND intent.descriptor_json->>'targetDigest'=NEW.target_digest
				AND intent.descriptor_json->>'capabilityDescriptorDigest'=
					NEW.capability_descriptor_digest
				AND intent.turn_index=NEW.turn_index
				AND intent.invocation_id=NEW.invocation_id
				AND transport.invocation_id=NEW.invocation_id
				AND spool.invocation_id=NEW.invocation_id
				AND intent.protocol_family=NEW.protocol_family
				AND intent.provider_configuration_id=NEW.provider_configuration_id
				AND transport.provider_configuration_id=NEW.provider_configuration_id
				AND intent.model_lineage_digest=NEW.model_lineage_digest
				AND intent.request_digest=NEW.provider_request_digest
				AND intent.intent_digest=NEW.dispatch_intent_digest
				AND transport.intent_digest=NEW.dispatch_intent_digest
				AND transport.receipt_digest=NEW.transport_receipt_digest
				AND transport.outcome='completed' AND transport.dispatch_state='dispatched'
				AND spool.receipt_digest=NEW.result_spool_receipt_digest
				AND spool.dispatch_intent_digest=NEW.dispatch_intent_digest
				AND spool.transport_receipt_digest=NEW.transport_receipt_digest
				AND spool.response_body_digest=transport.response_body_digest
				AND spool.response_digest=NEW.provider_response_digest
				AND spool.aad_digest=NEW.result_spool_aad_digest
				AND spool.envelope_digest=NEW.result_spool_envelope_digest
				AND spool.normalized_event_set_digest=NEW.normalized_event_set_digest
				AND payload.spool_ref=spool.spool_ref
				AND payload.envelope_digest=NEW.result_spool_envelope_digest
				AND payload.key_id=spool.key_id
				AND payload.key_version=spool.key_version
				AND payload.ciphertext_digest=spool.ciphertext_digest
				AND payload.ciphertext_size_bytes=spool.ciphertext_size_bytes
				AND payload.aad_json=convert_from(payload.aad_bytes,'UTF8')::jsonb
				AND payload.envelope_json=convert_from(payload.envelope_bytes,'UTF8')::jsonb
				AND payload.aad_json->>'planDigest'=NEW.plan_digest
				AND payload.aad_json->>'repositoryCommit'=NEW.repository_commit
				AND payload.aad_json->>'attemptId'=NEW.attempt_id
				AND payload.aad_json->>'descriptorDigest'=NEW.descriptor_digest
				AND (payload.aad_json->>'turnIndex')::bigint=NEW.turn_index
				AND payload.aad_json->>'invocationId'=NEW.invocation_id
				AND payload.aad_json->>'dispatchIntentDigest'=NEW.dispatch_intent_digest
				AND payload.aad_json->>'transportReceiptDigest'=NEW.transport_receipt_digest
				AND payload.aad_json->>'responseBodyDigest'=spool.response_body_digest
				AND payload.aad_json->>'normalizedEventSetDigest'=NEW.normalized_event_set_digest
				AND payload.envelope_json->>'aadDigest'=NEW.result_spool_aad_digest
				AND payload.envelope_json->>'envelopeDigest'=NEW.result_spool_envelope_digest
				AND payload.envelope_json->>'ciphertextDigest'=payload.ciphertext_digest
				AND (payload.envelope_json->>'ciphertextSizeBytes')::bigint=
					payload.ciphertext_size_bytes;
			IF raw_count<>1
				OR (NEW.source_request_json->>'transportCompletedAt')::timestamptz<>
					transport_completed_at
				OR NEW.observed_at<transport_completed_at
				OR NEW.observed_at>transport_completed_at+INTERVAL '30 seconds'
				OR (NEW.outcome<>'observed' AND NEW.observed_at<>transport_completed_at) THEN
				RAISE EXCEPTION 'native optional bootstrap drifted from raw transport/spool authority'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*) INTO frozen_count
			FROM agent_evaluation_plans plan
			CROSS JOIN LATERAL jsonb_array_elements(
				plan.plan_json#>'{value,capabilityQualificationTargets}'
			) target
			CROSS JOIN LATERAL jsonb_array_elements(
				plan.plan_json#>'{value,providerConfigurations}'
			) provider
			JOIN agent_evaluation_runtime_fact_source_owner_registrations registration
			  ON registration.namespace_id=plan.namespace_id
			 AND registration.repository_commit=plan.repository_commit
			JOIN agent_evaluation_plan_capability_probe_admission_links probe_link
			  ON probe_link.namespace_id=plan.namespace_id
			 AND probe_link.plan_digest=plan.plan_digest
			 AND probe_link.repository_commit=plan.repository_commit
			 AND probe_link.target_id=NEW.target_id
			JOIN agent_evaluation_capability_probe_admissions admission
			  ON admission.namespace_id=probe_link.namespace_id
			 AND admission.repository_commit=probe_link.repository_commit
			 AND admission.request_digest=probe_link.request_digest
			WHERE plan.namespace_id=NEW.namespace_id AND plan.plan_digest=NEW.plan_digest
				AND plan.repository_commit=NEW.repository_commit
				AND target->>'targetId'=NEW.target_id
				AND target->>'targetDigest'=NEW.target_digest
				AND target->>'capabilityProfileId'=NEW.capability_profile_id
				AND target->>'capabilityProfileDigest'=NEW.capability_profile_digest
				AND target->>'protocolFamily'=NEW.protocol_family
				AND target->>'providerConfigurationId'=NEW.provider_configuration_id
				AND target->>'modelId'=NEW.model_id
				AND target->>'modelLineageDigest'=NEW.model_lineage_digest
				AND target#>>'{optionalCapabilitySupportAuthority,capabilityId}'=NEW.capability_id
				AND target#>>'{optionalCapabilitySupportAuthority,supportExpectation}'=
					NEW.support_expectation
				AND target#>>'{optionalCapabilitySupportAuthority,resolvedCapabilityDescriptor,descriptorDigest}'=
					NEW.capability_descriptor_digest
				AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,sourceKind}'=
					'sealed-provider-response-metadata'
				AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,authorityDigest}'=
					NEW.runtime_fact_source_authority_digest
				AND target#>>'{optionalCapabilitySupportAuthority,probeEvidence,probeProgram,programDigest}'=
					NEW.probe_program_digest
				AND target#>>'{optionalCapabilitySupportAuthority,probeEvidence,normalizedObservation,probeProgramDigest}'=
					NEW.probe_program_digest
				AND provider->>'providerConfigurationId'=NEW.provider_configuration_id
				AND provider#>>'{adapter,protocolFamily}'=NEW.protocol_family
				AND provider#>>'{adapter,adapterDigest}'=NEW.adapter_digest
				AND registration.state='sealed' AND registration.v45_eligible
				AND registration.registration_receipt_digest=NEW.registration_receipt_digest
				AND registration.source_authority_kind='shared-durable-capability'
				AND registration.source_kind='sealed-provider-response-metadata'
				AND registration.source_authority_id=NEW.source_authority_id
				AND registration.source_authority_implementation_digest=
					NEW.source_authority_implementation_digest
				AND registration.route_binding=NEW.source_authority_route_binding
				AND registration.capability_profile_id=NEW.capability_profile_id
				AND registration.capability_profile_digest=NEW.capability_profile_digest
				AND registration.capability_id=NEW.capability_id
				AND registration.protocol_family=NEW.protocol_family
				AND registration.provider_configuration_id=NEW.provider_configuration_id
				AND registration.model_id=NEW.model_id
				AND registration.model_lineage_digest=NEW.model_lineage_digest
				AND registration.adapter_digest=NEW.adapter_digest
				AND registration.registration_authority_issuer_id=
					NEW.registration_authority_issuer_id
				AND registration.minimum_expires_at>=plan.expires_at
				AND registration.registered_at<=plan.planned_at
				AND registration.registered_at<=NEW.observed_at
				AND registration.expires_at>=plan.expires_at
				AND registration.expires_at>=NEW.sealed_at
				AND admission.state='sealed'
				AND admission.qualification_capability_profile_id=NEW.capability_profile_id
				AND admission.qualification_capability_profile_digest=NEW.capability_profile_digest
				AND admission.capability_id=NEW.capability_id
				AND admission.probe_status IN ('supported','unsupported')
				AND admission.response_json->'probeEvidence'=
					target#>'{optionalCapabilitySupportAuthority,probeEvidence}';
			IF frozen_count<>1 THEN
				RAISE EXCEPTION 'native optional bootstrap lacks exact plan, registration, and probe authority'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_native_optional_bootstrap_capacity
			BEFORE INSERT ON agent_evaluation_native_optional_capability_bootstrap_sources
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_native_optional_bootstrap_capacity()`,
		`CREATE TRIGGER agent_evaluation_native_optional_bootstrap_exact_binding
			BEFORE INSERT ON agent_evaluation_native_optional_capability_bootstrap_sources
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_native_optional_bootstrap_binding()`,
		`CREATE TRIGGER agent_evaluation_native_optional_bootstrap_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_native_optional_capability_bootstrap_sources
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_evaluation_native_optional_bootstrap_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_native_optional_capability_bootstrap_sources
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE TRIGGER agent_evaluation_optional_fact_sources_native_bootstrap_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_optional_capability_fact_sources
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`ALTER TABLE agent_evaluation_optional_capability_fact_sources
			ADD CONSTRAINT agent_eval_optional_fact_native_bootstrap_fk FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,
				native_bootstrap_source_request_digest,native_bootstrap_source_receipt_digest
			) REFERENCES agent_evaluation_native_optional_capability_bootstrap_sources(
				namespace_id,plan_digest,repository_commit,source_request_digest,source_receipt_digest
			) ON DELETE RESTRICT`,
	}
}
