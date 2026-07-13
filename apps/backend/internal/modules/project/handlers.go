package project

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

type WorkspaceBootstrapper interface {
	CreateProjectWorkspace(ctx context.Context, ownerID string, name string, description string, resourceType ResourceType, isPublic bool, initialPIR json.RawMessage) (*Project, error)
	PublishProjectWorkspace(ctx context.Context, userID string, workspaceID string) (*Project, error)
}

type Handler struct {
	store           *ProjectStore
	workspaceModule WorkspaceBootstrapper
}

func NewHandler(store *ProjectStore, workspaceModule WorkspaceBootstrapper) *Handler {
	return &Handler{store: store, workspaceModule: workspaceModule}
}

func (handler *Handler) Routes(requireAuth gin.HandlerFunc) RouteHandlers {
	return RouteHandlers{
		RequireAuth:    requireAuth,
		ListProjects:   handler.HandleListProjects,
		CreateProject:  handler.HandleCreateProject,
		GetProject:     handler.HandleGetProject,
		UpdateProject:  handler.HandleUpdateProject,
		PublishProject: handler.HandlePublishProject,
		DeleteProject:  handler.HandleDeleteProject,
		ListCommunity:  handler.HandleCommunityListProjects,
		GetCommunity:   handler.HandleCommunityGetProject,
	}
}

func (handler *Handler) HandleListProjects(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	projects, err := handler.store.ListByOwner(user.ID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not load projects.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"projects": projects})
}

func (handler *Handler) HandleCreateProject(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	var request struct {
		Name         string          `json:"name"`
		Description  string          `json:"description"`
		ResourceType ResourceType    `json:"resourceType"`
		IsPublic     bool            `json:"isPublic"`
		PIR          json.RawMessage `json:"pir"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Invalid request payload.")
		return
	}
	resourceType := request.ResourceType
	if strings.TrimSpace(string(resourceType)) == "" {
		resourceType = ResourceTypeProject
	}
	initialPIR, err := normalizePIR(request.PIR)
	if err != nil {
		respondError(c, http.StatusUnprocessableEntity, "PIR-4001", "PIR document is invalid.")
		return
	}
	if handler.workspaceModule == nil {
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not create project.")
		return
	}
	project, err := handler.workspaceModule.CreateProjectWorkspace(
		c.Request.Context(),
		user.ID,
		request.Name,
		request.Description,
		resourceType,
		request.IsPublic,
		initialPIR,
	)
	if err != nil {
		if errors.Is(err, ErrInvalidResourceType) {
			respondError(c, http.StatusBadRequest, "API-4001", "Resource type is invalid.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not create project.")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"project": toProjectSummary(project)})
}

func (handler *Handler) HandleGetProject(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	project, err := handler.store.GetByID(user.ID, c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrProjectNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "Project not found.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not load project.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"project": toProjectSummary(project)})
}

func (handler *Handler) HandleUpdateProject(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	var request struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Invalid request payload.")
		return
	}
	if request.Name == nil && request.Description == nil {
		respondError(c, http.StatusBadRequest, "API-1001", "No fields to update.")
		return
	}

	project, err := handler.store.UpdateProject(user.ID, c.Param("id"), request.Name, request.Description)
	if err != nil {
		if errors.Is(err, ErrProjectNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "Project not found.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not update project.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"project": toProjectSummary(project)})
}

func (handler *Handler) HandlePublishProject(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	if handler.workspaceModule == nil {
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not publish project.")
		return
	}
	project, err := handler.workspaceModule.PublishProjectWorkspace(c.Request.Context(), user.ID, c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrProjectNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "Project not found.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not publish project.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"project": toProjectSummary(project)})
}

func (handler *Handler) HandleDeleteProject(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	if err := handler.store.Delete(user.ID, c.Param("id")); err != nil {
		if errors.Is(err, ErrProjectNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "Project not found.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not delete project.")
		return
	}
	c.Status(http.StatusNoContent)
}

func (handler *Handler) HandleCommunityListProjects(c *gin.Context) {
	options := CommunityListOptions{
		Keyword:      c.Query("keyword"),
		ResourceType: ResourceType(c.Query("resourceType")),
		Sort:         c.DefaultQuery("sort", "latest"),
		Page:         ParsePositiveInt(c.Query("page"), 1),
		PageSize:     ParsePositiveInt(c.Query("pageSize"), 20),
	}
	projects, err := handler.store.ListPublic(options)
	if err != nil {
		if errors.Is(err, ErrInvalidResourceType) {
			respondError(c, http.StatusBadRequest, "API-4001", "Resource type is invalid.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not load community projects.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"projects": projects, "page": options.Page, "pageSize": options.PageSize, "sort": strings.ToLower(strings.TrimSpace(options.Sort))})
}

func (handler *Handler) HandleCommunityGetProject(c *gin.Context) {
	project, err := handler.store.GetPublicByID(c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrProjectNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "Project not found.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not load project.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"project": project})
}

func toProjectSummary(project *Project) ProjectSummary {
	if project == nil {
		return ProjectSummary{}
	}
	return ProjectSummary{ID: project.ID, ResourceType: project.ResourceType, Name: project.Name, Description: project.Description, IsPublic: project.IsPublic, StarsCount: project.StarsCount, CreatedAt: project.CreatedAt, UpdatedAt: project.UpdatedAt}
}

func respondError(c *gin.Context, status int, code, message string) {
	backendresponse.Error(c, status, code, message)
}
