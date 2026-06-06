package workspace

import (
	"encoding/json"
	"errors"
	"testing"
)

func mustRaw(value string) json.RawMessage {
	return json.RawMessage(value)
}

func TestApplyWorkspacePatchObjectAndArrayOps(t *testing.T) {
	source := mustRaw(`{"ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","type":"container"}},"childIdsById":{"root":["a","b"]}}}}`)
	patched, err := applyWorkspacePatch(source, []WorkspacePatchOp{
		{Op: "add", Path: "/ui/graph/nodesById/c", Value: mustRaw(`{"id":"c","type":"PdxText"}`)},
		{Op: "add", Path: "/ui/graph/childIdsById/root/1", Value: mustRaw(`"c"`)},
		{Op: "replace", Path: "/ui/graph/rootId", Value: mustRaw(`"root"`)},
		{Op: "remove", Path: "/ui/graph/childIdsById/root/0"},
	})
	if err != nil {
		t.Fatalf("apply patch: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(patched, &got); err != nil {
		t.Fatalf("unmarshal patched: %v", err)
	}
	children := got["ui"].(map[string]any)["graph"].(map[string]any)["childIdsById"].(map[string]any)["root"].([]any)
	if len(children) != 2 || children[0] != "c" || children[1] != "b" {
		t.Fatalf("unexpected children: %#v", children)
	}
}

func TestApplyWorkspacePatchCopyMoveAndTest(t *testing.T) {
	source := mustRaw(`{"ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","type":"container"},"a":{"id":"a","type":"Text"}},"childIdsById":{"root":["a"]}}}}`)
	patched, err := applyWorkspacePatch(source, []WorkspacePatchOp{
		{Op: "test", Path: "/ui/graph/nodesById/a/type", Value: mustRaw(`"Text"`)},
		{Op: "copy", From: "/ui/graph/nodesById/a", Path: "/ui/graph/nodesById/b"},
		{Op: "replace", Path: "/ui/graph/nodesById/b/id", Value: mustRaw(`"b"`)},
		{Op: "add", Path: "/ui/graph/childIdsById/root/-", Value: mustRaw(`"b"`)},
		{Op: "move", From: "/ui/graph/childIdsById/root/0", Path: "/ui/graph/childIdsById/root/2"},
	})
	if err != nil {
		t.Fatalf("apply patch: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(patched, &got); err != nil {
		t.Fatalf("unmarshal patched: %v", err)
	}
	children := got["ui"].(map[string]any)["graph"].(map[string]any)["childIdsById"].(map[string]any)["root"].([]any)
	if len(children) != 2 || children[0] != "b" || children[1] != "a" {
		t.Fatalf("unexpected moved children: %#v", children)
	}
}

func TestApplyWorkspacePatchRejectsForbiddenPath(t *testing.T) {
	_, err := applyWorkspacePatch(mustRaw(`{"ui":{"graph":{}}}`), []WorkspacePatchOp{
		{Op: "replace", Path: "/ui/root/type", Value: mustRaw(`"div"`)},
	})
	if !errors.Is(err, ErrWorkspacePatchPathForbidden) {
		t.Fatalf("expected forbidden path error, got %v", err)
	}
}

func TestApplyWorkspaceDocumentPatchAllowsCodeSource(t *testing.T) {
	patched, err := applyWorkspaceDocumentPatch(
		WorkspaceDocumentTypeCode,
		mustRaw(`{"language":"ts","source":"export function openDialog() {}"}`),
		[]WorkspacePatchOp{
			{Op: "replace", Path: "/source", Value: mustRaw(`"export function openDialog(id) { return id; }"`)},
		},
	)
	if err != nil {
		t.Fatalf("apply code patch: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(patched, &got); err != nil {
		t.Fatalf("unmarshal patched: %v", err)
	}
	if got["source"] != "export function openDialog(id) { return id; }" {
		t.Fatalf("unexpected source: %#v", got["source"])
	}
}

func TestApplyWorkspaceDocumentPatchRejectsPIRPathForCodeDocument(t *testing.T) {
	_, err := applyWorkspaceDocumentPatch(
		WorkspaceDocumentTypeCode,
		mustRaw(`{"language":"ts","source":"export function openDialog() {}"}`),
		[]WorkspacePatchOp{
			{Op: "add", Path: "/ui/graph", Value: mustRaw(`{}`)},
		},
	)
	if !errors.Is(err, ErrWorkspacePatchPathForbidden) {
		t.Fatalf("expected forbidden path error, got %v", err)
	}
}

func TestApplyWorkspacePatchIsPure(t *testing.T) {
	source := mustRaw(`{"ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","type":"container"}},"childIdsById":{"root":[]}}}}`)
	_, err := applyWorkspacePatch(source, []WorkspacePatchOp{
		{Op: "replace", Path: "/ui/graph/rootId", Value: mustRaw(`"root"`)},
	})
	if err != nil {
		t.Fatalf("apply patch: %v", err)
	}
	if string(source) != `{"ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","type":"container"}},"childIdsById":{"root":[]}}}}` {
		t.Fatalf("source mutated: %s", string(source))
	}
}
