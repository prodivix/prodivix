package workspace

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
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

func (handler *Handler) requireWorkspaceOwner(c *gin.Context, userID string, workspaceID string) bool {
	if handler == nil || handler.store == nil {
		backendresponse.Error(c, http.StatusInternalServerError, ErrorWorkspaceOperationFailed, "Workspace authorization is not available.")
		return false
	}
	if err := handler.store.VerifyWorkspaceOwner(c.Request.Context(), userID, workspaceID); err != nil {
		failure := MapStoreError(err)
		c.JSON(failure.Status, failure.Payload)
		return false
	}
	return true
}

func (handler *Handler) Routes(requireAuth gin.HandlerFunc) RouteHandlers {
	return RouteHandlers{
		RequireAuth:              requireAuth,
		GetWorkspace:             handler.HandleGetWorkspace,
		GetWorkspaceCapabilities: handler.HandleGetWorkspaceCapabilities,
		ImportLocalProject:       handler.HandleImportLocalProject,
		CommitWorkspaceOperation: handler.HandleCommitWorkspaceOperation,
		CommitWorkspaceSettings:  handler.HandleCommitWorkspaceSettings,
	}
}

type documentResponse struct {
	ID           string                `json:"id"`
	Type         WorkspaceDocumentType `json:"type"`
	Name         string                `json:"name,omitempty"`
	Path         string                `json:"path"`
	ContentRev   int64                 `json:"contentRev"`
	MetaRev      int64                 `json:"metaRev"`
	Content      json.RawMessage       `json:"content"`
	Capabilities []string              `json:"capabilities,omitempty"`
	UpdatedAt    time.Time             `json:"updatedAt"`
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

type importLocalProjectRequest struct {
	Name         string                      `json:"name"`
	Description  string                      `json:"description"`
	ResourceType backendproject.ResourceType `json:"resourceType"`
	Workspace    importWorkspaceRequest      `json:"workspace"`
}

type importWorkspaceRequest struct {
	ID                string                          `json:"id"`
	WorkspaceRev      int64                           `json:"workspaceRev"`
	RouteRev          int64                           `json:"routeRev"`
	OpSeq             int64                           `json:"opSeq"`
	Tree              json.RawMessage                 `json:"tree"`
	Documents         []WorkspaceImportDocumentRecord `json:"documents"`
	RouteManifest     json.RawMessage                 `json:"routeManifest"`
	Settings          json.RawMessage                 `json:"settings"`
	ActiveRouteNodeID string                          `json:"activeRouteNodeId"`
}

func buildSnapshotResponse(snapshot *WorkspaceSnapshot) snapshotResponse {
	if snapshot == nil {
		return snapshotResponse{}
	}
	documents := make([]documentResponse, 0, len(snapshot.Documents))
	for _, document := range snapshot.Documents {
		documents = append(documents, documentResponse{ID: document.ID, Type: document.Type, Name: document.Name, Path: document.Path, ContentRev: document.ContentRev, MetaRev: document.MetaRev, Content: document.Content, Capabilities: append([]string(nil), document.Capabilities...), UpdatedAt: document.UpdatedAt})
	}
	return snapshotResponse{ID: snapshot.Workspace.ID, WorkspaceRev: snapshot.Workspace.WorkspaceRev, RouteRev: snapshot.Workspace.RouteRev, OpSeq: snapshot.Workspace.OpSeq, Tree: snapshot.Workspace.Tree, Documents: documents, RouteManifest: snapshot.RouteManifest, Settings: snapshot.Settings}
}

func resolveImportCanonicalPIR(documents []WorkspaceImportDocumentRecord) (json.RawMessage, bool) {
	for _, document := range documents {
		if document.Type == WorkspaceDocumentTypePIRPage &&
			(strings.TrimSpace(document.Path) == "/" || strings.TrimSpace(document.Path) == "/pir.json" || strings.TrimSpace(document.Path) == "") {
			return document.Content, true
		}
	}
	for _, document := range documents {
		if document.Type == WorkspaceDocumentTypePIRPage {
			return document.Content, true
		}
	}
	for _, document := range documents {
		if isPIRWorkspaceDocumentType(document.Type) {
			return document.Content, true
		}
	}
	return nil, false
}

func (handler *Handler) HandleImportLocalProject(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		backendresponse.Error(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	if handler.module == nil || handler.module.projects == nil || handler.module.store == nil {
		backendresponse.Error(c, http.StatusInternalServerError, "API-5001", "Workspace import is not available.")
		return
	}

	var request importLocalProjectRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		failure := NewRequestFailure(http.StatusBadRequest, ErrorInvalidPayload, "Invalid request payload.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	_, hasPIR := resolveImportCanonicalPIR(request.Workspace.Documents)
	if !hasPIR {
		failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "Workspace import requires a PIR page document.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}

	resourceType := request.ResourceType
	if strings.TrimSpace(string(resourceType)) == "" {
		resourceType = backendproject.ResourceTypeProject
	}
	project, err := handler.module.projects.PrepareProject(backendproject.PrepareProjectParams{
		OwnerID:      user.ID,
		Name:         request.Name,
		Description:  request.Description,
		ResourceType: resourceType,
		IsPublic:     false,
	})
	if err != nil {
		if errors.Is(err, backendproject.ErrInvalidResourceType) {
			backendresponse.Error(c, http.StatusBadRequest, "API-4001", "Resource type is invalid.")
			return
		}
		backendresponse.Error(c, http.StatusInternalServerError, "API-5001", "Could not import local project.")
		return
	}

	snapshot, err := handler.module.importPreparedProjectWorkspace(c.Request.Context(), project, ImportWorkspaceSnapshotParams{
		WorkspaceRev:  request.Workspace.WorkspaceRev,
		RouteRev:      request.Workspace.RouteRev,
		OpSeq:         request.Workspace.OpSeq,
		Tree:          request.Workspace.Tree,
		RouteManifest: request.Workspace.RouteManifest,
		Settings:      request.Workspace.Settings,
		Documents:     request.Workspace.Documents,
	})
	if err != nil {
		failure := MapStoreError(err)
		c.JSON(failure.Status, failure.Payload)
		return
	}

	c.JSON(http.StatusCreated, map[string]any{
		"project":   backendproject.ProjectSummary{ID: project.ID, ResourceType: project.ResourceType, Name: project.Name, Description: project.Description, IsPublic: project.IsPublic, StarsCount: project.StarsCount, CreatedAt: project.CreatedAt, UpdatedAt: project.UpdatedAt},
		"workspace": buildSnapshotResponse(snapshot),
	})
}
