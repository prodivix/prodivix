package remoteexecution

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

const maximumGatewayBodyBytes int64 = 64 * 1024 * 1024
const maximumPreviewHostResponseBytes int64 = 64 * 1024
const executionPreviewBundleMediaType = "application/vnd.prodivix.execution-preview-bundle+json"
const executionServerAuthorityHeader = "X-Prodivix-Execution-Server-Authority"
const executionServerAuthorityFormat = "prodivix.remote-execution-server-authority.v1"
const productSessionProviderID = "prodivix-product-session"
const workspaceOwnerPermissionID = "workspace.owner"
const defaultExecutionAuthorityTTL = 2 * time.Minute
const maximumExecutionAuthorityTTL = 5 * time.Minute

var canonicalSHA256Digest = regexp.MustCompile(`^sha256-[a-f0-9]{64}$`)
var previewCapabilityLabel = regexp.MustCompile(`^[a-f0-9]{64}$`)

type Handler struct {
	store                 GrantStore
	environments          EnvironmentAccessVerifier
	baseURL               string
	clientToken           string
	executionAuthorityTTL time.Duration
	now                   func() time.Time
	httpClient            *http.Client
	previewBaseURL        string
	previewPublicURL      string
	previewToken          string
	previewTTL            time.Duration
	previewHTTPClient     *http.Client
	dataGateway           *DataGateway
	serverFunctions       *ServerFunctionGateway
	secretBroker          *IsolatedSecretBroker
	secretBrokerToken     string
}

type remoteEnvelope struct {
	Protocol  string          `json:"protocol"`
	Version   int             `json:"version"`
	MessageID string          `json:"messageId"`
	Operation string          `json:"operation"`
	Payload   json.RawMessage `json:"payload"`
}

type createPayload struct {
	Request struct {
		Workspace struct {
			WorkspaceID        string            `json:"workspaceId"`
			SnapshotID         string            `json:"snapshotId"`
			PartitionRevisions map[string]string `json:"partitionRevisions"`
		} `json:"workspace"`
		Environment json.RawMessage `json:"environment"`
	} `json:"request"`
}

type EnvironmentAccessVerifier interface {
	Available() bool
	VerifySnapshotAccess(ctx context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string, mode string) error
}

type envelopeAuthority struct {
	workspaceID        string
	snapshotID         string
	partitionRevisions map[string]string
	environment        *EnvironmentReference
}

type executionPayload struct {
	ExecutionID string `json:"executionId"`
}

type createResponse struct {
	OK      bool `json:"ok"`
	Payload struct {
		Execution struct {
			ExecutionID string `json:"executionId"`
		} `json:"execution"`
	} `json:"payload"`
}

type executionServerAuthority struct {
	Format    string `json:"format"`
	Principal struct {
		ProviderID  string `json:"providerId"`
		PrincipalID string `json:"principalId"`
	} `json:"principal"`
	Permissions []string `json:"permissions"`
	WorkspaceID string   `json:"workspaceId"`
	SnapshotID  string   `json:"snapshotId"`
	ExpiresAt   int64    `json:"expiresAt"`
}

type previewSessionResponse struct {
	PreviewURL string `json:"previewUrl"`
	ExpiresAt  int64  `json:"expiresAt"`
}

func validWorkspaceExecutionIdentity(workspaceID string, snapshotID string, revisions map[string]string) bool {
	if workspaceID == "" || workspaceID != strings.TrimSpace(workspaceID) || snapshotID == "" || snapshotID != strings.TrimSpace(snapshotID) || len(snapshotID) > 16*1024 || strings.ContainsRune(snapshotID, '\x00') || len(revisions) == 0 || len(revisions) > 4096 || strings.TrimSpace(revisions["workspace"]) == "" {
		return false
	}
	for partition, revision := range revisions {
		if partition == "" || partition != strings.TrimSpace(partition) || len(partition) > 1024 || strings.ContainsRune(partition, '\x00') || revision == "" || revision != strings.TrimSpace(revision) || len(revision) > 1024 || strings.ContainsRune(revision, '\x00') {
			return false
		}
	}
	return true
}

type artifactResolveResponse struct {
	OK      bool `json:"ok"`
	Payload struct {
		ExecutionID string `json:"executionId"`
		ProviderID  string `json:"providerId"`
		Artifact    struct {
			ArtifactID         string            `json:"artifactId"`
			Kind               string            `json:"kind"`
			MediaType          string            `json:"mediaType"`
			Size               int64             `json:"size"`
			Digest             string            `json:"digest"`
			ExpiresAt          int64             `json:"expiresAt"`
			AuthorizationScope string            `json:"authorizationScope"`
			Metadata           map[string]string `json:"metadata"`
		} `json:"artifact"`
	} `json:"payload"`
}

func normalizedServiceBaseURL(value string) string {
	baseURL := strings.TrimRight(strings.TrimSpace(value), "/")
	parsed, err := url.Parse(baseURL)
	loopback := parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1" || strings.HasSuffix(parsed.Hostname(), ".localhost")
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && !(parsed.Scheme == "http" && loopback)) || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return ""
	}
	return baseURL
}

func normalizedPublicBaseURL(value string) string {
	baseURL := normalizedServiceBaseURL(value)
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed == nil || (parsed.Path != "" && parsed.Path != "/") {
		return ""
	}
	return baseURL
}

func NewHandler(store GrantStore, cfg backendconfig.RemoteRunnerConfig, previewCfg backendconfig.RemotePreviewHostConfig, environmentVerifier ...EnvironmentAccessVerifier) *Handler {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	clientToken := strings.TrimSpace(cfg.ClientToken)
	executionAuthorityTTL := cfg.ExecutionAuthorityTTL
	if executionAuthorityTTL == 0 {
		executionAuthorityTTL = defaultExecutionAuthorityTTL
	}
	if executionAuthorityTTL < 0 || executionAuthorityTTL > maximumExecutionAuthorityTTL {
		executionAuthorityTTL = 0
	}
	handler := &Handler{
		store:                 store,
		baseURL:               normalizedServiceBaseURL(baseURL),
		clientToken:           clientToken,
		executionAuthorityTTL: executionAuthorityTTL,
		now:                   func() time.Time { return time.Now().UTC() },
		previewBaseURL:        normalizedServiceBaseURL(previewCfg.BaseURL),
		previewPublicURL:      normalizedPublicBaseURL(previewCfg.PublicBaseURL),
		previewToken:          strings.TrimSpace(previewCfg.Token),
		previewTTL:            previewCfg.TTL,
		secretBrokerToken:     strings.TrimSpace(cfg.SecretBrokerToken),
	}
	if len(environmentVerifier) > 0 {
		handler.environments = environmentVerifier[0]
		if environmentStore, ok := environmentVerifier[0].(DataGatewayEnvironmentStore); ok {
			handler.dataGateway = NewDataGateway(store, environmentStore, newRemoteDataHTTPTransport())
			if brokerStore, brokerOK := store.(IsolatedSecretBrokerStore); brokerOK && handler.secretBrokerToken != "" {
				handler.secretBroker = NewIsolatedSecretBroker(brokerStore, environmentStore)
			}
		}
	}
	if serverFunctionStore, ok := store.(ServerFunctionGatewayStore); ok {
		handler.serverFunctions = NewServerFunctionGateway(serverFunctionStore, cfg.ServerFunctionAllowedOrigins)
		if environmentStore, ok := handler.environments.(DataGatewayEnvironmentStore); ok {
			handler.serverFunctions.environments = environmentStore
		}
	}
	if handler.baseURL != "" && handler.clientToken != "" && cfg.Timeout > 0 {
		handler.httpClient = &http.Client{Timeout: cfg.Timeout}
	}
	if handler.previewBaseURL != "" && handler.previewPublicURL != "" && handler.previewToken != "" && previewCfg.Timeout > 0 && previewCfg.TTL >= time.Second && previewCfg.TTL <= time.Hour {
		handler.previewHTTPClient = &http.Client{Timeout: previewCfg.Timeout}
	}
	return handler
}

func (handler *Handler) Routes(requireAuth gin.HandlerFunc) RouteHandlers {
	return RouteHandlers{RequireAuth: requireAuth, Envelope: handler.HandleEnvelope, ArtifactContent: handler.HandleArtifactContent, PreviewSession: handler.HandlePreviewSession, DataOperation: handler.HandleDataOperation, ServerFunction: handler.HandleServerFunction, TerminalOpen: handler.HandleTerminalOpen, TerminalResume: handler.HandleTerminalResume, TerminalAction: handler.HandleTerminalAction, InternalSecrets: handler.HandleInternalSecrets}
}

func (handler *Handler) HandleInternalSecrets(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	if handler == nil || handler.secretBroker == nil || handler.secretBrokerToken == "" {
		backendresponse.Error(c, http.StatusNotFound, "EXE-5004", "Secret resolution is unavailable.")
		return
	}
	authorization := c.GetHeader("Authorization")
	if !strings.HasPrefix(authorization, "Bearer ") {
		backendresponse.Error(c, http.StatusUnauthorized, "EXE-5004", "Secret resolution is denied.")
		return
	}
	provided := strings.TrimPrefix(authorization, "Bearer ")
	providedDigest := sha256.Sum256([]byte(provided))
	expectedDigest := sha256.Sum256([]byte(handler.secretBrokerToken))
	if provided == "" || subtle.ConstantTimeCompare(providedDigest[:], expectedDigest[:]) != 1 {
		backendresponse.Error(c, http.StatusForbidden, "EXE-5004", "Secret resolution is denied.")
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maximumIsolatedSecretBrokerBodyBytes+1))
	if err != nil || len(body) == 0 || len(body) > maximumIsolatedSecretBrokerBodyBytes {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-5004", "Secret resolution is denied.")
		return
	}
	request, err := decodeIsolatedSecretResolutionRequest(body)
	if err != nil {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-5004", "Secret resolution is denied.")
		return
	}
	envelope, err := handler.secretBroker.Resolve(c.Request.Context(), *request)
	if err != nil {
		status := http.StatusConflict
		if errors.Is(err, ErrIsolatedSecretUnavailable) {
			status = http.StatusServiceUnavailable
		}
		backendresponse.Error(c, status, "EXE-5004", "Secret resolution is denied.")
		return
	}
	response := make([]byte, 0, len(envelope)+16)
	response = append(response, []byte(`{"envelope":`)...)
	response = append(response, envelope...)
	response = append(response, '}')
	c.Data(http.StatusOK, "application/json; charset=utf-8", response)
}

func readBoundedBody(body io.Reader) ([]byte, error) {
	contents, err := io.ReadAll(io.LimitReader(body, maximumGatewayBodyBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(contents)) > maximumGatewayBodyBytes {
		return nil, errors.New("request body exceeds gateway limit")
	}
	return contents, nil
}

func (handler *Handler) available(c *gin.Context) bool {
	if handler == nil || handler.store == nil || handler.httpClient == nil || handler.baseURL == "" || handler.clientToken == "" || handler.executionAuthorityTTL <= 0 {
		backendresponse.Error(c, http.StatusServiceUnavailable, "EXE-5001", "Remote execution gateway is unavailable.", backendresponse.WithRetryable(true))
		return false
	}
	return true
}

func (handler *Handler) previewAvailable(c *gin.Context) bool {
	if !handler.available(c) {
		return false
	}
	if handler.previewHTTPClient == nil || handler.previewBaseURL == "" || handler.previewPublicURL == "" || handler.previewToken == "" || handler.previewTTL <= 0 {
		backendresponse.Error(c, http.StatusServiceUnavailable, "EXE-5001", "Remote Preview Host is unavailable.", backendresponse.WithRetryable(true))
		return false
	}
	return true
}

func authUser(c *gin.Context) (*backendauth.User, bool) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
	}
	return user, ok
}

func authIdentity(c *gin.Context) (*backendauth.User, *backendauth.AuthenticatedSession, bool) {
	user, ok := authUser(c)
	if !ok {
		return nil, nil, false
	}
	session, ok := backendauth.GetAuthSession(c)
	if !ok || session.UserID != user.ID || strings.TrimSpace(session.ID) == "" {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return nil, nil, false
	}
	return user, session, true
}

func serverFunctionMutationRequestAuthority(c *gin.Context, sessionID string) ServerFunctionMutationRequestAuthority {
	forbidden := []string{sessionID}
	authorization := strings.TrimSpace(c.GetHeader("Authorization"))
	if len(authorization) > 7 && strings.EqualFold(authorization[:7], "Bearer ") {
		forbidden = append(forbidden, strings.TrimSpace(authorization[7:]))
	}
	for _, cookie := range c.Request.Cookies() {
		name := strings.ToLower(cookie.Name)
		if strings.Contains(name, "session") || strings.Contains(name, "auth") || strings.Contains(name, "token") {
			forbidden = append(forbidden, cookie.Value)
		}
	}
	return ServerFunctionMutationRequestAuthority{
		Origin:          c.GetHeader("Origin"),
		Intent:          c.GetHeader(serverFunctionMutationIntentHeader),
		ForbiddenValues: forbidden,
	}
}

func decodeEnvironmentReference(value json.RawMessage) (*EnvironmentReference, error) {
	if len(value) == 0 || string(value) == "null" {
		return nil, nil
	}
	var record map[string]json.RawMessage
	if json.Unmarshal(value, &record) != nil || len(record) != 3 {
		return nil, errors.New("invalid environment reference")
	}
	for _, key := range []string{"environmentId", "revision", "mode"} {
		if _, ok := record[key]; !ok {
			return nil, errors.New("invalid environment reference")
		}
	}
	var reference EnvironmentReference
	if json.Unmarshal(record["environmentId"], &reference.EnvironmentID) != nil || json.Unmarshal(record["revision"], &reference.Revision) != nil || json.Unmarshal(record["mode"], &reference.Mode) != nil {
		return nil, errors.New("invalid environment reference")
	}
	if reference.EnvironmentID == "" || reference.EnvironmentID != strings.TrimSpace(reference.EnvironmentID) || reference.Revision == "" || reference.Revision != strings.TrimSpace(reference.Revision) || (reference.Mode != "mock" && reference.Mode != "live") {
		return nil, errors.New("invalid environment reference")
	}
	return &reference, nil
}

func (handler *Handler) authorizeEnvelope(c *gin.Context, ownerID string, sessionID string, envelope remoteEnvelope) (envelopeAuthority, bool) {
	if envelope.Protocol != "prodivix.remote-execution" || envelope.Version != 1 || strings.TrimSpace(envelope.MessageID) == "" {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote execution envelope is invalid.")
		return envelopeAuthority{}, false
	}
	switch envelope.Operation {
	case "negotiate":
		return envelopeAuthority{}, true
	case "create":
		var payload createPayload
		if json.Unmarshal(envelope.Payload, &payload) != nil || !validWorkspaceExecutionIdentity(payload.Request.Workspace.WorkspaceID, payload.Request.Workspace.SnapshotID, payload.Request.Workspace.PartitionRevisions) {
			backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote create request has no Workspace identity.")
			return envelopeAuthority{}, false
		}
		workspaceID := strings.TrimSpace(payload.Request.Workspace.WorkspaceID)
		if err := handler.store.VerifyWorkspaceOwner(c.Request.Context(), ownerID, workspaceID); err != nil {
			backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Remote execution target was not found.")
			return envelopeAuthority{}, false
		}
		environment, err := decodeEnvironmentReference(payload.Request.Environment)
		if err != nil {
			backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote execution environment reference is invalid.")
			return envelopeAuthority{}, false
		}
		if environment != nil {
			if handler.environments == nil || !handler.environments.Available() {
				backendresponse.Error(c, http.StatusServiceUnavailable, "ENV-5001", "Environment Secret store is unavailable.", backendresponse.WithRetryable(true))
				return envelopeAuthority{}, false
			}
			if err := handler.environments.VerifySnapshotAccess(c.Request.Context(), backendenvironment.PrincipalSession{PrincipalID: ownerID, SessionID: sessionID}, workspaceID, environment.EnvironmentID, environment.Revision, environment.Mode); err != nil {
				backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Remote execution target was not found.")
				return envelopeAuthority{}, false
			}
		}
		return envelopeAuthority{workspaceID: workspaceID, snapshotID: payload.Request.Workspace.SnapshotID, partitionRevisions: payload.Request.Workspace.PartitionRevisions, environment: environment}, true
	case "get", "cancel", "events.read", "artifact.resolve":
		var payload executionPayload
		if json.Unmarshal(envelope.Payload, &payload) != nil || strings.TrimSpace(payload.ExecutionID) == "" {
			backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote request has no execution identity.")
			return envelopeAuthority{}, false
		}
		if err := handler.store.VerifyExecutionOwner(c.Request.Context(), ownerID, sessionID, payload.ExecutionID); err != nil {
			backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Remote execution was not found.")
			return envelopeAuthority{}, false
		}
		return envelopeAuthority{}, true
	default:
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote execution operation is unsupported.")
		return envelopeAuthority{}, false
	}
}

func (handler *Handler) remoteRequestWithServerAuthority(ctx context.Context, method string, path string, body []byte, contentType string, authority *executionServerAuthority) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, method, handler.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+handler.clientToken)
	request.Header.Set("Accept", "application/json, application/octet-stream")
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if authority != nil {
		encoded, encodeErr := json.Marshal(authority)
		if encodeErr != nil {
			return nil, encodeErr
		}
		request.Header.Set(executionServerAuthorityHeader, base64.RawURLEncoding.EncodeToString(encoded))
	}
	return handler.httpClient.Do(request)
}

func (handler *Handler) remoteRequest(ctx context.Context, method string, path string, body []byte, contentType string) (*http.Response, error) {
	return handler.remoteRequestWithServerAuthority(ctx, method, path, body, contentType, nil)
}

func (handler *Handler) executionServerAuthority(userID string, session *backendauth.AuthenticatedSession, authority envelopeAuthority) (*executionServerAuthority, bool) {
	if handler == nil || handler.now == nil || session == nil || authority.workspaceID == "" || authority.snapshotID == "" {
		return nil, false
	}
	now := handler.now()
	expiresAt := now.Add(handler.executionAuthorityTTL).UnixMilli()
	if session.ExpiresAt < expiresAt {
		expiresAt = session.ExpiresAt
	}
	if expiresAt <= now.UnixMilli() {
		return nil, false
	}
	result := &executionServerAuthority{
		Format:      executionServerAuthorityFormat,
		Permissions: []string{workspaceOwnerPermissionID},
		WorkspaceID: authority.workspaceID,
		SnapshotID:  authority.snapshotID,
		ExpiresAt:   expiresAt,
	}
	result.Principal.ProviderID = productSessionProviderID
	result.Principal.PrincipalID = userID
	return result, true
}

func (handler *Handler) compensateUnrecordedExecution(c *gin.Context, created createResponse, messageID string) {
	executionID := strings.TrimSpace(created.Payload.Execution.ExecutionID)
	if executionID == "" {
		return
	}
	payload, err := json.Marshal(map[string]any{
		"protocol":  "prodivix.remote-execution",
		"version":   1,
		"messageId": messageID + ":grant-compensation",
		"operation": "cancel",
		"payload": map[string]any{
			"executionId":    executionID,
			"cancellationId": messageID + ":grant-compensation",
			"reason":         "backend-execution-grant-persistence-failed",
		},
	})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	response, err := handler.remoteRequest(ctx, http.MethodPost, "/v1/executions", payload, "application/json")
	if err == nil && response != nil {
		_ = response.Body.Close()
	}
}

func (handler *Handler) HandleEnvelope(c *gin.Context) {
	if !handler.available(c) {
		return
	}
	user, session, ok := authIdentity(c)
	if !ok {
		return
	}
	body, err := readBoundedBody(c.Request.Body)
	if err != nil {
		backendresponse.Error(c, http.StatusRequestEntityTooLarge, "EXE-4001", "Remote execution request is too large.")
		return
	}
	var envelope remoteEnvelope
	if json.Unmarshal(body, &envelope) != nil {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote execution request is invalid JSON.")
		return
	}
	authority, authorized := handler.authorizeEnvelope(c, user.ID, session.ID, envelope)
	if !authorized {
		return
	}
	var serverAuthority *executionServerAuthority
	if envelope.Operation == "create" {
		var authorityOK bool
		serverAuthority, authorityOK = handler.executionServerAuthority(user.ID, session, authority)
		if !authorityOK {
			backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
			return
		}
	}
	response, err := handler.remoteRequestWithServerAuthority(c.Request.Context(), http.MethodPost, "/v1/executions", body, "application/json", serverAuthority)
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote execution service is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	defer response.Body.Close()
	responseBody, err := readBoundedBody(response.Body)
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote execution response exceeded its limit.")
		return
	}
	if envelope.Operation == "create" && response.StatusCode >= 200 && response.StatusCode < 300 {
		var created createResponse
		if json.Unmarshal(responseBody, &created) != nil || !created.OK || strings.TrimSpace(created.Payload.Execution.ExecutionID) == "" {
			backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote execution service returned an invalid create result.")
			return
		}
		if err := handler.store.RecordExecution(c.Request.Context(), ExecutionAuthority{
			ExecutionID:        created.Payload.Execution.ExecutionID,
			WorkspaceID:        authority.workspaceID,
			OwnerID:            user.ID,
			SessionID:          session.ID,
			SnapshotID:         authority.snapshotID,
			PartitionRevisions: authority.partitionRevisions,
			Environment:        authority.environment,
		}); err != nil {
			if errors.Is(err, ErrExecutionAuthorityConflict) {
				backendresponse.Error(c, http.StatusConflict, "EXE-4009", "Remote execution identity conflicts with an existing authority.")
				return
			}
			handler.compensateUnrecordedExecution(c, created, envelope.MessageID)
			backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote execution authorization could not be recorded.")
			return
		}
	}
	c.Data(response.StatusCode, "application/json", responseBody)
}

func (handler *Handler) HandleDataOperation(c *gin.Context) {
	user, session, ok := authIdentity(c)
	if !ok {
		return
	}
	if handler == nil || handler.dataGateway == nil || !handler.dataGateway.Available() {
		backendresponse.Error(c, http.StatusServiceUnavailable, "ENV-5001", "Remote Data gateway is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maximumDataGatewayRequestBytes+1))
	if err != nil || int64(len(body)) > maximumDataGatewayRequestBytes {
		backendresponse.Error(c, http.StatusRequestEntityTooLarge, "DAT-1001", "Remote Data invocation is too large.")
		return
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) != nil || len(fields) != 4 {
		backendresponse.Error(c, http.StatusBadRequest, "DAT-1001", "Remote Data invocation is invalid.")
		return
	}
	for _, field := range []string{"invocationId", "sequence", "attempt", "input"} {
		if _, exists := fields[field]; !exists {
			backendresponse.Error(c, http.StatusBadRequest, "DAT-1001", "Remote Data invocation is invalid.")
			return
		}
	}
	var invocation DataGatewayInvocation
	if json.Unmarshal(body, &invocation) != nil {
		backendresponse.Error(c, http.StatusBadRequest, "DAT-1001", "Remote Data invocation is invalid.")
		return
	}
	result, err := handler.dataGateway.Invoke(c.Request.Context(), backendenvironment.PrincipalSession{PrincipalID: user.ID, SessionID: session.ID}, c.Param("executionId"), c.Param("documentId"), c.Param("operationId"), invocation)
	if err != nil {
		status, code, message := dataGatewayErrorStatus(err)
		backendresponse.Error(c, status, code, message, backendresponse.WithRetryable(status >= 500))
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, result)
}

func (handler *Handler) HandleServerFunction(c *gin.Context) {
	user, session, ok := authIdentity(c)
	if !ok {
		return
	}
	c.Header("Cache-Control", "private, no-store")
	if handler == nil || handler.serverFunctions == nil || !handler.serverFunctions.Available() {
		backendresponse.Error(c, http.StatusServiceUnavailable, "SVR-5001", "Remote Server Function gateway is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maximumServerFunctionRequestBytes+1))
	if err != nil || int64(len(body)) > maximumServerFunctionRequestBytes {
		backendresponse.Error(c, http.StatusRequestEntityTooLarge, "SVR-1001", "Remote Server Function invocation is too large.", backendresponse.WithRetryable(false))
		return
	}
	invocation, err := decodeServerFunctionInvocation(body)
	if err != nil || invocation.FunctionRef.ArtifactID != c.Param("artifactId") || invocation.FunctionRef.ExportName != c.Param("exportName") {
		backendresponse.Error(c, http.StatusBadRequest, "SVR-1001", "Remote Server Function invocation is invalid.", backendresponse.WithRetryable(false))
		return
	}
	result, err := handler.serverFunctions.Invoke(c.Request.Context(), ServerFunctionPrincipalSession{
		PrincipalID: user.ID,
		SessionID:   session.ID,
		ExpiresAt:   session.ExpiresAt,
	}, c.Param("executionId"), *invocation, serverFunctionMutationRequestAuthority(c, session.ID))
	if err != nil {
		status, code, message := serverFunctionGatewayErrorStatus(err)
		backendresponse.Error(c, status, code, message, backendresponse.WithRetryable(code == "SVR-5001"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (handler *Handler) HandleArtifactContent(c *gin.Context) {
	if !handler.available(c) {
		return
	}
	user, session, ok := authIdentity(c)
	if !ok {
		return
	}
	executionID := strings.TrimSpace(c.Param("executionId"))
	artifactID := strings.TrimSpace(c.Param("artifactId"))
	if executionID == "" || artifactID == "" || handler.store.VerifyExecutionOwner(c.Request.Context(), user.ID, session.ID, executionID) != nil {
		backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Remote artifact was not found.")
		return
	}
	path := fmt.Sprintf("/v1/executions/%s/artifacts/%s/content", url.PathEscape(executionID), url.PathEscape(artifactID))
	response, err := handler.remoteRequest(c.Request.Context(), http.MethodGet, path, nil, "")
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote artifact service is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	defer response.Body.Close()
	body, err := readBoundedBody(response.Body)
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote artifact exceeded its byte limit.")
		return
	}
	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	if etag := response.Header.Get("ETag"); etag != "" {
		c.Header("ETag", etag)
	}
	c.Data(response.StatusCode, contentType, body)
}

func canonicalArtifactDigest(response *http.Response, body []byte) (string, bool) {
	digest := strings.Trim(response.Header.Get("ETag"), `"`)
	if !canonicalSHA256Digest.MatchString(digest) {
		return "", false
	}
	actual := fmt.Sprintf("sha256-%x", sha256.Sum256(body))
	return digest, digest == actual
}

func previewBundleContentType(response *http.Response) bool {
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	return err == nil && strings.EqualFold(mediaType, executionPreviewBundleMediaType)
}

func (handler *Handler) resolvePreviewArtifact(ctx context.Context, executionID string, artifactID string) (*artifactResolveResponse, error) {
	identity := sha256.Sum256([]byte(executionID + "\x00" + artifactID))
	body, err := json.Marshal(map[string]any{
		"protocol":  "prodivix.remote-execution",
		"version":   1,
		"messageId": fmt.Sprintf("backend-preview-resolve-%x", identity[:16]),
		"operation": "artifact.resolve",
		"payload": map[string]string{
			"executionId": executionID,
			"artifactId":  artifactID,
		},
	})
	if err != nil {
		return nil, err
	}
	response, err := handler.remoteRequest(ctx, http.MethodPost, "/v1/executions", body, "application/json")
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumPreviewHostResponseBytes+1))
	if err != nil || int64(len(responseBody)) > maximumPreviewHostResponseBytes || response.StatusCode != http.StatusOK {
		return nil, errors.New("artifact descriptor is unavailable")
	}
	var resolved artifactResolveResponse
	if json.Unmarshal(responseBody, &resolved) != nil {
		return nil, errors.New("artifact descriptor response is invalid")
	}
	return &resolved, nil
}

func validPreviewArtifactDescriptor(resolved *artifactResolveResponse, executionID string, artifactID string, now time.Time) bool {
	if resolved == nil || !resolved.OK || resolved.Payload.ExecutionID != executionID || resolved.Payload.ProviderID != "prodivix.remote.preview" {
		return false
	}
	artifact := resolved.Payload.Artifact
	return artifact.ArtifactID == artifactID &&
		artifact.Kind == "bundle" &&
		artifact.MediaType == executionPreviewBundleMediaType &&
		artifact.Size > 0 && artifact.Size <= maximumGatewayBodyBytes &&
		canonicalSHA256Digest.MatchString(artifact.Digest) &&
		artifact.ExpiresAt > now.UnixMilli() &&
		artifact.AuthorizationScope == "execution:"+executionID &&
		artifact.Metadata["readiness"] == "ready" &&
		artifact.Metadata["health"] == "healthy" &&
		strings.HasSuffix(strings.ToLower(artifact.Metadata["entryFilePath"]), ".html") &&
		canonicalSHA256Digest.MatchString(artifact.Metadata["snapshotDigest"])
}

/** Materializes an authorized Remote Preview artifact into an isolated, short-lived origin. */
func (handler *Handler) HandlePreviewSession(c *gin.Context) {
	if !handler.previewAvailable(c) {
		return
	}
	user, session, ok := authIdentity(c)
	if !ok {
		return
	}
	executionID := strings.TrimSpace(c.Param("executionId"))
	artifactID := strings.TrimSpace(c.Param("artifactId"))
	if executionID == "" || artifactID == "" || handler.store.VerifyExecutionOwner(c.Request.Context(), user.ID, session.ID, executionID) != nil {
		backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Remote Preview artifact was not found.")
		return
	}
	resolved, err := handler.resolvePreviewArtifact(c.Request.Context(), executionID, artifactID)
	now := time.Now()
	if err != nil || !validPreviewArtifactDescriptor(resolved, executionID, artifactID, now) {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview artifact descriptor is unavailable or invalid.")
		return
	}
	descriptor := resolved.Payload.Artifact
	path := fmt.Sprintf("/v1/executions/%s/artifacts/%s/content", url.PathEscape(executionID), url.PathEscape(artifactID))
	artifactResponse, err := handler.remoteRequest(c.Request.Context(), http.MethodGet, path, nil, "")
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview artifact service is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	defer artifactResponse.Body.Close()
	artifactBody, err := readBoundedBody(artifactResponse.Body)
	if err != nil || artifactResponse.StatusCode != http.StatusOK || !previewBundleContentType(artifactResponse) {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview artifact is unavailable or invalid.")
		return
	}
	digest, validDigest := canonicalArtifactDigest(artifactResponse, artifactBody)
	if !validDigest || digest != descriptor.Digest || int64(len(artifactBody)) != descriptor.Size {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview artifact digest does not match.")
		return
	}
	request, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, handler.previewBaseURL+"/internal/preview-sessions", bytes.NewReader(artifactBody))
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview session could not be created.")
		return
	}
	request.Header.Set("Authorization", "Bearer "+handler.previewToken)
	request.Header.Set("Content-Type", executionPreviewBundleMediaType)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Prodivix-Artifact-Digest", digest)
	request.Header.Set("X-Prodivix-Snapshot-Digest", descriptor.Metadata["snapshotDigest"])
	request.Header.Set("X-Prodivix-Preview-Ttl-Seconds", fmt.Sprintf("%d", int64(handler.previewTTL/time.Second)))
	previewResponse, err := handler.previewHTTPClient.Do(request)
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview Host is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	defer previewResponse.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(previewResponse.Body, maximumPreviewHostResponseBytes+1))
	if err != nil || int64(len(responseBody)) > maximumPreviewHostResponseBytes || previewResponse.StatusCode != http.StatusCreated {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview Host rejected the artifact.")
		return
	}
	var result previewSessionResponse
	if json.Unmarshal(responseBody, &result) != nil || result.ExpiresAt <= now.UnixMilli() || result.ExpiresAt > now.Add(handler.previewTTL+5*time.Second).UnixMilli() {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview Host returned an invalid session.")
		return
	}
	previewURL, err := url.Parse(result.PreviewURL)
	publicBaseURL, publicBaseError := url.Parse(handler.previewPublicURL)
	if err != nil || previewURL == nil || publicBaseError != nil || publicBaseURL == nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview Host returned an invalid origin.")
		return
	}
	capabilityLabel := strings.SplitN(previewURL.Hostname(), ".", 2)[0]
	expectedHostname := capabilityLabel + "." + publicBaseURL.Hostname()
	if previewURL.Scheme != publicBaseURL.Scheme || previewURL.Hostname() != expectedHostname || previewURL.Port() != publicBaseURL.Port() || previewURL.User != nil || previewURL.Path != "/" || previewURL.RawQuery != "" || previewURL.Fragment != "" || !previewCapabilityLabel.MatchString(capabilityLabel) {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Preview Host returned an invalid origin.")
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusCreated, result)
}
