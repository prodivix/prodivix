package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

const snapshotBoundaryTreeJSON = `{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc-code-node"]},"doc-code-node":{"id":"doc-code-node","kind":"doc","name":"main.ts","parentId":"root","docId":"doc-code"}}}`

func validSnapshotBoundaryImportParams() ImportWorkspaceSnapshotParams {
	return ImportWorkspaceSnapshotParams{
		WorkspaceID:   "ws_1",
		ProjectID:     "project_1",
		OwnerID:       "owner_1",
		WorkspaceRev:  1,
		RouteRev:      1,
		OpSeq:         1,
		Tree:          json.RawMessage(snapshotBoundaryTreeJSON),
		RouteManifest: json.RawMessage(`{"version":"1","root":{"id":"root"}}`),
		Settings:      json.RawMessage(`{}`),
		Documents: []WorkspaceImportDocumentRecord{{
			ID:         "doc-code",
			Type:       WorkspaceDocumentTypeCode,
			Path:       "/main.ts",
			ContentRev: 1,
			MetaRev:    1,
			Content:    json.RawMessage(`{"language":"ts","source":""}`),
		}},
	}
}

func TestImportWorkspaceSnapshotRejectsUnsafeRevisionsBeforeWriting(t *testing.T) {
	tests := []struct {
		name          string
		expectedField string
		mutate        func(*ImportWorkspaceSnapshotParams)
	}{
		{name: "workspace revision", expectedField: "workspaceRev", mutate: func(params *ImportWorkspaceSnapshotParams) { params.WorkspaceRev = maxJSONSafeInteger + 1 }},
		{name: "route revision", expectedField: "routeRev", mutate: func(params *ImportWorkspaceSnapshotParams) { params.RouteRev = maxJSONSafeInteger + 1 }},
		{name: "operation sequence", expectedField: "opSeq", mutate: func(params *ImportWorkspaceSnapshotParams) { params.OpSeq = maxJSONSafeInteger + 1 }},
		{name: "content revision", expectedField: "contentRev", mutate: func(params *ImportWorkspaceSnapshotParams) { params.Documents[0].ContentRev = maxJSONSafeInteger + 1 }},
		{name: "metadata revision", expectedField: "metaRev", mutate: func(params *ImportWorkspaceSnapshotParams) { params.Documents[0].MetaRev = maxJSONSafeInteger + 1 }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()
			params := validSnapshotBoundaryImportParams()
			test.mutate(&params)
			_, err = NewWorkspaceStore(db).ImportWorkspaceSnapshot(context.Background(), params)
			var limitErr *workspaceRevisionLimitError
			if !errors.As(err, &limitErr) || limitErr.Field != test.expectedField {
				t.Fatalf("expected %s revision limit error, got %T %v", test.expectedField, err, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected database access: %v", err)
			}
		})
	}
}

func TestImportWorkspaceSnapshotRejectsInvalidVFSAndRouteReferencesBeforeWriting(t *testing.T) {
	tests := []struct {
		name      string
		mutate    func(*ImportWorkspaceSnapshotParams)
		assertErr func(*testing.T, error)
	}{
		{
			name: "non-canonical tree identity",
			mutate: func(params *ImportWorkspaceSnapshotParams) {
				params.Tree = json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":[" doc-code-node "]}," doc-code-node ":{"id":" doc-code-node ","kind":"doc","name":"main.ts","parentId":"root","docId":"doc-code"}}}`)
			},
			assertErr: func(t *testing.T, err error) {
				t.Helper()
				if !errors.Is(err, ErrWorkspaceVFSInvalid) {
					t.Fatalf("expected VFS validation error, got %T %v", err, err)
				}
			},
		},
		{
			name: "incomplete document mounts",
			mutate: func(params *ImportWorkspaceSnapshotParams) {
				params.Tree = json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":[]}}}`)
			},
			assertErr: func(t *testing.T, err error) {
				t.Helper()
				if !errors.Is(err, ErrWorkspaceVFSInvalid) {
					t.Fatalf("expected VFS validation error, got %T %v", err, err)
				}
			},
		},
		{
			name: "missing route document",
			mutate: func(params *ImportWorkspaceSnapshotParams) {
				params.RouteManifest = json.RawMessage(`{"version":"1","root":{"id":"root","pageDocId":"missing-page"}}`)
			},
			assertErr: func(t *testing.T, err error) {
				t.Helper()
				var validationErr *RouteManifestValidationError
				if !errors.As(err, &validationErr) || len(validationErr.Issues) != 1 || validationErr.Issues[0].Path != "/root/pageDocId" {
					t.Fatalf("expected route document validation error, got %T %v", err, err)
				}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()
			params := validSnapshotBoundaryImportParams()
			test.mutate(&params)
			_, err = NewWorkspaceStore(db).ImportWorkspaceSnapshot(context.Background(), params)
			test.assertErr(t, err)
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected database access: %v", err)
			}
		})
	}
}

func snapshotBoundaryWorkspaceQuery() string {
	return regexp.QuoteMeta(`SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq, w.tree_root_id, w.tree_json, w.created_at, w.updated_at, r.manifest_json, s.settings_json
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
LEFT JOIN workspace_settings s ON s.workspace_id = w.id
WHERE w.id = $1 AND w.owner_id = $2`)
}

func snapshotBoundaryDocumentQuery() string {
	return regexp.QuoteMeta(`SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`)
}

func snapshotBoundaryWorkspaceRows(workspaceRev int64, routeRev int64, opSeq int64, tree string, route string, now time.Time) *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "project_id", "owner_id", "name", "workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json", "created_at", "updated_at", "manifest_json", "settings_json",
	}).AddRow("ws_1", "project_1", "owner_1", "Workspace", workspaceRev, routeRev, opSeq, "root", []byte(tree), now, now, []byte(route), []byte(`{}`))
}

func snapshotBoundaryDocumentRows(contentRev int64, metaRev int64, now time.Time) *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"workspace_id", "id", "doc_type", "name", "path", "content_rev", "meta_rev", "content_json", "capabilities_json", "updated_at",
	}).AddRow("ws_1", "doc-code", "code", "main.ts", "/main.ts", contentRev, metaRev, []byte(`{"language":"ts","source":""}`), []byte(`[]`), now)
}

func TestGetSnapshotForOwnerRejectsUnsafePersistedRevisions(t *testing.T) {
	tests := []struct {
		name          string
		workspaceRev  int64
		routeRev      int64
		opSeq         int64
		expectedField string
	}{
		{name: "workspace revision", workspaceRev: maxJSONSafeInteger + 1, routeRev: 1, opSeq: 1, expectedField: "workspaceRev"},
		{name: "route revision", workspaceRev: 1, routeRev: maxJSONSafeInteger + 1, opSeq: 1, expectedField: "routeRev"},
		{name: "operation sequence", workspaceRev: 1, routeRev: 1, opSeq: maxJSONSafeInteger + 1, expectedField: "opSeq"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()
			now := time.Date(2026, time.July, 12, 10, 0, 0, 0, time.UTC)
			mock.ExpectQuery(snapshotBoundaryWorkspaceQuery()).
				WithArgs("ws_1", "owner_1").
				WillReturnRows(snapshotBoundaryWorkspaceRows(test.workspaceRev, test.routeRev, test.opSeq, snapshotBoundaryTreeJSON, `{"version":"1","root":{"id":"root"}}`, now))
			_, err = NewWorkspaceStore(db).GetSnapshotForOwner(context.Background(), "owner_1", "ws_1")
			var limitErr *workspaceRevisionLimitError
			if !errors.As(err, &limitErr) || limitErr.Field != test.expectedField {
				t.Fatalf("expected %s revision limit error, got %T %v", test.expectedField, err, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("verify database expectations: %v", err)
			}
		})
	}
}

func TestGetSnapshotForOwnerRejectsInvalidPersistedDocumentState(t *testing.T) {
	tests := []struct {
		name          string
		tree          string
		route         string
		documentRows  *sqlmock.Rows
		expectedField string
		expectedVFS   bool
		expectedRoute bool
	}{
		{name: "content revision", tree: snapshotBoundaryTreeJSON, route: `{"version":"1","root":{"id":"root"}}`, documentRows: snapshotBoundaryDocumentRows(maxJSONSafeInteger+1, 1, time.Now().UTC()), expectedField: "contentRev"},
		{name: "metadata revision", tree: snapshotBoundaryTreeJSON, route: `{"version":"1","root":{"id":"root"}}`, documentRows: snapshotBoundaryDocumentRows(1, maxJSONSafeInteger+1, time.Now().UTC()), expectedField: "metaRev"},
		{name: "empty document set", tree: snapshotBoundaryTreeJSON, route: `{"version":"1","root":{"id":"root"}}`, documentRows: sqlmock.NewRows([]string{"workspace_id", "id", "doc_type", "name", "path", "content_rev", "meta_rev", "content_json", "capabilities_json", "updated_at"}), expectedVFS: true},
		{name: "non-canonical tree", tree: `{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":[" doc-code-node "]}," doc-code-node ":{"id":" doc-code-node ","kind":"doc","name":"main.ts","parentId":"root","docId":"doc-code"}}}`, route: `{"version":"1","root":{"id":"root"}}`, documentRows: snapshotBoundaryDocumentRows(1, 1, time.Now().UTC()), expectedVFS: true},
		{name: "missing route document", tree: snapshotBoundaryTreeJSON, route: `{"version":"1","root":{"id":"root","pageDocId":"missing-page"}}`, documentRows: snapshotBoundaryDocumentRows(1, 1, time.Now().UTC()), expectedRoute: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()
			now := time.Date(2026, time.July, 12, 10, 0, 0, 0, time.UTC)
			mock.ExpectQuery(snapshotBoundaryWorkspaceQuery()).
				WithArgs("ws_1", "owner_1").
				WillReturnRows(snapshotBoundaryWorkspaceRows(1, 1, 1, test.tree, test.route, now))
			mock.ExpectQuery(snapshotBoundaryDocumentQuery()).
				WithArgs("ws_1").
				WillReturnRows(test.documentRows)
			_, err = NewWorkspaceStore(db).GetSnapshotForOwner(context.Background(), "owner_1", "ws_1")
			switch {
			case test.expectedField != "":
				var limitErr *workspaceRevisionLimitError
				if !errors.As(err, &limitErr) || limitErr.Field != test.expectedField {
					t.Fatalf("expected %s revision limit error, got %T %v", test.expectedField, err, err)
				}
			case test.expectedVFS:
				if !errors.Is(err, ErrWorkspaceVFSInvalid) {
					t.Fatalf("expected VFS validation error, got %T %v", err, err)
				}
			case test.expectedRoute:
				var validationErr *RouteManifestValidationError
				if !errors.As(err, &validationErr) {
					t.Fatalf("expected route reference validation error, got %T %v", err, err)
				}
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("verify database expectations: %v", err)
			}
		})
	}
}
