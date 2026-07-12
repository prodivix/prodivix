package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

const testCommitTreeJSON = `{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc-node"]},"doc-node":{"id":"doc-node","kind":"doc","name":"main.ts","parentId":"root","docId":"doc_code"}}}`
const testCommitRouteJSON = `{"version":"1","root":{"id":"root"}}`

func testAtomicCommitRequest() WorkspaceOperationCommitRequest {
	documentCommand := testCommitDocumentCommand(
		"cmd_document",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"after"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	routeCommand := WorkspaceCommandEnvelope{
		ID:         "cmd_route",
		Namespace:  "core.route",
		Type:       "manifest.update",
		Version:    "1.0",
		IssuedAt:   time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		ForwardOps: []WorkspacePatchOp{{Op: "replace", Path: "/routeManifest", Value: json.RawMessage(`{"version":"1","root":{"id":"root","children":[{"id":"about","segment":"about"}]}}`)}},
		ReverseOps: []WorkspacePatchOp{{Op: "replace", Path: "/routeManifest", Value: json.RawMessage(testCommitRouteJSON)}},
		Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1"},
		DomainHint: "route",
	}
	transaction := WorkspaceTransactionEnvelope{
		ID:          "tx_atomic",
		WorkspaceID: "ws_1",
		IssuedAt:    time.Date(2026, time.July, 12, 1, 0, 0, 0, time.UTC),
		Commands:    []WorkspaceCommandEnvelope{documentCommand, routeCommand},
	}
	return WorkspaceOperationCommitRequest{
		Expected: &WorkspaceOperationCommitExpected{
			WorkspaceRev: commitRevision(5),
			RouteRev:     commitRevision(2),
			Documents: []WorkspaceCommitExpectedDocument{{
				ID:                "doc_code",
				ContentRev:        commitRevision(2),
				ContentRevPresent: true,
			}},
		},
		Operation: WorkspaceOperationEnvelope{Kind: "transaction", Transaction: &transaction},
	}
}

func expectCommitWorkspaceLock(mock sqlmock.Sqlmock, now time.Time) {
	query := regexp.QuoteMeta(`SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq,
       w.tree_root_id, w.tree_json, w.created_at, w.updated_at,
       COALESCE(r.manifest_json, '{"version":"1","root":{"id":"root"}}'::jsonb)
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
WHERE w.id = $1 AND w.owner_id = $2
FOR UPDATE OF w`)
	mock.ExpectQuery(query).
		WithArgs("ws_1", "user_1").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "project_id", "owner_id", "name", "workspace_rev", "route_rev", "op_seq",
			"tree_root_id", "tree_json", "created_at", "updated_at", "manifest_json",
		}).AddRow(
			"ws_1", "project_1", "user_1", "Workspace", 5, 2, 10,
			"root", []byte(testCommitTreeJSON), now, now, []byte(testCommitRouteJSON),
		))
}

func expectCommitDocuments(mock sqlmock.Sqlmock, now time.Time, contentRev int64) {
	query := regexp.QuoteMeta(`SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY id ASC
FOR UPDATE`)
	mock.ExpectQuery(query).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{
			"workspace_id", "id", "doc_type", "name", "path", "content_rev", "meta_rev", "content_json", "capabilities_json", "updated_at",
		}).AddRow(
			"ws_1", "doc_code", "code", "main.ts", "/main.ts", contentRev, 1,
			[]byte(`{"language":"ts","source":"before"}`), []byte(`["execute"]`), now,
		))
}

func TestWorkspaceStoreCommitsMixedOperationAtomically(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	now := time.Date(2026, time.July, 12, 0, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	expectCommitWorkspaceLock(mock, now)
	replayQuery := regexp.QuoteMeta(`SELECT request_hash, result_json
FROM workspace_operations
WHERE workspace_id = $1 AND operation_id = $2`)
	mock.ExpectQuery(replayQuery).WithArgs("ws_1", "tx_atomic").WillReturnError(sql.ErrNoRows)
	expectCommitDocuments(mock, now, 2)

	upsertDocument := regexp.QuoteMeta(`INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
ON CONFLICT (workspace_id, id) DO UPDATE
SET name = EXCLUDED.name,
    path = EXCLUDED.path,
    content_rev = EXCLUDED.content_rev,
    meta_rev = EXCLUDED.meta_rev,
    content_json = EXCLUDED.content_json,
    capabilities_json = EXCLUDED.capabilities_json,
    updated_at = EXCLUDED.updated_at`)
	mock.ExpectExec(upsertDocument).
		WithArgs("ws_1", "doc_code", "code", "main.ts", "/main.ts", int64(3), int64(1), `{"language":"ts","source":"after"}`, `["execute"]`, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	upsertRoute := regexp.QuoteMeta(`INSERT INTO workspace_routes (workspace_id, manifest_json, updated_at)
VALUES ($1, $2::jsonb, NOW())
ON CONFLICT (workspace_id) DO UPDATE
SET manifest_json = EXCLUDED.manifest_json, updated_at = EXCLUDED.updated_at`)
	mock.ExpectExec(upsertRoute).
		WithArgs("ws_1", `{"root":{"children":[{"id":"about","segment":"about"}],"id":"root"},"version":"1"}`).
		WillReturnResult(sqlmock.NewResult(1, 1))
	updateWorkspace := regexp.QuoteMeta(`UPDATE workspaces
SET tree_root_id = CASE WHEN $4 = 1 THEN $2 ELSE tree_root_id END,
    tree_json = CASE WHEN $4 = 1 THEN $3::jsonb ELSE tree_json END,
    workspace_rev = workspace_rev + $5,
    route_rev = route_rev + $6,
    op_seq = op_seq + 1,
    updated_at = $7
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`)
	mock.ExpectQuery(updateWorkspace).
		WithArgs("ws_1", "root", sqlmock.AnyArg(), int64(0), int64(1), int64(1), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(6, 3, 11))
	insertCommit := regexp.QuoteMeta(`INSERT INTO workspace_operations (
	workspace_id, op_seq, domain, document_id, payload_json, created_at, operation_id, request_hash, result_json
) VALUES ($1, $2, $3, NULL, $4::jsonb, $5, $6, $7, $8::jsonb)`)
	mock.ExpectExec(insertCommit).
		WithArgs("ws_1", int64(11), workspaceOperationCommitDomain, sqlmock.AnyArg(), sqlmock.AnyArg(), "tx_atomic", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	result, err := store.CommitWorkspaceOperation(context.Background(), CommitWorkspaceOperationParams{
		WorkspaceID: "ws_1",
		OwnerID:     "user_1",
		Request:     testAtomicCommitRequest(),
	})
	if err != nil {
		t.Fatalf("commit mixed operation: %v", err)
	}
	if result.WorkspaceRev != 6 || result.RouteRev != 3 || result.OpSeq != 11 || len(result.UpdatedDocuments) != 1 || len(result.RouteManifest) == 0 {
		t.Fatalf("unexpected mutation: %+v", result)
	}
	if result.UpdatedDocuments[0].ContentRev != 3 || result.UpdatedDocuments[0].Name != "main.ts" || len(result.UpdatedDocuments[0].Capabilities) != 1 {
		t.Fatalf("unexpected updated document: %+v", result.UpdatedDocuments[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreReplaysCommitBeforeRevisionChecks(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	now := time.Date(2026, time.July, 12, 0, 0, 0, 0, time.UTC)
	request := testAtomicCommitRequest()
	normalized, err := normalizeWorkspaceOperationCommit("ws_1", request)
	if err != nil {
		t.Fatalf("normalize request: %v", err)
	}
	mutation := WorkspaceMutationResult{WorkspaceID: "ws_1", WorkspaceRev: 6, RouteRev: 3, OpSeq: 11}
	resultJSON, _ := json.Marshal(mutation)

	mock.ExpectBegin()
	expectCommitWorkspaceLock(mock, now)
	replayQuery := regexp.QuoteMeta(`SELECT request_hash, result_json
FROM workspace_operations
WHERE workspace_id = $1 AND operation_id = $2`)
	mock.ExpectQuery(replayQuery).
		WithArgs("ws_1", "tx_atomic").
		WillReturnRows(sqlmock.NewRows([]string{"request_hash", "result_json"}).AddRow(normalized.RequestHash, resultJSON))
	mock.ExpectRollback()

	result, err := store.CommitWorkspaceOperation(context.Background(), CommitWorkspaceOperationParams{
		WorkspaceID: "ws_1",
		OwnerID:     "user_1",
		Request:     request,
	})
	if err != nil {
		t.Fatalf("replay commit: %v", err)
	}
	if result.OpSeq != 11 {
		t.Fatalf("unexpected replay result: %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreRejectsCommitIdentityReuseWithDifferentRequest(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	now := time.Date(2026, time.July, 12, 0, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	expectCommitWorkspaceLock(mock, now)
	replayQuery := regexp.QuoteMeta(`SELECT request_hash, result_json
FROM workspace_operations
WHERE workspace_id = $1 AND operation_id = $2`)
	mock.ExpectQuery(replayQuery).
		WithArgs("ws_1", "tx_atomic").
		WillReturnRows(sqlmock.NewRows([]string{"request_hash", "result_json"}).AddRow("different-hash", []byte(`{"workspaceId":"ws_1","workspaceRev":6,"routeRev":3,"opSeq":11}`)))
	mock.ExpectRollback()

	_, err = store.CommitWorkspaceOperation(context.Background(), CommitWorkspaceOperationParams{
		WorkspaceID: "ws_1",
		OwnerID:     "user_1",
		Request:     testAtomicCommitRequest(),
	})
	if !errors.Is(err, ErrWorkspaceCommitIdentityMismatch) {
		t.Fatalf("expected identity mismatch, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreRollsBackBeforeWritesOnDocumentConflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	now := time.Date(2026, time.July, 12, 0, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	expectCommitWorkspaceLock(mock, now)
	replayQuery := regexp.QuoteMeta(`SELECT request_hash, result_json
FROM workspace_operations
WHERE workspace_id = $1 AND operation_id = $2`)
	mock.ExpectQuery(replayQuery).WithArgs("ws_1", "tx_atomic").WillReturnError(sql.ErrNoRows)
	expectCommitDocuments(mock, now, 3)
	mock.ExpectRollback()

	_, err = store.CommitWorkspaceOperation(context.Background(), CommitWorkspaceOperationParams{
		WorkspaceID: "ws_1",
		OwnerID:     "user_1",
		Request:     testAtomicCommitRequest(),
	})
	var conflict *WorkspaceRevisionConflictError
	if !errors.As(err, &conflict) || conflict.ConflictType != WorkspaceConflictDocument {
		t.Fatalf("expected document conflict, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreRollsBackEntireCommitWhenCommandValidationFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	now := time.Date(2026, time.July, 12, 0, 0, 0, 0, time.UTC)
	request := testAtomicCommitRequest()
	request.Operation.Transaction.Commands[0].ReverseOps = []WorkspacePatchOp{{
		Op: "replace", Path: "/source", Value: json.RawMessage(`"wrong"`),
	}}

	mock.ExpectBegin()
	expectCommitWorkspaceLock(mock, now)
	replayQuery := regexp.QuoteMeta(`SELECT request_hash, result_json
FROM workspace_operations
WHERE workspace_id = $1 AND operation_id = $2`)
	mock.ExpectQuery(replayQuery).WithArgs("ws_1", "tx_atomic").WillReturnError(sql.ErrNoRows)
	expectCommitDocuments(mock, now, 2)
	mock.ExpectRollback()

	_, err = store.CommitWorkspaceOperation(context.Background(), CommitWorkspaceOperationParams{
		WorkspaceID: "ws_1",
		OwnerID:     "user_1",
		Request:     request,
	})
	var validation *WorkspaceOperationCommitValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("expected commit validation error, got %v", err)
	}
	failure := MapStoreError(err)
	if failure.Status != 422 {
		t.Fatalf("invalid operation must map to 422: %+v", failure)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreRejectsCommitWithoutDurableDeltaBeforeWrites(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	now := time.Date(2026, time.July, 12, 0, 0, 0, 0, time.UTC)
	command := testCommitDocumentCommand(
		"cmd_no_delta",
		[]WorkspacePatchOp{{Op: "test", Path: "/source", Value: json.RawMessage(`"before"`)}},
		[]WorkspacePatchOp{{Op: "test", Path: "/source", Value: json.RawMessage(`"before"`)}},
	)
	request := testDocumentCommitRequest(command)

	mock.ExpectBegin()
	expectCommitWorkspaceLock(mock, now)
	replayQuery := regexp.QuoteMeta(`SELECT request_hash, result_json
FROM workspace_operations
WHERE workspace_id = $1 AND operation_id = $2`)
	mock.ExpectQuery(replayQuery).WithArgs("ws_1", "cmd_no_delta").WillReturnError(sql.ErrNoRows)
	expectCommitDocuments(mock, now, 2)
	mock.ExpectRollback()

	_, err = store.CommitWorkspaceOperation(context.Background(), CommitWorkspaceOperationParams{
		WorkspaceID: "ws_1",
		OwnerID:     "user_1",
		Request:     request,
	})
	var validation *WorkspaceOperationCommitValidationError
	if !errors.As(err, &validation) || validation.Path != "/operation" {
		t.Fatalf("expected no-delta commit validation error, got %v", err)
	}
	if failure := MapStoreError(err); failure.Status != 422 {
		t.Fatalf("no-delta commit must map to 422: %+v", failure)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceCommitPreconditionsExposeDocumentPresenceConflicts(t *testing.T) {
	workspace := &WorkspaceRecord{ID: "ws_1", WorkspaceRev: 5, RouteRev: 2, OpSeq: 10}
	documentRequest := testDocumentCommitRequest(testCommitDocumentCommand(
		"cmd_deleted",
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"next"`)}},
		[]WorkspacePatchOp{{Op: "replace", Path: "/source", Value: json.RawMessage(`"before"`)}},
	))
	deletedCommit, err := normalizeWorkspaceOperationCommit("ws_1", documentRequest)
	if err != nil {
		t.Fatalf("normalize deleted document request: %v", err)
	}
	err = validateWorkspaceCommitPreconditions(workspace, nil, deletedCommit)
	var deletedConflict *WorkspaceRevisionConflictError
	if !errors.As(err, &deletedConflict) || !deletedConflict.Current.DocumentKnown || deletedConflict.Current.Document != nil {
		t.Fatalf("expected current.document null conflict, got %+v / %v", deletedConflict, err)
	}

	absentExpected := WorkspaceCommitExpectedDocument{
		ID:                "doc_new",
		ContentRevPresent: true,
		MetaRevPresent:    true,
	}
	addCommit := &normalizedWorkspaceOperationCommit{
		Request: WorkspaceOperationCommitRequest{Expected: &WorkspaceOperationCommitExpected{
			WorkspaceRev: commitRevision(5),
			Documents:    []WorkspaceCommitExpectedDocument{absentExpected},
		}},
		Requirements: workspaceCommitRequirements{
			Workspace:  true,
			Persistent: true,
			Documents: map[string]workspaceCommitDocumentRequirement{
				"doc_new": {Absent: true},
			},
		},
	}
	current := WorkspaceDocumentRecord{
		ID:         "doc_new",
		Type:       WorkspaceDocumentTypeCode,
		Path:       "/new.ts",
		ContentRev: 1,
		MetaRev:    1,
		UpdatedAt:  time.Now().UTC(),
	}
	err = validateWorkspaceCommitPreconditions(workspace, []WorkspaceDocumentRecord{current}, addCommit)
	var addedConflict *WorkspaceRevisionConflictError
	if !errors.As(err, &addedConflict) || addedConflict.Current.Document == nil || !addedConflict.Expected.Document.ContentRevKnown || addedConflict.Expected.Document.ContentRev != 0 {
		t.Fatalf("expected null/null add collision conflict, got %+v / %v", addedConflict, err)
	}
}
