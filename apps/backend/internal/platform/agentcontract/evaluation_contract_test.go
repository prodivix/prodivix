package agentcontract

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type agentEvaluationVector struct {
	Format          string                     `json:"format"`
	Version         int                        `json:"version"`
	Facts           map[string]json.RawMessage `json:"facts"`
	CanonicalJSON   map[string]string          `json:"canonicalJson"`
	ExpectedDigests map[string]string          `json:"expectedDigests"`
}

func readAgentEvaluationVector(t *testing.T) agentEvaluationVector {
	t.Helper()
	source, err := os.ReadFile("testdata/agent-evaluation-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentEvaluationVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-evaluation-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent evaluation vector identity: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

func TestAgentEvaluationVectorMatchesTypeScriptCanonicalFacts(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	digestFields := map[string]string{
		"plan": "planDigest", "attempt": "attemptDigest", "checkpoint": "checkpointDigest", "holdout": "receiptDigest",
	}
	for name, fact := range vector.Facts {
		if err := ValidateEvaluationFact(fact); err != nil {
			t.Fatalf("validate %s evaluation fact: %v", name, err)
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
			t.Fatalf("%s evaluation fact bytes drifted", name)
		}
		value := decoded["value"].(map[string]any)
		if value[digestFields[name]] != vector.ExpectedDigests[name] {
			t.Fatalf("%s evaluation digest drifted", name)
		}
		if _, err := CanonicalEvaluationFactDigest(fact); err != nil {
			t.Fatalf("digest %s evaluation fact: %v", name, err)
		}
	}
}

func TestAgentEvaluationAdmissionRejectsAmbiguityAndRecomputedPlanDrift(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	plan := vector.Facts["plan"]
	duplicate := append([]byte(`{"wireVersion":1,`), plan[1:]...)
	if err := ValidateEvaluationFact(duplicate); err == nil {
		t.Fatal("duplicate evaluation JSON members must fail closed")
	}
	if err := ValidateEvaluationFact(bytes.Repeat([]byte(" "), maximumAgentEvaluationBytes+1)); err == nil {
		t.Fatal("oversized evaluation facts must fail closed")
	}
	var drifted map[string]any
	if err := json.Unmarshal(plan, &drifted); err != nil {
		t.Fatal(err)
	}
	value := drifted["value"].(map[string]any)
	value["plannedJourneyCount"] = float64(1)
	recomputeDigest(t, value, "planDigest")
	encoded, _ := json.Marshal(drifted)
	if err := ValidateEvaluationFact(encoded); err == nil {
		t.Fatal("recomputed plan below the frozen journey floor must fail closed")
	}
}

func TestAgentEvaluationAdmissionRebuildsNestedPlanSchedule(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	for name, mutate := range map[string]func(map[string]any){
		"repetition": func(value map[string]any) {
			policy := value["repetitionPolicy"].(map[string]any)
			rules := policy["rules"].([]any)
			rule := rules[0].(map[string]any)
			rule["minimumIndependentAttempts"] = rule["minimumIndependentAttempts"].(float64) + 1
		},
		"budget": func(value map[string]any) {
			evaluationBudget := value["budget"].(map[string]any)
			budget := evaluationBudget["budget"].(map[string]any)
			budget["maxModelInvocations"] = float64(1)
			recomputeDigest(t, evaluationBudget, "budgetDigest")
		},
	} {
		t.Run(name, func(t *testing.T) {
			var drifted map[string]any
			if err := json.Unmarshal(vector.Facts["plan"], &drifted); err != nil {
				t.Fatal(err)
			}
			value := drifted["value"].(map[string]any)
			mutate(value)
			recomputeDigest(t, value, "planDigest")
			encoded, _ := json.Marshal(drifted)
			if err := ValidateEvaluationFact(encoded); err == nil {
				t.Fatalf("recomputed %s drift must fail Go admission", name)
			}
		})
	}
}

func TestAgentEvaluationAdmissionRequiresCurrentEndpointSmokeAuthorityBindings(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	for name, mutate := range map[string]func(map[string]any){
		"missing-pricing-authority": func(target map[string]any) {
			delete(target, "pricingAuthorityDigest")
		},
		"extra-legacy-authority": func(target map[string]any) {
			target["legacyPricingDigest"] = target["pricingAuthorityDigest"]
		},
		"spool-policy-drift": func(target map[string]any) {
			target["responseSpoolEncryptionPolicyDigest"] = target["pricingAuthorityDigest"]
		},
	} {
		t.Run(name, func(t *testing.T) {
			var drifted map[string]any
			if err := json.Unmarshal(vector.Facts["plan"], &drifted); err != nil {
				t.Fatal(err)
			}
			value := drifted["value"].(map[string]any)
			targets := value["endpointSmokeTargets"].([]any)
			mutate(targets[0].(map[string]any))
			recomputeDigest(t, value, "planDigest")
			encoded, _ := json.Marshal(drifted)
			if err := ValidateEvaluationFact(encoded); err == nil {
				t.Fatal("endpoint smoke authority binding drift must fail Go admission")
			}
		})
	}
}

func TestAgentEvaluationAdmissionBindsOptionalCapabilitySupportAuthority(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	for name, mutate := range map[string]func(*testing.T, map[string]any){
		"adapter-swap": func(t *testing.T, target map[string]any) {
			authority := target["optionalCapabilitySupportAuthority"].(map[string]any)
			evidence := authority["probeEvidence"].(map[string]any)
			evidence["adapterDigest"] = authority["qualificationCapabilityProfileDigest"]
			recomputeDigest(t, evidence, "evidenceDigest")
			recomputeDigest(t, authority, "authorityDigest")
		},
		"probed-support-drift": func(t *testing.T, target map[string]any) {
			authority := target["optionalCapabilitySupportAuthority"].(map[string]any)
			evidence := authority["probeEvidence"].(map[string]any)
			receipt := evidence["receipt"].(map[string]any)
			receipt["observedLimitDigest"] = authority["qualificationCapabilityProfileDigest"]
			recomputeDigest(t, receipt, "receiptDigest")
			recomputeDigest(t, evidence, "evidenceDigest")
			recomputeDigest(t, authority, "authorityDigest")
		},
		"fully-recomputed-program-drift": func(t *testing.T, target map[string]any) {
			authority := target["optionalCapabilitySupportAuthority"].(map[string]any)
			evidence := authority["probeEvidence"].(map[string]any)
			program := evidence["probeProgram"].(map[string]any)
			intent := program["providerRequestIntent"].(map[string]any)
			payload := intent["publicPayload"].(map[string]any)
			payload["instruction"] = stringValue(payload["instruction"]) + " recomputed-offline"
			payloadDigest, err := canonicaljson.Digest(payload)
			if err != nil {
				t.Fatal(err)
			}
			intent["publicPayloadDigest"] = payloadDigest
			recomputeDigest(t, program, "programDigest")

			observation := evidence["normalizedObservation"].(map[string]any)
			observation["probeProgramDigest"] = program["programDigest"]
			recomputeDigest(t, observation, "observationDigest")

			receipt := evidence["receipt"].(map[string]any)
			receipt["probeProgramDigest"] = program["programDigest"]
			receipt["normalizedObservationDigest"] = observation["observationDigest"]
			receipt["probedCapabilityDigest"], err = canonicaljson.Digest(map[string]any{
				"normalizedObservationDigest": receipt["normalizedObservationDigest"],
				"observedLimitDigest":         receipt["observedLimitDigest"],
				"observedProfileDigest":       receipt["observedProfileDigest"],
				"probeProgramDigest":          receipt["probeProgramDigest"],
				"profileProjectionDigest":     receipt["profileProjectionDigest"],
				"status":                      receipt["status"],
			})
			if err != nil {
				t.Fatal(err)
			}
			recomputeDigest(t, receipt, "receiptDigest")
			recomputeDigest(t, evidence, "evidenceDigest")
			recomputeDigest(t, authority, "authorityDigest")
		},
	} {
		t.Run(name, func(t *testing.T) {
			var decoded map[string]any
			if err := json.Unmarshal(vector.Facts["plan"], &decoded); err != nil {
				t.Fatal(err)
			}
			value := decoded["value"].(map[string]any)
			var target map[string]any
			for _, raw := range value["capabilityQualificationTargets"].([]any) {
				candidate := raw.(map[string]any)
				if candidate["optionalCapabilitySupportAuthority"] != nil {
					target = candidate
					break
				}
			}
			if target == nil {
				t.Fatal("optional capability target is missing")
			}
			providerID := stringValue(target["providerConfigurationId"])
			var provider map[string]any
			for _, raw := range value["providerConfigurations"].([]any) {
				candidate := raw.(map[string]any)
				if stringValue(candidate["providerConfigurationId"]) == providerID {
					provider = candidate
					break
				}
			}
			if provider == nil {
				t.Fatal("optional capability provider is missing")
			}
			plannedAt, plannedErr := parseInstant(value["plannedAt"])
			expiresAt, expiresErr := parseInstant(value["expiresAt"])
			if plannedErr != nil || expiresErr != nil {
				t.Fatal("optional capability plan window is invalid")
			}
			if _, _, err := evaluationOptionalCapabilitySupportAuthority(
				target, provider, "/optionalCapabilitySupportAuthority", plannedAt, expiresAt,
			); err != nil {
				t.Fatalf("baseline optional authority was rejected: %v", err)
			}
			mutate(t, target)
			if _, _, err := evaluationOptionalCapabilitySupportAuthority(
				target, provider, "/optionalCapabilitySupportAuthority", plannedAt, expiresAt,
			); err == nil {
				t.Fatal("recomputed optional capability authority drift was accepted")
			}
		})
	}
}

func TestAgentEvaluationAdmissionRequiresCurrentProductionMatrix(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	tests := map[string]struct {
		mutate  func(*testing.T, map[string]any)
		message string
	}{
		"deleted-optional-target": {
			mutate: func(t *testing.T, value map[string]any) {
				targets := value["capabilityQualificationTargets"].([]any)
				for index, raw := range targets {
					target := raw.(map[string]any)
					if target["optionalCapabilitySupportAuthority"] != nil {
						value["capabilityQualificationTargets"] = append(targets[:index:index], targets[index+1:]...)
						return
					}
				}
				t.Fatal("optional capability target is missing")
			},
			message: "exact 3 x 9 native matrix",
		},
		"missing-optional-authority": {
			mutate: func(t *testing.T, value map[string]any) {
				for _, raw := range value["capabilityQualificationTargets"].([]any) {
					target := raw.(map[string]any)
					if target["optionalCapabilitySupportAuthority"] != nil {
						delete(target, "optionalCapabilitySupportAuthority")
						recomputeDigest(t, target, "targetDigest")
						return
					}
				}
				t.Fatal("optional capability target is missing")
			},
			message: "optional support authority is missing",
		},
		"legacy-11640-denominator": {
			mutate: func(_ *testing.T, value map[string]any) {
				value["plannedJourneyCount"] = float64(11_640)
			},
			message: "current 14,040-attempt denominator",
		},
		"cross-provider-authority-swap": {
			mutate: func(t *testing.T, value map[string]any) {
				targets := value["capabilityQualificationTargets"].([]any)
				for leftIndex, leftRaw := range targets {
					left := leftRaw.(map[string]any)
					if left["optionalCapabilitySupportAuthority"] == nil {
						continue
					}
					for rightIndex := leftIndex + 1; rightIndex < len(targets); rightIndex++ {
						right := targets[rightIndex].(map[string]any)
						if right["optionalCapabilitySupportAuthority"] == nil ||
							stringValue(left["capabilityProfileId"]) != stringValue(right["capabilityProfileId"]) ||
							stringValue(left["providerConfigurationId"]) == stringValue(right["providerConfigurationId"]) {
							continue
						}
						left["optionalCapabilitySupportAuthority"], right["optionalCapabilitySupportAuthority"] =
							right["optionalCapabilitySupportAuthority"], left["optionalCapabilitySupportAuthority"]
						recomputeDigest(t, left, "targetDigest")
						recomputeDigest(t, right, "targetDigest")
						return
					}
				}
				t.Fatal("cross-provider optional authority pair is missing")
			},
			message: "drifted from its target/provider identity",
		},
		"qualification-bundle-digest-swap": {
			mutate: func(t *testing.T, value map[string]any) {
				for _, raw := range value["capabilityQualificationTargets"].([]any) {
					target := raw.(map[string]any)
					authority, optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
					if !optional {
						continue
					}
					swapped, err := canonicaljson.Digest(map[string]any{"bundle": "swapped-qualification-bundle"})
					if err != nil {
						t.Fatal(err)
					}
					authority["qualificationAuthorityBundleDigest"] = swapped
					recomputeDigest(t, authority, "authorityDigest")
					recomputeDigest(t, target, "targetDigest")
					return
				}
				t.Fatal("optional capability target is missing")
			},
			message: "bundle digest differs across optional targets",
		},
		"missing-runtime-registration-authority": {
			mutate: func(t *testing.T, value map[string]any) {
				for _, raw := range value["capabilityQualificationTargets"].([]any) {
					target := raw.(map[string]any)
					authority, optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
					if !optional || authority["runtimeFactSourceAuthority"] == nil {
						continue
					}
					delete(authority, "runtimeFactSourceAuthority")
					recomputeDigest(t, authority, "authorityDigest")
					recomputeDigest(t, target, "targetDigest")
					return
				}
				t.Fatal("fact-backed optional capability target is missing")
			},
			message: "runtime fact source authority coverage drifted",
		},
		"missing-hosted-runtime-resource-registration-intent": {
			mutate: func(t *testing.T, value map[string]any) {
				for _, raw := range value["capabilityQualificationTargets"].([]any) {
					target := raw.(map[string]any)
					authority, optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
					runtime, runtimeOK := authority["runtimeFactSourceAuthority"].(map[string]any)
					if !optional || !runtimeOK || runtime["hostedRetrievalRuntimeResourceRegistrationIntentDigest"] == nil {
						continue
					}
					delete(runtime, "hostedRetrievalRuntimeResourceRegistrationIntentDigest")
					recomputeDigest(t, runtime, "authorityDigest")
					recomputeDigest(t, authority, "authorityDigest")
					recomputeDigest(t, target, "targetDigest")
					return
				}
				t.Fatal("hosted runtime source authority is missing")
			},
			message: "hosted runtime resource registration intent coverage drifted",
		},
		"foreign-hosted-runtime-resource-registration-intent": {
			mutate: func(t *testing.T, value map[string]any) {
				for _, raw := range value["capabilityQualificationTargets"].([]any) {
					target := raw.(map[string]any)
					authority, optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
					runtime, runtimeOK := authority["runtimeFactSourceAuthority"].(map[string]any)
					if !optional || !runtimeOK || runtime["hostedRetrievalRuntimeResourceRegistrationIntentDigest"] == nil {
						continue
					}
					foreign, err := canonicaljson.Digest(map[string]any{"hostedRegistrationIntent": "foreign"})
					if err != nil {
						t.Fatal(err)
					}
					runtime["hostedRetrievalRuntimeResourceRegistrationIntentDigest"] = foreign
					recomputeDigest(t, runtime, "authorityDigest")
					recomputeDigest(t, authority, "authorityDigest")
					recomputeDigest(t, target, "targetDigest")
					return
				}
				t.Fatal("hosted runtime source authority is missing")
			},
			message: "hosted runtime resource registration intent drifted from its provider and probe program",
		},
		"non-hosted-runtime-resource-registration-intent": {
			mutate: func(t *testing.T, value map[string]any) {
				for _, raw := range value["capabilityQualificationTargets"].([]any) {
					target := raw.(map[string]any)
					authority, optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
					runtime, runtimeOK := authority["runtimeFactSourceAuthority"].(map[string]any)
					if !optional || !runtimeOK || runtime["hostedRetrievalRuntimeResourceRegistrationIntentDigest"] != nil {
						continue
					}
					extra, err := canonicaljson.Digest(map[string]any{"hostedRegistrationIntent": "unexpected"})
					if err != nil {
						t.Fatal(err)
					}
					runtime["hostedRetrievalRuntimeResourceRegistrationIntentDigest"] = extra
					recomputeDigest(t, runtime, "authorityDigest")
					recomputeDigest(t, authority, "authorityDigest")
					recomputeDigest(t, target, "targetDigest")
					return
				}
				t.Fatal("non-hosted runtime source authority is missing")
			},
			message: "hosted runtime resource registration intent coverage drifted",
		},
		"missing-probe-provider-resource-authority": {
			mutate: func(t *testing.T, value map[string]any) {
				for _, raw := range value["capabilityQualificationTargets"].([]any) {
					target := raw.(map[string]any)
					authority, optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
					if !optional || authority["probeProviderResourceAuthority"] == nil {
						continue
					}
					delete(authority, "probeProviderResourceAuthority")
					recomputeDigest(t, authority, "authorityDigest")
					recomputeDigest(t, target, "targetDigest")
					return
				}
				t.Fatal("retrieval optional capability target is missing")
			},
			message: "provider resource authority coverage drifted",
		},
		"probe-provider-resource-authority-swap": {
			mutate: func(t *testing.T, value map[string]any) {
				var left, right map[string]any
				for _, raw := range value["capabilityQualificationTargets"].([]any) {
					target := raw.(map[string]any)
					authority, optional := target["optionalCapabilitySupportAuthority"].(map[string]any)
					if !optional || authority["probeProviderResourceAuthority"] == nil {
						continue
					}
					if left == nil {
						left = target
						continue
					}
					if stringValue(left["capabilityProfileId"]) != stringValue(target["capabilityProfileId"]) {
						right = target
						break
					}
				}
				if left == nil || right == nil {
					t.Fatal("two distinct retrieval provider resource authorities are missing")
				}
				leftAuthority := left["optionalCapabilitySupportAuthority"].(map[string]any)
				rightAuthority := right["optionalCapabilitySupportAuthority"].(map[string]any)
				leftAuthority["probeProviderResourceAuthority"], rightAuthority["probeProviderResourceAuthority"] =
					rightAuthority["probeProviderResourceAuthority"], leftAuthority["probeProviderResourceAuthority"]
				recomputeDigest(t, leftAuthority, "authorityDigest")
				recomputeDigest(t, rightAuthority, "authorityDigest")
				recomputeDigest(t, left, "targetDigest")
				recomputeDigest(t, right, "targetDigest")
			},
			message: "probeProviderResourceAuthority",
		},
	}
	for name, testCase := range tests {
		t.Run(name, func(t *testing.T) {
			var drifted map[string]any
			if err := json.Unmarshal(vector.Facts["plan"], &drifted); err != nil {
				t.Fatal(err)
			}
			value := drifted["value"].(map[string]any)
			testCase.mutate(t, value)
			recomputeDigest(t, value, "planDigest")
			encoded, err := json.Marshal(drifted)
			if err != nil {
				t.Fatal(err)
			}
			err = ValidateEvaluationFact(encoded)
			if err == nil || !strings.Contains(err.Error(), testCase.message) {
				t.Fatalf("current production matrix drift error=%v, want %q", err, testCase.message)
			}
		})
	}
}

func TestAgentEvaluationAdmissionRequiresProbeWindowCoverage(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	for name, mutate := range map[string]func(map[string]any, time.Time, time.Time){
		"late-probe": func(receipt map[string]any, plannedAt time.Time, _ time.Time) {
			receipt["probedAt"] = plannedAt.Add(time.Millisecond).Format("2006-01-02T15:04:05.000Z")
		},
		"stale-probe": func(receipt map[string]any, _ time.Time, expiresAt time.Time) {
			receipt["expiresAt"] = expiresAt.Add(-time.Millisecond).Format("2006-01-02T15:04:05.000Z")
		},
	} {
		t.Run(name, func(t *testing.T) {
			var drifted map[string]any
			if err := json.Unmarshal(vector.Facts["plan"], &drifted); err != nil {
				t.Fatal(err)
			}
			value := drifted["value"].(map[string]any)
			plannedAt, plannedErr := parseInstant(value["plannedAt"])
			expiresAt, expiresErr := parseInstant(value["expiresAt"])
			if plannedErr != nil || expiresErr != nil {
				t.Fatal("canonical plan window is invalid")
			}
			var target map[string]any
			for _, raw := range value["capabilityQualificationTargets"].([]any) {
				candidate := raw.(map[string]any)
				if candidate["optionalCapabilitySupportAuthority"] != nil {
					target = candidate
					break
				}
			}
			if target == nil {
				t.Fatal("optional capability target is missing")
			}
			authority := target["optionalCapabilitySupportAuthority"].(map[string]any)
			evidence := authority["probeEvidence"].(map[string]any)
			receipt := evidence["receipt"].(map[string]any)
			mutate(receipt, plannedAt, expiresAt)
			recomputeDigest(t, receipt, "receiptDigest")
			recomputeDigest(t, evidence, "evidenceDigest")
			recomputeDigest(t, authority, "authorityDigest")
			recomputeDigest(t, target, "targetDigest")
			recomputeDigest(t, value, "planDigest")
			encoded, err := json.Marshal(drifted)
			if err != nil {
				t.Fatal(err)
			}
			err = ValidateEvaluationFact(encoded)
			if err == nil || !strings.Contains(err.Error(), "does not cover the frozen plan window") {
				t.Fatalf("probe window drift error=%v", err)
			}
		})
	}
}

func TestAgentEvaluationAdmissionRejectsRecomputedNestedResultDrift(t *testing.T) {
	vector := readAgentEvaluationVector(t)
	for name, testCase := range map[string]struct {
		fact   string
		mutate func(*testing.T, map[string]any)
	}{
		"attempt-sampling-identity": {
			fact: "attempt",
			mutate: func(t *testing.T, value map[string]any) {
				descriptor := value["descriptor"].(map[string]any)
				forged, err := canonicaljson.Digest(map[string]any{"forged": true})
				if err != nil {
					t.Fatal(err)
				}
				descriptor["samplingIdentityDigest"] = forged
				descriptor["attemptId"] = "evaluation-attempt:" + strings.TrimPrefix(forged, "sha256-")
				recomputeDigest(t, descriptor, "descriptorDigest")
				recomputeDigest(t, value, "attemptDigest")
			},
		},
		"attempt-usage-unit": {
			fact: "attempt",
			mutate: func(t *testing.T, value map[string]any) {
				usage := value["usage"].(map[string]any)
				amounts := usage["amounts"].([]any)
				amounts[0].(map[string]any)["unit"] = "unregistered-provider-unit"
				recomputeDigest(t, usage, "vectorDigest")
				recomputeDigest(t, value, "attemptDigest")
			},
		},
		"checkpoint-negative-budget": {
			fact: "checkpoint",
			mutate: func(t *testing.T, value map[string]any) {
				ledger := value["budgetLedger"].(map[string]any)
				budget := ledger["budget"].(map[string]any)
				budget["maxModelInvocations"] = float64(-1)
				recomputeDigest(t, ledger, "ledgerDigest")
				recomputeDigest(t, value, "checkpointDigest")
			},
		},
		"holdout-leak-outside-executed-set": {
			fact: "holdout",
			mutate: func(t *testing.T, value map[string]any) {
				value["leakedCaseIds"] = []any{"g4-v8.not-executed.1"}
				recomputeDigest(t, value, "receiptDigest")
			},
		},
	} {
		t.Run(name, func(t *testing.T) {
			var drifted map[string]any
			if err := json.Unmarshal(vector.Facts[testCase.fact], &drifted); err != nil {
				t.Fatal(err)
			}
			value := drifted["value"].(map[string]any)
			testCase.mutate(t, value)
			encoded, _ := json.Marshal(drifted)
			if err := ValidateEvaluationFact(encoded); err == nil {
				t.Fatal("recomputed nested result drift must fail Go admission")
			}
		})
	}
}
