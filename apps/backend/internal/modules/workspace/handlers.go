package workspace

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	store  *WorkspaceStore
	module *Module
}

func NewHandler(store *WorkspaceStore, module *Module) *Handler {
	return &Handler{store: store, module: module}
}

func (handler *Handler) Routes(requireAuth gin.HandlerFunc) RouteHandlers {
	return RouteHandlers{
		RequireAuth:              requireAuth,
		GetWorkspace:             handler.HandleGetWorkspace,
		GetWorkspaceCapabilities: handler.HandleGetWorkspaceCapabilities,
		PatchWorkspaceDocument:   handler.HandlePatchWorkspaceDocument,
		ApplyWorkspaceIntent:     handler.HandleApplyWorkspaceIntent,
		ApplyWorkspaceBatch:      handler.HandleApplyWorkspaceBatch,
	}
}

type documentResponse struct {
	ID         string                `json:"id"`
	Type       WorkspaceDocumentType `json:"type"`
	Path       string                `json:"path"`
	ContentRev int64                 `json:"contentRev"`
	MetaRev    int64                 `json:"metaRev"`
	Content    json.RawMessage       `json:"content"`
	UpdatedAt  time.Time             `json:"updatedAt"`
}

type snapshotResponse struct {
	ID            string             `json:"id"`
	WorkspaceRev  int64              `json:"workspaceRev"`
	RouteRev      int64              `json:"routeRev"`
	OpSeq         int64              `json:"opSeq"`
	Tree          json.RawMessage    `json:"tree"`
	Documents     []documentResponse `json:"documents"`
	RouteManifest json.RawMessage    `json:"routeManifest"`
	Settings      json.RawMessage    `json:"settings"`
}

type PatchDocumentRequest struct {
	ExpectedContentRev int64                    `json:"expectedContentRev"`
	ClientMutationID   string                   `json:"clientMutationId"`
	Command            WorkspaceCommandEnvelope `json:"command"`
}

type intentActor struct {
	UserID   string `json:"userId"`
	ClientID string `json:"clientId"`
}

type intentEnvelope struct {
	ID             string          `json:"id"`
	Namespace      string          `json:"namespace"`
	Type           string          `json:"type"`
	Version        string          `json:"version"`
	Payload        json.RawMessage `json:"payload"`
	IdempotencyKey string          `json:"idempotencyKey"`
	Actor          *intentActor    `json:"actor"`
	IssuedAt       time.Time       `json:"issuedAt"`
}

type ApplyIntentHTTPrequest struct {
	ExpectedWorkspaceRev int64          `json:"expectedWorkspaceRev"`
	ExpectedRouteRev     int64          `json:"expectedRouteRev"`
	Intent               intentEnvelope `json:"intent"`
	ClientMutationID     string         `json:"clientMutationId"`
}

type ApplyBatchRequest struct {
	ExpectedWorkspaceRev int64             `json:"expectedWorkspaceRev"`
	ExpectedRouteRev     int64             `json:"expectedRouteRev"`
	Operations           []json.RawMessage `json:"operations"`
	ClientBatchID        string            `json:"clientBatchId"`
}

type batchOperationKind struct {
	Op string `json:"op"`
}

type batchPatchDocumentOperation struct {
	Op                 string                   `json:"op"`
	DocumentID         string                   `json:"documentId"`
	ExpectedContentRev int64                    `json:"expectedContentRev"`
	Command            WorkspaceCommandEnvelope `json:"command"`
}

type batchIntentOperation struct {
	Op     string         `json:"op"`
	Intent intentEnvelope `json:"intent"`
}

func toIntent(intent intentEnvelope) IntentEnvelope {
	var actor *IntentActor
	if intent.Actor != nil {
		actor = &IntentActor{UserID: intent.Actor.UserID, ClientID: intent.Actor.ClientID}
	}
	return IntentEnvelope{ID: intent.ID, Namespace: intent.Namespace, Type: intent.Type, Version: intent.Version, Payload: intent.Payload, IdempotencyKey: intent.IdempotencyKey, Actor: actor, IssuedAt: intent.IssuedAt}
}

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
	documents := make([]documentResponse, 0, len(snapshot.Documents))
	for _, document := range snapshot.Documents {
		documents = append(documents, documentResponse{ID: document.ID, Type: document.Type, Path: document.Path, ContentRev: document.ContentRev, MetaRev: document.MetaRev, Content: document.Content, UpdatedAt: document.UpdatedAt})
	}
	c.JSON(http.StatusOK, map[string]any{"workspace": snapshotResponse{ID: snapshot.Workspace.ID, WorkspaceRev: snapshot.Workspace.WorkspaceRev, RouteRev: snapshot.Workspace.RouteRev, OpSeq: snapshot.Workspace.OpSeq, Tree: snapshot.Workspace.Tree, Documents: documents, RouteManifest: snapshot.RouteManifest, Settings: snapshot.Settings}})
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
	var request PatchDocumentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		failure := NewRequestFailure(http.StatusBadRequest, ErrorInvalidPayload, "Invalid request payload.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	if request.ExpectedContentRev <= 0 {
		failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "expectedContentRev must be positive.", nil)
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

func (handler *Handler) HandleSaveWorkspaceDocument(c *gin.Context) {
	failure := NewRequestFailure(http.StatusMethodNotAllowed, ErrorInvalidPayload, "Full document save is disabled. Use command PATCH.", nil)
	c.JSON(failure.Status, failure.Payload)
}

func (handler *Handler) HandleApplyWorkspaceIntent(c *gin.Context) {
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
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
	c.JSON(http.StatusOK, BuildMutationSuccessPayload(result, strings.TrimSpace(request.ClientMutationID)))
}

func (handler *Handler) HandleApplyWorkspaceBatch(c *gin.Context) {
	workspaceID := strings.TrimSpace(c.Param("workspaceId"))
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	var request ApplyBatchRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		failure := NewRequestFailure(http.StatusBadRequest, ErrorInvalidPayload, "Invalid request payload.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	if request.ExpectedWorkspaceRev <= 0 {
		failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "expectedWorkspaceRev must be positive.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	if len(request.Operations) == 0 {
		failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "operations must not be empty.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	currentWorkspaceRev := request.ExpectedWorkspaceRev
	currentRouteRev := request.ExpectedRouteRev
	var latest *WorkspaceMutationResult
	for index, operationRaw := range request.Operations {
		var operationKind batchOperationKind
		if err := json.Unmarshal(operationRaw, &operationKind); err != nil {
			failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "Invalid batch operation payload.", map[string]any{"index": index})
			c.JSON(failure.Status, failure.Payload)
			return
		}
		switch strings.TrimSpace(operationKind.Op) {
		case "patchDocument":
			var operation batchPatchDocumentOperation
			if err := json.Unmarshal(operationRaw, &operation); err != nil {
				failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "Invalid patchDocument operation payload.", map[string]any{"index": index})
				c.JSON(failure.Status, failure.Payload)
				return
			}
			documentID := strings.TrimSpace(operation.DocumentID)
			if documentID == "" {
				failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "patchDocument operation requires documentId.", map[string]any{"index": index})
				c.JSON(failure.Status, failure.Payload)
				return
			}
			if operation.ExpectedContentRev <= 0 {
				failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "patchDocument operation requires expectedContentRev > 0.", map[string]any{"index": index})
				c.JSON(failure.Status, failure.Payload)
				return
			}
			result, err := handler.store.PatchDocumentContent(c.Request.Context(), PatchDocumentContentParams{WorkspaceID: workspaceID, DocumentID: documentID, ExpectedContentRev: operation.ExpectedContentRev, Command: operation.Command})
			if err != nil {
				failure := MapStoreError(err)
				LogWorkspaceConflictFailure("batch.patchDocument", c.Request.Method, c.FullPath(), workspaceID, documentID, currentWorkspaceRev, currentRouteRev, operation.ExpectedContentRev, request.ClientBatchID, failure)
				c.JSON(failure.Status, failure.Payload)
				return
			}
			latest = result
			currentWorkspaceRev = result.WorkspaceRev
			currentRouteRev = result.RouteRev
		case "intent":
			var operation batchIntentOperation
			if err := json.Unmarshal(operationRaw, &operation); err != nil {
				failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "Invalid intent operation payload.", map[string]any{"index": index})
				c.JSON(failure.Status, failure.Payload)
				return
			}
			result, failure := handler.module.ApplyIntentMutation(c.Request.Context(), workspaceID, ApplyIntentRequest{ExpectedWorkspaceRev: currentWorkspaceRev, ExpectedRouteRev: currentRouteRev, Intent: toIntent(operation.Intent)})
			if failure != nil {
				LogWorkspaceConflictFailure("batch.intent", c.Request.Method, c.FullPath(), workspaceID, "", currentWorkspaceRev, currentRouteRev, 0, request.ClientBatchID, failure)
				c.JSON(failure.Status, failure.Payload)
				return
			}
			latest = result
			currentWorkspaceRev = result.WorkspaceRev
			currentRouteRev = result.RouteRev
		default:
			failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "Unsupported batch operation.", map[string]any{"index": index, "op": strings.TrimSpace(operationKind.Op)})
			c.JSON(failure.Status, failure.Payload)
			return
		}
	}
	if latest == nil {
		failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "Batch did not include executable operations.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	handler.module.SyncProjectMirrorFromWorkspace(c.Request.Context(), user.ID, workspaceID)
	c.JSON(http.StatusOK, BuildMutationSuccessPayload(latest, strings.TrimSpace(request.ClientBatchID)))
}
