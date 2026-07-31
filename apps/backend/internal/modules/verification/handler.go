package verification

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	"github.com/gin-gonic/gin"
)

const verificationIntentHeader = "X-Prodivix-Verification-Intent"

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (handler *Handler) Routes(requireAuth gin.HandlerFunc) RouteHandlers {
	return RouteHandlers{
		RequireAuth: requireAuth, CreatePromotion: handler.HandleCreatePromotion,
		CreateRun: handler.HandleCreateRun, ListRuns: handler.HandleListRuns,
		GetRun: handler.HandleGetRun, AppendRunEvent: handler.HandleAppendRunEvent,
		UploadArtifact: handler.HandleUploadArtifact, FinalizePromotion: handler.HandleFinalizePromotion,
		ListEvidence: handler.HandleListEvidence, GetEvidence: handler.HandleGetEvidence,
		GetArtifact: handler.HandleGetArtifact, CompareEvidence: handler.HandleCompareEvidence,
		SupersedeEvidence: handler.HandleSupersedeEvidence, MutateRetention: handler.HandleMutateRetention,
		DeleteEvidence: handler.HandleDeleteEvidence, CreateRevocation: handler.HandleCreateRevocation,
		GetClosure: handler.HandleGetClosure,
	}
}

func (handler *Handler) HandleCreateRun(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "create-run") {
		return
	}
	payload, ok := readStrictJSONObject(c, maximumVerificationRunBytes)
	if !ok {
		return
	}
	run, replayed, err := handler.service.CreateVerificationRun(
		c.Request.Context(),
		user.ID,
		c.Param("workspaceId"),
		payload,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	markMutationReplay(c, replayed)
	status := http.StatusCreated
	if replayed {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"run": run})
}

func (handler *Handler) HandleAppendRunEvent(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "append-run-event") {
		return
	}
	payload, ok := readStrictJSONObject(c, maximumVerificationEventBytes)
	if !ok {
		return
	}
	run, replayed, err := handler.service.AppendVerificationRunEvent(
		c.Request.Context(),
		user.ID,
		c.Param("workspaceId"),
		c.Param("runId"),
		payload,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	markMutationReplay(c, replayed)
	c.JSON(http.StatusOK, gin.H{"run": run})
}

func (handler *Handler) HandleGetRun(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok {
		return
	}
	afterCursor := int64(0)
	if value := c.Query("afterCursor"); value != "" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || !validRevision(parsed) {
			respondVerificationError(c, ErrInvalid)
			return
		}
		afterCursor = parsed
	}
	record, err := handler.service.GetVerificationRun(
		c.Request.Context(),
		user.ID,
		c.Param("workspaceId"),
		c.Param("runId"),
		afterCursor,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	c.JSON(http.StatusOK, record)
}

func (handler *Handler) HandleListRuns(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok {
		return
	}
	var workspaceRevision *int64
	if value := c.Query("workspaceRevision"); value != "" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || !validRevision(parsed) {
			respondVerificationError(c, ErrInvalid)
			return
		}
		workspaceRevision = &parsed
	}
	planDigest := c.Query("planDigest")
	limit := 20
	if value := c.Query("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			respondVerificationError(c, ErrInvalid)
			return
		}
		limit = parsed
	}
	runs, err := handler.service.ListVerificationRuns(
		c.Request.Context(),
		user.ID,
		c.Param("workspaceId"),
		workspaceRevision,
		planDigest,
		limit,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"runs": runs})
}

func (handler *Handler) HandleCreatePromotion(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "create") {
		return
	}
	var wire EvidenceCandidateWire
	if !decodeStrictJSON(c, maximumCandidateBytes, &wire) {
		return
	}
	if wire.WireVersion != 1 {
		respondVerificationError(c, coded("VER-4002", "Unsupported EvidenceCandidate wire version.", ErrInvalid))
		return
	}
	result, err := handler.service.CreatePromotion(
		c.Request.Context(), user.ID, c.Param("workspaceId"),
		c.GetHeader("Idempotency-Key"), wire.EvidenceCandidate,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	status := http.StatusCreated
	if result.UploadCapability == "" {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"promotion": result})
}

func (handler *Handler) HandleUploadArtifact(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "upload") {
		return
	}
	mediaType, parameters, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || mediaType == "" || len(parameters) != 0 {
		respondVerificationError(c, coded("VER-5005", "Artifact Content-Type must be exact and parameter-free.", ErrArtifactRejected))
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maximumArtifactBytes+1)
	descriptor, err := handler.service.UploadArtifact(
		c.Request.Context(), user.ID, c.Param("workspaceId"), c.Param("promotionId"),
		c.Param("artifactId"), c.GetHeader("X-Prodivix-Verification-Capability"),
		mediaType, c.Request.Body,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"artifact": descriptor})
}

func (handler *Handler) HandleFinalizePromotion(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "finalize") {
		return
	}
	var request struct {
		Attestation *AttestationPresentation `json:"attestation,omitempty"`
	}
	if !decodeStrictJSON(c, 128*1024, &request) {
		return
	}
	record, err := handler.service.FinalizePromotion(
		c.Request.Context(), user.ID, c.Param("workspaceId"), c.Param("promotionId"),
		c.GetHeader("X-Prodivix-Verification-Capability"), request.Attestation,
	)
	if err != nil {
		var challenge *AttestationChallengeError
		if errors.As(err, &challenge) {
			c.JSON(http.StatusAccepted, gin.H{"promotion": challenge.Promotion})
			return
		}
		respondVerificationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"record": record})
}

func (handler *Handler) HandleListEvidence(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok {
		return
	}
	filter, valid := evidenceFilter(c, false)
	if !valid {
		return
	}
	page, err := handler.service.ListEvidence(c.Request.Context(), user.ID, c.Param("workspaceId"), filter)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	c.JSON(http.StatusOK, page)
}

func (handler *Handler) HandleGetEvidence(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok {
		return
	}
	record, err := handler.service.GetEvidence(
		c.Request.Context(), user.ID, c.Param("workspaceId"), c.Param("evidenceId"),
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"record": record})
}

func (handler *Handler) HandleGetArtifact(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok {
		return
	}
	content, reader, err := handler.service.ResolveArtifact(
		c.Request.Context(), user.ID, c.Param("workspaceId"),
		c.Param("evidenceId"), c.Param("artifactId"),
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	defer reader.Close()
	body, readErr := io.ReadAll(io.LimitReader(reader, content.Size+1))
	if readErr != nil || int64(len(body)) != content.Size || digestBytes(body) != content.Digest {
		respondVerificationError(c, coded("VER-5005", "Artifact object is unavailable or failed integrity verification.", ErrArtifactMissing))
		return
	}
	c.Header("Content-Type", content.MediaType)
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, c.Param("artifactId")))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "sandbox; default-src 'none'")
	c.Header("Cache-Control", "private, no-store")
	c.Header("ETag", `"`+content.Digest+`"`)
	c.Header("Content-Length", strconv.FormatInt(content.Size, 10))
	c.Data(http.StatusOK, content.MediaType, body)
}

func (handler *Handler) HandleCompareEvidence(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "compare") {
		return
	}
	var request struct {
		OtherEvidenceID string `json:"otherEvidenceId"`
	}
	if !decodeStrictJSON(c, 4096, &request) ||
		validateIdentifier(request.OtherEvidenceID, "otherEvidenceId") != nil {
		if !c.IsAborted() {
			respondVerificationError(c, ErrInvalid)
		}
		return
	}
	comparison, err := handler.service.CompareEvidence(
		c.Request.Context(), user.ID, c.Param("workspaceId"),
		c.Param("evidenceId"), request.OtherEvidenceID,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"comparison": comparison})
}

func (handler *Handler) HandleSupersedeEvidence(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "supersede") {
		return
	}
	idempotencyKey, ok := requireMutationIdempotency(c)
	if !ok {
		return
	}
	var request struct {
		NewEvidenceID             string `json:"newEvidenceId"`
		Reason                    string `json:"reason"`
		ExpectedOldEvidenceState  string `json:"expectedOldEvidenceState"`
		ExpectedNewEvidenceState  string `json:"expectedNewEvidenceState"`
		ExpectedSupersessionState string `json:"expectedSupersessionState"`
	}
	if !decodeStrictJSON(c, 4096, &request) {
		return
	}
	if request.ExpectedOldEvidenceState != "active" ||
		request.ExpectedNewEvidenceState != "active" ||
		request.ExpectedSupersessionState != "none" {
		respondVerificationError(c, ErrPreconditionRequired)
		return
	}
	replayed, err := handler.service.SupersedeEvidence(
		c.Request.Context(), user.ID, c.Param("workspaceId"), c.Param("evidenceId"),
		request.NewEvidenceID, request.Reason,
		idempotencyKey, request.ExpectedOldEvidenceState,
		request.ExpectedNewEvidenceState, request.ExpectedSupersessionState,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	markMutationReplay(c, replayed)
	c.Status(http.StatusNoContent)
}

func (handler *Handler) HandleMutateRetention(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "retention") {
		return
	}
	idempotencyKey, ok := requireMutationIdempotency(c)
	if !ok {
		return
	}
	var request struct {
		Action                  string `json:"action"`
		Kind                    string `json:"kind"`
		ExternalRef             string `json:"externalRef"`
		ProtectionID            string `json:"protectionId,omitempty"`
		ExpectedEvidenceState   string `json:"expectedEvidenceState,omitempty"`
		ExpectedProtectionState string `json:"expectedProtectionState"`
		ExpectedVersion         int64  `json:"expectedVersion,omitempty"`
	}
	if !decodeStrictJSON(c, 4096, &request) {
		return
	}
	var protection RetentionProtection
	var replayed bool
	var err error
	switch request.Action {
	case "protect":
		if request.ProtectionID != "" || request.ExpectedVersion != 0 ||
			request.ExpectedEvidenceState != "active" ||
			request.ExpectedProtectionState != "absent" {
			err = ErrPreconditionRequired
		} else {
			protection, replayed, err = handler.service.ProtectEvidence(
				c.Request.Context(), user.ID, c.Param("workspaceId"), c.Param("evidenceId"),
				request.Kind, request.ExternalRef,
				idempotencyKey, request.ExpectedEvidenceState,
				request.ExpectedProtectionState,
			)
		}
	case "release":
		if request.ExternalRef == "" || request.Kind == "" ||
			request.ExpectedEvidenceState != "" ||
			request.ExpectedProtectionState != "active" ||
			request.ExpectedVersion < 1 {
			err = ErrPreconditionRequired
		} else {
			protection, replayed, err = handler.service.ReleaseProtection(
				c.Request.Context(), user.ID, c.Param("workspaceId"), c.Param("evidenceId"),
				request.ProtectionID, request.Kind, request.ExternalRef,
				request.ExpectedVersion, idempotencyKey,
				request.ExpectedProtectionState,
			)
		}
	default:
		err = ErrInvalid
	}
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	markMutationReplay(c, replayed)
	if request.Action == "release" {
		c.Status(http.StatusNoContent)
		return
	}
	status := http.StatusCreated
	if replayed {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"protection": protection})
}

func (handler *Handler) HandleDeleteEvidence(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "delete") {
		return
	}
	idempotencyKey, ok := requireMutationIdempotency(c)
	if !ok {
		return
	}
	var request struct {
		Reason                string `json:"reason"`
		ExpectedEvidenceState string `json:"expectedEvidenceState"`
	}
	if !decodeStrictJSON(c, 4096, &request) {
		return
	}
	if request.ExpectedEvidenceState != "active" {
		respondVerificationError(c, ErrPreconditionRequired)
		return
	}
	replayed, err := handler.service.TombstoneEvidence(
		c.Request.Context(), user.ID, c.Param("workspaceId"),
		c.Param("evidenceId"), request.Reason,
		idempotencyKey, request.ExpectedEvidenceState,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	markMutationReplay(c, replayed)
	c.Status(http.StatusNoContent)
}

func (handler *Handler) HandleCreateRevocation(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok || !requireIntent(c, "revoke") {
		return
	}
	idempotencyKey, ok := requireMutationIdempotency(c)
	if !ok {
		return
	}
	var request struct {
		EvidenceID         string `json:"evidenceId,omitempty"`
		Issuer             string `json:"issuer,omitempty"`
		KeyID              string `json:"keyId,omitempty"`
		ReasonCode         string `json:"reasonCode"`
		Reason             string `json:"reason"`
		EffectiveAt        string `json:"effectiveAt"`
		ExpectedScopeState string `json:"expectedScopeState"`
	}
	if !decodeStrictJSON(c, 8192, &request) {
		return
	}
	if request.ExpectedScopeState != "unrevoked" {
		respondVerificationError(c, ErrPreconditionRequired)
		return
	}
	effectiveAt, err := parseInstant(request.EffectiveAt)
	if err != nil {
		respondVerificationError(c, ErrInvalid)
		return
	}
	id, replayed, err := handler.service.CreateRevocation(
		c.Request.Context(), user.ID, c.Param("workspaceId"), RevocationInput{
			EvidenceID: request.EvidenceID, Issuer: request.Issuer,
			KeyID: request.KeyID, ReasonCode: request.ReasonCode,
			Reason: request.Reason, EffectiveAt: effectiveAt,
		},
		idempotencyKey, request.ExpectedScopeState,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	markMutationReplay(c, replayed)
	c.JSON(http.StatusCreated, gin.H{"revocationId": id})
}

func (handler *Handler) HandleGetClosure(c *gin.Context) {
	user, ok := verificationUser(c)
	if !ok {
		return
	}
	filter, valid := evidenceFilter(c, true)
	if !valid {
		return
	}
	view, err := handler.service.ClosureView(
		c.Request.Context(), user.ID, c.Param("workspaceId"), filter,
	)
	if err != nil {
		respondVerificationError(c, err)
		return
	}
	c.JSON(http.StatusOK, verifiedEvidenceViewResponse(view))
}

func verifiedEvidenceViewResponse(view ClosureView) gin.H {
	return gin.H{"verifiedEvidenceView": view}
}

func verificationUser(c *gin.Context) (*backendauth.User, bool) {
	user, ok := backendauth.GetAuthUser[backendauth.User](c)
	if !ok || user == nil || strings.TrimSpace(user.ID) == "" {
		respondVerificationError(c, ErrUnauthorized)
		return nil, false
	}
	return user, true
}

func requireIntent(c *gin.Context, expected string) bool {
	if c.GetHeader(verificationIntentHeader) != expected {
		respondVerificationError(c, coded("VER-4002", "Verification mutation intent is missing or incorrect.", ErrUnauthorized))
		return false
	}
	return true
}

func requireMutationIdempotency(c *gin.Context) (string, bool) {
	key := c.GetHeader("Idempotency-Key")
	if validateMutationToken(key) != nil {
		respondVerificationError(c, coded("VER-4002", "Idempotency-Key is required and invalid keys are rejected.", ErrInvalid))
		return "", false
	}
	return key, true
}

func markMutationReplay(c *gin.Context, replayed bool) {
	c.Header("Idempotency-Replayed", strconv.FormatBool(replayed))
}

func decodeStrictJSON(c *gin.Context, maximum int64, target any) bool {
	body, ok := readStrictJSONObject(c, maximum)
	if !ok {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		respondVerificationError(c, coded("VER-5001", "Request body does not match the Verification contract.", ErrInvalid))
		return false
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		respondVerificationError(c, coded("VER-5001", "Request body contains trailing content.", ErrInvalid))
		return false
	}
	return true
}

func readStrictJSONObject(c *gin.Context, maximum int64) (json.RawMessage, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maximum)
	body, err := io.ReadAll(c.Request.Body)
	maximumMembers := maximumJSONMembers
	if maximum > maximumCandidateBytes {
		maximumMembers = maximumVerificationRunJSONMembers
	}
	if err != nil ||
		len(body) > int(maximum) ||
		validateJSONObjectWithinBudget(
			body,
			int(maximum),
			maximumMembers,
		) != nil {
		respondVerificationError(c, coded("VER-5001", "Request body is not strict bounded JSON.", ErrInvalid))
		return nil, false
	}
	return json.RawMessage(body), true
}

func evidenceFilter(c *gin.Context, requireIdentity bool) (ListFilter, bool) {
	filter := ListFilter{}
	if value := c.Query("workspaceRevision"); value != "" {
		revision, err := parsePositiveInt64(value)
		if err != nil {
			respondVerificationError(c, ErrInvalid)
			return ListFilter{}, false
		}
		filter.WorkspaceRevision = revision
		filter.WorkspaceRevisionSet = true
	}
	filter.PlanDigest = c.Query("planDigest")
	if filter.PlanDigest != "" && !digestPattern.MatchString(filter.PlanDigest) {
		respondVerificationError(c, ErrInvalid)
		return ListFilter{}, false
	}
	filter.CellID = c.Query("cellId")
	if filter.CellID != "" && validateIdentifier(filter.CellID, "cellId") != nil {
		respondVerificationError(c, ErrInvalid)
		return ListFilter{}, false
	}
	if requireIdentity && (!filter.WorkspaceRevisionSet || filter.PlanDigest == "") {
		respondVerificationError(c, coded("VER-6002", "Closure requires workspaceRevision and planDigest.", ErrInvalid))
		return ListFilter{}, false
	}
	if trust := c.Query("trust"); trust != "" {
		switch TrustClass(trust) {
		case TrustLocalUnattested, TrustRemoteAttested, TrustCIAttested, TrustImported:
			filter.Trust = TrustClass(trust)
		default:
			respondVerificationError(c, ErrInvalid)
			return ListFilter{}, false
		}
	}
	if outcome := c.Query("outcome"); outcome != "" {
		switch outcome {
		case "passed", "failed", "blocked", "cancelled", "infrastructure-error":
			filter.Outcome = outcome
		default:
			respondVerificationError(c, ErrInvalid)
			return ListFilter{}, false
		}
	}
	if limit := c.Query("limit"); limit != "" {
		parsed, err := strconv.Atoi(limit)
		if err != nil || parsed < 1 || parsed > 100 {
			respondVerificationError(c, ErrInvalid)
			return ListFilter{}, false
		}
		filter.Limit = parsed
	}
	if cursor := c.Query("cursor"); cursor != "" {
		createdAt, id, err := DecodeEvidenceCursor(cursor)
		if err != nil {
			respondVerificationError(c, ErrInvalid)
			return ListFilter{}, false
		}
		filter.CursorCreatedAt, filter.CursorID = createdAt, id
	}
	return filter, true
}

func respondVerificationError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	code := "VER-5005"
	message := "Verification service failed."
	var codedError *CodedError
	if errors.As(err, &codedError) {
		code, message = codedError.Code, codedError.Message
	}
	switch {
	case errors.Is(err, ErrInvalid), errors.Is(err, ErrArtifactRejected), errors.Is(err, ErrAttestationRejected):
		status = http.StatusBadRequest
	case errors.Is(err, ErrUnauthorized):
		status = http.StatusForbidden
	case errors.Is(err, ErrNotFound), errors.Is(err, ErrArtifactMissing):
		status = http.StatusNotFound
	case errors.Is(err, ErrExpired):
		status = http.StatusGone
		code, message = "VER-6001", "Verification resource is expired or deleted."
	case errors.Is(err, ErrConflict), errors.Is(err, ErrRetentionProtected):
		status = http.StatusConflict
	case errors.Is(err, ErrPreconditionRequired):
		status = http.StatusPreconditionRequired
	}
	c.AbortWithStatusJSON(status, gin.H{"error": gin.H{"code": code, "message": message}})
}
