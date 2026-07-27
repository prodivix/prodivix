package remoteexecution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"
	"unicode"

	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

const (
	maximumGraphQLDocumentBytes  = 128 * 1024
	maximumProtocolResponseBytes = 4 * 1024 * 1024
	maximumGraphQLErrors         = 64
)

type dataGatewayProtocolPlan struct {
	adapter      string
	request      DataGatewayTransportRequest
	decode       func(int, []byte) (any, bool, error)
	upstreamErr  error
	sanitizedURL string
}

func optionalDataGatewayString(configuration map[string]dataConfigurationValue, key string, field string, snapshot *backendenvironment.Snapshot, bindings map[string]dataConfigurationValue, fallback string) (string, error) {
	value, exists := configuration[key]
	if !exists {
		return fallback, nil
	}
	return resolvePublicString(value, field, snapshot, bindings)
}

func dataGatewayProtocolEndpoint(raw string) (*url.URL, error) {
	endpoint, err := url.Parse(raw)
	if err != nil || endpoint.Scheme != "https" || endpoint.Host == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return nil, ErrDataGatewayDenied
	}
	return endpoint, nil
}

func dataGatewayProtocolSourceTrace(documentID string, operationID string) []dataGatewaySourceTrace {
	return []dataGatewaySourceTrace{{
		SourceRef: dataGatewaySourceRef{Kind: "data-operation", DocumentID: documentID, OperationID: operationID},
		Label:     "Data operation",
	}}
}

func skipGraphQLIgnored(document string, offset int) int {
	for offset < len(document) {
		if unicode.IsSpace(rune(document[offset])) || document[offset] == ',' {
			offset++
			continue
		}
		if document[offset] == '#' {
			for offset < len(document) && document[offset] != '\n' && document[offset] != '\r' {
				offset++
			}
			continue
		}
		break
	}
	return offset
}

func readGraphQLName(document string, offset int) (string, int) {
	offset = skipGraphQLIgnored(document, offset)
	if offset >= len(document) || !((document[offset] >= 'A' && document[offset] <= 'Z') || (document[offset] >= 'a' && document[offset] <= 'z') || document[offset] == '_') {
		return "", offset
	}
	start := offset
	offset++
	for offset < len(document) && ((document[offset] >= 'A' && document[offset] <= 'Z') || (document[offset] >= 'a' && document[offset] <= 'z') || (document[offset] >= '0' && document[offset] <= '9') || document[offset] == '_') {
		offset++
	}
	return document[start:offset], offset
}

func skipGraphQLString(document string, offset int) (int, bool) {
	block := strings.HasPrefix(document[offset:], `"""`)
	if block {
		offset += 3
		for offset < len(document) {
			if strings.HasPrefix(document[offset:], `"""`) {
				return offset + 3, true
			}
			offset++
		}
		return offset, false
	}
	offset++
	for offset < len(document) {
		if document[offset] == '\\' {
			offset += 2
			continue
		}
		if document[offset] == '"' {
			return offset + 1, true
		}
		offset++
	}
	return offset, false
}

func validateGraphQLOperationDocument(document string, operationName string, expectedKind string) error {
	if document == "" || len([]byte(document)) > maximumGraphQLDocumentBytes {
		return ErrDataGatewayDenied
	}
	type operation struct{ kind, name string }
	operations := make([]operation, 0, 2)
	braceDepth, parenDepth, bracketDepth := 0, 0, 0
	for offset := 0; offset < len(document); {
		offset = skipGraphQLIgnored(document, offset)
		if offset >= len(document) {
			break
		}
		if document[offset] == '"' {
			next, ok := skipGraphQLString(document, offset)
			if !ok {
				return ErrDataGatewayDenied
			}
			offset = next
			continue
		}
		switch document[offset] {
		case '{':
			braceDepth++
			offset++
			continue
		case '}':
			braceDepth--
		case '(':
			parenDepth++
		case ')':
			parenDepth--
		case '[':
			bracketDepth++
		case ']':
			bracketDepth--
		}
		if braceDepth < 0 || parenDepth < 0 || bracketDepth < 0 {
			return ErrDataGatewayDenied
		}
		if document[offset] == '}' || document[offset] == '(' || document[offset] == ')' || document[offset] == '[' || document[offset] == ']' {
			offset++
			continue
		}
		name, next := readGraphQLName(document, offset)
		if name == "" {
			offset++
			continue
		}
		offset = next
		if braceDepth == 0 && parenDepth == 0 && bracketDepth == 0 && (name == "query" || name == "mutation" || name == "subscription") {
			operationNameValue, operationEnd := readGraphQLName(document, offset)
			if operationNameValue == "" {
				return ErrDataGatewayDenied
			}
			operations = append(operations, operation{kind: name, name: operationNameValue})
			offset = operationEnd
		}
	}
	if braceDepth != 0 || parenDepth != 0 || bracketDepth != 0 || len(operations) != 1 || operations[0].kind != expectedKind || (operationName != "" && operations[0].name != operationName) {
		return ErrDataGatewayDenied
	}
	return nil
}

func decodeDataGatewayJSON(body []byte) (any, error) {
	if len(body) == 0 || len(body) > maximumProtocolResponseBytes {
		return nil, ErrDataGatewayUpstream
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var value any
	if decoder.Decode(&value) != nil {
		return nil, ErrDataGatewayUpstream
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, ErrDataGatewayUpstream
	}
	normalized, err := normalizeJSONNumbers(value)
	if err != nil {
		return nil, ErrDataGatewayUpstream
	}
	return normalized, nil
}

func prepareGraphQLGatewayPlan(document dataGatewayDocument, operation dataGatewayOperation, snapshot *backendenvironment.Snapshot, input any) (*dataGatewayProtocolPlan, error) {
	endpointText, err := resolvePublicString(document.Source.ConfigurationByKey["endpoint"], "source.endpoint", snapshot, document.Source.BindingsByID)
	if err != nil {
		return nil, err
	}
	endpoint, err := dataGatewayProtocolEndpoint(endpointText)
	if err != nil {
		return nil, err
	}
	operationDocument, err := resolvePublicString(operation.ConfigurationByKey["document"], "operation.document", snapshot, document.Source.BindingsByID)
	if err != nil {
		return nil, err
	}
	operationName, err := optionalDataGatewayString(operation.ConfigurationByKey, "operationName", "operation.operationName", snapshot, document.Source.BindingsByID, "")
	if err != nil || validateGraphQLOperationDocument(operationDocument, operationName, operation.Kind) != nil {
		return nil, ErrDataGatewayDenied
	}
	variables := input
	if pointer, exists := operation.ConfigurationByKey["variablesInputPath"]; exists {
		path, resolveErr := resolvePublicString(pointer, "operation.variablesInputPath", snapshot, document.Source.BindingsByID)
		if resolveErr != nil || !isDataGatewayJSONPointer(path) {
			return nil, ErrDataGatewayDenied
		}
		var found bool
		variables, found, err = dataGatewayPointer(input, path)
		if err != nil || !found {
			return nil, ErrDataGatewayInvalidRequest
		}
	}
	if _, ok := variables.(map[string]any); !ok {
		return nil, ErrDataGatewayInvalidRequest
	}
	body, err := json.Marshal(map[string]any{"query": operationDocument, "variables": variables})
	if operationName != "" {
		var envelope map[string]any
		_ = json.Unmarshal(body, &envelope)
		envelope["operationName"] = operationName
		body, err = json.Marshal(envelope)
	}
	if err != nil || int64(len(body)) > maximumDataGatewayRequestBytes {
		return nil, ErrDataGatewayInvalidRequest
	}
	partialPolicy, err := optionalDataGatewayString(operation.ConfigurationByKey, "partialErrorPolicy", "operation.partialErrorPolicy", snapshot, document.Source.BindingsByID, "reject")
	if err != nil || (partialPolicy != "reject" && partialPolicy != "allow-partial") {
		return nil, ErrDataGatewayDenied
	}
	emptyWhen, err := optionalDataGatewayString(operation.ConfigurationByKey, "emptyWhen", "operation.emptyWhen", snapshot, document.Source.BindingsByID, "never")
	if err != nil || (emptyWhen != "never" && emptyWhen != "null" && emptyWhen != "empty-array") {
		return nil, ErrDataGatewayDenied
	}
	resultPath, err := optionalDataGatewayString(operation.ConfigurationByKey, "resultPath", "operation.resultPath", snapshot, document.Source.BindingsByID, "")
	if err != nil || (resultPath != "" && !isDataGatewayJSONPointer(resultPath)) {
		return nil, ErrDataGatewayDenied
	}
	return &dataGatewayProtocolPlan{
		adapter:      "core.graphql",
		request:      DataGatewayTransportRequest{URL: endpoint.String(), Method: "POST", Headers: map[string]string{"accept": "application/graphql-response+json, application/json", "content-type": "application/json"}, Body: body},
		upstreamErr:  ErrDataGatewayGraphQLUpstream,
		sanitizedURL: endpoint.Scheme + "://" + endpoint.Host + "/",
		decode: func(_ int, responseBody []byte) (any, bool, error) {
			decoded, decodeErr := decodeDataGatewayJSON(responseBody)
			if decodeErr != nil {
				return nil, false, decodeErr
			}
			envelope, ok := decoded.(map[string]any)
			if !ok {
				return nil, false, ErrDataGatewayUpstream
			}
			if errorsValue, exists := envelope["errors"]; exists {
				errorsList, valid := errorsValue.([]any)
				if !valid || len(errorsList) > maximumGraphQLErrors {
					return nil, false, ErrDataGatewayUpstream
				}
				for _, item := range errorsList {
					record, valid := item.(map[string]any)
					message, hasMessage := record["message"].(string)
					if !valid || !hasMessage || message == "" {
						return nil, false, ErrDataGatewayUpstream
					}
				}
				if len(errorsList) > 0 && partialPolicy == "reject" {
					return nil, false, ErrDataGatewayUpstream
				}
			}
			value, exists := envelope["data"]
			if !exists {
				return nil, false, ErrDataGatewayUpstream
			}
			if resultPath != "" {
				var found bool
				value, found, decodeErr = dataGatewayPointer(value, resultPath)
				if decodeErr != nil || !found {
					return nil, false, ErrDataGatewayUpstream
				}
			}
			empty := (emptyWhen == "null" && value == nil)
			if emptyWhen == "empty-array" {
				items, ok := value.([]any)
				empty = ok && len(items) == 0
			}
			return value, empty, nil
		},
	}, nil
}

func prepareAsyncAPIGatewayPlan(document dataGatewayDocument, operation dataGatewayOperation, snapshot *backendenvironment.Snapshot, input any) (*dataGatewayProtocolPlan, error) {
	baseURL, err := resolvePublicString(document.Source.ConfigurationByKey["endpoint"], "source.endpoint", snapshot, document.Source.BindingsByID)
	if err != nil {
		return nil, err
	}
	path, err := resolvePublicString(operation.ConfigurationByKey["path"], "operation.path", snapshot, document.Source.BindingsByID)
	if err != nil {
		return nil, err
	}
	endpoint, err := dataGatewayEndpoint(baseURL, path)
	if err != nil {
		return nil, err
	}
	action, err := resolvePublicString(operation.ConfigurationByKey["action"], "operation.action", snapshot, document.Source.BindingsByID)
	if err != nil || (action != "publish" && action != "request-reply") || (action == "publish" && operation.Kind != "mutation") || (action == "request-reply" && operation.Kind != "query") {
		return nil, ErrDataGatewayDenied
	}
	bodyValue := input
	if pointer, exists := operation.ConfigurationByKey["bodyInputPath"]; exists {
		path, resolveErr := resolvePublicString(pointer, "operation.bodyInputPath", snapshot, document.Source.BindingsByID)
		if resolveErr != nil || !isDataGatewayJSONPointer(path) {
			return nil, ErrDataGatewayDenied
		}
		var found bool
		bodyValue, found, err = dataGatewayPointer(input, path)
		if err != nil || !found {
			return nil, ErrDataGatewayInvalidRequest
		}
	}
	body, err := json.Marshal(bodyValue)
	if err != nil || int64(len(body)) > maximumDataGatewayRequestBytes {
		return nil, ErrDataGatewayInvalidRequest
	}
	responsePath, err := optionalDataGatewayString(operation.ConfigurationByKey, "responseBodyPath", "operation.responseBodyPath", snapshot, document.Source.BindingsByID, "")
	if err != nil || (responsePath != "" && !isDataGatewayJSONPointer(responsePath)) {
		return nil, ErrDataGatewayDenied
	}
	emptyWhen, err := optionalDataGatewayString(operation.ConfigurationByKey, "emptyWhen", "operation.emptyWhen", snapshot, document.Source.BindingsByID, "never")
	if err != nil || (emptyWhen != "never" && emptyWhen != "null" && emptyWhen != "empty-array") {
		return nil, ErrDataGatewayDenied
	}
	return &dataGatewayProtocolPlan{
		adapter:      "core.asyncapi",
		request:      DataGatewayTransportRequest{URL: endpoint.String(), Method: "POST", Headers: map[string]string{"accept": "application/json", "content-type": "application/json"}, Body: body},
		upstreamErr:  ErrDataGatewayAsyncAPIUpstream,
		sanitizedURL: endpoint.Scheme + "://" + endpoint.Host + "/",
		decode: func(_ int, responseBody []byte) (any, bool, error) {
			if action == "publish" {
				return true, false, nil
			}
			value, decodeErr := decodeDataGatewayJSON(responseBody)
			if decodeErr != nil {
				return nil, false, decodeErr
			}
			if responsePath != "" {
				var found bool
				value, found, decodeErr = dataGatewayPointer(value, responsePath)
				if decodeErr != nil || !found {
					return nil, false, ErrDataGatewayUpstream
				}
			}
			empty := (emptyWhen == "null" && value == nil)
			if emptyWhen == "empty-array" {
				items, ok := value.([]any)
				empty = ok && len(items) == 0
			}
			return value, empty, nil
		},
	}, nil
}

func prepareDataGatewayProtocolPlan(document dataGatewayDocument, operation dataGatewayOperation, snapshot *backendenvironment.Snapshot, input any) (*dataGatewayProtocolPlan, error) {
	switch document.Source.AdapterID {
	case "core.graphql":
		return prepareGraphQLGatewayPlan(document, operation, snapshot, input)
	case "core.asyncapi":
		return prepareAsyncAPIGatewayPlan(document, operation, snapshot, input)
	default:
		return nil, ErrDataGatewayDenied
	}
}

// invokeProtocol executes finite GraphQL/AsyncAPI operations through the same authority, Secret and mutation replay boundary as HTTP.
func (gateway *DataGateway) invokeProtocol(ctx context.Context, principal backendenvironment.PrincipalSession, authority ExecutionAuthority, snapshot *backendenvironment.Snapshot, executionID string, documentID string, document dataGatewayDocument, operation dataGatewayOperation, invocation DataGatewayInvocation) (*DataGatewayResult, error) {
	input, err := decodeInvocationInput(invocation.Input)
	if err != nil {
		return nil, err
	}
	plan, err := prepareDataGatewayProtocolPlan(document, operation, snapshot, input)
	if err != nil {
		return nil, err
	}
	maximumAttempts := dataGatewayMaximumAttempts(operation)
	if invocation.Attempt > maximumAttempts {
		if operation.Kind == "query" {
			return nil, ErrDataGatewayInvalidRequest
		}
		return nil, ErrDataGatewayReplayUnsafe
	}
	if operation.Kind == "mutation" && invocation.Attempt > 1 && operation.Policies.Idempotency == nil {
		return nil, ErrDataGatewayReplayUnsafe
	}
	if operation.Policies.Idempotency != nil {
		header, headerErr := resolvePublicString(operation.ConfigurationByKey["idempotencyHeader"], "operation.idempotencyHeader", snapshot, document.Source.BindingsByID)
		if headerErr != nil || !dataGatewayHeaderToken(header) {
			return nil, ErrDataGatewayDenied
		}
		key, keyErr := dataGatewayUpstreamIdempotencyKey(authority, document, operation, documentID, invocation, input)
		if keyErr != nil {
			return nil, keyErr
		}
		plan.request.Headers[header] = key
	} else if _, exists := operation.ConfigurationByKey["idempotencyHeader"]; exists {
		return nil, ErrDataGatewayDenied
	}
	bindingID, secretField, secretHeader, hasSecret, err := secretDataGatewayHeader(document.Source, operation, snapshot)
	if err != nil {
		return nil, err
	}
	var replayKey DataGatewayMutationReplayKey
	var replayHash string
	mutationPending := false
	mutationResolved := false
	if operation.Kind == "mutation" {
		if gateway.replays == nil {
			return nil, ErrDataGatewayUnavailable
		}
		replayKey = DataGatewayMutationReplayKey{ExecutionID: executionID, DocumentID: documentID, OperationID: operation.ID, InvocationID: invocation.InvocationID, Sequence: invocation.Sequence, Adapter: plan.adapter}
		replayHash, err = dataGatewayMutationReplayHash(authority, document, operation, documentID, invocation, plan.request.URL, plan.request.Method, input)
		if err != nil {
			return nil, err
		}
		claim, claimErr := gateway.replays.ClaimDataGatewayMutation(ctx, replayKey, replayHash, DataGatewayMutationReplayPolicy{Attempt: invocation.Attempt, MaximumAttempts: maximumAttempts})
		if claimErr != nil {
			return nil, claimErr
		}
		if claim.Result != nil {
			return claim.Result, nil
		}
		if !claim.Acquired {
			return nil, ErrDataGatewayReplayConflict
		}
		mutationPending = true
		defer func() {
			if mutationPending && !mutationResolved {
				_ = gateway.replays.FenceDataGatewayMutation(context.Background(), replayKey, replayHash, invocation.Attempt)
			}
		}()
	}
	releaseMutationRetry := func() error {
		if operation.Kind != "mutation" || operation.Policies.Idempotency == nil || invocation.Attempt >= maximumAttempts {
			return plan.upstreamErr
		}
		if err := gateway.replays.ReleaseDataGatewayMutationRetry(context.Background(), replayKey, replayHash, invocation.Attempt); err != nil {
			return ErrDataGatewayReplayUnsafe
		}
		mutationResolved = true
		return plan.upstreamErr
	}
	startedAt := gateway.now().UnixMilli()
	var upstream *DataGatewayTransportResponse
	transportAttempted := false
	secretEchoDetected := false
	execute := func() error {
		transportAttempted = true
		var executeErr error
		upstream, executeErr = gateway.transport.Execute(ctx, plan.request)
		return executeErr
	}
	if hasSecret {
		resourceID := strings.Join([]string{executionID, documentID, operation.ID, invocation.InvocationID}, ":")
		grant, grantErr := gateway.environments.IssueGrant(ctx, backendenvironment.IssueGrantInput{
			Principal: principal, WorkspaceID: authority.WorkspaceID, EnvironmentID: snapshot.EnvironmentID, Revision: snapshot.Revision,
			ProviderID: remoteDataGatewayProviderID, ProviderIsolation: "sandboxed", ExecutionClass: "trusted-service", RuntimeZone: document.Source.RuntimeZone,
			PurposeKind: "data-operation", ResourceID: resourceID, SecretBindings: []backendenvironment.SecretBindingGrant{{BindingID: bindingID, Field: secretField}}, ExpiresAt: gateway.now().Add(30 * time.Second),
		})
		if grantErr != nil {
			return nil, ErrDataGatewayDenied
		}
		defer func() { _ = gateway.environments.RevokeGrant(context.Background(), grant.GrantID, principal) }()
		err = gateway.environments.UseSecret(ctx, backendenvironment.UseSecretInput{
			GrantID: grant.GrantID, Principal: principal, WorkspaceID: authority.WorkspaceID, EnvironmentID: snapshot.EnvironmentID, Revision: snapshot.Revision,
			ProviderID: remoteDataGatewayProviderID, PurposeKind: "data-operation", ResourceID: resourceID, BindingID: bindingID, Field: secretField,
		}, func(material []byte) error {
			plan.request.Headers[secretHeader] = string(material)
			defer delete(plan.request.Headers, secretHeader)
			if executeErr := execute(); executeErr != nil {
				return executeErr
			}
			if len(material) > 0 && upstream != nil && bytes.Contains(upstream.Body, material) {
				secretEchoDetected = true
				upstream = nil
				return plan.upstreamErr
			}
			return nil
		})
	} else {
		err = execute()
	}
	if err != nil || upstream == nil {
		if transportAttempted && !secretEchoDetected {
			return nil, releaseMutationRetry()
		}
		return nil, plan.upstreamErr
	}
	completedAt := gateway.now().UnixMilli()
	if completedAt < startedAt {
		completedAt = startedAt
	}
	if upstream.Status < 200 || upstream.Status >= 300 {
		if upstream.Status == 408 || upstream.Status == 429 || upstream.Status >= 500 {
			return nil, releaseMutationRetry()
		}
		return nil, plan.upstreamErr
	}
	value, empty, decodeErr := plan.decode(upstream.Status, upstream.Body)
	if decodeErr != nil {
		return nil, releaseMutationRetry()
	}
	result := &DataGatewayResult{
		Value: value,
		Empty: empty,
		Network: dataGatewayNetworkTrace{
			Format: "prodivix.execution-network-trace.v1", RequestID: invocation.InvocationID + ":" + fmt.Sprint(invocation.Attempt), Phase: "runtime", RuntimeZone: document.Source.RuntimeZone,
			Mode: "live", Adapter: plan.adapter, Method: plan.request.Method, SanitizedURL: plan.sanitizedURL, Protocol: "https", StartedAt: startedAt, CompletedAt: completedAt,
			DurationMS: completedAt - startedAt, Outcome: "allowed", Status: upstream.Status, RequestBytes: int64(len(plan.request.Body)), ResponseBytes: int64(len(upstream.Body)),
			Correlation: dataGatewayCorrelation{Kind: "data-operation", DocumentID: documentID, OperationID: operation.ID, InvocationID: invocation.InvocationID, Sequence: invocation.Sequence, Attempt: invocation.Attempt},
			Redacted:    true, SourceTrace: dataGatewayProtocolSourceTrace(documentID, operation.ID),
		},
	}
	if operation.Kind == "mutation" {
		if err := gateway.replays.CompleteDataGatewayMutation(context.Background(), replayKey, replayHash, invocation.Attempt, *result); err != nil {
			return nil, ErrDataGatewayUnavailable
		}
		mutationResolved = true
	}
	return result, nil
}
