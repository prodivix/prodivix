package workspace

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

const maximumAssetDeliveryResponseBytes int64 = 64 * 1024

var assetDeliveryCapabilityPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

var assetDeliveryActiveMediaTypes = map[string]struct{}{
	"application/javascript": {},
	"application/xhtml+xml":  {},
	"application/xml":        {},
	"image/svg+xml":          {},
	"text/css":               {},
	"text/html":              {},
	"text/javascript":        {},
	"text/xml":               {},
}

var assetDeliveryStaticMediaTypes = map[string]struct{}{
	"application/json": {},
	"font/otf":         {},
	"font/ttf":         {},
	"font/woff":        {},
	"font/woff2":       {},
	"image/avif":       {},
	"image/gif":        {},
	"image/jpeg":       {},
	"image/png":        {},
	"image/webp":       {},
	"text/plain":       {},
}

type createAssetDeliveryRequest struct {
	Transform   string `json:"transform"`
	Disposition string `json:"disposition"`
}

type assetDeliveryImageMetadata struct {
	Width  int64 `json:"width"`
	Height int64 `json:"height"`
}

type assetDeliveryHostResponse struct {
	DeliveryURL   string                      `json:"deliveryUrl"`
	ExpiresAt     int64                       `json:"expiresAt"`
	Digest        string                      `json:"digest"`
	MediaType     string                      `json:"mediaType"`
	ByteLength    int64                       `json:"byteLength"`
	Disposition   string                      `json:"disposition"`
	DeliveryClass string                      `json:"deliveryClass"`
	RecipeDigest  *string                     `json:"recipeDigest"`
	Metadata      *assetDeliveryImageMetadata `json:"metadata"`
	CacheStatus   string                      `json:"cacheStatus"`
}

func assetDeliverySanitizedMediaType(transform string) (string, bool) {
	switch transform {
	case "png-sanitize":
		return "image/png", true
	case "jpeg-sanitize":
		return "image/jpeg", true
	default:
		return "", false
	}
}

func classifyWorkspaceAssetDelivery(mediaType string) string {
	if _, ok := assetDeliveryActiveMediaTypes[mediaType]; ok {
		return "active-content"
	}
	if _, ok := assetDeliveryStaticMediaTypes[mediaType]; ok {
		return "static"
	}
	return "download-only"
}

func decodeCreateAssetDeliveryRequest(body io.Reader) (createAssetDeliveryRequest, error) {
	contents, err := io.ReadAll(io.LimitReader(body, 4*1024+1))
	if err != nil || len(contents) > 4*1024 {
		return createAssetDeliveryRequest{}, errors.New("asset delivery request exceeds limits")
	}
	decoder := json.NewDecoder(bytes.NewReader(contents))
	decoder.DisallowUnknownFields()
	var request createAssetDeliveryRequest
	if err := decoder.Decode(&request); err != nil {
		return createAssetDeliveryRequest{}, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return createAssetDeliveryRequest{}, errors.New("asset delivery request contains trailing content")
	}
	request.Transform = strings.TrimSpace(request.Transform)
	request.Disposition = strings.TrimSpace(request.Disposition)
	_, sanitizedImage := assetDeliverySanitizedMediaType(request.Transform)
	if !sanitizedImage && request.Transform != "original" {
		return createAssetDeliveryRequest{}, errors.New("asset delivery transform is invalid")
	}
	if request.Disposition != "inline" && request.Disposition != "attachment" {
		return createAssetDeliveryRequest{}, errors.New("asset delivery disposition is invalid")
	}
	if sanitizedImage && request.Disposition != "inline" {
		return createAssetDeliveryRequest{}, errors.New("image sanitize delivery must be inline")
	}
	return request, nil
}

func validAssetDeliveryInternalBaseURL(value string) (*url.URL, bool) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, false
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	return parsed, true
}

func validAssetDeliveryPublicBaseURL(value string) (*url.URL, bool) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Path != "" && parsed.Path != "/" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, false
	}
	loopback := parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1" || strings.HasSuffix(parsed.Hostname(), ".localhost")
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && loopback) {
		return nil, false
	}
	return parsed, true
}

func validAssetDeliveryURL(value string, publicBaseURL *url.URL) bool {
	deliveryURL, err := url.Parse(value)
	if err != nil || publicBaseURL == nil || deliveryURL.User != nil || deliveryURL.Scheme != publicBaseURL.Scheme || deliveryURL.Port() != publicBaseURL.Port() || deliveryURL.Path != "/asset" || deliveryURL.RawQuery != "" || deliveryURL.Fragment != "" {
		return false
	}
	suffix := "." + strings.ToLower(publicBaseURL.Hostname())
	hostname := strings.ToLower(deliveryURL.Hostname())
	if !strings.HasSuffix(hostname, suffix) {
		return false
	}
	return assetDeliveryCapabilityPattern.MatchString(strings.TrimSuffix(hostname, suffix))
}

func validAssetDeliveryHostResponse(result assetDeliveryHostResponse, request createAssetDeliveryRequest, source WorkspaceAssetBlobReference, publicBaseURL *url.URL, now time.Time, maximumTTL time.Duration) bool {
	if !workspaceAssetDigestPattern.MatchString(result.Digest) || result.ByteLength < 0 || result.ByteLength > MaxWorkspaceAssetBlobBytes || result.Disposition != request.Disposition || !validAssetDeliveryURL(result.DeliveryURL, publicBaseURL) {
		return false
	}
	mediaType, err := normalizeWorkspaceAssetMediaType(result.MediaType)
	if err != nil || mediaType != result.MediaType {
		return false
	}
	if result.DeliveryClass != classifyWorkspaceAssetDelivery(mediaType) {
		return false
	}
	if result.Disposition == "inline" && result.DeliveryClass != "static" {
		return false
	}
	if result.CacheStatus != "transformed" && result.CacheStatus != "cache-hit" && result.CacheStatus != "not-applicable" {
		return false
	}
	expectedMediaType, sanitizedImage := assetDeliverySanitizedMediaType(request.Transform)
	if sanitizedImage {
		if result.MediaType != expectedMediaType || result.ByteLength < 1 || result.RecipeDigest == nil || !workspaceAssetDigestPattern.MatchString(*result.RecipeDigest) || result.Metadata == nil || result.Metadata.Width < 1 || result.Metadata.Height < 1 || result.Metadata.Width > 8192 || result.Metadata.Height > 8192 || result.Metadata.Width*result.Metadata.Height > 32*1024*1024 || result.CacheStatus == "not-applicable" {
			return false
		}
	} else if result.Digest != source.Digest || result.ByteLength != source.ByteLength || result.MediaType != source.MediaType || result.RecipeDigest != nil || result.Metadata != nil || result.CacheStatus != "not-applicable" {
		return false
	}
	if maximumTTL <= 0 {
		maximumTTL = 10 * time.Minute
	}
	expiresAt := time.UnixMilli(result.ExpiresAt)
	return expiresAt.After(now) && !expiresAt.After(now.Add(maximumTTL+5*time.Second))
}

func (handler *Handler) writeAssetDeliveryUnavailable(c *gin.Context, status int, code string, message string, retryable bool) {
	options := []backendresponse.ErrorOption{}
	if retryable {
		options = append(options, backendresponse.WithRetryable(true))
	}
	backendresponse.Error(c, status, code, message, options...)
}

// HandleCreateAssetDelivery authorizes one canonical blob before forwarding exact bytes to the credential-free delivery host.
func (handler *Handler) HandleCreateAssetDelivery(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	request, err := decodeCreateAssetDeliveryRequest(c.Request.Body)
	if err != nil {
		backendresponse.Error(c, http.StatusBadRequest, ErrorWorkspaceAssetDeliveryInvalid, "Asset delivery request is invalid.")
		return
	}
	blob, err := handler.store.GetWorkspaceAssetBlobForOwner(c.Request.Context(), user.ID, c.Param("workspaceId"), c.Param("digest"))
	if err != nil {
		writeWorkspaceAssetBlobFailure(c, err)
		return
	}
	expectedMediaType, sanitizedImage := assetDeliverySanitizedMediaType(request.Transform)
	if sanitizedImage && blob.Reference.MediaType != expectedMediaType {
		backendresponse.Error(c, http.StatusUnprocessableEntity, ErrorWorkspaceAssetDeliveryRejected, "Asset transform does not support this media type.")
		return
	}
	internalBaseURL, internalConfigured := validAssetDeliveryInternalBaseURL(handler.assetDelivery.BaseURL)
	publicBaseURL, publicConfigured := validAssetDeliveryPublicBaseURL(handler.assetDelivery.PublicBaseURL)
	if !internalConfigured || !publicConfigured || strings.TrimSpace(handler.assetDelivery.Token) == "" || handler.assetDeliveryHTTP == nil {
		handler.writeAssetDeliveryUnavailable(c, http.StatusServiceUnavailable, ErrorWorkspaceAssetDeliveryUnavailable, "Asset Delivery Host is unavailable.", true)
		return
	}
	endpoint := "/internal/delivery-sessions"
	if sanitizedImage {
		endpoint = "/internal/image-transform-delivery-sessions"
	}
	hostURL := *internalBaseURL
	hostURL.Path = strings.TrimRight(internalBaseURL.Path, "/") + endpoint
	forward, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, hostURL.String(), bytes.NewReader(blob.Contents))
	if err != nil {
		handler.writeAssetDeliveryUnavailable(c, http.StatusBadGateway, ErrorWorkspaceAssetDeliveryUnavailable, "Asset Delivery Host request could not be created.", true)
		return
	}
	forward.Header.Set("Authorization", "Bearer "+handler.assetDelivery.Token)
	forward.Header.Set("Content-Type", blob.Reference.MediaType)
	forward.Header.Set("X-Prodivix-Asset-Digest", blob.Reference.Digest)
	forward.Header.Set("X-Prodivix-Delivery-Disposition", request.Disposition)
	ttl := handler.assetDelivery.TTL
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	forward.Header.Set("X-Prodivix-Delivery-Ttl-Seconds", fmt.Sprintf("%d", max(1, int64(ttl/time.Second))))
	response, err := handler.assetDeliveryHTTP.Do(forward)
	if err != nil {
		handler.writeAssetDeliveryUnavailable(c, http.StatusBadGateway, ErrorWorkspaceAssetDeliveryUnavailable, "Asset Delivery Host is unavailable.", true)
		return
	}
	defer response.Body.Close()
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, maximumAssetDeliveryResponseBytes+1))
	if readErr != nil || int64(len(responseBody)) > maximumAssetDeliveryResponseBytes {
		handler.writeAssetDeliveryUnavailable(c, http.StatusBadGateway, ErrorWorkspaceAssetDeliveryInvalid, "Asset Delivery Host returned an invalid response.", false)
		return
	}
	if response.StatusCode == http.StatusUnprocessableEntity {
		backendresponse.Error(c, http.StatusUnprocessableEntity, ErrorWorkspaceAssetDeliveryRejected, "Asset delivery was rejected by content policy.")
		return
	}
	if response.StatusCode == http.StatusServiceUnavailable {
		handler.writeAssetDeliveryUnavailable(c, http.StatusServiceUnavailable, ErrorWorkspaceAssetDeliveryUnavailable, "Asset delivery scanner or capacity is unavailable.", true)
		return
	}
	if response.StatusCode != http.StatusCreated {
		handler.writeAssetDeliveryUnavailable(c, http.StatusBadGateway, ErrorWorkspaceAssetDeliveryInvalid, "Asset Delivery Host rejected the request.", false)
		return
	}
	decoder := json.NewDecoder(bytes.NewReader(responseBody))
	decoder.DisallowUnknownFields()
	var result assetDeliveryHostResponse
	if err := decoder.Decode(&result); err != nil {
		handler.writeAssetDeliveryUnavailable(c, http.StatusBadGateway, ErrorWorkspaceAssetDeliveryInvalid, "Asset Delivery Host returned an invalid session.", false)
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) || !validAssetDeliveryHostResponse(result, request, blob.Reference, publicBaseURL, time.Now(), ttl) {
		handler.writeAssetDeliveryUnavailable(c, http.StatusBadGateway, ErrorWorkspaceAssetDeliveryInvalid, "Asset Delivery Host returned an invalid session.", false)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusCreated, result)
}
