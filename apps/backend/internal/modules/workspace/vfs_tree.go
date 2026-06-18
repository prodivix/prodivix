package workspace

import (
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

func parseWorkspaceVFSTree(
	treeJSON json.RawMessage,
	rootID string,
	existingDocuments []WorkspaceDocumentRecord,
) (workspaceVFSTree, error) {
	var decoded struct {
		TreeRootID string                      `json:"treeRootId"`
		TreeByID   map[string]workspaceVFSNode `json:"treeById"`
	}
	if len(treeJSON) > 0 && strings.TrimSpace(string(treeJSON)) != "" {
		if err := json.Unmarshal(treeJSON, &decoded); err != nil {
			return workspaceVFSTree{}, err
		}
	}

	if strings.TrimSpace(decoded.TreeRootID) != "" && len(decoded.TreeByID) > 0 {
		tree := workspaceVFSTree{
			TreeRootID: strings.TrimSpace(decoded.TreeRootID),
			TreeByID:   decoded.TreeByID,
		}
		if _, ok := tree.TreeByID[tree.TreeRootID]; !ok {
			return workspaceVFSTree{}, fmt.Errorf("%w: treeRootId does not exist in treeById", ErrWorkspaceVFSInvalid)
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
	return tree, nil
}

func (tree workspaceVFSTree) marshal() (json.RawMessage, error) {
	payload, err := json.Marshal(tree)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(payload), nil
}
