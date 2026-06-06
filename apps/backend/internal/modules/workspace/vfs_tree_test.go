package workspace

import (
	"encoding/json"
	"testing"
)

func TestWorkspaceVFSTreeAddsCodeDocumentWithDirectories(t *testing.T) {
	tree, err := parseWorkspaceVFSTree(
		json.RawMessage(`{"rootId":"root","nodes":[]}`),
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
