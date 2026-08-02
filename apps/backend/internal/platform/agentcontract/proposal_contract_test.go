package agentcontract

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type agentProposalVector struct {
	Format          string                     `json:"format"`
	Version         int                        `json:"version"`
	Facts           map[string]json.RawMessage `json:"facts"`
	CanonicalJSON   map[string]string          `json:"canonicalJson"`
	ExpectedDigests map[string]string          `json:"expectedDigests"`
}

func readAgentProposalVector(t *testing.T) agentProposalVector {
	t.Helper()
	source, err := os.ReadFile("testdata/agent-proposal-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentProposalVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-proposal-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent proposal vector identity: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

func decodeAgentProposalObject(t *testing.T, source json.RawMessage) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(source, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func encodeAgentProposalObject(t *testing.T, value map[string]any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestAgentProposalVectorMatchesTypeScriptCanonicalFacts(t *testing.T) {
	vector := readAgentProposalVector(t)
	digestFields := map[string]string{
		"proposal":             "proposalDigest",
		"planning":             "planningDigest",
		"preview":              "previewDigest",
		"commitStarted":        "receiptDigest",
		"commitAcknowledged":   "receiptDigest",
		"rollbackStarted":      "receiptDigest",
		"rollbackAcknowledged": "receiptDigest",
	}
	for _, name := range []string{
		"proposal", "planning", "preview", "approval",
		"commitStarted", "commitAcknowledged", "rollbackStarted", "rollbackAcknowledged",
	} {
		fact := vector.Facts[name]
		if err := ValidateProposalFact(fact); err != nil {
			t.Fatalf("validate %s proposal fact: %v", name, err)
		}
		decoded := decodeAgentProposalObject(t, fact)
		canonical, err := canonicaljson.Bytes(decoded)
		if err != nil {
			t.Fatalf("canonicalize %s proposal fact: %v", name, err)
		}
		if string(canonical) != vector.CanonicalJSON[name] {
			t.Fatalf("%s proposal fact bytes drifted from TypeScript canonical JSON", name)
		}
		value := decoded["value"].(map[string]any)
		if field := digestFields[name]; field != "" {
			if value[field] != vector.ExpectedDigests[name] {
				t.Fatalf("%s digest = %v, want %s", name, value[field], vector.ExpectedDigests[name])
			}
		} else {
			digest, err := canonicaljson.Digest(value)
			if err != nil {
				t.Fatal(err)
			}
			if digest != vector.ExpectedDigests[name] {
				t.Fatalf("%s canonical value digest = %s, want %s", name, digest, vector.ExpectedDigests[name])
			}
		}
		if _, err := CanonicalProposalFactDigest(fact); err != nil {
			t.Fatalf("digest %s proposal fact: %v", name, err)
		}
	}
}

func TestAgentProposalAdmissionRejectsAmbiguityUnknownAndOversizedFacts(t *testing.T) {
	vector := readAgentProposalVector(t)
	proposal := vector.Facts["proposal"]
	duplicateMember := append([]byte(`{"wireVersion":1,`), proposal[1:]...)
	if err := ValidateProposalFact(duplicateMember); err == nil {
		t.Fatal("duplicate Agent proposal JSON members must fail closed")
	}
	unsafeMember := append([]byte(`{"__proto__":{},`), proposal[1:]...)
	if err := ValidateProposalFact(unsafeMember); err == nil {
		t.Fatal("unsafe Agent proposal JSON object keys must fail closed")
	}
	future := decodeAgentProposalObject(t, proposal)
	future["futureAuthority"] = true
	if err := ValidateProposalFact(encodeAgentProposalObject(t, future)); err == nil {
		t.Fatal("unknown Agent proposal members must fail closed")
	}
	if err := ValidateProposalFact(bytes.Repeat([]byte(" "), maximumAgentProposalBytes+1)); err == nil {
		t.Fatal("oversized Agent proposal facts must fail closed")
	}
}

func TestAgentProposalAdmissionRejectsAuthorityDigestAndLifecycleDrift(t *testing.T) {
	vector := readAgentProposalVector(t)
	proposal := decodeAgentProposalObject(t, vector.Facts["proposal"])
	proposalValue := proposal["value"].(map[string]any)
	actions := proposalValue["actions"].([]any)
	actions[0].(map[string]any)["input"].(map[string]any)["authorization"] = "Bearer credential-material"
	if err := ValidateProposalFact(encodeAgentProposalObject(t, proposal)); err == nil {
		t.Fatal("action input must not smuggle approval, credential, or write authority")
	}

	planning := decodeAgentProposalObject(t, vector.Facts["planning"])
	planningValue := planning["value"].(map[string]any)
	planningValue["transactionDigest"] = vector.ExpectedDigests["proposal"]
	if err := ValidateProposalFact(encodeAgentProposalObject(t, planning)); err == nil {
		t.Fatal("planning digest drift must fail closed")
	}

	approval := decodeAgentProposalObject(t, vector.Facts["approval"])
	approvalValue := approval["value"].(map[string]any)
	approvalValue["actor"].(map[string]any)["kind"] = "service"
	if err := ValidateProposalFact(encodeAgentProposalObject(t, approval)); err == nil {
		t.Fatal("non-human Agent approval must fail closed")
	}

	receipt := decodeAgentProposalObject(t, vector.Facts["commitAcknowledged"])
	receiptValue := receipt["value"].(map[string]any)
	delete(receiptValue, "targetRevision")
	if err := ValidateProposalFact(encodeAgentProposalObject(t, receipt)); err == nil {
		t.Fatal("acknowledged mutation without target revision must fail closed")
	}
}
