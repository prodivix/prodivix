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

	lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)
	lockDocument := regexp.QuoteMeta(`SELECT doc_type, path, updated_at, content_json, content_rev, meta_rev
FROM workspace_documents
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`)
	updateDocument := regexp.QuoteMeta(`UPDATE workspace_documents
SET content_json = $3::jsonb, content_rev = content_rev + 1, updated_at = NOW()
WHERE workspace_id = $1 AND id = $2
RETURNING workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at`)
	bumpSequenceOnly := regexp.QuoteMeta(`UPDATE workspaces
SET op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`)
	insertOperation := regexp.QuoteMeta(`INSERT INTO workspace_operations (workspace_id, op_seq, domain, document_id, payload_json, created_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockWorkspace).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).
			AddRow(9, 4, 33))
	mock.ExpectQuery(lockDocument).
		WithArgs("ws_1", "code_open_dialog").
		WillReturnRows(sqlmock.NewRows([]string{"doc_type", "path", "updated_at", "content_json", "content_rev", "meta_rev"}).
			AddRow("code", "/src/actions/openDialog.ts", issuedAt.Add(-time.Minute), []byte(`{"language":"ts","source":"export function openDialog() {}"}`), 3, 1))
	mock.ExpectQuery(updateDocument).
		WithArgs("ws_1", "code_open_dialog", `{"language":"ts","source":"export function openDialog(id) { return id; }"}`).
		WillReturnRows(sqlmock.NewRows([]string{
			"workspace_id", "id", "doc_type", "name", "path", "content_rev", "meta_rev", "content_json", "capabilities_json", "updated_at",
		}).AddRow(
			"ws_1",
			"code_open_dialog",
			"code",
			"openDialog.ts",
			"/src/actions/openDialog.ts",
			4,
			1,
			[]byte(`{"language":"ts","source":"export function openDialog(id) { return id; }"}`),
			[]byte(`[]`),
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

func TestWorkspaceStorePatchDocumentContentReturnsCurrentMetadataWithoutApplyingStaleCommand(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 5, 0, 0, time.UTC)
	currentUpdatedAt := issuedAt.Add(-time.Minute)
	command := buildTestCommand("cmd_stale_document_update", issuedAt, "ws_1", "doc_home", "core.pir", "document.update")
	lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)
	lockDocument := regexp.QuoteMeta(`SELECT doc_type, path, updated_at, content_json, content_rev, meta_rev
FROM workspace_documents
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockWorkspace).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).
			AddRow(11, 4, 39))
	mock.ExpectQuery(lockDocument).
		WithArgs("ws_1", "doc_home").
		WillReturnRows(sqlmock.NewRows([]string{"doc_type", "path", "updated_at", "content_json", "content_rev", "meta_rev"}).
			AddRow("pir-page", "/pages/home.pir.json", currentUpdatedAt, []byte(`{"title":"remote"}`), 7, 2))
	mock.ExpectRollback()

	_, err = store.PatchDocumentContent(context.Background(), PatchDocumentContentParams{
		WorkspaceID:        "ws_1",
		DocumentID:         "doc_home",
		ExpectedContentRev: 6,
		Command:            command,
	})
	if err == nil {
		t.Fatal("expected stale document revision conflict")
	}

	var conflictErr *WorkspaceRevisionConflictError
	if !errors.As(err, &conflictErr) {
		t.Fatalf("expected WorkspaceRevisionConflictError, got %T: %v", err, err)
	}
	if conflictErr.ConflictType != WorkspaceConflictDocument ||
		conflictErr.Expected.Document == nil ||
		conflictErr.Expected.Document.ID != "doc_home" ||
		conflictErr.Expected.Document.ContentRev != 6 ||
		conflictErr.Current.WorkspaceRev != 11 ||
		conflictErr.Current.RouteRev != 4 ||
		conflictErr.Current.OpSeq != 39 {
		t.Fatalf("unexpected conflict revisions: %+v", conflictErr)
	}
	if conflictErr.Current.Document == nil ||
		conflictErr.Current.Document.ID != "doc_home" ||
		conflictErr.Current.Document.Type != WorkspaceDocumentTypePIRPage ||
		conflictErr.Current.Document.Path != "/pages/home.pir.json" ||
		conflictErr.Current.Document.ContentRev != 7 ||
		conflictErr.Current.Document.MetaRev != 2 ||
		!conflictErr.Current.Document.UpdatedAt.Equal(currentUpdatedAt) {
		t.Fatalf("unexpected current document metadata: %+v", conflictErr.Current.Document)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStorePatchDocumentContentLocksWorkspaceBeforeMissingDocumentLookup(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 6, 0, 0, time.UTC)
	command := buildTestCommand("cmd_missing_document", issuedAt, "ws_1", "doc_missing", "core.pir", "document.update")
	lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)
	lockDocument := regexp.QuoteMeta(`SELECT doc_type, path, updated_at, content_json, content_rev, meta_rev
FROM workspace_documents
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockWorkspace).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(11, 4, 39))
	mock.ExpectQuery(lockDocument).
		WithArgs("ws_1", "doc_missing").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()

	_, err = store.PatchDocumentContent(context.Background(), PatchDocumentContentParams{
		WorkspaceID:        "ws_1",
		DocumentID:         "doc_missing",
		ExpectedContentRev: 1,
		Command:            command,
	})
	if !errors.Is(err, ErrWorkspaceDocumentNotFound) {
		t.Fatalf("expected missing document error, got %v", err)
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
	expectRouteReferenceDocuments(mock, routeReferenceTestDocument{id: "doc_root", documentType: WorkspaceDocumentTypePIRPage, path: "/pir.json"})
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

func TestWorkspaceStoreSaveRouteManifestRejectsInvalidManifest(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 2, 30, 0, time.UTC)
	command := buildTestCommand("cmd_route_update_bad", issuedAt, "ws_1", "", "core.route", "manifest.update")

	_, err = store.SaveRouteManifest(context.Background(), SaveRouteManifestParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 9,
		ExpectedRouteRev:     4,
		RouteManifest: json.RawMessage(`{
			"version":"1",
			"root":{
				"id":"root",
				"children":[
					{"id":"index-a","index":true,"segment":"home"},
					{"id":"index-b","index":true}
				]
			}
		}`),
		Command: command,
	})
	if err == nil {
		t.Fatal("expected invalid route manifest error")
	}
	var routeErr *RouteManifestValidationError
	if !errors.As(err, &routeErr) {
		t.Fatalf("expected RouteManifestValidationError, got %T %v", err, err)
	}
	if len(routeErr.Issues) == 0 {
		t.Fatal("expected validation issues")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStoreSaveRouteManifestPersistsNormalizedManifest(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	store := NewWorkspaceStore(db)
	issuedAt := time.Date(2026, time.February, 8, 10, 2, 45, 0, time.UTC)
	command := buildTestCommand("cmd_route_update_normalized", issuedAt, "ws_1", "", "core.route", "manifest.update")

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
	expectRouteReferenceDocuments(mock, routeReferenceTestDocument{id: "doc_root", documentType: WorkspaceDocumentTypePIRPage, path: "/pir.json"})
	mock.ExpectExec(upsertRoute).
		WithArgs("ws_1", `{"root":{"children":[{"id":"users","segment":"/users/"}],"id":"root"},"version":"1"}`).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(bumpWorkspaceAndRoute).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(10, 5, 35))
	mock.ExpectExec(insertOperation).
		WithArgs("ws_1", int64(35), "core.route.manifest.update@1.0", nil, sqlmock.AnyArg(), issuedAt.UTC()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	_, err = store.SaveRouteManifest(context.Background(), SaveRouteManifestParams{
		WorkspaceID:          "ws_1",
		ExpectedWorkspaceRev: 9,
		ExpectedRouteRev:     4,
		RouteManifest:        json.RawMessage(`{"version":"1","root":{"id":"root","children":[{"segment":"/users/","id":"users"}]}}`),
		Command:              command,
	})
	if err != nil {
		t.Fatalf("save route manifest: %v", err)
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
	if conflictErr.Expected.WorkspaceRev != 9 || conflictErr.Current.WorkspaceRev != 10 {
		t.Fatalf("unexpected workspace revision conflict: %+v", conflictErr)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceStorePatchDocumentContentRejectsRevisionCapacityBeforeMutation(t *testing.T) {
	tests := []struct {
		name              string
		currentContentRev int64
		currentOpSeq      int64
		expectedField     string
	}{
		{name: "content revision", currentContentRev: maxJSONSafeInteger, currentOpSeq: 33, expectedField: "contentRev"},
		{name: "operation sequence", currentContentRev: 3, currentOpSeq: maxJSONSafeInteger, expectedField: "opSeq"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()

			store := NewWorkspaceStore(db)
			issuedAt := time.Date(2026, time.July, 12, 12, 0, 0, 0, time.UTC)
			command := buildTestCommand("cmd_capacity_document", issuedAt, "ws_1", "doc_home", "core.pir", "document.update")
			lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)
			lockDocument := regexp.QuoteMeta(`SELECT doc_type, path, updated_at, content_json, content_rev, meta_rev
FROM workspace_documents
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`)

			mock.ExpectBegin()
			mock.ExpectQuery(lockWorkspace).
				WithArgs("ws_1").
				WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(9, 4, test.currentOpSeq))
			mock.ExpectQuery(lockDocument).
				WithArgs("ws_1", "doc_home").
				WillReturnRows(sqlmock.NewRows([]string{"doc_type", "path", "updated_at", "content_json", "content_rev", "meta_rev"}).
					AddRow("pir-page", "/pages/home.pir.json", issuedAt, []byte(`{"title":"prev"}`), test.currentContentRev, 1))
			mock.ExpectRollback()

			_, err = store.PatchDocumentContent(context.Background(), PatchDocumentContentParams{
				WorkspaceID:        "ws_1",
				DocumentID:         "doc_home",
				ExpectedContentRev: test.currentContentRev,
				Command:            command,
			})
			var limitErr *workspaceRevisionLimitError
			if !errors.As(err, &limitErr) || limitErr.Reason != revisionLimitReasonCapacity || limitErr.Field != test.expectedField {
				t.Fatalf("expected %s capacity error, got %v", test.expectedField, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected SQL mutation: %v", err)
			}
		})
	}
}

func TestWorkspaceStoreSaveRouteManifestRejectsRevisionCapacityBeforeMutation(t *testing.T) {
	tests := []struct {
		name                string
		currentWorkspaceRev int64
		currentRouteRev     int64
		currentOpSeq        int64
		expectedField       string
	}{
		{name: "workspace revision", currentWorkspaceRev: maxJSONSafeInteger, currentRouteRev: 4, currentOpSeq: 33, expectedField: "workspaceRev"},
		{name: "route revision", currentWorkspaceRev: 9, currentRouteRev: maxJSONSafeInteger, currentOpSeq: 33, expectedField: "routeRev"},
		{name: "operation sequence", currentWorkspaceRev: 9, currentRouteRev: 4, currentOpSeq: maxJSONSafeInteger, expectedField: "opSeq"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()

			store := NewWorkspaceStore(db)
			issuedAt := time.Date(2026, time.July, 12, 12, 1, 0, 0, time.UTC)
			command := buildTestCommand("cmd_capacity_route", issuedAt, "ws_1", "", "core.route", "manifest.update")
			lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)

			mock.ExpectBegin()
			mock.ExpectQuery(lockWorkspace).
				WithArgs("ws_1").
				WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).
					AddRow(test.currentWorkspaceRev, test.currentRouteRev, test.currentOpSeq))
			mock.ExpectRollback()

			_, err = store.SaveRouteManifest(context.Background(), SaveRouteManifestParams{
				WorkspaceID:          "ws_1",
				ExpectedWorkspaceRev: test.currentWorkspaceRev,
				ExpectedRouteRev:     test.currentRouteRev,
				RouteManifest:        json.RawMessage(`{"version":"1","root":{"id":"root"}}`),
				Command:              command,
			})
			var limitErr *workspaceRevisionLimitError
			if !errors.As(err, &limitErr) || limitErr.Reason != revisionLimitReasonCapacity || limitErr.Field != test.expectedField {
				t.Fatalf("expected %s capacity error, got %v", test.expectedField, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected SQL mutation: %v", err)
			}
		})
	}
}

func TestWorkspaceStoreSaveWorkspaceSettingsRejectsRevisionCapacityBeforeMutation(t *testing.T) {
	tests := []struct {
		name                string
		currentWorkspaceRev int64
		currentOpSeq        int64
		expectedField       string
	}{
		{name: "workspace revision", currentWorkspaceRev: maxJSONSafeInteger, currentOpSeq: 33, expectedField: "workspaceRev"},
		{name: "operation sequence", currentWorkspaceRev: 9, currentOpSeq: maxJSONSafeInteger, expectedField: "opSeq"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create sqlmock: %v", err)
			}
			defer db.Close()

			store := NewWorkspaceStore(db)
			issuedAt := time.Date(2026, time.July, 12, 12, 2, 0, 0, time.UTC)
			command := buildTestCommand("cmd_capacity_settings", issuedAt, "ws_1", "", "core.settings", "global.update")
			lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)

			mock.ExpectBegin()
			mock.ExpectQuery(lockWorkspace).
				WithArgs("ws_1").
				WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).
					AddRow(test.currentWorkspaceRev, 4, test.currentOpSeq))
			mock.ExpectRollback()

			_, err = store.SaveWorkspaceSettings(context.Background(), SaveWorkspaceSettingsParams{
				WorkspaceID:          "ws_1",
				ExpectedWorkspaceRev: test.currentWorkspaceRev,
				Settings:             json.RawMessage(`{"global":{"eventTriggerMode":"always"},"projectGlobalById":{}}`),
				Command:              command,
			})
			var limitErr *workspaceRevisionLimitError
			if !errors.As(err, &limitErr) || limitErr.Reason != revisionLimitReasonCapacity || limitErr.Field != test.expectedField {
				t.Fatalf("expected %s capacity error, got %v", test.expectedField, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected SQL mutation: %v", err)
			}
		})
	}
}
