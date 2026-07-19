package remoteexecution

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
)

type fakeWorkspaceExecutionRoleStore struct {
	*fakeGrantStore
	roles          []WorkspaceExecutionRoleGrant
	err            error
	ownerID        string
	workspaceID    string
	principalEmail string
	principalID    string
	role           string
}

func (store *fakeWorkspaceExecutionRoleStore) ListWorkspaceExecutionRoles(_ context.Context, ownerID string, workspaceID string) ([]WorkspaceExecutionRoleGrant, error) {
	store.ownerID = ownerID
	store.workspaceID = workspaceID
	return store.roles, store.err
}

func (store *fakeWorkspaceExecutionRoleStore) GrantWorkspaceExecutionRoleByEmail(_ context.Context, ownerID string, workspaceID string, principalEmail string, role string) error {
	store.ownerID = ownerID
	store.workspaceID = workspaceID
	store.principalEmail = principalEmail
	store.role = role
	return store.err
}

func (store *fakeWorkspaceExecutionRoleStore) RevokeWorkspaceExecutionRole(_ context.Context, ownerID string, workspaceID string, principalID string) error {
	store.ownerID = ownerID
	store.workspaceID = workspaceID
	store.principalID = principalID
	return store.err
}

func newWorkspaceExecutionRoleHandler(store ExecutionGatewayStore) *Handler {
	return NewHandler(store, backendconfig.RemoteRunnerConfig{}, backendconfig.RemotePreviewHostConfig{})
}

func TestWorkspaceExecutionRoleHTTPJourneyIsOwnerBoundAndStrict(t *testing.T) {
	store := &fakeWorkspaceExecutionRoleStore{
		fakeGrantStore: &fakeGrantStore{},
		roles: []WorkspaceExecutionRoleGrant{{
			PrincipalID: "editor-1", PrincipalEmail: "editor@example.test", PrincipalName: "Editor", Role: workspaceExecutionEditorRole, GrantedAt: time.Unix(1_700_000_000, 0).UTC(),
		}},
	}
	handler := newWorkspaceExecutionRoleHandler(store)
	router := testRouter(handler, "owner-1")

	put := httptest.NewRequest(http.MethodPut, "/api/workspaces/workspace-1/execution-roles", strings.NewReader(`{"principalEmail":" Editor@Example.Test ","role":"editor"}`))
	put.Header.Set("Content-Type", "application/json")
	putResponse := httptest.NewRecorder()
	router.ServeHTTP(putResponse, put)
	if putResponse.Code != http.StatusNoContent || store.ownerID != "owner-1" || store.workspaceID != "workspace-1" || store.principalEmail != "editor@example.test" || store.role != workspaceExecutionEditorRole {
		t.Fatalf("role grant drifted: status=%d store=%#v body=%s", putResponse.Code, store, putResponse.Body.String())
	}

	get := httptest.NewRequest(http.MethodGet, "/api/workspaces/workspace-1/execution-roles", nil)
	getResponse := httptest.NewRecorder()
	router.ServeHTTP(getResponse, get)
	if getResponse.Code != http.StatusOK || getResponse.Header().Get("Cache-Control") != "private, no-store" || !strings.Contains(getResponse.Body.String(), `"role":"editor"`) || strings.Contains(getResponse.Body.String(), "workspace.write") {
		t.Fatalf("role list projection drifted: status=%d headers=%v body=%s", getResponse.Code, getResponse.Header(), getResponse.Body.String())
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/workspaces/workspace-1/execution-roles/editor-1", nil)
	deleteResponse := httptest.NewRecorder()
	router.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusNoContent || store.principalID != "editor-1" {
		t.Fatalf("role revoke drifted: status=%d store=%#v body=%s", deleteResponse.Code, store, deleteResponse.Body.String())
	}
}

func TestWorkspaceExecutionRoleHTTPFailsClosed(t *testing.T) {
	store := &fakeWorkspaceExecutionRoleStore{fakeGrantStore: &fakeGrantStore{}}
	router := testRouter(newWorkspaceExecutionRoleHandler(store), "owner-1")
	for _, fixture := range []struct {
		name string
		body string
	}{
		{name: "unknown field", body: `{"principalEmail":"reader@example.test","role":"viewer","permissions":["workspace.owner"]}`},
		{name: "admin role", body: `{"principalEmail":"reader@example.test","role":"admin"}`},
		{name: "invalid email", body: `{"principalEmail":"principal-id","role":"viewer"}`},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPut, "/api/workspaces/workspace-1/execution-roles", strings.NewReader(fixture.body))
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest || store.principalEmail != "" {
				t.Fatalf("invalid role request escaped: status=%d store=%#v body=%s", response.Code, store, response.Body.String())
			}
		})
	}

	store.err = ErrExecutionNotFound
	request := httptest.NewRequest(http.MethodGet, "/api/workspaces/workspace-1/execution-roles", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("unowned Workspace was not concealed: status=%d body=%s", response.Code, response.Body.String())
	}

	store.err = errors.New("database unavailable")
	request = httptest.NewRequest(http.MethodGet, "/api/workspaces/workspace-1/execution-roles", nil)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("role store failure did not fail closed: status=%d body=%s", response.Code, response.Body.String())
	}
}
