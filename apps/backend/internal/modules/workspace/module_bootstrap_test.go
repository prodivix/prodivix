package workspace

import (
	"context"
	"database/sql"
	"errors"
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

func TestCreateProjectWorkspaceCommitsMetadataAndCanonicalSnapshotAtomically(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	mock.ExpectBegin()
	expectAtomicProjectInsert(mock, sqlmock.AnyArg(), "Project One")
	expectBootstrapWorkspaceAndRouteInserts(mock, sqlmock.AnyArg(), "Project One")
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
		WithArgs(
			sqlmock.AnyArg(),
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
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	project, err := atomicTestModule(db).CreateProjectWorkspace(
		context.Background(),
		"owner_1",
		"Project One",
		"",
		backendproject.ResourceTypeProject,
		false,
		defaultPIRDocument,
	)
	if err != nil {
		t.Fatalf("create project Workspace: %v", err)
	}
	if project == nil || project.ID == "" {
		t.Fatal("expected prepared project identity")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL activity: %v", err)
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

	insertErr := errors.New("insert root document failed")
	mock.ExpectBegin()
	expectAtomicProjectInsert(mock, project.ID, "Imported Project")
	expectBootstrapWorkspaceAndRouteInserts(mock, project.ID, "Imported Project")
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
		nil,
		ImportWorkspaceSnapshotParams{
			Tree: defaultWorkspaceTreeWithRootDocumentJSON("root"),
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

func expectAtomicProjectInsert(mock sqlmock.Sqlmock, projectID any, name string) {
	mock.ExpectExec(regexp.QuoteMeta(atomicInsertProjectQuery)).
		WithArgs(
			projectID,
			"owner_1",
			"project",
			name,
			"",
			nil,
			false,
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
}

func expectBootstrapWorkspaceAndRouteInserts(mock sqlmock.Sqlmock, projectID any, name string) {
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
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertRouteQuery)).
		WithArgs(projectID, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
}
