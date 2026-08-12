package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationAttemptAuthorityRequestFormat        = "prodivix.agent-evaluation-attempt-authority-request"
	evaluationAttemptAuthorityResponseFormat       = "prodivix.agent-evaluation-attempt-authority-response"
	evaluationAttemptAuthorityOwnerReceiptFormat   = "prodivix.agent-evaluation-attempt-authority-owner-receipt"
	evaluationAttemptAuthorityVersion              = int64(1)
	maximumEvaluationAttemptAuthorityRequestBytes  = 25_296_896
	maximumEvaluationAttemptAuthorityResponseBytes = 33_554_432
	maximumEvaluationAttemptAuthorityReceipts      = 128
)

type EvaluationAttemptAuthorityRequest struct {
	NamespaceID                                   string
	PlanDigest                                    string
	RepositoryCommit                              string
	ServiceKind                                   string
	Operation                                     string
	RouteBinding                                  string
	AttemptID                                     string
	DescriptorDigest                              string
	ShardLeaseOwnerID                             string
	ShardLeaseGeneration                          int64
	VerificationGrantGeneration                   int64
	VerificationAttemptGrantReceiptSetDigest      string
	ProviderCapabilityObservationReceiptSetDigest string
	OwnerImplementationDigest                     string
	StageDigest                                   string
	DispatchAckDigest                             string
	RequestDigest                                 string
	Payload                                       json.RawMessage
	ClaimGeneration                               int64
}

type EvaluationAttemptAuthorityResult struct {
	Response                   json.RawMessage
	DispatchAckDigest          string
	ResultIngressReceiptDigest string
}

// EvaluationAttemptAuthority is a narrow proxy to the provider-capability and
// attempt-grading owner ports. Backend owns plan/lease/grant admission and the
// durable dispatch journal; concrete provider and grader semantics stay in the
// TypeScript owner sidecar.
type EvaluationAttemptAuthority interface {
	StageAttemptAuthority(
		context.Context,
		EvaluationAttemptAuthorityRequest,
	) (string, error)
	ExecuteAttemptAuthority(
		context.Context,
		EvaluationAttemptAuthorityRequest,
	) (EvaluationAttemptAuthorityResult, error)
	ReconcileAttemptAuthority(
		context.Context,
		EvaluationAttemptAuthorityRequest,
	) (EvaluationAttemptAuthorityResult, bool, error)
}

type EvaluationAttemptAuthorityImplementationAuthority interface {
	AttemptAuthorityImplementationDigest(string) (string, bool)
}

type EvaluationAttemptAuthorityPublicResponseScanner interface {
	ScanAttemptAuthorityPublicResponse(context.Context, string, string, []byte) error
}

type evaluationAttemptAuthorityRepository interface {
	evaluationControlledAuthorityRequestRepository
	evaluationPlanReader
	GetEvaluationAttemptAuthorityOwnerReceipt(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
	) (EvaluationAttemptAuthorityOwnerReceiptRecord, error)
	SealEvaluationAttemptAuthorityRequest(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		string,
		[]byte,
		string,
		[]EvaluationProviderCapabilityObservationReceiptRecord,
		EvaluationAttemptAuthorityOwnerReceiptRecord,
	) (EvaluationControlledAuthorityRequestRecord, EvaluationAttemptAuthorityOwnerReceiptRecord, bool, error)
	MarkEvaluationAttemptAuthorityDispatched(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		string,
		string,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
}

type evaluationAttemptAuthorityResultIngressRepository interface {
	StoreEvaluationAttemptAuthorityOwnerResult(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		string,
		string,
		[]byte,
		string,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
}

type evaluationAttemptAuthorityRoute struct {
	ServiceKind      string
	Operation        string
	OwnerServiceKind string
	OwnerOperation   string
	RouteBinding     string
}

func evaluationAttemptAuthorityRouteFor(tail []string) (evaluationAttemptAuthorityRoute, error) {
	switch {
	case len(tail) == 2 && tail[0] == "capability-runtime" && tail[1] == "execute-tool":
		return evaluationAttemptAuthorityRoute{
			ServiceKind: "capability-runtime", Operation: "execute-tool",
			OwnerServiceKind: "provider-capability", OwnerOperation: "tool.execute",
			RouteBinding: "capability-runtime/execute-tool",
		}, nil
	case len(tail) == 2 && tail[0] == "capability-runtime" && tail[1] == "assess-capability":
		return evaluationAttemptAuthorityRoute{
			ServiceKind: "capability-runtime", Operation: "assess-capability",
			OwnerServiceKind: "provider-capability", OwnerOperation: "capability.assess",
			RouteBinding: "capability-runtime/assess-capability",
		}, nil
	case len(tail) == 2 && tail[0] == "attempt-grading" && tail[1] == "grade-and-persist":
		return evaluationAttemptAuthorityRoute{
			ServiceKind: "attempt-grading", Operation: "grade-and-persist",
			OwnerServiceKind: "attempt-grading", OwnerOperation: "grade-and-persist",
			RouteBinding: "attempt-grading/grade-and-persist",
		}, nil
	default:
		return evaluationAttemptAuthorityRoute{}, ErrInvalid
	}
}

func evaluationAttemptAuthorityPayloadKeys(operation string) ([]string, []string, error) {
	switch operation {
	case "execute-tool":
		return []string{
			"namespaceId", "shardLeaseOwnerId", "shardLeaseGeneration",
			"verificationGrantGeneration", "verificationAttemptGrantReceiptSetDigest",
			"planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
			"caseId", "caseDigest", "materialDigest", "capabilityDescriptor",
			"loopPolicyDigest", "turnIndex", "invocationId", "toolCallId",
			"providerToolCallId", "toolId", "arguments", "argumentsDigest",
			"requestDigest", "executionAuthorityKind", "maximumToolResultBytes",
		}, []string{"providerCapabilityObservationReceipt", "preEffectIntent"}, nil
	case "assess-capability":
		return []string{
			"namespaceId", "shardLeaseOwnerId", "shardLeaseGeneration",
			"verificationGrantGeneration", "verificationAttemptGrantReceiptSetDigest",
			"plan", "descriptor", "material", "capabilityDescriptor",
			"terminalTurnIndex", "terminalInvocationId", "terminalStatus", "observedAt",
			"providerCapabilityObservationReceipts",
			"capabilityToolExecutions", "controlledToolExecutionReceipts",
		}, []string{"resultSubmissionReceipt", "controlledRuntimeReceipt"}, nil
	case "grade-and-persist":
		return []string{
			"namespaceId", "shardLeaseOwnerId", "shardLeaseGeneration",
			"verificationGrantGeneration", "verificationAttemptGrantReceiptSetDigest",
			"plan", "descriptor", "material", "protocolFamily", "status",
			"invocationTurnSetReceipt", "terminalTurnReceipt", "execution",
			"capabilityExecutionReceipt",
		}, []string{"resultSubmission", "resultSubmissionReceipt", "controlledRuntimeReceipt"}, nil
	default:
		return nil, nil, ErrInvalid
	}
}

func evaluationAttemptAuthorityBindingMatches(
	value map[string]any,
	partition EvaluationPlanPartition,
	envelope map[string]any,
) bool {
	shardGeneration, shardOK := integerMember(value, "shardLeaseGeneration")
	verificationGeneration, verificationOK := integerMember(value, "verificationGrantGeneration")
	expectedShardGeneration, expectedShardOK := integerMember(envelope, "shardLeaseGeneration")
	expectedVerificationGeneration, expectedVerificationOK := integerMember(envelope, "verificationGrantGeneration")
	return stringMember(value, "namespaceId") == stringMember(envelope, "namespaceId") &&
		stringMember(value, "shardLeaseOwnerId") == stringMember(envelope, "shardLeaseOwnerId") &&
		shardOK && expectedShardOK && shardGeneration == expectedShardGeneration &&
		verificationOK && expectedVerificationOK && verificationGeneration == expectedVerificationGeneration &&
		stringMember(value, "verificationAttemptGrantReceiptSetDigest") ==
			stringMember(envelope, "verificationAttemptGrantReceiptSetDigest") &&
		(partition.PlanDigest == stringMember(value, "planDigest") || value["planDigest"] == nil) &&
		(partition.RepositoryCommit == stringMember(value, "repositoryCommit") || value["repositoryCommit"] == nil) &&
		(stringMember(envelope, "attemptId") == stringMember(value, "attemptId") || value["attemptId"] == nil) &&
		(stringMember(envelope, "descriptorDigest") == stringMember(value, "descriptorDigest") || value["descriptorDigest"] == nil)
}

func validateEvaluationAttemptAuthorityPayload(
	route evaluationAttemptAuthorityRoute,
	partition EvaluationPlanPartition,
	envelope map[string]any,
	plan evaluationPlanFact,
	descriptor map[string]any,
	payload map[string]any,
) error {
	required, optional, err := evaluationAttemptAuthorityPayloadKeys(route.Operation)
	if err != nil || !exactEvaluationKeys(payload, required, optional...) ||
		!evaluationAttemptAuthorityBindingMatches(payload, partition, envelope) {
		return ErrConflict
	}
	if route.Operation == "execute-tool" {
		if !validEvaluationServiceIdentity(stringMember(payload, "caseId")) ||
			stringMember(payload, "caseId") != stringMember(descriptor, "caseId") ||
			!validEvaluationAgentControlIdentity(stringMember(payload, "invocationId")) ||
			!validEvaluationAgentControlIdentity(stringMember(payload, "toolCallId")) ||
			!validEvaluationAgentControlIdentity(stringMember(payload, "providerToolCallId")) ||
			!validEvaluationAgentControlIdentity(stringMember(payload, "toolId")) {
			return ErrConflict
		}
		for _, field := range []string{
			"caseDigest", "materialDigest", "loopPolicyDigest", "argumentsDigest", "requestDigest",
		} {
			if !evaluationDigestPattern.MatchString(stringMember(payload, field)) {
				return ErrInvalid
			}
		}
		turnIndex, turnOK := integerMember(payload, "turnIndex")
		maximumResultBytes, maximumOK := integerMember(payload, "maximumToolResultBytes")
		if !turnOK || turnIndex < 0 || !maximumOK || maximumResultBytes < 1 ||
			maximumResultBytes > maximumEvaluationAttemptAuthorityResponseBytes {
			return ErrInvalid
		}
		argumentsDigest, digestErr := canonicaljson.Digest(payload["arguments"])
		if digestErr != nil || argumentsDigest != stringMember(payload, "argumentsDigest") {
			return ErrConflict
		}
		binding, bindingErr := evaluationAttemptAuthorityExecuteBindingFromPayload(payload)
		if bindingErr != nil {
			return bindingErr
		}
		if binding.ExecutionAuthorityKind == "shared-effect" {
			if payload["providerCapabilityObservationReceipt"] != nil ||
				agentcontract.ValidateSanitizedAgentPayload(binding.PreEffectIntent) != nil ||
				!evaluationAttemptAuthorityRuntimeSourceMatchesPlan(plan, binding.PreEffectIntent) {
				return ErrConflict
			}
		} else if payload["preEffectIntent"] != nil {
			return ErrConflict
		}
		return nil
	}
	payloadPlan, planOK := objectMember(payload, "plan")
	payloadDescriptor, descriptorOK := objectMember(payload, "descriptor")
	if !planOK || !descriptorOK || !sameEvaluationCanonicalValue(payloadPlan, plan.Value) ||
		!sameEvaluationCanonicalValue(payloadDescriptor, descriptor) {
		return ErrConflict
	}
	return nil
}

func evaluationAttemptAuthorityRuntimeSourceMatchesPlan(
	plan evaluationPlanFact,
	intent map[string]any,
) bool {
	expected, ok := objectMember(intent, "runtimeFactSourceAuthority")
	if !ok {
		return false
	}
	targets, ok := plan.Value["capabilityQualificationTargets"].([]any)
	if !ok {
		return false
	}
	for _, rawTarget := range targets {
		target, targetOK := rawTarget.(map[string]any)
		optional, optionalOK := objectMember(target, "optionalCapabilitySupportAuthority")
		runtime, runtimeOK := objectMember(optional, "runtimeFactSourceAuthority")
		if targetOK && optionalOK && runtimeOK && sameEvaluationCanonicalValue(runtime, expected) {
			return true
		}
	}
	return false
}

func decodeEvaluationAttemptAuthorityRequest(
	source []byte,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	route evaluationAttemptAuthorityRoute,
	plan evaluationPlanFact,
) (map[string]any, map[string]any, json.RawMessage, error) {
	envelope, err := decodeCanonicalEvaluationObject(source, maximumEvaluationAttemptAuthorityRequestBytes)
	if err != nil || !exactEvaluationKeys(envelope, []string{
		"format", "version", "serviceKind", "operation", "namespaceId", "planDigest",
		"repositoryCommit", "attemptId", "descriptorDigest", "descriptor",
		"shardLeaseOwnerId", "shardLeaseGeneration", "verificationGrantGeneration",
		"verificationAttemptGrantReceiptSetDigest", "claimGeneration", "payloadDigest",
		"requestDigest", "payload",
	}) {
		return nil, nil, nil, ErrInvalid
	}
	version, versionOK := integerMember(envelope, "version")
	claimGeneration, claimOK := integerMember(envelope, "claimGeneration")
	shardGeneration, shardOK := integerMember(envelope, "shardLeaseGeneration")
	verificationGeneration, verificationOK := integerMember(envelope, "verificationGrantGeneration")
	if !versionOK || version != evaluationAttemptAuthorityVersion ||
		!claimOK || claimGeneration != 1 || !shardOK || shardGeneration < 1 ||
		!verificationOK || verificationGeneration < 1 ||
		stringMember(envelope, "format") != evaluationAttemptAuthorityRequestFormat ||
		stringMember(envelope, "serviceKind") != route.ServiceKind ||
		stringMember(envelope, "operation") != route.Operation ||
		stringMember(envelope, "namespaceId") != authority.NamespaceID ||
		stringMember(envelope, "planDigest") != partition.PlanDigest ||
		stringMember(envelope, "repositoryCommit") != partition.RepositoryCommit ||
		!validEvaluationAgentControlIdentity(stringMember(envelope, "attemptId")) ||
		!validEvaluationAgentControlIdentity(stringMember(envelope, "shardLeaseOwnerId")) {
		return nil, nil, nil, ErrConflict
	}
	for _, field := range []string{
		"descriptorDigest", "verificationAttemptGrantReceiptSetDigest", "payloadDigest", "requestDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(envelope, field)) {
			return nil, nil, nil, ErrInvalid
		}
	}
	descriptor, descriptorOK := objectMember(envelope, "descriptor")
	payload, payloadOK := objectMember(envelope, "payload")
	if !descriptorOK || !payloadOK {
		return nil, nil, nil, ErrInvalid
	}
	plannedAttempts, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return nil, nil, nil, err
	}
	var planned evaluationStatusPlannedAttempt
	found := false
	for _, candidate := range plannedAttempts {
		if candidate.AttemptID == stringMember(envelope, "attemptId") {
			planned, found = candidate, true
			break
		}
	}
	if !found || planned.DescriptorDigest != stringMember(envelope, "descriptorDigest") ||
		!sameEvaluationCanonicalValue(planned.Descriptor, descriptor) {
		return nil, nil, nil, ErrConflict
	}
	payloadBytes, err := canonicaljson.Bytes(payload)
	if err != nil || len(payloadBytes) > maximumEvaluationAttemptAuthorityRequestBytes {
		return nil, nil, nil, ErrInvalid
	}
	payloadDigest, err := canonicaljson.Digest(payload)
	if err != nil || payloadDigest != stringMember(envelope, "payloadDigest") {
		return nil, nil, nil, ErrConflict
	}
	requestBase := cloneEvaluationObject(envelope)
	delete(requestBase, "requestDigest")
	delete(requestBase, "payload")
	requestDigest, err := canonicaljson.Digest(requestBase)
	if err != nil || requestDigest != stringMember(envelope, "requestDigest") {
		return nil, nil, nil, ErrConflict
	}
	if err := validateEvaluationAttemptAuthorityPayload(
		route, partition, envelope, plan, descriptor, payload,
	); err != nil {
		return nil, nil, nil, err
	}
	return envelope, descriptor, json.RawMessage(payloadBytes), nil
}

func evaluationAttemptAuthorityRequestBinding(
	partition EvaluationPlanPartition,
	route evaluationAttemptAuthorityRoute,
	envelope map[string]any,
	providerCapabilityObservationReceiptSetDigest string,
	ownerImplementationDigest string,
) (EvaluationControlledAuthorityRequestBinding, error) {
	shardGeneration, _ := evaluationAttemptAuthorityInteger(envelope["shardLeaseGeneration"])
	verificationGeneration, _ := evaluationAttemptAuthorityInteger(envelope["verificationGrantGeneration"])
	base := map[string]any{
		"format": "prodivix.agent-evaluation-server-only-request-binding", "version": int64(1),
		"serviceKind": route.OwnerServiceKind, "operation": route.OwnerOperation,
		"ownerImplementationDigest": ownerImplementationDigest,
		"routeBinding":              route.RouteBinding, "planDigest": partition.PlanDigest,
		"repositoryCommit":                              partition.RepositoryCommit,
		"requestDigest":                                 stringMember(envelope, "requestDigest"),
		"attemptId":                                     stringMember(envelope, "attemptId"),
		"descriptorDigest":                              stringMember(envelope, "descriptorDigest"),
		"shardLeaseOwnerId":                             stringMember(envelope, "shardLeaseOwnerId"),
		"shardLeaseGeneration":                          shardGeneration,
		"verificationGrantGeneration":                   verificationGeneration,
		"verificationAttemptGrantReceiptSetDigest":      stringMember(envelope, "verificationAttemptGrantReceiptSetDigest"),
		"providerCapabilityObservationReceiptSetDigest": providerCapabilityObservationReceiptSetDigest,
	}
	bindingDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationControlledAuthorityRequestBinding{}, err
	}
	return EvaluationControlledAuthorityRequestBinding{
		ServiceKind: route.OwnerServiceKind, Operation: route.OwnerOperation,
		OwnerImplementationDigest: ownerImplementationDigest,
		RouteBinding:              route.RouteBinding, RequestDigest: stringMember(envelope, "requestDigest"),
		RequestBindingDigest: bindingDigest, AttemptID: stringMember(envelope, "attemptId"),
		DescriptorDigest:     stringMember(envelope, "descriptorDigest"),
		ShardLeaseOwnerID:    stringMember(envelope, "shardLeaseOwnerId"),
		ShardLeaseGeneration: shardGeneration, VerificationGrantGeneration: verificationGeneration,
		VerificationGrantReceiptSetDigest:             stringMember(envelope, "verificationAttemptGrantReceiptSetDigest"),
		ProviderCapabilityObservationReceiptSetDigest: providerCapabilityObservationReceiptSetDigest,
	}, nil
}

func evaluationCapabilitySpecificAuthorityKind(receiptKind string) string {
	switch receiptKind {
	case "background-job-receipt":
		return "provider-job"
	case "cache-lineage-receipt":
		return "provider-cache"
	case "retrieval-citation-receipt", "source-freshness-receipt":
		return "retrieval-query"
	case "parallel-call-set-receipt":
		return "parallel-tool-join"
	case "tool-execution-receipt", "repair-round-receipt", "reverse-transaction-receipt":
		return "controlled-tool-execution"
	case "continuation-receipt", "state-fence-receipt":
		return "controlled-continuation"
	case "verification-closure-receipt":
		return "controlled-runtime"
	case "usage-receipt", "conservative-usage-receipt", "usage-reconciliation-receipt":
		return "usage-vector"
	case "refusal-receipt", "truncation-receipt":
		return "terminal-normalization"
	case "capability-unavailable-receipt", "authority-denial-receipt":
		return "capability-denial"
	default:
		return "recovery-authority"
	}
}

func validEvaluationCapabilitySpecificReceiptKind(value string) bool {
	return oneOfString(value,
		"ack-reconciliation-receipt", "attempt-idempotency-receipt", "authority-denial-receipt",
		"background-job-receipt", "budget-reservation-receipt", "cache-lineage-receipt",
		"cancellation-receipt", "capability-unavailable-receipt", "checkpoint-resume-receipt",
		"conservative-usage-receipt", "continuation-receipt", "late-callback-rejection-receipt",
		"late-output-fence-receipt", "lease-fence-receipt", "parallel-call-set-receipt",
		"reconciliation-receipt", "refusal-receipt", "repair-round-receipt",
		"retrieval-citation-receipt", "reverse-transaction-receipt", "source-freshness-receipt",
		"state-fence-receipt", "timeout-receipt", "tool-execution-receipt",
		"truncation-receipt", "usage-receipt", "usage-reconciliation-receipt",
		"verification-closure-receipt",
	)
}

func validateEvaluationAttemptAuthoritySpecificReceipts(
	value any,
	payload map[string]any,
) ([]map[string]any, error) {
	entries, ok := value.([]any)
	if !ok || len(entries) > maximumEvaluationCapabilitySpecificPerAttempt {
		return nil, ErrInvalid
	}
	capability, ok := objectMember(payload, "capabilityDescriptor")
	if !ok {
		return nil, ErrInvalid
	}
	expectedKinds, err := evaluationStringArray(capability["expectedReceiptKinds"], maximumEvaluationAttemptAuthorityReceipts, true)
	if err != nil {
		return nil, err
	}
	expected := make(map[string]struct{}, len(expectedKinds))
	for _, kind := range expectedKinds {
		expected[kind] = struct{}{}
	}
	seenKinds := make(map[string]struct{}, len(entries))
	seenIDs := make(map[string]struct{}, len(entries))
	seenDigests := make(map[string]struct{}, len(entries))
	result := make([]map[string]any, len(entries))
	for index, raw := range entries {
		receipt, ok := raw.(map[string]any)
		if !ok {
			return nil, ErrInvalid
		}
		source, err := canonicaljson.Bytes(receipt)
		if err != nil {
			return nil, ErrInvalid
		}
		decoded, err := decodeEvaluationCapabilitySpecificReceipt(source)
		if err != nil {
			return nil, err
		}
		kind, digest := decoded.ReceiptKind, decoded.ReceiptDigest
		if _, allowed := expected[kind]; !allowed {
			return nil, ErrConflict
		}
		if _, duplicate := seenKinds[kind]; duplicate {
			return nil, ErrConflict
		}
		if _, duplicate := seenIDs[decoded.ReceiptID]; duplicate {
			return nil, ErrConflict
		}
		if _, duplicate := seenDigests[digest]; duplicate {
			return nil, ErrConflict
		}
		seenKinds[kind] = struct{}{}
		seenIDs[decoded.ReceiptID] = struct{}{}
		seenDigests[digest] = struct{}{}
		result[index] = decoded.Value
	}
	return result, nil
}

func validateEvaluationAttemptAuthorityOwnerResponse(
	route evaluationAttemptAuthorityRoute,
	payload json.RawMessage,
	response json.RawMessage,
) error {
	payloadValue, err := decodeCanonicalEvaluationObject(payload, maximumEvaluationAttemptAuthorityRequestBytes)
	if err != nil {
		return err
	}
	value, err := decodeCanonicalEvaluationObject(response, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil {
		return err
	}
	switch route.Operation {
	case "execute-tool":
		binding, bindingErr := evaluationAttemptAuthorityExecuteBindingFromPayload(payloadValue)
		if bindingErr != nil || stringMember(value, "executionAuthorityKind") != binding.ExecutionAuthorityKind ||
			!oneOfString(stringMember(value, "outcome"), "supported", "unsupported", "failed") {
			return ErrInvalid
		}
		if binding.ExecutionAuthorityKind == "observation-control" && !exactEvaluationKeys(value, []string{
			"executionAuthorityKind", "outcome", "result", "resultDigest", "continuationReceiptDigest", "specificReceipts",
		}) {
			return ErrInvalid
		}
		resultDigest, err := canonicaljson.Digest(value["result"])
		maximumResultBytes, _ := integerMember(payloadValue, "maximumToolResultBytes")
		resultBytes, bytesErr := canonicaljson.Bytes(value["result"])
		if err != nil || bytesErr != nil || resultDigest != stringMember(value, "resultDigest") ||
			int64(len(resultBytes)) > maximumResultBytes {
			return ErrConflict
		}
		if !evaluationDigestPattern.MatchString(stringMember(value, "continuationReceiptDigest")) {
			return ErrConflict
		}
		if binding.ExecutionAuthorityKind == "shared-effect" {
			_, _, sharedErr := evaluationAttemptAuthoritySharedEffectResponse(value, binding)
			return sharedErr
		}
		receipts, err := validateEvaluationAttemptAuthoritySpecificReceipts(value["specificReceipts"], payloadValue)
		if err != nil {
			return err
		}
		continuation := stringMember(value, "continuationReceiptDigest")
		capability, _ := objectMember(payloadValue, "capabilityDescriptor")
		for _, receipt := range receipts {
			turnIndex, _ := integerMember(receipt, "turnIndex")
			expectedTurnIndex, _ := integerMember(payloadValue, "turnIndex")
			if stringMember(receipt, "planDigest") != stringMember(payloadValue, "planDigest") ||
				stringMember(receipt, "repositoryCommit") != stringMember(payloadValue, "repositoryCommit") ||
				stringMember(receipt, "attemptId") != stringMember(payloadValue, "attemptId") ||
				stringMember(receipt, "descriptorDigest") != stringMember(payloadValue, "descriptorDigest") ||
				stringMember(receipt, "caseId") != stringMember(payloadValue, "caseId") ||
				stringMember(receipt, "materialDigest") != stringMember(payloadValue, "materialDigest") ||
				stringMember(receipt, "capabilityDescriptorDigest") != stringMember(capability, "descriptorDigest") ||
				turnIndex != expectedTurnIndex ||
				stringMember(receipt, "invocationId") != stringMember(payloadValue, "invocationId") ||
				stringMember(receipt, "toolId") != stringMember(payloadValue, "toolId") ||
				stringMember(receipt, "toolCallId") != stringMember(payloadValue, "toolCallId") ||
				stringMember(receipt, "providerToolCallId") != stringMember(payloadValue, "providerToolCallId") ||
				stringMember(receipt, "requestDigest") != stringMember(payloadValue, "requestDigest") ||
				stringMember(receipt, "resultDigest") != stringMember(value, "resultDigest") {
				return ErrConflict
			}
		}
		_ = continuation
	case "assess-capability":
		if !exactEvaluationKeys(value, []string{"outcome", "specificReceipts"}) ||
			!oneOfString(stringMember(value, "outcome"), "supported", "unsupported", "failed") {
			return ErrInvalid
		}
		receipts, err := validateEvaluationAttemptAuthoritySpecificReceipts(value["specificReceipts"], payloadValue)
		if err != nil {
			return err
		}
		plan, _ := objectMember(payloadValue, "plan")
		descriptor, _ := objectMember(payloadValue, "descriptor")
		material, _ := objectMember(payloadValue, "material")
		capability, _ := objectMember(payloadValue, "capabilityDescriptor")
		terminalTurnIndex, _ := integerMember(payloadValue, "terminalTurnIndex")
		finalDigests := make(map[string]struct{}, len(receipts))
		for _, receipt := range receipts {
			turnIndex, _ := integerMember(receipt, "turnIndex")
			if stringMember(receipt, "planDigest") != stringMember(plan, "planDigest") ||
				stringMember(receipt, "repositoryCommit") != stringMember(plan, "repositoryCommit") ||
				stringMember(receipt, "attemptId") != stringMember(descriptor, "attemptId") ||
				stringMember(receipt, "descriptorDigest") != stringMember(descriptor, "descriptorDigest") ||
				stringMember(receipt, "caseId") != stringMember(material, "caseId") ||
				stringMember(receipt, "materialDigest") != stringMember(material, "materialDigest") ||
				stringMember(receipt, "capabilityDescriptorDigest") != stringMember(capability, "descriptorDigest") ||
				turnIndex > terminalTurnIndex {
				return ErrConflict
			}
			finalDigests[stringMember(receipt, "receiptDigest")] = struct{}{}
		}
		toolExecutions, ok := payloadValue["capabilityToolExecutions"].([]any)
		if !ok {
			return ErrInvalid
		}
		for _, rawExecution := range toolExecutions {
			execution, ok := rawExecution.(map[string]any)
			output, outputOK := objectMember(execution, "output")
			toolReceipts, receiptsOK := output["specificReceipts"].([]any)
			if !ok || !outputOK || !receiptsOK {
				return ErrInvalid
			}
			for _, rawReceipt := range toolReceipts {
				receipt, ok := rawReceipt.(map[string]any)
				if !ok {
					return ErrInvalid
				}
				if _, exists := finalDigests[stringMember(receipt, "receiptDigest")]; !exists {
					return ErrConflict
				}
			}
		}
	case "grade-and-persist":
		if err := validateEvaluationAttemptAuthorityGrading(payloadValue, value); err != nil {
			return err
		}
	default:
		return ErrInvalid
	}
	return nil
}

func validateEvaluationAttemptAuthorityGrading(payload, value map[string]any) error {
	if !exactEvaluationKeys(value, []string{"metricObservations", "gradingDigest"}) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "gradingDigest")) {
		return ErrInvalid
	}
	rawObservations, ok := value["metricObservations"].([]any)
	if !ok || len(rawObservations) == 0 || len(rawObservations) > maximumEvaluationAttemptAuthorityReceipts {
		return ErrInvalid
	}
	plan, planOK := objectMember(payload, "plan")
	graderPlan, graderPlanOK := objectMember(plan, "graderPlan")
	thresholds, thresholdsOK := objectMember(plan, "thresholds")
	rawGraders, gradersOK := graderPlan["graders"].([]any)
	rawMetrics, metricsOK := thresholds["metrics"].([]any)
	if !planOK || !graderPlanOK || !thresholdsOK || !gradersOK || !metricsOK {
		return ErrInvalid
	}
	graders := make(map[string]map[string]any, len(rawGraders))
	for _, raw := range rawGraders {
		grader, ok := raw.(map[string]any)
		if !ok {
			return ErrInvalid
		}
		graders[stringMember(grader, "graderId")] = grader
	}
	metrics := make(map[string]struct{}, len(rawMetrics))
	for _, raw := range rawMetrics {
		metric, ok := raw.(map[string]any)
		if !ok {
			return ErrInvalid
		}
		metrics[stringMember(metric, "metricId")] = struct{}{}
	}
	status := stringMember(payload, "status")
	if status == "" {
		return ErrInvalid
	}
	observationDigests := make([]string, len(rawObservations))
	seenKeys := make(map[string]struct{}, len(rawObservations))
	seenDigests := make(map[string]struct{}, len(rawObservations))
	deterministic := false
	for index, raw := range rawObservations {
		entry, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(entry, []string{
			"metricId", "graderId", "graderKind", "authority", "verdict", "observationDigest",
		}) || !validEvaluationServiceIdentity(stringMember(entry, "metricId")) ||
			!validEvaluationServiceIdentity(stringMember(entry, "graderId")) ||
			!oneOfString(stringMember(entry, "authority"), "deterministic", "auxiliary", "human") ||
			!oneOfString(stringMember(entry, "verdict"), "passed", "failed", "inconclusive") {
			return ErrInvalid
		}
		grader, graderExists := graders[stringMember(entry, "graderId")]
		_, metricExists := metrics[stringMember(entry, "metricId")]
		if !graderExists || !metricExists || stringMember(grader, "kind") != stringMember(entry, "graderKind") ||
			stringMember(grader, "authority") != stringMember(entry, "authority") ||
			(status != "completed" && stringMember(entry, "verdict") != "inconclusive") {
			return ErrConflict
		}
		base := cloneEvaluationObject(entry)
		delete(base, "observationDigest")
		digest, err := canonicaljson.Digest(base)
		if err != nil || digest != stringMember(entry, "observationDigest") {
			return ErrConflict
		}
		key := stringMember(entry, "metricId") + "\x00" + stringMember(entry, "graderId")
		if _, duplicate := seenKeys[key]; duplicate {
			return ErrConflict
		}
		if _, duplicate := seenDigests[digest]; duplicate {
			return ErrConflict
		}
		seenKeys[key], seenDigests[digest] = struct{}{}, struct{}{}
		deterministic = deterministic || stringMember(entry, "authority") == "deterministic"
		observationDigests[index] = digest
	}
	if !deterministic {
		return ErrConflict
	}
	sort.Strings(observationDigests)
	descriptor, descriptorOK := objectMember(payload, "descriptor")
	invocationSet, invocationOK := objectMember(payload, "invocationTurnSetReceipt")
	terminalTurn, terminalOK := objectMember(payload, "terminalTurnReceipt")
	capabilityReceipt, capabilityOK := objectMember(payload, "capabilityExecutionReceipt")
	execution, executionOK := objectMember(payload, "execution")
	if !descriptorOK || !invocationOK || !terminalOK || !capabilityOK || !executionOK {
		return ErrInvalid
	}
	if !exactEvaluationKeys(execution, []string{
		"modelInvocations", "toolCalls", "repairRounds", "transactions", "artifactBytes",
		"capabilityExecutionReceiptSetDigest", "verificationAttemptGrantReceiptSetDigest",
	}, "toolReceiptSetDigest", "transactionReceiptSetDigest", "verificationClosureDigest") {
		return ErrInvalid
	}
	for _, measurement := range []struct {
		field   string
		maximum int64
	}{
		{"modelInvocations", 64}, {"toolCalls", 64}, {"repairRounds", 32},
		{"transactions", 64}, {"artifactBytes", 16_777_216},
	} {
		value, ok := evaluationAttemptAuthorityInteger(execution[measurement.field])
		if !ok || value < 0 || value > measurement.maximum {
			return ErrInvalid
		}
	}
	for _, field := range []string{
		"capabilityExecutionReceiptSetDigest", "verificationAttemptGrantReceiptSetDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(execution, field)) {
			return ErrInvalid
		}
	}
	for _, field := range []string{"toolReceiptSetDigest", "transactionReceiptSetDigest", "verificationClosureDigest"} {
		if raw, exists := execution[field]; exists {
			value, ok := raw.(string)
			if !ok || !evaluationDigestPattern.MatchString(value) {
				return ErrInvalid
			}
		}
	}
	base := map[string]any{
		"descriptorDigest":                 stringMember(descriptor, "descriptorDigest"),
		"invocationTurnSetReceiptDigest":   stringMember(invocationSet, "receiptDigest"),
		"terminalTurnReceiptDigest":        stringMember(terminalTurn, "evidenceDigest"),
		"capabilityExecutionReceiptDigest": stringMember(capabilityReceipt, "receiptDigest"),
		"observationDigests":               observationDigests,
		"execution":                        execution,
	}
	if receipt, ok := objectMember(payload, "resultSubmissionReceipt"); ok {
		base["resultSubmissionReceiptDigest"] = stringMember(receipt, "receiptDigest")
	}
	if receipt, ok := objectMember(payload, "controlledRuntimeReceipt"); ok {
		base["controlledRuntimeReceiptDigest"] = stringMember(receipt, "receiptDigest")
	}
	for key, raw := range base {
		if key == "observationDigests" || key == "execution" {
			continue
		}
		if !evaluationDigestPattern.MatchString(raw.(string)) {
			return ErrInvalid
		}
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "gradingDigest") {
		return ErrConflict
	}
	return nil
}

func evaluationAttemptAuthorityInteger(value any) (int64, bool) {
	switch typed := value.(type) {
	case int64:
		return typed, true
	case json.Number:
		parsed, err := typed.Int64()
		return parsed, err == nil
	case float64:
		parsed := int64(typed)
		return parsed, float64(parsed) == typed
	default:
		return 0, false
	}
}

func evaluationAttemptAuthorityDispatchStageDigest(
	route evaluationAttemptAuthorityRoute,
	partition EvaluationPlanPartition,
	envelope map[string]any,
	providerCapabilityObservationReceiptSetDigest string,
	ownerImplementationDigest string,
) (string, error) {
	if !evaluationDigestPattern.MatchString(providerCapabilityObservationReceiptSetDigest) ||
		!evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		return "", ErrInvalid
	}
	shardGeneration, _ := evaluationAttemptAuthorityInteger(envelope["shardLeaseGeneration"])
	verificationGeneration, _ := evaluationAttemptAuthorityInteger(envelope["verificationGrantGeneration"])
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-attempt-authority-dispatch-stage", "version": evaluationAttemptAuthorityVersion,
		"serviceKind": route.OwnerServiceKind, "operation": route.OwnerOperation, "routeBinding": route.RouteBinding,
		"namespaceId": stringMember(envelope, "namespaceId"), "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": stringMember(envelope, "attemptId"),
		"descriptorDigest":                              stringMember(envelope, "descriptorDigest"),
		"shardLeaseOwnerId":                             stringMember(envelope, "shardLeaseOwnerId"),
		"shardLeaseGeneration":                          shardGeneration,
		"verificationGrantGeneration":                   verificationGeneration,
		"verificationAttemptGrantReceiptSetDigest":      stringMember(envelope, "verificationAttemptGrantReceiptSetDigest"),
		"requestDigest":                                 stringMember(envelope, "requestDigest"),
		"providerCapabilityObservationReceiptSetDigest": providerCapabilityObservationReceiptSetDigest,
		"ownerImplementationDigest":                     ownerImplementationDigest,
		"claimGeneration":                               int64(1),
	})
}

func evaluationAttemptAuthorityDispatchAckDigest(
	route evaluationAttemptAuthorityRoute,
	partition EvaluationPlanPartition,
	envelope map[string]any,
	providerCapabilityObservationReceiptSetDigest string,
	stageDigest string,
	ownerImplementationDigest string,
	response json.RawMessage,
) (string, error) {
	if !evaluationDigestPattern.MatchString(providerCapabilityObservationReceiptSetDigest) ||
		!evaluationDigestPattern.MatchString(stageDigest) ||
		!evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		return "", ErrInvalid
	}
	var responseValue any
	if err := decodeEvaluationServiceRawJSON(response, &responseValue); err != nil {
		return "", err
	}
	responseDigest, err := canonicaljson.Digest(responseValue)
	if err != nil {
		return "", err
	}
	shardGeneration, _ := evaluationAttemptAuthorityInteger(envelope["shardLeaseGeneration"])
	verificationGeneration, _ := evaluationAttemptAuthorityInteger(envelope["verificationGrantGeneration"])
	return canonicaljson.Digest(map[string]any{
		"format":      "prodivix.agent-evaluation-attempt-authority-dispatch-ack",
		"version":     evaluationAttemptAuthorityVersion,
		"serviceKind": route.OwnerServiceKind, "operation": route.OwnerOperation,
		"namespaceId": stringMember(envelope, "namespaceId"),
		"planDigest":  partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId":                                     stringMember(envelope, "attemptId"),
		"descriptorDigest":                              stringMember(envelope, "descriptorDigest"),
		"shardLeaseOwnerId":                             stringMember(envelope, "shardLeaseOwnerId"),
		"shardLeaseGeneration":                          shardGeneration,
		"verificationGrantGeneration":                   verificationGeneration,
		"verificationAttemptGrantReceiptSetDigest":      stringMember(envelope, "verificationAttemptGrantReceiptSetDigest"),
		"providerCapabilityObservationReceiptSetDigest": providerCapabilityObservationReceiptSetDigest,
		"stageDigest":                                   stageDigest,
		"requestDigest":                                 stringMember(envelope, "requestDigest"),
		"responseDigest":                                responseDigest,
		"ownerImplementationDigest":                     ownerImplementationDigest,
	})
}

func evaluationAttemptAuthorityAcknowledgement(
	route evaluationAttemptAuthorityRoute,
	partition EvaluationPlanPartition,
	envelope map[string]any,
	binding EvaluationControlledAuthorityRequestBinding,
	payload map[string]any,
	response json.RawMessage,
	receipt EvaluationAttemptAuthorityOwnerReceiptRecord,
	replayed bool,
) ([]byte, error) {
	var responseValue any
	if err := decodeEvaluationServiceRawJSON(response, &responseValue); err != nil {
		return nil, err
	}
	var receiptValue any
	if err := decodeEvaluationServiceRawJSON(receipt.ReceiptBytes, &receiptValue); err != nil {
		return nil, err
	}
	if !evaluationAttemptAuthorityOwnerReceiptMatches(
		receipt, EvaluationAuthority{NamespaceID: stringMember(envelope, "namespaceId")},
		partition, binding,
	) {
		return nil, ErrConflict
	}
	var executeBinding *evaluationAttemptAuthorityExecuteBinding
	var assessmentBinding *evaluationAttemptAuthorityAssessmentBinding
	if route.Operation == "execute-tool" {
		value, bindingErr := evaluationAttemptAuthorityExecuteBindingFromPayload(payload)
		if bindingErr != nil {
			return nil, bindingErr
		}
		executeBinding = &value
	} else if route.Operation == "assess-capability" {
		value, bindingErr := evaluationAttemptAuthorityAssessmentBindingFromPayload(payload)
		if bindingErr != nil {
			return nil, bindingErr
		}
		assessmentBinding = &value
	}
	projection, projectionDigest, err := evaluationAttemptAuthorityResponseProjection(
		route.ServiceKind, route.Operation, response, executeBinding, assessmentBinding,
	)
	if err != nil || projectionDigest != receipt.ResponseDigest ||
		!sameEvaluationCanonicalValue(projection, receipt.ResponseProjection) {
		return nil, ErrConflict
	}
	shardGeneration, _ := integerMember(envelope, "shardLeaseGeneration")
	verificationGeneration, _ := integerMember(envelope, "verificationGrantGeneration")
	if receipt.ShardLeaseGeneration != shardGeneration ||
		receipt.VerificationGrantGeneration != verificationGeneration ||
		receipt.Operation != route.Operation {
		return nil, ErrConflict
	}
	acknowledgement := map[string]any{
		"format":      evaluationAttemptAuthorityResponseFormat,
		"version":     evaluationAttemptAuthorityVersion,
		"serviceKind": route.ServiceKind, "operation": route.Operation,
		"requestDigest":                            stringMember(envelope, "requestDigest"),
		"shardLeaseOwnerId":                        stringMember(envelope, "shardLeaseOwnerId"),
		"shardLeaseGeneration":                     shardGeneration,
		"verificationGrantGeneration":              verificationGeneration,
		"verificationAttemptGrantReceiptSetDigest": stringMember(envelope, "verificationAttemptGrantReceiptSetDigest"),
		"replayed":                                 replayed, "authorityReceipt": receiptValue,
		"response": responseValue,
	}
	result, err := canonicaljson.Bytes(acknowledgement)
	if err != nil || len(result) > maximumEvaluationAttemptAuthorityResponseBytes {
		return nil, errEvaluationServiceResponseTooLarge
	}
	return result, nil
}

func (handler *EvaluationServiceHandler) handleEvaluationAttemptAuthority(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method != http.MethodPost || !evaluationServiceQueryIsExact(request) {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if handler.attemptAuthority == nil || handler.attemptAuthorityResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	route, err := evaluationAttemptAuthorityRouteFor(tail)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	repository, ok := handler.repository.(evaluationAttemptAuthorityRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	planRecord, err := repository.GetEvaluationPlan(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationAttemptAuthorityRequestBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	envelope, descriptor, payload, err := decodeEvaluationAttemptAuthorityRequest(
		source, handler.authority, partition, route, plan,
	)
	if err != nil || !exactEvaluationIdempotencyHeader(request, stringMember(envelope, "requestDigest")) {
		if err == nil {
			err = ErrInvalid
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	payloadValue, err := decodeCanonicalEvaluationObject(payload, maximumEvaluationAttemptAuthorityRequestBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	providerCapabilityObservations, providerCapabilityObservationReceiptSetDigest, err :=
		evaluationProviderCapabilityObservationSetDigestFromPayload(route, plan, descriptor, payloadValue)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	implementationAuthority, ok := handler.attemptAuthority.(EvaluationAttemptAuthorityImplementationAuthority)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	ownerImplementationDigest, ready := implementationAuthority.AttemptAuthorityImplementationDigest(
		route.OwnerServiceKind,
	)
	if !ready || !evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	binding, err := evaluationAttemptAuthorityRequestBinding(
		partition, route, envelope, providerCapabilityObservationReceiptSetDigest, ownerImplementationDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	sharedEffect := route.Operation == "execute-tool" &&
		stringMember(payloadValue, "executionAuthorityKind") == "shared-effect"
	if sharedEffect {
		intent, intentDigest, intentErr := evaluationAttemptAuthorityPreEffectIntent(payloadValue)
		intentBytes, bytesErr := canonicaljson.Bytes(intent)
		if intentErr != nil || bytesErr != nil || len(intentBytes) > 16_384 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		binding.PreEffectIntentDigest = intentDigest
		binding.PreEffectIntentBytes = append([]byte(nil), intentBytes...)
	}
	record, created, err := repository.ClaimEvaluationControlledAuthorityRequest(
		request.Context(), handler.authority, partition, binding, time.Now().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeResponse := func(
		response json.RawMessage,
		receipt EvaluationAttemptAuthorityOwnerReceiptRecord,
		replayed bool,
	) error {
		if err := validateEvaluationAttemptAuthorityOwnerResponse(route, payload, response); err != nil {
			return err
		}
		acknowledgement, err := evaluationAttemptAuthorityAcknowledgement(
			route, partition, envelope, binding, payloadValue, response, receipt, replayed,
		)
		if err != nil {
			return err
		}
		if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
			request.Context(), route.Operation, binding.RequestDigest, acknowledgement,
		); err != nil {
			return ErrUnauthorized
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, acknowledgement)
		return nil
	}
	if record.State == "sealed" {
		if len(record.ResponseBytes) == 0 {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		receipt, err := repository.GetEvaluationAttemptAuthorityOwnerReceipt(
			request.Context(), handler.authority, partition, binding,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if err := writeResponse(record.ResponseBytes, receipt, true); err != nil {
			respondEvaluationServiceError(writer, err)
		}
		return
	}
	authorityRequest := EvaluationAttemptAuthorityRequest{
		NamespaceID: handler.authority.NamespaceID, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, ServiceKind: route.OwnerServiceKind,
		Operation: route.OwnerOperation, RouteBinding: route.RouteBinding,
		AttemptID: binding.AttemptID, DescriptorDigest: binding.DescriptorDigest,
		ShardLeaseOwnerID:                             binding.ShardLeaseOwnerID,
		ShardLeaseGeneration:                          binding.ShardLeaseGeneration,
		VerificationGrantGeneration:                   binding.VerificationGrantGeneration,
		VerificationAttemptGrantReceiptSetDigest:      binding.VerificationGrantReceiptSetDigest,
		ProviderCapabilityObservationReceiptSetDigest: binding.ProviderCapabilityObservationReceiptSetDigest,
		OwnerImplementationDigest:                     binding.OwnerImplementationDigest,
		StageDigest:                                   record.StageDigest,
		DispatchAckDigest:                             record.DispatchAckDigest,
		RequestDigest:                                 binding.RequestDigest, Payload: append(json.RawMessage(nil), payload...),
		ClaimGeneration: record.ClaimGeneration,
	}
	var ownerResult EvaluationAttemptAuthorityResult
	ownerResultDurableReplay := record.State == "dispatched" && record.DispatchAckDigest != ""
	if ownerResultDurableReplay {
		ownerResult = EvaluationAttemptAuthorityResult{
			Response:          append(json.RawMessage(nil), record.ResponseBytes...),
			DispatchAckDigest: record.DispatchAckDigest,
		}
	} else if record.State == "claimed" {
		stageDigest, stageErr := handler.attemptAuthority.StageAttemptAuthority(
			request.Context(), authorityRequest,
		)
		expectedStageDigest, expectedStageErr := evaluationAttemptAuthorityDispatchStageDigest(
			route, partition, envelope, providerCapabilityObservationReceiptSetDigest, ownerImplementationDigest,
		)
		if stageErr != nil || expectedStageErr != nil || stageDigest != expectedStageDigest {
			if stageErr != nil {
				err = stageErr
			} else {
				err = ErrConflict
			}
		} else {
			record, _, err = repository.MarkEvaluationAttemptAuthorityDispatched(
				request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
				stageDigest, providerCapabilityObservationReceiptSetDigest, time.Now().UTC(),
			)
			authorityRequest.StageDigest = record.StageDigest
		}
		if err == nil {
			ownerResult, err = handler.attemptAuthority.ExecuteAttemptAuthority(
				request.Context(), authorityRequest,
			)
		}
	} else if record.State == "dispatched" && record.DispatchAckDigest == "" {
		var reconciled bool
		ownerResult, reconciled, err = handler.attemptAuthority.ReconcileAttemptAuthority(
			request.Context(), authorityRequest,
		)
		if err == nil && !reconciled {
			err = errEvaluationServiceUnavailable
		}
	} else {
		err = errEvaluationServiceUnavailable
	}
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	expectedDispatchAck, err := evaluationAttemptAuthorityDispatchAckDigest(
		route, partition, envelope, providerCapabilityObservationReceiptSetDigest,
		record.StageDigest, ownerImplementationDigest, ownerResult.Response,
	)
	if err != nil || ownerResult.DispatchAckDigest != expectedDispatchAck {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if err := validateEvaluationAttemptAuthorityOwnerResponse(route, payload, ownerResult.Response); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	responseDigest, err := evaluationCanonicalByteDigest(
		ownerResult.Response, maximumEvaluationAttemptAuthorityResponseBytes,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if sharedEffect {
		durableRepository, ok := handler.repository.(evaluationAttemptAuthorityResultIngressRepository)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
			request.Context(), route.Operation, binding.RequestDigest, ownerResult.Response,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
		ingressDigest, err := evaluationAttemptAuthorityResultIngressDigest(
			handler.authority, partition, binding, record.StageDigest, ownerResult.Response,
			responseDigest, ownerResult.DispatchAckDigest,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		ingressReceiptDigest, err := evaluationAttemptAuthorityResultIngressReceiptDigest(
			binding.RequestDigest, ingressDigest, responseDigest, ownerResult.DispatchAckDigest,
		)
		if err != nil || !ownerResultDurableReplay &&
			ownerResult.ResultIngressReceiptDigest != ingressReceiptDigest {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		stored, _, err := durableRepository.StoreEvaluationAttemptAuthorityOwnerResult(
			request.Context(), handler.authority, partition, binding, record.StageDigest,
			responseDigest, ownerResult.Response, ownerResult.DispatchAckDigest,
		)
		if err != nil || stored.ResponseDigest != responseDigest ||
			stored.DispatchAckDigest != ownerResult.DispatchAckDigest ||
			!bytes.Equal(stored.ResponseBytes, ownerResult.Response) {
			if err == nil {
				err = ErrConflict
			}
			respondEvaluationServiceError(writer, err)
			return
		}
		ownerResult.Response = append(json.RawMessage(nil), stored.ResponseBytes...)
		ownerResult.ResultIngressReceiptDigest = ingressReceiptDigest
	}
	var executeBinding *evaluationAttemptAuthorityExecuteBinding
	var assessmentBinding *evaluationAttemptAuthorityAssessmentBinding
	if route.Operation == "execute-tool" {
		value, bindingErr := evaluationAttemptAuthorityExecuteBindingFromPayload(payloadValue)
		if bindingErr != nil {
			respondEvaluationServiceError(writer, bindingErr)
			return
		}
		executeBinding = &value
	} else if route.Operation == "assess-capability" {
		value, bindingErr := evaluationAttemptAuthorityAssessmentBindingFromPayload(payloadValue)
		if bindingErr != nil {
			respondEvaluationServiceError(writer, bindingErr)
			return
		}
		assessmentBinding = &value
	}
	responseProjection, _, err := evaluationAttemptAuthorityResponseProjection(
		route.ServiceKind, route.Operation, ownerResult.Response, executeBinding, assessmentBinding,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	receipt, err := createEvaluationAttemptAuthorityOwnerReceipt(
		handler.authority, partition, binding, responseProjection, time.Now().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	candidateAcknowledgement, err := evaluationAttemptAuthorityAcknowledgement(
		route, partition, envelope, binding, payloadValue, ownerResult.Response, receipt, !created,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
		request.Context(), route.Operation, binding.RequestDigest, candidateAcknowledgement,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	sealed, storedReceipt, sealReplayed, err := repository.SealEvaluationAttemptAuthorityRequest(
		request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
		responseDigest, ownerResult.Response, ownerResult.DispatchAckDigest,
		providerCapabilityObservations, receipt,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	acknowledgement, err := evaluationAttemptAuthorityAcknowledgement(
		route, partition, envelope, binding, payloadValue, sealed.ResponseBytes, storedReceipt,
		!created || sealReplayed,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
		request.Context(), route.Operation, binding.RequestDigest, acknowledgement,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, acknowledgement)
}
