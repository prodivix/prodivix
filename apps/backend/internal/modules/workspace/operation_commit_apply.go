package workspace

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type workspaceCommitDocumentProjection struct {
	ID           string                `json:"id"`
	Type         WorkspaceDocumentType `json:"type"`
	Name         string                `json:"name,omitempty"`
	Path         string                `json:"path"`
	ContentRev   int64                 `json:"contentRev"`
	MetaRev      int64                 `json:"metaRev"`
	Content      json.RawMessage       `json:"content"`
	Capabilities []string              `json:"capabilities,omitempty"`
	UpdatedAt    *time.Time            `json:"updatedAt,omitempty"`
}

type workspaceCommitProjection struct {
	TreeRootID string                                       `json:"treeRootId"`
	TreeByID   map[string]workspaceVFSNode                  `json:"treeById"`
	DocsByID   map[string]workspaceCommitDocumentProjection `json:"docsById"`
}

type workspaceCommitState struct {
	WorkspaceID   string
	TreeRootID    string
	TreeByID      map[string]workspaceVFSNode
	RouteManifest json.RawMessage
	Documents     map[string]WorkspaceDocumentRecord
}

func newWorkspaceCommitState(
	workspace WorkspaceRecord,
	routeManifest json.RawMessage,
	documents []WorkspaceDocumentRecord,
) (*workspaceCommitState, error) {
	tree, err := parseWorkspaceVFSTree(workspace.Tree, workspace.TreeRootID, documents)
	if err != nil {
		return nil, err
	}
	documentsByID := make(map[string]WorkspaceDocumentRecord, len(documents))
	for _, document := range documents {
		documentsByID[document.ID] = cloneWorkspaceDocumentRecord(document)
	}
	return &workspaceCommitState{
		WorkspaceID:   workspace.ID,
		TreeRootID:    tree.TreeRootID,
		TreeByID:      cloneWorkspaceTreeByID(tree.TreeByID),
		RouteManifest: append(json.RawMessage(nil), routeManifest...),
		Documents:     documentsByID,
	}, nil
}

func cloneWorkspaceTreeByID(source map[string]workspaceVFSNode) map[string]workspaceVFSNode {
	result := make(map[string]workspaceVFSNode, len(source))
	for id, node := range source {
		node.Children = append([]string(nil), node.Children...)
		if node.ParentID != nil {
			parentID := *node.ParentID
			node.ParentID = &parentID
		}
		result[id] = node
	}
	return result
}

func cloneWorkspaceDocumentRecord(document WorkspaceDocumentRecord) WorkspaceDocumentRecord {
	document.Content = append(json.RawMessage(nil), document.Content...)
	document.Capabilities = append([]string(nil), document.Capabilities...)
	return document
}

func cloneWorkspaceCommitDocuments(source map[string]WorkspaceDocumentRecord) map[string]WorkspaceDocumentRecord {
	result := make(map[string]WorkspaceDocumentRecord, len(source))
	for id, document := range source {
		result[id] = cloneWorkspaceDocumentRecord(document)
	}
	return result
}

func (state *workspaceCommitState) apply(commands []WorkspaceCommandEnvelope) error {
	for index, command := range commands {
		var err error
		if strings.TrimSpace(command.Target.DocumentID) != "" {
			err = state.applyDocumentCommand(command)
		} else if commitCommandDomain(command) == "route" {
			err = state.applyRouteCommand(command)
		} else {
			err = state.applyWorkspaceCommand(command)
		}
		if err != nil {
			return fmt.Errorf("command %d (%s): %w", index, command.ID, err)
		}
	}
	return state.validate()
}

func (state *workspaceCommitState) applyDocumentCommand(command WorkspaceCommandEnvelope) error {
	documentID := strings.TrimSpace(command.Target.DocumentID)
	document, ok := state.Documents[documentID]
	if !ok {
		return ErrWorkspaceDocumentNotFound
	}
	domain := strings.TrimSpace(strings.ToLower(command.DomainHint))
	if domain == "" {
		domain = commitNamespaceDomain(command.Namespace)
	}
	isResourceDocument := document.Type == WorkspaceDocumentTypeAsset || document.Type == WorkspaceDocumentTypeProjectConfig
	if (domain == "resource") != isResourceDocument {
		return errors.New("resource commands may target only asset or project-config documents")
	}
	patched, err := applyWorkspaceDocumentPatch(document.Type, document.Content, command.ForwardOps)
	if err != nil {
		return err
	}
	if err := validateWorkspaceDocumentContent(document.Type, patched); err != nil {
		return err
	}
	reversed, err := applyWorkspaceDocumentPatch(document.Type, patched, command.ReverseOps)
	if err != nil {
		return err
	}
	if !jsonBytesEqual(document.Content, reversed) {
		return errors.New("command.reverseOps do not restore original document")
	}
	document.Content = patched
	state.Documents[documentID] = document
	return nil
}

func validateCommitRoutePatchPath(path string) error {
	pointer, err := parseJSONPointer(path)
	if err != nil {
		return err
	}
	if len(pointer) == 0 || (pointer[0] != "routeManifest" && !(len(pointer) == 1 && (pointer[0] == "activeDocumentId" || pointer[0] == "activeRouteNodeId"))) {
		return errors.New("route commands may change only routeManifest or ephemeral active selections")
	}
	return nil
}

func isPersistentCommitRoutePath(path string) bool {
	pointer, err := parseJSONPointer(path)
	return err == nil && len(pointer) > 0 && pointer[0] == "routeManifest"
}

func persistentRoutePatchOps(operations []WorkspacePatchOp) []WorkspacePatchOp {
	result := make([]WorkspacePatchOp, 0, len(operations))
	for _, operation := range operations {
		if isPersistentCommitRoutePath(operation.Path) {
			result = append(result, operation)
		}
	}
	return result
}

func (state *workspaceCommitState) applyRouteCommand(command WorkspaceCommandEnvelope) error {
	before, err := json.Marshal(map[string]json.RawMessage{"routeManifest": state.RouteManifest})
	if err != nil {
		return err
	}
	patched, err := applyWorkspacePatchWithValidator(before, persistentRoutePatchOps(command.ForwardOps), validateCommitRoutePatchPath)
	if err != nil {
		return err
	}
	reversed, err := applyWorkspacePatchWithValidator(patched, persistentRoutePatchOps(command.ReverseOps), validateCommitRoutePatchPath)
	if err != nil {
		return err
	}
	if !jsonBytesEqual(before, reversed) {
		return errors.New("command.reverseOps do not restore original route manifest")
	}
	var projection struct {
		RouteManifest json.RawMessage `json:"routeManifest"`
	}
	decoder := json.NewDecoder(bytes.NewReader(patched))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&projection); err != nil {
		return err
	}
	manifest, err := normalizeRouteManifestDocument(projection.RouteManifest)
	if err != nil {
		return err
	}
	state.RouteManifest = manifest
	return nil
}

func validateCommitWorkspacePatchPath(path string) error {
	pointer, err := parseJSONPointer(path)
	if err != nil {
		return err
	}
	if len(pointer) == 1 && pointer[0] == "treeRootId" {
		return nil
	}
	if len(pointer) >= 1 && pointer[0] == "treeById" {
		return nil
	}
	if len(pointer) == 1 && (pointer[0] == "activeDocumentId" || pointer[0] == "activeRouteNodeId") {
		return nil
	}
	if len(pointer) == 2 && pointer[0] == "docsById" && strings.TrimSpace(pointer[1]) != "" {
		return nil
	}
	if len(pointer) >= 3 && pointer[0] == "docsById" && (pointer[2] == "name" || pointer[2] == "path" || pointer[2] == "capabilities") {
		return nil
	}
	return errors.New("workspace commands may change only treeRootId, treeById, or document metadata")
}

func (state *workspaceCommitState) projection() workspaceCommitProjection {
	documents := make(map[string]workspaceCommitDocumentProjection, len(state.Documents))
	for id, document := range state.Documents {
		projection := workspaceCommitDocumentProjection{
			ID:           document.ID,
			Type:         document.Type,
			Name:         document.Name,
			Path:         document.Path,
			ContentRev:   document.ContentRev,
			MetaRev:      document.MetaRev,
			Content:      append(json.RawMessage(nil), document.Content...),
			Capabilities: append([]string(nil), document.Capabilities...),
		}
		if !document.UpdatedAt.IsZero() {
			updatedAt := document.UpdatedAt.UTC()
			projection.UpdatedAt = &updatedAt
		}
		documents[id] = projection
	}
	return workspaceCommitProjection{
		TreeRootID: state.TreeRootID,
		TreeByID:   cloneWorkspaceTreeByID(state.TreeByID),
		DocsByID:   documents,
	}
}

func persistentWorkspacePatchOps(operations []WorkspacePatchOp) []WorkspacePatchOp {
	result := make([]WorkspacePatchOp, 0, len(operations))
	for _, operation := range operations {
		pointer, err := parseJSONPointer(operation.Path)
		if err == nil && len(pointer) == 1 && (pointer[0] == "activeDocumentId" || pointer[0] == "activeRouteNodeId") {
			continue
		}
		result = append(result, operation)
	}
	return result
}

func (state *workspaceCommitState) applyWorkspaceCommand(command WorkspaceCommandEnvelope) error {
	before, err := json.Marshal(state.projection())
	if err != nil {
		return err
	}
	patched, err := applyWorkspacePatchWithValidator(before, persistentWorkspacePatchOps(command.ForwardOps), validateCommitWorkspacePatchPath)
	if err != nil {
		return err
	}
	reversed, err := applyWorkspacePatchWithValidator(patched, persistentWorkspacePatchOps(command.ReverseOps), validateCommitWorkspacePatchPath)
	if err != nil {
		return err
	}
	if !jsonBytesEqual(before, reversed) {
		return errors.New("command.reverseOps do not restore original workspace projection")
	}
	projection, err := decodeWorkspaceCommitProjection(patched)
	if err != nil {
		return err
	}
	state.TreeRootID = projection.TreeRootID
	state.TreeByID = projection.TreeByID
	documents := make(map[string]WorkspaceDocumentRecord, len(projection.DocsByID))
	for id, projected := range projection.DocsByID {
		updatedAt := time.Time{}
		if projected.UpdatedAt != nil {
			updatedAt = projected.UpdatedAt.UTC()
		}
		documents[id] = WorkspaceDocumentRecord{
			WorkspaceID:  state.WorkspaceID,
			ID:           projected.ID,
			Type:         projected.Type,
			Name:         projected.Name,
			Path:         projected.Path,
			ContentRev:   projected.ContentRev,
			MetaRev:      projected.MetaRev,
			Content:      projected.Content,
			Capabilities: append([]string(nil), projected.Capabilities...),
			UpdatedAt:    updatedAt,
		}
	}
	state.Documents = documents
	return nil
}

func decodeWorkspaceCommitProjection(payload json.RawMessage) (workspaceCommitProjection, error) {
	var raw struct {
		TreeRootID string                     `json:"treeRootId"`
		TreeByID   map[string]json.RawMessage `json:"treeById"`
		DocsByID   map[string]json.RawMessage `json:"docsById"`
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil {
		return workspaceCommitProjection{}, err
	}
	projection := workspaceCommitProjection{
		TreeRootID: raw.TreeRootID,
		TreeByID:   make(map[string]workspaceVFSNode, len(raw.TreeByID)),
		DocsByID:   make(map[string]workspaceCommitDocumentProjection, len(raw.DocsByID)),
	}
	if !isCanonicalWorkspaceVFSID(projection.TreeRootID) {
		return workspaceCommitProjection{}, errors.New("treeRootId must be a non-empty canonical id")
	}
	if len(raw.DocsByID) == 0 {
		return workspaceCommitProjection{}, errors.New("workspace must contain at least one document")
	}
	for id, nodePayload := range raw.TreeByID {
		if !isCanonicalWorkspaceVFSID(id) {
			return workspaceCommitProjection{}, fmt.Errorf("tree node map key %q must be a non-empty canonical id", id)
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(nodePayload, &fields); err != nil {
			return workspaceCommitProjection{}, fmt.Errorf("tree node %s: %w", id, err)
		}
		for _, field := range []string{"id", "kind", "name", "parentId"} {
			if _, exists := fields[field]; !exists {
				return workspaceCommitProjection{}, fmt.Errorf("tree node %s field %s is required", id, field)
			}
		}
		var node workspaceVFSNode
		decoder := json.NewDecoder(bytes.NewReader(nodePayload))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&node); err != nil {
			return workspaceCommitProjection{}, fmt.Errorf("tree node %s: %w", id, err)
		}
		if !isCanonicalWorkspaceVFSID(node.ID) || node.ID != id {
			return workspaceCommitProjection{}, fmt.Errorf("tree node %s id must be canonical and match its map key", id)
		}
		if id == projection.TreeRootID {
			if node.ParentID != nil {
				return workspaceCommitProjection{}, fmt.Errorf("root tree node %s parentId must be null", id)
			}
		} else if node.ParentID == nil || !isCanonicalWorkspaceVFSID(*node.ParentID) {
			return workspaceCommitProjection{}, fmt.Errorf("tree node %s parentId must be a non-empty canonical id", id)
		}
		switch node.Kind {
		case "dir":
			children, exists := fields["children"]
			if !exists || bytes.Equal(bytes.TrimSpace(children), []byte("null")) {
				return workspaceCommitProjection{}, fmt.Errorf("directory tree node %s must declare a children array", id)
			}
			if _, exists := fields["docId"]; exists {
				return workspaceCommitProjection{}, fmt.Errorf("directory tree node %s cannot declare docId", id)
			}
			for index, childID := range node.Children {
				if !isCanonicalWorkspaceVFSID(childID) {
					return workspaceCommitProjection{}, fmt.Errorf("directory tree node %s child %d must be a non-empty canonical id", id, index)
				}
			}
		case "doc":
			if _, exists := fields["children"]; exists {
				return workspaceCommitProjection{}, fmt.Errorf("document tree node %s cannot declare children", id)
			}
			if _, exists := fields["docId"]; !exists {
				return workspaceCommitProjection{}, fmt.Errorf("document tree node %s must declare docId", id)
			}
			if !isCanonicalWorkspaceVFSID(node.DocID) {
				return workspaceCommitProjection{}, fmt.Errorf("document tree node %s docId must be a non-empty canonical id", id)
			}
		default:
			return workspaceCommitProjection{}, fmt.Errorf("tree node %s kind is invalid", id)
		}
		projection.TreeByID[id] = node
	}
	for id, documentPayload := range raw.DocsByID {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(documentPayload, &fields); err != nil {
			return workspaceCommitProjection{}, fmt.Errorf("document %s: %w", id, err)
		}
		for _, field := range []string{"id", "type", "path", "contentRev", "metaRev", "content"} {
			if _, exists := fields[field]; !exists {
				return workspaceCommitProjection{}, fmt.Errorf("document %s field %s is required", id, field)
			}
		}
		for _, field := range []string{"name", "capabilities", "updatedAt"} {
			if value, exists := fields[field]; exists && isExplicitJSONNull(value) {
				return workspaceCommitProjection{}, fmt.Errorf("document %s field %s cannot be null", id, field)
			}
		}
		if rawName, exists := fields["name"]; exists {
			var name string
			if err := json.Unmarshal(rawName, &name); err != nil || strings.TrimSpace(name) == "" {
				return workspaceCommitProjection{}, fmt.Errorf("document %s field name must be a non-empty string when present", id)
			}
		}
		var document workspaceCommitDocumentProjection
		decoder := json.NewDecoder(bytes.NewReader(documentPayload))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&document); err != nil {
			return workspaceCommitProjection{}, fmt.Errorf("document %s: %w", id, err)
		}
		if !isCanonicalWorkspaceVFSID(id) || document.ID != id || !isCanonicalWorkspaceVFSID(document.ID) {
			return workspaceCommitProjection{}, fmt.Errorf("document %s id does not match docsById key", id)
		}
		projection.DocsByID[id] = document
	}
	return projection, nil
}

func (state *workspaceCommitState) validate() error {
	paths := make(map[string]string, len(state.Documents))
	for id, document := range state.Documents {
		if !isCanonicalWorkspaceVFSID(id) || document.ID != id || !isCanonicalWorkspaceVFSID(document.ID) || !isValidWorkspaceDocumentType(document.Type) {
			return fmt.Errorf("%w: document id or type is invalid", ErrWorkspaceVFSInvalid)
		}
		if document.Name != "" && strings.TrimSpace(document.Name) == "" {
			return fmt.Errorf("%w: workspace document name must be non-empty when present", ErrWorkspaceVFSInvalid)
		}
		path, err := normalizeWorkspacePath(document.Path)
		if err != nil {
			return err
		}
		if previous, exists := paths[normalizeComparablePath(path)]; exists {
			return fmt.Errorf("%w: documents %s and %s share a path", ErrWorkspaceVFSInvalid, previous, id)
		}
		paths[normalizeComparablePath(path)] = id
		if path != document.Path {
			return fmt.Errorf("%w: document path must be canonical", ErrWorkspaceVFSInvalid)
		}
		if document.ContentRev <= 0 || document.MetaRev <= 0 || document.ContentRev > maxJSONSafeInteger || document.MetaRev > maxJSONSafeInteger {
			return fmt.Errorf("%w: document revisions must be positive JSON safe integers", ErrWorkspaceVFSInvalid)
		}
		if err := validateWorkspaceDocumentContent(document.Type, document.Content); err != nil {
			return err
		}
		if document.Capabilities != nil && len(document.Capabilities) == 0 {
			return fmt.Errorf("%w: empty capabilities must be omitted", ErrWorkspaceVFSInvalid)
		}
		capabilities, err := normalizeWorkspaceCapabilities(document.Capabilities)
		if err != nil {
			return err
		}
		if !stringSlicesEqual(capabilities, document.Capabilities) {
			return fmt.Errorf("%w: workspace document capabilities must be trimmed, sorted, and unique", ErrWorkspaceVFSInvalid)
		}
		state.Documents[id] = document
	}
	if err := validateWorkspaceVFSState(workspaceVFSTree{
		TreeRootID: state.TreeRootID,
		TreeByID:   state.TreeByID,
	}, state.Documents); err != nil {
		return err
	}
	return validateWorkspaceRouteDocumentReferences(state.RouteManifest, state.Documents)
}
