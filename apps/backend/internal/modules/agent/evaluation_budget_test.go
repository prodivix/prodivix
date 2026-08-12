package agent

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationPlanWithBudgetCeiling(t *testing.T, source []byte, unit string, amount any) []byte {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	plan := envelope["value"].(map[string]any)
	budgetAuthority := plan["budget"].(map[string]any)
	budget := budgetAuthority["budget"].(map[string]any)
	if unit == "maxToolCalls" {
		budget[unit] = amount
	} else {
		found := false
		for _, raw := range budget["usageLimits"].([]any) {
			limit := raw.(map[string]any)
			if limit["unit"] == unit {
				limit["maximum"] = amount
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("budget fixture has no %s limit", unit)
		}
	}
	budgetBase := cloneEvaluationObject(budgetAuthority)
	delete(budgetBase, "budgetDigest")
	budgetDigest, err := canonicaljson.Digest(budgetBase)
	if err != nil {
		t.Fatal(err)
	}
	budgetAuthority["budgetDigest"] = budgetDigest
	planBase := cloneEvaluationObject(plan)
	delete(planBase, "planDigest")
	planDigest, err := canonicaljson.Digest(planBase)
	if err != nil {
		t.Fatal(err)
	}
	plan["planDigest"] = planDigest
	encoded, err := canonicaljson.Bytes(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func evaluationBudgetDemandFixture(t *testing.T, vectorDigest string) []byte {
	t.Helper()
	value := map[string]any{
		"usage": map[string]any{
			"amounts": []any{map[string]any{
				"unit": "text-token-input", "logicalAmount": "1", "confidence": "estimated",
			}},
			"vectorDigest": vectorDigest,
		},
		"cost":             []any{map[string]any{"currency": "USD", "amount": "0.1", "confidence": "estimated"}},
		"modelInvocations": int64(1), "toolCalls": int64(0), "repairRounds": int64(0),
		"transactions": int64(0), "artifactBytes": int64(0), "elapsedMs": int64(1000),
	}
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestDecodeEvaluationBudgetDemandUsesAgentUsageVectorDigest(t *testing.T) {
	amounts := []any{map[string]any{
		"unit": "text-token-input", "logicalAmount": "1", "confidence": "estimated",
	}}
	vectorDigest, err := canonicaljson.Digest(amounts)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationBudgetDemand(evaluationBudgetDemandFixture(t, vectorDigest), true); err != nil {
		t.Fatalf("current AgentUsageVector digest must decode: %v", err)
	}
}

func TestDecodeEvaluationBudgetDemandRejectsLegacyWrapperDigest(t *testing.T) {
	amounts := []any{map[string]any{
		"unit": "text-token-input", "logicalAmount": "1", "confidence": "estimated",
	}}
	legacyDigest, err := canonicaljson.Digest(map[string]any{"amounts": amounts})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationBudgetDemand(evaluationBudgetDemandFixture(t, legacyDigest), true); err == nil {
		t.Fatal("legacy wrapper digest must fail closed")
	}
}

func TestDecodeEvaluationUsageRejectsUnknownUnitAndKnownAmountAbsence(t *testing.T) {
	tests := []struct {
		name   string
		amount map[string]any
	}{
		{
			name: "unknown unit",
			amount: map[string]any{
				"unit": "provider-made-up-unit", "logicalAmount": "1", "confidence": "reported",
			},
		},
		{
			name: "known confidence without amount",
			amount: map[string]any{
				"unit": "text-token-input", "confidence": "measured",
			},
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			amounts := []any{testCase.amount}
			vectorDigest, err := canonicaljson.Digest(amounts)
			if err != nil {
				t.Fatal(err)
			}
			if _, _, err := decodeEvaluationUsage(map[string]any{
				"amounts": amounts, "vectorDigest": vectorDigest,
			}, false); err == nil {
				t.Fatal("non-canonical AgentUsageVector was accepted")
			}
		})
	}
}

func TestDecodeEvaluationBudgetRequiresExactHostedRuntimeFloor(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	decodedPlan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	planBytes := decodedPlan.Canonical
	ceiling, err := decodeEvaluationBudget(planBytes)
	if err != nil {
		t.Fatalf("decode frozen plan budget: %v", err)
	}
	floor, err := resolveEvaluationHostedRuntimeBudgetFloor(decodedPlan.Value)
	if err != nil {
		t.Fatal(err)
	}
	if floor.HostedSearchQueries != 210 || floor.HostedAttemptToolCalls != 210 ||
		floor.HostedLifecycleToolCalls != 12 || floor.HostedToolCalls != 222 ||
		floor.ProviderUploadBytes != 310 || floor.ProviderStorageByteSecond != 214_272_000 {
		t.Fatalf("unexpected hosted runtime floor: %+v", floor)
	}
	if err := validateEvaluationHostedRuntimeBudgetFloor(decodedPlan.Value, ceiling); err != nil {
		t.Fatalf("exact hosted runtime floor must be admitted: %v", err)
	}

	tests := []struct {
		name   string
		unit   string
		amount any
	}{
		{"hosted query ceiling minus one", "hosted-search-query", "209"},
		{"hosted tool ceiling minus one", "hosted-tool-call", "221"},
		{"provider upload ceiling minus one", "provider-upload-byte", "309"},
		{"provider storage ceiling minus one", "provider-storage-byte-second", "214271999"},
		{"attempt tool count ceiling minus one", "maxToolCalls", int64(209)},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			candidate := evaluationPlanWithBudgetCeiling(t, planBytes, testCase.unit, testCase.amount)
			if _, err := decodeEvaluationBudget(candidate); err == nil {
				t.Fatal("hosted runtime budget below its exact material-derived floor was admitted")
			}
		})
	}
}
