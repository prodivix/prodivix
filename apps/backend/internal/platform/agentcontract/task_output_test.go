package agentcontract

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestAgentTaskOutputPublicTypeScriptVectorAndBoundaries(t *testing.T) {
	source, err := os.ReadFile("testdata/agent-task-output-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	output, canonical, err := DecodeAgentTaskOutput(source)
	if err != nil || !strings.Contains(output.Text, "计数") {
		t.Fatalf("public TypeScript vector: %#v %v", output, err)
	}
	if _, again, err := DecodeAgentTaskOutput(canonical); err != nil || string(again) != string(canonical) {
		t.Fatalf("canonical replay: %v", err)
	}
	for _, scenario := range []string{"content-digest", "output-digest", "oversize", "blank", "credential", "unknown", "generation-zero"} {
		t.Run(scenario, func(t *testing.T) {
			var wire map[string]any
			if err := json.Unmarshal(source, &wire); err != nil {
				t.Fatal(err)
			}
			value := wire["value"].(map[string]any)
			switch scenario {
			case "content-digest":
				value["contentDigest"] = "sha256-" + strings.Repeat("0", 64)
			case "output-digest":
				value["outputDigest"] = "sha256-" + strings.Repeat("0", 64)
			case "oversize":
				value["text"] = strings.Repeat("😀", 32769)
			case "blank":
				value["text"] = " \n "
			case "credential":
				value["text"] = "Bearer testcredential1234"
			case "unknown":
				value["privateReasoning"] = "hidden"
			case "generation-zero":
				value["generation"] = 0
			}
			if scenario != "content-digest" && scenario != "output-digest" {
				value["contentDigest"], err = canonicaljson.Digest(value["text"])
				if err != nil {
					t.Fatal(err)
				}
				delete(value, "outputDigest")
				value["outputDigest"], err = canonicaljson.Digest(value)
				if err != nil {
					t.Fatal(err)
				}
			}
			raw, err := json.Marshal(wire)
			if err != nil {
				t.Fatal(err)
			}
			if _, _, err := DecodeAgentTaskOutput(raw); err == nil {
				t.Fatal("invalid user result accepted")
			}
		})
	}
	if _, _, err := DecodeAgentTaskOutput([]byte(`{"wireVersion":1,"factType":"task-output","value":{"text":"\ud800"}}`)); err == nil {
		t.Fatal("isolated surrogate accepted")
	}
}
