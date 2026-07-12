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

func (handler *Handler) HandlePatchWorkspaceDocument(c *gin.Context) {
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
	documentID := strings.TrimSpace(c.Param("documentId"))
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	if !handler.requireWorkspaceOwner(c, user.ID, workspaceID) {
		return
	}
	var request PatchDocumentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		failure := NewRequestFailure(http.StatusBadRequest, ErrorInvalidPayload, "Invalid request payload.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	if err := validateRequiredJSONSafeRevision("expectedContentRev", request.ExpectedContentRev); err != nil {
		failure := MapStoreError(err)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	result, err := handler.store.PatchDocumentContent(c.Request.Context(), PatchDocumentContentParams{WorkspaceID: workspaceID, DocumentID: documentID, ExpectedContentRev: request.ExpectedContentRev, Command: request.Command})
	if err != nil {
		failure := MapStoreError(err)
		LogWorkspaceConflictFailure("patchDocument", c.Request.Method, c.FullPath(), workspaceID, documentID, 0, 0, request.ExpectedContentRev, request.ClientMutationID, failure)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	handler.module.SyncProjectMirrorFromWorkspace(c.Request.Context(), user.ID, workspaceID)
	c.JSON(http.StatusOK, BuildMutationSuccessPayload(result, strings.TrimSpace(request.ClientMutationID)))
}

func (handler *Handler) HandleApplyWorkspaceIntent(c *gin.Context) {
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	if !handler.requireWorkspaceOwner(c, user.ID, workspaceID) {
		return
	}
	var request ApplyIntentHTTPrequest
	if err := c.ShouldBindJSON(&request); err != nil {
		failure := NewRequestFailure(http.StatusBadRequest, ErrorInvalidPayload, "Invalid request payload.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	result, failure := handler.module.ApplyIntentMutation(c.Request.Context(), workspaceID, ApplyIntentRequest{ExpectedWorkspaceRev: request.ExpectedWorkspaceRev, ExpectedRouteRev: request.ExpectedRouteRev, Intent: toIntent(request.Intent)})
	if failure != nil {
		LogWorkspaceConflictFailure("applyIntent", c.Request.Method, c.FullPath(), workspaceID, "", request.ExpectedWorkspaceRev, request.ExpectedRouteRev, 0, request.ClientMutationID, failure)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	handler.module.SyncProjectMirrorFromWorkspace(c.Request.Context(), user.ID, workspaceID)
	c.JSON(http.StatusOK, BuildMutationSuccessPayload(result, strings.TrimSpace(request.ClientMutationID)))
}
