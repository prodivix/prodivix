package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/gin-gonic/gin"
)

// Verification consumes an acknowledged human-approved mutation and delegates
// all Run/Evidence semantics to the existing G3 service.
func (gateway *RuntimeGateway) approvedOwner(c *gin.Context) (PrincipalAuthority, string, error) {
	principal, err := gateway.serviceAuthority(c)
	if err != nil {
		return PrincipalAuthority{}, "", err
	}
	ledger, err := gateway.repository.GetProductLedgerBundle(c.Request.Context(), principal, c.Param("runId"))
	if err != nil {
		return PrincipalAuthority{}, "", err
	}
	run, err := decodeRunFact(ledger.Run)
	if err != nil || (run.Phase != "verifying" && run.Phase != "repairing") {
		return PrincipalAuthority{}, "", ErrUnauthorized
	}
	approval, err := decodeApproval(ledger.Approval)
	if err != nil || approval.Decision != "approved" {
		return PrincipalAuthority{}, "", ErrUnauthorized
	}
	acknowledged := false
	for _, source := range ledger.Mutations {
		mutation, err := decodeMutationReceipt(source)
		if err != nil {
			return PrincipalAuthority{}, "", err
		}
		if mutation.RunID == run.RunID && mutation.DecisionID == approval.DecisionID && mutation.State == "acknowledged" && mutation.Kind == "commit" {
			acknowledged = true
		}
	}
	if !acknowledged {
		return PrincipalAuthority{}, "", ErrUnauthorized
	}
	return principal, approval.ActorID, nil
}

type runtimeVerificationCreateRequest struct {
	runtimeAuthorityRequest
	Request json.RawMessage `json:"request"`
	Plan    json.RawMessage `json:"plan,omitempty"`
}

func (gateway *RuntimeGateway) createVerificationRun(c *gin.Context) {
	var input runtimeVerificationCreateRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	principal, ownerID, err := gateway.approvedOwner(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	if gateway.verification == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	snapshot, _, err := backendverification.DecodeVerificationRunSnapshotWire(input.Request)
	if err != nil {
		respondAgentError(c, ErrInvalid)
		return
	}
	authorization := RuntimeVerificationAuthorization{AgentRunID: c.Param("runId"), Lease: lease, Clock: gateway.clock, VerificationRunID: snapshot.RunID, WorkspaceRevision: snapshot.WorkspaceRevision, PlanDigest: snapshot.PlanDigest, Surface: snapshot.Surface, Kind: "create", PlanWire: input.Plan}
	run, replayed, err := gateway.verification.CreateVerificationRunWithAuthorization(c.Request.Context(), ownerID, principal.WorkspaceID, input.Request, func(ctx context.Context, tx *sql.Tx) error {
		return gateway.repository.AuthorizeRuntimeVerification(ctx, tx, principal.WorkspaceID, authorization)
	})
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"run": run, "replayed": replayed})
}

func (gateway *RuntimeGateway) getVerificationRun(c *gin.Context) {
	principal, ownerID, err := gateway.approvedOwner(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	if gateway.verification == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	if err := gateway.repository.authorizeRuntimeVerificationRead(c.Request.Context(), principal.WorkspaceID, c.Param("runId"), c.Param("verificationRunId")); err != nil {
		respondAgentError(c, err)
		return
	}
	after := int64(0)
	if raw := c.Query("afterCursor"); raw != "" {
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || value < 0 {
			respondAgentError(c, ErrInvalid)
			return
		}
		after = value
	}
	run, err := gateway.verification.GetVerificationRun(c.Request.Context(), ownerID, principal.WorkspaceID, c.Param("verificationRunId"), after)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"run": run})
}

func (repository *Repository) authorizeRuntimeVerificationRead(ctx context.Context, workspaceID, agentRunID, verificationRunID string) error {
	var exists bool
	err := repository.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_runtime_verification_runs l JOIN agent_runs r ON r.workspace_id=l.workspace_id AND r.run_id=l.agent_run_id WHERE l.workspace_id=$1 AND l.agent_run_id=$2 AND l.verification_run_id=$3 AND l.agent_generation=r.generation)`, workspaceID, agentRunID, verificationRunID).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return ErrUnauthorized
	}
	return nil
}

func (gateway *RuntimeGateway) verificationEvidence(c *gin.Context) {
	principal, ownerID, err := gateway.approvedOwner(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	if gateway.verification == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	if err := gateway.repository.authorizeRuntimeVerificationRead(c.Request.Context(), principal.WorkspaceID, c.Param("runId"), c.Param("verificationRunId")); err != nil {
		respondAgentError(c, err)
		return
	}
	run, err := gateway.verification.GetVerificationRun(c.Request.Context(), ownerID, principal.WorkspaceID, c.Param("verificationRunId"), 0)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	selected := false
	for _, cell := range run.Snapshot.Cells {
		if cell.EvidenceID != "" && cell.EvidenceID == c.Param("evidenceId") {
			selected = true
		}
	}
	if !selected {
		respondAgentError(c, ErrUnauthorized)
		return
	}
	manifest, err := gateway.verification.GetEvidenceManifest(c.Request.Context(), ownerID, principal.WorkspaceID, c.Param("evidenceId"))
	if err != nil {
		respondAgentError(c, err)
		return
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	var wire map[string]json.RawMessage
	if err := json.Unmarshal(raw, &wire); err != nil {
		respondAgentError(c, err)
		return
	}
	wire["wireVersion"] = json.RawMessage("1")
	c.JSON(http.StatusOK, gin.H{"manifest": wire})
}

type runtimeVerificationEventRequest struct {
	runtimeAuthorityRequest
	Event json.RawMessage `json:"event"`
}

func (gateway *RuntimeGateway) appendVerificationEvent(c *gin.Context) {
	var input runtimeVerificationEventRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	principal, ownerID, err := gateway.approvedOwner(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	if gateway.verification == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	authorization := RuntimeVerificationAuthorization{AgentRunID: c.Param("runId"), Lease: lease, Clock: gateway.clock, VerificationRunID: c.Param("verificationRunId"), Kind: "append"}
	run, replayed, err := gateway.verification.AppendVerificationRunEventWithAuthorization(c.Request.Context(), ownerID, principal.WorkspaceID, c.Param("verificationRunId"), input.Event, func(ctx context.Context, tx *sql.Tx) error {
		return gateway.repository.AuthorizeRuntimeVerification(ctx, tx, principal.WorkspaceID, authorization)
	})
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"run": run, "replayed": replayed})
}

func (gateway *RuntimeGateway) verificationView(c *gin.Context) {
	principal, ownerID, err := gateway.approvedOwner(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	if gateway.verification == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	revision, err := strconv.ParseInt(c.Query("workspaceRevision"), 10, 64)
	digest := c.Query("planDigest")
	if err != nil || revision < 0 || !canonicalDigestPattern.MatchString(digest) {
		respondAgentError(c, ErrInvalid)
		return
	}
	view, err := gateway.verification.ClosureView(c.Request.Context(), ownerID, principal.WorkspaceID, backendverification.ListFilter{WorkspaceRevision: revision, WorkspaceRevisionSet: true, PlanDigest: digest})
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"verifiedEvidenceView": view})
}

type runtimeVerificationBindingRequest struct {
	runtimeAuthorityRequest
	Binding json.RawMessage `json:"binding"`
}

func (gateway *RuntimeGateway) verificationBinding(c *gin.Context) {
	var input runtimeVerificationBindingRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	principal, _, err := gateway.approvedOwner(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	fact, err := decodeVerificationPlanBinding(input.Binding)
	if err != nil || fact.RunID != c.Param("runId") {
		respondAgentError(c, ErrInvalid)
		return
	}
	record, replayed, err := gateway.repository.StoreRuntimeVerificationPlanBinding(c.Request.Context(), principal, RuntimeLeaseGuard{Authority: lease, Clock: gateway.clock}, input.Binding)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"binding": json.RawMessage(record.FactBytes), "replayed": replayed})
}

func (gateway *RuntimeGateway) verificationClosure(c *gin.Context) {
	var input runtimeMutationRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	principal, _, err := gateway.approvedOwner(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	fact, err := decodeVerificationClosureReceipt(input.Receipt)
	if err != nil || fact.RunID != c.Param("runId") {
		respondAgentError(c, ErrInvalid)
		return
	}
	record, replayed, err := gateway.repository.StoreRuntimeVerificationClosureReceipt(c.Request.Context(), principal, RuntimeLeaseGuard{Authority: lease, Clock: gateway.clock}, input.Receipt)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"receipt": json.RawMessage(record.FactBytes), "replayed": replayed})
}
