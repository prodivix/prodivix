package database

// agentEvaluationNativeProviderStateVaultRecoveryTableStatements installs the
// terminal owner fence before the state-vault record trigger is compiled. The
// aggregate is inserted after every recovery member has destroyed its secret
// bytes, while the deferred member foreign key closes the transaction at commit.
func agentEvaluationNativeProviderStateVaultRecoveryTableStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS agent_evaluation_native_provider_state_vault_recoveries (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			vault_owner_instance_id TEXT NOT NULL,
			authority_digest TEXT NOT NULL,
			recovery_request_digest TEXT NOT NULL,
			recovery_request_json JSONB NOT NULL,
			recovery_request_bytes BYTEA NOT NULL,
			recovery_receipt_digest TEXT NOT NULL,
			recovery_receipt_json JSONB NOT NULL,
			recovery_receipt_bytes BYTEA NOT NULL,
			terminal_record_set_digest TEXT NOT NULL,
			retired_record_count BIGINT NOT NULL,
			forced_expiry_tombstone_count BIGINT NOT NULL,
			completed_at TIMESTAMPTZ NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (
				namespace_id,plan_digest,repository_commit,recovery_request_digest
			),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,vault_owner_instance_id
			),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,recovery_request_digest,
				vault_owner_instance_id,authority_digest
			),
			FOREIGN KEY (namespace_id,plan_digest,repository_commit)
				REFERENCES agent_evaluation_plans(namespace_id,plan_digest,repository_commit)
				ON DELETE RESTRICT,
			CONSTRAINT agent_eval_native_provider_state_vault_recovery_identity_check CHECK (
				namespace_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$'
				AND repository_commit ~ '^[a-f0-9]{40}$'
				AND vault_owner_instance_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				AND v45_eligible
			),
			CONSTRAINT agent_eval_native_provider_state_vault_recovery_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND recovery_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND recovery_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND terminal_record_set_digest ~ '^sha256-[a-f0-9]{64}$'
			),
			CONSTRAINT agent_eval_native_provider_state_vault_recovery_bytes_check CHECK (
				octet_length(recovery_request_bytes) BETWEEN 1 AND 16384
				AND recovery_request_json=convert_from(recovery_request_bytes,'UTF8')::jsonb
				AND octet_length(recovery_receipt_bytes) BETWEEN 1 AND 16384
				AND recovery_receipt_json=convert_from(recovery_receipt_bytes,'UTF8')::jsonb
			),
			CONSTRAINT agent_eval_native_provider_state_vault_recovery_count_check CHECK (
				retired_record_count>=0 AND forced_expiry_tombstone_count>=0
				AND retired_record_count+forced_expiry_tombstone_count<=5880
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_native_provider_state_vault_recovery_owner
			ON agent_evaluation_native_provider_state_vault_recoveries(
				namespace_id,repository_commit,vault_owner_instance_id,completed_at
			)`,
	}
}

// agentEvaluationNativeProviderStateVaultRecoveryStatements binds a recovery
// receipt to the exact terminal rows produced in the same transaction. The
// trigger reconstructs canonical JSON and its SHA-256 identities with core
// PostgreSQL 16 functions, so replay cannot substitute caller-minted counts or
// a caller-minted terminal record-set root.
func agentEvaluationNativeProviderStateVaultRecoveryStatements() []string {
	return []string{
		`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_native_provider_state_vault_recovery_member
			ON agent_evaluation_native_provider_state_vault_records(
				namespace_id,plan_digest,repository_commit,recovery_request_digest,
				opaque_provider_state_ref COLLATE "C"
			) WHERE recovery_request_digest IS NOT NULL`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_native_provider_state_vault_recovery()
			RETURNS trigger AS $$
		DECLARE
			request_requested_at TIMESTAMPTZ;
			request_requested_at_text TEXT;
			receipt_completed_at_text TEXT;
			request_base TEXT;
			request_canonical TEXT;
			receipt_base TEXT;
			receipt_canonical TEXT;
			terminal_records TEXT;
			terminal_set_canonical TEXT;
			expected_terminal_set_digest TEXT;
			member_count BIGINT;
			retired_count BIGINT;
			cancelled_count BIGINT;
			consumed_count BIGINT;
			expired_count BIGINT;
			forced_count BIGINT;
			residual_count BIGINT;
			receipt_retired_count BIGINT;
			receipt_cancelled_count BIGINT;
			receipt_consumed_count BIGINT;
			receipt_expired_count BIGINT;
			receipt_forced_count BIGINT;
			run_config_authority JSONB;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtextextended(
				NEW.namespace_id || chr(31) || NEW.plan_digest || chr(31) ||
				NEW.repository_commit || chr(31) || NEW.vault_owner_instance_id ||
				chr(31) || 'native-provider-state-vault-recovery',0
			));
			IF jsonb_typeof(NEW.recovery_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.recovery_request_json)<>10
				OR NOT (NEW.recovery_request_json ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit',
					'vaultOwnerInstanceId','authorityDigest','reason','requestedAt',
					'recoveryRequestDigest'
				]) OR NEW.recovery_request_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-native-provider-state-vault-recovery-request'
				OR NEW.recovery_request_json->'version' IS DISTINCT FROM '1'::jsonb
				OR NEW.recovery_request_json->>'namespaceId' IS DISTINCT FROM NEW.namespace_id
				OR NEW.recovery_request_json->>'planDigest' IS DISTINCT FROM NEW.plan_digest
				OR NEW.recovery_request_json->>'repositoryCommit' IS DISTINCT FROM
					NEW.repository_commit
				OR NEW.recovery_request_json->>'vaultOwnerInstanceId' IS DISTINCT FROM
					NEW.vault_owner_instance_id
				OR NEW.recovery_request_json->>'authorityDigest' IS DISTINCT FROM
					NEW.authority_digest
				OR NEW.recovery_request_json->>'reason' IS DISTINCT FROM 'owner-crash-recovery'
				OR NEW.recovery_request_json->>'recoveryRequestDigest' IS DISTINCT FROM
					NEW.recovery_request_digest THEN
				RAISE EXCEPTION 'native Provider state vault recovery request binding is invalid'
					USING ERRCODE='23514';
			END IF;
			request_requested_at_text:=NEW.recovery_request_json->>'requestedAt';
			IF NOT COALESCE(request_requested_at_text ~
				'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$',FALSE) THEN
				RAISE EXCEPTION 'native Provider state vault recovery requestedAt is invalid'
					USING ERRCODE='23514';
			END IF;
			request_requested_at:=request_requested_at_text::timestamptz;
			request_base:='{"authorityDigest":'||to_jsonb(NEW.authority_digest)::text||
				',"format":"prodivix.agent-evaluation-native-provider-state-vault-recovery-request"'||
				',"namespaceId":'||to_jsonb(NEW.namespace_id)::text||
				',"planDigest":'||to_jsonb(NEW.plan_digest)::text||
				',"reason":"owner-crash-recovery"'||
				',"repositoryCommit":'||to_jsonb(NEW.repository_commit)::text||
				',"requestedAt":'||to_jsonb(request_requested_at_text)::text||
				',"vaultOwnerInstanceId":'||to_jsonb(NEW.vault_owner_instance_id)::text||
				',"version":1}';
			IF NEW.recovery_request_digest IS DISTINCT FROM
				'sha256-'||encode(sha256(convert_to(request_base,'UTF8')),'hex') THEN
				RAISE EXCEPTION 'native Provider state vault recovery request digest is invalid'
					USING ERRCODE='23514';
			END IF;
			request_canonical:='{"authorityDigest":'||to_jsonb(NEW.authority_digest)::text||
				',"format":"prodivix.agent-evaluation-native-provider-state-vault-recovery-request"'||
				',"namespaceId":'||to_jsonb(NEW.namespace_id)::text||
				',"planDigest":'||to_jsonb(NEW.plan_digest)::text||
				',"reason":"owner-crash-recovery"'||
				',"recoveryRequestDigest":'||to_jsonb(NEW.recovery_request_digest)::text||
				',"repositoryCommit":'||to_jsonb(NEW.repository_commit)::text||
				',"requestedAt":'||to_jsonb(request_requested_at_text)::text||
				',"vaultOwnerInstanceId":'||to_jsonb(NEW.vault_owner_instance_id)::text||
				',"version":1}';
			IF convert_from(NEW.recovery_request_bytes,'UTF8') IS DISTINCT FROM
				request_canonical THEN
				RAISE EXCEPTION 'native Provider state vault recovery request bytes are not canonical'
					USING ERRCODE='23514';
			END IF;

			IF jsonb_typeof(NEW.recovery_receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.recovery_receipt_json)<>18
				OR NOT (NEW.recovery_receipt_json ?& ARRAY[
					'format','version','recoveryRequestDigest','namespaceId','planDigest',
					'repositoryCommit','vaultOwnerInstanceId','authorityDigest','reason',
					'retiredRecordCount','cancelledRetirementCount','consumedRetirementCount',
					'expiredRetirementCount','forcedExpiryTombstoneCount',
					'terminalRecordSetDigest','residualActiveEncryptedRecordCount',
					'completedAt','receiptDigest'
				]) OR NEW.recovery_receipt_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-native-provider-state-vault-recovery-receipt'
				OR NEW.recovery_receipt_json->'version' IS DISTINCT FROM '1'::jsonb
				OR NEW.recovery_receipt_json->>'recoveryRequestDigest' IS DISTINCT FROM
					NEW.recovery_request_digest
				OR NEW.recovery_receipt_json->>'namespaceId' IS DISTINCT FROM NEW.namespace_id
				OR NEW.recovery_receipt_json->>'planDigest' IS DISTINCT FROM NEW.plan_digest
				OR NEW.recovery_receipt_json->>'repositoryCommit' IS DISTINCT FROM
					NEW.repository_commit
				OR NEW.recovery_receipt_json->>'vaultOwnerInstanceId' IS DISTINCT FROM
					NEW.vault_owner_instance_id
				OR NEW.recovery_receipt_json->>'authorityDigest' IS DISTINCT FROM
					NEW.authority_digest
				OR NEW.recovery_receipt_json->>'reason' IS DISTINCT FROM 'owner-crash-recovery'
				OR NEW.recovery_receipt_json->>'terminalRecordSetDigest' IS DISTINCT FROM
					NEW.terminal_record_set_digest
				OR NEW.recovery_receipt_json->>'receiptDigest' IS DISTINCT FROM
					NEW.recovery_receipt_digest
				OR NEW.recovery_receipt_json->'residualActiveEncryptedRecordCount'
					IS DISTINCT FROM '0'::jsonb THEN
				RAISE EXCEPTION 'native Provider state vault recovery receipt binding is invalid'
					USING ERRCODE='23514';
			END IF;
			IF NOT COALESCE(NEW.recovery_receipt_json->>'retiredRecordCount' ~ '^[0-9]+$',FALSE)
				OR NOT COALESCE(NEW.recovery_receipt_json->>'cancelledRetirementCount' ~ '^[0-9]+$',FALSE)
				OR NOT COALESCE(NEW.recovery_receipt_json->>'consumedRetirementCount' ~ '^[0-9]+$',FALSE)
				OR NOT COALESCE(NEW.recovery_receipt_json->>'expiredRetirementCount' ~ '^[0-9]+$',FALSE)
				OR NOT COALESCE(NEW.recovery_receipt_json->>'forcedExpiryTombstoneCount' ~ '^[0-9]+$',FALSE) THEN
				RAISE EXCEPTION 'native Provider state vault recovery receipt counts are invalid'
					USING ERRCODE='23514';
			END IF;
			receipt_retired_count:=(NEW.recovery_receipt_json->>'retiredRecordCount')::bigint;
			receipt_cancelled_count:=(NEW.recovery_receipt_json->>'cancelledRetirementCount')::bigint;
			receipt_consumed_count:=(NEW.recovery_receipt_json->>'consumedRetirementCount')::bigint;
			receipt_expired_count:=(NEW.recovery_receipt_json->>'expiredRetirementCount')::bigint;
			receipt_forced_count:=(NEW.recovery_receipt_json->>'forcedExpiryTombstoneCount')::bigint;
			receipt_completed_at_text:=NEW.recovery_receipt_json->>'completedAt';
			IF NOT COALESCE(receipt_completed_at_text ~
				'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$',FALSE)
				OR receipt_completed_at_text::timestamptz IS DISTINCT FROM NEW.completed_at
				OR NEW.completed_at<request_requested_at
				OR NEW.completed_at>request_requested_at+INTERVAL '125 seconds'
				OR receipt_retired_count IS DISTINCT FROM NEW.retired_record_count
				OR receipt_forced_count IS DISTINCT FROM NEW.forced_expiry_tombstone_count
				OR receipt_retired_count<>receipt_cancelled_count+receipt_consumed_count+
					receipt_expired_count
				OR receipt_retired_count+receipt_forced_count>5880 THEN
				RAISE EXCEPTION 'native Provider state vault recovery receipt time/count is invalid'
					USING ERRCODE='23514';
			END IF;

			SELECT artifact.run_config_json#>'{nativeProviderStateVaultEncryption,authority}'
			INTO run_config_authority
			FROM agent_evaluation_plans plan
			JOIN agent_evaluation_production_run_config_artifacts artifact
			  ON artifact.namespace_id=plan.namespace_id
			 AND artifact.plan_digest=plan.plan_digest
			 AND artifact.repository_commit=plan.repository_commit
			WHERE plan.namespace_id=NEW.namespace_id AND plan.plan_digest=NEW.plan_digest
				AND plan.repository_commit=NEW.repository_commit
			FOR SHARE OF plan,artifact;
			IF NOT FOUND OR jsonb_typeof(run_config_authority)<>'object'
				OR agent_evaluation_jsonb_object_key_count(run_config_authority)<>16
				OR NOT (run_config_authority ?& ARRAY[
					'format','version','authorityId','authorityImplementationDigest',
					'storageMode','cryptographicExpiryMode','algorithm','keyReferenceDigest',
					'keyVersion','encryptionProfileDigest','retentionPolicyDigest',
					'deletionReceiptPolicyDigest','maximumLifetimeMs',
					'maximumLifecycleAckDelayMs','reconciliationMode','authorityDigest'
				])
				OR run_config_authority->>'format' IS DISTINCT FROM
					'prodivix.agent-native-provider-state-vault-authority'
				OR run_config_authority->'version' IS DISTINCT FROM '1'::jsonb
				OR run_config_authority->>'authorityId' IS DISTINCT FROM
					'evaluation.native-provider-state-vault.owner.v1'
				OR NOT COALESCE(run_config_authority->>'authorityImplementationDigest'
					~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR run_config_authority->>'storageMode' IS DISTINCT FROM
					'server-side-vault-record'
				OR run_config_authority->>'cryptographicExpiryMode' IS DISTINCT FROM
					'per-state-data-key-destroy'
				OR run_config_authority->>'algorithm' IS DISTINCT FROM 'aes-256-gcm'
				OR NOT COALESCE(run_config_authority->>'keyReferenceDigest'
					~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR run_config_authority->'keyVersion' IS DISTINCT FROM '1'::jsonb
				OR NOT COALESCE(run_config_authority->>'encryptionProfileDigest'
					~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(run_config_authority->>'retentionPolicyDigest'
					~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR NOT COALESCE(run_config_authority->>'deletionReceiptPolicyDigest'
					~ '^sha256-[a-f0-9]{64}$',FALSE)
				OR run_config_authority->'maximumLifetimeMs' IS DISTINCT FROM '125000'::jsonb
				OR run_config_authority->'maximumLifecycleAckDelayMs'
					IS DISTINCT FROM '30000'::jsonb
				OR run_config_authority->>'reconciliationMode' IS DISTINCT FROM
					'request-digest-idempotent'
				OR run_config_authority->>'authorityDigest' IS DISTINCT FROM
					NEW.authority_digest THEN
				RAISE EXCEPTION 'native Provider state vault recovery lacks frozen authority'
					USING ERRCODE='23514';
			END IF;

			IF EXISTS (
				SELECT 1 FROM agent_evaluation_native_provider_state_vault_records member
				WHERE member.namespace_id=NEW.namespace_id
					AND member.plan_digest=NEW.plan_digest
					AND member.repository_commit=NEW.repository_commit
					AND member.recovery_request_digest=NEW.recovery_request_digest
					AND (member.vault_owner_instance_id<>NEW.vault_owner_instance_id
						OR member.authority_digest<>NEW.authority_digest
						OR member.status NOT IN ('retired','expired-unqualified')
						OR member.ciphertext_bytes IS NOT NULL
						OR member.ciphertext_nonce IS NOT NULL
						OR member.wrapped_state_key_bytes IS NOT NULL
						OR member.wrapped_state_key_nonce IS NOT NULL
						OR (member.status='retired' AND (
							member.retirement_receipt_digest IS NULL
							OR member.disposition NOT IN ('cancelled','consumed','expired')
							OR member.retired_at IS DISTINCT FROM NEW.completed_at))
						OR (member.status='expired-unqualified' AND (
							member.forced_expiry_tombstone_digest IS NULL
							OR member.disposition IS NOT NULL
							OR member.forced_expired_at IS DISTINCT FROM NEW.completed_at)))
			) THEN
				RAISE EXCEPTION 'native Provider state vault recovery member binding is invalid'
					USING ERRCODE='23514';
			END IF;
			SELECT COUNT(*),
				COUNT(*) FILTER (WHERE status='retired'),
				COUNT(*) FILTER (WHERE status='retired' AND disposition='cancelled'),
				COUNT(*) FILTER (WHERE status='retired' AND disposition='consumed'),
				COUNT(*) FILTER (WHERE status='retired' AND disposition='expired'),
				COUNT(*) FILTER (WHERE status='expired-unqualified'),
				COALESCE(string_agg(
					'{"disposition":'||CASE WHEN status='expired-unqualified' THEN 'null'
						ELSE to_jsonb(disposition)::text END||
					',"opaqueProviderStateRef":'||to_jsonb(opaque_provider_state_ref)::text||
					',"sealRequestDigest":'||to_jsonb(seal_request_digest)::text||
					',"terminalDigest":'||to_jsonb(CASE WHEN status='retired'
						THEN retirement_receipt_digest ELSE forced_expiry_tombstone_digest END)::text||
					',"terminalKind":'||to_jsonb(CASE WHEN status='retired'
						THEN 'retirement-receipt' ELSE 'forced-expiry-tombstone' END)::text||'}',
					',' ORDER BY opaque_provider_state_ref COLLATE "C"
				),'')
			INTO member_count,retired_count,cancelled_count,consumed_count,
				expired_count,forced_count,terminal_records
			FROM agent_evaluation_native_provider_state_vault_records
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND recovery_request_digest=NEW.recovery_request_digest
				AND vault_owner_instance_id=NEW.vault_owner_instance_id
				AND authority_digest=NEW.authority_digest;
			SELECT COUNT(*) INTO residual_count
			FROM agent_evaluation_native_provider_state_vault_records
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND vault_owner_instance_id=NEW.vault_owner_instance_id
				AND status='active';
			IF member_count<>retired_count+forced_count
				OR retired_count<>receipt_retired_count
				OR cancelled_count<>receipt_cancelled_count
				OR consumed_count<>receipt_consumed_count
				OR expired_count<>receipt_expired_count
				OR forced_count<>receipt_forced_count
				OR residual_count<>0 THEN
				RAISE EXCEPTION 'native Provider state vault recovery is not zero-residual'
					USING ERRCODE='23514';
			END IF;
			terminal_set_canonical:=
				'{"format":"prodivix.agent-evaluation-native-provider-state-vault-recovery-terminal-record-set"'||
				',"records":['||terminal_records||'],"version":1}';
			expected_terminal_set_digest:=
				'sha256-'||encode(sha256(convert_to(terminal_set_canonical,'UTF8')),'hex');
			IF NEW.terminal_record_set_digest IS DISTINCT FROM expected_terminal_set_digest THEN
				RAISE EXCEPTION 'native Provider state vault recovery terminal root is invalid'
					USING ERRCODE='23514';
			END IF;

			receipt_base:='{"authorityDigest":'||to_jsonb(NEW.authority_digest)::text||
				',"cancelledRetirementCount":'||receipt_cancelled_count::text||
				',"completedAt":'||to_jsonb(receipt_completed_at_text)::text||
				',"consumedRetirementCount":'||receipt_consumed_count::text||
				',"expiredRetirementCount":'||receipt_expired_count::text||
				',"forcedExpiryTombstoneCount":'||receipt_forced_count::text||
				',"format":"prodivix.agent-evaluation-native-provider-state-vault-recovery-receipt"'||
				',"namespaceId":'||to_jsonb(NEW.namespace_id)::text||
				',"planDigest":'||to_jsonb(NEW.plan_digest)::text||
				',"reason":"owner-crash-recovery"'||
				',"recoveryRequestDigest":'||to_jsonb(NEW.recovery_request_digest)::text||
				',"repositoryCommit":'||to_jsonb(NEW.repository_commit)::text||
				',"residualActiveEncryptedRecordCount":0'||
				',"retiredRecordCount":'||receipt_retired_count::text||
				',"terminalRecordSetDigest":'||to_jsonb(NEW.terminal_record_set_digest)::text||
				',"vaultOwnerInstanceId":'||to_jsonb(NEW.vault_owner_instance_id)::text||
				',"version":1}';
			IF NEW.recovery_receipt_digest IS DISTINCT FROM
				'sha256-'||encode(sha256(convert_to(receipt_base,'UTF8')),'hex') THEN
				RAISE EXCEPTION 'native Provider state vault recovery receipt digest is invalid'
					USING ERRCODE='23514';
			END IF;
			receipt_canonical:='{"authorityDigest":'||to_jsonb(NEW.authority_digest)::text||
				',"cancelledRetirementCount":'||receipt_cancelled_count::text||
				',"completedAt":'||to_jsonb(receipt_completed_at_text)::text||
				',"consumedRetirementCount":'||receipt_consumed_count::text||
				',"expiredRetirementCount":'||receipt_expired_count::text||
				',"forcedExpiryTombstoneCount":'||receipt_forced_count::text||
				',"format":"prodivix.agent-evaluation-native-provider-state-vault-recovery-receipt"'||
				',"namespaceId":'||to_jsonb(NEW.namespace_id)::text||
				',"planDigest":'||to_jsonb(NEW.plan_digest)::text||
				',"reason":"owner-crash-recovery"'||
				',"receiptDigest":'||to_jsonb(NEW.recovery_receipt_digest)::text||
				',"recoveryRequestDigest":'||to_jsonb(NEW.recovery_request_digest)::text||
				',"repositoryCommit":'||to_jsonb(NEW.repository_commit)::text||
				',"residualActiveEncryptedRecordCount":0'||
				',"retiredRecordCount":'||receipt_retired_count::text||
				',"terminalRecordSetDigest":'||to_jsonb(NEW.terminal_record_set_digest)::text||
				',"vaultOwnerInstanceId":'||to_jsonb(NEW.vault_owner_instance_id)::text||
				',"version":1}';
			IF convert_from(NEW.recovery_receipt_bytes,'UTF8') IS DISTINCT FROM
				receipt_canonical THEN
				RAISE EXCEPTION 'native Provider state vault recovery receipt bytes are not canonical'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_evaluation_native_provider_state_vault_recovery_exact
			BEFORE INSERT ON agent_evaluation_native_provider_state_vault_recoveries
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_native_provider_state_vault_recovery()`,
		`CREATE TRIGGER agent_evaluation_native_provider_state_vault_recovery_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_native_provider_state_vault_recoveries
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}
}
