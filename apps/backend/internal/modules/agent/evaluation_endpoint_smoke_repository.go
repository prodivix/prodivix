package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"
)

type EvaluationEndpointSmokeEncryptedResultSpoolInput struct {
	AADBytes      []byte
	EnvelopeBytes []byte
	ReceiptBytes  []byte
}

func optionalEvaluationEndpointSmokeCount(value map[string]any, field string) any {
	raw, exists := value[field]
	if !exists {
		return nil
	}
	count, err := evaluationCount(raw, "evaluation endpoint smoke "+field)
	if err != nil {
		return nil
	}
	return count
}

func (repository *Repository) ReserveEvaluationEndpointSmokeBudget(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	reservationID string,
	expectedRevision int64,
	demandBytes []byte,
	reservedAt time.Time,
) (EvaluationBudgetReservationRecord, bool, error) {
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	return repository.ReserveEvaluationBudget(ctx, authority, partition.PlanDigest, reservationID, expectedRevision, demandBytes, reservedAt)
}

func loadEvaluationEndpointSmokePlan(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationPlanRecord, evaluationPlanFact, error) {
	record, err := loadEvaluationPlanRecord(ctx, queryer, namespaceID, partition)
	if err != nil {
		return EvaluationPlanRecord{}, evaluationPlanFact{}, err
	}
	plan, err := decodeEvaluationPlan(record.FactBytes)
	if err != nil {
		return EvaluationPlanRecord{}, evaluationPlanFact{}, err
	}
	return record, plan, nil
}

func endpointSmokeCommitExists(ctx context.Context, queryer evaluationReadQueryer, namespaceID string, partition EvaluationPlanPartition) (bool, error) {
	var exists bool
	err := queryer.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM agent_evaluation_endpoint_smoke_evidence_commits
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	)`, namespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&exists)
	return exists, err
}

func evaluationEndpointSmokeIntentTurn(namespaceID string, intent evaluationEndpointSmokeDispatchIntent) (EvaluationEndpointSmokeJournalTurnRecord, error) {
	digest, err := evaluationEndpointSmokeTurnDigest(intent, nil, nil, nil)
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, err
	}
	record := intent.EvaluationEndpointSmokeDispatchIntentRecord
	record.NamespaceID = namespaceID
	return EvaluationEndpointSmokeJournalTurnRecord{State: "intent-recorded", Intent: record, TurnDigest: digest}, nil
}

func (repository *Repository) PutEvaluationEndpointSmokeDispatchIntent(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	intentBytes []byte,
) (EvaluationEndpointSmokeJournalTurnRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	intent, err := decodeEvaluationEndpointSmokeDispatchIntent(intentBytes)
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	_, plan, err := loadEvaluationEndpointSmokePlan(ctx, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if _, err := validateEvaluationEndpointSmokeTarget(plan, intent); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if committed, err := endpointSmokeCommitExists(ctx, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	} else if committed {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke evidence is already committed")
	}
	var demandDigest string
	var reservedAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT demand_digest, reserved_at
		FROM agent_evaluation_budget_reservations
		WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, intent.BudgetReservationID).Scan(&demandDigest, &reservedAt); errors.Is(err, sql.ErrNoRows) {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if demandDigest != intent.DemandDigest || intent.CreatedAt.Before(reservedAt) {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke dispatch intent budget authority drifted")
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_endpoint_smoke_dispatch_intents (
		namespace_id, plan_digest, repository_commit, smoke_target_id, smoke_target_digest,
		intent_id, endpoint_class, protocol_family, provider_configuration_id, model_id,
		immutable_model_version, model_lineage_digest, inference_configuration_digest,
		adapter_digest, pricing_authority_digest, response_spool_encryption_policy_digest,
		smoke_profile_digest, invocation_id, budget_reservation_id, demand_digest,
		request_digest, endpoint_id, request_body_digest, request_bytes, intent_digest,
		intent_json, intent_bytes, created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,$28,$29)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		intent.SmokeTargetID, intent.SmokeTargetDigest, intent.IntentID, intent.EndpointClass,
		intent.ProtocolFamily, intent.ProviderConfigurationID, stringMember(intent.Value, "modelId"),
		stringMember(intent.Value, "immutableModelVersion"), stringMember(intent.Value, "modelLineageDigest"),
		stringMember(intent.Value, "inferenceConfigurationDigest"), stringMember(intent.Value, "adapterDigest"),
		stringMember(intent.Value, "pricingAuthorityDigest"), stringMember(intent.Value, "responseSpoolEncryptionPolicyDigest"),
		stringMember(intent.Value, "smokeProfileDigest"), intent.InvocationID, intent.BudgetReservationID,
		intent.DemandDigest, intent.RequestDigest, intent.EndpointID, intent.RequestBodyDigest,
		intent.RequestBytes, intent.IntentDigest, string(intent.IntentBytes), intent.IntentBytes, intent.CreatedAt)
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	replayed := rows == 0
	if replayed {
		var existing []byte
		if err := tx.QueryRowContext(ctx, `SELECT intent_bytes
			FROM agent_evaluation_endpoint_smoke_dispatch_intents
			WHERE namespace_id = $1 AND plan_digest = $2 AND smoke_target_id = $3
			FOR SHARE`, authority.NamespaceID, partition.PlanDigest, intent.SmokeTargetID).Scan(&existing); errors.Is(err, sql.ErrNoRows) {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke dispatch intent identity was reused")
		} else if err != nil {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
		}
		if !bytes.Equal(existing, intent.IntentBytes) {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke dispatch intent identity was reused")
		}
	}
	turn, err := evaluationEndpointSmokeIntentTurn(authority.NamespaceID, intent)
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	return turn, replayed, nil
}

func endpointSmokeClosedTurn(
	namespaceID string,
	intent evaluationEndpointSmokeDispatchIntent,
	transport evaluationTransportReceipt,
	spool *evaluationEndpointSmokeSpoolReceipt,
	closedAt time.Time,
	storedTurnDigest string,
) (EvaluationEndpointSmokeJournalTurnRecord, error) {
	digest, err := evaluationEndpointSmokeTurnDigest(intent, &transport, spool, &closedAt)
	if err != nil || (storedTurnDigest != "" && storedTurnDigest != digest) {
		return EvaluationEndpointSmokeJournalTurnRecord{}, conflict("evaluation endpoint smoke journal turn digest drifted")
	}
	intentRecord := intent.EvaluationEndpointSmokeDispatchIntentRecord
	intentRecord.NamespaceID = namespaceID
	transportRecord := EvaluationEndpointSmokeTransportReceiptRecord{
		NamespaceID: namespaceID, PlanDigest: intent.PlanDigest, RepositoryCommit: intent.RepositoryCommit,
		SmokeTargetID: intent.SmokeTargetID, SmokeTargetDigest: intent.SmokeTargetDigest,
		InvocationID: transport.InvocationID, IntentDigest: transport.IntentDigest,
		ReceiptID: transport.ReceiptID, ReceiptDigest: transport.ReceiptDigest, ReceiptBytes: transport.ReceiptBytes,
		ProviderRequestID: transport.ProviderRequestID, DispatchState: transport.DispatchState, Outcome: transport.Outcome,
		ResponseBodyDigest: transport.ResponseBodyDigest, StartedAt: transport.StartedAt, CompletedAt: transport.CompletedAt,
		ClosedAt: closedAt, TurnDigest: digest,
	}
	var spoolRecord *EvaluationEndpointSmokeResultSpoolReceiptRecord
	if spool != nil {
		copy := spool.EvaluationEndpointSmokeResultSpoolReceiptRecord
		copy.NamespaceID = namespaceID
		spoolRecord = &copy
	}
	closedAtCopy := closedAt
	return EvaluationEndpointSmokeJournalTurnRecord{
		State: "closed", Intent: intentRecord, TransportReceipt: &transportRecord,
		ResultSpoolReceipt: spoolRecord, ClosedAt: &closedAtCopy, TurnDigest: digest,
	}, nil
}

func (repository *Repository) CloseEvaluationEndpointSmokeTransport(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	intentBytes []byte,
	transportReceiptBytes []byte,
	encryptedSpool *EvaluationEndpointSmokeEncryptedResultSpoolInput,
	closedAt time.Time,
) (EvaluationEndpointSmokeJournalTurnRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	intent, err := decodeEvaluationEndpointSmokeDispatchIntent(intentBytes)
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	transport, err := decodeEvaluationTransportReceipt(transportReceiptBytes)
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	closedAt = closedAt.UTC().Truncate(time.Millisecond)
	if closedAt.Before(transport.CompletedAt) || validateEvaluationEndpointSmokeTransport(intent, transport) != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke close authority is invalid")
	}
	var aad evaluationEndpointSmokeSpoolAAD
	var envelope evaluationProviderResultSpoolEnvelope
	var spool evaluationEndpointSmokeSpoolReceipt
	if encryptedSpool != nil {
		aad, err = decodeEvaluationEndpointSmokeSpoolAAD(encryptedSpool.AADBytes)
		if err == nil {
			envelope, err = decodeEvaluationProviderResultSpoolEnvelope(encryptedSpool.EnvelopeBytes)
		}
		if err == nil {
			spool, err = decodeEvaluationEndpointSmokeSpoolReceipt(encryptedSpool.ReceiptBytes)
		}
		if err != nil {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
		}
		if err := validateEvaluationEndpointSmokeSpool(intent, transport, aad, envelope, spool); err != nil {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
		}
	} else if transport.Outcome == "completed" {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke completed transport requires encrypted replay authority")
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	_, plan, err := loadEvaluationEndpointSmokePlan(ctx, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if _, err := validateEvaluationEndpointSmokeTarget(plan, intent); err != nil || closedAt.After(plan.ExpiresAt) {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke close is outside its frozen plan")
	}
	if encryptedSpool != nil {
		namespaceDigest, digestErr := evaluationNamespaceDigest(authority.NamespaceID)
		if digestErr != nil || aad.NamespaceDigest != namespaceDigest {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke spool namespace authority drifted")
		}
	}
	if committed, err := endpointSmokeCommitExists(ctx, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	} else if committed {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke evidence is already committed")
	}
	var storedIntent []byte
	if err := tx.QueryRowContext(ctx, `SELECT intent_bytes FROM agent_evaluation_endpoint_smoke_dispatch_intents
		WHERE namespace_id = $1 AND plan_digest = $2 AND smoke_target_id = $3 FOR SHARE`, authority.NamespaceID,
		partition.PlanDigest, intent.SmokeTargetID).Scan(&storedIntent); errors.Is(err, sql.ErrNoRows) {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	} else if !bytes.Equal(storedIntent, intent.IntentBytes) {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke close dispatch intent drifted")
	}
	var existingTransport, existingSpool []byte
	var existingClosedAt time.Time
	var existingTurnDigest string
	err = tx.QueryRowContext(ctx, `SELECT receipt_bytes, closed_at, turn_digest,
		COALESCE((SELECT receipt_bytes FROM agent_evaluation_endpoint_smoke_result_spool_receipts spool
			WHERE spool.namespace_id = transport.namespace_id AND spool.plan_digest = transport.plan_digest
				AND spool.smoke_target_id = transport.smoke_target_id), NULL)
		FROM agent_evaluation_endpoint_smoke_transport_receipts transport
		WHERE namespace_id = $1 AND plan_digest = $2 AND smoke_target_id = $3 FOR SHARE`, authority.NamespaceID,
		partition.PlanDigest, intent.SmokeTargetID).Scan(&existingTransport, &existingClosedAt, &existingTurnDigest, &existingSpool)
	if err == nil {
		if !bytes.Equal(existingTransport, transport.ReceiptBytes) || !existingClosedAt.Equal(closedAt) ||
			(encryptedSpool == nil) != (existingSpool == nil) || (encryptedSpool != nil && !bytes.Equal(existingSpool, spool.ReceiptBytes)) {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, conflict("evaluation endpoint smoke transport close identity was reused")
		}
		var spoolPointer *evaluationEndpointSmokeSpoolReceipt
		if encryptedSpool != nil {
			spoolPointer = &spool
		}
		turn, err := endpointSmokeClosedTurn(authority.NamespaceID, intent, transport, spoolPointer, closedAt, existingTurnDigest)
		if err != nil {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
		}
		return turn, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	var spoolPointer *evaluationEndpointSmokeSpoolReceipt
	if encryptedSpool != nil {
		spoolPointer = &spool
	}
	turn, err := endpointSmokeClosedTurn(authority.NamespaceID, intent, transport, spoolPointer, closedAt, "")
	if err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if transport.ProviderRequestID != "" {
		if err := registerEvaluationProviderRequest(ctx, tx, authority.NamespaceID, partition, transport.ProviderConfigurationID,
			transport.ProviderRequestID, "endpoint-smoke", intent.SmokeTargetID, transport.CompletedAt); err != nil {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
		}
	}
	sseEventCount, _ := evaluationCount(transport.Value["sseEventCount"], "evaluation endpoint smoke SSE event count")
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_endpoint_smoke_transport_receipts (
		namespace_id, plan_digest, repository_commit, smoke_target_id, smoke_target_digest,
		receipt_id, protocol_family, provider_configuration_id, invocation_id,
		dispatch_intent_digest, request_digest, endpoint_id, endpoint_class,
		request_body_digest, request_bytes, response_bytes, http_status,
		response_header_digest, response_body_digest, provider_request_id,
		provider_identity_kind, provider_response_id, resolved_model_id,
		resolved_model_version, sse_event_count, dispatch_state, outcome,
		error_category, receipt_digest, receipt_json, receipt_bytes, started_at,
		completed_at, closed_at, turn_digest
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb,$31,$32,$33,$34,$35)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, intent.SmokeTargetID,
		intent.SmokeTargetDigest, transport.ReceiptID, transport.ProtocolFamily, transport.ProviderConfigurationID,
		transport.InvocationID, transport.IntentDigest, transport.RequestDigest, transport.EndpointID,
		transport.EndpointClass, transport.RequestBodyDigest, transport.RequestBytes, transport.ResponseBytes,
		optionalEvaluationEndpointSmokeCount(transport.Value, "httpStatus"), nullableEvaluationAuthenticityString(transport.ResponseHeaderDigest),
		nullableEvaluationAuthenticityString(transport.ResponseBodyDigest), nullableEvaluationAuthenticityString(transport.ProviderRequestID),
		nullableEvaluationAuthenticityString(stringMember(transport.Value, "providerIdentityKind")),
		nullableEvaluationAuthenticityString(stringMember(transport.Value, "providerResponseId")),
		nullableEvaluationAuthenticityString(stringMember(transport.Value, "resolvedModelId")),
		nullableEvaluationAuthenticityString(stringMember(transport.Value, "resolvedModelVersion")), sseEventCount,
		transport.DispatchState, transport.Outcome, nullableEvaluationAuthenticityString(stringMember(transport.Value, "errorCategory")),
		transport.ReceiptDigest, string(transport.ReceiptBytes), transport.ReceiptBytes, transport.StartedAt,
		transport.CompletedAt, closedAt, turn.TurnDigest); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	if encryptedSpool != nil {
		if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_endpoint_smoke_result_spool_receipts (
			namespace_id, plan_digest, repository_commit, smoke_target_id, smoke_target_digest,
			invocation_id, spool_ref, dispatch_intent_digest, transport_receipt_digest,
			algorithm, encryption_profile_digest, key_ref_digest, key_id, key_version,
			aad_digest, envelope_digest, ciphertext_digest, ciphertext_size_bytes,
			response_body_digest, normalized_event_set_digest, response_digest,
			retention_class, retention_policy_digest, receipt_digest, receipt_json,
			receipt_bytes, created_at, expires_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25,$26,$27)`,
			authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, intent.SmokeTargetID,
			intent.SmokeTargetDigest, intent.InvocationID, spool.SpoolRef, intent.IntentDigest,
			transport.ReceiptDigest, spool.Algorithm, spool.EncryptionProfileDigest, spool.KeyRefDigest,
			spool.KeyID, spool.KeyVersion, spool.AADDigest, spool.EnvelopeDigest, spool.CiphertextDigest,
			spool.CiphertextSizeBytes, spool.ResponseBodyDigest, spool.NormalizedEventSetDigest,
			spool.ResponseDigest, "endpoint-smoke-resume-only", spool.RetentionPolicyDigest,
			spool.ReceiptDigest, string(spool.ReceiptBytes), spool.ReceiptBytes, spool.CreatedAt, spool.ExpiresAt); err != nil {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_endpoint_smoke_result_spool_payloads (
			namespace_id, plan_digest, repository_commit, namespace_digest, smoke_target_id,
			smoke_target_digest, invocation_id, spool_ref, spool_receipt_digest,
			dispatch_intent_digest, transport_receipt_digest, response_body_digest,
			normalized_event_set_digest, key_id, key_version, nonce_bytes,
			authentication_tag_bytes, ciphertext_bytes, ciphertext_digest,
			ciphertext_size_bytes, aad_digest, aad_json, aad_bytes, envelope_digest,
			envelope_json, envelope_bytes, created_at, expires_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25::jsonb,$26,$27,$28)`,
			authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, aad.NamespaceDigest,
			intent.SmokeTargetID, intent.SmokeTargetDigest, intent.InvocationID, spool.SpoolRef,
			spool.ReceiptDigest, intent.IntentDigest, transport.ReceiptDigest, aad.ResponseBodyDigest,
			aad.NormalizedEventSetDigest, envelope.KeyID, envelope.KeyVersion, envelope.Nonce,
			envelope.AuthenticationTag, envelope.Ciphertext, envelope.CiphertextDigest,
			envelope.CiphertextSizeBytes, envelope.AADDigest, string(aad.Canonical), aad.Canonical,
			envelope.EnvelopeDigest, string(envelope.Canonical), envelope.Canonical, spool.CreatedAt, spool.ExpiresAt); err != nil {
			return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationEndpointSmokeJournalTurnRecord{}, false, err
	}
	return turn, false, nil
}

func loadEvaluationEndpointSmokeTurns(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
) ([]EvaluationEndpointSmokeJournalTurnRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT intent.intent_bytes,
		transport.receipt_bytes, transport.closed_at, transport.turn_digest,
		spool.receipt_bytes
	FROM agent_evaluation_endpoint_smoke_dispatch_intents intent
	LEFT JOIN agent_evaluation_endpoint_smoke_transport_receipts transport
	  ON transport.namespace_id = intent.namespace_id AND transport.plan_digest = intent.plan_digest
	 AND transport.smoke_target_id = intent.smoke_target_id
	LEFT JOIN agent_evaluation_endpoint_smoke_result_spool_receipts spool
	  ON spool.namespace_id = intent.namespace_id AND spool.plan_digest = intent.plan_digest
	 AND spool.smoke_target_id = intent.smoke_target_id
	WHERE intent.namespace_id = $1 AND intent.plan_digest = $2 AND intent.repository_commit = $3
	ORDER BY intent.smoke_target_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	turns := make([]EvaluationEndpointSmokeJournalTurnRecord, 0, maximumEvaluationEndpointSmokeTargets)
	for rows.Next() {
		var intentBytes []byte
		var transportBytes, spoolBytes []byte
		var closedAt sql.NullTime
		var turnDigest sql.NullString
		if err := rows.Scan(&intentBytes, &transportBytes, &closedAt, &turnDigest, &spoolBytes); err != nil {
			return nil, err
		}
		intent, err := decodeEvaluationEndpointSmokeDispatchIntent(intentBytes)
		if err != nil {
			return nil, conflict("persisted evaluation endpoint smoke dispatch intent is invalid")
		}
		if _, err := validateEvaluationEndpointSmokeTarget(plan, intent); err != nil {
			return nil, err
		}
		if transportBytes == nil {
			if closedAt.Valid || turnDigest.Valid || spoolBytes != nil {
				return nil, conflict("evaluation endpoint smoke intent-only turn contains close metadata")
			}
			turn, err := evaluationEndpointSmokeIntentTurn(namespaceID, intent)
			if err != nil {
				return nil, err
			}
			turns = append(turns, turn)
			continue
		}
		if !closedAt.Valid || !turnDigest.Valid {
			return nil, conflict("evaluation endpoint smoke closed turn metadata is incomplete")
		}
		transport, err := decodeEvaluationTransportReceipt(transportBytes)
		if err != nil || validateEvaluationEndpointSmokeTransport(intent, transport) != nil {
			return nil, conflict("persisted evaluation endpoint smoke transport receipt drifted")
		}
		var spoolPointer *evaluationEndpointSmokeSpoolReceipt
		if spoolBytes != nil {
			spool, err := decodeEvaluationEndpointSmokeSpoolReceipt(spoolBytes)
			if err != nil || spool.PlanDigest != plan.PlanDigest || spool.RepositoryCommit != plan.RepositoryCommit ||
				spool.SmokeTargetID != intent.SmokeTargetID || spool.InvocationID != intent.InvocationID ||
				spool.DispatchIntentDigest != intent.IntentDigest || spool.TransportReceiptDigest != transport.ReceiptDigest {
				return nil, conflict("persisted evaluation endpoint smoke spool receipt drifted")
			}
			spoolPointer = &spool
		} else if transport.Outcome == "completed" {
			return nil, conflict("persisted completed endpoint smoke transport has no spool receipt")
		}
		turn, err := endpointSmokeClosedTurn(namespaceID, intent, transport, spoolPointer, closedAt.Time, turnDigest.String)
		if err != nil {
			return nil, err
		}
		turns = append(turns, turn)
		if len(turns) > maximumEvaluationEndpointSmokeTargets {
			return nil, conflict("evaluation endpoint smoke journal exceeds its frozen denominator")
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return turns, nil
}

func queryEvaluationEndpointSmokeDispatchIntents(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationEndpointSmokeDispatchIntentRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT intent_bytes
		FROM agent_evaluation_endpoint_smoke_dispatch_intents
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		ORDER BY smoke_target_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationEndpointSmokeDispatchIntentRecord, 0, maximumEvaluationEndpointSmokeTargets)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		decoded, err := decodeEvaluationEndpointSmokeDispatchIntent(source)
		if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit {
			return nil, conflict("persisted evaluation endpoint smoke dispatch intent drifted")
		}
		record := decoded.EvaluationEndpointSmokeDispatchIntentRecord
		record.NamespaceID = namespaceID
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) > maximumEvaluationEndpointSmokeTargets {
		return nil, conflict("evaluation endpoint smoke dispatch journal exceeds its denominator")
	}
	return records, nil
}

func queryEvaluationEndpointSmokeTransportReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationEndpointSmokeTransportReceiptRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT smoke_target_id,smoke_target_digest,receipt_bytes,closed_at,turn_digest
		FROM agent_evaluation_endpoint_smoke_transport_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		ORDER BY smoke_target_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationEndpointSmokeTransportReceiptRecord, 0, maximumEvaluationEndpointSmokeTargets)
	for rows.Next() {
		var smokeTargetID, smokeTargetDigest, turnDigest string
		var source []byte
		var closedAt time.Time
		if err := rows.Scan(&smokeTargetID, &smokeTargetDigest, &source, &closedAt, &turnDigest); err != nil {
			return nil, err
		}
		decoded, err := decodeEvaluationTransportReceipt(source)
		if err != nil {
			return nil, conflict("persisted evaluation endpoint smoke transport receipt is invalid")
		}
		records = append(records, EvaluationEndpointSmokeTransportReceiptRecord{
			NamespaceID: namespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
			SmokeTargetID: smokeTargetID, SmokeTargetDigest: smokeTargetDigest, InvocationID: decoded.InvocationID,
			IntentDigest: decoded.IntentDigest, ReceiptID: decoded.ReceiptID, ReceiptDigest: decoded.ReceiptDigest,
			ReceiptBytes: decoded.ReceiptBytes, ProviderRequestID: decoded.ProviderRequestID,
			DispatchState: decoded.DispatchState, Outcome: decoded.Outcome, ResponseBodyDigest: decoded.ResponseBodyDigest,
			StartedAt: decoded.StartedAt, CompletedAt: decoded.CompletedAt, ClosedAt: closedAt, TurnDigest: turnDigest,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) > maximumEvaluationEndpointSmokeTargets {
		return nil, conflict("evaluation endpoint smoke transport journal exceeds its denominator")
	}
	return records, nil
}

func queryEvaluationEndpointSmokeResultSpoolReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationEndpointSmokeResultSpoolReceiptRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_endpoint_smoke_result_spool_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		ORDER BY smoke_target_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationEndpointSmokeResultSpoolReceiptRecord, 0, maximumEvaluationEndpointSmokeTargets)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		decoded, err := decodeEvaluationEndpointSmokeSpoolReceipt(source)
		if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit {
			return nil, conflict("persisted evaluation endpoint smoke spool receipt drifted")
		}
		record := decoded.EvaluationEndpointSmokeResultSpoolReceiptRecord
		record.NamespaceID = namespaceID
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func queryEvaluationEndpointSmokeSpoolDispositions(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationEndpointSmokeResultSpoolDispositionRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_endpoint_smoke_spool_disposition_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		ORDER BY smoke_target_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationEndpointSmokeResultSpoolDispositionRecord, 0, maximumEvaluationEndpointSmokeTargets)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		decoded, err := decodeEvaluationEndpointSmokeDisposition(source)
		if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit {
			return nil, conflict("persisted evaluation endpoint smoke spool disposition drifted")
		}
		record := decoded.EvaluationEndpointSmokeResultSpoolDispositionRecord
		record.NamespaceID = namespaceID
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func queryEvaluationEndpointSmokeValidationFailures(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationEndpointSmokeValidationFailureRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_endpoint_smoke_validation_failure_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		ORDER BY smoke_target_id COLLATE "C" ASC, receipt_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationEndpointSmokeValidationFailureRecord, 0, maximumEvaluationEndpointSmokeTargets)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		decoded, err := decodeEvaluationEndpointSmokeValidationFailure(source)
		if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit {
			return nil, conflict("persisted evaluation endpoint smoke validation-failure receipt drifted")
		}
		record := decoded.EvaluationEndpointSmokeValidationFailureRecord
		record.NamespaceID = namespaceID
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func queryEvaluationEndpointSmokeTerminalReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationEndpointSmokeTerminalReceiptRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_endpoint_smoke_terminal_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		ORDER BY smoke_target_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationEndpointSmokeTerminalReceiptRecord, 0, maximumEvaluationEndpointSmokeTargets)
	for rows.Next() {
		var source []byte
		if err := rows.Scan(&source); err != nil {
			return nil, err
		}
		decoded, err := decodeEvaluationEndpointSmokeTerminalReceipt(source)
		if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit {
			return nil, conflict("persisted evaluation endpoint smoke terminal receipt drifted")
		}
		record := decoded.EvaluationEndpointSmokeTerminalReceiptRecord
		record.NamespaceID = namespaceID
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func evaluationEndpointSmokeDispatchIntentSetDigest(records []EvaluationEndpointSmokeDispatchIntentRecord) (string, error) {
	identities, digests := make([]string, len(records)), make([]string, len(records))
	for index, record := range records {
		identities[index], digests[index] = record.SmokeTargetID, record.IntentDigest
	}
	return evaluationEndpointSmokeSetDigest("endpointSmokeDispatchIntentDigests", identities, digests)
}

func evaluationEndpointSmokeTransportReceiptSetDigest(records []EvaluationEndpointSmokeTransportReceiptRecord) (string, error) {
	identities, digests := make([]string, len(records)), make([]string, len(records))
	for index, record := range records {
		identities[index], digests[index] = record.InvocationID+"\x00"+record.ReceiptID, record.ReceiptDigest
	}
	return evaluationEndpointSmokeSetDigest("endpointSmokeTransportReceiptDigests", identities, digests)
}

func evaluationEndpointSmokeSpoolReceiptSetDigest(records []EvaluationEndpointSmokeResultSpoolReceiptRecord) (string, error) {
	identities, digests := make([]string, len(records)), make([]string, len(records))
	for index, record := range records {
		identities[index], digests[index] = record.SmokeTargetID, record.ReceiptDigest
	}
	return evaluationEndpointSmokeSetDigest("endpointSmokeResultSpoolReceiptDigests", identities, digests)
}

func evaluationEndpointSmokeSpoolDispositionSetDigest(records []EvaluationEndpointSmokeResultSpoolDispositionRecord) (string, error) {
	identities, digests := make([]string, len(records)), make([]string, len(records))
	for index, record := range records {
		identities[index], digests[index] = record.SmokeTargetID, record.ReceiptDigest
	}
	return evaluationEndpointSmokeSetDigest("endpointSmokeResultSpoolDispositionReceiptDigests", identities, digests)
}

func evaluationEndpointSmokeValidationFailureSetDigest(records []EvaluationEndpointSmokeValidationFailureRecord) (string, error) {
	identities, digests := make([]string, len(records)), make([]string, len(records))
	for index, record := range records {
		identities[index], digests[index] = record.SmokeTargetID+"\x00"+record.ReceiptID, record.ReceiptDigest
	}
	return evaluationEndpointSmokeSetDigest("endpointSmokeValidationFailureReceiptDigests", identities, digests)
}

func evaluationEndpointSmokeTerminalReceiptSetDigest(records []EvaluationEndpointSmokeTerminalReceiptRecord) (string, error) {
	identities, digests := make([]string, len(records)), make([]string, len(records))
	for index, record := range records {
		identities[index], digests[index] = record.SmokeTargetID, record.ReceiptDigest
	}
	return evaluationEndpointSmokeSetDigest("endpointSmokeReceiptDigests", identities, digests)
}

func (repository *Repository) ListEvaluationEndpointSmokeTurns(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationEndpointSmokeJournalTurnRecord, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return nil, err
	}
	ctx, cancel := evaluationReadContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	_, plan, err := loadEvaluationEndpointSmokePlan(ctx, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, err
	}
	turns, err := loadEvaluationEndpointSmokeTurns(ctx, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return turns, nil
}

func (repository *Repository) ReadEvaluationEndpointSmokeEncryptedResultSpool(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	smokeTargetID string,
	expectedSpoolReceiptDigest string,
	readAt time.Time,
) (EvaluationEndpointSmokeEncryptedResultSpoolRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	if _, err := evaluationAuthenticityIdentity(smokeTargetID, "smoke target id"); err != nil ||
		!evaluationDigestPattern.MatchString(expectedSpoolReceiptDigest) || readAt.IsZero() {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, ErrInvalid
	}
	readAt = readAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := evaluationReadContext(ctx)
	defer cancel()
	var intentBytes, transportBytes, receiptBytes, aadBytes, envelopeBytes []byte
	var expiresAt time.Time
	err := repository.db.QueryRowContext(ctx, `SELECT intent.intent_bytes, transport.receipt_bytes,
		spool.receipt_bytes, payload.aad_bytes, payload.envelope_bytes, spool.expires_at
	FROM agent_evaluation_endpoint_smoke_result_spool_receipts spool
	JOIN agent_evaluation_endpoint_smoke_dispatch_intents intent
	  ON intent.namespace_id = spool.namespace_id AND intent.plan_digest = spool.plan_digest
	 AND intent.smoke_target_id = spool.smoke_target_id
	JOIN agent_evaluation_endpoint_smoke_transport_receipts transport
	  ON transport.namespace_id = spool.namespace_id AND transport.plan_digest = spool.plan_digest
	 AND transport.smoke_target_id = spool.smoke_target_id
	JOIN agent_evaluation_endpoint_smoke_result_spool_payloads payload
	  ON payload.namespace_id = spool.namespace_id AND payload.plan_digest = spool.plan_digest
	 AND payload.smoke_target_id = spool.smoke_target_id AND payload.spool_ref = spool.spool_ref
	WHERE spool.namespace_id = $1 AND spool.plan_digest = $2 AND spool.repository_commit = $3
	  AND spool.smoke_target_id = $4 AND spool.receipt_digest = $5`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, smokeTargetID, expectedSpoolReceiptDigest).
		Scan(&intentBytes, &transportBytes, &receiptBytes, &aadBytes, &envelopeBytes, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	if !readAt.Before(expiresAt) {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, conflict("evaluation endpoint smoke encrypted result spool expired")
	}
	intent, err := decodeEvaluationEndpointSmokeDispatchIntent(intentBytes)
	if err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	transport, err := decodeEvaluationTransportReceipt(transportBytes)
	if err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	aad, err := decodeEvaluationEndpointSmokeSpoolAAD(aadBytes)
	if err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	envelope, err := decodeEvaluationProviderResultSpoolEnvelope(envelopeBytes)
	if err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	spool, err := decodeEvaluationEndpointSmokeSpoolReceipt(receiptBytes)
	if err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	if err := validateEvaluationEndpointSmokeTransport(intent, transport); err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	if err := validateEvaluationEndpointSmokeSpool(intent, transport, aad, envelope, spool); err != nil {
		return EvaluationEndpointSmokeEncryptedResultSpoolRecord{}, err
	}
	record := spool.EvaluationEndpointSmokeResultSpoolReceiptRecord
	record.NamespaceID = authority.NamespaceID
	return EvaluationEndpointSmokeEncryptedResultSpoolRecord{
		Receipt: record, AADBytes: append([]byte(nil), aad.Canonical...), EnvelopeBytes: append([]byte(nil), envelope.Canonical...),
	}, nil
}

func loadEvaluationEndpointSmokeCommitRecord(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationEndpointSmokeEvidenceCommitRecord, evaluationEndpointSmokeEvidenceCommit, error) {
	var record EvaluationEndpointSmokeEvidenceCommitRecord
	var source []byte
	err := queryer.QueryRowContext(ctx, `SELECT configuration_digest, budget_reservation_id,
		settlement_digest, report_digest, commit_digest, commit_bytes, committed_at
	FROM agent_evaluation_endpoint_smoke_evidence_commits
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`, namespaceID,
		partition.PlanDigest, partition.RepositoryCommit).Scan(&record.ConfigurationDigest, &record.BudgetReservationID,
		&record.SettlementDigest, &record.ReportDigest, &record.CommitDigest, &source, &record.CommittedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, evaluationEndpointSmokeEvidenceCommit{}, ErrNotFound
	}
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, evaluationEndpointSmokeEvidenceCommit{}, err
	}
	decoded, err := decodeEvaluationEndpointSmokeCommit(source)
	if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit ||
		decoded.ConfigurationDigest != record.ConfigurationDigest || decoded.ReservationID != record.BudgetReservationID ||
		decoded.Settlement.Digest != record.SettlementDigest || decoded.Report.ReportDigest != record.ReportDigest ||
		decoded.CommitDigest != record.CommitDigest || decoded.Report.CompletedAt != record.CommittedAt {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, evaluationEndpointSmokeEvidenceCommit{}, conflict("persisted evaluation endpoint smoke evidence commit drifted")
	}
	record.NamespaceID, record.PlanDigest, record.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
	record.CommitBytes = append([]byte(nil), decoded.Canonical...)
	return record, decoded, nil
}

func (repository *Repository) LoadEvaluationEndpointSmokeCommit(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationEndpointSmokeEvidenceCommitRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, err
	}
	ctx, cancel := evaluationReadContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	_, plan, err := loadEvaluationEndpointSmokePlan(ctx, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, err
	}
	record, decoded, err := loadEvaluationEndpointSmokeCommitRecord(ctx, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, err
	}
	if err := validateEvaluationEndpointSmokeCommit(plan, decoded); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, err
	}
	return record, nil
}

func validateEvaluationEndpointSmokeJournalCommit(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
	commit evaluationEndpointSmokeEvidenceCommit,
) error {
	turns, err := loadEvaluationEndpointSmokeTurns(ctx, tx, namespaceID, partition, plan)
	if err != nil {
		return err
	}
	if len(turns) != maximumEvaluationEndpointSmokeTargets {
		return conflict("evaluation endpoint smoke final commit has an incomplete durable journal")
	}
	turnByTarget := make(map[string]EvaluationEndpointSmokeJournalTurnRecord, len(turns))
	for _, turn := range turns {
		if turn.State != "closed" || turn.TransportReceipt == nil {
			return conflict("evaluation endpoint smoke final commit contains an open durable turn")
		}
		turnByTarget[turn.Intent.SmokeTargetID] = turn
	}
	transportByInvocation := make(map[string]evaluationTransportReceipt, len(commit.TransportReceipts))
	for _, transport := range commit.TransportReceipts {
		transportByInvocation[transport.InvocationID] = transport
	}
	spoolByTarget := make(map[string]evaluationEndpointSmokeSpoolReceipt, len(commit.SpoolReceipts))
	for _, spool := range commit.SpoolReceipts {
		spoolByTarget[spool.SmokeTargetID] = spool
	}
	for _, intent := range commit.DispatchIntents {
		turn, exists := turnByTarget[intent.SmokeTargetID]
		transport, transportExists := transportByInvocation[intent.InvocationID]
		spool, hasSpool := spoolByTarget[intent.SmokeTargetID]
		if !exists || !transportExists || !bytes.Equal(turn.Intent.IntentBytes, intent.IntentBytes) ||
			!bytes.Equal(turn.TransportReceipt.ReceiptBytes, transport.ReceiptBytes) ||
			(turn.ResultSpoolReceipt != nil) != hasSpool ||
			(hasSpool && !bytes.Equal(turn.ResultSpoolReceipt.ReceiptBytes, spool.ReceiptBytes)) {
			return conflict("evaluation endpoint smoke final commit drifted from its durable journal")
		}
	}
	return nil
}

func insertEvaluationEndpointSmokeSource(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	source evaluationSourceReceipt,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_source_receipts (
		namespace_id, plan_digest, repository_commit, source_receipt_id, source_kind,
		provider_configuration_id, model_lineage_digest, provider_request_id,
		execution_failure_authority_receipt_digest, source_uri, source_content_digest,
		receipt_digest, receipt_json, receipt_bytes, observed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)
	ON CONFLICT DO NOTHING`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		source.SourceReceiptID, source.SourceKind, source.ProviderConfigurationID,
		nullableEvaluationAuthenticityString(source.ModelLineageDigest), nullableEvaluationAuthenticityString(source.ProviderRequestID),
		nullableEvaluationAuthenticityString(source.ExecutionFailureAuthorityReceiptDigest), nullableEvaluationAuthenticityString(source.SourceURI),
		source.SourceContentDigest, source.ReceiptDigest, string(source.ReceiptBytes), source.ReceiptBytes, source.ObservedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if inserted == 0 {
		existing, err := immutableEvaluationCollisionBytes(ctx, tx, `SELECT receipt_bytes
		FROM agent_evaluation_source_receipts
		WHERE namespace_id=$1 AND plan_digest=$2
		  AND (source_receipt_id=$3 OR source_content_digest=$4 OR receipt_digest=$5)
		FOR SHARE`, namespaceID, partition.PlanDigest, source.SourceReceiptID, source.SourceContentDigest, source.ReceiptDigest)
		if err != nil || !bytes.Equal(existing, source.ReceiptBytes) {
			return conflict("evaluation endpoint smoke source receipt identity or content was reused")
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_endpoint_smoke_source_receipt_refs (
		namespace_id,plan_digest,repository_commit,source_receipt_id,source_content_digest,receipt_digest
	) VALUES ($1,$2,$3,$4,$5,$6)`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		source.SourceReceiptID, source.SourceContentDigest, source.ReceiptDigest)
	return err
}

func insertEvaluationEndpointSmokeDisposition(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	receipt evaluationEndpointSmokeDisposition,
) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_endpoint_smoke_spool_disposition_receipts (
		namespace_id,plan_digest,repository_commit,smoke_target_id,smoke_target_digest,
		invocation_id,spool_ref,spool_receipt_digest,disposition,retention_policy_digest,
		retained_until,disposed_at,receipt_digest,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, receipt.SmokeTargetID,
		receipt.SmokeTargetDigest, receipt.InvocationID, receipt.SpoolRef, receipt.SpoolReceiptDigest,
		receipt.Disposition, receipt.RetentionPolicyDigest, receipt.RetainedUntil, receipt.DisposedAt,
		receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes)
	if err != nil {
		return err
	}
	if receipt.Disposition != "consumed-and-destroyed" {
		return nil
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM agent_evaluation_endpoint_smoke_result_spool_payloads
		WHERE namespace_id=$1 AND plan_digest=$2 AND smoke_target_id=$3 AND invocation_id=$4 AND spool_ref=$5`,
		namespaceID, partition.PlanDigest, receipt.SmokeTargetID, receipt.InvocationID, receipt.SpoolRef)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return conflict("evaluation endpoint smoke spool destruction lost its encrypted payload fence")
	}
	return nil
}

func insertEvaluationEndpointSmokeValidationFailure(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	receipt evaluationEndpointSmokeValidationFailure,
) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_endpoint_smoke_validation_failure_receipts (
		namespace_id,plan_digest,repository_commit,receipt_id,smoke_target_id,smoke_target_digest,
		invocation_id,dispatch_intent_digest,transport_receipt_digest,spool_receipt_digest,
		validator_policy_digest,validation_category,finding_digest,observed_at,
		receipt_digest,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, receipt.ReceiptID,
		receipt.SmokeTargetID, receipt.SmokeTargetDigest, receipt.InvocationID,
		receipt.DispatchIntentDigest, receipt.TransportReceiptDigest, receipt.SpoolReceiptDigest,
		receipt.ValidatorPolicyDigest, receipt.ValidationCategory, receipt.FindingDigest, receipt.ObservedAt,
		receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes)
	return err
}

func insertEvaluationEndpointSmokeTerminal(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	receipt evaluationEndpointSmokeTerminalReceipt,
) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_endpoint_smoke_terminal_receipts (
		namespace_id,plan_digest,repository_commit,receipt_id,smoke_target_id,smoke_target_digest,
		endpoint_class,protocol_family,provider_configuration_id,model_id,immutable_model_version,
		model_lineage_digest,inference_configuration_digest,adapter_digest,pricing_authority_digest,
		response_spool_encryption_policy_digest,smoke_profile_digest,invocation_id,budget_reservation_id,
		demand_digest,settlement_digest,dispatch_intent_digest,transport_receipt_digest,request_digest,
		outcome,failure_category,provider_request_id,response_header_digest,response_digest,resolved_model_id,
		resolved_model_version,resolved_model_identity_digest,spool_receipt_digest,spool_disposition_receipt_digest,
		validation_failure_receipt_digest,usage_source_digest,cost_source_digest,usage_source_receipt_digest,
		cost_source_receipt_digest,pricing_snapshot_ref,receipt_digest,receipt_json,receipt_bytes,started_at,completed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42::jsonb,$43,$44,$45)`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, receipt.ReceiptID,
		receipt.SmokeTargetID, receipt.SmokeTargetDigest, receipt.EndpointClass, receipt.ProtocolFamily,
		receipt.ProviderConfigurationID, receipt.ModelID, receipt.ImmutableModelVersion,
		receipt.ModelLineageDigest, receipt.InferenceConfigurationDigest, receipt.AdapterDigest,
		receipt.PricingAuthorityDigest, receipt.ResponseSpoolEncryptionPolicyDigest, receipt.SmokeProfileDigest,
		receipt.InvocationID, receipt.BudgetReservationID, receipt.DemandDigest, receipt.SettlementDigest,
		receipt.DispatchIntentDigest, receipt.TransportReceiptDigest, receipt.RequestDigest, receipt.Outcome,
		nullableEvaluationAuthenticityString(receipt.FailureCategory), nullableEvaluationAuthenticityString(receipt.ProviderRequestID),
		nullableEvaluationAuthenticityString(receipt.ResponseHeaderDigest), nullableEvaluationAuthenticityString(receipt.ResponseDigest),
		nullableEvaluationAuthenticityString(receipt.ResolvedModelID), nullableEvaluationAuthenticityString(receipt.ResolvedModelVersion),
		nullableEvaluationAuthenticityString(receipt.ResolvedModelIdentityDigest), nullableEvaluationAuthenticityString(receipt.SpoolReceiptDigest),
		nullableEvaluationAuthenticityString(receipt.SpoolDispositionReceiptDigest), nullableEvaluationAuthenticityString(receipt.ValidationFailureReceiptDigest),
		nullableEvaluationAuthenticityString(receipt.UsageSourceDigest), nullableEvaluationAuthenticityString(receipt.CostSourceDigest),
		nullableEvaluationAuthenticityString(receipt.UsageSourceReceiptDigest), nullableEvaluationAuthenticityString(receipt.CostSourceReceiptDigest),
		nullableEvaluationAuthenticityString(receipt.PricingSnapshotRef), receipt.ReceiptDigest,
		string(receipt.ReceiptBytes), receipt.ReceiptBytes, receipt.StartedAt, receipt.CompletedAt)
	return err
}

func evaluationEndpointSmokeCommitRecord(namespaceID string, partition EvaluationPlanPartition, commit evaluationEndpointSmokeEvidenceCommit) EvaluationEndpointSmokeEvidenceCommitRecord {
	return EvaluationEndpointSmokeEvidenceCommitRecord{
		NamespaceID: namespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		ConfigurationDigest: commit.ConfigurationDigest, BudgetReservationID: commit.ReservationID,
		SettlementDigest: commit.Settlement.Digest, ReportDigest: commit.Report.ReportDigest,
		CommitDigest: commit.CommitDigest, CommitBytes: append([]byte(nil), commit.Canonical...), CommittedAt: commit.Report.CompletedAt,
	}
}

// CommitEvaluationEndpointSmokeEvidence is the single global join for all five
// endpoint-smoke targets, their global accounting sources, one budget
// settlement, the qualification report, and the exact replay acknowledgement.
func (repository *Repository) CommitEvaluationEndpointSmokeEvidence(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	commitBytes []byte,
) (EvaluationEndpointSmokeEvidenceCommitRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	commit, err := decodeEvaluationEndpointSmokeCommit(commitBytes)
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	if commit.PlanDigest != partition.PlanDigest || commit.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, conflict("evaluation endpoint smoke evidence belongs to another partition")
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	if err := validateEvaluationEndpointSmokeCommit(plan, commit); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	existingRecord, existingCommit, err := loadEvaluationEndpointSmokeCommitRecord(writeContext, tx, authority.NamespaceID, partition)
	if err == nil {
		if !bytes.Equal(existingCommit.Canonical, commit.Canonical) {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, conflict("evaluation endpoint smoke evidence commit replay drifted")
		}
		if err := tx.Commit(); err != nil {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
		}
		return existingRecord, true, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	if err := validateEvaluationEndpointSmokeJournalCommit(writeContext, tx, authority.NamespaceID, partition, plan, commit); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	for _, source := range commit.SourceReceipts {
		if err := validateEvaluationSourceBinding(plan, source); err != nil {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
		}
	}
	var ledgerRevision int64
	if err := tx.QueryRowContext(writeContext, `SELECT revision FROM agent_evaluation_budget_ledgers
		WHERE namespace_id=$1 AND plan_digest=$2 FOR UPDATE`, authority.NamespaceID, partition.PlanDigest).Scan(&ledgerRevision); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	var reservationRevision int64
	var demandBytes []byte
	var demandDigest string
	var reservedAt time.Time
	if err := tx.QueryRowContext(writeContext, `SELECT ledger_revision,demand_digest,demand_bytes,reserved_at
		FROM agent_evaluation_budget_reservations
		WHERE namespace_id=$1 AND plan_digest=$2 AND reservation_id=$3 FOR SHARE`, authority.NamespaceID,
		partition.PlanDigest, commit.ReservationID).Scan(&reservationRevision, &demandDigest, &demandBytes, &reservedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, ErrNotFound
		}
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	if reservationRevision > ledgerRevision || demandDigest != commit.DemandDigest ||
		!bytes.Equal(demandBytes, commit.DemandBytes) || !reservedAt.Equal(commit.ReservedAt) {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, conflict("evaluation endpoint smoke budget reservation drifted")
	}
	var settlementExists bool
	if err := tx.QueryRowContext(writeContext, `SELECT EXISTS(SELECT 1 FROM agent_evaluation_budget_settlements
		WHERE namespace_id=$1 AND plan_digest=$2 AND reservation_id=$3)`, authority.NamespaceID,
		partition.PlanDigest, commit.ReservationID).Scan(&settlementExists); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	if settlementExists {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, conflict("evaluation endpoint smoke evidence has a partial budget settlement")
	}
	nextRevision := ledgerRevision + 1
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_budget_settlements (
		namespace_id,plan_digest,reservation_id,ledger_revision,settlement_digest,settlement_json,settlement_bytes,settled_at
	) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`, authority.NamespaceID, partition.PlanDigest,
		commit.ReservationID, nextRevision, commit.Settlement.Digest, string(commit.SettlementBytes),
		commit.SettlementBytes, commit.Settlement.SettledAt); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	for _, transport := range commit.TransportReceipts {
		if transport.ProviderRequestID == "" {
			continue
		}
		var intent *evaluationEndpointSmokeDispatchIntent
		for _, candidate := range commit.DispatchIntents {
			if candidate.InvocationID == transport.InvocationID {
				copy := candidate
				intent = &copy
				break
			}
		}
		if intent == nil {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, conflict("evaluation endpoint smoke transport has no dispatch owner")
		}
		if err := registerEvaluationProviderRequest(writeContext, tx, authority.NamespaceID, partition,
			transport.ProviderConfigurationID, transport.ProviderRequestID, "endpoint-smoke", intent.SmokeTargetID,
			transport.CompletedAt); err != nil {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
		}
	}
	for _, source := range commit.SourceReceipts {
		if err := insertEvaluationEndpointSmokeSource(writeContext, tx, authority.NamespaceID, partition, source); err != nil {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
		}
	}
	for _, disposition := range commit.Dispositions {
		if err := insertEvaluationEndpointSmokeDisposition(writeContext, tx, authority.NamespaceID, partition, disposition); err != nil {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
		}
	}
	for _, validationFailure := range commit.ValidationFailures {
		if err := insertEvaluationEndpointSmokeValidationFailure(writeContext, tx, authority.NamespaceID, partition, validationFailure); err != nil {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
		}
	}
	for _, terminal := range commit.TerminalReceipts {
		if err := insertEvaluationEndpointSmokeTerminal(writeContext, tx, authority.NamespaceID, partition, terminal); err != nil {
			return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
		}
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_endpoint_smoke_qualification_reports (
		namespace_id,plan_digest,repository_commit,endpoint_smoke_dispatch_intent_set_digest,
		endpoint_smoke_transport_receipt_set_digest,endpoint_smoke_result_spool_receipt_set_digest,
		endpoint_smoke_result_spool_disposition_receipt_set_digest,endpoint_smoke_receipt_set_digest,
		qualified_target_count,budget_reservation_id,outcome,failure_code,completed_at,
		report_digest,report_json,report_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, commit.Report.DispatchIntentSetDigest,
		commit.Report.TransportReceiptSetDigest, commit.Report.ResultSpoolReceiptSetDigest,
		commit.Report.ResultSpoolDispositionReceiptSetDigest, commit.Report.EndpointSmokeReceiptSetDigest,
		commit.Report.QualifiedTargetCount, commit.ReservationID, commit.Report.Outcome, commit.Report.FailureCode,
		commit.Report.CompletedAt, commit.Report.ReportDigest, string(commit.Report.Canonical), commit.Report.Canonical); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	validationIDs := make([]string, len(commit.ValidationFailures))
	validationDigests := make([]string, len(commit.ValidationFailures))
	for index, receipt := range commit.ValidationFailures {
		validationIDs[index] = receipt.SmokeTargetID + "\x00" + receipt.ReceiptID
		validationDigests[index] = receipt.ReceiptDigest
	}
	validationSetDigest, err := evaluationEndpointSmokeSetDigest(
		"endpointSmokeValidationFailureReceiptDigests", validationIDs, validationDigests,
	)
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	sourceDigests := make([]string, len(commit.SourceReceipts))
	for index, source := range commit.SourceReceipts {
		sourceDigests[index] = source.ReceiptDigest
	}
	sourceSetDigest, err := evaluationDigestSequence(sourceDigests)
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_endpoint_smoke_evidence_commits (
		namespace_id,plan_digest,repository_commit,configuration_digest,budget_reservation_id,demand_digest,
		settlement_digest,endpoint_smoke_dispatch_intent_set_digest,endpoint_smoke_transport_receipt_set_digest,
		endpoint_smoke_result_spool_receipt_set_digest,endpoint_smoke_result_spool_disposition_receipt_set_digest,
		endpoint_smoke_validation_failure_receipt_set_digest,endpoint_smoke_receipt_set_digest,source_receipt_set_digest,
		dispatch_intent_count,transport_receipt_count,result_spool_receipt_count,
		result_spool_disposition_receipt_count,validation_failure_receipt_count,endpoint_smoke_receipt_count,
		source_receipt_count,report_digest,commit_digest,commit_json,commit_bytes,committed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25,$26)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, commit.ConfigurationDigest,
		commit.ReservationID, commit.DemandDigest, commit.Settlement.Digest, commit.Report.DispatchIntentSetDigest,
		commit.Report.TransportReceiptSetDigest, commit.Report.ResultSpoolReceiptSetDigest,
		commit.Report.ResultSpoolDispositionReceiptSetDigest, validationSetDigest, commit.Report.EndpointSmokeReceiptSetDigest,
		sourceSetDigest, len(commit.DispatchIntents), len(commit.TransportReceipts), len(commit.SpoolReceipts),
		len(commit.Dispositions), len(commit.ValidationFailures), len(commit.TerminalReceipts), len(commit.SourceReceipts),
		commit.Report.ReportDigest, commit.CommitDigest, string(commit.Canonical), commit.Canonical, commit.Report.CompletedAt); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	update, err := tx.ExecContext(writeContext, `UPDATE agent_evaluation_budget_ledgers SET revision=$3,updated_at=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND revision=$5`, authority.NamespaceID, partition.PlanDigest,
		nextRevision, commit.Settlement.SettledAt, ledgerRevision)
	if err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	if affected, err := update.RowsAffected(); err != nil || affected != 1 {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, conflict("evaluation endpoint smoke budget CAS was lost")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationEndpointSmokeEvidenceCommitRecord{}, false, err
	}
	return evaluationEndpointSmokeCommitRecord(authority.NamespaceID, partition, commit), false, nil
}
