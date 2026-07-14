package workspace

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"reflect"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
)

const atomicInsertProjectQuery = `INSERT INTO projects (id, owner_id, resource_type, name, description, published_pir_json, is_public, stars_count, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 0, $8, $9)`

const bootstrapInsertWorkspaceQuery = `INSERT INTO workspaces (
	id, project_id, owner_id, name, workspace_rev, route_rev, op_seq, tree_root_id, tree_json, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`

const bootstrapInsertRouteQuery = `INSERT INTO workspace_routes (workspace_id, manifest_json, updated_at)
VALUES ($1, $2::jsonb, $3)`

const bootstrapInsertDocumentQuery = `INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`

type semanticJSONArgument struct {
	expected json.RawMessage
}

func (argument semanticJSONArgument) Match(value driver.Value) bool {
	var payload []byte
	switch typed := value.(type) {
	case string:
		payload = []byte(typed)
	case []byte:
		payload = typed
	default:
		return false
	}
	var actual any
	var expected any
	return json.Unmarshal(payload, &actual) == nil &&
		json.Unmarshal(argument.expected, &expected) == nil &&
		reflect.DeepEqual(actual, expected)
}

func TestCreateProjectWorkspaceDispatchesCanonicalBootstrapByResourceType(t *testing.T) {
	componentPIR, err := ensureComponentPIRDocument(defaultPIRDocument)
	if err != nil {
		t.Fatalf("create component PIR: %v", err)
	}
	var componentDocument map[string]any
	if err := json.Unmarshal(componentPIR, &componentDocument); err != nil {
		t.Fatalf("decode component PIR: %v", err)
	}
	componentContract, ok := componentDocument["componentContract"].(map[string]any)
	if !ok {
		t.Fatal("component bootstrap must own a component contract")
	}
	if _, versioned := componentContract["version"]; versioned {
		t.Fatal("component bootstrap contract must use the unversioned current domain shape")
	}

	tests := []struct {
		name            string
		resourceType    backendproject.ResourceType
		initialPIR      json.RawMessage
		documentID      string
		documentType    WorkspaceDocumentType
		documentPath    string
		expectedContent json.RawMessage
		expectedRoute   json.RawMessage
	}{
		{
			name:            "project page",
			resourceType:    backendproject.ResourceTypeProject,
			initialPIR:      defaultPIRDocument,
			documentID:      "doc_root",
			documentType:    WorkspaceDocumentTypePIRPage,
			documentPath:    "/pir.json",
			expectedContent: defaultPIRDocument,
			expectedRoute:   json.RawMessage(`{"version":"1","root":{"id":"root","pageDocId":"doc_root"}}`),
		},
		{
			name:            "component definition",
			resourceType:    backendproject.ResourceTypeComponent,
			initialPIR:      defaultPIRDocument,
			documentID:      "doc_component",
			documentType:    WorkspaceDocumentTypePIRComponent,
			documentPath:    "/components/component.pir.json",
			expectedContent: componentPIR,
			expectedRoute:   json.RawMessage(`{"version":"1","root":{"id":"root","pageDocId":"doc_component"}}`),
		},
		{
			name:            "standalone nodegraph",
			resourceType:    backendproject.ResourceTypeNodeGraph,
			initialPIR:      json.RawMessage(`{"invalid":"pir must be ignored"}`),
			documentID:      "doc_graph",
			documentType:    WorkspaceDocumentTypePIRGraph,
			documentPath:    "/graphs/main.graph.json",
			expectedContent: defaultNodeGraphDocument,
			expectedRoute:   defaultWorkspaceRouteManifest,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()

			expectedTree, err := defaultWorkspaceTreeWithDocumentJSON("root", test.documentID, test.documentPath)
			if err != nil {
				t.Fatalf("create expected tree: %v", err)
			}
			mock.ExpectBegin()
			expectAtomicProjectInsert(mock, sqlmock.AnyArg(), "Resource One", test.resourceType)
			expectBootstrapWorkspaceAndRouteInserts(
				mock,
				sqlmock.AnyArg(),
				"Resource One",
				expectedTree,
				test.expectedRoute,
			)
			mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
				WithArgs(
					sqlmock.AnyArg(),
					test.documentID,
					string(test.documentType),
					workspacePathName(test.documentPath),
					test.documentPath,
					int64(1),
					int64(1),
					semanticJSONArgument{expected: test.expectedContent},
					`[]`,
					sqlmock.AnyArg(),
				).
				WillReturnResult(sqlmock.NewResult(1, 1))
			mock.ExpectCommit()

			project, err := atomicTestModule(db).CreateProjectWorkspace(
				context.Background(),
				"owner_1",
				"Resource One",
				"",
				test.resourceType,
				test.initialPIR,
			)
			if err != nil {
				t.Fatalf("create resource Workspace: %v", err)
			}
			if project == nil || project.ID == "" || project.IsPublic {
				t.Fatal("expected an unpublished prepared project identity")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected SQL activity: %v", err)
			}
		})
	}
}

func TestImportLocalProjectWorkspaceRollsBackMetadataWhenDocumentInsertFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	module := atomicTestModule(db)
	project, err := module.projects.PrepareProject(backendproject.PrepareProjectParams{
		OwnerID:      "owner_1",
		Name:         "Imported Project",
		ResourceType: backendproject.ResourceTypeProject,
	})
	if err != nil {
		t.Fatalf("prepare imported project: %v", err)
	}
	tree, err := defaultWorkspaceTreeWithDocumentJSON("root", "doc_root", "/pir.json")
	if err != nil {
		t.Fatalf("create import tree: %v", err)
	}

	insertErr := errors.New("insert root document failed")
	mock.ExpectBegin()
	expectAtomicProjectInsert(mock, project.ID, "Imported Project", backendproject.ResourceTypeProject)
	expectBootstrapWorkspaceAndRouteInserts(
		mock,
		project.ID,
		"Imported Project",
		tree,
		defaultWorkspaceRouteManifest,
	)
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
		WithArgs(
			project.ID,
			"doc_root",
			"pir-page",
			"pir.json",
			"/pir.json",
			int64(1),
			int64(1),
			sqlmock.AnyArg(),
			`[]`,
			sqlmock.AnyArg(),
		).
		WillReturnError(insertErr)
	mock.ExpectRollback()

	_, err = module.importPreparedProjectWorkspace(
		context.Background(),
		project,
		ImportWorkspaceSnapshotParams{
			Tree: tree,
			Documents: []WorkspaceImportDocumentRecord{
				{
					ID:      "doc_root",
					Type:    WorkspaceDocumentTypePIRPage,
					Path:    "/pir.json",
					Content: defaultPIRDocument,
				},
			},
		},
	)
	if !errors.Is(err, insertErr) {
		t.Fatalf("expected document insert error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL activity: %v", err)
	}
}

func atomicTestModule(db *sql.DB) *Module {
	return NewModule(NewWorkspaceStore(db), backendproject.NewProjectStore(db))
}

func expectAtomicProjectInsert(
	mock sqlmock.Sqlmock,
	projectID any,
	name string,
	resourceType backendproject.ResourceType,
) {
	mock.ExpectExec(regexp.QuoteMeta(atomicInsertProjectQuery)).
		WithArgs(
			projectID,
			"owner_1",
			string(resourceType),
			name,
			"",
			nil,
			false,
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
}

func expectBootstrapWorkspaceAndRouteInserts(
	mock sqlmock.Sqlmock,
	projectID any,
	name string,
	tree json.RawMessage,
	route json.RawMessage,
) {
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertWorkspaceQuery)).
		WithArgs(
			projectID,
			projectID,
			"owner_1",
			name,
			int64(1),
			int64(1),
			int64(1),
			"root",
			semanticJSONArgument{expected: tree},
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertRouteQuery)).
		WithArgs(projectID, semanticJSONArgument{expected: route}, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
}
