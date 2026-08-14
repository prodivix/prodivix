package database

// agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ArchiveStatements
// materializes immutable archive records and the release-only zeroed family
// root from stored journals. The root owns sorted archiveRecordDigest values;
// journal digests remain nested record semantics rather than the 46th root.
func agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ArchiveStatements() []string {
	return []string{
		`CREATE OR REPLACE FUNCTION materialize_ae_hrrr_lc_journal_archive(
			candidate_namespace_id TEXT,candidate_journal_record_digest TEXT,
			candidate_budget_closure_projection JSONB,
			candidate_budget_closure_projection_digest TEXT,
			candidate_created_at TIMESTAMPTZ
		) RETURNS JSONB LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			journal_row ae_hrrr_lifecycle_transport_journals%ROWTYPE;
			reservation_row agent_evaluation_budget_reservations%ROWTYPE;
			settlement_row agent_evaluation_budget_settlements%ROWTYPE;
			create_archive_row ae_hrrr_lifecycle_journal_archives%ROWTYPE;
			first_intent JSONB;
			archive_base JSONB;
			archive_value JSONB;
			archive_digest TEXT;
			expected_closure_kind TEXT;
		BEGIN
			SELECT * INTO journal_row
			FROM ae_hrrr_lifecycle_transport_journals
			WHERE namespace_id=candidate_namespace_id
				AND record_digest=candidate_journal_record_digest
				AND v46_eligible
			FOR SHARE;
			IF journal_row.record_digest IS NULL OR candidate_created_at<journal_row.completed_at
				OR EXISTS (
					SELECT 1
					FROM ae_hrrr_lifecycle_journal_archive_roots root
					WHERE root.namespace_id=journal_row.namespace_id
						AND root.plan_digest=journal_row.plan_digest
						AND root.repository_commit=journal_row.repository_commit
						AND root.runtime_resource_set_id=journal_row.runtime_resource_set_id
				) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle journal is not archive-materializable'
					USING ERRCODE='23514';
			END IF;
			first_intent:=journal_row.record_json#>'{dispatchIntentSet,intents,0}';
			IF journal_row.operation='create' THEN
				SELECT * INTO reservation_row
				FROM agent_evaluation_budget_reservations
				WHERE namespace_id=journal_row.namespace_id AND plan_digest=journal_row.plan_digest
					AND reservation_id=candidate_budget_closure_projection->>'reservationId'
				FOR SHARE;
				SELECT * INTO settlement_row
				FROM agent_evaluation_budget_settlements
				WHERE namespace_id=journal_row.namespace_id AND plan_digest=journal_row.plan_digest
					AND reservation_id=candidate_budget_closure_projection->>'reservationId'
				FOR SHARE;
				IF jsonb_typeof(candidate_budget_closure_projection)<>'object'
					OR agent_evaluation_jsonb_object_key_count(
						candidate_budget_closure_projection)<>14
					OR NOT (candidate_budget_closure_projection ?& ARRAY[
						'format','version','budgetReservationAuthority',
						'budgetReservationAuthorityDigest','reservationId','ledgerRevision',
						'demand','demandDigest','demandBytesDigest','reservedAt','closureKind',
						'settlement','settlementDigest','projectionDigest'
					])
					OR candidate_budget_closure_projection->>'format'<>
						'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-budget-closure-projection'
					OR (candidate_budget_closure_projection->>'version')::bigint<>1
					OR candidate_budget_closure_projection->>'projectionDigest'<>
						candidate_budget_closure_projection_digest
					OR agent_evaluation_canonical_jsonb_digest(
						candidate_budget_closure_projection-'projectionDigest')<>
						candidate_budget_closure_projection_digest
					OR candidate_budget_closure_projection->>'budgetReservationAuthorityDigest'<>
						first_intent->>'budgetReservationAuthorityDigest'
					OR candidate_budget_closure_projection->>'reservationId'<>
						first_intent->>'budgetReservationId'
					OR reservation_row.reservation_id IS NULL OR settlement_row.reservation_id IS NULL
					OR candidate_budget_closure_projection->'demand'<>reservation_row.demand_json
					OR candidate_budget_closure_projection->>'demandDigest'<>
						reservation_row.demand_digest
					OR candidate_budget_closure_projection->>'demandBytesDigest'<>
						reservation_row.demand_digest
					OR (candidate_budget_closure_projection->>'ledgerRevision')::bigint<>
						reservation_row.ledger_revision
					OR (candidate_budget_closure_projection->>'reservedAt')::timestamptz<>
						reservation_row.reserved_at
					OR candidate_budget_closure_projection->'settlement'<>
						settlement_row.settlement_json
					OR candidate_budget_closure_projection->>'settlementDigest'<>
						settlement_row.settlement_digest THEN
					RAISE EXCEPTION 'hosted runtime lifecycle create archive lacks exact budget closure'
						USING ERRCODE='23514';
				END IF;
				expected_closure_kind:=CASE
					WHEN settlement_row.settlement_json->'requiresReconciliation'='true'::jsonb
					THEN 'reconciled'
					ELSE 'settled'
				END;
				IF candidate_budget_closure_projection->>'closureKind'<>expected_closure_kind THEN
					RAISE EXCEPTION 'hosted runtime lifecycle create archive lacks exact budget closure'
						USING ERRCODE='23514';
				END IF;
			ELSE
				SELECT * INTO create_archive_row
				FROM ae_hrrr_lifecycle_journal_archives
				WHERE namespace_id=journal_row.namespace_id
					AND plan_digest=journal_row.plan_digest
					AND repository_commit=journal_row.repository_commit
					AND runtime_resource_set_id=journal_row.runtime_resource_set_id
					AND registration_request_digest=journal_row.registration_request_digest
					AND operation='create'
				FOR SHARE;
				IF candidate_budget_closure_projection<>'null'::jsonb
					OR create_archive_row.archive_record_digest IS NULL
					OR candidate_budget_closure_projection_digest<>
						create_archive_row.budget_closure_projection_digest THEN
					RAISE EXCEPTION 'hosted runtime lifecycle cleanup archive lost create budget closure'
						USING ERRCODE='23514';
				END IF;
			END IF;
			archive_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-archive-record',
				'version',1,'journalRecord',journal_row.record_json,
				'journalRecordDigest',journal_row.record_digest,
				'budgetClosureProjection',candidate_budget_closure_projection,
				'budgetClosureProjectionDigest',candidate_budget_closure_projection_digest
			);
			archive_digest:=agent_evaluation_canonical_jsonb_digest(archive_base);
			archive_value:=archive_base||jsonb_build_object(
				'archiveRecordDigest',archive_digest);
			INSERT INTO ae_hrrr_lifecycle_journal_archives(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,operation,
				registration_request_digest,journal_record_digest,budget_closure_projection_digest,
				archive_record_digest,record_json,record_bytes,created_at,v46_eligible
			) VALUES (
				journal_row.namespace_id,journal_row.plan_digest,journal_row.repository_commit,
				journal_row.runtime_resource_set_id,journal_row.operation,
				journal_row.registration_request_digest,journal_row.record_digest,
				candidate_budget_closure_projection_digest,archive_digest,archive_value,
				convert_to(agent_evaluation_canonical_jsonb_text(archive_value),'UTF8'),
				candidate_created_at,TRUE
			);
			RETURN archive_value;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_archive_exact()
			RETURNS trigger AS $$
		DECLARE
			journal_row ae_hrrr_lifecycle_transport_journals%ROWTYPE;
		BEGIN
			SELECT * INTO journal_row
			FROM ae_hrrr_lifecycle_transport_journals
			WHERE namespace_id=NEW.namespace_id AND record_digest=NEW.journal_record_digest
			FOR SHARE;
			IF journal_row.record_digest IS NULL OR NEW.operation<>journal_row.operation
				OR NEW.plan_digest<>journal_row.plan_digest
				OR NEW.repository_commit<>journal_row.repository_commit
				OR NEW.runtime_resource_set_id<>journal_row.runtime_resource_set_id
				OR NEW.registration_request_digest<>journal_row.registration_request_digest
				OR NEW.created_at<journal_row.completed_at
				OR agent_evaluation_jsonb_object_key_count(NEW.record_json)<>7
				OR NEW.record_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-archive-record'
				OR NEW.record_json->'journalRecord'<>journal_row.record_json
				OR NEW.record_json->>'journalRecordDigest'<>journal_row.record_digest
				OR NEW.record_json->>'budgetClosureProjectionDigest'<>
					NEW.budget_closure_projection_digest
				OR NEW.record_json->>'archiveRecordDigest'<>NEW.archive_record_digest
				OR agent_evaluation_canonical_jsonb_digest(
					NEW.record_json-'archiveRecordDigest')<>NEW.archive_record_digest
				OR EXISTS (
					SELECT 1
					FROM ae_hrrr_lifecycle_journal_archive_roots root
					WHERE root.namespace_id=NEW.namespace_id AND root.plan_digest=NEW.plan_digest
						AND root.repository_commit=NEW.repository_commit
						AND root.runtime_resource_set_id=NEW.runtime_resource_set_id
				) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle archive record is not exact or family is sealed'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_archive_exact
			BEFORE INSERT
			ON ae_hrrr_lifecycle_journal_archives
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_archive_exact()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_archive_immutable
			BEFORE UPDATE OR DELETE
			ON ae_hrrr_lifecycle_journal_archives
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
		`CREATE OR REPLACE FUNCTION materialize_ae_hrrr_lc_journal_archive_root(
			candidate_namespace_id TEXT,candidate_plan_digest TEXT,
			candidate_repository_commit TEXT,candidate_runtime_resource_set_id TEXT,
			candidate_sealed_at TIMESTAMPTZ
		) RETURNS JSONB LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE AS $$
		DECLARE
			record_count_value BIGINT;
			creation_count BIGINT;
			cleanup_count BIGINT;
			creation_request_count BIGINT;
			records JSONB;
			record_digests JSONB;
			creation_record_set_digest TEXT;
			cleanup_record_set_digest TEXT;
			frozen_run_digest_value TEXT;
			run_config_binding_digest_value TEXT;
			family_base JSONB;
			family_value JSONB;
			family_digest_value TEXT;
			closure_exact BOOLEAN;
		BEGIN
			SELECT COUNT(*),
				COUNT(*) FILTER (WHERE operation='create'),
				COUNT(*) FILTER (WHERE operation='delete'),
				COUNT(DISTINCT registration_request_digest) FILTER (WHERE operation='create'),
				jsonb_agg(record_json ORDER BY operation COLLATE "C",
					registration_request_digest COLLATE "C",
					COALESCE(record_json#>>'{journalRecord,businessResult,resourceRole}','') COLLATE "C",
					COALESCE(record_json#>>'{journalRecord,businessResult,resourceId}','') COLLATE "C"),
				jsonb_agg(to_jsonb(archive_record_digest) ORDER BY operation COLLATE "C",
					registration_request_digest COLLATE "C",
					COALESCE(record_json#>>'{journalRecord,businessResult,resourceRole}','') COLLATE "C",
					COALESCE(record_json#>>'{journalRecord,businessResult,resourceId}','') COLLATE "C"),
				MIN(record_json#>>'{journalRecord,dispatchIntentSet,intents,0,frozenRunDigest}'),
				MIN(record_json#>>'{journalRecord,dispatchIntentSet,intents,0,runConfigArtifactBindingDigest}')
			INTO record_count_value,creation_count,cleanup_count,creation_request_count,
				records,record_digests,frozen_run_digest_value,run_config_binding_digest_value
			FROM ae_hrrr_lifecycle_journal_archives archive
			WHERE archive.namespace_id=candidate_namespace_id
				AND archive.plan_digest=candidate_plan_digest
				AND archive.repository_commit=candidate_repository_commit
				AND archive.runtime_resource_set_id=candidate_runtime_resource_set_id
				AND archive.v46_eligible;
			WITH creation AS (
				SELECT *
				FROM ae_hrrr_lifecycle_journal_archives
				WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
					AND repository_commit=candidate_repository_commit
					AND runtime_resource_set_id=candidate_runtime_resource_set_id
					AND operation='create' AND v46_eligible
			), cleanup AS (
				SELECT *
				FROM ae_hrrr_lifecycle_journal_archives
				WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
					AND repository_commit=candidate_repository_commit
					AND runtime_resource_set_id=candidate_runtime_resource_set_id
					AND operation='delete' AND v46_eligible
			), expected AS (
				SELECT registration_request_digest,'primary'::text AS role,
					record_json#>>'{journalRecord,businessResult,providerResourceId}' AS resource_id
				FROM creation
				UNION ALL
				SELECT creation.registration_request_digest,'auxiliary',resource_id
				FROM creation
				CROSS JOIN LATERAL jsonb_array_elements_text(
					creation.record_json#>'{journalRecord,businessResult,auxiliaryResourceIds}'
				) resource_id
			), actual AS (
				SELECT registration_request_digest,
					record_json#>>'{journalRecord,businessResult,resourceRole}' AS role,
					record_json#>>'{journalRecord,businessResult,resourceId}' AS resource_id
				FROM cleanup
			)
			SELECT creation_count=4 AND creation_request_count=4
				AND cleanup_count>=4 AND record_count_value BETWEEN 8 AND 88
				AND NOT EXISTS (
					SELECT 1 FROM creation
					WHERE record_json#>>'{journalRecord,businessResult,outcome}'<>
						'created-and-uploaded'
						OR record_json->'budgetClosureProjection'='null'::jsonb
				)
				AND NOT EXISTS (
					SELECT 1 FROM cleanup
					WHERE record_json->'budgetClosureProjection'<>'null'::jsonb
				)
				AND NOT EXISTS (
					SELECT 1 FROM cleanup
					LEFT JOIN creation USING (registration_request_digest)
					WHERE creation.archive_record_digest IS NULL
						OR cleanup.budget_closure_projection_digest<>
							creation.budget_closure_projection_digest
				)
				AND NOT EXISTS (SELECT * FROM expected EXCEPT SELECT * FROM actual)
				AND NOT EXISTS (SELECT * FROM actual EXCEPT SELECT * FROM expected)
				AND (SELECT COUNT(*) FROM expected)=(SELECT COUNT(DISTINCT
					registration_request_digest||chr(31)||role||chr(31)||resource_id) FROM expected)
				AND (SELECT COUNT(*) FROM actual)=(SELECT COUNT(DISTINCT
					registration_request_digest||chr(31)||role||chr(31)||resource_id) FROM actual)
			INTO closure_exact;
			IF NOT COALESCE(closure_exact,FALSE)
				OR candidate_sealed_at<(SELECT MAX(created_at)
					FROM ae_hrrr_lifecycle_journal_archives
					WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
						AND repository_commit=candidate_repository_commit
						AND runtime_resource_set_id=candidate_runtime_resource_set_id) THEN
				RAISE EXCEPTION 'hosted runtime lifecycle archive family is not release-zeroed'
					USING ERRCODE='23514';
			END IF;
			SELECT agent_evaluation_canonical_jsonb_digest(jsonb_agg(
				to_jsonb(journal_record_digest) ORDER BY journal_record_digest COLLATE "C"))
			INTO creation_record_set_digest
			FROM ae_hrrr_lifecycle_journal_archives
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND runtime_resource_set_id=candidate_runtime_resource_set_id
				AND operation='create' AND v46_eligible;
			SELECT agent_evaluation_canonical_jsonb_digest(jsonb_agg(
				to_jsonb(journal_record_digest) ORDER BY journal_record_digest COLLATE "C"))
			INTO cleanup_record_set_digest
			FROM ae_hrrr_lifecycle_journal_archives
			WHERE namespace_id=candidate_namespace_id AND plan_digest=candidate_plan_digest
				AND repository_commit=candidate_repository_commit
				AND runtime_resource_set_id=candidate_runtime_resource_set_id
				AND operation='delete' AND v46_eligible;
			family_base:=jsonb_build_object(
				'format','prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-archive-family',
				'version',1,'namespaceId',candidate_namespace_id,
				'repositoryCommit',candidate_repository_commit,'planDigest',candidate_plan_digest,
				'frozenRunDigest',frozen_run_digest_value,
				'runConfigArtifactBindingDigest',run_config_binding_digest_value,
				'runtimeResourceSetId',candidate_runtime_resource_set_id,
				'closureStatus','zeroed','records',records,'recordDigests',record_digests,
				'creationRecordSetDigest',creation_record_set_digest,
				'cleanupRecordSetDigest',cleanup_record_set_digest
			);
			family_digest_value:=agent_evaluation_canonical_jsonb_digest(family_base);
			family_value:=family_base||jsonb_build_object('familyDigest',family_digest_value);
			INSERT INTO ae_hrrr_lifecycle_journal_archive_roots(
				namespace_id,plan_digest,repository_commit,runtime_resource_set_id,family_digest,
				closure_status,record_count,creation_record_set_digest,cleanup_record_set_digest,
				family_json,family_bytes,sealed_at,v46_eligible
			) VALUES (
				candidate_namespace_id,candidate_plan_digest,candidate_repository_commit,
				candidate_runtime_resource_set_id,family_digest_value,'zeroed',record_count_value,
				creation_record_set_digest,cleanup_record_set_digest,family_value,
				convert_to(agent_evaluation_canonical_jsonb_text(family_value),'UTF8'),
				candidate_sealed_at,TRUE
			);
			RETURN family_value;
		END;
		$$`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_archive_root_exact()
			RETURNS trigger AS $$
		BEGIN
			IF agent_evaluation_jsonb_object_key_count(NEW.family_json)<>14
				OR NEW.family_json->>'format'<>
					'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-archive-family'
				OR (NEW.family_json->>'version')::bigint<>1
				OR NEW.family_json->>'namespaceId'<>NEW.namespace_id
				OR NEW.family_json->>'repositoryCommit'<>NEW.repository_commit
				OR NEW.family_json->>'planDigest'<>NEW.plan_digest
				OR NEW.family_json->>'runtimeResourceSetId'<>NEW.runtime_resource_set_id
				OR NEW.family_json->>'closureStatus'<>'zeroed'
				OR jsonb_array_length(NEW.family_json->'records')<>NEW.record_count
				OR jsonb_array_length(NEW.family_json->'recordDigests')<>NEW.record_count
				OR NEW.family_json->>'creationRecordSetDigest'<>
					NEW.creation_record_set_digest
				OR NEW.family_json->>'cleanupRecordSetDigest'<>NEW.cleanup_record_set_digest
				OR NEW.family_json->>'familyDigest'<>NEW.family_digest
				OR agent_evaluation_canonical_jsonb_digest(NEW.family_json-'familyDigest')<>
					NEW.family_digest THEN
				RAISE EXCEPTION 'hosted runtime lifecycle archive root is not exact zeroed family'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_archive_root_exact
			BEFORE INSERT
			ON ae_hrrr_lifecycle_journal_archive_roots
			FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_hosted_runtime_lifecycle_archive_root_exact()`,
		`CREATE TRIGGER agent_eval_hosted_runtime_lifecycle_archive_root_immutable
			BEFORE UPDATE OR DELETE
			ON ae_hrrr_lifecycle_journal_archive_roots
			FOR EACH ROW EXECUTE FUNCTION reject_agent_immutable_mutation()`,
	}
}
