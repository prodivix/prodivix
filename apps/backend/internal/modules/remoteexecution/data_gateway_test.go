package remoteexecution

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

type fakeDataGatewayStore struct {
	authority       *ExecutionAuthority
	document        []byte
	err             error
	replayAvailable bool
	replayMu        sync.Mutex
	replays         map[string]fakeDataGatewayReplay
}

type fakeDataGatewayReplay struct {
	hash          string
	result        *DataGatewayResult
	indeterminate bool
	retryable     bool
	attempt       int64
	maximum       int64
}

func (store *fakeDataGatewayStore) VerifyWorkspaceOwner(context.Context, string, string) error {
	return nil
}

func (store *fakeDataGatewayStore) RecordExecution(context.Context, ExecutionAuthority) error {
	return nil
}

func (store *fakeDataGatewayStore) VerifyExecutionOwner(context.Context, string, string, string) error {
	return nil
}

func (store *fakeDataGatewayStore) GetExecutionAuthority(_ context.Context, ownerID string, sessionID string, executionID string) (*ExecutionAuthority, error) {
	if store.err != nil || store.authority == nil || store.authority.ExecutionID != executionID || store.authority.OwnerID != ownerID || store.authority.SessionID != sessionID {
		return nil, ErrExecutionNotFound
	}
	return store.authority, nil
}

func (store *fakeDataGatewayStore) GetDataSourceDocument(_ context.Context, authority ExecutionAuthority, documentID string) ([]byte, error) {
	if store.err != nil || authority.PartitionRevisions["document:"+documentID+":content"] != "3" {
		return nil, ErrExecutionAuthorityConflict
	}
	return store.document, nil
}

func fakeReplayKey(key DataGatewayMutationReplayKey) string {
	return strings.Join([]string{key.ExecutionID, key.DocumentID, key.OperationID, key.InvocationID}, "\x00")
}

func (store *fakeDataGatewayStore) ClaimDataGatewayMutation(_ context.Context, key DataGatewayMutationReplayKey, requestHash string, policy DataGatewayMutationReplayPolicy) (*DataGatewayMutationReplayClaim, error) {
	if !store.replayAvailable {
		return nil, ErrDataGatewayUnavailable
	}
	store.replayMu.Lock()
	defer store.replayMu.Unlock()
	if store.replays == nil {
		store.replays = map[string]fakeDataGatewayReplay{}
	}
	identity := fakeReplayKey(key)
	existing, exists := store.replays[identity]
	if !exists {
		if policy.Attempt != 1 {
			return nil, ErrDataGatewayReplayUnsafe
		}
		store.replays[identity] = fakeDataGatewayReplay{hash: requestHash, attempt: policy.Attempt, maximum: policy.MaximumAttempts}
		return &DataGatewayMutationReplayClaim{Acquired: true}, nil
	}
	if existing.hash != requestHash || existing.maximum != policy.MaximumAttempts {
		return nil, ErrDataGatewayReplayConflict
	}
	if existing.result != nil {
		return &DataGatewayMutationReplayClaim{Result: projectDataGatewayReplayAttempt(existing.result, key, policy.Attempt)}, nil
	}
	if existing.retryable && policy.Attempt == existing.attempt+1 && policy.Attempt <= existing.maximum {
		existing.retryable = false
		existing.attempt = policy.Attempt
		store.replays[identity] = existing
		return &DataGatewayMutationReplayClaim{Acquired: true}, nil
	}
	return nil, ErrDataGatewayReplayUnsafe
}

func (store *fakeDataGatewayStore) CompleteDataGatewayMutation(_ context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64, result DataGatewayResult) error {
	store.replayMu.Lock()
	defer store.replayMu.Unlock()
	identity := fakeReplayKey(key)
	existing, exists := store.replays[identity]
	if !exists || existing.hash != requestHash || existing.indeterminate || existing.retryable || existing.result != nil || existing.attempt != attempt {
		return ErrDataGatewayReplayConflict
	}
	existing.result = &result
	store.replays[identity] = existing
	return nil
}

func (store *fakeDataGatewayStore) ReleaseDataGatewayMutationRetry(_ context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64) error {
	store.replayMu.Lock()
	defer store.replayMu.Unlock()
	identity := fakeReplayKey(key)
	existing, exists := store.replays[identity]
	if !exists || existing.hash != requestHash || existing.indeterminate || existing.result != nil || existing.attempt != attempt || attempt >= existing.maximum {
		return ErrDataGatewayReplayConflict
	}
	existing.retryable = true
	store.replays[identity] = existing
	return nil
}

func (store *fakeDataGatewayStore) FenceDataGatewayMutation(_ context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64) error {
	store.replayMu.Lock()
	defer store.replayMu.Unlock()
	identity := fakeReplayKey(key)
	existing, exists := store.replays[identity]
	if !exists || existing.hash != requestHash || existing.result != nil || existing.attempt != attempt {
		return ErrDataGatewayReplayConflict
	}
	existing.indeterminate = true
	store.replays[identity] = existing
	return nil
}

type fakeDataGatewayEnvironment struct {
	canary       string
	grant        backendenvironment.IssueGrantInput
	use          backendenvironment.UseSecretInput
	revokedGrant string
}

func (environment *fakeDataGatewayEnvironment) Available() bool { return true }

func (environment *fakeDataGatewayEnvironment) GetSnapshot(_ context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string) (*backendenvironment.Snapshot, error) {
	if principal != (backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}) || workspaceID != "workspace-1" || environmentID != "environment-1" || revision != "revision-7" {
		return nil, backendenvironment.ErrPermissionDenied
	}
	return &backendenvironment.Snapshot{
		EnvironmentID: environmentID,
		WorkspaceID:   workspaceID,
		Revision:      revision,
		Mode:          "live",
		PublicBindings: map[string]any{
			"api-url": "https://api.example.test/v1/",
		},
		SecretBindingIDs: []string{"api-token"},
	}, nil
}

func (environment *fakeDataGatewayEnvironment) IssueGrant(_ context.Context, input backendenvironment.IssueGrantInput) (*backendenvironment.Grant, error) {
	environment.grant = input
	return &backendenvironment.Grant{GrantID: "grant-1"}, nil
}

func (environment *fakeDataGatewayEnvironment) UseSecret(_ context.Context, input backendenvironment.UseSecretInput, consumer func([]byte) error) error {
	environment.use = input
	return consumer([]byte(environment.canary))
}

func (environment *fakeDataGatewayEnvironment) RevokeGrant(_ context.Context, grantID string, _ backendenvironment.PrincipalSession) error {
	environment.revokedGrant = grantID
	return nil
}

type fakeDataGatewayTransport struct {
	requests []DataGatewayTransportRequest
	response *DataGatewayTransportResponse
	err      error
}

type blockingDataGatewayTransport struct {
	mu       sync.Mutex
	requests int
	started  chan struct{}
	release  chan struct{}
}

func (transport *blockingDataGatewayTransport) Execute(_ context.Context, _ DataGatewayTransportRequest) (*DataGatewayTransportResponse, error) {
	transport.mu.Lock()
	transport.requests++
	if transport.requests == 1 {
		close(transport.started)
	}
	transport.mu.Unlock()
	<-transport.release
	return &DataGatewayTransportResponse{Status: 201, Body: []byte(`{"id":"item-1"}`)}, nil
}

func (transport *blockingDataGatewayTransport) requestCount() int {
	transport.mu.Lock()
	defer transport.mu.Unlock()
	return transport.requests
}

func (transport *fakeDataGatewayTransport) Execute(_ context.Context, request DataGatewayTransportRequest) (*DataGatewayTransportResponse, error) {
	copyRequest := request
	copyRequest.Headers = map[string]string{}
	for name, value := range request.Headers {
		copyRequest.Headers[name] = value
	}
	transport.requests = append(transport.requests, copyRequest)
	return transport.response, transport.err
}

func remoteDataDocument() []byte {
	return []byte(`{
  "wireVersion": 1,
  "source": {
    "id": "catalog",
    "adapterId": "core.http",
    "runtimeZone": "server",
    "bindingsById": {
      "api-url": {"kind":"environment-ref","reference":{"bindingId":"api-url"}},
      "api-token": {"kind":"secret-ref","reference":{"bindingId":"api-token"}}
    },
    "configurationByKey": {
      "baseUrl": {"kind":"environment-ref","reference":{"bindingId":"api-url"}},
      "authorization": {"kind":"secret-ref","reference":{"bindingId":"api-token"}}
    }
  },
  "schemasById": {},
  "operationsById": {
    "list": {
      "id": "list",
      "kind": "query",
      "outputSchemaId": "items",
      "configurationByKey": {
        "method": {"kind":"literal","value":"GET"},
        "path": {"kind":"literal","value":"/items"},
        "emptyWhen": {"kind":"literal","value":"never"}
      },
      "policies": {}
    }
  }
}`)
}

func remoteMutationDocument() []byte {
	return []byte(strings.NewReplacer(
		`"list"`, `"create"`,
		`"kind": "query"`, `"kind": "mutation"`,
		`"value":"GET"`, `"value":"POST"`,
	).Replace(string(remoteDataDocument())))
}

func remoteIdempotentMutationDocument() []byte {
	return []byte(strings.NewReplacer(
		`"emptyWhen": {"kind":"literal","value":"never"}`,
		`"emptyWhen": {"kind":"literal","value":"never"}, "idempotencyHeader": {"kind":"literal","value":"idempotency-key"}`,
		`"policies": {}`,
		`"policies": {"idempotency":{"kind":"invocation-key"},"retry":{"maxAttempts":2,"backoff":"fixed","initialDelayMs":0}}`,
	).Replace(string(remoteMutationDocument())))
}

func TestDataGatewayExecutesExactSnapshotWithCallbackOnlySecret(t *testing.T) {
	canary := "secret-canary-remote-live-7f0c"
	store := &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteDataDocument(),
	}
	environments := &fakeDataGatewayEnvironment{canary: canary}
	transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 200, Body: []byte(`{"items":[]}`)}}
	gateway := NewDataGateway(store, environments, transport)
	ticks := []time.Time{time.UnixMilli(100), time.UnixMilli(101), time.UnixMilli(125)}
	gateway.now = func() time.Time {
		value := ticks[0]
		ticks = ticks[1:]
		return value
	}
	result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "list", DataGatewayInvocation{
		InvocationID: "invocation-1", Sequence: 4, Attempt: 1, Input: json.RawMessage(`{"page":1,"search":"term"}`),
	})
	if err != nil {
		t.Fatalf("invoke Remote Data gateway: %v", err)
	}
	if len(transport.requests) != 1 || transport.requests[0].URL != "https://api.example.test/items?page=1&search=term" || transport.requests[0].Headers["authorization"] != canary {
		t.Fatalf("authorized transport request drifted: %#v", transport.requests)
	}
	if environments.grant.RuntimeZone != "server" || environments.grant.ProviderID != remoteDataGatewayProviderID || environments.use.Field != "source.authorization" || environments.revokedGrant != "grant-1" {
		t.Fatalf("environment permission lifecycle drifted: grant=%#v use=%#v revoked=%q", environments.grant, environments.use, environments.revokedGrant)
	}
	encoded, _ := json.Marshal(result)
	if strings.Contains(string(encoded), canary) || strings.Contains(string(encoded), "search=term") || result.Network.SanitizedURL != "https://api.example.test/" || !result.Network.Redacted {
		t.Fatalf("Secret or query escaped sanitized result: %s", encoded)
	}
}

func TestDataGatewayFailsClosedBeforeTransportOnAuthorityOrZoneDrift(t *testing.T) {
	store := &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"document:data-1:content": "2"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteDataDocument(),
	}
	transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 200, Body: []byte(`null`)}}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{}, transport)
	_, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "list", DataGatewayInvocation{InvocationID: "invocation-1", Attempt: 1, Input: json.RawMessage(`{}`)})
	if !errors.Is(err, ErrDataGatewayDenied) || len(transport.requests) != 0 {
		t.Fatalf("snapshot drift reached transport: err=%v requests=%d", err, len(transport.requests))
	}

	store.authority.PartitionRevisions["document:data-1:content"] = "3"
	store.document = []byte(strings.Replace(string(remoteDataDocument()), `"runtimeZone": "server"`, `"runtimeZone": "client"`, 1))
	_, err = gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "list", DataGatewayInvocation{InvocationID: "invocation-2", Attempt: 1, Input: json.RawMessage(`{}`)})
	if !errors.Is(err, ErrDataGatewayDenied) || len(transport.requests) != 0 {
		t.Fatalf("client Secret zone reached transport: err=%v requests=%d", err, len(transport.requests))
	}

	store.document = []byte(strings.NewReplacer(`"kind": "query"`, `"kind": "mutation"`, `"value":"GET"`, `"value":"POST"`).Replace(string(remoteDataDocument())))
	_, err = gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "list", DataGatewayInvocation{InvocationID: "invocation-3", Attempt: 1, Input: json.RawMessage(`{}`)})
	if !errors.Is(err, ErrDataGatewayUnavailable) || len(transport.requests) != 0 {
		t.Fatalf("mutation without durable replay fencing reached transport: err=%v requests=%d", err, len(transport.requests))
	}
}

func TestDataGatewayMutationUsesDurableReplayFenceAndReturnsStoredResult(t *testing.T) {
	store := &fakeDataGatewayStore{
		replayAvailable: true,
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteMutationDocument(),
	}
	transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 201, Body: []byte(`{"id":"item-1"}`)}}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{canary: "secret-canary-mutation"}, transport)
	invocation := DataGatewayInvocation{InvocationID: "mutation-1", Sequence: 4, Attempt: 1, Input: json.RawMessage(`{"name":"Desk"}`)}
	result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", invocation)
	if err != nil || result.Network.Method != "POST" || len(transport.requests) != 1 || string(transport.requests[0].Body) != `{"name":"Desk"}` || transport.requests[0].URL != "https://api.example.test/items" {
		t.Fatalf("execute fenced mutation: result=%#v requests=%#v err=%v", result, transport.requests, err)
	}
	replayed, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", invocation)
	if err != nil || replayed.Network.RequestID != "mutation-1:1" || len(transport.requests) != 1 {
		t.Fatalf("return stored mutation without replay: result=%#v requests=%d err=%v", replayed, len(transport.requests), err)
	}
	drifted := invocation
	drifted.Input = json.RawMessage(`{"name":"Lamp"}`)
	if _, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", drifted); !errors.Is(err, ErrDataGatewayReplayConflict) || len(transport.requests) != 1 {
		t.Fatalf("mutation identity drift was not fenced: requests=%d err=%v", len(transport.requests), err)
	}
	retried := invocation
	retried.Attempt = 2
	if _, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", retried); !errors.Is(err, ErrDataGatewayReplayUnsafe) || len(transport.requests) != 1 {
		t.Fatalf("automatic mutation retry was not fenced: requests=%d err=%v", len(transport.requests), err)
	}
}

func TestDataGatewayIdempotentMutationRetriesWithOneOpaqueUpstreamKey(t *testing.T) {
	store := &fakeDataGatewayStore{
		replayAvailable: true,
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteIdempotentMutationDocument(),
	}
	transport := &fakeDataGatewayTransport{err: errors.New("connection reset after dispatch")}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{canary: "secret-canary-idempotent"}, transport)
	first := DataGatewayInvocation{InvocationID: "mutation-idempotent", Sequence: 9, Attempt: 1, Input: json.RawMessage(`{"name":"Desk"}`)}
	if result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", first); result != nil || !errors.Is(err, ErrDataGatewayUpstream) {
		t.Fatalf("expected retryable first dispatch, result=%#v err=%v", result, err)
	}
	transport.err = nil
	transport.response = &DataGatewayTransportResponse{Status: 201, Body: []byte(`{"id":"item-1"}`)}
	second := first
	second.Attempt = 2
	result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", second)
	if err != nil || result == nil || result.Network.RequestID != "mutation-idempotent:2" || result.Network.Correlation.Attempt != 2 {
		t.Fatalf("retry idempotent mutation: result=%#v err=%v", result, err)
	}
	if len(transport.requests) != 2 {
		t.Fatalf("expected two upstream attempts, got %d", len(transport.requests))
	}
	firstKey := transport.requests[0].Headers["idempotency-key"]
	secondKey := transport.requests[1].Headers["idempotency-key"]
	if firstKey == "" || firstKey != secondKey || !strings.HasPrefix(firstKey, "prodivix-data-sha256-") || strings.Contains(firstKey, "mutation-idempotent") {
		t.Fatalf("upstream idempotency key drifted or exposed identity: first=%q second=%q", firstKey, secondKey)
	}
	replayed, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", second)
	if err != nil || replayed == nil || replayed.Network.RequestID != "mutation-idempotent:2" || len(transport.requests) != 2 {
		t.Fatalf("durable retry result was not replayed locally: result=%#v requests=%d err=%v", replayed, len(transport.requests), err)
	}
	third := first
	third.Attempt = 3
	if _, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", third); !errors.Is(err, ErrDataGatewayReplayUnsafe) || len(transport.requests) != 2 {
		t.Fatalf("retry budget overflow reached upstream: requests=%d err=%v", len(transport.requests), err)
	}
	responseLost := first
	responseLost.InvocationID = "mutation-response-lost"
	responseLost.Sequence = 10
	responseLost.Attempt = 1
	if result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", responseLost); err != nil || result == nil || len(transport.requests) != 3 {
		t.Fatalf("complete first response-lost attempt: result=%#v requests=%d err=%v", result, len(transport.requests), err)
	}
	responseLost.Attempt = 2
	localReplay, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", responseLost)
	if err != nil || localReplay == nil || localReplay.Network.RequestID != "mutation-response-lost:2" || localReplay.Network.Correlation.Attempt != 2 || len(transport.requests) != 3 {
		t.Fatalf("completed result did not satisfy a response-lost retry locally: result=%#v requests=%d err=%v", localReplay, len(transport.requests), err)
	}
}

func TestDataGatewayRejectsUnsafeIdempotencyHeaderBeforeReplayClaim(t *testing.T) {
	store := &fakeDataGatewayStore{
		replayAvailable: true,
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: []byte(strings.Replace(string(remoteIdempotentMutationDocument()), `"value":"idempotency-key"`, `"value":"authorization"`, 1)),
	}
	transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 201, Body: []byte(`{"id":"item-1"}`)}}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{}, transport)
	_, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", DataGatewayInvocation{InvocationID: "unsafe-header", Sequence: 1, Attempt: 1, Input: json.RawMessage(`{}`)})
	if !errors.Is(err, ErrDataGatewayDenied) || len(transport.requests) != 0 || len(store.replays) != 0 {
		t.Fatalf("unsafe idempotency mapping crossed a boundary: requests=%d replays=%d err=%v", len(transport.requests), len(store.replays), err)
	}
}

func TestDataGatewayMutationNeverReplaysIndeterminateEffect(t *testing.T) {
	store := &fakeDataGatewayStore{
		replayAvailable: true,
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteMutationDocument(),
	}
	transport := &fakeDataGatewayTransport{err: errors.New("connection lost after dispatch")}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{canary: "secret-canary-indeterminate"}, transport)
	invocation := DataGatewayInvocation{InvocationID: "mutation-unknown", Sequence: 5, Attempt: 1, Input: json.RawMessage(`{"name":"Desk"}`)}
	if _, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", invocation); !errors.Is(err, ErrDataGatewayUpstream) || len(transport.requests) != 1 {
		t.Fatalf("expected ambiguous first dispatch: requests=%d err=%v", len(transport.requests), err)
	}
	transport.err = nil
	transport.response = &DataGatewayTransportResponse{Status: 201, Body: []byte(`{"id":"item-1"}`)}
	if _, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", invocation); !errors.Is(err, ErrDataGatewayReplayUnsafe) || len(transport.requests) != 1 {
		t.Fatalf("indeterminate mutation was replayed: requests=%d err=%v", len(transport.requests), err)
	}
	echoed := DataGatewayInvocation{InvocationID: "mutation-echo", Sequence: 6, Attempt: 1, Input: json.RawMessage(`{"name":"Lamp"}`)}
	transport.response = &DataGatewayTransportResponse{Status: 201, Body: []byte(`{"value":"secret-canary-indeterminate"}`)}
	if result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", echoed); result != nil || !errors.Is(err, ErrDataGatewayUpstream) || len(transport.requests) != 2 {
		t.Fatalf("echoed Secret escaped mutation fence: result=%#v requests=%d err=%v", result, len(transport.requests), err)
	}
	if _, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", echoed); !errors.Is(err, ErrDataGatewayReplayUnsafe) || len(transport.requests) != 2 {
		t.Fatalf("Secret-echo mutation was replayed: requests=%d err=%v", len(transport.requests), err)
	}
}

func TestDataGatewayMutationConcurrentDuplicateCannotReachTransport(t *testing.T) {
	store := &fakeDataGatewayStore{
		replayAvailable: true,
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteMutationDocument(),
	}
	transport := &blockingDataGatewayTransport{started: make(chan struct{}), release: make(chan struct{})}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{canary: "secret-canary-concurrent"}, transport)
	invocation := DataGatewayInvocation{InvocationID: "mutation-concurrent", Sequence: 6, Attempt: 1, Input: json.RawMessage(`{"name":"Desk"}`)}
	first := make(chan error, 1)
	go func() {
		_, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", invocation)
		first <- err
	}()
	<-transport.started
	if _, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "create", invocation); !errors.Is(err, ErrDataGatewayReplayUnsafe) {
		t.Fatalf("concurrent replay was not denied: %v", err)
	}
	close(transport.release)
	if err := <-first; err != nil {
		t.Fatalf("first mutation failed: %v", err)
	}
	if transport.requestCount() != 1 {
		t.Fatalf("concurrent duplicate reached transport %d times", transport.requestCount())
	}
}

func TestDataGatewayDiscardsNonSuccessBodyAndTransportErrors(t *testing.T) {
	canary := "secret-canary-upstream-error-68bf"
	store := &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteDataDocument(),
	}
	transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 401, Body: []byte(`{"detail":"` + canary + `"}`)}}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{canary: canary}, transport)
	result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "list", DataGatewayInvocation{InvocationID: "invocation-1", Attempt: 1, Input: json.RawMessage(`{}`)})
	if result != nil || !errors.Is(err, ErrDataGatewayUpstream) || strings.Contains(err.Error(), canary) {
		t.Fatalf("non-success body escaped gateway: result=%#v err=%v", result, err)
	}

	transport.response = nil
	transport.err = errors.New(canary)
	result, err = gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "list", DataGatewayInvocation{InvocationID: "invocation-2", Attempt: 1, Input: json.RawMessage(`{}`)})
	if result != nil || !errors.Is(err, ErrDataGatewayUpstream) || strings.Contains(err.Error(), canary) {
		t.Fatalf("transport error escaped gateway: result=%#v err=%v", result, err)
	}
}

func TestRemoteDataTransportRejectsNonPublicAddresses(t *testing.T) {
	for _, address := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "::1"} {
		if publicAddress(net.ParseIP(address)) {
			t.Fatalf("private address %s was accepted", address)
		}
	}
	if !publicAddress(net.ParseIP("8.8.8.8")) {
		t.Fatal("public address was rejected")
	}
}

func TestDataGatewayHandlerKeepsCanaryOutOfHTTPResponseAndRejectsExtraFields(t *testing.T) {
	canary := "secret-canary-http-surface-19aa"
	store := &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "user-1", SessionID: "session-1", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteDataDocument(),
	}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{canary: canary}, &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 200, Body: []byte(`{"items":[]}`)}})
	handler := &Handler{dataGateway: gateway}
	router := testRouterSession(handler, "user-1", "session-1")
	path := "/api/remote-executions/execution-1/data-sources/data-1/operations/list/invoke"
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(`{"invocationId":"invocation-1","sequence":1,"attempt":1,"input":{}}`)))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), canary) || response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("unsafe gateway response: status=%d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
	}

	invalid := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(`{"invocationId":"invocation-2","sequence":2,"attempt":1,"input":{},"value":"`+canary+`"}`)))
	invalidResponse := httptest.NewRecorder()
	router.ServeHTTP(invalidResponse, invalid)
	if invalidResponse.Code != http.StatusBadRequest || strings.Contains(invalidResponse.Body.String(), canary) {
		t.Fatalf("extra material field escaped strict request boundary: status=%d body=%s", invalidResponse.Code, invalidResponse.Body.String())
	}
}
