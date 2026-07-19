package remoteexecution

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

const (
	catalogGoldenOwnerID        = "catalog-golden-owner"
	catalogGoldenWorkspaceID    = "golden-g2-vue-catalog"
	catalogGoldenExecutionID    = "catalog-golden-execution"
	catalogGoldenSessionID      = "catalog-golden-session"
	catalogGoldenEnvironmentID  = "catalog-golden-environment"
	catalogGoldenEnvironmentRev = "catalog-golden-environment-revision"
	catalogGoldenDataID         = "data-catalog"
	catalogGoldenCodeID         = "code-catalog-server"
	catalogGoldenSourceCanary   = "vue-catalog-server-source-must-never-enter-client-output"
	catalogGoldenTokenCanary    = "catalog-product-access-token-must-not-leak"
)

type catalogGoldenEnvironment struct{}

func (*catalogGoldenEnvironment) Available() bool { return true }

func (*catalogGoldenEnvironment) VerifySnapshotAccess(_ context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string, mode string) error {
	if principal.PrincipalID != catalogGoldenOwnerID || principal.SessionID != catalogGoldenSessionID || workspaceID != catalogGoldenWorkspaceID || environmentID != catalogGoldenEnvironmentID || revision != catalogGoldenEnvironmentRev || mode != "live" {
		return backendenvironment.ErrPermissionDenied
	}
	return nil
}

func (*catalogGoldenEnvironment) GetSnapshot(_ context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string) (*backendenvironment.Snapshot, error) {
	if principal.PrincipalID != catalogGoldenOwnerID || principal.SessionID != catalogGoldenSessionID || workspaceID != catalogGoldenWorkspaceID || environmentID != catalogGoldenEnvironmentID || revision != catalogGoldenEnvironmentRev {
		return nil, backendenvironment.ErrPermissionDenied
	}
	return &backendenvironment.Snapshot{
		EnvironmentID:  environmentID,
		WorkspaceID:    workspaceID,
		Revision:       revision,
		Mode:           "live",
		PublicBindings: map[string]any{},
	}, nil
}

func (*catalogGoldenEnvironment) IssueGrant(context.Context, backendenvironment.IssueGrantInput) (*backendenvironment.Grant, error) {
	return nil, backendenvironment.ErrPermissionDenied
}

func (*catalogGoldenEnvironment) UseSecret(context.Context, backendenvironment.UseSecretInput, func([]byte) error) error {
	return backendenvironment.ErrPermissionDenied
}

func (*catalogGoldenEnvironment) RevokeGrant(context.Context, string, backendenvironment.PrincipalSession) error {
	return nil
}

type catalogGoldenTransportCall struct {
	method string
	path   string
	body   string
	status int
	result string
}

type catalogGoldenTransport struct {
	mu    sync.Mutex
	calls []DataGatewayTransportRequest
	plan  []catalogGoldenTransportCall
}

func newCatalogGoldenTransport() *catalogGoldenTransport {
	return &catalogGoldenTransport{plan: []catalogGoldenTransportCall{
		{method: http.MethodGet, path: "/products", status: http.StatusOK, result: `[{"id":"p1","name":"Alpha"}]`},
		{method: http.MethodPost, path: "/products", body: `{"id":"p2","name":"Beta"}`, status: http.StatusCreated, result: `{"id":"p2","name":"Beta"}`},
		{method: http.MethodGet, path: "/products/p2", status: http.StatusOK, result: `{"id":"p2","name":"Beta"}`},
		{method: http.MethodPut, path: "/products/p2", body: `{"name":"Beta Updated"}`, status: http.StatusOK, result: `{"id":"p2","name":"Beta Updated"}`},
		{method: http.MethodDelete, path: "/products/p2", status: http.StatusOK, result: `{"id":"p2","name":"Beta Updated"}`},
	}}
}

func (transport *catalogGoldenTransport) Execute(_ context.Context, request DataGatewayTransportRequest) (*DataGatewayTransportResponse, error) {
	transport.mu.Lock()
	defer transport.mu.Unlock()
	index := len(transport.calls)
	if index >= len(transport.plan) {
		return nil, fmt.Errorf("unexpected Catalog upstream call %s %s", request.Method, request.URL)
	}
	expected := transport.plan[index]
	parsed, err := url.Parse(request.URL)
	if err != nil || request.Method != expected.method || parsed.Scheme != "https" || parsed.Host != "catalog.example.test" || parsed.Path != expected.path || parsed.RawQuery != "" || string(request.Body) != expected.body {
		return nil, fmt.Errorf("Catalog upstream call drifted: request=%s %s body=%s expected=%s %s body=%s", request.Method, request.URL, request.Body, expected.method, expected.path, expected.body)
	}
	if request.Method != http.MethodGet {
		key := request.Headers["idempotency-key"]
		if !strings.HasPrefix(key, "prodivix-data-sha256-") || strings.Contains(key, "catalog-") {
			return nil, errors.New("Catalog mutation idempotency key was absent or exposed invocation identity")
		}
	}
	copyRequest := request
	copyRequest.Headers = make(map[string]string, len(request.Headers))
	for name, value := range request.Headers {
		copyRequest.Headers[name] = value
	}
	transport.calls = append(transport.calls, copyRequest)
	return &DataGatewayTransportResponse{Status: expected.status, Body: []byte(expected.result)}, nil
}

func catalogGoldenDataDocument() []byte {
	return []byte(`{
  "wireVersion": 1,
  "source": {
    "id": "catalog",
    "adapterId": "core.http",
    "runtimeZone": "server",
    "bindingsById": {},
    "configurationByKey": {
      "baseUrl": {"kind":"literal","value":"https://catalog.example.test/"}
    }
  },
  "schemasById": {
    "product": {"id":"product","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}},
    "products": {"id":"products","schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"array"}}
  },
  "operationsById": {
    "list-products": {
      "id":"list-products","kind":"query","outputSchemaId":"products",
      "configurationByKey":{"method":{"kind":"literal","value":"GET"},"path":{"kind":"literal","value":"/products"},"emptyWhen":{"kind":"literal","value":"never"}},
      "policies":{}
    },
    "create-product": {
      "id":"create-product","kind":"mutation","outputSchemaId":"product",
      "configurationByKey":{"method":{"kind":"literal","value":"POST"},"path":{"kind":"literal","value":"/products"},"bodyInputPath":{"kind":"literal","value":"/product"},"idempotencyHeader":{"kind":"literal","value":"idempotency-key"}},
      "policies":{"idempotency":{"kind":"invocation-key"}}
    },
    "get-product": {
      "id":"get-product","kind":"query","outputSchemaId":"product",
      "configurationByKey":{"method":{"kind":"literal","value":"GET"},"path":{"kind":"literal","value":"/products/{id}"},"parameterMappings":{"kind":"literal","value":{"path":{"id":"/id"}}},"emptyWhen":{"kind":"literal","value":"never"}},
      "policies":{}
    },
    "update-product": {
      "id":"update-product","kind":"mutation","outputSchemaId":"product",
      "configurationByKey":{"method":{"kind":"literal","value":"PUT"},"path":{"kind":"literal","value":"/products/{id}"},"parameterMappings":{"kind":"literal","value":{"path":{"id":"/id"}}},"bodyInputPath":{"kind":"literal","value":"/patch"},"idempotencyHeader":{"kind":"literal","value":"idempotency-key"}},
      "policies":{"idempotency":{"kind":"invocation-key"}}
    },
    "delete-product": {
      "id":"delete-product","kind":"mutation","outputSchemaId":"product",
      "configurationByKey":{"method":{"kind":"literal","value":"DELETE"},"path":{"kind":"literal","value":"/products/{id}"},"parameterMappings":{"kind":"literal","value":{"path":{"id":"/id"}}},"idempotencyHeader":{"kind":"literal","value":"idempotency-key"}},
      "policies":{"idempotency":{"kind":"invocation-key"}}
    }
  }
}`)
}

func catalogGoldenCodeDocument() []byte {
	return []byte(`{
  "language":"ts",
  "source":"const serverBoundary = '` + catalogGoldenSourceCanary + `'; void serverBoundary;",
  "metadata":{"prodivix.serverRuntime":{"schemaVersion":"1.0","functionsByExport":{
    "requireCatalogOwner":{
      "kind":"route-guard","runtimeZone":"server","adapterId":"core.auth.require-workspace-owner","effect":"read",
      "auth":{"kind":"permission","permissionId":"workspace.owner"},
      "inputSchema":{"type":"object","additionalProperties":false,"required":["routeId"],"properties":{"routeId":{"type":"string"}}},"outputSchema":true
    },
    "loadCatalogPrincipal":{
      "kind":"route-loader","runtimeZone":"server","adapterId":"core.auth.current-principal","effect":"read",
      "auth":{"kind":"authenticated"},
      "inputSchema":{"type":"object","additionalProperties":false,"required":["routeId"],"properties":{"routeId":{"type":"string"}}},"outputSchema":true
    },
    "mutateCatalog":{
      "kind":"route-action","runtimeZone":"server","adapterId":"core.server.execution-state.put","effect":"mutation",
      "auth":{"kind":"authenticated"},"inputSchema":true,"outputSchema":true,"idempotency":{"kind":"invocation-key"}
    }
  }}}
}`)
}

func seedAuthenticatedCatalogPostgreSQL(t *testing.T, database *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	now := time.Now().UTC()
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin authenticated Catalog fixture: %v", err)
	}
	defer func() { _ = tx.Rollback() }()
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)`, []any{catalogGoldenOwnerID, "catalog-golden@example.test", "Catalog Golden Owner", []byte("integration-only"), now}},
		{`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at) VALUES ($1,$2,'project',$3,$4,$4)`, []any{"catalog-golden-project", catalogGoldenOwnerID, "Authenticated Vue Catalog", now}},
		{`INSERT INTO workspaces (id, project_id, owner_id, name, workspace_rev, route_rev, op_seq, created_at, updated_at) VALUES ($1,$2,$3,$4,8,4,14,$5,$5)`, []any{catalogGoldenWorkspaceID, "catalog-golden-project", catalogGoldenOwnerID, "Authenticated Vue Catalog", now}},
		{`INSERT INTO workspace_documents (workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES ($1,$2,'data-source','Catalog Data','/catalog.data.json',5,1,$3::jsonb,'[]'::jsonb,$4)`, []any{catalogGoldenWorkspaceID, catalogGoldenDataID, string(catalogGoldenDataDocument()), now}},
		{`INSERT INTO workspace_documents (workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES ($1,$2,'code','catalog.server.ts','/catalog.server.ts',3,2,$3::jsonb,'[]'::jsonb,$4)`, []any{catalogGoldenWorkspaceID, catalogGoldenCodeID, string(catalogGoldenCodeDocument()), now}},
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("seed authenticated Catalog fixture: %v", err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit authenticated Catalog fixture: %v", err)
	}
}

func catalogGoldenDataInvocation(t *testing.T, router http.Handler, operationID string, invocationID string, sequence int64, input string) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(DataGatewayInvocation{InvocationID: invocationID, Sequence: sequence, Attempt: 1, Input: json.RawMessage(input)})
	if err != nil {
		t.Fatalf("marshal Catalog Data invocation: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions/"+catalogGoldenExecutionID+"/data-sources/"+catalogGoldenDataID+"/operations/"+operationID+"/invoke", bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+catalogGoldenTokenCanary)
	request.Header.Set("Cookie", "product_session="+catalogGoldenSessionID)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func catalogGoldenServerInvocation(t *testing.T, router http.Handler, exportName string, invocationID string, input json.RawMessage, mutation bool) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(ServerFunctionInvocation{
		Type: serverFunctionRequestType, RequestID: invocationID + ":1", InvocationID: invocationID, Attempt: 1,
		FunctionRef: serverFunctionReference{ArtifactID: catalogGoldenCodeID, ExportName: exportName}, Input: input,
	})
	if err != nil {
		t.Fatalf("marshal Catalog Server Function invocation: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions/"+catalogGoldenExecutionID+"/server-functions/"+catalogGoldenCodeID+"/"+exportName+"/invoke", bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+catalogGoldenTokenCanary)
	request.Header.Set("Cookie", "product_session="+catalogGoldenSessionID)
	if mutation {
		request.Header.Set("Origin", "https://studio.example.test")
		request.Header.Set(serverFunctionMutationIntentHeader, serverFunctionMutationIntent)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func assertCatalogGoldenResponseSafe(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	for _, forbidden := range []string{catalogGoldenTokenCanary, catalogGoldenSessionID, catalogGoldenSourceCanary} {
		if strings.Contains(response.Body.String(), forbidden) {
			t.Fatalf("authenticated Catalog response leaked %q: %s", forbidden, response.Body.String())
		}
	}
}

func TestAuthenticatedCatalogRemotePostgreSQLGolden(t *testing.T) {
	database := openDataGatewayReplayPostgreSQL(t)
	seedAuthenticatedCatalogPostgreSQL(t, database)
	store := NewStore(database)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	environment := &catalogGoldenEnvironment{}
	transport := newCatalogGoldenTransport()
	controlPlaneCreates := 0
	controlPlane := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		var requestEnvelope remoteEnvelope
		if request.Method != http.MethodPost || json.NewDecoder(request.Body).Decode(&requestEnvelope) != nil || requestEnvelope.Operation != "create" {
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		controlPlaneCreates++
		response.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(response, `{"protocol":"prodivix.remote-execution","version":1,"messageId":"catalog-control-plane-create","operation":"create","ok":true,"payload":{"execution":{"executionId":"`+catalogGoldenExecutionID+`","provider":{"id":"prodivix.remote.preview"}}}}`)
	}))
	defer controlPlane.Close()
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{
		BaseURL: controlPlane.URL, ClientToken: "catalog-control-plane-service-token", Timeout: time.Second,
		ServerFunctionAllowedOrigins: []string{"https://studio.example.test"},
	}, backendconfig.RemotePreviewHostConfig{}, environment)
	handler.dataGateway = NewDataGateway(store, environment, transport)
	router := testRouterSession(handler, catalogGoldenOwnerID, catalogGoldenSessionID)
	createBody := envelope("create", map[string]any{"request": map[string]any{
		"profile": "preview", "runtimeZone": "client",
		"workspace": map[string]any{
			"workspaceId": catalogGoldenWorkspaceID, "snapshotId": "snapshot-golden-g2-vue-catalog",
			"partitionRevisions": map[string]string{
				"workspace": "8", "document:" + catalogGoldenDataID + ":content": "5", "document:" + catalogGoldenCodeID + ":content": "3",
			},
		},
		"environment": map[string]any{"environmentId": catalogGoldenEnvironmentID, "revision": catalogGoldenEnvironmentRev, "mode": "live"},
	}})
	createRequest := httptest.NewRequest(http.MethodPost, "/api/remote-executions", bytes.NewReader(createBody))
	createResponse := httptest.NewRecorder()
	router.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusOK || controlPlaneCreates != 1 || !strings.Contains(createResponse.Body.String(), catalogGoldenExecutionID) {
		t.Fatalf("authenticated Catalog Remote execution create failed: status=%d creates=%d body=%s", createResponse.Code, controlPlaneCreates, createResponse.Body.String())
	}
	assertCatalogGoldenResponseSafe(t, createResponse)

	dataInvocations := []struct {
		operationID string
		invocation  string
		sequence    int64
		input       string
		contains    string
	}{
		{"list-products", "catalog-list", 1, `{}`, `"Alpha"`},
		{"create-product", "catalog-create", 2, `{"product":{"id":"p2","name":"Beta"}}`, `"Beta"`},
		{"get-product", "catalog-get", 3, `{"id":"p2"}`, `"p2"`},
		{"update-product", "catalog-update", 4, `{"id":"p2","patch":{"name":"Beta Updated"}}`, `"Beta Updated"`},
		{"delete-product", "catalog-delete", 5, `{"id":"p2"}`, `"Beta Updated"`},
	}
	var createDataResponse string
	for _, invocation := range dataInvocations {
		response := catalogGoldenDataInvocation(t, router, invocation.operationID, invocation.invocation, invocation.sequence, invocation.input)
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), invocation.contains) || !strings.Contains(response.Body.String(), `"runtimeZone":"server"`) || !strings.Contains(response.Body.String(), `"redacted":true`) {
			t.Fatalf("authenticated Catalog %s failed: status=%d body=%s", invocation.operationID, response.Code, response.Body.String())
		}
		assertCatalogGoldenResponseSafe(t, response)
		if invocation.operationID == "create-product" {
			createDataResponse = response.Body.String()
			replay := catalogGoldenDataInvocation(t, router, invocation.operationID, invocation.invocation, invocation.sequence, invocation.input)
			if replay.Code != http.StatusOK || replay.Body.String() != createDataResponse || len(transport.calls) != 2 {
				t.Fatalf("Catalog create replay crossed upstream or drifted: status=%d calls=%d body=%s", replay.Code, len(transport.calls), replay.Body.String())
			}
			assertCatalogGoldenResponseSafe(t, replay)
		}
	}
	if len(transport.calls) != len(dataInvocations) {
		t.Fatalf("expected %d exact Catalog upstream calls, got %d", len(dataInvocations), len(transport.calls))
	}

	routeInput := json.RawMessage(`{"routeId":"route-catalog"}`)
	guard := catalogGoldenServerInvocation(t, router, "requireCatalogOwner", "catalog-guard", routeInput, false)
	if guard.Code != http.StatusOK || !strings.Contains(guard.Body.String(), `"kind":"allow"`) {
		t.Fatalf("authenticated Catalog owner guard failed: status=%d body=%s", guard.Code, guard.Body.String())
	}
	assertCatalogGoldenResponseSafe(t, guard)
	loader := catalogGoldenServerInvocation(t, router, "loadCatalogPrincipal", "catalog-loader", routeInput, false)
	if loader.Code != http.StatusOK || !strings.Contains(loader.Body.String(), `"principalId":"`+catalogGoldenOwnerID+`"`) || !strings.Contains(loader.Body.String(), `"providerId":"prodivix-product-session"`) {
		t.Fatalf("authenticated Catalog principal loader failed: status=%d body=%s", loader.Code, loader.Body.String())
	}
	assertCatalogGoldenResponseSafe(t, loader)
	actionInput := json.RawMessage(`{"format":"prodivix.route-action-input.v1","route":{"routeNodeId":"route-catalog","currentPath":"/","matchedPath":"/","params":{},"searchParams":{}},"submission":{"method":"POST","encType":"application/json","value":{"key":"catalog-last-action","value":{"operation":"delete-product"}}}}`)
	action := catalogGoldenServerInvocation(t, router, "mutateCatalog", "catalog-action", actionInput, true)
	if action.Code != http.StatusOK || !strings.Contains(action.Body.String(), `"revision":1`) || !strings.Contains(action.Body.String(), `"catalog-last-action"`) {
		t.Fatalf("authenticated Catalog action failed: status=%d body=%s", action.Code, action.Body.String())
	}
	assertCatalogGoldenResponseSafe(t, action)
	actionReplay := catalogGoldenServerInvocation(t, router, "mutateCatalog", "catalog-action", actionInput, true)
	if actionReplay.Code != http.StatusOK || actionReplay.Body.String() != action.Body.String() {
		t.Fatalf("authenticated Catalog action replay drifted: status=%d body=%s", actionReplay.Code, actionReplay.Body.String())
	}

	strangerRouter := testRouterSession(handler, "catalog-golden-stranger", catalogGoldenSessionID)
	denied := catalogGoldenServerInvocation(t, strangerRouter, "requireCatalogOwner", "catalog-denied", routeInput, false)
	if denied.Code != http.StatusNotFound || !strings.Contains(denied.Body.String(), `"code":"SVR-4004"`) {
		t.Fatalf("non-owner reached authenticated Catalog guard: status=%d body=%s", denied.Code, denied.Body.String())
	}
	assertCatalogGoldenResponseSafe(t, denied)

	var dataReplayCount, serverReplayCount, serverStateCount int
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_data_mutation_replays WHERE execution_id = $1`, catalogGoldenExecutionID).Scan(&dataReplayCount); err != nil || dataReplayCount != 3 {
		t.Fatalf("Catalog durable Data replay rows drifted: count=%d err=%v", dataReplayCount, err)
	}
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_mutation_replays WHERE execution_id = $1`, catalogGoldenExecutionID).Scan(&serverReplayCount); err != nil || serverReplayCount != 1 {
		t.Fatalf("Catalog durable Server replay rows drifted: count=%d err=%v", serverReplayCount, err)
	}
	if err := database.QueryRowContext(ctx, `SELECT COUNT(*) FROM remote_server_function_execution_state WHERE execution_id = $1`, catalogGoldenExecutionID).Scan(&serverStateCount); err != nil || serverStateCount != 1 {
		t.Fatalf("Catalog durable Server state rows drifted: count=%d err=%v", serverStateCount, err)
	}
}
