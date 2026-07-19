package remoteexecution

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

func (store *fakeDataGatewayStore) VerifyExecutionPrincipalSession(context.Context, string, string, string) error {
	return nil
}

func (store *fakeDataGatewayStore) GetExecutionAuthority(_ context.Context, ownerID string, sessionID string, executionID string) (*ExecutionAuthority, error) {
	if store.err != nil || store.authority == nil || store.authority.ExecutionID != executionID || store.authority.PrincipalID != ownerID || store.authority.SessionID != sessionID {
		return nil, ErrExecutionNotFound
	}
	authority := *store.authority
	if authority.Permissions == nil {
		authority.Permissions = cloneExecutionPermissions(workspaceOwnerExecutionPermissions)
	}
	return &authority, nil
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
	canaries     []string
	principal    backendenvironment.PrincipalSession
	grant        backendenvironment.IssueGrantInput
	use          backendenvironment.UseSecretInput
	revokedGrant string
	grantCount   int
	useCount     int
	revokeCount  int
}

func (environment *fakeDataGatewayEnvironment) Available() bool { return true }

func (environment *fakeDataGatewayEnvironment) GetSnapshot(_ context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string) (*backendenvironment.Snapshot, error) {
	expectedPrincipal := environment.principal
	if expectedPrincipal.PrincipalID == "" {
		expectedPrincipal = backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}
	}
	if principal != expectedPrincipal || workspaceID != "workspace-1" || environmentID != "environment-1" || revision != "revision-7" {
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
	environment.grantCount++
	return &backendenvironment.Grant{GrantID: fmt.Sprintf("grant-%d", environment.grantCount)}, nil
}

func (environment *fakeDataGatewayEnvironment) UseSecret(_ context.Context, input backendenvironment.UseSecretInput, consumer func([]byte) error) error {
	environment.use = input
	material := environment.canary
	if environment.useCount < len(environment.canaries) {
		material = environment.canaries[environment.useCount]
	}
	environment.useCount++
	return consumer([]byte(material))
}

func (environment *fakeDataGatewayEnvironment) RevokeGrant(_ context.Context, grantID string, _ backendenvironment.PrincipalSession) error {
	environment.revokedGrant = grantID
	environment.revokeCount++
	return nil
}

type fakeDataGatewayTransport struct {
	requests        []DataGatewayTransportRequest
	response        *DataGatewayTransportResponse
	err             error
	streamResponse  *DataGatewayStreamTransportResponse
	streamResponses []*DataGatewayStreamTransportResponse
	streamErr       error
}

func (transport *fakeDataGatewayTransport) OpenStream(_ context.Context, request DataGatewayTransportRequest) (*DataGatewayStreamTransportResponse, error) {
	copyRequest := request
	copyRequest.Headers = map[string]string{}
	for name, value := range request.Headers {
		copyRequest.Headers[name] = value
	}
	transport.requests = append(transport.requests, copyRequest)
	if len(transport.streamResponses) > 0 {
		response := transport.streamResponses[0]
		transport.streamResponses = transport.streamResponses[1:]
		return response, transport.streamErr
	}
	return transport.streamResponse, transport.streamErr
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

func remoteMappedDataDocument() []byte {
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
      "baseUrl": {"kind":"environment-ref","reference":{"bindingId":"api-url"}}
    }
  },
  "schemasById": {},
  "operationsById": {
    "read": {
      "id": "read",
      "kind": "query",
      "outputSchemaId": "item",
      "configurationByKey": {
        "method": {"kind":"literal","value":"GET"},
        "path": {"kind":"literal","value":"/items/{id}"},
        "parameterMappings": {"kind":"literal","value":{"path":{"id":"/id"},"query":{"include":"/include"},"header":{"x-trace-id":"/trace"}}},
        "responseBodyPath": {"kind":"literal","value":"/data"},
        "authorization": {"kind":"secret-ref","reference":{"bindingId":"api-token"}},
        "emptyWhen": {"kind":"literal","value":"never"}
      },
      "policies": {}
    }
  }
}`)
}

func remoteIdempotentMutationDocument() []byte {
	return []byte(strings.NewReplacer(
		`"emptyWhen": {"kind":"literal","value":"never"}`,
		`"emptyWhen": {"kind":"literal","value":"never"}, "idempotencyHeader": {"kind":"literal","value":"idempotency-key"}`,
		`"policies": {}`,
		`"policies": {"idempotency":{"kind":"invocation-key"},"retry":{"maxAttempts":2,"backoff":"fixed","initialDelayMs":0}}`,
	).Replace(string(remoteMutationDocument())))
}

func remoteGraphQLDocument() []byte {
	return []byte(`{
  "wireVersion": 1,
  "source": {
    "id": "catalog-graphql",
    "adapterId": "core.graphql",
    "runtimeZone": "edge",
    "bindingsById": {
      "api-url": {"kind":"environment-ref","reference":{"bindingId":"api-url"}},
      "api-token": {"kind":"secret-ref","reference":{"bindingId":"api-token"}}
    },
    "configurationByKey": {
      "endpoint": {"kind":"environment-ref","reference":{"bindingId":"api-url"}},
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
        "document": {"kind":"literal","value":"query ListProducts($page: Int) { products(page: $page) { id } }"},
        "operationName": {"kind":"literal","value":"ListProducts"},
        "resultPath": {"kind":"literal","value":"/products"},
        "emptyWhen": {"kind":"literal","value":"empty-array"}
      },
      "policies": {}
    }
  }
}`)
}

func remoteAsyncAPIDocument(action string) []byte {
	kind := "query"
	operationID := "lookup"
	policies := `{}`
	extra := `,"responseBodyPath":{"kind":"literal","value":"/payload"},"emptyWhen":{"kind":"literal","value":"never"}`
	if action == "publish" {
		kind = "mutation"
		operationID = "publish"
		policies = `{"idempotency":{"kind":"invocation-key"},"retry":{"maxAttempts":2,"backoff":"fixed","initialDelayMs":0}}`
		extra = `,"idempotencyHeader":{"kind":"literal","value":"idempotency-key"}`
	}
	return []byte(fmt.Sprintf(`{
  "wireVersion": 1,
  "source": {
    "id": "events",
    "adapterId": "core.asyncapi",
    "runtimeZone": "server",
    "bindingsById": {"api-url":{"kind":"environment-ref","reference":{"bindingId":"api-url"}}},
    "configurationByKey": {"endpoint":{"kind":"environment-ref","reference":{"bindingId":"api-url"}}}
  },
  "schemasById": {},
  "operationsById": {
    %q: {
      "id": %q,
      "kind": %q,
      "outputSchemaId": "result",
      "configurationByKey": {"action":{"kind":"literal","value":%q},"path":{"kind":"literal","value":"/events/products"}%s},
      "policies": %s
    }
  }
}`, operationID, operationID, kind, action, extra, policies))
}

func remoteGraphQLSubscriptionDocument() []byte {
	return []byte(`{
  "wireVersion": 1,
  "source": {
    "id": "catalog-graphql",
    "adapterId": "core.graphql",
    "runtimeZone": "edge",
    "bindingsById": {"api-url":{"kind":"environment-ref","reference":{"bindingId":"api-url"}}},
    "configurationByKey": {"endpoint":{"kind":"environment-ref","reference":{"bindingId":"api-url"}}}
  },
  "schemasById": {},
  "operationsById": {
    "watch": {
      "id": "watch",
      "kind": "subscription",
      "outputSchemaId": "event",
      "configurationByKey": {
        "document": {"kind":"literal","value":"subscription WatchProducts { products { id } }"},
        "operationName": {"kind":"literal","value":"WatchProducts"},
        "resultPath": {"kind":"literal","value":"/products"}
      },
      "policies": {}
    }
  }
}`)
}

func remoteGraphQLResumableSecretSubscriptionDocument() []byte {
	return []byte(`{
  "wireVersion": 1,
  "source": {
    "id": "catalog-graphql",
    "adapterId": "core.graphql",
    "runtimeZone": "edge",
    "bindingsById": {
      "api-url":{"kind":"environment-ref","reference":{"bindingId":"api-url"}},
      "api-token":{"kind":"secret-ref","reference":{"bindingId":"api-token"}}
    },
    "configurationByKey": {
      "endpoint":{"kind":"environment-ref","reference":{"bindingId":"api-url"}},
      "authorization":{"kind":"secret-ref","reference":{"bindingId":"api-token"}}
    }
  },
  "schemasById": {},
  "operationsById": {
    "watch": {
      "id": "watch",
      "kind": "subscription",
      "outputSchemaId": "event",
      "configurationByKey": {
        "document": {"kind":"literal","value":"subscription WatchProducts { products { id } }"},
        "operationName": {"kind":"literal","value":"WatchProducts"},
        "resultPath": {"kind":"literal","value":"/products"}
      },
      "policies": {
        "stream": {
          "reconnect": {
            "resume": "sse-last-event-id",
            "maxReconnectAttempts": 2,
            "backoff": "fixed",
            "initialDelayMs": 0
          },
          "credentialRenewal": "per-connection",
          "collection": {
            "kind": "keyed-event-v1",
            "entityIdPath": "/id",
            "maxItems": 100
          }
        }
      }
    }
  }
}`)
}

func remoteAsyncAPIStreamDocument() []byte {
	return []byte(`{
  "wireVersion": 1,
  "source": {
    "id": "events",
    "adapterId": "core.asyncapi",
    "runtimeZone": "server",
    "bindingsById": {"api-url":{"kind":"environment-ref","reference":{"bindingId":"api-url"}}},
    "configurationByKey": {"endpoint":{"kind":"environment-ref","reference":{"bindingId":"api-url"}}}
  },
  "schemasById": {},
  "operationsById": {
    "watch": {
      "id": "watch",
      "kind": "subscription",
      "outputSchemaId": "event",
      "configurationByKey": {
        "action": {"kind":"literal","value":"receive"},
        "path": {"kind":"literal","value":"/events/products"},
        "responseBodyPath": {"kind":"literal","value":"/payload"}
      },
      "policies": {}
    }
  }
}`)
}

func newProtocolGatewayStore(document []byte) *fakeDataGatewayStore {
	return &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document:        document,
		replayAvailable: true,
	}
}

func TestDataGatewayExecutesGraphQLServerEdgeWithExactProtocolAndSourceTrace(t *testing.T) {
	canary := "secret-canary-graphql-gateway"
	transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 200, Body: []byte(`{"data":{"products":[]}}`)}}
	gateway := NewDataGateway(newProtocolGatewayStore(remoteGraphQLDocument()), &fakeDataGatewayEnvironment{canary: canary}, transport)
	result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "list", DataGatewayInvocation{
		InvocationID: "graphql-query", Sequence: 7, Attempt: 1, Input: json.RawMessage(`{"page":2}`),
	})
	if err != nil || result == nil {
		t.Fatalf("invoke GraphQL gateway: result=%#v err=%v", result, err)
	}
	if len(transport.requests) != 1 || transport.requests[0].Method != "POST" || transport.requests[0].URL != "https://api.example.test/v1/" || transport.requests[0].Headers["authorization"] != canary {
		t.Fatalf("GraphQL transport projection drifted: %#v", transport.requests)
	}
	var body map[string]any
	if json.Unmarshal(transport.requests[0].Body, &body) != nil || body["operationName"] != "ListProducts" {
		t.Fatalf("GraphQL request envelope drifted: %s", transport.requests[0].Body)
	}
	if !result.Empty || result.Network.Adapter != "core.graphql" || result.Network.RuntimeZone != "edge" || len(result.Network.SourceTrace) != 1 || result.Network.SourceTrace[0].SourceRef.OperationID != "list" {
		t.Fatalf("GraphQL result projection drifted: %#v", result)
	}
	encoded, _ := json.Marshal(result)
	if bytes.Contains(encoded, []byte(canary)) || bytes.Contains(encoded, []byte("page\":2")) {
		t.Fatalf("GraphQL material escaped sanitized result: %s", encoded)
	}
}

func TestDataGatewayExecutesAsyncAPIRequestReplyAndFencesPublish(t *testing.T) {
	principal := backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}
	requestTransport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 200, Body: []byte(`{"payload":{"id":"p1"}}`)}}
	requestGateway := NewDataGateway(newProtocolGatewayStore(remoteAsyncAPIDocument("request-reply")), &fakeDataGatewayEnvironment{}, requestTransport)
	requestResult, err := requestGateway.Invoke(t.Context(), principal, "execution-1", "data-1", "lookup", DataGatewayInvocation{InvocationID: "async-query", Sequence: 1, Attempt: 1, Input: json.RawMessage(`{"id":"p1"}`)})
	if err != nil || requestResult == nil || requestResult.Network.Adapter != "core.asyncapi" || fmt.Sprint(requestResult.Value) != "map[id:p1]" {
		t.Fatalf("AsyncAPI request-reply drifted: result=%#v err=%v", requestResult, err)
	}

	publishStore := newProtocolGatewayStore(remoteAsyncAPIDocument("publish"))
	publishTransport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 202, Body: nil}}
	publishGateway := NewDataGateway(publishStore, &fakeDataGatewayEnvironment{}, publishTransport)
	invocation := DataGatewayInvocation{InvocationID: "async-publish", Sequence: 2, Attempt: 1, Input: json.RawMessage(`{"id":"p1"}`)}
	publishResult, err := publishGateway.Invoke(t.Context(), principal, "execution-1", "data-1", "publish", invocation)
	if err != nil || publishResult == nil || publishResult.Value != true || len(publishTransport.requests) != 1 || publishTransport.requests[0].Headers["idempotency-key"] == "" {
		t.Fatalf("AsyncAPI publish drifted: result=%#v requests=%#v err=%v", publishResult, publishTransport.requests, err)
	}
	replayed, err := publishGateway.Invoke(t.Context(), principal, "execution-1", "data-1", "publish", invocation)
	if err != nil || replayed == nil || len(publishTransport.requests) != 1 {
		t.Fatalf("AsyncAPI publish replay crossed transport: result=%#v requests=%d err=%v", replayed, len(publishTransport.requests), err)
	}
}

func TestDataGatewayStreamsGraphQLSSEWithCursorBudgetAndIdentityFence(t *testing.T) {
	transport := &fakeDataGatewayTransport{streamResponse: &DataGatewayStreamTransportResponse{
		Status: 200, ContentType: "text/event-stream; charset=utf-8",
		Body: io.NopCloser(strings.NewReader("event: next\ndata: {\"data\":{\"products\":[{\"id\":\"p1\"}]}}\n\nevent: complete\n\n")),
	}}
	gateway := NewDataGateway(newProtocolGatewayStore(remoteGraphQLSubscriptionDocument()), &fakeDataGatewayEnvironment{}, transport)
	principal := backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}
	invocation := DataGatewayInvocation{InvocationID: "graphql-stream", Sequence: 3, Attempt: 1, Input: json.RawMessage(`{}`)}
	stream, err := gateway.OpenStream(t.Context(), principal, "execution-1", "data-1", "watch", invocation)
	if err != nil || stream == nil || stream.Network.Adapter != "core.graphql" || stream.Network.RuntimeZone != "edge" {
		t.Fatalf("open GraphQL stream: stream=%#v err=%v", stream, err)
	}
	if duplicate, duplicateErr := gateway.OpenStream(t.Context(), principal, "execution-1", "data-1", "watch", invocation); duplicate != nil || !errors.Is(duplicateErr, ErrDataGatewayStreamConflict) {
		t.Fatalf("duplicate stream identity was not fenced: stream=%#v err=%v", duplicate, duplicateErr)
	}
	event, complete, err := stream.Next(t.Context())
	if err != nil || complete || event.Cursor != 1 || fmt.Sprint(event.Value) != "[map[id:p1]]" {
		t.Fatalf("GraphQL stream event drifted: event=%#v complete=%v err=%v", event, complete, err)
	}
	if _, complete, err = stream.Next(t.Context()); err != nil || !complete {
		t.Fatalf("GraphQL stream completion drifted: complete=%v err=%v", complete, err)
	}
	if len(transport.requests) != 1 || transport.requests[0].Headers["accept"] != "text/event-stream" {
		t.Fatalf("GraphQL stream transport drifted: %#v", transport.requests)
	}
}

func TestDataGatewayResumesSSEAndRenewsSecretPerConnection(t *testing.T) {
	transport := &fakeDataGatewayTransport{streamResponses: []*DataGatewayStreamTransportResponse{
		{
			Status: 200, ContentType: "text/event-stream",
			Body: io.NopCloser(strings.NewReader("id: event-1\nevent: next\ndata: {\"data\":{\"products\":{\"action\":\"upsert\",\"entity\":{\"id\":\"p1\"}}}}\n\n")),
		},
		{
			Status: 200, ContentType: "text/event-stream",
			Body: io.NopCloser(strings.NewReader("id: event-2\nevent: next\ndata: {\"data\":{\"products\":{\"action\":\"delete\",\"id\":\"p1\"}}}\n\nevent: complete\n\n")),
		},
	}}
	environment := &fakeDataGatewayEnvironment{canaries: []string{"stream-token-one", "stream-token-two"}}
	gateway := NewDataGateway(newProtocolGatewayStore(remoteGraphQLResumableSecretSubscriptionDocument()), environment, transport)
	principal := backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}
	invocation := DataGatewayInvocation{InvocationID: "graphql-resume", Sequence: 4, Attempt: 1, Input: json.RawMessage(`{}`)}

	first, err := gateway.OpenStream(t.Context(), principal, "execution-1", "data-1", "watch", invocation)
	if err != nil || first == nil || first.resume == nil {
		t.Fatalf("open resumable stream: stream=%#v err=%v", first, err)
	}
	eventOne, complete, err := first.Next(t.Context())
	if err != nil || complete || eventOne.Resume == nil || eventOne.Resume.Cursor != 1 {
		t.Fatalf("first resumable event drifted: event=%#v complete=%v err=%v", eventOne, complete, err)
	}
	if _, complete, err = first.Next(t.Context()); !complete || !errors.Is(err, ErrDataGatewayGraphQLUpstream) {
		t.Fatalf("unexpected SSE disconnect did not request reconnect: complete=%v err=%v", complete, err)
	}
	checkpointParts := strings.Split(eventOne.Resume.Token, ".")
	if len(checkpointParts) != 2 {
		t.Fatalf("signed checkpoint envelope drifted: token=%q", eventOne.Resume.Token)
	}
	checkpointPayload, decodeErr := base64.RawURLEncoding.DecodeString(checkpointParts[0])
	if decodeErr != nil || len(checkpointPayload) == 0 {
		t.Fatalf("signed checkpoint envelope drifted: token=%q err=%v", eventOne.Resume.Token, decodeErr)
	}
	checkpointPayload[len(checkpointPayload)-1] ^= 1
	tamperedInvocation := invocation
	tamperedInvocation.Resume = &DataGatewayStreamResume{
		Cursor: eventOne.Resume.Cursor,
		Token:  base64.RawURLEncoding.EncodeToString(checkpointPayload) + "." + checkpointParts[1],
	}
	if resumed, resumeErr := gateway.OpenStream(t.Context(), principal, "execution-1", "data-1", "watch", tamperedInvocation); resumed != nil || !errors.Is(resumeErr, ErrDataGatewayStreamConflict) {
		t.Fatalf("HMAC-invalid checkpoint was accepted: stream=%#v err=%v", resumed, resumeErr)
	}

	invocation.Resume = eventOne.Resume
	second, err := gateway.OpenStream(t.Context(), principal, "execution-1", "data-1", "watch", invocation)
	if err != nil || second == nil {
		t.Fatalf("resume stream: stream=%#v err=%v", second, err)
	}
	eventTwo, complete, err := second.Next(t.Context())
	if err != nil || complete || eventTwo.Cursor != 2 || eventTwo.Resume == nil {
		t.Fatalf("resumed event drifted: event=%#v complete=%v err=%v", eventTwo, complete, err)
	}
	if _, complete, err = second.Next(t.Context()); err != nil || !complete {
		t.Fatalf("resumed completion drifted: complete=%v err=%v", complete, err)
	}
	if len(transport.requests) != 2 || transport.requests[0].Headers["authorization"] != "stream-token-one" || transport.requests[1].Headers["authorization"] != "stream-token-two" || transport.requests[1].Headers["last-event-id"] != "event-1" {
		t.Fatalf("resume transport or credential renewal drifted: %#v", transport.requests)
	}
	if environment.grantCount != 2 || environment.useCount != 2 || environment.revokeCount != 2 {
		t.Fatalf("per-connection Secret lifecycle drifted: grants=%d uses=%d revokes=%d", environment.grantCount, environment.useCount, environment.revokeCount)
	}
	if first.Network.RequestID != "graphql-resume:stream:0" || second.Network.RequestID != "graphql-resume:stream:1" {
		t.Fatalf("reconnect Network identities drifted: first=%q second=%q", first.Network.RequestID, second.Network.RequestID)
	}
	encoded, _ := json.Marshal([]any{eventOne, eventTwo, first.Network, second.Network})
	for _, forbidden := range []string{"stream-token-one", "stream-token-two", "event-1", "event-2"} {
		if bytes.Contains(encoded, []byte(forbidden)) {
			t.Fatalf("resumable stream projection leaked %q: %s", forbidden, encoded)
		}
	}
}

func TestDataGatewayResumableStreamRejectsCredentialEchoAndCheckpointDrift(t *testing.T) {
	transport := &fakeDataGatewayTransport{streamResponse: &DataGatewayStreamTransportResponse{
		Status: 200, ContentType: "text/event-stream",
		Body: io.NopCloser(strings.NewReader("id: event-1\nevent: next\ndata: {\"data\":{\"products\":\"stream-token-canary\"}}\n\n")),
	}}
	gateway := NewDataGateway(newProtocolGatewayStore(remoteGraphQLResumableSecretSubscriptionDocument()), &fakeDataGatewayEnvironment{canary: "stream-token-canary"}, transport)
	principal := backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}
	invocation := DataGatewayInvocation{InvocationID: "graphql-secret-echo", Sequence: 5, Attempt: 1, Input: json.RawMessage(`{}`)}
	stream, err := gateway.OpenStream(t.Context(), principal, "execution-1", "data-1", "watch", invocation)
	if err != nil {
		t.Fatalf("open credential echo probe: %v", err)
	}
	if _, _, err = stream.Next(t.Context()); !errors.Is(err, ErrDataGatewayGraphQLUpstream) {
		t.Fatalf("credential echo was not rejected: %v", err)
	}

	invocation.Resume = &DataGatewayStreamResume{Cursor: 1, Token: "tampered-checkpoint"}
	if resumed, resumeErr := gateway.OpenStream(t.Context(), principal, "execution-1", "data-1", "watch", invocation); resumed != nil || !errors.Is(resumeErr, ErrDataGatewayStreamConflict) {
		t.Fatalf("tampered checkpoint was accepted: stream=%#v err=%v", resumed, resumeErr)
	}
}

func TestDataGatewayResumableHandlerProjectsPrivateRecoveryEnvelope(t *testing.T) {
	transport := &fakeDataGatewayTransport{streamResponse: &DataGatewayStreamTransportResponse{
		Status: 200, ContentType: "text/event-stream",
		Body: io.NopCloser(strings.NewReader("id: event-private-1\nevent: next\ndata: {\"data\":{\"products\":{\"action\":\"upsert\",\"entity\":{\"id\":\"p1\"}}}}\n\n")),
	}}
	handler := &Handler{dataGateway: NewDataGateway(newProtocolGatewayStore(remoteGraphQLResumableSecretSubscriptionDocument()), &fakeDataGatewayEnvironment{canary: "private-stream-credential"}, transport)}
	router := testRouterSession(handler, "user-1", "session-1")
	path := "/api/remote-executions/execution-1/data-sources/data-1/operations/watch/stream"
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(`{"invocationId":"graphql-handler-resume","sequence":8,"attempt":1,"input":{}}`)))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/x-ndjson" {
		t.Fatalf("resumable handler response drifted: status=%d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
	}
	lines := strings.Split(strings.TrimSpace(response.Body.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("resumable handler record count drifted: %q", lines)
	}
	var openRecord, eventRecord, errorRecord map[string]any
	if json.Unmarshal([]byte(lines[0]), &openRecord) != nil || json.Unmarshal([]byte(lines[1]), &eventRecord) != nil || json.Unmarshal([]byte(lines[2]), &errorRecord) != nil {
		t.Fatalf("resumable handler emitted invalid NDJSON: %q", lines)
	}
	if len(openRecord) != 4 || openRecord["phase"] != "open" || openRecord["reconnect"] == nil || len(eventRecord) != 5 || eventRecord["phase"] != "event" || eventRecord["resume"] == nil || len(errorRecord) != 3 || errorRecord["phase"] != "error" || errorRecord["code"] != "DATA_GRAPHQL_REQUEST_FAILED" {
		t.Fatalf("resumable handler private envelope drifted: open=%#v event=%#v error=%#v", openRecord, eventRecord, errorRecord)
	}
	if strings.Contains(response.Body.String(), "private-stream-credential") || strings.Contains(response.Body.String(), "event-private-1") {
		t.Fatalf("resumable handler leaked credential or upstream cursor: %s", response.Body.String())
	}
}

func TestDataGatewayStreamsAsyncAPINDJSONAndHandlerKeepsStrictEnvelope(t *testing.T) {
	transport := &fakeDataGatewayTransport{streamResponse: &DataGatewayStreamTransportResponse{
		Status: 200, ContentType: "application/x-ndjson",
		Body: io.NopCloser(strings.NewReader("{\"payload\":{\"id\":\"p1\"}}\n{\"payload\":{\"id\":\"p2\"}}\n")),
	}}
	gateway := NewDataGateway(newProtocolGatewayStore(remoteAsyncAPIStreamDocument()), &fakeDataGatewayEnvironment{}, transport)
	handler := &Handler{dataGateway: gateway}
	router := testRouterSession(handler, "user-1", "session-1")
	path := "/api/remote-executions/execution-1/data-sources/data-1/operations/watch/stream"
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(`{"invocationId":"async-stream","sequence":1,"attempt":1,"input":{}}`)))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/x-ndjson" || response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("unsafe stream response: status=%d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
	}
	lines := strings.Split(strings.TrimSpace(response.Body.String()), "\n")
	if len(lines) != 4 || !strings.Contains(lines[0], `"phase":"open"`) || !strings.Contains(lines[1], `"cursor":1`) || !strings.Contains(lines[2], `"cursor":2`) || !strings.Contains(lines[3], `"phase":"complete"`) {
		t.Fatalf("stream envelope drifted: %q", lines)
	}
	if strings.Contains(response.Body.String(), "api-url") || strings.Contains(response.Body.String(), "/events/products") {
		t.Fatalf("stream response leaked configuration: %s", response.Body.String())
	}
}

func TestDataGatewayProtocolJSONDecoderRejectsTrailingAndStructuralOverflow(t *testing.T) {
	if _, err := decodeDataGatewayJSON([]byte(`{"data":{}} trailing`)); !errors.Is(err, ErrDataGatewayUpstream) {
		t.Fatalf("trailing protocol bytes were accepted: %v", err)
	}
	deep := strings.Repeat("[", maximumDataGatewayJSONDepth+1) + "null" + strings.Repeat("]", maximumDataGatewayJSONDepth+1)
	if _, err := decodeDataGatewayJSON([]byte(deep)); !errors.Is(err, ErrDataGatewayUpstream) {
		t.Fatalf("deep upstream payload was not mapped to a safe upstream failure: %v", err)
	}
	if _, err := decodeInvocationInput(json.RawMessage(`{} {}`)); !errors.Is(err, ErrDataGatewayInvalidRequest) {
		t.Fatalf("trailing invocation bytes were accepted: %v", err)
	}
}

func TestDataGatewayExecutesExactSnapshotWithCallbackOnlySecret(t *testing.T) {
	canary := "secret-canary-remote-live-7f0c"
	store := &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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

func TestDataGatewayExecutesImportedParameterAndResponseMappings(t *testing.T) {
	canary := "secret-canary-openapi-mapping"
	store := &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteMappedDataDocument(),
	}
	environments := &fakeDataGatewayEnvironment{canary: canary}
	transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 200, Body: []byte(`{"data":{"id":"a/b"},"ignored":"private"}`)}}
	gateway := NewDataGateway(store, environments, transport)
	result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-1", "data-1", "read", DataGatewayInvocation{
		InvocationID: "openapi-read", Sequence: 1, Attempt: 1, Input: json.RawMessage(`{"id":"a/b","include":"details","trace":"trace-1","localOnly":"must-not-leak"}`),
	})
	if err != nil {
		t.Fatalf("invoke imported Remote Data mapping: %v", err)
	}
	if len(transport.requests) != 1 || transport.requests[0].URL != "https://api.example.test/items/a%2Fb?include=details" || transport.requests[0].Headers["x-trace-id"] != "trace-1" || transport.requests[0].Headers["authorization"] != canary {
		t.Fatalf("imported request mapping drifted: %#v", transport.requests)
	}
	encodedRequest, _ := json.Marshal(transport.requests[0])
	if bytes.Contains(encodedRequest, []byte("must-not-leak")) {
		t.Fatalf("unmapped input reached transport: %s", encodedRequest)
	}
	encodedResult, _ := json.Marshal(result.Value)
	if string(encodedResult) != `{"id":"a/b"}` || environments.use.Field != "operation.authorization" {
		t.Fatalf("imported response or Secret field drifted: value=%s use=%#v", encodedResult, environments.use)
	}
}

func TestDataGatewayEnforcesDurableReadOnlyExecutionPermissionsBeforeEffect(t *testing.T) {
	store := &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-viewer", WorkspaceID: "workspace-1", PrincipalID: "viewer-1", SessionID: "session-viewer", Permissions: []string{workspaceReadPermissionID}, ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
			PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
			Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
		},
		document: remoteDataDocument(),
	}
	transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 200, Body: []byte(`{"items":[]}`)}}
	principal := backendenvironment.PrincipalSession{PrincipalID: "viewer-1", SessionID: "session-viewer"}
	gateway := NewDataGateway(store, &fakeDataGatewayEnvironment{principal: principal}, transport)
	if _, err := gateway.Invoke(t.Context(), principal, "execution-viewer", "data-1", "list", DataGatewayInvocation{InvocationID: "viewer-query", Attempt: 1, Input: json.RawMessage(`{}`)}); err != nil || len(transport.requests) != 1 {
		t.Fatalf("workspace.read query was not authorized exactly: requests=%d err=%v", len(transport.requests), err)
	}

	store.document = remoteMutationDocument()
	if result, err := gateway.Invoke(t.Context(), principal, "execution-viewer", "data-1", "create", DataGatewayInvocation{InvocationID: "viewer-mutation", Attempt: 1, Input: json.RawMessage(`{"name":"Desk"}`)}); result != nil || !errors.Is(err, ErrDataGatewayDenied) || len(transport.requests) != 1 {
		t.Fatalf("workspace.read reached a mutation effect: result=%#v requests=%d err=%v", result, len(transport.requests), err)
	}
}

func TestDataGatewayAllowsLiveEffectsOnlyForExactRemotePreviewClass(t *testing.T) {
	base := ExecutionAuthority{
		ExecutionID: "execution-class", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1",
		Permissions: []string{workspaceOwnerPermissionID, workspaceReadPermissionID, workspaceWritePermissionID},
		ProviderID:  "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
		PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
		Environment:        &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
	}
	for _, testCase := range []struct {
		name        string
		providerID  string
		profile     string
		runtimeZone string
	}{
		{name: "remote-test", providerID: "prodivix.remote.test", profile: "test", runtimeZone: "test"},
		{name: "remote-build", providerID: "prodivix.remote.build", profile: "build", runtimeZone: "build"},
		{name: "profile-drift", providerID: "prodivix.remote.preview", profile: "test", runtimeZone: "client"},
		{name: "zone-drift", providerID: "prodivix.remote.preview", profile: "preview", runtimeZone: "test"},
		{name: "legacy-unbound"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			authority := base
			authority.ProviderID = testCase.providerID
			authority.Profile = testCase.profile
			authority.RuntimeZone = testCase.runtimeZone
			transport := &fakeDataGatewayTransport{response: &DataGatewayTransportResponse{Status: 200, Body: []byte(`{"items":[]}`)}}
			gateway := NewDataGateway(
				&fakeDataGatewayStore{authority: &authority, document: remoteDataDocument()},
				&fakeDataGatewayEnvironment{},
				transport,
			)
			result, err := gateway.Invoke(t.Context(), backendenvironment.PrincipalSession{PrincipalID: "user-1", SessionID: "session-1"}, "execution-class", "data-1", "list", DataGatewayInvocation{InvocationID: "class-check", Attempt: 1, Input: json.RawMessage(`{}`)})
			if result != nil || !errors.Is(err, ErrDataGatewayDenied) || len(transport.requests) != 0 {
				t.Fatalf("non-preview execution class reached live Data: result=%#v requests=%d err=%v", result, len(transport.requests), err)
			}
		})
	}
}

func TestDataGatewayFailsClosedBeforeTransportOnAuthorityOrZoneDrift(t *testing.T) {
	store := &fakeDataGatewayStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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
			ExecutionID: "execution-1", WorkspaceID: "workspace-1", PrincipalID: "user-1", SessionID: "session-1", ProviderID: "prodivix.remote.preview", Profile: "preview", RuntimeZone: "client", SnapshotID: "snapshot-1",
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
