package remoteexecution

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
	"github.com/gin-gonic/gin"
)

type fakeGrantStore struct {
	workspaceOwner map[string]string
	executionOwner map[string]string
	recordError    error
	lastAuthority  ExecutionAuthority
}

type fakeEnvironmentVerifier struct {
	available   bool
	err         error
	principal   backendenvironment.PrincipalSession
	workspaceID string
	reference   EnvironmentReference
}

func (verifier *fakeEnvironmentVerifier) Available() bool { return verifier.available }

func (verifier *fakeEnvironmentVerifier) VerifySnapshotAccess(_ context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string, mode string) error {
	verifier.principal = principal
	verifier.workspaceID = workspaceID
	verifier.reference = EnvironmentReference{EnvironmentID: environmentID, Revision: revision, Mode: mode}
	return verifier.err
}

func (store *fakeGrantStore) VerifyWorkspaceOwner(_ context.Context, ownerID string, workspaceID string) error {
	if store.workspaceOwner[workspaceID] != ownerID {
		return ErrExecutionNotFound
	}
	return nil
}

func (store *fakeGrantStore) RecordExecution(_ context.Context, authority ExecutionAuthority) error {
	if store.recordError != nil {
		return store.recordError
	}
	if existing := store.executionOwner[authority.ExecutionID]; existing != "" && existing != authority.OwnerID {
		return errors.New("execution owner conflict")
	}
	store.executionOwner[authority.ExecutionID] = authority.OwnerID
	store.lastAuthority = authority
	return nil
}

func (store *fakeGrantStore) GetExecutionAuthority(_ context.Context, ownerID string, sessionID string, executionID string) (*ExecutionAuthority, error) {
	if err := store.VerifyExecutionOwner(context.Background(), ownerID, sessionID, executionID); err != nil {
		return nil, err
	}
	authority := store.lastAuthority
	return &authority, nil
}

func (store *fakeGrantStore) GetDataSourceDocument(_ context.Context, _ ExecutionAuthority, _ string) ([]byte, error) {
	return nil, ErrExecutionNotFound
}

func workspaceAuthorityFixture() map[string]any {
	return map[string]any{
		"workspaceId": "workspace-1",
		"snapshotId":  "snapshot-1",
		"partitionRevisions": map[string]string{
			"workspace":               "1",
			"document:data-1:content": "1",
		},
	}
}

func TestGatewayCancelsExecutionWhenDurableGrantCannotBeRecorded(t *testing.T) {
	operations := make([]string, 0, 2)
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		var requestEnvelope remoteEnvelope
		_ = json.NewDecoder(request.Body).Decode(&requestEnvelope)
		operations = append(operations, requestEnvelope.Operation)
		response.Header().Set("Content-Type", "application/json")
		if requestEnvelope.Operation == "create" {
			_, _ = io.WriteString(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"message-1","operation":"create","ok":true,"payload":{"execution":{"executionId":"execution-1"}}}`)
			return
		}
		_, _ = io.WriteString(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"message-1:grant-compensation","operation":"cancel","ok":true,"payload":{"result":{"status":"accepted"}}}`)
	}))
	defer controlPlane.Close()
	store := &fakeGrantStore{
		workspaceOwner: map[string]string{"workspace-1": "user-1"},
		executionOwner: map[string]string{},
		recordError:    errors.New("database unavailable"),
	}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{})
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{
		"request": map[string]any{"workspace": workspaceAuthorityFixture()},
	})))
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", response.Code)
	}
	if len(operations) != 2 || operations[0] != "create" || operations[1] != "cancel" {
		t.Fatalf("expected create compensation, got %v", operations)
	}
}

func (store *fakeGrantStore) VerifyExecutionOwner(_ context.Context, ownerID string, sessionID string, executionID string) error {
	if store.executionOwner[executionID] != ownerID {
		return ErrExecutionNotFound
	}
	if store.lastAuthority.ExecutionID == executionID && store.lastAuthority.Environment != nil && store.lastAuthority.SessionID != sessionID {
		return ErrExecutionNotFound
	}
	return nil
}

func testRouter(handler *Handler, userID string) *gin.Engine {
	return testRouterSession(handler, userID, "session-1")
}

func testRouterSession(handler *Handler, userID string, sessionID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	authenticate := func(c *gin.Context) {
		c.Set("authUser", &backendauth.User{ID: userID})
		c.Set("authSession", &backendauth.AuthenticatedSession{ID: sessionID, UserID: userID, ExpiresAt: time.Now().Add(time.Hour).UnixMilli()})
		c.Next()
	}
	api := router.Group("/api")
	RegisterRoutes(api, handler.Routes(authenticate))
	return router
}

func TestGatewayPreflightsAndDurablyBindsExactEnvironmentSession(t *testing.T) {
	store := &fakeGrantStore{workspaceOwner: map[string]string{"workspace-1": "user-1"}, executionOwner: map[string]string{}}
	verifier := &fakeEnvironmentVerifier{available: true}
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"message-1","operation":"create","ok":true,"payload":{"execution":{"executionId":"execution-env-1"}}}`)
	}))
	defer controlPlane.Close()
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{}, verifier)
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{
		"request": map[string]any{
			"workspace":   workspaceAuthorityFixture(),
			"environment": map[string]any{"environmentId": "environment-1", "revision": "revision-7", "mode": "live"},
		},
	})))
	response := httptest.NewRecorder()
	testRouterSession(handler, "user-1", "session-env-1").ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if verifier.principal != (backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-env-1"}) || verifier.workspaceID != "workspace-1" {
		t.Fatalf("environment preflight identity drifted: %#v", verifier)
	}
	if store.lastAuthority.SessionID != "session-env-1" || store.lastAuthority.SnapshotID != "snapshot-1" || store.lastAuthority.PartitionRevisions["document:data-1:content"] != "1" || store.lastAuthority.Environment == nil || *store.lastAuthority.Environment != (EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"}) {
		t.Fatalf("durable environment authority drifted: %#v", store.lastAuthority)
	}
}

func TestGatewayRejectsStaleEnvironmentBeforeControlPlaneAndCrossSessionReplay(t *testing.T) {
	proxied := false
	controlPlane := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { proxied = true }))
	defer controlPlane.Close()
	store := &fakeGrantStore{workspaceOwner: map[string]string{"workspace-1": "user-1"}, executionOwner: map[string]string{}}
	verifier := &fakeEnvironmentVerifier{available: true, err: backendenvironment.ErrPermissionDenied}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{}, verifier)
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{
		"request": map[string]any{"workspace": workspaceAuthorityFixture(), "environment": map[string]any{"environmentId": "environment-1", "revision": "stale", "mode": "live"}},
	})))
	response := httptest.NewRecorder()
	testRouterSession(handler, "user-1", "session-1").ServeHTTP(response, request)
	if response.Code != http.StatusNotFound || proxied {
		t.Fatalf("stale environment reached Control Plane: status=%d proxied=%v", response.Code, proxied)
	}

	store.executionOwner["execution-env-1"] = "user-1"
	store.lastAuthority = ExecutionAuthority{ExecutionID: "execution-env-1", OwnerID: "user-1", SessionID: "session-1", Environment: &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"}}
	get := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("get", map[string]any{"executionId": "execution-env-1"})))
	getResponse := httptest.NewRecorder()
	testRouterSession(handler, "user-1", "session-2").ServeHTTP(getResponse, get)
	if getResponse.Code != http.StatusNotFound || proxied {
		t.Fatalf("cross-session replay reached Control Plane: status=%d proxied=%v", getResponse.Code, proxied)
	}
}

func TestGatewayRejectsEnvironmentMaterialEscapeHatchBeforePreflight(t *testing.T) {
	proxied := false
	controlPlane := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { proxied = true }))
	defer controlPlane.Close()
	store := &fakeGrantStore{workspaceOwner: map[string]string{"workspace-1": "user-1"}, executionOwner: map[string]string{}}
	verifier := &fakeEnvironmentVerifier{available: true}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{}, verifier)
	canary := "prodivix-secret-canary"
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{
		"request": map[string]any{"workspace": workspaceAuthorityFixture(), "environment": map[string]any{"environmentId": "environment-1", "revision": "revision-7", "mode": "live", "value": canary}},
	})))
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || proxied || verifier.reference.EnvironmentID != "" {
		t.Fatalf("environment material escape hatch was accepted: status=%d proxied=%v verifier=%#v", response.Code, proxied, verifier)
	}
	if strings.Contains(response.Body.String(), canary) {
		t.Fatalf("Secret canary leaked to rejection response: %s", response.Body.String())
	}
}

func TestGatewayDoesNotCancelExistingExecutionOnAuthorityConflict(t *testing.T) {
	operations := make([]string, 0, 2)
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		var requestEnvelope remoteEnvelope
		_ = json.NewDecoder(request.Body).Decode(&requestEnvelope)
		operations = append(operations, requestEnvelope.Operation)
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"message-1","operation":"create","ok":true,"payload":{"execution":{"executionId":"execution-1"}}}`)
	}))
	defer controlPlane.Close()
	store := &fakeGrantStore{workspaceOwner: map[string]string{"workspace-1": "user-1"}, executionOwner: map[string]string{}, recordError: ErrExecutionAuthorityConflict}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{})
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{"request": map[string]any{"workspace": workspaceAuthorityFixture()}})))
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusConflict || len(operations) != 1 || operations[0] != "create" {
		t.Fatalf("authority conflict cancelled an existing execution: status=%d operations=%v", response.Code, operations)
	}
}

func envelope(operation string, payload any) []byte {
	contents, _ := json.Marshal(map[string]any{
		"protocol":  "prodivix.remote-execution",
		"version":   1,
		"messageId": "message-1",
		"operation": operation,
		"payload":   payload,
	})
	return contents
}

func TestGatewayRecordsCreateGrantAndKeepsServiceTokenServerSide(t *testing.T) {
	store := &fakeGrantStore{
		workspaceOwner: map[string]string{"workspace-1": "user-1"},
		executionOwner: map[string]string{},
	}
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer service-token" {
			t.Fatalf("control plane did not receive the service credential")
		}
		rawAuthority := request.Header.Get(executionServerAuthorityHeader)
		decodedAuthority, err := base64.RawURLEncoding.DecodeString(rawAuthority)
		if err != nil {
			t.Fatalf("execution authority header is not canonical base64url: %v", err)
		}
		var authority executionServerAuthority
		if json.Unmarshal(decodedAuthority, &authority) != nil || authority.Format != executionServerAuthorityFormat || authority.Principal.ProviderID != productSessionProviderID || authority.Principal.PrincipalID != "user-1" || len(authority.Permissions) != 1 || authority.Permissions[0] != workspaceOwnerPermissionID || authority.WorkspaceID != "workspace-1" || authority.SnapshotID != "snapshot-1" || authority.ExpiresAt != 1_120_000 {
			t.Fatalf("execution authority projection drifted: %s", decodedAuthority)
		}
		for _, forbidden := range []string{"session-1", "user-session-token", "service-token"} {
			if bytes.Contains(decodedAuthority, []byte(forbidden)) {
				t.Fatalf("server-only credential escaped into authority projection: %q", forbidden)
			}
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"message-1","operation":"create","ok":true,"payload":{"execution":{"executionId":"execution-1"}}}`)
	}))
	defer controlPlane.Close()
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{})
	handler.now = func() time.Time { return time.UnixMilli(1_000_000).UTC() }
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("create", map[string]any{
		"request": map[string]any{"workspace": workspaceAuthorityFixture()},
	})))
	request.Header.Set("Authorization", "Bearer user-session-token")
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if store.executionOwner["execution-1"] != "user-1" {
		t.Fatalf("execution grant was not recorded")
	}
	if strings.Contains(response.Body.String(), "service-token") {
		t.Fatalf("service credential leaked to the client")
	}
}

func TestGatewayDeniesCrossOwnerExecutionBeforeProxy(t *testing.T) {
	proxied := false
	controlPlane := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { proxied = true }))
	defer controlPlane.Close()
	store := &fakeGrantStore{workspaceOwner: map[string]string{}, executionOwner: map[string]string{"execution-1": "user-1"}}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{})
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(envelope("get", map[string]any{"executionId": "execution-1"})))
	response := httptest.NewRecorder()
	testRouter(handler, "user-2").ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected owner-isolated 404, got %d", response.Code)
	}
	if proxied {
		t.Fatalf("cross-owner request reached the control plane")
	}
}

func TestGatewayProxiesAuthorizedArtifactWithSafeHeaders(t *testing.T) {
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "application/octet-stream")
		response.Header().Set("ETag", `"sha256-test"`)
		_, _ = response.Write([]byte{1, 2, 3})
	}))
	defer controlPlane.Close()
	store := &fakeGrantStore{workspaceOwner: map[string]string{}, executionOwner: map[string]string{"execution-1": "user-1"}}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second}, backendconfig.RemotePreviewHostConfig{})
	request := httptest.NewRequest(http.MethodGet, "/api/remote-executions/execution-1/artifacts/preview-1/content", nil)
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), []byte{1, 2, 3}) {
		t.Fatalf("artifact proxy failed: %d %v", response.Code, response.Body.Bytes())
	}
	if response.Header().Get("Cache-Control") != "private, no-store" || response.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("artifact proxy did not set safe response headers")
	}
}

func writePreviewArtifactResolve(response http.ResponseWriter, artifact []byte, digest string) {
	response.Header().Set("Content-Type", "application/json")
	_, _ = fmt.Fprintf(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"resolve","operation":"artifact.resolve","ok":true,"payload":{"executionId":"execution-1","providerId":"prodivix.remote.preview","artifact":{"artifactId":"preview-1","kind":"bundle","mediaType":"%s","size":%d,"digest":"%s","expiresAt":%d,"authorizationScope":"execution:execution-1","metadata":{"snapshotDigest":"sha256-%s","readiness":"ready","health":"healthy","entryFilePath":"index.html"}}}}`, executionPreviewBundleMediaType, len(artifact), digest, time.Now().Add(time.Minute).UnixMilli(), strings.Repeat("a", 64))
}

func TestGatewayCreatesIsolatedPreviewSessionFromAuthorizedArtifact(t *testing.T) {
	artifact := []byte(`{"format":"prodivix.execution-preview-bundle.v1"}`)
	digest := fmt.Sprintf("sha256-%x", sha256.Sum256(artifact))
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer service-token" {
			t.Fatalf("control plane credential is missing")
		}
		if request.Method == http.MethodPost {
			writePreviewArtifactResolve(response, artifact, digest)
			return
		}
		response.Header().Set("Content-Type", executionPreviewBundleMediaType)
		response.Header().Set("ETag", `"`+digest+`"`)
		_, _ = response.Write(artifact)
	}))
	defer controlPlane.Close()
	previewHost := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		if request.URL.Path != "/internal/preview-sessions" || request.Header.Get("Authorization") != "Bearer preview-token" {
			t.Fatalf("preview host authority is invalid")
		}
		if request.Header.Get("X-Prodivix-Artifact-Digest") != digest || request.Header.Get("X-Prodivix-Snapshot-Digest") != "sha256-"+strings.Repeat("a", 64) || !bytes.Equal(body, artifact) {
			t.Fatalf("preview host did not receive the digest-pinned artifact")
		}
		response.WriteHeader(http.StatusCreated)
		_, _ = fmt.Fprintf(response, `{"previewUrl":"https://%s.preview.example.test/","expiresAt":%d}`, strings.Repeat("a", 64), time.Now().Add(time.Minute).UnixMilli())
	}))
	defer previewHost.Close()
	store := &fakeGrantStore{workspaceOwner: map[string]string{}, executionOwner: map[string]string{"execution-1": "user-1"}}
	handler := NewHandler(
		store,
		backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second},
		backendconfig.RemotePreviewHostConfig{BaseURL: previewHost.URL, PublicBaseURL: "https://preview.example.test", Token: "preview-token", Timeout: time.Second, TTL: time.Minute},
	)
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/artifacts/preview-1/preview-sessions", nil)
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), ".preview.example.test/") {
		t.Fatalf("preview session creation failed: %d %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "preview-token") || strings.Contains(response.Body.String(), "service-token") {
		t.Fatalf("service credential leaked to the client")
	}
	if response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("preview grant response must not be cached")
	}
}

func TestGatewayRejectsPreviewArtifactDigestDriftBeforePreviewHost(t *testing.T) {
	previewHostCalled := false
	artifact := []byte("drifted")
	descriptorDigest := fmt.Sprintf("sha256-%x", sha256.Sum256(artifact))
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodPost {
			writePreviewArtifactResolve(response, artifact, descriptorDigest)
			return
		}
		response.Header().Set("Content-Type", executionPreviewBundleMediaType)
		response.Header().Set("ETag", `"sha256-`+strings.Repeat("0", 64)+`"`)
		_, _ = response.Write(artifact)
	}))
	defer controlPlane.Close()
	previewHost := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		previewHostCalled = true
	}))
	defer previewHost.Close()
	store := &fakeGrantStore{workspaceOwner: map[string]string{}, executionOwner: map[string]string{"execution-1": "user-1"}}
	handler := NewHandler(
		store,
		backendconfig.RemoteRunnerConfig{BaseURL: controlPlane.URL, ClientToken: "service-token", Timeout: time.Second},
		backendconfig.RemotePreviewHostConfig{BaseURL: previewHost.URL, PublicBaseURL: "https://preview.example.test", Token: "preview-token", Timeout: time.Second, TTL: time.Minute},
	)
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/artifacts/preview-1/preview-sessions", nil)
	response := httptest.NewRecorder()
	testRouter(handler, "user-1").ServeHTTP(response, request)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected digest drift rejection, got %d", response.Code)
	}
	if previewHostCalled {
		t.Fatalf("digest-drifted artifact reached Preview Host")
	}
}
