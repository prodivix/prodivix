package workspace

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"
)

type workspaceVFSNode struct {
	ID       string   `json:"id"`
	Kind     string   `json:"kind"`
	Name     string   `json:"name"`
	ParentID *string  `json:"parentId"`
	Children []string `json:"children,omitempty"`
	DocID    string   `json:"docId,omitempty"`
}

// MarshalJSON keeps the canonical VFS wire shape discriminated by node kind:
// directories always carry an array (including []), while documents carry a
// docId and never serialize a nullable children field.
func (node workspaceVFSNode) MarshalJSON() ([]byte, error) {
	type commonNode struct {
		ID       string  `json:"id"`
		Kind     string  `json:"kind"`
		Name     string  `json:"name"`
		ParentID *string `json:"parentId"`
	}
	common := commonNode{
		ID:       node.ID,
		Kind:     node.Kind,
		Name:     node.Name,
		ParentID: node.ParentID,
	}
	if node.Kind == "dir" {
		children := node.Children
		if children == nil {
			children = []string{}
		}
		return json.Marshal(struct {
			commonNode
			Children []string `json:"children"`
		}{commonNode: common, Children: children})
	}
	return json.Marshal(struct {
		commonNode
		DocID string `json:"docId,omitempty"`
	}{commonNode: common, DocID: node.DocID})
}

type workspaceVFSTree struct {
	TreeRootID string                      `json:"treeRootId"`
	TreeByID   map[string]workspaceVFSNode `json:"treeById"`
}

type codeDocumentMount struct {
	DocumentID string
	NodeID     string
	ParentID   string
	Path       string
	Name       string
}

type workspaceDirectoryMount struct {
	NodeID   string
	ParentID string
	Name     string
}

var nonIdentifierPathChars = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

func normalizeWorkspacePath(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("%w: workspace document path is required", ErrWorkspaceVFSInvalid)
	}
	normalized := path.Clean("/" + strings.TrimLeft(strings.ReplaceAll(trimmed, "\\", "/"), "/"))
	if normalized == "/" {
		return "", fmt.Errorf("%w: workspace document path must include a file name", ErrWorkspaceVFSInvalid)
	}
	return normalized, nil
}

func normalizeComparablePath(value string) string {
	normalized, err := normalizeWorkspacePath(value)
	if err != nil {
		return strings.TrimSpace(value)
	}
	return normalized
}

func workspacePathName(value string) string {
	name := path.Base(value)
	if name == "." || name == "/" {
		return ""
	}
	return name
}

func normalizeWorkspaceDirectoryName(value string) (string, error) {
	name := strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if name == "" || strings.Contains(name, "/") || name == "." || name == ".." {
		return "", fmt.Errorf("%w: directory name is invalid", ErrWorkspaceVFSInvalid)
	}
	return name, nil
}

func makeTreeString(value string) *string {
	result := value
	return &result
}

func makePathNodeID(prefix string, segments []string) string {
	if len(segments) == 0 {
		return prefix
	}
	parts := make([]string, 0, len(segments))
	for _, segment := range segments {
		clean := strings.Trim(nonIdentifierPathChars.ReplaceAllString(segment, "_"), "_")
		if clean == "" {
			clean = "item"
		}
		parts = append(parts, clean)
	}
	return prefix + "_" + strings.Join(parts, "_")
}

func defaultWorkspaceVFSTree(rootID string) workspaceVFSTree {
	if strings.TrimSpace(rootID) == "" {
		rootID = "root"
	}
	return workspaceVFSTree{
		TreeRootID: rootID,
		TreeByID: map[string]workspaceVFSNode{
			rootID: {
				ID:       rootID,
				Kind:     "dir",
				Name:     "/",
				ParentID: nil,
				Children: []string{"dir_public", "dir_scripts", "dir_styles", "dir_shaders"},
			},
			"dir_public": {
				ID:       "dir_public",
				Kind:     "dir",
				Name:     "public",
				ParentID: makeTreeString(rootID),
				Children: []string{"dir_public_images", "dir_public_fonts", "dir_public_icons"},
			},
			"dir_public_images": {
				ID:       "dir_public_images",
				Kind:     "dir",
				Name:     "images",
				ParentID: makeTreeString("dir_public"),
				Children: []string{},
			},
			"dir_public_fonts": {
				ID:       "dir_public_fonts",
				Kind:     "dir",
				Name:     "fonts",
				ParentID: makeTreeString("dir_public"),
				Children: []string{},
			},
			"dir_public_icons": {
				ID:       "dir_public_icons",
				Kind:     "dir",
				Name:     "icons",
				ParentID: makeTreeString("dir_public"),
				Children: []string{},
			},
			"dir_scripts": {
				ID:       "dir_scripts",
				Kind:     "dir",
				Name:     "scripts",
				ParentID: makeTreeString(rootID),
				Children: []string{},
			},
			"dir_styles": {
				ID:       "dir_styles",
				Kind:     "dir",
				Name:     "styles",
				ParentID: makeTreeString(rootID),
				Children: []string{},
			},
			"dir_shaders": {
				ID:       "dir_shaders",
				Kind:     "dir",
				Name:     "shaders",
				ParentID: makeTreeString(rootID),
				Children: []string{},
			},
		},
	}
}

func defaultWorkspaceTreeJSON(rootID string) json.RawMessage {
	tree := defaultWorkspaceVFSTree(rootID)
	payload, err := tree.marshal()
	if err != nil {
		panic(err)
	}
	return payload
}

func defaultWorkspaceTreeWithRootDocumentJSON(rootID string) json.RawMessage {
	tree := defaultWorkspaceVFSTree(rootID)
	root := tree.TreeByID[tree.TreeRootID]
	root.Children = append(root.Children, "doc_root_node")
	tree.TreeByID[tree.TreeRootID] = root
	tree.TreeByID["doc_root_node"] = workspaceVFSNode{
		ID:       "doc_root_node",
		Kind:     "doc",
		Name:     "pir.json",
		ParentID: makeTreeString(tree.TreeRootID),
		DocID:    "doc_root",
	}
	payload, err := tree.marshal()
	if err != nil {
		panic(err)
	}
	return payload
}

func isCanonicalWorkspaceVFSID(value string) bool {
	return value != "" && value == strings.TrimSpace(value)
}

func indexWorkspaceVFSDocuments(documents []WorkspaceDocumentRecord) (map[string]WorkspaceDocumentRecord, error) {
	if len(documents) == 0 {
		return nil, fmt.Errorf("%w: workspace must contain at least one document", ErrWorkspaceVFSInvalid)
	}
	documentsByID := make(map[string]WorkspaceDocumentRecord, len(documents))
	for _, document := range documents {
		if !isCanonicalWorkspaceVFSID(document.ID) {
			return nil, fmt.Errorf("%w: workspace document ids must be non-empty canonical ids", ErrWorkspaceVFSInvalid)
		}
		if _, duplicate := documentsByID[document.ID]; duplicate {
			return nil, fmt.Errorf("%w: workspace document ids must be unique", ErrWorkspaceVFSInvalid)
		}
		documentsByID[document.ID] = document
	}
	return documentsByID, nil
}

// validateWorkspaceVFSState is the shared persistence-boundary validator for
// the canonical tree and its complete document mount set.
func validateWorkspaceVFSState(
	tree workspaceVFSTree,
	documents map[string]WorkspaceDocumentRecord,
) error {
	if len(documents) == 0 {
		return fmt.Errorf("%w: workspace must contain at least one document", ErrWorkspaceVFSInvalid)
	}
	for id, document := range documents {
		if !isCanonicalWorkspaceVFSID(id) || document.ID != id || !isCanonicalWorkspaceVFSID(document.ID) {
			return fmt.Errorf("%w: workspace document ids must be canonical and match their map keys", ErrWorkspaceVFSInvalid)
		}
	}

	root, ok := tree.TreeByID[tree.TreeRootID]
	if !isCanonicalWorkspaceVFSID(tree.TreeRootID) || !ok || root.Kind != "dir" || root.ParentID != nil {
		return fmt.Errorf("%w: workspace root must be a parentless directory with a canonical id", ErrWorkspaceVFSInvalid)
	}
	visited := make(map[string]struct{}, len(tree.TreeByID))
	documentNodes := make(map[string]string)
	var walk func(string, *string) error
	walk = func(nodeID string, expectedParent *string) error {
		if _, exists := visited[nodeID]; exists {
			return fmt.Errorf("%w: tree contains a cycle or duplicate child", ErrWorkspaceVFSInvalid)
		}
		node, exists := tree.TreeByID[nodeID]
		if !isCanonicalWorkspaceVFSID(nodeID) || !exists || node.ID != nodeID || !isCanonicalWorkspaceVFSID(node.ID) {
			return fmt.Errorf("%w: tree node ids must be canonical and match their map keys", ErrWorkspaceVFSInvalid)
		}
		if (expectedParent == nil) != (node.ParentID == nil) || (expectedParent != nil && node.ParentID != nil && *expectedParent != *node.ParentID) {
			return fmt.Errorf("%w: tree parent relationship is inconsistent", ErrWorkspaceVFSInvalid)
		}
		if expectedParent != nil && (node.ParentID == nil || !isCanonicalWorkspaceVFSID(*node.ParentID)) {
			return fmt.Errorf("%w: non-root parentId must be a non-empty canonical id", ErrWorkspaceVFSInvalid)
		}
		if err := validateWorkspaceVFSNodeName(node.Name, expectedParent == nil); err != nil {
			return err
		}
		visited[nodeID] = struct{}{}
		switch node.Kind {
		case "dir":
			if node.Children == nil {
				return fmt.Errorf("%w: directory nodes must declare a children array", ErrWorkspaceVFSInvalid)
			}
			if node.DocID != "" {
				return fmt.Errorf("%w: directory nodes cannot declare docId", ErrWorkspaceVFSInvalid)
			}
			children := make(map[string]struct{}, len(node.Children))
			childNames := make(map[string]struct{}, len(node.Children))
			for _, childID := range node.Children {
				if !isCanonicalWorkspaceVFSID(childID) {
					return fmt.Errorf("%w: directory child ids must be non-empty canonical ids", ErrWorkspaceVFSInvalid)
				}
				if _, duplicate := children[childID]; duplicate {
					return fmt.Errorf("%w: directory children must be unique", ErrWorkspaceVFSInvalid)
				}
				children[childID] = struct{}{}
				child, exists := tree.TreeByID[childID]
				if !exists {
					return fmt.Errorf("%w: directory child is missing", ErrWorkspaceVFSInvalid)
				}
				if _, duplicate := childNames[child.Name]; duplicate {
					return fmt.Errorf("%w: sibling node names must be unique", ErrWorkspaceVFSInvalid)
				}
				childNames[child.Name] = struct{}{}
				parentID := nodeID
				if err := walk(childID, &parentID); err != nil {
					return err
				}
			}
		case "doc":
			if node.Children != nil || !isCanonicalWorkspaceVFSID(node.DocID) {
				return fmt.Errorf("%w: document tree node is invalid", ErrWorkspaceVFSInvalid)
			}
			if _, exists := documents[node.DocID]; !exists {
				return fmt.Errorf("%w: document tree node references a missing document", ErrWorkspaceVFSInvalid)
			}
			if _, duplicate := documentNodes[node.DocID]; duplicate {
				return fmt.Errorf("%w: document has multiple tree nodes", ErrWorkspaceVFSInvalid)
			}
			documentNodes[node.DocID] = nodeID
		default:
			return fmt.Errorf("%w: tree node kind is invalid", ErrWorkspaceVFSInvalid)
		}
		return nil
	}
	if err := walk(tree.TreeRootID, nil); err != nil {
		return err
	}
	if len(visited) != len(tree.TreeByID) || len(documentNodes) != len(documents) {
		return fmt.Errorf("%w: tree contains unreachable nodes or document mounts are incomplete", ErrWorkspaceVFSInvalid)
	}
	paths := tree.documentPathsByID()
	for documentID, document := range documents {
		if paths[documentID] != document.Path {
			return fmt.Errorf("%w: document path does not match its tree mount", ErrWorkspaceVFSInvalid)
		}
	}
	return nil
}

func validateWorkspaceVFSNodeName(name string, root bool) error {
	if name == "" || name != strings.TrimSpace(name) {
		return fmt.Errorf("%w: tree node names must be non-empty and trimmed", ErrWorkspaceVFSInvalid)
	}
	if root && name == "/" {
		return nil
	}
	if name == "." || name == ".." || strings.ContainsAny(name, `/\`) {
		return fmt.Errorf("%w: tree node names cannot contain separators or dot segments", ErrWorkspaceVFSInvalid)
	}
	return nil
}

func parseWorkspaceVFSTree(
	treeJSON json.RawMessage,
	rootID string,
	existingDocuments []WorkspaceDocumentRecord,
) (workspaceVFSTree, error) {
	documentsByID, err := indexWorkspaceVFSDocuments(existingDocuments)
	if err != nil {
		return workspaceVFSTree{}, err
	}

	if len(bytes.TrimSpace(treeJSON)) > 0 {
		var wire struct {
			TreeRootID string                     `json:"treeRootId"`
			TreeByID   map[string]json.RawMessage `json:"treeById"`
		}
		decoder := json.NewDecoder(bytes.NewReader(treeJSON))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&wire); err != nil {
			return workspaceVFSTree{}, err
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(treeJSON, &fields); err != nil {
			return workspaceVFSTree{}, err
		}
		for _, field := range []string{"treeRootId", "treeById"} {
			if _, exists := fields[field]; !exists {
				return workspaceVFSTree{}, fmt.Errorf("%w: workspace tree field %s is required", ErrWorkspaceVFSInvalid, field)
			}
		}
		treeByID := make(map[string]workspaceVFSNode, len(wire.TreeByID))
		for id, nodePayload := range wire.TreeByID {
			var nodeFields map[string]json.RawMessage
			if err := json.Unmarshal(nodePayload, &nodeFields); err != nil {
				return workspaceVFSTree{}, fmt.Errorf("%w: tree node %s must be an object", ErrWorkspaceVFSInvalid, id)
			}
			for _, field := range []string{"id", "kind", "name", "parentId"} {
				if _, exists := nodeFields[field]; !exists {
					return workspaceVFSTree{}, fmt.Errorf("%w: tree node %s field %s is required", ErrWorkspaceVFSInvalid, id, field)
				}
			}
			var node workspaceVFSNode
			decoder := json.NewDecoder(bytes.NewReader(nodePayload))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&node); err != nil {
				return workspaceVFSTree{}, fmt.Errorf("%w: tree node %s: %v", ErrWorkspaceVFSInvalid, id, err)
			}
			switch node.Kind {
			case "dir":
				children, exists := nodeFields["children"]
				if !exists || bytes.Equal(bytes.TrimSpace(children), []byte("null")) {
					return workspaceVFSTree{}, fmt.Errorf("%w: directory tree node %s must declare a children array", ErrWorkspaceVFSInvalid, id)
				}
				if _, exists := nodeFields["docId"]; exists {
					return workspaceVFSTree{}, fmt.Errorf("%w: directory tree node %s cannot declare docId", ErrWorkspaceVFSInvalid, id)
				}
			case "doc":
				if _, exists := nodeFields["children"]; exists {
					return workspaceVFSTree{}, fmt.Errorf("%w: document tree node %s cannot declare children", ErrWorkspaceVFSInvalid, id)
				}
				docID, exists := nodeFields["docId"]
				if !exists || bytes.Equal(bytes.TrimSpace(docID), []byte("null")) {
					return workspaceVFSTree{}, fmt.Errorf("%w: document tree node %s must declare docId", ErrWorkspaceVFSInvalid, id)
				}
			default:
				return workspaceVFSTree{}, fmt.Errorf("%w: tree node %s kind is invalid", ErrWorkspaceVFSInvalid, id)
			}
			treeByID[id] = node
		}
		tree := workspaceVFSTree{
			TreeRootID: wire.TreeRootID,
			TreeByID:   treeByID,
		}
		if err := validateWorkspaceVFSState(tree, documentsByID); err != nil {
			return workspaceVFSTree{}, err
		}
		return tree, nil
	}

	tree := defaultWorkspaceVFSTree(rootID)
	documents := append([]WorkspaceDocumentRecord(nil), existingDocuments...)
	sort.Slice(documents, func(left, right int) bool {
		return documents[left].Path < documents[right].Path
	})
	for _, document := range documents {
		normalizedPath, err := normalizeWorkspacePath(document.Path)
		if err != nil {
			return workspaceVFSTree{}, err
		}
		nodeID := makePathNodeID("doc", []string{document.ID})
		if err := tree.addDocument(codeDocumentMount{
			DocumentID: document.ID,
			NodeID:     nodeID,
			Path:       normalizedPath,
			Name:       workspacePathName(normalizedPath),
		}); err != nil {
			return workspaceVFSTree{}, err
		}
	}
	if err := validateWorkspaceVFSState(tree, documentsByID); err != nil {
		return workspaceVFSTree{}, err
	}
	return tree, nil
}

func (tree workspaceVFSTree) marshal() (json.RawMessage, error) {
	payload, err := json.Marshal(tree)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(payload), nil
}
