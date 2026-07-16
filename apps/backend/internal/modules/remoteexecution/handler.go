package remoteexecution

import (
	"bytes"
	"context"
	"crypto/sha256"
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
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

const maximumGatewayBodyBytes int64 = 64 * 1024 * 1024
const maximumPreviewHostResponseBytes int64 = 64 * 1024
const executionPreviewBundleMediaType = "application/vnd.prodivix.execution-preview-bundle+json"

var canonicalSHA256Digest = regexp.MustCompile(`^sha256-[a-f0-9]{64}$`)
var previewCapabilityLabel = regexp.MustCompile(`^[a-f0-9]{64}$`)

type Handler struct {
	store             GrantStore
	baseURL           string
	clientToken       string
	httpClient        *http.Client
	previewBaseURL    string
	previewPublicURL  string
	previewToken      string
	previewTTL        time.Duration
	previewHTTPClient *http.Client
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
			WorkspaceID string `json:"workspaceId"`
		} `json:"workspace"`
	} `json:"request"`
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

type previewSessionResponse struct {
	PreviewURL string `json:"previewUrl"`
	ExpiresAt  int64  `json:"expiresAt"`
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

func NewHandler(store GrantStore, cfg backendconfig.RemoteRunnerConfig, previewCfg backendconfig.RemotePreviewHostConfig) *Handler {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	clientToken := strings.TrimSpace(cfg.ClientToken)
	handler := &Handler{
		store:            store,
		baseURL:          normalizedServiceBaseURL(baseURL),
		clientToken:      clientToken,
		previewBaseURL:   normalizedServiceBaseURL(previewCfg.BaseURL),
		previewPublicURL: normalizedPublicBaseURL(previewCfg.PublicBaseURL),
		previewToken:     strings.TrimSpace(previewCfg.Token),
		previewTTL:       previewCfg.TTL,
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
	return RouteHandlers{RequireAuth: requireAuth, Envelope: handler.HandleEnvelope, ArtifactContent: handler.HandleArtifactContent, PreviewSession: handler.HandlePreviewSession}
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
	if handler == nil || handler.store == nil || handler.httpClient == nil || handler.baseURL == "" || handler.clientToken == "" {
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

func (handler *Handler) authorizeEnvelope(c *gin.Context, ownerID string, envelope remoteEnvelope) (string, bool) {
	if envelope.Protocol != "prodivix.remote-execution" || envelope.Version != 1 || strings.TrimSpace(envelope.MessageID) == "" {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote execution envelope is invalid.")
		return "", false
	}
	switch envelope.Operation {
	case "negotiate":
		return "", true
	case "create":
		var payload createPayload
		if json.Unmarshal(envelope.Payload, &payload) != nil || strings.TrimSpace(payload.Request.Workspace.WorkspaceID) == "" {
			backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote create request has no Workspace identity.")
			return "", false
		}
		workspaceID := strings.TrimSpace(payload.Request.Workspace.WorkspaceID)
		if err := handler.store.VerifyWorkspaceOwner(c.Request.Context(), ownerID, workspaceID); err != nil {
			backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Remote execution target was not found.")
			return "", false
		}
		return workspaceID, true
	case "get", "cancel", "events.read", "artifact.resolve":
		var payload executionPayload
		if json.Unmarshal(envelope.Payload, &payload) != nil || strings.TrimSpace(payload.ExecutionID) == "" {
			backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote request has no execution identity.")
			return "", false
		}
		if err := handler.store.VerifyExecutionOwner(c.Request.Context(), ownerID, payload.ExecutionID); err != nil {
			backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Remote execution was not found.")
			return "", false
		}
		return "", true
	default:
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote execution operation is unsupported.")
		return "", false
	}
}

func (handler *Handler) remoteRequest(ctx context.Context, method string, path string, body []byte, contentType string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, method, handler.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+handler.clientToken)
	request.Header.Set("Accept", "application/json, application/octet-stream")
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	return handler.httpClient.Do(request)
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
	user, ok := authUser(c)
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
	workspaceID, authorized := handler.authorizeEnvelope(c, user.ID, envelope)
	if !authorized {
		return
	}
	response, err := handler.remoteRequest(c.Request.Context(), http.MethodPost, "/v1/executions", body, "application/json")
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
		if err := handler.store.RecordExecution(c.Request.Context(), user.ID, workspaceID, created.Payload.Execution.ExecutionID); err != nil {
			handler.compensateUnrecordedExecution(c, created, envelope.MessageID)
			backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote execution authorization could not be recorded.")
			return
		}
	}
	c.Data(response.StatusCode, "application/json", responseBody)
}

func (handler *Handler) HandleArtifactContent(c *gin.Context) {
	if !handler.available(c) {
		return
	}
	user, ok := authUser(c)
	if !ok {
		return
	}
	executionID := strings.TrimSpace(c.Param("executionId"))
	artifactID := strings.TrimSpace(c.Param("artifactId"))
	if executionID == "" || artifactID == "" || handler.store.VerifyExecutionOwner(c.Request.Context(), user.ID, executionID) != nil {
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
	user, ok := authUser(c)
	if !ok {
		return
	}
	executionID := strings.TrimSpace(c.Param("executionId"))
	artifactID := strings.TrimSpace(c.Param("artifactId"))
	if executionID == "" || artifactID == "" || handler.store.VerifyExecutionOwner(c.Request.Context(), user.ID, executionID) != nil {
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
