package agentcontract

import (
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func validateAgentEvaluationAttemptDeep(value map[string]any) error {
	descriptor := value["descriptor"].(map[string]any)
	risk := stringValue(descriptor["riskClass"])
	if !oneOf(risk, "ordinary", "critical", "high-assurance") {
		return errors.New("/value/descriptor/riskClass is invalid")
	}
	if descriptor["contextTier"] != nil && !oneOf(stringValue(descriptor["contextTier"]), "small", "representative", "near-limit") {
		return errors.New("/value/descriptor/contextTier is invalid")
	}
	if descriptor["mediaRepresentationTier"] != nil && !oneOf(stringValue(descriptor["mediaRepresentationTier"]), "source-faithful", "representative-transform", "near-limit-transform") {
		return errors.New("/value/descriptor/mediaRepresentationTier is invalid")
	}
	repetition, ok := safeInteger(descriptor["repetitionIndex"])
	if !ok || repetition >= maximumAgentEvaluationScheduleEntries {
		return errors.New("/value/descriptor/repetitionIndex is invalid")
	}
	samplingBase := map[string]any{
		"planDigest": descriptor["planDigest"], "caseId": descriptor["caseId"],
		"targetId": descriptor["targetId"], "targetDigest": descriptor["targetDigest"],
		"riskClass": descriptor["riskClass"], "repetitionIndex": descriptor["repetitionIndex"],
	}
	for _, field := range []string{"contextTier", "mediaRepresentationTier"} {
		if descriptor[field] != nil {
			samplingBase[field] = descriptor[field]
		}
	}
	samplingDigest, err := canonicaljson.Digest(samplingBase)
	if err != nil || stringValue(descriptor["samplingIdentityDigest"]) != samplingDigest {
		return errors.New("/value/descriptor/samplingIdentityDigest drifted")
	}
	shardDigest, err := canonicaljson.Digest(map[string]any{"targetId": descriptor["targetId"]})
	if err != nil || stringValue(descriptor["shardId"]) != "evaluation-shard:"+strings.TrimPrefix(shardDigest, "sha256-") {
		return errors.New("/value/descriptor/shardId is not target-derived")
	}
	observations, ok := value["metricObservations"].([]any)
	if !ok || len(observations) > 10_000 {
		return errors.New("/value/metricObservations is invalid")
	}
	previous := ""
	for index, raw := range observations {
		observation, ok := raw.(map[string]any)
		if !ok || requireExactObjectKeys(observation, []string{"metricId", "graderId", "graderKind", "authority", "verdict", "observationDigest"}, nil) != nil {
			return fmt.Errorf("/value/metricObservations/%d is invalid", index)
		}
		for _, field := range []string{"metricId", "graderId"} {
			if err := requireIdentity(observation[field], fmt.Sprintf("/value/metricObservations/%d/%s", index, field)); err != nil {
				return err
			}
		}
		kind, authority := stringValue(observation["graderKind"]), stringValue(observation["authority"])
		if !oneOf(kind, "strict-decoder", "deterministic-rule", "domain-dry-run", "g3-closure", "perceptual-metric", "model-judge", "blind-human-rubric") ||
			!oneOf(authority, "deterministic", "auxiliary", "human") || !oneOf(stringValue(observation["verdict"]), "passed", "failed", "inconclusive") ||
			(kind == "model-judge") != (authority == "auxiliary") || (kind == "blind-human-rubric") != (authority == "human") {
			return fmt.Errorf("/value/metricObservations/%d classification is invalid", index)
		}
		identity := stringValue(observation["metricId"]) + "\x00" + stringValue(observation["graderId"])
		if index > 0 && identity <= previous {
			return errors.New("/value/metricObservations is non-canonical")
		}
		if err := requireDigestMatch(observation, "observationDigest", fmt.Sprintf("/value/metricObservations/%d/observationDigest", index)); err != nil {
			return err
		}
		previous = identity
	}
	if err := validateEvaluationUsageVector(value["usage"], "/value/usage"); err != nil {
		return err
	}
	if err := validateEvaluationCosts(value["cost"], "/value/cost"); err != nil {
		return err
	}
	started, err := parseInstant(value["startedAt"])
	if err != nil {
		return errors.New("/value/startedAt is invalid")
	}
	completed, err := parseInstant(value["completedAt"])
	if err != nil || completed.Before(started) {
		return errors.New("/value/completedAt predates the attempt start")
	}
	return nil
}

func validateEvaluationUsageVector(raw any, path string) error {
	vector, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(vector, []string{"amounts", "vectorDigest"}, nil) != nil {
		return fmt.Errorf("%s is invalid", path)
	}
	amounts, ok := vector["amounts"].([]any)
	if !ok || len(amounts) > 256 {
		return fmt.Errorf("%s/amounts is invalid", path)
	}
	previous := ""
	for index, rawAmount := range amounts {
		amount, ok := rawAmount.(map[string]any)
		if !ok || requireExactObjectKeys(amount, []string{"unit", "confidence"}, []string{"logicalAmount", "billableAmount", "cachedAmount", "sourceDigest"}) != nil {
			return fmt.Errorf("%s/amounts/%d is invalid", path, index)
		}
		unit, confidence := stringValue(amount["unit"]), stringValue(amount["confidence"])
		if !oneOf(unit,
			"text-token-input", "text-token-output", "reasoning-token", "cache-read-token", "cache-write-token",
			"image", "image-pixel", "media-source-byte", "media-processed-byte", "document-page", "document-rendered-pixel",
			"ocr-character", "audio-second", "audio-sample", "video-second", "video-input-frame", "video-frame",
			"transform-compute-millisecond", "transform-memory-byte-second", "provider-upload-byte", "hosted-search-query",
			"hosted-tool-call", "sandbox-compute-second", "provider-storage-byte-second", "generated-artifact", "generated-artifact-byte",
		) || !oneOf(confidence, "reported", "measured", "estimated", "unknown") || (index > 0 && unit <= previous) {
			return fmt.Errorf("%s/amounts is non-canonical", path)
		}
		knownAmounts := 0
		for _, field := range []string{"logicalAmount", "billableAmount", "cachedAmount"} {
			if amount[field] != nil {
				decimal, err := evaluationCanonicalDecimal(amount[field], fmt.Sprintf("%s/amounts/%d/%s", path, index, field))
				if err != nil || decimal.Sign() < 0 {
					return fmt.Errorf("%s/amounts/%d/%s is invalid", path, index, field)
				}
				knownAmounts++
			}
		}
		if confidence != "unknown" && knownAmounts == 0 {
			return fmt.Errorf("%s/amounts/%d requires a known amount", path, index)
		}
		if amount["sourceDigest"] != nil {
			if err := requireDigest(amount["sourceDigest"], fmt.Sprintf("%s/amounts/%d/sourceDigest", path, index)); err != nil {
				return err
			}
		}
		previous = unit
	}
	vectorDigest, err := canonicaljson.Digest(amounts)
	if err != nil || stringValue(vector["vectorDigest"]) != vectorDigest {
		return fmt.Errorf("%s/vectorDigest drifted", path)
	}
	return nil
}

func validateEvaluationCosts(raw any, path string) error {
	values, ok := raw.([]any)
	if !ok || len(values) > 256 {
		return fmt.Errorf("%s is invalid", path)
	}
	previous := ""
	for index, rawCost := range values {
		cost, ok := rawCost.(map[string]any)
		if !ok || requireExactObjectKeys(cost, []string{"currency", "confidence"}, []string{"amount", "sourceDigest"}) != nil {
			return fmt.Errorf("%s/%d is invalid", path, index)
		}
		currency, confidence := stringValue(cost["currency"]), stringValue(cost["confidence"])
		if !regexpCurrency(currency) || !oneOf(confidence, "reported", "measured", "estimated", "unknown") || (index > 0 && currency <= previous) {
			return fmt.Errorf("%s is non-canonical", path)
		}
		if cost["amount"] == nil {
			if confidence != "unknown" {
				return fmt.Errorf("%s/%d known cost requires an amount", path, index)
			}
		} else {
			amount, err := evaluationCanonicalDecimal(cost["amount"], fmt.Sprintf("%s/%d/amount", path, index))
			if err != nil || amount.Sign() < 0 {
				return fmt.Errorf("%s/%d/amount is invalid", path, index)
			}
		}
		if cost["sourceDigest"] != nil {
			if err := requireDigest(cost["sourceDigest"], fmt.Sprintf("%s/%d/sourceDigest", path, index)); err != nil {
				return err
			}
		}
		previous = currency
	}
	return nil
}

func validateAgentEvaluationCheckpointDeep(value map[string]any) error {
	_, revisionOK := safeInteger(value["revision"])
	generation, generationOK := safeInteger(value["leaseGeneration"])
	if !revisionOK || !generationOK || generation < 1 {
		return errors.New("evaluation checkpoint revision/generation is invalid")
	}
	completedIDs, err := validateEvaluationAttemptRefs(value["completedAttemptRefs"], "/value/completedAttemptRefs")
	if err != nil {
		return err
	}
	missingIDs, err := validateEvaluationMissingRefs(value["missingAttemptRefs"], "/value/missingAttemptRefs")
	if err != nil {
		return err
	}
	seen := make(map[string]struct{}, len(completedIDs))
	for _, id := range completedIDs {
		seen[id] = struct{}{}
	}
	for _, id := range missingIDs {
		if _, exists := seen[id]; exists {
			return errors.New("checkpoint completed and missing attempt references overlap")
		}
	}
	return validateEvaluationBudgetLedger(value["budgetLedger"], "/value/budgetLedger")
}

func validateEvaluationAttemptRefs(raw any, path string) ([]string, error) {
	values, ok := raw.([]any)
	if !ok || len(values) > maximumAgentEvaluationScheduleEntries {
		return nil, fmt.Errorf("%s is invalid", path)
	}
	ids := make([]string, len(values))
	previous := ""
	for index, rawRef := range values {
		ref, ok := rawRef.(map[string]any)
		if !ok || requireExactObjectKeys(ref, []string{"attemptId", "descriptorDigest", "attemptDigest"}, nil) != nil {
			return nil, fmt.Errorf("%s/%d is invalid", path, index)
		}
		id := stringValue(ref["attemptId"])
		if requireIdentity(id, fmt.Sprintf("%s/%d/attemptId", path, index)) != nil || (index > 0 && id <= previous) {
			return nil, fmt.Errorf("%s is non-canonical", path)
		}
		for _, field := range []string{"descriptorDigest", "attemptDigest"} {
			if err := requireDigest(ref[field], fmt.Sprintf("%s/%d/%s", path, index, field)); err != nil {
				return nil, err
			}
		}
		ids[index], previous = id, id
	}
	return ids, nil
}

func validateEvaluationMissingRefs(raw any, path string) ([]string, error) {
	values, ok := raw.([]any)
	if !ok || len(values) > maximumAgentEvaluationScheduleEntries {
		return nil, fmt.Errorf("%s is invalid", path)
	}
	ids := make([]string, len(values))
	previous := ""
	for index, rawRef := range values {
		ref, ok := rawRef.(map[string]any)
		if !ok || requireExactObjectKeys(ref, []string{"attemptId", "descriptorDigest", "reason"}, nil) != nil {
			return nil, fmt.Errorf("%s/%d is invalid", path, index)
		}
		id := stringValue(ref["attemptId"])
		if requireIdentity(id, fmt.Sprintf("%s/%d/attemptId", path, index)) != nil || requireDigest(ref["descriptorDigest"], fmt.Sprintf("%s/%d/descriptorDigest", path, index)) != nil ||
			!oneOf(stringValue(ref["reason"]), "missing", "provider-error", "timed-out", "rate-limited", "schema-failed", "blocked", "cancelled", "infrastructure-error") || (index > 0 && id <= previous) {
			return nil, fmt.Errorf("%s/%d value is invalid", path, index)
		}
		ids[index], previous = id, id
	}
	return ids, nil
}

func validateEvaluationBudgetLedger(raw any, path string) error {
	ledger, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(ledger, []string{"budget", "revision", "reservations", "ledgerDigest"}, nil) != nil {
		return fmt.Errorf("%s is invalid", path)
	}
	if _, ok := safeInteger(ledger["revision"]); !ok {
		return fmt.Errorf("%s/revision is invalid", path)
	}
	if err := validateEvaluationHardBudget(ledger["budget"], path+"/budget"); err != nil {
		return err
	}
	reservations, ok := ledger["reservations"].([]any)
	if !ok || len(reservations) > 100_000 {
		return fmt.Errorf("%s/reservations is invalid", path)
	}
	previous := ""
	for index, rawReservation := range reservations {
		reservation, ok := rawReservation.(map[string]any)
		if !ok || requireExactObjectKeys(reservation, []string{"reservationId", "demand", "demandDigest", "reservedAt", "status"}, []string{"settlement"}) != nil {
			return fmt.Errorf("%s/reservations/%d is invalid", path, index)
		}
		id, status := stringValue(reservation["reservationId"]), stringValue(reservation["status"])
		if requireIdentity(id, fmt.Sprintf("%s/reservations/%d/reservationId", path, index)) != nil || !oneOf(status, "reserved", "settled") || (index > 0 && id <= previous) {
			return fmt.Errorf("%s/reservations is non-canonical", path)
		}
		if err := validateEvaluationBudgetDemand(reservation["demand"], fmt.Sprintf("%s/reservations/%d/demand", path, index)); err != nil {
			return err
		}
		demandDigest, err := canonicaljson.Digest(reservation["demand"])
		if err != nil || stringValue(reservation["demandDigest"]) != demandDigest || requireInstant(reservation["reservedAt"], fmt.Sprintf("%s/reservations/%d/reservedAt", path, index)) != nil {
			return fmt.Errorf("%s/reservations/%d demand identity is invalid", path, index)
		}
		if (status == "settled") != (reservation["settlement"] != nil) {
			return fmt.Errorf("%s/reservations/%d settlement state is invalid", path, index)
		}
		if settlement, exists := reservation["settlement"].(map[string]any); exists {
			if err := validateEvaluationBudgetSettlement(settlement, fmt.Sprintf("%s/reservations/%d/settlement", path, index)); err != nil {
				return err
			}
		} else if reservation["settlement"] != nil {
			return fmt.Errorf("%s/reservations/%d/settlement is invalid", path, index)
		}
		previous = id
	}
	return requireDigestMatch(ledger, "ledgerDigest", path+"/ledgerDigest")
}

func validateEvaluationHardBudget(raw any, path string) error {
	budget, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(budget, []string{"usageLimits", "costLimits", "maxModelInvocations", "maxToolCalls", "maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs"}, nil) != nil {
		return fmt.Errorf("%s is invalid", path)
	}
	for _, field := range []string{"maxModelInvocations", "maxToolCalls", "maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs"} {
		if _, ok := safeInteger(budget[field]); !ok {
			return fmt.Errorf("%s/%s is invalid", path, field)
		}
	}
	for _, definition := range []struct{ field, identity string }{{"usageLimits", "unit"}, {"costLimits", "currency"}} {
		limits, ok := budget[definition.field].([]any)
		if !ok {
			return fmt.Errorf("%s/%s is invalid", path, definition.field)
		}
		previous := ""
		for index, rawLimit := range limits {
			limit, ok := rawLimit.(map[string]any)
			if !ok || requireExactObjectKeys(limit, []string{definition.identity, "maximum"}, nil) != nil {
				return fmt.Errorf("%s/%s/%d is invalid", path, definition.field, index)
			}
			identity := stringValue(limit[definition.identity])
			if identity == "" || (definition.identity == "currency" && !regexpCurrency(identity)) || (index > 0 && identity <= previous) {
				return fmt.Errorf("%s/%s is non-canonical", path, definition.field)
			}
			amount, err := evaluationCanonicalDecimal(limit["maximum"], fmt.Sprintf("%s/%s/%d/maximum", path, definition.field, index))
			if err != nil || amount.Sign() < 0 {
				return fmt.Errorf("%s/%s/%d/maximum is invalid", path, definition.field, index)
			}
			previous = identity
		}
	}
	return nil
}

func validateEvaluationBudgetDemand(raw any, path string) error {
	demand, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(demand, []string{"usage", "cost", "modelInvocations", "toolCalls", "repairRounds", "transactions", "artifactBytes", "elapsedMs"}, nil) != nil {
		return fmt.Errorf("%s is invalid", path)
	}
	if err := validateEvaluationUsageVector(demand["usage"], path+"/usage"); err != nil {
		return err
	}
	if err := validateEvaluationCosts(demand["cost"], path+"/cost"); err != nil {
		return err
	}
	for _, field := range []string{"modelInvocations", "toolCalls", "repairRounds", "transactions", "artifactBytes", "elapsedMs"} {
		if _, ok := safeInteger(demand[field]); !ok {
			return fmt.Errorf("%s/%s is invalid", path, field)
		}
	}
	return nil
}

func validateEvaluationBudgetSettlement(settlement map[string]any, path string) error {
	if requireExactObjectKeys(settlement, []string{"actual", "charged", "requiresReconciliation", "settledAt", "settlementDigest"}, []string{"reconciliationReason"}) != nil {
		return fmt.Errorf("%s is invalid", path)
	}
	if err := validateEvaluationBudgetDemand(settlement["actual"], path+"/actual"); err != nil {
		return err
	}
	if err := validateEvaluationBudgetDemand(settlement["charged"], path+"/charged"); err != nil {
		return err
	}
	requires, ok := settlement["requiresReconciliation"].(bool)
	reason := stringValue(settlement["reconciliationReason"])
	if !ok || requires != (reason != "") || (reason != "" && !oneOf(reason, "usage-unknown", "worker-loss", "timeout", "provider-disconnect", "ack-loss")) || requireInstant(settlement["settledAt"], path+"/settledAt") != nil {
		return fmt.Errorf("%s reconciliation state is invalid", path)
	}
	return requireDigestMatch(settlement, "settlementDigest", path+"/settlementDigest")
}

func validateAgentEvaluationMetricReportDeep(value map[string]any) error {
	slices := value["slices"].([]any)
	previous := ""
	for index, raw := range slices {
		slice := raw.(map[string]any)
		if requireExactObjectKeys(slice, []string{
			"sliceId", "metricId", "protocolFamily", "providerConfigurationId", "modelFamilyOwnerId", "capabilityProfileId",
			"primaryBucket", "familyId", "riskClass", "graderKind", "passed", "failed", "inconclusive", "denominator",
			"observedFailureRate", "upperConfidenceBound", "thresholdSatisfied", "sliceDigest",
		}, []string{"contextTier", "mediaRepresentationTier"}) != nil {
			return fmt.Errorf("/value/slices/%d shape is invalid", index)
		}
		for _, field := range []string{"sliceId", "metricId", "providerConfigurationId", "modelFamilyOwnerId", "capabilityProfileId", "familyId"} {
			if err := requireIdentity(slice[field], fmt.Sprintf("/value/slices/%d/%s", index, field)); err != nil {
				return err
			}
		}
		if !oneOf(stringValue(slice["protocolFamily"]), "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
			!oneOf(stringValue(slice["primaryBucket"]), "positive-cross-domain", "adversarial-security", "recovery-repair-reconciliation", "capability-differential") ||
			!oneOf(stringValue(slice["riskClass"]), "ordinary", "critical", "high-assurance") ||
			!oneOf(stringValue(slice["graderKind"]), "strict-decoder", "deterministic-rule", "domain-dry-run", "g3-closure", "perceptual-metric", "model-judge", "blind-human-rubric") {
			return fmt.Errorf("/value/slices/%d classification is invalid", index)
		}
		if slice["contextTier"] != nil && !oneOf(stringValue(slice["contextTier"]), "small", "representative", "near-limit") {
			return fmt.Errorf("/value/slices/%d/contextTier is invalid", index)
		}
		if slice["mediaRepresentationTier"] != nil && !oneOf(stringValue(slice["mediaRepresentationTier"]), "source-faithful", "representative-transform", "near-limit-transform") {
			return fmt.Errorf("/value/slices/%d/mediaRepresentationTier is invalid", index)
		}
		counts := make([]int64, 4)
		for countIndex, field := range []string{"passed", "failed", "inconclusive", "denominator"} {
			count, ok := safeInteger(slice[field])
			if !ok {
				return fmt.Errorf("/value/slices/%d/%s is invalid", index, field)
			}
			counts[countIndex] = count
		}
		if counts[0]+counts[1]+counts[2] != counts[3] || counts[3] == 0 {
			return fmt.Errorf("/value/slices/%d denominator drifted", index)
		}
		for _, field := range []string{"observedFailureRate", "upperConfidenceBound"} {
			rate, err := evaluationCanonicalDecimal(slice[field], fmt.Sprintf("/value/slices/%d/%s", index, field))
			if err != nil || rate.Sign() < 0 || rate.Cmp(big.NewRat(1, 1)) > 0 {
				return fmt.Errorf("/value/slices/%d/%s is invalid", index, field)
			}
		}
		if _, ok := slice["thresholdSatisfied"].(bool); !ok {
			return fmt.Errorf("/value/slices/%d/thresholdSatisfied is invalid", index)
		}
		id := stringValue(slice["sliceId"])
		if index > 0 && id <= previous {
			return errors.New("/value/slices is non-canonical")
		}
		previous = id
	}
	return nil
}

func validateAgentEvaluationGraderReportDeep(value map[string]any) error {
	for _, field := range []string{"reportId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"planDigest", "graderPlanDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	return requireInstant(value["generatedAt"], "/value/generatedAt")
}

func validateAgentEvaluationHumanReportDeep(value map[string]any) error {
	if requireIdentity(value["reportId"], "/value/reportId") != nil || requireDigest(value["planDigest"], "/value/planDigest") != nil ||
		requireDigest(value["blindedArtifactSetDigest"], "/value/blindedArtifactSetDigest") != nil || requireDigest(value["adjudicationDigest"], "/value/adjudicationDigest") != nil ||
		requireInstant(value["generatedAt"], "/value/generatedAt") != nil {
		return errors.New("human review report identity is invalid")
	}
	ratings := value["ratings"].([]any)
	previous := ""
	for index, raw := range ratings {
		rating := raw.(map[string]any)
		if requireExactObjectKeys(rating, []string{"ratingId", "attemptId", "reviewerPseudonym", "randomizedPresentationId", "rubricDigest", "verdict", "ratingDigest"}, nil) != nil {
			return fmt.Errorf("/value/ratings/%d shape is invalid", index)
		}
		for _, field := range []string{"ratingId", "attemptId", "reviewerPseudonym", "randomizedPresentationId"} {
			if err := requireIdentity(rating[field], fmt.Sprintf("/value/ratings/%d/%s", index, field)); err != nil {
				return err
			}
		}
		if requireDigest(rating["rubricDigest"], fmt.Sprintf("/value/ratings/%d/rubricDigest", index)) != nil || !oneOf(stringValue(rating["verdict"]), "passed", "failed") {
			return fmt.Errorf("/value/ratings/%d value is invalid", index)
		}
		id := stringValue(rating["ratingId"])
		if index > 0 && id <= previous {
			return errors.New("/value/ratings is non-canonical")
		}
		if err := requireDigestMatch(rating, "ratingDigest", fmt.Sprintf("/value/ratings/%d/ratingDigest", index)); err != nil {
			return err
		}
		previous = id
	}
	return nil
}

func validateAgentEvaluationHoldoutReceiptDeep(value map[string]any) error {
	for _, field := range []string{"planDigest", "protectedHoldoutManifestDigest", "accessPolicyDigest", "encryptedCorpusDigest", "publicArtifactScanDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	executed, _ := evaluationStringValues(value["executedCaseIds"], "/value/executedCaseIds")
	leaked, _ := evaluationStringValues(value["leakedCaseIds"], "/value/leakedCaseIds")
	executedSet := make(map[string]struct{}, len(executed))
	for _, id := range executed {
		if err := requireIdentity(id, "/value/executedCaseIds"); err != nil {
			return err
		}
		executedSet[id] = struct{}{}
	}
	for _, id := range leaked {
		if _, exists := executedSet[id]; !exists {
			return errors.New("/value/leakedCaseIds must be a subset of executedCaseIds")
		}
	}
	return nil
}

func validateAgentEvaluationManifestDeep(value map[string]any) error {
	for _, field := range []string{"manifestId", "metricReportRef", "graderReportRef", "holdoutExecutionReceiptRef"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"planDigest", "metricReportDigest", "graderReportDigest", "holdoutExecutionReceiptDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if value["humanReviewReportRef"] != nil {
		if requireIdentity(value["humanReviewReportRef"], "/value/humanReviewReportRef") != nil || requireDigest(value["humanReviewReportDigest"], "/value/humanReviewReportDigest") != nil {
			return errors.New("human review manifest reference is invalid")
		}
	}
	attemptIDs, err := validateEvaluationAttemptRefs(value["attemptRefs"], "/value/attemptRefs")
	if err != nil {
		return err
	}
	if _, err := validateEvaluationMissingRefs(value["missingOrInfrastructureAttemptRefs"], "/value/missingOrInfrastructureAttemptRefs"); err != nil {
		return err
	}
	counts, ok := value["attemptCountByRisk"].(map[string]any)
	if !ok || requireExactObjectKeys(counts, []string{"ordinary", "critical", "high-assurance"}, nil) != nil {
		return errors.New("/value/attemptCountByRisk is invalid")
	}
	total := int64(0)
	for _, field := range []string{"ordinary", "critical", "high-assurance"} {
		count, ok := safeInteger(counts[field])
		if !ok {
			return fmt.Errorf("/value/attemptCountByRisk/%s is invalid", field)
		}
		total += count
	}
	if total != int64(len(attemptIDs)) {
		return errors.New("/value/attemptCountByRisk does not match attemptRefs")
	}
	if err := validateEvaluationUsageVector(value["usage"], "/value/usage"); err != nil {
		return err
	}
	if err := validateEvaluationCosts(value["cost"], "/value/cost"); err != nil {
		return err
	}
	qualificationDigests, err := evaluationStringValues(value["qualificationTargetDigests"], "/value/qualificationTargetDigests")
	if err != nil || len(qualificationDigests) == 0 {
		return errors.New("/value/qualificationTargetDigests is invalid")
	}
	for _, digest := range qualificationDigests {
		if err := requireDigest(digest, "/value/qualificationTargetDigests"); err != nil {
			return err
		}
	}
	completed, err := parseInstant(value["completedAt"])
	if err != nil {
		return errors.New("/value/completedAt is invalid")
	}
	expires, err := parseInstant(value["expiresAt"])
	if err != nil || !expires.After(completed) {
		return errors.New("/value/expiresAt must follow completedAt")
	}
	return nil
}
