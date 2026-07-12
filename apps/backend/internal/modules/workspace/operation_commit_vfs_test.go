package workspace

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func testWorkspaceCommitProjectionPayload(t *testing.T, mutate func(map[string]any)) json.RawMessage {
	t.Helper()
	state, _ := newTestWorkspaceCommitState(t)
	payload, err := json.Marshal(state.projection())
	if err != nil {
		t.Fatalf("marshal workspace commit projection: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode workspace commit projection fixture: %v", err)
	}
	mutate(decoded)
	result, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("marshal mutated workspace commit projection: %v", err)
	}
	return result
}

func TestWorkspaceOperationCommitRequiresCanonicalNewDocumentIdentity(t *testing.T) {
	tests := []struct {
		name    string
		payload string
	}{
		{name: "pointer identity", payload: `{"id":"different","contentRev":1,"metaRev":1}`},
		{name: "content revision", payload: `{"id":"doc_new","contentRev":2,"metaRev":1}`},
		{name: "metadata revision", payload: `{"id":"doc_new","contentRev":1,"metaRev":2}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			command := WorkspaceCommandEnvelope{
				ID:         "cmd_add_invalid_identity",
				Namespace:  "core.workspace",
				Type:       "document.add",
				Version:    "1.0",
				IssuedAt:   time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
				ForwardOps: []WorkspacePatchOp{{Op: "add", Path: "/docsById/doc_new", Value: json.RawMessage(test.payload)}},
				ReverseOps: []WorkspacePatchOp{{Op: "remove", Path: "/docsById/doc_new"}},
				Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
				DomainHint: "workspace",
			}
			request := WorkspaceOperationCommitRequest{
				Expected: &WorkspaceOperationCommitExpected{
					WorkspaceRev: commitRevision(1),
					Documents: []WorkspaceCommitExpectedDocument{{
						ID:                "doc_new",
						ContentRevPresent: true,
						MetaRevPresent:    true,
					}},
				},
				Operation: WorkspaceOperationEnvelope{Kind: "command", Command: &command},
			}
			if _, err := normalizeWorkspaceOperationCommit("ws_1", request); err == nil {
				t.Fatal("expected invalid new document identity to be rejected")
			}
		})
	}
}

func TestWorkspaceCommitRejectsNonCanonicalDocumentState(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*workspaceCommitState)
	}{
		{
			name: "empty capability list",
			mutate: func(state *workspaceCommitState) {
				document := state.Documents["doc_code"]
				document.Capabilities = []string{}
				state.Documents["doc_code"] = document
			},
		},
		{
			name: "capability whitespace",
			mutate: func(state *workspaceCommitState) {
				document := state.Documents["doc_code"]
				document.Capabilities = []string{" execute "}
				state.Documents["doc_code"] = document
			},
		},
		{
			name: "capability duplicate",
			mutate: func(state *workspaceCommitState) {
				document := state.Documents["doc_code"]
				document.Capabilities = []string{"execute", "execute"}
				state.Documents["doc_code"] = document
			},
		},
		{
			name: "capability Unicode order",
			mutate: func(state *workspaceCommitState) {
				document := state.Documents["doc_code"]
				document.Capabilities = []string{"𐀀", "é"}
				state.Documents["doc_code"] = document
			},
		},
		{
			name: "non-positive revision",
			mutate: func(state *workspaceCommitState) {
				document := state.Documents["doc_code"]
				document.ContentRev = 0
				state.Documents["doc_code"] = document
			},
		},
		{
			name: "invalid code content",
			mutate: func(state *workspaceCommitState) {
				document := state.Documents["doc_code"]
				document.Content = json.RawMessage(`{"language":"ts","source":"","metadata":[]}`)
				state.Documents["doc_code"] = document
			},
		},
		{
			name: "whitespace-only document name",
			mutate: func(state *workspaceCommitState) {
				document := state.Documents["doc_code"]
				document.Name = "   "
				state.Documents["doc_code"] = document
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state, _ := newTestWorkspaceCommitState(t)
			test.mutate(state)
			if err := state.validate(); err == nil {
				t.Fatal("expected non-canonical document state rejection")
			}
		})
	}
}

func TestWorkspaceCommitRejectsNonCanonicalTreeState(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*workspaceCommitState)
	}{
		{
			name: "directory children missing",
			mutate: func(state *workspaceCommitState) {
				root := state.TreeByID["root"]
				root.Children = nil
				state.TreeByID["root"] = root
			},
		},
		{
			name: "path separator in node name",
			mutate: func(state *workspaceCommitState) {
				node := state.TreeByID["doc-node"]
				node.Name = "nested/main.ts"
				state.TreeByID["doc-node"] = node
			},
		},
		{
			name: "duplicate sibling name",
			mutate: func(state *workspaceCommitState) {
				root := state.TreeByID["root"]
				root.Children = append(root.Children, "duplicate")
				state.TreeByID["root"] = root
				parent := "root"
				state.TreeByID["duplicate"] = workspaceVFSNode{
					ID:       "duplicate",
					Kind:     "dir",
					Name:     "main.ts",
					ParentID: &parent,
					Children: []string{},
				}
			},
		},
		{
			name: "non-canonical node map key",
			mutate: func(state *workspaceCommitState) {
				node := state.TreeByID["doc-node"]
				delete(state.TreeByID, "doc-node")
				state.TreeByID[" doc-node "] = node
				root := state.TreeByID["root"]
				root.Children = []string{" doc-node "}
				state.TreeByID["root"] = root
			},
		},
		{
			name: "non-canonical node id",
			mutate: func(state *workspaceCommitState) {
				node := state.TreeByID["doc-node"]
				node.ID = " doc-node "
				state.TreeByID["doc-node"] = node
			},
		},
		{
			name: "non-canonical parent id",
			mutate: func(state *workspaceCommitState) {
				node := state.TreeByID["doc-node"]
				parentID := " root "
				node.ParentID = &parentID
				state.TreeByID["doc-node"] = node
			},
		},
		{
			name: "non-canonical child id",
			mutate: func(state *workspaceCommitState) {
				root := state.TreeByID["root"]
				root.Children = []string{" doc-node "}
				state.TreeByID["root"] = root
			},
		},
		{
			name: "non-canonical document reference id",
			mutate: func(state *workspaceCommitState) {
				node := state.TreeByID["doc-node"]
				node.DocID = " doc_code "
				state.TreeByID["doc-node"] = node
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state, _ := newTestWorkspaceCommitState(t)
			test.mutate(state)
			if err := state.validate(); err == nil {
				t.Fatal("expected non-canonical tree state rejection")
			}
		})
	}
}

func TestWorkspaceCommitProjectionRejectsInvalidVFSBoundaries(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{
			name: "empty document set",
			mutate: func(projection map[string]any) {
				projection["docsById"] = map[string]any{}
			},
		},
		{
			name: "non-canonical node map key",
			mutate: func(projection map[string]any) {
				tree := projection["treeById"].(map[string]any)
				node := tree["doc-node"]
				delete(tree, "doc-node")
				tree[" doc-node "] = node
			},
		},
		{
			name: "non-canonical node id",
			mutate: func(projection map[string]any) {
				tree := projection["treeById"].(map[string]any)
				tree["doc-node"].(map[string]any)["id"] = " doc-node "
			},
		},
		{
			name: "non-canonical parent id",
			mutate: func(projection map[string]any) {
				tree := projection["treeById"].(map[string]any)
				tree["doc-node"].(map[string]any)["parentId"] = " root "
			},
		},
		{
			name: "non-canonical child id",
			mutate: func(projection map[string]any) {
				tree := projection["treeById"].(map[string]any)
				tree["root"].(map[string]any)["children"] = []any{" doc-node "}
			},
		},
		{
			name: "non-canonical document reference id",
			mutate: func(projection map[string]any) {
				tree := projection["treeById"].(map[string]any)
				tree["doc-node"].(map[string]any)["docId"] = " doc_code "
			},
		},
		{
			name: "empty document name",
			mutate: func(projection map[string]any) {
				documents := projection["docsById"].(map[string]any)
				documents["doc_code"].(map[string]any)["name"] = ""
			},
		},
		{
			name: "whitespace-only document name",
			mutate: func(projection map[string]any) {
				documents := projection["docsById"].(map[string]any)
				documents["doc_code"].(map[string]any)["name"] = "   "
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload := testWorkspaceCommitProjectionPayload(t, test.mutate)
			if _, err := decodeWorkspaceCommitProjection(payload); err == nil {
				t.Fatal("expected invalid workspace commit projection rejection")
			}
		})
	}
}

func TestWorkspaceCommitProjectionAllowsOmittedDocumentName(t *testing.T) {
	payload := testWorkspaceCommitProjectionPayload(t, func(projection map[string]any) {
		documents := projection["docsById"].(map[string]any)
		delete(documents["doc_code"].(map[string]any), "name")
	})
	projection, err := decodeWorkspaceCommitProjection(payload)
	if err != nil {
		t.Fatalf("decode projection with omitted document name: %v", err)
	}
	if projection.DocsByID["doc_code"].Name != "" {
		t.Fatalf("omitted document name must remain absent: %+v", projection.DocsByID["doc_code"])
	}
	state, _ := newTestWorkspaceCommitState(t)
	document := state.Documents["doc_code"]
	document.Name = ""
	state.Documents["doc_code"] = document
	if err := state.validate(); err != nil {
		t.Fatalf("final state must allow an omitted document name: %v", err)
	}
}

func TestWorkspaceCommitRejectsDeletingTheLastDocument(t *testing.T) {
	state, _ := newTestWorkspaceCommitState(t)
	projection := state.projection()
	originalTree, err := json.Marshal(projection.TreeByID)
	if err != nil {
		t.Fatalf("marshal original workspace tree: %v", err)
	}
	originalDocument, err := json.Marshal(projection.DocsByID["doc_code"])
	if err != nil {
		t.Fatalf("marshal original workspace document: %v", err)
	}
	command := WorkspaceCommandEnvelope{
		ID:        "cmd_remove_last_document",
		Namespace: "core.workspace",
		Type:      "document.remove",
		Version:   "1.0",
		IssuedAt:  time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		ForwardOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/treeById", Value: json.RawMessage(`{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":[]}}`)},
			{Op: "remove", Path: "/docsById/doc_code"},
		},
		ReverseOps: []WorkspacePatchOp{
			{Op: "add", Path: "/docsById/doc_code", Value: originalDocument},
			{Op: "replace", Path: "/treeById", Value: originalTree},
		},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "workspace",
	}

	err = state.apply([]WorkspaceCommandEnvelope{command})
	if err == nil || !strings.Contains(err.Error(), "at least one document") {
		t.Fatalf("expected last-document deletion rejection, got %v", err)
	}
	if _, exists := state.Documents["doc_code"]; !exists {
		t.Fatal("failed last-document deletion must not mutate staged state")
	}
}

func TestWorkspaceCommitRejectsClosedTreeAndDocumentShapes(t *testing.T) {
	state, _ := newTestWorkspaceCommitState(t)
	tests := []WorkspaceCommandEnvelope{
		{
			ID:         "cmd_unknown_tree_field",
			Namespace:  "core.workspace",
			Type:       "tree.update",
			Version:    "1.0",
			IssuedAt:   time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
			ForwardOps: []WorkspacePatchOp{{Op: "add", Path: "/treeById/root/serverOnly", Value: json.RawMessage(`true`)}},
			ReverseOps: []WorkspacePatchOp{{Op: "remove", Path: "/treeById/root/serverOnly"}},
			Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
			DomainHint: "workspace",
		},
		{
			ID:         "cmd_doc_children",
			Namespace:  "core.workspace",
			Type:       "tree.update",
			Version:    "1.0",
			IssuedAt:   time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
			ForwardOps: []WorkspacePatchOp{{Op: "add", Path: "/treeById/doc-node/children", Value: json.RawMessage(`[]`)}},
			ReverseOps: []WorkspacePatchOp{{Op: "remove", Path: "/treeById/doc-node/children"}},
			Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
			DomainHint: "workspace",
		},
		{
			ID:         "cmd_null_dir_children",
			Namespace:  "core.workspace",
			Type:       "tree.update",
			Version:    "1.0",
			IssuedAt:   time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
			ForwardOps: []WorkspacePatchOp{{Op: "replace", Path: "/treeById/root/children", Value: json.RawMessage(`null`)}},
			ReverseOps: []WorkspacePatchOp{{Op: "replace", Path: "/treeById/root/children", Value: json.RawMessage(`["doc-node"]`)}},
			Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
			DomainHint: "workspace",
		},
		{
			ID:        "cmd_unknown_document_field",
			Namespace: "core.workspace",
			Type:      "document.add",
			Version:   "1.0",
			IssuedAt:  time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
			ForwardOps: []WorkspacePatchOp{{
				Op:    "add",
				Path:  "/docsById/doc_new",
				Value: json.RawMessage(`{"id":"doc_new","type":"code","path":"/new.ts","contentRev":1,"metaRev":1,"content":{"language":"ts","source":""},"serverOnly":true}`),
			}},
			ReverseOps: []WorkspacePatchOp{{Op: "remove", Path: "/docsById/doc_new"}},
			Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
			DomainHint: "workspace",
		},
	}
	for _, command := range tests {
		if err := state.apply([]WorkspaceCommandEnvelope{command}); err == nil {
			t.Fatalf("expected closed-shape rejection for %s", command.ID)
		}
	}
}

func TestWorkspaceCommitChangesCannotEscapeDeclaredDocumentPartitions(t *testing.T) {
	state, treeJSON := newTestWorkspaceCommitState(t)
	before := cloneWorkspaceCommitDocuments(state.Documents)
	document := state.Documents["doc_code"]
	document.Content = json.RawMessage(`{"language":"ts","source":"changed"}`)
	state.Documents["doc_code"] = document
	changes, err := buildWorkspaceCommitChanges(
		"ws_1", before, state.Documents, treeJSON, treeJSON,
		json.RawMessage(testCommitRouteJSON), json.RawMessage(testCommitRouteJSON), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("build changes: %v", err)
	}
	if err := validateWorkspaceCommitChangesAgainstRequirements(
		before,
		state.Documents,
		changes,
		workspaceCommitRequirements{Documents: map[string]workspaceCommitDocumentRequirement{}},
	); err == nil {
		t.Fatal("expected undeclared document content delta rejection")
	}
}
