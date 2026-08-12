package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func (handler *EvaluationServiceHandler) evaluationCapabilityProbeProviderResourceRoute(
	request *http.Request,
) (string, bool) {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return "", false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if len(segments) != 4 || segments[0] != "v1" || segments[1] != "evaluations" ||
		segments[2] != handler.authority.NamespaceID || !validEvaluationServiceIdentity(segments[2]) {
		return "", false
	}
	if oneOfString(segments[3],
		"capability-probe-provider-resource-registrations",
		"capability-probe-provider-resource-results",
	) {
		return segments[3], true
	}
	return "", false
}

func validateEvaluationCapabilityProbeProviderResourceResponse(
	source []byte,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	record EvaluationCapabilityProbeProviderResourceRegistrationRecord,
) error {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationCapabilityProbeProviderResourceResponseBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "requestDigest", "providerResourceAuthority", "resourceResultDigest",
		"ownerImplementationDigest", "stageDigest", "dispatchAckDigest", "registrationReceiptDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeProviderResourceRegistrationResponseFormat ||
		stringMember(value, "requestDigest") != request.RequestDigest ||
		stringMember(value, "resourceResultDigest") != record.ResourceResultDigest ||
		stringMember(value, "ownerImplementationDigest") != record.OwnerImplementationDigest ||
		stringMember(value, "stageDigest") != record.StageDigest ||
		stringMember(value, "dispatchAckDigest") != record.DispatchAckDigest ||
		stringMember(value, "registrationReceiptDigest") != record.RegistrationReceiptDigest {
		return ErrConflict
	}
	version, versionOK := integerMember(value, "version")
	base := cloneEvaluationObject(value)
	delete(base, "registrationReceiptDigest")
	digest, digestErr := canonicaljson.Digest(base)
	resourceAuthority, authorityOK := objectMember(value, "providerResourceAuthority")
	if !versionOK || version != evaluationCapabilityProbeProviderResourceVersion || digestErr != nil ||
		digest != record.RegistrationReceiptDigest || !authorityOK ||
		stringMember(resourceAuthority, "authorityDigest") != record.ProviderResourceAuthorityDigest {
		return ErrConflict
	}
	return nil
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityProbeProviderResourceRegistration(
	writer http.ResponseWriter,
	httpRequest *http.Request,
) {
	if httpRequest.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(httpRequest) || handler.capabilityProbeProviderResourceAuthority == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityProbeProviderResourceRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(httpRequest, maximumEvaluationCapabilityProbeProviderResourceRequestBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	request, err := decodeEvaluationCapabilityProbeProviderResourceRegistrationRequest(source, handler.authority)
	if err != nil || !exactEvaluationIdempotencyHeader(httpRequest, request.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	ownerImplementationDigest, ready := handler.capabilityProbeProviderResourceAuthority.
		CapabilityProbeProviderResourceImplementationDigest()
	if !ready || !evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	now := handler.clock().UTC().Truncate(time.Millisecond)
	record, _, err := repository.ClaimEvaluationCapabilityProbeProviderResource(
		httpRequest.Context(), handler.authority, request, ownerImplementationDigest, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeResponse := func() error {
		if err := validateEvaluationCapabilityProbeProviderResourceResponse(record.ResponseBytes, request, record); err != nil {
			return err
		}
		if handler.attemptAuthorityResponseScanner != nil {
			if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
				httpRequest.Context(), evaluationCapabilityProbeProviderResourceOperation,
				request.RequestDigest, record.ResponseBytes,
			); err != nil {
				return ErrUnauthorized
			}
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, record.ResponseBytes)
		return nil
	}
	if record.State == "sealed" {
		if err := writeResponse(); err != nil {
			respondEvaluationServiceError(writer, err)
		}
		return
	}
	authorityRequest := EvaluationCapabilityProbeProviderResourceAuthorityRequest{
		NamespaceID: handler.authority.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		RequestDigest: request.RequestDigest, OwnerImplementationDigest: ownerImplementationDigest,
		StageDigest: record.StageDigest, DispatchAckDigest: record.DispatchAckDigest,
		ResultIngressDigest: record.ResultIngressDigest, ResultIngressReceiptDigest: record.ResultIngressReceiptDigest,
		ClaimGeneration: record.ClaimGeneration, Request: append(json.RawMessage(nil), request.Bytes...),
	}
	var authorityResult EvaluationCapabilityProbeProviderResourceAuthorityResult
	if record.State == "claimed" {
		stageDigest, stageErr := handler.capabilityProbeProviderResourceAuthority.
			StageCapabilityProbeProviderResource(httpRequest.Context(), authorityRequest)
		expectedStage, expectedErr := evaluationCapabilityProbeProviderResourceStageDigest(request, ownerImplementationDigest)
		if stageErr != nil || expectedErr != nil || stageDigest != expectedStage {
			if stageErr == nil {
				stageErr = ErrConflict
			}
			respondEvaluationServiceError(writer, stageErr)
			return
		}
		record, _, err = repository.MarkEvaluationCapabilityProbeProviderResourceDispatched(
			httpRequest.Context(), handler.authority, request, stageDigest, now,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		authorityRequest.StageDigest = record.StageDigest
		authorityResult, err = handler.capabilityProbeProviderResourceAuthority.
			ExecuteCapabilityProbeProviderResource(httpRequest.Context(), authorityRequest)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
	} else {
		if record.State != "dispatched" || !evaluationDigestPattern.MatchString(record.StageDigest) ||
			!evaluationDigestPattern.MatchString(record.DispatchAckDigest) ||
			!evaluationDigestPattern.MatchString(record.ResultIngressDigest) ||
			!evaluationDigestPattern.MatchString(record.ResultIngressReceiptDigest) || len(record.ResultBytes) == 0 {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		authorityRequest.StageDigest, authorityRequest.DispatchAckDigest = record.StageDigest, record.DispatchAckDigest
		authorityRequest.ResultIngressDigest = record.ResultIngressDigest
		authorityRequest.ResultIngressReceiptDigest = record.ResultIngressReceiptDigest
		authorityRequest.SealedProviderResourceResult = append(json.RawMessage(nil), record.ResultBytes...)
		authorityResult, ok, err = handler.capabilityProbeProviderResourceAuthority.
			ReconcileCapabilityProbeProviderResource(httpRequest.Context(), authorityRequest)
		if err != nil || !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
	}
	record, err = repository.GetEvaluationCapabilityProbeProviderResource(
		httpRequest.Context(), handler.authority, request,
	)
	if err != nil || record.State != "dispatched" || len(record.ResultBytes) == 0 ||
		authorityResult.ResourceResultDigest != record.ResourceResultDigest ||
		authorityResult.OwnerAdmissionDigest != record.OwnerAdmissionDigest ||
		authorityResult.ResultIngressReceiptDigest != record.ResultIngressReceiptDigest {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	validatedAt := handler.clock().UTC().Truncate(time.Millisecond)
	resultValue, err := decodeCanonicalEvaluationObject(
		record.ResultBytes, maximumEvaluationCapabilityProbeProviderResourceResultBytes,
	)
	result, err := decodeEvaluationCapabilityProbeProviderResourceResult(resultValue, request, record.ClaimedAt, validatedAt)
	if err != nil || result.ResultDigest != record.ResourceResultDigest ||
		result.ProviderResourceAuthorityDigest != record.ProviderResourceAuthorityDigest {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	response, registrationReceiptDigest, err := evaluationCapabilityProbeProviderResourceRegistrationResponse(
		request, ownerImplementationDigest, record.StageDigest, record.DispatchAckDigest, result,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	record, _, err = repository.SealEvaluationCapabilityProbeProviderResource(
		httpRequest.Context(), handler.authority, request, registrationReceiptDigest, response, validatedAt,
	)
	if err != nil || !bytes.Equal(record.ResponseBytes, response) {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := writeResponse(); err != nil {
		respondEvaluationServiceError(writer, err)
	}
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityProbeProviderResourceResultIngress(
	writer http.ResponseWriter,
	httpRequest *http.Request,
) {
	if httpRequest.Method != http.MethodPost || !evaluationServiceQueryIsExact(httpRequest) {
		if httpRequest.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityProbeProviderResourceRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(httpRequest, maximumEvaluationCapabilityProbeProviderResourceResultBytes+65_536)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationCapabilityProbeProviderResourceResultBytes+65_536)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "requestDigest",
		"ownerImplementationDigest", "stageDigest", "resourceResult", "resourceResultDigest",
		"ownerAdmissionDigest", "dispatchAckDigest", "ingressDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeProviderResourceIngressFormat ||
		stringMember(value, "namespaceId") != handler.authority.NamespaceID ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "requestDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerImplementationDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "resourceResultDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerAdmissionDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "dispatchAckDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ingressDigest")) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	version, versionOK := integerMember(value, "version")
	base := cloneEvaluationObject(value)
	delete(base, "ingressDigest")
	ingressDigest, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationCapabilityProbeProviderResourceVersion || digestErr != nil ||
		ingressDigest != stringMember(value, "ingressDigest") ||
		!exactEvaluationIdempotencyHeader(httpRequest, stringMember(value, "requestDigest")) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	// The canonical request is loaded from the claimed row; result ingress cannot supply or swap it.
	stub := evaluationCapabilityProbeProviderResourceRegistrationRequest{
		NamespaceID: handler.authority.NamespaceID, RepositoryCommit: stringMember(value, "repositoryCommit"),
		RequestDigest: stringMember(value, "requestDigest"),
	}
	record, err := repository.GetEvaluationCapabilityProbeProviderResource(httpRequest.Context(), handler.authority, stub)
	if err != nil || record.State != "dispatched" ||
		record.OwnerImplementationDigest != stringMember(value, "ownerImplementationDigest") ||
		record.StageDigest != stringMember(value, "stageDigest") {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	request, err := decodeEvaluationCapabilityProbeProviderResourceRegistrationRequest(record.RequestBytes, handler.authority)
	now := handler.clock().UTC().Truncate(time.Millisecond)
	result, resultErr := decodeEvaluationCapabilityProbeProviderResourceResult(
		value["resourceResult"], request, record.ClaimedAt, now,
	)
	expectedOwnerAdmission, ownerErr := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
		request.RequestDigest, result.ResultDigest, record.OwnerImplementationDigest, record.StageDigest,
	)
	expectedAck, ackErr := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
		request.RequestDigest, result.ResultDigest, expectedOwnerAdmission,
		record.OwnerImplementationDigest, record.StageDigest,
	)
	if err != nil || resultErr != nil || ownerErr != nil || ackErr != nil ||
		result.ResultDigest != stringMember(value, "resourceResultDigest") ||
		expectedOwnerAdmission != stringMember(value, "ownerAdmissionDigest") ||
		expectedAck != stringMember(value, "dispatchAckDigest") {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if handler.attemptAuthorityResponseScanner != nil {
		if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
			httpRequest.Context(), evaluationCapabilityProbeProviderResourceOperation,
			request.RequestDigest, result.Bytes,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
	}
	stored, replayed, err := repository.StoreEvaluationCapabilityProbeProviderResourceResult(
		httpRequest.Context(), handler.authority, request, record.StageDigest, ingressDigest, result,
		expectedOwnerAdmission, expectedAck, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceIngressResponseFormat,
		"version":       evaluationCapabilityProbeProviderResourceVersion,
		"requestDigest": request.RequestDigest, "ingressDigest": ingressDigest,
		"resourceResultDigest": stored.ResourceResultDigest, "dispatchAckDigest": stored.DispatchAckDigest,
		"resultIngressReceiptDigest": stored.ResultIngressReceiptDigest, "replayed": replayed,
	})
}
