package database

// agentEvaluationAttemptAuthorityMigration adds durable canonical authority
// facts after the v41 controlled-authority journal was already deployable.
// Keeping these tables in a new migration preserves upgrades from schemas that
// have recorded v41 before the capability/grading authority families existed.
func agentEvaluationAttemptAuthorityMigration() migration {
	result := migration{
		version:   45,
		name:      "g4-agent-evaluation-attempt-authority-facts",
		preflight: preflightAgentEvaluationAttemptAuthority,
		statements: []string{
			`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`,
			`CREATE OR REPLACE FUNCTION agent_evaluation_jsonb_object_key_count(candidate JSONB)
				RETURNS BIGINT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
					SELECT CASE WHEN jsonb_typeof(candidate)='object'
						THEN (SELECT COUNT(*) FROM jsonb_object_keys(candidate))
						ELSE -1 END
				$$`,
			`CREATE OR REPLACE FUNCTION agent_evaluation_jsonb_array_value_count(
				candidate JSONB,
				expected JSONB
			) RETURNS BIGINT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
				SELECT CASE WHEN jsonb_typeof(candidate)='array'
					THEN (SELECT COUNT(*) FROM jsonb_array_elements(candidate) element WHERE element=expected)
					ELSE -1 END
			$$`,
			`ALTER TABLE agent_evaluation_controlled_authority_requests
				ADD COLUMN IF NOT EXISTS v45_eligible BOOLEAN,
				ADD COLUMN IF NOT EXISTS stage_digest TEXT,
				ADD COLUMN IF NOT EXISTS dispatch_ack_digest TEXT,
				ADD COLUMN IF NOT EXISTS provider_capability_observation_receipt_set_digest TEXT,
				ADD COLUMN IF NOT EXISTS pre_effect_intent_digest TEXT,
				ADD COLUMN IF NOT EXISTS pre_effect_intent_json JSONB,
				ADD COLUMN IF NOT EXISTS pre_effect_intent_bytes BYTEA`,
			`DROP TRIGGER IF EXISTS agent_evaluation_controlled_authority_transition
				ON agent_evaluation_controlled_authority_requests`,
			`CREATE OR REPLACE FUNCTION agent_evaluation_owner_stateful_operation(
				candidate_service_kind TEXT,
				candidate_operation TEXT,
				candidate_route_binding TEXT
			) RETURNS BOOLEAN
			LANGUAGE sql IMMUTABLE PARALLEL SAFE
			AS $$
				SELECT CASE candidate_service_kind
					WHEN 'controlled-workspace' THEN (candidate_operation, candidate_route_binding) IN (
						('session.load-or-reattach', 'sessions/load-or-reattach'),
						('session.preflight', 'sessions/{sessionId}/preflight'),
						('session.restore-checkpoint', 'sessions/{sessionId}/restore-checkpoint'),
						('session.execute', 'sessions/{sessionId}/execute'),
						('session.reconcile-dispatched', 'sessions/{sessionId}/reconcile-dispatched'),
						('session.artifact.resolve', 'sessions/{sessionId}/artifacts/resolve'),
						('session.assess-final', 'sessions/{sessionId}/assess-final'),
						('session.destroy', 'sessions/{sessionId}/destroy')
					)
					WHEN 'verification-evidence' THEN (candidate_operation, candidate_route_binding) IN (
						('promotion.create', 'promotions'),
						('artifact.upload', 'promotions/{promotionId}/artifacts/{artifactId}'),
						('promotion.finalize', 'promotions/{promotionId}/finalize')
					)
					ELSE FALSE
				END
			$$`,
			`CREATE OR REPLACE FUNCTION agent_evaluation_owner_state_contains_forbidden_material(
				candidate JSONB
			) RETURNS BOOLEAN
			LANGUAGE plpgsql IMMUTABLE
			AS $$
			DECLARE
				member RECORD;
				element JSONB;
			BEGIN
				IF candidate IS NULL THEN
					RETURN FALSE;
				END IF;
				IF jsonb_typeof(candidate)='object' THEN
					FOR member IN SELECT key, value FROM jsonb_each(candidate) LOOP
						IF member.key IN ('uploadCapability', 'attestationNonce')
							OR agent_evaluation_owner_state_contains_forbidden_material(member.value) THEN
							RETURN TRUE;
						END IF;
					END LOOP;
				ELSIF jsonb_typeof(candidate)='array' THEN
					FOR element IN SELECT value FROM jsonb_array_elements(candidate) LOOP
						IF agent_evaluation_owner_state_contains_forbidden_material(element) THEN
							RETURN TRUE;
						END IF;
					END LOOP;
				END IF;
				RETURN FALSE;
			END;
			$$`,
			`CREATE OR REPLACE FUNCTION agent_evaluation_owner_state_checkpoint_valid(
				candidate JSONB,
				candidate_attempt_id TEXT,
				candidate_grant_digest TEXT,
				candidate_generation BIGINT
			) RETURNS BOOLEAN
			LANGUAGE sql IMMUTABLE PARALLEL SAFE
			AS $$
				SELECT COALESCE(
					jsonb_typeof(candidate)='object'
					AND (SELECT COUNT(*) FROM jsonb_object_keys(candidate)) BETWEEN 7 AND 8
					AND candidate ?& ARRAY[
						'checkpointRef','attemptId','grantDigest','generation','snapshotDigest',
						'securePersistenceReceiptDigest','checkpointDigest'
					]
					AND NOT EXISTS (
						SELECT 1 FROM jsonb_object_keys(candidate) AS members(key)
						WHERE key<>ALL(ARRAY[
							'checkpointRef','attemptId','grantDigest','generation','snapshotDigest',
							'securePersistenceReceiptDigest','checkpointDigest',
							'predecessorCheckpointDigest'
						])
					)
					AND candidate->>'checkpointRef' ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND candidate->>'attemptId'=candidate_attempt_id
					AND candidate->>'grantDigest'=candidate_grant_digest
					AND (candidate->>'generation')::bigint=candidate_generation
					AND candidate->>'snapshotDigest' ~ '^sha256-[a-f0-9]{64}$'
					AND candidate->>'securePersistenceReceiptDigest' ~ '^sha256-[a-f0-9]{64}$'
					AND candidate->>'checkpointDigest' ~ '^sha256-[a-f0-9]{64}$'
					AND (NOT (candidate ? 'predecessorCheckpointDigest')
						OR candidate->>'predecessorCheckpointDigest' ~ '^sha256-[a-f0-9]{64}$'),
					FALSE
				)
			$$`,
			`UPDATE agent_evaluation_controlled_authority_requests
				SET v45_eligible = NOT (
					(service_kind IN ('provider-capability', 'attempt-grading')
						AND state IN ('dispatched', 'sealed'))
					OR agent_evaluation_owner_stateful_operation(
						service_kind, operation, route_binding
					)
					OR (service_kind='controlled-workspace'
						AND operation='verification.cell.admit'
						AND route_binding='g3-cell-admission'
						AND (state IN ('dispatched', 'sealed')
							OR owner_implementation_digest IS NULL
							OR attempt_id IS NULL OR descriptor_digest IS NULL
							OR generation IS NULL OR generation < 1
							OR grant_digest IS NOT NULL))
				)
				WHERE v45_eligible IS NULL`,
			`ALTER TABLE agent_evaluation_controlled_authority_requests
				ALTER COLUMN v45_eligible SET DEFAULT TRUE,
				ALTER COLUMN v45_eligible SET NOT NULL`,
			`ALTER TABLE agent_evaluation_controlled_authority_requests
				ADD CONSTRAINT agent_evaluation_controlled_authority_v45_pre_effect_check CHECK (COALESCE((
					(pre_effect_intent_digest IS NULL AND pre_effect_intent_json IS NULL
						AND pre_effect_intent_bytes IS NULL)
					OR (v45_eligible AND service_kind='provider-capability'
						AND operation='tool.execute'
						AND route_binding='capability-runtime/execute-tool'
						AND pre_effect_intent_digest ~ '^sha256-[a-f0-9]{64}$'
						AND octet_length(pre_effect_intent_bytes) BETWEEN 1 AND 16384
						AND jsonb_typeof(pre_effect_intent_json)='object'
						AND pre_effect_intent_json=
							convert_from(pre_effect_intent_bytes,'UTF8')::jsonb
						AND pre_effect_intent_json->>'intentDigest'=pre_effect_intent_digest)
				), FALSE))`,
			`ALTER TABLE agent_evaluation_controlled_authority_requests
				ADD CONSTRAINT agent_evaluation_controlled_authority_v45_stage_check CHECK (
					(NOT v45_eligible
						AND ((service_kind IN ('provider-capability', 'attempt-grading')
							AND state IN ('dispatched', 'sealed'))
							OR agent_evaluation_owner_stateful_operation(
								service_kind, operation, route_binding
							)
							OR (service_kind='controlled-workspace'
								AND operation='verification.cell.admit'
								AND route_binding='g3-cell-admission'
								AND state IN ('claimed', 'dispatched', 'sealed')))
						AND stage_digest IS NULL AND dispatch_ack_digest IS NULL
						AND provider_capability_observation_receipt_set_digest IS NULL)
					OR (v45_eligible AND service_kind IN ('provider-capability', 'attempt-grading') AND (
						(state = 'claimed'
							AND stage_digest IS NULL AND dispatch_ack_digest IS NULL
							AND provider_capability_observation_receipt_set_digest IS NULL)
						OR (state = 'dispatched'
							AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
							AND (dispatch_ack_digest IS NULL
								OR (service_kind='provider-capability'
									AND operation='tool.execute'
									AND route_binding='capability-runtime/execute-tool'
									AND pre_effect_intent_digest IS NOT NULL
									AND response_digest IS NOT NULL
									AND response_bytes IS NOT NULL
									AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$'))
							AND provider_capability_observation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$')
						OR (state = 'sealed'
							AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
							AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$'
							AND provider_capability_observation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$')
					))
					OR (v45_eligible AND service_kind='controlled-workspace'
						AND operation='verification.cell.admit'
						AND route_binding='g3-cell-admission'
						AND provider_capability_observation_receipt_set_digest IS NULL
						AND (
							(state='claimed' AND stage_digest IS NULL AND dispatch_ack_digest IS NULL)
							OR (state='dispatched'
								AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
								AND (dispatch_ack_digest IS NULL
									OR dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$'))
							OR (state='sealed'
								AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
								AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
						))
					OR (v45_eligible
						AND agent_evaluation_owner_stateful_operation(
							service_kind, operation, route_binding
						)
						AND provider_capability_observation_receipt_set_digest IS NULL
						AND (
							(state='claimed' AND stage_digest IS NULL AND dispatch_ack_digest IS NULL)
							OR (state='dispatched'
								AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
								AND (dispatch_ack_digest IS NULL
									OR dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$'))
							OR (state='sealed'
								AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
								AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
						))
					OR (v45_eligible AND service_kind NOT IN ('provider-capability', 'attempt-grading')
						AND NOT (service_kind='controlled-workspace'
							AND operation='verification.cell.admit'
							AND route_binding='g3-cell-admission')
						AND NOT agent_evaluation_owner_stateful_operation(
							service_kind, operation, route_binding
						)
						AND stage_digest IS NULL AND dispatch_ack_digest IS NULL
						AND provider_capability_observation_receipt_set_digest IS NULL)
				)`,
			`ALTER TABLE agent_evaluation_controlled_authority_requests
				DROP CONSTRAINT agent_evaluation_controlled_authority_response_check`,
			`ALTER TABLE agent_evaluation_controlled_authority_requests
				ADD CONSTRAINT agent_evaluation_controlled_authority_v45_response_check CHECK (
					(state='claimed' AND response_digest IS NULL AND response_bytes IS NULL
						AND dispatched_at IS NULL AND sealed_at IS NULL)
					OR (state='dispatched' AND dispatched_at IS NOT NULL AND sealed_at IS NULL AND (
						(v45_eligible AND service_kind='controlled-workspace'
							AND operation='verification.cell.admit'
							AND route_binding='g3-cell-admission'
							AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
							AND (
								(response_digest IS NULL AND response_bytes IS NULL
									AND dispatch_ack_digest IS NULL)
								OR (response_digest ~ '^sha256-[a-f0-9]{64}$'
									AND octet_length(response_bytes) BETWEEN 1 AND 1048576
									AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
							))
						OR (v45_eligible AND service_kind='provider-capability'
							AND operation='tool.execute'
							AND route_binding='capability-runtime/execute-tool'
							AND pre_effect_intent_digest IS NOT NULL
							AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
							AND provider_capability_observation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
							AND (
								(response_digest IS NULL AND response_bytes IS NULL
									AND dispatch_ack_digest IS NULL)
								OR (response_digest ~ '^sha256-[a-f0-9]{64}$'
									AND octet_length(response_bytes) BETWEEN 1 AND 33554432
									AND jsonb_typeof(convert_from(response_bytes,'UTF8')::jsonb)='object'
									AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
							))
						OR ((NOT v45_eligible OR NOT (service_kind='controlled-workspace'
							AND operation='verification.cell.admit'
							AND route_binding='g3-cell-admission')
							AND NOT (service_kind='provider-capability'
								AND operation='tool.execute'
								AND route_binding='capability-runtime/execute-tool'
								AND pre_effect_intent_digest IS NOT NULL))
							AND response_digest IS NULL AND response_bytes IS NULL)
					))
					OR (state='sealed' AND response_digest IS NOT NULL
						AND dispatched_at IS NOT NULL AND sealed_at IS NOT NULL
						AND (response_bytes IS NULL OR octet_length(response_bytes) BETWEEN 1 AND 33554432)
						AND (NOT (v45_eligible AND service_kind='controlled-workspace'
							AND operation='verification.cell.admit'
							AND route_binding='g3-cell-admission')
							OR (octet_length(response_bytes) BETWEEN 1 AND 1048576
								AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
								AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$'))
						AND (NOT (v45_eligible AND service_kind='provider-capability'
							AND operation='tool.execute'
							AND route_binding='capability-runtime/execute-tool'
							AND pre_effect_intent_digest IS NOT NULL)
							OR (octet_length(response_bytes) BETWEEN 1 AND 33554432
								AND jsonb_typeof(convert_from(response_bytes,'UTF8')::jsonb)='object'
								AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')))
				)`,
			`ALTER TABLE agent_evaluation_controlled_authority_requests
				ADD CONSTRAINT agent_eval_controlled_authority_v45_g3_cell_admission_check CHECK (
					NOT v45_eligible
					OR NOT (service_kind='controlled-workspace'
						AND operation='verification.cell.admit'
						AND route_binding='g3-cell-admission')
					OR (owner_implementation_digest IS NOT NULL
						AND owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
						AND attempt_id IS NOT NULL
						AND descriptor_digest IS NOT NULL
						AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
						AND generation IS NOT NULL
						AND generation BETWEEN 1 AND 9007199254740991
						AND grant_digest IS NULL
						AND shard_lease_owner_id IS NULL AND shard_lease_generation IS NULL
						AND verification_grant_generation IS NULL
						AND verification_grant_receipt_set_digest IS NULL)
				)`,
			`ALTER TABLE agent_evaluation_controlled_authority_requests
				ADD CONSTRAINT agent_eval_controlled_authority_v45_owner_state_check CHECK (
					NOT v45_eligible
					OR NOT agent_evaluation_owner_stateful_operation(
						service_kind, operation, route_binding
					)
					OR (owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
						AND attempt_id IS NOT NULL
						AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
						AND grant_digest ~ '^sha256-[a-f0-9]{64}$'
						AND generation BETWEEN 1 AND 9007199254740991
						AND shard_lease_owner_id IS NULL AND shard_lease_generation IS NULL
						AND verification_grant_generation IS NULL
						AND verification_grant_receipt_set_digest IS NULL
						AND provider_capability_observation_receipt_set_digest IS NULL
						AND pre_effect_intent_digest IS NULL
						AND pre_effect_intent_json IS NULL
						AND pre_effect_intent_bytes IS NULL
						AND CASE
							WHEN service_kind='verification-evidence' AND response_bytes IS NOT NULL THEN
								NOT agent_evaluation_owner_state_contains_forbidden_material(
									convert_from(response_bytes,'UTF8')::jsonb
								)
							ELSE TRUE
						END)
				)`,
			`DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint
					WHERE conname = 'agent_evaluation_attempts_v45_exact_identity_key'
						AND conrelid = 'agent_evaluation_attempts'::regclass) THEN
					ALTER TABLE agent_evaluation_attempts
						ADD CONSTRAINT agent_evaluation_attempts_v45_exact_identity_key
						UNIQUE (namespace_id, plan_digest, attempt_id, attempt_digest);
				END IF;
			END $$`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_controlled_authority_transition()
				RETURNS trigger AS $$
			DECLARE
				g3_cell_admission BOOLEAN;
				owner_stateful BOOLEAN;
				shared_effect_result BOOLEAN;
			BEGIN
				IF NEW.pre_effect_intent_digest IS NOT NULL AND (
					jsonb_typeof(NEW.pre_effect_intent_json) <> 'object'
					OR (SELECT COUNT(*) FROM jsonb_object_keys(
						NEW.pre_effect_intent_json
					)) <> 21
					OR NOT (NEW.pre_effect_intent_json ?& ARRAY[
						'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
						'descriptorDigest','caseId','materialDigest','turnIndex','invocationId',
						'toolId','toolCallId','providerToolCallId','providerRequestDigest',
						'argumentsDigest','runtimeFactSourceAuthority','registrationReceiptDigest',
						'ownerRequestId','ownerRequestDigest','intentDigest'
					])
					OR NEW.pre_effect_intent_json->>'format' <>
						'prodivix.agent-evaluation-capability-pre-effect-intent'
					OR (NEW.pre_effect_intent_json->>'version')::bigint <> 1
					OR NEW.pre_effect_intent_json->>'namespaceId' <> NEW.namespace_id
					OR NEW.pre_effect_intent_json->>'planDigest' <> NEW.plan_digest
					OR NEW.pre_effect_intent_json->>'repositoryCommit' <> NEW.repository_commit
					OR NEW.pre_effect_intent_json->>'attemptId' <> NEW.attempt_id
					OR NEW.pre_effect_intent_json->>'descriptorDigest' <> NEW.descriptor_digest
					OR NEW.pre_effect_intent_json->>'ownerRequestDigest'
						!~ '^sha256-[a-f0-9]{64}$'
					OR NEW.pre_effect_intent_json->>'ownerRequestId' <>
						'capability-effect-owner-request.' ||
						substring(NEW.pre_effect_intent_json->>'ownerRequestDigest' FROM 8)
				) THEN
					RAISE EXCEPTION 'shared-effect controlled authority preimage is invalid'
						USING ERRCODE = '23514';
				END IF;
				IF TG_OP = 'INSERT' THEN
					IF NEW.v45_eligible IS DISTINCT FROM TRUE THEN
						RAISE EXCEPTION 'new controlled authority rows must use v45 authority'
							USING ERRCODE = '23514';
					END IF;
					RETURN NEW;
				END IF;
				IF TG_OP = 'DELETE' THEN
					RAISE EXCEPTION 'agent evaluation controlled authority rows are append-only';
				END IF;
				g3_cell_admission := NEW.service_kind='controlled-workspace'
					AND NEW.operation='verification.cell.admit'
					AND NEW.route_binding='g3-cell-admission';
				owner_stateful := agent_evaluation_owner_stateful_operation(
					NEW.service_kind, NEW.operation, NEW.route_binding
				);
				shared_effect_result := NEW.service_kind='provider-capability'
					AND NEW.operation='tool.execute'
					AND NEW.route_binding='capability-runtime/execute-tool'
					AND NEW.pre_effect_intent_digest IS NOT NULL;
				IF OLD.namespace_id IS DISTINCT FROM NEW.namespace_id
					OR OLD.plan_digest IS DISTINCT FROM NEW.plan_digest
					OR OLD.repository_commit IS DISTINCT FROM NEW.repository_commit
					OR OLD.service_kind IS DISTINCT FROM NEW.service_kind
					OR OLD.operation IS DISTINCT FROM NEW.operation
					OR OLD.route_binding IS DISTINCT FROM NEW.route_binding
					OR OLD.request_digest IS DISTINCT FROM NEW.request_digest
					OR OLD.request_binding_digest IS DISTINCT FROM NEW.request_binding_digest
					OR OLD.owner_implementation_digest IS DISTINCT FROM NEW.owner_implementation_digest
					OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
					OR OLD.descriptor_digest IS DISTINCT FROM NEW.descriptor_digest
					OR OLD.grant_digest IS DISTINCT FROM NEW.grant_digest
					OR OLD.generation IS DISTINCT FROM NEW.generation
					OR OLD.shard_lease_owner_id IS DISTINCT FROM NEW.shard_lease_owner_id
					OR OLD.shard_lease_generation IS DISTINCT FROM NEW.shard_lease_generation
					OR OLD.verification_grant_generation IS DISTINCT FROM NEW.verification_grant_generation
					OR OLD.verification_grant_receipt_set_digest IS DISTINCT FROM NEW.verification_grant_receipt_set_digest
					OR OLD.pre_effect_intent_digest IS DISTINCT FROM NEW.pre_effect_intent_digest
					OR OLD.pre_effect_intent_json IS DISTINCT FROM NEW.pre_effect_intent_json
					OR OLD.pre_effect_intent_bytes IS DISTINCT FROM NEW.pre_effect_intent_bytes
					OR OLD.v45_eligible IS DISTINCT FROM NEW.v45_eligible
					OR OLD.claim_generation IS DISTINCT FROM NEW.claim_generation
					OR OLD.claimed_at IS DISTINCT FROM NEW.claimed_at THEN
					RAISE EXCEPTION 'agent evaluation controlled authority binding is immutable';
				END IF;
				IF NOT OLD.v45_eligible THEN
					RAISE EXCEPTION 'legacy controlled authority requires a new v45 attempt'
						USING ERRCODE = '23514';
				END IF;
				IF OLD.state = 'claimed' AND NEW.state = 'dispatched' THEN
					IF NEW.dispatched_at IS NULL OR NEW.response_digest IS NOT NULL
						OR NEW.response_bytes IS NOT NULL OR NEW.sealed_at IS NOT NULL
						OR NEW.dispatch_ack_digest IS NOT NULL THEN
						RAISE EXCEPTION 'agent evaluation controlled authority dispatch transition is invalid';
					END IF;
					IF NEW.service_kind IN ('provider-capability', 'attempt-grading') THEN
						IF NEW.stage_digest IS NULL
							OR NEW.provider_capability_observation_receipt_set_digest IS NULL THEN
							RAISE EXCEPTION 'agent evaluation attempt authority stage fence is missing';
						END IF;
					ELSIF g3_cell_admission THEN
						IF NEW.stage_digest IS NULL
							OR NEW.provider_capability_observation_receipt_set_digest IS NOT NULL THEN
							RAISE EXCEPTION 'G3 cell admission stage fence is missing or drifted';
						END IF;
					ELSIF owner_stateful THEN
						IF NEW.stage_digest IS NULL
							OR NEW.provider_capability_observation_receipt_set_digest IS NOT NULL THEN
							RAISE EXCEPTION 'owner-state dispatch stage fence is missing or drifted'
								USING ERRCODE = '23514';
						END IF;
					ELSIF NEW.stage_digest IS NOT NULL
						OR NEW.provider_capability_observation_receipt_set_digest IS NOT NULL THEN
						RAISE EXCEPTION 'non-attempt authority cannot carry a stage fence';
					END IF;
					RETURN NEW;
				END IF;
				IF OLD.state='dispatched' AND NEW.state='dispatched' THEN
					IF shared_effect_result THEN
						IF OLD.dispatched_at IS DISTINCT FROM NEW.dispatched_at
							OR OLD.stage_digest IS NULL
							OR OLD.stage_digest IS DISTINCT FROM NEW.stage_digest
							OR OLD.provider_capability_observation_receipt_set_digest IS DISTINCT FROM
								NEW.provider_capability_observation_receipt_set_digest
							OR OLD.sealed_at IS NOT NULL OR NEW.sealed_at IS NOT NULL
							OR NOT (
								(OLD.response_digest IS NULL AND OLD.response_bytes IS NULL
									AND OLD.dispatch_ack_digest IS NULL
									AND NEW.response_digest IS NOT NULL AND NEW.response_bytes IS NOT NULL
									AND NEW.dispatch_ack_digest IS NOT NULL)
								OR (OLD.response_digest IS NOT NULL AND OLD.response_bytes IS NOT NULL
									AND OLD.dispatch_ack_digest IS NOT NULL
									AND OLD.response_digest IS NOT DISTINCT FROM NEW.response_digest
									AND OLD.response_bytes IS NOT DISTINCT FROM NEW.response_bytes
									AND OLD.dispatch_ack_digest IS NOT DISTINCT FROM NEW.dispatch_ack_digest)
							) THEN
							RAISE EXCEPTION 'shared-effect result ingress conflicts with durable state'
								USING ERRCODE = '23514';
						END IF;
						RETURN NEW;
					END IF;
					IF owner_stateful THEN
						IF OLD.dispatched_at IS DISTINCT FROM NEW.dispatched_at
							OR OLD.stage_digest IS NULL
							OR OLD.stage_digest IS DISTINCT FROM NEW.stage_digest
							OR OLD.provider_capability_observation_receipt_set_digest IS DISTINCT FROM
								NEW.provider_capability_observation_receipt_set_digest
							OR OLD.response_digest IS NOT NULL OR OLD.response_bytes IS NOT NULL
							OR NEW.response_digest IS NOT NULL OR NEW.response_bytes IS NOT NULL
							OR OLD.dispatch_ack_digest IS NOT NULL OR NEW.dispatch_ack_digest IS NULL
							OR OLD.sealed_at IS NOT NULL OR NEW.sealed_at IS NOT NULL THEN
							RAISE EXCEPTION 'owner-state result acknowledgement transition is invalid'
								USING ERRCODE = '23514';
						END IF;
						RETURN NEW;
					END IF;
					IF NOT g3_cell_admission
						OR OLD.dispatched_at IS DISTINCT FROM NEW.dispatched_at
						OR OLD.stage_digest IS NULL
						OR OLD.stage_digest IS DISTINCT FROM NEW.stage_digest
						OR OLD.provider_capability_observation_receipt_set_digest IS DISTINCT FROM
							NEW.provider_capability_observation_receipt_set_digest
						OR OLD.response_digest IS NOT NULL OR OLD.response_bytes IS NOT NULL
						OR OLD.dispatch_ack_digest IS NOT NULL OR OLD.sealed_at IS NOT NULL
						OR NEW.response_digest IS NULL OR NEW.response_bytes IS NULL
						OR NEW.dispatch_ack_digest IS NULL OR NEW.sealed_at IS NOT NULL THEN
						RAISE EXCEPTION 'G3 cell admission acknowledgement transition is invalid'
							USING ERRCODE = '23514';
					END IF;
					RETURN NEW;
				END IF;
				IF OLD.state <> 'dispatched' OR NEW.state <> 'sealed'
					OR OLD.dispatched_at IS DISTINCT FROM NEW.dispatched_at
					OR NEW.response_digest IS NULL OR NEW.sealed_at IS NULL
					OR OLD.stage_digest IS DISTINCT FROM NEW.stage_digest
					OR OLD.provider_capability_observation_receipt_set_digest IS DISTINCT FROM
						NEW.provider_capability_observation_receipt_set_digest THEN
					RAISE EXCEPTION 'agent evaluation controlled authority transition is invalid';
				END IF;
				IF shared_effect_result THEN
					IF OLD.response_digest IS NULL OR OLD.response_bytes IS NULL
						OR OLD.dispatch_ack_digest IS NULL
						OR OLD.response_digest IS DISTINCT FROM NEW.response_digest
						OR OLD.response_bytes IS DISTINCT FROM NEW.response_bytes
						OR OLD.dispatch_ack_digest IS DISTINCT FROM NEW.dispatch_ack_digest THEN
						RAISE EXCEPTION 'shared-effect seal drifted from its durable result ingress'
							USING ERRCODE = '23514';
					END IF;
				ELSIF NEW.service_kind IN ('provider-capability', 'attempt-grading') THEN
					IF NEW.dispatch_ack_digest IS NULL THEN
						RAISE EXCEPTION 'agent evaluation attempt authority dispatch acknowledgement is missing';
					END IF;
				ELSIF g3_cell_admission THEN
					IF OLD.response_digest IS NULL OR OLD.response_bytes IS NULL
						OR OLD.dispatch_ack_digest IS NULL
						OR OLD.response_digest IS DISTINCT FROM NEW.response_digest
						OR OLD.response_bytes IS DISTINCT FROM NEW.response_bytes
						OR OLD.dispatch_ack_digest IS DISTINCT FROM NEW.dispatch_ack_digest THEN
						RAISE EXCEPTION 'G3 cell admission seal drifted from its acknowledged response'
							USING ERRCODE = '23514';
					END IF;
				ELSIF owner_stateful THEN
					IF OLD.dispatch_ack_digest IS NULL
						OR OLD.dispatch_ack_digest IS DISTINCT FROM NEW.dispatch_ack_digest THEN
						RAISE EXCEPTION 'owner-state seal drifted from its durable result acknowledgement'
							USING ERRCODE = '23514';
					END IF;
				ELSIF NEW.dispatch_ack_digest IS NOT NULL THEN
					RAISE EXCEPTION 'non-attempt authority cannot carry a dispatch acknowledgement';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_controlled_authority_transition
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_controlled_authority_requests
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_controlled_authority_transition()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_owner_state_operations (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
				service_kind TEXT NOT NULL,
				operation TEXT NOT NULL,
				route_binding TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				owner_implementation_digest TEXT NOT NULL,
				owner_state_id TEXT NOT NULL,
				prior_owner_state_revision BIGINT NOT NULL,
				prior_owner_state_root_digest TEXT,
				stage_digest TEXT NOT NULL,
				state TEXT NOT NULL,
				response_digest TEXT,
				public_result_json JSONB,
				public_result_bytes BYTEA,
				owner_state_revision BIGINT,
				owner_state_root_digest TEXT,
				dispatch_ack_digest TEXT,
				result_receipt_digest TEXT,
				sealed_operation_json JSONB,
				sealed_operation_bytes BYTEA,
				staged_at TIMESTAMPTZ NOT NULL,
				sealed_at TIMESTAMPTZ,
				PRIMARY KEY (
					namespace_id, plan_digest, repository_commit, service_kind, request_digest
				),
				UNIQUE (
					namespace_id, plan_digest, repository_commit, service_kind,
					request_digest, owner_implementation_digest, stage_digest, owner_state_id
				),
				UNIQUE (namespace_id, plan_digest, repository_commit, service_kind, stage_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, service_kind, dispatch_ack_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, service_kind, result_receipt_digest),
				UNIQUE (
					namespace_id, plan_digest, repository_commit, service_kind,
					owner_state_id, owner_state_revision
				),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, service_kind, request_digest
				) REFERENCES agent_evaluation_controlled_authority_requests(
					namespace_id, plan_digest, repository_commit, service_kind, request_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_owner_state_operation_current_check CHECK (v45_eligible),
				CONSTRAINT agent_evaluation_owner_state_operation_route_check CHECK (
					agent_evaluation_owner_stateful_operation(service_kind, operation, route_binding)
				),
				CONSTRAINT agent_evaluation_owner_state_operation_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND owner_state_id ~ '^sha256-[a-f0-9]{64}$'
					AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND prior_owner_state_revision BETWEEN 0 AND 9007199254740991
					AND ((prior_owner_state_revision=0 AND prior_owner_state_root_digest IS NULL)
						OR (prior_owner_state_revision>0
							AND prior_owner_state_root_digest ~ '^sha256-[a-f0-9]{64}$'))
				),
				CONSTRAINT agent_evaluation_owner_state_operation_lifecycle_check CHECK (
					(state='staged'
						AND response_digest IS NULL AND public_result_json IS NULL
						AND public_result_bytes IS NULL AND owner_state_revision IS NULL
						AND owner_state_root_digest IS NULL AND dispatch_ack_digest IS NULL
						AND result_receipt_digest IS NULL AND sealed_operation_json IS NULL
						AND sealed_operation_bytes IS NULL AND sealed_at IS NULL)
					OR (state='sealed'
						AND response_digest ~ '^sha256-[a-f0-9]{64}$'
						AND owner_state_revision=prior_owner_state_revision+1
						AND owner_state_root_digest ~ '^sha256-[a-f0-9]{64}$'
						AND dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$'
						AND result_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
						AND public_result_json IS NOT NULL AND public_result_bytes IS NOT NULL
						AND sealed_operation_json IS NOT NULL AND sealed_operation_bytes IS NOT NULL
						AND sealed_at IS NOT NULL AND sealed_at>=staged_at
						AND public_result_json=convert_from(public_result_bytes,'UTF8')::jsonb
						AND sealed_operation_json=convert_from(sealed_operation_bytes,'UTF8')::jsonb
						AND public_result_json=sealed_operation_json->'publicResult'
						AND octet_length(public_result_bytes) BETWEEN 1 AND
							CASE service_kind WHEN 'controlled-workspace' THEN 25165824 ELSE 7864320 END
						AND octet_length(sealed_operation_bytes) BETWEEN 1 AND 33619968)
				),
				CONSTRAINT agent_evaluation_owner_state_operation_safe_result_check CHECK (
					service_kind<>'verification-evidence'
					OR (NOT agent_evaluation_owner_state_contains_forbidden_material(public_result_json)
						AND NOT agent_evaluation_owner_state_contains_forbidden_material(sealed_operation_json))
				)
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_owner_states (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
				service_kind TEXT NOT NULL,
				owner_state_id TEXT NOT NULL,
				revision BIGINT NOT NULL,
				root_digest TEXT NOT NULL,
				snapshot_kind TEXT NOT NULL,
				snapshot_digest TEXT NOT NULL,
				bundle_json JSONB NOT NULL,
				bundle_bytes BYTEA NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (
					namespace_id, plan_digest, repository_commit, service_kind, owner_state_id
				),
				UNIQUE (namespace_id, plan_digest, repository_commit, service_kind, root_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_owner_state_current_check CHECK (v45_eligible),
				CONSTRAINT agent_evaluation_owner_state_identity_check CHECK (
					service_kind IN ('controlled-workspace', 'verification-evidence')
					AND snapshot_kind=service_kind
					AND repository_commit ~ '^[a-f0-9]{40}$'
					AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND owner_state_id ~ '^sha256-[a-f0-9]{64}$'
					AND root_digest ~ '^sha256-[a-f0-9]{64}$'
					AND snapshot_digest ~ '^sha256-[a-f0-9]{64}$'
					AND revision BETWEEN 1 AND 9007199254740991
				),
				CONSTRAINT agent_evaluation_owner_state_bundle_check CHECK (
					jsonb_typeof(bundle_json)='object'
					AND bundle_json=convert_from(bundle_bytes,'UTF8')::jsonb
					AND octet_length(bundle_bytes) BETWEEN 1 AND
						CASE service_kind WHEN 'controlled-workspace' THEN 25165824 ELSE 7864320 END
					AND bundle_json->>'format'='prodivix.agent-evaluation-owner-state-bundle'
					AND (bundle_json->>'version')::bigint=1
					AND bundle_json->>'serviceKind'=service_kind
					AND bundle_json->>'namespaceId'=namespace_id
					AND bundle_json->>'planDigest'=plan_digest
					AND bundle_json->>'repositoryCommit'=repository_commit
					AND bundle_json->>'ownerStateId'=owner_state_id
					AND (bundle_json->>'revision')::bigint=revision
					AND bundle_json->>'snapshotKind'=snapshot_kind
					AND bundle_json->>'snapshotDigest'=snapshot_digest
					AND jsonb_typeof(bundle_json->'snapshot')='object'
					AND CASE service_kind
						WHEN 'controlled-workspace' THEN
							bundle_json#>>'{snapshot,state}' IN ('active','destroyed')
							AND (
								(bundle_json#>>'{snapshot,state}'='destroyed'
									AND bundle_json#>'{snapshot,initialCheckpoint}'='null'::jsonb
									AND bundle_json#>'{snapshot,initialCheckpointDigest}'='null'::jsonb
									AND bundle_json#>'{snapshot,currentCheckpoint}'='null'::jsonb
									AND bundle_json#>'{snapshot,currentCheckpointDigest}'='null'::jsonb)
								OR (agent_evaluation_owner_state_checkpoint_valid(
									bundle_json#>'{snapshot,initialCheckpoint}',
									bundle_json#>>'{snapshot,attemptId}',
									bundle_json#>>'{snapshot,grantDigest}',
									(bundle_json#>>'{snapshot,generation}')::bigint
								)
								AND agent_evaluation_owner_state_checkpoint_valid(
									bundle_json#>'{snapshot,currentCheckpoint}',
									bundle_json#>>'{snapshot,attemptId}',
									bundle_json#>>'{snapshot,grantDigest}',
									(bundle_json#>>'{snapshot,generation}')::bigint
								)
								AND bundle_json#>>'{snapshot,initialCheckpointDigest}'=
									bundle_json#>>'{snapshot,initialCheckpoint,checkpointDigest}'
								AND bundle_json#>>'{snapshot,currentCheckpointDigest}'=
									bundle_json#>>'{snapshot,currentCheckpoint,checkpointDigest}')
							)
						WHEN 'verification-evidence' THEN
							bundle_json#>>'{snapshot,state}' IN (
								'registered','active','prepared','finalized','destroyed'
							)
						ELSE FALSE
					END
					AND jsonb_typeof(bundle_json->'casArtifacts')='array'
					AND jsonb_array_length(bundle_json->'casArtifacts')<=128
					AND jsonb_typeof(bundle_json->'recentOperations')='array'
					AND jsonb_array_length(bundle_json->'recentOperations') BETWEEN 1 AND 4
				),
				CONSTRAINT agent_evaluation_owner_state_safe_bundle_check CHECK (
					service_kind<>'verification-evidence'
					OR NOT agent_evaluation_owner_state_contains_forbidden_material(bundle_json)
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_owner_states_bounded_list
				ON agent_evaluation_owner_states(
					namespace_id, plan_digest, repository_commit, service_kind,
					owner_state_id COLLATE "C"
				) WHERE v45_eligible`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_owner_state_cas_artifacts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
				service_kind TEXT NOT NULL,
				owner_state_id TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				owner_implementation_digest TEXT NOT NULL,
				stage_digest TEXT NOT NULL,
				artifact_ref TEXT NOT NULL,
				artifact_kind TEXT NOT NULL,
				media_type TEXT NOT NULL,
				artifact_digest TEXT NOT NULL,
				byte_length BIGINT NOT NULL,
				content_bytes BYTEA NOT NULL,
				artifact_identity_digest TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				upload_digest TEXT NOT NULL,
				cas_receipt_digest TEXT NOT NULL,
				uploaded_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (
					namespace_id, plan_digest, repository_commit, service_kind,
					owner_state_id, artifact_ref
				),
				UNIQUE (namespace_id, plan_digest, repository_commit, service_kind, upload_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, service_kind, cas_receipt_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, service_kind, descriptor_digest),
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, service_kind,
					request_digest, owner_implementation_digest, stage_digest, owner_state_id
				) REFERENCES agent_evaluation_owner_state_operations(
					namespace_id, plan_digest, repository_commit, service_kind,
					request_digest, owner_implementation_digest, stage_digest, owner_state_id
				) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_owner_state_cas_current_check CHECK (v45_eligible),
				CONSTRAINT agent_evaluation_owner_state_cas_identity_check CHECK (
					service_kind IN ('controlled-workspace', 'verification-evidence')
					AND repository_commit ~ '^[a-f0-9]{40}$'
					AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND owner_state_id ~ '^sha256-[a-f0-9]{64}$'
					AND artifact_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND artifact_kind ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND media_type=lower(media_type)
					AND media_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
					AND artifact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND artifact_identity_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND upload_digest ~ '^sha256-[a-f0-9]{64}$'
					AND cas_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_owner_state_cas_bytes_check CHECK (
					byte_length=octet_length(content_bytes)
					AND byte_length BETWEEN 1 AND 8388608
				)
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_owner_state_current_transition()
				RETURNS trigger AS $$
			DECLARE
				snapshot JSONB;
			BEGIN
				IF TG_OP='DELETE' THEN
					RAISE EXCEPTION 'evaluation owner state cannot be deleted'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.v45_eligible IS DISTINCT FROM TRUE
					OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.bundle_json))<>16
					OR NOT (NEW.bundle_json ?& ARRAY[
						'format','version','serviceKind','namespaceId','planDigest','repositoryCommit',
						'ownerStateId','revision','previousOwnerStateRootDigest','snapshotKind','snapshot',
						'snapshotDigest','casArtifacts','casArtifactSetDigest','recentOperations',
						'recentOperationSetDigest'
					])
					OR NEW.bundle_json->>'casArtifactSetDigest' !~ '^sha256-[a-f0-9]{64}$'
					OR NEW.bundle_json->>'recentOperationSetDigest' !~ '^sha256-[a-f0-9]{64}$' THEN
					RAISE EXCEPTION 'evaluation owner state bundle shape is invalid'
						USING ERRCODE = '23514';
				END IF;
				snapshot := NEW.bundle_json->'snapshot';
				IF snapshot->>'snapshotDigest'<>NEW.snapshot_digest
					OR (snapshot->>'revision')::bigint<>NEW.revision
					OR snapshot->>'namespaceId'<>NEW.namespace_id
					OR snapshot->>'planDigest'<>NEW.plan_digest
					OR snapshot->>'repositoryCommit'<>NEW.repository_commit
					OR (NEW.service_kind='controlled-workspace'
						AND snapshot->>'format'<>
							'prodivix.agent-evaluation-controlled-workspace-owner-state-snapshot')
					OR (NEW.service_kind='verification-evidence'
						AND snapshot->>'format'<>
							'prodivix.agent-evaluation-verification-evidence-owner-state-snapshot') THEN
					RAISE EXCEPTION 'evaluation owner state snapshot binding is invalid'
						USING ERRCODE = '23514';
				END IF;
				IF TG_OP='INSERT' THEN
					IF NEW.revision=1 THEN
						IF NEW.bundle_json->'previousOwnerStateRootDigest' IS DISTINCT FROM 'null'::jsonb THEN
							RAISE EXCEPTION 'evaluation owner state bootstrap revision is invalid'
								USING ERRCODE = '23514';
						END IF;
					ELSIF NEW.bundle_json->>'previousOwnerStateRootDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR NOT EXISTS (
							SELECT 1 FROM agent_evaluation_owner_states current_state
							WHERE current_state.namespace_id=NEW.namespace_id
								AND current_state.plan_digest=NEW.plan_digest
								AND current_state.repository_commit=NEW.repository_commit
								AND current_state.service_kind=NEW.service_kind
								AND current_state.owner_state_id=NEW.owner_state_id
								AND current_state.revision=NEW.revision-1
								AND current_state.root_digest=
									NEW.bundle_json->>'previousOwnerStateRootDigest'
								AND current_state.v45_eligible
						) THEN
						RAISE EXCEPTION 'evaluation owner state bootstrap revision is invalid'
							USING ERRCODE = '23514';
					END IF;
					RETURN NEW;
				END IF;
				IF OLD.namespace_id IS DISTINCT FROM NEW.namespace_id
					OR OLD.plan_digest IS DISTINCT FROM NEW.plan_digest
					OR OLD.repository_commit IS DISTINCT FROM NEW.repository_commit
					OR OLD.service_kind IS DISTINCT FROM NEW.service_kind
					OR OLD.owner_state_id IS DISTINCT FROM NEW.owner_state_id
					OR OLD.v45_eligible IS DISTINCT FROM NEW.v45_eligible
					OR NEW.revision<>OLD.revision+1
					OR NEW.bundle_json->>'previousOwnerStateRootDigest'<>OLD.root_digest
					OR NEW.updated_at<OLD.updated_at THEN
					RAISE EXCEPTION 'evaluation owner state compare-and-swap is invalid'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_owner_states_current_transition
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_owner_states
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_owner_state_current_transition()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_owner_state_operation_transition()
				RETURNS trigger AS $$
			DECLARE
				journal_state TEXT;
				journal_owner_implementation_digest TEXT;
				journal_stage_digest TEXT;
				journal_dispatched_at TIMESTAMPTZ;
			BEGIN
				IF TG_OP='DELETE' THEN
					RAISE EXCEPTION 'evaluation owner-state operation cannot be deleted'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.v45_eligible IS DISTINCT FROM TRUE
					OR NOT agent_evaluation_owner_stateful_operation(
						NEW.service_kind, NEW.operation, NEW.route_binding
					) THEN
					RAISE EXCEPTION 'evaluation owner-state operation is outside current authority'
						USING ERRCODE = '23514';
				END IF;
				IF TG_OP='INSERT' THEN
					IF NEW.state<>'staged' THEN
						RAISE EXCEPTION 'evaluation owner-state operation must begin staged'
							USING ERRCODE = '23514';
					END IF;
					SELECT state, owner_implementation_digest, stage_digest, dispatched_at
					INTO journal_state, journal_owner_implementation_digest,
						journal_stage_digest, journal_dispatched_at
					FROM agent_evaluation_controlled_authority_requests
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit
						AND service_kind=NEW.service_kind AND request_digest=NEW.request_digest
						AND operation=NEW.operation AND route_binding=NEW.route_binding
						AND v45_eligible
					FOR SHARE;
					IF NOT FOUND OR journal_state<>'claimed'
						OR journal_owner_implementation_digest<>NEW.owner_implementation_digest
						OR journal_stage_digest IS NOT NULL OR journal_dispatched_at IS NOT NULL THEN
						RAISE EXCEPTION 'evaluation owner-state stage lacks an exact claimed journal'
							USING ERRCODE = '23514';
					END IF;
					IF NEW.prior_owner_state_revision=0 THEN
						IF EXISTS (
							SELECT 1 FROM agent_evaluation_owner_states current_state
							WHERE current_state.namespace_id=NEW.namespace_id
								AND current_state.plan_digest=NEW.plan_digest
								AND current_state.repository_commit=NEW.repository_commit
								AND current_state.service_kind=NEW.service_kind
								AND current_state.owner_state_id=NEW.owner_state_id
						) THEN
							RAISE EXCEPTION 'evaluation owner-state bootstrap conflicts with durable current state'
								USING ERRCODE = '23514';
						END IF;
					ELSIF NOT EXISTS (
						SELECT 1 FROM agent_evaluation_owner_states current_state
						WHERE current_state.namespace_id=NEW.namespace_id
							AND current_state.plan_digest=NEW.plan_digest
							AND current_state.repository_commit=NEW.repository_commit
							AND current_state.service_kind=NEW.service_kind
							AND current_state.owner_state_id=NEW.owner_state_id
							AND current_state.revision=NEW.prior_owner_state_revision
							AND current_state.root_digest=NEW.prior_owner_state_root_digest
							AND current_state.v45_eligible
					) THEN
						RAISE EXCEPTION 'evaluation owner-state prior revision/root is stale'
							USING ERRCODE = '23514';
					END IF;
					RETURN NEW;
				END IF;
				IF OLD.namespace_id IS DISTINCT FROM NEW.namespace_id
					OR OLD.plan_digest IS DISTINCT FROM NEW.plan_digest
					OR OLD.repository_commit IS DISTINCT FROM NEW.repository_commit
					OR OLD.v45_eligible IS DISTINCT FROM NEW.v45_eligible
					OR OLD.service_kind IS DISTINCT FROM NEW.service_kind
					OR OLD.operation IS DISTINCT FROM NEW.operation
					OR OLD.route_binding IS DISTINCT FROM NEW.route_binding
					OR OLD.request_digest IS DISTINCT FROM NEW.request_digest
					OR OLD.owner_implementation_digest IS DISTINCT FROM NEW.owner_implementation_digest
					OR OLD.owner_state_id IS DISTINCT FROM NEW.owner_state_id
					OR OLD.prior_owner_state_revision IS DISTINCT FROM NEW.prior_owner_state_revision
					OR OLD.prior_owner_state_root_digest IS DISTINCT FROM NEW.prior_owner_state_root_digest
					OR OLD.stage_digest IS DISTINCT FROM NEW.stage_digest
					OR OLD.staged_at IS DISTINCT FROM NEW.staged_at
					OR OLD.state<>'staged' OR NEW.state<>'sealed' THEN
					RAISE EXCEPTION 'evaluation owner-state operation transition is immutable or invalid'
						USING ERRCODE = '23514';
				END IF;
				IF (SELECT COUNT(*) FROM jsonb_object_keys(NEW.sealed_operation_json))<>17
					OR NOT (NEW.sealed_operation_json ?& ARRAY[
						'format','version','serviceKind','operation','routeBinding','requestDigest',
						'ownerImplementationDigest','ownerStateId','priorOwnerStateRevision',
						'priorOwnerStateRootDigest','stageDigest','publicResult','responseDigest',
						'ownerStateRevision','ownerStateRootDigest','dispatchAckDigest','resultReceiptDigest'
					])
					OR NEW.sealed_operation_json->>'format'<>
						'prodivix.agent-evaluation-sealed-owner-operation'
					OR (NEW.sealed_operation_json->>'version')::bigint<>1
					OR NEW.sealed_operation_json->>'serviceKind'<>NEW.service_kind
					OR NEW.sealed_operation_json->>'operation'<>NEW.operation
					OR NEW.sealed_operation_json->>'routeBinding'<>NEW.route_binding
					OR NEW.sealed_operation_json->>'requestDigest'<>NEW.request_digest
					OR NEW.sealed_operation_json->>'ownerImplementationDigest'<>
						NEW.owner_implementation_digest
					OR NEW.sealed_operation_json->>'ownerStateId'<>NEW.owner_state_id
					OR (NEW.sealed_operation_json->>'priorOwnerStateRevision')::bigint<>
						NEW.prior_owner_state_revision
					OR NEW.sealed_operation_json->>'stageDigest'<>NEW.stage_digest
					OR NEW.sealed_operation_json->>'responseDigest'<>NEW.response_digest
					OR (NEW.sealed_operation_json->>'ownerStateRevision')::bigint<>
						NEW.owner_state_revision
					OR NEW.sealed_operation_json->>'ownerStateRootDigest'<>NEW.owner_state_root_digest
					OR NEW.sealed_operation_json->>'dispatchAckDigest'<>NEW.dispatch_ack_digest
					OR NEW.sealed_operation_json->>'resultReceiptDigest'<>NEW.result_receipt_digest
					OR (NEW.prior_owner_state_revision=0 AND
						NEW.sealed_operation_json->'priorOwnerStateRootDigest' IS DISTINCT FROM 'null'::jsonb)
					OR (NEW.prior_owner_state_revision>0 AND
						NEW.sealed_operation_json->>'priorOwnerStateRootDigest'<>
							NEW.prior_owner_state_root_digest) THEN
					RAISE EXCEPTION 'evaluation sealed owner operation binding is invalid'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.service_kind='controlled-workspace' THEN
					IF jsonb_typeof(NEW.public_result_json)<>'object'
						OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.public_result_json))<>1
						OR NOT (NEW.public_result_json ? 'facts')
						OR jsonb_typeof(NEW.public_result_json->'facts')<>'array' THEN
						RAISE EXCEPTION 'controlled-workspace public result projection is invalid'
							USING ERRCODE = '23514';
					END IF;
				ELSE
					IF jsonb_typeof(NEW.public_result_json)<>'object'
						OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.public_result_json))<>7
						OR NOT (NEW.public_result_json ?& ARRAY[
							'format','version','operation','requestDigest','responseReceiptDigest',
							'responseProjection','responseProjectionDigest'
						])
						OR NEW.public_result_json->>'format'<>
							'prodivix.agent-evaluation-verification-evidence-public-result'
						OR (NEW.public_result_json->>'version')::bigint<>1
						OR NEW.public_result_json->>'operation'<>NEW.operation
						OR NEW.public_result_json->>'requestDigest'<>NEW.request_digest
						OR NEW.public_result_json->>'responseReceiptDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR NEW.public_result_json->>'responseProjectionDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR agent_evaluation_owner_state_contains_forbidden_material(NEW.public_result_json) THEN
						RAISE EXCEPTION 'verification public result projection is unsafe or invalid'
							USING ERRCODE = '23514';
					END IF;
				END IF;
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_owner_states current_state
					WHERE current_state.namespace_id=NEW.namespace_id
						AND current_state.plan_digest=NEW.plan_digest
						AND current_state.repository_commit=NEW.repository_commit
						AND current_state.service_kind=NEW.service_kind
						AND current_state.owner_state_id=NEW.owner_state_id
						AND current_state.revision=NEW.owner_state_revision
						AND current_state.root_digest=NEW.owner_state_root_digest
						AND current_state.v45_eligible
				) THEN
					RAISE EXCEPTION 'evaluation owner-state result lacks its exact current state'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_owner_state_operations_transition
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_owner_state_operations
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_owner_state_operation_transition()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_owner_state_cas_artifact()
				RETURNS trigger AS $$
			DECLARE
				operation_state TEXT;
				operation_owner_state_id TEXT;
				operation_owner_implementation_digest TEXT;
				operation_stage_digest TEXT;
				operation_staged_at TIMESTAMPTZ;
				artifact_count BIGINT;
				artifact_bytes BIGINT;
				artifact_max_bytes BIGINT;
			BEGIN
				IF TG_OP<>'INSERT' THEN
					RAISE EXCEPTION 'evaluation owner-state CAS artifacts are immutable'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.v45_eligible IS DISTINCT FROM TRUE THEN
					RAISE EXCEPTION 'new evaluation owner-state CAS artifacts must use current authority'
						USING ERRCODE = '23514';
				END IF;
				SELECT state, owner_state_id, owner_implementation_digest, stage_digest, staged_at
				INTO operation_state, operation_owner_state_id,
					operation_owner_implementation_digest, operation_stage_digest, operation_staged_at
				FROM agent_evaluation_owner_state_operations operation_record
				WHERE operation_record.namespace_id=NEW.namespace_id
					AND operation_record.plan_digest=NEW.plan_digest
					AND operation_record.repository_commit=NEW.repository_commit
					AND operation_record.service_kind=NEW.service_kind
					AND operation_record.request_digest=NEW.request_digest
					AND operation_record.v45_eligible
				FOR SHARE;
				IF NOT FOUND OR operation_owner_state_id<>NEW.owner_state_id
					OR operation_owner_implementation_digest<>NEW.owner_implementation_digest
					OR operation_stage_digest<>NEW.stage_digest
					OR NEW.uploaded_at<operation_staged_at THEN
					RAISE EXCEPTION 'evaluation owner-state CAS artifact lacks its exact staged operation'
						USING ERRCODE = '23514';
				END IF;
				IF operation_state='sealed' AND NOT EXISTS (
					SELECT 1 FROM agent_evaluation_owner_state_cas_artifacts stored
					WHERE stored.namespace_id=NEW.namespace_id AND stored.plan_digest=NEW.plan_digest
						AND stored.repository_commit=NEW.repository_commit
						AND stored.service_kind=NEW.service_kind
						AND stored.owner_state_id=NEW.owner_state_id
						AND stored.artifact_ref=NEW.artifact_ref
						AND stored.request_digest=NEW.request_digest
						AND stored.owner_implementation_digest=NEW.owner_implementation_digest
						AND stored.stage_digest=NEW.stage_digest
						AND stored.artifact_kind=NEW.artifact_kind AND stored.media_type=NEW.media_type
						AND stored.artifact_digest=NEW.artifact_digest
						AND stored.byte_length=NEW.byte_length AND stored.content_bytes=NEW.content_bytes
						AND stored.artifact_identity_digest=NEW.artifact_identity_digest
						AND stored.descriptor_digest=NEW.descriptor_digest
						AND stored.upload_digest=NEW.upload_digest
						AND stored.cas_receipt_digest=NEW.cas_receipt_digest
						AND stored.v45_eligible
				) THEN
					RAISE EXCEPTION 'sealed evaluation owner-state CAS artifact replay drifted'
						USING ERRCODE = '23514';
				ELSIF operation_state NOT IN ('staged', 'sealed') THEN
					RAISE EXCEPTION 'evaluation owner-state CAS artifact operation is unavailable'
						USING ERRCODE = '23514';
				END IF;
				SELECT COUNT(*), COALESCE(SUM(byte_length),0)
				INTO artifact_count, artifact_bytes
				FROM agent_evaluation_owner_state_cas_artifacts stored
				WHERE stored.namespace_id=NEW.namespace_id AND stored.plan_digest=NEW.plan_digest
					AND stored.repository_commit=NEW.repository_commit
					AND stored.service_kind=NEW.service_kind
					AND stored.owner_state_id=NEW.owner_state_id
					AND stored.artifact_ref<>NEW.artifact_ref;
				artifact_max_bytes := CASE NEW.service_kind
					WHEN 'controlled-workspace' THEN 25165824
					ELSE 7864320
				END;
				IF artifact_count>=128 OR artifact_bytes+NEW.byte_length>artifact_max_bytes THEN
					RAISE EXCEPTION 'evaluation owner-state CAS capacity is exceeded'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_owner_state_cas_artifacts_binding
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_owner_state_cas_artifacts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_owner_state_cas_artifact()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_owner_state_current_binding()
				RETURNS trigger AS $$
			DECLARE
				descriptor JSONB;
				recent_operation JSONB;
				last_operation JSONB;
				operation_count BIGINT;
			BEGIN
				FOR descriptor IN SELECT value FROM jsonb_array_elements(NEW.bundle_json->'casArtifacts') LOOP
					IF jsonb_typeof(descriptor)<>'object'
						OR (SELECT COUNT(*) FROM jsonb_object_keys(descriptor))<>9
						OR NOT (descriptor ?& ARRAY[
							'format','version','artifactRef','artifactKind','mediaType','artifactDigest',
							'byteLength','casReceiptDigest','descriptorDigest'
						])
						OR descriptor->>'format'<>'prodivix.agent-evaluation-owner-state-cas-descriptor'
						OR (descriptor->>'version')::bigint<>1
						OR NOT EXISTS (
							SELECT 1 FROM agent_evaluation_owner_state_cas_artifacts artifact
							WHERE artifact.namespace_id=NEW.namespace_id
								AND artifact.plan_digest=NEW.plan_digest
								AND artifact.repository_commit=NEW.repository_commit
								AND artifact.service_kind=NEW.service_kind
								AND artifact.owner_state_id=NEW.owner_state_id
								AND artifact.artifact_ref=descriptor->>'artifactRef'
								AND artifact.artifact_kind=descriptor->>'artifactKind'
								AND artifact.media_type=descriptor->>'mediaType'
								AND artifact.artifact_digest=descriptor->>'artifactDigest'
								AND artifact.byte_length=(descriptor->>'byteLength')::bigint
								AND artifact.cas_receipt_digest=descriptor->>'casReceiptDigest'
								AND artifact.descriptor_digest=descriptor->>'descriptorDigest'
								AND artifact.v45_eligible
						) THEN
						RAISE EXCEPTION 'evaluation owner-state bundle contains an uncommitted CAS descriptor'
							USING ERRCODE = '23514';
					END IF;
				END LOOP;
				FOR recent_operation IN SELECT value FROM jsonb_array_elements(
					NEW.bundle_json->'recentOperations'
				) LOOP
					IF jsonb_typeof(recent_operation)<>'object'
						OR (SELECT COUNT(*) FROM jsonb_object_keys(recent_operation))<>9
						OR NOT (recent_operation ?& ARRAY[
							'format','version','sequence','operation','routeBinding','requestDigest',
							'stageDigest','responseDigest','recordDigest'
						])
						OR recent_operation->>'format'<>
							'prodivix.agent-evaluation-owner-state-operation-record'
						OR (recent_operation->>'version')::bigint<>1
						OR recent_operation->>'requestDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR recent_operation->>'stageDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR recent_operation->>'responseDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR recent_operation->>'recordDigest' !~ '^sha256-[a-f0-9]{64}$' THEN
						RAISE EXCEPTION 'evaluation owner-state recent operation is invalid'
							USING ERRCODE = '23514';
					END IF;
				END LOOP;
				last_operation := NEW.bundle_json->'recentOperations'->-1;
				SELECT COUNT(*) INTO operation_count
				FROM agent_evaluation_owner_state_operations operation_record
				JOIN agent_evaluation_controlled_authority_requests journal
					ON journal.namespace_id=operation_record.namespace_id
					AND journal.plan_digest=operation_record.plan_digest
					AND journal.repository_commit=operation_record.repository_commit
					AND journal.service_kind=operation_record.service_kind
					AND journal.request_digest=operation_record.request_digest
				WHERE operation_record.namespace_id=NEW.namespace_id
					AND operation_record.plan_digest=NEW.plan_digest
					AND operation_record.repository_commit=NEW.repository_commit
					AND operation_record.service_kind=NEW.service_kind
					AND operation_record.owner_state_id=NEW.owner_state_id
					AND operation_record.state='sealed' AND operation_record.v45_eligible
					AND operation_record.owner_state_revision=NEW.revision
					AND operation_record.owner_state_root_digest=NEW.root_digest
					AND operation_record.sealed_at=NEW.updated_at
					AND operation_record.operation=last_operation->>'operation'
					AND operation_record.route_binding=last_operation->>'routeBinding'
					AND operation_record.request_digest=last_operation->>'requestDigest'
					AND operation_record.stage_digest=last_operation->>'stageDigest'
					AND operation_record.response_digest=last_operation->>'responseDigest'
					AND (last_operation->>'sequence')::bigint=NEW.revision
					AND journal.v45_eligible
					AND NEW.bundle_json#>>'{snapshot,attemptId}'=journal.attempt_id
					AND NEW.bundle_json#>>'{snapshot,descriptorDigest}'=journal.descriptor_digest
					AND (NEW.service_kind='verification-evidence'
						OR NEW.bundle_json#>>'{snapshot,grantDigest}'=journal.grant_digest)
					AND (NEW.bundle_json#>>'{snapshot,generation}')::bigint=journal.generation;
				IF operation_count<>1 THEN
					RAISE EXCEPTION 'evaluation owner state lacks one exact sealed operation'
						USING ERRCODE = '23514';
				END IF;
				RETURN NULL;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_owner_states_exact_operation
				AFTER INSERT OR UPDATE ON agent_evaluation_owner_states
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_owner_state_current_binding()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_owner_state_operation_journal()
				RETURNS trigger AS $$
			DECLARE
				journal_state TEXT;
				journal_owner_implementation_digest TEXT;
				journal_stage_digest TEXT;
				journal_dispatch_ack_digest TEXT;
				journal_response_digest TEXT;
				journal_dispatched_at TIMESTAMPTZ;
				journal_sealed_at TIMESTAMPTZ;
			BEGIN
				SELECT state, owner_implementation_digest, stage_digest, dispatch_ack_digest,
					response_digest, dispatched_at, sealed_at
				INTO journal_state, journal_owner_implementation_digest, journal_stage_digest,
					journal_dispatch_ack_digest, journal_response_digest,
					journal_dispatched_at, journal_sealed_at
				FROM agent_evaluation_controlled_authority_requests journal
				WHERE journal.namespace_id=NEW.namespace_id AND journal.plan_digest=NEW.plan_digest
					AND journal.repository_commit=NEW.repository_commit
					AND journal.service_kind=NEW.service_kind
					AND journal.request_digest=NEW.request_digest
					AND journal.operation=NEW.operation AND journal.route_binding=NEW.route_binding
					AND journal.v45_eligible;
				IF NOT FOUND OR journal_owner_implementation_digest<>NEW.owner_implementation_digest
					OR journal_stage_digest<>NEW.stage_digest
					OR journal_dispatched_at<>NEW.staged_at THEN
					RAISE EXCEPTION 'evaluation owner-state operation lacks exact journal fences'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.state='staged' THEN
					IF journal_state<>'dispatched' OR journal_dispatch_ack_digest IS NOT NULL
						OR journal_response_digest IS NOT NULL THEN
						RAISE EXCEPTION 'staged evaluation owner-state operation journal is invalid'
							USING ERRCODE = '23514';
					END IF;
				ELSIF journal_state NOT IN ('dispatched','sealed')
					OR journal_dispatch_ack_digest<>NEW.dispatch_ack_digest
					OR (journal_state='dispatched' AND journal_response_digest IS NOT NULL)
					OR (journal_state='sealed' AND (
						journal_response_digest IS NULL OR journal_sealed_at<NEW.sealed_at
					)) THEN
					RAISE EXCEPTION 'sealed evaluation owner-state operation journal is invalid'
						USING ERRCODE = '23514';
				END IF;
				RETURN NULL;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_owner_state_operations_exact_journal
				AFTER INSERT OR UPDATE ON agent_evaluation_owner_state_operations
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_owner_state_operation_journal()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_owner_state_journal_operation()
				RETURNS trigger AS $$
			DECLARE
				operation_count BIGINT;
			BEGIN
				IF NEW.v45_eligible IS DISTINCT FROM TRUE
					OR NOT agent_evaluation_owner_stateful_operation(
						NEW.service_kind, NEW.operation, NEW.route_binding
					) THEN
					RETURN NULL;
				END IF;
				SELECT COUNT(*) INTO operation_count
				FROM agent_evaluation_owner_state_operations operation_record
				WHERE operation_record.namespace_id=NEW.namespace_id
					AND operation_record.plan_digest=NEW.plan_digest
					AND operation_record.repository_commit=NEW.repository_commit
					AND operation_record.service_kind=NEW.service_kind
					AND operation_record.operation=NEW.operation
					AND operation_record.route_binding=NEW.route_binding
					AND operation_record.request_digest=NEW.request_digest
					AND operation_record.owner_implementation_digest=NEW.owner_implementation_digest
					AND operation_record.stage_digest=NEW.stage_digest
					AND operation_record.v45_eligible
					AND (
						(NEW.state='dispatched' AND NEW.dispatch_ack_digest IS NULL
							AND operation_record.state='staged')
						OR (NEW.state IN ('dispatched','sealed') AND NEW.dispatch_ack_digest IS NOT NULL
							AND operation_record.state='sealed'
							AND operation_record.dispatch_ack_digest=NEW.dispatch_ack_digest)
					);
				IF NEW.state='claimed' THEN
					IF operation_count<>0 THEN
						RAISE EXCEPTION 'claimed owner-state journal already has an operation'
							USING ERRCODE = '23514';
					END IF;
				ELSIF operation_count<>1 THEN
					RAISE EXCEPTION 'owner-state journal lacks one exact durable operation'
						USING ERRCODE = '23514';
				END IF;
				RETURN NULL;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_controlled_authority_owner_state_operation
				AFTER INSERT OR UPDATE ON agent_evaluation_controlled_authority_requests
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_owner_state_journal_operation()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_owner_state_capacity()
				RETURNS trigger AS $$
			DECLARE
				committed_bytes BIGINT;
			BEGIN
				PERFORM 1 FROM agent_evaluation_plans plan
				WHERE plan.namespace_id=NEW.namespace_id AND plan.plan_digest=NEW.plan_digest
					AND plan.repository_commit=NEW.repository_commit
				FOR UPDATE;
				IF NOT FOUND THEN
					RAISE EXCEPTION 'evaluation owner-state capacity lacks its frozen plan'
						USING ERRCODE = '23503';
				END IF;
				SELECT
					COALESCE((SELECT SUM(octet_length(bundle_bytes))
						FROM agent_evaluation_owner_states current_state
						WHERE current_state.namespace_id=NEW.namespace_id
							AND current_state.plan_digest=NEW.plan_digest
							AND current_state.repository_commit=NEW.repository_commit),0)
					+ COALESCE((SELECT SUM(octet_length(content_bytes))
						FROM agent_evaluation_owner_state_cas_artifacts artifact
						WHERE artifact.namespace_id=NEW.namespace_id
							AND artifact.plan_digest=NEW.plan_digest
							AND artifact.repository_commit=NEW.repository_commit),0)
					+ COALESCE((SELECT SUM(
						COALESCE(octet_length(public_result_bytes),0)
						+COALESCE(octet_length(sealed_operation_bytes),0)
					) FROM agent_evaluation_owner_state_operations operation_record
						WHERE operation_record.namespace_id=NEW.namespace_id
							AND operation_record.plan_digest=NEW.plan_digest
							AND operation_record.repository_commit=NEW.repository_commit),0)
				INTO committed_bytes;
				IF committed_bytes>8589934592 THEN
					RAISE EXCEPTION 'evaluation owner-state family exceeds frozen 8GiB capacity'
						USING ERRCODE = '23514';
				END IF;
				RETURN NULL;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_owner_states_capacity
				AFTER INSERT OR UPDATE ON agent_evaluation_owner_states
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_owner_state_capacity()`,
			`CREATE TRIGGER agent_evaluation_owner_state_operations_capacity
				AFTER INSERT OR UPDATE ON agent_evaluation_owner_state_operations
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_owner_state_capacity()`,
			`CREATE TRIGGER agent_evaluation_owner_state_cas_artifacts_capacity
				AFTER INSERT ON agent_evaluation_owner_state_cas_artifacts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_owner_state_capacity()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_attempt_authority_owner_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				journal_service_kind TEXT NOT NULL,
				service_kind TEXT NOT NULL,
				operation TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				shard_lease_owner_id TEXT NOT NULL,
				shard_lease_generation BIGINT NOT NULL,
				verification_grant_generation BIGINT NOT NULL,
				verification_grant_receipt_set_digest TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				response_digest TEXT NOT NULL,
				owner_implementation_digest TEXT NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (
					namespace_id, plan_digest, repository_commit, journal_service_kind, request_digest
				),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (
					namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest
				),
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, journal_service_kind, request_digest
				) REFERENCES agent_evaluation_controlled_authority_requests(
					namespace_id, plan_digest, repository_commit, service_kind, request_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_attempt_authority_receipt_service_check CHECK (
					(journal_service_kind = 'provider-capability' AND service_kind = 'capability-runtime'
						AND operation IN ('execute-tool', 'assess-capability'))
					OR (journal_service_kind = 'attempt-grading' AND service_kind = 'attempt-grading'
						AND operation = 'grade-and-persist')
				),
				CONSTRAINT agent_evaluation_attempt_authority_receipt_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_attempt_authority_receipt_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND verification_grant_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_attempt_authority_receipt_generation_check CHECK (
					shard_lease_generation BETWEEN 1 AND 9007199254740991
					AND verification_grant_generation BETWEEN 1 AND 9007199254740991
				),
				CONSTRAINT agent_evaluation_attempt_authority_receipt_bytes_check
					CHECK (octet_length(receipt_bytes) BETWEEN 1 AND 16384
						AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb),
				CONSTRAINT agent_evaluation_attempt_authority_receipt_json_binding_check CHECK (COALESCE((
					receipt_json ?& ARRAY[
						'format', 'version', 'namespaceId', 'planDigest', 'repositoryCommit',
						'serviceKind', 'operation', 'attemptId', 'descriptorDigest',
						'shardLeaseOwnerId', 'shardLeaseGeneration',
						'verificationGrantGeneration', 'verificationAttemptGrantReceiptSetDigest',
						'requestDigest', 'responseProjection', 'responseDigest', 'ownerImplementationDigest',
						'completedAt', 'receiptDigest'
					]
					AND receipt_json->>'format'=
						'prodivix.agent-evaluation-attempt-authority-owner-receipt'
					AND (receipt_json->>'version')::bigint=1
					AND jsonb_typeof(receipt_json->'responseProjection')='object'
					AND receipt_json->>'namespaceId' = namespace_id
					AND receipt_json->>'planDigest' = plan_digest
					AND receipt_json->>'repositoryCommit' = repository_commit
					AND receipt_json->>'serviceKind' = service_kind
					AND receipt_json->>'operation' = operation
					AND receipt_json->>'attemptId' = attempt_id
					AND receipt_json->>'descriptorDigest' = descriptor_digest
					AND receipt_json->>'shardLeaseOwnerId' = shard_lease_owner_id
					AND (receipt_json->>'shardLeaseGeneration')::bigint = shard_lease_generation
					AND (receipt_json->>'verificationGrantGeneration')::bigint = verification_grant_generation
					AND receipt_json->>'verificationAttemptGrantReceiptSetDigest' =
						verification_grant_receipt_set_digest
					AND receipt_json->>'requestDigest' = request_digest
					AND receipt_json->>'responseDigest' = response_digest
					AND receipt_json->>'ownerImplementationDigest' = owner_implementation_digest
					AND (receipt_json->>'completedAt')::timestamptz = completed_at
					AND receipt_json->>'receiptDigest' = receipt_digest
				), FALSE))
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_attempt_authority_owner_receipt_binding()
				RETURNS trigger AS $$
			DECLARE
				journal_operation TEXT;
				journal_v45_eligible BOOLEAN;
				journal_owner_implementation_digest TEXT;
				journal_attempt_id TEXT;
				journal_descriptor_digest TEXT;
				journal_shard_lease_owner_id TEXT;
				journal_shard_lease_generation BIGINT;
				journal_verification_grant_generation BIGINT;
				journal_verification_grant_receipt_set_digest TEXT;
				journal_response_digest TEXT;
				journal_response_bytes BYTEA;
				journal_stage_digest TEXT;
				journal_dispatch_ack_digest TEXT;
				journal_observation_receipt_set_digest TEXT;
				journal_pre_effect_intent_digest TEXT;
				journal_pre_effect_intent_json JSONB;
				journal_pre_effect_intent_bytes BYTEA;
				journal_sealed_at TIMESTAMPTZ;
				journal_response_json JSONB;
				owner_projection JSONB;
			BEGIN
				IF jsonb_typeof(NEW.receipt_json) <> 'object'
					OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.receipt_json)) <> 19 THEN
					RAISE EXCEPTION 'agent evaluation attempt-authority owner receipt shape is invalid'
						USING ERRCODE = '23514';
				END IF;
				SELECT operation, v45_eligible, owner_implementation_digest, attempt_id, descriptor_digest,
					shard_lease_owner_id, shard_lease_generation, verification_grant_generation,
					verification_grant_receipt_set_digest, response_digest, response_bytes, stage_digest,
					dispatch_ack_digest,
					provider_capability_observation_receipt_set_digest, pre_effect_intent_digest,
					pre_effect_intent_json, pre_effect_intent_bytes, sealed_at
				INTO journal_operation, journal_v45_eligible, journal_owner_implementation_digest,
					journal_attempt_id,
					journal_descriptor_digest, journal_shard_lease_owner_id,
					journal_shard_lease_generation, journal_verification_grant_generation,
					journal_verification_grant_receipt_set_digest, journal_response_digest,
					journal_response_bytes, journal_stage_digest, journal_dispatch_ack_digest,
					journal_observation_receipt_set_digest,
					journal_pre_effect_intent_digest, journal_pre_effect_intent_json,
					journal_pre_effect_intent_bytes,
					journal_sealed_at
				FROM agent_evaluation_controlled_authority_requests
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND service_kind=NEW.journal_service_kind
					AND request_digest=NEW.request_digest AND state='sealed'
				FOR SHARE;
				IF NOT FOUND OR journal_v45_eligible IS DISTINCT FROM TRUE
					OR EXISTS (
						SELECT 1 FROM agent_evaluation_controlled_authority_requests legacy
						WHERE legacy.namespace_id=NEW.namespace_id
							AND legacy.plan_digest=NEW.plan_digest
							AND legacy.repository_commit=NEW.repository_commit
							AND legacy.attempt_id=NEW.attempt_id
							AND legacy.service_kind IN ('provider-capability', 'attempt-grading')
							AND NOT legacy.v45_eligible
					)
					OR journal_owner_implementation_digest IS DISTINCT FROM NEW.owner_implementation_digest
					OR journal_attempt_id IS DISTINCT FROM NEW.attempt_id
					OR journal_descriptor_digest IS DISTINCT FROM NEW.descriptor_digest
					OR journal_shard_lease_owner_id IS DISTINCT FROM NEW.shard_lease_owner_id
					OR journal_shard_lease_generation IS DISTINCT FROM NEW.shard_lease_generation
					OR journal_verification_grant_generation IS DISTINCT FROM NEW.verification_grant_generation
					OR journal_verification_grant_receipt_set_digest IS DISTINCT FROM
						NEW.verification_grant_receipt_set_digest
					OR journal_stage_digest IS NULL OR journal_dispatch_ack_digest IS NULL
					OR journal_observation_receipt_set_digest IS NULL
					OR journal_sealed_at IS DISTINCT FROM NEW.completed_at
					OR NOT (
						(NEW.journal_service_kind='provider-capability'
							AND ((journal_operation='tool.execute' AND NEW.operation='execute-tool')
								OR (journal_operation='capability.assess' AND NEW.operation='assess-capability')))
						OR (NEW.journal_service_kind='attempt-grading'
							AND journal_operation='grade-and-persist'
							AND NEW.operation='grade-and-persist')
					) THEN
					RAISE EXCEPTION 'agent evaluation attempt-authority owner receipt drifted from its sealed journal'
						USING ERRCODE = '23514';
				END IF;
				IF journal_operation='tool.execute'
					AND journal_pre_effect_intent_digest IS NOT NULL THEN
					journal_response_json := convert_from(journal_response_bytes, 'UTF8')::jsonb;
					owner_projection := NEW.receipt_json->'responseProjection';
					IF jsonb_typeof(owner_projection) <> 'object'
						OR (SELECT COUNT(*) FROM jsonb_object_keys(owner_projection)) <> 16
						OR NOT (owner_projection ?& ARRAY[
							'serviceKind','operation','executionAuthorityKind','invocationId',
							'turnIndex','toolId','toolCallId','providerToolCallId',
							'providerRequestDigest','outcome','resultDigest',
							'continuationReceiptDigest','preEffectIntentDigest',
							'effectSourceReceiptDigest','effectSourceFactDigest',
							'specificReceiptDigests'
						])
						OR jsonb_typeof(journal_response_json) <> 'object'
						OR (SELECT COUNT(*) FROM jsonb_object_keys(journal_response_json)) <> 8
						OR NOT (journal_response_json ?& ARRAY[
							'executionAuthorityKind','outcome','result','resultDigest',
							'continuationReceiptDigest','effectSourceReceipt','effectSourceFact',
							'specificReceipts'
						])
						OR owner_projection->>'serviceKind' <> 'capability-runtime'
						OR owner_projection->>'operation' <> 'execute-tool'
						OR owner_projection->>'executionAuthorityKind' <> 'shared-effect'
						OR owner_projection->>'preEffectIntentDigest' <>
							journal_pre_effect_intent_digest
						OR owner_projection->>'invocationId' <>
							journal_pre_effect_intent_json->>'invocationId'
						OR (owner_projection->>'turnIndex')::bigint <>
							(journal_pre_effect_intent_json->>'turnIndex')::bigint
						OR owner_projection->>'toolId' <> journal_pre_effect_intent_json->>'toolId'
						OR owner_projection->>'toolCallId' <>
							journal_pre_effect_intent_json->>'toolCallId'
						OR owner_projection->>'providerToolCallId' <>
							journal_pre_effect_intent_json->>'providerToolCallId'
						OR owner_projection->>'providerRequestDigest' <>
							journal_pre_effect_intent_json->>'providerRequestDigest'
						OR journal_response_json->>'executionAuthorityKind' <> 'shared-effect'
						OR journal_response_json->>'outcome' <> owner_projection->>'outcome'
						OR journal_response_json->>'resultDigest' <> owner_projection->>'resultDigest'
						OR journal_response_json->>'continuationReceiptDigest' <>
							owner_projection->>'continuationReceiptDigest'
						OR journal_response_json#>>'{effectSourceReceipt,intentDigest}' <>
							journal_pre_effect_intent_digest
						OR journal_response_json#>>'{effectSourceReceipt,stageDigest}' <>
							journal_stage_digest
						OR journal_response_json#>>'{effectSourceReceipt,dispatchAckDigest}' <>
							journal_dispatch_ack_digest
						OR journal_response_json#>>'{effectSourceReceipt,receiptDigest}' <>
							owner_projection->>'effectSourceReceiptDigest'
						OR NULLIF(journal_response_json#>>'{effectSourceFact,factDigest}', '')
							IS DISTINCT FROM NULLIF(owner_projection->>'effectSourceFactDigest', '')
						OR NULLIF(journal_response_json#>>'{effectSourceReceipt,sourceFactDigest}', '')
							IS DISTINCT FROM NULLIF(owner_projection->>'effectSourceFactDigest', '')
						OR jsonb_typeof(owner_projection->'specificReceiptDigests') <> 'array'
						OR jsonb_array_length(owner_projection->'specificReceiptDigests') <> 0
						OR jsonb_typeof(journal_response_json->'specificReceipts') <> 'array'
						OR jsonb_array_length(journal_response_json->'specificReceipts') <> 0 THEN
						RAISE EXCEPTION 'shared-effect owner receipt projection drifted from durable preimages'
							USING ERRCODE = '23514';
					END IF;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_attempt_authority_owner_receipts_exact_binding
				BEFORE INSERT ON agent_evaluation_attempt_authority_owner_receipts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_attempt_authority_owner_receipt_binding()`,
			`CREATE TRIGGER agent_evaluation_attempt_authority_owner_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_attempt_authority_owner_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_attempt_authority_owner_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_attempt_authority_owner_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_runtime_fact_source_owner_registrations (
				namespace_id TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				source_authority_kind TEXT NOT NULL,
				source_kind TEXT NOT NULL,
				source_authority_id TEXT NOT NULL,
				source_authority_implementation_digest TEXT NOT NULL,
				route_binding TEXT NOT NULL,
				capability_profile_id TEXT NOT NULL,
				capability_profile_digest TEXT NOT NULL,
				capability_id TEXT NOT NULL,
				protocol_family TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				model_id TEXT NOT NULL,
				model_lineage_digest TEXT NOT NULL,
				adapter_digest TEXT NOT NULL,
				minimum_expires_at TIMESTAMPTZ NOT NULL,
				registration_authority_issuer_id TEXT NOT NULL,
				state TEXT NOT NULL,
				claim_generation BIGINT NOT NULL DEFAULT 1,
				stage_digest TEXT,
				owner_health_digest TEXT,
				owner_admission_digest TEXT,
				dispatch_ack_digest TEXT,
				registered_at TIMESTAMPTZ,
				expires_at TIMESTAMPTZ,
				registration_receipt_digest TEXT,
				request_json JSONB NOT NULL,
				request_bytes BYTEA NOT NULL,
				owner_health_json JSONB,
				owner_health_bytes BYTEA,
				receipt_json JSONB,
				receipt_bytes BYTEA,
				v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
				claimed_at TIMESTAMPTZ NOT NULL,
				dispatched_at TIMESTAMPTZ,
				sealed_at TIMESTAMPTZ,
				updated_at TIMESTAMPTZ,
				PRIMARY KEY (namespace_id, repository_commit, request_digest),
				UNIQUE (namespace_id, repository_commit, registration_receipt_digest),
				UNIQUE (
					namespace_id, repository_commit, capability_profile_id,
					capability_profile_digest, capability_id, protocol_family,
					provider_configuration_id, model_id, model_lineage_digest,
					adapter_digest, source_kind, route_binding, source_authority_id,
					source_authority_implementation_digest
				),
				CONSTRAINT agent_eval_runtime_fact_source_registration_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND source_authority_kind='shared-durable-capability'
					AND (capability_profile_id, capability_profile_digest, capability_id, source_kind) IN (
						(
							'g4-provider-background-job',
							'sha256-10357cde3de8f565df7ddb83ea46ad0a67207fb2174aacde0170cad33becf195',
							'provider.background-job', 'sealed-provider-response-metadata'
						),
						(
							'g4-provider-hosted-retrieval-core',
							'sha256-666c6df670c77605562ff82765013291f99045f36edcb8db0af209267c91565d',
							'provider.hosted-retrieval', 'sealed-hosted-owner-result'
						),
						(
							'g4-provider-hosted-retrieval-document',
							'sha256-8ced3fda38a88c0819a6a2d4603e453f515a9c98efadc7c270af194349c5b90e',
							'provider.hosted-retrieval', 'sealed-hosted-owner-result'
						),
						(
							'g4-provider-isolated-cache',
							'sha256-264e47b104dc759c661ec242aba670063a1ffd4c8eb996c45bf4c55f19057103',
							'provider.isolated-cache', 'sealed-provider-response-metadata'
						),
						(
							'g4-provider-reasoning-continuation',
							'sha256-5c84287b4c1e16fb0c1eda862a8e44754503a3fa0a4b61a16e2d2f2465072d34',
							'provider.reasoning-continuation', 'sealed-provider-response-metadata'
						)
					)
					AND protocol_family IN (
						'openai-responses', 'anthropic-messages', 'gemini-interactions'
					)
					AND state IN ('claimed','dispatched','sealed')
					AND claim_generation=1 AND v45_eligible
				),
				CONSTRAINT agent_eval_runtime_fact_source_registration_digest_check CHECK (
					request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (stage_digest IS NULL OR stage_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (owner_health_digest IS NULL
						OR owner_health_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (owner_admission_digest IS NULL
						OR owner_admission_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (dispatch_ack_digest IS NULL
						OR dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (registration_receipt_digest IS NULL
						OR registration_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_eval_runtime_fact_source_registration_lifecycle_check CHECK (
					(state='claimed' AND stage_digest IS NULL
						AND owner_health_digest IS NULL AND owner_admission_digest IS NULL
						AND dispatch_ack_digest IS NULL AND registered_at IS NULL
						AND expires_at IS NULL AND registration_receipt_digest IS NULL
						AND owner_health_json IS NULL AND owner_health_bytes IS NULL
						AND receipt_json IS NULL AND receipt_bytes IS NULL
						AND dispatched_at IS NULL AND sealed_at IS NULL AND updated_at IS NULL)
					OR (state='dispatched' AND stage_digest IS NOT NULL
						AND dispatched_at IS NOT NULL AND sealed_at IS NULL
						AND ((dispatch_ack_digest IS NULL
							AND owner_health_digest IS NULL AND owner_admission_digest IS NULL
							AND registered_at IS NULL AND expires_at IS NULL
							AND registration_receipt_digest IS NULL
							AND owner_health_json IS NULL AND owner_health_bytes IS NULL
							AND receipt_json IS NULL AND receipt_bytes IS NULL
							AND updated_at IS NULL)
						OR (dispatch_ack_digest IS NOT NULL
							AND owner_health_digest IS NOT NULL AND owner_admission_digest IS NOT NULL
							AND registered_at IS NOT NULL AND expires_at IS NOT NULL
							AND registration_receipt_digest IS NOT NULL
							AND owner_health_json IS NOT NULL AND owner_health_bytes IS NOT NULL
							AND receipt_json IS NOT NULL AND receipt_bytes IS NOT NULL
							AND updated_at IS NOT NULL)))
					OR (state='sealed' AND stage_digest IS NOT NULL
						AND owner_health_digest IS NOT NULL AND owner_admission_digest IS NOT NULL
						AND dispatch_ack_digest IS NOT NULL AND registered_at IS NOT NULL
						AND expires_at IS NOT NULL AND registration_receipt_digest IS NOT NULL
						AND owner_health_json IS NOT NULL AND owner_health_bytes IS NOT NULL
						AND receipt_json IS NOT NULL AND receipt_bytes IS NOT NULL
						AND dispatched_at IS NOT NULL AND sealed_at IS NOT NULL
						AND updated_at IS NOT NULL)
				),
				CONSTRAINT agent_eval_runtime_fact_source_registration_time_check CHECK (
					minimum_expires_at > claimed_at
					AND minimum_expires_at <= claimed_at + INTERVAL '8 days'
					AND (dispatched_at IS NULL OR dispatched_at >= claimed_at)
					AND (registered_at IS NULL OR registered_at >= claimed_at)
					AND (expires_at IS NULL OR expires_at >= minimum_expires_at)
					AND (updated_at IS NULL OR updated_at >= registered_at)
					AND (sealed_at IS NULL OR sealed_at >= updated_at)
					AND (sealed_at IS NULL OR (
						expires_at > registered_at AND expires_at > sealed_at
						AND expires_at <= registered_at + INTERVAL '8 days'
					))
				),
				CONSTRAINT agent_eval_runtime_fact_source_registration_bytes_check CHECK (
					octet_length(request_bytes) BETWEEN 1 AND 65536
					AND request_json=convert_from(request_bytes,'UTF8')::jsonb
					AND (owner_health_json IS NULL)=(owner_health_bytes IS NULL)
					AND (owner_health_json IS NULL OR (
						octet_length(owner_health_bytes) BETWEEN 1 AND 65536
						AND owner_health_json=convert_from(owner_health_bytes,'UTF8')::jsonb
					))
					AND (receipt_json IS NULL)=(receipt_bytes IS NULL)
					AND (receipt_json IS NULL OR (
						octet_length(receipt_bytes) BETWEEN 1 AND 65536
						AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb
					))
				),
				CONSTRAINT agent_eval_runtime_fact_source_registration_request_json_check CHECK (COALESCE((
					request_json->>'format'=
						'prodivix.agent-evaluation-runtime-fact-source-owner-registration-request'
					AND (request_json->>'version')::bigint=1
					AND request_json->>'namespaceId'=namespace_id
					AND request_json->>'repositoryCommit'=repository_commit
					AND request_json->>'sourceAuthorityKind'=source_authority_kind
					AND request_json->>'sourceKind'=source_kind
					AND request_json->>'sourceAuthorityId'=source_authority_id
					AND request_json->>'sourceAuthorityImplementationDigest'=
						source_authority_implementation_digest
					AND request_json->>'routeBinding'=route_binding
					AND request_json->>'capabilityProfileId'=capability_profile_id
					AND request_json->>'capabilityProfileDigest'=capability_profile_digest
					AND request_json->>'capabilityId'=capability_id
					AND request_json->>'protocolFamily'=protocol_family
					AND request_json->>'providerConfigurationId'=provider_configuration_id
					AND request_json->>'modelId'=model_id
					AND request_json->>'modelLineageDigest'=model_lineage_digest
					AND request_json->>'adapterDigest'=adapter_digest
					AND (request_json->>'minimumExpiresAt')::timestamptz=minimum_expires_at
					AND request_json->>'requestDigest'=request_digest
				), FALSE)),
				CONSTRAINT agent_eval_runtime_fact_source_registration_health_json_check CHECK (COALESCE((
					owner_health_json IS NULL OR (
						owner_health_json->>'format'=
							'prodivix.agent-evaluation-runtime-fact-source-owner-health'
						AND (owner_health_json->>'version')::bigint=1
						AND owner_health_json->>'requestDigest'=request_digest
						AND owner_health_json->>'sourceAuthorityId'=source_authority_id
						AND owner_health_json->>'sourceAuthorityImplementationDigest'=
							source_authority_implementation_digest
						AND owner_health_json->>'sourceKind'=source_kind
						AND owner_health_json->>'routeBinding'=route_binding
						AND owner_health_json->>'status'='ready'
						AND (owner_health_json->>'checkedAt')::timestamptz=registered_at
						AND (owner_health_json->>'expiresAt')::timestamptz=expires_at
						AND owner_health_json->>'healthDigest'=owner_health_digest
					)
				), FALSE)),
				CONSTRAINT agent_eval_runtime_fact_source_registration_receipt_json_check CHECK (COALESCE((
					receipt_json IS NULL OR (
						receipt_json->>'format'=
							'prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt'
						AND (receipt_json->>'version')::bigint=1
						AND receipt_json->>'namespaceId'=namespace_id
						AND receipt_json->>'repositoryCommit'=repository_commit
						AND receipt_json->>'requestDigest'=request_digest
						AND receipt_json->>'sourceAuthorityKind'=source_authority_kind
						AND receipt_json->>'sourceKind'=source_kind
						AND receipt_json->>'sourceAuthorityId'=source_authority_id
						AND receipt_json->>'sourceAuthorityImplementationDigest'=
							source_authority_implementation_digest
						AND receipt_json->>'routeBinding'=route_binding
						AND receipt_json->>'capabilityProfileId'=capability_profile_id
						AND receipt_json->>'capabilityProfileDigest'=capability_profile_digest
						AND receipt_json->>'capabilityId'=capability_id
						AND receipt_json->>'protocolFamily'=protocol_family
						AND receipt_json->>'providerConfigurationId'=provider_configuration_id
						AND receipt_json->>'modelId'=model_id
						AND receipt_json->>'modelLineageDigest'=model_lineage_digest
						AND receipt_json->>'adapterDigest'=adapter_digest
						AND receipt_json->>'registrationAuthorityIssuerId'=
							registration_authority_issuer_id
						AND receipt_json->>'ownerHealthDigest'=owner_health_digest
						AND receipt_json->>'ownerAdmissionDigest'=owner_admission_digest
						AND receipt_json->>'stageDigest'=stage_digest
						AND receipt_json->>'dispatchAckDigest'=dispatch_ack_digest
						AND (receipt_json->>'registeredAt')::timestamptz=registered_at
						AND (receipt_json->>'expiresAt')::timestamptz=expires_at
						AND receipt_json->>'registrationReceiptDigest'=
							registration_receipt_digest
					)
				), FALSE))
			)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_runtime_fact_source_registration_receipt
				ON agent_evaluation_runtime_fact_source_owner_registrations(
					namespace_id, registration_receipt_digest
				) WHERE state='sealed'`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_runtime_fact_source_registration_capacity()
				RETURNS trigger AS $$
			DECLARE
				registration_count BIGINT;
			BEGIN
				PERFORM pg_advisory_xact_lock(hashtextextended(
					NEW.namespace_id || chr(31) || NEW.repository_commit, 0
				));
				IF EXISTS (
					SELECT 1 FROM agent_evaluation_runtime_fact_source_owner_registrations existing
					WHERE existing.namespace_id=NEW.namespace_id
						AND existing.repository_commit=NEW.repository_commit
						AND existing.request_digest=NEW.request_digest
				) THEN
					RETURN NEW;
				END IF;
				SELECT COUNT(*) INTO registration_count
				FROM agent_evaluation_runtime_fact_source_owner_registrations registration
				WHERE registration.namespace_id=NEW.namespace_id
					AND registration.repository_commit=NEW.repository_commit;
				IF registration_count >= 15 THEN
					RAISE EXCEPTION 'runtime fact source owner registration exceeds frozen capacity'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_runtime_fact_source_registrations_capacity
				BEFORE INSERT ON agent_evaluation_runtime_fact_source_owner_registrations
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_runtime_fact_source_registration_capacity()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_runtime_fact_source_registration_transition()
				RETURNS trigger AS $$
			BEGIN
				IF TG_OP='DELETE' THEN
					RAISE EXCEPTION 'runtime fact source owner registration is immutable'
						USING ERRCODE = '23514';
				END IF;
				IF jsonb_typeof(NEW.request_json) <> 'object'
					OR NOT (NEW.request_json ?& ARRAY[
						'format','version','namespaceId','repositoryCommit','sourceAuthorityKind',
						'sourceKind','sourceAuthorityId','sourceAuthorityImplementationDigest',
						'routeBinding','capabilityProfileId','capabilityProfileDigest','capabilityId',
						'protocolFamily','providerConfigurationId','modelId','modelLineageDigest',
						'adapterDigest','minimumExpiresAt','requestDigest'
					])
					OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.request_json)) <> 19
					OR (NEW.owner_health_json IS NOT NULL AND (
						jsonb_typeof(NEW.owner_health_json) <> 'object'
						OR NOT (NEW.owner_health_json ?& ARRAY[
							'format','version','requestDigest','sourceAuthorityId',
							'sourceAuthorityImplementationDigest','sourceKind','routeBinding',
							'status','checkedAt','expiresAt','healthDigest'
						])
						OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.owner_health_json)) <> 11
					))
					OR (NEW.receipt_json IS NOT NULL AND (
						jsonb_typeof(NEW.receipt_json) <> 'object'
						OR NOT (NEW.receipt_json ?& ARRAY[
							'format','version','namespaceId','repositoryCommit','requestDigest',
							'sourceAuthorityKind','sourceKind','sourceAuthorityId',
							'sourceAuthorityImplementationDigest','routeBinding','capabilityProfileId',
							'capabilityProfileDigest','capabilityId','protocolFamily',
							'providerConfigurationId','modelId','modelLineageDigest','adapterDigest',
							'registrationAuthorityIssuerId','ownerHealthDigest','ownerAdmissionDigest',
							'stageDigest','dispatchAckDigest','registeredAt','expiresAt',
							'registrationReceiptDigest'
						])
						OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.receipt_json)) <> 26
					)) THEN
					RAISE EXCEPTION 'runtime fact source registration canonical shape is invalid'
						USING ERRCODE = '23514';
				END IF;
				IF TG_OP='INSERT' THEN
					IF NEW.state <> 'claimed' OR NEW.v45_eligible IS DISTINCT FROM TRUE THEN
						RAISE EXCEPTION 'runtime fact source owner registration must start claimed/current'
							USING ERRCODE = '23514';
					END IF;
					RETURN NEW;
				END IF;
				IF OLD.state='claimed' AND NEW.state='dispatched' THEN
					IF (to_jsonb(OLD)-ARRAY['state','stage_digest','dispatched_at']) IS DISTINCT FROM
						(to_jsonb(NEW)-ARRAY['state','stage_digest','dispatched_at']) THEN
						RAISE EXCEPTION 'runtime fact source registration dispatch changed immutable fields'
							USING ERRCODE = '23514';
					END IF;
				ELSIF OLD.state='dispatched' AND NEW.state='dispatched' THEN
					IF OLD.dispatch_ack_digest IS NOT NULL OR
						(to_jsonb(OLD)-ARRAY[
							'owner_health_digest','owner_admission_digest','dispatch_ack_digest',
							'registered_at','expires_at','registration_receipt_digest',
							'owner_health_json','owner_health_bytes','receipt_json','receipt_bytes','updated_at'
						]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY[
							'owner_health_digest','owner_admission_digest','dispatch_ack_digest',
							'registered_at','expires_at','registration_receipt_digest',
							'owner_health_json','owner_health_bytes','receipt_json','receipt_bytes','updated_at'
						]) THEN
						RAISE EXCEPTION 'runtime fact source registration ACK changed immutable fields'
							USING ERRCODE = '23514';
					END IF;
				ELSIF OLD.state='dispatched' AND NEW.state='sealed' THEN
					IF OLD.dispatch_ack_digest IS NULL OR
						(to_jsonb(OLD)-ARRAY['state','sealed_at','updated_at']) IS DISTINCT FROM
						(to_jsonb(NEW)-ARRAY['state','sealed_at','updated_at']) THEN
						RAISE EXCEPTION 'runtime fact source registration seal drifted from ACK'
							USING ERRCODE = '23514';
					END IF;
				ELSE
					RAISE EXCEPTION 'runtime fact source owner registration transition is invalid'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_runtime_fact_source_registrations_transition
				BEFORE INSERT OR UPDATE OR DELETE
				ON agent_evaluation_runtime_fact_source_owner_registrations
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_runtime_fact_source_registration_transition()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_plan_runtime_fact_source_registrations()
				RETURNS trigger AS $$
			DECLARE
				target JSONB;
				optional_authority JSONB;
				runtime_authority JSONB;
				fact_backed BOOLEAN;
			BEGIN
				FOR target IN SELECT value FROM jsonb_array_elements(COALESCE(
					NEW.plan_json#>'{value,capabilityQualificationTargets}', '[]'::jsonb
				))
				LOOP
					IF target ? 'runtimeFactSourceAuthority' THEN
						RAISE EXCEPTION 'evaluation plan runtime fact source authority is outside its optional capability authority'
							USING ERRCODE = '23514';
					END IF;
					IF NOT (target ? 'optionalCapabilitySupportAuthority') THEN
						CONTINUE;
					END IF;
					optional_authority := target->'optionalCapabilitySupportAuthority';
					fact_backed := optional_authority->>'capabilityId' IN (
						'provider.background-job',
						'provider.hosted-retrieval',
						'provider.isolated-cache',
						'provider.reasoning-continuation'
					);
					IF fact_backed <> (optional_authority ? 'runtimeFactSourceAuthority') THEN
						RAISE EXCEPTION 'evaluation plan runtime fact source authority presence drifted from fact-backed capability'
							USING ERRCODE = '23514';
					END IF;
					IF NOT fact_backed THEN
						CONTINUE;
					END IF;
					runtime_authority := optional_authority->'runtimeFactSourceAuthority';
					IF jsonb_typeof(runtime_authority) <> 'object'
						OR NOT (runtime_authority ?& ARRAY[
							'kind','sourceKind','sourceAuthorityId',
							'sourceAuthorityImplementationDigest','routeBinding',
							'capabilityProfileId','capabilityProfileDigest','capabilityId',
							'protocolFamily','providerConfigurationId','modelId',
							'modelLineageDigest','adapterDigest','registrationAuthorityIssuerId',
							'registrationReceiptDigest','authorityDigest'
						])
						OR (SELECT COUNT(*) FROM jsonb_object_keys(runtime_authority)) <> 16
						OR runtime_authority->>'kind' <> 'shared-durable-capability'
						OR runtime_authority->>'authorityDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR runtime_authority->>'capabilityProfileId' <>
							target->>'capabilityProfileId'
						OR runtime_authority->>'capabilityProfileDigest' <>
							target->>'capabilityProfileDigest'
						OR runtime_authority->>'capabilityId' <>
							target#>>'{optionalCapabilitySupportAuthority,capabilityId}'
						OR runtime_authority->>'protocolFamily' <> target->>'protocolFamily'
						OR runtime_authority->>'providerConfigurationId' <>
							target->>'providerConfigurationId'
						OR runtime_authority->>'modelId' <> target->>'modelId'
						OR runtime_authority->>'modelLineageDigest' <>
							target->>'modelLineageDigest'
						OR NOT EXISTS (
							SELECT 1
							FROM agent_evaluation_runtime_fact_source_owner_registrations registration
							WHERE registration.namespace_id=NEW.namespace_id
								AND registration.repository_commit=NEW.repository_commit
								AND registration.state='sealed' AND registration.v45_eligible
								AND registration.registration_receipt_digest=
									runtime_authority->>'registrationReceiptDigest'
								AND registration.source_authority_kind=runtime_authority->>'kind'
								AND registration.source_kind=runtime_authority->>'sourceKind'
								AND registration.source_authority_id=
									runtime_authority->>'sourceAuthorityId'
								AND registration.source_authority_implementation_digest=
									runtime_authority->>'sourceAuthorityImplementationDigest'
								AND registration.route_binding=runtime_authority->>'routeBinding'
								AND registration.capability_profile_id=
									runtime_authority->>'capabilityProfileId'
								AND registration.capability_profile_digest=
									runtime_authority->>'capabilityProfileDigest'
								AND registration.capability_id=runtime_authority->>'capabilityId'
								AND registration.protocol_family=runtime_authority->>'protocolFamily'
								AND registration.provider_configuration_id=
									runtime_authority->>'providerConfigurationId'
								AND registration.model_id=runtime_authority->>'modelId'
								AND registration.model_lineage_digest=
									runtime_authority->>'modelLineageDigest'
								AND registration.adapter_digest=runtime_authority->>'adapterDigest'
								AND registration.registration_authority_issuer_id=
									runtime_authority->>'registrationAuthorityIssuerId'
								AND registration.minimum_expires_at>=NEW.expires_at
								AND registration.registered_at <= NEW.planned_at
								AND registration.expires_at >= NEW.expires_at
						) THEN
						RAISE EXCEPTION 'evaluation plan runtime fact source authority lacks exact sealed registration'
							USING ERRCODE = '23514';
					END IF;
				END LOOP;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_plans_runtime_fact_source_registrations_required
				AFTER INSERT ON agent_evaluation_plans
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_plan_runtime_fact_source_registrations()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_admissions (
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
				qualification_capability_profile_id TEXT NOT NULL,
				qualification_capability_profile_digest TEXT NOT NULL,
				capability_id TEXT NOT NULL,
				declared_capability_profile_set_digest TEXT NOT NULL,
				minimum_expires_at TIMESTAMPTZ NOT NULL,
				adapter_digest TEXT NOT NULL,
				owner_implementation_digest TEXT NOT NULL,
				stage_digest TEXT,
				dispatch_ack_digest TEXT,
				authority_issuer_id TEXT,
				owner_admission_digest TEXT,
				reference_receipt_set_digest TEXT,
				evidence_digest TEXT,
				probe_receipt_digest TEXT,
				probe_status TEXT,
				observed_profile_digest TEXT,
				probed_at TIMESTAMPTZ,
				expires_at TIMESTAMPTZ,
				admission_receipt_digest TEXT,
				response_digest TEXT,
				request_json JSONB NOT NULL,
				request_bytes BYTEA NOT NULL,
				reference_bundle_json JSONB,
				reference_bundle_bytes BYTEA,
				response_json JSONB,
				response_bytes BYTEA,
				claimed_at TIMESTAMPTZ NOT NULL,
				dispatched_at TIMESTAMPTZ,
				sealed_at TIMESTAMPTZ,
				PRIMARY KEY (namespace_id, repository_commit, request_digest),
				UNIQUE (namespace_id, repository_commit, evidence_digest),
				UNIQUE (
					namespace_id, repository_commit, request_digest, evidence_digest
				),
				CONSTRAINT agent_eval_capability_probe_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND state IN ('claimed', 'dispatched', 'sealed')
					AND claim_generation=1
					AND protocol_family IN (
						'openai-responses', 'anthropic-messages', 'gemini-interactions'
					)
				),
				CONSTRAINT agent_eval_capability_probe_digest_check CHECK (
					request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_configuration_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND qualification_capability_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND declared_capability_profile_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND owner_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (stage_digest IS NULL OR stage_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (dispatch_ack_digest IS NULL
						OR dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (owner_admission_digest IS NULL
						OR owner_admission_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (reference_receipt_set_digest IS NULL
						OR reference_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (evidence_digest IS NULL OR evidence_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (probe_receipt_digest IS NULL
						OR probe_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (observed_profile_digest IS NULL
						OR observed_profile_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (admission_receipt_digest IS NULL
						OR admission_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (response_digest IS NULL OR response_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_eval_capability_probe_lifecycle_check CHECK (
					(state='claimed'
						AND stage_digest IS NULL AND dispatch_ack_digest IS NULL
						AND authority_issuer_id IS NULL AND owner_admission_digest IS NULL
						AND reference_receipt_set_digest IS NULL AND evidence_digest IS NULL
						AND probe_receipt_digest IS NULL AND probe_status IS NULL
						AND observed_profile_digest IS NULL AND probed_at IS NULL
						AND expires_at IS NULL AND admission_receipt_digest IS NULL
						AND response_digest IS NULL AND reference_bundle_json IS NULL
						AND reference_bundle_bytes IS NULL AND response_json IS NULL
						AND response_bytes IS NULL AND dispatched_at IS NULL AND sealed_at IS NULL)
					OR (state='dispatched' AND stage_digest IS NOT NULL
						AND dispatched_at IS NOT NULL AND sealed_at IS NULL
						AND ((dispatch_ack_digest IS NULL
							AND authority_issuer_id IS NULL AND owner_admission_digest IS NULL
							AND reference_receipt_set_digest IS NULL AND evidence_digest IS NULL
							AND probe_receipt_digest IS NULL AND probe_status IS NULL
							AND observed_profile_digest IS NULL AND probed_at IS NULL
							AND expires_at IS NULL AND admission_receipt_digest IS NULL
							AND response_digest IS NULL AND reference_bundle_json IS NULL
							AND reference_bundle_bytes IS NULL AND response_json IS NULL
							AND response_bytes IS NULL)
						OR (dispatch_ack_digest IS NOT NULL AND authority_issuer_id IS NOT NULL
							AND owner_admission_digest IS NOT NULL
							AND reference_receipt_set_digest IS NOT NULL
							AND evidence_digest IS NOT NULL AND probe_receipt_digest IS NOT NULL
							AND probe_status IN ('supported','unsupported')
							AND probed_at IS NOT NULL AND expires_at IS NOT NULL
							AND admission_receipt_digest IS NOT NULL AND response_digest IS NOT NULL
							AND reference_bundle_json IS NOT NULL
							AND reference_bundle_bytes IS NOT NULL
							AND response_json IS NOT NULL AND response_bytes IS NOT NULL)))
					OR (state='sealed' AND stage_digest IS NOT NULL
						AND dispatch_ack_digest IS NOT NULL AND authority_issuer_id IS NOT NULL
						AND owner_admission_digest IS NOT NULL
						AND reference_receipt_set_digest IS NOT NULL AND evidence_digest IS NOT NULL
						AND probe_receipt_digest IS NOT NULL
						AND probe_status IN ('supported','unsupported')
						AND probed_at IS NOT NULL AND expires_at IS NOT NULL
						AND admission_receipt_digest IS NOT NULL AND response_digest IS NOT NULL
						AND reference_bundle_json IS NOT NULL AND reference_bundle_bytes IS NOT NULL
						AND response_json IS NOT NULL AND response_bytes IS NOT NULL
						AND dispatched_at IS NOT NULL AND sealed_at IS NOT NULL)
				),
				CONSTRAINT agent_eval_capability_probe_status_check CHECK (
					probe_status IS NULL
					OR (probe_status='supported'
						AND observed_profile_digest=qualification_capability_profile_digest)
					OR (probe_status='unsupported' AND observed_profile_digest IS NULL)
				),
				CONSTRAINT agent_eval_capability_probe_time_check CHECK (
					minimum_expires_at >= claimed_at
					AND (dispatched_at IS NULL OR dispatched_at >= claimed_at)
					AND (probed_at IS NULL OR expires_at > probed_at)
					AND (expires_at IS NULL OR expires_at >= minimum_expires_at)
					AND (sealed_at IS NULL OR sealed_at >= dispatched_at)
				),
				CONSTRAINT agent_eval_capability_probe_bytes_check CHECK (
					octet_length(request_bytes) BETWEEN 1 AND 1048576
					AND (reference_bundle_bytes IS NULL
						OR octet_length(reference_bundle_bytes) BETWEEN 1 AND 1048576)
					AND (response_bytes IS NULL
						OR octet_length(response_bytes) BETWEEN 1 AND 262144)
					AND request_json=convert_from(request_bytes,'UTF8')::jsonb
					AND (reference_bundle_json IS NULL)=(reference_bundle_bytes IS NULL)
					AND (reference_bundle_json IS NULL OR reference_bundle_json=
						convert_from(reference_bundle_bytes,'UTF8')::jsonb)
					AND (response_json IS NULL)=(response_bytes IS NULL)
					AND (response_json IS NULL OR response_json=
						convert_from(response_bytes,'UTF8')::jsonb)
				),
				CONSTRAINT agent_eval_capability_probe_request_binding_check CHECK (COALESCE((
					request_json->>'format'=
						'prodivix.agent-evaluation-capability-probe-admission-request'
					AND (request_json->>'version')::bigint=1
					AND request_json->>'namespaceId'=namespace_id
					AND request_json->>'repositoryCommit'=repository_commit
					AND request_json#>>'{providerConfiguration,providerConfigurationId}'=
						provider_configuration_id
					AND request_json#>>'{providerConfiguration,adapter,protocolFamily}'=
						protocol_family
					AND request_json#>>'{providerConfiguration,adapter,adapterDigest}'=adapter_digest
					AND request_json#>>'{modelLineage,modelId}'=model_id
					AND request_json#>>'{modelLineage,lineageDigest}'=model_lineage_digest
					AND request_json->>'qualificationCapabilityProfileId'=
						qualification_capability_profile_id
					AND request_json->>'qualificationCapabilityProfileDigest'=
						qualification_capability_profile_digest
					AND request_json->>'capabilityId'=capability_id
					AND jsonb_typeof(request_json->'probeProgram')='object'
					AND request_json#>>'{probeProgram,profileProjection,capabilityProfileId}'=
						qualification_capability_profile_id
					AND request_json#>>'{probeProgram,profileProjection,capabilityProfileDigest}'=
						qualification_capability_profile_digest
					AND request_json#>>'{probeProgram,profileProjection,capabilityId}'=capability_id
					AND jsonb_typeof(
						request_json#>'{probeProgram,providerRequestIntent,requestPhases}'
					)='array'
					AND jsonb_array_length(
						request_json#>'{probeProgram,providerRequestIntent,requestPhases}'
					)>0
					AND (request_json#>>'{probeProgram,hardLimits,maximumResponseBytes}')::bigint
						BETWEEN 1 AND 262144
					AND (request_json->>'minimumExpiresAt')::timestamptz=minimum_expires_at
					AND request_json->>'requestDigest'=request_digest
					AND jsonb_typeof(request_json->'declaredCapabilityProfileDigests')='array'
					AND jsonb_array_length(request_json->'declaredCapabilityProfileDigests') > 0
				), FALSE))
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_response_spools (
				namespace_id TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				admission_request_digest TEXT NOT NULL,
				phase TEXT NOT NULL,
				sequence BIGINT NOT NULL,
				spool_ref TEXT NOT NULL,
				response_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				envelope_digest TEXT NOT NULL,
				ciphertext_digest TEXT NOT NULL,
				ciphertext_bytes BYTEA NOT NULL,
				ciphertext_byte_length BIGINT NOT NULL,
				aad_digest TEXT NOT NULL,
				encryption_profile_digest TEXT NOT NULL,
				key_ref_digest TEXT NOT NULL,
				spooled_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (
					namespace_id, repository_commit, admission_request_digest, phase, sequence
				),
				UNIQUE (namespace_id, repository_commit, spool_ref),
				UNIQUE (namespace_id, repository_commit, envelope_digest),
				FOREIGN KEY (namespace_id, repository_commit, admission_request_digest)
					REFERENCES agent_evaluation_capability_probe_admissions(
						namespace_id, repository_commit, request_digest
					) ON DELETE RESTRICT,
				CONSTRAINT agent_eval_capability_probe_response_spool_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND sequence >= 0
					AND phase ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND spool_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				),
				CONSTRAINT agent_eval_capability_probe_response_spool_digest_check CHECK (
					admission_request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND envelope_digest ~ '^sha256-[a-f0-9]{64}$'
					AND ciphertext_digest ~ '^sha256-[a-f0-9]{64}$'
					AND aad_digest ~ '^sha256-[a-f0-9]{64}$'
					AND encryption_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND key_ref_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_eval_capability_probe_response_spool_bytes_check CHECK (
					ciphertext_byte_length=octet_length(ciphertext_bytes)
					AND ciphertext_byte_length BETWEEN 1 AND 262144
				),
				CONSTRAINT agent_eval_capability_probe_response_spool_time_check CHECK (
					expires_at > spooled_at
				)
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_probe_response_spool_binding()
				RETURNS trigger AS $$
			DECLARE
				parent_state TEXT;
				parent_stage_digest TEXT;
				parent_dispatch_ack_digest TEXT;
				parent_minimum_expires_at TIMESTAMPTZ;
				parent_dispatched_at TIMESTAMPTZ;
				parent_request_json JSONB;
				expected_phase TEXT;
				maximum_response_bytes BIGINT;
			BEGIN
				SELECT state,stage_digest,dispatch_ack_digest,minimum_expires_at,
					dispatched_at,request_json
				INTO parent_state,parent_stage_digest,parent_dispatch_ack_digest,
					parent_minimum_expires_at,parent_dispatched_at,parent_request_json
				FROM agent_evaluation_capability_probe_admissions
				WHERE namespace_id=NEW.namespace_id
					AND repository_commit=NEW.repository_commit
					AND request_digest=NEW.admission_request_digest
				FOR SHARE;
				IF NOT FOUND OR parent_state<>'dispatched' OR parent_stage_digest IS NULL
					OR parent_dispatch_ack_digest IS NOT NULL OR parent_dispatched_at IS NULL THEN
					RAISE EXCEPTION 'capability probe response spool lacks pre-acknowledgement parent'
						USING ERRCODE = '23514';
				END IF;
				SELECT phase_value INTO expected_phase
				FROM jsonb_array_elements_text(
					parent_request_json#>'{probeProgram,providerRequestIntent,requestPhases}'
				) WITH ORDINALITY phases(phase_value, phase_ordinal)
				WHERE phases.phase_ordinal-1=NEW.sequence;
				maximum_response_bytes :=
					(parent_request_json#>>'{probeProgram,hardLimits,maximumResponseBytes}')::bigint;
				IF expected_phase IS NULL OR expected_phase<>NEW.phase
					OR maximum_response_bytes IS NULL OR maximum_response_bytes<1
					OR NEW.ciphertext_byte_length>maximum_response_bytes
					OR NEW.spooled_at<parent_dispatched_at
					OR NEW.expires_at<parent_minimum_expires_at THEN
					RAISE EXCEPTION 'capability probe response spool drifted from its frozen program'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_capability_probe_response_spools_parent_required
				AFTER INSERT ON agent_evaluation_capability_probe_response_spools
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_probe_response_spool_binding()`,
			`CREATE TRIGGER agent_evaluation_capability_probe_response_spools_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_capability_probe_response_spools
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_probe_reference_receipts (
				namespace_id TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				ordinal SMALLINT NOT NULL,
				kind TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				source_receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, repository_commit, request_digest, kind),
				UNIQUE (namespace_id, repository_commit, request_digest, ordinal),
				UNIQUE (namespace_id, repository_commit, request_digest, receipt_digest),
				FOREIGN KEY (namespace_id, repository_commit, request_digest)
					REFERENCES agent_evaluation_capability_probe_admissions(
						namespace_id, repository_commit, request_digest
					) ON DELETE RESTRICT,
				CONSTRAINT agent_eval_capability_probe_reference_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND ((ordinal=0 AND kind='probe-request')
						OR (ordinal=1 AND kind='probe-response')
						OR (ordinal=2 AND kind='dispatch')
						OR (ordinal=3 AND kind='transport')
						OR (ordinal=4 AND kind='encrypted-response-spool')
						OR (ordinal=5 AND kind='normalized-event-set'))
				),
				CONSTRAINT agent_eval_capability_probe_reference_bytes_check CHECK (
					octet_length(receipt_bytes) BETWEEN 1 AND 1048576
					AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb
					AND (receipt_json->>'version')::bigint=1
					AND receipt_json->>'admissionRequestDigest'=request_digest
					AND receipt_json->>'sourceReceiptDigest'=source_receipt_digest
					AND (receipt_json->>'observedAt')::timestamptz <= created_at
					AND receipt_json->>'format'=CASE ordinal
						WHEN 0 THEN 'prodivix.agent-evaluation-capability-probe-request'
						WHEN 1 THEN 'prodivix.agent-evaluation-capability-probe-response'
						WHEN 2 THEN 'prodivix.agent-evaluation-capability-probe-dispatch-receipt'
						WHEN 3 THEN 'prodivix.agent-evaluation-capability-probe-transport-receipt'
						WHEN 4 THEN 'prodivix.agent-evaluation-capability-probe-encrypted-response-spool-receipt'
						WHEN 5 THEN 'prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt'
					END
				)
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_plan_capability_probe_admission_links (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				target_id TEXT NOT NULL,
				target_digest TEXT NOT NULL,
				authority_digest TEXT NOT NULL,
				evidence_digest TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, target_id),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, repository_commit, request_digest, evidence_digest
				) REFERENCES agent_evaluation_capability_probe_admissions(
					namespace_id, repository_commit, request_digest, evidence_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_eval_plan_capability_probe_link_digest_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND evidence_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_probe_reference_binding()
				RETURNS trigger AS $$
			DECLARE
				parent_owner_implementation_digest TEXT;
				parent_provider_configuration_digest TEXT;
				parent_model_lineage_digest TEXT;
				parent_profile_digest TEXT;
				parent_capability_id TEXT;
				parent_adapter_digest TEXT;
				parent_request_json JSONB;
				parent_probe_program_digest TEXT;
				parent_profile_projection_digest TEXT;
				parent_stage_digest TEXT;
				parent_state TEXT;
				parent_dispatch_ack_digest TEXT;
				previous_digest TEXT;
				source_receipt JSONB;
				spool_entry JSONB;
				spool_ordinal BIGINT;
				expected_phase TEXT;
				expected_spool_count BIGINT;
				stored_spool_count BIGINT;
			BEGIN
				SELECT owner_implementation_digest, provider_configuration_digest,
					model_lineage_digest, qualification_capability_profile_digest,
					capability_id, adapter_digest, request_json,
					request_json#>>'{probeProgram,programDigest}',
					request_json#>>'{probeProgram,profileProjectionDigest}',
					stage_digest, state, dispatch_ack_digest
				INTO parent_owner_implementation_digest, parent_provider_configuration_digest,
					parent_model_lineage_digest, parent_profile_digest, parent_capability_id,
					parent_adapter_digest, parent_request_json, parent_probe_program_digest,
					parent_profile_projection_digest, parent_stage_digest, parent_state,
					parent_dispatch_ack_digest
				FROM agent_evaluation_capability_probe_admissions
				WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
					AND request_digest=NEW.request_digest
				FOR SHARE;
				IF NOT FOUND OR parent_state <> 'dispatched' OR parent_stage_digest IS NULL
					OR parent_dispatch_ack_digest IS NOT NULL
					OR jsonb_typeof(NEW.receipt_json) <> 'object'
					OR NOT (NEW.receipt_json ?& ARRAY[
						'format','version','admissionRequestDigest','providerConfigurationDigest',
						'modelLineageDigest','qualificationCapabilityProfileDigest','capabilityId',
						'probeProgramDigest','profileProjectionDigest',
						'adapterDigest','ownerImplementationDigest','authorityIssuerId',
						'previousReceiptDigest','observedAt','sourceReceipt','sourceReceiptDigest'
					])
					OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.receipt_json)) <> 16
					OR NEW.receipt_json->>'providerConfigurationDigest' <>
						parent_provider_configuration_digest
					OR NEW.receipt_json->>'modelLineageDigest' <> parent_model_lineage_digest
					OR NEW.receipt_json->>'qualificationCapabilityProfileDigest' <>
						parent_profile_digest
					OR NEW.receipt_json->>'capabilityId' <> parent_capability_id
					OR NEW.receipt_json->>'probeProgramDigest' <> parent_probe_program_digest
					OR NEW.receipt_json->>'profileProjectionDigest' <>
						parent_profile_projection_digest
					OR NEW.receipt_json->>'adapterDigest' <> parent_adapter_digest
					OR NEW.receipt_json->>'ownerImplementationDigest' <>
						parent_owner_implementation_digest THEN
					RAISE EXCEPTION 'capability probe reference receipt drifted from claimed request'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.ordinal=0 THEN
					IF NEW.receipt_json->'previousReceiptDigest' IS DISTINCT FROM 'null'::jsonb THEN
						RAISE EXCEPTION 'first capability probe reference has a predecessor'
							USING ERRCODE = '23514';
					END IF;
				ELSE
					SELECT receipt_digest INTO previous_digest
					FROM agent_evaluation_capability_probe_reference_receipts
					WHERE namespace_id=NEW.namespace_id AND repository_commit=NEW.repository_commit
						AND request_digest=NEW.request_digest AND ordinal=NEW.ordinal-1
					FOR SHARE;
					IF NOT FOUND OR NEW.receipt_json->>'previousReceiptDigest' <> previous_digest THEN
						RAISE EXCEPTION 'capability probe reference receipt chain is broken'
							USING ERRCODE = '23514';
					END IF;
				END IF;
				IF NEW.ordinal=4 THEN
					source_receipt := NEW.receipt_json->'sourceReceipt';
					IF jsonb_typeof(source_receipt)<>'object'
						OR NOT (source_receipt ?& ARRAY[
							'format','version','admissionRequestDigest','probeProgramDigest',
							'profileProjectionDigest','providerConfigurationDigest',
							'modelLineageDigest','adapterDigest','ownerImplementationDigest',
							'authorityIssuerId','observedAt','encryptionPolicyDigest',
							'spoolReceipts','spoolReceiptSetDigest'
						])
						OR (SELECT COUNT(*) FROM jsonb_object_keys(source_receipt))<>14
						OR source_receipt->>'format'<>
							'prodivix.agent-evaluation-capability-probe-encrypted-response-spool-source-receipt'
						OR (source_receipt->>'version')::bigint<>1
						OR source_receipt->>'admissionRequestDigest'<>NEW.request_digest
						OR source_receipt->>'probeProgramDigest'<>parent_probe_program_digest
						OR source_receipt->>'profileProjectionDigest'<>
							parent_profile_projection_digest
						OR source_receipt->>'providerConfigurationDigest'<>
							parent_provider_configuration_digest
						OR source_receipt->>'modelLineageDigest'<>parent_model_lineage_digest
						OR source_receipt->>'adapterDigest'<>parent_adapter_digest
						OR source_receipt->>'ownerImplementationDigest'<>
							parent_owner_implementation_digest
						OR source_receipt->>'authorityIssuerId'<>
							NEW.receipt_json->>'authorityIssuerId'
						OR source_receipt->>'observedAt'<>NEW.receipt_json->>'observedAt'
						OR source_receipt->>'encryptionPolicyDigest' IS NULL
						OR source_receipt->>'encryptionPolicyDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR source_receipt->>'spoolReceiptSetDigest' IS NULL
						OR source_receipt->>'spoolReceiptSetDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR jsonb_typeof(source_receipt->'spoolReceipts')<>'array' THEN
						RAISE EXCEPTION 'capability probe encrypted spool source receipt is invalid'
							USING ERRCODE = '23514';
					END IF;
					expected_spool_count := jsonb_array_length(
						parent_request_json#>'{probeProgram,providerRequestIntent,requestPhases}'
					);
					IF jsonb_array_length(source_receipt->'spoolReceipts')<>expected_spool_count THEN
						RAISE EXCEPTION 'capability probe encrypted spool phase set is incomplete'
							USING ERRCODE = '23514';
					END IF;
					FOR spool_entry, spool_ordinal IN SELECT value,entries.entry_ordinal-1
						FROM jsonb_array_elements(source_receipt->'spoolReceipts') WITH ORDINALITY
							entries(value, entry_ordinal)
						ORDER BY entries.entry_ordinal
					LOOP
						IF jsonb_typeof(spool_entry)<>'object'
							OR NOT (spool_entry ?& ARRAY[
								'phase','sequence','transportReceiptDigest','responseDigest',
								'spoolRef','envelopeDigest','ciphertextDigest',
								'ciphertextByteLength','aadDigest','encryptionProfileDigest',
								'keyRefDigest','spoolReceiptDigest'
							])
							OR (SELECT COUNT(*) FROM jsonb_object_keys(spool_entry))<>12
							OR spool_entry->>'spoolReceiptDigest' IS NULL
							OR spool_entry->>'spoolReceiptDigest' !~ '^sha256-[a-f0-9]{64}$'
							OR (spool_entry->>'sequence')::bigint<>spool_ordinal THEN
							RAISE EXCEPTION 'capability probe encrypted spool entry is invalid'
								USING ERRCODE = '23514';
						END IF;
						SELECT phase_value INTO expected_phase
						FROM jsonb_array_elements_text(
							parent_request_json#>'{probeProgram,providerRequestIntent,requestPhases}'
						) WITH ORDINALITY phases(phase_value, phase_ordinal)
						WHERE phases.phase_ordinal-1=(spool_entry->>'sequence')::bigint;
						IF expected_phase IS NULL OR expected_phase<>spool_entry->>'phase'
							OR NOT EXISTS (
								SELECT 1 FROM agent_evaluation_capability_probe_response_spools spool
								WHERE spool.namespace_id=NEW.namespace_id
									AND spool.repository_commit=NEW.repository_commit
									AND spool.admission_request_digest=NEW.request_digest
									AND spool.phase=spool_entry->>'phase'
									AND spool.sequence=(spool_entry->>'sequence')::bigint
									AND spool.transport_receipt_digest=
										spool_entry->>'transportReceiptDigest'
									AND spool.response_digest=spool_entry->>'responseDigest'
									AND spool.spool_ref=spool_entry->>'spoolRef'
									AND spool.envelope_digest=spool_entry->>'envelopeDigest'
									AND spool.ciphertext_digest=spool_entry->>'ciphertextDigest'
									AND spool.ciphertext_byte_length=
										(spool_entry->>'ciphertextByteLength')::bigint
									AND spool.ciphertext_byte_length=octet_length(spool.ciphertext_bytes)
									AND spool.aad_digest=spool_entry->>'aadDigest'
									AND spool.encryption_profile_digest=
										spool_entry->>'encryptionProfileDigest'
									AND spool.key_ref_digest=spool_entry->>'keyRefDigest'
								FOR SHARE
							) THEN
							RAISE EXCEPTION 'capability probe encrypted spool entry lacks durable ciphertext'
								USING ERRCODE = '23514';
						END IF;
					END LOOP;
					SELECT COUNT(*) INTO stored_spool_count
					FROM agent_evaluation_capability_probe_response_spools spool
					WHERE spool.namespace_id=NEW.namespace_id
						AND spool.repository_commit=NEW.repository_commit
						AND spool.admission_request_digest=NEW.request_digest;
					IF stored_spool_count<>expected_spool_count THEN
						RAISE EXCEPTION 'capability probe encrypted spool durable set is incomplete'
							USING ERRCODE = '23514';
					END IF;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_capability_probe_references_exact_binding
				BEFORE INSERT ON agent_evaluation_capability_probe_reference_receipts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_probe_reference_binding()`,
			`CREATE TRIGGER agent_evaluation_capability_probe_references_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_capability_probe_reference_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_capability_probe_reference_set()
				RETURNS trigger AS $$
			DECLARE
				reference_count BIGINT;
			BEGIN
				SELECT COUNT(*) INTO reference_count
				FROM agent_evaluation_capability_probe_reference_receipts reference
				WHERE reference.namespace_id=NEW.namespace_id
					AND reference.repository_commit=NEW.repository_commit
					AND reference.request_digest=NEW.request_digest;
				IF NEW.dispatch_ack_digest IS NULL THEN
					IF reference_count <> 0 THEN
						RAISE EXCEPTION 'unacknowledged capability probe admission has reference receipts'
							USING ERRCODE = '23514';
					END IF;
					RETURN NEW;
				END IF;
				IF reference_count <> 6 OR EXISTS (
					SELECT 1
					FROM generate_series(0,5) AS expected_ordinal(ordinal)
					LEFT JOIN agent_evaluation_capability_probe_reference_receipts reference
					  ON reference.namespace_id=NEW.namespace_id
					 AND reference.repository_commit=NEW.repository_commit
					 AND reference.request_digest=NEW.request_digest
					 AND reference.ordinal=expected_ordinal.ordinal
					WHERE reference.ordinal IS NULL
						OR NEW.reference_bundle_json->expected_ordinal.ordinal->>'kind' <> reference.kind
						OR NEW.reference_bundle_json->expected_ordinal.ordinal->>'receiptDigest' <> reference.receipt_digest
						OR NEW.reference_bundle_json->expected_ordinal.ordinal->'receipt' <> reference.receipt_json
						OR reference.receipt_json->>'authorityIssuerId' <> NEW.authority_issuer_id
				) THEN
					RAISE EXCEPTION 'capability probe admission lacks its exact six durable references'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_capability_probe_references_required
				AFTER INSERT OR UPDATE ON agent_evaluation_capability_probe_admissions
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_capability_probe_reference_set()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_capability_probe_reference_parent()
				RETURNS trigger AS $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_capability_probe_admissions admission
					WHERE admission.namespace_id=NEW.namespace_id
						AND admission.repository_commit=NEW.repository_commit
						AND admission.request_digest=NEW.request_digest
						AND admission.state='dispatched'
						AND admission.stage_digest IS NOT NULL
						AND admission.dispatch_ack_digest IS NULL
				) THEN
					RAISE EXCEPTION 'capability probe reference receipts lack their dispatched admission'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_capability_probe_reference_parent_required
				AFTER INSERT ON agent_evaluation_capability_probe_reference_receipts
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_capability_probe_reference_parent()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_probe_admission_transition()
				RETURNS trigger AS $$
			DECLARE
				probe_evidence JSONB;
				probe_receipt JSONB;
				reference_entry JSONB;
				reference_index BIGINT := 0;
				expected_kind TEXT;
				expected_digest TEXT;
			BEGIN
				IF TG_OP='DELETE' THEN
					RAISE EXCEPTION 'capability probe admission is immutable'
						USING ERRCODE = '23514';
				END IF;
				IF jsonb_typeof(NEW.request_json) <> 'object'
					OR NOT (NEW.request_json ?& ARRAY[
						'format','version','namespaceId','repositoryCommit','providerConfiguration',
						'modelLineage','qualificationCapabilityProfileId',
						'qualificationCapabilityProfileDigest','capabilityId',
						'declaredCapabilityProfileDigests','probeProgram',
						'probeProviderResourceAuthority','minimumExpiresAt','requestDigest'
					])
					OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.request_json)) <> 14 THEN
					RAISE EXCEPTION 'capability probe admission request shape is invalid'
						USING ERRCODE = '23514';
				END IF;
				IF TG_OP='INSERT' THEN
					IF NEW.state <> 'claimed' THEN
						RAISE EXCEPTION 'capability probe admission must start claimed'
							USING ERRCODE = '23514';
					END IF;
				ELSIF OLD.state='claimed' AND NEW.state='dispatched' THEN
					IF (to_jsonb(OLD) - ARRAY['state','stage_digest','dispatched_at'])
						IS DISTINCT FROM
						(to_jsonb(NEW) - ARRAY['state','stage_digest','dispatched_at']) THEN
						RAISE EXCEPTION 'capability probe dispatch changed immutable admission fields'
							USING ERRCODE = '23514';
					END IF;
				ELSIF OLD.state='dispatched' AND NEW.state='dispatched' THEN
					IF OLD.dispatch_ack_digest IS NOT NULL
						OR (to_jsonb(OLD) - ARRAY[
							'dispatch_ack_digest','authority_issuer_id','owner_admission_digest',
							'reference_receipt_set_digest','evidence_digest','probe_receipt_digest',
							'probe_status','observed_profile_digest','probed_at','expires_at',
							'admission_receipt_digest','response_digest','reference_bundle_json',
							'reference_bundle_bytes','response_json','response_bytes'
						]) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY[
							'dispatch_ack_digest','authority_issuer_id','owner_admission_digest',
							'reference_receipt_set_digest','evidence_digest','probe_receipt_digest',
							'probe_status','observed_profile_digest','probed_at','expires_at',
							'admission_receipt_digest','response_digest','reference_bundle_json',
							'reference_bundle_bytes','response_json','response_bytes'
						]) THEN
						RAISE EXCEPTION 'capability probe acknowledgement changed immutable dispatch fields'
							USING ERRCODE = '23514';
					END IF;
				ELSIF OLD.state='dispatched' AND NEW.state='sealed' THEN
					IF OLD.dispatch_ack_digest IS NULL
						OR (to_jsonb(OLD) - 'state' - 'sealed_at') IS DISTINCT FROM
							(to_jsonb(NEW) - 'state' - 'sealed_at') THEN
						RAISE EXCEPTION 'capability probe seal drifted from acknowledged evidence'
							USING ERRCODE = '23514';
					END IF;
				ELSE
					RAISE EXCEPTION 'capability probe admission transition is invalid'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.dispatch_ack_digest IS NOT NULL THEN
					IF jsonb_typeof(NEW.response_json) <> 'object'
						OR NOT (NEW.response_json ?& ARRAY[
							'format','version','requestDigest','probeEvidence','ownerImplementationDigest',
							'ownerAdmissionDigest','stageDigest','dispatchAckDigest',
							'admissionReceiptDigest'
						])
						OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.response_json)) <> 9
						OR NEW.response_json->>'format' <>
							'prodivix.agent-evaluation-capability-probe-admission-response'
						OR (NEW.response_json->>'version')::bigint <> 1
						OR NEW.response_json->>'requestDigest' <> NEW.request_digest
						OR NEW.response_json->>'ownerImplementationDigest' <>
							NEW.owner_implementation_digest
						OR NEW.response_json->>'ownerAdmissionDigest' <> NEW.owner_admission_digest
						OR NEW.response_json->>'stageDigest' <> NEW.stage_digest
						OR NEW.response_json->>'dispatchAckDigest' <> NEW.dispatch_ack_digest
						OR NEW.response_json->>'admissionReceiptDigest' <>
							NEW.admission_receipt_digest THEN
						RAISE EXCEPTION 'capability probe admission response binding drifted'
							USING ERRCODE = '23514';
					END IF;
					probe_evidence := NEW.response_json->'probeEvidence';
					probe_receipt := probe_evidence->'receipt';
					IF jsonb_typeof(probe_evidence) <> 'object'
						OR jsonb_typeof(probe_receipt) <> 'object'
						OR probe_evidence->>'authorityKind' <> 'sealed-provider-capability-probe'
						OR probe_evidence->>'authorityIssuerId' <> NEW.authority_issuer_id
						OR probe_evidence->>'ownerImplementationDigest' <>
							NEW.owner_implementation_digest
						OR probe_evidence->>'adapterDigest' <> NEW.adapter_digest
						OR probe_evidence->>'evidenceDigest' <> NEW.evidence_digest
						OR probe_receipt->>'providerConfigurationDigest' <>
							NEW.provider_configuration_digest
						OR probe_receipt->>'modelLineageDigest' <> NEW.model_lineage_digest
						OR probe_receipt->>'requestedProfileDigest' <>
							NEW.qualification_capability_profile_digest
						OR probe_receipt->>'declaredCapabilityDigest' <>
							NEW.declared_capability_profile_set_digest
						OR probe_receipt->>'status' <> NEW.probe_status
						OR probe_receipt->>'receiptDigest' <> NEW.probe_receipt_digest
						OR NULLIF(probe_receipt->>'observedProfileDigest','') IS DISTINCT FROM
							NEW.observed_profile_digest
						OR (probe_receipt->>'probedAt')::timestamptz IS DISTINCT FROM NEW.probed_at
						OR (probe_receipt->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at THEN
						RAISE EXCEPTION 'capability probe evidence drifted from admission authority'
							USING ERRCODE = '23514';
					END IF;
					IF jsonb_typeof(NEW.reference_bundle_json) <> 'array'
						OR jsonb_array_length(NEW.reference_bundle_json) <> 6 THEN
						RAISE EXCEPTION 'capability probe reference bundle is incomplete'
							USING ERRCODE = '23514';
					END IF;
					FOR reference_entry IN SELECT value FROM jsonb_array_elements(NEW.reference_bundle_json)
					LOOP
						expected_kind := (ARRAY[
							'probe-request','probe-response','dispatch','transport',
							'encrypted-response-spool','normalized-event-set'
						])[(reference_index+1)::integer];
						expected_digest := CASE reference_index
							WHEN 0 THEN probe_evidence->>'probeRequestDigest'
							WHEN 1 THEN probe_evidence->>'probeResponseDigest'
							WHEN 2 THEN probe_evidence->>'dispatchReceiptDigest'
							WHEN 3 THEN probe_evidence->>'transportReceiptDigest'
							WHEN 4 THEN probe_evidence->>'responseSpoolDigest'
							WHEN 5 THEN probe_evidence->>'normalizedEventSetDigest'
						END;
						IF jsonb_typeof(reference_entry) <> 'object'
							OR NOT (reference_entry ?& ARRAY['kind','receipt','receiptDigest'])
							OR (SELECT COUNT(*) FROM jsonb_object_keys(reference_entry)) <> 3
							OR reference_entry->>'kind' <> expected_kind
							OR reference_entry->>'receiptDigest' <> expected_digest THEN
							RAISE EXCEPTION 'capability probe reference bundle order or digest drifted'
								USING ERRCODE = '23514';
						END IF;
						reference_index := reference_index + 1;
					END LOOP;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_capability_probe_admissions_transition
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_probe_admissions
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_probe_admission_transition()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_plan_capability_probe_link()
				RETURNS trigger AS $$
			DECLARE
				plan_planned_at TIMESTAMPTZ;
				plan_expires_at TIMESTAMPTZ;
			BEGIN
				SELECT plan.planned_at, plan.expires_at
				INTO plan_planned_at, plan_expires_at
				FROM agent_evaluation_plans plan
				CROSS JOIN LATERAL jsonb_array_elements(
					plan.plan_json#>'{value,capabilityQualificationTargets}'
				) target
				CROSS JOIN LATERAL jsonb_array_elements(
					plan.plan_json#>'{value,providerConfigurations}'
				) provider
				CROSS JOIN LATERAL jsonb_array_elements(
					plan.plan_json#>'{value,modelConfigurations}'
				) model
				JOIN agent_evaluation_capability_probe_admissions admission
				  ON admission.namespace_id=plan.namespace_id
				 AND admission.repository_commit=plan.repository_commit
				 AND admission.request_digest=NEW.request_digest
				 AND admission.evidence_digest=NEW.evidence_digest
				WHERE plan.namespace_id=NEW.namespace_id AND plan.plan_digest=NEW.plan_digest
					AND plan.repository_commit=NEW.repository_commit
					AND target->>'targetId'=NEW.target_id
					AND target->>'targetDigest'=NEW.target_digest
					AND target#>>'{optionalCapabilitySupportAuthority,authorityDigest}'=
						NEW.authority_digest
					AND target#>>'{optionalCapabilitySupportAuthority,probeEvidence,evidenceDigest}'=
						NEW.evidence_digest
					AND admission.state='sealed'
					AND admission.provider_configuration_id=target->>'providerConfigurationId'
					AND admission.provider_configuration_digest=target->>'providerIdentityDigest'
					AND admission.protocol_family=target->>'protocolFamily'
					AND admission.model_id=target->>'modelId'
					AND admission.model_lineage_digest=target->>'modelLineageDigest'
					AND admission.qualification_capability_profile_id=target->>'capabilityProfileId'
					AND admission.qualification_capability_profile_digest=
						target->>'capabilityProfileDigest'
					AND admission.capability_id=
						target#>>'{optionalCapabilitySupportAuthority,capabilityId}'
					AND admission.adapter_digest=
						target#>>'{optionalCapabilitySupportAuthority,probeEvidence,adapterDigest}'
					AND admission.owner_implementation_digest=
						target#>>'{optionalCapabilitySupportAuthority,probeEvidence,ownerImplementationDigest}'
					AND admission.authority_issuer_id=
						target#>>'{optionalCapabilitySupportAuthority,probeEvidence,authorityIssuerId}'
					AND admission.probe_status=CASE
						WHEN target#>>'{optionalCapabilitySupportAuthority,supportExpectation}'='required'
						THEN 'supported' ELSE 'unsupported' END
					AND admission.response_json->'probeEvidence'=
						target#>'{optionalCapabilitySupportAuthority,probeEvidence}'
					AND admission.request_json->'declaredCapabilityProfileDigests'=
						target#>'{optionalCapabilitySupportAuthority,declaredCapabilityProfileDigests}'
					AND admission.minimum_expires_at>=plan.expires_at
					AND provider->>'providerConfigurationId'=admission.provider_configuration_id
					AND provider=admission.request_json->'providerConfiguration'
					AND model->>'modelId'=admission.model_id
					AND model->>'lineageDigest'=admission.model_lineage_digest
					AND model=admission.request_json->'modelLineage'
					AND admission.probed_at <= plan.planned_at
					AND admission.expires_at >= plan.expires_at
				FOR SHARE OF plan, admission;
				IF NOT FOUND OR NEW.created_at IS DISTINCT FROM plan_planned_at THEN
					RAISE EXCEPTION 'evaluation plan optional target lacks exact sealed probe admission'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_plan_capability_probe_links_exact_binding
				BEFORE INSERT ON agent_evaluation_plan_capability_probe_admission_links
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_plan_capability_probe_link()`,
			`CREATE TRIGGER agent_evaluation_plan_capability_probe_links_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_plan_capability_probe_admission_links
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_plan_capability_probe_links_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_plan_capability_probe_admission_links
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE OR REPLACE FUNCTION reject_agent_evaluation_capability_probe_spool_linked_insert()
				RETURNS trigger AS $$
			BEGIN
				IF EXISTS (
					SELECT 1 FROM agent_evaluation_plan_capability_probe_admission_links link
					WHERE link.namespace_id=NEW.namespace_id
						AND link.repository_commit=NEW.repository_commit
						AND link.request_digest=NEW.admission_request_digest
				) THEN
					RAISE EXCEPTION 'plan-linked capability probe response spool is immutable'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_capability_probe_response_spools_linked_insert
				BEFORE INSERT ON agent_evaluation_capability_probe_response_spools
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_capability_probe_spool_linked_insert()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_plan_capability_probe_links()
				RETURNS trigger AS $$
			DECLARE
				expected_count BIGINT;
				actual_count BIGINT;
			BEGIN
				SELECT COUNT(*) INTO expected_count
				FROM jsonb_array_elements(NEW.plan_json#>'{value,capabilityQualificationTargets}') target
				WHERE target ? 'optionalCapabilitySupportAuthority';
				SELECT COUNT(*) INTO actual_count
				FROM agent_evaluation_plan_capability_probe_admission_links link
				WHERE link.namespace_id=NEW.namespace_id AND link.plan_digest=NEW.plan_digest
					AND link.repository_commit=NEW.repository_commit;
				IF actual_count <> expected_count THEN
					RAISE EXCEPTION 'evaluation plan optional probe admission links are incomplete'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_plans_capability_probe_links_required
				AFTER INSERT ON agent_evaluation_plans
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_plan_capability_probe_links()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_optional_capability_fact_sources (
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
				response_digest TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				result_spool_receipt_digest TEXT,
				normalized_event_set_digest TEXT NOT NULL,
				source_request_digest TEXT NOT NULL,
				target_authority_digest TEXT NOT NULL,
				source_authority_id TEXT NOT NULL,
				source_authority_implementation_digest TEXT NOT NULL,
				source_authority_route_binding TEXT NOT NULL,
				registration_authority_issuer_id TEXT NOT NULL,
				registration_receipt_digest TEXT NOT NULL,
				source_kind TEXT NOT NULL,
				source_digest TEXT NOT NULL,
				native_bootstrap_source_request_digest TEXT,
				native_bootstrap_source_receipt_digest TEXT,
				native_provider_source_receipt_digest TEXT,
				native_provider_source_digest TEXT,
				source_owner_request_digest TEXT,
				source_owner_receipt_digest TEXT,
				source_owner_stage_digest TEXT,
				source_owner_dispatch_ack_digest TEXT,
				source_pre_effect_intent_digest TEXT,
				source_pre_effect_intent_json JSONB,
				source_pre_effect_intent_bytes BYTEA,
				source_effect_receipt_digest TEXT,
				provider_runtime_journal_result_record_digest TEXT,
				provider_runtime_result_seal_receipt_digest TEXT,
				source_effect_receipt_json JSONB,
				source_effect_receipt_bytes BYTEA,
				source_effect_fact_digest TEXT,
				source_business_result_digest TEXT,
				fact_kind TEXT,
				fact_digest TEXT,
				fact_json JSONB,
				fact_bytes BYTEA,
				source_seal_digest TEXT NOT NULL,
				source_receipt_json JSONB NOT NULL,
				source_receipt_bytes BYTEA NOT NULL,
				sealed_at TIMESTAMPTZ NOT NULL,
				v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, source_seal_digest),
				UNIQUE (
					namespace_id, plan_digest, repository_commit, attempt_id, turn_index
				),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, repository_commit, registration_receipt_digest
				) REFERENCES agent_evaluation_runtime_fact_source_owner_registrations(
					namespace_id, repository_commit, registration_receipt_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_eval_optional_fact_source_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND turn_index BETWEEN 0 AND 6
					AND protocol_family IN (
						'openai-responses', 'anthropic-messages', 'gemini-interactions'
					)
					AND support_expectation IN ('required', 'expected-blocked')
					AND source_kind IN (
						'sealed-provider-response-metadata', 'sealed-hosted-owner-result'
					)
					AND v45_eligible
				),
				CONSTRAINT agent_eval_optional_fact_source_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (result_spool_receipt_digest IS NULL
						OR result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND target_authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND registration_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_seal_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (native_bootstrap_source_request_digest IS NULL
						OR native_bootstrap_source_request_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (native_bootstrap_source_receipt_digest IS NULL
						OR native_bootstrap_source_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (native_provider_source_receipt_digest IS NULL
						OR native_provider_source_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (native_provider_source_digest IS NULL
						OR native_provider_source_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_owner_request_digest IS NULL
						OR source_owner_request_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_owner_receipt_digest IS NULL
						OR source_owner_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_owner_stage_digest IS NULL
						OR source_owner_stage_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_owner_dispatch_ack_digest IS NULL
						OR source_owner_dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_pre_effect_intent_digest IS NULL
						OR source_pre_effect_intent_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_effect_receipt_digest IS NULL
						OR source_effect_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (provider_runtime_journal_result_record_digest IS NULL
						OR provider_runtime_journal_result_record_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (provider_runtime_result_seal_receipt_digest IS NULL
						OR provider_runtime_result_seal_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_effect_fact_digest IS NULL
						OR source_effect_fact_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (source_business_result_digest IS NULL
						OR source_business_result_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (fact_digest IS NULL OR fact_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_eval_optional_fact_source_kind_check CHECK (
					(native_bootstrap_source_request_digest IS NOT NULL
						AND native_bootstrap_source_receipt_digest IS NOT NULL
						AND result_spool_receipt_digest IS NOT NULL
						AND source_kind='sealed-provider-response-metadata'
						AND source_owner_request_digest IS NULL
						AND source_owner_receipt_digest IS NULL
						AND source_owner_stage_digest IS NOT NULL
						AND source_owner_dispatch_ack_digest IS NOT NULL
						AND source_pre_effect_intent_digest IS NULL
						AND source_pre_effect_intent_json IS NULL
						AND source_pre_effect_intent_bytes IS NULL
						AND source_effect_receipt_digest IS NULL
						AND source_effect_receipt_json IS NULL
						AND source_effect_receipt_bytes IS NULL
						AND provider_runtime_journal_result_record_digest IS NULL
						AND provider_runtime_result_seal_receipt_digest IS NULL
						AND source_effect_fact_digest IS NULL
						AND source_business_result_digest IS NULL
						AND (fact_kind IS NULL)=(native_provider_source_receipt_digest IS NULL)
						AND (fact_kind IS NULL)=(native_provider_source_digest IS NULL))
					OR (native_bootstrap_source_request_digest IS NULL
						AND native_bootstrap_source_receipt_digest IS NULL
						AND native_provider_source_receipt_digest IS NULL
						AND native_provider_source_digest IS NULL
						AND source_owner_request_digest IS NOT NULL
						AND source_owner_receipt_digest IS NOT NULL
						AND source_owner_stage_digest IS NOT NULL
						AND source_owner_dispatch_ack_digest IS NOT NULL
						AND source_pre_effect_intent_digest IS NOT NULL
						AND source_effect_receipt_digest IS NOT NULL
						AND provider_runtime_journal_result_record_digest IS NOT NULL
						AND provider_runtime_result_seal_receipt_digest IS NOT NULL
						AND source_business_result_digest IS NOT NULL
						AND (fact_kind IS NULL)=(source_effect_fact_digest IS NULL))
				),
				CONSTRAINT agent_eval_optional_fact_source_fact_check CHECK (
					(fact_kind IS NULL AND fact_digest IS NULL
						AND fact_json IS NULL AND fact_bytes IS NULL
						AND source_effect_fact_digest IS NULL)
					OR (fact_kind IS NOT NULL AND fact_digest IS NOT NULL
						AND fact_json IS NOT NULL AND fact_bytes IS NOT NULL
						AND ((native_bootstrap_source_request_digest IS NOT NULL
							AND native_provider_source_receipt_digest IS NOT NULL
							AND native_provider_source_digest IS NOT NULL
							AND source_effect_fact_digest IS NULL)
						OR (native_bootstrap_source_request_digest IS NULL
							AND source_effect_fact_digest=fact_digest)))
				),
				CONSTRAINT agent_eval_optional_fact_source_bytes_check CHECK (
					octet_length(source_receipt_bytes) BETWEEN 1 AND 65536
					AND (source_pre_effect_intent_json IS NULL)=
						(source_pre_effect_intent_bytes IS NULL)
					AND (source_pre_effect_intent_bytes IS NULL OR
						octet_length(source_pre_effect_intent_bytes) BETWEEN 1 AND 16384)
					AND (source_effect_receipt_json IS NULL)=(source_effect_receipt_bytes IS NULL)
					AND (source_effect_receipt_bytes IS NULL OR
						octet_length(source_effect_receipt_bytes) BETWEEN 1 AND 16384)
					AND (fact_bytes IS NULL OR octet_length(fact_bytes) BETWEEN 1 AND 16384)
					AND source_receipt_json = convert_from(source_receipt_bytes, 'UTF8')::jsonb
					AND (source_pre_effect_intent_json IS NULL OR source_pre_effect_intent_json =
						convert_from(source_pre_effect_intent_bytes, 'UTF8')::jsonb
					)
					AND (source_effect_receipt_json IS NULL OR source_effect_receipt_json =
						convert_from(source_effect_receipt_bytes, 'UTF8')::jsonb
					)
					AND (fact_json IS NULL OR fact_json = convert_from(fact_bytes, 'UTF8')::jsonb)
					AND source_receipt_json->>'sourceSealDigest'=source_seal_digest
					AND (source_pre_effect_intent_json IS NULL OR
						source_pre_effect_intent_json->>'intentDigest'=source_pre_effect_intent_digest)
					AND (source_effect_receipt_json IS NULL OR
						(source_effect_receipt_json->>'receiptDigest'=source_effect_receipt_digest
							AND source_effect_receipt_json->>'providerRuntimeJournalResultRecordDigest'=
								provider_runtime_journal_result_record_digest
							AND source_effect_receipt_json->>'providerRuntimeResultSealReceiptDigest'=
								provider_runtime_result_seal_receipt_digest))
				),
				CONSTRAINT agent_eval_optional_fact_source_json_check CHECK (COALESCE((
					agent_evaluation_jsonb_object_key_count(source_receipt_json)=
						CASE WHEN native_bootstrap_source_request_digest IS NOT NULL
							THEN CASE WHEN fact_json IS NULL THEN 47 ELSE 48 END
							ELSE CASE WHEN fact_json IS NULL THEN 50 ELSE 51 END
						END
					AND source_receipt_json ?& CASE
						WHEN native_bootstrap_source_request_digest IS NOT NULL THEN ARRAY[
							'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
							'descriptorDigest','targetId','targetDigest','capabilityProfileId',
							'capabilityProfileDigest','capabilityDescriptorDigest','capabilityId',
							'supportExpectation','turnIndex','invocationId','protocolFamily',
							'providerConfigurationId','modelId','modelLineageDigest','adapterDigest',
							'providerRequestDigest','responseDigest','dispatchIntentDigest',
							'transportReceiptDigest','resultSpoolReceiptDigest','normalizedEventSetDigest',
							'targetAuthorityDigest','sourceAuthorityId','sourceAuthorityImplementationDigest',
							'sourceAuthorityRouteBinding','registrationAuthorityIssuerId',
							'registrationReceiptDigest','sourceKind','sourceDigest','sourceRequestDigest',
							'outcome','observedAt','sealedAt','ownerStageDigest','ownerDispatchAckDigest',
							'sourceSealDigest','nativeBootstrapSourceRequestDigest',
							'nativeBootstrapSourceReceiptDigest','nativeProviderSourceReceiptDigest',
							'nativeProviderSourceDigest','nativeProviderSourceFactDigest'
						]
						ELSE ARRAY[
							'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
							'descriptorDigest','targetId','targetDigest','capabilityProfileId',
							'capabilityProfileDigest','capabilityDescriptorDigest','capabilityId',
							'supportExpectation','turnIndex','invocationId','protocolFamily',
							'providerConfigurationId','modelId','modelLineageDigest','adapterDigest',
							'providerRequestDigest','responseDigest','dispatchIntentDigest',
							'transportReceiptDigest','resultSpoolReceiptDigest','normalizedEventSetDigest',
							'targetAuthorityDigest','sourceAuthorityId','sourceAuthorityImplementationDigest',
							'sourceAuthorityRouteBinding','registrationAuthorityIssuerId',
							'registrationReceiptDigest','sourceKind','sourceDigest','sourceRequestDigest',
							'outcome','observedAt','sealedAt','ownerRequestDigest','ownerReceiptDigest',
							'ownerStageDigest','ownerDispatchAckDigest','preEffectIntentDigest',
							'effectSourceReceiptDigest','providerRuntimeJournalResultRecordDigest',
							'providerRuntimeResultSealReceiptDigest','effectSourceFactDigest',
							'businessResultDigest','sourceSealDigest'
						]
					END
					AND (source_receipt_json ? 'fact')=(fact_json IS NOT NULL)
					AND source_receipt_json->>'format'=
						'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt'
					AND (source_receipt_json->>'version')::bigint=1
					AND source_receipt_json->>'namespaceId'=namespace_id
					AND source_receipt_json->>'planDigest'=plan_digest
					AND source_receipt_json->>'repositoryCommit'=repository_commit
					AND source_receipt_json->>'attemptId'=attempt_id
					AND source_receipt_json->>'descriptorDigest'=descriptor_digest
					AND source_receipt_json->>'targetId'=target_id
					AND source_receipt_json->>'targetDigest'=target_digest
					AND source_receipt_json->>'capabilityProfileId'=capability_profile_id
					AND source_receipt_json->>'capabilityProfileDigest'=capability_profile_digest
					AND source_receipt_json->>'capabilityDescriptorDigest'=
						capability_descriptor_digest
					AND source_receipt_json->>'capabilityId'=capability_id
					AND source_receipt_json->>'supportExpectation'=support_expectation
					AND (source_receipt_json->>'turnIndex')::bigint=turn_index
					AND source_receipt_json->>'invocationId'=invocation_id
					AND source_receipt_json->>'protocolFamily'=protocol_family
					AND source_receipt_json->>'providerConfigurationId'=provider_configuration_id
					AND source_receipt_json->>'modelId'=model_id
					AND source_receipt_json->>'modelLineageDigest'=model_lineage_digest
					AND source_receipt_json->>'adapterDigest'=adapter_digest
					AND source_receipt_json->>'providerRequestDigest'=provider_request_digest
					AND source_receipt_json->>'responseDigest'=response_digest
					AND source_receipt_json->>'dispatchIntentDigest'=dispatch_intent_digest
					AND source_receipt_json->>'transportReceiptDigest'=transport_receipt_digest
					AND source_receipt_json ? 'resultSpoolReceiptDigest'
					AND source_receipt_json->'resultSpoolReceiptDigest' IS NOT DISTINCT FROM
						COALESCE(to_jsonb(result_spool_receipt_digest), 'null'::jsonb)
					AND source_receipt_json->>'normalizedEventSetDigest'=
						normalized_event_set_digest
					AND source_receipt_json->>'sourceRequestDigest'=source_request_digest
					AND source_receipt_json->>'targetAuthorityDigest'=target_authority_digest
					AND source_receipt_json->>'sourceAuthorityId'=source_authority_id
					AND source_receipt_json->>'sourceAuthorityImplementationDigest'=
						source_authority_implementation_digest
					AND source_receipt_json->>'sourceAuthorityRouteBinding'=
						source_authority_route_binding
					AND source_receipt_json->>'registrationAuthorityIssuerId'=
						registration_authority_issuer_id
					AND source_receipt_json->>'registrationReceiptDigest'=
						registration_receipt_digest
					AND source_receipt_json->>'sourceKind'=source_kind
					AND source_receipt_json->>'sourceDigest'=source_digest
					AND NULLIF(
						source_receipt_json->>'nativeBootstrapSourceRequestDigest',''
					) IS NOT DISTINCT FROM native_bootstrap_source_request_digest
					AND NULLIF(
						source_receipt_json->>'nativeBootstrapSourceReceiptDigest',''
					) IS NOT DISTINCT FROM native_bootstrap_source_receipt_digest
					AND NULLIF(
						source_receipt_json->>'nativeProviderSourceReceiptDigest',''
					) IS NOT DISTINCT FROM native_provider_source_receipt_digest
					AND NULLIF(
						source_receipt_json->>'nativeProviderSourceDigest',''
					) IS NOT DISTINCT FROM native_provider_source_digest
					AND NULLIF(
						source_receipt_json->>'nativeProviderSourceFactDigest',''
					) IS NOT DISTINCT FROM CASE
						WHEN native_bootstrap_source_request_digest IS NOT NULL THEN fact_digest
						ELSE NULL END
					AND NULLIF(source_receipt_json->>'ownerRequestDigest','') IS NOT DISTINCT FROM
						source_owner_request_digest
					AND NULLIF(source_receipt_json->>'ownerReceiptDigest','') IS NOT DISTINCT FROM
						source_owner_receipt_digest
					AND NULLIF(source_receipt_json->>'ownerStageDigest','') IS NOT DISTINCT FROM
						source_owner_stage_digest
					AND NULLIF(source_receipt_json->>'ownerDispatchAckDigest','') IS NOT DISTINCT FROM
						source_owner_dispatch_ack_digest
					AND NULLIF(source_receipt_json->>'preEffectIntentDigest','') IS NOT DISTINCT FROM
						source_pre_effect_intent_digest
					AND NULLIF(source_receipt_json->>'effectSourceReceiptDigest','') IS NOT DISTINCT FROM
						source_effect_receipt_digest
					AND NULLIF(
						source_receipt_json->>'providerRuntimeJournalResultRecordDigest',''
					) IS NOT DISTINCT FROM provider_runtime_journal_result_record_digest
					AND NULLIF(
						source_receipt_json->>'providerRuntimeResultSealReceiptDigest',''
					) IS NOT DISTINCT FROM provider_runtime_result_seal_receipt_digest
					AND NULLIF(source_receipt_json->>'effectSourceFactDigest','') IS NOT DISTINCT FROM
						source_effect_fact_digest
					AND NULLIF(source_receipt_json->>'businessResultDigest','') IS NOT DISTINCT FROM
						source_business_result_digest
					AND source_receipt_json->>'outcome' IN ('observed','unavailable','failed')
					AND (source_receipt_json->>'sealedAt')::timestamptz=sealed_at
					AND (source_receipt_json->>'observedAt')::timestamptz <= sealed_at
					AND source_receipt_json->'fact' IS NOT DISTINCT FROM fact_json
					AND ((source_receipt_json->>'outcome'='observed' AND fact_json IS NOT NULL
							AND result_spool_receipt_digest IS NOT NULL)
						OR (source_receipt_json->>'outcome' IN ('unavailable','failed')
							AND fact_json IS NULL))
				), FALSE))
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_optional_fact_authorities (
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
				response_digest TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				result_spool_receipt_digest TEXT,
				normalized_event_set_digest TEXT NOT NULL,
				target_authority_digest TEXT NOT NULL,
				source_authority_id TEXT NOT NULL,
				source_authority_implementation_digest TEXT NOT NULL,
				source_authority_route_binding TEXT NOT NULL,
				source_registration_authority_issuer_id TEXT NOT NULL,
				source_registration_receipt_digest TEXT NOT NULL,
				source_kind TEXT NOT NULL,
				source_digest TEXT NOT NULL,
				source_seal_digest TEXT NOT NULL,
				authority_request_digest TEXT NOT NULL,
				state TEXT NOT NULL,
				claim_generation BIGINT NOT NULL DEFAULT 1,
				v45_eligible BOOLEAN NOT NULL DEFAULT TRUE,
				stage_digest TEXT NOT NULL,
				staged_at TIMESTAMPTZ NOT NULL,
				source_owner_request_digest TEXT NOT NULL,
				source_owner_receipt_digest TEXT NOT NULL,
				source_owner_stage_digest TEXT NOT NULL,
				source_owner_dispatch_ack_digest TEXT NOT NULL,
				source_pre_effect_intent_digest TEXT NOT NULL,
				source_effect_receipt_digest TEXT NOT NULL,
				source_effect_fact_digest TEXT,
				source_business_result_digest TEXT NOT NULL,
				outcome TEXT,
				fact_kind TEXT,
				fact_digest TEXT,
				dispatch_ack_digest TEXT,
				runtime_fact_envelope_digest TEXT,
				fact_authority_digest TEXT,
				result_digest TEXT,
				sealed_at TIMESTAMPTZ,
				request_json JSONB NOT NULL,
				request_bytes BYTEA NOT NULL,
				fact_json JSONB,
				fact_bytes BYTEA,
				runtime_fact_envelope_json JSONB,
				runtime_fact_envelope_bytes BYTEA,
				fact_authority_json JSONB,
				fact_authority_bytes BYTEA,
				response_json JSONB,
				response_bytes BYTEA,
				PRIMARY KEY (
					namespace_id, plan_digest, repository_commit, attempt_id, turn_index
				),
				UNIQUE (
					namespace_id, plan_digest, repository_commit, authority_request_digest
				),
				UNIQUE (stage_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, source_seal_digest
				) REFERENCES agent_evaluation_optional_capability_fact_sources(
					namespace_id, plan_digest, repository_commit, source_seal_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_optional_fact_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_optional_fact_identity_check CHECK (
					turn_index BETWEEN 0 AND 6
					AND protocol_family IN (
						'openai-responses', 'anthropic-messages', 'gemini-interactions'
					)
					AND support_expectation IN ('required', 'expected-blocked')
					AND source_kind IN (
						'sealed-provider-response-metadata', 'sealed-hosted-owner-result'
					)
					AND claim_generation = 1
					AND v45_eligible
				),
				CONSTRAINT agent_evaluation_optional_fact_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND target_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_profile_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (result_spool_receipt_digest IS NULL
						OR result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND target_authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_registration_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_seal_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND stage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_owner_request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_owner_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_owner_stage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_owner_dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_pre_effect_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_effect_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (source_effect_fact_digest IS NULL
						OR source_effect_fact_digest ~ '^sha256-[a-f0-9]{64}$')
					AND source_business_result_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (fact_digest IS NULL OR fact_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (dispatch_ack_digest IS NULL
						OR dispatch_ack_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (runtime_fact_envelope_digest IS NULL
						OR runtime_fact_envelope_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (fact_authority_digest IS NULL
						OR fact_authority_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (result_digest IS NULL OR result_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_evaluation_optional_fact_source_check CHECK (
					source_owner_request_digest IS NOT NULL
					AND source_owner_receipt_digest IS NOT NULL
					AND source_owner_stage_digest IS NOT NULL
					AND source_owner_dispatch_ack_digest IS NOT NULL
					AND source_pre_effect_intent_digest IS NOT NULL
					AND source_effect_receipt_digest IS NOT NULL
					AND source_business_result_digest IS NOT NULL
				),
				CONSTRAINT agent_evaluation_optional_fact_lifecycle_check CHECK (
					(state='staged'
						AND outcome IS NULL AND fact_kind IS NULL AND fact_digest IS NULL
						AND dispatch_ack_digest IS NULL
						AND runtime_fact_envelope_digest IS NULL
						AND fact_authority_digest IS NULL AND result_digest IS NULL
						AND fact_json IS NULL AND fact_bytes IS NULL
						AND runtime_fact_envelope_json IS NULL
						AND runtime_fact_envelope_bytes IS NULL
						AND fact_authority_json IS NULL AND fact_authority_bytes IS NULL
						AND response_json IS NULL AND response_bytes IS NULL
						AND sealed_at IS NULL)
					OR (state='sealed' AND outcome IN ('observed', 'unavailable', 'failed')
						AND dispatch_ack_digest IS NOT NULL AND result_digest IS NOT NULL
						AND response_json IS NOT NULL AND response_bytes IS NOT NULL
						AND sealed_at IS NOT NULL AND sealed_at >= staged_at
						AND ((outcome='observed'
							AND result_spool_receipt_digest IS NOT NULL
							AND fact_kind IS NOT NULL AND fact_digest IS NOT NULL
							AND source_effect_fact_digest=fact_digest
							AND fact_json IS NOT NULL AND fact_bytes IS NOT NULL
							AND runtime_fact_envelope_digest IS NOT NULL
							AND runtime_fact_envelope_json IS NOT NULL
							AND runtime_fact_envelope_bytes IS NOT NULL
							AND fact_authority_digest IS NOT NULL
							AND fact_authority_json IS NOT NULL
							AND fact_authority_bytes IS NOT NULL)
						OR (outcome IN ('unavailable', 'failed')
							AND fact_kind IS NULL AND fact_digest IS NULL
							AND source_effect_fact_digest IS NULL
							AND fact_json IS NULL AND fact_bytes IS NULL
							AND runtime_fact_envelope_digest IS NULL
							AND runtime_fact_envelope_json IS NULL
							AND runtime_fact_envelope_bytes IS NULL
							AND fact_authority_digest IS NULL
							AND fact_authority_json IS NULL
							AND fact_authority_bytes IS NULL)))
				),
				CONSTRAINT agent_evaluation_optional_fact_bytes_check CHECK (
					octet_length(request_bytes) BETWEEN 1 AND 65536
					AND (fact_bytes IS NULL OR octet_length(fact_bytes) BETWEEN 1 AND 16384)
					AND (runtime_fact_envelope_bytes IS NULL
						OR octet_length(runtime_fact_envelope_bytes) BETWEEN 1 AND 16384)
					AND (fact_authority_bytes IS NULL
						OR octet_length(fact_authority_bytes) BETWEEN 1 AND 16384)
					AND (response_bytes IS NULL
						OR octet_length(response_bytes) BETWEEN 1 AND 65536)
				),
				CONSTRAINT agent_evaluation_optional_fact_json_bytes_check CHECK (
					request_json = convert_from(request_bytes, 'UTF8')::jsonb
					AND (fact_json IS NULL) = (fact_bytes IS NULL)
					AND (fact_json IS NULL OR fact_json = convert_from(fact_bytes, 'UTF8')::jsonb)
					AND (runtime_fact_envelope_json IS NULL) =
						(runtime_fact_envelope_bytes IS NULL)
					AND (runtime_fact_envelope_json IS NULL OR runtime_fact_envelope_json =
						convert_from(runtime_fact_envelope_bytes, 'UTF8')::jsonb)
					AND (fact_authority_json IS NULL) = (fact_authority_bytes IS NULL)
					AND (fact_authority_json IS NULL OR fact_authority_json =
						convert_from(fact_authority_bytes, 'UTF8')::jsonb)
					AND (response_json IS NULL) = (response_bytes IS NULL)
					AND (response_json IS NULL OR response_json =
						convert_from(response_bytes, 'UTF8')::jsonb)
				),
				CONSTRAINT agent_eval_optional_fact_request_json_check CHECK (COALESCE((
					request_json->>'format'=
						'prodivix.agent-evaluation-optional-capability-fact-authority-stage-request'
					AND (request_json->>'version')::bigint=1
					AND request_json->>'planDigest'=plan_digest
					AND request_json->>'repositoryCommit'=repository_commit
					AND request_json->>'attemptId'=attempt_id
					AND request_json->>'descriptorDigest'=descriptor_digest
					AND (request_json->>'turnIndex')::bigint=turn_index
					AND request_json->>'sourceSealDigest'=source_seal_digest
				), FALSE)),
				CONSTRAINT agent_eval_optional_fact_response_json_check CHECK (COALESCE((
					response_json IS NULL OR (
						response_json->>'format'=
							'prodivix.agent-evaluation-optional-capability-fact-authority-response'
						AND (response_json->>'version')::bigint=1
						AND response_json->>'outcome'=outcome
						AND response_json->>'authorityRequestDigest'=authority_request_digest
						AND response_json->>'sourceAuthorityId'=source_authority_id
						AND response_json->>'sourceAuthorityImplementationDigest'=
							source_authority_implementation_digest
						AND response_json->>'stageDigest'=stage_digest
						AND response_json->>'dispatchAckDigest'=dispatch_ack_digest
						AND response_json->>'resultDigest'=result_digest
						AND jsonb_typeof(response_json->'runtimeFactEnvelopes')='array'
						AND jsonb_typeof(response_json->'factAuthorities')='array'
						AND jsonb_array_length(response_json->'runtimeFactEnvelopes')=
							CASE WHEN outcome='observed' THEN 1 ELSE 0 END
						AND jsonb_array_length(response_json->'factAuthorities')=
							CASE WHEN outcome='observed' THEN 1 ELSE 0 END
						AND (outcome<>'observed' OR (
							response_json#>'{runtimeFactEnvelopes,0}'=runtime_fact_envelope_json
							AND response_json#>'{factAuthorities,0}'=fact_authority_json
							AND jsonb_typeof(runtime_fact_envelope_json)='object'
							AND runtime_fact_envelope_json ?& ARRAY[
								'format','version','sourceAuthorityKind','sourceAuthorityId',
								'sourceAuthorityImplementationDigest','sourceKind','routeBinding',
								'registrationAuthorityIssuerId','registrationReceiptDigest',
								'runtimeFactSourceAuthorityDigest','stageDigest','dispatchAckDigest',
								'planDigest','repositoryCommit','attemptId','descriptorDigest',
								'turnIndex','invocationId','requestDigest','responseDigest',
								'protocolFamily','providerConfigurationId','modelLineageDigest',
								'adapterDigest','dispatchIntentDigest','transportReceiptDigest',
								'resultSpoolReceiptDigest','normalizedEventSetDigest','observedAt',
								'fact','envelopeDigest'
							]
							AND jsonb_typeof(fact_authority_json)='object'
							AND fact_authority_json ?& ARRAY[
								'format','version','factKind','factDigest','sourceAuthorityKind',
								'sourceAuthorityId','sourceAuthorityImplementationDigest',
								'sourceKind','routeBinding','registrationAuthorityIssuerId',
								'registrationReceiptDigest','runtimeFactSourceAuthorityDigest',
								'stageDigest','dispatchAckDigest','transportReceiptDigest',
								'resultSpoolReceiptDigest','normalizedEventSetDigest',
								'runtimeFactEnvelopeDigest','authorityDigest'
							]
							AND runtime_fact_envelope_json->>'format'=
								'prodivix.agent-evaluation-provider-capability-runtime-fact-envelope'
							AND (runtime_fact_envelope_json->>'version')::bigint=1
							AND runtime_fact_envelope_json->>'sourceAuthorityKind'=
								'shared-durable-capability'
							AND runtime_fact_envelope_json->>'sourceAuthorityId'=source_authority_id
							AND runtime_fact_envelope_json->>'sourceAuthorityImplementationDigest'=
								source_authority_implementation_digest
							AND runtime_fact_envelope_json->>'sourceKind'=source_kind
							AND runtime_fact_envelope_json->>'routeBinding'=
								source_authority_route_binding
							AND runtime_fact_envelope_json->>'registrationAuthorityIssuerId'=
								source_registration_authority_issuer_id
							AND runtime_fact_envelope_json->>'registrationReceiptDigest'=
								source_registration_receipt_digest
							AND runtime_fact_envelope_json->>'runtimeFactSourceAuthorityDigest'=
								target_authority_digest
							AND runtime_fact_envelope_json->>'stageDigest'=
								source_owner_stage_digest
							AND runtime_fact_envelope_json->>'dispatchAckDigest'=
								source_owner_dispatch_ack_digest
							AND runtime_fact_envelope_json->>'planDigest'=plan_digest
							AND runtime_fact_envelope_json->>'repositoryCommit'=repository_commit
							AND runtime_fact_envelope_json->>'attemptId'=attempt_id
							AND runtime_fact_envelope_json->>'descriptorDigest'=descriptor_digest
							AND (runtime_fact_envelope_json->>'turnIndex')::bigint=turn_index
							AND runtime_fact_envelope_json->>'invocationId'=invocation_id
							AND runtime_fact_envelope_json->>'requestDigest'=provider_request_digest
							AND runtime_fact_envelope_json->>'responseDigest'=response_digest
							AND runtime_fact_envelope_json->>'protocolFamily'=protocol_family
							AND runtime_fact_envelope_json->>'providerConfigurationId'=
								provider_configuration_id
							AND runtime_fact_envelope_json->>'modelLineageDigest'=model_lineage_digest
							AND runtime_fact_envelope_json->>'adapterDigest'=adapter_digest
							AND runtime_fact_envelope_json->>'dispatchIntentDigest'=
								dispatch_intent_digest
							AND (runtime_fact_envelope_json->>'observedAt')::timestamptz<=sealed_at
							AND runtime_fact_envelope_json->'fact'=fact_json
							AND runtime_fact_envelope_json->>'envelopeDigest'=
								runtime_fact_envelope_digest
							AND fact_authority_json->>'format'=
								'prodivix.agent-evaluation-provider-capability-fact-authority'
							AND (fact_authority_json->>'version')::bigint=1
							AND fact_authority_json->>'factKind'=fact_kind
							AND fact_authority_json->>'factDigest'=fact_digest
							AND fact_authority_json->>'sourceAuthorityKind'=
								'shared-durable-capability'
							AND fact_authority_json->>'sourceAuthorityId'=source_authority_id
							AND fact_authority_json->>'sourceAuthorityImplementationDigest'=
								source_authority_implementation_digest
							AND fact_authority_json->>'sourceKind'=source_kind
							AND fact_authority_json->>'routeBinding'=source_authority_route_binding
							AND fact_authority_json->>'registrationAuthorityIssuerId'=
								source_registration_authority_issuer_id
							AND fact_authority_json->>'registrationReceiptDigest'=
								source_registration_receipt_digest
							AND fact_authority_json->>'runtimeFactSourceAuthorityDigest'=
								target_authority_digest
							AND fact_authority_json->>'stageDigest'=source_owner_stage_digest
							AND fact_authority_json->>'dispatchAckDigest'=
								source_owner_dispatch_ack_digest
							AND fact_authority_json->>'runtimeFactEnvelopeDigest'=
								runtime_fact_envelope_digest
							AND fact_authority_json->>'authorityDigest'=fact_authority_digest
						))
					)
				), FALSE))
			)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_optional_fact_dispatch_ack
				ON agent_evaluation_optional_fact_authorities(dispatch_ack_digest)
				WHERE dispatch_ack_digest IS NOT NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_optional_fact_runtime_envelope
				ON agent_evaluation_optional_fact_authorities(runtime_fact_envelope_digest)
				WHERE runtime_fact_envelope_digest IS NOT NULL`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_evaluation_optional_fact_authority
				ON agent_evaluation_optional_fact_authorities(fact_authority_digest)
				WHERE fact_authority_digest IS NOT NULL`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_optional_capability_fact_source_binding()
				RETURNS trigger AS $$
			DECLARE
				binding_exists BOOLEAN;
				binding_kind TEXT;
			BEGIN
				IF NOT EXISTS (
					SELECT 1
					FROM agent_evaluation_plans plan
					CROSS JOIN LATERAL jsonb_array_elements(
						plan.plan_json#>'{value,capabilityQualificationTargets}'
					) target
					CROSS JOIN LATERAL jsonb_array_elements(
						plan.plan_json#>'{value,providerConfigurations}'
					) provider
					WHERE plan.namespace_id=NEW.namespace_id
						AND plan.plan_digest=NEW.plan_digest
						AND plan.repository_commit=NEW.repository_commit
						AND target->>'targetId'=NEW.target_id
						AND target->>'targetDigest'=NEW.target_digest
						AND target->>'capabilityProfileId'=NEW.capability_profile_id
						AND target->>'capabilityProfileDigest'=NEW.capability_profile_digest
						AND target->>'protocolFamily'=NEW.protocol_family
						AND target->>'providerConfigurationId'=NEW.provider_configuration_id
						AND target->>'modelId'=NEW.model_id
						AND target->>'modelLineageDigest'=NEW.model_lineage_digest
						AND target#>>'{optionalCapabilitySupportAuthority,capabilityId}'=
							NEW.capability_id
						AND target#>>'{optionalCapabilitySupportAuthority,supportExpectation}'=
							NEW.support_expectation
						AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,authorityDigest}'=
							NEW.target_authority_digest
						AND target#>>'{optionalCapabilitySupportAuthority,resolvedCapabilityDescriptor,descriptorDigest}'=
							NEW.capability_descriptor_digest
						AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,sourceAuthorityId}'=
							NEW.source_authority_id
						AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,sourceAuthorityImplementationDigest}'=
							NEW.source_authority_implementation_digest
						AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,routeBinding}'=
							NEW.source_authority_route_binding
						AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,registrationAuthorityIssuerId}'=
							NEW.registration_authority_issuer_id
						AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,registrationReceiptDigest}'=
							NEW.registration_receipt_digest
						AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,sourceKind}'=NEW.source_kind
						AND provider->>'providerConfigurationId'=NEW.provider_configuration_id
						AND provider#>>'{adapter,protocolFamily}'=NEW.protocol_family
						AND provider#>>'{adapter,adapterDigest}'=NEW.adapter_digest
				) THEN
					RAISE EXCEPTION 'optional capability fact drifted from its frozen plan authority'
						USING ERRCODE = '23514';
				END IF;
				IF NOT EXISTS (
					SELECT 1
					FROM agent_evaluation_runtime_fact_source_owner_registrations registration
					WHERE registration.namespace_id=NEW.namespace_id
						AND registration.repository_commit=NEW.repository_commit
						AND registration.registration_receipt_digest=NEW.registration_receipt_digest
						AND registration.state='sealed' AND registration.v45_eligible
						AND registration.source_authority_kind='shared-durable-capability'
						AND registration.source_kind=NEW.source_kind
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
						AND registration.registered_at <= NEW.sealed_at
						AND registration.expires_at >= NEW.sealed_at
				) THEN
					RAISE EXCEPTION 'optional capability fact lacks exact sealed owner registration'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.native_bootstrap_source_request_digest IS NOT NULL THEN
					IF NOT EXISTS (
						SELECT 1
						FROM agent_evaluation_native_optional_capability_bootstrap_sources bootstrap
						WHERE bootstrap.namespace_id=NEW.namespace_id
							AND bootstrap.plan_digest=NEW.plan_digest
							AND bootstrap.repository_commit=NEW.repository_commit
							AND bootstrap.attempt_id=NEW.attempt_id
							AND bootstrap.descriptor_digest=NEW.descriptor_digest
							AND bootstrap.turn_index=NEW.turn_index
							AND bootstrap.invocation_id=NEW.invocation_id
							AND bootstrap.provider_request_digest=NEW.provider_request_digest
							AND bootstrap.provider_response_digest=NEW.response_digest
							AND bootstrap.dispatch_intent_digest=NEW.dispatch_intent_digest
							AND bootstrap.transport_receipt_digest=NEW.transport_receipt_digest
							AND bootstrap.result_spool_receipt_digest=NEW.result_spool_receipt_digest
							AND bootstrap.normalized_event_set_digest=NEW.normalized_event_set_digest
							AND bootstrap.runtime_fact_source_authority_digest=
								NEW.target_authority_digest
							AND bootstrap.registration_receipt_digest=NEW.registration_receipt_digest
							AND bootstrap.source_authority_id=NEW.source_authority_id
							AND bootstrap.source_authority_implementation_digest=
								NEW.source_authority_implementation_digest
							AND bootstrap.source_authority_route_binding=
								NEW.source_authority_route_binding
							AND bootstrap.source_request_digest=
								NEW.native_bootstrap_source_request_digest
							AND bootstrap.source_receipt_digest=
								NEW.native_bootstrap_source_receipt_digest
							AND bootstrap.optional_authority_request_digest=NEW.source_request_digest
							AND bootstrap.source_owner_stage_digest=NEW.source_owner_stage_digest
							AND bootstrap.source_owner_dispatch_ack_digest=
								NEW.source_owner_dispatch_ack_digest
							AND bootstrap.native_provider_source_receipt_digest IS NOT DISTINCT FROM
								NEW.native_provider_source_receipt_digest
							AND bootstrap.native_provider_source_digest IS NOT DISTINCT FROM
								NEW.native_provider_source_digest
							AND bootstrap.fact_kind IS NOT DISTINCT FROM NEW.fact_kind
							AND bootstrap.fact_digest IS NOT DISTINCT FROM NEW.fact_digest
							AND bootstrap.fact_json IS NOT DISTINCT FROM NEW.fact_json
							AND bootstrap.observed_at=
								(NEW.source_receipt_json->>'observedAt')::timestamptz
							AND bootstrap.sealed_at<=NEW.sealed_at
							AND bootstrap.v45_eligible
					) THEN
						RAISE EXCEPTION 'optional capability fact lacks exact native bootstrap source'
							USING ERRCODE='23514';
					END IF;
					RETURN NEW;
				END IF;
				IF jsonb_typeof(NEW.source_effect_receipt_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.source_effect_receipt_json)<>25
					OR NOT (NEW.source_effect_receipt_json ?& ARRAY[
						'format','version','intentDigest','ownerRequestId','ownerRequestDigest',
						'runtimeFactSourceAuthority','registrationReceiptDigest','effectStatus',
						'businessResultDigest','sourceFactKind','sourceFactDigest',
						'providerRuntimeJournalResultRecordDigest',
						'providerRuntimeResultSealReceiptDigest','stageDigest','dispatchAckDigest',
						'transportReceiptDigest','resultSpoolReceiptDigest','normalizedEventSetDigest',
						'stateVaultResolveRequest','stateVaultResolveReceipt','stateVaultRetireRequest',
						'stateVaultRetirementReceipt','specificReceiptDigests','sealedAt','receiptDigest'
					]) THEN
					RAISE EXCEPTION 'optional capability fact effect receipt shape is invalid'
						USING ERRCODE='23514';
				END IF;
				binding_kind:=NEW.source_pre_effect_intent_json#>>'{inputAuthorityBinding,bindingKind}';
				IF binding_kind IN ('provider-job','opaque-continuation') THEN
					IF jsonb_typeof(NEW.source_effect_receipt_json->'stateVaultResolveRequest')<>'object'
						OR jsonb_typeof(NEW.source_effect_receipt_json->'stateVaultResolveReceipt')<>'object'
						OR jsonb_typeof(NEW.source_effect_receipt_json->'stateVaultRetireRequest')<>'object'
						OR jsonb_typeof(NEW.source_effect_receipt_json->'stateVaultRetirementReceipt')<>'object'
					THEN
						RAISE EXCEPTION 'stateful optional capability fact effect receipt lacks its vault lifecycle'
							USING ERRCODE='23514';
					END IF;
				ELSIF NEW.source_effect_receipt_json->'stateVaultResolveRequest'
						IS DISTINCT FROM 'null'::jsonb
					OR NEW.source_effect_receipt_json->'stateVaultResolveReceipt'
						IS DISTINCT FROM 'null'::jsonb
					OR NEW.source_effect_receipt_json->'stateVaultRetireRequest'
						IS DISTINCT FROM 'null'::jsonb
					OR NEW.source_effect_receipt_json->'stateVaultRetirementReceipt'
						IS DISTINCT FROM 'null'::jsonb THEN
					RAISE EXCEPTION 'stateless optional capability fact effect receipt includes a vault lifecycle'
						USING ERRCODE='23514';
				END IF;
				SELECT EXISTS (
					SELECT 1
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
					WHERE intent.namespace_id=NEW.namespace_id
						AND intent.plan_digest=NEW.plan_digest
						AND intent.repository_commit=NEW.repository_commit
						AND transport.repository_commit=NEW.repository_commit
						AND spool.repository_commit=NEW.repository_commit
						AND intent.attempt_id=NEW.attempt_id
						AND intent.descriptor_digest=NEW.descriptor_digest
						AND transport.descriptor_digest=NEW.descriptor_digest
						AND spool.descriptor_digest=NEW.descriptor_digest
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
						AND transport.outcome='completed'
						AND spool.dispatch_intent_digest=NEW.dispatch_intent_digest
						AND spool.transport_receipt_digest=transport.receipt_digest
						AND spool.response_body_digest=transport.response_body_digest
						AND spool.response_digest=NEW.response_digest
						AND (NEW.source_effect_receipt_json->>'sealedAt')::timestamptz>=
							transport.completed_at
						AND NEW.sealed_at >= spool.created_at
				) INTO binding_exists;
				IF NOT binding_exists THEN
					RAISE EXCEPTION 'optional capability fact drifted from transport/spool authority'
						USING ERRCODE = '23514';
				END IF;
				IF NOT EXISTS (
					SELECT 1
					FROM agent_evaluation_controlled_authority_requests journal
					JOIN agent_evaluation_attempt_authority_owner_receipts owner
					  ON owner.namespace_id=journal.namespace_id
					 AND owner.plan_digest=journal.plan_digest
					 AND owner.repository_commit=journal.repository_commit
					 AND owner.journal_service_kind=journal.service_kind
					 AND owner.request_digest=journal.request_digest
					CROSS JOIN LATERAL (
						SELECT convert_from(journal.response_bytes, 'UTF8')::jsonb AS response_json
					) wire
					WHERE journal.namespace_id=NEW.namespace_id
						AND journal.plan_digest=NEW.plan_digest
						AND journal.repository_commit=NEW.repository_commit
						AND journal.service_kind='provider-capability'
						AND journal.operation='tool.execute'
						AND journal.route_binding='capability-runtime/execute-tool'
						AND journal.state='sealed' AND journal.v45_eligible
						AND journal.attempt_id=NEW.attempt_id
						AND journal.descriptor_digest=NEW.descriptor_digest
						AND journal.request_digest=NEW.source_owner_request_digest
						AND journal.owner_implementation_digest=
							NEW.source_authority_implementation_digest
						AND journal.stage_digest=NEW.source_owner_stage_digest
						AND journal.dispatch_ack_digest=NEW.source_owner_dispatch_ack_digest
						AND journal.pre_effect_intent_digest=NEW.source_pre_effect_intent_digest
						AND journal.pre_effect_intent_json=NEW.source_pre_effect_intent_json
						AND journal.pre_effect_intent_bytes=NEW.source_pre_effect_intent_bytes
						AND owner.service_kind='capability-runtime'
						AND owner.operation='execute-tool'
						AND owner.attempt_id=NEW.attempt_id
						AND owner.descriptor_digest=NEW.descriptor_digest
						AND owner.receipt_digest=NEW.source_owner_receipt_digest
						AND owner.owner_implementation_digest=
							NEW.source_authority_implementation_digest
						AND owner.completed_at <= NEW.sealed_at
						AND (NEW.source_effect_receipt_json->>'sealedAt')::timestamptz<=
							owner.completed_at
						AND (NEW.source_receipt_json->>'observedAt')::timestamptz=GREATEST(
							(NEW.source_effect_receipt_json->>'sealedAt')::timestamptz,
							owner.completed_at
						)
						AND owner.receipt_json#>>'{responseProjection,serviceKind}'=
							'capability-runtime'
						AND owner.receipt_json#>>'{responseProjection,operation}'='execute-tool'
						AND owner.receipt_json#>>'{responseProjection,executionAuthorityKind}'=
							'shared-effect'
						AND owner.receipt_json#>>'{responseProjection,invocationId}'=NEW.invocation_id
						AND (owner.receipt_json#>>'{responseProjection,turnIndex}')::bigint=
							NEW.turn_index
						AND owner.receipt_json#>>'{responseProjection,providerRequestDigest}'=
							NEW.provider_request_digest
						AND owner.receipt_json#>>'{responseProjection,preEffectIntentDigest}'=
							NEW.source_pre_effect_intent_digest
						AND owner.receipt_json#>>'{responseProjection,effectSourceReceiptDigest}'=
							NEW.source_effect_receipt_digest
						AND NULLIF(
							owner.receipt_json#>>'{responseProjection,effectSourceFactDigest}', ''
						) IS NOT DISTINCT FROM NEW.source_effect_fact_digest
						AND owner.receipt_json#>>'{responseProjection,resultDigest}'=
							NEW.source_business_result_digest
						AND owner.receipt_json#>>'{responseProjection,outcome}'=CASE
							WHEN NEW.source_receipt_json->>'outcome'='observed' THEN 'supported'
							WHEN NEW.source_receipt_json->>'outcome'='unavailable' THEN 'unsupported'
							ELSE 'failed'
						END
						AND jsonb_typeof(
							owner.receipt_json#>'{responseProjection,specificReceiptDigests}'
						)='array'
						AND jsonb_array_length(
							owner.receipt_json#>'{responseProjection,specificReceiptDigests}'
						)=0
						AND NEW.source_pre_effect_intent_json->>'namespaceId'=NEW.namespace_id
						AND NEW.source_pre_effect_intent_json->>'planDigest'=NEW.plan_digest
						AND NEW.source_pre_effect_intent_json->>'repositoryCommit'=NEW.repository_commit
						AND NEW.source_pre_effect_intent_json->>'attemptId'=NEW.attempt_id
						AND NEW.source_pre_effect_intent_json->>'descriptorDigest'=NEW.descriptor_digest
						AND (NEW.source_pre_effect_intent_json->>'turnIndex')::bigint=NEW.turn_index
						AND NEW.source_pre_effect_intent_json->>'invocationId'=NEW.invocation_id
						AND NEW.source_pre_effect_intent_json->>'providerRequestDigest'=
							NEW.provider_request_digest
						AND NEW.source_pre_effect_intent_json->>'registrationReceiptDigest'=
							NEW.registration_receipt_digest
						AND NEW.source_pre_effect_intent_json->>'ownerRequestDigest'
							~ '^sha256-[a-f0-9]{64}$'
						AND NEW.source_pre_effect_intent_json->>'ownerRequestId'=
							'capability-effect-owner-request.' || substring(
								NEW.source_pre_effect_intent_json->>'ownerRequestDigest' FROM 8
							)
						AND NEW.source_pre_effect_intent_json#>>'{runtimeFactSourceAuthority,sourceKind}'=
							NEW.source_kind
						AND NEW.source_pre_effect_intent_json#>>'{runtimeFactSourceAuthority,sourceAuthorityId}'=
							NEW.source_authority_id
						AND NEW.source_pre_effect_intent_json#>>'{runtimeFactSourceAuthority,sourceAuthorityImplementationDigest}'=
							NEW.source_authority_implementation_digest
						AND NEW.source_pre_effect_intent_json#>>'{runtimeFactSourceAuthority,routeBinding}'=
							NEW.source_authority_route_binding
						AND NEW.source_pre_effect_intent_json#>>'{runtimeFactSourceAuthority,registrationAuthorityIssuerId}'=
							NEW.registration_authority_issuer_id
						AND NEW.source_pre_effect_intent_json#>>'{runtimeFactSourceAuthority,registrationReceiptDigest}'=
							NEW.registration_receipt_digest
						AND NEW.source_pre_effect_intent_json#>>'{runtimeFactSourceAuthority,authorityDigest}'=
							NEW.target_authority_digest
						AND wire.response_json->>'executionAuthorityKind'='shared-effect'
						AND wire.response_json->>'outcome'=CASE
							WHEN NEW.source_receipt_json->>'outcome'='observed' THEN 'supported'
							WHEN NEW.source_receipt_json->>'outcome'='unavailable' THEN 'unsupported'
							ELSE 'failed'
						END
						AND wire.response_json->>'resultDigest'=
							NEW.source_business_result_digest
						AND jsonb_typeof(wire.response_json->'specificReceipts')='array'
						AND jsonb_array_length(wire.response_json->'specificReceipts')=0
						AND wire.response_json->'effectSourceReceipt'=
							NEW.source_effect_receipt_json
						AND wire.response_json#>>'{effectSourceReceipt,intentDigest}'=
							NEW.source_pre_effect_intent_digest
						AND wire.response_json#>>'{effectSourceReceipt,registrationReceiptDigest}'=
							NEW.registration_receipt_digest
						AND wire.response_json#>>'{effectSourceReceipt,businessResultDigest}'=
							NEW.source_business_result_digest
						AND wire.response_json#>>'{effectSourceReceipt,stageDigest}'=
							NEW.source_owner_stage_digest
						AND wire.response_json#>>'{effectSourceReceipt,dispatchAckDigest}'=
							NEW.source_owner_dispatch_ack_digest
						AND wire.response_json#>>'{effectSourceReceipt,transportReceiptDigest}'=
							NEW.transport_receipt_digest
						AND NEW.source_effect_receipt_json ? 'resultSpoolReceiptDigest'
						AND wire.response_json#>'{effectSourceReceipt,resultSpoolReceiptDigest}'
							IS NOT DISTINCT FROM COALESCE(
								to_jsonb(NEW.result_spool_receipt_digest), 'null'::jsonb
							)
						AND wire.response_json#>>'{effectSourceReceipt,normalizedEventSetDigest}'=
							NEW.normalized_event_set_digest
						AND wire.response_json#>>'{effectSourceReceipt,receiptDigest}'=
							NEW.source_effect_receipt_digest
						AND wire.response_json#>>'{effectSourceReceipt,effectStatus}'=CASE
							WHEN NEW.source_receipt_json->>'outcome'='observed' THEN 'produced'
							ELSE NEW.source_receipt_json->>'outcome'
						END
						AND NULLIF(
							wire.response_json#>>'{effectSourceReceipt,sourceFactDigest}', ''
						) IS NOT DISTINCT FROM NEW.source_effect_fact_digest
						AND NULLIF(
							wire.response_json#>>'{effectSourceFact,factDigest}', ''
						) IS NOT DISTINCT FROM NEW.source_effect_fact_digest
						AND (NEW.source_effect_fact_digest IS NULL OR (
							wire.response_json#>>'{effectSourceFact,factKind}'=NEW.fact_kind
							AND wire.response_json->'effectSourceFact'=NEW.fact_json
						))
						AND jsonb_typeof(
							wire.response_json#>'{effectSourceReceipt,specificReceiptDigests}'
						)='array'
						AND jsonb_array_length(
							wire.response_json#>'{effectSourceReceipt,specificReceiptDigests}'
						)=0
				) THEN
					RAISE EXCEPTION 'optional fact drifted from its sealed shared-effect owner authority'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_optional_fact_capacity()
				RETURNS trigger AS $$
			DECLARE
				source_count BIGINT;
				authority_count BIGINT;
				committed_bytes NUMERIC;
				old_bytes BIGINT := 0;
				new_bytes BIGINT := 0;
			BEGIN
				PERFORM 1 FROM agent_evaluation_plans
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
				FOR UPDATE;
				SELECT COUNT(*) INTO source_count
				FROM agent_evaluation_optional_capability_fact_sources
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit;
				SELECT COUNT(*) INTO authority_count
				FROM agent_evaluation_optional_fact_authorities
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit;
				IF TG_OP='INSERT' AND (
					(TG_TABLE_NAME='agent_evaluation_optional_capability_fact_sources'
						AND source_count >= 5880)
					OR (TG_TABLE_NAME='agent_evaluation_optional_fact_authorities'
						AND authority_count >= 5880)
				) THEN
					RAISE EXCEPTION 'optional capability fact authority exceeds frozen record capacity'
						USING ERRCODE = '23514';
				END IF;
				SELECT
					COALESCE((SELECT SUM(
						octet_length(source_receipt_bytes)
						+COALESCE(octet_length(source_pre_effect_intent_bytes),0)
						+COALESCE(octet_length(source_effect_receipt_bytes),0)
						+COALESCE(octet_length(fact_bytes),0)
					) FROM agent_evaluation_optional_capability_fact_sources
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit),0)
					+ COALESCE((SELECT SUM(
						octet_length(request_bytes)+COALESCE(octet_length(fact_bytes),0)
						+COALESCE(octet_length(runtime_fact_envelope_bytes),0)
						+COALESCE(octet_length(fact_authority_bytes),0)
						+COALESCE(octet_length(response_bytes),0)
					) FROM agent_evaluation_optional_fact_authorities
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit),0)
				INTO committed_bytes;
				IF TG_TABLE_NAME='agent_evaluation_optional_capability_fact_sources' THEN
					new_bytes := octet_length(NEW.source_receipt_bytes)
						+COALESCE(octet_length(NEW.source_pre_effect_intent_bytes),0)
						+COALESCE(octet_length(NEW.source_effect_receipt_bytes),0)+
						COALESCE(octet_length(NEW.fact_bytes),0);
					IF TG_OP='UPDATE' THEN
						old_bytes := octet_length(OLD.source_receipt_bytes)
							+COALESCE(octet_length(OLD.source_pre_effect_intent_bytes),0)
							+COALESCE(octet_length(OLD.source_effect_receipt_bytes),0)+
							COALESCE(octet_length(OLD.fact_bytes),0);
					END IF;
				ELSE
					new_bytes := octet_length(NEW.request_bytes)+COALESCE(octet_length(NEW.fact_bytes),0)
						+COALESCE(octet_length(NEW.runtime_fact_envelope_bytes),0)
						+COALESCE(octet_length(NEW.fact_authority_bytes),0)
						+COALESCE(octet_length(NEW.response_bytes),0);
					IF TG_OP='UPDATE' THEN
						old_bytes := octet_length(OLD.request_bytes)+COALESCE(octet_length(OLD.fact_bytes),0)
							+COALESCE(octet_length(OLD.runtime_fact_envelope_bytes),0)
							+COALESCE(octet_length(OLD.fact_authority_bytes),0)
							+COALESCE(octet_length(OLD.response_bytes),0);
					END IF;
				END IF;
				IF committed_bytes-old_bytes+new_bytes > 8589934592 THEN
					RAISE EXCEPTION 'optional capability fact authority exceeds frozen byte capacity'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_optional_fact_sources_exact_binding
				BEFORE INSERT ON agent_evaluation_optional_capability_fact_sources
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_optional_capability_fact_source_binding()`,
			`CREATE TRIGGER agent_evaluation_optional_fact_sources_capacity
				BEFORE INSERT ON agent_evaluation_optional_capability_fact_sources
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_optional_fact_capacity()`,
			`CREATE TRIGGER agent_evaluation_optional_fact_sources_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_optional_capability_fact_sources
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_optional_fact_sources_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_optional_capability_fact_sources
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_optional_fact_source_reference()
				RETURNS trigger AS $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_optional_capability_fact_sources source
					WHERE source.namespace_id=NEW.namespace_id
						AND source.plan_digest=NEW.plan_digest
						AND source.repository_commit=NEW.repository_commit
						AND source.source_seal_digest=NEW.source_seal_digest
						AND source.v45_eligible
						AND source.attempt_id=NEW.attempt_id
						AND source.descriptor_digest=NEW.descriptor_digest
						AND source.target_id=NEW.target_id
						AND source.target_digest=NEW.target_digest
						AND source.capability_profile_id=NEW.capability_profile_id
						AND source.capability_profile_digest=NEW.capability_profile_digest
						AND source.capability_descriptor_digest=NEW.capability_descriptor_digest
						AND source.capability_id=NEW.capability_id
						AND source.support_expectation=NEW.support_expectation
						AND source.turn_index=NEW.turn_index
						AND source.invocation_id=NEW.invocation_id
						AND source.protocol_family=NEW.protocol_family
						AND source.provider_configuration_id=NEW.provider_configuration_id
						AND source.model_id=NEW.model_id
						AND source.model_lineage_digest=NEW.model_lineage_digest
						AND source.adapter_digest=NEW.adapter_digest
						AND source.provider_request_digest=NEW.provider_request_digest
						AND source.response_digest=NEW.response_digest
						AND source.dispatch_intent_digest=NEW.dispatch_intent_digest
						AND source.transport_receipt_digest=NEW.transport_receipt_digest
						AND source.result_spool_receipt_digest IS NOT DISTINCT FROM
							NEW.result_spool_receipt_digest
						AND source.normalized_event_set_digest=NEW.normalized_event_set_digest
						AND source.target_authority_digest=NEW.target_authority_digest
						AND source.source_authority_id=NEW.source_authority_id
						AND source.source_authority_implementation_digest=
							NEW.source_authority_implementation_digest
						AND source.source_authority_route_binding=
							NEW.source_authority_route_binding
						AND source.registration_authority_issuer_id=
							NEW.source_registration_authority_issuer_id
						AND source.registration_receipt_digest=
							NEW.source_registration_receipt_digest
						AND source.source_kind=NEW.source_kind
						AND source.source_digest=NEW.source_digest
						AND source.sealed_at<=NEW.staged_at
						AND source.source_owner_request_digest=NEW.source_owner_request_digest
						AND source.source_owner_receipt_digest=NEW.source_owner_receipt_digest
						AND source.source_owner_stage_digest=NEW.source_owner_stage_digest
						AND source.source_owner_dispatch_ack_digest=
							NEW.source_owner_dispatch_ack_digest
						AND source.source_pre_effect_intent_digest=
							NEW.source_pre_effect_intent_digest
						AND source.source_effect_receipt_digest=NEW.source_effect_receipt_digest
						AND source.source_effect_fact_digest IS NOT DISTINCT FROM
							NEW.source_effect_fact_digest
						AND source.source_business_result_digest=NEW.source_business_result_digest
						AND (NEW.outcome IS NULL
							OR (NEW.outcome='observed'
								AND source.fact_kind=NEW.fact_kind
								AND source.fact_digest=NEW.fact_digest
								AND source.fact_json=NEW.fact_json
								AND (source.source_receipt_json->>'observedAt')::timestamptz=
									(NEW.runtime_fact_envelope_json->>'observedAt')::timestamptz
								AND source.source_effect_receipt_json->>'transportReceiptDigest'=
									NEW.runtime_fact_envelope_json->>'transportReceiptDigest'
								AND source.source_effect_receipt_json->>'resultSpoolReceiptDigest'=
									NEW.runtime_fact_envelope_json->>'resultSpoolReceiptDigest'
								AND source.source_effect_receipt_json->>'normalizedEventSetDigest'=
									NEW.runtime_fact_envelope_json->>'normalizedEventSetDigest'
								AND source.source_effect_receipt_json->>'transportReceiptDigest'=
									NEW.fact_authority_json->>'transportReceiptDigest'
								AND source.source_effect_receipt_json->>'resultSpoolReceiptDigest'=
									NEW.fact_authority_json->>'resultSpoolReceiptDigest'
								AND source.source_effect_receipt_json->>'normalizedEventSetDigest'=
									NEW.fact_authority_json->>'normalizedEventSetDigest')
							OR (NEW.outcome IN ('unavailable','failed')
								AND source.fact_kind IS NULL))
				) THEN
					RAISE EXCEPTION 'optional capability fact authority lacks its exact sealed source'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_optional_fact_transition()
				RETURNS trigger AS $$
			BEGIN
				IF TG_OP='DELETE' THEN
					RAISE EXCEPTION 'optional capability fact authority is immutable'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.outcome='observed' THEN
					IF jsonb_typeof(NEW.runtime_fact_envelope_json) <> 'object'
						OR jsonb_typeof(NEW.fact_authority_json) <> 'object' THEN
						RAISE EXCEPTION 'observed optional capability fact authority shape is invalid'
							USING ERRCODE = '23514';
					END IF;
					IF (SELECT COUNT(*) FROM jsonb_object_keys(
						NEW.runtime_fact_envelope_json
					)) <> 31 OR (SELECT COUNT(*) FROM jsonb_object_keys(
						NEW.fact_authority_json
					)) <> 19 THEN
						RAISE EXCEPTION 'observed optional capability fact authority shape is invalid'
							USING ERRCODE = '23514';
					END IF;
				END IF;
				IF TG_OP='INSERT' THEN
					IF NEW.state <> 'staged' OR NEW.v45_eligible IS DISTINCT FROM TRUE THEN
						RAISE EXCEPTION 'new optional capability fact authority must start staged/current'
							USING ERRCODE = '23514';
					END IF;
					RETURN NEW;
				END IF;
				IF OLD.state <> 'staged' OR NEW.state <> 'sealed'
					OR (to_jsonb(OLD) - ARRAY[
						'state','outcome','fact_kind','fact_digest','dispatch_ack_digest',
						'runtime_fact_envelope_digest','fact_authority_digest','result_digest',
						'sealed_at','fact_json','fact_bytes','runtime_fact_envelope_json',
						'runtime_fact_envelope_bytes','fact_authority_json','fact_authority_bytes',
						'response_json','response_bytes'
					]) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY[
						'state','outcome','fact_kind','fact_digest','dispatch_ack_digest',
						'runtime_fact_envelope_digest','fact_authority_digest','result_digest',
						'sealed_at','fact_json','fact_bytes','runtime_fact_envelope_json',
						'runtime_fact_envelope_bytes','fact_authority_json','fact_authority_bytes',
						'response_json','response_bytes'
					]) THEN
					RAISE EXCEPTION 'optional capability fact authority transition or immutable binding drifted'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_optional_fact_authorities_transition
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_optional_fact_authorities
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_optional_fact_transition()`,
			`CREATE TRIGGER agent_evaluation_optional_fact_authorities_source_binding
				BEFORE INSERT OR UPDATE ON agent_evaluation_optional_fact_authorities
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_optional_fact_source_reference()`,
			`CREATE TRIGGER agent_evaluation_optional_fact_authorities_capacity
				BEFORE INSERT OR UPDATE ON agent_evaluation_optional_fact_authorities
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_optional_fact_capacity()`,
			`CREATE TRIGGER agent_evaluation_optional_fact_authorities_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_optional_fact_authorities
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_provider_capability_observation_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				observation_receipt_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				response_digest TEXT NOT NULL,
				protocol_family TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				model_lineage_digest TEXT NOT NULL,
				adapter_digest TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				result_spool_receipt_digest TEXT NOT NULL,
				normalized_event_set_digest TEXT NOT NULL,
				selected_runtime_fact_envelope_set_digest TEXT NOT NULL,
				source_authority_set_digest TEXT NOT NULL,
				observation_digest TEXT NOT NULL,
				observed_at TIMESTAMPTZ NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, observation_receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, attempt_id, turn_index),
				UNIQUE (namespace_id, plan_digest, repository_commit, attempt_id, invocation_id),
				UNIQUE (
					namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest
				),
				UNIQUE (
					namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest,
					turn_index, invocation_id, request_digest, receipt_digest
				),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id)
					REFERENCES agent_evaluation_attempts(namespace_id, plan_digest, attempt_id)
					ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (
					namespace_id, plan_digest, attempt_id, turn_index, dispatch_intent_digest
				) REFERENCES agent_evaluation_transport_dispatch_intents(
					namespace_id, plan_digest, attempt_id, turn_index, intent_digest
				) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, attempt_id, turn_index, transport_receipt_digest
				) REFERENCES agent_evaluation_transport_receipts(
					namespace_id, plan_digest, attempt_id, turn_index, receipt_digest
				) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, attempt_id, turn_index, result_spool_receipt_digest
				) REFERENCES agent_evaluation_provider_result_spool_receipts(
					namespace_id, plan_digest, attempt_id, turn_index, receipt_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_provider_capability_observation_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_provider_capability_observation_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND selected_runtime_fact_envelope_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_authority_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND observation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_provider_capability_observation_bounds_check CHECK (
					turn_index BETWEEN 0 AND 6
					AND protocol_family IN ('openai-responses', 'anthropic-messages', 'gemini-interactions')
					AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
					AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb
				),
				CONSTRAINT agent_evaluation_provider_capability_observation_facts_check CHECK (
					receipt_json ? 'facts'
					AND jsonb_typeof(receipt_json->'facts') = 'array'
					AND jsonb_array_length(receipt_json->'facts') BETWEEN 0 AND 2
					AND receipt_json ? 'factAuthorities'
					AND jsonb_typeof(receipt_json->'factAuthorities') = 'array'
					AND jsonb_array_length(receipt_json->'factAuthorities') =
						jsonb_array_length(receipt_json->'facts')
				),
				CONSTRAINT agent_evaluation_provider_capability_observation_json_binding_check CHECK (COALESCE((
					receipt_json ?& ARRAY[
						'format', 'version', 'observationReceiptId', 'planDigest',
						'repositoryCommit', 'attemptId', 'descriptorDigest', 'turnIndex',
						'invocationId', 'requestDigest', 'responseDigest', 'protocolFamily',
						'providerConfigurationId', 'modelLineageDigest', 'adapterDigest',
						'dispatchIntentDigest', 'transportReceiptDigest',
						'resultSpoolReceiptDigest', 'normalizedEventSetDigest', 'facts',
						'factAuthorities', 'selectedRuntimeFactEnvelopeSetDigest',
						'sourceAuthoritySetDigest', 'observationDigest', 'observedAt', 'receiptDigest'
					]
					AND receipt_json->>'planDigest' = plan_digest
					AND receipt_json->>'repositoryCommit' = repository_commit
					AND receipt_json->>'observationReceiptId' = observation_receipt_id
					AND receipt_json->>'attemptId' = attempt_id
					AND receipt_json->>'descriptorDigest' = descriptor_digest
					AND (receipt_json->>'turnIndex')::bigint = turn_index
					AND receipt_json->>'invocationId' = invocation_id
					AND receipt_json->>'requestDigest' = request_digest
					AND receipt_json->>'responseDigest' = response_digest
					AND receipt_json->>'protocolFamily' = protocol_family
					AND receipt_json->>'providerConfigurationId' = provider_configuration_id
					AND receipt_json->>'modelLineageDigest' = model_lineage_digest
					AND receipt_json->>'adapterDigest' = adapter_digest
					AND receipt_json->>'dispatchIntentDigest' = dispatch_intent_digest
					AND receipt_json->>'transportReceiptDigest' = transport_receipt_digest
					AND receipt_json->>'resultSpoolReceiptDigest' = result_spool_receipt_digest
					AND receipt_json->>'normalizedEventSetDigest' = normalized_event_set_digest
					AND receipt_json->>'selectedRuntimeFactEnvelopeSetDigest' =
						selected_runtime_fact_envelope_set_digest
					AND receipt_json->>'sourceAuthoritySetDigest' = source_authority_set_digest
					AND receipt_json->>'observationDigest' = observation_digest
					AND (receipt_json->>'observedAt')::timestamptz = observed_at
					AND receipt_json->>'receiptDigest' = receipt_digest
				), FALSE))
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_capability_observation_binding()
				RETURNS trigger AS $$
			DECLARE
				binding_exists BOOLEAN;
				observed_fact JSONB;
				fact_authority JSONB;
				expected_source_kind TEXT;
			BEGIN
				IF jsonb_typeof(NEW.receipt_json) <> 'object'
					OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW.receipt_json)) <> 26 THEN
					RAISE EXCEPTION 'provider capability observation receipt shape is invalid'
						USING ERRCODE = '23514';
				END IF;
				IF EXISTS (
					SELECT 1 FROM agent_evaluation_controlled_authority_requests legacy
					WHERE legacy.namespace_id=NEW.namespace_id
						AND legacy.plan_digest=NEW.plan_digest
						AND legacy.repository_commit=NEW.repository_commit
						AND legacy.attempt_id=NEW.attempt_id
						AND legacy.service_kind IN ('provider-capability', 'attempt-grading')
						AND NOT legacy.v45_eligible
				) THEN
					RAISE EXCEPTION 'legacy attempt cannot accept v45 provider observations'
						USING ERRCODE = '23514';
				END IF;
				SELECT EXISTS (
					SELECT 1
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
					WHERE intent.namespace_id=NEW.namespace_id AND intent.plan_digest=NEW.plan_digest
						AND intent.repository_commit=NEW.repository_commit
						AND transport.repository_commit=NEW.repository_commit
						AND spool.repository_commit=NEW.repository_commit
						AND intent.attempt_id=NEW.attempt_id AND intent.turn_index=NEW.turn_index
						AND intent.descriptor_digest=NEW.descriptor_digest
						AND transport.descriptor_digest=NEW.descriptor_digest
						AND spool.descriptor_digest=NEW.descriptor_digest
						AND intent.invocation_id=NEW.invocation_id
						AND transport.invocation_id=NEW.invocation_id
						AND spool.invocation_id=NEW.invocation_id
						AND intent.request_digest=NEW.request_digest
						AND intent.protocol_family=NEW.protocol_family
						AND intent.provider_configuration_id=NEW.provider_configuration_id
						AND transport.provider_configuration_id=NEW.provider_configuration_id
						AND intent.model_lineage_digest=NEW.model_lineage_digest
						AND intent.intent_digest=NEW.dispatch_intent_digest
						AND transport.intent_digest=NEW.dispatch_intent_digest
						AND transport.receipt_digest=NEW.transport_receipt_digest
						AND transport.outcome='completed'
						AND spool.dispatch_intent_digest=NEW.dispatch_intent_digest
						AND spool.transport_receipt_digest=NEW.transport_receipt_digest
						AND spool.response_body_digest=transport.response_body_digest
						AND spool.receipt_digest=NEW.result_spool_receipt_digest
						AND spool.normalized_event_set_digest=NEW.normalized_event_set_digest
						AND spool.response_digest=NEW.response_digest
						AND NEW.observed_at >= spool.created_at
				) INTO binding_exists;
				IF NOT binding_exists THEN
					RAISE EXCEPTION 'agent evaluation provider observation drifted from its transport/spool authority'
						USING ERRCODE = '23514';
				END IF;
				FOR observed_fact, fact_authority IN
					SELECT facts.value, authorities.value
					FROM jsonb_array_elements(NEW.receipt_json->'facts') WITH ORDINALITY facts(value, ordinal)
					JOIN jsonb_array_elements(NEW.receipt_json->'factAuthorities')
						WITH ORDINALITY authorities(value, ordinal)
						USING (ordinal)
				LOOP
					IF jsonb_typeof(observed_fact) <> 'object'
						OR jsonb_typeof(fact_authority) <> 'object'
						OR NOT (fact_authority ?& ARRAY[
							'format','version','factKind','factDigest','sourceAuthorityKind',
							'sourceAuthorityId','sourceAuthorityImplementationDigest','sourceKind',
							'routeBinding','registrationAuthorityIssuerId','registrationReceiptDigest',
							'runtimeFactSourceAuthorityDigest','stageDigest','dispatchAckDigest',
							'transportReceiptDigest','resultSpoolReceiptDigest',
							'normalizedEventSetDigest','runtimeFactEnvelopeDigest','authorityDigest'
						])
						OR (SELECT COUNT(*) FROM jsonb_object_keys(fact_authority)) <> 19
						OR fact_authority->>'format' <>
							'prodivix.agent-evaluation-provider-capability-fact-authority'
						OR (fact_authority->>'version')::bigint <> 1
						OR fact_authority->>'factKind' <> observed_fact->>'factKind'
						OR fact_authority->>'factDigest' <> observed_fact->>'factDigest' THEN
						RAISE EXCEPTION 'provider observation fact authority shape or fact binding drifted'
							USING ERRCODE = '23514';
					END IF;
					IF observed_fact->>'factKind' IN ('provider-event', 'usage-vector') THEN
						IF fact_authority->>'sourceAuthorityKind' <> 'native-provider-transport'
							OR fact_authority->>'sourceKind' IS NOT NULL
							OR fact_authority->>'routeBinding' IS NOT NULL
							OR fact_authority->>'registrationAuthorityIssuerId' IS NOT NULL
							OR fact_authority->>'registrationReceiptDigest' IS NOT NULL
							OR fact_authority->>'runtimeFactSourceAuthorityDigest' IS NOT NULL
							OR fact_authority->>'sourceAuthorityId' <> NEW.provider_configuration_id
							OR fact_authority->>'sourceAuthorityImplementationDigest' <>
								NEW.adapter_digest
							OR fact_authority->>'stageDigest' <> NEW.dispatch_intent_digest
							OR fact_authority->>'dispatchAckDigest' <> NEW.transport_receipt_digest
							OR fact_authority->>'transportReceiptDigest' <>
								NEW.transport_receipt_digest
							OR fact_authority->>'resultSpoolReceiptDigest' <>
								NEW.result_spool_receipt_digest
							OR fact_authority->>'normalizedEventSetDigest' <>
								NEW.normalized_event_set_digest THEN
							RAISE EXCEPTION 'native provider observation fact authority drifted from dispatch'
								USING ERRCODE = '23514';
						END IF;
					END IF;
					expected_source_kind := CASE
						WHEN observed_fact->>'factKind'='retrieval-query-receipt'
							THEN 'sealed-hosted-owner-result'
						ELSE 'sealed-provider-response-metadata'
					END;
					IF observed_fact->>'factKind' NOT IN ('provider-event', 'usage-vector')
						AND (fact_authority->>'sourceAuthorityKind' <> 'shared-durable-capability'
						OR fact_authority->>'sourceKind' IS NULL
						OR fact_authority->>'routeBinding' IS NULL
						OR fact_authority->>'registrationAuthorityIssuerId' IS NULL
						OR fact_authority->>'registrationReceiptDigest' IS NULL
						OR fact_authority->>'runtimeFactSourceAuthorityDigest' IS NULL
						OR fact_authority->>'sourceKind' <> expected_source_kind
						OR NOT EXISTS (
							SELECT 1 FROM agent_evaluation_optional_fact_authorities authority
							WHERE authority.namespace_id=NEW.namespace_id
								AND authority.plan_digest=NEW.plan_digest
								AND authority.repository_commit=NEW.repository_commit
								AND authority.attempt_id=NEW.attempt_id
								AND authority.descriptor_digest=NEW.descriptor_digest
								AND authority.turn_index=NEW.turn_index
								AND authority.invocation_id=NEW.invocation_id
								AND authority.provider_request_digest=NEW.request_digest
								AND authority.response_digest=NEW.response_digest
								AND authority.protocol_family=NEW.protocol_family
								AND authority.provider_configuration_id=NEW.provider_configuration_id
								AND authority.model_lineage_digest=NEW.model_lineage_digest
								AND authority.adapter_digest=NEW.adapter_digest
								AND authority.dispatch_intent_digest=NEW.dispatch_intent_digest
								AND authority.transport_receipt_digest=
									fact_authority->>'transportReceiptDigest'
								AND authority.result_spool_receipt_digest=
									fact_authority->>'resultSpoolReceiptDigest'
								AND authority.normalized_event_set_digest=
									fact_authority->>'normalizedEventSetDigest'
								AND authority.state='sealed' AND authority.v45_eligible
								AND authority.outcome='observed'
								AND authority.fact_kind=observed_fact->>'factKind'
								AND authority.fact_digest=observed_fact->>'factDigest'
								AND authority.source_authority_id=
									fact_authority->>'sourceAuthorityId'
								AND authority.source_authority_implementation_digest=
									fact_authority->>'sourceAuthorityImplementationDigest'
								AND authority.source_kind=fact_authority->>'sourceKind'
								AND authority.source_authority_route_binding=
									fact_authority->>'routeBinding'
								AND authority.source_registration_authority_issuer_id=
									fact_authority->>'registrationAuthorityIssuerId'
								AND authority.source_registration_receipt_digest=
									fact_authority->>'registrationReceiptDigest'
								AND authority.target_authority_digest=
									fact_authority->>'runtimeFactSourceAuthorityDigest'
								AND authority.source_owner_stage_digest=
									fact_authority->>'stageDigest'
								AND authority.source_owner_dispatch_ack_digest=
									fact_authority->>'dispatchAckDigest'
								AND authority.runtime_fact_envelope_digest=
									fact_authority->>'runtimeFactEnvelopeDigest'
								AND authority.fact_authority_digest=fact_authority->>'authorityDigest'
								AND authority.fact_json=observed_fact
								AND authority.fact_authority_json=fact_authority
								AND EXISTS (
									SELECT 1
									FROM agent_evaluation_optional_capability_fact_sources source
									JOIN agent_evaluation_runtime_fact_source_owner_registrations registration
									  ON registration.namespace_id=source.namespace_id
									 AND registration.repository_commit=source.repository_commit
									 AND registration.registration_receipt_digest=
										source.registration_receipt_digest
									WHERE source.namespace_id=authority.namespace_id
										AND source.plan_digest=authority.plan_digest
										AND source.repository_commit=authority.repository_commit
										AND source.source_seal_digest=authority.source_seal_digest
										AND source.v45_eligible
										AND source.attempt_id=authority.attempt_id
										AND source.descriptor_digest=authority.descriptor_digest
										AND source.turn_index=authority.turn_index
										AND source.invocation_id=authority.invocation_id
										AND source.provider_request_digest=
											authority.provider_request_digest
										AND source.response_digest=authority.response_digest
										AND source.dispatch_intent_digest=
											authority.dispatch_intent_digest
										AND source.transport_receipt_digest=
											authority.transport_receipt_digest
										AND source.result_spool_receipt_digest=
											authority.result_spool_receipt_digest
										AND source.normalized_event_set_digest=
											authority.normalized_event_set_digest
										AND source.target_authority_digest=authority.target_authority_digest
										AND source.source_authority_id=authority.source_authority_id
										AND source.source_authority_implementation_digest=
											authority.source_authority_implementation_digest
										AND source.source_authority_route_binding=
											authority.source_authority_route_binding
										AND source.registration_authority_issuer_id=
											authority.source_registration_authority_issuer_id
										AND source.registration_receipt_digest=
											authority.source_registration_receipt_digest
										AND source.source_kind=authority.source_kind
										AND source.source_owner_request_digest=
											authority.source_owner_request_digest
										AND source.source_owner_receipt_digest=
											authority.source_owner_receipt_digest
										AND source.source_owner_stage_digest=
											authority.source_owner_stage_digest
										AND source.source_owner_dispatch_ack_digest=
											authority.source_owner_dispatch_ack_digest
										AND source.source_pre_effect_intent_digest=
											authority.source_pre_effect_intent_digest
										AND source.source_effect_receipt_digest=
											authority.source_effect_receipt_digest
										AND source.source_effect_fact_digest IS NOT DISTINCT FROM
											authority.source_effect_fact_digest
										AND source.source_business_result_digest=
											authority.source_business_result_digest
										AND source.source_effect_receipt_json->>'transportReceiptDigest'=
											fact_authority->>'transportReceiptDigest'
										AND source.source_effect_receipt_json->>'resultSpoolReceiptDigest'=
											fact_authority->>'resultSpoolReceiptDigest'
										AND source.source_effect_receipt_json->>'normalizedEventSetDigest'=
											fact_authority->>'normalizedEventSetDigest'
										AND source.fact_kind=authority.fact_kind
										AND source.fact_digest=authority.fact_digest
										AND source.fact_json=authority.fact_json
										AND registration.state='sealed' AND registration.v45_eligible
										AND registration.source_authority_kind='shared-durable-capability'
										AND registration.source_kind=authority.source_kind
										AND registration.source_authority_id=authority.source_authority_id
										AND registration.source_authority_implementation_digest=
											authority.source_authority_implementation_digest
										AND registration.route_binding=authority.source_authority_route_binding
										AND registration.capability_profile_id=authority.capability_profile_id
										AND registration.capability_profile_digest=
											authority.capability_profile_digest
										AND registration.capability_id=authority.capability_id
										AND registration.protocol_family=authority.protocol_family
										AND registration.provider_configuration_id=
											authority.provider_configuration_id
										AND registration.model_id=authority.model_id
										AND registration.model_lineage_digest=authority.model_lineage_digest
										AND registration.adapter_digest=authority.adapter_digest
										AND registration.registration_authority_issuer_id=
											authority.source_registration_authority_issuer_id
										AND registration.registered_at <= authority.sealed_at
										AND registration.expires_at >= authority.sealed_at
								)
								AND EXISTS (
									SELECT 1
									FROM agent_evaluation_plans plan
									CROSS JOIN LATERAL jsonb_array_elements(
										plan.plan_json#>'{value,capabilityQualificationTargets}'
									) target
									WHERE plan.namespace_id=authority.namespace_id
										AND plan.plan_digest=authority.plan_digest
										AND plan.repository_commit=authority.repository_commit
										AND target->>'targetId'=authority.target_id
										AND target->>'targetDigest'=authority.target_digest
										AND target->>'capabilityProfileId'=authority.capability_profile_id
										AND target->>'capabilityProfileDigest'=
											authority.capability_profile_digest
										AND target#>>'{optionalCapabilitySupportAuthority,capabilityId}'=
											authority.capability_id
										AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,sourceKind}'=
											fact_authority->>'sourceKind'
										AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,sourceAuthorityId}'=
											fact_authority->>'sourceAuthorityId'
										AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,sourceAuthorityImplementationDigest}'=
											fact_authority->>'sourceAuthorityImplementationDigest'
										AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,routeBinding}'=
											fact_authority->>'routeBinding'
										AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,registrationAuthorityIssuerId}'=
											fact_authority->>'registrationAuthorityIssuerId'
										AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,registrationReceiptDigest}'=
											fact_authority->>'registrationReceiptDigest'
										AND target#>>'{optionalCapabilitySupportAuthority,runtimeFactSourceAuthority,authorityDigest}'=
											fact_authority->>'runtimeFactSourceAuthorityDigest'
								)
					)) THEN
						RAISE EXCEPTION 'shared provider observation fact lacks sealed durable authority'
							USING ERRCODE = '23514';
					END IF;
				END LOOP;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_provider_capability_observation_receipts_exact_binding
				BEFORE INSERT ON agent_evaluation_provider_capability_observation_receipts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_capability_observation_binding()`,
			`CREATE TRIGGER agent_evaluation_provider_capability_observation_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_provider_capability_observation_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_provider_capability_observation_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_provider_capability_observation_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE OR REPLACE FUNCTION agent_evaluation_jsonb_object_key_count(candidate JSONB)
				RETURNS BIGINT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
					SELECT CASE WHEN jsonb_typeof(candidate)='object'
						THEN (SELECT COUNT(*) FROM jsonb_object_keys(candidate))
						ELSE -1 END
				$$`,
			`CREATE OR REPLACE FUNCTION agent_evaluation_jsonb_array_value_count(
				candidate JSONB,
				expected JSONB
			) RETURNS BIGINT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
				SELECT CASE WHEN jsonb_typeof(candidate)='array'
					THEN (SELECT COUNT(*) FROM jsonb_array_elements(candidate) element WHERE element=expected)
					ELSE -1 END
			$$`,
			`DO $$
			BEGIN
				IF EXISTS (SELECT 1 FROM agent_evaluation_holdout_closures)
					OR EXISTS (SELECT 1 FROM agent_evaluation_archive_closures) THEN
					RAISE EXCEPTION 'path-only evaluation closure requires a fresh run-config artifact qualification'
						USING ERRCODE='23514';
				END IF;
			END $$`,
			`CREATE OR REPLACE FUNCTION agent_evaluation_production_run_config_artifact_binding_valid(
				candidate JSONB,
				candidate_bytes BYTEA,
				candidate_binding_digest TEXT,
				candidate_source_config_digest TEXT,
				candidate_frozen_run_digest TEXT,
				candidate_plan_digest TEXT,
				candidate_repository_commit TEXT
			) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
				SELECT COALESCE(
					jsonb_typeof(candidate)='object'
					AND agent_evaluation_jsonb_object_key_count(candidate)=14
					AND candidate ?& ARRAY[
						'format','version','sourcePlanArtifactName','sourcePlanArtifactDigest',
						'sourcePlanWorkflowRunId','sourcePlanWorkflowRunAttempt','runConfigFileName',
						'runConfigByteLength','runConfigCanonicalBytesDigest','sourceConfigDigest',
						'frozenRunDigest','planDigest','repositoryCommit','bindingDigest'
					]
					AND octet_length(candidate_bytes) BETWEEN 1 AND 16384
					AND candidate=convert_from(candidate_bytes,'UTF8')::jsonb
					AND candidate->>'format'=
						'prodivix.agent-evaluation-production-run-config-artifact-binding'
					AND (candidate->>'version')::bigint=1
					AND candidate->>'sourcePlanArtifactName' ~
						'^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$'
					AND candidate->>'sourcePlanArtifactDigest' ~ '^sha256:[a-f0-9]{64}$'
					AND candidate->>'sourcePlanWorkflowRunId' ~ '^[1-9][0-9]{0,19}$'
					AND (candidate->>'sourcePlanWorkflowRunAttempt')::bigint>=1
					AND candidate->>'runConfigFileName'='production-run-config.json'
					AND (candidate->>'runConfigByteLength')::bigint BETWEEN 2 AND 16777216
					AND candidate->>'runConfigCanonicalBytesDigest'=candidate_source_config_digest
					AND candidate->>'sourceConfigDigest'=candidate_source_config_digest
					AND candidate->>'frozenRunDigest'=candidate_frozen_run_digest
					AND candidate->>'planDigest'=candidate_plan_digest
					AND candidate->>'repositoryCommit'=candidate_repository_commit
					AND candidate->>'bindingDigest'=candidate_binding_digest,
					FALSE
				)
			$$`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_production_run_config_artifacts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				binding_digest TEXT NOT NULL,
				binding_json JSONB NOT NULL,
				binding_bytes BYTEA NOT NULL,
				run_config_json JSONB NOT NULL,
				run_config_bytes BYTEA NOT NULL,
				source_config_digest TEXT NOT NULL,
				frozen_run_digest TEXT NOT NULL,
				ingress_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				stored_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit),
				UNIQUE (namespace_id, binding_digest),
				UNIQUE (namespace_id, ingress_digest),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, binding_digest),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				CONSTRAINT agent_eval_production_run_config_artifact_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND repository_commit ~ '^[a-f0-9]{40}$'
					AND binding_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_config_digest ~ '^sha256-[a-f0-9]{64}$'
					AND frozen_run_digest ~ '^sha256-[a-f0-9]{64}$'
					AND ingress_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_eval_production_run_config_artifact_binding_check CHECK (
					agent_evaluation_production_run_config_artifact_binding_valid(
						binding_json,binding_bytes,binding_digest,source_config_digest,
						frozen_run_digest,plan_digest,repository_commit
					)
				),
				CONSTRAINT agent_eval_production_run_config_artifact_bytes_check CHECK (
					jsonb_typeof(run_config_json)='object'
					AND octet_length(run_config_bytes) BETWEEN 2 AND 16777216
					AND run_config_json=convert_from(run_config_bytes,'UTF8')::jsonb
					AND (binding_json->>'runConfigByteLength')::bigint=
						octet_length(run_config_bytes)
					AND octet_length(receipt_bytes) BETWEEN 1 AND 65536
				),
				CONSTRAINT agent_eval_production_run_config_artifact_receipt_check CHECK (COALESCE((
					jsonb_typeof(convert_from(receipt_bytes,'UTF8')::jsonb)='object'
					AND agent_evaluation_jsonb_object_key_count(
						convert_from(receipt_bytes,'UTF8')::jsonb
					)=10
					AND convert_from(receipt_bytes,'UTF8')::jsonb ?& ARRAY[
						'format','version','namespaceId','planDigest','repositoryCommit',
						'bindingDigest','sourceConfigDigest','storedAt','ingressDigest','receiptDigest'
					]
					AND convert_from(receipt_bytes,'UTF8')::jsonb->>'format'=
						'prodivix.agent-evaluation-production-run-config-artifact-ingress-receipt'
					AND (convert_from(receipt_bytes,'UTF8')::jsonb->>'version')::bigint=1
					AND convert_from(receipt_bytes,'UTF8')::jsonb->>'namespaceId'=namespace_id
					AND convert_from(receipt_bytes,'UTF8')::jsonb->>'planDigest'=plan_digest
					AND convert_from(receipt_bytes,'UTF8')::jsonb->>'repositoryCommit'=repository_commit
					AND convert_from(receipt_bytes,'UTF8')::jsonb->>'bindingDigest'=binding_digest
					AND convert_from(receipt_bytes,'UTF8')::jsonb->>'sourceConfigDigest'=
						source_config_digest
					AND (convert_from(receipt_bytes,'UTF8')::jsonb->>'storedAt')::timestamptz=stored_at
					AND convert_from(receipt_bytes,'UTF8')::jsonb->>'ingressDigest'=ingress_digest
					AND convert_from(receipt_bytes,'UTF8')::jsonb->>'receiptDigest'=receipt_digest
				),FALSE))
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_production_run_config_artifact_binding()
				RETURNS trigger AS $$
			DECLARE
				plan_planned_at TIMESTAMPTZ;
				plan_expires_at TIMESTAMPTZ;
			BEGIN
				SELECT planned_at,expires_at INTO plan_planned_at,plan_expires_at
				FROM agent_evaluation_plans
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
				FOR SHARE;
				IF NOT FOUND OR NEW.stored_at<plan_planned_at OR NEW.stored_at>plan_expires_at THEN
					RAISE EXCEPTION 'evaluation production run-config artifact is outside its plan window'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_production_run_config_artifact_binding
				BEFORE INSERT ON agent_evaluation_production_run_config_artifacts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_production_run_config_artifact_binding()`,
			`CREATE TRIGGER agent_evaluation_production_run_config_artifact_immutable
				BEFORE UPDATE OR DELETE ON agent_evaluation_production_run_config_artifacts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_production_run_config_artifact_finalized
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_production_run_config_artifacts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`ALTER TABLE agent_evaluation_holdout_closures
				DROP CONSTRAINT IF EXISTS agent_evaluation_holdout_closures_source_path_check,
				DROP COLUMN IF EXISTS source_config_path,
				ADD COLUMN run_config_artifact_binding_digest TEXT NOT NULL,
				ADD COLUMN run_config_artifact_binding_json JSONB NOT NULL,
				ADD COLUMN run_config_artifact_binding_bytes BYTEA NOT NULL`,
			`ALTER TABLE agent_evaluation_holdout_closures
				ADD CONSTRAINT agent_eval_holdout_run_config_artifact_binding_check CHECK (
					agent_evaluation_production_run_config_artifact_binding_valid(
						run_config_artifact_binding_json,run_config_artifact_binding_bytes,
						run_config_artifact_binding_digest,source_config_digest,frozen_run_digest,
						plan_digest,repository_commit
					)
				),
				ADD CONSTRAINT agent_eval_holdout_run_config_artifact_binding_fk FOREIGN KEY (
					namespace_id,plan_digest,repository_commit,run_config_artifact_binding_digest
				) REFERENCES agent_evaluation_production_run_config_artifacts(
					namespace_id,plan_digest,repository_commit,binding_digest
				) ON DELETE RESTRICT`,
			`ALTER TABLE agent_evaluation_archive_closures
				DROP CONSTRAINT IF EXISTS agent_evaluation_archive_closures_path_check,
				DROP COLUMN IF EXISTS source_config_path,
				ADD COLUMN run_config_artifact_binding_digest TEXT NOT NULL,
				ADD COLUMN run_config_artifact_binding_json JSONB NOT NULL,
				ADD COLUMN run_config_artifact_binding_bytes BYTEA NOT NULL`,
			`ALTER TABLE agent_evaluation_archive_closures
				ADD CONSTRAINT agent_eval_archive_run_config_artifact_binding_check CHECK (
					agent_evaluation_production_run_config_artifact_binding_valid(
						run_config_artifact_binding_json,run_config_artifact_binding_bytes,
						run_config_artifact_binding_digest,source_config_digest,frozen_run_digest,
						plan_digest,repository_commit
					)
				),
				ADD CONSTRAINT agent_eval_archive_run_config_artifact_binding_fk FOREIGN KEY (
					namespace_id,plan_digest,repository_commit,run_config_artifact_binding_digest
				) REFERENCES agent_evaluation_production_run_config_artifacts(
					namespace_id,plan_digest,repository_commit,binding_digest
				) ON DELETE RESTRICT`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_request_ref_authorities (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				binding_kind TEXT NOT NULL,
				capability_id TEXT NOT NULL,
				tool_id TEXT NOT NULL,
				target_ref TEXT NOT NULL,
				protocol_family TEXT NOT NULL,
				provider_configuration_id TEXT NOT NULL,
				model_lineage_digest TEXT NOT NULL,
				adapter_digest TEXT NOT NULL,
				runtime_fact_source_authority_digest TEXT NOT NULL,
				registration_receipt_digest TEXT NOT NULL,
				issued_at TIMESTAMPTZ NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				authority_digest TEXT NOT NULL,
				request_ref TEXT NOT NULL,
				selected_source_observation_receipt_digest TEXT,
				selected_source_handle_digest TEXT,
				request_json JSONB NOT NULL,
				request_bytes BYTEA NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, request_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, receipt_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, request_ref),
				UNIQUE (
					namespace_id, plan_digest, repository_commit, attempt_id, turn_index
				),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, repository_commit, registration_receipt_digest)
					REFERENCES agent_evaluation_runtime_fact_source_owner_registrations(
						namespace_id, repository_commit, registration_receipt_digest
					) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, attempt_id,
					selected_source_observation_receipt_digest
				) REFERENCES agent_evaluation_provider_capability_observation_receipts(
					namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_eval_capability_effect_request_ref_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND turn_index BETWEEN 0 AND 6
					AND protocol_family IN (
						'openai-responses','anthropic-messages','gemini-interactions'
					)
					AND attempt_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND invocation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND tool_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND target_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND provider_configuration_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND request_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND (binding_kind,capability_id,tool_id) IN (
						('hosted-retrieval-query','provider.hosted-retrieval','provider.retrieval.search'),
						('opaque-continuation','provider.reasoning-continuation','provider.continuation.resume'),
						('provider-cache','provider.isolated-cache','provider.cache.inspect'),
						('provider-job','provider.background-job','provider.background-job.poll')
					)
				),
				CONSTRAINT agent_eval_capability_effect_request_ref_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND model_lineage_digest ~ '^sha256-[a-f0-9]{64}$'
					AND adapter_digest ~ '^sha256-[a-f0-9]{64}$'
					AND runtime_fact_source_authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND registration_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (selected_source_observation_receipt_digest IS NULL
						OR selected_source_observation_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					AND (selected_source_handle_digest IS NULL
						OR selected_source_handle_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_eval_capability_effect_request_ref_source_check CHECK (
					(binding_kind='hosted-retrieval-query'
						AND selected_source_observation_receipt_digest IS NULL
						AND selected_source_handle_digest IS NULL)
					OR (binding_kind<>'hosted-retrieval-query' AND turn_index>=1
						AND selected_source_observation_receipt_digest IS NOT NULL
						AND selected_source_handle_digest IS NOT NULL
						AND target_ref<>selected_source_handle_digest)
				),
				CONSTRAINT agent_eval_capability_effect_request_ref_time_check CHECK (
					expires_at>issued_at
					AND expires_at<=issued_at+INTERVAL '125 seconds'
					AND issued_at BETWEEN created_at-INTERVAL '30 seconds'
						AND created_at+INTERVAL '30 seconds'
					AND expires_at>created_at
				),
				CONSTRAINT agent_eval_capability_effect_request_ref_bytes_check CHECK (
					octet_length(request_bytes) BETWEEN 1 AND 16384
					AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
					AND request_json=convert_from(request_bytes,'UTF8')::jsonb
					AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb
				),
				CONSTRAINT agent_eval_capability_effect_request_ref_json_check CHECK (COALESCE((
					jsonb_typeof(request_json)='object'
					AND agent_evaluation_jsonb_object_key_count(request_json)=23
					AND request_json ?& ARRAY[
						'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
						'descriptorDigest','descriptor','turnIndex','invocationId','bindingKind',
						'capabilityId','toolId','targetRef','protocolFamily','providerConfigurationId',
						'modelLineageDigest','adapterDigest','runtimeFactSourceAuthorityDigest',
						'registrationReceiptDigest','issuedAt','expiresAt','requestDigest'
					]
					AND request_json->>'format'=
						'prodivix.agent-evaluation-capability-effect-request-ref-authority-request'
					AND (request_json->>'version')::bigint=1
					AND request_json->>'namespaceId'=namespace_id
					AND request_json->>'planDigest'=plan_digest
					AND request_json->>'repositoryCommit'=repository_commit
					AND request_json->>'attemptId'=attempt_id
					AND request_json->>'descriptorDigest'=descriptor_digest
					AND request_json#>>'{descriptor,descriptorDigest}'=descriptor_digest
					AND request_json#>>'{descriptor,attemptId}'=attempt_id
					AND request_json#>>'{descriptor,planDigest}'=plan_digest
					AND (request_json->>'turnIndex')::bigint=turn_index
					AND request_json->>'invocationId'=invocation_id
					AND request_json->>'bindingKind'=binding_kind
					AND request_json->>'capabilityId'=capability_id
					AND request_json->>'toolId'=tool_id
					AND request_json->>'targetRef'=target_ref
					AND request_json->>'protocolFamily'=protocol_family
					AND request_json->>'providerConfigurationId'=provider_configuration_id
					AND request_json->>'modelLineageDigest'=model_lineage_digest
					AND request_json->>'adapterDigest'=adapter_digest
					AND request_json->>'runtimeFactSourceAuthorityDigest'=
						runtime_fact_source_authority_digest
					AND request_json->>'registrationReceiptDigest'=registration_receipt_digest
					AND (request_json->>'issuedAt')::timestamptz=issued_at
					AND (request_json->>'expiresAt')::timestamptz=expires_at
					AND request_json->>'requestDigest'=request_digest
					AND jsonb_typeof(receipt_json)='object'
					AND agent_evaluation_jsonb_object_key_count(receipt_json)=24
					AND receipt_json ?& ARRAY[
						'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
						'descriptorDigest','turnIndex','invocationId','bindingKind','capabilityId','toolId',
						'targetRef','protocolFamily','providerConfigurationId','modelLineageDigest',
						'adapterDigest','runtimeFactSourceAuthorityDigest','registrationReceiptDigest',
						'issuedAt','expiresAt','authorityDigest','requestRef','receiptDigest'
					]
					AND receipt_json->>'format'=
						'prodivix.agent-evaluation-capability-effect-request-ref-authority-receipt'
					AND (receipt_json->>'version')::bigint=1
					AND receipt_json->>'namespaceId'=namespace_id
					AND receipt_json->>'planDigest'=plan_digest
					AND receipt_json->>'repositoryCommit'=repository_commit
					AND receipt_json->>'attemptId'=attempt_id
					AND receipt_json->>'descriptorDigest'=descriptor_digest
					AND (receipt_json->>'turnIndex')::bigint=turn_index
					AND receipt_json->>'invocationId'=invocation_id
					AND receipt_json->>'bindingKind'=binding_kind
					AND receipt_json->>'capabilityId'=capability_id
					AND receipt_json->>'toolId'=tool_id
					AND receipt_json->>'targetRef'=target_ref
					AND receipt_json->>'protocolFamily'=protocol_family
					AND receipt_json->>'providerConfigurationId'=provider_configuration_id
					AND receipt_json->>'modelLineageDigest'=model_lineage_digest
					AND receipt_json->>'adapterDigest'=adapter_digest
					AND receipt_json->>'runtimeFactSourceAuthorityDigest'=
						runtime_fact_source_authority_digest
					AND receipt_json->>'registrationReceiptDigest'=registration_receipt_digest
					AND (receipt_json->>'issuedAt')::timestamptz=issued_at
					AND (receipt_json->>'expiresAt')::timestamptz=expires_at
					AND receipt_json->>'authorityDigest'=authority_digest
					AND receipt_json->>'requestRef'=request_ref
					AND request_ref='capability-effect-ref.'||binding_kind||'.'||
						substring(authority_digest FROM 8)
					AND receipt_json->>'receiptDigest'=receipt_digest
				),FALSE))
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_current_turn_events (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				request_ref_authority_receipt_digest TEXT NOT NULL,
				request_ref TEXT NOT NULL,
				target_ref TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				provider_request_digest TEXT NOT NULL,
				response_digest TEXT NOT NULL,
				dispatch_intent_digest TEXT NOT NULL,
				transport_receipt_digest TEXT NOT NULL,
				result_spool_receipt_digest TEXT NOT NULL,
				normalized_event_set_digest TEXT NOT NULL,
				selected_event_digest TEXT NOT NULL,
				provider_tool_call_id TEXT NOT NULL,
				tool_id TEXT NOT NULL,
				arguments_digest TEXT NOT NULL,
				recorded_at TIMESTAMPTZ NOT NULL,
				request_json JSONB NOT NULL,
				request_bytes BYTEA NOT NULL,
				normalized_events_json JSONB NOT NULL,
				normalized_events_bytes BYTEA NOT NULL,
				selected_event_json JSONB NOT NULL,
				selected_event_bytes BYTEA NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, request_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, receipt_digest),
				UNIQUE (
					namespace_id, plan_digest, repository_commit,
					request_ref_authority_receipt_digest
				),
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit,
					request_ref_authority_receipt_digest
				) REFERENCES agent_evaluation_capability_effect_request_ref_authorities(
					namespace_id, plan_digest, repository_commit, receipt_digest
				) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, attempt_id, turn_index, dispatch_intent_digest
				) REFERENCES agent_evaluation_transport_dispatch_intents(
					namespace_id, plan_digest, attempt_id, turn_index, intent_digest
				) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, attempt_id, turn_index, transport_receipt_digest
				) REFERENCES agent_evaluation_transport_receipts(
					namespace_id, plan_digest, attempt_id, turn_index, receipt_digest
				) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, attempt_id, turn_index, result_spool_receipt_digest
				) REFERENCES agent_evaluation_provider_result_spool_receipts(
					namespace_id, plan_digest, attempt_id, turn_index, receipt_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_eval_capability_effect_current_event_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND turn_index BETWEEN 0 AND 6
					AND request_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND target_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND attempt_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND invocation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND provider_tool_call_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND tool_id='provider.retrieval.search'
					AND target_ref<>selected_event_digest
				),
				CONSTRAINT agent_eval_capability_effect_current_event_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_ref_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND response_digest ~ '^sha256-[a-f0-9]{64}$'
					AND dispatch_intent_digest ~ '^sha256-[a-f0-9]{64}$'
					AND transport_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND result_spool_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND normalized_event_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND selected_event_digest ~ '^sha256-[a-f0-9]{64}$'
					AND arguments_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_eval_capability_effect_current_event_bytes_check CHECK (
					octet_length(request_bytes) BETWEEN 1 AND 131072
					AND octet_length(normalized_events_bytes) BETWEEN 1 AND 65536
					AND octet_length(selected_event_bytes) BETWEEN 1 AND 65536
					AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
					AND request_json=convert_from(request_bytes,'UTF8')::jsonb
					AND normalized_events_json=convert_from(normalized_events_bytes,'UTF8')::jsonb
					AND selected_event_json=convert_from(selected_event_bytes,'UTF8')::jsonb
					AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb
					AND jsonb_typeof(normalized_events_json)='array'
					AND jsonb_array_length(normalized_events_json) BETWEEN 1 AND 10000
					AND jsonb_typeof(selected_event_json)='object'
					AND selected_event_json#>>'{durableEvent,eventDigest}'=selected_event_digest
					AND agent_evaluation_jsonb_array_value_count(
						normalized_events_json,selected_event_json
					)=1
				),
				CONSTRAINT agent_eval_capability_effect_current_event_json_check CHECK (COALESCE((
					jsonb_typeof(request_json)='object'
					AND agent_evaluation_jsonb_object_key_count(request_json)=20
					AND request_json ?& ARRAY[
						'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
						'descriptorDigest','turnIndex','invocationId','requestRefAuthorityReceiptDigest',
						'requestRef','targetRef','providerToolCallId','toolId','argumentsDigest',
						'selectedEventDigest','normalizedEvents','normalizedEventSetDigest',
						'recordedAt','requestDigest'
					]
					AND request_json->>'format'=
						'prodivix.agent-evaluation-capability-effect-current-turn-event-request'
					AND (request_json->>'version')::bigint=1
					AND request_json->>'namespaceId'=namespace_id
					AND request_json->>'planDigest'=plan_digest
					AND request_json->>'repositoryCommit'=repository_commit
					AND request_json->>'attemptId'=attempt_id
					AND request_json->>'descriptorDigest'=descriptor_digest
					AND (request_json->>'turnIndex')::bigint=turn_index
					AND request_json->>'invocationId'=invocation_id
					AND request_json->>'requestRefAuthorityReceiptDigest'=
						request_ref_authority_receipt_digest
					AND request_json->>'requestRef'=request_ref
					AND request_json->>'targetRef'=target_ref
					AND request_json->>'providerToolCallId'=provider_tool_call_id
					AND request_json->>'toolId'=tool_id
					AND request_json->>'argumentsDigest'=arguments_digest
					AND request_json->>'selectedEventDigest'=selected_event_digest
					AND request_json->>'normalizedEventSetDigest'=normalized_event_set_digest
					AND request_json->'normalizedEvents'=normalized_events_json
					AND (request_json->>'recordedAt')::timestamptz=recorded_at
					AND request_json->>'requestDigest'=request_digest
					AND jsonb_typeof(receipt_json)='object'
					AND agent_evaluation_jsonb_object_key_count(receipt_json)=24
					AND receipt_json ?& ARRAY[
						'format','version','namespaceId','planDigest','repositoryCommit','attemptId',
						'descriptorDigest','turnIndex','invocationId','requestRefAuthorityReceiptDigest',
						'requestRef','targetRef','providerRequestDigest','responseDigest',
						'dispatchIntentDigest','transportReceiptDigest','resultSpoolReceiptDigest',
						'normalizedEventSetDigest','selectedEventDigest','providerToolCallId','toolId',
						'argumentsDigest','recordedAt','receiptDigest'
					]
					AND receipt_json->>'format'=
						'prodivix.agent-evaluation-capability-effect-current-turn-event-receipt'
					AND (receipt_json->>'version')::bigint=1
					AND receipt_json->>'namespaceId'=namespace_id
					AND receipt_json->>'planDigest'=plan_digest
					AND receipt_json->>'repositoryCommit'=repository_commit
					AND receipt_json->>'attemptId'=attempt_id
					AND receipt_json->>'descriptorDigest'=descriptor_digest
					AND (receipt_json->>'turnIndex')::bigint=turn_index
					AND receipt_json->>'invocationId'=invocation_id
					AND receipt_json->>'requestRefAuthorityReceiptDigest'=
						request_ref_authority_receipt_digest
					AND receipt_json->>'requestRef'=request_ref
					AND receipt_json->>'targetRef'=target_ref
					AND receipt_json->>'providerRequestDigest'=provider_request_digest
					AND receipt_json->>'responseDigest'=response_digest
					AND receipt_json->>'dispatchIntentDigest'=dispatch_intent_digest
					AND receipt_json->>'transportReceiptDigest'=transport_receipt_digest
					AND receipt_json->>'resultSpoolReceiptDigest'=result_spool_receipt_digest
					AND receipt_json->>'normalizedEventSetDigest'=normalized_event_set_digest
					AND receipt_json->>'selectedEventDigest'=selected_event_digest
					AND receipt_json->>'providerToolCallId'=provider_tool_call_id
					AND receipt_json->>'toolId'=tool_id
					AND receipt_json->>'argumentsDigest'=arguments_digest
					AND (receipt_json->>'recordedAt')::timestamptz=recorded_at
					AND receipt_json->>'receiptDigest'=receipt_digest
				),FALSE))
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_effect_input_authority_registry_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				request_ref_authority_receipt_digest TEXT NOT NULL,
				request_ref TEXT NOT NULL,
				target_ref TEXT NOT NULL,
				binding_kind TEXT NOT NULL,
				source_attempt_id TEXT NOT NULL,
				source_turn_index BIGINT NOT NULL,
				source_invocation_id TEXT NOT NULL,
				source_observation_receipt_digest TEXT,
				source_handle_digest TEXT NOT NULL,
				requested_at TIMESTAMPTZ NOT NULL,
				request_json JSONB NOT NULL,
				request_bytes BYTEA NOT NULL,
				receipt_json JSONB NOT NULL,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, request_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, receipt_digest),
				UNIQUE (
					namespace_id, plan_digest, repository_commit,
					request_ref_authority_receipt_digest
				),
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit,
					request_ref_authority_receipt_digest
				) REFERENCES agent_evaluation_capability_effect_request_ref_authorities(
					namespace_id, plan_digest, repository_commit, receipt_digest
				) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, source_attempt_id,
					source_observation_receipt_digest
				) REFERENCES agent_evaluation_provider_capability_observation_receipts(
					namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_eval_capability_effect_registry_identity_check CHECK (
					repository_commit ~ '^[a-f0-9]{40}$'
					AND source_turn_index BETWEEN 0 AND 6
					AND request_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND target_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND source_attempt_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND source_invocation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
					AND target_ref<>source_handle_digest
					AND binding_kind IN (
						'hosted-retrieval-query','opaque-continuation','provider-cache','provider-job'
					)
				),
				CONSTRAINT agent_eval_capability_effect_registry_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_ref_authority_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND source_handle_digest ~ '^sha256-[a-f0-9]{64}$'
					AND (source_observation_receipt_digest IS NULL
						OR source_observation_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
				),
				CONSTRAINT agent_eval_capability_effect_registry_bytes_check CHECK (
					octet_length(request_bytes) BETWEEN 1 AND 16384
					AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
					AND request_json=convert_from(request_bytes,'UTF8')::jsonb
					AND receipt_json=convert_from(receipt_bytes,'UTF8')::jsonb
				),
				CONSTRAINT agent_eval_capability_effect_registry_request_json_check CHECK (COALESCE((
					jsonb_typeof(request_json)='object'
					AND agent_evaluation_jsonb_object_key_count(request_json)=10
					AND request_json ?& ARRAY[
						'format','version','namespaceId','planDigest','repositoryCommit',
						'requestRefAuthorityReceiptDigest','requestRef','targetRef','requestedAt','requestDigest'
					]
					AND request_json->>'format'=
						'prodivix.agent-evaluation-capability-effect-input-authority-registry-request'
					AND (request_json->>'version')::bigint=1
					AND request_json->>'namespaceId'=namespace_id
					AND request_json->>'planDigest'=plan_digest
					AND request_json->>'repositoryCommit'=repository_commit
					AND request_json->>'requestRefAuthorityReceiptDigest'=
						request_ref_authority_receipt_digest
					AND request_json->>'requestRef'=request_ref
					AND request_json->>'targetRef'=target_ref
					AND (request_json->>'requestedAt')::timestamptz=requested_at
					AND request_json->>'requestDigest'=request_digest
				),FALSE))
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_effect_request_ref_binding()
				RETURNS trigger AS $$
			DECLARE
				plan_value JSONB;
				plan_planned_at TIMESTAMPTZ;
				plan_expires_at TIMESTAMPTZ;
				target JSONB;
				target_count BIGINT;
				optional_authority JSONB;
				runtime_authority JSONB;
				registration_count BIGINT;
				observation JSONB;
				observation_turn BIGINT;
				observation_protocol TEXT;
				observation_provider TEXT;
				observation_model_lineage TEXT;
				observation_adapter TEXT;
				fact_count BIGINT;
				selected_fact_count BIGINT;
				later_fact_count BIGINT;
				expected_fact_kind TEXT;
			BEGIN
				SELECT plan_json,planned_at,expires_at
				INTO plan_value,plan_planned_at,plan_expires_at
				FROM agent_evaluation_plans
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
				FOR UPDATE;
				IF NOT FOUND OR plan_planned_at>NEW.issued_at
					OR NEW.issued_at<CURRENT_TIMESTAMP-INTERVAL '30 seconds'
					OR NEW.issued_at>CURRENT_TIMESTAMP+INTERVAL '30 seconds'
					OR NEW.expires_at<=CURRENT_TIMESTAMP
					OR CURRENT_TIMESTAMP>=plan_expires_at OR NEW.expires_at>plan_expires_at THEN
					RAISE EXCEPTION 'capability-effect request-ref is outside its frozen plan window'
						USING ERRCODE='23514';
				END IF;
				SELECT COUNT(*),(jsonb_agg(candidate)->0)
				INTO target_count,target
				FROM jsonb_array_elements(
					plan_value#>'{value,capabilityQualificationTargets}'
				) candidate
				WHERE candidate->>'targetId'=NEW.request_json#>>'{descriptor,targetId}'
					AND candidate->>'targetDigest'=NEW.request_json#>>'{descriptor,targetDigest}';
				optional_authority:=target->'optionalCapabilitySupportAuthority';
				runtime_authority:=optional_authority->'runtimeFactSourceAuthority';
				IF target_count<>1 OR NEW.request_json#>>'{descriptor,targetId}' IS NULL
					OR optional_authority->>'supportExpectation'<>'required'
					OR optional_authority->>'capabilityId'<>NEW.capability_id
					OR target->>'protocolFamily'<>NEW.protocol_family
					OR target->>'providerConfigurationId'<>NEW.provider_configuration_id
					OR target->>'modelLineageDigest'<>NEW.model_lineage_digest
					OR runtime_authority->>'protocolFamily'<>NEW.protocol_family
					OR runtime_authority->>'providerConfigurationId'<>NEW.provider_configuration_id
					OR runtime_authority->>'modelLineageDigest'<>NEW.model_lineage_digest
					OR runtime_authority->>'adapterDigest'<>NEW.adapter_digest
					OR runtime_authority->>'authorityDigest'<>
						NEW.runtime_fact_source_authority_digest
					OR runtime_authority->>'registrationReceiptDigest'<>
						NEW.registration_receipt_digest THEN
					RAISE EXCEPTION 'capability-effect request-ref target authority drifted'
						USING ERRCODE='23514';
				END IF;
				SELECT COUNT(*) INTO registration_count
				FROM agent_evaluation_runtime_fact_source_owner_registrations registration
				WHERE registration.namespace_id=NEW.namespace_id
					AND registration.repository_commit=NEW.repository_commit
					AND registration.registration_receipt_digest=NEW.registration_receipt_digest
					AND registration.state='sealed' AND registration.v45_eligible
					AND registration.capability_profile_id=runtime_authority->>'capabilityProfileId'
					AND registration.capability_profile_digest=runtime_authority->>'capabilityProfileDigest'
					AND registration.capability_id=NEW.capability_id
					AND registration.protocol_family=NEW.protocol_family
					AND registration.provider_configuration_id=NEW.provider_configuration_id
					AND registration.model_id=target->>'modelId'
					AND registration.model_lineage_digest=NEW.model_lineage_digest
					AND registration.adapter_digest=NEW.adapter_digest
					AND registration.source_kind=runtime_authority->>'sourceKind'
					AND registration.route_binding=runtime_authority->>'routeBinding'
					AND registration.source_authority_id=runtime_authority->>'sourceAuthorityId'
					AND registration.source_authority_implementation_digest=
						runtime_authority->>'sourceAuthorityImplementationDigest'
					AND registration.registration_authority_issuer_id=
						runtime_authority->>'registrationAuthorityIssuerId'
					AND registration.registered_at<=NEW.issued_at
					AND registration.expires_at>=NEW.expires_at;
				IF registration_count<>1 THEN
					RAISE EXCEPTION 'capability-effect request-ref lacks one sealed runtime registration'
						USING ERRCODE='23514';
				END IF;
				IF NEW.binding_kind='hosted-retrieval-query' THEN
					IF runtime_authority->>'sourceKind'<>'sealed-hosted-owner-result' THEN
						RAISE EXCEPTION 'capability-effect retrieval source kind drifted'
							USING ERRCODE='23514';
					END IF;
					RETURN NEW;
				END IF;
				expected_fact_kind:=CASE NEW.binding_kind
					WHEN 'opaque-continuation' THEN 'opaque-continuation'
					WHEN 'provider-cache' THEN 'provider-cache-receipt'
					WHEN 'provider-job' THEN 'provider-job-receipt'
				END;
				IF runtime_authority->>'sourceKind'<>'sealed-provider-response-metadata' THEN
					RAISE EXCEPTION 'capability-effect prior source kind drifted'
						USING ERRCODE='23514';
				END IF;
				SELECT receipt_json,turn_index,protocol_family,provider_configuration_id,
					model_lineage_digest,adapter_digest
				INTO observation,observation_turn,observation_protocol,observation_provider,
					observation_model_lineage,observation_adapter
				FROM agent_evaluation_provider_capability_observation_receipts
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit AND attempt_id=NEW.attempt_id
					AND receipt_digest=NEW.selected_source_observation_receipt_digest
				FOR SHARE;
				IF NOT FOUND OR observation_turn>=NEW.turn_index
					OR observation_protocol<>NEW.protocol_family
					OR observation_provider<>NEW.provider_configuration_id
					OR observation_model_lineage<>NEW.model_lineage_digest
					OR observation_adapter<>NEW.adapter_digest THEN
					RAISE EXCEPTION 'capability-effect selected observation binding drifted'
						USING ERRCODE='23514';
				END IF;
				SELECT COUNT(*), COUNT(*) FILTER (
					WHERE fact->>'factDigest'=NEW.selected_source_handle_digest
				) INTO fact_count,selected_fact_count
				FROM jsonb_array_elements(observation->'facts') fact
				WHERE fact->>'factKind'=expected_fact_kind;
				SELECT COUNT(*) INTO later_fact_count
				FROM agent_evaluation_provider_capability_observation_receipts later
				CROSS JOIN LATERAL jsonb_array_elements(later.receipt_json->'facts') fact
				WHERE later.namespace_id=NEW.namespace_id AND later.plan_digest=NEW.plan_digest
					AND later.repository_commit=NEW.repository_commit
					AND later.attempt_id=NEW.attempt_id
					AND later.turn_index>observation_turn AND later.turn_index<NEW.turn_index
					AND fact->>'factKind'=expected_fact_kind
					AND fact->>'factDigest' ~ '^sha256-[a-f0-9]{64}$';
				IF fact_count<>1 OR selected_fact_count<>1 OR later_fact_count<>0 THEN
					RAISE EXCEPTION 'capability-effect selected source fact is missing, ambiguous, or stale'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_effect_current_event_binding()
				RETURNS trigger AS $$
			DECLARE
				ref agent_evaluation_capability_effect_request_ref_authorities%ROWTYPE;
				ref_found BOOLEAN;
				plan_expires_at TIMESTAMPTZ;
				raw_count BIGINT;
				transport_completed_at TIMESTAMPTZ;
				event_entry JSONB;
				durable_event JSONB;
				provider_payload JSONB;
				tool_arguments JSONB;
				event_ordinality BIGINT;
				selected_event_count BIGINT:=0;
			BEGIN
				SELECT * INTO ref
				FROM agent_evaluation_capability_effect_request_ref_authorities
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND receipt_digest=NEW.request_ref_authority_receipt_digest
				FOR SHARE;
				ref_found:=FOUND;
				SELECT expires_at INTO plan_expires_at FROM agent_evaluation_plans
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit FOR SHARE;
				IF NOT ref_found OR plan_expires_at IS NULL
					OR ref.binding_kind<>'hosted-retrieval-query'
					OR ref.request_ref<>NEW.request_ref OR ref.target_ref<>NEW.target_ref
					OR ref.attempt_id<>NEW.attempt_id OR ref.descriptor_digest<>NEW.descriptor_digest
					OR ref.turn_index<>NEW.turn_index OR ref.invocation_id<>NEW.invocation_id
					OR ref.tool_id<>NEW.tool_id OR NEW.recorded_at<ref.issued_at
					OR NEW.recorded_at>ref.expires_at OR CURRENT_TIMESTAMP>=ref.expires_at
					OR CURRENT_TIMESTAMP>=plan_expires_at OR NEW.recorded_at>plan_expires_at THEN
					RAISE EXCEPTION 'capability-effect current event request-ref binding drifted'
						USING ERRCODE='23514';
				END IF;
				FOR event_entry,event_ordinality IN
					SELECT value,ordinality
					FROM jsonb_array_elements(NEW.normalized_events_json) WITH ORDINALITY
				LOOP
					durable_event:=event_entry->'durableEvent';
					IF agent_evaluation_jsonb_object_key_count(event_entry)<>2
						OR NOT (event_entry ?& ARRAY['durableEvent','payload'])
						OR agent_evaluation_jsonb_object_key_count(durable_event)<>7
						OR NOT (durable_event ?& ARRAY[
							'eventId','invocationId','sequence','type','payloadDigest','occurredAt','eventDigest'
						])
						OR durable_event->>'eventId' !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
						OR durable_event->>'invocationId'<>NEW.invocation_id
						OR (durable_event->>'sequence')::bigint<>event_ordinality-1
						OR durable_event->>'type' NOT IN (
							'output-delta','tool-call','usage','refusal','safety-block','truncation',
							'cancelled','timed-out','partial','completed','failed'
						)
						OR durable_event->>'payloadDigest' !~ '^sha256-[a-f0-9]{64}$'
						OR (durable_event->>'occurredAt')::timestamptz IS NULL
						OR durable_event->>'eventDigest' !~ '^sha256-[a-f0-9]{64}$' THEN
						RAISE EXCEPTION 'capability-effect normalized event set is not exact'
							USING ERRCODE='23514';
					END IF;
					IF durable_event->>'eventDigest'=NEW.selected_event_digest THEN
						selected_event_count:=selected_event_count+1;
						provider_payload:=event_entry->'payload';
						tool_arguments:=provider_payload->'arguments';
						IF durable_event->>'type'<>'tool-call'
							OR event_entry<>NEW.selected_event_json
							OR agent_evaluation_jsonb_object_key_count(provider_payload)<>4
							OR NOT (provider_payload ?& (
								CASE WHEN ref.protocol_family='openai-responses'
									THEN ARRAY['itemId','name','arguments','argumentsDigest']
									ELSE ARRAY['id','name','arguments','argumentsDigest'] END
							))
							OR COALESCE(provider_payload->>'itemId',provider_payload->>'id')<>
								NEW.provider_tool_call_id
							OR provider_payload->>'name'<>NEW.tool_id
							OR provider_payload->>'argumentsDigest'<>NEW.arguments_digest
							OR agent_evaluation_jsonb_object_key_count(tool_arguments)<>2
							OR NOT (tool_arguments ?& ARRAY['requestRef','targetRef'])
							OR tool_arguments->>'requestRef'<>NEW.request_ref
							OR tool_arguments->>'targetRef'<>NEW.target_ref THEN
							RAISE EXCEPTION 'capability-effect selected retrieval tool call drifted'
								USING ERRCODE='23514';
						END IF;
					END IF;
				END LOOP;
				IF selected_event_count<>1 THEN
					RAISE EXCEPTION 'capability-effect selected event is missing or ambiguous'
						USING ERRCODE='23514';
				END IF;
				SELECT COUNT(*),MAX(transport.completed_at)
				INTO raw_count,transport_completed_at
				FROM agent_evaluation_transport_dispatch_intents intent
				JOIN agent_evaluation_transport_receipts transport
					ON transport.namespace_id=intent.namespace_id
					AND transport.plan_digest=intent.plan_digest
					AND transport.repository_commit=intent.repository_commit
					AND transport.attempt_id=intent.attempt_id
					AND transport.turn_index=intent.turn_index
					AND transport.intent_digest=intent.intent_digest
				JOIN agent_evaluation_provider_result_spool_receipts spool
					ON spool.namespace_id=intent.namespace_id
					AND spool.plan_digest=intent.plan_digest
					AND spool.repository_commit=intent.repository_commit
					AND spool.attempt_id=intent.attempt_id
					AND spool.turn_index=intent.turn_index
					AND spool.dispatch_intent_digest=intent.intent_digest
					AND spool.transport_receipt_digest=transport.receipt_digest
				WHERE intent.namespace_id=NEW.namespace_id AND intent.plan_digest=NEW.plan_digest
					AND intent.repository_commit=NEW.repository_commit
					AND intent.attempt_id=NEW.attempt_id AND intent.turn_index=NEW.turn_index
					AND intent.descriptor_digest=NEW.descriptor_digest
					AND intent.invocation_id=NEW.invocation_id
					AND intent.protocol_family=ref.protocol_family
					AND intent.provider_configuration_id=ref.provider_configuration_id
					AND intent.model_lineage_digest=ref.model_lineage_digest
					AND intent.request_digest=NEW.provider_request_digest
					AND intent.intent_digest=NEW.dispatch_intent_digest
					AND intent.created_at>=ref.issued_at
					AND transport.descriptor_digest=NEW.descriptor_digest
					AND transport.invocation_id=NEW.invocation_id
					AND transport.provider_configuration_id=ref.provider_configuration_id
					AND transport.receipt_digest=NEW.transport_receipt_digest
					AND transport.outcome='completed'
					AND spool.descriptor_digest=NEW.descriptor_digest
					AND spool.invocation_id=NEW.invocation_id
					AND spool.response_body_digest=transport.response_body_digest
					AND spool.response_digest=NEW.response_digest
					AND spool.receipt_digest=NEW.result_spool_receipt_digest
					AND spool.normalized_event_set_digest=NEW.normalized_event_set_digest;
				IF raw_count<>1 OR NEW.recorded_at<transport_completed_at THEN
					RAISE EXCEPTION 'capability-effect current event lacks one exact raw transport tuple'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_effect_registry_binding()
				RETURNS trigger AS $$
			DECLARE
				ref agent_evaluation_capability_effect_request_ref_authorities%ROWTYPE;
				ref_found BOOLEAN;
				plan_expires_at TIMESTAMPTZ;
				event agent_evaluation_capability_effect_current_turn_events%ROWTYPE;
				event_found BOOLEAN;
				observation agent_evaluation_provider_capability_observation_receipts%ROWTYPE;
				observation_found BOOLEAN;
				expected_fact_kind TEXT;
				fact_count BIGINT;
				selected_fact JSONB;
				bootstrap_count BIGINT;
				native_source JSONB;
				native_probe_program_digest TEXT;
				native_capability_profile_digest TEXT;
				vault_count BIGINT;
				expected_source_kind TEXT;
			BEGIN
				SELECT * INTO ref
				FROM agent_evaluation_capability_effect_request_ref_authorities
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND receipt_digest=NEW.request_ref_authority_receipt_digest
				FOR SHARE;
				ref_found:=FOUND;
				SELECT expires_at INTO plan_expires_at FROM agent_evaluation_plans
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit FOR SHARE;
				IF NOT ref_found OR plan_expires_at IS NULL
					OR ref.request_ref<>NEW.request_ref OR ref.target_ref<>NEW.target_ref
					OR ref.binding_kind<>NEW.binding_kind OR NEW.requested_at<ref.issued_at
					OR NEW.requested_at>ref.expires_at OR CURRENT_TIMESTAMP>=ref.expires_at
					OR CURRENT_TIMESTAMP>=plan_expires_at OR NEW.requested_at>plan_expires_at
					OR NEW.receipt_json->'requestRefAuthority'<>ref.receipt_json
					OR NEW.receipt_json->>'requestRefAuthorityReceiptDigest'<>ref.receipt_digest THEN
					RAISE EXCEPTION 'capability-effect input registry request-ref binding drifted'
						USING ERRCODE='23514';
				END IF;
				IF NEW.binding_kind IN ('hosted-retrieval-query','provider-cache')
					AND (NEW.receipt_json->'stateVaultSealRequest' IS DISTINCT FROM 'null'::jsonb
						OR NEW.receipt_json->'stateVaultSealReceipt' IS DISTINCT FROM 'null'::jsonb) THEN
					RAISE EXCEPTION 'capability-effect stateless registry carried state-vault preimages'
						USING ERRCODE='23514';
				END IF;
				IF NEW.binding_kind='hosted-retrieval-query' THEN
					SELECT * INTO event
					FROM agent_evaluation_capability_effect_current_turn_events
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit
						AND request_ref_authority_receipt_digest=ref.receipt_digest
					FOR SHARE;
					event_found:=FOUND;
					IF NOT event_found OR NEW.source_observation_receipt_digest IS NOT NULL
						OR NEW.receipt_json->'sourceObservationReceiptDigest'<>'null'::jsonb
						OR NEW.source_handle_digest<>event.selected_event_digest
						OR NEW.source_attempt_id<>event.attempt_id
						OR NEW.source_turn_index<>event.turn_index
						OR NEW.source_invocation_id<>event.invocation_id
						OR NEW.receipt_json->>'sourceProviderRequestDigest'<>event.provider_request_digest
						OR NEW.receipt_json->>'sourceResponseDigest'<>event.response_digest
						OR NEW.receipt_json->>'sourceDispatchIntentDigest'<>event.dispatch_intent_digest
						OR NEW.receipt_json->>'sourceTransportReceiptDigest'<>event.transport_receipt_digest
						OR NEW.receipt_json->>'sourceResultSpoolReceiptDigest'<>
							event.result_spool_receipt_digest
						OR NEW.receipt_json->>'sourceNormalizedEventSetDigest'<>
							event.normalized_event_set_digest
						OR NEW.receipt_json->>'sourceFactKind'<>'provider-event'
						OR NEW.receipt_json->>'sourceProviderEventType'<>'tool-call'
						OR NEW.receipt_json->>'sourceProviderToolCallId'<>event.provider_tool_call_id
						OR NEW.receipt_json->>'sourceToolId'<>event.tool_id
						OR NEW.receipt_json->>'sourceArgumentsDigest'<>event.arguments_digest THEN
						RAISE EXCEPTION 'capability-effect retrieval registry source drifted'
							USING ERRCODE='23514';
					END IF;
				ELSE
					expected_fact_kind:=CASE NEW.binding_kind
						WHEN 'opaque-continuation' THEN 'opaque-continuation'
						WHEN 'provider-cache' THEN 'provider-cache-receipt'
						WHEN 'provider-job' THEN 'provider-job-receipt'
					END;
					SELECT * INTO observation
					FROM agent_evaluation_provider_capability_observation_receipts
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit
						AND attempt_id=NEW.source_attempt_id
						AND receipt_digest=NEW.source_observation_receipt_digest
					FOR SHARE;
					observation_found:=FOUND;
					SELECT COUNT(*),(jsonb_agg(fact)->0) INTO fact_count,selected_fact
					FROM jsonb_array_elements(observation.receipt_json->'facts') fact
					WHERE fact->>'factKind'=expected_fact_kind
						AND fact->>'factDigest'=NEW.source_handle_digest;
					IF NOT observation_found OR ref.selected_source_observation_receipt_digest<>
							NEW.source_observation_receipt_digest
						OR ref.selected_source_handle_digest<>NEW.source_handle_digest
						OR NEW.receipt_json->>'sourceObservationReceiptDigest'<>
							NEW.source_observation_receipt_digest
						OR NEW.source_attempt_id<>observation.attempt_id
						OR NEW.source_turn_index<>observation.turn_index
						OR NEW.source_invocation_id<>observation.invocation_id
						OR fact_count<>1
						OR NEW.receipt_json->>'sourceProviderRequestDigest'<>observation.request_digest
						OR NEW.receipt_json->>'sourceResponseDigest'<>observation.response_digest
						OR NEW.receipt_json->>'sourceDispatchIntentDigest'<>observation.dispatch_intent_digest
						OR NEW.receipt_json->>'sourceTransportReceiptDigest'<>observation.transport_receipt_digest
						OR NEW.receipt_json->>'sourceResultSpoolReceiptDigest'<>
							observation.result_spool_receipt_digest
						OR NEW.receipt_json->>'sourceNormalizedEventSetDigest'<>
							observation.normalized_event_set_digest
						OR NEW.receipt_json->>'sourceFactKind'<>expected_fact_kind
						OR NEW.receipt_json->'sourceProviderEventType'<>'null'::jsonb
						OR NEW.receipt_json->'sourceProviderToolCallId'<>'null'::jsonb
						OR NEW.receipt_json->'sourceToolId'<>'null'::jsonb
						OR NEW.receipt_json->'sourceArgumentsDigest'<>'null'::jsonb THEN
						RAISE EXCEPTION 'capability-effect prior-fact registry source drifted'
							USING ERRCODE='23514';
					END IF;
					IF NEW.binding_kind IN ('provider-job','opaque-continuation') THEN
						IF jsonb_typeof(NEW.receipt_json->'stateVaultSealRequest')
								IS DISTINCT FROM 'object'
							OR jsonb_typeof(NEW.receipt_json->'stateVaultSealReceipt')
								IS DISTINCT FROM 'object' THEN
							RAISE EXCEPTION 'capability-effect stateful registry lacks exact state-vault preimages'
								USING ERRCODE='23514';
						END IF;
						SELECT COUNT(*),(jsonb_agg(candidate.source)->0),
							MIN(candidate.probe_program_digest),MIN(candidate.capability_profile_digest)
						INTO bootstrap_count,native_source,native_probe_program_digest,
							native_capability_profile_digest
						FROM (
							SELECT bootstrap.native_provider_source_receipt_json->'source' AS source,
								bootstrap.probe_program_digest,bootstrap.capability_profile_digest
							FROM agent_evaluation_native_optional_capability_bootstrap_sources bootstrap
							WHERE bootstrap.namespace_id=NEW.namespace_id
								AND bootstrap.plan_digest=NEW.plan_digest
								AND bootstrap.repository_commit=NEW.repository_commit
								AND bootstrap.attempt_id=NEW.source_attempt_id
								AND bootstrap.descriptor_digest=observation.descriptor_digest
								AND bootstrap.target_id=ref.request_json#>>'{descriptor,targetId}'
								AND bootstrap.target_digest=ref.request_json#>>'{descriptor,targetDigest}'
								AND bootstrap.capability_profile_id=CASE NEW.binding_kind
									WHEN 'provider-job' THEN 'g4-provider-background-job'
									ELSE 'g4-provider-reasoning-continuation' END
								AND bootstrap.capability_id=ref.capability_id
								AND bootstrap.turn_index=NEW.source_turn_index
								AND bootstrap.invocation_id=NEW.source_invocation_id
								AND bootstrap.protocol_family=observation.protocol_family
								AND bootstrap.provider_configuration_id=
									observation.provider_configuration_id
								AND bootstrap.model_lineage_digest=observation.model_lineage_digest
								AND bootstrap.adapter_digest=observation.adapter_digest
								AND bootstrap.provider_request_digest=observation.request_digest
								AND bootstrap.provider_response_digest=observation.response_digest
								AND bootstrap.dispatch_intent_digest=observation.dispatch_intent_digest
								AND bootstrap.transport_receipt_digest=observation.transport_receipt_digest
								AND bootstrap.result_spool_receipt_digest=
									observation.result_spool_receipt_digest
								AND bootstrap.normalized_event_set_digest=
									observation.normalized_event_set_digest
								AND bootstrap.runtime_fact_source_authority_digest=
									ref.runtime_fact_source_authority_digest
								AND bootstrap.registration_receipt_digest=ref.registration_receipt_digest
								AND bootstrap.outcome='observed' AND bootstrap.v45_eligible
								AND bootstrap.fact_kind=expected_fact_kind
								AND bootstrap.fact_digest=NEW.source_handle_digest
								AND bootstrap.fact_json=selected_fact
								AND bootstrap.observed_at=observation.observed_at
								AND bootstrap.sealed_at<=NEW.requested_at
								AND bootstrap.native_provider_source_receipt_json->>'invocationId'=
									NEW.source_invocation_id
								AND bootstrap.native_provider_source_receipt_json->>'requestDigest'=
									observation.request_digest
								AND bootstrap.native_provider_source_receipt_json->>'responseDigest'=
									observation.response_digest
								AND bootstrap.native_provider_source_receipt_json->>'sourceDigest'=
									bootstrap.native_provider_source_digest
								AND bootstrap.native_provider_source_receipt_json->>'receiptDigest'=
									bootstrap.native_provider_source_receipt_digest
								AND bootstrap.native_provider_source_receipt_json#>>'{fact,factType}'=
									expected_fact_kind
								AND bootstrap.native_provider_source_receipt_json#>'{fact,value}'=
									selected_fact->'value'
							FOR SHARE
						) candidate;
						expected_source_kind:=CASE NEW.binding_kind
							WHEN 'provider-job' THEN 'provider-job-active-status'
							ELSE 'provider-stored-continuation'
						END;
						IF bootstrap_count<>1
							OR native_source->>'sourceKind' IS DISTINCT FROM expected_source_kind THEN
							RAISE EXCEPTION 'capability-effect stateful registry lacks one exact active native source'
								USING ERRCODE='23514';
						END IF;
						SELECT COUNT(*) INTO vault_count FROM (
							SELECT 1
							FROM agent_evaluation_native_provider_state_vault_records vault
							WHERE vault.namespace_id=NEW.namespace_id
								AND vault.plan_digest=NEW.plan_digest
								AND vault.repository_commit=NEW.repository_commit
								AND vault.status='active' AND vault.v45_eligible
								AND vault.expires_at>NEW.requested_at
								AND vault.expires_at>CURRENT_TIMESTAMP
								AND vault.authority_digest=native_source->>'stateVaultAuthorityDigest'
								AND vault.seal_request_digest=
									native_source->>'stateVaultSealRequestDigest'
								AND vault.seal_receipt_digest=
									native_source->>'stateVaultSealReceiptDigest'
								AND vault.opaque_provider_state_ref=
									native_source->>'opaqueProviderStateRef'
								AND vault.provider_state_reference_digest=
									native_source->>'providerStateReferenceDigest'
								AND vault.attempt_id=NEW.source_attempt_id
								AND vault.invocation_id=NEW.source_invocation_id
								AND vault.generation=(native_source->>'generation')::bigint
								AND vault.task_id=native_source->>'taskId'
								AND vault.run_id=native_source->>'runId'
								AND vault.purpose=CASE NEW.binding_kind
									WHEN 'provider-job' THEN 'background-job-state'
									ELSE 'reasoning-continuation-state' END
								AND vault.seal_request_json=
									NEW.receipt_json->'stateVaultSealRequest'
								AND vault.seal_receipt_json=
									NEW.receipt_json->'stateVaultSealReceipt'
								AND vault.seal_request_json->>'protocolFamily'=
									observation.protocol_family
								AND vault.seal_request_json->>'probeProgramDigest'=
									native_probe_program_digest
								AND vault.seal_request_json->>'capabilityProfileDigest'=
									native_capability_profile_digest
								AND vault.seal_request_json->>'requestDigest'=observation.request_digest
								AND vault.seal_request_json->>'responseDigest'=observation.response_digest
								AND vault.seal_request_json->>'providerConfigurationId'=
									observation.provider_configuration_id
								AND vault.seal_request_json->>'modelLineageDigest'=
									observation.model_lineage_digest
								AND vault.seal_request_json->>'adapterDigest'=observation.adapter_digest
							FOR SHARE
						) matches;
						IF vault_count<>1 THEN
							RAISE EXCEPTION 'capability-effect stateful registry lacks one exact active state-vault seal'
								USING ERRCODE='23514';
						END IF;
					END IF;
				END IF;
				IF jsonb_typeof(NEW.receipt_json)<>'object'
					OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>31
					OR NOT (NEW.receipt_json ?& ARRAY[
						'format','version','bindingKind','capabilityId','requestRef','targetRef',
						'requestRefAuthority','requestRefAuthorityReceiptDigest','sourceAttemptId',
						'sourceTurnIndex','sourceInvocationId','sourceProviderRequestDigest',
						'sourceResponseDigest','sourceDispatchIntentDigest','sourceTransportReceiptDigest',
						'sourceResultSpoolReceiptDigest','sourceNormalizedEventSetDigest',
						'sourceObservationReceiptDigest','sourceFactKind','sourceProviderEventType',
						'sourceProviderToolCallId','sourceToolId','sourceArgumentsDigest','sourceHandleDigest',
						'stateVaultSealRequest','stateVaultSealReceipt',
						'protocolFamily','providerConfigurationId','modelLineageDigest','adapterDigest','receiptDigest'
					])
					OR NEW.receipt_json->>'format'<>
						'prodivix.agent-evaluation-capability-effect-input-authority-registry-receipt'
					OR (NEW.receipt_json->>'version')::bigint<>1
					OR NEW.receipt_json->>'bindingKind'<>NEW.binding_kind
					OR NEW.receipt_json->>'capabilityId'<>ref.capability_id
					OR NEW.receipt_json->>'requestRef'<>NEW.request_ref
					OR NEW.receipt_json->>'targetRef'<>NEW.target_ref
					OR NEW.receipt_json->>'sourceAttemptId'<>NEW.source_attempt_id
					OR (NEW.receipt_json->>'sourceTurnIndex')::bigint<>NEW.source_turn_index
					OR NEW.receipt_json->>'sourceInvocationId'<>NEW.source_invocation_id
					OR NEW.receipt_json->>'sourceHandleDigest'<>NEW.source_handle_digest
					OR NEW.receipt_json->>'protocolFamily'<>ref.protocol_family
					OR NEW.receipt_json->>'providerConfigurationId'<>ref.provider_configuration_id
					OR NEW.receipt_json->>'modelLineageDigest'<>ref.model_lineage_digest
					OR NEW.receipt_json->>'adapterDigest'<>ref.adapter_digest
					OR NEW.receipt_json->>'receiptDigest'<>NEW.receipt_digest THEN
					RAISE EXCEPTION 'capability-effect input registry receipt binding drifted'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_effect_input_capacity()
				RETURNS trigger AS $$
			DECLARE
				family_count BIGINT;
				committed_bytes BIGINT;
				incoming_bytes BIGINT;
			BEGIN
				PERFORM 1 FROM agent_evaluation_plans
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit FOR UPDATE;
				IF NOT FOUND THEN
					RAISE EXCEPTION 'capability-effect input authority plan is missing'
						USING ERRCODE='23514';
				END IF;
				IF TG_TABLE_NAME='agent_evaluation_capability_effect_request_ref_authorities' THEN
					IF EXISTS (
						SELECT 1 FROM agent_evaluation_capability_effect_request_ref_authorities existing
						WHERE existing.namespace_id=NEW.namespace_id
							AND existing.plan_digest=NEW.plan_digest
							AND existing.repository_commit=NEW.repository_commit
							AND existing.request_digest=NEW.request_digest
					) THEN
						RETURN NEW;
					END IF;
					SELECT COUNT(*) INTO family_count
					FROM agent_evaluation_capability_effect_request_ref_authorities
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit;
					incoming_bytes:=octet_length(NEW.request_bytes)+octet_length(NEW.receipt_bytes);
				ELSIF TG_TABLE_NAME='agent_evaluation_capability_effect_current_turn_events' THEN
					IF EXISTS (
						SELECT 1 FROM agent_evaluation_capability_effect_current_turn_events existing
						WHERE existing.namespace_id=NEW.namespace_id
							AND existing.plan_digest=NEW.plan_digest
							AND existing.repository_commit=NEW.repository_commit
							AND existing.request_digest=NEW.request_digest
					) THEN
						RETURN NEW;
					END IF;
					SELECT COUNT(*) INTO family_count
					FROM agent_evaluation_capability_effect_current_turn_events
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit;
					incoming_bytes:=octet_length(NEW.request_bytes)+octet_length(NEW.normalized_events_bytes)
						+octet_length(NEW.selected_event_bytes)+octet_length(NEW.receipt_bytes);
				ELSE
					IF EXISTS (
						SELECT 1
						FROM agent_evaluation_capability_effect_input_authority_registry_receipts existing
						WHERE existing.namespace_id=NEW.namespace_id
							AND existing.plan_digest=NEW.plan_digest
							AND existing.repository_commit=NEW.repository_commit
							AND existing.request_digest=NEW.request_digest
					) THEN
						RETURN NEW;
					END IF;
					SELECT COUNT(*) INTO family_count
					FROM agent_evaluation_capability_effect_input_authority_registry_receipts
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND repository_commit=NEW.repository_commit;
					incoming_bytes:=octet_length(NEW.request_bytes)+octet_length(NEW.receipt_bytes);
				END IF;
				SELECT
					COALESCE((SELECT SUM(octet_length(request_bytes)+octet_length(receipt_bytes))
						FROM agent_evaluation_capability_effect_request_ref_authorities
						WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
							AND repository_commit=NEW.repository_commit),0)
					+COALESCE((SELECT SUM(octet_length(request_bytes)+octet_length(normalized_events_bytes)
						+octet_length(selected_event_bytes)+octet_length(receipt_bytes))
						FROM agent_evaluation_capability_effect_current_turn_events
						WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
							AND repository_commit=NEW.repository_commit),0)
					+COALESCE((SELECT SUM(octet_length(request_bytes)+octet_length(receipt_bytes))
						FROM agent_evaluation_capability_effect_input_authority_registry_receipts
						WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
							AND repository_commit=NEW.repository_commit),0)
				INTO committed_bytes;
				IF family_count>=5880 OR committed_bytes+incoming_bytes>8589934592 THEN
					RAISE EXCEPTION 'capability-effect input authority exceeds frozen release capacity'
						USING ERRCODE='23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_capability_effect_request_ref_binding
				BEFORE INSERT ON agent_evaluation_capability_effect_request_ref_authorities
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_effect_request_ref_binding()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_current_event_binding
				BEFORE INSERT ON agent_evaluation_capability_effect_current_turn_events
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_effect_current_event_binding()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_registry_binding
				BEFORE INSERT ON agent_evaluation_capability_effect_input_authority_registry_receipts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_effect_registry_binding()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_request_ref_capacity
				BEFORE INSERT ON agent_evaluation_capability_effect_request_ref_authorities
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_effect_input_capacity()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_current_event_capacity
				BEFORE INSERT ON agent_evaluation_capability_effect_current_turn_events
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_effect_input_capacity()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_registry_capacity
				BEFORE INSERT ON agent_evaluation_capability_effect_input_authority_registry_receipts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_effect_input_capacity()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_request_ref_immutable
				BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_request_ref_authorities
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_current_event_immutable
				BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_current_turn_events
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_registry_immutable
				BEFORE UPDATE OR DELETE ON agent_evaluation_capability_effect_input_authority_registry_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_request_ref_finalized
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_request_ref_authorities
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_current_event_finalized
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_current_turn_events
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TRIGGER agent_evaluation_capability_effect_registry_finalized
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_effect_input_authority_registry_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_capability_specific_receipts (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				receipt_id TEXT NOT NULL,
				receipt_kind TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				descriptor_digest TEXT NOT NULL,
				case_id TEXT NOT NULL,
				material_digest TEXT NOT NULL,
				capability_descriptor_digest TEXT NOT NULL,
				turn_index BIGINT NOT NULL,
				invocation_id TEXT NOT NULL,
				request_digest TEXT NOT NULL,
				result_digest TEXT NOT NULL,
				authority_kind TEXT NOT NULL,
				authority_fact_digest TEXT NOT NULL,
				started_at TIMESTAMPTZ NOT NULL,
				completed_at TIMESTAMPTZ NOT NULL,
				receipt_digest TEXT NOT NULL,
				receipt_json JSONB NOT NULL,
				provider_capability_observation_receipt_digest TEXT GENERATED ALWAYS AS (
					receipt_json->>'providerCapabilityObservationReceiptDigest'
				) STORED,
				receipt_bytes BYTEA NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, receipt_id),
				UNIQUE (namespace_id, receipt_digest),
				UNIQUE (namespace_id, plan_digest, repository_commit, attempt_id, receipt_kind),
				FOREIGN KEY (namespace_id, plan_digest, repository_commit)
					REFERENCES agent_evaluation_plans(namespace_id, plan_digest, repository_commit)
					ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id)
					REFERENCES agent_evaluation_attempts(namespace_id, plan_digest, attempt_id)
					ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest,
					turn_index, invocation_id, request_digest,
					provider_capability_observation_receipt_digest
				) REFERENCES agent_evaluation_provider_capability_observation_receipts(
					namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest,
					turn_index, invocation_id, request_digest, receipt_digest
				) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
				CONSTRAINT agent_evaluation_capability_specific_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_capability_specific_kind_check CHECK (
					receipt_kind IN (
						'ack-reconciliation-receipt', 'attempt-idempotency-receipt',
						'authority-denial-receipt', 'background-job-receipt',
						'budget-reservation-receipt', 'cache-lineage-receipt',
						'cancellation-receipt', 'capability-unavailable-receipt',
						'checkpoint-resume-receipt', 'conservative-usage-receipt',
						'continuation-receipt', 'late-callback-rejection-receipt',
						'late-output-fence-receipt', 'lease-fence-receipt',
						'parallel-call-set-receipt', 'reconciliation-receipt',
						'refusal-receipt', 'repair-round-receipt',
						'retrieval-citation-receipt', 'reverse-transaction-receipt',
						'source-freshness-receipt', 'state-fence-receipt',
						'timeout-receipt', 'tool-execution-receipt', 'truncation-receipt',
						'usage-receipt', 'usage-reconciliation-receipt',
						'verification-closure-receipt'
					)
					AND authority_kind IN (
						'provider-job', 'provider-cache', 'opaque-continuation',
						'retrieval-query', 'parallel-tool-join', 'controlled-tool-execution',
						'controlled-continuation', 'controlled-runtime', 'usage-vector',
						'terminal-normalization', 'recovery-authority', 'capability-denial'
					)
				),
				CONSTRAINT agent_evaluation_capability_specific_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND material_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_descriptor_digest ~ '^sha256-[a-f0-9]{64}$'
					AND request_digest ~ '^sha256-[a-f0-9]{64}$'
					AND result_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_fact_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				),
				CONSTRAINT agent_evaluation_capability_specific_bounds_check CHECK (
					turn_index BETWEEN 0 AND 64
					AND octet_length(receipt_bytes) BETWEEN 1 AND 65536
					AND completed_at >= started_at
				),
				CONSTRAINT agent_evaluation_capability_specific_observation_check CHECK (
					(authority_kind IN (
						'provider-job', 'provider-cache', 'opaque-continuation',
						'retrieval-query', 'usage-vector', 'terminal-normalization'
					) AND provider_capability_observation_receipt_digest IS NOT NULL
						AND receipt_json ? 'providerCapabilityObservationReceiptDigest'
						AND provider_capability_observation_receipt_digest ~ '^sha256-[a-f0-9]{64}$')
					OR (authority_kind NOT IN (
						'provider-job', 'provider-cache', 'opaque-continuation',
						'retrieval-query', 'usage-vector', 'terminal-normalization'
					) AND NOT (receipt_json ? 'providerCapabilityObservationReceiptDigest')
						AND provider_capability_observation_receipt_digest IS NULL)
				),
				CONSTRAINT agent_evaluation_capability_specific_json_binding_check CHECK (COALESCE((
					receipt_json ?& ARRAY[
						'format', 'version', 'receiptId', 'receiptKind', 'planDigest',
						'repositoryCommit', 'attemptId', 'descriptorDigest', 'caseId',
						'materialDigest', 'capabilityDescriptorDigest', 'turnIndex',
						'invocationId', 'requestDigest', 'resultDigest', 'startedAt',
						'completedAt', 'authority', 'receiptDigest'
					]
					AND jsonb_typeof(receipt_json->'authority') = 'object'
					AND (receipt_json->'authority') ?& ARRAY['authorityKind', 'factDigest']
					AND receipt_json->>'planDigest' = plan_digest
					AND receipt_json->>'repositoryCommit' = repository_commit
					AND receipt_json->>'receiptId' = receipt_id
					AND receipt_json->>'receiptKind' = receipt_kind
					AND receipt_json->>'attemptId' = attempt_id
					AND receipt_json->>'descriptorDigest' = descriptor_digest
					AND receipt_json->>'caseId' = case_id
					AND receipt_json->>'materialDigest' = material_digest
					AND receipt_json->>'capabilityDescriptorDigest' = capability_descriptor_digest
					AND (receipt_json->>'turnIndex')::bigint = turn_index
					AND receipt_json->>'invocationId' = invocation_id
					AND receipt_json->>'requestDigest' = request_digest
					AND receipt_json->>'resultDigest' = result_digest
					AND receipt_json#>>'{authority,authorityKind}' = authority_kind
					AND receipt_json#>>'{authority,factDigest}' = authority_fact_digest
					AND (receipt_json->>'startedAt')::timestamptz = started_at
					AND (receipt_json->>'completedAt')::timestamptz = completed_at
					AND receipt_json->>'receiptDigest' = receipt_digest
				), FALSE))
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_capability_specific_observation_binding()
				RETURNS trigger AS $$
			DECLARE
				expected_fact_kind TEXT;
				expected_fact_digest TEXT;
				observation_facts JSONB;
				observation_observed_at TIMESTAMPTZ;
			BEGIN
				IF EXISTS (
					SELECT 1 FROM agent_evaluation_controlled_authority_requests legacy
					WHERE legacy.namespace_id=NEW.namespace_id
						AND legacy.plan_digest=NEW.plan_digest
						AND legacy.repository_commit=NEW.repository_commit
						AND legacy.attempt_id=NEW.attempt_id
						AND legacy.service_kind IN ('provider-capability', 'attempt-grading')
						AND NOT legacy.v45_eligible
				) THEN
					RAISE EXCEPTION 'legacy attempt cannot accept v45 capability-specific facts'
						USING ERRCODE = '23514';
				END IF;
				IF NEW.provider_capability_observation_receipt_digest IS NULL THEN
					RETURN NEW;
				END IF;
				expected_fact_kind := CASE NEW.authority_kind
					WHEN 'provider-job' THEN 'provider-job-receipt'
					WHEN 'provider-cache' THEN 'provider-cache-receipt'
					WHEN 'opaque-continuation' THEN 'opaque-continuation'
					WHEN 'retrieval-query' THEN 'retrieval-query-receipt'
					WHEN 'usage-vector' THEN 'usage-vector'
					WHEN 'terminal-normalization' THEN 'provider-event'
				END;
				expected_fact_digest := CASE NEW.authority_kind
					WHEN 'terminal-normalization' THEN
						NEW.receipt_json#>>'{authority,fact,terminalEventDigest}'
					ELSE NEW.authority_fact_digest
				END;
				SELECT receipt_json->'facts', observed_at
				INTO observation_facts, observation_observed_at
				FROM agent_evaluation_provider_capability_observation_receipts
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit
					AND attempt_id=NEW.attempt_id AND descriptor_digest=NEW.descriptor_digest
					AND turn_index=NEW.turn_index AND invocation_id=NEW.invocation_id
					AND request_digest=NEW.request_digest
					AND receipt_digest=NEW.provider_capability_observation_receipt_digest
				FOR SHARE;
				IF observation_facts IS NULL OR NEW.completed_at < observation_observed_at
					OR NOT EXISTS (
					SELECT 1 FROM jsonb_array_elements(observation_facts) AS observed_fact
					WHERE observed_fact->>'factKind'=expected_fact_kind
						AND observed_fact->>'factDigest'=expected_fact_digest
				) THEN
					RAISE EXCEPTION 'agent evaluation capability-specific fact is absent from its provider observation'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_capability_specific_receipts_observation_binding
				BEFORE INSERT ON agent_evaluation_capability_specific_receipts
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_capability_specific_observation_binding()`,
			`CREATE TRIGGER agent_evaluation_capability_specific_receipts_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_capability_specific_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_capability_specific_receipts_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_capability_specific_receipts
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_attempt_authority_commit_links (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				attempt_digest TEXT NOT NULL,
				committed_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, receipt_digest),
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest
				) REFERENCES agent_evaluation_attempt_authority_owner_receipts(
					namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest
				) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, attempt_digest)
					REFERENCES agent_evaluation_attempts(
						namespace_id, plan_digest, attempt_id, attempt_digest
					)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_attempt_authority_commit_link_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_attempt_authority_commit_link_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attempt_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_attempt_authority_commit_links_attempt
				ON agent_evaluation_attempt_authority_commit_links(namespace_id, plan_digest, attempt_id)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_attempt_authority_commit_link_binding()
				RETURNS trigger AS $$
			DECLARE
				attempt_completed_at TIMESTAMPTZ;
			BEGIN
				SELECT completed_at INTO attempt_completed_at
				FROM agent_evaluation_attempts
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND attempt_id=NEW.attempt_id AND attempt_digest=NEW.attempt_digest
				FOR SHARE;
				IF NOT FOUND OR attempt_completed_at IS DISTINCT FROM NEW.committed_at THEN
					RAISE EXCEPTION 'agent evaluation attempt-authority commit link drifted from its attempt completion'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_attempt_authority_commit_links_exact_binding
				BEFORE INSERT ON agent_evaluation_attempt_authority_commit_links
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_attempt_authority_commit_link_binding()`,
			`CREATE TRIGGER agent_evaluation_attempt_authority_commit_links_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_attempt_authority_commit_links
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_attempt_authority_commit_links_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_attempt_authority_commit_links
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_provider_capability_observation_commit_links (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				repository_commit TEXT NOT NULL,
				receipt_digest TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				attempt_digest TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest, repository_commit, receipt_digest),
				FOREIGN KEY (
					namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest
				) REFERENCES agent_evaluation_provider_capability_observation_receipts(
					namespace_id, plan_digest, repository_commit, attempt_id, receipt_digest
				) ON DELETE RESTRICT,
				FOREIGN KEY (namespace_id, plan_digest, attempt_id, attempt_digest)
					REFERENCES agent_evaluation_attempts(
						namespace_id, plan_digest, attempt_id, attempt_digest
					)
					ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_provider_capability_observation_commit_link_commit_check
					CHECK (repository_commit ~ '^[a-f0-9]{40}$'),
				CONSTRAINT agent_evaluation_provider_capability_observation_commit_link_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND receipt_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attempt_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_evaluation_provider_observation_commit_links_attempt
				ON agent_evaluation_provider_capability_observation_commit_links(
					namespace_id, plan_digest, attempt_id
				)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_provider_observation_commit_link_binding()
				RETURNS trigger AS $$
			DECLARE
				attempt_completed_at TIMESTAMPTZ;
				observation_observed_at TIMESTAMPTZ;
			BEGIN
				SELECT completed_at INTO attempt_completed_at
				FROM agent_evaluation_attempts
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND attempt_id=NEW.attempt_id AND attempt_digest=NEW.attempt_digest
				FOR SHARE;
				SELECT observed_at INTO observation_observed_at
				FROM agent_evaluation_provider_capability_observation_receipts
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND repository_commit=NEW.repository_commit AND attempt_id=NEW.attempt_id
					AND receipt_digest=NEW.receipt_digest
				FOR SHARE;
				IF attempt_completed_at IS NULL OR observation_observed_at IS NULL
					OR attempt_completed_at IS DISTINCT FROM NEW.created_at
					OR observation_observed_at > NEW.created_at THEN
					RAISE EXCEPTION 'agent evaluation provider-observation commit link drifted from its attempt'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_provider_observation_commit_links_exact_binding
				BEFORE INSERT ON agent_evaluation_provider_capability_observation_commit_links
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_provider_observation_commit_link_binding()`,
			`CREATE TRIGGER agent_evaluation_provider_observation_commit_links_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_provider_capability_observation_commit_links
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_provider_observation_commit_links_finalized_mutation
				BEFORE INSERT OR UPDATE OR DELETE ON agent_evaluation_provider_capability_observation_commit_links
				FOR EACH ROW EXECUTE FUNCTION reject_agent_evaluation_finalized_mutation()`,
			`ALTER TABLE agent_evaluation_authority_attestations
				ADD COLUMN IF NOT EXISTS v45_eligible BOOLEAN`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ADD COLUMN IF NOT EXISTS v45_eligible BOOLEAN`,
			`DROP TRIGGER IF EXISTS agent_evaluation_authority_attestations_immutable_mutation
				ON agent_evaluation_authority_attestations`,
			`DROP TRIGGER IF EXISTS agent_evaluation_evidence_roots_immutable_mutation
				ON agent_evaluation_evidence_roots`,
			`UPDATE agent_evaluation_authority_attestations
				SET v45_eligible=FALSE WHERE v45_eligible IS NULL`,
			`UPDATE agent_evaluation_evidence_roots
				SET v45_eligible=FALSE WHERE v45_eligible IS NULL`,
			`ALTER TABLE agent_evaluation_authority_attestations
				ALTER COLUMN v45_eligible SET DEFAULT TRUE,
				ALTER COLUMN v45_eligible SET NOT NULL`,
			`ALTER TABLE agent_evaluation_evidence_roots
				ALTER COLUMN v45_eligible SET DEFAULT TRUE,
				ALTER COLUMN v45_eligible SET NOT NULL`,
			`CREATE TRIGGER agent_evaluation_authority_attestations_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_authority_attestations
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE TRIGGER agent_evaluation_evidence_roots_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_evidence_roots
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint
					WHERE conname='agent_evaluation_evidence_roots_v45_exact_identity_key'
						AND conrelid='agent_evaluation_evidence_roots'::regclass) THEN
					ALTER TABLE agent_evaluation_evidence_roots
						ADD CONSTRAINT agent_evaluation_evidence_roots_v45_exact_identity_key
						UNIQUE (namespace_id, plan_digest, root_digest);
				END IF;
			END $$`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_authority_attestation_v45_roots (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				attestation_digest TEXT NOT NULL,
				attempt_authority_owner_receipt_set_digest TEXT NOT NULL,
				provider_capability_observation_receipt_set_digest TEXT NOT NULL,
				capability_specific_receipt_set_digest TEXT NOT NULL,
				validated_human_metric_observation_set_digest TEXT NOT NULL,
				capability_probe_admission_set_digest TEXT NOT NULL,
				capability_probe_reference_receipt_set_digest TEXT NOT NULL,
				runtime_fact_source_owner_registration_set_digest TEXT NOT NULL,
				capability_probe_provider_resource_cleanup_set_digest TEXT NOT NULL,
				hosted_retrieval_runtime_resource_cleanup_set_digest TEXT NOT NULL,
				capability_effect_provider_runtime_journal_set_digest TEXT NOT NULL,
				optional_capability_fact_source_set_digest TEXT NOT NULL,
				optional_capability_fact_authority_set_digest TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (
					namespace_id, plan_digest, attestation_digest,
					attempt_authority_owner_receipt_set_digest,
					provider_capability_observation_receipt_set_digest,
					capability_specific_receipt_set_digest,
					validated_human_metric_observation_set_digest,
					capability_probe_admission_set_digest,
					capability_probe_reference_receipt_set_digest,
					runtime_fact_source_owner_registration_set_digest,
					capability_probe_provider_resource_cleanup_set_digest,
					hosted_retrieval_runtime_resource_cleanup_set_digest,
					capability_effect_provider_runtime_journal_set_digest,
					optional_capability_fact_source_set_digest,
					optional_capability_fact_authority_set_digest
				),
				FOREIGN KEY (namespace_id, plan_digest, attestation_digest)
					REFERENCES agent_evaluation_authority_attestations(
						namespace_id, plan_digest, attestation_digest
					) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_authority_attestation_v45_roots_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attestation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attempt_authority_owner_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_capability_observation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_specific_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND validated_human_metric_observation_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_probe_admission_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_probe_reference_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND runtime_fact_source_owner_registration_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_probe_provider_resource_cleanup_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND hosted_retrieval_runtime_resource_cleanup_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_effect_provider_runtime_journal_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND optional_capability_fact_source_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND optional_capability_fact_authority_set_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`CREATE TABLE IF NOT EXISTS agent_evaluation_evidence_root_v45_roots (
				namespace_id TEXT NOT NULL,
				plan_digest TEXT NOT NULL,
				root_digest TEXT NOT NULL,
				authority_attestation_digest TEXT NOT NULL,
				attempt_authority_owner_receipt_set_digest TEXT NOT NULL,
				provider_capability_observation_receipt_set_digest TEXT NOT NULL,
				capability_specific_receipt_set_digest TEXT NOT NULL,
				validated_human_metric_observation_set_digest TEXT NOT NULL,
				capability_probe_admission_set_digest TEXT NOT NULL,
				capability_probe_reference_receipt_set_digest TEXT NOT NULL,
				runtime_fact_source_owner_registration_set_digest TEXT NOT NULL,
				capability_probe_provider_resource_cleanup_set_digest TEXT NOT NULL,
				hosted_retrieval_runtime_resource_cleanup_set_digest TEXT NOT NULL,
				capability_effect_provider_runtime_journal_set_digest TEXT NOT NULL,
				optional_capability_fact_source_set_digest TEXT NOT NULL,
				optional_capability_fact_authority_set_digest TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL,
				PRIMARY KEY (namespace_id, plan_digest),
				UNIQUE (
					namespace_id, plan_digest, root_digest, authority_attestation_digest,
					attempt_authority_owner_receipt_set_digest,
					provider_capability_observation_receipt_set_digest,
					capability_specific_receipt_set_digest,
					validated_human_metric_observation_set_digest,
					capability_probe_admission_set_digest,
					capability_probe_reference_receipt_set_digest,
					runtime_fact_source_owner_registration_set_digest,
					capability_probe_provider_resource_cleanup_set_digest,
					hosted_retrieval_runtime_resource_cleanup_set_digest,
					capability_effect_provider_runtime_journal_set_digest,
					optional_capability_fact_source_set_digest,
					optional_capability_fact_authority_set_digest
				),
				FOREIGN KEY (namespace_id, plan_digest, root_digest)
					REFERENCES agent_evaluation_evidence_roots(
						namespace_id, plan_digest, root_digest
					) ON DELETE RESTRICT,
				FOREIGN KEY (
					namespace_id, plan_digest, authority_attestation_digest,
					attempt_authority_owner_receipt_set_digest,
					provider_capability_observation_receipt_set_digest,
					capability_specific_receipt_set_digest,
					validated_human_metric_observation_set_digest,
					capability_probe_admission_set_digest,
					capability_probe_reference_receipt_set_digest,
					runtime_fact_source_owner_registration_set_digest,
					capability_probe_provider_resource_cleanup_set_digest,
					hosted_retrieval_runtime_resource_cleanup_set_digest,
					capability_effect_provider_runtime_journal_set_digest,
					optional_capability_fact_source_set_digest,
					optional_capability_fact_authority_set_digest
				) REFERENCES agent_evaluation_authority_attestation_v45_roots(
					namespace_id, plan_digest, attestation_digest,
					attempt_authority_owner_receipt_set_digest,
					provider_capability_observation_receipt_set_digest,
					capability_specific_receipt_set_digest,
					validated_human_metric_observation_set_digest,
					capability_probe_admission_set_digest,
					capability_probe_reference_receipt_set_digest,
					runtime_fact_source_owner_registration_set_digest,
					capability_probe_provider_resource_cleanup_set_digest,
					hosted_retrieval_runtime_resource_cleanup_set_digest,
					capability_effect_provider_runtime_journal_set_digest,
					optional_capability_fact_source_set_digest,
					optional_capability_fact_authority_set_digest
				) ON DELETE RESTRICT,
				CONSTRAINT agent_evaluation_evidence_root_v45_roots_digest_check CHECK (
					plan_digest ~ '^sha256-[a-f0-9]{64}$'
					AND root_digest ~ '^sha256-[a-f0-9]{64}$'
					AND authority_attestation_digest ~ '^sha256-[a-f0-9]{64}$'
					AND attempt_authority_owner_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND provider_capability_observation_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_specific_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND validated_human_metric_observation_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_probe_admission_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_probe_reference_receipt_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND runtime_fact_source_owner_registration_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_probe_provider_resource_cleanup_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND hosted_retrieval_runtime_resource_cleanup_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND capability_effect_provider_runtime_journal_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND optional_capability_fact_source_set_digest ~ '^sha256-[a-f0-9]{64}$'
					AND optional_capability_fact_authority_set_digest ~ '^sha256-[a-f0-9]{64}$'
				)
			)`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_v45_publication_insert()
				RETURNS trigger AS $$
			BEGIN
				IF NEW.v45_eligible IS DISTINCT FROM TRUE THEN
					RAISE EXCEPTION 'new evaluation publication must use v45 authority'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_authority_attestations_v45_insert
				BEFORE INSERT ON agent_evaluation_authority_attestations
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_v45_publication_insert()`,
			`CREATE TRIGGER agent_evaluation_evidence_roots_v45_insert
				BEFORE INSERT ON agent_evaluation_evidence_roots
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_v45_publication_insert()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_attestation_v45_roots_binding()
				RETURNS trigger AS $$
			DECLARE
				base_v45_eligible BOOLEAN;
				base_issued_at TIMESTAMPTZ;
			BEGIN
				SELECT v45_eligible, issued_at INTO base_v45_eligible, base_issued_at
				FROM agent_evaluation_authority_attestations
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND attestation_digest=NEW.attestation_digest
				FOR SHARE;
				IF NOT FOUND OR base_v45_eligible IS DISTINCT FROM TRUE
					OR base_issued_at IS DISTINCT FROM NEW.created_at THEN
					RAISE EXCEPTION 'evaluation attestation v45 roots drifted from current authority'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_attestation_v45_roots_exact_binding
				BEFORE INSERT ON agent_evaluation_authority_attestation_v45_roots
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_attestation_v45_roots_binding()`,
			`CREATE TRIGGER agent_evaluation_attestation_v45_roots_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_authority_attestation_v45_roots
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_evidence_root_v45_roots_binding()
				RETURNS trigger AS $$
			DECLARE
				base_v45_eligible BOOLEAN;
				base_recorded_at TIMESTAMPTZ;
			BEGIN
				SELECT v45_eligible, recorded_at INTO base_v45_eligible, base_recorded_at
				FROM agent_evaluation_evidence_roots
				WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
					AND root_digest=NEW.root_digest
				FOR SHARE;
				IF NOT FOUND OR base_v45_eligible IS DISTINCT FROM TRUE
					OR base_recorded_at IS DISTINCT FROM NEW.created_at THEN
					RAISE EXCEPTION 'evaluation evidence-root v45 roots drifted from current authority'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER agent_evaluation_evidence_root_v45_roots_exact_binding
				BEFORE INSERT ON agent_evaluation_evidence_root_v45_roots
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_evidence_root_v45_roots_binding()`,
			`CREATE TRIGGER agent_evaluation_evidence_root_v45_roots_immutable_mutation
				BEFORE UPDATE OR DELETE ON agent_evaluation_evidence_root_v45_roots
				FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_attestation_v45_roots()
				RETURNS trigger AS $$
			BEGIN
				IF NEW.v45_eligible AND NOT EXISTS (
					SELECT 1 FROM agent_evaluation_authority_attestation_v45_roots
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND attestation_digest=NEW.attestation_digest
				) THEN
					RAISE EXCEPTION 'current evaluation attestation lacks v45 authority roots'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_authority_attestations_v45_roots_required
				AFTER INSERT ON agent_evaluation_authority_attestations
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_attestation_v45_roots()`,
			`CREATE OR REPLACE FUNCTION require_agent_evaluation_evidence_root_v45_roots()
				RETURNS trigger AS $$
			BEGIN
				IF NEW.v45_eligible AND NOT EXISTS (
					SELECT 1 FROM agent_evaluation_evidence_root_v45_roots
					WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
						AND root_digest=NEW.root_digest
				) THEN
					RAISE EXCEPTION 'current evaluation evidence root lacks v45 authority roots'
						USING ERRCODE = '23514';
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE CONSTRAINT TRIGGER agent_evaluation_evidence_roots_v45_roots_required
				AFTER INSERT ON agent_evaluation_evidence_roots
				DEFERRABLE INITIALLY DEFERRED
				FOR EACH ROW EXECUTE FUNCTION require_agent_evaluation_evidence_root_v45_roots()`,
		},
	}
	result.statements = append(result.statements, agentEvaluationAttemptAuthorityResourceStatements()...)
	result.statements = append(result.statements, agentEvaluationAttemptAuthorityCleanupStatements()...)
	result.statements = append(result.statements, agentEvaluationNativeProviderStateVaultRecoveryTableStatements()...)
	result.statements = append(result.statements, agentEvaluationNativeProviderStateVaultStatements()...)
	result.statements = append(result.statements, agentEvaluationNativeProviderStateVaultRecoveryStatements()...)
	result.statements = append(result.statements, agentEvaluationCapabilityEffectProviderJournalStatements()...)
	result.statements = append(result.statements, agentEvaluationCapabilityEffectSourceConsumptionClaimStatements()...)
	result.statements = append(result.statements, agentEvaluationCapabilityEffectProviderJournalConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationCapabilityEffectSourceConsumptionClaimConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceCleanupStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceDiscoveryRecoveryStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceOwnerLedgerStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceRegistrationStageConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceReadConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceDiscoveryConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceFenceConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceCleanupConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceRecoveryConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceLifecycleV5ConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceClaimV5ConstraintStatements()...)
	result.statements = append(result.statements, agentEvaluationHostedRetrievalRuntimeResourceBudgetConstraintStatements()...)
	return result
}
