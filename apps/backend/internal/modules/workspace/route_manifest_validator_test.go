package workspace

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

const canonicalRouteManifestJSON = `{
	"version":"1",
	"root":{
		"id":"root",
		"children":[{
			"id":"home",
			"segment":"",
			"outletBindings":{"default":{"outletNodeId":"outlet-home","pageDocId":"page-home"}},
			"runtime":{"loaderRef":{"artifactId":"artifact-loader","exportName":"loader"}}
		}]
	},
	"modules":{"account":{"moduleId":"account","version":"1","root":{"id":"account-root"}}},
	"mounts":[{"mountId":"account-mount","moduleRef":"account","mountPath":"","parentRouteNodeId":"home"}]
}`

func TestNormalizeRouteManifestPreservesCanonicalWireDocument(t *testing.T) {
	normalized, err := normalizeRouteManifestDocument(json.RawMessage(canonicalRouteManifestJSON))
	if err != nil {
		t.Fatalf("normalize route manifest: %v", err)
	}
	var expected any
	if err := json.Unmarshal([]byte(canonicalRouteManifestJSON), &expected); err != nil {
		t.Fatalf("decode expected manifest: %v", err)
	}
	var actual any
	if err := json.Unmarshal(normalized, &actual); err != nil {
		t.Fatalf("decode normalized manifest: %v", err)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("normalized manifest changed canonical fields:\nactual: %#v\nexpected: %#v", actual, expected)
	}
}

func TestNormalizeRouteManifestRejectsNonCanonicalWireShape(t *testing.T) {
	tests := []struct {
		name    string
		payload string
	}{
		{
			name:    "unknown manifest field",
			payload: `{"version":"1","root":{"id":"root"},"future":true}`,
		},
		{
			name:    "unknown route node field",
			payload: `{"version":"1","root":{"id":"root","seo":{}}}`,
		},
		{
			name:    "unknown outlet binding field",
			payload: `{"version":"1","root":{"id":"root","outletBindings":{"default":{"outletNodeId":"outlet","future":true}}}}`,
		},
		{
			name:    "unknown runtime field",
			payload: `{"version":"1","root":{"id":"root","runtime":{"future":true}}}`,
		},
		{
			name:    "unknown code reference field",
			payload: `{"version":"1","root":{"id":"root","runtime":{"loaderRef":{"artifactId":"artifact","future":true}}}}`,
		},
		{
			name:    "unknown module field",
			payload: `{"version":"1","root":{"id":"root"},"modules":{"account":{"moduleId":"account","version":"1","root":{"id":"account-root"},"future":true}}}`,
		},
		{
			name:    "unknown mount field",
			payload: `{"version":"1","root":{"id":"root"},"mounts":[{"mountId":"mount","moduleRef":"account","future":true}]}`,
		},
		{
			name:    "null optional field",
			payload: `{"version":"1","root":{"id":"root","children":null}}`,
		},
		{
			name:    "module key mismatch",
			payload: `{"version":"1","root":{"id":"root"},"modules":{"account":{"moduleId":"renamed","version":"1","root":{"id":"account-root"}}}}`,
		},
		{
			name:    "missing module version",
			payload: `{"version":"1","root":{"id":"root"},"modules":{"account":{"moduleId":"account","root":{"id":"account-root"}}}}`,
		},
		{
			name:    "identifier whitespace",
			payload: `{"version":"1","root":{"id":" root "}}`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := normalizeRouteManifestDocument(json.RawMessage(test.payload))
			if err == nil {
				t.Fatal("expected canonical route manifest rejection")
			}
			var validationErr *RouteManifestValidationError
			if !errors.As(err, &validationErr) {
				t.Fatalf("expected RouteManifestValidationError, got %T %v", err, err)
			}
			if len(validationErr.Issues) != 1 || validationErr.Issues[0].Code != "RTE-0006" {
				t.Fatalf("unexpected wire validation issues: %+v", validationErr.Issues)
			}
		})
	}
}

func TestValidateWorkspaceRouteDocumentReferencesCoversRootOutletsAndModules(t *testing.T) {
	manifest := json.RawMessage(`{
		"version":"1",
		"root":{
			"id":"root",
			"layoutDocId":"layout-shell",
			"children":[{
				"id":"home",
				"pageDocId":"page-home",
				"outletBindings":{"default":{"outletNodeId":"outlet-home","pageDocId":"outlet-page"}}
			}]
		},
		"modules":{"account":{"moduleId":"account","version":"1","root":{"id":"account-root","pageDocId":"module-page"}}}
	}`)
	validDocuments := map[string]WorkspaceDocumentRecord{
		"layout-shell": {ID: "layout-shell", Type: WorkspaceDocumentTypePIRLayout},
		"page-home":    {ID: "page-home", Type: WorkspaceDocumentTypePIRPage},
		"outlet-page":  {ID: "outlet-page", Type: WorkspaceDocumentTypePIRComponent},
		"module-page":  {ID: "module-page", Type: WorkspaceDocumentTypePIRComponent},
	}
	if err := validateWorkspaceRouteDocumentReferences(manifest, validDocuments); err != nil {
		t.Fatalf("validate canonical route document references: %v", err)
	}

	tests := []struct {
		name         string
		expectedPath string
		mutate       func(map[string]WorkspaceDocumentRecord)
	}{
		{
			name:         "missing root child page",
			expectedPath: "/root/children/0/pageDocId",
			mutate: func(documents map[string]WorkspaceDocumentRecord) {
				delete(documents, "page-home")
			},
		},
		{
			name:         "wrong root layout kind",
			expectedPath: "/root/layoutDocId",
			mutate: func(documents map[string]WorkspaceDocumentRecord) {
				document := documents["layout-shell"]
				document.Type = WorkspaceDocumentTypePIRPage
				documents["layout-shell"] = document
			},
		},
		{
			name:         "wrong outlet page kind",
			expectedPath: "/root/children/0/outletBindings/default/pageDocId",
			mutate: func(documents map[string]WorkspaceDocumentRecord) {
				document := documents["outlet-page"]
				document.Type = WorkspaceDocumentTypePIRLayout
				documents["outlet-page"] = document
			},
		},
		{
			name:         "wrong module page kind",
			expectedPath: "/modules/account/root/pageDocId",
			mutate: func(documents map[string]WorkspaceDocumentRecord) {
				document := documents["module-page"]
				document.Type = WorkspaceDocumentTypeCode
				documents["module-page"] = document
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			documents := make(map[string]WorkspaceDocumentRecord, len(validDocuments))
			for id, document := range validDocuments {
				documents[id] = document
			}
			test.mutate(documents)
			err := validateWorkspaceRouteDocumentReferences(manifest, documents)
			var validationErr *RouteManifestValidationError
			if !errors.As(err, &validationErr) || len(validationErr.Issues) != 1 {
				t.Fatalf("expected one route reference validation issue, got %T %v", err, err)
			}
			if validationErr.Issues[0].Path != test.expectedPath {
				t.Fatalf("unexpected issue path: %+v", validationErr.Issues[0])
			}
		})
	}
}

func TestNormalizeRouteManifestRejectsAmbiguousRouteGraphIdentity(t *testing.T) {
	tests := []struct {
		name    string
		payload string
	}{
		{
			name:    "wrong root identity",
			payload: `{"version":"1","root":{"id":"route-root"}}`,
		},
		{
			name:    "duplicate route identity",
			payload: `{"version":"1","root":{"id":"root","children":[{"id":"home"}]},"modules":{"account":{"moduleId":"account","version":"1","root":{"id":"home"}}}}`,
		},
		{
			name:    "missing module",
			payload: `{"version":"1","root":{"id":"root"},"mounts":[{"mountId":"mount","moduleRef":"missing"}]}`,
		},
		{
			name:    "missing parent route",
			payload: `{"version":"1","root":{"id":"root"},"modules":{"account":{"moduleId":"account","version":"1","root":{"id":"account-root"}}},"mounts":[{"mountId":"mount","moduleRef":"account","parentRouteNodeId":"missing"}]}`,
		},
		{
			name:    "duplicate mount identity",
			payload: `{"version":"1","root":{"id":"root"},"modules":{"account":{"moduleId":"account","version":"1","root":{"id":"account-root"}}},"mounts":[{"mountId":"mount","moduleRef":"account"},{"mountId":"mount","moduleRef":"account"}]}`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := normalizeRouteManifestDocument(json.RawMessage(test.payload))
			if err == nil {
				t.Fatal("expected route graph validation error")
			}
			var validationErr *RouteManifestValidationError
			if !errors.As(err, &validationErr) {
				t.Fatalf("expected RouteManifestValidationError, got %T %v", err, err)
			}
			if len(validationErr.Issues) == 0 {
				t.Fatal("expected route graph validation issues")
			}
		})
	}
}
