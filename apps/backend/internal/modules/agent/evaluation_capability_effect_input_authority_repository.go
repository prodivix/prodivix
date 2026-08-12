package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationCapabilityEffectInputAuthorityRepository interface {
	StoreEvaluationCapabilityEffectRequestRefAuthority(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		evaluationCapabilityEffectRequestRefAuthorityRequest,
		time.Time,
	) (EvaluationCapabilityEffectRequestRefAuthorityRecord, bool, error)
	StoreEvaluationCapabilityEffectCurrentTurnEvent(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		evaluationCapabilityEffectCurrentTurnEventRequest,
	) (EvaluationCapabilityEffectCurrentTurnEventRecord, bool, error)
	ResolveEvaluationCapabilityEffectInputAuthority(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		evaluationCapabilityEffectInputRegistryRequest,
	) (EvaluationCapabilityEffectInputRegistryRecord, bool, error)
}

func evaluationCapabilityEffectSourceHandleDigest(fact map[string]any, factKind string) (string, error) {
	digest := stringMember(fact, "factDigest")
	if !evaluationDigestPattern.MatchString(digest) || !oneOfString(
		factKind, "provider-job-receipt", "provider-cache-receipt", "opaque-continuation",
	) {
		return "", ErrConflict
	}
	return digest, nil
}

func evaluationCapabilityEffectObservationFactByHandle(
	record EvaluationProviderCapabilityObservationReceiptRecord,
	factKind string,
	handleDigest string,
) (map[string]any, error) {
	rawFacts, _ := record.Value["facts"].([]any)
	var selected map[string]any
	for _, raw := range rawFacts {
		fact, _ := raw.(map[string]any)
		if stringMember(fact, "factKind") != factKind {
			continue
		}
		candidate, err := evaluationCapabilityEffectSourceHandleDigest(fact, factKind)
		if err != nil {
			return nil, err
		}
		if candidate != handleDigest {
			continue
		}
		if selected != nil {
			return nil, conflict("capability effect source handle is ambiguous")
		}
		selected = fact
	}
	if selected == nil {
		return nil, ErrNotFound
	}
	return selected, nil
}

func evaluationCapabilityEffectPriorSourceAvailable(bindingKind string, fact map[string]any) bool {
	if bindingKind != "provider-job" {
		return true
	}
	value, ok := objectMember(fact, "value")
	return ok && stringMember(value, "callbackAuthority") == "active" &&
		oneOfString(stringMember(value, "phase"), "submitting", "accepted", "running") && value["outcome"] == nil
}

func evaluationCapabilityEffectPlanTarget(
	plan evaluationPlanFact,
	targetID string,
) (map[string]any, map[string]any, map[string]any, error) {
	rawTargets, ok := plan.Value["capabilityQualificationTargets"].([]any)
	if !ok {
		return nil, nil, nil, ErrInvalid
	}
	var target map[string]any
	for _, raw := range rawTargets {
		candidate, candidateOK := raw.(map[string]any)
		if candidateOK && stringMember(candidate, "targetId") == targetID {
			if target != nil {
				return nil, nil, nil, ErrConflict
			}
			target = candidate
		}
	}
	optionalAuthority, optionalOK := objectMember(target, "optionalCapabilitySupportAuthority")
	runtimeAuthority, runtimeOK := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
	if target == nil || !optionalOK || !runtimeOK || stringMember(optionalAuthority, "supportExpectation") != "required" {
		return nil, nil, nil, conflict("capability effect input authority requires a frozen supported optional target")
	}
	return target, optionalAuthority, runtimeAuthority, nil
}

func validateEvaluationCapabilityEffectRequestRefPlanBinding(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationCapabilityEffectRequestRefAuthorityRequest,
	now time.Time,
) error {
	var planBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT plan_bytes FROM agent_evaluation_plans
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
	).Scan(&planBytes); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	plan, err := decodeEvaluationPlan(planBytes)
	if err != nil {
		return err
	}
	authorization, err := authorizeEvaluationAttemptDescriptor(planBytes, partition, request.DescriptorBytes)
	if err != nil {
		return err
	}
	if authorization.AttemptID != request.AttemptID || authorization.DescriptorDigest != request.DescriptorDigest {
		return conflict("capability effect request-ref descriptor drifted from the frozen schedule")
	}
	target, optionalAuthority, runtimeAuthority, err := evaluationCapabilityEffectPlanTarget(plan, authorization.TargetID)
	if err != nil {
		return err
	}
	if stringMember(optionalAuthority, "capabilityId") != request.CapabilityID ||
		stringMember(target, "protocolFamily") != request.ProtocolFamily ||
		stringMember(target, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(target, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(runtimeAuthority, "protocolFamily") != request.ProtocolFamily ||
		stringMember(runtimeAuthority, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(runtimeAuthority, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(runtimeAuthority, "adapterDigest") != request.AdapterDigest ||
		stringMember(runtimeAuthority, "authorityDigest") != request.RuntimeFactSourceAuthorityDigest ||
		stringMember(runtimeAuthority, "registrationReceiptDigest") != request.RegistrationReceiptDigest {
		return conflict("capability effect request-ref runtime source authority drifted from its target")
	}
	if err := requireEvaluationPlanRuntimeFactSourceRegistration(ctx, tx, authority, plan, target, optionalAuthority); err != nil {
		return err
	}
	now = now.UTC().Truncate(time.Millisecond)
	if request.IssuedAt.Before(plan.PlannedAt) || request.IssuedAt.After(now.Add(30*time.Second)) ||
		request.IssuedAt.Before(now.Add(-30*time.Second)) || !request.ExpiresAt.After(now) ||
		request.ExpiresAt.After(plan.ExpiresAt) {
		return conflict("capability effect request-ref is outside its frozen plan window")
	}
	return nil
}

func queryEvaluationCapabilityEffectRequestRefAuthority(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	field string,
	value string,
	forShare bool,
) (EvaluationCapabilityEffectRequestRefAuthorityRecord, error) {
	column := "request_digest"
	if field == "receipt" {
		column = "receipt_digest"
	}
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	var requestBytes, receiptBytes []byte
	var selectedObservationDigest, selectedHandleDigest sql.NullString
	query := `SELECT request_bytes,receipt_bytes,selected_source_observation_receipt_digest,selected_source_handle_digest
		FROM agent_evaluation_capability_effect_request_ref_authorities
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND ` + column + `=$4` + lock
	err := queryer.QueryRowContext(ctx, query, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, value).
		Scan(&requestBytes, &receiptBytes, &selectedObservationDigest, &selectedHandleDigest)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, err
	}
	record, err := decodeEvaluationCapabilityEffectRequestRefAuthorityReceipt(receiptBytes)
	if err != nil || record.NamespaceID != authority.NamespaceID || record.PlanDigest != partition.PlanDigest ||
		record.RepositoryCommit != partition.RepositoryCommit {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, err
	}
	record.RequestBytes = append([]byte(nil), requestBytes...)
	record.ReceiptBytes = append([]byte(nil), receiptBytes...)
	record.SelectedSourceObservationReceiptDigest = selectedObservationDigest.String
	record.SelectedSourceHandleDigest = selectedHandleDigest.String
	return record, nil
}

func selectEvaluationCapabilityEffectPriorSource(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationCapabilityEffectRequestRefAuthorityRequest,
) (string, string, error) {
	if request.BindingKind == "hosted-retrieval-query" {
		return "", "", nil
	}
	profile := evaluationCapabilityEffectInputProfiles[request.BindingKind]
	observations, err := queryEvaluationProviderCapabilityObservationReceipts(
		ctx, queryer, authority.NamespaceID, partition, request.AttemptID,
	)
	if err != nil {
		return "", "", err
	}
	selectedTurn := int64(-1)
	selectedObservationDigest, selectedHandleDigest := "", ""
	var selectedFact map[string]any
	for _, record := range observations {
		if record.TurnIndex >= request.TurnIndex || record.TurnIndex < selectedTurn {
			continue
		}
		rawFacts, _ := record.Value["facts"].([]any)
		for _, raw := range rawFacts {
			fact, _ := raw.(map[string]any)
			if stringMember(fact, "factKind") != profile.SourceFactKind ||
				!evaluationDigestPattern.MatchString(stringMember(fact, "factDigest")) {
				continue
			}
			handleDigest, handleErr := evaluationCapabilityEffectSourceHandleDigest(fact, profile.SourceFactKind)
			if handleErr != nil {
				return "", "", handleErr
			}
			if record.TurnIndex == selectedTurn && selectedHandleDigest != "" {
				return "", "", conflict("capability effect prior source fact is ambiguous at the latest sealed turn")
			}
			selectedTurn, selectedObservationDigest = record.TurnIndex, record.ReceiptDigest
			selectedHandleDigest = handleDigest
			selectedFact = fact
		}
	}
	if selectedObservationDigest == "" || selectedHandleDigest == "" ||
		!evaluationCapabilityEffectPriorSourceAvailable(request.BindingKind, selectedFact) {
		return "", "", ErrNotFound
	}
	return selectedObservationDigest, selectedHandleDigest, nil
}

func (repository *Repository) StoreEvaluationCapabilityEffectRequestRefAuthority(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationCapabilityEffectRequestRefAuthorityRequest,
	now time.Time,
) (EvaluationCapabilityEffectRequestRefAuthorityRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	if err := validateEvaluationPartition(partition); err != nil || authority.NamespaceID != request.NamespaceID || now.IsZero() {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, ErrInvalid
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := validateEvaluationCapabilityEffectRequestRefPlanBinding(writeContext, tx, authority, partition, request, now); err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	receipt, err := createEvaluationCapabilityEffectRequestRefAuthorityReceipt(request)
	if err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	existing, err := queryEvaluationCapabilityEffectRequestRefAuthority(writeContext, tx, authority, partition, "request", request.RequestDigest, true)
	if err == nil {
		if existing.ReceiptDigest != receipt.ReceiptDigest || !bytes.Equal(existing.RequestBytes, request.Bytes) ||
			!bytes.Equal(existing.ReceiptBytes, receipt.ReceiptBytes) {
			return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, ErrConflict
		}
		if err := requireEvaluationCapabilityEffectSourceConsumptionClaimReplayTx(writeContext, tx, existing); err != nil {
			return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	selectedObservationDigest, selectedHandleDigest, err := selectEvaluationCapabilityEffectPriorSource(
		writeContext, tx, authority, partition, request,
	)
	if err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	receipt.SelectedSourceObservationReceiptDigest = selectedObservationDigest
	receipt.SelectedSourceHandleDigest = selectedHandleDigest
	var sourceClaim *evaluationCapabilityEffectSourceConsumptionClaim
	if request.BindingKind != "hosted-retrieval-query" {
		claim, claimErr := createEvaluationCapabilityEffectSourceConsumptionClaim(
			request, receipt.ReceiptDigest, selectedHandleDigest,
		)
		if claimErr != nil {
			return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, claimErr
		}
		sourceClaim = &claim
	}
	var turnCount, attemptCount int64
	if err := tx.QueryRowContext(writeContext, `SELECT
		COUNT(*) FILTER (WHERE turn_index=$5), COUNT(*)
		FROM agent_evaluation_capability_effect_request_ref_authorities
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND attempt_id=$4`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, request.AttemptID, request.TurnIndex,
	).Scan(&turnCount, &attemptCount); err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	if turnCount >= maximumEvaluationProductionCapabilityEffectRefsPerTurn ||
		attemptCount >= maximumEvaluationProductionCapabilityEffectRefsPerAttempt {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, conflict("capability effect request-ref authority capacity was exhausted")
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_capability_effect_request_ref_authorities (
		namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,attempt_id,descriptor_digest,
		turn_index,invocation_id,binding_kind,capability_id,tool_id,target_ref,protocol_family,
		provider_configuration_id,model_lineage_digest,adapter_digest,runtime_fact_source_authority_digest,
		registration_receipt_digest,issued_at,expires_at,authority_digest,request_ref,
		selected_source_observation_receipt_digest,selected_source_handle_digest,
		request_json,request_bytes,receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
		NULLIF($24,''),NULLIF($25,''),$26::jsonb,$27,$28::jsonb,$29,$30) ON CONFLICT DO NOTHING`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, request.RequestDigest, receipt.ReceiptDigest,
		request.AttemptID, request.DescriptorDigest, request.TurnIndex, request.InvocationID, request.BindingKind,
		request.CapabilityID, request.ToolID, request.TargetRef, request.ProtocolFamily, request.ProviderConfigurationID,
		request.ModelLineageDigest, request.AdapterDigest, request.RuntimeFactSourceAuthorityDigest,
		request.RegistrationReceiptDigest, request.IssuedAt, request.ExpiresAt, receipt.AuthorityDigest, receipt.RequestRef,
		selectedObservationDigest, selectedHandleDigest, string(request.Bytes), request.Bytes,
		string(receipt.ReceiptBytes), receipt.ReceiptBytes, now.UTC().Truncate(time.Millisecond),
	)
	if err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted != 1 {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	if sourceClaim != nil {
		if err := storeEvaluationCapabilityEffectSourceConsumptionClaimTx(writeContext, tx, *sourceClaim); err != nil {
			return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityEffectRequestRefAuthorityRecord{}, false, err
	}
	return receipt, false, nil
}

func queryEvaluationCapabilityEffectCurrentTurnEvent(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	requestDigest string,
	forShare bool,
) (EvaluationCapabilityEffectCurrentTurnEventRecord, error) {
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	var receiptBytes, normalizedEventsBytes, selectedEventBytes []byte
	err := queryer.QueryRowContext(ctx, `SELECT receipt_bytes,normalized_events_bytes,selected_event_bytes
		FROM agent_evaluation_capability_effect_current_turn_events
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND request_digest=$4`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, requestDigest,
	).Scan(&receiptBytes, &normalizedEventsBytes, &selectedEventBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, err
	}
	receipt, err := decodeCanonicalEvaluationObject(receiptBytes, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, err
	}
	turnIndex, turnOK := integerMember(receipt, "turnIndex")
	recordedAt, recordedErr := parseEvaluationServiceInstant(stringMember(receipt, "recordedAt"))
	base := cloneEvaluationObject(receipt)
	delete(base, "receiptDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !turnOK || recordedErr != nil || digestErr != nil || digest != stringMember(receipt, "receiptDigest") {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, ErrConflict
	}
	return EvaluationCapabilityEffectCurrentTurnEventRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		AttemptID: stringMember(receipt, "attemptId"), DescriptorDigest: stringMember(receipt, "descriptorDigest"), TurnIndex: turnIndex,
		InvocationID: stringMember(receipt, "invocationId"), RequestRefAuthorityReceiptDigest: stringMember(receipt, "requestRefAuthorityReceiptDigest"),
		RequestRef: stringMember(receipt, "requestRef"), TargetRef: stringMember(receipt, "targetRef"),
		ProviderRequestDigest: stringMember(receipt, "providerRequestDigest"), ResponseDigest: stringMember(receipt, "responseDigest"),
		DispatchIntentDigest: stringMember(receipt, "dispatchIntentDigest"), TransportReceiptDigest: stringMember(receipt, "transportReceiptDigest"),
		ResultSpoolReceiptDigest: stringMember(receipt, "resultSpoolReceiptDigest"), NormalizedEventSetDigest: stringMember(receipt, "normalizedEventSetDigest"),
		SelectedEventDigest: stringMember(receipt, "selectedEventDigest"), ProviderToolCallID: stringMember(receipt, "providerToolCallId"),
		ToolID: stringMember(receipt, "toolId"), ArgumentsDigest: stringMember(receipt, "argumentsDigest"), RecordedAt: recordedAt,
		ReceiptDigest: digest, NormalizedEventsBytes: append([]byte(nil), normalizedEventsBytes...),
		SelectedEventBytes: append([]byte(nil), selectedEventBytes...), ReceiptBytes: append([]byte(nil), receiptBytes...),
	}, nil
}

func (repository *Repository) StoreEvaluationCapabilityEffectCurrentTurnEvent(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationCapabilityEffectCurrentTurnEventRequest,
) (EvaluationCapabilityEffectCurrentTurnEventRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	requestRef, err := queryEvaluationCapabilityEffectRequestRefAuthority(
		writeContext, tx, authority, partition, "receipt", request.RequestRefAuthorityReceiptDigest, true,
	)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	if requestRef.BindingKind != "hosted-retrieval-query" || requestRef.RequestRef != request.RequestRef ||
		requestRef.TargetRef != request.TargetRef || requestRef.AttemptID != request.AttemptID ||
		requestRef.DescriptorDigest != request.DescriptorDigest || requestRef.TurnIndex != request.TurnIndex ||
		requestRef.InvocationID != request.InvocationID || request.RecordedAt.Before(requestRef.IssuedAt) ||
		request.RecordedAt.After(requestRef.ExpiresAt) {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, ErrConflict
	}
	selected, _, err := decodeEvaluationJSONObject(request.SelectedEventBytes, maximumEvaluationCapabilityEffectNormalizedEventSetBytes)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	payload, _ := objectMember(selected, "payload")
	if requestRef.ProtocolFamily == "openai-responses" {
		if !exactEvaluationKeys(payload, []string{"itemId", "name", "arguments", "argumentsDigest"}) {
			return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, ErrConflict
		}
	} else if !exactEvaluationKeys(payload, []string{"id", "name", "arguments", "argumentsDigest"}) {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, ErrConflict
	}
	intent, err := loadEvaluationTransportDispatchIntent(writeContext, tx, authority.NamespaceID, partition, request.AttemptID, request.TurnIndex, true)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	transport, err := loadEvaluationTransportReceipt(writeContext, tx, authority.NamespaceID, partition, request.AttemptID, request.TurnIndex)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	spool, err := loadEvaluationProviderResultSpoolReceipt(writeContext, tx, authority.NamespaceID, partition, request.AttemptID, request.TurnIndex)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	if intent.DescriptorDigest != request.DescriptorDigest || intent.InvocationID != request.InvocationID ||
		intent.ProtocolFamily != requestRef.ProtocolFamily || intent.ProviderConfigurationID != requestRef.ProviderConfigurationID ||
		intent.ModelLineageDigest != requestRef.ModelLineageDigest || transport.IntentDigest != intent.IntentDigest ||
		transport.InvocationID != request.InvocationID || transport.ProviderConfigurationID != requestRef.ProviderConfigurationID ||
		spool.DescriptorDigest != request.DescriptorDigest || spool.InvocationID != request.InvocationID ||
		spool.DispatchIntentDigest != intent.IntentDigest || spool.TransportReceiptDigest != transport.ReceiptDigest ||
		spool.NormalizedEventSetDigest != request.NormalizedEventSetDigest ||
		spool.ResponseDigest == "" || requestRef.IssuedAt.After(intent.CreatedAt) || request.RecordedAt.Before(transport.CompletedAt) {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, conflict("capability effect current-turn event drifted from durable provider transport")
	}
	receipt, err := createEvaluationCapabilityEffectCurrentTurnEventReceipt(
		request, intent.RequestDigest, spool.ResponseDigest, intent.IntentDigest, transport.ReceiptDigest, spool.ReceiptDigest,
	)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	existing, err := queryEvaluationCapabilityEffectCurrentTurnEvent(writeContext, tx, authority, partition, request.RequestDigest, true)
	if err == nil {
		if existing.ReceiptDigest != receipt.ReceiptDigest || !bytes.Equal(existing.ReceiptBytes, receipt.ReceiptBytes) ||
			!bytes.Equal(existing.NormalizedEventsBytes, request.NormalizedEventsBytes) ||
			!bytes.Equal(existing.SelectedEventBytes, request.SelectedEventBytes) {
			return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_capability_effect_current_turn_events (
		namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,request_ref_authority_receipt_digest,
		request_ref,target_ref,attempt_id,descriptor_digest,turn_index,invocation_id,provider_request_digest,response_digest,
		dispatch_intent_digest,transport_receipt_digest,result_spool_receipt_digest,normalized_event_set_digest,
		selected_event_digest,provider_tool_call_id,tool_id,arguments_digest,recorded_at,
		request_json,request_bytes,normalized_events_json,normalized_events_bytes,selected_event_json,selected_event_bytes,
		receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
		$24::jsonb,$25,$26::jsonb,$27,$28::jsonb,$29,$30::jsonb,$31) ON CONFLICT DO NOTHING`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, request.RequestDigest, receipt.ReceiptDigest,
		request.RequestRefAuthorityReceiptDigest, request.RequestRef, request.TargetRef, request.AttemptID,
		request.DescriptorDigest, request.TurnIndex, request.InvocationID, receipt.ProviderRequestDigest, receipt.ResponseDigest,
		receipt.DispatchIntentDigest, receipt.TransportReceiptDigest, receipt.ResultSpoolReceiptDigest,
		receipt.NormalizedEventSetDigest, receipt.SelectedEventDigest, receipt.ProviderToolCallID, receipt.ToolID,
		receipt.ArgumentsDigest, receipt.RecordedAt, string(request.Bytes), request.Bytes,
		string(request.NormalizedEventsBytes), request.NormalizedEventsBytes, string(request.SelectedEventBytes),
		request.SelectedEventBytes, string(receipt.ReceiptBytes), receipt.ReceiptBytes,
	)
	if err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted != 1 {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityEffectCurrentTurnEventRecord{}, false, err
	}
	return receipt, false, nil
}

func evaluationCapabilityEffectRequestRefAuthorityValue(
	record EvaluationCapabilityEffectRequestRefAuthorityRecord,
) (map[string]any, error) {
	value, err := decodeCanonicalEvaluationObject(record.ReceiptBytes, maximumEvaluationCapabilityEffectInputAuthorityBytes)
	if err != nil {
		return nil, err
	}
	return value, nil
}

func evaluationCapabilityEffectRegistrySourceFromCurrentEvent(
	requestRef EvaluationCapabilityEffectRequestRefAuthorityRecord,
	event EvaluationCapabilityEffectCurrentTurnEventRecord,
) (map[string]any, error) {
	authorityValue, err := evaluationCapabilityEffectRequestRefAuthorityValue(requestRef)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"requestRefAuthority": authorityValue, "sourceAttemptId": event.AttemptID,
		"sourceTurnIndex": event.TurnIndex, "sourceInvocationId": event.InvocationID,
		"sourceProviderRequestDigest": event.ProviderRequestDigest, "sourceResponseDigest": event.ResponseDigest,
		"sourceDispatchIntentDigest": event.DispatchIntentDigest, "sourceTransportReceiptDigest": event.TransportReceiptDigest,
		"sourceResultSpoolReceiptDigest": event.ResultSpoolReceiptDigest,
		"sourceNormalizedEventSetDigest": event.NormalizedEventSetDigest,
		"sourceObservationReceiptDigest": nil, "sourceFactKind": "provider-event",
		"sourceProviderEventType": "tool-call", "sourceProviderToolCallId": event.ProviderToolCallID,
		"sourceToolId": event.ToolID, "sourceArgumentsDigest": event.ArgumentsDigest,
		"sourceHandleDigest":    event.SelectedEventDigest,
		"stateVaultSealRequest": nil, "stateVaultSealReceipt": nil,
	}, nil
}

func evaluationCapabilityEffectRegistrySourceFromObservation(
	requestRef EvaluationCapabilityEffectRequestRefAuthorityRecord,
	record EvaluationProviderCapabilityObservationReceiptRecord,
	vaultRecord *EvaluationNativeProviderStateVaultRecord,
) (map[string]any, error) {
	authorityValue, err := evaluationCapabilityEffectRequestRefAuthorityValue(requestRef)
	if err != nil {
		return nil, err
	}
	var stateVaultSealRequest any
	var stateVaultSealReceipt any
	if vaultRecord != nil {
		stateVaultSealRequest = vaultRecord.SealRequest.Value
		stateVaultSealReceipt = vaultRecord.SealReceipt.Value
	}
	return map[string]any{
		"requestRefAuthority": authorityValue, "sourceAttemptId": record.AttemptID,
		"sourceTurnIndex": record.TurnIndex, "sourceInvocationId": record.InvocationID,
		"sourceProviderRequestDigest": record.RequestDigest, "sourceResponseDigest": record.ResponseDigest,
		"sourceDispatchIntentDigest": record.DispatchIntentDigest, "sourceTransportReceiptDigest": record.TransportReceiptDigest,
		"sourceResultSpoolReceiptDigest": record.ResultSpoolReceiptDigest,
		"sourceNormalizedEventSetDigest": record.NormalizedEventSetDigest,
		"sourceObservationReceiptDigest": record.ReceiptDigest, "sourceFactKind": evaluationCapabilityEffectInputProfiles[requestRef.BindingKind].SourceFactKind,
		"sourceProviderEventType": nil, "sourceProviderToolCallId": nil, "sourceToolId": nil,
		"sourceArgumentsDigest": nil, "sourceHandleDigest": requestRef.SelectedSourceHandleDigest,
		"stateVaultSealRequest": stateVaultSealRequest, "stateVaultSealReceipt": stateVaultSealReceipt,
	}, nil
}

func validateEvaluationCapabilityEffectStatefulBootstrapSource(
	requestRef EvaluationCapabilityEffectRequestRefAuthorityRecord,
	observation EvaluationProviderCapabilityObservationReceiptRecord,
	fact map[string]any,
	bootstrap EvaluationNativeOptionalBootstrapSourceRecord,
) error {
	if !oneOfString(requestRef.BindingKind, "provider-job", "opaque-continuation") {
		return ErrInvalid
	}
	expectedProfileID := "g4-provider-background-job"
	if requestRef.BindingKind == "opaque-continuation" {
		expectedProfileID = "g4-provider-reasoning-continuation"
	}
	factBytes, err := canonicaljson.Bytes(fact)
	if err != nil {
		return ErrInvalid
	}
	if bootstrap.Outcome != "observed" || bootstrap.AttemptID != observation.AttemptID ||
		bootstrap.AttemptID != requestRef.AttemptID || bootstrap.DescriptorDigest != observation.DescriptorDigest ||
		bootstrap.DescriptorDigest != requestRef.DescriptorDigest || bootstrap.TurnIndex != observation.TurnIndex ||
		bootstrap.TurnIndex >= requestRef.TurnIndex || bootstrap.InvocationID != observation.InvocationID ||
		bootstrap.ProviderRequestDigest != observation.RequestDigest ||
		bootstrap.ProviderResponseDigest != observation.ResponseDigest ||
		bootstrap.DispatchIntentDigest != observation.DispatchIntentDigest ||
		bootstrap.TransportReceiptDigest != observation.TransportReceiptDigest ||
		bootstrap.ResultSpoolReceiptDigest != observation.ResultSpoolReceiptDigest ||
		bootstrap.NormalizedEventSetDigest != observation.NormalizedEventSetDigest ||
		bootstrap.ProtocolFamily != requestRef.ProtocolFamily ||
		bootstrap.ProviderConfigurationID != requestRef.ProviderConfigurationID ||
		bootstrap.ModelLineageDigest != requestRef.ModelLineageDigest ||
		bootstrap.AdapterDigest != requestRef.AdapterDigest ||
		bootstrap.CapabilityProfileID != expectedProfileID || bootstrap.CapabilityID != requestRef.CapabilityID ||
		bootstrap.RuntimeFactSourceAuthorityDigest != requestRef.RuntimeFactSourceAuthorityDigest ||
		bootstrap.RegistrationReceiptDigest != requestRef.RegistrationReceiptDigest ||
		bootstrap.FactKind != stringMember(fact, "factKind") ||
		bootstrap.FactDigest != stringMember(fact, "factDigest") ||
		bootstrap.FactDigest != requestRef.SelectedSourceHandleDigest ||
		!bootstrap.ObservedAt.Equal(observation.ObservedAt) || !bytes.Equal(bootstrap.FactBytes, factBytes) {
		return conflict("capability effect input authority bootstrap source drifted")
	}
	if requestRef.BindingKind == "provider-job" {
		value, ok := objectMember(fact, "value")
		if !ok || stringMember(value, "callbackAuthority") != "active" ||
			!oneOfString(stringMember(value, "phase"), "accepted", "running") || value["outcome"] != nil {
			return conflict("capability effect input authority Provider job source is not active")
		}
	}
	return nil
}

func queryEvaluationCapabilityEffectInputRegistry(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	requestDigest string,
	forShare bool,
) (EvaluationCapabilityEffectInputRegistryRecord, error) {
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	var receiptBytes []byte
	err := queryer.QueryRowContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_capability_effect_input_authority_registry_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND request_digest=$4`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, requestDigest,
	).Scan(&receiptBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityEffectInputRegistryRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, err
	}
	record, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(receiptBytes)
	if err != nil || record.NamespaceID != authority.NamespaceID || record.PlanDigest != partition.PlanDigest ||
		record.RepositoryCommit != partition.RepositoryCommit {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityEffectInputRegistryRecord{}, err
	}
	return record, nil
}

func (repository *Repository) ResolveEvaluationCapabilityEffectInputAuthority(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationCapabilityEffectInputRegistryRequest,
) (EvaluationCapabilityEffectInputRegistryRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	requestRef, err := queryEvaluationCapabilityEffectRequestRefAuthority(
		writeContext, tx, authority, partition, "receipt", request.RequestRefAuthorityReceiptDigest, true,
	)
	if err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	if requestRef.RequestRef != request.RequestRef || requestRef.TargetRef != request.TargetRef ||
		request.RequestedAt.Before(requestRef.IssuedAt) || request.RequestedAt.After(requestRef.ExpiresAt) {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, ErrConflict
	}
	existing, err := queryEvaluationCapabilityEffectInputRegistry(writeContext, tx, authority, partition, request.RequestDigest, true)
	if err == nil {
		if existing.RequestRefAuthorityReceiptDigest != requestRef.ReceiptDigest || existing.RequestRef != request.RequestRef ||
			existing.TargetRef != request.TargetRef {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	var source map[string]any
	if requestRef.BindingKind == "hosted-retrieval-query" {
		var eventRequestDigest string
		err := tx.QueryRowContext(writeContext, `SELECT request_digest
			FROM agent_evaluation_capability_effect_current_turn_events
			WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
				AND request_ref_authority_receipt_digest=$4 FOR SHARE`, authority.NamespaceID,
			partition.PlanDigest, partition.RepositoryCommit, requestRef.ReceiptDigest).Scan(&eventRequestDigest)
		if errors.Is(err, sql.ErrNoRows) {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, ErrNotFound
		}
		if err != nil {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
		}
		event, err := queryEvaluationCapabilityEffectCurrentTurnEvent(writeContext, tx, authority, partition, eventRequestDigest, true)
		if err != nil {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
		}
		source, err = evaluationCapabilityEffectRegistrySourceFromCurrentEvent(requestRef, event)
		if err != nil {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
		}
	} else {
		if !evaluationDigestPattern.MatchString(requestRef.SelectedSourceObservationReceiptDigest) ||
			!evaluationDigestPattern.MatchString(requestRef.SelectedSourceHandleDigest) {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, ErrConflict
		}
		observations, err := queryEvaluationProviderCapabilityObservationReceipts(
			writeContext, tx, authority.NamespaceID, partition, requestRef.AttemptID,
		)
		if err != nil {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
		}
		profile := evaluationCapabilityEffectInputProfiles[requestRef.BindingKind]
		var selected *EvaluationProviderCapabilityObservationReceiptRecord
		var selectedFact map[string]any
		for index := range observations {
			candidate := &observations[index]
			if candidate.ReceiptDigest != requestRef.SelectedSourceObservationReceiptDigest ||
				candidate.TurnIndex >= requestRef.TurnIndex {
				continue
			}
			fact, factErr := evaluationCapabilityEffectObservationFactByHandle(
				*candidate, profile.SourceFactKind, requestRef.SelectedSourceHandleDigest,
			)
			if errors.Is(factErr, ErrNotFound) {
				continue
			} else if factErr != nil {
				return EvaluationCapabilityEffectInputRegistryRecord{}, false, factErr
			}
			if selected != nil {
				return EvaluationCapabilityEffectInputRegistryRecord{}, false, conflict("capability effect input authority source fact is ambiguous")
			}
			selected = candidate
			selectedFact = fact
		}
		if selected == nil {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, ErrNotFound
		}
		var stateVaultRecord *EvaluationNativeProviderStateVaultRecord
		if oneOfString(requestRef.BindingKind, "provider-job", "opaque-continuation") {
			bootstrap, bootstrapErr := loadEvaluationNativeOptionalBootstrapSourceByTurn(
				writeContext, tx, authority.NamespaceID, partition, selected.AttemptID, selected.TurnIndex, true,
			)
			if bootstrapErr != nil {
				return EvaluationCapabilityEffectInputRegistryRecord{}, false, bootstrapErr
			}
			if err := validateEvaluationCapabilityEffectStatefulBootstrapSource(
				requestRef, *selected, selectedFact, bootstrap,
			); err != nil {
				return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
			}
			vaultRecord, nativeSource, vaultErr := loadEvaluationNativeProviderStateVaultSeal(
				writeContext, tx, authority, partition, bootstrap, true,
			)
			if vaultErr != nil {
				return EvaluationCapabilityEffectInputRegistryRecord{}, false, vaultErr
			}
			expectedSourceKind := "provider-job-active-status"
			if requestRef.BindingKind == "opaque-continuation" {
				expectedSourceKind = "provider-stored-continuation"
			}
			var databaseNow time.Time
			if vaultRecord == nil || stringMember(nativeSource, "sourceKind") != expectedSourceKind {
				return EvaluationCapabilityEffectInputRegistryRecord{}, false,
					conflict("capability effect input authority state vault source is unavailable")
			}
			if err := tx.QueryRowContext(writeContext, `SELECT CURRENT_TIMESTAMP`).Scan(&databaseNow); err != nil {
				return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
			}
			if !vaultRecord.SealRequest.ExpiresAt.After(databaseNow.UTC()) ||
				!vaultRecord.SealRequest.ExpiresAt.After(request.RequestedAt) {
				return EvaluationCapabilityEffectInputRegistryRecord{}, false,
					conflict("capability effect input authority state vault source is unavailable")
			}
			stateVaultRecord = vaultRecord
		}
		source, err = evaluationCapabilityEffectRegistrySourceFromObservation(requestRef, *selected, stateVaultRecord)
		if err != nil {
			return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
		}
	}
	receipt, err := createEvaluationCapabilityEffectInputRegistryReceipt(requestRef, source)
	if err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	decoded, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(receipt.ReceiptBytes)
	if err != nil || decoded.ReceiptDigest != receipt.ReceiptDigest {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_capability_effect_input_authority_registry_receipts (
		namespace_id,plan_digest,repository_commit,request_digest,receipt_digest,request_ref_authority_receipt_digest,
		request_ref,target_ref,binding_kind,source_attempt_id,source_turn_index,source_invocation_id,
		source_observation_receipt_digest,source_handle_digest,requested_at,request_json,request_bytes,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULLIF($13,''),$14,$15,$16::jsonb,$17,$18::jsonb,$19)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		request.RequestDigest, receipt.ReceiptDigest, receipt.RequestRefAuthorityReceiptDigest, receipt.RequestRef,
		receipt.TargetRef, receipt.BindingKind, receipt.SourceAttemptID, receipt.SourceTurnIndex,
		receipt.SourceInvocationID, receipt.SourceObservationReceiptDigest, receipt.SourceHandleDigest,
		request.RequestedAt, string(request.Bytes), request.Bytes, string(receipt.ReceiptBytes), receipt.ReceiptBytes,
	)
	if err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted != 1 {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityEffectInputRegistryRecord{}, false, err
	}
	return receipt, false, nil
}
