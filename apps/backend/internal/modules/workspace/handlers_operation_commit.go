package workspace

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

func decodeWorkspaceOperationCommitRequest(c *gin.Context) (WorkspaceOperationCommitRequest, error) {
	var request WorkspaceOperationCommitRequest
	var payload json.RawMessage
	wireDecoder := json.NewDecoder(c.Request.Body)
	if err := wireDecoder.Decode(&payload); err != nil {
		return request, err
	}
	var extra any
	if err := wireDecoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return request, errors.New("request body must contain one JSON value")
		}
		return request, err
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, err
	}
	if err := validateWorkspaceOperationCommitWirePresence(payload); err != nil {
		return request, err
	}
	return request, nil
}

func workspaceOperationCommitIdentity(operation WorkspaceOperationEnvelope) string {
	if strings.TrimSpace(strings.ToLower(operation.Kind)) == "command" && operation.Command != nil {
		return strings.TrimSpace(operation.Command.ID)
	}
	if strings.TrimSpace(strings.ToLower(operation.Kind)) == "transaction" && operation.Transaction != nil {
		return strings.TrimSpace(operation.Transaction.ID)
	}
	return ""
}

func (handler *Handler) HandleCommitWorkspaceOperation(c *gin.Context) {
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	if !handler.requireWorkspaceOwner(c, user.ID, workspaceID) {
		return
	}
	request, err := decodeWorkspaceOperationCommitRequest(c)
	if err != nil {
		var validationError *WorkspaceOperationCommitValidationError
		if errors.As(err, &validationError) {
			failure := MapStoreError(err)
			c.JSON(failure.Status, failure.Payload)
			return
		}
		failure := NewRequestFailure(http.StatusBadRequest, ErrorInvalidPayload, "Invalid workspace operation commit payload.", map[string]any{"reason": err.Error()})
		c.JSON(failure.Status, failure.Payload)
		return
	}
	result, err := handler.store.CommitWorkspaceOperation(c.Request.Context(), CommitWorkspaceOperationParams{
		WorkspaceID: workspaceID,
		OwnerID:     user.ID,
		Request:     request,
	})
	if err != nil {
		failure := MapStoreError(err)
		LogWorkspaceConflictFailure(
			"commitOperation",
			c.Request.Method,
			c.FullPath(),
			workspaceID,
			"",
			0,
			0,
			0,
			workspaceOperationCommitIdentity(request.Operation),
			failure,
		)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	c.JSON(http.StatusOK, BuildMutationSuccessPayload(result, workspaceOperationCommitIdentity(request.Operation)))
}
