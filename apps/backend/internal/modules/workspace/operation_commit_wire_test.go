package workspace

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func TestDecodeWorkspaceCommitProjectionRejectsExplicitNullOptionalDocumentFields(t *testing.T) {
	for _, field := range []string{"name", "capabilities", "updatedAt"} {
		t.Run(field, func(t *testing.T) {
			payload := json.RawMessage(fmt.Sprintf(`{
				"treeRootId":"root",
				"treeById":{},
				"docsById":{
					"doc_1":{
						"id":"doc_1",
						"type":"code",
						"path":"/main.ts",
						"contentRev":1,
						"metaRev":1,
						"content":{"language":"ts","source":"export {};"},
						%q:null
					}
				}
			}`, field))
			if _, err := decodeWorkspaceCommitProjection(payload); err == nil {
				t.Fatalf("expected explicit null %s to be rejected", field)
			}
		})
	}
}

func TestDecodeWorkspaceCommitProjectionAllowsOmittedOptionalDocumentFields(t *testing.T) {
	payload := json.RawMessage(`{
		"treeRootId":"root",
		"treeById":{},
		"docsById":{
			"doc_1":{
				"id":"doc_1",
				"type":"code",
				"path":"/main.ts",
				"contentRev":1,
				"metaRev":1,
				"content":{"language":"ts","source":"export {};"}
			}
		}
	}`)
	if _, err := decodeWorkspaceCommitProjection(payload); err != nil {
		t.Fatalf("omitted optional document fields must remain valid: %v", err)
	}
}

func TestWorkspaceCommitExpectedRevisionsRejectUnsafeJSONIntegers(t *testing.T) {
	for _, payload := range []string{
		`{"workspaceRev":9007199254740992,"documents":[]}`,
		`{"routeRev":9007199254740992,"documents":[]}`,
		`{"documents":[{"id":"doc_1","contentRev":9007199254740992}]}`,
		`{"documents":[{"id":"doc_1","metaRev":9007199254740992}]}`,
	} {
		var expected WorkspaceOperationCommitExpected
		if err := json.Unmarshal([]byte(payload), &expected); err == nil {
			t.Fatalf("expected unsafe revision to be rejected: %s", payload)
		}
	}
}

func TestWorkspaceCommitReverseTestsContributeExactReadDependencies(t *testing.T) {
	selectionCommand := WorkspaceCommandEnvelope{
		ID:         "selection_with_reverse_guard",
		Namespace:  "core.workspace",
		Type:       "selection.restore",
		Version:    "1.0",
		IssuedAt:   mustParseTestTime(t, "2026-07-12T00:00:00Z"),
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "workspace",
		ForwardOps: []WorkspacePatchOp{{Op: "replace", Path: "/activeDocumentId", Value: json.RawMessage(`"doc_code"`)}},
		ReverseOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/activeDocumentId", Value: json.RawMessage(`"doc_other"`)},
			{Op: "test", Path: "/docsById/doc_guard/path", Value: json.RawMessage(`"/guard.ts"`)},
		},
	}
	documentCommand := WorkspaceCommandEnvelope{
		ID:         "document_mutation",
		Namespace:  "core.code",
		Type:       "source.update",
		Version:    "1.0",
		IssuedAt:   mustParseTestTime(t, "2026-07-12T00:00:00Z"),
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1", DocumentID: "doc_code"},
		DomainHint: "code",
		ForwardOps: []WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"after"`)}},
		ReverseOps: []WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	}

	requirements, err := analyzeWorkspaceOperationRequirements([]WorkspaceCommandEnvelope{selectionCommand, documentCommand})
	if err != nil {
		t.Fatalf("analyze requirements: %v", err)
	}
	if !requirements.Workspace || requirements.Route {
		t.Fatalf("unexpected aggregate requirements: %+v", requirements)
	}
	if !requirements.Documents["doc_guard"].Meta || requirements.Documents["doc_guard"].Content {
		t.Fatalf("reverse metadata test must require only metaRev: %+v", requirements.Documents)
	}
	if !requirements.Documents["doc_code"].Content {
		t.Fatalf("document mutation must retain content CAS: %+v", requirements.Documents)
	}
}

func TestWorkspaceCommitReverseTestOnNewDocumentNeedsNoBaselineCAS(t *testing.T) {
	command := WorkspaceCommandEnvelope{
		ID:         "add_with_reverse_guard",
		Namespace:  "core.workspace",
		Type:       "document.create",
		Version:    "1.0",
		IssuedAt:   mustParseTestTime(t, "2026-07-12T00:00:00Z"),
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "workspace",
		ForwardOps: []WorkspacePatchOp{{
			Op:   "add",
			Path: "/docsById/doc_new",
			Value: json.RawMessage(`{
				"id":"doc_new",
				"type":"code",
				"path":"/new.ts",
				"contentRev":1,
				"metaRev":1,
				"content":{"language":"ts","source":"export {};"}
			}`),
		}},
		ReverseOps: []WorkspacePatchOp{
			{Op: "test", Path: "/docsById/doc_new/path", Value: json.RawMessage(`"/new.ts"`)},
			{Op: "remove", Path: "/docsById/doc_new"},
		},
	}

	requirements, err := analyzeWorkspaceOperationRequirements([]WorkspaceCommandEnvelope{command})
	if err != nil {
		t.Fatalf("analyze requirements: %v", err)
	}
	requirement := requirements.Documents["doc_new"]
	if !requirement.Absent || requirement.Content || requirement.Meta {
		t.Fatalf("new document must retain only its absence CAS: %+v", requirement)
	}
}

func mustParseTestTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse test time: %v", err)
	}
	return parsed
}

func TestWorkspaceCommitRevisionCapacityRejectsUnsafeAdvancement(t *testing.T) {
	testCases := []struct {
		name      string
		workspace WorkspaceRecord
		changes   workspaceCommitChanges
	}{
		{
			name:      "op sequence",
			workspace: WorkspaceRecord{WorkspaceRev: 1, RouteRev: 1, OpSeq: maxJSONSafeInteger},
			changes:   workspaceCommitChanges{},
		},
		{
			name:      "workspace revision",
			workspace: WorkspaceRecord{WorkspaceRev: maxJSONSafeInteger, RouteRev: 1, OpSeq: 1},
			changes:   workspaceCommitChanges{WorkspaceChanged: true},
		},
		{
			name:      "route revision",
			workspace: WorkspaceRecord{WorkspaceRev: 1, RouteRev: maxJSONSafeInteger, OpSeq: 1},
			changes:   workspaceCommitChanges{RouteChanged: true},
		},
		{
			name:      "document revision",
			workspace: WorkspaceRecord{WorkspaceRev: 1, RouteRev: 1, OpSeq: 1},
			changes: workspaceCommitChanges{DocumentsToWrite: []WorkspaceDocumentRecord{{
				ID:         "doc_1",
				ContentRev: maxJSONSafeInteger + 1,
				MetaRev:    1,
			}}},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if err := validateWorkspaceCommitRevisionCapacity(&testCase.workspace, &testCase.changes); err == nil {
				t.Fatal("expected unsafe revision advancement to be rejected")
			}
		})
	}
}
