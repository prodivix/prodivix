package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6UnfinishedDiscoveryStatements
// snapshots dispatches that have first-delivery history but no final journal.
// Pages remain stable for at most one claim lifetime and never authorize a
// second Provider mutation.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6UnfinishedDiscoveryStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots (
			namespace_id TEXT NOT NULL,
			snapshot_id TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			frozen_run_digest TEXT NOT NULL,
			run_config_artifact_binding_digest TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			lifecycle_owner_instance_id TEXT NOT NULL,
			snapshot_revision BIGINT NOT NULL,
			snapshot_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			candidate_count BIGINT NOT NULL,
			candidates_json JSONB NOT NULL,
			candidates_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,snapshot_id),
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_unfinished_snapshot_check CHECK (
				repository_commit ~ '^[a-f0-9]{40}$'
				AND plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND frozen_run_digest ~ '^sha256-[a-f0-9]{64}$'
				AND run_config_artifact_binding_digest ~ '^sha256-[a-f0-9]{64}$'
				AND snapshot_revision>=1 AND expires_at>snapshot_at
				AND expires_at<=snapshot_at+INTERVAL '125 seconds'
				AND candidate_count=jsonb_array_length(candidates_json)
				AND octet_length(candidates_bytes) BETWEEN 2 AND 4194304
				AND candidates_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(candidates_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_pages (
			namespace_id TEXT NOT NULL,
			request_digest TEXT NOT NULL,
			request_json JSONB NOT NULL,
			request_bytes BYTEA NOT NULL,
			snapshot_id TEXT NOT NULL,
			snapshot_revision BIGINT NOT NULL,
			page_offset BIGINT NOT NULL,
			page_size BIGINT NOT NULL,
			recovery_authority_issuer_id TEXT NOT NULL,
			recovery_authority_implementation_digest TEXT NOT NULL,
			snapshot_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			candidate_count BIGINT NOT NULL,
			next_cursor TEXT,
			page_digest TEXT NOT NULL,
			page_json JSONB NOT NULL,
			page_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,request_digest),
			UNIQUE (namespace_id,page_digest),
			FOREIGN KEY (namespace_id,snapshot_id)
				REFERENCES agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots(
					namespace_id,snapshot_id
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_unfinished_page_check CHECK (
				request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND snapshot_revision>=1 AND page_offset>=0
				AND page_size BETWEEN 1 AND 8 AND candidate_count BETWEEN 0 AND 8
				AND recovery_authority_implementation_digest ~ '^sha256-[a-f0-9]{64}$'
				AND page_digest ~ '^sha256-[a-f0-9]{64}$'
				AND expires_at>snapshot_at
				AND expires_at<=snapshot_at+INTERVAL '125 seconds'
				AND octet_length(request_bytes) BETWEEN 1 AND 65536
				AND request_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(request_json),'UTF8')
				AND octet_length(page_bytes) BETWEEN 1 AND 524288
				AND page_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(page_json),'UTF8')
			)
		)`,
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_lifecycle_unfinished_dispatch_candidates(
			candidate_namespace_id TEXT,candidate_repository_commit TEXT,
			candidate_plan_digest TEXT,candidate_frozen_run_digest TEXT,
			candidate_run_config_binding_digest TEXT,candidate_runtime_resource_set_id TEXT
		) RETURNS JSONB LANGUAGE plpgsql STABLE PARALLEL RESTRICTED AS $$
		DECLARE
			group_row RECORD;
			registration_row agent_evaluation_hosted_retrieval_runtime_resource_registration_requests%ROWTYPE;
			spool_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools%ROWTYPE;
			intent_values JSONB;
			intent_digests JSONB;
			intent_set_base JSONB;
			intent_set_value JSONB;
			intent_set_digest TEXT;
			initial_receipts JSONB;
			initial_receipt_digests JSONB;
			initial_set_base JSONB;
			initial_set_value JSONB;
			initial_set_digest TEXT;
			history_receipts JSONB;
			history_receipt_digests JSONB;
			history_base JSONB;
			history_value JSONB;
			history_digest TEXT;
			candidate_base JSONB;
			candidate_value JSONB;
			candidate_values JSONB:='[]'::jsonb;
		BEGIN
			FOR group_row IN
				SELECT intent.registration_request_digest,intent.operation,
					MIN(intent.lifecycle_claim_receipt_digest) AS lifecycle_claim_receipt_digest
				FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents intent
				WHERE intent.namespace_id=candidate_namespace_id
					AND intent.repository_commit=candidate_repository_commit
					AND intent.plan_digest=candidate_plan_digest
					AND intent.runtime_resource_set_id=candidate_runtime_resource_set_id
					AND intent.v46_eligible
					AND NOT EXISTS (
						SELECT 1
						FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals journal
						WHERE journal.namespace_id=intent.namespace_id
							AND journal.registration_request_digest=intent.registration_request_digest
							AND journal.operation=intent.operation)
					AND EXISTS (
						SELECT 1
						FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current current_claim
						WHERE current_claim.namespace_id=intent.namespace_id
							AND current_claim.intent_digest=intent.intent_digest
							AND current_claim.sealed_journal_record_digest IS NULL)
					AND intent.intent_json->>'frozenRunDigest'=candidate_frozen_run_digest
					AND intent.intent_json->>'runConfigArtifactBindingDigest'=
						candidate_run_config_binding_digest
				GROUP BY intent.registration_request_digest,intent.operation
				ORDER BY intent.registration_request_digest COLLATE "C",intent.operation COLLATE "C"
			LOOP
				SELECT * INTO registration_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_requests request
				WHERE request.namespace_id=candidate_namespace_id
					AND request.repository_commit=candidate_repository_commit
					AND request.plan_digest=candidate_plan_digest
					AND request.runtime_resource_set_id=candidate_runtime_resource_set_id
					AND request.request_digest=group_row.registration_request_digest
					AND request.v46_eligible
				FOR SHARE;
				IF registration_row.request_digest IS NULL
					OR registration_row.request_json->>'namespaceId'<>candidate_namespace_id
					OR registration_row.request_json->>'repositoryCommit'<>
						candidate_repository_commit
					OR registration_row.request_json->>'planDigest'<>candidate_plan_digest
					OR registration_row.request_json->>'frozenRunDigest'<>
						candidate_frozen_run_digest
					OR registration_row.request_json->>'runConfigArtifactBindingDigest'<>
						candidate_run_config_binding_digest
					OR registration_row.request_json->>'runtimeResourceSetId'<>
						candidate_runtime_resource_set_id
					OR registration_row.request_json->>'requestDigest'<>
						group_row.registration_request_digest
					OR registration_row.request_bytes<>convert_to(
						agent_evaluation_canonical_jsonb_text(registration_row.request_json),'UTF8') THEN
					RAISE EXCEPTION 'hosted runtime lifecycle unfinished candidate lacks durable registration request'
						USING ERRCODE='23514';
				END IF;
				SELECT * INTO spool_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools spool
				WHERE spool.namespace_id=candidate_namespace_id
					AND spool.registration_request_digest=group_row.registration_request_digest
					AND spool.operation=group_row.operation AND spool.v46_eligible
					AND NOT EXISTS (
						SELECT 1
						FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_journals journal
						WHERE journal.namespace_id=spool.namespace_id
							AND journal.result_spool_ref=spool.spool_ref)
				ORDER BY spool.transport_stored_at DESC,spool.spool_ref COLLATE "C" DESC
				LIMIT 1 FOR SHARE;
				IF spool_row.spool_ref IS NOT NULL THEN
					intent_set_value:=spool_row.transport_store_request_json->'dispatchIntentSet';
					history_value:=spool_row.transport_store_request_json->'dispatchStageClaimHistorySet';
					candidate_base:=jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-candidate',
						'version',1,'registrationRequest',registration_row.request_json,
						'registrationRequestDigest',registration_row.request_digest,
						'dispatchIntentSet',intent_set_value,
						'dispatchIntentSetDigest',spool_row.dispatch_intent_set_digest,
						'dispatchStageClaimHistorySet',history_value,
						'dispatchStageClaimHistorySetDigest',
							spool_row.dispatch_stage_claim_history_set_digest,
						'unfinishedState','transport-stored-before-seal',
						'durableTransportReceiptSetDigest',spool_row.transport_receipt_set_digest,
						'spoolRef',spool_row.spool_ref,
						'transportStoreReceiptDigest',spool_row.transport_store_receipt_digest);
				ELSE
					SELECT jsonb_agg(intent.intent_json ORDER BY intent.mutation_sequence),
						jsonb_agg(to_jsonb(intent.intent_digest) ORDER BY intent.mutation_sequence)
					INTO intent_values,intent_digests
					FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents intent
					WHERE intent.namespace_id=candidate_namespace_id
						AND intent.registration_request_digest=group_row.registration_request_digest
						AND intent.operation=group_row.operation AND intent.v46_eligible;
					intent_set_base:=jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-intent-set',
						'version',1,'operation',group_row.operation,
						'registrationRequestDigest',group_row.registration_request_digest,
						'lifecycleClaimReceiptDigest',to_jsonb(group_row.lifecycle_claim_receipt_digest),
						'intents',intent_values,'intentDigests',intent_digests);
					intent_set_digest:=agent_evaluation_canonical_jsonb_digest(intent_set_base);
					intent_set_value:=intent_set_base||jsonb_build_object(
						'setDigest',intent_set_digest);
					SELECT jsonb_agg(receipt.receipt_json ORDER BY intent.mutation_sequence),
						jsonb_agg(to_jsonb(receipt.receipt_digest) ORDER BY intent.mutation_sequence)
					INTO initial_receipts,initial_receipt_digests
					FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents intent
					JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts receipt
					  ON receipt.namespace_id=intent.namespace_id
					 AND receipt.intent_digest=intent.intent_digest
					 AND receipt.generation_transition='initial-first-delivery'
					WHERE intent.namespace_id=candidate_namespace_id
						AND intent.registration_request_digest=group_row.registration_request_digest
						AND intent.operation=group_row.operation;
					initial_set_base:=jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-receipt-set',
						'version',1,'operation',group_row.operation,
						'registrationRequestDigest',group_row.registration_request_digest,
						'lifecycleClaimReceiptDigest',to_jsonb(group_row.lifecycle_claim_receipt_digest),
						'dispatchIntentSetDigest',intent_set_digest,
						'receipts',initial_receipts,'receiptDigests',initial_receipt_digests);
					initial_set_digest:=agent_evaluation_canonical_jsonb_digest(initial_set_base);
					initial_set_value:=initial_set_base||jsonb_build_object(
						'setDigest',initial_set_digest);
					SELECT jsonb_agg(receipt.receipt_json ORDER BY intent.mutation_sequence,
							receipt.claimed_at,receipt.receipt_digest COLLATE "C"),
						jsonb_agg(to_jsonb(receipt.receipt_digest) ORDER BY intent.mutation_sequence,
							receipt.claimed_at,receipt.receipt_digest COLLATE "C")
					INTO history_receipts,history_receipt_digests
					FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents intent
					JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts receipt
					  ON receipt.namespace_id=intent.namespace_id
					 AND receipt.intent_digest=intent.intent_digest
					WHERE intent.namespace_id=candidate_namespace_id
						AND intent.registration_request_digest=group_row.registration_request_digest
						AND intent.operation=group_row.operation;
					history_base:=jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-history-set',
						'version',1,'operation',group_row.operation,
						'registrationRequestDigest',group_row.registration_request_digest,
						'dispatchIntentSetDigest',intent_set_digest,
						'initialClaimReceiptSet',initial_set_value,
						'initialClaimReceiptSetDigest',initial_set_digest,
						'receipts',history_receipts,'receiptDigests',history_receipt_digests);
					history_digest:=agent_evaluation_canonical_jsonb_digest(history_base);
					history_value:=history_base||jsonb_build_object('setDigest',history_digest);
					candidate_base:=jsonb_build_object(
						'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-candidate',
						'version',1,'registrationRequest',registration_row.request_json,
						'registrationRequestDigest',registration_row.request_digest,
						'dispatchIntentSet',intent_set_value,
						'dispatchIntentSetDigest',intent_set_digest,
						'dispatchStageClaimHistorySet',history_value,
						'dispatchStageClaimHistorySetDigest',history_digest,
						'unfinishedState','staged-before-transport',
						'durableTransportReceiptSetDigest','null'::jsonb,
						'spoolRef','null'::jsonb,'transportStoreReceiptDigest','null'::jsonb);
				END IF;
				candidate_value:=candidate_base||jsonb_build_object(
					'candidateDigest',agent_evaluation_canonical_jsonb_digest(candidate_base));
				candidate_values:=candidate_values||jsonb_build_array(candidate_value);
			END LOOP;
			RETURN COALESCE((SELECT jsonb_agg(value ORDER BY
				value->>'dispatchIntentSetDigest' COLLATE "C")
				FROM jsonb_array_elements(candidate_values) member(value)),'[]'::jsonb);
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_unfinished_page_exact()
			RETURNS trigger AS $$
		DECLARE
			snapshot_row agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots%ROWTYPE;
			expected_candidates JSONB;
			expected_candidate_digests JSONB;
			expected_next_cursor TEXT;
		BEGIN
			SELECT * INTO snapshot_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots
			WHERE namespace_id=NEW.namespace_id AND snapshot_id=NEW.snapshot_id
			FOR SHARE;
			SELECT COALESCE(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb)
			INTO expected_candidates
			FROM jsonb_array_elements(snapshot_row.candidates_json)
				WITH ORDINALITY member(value,ordinality)
			WHERE ordinality>NEW.page_offset
				AND ordinality<=NEW.page_offset+NEW.page_size;
			SELECT COALESCE(jsonb_agg(value->'candidateDigest' ORDER BY ordinality),'[]'::jsonb)
			INTO expected_candidate_digests
			FROM jsonb_array_elements(expected_candidates)
				WITH ORDINALITY member(value,ordinality);
			IF snapshot_row.candidate_count>
				NEW.page_offset+jsonb_array_length(expected_candidates) THEN
				expected_next_cursor:='hosted-lifecycle-unfinished-cursor.'||
					substring(NEW.snapshot_id FROM 38)||'.'||
					(NEW.page_offset+jsonb_array_length(expected_candidates))::text;
			END IF;
			IF snapshot_row.snapshot_id IS NULL
				OR NEW.snapshot_revision<>snapshot_row.snapshot_revision
				OR NEW.snapshot_at<>snapshot_row.snapshot_at OR NEW.expires_at<>snapshot_row.expires_at
				OR jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>15
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-read-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR NEW.request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.unfinished.read'
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR (NEW.request_json->>'pageSize')::bigint<>NEW.page_size
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>
					NEW.request_digest
				OR jsonb_typeof(NEW.page_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.page_json)<>14
				OR NEW.page_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-page'
				OR (NEW.page_json->>'version')::bigint<>1
				OR NEW.page_json->'request'<>NEW.request_json
				OR NEW.page_json->>'requestDigest'<>NEW.request_digest
				OR NEW.page_json->>'snapshotId'<>NEW.snapshot_id
				OR (NEW.page_json->>'snapshotRevision')::bigint<>NEW.snapshot_revision
				OR (NEW.page_json->>'snapshotAt')::timestamptz<>NEW.snapshot_at
				OR (NEW.page_json->>'expiresAt')::timestamptz<>NEW.expires_at
				OR jsonb_array_length(NEW.page_json->'candidates')<>NEW.candidate_count
				OR NEW.page_json->'candidates'<>expected_candidates
				OR NEW.page_json->'candidateDigests'<>expected_candidate_digests
				OR NEW.page_json->>'nextCursor' IS DISTINCT FROM NEW.next_cursor
				OR NEW.next_cursor IS DISTINCT FROM expected_next_cursor
				OR NEW.page_json->>'pageDigest'<>NEW.page_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.page_json-'pageDigest')<>
					NEW.page_digest THEN
				RAISE EXCEPTION 'hosted runtime lifecycle unfinished page drifted from snapshot'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_unfinished_page_exact
			BEFORE INSERT
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_pages
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_unfinished_page_exact()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_unfinished_snapshot_exact()
			RETURNS trigger AS $$
		BEGIN
			IF jsonb_typeof(NEW.candidates_json)<>'array'
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(NEW.candidates_json)
						WITH ORDINALITY member(candidate,ordinality)
					WHERE agent_evaluation_jsonb_object_key_count(candidate)<>13
						OR NOT (candidate ?& ARRAY[
							'format','version','registrationRequest','registrationRequestDigest',
							'dispatchIntentSet','dispatchIntentSetDigest',
							'dispatchStageClaimHistorySet',
							'dispatchStageClaimHistorySetDigest','unfinishedState',
							'durableTransportReceiptSetDigest','spoolRef',
							'transportStoreReceiptDigest','candidateDigest'
						])
						OR candidate->>'format'<>
							'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-candidate'
						OR (candidate->>'version')::bigint<>1
						OR jsonb_typeof(candidate->'registrationRequest')<>'object'
						OR candidate->>'registrationRequestDigest'<>
							candidate#>>'{registrationRequest,requestDigest}'
						OR candidate->>'registrationRequestDigest'<>
							candidate#>>'{dispatchIntentSet,registrationRequestDigest}'
						OR candidate#>>'{registrationRequest,requestDigest}'<>
							candidate#>>'{dispatchIntentSet,registrationRequestDigest}'
						OR candidate#>>'{registrationRequest,namespaceId}'<>NEW.namespace_id
						OR candidate#>>'{registrationRequest,repositoryCommit}'<>
							NEW.repository_commit
						OR candidate#>>'{registrationRequest,planDigest}'<>NEW.plan_digest
						OR candidate#>>'{registrationRequest,frozenRunDigest}'<>
							NEW.frozen_run_digest
						OR candidate#>>'{registrationRequest,runConfigArtifactBindingDigest}'<>
							NEW.run_config_artifact_binding_digest
						OR candidate#>>'{registrationRequest,runtimeResourceSetId}'<>
							NEW.runtime_resource_set_id
						OR agent_evaluation_canonical_jsonb_digest(
							candidate->'registrationRequest'-'requestDigest')<>
							candidate#>>'{registrationRequest,requestDigest}'
						OR NOT EXISTS (
							SELECT 1
							FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_requests request
							WHERE request.namespace_id=NEW.namespace_id
								AND request.repository_commit=NEW.repository_commit
								AND request.plan_digest=NEW.plan_digest
								AND request.runtime_resource_set_id=NEW.runtime_resource_set_id
								AND request.request_digest=
									candidate#>>'{registrationRequest,requestDigest}'
								AND request.request_json=candidate->'registrationRequest'
								AND request.v46_eligible)
						OR candidate->>'dispatchIntentSetDigest'<>
							candidate#>>'{dispatchIntentSet,setDigest}'
						OR candidate->>'dispatchStageClaimHistorySetDigest'<>
							candidate#>>'{dispatchStageClaimHistorySet,setDigest}'
						OR candidate->>'candidateDigest'<>
							agent_evaluation_canonical_jsonb_digest(candidate-'candidateDigest')
						OR (candidate->>'unfinishedState'='staged-before-transport'
							AND (candidate->'durableTransportReceiptSetDigest'<>'null'::jsonb
								OR candidate->'spoolRef'<>'null'::jsonb
								OR candidate->'transportStoreReceiptDigest'<>'null'::jsonb))
						OR (candidate->>'unfinishedState'='transport-stored-before-seal'
							AND (candidate->>'durableTransportReceiptSetDigest'
								!~ '^sha256-[a-f0-9]{64}$'
								OR candidate->>'spoolRef' IS NULL
								OR candidate->>'transportStoreReceiptDigest'
									!~ '^sha256-[a-f0-9]{64}$'))
						OR candidate->>'unfinishedState' NOT IN (
							'staged-before-transport','transport-stored-before-seal')
						OR (ordinality>1 AND candidate->>'dispatchIntentSetDigest' COLLATE "C"<=
							NEW.candidates_json->(ordinality::int-2)->>'dispatchIntentSetDigest' COLLATE "C")
				) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle unfinished snapshot is not canonical'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_unfinished_snapshot_exact
			BEFORE INSERT
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_unfinished_snapshot_exact()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_unfinished_snapshot_immutable
			BEFORE UPDATE OR DELETE
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_unfinished_page_immutable
			BEFORE UPDATE OR DELETE
			ON agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_pages
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION read_agent_evaluation_hosted_runtime_lifecycle_unfinished_dispatches(
			candidate_namespace_id TEXT,candidate_request_json JSONB,candidate_request_bytes BYTEA,
			candidate_recovery_authority_issuer_id TEXT,
			candidate_recovery_authority_implementation_digest TEXT,
			candidate_snapshot_at TIMESTAMPTZ,candidate_expires_at TIMESTAMPTZ
		) RETURNS TABLE (
			page_json JSONB,page_bytes BYTEA,page_digest TEXT,
			snapshot_id TEXT,snapshot_revision BIGINT
		) LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			existing agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_pages%ROWTYPE;
			snapshot agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots%ROWTYPE;
			request_digest_value TEXT:=candidate_request_json->>'requestDigest';
			cursor_value TEXT:=candidate_request_json->>'cursor';
			requested_at_value TIMESTAMPTZ:=(candidate_request_json->>'requestedAt')::timestamptz;
			minimum_expires_at_value TIMESTAMPTZ:=
				(candidate_request_json->>'minimumSnapshotExpiresAt')::timestamptz;
			page_size_value BIGINT:=(candidate_request_json->>'pageSize')::bigint;
			offset_value BIGINT:=0;
			candidates_value JSONB;
			candidate_digests_value JSONB;
			next_cursor_value TEXT;
			page_base JSONB;
			page_value JSONB;
			page_digest_value TEXT;
			snapshot_id_value TEXT;
			snapshot_revision_value BIGINT;
		BEGIN
			IF candidate_namespace_id IS NULL OR request_digest_value IS NULL THEN
				RAISE EXCEPTION 'hosted runtime lifecycle unfinished read request is incomplete'
					USING ERRCODE='23514';
			END IF;
			PERFORM pg_advisory_xact_lock(hashtextextended(
				candidate_namespace_id||chr(31)||request_digest_value,0));
			SELECT * INTO existing
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_pages
			WHERE namespace_id=candidate_namespace_id AND request_digest=request_digest_value
			FOR UPDATE;
			IF existing.request_digest IS NOT NULL THEN
				IF existing.request_json<>candidate_request_json
					OR existing.request_bytes<>candidate_request_bytes THEN
					RAISE EXCEPTION 'hosted runtime lifecycle unfinished read replay changed bytes'
						USING ERRCODE='23514';
				END IF;
				RETURN QUERY SELECT existing.page_json,existing.page_bytes,existing.page_digest,
					existing.snapshot_id,existing.snapshot_revision;
				RETURN;
			END IF;
			IF jsonb_typeof(candidate_request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(candidate_request_json)<>15
				OR candidate_request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-read-request'
				OR (candidate_request_json->>'version')::bigint<>1
				OR candidate_request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.unfinished.read'
				OR candidate_request_json->>'namespaceId'<>candidate_namespace_id
				OR candidate_request_json->>'repositoryCommit' !~ '^[a-f0-9]{40}$'
				OR candidate_request_json->>'planDigest' !~ '^sha256-[a-f0-9]{64}$'
				OR candidate_request_json->>'frozenRunDigest' !~ '^sha256-[a-f0-9]{64}$'
				OR candidate_request_json->>'runConfigArtifactBindingDigest' !~
					'^sha256-[a-f0-9]{64}$'
				OR page_size_value NOT BETWEEN 1 AND 8
				OR requested_at_value>=minimum_expires_at_value
				OR minimum_expires_at_value>requested_at_value+INTERVAL '125 seconds'
				OR request_digest_value !~ '^sha256-[a-f0-9]{64}$'
				OR agent_evaluation_canonical_jsonb_digest(
					candidate_request_json-'requestDigest')<>request_digest_value
				OR candidate_request_bytes<>convert_to(
					agent_evaluation_canonical_jsonb_text(candidate_request_json),'UTF8')
				OR candidate_recovery_authority_issuer_id !~
					'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				OR candidate_recovery_authority_implementation_digest !~
					'^sha256-[a-f0-9]{64}$' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle unfinished read request is invalid'
					USING ERRCODE='23514';
			END IF;
			IF cursor_value IS NULL THEN
				IF candidate_snapshot_at<requested_at_value
					OR candidate_snapshot_at>requested_at_value+INTERVAL '125 seconds'
					OR candidate_expires_at<minimum_expires_at_value
					OR candidate_expires_at<=candidate_snapshot_at
					OR candidate_expires_at>candidate_snapshot_at+INTERVAL '125 seconds' THEN
					RAISE EXCEPTION 'hosted runtime lifecycle unfinished snapshot lifetime is invalid'
						USING ERRCODE='23514';
				END IF;
				PERFORM pg_advisory_xact_lock(hashtextextended(candidate_namespace_id||chr(31)||
					candidate_request_json->>'runtimeResourceSetId'||chr(31)||'lifecycle-unfinished',0));
				SELECT ledger_revision INTO snapshot_revision_value
				FROM agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers
				WHERE namespace_id=candidate_namespace_id FOR SHARE;
				IF snapshot_revision_value IS NULL THEN
					RAISE EXCEPTION 'hosted runtime lifecycle unfinished snapshot lacks owner ledger'
						USING ERRCODE='23514';
				END IF;
				snapshot_id_value:='hosted-lifecycle-unfinished-snapshot.'||
					substring(request_digest_value FROM 8);
				candidates_value:=agent_evaluation_hosted_runtime_lifecycle_unfinished_dispatch_candidates(
					candidate_namespace_id,candidate_request_json->>'repositoryCommit',
					candidate_request_json->>'planDigest',candidate_request_json->>'frozenRunDigest',
					candidate_request_json->>'runConfigArtifactBindingDigest',
					candidate_request_json->>'runtimeResourceSetId');
				INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots(
					namespace_id,snapshot_id,repository_commit,plan_digest,frozen_run_digest,
					run_config_artifact_binding_digest,runtime_resource_set_id,
					lifecycle_owner_instance_id,snapshot_revision,snapshot_at,expires_at,
					candidate_count,candidates_json,candidates_bytes
				) VALUES (
					candidate_namespace_id,snapshot_id_value,
					candidate_request_json->>'repositoryCommit',candidate_request_json->>'planDigest',
					candidate_request_json->>'frozenRunDigest',
					candidate_request_json->>'runConfigArtifactBindingDigest',
					candidate_request_json->>'runtimeResourceSetId',
					candidate_request_json->>'lifecycleOwnerInstanceId',snapshot_revision_value,
					candidate_snapshot_at,candidate_expires_at,jsonb_array_length(candidates_value),
					candidates_value,convert_to(
						agent_evaluation_canonical_jsonb_text(candidates_value),'UTF8'));
				offset_value:=0;
			ELSE
				IF cursor_value !~ '^hosted-lifecycle-unfinished-cursor\.[a-f0-9]{64}\.[0-9]+$' THEN
					RAISE EXCEPTION 'hosted runtime lifecycle unfinished cursor is invalid'
						USING ERRCODE='23514';
				END IF;
				snapshot_id_value:='hosted-lifecycle-unfinished-snapshot.'||
					split_part(cursor_value,'.',2);
				offset_value:=split_part(cursor_value,'.',3)::bigint;
				SELECT * INTO snapshot
				FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots
				WHERE namespace_id=candidate_namespace_id AND snapshot_id=snapshot_id_value
				FOR SHARE;
				IF snapshot.snapshot_id IS NULL OR snapshot.repository_commit<>
						candidate_request_json->>'repositoryCommit'
					OR snapshot.plan_digest<>candidate_request_json->>'planDigest'
					OR snapshot.frozen_run_digest<>candidate_request_json->>'frozenRunDigest'
					OR snapshot.run_config_artifact_binding_digest<>
						candidate_request_json->>'runConfigArtifactBindingDigest'
					OR snapshot.runtime_resource_set_id<>
						candidate_request_json->>'runtimeResourceSetId'
					OR snapshot.lifecycle_owner_instance_id<>
						candidate_request_json->>'lifecycleOwnerInstanceId'
					OR snapshot.snapshot_at<requested_at_value
					OR snapshot.expires_at<minimum_expires_at_value
					OR candidate_snapshot_at<>snapshot.snapshot_at
					OR candidate_expires_at<>snapshot.expires_at THEN
					RAISE EXCEPTION 'hosted runtime lifecycle unfinished cursor snapshot is unavailable'
						USING ERRCODE='23514';
				END IF;
				snapshot_revision_value:=snapshot.snapshot_revision;
				candidates_value:=snapshot.candidates_json;
			END IF;
			SELECT COALESCE(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb)
			INTO candidates_value
			FROM jsonb_array_elements(candidates_value) WITH ORDINALITY member(value,ordinality)
			WHERE ordinality>offset_value AND ordinality<=offset_value+page_size_value;
			SELECT COALESCE(jsonb_agg(value->'candidateDigest' ORDER BY ordinality),'[]'::jsonb)
			INTO candidate_digests_value
			FROM jsonb_array_elements(candidates_value) WITH ORDINALITY member(value,ordinality);
			SELECT * INTO snapshot
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots
			WHERE namespace_id=candidate_namespace_id AND snapshot_id=snapshot_id_value FOR SHARE;
			IF snapshot.candidate_count>offset_value+jsonb_array_length(candidates_value) THEN
				next_cursor_value:='hosted-lifecycle-unfinished-cursor.'||
					substring(snapshot_id_value FROM 38)||'.'||
					(offset_value+jsonb_array_length(candidates_value))::text;
			ELSE next_cursor_value:=NULL;
			END IF;
			page_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-page',
				'version',1,'request',candidate_request_json,'requestDigest',request_digest_value,
				'recoveryAuthorityIssuerId',candidate_recovery_authority_issuer_id,
				'recoveryAuthorityImplementationDigest',
					candidate_recovery_authority_implementation_digest,
				'snapshotId',snapshot_id_value,'snapshotRevision',snapshot_revision_value,
				'snapshotAt',to_jsonb(snapshot.snapshot_at),'expiresAt',to_jsonb(snapshot.expires_at),
				'candidates',candidates_value,'candidateDigests',candidate_digests_value,
				'nextCursor',to_jsonb(next_cursor_value));
			page_digest_value:=agent_evaluation_canonical_jsonb_digest(page_base);
			page_value:=page_base||jsonb_build_object('pageDigest',page_digest_value);
			INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_pages(
				namespace_id,request_digest,request_json,request_bytes,snapshot_id,snapshot_revision,
				page_offset,page_size,recovery_authority_issuer_id,
				recovery_authority_implementation_digest,snapshot_at,expires_at,candidate_count,
				next_cursor,page_digest,page_json,page_bytes
			) VALUES (
				candidate_namespace_id,request_digest_value,candidate_request_json,candidate_request_bytes,
				snapshot_id_value,snapshot_revision_value,offset_value,page_size_value,
				candidate_recovery_authority_issuer_id,
				candidate_recovery_authority_implementation_digest,snapshot.snapshot_at,
				snapshot.expires_at,jsonb_array_length(candidates_value),next_cursor_value,
				page_digest_value,page_value,
				convert_to(agent_evaluation_canonical_jsonb_text(page_value),'UTF8'));
			RETURN QUERY SELECT page_value,
				convert_to(agent_evaluation_canonical_jsonb_text(page_value),'UTF8'),
				page_digest_value,snapshot_id_value,snapshot_revision_value;
		END;
		$$`,
	}
}
