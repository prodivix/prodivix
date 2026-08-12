package agent

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilitySpecificReceiptFormat       = "prodivix.agent-evaluation-capability-specific-receipt"
	maximumEvaluationCapabilitySpecificReceiptBytes = 65_536
	maximumEvaluationCapabilitySpecificPerAttempt   = 2
)

type EvaluationCapabilitySpecificReceiptRecord struct {
	NamespaceID                string
	PlanDigest                 string
	RepositoryCommit           string
	ReceiptID                  string
	ReceiptKind                string
	AttemptID                  string
	DescriptorDigest           string
	CaseID                     string
	MaterialDigest             string
	CapabilityDescriptorDigest string
	TurnIndex                  int64
	InvocationID               string
	RequestDigest              string
	ResultDigest               string
	AuthorityKind              string
	AuthorityFactDigest        string
	StartedAt                  time.Time
	CompletedAt                time.Time
	ReceiptDigest              string
	ReceiptBytes               []byte
}

type evaluationCapabilitySpecificReceipt struct {
	EvaluationCapabilitySpecificReceiptRecord
	ToolID             string
	ToolCallID         string
	ProviderToolCallID string
	Value              map[string]any
}

func evaluationCapabilityFactDigest(value map[string]any, field string) (string, error) {
	base := cloneEvaluationObject(value)
	delete(base, field)
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, field) {
		return "", ErrConflict
	}
	return digest, nil
}

func evaluationCapabilityObjectWithin(value map[string]any, maximum int) bool {
	encoded, err := canonicaljson.Bytes(value)
	return err == nil && len(encoded) <= maximum
}

func evaluationCapabilityNonBlankString(value any) bool {
	text, ok := value.(string)
	return ok && strings.TrimSpace(text) != ""
}

func evaluationCapabilityExactDigestArray(value any, maximum int, require bool) ([]string, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > maximum || require && len(raw) == 0 {
		return nil, ErrInvalid
	}
	result := make([]string, len(raw))
	for index, entry := range raw {
		digest, ok := entry.(string)
		if !ok || !evaluationDigestPattern.MatchString(digest) || index > 0 && result[index-1] >= digest {
			return nil, ErrInvalid
		}
		result[index] = digest
	}
	return result, nil
}

func evaluationCapabilityDigestSequence(value any, maximum int) ([]string, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > maximum {
		return nil, ErrInvalid
	}
	result := make([]string, len(raw))
	for index, entry := range raw {
		digest, ok := entry.(string)
		if !ok || !evaluationDigestPattern.MatchString(digest) {
			return nil, ErrInvalid
		}
		result[index] = digest
	}
	return result, nil
}

func evaluationCapabilityExactIdentityArray(value any, maximum int) ([]string, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > maximum {
		return nil, ErrInvalid
	}
	result := make([]string, len(raw))
	for index, entry := range raw {
		identity, ok := entry.(string)
		if !ok || !validEvaluationAgentControlIdentity(identity) || index > 0 && result[index-1] >= identity {
			return nil, ErrInvalid
		}
		result[index] = identity
	}
	return result, nil
}

func validateEvaluationCapabilityOwnerFactCurrent(fact map[string]any, receiptKind string) (string, error) {
	common := []string{
		"format", "version", "authorityKind", "category", "authorityId",
		"authorityImplementationDigest", "authorityRequestDigest", "authorityResultDigest",
		"observedAt", "factDigest",
	}
	var extra []string
	switch receiptKind {
	case "refusal-receipt", "truncation-receipt":
		extra = []string{"terminalEventDigest", "normalizedOutcome", "normalizationPolicyDigest"}
	case "budget-reservation-receipt":
		extra = []string{"reservationId", "demandDigest", "settlementDigest", "reservationStatus"}
	case "ack-reconciliation-receipt", "attempt-idempotency-receipt", "reconciliation-receipt":
		extra = []string{"idempotencyKey", "replayDisposition"}
	case "checkpoint-resume-receipt":
		extra = []string{"checkpointDigest", "fromGeneration", "toGeneration", "resumeResultDigest"}
	case "cancellation-receipt", "late-callback-rejection-receipt", "late-output-fence-receipt", "lease-fence-receipt", "state-fence-receipt", "timeout-receipt":
		extra = []string{"shardLeaseOwnerId", "shardLeaseGeneration", "dispatchState", "authorityInstant", "fenceDigest", "fenceOutcome"}
	case "authority-denial-receipt", "capability-unavailable-receipt":
		extra = []string{"policyDigest", "reasonCode", "decisionDigest"}
	default:
		return "", ErrInvalid
	}
	required := append(append([]string(nil), common...), extra...)
	if !exactEvaluationKeys(fact, required) ||
		!evaluationCapabilityObjectWithin(fact, 16_384) ||
		stringMember(fact, "format") != "prodivix.agent-evaluation-capability-owner-fact" ||
		stringMember(fact, "category") != receiptKind ||
		stringMember(fact, "authorityKind") != evaluationCapabilitySpecificAuthorityKind(receiptKind) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "authorityId")) ||
		!evaluationDigestPattern.MatchString(stringMember(fact, "authorityImplementationDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(fact, "authorityRequestDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(fact, "authorityResultDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(fact, "factDigest")) {
		return "", ErrInvalid
	}
	version, versionOK := integerMember(fact, "version")
	observedAt, observedErr := parseEvaluationServiceInstant(stringMember(fact, "observedAt"))
	if !versionOK || version != 1 || observedErr != nil {
		return "", ErrInvalid
	}
	switch receiptKind {
	case "refusal-receipt", "truncation-receipt":
		want := "refused"
		if receiptKind == "truncation-receipt" {
			want = "truncated"
		}
		if stringMember(fact, "normalizedOutcome") != want {
			return "", ErrConflict
		}
		for _, field := range []string{"terminalEventDigest", "normalizationPolicyDigest"} {
			if !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
				return "", ErrInvalid
			}
		}
		if stringMember(fact, "terminalEventDigest") != stringMember(fact, "authorityResultDigest") {
			return "", ErrConflict
		}
	case "budget-reservation-receipt":
		if !validEvaluationAgentControlIdentity(stringMember(fact, "reservationId")) ||
			!oneOfString(stringMember(fact, "reservationStatus"), "settled", "reconciled") {
			return "", ErrInvalid
		}
		for _, field := range []string{"demandDigest", "settlementDigest"} {
			if !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
				return "", ErrInvalid
			}
		}
		if stringMember(fact, "settlementDigest") != stringMember(fact, "authorityResultDigest") {
			return "", ErrConflict
		}
	case "ack-reconciliation-receipt", "attempt-idempotency-receipt", "reconciliation-receipt":
		disposition := stringMember(fact, "replayDisposition")
		validDisposition := receiptKind == "attempt-idempotency-receipt" && oneOfString(disposition, "first-applied", "exact-replay") ||
			receiptKind == "ack-reconciliation-receipt" && oneOfString(disposition, "exact-replay", "reconciled") ||
			receiptKind == "reconciliation-receipt" && disposition == "reconciled"
		if !validDisposition || !validEvaluationAgentControlIdentity(stringMember(fact, "idempotencyKey")) {
			return "", ErrInvalid
		}
		for _, field := range []string{"authorityRequestDigest", "authorityResultDigest"} {
			if !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
				return "", ErrInvalid
			}
		}
	case "checkpoint-resume-receipt":
		from, fromOK := integerMember(fact, "fromGeneration")
		to, toOK := integerMember(fact, "toGeneration")
		if !fromOK || from < 0 || !toOK || to <= from ||
			!evaluationDigestPattern.MatchString(stringMember(fact, "checkpointDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(fact, "resumeResultDigest")) ||
			stringMember(fact, "resumeResultDigest") != stringMember(fact, "authorityResultDigest") {
			return "", ErrInvalid
		}
	case "cancellation-receipt", "late-callback-rejection-receipt", "late-output-fence-receipt", "lease-fence-receipt", "state-fence-receipt", "timeout-receipt":
		generation, generationOK := integerMember(fact, "shardLeaseGeneration")
		authorityAt, authorityErr := parseEvaluationServiceInstant(stringMember(fact, "authorityInstant"))
		want := "fenced"
		if receiptKind == "cancellation-receipt" {
			want = "cancelled"
		} else if receiptKind == "timeout-receipt" {
			want = "timed-out"
		} else if receiptKind == "late-callback-rejection-receipt" {
			want = "rejected"
		}
		if !generationOK || generation < 1 || authorityErr != nil || authorityAt.After(observedAt) ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "shardLeaseOwnerId")) ||
			!oneOfString(stringMember(fact, "dispatchState"), "not-created", "not-dispatched", "dispatched") ||
			!evaluationDigestPattern.MatchString(stringMember(fact, "fenceDigest")) ||
			stringMember(fact, "fenceDigest") != stringMember(fact, "authorityResultDigest") ||
			stringMember(fact, "fenceOutcome") != want {
			return "", ErrInvalid
		}
	case "authority-denial-receipt", "capability-unavailable-receipt":
		if !validEvaluationAgentControlIdentity(stringMember(fact, "reasonCode")) {
			return "", ErrInvalid
		}
		for _, field := range []string{"policyDigest", "authorityRequestDigest", "decisionDigest"} {
			if !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
				return "", ErrInvalid
			}
		}
		if stringMember(fact, "decisionDigest") != stringMember(fact, "authorityResultDigest") {
			return "", ErrConflict
		}
	}
	return evaluationCapabilityFactDigest(fact, "factDigest")
}

func validateEvaluationControlledRuntimeCapabilityFact(fact map[string]any) (string, error) {
	if !exactEvaluationKeys(fact, []string{
		"format", "version", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"caseId", "materialDigest", "runtimeAuthorityId", "runtimeImplementationDigest",
		"verificationClosureDigest", "verificationVerdict", "ownerAuthoritySetDigest", "factDigest",
	}, "toolExecutionReceiptSetDigest", "continuationReceiptSetDigest") ||
		!evaluationCapabilityObjectWithin(fact, 32_768) ||
		stringMember(fact, "format") != "prodivix.agent-evaluation-controlled-runtime-capability-fact" ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(fact, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "attemptId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "caseId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "runtimeAuthorityId")) ||
		!oneOfString(stringMember(fact, "verificationVerdict"), "passed", "failed") {
		return "", ErrInvalid
	}
	version, ok := integerMember(fact, "version")
	if !ok || version != 1 {
		return "", ErrInvalid
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "materialDigest", "runtimeImplementationDigest",
		"verificationClosureDigest", "ownerAuthoritySetDigest", "factDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
			return "", ErrInvalid
		}
	}
	for _, field := range []string{"toolExecutionReceiptSetDigest", "continuationReceiptSetDigest"} {
		if _, exists := fact[field]; exists && !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
			return "", ErrInvalid
		}
	}
	return evaluationCapabilityFactDigest(fact, "factDigest")
}

func validateEvaluationCapabilitySpecificAuthorityCurrent(authority map[string]any, receiptKind string) (string, string, error) {
	if !exactEvaluationKeys(authority, []string{"authorityKind", "receiptKind", "factDigest", "semanticDigest", "fact"}) ||
		stringMember(authority, "authorityKind") != evaluationCapabilitySpecificAuthorityKind(receiptKind) ||
		stringMember(authority, "receiptKind") != receiptKind ||
		!evaluationDigestPattern.MatchString(stringMember(authority, "factDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(authority, "semanticDigest")) {
		return "", "", ErrInvalid
	}
	fact, ok := objectMember(authority, "fact")
	if !ok {
		return "", "", ErrInvalid
	}
	kind := stringMember(authority, "authorityKind")
	var digest string
	var err error
	switch kind {
	case "terminal-normalization", "recovery-authority", "capability-denial":
		digest, err = validateEvaluationCapabilityOwnerFactCurrent(fact, receiptKind)
	case "controlled-runtime":
		digest, err = validateEvaluationControlledRuntimeCapabilityFact(fact)
	case "usage-vector":
		if !exactEvaluationKeys(fact, []string{"amounts", "vectorDigest"}) ||
			!evaluationCapabilityObjectWithin(fact, 16_384) {
			return "", "", ErrInvalid
		}
		if _, _, err = decodeEvaluationUsage(fact, false); err == nil {
			digest = stringMember(fact, "vectorDigest")
		}
	default:
		digest, err = validateEvaluationProviderCapabilityFact(kind, fact)
	}
	if err != nil || digest != stringMember(authority, "factDigest") {
		return "", "", ErrConflict
	}
	semanticDigest, err := canonicaljson.Digest(map[string]any{
		"authorityKind": kind, "receiptKind": receiptKind, "factDigest": digest,
	})
	if err != nil || semanticDigest != stringMember(authority, "semanticDigest") {
		return "", "", ErrConflict
	}
	return kind, digest, nil
}

func validateEvaluationProviderCapabilityFact(kind string, fact map[string]any) (string, error) {
	switch kind {
	case "provider-job":
		if !exactEvaluationKeys(fact, []string{
			"providerJobId", "taskId", "runId", "generation", "invocationId", "phase",
			"callbackAuthority", "receiptDigest",
		}, "outcome") || !evaluationCapabilityObjectWithin(fact, 8_192) ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "providerJobId")) ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "taskId")) ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "runId")) ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "invocationId")) ||
			!oneOfString(stringMember(fact, "phase"), "submitting", "accepted", "running", "cancelling", "terminal") ||
			!oneOfString(stringMember(fact, "callbackAuthority"), "active", "revoked") {
			return "", ErrInvalid
		}
		generation, ok := integerMember(fact, "generation")
		terminal := stringMember(fact, "phase") == "terminal"
		_, outcomeExists := fact["outcome"]
		if !ok || generation < 0 || terminal != outcomeExists || terminal &&
			(!oneOfString(stringMember(fact, "outcome"), "completed", "failed", "cancelled", "expired", "reconciliation-required") ||
				stringMember(fact, "callbackAuthority") != "revoked") {
			return "", ErrInvalid
		}
	case "provider-cache":
		if !exactEvaluationKeys(fact, []string{
			"cacheMode", "cacheScope", "provenIsolation", "prefixOrItemDigests", "usageRef", "receiptDigest",
		}, "cacheKeyDigest", "providerRegion", "createdAt", "expiresAt") ||
			!evaluationCapabilityObjectWithin(fact, 16_384) ||
			!oneOfString(stringMember(fact, "cacheMode"), "prompt", "file", "conversation") ||
			!oneOfString(stringMember(fact, "cacheScope"), "invocation", "task", "workspace") ||
			!oneOfString(stringMember(fact, "provenIsolation"), "invocation", "task", "workspace") ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "usageRef")) {
			return "", ErrInvalid
		}
		order := map[string]int{"invocation": 0, "task": 1, "workspace": 2}
		if order[stringMember(fact, "cacheScope")] > order[stringMember(fact, "provenIsolation")] {
			return "", ErrConflict
		}
		prefixes, err := evaluationCapabilityExactDigestArray(fact["prefixOrItemDigests"], 128, false)
		if err != nil {
			return "", err
		}
		_, cacheKeyExists := fact["cacheKeyDigest"]
		if !cacheKeyExists && len(prefixes) == 0 ||
			cacheKeyExists && !evaluationDigestPattern.MatchString(stringMember(fact, "cacheKeyDigest")) {
			return "", ErrInvalid
		}
		if region, exists := fact["providerRegion"]; exists && !evaluationCapabilityNonBlankString(region) {
			return "", ErrInvalid
		}
		_, created := fact["createdAt"]
		_, expires := fact["expiresAt"]
		if created != expires {
			return "", ErrInvalid
		}
		if created {
			createdAt, firstErr := parseEvaluationServiceInstant(stringMember(fact, "createdAt"))
			expiresAt, secondErr := parseEvaluationServiceInstant(stringMember(fact, "expiresAt"))
			if firstErr != nil || secondErr != nil || !expiresAt.After(createdAt) {
				return "", ErrInvalid
			}
		}
	case "retrieval-query":
		if !exactEvaluationKeys(fact, []string{
			"queryId", "toolDescriptorDigest", "queryDigest", "purpose", "networkPolicyDigest",
			"sourceResultRefs", "sourceResultDigests", "usageRef", "startedAt", "completedAt", "receiptDigest",
		}, "indexDigest", "retrievalConfigurationDigest") ||
			!evaluationCapabilityObjectWithin(fact, 32_768) ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "queryId")) ||
			!oneOfString(stringMember(fact, "purpose"), "public-research", "authorized-project-retrieval") ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "usageRef")) {
			return "", ErrInvalid
		}
		for _, field := range []string{"toolDescriptorDigest", "queryDigest", "networkPolicyDigest"} {
			if !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
				return "", ErrInvalid
			}
		}
		refs, err := evaluationCapabilityExactIdentityArray(fact["sourceResultRefs"], 128)
		if err != nil {
			return "", err
		}
		digests, err := evaluationCapabilityDigestSequence(fact["sourceResultDigests"], 128)
		if err != nil || len(refs) != len(digests) {
			return "", ErrInvalid
		}
		for _, field := range []string{"indexDigest", "retrievalConfigurationDigest"} {
			if _, exists := fact[field]; exists && !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
				return "", ErrInvalid
			}
		}
		started, firstErr := parseEvaluationServiceInstant(stringMember(fact, "startedAt"))
		completed, secondErr := parseEvaluationServiceInstant(stringMember(fact, "completedAt"))
		if firstErr != nil || secondErr != nil || completed.Before(started) {
			return "", ErrInvalid
		}
	case "parallel-tool-join":
		if !exactEvaluationKeys(fact, []string{
			"groupId", "planDigest", "generation", "joinedCallIds", "controlledToolExecutionReceiptDigests",
			"cancelledCallIds", "lateCallIds", "status", "resultDigest", "receiptDigest",
		}) || !evaluationCapabilityObjectWithin(fact, 16_384) ||
			!validEvaluationAgentControlIdentity(stringMember(fact, "groupId")) ||
			!evaluationDigestPattern.MatchString(stringMember(fact, "planDigest")) ||
			stringMember(fact, "status") != "joined" ||
			!evaluationDigestPattern.MatchString(stringMember(fact, "resultDigest")) {
			return "", ErrInvalid
		}
		generation, ok := integerMember(fact, "generation")
		joined, firstErr := evaluationCapabilityExactIdentityArray(fact["joinedCallIds"], 128)
		controlled, secondErr := evaluationCapabilityExactDigestArray(
			fact["controlledToolExecutionReceiptDigests"], 128, false,
		)
		cancelled, thirdErr := evaluationCapabilityExactIdentityArray(fact["cancelledCallIds"], 128)
		late, fourthErr := evaluationCapabilityExactIdentityArray(fact["lateCallIds"], 128)
		if !ok || generation < 0 || firstErr != nil || secondErr != nil || thirdErr != nil || fourthErr != nil ||
			len(joined) < 2 || len(controlled) != len(joined) || len(cancelled) != 0 || len(late) != 0 ||
			!evaluationIdentitySetsDisjoint(joined, cancelled, late) {
			return "", ErrInvalid
		}
	case "controlled-tool-execution":
		if err := validateEvaluationControlledToolCapabilityFact(fact); err != nil {
			return "", err
		}
	case "controlled-continuation":
		if err := validateEvaluationControlledContinuationCapabilityFact(fact); err != nil {
			return "", err
		}
	default:
		return "", ErrInvalid
	}
	return evaluationCapabilityFactDigest(fact, "receiptDigest")
}

func evaluationIdentitySetsDisjoint(sets ...[]string) bool {
	seen := make(map[string]struct{})
	for _, values := range sets {
		for _, value := range values {
			if _, duplicate := seen[value]; duplicate {
				return false
			}
			seen[value] = struct{}{}
		}
	}
	return true
}

func validateEvaluationControlledToolCapabilityFact(fact map[string]any) error {
	if !exactEvaluationKeys(fact, []string{
		"format", "version", "planDigest", "attemptId", "descriptorDigest", "caseId", "materialDigest",
		"loopPolicyDigest", "grantDigest", "toolRegistryDigest", "toolDefinitionDigest", "inputSchemaDigest",
		"generation", "idempotencyKey", "operationIntentDigest", "turnIndex", "toolCallId", "toolId",
		"argumentsDigest", "status", "resultDigest", "persistedArtifacts", "commandReceiptDigests",
		"transactionReceiptDigests", "receiptDigest",
	}) || !evaluationCapabilityObjectWithin(fact, 32_768) ||
		stringMember(fact, "format") != "prodivix.agent-evaluation-controlled-tool-execution-receipt" ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "attemptId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "caseId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "idempotencyKey")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "toolCallId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "toolId")) ||
		!oneOfString(stringMember(fact, "status"), "succeeded", "rejected") {
		return ErrInvalid
	}
	version, versionOK := integerMember(fact, "version")
	generation, generationOK := integerMember(fact, "generation")
	turn, turnOK := integerMember(fact, "turnIndex")
	if !versionOK || version != 1 || !generationOK || generation < 1 || !turnOK || turn < 0 || turn > 64 {
		return ErrInvalid
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "materialDigest", "loopPolicyDigest", "grantDigest",
		"toolRegistryDigest", "toolDefinitionDigest", "inputSchemaDigest", "operationIntentDigest",
		"argumentsDigest", "resultDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
			return ErrInvalid
		}
	}
	artifacts, ok := fact["persistedArtifacts"].([]any)
	if !ok || len(artifacts) > 128 || stringMember(fact, "status") == "rejected" && len(artifacts) != 0 {
		return ErrInvalid
	}
	seen := make(map[string]struct{}, len(artifacts))
	for _, raw := range artifacts {
		artifact, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(artifact, []string{
			"artifactKind", "artifactRef", "artifactDigest", "byteLength", "persistenceReceiptDigest",
		}) || !evaluationCapabilityObjectWithin(artifact, 4_096) ||
			!oneOfString(stringMember(artifact, "artifactKind"), "proposal", "verification-plan", "tool-receipt", "transaction-receipt", "verification-closure", "diagnostic-report") ||
			!validEvaluationAgentControlIdentity(stringMember(artifact, "artifactRef")) ||
			!evaluationDigestPattern.MatchString(stringMember(artifact, "artifactDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(artifact, "persistenceReceiptDigest")) {
			return ErrInvalid
		}
		length, lengthOK := integerMember(artifact, "byteLength")
		key := stringMember(artifact, "artifactKind") + "\x00" + stringMember(artifact, "artifactRef")
		if !lengthOK || length < 0 || length > 16_777_216 {
			return ErrInvalid
		}
		if _, duplicate := seen[key]; duplicate {
			return ErrConflict
		}
		seen[key] = struct{}{}
	}
	if _, err := evaluationCapabilityExactDigestArray(fact["commandReceiptDigests"], 128, false); err != nil {
		return err
	}
	if _, err := evaluationCapabilityExactDigestArray(fact["transactionReceiptDigests"], 128, false); err != nil {
		return err
	}
	return nil
}

func validateEvaluationControlledContinuationCapabilityFact(fact map[string]any) error {
	if !exactEvaluationKeys(fact, []string{
		"format", "version", "planDigest", "attemptId", "descriptorDigest", "caseId", "materialDigest",
		"loopPolicyDigest", "completedTurnIndex", "nextTurnIndex", "toolExecutionReceiptDigests",
		"toolResultSetDigest", "receiptDigest",
	}) || !evaluationCapabilityObjectWithin(fact, 16_384) ||
		stringMember(fact, "format") != "prodivix.agent-evaluation-controlled-continuation-receipt" ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "attemptId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "caseId")) {
		return ErrInvalid
	}
	version, versionOK := integerMember(fact, "version")
	completed, completedOK := integerMember(fact, "completedTurnIndex")
	next, nextOK := integerMember(fact, "nextTurnIndex")
	if !versionOK || version != 1 || !completedOK || completed < 0 || completed >= 64 || !nextOK || next != completed+1 {
		return ErrInvalid
	}
	for _, field := range []string{"planDigest", "descriptorDigest", "materialDigest", "loopPolicyDigest", "toolResultSetDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(fact, field)) {
			return ErrInvalid
		}
	}
	_, err := evaluationCapabilityExactDigestArray(fact["toolExecutionReceiptDigests"], 128, true)
	return err
}

func decodeEvaluationCapabilitySpecificReceipt(source []byte) (evaluationCapabilitySpecificReceipt, error) {
	if len(source) == 0 || len(source) > maximumEvaluationCapabilitySpecificReceiptBytes {
		return evaluationCapabilitySpecificReceipt{}, ErrInvalid
	}
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "receiptId", "receiptKind", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "caseId", "materialDigest", "capabilityDescriptorDigest", "turnIndex",
		"invocationId", "requestDigest", "resultDigest", "startedAt", "completedAt", "authority", "receiptDigest",
	}, "toolId", "toolCallId", "providerToolCallId", "providerCapabilityObservationReceiptDigest") ||
		stringMember(value, "format") != evaluationCapabilitySpecificReceiptFormat ||
		!validEvaluationCapabilitySpecificReceiptKind(stringMember(value, "receiptKind")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationCapabilitySpecificReceipt{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turn, turnOK := integerMember(value, "turnIndex")
	if !versionOK || version != 1 || !turnOK || turn < 0 || turn > 64 {
		return evaluationCapabilitySpecificReceipt{}, ErrInvalid
	}
	for _, field := range []string{"receiptId", "attemptId", "caseId", "invocationId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationCapabilitySpecificReceipt{}, ErrInvalid
		}
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "materialDigest", "capabilityDescriptorDigest",
		"requestDigest", "resultDigest", "receiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationCapabilitySpecificReceipt{}, ErrInvalid
		}
	}
	toolID, toolIDExists := value["toolId"]
	toolCallID, toolCallIDExists := value["toolCallId"]
	providerToolCallID, providerToolCallIDExists := value["providerToolCallId"]
	toolIDText, toolCallIDText, providerToolCallIDText := stringMember(value, "toolId"), stringMember(value, "toolCallId"), stringMember(value, "providerToolCallId")
	if toolIDExists != toolCallIDExists || toolIDExists &&
		(!validEvaluationAgentControlIdentity(toolIDText) || !validEvaluationAgentControlIdentity(toolCallIDText)) ||
		providerToolCallIDExists && (!toolIDExists || !validEvaluationAgentControlIdentity(providerToolCallIDText)) ||
		(toolIDExists && toolID == nil) || (toolCallIDExists && toolCallID == nil) ||
		(providerToolCallIDExists && providerToolCallID == nil) {
		return evaluationCapabilitySpecificReceipt{}, ErrInvalid
	}
	startedAt, startErr := parseEvaluationServiceInstant(stringMember(value, "startedAt"))
	completedAt, completeErr := parseEvaluationServiceInstant(stringMember(value, "completedAt"))
	if startErr != nil || completeErr != nil || completedAt.Before(startedAt) {
		return evaluationCapabilitySpecificReceipt{}, ErrInvalid
	}
	authority, ok := objectMember(value, "authority")
	if !ok {
		return evaluationCapabilitySpecificReceipt{}, ErrInvalid
	}
	authorityKind, factDigest, err := validateEvaluationCapabilitySpecificAuthorityCurrent(
		authority, stringMember(value, "receiptKind"),
	)
	if err != nil {
		return evaluationCapabilitySpecificReceipt{}, err
	}
	observationDigest := stringMember(value, "providerCapabilityObservationReceiptDigest")
	_, observationDigestExists := value["providerCapabilityObservationReceiptDigest"]
	requiresProviderObservation := evaluationProviderObservationFactKind(authorityKind) != ""
	if requiresProviderObservation != observationDigestExists ||
		observationDigestExists && !evaluationDigestPattern.MatchString(observationDigest) {
		return evaluationCapabilitySpecificReceipt{}, ErrInvalid
	}
	if oneOfString(authorityKind, "terminal-normalization", "recovery-authority", "capability-denial") {
		fact, _ := objectMember(authority, "fact")
		if stringMember(fact, "authorityResultDigest") != stringMember(value, "resultDigest") {
			return evaluationCapabilitySpecificReceipt{}, ErrConflict
		}
	}
	receiptDigest, err := evaluationCapabilityFactDigest(value, "receiptDigest")
	if err != nil {
		return evaluationCapabilitySpecificReceipt{}, err
	}
	return evaluationCapabilitySpecificReceipt{
		EvaluationCapabilitySpecificReceiptRecord: EvaluationCapabilitySpecificReceiptRecord{
			PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
			ReceiptID: stringMember(value, "receiptId"), ReceiptKind: stringMember(value, "receiptKind"),
			AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
			CaseID: stringMember(value, "caseId"), MaterialDigest: stringMember(value, "materialDigest"),
			CapabilityDescriptorDigest: stringMember(value, "capabilityDescriptorDigest"), TurnIndex: turn,
			InvocationID: stringMember(value, "invocationId"), RequestDigest: stringMember(value, "requestDigest"),
			ResultDigest: stringMember(value, "resultDigest"), AuthorityKind: authorityKind,
			AuthorityFactDigest: factDigest, StartedAt: startedAt, CompletedAt: completedAt,
			ReceiptDigest: receiptDigest, ReceiptBytes: canonical,
		},
		ToolID: toolIDText, ToolCallID: toolCallIDText, ProviderToolCallID: providerToolCallIDText, Value: value,
	}, nil
}

func insertEvaluationCapabilitySpecificReceipt(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	receipt evaluationCapabilitySpecificReceipt,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_specific_receipts (
		namespace_id, plan_digest, repository_commit, receipt_id, receipt_kind, attempt_id,
		descriptor_digest, case_id, material_digest, capability_descriptor_digest, turn_index,
		invocation_id, request_digest, result_digest, authority_kind, authority_fact_digest,
		started_at, completed_at, receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21)
	ON CONFLICT DO NOTHING`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.ReceiptID, receipt.ReceiptKind, receipt.AttemptID, receipt.DescriptorDigest,
		receipt.CaseID, receipt.MaterialDigest, receipt.CapabilityDescriptorDigest, receipt.TurnIndex,
		receipt.InvocationID, receipt.RequestDigest, receipt.ResultDigest, receipt.AuthorityKind,
		receipt.AuthorityFactDigest, receipt.StartedAt, receipt.CompletedAt, receipt.ReceiptDigest,
		string(receipt.ReceiptBytes), receipt.ReceiptBytes)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted == 1 {
		return err
	}
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_capability_specific_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND receipt_id=$4
		FOR SHARE`, namespaceID, partition.PlanDigest, partition.RepositoryCommit, receipt.ReceiptID).Scan(&existing); err != nil {
		return err
	}
	if !bytes.Equal(existing, receipt.ReceiptBytes) {
		return conflict("evaluation capability-specific receipt identity was reused")
	}
	return nil
}

func scanEvaluationCapabilitySpecificReceipt(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationCapabilitySpecificReceiptRecord, error) {
	var record EvaluationCapabilitySpecificReceiptRecord
	var source []byte
	if err := scanner.Scan(
		&record.ReceiptID, &record.ReceiptKind, &record.AttemptID, &record.DescriptorDigest,
		&record.CaseID, &record.MaterialDigest, &record.CapabilityDescriptorDigest, &record.TurnIndex,
		&record.InvocationID, &record.RequestDigest, &record.ResultDigest, &record.AuthorityKind,
		&record.AuthorityFactDigest, &record.StartedAt, &record.CompletedAt, &record.ReceiptDigest, &source,
	); err != nil {
		return record, err
	}
	decoded, err := decodeEvaluationCapabilitySpecificReceipt(source)
	if err != nil {
		return record, fmt.Errorf("decode persisted evaluation capability-specific receipt: %w", err)
	}
	actual := decoded.EvaluationCapabilitySpecificReceiptRecord
	if actual.PlanDigest != partition.PlanDigest || actual.RepositoryCommit != partition.RepositoryCommit ||
		record.ReceiptID != actual.ReceiptID || record.ReceiptKind != actual.ReceiptKind ||
		record.AttemptID != actual.AttemptID || record.DescriptorDigest != actual.DescriptorDigest ||
		record.CaseID != actual.CaseID || record.MaterialDigest != actual.MaterialDigest ||
		record.CapabilityDescriptorDigest != actual.CapabilityDescriptorDigest || record.TurnIndex != actual.TurnIndex ||
		record.InvocationID != actual.InvocationID || record.RequestDigest != actual.RequestDigest ||
		record.ResultDigest != actual.ResultDigest || record.AuthorityKind != actual.AuthorityKind ||
		record.AuthorityFactDigest != actual.AuthorityFactDigest || !record.StartedAt.Equal(actual.StartedAt) ||
		!record.CompletedAt.Equal(actual.CompletedAt) || record.ReceiptDigest != actual.ReceiptDigest ||
		!bytes.Equal(source, actual.ReceiptBytes) {
		return record, ErrConflict
	}
	actual.NamespaceID = namespaceID
	return actual, nil
}

func queryEvaluationCapabilitySpecificReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationCapabilitySpecificReceiptRecord, error) {
	query := `SELECT receipt_id, receipt_kind, attempt_id, descriptor_digest, case_id, material_digest,
		capability_descriptor_digest, turn_index, invocation_id, request_digest, result_digest,
		authority_kind, authority_fact_digest, started_at, completed_at, receipt_digest, receipt_bytes
	FROM agent_evaluation_capability_specific_receipts
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`
	args := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	if attemptID != "" {
		query += ` AND attempt_id=$4`
		args = append(args, attemptID)
	}
	query += ` ORDER BY attempt_id COLLATE "C", turn_index, receipt_kind COLLATE "C", receipt_id COLLATE "C"`
	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationCapabilitySpecificReceiptRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationCapabilitySpecificReceipt(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func evaluationCapabilitySpecificReceiptSetDigest(records []EvaluationCapabilitySpecificReceiptRecord) (string, error) {
	ordered := append([]EvaluationCapabilitySpecificReceiptRecord(nil), records...)
	sort.Slice(ordered, func(left, right int) bool {
		if ordered[left].AttemptID != ordered[right].AttemptID {
			return ordered[left].AttemptID < ordered[right].AttemptID
		}
		if ordered[left].TurnIndex != ordered[right].TurnIndex {
			return ordered[left].TurnIndex < ordered[right].TurnIndex
		}
		if ordered[left].ReceiptKind != ordered[right].ReceiptKind {
			return ordered[left].ReceiptKind < ordered[right].ReceiptKind
		}
		return ordered[left].ReceiptID < ordered[right].ReceiptID
	})
	digests := make([]string, len(ordered))
	for index := range ordered {
		digests[index] = ordered[index].ReceiptDigest
	}
	return canonicaljson.Digest(map[string]any{"receiptDigests": digests})
}

func (repository *Repository) ListEvaluationCapabilitySpecificReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCapabilitySpecificReceiptRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationCapabilitySpecificReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}
