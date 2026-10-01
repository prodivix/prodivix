package verificationcontract

import (
	"encoding/json"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestReadBaselineReferencesUsesCurrentCanonicalProjection(t *testing.T) {
	fixture := verificationDocuments()["verification-baseline-set"]
	var object map[string]any
	if err := json.Unmarshal(fixture.payload, &object); err != nil {
		t.Fatal(err)
	}
	first := object["entries"].([]any)[0].(map[string]any)
	second := make(map[string]any, len(first))
	for key, value := range first {
		second[key] = value
	}
	first["id"], second["id"], second["stepId"] = "baseline.z", "baseline.a", "step.another"
	object["entries"] = []any{first, second}
	payload, _ := json.Marshal(object)
	current, digest, err := ReadBaselineReferences(fixture.id, payload)
	if err != nil || len(current.Entries) != 2 || current.Entries[0].ID != "baseline.a" {
		t.Fatalf("current=%#v err=%v", current, err)
	}
	delete(object, "wireVersion")
	object["entries"] = []any{second, first}
	expected, err := canonicaljson.Digest(object)
	if err != nil || digest != expected {
		t.Fatalf("current digest=%s expected=%s err=%v", digest, expected, err)
	}
	second["stepId"] = first["stepId"]
	payload, _ = json.Marshal(object)
	if _, _, err := ReadBaselineReferences(fixture.id, payload); err == nil {
		t.Fatal("duplicate compatible entries accepted")
	}
	if _, _, err := ReadBaselineReferences("baseline.foreign", fixture.payload); err == nil {
		t.Fatal("foreign document identity accepted")
	}
}
