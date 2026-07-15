package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrDesignTokenValidationFailed         = errors.New("design token validation failed")
	ErrDesignTokenResolverValidationFailed = errors.New("design token resolver validation failed")
)

func validDesignTokenName(name string) bool {
	return name != "" && !strings.HasPrefix(name, "$") && !strings.ContainsAny(name, ".{}")
}

func validateOptionalDTCGString(source map[string]any, property string, nonEmpty bool) error {
	value, exists := source[property]
	if !exists {
		return nil
	}
	text, ok := value.(string)
	if !ok || (nonEmpty && strings.TrimSpace(text) == "") {
		return fmt.Errorf("%w: %s must be a string", ErrDesignTokenValidationFailed, property)
	}
	return nil
}

func validateDTCGMetadata(source map[string]any) error {
	if err := validateOptionalDTCGString(source, "$description", false); err != nil {
		return err
	}
	if err := validateOptionalDTCGString(source, "$type", true); err != nil {
		return err
	}
	if deprecated, exists := source["$deprecated"]; exists {
		switch deprecated.(type) {
		case bool, string:
		default:
			return fmt.Errorf("%w: $deprecated must be a boolean or string", ErrDesignTokenValidationFailed)
		}
	}
	if extensions, exists := source["$extensions"]; exists {
		if _, ok := extensions.(map[string]any); !ok {
			return fmt.Errorf("%w: $extensions must be an object", ErrDesignTokenValidationFailed)
		}
	}
	return nil
}

func validateDTCGToken(source map[string]any) error {
	_, hasValue := source["$value"]
	ref, hasReference := source["$ref"]
	if hasValue == hasReference {
		return fmt.Errorf("%w: a token must declare exactly one of $value or $ref", ErrDesignTokenValidationFailed)
	}
	if hasReference {
		text, ok := ref.(string)
		if !ok || strings.TrimSpace(text) == "" {
			return fmt.Errorf("%w: $ref must be a non-empty string", ErrDesignTokenValidationFailed)
		}
	}
	if err := validateDTCGMetadata(source); err != nil {
		return err
	}
	for property := range source {
		switch property {
		case "$value", "$ref", "$description", "$type", "$deprecated", "$extensions":
		default:
			return fmt.Errorf("%w: token property %s is not supported", ErrDesignTokenValidationFailed, property)
		}
	}
	return nil
}

func validateDTCGGroup(source map[string]any) error {
	if err := validateDTCGMetadata(source); err != nil {
		return err
	}
	if extends, exists := source["$extends"]; exists {
		text, ok := extends.(string)
		if !ok || strings.TrimSpace(text) == "" {
			return fmt.Errorf("%w: $extends must be a non-empty string", ErrDesignTokenValidationFailed)
		}
	}
	for name, value := range source {
		switch name {
		case "$description", "$type", "$extends", "$deprecated", "$extensions":
			continue
		}
		if name != "$root" && !validDesignTokenName(name) {
			return fmt.Errorf("%w: invalid token or group name %s", ErrDesignTokenValidationFailed, name)
		}
		child, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("%w: group children must be objects", ErrDesignTokenValidationFailed)
		}
		_, hasValue := child["$value"]
		_, hasReference := child["$ref"]
		if hasValue || hasReference {
			if err := validateDTCGToken(child); err != nil {
				return err
			}
			continue
		}
		if name == "$root" {
			return fmt.Errorf("%w: $root must be a token", ErrDesignTokenValidationFailed)
		}
		if err := validateDTCGGroup(child); err != nil {
			return err
		}
	}
	return nil
}

func validateDesignTokenDocument(payload json.RawMessage) error {
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return fmt.Errorf("%w: %v", ErrDesignTokenValidationFailed, err)
	}
	if document == nil {
		return fmt.Errorf("%w: document must be an object", ErrDesignTokenValidationFailed)
	}
	return validateDTCGGroup(document)
}

func validateResolverSources(value any) error {
	sources, ok := value.([]any)
	if !ok {
		return fmt.Errorf("%w: sources must be an array", ErrDesignTokenResolverValidationFailed)
	}
	for _, value := range sources {
		source, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("%w: each source must be an object", ErrDesignTokenResolverValidationFailed)
		}
		if reference, exists := source["$ref"]; exists {
			text, ok := reference.(string)
			if !ok || strings.TrimSpace(text) == "" {
				return fmt.Errorf("%w: source $ref must be a non-empty string", ErrDesignTokenResolverValidationFailed)
			}
			continue
		}
		if err := validateDTCGGroup(source); err != nil {
			return fmt.Errorf("%w: %v", ErrDesignTokenResolverValidationFailed, err)
		}
	}
	return nil
}

func validateResolverSet(source map[string]any, inline bool) error {
	if err := validateResolverSources(source["sources"]); err != nil {
		return err
	}
	for property, value := range source {
		switch property {
		case "sources":
		case "description":
			if _, ok := value.(string); !ok {
				return fmt.Errorf("%w: set description must be a string", ErrDesignTokenResolverValidationFailed)
			}
		case "$extensions":
			if _, ok := value.(map[string]any); !ok {
				return fmt.Errorf("%w: set $extensions must be an object", ErrDesignTokenResolverValidationFailed)
			}
		case "name", "type":
			if !inline {
				return fmt.Errorf("%w: named sets must not declare %s", ErrDesignTokenResolverValidationFailed, property)
			}
		default:
			return fmt.Errorf("%w: unsupported set property %s", ErrDesignTokenResolverValidationFailed, property)
		}
	}
	return nil
}

func validateResolverModifier(source map[string]any, inline bool) error {
	contexts, ok := source["contexts"].(map[string]any)
	if !ok || len(contexts) == 0 {
		return fmt.Errorf("%w: modifier contexts must be a non-empty object", ErrDesignTokenResolverValidationFailed)
	}
	for name, value := range contexts {
		if strings.TrimSpace(name) == "" {
			return fmt.Errorf("%w: modifier context names must be non-empty", ErrDesignTokenResolverValidationFailed)
		}
		if err := validateResolverSources(value); err != nil {
			return err
		}
	}
	if defaultValue, exists := source["default"]; exists {
		defaultName, ok := defaultValue.(string)
		if !ok {
			return fmt.Errorf("%w: modifier default must be a string", ErrDesignTokenResolverValidationFailed)
		}
		matched := false
		for contextName := range contexts {
			if strings.EqualFold(contextName, defaultName) {
				matched = true
				break
			}
		}
		if !matched {
			return fmt.Errorf("%w: modifier default must name a context", ErrDesignTokenResolverValidationFailed)
		}
	}
	for property, value := range source {
		switch property {
		case "contexts", "default":
		case "description":
			if _, ok := value.(string); !ok {
				return fmt.Errorf("%w: modifier description must be a string", ErrDesignTokenResolverValidationFailed)
			}
		case "$extensions":
			if _, ok := value.(map[string]any); !ok {
				return fmt.Errorf("%w: modifier $extensions must be an object", ErrDesignTokenResolverValidationFailed)
			}
		case "name", "type":
			if !inline {
				return fmt.Errorf("%w: named modifiers must not declare %s", ErrDesignTokenResolverValidationFailed, property)
			}
		default:
			return fmt.Errorf("%w: unsupported modifier property %s", ErrDesignTokenResolverValidationFailed, property)
		}
	}
	return nil
}

func validateDesignTokenResolverDocument(payload json.RawMessage) error {
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return fmt.Errorf("%w: %v", ErrDesignTokenResolverValidationFailed, err)
	}
	if document == nil || document["version"] != "2025.10" {
		return fmt.Errorf("%w: version must be 2025.10", ErrDesignTokenResolverValidationFailed)
	}
	if setsValue, exists := document["sets"]; exists {
		sets, ok := setsValue.(map[string]any)
		if !ok {
			return fmt.Errorf("%w: sets must be an object", ErrDesignTokenResolverValidationFailed)
		}
		for name, value := range sets {
			set, ok := value.(map[string]any)
			if strings.TrimSpace(name) == "" || !ok {
				return fmt.Errorf("%w: each set must have a non-empty name and object value", ErrDesignTokenResolverValidationFailed)
			}
			if err := validateResolverSet(set, false); err != nil {
				return err
			}
		}
	}
	if modifiersValue, exists := document["modifiers"]; exists {
		modifiers, ok := modifiersValue.(map[string]any)
		if !ok {
			return fmt.Errorf("%w: modifiers must be an object", ErrDesignTokenResolverValidationFailed)
		}
		for name, value := range modifiers {
			modifier, ok := value.(map[string]any)
			if strings.TrimSpace(name) == "" || !ok {
				return fmt.Errorf("%w: each modifier must have a non-empty name and object value", ErrDesignTokenResolverValidationFailed)
			}
			if err := validateResolverModifier(modifier, false); err != nil {
				return err
			}
		}
	}
	order, ok := document["resolutionOrder"].([]any)
	if !ok {
		return fmt.Errorf("%w: resolutionOrder must be an array", ErrDesignTokenResolverValidationFailed)
	}
	for _, value := range order {
		entry, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("%w: resolutionOrder entries must be objects", ErrDesignTokenResolverValidationFailed)
		}
		if reference, exists := entry["$ref"]; exists {
			text, ok := reference.(string)
			if !ok || strings.TrimSpace(text) == "" {
				return fmt.Errorf("%w: resolutionOrder $ref must be a non-empty string", ErrDesignTokenResolverValidationFailed)
			}
			continue
		}
		name, nameOK := entry["name"].(string)
		kind, kindOK := entry["type"].(string)
		if !nameOK || strings.TrimSpace(name) == "" || !kindOK {
			return fmt.Errorf("%w: inline resolutionOrder entries require name and type", ErrDesignTokenResolverValidationFailed)
		}
		if kind == "set" {
			if err := validateResolverSet(entry, true); err != nil {
				return err
			}
		} else if kind == "modifier" {
			if err := validateResolverModifier(entry, true); err != nil {
				return err
			}
		} else {
			return fmt.Errorf("%w: inline type must be set or modifier", ErrDesignTokenResolverValidationFailed)
		}
	}
	for property, value := range document {
		switch property {
		case "version", "sets", "modifiers", "resolutionOrder":
		case "name", "description", "$schema":
			if _, ok := value.(string); !ok {
				return fmt.Errorf("%w: %s must be a string", ErrDesignTokenResolverValidationFailed, property)
			}
		default:
			return fmt.Errorf("%w: unsupported root property %s", ErrDesignTokenResolverValidationFailed, property)
		}
	}
	return nil
}
