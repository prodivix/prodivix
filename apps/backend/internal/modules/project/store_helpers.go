package project

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/pircontract"
)

var defaultPIRDocument = pircontract.DefaultDocument()

func ParsePositiveInt(value string, fallback int) int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(trimmed)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func normalizePIR(pir json.RawMessage) (json.RawMessage, error) {
	if len(pir) == 0 || strings.TrimSpace(string(pir)) == "" {
		return defaultPIRDocument, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(pir, &payload); err != nil {
		return nil, err
	}
	if payload["version"] != pircontract.CurrentVersion {
		return nil, errors.New("PIR document version must be " + pircontract.CurrentVersion)
	}
	ui, ok := payload["ui"].(map[string]any)
	if !ok {
		return nil, errors.New("PIR document ui.graph is required")
	}
	if _, hasRoot := ui["root"]; hasRoot {
		return nil, errors.New("PIR " + pircontract.CurrentLabel + " must not contain ui.root")
	}
	graph, ok := ui["graph"].(map[string]any)
	if !ok {
		return nil, errors.New("PIR document ui.graph is required")
	}
	if _, ok := graph["nodesById"].(map[string]any); !ok {
		return nil, errors.New("PIR document ui.graph.nodesById is required")
	}
	normalized, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeResourceType(resourceType ResourceType) ResourceType {
	return ResourceType(strings.TrimSpace(strings.ToLower(string(resourceType))))
}

func isValidResourceType(resourceType ResourceType) bool {
	switch resourceType {
	case ResourceTypeProject, ResourceTypeComponent, ResourceTypeNodeGraph:
		return true
	default:
		return false
	}
}
