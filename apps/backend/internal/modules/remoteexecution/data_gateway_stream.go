package remoteexecution

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"strings"
	"time"

	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

const (
	maximumDataGatewayStreamEvents      = 256
	maximumDataGatewayStreamFrameBytes  = 256 * 1024
	maximumDataGatewayStreamBytes       = 4 * 1024 * 1024
	maximumDataGatewayStreamDuration    = 5 * time.Minute
	maximumDataGatewayStreamIdle        = 30 * time.Second
	maximumConcurrentDataGatewayStreams = 32
	maximumDataGatewayResumeTokenBytes  = 4096
	maximumDataGatewayUpstreamCursor    = 1024
	maximumDataGatewayReconnects        = 4
	maximumDataGatewayReconnectDelay    = 30 * time.Second
	maximumDataGatewayCollectionItems   = 10_000
)

type DataGatewayStreamEvent struct {
	Cursor int64                    `json:"cursor"`
	Value  any                      `json:"value"`
	Resume *DataGatewayStreamResume `json:"resume,omitempty"`
}

type dataGatewayStreamCheckpoint struct {
	Format         string `json:"format"`
	ExecutionID    string `json:"executionId"`
	DocumentID     string `json:"documentId"`
	OperationID    string `json:"operationId"`
	InvocationID   string `json:"invocationId"`
	Sequence       int64  `json:"sequence"`
	Cursor         int64  `json:"cursor"`
	UpstreamCursor string `json:"upstreamCursor"`
	OpenedAt       int64  `json:"openedAt"`
	TotalBytes     int64  `json:"totalBytes"`
}

type dataGatewaySecretFingerprint struct {
	byteLength int
	digest     [sha256.Size]byte
}

type DataGatewayStreamSession struct {
	Network dataGatewayNetworkTrace

	body               io.ReadCloser
	scanner            *bufio.Scanner
	mediaType          string
	adapter            string
	mapFrame           func(string) (any, error)
	openedAt           time.Time
	cursor             int64
	totalBytes         int64
	resume             *dataGatewayStreamPolicy
	checkpoint         dataGatewayStreamCheckpoint
	secretFingerprints []dataGatewaySecretFingerprint
	checkpointKey      [sha256.Size]byte
	closed             bool
	release            func()
}

type dataGatewayRawStreamFrame struct {
	data           string
	upstreamCursor string
	complete       bool
	disconnected   bool
	err            error
}

func validDataGatewayUpstreamCursor(value string) bool {
	return value != "" && len(value) <= maximumDataGatewayUpstreamCursor && !strings.ContainsAny(value, "\x00\r\n")
}

func encodeDataGatewayStreamCheckpoint(value dataGatewayStreamCheckpoint, key [sha256.Size]byte) (string, error) {
	if !validDataGatewayUpstreamCursor(value.UpstreamCursor) || value.Cursor < 1 || value.TotalBytes < 0 || value.TotalBytes > maximumDataGatewayStreamBytes {
		return "", ErrDataGatewayStreamConflict
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", ErrDataGatewayStreamConflict
	}
	mac := hmac.New(sha256.New, key[:])
	_, _ = mac.Write(encoded)
	token := base64.RawURLEncoding.EncodeToString(encoded) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if len(token) > maximumDataGatewayResumeTokenBytes {
		return "", ErrDataGatewayStreamConflict
	}
	return token, nil
}

func decodeDataGatewayStreamCheckpoint(token string, expected dataGatewayStreamCheckpoint, now time.Time, key [sha256.Size]byte) (dataGatewayStreamCheckpoint, error) {
	if token == "" || len(token) > maximumDataGatewayResumeTokenBytes {
		return dataGatewayStreamCheckpoint{}, ErrDataGatewayStreamConflict
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return dataGatewayStreamCheckpoint{}, ErrDataGatewayStreamConflict
	}
	encoded, err := base64.RawURLEncoding.DecodeString(parts[0])
	signature, signatureErr := base64.RawURLEncoding.DecodeString(parts[1])
	mac := hmac.New(sha256.New, key[:])
	_, _ = mac.Write(encoded)
	if err != nil || signatureErr != nil || len(encoded) > maximumDataGatewayResumeTokenBytes || !hmac.Equal(signature, mac.Sum(nil)) {
		return dataGatewayStreamCheckpoint{}, ErrDataGatewayStreamConflict
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(encoded, &fields) != nil || len(fields) != 10 {
		return dataGatewayStreamCheckpoint{}, ErrDataGatewayStreamConflict
	}
	for _, key := range []string{"format", "executionId", "documentId", "operationId", "invocationId", "sequence", "cursor", "upstreamCursor", "openedAt", "totalBytes"} {
		if _, exists := fields[key]; !exists {
			return dataGatewayStreamCheckpoint{}, ErrDataGatewayStreamConflict
		}
	}
	var value dataGatewayStreamCheckpoint
	if json.Unmarshal(encoded, &value) != nil || value.Format != "prodivix.data-stream-checkpoint.v1" || value.ExecutionID != expected.ExecutionID || value.DocumentID != expected.DocumentID || value.OperationID != expected.OperationID || value.InvocationID != expected.InvocationID || value.Sequence != expected.Sequence || value.Cursor < 1 || !validDataGatewayUpstreamCursor(value.UpstreamCursor) || value.TotalBytes < 0 || value.TotalBytes > maximumDataGatewayStreamBytes {
		return dataGatewayStreamCheckpoint{}, ErrDataGatewayStreamConflict
	}
	openedAt := time.UnixMilli(value.OpenedAt)
	if openedAt.After(now) || now.Sub(openedAt) >= maximumDataGatewayStreamDuration {
		return dataGatewayStreamCheckpoint{}, ErrDataGatewayStreamCapacity
	}
	return value, nil
}

func dataGatewayStreamContainsCredential(value any, fingerprints []dataGatewaySecretFingerprint) bool {
	if len(fingerprints) == 0 {
		return false
	}
	switch current := value.(type) {
	case string:
		contents := []byte(current)
		for _, fingerprint := range fingerprints {
			if len(contents) == fingerprint.byteLength && sha256.Sum256(contents) == fingerprint.digest {
				return true
			}
		}
	case []any:
		for _, entry := range current {
			if dataGatewayStreamContainsCredential(entry, fingerprints) {
				return true
			}
		}
	case map[string]any:
		for key, entry := range current {
			if dataGatewayStreamContainsCredential(key, fingerprints) || dataGatewayStreamContainsCredential(entry, fingerprints) {
				return true
			}
		}
	}
	return false
}

func (gateway *DataGateway) claimStream(identity string) (func(), error) {
	gateway.streamMu.Lock()
	defer gateway.streamMu.Unlock()
	if _, exists := gateway.activeStreams[identity]; exists {
		return nil, ErrDataGatewayStreamConflict
	}
	if len(gateway.activeStreams) >= maximumConcurrentDataGatewayStreams {
		return nil, ErrDataGatewayStreamCapacity
	}
	gateway.activeStreams[identity] = struct{}{}
	return func() {
		gateway.streamMu.Lock()
		delete(gateway.activeStreams, identity)
		gateway.streamMu.Unlock()
	}, nil
}

func streamMediaType(value string) (string, bool) {
	mediaType, _, err := mime.ParseMediaType(value)
	if err != nil || (mediaType != "text/event-stream" && mediaType != "application/x-ndjson" && mediaType != "application/ndjson") {
		return "", false
	}
	return mediaType, true
}

func streamScanner(body io.Reader) *bufio.Scanner {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 4096), maximumDataGatewayStreamFrameBytes+1)
	return scanner
}

func readNDJSONFrame(scanner *bufio.Scanner) dataGatewayRawStreamFrame {
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		return dataGatewayRawStreamFrame{data: line}
	}
	if err := scanner.Err(); err != nil {
		return dataGatewayRawStreamFrame{err: ErrDataGatewayUpstream}
	}
	return dataGatewayRawStreamFrame{complete: true}
}

func readSSEFrame(scanner *bufio.Scanner, currentUpstreamCursor string) dataGatewayRawStreamFrame {
	eventType := "message"
	dataLines := make([]string, 0, 2)
	bytesRead := 0
	upstreamCursor := currentUpstreamCursor
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if line == "" {
			if eventType == "complete" {
				return dataGatewayRawStreamFrame{complete: true, upstreamCursor: upstreamCursor}
			}
			if len(dataLines) > 0 {
				return dataGatewayRawStreamFrame{data: strings.Join(dataLines, "\n"), upstreamCursor: upstreamCursor}
			}
			eventType = "message"
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		name, value, found := strings.Cut(line, ":")
		if found {
			value = strings.TrimPrefix(value, " ")
		}
		switch name {
		case "event":
			eventType = value
		case "id":
			if value != "" && !validDataGatewayUpstreamCursor(value) {
				return dataGatewayRawStreamFrame{err: ErrDataGatewayUpstream}
			}
			upstreamCursor = value
		case "data":
			bytesRead += len(value)
			if bytesRead > maximumDataGatewayStreamFrameBytes {
				return dataGatewayRawStreamFrame{err: ErrDataGatewayUpstream}
			}
			dataLines = append(dataLines, value)
		}
	}
	if err := scanner.Err(); err != nil {
		return dataGatewayRawStreamFrame{err: ErrDataGatewayUpstream}
	}
	if eventType == "complete" {
		return dataGatewayRawStreamFrame{complete: true, upstreamCursor: upstreamCursor}
	}
	if len(dataLines) > 0 {
		return dataGatewayRawStreamFrame{data: strings.Join(dataLines, "\n"), upstreamCursor: upstreamCursor}
	}
	return dataGatewayRawStreamFrame{complete: true, disconnected: true, upstreamCursor: upstreamCursor}
}

func (session *DataGatewayStreamSession) Close() error {
	if session == nil || session.closed {
		return nil
	}
	session.closed = true
	if session.release != nil {
		session.release()
		session.release = nil
	}
	return session.body.Close()
}

func (session *DataGatewayStreamSession) upstreamError() error {
	switch session.adapter {
	case "core.graphql":
		return ErrDataGatewayGraphQLUpstream
	case "core.asyncapi":
		return ErrDataGatewayAsyncAPIUpstream
	default:
		return ErrDataGatewayUpstream
	}
}

func (session *DataGatewayStreamSession) Next(ctx context.Context) (*DataGatewayStreamEvent, bool, error) {
	if session == nil || session.closed {
		return nil, true, nil
	}
	if time.Since(session.openedAt) >= maximumDataGatewayStreamDuration || session.cursor >= maximumDataGatewayStreamEvents {
		_ = session.Close()
		return nil, true, ErrDataGatewayStreamCapacity
	}
	result := make(chan dataGatewayRawStreamFrame, 1)
	go func() {
		if session.mediaType == "text/event-stream" {
			result <- readSSEFrame(session.scanner, session.checkpoint.UpstreamCursor)
		} else {
			result <- readNDJSONFrame(session.scanner)
		}
	}()
	var raw dataGatewayRawStreamFrame
	select {
	case <-ctx.Done():
		_ = session.Close()
		return nil, true, ctx.Err()
	case <-time.After(maximumDataGatewayStreamIdle):
		_ = session.Close()
		return nil, true, session.upstreamError()
	case raw = <-result:
	}
	if raw.err != nil {
		_ = session.Close()
		return nil, true, session.upstreamError()
	}
	if raw.disconnected && session.resume != nil {
		_ = session.Close()
		return nil, true, session.upstreamError()
	}
	if raw.complete {
		_ = session.Close()
		return nil, true, nil
	}
	session.totalBytes += int64(len([]byte(raw.data)))
	if session.totalBytes > maximumDataGatewayStreamBytes {
		_ = session.Close()
		return nil, true, ErrDataGatewayStreamCapacity
	}
	value, err := session.mapFrame(raw.data)
	if err != nil {
		_ = session.Close()
		return nil, true, err
	}
	if dataGatewayStreamContainsCredential(value, session.secretFingerprints) {
		_ = session.Close()
		return nil, true, session.upstreamError()
	}
	session.cursor++
	event := &DataGatewayStreamEvent{Cursor: session.cursor, Value: value}
	if session.resume != nil {
		if session.mediaType != "text/event-stream" || !validDataGatewayUpstreamCursor(raw.upstreamCursor) {
			_ = session.Close()
			return nil, true, session.upstreamError()
		}
		session.checkpoint.Cursor = session.cursor
		session.checkpoint.UpstreamCursor = raw.upstreamCursor
		session.checkpoint.TotalBytes = session.totalBytes
		token, tokenErr := encodeDataGatewayStreamCheckpoint(session.checkpoint, session.checkpointKey)
		if tokenErr != nil {
			_ = session.Close()
			return nil, true, tokenErr
		}
		event.Resume = &DataGatewayStreamResume{Cursor: session.cursor, Token: token}
	}
	return event, false, nil
}

func graphQLStreamMapper(operation dataGatewayOperation, snapshot *backendenvironment.Snapshot, bindings map[string]dataConfigurationValue) (func(string) (any, error), error) {
	resultPath, err := optionalDataGatewayString(operation.ConfigurationByKey, "resultPath", "operation.resultPath", snapshot, bindings, "")
	if err != nil || (resultPath != "" && !isDataGatewayJSONPointer(resultPath)) {
		return nil, ErrDataGatewayDenied
	}
	partialPolicy, err := optionalDataGatewayString(operation.ConfigurationByKey, "partialErrorPolicy", "operation.partialErrorPolicy", snapshot, bindings, "reject")
	if err != nil || (partialPolicy != "reject" && partialPolicy != "allow-partial") {
		return nil, ErrDataGatewayDenied
	}
	return func(frame string) (any, error) {
		decoded, decodeErr := decodeDataGatewayJSON([]byte(frame))
		if decodeErr != nil {
			return nil, ErrDataGatewayGraphQLUpstream
		}
		envelope, ok := decoded.(map[string]any)
		if !ok {
			return nil, ErrDataGatewayGraphQLUpstream
		}
		if payload, exists := envelope["payload"].(map[string]any); exists {
			envelope = payload
		}
		if errorsValue, exists := envelope["errors"]; exists {
			errorsList, valid := errorsValue.([]any)
			if !valid || len(errorsList) > maximumGraphQLErrors || (len(errorsList) > 0 && partialPolicy == "reject") {
				return nil, ErrDataGatewayGraphQLUpstream
			}
			for _, item := range errorsList {
				record, valid := item.(map[string]any)
				message, hasMessage := record["message"].(string)
				if !valid || !hasMessage || message == "" {
					return nil, ErrDataGatewayGraphQLUpstream
				}
			}
		}
		value, exists := envelope["data"]
		if !exists {
			return nil, ErrDataGatewayGraphQLUpstream
		}
		if resultPath != "" {
			var found bool
			value, found, decodeErr = dataGatewayPointer(value, resultPath)
			if decodeErr != nil || !found {
				return nil, ErrDataGatewayGraphQLUpstream
			}
		}
		return value, nil
	}, nil
}

func asyncAPIStreamMapper(operation dataGatewayOperation, snapshot *backendenvironment.Snapshot, bindings map[string]dataConfigurationValue) (func(string) (any, error), error) {
	responsePath, err := optionalDataGatewayString(operation.ConfigurationByKey, "responseBodyPath", "operation.responseBodyPath", snapshot, bindings, "")
	if err != nil || (responsePath != "" && !isDataGatewayJSONPointer(responsePath)) {
		return nil, ErrDataGatewayDenied
	}
	return func(frame string) (any, error) {
		value, decodeErr := decodeDataGatewayJSON([]byte(frame))
		if decodeErr != nil {
			return nil, ErrDataGatewayAsyncAPIUpstream
		}
		if responsePath != "" {
			var found bool
			value, found, decodeErr = dataGatewayPointer(value, responsePath)
			if decodeErr != nil || !found {
				return nil, ErrDataGatewayAsyncAPIUpstream
			}
		}
		return value, nil
	}, nil
}

func validDataGatewayStreamPolicy(policy *dataGatewayStreamPolicy) bool {
	if policy == nil {
		return true
	}
	reconnect := policy.Reconnect
	if reconnect.Resume != "sse-last-event-id" || reconnect.MaximumReconnects < 1 || reconnect.MaximumReconnects > maximumDataGatewayReconnects || (reconnect.Backoff != "fixed" && reconnect.Backoff != "exponential") || reconnect.InitialDelayMS < 0 || time.Duration(reconnect.InitialDelayMS)*time.Millisecond > maximumDataGatewayReconnectDelay {
		return false
	}
	if reconnect.MaximumDelayMS != nil && (*reconnect.MaximumDelayMS < reconnect.InitialDelayMS || time.Duration(*reconnect.MaximumDelayMS)*time.Millisecond > maximumDataGatewayReconnectDelay) {
		return false
	}
	if policy.CredentialRenewal != "" && policy.CredentialRenewal != "per-connection" {
		return false
	}
	if policy.Collection != nil && (policy.Collection.Kind != "keyed-event-v1" || !isDataGatewayJSONPointer(policy.Collection.EntityIDPath) || policy.Collection.MaximumItems < 1 || policy.Collection.MaximumItems > maximumDataGatewayCollectionItems) {
		return false
	}
	return true
}

// OpenStream creates one execution-bound subscription and resolves Secret credentials only while each upstream connection is opened.
func (gateway *DataGateway) OpenStream(ctx context.Context, principal backendenvironment.PrincipalSession, executionID string, documentID string, operationID string, invocation DataGatewayInvocation) (*DataGatewayStreamSession, error) {
	if !gateway.Available() || gateway.streams == nil {
		return nil, ErrDataGatewayUnavailable
	}
	executionID, executionOK := normalizedDataGatewayID(executionID)
	documentID, documentOK := normalizedDataGatewayID(documentID)
	operationID, operationOK := normalizedDataGatewayID(operationID)
	invocationID, invocationOK := normalizedDataGatewayID(invocation.InvocationID)
	if !executionOK || !documentOK || !operationOK || !invocationOK || invocation.Sequence < 0 || invocation.Attempt != 1 {
		return nil, ErrDataGatewayInvalidRequest
	}
	authority, err := gateway.store.GetExecutionAuthority(ctx, principal.PrincipalID, principal.SessionID, executionID)
	if err != nil || authority.ProviderID != "prodivix.remote.preview" || authority.Profile != "preview" || authority.RuntimeZone != "client" || authority.Environment == nil || authority.Environment.Mode != "live" || authority.SessionID != principal.SessionID || !hasWorkspaceExecutionPermission(authority.Permissions, workspaceReadPermissionID) {
		return nil, ErrDataGatewayDenied
	}
	contents, err := gateway.store.GetDataSourceDocument(ctx, *authority, documentID)
	if err != nil {
		return nil, ErrDataGatewayDenied
	}
	document, operation, err := parseDataGatewayDocument(contents, documentID, operationID)
	if err != nil || operation.Kind != "subscription" || len(operation.ConfigurationByKey) == 0 || operation.Policies.Retry != nil || operation.Policies.Idempotency != nil || !validDataGatewayStreamPolicy(operation.Policies.Stream) {
		return nil, ErrDataGatewayDenied
	}
	if operation.Policies.Stream != nil && !gateway.checkpointKeyReady {
		return nil, ErrDataGatewayDenied
	}
	if document.Source.AdapterID != "core.graphql" && document.Source.AdapterID != "core.asyncapi" {
		return nil, ErrDataGatewayDenied
	}
	snapshot, err := gateway.environments.GetSnapshot(ctx, principal, authority.WorkspaceID, authority.Environment.EnvironmentID, authority.Environment.Revision)
	if err != nil || snapshot.Mode != "live" || snapshot.WorkspaceID != authority.WorkspaceID || snapshot.EnvironmentID != authority.Environment.EnvironmentID || snapshot.Revision != authority.Environment.Revision {
		return nil, ErrDataGatewayDenied
	}
	input, err := decodeInvocationInput(invocation.Input)
	if err != nil {
		return nil, err
	}
	bindingID, secretField, secretHeader, hasSecret, err := secretDataGatewayHeader(document.Source, *operation, snapshot)
	credentialRenewal := ""
	if operation.Policies.Stream != nil {
		credentialRenewal = operation.Policies.Stream.CredentialRenewal
	}
	if err != nil || (hasSecret && credentialRenewal != "per-connection") || (!hasSecret && credentialRenewal != "") {
		return nil, ErrDataGatewayDenied
	}
	checkpoint := dataGatewayStreamCheckpoint{
		Format: "prodivix.data-stream-checkpoint.v1", ExecutionID: executionID, DocumentID: documentID, OperationID: operationID,
		InvocationID: invocationID, Sequence: invocation.Sequence, OpenedAt: gateway.now().UnixMilli(),
	}
	if invocation.Resume != nil {
		if operation.Policies.Stream == nil || invocation.Resume.Cursor < 1 {
			return nil, ErrDataGatewayStreamConflict
		}
		checkpoint, err = decodeDataGatewayStreamCheckpoint(invocation.Resume.Token, checkpoint, gateway.now(), gateway.checkpointKey)
		if err != nil || checkpoint.Cursor != invocation.Resume.Cursor {
			return nil, ErrDataGatewayStreamConflict
		}
	}
	identity := strings.Join([]string{executionID, documentID, operationID, invocationID}, "\x00")
	release, err := gateway.claimStream(identity)
	if err != nil {
		return nil, err
	}
	releaseOnError := true
	defer func() {
		if releaseOnError {
			release()
		}
	}()
	var request DataGatewayTransportRequest
	var mapper func(string) (any, error)
	if document.Source.AdapterID == "core.graphql" {
		endpointText, resolveErr := resolvePublicString(document.Source.ConfigurationByKey["endpoint"], "source.endpoint", snapshot, document.Source.BindingsByID)
		if resolveErr != nil {
			return nil, resolveErr
		}
		endpoint, endpointErr := dataGatewayProtocolEndpoint(endpointText)
		if endpointErr != nil {
			return nil, endpointErr
		}
		operationDocument, resolveErr := resolvePublicString(operation.ConfigurationByKey["document"], "operation.document", snapshot, document.Source.BindingsByID)
		operationName, nameErr := optionalDataGatewayString(operation.ConfigurationByKey, "operationName", "operation.operationName", snapshot, document.Source.BindingsByID, "")
		if resolveErr != nil || nameErr != nil || validateGraphQLOperationDocument(operationDocument, operationName, "subscription") != nil {
			return nil, ErrDataGatewayDenied
		}
		variables := input
		if pointer, exists := operation.ConfigurationByKey["variablesInputPath"]; exists {
			path, pathErr := resolvePublicString(pointer, "operation.variablesInputPath", snapshot, document.Source.BindingsByID)
			var found bool
			variables, found, err = dataGatewayPointer(input, path)
			if pathErr != nil || err != nil || !found {
				return nil, ErrDataGatewayInvalidRequest
			}
		}
		if _, ok := variables.(map[string]any); !ok {
			return nil, ErrDataGatewayInvalidRequest
		}
		envelope := map[string]any{"query": operationDocument, "variables": variables}
		if operationName != "" {
			envelope["operationName"] = operationName
		}
		body, marshalErr := json.Marshal(envelope)
		if marshalErr != nil || int64(len(body)) > maximumDataGatewayRequestBytes {
			return nil, ErrDataGatewayInvalidRequest
		}
		request = DataGatewayTransportRequest{URL: endpoint.String(), Method: "POST", Headers: map[string]string{"accept": "text/event-stream", "content-type": "application/json"}, Body: body}
		mapper, err = graphQLStreamMapper(*operation, snapshot, document.Source.BindingsByID)
	} else {
		baseURL, resolveErr := resolvePublicString(document.Source.ConfigurationByKey["endpoint"], "source.endpoint", snapshot, document.Source.BindingsByID)
		path, pathErr := resolvePublicString(operation.ConfigurationByKey["path"], "operation.path", snapshot, document.Source.BindingsByID)
		endpoint, endpointErr := dataGatewayEndpoint(baseURL, path)
		action, actionErr := resolvePublicString(operation.ConfigurationByKey["action"], "operation.action", snapshot, document.Source.BindingsByID)
		if resolveErr != nil || pathErr != nil || endpointErr != nil || actionErr != nil || (action != "receive" && action != "stream") {
			return nil, ErrDataGatewayDenied
		}
		request = DataGatewayTransportRequest{URL: endpoint.String(), Method: "GET", Headers: map[string]string{"accept": "text/event-stream, application/x-ndjson"}}
		if action == "stream" {
			body, marshalErr := json.Marshal(input)
			if marshalErr != nil || int64(len(body)) > maximumDataGatewayRequestBytes {
				return nil, ErrDataGatewayInvalidRequest
			}
			request.Method = "POST"
			request.Headers["content-type"] = "application/json"
			request.Body = body
		}
		mapper, err = asyncAPIStreamMapper(*operation, snapshot, document.Source.BindingsByID)
	}
	if err != nil {
		return nil, err
	}
	if invocation.Resume != nil {
		request.Headers["last-event-id"] = checkpoint.UpstreamCursor
	}
	startedAt := gateway.now().UnixMilli()
	var upstream *DataGatewayStreamTransportResponse
	secretFingerprints := make([]dataGatewaySecretFingerprint, 0, 2)
	openUpstream := func() error {
		var openErr error
		upstream, openErr = gateway.streams.OpenStream(ctx, request)
		return openErr
	}
	if hasSecret {
		resourceID := strings.Join([]string{executionID, documentID, operationID, invocationID, fmt.Sprint(checkpoint.Cursor)}, ":")
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
			secretFingerprints = append(secretFingerprints, dataGatewaySecretFingerprint{byteLength: len(material), digest: sha256.Sum256(material)})
			bearer := append([]byte("Bearer "), material...)
			secretFingerprints = append(secretFingerprints, dataGatewaySecretFingerprint{byteLength: len(bearer), digest: sha256.Sum256(bearer)})
			for index := range bearer {
				bearer[index] = 0
			}
			defer delete(request.Headers, secretHeader)
			return openUpstream()
		})
	} else {
		err = openUpstream()
	}
	if err != nil {
		if upstream != nil && upstream.Body != nil {
			_ = upstream.Body.Close()
		}
		return nil, ErrDataGatewayUpstream
	}
	if upstream == nil || upstream.Body == nil {
		return nil, ErrDataGatewayUpstream
	}
	if upstream.Status < 200 || upstream.Status >= 300 {
		upstream.Body.Close()
		return nil, ErrDataGatewayUpstream
	}
	mediaType, ok := streamMediaType(upstream.ContentType)
	if !ok || (operation.Policies.Stream != nil && mediaType != "text/event-stream") {
		upstream.Body.Close()
		return nil, ErrDataGatewayDenied
	}
	completedAt := gateway.now().UnixMilli()
	if completedAt < startedAt {
		completedAt = startedAt
	}
	session := &DataGatewayStreamSession{
		body: upstream.Body, scanner: streamScanner(upstream.Body), mediaType: mediaType, adapter: document.Source.AdapterID, mapFrame: mapper,
		openedAt: time.UnixMilli(checkpoint.OpenedAt), cursor: checkpoint.Cursor, totalBytes: checkpoint.TotalBytes, resume: operation.Policies.Stream, checkpoint: checkpoint,
		secretFingerprints: secretFingerprints, checkpointKey: gateway.checkpointKey, release: release,
		Network: dataGatewayNetworkTrace{
			Format: "prodivix.execution-network-trace.v1", RequestID: invocationID + ":stream:" + fmt.Sprint(checkpoint.Cursor), Phase: "runtime", RuntimeZone: document.Source.RuntimeZone, Mode: "live", Adapter: document.Source.AdapterID,
			Method: request.Method, SanitizedURL: func() string { parsed, _ := urlFromRequest(request.URL); return parsed }(), Protocol: "https", StartedAt: startedAt, CompletedAt: completedAt, DurationMS: completedAt - startedAt,
			Outcome: "allowed", Status: upstream.Status, RequestBytes: int64(len(request.Body)), Correlation: dataGatewayCorrelation{Kind: "data-operation", DocumentID: documentID, OperationID: operationID, InvocationID: invocationID, Sequence: invocation.Sequence, Attempt: invocation.Attempt},
			Redacted: true, SourceTrace: dataGatewayProtocolSourceTrace(documentID, operationID),
		},
	}
	releaseOnError = false
	return session, nil
}

func urlFromRequest(raw string) (string, error) {
	parsed, err := dataGatewayProtocolEndpoint(raw)
	if err != nil {
		return "", err
	}
	return parsed.Scheme + "://" + parsed.Host + "/", nil
}

func dataGatewayStreamErrorStatus(err error) (int, string, string) {
	switch {
	case errors.Is(err, ErrDataGatewayStreamConflict):
		return 409, "DATA_STREAM_CONFLICT", "Remote Data stream identity is already active."
	case errors.Is(err, ErrDataGatewayStreamCapacity):
		return 429, "DATA_STREAM_CAPACITY", "Remote Data stream budget is exhausted."
	default:
		return dataGatewayErrorStatus(err)
	}
}

func writeDataGatewayStreamRecord(writer io.Writer, value any) error {
	encoded, err := json.Marshal(value)
	if err != nil || len(encoded) > maximumDataGatewayStreamFrameBytes {
		return ErrDataGatewayUpstream
	}
	_, err = io.Copy(writer, bytes.NewReader(append(encoded, '\n')))
	return err
}
