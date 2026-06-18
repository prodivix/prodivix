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
RETURNING workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at`)
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
		WillReturnRows(sqlmock.NewRows([]string{
			"workspace_id", "id", "doc_type", "name", "path", "content_rev", "meta_rev", "content_json", "updated_at",
		}).AddRow(
			"ws_1",
			"code_open_dialog",
			"code",
			"openDialog.ts",
			"/src/actions/openDialog.ts",
			4,
			1,
			[]byte(`{"language":"ts","source":"export function openDialog(id) { return id; }"}`),
			issuedAt.UTC(),
		))
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
	if len(result.UpdatedDocuments) != 1 ||
		result.UpdatedDocuments[0].ContentRev != 4 ||
		string(result.UpdatedDocuments[0].Content) != `{"language":"ts","source":"export function openDialog(id) { return id; }"}` {
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
