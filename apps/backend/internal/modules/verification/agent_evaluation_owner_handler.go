package verification

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	agentEvaluationOwnerPurposeHeader        = "X-Prodivix-Verification-Authority-Purpose"
	agentEvaluationOwnerRequestDigestHeader  = "X-Prodivix-Verification-Request-Digest"
	agentEvaluationOwnerCapabilityHeader     = "X-Prodivix-Verification-Capability"
	agentEvaluationOwnerArtifactDigestHeader = "X-Prodivix-Verification-Artifact-Digest"
	agentEvaluationOwnerArtifactSizeHeader   = "X-Prodivix-Verification-Artifact-Size"
)

func (handler *Handler) HandleAgentEvaluationOwnerHealth(c *gin.Context) {
	if !handler.requireAgentEvaluationOwnerAuthority(c) ||
		!agentEvaluationOwnerRequestEnvelopeIsEmpty(c) {
		return
	}
	digest, err := agentEvaluationOwnerImplementationDigest()
	if err != nil {
		respondAgentEvaluationOwnerError(c, err)
		return
	}
	handler.writeAgentEvaluationOwnerResponse(c, http.StatusOK, agentEvaluationOwnerHealthResponse{
		Format: agentEvaluationOwnerHealthFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, ImplementationDigest: digest,
	})
}

func (handler *Handler) HandleAgentEvaluationOwnerCreatePromotion(c *gin.Context) {
	if !handler.requireAgentEvaluationOwnerAuthority(c) {
		return
	}
	var request agentEvaluationOwnerCreateRequest
	if !decodeCanonicalAgentEvaluationOwnerRequest(c, maximumAgentEvaluationOwnerRequestBytes, &request) ||
		validateAgentEvaluationOwnerRequestBase(
			request.Format, request.Version, request.Purpose, request.Operation,
			"promotion.create", request.WorkspaceID, c.Param("workspaceId"), request.RequestDigest,
		) != nil ||
		!agentEvaluationOwnerRequestDigestMatches(request, request.RequestDigest) ||
		request.Candidate.WorkspaceID != request.WorkspaceID ||
		c.GetHeader("Idempotency-Key") != request.IdempotencyKey ||
		validateMutationToken(request.IdempotencyKey) != nil {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return
	}
	result, err := handler.agentEvaluationOwner.CreatePromotion(
		c.Request.Context(), request.WorkspaceID, request.IdempotencyKey, request.Candidate,
	)
	if err != nil {
		respondAgentEvaluationOwnerError(c, err)
		return
	}
	if validateIdentifier(result.PromotionID, "promotionId") != nil ||
		validateIdentifier(result.EvidenceID, "evidenceId") != nil ||
		len(result.UploadCapability) < 32 || len(result.UploadCapability) > 512 {
		respondAgentEvaluationOwnerError(c, ErrConflict)
		return
	}
	response := agentEvaluationOwnerCreateResponse{
		Format: agentEvaluationOwnerResponseFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: request.Operation,
		RequestDigest: request.RequestDigest, PromotionID: result.PromotionID,
		EvidenceID: result.EvidenceID, UploadCapability: result.UploadCapability,
	}
	response.ResponseDigest = mustAgentEvaluationOwnerResponseDigest(response)
	handler.writeAgentEvaluationOwnerResponse(c, http.StatusOK, response)
}

func (handler *Handler) HandleAgentEvaluationOwnerUploadArtifact(c *gin.Context) {
	if !handler.requireAgentEvaluationOwnerAuthority(c) ||
		!agentEvaluationOwnerRouteHasNoQuery(c) {
		return
	}
	workspaceID, promotionID, artifactID := c.Param("workspaceId"), c.Param("promotionId"), c.Param("artifactId")
	capability := c.GetHeader(agentEvaluationOwnerCapabilityHeader)
	requestDigest := c.GetHeader(agentEvaluationOwnerRequestDigestHeader)
	artifactDigest := c.GetHeader(agentEvaluationOwnerArtifactDigestHeader)
	artifactSize, sizeErr := strconv.ParseInt(c.GetHeader(agentEvaluationOwnerArtifactSizeHeader), 10, 64)
	mediaType, parameters, mediaErr := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if validateIdentifier(workspaceID, "workspaceId") != nil ||
		validateIdentifier(promotionID, "promotionId") != nil ||
		validateIdentifier(artifactID, "artifactId") != nil ||
		len(capability) < 32 || len(capability) > 512 ||
		!digestPattern.MatchString(requestDigest) ||
		!digestPattern.MatchString(artifactDigest) ||
		sizeErr != nil || artifactSize < 0 || artifactSize > maximumArtifactBytes ||
		mediaErr != nil || mediaType == "" || len(parameters) != 0 ||
		c.GetHeader("Content-Encoding") != "" ||
		c.GetHeader("Idempotency-Key") != requestDigest {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maximumArtifactBytes+1)
	body, err := io.ReadAll(c.Request.Body)
	if err != nil || int64(len(body)) != artifactSize || digestBytes(body) != artifactDigest ||
		(c.Request.ContentLength >= 0 && c.Request.ContentLength != artifactSize) {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return
	}
	projection := agentEvaluationOwnerArtifactRequestProjection{
		Format: agentEvaluationOwnerRequestFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: "artifact.upload",
		WorkspaceID: workspaceID, PromotionID: promotionID, ArtifactID: artifactID,
		UploadCapabilityDigest: digestBytes([]byte(capability)),
		ArtifactDigest:         artifactDigest, ArtifactSize: artifactSize, MediaType: mediaType,
	}
	computedDigest, _, err := canonicalDigest(projection)
	if err != nil || computedDigest != requestDigest {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return
	}
	descriptor, err := handler.agentEvaluationOwner.UploadArtifact(
		c.Request.Context(), workspaceID, promotionID, artifactID,
		capability, mediaType, bytes.NewReader(body),
	)
	if err != nil {
		respondAgentEvaluationOwnerError(c, err)
		return
	}
	if descriptor.ID != artifactID || descriptor.Digest != artifactDigest ||
		descriptor.Size != artifactSize || descriptor.MediaType != mediaType ||
		descriptor.Availability != "available" {
		respondAgentEvaluationOwnerError(c, ErrConflict)
		return
	}
	response := agentEvaluationOwnerArtifactResponse{
		Format: agentEvaluationOwnerResponseFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: "artifact.upload",
		RequestDigest: requestDigest, PromotionID: promotionID, Artifact: descriptor,
	}
	response.ResponseDigest = mustAgentEvaluationOwnerResponseDigest(response)
	handler.writeAgentEvaluationOwnerResponse(c, http.StatusOK, response)
}

func (handler *Handler) HandleAgentEvaluationOwnerPreparePromotion(c *gin.Context) {
	handler.handleAgentEvaluationOwnerPromotionTransition(c, "promotion.prepare")
}

func (handler *Handler) HandleAgentEvaluationOwnerFinalCommitPromotion(c *gin.Context) {
	handler.handleAgentEvaluationOwnerPromotionTransition(c, "promotion.final-commit")
}

func (handler *Handler) handleAgentEvaluationOwnerPromotionTransition(
	c *gin.Context,
	operation string,
) {
	if !handler.requireAgentEvaluationOwnerAuthority(c) {
		return
	}
	var request agentEvaluationOwnerPromotionRequest
	if !decodeCanonicalAgentEvaluationOwnerRequest(c, 256*1024, &request) ||
		validateAgentEvaluationOwnerRequestBase(
			request.Format, request.Version, request.Purpose, request.Operation,
			operation, request.WorkspaceID, c.Param("workspaceId"), request.RequestDigest,
		) != nil ||
		request.PromotionID != c.Param("promotionId") ||
		validateIdentifier(request.PromotionID, "promotionId") != nil ||
		len(request.UploadCapability) < 32 || len(request.UploadCapability) > 512 ||
		!agentEvaluationOwnerRequestDigestMatches(request, request.RequestDigest) ||
		c.GetHeader("Idempotency-Key") != request.RequestDigest ||
		(operation == "promotion.prepare" && request.Attestation != nil) ||
		(operation == "promotion.final-commit" && request.Attestation == nil) {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return
	}
	if operation == "promotion.prepare" {
		result, err := handler.agentEvaluationOwner.PreparePromotion(
			c.Request.Context(), request.WorkspaceID, request.PromotionID, request.UploadCapability,
		)
		if err != nil {
			respondAgentEvaluationOwnerError(c, err)
			return
		}
		if validateAgentEvaluationOwnerPromotionResult(result, request.PromotionID) != nil {
			respondAgentEvaluationOwnerError(c, ErrConflict)
			return
		}
		response := agentEvaluationOwnerPrepareResponse{
			Format: agentEvaluationOwnerResponseFormat, Version: agentEvaluationOwnerWireVersion,
			Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: operation,
			RequestDigest: request.RequestDigest, PromotionID: result.PromotionID,
			EvidenceID: result.EvidenceID, AttestationNonce: result.AttestationNonce,
			AttestationStatement:       *result.AttestationStatement,
			AttestationStatementDigest: result.AttestationStatementDigest,
		}
		response.ResponseDigest = mustAgentEvaluationOwnerResponseDigest(response)
		handler.writeAgentEvaluationOwnerResponse(c, http.StatusOK, response)
		return
	}
	manifest, err := handler.agentEvaluationOwner.FinalCommitPromotion(
		c.Request.Context(), request.WorkspaceID, request.PromotionID,
		request.UploadCapability, *request.Attestation,
	)
	if err != nil {
		respondAgentEvaluationOwnerError(c, err)
		return
	}
	projectedEvidence, projectionErr := projectEvidenceManifest(manifest)
	if projectionErr != nil || manifest.Evidence.ID == "" ||
		projectedEvidence.ID != manifest.Evidence.ID ||
		projectedEvidence.ManifestDigest != manifest.ManifestDigest {
		respondAgentEvaluationOwnerError(c, ErrConflict)
		return
	}
	response := agentEvaluationOwnerFinalCommitResponse{
		Format: agentEvaluationOwnerResponseFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: operation,
		RequestDigest: request.RequestDigest, PromotionID: request.PromotionID,
		EvidenceID: manifest.Evidence.ID, Manifest: agentEvaluationOwnerManifestWire(manifest),
	}
	response.ResponseDigest = mustAgentEvaluationOwnerResponseDigest(response)
	handler.writeAgentEvaluationOwnerResponse(c, http.StatusOK, response)
}

func (handler *Handler) HandleAgentEvaluationOwnerResolveVerifiedView(c *gin.Context) {
	if !handler.requireAgentEvaluationOwnerAuthority(c) {
		return
	}
	var request agentEvaluationOwnerVerifiedViewRequest
	if !decodeCanonicalAgentEvaluationOwnerRequest(c, 64*1024, &request) ||
		validateAgentEvaluationOwnerRequestBase(
			request.Format, request.Version, request.Purpose, request.Operation,
			"verified-view.resolve", request.WorkspaceID, c.Param("workspaceId"), request.RequestDigest,
		) != nil ||
		!agentEvaluationOwnerRequestDigestMatches(request, request.RequestDigest) ||
		len(request.EvidenceIDs) == 0 || len(request.EvidenceIDs) > maximumAgentEvaluationExactEvidenceIDs ||
		c.GetHeader("Idempotency-Key") != "" {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return
	}
	for index, evidenceID := range request.EvidenceIDs {
		if validateIdentifier(evidenceID, "evidenceId") != nil ||
			(index > 0 && request.EvidenceIDs[index-1] >= evidenceID) {
			respondAgentEvaluationOwnerError(c, ErrInvalid)
			return
		}
	}
	snapshot, err := handler.agentEvaluationOwner.ResolveExactVerifiedView(
		c.Request.Context(), request.WorkspaceID, request.EvidenceIDs,
	)
	if err != nil {
		respondAgentEvaluationOwnerError(c, err)
		return
	}
	if validateAgentEvaluationOwnerExactSnapshot(snapshot, request.EvidenceIDs) != nil {
		respondAgentEvaluationOwnerError(c, ErrConflict)
		return
	}
	manifests := make([]agentEvaluationOwnerEvidenceManifestWire, len(snapshot.Manifests))
	for index := range snapshot.Manifests {
		manifests[index] = agentEvaluationOwnerManifestWire(snapshot.Manifests[index])
	}
	response := agentEvaluationOwnerVerifiedViewResponse{
		Format: agentEvaluationOwnerResponseFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: request.Operation,
		RequestDigest: request.RequestDigest, EvidenceIDs: append([]string(nil), request.EvidenceIDs...),
		View: agentEvaluationOwnerViewWire(snapshot.View), Manifests: manifests,
	}
	response.ResponseDigest = mustAgentEvaluationOwnerResponseDigest(response)
	handler.writeAgentEvaluationOwnerResponse(c, http.StatusOK, response)
}

func (handler *Handler) requireAgentEvaluationOwnerAuthority(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store")
	if handler.agentEvaluationOwner == nil || handler.agentEvaluationOwnerToken == "" {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"error": gin.H{"code": "VER-9001", "message": "Verification owner authority is unavailable."},
		})
		return false
	}
	authorization := c.GetHeader("Authorization")
	if !strings.HasPrefix(authorization, "Bearer ") ||
		!constantTimeAgentEvaluationOwnerTokenEqual(
			strings.TrimPrefix(authorization, "Bearer "), handler.agentEvaluationOwnerToken,
		) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "VER-4001", "message": "Verification owner credential is invalid."},
		})
		return false
	}
	if c.GetHeader(agentEvaluationOwnerPurposeHeader) != AgentEvaluationOwnerAuthorityPurpose {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": gin.H{"code": "VER-4002", "message": "Verification owner purpose is invalid."},
		})
		return false
	}
	return true
}

func constantTimeAgentEvaluationOwnerTokenEqual(actual string, expected string) bool {
	actualDigest := sha256.Sum256([]byte(actual))
	expectedDigest := sha256.Sum256([]byte(expected))
	return subtle.ConstantTimeCompare(actualDigest[:], expectedDigest[:]) == 1
}

func decodeCanonicalAgentEvaluationOwnerRequest(
	c *gin.Context,
	maximum int64,
	target any,
) bool {
	if !agentEvaluationOwnerRouteHasNoQuery(c) ||
		c.GetHeader("Content-Encoding") != "" {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return false
	}
	mediaType, parameters, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || mediaType != "application/json" || len(parameters) != 0 {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return false
	}
	body, ok := readStrictJSONObject(c, maximum)
	if !ok {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil ||
		func() bool {
			err := decoder.Decode(new(any))
			return !errors.Is(err, io.EOF)
		}() {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return false
	}
	canonical, err := canonicalBytes(target)
	if err != nil || !bytes.Equal(canonical, body) {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return false
	}
	return true
}

func agentEvaluationOwnerRequestDigestMatches(value any, expected string) bool {
	digest, _, err := digestWithoutField(value, "requestDigest")
	return err == nil && digest == expected
}

func mustAgentEvaluationOwnerResponseDigest(value any) string {
	digest, _, err := digestWithoutField(value, "responseDigest")
	if err != nil {
		return ""
	}
	return digest
}

func (handler *Handler) writeAgentEvaluationOwnerResponse(
	c *gin.Context,
	status int,
	response any,
) {
	encoded, err := canonicalBytes(response)
	if err != nil {
		respondAgentEvaluationOwnerError(c, err)
		return
	}
	if len(encoded) > maximumAgentEvaluationOwnerResponseBytes {
		respondAgentEvaluationOwnerError(c, ErrConflict)
		return
	}
	c.Data(status, "application/json", encoded)
}

func agentEvaluationOwnerRouteHasNoQuery(c *gin.Context) bool {
	if c.Request.URL.RawQuery != "" {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return false
	}
	return true
}

func agentEvaluationOwnerRequestEnvelopeIsEmpty(c *gin.Context) bool {
	if !agentEvaluationOwnerRouteHasNoQuery(c) || c.Request.ContentLength > 0 ||
		c.GetHeader("Content-Encoding") != "" || c.GetHeader("Idempotency-Key") != "" {
		respondAgentEvaluationOwnerError(c, ErrInvalid)
		return false
	}
	return true
}

func respondAgentEvaluationOwnerError(c *gin.Context, err error) {
	if c.IsAborted() {
		return
	}
	status := http.StatusInternalServerError
	code, message := "VER-9001", "Verification owner authority failed."
	switch {
	case errors.Is(err, ErrInvalid), errors.Is(err, ErrArtifactRejected), errors.Is(err, ErrAttestationRejected):
		status, code, message = http.StatusBadRequest, "VER-4002", "Verification owner request is invalid."
	case errors.Is(err, ErrUnauthorized):
		status, code, message = http.StatusForbidden, "VER-4002", "Verification owner request is unauthorized."
	case errors.Is(err, ErrNotFound), errors.Is(err, ErrArtifactMissing):
		status, code, message = http.StatusNotFound, "VER-5001", "Verification owner record is unavailable."
	case errors.Is(err, ErrExpired):
		status, code, message = http.StatusGone, "VER-6001", "Verification owner resource expired."
	case errors.Is(err, ErrConflict), errors.Is(err, ErrRetentionProtected):
		status, code, message = http.StatusConflict, "VER-6002", "Verification owner identity conflicts with durable state."
	}
	c.AbortWithStatusJSON(status, gin.H{"error": gin.H{"code": code, "message": message}})
}
