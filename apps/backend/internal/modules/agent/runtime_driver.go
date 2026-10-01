package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"strings"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

const runtimeG3ProducerID = "prodivix.agent-runtime-g3"

func (handler *Handler) SetRuntimeDriverAttemptGrants(authority *g3.PostgreSQLAttemptGrantAuthority) {
	if handler.runtime != nil {
		handler.runtime.attemptGrants = authority
	}
}
func (gateway *RuntimeGateway) RegisterDriverRoutes(base *gin.RouterGroup) {
	base.POST("/workspaces/:workspaceId/runs/:runId/g3-failure-material", gateway.publishRepairFailure)
	driver := base.Group("/workspaces/:workspaceId/runs/:runId/g3-driver")
	driver.POST("/context", gateway.driverContext)
	driver.POST("/assets/:assetDocumentId", gateway.driverBaselineAsset)
	driver.POST("/attempts", gateway.driverAttempt)
	driver.POST("/promotions", gateway.driverPromotion)
	driver.PUT("/promotions/:promotionId/artifacts/:artifactId", gateway.driverArtifact)
	driver.POST("/promotions/:promotionId/finalize", gateway.driverFinalize)
	driver.POST("/events", gateway.driverEvent)
	driver.POST("/cancel/events", gateway.driverCancelEvent)
	driver.POST("/cleanup", gateway.driverCleanup)
}

func (gateway *RuntimeGateway) driverCoordinates(c *gin.Context, input RuntimeDriverCoordinates, cleanup bool) (RunLeaseAuthority, error) {
	if gateway.verification == nil || input.AgentRunID != c.Param("runId") || input.TaskID == "" || input.VerificationRunID == "" || !canonicalDigestPattern.MatchString(input.PlanDigest) || !canonicalDigestPattern.MatchString(input.RequestDigest) {
		return RunLeaseAuthority{}, ErrUnauthorized
	}
	if input.CancellationCommandID != "" {
		if !cleanup {
			return RunLeaseAuthority{}, ErrUnauthorized
		}
		return RunLeaseAuthority{}, nil
	}
	return gateway.authority(input.Authority)
}

func (gateway *RuntimeGateway) driverContext(c *gin.Context) {
	var input struct {
		RuntimeDriverCoordinates
		Plan json.RawMessage `json:"plan,omitempty"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.driverCoordinates(c, input.RuntimeDriverCoordinates, input.CancellationCommandID != "")
	if err != nil {
		respondDriverError(c, err)
		return
	}
	result, err := gateway.repository.RuntimeDriverContext(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, input.Plan)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (gateway *RuntimeGateway) driverAttempt(c *gin.Context) {
	var input struct {
		RuntimeDriverCoordinates
		CellID       string         `json:"cellId"`
		AttemptID    string         `json:"attemptId"`
		Run          g3.RunIdentity `json:"run"`
		ProducerID   string         `json:"producerId"`
		TrustCeiling g3.TrustClass  `json:"trustCeiling"`
		ExpiresAt    time.Time      `json:"expiresAt"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.driverCoordinates(c, input.RuntimeDriverCoordinates, false)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	if gateway.attemptGrants == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	owner, err := gateway.repository.RuntimeDriverContext(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, nil)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	if input.ProducerID != runtimeG3ProducerID || input.Run.RunID != owner.Run.RunID || input.Run.ProviderID != owner.Run.ProviderID || !gateway.expiry(input.ExpiresAt) {
		respondDriverError(c, ErrUnauthorized)
		return
	}
	selected := false
	for _, cell := range owner.Run.Cells {
		if cell.CellID == input.CellID && cell.AttemptID == input.AttemptID && (cell.Status == "queued" || cell.Status == "running") {
			selected = true
		}
	}
	if !selected {
		respondDriverError(c, ErrUnauthorized)
		return
	}
	input.ExpiresAt, err = gateway.repository.runtimeDriverAttemptExpiry(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, input.ExpiresAt)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	grant, err := gateway.attemptGrants.IssueTrustedAttemptGrantWithAuthorization(c.Request.Context(), g3.TrustedAttemptGrantIssue{WorkspaceID: c.Param("workspaceId"), ProjectID: owner.ProjectID, Plan: owner.Plan, CellID: input.CellID, AttemptID: input.AttemptID, Run: input.Run, ProducerID: runtimeG3ProducerID, TrustCeiling: input.TrustCeiling, IssuedBy: RuntimePrincipalID, ExpiresAt: input.ExpiresAt}, gateway.repository.runtimeDriverAttemptBudgetAuthorization(c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, input.ExpiresAt))
	if err != nil {
		respondDriverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"grant": gin.H{"id": grant.ID, "grantDigest": grant.GrantDigest, "planDigest": grant.PlanDigest, "cellId": grant.CellID, "attemptId": grant.AttemptID, "issuedAt": canonicalTime(grant.IssuedAt).Format("2006-01-02T15:04:05.000Z"), "expiresAt": canonicalTime(grant.ExpiresAt).Format("2006-01-02T15:04:05.000Z")}, "promotionBase": "/api/internal/agent/runtime/workspaces/" + c.Param("workspaceId") + "/runs/" + c.Param("runId") + "/g3-driver/promotions"})
}

func (gateway *RuntimeGateway) driverPromotion(c *gin.Context) {
	var input struct {
		RuntimeDriverCoordinates
		Candidate g3.EvidenceCandidateWire `json:"candidate"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.driverCoordinates(c, input.RuntimeDriverCoordinates, false)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	owner, err := gateway.repository.RuntimeDriverContext(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, nil)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	if input.Candidate.WireVersion != 1 || input.Candidate.WorkspaceID != owner.Run.WorkspaceID || input.Candidate.PlanDigest != owner.Run.PlanDigest || input.Candidate.Run.RunID != owner.Run.RunID || input.Candidate.Run.ProviderID != owner.Run.ProviderID || input.Candidate.Provenance.ProducerID != runtimeG3ProducerID {
		respondDriverError(c, ErrUnauthorized)
		return
	}
	result, err := gateway.verification.CreatePromotionWithAuthorization(c.Request.Context(), owner.OwnerID, c.Param("workspaceId"), c.GetHeader("Idempotency-Key"), input.Candidate.EvidenceCandidate, gateway.repository.runtimeDriverPromotionBudgetAuthorization(c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, input.Candidate.EvidenceCandidate))
	if err != nil {
		respondDriverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"promotion": result})
}

func (gateway *RuntimeGateway) driverPromotionAuthorization(c *gin.Context, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority) g3.WriteAuthorization {
	workspaceID, promotionID := c.Param("workspaceId"), c.Param("promotionId")
	authorize := gateway.repository.runtimeDriverAuthorization(workspaceID, coordinates, lease, gateway.clock, false)
	return func(ctx context.Context, tx *sql.Tx) error {
		if err := authorize(ctx, tx); err != nil {
			return err
		}
		var matches bool
		err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM verification_promotions p JOIN agent_runtime_g3_driver_jobs j ON j.workspace_id=p.workspace_id AND j.verification_run_id=p.candidate_json->'run'->>'runId' WHERE p.workspace_id=$1 AND p.id=$2 AND j.verification_run_id=$3 AND j.request_digest=$4 AND p.candidate_json->>'planDigest'=j.plan_digest AND p.candidate_json->'run'->>'providerId'=j.provider_id AND p.candidate_json->'provenance'->>'producerId'=$5)`, workspaceID, promotionID, coordinates.VerificationRunID, coordinates.RequestDigest, runtimeG3ProducerID).Scan(&matches)
		if err != nil {
			return err
		}
		if !matches {
			return ErrUnauthorized
		}
		return nil
	}
}

func (gateway *RuntimeGateway) driverArtifact(c *gin.Context) {
	var coordinates RuntimeDriverCoordinates
	raw := c.GetHeader("X-Prodivix-Agent-G3-Coordinates")
	if len(raw) > 8192 || canonicaljson.ValidateRaw([]byte(raw), 8192) != nil {
		respondDriverError(c, ErrInvalid)
		return
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&coordinates) != nil {
		respondDriverError(c, ErrInvalid)
		return
	}
	lease, err := gateway.driverCoordinates(c, coordinates, false)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	owner, err := gateway.repository.RuntimeDriverContext(c.Request.Context(), c.Param("workspaceId"), coordinates, lease, gateway.clock, nil)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	mediaType, parameters, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || mediaType == "" || len(parameters) != 0 {
		respondDriverError(c, ErrInvalid)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64*1024*1024+1)
	artifact, err := gateway.verification.UploadArtifactWithAuthorization(c.Request.Context(), owner.OwnerID, c.Param("workspaceId"), c.Param("promotionId"), c.Param("artifactId"), c.GetHeader("X-Prodivix-Verification-Capability"), mediaType, c.Request.Body, gateway.driverPromotionAuthorization(c, coordinates, lease))
	if err != nil {
		respondDriverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"artifact": artifact})
}

func (gateway *RuntimeGateway) driverFinalize(c *gin.Context) {
	var input struct {
		RuntimeDriverCoordinates
		Attestation *g3.AttestationPresentation `json:"attestation,omitempty"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.driverCoordinates(c, input.RuntimeDriverCoordinates, false)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	owner, err := gateway.repository.RuntimeDriverContext(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, nil)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	record, err := gateway.verification.FinalizePromotionWithAuthorization(c.Request.Context(), owner.OwnerID, c.Param("workspaceId"), c.Param("promotionId"), c.GetHeader("X-Prodivix-Verification-Capability"), input.Attestation, gateway.driverPromotionAuthorization(c, input.RuntimeDriverCoordinates, lease))
	if err != nil {
		var challenge *g3.AttestationChallengeError
		if errors.As(err, &challenge) {
			c.JSON(http.StatusAccepted, gin.H{"promotion": challenge.Promotion})
			return
		}
		respondDriverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"record": record})
}

func (gateway *RuntimeGateway) driverEvent(c *gin.Context)       { gateway.appendDriverEvent(c, false) }
func (gateway *RuntimeGateway) driverCancelEvent(c *gin.Context) { gateway.appendDriverEvent(c, true) }
func (gateway *RuntimeGateway) appendDriverEvent(c *gin.Context, cleanup bool) {
	var input struct {
		RuntimeDriverCoordinates
		Event json.RawMessage `json:"event"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.driverCoordinates(c, input.RuntimeDriverCoordinates, cleanup)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	event, _, err := g3.DecodeVerificationRunEventWire(input.Event)
	if err != nil || event.RunID != input.VerificationRunID {
		respondDriverError(c, ErrInvalid)
		return
	}
	if cleanup {
		if err := validateRuntimeDriverCancellationEvent(input.RuntimeDriverCoordinates, event.VerificationRunEvent); err != nil {
			respondDriverError(c, err)
			return
		}
	}
	var owner string
	err = gateway.repository.withRuntimeDriverOwner(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, cleanup, func(value string) { owner = value })
	if err != nil {
		respondDriverError(c, err)
		return
	}
	run, replayed, err := gateway.verification.AppendVerificationRunEventWithAuthorization(c.Request.Context(), owner, c.Param("workspaceId"), input.VerificationRunID, input.Event, gateway.repository.runtimeDriverAuthorization(c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, cleanup))
	if err != nil {
		respondDriverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"run": run, "replayed": replayed})
}

func validateRuntimeDriverCancellationEvent(coordinates RuntimeDriverCoordinates, event g3.VerificationRunEvent) error {
	if event.RunID != coordinates.VerificationRunID {
		return ErrUnauthorized
	}
	if event.Kind == "run-cancel-requested" || event.Kind == "run-completed" {
		return nil
	}
	if event.Kind != "cell-reported" || event.Outcome != "cancelled" || event.EvidenceID != "" {
		return ErrUnauthorized
	}
	digest, err := canonicaljson.Digest(map[string]any{"contract": "prodivix.agent-runtime-g3-cancelled-attempt", "verificationRunId": coordinates.VerificationRunID, "cellId": event.CellID, "attemptId": event.AttemptID, "cancellationCommandId": coordinates.CancellationCommandID, "resourcesClean": true})
	if err != nil || event.CandidateDigest != digest {
		return ErrUnauthorized
	}
	return nil
}

func (repository *Repository) withRuntimeDriverOwner(ctx context.Context, workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority, clock func() time.Time, cleanup bool, consume func(string)) error {
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	owner, err := repository.authorizeRuntimeDriverTx(ctx, tx, workspaceID, coordinates, lease, clock, cleanup)
	if err != nil {
		return err
	}
	consume(owner)
	return tx.Commit()
}

func (gateway *RuntimeGateway) driverCleanup(c *gin.Context) {
	var input struct {
		RuntimeDriverCoordinates
		Contract       string    `json:"contract"`
		ProviderID     string    `json:"providerId"`
		ResourcesClean bool      `json:"resourcesClean"`
		CompletedAt    time.Time `json:"completedAt"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.driverCoordinates(c, input.RuntimeDriverCoordinates, true)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	if input.Contract != "prodivix.agent-runtime-g3-cleanup" || !input.ResourcesClean || input.CompletedAt.IsZero() || input.CompletedAt.After(gateway.clock().Add(5*time.Second)) {
		respondDriverError(c, ErrInvalid)
		return
	}
	// Transport observation time, lease renewal and cancellation authorization
	// are not identity of the actual resource cleanup.
	// Exact immutable cleanup retries remain readable after Run termination.
	receipt, err := canonicaljson.Bytes(map[string]any{"contract": input.Contract, "workspaceId": c.Param("workspaceId"), "taskId": input.TaskID, "agentRunId": input.AgentRunID, "verificationRunId": input.VerificationRunID, "planDigest": input.PlanDigest, "requestDigest": input.RequestDigest, "providerId": input.ProviderID, "resourcesClean": true, "completedAt": canonicalTime(input.CompletedAt).Format("2006-01-02T15:04:05.000Z")})
	if err != nil {
		respondDriverError(c, ErrInvalid)
		return
	}
	var existing []byte
	existing, err = gateway.repository.runtimeDriverCleanupReplay(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease)
	if err == nil {
		if !bytes.Equal(existing, receipt) {
			respondDriverError(c, ErrConflict)
			return
		}
		c.JSON(http.StatusOK, gin.H{"cleaned": true, "verificationRunId": input.VerificationRunID, "requestDigest": input.RequestDigest})
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		respondDriverError(c, err)
		return
	}
	var owner string
	err = gateway.repository.withRuntimeDriverOwner(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, true, func(value string) { owner = value })
	if err != nil {
		respondDriverError(c, err)
		return
	}
	var provider string
	err = gateway.repository.db.QueryRowContext(c.Request.Context(), `SELECT provider_id FROM agent_runtime_g3_driver_jobs WHERE workspace_id=$1 AND verification_run_id=$2 AND request_digest=$3`, c.Param("workspaceId"), input.VerificationRunID, input.RequestDigest).Scan(&provider)
	if errors.Is(err, sql.ErrNoRows) {
		var status string
		if err := gateway.repository.db.QueryRowContext(c.Request.Context(), `SELECT provider_id,status FROM verification_runs v WHERE workspace_id=$1 AND id=$2 AND NOT EXISTS(SELECT 1 FROM agent_runtime_g3_driver_jobs j WHERE j.workspace_id=v.workspace_id AND j.verification_run_id=v.id)`, c.Param("workspaceId"), input.VerificationRunID).Scan(&provider, &status); err != nil || provider != input.ProviderID || status == "queued" || status == "running" || status == "cancelling" {
			respondDriverError(c, ErrUnauthorized)
			return
		}
		c.JSON(http.StatusOK, gin.H{"cleaned": true, "started": false, "verificationRunId": input.VerificationRunID, "requestDigest": input.RequestDigest})
		return
	}
	if err != nil || provider != input.ProviderID {
		respondDriverError(c, ErrUnauthorized)
		return
	}

	authorize := gateway.repository.runtimeDriverAuthorization(c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, true)
	if err := gateway.verification.RetireVerificationRunPromotionsWithAuthorization(c.Request.Context(), owner, c.Param("workspaceId"), input.VerificationRunID, authorize); err != nil {
		respondDriverError(c, err)
		return
	}
	err = gateway.repository.recordRuntimeDriverCleanup(c.Request.Context(), c.Param("workspaceId"), input.RuntimeDriverCoordinates, lease, gateway.clock, receipt)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"cleaned": true, "verificationRunId": input.VerificationRunID, "requestDigest": input.RequestDigest})
}

func respondDriverError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, g3.ErrUnauthorized), errors.Is(err, ErrUnauthorized):
		c.JSON(http.StatusForbidden, gin.H{"code": "AI-9001", "message": "G3 driver authority is no longer current."})
	case errors.Is(err, g3.ErrNotFound), errors.Is(err, ErrNotFound):
		c.Status(http.StatusNotFound)
	case errors.Is(err, g3.ErrInvalid), errors.Is(err, ErrInvalid):
		c.JSON(http.StatusBadRequest, gin.H{"code": "AI-1003", "message": "G3 driver request does not match its public contract."})
	case errors.Is(err, g3.ErrConflict), errors.Is(err, g3.ErrExpired), errors.Is(err, ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"code": "AI-9001", "message": "G3 driver execution coordinates changed."})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"code": "AI-9001", "message": "G3 driver owner operation failed."})
	}
}
