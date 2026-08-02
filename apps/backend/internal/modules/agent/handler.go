package agent

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	"github.com/gin-gonic/gin"
)

const maximumAgentProductRequestBytes = 8_388_608

type ProductRepository interface {
	CreateTask(context.Context, PrincipalAuthority, []byte) (TaskRecord, bool, error)
	DecideProposal(context.Context, PrincipalAuthority, []byte) (ApprovalDecisionRecord, bool, error)
	StoreRunUserCommand(context.Context, PrincipalAuthority, string, []byte) (RunUserCommandRecord, bool, error)
	GetProductLedgerBundle(context.Context, PrincipalAuthority, string) (ProductLedgerBundle, error)
	ExportAudit(context.Context, string, string, int64, int, time.Time) (AuditExport, error)
}

type Handler struct {
	repository ProductRepository
}

func NewHandler(repository ProductRepository) *Handler {
	return &Handler{repository: repository}
}

func (handler *Handler) Routes(requireAuth gin.HandlerFunc) RouteHandlers {
	return RouteHandlers{
		RequireAuth: requireAuth, CreateTask: handler.HandleCreateTask,
		DecideProposal: handler.HandleDecideProposal, StoreRunCommand: handler.HandleStoreRunCommand,
		GetProduct: handler.HandleGetProduct, ExportAudit: handler.HandleExportAudit,
	}
}

func (handler *Handler) HandleCreateTask(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	source, ok := readAgentFact(c)
	if !ok {
		return
	}
	record, replayed, err := handler.repository.CreateTask(c.Request.Context(), authority, source)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	status := http.StatusCreated
	if replayed {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"task": json.RawMessage(record.FactBytes), "replayed": replayed})
}

func (handler *Handler) HandleDecideProposal(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	source, ok := readAgentFact(c)
	if !ok {
		return
	}
	record, replayed, err := handler.repository.DecideProposal(c.Request.Context(), authority, source)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	status := http.StatusCreated
	if replayed {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"approval": json.RawMessage(record.FactBytes), "replayed": replayed})
}

func (handler *Handler) HandleStoreRunCommand(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	source, ok := readAgentFact(c)
	if !ok {
		return
	}
	record, replayed, err := handler.repository.StoreRunUserCommand(
		c.Request.Context(), authority, c.Param("runId"), source,
	)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	status := http.StatusAccepted
	if replayed {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"command": json.RawMessage(record.FactBytes), "replayed": replayed})
}

func (handler *Handler) HandleGetProduct(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	bundle, err := handler.repository.GetProductLedgerBundle(c.Request.Context(), authority, c.Param("runId"))
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ledger": bundle})
}

func (handler *Handler) HandleExportAudit(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	runID := c.Param("runId")
	if _, err := handler.repository.GetProductLedgerBundle(c.Request.Context(), authority, runID); err != nil {
		respondAgentError(c, err)
		return
	}
	fromSequence, limit := int64(1), maximumAuditEvents
	if raw := c.Query("fromSequence"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed < 1 {
			respondAgentError(c, ErrInvalid)
			return
		}
		fromSequence = parsed
	}
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > maximumAuditEvents {
			respondAgentError(c, ErrInvalid)
			return
		}
		limit = parsed
	}
	exportedAt := time.Now().UTC()
	if raw := c.Query("exportedAt"); raw != "" {
		parsed, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			respondAgentError(c, ErrInvalid)
			return
		}
		exportedAt = parsed.UTC()
	}
	export, err := handler.repository.ExportAudit(c.Request.Context(), authority.WorkspaceID, runID, fromSequence, limit, exportedAt)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.Header("Content-Disposition", `attachment; filename="agent-audit-`+runID+`.json"`)
	c.Data(http.StatusOK, "application/json; charset=utf-8", export.FactBytes)
}

func productAuthority(c *gin.Context) (PrincipalAuthority, bool) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"code": "AI-7001", "message": "Authentication required."})
		return PrincipalAuthority{}, false
	}
	projectID, workspaceID := strings.TrimSpace(c.Param("id")), strings.TrimSpace(c.Param("workspaceId"))
	if projectID == "" || workspaceID == "" {
		respondAgentError(c, ErrInvalid)
		return PrincipalAuthority{}, false
	}
	return PrincipalAuthority{Kind: "user", PrincipalID: user.ID, ProjectID: projectID, WorkspaceID: workspaceID}, true
}

func readAgentFact(c *gin.Context) ([]byte, bool) {
	if contentType := c.GetHeader("Content-Type"); contentType != "" && !strings.HasPrefix(strings.ToLower(contentType), "application/json") {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"code": "AI-9001", "message": "Agent facts require application/json."})
		return nil, false
	}
	reader := http.MaxBytesReader(c.Writer, c.Request.Body, maximumAgentProductRequestBytes)
	source, err := io.ReadAll(reader)
	if err != nil || len(source) == 0 {
		respondAgentError(c, ErrInvalid)
		return nil, false
	}
	return source, true
}

func respondAgentError(c *gin.Context, err error) {
	status, code, message := http.StatusInternalServerError, "AI-9001", "Agent product operation failed."
	switch {
	case errors.Is(err, ErrInvalid):
		status, message = http.StatusBadRequest, "Agent fact is invalid."
	case errors.Is(err, ErrUnauthorized):
		status, code, message = http.StatusForbidden, "AI-7001", "Agent authority is stale or missing."
	case errors.Is(err, ErrNotFound):
		status, code, message = http.StatusNotFound, "AI-6004", "Agent record was not found."
	case errors.Is(err, ErrConflict), errors.Is(err, ErrTerminal), errors.Is(err, ErrLeaseBusy):
		status, code, message = http.StatusConflict, "AI-6004", "Agent fact conflicts with durable state."
	}
	c.JSON(status, gin.H{"code": code, "message": message})
}
