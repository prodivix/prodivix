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
		{
			name:         "binary asset current reference",
			documentType: WorkspaceDocumentTypeAsset,
			content:      `{"kind":"asset","mime":"image/png","category":"image","size":0,"blob":{"kind":"workspace-blob","digest":"sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","byteLength":0,"mediaType":"image/png"},"metadata":{"originalFileName":"pixel.png","width":1,"height":1}}`,
		},
		{
			name:         "data source wire current",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{"catalog-api-key":{"kind":"secret-ref","reference":{"bindingId":"catalog-api-key"}}},"configurationByKey":{"baseUrl":{"kind":"literal","value":"https://example.test"},"authorization":{"kind":"secret-ref","reference":{"bindingId":"catalog-api-key"}}}},"schemasById":{"product-list":{"id":"product-list","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"array"}}},"operationsById":{"list-products":{"id":"list-products","kind":"query","outputSchemaId":"product-list","configurationByKey":{},"policies":{}}}}`,
		},
		{
			name:         "data source rejects value-bearing secret refs",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{"api-key":{"kind":"secret-ref","reference":{"bindingId":"api-key"},"value":"plaintext"}},"configurationByKey":{}},"schemasById":{"product-list":{"id":"product-list","schema":true}},"operationsById":{"list-products":{"id":"list-products","kind":"query","outputSchemaId":"product-list","configurationByKey":{},"policies":{}}}}`,
			wantError:    ErrDataSourceValidationFailed,
		},
		{
			name:         "data source cache policy current",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{},"configurationByKey":{}},"schemasById":{"products":{"id":"products","schema":true}},"operationsById":{"list-products":{"id":"list-products","kind":"query","outputSchemaId":"products","configurationByKey":{},"policies":{"cache":{"strategy":"stale-while-revalidate","ttlMs":1000,"staleWhileRevalidateMs":5000,"keyInputPaths":["/tenant","/filters/~0tag"]}}}}}`,
		},
		{
			name:         "data source rejects cache without ttl",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{},"configurationByKey":{}},"schemasById":{"products":{"id":"products","schema":true}},"operationsById":{"list-products":{"id":"list-products","kind":"query","outputSchemaId":"products","configurationByKey":{},"policies":{"cache":{"strategy":"cache-first"}}}}}`,
			wantError:    ErrDataSourceValidationFailed,
		},
		{
			name:         "data source rejects non pointer cache key",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{},"configurationByKey":{}},"schemasById":{"products":{"id":"products","schema":true}},"operationsById":{"list-products":{"id":"list-products","kind":"query","outputSchemaId":"products","configurationByKey":{},"policies":{"cache":{"strategy":"network-first","ttlMs":1000,"keyInputPaths":["tenant.id"]}}}}}`,
			wantError:    ErrDataSourceValidationFailed,
		},
		{
			name:         "data source optimistic policy current",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{},"configurationByKey":{}},"schemasById":{"product":{"id":"product","schema":true}},"operationsById":{"list-products":{"id":"list-products","kind":"query","outputSchemaId":"product","configurationByKey":{},"policies":{}},"update-product":{"id":"update-product","kind":"mutation","outputSchemaId":"product","configurationByKey":{},"policies":{"optimistic":{"kind":"crud","action":"update","target":{"documentId":"data-products","operationId":"list-products"},"entityIdPath":"/id","valueInputPath":"/item","valueOutputPath":"/item","rollback":"on-error"}}}}}`,
		},
		{
			name:         "data source rejects incomplete optimistic mapping",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{},"configurationByKey":{}},"schemasById":{"product":{"id":"product","schema":true}},"operationsById":{"update-product":{"id":"update-product","kind":"mutation","outputSchemaId":"product","configurationByKey":{},"policies":{"optimistic":{"kind":"crud","action":"update","target":{"documentId":"data-products","operationId":"list-products"},"entityIdPath":"id","valueInputPath":"/item","rollback":"on-error"}}}}}`,
			wantError:    ErrDataSourceValidationFailed,
		},
		{
			name:         "data source rejects automatic mutation retry",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{},"configurationByKey":{}},"schemasById":{"product":{"id":"product","schema":true}},"operationsById":{"create-product":{"id":"create-product","kind":"mutation","outputSchemaId":"product","configurationByKey":{},"policies":{"retry":{"maxAttempts":2,"backoff":"fixed","initialDelayMs":10}}}}}`,
			wantError:    ErrDataSourceValidationFailed,
		},
		{
			name:         "data source rejects ambiguous pagination inputs",
			documentType: WorkspaceDocumentTypeDataSource,
			content:      `{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{},"configurationByKey":{}},"schemasById":{"products":{"id":"products","schema":true}},"operationsById":{"list-products":{"id":"list-products","kind":"query","outputSchemaId":"products","configurationByKey":{},"policies":{"pagination":{"kind":"offset","offsetInput":"page","limitInput":"page","defaultLimit":20}}}}}`,
			wantError:    ErrDataSourceValidationFailed,
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

func TestBinaryAssetDocumentRejectsInlinePayloads(t *testing.T) {
	for _, field := range []string{"dataUrl", "text", "providerLocator"} {
		content := `{"kind":"asset","mime":"image/png","size":0,"blob":{"kind":"workspace-blob","digest":"sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","byteLength":0,"mediaType":"image/png"},"` + field + `":"forbidden"}`
		if err := validateWorkspaceDocumentContent(WorkspaceDocumentTypeAsset, mustRaw(content)); err == nil {
			t.Fatalf("expected inline field %s to be rejected", field)
		}
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
	for _, path := range []string{"/source/adapterId", "/schemasById/product", "/operationsById/list-products/policies"} {
		if err := validateWorkspaceDataSourcePatchPath(path); err != nil {
			t.Fatalf("expected Data source path %s to be allowed: %v", path, err)
		}
	}
	for _, path := range []string{"/wireVersion", "/secrets", "/metadata"} {
		if !errors.Is(validateWorkspaceDataSourcePatchPath(path), ErrWorkspacePatchPathForbidden) {
			t.Fatalf("expected Data source path %s to be rejected", path)
		}
	}
	for _, path := range []string{"/mime", "/size", "/blob/digest", "/metadata/width"} {
		if err := validateWorkspaceAssetPatchPath(path); err != nil {
			t.Fatalf("expected Binary Asset path %s to be allowed: %v", path, err)
		}
	}
	for _, path := range []string{"/dataUrl", "/text", "/providerLocator"} {
		if !errors.Is(validateWorkspaceAssetPatchPath(path), ErrWorkspacePatchPathForbidden) {
			t.Fatalf("expected inline Binary Asset path %s to be rejected", path)
		}
	}
}

func TestDataSourceOptimisticRelationAcceptsValueOutputPath(t *testing.T) {
	payload := mustRaw(`{"wireVersion":1,"source":{"id":"catalog","adapterId":"rest","runtimeZone":"server","bindingsById":{},"configurationByKey":{}},"schemasById":{"product":{"id":"product","schema":true}},"operationsById":{"list-products":{"id":"list-products","kind":"query","outputSchemaId":"product","configurationByKey":{},"policies":{}},"update-product":{"id":"update-product","kind":"mutation","outputSchemaId":"product","configurationByKey":{},"policies":{"optimistic":{"kind":"crud","action":"update","target":{"documentId":"data-products","operationId":"list-products"},"entityIdPath":"/id","valueInputPath":"/item","valueOutputPath":"/item","rollback":"on-error"}}}}}`)
	if err := validateDataSourceDocument(payload, "data-products"); err != nil {
		t.Fatalf("expected optimistic relation to accept valueOutputPath: %v", err)
	}
}
