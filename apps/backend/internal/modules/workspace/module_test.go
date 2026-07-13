package workspace

import (
	"encoding/json"
	"testing"
)

func TestResolveWorkspacePublicationPIRPrefersRootPage(t *testing.T) {
	root := json.RawMessage(`{"version":"prodivix.pir@1","metadata":{"name":"root"},"ui":{"graph":{}}}`)
	child := json.RawMessage(`{"version":"prodivix.pir@1","metadata":{"name":"child"},"ui":{"graph":{}}}`)
	snapshot := &WorkspaceSnapshot{Documents: []WorkspaceDocumentRecord{
		{ID: "page-child", Type: WorkspaceDocumentTypePIRPage, Path: "/pages/about.pir.json", Content: child},
		{ID: "page-root", Type: WorkspaceDocumentTypePIRPage, Path: "/pir.json", Content: root},
	}}

	resolved, ok := ResolveWorkspacePublicationPIR(snapshot)
	if !ok {
		t.Fatal("expected publication PIR document")
	}
	if string(resolved) != string(root) {
		t.Fatalf("expected /pir.json document, got %s", resolved)
	}
}

func TestResolveWorkspacePublicationPIRRejectsNonPIRDocuments(t *testing.T) {
	snapshot := &WorkspaceSnapshot{Documents: []WorkspaceDocumentRecord{
		{ID: "code-index", Type: WorkspaceDocumentTypeCode, Path: "/code/index.ts", Content: json.RawMessage(`{"language":"ts","source":""}`)},
	}}

	if _, ok := ResolveWorkspacePublicationPIR(snapshot); ok {
		t.Fatal("expected workspace without a PIR page to be rejected")
	}
}
