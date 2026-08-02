package agentcontract

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type agentProductVector struct {
	Format          string                     `json:"format"`
	Version         int                        `json:"version"`
	Facts           map[string]json.RawMessage `json:"facts"`
	View            json.RawMessage            `json:"view"`
	CanonicalJSON   map[string]string          `json:"canonicalJson"`
	ExpectedDigests map[string]string          `json:"expectedDigests"`
}

func readAgentProductVector(t *testing.T) agentProductVector {
	t.Helper()
	source, err := os.ReadFile("testdata/agent-product-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentProductVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-product-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent product vector identity: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

func TestAgentProductVectorMatchesTypeScriptCanonicalFactsAndView(t *testing.T) {
	vector := readAgentProductVector(t)
	digestFields := map[string]string{"supplement": "supplementDigest", "command": "commandDigest"}
	for name, fact := range vector.Facts {
		if err := ValidateProductFact(fact); err != nil {
			t.Fatalf("validate %s product fact: %v", name, err)
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
			t.Fatalf("%s product fact bytes drifted", name)
		}
		value := decoded["value"].(map[string]any)
		if value[digestFields[name]] != vector.ExpectedDigests[name] {
			t.Fatalf("%s product digest drifted", name)
		}
		if _, err := CanonicalProductFactDigest(fact); err != nil {
			t.Fatalf("digest %s product fact: %v", name, err)
		}
	}
	if err := ValidateProductView(vector.View); err != nil {
		t.Fatalf("validate product view: %v", err)
	}
	var view map[string]any
	if err := json.Unmarshal(vector.View, &view); err != nil {
		t.Fatal(err)
	}
	canonical, err := canonicaljson.Bytes(view)
	if err != nil {
		t.Fatal(err)
	}
	if string(canonical) != vector.CanonicalJSON["view"] {
		t.Fatal("product view bytes drifted")
	}
}

func TestAgentProductAdmissionRejectsAmbiguityAndRecomputedAuthorityDrift(t *testing.T) {
	vector := readAgentProductVector(t)
	command := vector.Facts["command"]
	duplicate := append([]byte(`{"wireVersion":1,`), command[1:]...)
	if err := ValidateProductFact(duplicate); err == nil {
		t.Fatal("duplicate product JSON members must fail closed")
	}
	if err := ValidateProductFact(bytes.Repeat([]byte(" "), maximumAgentProductBytes+1)); err == nil {
		t.Fatal("oversized product facts must fail closed")
	}
	var drifted map[string]any
	if err := json.Unmarshal(command, &drifted); err != nil {
		t.Fatal(err)
	}
	value := drifted["value"].(map[string]any)
	value["actor"].(map[string]any)["kind"] = "service"
	recomputeDigest(t, value, "commandDigest")
	encoded, _ := json.Marshal(drifted)
	if err := ValidateProductFact(encoded); err == nil {
		t.Fatal("recomputed service-authored user command must fail closed")
	}

	var view map[string]any
	if err := json.Unmarshal(vector.View, &view); err != nil {
		t.Fatal(err)
	}
	viewValue := view["value"].(map[string]any)
	viewValue["identity"].(map[string]any)["runId"] = "run.foreign"
	recomputeDigest(t, viewValue, "viewDigest")
	encoded, _ = json.Marshal(view)
	if err := ValidateProductView(encoded); err == nil {
		t.Fatal("recomputed cross-Run product view must fail closed")
	}
}

func recomputeDigest(t *testing.T, value map[string]any, field string) {
	t.Helper()
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != field {
			base[key] = entry
		}
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	value[field] = digest
}
