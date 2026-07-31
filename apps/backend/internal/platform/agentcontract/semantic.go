package agentcontract

import (
	"errors"
	"fmt"
	"sort"
)

func validateAgentPolicySemantics(document map[string]any) error {
	if err := rejectUnsafeKeys(document, "/"); err != nil {
		return err
	}
	globalRuleIDs := make(map[string]struct{})
	for _, family := range []string{
		"providerRules",
		"modelRules",
		"capabilityRules",
		"approvalRules",
		"networkRules",
		"secretRules",
	} {
		rules, _ := document[family].([]any)
		previous := ""
		for index, raw := range rules {
			rule, _ := raw.(map[string]any)
			id, _ := rule["id"].(string)
			if index > 0 && id < previous {
				return fmt.Errorf("/%s must use Unicode code-point id order", family)
			}
			if _, exists := globalRuleIDs[id]; exists {
				return fmt.Errorf("duplicate AgentPolicy rule id: %s", id)
			}
			globalRuleIDs[id] = struct{}{}
			previous = id
		}
	}

	checks := []struct {
		parent string
		field  string
	}{
		{"providerRules", "providerConfigurationIds"},
		{"providerRules", "protocolFamilies"},
		{"providerRules", "endpointClasses"},
		{"providerRules", "regions"},
		{"modelRules", "modelIds"},
		{"modelRules", "modelFamilyIds"},
		{"modelRules", "capabilityProfileIds"},
		{"capabilityRules", "capabilities"},
		{"capabilityRules", "toolIds"},
		{"capabilityRules", "runtimeZones"},
		{"approvalRules", "riskLevels"},
		{"approvalRules", "capabilities"},
		{"networkRules", "hosts"},
		{"networkRules", "methods"},
		{"secretRules", "referenceKinds"},
		{"secretRules", "purposes"},
		{"secretRules", "runtimeZones"},
	}
	for _, check := range checks {
		rules, _ := document[check.parent].([]any)
		for index, raw := range rules {
			rule, _ := raw.(map[string]any)
			if err := requireCanonicalStrings(rule[check.field]); err != nil {
				return fmt.Errorf("/%s/%d/%s: %w", check.parent, index, check.field, err)
			}
		}
	}
	context, _ := document["contextRules"].(map[string]any)
	for _, field := range []string{"allowedAuthorities", "allowedItemKinds"} {
		if err := requireCanonicalStrings(context[field]); err != nil {
			return fmt.Errorf("/contextRules/%s: %w", field, err)
		}
	}
	verification, _ := document["verificationRules"].(map[string]any)
	for _, field := range []string{"requiredModes", "requiredCheckKinds"} {
		if err := requireCanonicalStrings(verification[field]); err != nil {
			return fmt.Errorf("/verificationRules/%s: %w", field, err)
		}
	}
	if privacy, ok := document["privacy"].(map[string]any); ok {
		if err := requireCanonicalStrings(privacy["allowedRegions"]); err != nil {
			return fmt.Errorf("/privacy/allowedRegions: %w", err)
		}
	}
	if err := validateBudgetOrder(document); err != nil {
		return err
	}
	return validateTargetOrder(document)
}

func validateBudgetOrder(document map[string]any) error {
	budget, _ := document["budgetCeiling"].(map[string]any)
	for _, definition := range []struct {
		field    string
		identity string
	}{{"usageLimits", "unit"}, {"costLimits", "currency"}} {
		values, _ := budget[definition.field].([]any)
		identities := make([]any, 0, len(values))
		for _, raw := range values {
			entry, _ := raw.(map[string]any)
			identities = append(identities, entry[definition.identity])
		}
		if err := requireCanonicalStrings(identities); err != nil {
			return fmt.Errorf("/budgetCeiling/%s: %w", definition.field, err)
		}
	}
	return nil
}

func validateTargetOrder(document map[string]any) error {
	rules, _ := document["capabilityRules"].([]any)
	for ruleIndex, raw := range rules {
		rule, _ := raw.(map[string]any)
		scope, _ := rule["targetScope"].(map[string]any)
		targets, _ := scope["targets"].([]any)
		identities := make([]any, 0, len(targets))
		for _, targetRaw := range targets {
			target, _ := targetRaw.(map[string]any)
			identities = append(identities, fmt.Sprintf("%s\x00%s", target["kind"], target["id"]))
		}
		if err := requireCanonicalStrings(identities); err != nil {
			return fmt.Errorf("/capabilityRules/%d/targetScope/targets: %w", ruleIndex, err)
		}
	}
	return nil
}

func requireCanonicalStrings(value any) error {
	values, ok := value.([]any)
	if !ok {
		return errors.New("expected a string array")
	}
	stringsValue := make([]string, len(values))
	for index, raw := range values {
		entry, ok := raw.(string)
		if !ok {
			return errors.New("expected a string array")
		}
		stringsValue[index] = entry
	}
	sorted := append([]string(nil), stringsValue...)
	sort.Strings(sorted)
	seen := make(map[string]struct{}, len(stringsValue))
	for index, entry := range stringsValue {
		if _, exists := seen[entry]; exists || entry != sorted[index] {
			return errors.New("values must be unique and use Unicode code-point order")
		}
		seen[entry] = struct{}{}
	}
	return nil
}

func rejectUnsafeKeys(value any, path string) error {
	switch current := value.(type) {
	case []any:
		for index, entry := range current {
			if err := rejectUnsafeKeys(entry, fmt.Sprintf("%s/%d", path, index)); err != nil {
				return err
			}
		}
	case map[string]any:
		for key, entry := range current {
			if key == "__proto__" {
				return fmt.Errorf("%s/__proto__: unsafe AgentPolicy object key", path)
			}
			if err := rejectUnsafeKeys(entry, path+"/"+key); err != nil {
				return err
			}
		}
	}
	return nil
}
