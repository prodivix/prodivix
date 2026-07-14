package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
)

var ErrAnimationValidationFailed = errors.New("Animation validation failed")

func validateAnimationDocument(payload json.RawMessage) error {
	if !isJSONObject(payload) {
		return animationValidationError("/ must be an object")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return animationValidationError("/ must be an object")
	}
	allowed := map[string]struct{}{
		"version":           {},
		"target":            {},
		"timelines":         {},
		"svgFilters":        {},
		"x-animationEditor": {},
	}
	for field := range fields {
		if _, exists := allowed[field]; !exists {
			return animationValidationError("/ contains unknown field %q", field)
		}
	}
	for _, field := range []string{"version", "target", "timelines"} {
		if _, exists := fields[field]; !exists {
			return animationValidationError("/%s is required", field)
		}
	}

	var version int
	if err := json.Unmarshal(fields["version"], &version); err != nil || version != 1 {
		return animationValidationError("/version must equal 1")
	}
	if !isJSONObject(fields["target"]) {
		return animationValidationError("/target must be an object")
	}
	var target map[string]json.RawMessage
	if err := json.Unmarshal(fields["target"], &target); err != nil {
		return animationValidationError("/target must be an object")
	}
	if len(target) != 2 {
		return animationValidationError("/target must contain only kind and documentId")
	}
	var kind string
	if err := json.Unmarshal(target["kind"], &kind); err != nil || kind != "pir-document" {
		return animationValidationError("/target/kind must equal pir-document")
	}
	if _, err := decodeNodeGraphCanonicalString(target["documentId"], "/target/documentId"); err != nil {
		return animationValidationError("/target/documentId must be a canonical non-empty string")
	}
	if !isJSONArray(fields["timelines"]) {
		return animationValidationError("/timelines must be an array")
	}
	if svgFilters, exists := fields["svgFilters"]; exists && !isJSONArray(svgFilters) {
		return animationValidationError("/svgFilters must be an array")
	}
	if editor, exists := fields["x-animationEditor"]; exists && !isJSONObject(editor) {
		return animationValidationError("/x-animationEditor must be an object")
	}
	return nil
}

func animationValidationError(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrAnimationValidationFailed, fmt.Sprintf(format, args...))
}
