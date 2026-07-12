package workspace

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func commitRevision(value int64) *int64 { return &value }

func testCommitDocumentCommand(
	id string,
	forward []WorkspacePatchOp,
	reverse []WorkspacePatchOp,
) WorkspaceCommandEnvelope {
	return WorkspaceCommandEnvelope{
		ID:         id,
		Namespace:  "core.code",
		Type:       "source.update",
		Version:    "1.0",
		IssuedAt:   time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		ForwardOps: forward,
		ReverseOps: reverse,
		Target: WorkspaceCommandTarget{
			WorkspaceID: "ws_1",
			DocumentID:  "doc_code",
		},
		DomainHint: "code",
	}
}

func testDocumentCommitRequest(command WorkspaceCommandEnvelope) WorkspaceOperationCommitRequest {
	return WorkspaceOperationCommitRequest{
		Expected: &WorkspaceOperationCommitExpected{
			Documents: []WorkspaceCommitExpectedDocument{{
				ID:                "doc_code",
				ContentRev:        commitRevision(2),
				ContentRevPresent: true,
			}},
		},
		Operation: WorkspaceOperationEnvelope{Kind: "command", Command: &command},
	}
}

func TestNormalizeWorkspaceOperationCommitKeepsDocumentCASPartitioned(t *testing.T) {
	command := testCommitDocumentCommand(
		"cmd_1",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"next"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	request := testDocumentCommitRequest(command)

	result, err := normalizeWorkspaceOperationCommit("ws_1", request)
	if err != nil {
		t.Fatalf("normalize commit: %v", err)
	}
	if result.Requirements.Workspace || result.Requirements.Route || !result.Requirements.Documents["doc_code"].Content {
		t.Fatalf("unexpected requirements: %+v", result.Requirements)
	}

	request.Expected.WorkspaceRev = commitRevision(9)
	if _, err := normalizeWorkspaceOperationCommit("ws_1", request); err == nil || !strings.Contains(err.Error(), "not part of this operation write set") {
		t.Fatalf("expected unrelated workspaceRev rejection, got %v", err)
	}
}

func TestWorkspaceOperationCommitRequiresDocumentsArrayPresence(t *testing.T) {
	var request WorkspaceOperationCommitRequest
	err := json.Unmarshal([]byte(`{
		"expected": {},
		"operation": {"kind":"command"}
	}`), &request)
	if err == nil || !strings.Contains(err.Error(), "documents array is required") {
		t.Fatalf("expected documents presence error, got %v", err)
	}

	if err := json.Unmarshal([]byte(`{
		"expected": {"documents": []},
		"operation": {"kind":"command"}
	}`), &request); err != nil {
		t.Fatalf("empty documents array should decode: %v", err)
	}
}

func TestWorkspaceOperationCommitHashCanonicalizesPatchObjectKeys(t *testing.T) {
	left := testCommitDocumentCommand(
		"cmd_hash",
		[]WorkspacePatchOp{{Op: "add", Path: "/metadata", Value: json.RawMessage(`{"b":2,"a":1}`)}},
		[]WorkspacePatchOp{{Op: "remove", Path: "/metadata"}},
	)
	right := testCommitDocumentCommand(
		"cmd_hash",
		[]WorkspacePatchOp{{Op: "add", Path: "/metadata", Value: json.RawMessage(`{"a":1,"b":2}`)}},
		[]WorkspacePatchOp{{Op: "remove", Path: "/metadata"}},
	)
	leftCommit, err := normalizeWorkspaceOperationCommit("ws_1", testDocumentCommitRequest(left))
	if err != nil {
		t.Fatalf("normalize left: %v", err)
	}
	rightCommit, err := normalizeWorkspaceOperationCommit("ws_1", testDocumentCommitRequest(right))
	if err != nil {
		t.Fatalf("normalize right: %v", err)
	}
	if leftCommit.RequestHash != rightCommit.RequestHash {
		t.Fatalf("semantic JSON key order changed request hash: %s != %s", leftCommit.RequestHash, rightCommit.RequestHash)
	}
}

func TestWorkspaceOperationCommitRejectsNonCanonicalPatchWire(t *testing.T) {
	tests := []struct {
		name      string
		operation WorkspacePatchOp
	}{
		{name: "invalid pointer escape", operation: WorkspacePatchOp{Op: "replace", Path: "/metadata/~2invalid", Value: json.RawMessage(`1`)}},
		{name: "outer path whitespace", operation: WorkspacePatchOp{Op: "replace", Path: "/source ", Value: json.RawMessage(`"next"`)}},
		{name: "missing value", operation: WorkspacePatchOp{Op: "replace", Path: "/source"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			command := testCommitDocumentCommand(
				"cmd_invalid_patch",
				[]WorkspacePatchOp{test.operation},
				[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
			)
			if _, err := normalizeWorkspaceOperationCommit("ws_1", testDocumentCommitRequest(command)); err == nil {
				t.Fatal("expected non-canonical patch rejection")
			}
		})
	}
}

func TestWorkspaceOperationCommitRejectsNonCanonicalEnvelopeWire(t *testing.T) {
	baseCommand := testCommitDocumentCommand(
		"cmd_canonical",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"next"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)

	t.Run("operation kind", func(t *testing.T) {
		request := testDocumentCommitRequest(baseCommand)
		request.Operation.Kind = " COMMAND "
		if _, err := normalizeWorkspaceOperationCommit("ws_1", request); err == nil || !strings.Contains(err.Error(), "/operation/kind") {
			t.Fatalf("expected canonical kind rejection, got %v", err)
		}
	})

	t.Run("domain hint", func(t *testing.T) {
		command := baseCommand
		command.DomainHint = "CODE"
		if _, err := normalizeWorkspaceOperationCommit("ws_1", testDocumentCommitRequest(command)); err == nil || !strings.Contains(err.Error(), "domainHint") {
			t.Fatalf("expected canonical domainHint rejection, got %v", err)
		}
	})

	t.Run("namespace domain is case sensitive", func(t *testing.T) {
		command := baseCommand
		command.Namespace = "CORE.CODE"
		command.DomainHint = ""
		if _, err := normalizeWorkspaceOperationCommit("ws_1", testDocumentCommitRequest(command)); err == nil || !strings.Contains(err.Error(), "document-targeted commands require") {
			t.Fatalf("expected explicit domainHint for a non-canonical namespace, got %v", err)
		}
	})

	t.Run("expected document id", func(t *testing.T) {
		request := testDocumentCommitRequest(baseCommand)
		request.Expected.Documents[0].ID = " doc_code "
		if _, err := normalizeWorkspaceOperationCommit("ws_1", request); err == nil || !strings.Contains(err.Error(), "/expected/documents/0/id") {
			t.Fatalf("expected canonical expected document id rejection, got %v", err)
		}
	})

	t.Run("expected document order", func(t *testing.T) {
		expected := &WorkspaceOperationCommitExpected{Documents: []WorkspaceCommitExpectedDocument{
			{ID: "doc_z", ContentRev: commitRevision(1), ContentRevPresent: true},
			{ID: "doc_a", ContentRev: commitRevision(1), ContentRevPresent: true},
		}}
		requirements := workspaceCommitRequirements{Documents: map[string]workspaceCommitDocumentRequirement{
			"doc_a": {Content: true},
			"doc_z": {Content: true},
		}}
		if err := normalizeAndValidateCommitExpected(expected, requirements); err == nil || !strings.Contains(err.Error(), "Unicode code-point order") {
			t.Fatalf("expected canonical expected document order rejection, got %v", err)
		}
	})
}

func TestWorkspaceOperationCommitRejectsSettingsAndPersistentMove(t *testing.T) {
	workspaceCommand := WorkspaceCommandEnvelope{
		ID:         "cmd_workspace",
		Namespace:  "core.workspace-sync",
		Type:       "workspace.update",
		Version:    "1.0",
		IssuedAt:   time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		ForwardOps: []WorkspacePatchOp{{Op: "replace", Path: "/settings/theme", Value: json.RawMessage(`"dark"`)}},
		ReverseOps: []WorkspacePatchOp{{Op: "replace", Path: "/settings/theme", Value: json.RawMessage(`"light"`)}},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "workspace",
	}
	request := WorkspaceOperationCommitRequest{
		Expected: &WorkspaceOperationCommitExpected{
			WorkspaceRev: commitRevision(1),
			Documents:    []WorkspaceCommitExpectedDocument{},
		},
		Operation: WorkspaceOperationEnvelope{Kind: "command", Command: &workspaceCommand},
	}
	if _, err := normalizeWorkspaceOperationCommit("ws_1", request); err == nil || !strings.Contains(err.Error(), "workspace patches may change only") {
		t.Fatalf("expected settings rejection, got %v", err)
	}

	workspaceCommand.ForwardOps = []WorkspacePatchOp{{Op: "move", From: "/treeById/a", Path: "/treeById/b"}}
	workspaceCommand.ReverseOps = []WorkspacePatchOp{{Op: "move", From: "/treeById/b", Path: "/treeById/a"}}
	request.Operation.Command = &workspaceCommand
	if _, err := normalizeWorkspaceOperationCommit("ws_1", request); err == nil || !strings.Contains(err.Error(), "move/copy") {
		t.Fatalf("expected workspace move rejection, got %v", err)
	}
}

func TestWorkspaceOperationCommitRejectsDomainMismatchAndStructuralCommandMix(t *testing.T) {
	documentCommand := testCommitDocumentCommand(
		"cmd_existing_content",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"next"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	documentCommand.Namespace = "core.code"
	documentCommand.DomainHint = "pir"
	if _, err := normalizeWorkspaceOperationCommit("ws_1", testDocumentCommitRequest(documentCommand)); err == nil || !strings.Contains(err.Error(), "conflicts with namespace domain") {
		t.Fatalf("expected namespace/domain mismatch, got %v", err)
	}

	documentCommand.Namespace = "core.code"
	documentCommand.DomainHint = "code"
	documentCommand.Target.DocumentID = "doc_new"
	addCommand := WorkspaceCommandEnvelope{
		ID:         "cmd_add_after_content",
		Namespace:  "core.workspace-sync",
		Type:       "document.add",
		Version:    "1.0",
		IssuedAt:   documentCommand.IssuedAt,
		ForwardOps: []WorkspacePatchOp{{Op: "add", Path: "/docsById/doc_new", Value: json.RawMessage(`{"id":"doc_new","contentRev":1,"metaRev":1}`)}},
		ReverseOps: []WorkspacePatchOp{{Op: "remove", Path: "/docsById/doc_new"}},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "workspace",
	}
	transaction := WorkspaceTransactionEnvelope{
		ID:          "tx_invalid_mix",
		WorkspaceID: "ws_1",
		IssuedAt:    documentCommand.IssuedAt,
		Commands:    []WorkspaceCommandEnvelope{documentCommand, addCommand},
	}
	request := WorkspaceOperationCommitRequest{
		Expected:  &WorkspaceOperationCommitExpected{Documents: []WorkspaceCommitExpectedDocument{}},
		Operation: WorkspaceOperationEnvelope{Kind: "transaction", Transaction: &transaction},
	}
	if _, err := normalizeWorkspaceOperationCommit("ws_1", request); err == nil || !strings.Contains(err.Error(), "structural mutation") {
		t.Fatalf("expected content then add rejection, got %v", err)
	}
}

func TestWorkspaceOperationCommitAcceptsEphemeralRouteSelectionWithoutPersistingIt(t *testing.T) {
	routeCommand := WorkspaceCommandEnvelope{
		ID:        "cmd_route",
		Namespace: "core.route",
		Type:      "manifest.update",
		Version:   "1.0",
		IssuedAt:  time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		ForwardOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/routeManifest", Value: json.RawMessage(`{"version":"1","root":{"id":"root"}}`)},
			{Op: "replace", Path: "/activeRouteNodeId", Value: json.RawMessage(`"route-home"`)},
		},
		ReverseOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/activeRouteNodeId", Value: json.RawMessage(`"route-old"`)},
			{Op: "replace", Path: "/routeManifest", Value: json.RawMessage(`{"version":"1","root":{"id":"root"}}`)},
		},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1", RouteNodeID: "route-home"},
		DomainHint: "route",
	}
	request := WorkspaceOperationCommitRequest{
		Expected: &WorkspaceOperationCommitExpected{
			WorkspaceRev: commitRevision(1),
			RouteRev:     commitRevision(1),
			Documents:    []WorkspaceCommitExpectedDocument{},
		},
		Operation: WorkspaceOperationEnvelope{Kind: "command", Command: &routeCommand},
	}
	commit, err := normalizeWorkspaceOperationCommit("ws_1", request)
	if err != nil {
		t.Fatalf("normalize route command: %v", err)
	}
	if !commit.Requirements.Workspace || !commit.Requirements.Route {
		t.Fatalf("unexpected route requirements: %+v", commit.Requirements)
	}
}

func TestWorkspaceCommitRejectsNonCanonicalRouteManifestWithoutMutatingState(t *testing.T) {
	state, _ := newTestWorkspaceCommitState(t)
	before := append(json.RawMessage(nil), state.RouteManifest...)
	command := WorkspaceCommandEnvelope{
		ID:        "cmd_route_unknown_field",
		Namespace: "core.route",
		Type:      "manifest.update",
		Version:   "1.0",
		IssuedAt:  time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		ForwardOps: []WorkspacePatchOp{{
			Op:    "replace",
			Path:  "/routeManifest",
			Value: json.RawMessage(`{"version":"1","root":{"id":"root"},"future":true}`),
		}},
		ReverseOps: []WorkspacePatchOp{{
			Op:    "replace",
			Path:  "/routeManifest",
			Value: before,
		}},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "route",
	}

	err := state.apply([]WorkspaceCommandEnvelope{command})
	if err == nil {
		t.Fatal("expected non-canonical route manifest rejection")
	}
	var routeErr *RouteManifestValidationError
	if !errors.As(err, &routeErr) {
		t.Fatalf("expected RouteManifestValidationError, got %T %v", err, err)
	}
	if !jsonBytesEqual(state.RouteManifest, before) {
		t.Fatalf("failed route command mutated staged state: %s", state.RouteManifest)
	}
}

func newTestWorkspaceCommitState(t *testing.T) (*workspaceCommitState, json.RawMessage) {
	t.Helper()
	now := time.Date(2026, time.July, 12, 0, 0, 0, 0, time.UTC)
	workspace := WorkspaceRecord{
		ID:         "ws_1",
		TreeRootID: "root",
		Tree:       json.RawMessage(testCommitTreeJSON),
	}
	documents := []WorkspaceDocumentRecord{{
		WorkspaceID:  "ws_1",
		ID:           "doc_code",
		Type:         WorkspaceDocumentTypeCode,
		Name:         "main.ts",
		Path:         "/main.ts",
		ContentRev:   2,
		MetaRev:      1,
		Content:      json.RawMessage(`{"language":"ts","source":"before"}`),
		Capabilities: []string{"execute"},
		UpdatedAt:    now,
	}}
	state, err := newWorkspaceCommitState(workspace, json.RawMessage(testCommitRouteJSON), documents)
	if err != nil {
		t.Fatalf("create commit state: %v", err)
	}
	return state, json.RawMessage(testCommitTreeJSON)
}

func TestWorkspaceCommitMetadataBumpsOnlyMetaRevision(t *testing.T) {
	state, treeJSON := newTestWorkspaceCommitState(t)
	before := cloneWorkspaceCommitDocuments(state.Documents)
	command := WorkspaceCommandEnvelope{
		ID:        "cmd_metadata",
		Namespace: "core.workspace-sync",
		Type:      "document.metadata.update",
		Version:   "1.0",
		IssuedAt:  time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		ForwardOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/docsById/doc_code/name", Value: json.RawMessage(`"Main source"`)},
			{Op: "replace", Path: "/docsById/doc_code/capabilities", Value: json.RawMessage(`["execute","preview"]`)},
		},
		ReverseOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/docsById/doc_code/capabilities", Value: json.RawMessage(`["execute"]`)},
			{Op: "replace", Path: "/docsById/doc_code/name", Value: json.RawMessage(`"main.ts"`)},
		},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "workspace",
	}
	if err := state.apply([]WorkspaceCommandEnvelope{command}); err != nil {
		t.Fatalf("apply metadata command: %v", err)
	}
	changes, err := buildWorkspaceCommitChanges(
		"ws_1", before, state.Documents, treeJSON, treeJSON,
		json.RawMessage(testCommitRouteJSON), json.RawMessage(testCommitRouteJSON), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("build metadata changes: %v", err)
	}
	if !changes.WorkspaceChanged || len(changes.UpdatedDocuments) != 1 {
		t.Fatalf("unexpected metadata changes: %+v", changes)
	}
	document := changes.UpdatedDocuments[0]
	if document.ContentRev != 2 || document.MetaRev != 2 || document.Name != "Main source" || len(document.Capabilities) != 2 {
		t.Fatalf("metadata revision/result mismatch: %+v", document)
	}
}

func TestWorkspaceCommitMultipleCommandsBumpContentRevisionOnce(t *testing.T) {
	state, treeJSON := newTestWorkspaceCommitState(t)
	before := cloneWorkspaceCommitDocuments(state.Documents)
	first := testCommitDocumentCommand(
		"cmd_first",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"middle"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	second := testCommitDocumentCommand(
		"cmd_second",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"after"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"middle"`)}},
	)
	if err := state.apply([]WorkspaceCommandEnvelope{first, second}); err != nil {
		t.Fatalf("apply sequential document commands: %v", err)
	}
	changes, err := buildWorkspaceCommitChanges(
		"ws_1", before, state.Documents, treeJSON, treeJSON,
		json.RawMessage(testCommitRouteJSON), json.RawMessage(testCommitRouteJSON), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("build content changes: %v", err)
	}
	if len(changes.UpdatedDocuments) != 1 || changes.UpdatedDocuments[0].ContentRev != 3 {
		t.Fatalf("content revision should increment once: %+v", changes.UpdatedDocuments)
	}
}

func TestWorkspaceCommitStagesDocumentAddAndRemoveWithTree(t *testing.T) {
	state, oldTreeJSON := newTestWorkspaceCommitState(t)
	oldTreeByID := `{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc-node"]},"doc-node":{"id":"doc-node","kind":"doc","name":"main.ts","parentId":"root","docId":"doc_code"}}`
	newTreeByID := `{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc-node","doc-new-node"]},"doc-node":{"id":"doc-node","kind":"doc","name":"main.ts","parentId":"root","docId":"doc_code"},"doc-new-node":{"id":"doc-new-node","kind":"doc","name":"new.ts","parentId":"root","docId":"doc_new"}}`
	newDocument := `{"id":"doc_new","type":"code","name":"new.ts","path":"/new.ts","contentRev":1,"metaRev":1,"content":{"language":"ts","source":"new"},"capabilities":["execute"]}`
	add := WorkspaceCommandEnvelope{
		ID:         "cmd_add",
		Namespace:  "core.workspace-sync",
		Type:       "document.add",
		Version:    "1.0",
		IssuedAt:   time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		ForwardOps: []WorkspacePatchOp{{Op: "replace", Path: "/treeById", Value: json.RawMessage(newTreeByID)}, {Op: "add", Path: "/docsById/doc_new", Value: json.RawMessage(newDocument)}},
		ReverseOps: []WorkspacePatchOp{{Op: "remove", Path: "/docsById/doc_new"}, {Op: "replace", Path: "/treeById", Value: json.RawMessage(oldTreeByID)}},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "workspace",
	}
	beforeAdd := cloneWorkspaceCommitDocuments(state.Documents)
	if err := state.apply([]WorkspaceCommandEnvelope{add}); err != nil {
		t.Fatalf("stage add: %v", err)
	}
	newTreeJSON, _ := (workspaceVFSTree{TreeRootID: state.TreeRootID, TreeByID: state.TreeByID}).marshal()
	addChanges, err := buildWorkspaceCommitChanges(
		"ws_1", beforeAdd, state.Documents, oldTreeJSON, newTreeJSON,
		json.RawMessage(testCommitRouteJSON), json.RawMessage(testCommitRouteJSON), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("build add changes: %v", err)
	}
	if !addChanges.TreeChanged || len(addChanges.UpdatedDocuments) != 1 || addChanges.UpdatedDocuments[0].ContentRev != 1 {
		t.Fatalf("unexpected add changes: %+v", addChanges)
	}

	remove := WorkspaceCommandEnvelope{
		ID:         "cmd_remove",
		Namespace:  "core.workspace-sync",
		Type:       "document.remove",
		Version:    "1.0",
		IssuedAt:   time.Date(2026, time.July, 12, 1, 1, 0, 0, time.UTC),
		ForwardOps: []WorkspacePatchOp{{Op: "remove", Path: "/docsById/doc_new"}, {Op: "replace", Path: "/treeById", Value: json.RawMessage(oldTreeByID)}},
		ReverseOps: []WorkspacePatchOp{{Op: "replace", Path: "/treeById", Value: json.RawMessage(newTreeByID)}, {Op: "add", Path: "/docsById/doc_new", Value: json.RawMessage(newDocument)}},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "workspace",
	}
	beforeRemove := cloneWorkspaceCommitDocuments(state.Documents)
	if err := state.apply([]WorkspaceCommandEnvelope{remove}); err != nil {
		t.Fatalf("stage remove: %v", err)
	}
	removeChanges, err := buildWorkspaceCommitChanges(
		"ws_1", beforeRemove, state.Documents, newTreeJSON, oldTreeJSON,
		json.RawMessage(testCommitRouteJSON), json.RawMessage(testCommitRouteJSON), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("build remove changes: %v", err)
	}
	if !removeChanges.TreeChanged || len(removeChanges.RemovedDocumentIDs) != 1 || removeChanges.RemovedDocumentIDs[0] != "doc_new" {
		t.Fatalf("unexpected remove changes: %+v", removeChanges)
	}
}

func TestWorkspaceCommitMetadataDeltaRequiresWorkspaceRevision(t *testing.T) {
	state, treeJSON := newTestWorkspaceCommitState(t)
	before := cloneWorkspaceCommitDocuments(state.Documents)
	document := state.Documents["doc_code"]
	document.Name = "Main source"
	state.Documents["doc_code"] = document
	changes, err := buildWorkspaceCommitChanges(
		"ws_1", before, state.Documents, treeJSON, treeJSON,
		json.RawMessage(testCommitRouteJSON), json.RawMessage(testCommitRouteJSON), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("build changes: %v", err)
	}
	if !changes.WorkspaceChanged {
		t.Fatalf("metadata delta must change workspace revision: %+v", changes)
	}
	if err := validateWorkspaceCommitChangesAgainstRequirements(
		before,
		state.Documents,
		changes,
		workspaceCommitRequirements{Documents: map[string]workspaceCommitDocumentRequirement{
			"doc_code": {Meta: true},
		}},
	); err == nil {
		t.Fatal("expected missing workspace revision requirement rejection")
	}
}

func TestWorkspaceCommitRejectsOperationsWithoutDurableAuthoringDelta(t *testing.T) {
	testOnly := testCommitDocumentCommand(
		"cmd_test_only",
		[]WorkspacePatchOp{{Op: "test", Path: "/source", Value: json.RawMessage(`"before"`)}},
		[]WorkspacePatchOp{{Op: "test", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	sameValue := testCommitDocumentCommand(
		"cmd_same_value",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	change := testCommitDocumentCommand(
		"cmd_change",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"middle"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	restore := testCommitDocumentCommand(
		"cmd_restore",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"middle"`)}},
	)
	tests := []struct {
		name     string
		commands []WorkspaceCommandEnvelope
	}{
		{name: "pure test", commands: []WorkspaceCommandEnvelope{testOnly}},
		{name: "same-value replace", commands: []WorkspaceCommandEnvelope{sameValue}},
		{name: "transaction restores base", commands: []WorkspaceCommandEnvelope{change, restore}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state, treeJSON := newTestWorkspaceCommitState(t)
			before := cloneWorkspaceCommitDocuments(state.Documents)
			if err := state.apply(test.commands); err != nil {
				t.Fatalf("apply commands: %v", err)
			}
			finalTreeJSON, err := (workspaceVFSTree{TreeRootID: state.TreeRootID, TreeByID: state.TreeByID}).marshal()
			if err != nil {
				t.Fatalf("marshal final tree: %v", err)
			}
			changes, err := buildWorkspaceCommitChanges(
				"ws_1", before, state.Documents, treeJSON, finalTreeJSON,
				json.RawMessage(testCommitRouteJSON), json.RawMessage(testCommitRouteJSON), time.Now().UTC(),
			)
			if err != nil {
				t.Fatalf("build changes: %v", err)
			}
			requirements, err := analyzeWorkspaceOperationRequirements(test.commands)
			if err != nil {
				t.Fatalf("analyze requirements: %v", err)
			}
			if err := validateWorkspaceCommitChangesAgainstRequirements(before, state.Documents, changes, requirements); err != nil {
				t.Fatalf("validate declared changes: %v", err)
			}
			if err := validateWorkspaceCommitHasDurableDelta(changes); err == nil {
				t.Fatalf("expected no-delta rejection: %+v", changes)
			}
		})
	}
}

func TestWorkspaceCommitAllowsTestReadDependencyWithAnotherDocumentMutation(t *testing.T) {
	state, _ := newTestWorkspaceCommitState(t)
	parentID := "root"
	root := state.TreeByID[parentID]
	root.Children = append(root.Children, "guard-node")
	state.TreeByID[parentID] = root
	state.TreeByID["guard-node"] = workspaceVFSNode{
		ID:       "guard-node",
		Kind:     "doc",
		Name:     "guard.ts",
		ParentID: &parentID,
		DocID:    "doc_guard",
	}
	state.Documents["doc_guard"] = WorkspaceDocumentRecord{
		WorkspaceID: "ws_1",
		ID:          "doc_guard",
		Type:        WorkspaceDocumentTypeCode,
		Name:        "guard.ts",
		Path:        "/guard.ts",
		ContentRev:  7,
		MetaRev:     1,
		Content:     json.RawMessage(`{"language":"ts","source":"guard"}`),
		UpdatedAt:   time.Now().UTC(),
	}
	if err := state.validate(); err != nil {
		t.Fatalf("validate baseline: %v", err)
	}
	before := cloneWorkspaceCommitDocuments(state.Documents)
	baseTreeJSON, err := (workspaceVFSTree{TreeRootID: state.TreeRootID, TreeByID: state.TreeByID}).marshal()
	if err != nil {
		t.Fatalf("marshal base tree: %v", err)
	}
	guard := testCommitDocumentCommand(
		"cmd_guard",
		[]WorkspacePatchOp{{Op: "test", Path: "/source", Value: json.RawMessage(`"guard"`)}},
		[]WorkspacePatchOp{{Op: "test", Path: "/source", Value: json.RawMessage(`"guard"`)}},
	)
	guard.Target.DocumentID = "doc_guard"
	mutation := testCommitDocumentCommand(
		"cmd_mutation",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"after"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	commands := []WorkspaceCommandEnvelope{guard, mutation}
	if err := state.apply(commands); err != nil {
		t.Fatalf("apply guarded mutation: %v", err)
	}
	changes, err := buildWorkspaceCommitChanges(
		"ws_1", before, state.Documents, baseTreeJSON, baseTreeJSON,
		json.RawMessage(testCommitRouteJSON), json.RawMessage(testCommitRouteJSON), time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("build changes: %v", err)
	}
	requirements, err := analyzeWorkspaceOperationRequirements(commands)
	if err != nil {
		t.Fatalf("analyze requirements: %v", err)
	}
	if !requirements.Documents["doc_guard"].Content || !requirements.Documents["doc_code"].Content {
		t.Fatalf("test and mutation documents must both be CAS dependencies: %+v", requirements.Documents)
	}
	if err := validateWorkspaceCommitChangesAgainstRequirements(before, state.Documents, changes, requirements); err != nil {
		t.Fatalf("validate guarded mutation: %v", err)
	}
	if err := validateWorkspaceCommitHasDurableDelta(changes); err != nil {
		t.Fatalf("expected durable mutation: %v", err)
	}
	if len(changes.UpdatedDocuments) != 1 || changes.UpdatedDocuments[0].ID != "doc_code" {
		t.Fatalf("expected only the mutated document in the durable delta: %+v", changes)
	}
}
