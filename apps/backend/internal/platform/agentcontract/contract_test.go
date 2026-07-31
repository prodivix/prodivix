package agentcontract

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

type agentPolicyVector struct {
	DocumentID           string          `json:"documentId"`
	Current              json.RawMessage `json:"current"`
	Wire                 json.RawMessage `json:"wire"`
	LegacyWire           json.RawMessage `json:"legacyWire"`
	CanonicalCurrentJSON string          `json:"canonicalCurrentJson"`
	ExpectedDigest       string          `json:"expectedDigest"`
}

func readAgentPolicyVector(t *testing.T) agentPolicyVector {
	t.Helper()
	source, err := os.ReadFile("testdata/agent-policy-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentPolicyVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	return vector
}

func decodeAgentPolicyObject(t *testing.T, source json.RawMessage) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(source, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func encodeAgentPolicyObject(t *testing.T, value map[string]any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestAgentPolicyVectorMatchesTypeScriptDigest(t *testing.T) {
	vector := readAgentPolicyVector(t)
	if err := ValidateDocument(vector.DocumentID, vector.Wire); err != nil {
		t.Fatalf("validate canonical AgentPolicy: %v", err)
	}
	digest, err := CanonicalCurrentDigest(vector.DocumentID, vector.Wire)
	if err != nil {
		t.Fatal(err)
	}
	if digest != vector.ExpectedDigest {
		t.Fatalf("AgentPolicy digest = %s, want %s", digest, vector.ExpectedDigest)
	}
}

func TestAgentPolicyMigrationIsExplicitAndFailClosed(t *testing.T) {
	vector := readAgentPolicyVector(t)
	migrated, err := MigrateDocument(vector.DocumentID, vector.LegacyWire)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateDocument(vector.DocumentID, migrated); err != nil {
		t.Fatalf("validate migrated AgentPolicy: %v", err)
	}
	value := decodeAgentPolicyObject(t, migrated)
	if value["wireVersion"] != float64(1) {
		t.Fatalf("migrated wireVersion = %v", value["wireVersion"])
	}
	privacy := value["privacy"].(map[string]any)
	if privacy["maximumSensitivity"] != "public" ||
		privacy["providerTraining"] != "deny" ||
		privacy["providerTelemetry"] != "deny" ||
		privacy["rawArtifactCapture"] != "deny" ||
		len(privacy["allowedRegions"].([]any)) != 0 {
		t.Fatalf("legacy privacy migration widened authority: %#v", privacy)
	}

	future := decodeAgentPolicyObject(t, vector.Wire)
	future["wireVersion"] = float64(2)
	if _, err := MigrateDocument(vector.DocumentID, encodeAgentPolicyObject(t, future)); err == nil {
		t.Fatal("unknown AgentPolicy wire versions must fail closed")
	}
}

func TestAgentPolicyAdmissionRejectsAmbiguousAndNonCanonicalInput(t *testing.T) {
	vector := readAgentPolicyVector(t)
	duplicateMember := append([]byte(`{"wireVersion":1,`), vector.Wire[1:]...)
	if err := ValidateDocument(vector.DocumentID, duplicateMember); err == nil {
		t.Fatal("duplicate JSON members must fail closed")
	}
	unsafeMember := append([]byte(`{"__proto__":{},`), vector.Wire[1:]...)
	if err := ValidateDocument(vector.DocumentID, unsafeMember); err == nil {
		t.Fatal("unsafe JSON object keys must fail closed")
	}
	if err := ValidateDocument("agent.policy.other", vector.Wire); err == nil {
		t.Fatal("Workspace and AgentPolicy identities must match")
	}

	nonCanonical := decodeAgentPolicyObject(t, vector.Wire)
	contextRules := nonCanonical["contextRules"].(map[string]any)
	contextRules["allowedAuthorities"] = []any{"derived", "canonical"}
	if err := ValidateDocument(vector.DocumentID, encodeAgentPolicyObject(t, nonCanonical)); err == nil {
		t.Fatal("non-canonical set ordering must fail closed")
	}

	duplicateRule := decodeAgentPolicyObject(t, vector.Wire)
	providerID := duplicateRule["providerRules"].([]any)[0].(map[string]any)["id"]
	duplicateRule["modelRules"].([]any)[0].(map[string]any)["id"] = providerID
	if err := ValidateDocument(vector.DocumentID, encodeAgentPolicyObject(t, duplicateRule)); err == nil {
		t.Fatal("rule ids must be unique across AgentPolicy rule families")
	}

	oversized := bytes.Repeat([]byte(" "), maximumAgentPolicyBytes+1)
	if err := ValidateDocument(vector.DocumentID, oversized); err == nil {
		t.Fatal("oversized AgentPolicy input must fail closed")
	}
}
