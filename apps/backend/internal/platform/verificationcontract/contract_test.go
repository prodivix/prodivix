package verificationcontract

import (
	"encoding/json"
	"strings"
	"testing"
)

func verificationDigest() string {
	return "sha256-" + strings.Repeat("b", 64)
}

func TestGeneratedVerificationEvidenceSchemasRemainStrictAndVersioned(t *testing.T) {
	type generatedEvidenceSchema struct {
		ID                   string `json:"$id"`
		AdditionalProperties *bool  `json:"additionalProperties"`
		OneOf                []any  `json:"oneOf"`
	}
	var schemas map[string]generatedEvidenceSchema
	if err := json.Unmarshal(generatedEvidenceSchemasJSON, &schemas); err != nil {
		t.Fatalf("decode generated Verification Evidence schemas: %v", err)
	}
	expected := map[string]string{
		"verification-plan":                   "https://prodivix.dev/schemas/verification-plan.v1.schema.json",
		"verification-artifact-envelope":      "https://prodivix.dev/schemas/verification/artifact-envelope/v1.json",
		"verification-evidence-candidate":     "https://prodivix.dev/schemas/verification/evidence-candidate/v1.json",
		"verification-evidence-manifest":      "https://prodivix.dev/schemas/verification/evidence-manifest/v1.json",
		"verification-evidence-verified-view": "https://prodivix.dev/schemas/verification/evidence-view/v1.json",
	}
	if len(schemas) != len(expected) {
		t.Fatalf("generated Verification Evidence schema count = %d, want %d", len(schemas), len(expected))
	}
	for name, expectedID := range expected {
		schema, exists := schemas[name]
		if !exists {
			t.Errorf("generated Verification Evidence schema %q is missing", name)
			continue
		}
		if schema.ID != expectedID {
			t.Errorf("generated Verification Evidence schema %q id = %q, want %q", name, schema.ID, expectedID)
		}
		if name == "verification-artifact-envelope" {
			if len(schema.OneOf) != 8 {
				t.Errorf("generated Verification artifact envelope must expose all 8 exact class schemas")
			}
		} else if schema.AdditionalProperties == nil || *schema.AdditionalProperties {
			t.Errorf("generated Verification Evidence schema %q must reject unknown top-level properties", name)
		}
	}
}

func verificationDocuments() map[string]struct {
	id      string
	payload json.RawMessage
} {
	digest := verificationDigest()
	return map[string]struct {
		id      string
		payload json.RawMessage
	}{
		"verification-policy": {
			id: "policy.default",
			payload: json.RawMessage(`{
				"wireVersion":1,
				"id":"policy.default",
				"name":"Default policy",
				"defaultRequirement":"advisory",
				"rules":[{
					"id":"rule.critical",
					"requirement":"required",
					"checkKinds":["e2e","visual"],
					"scenarioIds":["scenario.catalog"],
					"scenarioTags":[],
					"criticalities":["critical"],
					"impactedDomains":[],
					"riskFlags":[],
					"matrixProfileId":"matrix.critical",
					"retryPolicyId":"retry.infrastructure",
					"evidenceTrust":"ci-attested",
					"controlProfileRef":{"kind":"workspace","documentId":"control.hermetic","digest":"` + digest + `"}
				}],
				"matrixProfiles":[{
					"id":"matrix.critical",
					"name":"Critical matrix",
					"matrix":{
						"frameworkTargets":["react-vite"],
						"surfaces":["ci"],
						"browserEngines":["chromium"],
						"viewports":[{"id":"desktop","width":1280,"height":720}],
						"colorSchemes":["light"],
						"motions":["reduced"],
						"locales":["en-US"]
					}
				}],
				"retryPolicies":[{
					"id":"retry.infrastructure",
					"maximumAttempts":2,
					"retryableOutcomes":["infrastructure-error"],
					"stabilitySamples":1,
					"freshFixtureNamespace":true
				}],
				"exemptions":[],
				"budgets":{"maximumCells":100,"maximumCellsPerCheckKind":50,"maximumTargetExpansions":8,"maximumBrowserExpansions":3,"maximumClosureEvidenceRecords":1000,"totalMs":600000,"artifactBytes":100000000,"estimatedComputeUnits":10000,"parallelism":4},
				"artifactCapture":{"defaultCapture":"allowed","targets":[]},
				"comparison":{"allowedMismatchFields":["browser-engine"]},
				"evidenceRequirements":{"acceptedTrust":["ci-attested"],"maximumAgeMs":86400000,"requireAttestation":true,"requireCompatibleIdentity":true,"requiredArtifactKinds":["replay-record","screenshot"]},
				"baselinePolicy":{"visual":"required-when-observed","requireCompatibleIdentity":true},
				"retentionRequest":{"successful":"change","failed":"release","protectReleaseEvidence":false}
			}`),
		},
		"verification-baseline-set": {
			id: "baseline.catalog",
			payload: json.RawMessage(`{
				"wireVersion":1,
				"id":"baseline.catalog",
				"name":"Catalog baselines",
				"entries":[{
					"id":"baseline.empty",
					"scenarioId":"scenario.catalog",
					"stepId":"step.observe",
					"targetId":"catalog.list",
					"frameworkTarget":"react-vite",
					"surface":"ci",
					"browserEngine":"chromium",
					"viewport":{"id":"desktop","width":1280,"height":720},
					"colorScheme":"light",
					"motion":"reduced",
					"locale":"en-US",
					"devicePixelRatio":1,
					"asset":{"assetDocumentId":"asset.baseline","digest":"` + digest + `","mediaType":"image/png"},
					"normalizerDigest":"` + digest + `",
					"compatibilityProfileDigest":"` + digest + `",
					"adoptedAt":"2026-07-27T00:00:00Z",
					"adoptedBy":"principal.owner"
				}]
			}`),
		},
	}
}

func TestValidateDocumentAcceptsEveryVerificationWireDocument(t *testing.T) {
	for documentType, fixture := range verificationDocuments() {
		t.Run(documentType, func(t *testing.T) {
			if err := ValidateDocument(documentType, fixture.id, fixture.payload); err != nil {
				t.Fatalf("validate %s: %v", documentType, err)
			}
		})
	}
}

func TestValidateDocumentFailsClosedAtWireAndIdentityBoundaries(t *testing.T) {
	fixture := verificationDocuments()["verification-policy"]
	var future map[string]any
	if err := json.Unmarshal(fixture.payload, &future); err != nil {
		t.Fatal(err)
	}
	future["wireVersion"] = 2
	payload, err := json.Marshal(future)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateDocument("verification-policy", fixture.id, payload); err == nil {
		t.Fatal("future Verification wire versions must fail closed")
	}
	if err := ValidateDocument("verification-policy", "policy.other", fixture.payload); err == nil {
		t.Fatal("Verification content identity must match the Workspace document")
	}
	var unknownProfile map[string]any
	if err := json.Unmarshal(fixture.payload, &unknownProfile); err != nil {
		t.Fatal(err)
	}
	rules := unknownProfile["rules"].([]any)
	rules[0].(map[string]any)["matrixProfileId"] = "matrix.missing"
	payload, err = json.Marshal(unknownProfile)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateDocument("verification-policy", fixture.id, payload); err == nil {
		t.Fatal("unknown matrix profile references must fail closed")
	}

	baseline := verificationDocuments()["verification-baseline-set"]
	var duplicateCompatibility map[string]any
	if err := json.Unmarshal(baseline.payload, &duplicateCompatibility); err != nil {
		t.Fatal(err)
	}
	entries := duplicateCompatibility["entries"].([]any)
	clonedEntry := make(map[string]any)
	for key, value := range entries[0].(map[string]any) {
		clonedEntry[key] = value
	}
	clonedEntry["id"] = "baseline.duplicate"
	duplicateCompatibility["entries"] = append(entries, clonedEntry)
	payload, err = json.Marshal(duplicateCompatibility)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateDocument("verification-baseline-set", baseline.id, payload); err == nil {
		t.Fatal("duplicate baseline compatibility identities must fail closed")
	}
}
