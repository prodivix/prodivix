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

const retainedVFSWorkspaceLockQuery = `SELECT workspace_rev, route_rev, op_seq, tree_root_id, tree_json
FROM workspaces
WHERE id = $1
FOR UPDATE`

const retainedVFSDocumentQuery = `SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`

const retainedVFSCodeDocumentJSON = `{"language":"typescript","source":"export const value = 1"}`

const retainedVFSDirectoryDocumentTreeJSON = `{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["dir_old"]},"dir_old":{"id":"dir_old","kind":"dir","name":"old","parentId":"root","children":["node_code"]},"node_code":{"id":"node_code","kind":"doc","name":"main.ts","parentId":"dir_old","docId":"doc_code"}}}`

const retainedVFSRootDocumentTreeJSON = `{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["node_code"]},"node_code":{"id":"node_code","kind":"doc","name":"main.ts","parentId":"root","docId":"doc_code"}}}`

func TestWorkspaceStoreRetainedVFSMutationsRejectRevisionCapacityBeforeWrites(t *testing.T) {
	issuedAt := time.Date(2026, time.July, 12, 9, 30, 0, 0, time.UTC)
	type runMutation func(context.Context, *WorkspaceStore, int64) (*WorkspaceMutationResult, error)
	operations := []struct {
		name string
		run  runMutation
	}{
		{
			name: "directory create",
			run: func(ctx context.Context, store *WorkspaceStore, expectedWorkspaceRev int64) (*WorkspaceMutationResult, error) {
				return store.CreateWorkspaceDirectory(ctx, CreateWorkspaceDirectoryMutationParams{
					WorkspaceID:          "ws_1",
					ExpectedWorkspaceRev: expectedWorkspaceRev,
					NodeID:               "dir_new",
					ParentNodeID:         "root",
					Name:                 "new",
					Command:              buildTestCommand("cmd_capacity_directory_create", issuedAt, "ws_1", "", "core.workspace", "directory.create"),
				})
			},
		},
		{
			name: "directory rename",
			run: func(ctx context.Context, store *WorkspaceStore, expectedWorkspaceRev int64) (*WorkspaceMutationResult, error) {
				return store.RenameWorkspaceDirectory(ctx, RenameWorkspaceDirectoryMutationParams{
					WorkspaceID:          "ws_1",
					ExpectedWorkspaceRev: expectedWorkspaceRev,
					NodeID:               "dir_old",
					Name:                 "new",
					Command:              buildTestCommand("cmd_capacity_directory_rename", issuedAt, "ws_1", "", "core.workspace", "directory.rename"),
				})
			},
		},
		{
			name: "directory delete",
			run: func(ctx context.Context, store *WorkspaceStore, expectedWorkspaceRev int64) (*WorkspaceMutationResult, error) {
				return store.DeleteWorkspaceDirectory(ctx, DeleteWorkspaceDirectoryMutationParams{
					WorkspaceID:          "ws_1",
					ExpectedWorkspaceRev: expectedWorkspaceRev,
					NodeID:               "dir_old",
					Command:              buildTestCommand("cmd_capacity_directory_delete", issuedAt, "ws_1", "", "core.workspace", "directory.delete"),
				})
			},
		},
		{
			name: "code create",
			run: func(ctx context.Context, store *WorkspaceStore, expectedWorkspaceRev int64) (*WorkspaceMutationResult, error) {
				return store.CreateCodeDocument(ctx, CreateCodeDocumentMutationParams{
					WorkspaceID:          "ws_1",
					ExpectedWorkspaceRev: expectedWorkspaceRev,
					DocumentID:           "doc_code",
					NodeID:               "node_code",
					ParentNodeID:         "root",
					Path:                 "/main.ts",
					Content:              json.RawMessage(retainedVFSCodeDocumentJSON),
					Command:              buildTestCommand("cmd_capacity_code_create", issuedAt, "ws_1", "doc_code", "core.code", "document.create"),
				})
			},
		},
		{
			name: "code rename move",
			run: func(ctx context.Context, store *WorkspaceStore, expectedWorkspaceRev int64) (*WorkspaceMutationResult, error) {
				return store.RenameCodeDocument(ctx, RenameCodeDocumentMutationParams{
					WorkspaceID:          "ws_1",
					ExpectedWorkspaceRev: expectedWorkspaceRev,
					DocumentID:           "doc_code",
					Path:                 "/moved.ts",
					Command:              buildTestCommand("cmd_capacity_code_rename", issuedAt, "ws_1", "doc_code", "core.code", "document.rename"),
				})
			},
		},
		{
			name: "code delete",
			run: func(ctx context.Context, store *WorkspaceStore, expectedWorkspaceRev int64) (*WorkspaceMutationResult, error) {
				return store.DeleteCodeDocument(ctx, DeleteCodeDocumentMutationParams{
					WorkspaceID:          "ws_1",
					ExpectedWorkspaceRev: expectedWorkspaceRev,
					DocumentID:           "doc_code",
					Command:              buildTestCommand("cmd_capacity_code_delete", issuedAt, "ws_1", "doc_code", "core.code", "document.delete"),
				})
			},
		},
	}
	limits := []struct {
		name               string
		workspaceRev       int64
		opSeq              int64
		expectedErrorField string
	}{
		{name: "workspace revision", workspaceRev: maxJSONSafeInteger, opSeq: 7, expectedErrorField: "workspaceRev"},
		{name: "operation sequence", workspaceRev: 7, opSeq: maxJSONSafeInteger, expectedErrorField: "opSeq"},
	}

	for _, operation := range operations {
		for _, limit := range limits {
			t.Run(operation.name+"/"+limit.name, func(t *testing.T) {
				db, mock, err := sqlmock.New()
				if err != nil {
					t.Fatalf("create sqlmock: %v", err)
				}
				defer db.Close()

				mock.ExpectBegin()
				mock.ExpectQuery(regexp.QuoteMeta(retainedVFSWorkspaceLockQuery)).
					WithArgs("ws_1").
					WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json"}).
						AddRow(limit.workspaceRev, 3, limit.opSeq, "root", []byte(`{}`)))
				mock.ExpectRollback()

				_, mutationErr := operation.run(context.Background(), NewWorkspaceStore(db), limit.workspaceRev)
				assertRevisionCapacityError(t, mutationErr, limit.expectedErrorField)
				if err := mock.ExpectationsWereMet(); err != nil {
					t.Fatalf("unexpected SQL activity: %v", err)
				}
			})
		}
	}
}

func TestWorkspaceStoreRenameDirectoryRejectsDocumentMetaRevisionCapacityBeforeUpdates(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	issuedAt := time.Date(2026, time.July, 12, 9, 31, 0, 0, time.UTC)
	updatedAt := issuedAt.Add(-time.Minute)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(retainedVFSWorkspaceLockQuery)).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json"}).
			AddRow(8, 3, 11, "root", []byte(retainedVFSDirectoryDocumentTreeJSON)))
	mock.ExpectQuery(regexp.QuoteMeta(retainedVFSDocumentQuery)).
		WithArgs("ws_1").
		WillReturnRows(singleRetainedVFSCodeDocumentRow("/old/main.ts", maxJSONSafeInteger, updatedAt))
	mock.ExpectRollback()

	_, mutationErr := NewWorkspaceStore(db).RenameWorkspaceDirectory(context.Background(), RenameWorkspaceDirectoryMutationParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 8,
		NodeID:               "dir_old",
		Name:                 "new",
		Command:              buildTestCommand("cmd_meta_capacity_directory_rename", issuedAt, "ws_1", "", "core.workspace", "directory.rename"),
	})
	assertRevisionCapacityError(t, mutationErr, "metaRev")
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL activity: %v", err)
	}
}

func TestWorkspaceStoreRenameCodeDocumentRejectsMetaRevisionCapacityBeforeUpdates(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	issuedAt := time.Date(2026, time.July, 12, 9, 32, 0, 0, time.UTC)
	updatedAt := issuedAt.Add(-time.Minute)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(retainedVFSWorkspaceLockQuery)).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json"}).
			AddRow(8, 3, 11, "root", []byte(retainedVFSRootDocumentTreeJSON)))
	mock.ExpectQuery(regexp.QuoteMeta(retainedVFSDocumentQuery)).
		WithArgs("ws_1").
		WillReturnRows(singleRetainedVFSCodeDocumentRow("/main.ts", maxJSONSafeInteger, updatedAt))
	mock.ExpectRollback()

	_, mutationErr := NewWorkspaceStore(db).RenameCodeDocument(context.Background(), RenameCodeDocumentMutationParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 8,
		DocumentID:           "doc_code",
		Path:                 "/moved.ts",
		Command:              buildTestCommand("cmd_meta_capacity_code_rename", issuedAt, "ws_1", "doc_code", "core.code", "document.rename"),
	})
	assertRevisionCapacityError(t, mutationErr, "metaRev")
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL activity: %v", err)
	}
}

func TestWorkspaceStoreDeleteCodeDocumentRetainsLastWorkspaceDocument(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	issuedAt := time.Date(2026, time.July, 12, 9, 33, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(retainedVFSWorkspaceLockQuery)).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json"}).
			AddRow(8, 3, 11, "root", []byte(retainedVFSRootDocumentTreeJSON)))
	mock.ExpectQuery(regexp.QuoteMeta(retainedVFSDocumentQuery)).
		WithArgs("ws_1").
		WillReturnRows(singleRetainedVFSCodeDocumentRow("/main.ts", 4, issuedAt.Add(-time.Minute)))
	mock.ExpectRollback()

	_, mutationErr := NewWorkspaceStore(db).DeleteCodeDocument(context.Background(), DeleteCodeDocumentMutationParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 8,
		DocumentID:           "doc_code",
		Command:              buildTestCommand("cmd_retain_last_code_delete", issuedAt, "ws_1", "doc_code", "core.code", "document.delete"),
	})
	assertWorkspaceRetentionError(t, mutationErr)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("delete or other unexpected SQL activity occurred: %v", err)
	}
}

func TestWorkspaceStoreDeleteDirectoryRetainsLastWorkspaceDocumentBeforeRecursiveDeletes(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	issuedAt := time.Date(2026, time.July, 12, 9, 34, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(retainedVFSWorkspaceLockQuery)).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json"}).
			AddRow(8, 3, 11, "root", []byte(retainedVFSDirectoryDocumentTreeJSON)))
	mock.ExpectQuery(regexp.QuoteMeta(retainedVFSDocumentQuery)).
		WithArgs("ws_1").
		WillReturnRows(singleRetainedVFSCodeDocumentRow("/old/main.ts", 4, issuedAt.Add(-time.Minute)))
	mock.ExpectRollback()

	_, mutationErr := NewWorkspaceStore(db).DeleteWorkspaceDirectory(context.Background(), DeleteWorkspaceDirectoryMutationParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 8,
		NodeID:               "dir_old",
		Command:              buildTestCommand("cmd_retain_last_directory_delete", issuedAt, "ws_1", "", "core.workspace", "directory.delete"),
	})
	assertWorkspaceRetentionError(t, mutationErr)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("recursive delete or other unexpected SQL activity occurred: %v", err)
	}
}

func singleRetainedVFSCodeDocumentRow(path string, metaRev int64, updatedAt time.Time) *sqlmock.Rows {
	return sqlmock.NewRows([]string{
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
		"ws_1",
		"doc_code",
		string(WorkspaceDocumentTypeCode),
		workspacePathName(path),
		path,
		3,
		metaRev,
		[]byte(retainedVFSCodeDocumentJSON),
		[]byte(`[]`),
		updatedAt,
	)
}

func assertRevisionCapacityError(t *testing.T, err error, expectedField string) {
	t.Helper()
	var limitErr *workspaceRevisionLimitError
	if !errors.As(err, &limitErr) {
		t.Fatalf("expected workspace revision capacity error, got %v", err)
	}
	if limitErr.Field != expectedField || limitErr.Reason != revisionLimitReasonCapacity {
		t.Fatalf("unexpected revision capacity error: %+v", limitErr)
	}
}

func assertWorkspaceRetentionError(t *testing.T, err error) {
	t.Helper()
	if !errors.Is(err, ErrWorkspaceVFSInvalid) {
		t.Fatalf("expected ErrWorkspaceVFSInvalid, got %v", err)
	}
	failure := MapStoreError(err)
	if failure == nil || failure.Status != http.StatusUnprocessableEntity {
		t.Fatalf("expected stable 422 mapping, got %+v", failure)
	}
}
