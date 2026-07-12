package workspace

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	"github.com/gin-gonic/gin"
)

func TestHandleGetWorkspaceReturnsSnapshot(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()

	expectWorkspaceSnapshotQueries(mock, "ws_1")

	context, response := newWorkspaceHandlerContext(
		http.MethodGet,
		"/api/workspaces/ws_1",
		"",
		gin.Params{{Key: "workspaceId", Value: "ws_1"}},
	)

	handler.HandleGetWorkspace(context)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	workspace, ok := payload["workspace"].(map[string]any)
	if !ok {
		t.Fatalf("missing workspace payload: %v", payload)
	}
	if workspace["id"] != "ws_1" {
		t.Fatalf("unexpected workspace id: %v", workspace["id"])
	}
	settings, ok := workspace["settings"].(map[string]any)
	if !ok {
		t.Fatalf("missing workspace settings payload: %v", workspace)
	}
	global, ok := settings["global"].(map[string]any)
	if !ok || global["eventTriggerMode"] != "selected-only" {
		t.Fatalf("unexpected settings payload: %v", settings)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandleGetWorkspaceNotFound(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()

	workspaceQuery := regexp.QuoteMeta(`SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq, w.tree_root_id, w.tree_json, w.created_at, w.updated_at, r.manifest_json, s.settings_json
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
LEFT JOIN workspace_settings s ON s.workspace_id = w.id
WHERE w.id = $1 AND w.owner_id = $2`)
	mock.ExpectQuery(workspaceQuery).WithArgs("ws_missing", "user_1").WillReturnError(sql.ErrNoRows)
	projectQuery := regexp.QuoteMeta(`SELECT id, owner_id, resource_type, name, description, pir_json, is_public, stars_count, created_at, updated_at
FROM projects
WHERE owner_id = $1 AND id = $2`)
	mock.ExpectQuery(projectQuery).WithArgs("user_1", "ws_missing").WillReturnError(sql.ErrNoRows)

	context, response := newWorkspaceHandlerContext(
		http.MethodGet,
		"/api/workspaces/ws_missing",
		"",
		gin.Params{{Key: "workspaceId", Value: "ws_missing"}},
	)

	handler.HandleGetWorkspace(context)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if errorCode(payload) != ErrorWorkspaceNotFound {
		t.Fatalf("unexpected error payload: %v", payload)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandleGetWorkspaceCapabilitiesReturnsCapabilityMap(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()

	expectWorkspaceSnapshotQueries(mock, "ws_1")

	context, response := newWorkspaceHandlerContext(
		http.MethodGet,
		"/api/workspaces/ws_1/capabilities",
		"",
		gin.Params{{Key: "workspaceId", Value: "ws_1"}},
	)

	handler.HandleGetWorkspaceCapabilities(context)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var payload struct {
		WorkspaceID  string          `json:"workspaceId"`
		Capabilities map[string]bool `json:"capabilities"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.WorkspaceID != "ws_1" {
		t.Fatalf("unexpected workspaceId: %s", payload.WorkspaceID)
	}
	if !payload.Capabilities["core.pir.document.update@1.0"] {
		t.Fatalf("missing core pir capability: %+v", payload.Capabilities)
	}
	if !payload.Capabilities["core.settings.global.update@1.0"] {
		t.Fatalf("missing core settings capability: %+v", payload.Capabilities)
	}
	if payload.Capabilities["core.nodegraph.node.move@1.0"] {
		t.Fatalf("reserved nodegraph capability should be false: %+v", payload.Capabilities)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestWorkspaceReadEndpointsHideWorkspaceFromNonOwner(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		handle func(*Handler, *gin.Context)
	}{
		{name: "snapshot", path: "/api/workspaces/ws_1", handle: func(handler *Handler, context *gin.Context) { handler.HandleGetWorkspace(context) }},
		{name: "capabilities", path: "/api/workspaces/ws_1/capabilities", handle: func(handler *Handler, context *gin.Context) { handler.HandleGetWorkspaceCapabilities(context) }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
			defer cleanup()
			expectWorkspaceHiddenFromOwner(mock, "ws_1", "user_other")

			context, response := newWorkspaceHandlerContext(
				http.MethodGet,
				test.path,
				"",
				gin.Params{{Key: "workspaceId", Value: "ws_1"}},
			)
			context.Set("authUser", &backendauth.User{ID: "user_other"})

			test.handle(handler, context)

			assertWorkspaceNotFoundWithoutConflictMetadata(t, response)
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("sql expectations: %v", err)
			}
		})
	}
}

func TestWorkspaceMutationEndpointsHideConflictMetadataFromNonOwner(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		handle func(*Handler, *gin.Context)
	}{
		{
			name:   "patch document",
			method: http.MethodPatch,
			path:   "/api/workspaces/ws_1/documents/doc_home",
			body: `{
				"expectedContentRev": 1,
				"clientMutationId": "unauthorized_patch",
				"command": {
					"id": "cmd_unauthorized_patch",
					"namespace": "core.pir",
					"type": "document.update",
					"version": "1.0",
					"issuedAt": "2026-02-08T10:00:00Z",
					"forwardOps": [{"op":"replace","path":"/title","value":"local"}],
					"reverseOps": [{"op":"replace","path":"/title","value":"base"}],
					"target": {"workspaceId":"ws_1","documentId":"doc_home"}
				}
			}`,
			params: gin.Params{{Key: "workspaceId", Value: "ws_1"}, {Key: "documentId", Value: "doc_home"}},
			handle: func(handler *Handler, context *gin.Context) { handler.HandlePatchWorkspaceDocument(context) },
		},
		{
			name:   "apply intent",
			method: http.MethodPost,
			path:   "/api/workspaces/ws_1/intents",
			body: `{
				"expectedWorkspaceRev": 1,
				"expectedRouteRev": 1,
				"clientMutationId": "unauthorized_intent",
				"intent": {
					"id": "intent_unauthorized",
					"namespace": "core.route",
					"type": "manifest.update",
					"version": "1.0",
					"payload": {"routeManifest":{"version":"1","root":{"id":"root"}}},
					"issuedAt": "2026-02-08T10:00:00Z"
				}
			}`,
			params: gin.Params{{Key: "workspaceId", Value: "ws_1"}},
			handle: func(handler *Handler, context *gin.Context) { handler.HandleApplyWorkspaceIntent(context) },
		},
		{
			name:   "commit operation",
			method: http.MethodPost,
			path:   "/api/workspaces/ws_1/operations/commit",
			body:   `{}`,
			params: gin.Params{{Key: "workspaceId", Value: "ws_1"}},
			handle: func(handler *Handler, context *gin.Context) { handler.HandleCommitWorkspaceOperation(context) },
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
			defer cleanup()

			authorizeQuery := regexp.QuoteMeta(`SELECT 1
FROM workspaces
WHERE id = $1 AND owner_id = $2`)
			mock.ExpectQuery(authorizeQuery).
				WithArgs("ws_1", "user_other").
				WillReturnError(sql.ErrNoRows)

			context, response := newWorkspaceHandlerContext(test.method, test.path, test.body, test.params)
			context.Set("authUser", &backendauth.User{ID: "user_other"})

			test.handle(handler, context)

			assertWorkspaceNotFoundWithoutConflictMetadata(t, response)
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("sql expectations: %v", err)
			}
		})
	}
}

func TestHandleApplyWorkspaceIntentRejectsUnsupportedIntent(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()
	expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

	context, response := newWorkspaceHandlerContext(
		http.MethodPost,
		"/api/workspaces/ws_1/intents",
		`{
			"expectedWorkspaceRev": 9,
			"expectedRouteRev": 4,
			"intent": {
				"id": "intent_1",
				"namespace": "core.route",
				"type": "create",
				"version": "1.0",
				"payload": {},
				"issuedAt": "2026-02-08T10:00:00Z"
			}
		}`,
		gin.Params{{Key: "workspaceId", Value: "ws_1"}},
	)

	handler.HandleApplyWorkspaceIntent(context)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if errorCode(payload) != ErrorUnsupportedIntent {
		t.Fatalf("unexpected error payload: %v", payload)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandleApplyWorkspaceIntentReturnsRouteConflict(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()
	expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

	lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockWorkspace).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(9, 5, 35))
	mock.ExpectRollback()

	context, response := newWorkspaceHandlerContext(
		http.MethodPost,
		"/api/workspaces/ws_1/intents",
		`{
			"expectedWorkspaceRev": 9,
			"expectedRouteRev": 4,
			"intent": {
				"id": "intent_2",
				"namespace": "core.route",
				"type": "manifest.update",
				"version": "1.0",
				"payload": {
					"routeManifest": {"version":"1","root":{"id":"root"}}
				},
				"issuedAt": "2026-02-08T10:02:00Z"
			}
		}`,
		gin.Params{{Key: "workspaceId", Value: "ws_1"}},
	)

	handler.HandleApplyWorkspaceIntent(context)

	if response.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if errorCode(payload) != "WKS-4002" {
		t.Fatalf("unexpected conflict payload: %v", payload)
	}
	errorPayload := payload["error"].(map[string]any)
	details := errorPayload["details"].(map[string]any)
	expected := details["expected"].(map[string]any)
	current := details["current"].(map[string]any)
	if expected["workspaceRev"] != float64(9) || expected["routeRev"] != float64(4) {
		t.Fatalf("unexpected expected revisions: %v", expected)
	}
	if current["workspaceRev"] != float64(9) || current["routeRev"] != float64(5) || current["opSeq"] != float64(35) {
		t.Fatalf("unexpected current revisions: %v", current)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandlePatchWorkspaceDocumentReturnsCanonicalDocumentConflict(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()
	expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

	updatedAt := time.Date(2026, time.February, 8, 10, 4, 0, 0, time.UTC)
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
			AddRow(9, 4, 35))
	mock.ExpectQuery(lockDocument).
		WithArgs("ws_1", "doc_home").
		WillReturnRows(sqlmock.NewRows([]string{"doc_type", "path", "updated_at", "content_json", "content_rev", "meta_rev"}).
			AddRow("pir-page", "/pages/home.pir.json", updatedAt, []byte(`{"title":"remote"}`), 4, 2))
	mock.ExpectRollback()

	context, response := newWorkspaceHandlerContext(
		http.MethodPatch,
		"/api/workspaces/ws_1/documents/doc_home",
		`{
			"expectedContentRev": 3,
			"clientMutationId": "mutation_1",
			"command": {
				"id": "cmd_stale_1",
				"namespace": "core.pir",
				"type": "document.update",
				"version": "1.0",
				"issuedAt": "2026-02-08T10:05:00Z",
				"forwardOps": [{"op":"replace","path":"/title","value":"local"}],
				"reverseOps": [{"op":"replace","path":"/title","value":"base"}],
				"target": {"workspaceId":"ws_1","documentId":"doc_home"}
			}
		}`,
		gin.Params{{Key: "workspaceId", Value: "ws_1"}, {Key: "documentId", Value: "doc_home"}},
	)

	handler.HandlePatchWorkspaceDocument(context)

	if response.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if errorCode(payload) != "WKS-4003" {
		t.Fatalf("unexpected conflict payload: %v", payload)
	}
	errorPayload := payload["error"].(map[string]any)
	details := errorPayload["details"].(map[string]any)
	expectedDocument := details["expected"].(map[string]any)["document"].(map[string]any)
	currentDocument := details["current"].(map[string]any)["document"].(map[string]any)
	if expectedDocument["id"] != "doc_home" || expectedDocument["contentRev"] != float64(3) {
		t.Fatalf("unexpected expected document: %v", expectedDocument)
	}
	if currentDocument["id"] != "doc_home" ||
		currentDocument["type"] != "pir-page" ||
		currentDocument["path"] != "/pages/home.pir.json" ||
		currentDocument["contentRev"] != float64(4) ||
		currentDocument["metaRev"] != float64(2) ||
		currentDocument["updatedAt"] != updatedAt.Format(time.RFC3339) {
		t.Fatalf("unexpected current document: %v", currentDocument)
	}
	if _, leaked := currentDocument["content"]; leaked {
		t.Fatalf("conflict response leaked document content: %v", currentDocument)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandleApplyWorkspaceIntentSavesSettings(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()
	expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

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
		WithArgs("ws_1", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(bumpWorkspaceOnly).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(10, 4, 35))
	mock.ExpectExec(insertOperation).
		WithArgs("ws_1", int64(35), "core.settings.global.update@1.0", nil, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	context, response := newWorkspaceHandlerContext(
		http.MethodPost,
		"/api/workspaces/ws_1/intents",
		`{
			"expectedWorkspaceRev": 9,
			"intent": {
				"id": "intent_settings_1",
				"namespace": "core.settings",
				"type": "global.update",
				"version": "1.0",
				"payload": {
					"settings": {
						"global": {"eventTriggerMode":"selected-only"},
						"projectGlobalById": {}
					}
				},
				"issuedAt": "2026-02-08T10:05:00Z"
			}
		}`,
		gin.Params{{Key: "workspaceId", Value: "ws_1"}},
	)

	handler.HandleApplyWorkspaceIntent(context)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["workspaceRev"] != float64(10) || payload["routeRev"] != float64(4) {
		t.Fatalf("unexpected mutation payload: %v", payload)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandleApplyWorkspaceIntentCreatesCodeDocument(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()
	expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

	now := time.Date(2026, time.February, 8, 10, 10, 0, 0, time.UTC)
	lockWorkspace := regexp.QuoteMeta(`SELECT workspace_rev, route_rev, op_seq, tree_root_id, tree_json
FROM workspaces
WHERE id = $1
FOR UPDATE`)
	documentQuery := regexp.QuoteMeta(`SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`)
	insertDocument := regexp.QuoteMeta(`INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at
) VALUES ($1, $2, $3, $4, $5, 1, 1, $6::jsonb, NOW())
RETURNING workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at`)
	updateWorkspace := regexp.QuoteMeta(`UPDATE workspaces
SET tree_json = $2::jsonb, workspace_rev = workspace_rev + 1, op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`)
	insertOperation := regexp.QuoteMeta(`INSERT INTO workspace_operations (workspace_id, op_seq, domain, document_id, payload_json, created_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`)

	mock.ExpectBegin()
	mock.ExpectQuery(lockWorkspace).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json"}).
			AddRow(9, 4, 34, "root", []byte(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc_root_node"]},"doc_root_node":{"id":"doc_root_node","kind":"doc","name":"pir.json","parentId":"root","docId":"doc_root"}}}`)))
	mock.ExpectQuery(documentQuery).
		WithArgs("ws_1").
		WillReturnRows(sqlmock.NewRows([]string{
			"workspace_id", "id", "doc_type", "name", "path", "content_rev", "meta_rev", "content_json", "capabilities_json", "updated_at",
		}).AddRow(
			"ws_1",
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
	mock.ExpectQuery(insertDocument).
		WithArgs(
			"ws_1",
			"code_mounted_css_button_1",
			"code",
			"button-1.css",
			"/styles/mounted/button-1.css",
			`{"language":"css","metadata":{"slotKind":"mounted-css"},"source":"/* Mounted CSS */\n"}`,
		).
		WillReturnRows(sqlmock.NewRows([]string{
			"workspace_id", "id", "doc_type", "name", "path", "content_rev", "meta_rev", "content_json", "capabilities_json", "updated_at",
		}).AddRow(
			"ws_1",
			"code_mounted_css_button_1",
			"code",
			"button-1.css",
			"/styles/mounted/button-1.css",
			1,
			1,
			[]byte(`{"language":"css","metadata":{"slotKind":"mounted-css"},"source":"/* Mounted CSS */\n"}`),
			[]byte(`[]`),
			now,
		))
	mock.ExpectQuery(updateWorkspace).
		WithArgs("ws_1", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"workspace_rev", "route_rev", "op_seq"}).AddRow(10, 4, 35))
	mock.ExpectExec(insertOperation).
		WithArgs(
			"ws_1",
			int64(35),
			"core.workspace.code-document.create@1.0",
			"code_mounted_css_button_1",
			sqlmock.AnyArg(),
			now,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	context, response := newWorkspaceHandlerContext(
		http.MethodPost,
		"/api/workspaces/ws_1/intents",
		`{
			"expectedWorkspaceRev": 9,
			"intent": {
				"id": "intent_code_create_1",
				"namespace": "core.workspace",
				"type": "code-document.create",
				"version": "1.0",
				"payload": {
					"documentId": "code_mounted_css_button_1",
					"nodeId": "node_code_mounted_css_button_1",
					"path": "/styles/mounted/button-1.css",
					"content": {
						"language": "css",
						"source": "/* Mounted CSS */\n",
						"metadata": {"slotKind":"mounted-css"}
					}
				},
				"issuedAt": "2026-02-08T10:10:00Z"
			}
		}`,
		gin.Params{{Key: "workspaceId", Value: "ws_1"}},
	)

	handler.HandleApplyWorkspaceIntent(context)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["workspaceRev"] != float64(10) || payload["opSeq"] != float64(35) {
		t.Fatalf("unexpected mutation payload: %v", payload)
	}
	updatedDocuments, ok := payload["updatedDocuments"].([]any)
	if !ok || len(updatedDocuments) != 1 {
		t.Fatalf("missing updated document payload: %v", payload)
	}
	updatedDocument, ok := updatedDocuments[0].(map[string]any)
	if !ok {
		t.Fatalf("invalid updated document payload: %v", updatedDocuments[0])
	}
	content, ok := updatedDocument["content"].(map[string]any)
	if !ok ||
		updatedDocument["type"] != "code" ||
		updatedDocument["path"] != "/styles/mounted/button-1.css" ||
		content["language"] != "css" ||
		content["source"] != "/* Mounted CSS */\n" {
		t.Fatalf("unexpected updated document payload: %v", updatedDocument)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandleCommitWorkspaceOperationRejectsUnsupportedOperation(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()
	expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

	context, response := newWorkspaceHandlerContext(
		http.MethodPost,
		"/api/workspaces/ws_1/operations/commit",
		`{
			"expected": {"documents": []},
			"operation": {"kind":"noop"}
		}`,
		gin.Params{{Key: "workspaceId", Value: "ws_1"}},
	)

	handler.HandleCommitWorkspaceOperation(context)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if errorCode(payload) != ErrorInvalidPayload {
		t.Fatalf("unexpected error payload: %v", payload)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandleCommitWorkspaceOperationStrictlyRejectsUnknownFields(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()
	expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

	context, response := newWorkspaceHandlerContext(
		http.MethodPost,
		"/api/workspaces/ws_1/operations/commit",
		`{
			"expected": {"documents": []},
			"operation": {"kind":"command","unknown":true}
		}`,
		gin.Params{{Key: "workspaceId", Value: "ws_1"}},
	)

	handler.HandleCommitWorkspaceOperation(context)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}

func TestHandleCommitWorkspaceOperationRejectsEmptyPresentOptionalTargetIDs(t *testing.T) {
	for _, targetField := range []string{`"documentId":""`, `"routeNodeId":""`} {
		t.Run(targetField, func(t *testing.T) {
			handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
			defer cleanup()
			expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

			body := strings.Replace(`{
				"expected": {"documents": []},
				"operation": {
					"kind": "command",
					"command": {
						"id": "command_empty_target",
						"namespace": "core.workspace",
						"type": "tree.update",
						"version": "1.0",
						"issuedAt": "2026-07-12T00:00:00Z",
						"forwardOps": [{"op":"replace","path":"/treeRootId","value":"next-root"}],
						"reverseOps": [{"op":"replace","path":"/treeRootId","value":"root"}],
						"target": {"workspaceId":"ws_1", TARGET_FIELD},
						"domainHint": "workspace"
					}
				}
			}`, "TARGET_FIELD", targetField, 1)
			context, response := newWorkspaceHandlerContext(
				http.MethodPost,
				"/api/workspaces/ws_1/operations/commit",
				body,
				gin.Params{{Key: "workspaceId", Value: "ws_1"}},
			)

			handler.HandleCommitWorkspaceOperation(context)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
			}
			var payload map[string]any
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if errorCode(payload) != ErrorInvalidPayload {
				t.Fatalf("unexpected error payload: %v", payload)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("sql expectations: %v", err)
			}
		})
	}
}

func TestWorkspaceOperationCommitWirePresenceRejectsExplicitNulls(t *testing.T) {
	testCases := []struct {
		name string
		body string
		path string
	}{
		{
			name: "transaction target id",
			body: `{"operation":{"kind":"transaction","transaction":{"commands":[{"target":{"workspaceId":"ws_1","routeNodeId":null}}]}}}`,
			path: "/operation/transaction/commands/0/target/routeNodeId",
		},
		{
			name: "operation metadata",
			body: `{"operation":{"kind":"command","undoOf":null}}`,
			path: "/operation/undoOf",
		},
		{
			name: "operation sources",
			body: `{"operation":{"kind":"command","sourceOperationIds":null}}`,
			path: "/operation/sourceOperationIds",
		},
		{
			name: "command domain",
			body: `{"operation":{"kind":"command","command":{"domainHint":null}}}`,
			path: "/operation/command/domainHint",
		},
		{
			name: "transaction label",
			body: `{"operation":{"kind":"transaction","transaction":{"label":null}}}`,
			path: "/operation/transaction/label",
		},
		{
			name: "patch from",
			body: `{"operation":{"kind":"command","command":{"forwardOps":[{"op":"remove","path":"/x","from":null}]}}}`,
			path: "/operation/command/forwardOps/0/from",
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateWorkspaceOperationCommitWirePresence(json.RawMessage(testCase.body))
			var validation *WorkspaceOperationCommitValidationError
			if !errors.As(err, &validation) || validation.Path != testCase.path {
				t.Fatalf("expected presence error at %s, got %v", testCase.path, err)
			}
		})
	}

	valid := json.RawMessage(`{
		"operation": {
			"kind": "command",
			"command": {"target":{"workspaceId":"ws_1"}}
		}
	}`)
	if err := validateWorkspaceOperationCommitWirePresence(valid); err != nil {
		t.Fatalf("absent optional target ids must remain valid: %v", err)
	}
}

func TestHandlePatchWorkspaceDocumentRejectsUnsafeExpectedRevisionBeforeStore(t *testing.T) {
	handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
	defer cleanup()
	expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

	context, response := newWorkspaceHandlerContext(
		http.MethodPatch,
		"/api/workspaces/ws_1/documents/doc_home",
		`{"expectedContentRev":9007199254740992,"command":{}}`,
		gin.Params{{Key: "workspaceId", Value: "ws_1"}, {Key: "documentId", Value: "doc_home"}},
	)

	handler.HandlePatchWorkspaceDocument(context)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if errorCode(payload) != ErrorInvalidPayload {
		t.Fatalf("unexpected error payload: %v", payload)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected store query: %v", err)
	}
}

func TestHandleApplyWorkspaceIntentRejectsUnsafeExpectedRevisionsBeforeStore(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{
			name: "workspace revision",
			body: `{"expectedWorkspaceRev":9007199254740992,"intent":{}}`,
		},
		{
			name: "route revision",
			body: `{"expectedWorkspaceRev":1,"expectedRouteRev":9007199254740992,"intent":{}}`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler, mock, cleanup := newWorkspaceHandlerTestHandler(t)
			defer cleanup()
			expectWorkspaceOwnerAuthorization(mock, "ws_1", "user_1")

			context, response := newWorkspaceHandlerContext(
				http.MethodPost,
				"/api/workspaces/ws_1/intents",
				test.body,
				gin.Params{{Key: "workspaceId", Value: "ws_1"}},
			)

			handler.HandleApplyWorkspaceIntent(context)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
			}
			var payload map[string]any
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if errorCode(payload) != ErrorInvalidPayload {
				t.Fatalf("unexpected error payload: %v", payload)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected store query: %v", err)
			}
		})
	}
}

func errorCode(payload map[string]any) string {
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		return ""
	}
	code, _ := errorPayload["code"].(string)
	return code
}

func newWorkspaceHandlerTestHandler(t *testing.T) (*Handler, sqlmock.Sqlmock, func()) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}

	projectStore := backendproject.NewProjectStore(db)
	store := NewWorkspaceStore(db)
	module := NewModule(store, projectStore)
	handler := NewHandler(store, module)
	return handler, mock, func() {
		_ = db.Close()
	}
}

func newWorkspaceHandlerContext(method, path, body string, params gin.Params) (*gin.Context, *httptest.ResponseRecorder) {
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)

	var bodyReader *strings.Reader
	if body == "" {
		bodyReader = strings.NewReader("")
	} else {
		bodyReader = strings.NewReader(body)
	}
	request := httptest.NewRequest(method, path, bodyReader)
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	context.Request = request
	context.Params = params
	context.Set("authUser", &backendauth.User{ID: "user_1"})
	return context, response
}

func expectWorkspaceSnapshotQueries(mock sqlmock.Sqlmock, workspaceID string) {
	now := time.Date(2026, time.February, 8, 9, 0, 0, 0, time.UTC)

	workspaceQuery := regexp.QuoteMeta(`SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq, w.tree_root_id, w.tree_json, w.created_at, w.updated_at, r.manifest_json, s.settings_json
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
LEFT JOIN workspace_settings s ON s.workspace_id = w.id
WHERE w.id = $1 AND w.owner_id = $2`)
	documentQuery := regexp.QuoteMeta(`SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`)

	mock.ExpectQuery(workspaceQuery).
		WithArgs(workspaceID, "user_1").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "project_id", "owner_id", "name", "workspace_rev", "route_rev", "op_seq", "tree_root_id", "tree_json", "created_at", "updated_at", "manifest_json", "settings_json",
		}).AddRow(
			workspaceID,
			"project_1",
			"user_1",
			"Workspace One",
			3,
			2,
			11,
			"root",
			[]byte(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["doc_home_node"]},"doc_home_node":{"id":"doc_home_node","kind":"doc","name":"home","parentId":"root","docId":"doc_home"}}}`),
			now,
			now,
			[]byte(`{"version":"1","root":{"id":"root"}}`),
			[]byte(`{"global":{"eventTriggerMode":"selected-only"},"projectGlobalById":{}}`),
		))
	mock.ExpectQuery(documentQuery).
		WithArgs(workspaceID).
		WillReturnRows(sqlmock.NewRows([]string{
			"workspace_id", "id", "doc_type", "name", "path", "content_rev", "meta_rev", "content_json", "capabilities_json", "updated_at",
		}).AddRow(
			workspaceID,
			"doc_home",
			"pir-page",
			"Home",
			"/home",
			4,
			1,
			[]byte(`{"type":"page"}`),
			[]byte(`[]`),
			now,
		))
}

func expectWorkspaceOwnerAuthorization(mock sqlmock.Sqlmock, workspaceID string, ownerID string) {
	query := regexp.QuoteMeta(`SELECT 1
FROM workspaces
WHERE id = $1 AND owner_id = $2`)
	mock.ExpectQuery(query).
		WithArgs(workspaceID, ownerID).
		WillReturnRows(sqlmock.NewRows([]string{"marker"}).AddRow(1))
}

func expectWorkspaceHiddenFromOwner(mock sqlmock.Sqlmock, workspaceID string, ownerID string) {
	workspaceQuery := regexp.QuoteMeta(`SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq, w.tree_root_id, w.tree_json, w.created_at, w.updated_at, r.manifest_json, s.settings_json
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
LEFT JOIN workspace_settings s ON s.workspace_id = w.id
WHERE w.id = $1 AND w.owner_id = $2`)
	mock.ExpectQuery(workspaceQuery).
		WithArgs(workspaceID, ownerID).
		WillReturnError(sql.ErrNoRows)
	projectQuery := regexp.QuoteMeta(`SELECT id, owner_id, resource_type, name, description, pir_json, is_public, stars_count, created_at, updated_at
FROM projects
WHERE owner_id = $1 AND id = $2`)
	mock.ExpectQuery(projectQuery).
		WithArgs(ownerID, workspaceID).
		WillReturnError(sql.ErrNoRows)
}

func assertWorkspaceNotFoundWithoutConflictMetadata(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if errorCode(payload) != ErrorWorkspaceNotFound {
		t.Fatalf("unexpected error payload: %v", payload)
	}
	errorPayload := payload["error"].(map[string]any)
	if _, exists := errorPayload["details"]; exists {
		t.Fatalf("workspace authorization failure leaked details: %v", errorPayload)
	}
}
