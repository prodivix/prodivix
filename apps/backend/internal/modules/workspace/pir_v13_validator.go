package workspace

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/pircontract"
)

var ErrPIRV13ValidationFailed = errors.New("PIR " + pircontract.CurrentLabel + " validation failed")

func validatePIRV13Document(payload json.RawMessage) error {
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return err
	}
	if document["version"] != pircontract.CurrentVersion {
		return fmt.Errorf("%w: version must be %s", ErrPIRV13ValidationFailed, pircontract.CurrentVersion)
	}
	ui, ok := document["ui"].(map[string]any)
	if !ok {
		return fmt.Errorf("%w: ui is required", ErrPIRV13ValidationFailed)
	}
	if _, hasRoot := ui["root"]; hasRoot {
		return fmt.Errorf("%w: ui.root is forbidden", ErrPIRV13ValidationFailed)
	}
	graph, ok := ui["graph"].(map[string]any)
	if !ok {
		return fmt.Errorf("%w: ui.graph is required", ErrPIRV13ValidationFailed)
	}
	rootID, ok := graph["rootId"].(string)
	if !ok || rootID == "" {
		return fmt.Errorf("%w: ui.graph.rootId is required", ErrPIRV13ValidationFailed)
	}
	nodesByID, ok := graph["nodesById"].(map[string]any)
	if !ok || len(nodesByID) == 0 {
		return fmt.Errorf("%w: ui.graph.nodesById is required", ErrPIRV13ValidationFailed)
	}
	if _, ok := nodesByID[rootID]; !ok {
		return fmt.Errorf("%w: rootId not found in nodesById", ErrPIRV13ValidationFailed)
	}
	for key, rawNode := range nodesByID {
		node, ok := rawNode.(map[string]any)
		if !ok {
			return fmt.Errorf("%w: node %s must be object", ErrPIRV13ValidationFailed, key)
		}
		if node["id"] != key {
			return fmt.Errorf("%w: node key/id mismatch at %s", ErrPIRV13ValidationFailed, key)
		}
		if nodeType, ok := node["type"].(string); !ok || nodeType == "" {
			return fmt.Errorf("%w: node %s type is required", ErrPIRV13ValidationFailed, key)
		}
		if _, hasChildren := node["children"]; hasChildren {
			return fmt.Errorf("%w: node %s must not contain children", ErrPIRV13ValidationFailed, key)
		}
	}
	childIDsByID, _ := graph["childIdsById"].(map[string]any)
	parentByChild := map[string]string{}
	for parentID, rawChildren := range childIDsByID {
		if _, ok := nodesByID[parentID]; !ok {
			return fmt.Errorf("%w: childIdsById owner %s not found", ErrPIRV13ValidationFailed, parentID)
		}
		children, ok := rawChildren.([]any)
		if !ok {
			return fmt.Errorf("%w: childIdsById.%s must be array", ErrPIRV13ValidationFailed, parentID)
		}
		for _, rawChildID := range children {
			childID, ok := rawChildID.(string)
			if !ok || childID == "" {
				return fmt.Errorf("%w: child id must be string", ErrPIRV13ValidationFailed)
			}
			if _, ok := nodesByID[childID]; !ok {
				return fmt.Errorf("%w: child %s not found", ErrPIRV13ValidationFailed, childID)
			}
			if previous, exists := parentByChild[childID]; exists {
				return fmt.Errorf("%w: child %s has multiple parents %s and %s", ErrPIRV13ValidationFailed, childID, previous, parentID)
			}
			parentByChild[childID] = parentID
		}
	}
	visited := map[string]bool{}
	visiting := map[string]bool{}
	var visit func(string) error
	visit = func(nodeID string) error {
		if visiting[nodeID] {
			return fmt.Errorf("%w: cycle detected at %s", ErrPIRV13ValidationFailed, nodeID)
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
			return fmt.Errorf("%w: orphan node %s", ErrPIRV13ValidationFailed, nodeID)
		}
	}
	return nil
}
