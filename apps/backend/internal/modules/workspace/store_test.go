package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func buildTestCommand(
	id string,
	issuedAt time.Time,
	workspaceID string,
	documentID string,
	namespace string,
	commandType string,
) WorkspaceCommandEnvelope {
	return WorkspaceCommandEnvelope{
		ID:        id,
		Namespace: namespace,
		Type:      commandType,
		Version:   "1.0",
		IssuedAt:  issuedAt.UTC(),
		ForwardOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/title", Value: json.RawMessage(`"next"`)},
		},
		ReverseOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/title", Value: json.RawMessage(`"prev"`)},
		},
		Target: WorkspaceCommandTarget{
			WorkspaceID: workspaceID,
			DocumentID:  documentID,
		},
	}
}

func TestWorkspaceStoreSaveDocumentContentKeepsWorkspaceAndRouteRev(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 0, 0, 0, time.UTC)
	command := buildTestCommand("cmd_doc_update_1", issuedAt, "ws_1", "doc_home", "core.pir", "document.update")

	lockQuery := regexp.QuoteMeta(`SELECT d.content_rev, d.meta_rev, w.workspace_rev, w.route_rev, w.op_seq
FROM workspace_documents d
JOIN workspaces w ON w.id = d.workspace_id
WHERE d.workspace_id = $1 AND d.id = $2
FOR UPDATE OF d, w`)
	updateDocument := regexp.QuoteMeta(`UPDATE workspace_documents
SET content_json = $3::jsonb, content_rev = content_rev + 1, updated_at = NOW()
WHERE workspace_id = $1 AND id = $2
RETURNING content_rev, meta_rev`)
	bumpSequenceOnly := regexp.QuoteMeta(`UPDATE workspaces
SET op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`)
	insertOperation := regexp.QuoteMeta(`INSERT INTO workspace_operations (workspace_id, op_seq, domain, document_id, payload_json, created_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockQuery).
		WithArgs("ws_1", "doc_home").
		WillReturnRows(sqlmock.NewRows([]string{"content_rev", "meta_rev", "workspace_rev", "route_rev", "op_seq"}).AddRow(3, 1, 9, 4, 33))
	mock.ExpectQuery(updateDocument).
		WithArgs("ws_1", "doc_home", `{"title":"next"}`).
		WillReturnRows(sqlmock.NewRows([]string{"content_rev", "meta_rev"}).AddRow(4, 1))
	mock.ExpectQuery(bumpSequenceOnly).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(9, 4, 34))
	mock.ExpectExec(insertOperation).
		WithArgs("ws_1", int64(34), "core.pir.document.update@1.0", "doc_home", sqlmock.AnyArg(), issuedAt.UTC()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	result, err := store.SaveDocumentContent(context.Background(), SaveDocumentContentParams{
		WorkspaceID:        "ws_1",
		DocumentID:         "doc_home",
		ExpectedContentRev: 3,
		Content:            json.RawMessage(`{"title":"next"}`),
		Command:            command,
	})
	if err != nil {
		t.Fatalf("save document content: %v", err)
	}
	if result.WorkspaceRev != 9 {
		t.Fatalf("workspaceRev changed unexpectedly: got %d", result.WorkspaceRev)
	}
	if result.RouteRev != 4 {
		t.Fatalf("routeRev changed unexpectedly: got %d", result.RouteRev)
	}
	if len(result.UpdatedDocuments) != 1 || result.UpdatedDocuments[0].ContentRev != 4 {
		t.Fatalf("unexpected updated documents: %+v", result.UpdatedDocuments)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreSaveDocumentContentReturnsDocumentConflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 1, 0, 0, time.UTC)
	command := buildTestCommand("cmd_doc_update_2", issuedAt, "ws_1", "doc_home", "core.pir", "document.update")

	lockQuery := regexp.QuoteMeta(`SELECT d.content_rev, d.meta_rev, w.workspace_rev, w.route_rev, w.op_seq
FROM workspace_documents d
JOIN workspaces w ON w.id = d.workspace_id
WHERE d.workspace_id = $1 AND d.id = $2
FOR UPDATE OF d, w`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockQuery).
		WithArgs("ws_1", "doc_home").
		WillReturnRows(sqlmock.NewRows([]string{"content_rev", "meta_rev", "workspace_rev", "route_rev", "op_seq"}).AddRow(6, 2, 10, 5, 40))
	mock.ExpectRollback()

	_, err = store.SaveDocumentContent(context.Background(), SaveDocumentContentParams{
		WorkspaceID:        "ws_1",
		DocumentID:         "doc_home",
		ExpectedContentRev: 5,
		Content:            json.RawMessage(`{"title":"ignored"}`),
		Command:            command,
	})
	if err == nil {
		t.Fatalf("expected conflict error")
	}

	var conflictErr *WorkspaceRevisionConflictError
	if !errors.As(err, &conflictErr) {
		t.Fatalf("expected WorkspaceRevisionConflictError, got %T", err)
	}
	if conflictErr.ConflictType != WorkspaceConflictDocument {
		t.Fatalf("unexpected conflict type: %s", conflictErr.ConflictType)
	}
	if conflictErr.ServerContentRev != 6 {
		t.Fatalf("unexpected server content rev: %d", conflictErr.ServerContentRev)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStorePatchCodeDocumentContentSkipsPIRValidation(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 1, 30, 0, time.UTC)
	command := WorkspaceCommandEnvelope{
		ID:        "cmd_code_update_1",
		Namespace: "core.code",
		Type:      "source.update",
		Version:   "1.0",
		IssuedAt:  issuedAt,
		ForwardOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/source", Value: json.RawMessage(`"export function openDialog(id) { return id; }"`)},
		},
		ReverseOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/source", Value: json.RawMessage(`"export function openDialog() {}"`)},
		},
		Target: WorkspaceCommandTarget{
			WorkspaceID: "ws_1",
			DocumentID:  "code_open_dialog",
		},
	}

	lockQuery := regexp.QuoteMeta(`SELECT d.doc_type, d.content_json, d.content_rev, d.meta_rev, w.workspace_rev, w.route_rev, w.op_seq
FROM workspace_documents d
JOIN workspaces w ON w.id = d.workspace_id
WHERE d.workspace_id = $1 AND d.id = $2
FOR UPDATE OF d, w`)
	updateDocument := regexp.QuoteMeta(`UPDATE workspace_documents
SET content_json = $3::jsonb, content_rev = content_rev + 1, updated_at = NOW()
WHERE workspace_id = $1 AND id = $2
RETURNING content_rev, meta_rev`)
	bumpSequenceOnly := regexp.QuoteMeta(`UPDATE workspaces
SET op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`)
	insertOperation := regexp.QuoteMeta(`INSERT INTO workspace_operations (workspace_id, op_seq, domain, document_id, payload_json, created_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockQuery).
		WithArgs("ws_1", "code_open_dialog").
		WillReturnRows(sqlmock.NewRows([]string{"doc_type", "content_json", "content_rev", "meta_rev", "workspace_rev", "route_rev", "op_seq"}).
			AddRow("code", []byte(`{"language":"ts","source":"export function openDialog() {}"}`), 3, 1, 9, 4, 33))
	mock.ExpectQuery(updateDocument).
		WithArgs("ws_1", "code_open_dialog", `{"language":"ts","source":"export function openDialog(id) { return id; }"}`).
		WillReturnRows(sqlmock.NewRows([]string{"content_rev", "meta_rev"}).AddRow(4, 1))
	mock.ExpectQuery(bumpSequenceOnly).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(9, 4, 34))
	mock.ExpectExec(insertOperation).
		WithArgs("ws_1", int64(34), "core.code.source.update@1.0", "code_open_dialog", sqlmock.AnyArg(), issuedAt.UTC()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	result, err := store.PatchDocumentContent(context.Background(), PatchDocumentContentParams{
		WorkspaceID:        "ws_1",
		DocumentID:         "code_open_dialog",
		ExpectedContentRev: 3,
		Command:            command,
	})
	if err != nil {
		t.Fatalf("patch code document content: %v", err)
	}
	if len(result.UpdatedDocuments) != 1 || result.UpdatedDocuments[0].ContentRev != 4 {
		t.Fatalf("unexpected updated documents: %+v", result.UpdatedDocuments)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreSaveRouteManifestIncrementsWorkspaceAndRouteRev(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 2, 0, 0, time.UTC)
	command := buildTestCommand("cmd_route_update_1", issuedAt, "ws_1", "", "core.route", "manifest.update")

	lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)
	upsertRoute := regexp.QuoteMeta(`INSERT INTO workspace_routes (workspace_id, manifest_json, updated_at)
VALUES ($1, $2::jsonb, NOW())
ON CONFLICT (workspace_id) DO UPDATE
SET manifest_json = EXCLUDED.manifest_json, updated_at = EXCLUDED.updated_at`)
	bumpWorkspaceAndRoute := regexp.QuoteMeta(`UPDATE workspaces
SET workspace_rev = workspace_rev + 1, route_rev = route_rev + 1, op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`)
	insertOperation := regexp.QuoteMeta(`INSERT INTO workspace_operations (workspace_id, op_seq, domain, document_id, payload_json, created_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockWorkspace).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(9, 4, 34))
	mock.ExpectExec(upsertRoute).
		WithArgs("ws_1", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(bumpWorkspaceAndRoute).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(10, 5, 35))
	mock.ExpectExec(insertOperation).
		WithArgs("ws_1", int64(35), "core.route.manifest.update@1.0", nil, sqlmock.AnyArg(), issuedAt.UTC()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	result, err := store.SaveRouteManifest(context.Background(), SaveRouteManifestParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 9,
		ExpectedRouteRev:     4,
		RouteManifest:        json.RawMessage(`{"version":"1","root":{"id":"root"}}`),
		Command:              command,
	})
	if err != nil {
		t.Fatalf("save route manifest: %v", err)
	}
	if result.WorkspaceRev != 10 || result.RouteRev != 5 || result.OpSeq != 35 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreSaveWorkspaceSettingsIncrementsWorkspaceRevOnly(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 3, 0, 0, time.UTC)
	command := buildTestCommand("cmd_settings_update_1", issuedAt, "ws_1", "", "core.settings", "global.update")

	lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)
	upsertSettings := regexp.QuoteMeta(`INSERT INTO workspace_settings (workspace_id, settings_json, updated_at)
VALUES ($1, $2::jsonb, NOW())
ON CONFLICT (workspace_id) DO UPDATE
SET settings_json = EXCLUDED.settings_json, updated_at = EXCLUDED.updated_at`)
	bumpWorkspaceOnly := regexp.QuoteMeta(`UPDATE workspaces
SET workspace_rev = workspace_rev + 1, op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`)
	insertOperation := regexp.QuoteMeta(`INSERT INTO workspace_operations (workspace_id, op_seq, domain, document_id, payload_json, created_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockWorkspace).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(9, 4, 34))
	mock.ExpectExec(upsertSettings).
		WithArgs("ws_1", `{"global":{"eventTriggerMode":"selected-only"},"projectGlobalById":{}}`).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(bumpWorkspaceOnly).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(10, 4, 35))
	mock.ExpectExec(insertOperation).
		WithArgs("ws_1", int64(35), "core.settings.global.update@1.0", nil, sqlmock.AnyArg(), issuedAt.UTC()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	result, err := store.SaveWorkspaceSettings(context.Background(), SaveWorkspaceSettingsParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 9,
		Settings:             json.RawMessage(`{"global":{"eventTriggerMode":"selected-only"},"projectGlobalById":{}}`),
		Command:              command,
	})
	if err != nil {
		t.Fatalf("save workspace settings: %v", err)
	}
	if result.WorkspaceRev != 10 || result.RouteRev != 4 || result.OpSeq != 35 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreSaveWorkspaceSettingsReturnsWorkspaceConflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 4, 0, 0, time.UTC)
	command := buildTestCommand("cmd_settings_update_2", issuedAt, "ws_1", "", "core.settings", "global.update")

	lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockWorkspace).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(10, 4, 35))
	mock.ExpectRollback()

	_, err = store.SaveWorkspaceSettings(context.Background(), SaveWorkspaceSettingsParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 9,
		Settings:             json.RawMessage(`{"global":{"eventTriggerMode":"always"},"projectGlobalById":{}}`),
		Command:              command,
	})
	if err == nil {
		t.Fatalf("expected conflict error")
	}

	var conflictErr *WorkspaceRevisionConflictError
	if !errors.As(err, &conflictErr) {
		t.Fatalf("expected WorkspaceRevisionConflictError, got %T", err)
	}
	if conflictErr.ConflictType != WorkspaceConflictWorkspace {
		t.Fatalf("unexpected conflict type: %s", conflictErr.ConflictType)
	}
	if conflictErr.ServerWorkspaceRev != 10 {
		t.Fatalf("unexpected server workspace rev: %d", conflictErr.ServerWorkspaceRev)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreSaveDocumentContentValidatesCommandEnvelope(t *testing.T) {
	testCases := []struct {
		name          string
		mutateCommand func(command *WorkspaceCommandEnvelope)
		wantMessage   string
	}{
		{
			name: "missing issuedAt",
			mutateCommand: func(command *WorkspaceCommandEnvelope) {
				command.IssuedAt = time.Time{}
			},
			wantMessage: "command.issuedAt is required",
		},
		{
			name: "workspace mismatch",
			mutateCommand: func(command *WorkspaceCommandEnvelope) {
				command.Target.WorkspaceID = "ws_other"
			},
			wantMessage: "command.target.workspaceId does not match workspaceID",
		},
		{
			name: "missing document target",
			mutateCommand: func(command *WorkspaceCommandEnvelope) {
				command.Target.DocumentID = ""
			},
			wantMessage: "command.target.documentId is required for document mutations",
		},
		{
			name: "unsupported patch op",
			mutateCommand: func(command *WorkspaceCommandEnvelope) {
				command.ForwardOps = []WorkspacePatchOp{
					{Op: "execute", Path: "/title"},
				}
			},
			wantMessage: "unsupported op",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()

			store := NewWorkspaceStore(db)
			command := buildTestCommand(
				"cmd_doc_invalid_"+strings.ReplaceAll(testCase.name, " ", "_"),
				time.Date(2026, time.February, 8, 10, 5, 0, 0, time.UTC),
				"ws_1",
				"doc_home",
				"core.pir",
				"document.update",
			)
			testCase.mutateCommand(&command)

			_, err = store.SaveDocumentContent(context.Background(), SaveDocumentContentParams{
				WorkspaceID:        "ws_1",
				DocumentID:         "doc_home",
				ExpectedContentRev: 1,
				Content:            json.RawMessage(`{"title":"next"}`),
				Command:            command,
			})
			if err == nil {
				t.Fatalf("expected validation error")
			}
			if !strings.Contains(err.Error(), testCase.wantMessage) {
				t.Fatalf("unexpected error message: %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("sql expectations: %v", err)
			}
		})
	}
}
