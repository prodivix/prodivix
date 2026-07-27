package workspace

import (
	"encoding/json"
	"testing"

	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/pircontract"
)

func bootstrapPublicationSnapshot(t *testing.T, resourceType backendproject.ResourceType) *WorkspaceSnapshot {
	t.Helper()
	bootstrap, err := createProjectWorkspaceBootstrap(resourceType, defaultPIRDocument)
	if err != nil {
		t.Fatalf("bootstrap %s workspace: %v", resourceType, err)
	}
	return &WorkspaceSnapshot{
		Workspace: WorkspaceRecord{ID: "ws_1", ProjectID: "ws_1", OwnerID: "owner_1"},
		Documents: toWorkspaceDocumentRecords("ws_1", bootstrap.Documents),
	}
}

// Every resource type must publish the document it owns, straight from its own
// bootstrap — a freshly created component or nodegraph that cannot publish is
// the permanent-500 defect this test pins down.
func TestPublicationResolvesEveryBootstrappedResourceType(t *testing.T) {
	for _, resourceType := range []backendproject.ResourceType{
		backendproject.ResourceTypeProject,
		backendproject.ResourceTypeComponent,
		backendproject.ResourceTypeNodeGraph,
	} {
		snapshot := bootstrapPublicationSnapshot(t, resourceType)
		published, ok := ResolveWorkspacePublicationPIR(resourceType, snapshot)
		if !ok {
			t.Fatalf("%s workspace resolved no publishable document", resourceType)
		}
		var decoded map[string]json.RawMessage
		if err := json.Unmarshal(published, &decoded); err != nil {
			t.Fatalf("%s publication payload is not a JSON document: %v", resourceType, err)
		}
		if resourceType == backendproject.ResourceTypeNodeGraph {
			// A nodegraph publishes its graph document, which follows the
			// nodegraph wire, not the PIR UI contract.
			continue
		}
		if _, hasUI := decoded["ui"]; !hasUI {
			t.Fatalf("%s publication PIR is missing its ui projection", resourceType)
		}
		// The community projection stores this payload in a PIR column, so the
		// resolved document has to satisfy the current wire contract.
		if err := pircontract.ValidateDocument(published); err != nil {
			t.Fatalf("%s publication PIR does not satisfy the current wire contract: %v", resourceType, err)
		}
	}
}

// The resolver must never substitute another type's document: a layout is not
// a page, a page is not a component, and a workspace missing its owner
// document is not publishable at all.
func TestPublicationRefusesCrossTypeSubstitution(t *testing.T) {
	layoutOnly := &WorkspaceSnapshot{
		Workspace: WorkspaceRecord{ID: "ws_1", ProjectID: "ws_1", OwnerID: "owner_1"},
		Documents: []WorkspaceDocumentRecord{{
			WorkspaceID: "ws_1",
			ID:          "doc_layout",
			Type:        WorkspaceDocumentTypePIRLayout,
			Path:        "/layouts/root.pir.json",
			Content:     defaultPIRDocument,
		}},
	}
	if _, ok := ResolveWorkspacePublicationPIR(backendproject.ResourceTypeProject, layoutOnly); ok {
		t.Fatal("a project without a page document published a layout instead")
	}

	pageOnly := bootstrapPublicationSnapshot(t, backendproject.ResourceTypeProject)
	if _, ok := ResolveWorkspacePublicationPIR(backendproject.ResourceTypeComponent, pageOnly); ok {
		t.Fatal("a component without a component document published a page instead")
	}
	if _, ok := ResolveWorkspacePublicationPIR(backendproject.ResourceTypeNodeGraph, pageOnly); ok {
		t.Fatal("a nodegraph without a graph document published a page instead")
	}
}
