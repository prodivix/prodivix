package remoteexecution

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

type fakeServerFunctionStore struct {
	authority     *ExecutionAuthority
	document      []byte
	err           error
	permissionErr error
}

type fakeServerFunctionEnvironment struct {
	available    bool
	material     []byte
	snapshot     *backendenvironment.Snapshot
	grant        backendenvironment.IssueGrantInput
	use          backendenvironment.UseSecretInput
	revokedGrant string
}

func (environment *fakeServerFunctionEnvironment) Available() bool {
	return environment.available
}

func (environment *fakeServerFunctionEnvironment) VerifySnapshotAccess(_ context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string, mode string) error {
	if environment.snapshot == nil || principal.PrincipalID != "user-1" || principal.SessionID != "session-server-only" || workspaceID != environment.snapshot.WorkspaceID || environmentID != environment.snapshot.EnvironmentID || revision != environment.snapshot.Revision || mode != environment.snapshot.Mode {
		return backendenvironment.ErrPermissionDenied
	}
	return nil
}

func (environment *fakeServerFunctionEnvironment) GetSnapshot(_ context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string) (*backendenvironment.Snapshot, error) {
	if environment.snapshot == nil || principal.PrincipalID != "user-1" || principal.SessionID != "session-server-only" || workspaceID != environment.snapshot.WorkspaceID || environmentID != environment.snapshot.EnvironmentID || revision != environment.snapshot.Revision {
		return nil, backendenvironment.ErrPermissionDenied
	}
	return environment.snapshot, nil
}

func (environment *fakeServerFunctionEnvironment) IssueGrant(_ context.Context, input backendenvironment.IssueGrantInput) (*backendenvironment.Grant, error) {
	environment.grant = input
	return &backendenvironment.Grant{GrantID: "server-function-grant-1"}, nil
}

func (environment *fakeServerFunctionEnvironment) UseSecret(_ context.Context, input backendenvironment.UseSecretInput, consumer func([]byte) error) error {
	environment.use = input
	return consumer(append([]byte(nil), environment.material...))
}

func (environment *fakeServerFunctionEnvironment) RevokeGrant(_ context.Context, grantID string, _ backendenvironment.PrincipalSession) error {
	environment.revokedGrant = grantID
	return nil
}

func (store *fakeServerFunctionStore) VerifyWorkspaceOwner(_ context.Context, ownerID string, workspaceID string) error {
	if store.permissionErr != nil || store.authority == nil || store.authority.OwnerID != ownerID || store.authority.WorkspaceID != workspaceID {
		return ErrExecutionNotFound
	}
	return nil
}

type fakeServerFunctionHandlerStore struct {
	*fakeGrantStore
	document        []byte
	mutationResults map[string]struct {
		hash   string
		result ServerFunctionExecutionStateResult
	}
	stateRevisions      map[string]int64
	mutationEffectCount int
}

func (store *fakeServerFunctionHandlerStore) GetCodeDocument(_ context.Context, authority ExecutionAuthority, documentID string) ([]byte, error) {
	if authority.PartitionRevisions["document:"+documentID+":content"] != "7" {
		return nil, ErrExecutionAuthorityConflict
	}
	return store.document, nil
}

func (store *fakeServerFunctionHandlerStore) ApplyServerFunctionExecutionStateMutation(ctx context.Context, key ServerFunctionExecutionStateMutationKey, requestHash string, value json.RawMessage) (*ServerFunctionExecutionStateResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if store.mutationResults == nil {
		store.mutationResults = make(map[string]struct {
			hash   string
			result ServerFunctionExecutionStateResult
		})
	}
	if store.stateRevisions == nil {
		store.stateRevisions = make(map[string]int64)
	}
	replayKey := strings.Join([]string{key.ExecutionID, key.ArtifactID, key.ExportName, key.InvocationID}, "\x00")
	if replay, exists := store.mutationResults[replayKey]; exists {
		if replay.hash != requestHash || replay.result.Key != key.StateKey {
			return nil, ErrServerFunctionReplayConflict
		}
		result := replay.result
		return &result, nil
	}
	var decoded any
	decoder := json.NewDecoder(bytes.NewReader(value))
	decoder.UseNumber()
	if decoder.Decode(&decoded) != nil {
		return nil, ErrServerFunctionInputInvalid
	}
	stateKey := strings.Join([]string{key.ExecutionID, key.ArtifactID, key.ExportName, key.StateKey}, "\x00")
	store.stateRevisions[stateKey]++
	result := ServerFunctionExecutionStateResult{Key: key.StateKey, Value: decoded, Revision: store.stateRevisions[stateKey]}
	store.mutationResults[replayKey] = struct {
		hash   string
		result ServerFunctionExecutionStateResult
	}{hash: requestHash, result: result}
	store.mutationEffectCount++
	return &result, nil
}

func (store *fakeServerFunctionStore) GetExecutionAuthority(_ context.Context, ownerID string, sessionID string, executionID string) (*ExecutionAuthority, error) {
	if store.err != nil || store.authority == nil || store.authority.ExecutionID != executionID || store.authority.OwnerID != ownerID || store.authority.SessionID != sessionID {
		return nil, ErrExecutionNotFound
	}
	return store.authority, nil
}

func (store *fakeServerFunctionStore) GetCodeDocument(_ context.Context, authority ExecutionAuthority, documentID string) ([]byte, error) {
	if store.err != nil || authority.PartitionRevisions["document:"+documentID+":content"] != "7" {
		return nil, ErrExecutionAuthorityConflict
	}
	return store.document, nil
}

func serverFunctionDocumentFixture(exportName string, kind string, adapterID string, auth string, inputSchema string, outputSchema string) []byte {
	return []byte(`{
  "language": "ts",
  "source": "export const ` + exportName + ` = () => undefined",
  "metadata": {
    "prodivix.serverRuntime": {
      "schemaVersion": "1.0",
      "functionsByExport": {
        "` + exportName + `": {
          "kind": "` + kind + `",
          "runtimeZone": "server",
          "adapterId": "` + adapterID + `",
          "effect": "read",
          "auth": ` + auth + `,
          "inputSchema": ` + inputSchema + `,
          "outputSchema": ` + outputSchema + `
        }
      }
    }
  }
}`)
}

func currentPrincipalCodeDocument() []byte {
	return serverFunctionDocumentFixture(
		"loadPrincipal",
		"route-loader",
		"core.auth.current-principal",
		`{"kind":"authenticated"}`,
		`{"type":"object","additionalProperties":false,"required":["routeId"],"properties":{"routeId":{"type":"string"}}}`,
		`{"type":"object","additionalProperties":false,"required":["providerId","principalId"],"properties":{"providerId":{"const":"prodivix-product-session"},"principalId":{"type":"string"}}}`,
	)
}

func currentPrincipalCodeDocumentWithInvalidSibling() []byte {
	var document map[string]any
	if err := json.Unmarshal(currentPrincipalCodeDocument(), &document); err != nil {
		panic(err)
	}
	metadata := document["metadata"].(map[string]any)
	profile := metadata[serverRuntimeMetadataKey].(map[string]any)
	functions := profile["functionsByExport"].(map[string]any)
	functions["invalidSibling"] = map[string]any{
		"kind":         "function",
		"runtimeZone":  "server",
		"adapterId":    "custom.invalid-sibling",
		"effect":       "read",
		"auth":         map[string]any{"kind": "authenticated"},
		"inputSchema":  42,
		"outputSchema": true,
	}
	encoded, err := json.Marshal(document)
	if err != nil {
		panic(err)
	}
	return encoded
}

func executionStateMutationCodeDocument(adapterID string, withIdempotency bool) []byte {
	idempotency := ""
	if withIdempotency {
		idempotency = `,"idempotency":{"kind":"invocation-key"}`
	}
	return []byte(`{
  "language":"ts",
  "source":"export const putState = () => 'project-source-must-not-run-or-leak'",
  "metadata":{"prodivix.serverRuntime":{"schemaVersion":"1.0","functionsByExport":{"putState":{
    "kind":"route-action",
    "runtimeZone":"server",
    "adapterId":"` + adapterID + `",
    "effect":"mutation",
    "auth":{"kind":"authenticated"},
    "inputSchema":true,
    "outputSchema":{"type":"object","additionalProperties":false,"required":["key","value","revision"],"properties":{"key":{"type":"string"},"value":true,"revision":{"type":"integer","minimum":1}}}` + idempotency + `
  }}}}
}`)
}

func hmacServerFunctionCodeDocument(environment string) []byte {
	return []byte(`{
  "language":"ts",
  "source":"export const signPayload = () => 'project-source-must-not-run-or-leak'",
  "metadata":{"prodivix.serverRuntime":{"schemaVersion":"1.0","functionsByExport":{"signPayload":{
    "kind":"route-action",
    "runtimeZone":"server",
    "adapterId":"core.server.hmac-sha256",
    "effect":"read",
    "auth":{"kind":"authenticated"},
    "inputSchema":true,
    "outputSchema":{"type":"object","additionalProperties":false,"required":["algorithm","digest"],"properties":{"algorithm":{"const":"HMAC-SHA256"},"digest":{"type":"string","pattern":"^[a-f0-9]{64}$"}}},
    "environment":` + environment + `
  }}}}
}`)
}

func hmacServerFunctionInvocation() ServerFunctionInvocation {
	return ServerFunctionInvocation{
		Type:         serverFunctionRequestType,
		RequestID:    "hmac-invocation-1:1",
		InvocationID: "hmac-invocation-1",
		Attempt:      1,
		FunctionRef: serverFunctionReference{
			ArtifactID: "code-auth",
			ExportName: "signPayload",
		},
		Input: json.RawMessage(`{
      "format":"prodivix.route-action-input.v1",
      "route":{"routeNodeId":"route-home","currentPath":"/","matchedPath":"/","params":{},"searchParams":{}},
      "submission":{"method":"POST","encType":"application/json","value":{"message":"hello","count":2}}
    }`),
	}
}

func serverFunctionEnvironmentFixture() *fakeServerFunctionEnvironment {
	return &fakeServerFunctionEnvironment{
		available: true,
		material:  []byte("0123456789abcdef0123456789abcdef"),
		snapshot: &backendenvironment.Snapshot{
			EnvironmentID:    "environment-production",
			WorkspaceID:      "workspace-1",
			Revision:         "environment-revision-1",
			Mode:             "live",
			SecretBindingIDs: []string{"webhook-signing-key"},
		},
	}
}

func executionStateMutationInvocation(invocationID string, stateKey string, value any) ServerFunctionInvocation {
	input, err := json.Marshal(map[string]any{
		"format": "prodivix.route-action-input.v1",
		"route": map[string]any{
			"routeNodeId":  "route-home",
			"currentPath":  "/",
			"matchedPath":  "/",
			"params":       map[string]any{},
			"searchParams": map[string]any{},
		},
		"submission": map[string]any{
			"method":  "POST",
			"encType": "application/json",
			"value":   map[string]any{"key": stateKey, "value": value},
		},
	})
	if err != nil {
		panic(err)
	}
	return ServerFunctionInvocation{
		Type:         serverFunctionRequestType,
		RequestID:    invocationID + ":1",
		InvocationID: invocationID,
		Attempt:      1,
		FunctionRef: serverFunctionReference{
			ArtifactID: "code-auth",
			ExportName: "putState",
		},
		Input: input,
	}
}

func serverFunctionTestGateway(document []byte) (*ServerFunctionGateway, *fakeServerFunctionStore) {
	store := &fakeServerFunctionStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1",
			WorkspaceID: "workspace-1",
			OwnerID:     "user-1",
			SessionID:   "session-server-only",
			SnapshotID:  "snapshot-1",
			PartitionRevisions: map[string]string{
				"workspace":                  "9",
				"document:code-auth:content": "7",
			},
		},
		document: document,
	}
	gateway := NewServerFunctionGateway(store)
	gateway.now = func() time.Time { return time.UnixMilli(1_000) }
	return gateway, store
}

func serverFunctionInvocation(exportName string) ServerFunctionInvocation {
	return ServerFunctionInvocation{
		Type:         serverFunctionRequestType,
		RequestID:    "invocation-1:1",
		InvocationID: "invocation-1",
		Attempt:      1,
		FunctionRef: serverFunctionReference{
			ArtifactID: "code-auth",
			ExportName: exportName,
		},
		Input: json.RawMessage(`{"routeId":"route-home"}`),
	}
}

func serverFunctionPrincipal() ServerFunctionPrincipalSession {
	return ServerFunctionPrincipalSession{
		PrincipalID: "user-1",
		SessionID:   "session-server-only",
		ExpiresAt:   2_000,
	}
}

func TestServerFunctionGatewayReturnsValueOnlyCurrentPrincipal(t *testing.T) {
	gateway, _ := serverFunctionTestGateway(currentPrincipalCodeDocument())
	result, err := gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", serverFunctionInvocation("loadPrincipal"))
	if err != nil {
		t.Fatalf("Invoke returned error: %v", err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	text := string(encoded)
	if !strings.Contains(text, `"providerId":"prodivix-product-session"`) || !strings.Contains(text, `"principalId":"user-1"`) {
		t.Fatalf("unexpected principal result: %s", text)
	}
	for _, forbidden := range []string{"session-server-only", "sessionId", "accessToken", "source"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("response leaked %q: %s", forbidden, text)
		}
	}
}

func TestServerFunctionGatewayUsesExactEnvironmentGrantForHMAC(t *testing.T) {
	gateway, store := serverFunctionTestGateway(hmacServerFunctionCodeDocument(`{"secretsByField":{"key":{"bindingId":"webhook-signing-key"}}}`))
	store.authority.Environment = &EnvironmentReference{
		EnvironmentID: "environment-production",
		Revision:      "environment-revision-1",
		Mode:          "live",
	}
	environment := serverFunctionEnvironmentFixture()
	gateway.environments = environment

	result, err := gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", hmacServerFunctionInvocation())
	if err != nil {
		t.Fatalf("Invoke returned error: %v", err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	if !strings.Contains(string(encoded), `"algorithm":"HMAC-SHA256"`) || !strings.Contains(string(encoded), `"digest":"948a9987cafdd735e504ab4cf3cd853427424c8416a219a8f0475da44f9236b7"`) {
		t.Fatalf("unexpected HMAC result: %s", encoded)
	}
	for _, forbidden := range []string{"0123456789abcdef0123456789abcdef", "session-server-only", "server-function-grant-1", "project-source-must-not-run-or-leak", "webhook-signing-key"} {
		if bytes.Contains(encoded, []byte(forbidden)) {
			t.Fatalf("HMAC result leaked %q: %s", forbidden, encoded)
		}
	}
	if environment.grant.Principal != (backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-server-only"}) || environment.grant.WorkspaceID != "workspace-1" || environment.grant.EnvironmentID != "environment-production" || environment.grant.Revision != "environment-revision-1" || environment.grant.ProviderID != remoteServerFunctionEnvironmentProviderID || environment.grant.ProviderIsolation != "sandboxed" || environment.grant.ExecutionClass != "trusted-service" || environment.grant.RuntimeZone != "server" || environment.grant.PurposeKind != "process" || environment.grant.ResourceID != "execution-1:code-auth:signPayload:hmac-invocation-1" || len(environment.grant.SecretBindings) != 1 || environment.grant.SecretBindings[0] != (backendenvironment.SecretBindingGrant{BindingID: "webhook-signing-key", Field: "key"}) || environment.grant.ExpiresAt.UnixMilli() != 2_000 {
		t.Fatalf("environment grant drifted: %+v", environment.grant)
	}
	if environment.use.GrantID != "server-function-grant-1" || environment.use.Principal != environment.grant.Principal || environment.use.WorkspaceID != environment.grant.WorkspaceID || environment.use.EnvironmentID != environment.grant.EnvironmentID || environment.use.Revision != environment.grant.Revision || environment.use.ProviderID != environment.grant.ProviderID || environment.use.PurposeKind != environment.grant.PurposeKind || environment.use.ResourceID != environment.grant.ResourceID || environment.use.BindingID != "webhook-signing-key" || environment.use.Field != "key" {
		t.Fatalf("Secret use was not exact-grant bound: grant=%+v use=%+v", environment.grant, environment.use)
	}
	if environment.revokedGrant != "server-function-grant-1" {
		t.Fatalf("environment grant was not revoked: %q", environment.revokedGrant)
	}
}

func TestServerFunctionHMACFailsClosedBeforeOrDuringSecretUse(t *testing.T) {
	validEnvironment := `{"secretsByField":{"key":{"bindingId":"webhook-signing-key"}}}`
	for name, environmentPolicy := range map[string]string{
		"material in reference": `{"secretsByField":{"key":{"bindingId":"webhook-signing-key","value":"secret-material-canary"}}}`,
		"unknown field":         `{"secretsByField":{"other":{"bindingId":"webhook-signing-key"}}}`,
		"empty bindings":        `{"secretsByField":{}}`,
	} {
		t.Run(name, func(t *testing.T) {
			gateway, store := serverFunctionTestGateway(hmacServerFunctionCodeDocument(environmentPolicy))
			store.authority.Environment = &EnvironmentReference{EnvironmentID: "environment-production", Revision: "environment-revision-1", Mode: "live"}
			environment := serverFunctionEnvironmentFixture()
			gateway.environments = environment
			result, err := gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", hmacServerFunctionInvocation())
			if result != nil || !errors.Is(err, ErrServerFunctionDenied) || environment.grant.ProviderID != "" {
				t.Fatalf("invalid Secret policy reached the environment effect: result=%+v err=%v grant=%+v", result, err, environment.grant)
			}
		})
	}

	gateway, store := serverFunctionTestGateway(hmacServerFunctionCodeDocument(validEnvironment))
	store.authority.Environment = &EnvironmentReference{EnvironmentID: "environment-production", Revision: "environment-revision-1", Mode: "live"}
	withoutStore, err := gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", hmacServerFunctionInvocation())
	if withoutStore != nil || !errors.Is(err, ErrServerFunctionUnavailable) {
		t.Fatalf("missing environment store was not unavailable: result=%+v err=%v", withoutStore, err)
	}

	environment := serverFunctionEnvironmentFixture()
	environment.snapshot.SecretBindingIDs = nil
	gateway.environments = environment
	result, err := gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", hmacServerFunctionInvocation())
	if result != nil || !errors.Is(err, ErrServerFunctionDenied) || environment.grant.ProviderID != "" {
		t.Fatalf("missing exact Secret binding reached grant: result=%+v err=%v grant=%+v", result, err, environment.grant)
	}

	environment = serverFunctionEnvironmentFixture()
	environment.material = []byte("too-short")
	gateway.environments = environment
	result, err = gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", hmacServerFunctionInvocation())
	if result != nil || !errors.Is(err, ErrServerFunctionDenied) || environment.revokedGrant != "server-function-grant-1" {
		t.Fatalf("weak Secret material was not denied and revoked: result=%+v err=%v revoked=%q", result, err, environment.revokedGrant)
	}

	malformed := hmacServerFunctionInvocation()
	malformed.Input = json.RawMessage(`{"format":"prodivix.route-action-input.v1","route":{},"submission":{"method":"POST","encType":"application/json","value":true}}`)
	environment = serverFunctionEnvironmentFixture()
	gateway.environments = environment
	result, err = gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", malformed)
	if result != nil || !errors.Is(err, ErrServerFunctionInputInvalid) || environment.grant.ProviderID != "" {
		t.Fatalf("malformed route action reached Secret grant: result=%+v err=%v grant=%+v", result, err, environment.grant)
	}
}

func TestServerFunctionHTTPRouteWiresEnvironmentStoreWithoutSecretProjection(t *testing.T) {
	grantStore := &fakeGrantStore{
		workspaceOwner: map[string]string{"workspace-1": "user-1"},
		executionOwner: map[string]string{"execution-1": "user-1"},
		lastAuthority: ExecutionAuthority{
			ExecutionID: "execution-1",
			WorkspaceID: "workspace-1",
			OwnerID:     "user-1",
			SessionID:   "session-server-only",
			SnapshotID:  "snapshot-1",
			PartitionRevisions: map[string]string{
				"workspace":                  "9",
				"document:code-auth:content": "7",
			},
			Environment: &EnvironmentReference{
				EnvironmentID: "environment-production",
				Revision:      "environment-revision-1",
				Mode:          "live",
			},
		},
	}
	store := &fakeServerFunctionHandlerStore{
		fakeGrantStore: grantStore,
		document: hmacServerFunctionCodeDocument(
			`{"secretsByField":{"key":{"bindingId":"webhook-signing-key"}}}`,
		),
	}
	environment := serverFunctionEnvironmentFixture()
	handler := NewHandler(
		store,
		backendconfig.RemoteRunnerConfig{},
		backendconfig.RemotePreviewHostConfig{},
		environment,
	)
	invocation, err := json.Marshal(hmacServerFunctionInvocation())
	if err != nil {
		t.Fatalf("marshal HMAC invocation: %v", err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/remote-executions/execution-1/server-functions/code-auth/signPayload/invoke",
		bytes.NewReader(invocation),
	)
	response := httptest.NewRecorder()
	testRouterSession(handler, "user-1", "session-server-only").ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "private, no-store" || !strings.Contains(response.Body.String(), `"digest":"948a9987cafdd735e504ab4cf3cd853427424c8416a219a8f0475da44f9236b7"`) {
		t.Fatalf("unexpected HMAC HTTP response: status=%d cache=%q body=%s", response.Code, response.Header().Get("Cache-Control"), response.Body.String())
	}
	for _, forbidden := range []string{"0123456789abcdef0123456789abcdef", "webhook-signing-key", "server-function-grant-1", "session-server-only", "project-source-must-not-run-or-leak"} {
		if strings.Contains(response.Body.String(), forbidden) {
			t.Fatalf("HMAC HTTP response leaked %q: %s", forbidden, response.Body.String())
		}
	}
	if environment.revokedGrant != "server-function-grant-1" {
		t.Fatalf("HTTP HMAC grant was not revoked: %q", environment.revokedGrant)
	}
}

func TestServerFunctionHTTPRouteIsAuthenticatedBoundedAndNoStore(t *testing.T) {
	grantStore := &fakeGrantStore{
		workspaceOwner: map[string]string{"workspace-1": "user-1"},
		executionOwner: map[string]string{"execution-1": "user-1"},
		lastAuthority: ExecutionAuthority{
			ExecutionID: "execution-1",
			WorkspaceID: "workspace-1",
			OwnerID:     "user-1",
			SessionID:   "session-server-only",
			SnapshotID:  "snapshot-1",
			PartitionRevisions: map[string]string{
				"workspace":                  "9",
				"document:code-auth:content": "7",
			},
		},
	}
	store := &fakeServerFunctionHandlerStore{fakeGrantStore: grantStore, document: currentPrincipalCodeDocument()}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{}, backendconfig.RemotePreviewHostConfig{})
	invocation, err := json.Marshal(serverFunctionInvocation("loadPrincipal"))
	if err != nil {
		t.Fatalf("marshal invocation: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/server-functions/code-auth/loadPrincipal/invoke", bytes.NewReader(invocation))
	response := httptest.NewRecorder()
	testRouterSession(handler, "user-1", "session-server-only").ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("unexpected Server Function response: status=%d cache=%q body=%s", response.Code, response.Header().Get("Cache-Control"), response.Body.String())
	}
	for _, forbidden := range []string{"session-server-only", "sessionId", "accessToken", "source"} {
		if strings.Contains(response.Body.String(), forbidden) {
			t.Fatalf("HTTP response leaked %q: %s", forbidden, response.Body.String())
		}
	}

	store.document = serverFunctionDocumentFixture(
		"loadPrincipal",
		"route-loader",
		"core.auth.current-principal",
		`{"kind":"authenticated"}`,
		`true`,
		`{"type":"object","required":["secret"],"properties":{"secret":{"type":"string"}}}`,
	)
	invalidOutputRequest := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/server-functions/code-auth/loadPrincipal/invoke", bytes.NewReader(invocation))
	invalidOutputResponse := httptest.NewRecorder()
	testRouterSession(handler, "user-1", "session-server-only").ServeHTTP(invalidOutputResponse, invalidOutputRequest)
	if invalidOutputResponse.Code != http.StatusBadGateway || !strings.Contains(invalidOutputResponse.Body.String(), `"code":"SVR-5002"`) || !strings.Contains(invalidOutputResponse.Body.String(), `"retryable":false`) {
		t.Fatalf("output contract error retryability drifted: status=%d body=%s", invalidOutputResponse.Code, invalidOutputResponse.Body.String())
	}

	var malformed map[string]any
	if err := json.Unmarshal(invocation, &malformed); err != nil {
		t.Fatalf("decode invocation: %v", err)
	}
	malformed["accessToken"] = "must-not-cross-bridge"
	malformedBody, err := json.Marshal(malformed)
	if err != nil {
		t.Fatalf("marshal malformed invocation: %v", err)
	}
	badRequest := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/server-functions/code-auth/loadPrincipal/invoke", bytes.NewReader(malformedBody))
	badResponse := httptest.NewRecorder()
	testRouterSession(handler, "user-1", "session-server-only").ServeHTTP(badResponse, badRequest)
	if badResponse.Code != http.StatusBadRequest || badResponse.Header().Get("Cache-Control") != "private, no-store" || !strings.Contains(badResponse.Body.String(), `"code":"SVR-1001"`) || !strings.Contains(badResponse.Body.String(), `"retryable":false`) {
		t.Fatalf("malformed bridge did not fail closed: status=%d cache=%q body=%s", badResponse.Code, badResponse.Header().Get("Cache-Control"), badResponse.Body.String())
	}

	largeRequest := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/server-functions/code-auth/loadPrincipal/invoke", strings.NewReader(strings.Repeat("x", int(maximumServerFunctionRequestBytes)+1)))
	largeResponse := httptest.NewRecorder()
	testRouterSession(handler, "user-1", "session-server-only").ServeHTTP(largeResponse, largeRequest)
	if largeResponse.Code != http.StatusRequestEntityTooLarge || largeResponse.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("oversized bridge was not rejected: status=%d cache=%q body=%s", largeResponse.Code, largeResponse.Header().Get("Cache-Control"), largeResponse.Body.String())
	}
}

func TestServerFunctionLiveMutationRequiresOriginIntentAndDurableReplay(t *testing.T) {
	grantStore := &fakeGrantStore{
		workspaceOwner: map[string]string{"workspace-1": "user-1"},
		executionOwner: map[string]string{"execution-1": "user-1"},
		lastAuthority: ExecutionAuthority{
			ExecutionID: "execution-1",
			WorkspaceID: "workspace-1",
			OwnerID:     "user-1",
			SessionID:   "session-server-only",
			SnapshotID:  "snapshot-1",
			PartitionRevisions: map[string]string{
				"workspace":                  "9",
				"document:code-auth:content": "7",
			},
		},
	}
	store := &fakeServerFunctionHandlerStore{
		fakeGrantStore: grantStore,
		document:       executionStateMutationCodeDocument(serverFunctionExecutionStatePutAdapterID, true),
	}
	handler := NewHandler(store, backendconfig.RemoteRunnerConfig{
		ServerFunctionAllowedOrigins: []string{"https://studio.example.test", "https://studio-alt.example.test"},
	}, backendconfig.RemotePreviewHostConfig{})
	router := testRouterSession(handler, "user-1", "session-server-only")
	invoke := func(invocation ServerFunctionInvocation, origin string, intent string, token string) *httptest.ResponseRecorder {
		body, err := json.Marshal(invocation)
		if err != nil {
			t.Fatalf("marshal mutation invocation: %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/remote-executions/execution-1/server-functions/code-auth/putState/invoke", bytes.NewReader(body))
		if origin != "" {
			request.Header.Set("Origin", origin)
		}
		if intent != "" {
			request.Header.Set(serverFunctionMutationIntentHeader, intent)
		}
		if token != "" {
			request.Header.Set("Authorization", "Bearer "+token)
		}
		request.Header.Set("Cookie", "product_session=cookie-session-canary")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}

	firstInvocation := executionStateMutationInvocation("mutation-1", "profile", map[string]any{"displayName": "Ada"})
	first := invoke(firstInvocation, "https://studio.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if first.Code != http.StatusOK || store.mutationEffectCount != 1 || !strings.Contains(first.Body.String(), `"revision":1`) {
		t.Fatalf("first live mutation failed: status=%d effects=%d body=%s", first.Code, store.mutationEffectCount, first.Body.String())
	}
	for _, forbidden := range []string{"session-server-only", "product-access-token-canary", "cookie-session-canary", "project-source-must-not-run-or-leak"} {
		if strings.Contains(first.Body.String(), forbidden) {
			t.Fatalf("live mutation response leaked %q: %s", forbidden, first.Body.String())
		}
	}
	replay := invoke(firstInvocation, "https://studio.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if replay.Code != http.StatusOK || replay.Body.String() != first.Body.String() || store.mutationEffectCount != 1 {
		t.Fatalf("exact replay was not stable: status=%d effects=%d body=%s", replay.Code, store.mutationEffectCount, replay.Body.String())
	}
	crossAllowedOriginReplay := invoke(firstInvocation, "https://studio-alt.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if crossAllowedOriginReplay.Code != http.StatusConflict || !strings.Contains(crossAllowedOriginReplay.Body.String(), `"code":"SVR-3002"`) || store.mutationEffectCount != 1 {
		t.Fatalf("cross-origin replay identity was not fenced: status=%d effects=%d body=%s", crossAllowedOriginReplay.Code, store.mutationEffectCount, crossAllowedOriginReplay.Body.String())
	}

	second := invoke(executionStateMutationInvocation("mutation-2", "profile", map[string]any{"displayName": "Grace"}), "https://studio.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if second.Code != http.StatusOK || store.mutationEffectCount != 2 || !strings.Contains(second.Body.String(), `"revision":2`) {
		t.Fatalf("second state mutation failed: status=%d effects=%d body=%s", second.Code, store.mutationEffectCount, second.Body.String())
	}

	drift := invoke(executionStateMutationInvocation("mutation-1", "profile", map[string]any{"displayName": "Mallory"}), "https://studio.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if drift.Code != http.StatusConflict || !strings.Contains(drift.Body.String(), `"code":"SVR-3002"`) || store.mutationEffectCount != 2 {
		t.Fatalf("mutation identity drift was not fenced: status=%d effects=%d body=%s", drift.Code, store.mutationEffectCount, drift.Body.String())
	}

	for name, requestAuthority := range map[string][2]string{
		"missing origin": {"", serverFunctionMutationIntent},
		"cross origin":   {"https://attacker.example.test", serverFunctionMutationIntent},
		"missing intent": {"https://studio.example.test", ""},
		"wrong intent":   {"https://studio.example.test", "read-v1"},
	} {
		t.Run(name, func(t *testing.T) {
			response := invoke(executionStateMutationInvocation("denied-"+strings.ReplaceAll(name, " ", "-"), "denied", true), requestAuthority[0], requestAuthority[1], "product-access-token-canary")
			if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), `"code":"SVR-3001"`) || store.mutationEffectCount != 2 {
				t.Fatalf("mutation request authority was not fenced: status=%d effects=%d body=%s", response.Code, store.mutationEffectCount, response.Body.String())
			}
		})
	}

	malformed := executionStateMutationInvocation("malformed-adapter-input", "ignored", true)
	malformed.Input = json.RawMessage(`{"key":"not-a-route-action-envelope","value":true}`)
	malformedResponse := invoke(malformed, "https://studio.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if malformedResponse.Code != http.StatusUnprocessableEntity || !strings.Contains(malformedResponse.Body.String(), `"code":"SVR-2001"`) || store.mutationEffectCount != 2 {
		t.Fatalf("malformed adapter input reached effect: status=%d effects=%d body=%s", malformedResponse.Code, store.mutationEffectCount, malformedResponse.Body.String())
	}

	credentialEcho := invoke(executionStateMutationInvocation("credential-echo", "credential", map[string]any{
		"value":  "session-server-only",
		"token":  "product-access-token-canary",
		"nested": map[string]any{"cookie-session-canary": true},
	}), "https://studio.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if credentialEcho.Code != http.StatusNotFound || store.mutationEffectCount != 2 {
		t.Fatalf("credential canary reached mutation adapter: status=%d effects=%d body=%s", credentialEcho.Code, store.mutationEffectCount, credentialEcho.Body.String())
	}
	for _, forbidden := range []string{"session-server-only", "product-access-token-canary", "cookie-session-canary"} {
		if strings.Contains(credentialEcho.Body.String(), forbidden) {
			t.Fatalf("credential rejection leaked %q: %s", forbidden, credentialEcho.Body.String())
		}
	}

	store.document = executionStateMutationCodeDocument("custom.eval-source", true)
	unsupported := invoke(executionStateMutationInvocation("custom-adapter", "unsafe", true), "https://studio.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if unsupported.Code != http.StatusNotFound || store.mutationEffectCount != 2 {
		t.Fatalf("custom mutation adapter was not denied: status=%d effects=%d body=%s", unsupported.Code, store.mutationEffectCount, unsupported.Body.String())
	}
	store.document = executionStateMutationCodeDocument(serverFunctionExecutionStatePutAdapterID, false)
	withoutReplayFence := invoke(executionStateMutationInvocation("missing-replay-fence", "unsafe", true), "https://studio.example.test", serverFunctionMutationIntent, "product-access-token-canary")
	if withoutReplayFence.Code != http.StatusNotFound || store.mutationEffectCount != 2 {
		t.Fatalf("mutation without invocation-key was not denied: status=%d effects=%d body=%s", withoutReplayFence.Code, store.mutationEffectCount, withoutReplayFence.Body.String())
	}
}

func TestServerFunctionMutationOriginNormalizationFailsClosed(t *testing.T) {
	for _, valid := range []struct {
		value  string
		origin string
	}{
		{value: "https://studio.example.test", origin: "https://studio.example.test"},
		{value: "https://studio.example.test/", origin: "https://studio.example.test"},
		{value: "http://localhost:5173", origin: "http://localhost:5173"},
		{value: "http://127.0.0.1:5173", origin: "http://127.0.0.1:5173"},
	} {
		origin, ok := normalizedServerFunctionMutationOrigin(valid.value)
		if !ok || origin != valid.origin {
			t.Fatalf("valid mutation origin rejected: value=%q origin=%q ok=%v", valid.value, origin, ok)
		}
	}
	for _, invalid := range []string{
		"",
		"null",
		"http://studio.example.test",
		"https://user@studio.example.test",
		"https://studio.example.test/path",
		"https://studio.example.test?token=forbidden",
		"https://studio.example.test#fragment",
	} {
		if origin, ok := normalizedServerFunctionMutationOrigin(invalid); ok || origin != "" {
			t.Fatalf("invalid mutation origin accepted: value=%q origin=%q", invalid, origin)
		}
	}
}

func TestServerFunctionGatewayAllowsExactWorkspaceOwnerGuard(t *testing.T) {
	document := serverFunctionDocumentFixture(
		"guardWorkspace",
		"route-guard",
		"core.auth.require-workspace-owner",
		`{"kind":"permission","permissionId":"workspace.owner"}`,
		`true`,
		`true`,
	)
	gateway, _ := serverFunctionTestGateway(document)
	result, err := gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", serverFunctionInvocation("guardWorkspace"))
	if err != nil || result.Result.Kind != "allow" {
		t.Fatalf("expected allow result, got result=%+v err=%v", result, err)
	}
}

func TestServerFunctionGatewayRechecksWorkspaceOwnerPermissionPerInvocation(t *testing.T) {
	document := serverFunctionDocumentFixture(
		"guardWorkspace",
		"route-guard",
		"core.auth.require-workspace-owner",
		`{"kind":"permission","permissionId":"workspace.owner"}`,
		`true`,
		`true`,
	)
	gateway, store := serverFunctionTestGateway(document)
	store.permissionErr = ErrExecutionNotFound
	result, err := gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", serverFunctionInvocation("guardWorkspace"))
	if result != nil || !errors.Is(err, ErrServerFunctionDenied) {
		t.Fatalf("revoked Workspace owner permission was not denied: result=%+v err=%v", result, err)
	}
}

func TestServerFunctionGatewayFailsClosedBeforeAdapterProjection(t *testing.T) {
	tests := []struct {
		name       string
		document   []byte
		principal  ServerFunctionPrincipalSession
		invocation ServerFunctionInvocation
		err        error
	}{
		{
			name:       "session mismatch",
			document:   currentPrincipalCodeDocument(),
			principal:  ServerFunctionPrincipalSession{PrincipalID: "user-1", SessionID: "other-session", ExpiresAt: 2_000},
			invocation: serverFunctionInvocation("loadPrincipal"),
			err:        ErrServerFunctionDenied,
		},
		{
			name:       "expired session",
			document:   currentPrincipalCodeDocument(),
			principal:  ServerFunctionPrincipalSession{PrincipalID: "user-1", SessionID: "session-server-only", ExpiresAt: 1_000},
			invocation: serverFunctionInvocation("loadPrincipal"),
			err:        ErrServerFunctionDenied,
		},
		{
			name: "public auth forbidden for principal adapter",
			document: serverFunctionDocumentFixture(
				"loadPrincipal", "route-loader", "core.auth.current-principal", `{"kind":"public"}`, `true`, `true`,
			),
			principal:  serverFunctionPrincipal(),
			invocation: serverFunctionInvocation("loadPrincipal"),
			err:        ErrServerFunctionDenied,
		},
		{
			name: "arbitrary source adapter forbidden",
			document: serverFunctionDocumentFixture(
				"loadPrincipal", "route-loader", "custom.eval-source", `{"kind":"authenticated"}`, `true`, `true`,
			),
			principal:  serverFunctionPrincipal(),
			invocation: serverFunctionInvocation("loadPrincipal"),
			err:        ErrServerFunctionDenied,
		},
		{
			name:       "invalid sibling profile schema",
			document:   currentPrincipalCodeDocumentWithInvalidSibling(),
			principal:  serverFunctionPrincipal(),
			invocation: serverFunctionInvocation("loadPrincipal"),
			err:        ErrServerFunctionDenied,
		},
		{
			name:      "input schema mismatch",
			document:  currentPrincipalCodeDocument(),
			principal: serverFunctionPrincipal(),
			invocation: func() ServerFunctionInvocation {
				value := serverFunctionInvocation("loadPrincipal")
				value.Input = json.RawMessage(`{}`)
				return value
			}(),
			err: ErrServerFunctionInputInvalid,
		},
		{
			name: "output schema mismatch",
			document: serverFunctionDocumentFixture(
				"loadPrincipal", "route-loader", "core.auth.current-principal", `{"kind":"authenticated"}`, `true`, `{"type":"object","required":["secret"],"properties":{"secret":{"type":"string"}}}`,
			),
			principal:  serverFunctionPrincipal(),
			invocation: serverFunctionInvocation("loadPrincipal"),
			err:        ErrServerFunctionOutputInvalid,
		},
		{
			name: "non-finite transport number",
			document: serverFunctionDocumentFixture(
				"loadPrincipal", "route-loader", "core.auth.current-principal", `{"kind":"authenticated"}`, `true`, `true`,
			),
			principal: serverFunctionPrincipal(),
			invocation: func() ServerFunctionInvocation {
				value := serverFunctionInvocation("loadPrincipal")
				value.Input = json.RawMessage(`{"value":1e999}`)
				return value
			}(),
			err: ErrServerFunctionInputInvalid,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			gateway, _ := serverFunctionTestGateway(test.document)
			result, err := gateway.Invoke(t.Context(), test.principal, "execution-1", test.invocation)
			if result != nil || !errors.Is(err, test.err) {
				t.Fatalf("expected %v, got result=%+v err=%v", test.err, result, err)
			}
		})
	}
}

func TestDecodeServerFunctionInvocationRejectsAuthorityAndUnknownFields(t *testing.T) {
	valid := `{"type":"prodivix.execution-server-function-gateway-request.v1","requestId":"invocation-1:1","invocationId":"invocation-1","attempt":1,"functionRef":{"artifactId":"code-auth","exportName":"loadPrincipal"},"input":{}}`
	if _, err := decodeServerFunctionInvocation([]byte(valid)); err != nil {
		t.Fatalf("valid invocation rejected: %v", err)
	}
	for _, invalid := range []string{
		strings.Replace(valid, `,"input":{}`, `,"sessionId":"server-only","input":{}`, 1),
		strings.Replace(valid, `"exportName":"loadPrincipal"`, `"exportName":"loadPrincipal","source":"forbidden"`, 1),
		strings.Replace(valid, `"requestId":"invocation-1:1"`, `"requestId":"other:1"`, 1),
		strings.Replace(valid, `"attempt":1`, `"attempt":2`, 1),
	} {
		if _, err := decodeServerFunctionInvocation([]byte(invalid)); !errors.Is(err, ErrServerFunctionInvalidRequest) {
			t.Fatalf("invalid invocation accepted: %s", invalid)
		}
	}
	invalidUTF8 := append([]byte(valid[:len(valid)-1]), 0xff, '}')
	if _, err := decodeServerFunctionInvocation(invalidUTF8); !errors.Is(err, ErrServerFunctionInvalidRequest) {
		t.Fatalf("invalid UTF-8 invocation accepted: %v", err)
	}
}

func TestServerFunctionSchemaAndCodeDocumentBudgetsFailClosed(t *testing.T) {
	deepSchema := `true`
	for range maximumServerFunctionSchemaDepth + 1 {
		deepSchema = `{"allOf":[` + deepSchema + `]}`
	}
	for name, raw := range map[string]json.RawMessage{
		"external ref":     json.RawMessage(`{"$ref":"https://example.invalid/schema"}`),
		"external dynamic": json.RawMessage(`{"$dynamicRef":"https://example.invalid/schema"}`),
		"depth":            json.RawMessage(deepSchema),
		"bytes":            json.RawMessage(strings.Repeat(" ", maximumServerFunctionSchemaBytes+1)),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := compileServerFunctionSchema(raw, "urn:prodivix:test"); !errors.Is(err, ErrServerFunctionDenied) {
				t.Fatalf("expected schema denial, got %v", err)
			}
		})
	}

	document := append(currentPrincipalCodeDocument(), []byte(strings.Repeat(" ", maximumServerFunctionCodeDocumentBytes))...)
	gateway, _ := serverFunctionTestGateway(document)
	result, err := gateway.Invoke(t.Context(), serverFunctionPrincipal(), "execution-1", serverFunctionInvocation("loadPrincipal"))
	if result != nil || !errors.Is(err, ErrServerFunctionDenied) {
		t.Fatalf("expected oversized code document denial, got result=%+v err=%v", result, err)
	}
}
