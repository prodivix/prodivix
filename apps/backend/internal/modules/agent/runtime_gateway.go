package agent

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

const RuntimePrincipalID = "agent.runtime"

type RuntimeGateway struct {
	repository          *Repository
	tokenEnvironmentKey string
	clock               func() time.Time
	lastPoll            atomic.Int64
	verification        *backendverification.Service
	attemptGrants       *backendverification.PostgreSQLAttemptGrantAuthority
}

func NewRuntimeGateway(repository *Repository, tokenEnvironmentKey string) *RuntimeGateway {
	return &RuntimeGateway{repository: repository, tokenEnvironmentKey: tokenEnvironmentKey, clock: time.Now}
}

func (gateway *RuntimeGateway) Ready() bool {
	return gateway != nil && gateway.tokenEnvironmentKey != "" && gateway.lastPoll.Load() > gateway.clock().Add(-2*time.Minute).UnixMilli()
}

// A worker token grants service transport only. Every write still passes the
// current fact codec, durable lease, generation and repository CAS checks.
func (gateway *RuntimeGateway) authorize(c *gin.Context) {
	if gateway == nil || gateway.tokenEnvironmentKey == "" {
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	expected := os.Getenv(gateway.tokenEnvironmentKey)
	provided := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	expectedDigest, providedDigest := sha256.Sum256([]byte(expected)), sha256.Sum256([]byte(provided))
	if len(expected) < 32 || len(expected) > 4096 || strings.ContainsAny(expected, "\r\n") ||
		!strings.HasPrefix(c.GetHeader("Authorization"), "Bearer ") || subtle.ConstantTimeCompare(expectedDigest[:], providedDigest[:]) != 1 {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Next()
}

type runtimeAuthorityRequest struct {
	LeaseID    string    `json:"leaseId"`
	HolderID   string    `json:"holderId"`
	Generation int64     `json:"generation"`
	ObservedAt time.Time `json:"observedAt"`
}

func (gateway *RuntimeGateway) authority(input runtimeAuthorityRequest) (RunLeaseAuthority, error) {
	now := gateway.clock().UTC()
	if input.LeaseID == "" || len(input.LeaseID) > 256 || input.HolderID == "" || len(input.HolderID) > 256 || input.Generation < 0 ||
		input.ObservedAt.IsZero() || input.ObservedAt.Before(now.Add(-5*time.Second)) || input.ObservedAt.After(now.Add(5*time.Second)) {
		return RunLeaseAuthority{}, ErrUnauthorized
	}
	return RunLeaseAuthority{LeaseID: input.LeaseID, HolderID: input.HolderID, Generation: input.Generation, ObservedAt: now}, nil
}

func (gateway *RuntimeGateway) expiry(expiresAt time.Time) bool {
	now := gateway.clock().UTC()
	return expiresAt.After(now) && !expiresAt.After(now.Add(10*time.Minute))
}

func readRuntimeRequest(c *gin.Context, target any) bool {
	source, ok := readAgentFact(c)
	if !ok {
		return false
	}
	if err := canonicaljson.ValidateRaw(source, maximumAgentProductRequestBytes); err != nil {
		respondAgentError(c, ErrInvalid)
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		respondAgentError(c, ErrInvalid)
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		respondAgentError(c, ErrInvalid)
		return false
	}
	return true
}

func (gateway *RuntimeGateway) RegisterRoutes(api *gin.RouterGroup) {
	base := api.Group("/internal/agent/runtime", gateway.authorize)
	base.GET("/tasks", gateway.list)
	base.GET("/admission-challenges", gateway.admissionChallenges)
	base.POST("/admission-challenges/:admissionId/result", gateway.admissionResult)
	base.GET("/workspaces/:workspaceId/tasks/:taskId/context", gateway.context)
	base.POST("/workspaces/:workspaceId/runs", gateway.create)
	base.POST("/workspaces/:workspaceId/runs/:runId/lease", gateway.claim)
	base.PUT("/workspaces/:workspaceId/runs/:runId/lease", gateway.renew)
	base.POST("/workspaces/:workspaceId/runs/:runId/transitions", gateway.transition)
	base.POST("/workspaces/:workspaceId/runs/:runId/start", gateway.start)
	base.POST("/workspaces/:workspaceId/runs/:runId/cancellations", gateway.cancelRun)
	base.POST("/workspaces/:workspaceId/runs/:runId/dispatch-claims", gateway.claimDispatch)
	base.POST("/workspaces/:workspaceId/runs/:runId/dispatches", gateway.dispatch)
	base.POST("/workspaces/:workspaceId/runs/:runId/proposals", gateway.proposal)
	base.POST("/workspaces/:workspaceId/runs/:runId/preview", gateway.preview)
	base.POST("/workspaces/:workspaceId/runs/:runId/workspace-commits", gateway.commitWorkspace)
	base.POST("/workspaces/:workspaceId/runs/:runId/workspace-mutations", gateway.mutation)
	base.POST("/workspaces/:workspaceId/runs/:runId/verification-runs", gateway.createVerificationRun)
	base.GET("/workspaces/:workspaceId/runs/:runId/verification-runs/:verificationRunId", gateway.getVerificationRun)
	base.GET("/workspaces/:workspaceId/runs/:runId/verification-runs/:verificationRunId/evidence/:evidenceId", gateway.verificationEvidence)
	base.POST("/workspaces/:workspaceId/runs/:runId/verification-runs/:verificationRunId/events", gateway.appendVerificationEvent)
	base.GET("/workspaces/:workspaceId/runs/:runId/verified-evidence-view", gateway.verificationView)
	base.POST("/workspaces/:workspaceId/runs/:runId/verification-bindings", gateway.verificationBinding)
	base.POST("/workspaces/:workspaceId/runs/:runId/verification-closures", gateway.verificationClosure)
	base.GET("/workspaces/:workspaceId/runs/:runId/product", gateway.product)
	base.POST("/workspaces/:workspaceId/runs/:runId/task-outputs", gateway.taskOutput)
	gateway.RegisterDriverRoutes(base)
}

func (gateway *RuntimeGateway) list(c *gin.Context) {
	limit := 20
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			respondAgentError(c, ErrInvalid)
			return
		}
		limit = parsed
	}
	items, err := gateway.repository.ListRuntimeWork(c.Request.Context(), limit, gateway.clock().UTC())
	if err != nil {
		respondAgentError(c, err)
		return
	}
	gateway.lastPoll.Store(gateway.clock().UnixMilli())
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (gateway *RuntimeGateway) context(c *gin.Context) {
	task, workspace, err := gateway.repository.RuntimeContext(c.Request.Context(), c.Param("workspaceId"), c.Param("taskId"))
	if err != nil {
		respondAgentError(c, err)
		return
	}
	admission, err := gateway.repository.RuntimeTaskAdmission(c.Request.Context(), task.WorkspaceID, task.TaskID)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	repair, err := gateway.repository.RuntimeRepairFailureForTask(c.Request.Context(), task.WorkspaceID, task.TaskID)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	value := gin.H{"task": json.RawMessage(task.FactBytes), "workspace": workspace, "admission": admission}
	if repair != nil {
		value["repair"] = repair
	}
	c.JSON(http.StatusOK, value)
}

func (gateway *RuntimeGateway) start(c *gin.Context) {
	var input struct {
		ExpectedCursor         int64           `json:"expectedCursor"`
		ExpectedSnapshotDigest string          `json:"expectedSnapshotDigest"`
		Snapshot               json.RawMessage `json:"snapshot"`
		Event                  json.RawMessage `json:"event"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	next, err := decodeRunFact(input.Snapshot)
	if err != nil || next.RunID != c.Param("runId") || !runtimeEventProducer(input.Event) {
		respondAgentError(c, ErrInvalid)
		return
	}
	run, replayed, err := gateway.repository.BootstrapRuntimeRun(c.Request.Context(), c.Param("workspaceId"), input.ExpectedCursor, input.ExpectedSnapshotDigest, input.Snapshot, input.Event)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"snapshot": json.RawMessage(run.FactBytes), "replayed": replayed})
}

func (gateway *RuntimeGateway) cancelRun(c *gin.Context) {
	var input struct {
		CommandID              string          `json:"commandId"`
		ExpectedCursor         int64           `json:"expectedCursor"`
		ExpectedSnapshotDigest string          `json:"expectedSnapshotDigest"`
		Snapshot               json.RawMessage `json:"snapshot"`
		Event                  json.RawMessage `json:"event"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	next, err := decodeRunFact(input.Snapshot)
	if err != nil || next.RunID != c.Param("runId") || !runtimeEventProducer(input.Event) {
		respondAgentError(c, ErrInvalid)
		return
	}
	run, replayed, err := gateway.repository.CancelRuntimeRun(c.Request.Context(), c.Param("workspaceId"), c.Param("runId"), input.CommandID, input.ExpectedCursor, input.ExpectedSnapshotDigest, input.Snapshot, input.Event)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"snapshot": json.RawMessage(run.FactBytes), "replayed": replayed})
}

type runtimeInitialRequest struct {
	Snapshot json.RawMessage `json:"snapshot"`
	Event    json.RawMessage `json:"event"`
}

func runtimeEventProducer(source []byte) bool {
	event, err := decodeEventFact(source)
	if err != nil {
		return false
	}
	producer, ok := objectMember(event.Value, "producer")
	return ok && stringMember(producer, "kind") == "service" && stringMember(producer, "principalId") == RuntimePrincipalID
}

func (gateway *RuntimeGateway) create(c *gin.Context) {
	var input runtimeInitialRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	if !runtimeEventProducer(input.Event) {
		respondAgentError(c, ErrUnauthorized)
		return
	}
	initial, err := decodeRunFact(input.Snapshot)
	if err != nil {
		respondAgentError(c, ErrInvalid)
		return
	}
	task, err := gateway.repository.GetTask(c.Request.Context(), c.Param("workspaceId"), initial.TaskID)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	if initial.RunID != "run.runtime."+strings.TrimPrefix(task.TaskDigest, "sha256-") {
		respondAgentError(c, ErrConflict)
		return
	}
	run, replayed, err := gateway.repository.CreateRun(c.Request.Context(), c.Param("workspaceId"), input.Snapshot, input.Event)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"snapshot": json.RawMessage(run.FactBytes), "replayed": replayed})
}

type runtimeLeaseRequest struct {
	runtimeAuthorityRequest
	ExpiresAt time.Time `json:"expiresAt"`
}

func runtimeLeaseResponse(lease RunLease) gin.H {
	return gin.H{"workspaceId": lease.WorkspaceID, "runId": lease.RunID, "leaseId": lease.LeaseID, "holderId": lease.HolderID, "generation": lease.Generation, "acquiredAt": lease.AcquiredAt.UTC().Format("2006-01-02T15:04:05.000Z"), "expiresAt": lease.ExpiresAt.UTC().Format("2006-01-02T15:04:05.000Z")}
}

func (gateway *RuntimeGateway) claim(c *gin.Context) {
	var input runtimeLeaseRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	authority, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil || !gateway.expiry(input.ExpiresAt) {
		respondAgentError(c, ErrUnauthorized)
		return
	}
	lease, replayed, err := gateway.repository.RuntimeClaimRun(c.Request.Context(), c.Param("workspaceId"), c.Param("runId"), authority.LeaseID, authority.HolderID, authority.Generation, input.ExpiresAt, gateway.clock)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"lease": runtimeLeaseResponse(lease), "replayed": replayed})
}

func (gateway *RuntimeGateway) renew(c *gin.Context) {
	var input runtimeLeaseRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	authority, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil || !gateway.expiry(input.ExpiresAt) {
		respondAgentError(c, ErrUnauthorized)
		return
	}
	lease, err := gateway.repository.RuntimeRenewRunLease(c.Request.Context(), authority, c.Param("workspaceId"), c.Param("runId"), input.ExpiresAt, gateway.clock)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	gateway.lastPoll.Store(gateway.clock().UnixMilli())
	c.JSON(http.StatusOK, gin.H{"lease": runtimeLeaseResponse(lease)})
}

type runtimeTransitionRequest struct {
	runtimeAuthorityRequest
	ExpectedCursor         int64           `json:"expectedCursor"`
	ExpectedSnapshotDigest string          `json:"expectedSnapshotDigest"`
	Snapshot               json.RawMessage `json:"snapshot"`
	Event                  json.RawMessage `json:"event"`
}

func (gateway *RuntimeGateway) transition(c *gin.Context) {
	var input runtimeTransitionRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	authority, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil || !runtimeEventProducer(input.Event) {
		respondAgentError(c, ErrUnauthorized)
		return
	}
	current, err := gateway.repository.GetRun(c.Request.Context(), c.Param("workspaceId"), c.Param("runId"))
	if err != nil {
		respondAgentError(c, err)
		return
	}
	next, err := decodeRunFact(input.Snapshot)
	if err != nil || next.RunID != current.RunID {
		respondAgentError(c, ErrInvalid)
		return
	}
	// An exact replay can be acknowledged after the original CAS advanced.
	if (current.Cursor != input.ExpectedCursor || current.SnapshotDigest != input.ExpectedSnapshotDigest) && current.SnapshotDigest != next.SnapshotDigest {
		respondAgentError(c, ErrConflict)
		return
	}
	run, replayed, err := gateway.repository.AppendRuntimeTransition(c.Request.Context(), c.Param("workspaceId"), RuntimeLeaseGuard{Authority: authority, Clock: gateway.clock}, input.Snapshot, input.Event)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"snapshot": json.RawMessage(run.FactBytes), "replayed": replayed})
}

type runtimeDispatchRequest struct {
	runtimeAuthorityRequest
	OperationID string    `json:"operationId"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

func (gateway *RuntimeGateway) claimDispatch(c *gin.Context) {
	var input runtimeDispatchRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	authority, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil || !gateway.expiry(input.ExpiresAt) {
		respondAgentError(c, ErrUnauthorized)
		return
	}
	claim, err := gateway.repository.ClaimRuntimeOperationDispatch(c.Request.Context(), c.Param("workspaceId"), c.Param("runId"), input.OperationID, authority.LeaseID, authority.HolderID, RuntimeLeaseGuard{Authority: authority, Clock: gateway.clock}, input.ExpiresAt)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"claim": gin.H{"workspaceId": claim.WorkspaceID, "runId": claim.RunID, "operationId": claim.OperationID, "leaseId": claim.LeaseID, "holderId": claim.HolderID, "generation": claim.Generation, "expiresAt": claim.ExpiresAt, "dispatchState": claim.DispatchState, "reconciliationRequired": claim.ReconciliationRequired, "replayed": claim.Replayed}})
}

func (gateway *RuntimeGateway) dispatch(c *gin.Context) {
	var input runtimeDispatchRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	authority, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	claim := OperationDispatchClaim{WorkspaceID: c.Param("workspaceId"), RunID: c.Param("runId"), OperationID: input.OperationID, LeaseID: authority.LeaseID, HolderID: authority.HolderID, Generation: authority.Generation}
	replayed, err := gateway.repository.MarkRuntimeOperationDispatched(c.Request.Context(), claim, RuntimeLeaseGuard{Authority: authority, Clock: gateway.clock})
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"replayed": replayed})
}

type runtimeProposalRequest struct {
	runtimeAuthorityRequest
	Proposal json.RawMessage `json:"proposal"`
}

func (gateway *RuntimeGateway) serviceAuthority(c *gin.Context) (PrincipalAuthority, error) {
	run, err := gateway.repository.GetRun(c.Request.Context(), c.Param("workspaceId"), c.Param("runId"))
	if err != nil {
		return PrincipalAuthority{}, err
	}
	task, err := gateway.repository.GetTask(c.Request.Context(), run.WorkspaceID, run.TaskID)
	if err != nil {
		return PrincipalAuthority{}, err
	}
	return PrincipalAuthority{Kind: "service", PrincipalID: RuntimePrincipalID, ProjectID: task.ProjectID, WorkspaceID: task.WorkspaceID}, nil
}

func (gateway *RuntimeGateway) proposal(c *gin.Context) {
	var input runtimeProposalRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	fact, err := decodeProposal(input.Proposal)
	if err != nil || fact.RunID != c.Param("runId") {
		respondAgentError(c, ErrInvalid)
		return
	}
	principal, err := gateway.serviceAuthority(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	record, replayed, err := gateway.repository.StoreRuntimeProposal(c.Request.Context(), principal, lease, gateway.clock, input.Proposal)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"proposal": json.RawMessage(record.FactBytes), "replayed": replayed})
}

type runtimePreviewRequest struct {
	runtimeAuthorityRequest
	Planning json.RawMessage `json:"planning"`
	Preview  json.RawMessage `json:"preview"`
}

func (gateway *RuntimeGateway) preview(c *gin.Context) {
	var input runtimePreviewRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	principal, err := gateway.serviceAuthority(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	record, replayed, err := gateway.repository.StoreRuntimePreview(c.Request.Context(), principal, lease, gateway.clock, c.Param("runId"), input.Planning, input.Preview)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"planning": json.RawMessage(record.PlanningFactBytes), "preview": json.RawMessage(record.PreviewFactBytes), "replayed": replayed})
}

func (gateway *RuntimeGateway) product(c *gin.Context) {
	principal, err := gateway.serviceAuthority(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	ledger, err := gateway.repository.GetProductLedgerBundle(c.Request.Context(), principal, c.Param("runId"))
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ledger": ledger})
}
