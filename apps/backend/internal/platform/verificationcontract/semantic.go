package verificationcontract

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

type verificationPolicySemanticDocument struct {
	Rules           []verificationPolicySemanticRule `json:"rules"`
	MatrixProfiles  []verificationMatrixProfile      `json:"matrixProfiles"`
	RetryPolicies   []verificationRetryPolicy        `json:"retryPolicies"`
	Exemptions      []verificationExemption          `json:"exemptions"`
	ArtifactCapture struct {
		Targets []struct {
			TargetID string `json:"targetId"`
		} `json:"targets"`
	} `json:"artifactCapture"`
}

type verificationPolicySemanticRule struct {
	ID              string   `json:"id"`
	Requirement     string   `json:"requirement"`
	CheckKinds      []string `json:"checkKinds"`
	ScenarioIDs     []string `json:"scenarioIds"`
	ScenarioTags    []string `json:"scenarioTags"`
	Criticalities   []string `json:"criticalities"`
	ImpactedDomains []string `json:"impactedDomains"`
	RiskFlags       []string `json:"riskFlags"`
	MatrixProfileID string   `json:"matrixProfileId"`
	RetryPolicyID   string   `json:"retryPolicyId"`
}

type verificationMatrixProfile struct {
	ID     string `json:"id"`
	Matrix struct {
		Viewports []struct {
			ID string `json:"id"`
		} `json:"viewports"`
	} `json:"matrix"`
}

type verificationRetryPolicy struct {
	ID string `json:"id"`
}

type verificationExemption struct {
	ID        string `json:"id"`
	RuleID    string `json:"ruleId"`
	CreatedAt string `json:"createdAt"`
	ExpiresAt string `json:"expiresAt"`
}

type verificationBaselineSetSemanticDocument struct {
	Entries []verificationBaselineSemanticEntry `json:"entries"`
}

type verificationBaselineSemanticEntry struct {
	ID              string `json:"id"`
	ScenarioID      string `json:"scenarioId"`
	StepID          string `json:"stepId"`
	TargetID        string `json:"targetId"`
	FrameworkTarget string `json:"frameworkTarget"`
	Surface         string `json:"surface"`
	BrowserEngine   string `json:"browserEngine"`
	Viewport        struct {
		ID     string `json:"id"`
		Width  int64  `json:"width"`
		Height int64  `json:"height"`
	} `json:"viewport"`
	ColorScheme      string  `json:"colorScheme"`
	Motion           string  `json:"motion"`
	Locale           string  `json:"locale"`
	DevicePixelRatio float64 `json:"devicePixelRatio"`
	NormalizerDigest string  `json:"normalizerDigest"`
	Asset            struct {
		MediaType string `json:"mediaType"`
	} `json:"asset"`
}

func validateDocumentSemantics(documentType string, payload json.RawMessage) error {
	switch documentType {
	case "verification-policy":
		return validatePolicySemantics(payload)
	case "verification-baseline-set":
		return validateBaselineSetSemantics(payload)
	default:
		return nil
	}
}

func duplicateID(values []string) string {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			return value
		}
		seen[value] = struct{}{}
	}
	return ""
}

func sortedStrings(values []string) []string {
	result := append([]string(nil), values...)
	sort.Strings(result)
	return result
}

func policySelectorIdentity(rule verificationPolicySemanticRule) (string, error) {
	selector := struct {
		CheckKinds      []string `json:"checkKinds"`
		ScenarioIDs     []string `json:"scenarioIds"`
		ScenarioTags    []string `json:"scenarioTags"`
		Criticalities   []string `json:"criticalities"`
		ImpactedDomains []string `json:"impactedDomains"`
		RiskFlags       []string `json:"riskFlags"`
	}{
		CheckKinds:      sortedStrings(rule.CheckKinds),
		ScenarioIDs:     sortedStrings(rule.ScenarioIDs),
		ScenarioTags:    sortedStrings(rule.ScenarioTags),
		Criticalities:   sortedStrings(rule.Criticalities),
		ImpactedDomains: sortedStrings(rule.ImpactedDomains),
		RiskFlags:       sortedStrings(rule.RiskFlags),
	}
	encoded, err := json.Marshal(selector)
	return string(encoded), err
}

func validatePolicySemantics(payload json.RawMessage) error {
	var policy verificationPolicySemanticDocument
	if err := json.Unmarshal(payload, &policy); err != nil {
		return err
	}
	ruleIDs := make([]string, 0, len(policy.Rules))
	matrixProfileIDs := make([]string, 0, len(policy.MatrixProfiles))
	retryPolicyIDs := make([]string, 0, len(policy.RetryPolicies))
	exemptionIDs := make([]string, 0, len(policy.Exemptions))
	artifactCaptureTargetIDs := make([]string, 0, len(policy.ArtifactCapture.Targets))
	for _, rule := range policy.Rules {
		ruleIDs = append(ruleIDs, rule.ID)
	}
	for _, profile := range policy.MatrixProfiles {
		matrixProfileIDs = append(matrixProfileIDs, profile.ID)
	}
	for _, retryPolicy := range policy.RetryPolicies {
		retryPolicyIDs = append(retryPolicyIDs, retryPolicy.ID)
	}
	for _, exemption := range policy.Exemptions {
		exemptionIDs = append(exemptionIDs, exemption.ID)
	}
	for _, target := range policy.ArtifactCapture.Targets {
		artifactCaptureTargetIDs = append(artifactCaptureTargetIDs, target.TargetID)
	}
	for label, ids := range map[string][]string{
		"rule":                    ruleIDs,
		"matrix profile":          matrixProfileIDs,
		"retry policy":            retryPolicyIDs,
		"exemption":               exemptionIDs,
		"artifact capture target": artifactCaptureTargetIDs,
	} {
		if duplicate := duplicateID(ids); duplicate != "" {
			return fmt.Errorf("duplicate Verification %s id: %s", label, duplicate)
		}
	}

	matrixProfiles := make(map[string]struct{}, len(matrixProfileIDs))
	for _, id := range matrixProfileIDs {
		matrixProfiles[id] = struct{}{}
	}
	retryPolicies := make(map[string]struct{}, len(retryPolicyIDs))
	for _, id := range retryPolicyIDs {
		retryPolicies[id] = struct{}{}
	}
	rules := make(map[string]struct{}, len(ruleIDs))
	for _, id := range ruleIDs {
		rules[id] = struct{}{}
	}
	selectorRequirements := make(map[string]verificationPolicySemanticRule)
	for _, rule := range policy.Rules {
		if _, exists := matrixProfiles[rule.MatrixProfileID]; !exists {
			return fmt.Errorf("Verification rule %s references unknown matrix profile %s", rule.ID, rule.MatrixProfileID)
		}
		if _, exists := retryPolicies[rule.RetryPolicyID]; !exists {
			return fmt.Errorf("Verification rule %s references unknown retry policy %s", rule.ID, rule.RetryPolicyID)
		}
		selector, err := policySelectorIdentity(rule)
		if err != nil {
			return err
		}
		if previous, exists := selectorRequirements[selector]; exists && previous.Requirement != rule.Requirement {
			return fmt.Errorf("Verification rules %s and %s have conflicting requirements", previous.ID, rule.ID)
		}
		selectorRequirements[selector] = rule
	}
	for _, profile := range policy.MatrixProfiles {
		viewportIDs := make([]string, 0, len(profile.Matrix.Viewports))
		for _, viewport := range profile.Matrix.Viewports {
			viewportIDs = append(viewportIDs, viewport.ID)
		}
		if duplicate := duplicateID(viewportIDs); duplicate != "" {
			return fmt.Errorf("matrix profile %s has duplicate viewport id %s", profile.ID, duplicate)
		}
	}
	for _, exemption := range policy.Exemptions {
		if _, exists := rules[exemption.RuleID]; !exists {
			return fmt.Errorf("Verification exemption %s references unknown rule %s", exemption.ID, exemption.RuleID)
		}
		createdAt, createdErr := time.Parse(time.RFC3339Nano, exemption.CreatedAt)
		expiresAt, expiresErr := time.Parse(time.RFC3339Nano, exemption.ExpiresAt)
		if createdErr != nil || expiresErr != nil || !createdAt.Before(expiresAt) {
			return fmt.Errorf("Verification exemption %s has an invalid expiry interval", exemption.ID)
		}
	}
	return nil
}

func validateBaselineSetSemantics(payload json.RawMessage) error {
	var baselineSet verificationBaselineSetSemanticDocument
	if err := json.Unmarshal(payload, &baselineSet); err != nil {
		return err
	}
	entryIDs := make([]string, 0, len(baselineSet.Entries))
	compatibilityIDs := make(map[string]string, len(baselineSet.Entries))
	for _, entry := range baselineSet.Entries {
		entryIDs = append(entryIDs, entry.ID)
		identity, err := json.Marshal(struct {
			ScenarioID       string  `json:"scenarioId"`
			StepID           string  `json:"stepId"`
			TargetID         string  `json:"targetId"`
			FrameworkTarget  string  `json:"frameworkTarget"`
			Surface          string  `json:"surface"`
			BrowserEngine    string  `json:"browserEngine"`
			Viewport         any     `json:"viewport"`
			ColorScheme      string  `json:"colorScheme"`
			Motion           string  `json:"motion"`
			Locale           string  `json:"locale"`
			DevicePixelRatio float64 `json:"devicePixelRatio"`
			NormalizerDigest string  `json:"normalizerDigest"`
		}{
			ScenarioID:       entry.ScenarioID,
			StepID:           entry.StepID,
			TargetID:         entry.TargetID,
			FrameworkTarget:  entry.FrameworkTarget,
			Surface:          entry.Surface,
			BrowserEngine:    entry.BrowserEngine,
			Viewport:         entry.Viewport,
			ColorScheme:      entry.ColorScheme,
			Motion:           entry.Motion,
			Locale:           entry.Locale,
			DevicePixelRatio: entry.DevicePixelRatio,
			NormalizerDigest: entry.NormalizerDigest,
		})
		if err != nil {
			return err
		}
		key := string(identity)
		if previous, exists := compatibilityIDs[key]; exists {
			return fmt.Errorf("Verification baseline entries %s and %s have the same compatibility identity", previous, entry.ID)
		}
		compatibilityIDs[key] = entry.ID
		if !strings.HasPrefix(entry.Asset.MediaType, "image/") {
			return fmt.Errorf("Verification baseline %s must reference image media", entry.ID)
		}
	}
	if duplicate := duplicateID(entryIDs); duplicate != "" {
		return fmt.Errorf("duplicate Verification baseline id: %s", duplicate)
	}
	return nil
}
