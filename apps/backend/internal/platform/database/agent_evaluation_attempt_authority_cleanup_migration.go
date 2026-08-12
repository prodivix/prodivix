package database

// agentEvaluationAttemptAuthorityCleanupStatements adds the fresh-v45 durable
// provider-resource cleanup authority. The pre-plan registration partition has
// exactly one immutable cleanup per sealed provider resource and is joined into
// the frozen plan through its raw deletion and cleanup receipt preimages.
func agentEvaluationAttemptAuthorityCleanupStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_cleanups (
			namespace_id TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			cleanup_request_digest TEXT NOT NULL,
			resource_registration_request_digest TEXT NOT NULL,
			deletion_authority_receipt_digest TEXT NOT NULL,
			state TEXT NOT NULL,
			claim_generation BIGINT NOT NULL DEFAULT 1,
			owner_implementation_digest TEXT NOT NULL,
			authority_issuer_id TEXT NOT NULL,
			stage_digest TEXT,
			cleanup_receipt_digest TEXT,
			owner_admission_digest TEXT,
			dispatch_ack_digest TEXT,
			result_ingress_digest TEXT,
			result_ingress_receipt_digest TEXT,
			response_digest TEXT,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			response_json JSONB,
			response_bytes BYTEA,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			claimed_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			dispatched_at TIMESTAMPTZ,
			completed_at TIMESTAMPTZ,
			sealed_at TIMESTAMPTZ,
			PRIMARY KEY (namespace_id,repository_commit,cleanup_request_digest),
			UNIQUE (namespace_id,repository_commit,resource_registration_request_digest),
			UNIQUE (
				namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest
			),
			FOREIGN KEY (
				namespace_id,repository_commit,resource_registration_request_digest,
				deletion_authority_receipt_digest
			) REFERENCES agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts(
				namespace_id,repository_commit,request_digest,deletion_authority_receipt_digest
			) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_probe_provider_resource_cleanup_identity_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND cleanup_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND resource_registration_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND deletion_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND claim_generation=1
				AND owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND authority_issuer_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND state IN ('claimed','dispatched','sealed')
				AND v45_eligible
				AND (stage_digest IS NULL OR stage_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (cleanup_receipt_digest IS NULL OR
					cleanup_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (owner_admission_digest IS NULL OR
					owner_admission_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (dispatch_ack_digest IS NULL OR dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (result_ingress_digest IS NULL OR
					result_ingress_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (result_ingress_receipt_digest IS NULL OR
					result_ingress_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (response_digest IS NULL OR response_digest ~ '^sha256-[a-f0-9]{64}$')
			),
			CONSTRAINT agent_eval_probe_provider_resource_cleanup_bytes_check CHECK (
				octet_length(request_bytes) BETWEEN 1 AND 16384
				AND request_json=convert_from(request_bytes,'UTF8')::jsonb
				AND (response_json IS NULL)=(response_bytes IS NULL)
				AND (response_bytes IS NULL OR (
					octet_length(response_bytes) BETWEEN 1 AND 131072
					AND response_json=convert_from(response_bytes,'UTF8')::jsonb
				))
			),
			CONSTRAINT agent_eval_probe_provider_resource_cleanup_state_check CHECK (
				(state='claimed'
					AND stage_digest IS NULL AND cleanup_receipt_digest IS NULL
					AND owner_admission_digest IS NULL AND dispatch_ack_digest IS NULL
					AND result_ingress_digest IS NULL AND result_ingress_receipt_digest IS NULL
					AND response_digest IS NULL AND response_json IS NULL
					AND dispatched_at IS NULL AND completed_at IS NULL AND sealed_at IS NULL
					AND updated_at=claimed_at)
				OR (state='dispatched' AND stage_digest IS NOT NULL
					AND dispatched_at IS NOT NULL AND dispatched_at>=claimed_at
					AND response_digest IS NULL AND response_json IS NULL AND sealed_at IS NULL
					AND (
						(cleanup_receipt_digest IS NULL AND owner_admission_digest IS NULL
							AND dispatch_ack_digest IS NULL AND result_ingress_digest IS NULL
							AND result_ingress_receipt_digest IS NULL AND completed_at IS NULL
							AND updated_at=dispatched_at)
						OR (cleanup_receipt_digest IS NOT NULL AND owner_admission_digest IS NOT NULL
							AND dispatch_ack_digest IS NOT NULL AND result_ingress_digest IS NOT NULL
							AND result_ingress_receipt_digest IS NOT NULL AND completed_at IS NOT NULL
							AND completed_at>=dispatched_at AND updated_at>=completed_at)
					))
				OR (state='sealed' AND stage_digest IS NOT NULL
					AND cleanup_receipt_digest IS NOT NULL AND owner_admission_digest IS NOT NULL
					AND dispatch_ack_digest IS NOT NULL AND result_ingress_digest IS NOT NULL
					AND result_ingress_receipt_digest IS NOT NULL AND response_digest IS NOT NULL
					AND response_json IS NOT NULL AND dispatched_at IS NOT NULL
					AND completed_at IS NOT NULL AND sealed_at IS NOT NULL
					AND completed_at>=dispatched_at AND sealed_at>=completed_at
					AND updated_at=sealed_at)
			)
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS agent_evaluation_probe_provider_resource_cleanup_receipt_unique
			ON agent_evaluation_capability_probe_provider_resource_cleanups(
				namespace_id,repository_commit,cleanup_receipt_digest
			) WHERE cleanup_receipt_digest IS NOT NULL`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_provider_resource_cleanup_receipts (
			namespace_id TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			cleanup_request_digest TEXT NOT NULL,
			cleanup_receipt_digest TEXT NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id,repository_commit,cleanup_request_digest),
			UNIQUE (namespace_id,repository_commit,cleanup_receipt_digest),
			UNIQUE (
				namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest
			),
			FOREIGN KEY (namespace_id,repository_commit,cleanup_request_digest)
				REFERENCES agent_evaluation_capability_probe_provider_resource_cleanups(
					namespace_id,repository_commit,cleanup_request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_probe_provider_resource_cleanup_receipt_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND cleanup_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND cleanup_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND octet_length(receipt_bytes) BETWEEN 1 AND 65536
				AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb
			)
		)`,
		`ALTER TABLE agent_evaluation_capability_probe_provider_resource_cleanups
			ADD CONSTRAINT agent_eval_probe_provider_resource_cleanup_receipt_fk FOREIGN KEY (
				namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest
			) REFERENCES agent_evaluation_capability_probe_provider_resource_cleanup_receipts(
				namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest
			) ON DELETE RESTRICT`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_probe_provider_resource_cleanup_capacity()
			RETURNS trigger AS $$
		DECLARE
			record_count BIGINT;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtext(NEW.namespace_id),hashtext(NEW.repository_commit));
			IF EXISTS (
				SELECT 1 FROM agent_evaluation_capability_probe_provider_resource_cleanups
				WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
					AND cleanup_request_digest=NEW.cleanup_request_digest
			) THEN
				RETURN NEW;
			END IF;
			SELECT COUNT(*) INTO record_count
			FROM agent_evaluation_capability_probe_provider_resource_cleanups
			WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit;
			IF record_count>=4 THEN
				RAISE EXCEPTION 'capability probe provider resource cleanup exceeds frozen capacity'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_probe_provider_resource_cleanup_transition()
			RETURNS trigger AS $$
		DECLARE
			parent_count BIGINT;
			parent_sealed_at TIMESTAMPTZ;
			component_json JSONB;
			component_bytes BYTEA;
			component_created_at TIMESTAMPTZ;
		BEGIN
			IF TG_OP='DELETE' THEN
				RAISE EXCEPTION 'capability probe provider resource cleanup is immutable'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>6
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','repositoryCommit','resourceRegistrationRequestDigest',
					'deletionAuthorityReceiptDigest','cleanupRequestDigest'
				]) OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.request_json->>'resourceRegistrationRequestDigest'<>
					NEW.resource_registration_request_digest
				OR NEW.request_json->>'deletionAuthorityReceiptDigest'<>
					NEW.deletion_authority_receipt_digest
				OR NEW.request_json->>'cleanupRequestDigest'<>NEW.cleanup_request_digest THEN
				RAISE EXCEPTION 'capability probe provider resource cleanup request binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='INSERT' THEN
				SELECT COUNT(*),MAX(registration.sealed_at) INTO parent_count,parent_sealed_at
				FROM agent_evaluation_capability_probe_provider_resource_registrations registration
				JOIN agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts deletion
				  ON deletion.namespace_id=registration.namespace_id
				 AND deletion.repository_commit=registration.repository_commit
				 AND deletion.request_digest=registration.request_digest
				 AND deletion.deletion_authority_receipt_digest=
					registration.deletion_authority_receipt_digest
				WHERE registration.namespace_id=NEW.namespace_id
					AND registration.repository_commit=NEW.repository_commit
					AND registration.request_digest=NEW.resource_registration_request_digest
					AND registration.deletion_authority_receipt_digest=
						NEW.deletion_authority_receipt_digest
					AND registration.state='sealed' AND registration.v45_eligible;
				IF parent_count<>1 OR parent_sealed_at>NEW.claimed_at THEN
					RAISE EXCEPTION 'cleanup lacks its sealed provider resource registration'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			IF OLD.namespace_id IS DISTINCT FROM NEW.namespace_id
				OR OLD.repository_commit IS DISTINCT FROM NEW.repository_commit
				OR OLD.cleanup_request_digest IS DISTINCT FROM NEW.cleanup_request_digest
				OR OLD.resource_registration_request_digest IS DISTINCT FROM
					NEW.resource_registration_request_digest
				OR OLD.deletion_authority_receipt_digest IS DISTINCT FROM
					NEW.deletion_authority_receipt_digest
				OR OLD.claim_generation IS DISTINCT FROM NEW.claim_generation
				OR OLD.owner_implementation_digest IS DISTINCT FROM NEW.owner_implementation_digest
				OR OLD.authority_issuer_id IS DISTINCT FROM NEW.authority_issuer_id
				OR OLD.request_json IS DISTINCT FROM NEW.request_json
				OR OLD.request_bytes IS DISTINCT FROM NEW.request_bytes
				OR OLD.v45_eligible IS DISTINCT FROM NEW.v45_eligible
				OR OLD.claimed_at IS DISTINCT FROM NEW.claimed_at THEN
				RAISE EXCEPTION 'provider resource cleanup changed immutable authority fields'
					USING ERRCODE='23514';
			END IF;
			IF OLD.state='claimed' AND NEW.state='dispatched' THEN
				IF (to_jsonb(OLD)-ARRAY['state','stage_digest','updated_at','dispatched_at'])
					IS DISTINCT FROM
					(to_jsonb(NEW)-ARRAY['state','stage_digest','updated_at','dispatched_at']) THEN
					RAISE EXCEPTION 'provider resource cleanup dispatch changed frozen fields'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			IF OLD.state='dispatched' AND NEW.state='dispatched'
				AND OLD.dispatch_ack_digest IS NULL AND NEW.dispatch_ack_digest IS NOT NULL THEN
				IF (to_jsonb(OLD)-ARRAY[
					'cleanup_receipt_digest','owner_admission_digest','dispatch_ack_digest',
					'result_ingress_digest','result_ingress_receipt_digest','completed_at','updated_at'
				]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY[
					'cleanup_receipt_digest','owner_admission_digest','dispatch_ack_digest',
					'result_ingress_digest','result_ingress_receipt_digest','completed_at','updated_at'
				]) THEN
					RAISE EXCEPTION 'provider resource cleanup result changed frozen fields'
						USING ERRCODE='23514';
				END IF;
				SELECT receipt_json,receipt_bytes,created_at
				INTO component_json,component_bytes,component_created_at
				FROM agent_evaluation_capability_probe_provider_resource_cleanup_receipts
				WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
					AND cleanup_request_digest=NEW.cleanup_request_digest
					AND cleanup_receipt_digest=NEW.cleanup_receipt_digest
				FOR SHARE;
				IF NOT FOUND OR component_created_at<>NEW.updated_at
					OR component_json->>'cleanupReceiptDigest'<>NEW.cleanup_receipt_digest
					OR (component_json->>'completedAt')::timestamptz<>NEW.completed_at THEN
					RAISE EXCEPTION 'provider resource cleanup result lacks exact durable receipt'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			IF OLD.state='dispatched' AND NEW.state='sealed'
				AND OLD.dispatch_ack_digest IS NOT NULL THEN
				SELECT receipt_json,receipt_bytes,created_at
				INTO component_json,component_bytes,component_created_at
				FROM agent_evaluation_capability_probe_provider_resource_cleanup_receipts
				WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
					AND cleanup_request_digest=NEW.cleanup_request_digest
					AND cleanup_receipt_digest=NEW.cleanup_receipt_digest
				FOR SHARE;
				IF (to_jsonb(OLD)-ARRAY['state','response_digest','response_json','response_bytes',
					'sealed_at','updated_at']) IS DISTINCT FROM
					(to_jsonb(NEW)-ARRAY['state','response_digest','response_json','response_bytes',
						'sealed_at','updated_at'])
					OR NOT FOUND
					OR jsonb_typeof(NEW.response_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.response_json)<>14
					OR NOT (NEW.response_json ?& ARRAY[
						'format','version','repositoryCommit','resourceRegistrationRequestDigest',
						'cleanupRequestDigest','deletionAuthorityReceiptDigest',
						'ownerImplementationDigest','stageDigest','ownerAdmissionDigest',
						'dispatchAckDigest','resultIngressDigest','resultIngressReceiptDigest',
						'cleanupReceipt','responseDigest'
					]) OR NEW.response_json->>'format'<>
						'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-response'
					OR (NEW.response_json->>'version')::bigint<>1
					OR NEW.response_json->>'repositoryCommit'<>NEW.repository_commit
					OR NEW.response_json->>'resourceRegistrationRequestDigest'<>
						NEW.resource_registration_request_digest
					OR NEW.response_json->>'cleanupRequestDigest'<>NEW.cleanup_request_digest
					OR NEW.response_json->>'deletionAuthorityReceiptDigest'<>
						NEW.deletion_authority_receipt_digest
					OR NEW.response_json->>'ownerImplementationDigest'<>
						NEW.owner_implementation_digest
					OR NEW.response_json->>'stageDigest'<>NEW.stage_digest
					OR NEW.response_json->>'ownerAdmissionDigest'<>NEW.owner_admission_digest
					OR NEW.response_json->>'dispatchAckDigest'<>NEW.dispatch_ack_digest
					OR NEW.response_json->>'resultIngressDigest'<>NEW.result_ingress_digest
					OR NEW.response_json->>'resultIngressReceiptDigest'<>
						NEW.result_ingress_receipt_digest
					OR NEW.response_json#>>'{cleanupReceipt,cleanupReceiptDigest}'<>
						NEW.cleanup_receipt_digest
					OR NEW.response_json->>'responseDigest'<>NEW.response_digest
					OR NEW.response_json->'cleanupReceipt' IS DISTINCT FROM component_json THEN
					RAISE EXCEPTION 'provider resource cleanup response binding is invalid'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			RAISE EXCEPTION 'provider resource cleanup transition is invalid'
				USING ERRCODE='23514';
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_probe_provider_resource_cleanup_receipt()
			RETURNS trigger AS $$
		DECLARE
			existing_digest TEXT;
			existing_json JSONB;
			existing_bytes BYTEA;
			parent_state TEXT;
			parent_stage TEXT;
			parent_registration_digest TEXT;
			parent_deletion_digest TEXT;
			parent_dispatched_at TIMESTAMPTZ;
			deletion JSONB;
			projection JSONB;
			auxiliary JSONB;
			results JSONB;
			result JSONB;
			result_time TIMESTAMPTZ;
			latest_time TIMESTAMPTZ;
			registered_at TIMESTAMPTZ;
			primary_id TEXT;
			previous_role TEXT := '';
			previous_id TEXT := '';
			seen_ids TEXT[] := ARRAY[]::TEXT[];
			result_count BIGINT := 0;
		BEGIN
			SELECT cleanup_receipt_digest,receipt_json,receipt_bytes
			INTO existing_digest,existing_json,existing_bytes
			FROM agent_evaluation_capability_probe_provider_resource_cleanup_receipts
			WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
				AND cleanup_request_digest=NEW.cleanup_request_digest
			FOR SHARE;
			IF FOUND THEN
				IF existing_digest<>NEW.cleanup_receipt_digest
					OR existing_json<>NEW.receipt_json OR existing_bytes<>NEW.receipt_bytes THEN
					RAISE EXCEPTION 'provider resource cleanup receipt replay conflicts with durable bytes'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			SELECT state,stage_digest,resource_registration_request_digest,
				deletion_authority_receipt_digest,dispatched_at
			INTO parent_state,parent_stage,parent_registration_digest,parent_deletion_digest,
				parent_dispatched_at
			FROM agent_evaluation_capability_probe_provider_resource_cleanups
			WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
				AND cleanup_request_digest=NEW.cleanup_request_digest
			FOR SHARE;
			IF NOT FOUND OR parent_state<>'dispatched' OR parent_stage IS NULL
				OR NEW.created_at<parent_dispatched_at THEN
				RAISE EXCEPTION 'provider resource cleanup receipt lacks dispatched authority'
					USING ERRCODE='23514';
			END IF;
			SELECT receipt_json INTO deletion
			FROM agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts
			WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
				AND request_digest=parent_registration_digest
				AND deletion_authority_receipt_digest=parent_deletion_digest
			FOR SHARE;
			projection:=deletion->'deletionRequestProjection';
			auxiliary:=projection->'auxiliaryResourceIds';
			results:=NEW.receipt_json->'resourceResults';
			primary_id:=deletion->>'providerResourceId';
			registered_at:=(deletion->>'registeredAt')::timestamptz;
			IF jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>15
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','requestDigest','deletionAuthorityReceiptDigest',
					'deletionRequestProjectionDigest','protocolFamily','providerResourceKind',
					'providerResourceId','auxiliaryResourceIds','cleanupStageDigest',
					'cleanupDispatchAckDigest','resourceResults','resourceResultSetDigest',
					'completedAt','cleanupReceiptDigest'
				]) OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR NEW.receipt_json->>'requestDigest'<>parent_registration_digest
				OR NEW.receipt_json->>'deletionAuthorityReceiptDigest'<>parent_deletion_digest
				OR NEW.receipt_json->>'deletionRequestProjectionDigest'<>
					deletion->>'deletionRequestProjectionDigest'
				OR NEW.receipt_json->>'protocolFamily'<>projection->>'protocolFamily'
				OR NEW.receipt_json->>'providerResourceKind'<>deletion->>'providerResourceKind'
				OR NEW.receipt_json->>'providerResourceId'<>primary_id
				OR NEW.receipt_json->'auxiliaryResourceIds' IS DISTINCT FROM auxiliary
				OR NEW.receipt_json->>'cleanupStageDigest' !~ '^sha256-[a-f0-9]{64}$'
				OR NEW.receipt_json->>'cleanupDispatchAckDigest' !~ '^sha256-[a-f0-9]{64}$'
				OR NEW.receipt_json->>'resourceResultSetDigest' !~ '^sha256-[a-f0-9]{64}$'
				OR NEW.receipt_json->>'cleanupReceiptDigest'<>NEW.cleanup_receipt_digest
				OR jsonb_typeof(results)<>'array'
				OR jsonb_array_length(results)<>jsonb_array_length(auxiliary)+1 THEN
				RAISE EXCEPTION 'provider resource cleanup receipt binding is invalid'
					USING ERRCODE='23514';
			END IF;
			FOR result IN SELECT element.value
				FROM jsonb_array_elements(results) AS element(value) LOOP
				result_count:=result_count+1;
				IF jsonb_typeof(result)<>'object'
					OR agent_evaluation_jsonb_object_key_count(result)<>9
					OR NOT (result ?& ARRAY[
						'format','version','resourceId','resourceRole','outcome',
						'dispatchIntentDigest','transportReceiptDigest','completedAt','resultDigest'
					]) OR result->>'format'<>
						'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-resource-result'
					OR (result->>'version')::bigint<>1
					OR result->>'resourceId' !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					OR result->>'resourceRole' NOT IN ('primary','auxiliary')
					OR result->>'outcome' NOT IN ('already-absent','deleted')
					OR result->>'dispatchIntentDigest' !~ '^sha256-[a-f0-9]{64}$'
					OR result->>'transportReceiptDigest' !~ '^sha256-[a-f0-9]{64}$'
					OR result->>'resultDigest' !~ '^sha256-[a-f0-9]{64}$' THEN
					RAISE EXCEPTION 'provider resource cleanup result binding is invalid'
						USING ERRCODE='23514';
				END IF;
				result_time:=(result->>'completedAt')::timestamptz;
				IF result_time<registered_at
					OR result->>'resourceId'=ANY(seen_ids)
					OR ((result->>'resourceId'=primary_id) IS DISTINCT FROM
						(result->>'resourceRole'='primary'))
					OR (result->>'resourceId'<>primary_id AND
						NOT (auxiliary ? (result->>'resourceId')))
					OR (result_count>1 AND NOT (
						(previous_role=result->>'resourceRole' AND previous_id<result->>'resourceId')
						OR (previous_role='primary' AND result->>'resourceRole'='auxiliary')
					)) THEN
					RAISE EXCEPTION 'provider resource cleanup result set is invalid'
						USING ERRCODE='23514';
				END IF;
				seen_ids:=array_append(seen_ids,result->>'resourceId');
				previous_role:=result->>'resourceRole';
				previous_id:=result->>'resourceId';
				IF latest_time IS NULL OR result_time>latest_time THEN latest_time:=result_time; END IF;
			END LOOP;
			IF NOT (primary_id=ANY(seen_ids))
				OR EXISTS (
					SELECT 1 FROM jsonb_array_elements_text(auxiliary) expected(value)
					WHERE NOT (expected.value=ANY(seen_ids))
				)
				OR (NEW.receipt_json->>'completedAt')::timestamptz<>latest_time
				OR NEW.created_at<latest_time THEN
				RAISE EXCEPTION 'provider resource cleanup receipt is incomplete'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_plan_probe_provider_resource_cleanup_link()
			RETURNS trigger AS $$
		DECLARE
			plan_record RECORD;
			target JSONB;
			optional_authority JSONB;
			planned_resource JSONB;
			planned_deletion JSONB;
			planned_cleanup JSONB;
			cleanup_count BIGINT;
		BEGIN
			SELECT plan_json,planned_at INTO plan_record
			FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR SHARE;
			SELECT value INTO target FROM jsonb_array_elements(
				plan_record.plan_json#>'{value,capabilityQualificationTargets}'
			) value WHERE value->>'targetId'=NEW.target_id;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'provider resource cleanup plan target is absent'
					USING ERRCODE='23514';
			END IF;
			optional_authority:=target->'optionalCapabilitySupportAuthority';
			planned_resource:=COALESCE(optional_authority->'probeProviderResourceAuthority','null'::jsonb);
			planned_deletion:=COALESCE(
				optional_authority->'probeProviderResourceDeletionAuthorityReceipt','null'::jsonb
			);
			planned_cleanup:=COALESCE(
				optional_authority->'probeProviderResourceCleanupReceipt','null'::jsonb
			);
			IF jsonb_typeof(planned_resource)<>'object' THEN
				IF planned_deletion IS DISTINCT FROM 'null'::jsonb
					OR planned_cleanup IS DISTINCT FROM 'null'::jsonb THEN
					RAISE EXCEPTION 'non-resource plan target carried cleanup authority'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			PERFORM 1
			FROM agent_evaluation_capability_probe_provider_resource_registrations registration
			JOIN agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts deletion
			  ON deletion.namespace_id=registration.namespace_id
			 AND deletion.repository_commit=registration.repository_commit
			 AND deletion.request_digest=registration.request_digest
			 AND deletion.deletion_authority_receipt_digest=registration.deletion_authority_receipt_digest
			JOIN agent_evaluation_capability_probe_provider_resource_cleanups cleanup
			  ON cleanup.namespace_id=registration.namespace_id
			 AND cleanup.repository_commit=registration.repository_commit
			 AND cleanup.resource_registration_request_digest=registration.request_digest
			 AND cleanup.deletion_authority_receipt_digest=registration.deletion_authority_receipt_digest
			JOIN agent_evaluation_capability_probe_provider_resource_cleanup_receipts cleanup_receipt
			  ON cleanup_receipt.namespace_id=cleanup.namespace_id
			 AND cleanup_receipt.repository_commit=cleanup.repository_commit
			 AND cleanup_receipt.cleanup_request_digest=cleanup.cleanup_request_digest
			 AND cleanup_receipt.cleanup_receipt_digest=cleanup.cleanup_receipt_digest
			WHERE registration.namespace_id=NEW.namespace_id
				AND registration.repository_commit=NEW.repository_commit
				AND registration.provider_resource_authority_digest=planned_resource->>'authorityDigest'
				AND registration.state='sealed' AND registration.v45_eligible
				AND deletion.receipt_json=planned_deletion
				AND cleanup.state='sealed' AND cleanup.v45_eligible
				AND cleanup_receipt.receipt_json=planned_cleanup
			FOR SHARE;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'plan target lacks sealed provider resource cleanup authority'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*) INTO cleanup_count
			FROM agent_evaluation_capability_probe_provider_resource_registrations registration
			JOIN agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts deletion
			  ON deletion.namespace_id=registration.namespace_id
			 AND deletion.repository_commit=registration.repository_commit
			 AND deletion.request_digest=registration.request_digest
			 AND deletion.deletion_authority_receipt_digest=registration.deletion_authority_receipt_digest
			JOIN agent_evaluation_capability_probe_provider_resource_cleanups cleanup
			  ON cleanup.namespace_id=registration.namespace_id
			 AND cleanup.repository_commit=registration.repository_commit
			 AND cleanup.resource_registration_request_digest=registration.request_digest
			 AND cleanup.deletion_authority_receipt_digest=registration.deletion_authority_receipt_digest
			JOIN agent_evaluation_capability_probe_provider_resource_cleanup_receipts cleanup_receipt
			  ON cleanup_receipt.namespace_id=cleanup.namespace_id
			 AND cleanup_receipt.repository_commit=cleanup.repository_commit
			 AND cleanup_receipt.cleanup_request_digest=cleanup.cleanup_request_digest
			 AND cleanup_receipt.cleanup_receipt_digest=cleanup.cleanup_receipt_digest
			WHERE registration.namespace_id=NEW.namespace_id
				AND registration.repository_commit=NEW.repository_commit
				AND registration.provider_resource_authority_digest=planned_resource->>'authorityDigest'
				AND registration.state='sealed' AND registration.v45_eligible
				AND deletion.receipt_json=planned_deletion
				AND cleanup.state='sealed' AND cleanup.v45_eligible
				AND cleanup.request_json->>'resourceRegistrationRequestDigest'=registration.request_digest
				AND cleanup.request_json->>'deletionAuthorityReceiptDigest'=
					registration.deletion_authority_receipt_digest
				AND cleanup_receipt.receipt_json=planned_cleanup
				AND cleanup.response_json->'cleanupReceipt'=planned_cleanup
				AND cleanup.completed_at<=plan_record.planned_at
				AND cleanup.sealed_at<=plan_record.planned_at;
			IF cleanup_count<>1 THEN
				RAISE EXCEPTION 'plan target provider resource cleanup binding is not exact'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_cleanup_capacity
			BEFORE INSERT ON agent_evaluation_capability_probe_provider_resource_cleanups
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_provider_resource_cleanup_capacity()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_cleanup_transition
			BEFORE INSERT OR UPDATE OR DELETE
			ON agent_evaluation_capability_probe_provider_resource_cleanups
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_provider_resource_cleanup_transition()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_cleanup_receipt_exact_binding
			BEFORE INSERT ON agent_evaluation_capability_probe_provider_resource_cleanup_receipts
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_probe_provider_resource_cleanup_receipt()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_cleanup_receipt_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_capability_probe_provider_resource_cleanup_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_cleanup_finalized
			BEFORE INSERT OR UPDATE OR DELETE
			ON agent_evaluation_capability_probe_provider_resource_cleanups
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_repository_commit_finalized_mutation()`,
		`CREATE TRIGGER agent_evaluation_probe_provider_resource_cleanup_receipt_finalized
			BEFORE INSERT OR UPDATE OR DELETE
			ON agent_evaluation_capability_probe_provider_resource_cleanup_receipts
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_repository_commit_finalized_mutation()`,
		`CREATE TRIGGER agent_evaluation_plan_probe_provider_resource_cleanup_link
			BEFORE INSERT ON agent_evaluation_plan_capability_probe_admission_links
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_plan_probe_provider_resource_cleanup_link()`,
	}
}
