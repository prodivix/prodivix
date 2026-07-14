package workspace

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/pircontract"
)

var ErrPIRValidationFailed = errors.New("PIR wire validation failed")

func validatePIRDocument(payload json.RawMessage) error {
	if err := pircontract.ValidateDocument(payload); err != nil {
		return fmt.Errorf("%w: %v", ErrPIRValidationFailed, err)
	}
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return err
	}
	ui := document["ui"].(map[string]any)
	graph := ui["graph"].(map[string]any)
	rootID, ok := graph["rootId"].(string)
	if !ok {
		return fmt.Errorf("%w: ui.graph.rootId is invalid", ErrPIRValidationFailed)
	}
	nodesByID := graph["nodesById"].(map[string]any)
	if _, ok := nodesByID[rootID]; !ok {
		return fmt.Errorf("%w: rootId not found in nodesById", ErrPIRValidationFailed)
	}
	for key, rawNode := range nodesByID {
		node, ok := rawNode.(map[string]any)
		if !ok {
			return fmt.Errorf("%w: node %s must be object", ErrPIRValidationFailed, key)
		}
		if node["id"] != key {
			return fmt.Errorf("%w: node key/id mismatch at %s", ErrPIRValidationFailed, key)
		}
	}
	childIDsByID := graph["childIdsById"].(map[string]any)
	parentByChild := map[string]string{}
	for parentID, rawChildren := range childIDsByID {
		if _, ok := nodesByID[parentID]; !ok {
			return fmt.Errorf("%w: childIdsById owner %s not found", ErrPIRValidationFailed, parentID)
		}
		children, ok := rawChildren.([]any)
		if !ok {
			return fmt.Errorf("%w: childIdsById.%s must be array", ErrPIRValidationFailed, parentID)
		}
		for _, rawChildID := range children {
			childID, ok := rawChildID.(string)
			if !ok || childID == "" {
				return fmt.Errorf("%w: child id must be string", ErrPIRValidationFailed)
			}
			if _, ok := nodesByID[childID]; !ok {
				return fmt.Errorf("%w: child %s not found", ErrPIRValidationFailed, childID)
			}
			if previous, exists := parentByChild[childID]; exists {
				return fmt.Errorf("%w: child %s has multiple parents %s and %s", ErrPIRValidationFailed, childID, previous, parentID)
			}
			parentByChild[childID] = parentID
		}
	}
	visited := map[string]bool{}
	visiting := map[string]bool{}
	var visit func(string) error
	visit = func(nodeID string) error {
		if visiting[nodeID] {
			return fmt.Errorf("%w: cycle detected at %s", ErrPIRValidationFailed, nodeID)
		}
		if visited[nodeID] {
			return nil
		}
		visiting[nodeID] = true
		if rawChildren, ok := childIDsByID[nodeID]; ok {
			for _, rawChildID := range rawChildren.([]any) {
				if err := visit(rawChildID.(string)); err != nil {
					return err
				}
			}
		}
		delete(visiting, nodeID)
		visited[nodeID] = true
		return nil
	}
	if err := visit(rootID); err != nil {
		return err
	}
	for nodeID := range nodesByID {
		if !visited[nodeID] {
			return fmt.Errorf("%w: orphan node %s", ErrPIRValidationFailed, nodeID)
		}
	}
	return nil
}
