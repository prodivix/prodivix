package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6PartialCleanupPhysicalStatements
// installs a dedicated owner for Provider IDs learned from a sealed partial
// create journal. It intentionally has no terminal-fence dependency.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6PartialCleanupPhysicalStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS ae_hrrr_lifecycle_partial_cleanup_prepares (
			namespace_id TEXT NOT NULL,
			plan_digest TEXT NOT NULL,
			repository_commit TEXT NOT NULL,
			runtime_resource_set_id TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			partial_journal_record_digest TEXT NOT NULL,
			partial_cleanup_authority_digest TEXT NOT NULL,
			known_resource_ids_json JSONB NOT NULL,
			known_resource_ids_bytes BYTEA NOT NULL,
			state TEXT NOT NULL,
			current_revision BIGINT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			release_eligible BOOLEAN NOT NULL DEFAULT FALSE,
			PRIMARY KEY (namespace_id,registration_request_digest),
			UNIQUE (namespace_id,partial_journal_record_digest),
			UNIQUE (namespace_id,partial_cleanup_authority_digest),
			FOREIGN KEY (namespace_id,partial_journal_record_digest)
				REFERENCES ae_hrrr_lifecycle_transport_journals(
					namespace_id,record_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_partial_prepare_check CHECK (
				plan_digest ~ '^sha256-[a-f0-9]{64}$'
				AND registration_request_digest ~ '^sha256-[a-f0-9]{64}$'
				AND partial_journal_record_digest ~ '^sha256-[a-f0-9]{64}$'
				AND partial_cleanup_authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND state IN ('cleanup-pending','cleanup-claimed','cleaned')
				AND current_revision>=1 AND updated_at>=created_at
				AND jsonb_array_length(known_resource_ids_json) BETWEEN 1 AND 21
				AND octet_length(known_resource_ids_bytes) BETWEEN 1 AND 16384
				AND known_resource_ids_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(known_resource_ids_json),'UTF8')
				AND NOT release_eligible
			)
		)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_lifecycle_partial_cleanup_claim_history (
			namespace_id TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			claim_receipt_digest TEXT NOT NULL,
			partial_cleanup_authority_digest TEXT NOT NULL,
			lifecycle_owner_instance_id TEXT NOT NULL,
			claim_revision BIGINT NOT NULL,
			claim_generation BIGINT NOT NULL,
			generation_transition TEXT NOT NULL,
			claimed_at TIMESTAMPTZ NOT NULL,
			claim_expires_at TIMESTAMPTZ NOT NULL,
			receipt_json JSONB NOT NULL,
			receipt_bytes BYTEA NOT NULL,
			PRIMARY KEY (namespace_id,claim_receipt_digest),
			FOREIGN KEY (namespace_id,registration_request_digest)
				REFERENCES ae_hrrr_lifecycle_partial_cleanup_prepares(
					namespace_id,registration_request_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_partial_claim_history_check CHECK (
				claim_receipt_digest ~ '^sha256-[a-f0-9]{64}$'
				AND partial_cleanup_authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND claim_revision>=1 AND claim_generation>=1
				AND generation_transition IN ('initial','generation-retained','expired-owner-takeover')
				AND claim_expires_at>claimed_at
				AND claim_expires_at<=claimed_at+INTERVAL '125 seconds'
				AND octet_length(receipt_bytes) BETWEEN 1 AND 16384
				AND receipt_bytes=convert_to(
					agent_evaluation_canonical_jsonb_text(receipt_json),'UTF8')
			)
		)`,
		`CREATE TABLE IF NOT EXISTS ae_hrrr_lifecycle_partial_cleanup_claim_current (
			namespace_id TEXT NOT NULL,
			registration_request_digest TEXT NOT NULL,
			partial_cleanup_authority_digest TEXT NOT NULL,
			current_claim_receipt_digest TEXT NOT NULL,
			lifecycle_owner_instance_id TEXT NOT NULL,
			claim_revision BIGINT NOT NULL,
			claim_generation BIGINT NOT NULL,
			claim_expires_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (namespace_id,registration_request_digest),
			FOREIGN KEY (namespace_id,registration_request_digest)
				REFERENCES ae_hrrr_lifecycle_partial_cleanup_prepares(
					namespace_id,registration_request_digest
				) ON DELETE RESTRICT,
			FOREIGN KEY (namespace_id,current_claim_receipt_digest)
				REFERENCES ae_hrrr_lifecycle_partial_cleanup_claim_history(
					namespace_id,claim_receipt_digest
				) ON DELETE RESTRICT,
			CONSTRAINT agent_eval_hosted_runtime_lifecycle_partial_claim_current_check CHECK (
				partial_cleanup_authority_digest ~ '^sha256-[a-f0-9]{64}$'
				AND claim_revision>=1 AND claim_generation>=1
			)
		)`,
	}
}

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6PartialCleanupConstraintStatements
// materializes known IDs, offers expiring cleanup claims, and closes the owner
// after every known ID has an immutable known-outcome delete journal.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6PartialCleanupConstraintStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION materialize_agent_evaluation_hosted_runtime_lifecycle_partial_cleanup_prepare()
			RETURNS trigger AS $$
		DECLARE
			business_result JSONB:=NEW.record_json->'businessResult';
			known_ids JSONB;
			authority_base JSONB;
			authority_digest_value TEXT;
			request_row ae_hrrr_registration_requests%ROWTYPE;
			plan_row agent_evaluation_plans%ROWTYPE;
		BEGIN
			IF NEW.operation<>'create'
				OR NEW.business_outcome<>'partial-create-requires-cleanup' THEN
				RETURN NEW;
			END IF;
			SELECT * INTO request_row
			FROM ae_hrrr_registration_requests
			WHERE namespace_id=NEW.namespace_id AND request_digest=NEW.registration_request_digest
			FOR SHARE;
			SELECT * INTO plan_row
			FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR SHARE;
			SELECT jsonb_agg(value ORDER BY value->>'resourceRole' COLLATE "C",
				value->>'resourceId' COLLATE "C")
			INTO known_ids
			FROM (
				SELECT jsonb_build_object('resourceId',business_result->>'providerResourceId',
					'resourceRole','primary') AS value
				WHERE business_result->>'providerResourceId' IS NOT NULL
				UNION ALL
				SELECT jsonb_build_object('resourceId',resource_id,'resourceRole','auxiliary')
				FROM jsonb_array_elements_text(business_result->'auxiliaryResourceIds') resource_id
			) known;
			authority_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-partial-cleanup-authority',
				'version',1,'registrationRequestDigest',NEW.registration_request_digest,
				'partialJournalRecordDigest',NEW.record_digest,'knownResourceIds',known_ids,
				'createdAt',to_jsonb(NEW.completed_at),
				'expiresAt',to_jsonb(LEAST(request_row.minimum_expires_at,plan_row.expires_at)));
			authority_digest_value:=agent_evaluation_canonical_jsonb_digest(authority_base);
			INSERT INTO ae_hrrr_lifecycle_partial_cleanup_prepares(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,
				registration_request_digest,partial_journal_record_digest,
				partial_cleanup_authority_digest,known_resource_ids_json,known_resource_ids_bytes,
				state,current_revision,created_at,expires_at,updated_at,release_eligible
			) VALUES (
				NEW.namespace_id,NEW.plan_digest,NEW.repository_commit,NEW.runtime_resource_set_id,
				NEW.registration_request_digest,NEW.record_digest,authority_digest_value,known_ids,
				convert_to(agent_evaluation_canonical_jsonb_text(known_ids),'UTF8'),
				'cleanup-pending',1,NEW.completed_at,
				LEAST(request_row.minimum_expires_at,plan_row.expires_at),NEW.completed_at,FALSE
			);
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_prepare_materialize
			AFTER INSERT
			ON ae_hrrr_lifecycle_transport_journals
			FOR EACH ROW EXECUTE FUNCTION materialize_agent_evaluation_hosted_runtime_lifecycle_partial_cleanup_prepare()`,
		`CREATE OR REPLACE FUNCTION enforce_ae_hrrr_lc_partial_prepare_exact()
			RETURNS trigger AS $$
		DECLARE
			journal_row ae_hrrr_lifecycle_transport_journals%ROWTYPE;
			request_row ae_hrrr_registration_requests%ROWTYPE;
			plan_row agent_evaluation_plans%ROWTYPE;
			business_result JSONB;
			expected_known_ids JSONB;
			expected_authority_base JSONB;
			expected_authority_digest TEXT;
			known_count BIGINT;
			distinct_count BIGINT;
		BEGIN
			SELECT * INTO journal_row
			FROM ae_hrrr_lifecycle_transport_journals
			WHERE namespace_id=NEW.namespace_id AND record_digest=NEW.partial_journal_record_digest
			FOR SHARE;
			SELECT * INTO request_row
			FROM ae_hrrr_registration_requests
			WHERE namespace_id=NEW.namespace_id
				AND request_digest=NEW.registration_request_digest
			FOR SHARE;
			SELECT * INTO plan_row
			FROM agent_evaluation_plans
			WHERE namespace_id=NEW.namespace_id AND plan_digest=NEW.plan_digest
				AND repository_commit=NEW.repository_commit
			FOR SHARE;
			business_result:=journal_row.record_json->'businessResult';
			SELECT jsonb_agg(value ORDER BY value->>'resourceRole' COLLATE "C",
				value->>'resourceId' COLLATE "C")
			INTO expected_known_ids
			FROM (
				SELECT jsonb_build_object('resourceId',business_result->>'providerResourceId',
					'resourceRole','primary') AS value
				WHERE business_result->>'providerResourceId' IS NOT NULL
				UNION ALL
				SELECT jsonb_build_object('resourceId',resource_id,'resourceRole','auxiliary')
				FROM jsonb_array_elements_text(business_result->'auxiliaryResourceIds') resource_id
			) known;
			expected_authority_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-partial-cleanup-authority',
				'version',1,'registrationRequestDigest',NEW.registration_request_digest,
				'partialJournalRecordDigest',NEW.partial_journal_record_digest,
				'knownResourceIds',expected_known_ids,'createdAt',to_jsonb(journal_row.completed_at),
				'expiresAt',to_jsonb(LEAST(request_row.minimum_expires_at,plan_row.expires_at)));
			expected_authority_digest:=agent_evaluation_canonical_jsonb_digest(
				expected_authority_base);
			SELECT COUNT(*),COUNT(DISTINCT value->>'resourceId')
			INTO known_count,distinct_count
			FROM jsonb_array_elements(NEW.known_resource_ids_json) value;
			IF journal_row.record_digest IS NULL
				OR journal_row.business_outcome<>'partial-create-requires-cleanup'
				OR journal_row.operation<>'create'
				OR NEW.plan_digest<>journal_row.plan_digest
				OR NEW.repository_commit<>journal_row.repository_commit
				OR NEW.runtime_resource_set_id<>journal_row.runtime_resource_set_id
				OR NEW.registration_request_digest<>journal_row.registration_request_digest
				OR request_row.request_digest IS NULL OR plan_row.plan_digest IS NULL
				OR EXISTS (
					SELECT 1
					FROM ae_hrrr_registration_results registration
					WHERE registration.namespace_id=NEW.namespace_id
						AND registration.registration_request_digest=
							NEW.registration_request_digest)
				OR expected_known_ids IS NULL
				OR NEW.known_resource_ids_json<>expected_known_ids
				OR NEW.partial_cleanup_authority_digest<>expected_authority_digest
				OR NEW.state<>'cleanup-pending' OR NEW.current_revision<>1
				OR NEW.created_at<>journal_row.completed_at
				OR NEW.expires_at<>LEAST(request_row.minimum_expires_at,plan_row.expires_at)
				OR NEW.updated_at<>NEW.created_at OR NEW.release_eligible
				OR known_count<>distinct_count
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(NEW.known_resource_ids_json)
						WITH ORDINALITY item(value,ordinality)
					WHERE agent_evaluation_jsonb_object_key_count(value)<>2
						OR value->>'resourceRole' NOT IN ('auxiliary','primary')
						OR value->>'resourceId' !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
						OR (ordinality>1 AND ROW(value->>'resourceRole' COLLATE "C",
							value->>'resourceId' COLLATE "C")<=ROW(
							NEW.known_resource_ids_json->(ordinality::int-2)->>'resourceRole' COLLATE "C",
							NEW.known_resource_ids_json->(ordinality::int-2)->>'resourceId' COLLATE "C"))) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle partial prepare is not exact known-ID authority'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_prepare_exact
			BEFORE INSERT
			ON ae_hrrr_lifecycle_partial_cleanup_prepares
			FOR EACH ROW EXECUTE FUNCTION enforce_ae_hrrr_lc_partial_prepare_exact()`,
		`CREATE OR REPLACE FUNCTION claim_agent_evaluation_hosted_runtime_lifecycle_partial_cleanup(
			candidate_namespace_id TEXT,candidate_registration_request_digest TEXT,
			candidate_lifecycle_owner_instance_id TEXT,candidate_claimed_at TIMESTAMPTZ,
			candidate_claim_expires_at TIMESTAMPTZ
		) RETURNS TABLE (
			receipt_json JSONB,receipt_bytes BYTEA,receipt_digest TEXT,
			claim_generation BIGINT,claim_revision BIGINT
		) LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			prepare ae_hrrr_lifecycle_partial_cleanup_prepares%ROWTYPE;
			current_claim ae_hrrr_lifecycle_partial_cleanup_claim_current%ROWTYPE;
			history ae_hrrr_lifecycle_partial_cleanup_claim_history%ROWTYPE;
			generation_value BIGINT;
			revision_value BIGINT;
			transition_value TEXT;
			receipt_base JSONB;
			receipt_value JSONB;
			receipt_digest_value TEXT;
		BEGIN
			PERFORM pg_advisory_xact_lock(hashtextextended(candidate_namespace_id||chr(31)||
				candidate_registration_request_digest||chr(31)||'partial-cleanup-claim',0));
			SELECT * INTO prepare
			FROM ae_hrrr_lifecycle_partial_cleanup_prepares
			WHERE namespace_id=candidate_namespace_id
				AND registration_request_digest=candidate_registration_request_digest
			FOR UPDATE;
			SELECT * INTO current_claim
			FROM ae_hrrr_lifecycle_partial_cleanup_claim_current
			WHERE namespace_id=candidate_namespace_id
				AND registration_request_digest=candidate_registration_request_digest
			FOR UPDATE;
			IF prepare.registration_request_digest IS NULL OR prepare.state='cleaned'
				OR candidate_lifecycle_owner_instance_id !~
					'^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'
				OR candidate_claim_expires_at<=candidate_claimed_at
				OR candidate_claim_expires_at>candidate_claimed_at+INTERVAL '125 seconds' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup is not claimable'
					USING ERRCODE='23514';
			END IF;
			IF current_claim.registration_request_digest IS NULL THEN
				generation_value:=1; revision_value:=1; transition_value:='initial';
			ELSIF candidate_claimed_at<current_claim.claim_expires_at THEN
				IF candidate_lifecycle_owner_instance_id<>
					current_claim.lifecycle_owner_instance_id THEN
					RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup claim has a live owner'
						USING ERRCODE='40001';
				END IF;
				SELECT * INTO history
				FROM ae_hrrr_lifecycle_partial_cleanup_claim_history
				WHERE namespace_id=candidate_namespace_id
					AND claim_receipt_digest=current_claim.current_claim_receipt_digest
				FOR SHARE;
				RETURN QUERY SELECT history.receipt_json,history.receipt_bytes,
					history.claim_receipt_digest,history.claim_generation,history.claim_revision;
				RETURN;
			ELSE
				generation_value:=current_claim.claim_generation+1;
				revision_value:=current_claim.claim_revision+1;
				transition_value:='expired-owner-takeover';
			END IF;
			receipt_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-partial-cleanup-claim-receipt',
				'version',1,'registrationRequestDigest',candidate_registration_request_digest,
				'partialCleanupAuthorityDigest',prepare.partial_cleanup_authority_digest,
				'lifecycleOwnerInstanceId',candidate_lifecycle_owner_instance_id,
				'claimRevision',revision_value,'claimGeneration',generation_value,
				'generationTransition',transition_value,'claimedAt',to_jsonb(candidate_claimed_at),
				'claimExpiresAt',to_jsonb(candidate_claim_expires_at));
			receipt_digest_value:=agent_evaluation_canonical_jsonb_digest(receipt_base);
			receipt_value:=receipt_base||jsonb_build_object(
				'receiptDigest',receipt_digest_value);
			INSERT INTO ae_hrrr_lifecycle_partial_cleanup_claim_history(
				namespace_id,registration_request_digest,claim_receipt_digest,
				partial_cleanup_authority_digest,lifecycle_owner_instance_id,claim_revision,
				claim_generation,generation_transition,claimed_at,claim_expires_at,
				receipt_json,receipt_bytes
			) VALUES (
				candidate_namespace_id,candidate_registration_request_digest,receipt_digest_value,
				prepare.partial_cleanup_authority_digest,candidate_lifecycle_owner_instance_id,
				revision_value,generation_value,transition_value,candidate_claimed_at,
				candidate_claim_expires_at,receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8'));
			INSERT INTO ae_hrrr_lifecycle_partial_cleanup_claim_current(
				namespace_id,registration_request_digest,partial_cleanup_authority_digest,
				current_claim_receipt_digest,lifecycle_owner_instance_id,claim_revision,
				claim_generation,claim_expires_at,updated_at
			) VALUES (
				candidate_namespace_id,candidate_registration_request_digest,
				prepare.partial_cleanup_authority_digest,receipt_digest_value,
				candidate_lifecycle_owner_instance_id,revision_value,generation_value,
				candidate_claim_expires_at,candidate_claimed_at
			) ON CONFLICT (namespace_id,registration_request_digest) DO UPDATE SET
				current_claim_receipt_digest=EXCLUDED.current_claim_receipt_digest,
				lifecycle_owner_instance_id=EXCLUDED.lifecycle_owner_instance_id,
				claim_revision=EXCLUDED.claim_revision,claim_generation=EXCLUDED.claim_generation,
				claim_expires_at=EXCLUDED.claim_expires_at,updated_at=EXCLUDED.updated_at;
			UPDATE ae_hrrr_lifecycle_partial_cleanup_prepares
			SET state='cleanup-claimed',current_revision=current_revision+1,
				updated_at=candidate_claimed_at
			WHERE namespace_id=candidate_namespace_id
				AND registration_request_digest=candidate_registration_request_digest;
			RETURN QUERY SELECT receipt_value,
				convert_to(agent_evaluation_canonical_jsonb_text(receipt_value),'UTF8'),
				receipt_digest_value,generation_value,revision_value;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_ae_hrrr_lc_partial_claim_history_exact()
			RETURNS trigger AS $$
		DECLARE
			prepare ae_hrrr_lifecycle_partial_cleanup_prepares%ROWTYPE;
		BEGIN
			SELECT * INTO prepare
			FROM ae_hrrr_lifecycle_partial_cleanup_prepares
			WHERE namespace_id=NEW.namespace_id
				AND registration_request_digest=NEW.registration_request_digest
			FOR SHARE;
			IF prepare.registration_request_digest IS NULL
				OR NEW.partial_cleanup_authority_digest<>
					prepare.partial_cleanup_authority_digest
				OR jsonb_typeof(NEW.receipt_json)<>'object'
				OR agent_evaluation_jsonb_object_key_count(NEW.receipt_json)<>11
				OR NOT (NEW.receipt_json ?& ARRAY[
					'format','version','registrationRequestDigest',
					'partialCleanupAuthorityDigest','lifecycleOwnerInstanceId',
					'claimRevision','claimGeneration','generationTransition',
					'claimedAt','claimExpiresAt','receiptDigest'
				])
				OR NEW.receipt_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-partial-cleanup-claim-receipt'
				OR (NEW.receipt_json->>'version')::bigint<>1
				OR NEW.receipt_json->>'registrationRequestDigest'<>
					NEW.registration_request_digest
				OR NEW.receipt_json->>'partialCleanupAuthorityDigest'<>
					NEW.partial_cleanup_authority_digest
				OR NEW.receipt_json->>'lifecycleOwnerInstanceId'<>
					NEW.lifecycle_owner_instance_id
				OR (NEW.receipt_json->>'claimRevision')::bigint<>NEW.claim_revision
				OR (NEW.receipt_json->>'claimGeneration')::bigint<>NEW.claim_generation
				OR NEW.receipt_json->>'generationTransition'<>NEW.generation_transition
				OR (NEW.receipt_json->>'claimedAt')::timestamptz<>NEW.claimed_at
				OR (NEW.receipt_json->>'claimExpiresAt')::timestamptz<>NEW.claim_expires_at
				OR NEW.receipt_json->>'receiptDigest'<>NEW.claim_receipt_digest
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.receipt_json-'receiptDigest')<>NEW.claim_receipt_digest
				OR (NEW.generation_transition='initial'
					AND (NEW.claim_generation<>1 OR NEW.claim_revision<>1))
				OR (NEW.generation_transition='expired-owner-takeover'
					AND (NEW.claim_generation<2 OR NEW.claim_revision<2))
				OR NEW.generation_transition='generation-retained' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup claim history drifted'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_claim_history_exact
			BEFORE INSERT
			ON ae_hrrr_lifecycle_partial_cleanup_claim_history
			FOR EACH ROW EXECUTE FUNCTION enforce_ae_hrrr_lc_partial_claim_history_exact()`,
		`CREATE OR REPLACE FUNCTION enforce_ae_hrrr_lc_partial_claim_current_exact()
			RETURNS trigger AS $$
		DECLARE
			history ae_hrrr_lifecycle_partial_cleanup_claim_history%ROWTYPE;
			old_history ae_hrrr_lifecycle_partial_cleanup_claim_history%ROWTYPE;
			prepare ae_hrrr_lifecycle_partial_cleanup_prepares%ROWTYPE;
		BEGIN
			IF TG_OP='DELETE' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup current claim cannot be deleted'
					USING ERRCODE='23514';
			END IF;
			SELECT * INTO history
			FROM ae_hrrr_lifecycle_partial_cleanup_claim_history
			WHERE namespace_id=NEW.namespace_id
				AND claim_receipt_digest=NEW.current_claim_receipt_digest
			FOR SHARE;
			SELECT * INTO prepare
			FROM ae_hrrr_lifecycle_partial_cleanup_prepares
			WHERE namespace_id=NEW.namespace_id
				AND registration_request_digest=NEW.registration_request_digest
			FOR SHARE;
			IF history.claim_receipt_digest IS NULL
				OR prepare.registration_request_digest IS NULL
				OR history.registration_request_digest<>NEW.registration_request_digest
				OR history.partial_cleanup_authority_digest<>
					NEW.partial_cleanup_authority_digest
				OR prepare.partial_cleanup_authority_digest<>
					NEW.partial_cleanup_authority_digest
				OR history.lifecycle_owner_instance_id<>NEW.lifecycle_owner_instance_id
				OR history.claim_revision<>NEW.claim_revision
				OR history.claim_generation<>NEW.claim_generation
				OR history.claim_expires_at<>NEW.claim_expires_at
				OR history.claimed_at<>NEW.updated_at THEN
				RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup current claim drifted'
					USING ERRCODE='23514';
			END IF;
			IF TG_OP='INSERT' THEN
				IF NEW.claim_revision<>1 OR NEW.claim_generation<>1
					OR history.generation_transition<>'initial' THEN
					RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup initial current claim drifted'
						USING ERRCODE='23514';
				END IF;
			ELSE
				SELECT * INTO old_history
				FROM ae_hrrr_lifecycle_partial_cleanup_claim_history
				WHERE namespace_id=OLD.namespace_id
					AND claim_receipt_digest=OLD.current_claim_receipt_digest
				FOR SHARE;
				IF NEW.claim_revision<>OLD.claim_revision+1
					OR NEW.claim_generation<>OLD.claim_generation+1
					OR history.generation_transition<>'expired-owner-takeover'
					OR history.claimed_at<old_history.claim_expires_at THEN
					RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup takeover lost expiry CAS'
						USING ERRCODE='40001';
				END IF;
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_claim_current_exact
			BEFORE INSERT OR UPDATE OR DELETE
			ON ae_hrrr_lifecycle_partial_cleanup_claim_current
			FOR EACH ROW EXECUTE FUNCTION enforce_ae_hrrr_lc_partial_claim_current_exact()`,
		`CREATE OR REPLACE FUNCTION freeze_agent_evaluation_hosted_runtime_registration_after_partial()
			RETURNS trigger AS $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM ae_hrrr_lifecycle_partial_cleanup_prepares prepare
				WHERE prepare.namespace_id=NEW.namespace_id
					AND prepare.registration_request_digest=NEW.registration_request_digest
			) THEN
				RAISE EXCEPTION 'hosted runtime partial create permanently freezes registration result'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_registration_partial_freeze
			BEFORE INSERT
			ON ae_hrrr_registration_results
			FOR EACH ROW EXECUTE FUNCTION freeze_agent_evaluation_hosted_runtime_registration_after_partial()`,
		`CREATE OR REPLACE FUNCTION enforce_ae_hrrr_lc_partial_prepare_transition()
			RETURNS trigger AS $$
		DECLARE
			current_claim ae_hrrr_lifecycle_partial_cleanup_claim_current%ROWTYPE;
			known_count BIGINT;
			cleaned_count BIGINT;
		BEGIN
			IF TG_OP='DELETE' THEN
				RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup prepare cannot be deleted'
					USING ERRCODE='23514';
			END IF;
			IF NEW.namespace_id IS DISTINCT FROM OLD.namespace_id
				OR NEW.plan_digest IS DISTINCT FROM OLD.plan_digest
				OR NEW.repository_commit IS DISTINCT FROM OLD.repository_commit
				OR NEW.runtime_resource_set_id IS DISTINCT FROM OLD.runtime_resource_set_id
				OR NEW.registration_request_digest IS DISTINCT FROM
					OLD.registration_request_digest
				OR NEW.partial_journal_record_digest IS DISTINCT FROM
					OLD.partial_journal_record_digest
				OR NEW.partial_cleanup_authority_digest IS DISTINCT FROM
					OLD.partial_cleanup_authority_digest
				OR NEW.known_resource_ids_json IS DISTINCT FROM OLD.known_resource_ids_json
				OR NEW.known_resource_ids_bytes IS DISTINCT FROM OLD.known_resource_ids_bytes
				OR NEW.created_at IS DISTINCT FROM OLD.created_at
				OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
				OR NEW.release_eligible OR NEW.current_revision<>OLD.current_revision+1
				OR NEW.updated_at<OLD.updated_at THEN
				RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup prepare mutation drifted'
					USING ERRCODE='23514';
			END IF;
			IF NEW.state='cleanup-claimed' THEN
				IF OLD.state NOT IN ('cleanup-pending','cleanup-claimed') THEN
					RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup cannot reopen'
						USING ERRCODE='23514';
				END IF;
				SELECT * INTO current_claim
				FROM ae_hrrr_lifecycle_partial_cleanup_claim_current
				WHERE namespace_id=NEW.namespace_id
					AND registration_request_digest=NEW.registration_request_digest
				FOR SHARE;
				IF current_claim.current_claim_receipt_digest IS NULL
					OR current_claim.partial_cleanup_authority_digest<>
						NEW.partial_cleanup_authority_digest
					OR current_claim.claim_revision<>NEW.current_revision-1
					OR current_claim.updated_at<>NEW.updated_at THEN
					RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup prepare lost claim CAS'
						USING ERRCODE='40001';
				END IF;
			ELSIF NEW.state='cleaned' THEN
				IF OLD.state<>'cleanup-claimed' THEN
					RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup lacks an active claim'
						USING ERRCODE='23514';
				END IF;
				SELECT jsonb_array_length(NEW.known_resource_ids_json),COUNT(DISTINCT
					journal.record_json#>>'{businessResult,resourceId}')
				INTO known_count,cleaned_count
				FROM ae_hrrr_lifecycle_transport_journals journal
				WHERE journal.namespace_id=NEW.namespace_id
					AND journal.registration_request_digest=NEW.registration_request_digest
					AND journal.operation='delete'
					AND journal.business_outcome IN ('already-absent','deleted')
					AND EXISTS (
						SELECT 1
						FROM jsonb_array_elements(NEW.known_resource_ids_json) known
						WHERE known->>'resourceId'=
							journal.record_json#>>'{businessResult,resourceId}'
							AND known->>'resourceRole'=
								journal.record_json#>>'{businessResult,resourceRole}');
				IF cleaned_count<>known_count THEN
					RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup is not complete'
						USING ERRCODE='23514';
				END IF;
			ELSE
				RAISE EXCEPTION 'hosted runtime lifecycle partial cleanup state transition is invalid'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_prepare_transition
			BEFORE UPDATE OR DELETE
			ON ae_hrrr_lifecycle_partial_cleanup_prepares
			FOR EACH ROW EXECUTE FUNCTION enforce_ae_hrrr_lc_partial_prepare_transition()`,
		`CREATE OR REPLACE FUNCTION close_agent_evaluation_hosted_runtime_lifecycle_partial_cleanup()
			RETURNS trigger AS $$
		DECLARE
			prepare ae_hrrr_lifecycle_partial_cleanup_prepares%ROWTYPE;
			known_count BIGINT;
			cleaned_count BIGINT;
		BEGIN
			IF NEW.operation<>'delete' OR NEW.business_outcome NOT IN ('already-absent','deleted') THEN
				RETURN NEW;
			END IF;
			SELECT * INTO prepare
			FROM ae_hrrr_lifecycle_partial_cleanup_prepares
			WHERE namespace_id=NEW.namespace_id
				AND registration_request_digest=NEW.registration_request_digest
			FOR UPDATE;
			IF prepare.registration_request_digest IS NULL THEN RETURN NEW; END IF;
			SELECT jsonb_array_length(prepare.known_resource_ids_json),COUNT(DISTINCT
				journal.record_json#>>'{businessResult,resourceId}')
			INTO known_count,cleaned_count
			FROM ae_hrrr_lifecycle_transport_journals journal
			WHERE journal.namespace_id=NEW.namespace_id
				AND journal.registration_request_digest=NEW.registration_request_digest
				AND journal.operation='delete'
				AND journal.business_outcome IN ('already-absent','deleted')
				AND EXISTS (
					SELECT 1 FROM jsonb_array_elements(prepare.known_resource_ids_json) known
					WHERE known->>'resourceId'=journal.record_json#>>'{businessResult,resourceId}'
						AND known->>'resourceRole'=journal.record_json#>>'{businessResult,resourceRole}');
			IF cleaned_count=known_count THEN
				UPDATE ae_hrrr_lifecycle_partial_cleanup_prepares
				SET state='cleaned',current_revision=current_revision+1,updated_at=NEW.completed_at
				WHERE namespace_id=NEW.namespace_id
					AND registration_request_digest=NEW.registration_request_digest;
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_cleanup_close
			AFTER INSERT
			ON ae_hrrr_lifecycle_transport_journals
			FOR EACH ROW EXECUTE FUNCTION close_agent_evaluation_hosted_runtime_lifecycle_partial_cleanup()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_partial_claim_history_immutable
			BEFORE UPDATE OR DELETE
			ON ae_hrrr_lifecycle_partial_cleanup_claim_history
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}
}
