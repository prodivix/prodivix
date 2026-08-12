package database

// agentEvaluationCapabilityEffectSourceConsumptionClaimStatements installs
// the pre-dispatch CAS owner for a selected prior optional-capability fact. A
// claim is inserted in the same transaction as its request-ref authority, so
// concurrent turns cannot dispatch two effects from one consumable source.
func agentEvaluationCapabilityEffectSourceConsumptionClaimStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_source_consumption_claims (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			owner_instance_id TEXT,
			claim_digest TEXT NOT NULL,
			source_handle_digest TEXT NOT NULL,
			request_ref_authority_receipt_digest TEXT NOT NULL,
			attempt_id TEXT NOT NULL,
			descriptor_digest TEXT NOT NULL,
			turn_index BIGINT NOT NULL,
			invocation_id TEXT NOT NULL,
			binding_kind TEXT NOT NULL,
			status TEXT NOT NULL,
			claimed_at TIMESTAMPTZ NOT NULL,
			terminal_owner_request_digest TEXT,
			terminal_journal_result_record_digest TEXT,
			terminal_journal_abandonment_record_digest TEXT,
			terminal_at TIMESTAMPTZ,
			claim_json JSONB NOT NULL,
			claim_bytes BYTEA NOT NULL,
			v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
			PRIMARY KEY (namespace_id,plan_digest,repository_commit,claim_digest),
			UNIQUE (
				namespace_id,plan_digest,repository_commit,
				request_ref_authority_receipt_digest
			),
			FOREIGN KEY (
				namespace_id,plan_digest,repository_commit,
				request_ref_authority_receipt_digest
			) REFERENCES agent_evaluation_capability_effect_request_ref_authorities(
				namespace_id,plan_digest,repository_commit,receipt_digest
			) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
			FOREIGN KEY (namespace_id,terminal_journal_result_record_digest)
				REFERENCES agent_evaluation_capability_effect_provider_journal_results(
					namespace_id,record_digest
				) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
			FOREIGN KEY (namespace_id,terminal_journal_abandonment_record_digest)
				REFERENCES agent_evaluation_capability_effect_provider_journal_abandonments(
					namespace_id,record_digest
				) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
			CONSTRAINT agent_eval_capability_effect_source_claim_identity_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND (owner_instance_id IS NULL OR
					owner_instance_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$')
				AND turn_index BETWEEN 1 AND 6
				AND binding_kind IN ('opaque-continuation','provider-cache','provider-job')
				AND v45_eligible
			),
			CONSTRAINT agent_eval_capability_effect_source_claim_digest_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND claim_digest ~ '^sha256-[a-f0-9]{64}$'
				AND source_handle_digest ~ '^sha256-[a-f0-9]{64}$'
				AND request_ref_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
				AND (terminal_owner_request_digest IS NULL OR
					terminal_owner_request_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (terminal_journal_result_record_digest IS NULL OR
					terminal_journal_result_record_digest ~ '^sha256-[a-f0-9]{64}$')
				AND (terminal_journal_abandonment_record_digest IS NULL OR
					terminal_journal_abandonment_record_digest ~ '^sha256-[a-f0-9]{64}$')
			),
			CONSTRAINT agent_eval_capability_effect_source_claim_status_check CHECK (
				(status='claimed' AND owner_instance_id IS NULL
					AND terminal_owner_request_digest IS NULL
					AND terminal_journal_result_record_digest IS NULL
					AND terminal_journal_abandonment_record_digest IS NULL
					AND terminal_at IS NULL)
				OR (status='consumed' AND owner_instance_id IS NOT NULL
					AND ((terminal_owner_request_digest IS NULL
						AND terminal_journal_result_record_digest IS NULL
						AND terminal_journal_abandonment_record_digest IS NULL
						AND terminal_at IS NULL)
						OR (terminal_owner_request_digest IS NOT NULL
							AND terminal_journal_result_record_digest IS NULL
							AND terminal_journal_abandonment_record_digest IS NULL
							AND terminal_at IS NOT NULL)
						OR (terminal_owner_request_digest IS NOT NULL
							AND terminal_at IS NOT NULL
							AND (terminal_journal_result_record_digest IS NULL)<>
								(terminal_journal_abandonment_record_digest IS NULL))))
				OR (status='released' AND owner_instance_id IS NOT NULL
					AND terminal_owner_request_digest IS NOT NULL
					AND terminal_journal_result_record_digest IS NULL
					AND terminal_journal_abandonment_record_digest IS NOT NULL
					AND terminal_at IS NOT NULL)
			),
			CONSTRAINT agent_eval_capability_effect_source_claim_bytes_check CHECK (
				octet_length(claim_bytes) BETWEEN 1 AND 16384
				AND claim_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(claim_json),'UTF8'
				)
			)
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_eval_capability_effect_live_source_claim
			ON agent_evaluation_capability_effect_source_consumption_claims(
				namespace_id,plan_digest,repository_commit,source_handle_digest
			) WHERE status IN ('claimed','consumed')`,
		`CREATE INDEX IF NOT EXISTS idx_agent_eval_capability_effect_source_claim_terminal
			ON agent_evaluation_capability_effect_source_consumption_claims(
				namespace_id,plan_digest,repository_commit,terminal_owner_request_digest
			) WHERE terminal_owner_request_digest IS NOT NULL`,
	}
}

func agentEvaluationCapabilityEffectSourceConsumptionClaimConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_effect_source_claim()
			RETURNS trigger AS $$
		DECLARE
			request_ref agent_evaluation_capability_effect_request_ref_authorities%ROWTYPE;
		BEGIN
			IF TG_OP='INSERT' AND NEW.status<>'claimed' THEN
				RAISE EXCEPTION 'new capability-effect source-consumption claim is not claimed'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='UPDATE' THEN
				IF ROW(
					NEW.namespace_id,NEW.plan_digest,NEW.repository_commit,NEW.claim_digest,
					NEW.source_handle_digest,NEW.request_ref_authority_receipt_digest,
					NEW.attempt_id,NEW.descriptor_digest,NEW.turn_index,NEW.invocation_id,
					NEW.binding_kind,NEW.claimed_at,NEW.claim_json,NEW.claim_bytes,NEW.v45_eligible
				) IS DISTINCT FROM ROW(
					OLD.namespace_id,OLD.plan_digest,OLD.repository_commit,OLD.claim_digest,
					OLD.source_handle_digest,OLD.request_ref_authority_receipt_digest,
					OLD.attempt_id,OLD.descriptor_digest,OLD.turn_index,OLD.invocation_id,
					OLD.binding_kind,OLD.claimed_at,OLD.claim_json,OLD.claim_bytes,OLD.v45_eligible
				) OR NOT (
					(OLD.status='claimed' AND NEW.status='claimed'
						AND NEW.owner_instance_id IS NULL)
					OR (OLD.status='claimed' AND NEW.status='consumed'
						AND OLD.owner_instance_id IS NULL AND NEW.owner_instance_id IS NOT NULL)
					OR (OLD.status='consumed' AND NEW.status='consumed'
						AND NEW.owner_instance_id IS NOT DISTINCT FROM OLD.owner_instance_id)
					OR (OLD.status='released' AND NEW.status='released'
						AND NEW.owner_instance_id IS NOT DISTINCT FROM OLD.owner_instance_id
						AND ROW(
							NEW.terminal_owner_request_digest,
							NEW.terminal_journal_result_record_digest,
							NEW.terminal_journal_abandonment_record_digest,NEW.terminal_at
						) IS NOT DISTINCT FROM ROW(
							OLD.terminal_owner_request_digest,
							OLD.terminal_journal_result_record_digest,
							OLD.terminal_journal_abandonment_record_digest,OLD.terminal_at
						))
				) THEN
					RAISE EXCEPTION 'capability-effect source-consumption claim transition is invalid'
						USING ERRCODE='23514';
				END IF;
			END IF;

			SELECT * INTO request_ref
			FROM agent_evaluation_capability_effect_request_ref_authorities
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND receipt_digest=NEW.request_ref_authority_receipt_digest
			FOR SHARE;
			IF NOT FOUND OR request_ref.selected_source_handle_digest IS NULL
				OR request_ref.selected_source_handle_digest<>NEW.source_handle_digest
				OR request_ref.attempt_id<>NEW.attempt_id
				OR request_ref.descriptor_digest<>NEW.descriptor_digest
				OR request_ref.turn_index<>NEW.turn_index
				OR request_ref.invocation_id<>NEW.invocation_id
				OR request_ref.binding_kind<>NEW.binding_kind
				OR NEW.claimed_at<request_ref.issued_at
				OR NEW.claimed_at>=request_ref.expires_at THEN
				RAISE EXCEPTION 'capability-effect source-consumption claim lacks its exact request-ref authority'
					USING ERRCODE='23514';
			END IF;
			IF jsonb_typeof(NEW.claim_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.claim_json)<>14
				OR NOT (NEW.claim_json ?& ARRAY[
					'format','version','namespaceId','planDigest','repositoryCommit',
					'sourceHandleDigest','requestRefAuthorityReceiptDigest','attemptId',
					'descriptorDigest','turnIndex','invocationId','bindingKind','claimedAt',
					'claimDigest'
				])
				OR NEW.claim_json->>'format' IS DISTINCT FROM
					'prodivix.agent-evaluation-capability-effect-source-consumption-claim'
				OR (NEW.claim_json->>'version')::bigint IS DISTINCT FROM 1
				OR NEW.claim_json->>'namespaceId' IS DISTINCT FROM NEW.namespace_id
				OR NEW.claim_json->>'planDigest' IS DISTINCT FROM NEW.plan_digest
				OR NEW.claim_json->>'repositoryCommit' IS DISTINCT FROM NEW.repository_commit
				OR NEW.claim_json->>'sourceHandleDigest' IS DISTINCT FROM NEW.source_handle_digest
				OR NEW.claim_json->>'requestRefAuthorityReceiptDigest' IS DISTINCT FROM
					NEW.request_ref_authority_receipt_digest
				OR NEW.claim_json->>'attemptId' IS DISTINCT FROM NEW.attempt_id
				OR NEW.claim_json->>'descriptorDigest' IS DISTINCT FROM NEW.descriptor_digest
				OR (NEW.claim_json->>'turnIndex')::bigint IS DISTINCT FROM NEW.turn_index
				OR NEW.claim_json->>'invocationId' IS DISTINCT FROM NEW.invocation_id
				OR NEW.claim_json->>'bindingKind' IS DISTINCT FROM NEW.binding_kind
				OR (NEW.claim_json->>'claimedAt')::timestamptz IS DISTINCT FROM NEW.claimed_at
				OR NEW.claim_json->>'claimDigest' IS DISTINCT FROM NEW.claim_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.claim_json-'claimDigest')
					IS DISTINCT FROM NEW.claim_digest THEN
				RAISE EXCEPTION 'capability-effect source-consumption claim canonical record drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_capability_effect_source_claims_exact
			BEFORE INSERT OR UPDATE ON agent_evaluation_capability_effect_source_consumption_claims
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_effect_source_claim()`,
		`CREATE TRIGGER agent_eval_capability_effect_source_claims_no_delete
			BEFORE DELETE ON agent_evaluation_capability_effect_source_consumption_claims
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_capability_effect_source_claims_finalized
			BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_source_consumption_claims
			FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_request_ref_source_claim()
			RETURNS trigger AS $$
		BEGIN
			IF NEW.selected_source_handle_digest IS NOT NULL AND NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_capability_effect_source_consumption_claims claim
				WHERE claim.namespace_id=NEW.namespace_id
					AND claim.plan_digest=NEW.plan_digest
					AND claim.repository_commit=NEW.repository_commit
					AND claim.request_ref_authority_receipt_digest=NEW.receipt_digest
					AND claim.source_handle_digest=NEW.selected_source_handle_digest
					AND claim.status IN ('claimed','consumed')
			) THEN
				RAISE EXCEPTION 'capability-effect request-ref lacks its durable source-consumption claim'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_capability_effect_request_ref_source_claim_required
			AFTER INSERT ON agent_evaluation_capability_effect_request_ref_authorities
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_request_ref_source_claim()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_source_claim_terminal_state()
			RETURNS trigger AS $$
		DECLARE
			stage_row agent_evaluation_capability_effect_provider_journal_stages%ROWTYPE;
			execution_count BIGINT;
			result_record_digest TEXT;
			result_consumed_digest TEXT;
			abandonment_record_digest TEXT;
		BEGIN
			SELECT stage.* INTO stage_row
			FROM agent_evaluation_capability_effect_provider_journal_stages stage
			WHERE stage.namespace_id=NEW.namespace_id AND stage.plan_digest=NEW.plan_digest
				AND stage.repository_commit=NEW.repository_commit
				AND stage.owner_instance_id=NEW.owner_instance_id
				AND stage.binding_kind=NEW.binding_kind
				AND stage.attempt_id=NEW.attempt_id
				AND stage.descriptor_digest=NEW.descriptor_digest
				AND stage.turn_index=NEW.turn_index
				AND stage.invocation_id=NEW.invocation_id
				AND stage.record_json#>>'{preEffectIntent,inputAuthorityBinding,requestRefAuthorityReceiptDigest}'=
					NEW.request_ref_authority_receipt_digest;
			IF NOT FOUND THEN
				IF NEW.status<>'claimed' THEN
					RAISE EXCEPTION 'terminal capability-effect source claim lacks its Provider journal stage'
						USING ERRCODE='23514';
				END IF;
				RETURN NULL;
			END IF;
			SELECT COUNT(*) INTO execution_count
			FROM agent_evaluation_capability_effect_provider_journal_executions execution
			WHERE execution.namespace_id=stage_row.namespace_id
				AND execution.plan_digest=stage_row.plan_digest
				AND execution.repository_commit=stage_row.repository_commit
				AND execution.owner_instance_id=stage_row.owner_instance_id
				AND execution.owner_request_digest=stage_row.owner_request_digest;
			SELECT result.record_digest,result.consumed_input_source_fact_digest
			INTO result_record_digest,result_consumed_digest
			FROM agent_evaluation_capability_effect_provider_journal_results result
			WHERE result.namespace_id=stage_row.namespace_id
				AND result.plan_digest=stage_row.plan_digest
				AND result.repository_commit=stage_row.repository_commit
				AND result.owner_instance_id=stage_row.owner_instance_id
				AND result.owner_request_digest=stage_row.owner_request_digest;
			SELECT abandonment.record_digest INTO abandonment_record_digest
			FROM agent_evaluation_capability_effect_provider_journal_abandonments abandonment
			WHERE abandonment.namespace_id=stage_row.namespace_id
				AND abandonment.plan_digest=stage_row.plan_digest
				AND abandonment.repository_commit=stage_row.repository_commit
				AND abandonment.owner_instance_id=stage_row.owner_instance_id
				AND abandonment.owner_request_digest=stage_row.owner_request_digest;

			IF result_record_digest IS NOT NULL THEN
				IF NEW.status<>'consumed' OR execution_count=0
					OR result_consumed_digest<>NEW.source_handle_digest
					OR NEW.terminal_owner_request_digest<>stage_row.owner_request_digest
					OR NEW.terminal_journal_result_record_digest<>result_record_digest
					OR NEW.terminal_journal_abandonment_record_digest IS NOT NULL
					OR NEW.terminal_at IS DISTINCT FROM (
						SELECT sealed_at FROM agent_evaluation_capability_effect_provider_journal_results
						WHERE namespace_id=stage_row.namespace_id
							AND plan_digest=stage_row.plan_digest
							AND repository_commit=stage_row.repository_commit
							AND owner_instance_id=stage_row.owner_instance_id
							AND owner_request_digest=stage_row.owner_request_digest
					) THEN
					RAISE EXCEPTION 'capability-effect consumed source claim drifted from journal result'
						USING ERRCODE='23514';
				END IF;
			ELSIF abandonment_record_digest IS NOT NULL THEN
				IF NEW.status<>'consumed'
					OR NEW.terminal_owner_request_digest<>stage_row.owner_request_digest
					OR NEW.terminal_journal_result_record_digest IS NOT NULL
					OR NEW.terminal_journal_abandonment_record_digest<>abandonment_record_digest
					OR NEW.terminal_at IS DISTINCT FROM (
						SELECT abandoned_at FROM agent_evaluation_capability_effect_provider_journal_abandonments
						WHERE namespace_id=stage_row.namespace_id
							AND plan_digest=stage_row.plan_digest
							AND repository_commit=stage_row.repository_commit
							AND owner_instance_id=stage_row.owner_instance_id
							AND owner_request_digest=stage_row.owner_request_digest
					) THEN
					RAISE EXCEPTION 'capability-effect source claim drifted from journal abandonment'
						USING ERRCODE='23514';
				END IF;
			ELSIF NEW.status<>'consumed'
				OR NEW.terminal_owner_request_digest<>stage_row.owner_request_digest
				OR NEW.terminal_journal_result_record_digest IS NOT NULL
				OR NEW.terminal_journal_abandonment_record_digest IS NOT NULL
				OR NEW.terminal_at IS DISTINCT FROM stage_row.sealed_at THEN
				RAISE EXCEPTION 'staged capability-effect source claim is not consumed'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_capability_effect_source_claim_terminal_required
			AFTER INSERT OR UPDATE ON agent_evaluation_capability_effect_source_consumption_claims
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_source_claim_terminal_state()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_provider_journal_stage_source_consumed()
			RETURNS trigger AS $$
		BEGIN
			IF NEW.binding_kind<>'hosted-retrieval-query' AND NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_capability_effect_source_consumption_claims claim
				WHERE claim.namespace_id=NEW.namespace_id
					AND claim.plan_digest=NEW.plan_digest
					AND claim.repository_commit=NEW.repository_commit
					AND claim.owner_instance_id=NEW.owner_instance_id
					AND claim.request_ref_authority_receipt_digest=
						NEW.record_json#>>'{preEffectIntent,inputAuthorityBinding,requestRefAuthorityReceiptDigest}'
					AND claim.source_handle_digest=
						NEW.record_json#>>'{preEffectIntent,inputAuthorityBinding,sourceHandleDigest}'
					AND claim.status='consumed'
			) THEN
				RAISE EXCEPTION 'Provider journal stage did not atomically consume its input source'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_stage_source_consumed
			AFTER INSERT ON agent_evaluation_capability_effect_provider_journal_stages
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_stage_source_consumed()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_provider_journal_result_source_claim()
			RETURNS trigger AS $$
		DECLARE
			stage_row agent_evaluation_capability_effect_provider_journal_stages%ROWTYPE;
		BEGIN
			SELECT * INTO stage_row
			FROM agent_evaluation_capability_effect_provider_journal_stages
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest;
			IF stage_row.binding_kind='hosted-retrieval-query' THEN
				IF NEW.consumed_input_source_fact_digest IS NOT NULL THEN
					RAISE EXCEPTION 'hosted Provider journal result consumed an input source'
						USING ERRCODE='23514';
				END IF;
				RETURN NULL;
			END IF;
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_capability_effect_source_consumption_claims claim
				WHERE claim.namespace_id=NEW.namespace_id
					AND claim.plan_digest=NEW.plan_digest
					AND claim.repository_commit=NEW.repository_commit
					AND claim.owner_instance_id=NEW.owner_instance_id
					AND claim.request_ref_authority_receipt_digest=
						stage_row.record_json#>>'{preEffectIntent,inputAuthorityBinding,requestRefAuthorityReceiptDigest}'
					AND claim.source_handle_digest=NEW.consumed_input_source_fact_digest
					AND claim.status='consumed'
					AND claim.terminal_owner_request_digest=NEW.owner_request_digest
					AND claim.terminal_journal_result_record_digest=NEW.record_digest
					AND claim.terminal_journal_abandonment_record_digest IS NULL
					AND claim.terminal_at=NEW.sealed_at
			) THEN
				RAISE EXCEPTION 'Provider journal result lacks its terminal source-consumption claim'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_result_source_claim_required
			AFTER INSERT ON agent_evaluation_capability_effect_provider_journal_results
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_result_source_claim()`,
		`CREATE OR REPLACE FUNCTION require_agent_evaluation_provider_journal_abandonment_source_claim()
			RETURNS trigger AS $$
		DECLARE
			stage_row agent_evaluation_capability_effect_provider_journal_stages%ROWTYPE;
		BEGIN
			SELECT * INTO stage_row
			FROM agent_evaluation_capability_effect_provider_journal_stages
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
				AND owner_instance_id=NEW.owner_instance_id
				AND owner_request_digest=NEW.owner_request_digest;
			IF stage_row.binding_kind='hosted-retrieval-query' THEN
				RETURN NULL;
			END IF;
			IF NOT EXISTS (
				SELECT 1
				FROM agent_evaluation_capability_effect_source_consumption_claims claim
				WHERE claim.namespace_id=NEW.namespace_id
					AND claim.plan_digest=NEW.plan_digest
					AND claim.repository_commit=NEW.repository_commit
					AND claim.owner_instance_id=NEW.owner_instance_id
					AND claim.request_ref_authority_receipt_digest=
						stage_row.record_json#>>'{preEffectIntent,inputAuthorityBinding,requestRefAuthorityReceiptDigest}'
					AND claim.source_handle_digest=
						stage_row.record_json#>>'{preEffectIntent,inputAuthorityBinding,sourceHandleDigest}'
					AND claim.status='consumed'
					AND claim.terminal_owner_request_digest=NEW.owner_request_digest
					AND claim.terminal_journal_result_record_digest IS NULL
					AND claim.terminal_journal_abandonment_record_digest=NEW.record_digest
					AND claim.terminal_at=NEW.abandoned_at
			) THEN
				RAISE EXCEPTION 'Provider journal abandonment lacks its consumed source claim'
					USING ERRCODE='23514';
			END IF;
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE CONSTRAINT TRIGGER agent_eval_provider_journal_abandonment_source_claim_required
			AFTER INSERT ON agent_evaluation_capability_effect_provider_journal_abandonments
			DEFERRABLE INITIALLY DEFERRED
			FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_provider_journal_abandonment_source_claim()`,
	}
}
