package workspace

import (
	"errors"
	"testing"
)

func TestStandaloneDomainDocumentValidation(t *testing.T) {
	tests := []struct {
		name         string
		documentType WorkspaceDocumentType
		content      string
		wantError    error
	}{
		{
			name:         "nodegraph current ports and executor",
			documentType: WorkspaceDocumentTypePIRGraph,
			content:      `{"version":1,"nodes":[{"id":"source","type":"graphNode","data":{"kind":"code"},"ports":[{"id":"out.control.next","direction":"output","kind":"control"}],"executor":{"slotId":"nodegraph-code-slot:source","reference":{"artifactId":"artifact-source","exportName":"run","sourceSpan":{"artifactId":"artifact-source","startLine":1,"startColumn":1,"endLine":1,"endColumn":4}}}},{"id":"target","data":{"kind":"process"},"ports":[{"id":"in.control.prev","direction":"input","kind":"control"}]}],"edges":[{"id":"edge","source":"source","target":"target","sourceHandle":"out.control.next","targetHandle":"in.control.prev"}]}`,
		},
		{
			name:         "nodegraph rejects legacy maps",
			documentType: WorkspaceDocumentTypePIRGraph,
			content:      `{"version":1,"nodesById":{},"edgesById":{}}`,
			wantError:    ErrNodeGraphValidationFailed,
		},
		{
			name:         "nodegraph rejects dangling edges",
			documentType: WorkspaceDocumentTypePIRGraph,
			content:      `{"version":1,"nodes":[{"id":"source","data":{}}],"edges":[{"id":"edge","source":"source","target":"missing"}]}`,
			wantError:    ErrNodeGraphValidationFailed,
		},
		{
			name:         "animation current",
			documentType: WorkspaceDocumentTypePIRAnimation,
			content:      `{"version":1,"target":{"kind":"pir-document","documentId":"page"},"timelines":[],"svgFilters":[]}`,
		},
		{
			name:         "animation requires target",
			documentType: WorkspaceDocumentTypePIRAnimation,
			content:      `{"version":1,"timelines":[]}`,
			wantError:    ErrAnimationValidationFailed,
		},
		{
			name:         "animation rejects legacy maps",
			documentType: WorkspaceDocumentTypePIRAnimation,
			content:      `{"version":1,"target":{"kind":"pir-document","documentId":"page"},"timelinesById":{}}`,
			wantError:    ErrAnimationValidationFailed,
		},
		{
			name:         "design tokens current",
			documentType: WorkspaceDocumentTypeDesignTokens,
			content:      `{"scale":{"$type":"number","base":{"$value":1}}}`,
		},
		{
			name:         "design token resolver current",
			documentType: WorkspaceDocumentTypeTokenResolver,
			content:      `{"version":"2025.10","modifiers":{"theme":{"contexts":{"light":[],"dark":[]},"default":"light"}},"resolutionOrder":[{"$ref":"#/modifiers/theme"}]}`,
		},
		{
			name:         "design token resolver requires contexts",
			documentType: WorkspaceDocumentTypeTokenResolver,
			content:      `{"version":"2025.10","modifiers":{"theme":{"contexts":{}}},"resolutionOrder":[]}`,
			wantError:    ErrDesignTokenResolverValidationFailed,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateWorkspaceDocumentContent(test.documentType, mustRaw(test.content))
			if test.wantError == nil && err != nil {
				t.Fatalf("expected valid document, got %v", err)
			}
			if test.wantError != nil && !errors.Is(err, test.wantError) {
				t.Fatalf("expected %v, got %v", test.wantError, err)
			}
		})
	}
}

func TestStandaloneDomainPatchPathsUseCurrentCollections(t *testing.T) {
	for _, path := range []string{"/version", "/nodes/-", "/edges/0/target"} {
		if err := validateWorkspaceNodeGraphPatchPath(path); err != nil {
			t.Fatalf("expected NodeGraph path %s to be allowed: %v", path, err)
		}
	}
	for _, path := range []string{"/nodesById/node", "/edgesById/edge", "/metadata"} {
		if !errors.Is(validateWorkspaceNodeGraphPatchPath(path), ErrWorkspacePatchPathForbidden) {
			t.Fatalf("expected legacy NodeGraph path %s to be rejected", path)
		}
	}
	for _, path := range []string{"/version", "/target/documentId", "/timelines/-", "/svgFilters"} {
		if err := validateWorkspaceAnimationPatchPath(path); err != nil {
			t.Fatalf("expected Animation path %s to be allowed: %v", path, err)
		}
	}
	for _, path := range []string{"/timelinesById/timeline", "/tracksById/track", "/metadata"} {
		if !errors.Is(validateWorkspaceAnimationPatchPath(path), ErrWorkspacePatchPathForbidden) {
			t.Fatalf("expected legacy Animation path %s to be rejected", path)
		}
	}
}
