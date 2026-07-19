package remoteexecution

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
)

func TestWorkspaceExecutionCollaboratorRolesPostgreSQLGate(t *testing.T) {
	database := openDataGatewayReplayPostgreSQL(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	now := time.Now().UTC()
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)`, []any{"viewer-gate-owner", "viewer-gate-owner@example.test", "Viewer Gate Owner", []byte("integration-only"), now}},
		{`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)`, []any{"viewer-gate-reader", "viewer-gate-reader@example.test", "Viewer Gate Reader", []byte("integration-only"), now}},
		{`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)`, []any{"viewer-gate-stranger", "viewer-gate-stranger@example.test", "Viewer Gate Stranger", []byte("integration-only"), now}},
		{`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at) VALUES ($1,$2,'project',$3,$4,$4)`, []any{"viewer-gate-project", "viewer-gate-owner", "Viewer Role Gate", now}},
		{`INSERT INTO workspaces (id, project_id, owner_id, name, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`, []any{"viewer-gate-workspace", "viewer-gate-project", "viewer-gate-owner", "Viewer Role Gate", now}},
	}
	for _, statement := range statements {
		if _, err := database.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("seed viewer role PostgreSQL fixture: %v", err)
		}
	}
	store := NewStore(database)

	ownerPermissions, err := store.ResolveWorkspaceExecutionPermissions(ctx, "viewer-gate-owner", "viewer-gate-workspace")
	if err != nil || len(ownerPermissions) != 3 || ownerPermissions[0] != workspaceOwnerPermissionID || ownerPermissions[1] != workspaceReadPermissionID || ownerPermissions[2] != workspaceWritePermissionID {
		t.Fatalf("owner permission projection drifted: permissions=%v err=%v", ownerPermissions, err)
	}
	if permissions, err := store.ResolveWorkspaceExecutionPermissions(ctx, "viewer-gate-reader", "viewer-gate-workspace"); permissions != nil || !errors.Is(err, ErrExecutionNotFound) {
		t.Fatalf("ungranted reader was authorized: permissions=%v err=%v", permissions, err)
	}
	if err := store.GrantWorkspaceExecutionViewer(ctx, "viewer-gate-stranger", "viewer-gate-workspace", "viewer-gate-reader"); !errors.Is(err, ErrExecutionNotFound) {
		t.Fatalf("non-owner granted viewer role: %v", err)
	}
	if err := store.GrantWorkspaceExecutionViewer(ctx, "viewer-gate-owner", "viewer-gate-workspace", "viewer-gate-reader"); err != nil {
		t.Fatalf("owner grant viewer role: %v", err)
	}
	viewerPermissions, err := store.ResolveWorkspaceExecutionPermissions(ctx, "viewer-gate-reader", "viewer-gate-workspace")
	if err != nil || len(viewerPermissions) != 1 || viewerPermissions[0] != workspaceReadPermissionID {
		t.Fatalf("viewer permission projection was not exact read-only: permissions=%v err=%v", viewerPermissions, err)
	}
	var role, grantedBy string
	if err := database.QueryRowContext(ctx, `SELECT role, granted_by FROM workspace_execution_role_grants WHERE workspace_id = $1 AND principal_id = $2`, "viewer-gate-workspace", "viewer-gate-reader").Scan(&role, &grantedBy); err != nil || role != workspaceExecutionViewerRole || grantedBy != "viewer-gate-owner" {
		t.Fatalf("durable viewer role drifted: role=%q grantedBy=%q err=%v", role, grantedBy, err)
	}
	if _, err := database.ExecContext(ctx, `INSERT INTO workspace_execution_role_grants (workspace_id, principal_id, role, granted_by) VALUES ($1,$2,'admin',$3)`, "viewer-gate-workspace", "viewer-gate-stranger", "viewer-gate-owner"); err == nil {
		t.Fatal("database accepted an unsupported collaborator execution role")
	}

	proxiedCreates := 0
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		var requestEnvelope remoteEnvelope
		if err := json.NewDecoder(request.Body).Decode(&requestEnvelope); err != nil {
			t.Fatalf("decode viewer control-plane request: %v", err)
		}
		if requestEnvelope.Operation == "create" {
			proxiedCreates++
			decoded, err := base64.RawURLEncoding.DecodeString(request.Header.Get(executionServerAuthorityHeader))
			if err != nil {
				t.Fatalf("decode viewer authority header: %v", err)
			}
			var authority executionServerAuthority
			if json.Unmarshal(decoded, &authority) != nil || authority.Principal.PrincipalID != "viewer-gate-reader" || (len(authority.Permissions) != 1 && len(authority.Permissions) != 2) || authority.Permissions[0] != workspaceReadPermissionID || (len(authority.Permissions) == 2 && authority.Permissions[1] != workspaceWritePermissionID) {
				t.Fatalf("PostgreSQL-resolved collaborator authority drifted: %s", decoded)
			}
			executionID := "viewer-gate-execution"
			if len(authority.Permissions) == 2 {
				executionID = "editor-gate-execution"
			}
			response.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"message-1","operation":"create","ok":true,"payload":{"execution":{"executionId":"`+executionID+`","provider":{"id":"prodivix.remote.preview"}}}}`)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"message-1","operation":"get","ok":true,"payload":{"execution":{"executionId":"viewer-gate-execution"}}}`)
	}))
	defer controlPlane.Close()
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{})
	workspace := workspaceAuthorityFixture()
	workspace["workspaceId"] = "viewer-gate-workspace"
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{"request": map[string]any{"workspace": workspace}})))
	response := httptest.NewRecorder()
	testRouterSession(handler, "viewer-gate-reader", "viewer-gate-session").ServeHTTP(response, request)
	if response.Code != http.StatusOK || proxiedCreates != 1 {
		t.Fatalf("viewer create did not complete through exact authority: status=%d creates=%d body=%s", response.Code, proxiedCreates, response.Body.String())
	}
	var durablePermissions []byte
	if err := database.QueryRowContext(ctx, `SELECT permissions_json FROM remote_execution_grants WHERE execution_id = $1`, "viewer-gate-execution").Scan(&durablePermissions); err != nil || string(durablePermissions) != `["workspace.read"]` {
		t.Fatalf("durable viewer permissions drifted: permissions=%s err=%v", durablePermissions, err)
	}

	if err := store.GrantWorkspaceExecutionRoleByEmail(ctx, "viewer-gate-owner", "viewer-gate-workspace", "VIEWER-GATE-READER@EXAMPLE.TEST", workspaceExecutionEditorRole); err != nil {
		t.Fatalf("owner upgrade editor role: %v", err)
	}
	editorPermissions, err := store.ResolveWorkspaceExecutionPermissions(ctx, "viewer-gate-reader", "viewer-gate-workspace")
	if err != nil || len(editorPermissions) != 2 || editorPermissions[0] != workspaceReadPermissionID || editorPermissions[1] != workspaceWritePermissionID {
		t.Fatalf("editor permission projection was not exact read/write: permissions=%v err=%v", editorPermissions, err)
	}
	roles, err := store.ListWorkspaceExecutionRoles(ctx, "viewer-gate-owner", "viewer-gate-workspace")
	if err != nil || len(roles) != 1 || roles[0].PrincipalID != "viewer-gate-reader" || roles[0].Role != workspaceExecutionEditorRole {
		t.Fatalf("durable role list drifted: roles=%#v err=%v", roles, err)
	}
	request = httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{"request": map[string]any{"workspace": workspace}})))
	response = httptest.NewRecorder()
	testRouterSession(handler, "viewer-gate-reader", "editor-gate-session").ServeHTTP(response, request)
	if response.Code != http.StatusOK || proxiedCreates != 2 {
		t.Fatalf("editor create did not complete through exact authority: status=%d creates=%d body=%s", response.Code, proxiedCreates, response.Body.String())
	}
	if err := database.QueryRowContext(ctx, `SELECT permissions_json FROM remote_execution_grants WHERE execution_id = $1`, "editor-gate-execution").Scan(&durablePermissions); err != nil || string(durablePermissions) != `["workspace.read", "workspace.write"]` && string(durablePermissions) != `["workspace.read","workspace.write"]` {
		t.Fatalf("durable editor permissions drifted: permissions=%s err=%v", durablePermissions, err)
	}

	if err := store.RevokeWorkspaceExecutionViewer(ctx, "viewer-gate-owner", "viewer-gate-workspace", "viewer-gate-reader"); err != nil {
		t.Fatalf("owner revoke viewer role: %v", err)
	}
	if permissions, err := store.ResolveWorkspaceExecutionPermissions(ctx, "viewer-gate-reader", "viewer-gate-workspace"); permissions != nil || !errors.Is(err, ErrExecutionNotFound) {
		t.Fatalf("revoked viewer retained new-execution authority: permissions=%v err=%v", permissions, err)
	}
	request = httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{"request": map[string]any{"workspace": workspace}})))
	response = httptest.NewRecorder()
	testRouterSession(handler, "viewer-gate-reader", "viewer-gate-session").ServeHTTP(response, request)
	if response.Code != http.StatusNotFound || proxiedCreates != 2 {
		t.Fatalf("revoked viewer reached a new Control Plane create: status=%d creates=%d", response.Code, proxiedCreates)
	}
}
