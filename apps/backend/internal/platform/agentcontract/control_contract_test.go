package agentcontract

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type agentControlVector struct {
	Format          string                     `json:"format"`
	Version         int                        `json:"version"`
	Facts           map[string]json.RawMessage `json:"facts"`
	CanonicalJSON   map[string]string          `json:"canonicalJson"`
	ExpectedDigests map[string]string          `json:"expectedDigests"`
}

func readAgentControlVector(t *testing.T) agentControlVector {
	t.Helper()
	source, err := os.ReadFile("testdata/agent-control-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentControlVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-control-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent control vector identity: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

func decodeAgentControlObject(t *testing.T, source json.RawMessage) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(source, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func encodeAgentControlObject(t *testing.T, value map[string]any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func refreshAgentControlDigest(t *testing.T, value map[string]any, field string) {
	t.Helper()
	base := make(map[string]any, len(value)-1)
	for key, member := range value {
		if key != field {
			base[key] = member
		}
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	value[field] = digest
}

func TestAgentControlVectorMatchesTypeScriptCanonicalFacts(t *testing.T) {
	vector := readAgentControlVector(t)
	for _, name := range []string{"task", "run", "event", "audit"} {
		fact := vector.Facts[name]
		if err := ValidateControlFact(fact); err != nil {
			t.Fatalf("validate %s control fact: %v", name, err)
		}
		decoded := decodeAgentControlObject(t, fact)
		canonical, err := canonicaljson.Bytes(decoded)
		if err != nil {
			t.Fatalf("canonicalize %s control fact: %v", name, err)
		}
		if string(canonical) != vector.CanonicalJSON[name] {
			t.Fatalf("%s control fact bytes drifted from TypeScript canonical JSON", name)
		}
		value := decoded["value"].(map[string]any)
		digestField := map[string]string{
			"task": "taskDigest", "run": "snapshotDigest",
			"event": "eventDigest", "audit": "exportDigest",
		}[name]
		if value[digestField] != vector.ExpectedDigests[name] {
			t.Fatalf("%s digest = %v, want %s", name, value[digestField], vector.ExpectedDigests[name])
		}
		if _, err := CanonicalControlFactDigest(fact); err != nil {
			t.Fatalf("digest %s control fact: %v", name, err)
		}
	}
}

func TestAgentControlAdmissionRejectsAmbiguityAndUnknownContracts(t *testing.T) {
	vector := readAgentControlVector(t)
	task := vector.Facts["task"]
	duplicateMember := append([]byte(`{"wireVersion":1,`), task[1:]...)
	if err := ValidateControlFact(duplicateMember); err == nil {
		t.Fatal("duplicate Agent control JSON members must fail closed")
	}
	unsafeMember := append([]byte(`{"__proto__":{},`), task[1:]...)
	if err := ValidateControlFact(unsafeMember); err == nil {
		t.Fatal("unsafe Agent control JSON object keys must fail closed")
	}
	future := decodeAgentControlObject(t, task)
	future["wireVersion"] = float64(2)
	if err := ValidateControlFact(encodeAgentControlObject(t, future)); err == nil {
		t.Fatal("future Agent control wire versions must fail closed")
	}
	unknown := decodeAgentControlObject(t, task)
	unknown["unexpectedAuthority"] = true
	if err := ValidateControlFact(encodeAgentControlObject(t, unknown)); err == nil {
		t.Fatal("unknown Agent control members must fail closed")
	}
	if err := ValidateControlFact(bytes.Repeat([]byte(" "), maximumAgentControlBytes+1)); err == nil {
		t.Fatal("oversized Agent control facts must fail closed")
	}
}

func TestAgentControlAdmissionRejectsDigestSecretAndChainDrift(t *testing.T) {
	vector := readAgentControlVector(t)
	task := decodeAgentControlObject(t, vector.Facts["task"])
	taskValue := task["value"].(map[string]any)
	taskValue["spec"].(map[string]any)["intent"] = "drifted without a new Task identity"
	if err := ValidateControlFact(encodeAgentControlObject(t, task)); err == nil {
		t.Fatal("Task intent or digest drift must fail closed")
	}

	event := decodeAgentControlObject(t, vector.Facts["event"])
	eventValue := event["value"].(map[string]any)
	eventValue["sanitizedPayload"] = map[string]any{
		"authorization": "Bearer credential-material-must-not-persist",
	}
	if err := ValidateControlFact(encodeAgentControlObject(t, event)); err == nil {
		t.Fatal("credential-like audit payload must fail closed")
	}

	audit := decodeAgentControlObject(t, vector.Facts["audit"])
	auditValue := audit["value"].(map[string]any)
	events := auditValue["events"].([]any)
	events[1].(map[string]any)["previousEventDigest"] = vector.ExpectedDigests["task"]
	if err := ValidateControlFact(encodeAgentControlObject(t, audit)); err == nil {
		t.Fatal("broken Agent audit hash chains must fail closed")
	}
}

func TestAgentControlAdmissionRejectsNestedLifecycleAndBudgetDrift(t *testing.T) {
	vector := readAgentControlVector(t)
	task := decodeAgentControlObject(t, vector.Facts["task"])
	taskValue := task["value"].(map[string]any)
	taskSpec := taskValue["spec"].(map[string]any)
	credentialIntent := "Inspect Bearer credential-material"
	taskSpec["intent"] = credentialIntent
	intentDigest, err := canonicaljson.Digest(credentialIntent)
	if err != nil {
		t.Fatal(err)
	}
	taskSpec["intentDigest"] = intentDigest
	refreshAgentControlDigest(t, taskValue, "taskDigest")
	if err := ValidateControlFact(encodeAgentControlObject(t, task)); err == nil {
		t.Fatal("credential-like Task intent must fail closed even with refreshed digests")
	}

	event := decodeAgentControlObject(t, vector.Facts["event"])
	eventValue := event["value"].(map[string]any)
	eventValue["family"] = "tool"
	refreshAgentControlDigest(t, eventValue, "eventDigest")
	if err := ValidateControlFact(encodeAgentControlObject(t, event)); err == nil {
		t.Fatal("event family/type drift must fail closed even with a refreshed digest")
	}

	event = decodeAgentControlObject(t, vector.Facts["event"])
	eventValue = event["value"].(map[string]any)
	proof := eventValue["data"].(map[string]any)["successProof"].(map[string]any)
	proof["groundingDigests"] = []any{}
	refreshAgentControlDigest(t, eventValue, "eventDigest")
	if err := ValidateControlFact(encodeAgentControlObject(t, event)); err == nil {
		t.Fatal("malformed mode success proof must fail closed even with a refreshed digest")
	}

	event = decodeAgentControlObject(t, vector.Facts["event"])
	eventValue = event["value"].(map[string]any)
	eventValue["occurredAt"] = "2026-08-01T08:00:08Z"
	refreshAgentControlDigest(t, eventValue, "eventDigest")
	if err := ValidateControlFact(encodeAgentControlObject(t, event)); err == nil {
		t.Fatal("non-canonical Agent instant must fail closed even with a refreshed digest")
	}

	event = decodeAgentControlObject(t, vector.Facts["event"])
	eventValue = event["value"].(map[string]any)
	eventValue["data"].(map[string]any)["reason"] = "Bearer credential-material"
	refreshAgentControlDigest(t, eventValue, "eventDigest")
	if err := ValidateControlFact(encodeAgentControlObject(t, event)); err == nil {
		t.Fatal("credential-like event data must fail closed even with a refreshed digest")
	}

	audit := decodeAgentControlObject(t, vector.Facts["audit"])
	auditEvents := audit["value"].(map[string]any)["events"].([]any)
	var completedModelEvent map[string]any
	for _, rawEvent := range auditEvents {
		candidate := rawEvent.(map[string]any)
		if candidate["type"] == "model.completed" {
			completedModelEvent = candidate
			break
		}
	}
	if completedModelEvent == nil {
		t.Fatal("canonical vector is missing model.completed")
	}
	operation := completedModelEvent["data"].(map[string]any)["operation"].(map[string]any)
	operation["state"] = "cancelled"
	refreshAgentControlDigest(t, operation, "operationDigest")
	refreshAgentControlDigest(t, completedModelEvent, "eventDigest")
	malformedOperationEvent := map[string]any{
		"wireVersion": float64(1),
		"factType":    "run-event",
		"value":       completedModelEvent,
	}
	if err := ValidateControlFact(encodeAgentControlObject(t, malformedOperationEvent)); err == nil {
		t.Fatal("completed event with a cancelled operation receipt must fail closed")
	}

	run := decodeAgentControlObject(t, vector.Facts["run"])
	runValue := run["value"].(map[string]any)
	ledger := runValue["budgetLedger"].(map[string]any)
	ledger["budget"].(map[string]any)["maxModelInvocations"] = float64(0)
	refreshAgentControlDigest(t, ledger, "ledgerDigest")
	refreshAgentControlDigest(t, runValue, "snapshotDigest")
	if err := ValidateControlFact(encodeAgentControlObject(t, run)); err == nil {
		t.Fatal("budget utilization above a refreshed hard ceiling must fail closed")
	}
}
