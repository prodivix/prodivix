package workspace

import (
	"errors"
	"io"
	"net/http"
	"strings"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

func writeWorkspaceAssetBlobFailure(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrWorkspaceNotFound):
		backendresponse.Error(c, http.StatusNotFound, ErrorWorkspaceNotFound, "Workspace not found.")
	case errors.Is(err, ErrWorkspaceAssetBlobNotFound):
		backendresponse.Error(c, http.StatusNotFound, ErrorWorkspaceAssetBlobNotFound, "Asset blob not found.")
	case errors.Is(err, ErrWorkspaceAssetBlobInvalid):
		backendresponse.Error(c, http.StatusUnprocessableEntity, ErrorWorkspaceAssetBlobInvalid, "Asset blob identity, media type, or bytes are invalid.")
	case errors.Is(err, ErrWorkspaceAssetBlobConflict):
		backendresponse.Error(c, http.StatusConflict, ErrorWorkspaceAssetBlobConflict, "Asset blob identity conflicts with stored bytes.")
	default:
		backendresponse.Error(c, http.StatusInternalServerError, ErrorWorkspaceOperationFailed, "Asset blob operation failed.")
	}
}

func (handler *Handler) HandlePutWorkspaceAssetBlob(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
	if !handler.requireWorkspaceOwner(c, user.ID, workspaceID) {
		return
	}
	if c.Request.ContentLength > MaxWorkspaceAssetBlobBytes {
		backendresponse.Error(c, http.StatusRequestEntityTooLarge, ErrorWorkspaceAssetBlobInvalid, "Asset blob exceeds the byte limit.")
		return
	}
	limited := io.LimitReader(c.Request.Body, MaxWorkspaceAssetBlobBytes+1)
	contents, err := io.ReadAll(limited)
	if err != nil {
		writeWorkspaceAssetBlobFailure(c, ErrWorkspaceAssetBlobInvalid)
		return
	}
	if len(contents) > MaxWorkspaceAssetBlobBytes {
		backendresponse.Error(c, http.StatusRequestEntityTooLarge, ErrorWorkspaceAssetBlobInvalid, "Asset blob exceeds the byte limit.")
		return
	}
	result, err := handler.store.PutWorkspaceAssetBlob(
		c.Request.Context(),
		user.ID,
		workspaceID,
		c.Param("digest"),
		c.GetHeader("Content-Type"),
		contents,
	)
	if err != nil {
		writeWorkspaceAssetBlobFailure(c, err)
		return
	}
	status := http.StatusOK
	if result.Kind == "stored" {
		status = http.StatusCreated
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(status, map[string]any{
		"status": result.Kind,
		"blob":   result.Reference,
	})
}

func (handler *Handler) HandleGetWorkspaceAssetBlob(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	blob, err := handler.store.GetWorkspaceAssetBlobForOwner(
		c.Request.Context(),
		user.ID,
		c.Param("workspaceId"),
		c.Param("digest"),
	)
	if err != nil {
		writeWorkspaceAssetBlobFailure(c, err)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("Content-Disposition", `attachment; filename="asset"`)
	c.Header("ETag", `"`+blob.Reference.Digest+`"`)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, blob.Reference.MediaType, blob.Contents)
}
