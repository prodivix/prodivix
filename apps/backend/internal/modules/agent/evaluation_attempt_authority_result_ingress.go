package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationAttemptAuthorityResultIngressFormat         = "prodivix.agent-evaluation-attempt-authority-result-ingress"
	evaluationAttemptAuthorityResultIngressResponseFormat = "prodivix.agent-evaluation-attempt-authority-result-ingress-response"
	evaluationAttemptAuthorityResultIngressReceiptFormat  = "prodivix.agent-evaluation-attempt-authority-result-ingress-receipt"
)

func evaluationAttemptAuthorityResultIngressReceiptDigest(
	requestDigest string,
	ingressDigest string,
	responseDigest string,
	dispatchAckDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": evaluationAttemptAuthorityResultIngressReceiptFormat, "version": evaluationAttemptAuthorityVersion,
		"requestDigest": requestDigest, "ingressDigest": ingressDigest,
		"responseDigest": responseDigest, "dispatchAckDigest": dispatchAckDigest,
	})
}

func evaluationAttemptAuthorityResultIngressDigest(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	stageDigest string,
	response []byte,
	responseDigest string,
	dispatchAckDigest string,
) (string, error) {
	intent, err := decodeCanonicalEvaluationObject(binding.PreEffectIntentBytes, 16_384)
	if err != nil {
		return "", err
	}
	var responseValue any
	if err := decodeEvaluationServiceRawJSON(response, &responseValue); err != nil {
		return "", err
	}
	return canonicaljson.Digest(map[string]any{
		"format": evaluationAttemptAuthorityResultIngressFormat, "version": evaluationAttemptAuthorityVersion,
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "serviceKind": binding.ServiceKind,
		"operation": binding.Operation, "routeBinding": binding.RouteBinding,
		"attemptId": binding.AttemptID, "descriptorDigest": binding.DescriptorDigest,
		"shardLeaseOwnerId": binding.ShardLeaseOwnerID, "shardLeaseGeneration": binding.ShardLeaseGeneration,
		"verificationGrantGeneration":                   binding.VerificationGrantGeneration,
		"verificationAttemptGrantReceiptSetDigest":      binding.VerificationGrantReceiptSetDigest,
		"providerCapabilityObservationReceiptSetDigest": binding.ProviderCapabilityObservationReceiptSetDigest,
		"requestDigest": binding.RequestDigest, "requestBindingDigest": binding.RequestBindingDigest,
		"ownerImplementationDigest": binding.OwnerImplementationDigest, "stageDigest": stageDigest,
		"preEffectIntent": intent, "preEffectIntentDigest": binding.PreEffectIntentDigest,
		"response": responseValue, "responseDigest": responseDigest,
		"dispatchAckDigest": dispatchAckDigest,
	})
}

func evaluationAttemptAuthoritySharedEffectPayloadFromIntent(intent map[string]any) map[string]any {
	return map[string]any{
		"namespaceId": stringMember(intent, "namespaceId"), "planDigest": stringMember(intent, "planDigest"),
		"repositoryCommit": stringMember(intent, "repositoryCommit"), "attemptId": stringMember(intent, "attemptId"),
		"descriptorDigest": stringMember(intent, "descriptorDigest"), "caseId": stringMember(intent, "caseId"),
		"materialDigest": stringMember(intent, "materialDigest"), "turnIndex": intent["turnIndex"],
		"invocationId": stringMember(intent, "invocationId"), "toolId": stringMember(intent, "toolId"),
		"toolCallId": stringMember(intent, "toolCallId"), "providerToolCallId": stringMember(intent, "providerToolCallId"),
		"requestDigest":          stringMember(intent, "providerRequestDigest"),
		"argumentsDigest":        stringMember(intent, "argumentsDigest"),
		"executionAuthorityKind": "shared-effect", "preEffectIntent": intent,
	}
}

func evaluationAttemptAuthorityIngressEnvelope(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
) map[string]any {
	return map[string]any{
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": binding.AttemptID,
		"descriptorDigest": binding.DescriptorDigest, "shardLeaseOwnerId": binding.ShardLeaseOwnerID,
		"shardLeaseGeneration":                     binding.ShardLeaseGeneration,
		"verificationGrantGeneration":              binding.VerificationGrantGeneration,
		"verificationAttemptGrantReceiptSetDigest": binding.VerificationGrantReceiptSetDigest,
		"requestDigest":                            binding.RequestDigest,
	}
}

func validateEvaluationAttemptAuthorityDurableOwnerResult(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	stageDigest string,
	responseDigest string,
	response []byte,
	dispatchAckDigest string,
) error {
	if err := validateEvaluationAuthority(authority); err != nil {
		return err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		binding.ServiceKind != "provider-capability" || binding.Operation != "tool.execute" ||
		binding.RouteBinding != "capability-runtime/execute-tool" || binding.PreEffectIntentDigest == "" ||
		len(binding.PreEffectIntentBytes) == 0 || !evaluationDigestPattern.MatchString(stageDigest) ||
		!evaluationDigestPattern.MatchString(responseDigest) ||
		!evaluationDigestPattern.MatchString(dispatchAckDigest) {
		return ErrInvalid
	}
	computedResponseDigest, err := evaluationCanonicalByteDigest(
		response, maximumEvaluationAttemptAuthorityResponseBytes,
	)
	if err != nil || computedResponseDigest != responseDigest {
		return conflict("attempt authority durable result response digest drifted")
	}
	intent, err := decodeCanonicalEvaluationObject(binding.PreEffectIntentBytes, 16_384)
	if err != nil {
		return err
	}
	payload := evaluationAttemptAuthoritySharedEffectPayloadFromIntent(intent)
	decodedIntent, intentDigest, err := evaluationAttemptAuthorityPreEffectIntent(payload)
	if err != nil || intentDigest != binding.PreEffectIntentDigest ||
		!sameEvaluationCanonicalValue(decodedIntent, intent) ||
		stringMember(intent, "namespaceId") != authority.NamespaceID ||
		stringMember(intent, "planDigest") != partition.PlanDigest ||
		stringMember(intent, "repositoryCommit") != partition.RepositoryCommit ||
		stringMember(intent, "attemptId") != binding.AttemptID ||
		stringMember(intent, "descriptorDigest") != binding.DescriptorDigest {
		return conflict("attempt authority durable result pre-effect intent drifted")
	}
	executeBinding, err := evaluationAttemptAuthorityExecuteBindingFromPayload(payload)
	if err != nil {
		return err
	}
	if _, _, err := evaluationAttemptAuthorityResponseProjection(
		"capability-runtime", "execute-tool", response, &executeBinding, nil,
	); err != nil {
		return err
	}
	route, _ := evaluationAttemptAuthorityRouteFor([]string{"capability-runtime", "execute-tool"})
	envelope := evaluationAttemptAuthorityIngressEnvelope(authority, partition, binding)
	expectedStage, err := evaluationAttemptAuthorityDispatchStageDigest(
		route, partition, envelope, binding.ProviderCapabilityObservationReceiptSetDigest,
		binding.OwnerImplementationDigest,
	)
	if err != nil || expectedStage != stageDigest {
		return conflict("attempt authority durable result stage fence drifted")
	}
	expectedAck, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, partition, envelope, binding.ProviderCapabilityObservationReceiptSetDigest,
		stageDigest, binding.OwnerImplementationDigest, response,
	)
	if err != nil || expectedAck != dispatchAckDigest {
		return conflict("attempt authority durable result dispatch acknowledgement drifted")
	}
	return nil
}

func requireEvaluationAttemptAuthoritySharedEffectStateVaultLifecycle(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	response []byte,
) error {
	intent, err := decodeCanonicalEvaluationObject(binding.PreEffectIntentBytes, 16_384)
	if err != nil {
		return err
	}
	inputBinding, _, _, err := evaluationAttemptAuthorityInputAuthorityBinding(intent["inputAuthorityBinding"])
	if err != nil {
		return err
	}
	registryDigest := stringMember(inputBinding, "sourceRegistryReceiptDigest")
	registryBase := cloneEvaluationObject(inputBinding)
	delete(registryBase, "bindingDigest")
	delete(registryBase, "sourceRegistryReceiptDigest")
	registryBase["format"] = evaluationCapabilityEffectInputRegistryReceiptFormat
	registryBase["receiptDigest"] = registryDigest
	expectedRegistryBytes, err := canonicaljson.Bytes(registryBase)
	if err != nil {
		return ErrInvalid
	}
	var storedRegistryBytes []byte
	err = queryer.QueryRowContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_capability_effect_input_authority_registry_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND receipt_digest=$4 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, registryDigest,
	).Scan(&storedRegistryBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	storedRegistry, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(storedRegistryBytes)
	if err != nil || storedRegistry.ReceiptDigest != registryDigest ||
		!bytes.Equal(storedRegistryBytes, expectedRegistryBytes) {
		return conflict("attempt authority input registry drifted from durable state")
	}
	if !oneOfString(stringMember(inputBinding, "bindingKind"), "provider-job", "opaque-continuation") {
		return nil
	}
	responseValue, err := decodeCanonicalEvaluationObject(response, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil {
		return err
	}
	receipt, ok := objectMember(responseValue, "effectSourceReceipt")
	sealRequest, sealRequestOK := objectMember(inputBinding, "stateVaultSealRequest")
	sealReceipt, sealReceiptOK := objectMember(inputBinding, "stateVaultSealReceipt")
	resolveRequest, resolveRequestOK := objectMember(receipt, "stateVaultResolveRequest")
	resolveReceipt, resolveReceiptOK := objectMember(receipt, "stateVaultResolveReceipt")
	retireRequest, retireRequestOK := objectMember(receipt, "stateVaultRetireRequest")
	retirementReceipt, retirementReceiptOK := objectMember(receipt, "stateVaultRetirementReceipt")
	if !ok || !sealRequestOK || !sealReceiptOK || !resolveRequestOK || !resolveReceiptOK ||
		!retireRequestOK || !retirementReceiptOK {
		return ErrConflict
	}
	sealRequestBytes, sealRequestErr := canonicaljson.Bytes(sealRequest)
	sealReceiptBytes, sealReceiptErr := canonicaljson.Bytes(sealReceipt)
	resolveRequestBytes, resolveRequestErr := canonicaljson.Bytes(resolveRequest)
	resolveReceiptBytes, resolveReceiptErr := canonicaljson.Bytes(resolveReceipt)
	retireRequestBytes, retireRequestErr := canonicaljson.Bytes(retireRequest)
	retirementReceiptBytes, retirementReceiptErr := canonicaljson.Bytes(retirementReceipt)
	if sealRequestErr != nil || sealReceiptErr != nil || resolveRequestErr != nil || resolveReceiptErr != nil ||
		retireRequestErr != nil || retirementReceiptErr != nil {
		return ErrInvalid
	}
	record, err := loadEvaluationNativeProviderStateVaultRecordBySeal(
		ctx, queryer, authority, partition,
		stringMember(sealRequest, "sealRequestDigest"), stringMember(sealReceipt, "receiptDigest"), true,
	)
	if err != nil {
		return err
	}
	if record.Status != "retired" || record.ResolveRequest == nil || record.ResolveReceipt == nil ||
		record.RetireRequest == nil || record.RetirementReceipt == nil ||
		!bytes.Equal(record.SealRequest.Bytes, sealRequestBytes) ||
		!bytes.Equal(record.SealReceipt.Bytes, sealReceiptBytes) ||
		!bytes.Equal(record.ResolveRequest.Bytes, resolveRequestBytes) ||
		!bytes.Equal(record.ResolveReceipt.Bytes, resolveReceiptBytes) ||
		!bytes.Equal(record.RetireRequest.Bytes, retireRequestBytes) ||
		!bytes.Equal(record.RetirementReceipt.Bytes, retirementReceiptBytes) {
		return conflict("attempt authority state-vault lifecycle drifted from durable state")
	}
	return nil
}

func requireEvaluationAttemptAuthoritySharedEffectProviderJournalLifecycle(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	response []byte,
) error {
	responseValue, err := decodeCanonicalEvaluationObject(response, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil {
		return err
	}
	if stringMember(responseValue, "executionAuthorityKind") != "shared-effect" {
		return nil
	}
	effectReceipt, ok := objectMember(responseValue, "effectSourceReceipt")
	if !ok {
		return ErrConflict
	}
	ownerRequestDigest := stringMember(effectReceipt, "ownerRequestDigest")
	resultRecordDigest := stringMember(effectReceipt, "providerRuntimeJournalResultRecordDigest")
	resultSealReceiptDigest := stringMember(effectReceipt, "providerRuntimeResultSealReceiptDigest")
	if !evaluationDigestPattern.MatchString(ownerRequestDigest) ||
		!evaluationDigestPattern.MatchString(resultRecordDigest) ||
		!evaluationDigestPattern.MatchString(resultSealReceiptDigest) {
		return ErrInvalid
	}
	var ownerInstanceID string
	var stageBytes, resultBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT stage.owner_instance_id,stage.record_bytes,result.record_bytes
		FROM agent_evaluation_capability_effect_provider_journal_stages AS stage
		JOIN agent_evaluation_capability_effect_provider_journal_results AS result
		  ON result.namespace_id=stage.namespace_id AND result.plan_digest=stage.plan_digest
		 AND result.repository_commit=stage.repository_commit AND result.owner_instance_id=stage.owner_instance_id
		 AND result.owner_request_digest=stage.owner_request_digest
		WHERE stage.namespace_id=$1 AND stage.plan_digest=$2 AND stage.repository_commit=$3
		  AND stage.owner_request_digest=$4 AND stage.controlled_request_digest=$5
		  AND stage.pre_effect_intent_digest=$6 AND result.record_digest=$7
		  AND result.result_seal_receipt_digest=$8 AND stage.v46_eligible AND result.v46_eligible
		FOR SHARE OF stage,result`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		ownerRequestDigest, binding.RequestDigest, binding.PreEffectIntentDigest,
		resultRecordDigest, resultSealReceiptDigest).Scan(&ownerInstanceID, &stageBytes, &resultBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return conflict("attempt authority shared effect lacks its sealed Provider journal result")
	}
	if err != nil {
		return err
	}
	stage, err := decodeEvaluationCapabilityEffectProviderJournalStageRecord(stageBytes)
	if err != nil || !ValidEvaluationCapabilityEffectProviderJournalOwnerInstanceID(ownerInstanceID) ||
		stage.NamespaceID != authority.NamespaceID || stage.PlanDigest != partition.PlanDigest ||
		stage.RepositoryCommit != partition.RepositoryCommit || stage.OwnerRequestDigest != ownerRequestDigest ||
		stage.PreEffectIntentDigest != binding.PreEffectIntentDigest ||
		!bytes.Equal(stage.PreEffectIntentBytes, binding.PreEffectIntentBytes) {
		return conflict("attempt authority shared effect Provider journal stage drifted")
	}
	executions, err := loadEvaluationCapabilityEffectProviderJournalExecutionsTx(ctx, tx, stage, ownerInstanceID)
	if err != nil {
		return err
	}
	result, err := decodeEvaluationCapabilityEffectProviderJournalResultRecord(resultBytes, stage, executions)
	if err != nil || result.RecordDigest != resultRecordDigest ||
		result.ResultSealReceiptDigest != resultSealReceiptDigest || len(executions) == 0 {
		return conflict("attempt authority shared effect Provider journal result drifted")
	}
	terminal := executions[len(executions)-1]
	if result.ResultStatus != stringMember(effectReceipt, "effectStatus") ||
		result.BusinessResultDigest != stringMember(effectReceipt, "businessResultDigest") ||
		result.SourceFactKind != stringMember(effectReceipt, "sourceFactKind") ||
		result.SourceFactDigest != stringMember(effectReceipt, "sourceFactDigest") ||
		terminal.TransportReceiptDigest != stringMember(effectReceipt, "transportReceiptDigest") ||
		terminal.SpoolReceiptDigest != stringMember(effectReceipt, "resultSpoolReceiptDigest") ||
		terminal.NormalizedEventSetDigest != stringMember(effectReceipt, "normalizedEventSetDigest") ||
		!sameEvaluationCanonicalValue(result.BusinessResult, responseValue["result"]) ||
		!sameEvaluationCanonicalValue(result.EffectSourceFact, responseValue["effectSourceFact"]) ||
		!sameEvaluationCanonicalValue(result.Value["stateVaultRetireRequest"], effectReceipt["stateVaultRetireRequest"]) ||
		!sameEvaluationCanonicalValue(result.Value["stateVaultRetirementReceipt"], effectReceipt["stateVaultRetirementReceipt"]) {
		return conflict("attempt authority shared effect drifted from its Provider journal terminal evidence")
	}
	return nil
}

func decodeEvaluationAttemptAuthorityResultIngress(
	source []byte,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (
	map[string]any,
	EvaluationControlledAuthorityRequestBinding,
	json.RawMessage,
	string,
	string,
	error,
) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationOwnerStateOuterBytes)
	if err != nil || agentcontract.ValidateSanitizedAgentPayload(value) != nil ||
		!exactEvaluationKeys(value, []string{
			"format", "version", "namespaceId", "planDigest", "repositoryCommit",
			"serviceKind", "operation", "routeBinding", "attemptId", "descriptorDigest",
			"shardLeaseOwnerId", "shardLeaseGeneration", "verificationGrantGeneration",
			"verificationAttemptGrantReceiptSetDigest", "providerCapabilityObservationReceiptSetDigest",
			"requestDigest", "requestBindingDigest", "ownerImplementationDigest", "stageDigest",
			"preEffectIntent", "preEffectIntentDigest", "response", "responseDigest",
			"dispatchAckDigest", "ingressDigest",
		}) || stringMember(value, "format") != evaluationAttemptAuthorityResultIngressFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		stringMember(value, "planDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit ||
		stringMember(value, "serviceKind") != "provider-capability" ||
		stringMember(value, "operation") != "tool.execute" ||
		stringMember(value, "routeBinding") != "capability-runtime/execute-tool" {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", fmt.Errorf("attempt authority result ingress shape: %w", ErrInvalid)
	}
	version, versionOK := integerMember(value, "version")
	shardGeneration, shardOK := integerMember(value, "shardLeaseGeneration")
	verificationGeneration, verificationOK := integerMember(value, "verificationGrantGeneration")
	if !versionOK || version != evaluationAttemptAuthorityVersion || !shardOK || shardGeneration < 1 ||
		!verificationOK || verificationGeneration < 1 {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", fmt.Errorf("attempt authority result ingress generation: %w", ErrInvalid)
	}
	for _, field := range []string{
		"attemptId", "shardLeaseOwnerId",
	} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", fmt.Errorf("attempt authority result ingress identity %s: %w", field, ErrInvalid)
		}
	}
	for _, field := range []string{
		"descriptorDigest", "verificationAttemptGrantReceiptSetDigest",
		"providerCapabilityObservationReceiptSetDigest", "requestDigest", "requestBindingDigest",
		"ownerImplementationDigest", "stageDigest", "preEffectIntentDigest",
		"responseDigest", "dispatchAckDigest", "ingressDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", fmt.Errorf("attempt authority result ingress digest %s: %w", field, ErrInvalid)
		}
	}
	resultBase := cloneEvaluationObject(value)
	delete(resultBase, "ingressDigest")
	ingressDigest, digestErr := canonicaljson.Digest(resultBase)
	response, responseErr := canonicaljson.Bytes(value["response"])
	responseDigest, responseDigestErr := canonicaljson.Digest(value["response"])
	intent, intentOK := objectMember(value, "preEffectIntent")
	intentBytes, intentBytesErr := canonicaljson.Bytes(intent)
	if digestErr != nil || ingressDigest != stringMember(value, "ingressDigest") ||
		responseErr != nil || len(response) > maximumEvaluationAttemptAuthorityResponseBytes ||
		responseDigestErr != nil || responseDigest != stringMember(value, "responseDigest") ||
		!intentOK || intentBytesErr != nil || len(intentBytes) > 16_384 {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", fmt.Errorf("attempt authority result ingress canonical component: %w", ErrInvalid)
	}
	route, _ := evaluationAttemptAuthorityRouteFor([]string{"capability-runtime", "execute-tool"})
	envelope := cloneEvaluationObject(value)
	binding, err := evaluationAttemptAuthorityRequestBinding(
		partition, route, envelope, stringMember(value, "providerCapabilityObservationReceiptSetDigest"),
		stringMember(value, "ownerImplementationDigest"),
	)
	if err != nil || binding.RequestBindingDigest != stringMember(value, "requestBindingDigest") {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", conflict("attempt authority result ingress request binding drifted")
	}
	payload := evaluationAttemptAuthoritySharedEffectPayloadFromIntent(intent)
	decodedIntent, intentDigest, err := evaluationAttemptAuthorityPreEffectIntent(payload)
	if err != nil || intentDigest != stringMember(value, "preEffectIntentDigest") ||
		!sameEvaluationCanonicalValue(decodedIntent, intent) ||
		stringMember(intent, "namespaceId") != authority.NamespaceID ||
		stringMember(intent, "planDigest") != partition.PlanDigest ||
		stringMember(intent, "repositoryCommit") != partition.RepositoryCommit ||
		stringMember(intent, "attemptId") != binding.AttemptID ||
		stringMember(intent, "descriptorDigest") != binding.DescriptorDigest {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", conflict("attempt authority result ingress pre-effect intent drifted")
	}
	binding.PreEffectIntentDigest = intentDigest
	binding.PreEffectIntentBytes = intentBytes
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", err
	}
	executeBinding, err := evaluationAttemptAuthorityExecuteBindingFromPayload(payload)
	if err != nil {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", err
	}
	if _, _, err := evaluationAttemptAuthorityResponseProjection(
		"capability-runtime", "execute-tool", response, &executeBinding, nil,
	); err != nil {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", err
	}
	stageDigest, err := evaluationAttemptAuthorityDispatchStageDigest(
		route, partition, envelope, binding.ProviderCapabilityObservationReceiptSetDigest,
		binding.OwnerImplementationDigest,
	)
	if err != nil || stageDigest != stringMember(value, "stageDigest") {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", conflict("attempt authority result ingress stage fence drifted")
	}
	dispatchAckDigest, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, partition, envelope, binding.ProviderCapabilityObservationReceiptSetDigest,
		stageDigest, binding.OwnerImplementationDigest, response,
	)
	if err != nil || dispatchAckDigest != stringMember(value, "dispatchAckDigest") {
		return nil, EvaluationControlledAuthorityRequestBinding{}, nil, "", "", conflict("attempt authority result ingress dispatch acknowledgement drifted")
	}
	return value, binding, response, responseDigest, ingressDigest, nil
}

func (handler *EvaluationServiceHandler) handleEvaluationAttemptAuthorityResultIngress(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method != http.MethodPost || len(tail) != 1 || tail[0] != "attempt-authority-results" ||
		!evaluationServiceQueryIsExact(request) {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationAttemptAuthorityResultIngressRepository)
	if !ok || handler.attemptAuthorityResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationOwnerStateOuterBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value, binding, response, responseDigest, ingressDigest, err :=
		decodeEvaluationAttemptAuthorityResultIngress(source, handler.authority, partition)
	if err != nil || !exactEvaluationIdempotencyHeader(request, binding.RequestDigest) {
		if err == nil {
			err = ErrInvalid
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
		request.Context(), "execute-tool", binding.RequestDigest, response,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	stored, replayed, err := repository.StoreEvaluationAttemptAuthorityOwnerResult(
		request.Context(), handler.authority, partition, binding, stringMember(value, "stageDigest"),
		responseDigest, response, stringMember(value, "dispatchAckDigest"),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if stored.ResponseDigest != responseDigest || !bytes.Equal(stored.ResponseBytes, response) ||
		stored.DispatchAckDigest != stringMember(value, "dispatchAckDigest") {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	receiptDigest, err := evaluationAttemptAuthorityResultIngressReceiptDigest(
		binding.RequestDigest, ingressDigest, responseDigest, stored.DispatchAckDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, map[string]any{
		"format": evaluationAttemptAuthorityResultIngressResponseFormat, "version": evaluationAttemptAuthorityVersion,
		"requestDigest": binding.RequestDigest, "ingressDigest": ingressDigest,
		"responseDigest": responseDigest, "dispatchAckDigest": stored.DispatchAckDigest,
		"resultIngressReceiptDigest": receiptDigest, "replayed": replayed,
	})
}
