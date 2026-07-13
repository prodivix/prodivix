package workspace

import (
	"net/http"
	"strings"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

func (handler *Handler) HandleGetWorkspace(c *gin.Context) {
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	snapshot, err := handler.module.GetSnapshotForUser(c.Request.Context(), user.ID, workspaceID)
	if err != nil {
		failure := MapStoreError(err)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"workspace": buildSnapshotResponse(snapshot)})
}

func (handler *Handler) HandleGetWorkspaceCapabilities(c *gin.Context) {
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	if _, err := handler.module.GetSnapshotForUser(c.Request.Context(), user.ID, workspaceID); err != nil {
		failure := MapStoreError(err)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"workspaceId": workspaceID, "capabilities": DefaultCapabilities()})
}
