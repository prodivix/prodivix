package workspace

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	"github.com/jackc/pgx/v5/pgconn"
)

const bootstrapInsertWorkspaceQuery = `INSERT INTO workspaces (
	id, project_id, owner_id, name, workspace_rev, route_rev, op_seq, tree_root_id, tree_json, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`

const bootstrapInsertRouteQuery = `INSERT INTO workspace_routes (workspace_id, manifest_json, updated_at)
VALUES ($1, $2::jsonb, $3)`

const bootstrapInsertDocumentQuery = `INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`

const bootstrapReadWorkspaceQuery = `SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq, w.tree_root_id, w.tree_json, w.created_at, w.updated_at, r.manifest_json, s.settings_json
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
LEFT JOIN workspace_settings s ON s.workspace_id = w.id
WHERE w.id = $1 AND w.owner_id = $2`

const bootstrapReadDocumentsQuery = `SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`

func TestBootstrapProjectWorkspaceCommitsCanonicalSnapshotAtomically(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	expectBootstrapWorkspaceAndRouteInserts(mock)
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
		WithArgs(
			"project_1",
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

	if err := bootstrapTestModule(db).BootstrapProjectWorkspace(context.Background(), bootstrapTestProject()); err != nil {
		t.Fatalf("bootstrap fresh workspace: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL activity: %v", err)
	}
}

func TestBootstrapProjectWorkspaceRollsBackWhenDocumentInsertFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	insertErr := errors.New("insert root document failed")
	expectBootstrapWorkspaceAndRouteInserts(mock)
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
		WithArgs(
			"project_1",
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

	err = bootstrapTestModule(db).BootstrapProjectWorkspace(context.Background(), bootstrapTestProject())
	if !errors.Is(err, insertErr) {
		t.Fatalf("expected document insert error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL activity: %v", err)
	}
}

func TestBootstrapProjectWorkspaceAcceptsOnlyMatchingCompleteUniqueReplay(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	expectBootstrapWorkspaceInsertCollision(mock)
	expectBootstrapSnapshotRead(mock, "project_1", "project_1", "owner_1")

	if err := bootstrapTestModule(db).BootstrapProjectWorkspace(context.Background(), bootstrapTestProject()); err != nil {
		t.Fatalf("verify matching unique replay: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL activity: %v", err)
	}
}

func TestBootstrapProjectWorkspaceDoesNotSwallowUnverifiedUniqueReplay(t *testing.T) {
	tests := []struct {
		name            string
		replayedID      string
		replayedProject string
		replayedOwner   string
		missing         bool
	}{
		{name: "missing replay", missing: true},
		{name: "workspace id mismatch", replayedID: "workspace_other", replayedProject: "project_1", replayedOwner: "owner_1"},
		{name: "project id mismatch", replayedID: "project_1", replayedProject: "project_other", replayedOwner: "owner_1"},
		{name: "owner id mismatch", replayedID: "project_1", replayedProject: "project_1", replayedOwner: "owner_other"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()

			expectBootstrapWorkspaceInsertCollision(mock)
			if test.missing {
				mock.ExpectQuery(regexp.QuoteMeta(bootstrapReadWorkspaceQuery)).
					WithArgs("project_1", "owner_1").
					WillReturnError(sql.ErrNoRows)
			} else {
				expectBootstrapSnapshotRead(mock, test.replayedID, test.replayedProject, test.replayedOwner)
			}

			err = bootstrapTestModule(db).BootstrapProjectWorkspace(context.Background(), bootstrapTestProject())
			if err == nil {
				t.Fatal("expected unverified unique replay to fail")
			}
			if !isUniqueViolation(err) {
				t.Fatalf("expected original unique collision to remain wrapped, got %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected SQL activity: %v", err)
			}
		})
	}
}

func bootstrapTestModule(db *sql.DB) *Module {
	return NewModule(NewWorkspaceStore(db), nil)
}

func bootstrapTestProject() *backendproject.Project {
	return &backendproject.Project{
		ID:      "project_1",
		OwnerID: "owner_1",
		Name:    "Project One",
		PIR:     append([]byte(nil), defaultPIRDocument...),
	}
}

func expectBootstrapWorkspaceAndRouteInserts(mock sqlmock.Sqlmock) {
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertWorkspaceQuery)).
		WithArgs(
			"project_1",
			"project_1",
			"owner_1",
			"Project One",
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
		WithArgs("project_1", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
}

func expectBootstrapWorkspaceInsertCollision(mock sqlmock.Sqlmock) {
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertWorkspaceQuery)).
		WithArgs(
			"project_1",
			"project_1",
			"owner_1",
			"Project One",
			int64(1),
			int64(1),
			int64(1),
			"root",
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
		).
		WillReturnError(&pgconn.PgError{Code: "23505", ConstraintName: "workspaces_pkey", Message: "duplicate workspace"})
	mock.ExpectRollback()
}

func expectBootstrapSnapshotRead(mock sqlmock.Sqlmock, workspaceID string, projectID string, ownerID string) {
	now := time.Date(2026, time.July, 12, 10, 0, 0, 0, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta(bootstrapReadWorkspaceQuery)).
		WithArgs("project_1", "owner_1").
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"project_id",
			"owner_id",
			"name",
			"workspace_rev",
			"route_rev",
			"op_seq",
			"tree_root_id",
			"tree_json",
			"created_at",
			"updated_at",
			"manifest_json",
			"settings_json",
		}).AddRow(
			workspaceID,
			projectID,
			ownerID,
			"Project One",
			1,
			1,
			1,
			"root",
			[]byte(defaultWorkspaceTreeWithRootDocumentJSON("root")),
			now,
			now,
			[]byte(defaultWorkspaceRouteManifest),
			nil,
		))
	mock.ExpectQuery(regexp.QuoteMeta(bootstrapReadDocumentsQuery)).
		WithArgs("project_1").
		WillReturnRows(sqlmock.NewRows([]string{
			"workspace_id",
			"id",
			"doc_type",
			"name",
			"path",
			"content_rev",
			"meta_rev",
			"content_json",
			"capabilities_json",
			"updated_at",
		}).AddRow(
			"project_1",
			"doc_root",
			"pir-page",
			"pir.json",
			"/pir.json",
			1,
			1,
			[]byte(defaultPIRDocument),
			[]byte(`[]`),
			now,
		))
}
