package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

const routeReferenceDocumentQuery = `SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`

const routeReferenceManifestQuery = `SELECT manifest_json
FROM workspace_routes
WHERE workspace_id = $1`

const routeReferenceWorkspaceLockQuery = `SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`

const routeReferenceVFSWorkspaceLockQuery = `SELECT workspace_rev, route_rev, op_seq, tree_root_id, tree_json
FROM workspaces
WHERE id = $1
FOR UPDATE`

const routeReferencedDocumentTreeJSON = `{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["node_keep","node_page"]},"node_keep":{"id":"node_keep","kind":"doc","name":"keep.ts","parentId":"root","docId":"doc_keep"},"node_page":{"id":"node_page","kind":"doc","name":"page.pir.json","parentId":"root","docId":"doc_page"}}}`

const routeReferencedDirectoryTreeJSON = `{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["node_keep","dir_pages"]},"node_keep":{"id":"node_keep","kind":"doc","name":"keep.ts","parentId":"root","docId":"doc_keep"},"dir_pages":{"id":"dir_pages","kind":"dir","name":"pages","parentId":"root","children":["node_page"]},"node_page":{"id":"node_page","kind":"doc","name":"page.pir.json","parentId":"dir_pages","docId":"doc_page"}}}`

type routeReferenceTestDocument struct {
	id           string
	documentType WorkspaceDocumentType
	path         string
}

func TestWorkspaceStoreSaveRouteManifestRejectsInvalidDocumentReferencesBeforeWrite(t *testing.T) {
	tests := []struct {
		name          string
		manifest      json.RawMessage
		documents     []routeReferenceTestDocument
		expectedIssue string
	}{
		{
			name:          "missing page document",
			manifest:      json.RawMessage(`{"version":"1","root":{"id":"root","pageDocId":"doc_missing"}}`),
			documents:     []routeReferenceTestDocument{{id: "doc_page", documentType: WorkspaceDocumentTypePIRPage, path: "/page.pir.json"}},
			expectedIssue: "RTE-5007",
		},
		{
			name:          "wrong page document kind",
			manifest:      json.RawMessage(`{"version":"1","root":{"id":"root","pageDocId":"doc_layout"}}`),
			documents:     []routeReferenceTestDocument{{id: "doc_layout", documentType: WorkspaceDocumentTypePIRLayout, path: "/layout.pir.json"}},
			expectedIssue: "RTE-5008",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()
			issuedAt := time.Date(2026, time.July, 12, 11, 0, 0, 0, time.UTC)

			mock.ExpectBegin()
			mock.ExpectQuery(regexp.QuoteMeta(routeReferenceWorkspaceLockQuery)).
				WithArgs("ws_1").
				WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(8, 3, 11))
			expectRouteReferenceDocuments(mock, test.documents...)
			mock.ExpectRollback()

			_, mutationErr := NewWorkspaceStore(db).SaveRouteManifest(context.Background(), SaveRouteManifestParams{
				WorkspaceID:          "ws_1",
				ExpectedWorkspaceRev: 8,
				ExpectedRouteRev:     3,
				RouteManifest:        test.manifest,
				Command:              buildTestCommand("cmd_route_reference_guard", issuedAt, "ws_1", "", "core.route", "manifest.update"),
			})
			assertRouteReferenceValidationError(t, mutationErr, test.expectedIssue)
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("route write or other unexpected SQL activity occurred: %v", err)
			}
		})
	}
}

func TestWorkspaceStoreDeleteDocumentRejectsReferencedDocumentBeforeDelete(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	issuedAt := time.Date(2026, time.July, 12, 11, 1, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(routeReferenceVFSWorkspaceLockQuery)).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json"}).
			AddRow(8, 3, 11, "root", []byte(routeReferencedDocumentTreeJSON)))
	expectRouteReferenceDocuments(mock,
		routeReferenceTestDocument{id: "doc_keep", documentType: WorkspaceDocumentTypeCode, path: "/keep.ts"},
		routeReferenceTestDocument{id: "doc_page", documentType: WorkspaceDocumentTypePIRPage, path: "/page.pir.json"},
	)
	mock.ExpectQuery(regexp.QuoteMeta(routeReferenceManifestQuery)).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"manifest_json"}).
			AddRow([]byte(`{"version":"1","root":{"id":"root","pageDocId":"doc_page"}}`)))
	mock.ExpectRollback()

	_, mutationErr := NewWorkspaceStore(db).DeleteWorkspaceDocument(context.Background(), DeleteWorkspaceDocumentMutationParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 8,
		DocumentID:           "doc_page",
		Type:                 WorkspaceDocumentTypePIRPage,
		Command:              buildTestCommand("cmd_delete_referenced_document", issuedAt, "ws_1", "doc_page", "core.workspace", "document.delete"),
	})
	assertRouteReferenceValidationError(t, mutationErr, "RTE-5007")
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("delete or other unexpected SQL activity occurred: %v", err)
	}
}

func TestWorkspaceStoreDeleteDirectoryRejectsReferencedDescendantBeforeDeletes(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	issuedAt := time.Date(2026, time.July, 12, 11, 2, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(routeReferenceVFSWorkspaceLockQuery)).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json"}).
			AddRow(8, 3, 11, "root", []byte(routeReferencedDirectoryTreeJSON)))
	expectRouteReferenceDocuments(mock,
		routeReferenceTestDocument{id: "doc_keep", documentType: WorkspaceDocumentTypeCode, path: "/keep.ts"},
		routeReferenceTestDocument{id: "doc_page", documentType: WorkspaceDocumentTypePIRPage, path: "/pages/page.pir.json"},
	)
	mock.ExpectQuery(regexp.QuoteMeta(routeReferenceManifestQuery)).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"manifest_json"}).
			AddRow([]byte(`{"version":"1","root":{"id":"root","pageDocId":"doc_page"}}`)))
	mock.ExpectRollback()

	_, mutationErr := NewWorkspaceStore(db).DeleteWorkspaceDirectory(context.Background(), DeleteWorkspaceDirectoryMutationParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 8,
		NodeID:               "dir_pages",
		Command:              buildTestCommand("cmd_delete_referenced_directory", issuedAt, "ws_1", "", "core.workspace", "directory.delete"),
	})
	assertRouteReferenceValidationError(t, mutationErr, "RTE-5007")
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("recursive delete or other unexpected SQL activity occurred: %v", err)
	}
}

func expectRouteReferenceDocuments(mock sqlmock.Sqlmock, documents ...routeReferenceTestDocument) {
	rows := sqlmock.NewRows([]string{
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
	})
	updatedAt := time.Date(2026, time.July, 12, 10, 59, 0, 0, time.UTC)
	for _, document := range documents {
		content := []byte(defaultPIRDocument)
		if document.documentType == WorkspaceDocumentTypeCode {
			content = []byte(`{"language":"typescript","source":""}`)
		}
		rows.AddRow(
			"ws_1",
			document.id,
			string(document.documentType),
			workspacePathName(document.path),
			document.path,
			1,
			1,
			content,
			[]byte(`[]`),
			updatedAt,
		)
	}
	mock.ExpectQuery(regexp.QuoteMeta(routeReferenceDocumentQuery)).
		WithArgs("ws_1").
		WillReturnRows(rows)
}

func assertRouteReferenceValidationError(t *testing.T, err error, expectedIssue string) {
	t.Helper()
	var routeErr *RouteManifestValidationError
	if !errors.As(err, &routeErr) || len(routeErr.Issues) == 0 || routeErr.Issues[0].Code != expectedIssue {
		t.Fatalf("expected %s route reference validation error, got %v", expectedIssue, err)
	}
	failure := MapStoreError(err)
	if failure == nil || failure.Status != http.StatusUnprocessableEntity {
		t.Fatalf("expected stable 422 mapping, got %+v", failure)
	}
}
