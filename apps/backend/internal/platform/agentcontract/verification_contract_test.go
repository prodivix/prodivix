package agentcontract

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type agentVerificationVector struct {
	Format          string                     `json:"format"`
	Version         int                        `json:"version"`
	Facts           map[string]json.RawMessage `json:"facts"`
	CanonicalJSON   map[string]string          `json:"canonicalJson"`
	ExpectedDigests map[string]string          `json:"expectedDigests"`
}

func readAgentVerificationVector(t *testing.T) agentVerificationVector {
	t.Helper()
	source, err := os.ReadFile("testdata/agent-verification-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentVerificationVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-verification-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent verification vector identity: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

func TestAgentVerificationVectorMatchesTypeScriptCanonicalFacts(t *testing.T) {
	vector := readAgentVerificationVector(t)
	digestFields := map[string]string{
		"binding": "bindingDigest", "closure": "receiptDigest", "satisfiedClosure": "receiptDigest", "repairStarted": "receiptDigest",
		"repairProposalBound": "receiptDigest", "repairBlocked": "receiptDigest",
	}
	for name, fact := range vector.Facts {
		if err := ValidateVerificationFact(fact); err != nil {
			t.Fatalf("validate %s verification fact: %v", name, err)
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
			t.Fatalf("%s verification fact bytes drifted", name)
		}
		value := decoded["value"].(map[string]any)
		if value[digestFields[name]] != vector.ExpectedDigests[name] {
			t.Fatalf("%s digest drifted", name)
		}
		if _, err := CanonicalVerificationFactDigest(fact); err != nil {
			t.Fatalf("digest %s verification fact: %v", name, err)
		}
	}
}

func TestAgentVerificationAdmissionRejectsAmbiguityDriftAndAuthority(t *testing.T) {
	vector := readAgentVerificationVector(t)
	binding := vector.Facts["binding"]
	duplicate := append([]byte(`{"wireVersion":1,`), binding[1:]...)
	if err := ValidateVerificationFact(duplicate); err == nil {
		t.Fatal("duplicate verification JSON members must fail closed")
	}
	if err := ValidateVerificationFact(bytes.Repeat([]byte(" "), maximumAgentVerificationBytes+1)); err == nil {
		t.Fatal("oversized verification facts must fail closed")
	}
	var drifted map[string]any
	if err := json.Unmarshal(binding, &drifted); err != nil {
		t.Fatal(err)
	}
	value := drifted["value"].(map[string]any)
	value["actualPlanDigest"] = vector.ExpectedDigests["closure"]
	encoded, _ := json.Marshal(drifted)
	if err := ValidateVerificationFact(encoded); err == nil {
		t.Fatal("binding digest drift must fail closed")
	}
	var closure map[string]any
	if err := json.Unmarshal(vector.Facts["closure"], &closure); err != nil {
		t.Fatal(err)
	}
	closureValue := closure["value"].(map[string]any)
	closureValue["producer"].(map[string]any)["kind"] = "user"
	encoded, _ = json.Marshal(closure)
	if err := ValidateVerificationFact(encoded); err == nil {
		t.Fatal("user-produced Closure receipts must fail closed")
	}
}
