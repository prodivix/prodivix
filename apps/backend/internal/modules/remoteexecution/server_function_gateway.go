package remoteexecution

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

const (
	maximumServerFunctionRequestBytes          int64 = 1024 * 1024
	maximumServerFunctionCodeDocumentBytes           = 4 * 1024 * 1024
	maximumServerFunctionSchemaBytes                 = 256 * 1024
	maximumServerFunctionSchemaDepth                 = 64
	maximumServerFunctionSchemaNodes                 = 8192
	maximumServerFunctionValueDepth                  = 64
	maximumServerFunctionValueNodes                  = 65536
	maximumServerFunctionMutationReplays             = 256
	maximumServerFunctionExecutionStateEntries       = 256
	serverFunctionRequestType                        = "prodivix.execution-server-function-gateway-request.v1"
	serverFunctionResponseType                       = "prodivix.execution-server-function-gateway-response.v1"
	serverFunctionMutationIntentHeader               = "X-Prodivix-Server-Function-Intent"
	serverFunctionMutationIntent                     = "mutation-v1"
	serverFunctionExecutionStatePutAdapterID         = "core.server.execution-state.put"
	serverFunctionHMACSHA256AdapterID                = "core.server.hmac-sha256"
	serverFunctionHMACSecretField                    = "key"
	productAuthProviderID                            = "prodivix-product-session"
	serverRuntimeMetadataKey                         = "prodivix.serverRuntime"
)

var (
	ErrServerFunctionInvalidRequest = errors.New("remote Server Function request is invalid")
	ErrServerFunctionDenied         = errors.New("remote Server Function request is denied")
	ErrServerFunctionUnavailable    = errors.New("remote Server Function gateway is unavailable")
	ErrServerFunctionInputInvalid   = errors.New("remote Server Function input is invalid")
	ErrServerFunctionOutputInvalid  = errors.New("remote Server Function output is invalid")
	ErrServerFunctionMutationOrigin = errors.New("remote Server Function mutation origin is denied")
	ErrServerFunctionReplayConflict = errors.New("remote Server Function mutation replay identity conflicts")
	ErrServerFunctionReplayCapacity = errors.New("remote Server Function mutation replay capacity is exhausted")
	serverFunctionExportName        = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*$`)
	serverFunctionCanonicalID       = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]*$`)
	serverFunctionStateKey          = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
)

type ServerFunctionGatewayStore interface {
	VerifyWorkspaceOwner(ctx context.Context, ownerID string, workspaceID string) error
	GetExecutionAuthority(ctx context.Context, ownerID string, sessionID string, executionID string) (*ExecutionAuthority, error)
	GetCodeDocument(ctx context.Context, authority ExecutionAuthority, documentID string) ([]byte, error)
}

type ServerFunctionExecutionStateMutationKey struct {
	ExecutionID  string
	ArtifactID   string
	ExportName   string
	InvocationID string
	StateKey     string
}

type ServerFunctionExecutionStateResult struct {
	Key      string `json:"key"`
	Value    any    `json:"value"`
	Revision int64  `json:"revision"`
}

type ServerFunctionMutationStore interface {
	ApplyServerFunctionExecutionStateMutation(ctx context.Context, key ServerFunctionExecutionStateMutationKey, requestHash string, value json.RawMessage) (*ServerFunctionExecutionStateResult, error)
}

type ServerFunctionMutationRequestAuthority struct {
	Origin          string
	Intent          string
	ForbiddenValues []string
}

type ServerFunctionPrincipalSession struct {
	PrincipalID string
	SessionID   string
	ExpiresAt   int64
}

type serverFunctionReference struct {
	ArtifactID string `json:"artifactId"`
	ExportName string `json:"exportName"`
}

type ServerFunctionInvocation struct {
	Type         string                  `json:"type"`
	RequestID    string                  `json:"requestId"`
	InvocationID string                  `json:"invocationId"`
	Attempt      int64                   `json:"attempt"`
	FunctionRef  serverFunctionReference `json:"functionRef"`
	Input        json.RawMessage         `json:"input"`
}

type serverFunctionAuthPolicy struct {
	Kind         string `json:"kind"`
	PermissionID string `json:"permissionId,omitempty"`
}

type serverFunctionSecretReference struct {
	BindingID string `json:"bindingId"`
}

type serverFunctionEnvironmentPolicy struct {
	SecretsByField map[string]serverFunctionSecretReference `json:"secretsByField"`
}

type serverFunctionProfileEntry struct {
	Kind         string                           `json:"kind"`
	RuntimeZone  string                           `json:"runtimeZone"`
	AdapterID    string                           `json:"adapterId"`
	Effect       string                           `json:"effect"`
	Auth         serverFunctionAuthPolicy         `json:"auth"`
	InputSchema  json.RawMessage                  `json:"inputSchema"`
	OutputSchema json.RawMessage                  `json:"outputSchema"`
	Idempotency  json.RawMessage                  `json:"idempotency,omitempty"`
	Environment  *serverFunctionEnvironmentPolicy `json:"environment,omitempty"`
}

type serverFunctionProfile struct {
	SchemaVersion     string                                `json:"schemaVersion"`
	FunctionsByExport map[string]serverFunctionProfileEntry `json:"functionsByExport"`
}

type serverFunctionCodeDocument struct {
	Language string                     `json:"language"`
	Source   string                     `json:"source"`
	Metadata map[string]json.RawMessage `json:"metadata"`
}

type serverFunctionOutcome struct {
	Kind  string `json:"kind"`
	Value any    `json:"value,omitempty"`
}

type ServerFunctionBridgeResponse struct {
	Type      string                `json:"type"`
	RequestID string                `json:"requestId"`
	OK        bool                  `json:"ok"`
	Result    serverFunctionOutcome `json:"result"`
}

type ServerFunctionGateway struct {
	store                  ServerFunctionGatewayStore
	mutations              ServerFunctionMutationStore
	environments           DataGatewayEnvironmentStore
	allowedMutationOrigins map[string]struct{}
	now                    func() time.Time
}

func NewServerFunctionGateway(store ServerFunctionGatewayStore, allowedOrigins ...[]string) *ServerFunctionGateway {
	origins := make(map[string]struct{})
	if len(allowedOrigins) > 0 {
		for _, candidate := range allowedOrigins[0] {
			if origin, ok := normalizedServerFunctionMutationOrigin(candidate); ok {
				origins[origin] = struct{}{}
			}
		}
	}
	mutations, _ := store.(ServerFunctionMutationStore)
	return &ServerFunctionGateway{
		store:                  store,
		mutations:              mutations,
		allowedMutationOrigins: origins,
		now:                    func() time.Time { return time.Now().UTC() },
	}
}

func (gateway *ServerFunctionGateway) Available() bool {
	return gateway != nil && gateway.store != nil && gateway.now != nil
}

func normalizedServerFunctionMutationOrigin(value string) (string, bool) {
	value = strings.TrimSpace(value)
	parsed, err := url.Parse(value)
	if err != nil || parsed == nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return "", false
	}
	hostname := strings.ToLower(parsed.Hostname())
	loopback := hostname == "localhost" || hostname == "127.0.0.1" || hostname == "::1" || strings.HasSuffix(hostname, ".localhost")
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && loopback) {
		return "", false
	}
	origin := parsed.Scheme + "://" + parsed.Host
	return origin, value == origin || value == origin+"/"
}

func (gateway *ServerFunctionGateway) authorizeMutationRequest(authority *ServerFunctionMutationRequestAuthority) error {
	if authority == nil || authority.Intent != serverFunctionMutationIntent {
		return ErrServerFunctionMutationOrigin
	}
	origin, ok := normalizedServerFunctionMutationOrigin(authority.Origin)
	if !ok {
		return ErrServerFunctionMutationOrigin
	}
	if _, allowed := gateway.allowedMutationOrigins[origin]; !allowed {
		return ErrServerFunctionMutationOrigin
	}
	return nil
}

func serverFunctionValueContainsForbidden(value any, forbidden []string) bool {
	switch current := value.(type) {
	case string:
		for _, candidate := range forbidden {
			candidate = strings.TrimSpace(candidate)
			if candidate != "" && strings.Contains(current, candidate) {
				return true
			}
		}
	case []any:
		for _, entry := range current {
			if serverFunctionValueContainsForbidden(entry, forbidden) {
				return true
			}
		}
	case map[string]any:
		for key, entry := range current {
			if serverFunctionValueContainsForbidden(key, forbidden) || serverFunctionValueContainsForbidden(entry, forbidden) {
				return true
			}
		}
	}
	return false
}

func exactJSONFields(value json.RawMessage, required []string, optional ...string) (map[string]json.RawMessage, bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(value, &fields) != nil {
		return nil, false
	}
	allowed := make(map[string]bool, len(required)+len(optional))
	for _, field := range required {
		allowed[field] = true
		if _, exists := fields[field]; !exists {
			return nil, false
		}
	}
	for _, field := range optional {
		allowed[field] = true
	}
	for field := range fields {
		if !allowed[field] {
			return nil, false
		}
	}
	return fields, true
}

func normalizedServerFunctionID(value string, export bool) (string, bool) {
	normalized := strings.TrimSpace(value)
	pattern := serverFunctionCanonicalID
	if export {
		pattern = serverFunctionExportName
	}
	return normalized, value == normalized && len(normalized) > 0 && len(normalized) <= 256 && pattern.MatchString(normalized)
}

func decodeServerFunctionInvocation(body []byte) (*ServerFunctionInvocation, error) {
	if !utf8.Valid(body) {
		return nil, ErrServerFunctionInvalidRequest
	}
	fields, ok := exactJSONFields(body, []string{"type", "requestId", "invocationId", "attempt", "functionRef", "input"})
	if !ok {
		return nil, ErrServerFunctionInvalidRequest
	}
	refFields, ok := exactJSONFields(fields["functionRef"], []string{"artifactId", "exportName"})
	if !ok {
		return nil, ErrServerFunctionInvalidRequest
	}
	var invocation ServerFunctionInvocation
	if json.Unmarshal(body, &invocation) != nil || json.Unmarshal(refFields["artifactId"], &invocation.FunctionRef.ArtifactID) != nil || json.Unmarshal(refFields["exportName"], &invocation.FunctionRef.ExportName) != nil {
		return nil, ErrServerFunctionInvalidRequest
	}
	artifactID, artifactOK := normalizedServerFunctionID(invocation.FunctionRef.ArtifactID, false)
	exportName, exportOK := normalizedServerFunctionID(invocation.FunctionRef.ExportName, true)
	invocationID, invocationOK := normalizedDataGatewayID(invocation.InvocationID)
	requestID, requestOK := normalizedDataGatewayID(invocation.RequestID)
	if invocation.Type != serverFunctionRequestType || !artifactOK || !exportOK || !invocationOK || !requestOK || invocation.Attempt != 1 || requestID != fmt.Sprintf("%s:%d", invocationID, invocation.Attempt) || len(invocation.Input) == 0 {
		return nil, ErrServerFunctionInvalidRequest
	}
	invocation.FunctionRef.ArtifactID = artifactID
	invocation.FunctionRef.ExportName = exportName
	invocation.InvocationID = invocationID
	invocation.RequestID = requestID
	return &invocation, nil
}

func validServerFunctionAuth(raw json.RawMessage, entry serverFunctionProfileEntry) bool {
	if entry.Auth.Kind == "public" || entry.Auth.Kind == "authenticated" {
		fields, ok := exactJSONFields(raw, []string{"kind"})
		return ok && len(fields) == 1
	}
	if entry.Auth.Kind != "permission" || entry.Auth.PermissionID == "" || len(entry.Auth.PermissionID) > 256 || !serverFunctionCanonicalID.MatchString(entry.Auth.PermissionID) {
		return false
	}
	_, ok := exactJSONFields(raw, []string{"kind", "permissionId"})
	return ok
}

func validServerFunctionEnvironment(raw json.RawMessage, entry serverFunctionProfileEntry) bool {
	if len(raw) == 0 {
		return entry.Environment == nil
	}
	fields, ok := exactJSONFields(raw, []string{"secretsByField"})
	if !ok || entry.Environment == nil || entry.Environment.SecretsByField == nil {
		return false
	}
	var rawReferences map[string]json.RawMessage
	if json.Unmarshal(fields["secretsByField"], &rawReferences) != nil || len(rawReferences) == 0 || len(rawReferences) > 32 || len(rawReferences) != len(entry.Environment.SecretsByField) {
		return false
	}
	for field, rawReference := range rawReferences {
		if _, valid := normalizedServerFunctionID(field, false); !valid {
			return false
		}
		referenceFields, valid := exactJSONFields(rawReference, []string{"bindingId"})
		if !valid {
			return false
		}
		var bindingID string
		if json.Unmarshal(referenceFields["bindingId"], &bindingID) != nil {
			return false
		}
		if _, valid := normalizedServerFunctionID(bindingID, false); !valid || entry.Environment.SecretsByField[field].BindingID != bindingID {
			return false
		}
	}
	return true
}

func compileServerFunctionSchema(raw json.RawMessage, resource string) (*jsonschema.Schema, error) {
	if !serverFunctionSchemaEnvelopeAllowed(raw) {
		return nil, ErrServerFunctionDenied
	}
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return nil, ErrServerFunctionDenied
	}
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	if err := compiler.AddResource(resource, document); err != nil {
		return nil, ErrServerFunctionDenied
	}
	schema, err := compiler.Compile(resource)
	if err != nil {
		return nil, ErrServerFunctionDenied
	}
	return schema, nil
}

func serverFunctionSchemaEnvelopeAllowed(raw json.RawMessage) bool {
	if len(raw) == 0 || len(raw) > maximumServerFunctionSchemaBytes {
		return false
	}
	var tree any
	nodes := 0
	if json.Unmarshal(raw, &tree) != nil || !serverFunctionSchemaTreeAllowed(tree, 0, &nodes) {
		return false
	}
	switch tree.(type) {
	case bool, map[string]any:
		return true
	default:
		return false
	}
}

func serverFunctionSchemaTreeAllowed(value any, depth int, nodes *int) bool {
	if depth > maximumServerFunctionSchemaDepth {
		return false
	}
	*nodes++
	if *nodes > maximumServerFunctionSchemaNodes {
		return false
	}
	switch current := value.(type) {
	case []any:
		for _, entry := range current {
			if !serverFunctionSchemaTreeAllowed(entry, depth+1, nodes) {
				return false
			}
		}
	case map[string]any:
		for key, entry := range current {
			if key == "$ref" || key == "$dynamicRef" || key == "$recursiveRef" {
				ref, ok := entry.(string)
				if !ok || !strings.HasPrefix(ref, "#") {
					return false
				}
			}
			if !serverFunctionSchemaTreeAllowed(entry, depth+1, nodes) {
				return false
			}
		}
	}
	return true
}

func decodeServerFunctionProfile(contents []byte, artifactID string, exportName string) (*serverFunctionProfileEntry, *jsonschema.Schema, *jsonschema.Schema, error) {
	documentFields, ok := exactJSONFields(contents, []string{"language", "source"}, "metadata")
	if !ok {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	var document serverFunctionCodeDocument
	if json.Unmarshal(contents, &document) != nil || (document.Language != "ts" && document.Language != "js") {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	metadataRaw, exists := documentFields["metadata"]
	if !exists {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	var metadata map[string]json.RawMessage
	if json.Unmarshal(metadataRaw, &metadata) != nil {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	profileRaw, exists := metadata[serverRuntimeMetadataKey]
	if !exists {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	profileFields, ok := exactJSONFields(profileRaw, []string{"schemaVersion", "functionsByExport"})
	if !ok {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	var profile serverFunctionProfile
	if json.Unmarshal(profileRaw, &profile) != nil || profile.SchemaVersion != "1.0" || len(profile.FunctionsByExport) == 0 || len(profile.FunctionsByExport) > 128 {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	var functionFieldsByExport map[string]json.RawMessage
	if json.Unmarshal(profileFields["functionsByExport"], &functionFieldsByExport) != nil || len(functionFieldsByExport) != len(profile.FunctionsByExport) {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	for name, entry := range profile.FunctionsByExport {
		if _, valid := normalizedServerFunctionID(name, true); !valid {
			return nil, nil, nil, ErrServerFunctionDenied
		}
		entryRaw := functionFieldsByExport[name]
		entryFields, valid := exactJSONFields(entryRaw, []string{"kind", "runtimeZone", "adapterId", "effect", "auth", "inputSchema", "outputSchema"}, "idempotency", "environment")
		if !valid || !validServerFunctionAuth(entryFields["auth"], entry) || !validServerFunctionEnvironment(entryFields["environment"], entry) || (entry.Kind != "function" && entry.Kind != "route-loader" && entry.Kind != "route-action" && entry.Kind != "route-guard") || (entry.RuntimeZone != "server" && entry.RuntimeZone != "edge") || (entry.Effect != "read" && entry.Effect != "mutation") {
			return nil, nil, nil, ErrServerFunctionDenied
		}
		if _, valid := normalizedServerFunctionID(entry.AdapterID, false); !valid {
			return nil, nil, nil, ErrServerFunctionDenied
		}
		if !serverFunctionSchemaEnvelopeAllowed(entry.InputSchema) || !serverFunctionSchemaEnvelopeAllowed(entry.OutputSchema) {
			return nil, nil, nil, ErrServerFunctionDenied
		}
		if len(entry.Idempotency) > 0 {
			idempotencyFields, valid := exactJSONFields(entry.Idempotency, []string{"kind"})
			var kind string
			if !valid || json.Unmarshal(idempotencyFields["kind"], &kind) != nil || kind != "invocation-key" || entry.Effect != "mutation" {
				return nil, nil, nil, ErrServerFunctionDenied
			}
		}
	}
	entry, exists := profile.FunctionsByExport[exportName]
	if !exists {
		return nil, nil, nil, ErrServerFunctionDenied
	}
	inputSchema, err := compileServerFunctionSchema(entry.InputSchema, "urn:prodivix:server-function:"+artifactID+":"+exportName+":input")
	if err != nil {
		return nil, nil, nil, err
	}
	outputSchema, err := compileServerFunctionSchema(entry.OutputSchema, "urn:prodivix:server-function:"+artifactID+":"+exportName+":output")
	if err != nil {
		return nil, nil, nil, err
	}
	return &entry, inputSchema, outputSchema, nil
}

func validateServerFunctionValue(schema *jsonschema.Schema, raw json.RawMessage, failure error) (any, error) {
	value, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	nodes := 0
	if err != nil || !serverFunctionExecutionValueAllowed(value, 0, &nodes) || schema.Validate(value) != nil {
		return nil, failure
	}
	return value, nil
}

func serverFunctionExecutionValueAllowed(value any, depth int, nodes *int) bool {
	if depth > maximumServerFunctionValueDepth {
		return false
	}
	*nodes++
	if *nodes > maximumServerFunctionValueNodes {
		return false
	}
	switch current := value.(type) {
	case nil, string, bool:
		return true
	case json.Number:
		number, err := current.Float64()
		return err == nil && !math.IsInf(number, 0) && !math.IsNaN(number)
	case []any:
		for _, entry := range current {
			if !serverFunctionExecutionValueAllowed(entry, depth+1, nodes) {
				return false
			}
		}
		return true
	case map[string]any:
		for _, entry := range current {
			if !serverFunctionExecutionValueAllowed(entry, depth+1, nodes) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func hasServerFunctionInvocationKeyPolicy(raw json.RawMessage) bool {
	fields, ok := exactJSONFields(raw, []string{"kind"})
	if !ok {
		return false
	}
	var kind string
	return json.Unmarshal(fields["kind"], &kind) == nil && kind == "invocation-key"
}

func exactServerFunctionValueFields(value any, required []string, optional ...string) (map[string]any, bool) {
	record, ok := value.(map[string]any)
	if !ok {
		return nil, false
	}
	allowed := make(map[string]bool, len(required)+len(optional))
	for _, field := range required {
		allowed[field] = true
		if _, exists := record[field]; !exists {
			return nil, false
		}
	}
	for _, field := range optional {
		allowed[field] = true
	}
	for field := range record {
		if !allowed[field] {
			return nil, false
		}
	}
	return record, true
}

func decodeServerFunctionExecutionStatePutInput(value any) (string, json.RawMessage, error) {
	root, ok := exactServerFunctionValueFields(value, []string{"format", "route", "submission"})
	if !ok || root["format"] != "prodivix.route-action-input.v1" {
		return "", nil, ErrServerFunctionInputInvalid
	}
	if _, routeOK := root["route"].(map[string]any); !routeOK {
		return "", nil, ErrServerFunctionInputInvalid
	}
	submission, ok := exactServerFunctionValueFields(root["submission"], []string{"method", "encType", "value"})
	if !ok || submission["encType"] != "application/json" {
		return "", nil, ErrServerFunctionInputInvalid
	}
	method, _ := submission["method"].(string)
	if method != "POST" && method != "PUT" && method != "PATCH" {
		return "", nil, ErrServerFunctionInputInvalid
	}
	payload, ok := exactServerFunctionValueFields(submission["value"], []string{"key", "value"})
	key, keyOK := payload["key"].(string)
	if !ok || !keyOK || !serverFunctionStateKey.MatchString(key) {
		return "", nil, ErrServerFunctionInputInvalid
	}
	encoded, err := json.Marshal(payload["value"])
	if err != nil || len(encoded) == 0 || int64(len(encoded)) > maximumServerFunctionRequestBytes {
		return "", nil, ErrServerFunctionInputInvalid
	}
	return key, json.RawMessage(encoded), nil
}

func serverFunctionMutationRequestHash(authority ExecutionAuthority, entry serverFunctionProfileEntry, invocation ServerFunctionInvocation, origin string, canonicalInput []byte) (string, error) {
	codeRevision := authority.PartitionRevisions["document:"+invocation.FunctionRef.ArtifactID+":content"]
	if codeRevision == "" {
		return "", ErrServerFunctionDenied
	}
	payload := struct {
		Format         string                  `json:"format"`
		WorkspaceID    string                  `json:"workspaceId"`
		SnapshotID     string                  `json:"snapshotId"`
		CodeRevision   string                  `json:"codeRevision"`
		FunctionRef    serverFunctionReference `json:"functionRef"`
		AdapterID      string                  `json:"adapterId"`
		Origin         string                  `json:"origin"`
		InvocationID   string                  `json:"invocationId"`
		CanonicalInput json.RawMessage         `json:"canonicalInput"`
	}{
		Format:         "prodivix.server-function-mutation-replay.v1",
		WorkspaceID:    authority.WorkspaceID,
		SnapshotID:     authority.SnapshotID,
		CodeRevision:   codeRevision,
		FunctionRef:    invocation.FunctionRef,
		AdapterID:      entry.AdapterID,
		Origin:         origin,
		InvocationID:   invocation.InvocationID,
		CanonicalInput: json.RawMessage(canonicalInput),
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", ErrServerFunctionInvalidRequest
	}
	digest := sha256.Sum256(encoded)
	return fmt.Sprintf("%x", digest[:]), nil
}

func authorizeServerFunctionEntry(entry serverFunctionProfileEntry) error {
	switch entry.AdapterID {
	case "core.auth.current-principal":
		if entry.Environment != nil || (entry.Kind != "route-loader" && entry.Kind != "function") || entry.RuntimeZone != "server" || entry.Effect != "read" || (entry.Auth.Kind != "authenticated" && !(entry.Auth.Kind == "permission" && entry.Auth.PermissionID == "workspace.owner")) {
			return ErrServerFunctionDenied
		}
	case "core.auth.require-workspace-owner":
		if entry.Environment != nil || entry.Kind != "route-guard" || entry.RuntimeZone != "server" || entry.Effect != "read" || entry.Auth.Kind != "permission" || entry.Auth.PermissionID != "workspace.owner" {
			return ErrServerFunctionDenied
		}
	case serverFunctionExecutionStatePutAdapterID:
		if entry.Environment != nil || entry.Kind != "route-action" || entry.RuntimeZone != "server" || entry.Effect != "mutation" || entry.Auth.Kind != "authenticated" || !hasServerFunctionInvocationKeyPolicy(entry.Idempotency) {
			return ErrServerFunctionDenied
		}
	case serverFunctionHMACSHA256AdapterID:
		if !validServerFunctionHMACPolicy(entry) {
			return ErrServerFunctionDenied
		}
	default:
		return ErrServerFunctionDenied
	}
	return nil
}

// Invoke resolves only an exact snapshot-bound code profile. Project source is never evaluated in the API process.
func (gateway *ServerFunctionGateway) Invoke(ctx context.Context, principal ServerFunctionPrincipalSession, executionID string, invocation ServerFunctionInvocation, requestAuthorities ...ServerFunctionMutationRequestAuthority) (*ServerFunctionBridgeResponse, error) {
	if !gateway.Available() {
		return nil, ErrServerFunctionUnavailable
	}
	executionID, executionOK := normalizedDataGatewayID(executionID)
	if !executionOK || principal.PrincipalID == "" || principal.SessionID == "" || principal.ExpiresAt <= gateway.now().UnixMilli() {
		return nil, ErrServerFunctionDenied
	}
	authority, err := gateway.store.GetExecutionAuthority(ctx, principal.PrincipalID, principal.SessionID, executionID)
	if err != nil || authority.OwnerID != principal.PrincipalID || authority.SessionID != principal.SessionID {
		return nil, ErrServerFunctionDenied
	}
	contents, err := gateway.store.GetCodeDocument(ctx, *authority, invocation.FunctionRef.ArtifactID)
	if err != nil || len(contents) == 0 || len(contents) > maximumServerFunctionCodeDocumentBytes {
		return nil, ErrServerFunctionDenied
	}
	entry, inputSchema, outputSchema, err := decodeServerFunctionProfile(contents, invocation.FunctionRef.ArtifactID, invocation.FunctionRef.ExportName)
	if err != nil || entry == nil {
		return nil, ErrServerFunctionDenied
	}
	if authorizeServerFunctionEntry(*entry) != nil {
		return nil, ErrServerFunctionDenied
	}
	if entry.Auth.Kind == "permission" {
		if err := gateway.store.VerifyWorkspaceOwner(ctx, principal.PrincipalID, authority.WorkspaceID); err != nil {
			return nil, ErrServerFunctionDenied
		}
	}
	validatedInput, err := validateServerFunctionValue(inputSchema, invocation.Input, ErrServerFunctionInputInvalid)
	if err != nil {
		return nil, err
	}
	var requestAuthority *ServerFunctionMutationRequestAuthority
	if len(requestAuthorities) > 0 {
		requestAuthority = &requestAuthorities[0]
	}
	if entry.Effect == "mutation" {
		if err := gateway.authorizeMutationRequest(requestAuthority); err != nil {
			return nil, err
		}
		if serverFunctionValueContainsForbidden(validatedInput, requestAuthority.ForbiddenValues) {
			return nil, ErrServerFunctionDenied
		}
	}

	var outcome serverFunctionOutcome
	switch entry.AdapterID {
	case "core.auth.current-principal":
		outcome = serverFunctionOutcome{Kind: "value", Value: map[string]any{"providerId": productAuthProviderID, "principalId": principal.PrincipalID}}
	case "core.auth.require-workspace-owner":
		outcome = serverFunctionOutcome{Kind: "allow"}
	case serverFunctionExecutionStatePutAdapterID:
		if gateway.mutations == nil {
			return nil, ErrServerFunctionUnavailable
		}
		stateKey, stateValue, decodeErr := decodeServerFunctionExecutionStatePutInput(validatedInput)
		if decodeErr != nil {
			return nil, decodeErr
		}
		canonicalInput, marshalErr := json.Marshal(validatedInput)
		if marshalErr != nil {
			return nil, ErrServerFunctionInputInvalid
		}
		mutationOrigin, originOK := normalizedServerFunctionMutationOrigin(requestAuthority.Origin)
		if !originOK {
			return nil, ErrServerFunctionMutationOrigin
		}
		requestHash, hashErr := serverFunctionMutationRequestHash(*authority, *entry, invocation, mutationOrigin, canonicalInput)
		if hashErr != nil {
			return nil, hashErr
		}
		result, applyErr := gateway.mutations.ApplyServerFunctionExecutionStateMutation(ctx, ServerFunctionExecutionStateMutationKey{
			ExecutionID:  executionID,
			ArtifactID:   invocation.FunctionRef.ArtifactID,
			ExportName:   invocation.FunctionRef.ExportName,
			InvocationID: invocation.InvocationID,
			StateKey:     stateKey,
		}, requestHash, stateValue)
		if applyErr != nil {
			return nil, applyErr
		}
		outcome = serverFunctionOutcome{Kind: "value", Value: result}
	case serverFunctionHMACSHA256AdapterID:
		outcome, err = gateway.executeHMACSHA256(ctx, principal, executionID, *authority, *entry, invocation, validatedInput)
		if err != nil {
			return nil, err
		}
	default:
		return nil, ErrServerFunctionDenied
	}
	if outcome.Kind == "value" {
		if requestAuthority != nil && serverFunctionValueContainsForbidden(outcome.Value, requestAuthority.ForbiddenValues) {
			return nil, ErrServerFunctionOutputInvalid
		}
		encoded, marshalErr := json.Marshal(outcome.Value)
		if marshalErr != nil {
			return nil, ErrServerFunctionOutputInvalid
		}
		if _, validateErr := validateServerFunctionValue(outputSchema, encoded, ErrServerFunctionOutputInvalid); validateErr != nil {
			return nil, validateErr
		}
	}
	return &ServerFunctionBridgeResponse{Type: serverFunctionResponseType, RequestID: invocation.RequestID, OK: true, Result: outcome}, nil
}

func serverFunctionGatewayErrorStatus(err error) (int, string, string) {
	switch {
	case errors.Is(err, ErrServerFunctionInvalidRequest):
		return http.StatusBadRequest, "SVR-1001", "Remote Server Function invocation is invalid."
	case errors.Is(err, ErrServerFunctionInputInvalid):
		return http.StatusUnprocessableEntity, "SVR-2001", "Remote Server Function input does not match its schema."
	case errors.Is(err, ErrServerFunctionMutationOrigin):
		return http.StatusForbidden, "SVR-3001", "Remote Server Function mutation request authority is invalid."
	case errors.Is(err, ErrServerFunctionReplayConflict):
		return http.StatusConflict, "SVR-3002", "Remote Server Function mutation identity conflicts with an earlier dispatch."
	case errors.Is(err, ErrServerFunctionReplayCapacity):
		return http.StatusTooManyRequests, "SVR-3003", "Remote Server Function mutation replay capacity is exhausted."
	case errors.Is(err, ErrServerFunctionOutputInvalid):
		return http.StatusBadGateway, "SVR-5002", "Remote Server Function output does not match its schema."
	case errors.Is(err, ErrServerFunctionDenied):
		return http.StatusNotFound, "SVR-4004", "Remote Server Function was not found."
	default:
		return http.StatusServiceUnavailable, "SVR-5001", "Remote Server Function gateway is unavailable."
	}
}
