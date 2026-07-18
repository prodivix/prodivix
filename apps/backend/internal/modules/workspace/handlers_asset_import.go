package workspace

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	maxWorkspaceAssetImportManifestBytes = int64(4 * 1024 * 1024)
	maxWorkspaceAssetImportOverheadBytes = int64(2 * 1024 * 1024)
	maxWorkspaceAssetImportRequestBytes  = maxWorkspaceAssetImportManifestBytes +
		int64(MaxWorkspaceAssetImportTotalBlobBytes) + maxWorkspaceAssetImportOverheadBytes
)

type decodedImportLocalProjectRequest struct {
	Request     importLocalProjectRequest
	AssetBlobs  []WorkspaceAssetBlobImport
	UploadAware bool
}

type workspaceAssetImportPart struct {
	Kind      string
	FileName  string
	MediaType string
}

func workspaceAssetImportInvalidManifest(reason string) *RequestFailure {
	return NewRequestFailure(
		http.StatusBadRequest,
		ErrorInvalidPayload,
		"Invalid local project import manifest.",
		map[string]any{"reason": reason},
	)
}

func workspaceAssetImportInvalidProtocol(reason string) *RequestFailure {
	return NewRequestFailure(
		http.StatusUnprocessableEntity,
		ErrorWorkspaceAssetBlobInvalid,
		"Workspace asset import protocol is invalid.",
		map[string]any{"reason": reason},
	)
}

func workspaceAssetImportTooLarge(reason string) *RequestFailure {
	return NewRequestFailure(
		http.StatusRequestEntityTooLarge,
		ErrorWorkspaceAssetBlobInvalid,
		"Workspace asset import exceeds its bounded upload budget.",
		map[string]any{"reason": reason},
	)
}

func decodeStrictImportLocalProjectManifest(payload []byte) (importLocalProjectRequest, error) {
	var request importLocalProjectRequest
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return importLocalProjectRequest{}, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return importLocalProjectRequest{}, errors.New("manifest must contain exactly one JSON value")
		}
		return importLocalProjectRequest{}, err
	}
	return request, nil
}

func readBoundedWorkspaceAssetImportPart(part io.Reader, limit int64) ([]byte, bool, error) {
	payload, err := io.ReadAll(io.LimitReader(part, limit+1))
	if err != nil {
		return nil, false, err
	}
	if int64(len(payload)) > limit {
		return nil, true, nil
	}
	return payload, false, nil
}

func parseWorkspaceAssetImportPart(part *multipart.Part) (workspaceAssetImportPart, error) {
	if part == nil || len(part.Header) != 2 {
		return workspaceAssetImportPart{}, errors.New("part headers are invalid")
	}
	dispositions := part.Header.Values("Content-Disposition")
	contentTypes := part.Header.Values("Content-Type")
	if len(dispositions) != 1 || len(contentTypes) != 1 {
		return workspaceAssetImportPart{}, errors.New("part headers must be singular")
	}
	disposition, parameters, err := mime.ParseMediaType(dispositions[0])
	if err != nil || disposition != "form-data" || len(parameters) != 2 {
		return workspaceAssetImportPart{}, errors.New("part disposition is invalid")
	}
	name := parameters["name"]
	fileName := parameters["filename"]
	if name == "" || fileName == "" {
		return workspaceAssetImportPart{}, errors.New("part name and filename are required")
	}
	mediaType, mediaParameters, err := mime.ParseMediaType(contentTypes[0])
	if err != nil || len(mediaParameters) != 0 || strings.TrimSpace(contentTypes[0]) != mediaType {
		return workspaceAssetImportPart{}, errors.New("part content type must be canonical")
	}
	switch name {
	case "manifest":
		if fileName != "manifest.json" || mediaType != "application/json" {
			return workspaceAssetImportPart{}, errors.New("manifest part identity is invalid")
		}
		return workspaceAssetImportPart{Kind: name, FileName: fileName, MediaType: mediaType}, nil
	case "asset":
		if !workspaceAssetDigestPattern.MatchString(fileName) {
			return workspaceAssetImportPart{}, errors.New("asset filename must be its SHA-256 digest")
		}
		canonicalMediaType, err := normalizeWorkspaceAssetMediaType(mediaType)
		if err != nil || canonicalMediaType != mediaType {
			return workspaceAssetImportPart{}, errors.New("asset media type is invalid")
		}
		return workspaceAssetImportPart{Kind: name, FileName: fileName, MediaType: mediaType}, nil
	default:
		return workspaceAssetImportPart{}, fmt.Errorf("unsupported multipart field %q", name)
	}
}

func decodeImportLocalProjectRequest(c *gin.Context) (*decodedImportLocalProjectRequest, *RequestFailure) {
	contentType, parameters, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil {
		return nil, workspaceAssetImportInvalidManifest("CONTENT_TYPE_INVALID")
	}
	if contentType == "application/json" {
		if len(parameters) > 1 || (len(parameters) == 1 && !strings.EqualFold(parameters["charset"], "utf-8")) {
			return nil, workspaceAssetImportInvalidManifest("CONTENT_TYPE_INVALID")
		}
		payload, oversized, readErr := readBoundedWorkspaceAssetImportPart(c.Request.Body, maxWorkspaceAssetImportManifestBytes)
		if readErr != nil {
			return nil, workspaceAssetImportInvalidManifest("MANIFEST_READ_FAILED")
		}
		if oversized {
			return nil, workspaceAssetImportTooLarge("MANIFEST_BYTES_EXCEEDED")
		}
		request, decodeErr := decodeStrictImportLocalProjectManifest(payload)
		if decodeErr != nil {
			return nil, workspaceAssetImportInvalidManifest("MANIFEST_JSON_INVALID")
		}
		return &decodedImportLocalProjectRequest{Request: request}, nil
	}
	if contentType != "multipart/form-data" || len(parameters) != 1 || parameters["boundary"] == "" {
		return nil, NewRequestFailure(
			http.StatusUnsupportedMediaType,
			ErrorInvalidPayload,
			"Local project import content type is not supported.",
			nil,
		)
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxWorkspaceAssetImportRequestBytes)
	reader := multipart.NewReader(c.Request.Body, parameters["boundary"])
	var manifestPayload []byte
	manifestSeen := false
	assetBlobs := make([]WorkspaceAssetBlobImport, 0)
	var totalAssetBytes int64
	for {
		part, nextErr := reader.NextPart()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(nextErr, &maxBytesErr) {
				return nil, workspaceAssetImportTooLarge("REQUEST_BYTES_EXCEEDED")
			}
			return nil, workspaceAssetImportInvalidProtocol("MULTIPART_INVALID")
		}
		partInfo, parseErr := parseWorkspaceAssetImportPart(part)
		if parseErr != nil {
			return nil, workspaceAssetImportInvalidProtocol("PART_HEADERS_INVALID")
		}
		limit := int64(MaxWorkspaceAssetBlobBytes)
		if partInfo.Kind == "manifest" {
			if manifestSeen {
				return nil, workspaceAssetImportInvalidProtocol("MANIFEST_DUPLICATED")
			}
			limit = maxWorkspaceAssetImportManifestBytes
		} else {
			if len(assetBlobs) >= MaxWorkspaceAssetImportBlobCount {
				return nil, workspaceAssetImportTooLarge("ASSET_COUNT_EXCEEDED")
			}
			remainingTotalBytes := int64(MaxWorkspaceAssetImportTotalBlobBytes) - totalAssetBytes
			if remainingTotalBytes < limit {
				limit = remainingTotalBytes
			}
		}
		payload, oversized, readErr := readBoundedWorkspaceAssetImportPart(part, limit)
		if readErr != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(readErr, &maxBytesErr) {
				return nil, workspaceAssetImportTooLarge("REQUEST_BYTES_EXCEEDED")
			}
			return nil, workspaceAssetImportInvalidProtocol("PART_READ_FAILED")
		}
		if oversized {
			if partInfo.Kind == "manifest" {
				return nil, workspaceAssetImportTooLarge("MANIFEST_BYTES_EXCEEDED")
			}
			if limit < int64(MaxWorkspaceAssetBlobBytes) {
				return nil, workspaceAssetImportTooLarge("ASSET_TOTAL_BYTES_EXCEEDED")
			}
			return nil, workspaceAssetImportTooLarge("ASSET_BYTES_EXCEEDED")
		}
		if closeErr := part.Close(); closeErr != nil {
			return nil, workspaceAssetImportInvalidProtocol("PART_READ_FAILED")
		}
		if partInfo.Kind == "manifest" {
			manifestSeen = true
			manifestPayload = payload
			continue
		}
		totalAssetBytes += int64(len(payload))
		if totalAssetBytes > MaxWorkspaceAssetImportTotalBlobBytes {
			return nil, workspaceAssetImportTooLarge("ASSET_TOTAL_BYTES_EXCEEDED")
		}
		reference, referenceErr := createWorkspaceAssetBlobReference(partInfo.FileName, partInfo.MediaType, int64(len(payload)))
		if referenceErr != nil || computeWorkspaceAssetDigest(payload) != partInfo.FileName {
			return nil, workspaceAssetImportInvalidProtocol("ASSET_IDENTITY_INVALID")
		}
		assetBlobs = append(assetBlobs, WorkspaceAssetBlobImport{Reference: reference, Contents: payload})
	}
	if !manifestSeen {
		return nil, workspaceAssetImportInvalidProtocol("MANIFEST_MISSING")
	}
	request, decodeErr := decodeStrictImportLocalProjectManifest(manifestPayload)
	if decodeErr != nil {
		return nil, workspaceAssetImportInvalidManifest("MANIFEST_JSON_INVALID")
	}
	return &decodedImportLocalProjectRequest{
		Request:     request,
		AssetBlobs:  assetBlobs,
		UploadAware: true,
	}, nil
}
