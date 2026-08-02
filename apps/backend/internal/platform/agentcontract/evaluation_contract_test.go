package agentcontract

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type agentEvaluationVector struct {
	Format          string                     `json:"format"`
	Version         int                        `json:"version"`
	Facts           map[string]json.RawMessage `json:"facts"`
	CanonicalJSON   map[string]string          `json:"canonicalJson"`
	ExpectedDigests map[string]string          `json:"expectedDigests"`
}

func readAgentEvaluationVector(t *testing.T) agentEvaluationVector {
	t.Helper()
	source, err := os.ReadFile("testdata/agent-evaluation-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentEvaluationVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-evaluation-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent evaluation vector identity: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

func TestAgentEvaluationVectorMatchesTypeScriptCanonicalFacts(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	digestFields := map[string]string{
		"plan": "planDigest", "attempt": "attemptDigest", "checkpoint": "checkpointDigest", "holdout": "receiptDigest",
	}
	for name, fact := range vector.Facts {
		if err := ValidateEvaluationFact(fact); err != nil {
			t.Fatalf("validate %s evaluation fact: %v", name, err)
		}
		var decoded map[string]any
		if err := json.Unmarshal(fact, &decoded); err != nil {
			t.Fatal(err)
		}
		canonical, err := canonicaljson.Bytes(decoded)
		if err != nil {
			t.Fatal(err)
		}
		if string(canonical) != vector.CanonicalJSON[name] {
			t.Fatalf("%s evaluation fact bytes drifted", name)
		}
		value := decoded["value"].(map[string]any)
		if value[digestFields[name]] != vector.ExpectedDigests[name] {
			t.Fatalf("%s evaluation digest drifted", name)
		}
		if _, err := CanonicalEvaluationFactDigest(fact); err != nil {
			t.Fatalf("digest %s evaluation fact: %v", name, err)
		}
	}
}

func TestAgentEvaluationAdmissionRejectsAmbiguityAndRecomputedPlanDrift(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	plan := vector.Facts["plan"]
	duplicate := append([]byte(`{"wireVersion":1,`), plan[1:]...)
	if err := ValidateEvaluationFact(duplicate); err == nil {
		t.Fatal("duplicate evaluation JSON members must fail closed")
	}
	if err := ValidateEvaluationFact(bytes.Repeat([]byte(" "), maximumAgentEvaluationBytes+1)); err == nil {
		t.Fatal("oversized evaluation facts must fail closed")
	}
	var drifted map[string]any
	if err := json.Unmarshal(plan, &drifted); err != nil {
		t.Fatal(err)
	}
	value := drifted["value"].(map[string]any)
	value["plannedJourneyCount"] = float64(1)
	recomputeDigest(t, value, "planDigest")
	encoded, _ := json.Marshal(drifted)
	if err := ValidateEvaluationFact(encoded); err == nil {
		t.Fatal("recomputed plan below the frozen journey floor must fail closed")
	}
}

func TestAgentEvaluationAdmissionRebuildsNestedPlanSchedule(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	for name, mutate := range map[string]func(map[string]any){
		"repetition": func(value map[string]any) {
			policy := value["repetitionPolicy"].(map[string]any)
			rules := policy["rules"].([]any)
			rule := rules[0].(map[string]any)
			rule["minimumIndependentAttempts"] = rule["minimumIndependentAttempts"].(float64) + 1
		},
		"budget": func(value map[string]any) {
			evaluationBudget := value["budget"].(map[string]any)
			budget := evaluationBudget["budget"].(map[string]any)
			budget["maxModelInvocations"] = float64(1)
			recomputeDigest(t, evaluationBudget, "budgetDigest")
		},
	} {
		t.Run(name, func(t *testing.T) {
			var drifted map[string]any
			if err := json.Unmarshal(vector.Facts["plan"], &drifted); err != nil {
				t.Fatal(err)
			}
			value := drifted["value"].(map[string]any)
			mutate(value)
			recomputeDigest(t, value, "planDigest")
			encoded, _ := json.Marshal(drifted)
			if err := ValidateEvaluationFact(encoded); err == nil {
				t.Fatalf("recomputed %s drift must fail Go admission", name)
			}
		})
	}
}

func TestAgentEvaluationAdmissionRejectsRecomputedNestedResultDrift(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	for name, testCase := range map[string]struct {
		fact   string
		mutate func(*testing.T, map[string]any)
	}{
		"attempt-sampling-identity": {
			fact: "attempt",
			mutate: func(t *testing.T, value map[string]any) {
				descriptor := value["descriptor"].(map[string]any)
				forged, err := canonicaljson.Digest(map[string]any{"forged": true})
				if err != nil {
					t.Fatal(err)
				}
				descriptor["samplingIdentityDigest"] = forged
				descriptor["attemptId"] = "evaluation-attempt:" + strings.TrimPrefix(forged, "sha256-")
				recomputeDigest(t, descriptor, "descriptorDigest")
				recomputeDigest(t, value, "attemptDigest")
			},
		},
		"attempt-usage-unit": {
			fact: "attempt",
			mutate: func(t *testing.T, value map[string]any) {
				usage := value["usage"].(map[string]any)
				amounts := usage["amounts"].([]any)
				amounts[0].(map[string]any)["unit"] = "unregistered-provider-unit"
				recomputeDigest(t, usage, "vectorDigest")
				recomputeDigest(t, value, "attemptDigest")
			},
		},
		"checkpoint-negative-budget": {
			fact: "checkpoint",
			mutate: func(t *testing.T, value map[string]any) {
				ledger := value["budgetLedger"].(map[string]any)
				budget := ledger["budget"].(map[string]any)
				budget["maxModelInvocations"] = float64(-1)
				recomputeDigest(t, ledger, "ledgerDigest")
				recomputeDigest(t, value, "checkpointDigest")
			},
		},
		"holdout-leak-outside-executed-set": {
			fact: "holdout",
			mutate: func(t *testing.T, value map[string]any) {
				value["leakedCaseIds"] = []any{"g4-v8.not-executed.1"}
				recomputeDigest(t, value, "receiptDigest")
			},
		},
	} {
		t.Run(name, func(t *testing.T) {
			var drifted map[string]any
			if err := json.Unmarshal(vector.Facts[testCase.fact], &drifted); err != nil {
				t.Fatal(err)
			}
			value := drifted["value"].(map[string]any)
			testCase.mutate(t, value)
			encoded, _ := json.Marshal(drifted)
			if err := ValidateEvaluationFact(encoded); err == nil {
				t.Fatal("recomputed nested result drift must fail Go admission")
			}
		})
	}
}
