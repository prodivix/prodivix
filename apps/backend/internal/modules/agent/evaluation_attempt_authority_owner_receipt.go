package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const maximumEvaluationAttemptAuthorityOwnerReceiptBytes = 16_384

// EvaluationAttemptAuthorityOwnerReceiptRecord is the canonical Backend
// authority fact produced only after the sidecar result has crossed the
// plan/lease/grant admission fence and the durable dispatch journal. It is the
// join authority consumed by the atomic attempt commit and evidence archive.
type EvaluationAttemptAuthorityOwnerReceiptRecord struct {
	NamespaceID                              string
	PlanDigest                               string
	RepositoryCommit                         string
	ServiceKind                              string
	Operation                                string
	AttemptID                                string
	DescriptorDigest                         string
	ShardLeaseOwnerID                        string
	ShardLeaseGeneration                     int64
	VerificationGrantGeneration              int64
	VerificationAttemptGrantReceiptSetDigest string
	RequestDigest                            string
	ResponseProjection                       map[string]any
	ResponseDigest                           string
	OwnerImplementationDigest                string
	CompletedAt                              time.Time
	ReceiptDigest                            string
	ReceiptBytes                             []byte
}

func expectedEvaluationAttemptAuthorityReceiptOperation(binding EvaluationControlledAuthorityRequestBinding) string {
	switch {
	case binding.ServiceKind == "provider-capability" && binding.Operation == "tool.execute":
		return "execute-tool"
	case binding.ServiceKind == "provider-capability" && binding.Operation == "capability.assess":
		return "assess-capability"
	case binding.ServiceKind == "attempt-grading" && binding.Operation == "grade-and-persist":
		return "grade-and-persist"
	default:
		return ""
	}
}

func expectedEvaluationAttemptAuthorityReceiptServiceKind(binding EvaluationControlledAuthorityRequestBinding) string {
	if binding.ServiceKind == "provider-capability" {
		return "capability-runtime"
	}
	if binding.ServiceKind == "attempt-grading" {
		return "attempt-grading"
	}
	return ""
}

func createEvaluationAttemptAuthorityOwnerReceipt(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	responseProjection map[string]any,
	completedAt time.Time,
) (EvaluationAttemptAuthorityOwnerReceiptRecord, error) {
	operation := expectedEvaluationAttemptAuthorityReceiptOperation(binding)
	serviceKind := expectedEvaluationAttemptAuthorityReceiptServiceKind(binding)
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	responseDigest, err := validateEvaluationAttemptAuthorityResponseProjection(
		responseProjection, serviceKind, operation,
	)
	if err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	if operation == "" || serviceKind == "" || completedAt.IsZero() {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrInvalid
	}
	completedAt = completedAt.UTC().Truncate(time.Millisecond)
	base := map[string]any{
		"format":                      evaluationAttemptAuthorityOwnerReceiptFormat,
		"version":                     evaluationAttemptAuthorityVersion,
		"serviceKind":                 serviceKind,
		"operation":                   operation,
		"namespaceId":                 authority.NamespaceID,
		"planDigest":                  partition.PlanDigest,
		"repositoryCommit":            partition.RepositoryCommit,
		"attemptId":                   binding.AttemptID,
		"descriptorDigest":            binding.DescriptorDigest,
		"shardLeaseOwnerId":           binding.ShardLeaseOwnerID,
		"shardLeaseGeneration":        binding.ShardLeaseGeneration,
		"verificationGrantGeneration": binding.VerificationGrantGeneration,
		"verificationAttemptGrantReceiptSetDigest": binding.VerificationGrantReceiptSetDigest,
		"requestDigest":             binding.RequestDigest,
		"responseProjection":        cloneEvaluationObject(responseProjection),
		"responseDigest":            responseDigest,
		"ownerImplementationDigest": binding.OwnerImplementationDigest,
		"completedAt":               completedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	base["receiptDigest"] = receiptDigest
	receiptBytes, err := canonicaljson.Bytes(base)
	if err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	if len(receiptBytes) > maximumEvaluationAttemptAuthorityOwnerReceiptBytes {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrInvalid
	}
	return EvaluationAttemptAuthorityOwnerReceiptRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, ServiceKind: serviceKind,
		Operation: operation, AttemptID: binding.AttemptID, DescriptorDigest: binding.DescriptorDigest,
		ShardLeaseOwnerID: binding.ShardLeaseOwnerID, ShardLeaseGeneration: binding.ShardLeaseGeneration,
		VerificationGrantGeneration:              binding.VerificationGrantGeneration,
		VerificationAttemptGrantReceiptSetDigest: binding.VerificationGrantReceiptSetDigest,
		RequestDigest:                            binding.RequestDigest,
		ResponseProjection:                       cloneEvaluationObject(responseProjection),
		ResponseDigest:                           responseDigest,
		OwnerImplementationDigest:                binding.OwnerImplementationDigest, CompletedAt: completedAt,
		ReceiptDigest: receiptDigest, ReceiptBytes: receiptBytes,
	}, nil
}

type evaluationAttemptAuthorityExecuteBinding struct {
	ExecutionAuthorityKind                     string
	InvocationID                               string
	TurnIndex                                  int64
	ToolID                                     string
	ToolCallID                                 string
	ProviderToolCallID                         string
	ProviderRequestDigest                      string
	ProviderCapabilityObservationReceiptDigest string
	PreEffectIntentDigest                      string
	PreEffectIntent                            map[string]any
}

type evaluationAttemptAuthorityAssessmentBinding struct {
	TerminalTurnIndex          int64
	TerminalInvocationID       string
	MaterialDigest             string
	CapabilityDescriptorDigest string
}

const evaluationCapabilityEffectInputAuthorityBindingFormat = "prodivix.agent-evaluation-capability-effect-input-authority-binding"

func evaluationAttemptAuthorityInputAuthorityBinding(
	value any,
) (map[string]any, EvaluationCapabilityEffectRequestRefAuthorityRecord, string, error) {
	binding, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(binding, []string{
		"format", "version", "bindingKind", "capabilityId", "requestRef", "targetRef",
		"requestRefAuthority", "requestRefAuthorityReceiptDigest", "sourceAttemptId", "sourceTurnIndex",
		"sourceInvocationId", "sourceProviderRequestDigest", "sourceResponseDigest", "sourceDispatchIntentDigest",
		"sourceTransportReceiptDigest", "sourceResultSpoolReceiptDigest", "sourceNormalizedEventSetDigest",
		"sourceObservationReceiptDigest", "sourceFactKind", "sourceProviderEventType", "sourceProviderToolCallId",
		"sourceToolId", "sourceArgumentsDigest", "sourceHandleDigest", "stateVaultSealRequest", "stateVaultSealReceipt",
		"protocolFamily", "providerConfigurationId", "modelLineageDigest", "adapterDigest",
		"sourceRegistryReceiptDigest", "bindingDigest",
	}) || stringMember(binding, "format") != evaluationCapabilityEffectInputAuthorityBindingFormat {
		return nil, EvaluationCapabilityEffectRequestRefAuthorityRecord{}, "", invalid("capability effect input binding shape")
	}
	version, versionOK := integerMember(binding, "version")
	bindingDigest := stringMember(binding, "bindingDigest")
	registryDigest := stringMember(binding, "sourceRegistryReceiptDigest")
	if !versionOK || version != evaluationCapabilityEffectInputAuthorityVersion ||
		!evaluationDigestPattern.MatchString(bindingDigest) ||
		!evaluationDigestPattern.MatchString(registryDigest) {
		return nil, EvaluationCapabilityEffectRequestRefAuthorityRecord{}, "", invalid("capability effect input binding identity")
	}
	bindingBase := cloneEvaluationObject(binding)
	delete(bindingBase, "bindingDigest")
	computedBindingDigest, err := canonicaljson.Digest(bindingBase)
	if err != nil || computedBindingDigest != bindingDigest {
		return nil, EvaluationCapabilityEffectRequestRefAuthorityRecord{}, "", ErrConflict
	}
	registryValue := cloneEvaluationObject(bindingBase)
	registryValue["format"] = evaluationCapabilityEffectInputRegistryReceiptFormat
	delete(registryValue, "sourceRegistryReceiptDigest")
	registryValue["receiptDigest"] = registryDigest
	registryBytes, err := canonicaljson.Bytes(registryValue)
	if err != nil {
		return nil, EvaluationCapabilityEffectRequestRefAuthorityRecord{}, "", invalid("capability effect input binding canonical registry")
	}
	registry, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(registryBytes)
	if err != nil || registry.ReceiptDigest != registryDigest ||
		registry.BindingKind != stringMember(binding, "bindingKind") {
		return nil, EvaluationCapabilityEffectRequestRefAuthorityRecord{}, "", ErrConflict
	}
	requestRefAuthority, ok := objectMember(binding, "requestRefAuthority")
	requestRefBytes, bytesErr := canonicaljson.Bytes(requestRefAuthority)
	requestRefRecord, requestRefErr := decodeEvaluationCapabilityEffectRequestRefAuthorityReceipt(requestRefBytes)
	if !ok || bytesErr != nil || requestRefErr != nil ||
		requestRefRecord.ReceiptDigest != stringMember(binding, "requestRefAuthorityReceiptDigest") {
		return nil, EvaluationCapabilityEffectRequestRefAuthorityRecord{}, "", ErrConflict
	}
	return binding, requestRefRecord, bindingDigest, nil
}

func evaluationAttemptAuthorityRuntimeFactSourceAuthority(
	value any,
) (map[string]any, string, error) {
	authority, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(authority, []string{
		"kind", "sourceKind", "sourceAuthorityId", "sourceAuthorityImplementationDigest", "routeBinding",
		"capabilityProfileId", "capabilityProfileDigest", "capabilityId", "protocolFamily",
		"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
		"registrationAuthorityIssuerId", "registrationReceiptDigest", "authorityDigest",
	}, "hostedRetrievalRuntimeResourceRegistrationIntentDigest") || stringMember(authority, "kind") != "shared-durable-capability" ||
		!oneOfString(stringMember(authority, "sourceKind"), "sealed-provider-response-metadata", "sealed-hosted-owner-result") {
		return nil, "", ErrInvalid
	}
	for _, field := range []string{
		"sourceAuthorityId", "routeBinding", "capabilityProfileId", "capabilityId", "protocolFamily",
		"providerConfigurationId", "modelId", "registrationAuthorityIssuerId",
	} {
		if !validEvaluationAgentControlIdentity(stringMember(authority, field)) {
			return nil, "", ErrInvalid
		}
	}
	for _, field := range []string{
		"sourceAuthorityImplementationDigest", "capabilityProfileDigest", "modelLineageDigest", "adapterDigest",
		"registrationReceiptDigest", "authorityDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(authority, field)) {
			return nil, "", ErrInvalid
		}
	}
	requiresHostedRuntimeResourceIntent := stringMember(authority, "capabilityId") == "provider.hosted-retrieval" &&
		oneOfString(stringMember(authority, "protocolFamily"), "openai-responses", "gemini-interactions")
	hostedRuntimeResourceIntentDigest, hasHostedRuntimeResourceIntent := authority["hostedRetrievalRuntimeResourceRegistrationIntentDigest"].(string)
	if requiresHostedRuntimeResourceIntent != hasHostedRuntimeResourceIntent ||
		hasHostedRuntimeResourceIntent && !evaluationDigestPattern.MatchString(hostedRuntimeResourceIntentDigest) {
		return nil, "", ErrInvalid
	}
	base := cloneEvaluationObject(authority)
	digest := stringMember(base, "authorityDigest")
	delete(base, "authorityDigest")
	computed, err := canonicaljson.Digest(base)
	if err != nil || computed != digest {
		return nil, "", ErrConflict
	}
	return authority, digest, nil
}

func evaluationAttemptAuthorityPreEffectIntent(
	payload map[string]any,
) (map[string]any, string, error) {
	intent, ok := objectMember(payload, "preEffectIntent")
	if !ok || !exactEvaluationKeys(intent, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"caseId", "materialDigest", "turnIndex", "invocationId", "toolId", "toolCallId", "providerToolCallId",
		"providerRequestDigest", "argumentsDigest", "requestedAt", "inputAuthorityBinding",
		"runtimeFactSourceAuthority", "registrationReceiptDigest",
		"ownerRequestId", "ownerRequestDigest", "intentDigest",
	}) || stringMember(intent, "format") != "prodivix.agent-evaluation-capability-pre-effect-intent" ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(intent, "repositoryCommit")) {
		return nil, "", ErrInvalid
	}
	version, versionOK := integerMember(intent, "version")
	turnIndex, turnOK := integerMember(intent, "turnIndex")
	expectedTurn, expectedTurnOK := integerMember(payload, "turnIndex")
	requestedAt, requestedErr := evaluationInstant(intent["requestedAt"], "capability effect requestedAt")
	if !versionOK || version != 1 || !turnOK || !expectedTurnOK || turnIndex < 0 || turnIndex >= 7 ||
		turnIndex != expectedTurn || requestedErr != nil {
		return nil, "", ErrInvalid
	}
	for _, field := range []string{
		"namespaceId", "attemptId", "caseId", "invocationId", "toolId", "toolCallId", "providerToolCallId", "ownerRequestId",
	} {
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
	for _, field := range []string{
		"namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest", "caseId", "materialDigest",
		"invocationId", "toolId", "toolCallId", "providerToolCallId",
	} {
		if stringMember(intent, field) != stringMember(payload, field) {
			return nil, "", ErrConflict
		}
	}
	if stringMember(intent, "providerRequestDigest") != stringMember(payload, "requestDigest") ||
		stringMember(intent, "argumentsDigest") != stringMember(payload, "argumentsDigest") {
		return nil, "", ErrConflict
	}
	authority, authorityDigest, err := evaluationAttemptAuthorityRuntimeFactSourceAuthority(intent["runtimeFactSourceAuthority"])
	if err != nil || stringMember(intent, "registrationReceiptDigest") != stringMember(authority, "registrationReceiptDigest") {
		return nil, "", ErrConflict
	}
	inputBinding, requestRefAuthority, inputBindingDigest, err :=
		evaluationAttemptAuthorityInputAuthorityBinding(intent["inputAuthorityBinding"])
	if err != nil {
		return nil, "", err
	}
	profile, profileOK := evaluationCapabilityEffectInputProfiles[stringMember(inputBinding, "bindingKind")]
	sourceTurnIndex, sourceTurnOK := integerMember(inputBinding, "sourceTurnIndex")
	retrieval := stringMember(inputBinding, "bindingKind") == "hosted-retrieval-query"
	argumentsDigest, digestErr := canonicaljson.Digest(map[string]any{
		"requestRef": inputBinding["requestRef"], "targetRef": inputBinding["targetRef"],
	})
	if !profileOK || !sourceTurnOK || digestErr != nil ||
		profile.CapabilityID != stringMember(authority, "capabilityId") ||
		profile.ToolID != stringMember(intent, "toolId") ||
		stringMember(inputBinding, "capabilityId") != stringMember(authority, "capabilityId") ||
		stringMember(inputBinding, "protocolFamily") != stringMember(authority, "protocolFamily") ||
		stringMember(inputBinding, "providerConfigurationId") != stringMember(authority, "providerConfigurationId") ||
		stringMember(inputBinding, "modelLineageDigest") != stringMember(authority, "modelLineageDigest") ||
		stringMember(inputBinding, "adapterDigest") != stringMember(authority, "adapterDigest") ||
		requestRefAuthority.NamespaceID != stringMember(intent, "namespaceId") ||
		requestRefAuthority.PlanDigest != stringMember(intent, "planDigest") ||
		requestRefAuthority.RepositoryCommit != stringMember(intent, "repositoryCommit") ||
		requestRefAuthority.AttemptID != stringMember(intent, "attemptId") ||
		requestRefAuthority.DescriptorDigest != stringMember(intent, "descriptorDigest") ||
		requestRefAuthority.TurnIndex != turnIndex || requestRefAuthority.InvocationID != stringMember(intent, "invocationId") ||
		requestRefAuthority.ToolID != stringMember(intent, "toolId") ||
		requestRefAuthority.RuntimeFactSourceAuthorityDigest != authorityDigest ||
		requestRefAuthority.RegistrationReceiptDigest != stringMember(intent, "registrationReceiptDigest") ||
		requestedAt.Before(requestRefAuthority.IssuedAt) || requestedAt.After(requestRefAuthority.ExpiresAt) ||
		stringMember(inputBinding, "sourceAttemptId") != stringMember(intent, "attemptId") ||
		argumentsDigest != stringMember(intent, "argumentsDigest") {
		return nil, "", ErrConflict
	}
	if retrieval {
		if sourceTurnIndex != turnIndex || stringMember(inputBinding, "sourceInvocationId") != stringMember(intent, "invocationId") ||
			stringMember(inputBinding, "sourceProviderRequestDigest") != stringMember(intent, "providerRequestDigest") ||
			stringMember(inputBinding, "sourceProviderToolCallId") != stringMember(intent, "providerToolCallId") ||
			stringMember(inputBinding, "sourceToolId") != stringMember(intent, "toolId") ||
			stringMember(inputBinding, "sourceArgumentsDigest") != stringMember(intent, "argumentsDigest") {
			return nil, "", ErrConflict
		}
	} else if sourceTurnIndex >= turnIndex || stringMember(inputBinding, "sourceInvocationId") == stringMember(intent, "invocationId") ||
		stringMember(inputBinding, "sourceProviderRequestDigest") == stringMember(intent, "providerRequestDigest") {
		return nil, "", ErrConflict
	}
	ownerBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-owner-request-identity", "version": int64(1),
		"namespaceId": stringMember(intent, "namespaceId"), "planDigest": stringMember(intent, "planDigest"),
		"repositoryCommit": stringMember(intent, "repositoryCommit"), "attemptId": stringMember(intent, "attemptId"),
		"descriptorDigest": stringMember(intent, "descriptorDigest"), "caseId": stringMember(intent, "caseId"),
		"materialDigest": stringMember(intent, "materialDigest"), "turnIndex": intent["turnIndex"],
		"invocationId": stringMember(intent, "invocationId"), "toolId": stringMember(intent, "toolId"),
		"toolCallId": stringMember(intent, "toolCallId"), "providerToolCallId": stringMember(intent, "providerToolCallId"),
		"providerRequestDigest": stringMember(intent, "providerRequestDigest"), "argumentsDigest": stringMember(intent, "argumentsDigest"),
		"requestedAt": intent["requestedAt"], "inputAuthorityBindingDigest": inputBindingDigest,
		"runtimeFactSourceAuthorityDigest": authorityDigest,
		"registrationReceiptDigest":        stringMember(intent, "registrationReceiptDigest"),
	}
	ownerDigest, err := canonicaljson.Digest(ownerBase)
	if err != nil || ownerDigest != stringMember(intent, "ownerRequestDigest") ||
		stringMember(intent, "ownerRequestId") != "capability-effect-owner-request."+ownerDigest[len("sha256-"):] {
		return nil, "", ErrConflict
	}
	base := cloneEvaluationObject(intent)
	digest := stringMember(base, "intentDigest")
	delete(base, "intentDigest")
	computed, err := canonicaljson.Digest(base)
	if err != nil || computed != digest || !evaluationCapabilityObjectWithin(intent, 16_384) {
		return nil, "", ErrConflict
	}
	return intent, digest, nil
}

func evaluationAttemptAuthoritySharedEffectResponse(
	value map[string]any,
	binding evaluationAttemptAuthorityExecuteBinding,
) (string, any, error) {
	if binding.ExecutionAuthorityKind != "shared-effect" || binding.PreEffectIntent == nil ||
		!exactEvaluationKeys(value, []string{
			"executionAuthorityKind", "outcome", "result", "resultDigest", "continuationReceiptDigest",
			"effectSourceReceipt", "effectSourceFact", "specificReceipts",
		}) || stringMember(value, "executionAuthorityKind") != "shared-effect" {
		return "", nil, ErrInvalid
	}
	receipts, receiptsOK := value["specificReceipts"].([]any)
	receipt, receiptOK := objectMember(value, "effectSourceReceipt")
	if !receiptsOK || len(receipts) != 0 || !receiptOK || !exactEvaluationKeys(receipt, []string{
		"format", "version", "intentDigest", "ownerRequestId", "ownerRequestDigest", "runtimeFactSourceAuthority",
		"registrationReceiptDigest", "effectStatus", "businessResultDigest", "sourceFactKind", "sourceFactDigest",
		"providerRuntimeJournalResultRecordDigest", "providerRuntimeResultSealReceiptDigest",
		"stageDigest", "dispatchAckDigest", "transportReceiptDigest", "resultSpoolReceiptDigest",
		"normalizedEventSetDigest", "stateVaultResolveRequest", "stateVaultResolveReceipt",
		"stateVaultRetireRequest", "stateVaultRetirementReceipt", "specificReceiptDigests", "sealedAt", "receiptDigest",
	}) || stringMember(receipt, "format") != "prodivix.agent-evaluation-capability-effect-source-receipt" {
		return "", nil, ErrInvalid
	}
	version, versionOK := integerMember(receipt, "version")
	specificDigests, specificOK := receipt["specificReceiptDigests"].([]any)
	if !versionOK || version != 1 || !specificOK || len(specificDigests) != 0 ||
		!oneOfString(stringMember(receipt, "effectStatus"), "produced", "unavailable", "failed") ||
		!validEvaluationAgentControlIdentity(stringMember(receipt, "ownerRequestId")) {
		return "", nil, ErrInvalid
	}
	for _, field := range []string{
		"intentDigest", "ownerRequestDigest", "registrationReceiptDigest", "businessResultDigest", "stageDigest",
		"providerRuntimeJournalResultRecordDigest", "providerRuntimeResultSealReceiptDigest",
		"dispatchAckDigest", "transportReceiptDigest", "normalizedEventSetDigest", "receiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(receipt, field)) {
			return "", nil, ErrInvalid
		}
	}
	if receipt["resultSpoolReceiptDigest"] != nil &&
		!evaluationDigestPattern.MatchString(stringMember(receipt, "resultSpoolReceiptDigest")) {
		return "", nil, ErrInvalid
	}
	intent := binding.PreEffectIntent
	if stringMember(receipt, "intentDigest") != binding.PreEffectIntentDigest ||
		stringMember(receipt, "ownerRequestId") != stringMember(intent, "ownerRequestId") ||
		stringMember(receipt, "ownerRequestDigest") != stringMember(intent, "ownerRequestDigest") ||
		stringMember(receipt, "registrationReceiptDigest") != stringMember(intent, "registrationReceiptDigest") ||
		!sameEvaluationCanonicalValue(receipt["runtimeFactSourceAuthority"], intent["runtimeFactSourceAuthority"]) ||
		stringMember(receipt, "businessResultDigest") != stringMember(value, "resultDigest") {
		return "", nil, ErrConflict
	}
	status := stringMember(receipt, "effectStatus")
	if status == "produced" && receipt["resultSpoolReceiptDigest"] == nil {
		return "", nil, ErrConflict
	}
	expectedOutcome := map[string]string{"produced": "supported", "unavailable": "unsupported", "failed": "failed"}[status]
	if stringMember(value, "outcome") != expectedOutcome {
		return "", nil, ErrConflict
	}
	if err := evaluationAttemptAuthoritySharedEffectStateVaultLifecycle(intent, receipt, status); err != nil {
		return "", nil, err
	}
	authority, _, err := evaluationAttemptAuthorityRuntimeFactSourceAuthority(receipt["runtimeFactSourceAuthority"])
	if err != nil {
		return "", nil, err
	}
	expectedFactKind := map[string]string{
		"provider.background-job": "provider-job-receipt", "provider.hosted-retrieval": "retrieval-query-receipt",
		"provider.isolated-cache": "provider-cache-receipt", "provider.reasoning-continuation": "opaque-continuation",
	}[stringMember(authority, "capabilityId")]
	fact := value["effectSourceFact"]
	if status == "produced" {
		factWrapper, ok := fact.(map[string]any)
		factValue, valueOK := objectMember(factWrapper, "value")
		factKind, factDigest := stringMember(factWrapper, "factKind"), stringMember(factWrapper, "factDigest")
		var computed string
		var factErr error
		if ok && valueOK && exactEvaluationKeys(factWrapper, []string{"factKind", "factDigest", "value"}) {
			switch factKind {
			case "provider-job-receipt":
				computed, factErr = validateEvaluationProviderCapabilityFact("provider-job", factValue)
			case "retrieval-query-receipt":
				computed, factErr = validateEvaluationProviderCapabilityFact("retrieval-query", factValue)
			case "provider-cache-receipt":
				computed, factErr = validateEvaluationProviderCapabilityFact("provider-cache", factValue)
			case "opaque-continuation":
				computed, factErr = validateEvaluationProviderOpaqueContinuation(factValue)
			default:
				factErr = ErrInvalid
			}
		}
		if !ok || !valueOK || expectedFactKind == "" || factKind != expectedFactKind ||
			stringMember(receipt, "sourceFactKind") != factKind ||
			stringMember(receipt, "sourceFactDigest") != factDigest ||
			!evaluationDigestPattern.MatchString(factDigest) || factErr != nil || computed != factDigest {
			return "", nil, ErrConflict
		}
	} else if fact != nil || receipt["sourceFactKind"] != nil || receipt["sourceFactDigest"] != nil {
		return "", nil, ErrConflict
	}
	base := cloneEvaluationObject(receipt)
	receiptDigest := stringMember(base, "receiptDigest")
	delete(base, "receiptDigest")
	computed, err := canonicaljson.Digest(base)
	if err != nil || computed != receiptDigest || !evaluationCapabilityObjectWithin(receipt, 16_384) {
		return "", nil, ErrConflict
	}
	return receiptDigest, fact, nil
}

func evaluationAttemptAuthoritySharedEffectStateVaultLifecycle(
	intent map[string]any,
	receipt map[string]any,
	effectStatus string,
) error {
	inputBinding, _, _, err := evaluationAttemptAuthorityInputAuthorityBinding(intent["inputAuthorityBinding"])
	if err != nil {
		return err
	}
	bindingKind := stringMember(inputBinding, "bindingKind")
	requiresStateVault := oneOfString(bindingKind, "provider-job", "opaque-continuation")
	if !requiresStateVault {
		for _, field := range []string{
			"stateVaultResolveRequest", "stateVaultResolveReceipt",
			"stateVaultRetireRequest", "stateVaultRetirementReceipt",
		} {
			if receipt[field] != nil {
				return conflict("capability effect included a state-vault lifecycle for a stateless binding")
			}
		}
		return nil
	}
	sealRequestValue, sealRequestOK := objectMember(inputBinding, "stateVaultSealRequest")
	sealReceiptValue, sealReceiptOK := objectMember(inputBinding, "stateVaultSealReceipt")
	resolveRequestValue, resolveRequestOK := objectMember(receipt, "stateVaultResolveRequest")
	resolveReceiptValue, resolveReceiptOK := objectMember(receipt, "stateVaultResolveReceipt")
	retireRequestValue, retireRequestOK := objectMember(receipt, "stateVaultRetireRequest")
	retirementReceiptValue, retirementReceiptOK := objectMember(receipt, "stateVaultRetirementReceipt")
	if !sealRequestOK || !sealReceiptOK || !resolveRequestOK || !resolveReceiptOK ||
		!retireRequestOK || !retirementReceiptOK {
		return conflict("capability effect state-vault lifecycle is incomplete")
	}
	sealRequestBytes, sealRequestBytesErr := canonicaljson.Bytes(sealRequestValue)
	sealReceiptBytes, sealReceiptBytesErr := canonicaljson.Bytes(sealReceiptValue)
	resolveRequestBytes, resolveRequestBytesErr := canonicaljson.Bytes(resolveRequestValue)
	resolveReceiptBytes, resolveReceiptBytesErr := canonicaljson.Bytes(resolveReceiptValue)
	retireRequestBytes, retireRequestBytesErr := canonicaljson.Bytes(retireRequestValue)
	retirementReceiptBytes, retirementReceiptBytesErr := canonicaljson.Bytes(retirementReceiptValue)
	sealRequest, sealRequestErr := decodeEvaluationNativeProviderStateVaultSealRequest(sealRequestBytes)
	sealReceipt, sealReceiptErr := decodeEvaluationNativeProviderStateVaultSealReceipt(sealReceiptBytes, sealRequest)
	resolveRequest, resolveRequestErr := decodeEvaluationNativeProviderStateVaultResolveRequest(resolveRequestBytes)
	resolveReceipt, resolveReceiptErr := decodeEvaluationNativeProviderStateVaultResolveReceipt(resolveReceiptBytes, resolveRequest)
	retireRequest, retireRequestErr := decodeEvaluationNativeProviderStateVaultRetireRequest(retireRequestBytes)
	retirementReceipt, retirementReceiptErr := decodeEvaluationNativeProviderStateVaultRetirementReceipt(
		retirementReceiptBytes, retireRequest, sealReceipt,
	)
	sealedAt, sealedAtErr := evaluationInstant(receipt["sealedAt"], "capability effect sealedAt")
	if sealRequestBytesErr != nil || sealReceiptBytesErr != nil || resolveRequestBytesErr != nil ||
		resolveReceiptBytesErr != nil || retireRequestBytesErr != nil || retirementReceiptBytesErr != nil ||
		sealRequestErr != nil || sealReceiptErr != nil || resolveRequestErr != nil || resolveReceiptErr != nil ||
		retireRequestErr != nil || retirementReceiptErr != nil || sealedAtErr != nil {
		return ErrInvalid
	}
	expectedPurpose := "background-job-state"
	if bindingKind == "opaque-continuation" {
		expectedPurpose = "reasoning-continuation-state"
	}
	if sealReceipt.Status != "sealed" || sealRequest.Purpose != expectedPurpose ||
		resolveRequest.SourceAttemptID != stringMember(inputBinding, "sourceAttemptId") ||
		resolveRequest.SourceInvocationID != stringMember(inputBinding, "sourceInvocationId") ||
		resolveRequest.ConsumerAttemptID != stringMember(intent, "attemptId") ||
		resolveRequest.ConsumerInvocationID != stringMember(intent, "invocationId") ||
		resolveRequest.ConsumerGeneration != sealRequest.Generation ||
		retireRequest.SealRequestDigest != sealRequest.SealRequestDigest ||
		retireRequest.SealReceiptDigest != sealReceipt.ReceiptDigest ||
		retireRequest.ResolveReceiptDigest != resolveReceipt.ReceiptDigest ||
		retirementReceipt.RetiredAt.After(sealedAt) ||
		(resolveReceipt.Status == "resolved" && retireRequest.Disposition != "consumed") ||
		(resolveReceipt.Status != "resolved" && retireRequest.Disposition == "consumed") ||
		(effectStatus == "produced" && resolveReceipt.Status != "resolved") {
		return conflict("capability effect state-vault lifecycle drifted")
	}
	return nil
}

func evaluationAttemptAuthorityExecuteBindingFromPayload(
	payload map[string]any,
) (evaluationAttemptAuthorityExecuteBinding, error) {
	turnIndex, turnOK := integerMember(payload, "turnIndex")
	binding := evaluationAttemptAuthorityExecuteBinding{
		ExecutionAuthorityKind: stringMember(payload, "executionAuthorityKind"),
		InvocationID:           stringMember(payload, "invocationId"),
		TurnIndex:              turnIndex,
		ToolID:                 stringMember(payload, "toolId"),
		ToolCallID:             stringMember(payload, "toolCallId"),
		ProviderToolCallID:     stringMember(payload, "providerToolCallId"),
		ProviderRequestDigest:  stringMember(payload, "requestDigest"),
	}
	if !turnOK || binding.TurnIndex < 0 || binding.TurnIndex > 64 ||
		!oneOfString(binding.ExecutionAuthorityKind, "shared-effect", "observation-control") ||
		!validEvaluationAgentControlIdentity(binding.InvocationID) ||
		!validEvaluationAgentControlIdentity(binding.ToolID) ||
		!validEvaluationAgentControlIdentity(binding.ToolCallID) ||
		!validEvaluationAgentControlIdentity(binding.ProviderToolCallID) ||
		!evaluationDigestPattern.MatchString(binding.ProviderRequestDigest) {
		return evaluationAttemptAuthorityExecuteBinding{}, ErrInvalid
	}
	if binding.ExecutionAuthorityKind == "shared-effect" {
		intent, digest, err := evaluationAttemptAuthorityPreEffectIntent(payload)
		if err != nil {
			return evaluationAttemptAuthorityExecuteBinding{}, err
		}
		binding.PreEffectIntent, binding.PreEffectIntentDigest = intent, digest
	} else {
		observation, ok := objectMember(payload, "providerCapabilityObservationReceipt")
		binding.ProviderCapabilityObservationReceiptDigest = stringMember(observation, "receiptDigest")
		if !ok || !evaluationDigestPattern.MatchString(binding.ProviderCapabilityObservationReceiptDigest) {
			return evaluationAttemptAuthorityExecuteBinding{}, ErrInvalid
		}
	}
	return binding, nil
}

func evaluationAttemptAuthorityExecuteBindingFromProjection(
	projection map[string]any,
) (evaluationAttemptAuthorityExecuteBinding, error) {
	turnIndex, turnOK := integerMember(projection, "turnIndex")
	binding := evaluationAttemptAuthorityExecuteBinding{
		ExecutionAuthorityKind: stringMember(projection, "executionAuthorityKind"),
		InvocationID:           stringMember(projection, "invocationId"),
		TurnIndex:              turnIndex,
		ToolID:                 stringMember(projection, "toolId"),
		ToolCallID:             stringMember(projection, "toolCallId"),
		ProviderToolCallID:     stringMember(projection, "providerToolCallId"),
		ProviderRequestDigest:  stringMember(projection, "providerRequestDigest"),
		ProviderCapabilityObservationReceiptDigest: stringMember(projection, "providerCapabilityObservationReceiptDigest"),
		PreEffectIntentDigest:                      stringMember(projection, "preEffectIntentDigest"),
	}
	if !turnOK || binding.TurnIndex < 0 || binding.TurnIndex > 64 ||
		!oneOfString(binding.ExecutionAuthorityKind, "shared-effect", "observation-control") ||
		!validEvaluationAgentControlIdentity(binding.InvocationID) ||
		!validEvaluationAgentControlIdentity(binding.ToolID) ||
		!validEvaluationAgentControlIdentity(binding.ToolCallID) ||
		!validEvaluationAgentControlIdentity(binding.ProviderToolCallID) ||
		!evaluationDigestPattern.MatchString(binding.ProviderRequestDigest) {
		return evaluationAttemptAuthorityExecuteBinding{}, ErrInvalid
	}
	if binding.ExecutionAuthorityKind == "shared-effect" {
		if !evaluationDigestPattern.MatchString(binding.PreEffectIntentDigest) ||
			binding.ProviderCapabilityObservationReceiptDigest != "" {
			return evaluationAttemptAuthorityExecuteBinding{}, ErrInvalid
		}
	} else if !evaluationDigestPattern.MatchString(binding.ProviderCapabilityObservationReceiptDigest) ||
		binding.PreEffectIntentDigest != "" {
		return evaluationAttemptAuthorityExecuteBinding{}, ErrInvalid
	}
	return binding, nil
}

func evaluationAttemptAuthorityAssessmentBindingFromPayload(
	payload map[string]any,
) (evaluationAttemptAuthorityAssessmentBinding, error) {
	terminalTurnIndex, turnOK := integerMember(payload, "terminalTurnIndex")
	material, materialOK := objectMember(payload, "material")
	capability, capabilityOK := objectMember(payload, "capabilityDescriptor")
	binding := evaluationAttemptAuthorityAssessmentBinding{
		TerminalTurnIndex:          terminalTurnIndex,
		TerminalInvocationID:       stringMember(payload, "terminalInvocationId"),
		MaterialDigest:             stringMember(material, "materialDigest"),
		CapabilityDescriptorDigest: stringMember(capability, "descriptorDigest"),
	}
	if !turnOK || terminalTurnIndex < 0 || terminalTurnIndex > 64 || !materialOK || !capabilityOK ||
		!validEvaluationServiceIdentity(binding.TerminalInvocationID) ||
		!evaluationDigestPattern.MatchString(binding.MaterialDigest) ||
		!evaluationDigestPattern.MatchString(binding.CapabilityDescriptorDigest) {
		return evaluationAttemptAuthorityAssessmentBinding{}, ErrInvalid
	}
	return binding, nil
}

func evaluationAttemptAuthorityAssessmentBindingFromProjection(
	projection map[string]any,
) (evaluationAttemptAuthorityAssessmentBinding, error) {
	terminalTurnIndex, turnOK := integerMember(projection, "terminalTurnIndex")
	binding := evaluationAttemptAuthorityAssessmentBinding{
		TerminalTurnIndex:          terminalTurnIndex,
		TerminalInvocationID:       stringMember(projection, "terminalInvocationId"),
		MaterialDigest:             stringMember(projection, "materialDigest"),
		CapabilityDescriptorDigest: stringMember(projection, "capabilityDescriptorDigest"),
	}
	if !turnOK || terminalTurnIndex < 0 || terminalTurnIndex > 64 ||
		!validEvaluationServiceIdentity(binding.TerminalInvocationID) ||
		!evaluationDigestPattern.MatchString(binding.MaterialDigest) ||
		!evaluationDigestPattern.MatchString(binding.CapabilityDescriptorDigest) {
		return evaluationAttemptAuthorityAssessmentBinding{}, ErrInvalid
	}
	return binding, nil
}

func evaluationAttemptAuthorityResponseProjection(
	serviceKind string,
	operation string,
	response []byte,
	executeBinding *evaluationAttemptAuthorityExecuteBinding,
	assessmentBinding *evaluationAttemptAuthorityAssessmentBinding,
) (map[string]any, string, error) {
	value, err := decodeCanonicalEvaluationObject(response, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil {
		return nil, "", err
	}
	projection := map[string]any{"serviceKind": serviceKind, "operation": operation}
	switch {
	case serviceKind == "capability-runtime" && operation == "execute-tool":
		if executeBinding == nil || !oneOfString(stringMember(value, "outcome"), "supported", "unsupported", "failed") ||
			!evaluationDigestPattern.MatchString(stringMember(value, "resultDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(value, "continuationReceiptDigest")) ||
			stringMember(value, "executionAuthorityKind") != executeBinding.ExecutionAuthorityKind {
			return nil, "", ErrInvalid
		}
		resultDigest, err := canonicaljson.Digest(value["result"])
		if err != nil || resultDigest != stringMember(value, "resultDigest") {
			return nil, "", ErrConflict
		}
		projection["executionAuthorityKind"] = executeBinding.ExecutionAuthorityKind
		projection["invocationId"] = executeBinding.InvocationID
		projection["turnIndex"] = json.Number(strconv.FormatInt(executeBinding.TurnIndex, 10))
		projection["toolId"] = executeBinding.ToolID
		projection["toolCallId"] = executeBinding.ToolCallID
		projection["providerToolCallId"] = executeBinding.ProviderToolCallID
		projection["providerRequestDigest"] = executeBinding.ProviderRequestDigest
		projection["outcome"] = stringMember(value, "outcome")
		projection["resultDigest"] = stringMember(value, "resultDigest")
		projection["continuationReceiptDigest"] = stringMember(value, "continuationReceiptDigest")
		if executeBinding.ExecutionAuthorityKind == "shared-effect" {
			effectReceiptDigest, effectFact, err := evaluationAttemptAuthoritySharedEffectResponse(value, *executeBinding)
			if err != nil {
				return nil, "", err
			}
			projection["preEffectIntentDigest"] = executeBinding.PreEffectIntentDigest
			projection["effectSourceReceiptDigest"] = effectReceiptDigest
			projection["effectSourceFactDigest"] = nil
			if effectFact != nil {
				factObject := effectFact.(map[string]any)
				projection["effectSourceFactDigest"] = stringMember(factObject, "factDigest")
			}
		} else {
			if !exactEvaluationKeys(value, []string{
				"executionAuthorityKind", "outcome", "result", "resultDigest", "continuationReceiptDigest", "specificReceipts",
			}) {
				return nil, "", ErrInvalid
			}
			projection["providerCapabilityObservationReceiptDigest"] =
				executeBinding.ProviderCapabilityObservationReceiptDigest
		}
	case serviceKind == "capability-runtime" && operation == "assess-capability":
		if !exactEvaluationKeys(value, []string{"outcome", "specificReceipts"}) ||
			!oneOfString(stringMember(value, "outcome"), "supported", "unsupported", "failed") ||
			assessmentBinding == nil {
			return nil, "", ErrInvalid
		}
		projection["terminalTurnIndex"] = json.Number(strconv.FormatInt(assessmentBinding.TerminalTurnIndex, 10))
		projection["terminalInvocationId"] = assessmentBinding.TerminalInvocationID
		projection["materialDigest"] = assessmentBinding.MaterialDigest
		projection["capabilityDescriptorDigest"] = assessmentBinding.CapabilityDescriptorDigest
		projection["outcome"] = stringMember(value, "outcome")
	case serviceKind == "attempt-grading" && operation == "grade-and-persist":
		if !exactEvaluationKeys(value, []string{"metricObservations", "gradingDigest"}) ||
			!evaluationDigestPattern.MatchString(stringMember(value, "gradingDigest")) {
			return nil, "", ErrInvalid
		}
		rawObservations, ok := value["metricObservations"].([]any)
		if !ok {
			return nil, "", ErrInvalid
		}
		observationDigests := make([]string, len(rawObservations))
		seen := make(map[string]struct{}, len(rawObservations))
		for index, raw := range rawObservations {
			entry, ok := raw.(map[string]any)
			digest := stringMember(entry, "observationDigest")
			if !ok || !evaluationDigestPattern.MatchString(digest) {
				return nil, "", ErrInvalid
			}
			if _, duplicate := seen[digest]; duplicate {
				return nil, "", ErrConflict
			}
			seen[digest] = struct{}{}
			observationDigests[index] = digest
		}
		sort.Strings(observationDigests)
		projection["gradingDigest"] = stringMember(value, "gradingDigest")
		projection["observationDigests"] = observationDigests
		digest, err := canonicaljson.Digest(projection)
		return projection, digest, err
	default:
		return nil, "", ErrInvalid
	}
	rawReceipts, ok := value["specificReceipts"].([]any)
	if !ok || len(rawReceipts) > 2 {
		return nil, "", ErrInvalid
	}
	type receiptProjection struct {
		kind   string
		digest string
	}
	receipts := make([]receiptProjection, len(rawReceipts))
	seenKinds := make(map[string]struct{}, len(rawReceipts))
	for index, raw := range rawReceipts {
		receipt, ok := raw.(map[string]any)
		kind, digest := stringMember(receipt, "receiptKind"), stringMember(receipt, "receiptDigest")
		if !ok || !validEvaluationServiceIdentity(kind) || !evaluationDigestPattern.MatchString(digest) {
			return nil, "", ErrInvalid
		}
		if _, duplicate := seenKinds[kind]; duplicate {
			return nil, "", ErrConflict
		}
		seenKinds[kind] = struct{}{}
		receipts[index] = receiptProjection{kind: kind, digest: digest}
	}
	sort.Slice(receipts, func(left, right int) bool {
		if receipts[left].kind == receipts[right].kind {
			return receipts[left].digest < receipts[right].digest
		}
		return receipts[left].kind < receipts[right].kind
	})
	projectedReceipts := make([]any, len(receipts))
	for index, receipt := range receipts {
		projectedReceipts[index] = map[string]any{
			"receiptKind": receipt.kind, "receiptDigest": receipt.digest,
		}
	}
	projection["specificReceiptDigests"] = projectedReceipts
	digest, err := canonicaljson.Digest(projection)
	return projection, digest, err
}

func validateEvaluationAttemptAuthorityResponseProjection(
	projection map[string]any,
	serviceKind string,
	operation string,
) (string, error) {
	if stringMember(projection, "serviceKind") != serviceKind ||
		stringMember(projection, "operation") != operation {
		return "", ErrConflict
	}
	switch {
	case serviceKind == "capability-runtime" && operation == "execute-tool":
		sharedEffect := stringMember(projection, "executionAuthorityKind") == "shared-effect"
		expectedKeys := []string{
			"serviceKind", "operation", "executionAuthorityKind", "invocationId", "turnIndex", "toolId", "toolCallId",
			"providerToolCallId", "providerRequestDigest", "outcome", "resultDigest", "continuationReceiptDigest",
			"providerCapabilityObservationReceiptDigest", "specificReceiptDigests",
		}
		if sharedEffect {
			expectedKeys = []string{
				"serviceKind", "operation", "executionAuthorityKind", "invocationId", "turnIndex", "toolId", "toolCallId",
				"providerToolCallId", "providerRequestDigest", "outcome", "resultDigest", "continuationReceiptDigest",
				"preEffectIntentDigest", "effectSourceReceiptDigest", "effectSourceFactDigest", "specificReceiptDigests",
			}
		}
		if !exactEvaluationKeys(projection, expectedKeys) ||
			!oneOfString(stringMember(projection, "executionAuthorityKind"), "shared-effect", "observation-control") ||
			!oneOfString(stringMember(projection, "outcome"), "supported", "unsupported", "failed") ||
			!evaluationDigestPattern.MatchString(stringMember(projection, "resultDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(projection, "continuationReceiptDigest")) {
			return "", ErrInvalid
		}
		if _, err := evaluationAttemptAuthorityExecuteBindingFromProjection(projection); err != nil {
			return "", err
		}
		projectedReceipts, err := evaluationAttemptAuthoritySpecificReceiptProjection(projection["specificReceiptDigests"])
		if err != nil {
			return "", err
		}
		if sharedEffect && (len(projectedReceipts) != 0 ||
			!evaluationDigestPattern.MatchString(stringMember(projection, "effectSourceReceiptDigest")) ||
			(projection["effectSourceFactDigest"] != nil &&
				!evaluationDigestPattern.MatchString(stringMember(projection, "effectSourceFactDigest")))) {
			return "", ErrInvalid
		}
	case serviceKind == "capability-runtime" && operation == "assess-capability":
		if !exactEvaluationKeys(projection, []string{
			"serviceKind", "operation", "terminalTurnIndex", "terminalInvocationId",
			"materialDigest", "capabilityDescriptorDigest", "outcome", "specificReceiptDigests",
		}) || !oneOfString(stringMember(projection, "outcome"), "supported", "unsupported", "failed") {
			return "", ErrInvalid
		}
		if _, err := evaluationAttemptAuthorityAssessmentBindingFromProjection(projection); err != nil {
			return "", err
		}
		if _, err := evaluationAttemptAuthoritySpecificReceiptProjection(projection["specificReceiptDigests"]); err != nil {
			return "", err
		}
	case serviceKind == "attempt-grading" && operation == "grade-and-persist":
		if !exactEvaluationKeys(projection, []string{
			"serviceKind", "operation", "gradingDigest", "observationDigests",
		}) || !evaluationDigestPattern.MatchString(stringMember(projection, "gradingDigest")) {
			return "", ErrInvalid
		}
		if _, err := evaluationCapabilityExactDigestArray(projection["observationDigests"], 256, false); err != nil {
			return "", err
		}
	default:
		return "", ErrInvalid
	}
	return canonicaljson.Digest(projection)
}

func evaluationAttemptAuthoritySpecificReceiptProjection(value any) ([]map[string]any, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > maximumEvaluationCapabilitySpecificPerAttempt {
		return nil, ErrInvalid
	}
	result := make([]map[string]any, len(raw))
	previousKind, previousDigest := "", ""
	for index, entry := range raw {
		receipt, ok := entry.(map[string]any)
		kind, digest := stringMember(receipt, "receiptKind"), stringMember(receipt, "receiptDigest")
		if !ok || !exactEvaluationKeys(receipt, []string{"receiptKind", "receiptDigest"}) ||
			!validEvaluationServiceIdentity(kind) || !evaluationDigestPattern.MatchString(digest) ||
			(index > 0 && (previousKind > kind || previousKind == kind && previousDigest >= digest)) ||
			(index > 0 && previousKind == kind) {
			return nil, ErrInvalid
		}
		previousKind, previousDigest, result[index] = kind, digest, receipt
	}
	return result, nil
}

func decodeEvaluationAttemptAuthorityOwnerReceipt(
	source []byte,
) (EvaluationAttemptAuthorityOwnerReceiptRecord, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationAttemptAuthorityOwnerReceiptBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "serviceKind", "operation", "namespaceId", "planDigest",
		"repositoryCommit", "attemptId", "descriptorDigest", "shardLeaseOwnerId",
		"shardLeaseGeneration", "verificationGrantGeneration",
		"verificationAttemptGrantReceiptSetDigest", "requestDigest", "responseProjection", "responseDigest",
		"ownerImplementationDigest", "completedAt", "receiptDigest",
	}) || stringMember(value, "format") != evaluationAttemptAuthorityOwnerReceiptFormat ||
		!oneOfString(stringMember(value, "serviceKind"), "capability-runtime", "attempt-grading") ||
		!oneOfString(stringMember(value, "operation"), "execute-tool", "assess-capability", "grade-and-persist") ||
		(stringMember(value, "serviceKind") == "capability-runtime") !=
			oneOfString(stringMember(value, "operation"), "execute-tool", "assess-capability") ||
		!validEvaluationServiceIdentity(stringMember(value, "namespaceId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationServiceIdentity(stringMember(value, "attemptId")) ||
		!validEvaluationServiceIdentity(stringMember(value, "shardLeaseOwnerId")) {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	shardGeneration, shardOK := integerMember(value, "shardLeaseGeneration")
	verificationGeneration, verificationOK := integerMember(value, "verificationGrantGeneration")
	if !versionOK || version != evaluationAttemptAuthorityVersion || !shardOK || shardGeneration < 1 ||
		!verificationOK || verificationGeneration < 1 {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrInvalid
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "verificationAttemptGrantReceiptSetDigest",
		"requestDigest", "responseDigest", "ownerImplementationDigest", "receiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrInvalid
		}
	}
	completedAt, err := parseEvaluationServiceInstant(stringMember(value, "completedAt"))
	if err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrInvalid
	}
	responseProjection, ok := objectMember(value, "responseProjection")
	if !ok {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrInvalid
	}
	responseDigest, err := validateEvaluationAttemptAuthorityResponseProjection(
		responseProjection, stringMember(value, "serviceKind"), stringMember(value, "operation"),
	)
	if err != nil || responseDigest != stringMember(value, "responseDigest") {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrConflict
	}
	base := cloneEvaluationObject(value)
	delete(base, "receiptDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "receiptDigest") {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrConflict
	}
	return EvaluationAttemptAuthorityOwnerReceiptRecord{
		NamespaceID: stringMember(value, "namespaceId"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), ServiceKind: stringMember(value, "serviceKind"),
		Operation: stringMember(value, "operation"), AttemptID: stringMember(value, "attemptId"),
		DescriptorDigest:  stringMember(value, "descriptorDigest"),
		ShardLeaseOwnerID: stringMember(value, "shardLeaseOwnerId"), ShardLeaseGeneration: shardGeneration,
		VerificationGrantGeneration:              verificationGeneration,
		VerificationAttemptGrantReceiptSetDigest: stringMember(value, "verificationAttemptGrantReceiptSetDigest"),
		RequestDigest:                            stringMember(value, "requestDigest"),
		ResponseProjection:                       cloneEvaluationObject(responseProjection),
		ResponseDigest:                           stringMember(value, "responseDigest"),
		OwnerImplementationDigest:                stringMember(value, "ownerImplementationDigest"), CompletedAt: completedAt,
		ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: append([]byte(nil), source...),
	}, nil
}

func evaluationAttemptAuthorityOwnerReceiptMatches(
	receipt EvaluationAttemptAuthorityOwnerReceiptRecord,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
) bool {
	return receipt.NamespaceID == authority.NamespaceID && receipt.PlanDigest == partition.PlanDigest &&
		receipt.RepositoryCommit == partition.RepositoryCommit &&
		receipt.ServiceKind == expectedEvaluationAttemptAuthorityReceiptServiceKind(binding) &&
		receipt.Operation == expectedEvaluationAttemptAuthorityReceiptOperation(binding) &&
		receipt.AttemptID == binding.AttemptID && receipt.DescriptorDigest == binding.DescriptorDigest &&
		receipt.ShardLeaseOwnerID == binding.ShardLeaseOwnerID &&
		receipt.ShardLeaseGeneration == binding.ShardLeaseGeneration &&
		receipt.VerificationGrantGeneration == binding.VerificationGrantGeneration &&
		receipt.VerificationAttemptGrantReceiptSetDigest == binding.VerificationGrantReceiptSetDigest &&
		receipt.RequestDigest == binding.RequestDigest &&
		receipt.OwnerImplementationDigest == binding.OwnerImplementationDigest
}

func scanEvaluationAttemptAuthorityOwnerReceipt(
	row interface{ Scan(...any) error },
) (EvaluationAttemptAuthorityOwnerReceiptRecord, error) {
	var record EvaluationAttemptAuthorityOwnerReceiptRecord
	if err := row.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &record.ServiceKind,
		&record.Operation, &record.AttemptID, &record.DescriptorDigest, &record.ShardLeaseOwnerID,
		&record.ShardLeaseGeneration, &record.VerificationGrantGeneration,
		&record.VerificationAttemptGrantReceiptSetDigest, &record.RequestDigest, &record.ResponseDigest,
		&record.OwnerImplementationDigest, &record.CompletedAt, &record.ReceiptDigest, &record.ReceiptBytes,
	); errors.Is(err, sql.ErrNoRows) {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrNotFound
	} else if err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	decoded, err := decodeEvaluationAttemptAuthorityOwnerReceipt(record.ReceiptBytes)
	if err != nil || decoded.NamespaceID != record.NamespaceID || decoded.PlanDigest != record.PlanDigest ||
		decoded.RepositoryCommit != record.RepositoryCommit || decoded.ServiceKind != record.ServiceKind ||
		decoded.Operation != record.Operation || decoded.AttemptID != record.AttemptID ||
		decoded.DescriptorDigest != record.DescriptorDigest || decoded.ShardLeaseOwnerID != record.ShardLeaseOwnerID ||
		decoded.ShardLeaseGeneration != record.ShardLeaseGeneration ||
		decoded.VerificationGrantGeneration != record.VerificationGrantGeneration ||
		decoded.VerificationAttemptGrantReceiptSetDigest != record.VerificationAttemptGrantReceiptSetDigest ||
		decoded.RequestDigest != record.RequestDigest || decoded.ResponseDigest != record.ResponseDigest ||
		decoded.OwnerImplementationDigest != record.OwnerImplementationDigest ||
		!decoded.CompletedAt.Equal(record.CompletedAt) || decoded.ReceiptDigest != record.ReceiptDigest {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrConflict
	}
	return decoded, nil
}

func queryEvaluationAttemptAuthorityOwnerReceipt(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
) (EvaluationAttemptAuthorityOwnerReceiptRecord, error) {
	return scanEvaluationAttemptAuthorityOwnerReceipt(queryer.QueryRowContext(ctx, `SELECT
		namespace_id, plan_digest, repository_commit, service_kind, operation, attempt_id,
		descriptor_digest, shard_lease_owner_id, shard_lease_generation,
		verification_grant_generation, verification_grant_receipt_set_digest,
		request_digest, response_digest, owner_implementation_digest, completed_at,
		receipt_digest, receipt_bytes
	FROM agent_evaluation_attempt_authority_owner_receipts
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND journal_service_kind=$4 AND request_digest=$5`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, binding.ServiceKind, binding.RequestDigest))
}

func evaluationAttemptAuthorityJournalServiceKind(serviceKind string) string {
	if serviceKind == "capability-runtime" {
		return "provider-capability"
	}
	if serviceKind == "attempt-grading" {
		return "attempt-grading"
	}
	return ""
}

func queryEvaluationAttemptAuthorityOwnerReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
	committedOnly bool,
) ([]EvaluationAttemptAuthorityOwnerReceiptRecord, error) {
	query := `SELECT
		namespace_id, plan_digest, repository_commit, service_kind, operation, attempt_id,
		descriptor_digest, shard_lease_owner_id, shard_lease_generation,
		verification_grant_generation, verification_grant_receipt_set_digest,
		request_digest, response_digest, owner_implementation_digest, completed_at,
		receipt_digest, receipt_bytes
	FROM agent_evaluation_attempt_authority_owner_receipts AS owner
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`
	args := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	if attemptID != "" {
		query += ` AND attempt_id=$4`
		args = append(args, attemptID)
	}
	if committedOnly {
		query += ` AND EXISTS (
			SELECT 1 FROM agent_evaluation_attempt_authority_commit_links AS link
			WHERE link.namespace_id=owner.namespace_id AND link.plan_digest=owner.plan_digest
				AND link.repository_commit=owner.repository_commit
				AND link.receipt_digest=owner.receipt_digest
		)`
	}
	query += ` ORDER BY attempt_id COLLATE "C", service_kind COLLATE "C",
		operation COLLATE "C", request_digest COLLATE "C"`
	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationAttemptAuthorityOwnerReceiptRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationAttemptAuthorityOwnerReceipt(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func evaluationAttemptAuthorityOwnerReceiptSetDigest(
	records []EvaluationAttemptAuthorityOwnerReceiptRecord,
) (string, error) {
	ordered := append([]EvaluationAttemptAuthorityOwnerReceiptRecord(nil), records...)
	sort.Slice(ordered, func(left, right int) bool {
		if ordered[left].AttemptID != ordered[right].AttemptID {
			return ordered[left].AttemptID < ordered[right].AttemptID
		}
		if ordered[left].ServiceKind != ordered[right].ServiceKind {
			return ordered[left].ServiceKind < ordered[right].ServiceKind
		}
		if ordered[left].Operation != ordered[right].Operation {
			return ordered[left].Operation < ordered[right].Operation
		}
		return ordered[left].RequestDigest < ordered[right].RequestDigest
	})
	digests := make([]string, len(ordered))
	seen := make(map[string]struct{}, len(ordered))
	for index, record := range ordered {
		identity := record.AttemptID + "\x00" + record.ServiceKind + "\x00" + record.Operation + "\x00" + record.RequestDigest
		if _, duplicate := seen[identity]; duplicate || !evaluationDigestPattern.MatchString(record.ReceiptDigest) {
			return "", conflict("evaluation attempt-authority owner receipt set contains duplicate or invalid authority")
		}
		seen[identity], digests[index] = struct{}{}, record.ReceiptDigest
	}
	return canonicaljson.Digest(map[string]any{"receiptDigests": digests})
}

func validateEvaluationAttemptAuthorityOwnerJournal(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	receipt EvaluationAttemptAuthorityOwnerReceiptRecord,
) error {
	journalServiceKind := evaluationAttemptAuthorityJournalServiceKind(receipt.ServiceKind)
	if journalServiceKind == "" {
		return ErrInvalid
	}
	var state, operation, attemptID, descriptorDigest, shardLeaseOwnerID string
	var v46Eligible bool
	var shardLeaseGeneration, verificationGrantGeneration int64
	var verificationGrantSetDigest, ownerImplementationDigest, responseDigest string
	var responseBytes []byte
	err := tx.QueryRowContext(ctx, `SELECT v46_eligible,state,operation,attempt_id,descriptor_digest,
		shard_lease_owner_id,shard_lease_generation,verification_grant_generation,
		verification_grant_receipt_set_digest,owner_implementation_digest,response_digest,response_bytes
	FROM agent_evaluation_controlled_authority_requests
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND request_digest=$5 FOR SHARE`, namespaceID, partition.PlanDigest,
		partition.RepositoryCommit, journalServiceKind, receipt.RequestDigest).Scan(
		&v46Eligible, &state, &operation, &attemptID, &descriptorDigest, &shardLeaseOwnerID,
		&shardLeaseGeneration, &verificationGrantGeneration, &verificationGrantSetDigest,
		&ownerImplementationDigest, &responseDigest, &responseBytes,
	)
	if err != nil {
		return err
	}
	if !v46Eligible {
		return conflict("evaluation attempt-authority owner journal is legacy-ineligible and requires requalification")
	}
	expectedOperation := "grade-and-persist"
	if receipt.Operation == "execute-tool" {
		expectedOperation = "tool.execute"
	} else if receipt.Operation == "assess-capability" {
		expectedOperation = "capability.assess"
	}
	rawDigest, err := evaluationCanonicalByteDigest(responseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil || state != "sealed" || operation != expectedOperation ||
		attemptID != receipt.AttemptID || descriptorDigest != receipt.DescriptorDigest ||
		shardLeaseOwnerID != receipt.ShardLeaseOwnerID || shardLeaseGeneration != receipt.ShardLeaseGeneration ||
		verificationGrantGeneration != receipt.VerificationGrantGeneration ||
		verificationGrantSetDigest != receipt.VerificationAttemptGrantReceiptSetDigest ||
		ownerImplementationDigest != receipt.OwnerImplementationDigest || rawDigest != responseDigest {
		return conflict("evaluation attempt-authority owner receipt drifted from its sealed dispatch journal")
	}
	var executeBinding *evaluationAttemptAuthorityExecuteBinding
	var assessmentBinding *evaluationAttemptAuthorityAssessmentBinding
	if receipt.Operation == "execute-tool" {
		value, bindingErr := evaluationAttemptAuthorityExecuteBindingFromProjection(receipt.ResponseProjection)
		if bindingErr != nil {
			return bindingErr
		}
		executeBinding = &value
	} else if receipt.Operation == "assess-capability" {
		value, bindingErr := evaluationAttemptAuthorityAssessmentBindingFromProjection(receipt.ResponseProjection)
		if bindingErr != nil {
			return bindingErr
		}
		assessmentBinding = &value
	}
	projection, projectionDigest, err := evaluationAttemptAuthorityResponseProjection(
		receipt.ServiceKind, receipt.Operation, responseBytes, executeBinding, assessmentBinding,
	)
	if err != nil || projectionDigest != receipt.ResponseDigest ||
		!sameEvaluationCanonicalValue(projection, receipt.ResponseProjection) {
		return conflict("evaluation attempt-authority owner response projection drifted")
	}
	return nil
}

func (repository *Repository) ListEvaluationAttemptAuthorityOwnerReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationAttemptAuthorityOwnerReceiptRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationAttemptAuthorityOwnerReceipts(
		readContext, tx, authority.NamespaceID, partition, "", true,
	)
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationAttemptAuthorityOwnerReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
) (EvaluationAttemptAuthorityOwnerReceiptRecord, error) {
	if err := repository.available(); err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil ||
		expectedEvaluationAttemptAuthorityReceiptOperation(binding) == "" {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	receipt, err := queryEvaluationAttemptAuthorityOwnerReceipt(ctx, repository.db, authority, partition, binding)
	if err != nil {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, err
	}
	if !evaluationAttemptAuthorityOwnerReceiptMatches(receipt, authority, partition, binding) {
		return EvaluationAttemptAuthorityOwnerReceiptRecord{}, ErrConflict
	}
	return receipt, nil
}

// StoreEvaluationAttemptAuthorityOwnerResult closes the host-loss window for
// shared capability effects. The sidecar writes the exact raw result and ACK
// before returning from Execute; a ledger retry can then finish the existing
// owner-receipt transaction without invoking the effect owner again.
func (repository *Repository) StoreEvaluationAttemptAuthorityOwnerResult(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	stageDigest string,
	responseDigest string,
	responseBytes []byte,
	dispatchAckDigest string,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := validateEvaluationAttemptAuthorityDurableOwnerResult(
		authority, partition, binding, stageDigest, responseDigest, responseBytes, dispatchAckDigest,
	); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	record, err := queryEvaluationControlledAuthorityRequest(ctx, tx, authority, partition, binding, true)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if record.StageDigest != stageDigest || record.OwnerImplementationDigest != binding.OwnerImplementationDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	if err := requireEvaluationAttemptAuthoritySharedEffectStateVaultLifecycle(
		ctx, tx, authority, partition, binding, responseBytes,
	); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := requireEvaluationAttemptAuthoritySharedEffectProviderJournalLifecycle(
		ctx, tx, authority, partition, binding, responseBytes,
	); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if record.State == "sealed" || record.DispatchAckDigest != "" {
		if record.ResponseDigest != responseDigest || !bytes.Equal(record.ResponseBytes, responseBytes) ||
			record.DispatchAckDigest != dispatchAckDigest {
			return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return EvaluationControlledAuthorityRequestRecord{}, false, err
		}
		return record, true, nil
	}
	if record.State != "dispatched" || record.ResponseDigest != "" || len(record.ResponseBytes) != 0 {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	result, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET response_digest=$6, response_bytes=$7, dispatch_ack_digest=$8
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='dispatched'
			AND response_digest IS NULL AND response_bytes IS NULL AND dispatch_ack_digest IS NULL
			AND pre_effect_intent_digest=$9 AND pre_effect_intent_bytes=$10
			AND owner_implementation_digest=$11 AND stage_digest=$12
			AND claim_generation=1 AND v46_eligible`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, binding.ServiceKind, binding.RequestDigest,
		responseDigest, responseBytes, dispatchAckDigest, binding.PreEffectIntentDigest,
		binding.PreEffectIntentBytes, binding.OwnerImplementationDigest, stageDigest)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil || updated != 1 {
		if err != nil {
			return EvaluationControlledAuthorityRequestRecord{}, false, err
		}
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	record, err = queryEvaluationControlledAuthorityRequest(ctx, tx, authority, partition, binding)
	if err != nil || record.State != "dispatched" || record.ResponseDigest != responseDigest ||
		!bytes.Equal(record.ResponseBytes, responseBytes) || record.DispatchAckDigest != dispatchAckDigest {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, false, err
	}
	return record, false, nil
}

// SealEvaluationAttemptAuthorityRequest atomically seals the owner response
// and appends the canonical Backend authority fact. The crash window cannot
// produce a sealed response without its joinable owner receipt.
func (repository *Repository) SealEvaluationAttemptAuthorityRequest(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	responseDigest string,
	responseBytes []byte,
	dispatchAckDigest string,
	observations []EvaluationProviderCapabilityObservationReceiptRecord,
	receipt EvaluationAttemptAuthorityOwnerReceiptRecord,
) (EvaluationControlledAuthorityRequestRecord, EvaluationAttemptAuthorityOwnerReceiptRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	if err := validateEvaluationControlledAuthorityBinding(partition, binding); err != nil || claimGeneration != 1 ||
		expectedEvaluationAttemptAuthorityReceiptOperation(binding) == "" ||
		!evaluationDigestPattern.MatchString(dispatchAckDigest) {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, ErrInvalid
	}
	observationSetDigest, err := evaluationProviderCapabilityObservationReceiptSetDigest(observations)
	if err != nil || observationSetDigest != binding.ProviderCapabilityObservationReceiptSetDigest {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, ErrConflict
	}
	computedResponseDigest, err := evaluationCanonicalByteDigest(
		responseBytes, maximumEvaluationAttemptAuthorityResponseBytes,
	)
	if err != nil || computedResponseDigest != responseDigest {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, ErrInvalid
	}
	var executeBinding *evaluationAttemptAuthorityExecuteBinding
	var assessmentBinding *evaluationAttemptAuthorityAssessmentBinding
	if decodedReceipt, decodeErr := decodeEvaluationAttemptAuthorityOwnerReceipt(receipt.ReceiptBytes); decodeErr == nil &&
		expectedEvaluationAttemptAuthorityReceiptOperation(binding) == "execute-tool" {
		bindingValue, bindingErr := evaluationAttemptAuthorityExecuteBindingFromProjection(decodedReceipt.ResponseProjection)
		if bindingErr != nil {
			return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, bindingErr
		}
		executeBinding = &bindingValue
	} else if decodeErr == nil && expectedEvaluationAttemptAuthorityReceiptOperation(binding) == "assess-capability" {
		bindingValue, bindingErr := evaluationAttemptAuthorityAssessmentBindingFromProjection(decodedReceipt.ResponseProjection)
		if bindingErr != nil {
			return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, bindingErr
		}
		assessmentBinding = &bindingValue
	}
	projection, projectionDigest, err := evaluationAttemptAuthorityResponseProjection(
		expectedEvaluationAttemptAuthorityReceiptServiceKind(binding),
		expectedEvaluationAttemptAuthorityReceiptOperation(binding),
		responseBytes,
		executeBinding,
		assessmentBinding,
	)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	decodedReceipt, err := decodeEvaluationAttemptAuthorityOwnerReceipt(receipt.ReceiptBytes)
	if err != nil || !evaluationAttemptAuthorityOwnerReceiptMatches(
		decodedReceipt, authority, partition, binding,
	) || decodedReceipt.ResponseDigest != projectionDigest ||
		!sameEvaluationCanonicalValue(decodedReceipt.ResponseProjection, projection) ||
		decodedReceipt.ReceiptDigest != receipt.ReceiptDigest ||
		!decodedReceipt.CompletedAt.Equal(receipt.CompletedAt) {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_controlled_authority_requests
		SET state='sealed', response_digest=$6, response_bytes=$7,
			dispatch_ack_digest=$8, sealed_at=$9
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind=$4 AND request_digest=$5 AND state='dispatched'
			AND (dispatch_ack_digest IS NULL OR
				(dispatch_ack_digest=$8 AND response_digest=$6 AND response_bytes=$7))
			AND claim_generation=1 AND v46_eligible`, authority.NamespaceID, partition.PlanDigest,
		partition.RepositoryCommit, binding.ServiceKind, binding.RequestDigest,
		responseDigest, responseBytes, dispatchAckDigest, decodedReceipt.CompletedAt)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	if updated == 1 {
		for _, observation := range observations {
			if err := insertEvaluationProviderCapabilityObservationReceipt(
				ctx, tx, authority.NamespaceID, partition, observation,
			); err != nil {
				return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
			}
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_attempt_authority_owner_receipts (
			namespace_id, plan_digest, repository_commit, journal_service_kind,
			service_kind, operation, attempt_id,
			descriptor_digest, shard_lease_owner_id, shard_lease_generation,
			verification_grant_generation, verification_grant_receipt_set_digest,
			request_digest, response_digest, owner_implementation_digest, completed_at,
			receipt_digest, receipt_json, receipt_bytes
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)`,
			decodedReceipt.NamespaceID, decodedReceipt.PlanDigest, decodedReceipt.RepositoryCommit,
			binding.ServiceKind, decodedReceipt.ServiceKind, decodedReceipt.Operation, decodedReceipt.AttemptID,
			decodedReceipt.DescriptorDigest, decodedReceipt.ShardLeaseOwnerID,
			decodedReceipt.ShardLeaseGeneration, decodedReceipt.VerificationGrantGeneration,
			decodedReceipt.VerificationAttemptGrantReceiptSetDigest, decodedReceipt.RequestDigest,
			decodedReceipt.ResponseDigest, decodedReceipt.OwnerImplementationDigest,
			decodedReceipt.CompletedAt, decodedReceipt.ReceiptDigest, string(decodedReceipt.ReceiptBytes),
			decodedReceipt.ReceiptBytes)
		if err != nil {
			return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
		}
	}
	record, err := queryEvaluationControlledAuthorityRequest(ctx, tx, authority, partition, binding)
	if err != nil || record.State != "sealed" || record.ResponseDigest != responseDigest ||
		record.DispatchAckDigest != dispatchAckDigest || !bytes.Equal(record.ResponseBytes, responseBytes) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	persistedObservations, err := queryEvaluationProviderCapabilityObservationReceipts(
		ctx, tx, authority.NamespaceID, partition, binding.AttemptID,
	)
	if err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	persistedByDigest := make(map[string][]byte, len(persistedObservations))
	for _, observation := range persistedObservations {
		persistedByDigest[observation.ReceiptDigest] = observation.ReceiptBytes
	}
	for _, observation := range observations {
		if !bytes.Equal(persistedByDigest[observation.ReceiptDigest], observation.ReceiptBytes) {
			return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false,
				conflict("evaluation attempt-authority observation replay drifted")
		}
	}
	storedReceipt, err := queryEvaluationAttemptAuthorityOwnerReceipt(ctx, tx, authority, partition, binding)
	if err != nil || !evaluationAttemptAuthorityOwnerReceiptMatches(
		storedReceipt, authority, partition, binding,
	) || storedReceipt.ResponseDigest != projectionDigest {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationControlledAuthorityRequestRecord{}, EvaluationAttemptAuthorityOwnerReceiptRecord{}, false, err
	}
	return record, storedReceipt, updated == 0, nil
}
