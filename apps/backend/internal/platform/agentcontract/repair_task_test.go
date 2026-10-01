package agentcontract

import (
	"encoding/json"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"os"
	"testing"
)

func TestRepairTaskPublicCanonicalVectorAndCounterexamples(t *testing.T) {
	source, err := os.ReadFile("testdata/agent-repair-task-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector struct {
		Request         json.RawMessage `json:"request"`
		Plan            map[string]any  `json:"plan"`
		Closure         map[string]any  `json:"closure"`
		Counterexamples map[string]any  `json:"counterexamples"`
	}
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	value, canonical, err := DecodeRepairTaskRequest(vector.Request)
	if err != nil || value == nil {
		t.Fatalf("TypeScript public request: %v", err)
	}
	expected, _ := canonicaljson.Bytes(vector.Request)
	if string(canonical) != string(expected) {
		t.Fatal("Go canonical request differs from TypeScript wire")
	}
	counterexamples, err := DeriveRepairCounterexamples(vector.Plan, vector.Closure, []map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	actual, _ := canonicaljson.Bytes(counterexamples)
	wanted, _ := canonicaljson.Bytes(vector.Counterexamples)
	if string(actual) != string(wanted) {
		t.Fatalf("Go stable-cell/regression owner differs from public WorkspaceSync counterexamples")
	}
	for _, test := range []struct {
		name   string
		change func(map[string]any)
	}{
		{"future wire", func(w map[string]any) { w["wireVersion"] = 2 }},
		{"request digest", func(w map[string]any) {
			w["value"].(map[string]any)["requestDigest"] = "sha256-0000000000000000000000000000000000000000000000000000000000000000"
		}},
		{"child lineage", func(w map[string]any) {
			w["value"].(map[string]any)["requestedTask"].(map[string]any)["value"].(map[string]any)["lineage"].(map[string]any)["parentTaskId"] = "task.foreign"
		}},
		{"regression digest", func(w map[string]any) {
			w["value"].(map[string]any)["counterexamples"].(map[string]any)["regressionRequirementSetDigest"] = "sha256-0000000000000000000000000000000000000000000000000000000000000000"
		}},
		{"counterexample order", func(w map[string]any) {
			r := w["value"].(map[string]any)["counterexamples"].(map[string]any)["requirements"].([]any)
			r[0], r[len(r)-1] = r[len(r)-1], r[0]
		}},
		{"unknown authority", func(w map[string]any) { w["value"].(map[string]any)["approve"] = true }},
	} {
		t.Run(test.name, func(t *testing.T) {
			var wire map[string]any
			_ = json.Unmarshal(vector.Request, &wire)
			test.change(wire)
			changed, _ := json.Marshal(wire)
			if _, _, err := DecodeRepairTaskRequest(changed); err == nil {
				t.Fatal("invalid public repair request admitted")
			}
		})
	}
}
