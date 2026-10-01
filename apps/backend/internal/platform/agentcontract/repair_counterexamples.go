package agentcontract

import (
	"encoding/json"
	"errors"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func IsControlIdentity(value string) bool { return requireIdentity(value, "/identity") == nil }

// StableVerificationCellDigest is the public WorkspaceSync stable-cell
// projection at the Go contract boundary. Its input comes from the Plan codec.
func StableVerificationCellDigest(source json.RawMessage) (string, error) {
	var cell map[string]any
	if err := json.Unmarshal(source, &cell); err != nil {
		return "", err
	}
	current := map[string]any{}
	for _, key := range []string{"checkId", "checkKind", "scenarioId", "targetId", "targetPolicy", "frameworkTarget", "surface", "browserEngine", "viewport", "colorScheme", "motion", "locale", "controlProfileRef", "fixtureSetRef", "baselineSetRef", "adapter", "requirement", "policyRuleIds", "appliedExemptionIds", "retryPolicy", "evidenceRequirements", "resources", "inputKinds", "artifactKinds", "preflight"} {
		if value, exists := cell[key]; exists {
			current[key] = value
		}
	}
	for _, key := range []string{"policyRuleIds", "appliedExemptionIds", "inputKinds", "artifactKinds"} {
		values, ok := current[key].([]any)
		if !ok {
			return "", errors.New("stable cell lacks canonical lists")
		}
		current[key] = canonicalRepairText(values)
	}
	return canonicaljson.Digest(current)
}

func canonicalRepairText(values []any) []any {
	set := map[string]struct{}{}
	for _, raw := range values {
		if text, ok := raw.(string); ok {
			set[text] = struct{}{}
		}
	}
	texts := make([]string, 0, len(set))
	for value := range set {
		texts = append(texts, value)
	}
	sort.Strings(texts)
	result := make([]any, len(texts))
	for i, text := range texts {
		result[i] = text
	}
	return result
}

func DeriveRepairCounterexamples(plan, closure map[string]any, evidence []map[string]any) (map[string]any, error) {
	if closure["verdict"] == "satisfied" || closure["planDigest"] != plan["planDigest"] {
		return nil, errors.New("repair requires failed exact Plan")
	}
	statuses, ok := closure["cellStatuses"].(map[string]any)
	if !ok {
		return nil, errors.New("missing Closure cell statuses")
	}
	issues, ok := closure["issues"].([]any)
	if !ok {
		return nil, errors.New("missing Closure issues")
	}
	cells, ok := plan["cells"].([]any)
	if !ok {
		return nil, errors.New("missing Plan cells")
	}
	requirements := []any{}
	for _, raw := range cells {
		cell, ok := raw.(map[string]any)
		if !ok {
			return nil, errors.New("invalid Plan cell")
		}
		if cell["requirement"] != "required" || statuses[stringValue(cell["id"])] == "passed" {
			continue
		}
		bytes, err := canonicaljson.Bytes(cell)
		if err != nil {
			return nil, err
		}
		stable, err := StableVerificationCellDigest(bytes)
		if err != nil {
			return nil, err
		}
		manifests, traces, codes := []any{}, []any{}, []any{}
		for _, item := range evidence {
			if item["cellId"] != cell["id"] {
				continue
			}
			manifests = append(manifests, item["manifestDigest"])
			traces = append(traces, item["sourceTraceDigest"])
			result, ok := item["result"].(map[string]any)
			if !ok {
				return nil, errors.New("invalid Evidence result")
			}
			list, ok := result["diagnosticCodes"].([]any)
			if !ok {
				return nil, errors.New("invalid Evidence diagnostic codes")
			}
			codes = append(codes, list...)
		}
		for _, rawIssue := range issues {
			issue := rawIssue.(map[string]any)
			if issue["cellId"] == cell["id"] {
				codes = append(codes, "closure:"+stringValue(issue["status"]))
			}
		}
		body := map[string]any{"sourceCellId": cell["id"], "stableCellDigest": stable, "checkId": cell["checkId"], "targetId": cell["targetId"], "evidenceManifestDigests": canonicalRepairText(manifests), "sourceTraceDigests": canonicalRepairText(traces), "diagnosticCodes": canonicalRepairText(codes)}
		digest, err := canonicaljson.Digest(body)
		if err != nil {
			return nil, err
		}
		body["requirementDigest"] = digest
		requirements = append(requirements, body)
	}
	if len(requirements) == 0 || len(requirements) > 1024 {
		return nil, errors.New("failed Closure has no bounded required counterexamples")
	}
	sort.Slice(requirements, func(i, j int) bool {
		return requirements[i].(map[string]any)["stableCellDigest"].(string) < requirements[j].(map[string]any)["stableCellDigest"].(string)
	})
	digests := []any{}
	for _, raw := range requirements {
		digests = append(digests, raw.(map[string]any)["requirementDigest"])
	}
	result := map[string]any{"failedClosureDigest": closure["closureDigest"], "requirements": requirements}
	digest, err := canonicaljson.Digest(result)
	if err != nil {
		return nil, err
	}
	result["counterexampleSetDigest"] = digest
	regression, err := canonicaljson.Digest(canonicalRepairText(digests))
	if err != nil {
		return nil, err
	}
	result["regressionRequirementSetDigest"] = regression
	return result, nil
}
