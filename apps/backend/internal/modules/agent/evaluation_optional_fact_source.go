package agent

import (
	"bytes"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationOptionalFactTransportSource struct {
	Intent  EvaluationTransportDispatchIntentRecord
	Receipt EvaluationTransportReceiptRecord
	Spool   EvaluationProviderResultSpoolReceiptRecord
}

type evaluationOptionalFactEffectOwnerSource struct {
	RequestDigest             string
	ReceiptDigest             string
	StageDigest               string
	DispatchAckDigest         string
	OwnerImplementationDigest string
	ResponseProjection        map[string]any
	PreEffectIntentBytes      []byte
	ResponseBytes             []byte
	CompletedAt               time.Time
}

func evaluationOptionalFactTargetAuthorityFromPlan(
	plan evaluationPlanFact,
	request evaluationOptionalFactAuthorityRequest,
) (EvaluationOptionalFactTargetAuthority, error) {
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return EvaluationOptionalFactTargetAuthority{}, err
	}
	var scheduled *evaluationStatusPlannedAttempt
	for index := range planned {
		if planned[index].AttemptID == request.AttemptID {
			scheduled = &planned[index]
			break
		}
	}
	if scheduled == nil || scheduled.DescriptorDigest != request.DescriptorDigest ||
		stringMember(scheduled.Descriptor, "targetId") != request.TargetID ||
		stringMember(scheduled.Descriptor, "targetDigest") != request.TargetDigest ||
		stringMember(scheduled.Descriptor, "capabilityDescriptorDigest") != request.CapabilityDescriptorDigest {
		return EvaluationOptionalFactTargetAuthority{}, conflict("optional fact source is outside the frozen attempt schedule")
	}
	target := evaluationPlanObjectByIdentity(plan.Value["capabilityQualificationTargets"], "targetId", request.TargetID)
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", scheduled.CaseID)
	provider := evaluationPlanObjectByIdentity(plan.Value["providerConfigurations"], "providerConfigurationId", request.ProviderConfigurationID)
	if target == nil || evaluationCase == nil || provider == nil {
		return EvaluationOptionalFactTargetAuthority{}, conflict("optional fact target authority is absent from the frozen plan")
	}
	authorityValue, authorityOK := objectMember(target, "optionalCapabilitySupportAuthority")
	probe, probeOK := objectMember(authorityValue, "probeEvidence")
	resolved, resolvedOK := objectMember(authorityValue, "resolvedCapabilityDescriptor")
	runtimeAuthority, runtimeAuthorityOK := objectMember(authorityValue, "runtimeFactSourceAuthority")
	adapter, adapterOK := objectMember(provider, "adapter")
	if !authorityOK || !probeOK || !resolvedOK || !runtimeAuthorityOK || !adapterOK ||
		stringMember(probe, "authorityKind") != "sealed-provider-capability-probe" ||
		!exactEvaluationKeys(runtimeAuthority, []string{
			"kind", "sourceKind", "sourceAuthorityId", "sourceAuthorityImplementationDigest", "routeBinding",
			"capabilityProfileId", "capabilityProfileDigest", "capabilityId", "protocolFamily",
			"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
			"registrationAuthorityIssuerId", "registrationReceiptDigest", "authorityDigest",
		}, "hostedRetrievalRuntimeResourceRegistrationIntentDigest") || stringMember(runtimeAuthority, "kind") != "shared-durable-capability" ||
		stringMember(runtimeAuthority, "sourceKind") != request.Source.Kind ||
		stringMember(runtimeAuthority, "capabilityProfileId") != request.CapabilityProfileID ||
		stringMember(runtimeAuthority, "capabilityProfileDigest") != request.CapabilityProfileDigest ||
		stringMember(runtimeAuthority, "capabilityId") != request.CapabilityID ||
		stringMember(runtimeAuthority, "protocolFamily") != request.ProtocolFamily ||
		stringMember(runtimeAuthority, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(runtimeAuthority, "modelId") != request.ModelID ||
		stringMember(runtimeAuthority, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(runtimeAuthority, "adapterDigest") != request.AdapterDigest ||
		stringMember(authorityValue, "qualificationCapabilityProfileId") != request.CapabilityProfileID ||
		stringMember(authorityValue, "qualificationCapabilityProfileDigest") != request.CapabilityProfileDigest ||
		stringMember(authorityValue, "capabilityId") != request.CapabilityID ||
		stringMember(authorityValue, "supportExpectation") != request.SupportExpectation ||
		stringMember(resolved, "descriptorDigest") != request.CapabilityDescriptorDigest ||
		stringMember(target, "targetDigest") != request.TargetDigest ||
		stringMember(target, "capabilityProfileId") != request.CapabilityProfileID ||
		stringMember(target, "capabilityProfileDigest") != request.CapabilityProfileDigest ||
		stringMember(target, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(target, "protocolFamily") != request.ProtocolFamily ||
		stringMember(target, "modelId") != request.ModelID ||
		stringMember(target, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(adapter, "adapterDigest") != request.AdapterDigest ||
		stringMember(probe, "adapterDigest") != request.AdapterDigest ||
		stringMember(evaluationCase, "capabilityProfileId") != request.CapabilityProfileID {
		return EvaluationOptionalFactTargetAuthority{}, conflict("optional fact target authority drifted")
	}
	requiresHostedRuntimeResourceIntent := request.CapabilityID == "provider.hosted-retrieval" &&
		oneOfString(request.ProtocolFamily, "openai-responses", "gemini-interactions")
	hostedRuntimeResourceIntentDigest, hasHostedRuntimeResourceIntent := runtimeAuthority["hostedRetrievalRuntimeResourceRegistrationIntentDigest"].(string)
	if requiresHostedRuntimeResourceIntent != hasHostedRuntimeResourceIntent ||
		hasHostedRuntimeResourceIntent && !evaluationDigestPattern.MatchString(hostedRuntimeResourceIntentDigest) {
		return EvaluationOptionalFactTargetAuthority{}, conflict("optional fact hosted runtime resource registration intent drifted")
	}
	for _, pair := range []struct {
		value map[string]any
		field string
	}{
		{probe, "evidenceDigest"}, {authorityValue, "authorityDigest"}, {runtimeAuthority, "authorityDigest"},
	} {
		base := cloneEvaluationObject(pair.value)
		claimed := stringMember(base, pair.field)
		delete(base, pair.field)
		computed, digestErr := canonicaljson.Digest(base)
		if digestErr != nil || computed != claimed {
			return EvaluationOptionalFactTargetAuthority{}, conflict("optional fact target authority digest drifted")
		}
	}
	result := EvaluationOptionalFactTargetAuthority{
		TargetID: request.TargetID, TargetDigest: request.TargetDigest,
		CapabilityProfileID: request.CapabilityProfileID, CapabilityProfileDigest: request.CapabilityProfileDigest,
		CapabilityDescriptorDigest: request.CapabilityDescriptorDigest, CapabilityID: request.CapabilityID,
		SupportExpectation: request.SupportExpectation, ProtocolFamily: request.ProtocolFamily,
		ProviderConfigurationID: request.ProviderConfigurationID, ModelID: request.ModelID,
		ModelLineageDigest: request.ModelLineageDigest, AdapterDigest: request.AdapterDigest,
		SourceKind:                                    stringMember(runtimeAuthority, "sourceKind"),
		SourceAuthorityID:                             stringMember(runtimeAuthority, "sourceAuthorityId"),
		SourceAuthorityImplementationDigest:           stringMember(runtimeAuthority, "sourceAuthorityImplementationDigest"),
		SourceAuthorityRouteBinding:                   stringMember(runtimeAuthority, "routeBinding"),
		RegistrationAuthorityIssuerID:                 stringMember(runtimeAuthority, "registrationAuthorityIssuerId"),
		RegistrationReceiptDigest:                     stringMember(runtimeAuthority, "registrationReceiptDigest"),
		HostedRuntimeResourceRegistrationIntentDigest: hostedRuntimeResourceIntentDigest,
		TargetAuthorityDigest:                         stringMember(runtimeAuthority, "authorityDigest"),
	}
	if !evaluationOptionalFactTargetMatchesRequest(request, result) {
		return EvaluationOptionalFactTargetAuthority{}, conflict("optional fact shared-durable source authority is invalid")
	}
	return result, nil
}

func validateEvaluationOptionalFactTransportSource(
	request evaluationOptionalFactAuthorityRequest,
	source evaluationOptionalFactTransportSource,
) error {
	intent, receipt, spool := source.Intent, source.Receipt, source.Spool
	if intent.AttemptID != request.AttemptID || intent.DescriptorDigest != request.DescriptorDigest ||
		intent.TurnIndex != request.TurnIndex || intent.InvocationID != request.InvocationID ||
		intent.ProtocolFamily != request.ProtocolFamily || intent.ProviderConfigurationID != request.ProviderConfigurationID ||
		intent.ModelLineageDigest != request.ModelLineageDigest || intent.RequestDigest != request.ProviderRequestDigest ||
		intent.IntentDigest != request.DispatchIntentDigest ||
		receipt.AttemptID != request.AttemptID || receipt.DescriptorDigest != request.DescriptorDigest ||
		receipt.TurnIndex != request.TurnIndex || receipt.InvocationID != request.InvocationID ||
		receipt.ProviderConfigurationID != request.ProviderConfigurationID || receipt.IntentDigest != request.DispatchIntentDigest ||
		receipt.DispatchState != "dispatched" ||
		receipt.Outcome != "completed" || receipt.CompletedAt.IsZero() ||
		spool.AttemptID != request.AttemptID || spool.DescriptorDigest != request.DescriptorDigest ||
		spool.TurnIndex != request.TurnIndex || spool.InvocationID != request.InvocationID ||
		spool.DispatchIntentDigest != request.DispatchIntentDigest || spool.TransportReceiptDigest != receipt.ReceiptDigest ||
		spool.ResponseBodyDigest != receipt.ResponseBodyDigest || spool.ResponseDigest != request.ResponseDigest ||
		!evaluationDigestPattern.MatchString(receipt.ReceiptDigest) ||
		!evaluationDigestPattern.MatchString(spool.ReceiptDigest) ||
		!evaluationDigestPattern.MatchString(spool.NormalizedEventSetDigest) {
		return conflict("optional fact source transport roots were swapped or incomplete")
	}
	return nil
}

func evaluationOptionalFactRuntimeAuthorityMatches(
	value map[string]any,
	target EvaluationOptionalFactTargetAuthority,
) bool {
	if !exactEvaluationKeys(value, []string{
		"kind", "sourceKind", "sourceAuthorityId", "sourceAuthorityImplementationDigest", "routeBinding",
		"capabilityProfileId", "capabilityProfileDigest", "capabilityId", "protocolFamily",
		"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
		"registrationAuthorityIssuerId", "registrationReceiptDigest", "authorityDigest",
	}, "hostedRetrievalRuntimeResourceRegistrationIntentDigest") || stringMember(value, "kind") != "shared-durable-capability" ||
		stringMember(value, "sourceKind") != target.SourceKind ||
		stringMember(value, "sourceAuthorityId") != target.SourceAuthorityID ||
		stringMember(value, "sourceAuthorityImplementationDigest") != target.SourceAuthorityImplementationDigest ||
		stringMember(value, "routeBinding") != target.SourceAuthorityRouteBinding ||
		stringMember(value, "capabilityProfileId") != target.CapabilityProfileID ||
		stringMember(value, "capabilityProfileDigest") != target.CapabilityProfileDigest ||
		stringMember(value, "capabilityId") != target.CapabilityID ||
		stringMember(value, "protocolFamily") != target.ProtocolFamily ||
		stringMember(value, "providerConfigurationId") != target.ProviderConfigurationID ||
		stringMember(value, "modelId") != target.ModelID ||
		stringMember(value, "modelLineageDigest") != target.ModelLineageDigest ||
		stringMember(value, "adapterDigest") != target.AdapterDigest ||
		stringMember(value, "registrationAuthorityIssuerId") != target.RegistrationAuthorityIssuerID ||
		stringMember(value, "registrationReceiptDigest") != target.RegistrationReceiptDigest ||
		stringMember(value, "hostedRetrievalRuntimeResourceRegistrationIntentDigest") != target.HostedRuntimeResourceRegistrationIntentDigest ||
		stringMember(value, "authorityDigest") != target.TargetAuthorityDigest {
		return false
	}
	base := cloneEvaluationObject(value)
	delete(base, "authorityDigest")
	digest, err := canonicaljson.Digest(base)
	return err == nil && digest == target.TargetAuthorityDigest
}

func evaluationOptionalFactPreEffectIntent(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationOptionalFactAuthorityRequest,
	target EvaluationOptionalFactTargetAuthority,
	owner evaluationOptionalFactEffectOwnerSource,
) (map[string]any, string, error) {
	intent, err := decodeCanonicalEvaluationObject(
		owner.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	if err != nil || !exactEvaluationKeys(intent, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"caseId", "materialDigest", "turnIndex", "invocationId", "toolId", "toolCallId",
		"providerToolCallId", "providerRequestDigest", "argumentsDigest", "requestedAt", "inputAuthorityBinding", "runtimeFactSourceAuthority",
		"registrationReceiptDigest", "ownerRequestId", "ownerRequestDigest", "intentDigest",
	}) || stringMember(intent, "format") != "prodivix.agent-evaluation-capability-pre-effect-intent" {
		return nil, "", ErrInvalid
	}
	version, versionOK := integerMember(intent, "version")
	turn, turnOK := integerMember(intent, "turnIndex")
	runtimeAuthority, runtimeOK := objectMember(intent, "runtimeFactSourceAuthority")
	if !versionOK || version != 1 || !turnOK || turn != request.TurnIndex || !runtimeOK ||
		!evaluationOptionalFactRuntimeAuthorityMatches(runtimeAuthority, target) ||
		stringMember(intent, "namespaceId") != authority.NamespaceID ||
		stringMember(intent, "planDigest") != partition.PlanDigest ||
		stringMember(intent, "repositoryCommit") != partition.RepositoryCommit ||
		stringMember(intent, "attemptId") != request.AttemptID ||
		stringMember(intent, "descriptorDigest") != request.DescriptorDigest ||
		stringMember(intent, "invocationId") != request.InvocationID ||
		stringMember(intent, "providerRequestDigest") != request.ProviderRequestDigest ||
		stringMember(intent, "registrationReceiptDigest") != target.RegistrationReceiptDigest {
		return nil, "", conflict("optional fact pre-effect intent binding drifted")
	}
	payload := evaluationAttemptAuthoritySharedEffectPayloadFromIntent(intent)
	validatedIntent, validatedDigest, validationErr := evaluationAttemptAuthorityPreEffectIntent(payload)
	if validationErr != nil || !sameEvaluationCanonicalValue(validatedIntent, intent) ||
		validatedDigest != stringMember(intent, "intentDigest") {
		return nil, "", conflict("optional fact pre-effect input authority drifted")
	}
	for _, field := range []string{"caseId", "invocationId", "toolId", "toolCallId", "providerToolCallId", "ownerRequestId"} {
		if !validEvaluationAgentControlIdentity(stringMember(intent, field)) {
			return nil, "", ErrInvalid
		}
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "materialDigest", "providerRequestDigest", "argumentsDigest",
		"registrationReceiptDigest", "ownerRequestDigest", "intentDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(intent, field)) {
			return nil, "", ErrInvalid
		}
	}
	ownerIdentityBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-owner-request-identity", "version": int64(1),
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "caseId": stringMember(intent, "caseId"),
		"materialDigest": stringMember(intent, "materialDigest"), "turnIndex": intent["turnIndex"],
		"invocationId": request.InvocationID, "toolId": stringMember(intent, "toolId"),
		"toolCallId": stringMember(intent, "toolCallId"), "providerToolCallId": stringMember(intent, "providerToolCallId"),
		"providerRequestDigest": request.ProviderRequestDigest, "argumentsDigest": stringMember(intent, "argumentsDigest"),
		"requestedAt":                      intent["requestedAt"],
		"inputAuthorityBindingDigest":      stringMember(intent["inputAuthorityBinding"].(map[string]any), "bindingDigest"),
		"runtimeFactSourceAuthorityDigest": target.TargetAuthorityDigest,
		"registrationReceiptDigest":        target.RegistrationReceiptDigest,
	}
	ownerRequestDigest, err := canonicaljson.Digest(ownerIdentityBase)
	if err != nil || stringMember(intent, "ownerRequestDigest") != ownerRequestDigest ||
		stringMember(intent, "ownerRequestId") != "capability-effect-owner-request."+ownerRequestDigest[len("sha256-"):] {
		return nil, "", conflict("optional fact effect owner identity drifted")
	}
	intentBase := cloneEvaluationObject(intent)
	intentDigest := stringMember(intentBase, "intentDigest")
	delete(intentBase, "intentDigest")
	computed, err := canonicaljson.Digest(intentBase)
	if err != nil || computed != intentDigest {
		return nil, "", conflict("optional fact pre-effect intent digest drifted")
	}
	return intent, intentDigest, nil
}

func evaluationOptionalFactEffectSourceEvidence(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationOptionalFactAuthorityRequest,
	target EvaluationOptionalFactTargetAuthority,
	transport evaluationOptionalFactTransportSource,
	owner evaluationOptionalFactEffectOwnerSource,
) (EvaluationOptionalFactSourceEvidence, error) {
	if !oneOfString(request.Source.Kind, "sealed-provider-response-metadata", "sealed-hosted-owner-result") ||
		request.Source.Kind != target.SourceKind || request.Source.OwnerRequestDigest != owner.RequestDigest ||
		request.Source.OwnerReceiptDigest != owner.ReceiptDigest ||
		owner.OwnerImplementationDigest != target.SourceAuthorityImplementationDigest ||
		!evaluationDigestPattern.MatchString(owner.StageDigest) || !evaluationDigestPattern.MatchString(owner.DispatchAckDigest) ||
		owner.CompletedAt.IsZero() {
		return EvaluationOptionalFactSourceEvidence{}, ErrConflict
	}
	if err := validateEvaluationOptionalFactTransportSource(request, transport); err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	intent, preEffectIntentDigest, err := evaluationOptionalFactPreEffectIntent(
		authority, partition, request, target, owner,
	)
	if err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	response, err := decodeCanonicalEvaluationObject(owner.ResponseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil || !exactEvaluationKeys(response, []string{
		"executionAuthorityKind", "outcome", "result", "resultDigest", "continuationReceiptDigest",
		"effectSourceReceipt", "effectSourceFact", "specificReceipts",
	}) || stringMember(response, "executionAuthorityKind") != "shared-effect" ||
		!oneOfString(stringMember(response, "outcome"), "supported", "unsupported", "failed") {
		return EvaluationOptionalFactSourceEvidence{}, ErrInvalid
	}
	businessResultDigest, err := canonicaljson.Digest(response["result"])
	if err != nil || businessResultDigest != stringMember(response, "resultDigest") ||
		!evaluationDigestPattern.MatchString(stringMember(response, "continuationReceiptDigest")) {
		return EvaluationOptionalFactSourceEvidence{}, ErrConflict
	}
	rawReceipts, ok := response["specificReceipts"].([]any)
	effectReceipt, effectReceiptOK := objectMember(response, "effectSourceReceipt")
	if !ok || len(rawReceipts) != 0 || !effectReceiptOK || !exactEvaluationKeys(effectReceipt, []string{
		"format", "version", "intentDigest", "ownerRequestId", "ownerRequestDigest", "runtimeFactSourceAuthority",
		"registrationReceiptDigest", "effectStatus", "businessResultDigest", "sourceFactKind", "sourceFactDigest",
		"providerRuntimeJournalResultRecordDigest", "providerRuntimeResultSealReceiptDigest",
		"stageDigest", "dispatchAckDigest", "transportReceiptDigest", "resultSpoolReceiptDigest",
		"normalizedEventSetDigest", "stateVaultResolveRequest", "stateVaultResolveReceipt",
		"stateVaultRetireRequest", "stateVaultRetirementReceipt", "specificReceiptDigests", "sealedAt", "receiptDigest",
	}) || stringMember(effectReceipt, "format") != "prodivix.agent-evaluation-capability-effect-source-receipt" {
		return EvaluationOptionalFactSourceEvidence{}, ErrInvalid
	}
	version, versionOK := integerMember(effectReceipt, "version")
	runtimeAuthority, runtimeOK := objectMember(effectReceipt, "runtimeFactSourceAuthority")
	effectSpecifics, specificsOK := effectReceipt["specificReceiptDigests"].([]any)
	sealedAt, sealedAtErr := parseEvaluationServiceInstant(stringMember(effectReceipt, "sealedAt"))
	resultSpoolReceiptDigest, resultSpoolErr := evaluationOptionalFactNullableDigest(
		effectReceipt, "resultSpoolReceiptDigest",
	)
	expectedKind := evaluationOptionalFactKind(request.CapabilityID)
	if !versionOK || version != 1 || !runtimeOK || !specificsOK || len(effectSpecifics) != 0 || sealedAtErr != nil ||
		resultSpoolErr != nil ||
		!evaluationOptionalFactRuntimeAuthorityMatches(runtimeAuthority, target) ||
		!sameEvaluationCanonicalValue(runtimeAuthority, intent["runtimeFactSourceAuthority"]) ||
		stringMember(effectReceipt, "intentDigest") != preEffectIntentDigest ||
		stringMember(effectReceipt, "ownerRequestId") != stringMember(intent, "ownerRequestId") ||
		stringMember(effectReceipt, "ownerRequestDigest") != stringMember(intent, "ownerRequestDigest") ||
		stringMember(effectReceipt, "registrationReceiptDigest") != target.RegistrationReceiptDigest ||
		stringMember(effectReceipt, "businessResultDigest") != businessResultDigest ||
		!evaluationDigestPattern.MatchString(stringMember(effectReceipt, "providerRuntimeJournalResultRecordDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(effectReceipt, "providerRuntimeResultSealReceiptDigest")) ||
		stringMember(effectReceipt, "stageDigest") != owner.StageDigest ||
		stringMember(effectReceipt, "dispatchAckDigest") != owner.DispatchAckDigest ||
		stringMember(effectReceipt, "transportReceiptDigest") != request.TransportReceiptDigest ||
		resultSpoolReceiptDigest != request.ResultSpoolReceiptDigest ||
		stringMember(effectReceipt, "normalizedEventSetDigest") != request.NormalizedEventSetDigest ||
		stringMember(effectReceipt, "receiptDigest") != request.Source.EffectSourceReceiptDigest {
		return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact effect source receipt binding drifted")
	}
	if err := evaluationAttemptAuthoritySharedEffectStateVaultLifecycle(
		intent, effectReceipt, stringMember(effectReceipt, "effectStatus"),
	); err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	effectReceiptBase := cloneEvaluationObject(effectReceipt)
	delete(effectReceiptBase, "receiptDigest")
	computedEffectReceiptDigest, err := canonicaljson.Digest(effectReceiptBase)
	if err != nil || computedEffectReceiptDigest != request.Source.EffectSourceReceiptDigest {
		return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact effect source receipt digest drifted")
	}
	effectReceiptBytes, err := canonicaljson.Bytes(effectReceipt)
	if err != nil || len(effectReceiptBytes) == 0 ||
		len(effectReceiptBytes) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes ||
		len(owner.PreEffectIntentBytes) == 0 ||
		len(owner.PreEffectIntentBytes) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes {
		return EvaluationOptionalFactSourceEvidence{}, ErrInvalid
	}
	projection := owner.ResponseProjection
	projectionSpecifics, projectionSpecificsOK := projection["specificReceiptDigests"].([]any)
	if !exactEvaluationKeys(projection, []string{
		"serviceKind", "operation", "executionAuthorityKind", "invocationId", "turnIndex", "toolId", "toolCallId",
		"providerToolCallId", "providerRequestDigest", "outcome", "resultDigest", "continuationReceiptDigest",
		"preEffectIntentDigest", "effectSourceReceiptDigest", "effectSourceFactDigest", "specificReceiptDigests",
	}) || !projectionSpecificsOK || len(projectionSpecifics) != 0 ||
		stringMember(projection, "serviceKind") != "capability-runtime" ||
		stringMember(projection, "operation") != "execute-tool" ||
		stringMember(projection, "executionAuthorityKind") != "shared-effect" ||
		stringMember(projection, "invocationId") != request.InvocationID ||
		stringMember(projection, "providerRequestDigest") != request.ProviderRequestDigest ||
		stringMember(projection, "preEffectIntentDigest") != preEffectIntentDigest ||
		stringMember(projection, "effectSourceReceiptDigest") != request.Source.EffectSourceReceiptDigest ||
		stringMember(projection, "outcome") != stringMember(response, "outcome") ||
		stringMember(projection, "resultDigest") != businessResultDigest ||
		stringMember(projection, "continuationReceiptDigest") != stringMember(response, "continuationReceiptDigest") {
		return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact effect owner projection drifted")
	}
	projectionTurn, projectionTurnOK := integerMember(projection, "turnIndex")
	if !projectionTurnOK || projectionTurn != request.TurnIndex ||
		stringMember(projection, "toolId") != stringMember(intent, "toolId") ||
		stringMember(projection, "toolCallId") != stringMember(intent, "toolCallId") ||
		stringMember(projection, "providerToolCallId") != stringMember(intent, "providerToolCallId") {
		return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact effect owner turn binding drifted")
	}
	effectStatus := stringMember(effectReceipt, "effectStatus")
	outcomeByEffectStatus := map[string]string{"produced": "supported", "unavailable": "unsupported", "failed": "failed"}
	if outcomeByEffectStatus[effectStatus] == "" || outcomeByEffectStatus[effectStatus] != stringMember(response, "outcome") ||
		(effectStatus == "produced" && resultSpoolReceiptDigest == "") {
		return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact effect status drifted")
	}
	var factValue map[string]any
	var factDigest string
	if effectStatus == "produced" {
		fact, factOK := objectMember(response, "effectSourceFact")
		value, valueOK := objectMember(fact, "value")
		if !factOK || !valueOK || !exactEvaluationKeys(fact, []string{"factKind", "factDigest", "value"}) ||
			stringMember(fact, "factKind") != expectedKind || stringMember(effectReceipt, "sourceFactKind") != expectedKind {
			return EvaluationOptionalFactSourceEvidence{}, ErrInvalid
		}
		_, computed, factErr := evaluationOptionalFactObservedValue(expectedKind, value)
		if factErr != nil || computed != stringMember(fact, "factDigest") ||
			computed != stringMember(effectReceipt, "sourceFactDigest") ||
			computed != stringMember(projection, "effectSourceFactDigest") {
			return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact explicit effect source fact drifted")
		}
		if expectedKind == "provider-job-receipt" && stringMember(value, "invocationId") != request.InvocationID ||
			expectedKind == "opaque-continuation" && (stringMember(value, "parentInvocationId") != request.InvocationID ||
				stringMember(value, "providerConfigurationId") != request.ProviderConfigurationID ||
				stringMember(value, "modelLineageDigest") != request.ModelLineageDigest) {
			return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact explicit source value binding drifted")
		}
		factValue, factDigest = value, computed
	} else if response["effectSourceFact"] != nil || effectReceipt["sourceFactKind"] != nil ||
		effectReceipt["sourceFactDigest"] != nil || projection["effectSourceFactDigest"] != nil {
		return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact unavailable effect carried a fact")
	}
	if sealedAt.Before(transport.Receipt.CompletedAt) || sealedAt.After(owner.CompletedAt) {
		return EvaluationOptionalFactSourceEvidence{}, conflict("optional fact effect source time binding drifted")
	}
	observedAt := transport.Receipt.CompletedAt
	if sealedAt.After(observedAt) {
		observedAt = sealedAt
	}
	if owner.CompletedAt.After(observedAt) {
		observedAt = owner.CompletedAt
	}
	sourceBase := map[string]any{
		"kind": request.Source.Kind, "planDigest": transport.Spool.PlanDigest,
		"repositoryCommit": transport.Spool.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "turnIndex": request.Value["turnIndex"],
		"invocationId": request.InvocationID, "providerRequestDigest": request.ProviderRequestDigest,
		"responseDigest": request.ResponseDigest, "dispatchIntentDigest": request.DispatchIntentDigest,
		"transportReceiptDigest":   request.TransportReceiptDigest,
		"resultSpoolReceiptDigest": evaluationOptionalFactNullableDigestValue(request.ResultSpoolReceiptDigest),
		"normalizedEventSetDigest": request.NormalizedEventSetDigest,
		"ownerRequestDigest":       owner.RequestDigest, "ownerReceiptDigest": owner.ReceiptDigest,
		"ownerStageDigest": owner.StageDigest, "ownerDispatchAckDigest": owner.DispatchAckDigest,
		"preEffectIntentDigest":     preEffectIntentDigest,
		"effectSourceReceiptDigest": request.Source.EffectSourceReceiptDigest,
		"effectSourceFactDigest":    nil,
		"businessResultDigest":      businessResultDigest, "outcome": map[string]string{
			"produced": "observed", "unavailable": "unavailable", "failed": "failed",
		}[effectStatus],
	}
	if factValue != nil {
		sourceBase["effectSourceFactDigest"], sourceBase["factDigest"] = factDigest, factDigest
	}
	sourceDigest, err := canonicaljson.Digest(sourceBase)
	if err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	return EvaluationOptionalFactSourceEvidence{
		Target: target, Kind: request.Source.Kind, SourceDigest: sourceDigest,
		OwnerRequestDigest: owner.RequestDigest, OwnerReceiptDigest: owner.ReceiptDigest,
		OwnerStageDigest: owner.StageDigest, OwnerDispatchAckDigest: owner.DispatchAckDigest,
		PreEffectIntentDigest: preEffectIntentDigest, EffectSourceReceiptDigest: request.Source.EffectSourceReceiptDigest,
		ProviderRuntimeJournalResultRecordDigest: stringMember(effectReceipt, "providerRuntimeJournalResultRecordDigest"),
		ProviderRuntimeResultSealReceiptDigest:   stringMember(effectReceipt, "providerRuntimeResultSealReceiptDigest"),
		EffectSourceFactDigest:                   factDigest, BusinessResultDigest: businessResultDigest,
		PreEffectIntentBytes:     append([]byte(nil), owner.PreEffectIntentBytes...),
		EffectSourceReceiptBytes: append([]byte(nil), effectReceiptBytes...),
		Outcome:                  sourceBase["outcome"].(string), FactKind: expectedKind, FactDigest: factDigest,
		Fact: factValue, ObservedAt: observedAt,
	}, nil
}

func sameEvaluationOptionalFactSourceRecord(left, right EvaluationOptionalFactSourceRecord) bool {
	return left.SourceRequestDigest == right.SourceRequestDigest && left.SourceSealDigest == right.SourceSealDigest &&
		left.SourceDigest == right.SourceDigest &&
		left.Outcome == right.Outcome && left.FactKind == right.FactKind && left.FactDigest == right.FactDigest &&
		left.NativeBootstrapSourceRequestDigest == right.NativeBootstrapSourceRequestDigest &&
		left.NativeBootstrapSourceReceiptDigest == right.NativeBootstrapSourceReceiptDigest &&
		left.NativeProviderSourceReceiptDigest == right.NativeProviderSourceReceiptDigest &&
		left.NativeProviderSourceDigest == right.NativeProviderSourceDigest &&
		left.ProviderRuntimeJournalResultRecordDigest == right.ProviderRuntimeJournalResultRecordDigest &&
		left.ProviderRuntimeResultSealReceiptDigest == right.ProviderRuntimeResultSealReceiptDigest &&
		bytes.Equal(left.PreEffectIntentBytes, right.PreEffectIntentBytes) &&
		bytes.Equal(left.EffectSourceReceiptBytes, right.EffectSourceReceiptBytes) &&
		bytes.Equal(left.FactBytes, right.FactBytes) &&
		bytes.Equal(left.ReceiptBytes, right.ReceiptBytes)
}
