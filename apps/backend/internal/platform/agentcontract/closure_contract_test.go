package agentcontract

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type agentG4ClosureVector struct {
	Format         string          `json:"format"`
	Version        int             `json:"version"`
	Fact           json.RawMessage `json:"fact"`
	CanonicalJSON  string          `json:"canonicalJson"`
	ExpectedDigest string          `json:"expectedDigest"`
}

func readAgentG4ClosureVector(t *testing.T) agentG4ClosureVector {
	t.Helper()
	source, err := os.ReadFile("testdata/agent-g4-closure-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentG4ClosureVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-g4-closure-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent G4 Closure vector identity: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

func TestAgentG4ClosureVectorMatchesTypeScriptCanonicalFact(t *testing.T) {
	vector := readAgentG4ClosureVector(t)
	if err := ValidateG4ClosureManifest(vector.Fact); err != nil {
		t.Fatalf("validate G4 Closure manifest: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(vector.Fact, &decoded); err != nil {
		t.Fatal(err)
	}
	canonical, err := canonicaljson.Bytes(decoded)
	if err != nil {
		t.Fatal(err)
	}
	if string(canonical) != vector.CanonicalJSON {
		t.Fatal("G4 Closure canonical fact bytes drifted")
	}
	value := decoded["value"].(map[string]any)
	if value["manifestDigest"] != vector.ExpectedDigest {
		t.Fatal("G4 Closure manifest digest drifted")
	}
	if _, err := CanonicalG4ClosureManifestDigest(vector.Fact); err != nil {
		t.Fatalf("digest G4 Closure manifest: %v", err)
	}
}

func TestAgentG4ClosureAdmissionRejectsAmbiguityAndOversize(t *testing.T) {
	vector := readAgentG4ClosureVector(t)
	duplicate := append([]byte(`{"wireVersion":1,`), vector.Fact[1:]...)
	if err := ValidateG4ClosureManifest(duplicate); err == nil {
		t.Fatal("duplicate G4 Closure JSON members must fail closed")
	}
	if err := ValidateG4ClosureManifest(bytes.Repeat([]byte(" "), maximumAgentG4ClosureBytes+1)); err == nil {
		t.Fatal("oversized G4 Closure manifests must fail closed")
	}
}

func TestAgentG4ClosureAdmissionRejectsRecomputedAuthorityDrift(t *testing.T) {
	vector := readAgentG4ClosureVector(t)
	for name, mutate := range map[string]func(map[string]any){
		"remote-model-units": func(value map[string]any) {
			gates := value["deterministicGateEvidence"].([]any)
			gate := gates[0].(map[string]any)
			gate["remoteModelUnits"] = float64(1)
			recomputeDigest(t, gate, "refDigest")
		},
		"missing-negative": func(value map[string]any) {
			negatives := value["negativeVerdicts"].([]any)
			value["negativeVerdicts"] = negatives[1:]
		},
		"premature-passed": func(value map[string]any) {
			value["closureVerdict"] = "satisfied"
		},
	} {
		t.Run(name, func(t *testing.T) {
			var drifted map[string]any
			if err := json.Unmarshal(vector.Fact, &drifted); err != nil {
				t.Fatal(err)
			}
			value := drifted["value"].(map[string]any)
			mutate(value)
			recomputeDigest(t, value, "manifestDigest")
			encoded, _ := json.Marshal(drifted)
			if err := ValidateG4ClosureManifest(encoded); err == nil {
				t.Fatal("recomputed G4 Closure authority drift must fail Go admission")
			}
		})
	}
}
