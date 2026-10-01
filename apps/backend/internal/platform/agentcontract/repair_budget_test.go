package agentcontract

import (
	"encoding/json"
	"testing"
)

func TestRemainingRepairBudgetPreservesEveryChargedDimension(t *testing.T) {
	run := decodeAgentControlObject(t, readAgentControlVector(t).Facts["run"])["value"].(map[string]any)
	ledger := run["budgetLedger"].(map[string]any)
	ledger["budget"].(map[string]any)["maxTransactions"] = float64(3)
	refreshAgentControlDigest(t, ledger, "ledgerDigest")
	source, _ := json.Marshal(ledger)
	remaining, err := RemainingRepairBudget(source, RepairBudgetLowerBounds{Transactions: 1, ArtifactBytes: 128, ElapsedMS: 15000})
	if err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]int64{"maxTransactions": 2, "maxArtifactBytes": 1048576 - 128, "maxElapsedMs": 600000 - 15000, "maxModelInvocations": 7, "maxToolCalls": 8, "maxRepairRounds": 1} {
		if remaining[key] != want {
			t.Fatalf("%s=%v want%d", key, remaining[key], want)
		}
	}
	limits := remaining["usageLimits"].([]any)
	if limits[1].(map[string]any)["maximum"] != "18900" || limits[2].(map[string]any)["maximum"] != "3780" {
		t.Fatalf("charged usage reset=%#v", limits)
	}
	if remaining["costLimits"].([]any)[0].(map[string]any)["maximum"] != "25" {
		t.Fatal("cost limit lost")
	}
	for _, lower := range []RepairBudgetLowerBounds{{Transactions: 3}, {ArtifactBytes: 1048577}, {ElapsedMS: 600000}, {ElapsedMS: -1}} {
		if _, err := RemainingRepairBudget(source, lower); err == nil {
			t.Fatalf("exhausted repair accepted %#v", lower)
		}
	}
}

func TestRepairDecimalSubtractionIsExact(t *testing.T) {
	for _, test := range []struct{ maximum, used, want string }{{"0.30000000000000000001", "0.1", "0.20000000000000000001"}, {"2", "1.25", "0.75"}, {"0", "0", "0"}} {
		maximum, _ := parseAgentDecimal(test.maximum, "test")
		used, _ := parseAgentDecimal(test.used, "test")
		text, err := exactRepairDecimal(maximum.Sub(maximum, used))
		if err != nil || text != test.want {
			t.Fatalf("remaining=%s err=%v want%s", text, err, test.want)
		}
	}
}
