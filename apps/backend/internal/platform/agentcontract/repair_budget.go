package agentcontract

import (
	"encoding/json"
	"errors"
	"math/big"
	"strings"
)

// RepairBudgetLowerBounds are durable owner measurements which may cover
// effects absent from a model-only ledger. They replace lower ledger totals.
type RepairBudgetLowerBounds struct {
	Transactions       int64
	ArtifactBytes      int64
	ElapsedMS          int64
	OpenedRepairRounds int64
}

// RemainingRepairBudget uses the control owner's charged reservation semantics
// and deducts the next repair opener without mutating a terminal Run ledger.
func RemainingRepairBudget(source json.RawMessage, lower RepairBudgetLowerBounds) (map[string]any, error) {
	var ledger map[string]any
	if err := json.Unmarshal(source, &ledger); err != nil {
		return nil, err
	}
	if err := validateAgentBudgetLedger(ledger); err != nil {
		return nil, err
	}
	if lower.Transactions < 0 || lower.ArtifactBytes < 0 || lower.ElapsedMS < 0 || lower.OpenedRepairRounds < 0 {
		return nil, errors.New("negative repair utilization")
	}
	total := newAgentBudgetDemandAccumulator()
	for _, raw := range ledger["reservations"].([]any) {
		reservation := raw.(map[string]any)
		settlement, settled := reservation["settlement"].(map[string]any)
		if reservation["status"] != "settled" || !settled || settlement["requiresReconciliation"] != false {
			return nil, errors.New("repair parent budget requires reconciliation")
		}
		demand := reservation["demand"].(map[string]any)
		view, err := validateAgentBudgetDemand(demand, "/repair/reservation/demand")
		if err != nil {
			return nil, err
		}
		if reservation["status"] == "settled" {
			reservedAt, _ := parseInstant(reservation["reservedAt"])
			view, err = validateAgentBudgetSettlement(reservation["settlement"].(map[string]any), demand, view, reservedAt)
			if err != nil {
				return nil, err
			}
		}
		if err := total.add(view); err != nil {
			return nil, err
		}
	}
	if total.transactions < lower.Transactions {
		total.transactions = lower.Transactions
	}
	if total.artifactBytes < lower.ArtifactBytes {
		total.artifactBytes = lower.ArtifactBytes
	}
	if total.elapsedMs < lower.ElapsedMS {
		total.elapsedMs = lower.ElapsedMS
	}
	if total.repairRounds < lower.OpenedRepairRounds {
		total.repairRounds = lower.OpenedRepairRounds
	}
	budget := ledger["budget"].(map[string]any)
	if err := total.requireWithin(budget); err != nil {
		return nil, err
	}
	result := map[string]any{}
	for _, family := range []struct {
		field, identity string
		used            map[string]*big.Rat
	}{{"usageLimits", "unit", total.usage}, {"costLimits", "currency", total.cost}} {
		limits := []any{}
		for _, raw := range budget[family.field].([]any) {
			limit := raw.(map[string]any)
			identity := stringValue(limit[family.identity])
			maximum, _ := parseAgentDecimal(limit["maximum"], "/repair/maximum")
			used := family.used[identity]
			if used != nil {
				maximum.Sub(maximum, used)
			}
			decimal, err := exactRepairDecimal(maximum)
			if err != nil {
				return nil, err
			}
			limits = append(limits, map[string]any{family.identity: identity, "maximum": decimal})
		}
		result[family.field] = limits
	}
	for _, dimension := range []struct {
		name string
		used int64
	}{{"maxModelInvocations", total.modelInvocations}, {"maxToolCalls", total.toolCalls}, {"maxRepairRounds", total.repairRounds}, {"maxTransactions", total.transactions}, {"maxArtifactBytes", total.artifactBytes}, {"maxElapsedMs", total.elapsedMs}} {
		maximum, _ := safeInteger(budget[dimension.name])
		remaining := maximum - dimension.used
		if dimension.name == "maxRepairRounds" {
			if remaining < 1 {
				return nil, errors.New("repair round budget exhausted")
			}
			remaining--
		}
		if (dimension.name == "maxTransactions" || dimension.name == "maxElapsedMs" || dimension.name == "maxModelInvocations") && remaining < 1 {
			return nil, errors.New("repair budget exhausted")
		}
		result[dimension.name] = remaining
	}
	return result, validateAgentBudgetNormalized(result)
}

func validateAgentBudgetNormalized(value map[string]any) error {
	source, err := json.Marshal(value)
	if err != nil {
		return err
	}
	var current map[string]any
	if err := json.Unmarshal(source, &current); err != nil {
		return err
	}
	return validateAgentBudget(current, "/repair/remainingBudget")
}

func exactRepairDecimal(value *big.Rat) (string, error) {
	if value.Sign() < 0 {
		return "", errors.New("repair budget exceeded")
	}
	denominator := new(big.Int).Set(value.Denom())
	two, five := int64(0), int64(0)
	for _, prime := range []int64{2, 5} {
		count := int64(0)
		for denominator.Sign() > 0 {
			quotient, remainder := new(big.Int), new(big.Int)
			quotient.QuoRem(denominator, big.NewInt(prime), remainder)
			if remainder.Sign() != 0 {
				break
			}
			denominator = quotient
			count++
		}
		if prime == 2 {
			two = count
		} else {
			five = count
		}
	}
	if denominator.Cmp(big.NewInt(1)) != 0 {
		return "", errors.New("nonfinite repair budget decimal")
	}
	precision := two
	if five > precision {
		precision = five
	}
	text := value.FloatString(int(precision))
	if strings.Contains(text, ".") {
		text = strings.TrimRight(strings.TrimRight(text, "0"), ".")
	}
	return text, nil
}
