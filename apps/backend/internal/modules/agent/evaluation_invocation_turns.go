package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationInvocationTurnReceiptFormat    = "prodivix.agent-evaluation-invocation-turn-receipt"
	evaluationInvocationTurnSetReceiptFormat = "prodivix.agent-evaluation-invocation-turn-set-receipt"
)

type EvaluationInvocationTurnReceiptRecord struct {
	NamespaceID                            string
	PlanDigest                             string
	RepositoryCommit                       string
	AttemptID                              string
	DescriptorDigest                       string
	TurnIndex                              int64
	InvocationID                           string
	Status                                 string
	DispatchState                          string
	Terminal                               bool
	DispatchIntentDigest                   string
	TransportReceiptDigest                 string
	ProviderResultSpoolReceiptDigest       string
	ExecutionFailureAuthorityReceiptDigest string
	ResultSubmissionReceiptDigest          string
	ControlledRuntimeReceiptDigest         string
	ResponseArtifactDigest                 string
	PreDispatchFailureReceiptDigest        string
	EvidenceDigest                         string
	ReceiptBytes                           []byte
}

type EvaluationInvocationTurnSetReceiptRecord struct {
	NamespaceID                                    string
	PlanDigest                                     string
	RepositoryCommit                               string
	AttemptID                                      string
	DescriptorDigest                               string
	TerminalTurnIndex                              int64
	TerminalStatus                                 string
	DispatchedInvocationCount                      int64
	TurnReceiptCount                               int64
	SourceReceiptSetDigest                         string
	TerminalResultSubmissionReceiptDigest          string
	TerminalControlledRuntimeReceiptDigest         string
	TerminalExecutionFailureAuthorityReceiptDigest string
	ReceiptDigest                                  string
	ReceiptBytes                                   []byte
}

type evaluationTurnInvocation struct {
	InvocationID            string
	RunID                   string
	ProviderConfigurationID string
	ProtocolFamily          string
	ModelLineageDigest      string
	InferenceConfigDigest   string
	ContextPackDigest       string
	RequestDigest           string
	ResponseDigest          string
	Outcome                 string
	Usage                   any
	Cost                    any
	ReceiptDigest           string
	StartedAt               time.Time
	CompletedAt             time.Time
	PricingSnapshotRef      string
	Value                   map[string]any
}

type evaluationInvocationTurnReceipt struct {
	EvaluationInvocationTurnReceiptRecord
	CaseDefinitionDigest              string
	ContextPackDigest                 string
	MediaRepresentationManifestDigest string
	RequestArtifactDigest             string
	ProviderRequestID                 string
	ResolvedModelID                   string
	ResolvedModelVersion              string
	ResolvedModelIdentityDigest       string
	ResponseHeaderDigest              string
	UsageSourceDigest                 string
	CostSourceDigest                  string
	UsageSourceReceiptDigest          string
	CostSourceReceiptDigest           string
	ContinuationReceiptDigest         string
	TransportRetryReceipt             map[string]any
	Invocation                        *evaluationTurnInvocation
	Value                             map[string]any
}

type evaluationInvocationTurnSetReceipt struct {
	EvaluationInvocationTurnSetReceiptRecord
	TurnReceiptDigests   []string
	AggregateUsage       any
	AggregateCost        []any
	AggregateUsageDigest string
	AggregateCostDigest  string
	Value                map[string]any
}

func decodeEvaluationTurnInvocation(value any) (evaluationTurnInvocation, error) {
	receipt, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(receipt, []string{
		"invocationId", "taskId", "runId", "generation", "attempt", "provider", "model",
		"capabilityQualificationDigest", "inferenceConfigurationDigest", "contextPackDigest", "requestDigest",
		"outcome", "usage", "costStatus", "cost", "startedAt", "completedAt", "receiptDigest",
	}, "multimodalContextManifestDigest", "providerMediaBlockManifestDigest", "contextTransformReceiptRef",
		"cacheReceiptRef", "providerStateReceiptRef", "providerJobReceiptRef", "responseDigest", "pricingSnapshotRef") {
		return evaluationTurnInvocation{}, invalid("evaluation turn invocation receipt shape is invalid")
	}
	for _, field := range []string{"invocationId", "taskId", "runId"} {
		if _, err := evaluationAuthenticityIdentity(receipt[field], field); err != nil {
			return evaluationTurnInvocation{}, err
		}
	}
	for _, field := range []string{"contextTransformReceiptRef", "cacheReceiptRef", "providerStateReceiptRef", "providerJobReceiptRef", "pricingSnapshotRef"} {
		if _, err := optionalEvaluationAuthenticityIdentity(receipt, field); err != nil {
			return evaluationTurnInvocation{}, err
		}
	}
	for _, field := range []string{"capabilityQualificationDigest", "inferenceConfigurationDigest", "contextPackDigest", "requestDigest"} {
		if _, err := evaluationAuthenticityDigest(receipt[field], field); err != nil {
			return evaluationTurnInvocation{}, err
		}
	}
	for _, field := range []string{"multimodalContextManifestDigest", "providerMediaBlockManifestDigest", "responseDigest"} {
		if _, err := optionalEvaluationAuthenticityDigest(receipt, field); err != nil {
			return evaluationTurnInvocation{}, err
		}
	}
	if _, err := evaluationCount(receipt["generation"], "evaluation turn invocation generation"); err != nil {
		return evaluationTurnInvocation{}, err
	}
	if _, err := evaluationCount(receipt["attempt"], "evaluation turn invocation attempt"); err != nil {
		return evaluationTurnInvocation{}, err
	}
	provider, providerOK := receipt["provider"].(map[string]any)
	model, modelOK := receipt["model"].(map[string]any)
	if !providerOK || !modelOK {
		return evaluationTurnInvocation{}, invalid("evaluation turn invocation provider/model is invalid")
	}
	providerID, err := evaluationAuthenticityIdentity(provider["providerConfigurationId"], "provider configuration id")
	if err != nil {
		return evaluationTurnInvocation{}, err
	}
	protocolFamily := stringMember(provider, "protocolFamily")
	if !oneOfString(protocolFamily, "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") {
		return evaluationTurnInvocation{}, invalid("evaluation turn invocation protocol is invalid")
	}
	modelLineageDigest, err := evaluationAuthenticityDigest(model["lineageDigest"], "model lineage digest")
	if err != nil {
		return evaluationTurnInvocation{}, err
	}
	if _, err := evaluationAuthenticityUsageSourceDigest(receipt["usage"], false); err != nil {
		return evaluationTurnInvocation{}, err
	}
	costStatus := stringMember(receipt, "costStatus")
	if !oneOfString(costStatus, "priced", "not-applicable", "unknown") {
		return evaluationTurnInvocation{}, invalid("evaluation turn invocation cost status is invalid")
	}
	if _, _, err := decodeEvaluationCosts(receipt["cost"], costStatus == "priced"); err != nil {
		return evaluationTurnInvocation{}, err
	}
	startedAt, err := evaluationInstant(receipt["startedAt"], "evaluation turn invocation start")
	if err != nil {
		return evaluationTurnInvocation{}, err
	}
	completedAt, err := evaluationInstant(receipt["completedAt"], "evaluation turn invocation completion")
	outcome := stringMember(receipt, "outcome")
	if err != nil || completedAt.Before(startedAt) || !oneOfString(outcome,
		"completed", "refused", "safety-blocked", "truncated", "schema-failed", "provider-error", "cancelled", "timed-out", "partial") {
		return evaluationTurnInvocation{}, invalid("evaluation turn invocation outcome or time is invalid")
	}
	receiptDigest, err := verifyEvaluationAuthenticityDigest(receipt, "receiptDigest")
	if err != nil {
		return evaluationTurnInvocation{}, err
	}
	return evaluationTurnInvocation{
		InvocationID: stringMember(receipt, "invocationId"), RunID: stringMember(receipt, "runId"),
		ProviderConfigurationID: providerID, ProtocolFamily: protocolFamily, ModelLineageDigest: modelLineageDigest,
		InferenceConfigDigest: stringMember(receipt, "inferenceConfigurationDigest"),
		ContextPackDigest:     stringMember(receipt, "contextPackDigest"), RequestDigest: stringMember(receipt, "requestDigest"),
		ResponseDigest: stringMember(receipt, "responseDigest"), Outcome: outcome, Usage: receipt["usage"], Cost: receipt["cost"],
		ReceiptDigest: receiptDigest, StartedAt: startedAt, CompletedAt: completedAt,
		PricingSnapshotRef: stringMember(receipt, "pricingSnapshotRef"), Value: receipt,
	}, nil
}

func validateEvaluationTurnRetryReceipt(value any, turn map[string]any, invocation *evaluationTurnInvocation) error {
	retry, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(retry, []string{"policyDigest", "maximumAttempts", "attempts", "exhausted", "receiptDigest"}) {
		return invalid("evaluation turn retry receipt is invalid")
	}
	if _, err := evaluationAuthenticityDigest(retry["policyDigest"], "retry policy digest"); err != nil {
		return err
	}
	maximum, maximumOK := integerMember(retry, "maximumAttempts")
	attempts, attemptsOK := retry["attempts"].([]any)
	exhausted, exhaustedOK := retry["exhausted"].(bool)
	if !maximumOK || maximum != 1 || !attemptsOK || len(attempts) != 1 || !exhaustedOK {
		return invalid("evaluation turn retry cardinality is invalid")
	}
	attempt, ok := attempts[0].(map[string]any)
	if !ok || !exactEvaluationKeys(attempt, []string{
		"sequence", "requestDigest", "status", "retryable", "startedAt", "completedAt", "receiptDigest",
	}, "invocationReceiptDigest", "responseDigest") {
		return invalid("evaluation turn retry attempt is invalid")
	}
	sequence, sequenceOK := integerMember(attempt, "sequence")
	if !sequenceOK || sequence != 1 || stringMember(attempt, "status") != stringMember(turn, "status") ||
		stringMember(attempt, "requestDigest") != stringMember(turn, "requestArtifactDigest") || exhausted != (stringMember(turn, "status") != "completed") {
		return conflict("evaluation turn retry authority drifted")
	}
	if _, ok := attempt["retryable"].(bool); !ok {
		return invalid("evaluation turn retryability is invalid")
	}
	for _, field := range []string{"requestDigest", "invocationReceiptDigest", "responseDigest"} {
		if _, err := optionalEvaluationAuthenticityDigest(attempt, field); err != nil {
			return err
		}
	}
	startedAt, startErr := evaluationInstant(attempt["startedAt"], "evaluation turn retry start")
	completedAt, completeErr := evaluationInstant(attempt["completedAt"], "evaluation turn retry completion")
	if startErr != nil || completeErr != nil || completedAt.Before(startedAt) {
		return invalid("evaluation turn retry time is invalid")
	}
	invocationDigest := ""
	if invocation != nil {
		invocationDigest = invocation.ReceiptDigest
	}
	if stringMember(attempt, "invocationReceiptDigest") != invocationDigest ||
		stringMember(attempt, "responseDigest") != stringMember(turn, "responseArtifactDigest") {
		return conflict("evaluation turn retry invocation/response drifted")
	}
	if _, err := verifyEvaluationAuthenticityDigest(attempt, "receiptDigest"); err != nil {
		return err
	}
	if _, err := verifyEvaluationAuthenticityDigest(retry, "receiptDigest"); err != nil {
		return err
	}
	return nil
}

func decodeEvaluationInvocationTurnReceipt(source []byte) (evaluationInvocationTurnReceipt, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest", "turnIndex",
		"invocationId", "status", "dispatchState", "terminal", "caseDefinitionDigest", "contextPackDigest", "evidenceDigest",
	}, "dispatchIntentDigest", "transportReceiptDigest", "transportRetryReceipt", "invocationReceipt", "providerRequestId",
		"executionFailureAuthorityReceiptDigest", "resolvedModelId", "resolvedModelVersion", "resolvedModelIdentityDigest",
		"responseHeaderDigest", "mediaRepresentationManifestDigest", "requestArtifactDigest", "responseArtifactDigest",
		"providerResultSpoolReceiptDigest", "usageSourceDigest", "costSourceDigest", "usageSourceReceiptDigest",
		"costSourceReceiptDigest", "continuationReceiptDigest", "resultSubmissionReceiptDigest", "controlledRuntimeReceiptDigest") ||
		value["format"] != evaluationInvocationTurnReceiptFormat {
		return evaluationInvocationTurnReceipt{}, invalid("evaluation invocation turn receipt shape is invalid")
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnErr := evaluationCount(value["turnIndex"], "evaluation invocation turn index")
	terminal, terminalOK := value["terminal"].(bool)
	if !versionOK || version != 1 || turnErr != nil || !terminalOK ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationInvocationTurnReceipt{}, invalid("evaluation invocation turn partition is invalid")
	}
	for _, field := range []string{"attemptId", "invocationId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationInvocationTurnReceipt{}, err
		}
	}
	for _, field := range []string{"planDigest", "descriptorDigest", "caseDefinitionDigest", "contextPackDigest", "evidenceDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationInvocationTurnReceipt{}, err
		}
	}
	for _, field := range []string{
		"dispatchIntentDigest", "transportReceiptDigest", "executionFailureAuthorityReceiptDigest",
		"resolvedModelIdentityDigest", "responseHeaderDigest", "mediaRepresentationManifestDigest", "requestArtifactDigest",
		"responseArtifactDigest", "providerResultSpoolReceiptDigest", "usageSourceDigest", "costSourceDigest",
		"usageSourceReceiptDigest", "costSourceReceiptDigest", "continuationReceiptDigest",
		"resultSubmissionReceiptDigest", "controlledRuntimeReceiptDigest",
	} {
		if _, err := optionalEvaluationAuthenticityDigest(value, field); err != nil {
			return evaluationInvocationTurnReceipt{}, err
		}
	}
	for _, field := range []string{"providerRequestId", "resolvedModelId", "resolvedModelVersion"} {
		if _, err := optionalEvaluationAuthenticityIdentity(value, field); err != nil {
			return evaluationInvocationTurnReceipt{}, err
		}
	}
	status, dispatchState := stringMember(value, "status"), stringMember(value, "dispatchState")
	if !oneOfString(status, "completed", "provider-error", "timed-out", "rate-limited", "schema-failed", "blocked", "cancelled", "infrastructure-error") ||
		!oneOfString(dispatchState, "not-created", "not-dispatched", "dispatched") {
		return evaluationInvocationTurnReceipt{}, invalid("evaluation invocation turn state is invalid")
	}
	var invocation *evaluationTurnInvocation
	if raw, exists := value["invocationReceipt"]; exists {
		decoded, err := decodeEvaluationTurnInvocation(raw)
		if err != nil {
			return evaluationInvocationTurnReceipt{}, err
		}
		invocation = &decoded
	}
	hasDispatch := dispatchState != "not-created"
	dispatched := dispatchState == "dispatched"
	for _, field := range []string{"dispatchIntentDigest", "transportReceiptDigest"} {
		if (stringMember(value, field) != "") != hasDispatch {
			return evaluationInvocationTurnReceipt{}, conflict("evaluation invocation turn dispatch authority drifted")
		}
	}
	_, hasRetry := value["transportRetryReceipt"]
	if hasDispatch != hasRetry || hasDispatch != (stringMember(value, "requestArtifactDigest") != "") || dispatched != (invocation != nil) {
		return evaluationInvocationTurnReceipt{}, conflict("evaluation invocation turn dispatch/invocation presence drifted")
	}
	if hasRetry {
		if err := validateEvaluationTurnRetryReceipt(value["transportRetryReceipt"], value, invocation); err != nil {
			return evaluationInvocationTurnReceipt{}, err
		}
	}
	if !dispatched {
		for _, field := range []string{"providerRequestId", "resolvedModelId", "resolvedModelVersion", "resolvedModelIdentityDigest", "responseHeaderDigest",
			"responseArtifactDigest", "providerResultSpoolReceiptDigest", "usageSourceDigest", "costSourceDigest",
			"usageSourceReceiptDigest", "costSourceReceiptDigest"} {
			if _, exists := value[field]; exists {
				return evaluationInvocationTurnReceipt{}, conflict("evaluation non-dispatched turn contains provider response authority")
			}
		}
	}
	if invocation != nil {
		usageDigest, usageErr := evaluationAuthenticityUsageSourceDigest(invocation.Usage, false)
		costDigest, costErr := evaluationAuthenticityCostSourceDigest(invocation.Cost, false)
		if usageErr != nil || costErr != nil || invocation.InvocationID != stringMember(value, "invocationId") ||
			invocation.ContextPackDigest != stringMember(value, "contextPackDigest") ||
			invocation.RequestDigest != stringMember(value, "requestArtifactDigest") ||
			invocation.ResponseDigest != stringMember(value, "responseArtifactDigest") ||
			usageDigest != stringMember(value, "usageSourceDigest") || costDigest != stringMember(value, "costSourceDigest") {
			return evaluationInvocationTurnReceipt{}, conflict("evaluation invocation turn nested receipt drifted")
		}
	}
	completedContinuation := status == "completed" && !terminal
	completedTerminal := status == "completed" && terminal
	failedTerminal := status != "completed" && terminal
	if completedContinuation {
		if !dispatched || stringMember(value, "providerRequestId") == "" || stringMember(value, "responseHeaderDigest") == "" ||
			stringMember(value, "responseArtifactDigest") == "" || stringMember(value, "providerResultSpoolReceiptDigest") == "" ||
			stringMember(value, "usageSourceReceiptDigest") == "" || stringMember(value, "costSourceReceiptDigest") == "" ||
			stringMember(value, "continuationReceiptDigest") == "" || stringMember(value, "executionFailureAuthorityReceiptDigest") != "" ||
			stringMember(value, "resultSubmissionReceiptDigest") != "" || stringMember(value, "controlledRuntimeReceiptDigest") != "" {
			return evaluationInvocationTurnReceipt{}, conflict("evaluation continuation turn authority is invalid")
		}
	} else if completedTerminal {
		if !dispatched || stringMember(value, "providerRequestId") == "" || stringMember(value, "responseHeaderDigest") == "" ||
			stringMember(value, "responseArtifactDigest") == "" || stringMember(value, "providerResultSpoolReceiptDigest") == "" ||
			stringMember(value, "usageSourceReceiptDigest") == "" || stringMember(value, "costSourceReceiptDigest") == "" ||
			stringMember(value, "continuationReceiptDigest") != "" || stringMember(value, "executionFailureAuthorityReceiptDigest") != "" ||
			stringMember(value, "resultSubmissionReceiptDigest") == "" || stringMember(value, "controlledRuntimeReceiptDigest") == "" {
			return evaluationInvocationTurnReceipt{}, conflict("evaluation completed terminal turn authority is invalid")
		}
	} else if failedTerminal {
		if stringMember(value, "executionFailureAuthorityReceiptDigest") == "" || stringMember(value, "continuationReceiptDigest") != "" ||
			stringMember(value, "resultSubmissionReceiptDigest") != "" || stringMember(value, "controlledRuntimeReceiptDigest") != "" {
			return evaluationInvocationTurnReceipt{}, conflict("evaluation failed terminal turn authority is invalid")
		}
	} else {
		return evaluationInvocationTurnReceipt{}, invalid("evaluation invocation turn terminal shape is invalid")
	}
	if _, err := verifyEvaluationAuthenticityDigest(value, "evidenceDigest"); err != nil {
		return evaluationInvocationTurnReceipt{}, err
	}
	return evaluationInvocationTurnReceipt{
		EvaluationInvocationTurnReceiptRecord: EvaluationInvocationTurnReceiptRecord{
			PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
			AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turnIndex,
			InvocationID: stringMember(value, "invocationId"), Status: status, DispatchState: dispatchState, Terminal: terminal,
			DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"), TransportReceiptDigest: stringMember(value, "transportReceiptDigest"),
			ProviderResultSpoolReceiptDigest:       stringMember(value, "providerResultSpoolReceiptDigest"),
			ExecutionFailureAuthorityReceiptDigest: stringMember(value, "executionFailureAuthorityReceiptDigest"),
			ResultSubmissionReceiptDigest:          stringMember(value, "resultSubmissionReceiptDigest"),
			ControlledRuntimeReceiptDigest:         stringMember(value, "controlledRuntimeReceiptDigest"),
			ResponseArtifactDigest:                 stringMember(value, "responseArtifactDigest"),
			PreDispatchFailureReceiptDigest: func() string {
				if dispatchState == "not-created" {
					return stringMember(value, "executionFailureAuthorityReceiptDigest")
				}
				return ""
			}(),
			EvidenceDigest: stringMember(value, "evidenceDigest"), ReceiptBytes: canonical,
		},
		CaseDefinitionDigest: stringMember(value, "caseDefinitionDigest"), ContextPackDigest: stringMember(value, "contextPackDigest"),
		MediaRepresentationManifestDigest: stringMember(value, "mediaRepresentationManifestDigest"),
		RequestArtifactDigest:             stringMember(value, "requestArtifactDigest"), ProviderRequestID: stringMember(value, "providerRequestId"),
		ResolvedModelID: stringMember(value, "resolvedModelId"), ResolvedModelVersion: stringMember(value, "resolvedModelVersion"),
		ResolvedModelIdentityDigest: stringMember(value, "resolvedModelIdentityDigest"), ResponseHeaderDigest: stringMember(value, "responseHeaderDigest"),
		UsageSourceDigest: stringMember(value, "usageSourceDigest"),
		CostSourceDigest:  stringMember(value, "costSourceDigest"), UsageSourceReceiptDigest: stringMember(value, "usageSourceReceiptDigest"),
		CostSourceReceiptDigest: stringMember(value, "costSourceReceiptDigest"), ContinuationReceiptDigest: stringMember(value, "continuationReceiptDigest"),
		TransportRetryReceipt: func() map[string]any { result, _ := value["transportRetryReceipt"].(map[string]any); return result }(),
		Invocation:            invocation, Value: value,
	}, nil
}

func decodeEvaluationInvocationTurnSetReceipt(source []byte) (evaluationInvocationTurnSetReceipt, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest", "turnReceiptDigests",
		"terminalTurnIndex", "terminalStatus", "dispatchedInvocationCount", "aggregateUsage", "aggregateUsageDigest",
		"aggregateCost", "aggregateCostDigest", "sourceReceiptSetDigest", "receiptDigest",
	}, "terminalResultSubmissionReceiptDigest", "terminalControlledRuntimeReceiptDigest", "terminalExecutionFailureAuthorityReceiptDigest") ||
		value["format"] != evaluationInvocationTurnSetReceiptFormat {
		return evaluationInvocationTurnSetReceipt{}, invalid("evaluation invocation turn-set receipt shape is invalid")
	}
	version, versionOK := integerMember(value, "version")
	terminalTurnIndex, turnErr := evaluationCount(value["terminalTurnIndex"], "evaluation turn-set terminal index")
	dispatchedCount, countErr := evaluationCount(value["dispatchedInvocationCount"], "evaluation turn-set dispatched count")
	digestValues, digestOK := value["turnReceiptDigests"].([]any)
	if !versionOK || version != 1 || turnErr != nil || countErr != nil || !digestOK || len(digestValues) < 1 ||
		terminalTurnIndex != int64(len(digestValues)-1) || dispatchedCount > int64(len(digestValues)) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationInvocationTurnSetReceipt{}, invalid("evaluation invocation turn-set cardinality is invalid")
	}
	for _, field := range []string{"attemptId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationInvocationTurnSetReceipt{}, err
		}
	}
	for _, field := range []string{"planDigest", "descriptorDigest", "aggregateUsageDigest", "aggregateCostDigest", "sourceReceiptSetDigest", "receiptDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationInvocationTurnSetReceipt{}, err
		}
	}
	turnDigests := make([]string, len(digestValues))
	seen := make(map[string]struct{}, len(digestValues))
	for index, raw := range digestValues {
		digest, err := evaluationAuthenticityDigest(raw, "turn receipt digest")
		if err != nil {
			return evaluationInvocationTurnSetReceipt{}, err
		}
		if _, exists := seen[digest]; exists {
			return evaluationInvocationTurnSetReceipt{}, invalid("evaluation turn-set contains duplicate receipts")
		}
		seen[digest] = struct{}{}
		turnDigests[index] = digest
	}
	if _, err := evaluationAuthenticityUsageSourceDigest(value["aggregateUsage"], false); err != nil ||
		stringMember(value, "aggregateUsageDigest") != stringMember(value["aggregateUsage"].(map[string]any), "vectorDigest") {
		return evaluationInvocationTurnSetReceipt{}, invalid("evaluation turn-set aggregate usage is invalid")
	}
	cost, ok := value["aggregateCost"].([]any)
	if !ok {
		return evaluationInvocationTurnSetReceipt{}, invalid("evaluation turn-set aggregate cost is invalid")
	}
	if _, _, err := decodeEvaluationCosts(cost, false); err != nil {
		return evaluationInvocationTurnSetReceipt{}, err
	}
	costAuthority := make([]any, len(cost))
	for index, raw := range cost {
		entry := raw.(map[string]any)
		costAuthority[index] = map[string]any{"currency": entry["currency"], "amount": entry["amount"], "confidence": entry["confidence"]}
	}
	costDigest, err := canonicaljson.Digest(costAuthority)
	if err != nil || costDigest != stringMember(value, "aggregateCostDigest") {
		return evaluationInvocationTurnSetReceipt{}, invalid("evaluation turn-set aggregate cost digest drifted")
	}
	status := stringMember(value, "terminalStatus")
	completed := status == "completed"
	if !oneOfString(status, "completed", "provider-error", "timed-out", "rate-limited", "schema-failed", "blocked", "cancelled", "infrastructure-error") ||
		completed != (stringMember(value, "terminalResultSubmissionReceiptDigest") != "" && stringMember(value, "terminalControlledRuntimeReceiptDigest") != "") ||
		completed == (stringMember(value, "terminalExecutionFailureAuthorityReceiptDigest") != "") {
		return evaluationInvocationTurnSetReceipt{}, invalid("evaluation turn-set terminal authority is invalid")
	}
	for _, field := range []string{"terminalResultSubmissionReceiptDigest", "terminalControlledRuntimeReceiptDigest", "terminalExecutionFailureAuthorityReceiptDigest"} {
		if _, err := optionalEvaluationAuthenticityDigest(value, field); err != nil {
			return evaluationInvocationTurnSetReceipt{}, err
		}
	}
	if _, err := verifyEvaluationAuthenticityDigest(value, "receiptDigest"); err != nil {
		return evaluationInvocationTurnSetReceipt{}, err
	}
	return evaluationInvocationTurnSetReceipt{
		EvaluationInvocationTurnSetReceiptRecord: EvaluationInvocationTurnSetReceiptRecord{
			PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
			AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
			TerminalTurnIndex: terminalTurnIndex, TerminalStatus: status, DispatchedInvocationCount: dispatchedCount,
			TurnReceiptCount: int64(len(turnDigests)), SourceReceiptSetDigest: stringMember(value, "sourceReceiptSetDigest"),
			TerminalResultSubmissionReceiptDigest:          stringMember(value, "terminalResultSubmissionReceiptDigest"),
			TerminalControlledRuntimeReceiptDigest:         stringMember(value, "terminalControlledRuntimeReceiptDigest"),
			TerminalExecutionFailureAuthorityReceiptDigest: stringMember(value, "terminalExecutionFailureAuthorityReceiptDigest"),
			ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: canonical,
		}, TurnReceiptDigests: turnDigests, AggregateUsage: value["aggregateUsage"], AggregateCost: cost,
		AggregateUsageDigest: stringMember(value, "aggregateUsageDigest"), AggregateCostDigest: stringMember(value, "aggregateCostDigest"), Value: value,
	}, nil
}

func scanEvaluationInvocationTurnReceipt(scanner interface{ Scan(...any) error }, namespaceID string, partition EvaluationPlanPartition) (EvaluationInvocationTurnReceiptRecord, error) {
	var record EvaluationInvocationTurnReceiptRecord
	var dispatchIntent, transport, spool, failure, submission, runtime, response, preDispatchFailure sql.NullString
	var source []byte
	if err := scanner.Scan(&record.AttemptID, &record.DescriptorDigest, &record.TurnIndex, &record.InvocationID,
		&record.Status, &record.DispatchState, &record.Terminal, &dispatchIntent, &transport, &spool, &failure,
		&submission, &runtime, &response, &preDispatchFailure, &record.EvidenceDigest, &source); err != nil {
		return EvaluationInvocationTurnReceiptRecord{}, err
	}
	record.DispatchIntentDigest, record.TransportReceiptDigest = dispatchIntent.String, transport.String
	record.ProviderResultSpoolReceiptDigest, record.ExecutionFailureAuthorityReceiptDigest = spool.String, failure.String
	record.ResultSubmissionReceiptDigest, record.ControlledRuntimeReceiptDigest = submission.String, runtime.String
	record.ResponseArtifactDigest = response.String
	record.PreDispatchFailureReceiptDigest = preDispatchFailure.String
	decoded, err := decodeEvaluationInvocationTurnReceipt(source)
	if err != nil {
		return EvaluationInvocationTurnReceiptRecord{}, fmt.Errorf("decode persisted evaluation invocation turn: %w", err)
	}
	actual := decoded.EvaluationInvocationTurnReceiptRecord
	if record.AttemptID != actual.AttemptID || record.DescriptorDigest != actual.DescriptorDigest || record.TurnIndex != actual.TurnIndex ||
		record.InvocationID != actual.InvocationID || record.Status != actual.Status || record.DispatchState != actual.DispatchState ||
		record.Terminal != actual.Terminal || record.DispatchIntentDigest != actual.DispatchIntentDigest ||
		record.TransportReceiptDigest != actual.TransportReceiptDigest || record.ProviderResultSpoolReceiptDigest != actual.ProviderResultSpoolReceiptDigest ||
		record.ExecutionFailureAuthorityReceiptDigest != actual.ExecutionFailureAuthorityReceiptDigest ||
		record.ResultSubmissionReceiptDigest != actual.ResultSubmissionReceiptDigest || record.ControlledRuntimeReceiptDigest != actual.ControlledRuntimeReceiptDigest ||
		record.ResponseArtifactDigest != actual.ResponseArtifactDigest ||
		record.PreDispatchFailureReceiptDigest != actual.PreDispatchFailureReceiptDigest ||
		record.EvidenceDigest != actual.EvidenceDigest || !bytes.Equal(source, actual.ReceiptBytes) {
		return EvaluationInvocationTurnReceiptRecord{}, conflict("persisted evaluation invocation turn metadata drifted")
	}
	record.NamespaceID, record.PlanDigest, record.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
	record.ReceiptBytes = append([]byte(nil), source...)
	return record, nil
}

func queryEvaluationInvocationTurnReceipts(ctx context.Context, queryer evaluationReadQueryer, namespaceID string, partition EvaluationPlanPartition, attemptID string) ([]EvaluationInvocationTurnReceiptRecord, error) {
	query := `SELECT attempt_id, descriptor_digest, turn_index, invocation_id, status, dispatch_state, terminal,
		dispatch_intent_digest, transport_receipt_digest, provider_result_spool_receipt_digest,
		execution_failure_authority_receipt_digest, result_submission_receipt_digest, controlled_runtime_receipt_digest,
		response_artifact_digest, pre_dispatch_failure_receipt_digest, evidence_digest, receipt_bytes
	FROM agent_evaluation_invocation_turn_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`
	args := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	if attemptID != "" {
		query += ` AND attempt_id = $4`
		args = append(args, attemptID)
	}
	query += ` ORDER BY attempt_id COLLATE "C", turn_index`
	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]EvaluationInvocationTurnReceiptRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationInvocationTurnReceipt(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		result = append(result, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (repository *Repository) ListEvaluationInvocationTurnReceipts(ctx context.Context, authority EvaluationAuthority, partition EvaluationPlanPartition) ([]EvaluationInvocationTurnReceiptRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationInvocationTurnReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func scanEvaluationInvocationTurnSetReceipt(scanner interface{ Scan(...any) error }, namespaceID string, partition EvaluationPlanPartition) (EvaluationInvocationTurnSetReceiptRecord, error) {
	var record EvaluationInvocationTurnSetReceiptRecord
	var source []byte
	if err := scanner.Scan(&record.AttemptID, &record.DescriptorDigest, &record.TerminalTurnIndex, &record.TerminalStatus,
		&record.DispatchedInvocationCount, &record.TurnReceiptCount, &record.SourceReceiptSetDigest, &record.ReceiptDigest, &source); err != nil {
		return EvaluationInvocationTurnSetReceiptRecord{}, err
	}
	decoded, err := decodeEvaluationInvocationTurnSetReceipt(source)
	if err != nil {
		return EvaluationInvocationTurnSetReceiptRecord{}, fmt.Errorf("decode persisted evaluation invocation turn-set: %w", err)
	}
	actual := decoded.EvaluationInvocationTurnSetReceiptRecord
	if record.AttemptID != actual.AttemptID || record.DescriptorDigest != actual.DescriptorDigest ||
		record.TerminalTurnIndex != actual.TerminalTurnIndex || record.TerminalStatus != actual.TerminalStatus ||
		record.DispatchedInvocationCount != actual.DispatchedInvocationCount || record.TurnReceiptCount != actual.TurnReceiptCount ||
		record.SourceReceiptSetDigest != actual.SourceReceiptSetDigest || record.ReceiptDigest != actual.ReceiptDigest || !bytes.Equal(source, actual.ReceiptBytes) {
		return EvaluationInvocationTurnSetReceiptRecord{}, conflict("persisted evaluation invocation turn-set metadata drifted")
	}
	record = actual
	record.NamespaceID, record.PlanDigest, record.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
	record.ReceiptBytes = append([]byte(nil), source...)
	return record, nil
}

func queryEvaluationInvocationTurnSetReceipts(ctx context.Context, queryer evaluationReadQueryer, namespaceID string, partition EvaluationPlanPartition, attemptID string) ([]EvaluationInvocationTurnSetReceiptRecord, error) {
	query := `SELECT attempt_id, descriptor_digest, terminal_turn_index, terminal_status, dispatched_invocation_count,
		turn_receipt_count, source_receipt_set_digest, receipt_digest, receipt_bytes
	FROM agent_evaluation_invocation_turn_set_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`
	args := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	if attemptID != "" {
		query += ` AND attempt_id = $4`
		args = append(args, attemptID)
	}
	query += ` ORDER BY attempt_id COLLATE "C"`
	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]EvaluationInvocationTurnSetReceiptRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationInvocationTurnSetReceipt(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		result = append(result, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (repository *Repository) ListEvaluationInvocationTurnSetReceipts(ctx context.Context, authority EvaluationAuthority, partition EvaluationPlanPartition) ([]EvaluationInvocationTurnSetReceiptRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationInvocationTurnSetReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func validateEvaluationInvocationTurnSetJoin(turns []evaluationInvocationTurnReceipt, set evaluationInvocationTurnSetReceipt) error {
	if len(turns) != len(set.TurnReceiptDigests) || len(turns) == 0 {
		return conflict("evaluation turn-set coverage drifted")
	}
	dispatched := int64(0)
	sourceDigests := make([]any, 0, len(turns)*2)
	for index, turn := range turns {
		if turn.AttemptID != set.AttemptID || turn.DescriptorDigest != set.DescriptorDigest || turn.PlanDigest != set.PlanDigest ||
			turn.RepositoryCommit != set.RepositoryCommit || turn.TurnIndex != int64(index) || turn.Terminal != (index == len(turns)-1) ||
			turn.EvidenceDigest != set.TurnReceiptDigests[index] {
			return conflict("evaluation turn-set ordered membership drifted")
		}
		if turn.DispatchState == "dispatched" {
			dispatched++
		}
		for _, digest := range []string{turn.UsageSourceReceiptDigest, turn.CostSourceReceiptDigest} {
			if digest != "" {
				sourceDigests = append(sourceDigests, digest)
			}
		}
	}
	terminal := turns[len(turns)-1]
	sourceSetDigest, err := canonicaljson.Digest(sourceDigests)
	if err != nil || dispatched != set.DispatchedInvocationCount || terminal.Status != set.TerminalStatus ||
		terminal.ResultSubmissionReceiptDigest != set.TerminalResultSubmissionReceiptDigest ||
		terminal.ControlledRuntimeReceiptDigest != set.TerminalControlledRuntimeReceiptDigest ||
		terminal.ExecutionFailureAuthorityReceiptDigest != set.TerminalExecutionFailureAuthorityReceiptDigest ||
		sourceSetDigest != set.SourceReceiptSetDigest {
		return conflict("evaluation turn-set aggregate terminal authority drifted")
	}
	return nil
}

func invocationTurnsFromBytes(values [][]byte) ([]evaluationInvocationTurnReceipt, error) {
	turns := make([]evaluationInvocationTurnReceipt, len(values))
	for index, source := range values {
		turn, err := decodeEvaluationInvocationTurnReceipt(source)
		if err != nil {
			return nil, err
		}
		if turn.TurnIndex != int64(index) {
			return nil, invalid("evaluation invocation turns are not in canonical turn order")
		}
		turns[index] = turn
	}
	return turns, nil
}

func sortInvocationTurnRecords(records []EvaluationInvocationTurnReceiptRecord) {
	sort.Slice(records, func(left, right int) bool {
		if records[left].AttemptID != records[right].AttemptID {
			return records[left].AttemptID < records[right].AttemptID
		}
		return records[left].TurnIndex < records[right].TurnIndex
	})
}

var _ = errors.Is
