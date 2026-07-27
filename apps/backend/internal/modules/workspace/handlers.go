package workspace

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	store             *WorkspaceStore
	module            *Module
	assetDelivery     backendconfig.AssetDeliveryHostConfig
	assetDeliveryHTTP *http.Client
}

func NewHandler(store *WorkspaceStore, module *Module, assetDelivery ...backendconfig.AssetDeliveryHostConfig) *Handler {
	config := backendconfig.AssetDeliveryHostConfig{}
	if len(assetDelivery) > 0 {
		config = assetDelivery[0]
	}
	timeout := config.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &Handler{store: store, module: module, assetDelivery: config, assetDeliveryHTTP: &http.Client{Timeout: timeout}}
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
		PutWorkspaceAssetBlob:    handler.HandlePutWorkspaceAssetBlob,
		GetWorkspaceAssetBlob:    handler.HandleGetWorkspaceAssetBlob,
		CreateAssetDelivery:      handler.HandleCreateAssetDelivery,
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

// canonicalPIRCandidate is the document projection that canonical PIR selection
// needs. Import and publication share one selection order so a Workspace that
// imports cleanly is also the Workspace that publishes.
type canonicalPIRCandidate struct {
	Type    WorkspaceDocumentType
	Path    string
	Content json.RawMessage
}

// resolveCanonicalPIRDocument selects the document a resource type owns as its
// canonical projection: a project's root page, a component's component
// document, a nodegraph's graph document. There is deliberately no cross-type
// fallback — a layout can never stand in for a missing page, so a workspace
// without its owner document is not publishable rather than silently
// projecting something else.
func resolveCanonicalPIRDocument(resourceType backendproject.ResourceType, candidates []canonicalPIRCandidate) (json.RawMessage, bool) {
	switch resourceType {
	case backendproject.ResourceTypeComponent:
		for _, candidate := range candidates {
			if candidate.Type == WorkspaceDocumentTypePIRComponent {
				return candidate.Content, true
			}
		}
	case backendproject.ResourceTypeNodeGraph:
		for _, candidate := range candidates {
			if candidate.Type == WorkspaceDocumentTypePIRGraph {
				return candidate.Content, true
			}
		}
	default:
		for _, candidate := range candidates {
			path := strings.TrimSpace(candidate.Path)
			if candidate.Type == WorkspaceDocumentTypePIRPage && (path == "/" || path == "/pir.json" || path == "") {
				return candidate.Content, true
			}
		}
		for _, candidate := range candidates {
			if candidate.Type == WorkspaceDocumentTypePIRPage {
				return candidate.Content, true
			}
		}
	}
	return nil, false
}

func resolveImportCanonicalPIR(resourceType backendproject.ResourceType, documents []WorkspaceImportDocumentRecord) (json.RawMessage, bool) {
	candidates := make([]canonicalPIRCandidate, 0, len(documents))
	for _, document := range documents {
		candidates = append(candidates, canonicalPIRCandidate{Type: document.Type, Path: document.Path, Content: document.Content})
	}
	return resolveCanonicalPIRDocument(resourceType, candidates)
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

	decoded, failure := decodeImportLocalProjectRequest(c)
	if failure != nil {
		c.JSON(failure.Status, failure.Payload)
		return
	}
	request := decoded.Request
	importResourceType := request.ResourceType
	if strings.TrimSpace(string(importResourceType)) == "" {
		importResourceType = backendproject.ResourceTypeProject
	}
	_, hasPIR := resolveImportCanonicalPIR(importResourceType, request.Workspace.Documents)
	if !hasPIR {
		failure := NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, "Workspace import requires the PIR document its resource type owns.", nil)
		c.JSON(failure.Status, failure.Payload)
		return
	}
	for _, document := range request.Workspace.Documents {
		if document.Type != WorkspaceDocumentTypeAsset {
			continue
		}
		if decoded.UploadAware {
			break
		}
		failure := NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorWorkspaceAssetImportUnsupported,
			"Workspace imports containing binary assets require the upload-aware import protocol.",
			map[string]any{"documentId": document.ID},
		)
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
		AssetBlobs:    decoded.AssetBlobs,
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
