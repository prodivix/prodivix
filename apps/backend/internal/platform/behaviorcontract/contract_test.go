package behaviorcontract

import (
	"encoding/json"
	"strings"
	"testing"
)

func behaviorDigest() string {
	return "sha256-" + strings.Repeat("a", 64)
}

func behaviorDocuments() map[string]struct {
	id      string
	payload json.RawMessage
} {
	digest := behaviorDigest()
	return map[string]struct {
		id      string
		payload json.RawMessage
	}{
		"behavior-scenario": {
			id: "scenario.catalog",
			payload: json.RawMessage(`{
				"wireVersion":1,
				"id":"scenario.catalog",
				"name":"Catalog journey",
				"criticality":"critical",
				"tags":["catalog"],
				"entry":{"id":"trigger.ready","domain":"route","event":"ready"},
				"steps":[{
					"id":"step.observe",
					"kind":"observation",
					"failureMode":"stop",
					"observation":{"kind":"visible","target":{"kind":"public-contract","id":"catalog.list","workspaceDocumentId":"page.catalog","capability":"ui.visible"}},
					"assertions":[{"id":"assert.visible","operator":"equals","expected":true}]
				}],
				"fixtureRefs":[],
				"controlProfileRef":{"kind":"preset","presetId":"hermetic","digest":"` + digest + `"},
				"baselineRefs":[],
				"timeoutPolicy":{"totalMs":30000,"stepMs":5000,"settleMs":2000}
			}`),
		},
		"behavior-control-profile": {
			id: "control.hermetic",
			payload: json.RawMessage(`{
				"wireVersion":1,
				"id":"control.hermetic",
				"name":"Hermetic controls",
				"clock":{"mode":"virtual","epoch":"2026-01-01T00:00:00Z","tickMs":1},
				"timezone":"UTC",
				"random":{"algorithm":"xoshiro256ss","seed":"random"},
				"identifiers":{"seed":"ids","namespaces":["action","attempt","operation","step"]},
				"scheduler":{"strategy":"deterministic","seed":"schedule","maximumTurns":1000},
				"network":{"mode":"fixture-only","undeclaredRequest":"reject"},
				"storage":{"bootstrapFixtureIds":[],"cleanup":"required"},
				"rendering":{"devicePixelRatio":1,"animationClock":"virtual","fontReadiness":"required"},
				"serviceWorker":{"mode":"disabled","cache":"empty"},
				"settle":{"conditions":["declared-effects-complete","render-stable"],"maximumFrames":120},
				"budgets":{"totalMs":30000,"stepMs":5000,"settleMs":2000,"networkMs":3000,"animationMs":3000}
			}`),
		},
		"behavior-fixture-set": {
			id: "fixture.catalog",
			payload: json.RawMessage(`{
				"wireVersion":1,
				"id":"fixture.catalog",
				"name":"Catalog fixtures",
				"fixtures":[{
					"id":"fixture.empty",
					"target":{"kind":"data-operation","resourceId":"catalog.list"},
					"inputDigest":"` + digest + `",
					"outcome":{"kind":"result","value":[]}
				}]
			}`),
		},
	}
}

func TestValidateDocumentAcceptsEveryBehaviorWireDocument(t *testing.T) {
	for documentType, fixture := range behaviorDocuments() {
		t.Run(documentType, func(t *testing.T) {
			if err := ValidateDocument(documentType, fixture.id, fixture.payload); err != nil {
				t.Fatalf("validate %s: %v", documentType, err)
			}
		})
	}
}

func TestValidateDocumentFailsClosedAtWireAndIdentityBoundaries(t *testing.T) {
	fixture := behaviorDocuments()["behavior-scenario"]
	var future map[string]any
	if err := json.Unmarshal(fixture.payload, &future); err != nil {
		t.Fatal(err)
	}
	future["wireVersion"] = 2
	payload, err := json.Marshal(future)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateDocument("behavior-scenario", fixture.id, payload); err == nil {
		t.Fatal("future Behavior wire versions must fail closed")
	}
	if err := ValidateDocument("behavior-scenario", "scenario.other", fixture.payload); err == nil {
		t.Fatal("Behavior content identity must match the Workspace document")
	}
	var duplicateStep map[string]any
	if err := json.Unmarshal(fixture.payload, &duplicateStep); err != nil {
		t.Fatal(err)
	}
	steps := duplicateStep["steps"].([]any)
	duplicateStep["steps"] = append(steps, steps[0])
	payload, err = json.Marshal(duplicateStep)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateDocument("behavior-scenario", fixture.id, payload); err == nil {
		t.Fatal("duplicate BehaviorStep identities must fail closed")
	}
}
