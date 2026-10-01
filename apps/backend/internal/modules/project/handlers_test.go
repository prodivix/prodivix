package project

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendtext "github.com/Prodivix/prodivix/apps/backend/internal/platform/text"
	"github.com/gin-gonic/gin"
)

type stubWorkspaceBootstrapper struct {
	publishErr error
	onPublish  func(*PublicationExpected)
}

func (stub stubWorkspaceBootstrapper) CreateProjectWorkspace(context.Context, string, string, string, ResourceType, json.RawMessage) (*Project, error) {
	return nil, ErrProjectNotFound
}

func (stub stubWorkspaceBootstrapper) PublishProjectWorkspace(_ context.Context, _ string, _ string, expected *PublicationExpected) (*Project, error) {
	if stub.onPublish != nil {
		stub.onPublish(expected)
	}
	return nil, stub.publishErr
}

func TestPublicationRevisionRequestIsExactAndFailClosed(t *testing.T) {
	valid := `{"expected":{"workspaceRev":1,"routeRev":2,"opSeq":3,"documents":[{"documentId":"page","contentRev":4,"metaRev":5}]}}`
	for _, body := range []string{
		`{}`, `null`, `{"expected":null}`, `{"expected":{"workspaceRev":1,"routeRev":1,"opSeq":1}}`,
		strings.Replace(valid, `"contentRev":4`, `"contentRev":0`, 1),
		strings.Replace(valid, `"metaRev":5`, `"metaRev":9007199254740992`, 1),
		strings.Replace(valid, `"documentId":"page"`, `"documentId":" page"`, 1),
		strings.Replace(valid, `"documents":[`, `"pir":{},"documents":[`, 1),
		strings.Replace(valid, `"documents":[`, `"documents":[{"documentId":"page","contentRev":4,"metaRev":5},`, 1),
		valid + `{}`, `{"padding":"` + strings.Repeat("a", int(maxProjectCreateRequestBytes)) + `"}`,
	} {
		t.Run(body[:min(64, len(body))], func(t *testing.T) {
			called := false
			router := newAuthenticatedProjectRouter(t, stubWorkspaceBootstrapper{onPublish: func(*PublicationExpected) { called = true }})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/projects/project-1/publish", strings.NewReader(body)))
			if response.Code != http.StatusBadRequest || called {
				t.Fatalf("invalid publication reached owner: status=%d called=%v", response.Code, called)
			}
		})
	}
	var actual *PublicationExpected
	router := newAuthenticatedProjectRouter(t, stubWorkspaceBootstrapper{publishErr: ErrPublicationRevisionConflict, onPublish: func(expected *PublicationExpected) { actual = expected }})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/projects/project-1/publish", strings.NewReader(valid)))
	if response.Code != http.StatusConflict || actual == nil || actual.Documents[0].ContentRev != 4 {
		t.Fatalf("exact revisions must reach owner with deterministic conflict: status=%d expected=%#v", response.Code, actual)
	}
	if !strings.Contains(response.Body.String(), `"code":"WKS-4003"`) {
		t.Fatalf("missing actionable revision conflict: %s", response.Body.String())
	}
	actual = &PublicationExpected{}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/projects/project-1/publish", nil))
	if actual != nil || response.Code != http.StatusConflict {
		t.Fatal("empty request must explicitly request latest confirmed publication")
	}
}

func newAuthenticatedProjectRouter(t *testing.T, module WorkspaceBootstrapper) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	requireAuth := backendauth.RequireAuth(
		func(*gin.Context) string { return "token" },
		func(string) (*backendauth.AuthenticatedSession, bool) {
			return &backendauth.AuthenticatedSession{ID: "session-1", UserID: "owner-1"}, true
		},
		func(string) (*backendauth.User, bool) { return &backendauth.User{ID: "owner-1"}, true },
		func(c *gin.Context) { c.AbortWithStatus(http.StatusUnauthorized) },
	)
	RegisterRoutes(router.Group("/api"), NewHandler(nil, module).Routes(requireAuth))
	return router
}

func TestProjectWriteEndpointsRejectOversizedBodies(t *testing.T) {
	router := newAuthenticatedProjectRouter(t, stubWorkspaceBootstrapper{})

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{
			name:   "create",
			method: http.MethodPost,
			path:   "/api/projects",
			body:   `{"name":"x","pir":{"padding":"` + strings.Repeat("a", int(maxProjectCreateRequestBytes)) + `"}}`,
		},
		{
			name:   "update",
			method: http.MethodPatch,
			path:   "/api/projects/project-1",
			body:   `{"name":"` + strings.Repeat("a", int(maxProjectMetadataRequestBytes)) + `"}`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(test.method, test.path, strings.NewReader(test.body)))
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected an oversized body to be rejected before decoding, got %d", response.Code)
			}
		})
	}
}

func TestProjectWriteEndpointsRejectUnboundedDisplayText(t *testing.T) {
	router := newAuthenticatedProjectRouter(t, stubWorkspaceBootstrapper{})
	overlongName := strings.Repeat("n", backendtext.MaxDisplayNameRunes+1)

	for _, test := range []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "create", method: http.MethodPost, path: "/api/projects", body: `{"name":"` + overlongName + `"}`},
		{name: "update", method: http.MethodPatch, path: "/api/projects/project-1", body: `{"name":"` + overlongName + `"}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(test.method, test.path, strings.NewReader(test.body)))
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected an unbounded display name to be rejected, got %d", response.Code)
			}
		})
	}
}

func TestPublishReportsUnpublishableWorkspacesAsClientError(t *testing.T) {
	router := newAuthenticatedProjectRouter(t, stubWorkspaceBootstrapper{publishErr: ErrProjectNotPublishable})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/projects/project-1/publish", nil))

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected a deterministic 422 for an unpublishable workspace, got %d", response.Code)
	}
	var payload struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode publish error payload: %v", err)
	}
	if payload.Error.Code != "API-4001" {
		t.Fatalf("expected the business validation code, got %q", payload.Error.Code)
	}
}
