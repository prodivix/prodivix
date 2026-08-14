package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestIsolatedCacheProbeProgramMatchesGoldenVector(t *testing.T) {
	source, err := os.ReadFile(filepath.Join("..", "..", "platform", "agentcontract", "testdata", "agent-evaluation-vector.json"))
	if err != nil {
		t.Fatal(err)
	}
	var vector struct {
		Facts struct {
			Plan json.RawMessage `json:"plan"`
		} `json:"facts"`
	}
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		target := raw.(map[string]any)
		optional, ok := objectMember(target, "optionalCapabilitySupportAuthority")
		if !ok {
			continue
		}
		profileID := stringMember(optional, "qualificationCapabilityProfileId")
		if profileID != "g4-provider-isolated-cache" {
			continue
		}
		evidence, _ := objectMember(optional, "probeEvidence")
		expected, err := expectedEvaluationCapabilityProbeProgram(
			profileID, stringMember(optional, "qualificationCapabilityProfileDigest"),
		)
		if err != nil {
			t.Fatal(err)
		}
		if expected.ProgramDigest != stringMember(evidence["probeProgram"].(map[string]any), "programDigest") ||
			!sameEvaluationCanonicalValue(evidence["probeProgram"], expected.Value) {
			t.Fatalf("isolated-cache probe program drifted from the golden vector")
		}
		return
	}
	t.Fatal("golden vector missing isolated-cache probe program")
}
