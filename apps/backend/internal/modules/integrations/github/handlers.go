package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

type ProjectReader interface {
	GetByID(ownerID, projectID string) (*backendproject.Project, error)
}

type Handler struct {
	store       *Store
	projects    ProjectReader
	cfg         backendconfig.GitHubAppConfig
	environment string
}

const maximumGitHubWebhookBytes = 2 << 20

func NewHandler(store *Store, projects ProjectReader, cfg backendconfig.GitHubAppConfig, environment string) *Handler {
	return &Handler{store: store, projects: projects, cfg: cfg, environment: strings.ToLower(strings.TrimSpace(environment))}
}

func (handler *Handler) Routes(requireAuth gin.HandlerFunc) RouteHandlers {
	return RouteHandlers{
		RequireAuth:         requireAuth,
		HandleWebhook:       handler.HandleWebhook,
		HandleDevEvent:      handler.HandleDevEvent,
		ListInstallations:   handler.HandleListInstallations,
		ListRepositories:    handler.HandleListRepositories,
		UpsertBinding:       handler.HandleUpsertBinding,
		GetProjectBinding:   handler.HandleGetProjectBinding,
		GetProjectSyncState: handler.HandleGetProjectSyncState,
	}
}

func (handler *Handler) HandleWebhook(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maximumGitHubWebhookBytes)
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Could not read webhook payload.")
		return
	}
	if err := VerifyWebhookSignature(handler.cfg.WebhookSecret, c.GetHeader("X-Hub-Signature-256"), payload); err != nil {
		respondError(c, http.StatusUnauthorized, "API-2001", "GitHub webhook signature is invalid.")
		return
	}

	eventType := strings.TrimSpace(c.GetHeader("X-GitHub-Event"))
	deliveryID := strings.TrimSpace(c.GetHeader("X-GitHub-Delivery"))
	inserted, err := handler.processWebhookPayload(c.Request.Context(), eventType, deliveryID, payload)
	if err != nil {
		respondError(c, http.StatusBadRequest, "API-6001", "Could not process GitHub webhook.")
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"accepted": true, "inserted": inserted})
}

func (handler *Handler) HandleDevEvent(c *gin.Context) {
	if handler.environment == "production" {
		respondError(c, http.StatusNotFound, "API-4004", "Development GitHub events are disabled.")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maximumGitHubWebhookBytes)
	var request struct {
		EventType  string          `json:"eventType"`
		DeliveryID string          `json:"deliveryId"`
		Payload    json.RawMessage `json:"payload"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Invalid request payload.")
		return
	}
	deliveryID := strings.TrimSpace(request.DeliveryID)
	if deliveryID == "" {
		deliveryID = fmt.Sprintf("dev-%d", time.Now().UnixNano())
	}
	inserted, err := handler.processWebhookPayload(c.Request.Context(), request.EventType, deliveryID, request.Payload)
	if err != nil {
		respondError(c, http.StatusBadRequest, "API-6001", "Could not process development GitHub event.")
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"accepted": true, "inserted": inserted, "deliveryId": deliveryID})
}

func (handler *Handler) HandleListInstallations(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	installations, err := handler.store.ListInstallationsForUser(c.Request.Context(), user.ID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "API-6001", "Could not load GitHub installations.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"installations": installations})
}

func (handler *Handler) HandleListRepositories(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	installationID, err := parsePositiveInt64(c.Query("installationId"))
	if err != nil {
		respondError(c, http.StatusBadRequest, "API-4001", "installationId must be a positive integer.")
		return
	}
	repositories, err := handler.store.ListInstallationRepositoriesForUser(c.Request.Context(), user.ID, installationID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "API-6001", "Could not load GitHub repositories.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"repositories": repositories})
}

func (handler *Handler) HandleUpsertBinding(c *gin.Context) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	projectID := strings.TrimSpace(c.Param("id"))
	if err := handler.ensureProjectOwner(c.Request.Context(), user.ID, projectID); err != nil {
		if errors.Is(err, backendproject.ErrProjectNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "Project not found.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not load project.")
		return
	}
	var request struct {
		WorkspaceID    string `json:"workspaceId"`
		InstallationID int64  `json:"installationId"`
		Owner          string `json:"owner"`
		Repo           string `json:"repo"`
		DefaultBranch  string `json:"defaultBranch"`
		Branch         string `json:"branch"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Invalid request payload.")
		return
	}
	allowed, err := handler.store.UserHasInstallationAccess(c.Request.Context(), user.ID, request.InstallationID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "API-6001", "Could not verify GitHub installation access.")
		return
	}
	if !allowed {
		respondError(c, http.StatusForbidden, "API-2003", "GitHub installation is not available to this user.")
		return
	}
	workspaceID := strings.TrimSpace(request.WorkspaceID)
	if workspaceID == "" {
		workspaceID = projectID
	}
	binding, err := handler.store.UpsertRepositoryBinding(c.Request.Context(), UpsertRepositoryBindingParams{
		UserID:         user.ID,
		ProjectID:      projectID,
		WorkspaceID:    workspaceID,
		InstallationID: request.InstallationID,
		Owner:          request.Owner,
		Repo:           request.Repo,
		DefaultBranch:  request.DefaultBranch,
		Branch:         request.Branch,
	})
	if err != nil {
		respondError(c, http.StatusBadRequest, "API-6001", "Could not bind GitHub repository.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"binding": binding})
}

func (handler *Handler) HandleGetProjectBinding(c *gin.Context) {
	binding, ok := handler.loadProjectBinding(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{"binding": binding})
}

func (handler *Handler) HandleGetProjectSyncState(c *gin.Context) {
	binding, ok := handler.loadProjectBinding(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"bindingId": binding.ID,
		"branch":    binding.Branch,
		"pir":       binding.PIR,
		"artifacts": binding.Artifacts,
	})
}

func (handler *Handler) processWebhookPayload(ctx context.Context, eventType, deliveryID string, payload json.RawMessage) (bool, error) {
	eventType = strings.TrimSpace(eventType)
	deliveryID = strings.TrimSpace(deliveryID)
	if eventType == "" || deliveryID == "" {
		return false, errors.New("eventType and deliveryID are required")
	}
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}

	var decoded GitHubWebhookPayload
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return false, err
	}
	var installationID *int64
	if decoded.Installation != nil {
		value := decoded.Installation.ID
		installationID = &value
	}
	inserted, err := handler.store.RecordWebhookEvent(ctx, WebhookEventRecord{
		DeliveryID:     deliveryID,
		EventType:      eventType,
		InstallationID: installationID,
		Action:         decoded.Action,
		Payload:        payload,
		Processed:      false,
	})
	if err != nil {
		return false, err
	}
	if !inserted {
		return false, nil
	}
	if err := handler.applyInstallationPayload(ctx, eventType, payload, decoded); err != nil {
		return true, err
	}
	if err := handler.store.MarkWebhookEventProcessed(ctx, deliveryID); err != nil {
		return true, err
	}
	return true, nil
}

func (handler *Handler) applyInstallationPayload(ctx context.Context, eventType string, raw json.RawMessage, payload GitHubWebhookPayload) error {
	if payload.Installation == nil || payload.Installation.ID <= 0 {
		return nil
	}
	status := InstallationStatusActive
	if eventType == "installation" && payload.Action == "deleted" {
		status = InstallationStatusDeleted
	}
	record := InstallationRecord{
		InstallationID: payload.Installation.ID,
		Status:         status,
		Raw:            raw,
	}
	if payload.Installation.Account != nil {
		record.AccountID = payload.Installation.Account.ID
		record.AccountLogin = payload.Installation.Account.Login
		record.AccountType = payload.Installation.Account.Type
	}
	if _, err := handler.store.UpsertInstallation(ctx, record); err != nil {
		return err
	}

	repositories := payload.Repositories
	if len(repositories) == 0 {
		repositories = payload.RepositoriesAdded
	}
	return handler.store.UpsertInstallationRepositories(ctx, payload.Installation.ID, normalizeRepositories(repositories))
}

func (handler *Handler) ensureProjectOwner(ctx context.Context, userID, projectID string) error {
	if handler.projects == nil {
		return errors.New("project reader is not initialized")
	}
	_, err := handler.projects.GetByID(strings.TrimSpace(userID), strings.TrimSpace(projectID))
	return err
}

func (handler *Handler) loadProjectBinding(c *gin.Context) (*RepositoryBindingRecord, bool) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return nil, false
	}
	projectID := strings.TrimSpace(c.Param("id"))
	if err := handler.ensureProjectOwner(c.Request.Context(), user.ID, projectID); err != nil {
		if errors.Is(err, backendproject.ErrProjectNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "Project not found.")
			return nil, false
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not load project.")
		return nil, false
	}
	binding, err := handler.store.GetRepositoryBindingByProject(c.Request.Context(), user.ID, projectID)
	if err != nil {
		if errors.Is(err, ErrRepositoryBindingNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "GitHub binding not found.")
			return nil, false
		}
		respondError(c, http.StatusInternalServerError, "API-6001", "Could not load GitHub binding.")
		return nil, false
	}
	return binding, true
}

func normalizeRepositories(repositories []GitHubRepositoryPayload) []InstallationRepositoryRecord {
	records := make([]InstallationRepositoryRecord, 0, len(repositories))
	for _, repository := range repositories {
		owner := ""
		if repository.Owner != nil {
			owner = repository.Owner.Login
		}
		if owner == "" && strings.Contains(repository.FullName, "/") {
			owner = strings.SplitN(repository.FullName, "/", 2)[0]
		}
		defaultBranch := strings.TrimSpace(repository.DefaultBranch)
		if defaultBranch == "" {
			defaultBranch = "main"
		}
		records = append(records, InstallationRepositoryRecord{
			InstallationID: 0,
			RepositoryID:   repository.ID,
			Owner:          owner,
			Name:           repository.Name,
			FullName:       repository.FullName,
			Private:        repository.Private,
			DefaultBranch:  defaultBranch,
		})
	}
	return records
}

func parsePositiveInt64(value string) (int64, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0, errors.New("empty value")
	}
	parsed, err := strconv.ParseInt(trimmed, 10, 64)
	if err != nil || parsed <= 0 {
		return 0, errors.New("invalid positive integer")
	}
	return parsed, nil
}

func respondError(c *gin.Context, status int, code, message string) {
	backendresponse.Error(c, status, code, message)
}
