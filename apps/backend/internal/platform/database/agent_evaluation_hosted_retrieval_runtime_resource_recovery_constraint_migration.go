package database

func agentEvaluationHostedRetrievalRuntimeResourceRecoveryConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION agent_evaluation_hosted_runtime_recovery_candidates(
			candidate_namespace_id TEXT,
			candidate_scanned_at TIMESTAMPTZ
		) RETURNS JSONB LANGUAGE plpgsql STABLE PARALLEL RESTRICTED AS $$
		DECLARE
			resource_row agent_evaluation_hosted_retrieval_runtime_resources%ROWTYPE;
			registration_row agent_evaluation_hosted_retrieval_runtime_resource_registration_results%ROWTYPE;
			set_row agent_evaluation_hosted_retrieval_runtime_resource_sets%ROWTYPE;
			root_row agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots%ROWTYPE;
			fence_row agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences%ROWTYPE;
			claim_row agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts%ROWTYPE;
			request_row agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests%ROWTYPE;
			active_state_digest TEXT;
			eligible_at_json JSONB;
			disposition TEXT;
			candidate_base JSONB;
			candidate_digest TEXT;
			candidates JSONB:='[]'::jsonb;
		BEGIN
			FOR resource_row IN
				SELECT * FROM agent_evaluation_hosted_retrieval_runtime_resources
				WHERE namespace_id=candidate_namespace_id AND lifecycle<>'cleaned'
				ORDER BY authority_digest COLLATE "C"
			LOOP
				SELECT * INTO registration_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_registration_results
				WHERE namespace_id=resource_row.namespace_id
					AND plan_digest=resource_row.plan_digest
					AND repository_commit=resource_row.repository_commit
					AND registration_request_digest=resource_row.registration_request_digest;
				SELECT * INTO set_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_sets
				WHERE namespace_id=resource_row.namespace_id
					AND plan_digest=resource_row.plan_digest
					AND repository_commit=resource_row.repository_commit
					AND runtime_resource_set_id=resource_row.runtime_resource_set_id;
				SELECT * INTO fence_row
				FROM agent_evaluation_hosted_retrieval_runtime_resource_run_terminal_fences
				WHERE namespace_id=resource_row.namespace_id
					AND plan_digest=resource_row.plan_digest
					AND repository_commit=resource_row.repository_commit
					AND runtime_resource_set_id=resource_row.runtime_resource_set_id;
				active_state_digest:=resource_row.current_state_digest;
				IF resource_row.lifecycle='cleanup-in-progress' THEN
					SELECT * INTO claim_row
					FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts
					WHERE namespace_id=resource_row.namespace_id
						AND plan_digest=resource_row.plan_digest
						AND repository_commit=resource_row.repository_commit
						AND authority_digest=resource_row.authority_digest
						AND receipt_digest=resource_row.current_cleanup_claim_receipt_digest;
					SELECT * INTO request_row
					FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_requests
					WHERE namespace_id=resource_row.namespace_id
						AND plan_digest=resource_row.plan_digest
						AND repository_commit=resource_row.repository_commit
						AND authority_digest=resource_row.authority_digest
						AND request_digest=resource_row.cleanup_request_digest;
					IF claim_row.claim_expires_at IS NULL
						OR claim_row.claim_expires_at>=candidate_scanned_at
						OR request_row.request_digest IS NULL THEN CONTINUE; END IF;
					active_state_digest:=request_row.prior_active_state_digest;
					SELECT * INTO root_row
					FROM agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
					WHERE namespace_id=resource_row.namespace_id
						AND root_digest=request_row.read_lease_ledger_root_digest;
					eligible_at_json:=claim_row.receipt_json->'claimExpiresAt';
					disposition:='cleanup-incomplete';
				ELSE
					SELECT * INTO root_row
					FROM agent_evaluation_hosted_retrieval_runtime_resource_read_lease_ledger_roots
					WHERE namespace_id=resource_row.namespace_id
						AND plan_digest=resource_row.plan_digest
						AND repository_commit=resource_row.repository_commit
						AND authority_digest=resource_row.authority_digest
					ORDER BY ledger_revision DESC LIMIT 1;
					IF resource_row.resource_expires_at<candidate_scanned_at THEN
						eligible_at_json:=registration_row.authority_json->'expiresAt';
						disposition:='resource-expired';
					ELSIF fence_row.sealed_at IS NOT NULL AND fence_row.sealed_at<=candidate_scanned_at THEN
						eligible_at_json:=fence_row.fence_json->'sealedAt';
						disposition:='run-terminal';
					ELSE CONTINUE;
					END IF;
				END IF;
				IF registration_row.authority_digest IS NULL OR set_row.authority_set_digest IS NULL
					OR root_row.root_digest IS NULL OR fence_row.fence_digest IS NULL THEN CONTINUE; END IF;
				candidate_base:=jsonb_build_object(
					'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-candidate',
					'version',1,'namespaceId',resource_row.namespace_id,
					'repositoryCommit',resource_row.repository_commit,'planDigest',resource_row.plan_digest,
					'frozenRunDigest',set_row.frozen_run_digest,
					'runConfigArtifactBindingDigest',set_row.run_config_artifact_binding_digest,
					'runtimeResourceSetId',resource_row.runtime_resource_set_id,
					'authorityDigest',resource_row.authority_digest,
					'resourceSetCommitmentDigest',resource_row.resource_set_commitment_digest,
					'activeStateDigest',active_state_digest,
					'readLeaseLedgerRootDigest',root_row.root_digest,
					'storedRunTerminalFenceDigest',fence_row.fence_digest,
					'resourceExpiresAt',registration_row.authority_json->'expiresAt',
					'eligibleAt',eligible_at_json,'disposition',disposition
				);
				candidate_digest:=agent_evaluation_canonical_jsonb_digest(candidate_base);
				candidates:=candidates||jsonb_build_array(
					candidate_base||jsonb_build_object('candidateDigest',candidate_digest));
			END LOOP;
			SELECT COALESCE(jsonb_agg(value ORDER BY value->>'eligibleAt' COLLATE "C",
				value->>'authorityDigest' COLLATE "C"),'[]'::jsonb)
			INTO candidates FROM jsonb_array_elements(candidates) member(value);
			RETURN candidates;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_recovery_scan_request()
			RETURNS trigger AS $$
		DECLARE
			cursor_record JSONB:=NEW.cursor_json;
			candidates JSONB;
			owner_ledger_revision BIGINT;
		BEGIN
			IF jsonb_typeof(NEW.request_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.request_json)<>8
				OR NOT (NEW.request_json ?& ARRAY[
					'format','version','namespaceId','purpose','pageSize','cursor','requestedAt','requestDigest'
				])
				OR NEW.request_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-scan-request'
				OR (NEW.request_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.request_json-'requestDigest')<>NEW.request_digest
				OR NEW.request_json->>'requestDigest'<>NEW.request_digest
				OR NEW.request_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.request_json->>'purpose'<>
					'hosted-retrieval-runtime-resource.cleanup.recovery.list'
				OR (NEW.request_json->>'pageSize')::bigint<>NEW.page_size
				OR NEW.request_json->'cursor'<>NEW.cursor_json
				OR (NEW.request_json->>'requestedAt')::timestamptz<>NEW.requested_at THEN
				RAISE EXCEPTION 'hosted runtime recovery scan request drifted'
					USING ERRCODE='23514';
			END IF;
			IF cursor_record='null'::jsonb THEN
				IF NEW.cursor_digest IS NOT NULL THEN
					RAISE EXCEPTION 'initial hosted runtime recovery scan carries a cursor digest'
						USING ERRCODE='23514';
				END IF;
				PERFORM pg_advisory_xact_lock(hashtextextended(
					NEW.namespace_id||chr(31)||'hosted-runtime-recovery-scan',0));
				SELECT ledger_revision INTO owner_ledger_revision
				FROM agent_evaluation_hosted_retrieval_runtime_resource_owner_ledgers
				WHERE namespace_id=NEW.namespace_id
				FOR SHARE;
				IF owner_ledger_revision IS NULL
					OR NEW.scan_ledger_revision<>owner_ledger_revision THEN
					RAISE EXCEPTION 'hosted runtime recovery scan revision drifted from owner ledger'
						USING ERRCODE='23514';
				END IF;
				candidates:=agent_evaluation_hosted_runtime_recovery_candidates(
					NEW.namespace_id,NEW.requested_at);
				INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots(
					namespace_id,scan_ledger_revision,candidate_set_digest,candidates_json,
					candidates_bytes,created_at
				) VALUES (
					NEW.namespace_id,NEW.scan_ledger_revision,
					agent_evaluation_canonical_jsonb_digest(candidates),candidates,
					convert_to(agent_evaluation_canonical_jsonb_text(candidates),'UTF8'),NEW.requested_at
				);
			ELSE
				IF jsonb_typeof(cursor_record)<>'object'
					OR agent_evaluation_jsonb_object_key_count(cursor_record)<>6
					OR NOT (cursor_record ?& ARRAY[
						'format','version','scanLedgerRevision','afterEligibleAt',
						'afterAuthorityDigest','cursorDigest'
					])
					OR cursor_record->>'format'<>
						'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-cursor'
					OR (cursor_record->>'version')::bigint<>1
					OR agent_evaluation_canonical_jsonb_digest(cursor_record-'cursorDigest')<>
						cursor_record->>'cursorDigest'
					OR cursor_record->>'cursorDigest' IS DISTINCT FROM NEW.cursor_digest THEN
					RAISE EXCEPTION 'hosted runtime recovery cursor is not exact'
						USING ERRCODE='23514';
				END IF;
				NEW.scan_ledger_revision:=(cursor_record->>'scanLedgerRevision')::bigint;
				IF NOT EXISTS (
					SELECT 1 FROM agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots snapshot
					WHERE snapshot.namespace_id=NEW.namespace_id
						AND snapshot.scan_ledger_revision=NEW.scan_ledger_revision
						AND snapshot.created_at<=NEW.requested_at
				) THEN
					RAISE EXCEPTION 'hosted runtime recovery cursor snapshot is unavailable'
						USING ERRCODE='23514';
				END IF;
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_scan_requests_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_recovery_scan_request()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_scan_requests_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_recovery_page()
			RETURNS trigger AS $$
		DECLARE
			request_row agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests%ROWTYPE;
			snapshot_row agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots%ROWTYPE;
			expected_candidates JSONB;
			expected_next_cursor JSONB;
			candidate_digests JSONB;
			remaining_count BIGINT;
			last_candidate JSONB;
			cursor_eligible_at TEXT;
			cursor_authority TEXT;
			cursor_base JSONB;
		BEGIN
			SELECT * INTO request_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_requests
			WHERE namespace_id=NEW.namespace_id AND request_digest=NEW.request_digest FOR SHARE;
			SELECT * INTO snapshot_row
			FROM agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots
			WHERE namespace_id=NEW.namespace_id AND scan_ledger_revision=request_row.scan_ledger_revision
			FOR SHARE;
			cursor_eligible_at:=request_row.cursor_json->>'afterEligibleAt';
			cursor_authority:=request_row.cursor_json->>'afterAuthorityDigest';
			SELECT COUNT(*),COALESCE(jsonb_agg(value ORDER BY value->>'eligibleAt' COLLATE "C",
				value->>'authorityDigest' COLLATE "C"),'[]'::jsonb)
			INTO remaining_count,expected_candidates
			FROM (
				SELECT value
				FROM jsonb_array_elements(snapshot_row.candidates_json) member(value)
				WHERE request_row.cursor_json='null'::jsonb OR
					ROW(value->>'eligibleAt' COLLATE "C",value->>'authorityDigest' COLLATE "C")>
					ROW(cursor_eligible_at COLLATE "C",cursor_authority COLLATE "C")
				ORDER BY value->>'eligibleAt' COLLATE "C",value->>'authorityDigest' COLLATE "C"
				LIMIT request_row.page_size
			) page;
			SELECT value INTO last_candidate
			FROM jsonb_array_elements(expected_candidates) WITH ORDINALITY member(value,ordinality)
			ORDER BY ordinality DESC LIMIT 1;
			SELECT COUNT(*) INTO remaining_count
			FROM jsonb_array_elements(snapshot_row.candidates_json) member(value)
			WHERE request_row.cursor_json='null'::jsonb OR
				ROW(value->>'eligibleAt' COLLATE "C",value->>'authorityDigest' COLLATE "C")>
				ROW(cursor_eligible_at COLLATE "C",cursor_authority COLLATE "C");
			IF remaining_count>jsonb_array_length(expected_candidates) THEN
				cursor_base:=jsonb_build_object(
					'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-cursor',
					'version',1,'scanLedgerRevision',request_row.scan_ledger_revision,
					'afterEligibleAt',last_candidate->'eligibleAt',
					'afterAuthorityDigest',last_candidate->>'authorityDigest'
				);
				expected_next_cursor:=cursor_base||jsonb_build_object(
					'cursorDigest',agent_evaluation_canonical_jsonb_digest(cursor_base));
			ELSE expected_next_cursor:='null'::jsonb;
			END IF;
			SELECT COALESCE(jsonb_agg(to_jsonb(value->>'candidateDigest') ORDER BY ordinality),'[]'::jsonb)
			INTO candidate_digests
			FROM jsonb_array_elements(expected_candidates) WITH ORDINALITY member(value,ordinality);
			IF request_row.request_digest IS NULL OR snapshot_row.candidate_set_digest IS NULL
				OR NEW.scan_ledger_revision<>request_row.scan_ledger_revision
				OR NEW.candidates_json<>expected_candidates OR NEW.next_cursor_json<>expected_next_cursor
				OR NEW.candidate_set_digest<>agent_evaluation_canonical_jsonb_digest(candidate_digests)
				OR jsonb_typeof(NEW.page_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.page_json)<>11
				OR NOT (NEW.page_json ?& ARRAY[
					'format','version','requestDigest','recoveryAuthorityIssuerId',
					'recoveryAuthorityImplementationDigest','scanLedgerRevision','candidates',
					'candidateSetDigest','nextCursor','scannedAt','pageDigest'
				])
				OR NEW.page_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-page'
				OR (NEW.page_json->>'version')::bigint<>1
				OR agent_evaluation_canonical_jsonb_digest(NEW.page_json-'pageDigest')<>NEW.page_digest
				OR NEW.page_json->>'pageDigest'<>NEW.page_digest
				OR NEW.page_json->>'requestDigest'<>NEW.request_digest
				OR NEW.page_json->>'recoveryAuthorityIssuerId'<>NEW.recovery_authority_issuer_id
				OR NEW.page_json->>'recoveryAuthorityImplementationDigest'<>
					NEW.recovery_authority_implementation_digest
				OR (NEW.page_json->>'scanLedgerRevision')::bigint<>NEW.scan_ledger_revision
				OR NEW.page_json->'candidates'<>expected_candidates
				OR NEW.page_json->>'candidateSetDigest'<>NEW.candidate_set_digest
				OR NEW.page_json->'nextCursor'<>expected_next_cursor
				OR (NEW.page_json->>'scannedAt')::timestamptz<>NEW.scanned_at
				OR NEW.scanned_at<request_row.requested_at THEN
				RAISE EXCEPTION 'hosted runtime recovery page drifted from its durable snapshot'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_pages_exact
			BEFORE INSERT ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_recovery_page()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_pages_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_pages
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_recovery_snapshots_immutable
			BEFORE UPDATE OR DELETE ON agent_evaluation_hosted_retrieval_runtime_resource_recovery_scan_snapshots
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}
}
