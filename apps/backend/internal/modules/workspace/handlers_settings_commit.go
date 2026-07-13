package workspace

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

func decodeWorkspaceSettingsCommitRequest(c *gin.Context) (WorkspaceSettingsCommitRequest, error) {
	var request WorkspaceSettingsCommitRequest
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return request, errors.New("request body must contain one JSON value")
		}
		return request, err
	}
	return request, nil
}

func (handler *Handler) HandleCommitWorkspaceSettings(c *gin.Context) {
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	if !handler.requireWorkspaceOwner(c, user.ID, workspaceID) {
		return
	}
	request, err := decodeWorkspaceSettingsCommitRequest(c)
	if err != nil {
		failure := NewRequestFailure(
			http.StatusBadRequest,
			ErrorInvalidPayload,
			"Invalid workspace settings commit payload.",
			map[string]any{"reason": err.Error()},
		)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	result, err := handler.store.CommitWorkspaceSettings(
		c.Request.Context(),
		CommitWorkspaceSettingsParams{
			WorkspaceID: workspaceID,
			OwnerID:     user.ID,
			Request:     request,
		},
	)
	if err != nil {
		failure := MapStoreError(err)
		LogWorkspaceConflictFailure(
			"commitSettings",
			c.Request.Method,
			c.FullPath(),
			workspaceID,
			"",
			request.ExpectedWorkspaceRev,
			0,
			0,
			request.CommitID,
			failure,
		)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	c.JSON(
		http.StatusOK,
		BuildMutationSuccessPayload(result, strings.TrimSpace(request.CommitID)),
	)
}
