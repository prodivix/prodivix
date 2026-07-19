package remoteexecution

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"sort"
	"strings"
	"time"

	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

const remoteDataGatewayProviderID = "prodivix.remote.data"

const (
	maximumDataGatewayRetryAttempts int64 = 10
	maximumDataGatewayRetryDelayMS  int64 = 5 * 60 * 1000
	maximumDataGatewayJSONDepth           = 64
	maximumDataGatewayJSONNodes           = 65_536
)

func NewDataGateway(store GrantStore, environments DataGatewayEnvironmentStore, transport DataGatewayTransport) *DataGateway {
	replays, _ := store.(DataGatewayMutationReplayStore)
	streams, _ := transport.(DataGatewayStreamTransport)
	var checkpointKey [sha256.Size]byte
	_, checkpointKeyError := rand.Read(checkpointKey[:])
	return &DataGateway{store: store, replays: replays, environments: environments, transport: transport, streams: streams, activeStreams: map[string]struct{}{}, checkpointKey: checkpointKey, checkpointKeyReady: checkpointKeyError == nil, now: func() time.Time { return time.Now().UTC() }}
}

func (gateway *DataGateway) Available() bool {
	return gateway != nil && gateway.store != nil && gateway.environments != nil && gateway.environments.Available() && gateway.transport != nil
}

func normalizedDataGatewayID(value string) (string, bool) {
	normalized := strings.TrimSpace(value)
	return normalized, value == normalized && normalized != "" && len(normalized) <= 512 && !strings.ContainsRune(normalized, '\x00')
}

func parseDataGatewayDocument(contents []byte, documentID string, operationID string) (*dataGatewayDocument, *dataGatewayOperation, error) {
	var document dataGatewayDocument
	if json.Unmarshal(contents, &document) != nil || document.WireVersion != 1 ||
		(document.Source.AdapterID != "core.http" && document.Source.AdapterID != "core.graphql" && document.Source.AdapterID != "core.asyncapi") ||
		(document.Source.RuntimeZone != "server" && document.Source.RuntimeZone != "edge") {
		return nil, nil, ErrDataGatewayDenied
	}
	operation, ok := document.OperationsByID[operationID]
	if !ok || operation.ID != operationID || (operation.Kind != "query" && operation.Kind != "mutation" && operation.Kind != "subscription") {
		return nil, nil, ErrDataGatewayDenied
	}
	if operation.Policies.Idempotency != nil && (operation.Kind != "mutation" || operation.Policies.Idempotency.Kind != "invocation-key") {
		return nil, nil, ErrDataGatewayDenied
	}
	if operation.Policies.Stream != nil && operation.Kind != "subscription" {
		return nil, nil, ErrDataGatewayDenied
	}
	if retry := operation.Policies.Retry; retry != nil {
		maximumDelay := retry.InitialDelayMS
		if retry.MaximumDelayMS != nil {
			maximumDelay = *retry.MaximumDelayMS
		} else if retry.Backoff == "exponential" {
			for step := int64(1); step <= retry.MaximumAttempts-2; step++ {
				if maximumDelay > maximumDataGatewayRetryDelayMS/2 {
					return nil, nil, ErrDataGatewayDenied
				}
				maximumDelay *= 2
			}
		}
		if retry.MaximumAttempts < 1 || retry.MaximumAttempts > maximumDataGatewayRetryAttempts || (retry.Backoff != "fixed" && retry.Backoff != "exponential") || retry.InitialDelayMS < 0 || retry.InitialDelayMS > maximumDataGatewayRetryDelayMS || maximumDelay < retry.InitialDelayMS || maximumDelay > maximumDataGatewayRetryDelayMS {
			return nil, nil, ErrDataGatewayDenied
		}
		if operation.Kind == "mutation" && retry.MaximumAttempts > 1 && operation.Policies.Idempotency == nil {
			return nil, nil, ErrDataGatewayDenied
		}
	}
	if _, ok := normalizedDataGatewayID(documentID); !ok {
		return nil, nil, ErrDataGatewayInvalidRequest
	}
	return &document, &operation, nil
}

func dataGatewayMaximumAttempts(operation dataGatewayOperation) int64 {
	if operation.Policies.Retry == nil {
		return 1
	}
	return operation.Policies.Retry.MaximumAttempts
}

func dataGatewayHeaderToken(value string) bool {
	if value == "" || value != strings.ToLower(value) || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9') || strings.ContainsRune("!#$%&'*+-.^_|~", character) {
			continue
		}
		return false
	}
	switch value {
	case "authorization", "connection", "content-length", "content-type", "cookie", "host", "proxy-authorization", "set-cookie", "transfer-encoding":
		return false
	default:
		return true
	}
}

func dataGatewayUpstreamIdempotencyKey(authority ExecutionAuthority, document dataGatewayDocument, operation dataGatewayOperation, documentID string, invocation DataGatewayInvocation, input any) (string, error) {
	payload := struct {
		Format           string `json:"format"`
		ExecutionID      string `json:"executionId"`
		DocumentID       string `json:"documentId"`
		OperationID      string `json:"operationId"`
		InvocationID     string `json:"invocationId"`
		Sequence         int64  `json:"sequence"`
		DocumentRevision string `json:"documentRevision"`
		RuntimeZone      string `json:"runtimeZone"`
		Input            any    `json:"input"`
	}{
		Format: "prodivix.data-idempotency-key.v1", ExecutionID: authority.ExecutionID,
		DocumentID: documentID, OperationID: operation.ID, InvocationID: invocation.InvocationID, Sequence: invocation.Sequence,
		DocumentRevision: authority.PartitionRevisions["document:"+documentID+":content"], RuntimeZone: document.Source.RuntimeZone, Input: input,
	}
	contents, err := json.Marshal(payload)
	if err != nil {
		return "", ErrDataGatewayInvalidRequest
	}
	digest := sha256.Sum256(contents)
	return "prodivix-data-sha256-" + fmt.Sprintf("%x", digest), nil
}

func dataGatewayMutationReplayHash(authority ExecutionAuthority, document dataGatewayDocument, operation dataGatewayOperation, documentID string, invocation DataGatewayInvocation, endpoint string, method string, input any) (string, error) {
	payload := struct {
		ExecutionID         string `json:"executionId"`
		SnapshotID          string `json:"snapshotId"`
		DocumentRevision    string `json:"documentRevision"`
		EnvironmentID       string `json:"environmentId"`
		EnvironmentRevision string `json:"environmentRevision"`
		DocumentID          string `json:"documentId"`
		OperationID         string `json:"operationId"`
		InvocationID        string `json:"invocationId"`
		Sequence            int64  `json:"sequence"`
		RuntimeZone         string `json:"runtimeZone"`
		Method              string `json:"method"`
		Endpoint            string `json:"endpoint"`
		Input               any    `json:"input"`
	}{
		ExecutionID: authority.ExecutionID, SnapshotID: authority.SnapshotID,
		DocumentRevision: authority.PartitionRevisions["document:"+documentID+":content"],
		EnvironmentID:    authority.Environment.EnvironmentID, EnvironmentRevision: authority.Environment.Revision,
		DocumentID: documentID, OperationID: operation.ID, InvocationID: invocation.InvocationID,
		Sequence: invocation.Sequence, RuntimeZone: document.Source.RuntimeZone, Method: method, Endpoint: endpoint, Input: input,
	}
	contents, err := json.Marshal(payload)
	if err != nil {
		return "", ErrDataGatewayInvalidRequest
	}
	digest := sha256.Sum256(contents)
	return fmt.Sprintf("%x", digest), nil
}

func resolvePublicString(value dataConfigurationValue, field string, snapshot *backendenvironment.Snapshot, bindings map[string]dataConfigurationValue) (string, error) {
	var resolved any
	switch value.Kind {
	case "literal":
		resolved = value.Value
	case "environment-ref":
		if snapshot == nil || value.Reference.BindingID == "" {
			return "", ErrDataGatewayDenied
		}
		binding, exists := bindings[value.Reference.BindingID]
		if !exists || binding.Kind != "environment-ref" || binding.Reference.BindingID != value.Reference.BindingID {
			return "", ErrDataGatewayDenied
		}
		resolved = snapshot.PublicBindings[value.Reference.BindingID]
	default:
		return "", ErrDataGatewayDenied
	}
	text, ok := resolved.(string)
	if !ok || text == "" || text != strings.TrimSpace(text) || strings.ContainsRune(text, '\x00') || len(text) > 16*1024 {
		return "", fmt.Errorf("%w: %s", ErrDataGatewayDenied, field)
	}
	return text, nil
}

func dataGatewayEndpoint(baseURL string, path string) (*url.URL, error) {
	base, err := url.Parse(baseURL)
	if err != nil || base.Scheme != "https" || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" || !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") {
		return nil, ErrDataGatewayDenied
	}
	endpoint, err := base.Parse(path)
	if err != nil || endpoint.Scheme != "https" || endpoint.Host != base.Host || endpoint.User != nil || endpoint.Fragment != "" {
		return nil, ErrDataGatewayDenied
	}
	return endpoint, nil
}

func appendDataGatewayQuery(endpoint *url.URL, input any) error {
	if input == nil {
		return nil
	}
	record, ok := input.(map[string]any)
	if !ok {
		return ErrDataGatewayInvalidRequest
	}
	keys := make([]string, 0, len(record))
	for key := range record {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	query := endpoint.Query()
	for _, key := range keys {
		value := record[key]
		switch value.(type) {
		case nil:
			continue
		case string, bool, float64, int64:
			query.Add(key, fmt.Sprint(value))
		default:
			return ErrDataGatewayInvalidRequest
		}
	}
	endpoint.RawQuery = query.Encode()
	return nil
}

type dataGatewayParameterMappings struct {
	Path   map[string]string
	Query  map[string]string
	Header map[string]string
}

func isDataGatewayJSONPointer(value string) bool {
	if !strings.HasPrefix(value, "/") {
		return false
	}
	for index := 0; index < len(value); index++ {
		if value[index] != '~' {
			continue
		}
		if index+1 >= len(value) || (value[index+1] != '0' && value[index+1] != '1') {
			return false
		}
		index++
	}
	return true
}

func decodeDataGatewayParameterMappings(value dataConfigurationValue, exists bool) (*dataGatewayParameterMappings, error) {
	if !exists {
		return nil, nil
	}
	if value.Kind != "literal" {
		return nil, ErrDataGatewayDenied
	}
	record, ok := value.Value.(map[string]any)
	if !ok {
		return nil, ErrDataGatewayDenied
	}
	result := &dataGatewayParameterMappings{Path: map[string]string{}, Query: map[string]string{}, Header: map[string]string{}}
	for location, rawMappings := range record {
		mappings, ok := rawMappings.(map[string]any)
		if !ok {
			return nil, ErrDataGatewayDenied
		}
		var target map[string]string
		switch location {
		case "path":
			target = result.Path
		case "query":
			target = result.Query
		case "header":
			target = result.Header
		default:
			return nil, ErrDataGatewayDenied
		}
		for name, rawPointer := range mappings {
			pointer, ok := rawPointer.(string)
			if !ok || name == "" || name != strings.TrimSpace(name) || !isDataGatewayJSONPointer(pointer) {
				return nil, ErrDataGatewayDenied
			}
			if location == "header" && !dataGatewayHeaderToken(name) {
				return nil, ErrDataGatewayDenied
			}
			target[name] = pointer
		}
	}
	return result, nil
}

func dataGatewayPointer(value any, pointer string) (any, bool, error) {
	if pointer == "" {
		return value, true, nil
	}
	if !isDataGatewayJSONPointer(pointer) {
		return nil, false, ErrDataGatewayDenied
	}
	current := value
	for _, rawToken := range strings.Split(strings.TrimPrefix(pointer, "/"), "/") {
		token := strings.ReplaceAll(strings.ReplaceAll(rawToken, "~1", "/"), "~0", "~")
		switch container := current.(type) {
		case map[string]any:
			var exists bool
			current, exists = container[token]
			if !exists {
				return nil, false, nil
			}
		case []any:
			index := -1
			if _, err := fmt.Sscanf(token, "%d", &index); err != nil || index < 0 || index >= len(container) || fmt.Sprint(index) != token {
				return nil, false, nil
			}
			current = container[index]
		default:
			return nil, false, nil
		}
	}
	return current, true, nil
}

func dataGatewayScalar(value any, exists bool, required bool) (string, bool, error) {
	if !exists || value == nil {
		if required {
			return "", false, ErrDataGatewayInvalidRequest
		}
		return "", false, nil
	}
	var result string
	switch current := value.(type) {
	case string:
		result = current
	case bool:
		result = fmt.Sprint(current)
	case int64, float64:
		result = fmt.Sprint(current)
	default:
		return "", false, ErrDataGatewayInvalidRequest
	}
	if strings.ContainsAny(result, "\r\n") {
		return "", false, ErrDataGatewayInvalidRequest
	}
	return result, true, nil
}

func mapDataGatewayRequest(path string, input any, operation dataGatewayOperation) (string, map[string]string, map[string]string, any, bool, error) {
	configuredMappings, hasMappings := operation.ConfigurationByKey["parameterMappings"]
	mappings, err := decodeDataGatewayParameterMappings(configuredMappings, hasMappings)
	if err != nil {
		return "", nil, nil, nil, false, err
	}
	bodyInputPathValue, hasBodyInputPath := operation.ConfigurationByKey["bodyInputPath"]
	bodyInputPath := ""
	if hasBodyInputPath {
		if bodyInputPathValue.Kind != "literal" {
			return "", nil, nil, nil, false, ErrDataGatewayDenied
		}
		var ok bool
		bodyInputPath, ok = bodyInputPathValue.Value.(string)
		if !ok || !isDataGatewayJSONPointer(bodyInputPath) {
			return "", nil, nil, nil, false, ErrDataGatewayDenied
		}
	}
	if mappings == nil && !hasBodyInputPath {
		return path, map[string]string{}, map[string]string{}, input, false, nil
	}
	mappedPath := path
	query := map[string]string{}
	headers := map[string]string{}
	if mappings != nil {
		for name, pointer := range mappings.Path {
			value, exists, pointerErr := dataGatewayPointer(input, pointer)
			if pointerErr != nil {
				return "", nil, nil, nil, false, pointerErr
			}
			text, _, scalarErr := dataGatewayScalar(value, exists, true)
			if scalarErr != nil || !strings.Contains(mappedPath, "{"+name+"}") {
				return "", nil, nil, nil, false, ErrDataGatewayInvalidRequest
			}
			mappedPath = strings.ReplaceAll(mappedPath, "{"+name+"}", url.PathEscape(text))
		}
		if strings.ContainsAny(mappedPath, "{}") {
			return "", nil, nil, nil, false, ErrDataGatewayInvalidRequest
		}
		for name, pointer := range mappings.Query {
			value, exists, pointerErr := dataGatewayPointer(input, pointer)
			if pointerErr != nil {
				return "", nil, nil, nil, false, pointerErr
			}
			text, present, scalarErr := dataGatewayScalar(value, exists, false)
			if scalarErr != nil {
				return "", nil, nil, nil, false, scalarErr
			}
			if present {
				query[name] = text
			}
		}
		for name, pointer := range mappings.Header {
			value, exists, pointerErr := dataGatewayPointer(input, pointer)
			if pointerErr != nil {
				return "", nil, nil, nil, false, pointerErr
			}
			text, present, scalarErr := dataGatewayScalar(value, exists, false)
			if scalarErr != nil {
				return "", nil, nil, nil, false, scalarErr
			}
			if present {
				headers[name] = text
			}
		}
	}
	var body any
	if hasBodyInputPath {
		value, exists, pointerErr := dataGatewayPointer(input, bodyInputPath)
		if pointerErr != nil {
			return "", nil, nil, nil, false, pointerErr
		}
		if exists {
			body = value
		}
	}
	return mappedPath, query, headers, body, true, nil
}

func decodeInvocationInput(raw json.RawMessage) (any, error) {
	if len(raw) == 0 {
		return nil, ErrDataGatewayInvalidRequest
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, ErrDataGatewayInvalidRequest
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, ErrDataGatewayInvalidRequest
	}
	return normalizeJSONNumbers(value)
}

func normalizeJSONNumbers(value any) (any, error) {
	nodes := 0
	return normalizeJSONValue(value, 0, &nodes)
}

func normalizeJSONValue(value any, depth int, nodes *int) (any, error) {
	*nodes = *nodes + 1
	if depth > maximumDataGatewayJSONDepth || *nodes > maximumDataGatewayJSONNodes {
		return nil, ErrDataGatewayInvalidRequest
	}
	switch current := value.(type) {
	case json.Number:
		integer, integerErr := current.Int64()
		if integerErr == nil {
			if integer < -9007199254740991 || integer > 9007199254740991 {
				return nil, ErrDataGatewayInvalidRequest
			}
			return integer, nil
		}
		decimal, decimalErr := current.Float64()
		if decimalErr != nil {
			return nil, ErrDataGatewayInvalidRequest
		}
		return decimal, nil
	case []any:
		for index := range current {
			normalized, err := normalizeJSONValue(current[index], depth+1, nodes)
			if err != nil {
				return nil, err
			}
			current[index] = normalized
		}
	case map[string]any:
		for key, entry := range current {
			normalized, err := normalizeJSONValue(entry, depth+1, nodes)
			if err != nil {
				return nil, err
			}
			current[key] = normalized
		}
	}
	return value, nil
}

func secretDataGatewayHeader(source dataGatewaySource, operation dataGatewayOperation, snapshot *backendenvironment.Snapshot) (string, string, string, bool, error) {
	value, exists := operation.ConfigurationByKey["authorization"]
	field := "operation.authorization"
	header := "authorization"
	if !exists {
		value, exists = source.ConfigurationByKey["authorization"]
		field = "source.authorization"
	}
	apiKey, hasAPIKey := operation.ConfigurationByKey["apiKey"]
	apiKeyField := "operation.apiKey"
	if !hasAPIKey {
		apiKey, hasAPIKey = source.ConfigurationByKey["apiKey"]
		apiKeyField = "source.apiKey"
	}
	if exists && hasAPIKey {
		return "", "", "", false, ErrDataGatewayDenied
	}
	if hasAPIKey {
		value = apiKey
		exists = true
		field = apiKeyField
		headerConfiguration, hasHeader := operation.ConfigurationByKey["apiKeyHeader"]
		if !hasHeader {
			headerConfiguration, hasHeader = source.ConfigurationByKey["apiKeyHeader"]
		}
		if !hasHeader {
			return "", "", "", false, ErrDataGatewayDenied
		}
		resolvedHeader, err := resolvePublicString(headerConfiguration, "operation.apiKeyHeader", snapshot, source.BindingsByID)
		if err != nil || !dataGatewayHeaderToken(resolvedHeader) {
			return "", "", "", false, ErrDataGatewayDenied
		}
		header = resolvedHeader
	}
	if !exists {
		return "", "", "", false, nil
	}
	if value.Kind != "secret-ref" || value.Reference.BindingID == "" {
		return "", "", "", false, ErrDataGatewayDenied
	}
	binding, exists := source.BindingsByID[value.Reference.BindingID]
	if !exists || binding.Kind != "secret-ref" || binding.Reference.BindingID != value.Reference.BindingID {
		return "", "", "", false, ErrDataGatewayDenied
	}
	return value.Reference.BindingID, field, header, true, nil
}

// Invoke executes one exact snapshot-bound HTTP Data operation while Secret material exists only inside the authorized transport callback.
func (gateway *DataGateway) Invoke(ctx context.Context, principal backendenvironment.PrincipalSession, executionID string, documentID string, operationID string, invocation DataGatewayInvocation) (*DataGatewayResult, error) {
	if !gateway.Available() {
		return nil, ErrDataGatewayUnavailable
	}
	executionID, executionOK := normalizedDataGatewayID(executionID)
	documentID, documentOK := normalizedDataGatewayID(documentID)
	operationID, operationOK := normalizedDataGatewayID(operationID)
	invocationID, invocationOK := normalizedDataGatewayID(invocation.InvocationID)
	if !executionOK || !documentOK || !operationOK || !invocationOK || invocation.Sequence < 0 || invocation.Attempt < 1 || invocation.Resume != nil {
		return nil, ErrDataGatewayInvalidRequest
	}
	authority, err := gateway.store.GetExecutionAuthority(ctx, principal.PrincipalID, principal.SessionID, executionID)
	if err != nil || authority.ProviderID != "prodivix.remote.preview" || authority.Profile != "preview" || authority.RuntimeZone != "client" || authority.Environment == nil || authority.Environment.Mode != "live" || authority.SessionID != principal.SessionID {
		return nil, ErrDataGatewayDenied
	}
	contents, err := gateway.store.GetDataSourceDocument(ctx, *authority, documentID)
	if err != nil {
		return nil, ErrDataGatewayDenied
	}
	document, operation, err := parseDataGatewayDocument(contents, documentID, operationID)
	if err != nil {
		return nil, err
	}
	if operation.Kind == "subscription" {
		return nil, ErrDataGatewayDenied
	}
	requiredPermission := workspaceReadPermissionID
	if operation.Kind == "mutation" {
		requiredPermission = workspaceWritePermissionID
	}
	if !hasWorkspaceExecutionPermission(authority.Permissions, requiredPermission) {
		return nil, ErrDataGatewayDenied
	}
	snapshot, err := gateway.environments.GetSnapshot(ctx, principal, authority.WorkspaceID, authority.Environment.EnvironmentID, authority.Environment.Revision)
	if err != nil || snapshot.Mode != "live" || snapshot.WorkspaceID != authority.WorkspaceID || snapshot.EnvironmentID != authority.Environment.EnvironmentID || snapshot.Revision != authority.Environment.Revision {
		return nil, ErrDataGatewayDenied
	}
	if document.Source.AdapterID != "core.http" {
		return gateway.invokeProtocol(ctx, principal, *authority, snapshot, executionID, documentID, *document, *operation, invocation)
	}
	baseURL, err := resolvePublicString(document.Source.ConfigurationByKey["baseUrl"], "source.baseUrl", snapshot, document.Source.BindingsByID)
	if err != nil {
		return nil, err
	}
	method, err := resolvePublicString(operation.ConfigurationByKey["method"], "operation.method", snapshot, document.Source.BindingsByID)
	if err != nil {
		return nil, err
	}
	method = strings.ToUpper(method)
	if (operation.Kind == "query" && method != "GET" && method != "HEAD") ||
		(operation.Kind == "mutation" && method != "POST" && method != "PUT" && method != "PATCH" && method != "DELETE") {
		return nil, ErrDataGatewayDenied
	}
	maximumAttempts := dataGatewayMaximumAttempts(*operation)
	if invocation.Attempt > maximumAttempts {
		if operation.Kind == "query" {
			return nil, ErrDataGatewayInvalidRequest
		}
		return nil, ErrDataGatewayReplayUnsafe
	}
	if operation.Kind == "mutation" && invocation.Attempt > 1 && operation.Policies.Idempotency == nil {
		return nil, ErrDataGatewayReplayUnsafe
	}
	path, err := resolvePublicString(operation.ConfigurationByKey["path"], "operation.path", snapshot, document.Source.BindingsByID)
	if err != nil {
		return nil, err
	}
	input, err := decodeInvocationInput(invocation.Input)
	if err != nil {
		return nil, err
	}
	mappedPath, mappedQuery, mappedHeaders, mappedBody, mapped, err := mapDataGatewayRequest(path, input, *operation)
	if err != nil {
		return nil, err
	}
	endpoint, err := dataGatewayEndpoint(baseURL, mappedPath)
	if err != nil {
		return nil, err
	}
	var body []byte
	if mapped {
		query := endpoint.Query()
		for key, value := range mappedQuery {
			query.Add(key, value)
		}
		endpoint.RawQuery = query.Encode()
		if mappedBody != nil {
			body, err = json.Marshal(mappedBody)
			if err != nil || int64(len(body)) > maximumDataGatewayRequestBytes {
				return nil, ErrDataGatewayInvalidRequest
			}
		}
	} else if operation.Kind == "query" {
		if err := appendDataGatewayQuery(endpoint, input); err != nil {
			return nil, err
		}
	} else {
		body, err = json.Marshal(input)
		if err != nil || int64(len(body)) > maximumDataGatewayRequestBytes {
			return nil, ErrDataGatewayInvalidRequest
		}
	}
	emptyWhen := "never"
	if configured, exists := operation.ConfigurationByKey["emptyWhen"]; exists {
		emptyWhen, err = resolvePublicString(configured, "operation.emptyWhen", snapshot, document.Source.BindingsByID)
		if err != nil || (emptyWhen != "never" && emptyWhen != "status-204") {
			return nil, ErrDataGatewayDenied
		}
	}
	requestID := invocationID + ":" + fmt.Sprint(invocation.Attempt)
	request := DataGatewayTransportRequest{URL: endpoint.String(), Method: method, Headers: mappedHeaders, Body: body}
	if request.Headers == nil {
		request.Headers = map[string]string{}
	}
	if len(body) > 0 {
		request.Headers["content-type"] = "application/json"
	}
	configuredIdempotencyHeader, hasIdempotencyHeader := operation.ConfigurationByKey["idempotencyHeader"]
	if hasIdempotencyHeader && operation.Policies.Idempotency == nil {
		return nil, ErrDataGatewayDenied
	}
	if operation.Policies.Idempotency != nil {
		header, headerErr := resolvePublicString(configuredIdempotencyHeader, "operation.idempotencyHeader", snapshot, document.Source.BindingsByID)
		if headerErr != nil || !dataGatewayHeaderToken(header) {
			return nil, ErrDataGatewayDenied
		}
		key, keyErr := dataGatewayUpstreamIdempotencyKey(*authority, *document, *operation, documentID, invocation, input)
		if keyErr != nil {
			return nil, keyErr
		}
		request.Headers[header] = key
	}
	bindingID, secretField, secretHeader, hasSecret, err := secretDataGatewayHeader(document.Source, *operation, snapshot)
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
		replayKey = DataGatewayMutationReplayKey{ExecutionID: executionID, DocumentID: documentID, OperationID: operationID, InvocationID: invocationID, Sequence: invocation.Sequence}
		replayHash, err = dataGatewayMutationReplayHash(*authority, *document, *operation, documentID, invocation, request.URL, method, input)
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
			return ErrDataGatewayUpstream
		}
		if err := gateway.replays.ReleaseDataGatewayMutationRetry(context.Background(), replayKey, replayHash, invocation.Attempt); err != nil {
			return ErrDataGatewayReplayUnsafe
		}
		mutationResolved = true
		return ErrDataGatewayUpstream
	}
	startedAt := gateway.now().UnixMilli()
	var upstream *DataGatewayTransportResponse
	transportAttempted := false
	secretEchoDetected := false
	execute := func() error {
		transportAttempted = true
		var executeErr error
		upstream, executeErr = gateway.transport.Execute(ctx, request)
		return executeErr
	}
	if hasSecret {
		resourceID := strings.Join([]string{executionID, documentID, operationID, invocationID}, ":")
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
			request.Headers[secretHeader] = string(material)
			defer delete(request.Headers, secretHeader)
			if executeErr := execute(); executeErr != nil {
				return executeErr
			}
			if len(material) > 0 && upstream != nil && bytes.Contains(upstream.Body, material) {
				secretEchoDetected = true
				upstream = nil
				return ErrDataGatewayUpstream
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
		return nil, ErrDataGatewayUpstream
	}
	completedAt := gateway.now().UnixMilli()
	if completedAt < startedAt {
		completedAt = startedAt
	}
	if upstream.Status < 200 || upstream.Status >= 300 {
		if upstream.Status == 408 || upstream.Status == 429 || upstream.Status >= 500 {
			return nil, releaseMutationRetry()
		}
		return nil, ErrDataGatewayUpstream
	}
	var value any
	if len(upstream.Body) > 0 && json.Unmarshal(upstream.Body, &value) != nil {
		return nil, releaseMutationRetry()
	}
	if configured, exists := operation.ConfigurationByKey["responseBodyPath"]; exists {
		responseBodyPath, resolveErr := resolvePublicString(configured, "operation.responseBodyPath", snapshot, document.Source.BindingsByID)
		if resolveErr != nil || !isDataGatewayJSONPointer(responseBodyPath) {
			return nil, ErrDataGatewayDenied
		}
		mappedValue, found, pointerErr := dataGatewayPointer(value, responseBodyPath)
		if pointerErr != nil || !found {
			return nil, releaseMutationRetry()
		}
		value = mappedValue
	}
	sanitizedURL := endpoint.Scheme + "://" + endpoint.Host + "/"
	result := &DataGatewayResult{
		Value: value,
		Empty: emptyWhen == "status-204" && upstream.Status == 204,
		Network: dataGatewayNetworkTrace{
			Format: "prodivix.execution-network-trace.v1", RequestID: requestID, Phase: "runtime", RuntimeZone: document.Source.RuntimeZone, Mode: "live", Adapter: "core.http", Method: method,
			SanitizedURL: sanitizedURL, Protocol: "https", StartedAt: startedAt, CompletedAt: completedAt, DurationMS: completedAt - startedAt, Outcome: "allowed", Status: upstream.Status,
			RequestBytes: int64(len(body)), ResponseBytes: int64(len(upstream.Body)), Correlation: dataGatewayCorrelation{Kind: "data-operation", DocumentID: documentID, OperationID: operationID, InvocationID: invocationID, Sequence: invocation.Sequence, Attempt: invocation.Attempt}, Redacted: true,
			SourceTrace: dataGatewayProtocolSourceTrace(documentID, operationID),
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

func dataGatewayErrorStatus(err error) (int, string, string) {
	switch {
	case errors.Is(err, ErrDataGatewayInvalidRequest):
		return 400, "DAT-1001", "Remote Data invocation is invalid."
	case errors.Is(err, ErrDataGatewayDenied):
		return 404, "EXE-4004", "Remote Data operation was not found."
	case errors.Is(err, ErrDataGatewayUnavailable):
		return 503, "ENV-5001", "Remote Data gateway is unavailable."
	case errors.Is(err, ErrDataGatewayReplayConflict):
		return 409, "DATA_MUTATION_REPLAY_CONFLICT", "Remote Data mutation identity conflicts with an earlier dispatch."
	case errors.Is(err, ErrDataGatewayReplayUnsafe):
		return 409, "DATA_MUTATION_REPLAY_UNSAFE", "Remote Data mutation outcome cannot be replayed safely."
	case errors.Is(err, ErrDataGatewayReplayCapacity):
		return 429, "DATA_MUTATION_REPLAY_CAPACITY", "Remote Data mutation replay capacity is exhausted."
	case errors.Is(err, ErrDataGatewayGraphQLUpstream):
		return 502, "DATA_GRAPHQL_REQUEST_FAILED", "Remote GraphQL Data operation request failed."
	case errors.Is(err, ErrDataGatewayAsyncAPIUpstream):
		return 502, "DATA_ASYNCAPI_REQUEST_FAILED", "Remote AsyncAPI Data operation request failed."
	default:
		return 502, "DATA_HTTP_REQUEST_FAILED", "Remote Data operation request failed."
	}
}
