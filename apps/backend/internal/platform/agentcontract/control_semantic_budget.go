package agentcontract

import (
	"bytes"
	"errors"
	"fmt"
	"math"
	"math/big"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

var agentUsageUnits = map[string]struct{}{
	"text-token-input": {}, "text-token-output": {}, "reasoning-token": {},
	"cache-read-token": {}, "cache-write-token": {}, "image": {}, "image-pixel": {},
	"media-source-byte": {}, "media-processed-byte": {}, "document-page": {},
	"document-rendered-pixel": {}, "ocr-character": {}, "audio-second": {}, "audio-sample": {},
	"video-second": {}, "video-input-frame": {}, "video-frame": {},
	"transform-compute-millisecond": {}, "transform-memory-byte-second": {},
	"provider-upload-byte": {}, "hosted-search-query": {}, "hosted-tool-call": {},
	"sandbox-compute-second": {}, "provider-storage-byte-second": {},
	"generated-artifact": {}, "generated-artifact-byte": {},
}

type agentBudgetDemandView struct {
	usage            map[string]*big.Rat
	cost             map[string]*big.Rat
	modelInvocations int64
	toolCalls        int64
	repairRounds     int64
	transactions     int64
	artifactBytes    int64
	elapsedMs        int64
	unknown          bool
}

func validAgentUsageUnit(value string) bool {
	_, ok := agentUsageUnits[value]
	return ok
}

func validateAgentBudgetDemand(value map[string]any, path string) (agentBudgetDemandView, error) {
	view := agentBudgetDemandView{usage: make(map[string]*big.Rat), cost: make(map[string]*big.Rat)}
	if err := requireExactObjectKeys(value, []string{
		"usage", "cost", "modelInvocations", "toolCalls", "repairRounds",
		"transactions", "artifactBytes", "elapsedMs",
	}, nil); err != nil {
		return view, fmt.Errorf("%s: %w", path, err)
	}
	for _, member := range []struct {
		name   string
		target *int64
	}{
		{"modelInvocations", &view.modelInvocations},
		{"toolCalls", &view.toolCalls},
		{"repairRounds", &view.repairRounds},
		{"transactions", &view.transactions},
		{"artifactBytes", &view.artifactBytes},
		{"elapsedMs", &view.elapsedMs},
	} {
		parsed, ok := safeInteger(value[member.name])
		if !ok {
			return view, fmt.Errorf("%s/%s is invalid", path, member.name)
		}
		*member.target = parsed
	}

	usage, ok := value["usage"].(map[string]any)
	if !ok || requireExactObjectKeys(usage, []string{"amounts", "vectorDigest"}, nil) != nil {
		return view, fmt.Errorf("%s/usage is invalid", path)
	}
	amounts, ok := usage["amounts"].([]any)
	if !ok || len(amounts) > 512 {
		return view, fmt.Errorf("%s/usage/amounts is invalid", path)
	}
	previousUnit := ""
	for index, raw := range amounts {
		amount, ok := raw.(map[string]any)
		if !ok || requireExactObjectKeys(amount, []string{"unit", "confidence"}, []string{
			"logicalAmount", "billableAmount", "cachedAmount", "sourceDigest",
		}) != nil {
			return view, fmt.Errorf("%s/usage/amounts/%d is invalid", path, index)
		}
		unit := stringValue(amount["unit"])
		if !validAgentUsageUnit(unit) || (index > 0 && unit <= previousUnit) {
			return view, fmt.Errorf("%s/usage/amounts must be canonical and unique", path)
		}
		previousUnit = unit
		confidence := stringValue(amount["confidence"])
		if !oneOf(confidence, "reported", "measured", "estimated", "unknown") {
			return view, fmt.Errorf("%s/usage/amounts/%d confidence is invalid", path, index)
		}
		var ceiling *big.Rat
		for _, field := range []string{"logicalAmount", "billableAmount", "cachedAmount"} {
			if rawDecimal, exists := amount[field]; exists {
				decimal, err := parseAgentDecimal(rawDecimal, fmt.Sprintf("%s/usage/amounts/%d/%s", path, index, field))
				if err != nil {
					return view, err
				}
				if ceiling == nil || decimal.Cmp(ceiling) > 0 {
					ceiling = decimal
				}
			}
		}
		if confidence != "unknown" && ceiling == nil {
			return view, fmt.Errorf("%s/usage/amounts/%d known usage has no amount", path, index)
		}
		if source, exists := amount["sourceDigest"]; exists {
			if err := requireDigest(source, fmt.Sprintf("%s/usage/amounts/%d/sourceDigest", path, index)); err != nil {
				return view, err
			}
		}
		if confidence == "unknown" || ceiling == nil {
			view.unknown = true
		}
		if ceiling != nil {
			view.usage[unit] = ceiling
		}
	}
	expectedVectorDigest, err := canonicaljson.Digest(amounts)
	if err != nil || usage["vectorDigest"] != expectedVectorDigest {
		return view, fmt.Errorf("%s/usage/vectorDigest drifted", path)
	}

	costs, ok := value["cost"].([]any)
	if !ok || len(costs) > 512 {
		return view, fmt.Errorf("%s/cost is invalid", path)
	}
	previousCurrency := ""
	for index, raw := range costs {
		cost, ok := raw.(map[string]any)
		if !ok || requireExactObjectKeys(cost, []string{"currency", "confidence"}, []string{"amount", "sourceDigest"}) != nil {
			return view, fmt.Errorf("%s/cost/%d is invalid", path, index)
		}
		currency := stringValue(cost["currency"])
		if !agentControlCurrencyPattern.MatchString(currency) || (index > 0 && currency <= previousCurrency) {
			return view, fmt.Errorf("%s/cost must be canonical and unique", path)
		}
		previousCurrency = currency
		confidence := stringValue(cost["confidence"])
		if !oneOf(confidence, "reported", "measured", "estimated", "unknown") {
			return view, fmt.Errorf("%s/cost/%d confidence is invalid", path, index)
		}
		if source, exists := cost["sourceDigest"]; exists {
			if err := requireDigest(source, fmt.Sprintf("%s/cost/%d/sourceDigest", path, index)); err != nil {
				return view, err
			}
		}
		amount, hasAmount := cost["amount"]
		if !hasAmount {
			if confidence != "unknown" {
				return view, fmt.Errorf("%s/cost/%d known cost has no amount", path, index)
			}
			view.unknown = true
			continue
		}
		decimal, err := parseAgentDecimal(amount, fmt.Sprintf("%s/cost/%d/amount", path, index))
		if err != nil {
			return view, err
		}
		view.cost[currency] = decimal
		if confidence == "unknown" {
			view.unknown = true
		}
	}
	return view, nil
}

func validateAgentBudgetSettlement(
	value map[string]any,
	reservedDemand map[string]any,
	reservedView agentBudgetDemandView,
	reservedAt time.Time,
) (agentBudgetDemandView, error) {
	empty := agentBudgetDemandView{}
	if err := requireExactObjectKeys(value, []string{
		"actual", "charged", "requiresReconciliation", "settledAt", "settlementDigest",
	}, []string{"reconciliationReason"}); err != nil {
		return empty, fmt.Errorf("budget settlement is invalid: %w", err)
	}
	actual, actualOK := value["actual"].(map[string]any)
	charged, chargedOK := value["charged"].(map[string]any)
	if !actualOK || !chargedOK {
		return empty, errors.New("budget settlement usage is invalid")
	}
	actualView, err := validateAgentBudgetDemand(actual, "/settlement/actual")
	if err != nil {
		return empty, err
	}
	chargedView, err := validateAgentBudgetDemand(charged, "/settlement/charged")
	if err != nil {
		return empty, err
	}
	requiresReconciliation, ok := value["requiresReconciliation"].(bool)
	if !ok {
		return empty, errors.New("budget settlement reconciliation flag is invalid")
	}
	reasonRaw, hasReason := value["reconciliationReason"]
	if hasReason {
		reason, ok := reasonRaw.(string)
		if !ok || !oneOf(reason, "usage-unknown", "worker-loss", "timeout", "provider-disconnect", "ack-loss") {
			return empty, errors.New("budget settlement reconciliation reason is invalid")
		}
	}
	if requiresReconciliation != (actualView.unknown || hasReason) || (requiresReconciliation != hasReason) {
		return empty, errors.New("budget settlement reconciliation lifecycle is invalid")
	}
	settledAt, err := parseInstant(value["settledAt"])
	if err != nil || settledAt.Before(reservedAt) {
		return empty, errors.New("budget settlement instant is invalid")
	}
	if requiresReconciliation {
		if !sameAgentCanonicalValue(charged, reservedDemand) {
			return empty, errors.New("reconciled budget settlement must conservatively charge the reservation")
		}
	} else if !sameAgentCanonicalValue(charged, actual) || !actualView.fitsWithin(reservedView) {
		return empty, errors.New("budget settlement exceeds or differs from its reservation")
	}
	if err := requireDigestMatch(value, "settlementDigest", "/settlement/settlementDigest"); err != nil {
		return empty, err
	}
	return chargedView, nil
}

func parseAgentDecimal(value any, path string) (*big.Rat, error) {
	text, ok := value.(string)
	if !ok || !agentControlDecimalPattern.MatchString(text) {
		return nil, fmt.Errorf("%s is not a canonical non-negative decimal", path)
	}
	parsed, ok := new(big.Rat).SetString(text)
	if !ok {
		return nil, fmt.Errorf("%s is not a decimal", path)
	}
	return parsed, nil
}

func (candidate agentBudgetDemandView) fitsWithin(ceiling agentBudgetDemandView) bool {
	if candidate.unknown {
		return false
	}
	for unit, amount := range candidate.usage {
		maximum := ceiling.usage[unit]
		if maximum == nil {
			maximum = new(big.Rat)
		}
		if amount.Cmp(maximum) > 0 {
			return false
		}
	}
	for currency, amount := range candidate.cost {
		maximum := ceiling.cost[currency]
		if maximum == nil || amount.Cmp(maximum) > 0 {
			return false
		}
	}
	return candidate.modelInvocations <= ceiling.modelInvocations &&
		candidate.toolCalls <= ceiling.toolCalls &&
		candidate.repairRounds <= ceiling.repairRounds &&
		candidate.transactions <= ceiling.transactions &&
		candidate.artifactBytes <= ceiling.artifactBytes &&
		candidate.elapsedMs <= ceiling.elapsedMs
}

type agentBudgetDemandAccumulator struct {
	agentBudgetDemandView
}

func newAgentBudgetDemandAccumulator() *agentBudgetDemandAccumulator {
	return &agentBudgetDemandAccumulator{agentBudgetDemandView: agentBudgetDemandView{
		usage: make(map[string]*big.Rat), cost: make(map[string]*big.Rat),
	}}
}

func (total *agentBudgetDemandAccumulator) add(value agentBudgetDemandView) error {
	for unit, amount := range value.usage {
		current := total.usage[unit]
		if current == nil {
			current = new(big.Rat)
		}
		total.usage[unit] = new(big.Rat).Add(current, amount)
	}
	for currency, amount := range value.cost {
		current := total.cost[currency]
		if current == nil {
			current = new(big.Rat)
		}
		total.cost[currency] = new(big.Rat).Add(current, amount)
	}
	for _, member := range []struct {
		target *int64
		value  int64
	}{
		{&total.modelInvocations, value.modelInvocations},
		{&total.toolCalls, value.toolCalls},
		{&total.repairRounds, value.repairRounds},
		{&total.transactions, value.transactions},
		{&total.artifactBytes, value.artifactBytes},
		{&total.elapsedMs, value.elapsedMs},
	} {
		if member.value > math.MaxInt64-*member.target {
			return errors.New("budget utilization overflowed")
		}
		*member.target += member.value
	}
	return nil
}

func (total *agentBudgetDemandAccumulator) requireWithin(budget map[string]any) error {
	usageLimits := make(map[string]*big.Rat)
	for _, raw := range budget["usageLimits"].([]any) {
		limit := raw.(map[string]any)
		maximum, _ := parseAgentDecimal(limit["maximum"], "/budget/usageLimits/maximum")
		usageLimits[stringValue(limit["unit"])] = maximum
	}
	for unit, amount := range total.usage {
		maximum := usageLimits[unit]
		if maximum == nil || amount.Cmp(maximum) > 0 {
			return fmt.Errorf("budget usage limit %q was exceeded", unit)
		}
	}
	costLimits := make(map[string]*big.Rat)
	for _, raw := range budget["costLimits"].([]any) {
		limit := raw.(map[string]any)
		maximum, _ := parseAgentDecimal(limit["maximum"], "/budget/costLimits/maximum")
		costLimits[stringValue(limit["currency"])] = maximum
	}
	for currency, amount := range total.cost {
		maximum := costLimits[currency]
		if maximum == nil || amount.Cmp(maximum) > 0 {
			return fmt.Errorf("budget cost limit %q was exceeded", currency)
		}
	}
	for _, member := range []struct {
		name  string
		value int64
	}{
		{"maxModelInvocations", total.modelInvocations},
		{"maxToolCalls", total.toolCalls},
		{"maxRepairRounds", total.repairRounds},
		{"maxTransactions", total.transactions},
		{"maxArtifactBytes", total.artifactBytes},
		{"maxElapsedMs", total.elapsedMs},
	} {
		maximum, _ := safeInteger(budget[member.name])
		if member.value > maximum {
			return fmt.Errorf("budget limit %q was exceeded", member.name)
		}
	}
	return nil
}

func sameAgentCanonicalValue(left, right any) bool {
	leftBytes, leftErr := canonicaljson.Bytes(left)
	rightBytes, rightErr := canonicaljson.Bytes(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}
