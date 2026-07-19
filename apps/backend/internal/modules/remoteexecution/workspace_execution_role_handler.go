package remoteexecution

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

const maximumWorkspaceExecutionRoleRequestBytes int64 = 4 * 1024

func (handler *Handler) workspaceExecutionRoleStore(c *gin.Context) (WorkspaceExecutionRoleStore, bool) {
	if handler == nil || handler.store == nil {
		backendresponse.Error(c, http.StatusServiceUnavailable, "EXE-5001", "Workspace collaboration is unavailable.", backendresponse.WithRetryable(true))
		return nil, false
	}
	store, ok := handler.store.(WorkspaceExecutionRoleStore)
	if !ok {
		backendresponse.Error(c, http.StatusServiceUnavailable, "EXE-5001", "Workspace collaboration is unavailable.", backendresponse.WithRetryable(true))
		return nil, false
	}
	return store, true
}

func canonicalWorkspaceRolePathValue(value string) (string, bool) {
	if value == "" || value != strings.TrimSpace(value) || len(value) > 255 || strings.ContainsRune(value, '\x00') {
		return "", false
	}
	return value, true
}

func decodeWorkspaceExecutionRoleRequest(c *gin.Context, target any) error {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maximumWorkspaceExecutionRoleRequestBytes)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request must contain one JSON value")
	}
	return nil
}

func respondWorkspaceExecutionRoleError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrExecutionNotFound):
		backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Workspace collaborator was not found.")
	case errors.Is(err, ErrExecutionAuthorityConflict):
		backendresponse.Error(c, http.StatusConflict, "EXE-4009", "Workspace collaborator authority is invalid.")
	default:
		backendresponse.Error(c, http.StatusServiceUnavailable, "EXE-5001", "Workspace collaboration is unavailable.", backendresponse.WithRetryable(true))
	}
}

func (handler *Handler) HandleListWorkspaceExecutionRoles(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	store, ok := handler.workspaceExecutionRoleStore(c)
	if !ok {
		return
	}
	user, ok := authUser(c)
	if !ok {
		return
	}
	workspaceID, valid := canonicalWorkspaceRolePathValue(c.Param("workspaceId"))
	if !valid {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Workspace collaborator request is invalid.")
		return
	}
	grants, err := store.ListWorkspaceExecutionRoles(c.Request.Context(), user.ID, workspaceID)
	if err != nil {
		respondWorkspaceExecutionRoleError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"roles": grants})
}

func (handler *Handler) HandlePutWorkspaceExecutionRole(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	store, ok := handler.workspaceExecutionRoleStore(c)
	if !ok {
		return
	}
	user, ok := authUser(c)
	if !ok {
		return
	}
	workspaceID, valid := canonicalWorkspaceRolePathValue(c.Param("workspaceId"))
	if !valid {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Workspace collaborator request is invalid.")
		return
	}
	var request struct {
		PrincipalEmail string `json:"principalEmail"`
		Role           string `json:"role"`
	}
	if err := decodeWorkspaceExecutionRoleRequest(c, &request); err != nil {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Workspace collaborator request is invalid.")
		return
	}
	request.PrincipalEmail = strings.TrimSpace(strings.ToLower(request.PrincipalEmail))
	if request.PrincipalEmail == "" || len(request.PrincipalEmail) > 320 || !strings.Contains(request.PrincipalEmail, "@") {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Workspace collaborator request is invalid.")
		return
	}
	if _, validRole := canonicalWorkspaceExecutionRole(request.Role); !validRole {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Workspace collaborator request is invalid.")
		return
	}
	if err := store.GrantWorkspaceExecutionRoleByEmail(c.Request.Context(), user.ID, workspaceID, request.PrincipalEmail, request.Role); err != nil {
		respondWorkspaceExecutionRoleError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (handler *Handler) HandleDeleteWorkspaceExecutionRole(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	store, ok := handler.workspaceExecutionRoleStore(c)
	if !ok {
		return
	}
	user, ok := authUser(c)
	if !ok {
		return
	}
	workspaceID, validWorkspace := canonicalWorkspaceRolePathValue(c.Param("workspaceId"))
	principalID, validPrincipal := canonicalWorkspaceRolePathValue(c.Param("principalId"))
	if !validWorkspace || !validPrincipal {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Workspace collaborator request is invalid.")
		return
	}
	if err := store.RevokeWorkspaceExecutionRole(c.Request.Context(), user.ID, workspaceID, principalID); err != nil {
		respondWorkspaceExecutionRoleError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
