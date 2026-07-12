package workspace

import (
	"encoding/json"
	"testing"
)

func TestWorkspaceVFSTreeAddsCodeDocumentWithDirectories(t *testing.T) {
	tree, err := parseWorkspaceVFSTree(
		nil,
		"root",
		[]WorkspaceDocumentRecord{
			{
				ID:   "doc_root",
				Path: "/pir.json",
			},
		},
	)
	if err != nil {
		t.Fatalf("parse tree: %v", err)
	}

	if err := tree.addDocument(codeDocumentMount{
		DocumentID: "code_mounted_css_button_1",
		NodeID:     "node_code_mounted_css_button_1",
		Path:       "/styles/mounted/button-1.css",
		Name:       "button-1.css",
	}); err != nil {
		t.Fatalf("add document: %v", err)
	}

	styles := tree.TreeByID["dir_styles"]
	if styles.Kind != "dir" || styles.ParentID == nil || *styles.ParentID != "root" {
		t.Fatalf("unexpected styles directory: %+v", styles)
	}
	mounted := tree.TreeByID["dir_styles_mounted"]
	if mounted.Kind != "dir" || mounted.ParentID == nil || *mounted.ParentID != "dir_styles" {
		t.Fatalf("unexpected mounted directory: %+v", mounted)
	}
	document := tree.TreeByID["node_code_mounted_css_button_1"]
	if document.Kind != "doc" || document.DocID != "code_mounted_css_button_1" {
		t.Fatalf("unexpected document node: %+v", document)
	}
	if document.ParentID == nil || *document.ParentID != "dir_styles_mounted" {
		t.Fatalf("unexpected document parent: %+v", document)
	}
}

func TestWorkspaceVFSTreeMarshalKeepsEmptyDirectoryChildrenCanonical(t *testing.T) {
	payload := defaultWorkspaceTreeWithRootDocumentJSON("root")
	var decoded struct {
		TreeByID map[string]map[string]any `json:"treeById"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode tree payload: %v", err)
	}

	children, ok := decoded.TreeByID["dir_styles"]["children"].([]any)
	if !ok || len(children) != 0 {
		t.Fatalf("empty directory children must be [], got %#v", decoded.TreeByID["dir_styles"]["children"])
	}
	if _, exists := decoded.TreeByID["doc_root_node"]["children"]; exists {
		t.Fatalf("document node must not serialize children: %#v", decoded.TreeByID["doc_root_node"])
	}
}

func TestWorkspaceVFSTreeReadRejectsOmittedDirectoryChildren(t *testing.T) {
	_, err := parseWorkspaceVFSTree(
		json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["dir_styles","doc_root_node"]},"dir_styles":{"id":"dir_styles","kind":"dir","name":"styles","parentId":"root"},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":"root","docId":"doc_root"}}}`),
		"root",
		[]WorkspaceDocumentRecord{{ID: "doc_root", Path: "/pir.json"}},
	)
	if err == nil {
		t.Fatal("expected omitted directory children to be rejected")
	}
}

func TestWorkspaceVFSTreeRejectsNonCanonicalOrIncompleteState(t *testing.T) {
	canonicalDocuments := []WorkspaceDocumentRecord{{ID: "doc_root", Path: "/pir.json"}}
	tests := []struct {
		name      string
		payload   json.RawMessage
		documents []WorkspaceDocumentRecord
	}{
		{
			name:      "empty document set",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":[]}}}`),
			documents: nil,
		},
		{
			name:      "incomplete document mounts",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":[]}}}`),
			documents: canonicalDocuments,
		},
		{
			name:      "node map key",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":[" doc_root_node "]}," doc_root_node ":{"id":" doc_root_node ","kind":"doc","name":"pir.json","parentId":"root","docId":"doc_root"}}}`),
			documents: canonicalDocuments,
		},
		{
			name:      "node id",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc_root_node"]},"doc_root_node":{"id":" doc_root_node ","kind":"doc","name":"pir.json","parentId":"root","docId":"doc_root"}}}`),
			documents: canonicalDocuments,
		},
		{
			name:      "parent id",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc_root_node"]},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":" root ","docId":"doc_root"}}}`),
			documents: canonicalDocuments,
		},
		{
			name:      "child id",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":[" doc_root_node "]},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":"root","docId":"doc_root"}}}`),
			documents: canonicalDocuments,
		},
		{
			name:      "document reference id",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc_root_node"]},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":"root","docId":" doc_root "}}}`),
			documents: canonicalDocuments,
		},
		{
			name:      "document id",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc_root_node"]},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":"root","docId":" doc_root "}}}`),
			documents: []WorkspaceDocumentRecord{{ID: " doc_root ", Path: "/pir.json"}},
		},
		{
			name:      "unknown top-level field",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc_root_node"]},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":"root","docId":"doc_root"}},"future":true}`),
			documents: canonicalDocuments,
		},
		{
			name:      "unknown node field",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc_root_node"],"future":true},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":"root","docId":"doc_root"}}}`),
			documents: canonicalDocuments,
		},
		{
			name:      "omitted root parent",
			payload:   json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","children":["doc_root_node"]},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":"root","docId":"doc_root"}}}`),
			documents: canonicalDocuments,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := parseWorkspaceVFSTree(test.payload, "root", test.documents); err == nil {
				t.Fatal("expected invalid workspace VFS state to be rejected")
			}
		})
	}
}
