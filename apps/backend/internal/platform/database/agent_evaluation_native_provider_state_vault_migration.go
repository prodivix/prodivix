package database

// agentEvaluationNativeProviderStateVaultStatements installs the fresh-v45
// server-side owner for callback-local Provider state. Canonical lifecycle
// receipts remain available for archive verification while retirement destroys
// every encrypted state/key byte that could make the opaque reference usable.
func agentEvaluationNativeProviderStateVaultStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS agent_evaluation_native_provider_state_vault_records (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			vault_owner_instance_id TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			purpose TEXT NOT NULL,
			attempt_id TEXT NOT NULL,
			invocation_id TEXT NOT NULL,
			generation BIGINT NOT NULL,
			task_id TEXT NOT NULL,
			run_id TEXT NOT NULL,
			provider_state_reference_kind TEXT NOT NULL,
			provider_state_reference_digest TEXT NOT NULL,
			opaque_provider_state_ref TEXT NOT NULL,
			seal_request_digest TEXT NOT NULL,
			seal_request_json JSONB NOT NULL,
			seal_request_bytes BYTEA NOT NULL,
			seal_receipt_digest TEXT NOT NULL,
			seal_receipt_json JSONB NOT NULL,
			seal_receipt_bytes BYTEA NOT NULL,
			state_key_creation_receipt_digest TEXT NOT NULL,
			aad_digest TEXT NOT NULL,
			aad_bytes BYTEA NOT NULL,
			ciphertext_digest TEXT NOT NULL,
			ciphertext_bytes BYTEA,
			ciphertext_nonce BYTEA,
			wrapped_state_key_digest TEXT NOT NULL,
			wrapped_state_key_bytes BYTEA,
			wrapped_state_key_nonce BYTEA,
			status TEXT NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			sealed_at TIMESTAMPTZ NOT NULL,
			resolve_request_digest TEXT,
			resolve_request_json JSONB,
			resolve_request_bytes BYTEA,
			resolve_receipt_digest TEXT,
			resolve_receipt_json JSONB,
			resolve_receipt_bytes BYTEA,
			resolved_at TIMESTAMPTZ,
			retire_request_digest TEXT,
			retire_request_json JSONB,
			retire_request_bytes BYTEA,
			retirement_receipt_digest TEXT,
			retirement_receipt_json JSONB,
			retirement_receipt_bytes BYTEA,
			disposition TEXT,
			retired_at TIMESTAMPTZ,
			forced_expiry_tombstone_digest TEXT,
			forced_expiry_tombstone_json JSONB,
			forced_expiry_tombstone_bytes BYTEA,
			forced_expired_at TIMESTAMPTZ,
			recovery_request_digest TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,opaque_provider_state_ref
			),
			UNIQUE (namespace_id,seal_request_digest),
			UNIQUE (namespace_id,seal_receipt_digest),
			UNIQUE (namespace_id,opaque_provider_state_ref),
			UNIQUE (namespace_id,resolve_request_digest),
			UNIQUE (namespace_id,resolve_receipt_digest),
			UNIQUE (namespace_id,retire_request_digest),
			UNIQUE (namespace_id,retirement_receipt_digest),
			UNIQUE (namespace_id,forced_expiry_tombstone_digest),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			CONSTRAINT agent_eval_native_provider_state_vault_recovery_member_fk FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,recovery_request_digest,
				vault_owner_instance_id,authority_digest
			) REFERENCES agent_evaluation_native_provider_state_vault_recoveries(
				namespace_id,plan_digest,repository_commit,recovery_request_digest,
				vault_owner_instance_id,authority_digest
			) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
			CONSTRAINT agent_eval_native_provider_state_vault_identity_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND vault_owner_instance_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND attempt_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND invocation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND task_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND run_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND generation>=0
				AND purpose IN ('background-job-state','reasoning-continuation-state')
				AND provider_state_reference_kind IN ('response-id','interaction-id')
				AND opaque_provider_state_ref ~ '^state-vault-ref\.[a-f0-9]{64}$'
				AND status IN ('active','retired','expired-unqualified')
				AND (disposition IS NULL OR disposition IN ('cancelled','consumed','expired'))
				AND v45_eligible
			),
			CONSTRAINT agent_eval_native_provider_state_vault_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND provider_state_reference_digest ~ '^sha256-[a-f0-9]{64}$'
				AND seal_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND seal_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND state_key_creation_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND aad_digest ~ '^sha256-[a-f0-9]{64}$'
				AND ciphertext_digest ~ '^sha256-[a-f0-9]{64}$'
				AND wrapped_state_key_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (resolve_request_digest IS NULL OR
					resolve_request_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (resolve_receipt_digest IS NULL OR
					resolve_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (retire_request_digest IS NULL OR
					retire_request_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (retirement_receipt_digest IS NULL OR
					retirement_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (forced_expiry_tombstone_digest IS NULL OR
					forced_expiry_tombstone_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (recovery_request_digest IS NULL OR
					recovery_request_digest ~ '^sha256-[a-f0-9]{64}$')
			),
			CONSTRAINT agent_eval_native_provider_state_vault_bytes_check CHECK (
				octet_length(seal_request_bytes) BETWEEN 1 AND 16384
				AND seal_request_json=convert_from(seal_request_bytes,'UTF8')::jsonb
				AND octet_length(seal_receipt_bytes) BETWEEN 1 AND 16384
				AND seal_receipt_json=convert_from(seal_receipt_bytes,'UTF8')::jsonb
				AND octet_length(aad_bytes) BETWEEN 1 AND 16384
				AND jsonb_typeof(convert_from(aad_bytes,'UTF8')::jsonb)='object'
				AND (resolve_request_json IS NULL)=(resolve_request_bytes IS NULL)
				AND (resolve_request_json IS NULL OR (
					octet_length(resolve_request_bytes) BETWEEN 1 AND 16384
					AND resolve_request_json=convert_from(resolve_request_bytes,'UTF8')::jsonb
				))
				AND (resolve_receipt_json IS NULL)=(resolve_receipt_bytes IS NULL)
				AND (resolve_receipt_json IS NULL OR (
					octet_length(resolve_receipt_bytes) BETWEEN 1 AND 16384
					AND resolve_receipt_json=convert_from(resolve_receipt_bytes,'UTF8')::jsonb
				))
				AND (retire_request_json IS NULL)=(retire_request_bytes IS NULL)
				AND (retire_request_json IS NULL OR (
					octet_length(retire_request_bytes) BETWEEN 1 AND 16384
					AND retire_request_json=convert_from(retire_request_bytes,'UTF8')::jsonb
				))
				AND (retirement_receipt_json IS NULL)=(retirement_receipt_bytes IS NULL)
				AND (retirement_receipt_json IS NULL OR (
					octet_length(retirement_receipt_bytes) BETWEEN 1 AND 16384
					AND retirement_receipt_json=
						convert_from(retirement_receipt_bytes,'UTF8')::jsonb
				))
				AND (forced_expiry_tombstone_json IS NULL)=
					(forced_expiry_tombstone_bytes IS NULL)
				AND (forced_expiry_tombstone_json IS NULL OR (
					octet_length(forced_expiry_tombstone_bytes) BETWEEN 1 AND 16384
					AND forced_expiry_tombstone_json=
						convert_from(forced_expiry_tombstone_bytes,'UTF8')::jsonb
				))
			),
			CONSTRAINT agent_eval_native_provider_state_vault_lifecycle_check CHECK (
				((resolve_request_digest IS NULL AND resolve_request_json IS NULL
					AND resolve_receipt_digest IS NULL AND resolve_receipt_json IS NULL
					AND resolved_at IS NULL)
				 OR (resolve_request_digest IS NOT NULL AND resolve_request_json IS NOT NULL
					AND resolve_receipt_digest IS NOT NULL AND resolve_receipt_json IS NOT NULL
					AND resolved_at IS NOT NULL))
				AND ((status='active'
					AND octet_length(ciphertext_bytes) BETWEEN 17 AND 528
					AND octet_length(ciphertext_nonce)=12
					AND octet_length(wrapped_state_key_bytes)=48
					AND octet_length(wrapped_state_key_nonce)=12
					AND retire_request_digest IS NULL AND retire_request_json IS NULL
					AND retirement_receipt_digest IS NULL AND retirement_receipt_json IS NULL
					AND disposition IS NULL AND retired_at IS NULL
					AND forced_expiry_tombstone_digest IS NULL
					AND forced_expiry_tombstone_json IS NULL AND forced_expired_at IS NULL
					AND recovery_request_digest IS NULL)
				 OR (status='retired'
					AND ciphertext_bytes IS NULL AND ciphertext_nonce IS NULL
					AND wrapped_state_key_bytes IS NULL AND wrapped_state_key_nonce IS NULL
					AND retire_request_digest IS NOT NULL AND retire_request_json IS NOT NULL
					AND retirement_receipt_digest IS NOT NULL
					AND retirement_receipt_json IS NOT NULL
					AND disposition IS NOT NULL AND retired_at IS NOT NULL
					AND forced_expiry_tombstone_digest IS NULL
					AND forced_expiry_tombstone_json IS NULL AND forced_expired_at IS NULL)
				 OR (status='expired-unqualified'
					AND ciphertext_bytes IS NULL AND ciphertext_nonce IS NULL
					AND wrapped_state_key_bytes IS NULL AND wrapped_state_key_nonce IS NULL
					AND retire_request_digest IS NULL AND retire_request_json IS NULL
					AND retirement_receipt_digest IS NULL AND retirement_receipt_json IS NULL
					AND disposition IS NULL AND retired_at IS NULL
					AND forced_expiry_tombstone_digest IS NOT NULL
					AND forced_expiry_tombstone_json IS NOT NULL
					AND forced_expired_at IS NOT NULL))
			),
			CONSTRAINT agent_eval_native_provider_state_vault_time_check CHECK (
				expires_at>sealed_at AND created_at=sealed_at AND updated_at>=created_at
				AND (resolved_at IS NULL OR resolved_at>=sealed_at)
				AND (retired_at IS NULL OR retired_at>=sealed_at)
				AND (forced_expired_at IS NULL OR (
					forced_expired_at>expires_at+INTERVAL '30 seconds'
					AND updated_at=forced_expired_at
				))
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_native_provider_state_vault_instance_active
			ON agent_evaluation_native_provider_state_vault_records(
				namespace_id,repository_commit,vault_owner_instance_id,status,expires_at,
				opaque_provider_state_ref COLLATE "C"
			)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_native_provider_state_vault_expired_active
			ON agent_evaluation_native_provider_state_vault_records(
				namespace_id,repository_commit,status,expires_at,
				opaque_provider_state_ref COLLATE "C"
			) WHERE status='active'`,
		`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_native_provider_state_vault_archive_join
			ON agent_evaluation_native_provider_state_vault_records(
				namespace_id,plan_digest,repository_commit,attempt_id,invocation_id,
				provider_state_reference_digest
			)`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_native_provider_state_vault_capacity()
			RETURNS trigger AS $$
		DECLARE
			record_count BIGINT;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id || chr(31) || NEW.repository_commit || chr(31) ||
				'native-provider-state-vault',0
			));
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id || chr(31) || NEW.plan_digest || chr(31) ||
				NEW.repository_commit || chr(31) || NEW.vault_owner_instance_id ||
				chr(31) || 'native-provider-state-vault-recovery',0
			));
			IF EXISTS (
				SELECT 1 FROM agent_evaluation_native_provider_state_vault_recoveries
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND vault_owner_instance_id=NEW.vault_owner_instance_id
			) THEN
				RAISE EXCEPTION 'native Provider state vault owner is recovery-fenced'
					USING ERRCODE='23514';
			END IF;
			IF EXISTS (
				SELECT 1 FROM agent_evaluation_native_provider_state_vault_records
				WHERE namespace_id=NEW.namespace_id
					AND seal_request_digest=NEW.seal_request_digest
			) THEN
				RETURN NEW;
			END IF;
			SELECT COUNT(*) INTO record_count
			FROM agent_evaluation_native_provider_state_vault_records
			WHERE namespace_id=NEW.namespace_id
				AND repository_commit=NEW.repository_commit;
			IF record_count>=5880 THEN
				RAISE EXCEPTION 'native Provider state vault exceeds frozen record capacity'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_native_provider_state_vault_record()
			RETURNS trigger AS $$
		DECLARE
			request_observed_at TIMESTAMPTZ;
			request_expires_at TIMESTAMPTZ;
			request_protocol TEXT;
			aad JSONB;
			run_config_authority JSONB;
			plan_planned_at TIMESTAMPTZ;
			plan_expires_at TIMESTAMPTZ;
			resolve_status TEXT;
			resolve_requested_at TIMESTAMPTZ;
			resolve_expires_at TIMESTAMPTZ;
			retire_requested_at TIMESTAMPTZ;
			retire_expires_at TIMESTAMPTZ;
			resolve_digest JSONB;
			consumer_attempt JSONB;
			consumer_invocation JSONB;
			consumer_generation JSONB;
		BEGIN
			IF TG_OP='DELETE' THEN
				RAISE EXCEPTION 'native Provider state vault record is immutable'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id || chr(31) || NEW.plan_digest || chr(31) ||
				NEW.repository_commit || chr(31) || NEW.vault_owner_instance_id ||
				chr(31) || 'native-provider-state-vault-recovery',0
			));
			aad:=convert_from(NEW.aad_bytes,'UTF8')::jsonb;
			IF jsonb_typeof(NEW.seal_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.seal_request_json)<>24
				OR NOT (NEW.seal_request_json ?& ARRAY[
					'format','version','authorityDigest','purpose','attemptId','protocolFamily',
					'providerStateReferenceKind','providerStateReferenceDigest','probeProgramDigest',
					'capabilityProfileDigest','invocationId','requestDigest','responseDigest',
					'responseBodyDigest','sealedResponseJsonDigest','providerConfigurationId',
					'modelLineageDigest','adapterDigest','taskId','runId','generation',
					'observedAt','expiresAt','sealRequestDigest'
				]) OR NEW.seal_request_json->>'format' IS DISTINCT FROM
					'prodivix.agent-native-provider-state-vault-seal-request'
				OR (NEW.seal_request_json->>'version')::bigint IS DISTINCT FROM 1
				OR NEW.seal_request_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
				OR NEW.seal_request_json->>'purpose' IS DISTINCT FROM NEW.purpose
				OR NEW.seal_request_json->>'attemptId' IS DISTINCT FROM NEW.attempt_id
				OR NEW.seal_request_json->>'invocationId' IS DISTINCT FROM NEW.invocation_id
				OR (NEW.seal_request_json->>'generation')::bigint IS DISTINCT FROM NEW.generation
				OR NEW.seal_request_json->>'taskId' IS DISTINCT FROM NEW.task_id
				OR NEW.seal_request_json->>'runId' IS DISTINCT FROM NEW.run_id
				OR NEW.seal_request_json->>'providerStateReferenceKind' IS DISTINCT FROM
					NEW.provider_state_reference_kind
				OR NEW.seal_request_json->>'providerStateReferenceDigest' IS DISTINCT FROM
					NEW.provider_state_reference_digest
				OR NEW.seal_request_json->>'sealRequestDigest' IS DISTINCT FROM NEW.seal_request_digest
				OR NOT COALESCE(NEW.seal_request_json->>'probeProgramDigest' ~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(NEW.seal_request_json->>'capabilityProfileDigest' ~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(NEW.seal_request_json->>'requestDigest' ~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(NEW.seal_request_json->>'responseDigest' ~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(NEW.seal_request_json->>'responseBodyDigest' ~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(NEW.seal_request_json->>'sealedResponseJsonDigest' ~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(NEW.seal_request_json->>'modelLineageDigest' ~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(NEW.seal_request_json->>'adapterDigest' ~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR jsonb_typeof(NEW.seal_request_json->'providerConfigurationId') IS DISTINCT FROM 'string'
				OR NEW.seal_request_json->>'providerConfigurationId' !~
					'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$' THEN
				RAISE EXCEPTION 'native Provider state vault seal request binding is invalid'
					USING ERRCODE='23514';
			END IF;
			request_protocol:=NEW.seal_request_json->>'protocolFamily';
			request_observed_at:=(NEW.seal_request_json->>'observedAt')::timestamptz;
			request_expires_at:=(NEW.seal_request_json->>'expiresAt')::timestamptz;
			IF NOT COALESCE(((request_protocol='openai-responses'
					AND NEW.provider_state_reference_kind='response-id')
				OR (request_protocol='gemini-interactions'
					AND NEW.provider_state_reference_kind='interaction-id')),FALSE)
				OR request_observed_at IS NULL OR request_expires_at IS NULL
				OR request_expires_at<>NEW.expires_at
				OR request_expires_at<>request_observed_at+INTERVAL '125 seconds'
				OR NEW.sealed_at<request_observed_at
				OR NEW.sealed_at>request_observed_at+INTERVAL '30 seconds' THEN
				RAISE EXCEPTION 'native Provider state vault seal time/protocol binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.seal_receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.seal_receipt_json)<>12
				OR NOT (NEW.seal_receipt_json ?& ARRAY[
					'format','version','authorityDigest','sealRequestDigest',
					'providerStateReferenceDigest','status','opaqueProviderStateRef',
					'stateKeyCreationReceiptDigest','sealedAt','expiresAt',
					'retirementRequired','receiptDigest'
				]) OR NEW.seal_receipt_json->>'format' IS DISTINCT FROM
					'prodivix.agent-native-provider-state-vault-seal-receipt'
				OR (NEW.seal_receipt_json->>'version')::bigint IS DISTINCT FROM 1
				OR NEW.seal_receipt_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
				OR NEW.seal_receipt_json->>'sealRequestDigest' IS DISTINCT FROM NEW.seal_request_digest
				OR NEW.seal_receipt_json->>'providerStateReferenceDigest' IS DISTINCT FROM
					NEW.provider_state_reference_digest
				OR NEW.seal_receipt_json->>'status' IS DISTINCT FROM 'sealed'
				OR NEW.seal_receipt_json->>'opaqueProviderStateRef' IS DISTINCT FROM
					NEW.opaque_provider_state_ref
				OR NEW.seal_receipt_json->>'stateKeyCreationReceiptDigest' IS DISTINCT FROM
					NEW.state_key_creation_receipt_digest
				OR (NEW.seal_receipt_json->>'sealedAt')::timestamptz IS DISTINCT FROM NEW.sealed_at
				OR (NEW.seal_receipt_json->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at
				OR NEW.seal_receipt_json->'retirementRequired' IS DISTINCT FROM 'true'::jsonb
				OR NEW.seal_receipt_json->>'receiptDigest' IS DISTINCT FROM NEW.seal_receipt_digest THEN
				RAISE EXCEPTION 'native Provider state vault seal receipt binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(aad)<>'object'
				OR agent_evaluation_jsonb_object_key_count(aad)<>13
				OR NOT (aad ?& ARRAY[
					'format','version','authorityDigest','namespaceId','planDigest',
					'repositoryCommit','sealRequestDigest','providerStateReferenceDigest',
					'purpose','attemptId','invocationId','generation','expiresAt'
				]) OR aad->>'format' IS DISTINCT FROM 'prodivix.agent-native-provider-state-vault-aad'
				OR (aad->>'version')::bigint IS DISTINCT FROM 1
				OR aad->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
				OR aad->>'namespaceId' IS DISTINCT FROM NEW.namespace_id
				OR aad->>'planDigest' IS DISTINCT FROM NEW.plan_digest
				OR aad->>'repositoryCommit' IS DISTINCT FROM NEW.repository_commit
				OR aad->>'sealRequestDigest' IS DISTINCT FROM NEW.seal_request_digest
				OR aad->>'providerStateReferenceDigest' IS DISTINCT FROM NEW.provider_state_reference_digest
				OR aad->>'purpose' IS DISTINCT FROM NEW.purpose
				OR aad->>'attemptId' IS DISTINCT FROM NEW.attempt_id
				OR aad->>'invocationId' IS DISTINCT FROM NEW.invocation_id
				OR (aad->>'generation')::bigint IS DISTINCT FROM NEW.generation
				OR (aad->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at THEN
				RAISE EXCEPTION 'native Provider state vault AAD binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='INSERT' THEN
				IF NEW.status<>'active' OR NEW.created_at<>NEW.sealed_at
					OR NEW.updated_at<>NEW.sealed_at THEN
					RAISE EXCEPTION 'native Provider state vault seal lifecycle is invalid'
						USING ERRCODE='23514';
				END IF;
				SELECT plan.planned_at,plan.expires_at,
					artifact.run_config_json#>'{nativeProviderStateVaultEncryption,authority}'
				INTO plan_planned_at,plan_expires_at,run_config_authority
				FROM agent_evaluation_plans plan
				JOIN agent_evaluation_production_run_config_artifacts artifact
				  ON artifact.namespace_id=plan.namespace_id
				 AND artifact.plan_digest=plan.plan_digest
				 AND artifact.repository_commit=plan.repository_commit
				WHERE plan.namespace_id=NEW.namespace_id AND plan.plan_digest=NEW.plan_digest
					AND plan.repository_commit=NEW.repository_commit
				FOR SHARE OF plan,artifact;
				IF NOT FOUND OR request_observed_at<plan_planned_at
					OR NEW.expires_at>plan_expires_at
					OR jsonb_typeof(run_config_authority)<>'object'
					OR agent_evaluation_jsonb_object_key_count(run_config_authority)<>16
					OR NOT (run_config_authority ?& ARRAY[
						'format','version','authorityId','authorityImplementationDigest',
						'storageMode','cryptographicExpiryMode','algorithm','keyReferenceDigest',
						'keyVersion','encryptionProfileDigest','retentionPolicyDigest',
						'deletionReceiptPolicyDigest','maximumLifetimeMs',
						'maximumLifecycleAckDelayMs','reconciliationMode','authorityDigest'
					]) OR run_config_authority->>'format' IS DISTINCT FROM
						'prodivix.agent-native-provider-state-vault-authority'
					OR (run_config_authority->>'version')::bigint IS DISTINCT FROM 1
					OR run_config_authority->>'authorityId' IS DISTINCT FROM
						'evaluation.native-provider-state-vault.owner.v1'
					OR NOT COALESCE(run_config_authority->>'authorityImplementationDigest'
						~ '^sha256-[a-f0-9]{64}$',FALSE)
					OR run_config_authority->>'storageMode' IS DISTINCT FROM 'server-side-vault-record'
					OR run_config_authority->>'cryptographicExpiryMode' IS DISTINCT FROM
						'per-state-data-key-destroy'
					OR run_config_authority->>'algorithm' IS DISTINCT FROM 'aes-256-gcm'
					OR NOT COALESCE(run_config_authority->>'keyReferenceDigest'
						~ '^sha256-[a-f0-9]{64}$',FALSE)
					OR (run_config_authority->>'keyVersion')::bigint IS DISTINCT FROM 1
					OR NOT COALESCE(run_config_authority->>'encryptionProfileDigest'
						~ '^sha256-[a-f0-9]{64}$',FALSE)
					OR NOT COALESCE(run_config_authority->>'retentionPolicyDigest'
						~ '^sha256-[a-f0-9]{64}$',FALSE)
					OR NOT COALESCE(run_config_authority->>'deletionReceiptPolicyDigest'
						~ '^sha256-[a-f0-9]{64}$',FALSE)
					OR (run_config_authority->>'maximumLifetimeMs')::bigint IS DISTINCT FROM 125000
					OR (run_config_authority->>'maximumLifecycleAckDelayMs')::bigint IS DISTINCT FROM 30000
					OR run_config_authority->>'reconciliationMode' IS DISTINCT FROM
						'request-digest-idempotent'
					OR run_config_authority->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest THEN
					RAISE EXCEPTION 'native Provider state vault lacks its frozen run-config authority'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			IF OLD.namespace_id IS DISTINCT FROM NEW.namespace_id
				OR OLD.plan_digest IS DISTINCT FROM NEW.plan_digest
				OR OLD.repository_commit IS DISTINCT FROM NEW.repository_commit
				OR OLD.vault_owner_instance_id IS DISTINCT FROM NEW.vault_owner_instance_id
				OR OLD.authority_digest IS DISTINCT FROM NEW.authority_digest
				OR OLD.purpose IS DISTINCT FROM NEW.purpose
				OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
				OR OLD.invocation_id IS DISTINCT FROM NEW.invocation_id
				OR OLD.generation IS DISTINCT FROM NEW.generation
				OR OLD.task_id IS DISTINCT FROM NEW.task_id
				OR OLD.run_id IS DISTINCT FROM NEW.run_id
				OR OLD.provider_state_reference_kind IS DISTINCT FROM
					NEW.provider_state_reference_kind
				OR OLD.provider_state_reference_digest IS DISTINCT FROM
					NEW.provider_state_reference_digest
				OR OLD.opaque_provider_state_ref IS DISTINCT FROM NEW.opaque_provider_state_ref
				OR OLD.seal_request_digest IS DISTINCT FROM NEW.seal_request_digest
				OR OLD.seal_request_json IS DISTINCT FROM NEW.seal_request_json
				OR OLD.seal_request_bytes IS DISTINCT FROM NEW.seal_request_bytes
				OR OLD.seal_receipt_digest IS DISTINCT FROM NEW.seal_receipt_digest
				OR OLD.seal_receipt_json IS DISTINCT FROM NEW.seal_receipt_json
				OR OLD.seal_receipt_bytes IS DISTINCT FROM NEW.seal_receipt_bytes
				OR OLD.state_key_creation_receipt_digest IS DISTINCT FROM
					NEW.state_key_creation_receipt_digest
				OR OLD.aad_digest IS DISTINCT FROM NEW.aad_digest
				OR OLD.aad_bytes IS DISTINCT FROM NEW.aad_bytes
				OR OLD.ciphertext_digest IS DISTINCT FROM NEW.ciphertext_digest
				OR OLD.wrapped_state_key_digest IS DISTINCT FROM NEW.wrapped_state_key_digest
				OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
				OR OLD.sealed_at IS DISTINCT FROM NEW.sealed_at
				OR OLD.created_at IS DISTINCT FROM NEW.created_at
				OR OLD.v45_eligible IS DISTINCT FROM NEW.v45_eligible THEN
				RAISE EXCEPTION 'native Provider state vault changed immutable seal authority'
					USING ERRCODE='23514';
			END IF;
			IF OLD.resolve_request_digest IS NULL AND NEW.resolve_request_digest IS NOT NULL THEN
				IF (to_jsonb(OLD)-ARRAY[
					'resolve_request_digest','resolve_request_json','resolve_request_bytes',
					'resolve_receipt_digest','resolve_receipt_json','resolve_receipt_bytes',
					'resolved_at','updated_at'
				]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY[
					'resolve_request_digest','resolve_request_json','resolve_request_bytes',
					'resolve_receipt_digest','resolve_receipt_json','resolve_receipt_bytes',
					'resolved_at','updated_at'
				]) OR NEW.updated_at<>NEW.resolved_at OR NEW.resolved_at<OLD.updated_at THEN
					RAISE EXCEPTION 'native Provider state vault resolve changed frozen fields'
						USING ERRCODE='23514';
				END IF;
				IF jsonb_typeof(NEW.resolve_request_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.resolve_request_json)<>20
					OR NOT (NEW.resolve_request_json ?& ARRAY[
						'format','version','authorityDigest','opaqueProviderStateRef',
						'sealRequestDigest','sealReceiptDigest','purpose',
						'providerStateReferenceKind','providerStateReferenceDigest',
						'sourceAttemptId','sourceInvocationId','sourceGeneration',
						'consumerAttemptId','consumerInvocationId','consumerGeneration',
						'taskId','runId','requestedAt','expiresAt','resolveRequestDigest'
					]) OR NEW.resolve_request_json->>'format' IS DISTINCT FROM
						'prodivix.agent-native-provider-state-vault-resolve-request'
					OR (NEW.resolve_request_json->>'version')::bigint IS DISTINCT FROM 1
					OR NEW.resolve_request_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
					OR NEW.resolve_request_json->>'opaqueProviderStateRef' IS DISTINCT FROM
						NEW.opaque_provider_state_ref
					OR NEW.resolve_request_json->>'sealRequestDigest' IS DISTINCT FROM NEW.seal_request_digest
					OR NEW.resolve_request_json->>'sealReceiptDigest' IS DISTINCT FROM NEW.seal_receipt_digest
					OR NEW.resolve_request_json->>'purpose' IS DISTINCT FROM NEW.purpose
					OR NEW.resolve_request_json->>'providerStateReferenceKind' IS DISTINCT FROM
						NEW.provider_state_reference_kind
					OR NEW.resolve_request_json->>'providerStateReferenceDigest' IS DISTINCT FROM
						NEW.provider_state_reference_digest
					OR NEW.resolve_request_json->>'sourceAttemptId' IS DISTINCT FROM NEW.attempt_id
					OR NEW.resolve_request_json->>'sourceInvocationId' IS DISTINCT FROM NEW.invocation_id
					OR (NEW.resolve_request_json->>'sourceGeneration')::bigint IS DISTINCT FROM NEW.generation
					OR NEW.resolve_request_json->>'consumerAttemptId' IS DISTINCT FROM NEW.attempt_id
					OR NEW.resolve_request_json->>'consumerInvocationId' IS NULL
					OR NEW.resolve_request_json->>'consumerInvocationId'=NEW.invocation_id
					OR (NEW.resolve_request_json->>'consumerGeneration')::bigint IS DISTINCT FROM NEW.generation
					OR NEW.resolve_request_json->>'taskId' IS DISTINCT FROM NEW.task_id
					OR NEW.resolve_request_json->>'runId' IS DISTINCT FROM NEW.run_id
					OR NEW.resolve_request_json->>'resolveRequestDigest' IS DISTINCT FROM NEW.resolve_request_digest THEN
					RAISE EXCEPTION 'native Provider state vault resolve request binding is invalid'
						USING ERRCODE='23514';
				END IF;
				resolve_requested_at:=(NEW.resolve_request_json->>'requestedAt')::timestamptz;
				resolve_expires_at:=(NEW.resolve_request_json->>'expiresAt')::timestamptz;
				resolve_status:=NEW.resolve_receipt_json->>'status';
				IF resolve_requested_at IS NULL OR resolve_expires_at IS NULL
					OR resolve_requested_at<NEW.sealed_at OR NOT resolve_requested_at<NEW.expires_at
					OR resolve_expires_at<>NEW.expires_at
					OR NEW.resolved_at<resolve_requested_at
					OR NEW.resolved_at>resolve_requested_at+INTERVAL '30 seconds'
					OR jsonb_typeof(NEW.resolve_receipt_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.resolve_receipt_json)<>12
					OR NOT (NEW.resolve_receipt_json ?& ARRAY[
						'format','version','authorityDigest','resolveRequestDigest',
						'sealReceiptDigest','opaqueProviderStateRef','status',
						'providerStateReferenceDigest','callbackLocalProviderStateHandleDigest',
						'resolvedAt','expiresAt','receiptDigest'
					]) OR NEW.resolve_receipt_json->>'format' IS DISTINCT FROM
						'prodivix.agent-native-provider-state-vault-resolve-receipt'
					OR (NEW.resolve_receipt_json->>'version')::bigint IS DISTINCT FROM 1
					OR NEW.resolve_receipt_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
					OR NEW.resolve_receipt_json->>'resolveRequestDigest' IS DISTINCT FROM
						NEW.resolve_request_digest
					OR NEW.resolve_receipt_json->>'sealReceiptDigest' IS DISTINCT FROM NEW.seal_receipt_digest
					OR NEW.resolve_receipt_json->>'opaqueProviderStateRef' IS DISTINCT FROM
						NEW.opaque_provider_state_ref
					OR NEW.resolve_receipt_json->>'providerStateReferenceDigest' IS DISTINCT FROM
						NEW.provider_state_reference_digest
					OR (NEW.resolve_receipt_json->>'resolvedAt')::timestamptz IS DISTINCT FROM NEW.resolved_at
					OR (NEW.resolve_receipt_json->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at
					OR NEW.resolve_receipt_json->>'receiptDigest' IS DISTINCT FROM NEW.resolve_receipt_digest
					OR resolve_status IS NULL
					OR resolve_status NOT IN ('resolved','expired','retired','unavailable')
					OR (resolve_status='resolved' AND (
						NEW.status<>'active' OR NOT NEW.resolved_at<NEW.expires_at
						OR NEW.resolve_receipt_json->>'callbackLocalProviderStateHandleDigest' IS DISTINCT FROM
							NEW.provider_state_reference_digest))
					OR (resolve_status<>'resolved' AND
						NEW.resolve_receipt_json->'callbackLocalProviderStateHandleDigest'<>'null'::jsonb)
					OR (resolve_status='expired' AND NEW.resolved_at<NEW.expires_at)
					OR (NEW.status='retired' AND resolve_status<>'retired') THEN
					RAISE EXCEPTION 'native Provider state vault resolve receipt binding is invalid'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			IF OLD.status='active' AND NEW.status='retired'
				AND OLD.retire_request_digest IS NULL AND NEW.retire_request_digest IS NOT NULL THEN
				IF NEW.recovery_request_digest IS NOT NULL AND EXISTS (
					SELECT 1 FROM agent_evaluation_native_provider_state_vault_recoveries
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit
						AND recovery_request_digest=NEW.recovery_request_digest
				) THEN
					RAISE EXCEPTION 'native Provider state vault recovery member is already sealed'
						USING ERRCODE='23514';
				END IF;
				IF (to_jsonb(OLD)-ARRAY[
					'retire_request_digest','retire_request_json','retire_request_bytes',
					'retirement_receipt_digest','retirement_receipt_json',
					'retirement_receipt_bytes','disposition','retired_at','status',
					'ciphertext_bytes','ciphertext_nonce','wrapped_state_key_bytes',
					'wrapped_state_key_nonce','recovery_request_digest','updated_at'
				]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY[
					'retire_request_digest','retire_request_json','retire_request_bytes',
					'retirement_receipt_digest','retirement_receipt_json',
					'retirement_receipt_bytes','disposition','retired_at','status',
					'ciphertext_bytes','ciphertext_nonce','wrapped_state_key_bytes',
					'wrapped_state_key_nonce','recovery_request_digest','updated_at'
				]) OR NEW.updated_at<>NEW.retired_at OR NEW.retired_at<OLD.updated_at THEN
					RAISE EXCEPTION 'native Provider state vault retirement changed frozen fields'
						USING ERRCODE='23514';
				END IF;
				IF jsonb_typeof(NEW.retire_request_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.retire_request_json)<>18
					OR NOT (NEW.retire_request_json ?& ARRAY[
						'format','version','authorityDigest','opaqueProviderStateRef',
						'sealRequestDigest','sealReceiptDigest','resolveReceiptDigest','purpose',
						'sourceAttemptId','sourceInvocationId','sourceGeneration',
						'consumerAttemptId','consumerInvocationId','consumerGeneration',
						'disposition','requestedAt','expiresAt','retireRequestDigest'
					]) OR NEW.retire_request_json->>'format' IS DISTINCT FROM
						'prodivix.agent-native-provider-state-vault-retire-request'
					OR (NEW.retire_request_json->>'version')::bigint IS DISTINCT FROM 1
					OR NEW.retire_request_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
					OR NEW.retire_request_json->>'opaqueProviderStateRef' IS DISTINCT FROM
						NEW.opaque_provider_state_ref
					OR NEW.retire_request_json->>'sealRequestDigest' IS DISTINCT FROM NEW.seal_request_digest
					OR NEW.retire_request_json->>'sealReceiptDigest' IS DISTINCT FROM NEW.seal_receipt_digest
					OR NEW.retire_request_json->>'purpose' IS DISTINCT FROM NEW.purpose
					OR NEW.retire_request_json->>'sourceAttemptId' IS DISTINCT FROM NEW.attempt_id
					OR NEW.retire_request_json->>'sourceInvocationId' IS DISTINCT FROM NEW.invocation_id
					OR (NEW.retire_request_json->>'sourceGeneration')::bigint IS DISTINCT FROM NEW.generation
					OR NEW.retire_request_json->>'disposition' IS DISTINCT FROM NEW.disposition
					OR NEW.retire_request_json->>'retireRequestDigest' IS DISTINCT FROM NEW.retire_request_digest THEN
					RAISE EXCEPTION 'native Provider state vault retirement request binding is invalid'
						USING ERRCODE='23514';
				END IF;
				retire_requested_at:=(NEW.retire_request_json->>'requestedAt')::timestamptz;
				retire_expires_at:=(NEW.retire_request_json->>'expiresAt')::timestamptz;
				resolve_digest:=NEW.retire_request_json->'resolveReceiptDigest';
				consumer_attempt:=NEW.retire_request_json->'consumerAttemptId';
				consumer_invocation:=NEW.retire_request_json->'consumerInvocationId';
				consumer_generation:=NEW.retire_request_json->'consumerGeneration';
				IF retire_requested_at IS NULL OR retire_expires_at IS NULL
					OR retire_requested_at<NEW.sealed_at
					OR retire_requested_at>NEW.expires_at+INTERVAL '30 seconds'
					OR retire_expires_at<>NEW.expires_at
					OR NEW.retired_at<retire_requested_at
					OR NEW.retired_at>retire_requested_at+INTERVAL '30 seconds'
					OR NEW.retired_at>NEW.expires_at+INTERVAL '30 seconds'
					OR (NEW.disposition='expired' AND retire_requested_at<NEW.expires_at)
					OR (resolve_digest='null'::jsonb AND (
						consumer_attempt<>'null'::jsonb OR consumer_invocation<>'null'::jsonb
						OR consumer_generation<>'null'::jsonb OR NEW.disposition='consumed'))
					OR (resolve_digest<>'null'::jsonb AND (
						NEW.resolve_receipt_digest IS NULL
						OR NEW.retire_request_json->>'resolveReceiptDigest' IS DISTINCT FROM
							NEW.resolve_receipt_digest
						OR NEW.retire_request_json->>'consumerAttemptId' IS DISTINCT FROM NEW.attempt_id
						OR NEW.retire_request_json->>'consumerInvocationId' IS DISTINCT FROM
							NEW.resolve_request_json->>'consumerInvocationId'
						OR (NEW.retire_request_json->>'consumerGeneration')::bigint IS DISTINCT FROM NEW.generation
						OR retire_requested_at<NEW.resolved_at
						OR (NEW.disposition='consumed' AND
							NEW.resolve_receipt_json->>'status' IS DISTINCT FROM 'resolved')
						OR (NEW.disposition='cancelled' AND
							NEW.resolve_receipt_json->>'status'='resolved')
						OR (NEW.disposition='expired' AND
							NEW.resolve_receipt_json->>'status' IS DISTINCT FROM 'expired')))
					OR jsonb_typeof(NEW.retirement_receipt_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.retirement_receipt_json)<>14
					OR NOT (NEW.retirement_receipt_json ?& ARRAY[
						'format','version','authorityDigest','retireRequestDigest',
						'sealReceiptDigest','opaqueProviderStateRef',
						'stateKeyCreationReceiptDigest','resolveReceiptDigest','disposition',
						'stateKeyDestructionReceiptDigest','opaqueRecordDeletionReceiptDigest',
						'cryptographicExpiryReceiptDigest','retiredAt','receiptDigest'
					]) OR NEW.retirement_receipt_json->>'format' IS DISTINCT FROM
						'prodivix.agent-native-provider-state-vault-retirement-receipt'
					OR (NEW.retirement_receipt_json->>'version')::bigint IS DISTINCT FROM 1
					OR NEW.retirement_receipt_json->>'authorityDigest' IS DISTINCT FROM NEW.authority_digest
					OR NEW.retirement_receipt_json->>'retireRequestDigest' IS DISTINCT FROM
						NEW.retire_request_digest
					OR NEW.retirement_receipt_json->>'sealReceiptDigest' IS DISTINCT FROM NEW.seal_receipt_digest
					OR NEW.retirement_receipt_json->>'opaqueProviderStateRef' IS DISTINCT FROM
						NEW.opaque_provider_state_ref
					OR NEW.retirement_receipt_json->>'stateKeyCreationReceiptDigest' IS DISTINCT FROM
						NEW.state_key_creation_receipt_digest
					OR NEW.retirement_receipt_json->'resolveReceiptDigest' IS DISTINCT FROM
						NEW.retire_request_json->'resolveReceiptDigest'
					OR NEW.retirement_receipt_json->>'disposition' IS DISTINCT FROM NEW.disposition
					OR NOT COALESCE(NEW.retirement_receipt_json->>'stateKeyDestructionReceiptDigest'
						~ '^sha256-[a-f0-9]{64}$',FALSE)
					OR NOT COALESCE(NEW.retirement_receipt_json->>'opaqueRecordDeletionReceiptDigest'
						~ '^sha256-[a-f0-9]{64}$',FALSE)
					OR NOT COALESCE(NEW.retirement_receipt_json->>'cryptographicExpiryReceiptDigest'
						~ '^sha256-[a-f0-9]{64}$',FALSE)
					OR (NEW.retirement_receipt_json->>'retiredAt')::timestamptz IS DISTINCT FROM NEW.retired_at
					OR NEW.retirement_receipt_json->>'receiptDigest' IS DISTINCT FROM
						NEW.retirement_receipt_digest THEN
					RAISE EXCEPTION 'native Provider state vault retirement receipt binding is invalid'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			IF OLD.status='active' AND NEW.status='expired-unqualified'
				AND OLD.forced_expiry_tombstone_digest IS NULL
				AND NEW.forced_expiry_tombstone_digest IS NOT NULL THEN
				IF NEW.recovery_request_digest IS NOT NULL AND EXISTS (
					SELECT 1 FROM agent_evaluation_native_provider_state_vault_recoveries
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit
						AND recovery_request_digest=NEW.recovery_request_digest
				) THEN
					RAISE EXCEPTION 'native Provider state vault recovery member is already sealed'
						USING ERRCODE='23514';
				END IF;
				IF (to_jsonb(OLD)-ARRAY[
					'forced_expiry_tombstone_digest','forced_expiry_tombstone_json',
					'forced_expiry_tombstone_bytes','forced_expired_at','status',
					'ciphertext_bytes','ciphertext_nonce','wrapped_state_key_bytes',
					'wrapped_state_key_nonce','recovery_request_digest','updated_at'
				]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY[
					'forced_expiry_tombstone_digest','forced_expiry_tombstone_json',
					'forced_expiry_tombstone_bytes','forced_expired_at','status',
					'ciphertext_bytes','ciphertext_nonce','wrapped_state_key_bytes',
					'wrapped_state_key_nonce','recovery_request_digest','updated_at'
				]) OR NEW.updated_at<>NEW.forced_expired_at
					OR NEW.forced_expired_at<OLD.updated_at THEN
					RAISE EXCEPTION 'native Provider state vault forced expiry changed frozen fields'
						USING ERRCODE='23514';
				END IF;
				IF jsonb_typeof(NEW.forced_expiry_tombstone_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(
						NEW.forced_expiry_tombstone_json
					)<>18
					OR NOT (NEW.forced_expiry_tombstone_json ?& ARRAY[
						'format','version','namespaceId','planDigest','repositoryCommit',
						'vaultOwnerInstanceId','authorityDigest','opaqueProviderStateRef',
						'sealRequestDigest','sealReceiptDigest',
						'stateKeyCreationReceiptDigest','aadDigest','ciphertextDigest',
						'wrappedStateKeyDigest','expiresAt','forcedExpiredAt','reason',
						'tombstoneDigest'
					]) OR NEW.forced_expiry_tombstone_json->>'format' IS DISTINCT FROM
						'prodivix.agent-evaluation-native-provider-state-vault-forced-expiry-tombstone'
					OR (NEW.forced_expiry_tombstone_json->>'version')::bigint
						IS DISTINCT FROM 1
					OR NEW.forced_expiry_tombstone_json->>'namespaceId'
						IS DISTINCT FROM NEW.namespace_id
					OR NEW.forced_expiry_tombstone_json->>'planDigest'
						IS DISTINCT FROM NEW.plan_digest
					OR NEW.forced_expiry_tombstone_json->>'repositoryCommit'
						IS DISTINCT FROM NEW.repository_commit
					OR NEW.forced_expiry_tombstone_json->>'vaultOwnerInstanceId'
						IS DISTINCT FROM NEW.vault_owner_instance_id
					OR NEW.forced_expiry_tombstone_json->>'authorityDigest'
						IS DISTINCT FROM NEW.authority_digest
					OR NEW.forced_expiry_tombstone_json->>'opaqueProviderStateRef'
						IS DISTINCT FROM NEW.opaque_provider_state_ref
					OR NEW.forced_expiry_tombstone_json->>'sealRequestDigest'
						IS DISTINCT FROM NEW.seal_request_digest
					OR NEW.forced_expiry_tombstone_json->>'sealReceiptDigest'
						IS DISTINCT FROM NEW.seal_receipt_digest
					OR NEW.forced_expiry_tombstone_json->>'stateKeyCreationReceiptDigest'
						IS DISTINCT FROM NEW.state_key_creation_receipt_digest
					OR NEW.forced_expiry_tombstone_json->>'aadDigest'
						IS DISTINCT FROM NEW.aad_digest
					OR NEW.forced_expiry_tombstone_json->>'ciphertextDigest'
						IS DISTINCT FROM NEW.ciphertext_digest
					OR NEW.forced_expiry_tombstone_json->>'wrappedStateKeyDigest'
						IS DISTINCT FROM NEW.wrapped_state_key_digest
					OR (NEW.forced_expiry_tombstone_json->>'expiresAt')::timestamptz
						IS DISTINCT FROM NEW.expires_at
					OR (NEW.forced_expiry_tombstone_json->>'forcedExpiredAt')::timestamptz
						IS DISTINCT FROM NEW.forced_expired_at
					OR NEW.forced_expiry_tombstone_json->>'reason' IS DISTINCT FROM
						'maximum-lifecycle-ack-window-elapsed'
					OR NEW.forced_expiry_tombstone_json->>'tombstoneDigest'
						IS DISTINCT FROM NEW.forced_expiry_tombstone_digest
					OR NEW.forced_expired_at<=NEW.expires_at+INTERVAL '30 seconds' THEN
					RAISE EXCEPTION 'native Provider state vault forced-expiry tombstone binding is invalid'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END IF;
			RAISE EXCEPTION 'native Provider state vault transition is invalid'
				USING ERRCODE='23514';
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_native_optional_bootstrap_state_vault()
			RETURNS trigger AS $$
		DECLARE
			source JSONB;
			vault_count BIGINT;
		BEGIN
			IF NEW.outcome<>'observed' THEN
				RETURN NEW;
			END IF;
			source:=NEW.native_provider_source_receipt_json->'source';
			IF source->>'sourceKind'='provider-cache-usage' THEN
				RETURN NEW;
			END IF;
			IF source->>'sourceKind' NOT IN (
				'provider-job-active-status','provider-job-terminal-status',
				'provider-stored-continuation'
			) THEN
				RAISE EXCEPTION 'native optional bootstrap state-vault source kind is invalid'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*) INTO vault_count FROM (
				SELECT 1
				FROM agent_evaluation_native_provider_state_vault_records vault
				WHERE vault.namespace_id=NEW.namespace_id
				AND vault.plan_digest=NEW.plan_digest
				AND vault.repository_commit=NEW.repository_commit
				AND vault.status='active' AND vault.v45_eligible
				AND vault.authority_digest=source->>'stateVaultAuthorityDigest'
				AND vault.seal_request_digest=source->>'stateVaultSealRequestDigest'
				AND vault.seal_receipt_digest=source->>'stateVaultSealReceiptDigest'
				AND vault.opaque_provider_state_ref=source->>'opaqueProviderStateRef'
				AND vault.provider_state_reference_digest=
					source->>'providerStateReferenceDigest'
				AND vault.attempt_id=NEW.attempt_id
				AND vault.invocation_id=NEW.invocation_id
				AND vault.generation=(source->>'generation')::bigint
				AND vault.task_id=source->>'taskId' AND vault.run_id=source->>'runId'
				AND vault.purpose=CASE source->>'sourceKind'
					WHEN 'provider-job-active-status' THEN 'background-job-state'
					WHEN 'provider-job-terminal-status' THEN 'background-job-state'
					ELSE 'reasoning-continuation-state' END
				AND vault.seal_request_json->>'protocolFamily'=NEW.protocol_family
				AND vault.seal_request_json->>'probeProgramDigest'=NEW.probe_program_digest
				AND vault.seal_request_json->>'capabilityProfileDigest'=
					NEW.capability_profile_digest
				AND vault.seal_request_json->>'requestDigest'=NEW.provider_request_digest
				AND vault.seal_request_json->>'responseDigest'=NEW.provider_response_digest
				AND vault.seal_request_json->>'providerConfigurationId'=
					NEW.provider_configuration_id
				AND vault.seal_request_json->>'modelLineageDigest'=NEW.model_lineage_digest
				AND vault.seal_request_json->>'adapterDigest'=NEW.adapter_digest
				AND vault.sealed_at<=NEW.observed_at
				AND (source->>'sourceKind'<>'provider-stored-continuation'
					OR (source->>'expiresAt')::timestamptz=vault.expires_at)
				FOR SHARE
			) matches;
			IF vault_count<>1 THEN
				RAISE EXCEPTION 'native optional bootstrap lacks exact active state-vault seal'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_native_provider_state_vault_capacity
			BEFORE INSERT ON agent_evaluation_native_provider_state_vault_records
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_native_provider_state_vault_capacity()`,
		`CREATE TRIGGER agent_evaluation_native_provider_state_vault_lifecycle
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_native_provider_state_vault_records
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_native_provider_state_vault_record()`,
		`CREATE TRIGGER agent_evaluation_native_optional_bootstrap_state_vault
			BEFORE INSERT ON agent_evaluation_native_optional_capability_bootstrap_sources
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_native_optional_bootstrap_state_vault()`,
	}
}
