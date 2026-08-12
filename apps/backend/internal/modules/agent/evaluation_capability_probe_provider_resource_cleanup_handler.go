package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func (handler *EvaluationServiceHandler) evaluationCapabilityProbeProviderResourceCleanupRoute(
	request *http.Request,
) (string, string, bool) {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return "", "", false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if len(segments) < 4 || len(segments) > 5 || segments[0] != "v1" || segments[1] != "evaluations" ||
		segments[2] != handler.authority.NamespaceID || !validEvaluationServiceIdentity(segments[2]) {
		return "", "", false
	}
	if len(segments) == 4 && oneOfString(segments[3],
		"capability-probe-provider-resource-cleanups",
		"capability-probe-provider-resource-cleanup-results",
	) {
		return segments[3], "", true
	}
	if len(segments) == 5 && segments[3] == "capability-probe-provider-resource-cleanups" &&
		evaluationRepositoryCommitPattern.MatchString(segments[4]) {
		return "capability-probe-provider-resource-cleanup-list", segments[4], true
	}
	return "", "", false
}

func evaluationCapabilityProbeProviderResourceCleanupListRecordValue(
	authority EvaluationAuthority,
	record evaluationCapabilityProbeProviderResourceCleanupListRecord,
) (map[string]any, string, error) {
	request, err := decodeEvaluationCapabilityProbeProviderResourceRegistrationRequest(
		record.ResourceRegistrationRequestBytes, authority,
	)
	if err != nil || record.ClaimedAt.IsZero() || record.SealedAt.IsZero() {
		return nil, "", ErrConflict
	}
	resultValue, err := decodeCanonicalEvaluationObject(
		record.ProviderResourceResultBytes, maximumEvaluationCapabilityProbeProviderResourceResultBytes,
	)
	result, resultErr := decodeEvaluationCapabilityProbeProviderResourceResult(
		resultValue, request, record.ClaimedAt, record.SealedAt,
	)
	deletionReceipt, deletionBytes, deletionErr :=
		decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceipt(
			resultValue["deletionAuthorityReceipt"],
		)
	if err != nil || resultErr != nil || deletionErr != nil ||
		!bytes.Equal(deletionBytes, record.DeletionAuthorityReceiptBytes) ||
		stringMember(deletionReceipt, "deletionAuthorityReceiptDigest") != result.DeletionAuthorityReceiptDigest {
		return nil, "", ErrConflict
	}

	registrationResponse, err := decodeCanonicalEvaluationObject(
		record.RegistrationResponseBytes, maximumEvaluationCapabilityProbeProviderResourceResponseBytes,
	)
	if err != nil {
		return nil, "", ErrConflict
	}
	ownerImplementationDigest := stringMember(registrationResponse, "ownerImplementationDigest")
	expectedStage, stageErr := evaluationCapabilityProbeProviderResourceStageDigest(request, ownerImplementationDigest)
	expectedAdmission, admissionErr := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
		request.RequestDigest, result.ResultDigest, ownerImplementationDigest, expectedStage,
	)
	expectedAck, ackErr := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
		request.RequestDigest, result.ResultDigest, expectedAdmission, ownerImplementationDigest, expectedStage,
	)
	registrationRecord := EvaluationCapabilityProbeProviderResourceRegistrationRecord{
		ResourceResultDigest: result.ResultDigest, OwnerImplementationDigest: ownerImplementationDigest,
		StageDigest: expectedStage, DispatchAckDigest: expectedAck,
		RegistrationReceiptDigest:       stringMember(registrationResponse, "registrationReceiptDigest"),
		ProviderResourceAuthorityDigest: result.ProviderResourceAuthorityDigest,
		ResponseBytes:                   record.RegistrationResponseBytes,
	}
	if stageErr != nil || admissionErr != nil || ackErr != nil ||
		validateEvaluationCapabilityProbeProviderResourceResponse(
			record.RegistrationResponseBytes, request, registrationRecord,
		) != nil {
		return nil, "", ErrConflict
	}

	cleanupRequestValue, _, cleanupRequestBytes, err :=
		evaluationCapabilityProbeProviderResourceCleanupRequestValue(
			request.RepositoryCommit, request.RequestDigest, result.DeletionAuthorityReceiptDigest,
		)
	if err != nil || len(record.CleanupRequestBytes) != 0 &&
		!bytes.Equal(record.CleanupRequestBytes, cleanupRequestBytes) {
		return nil, "", ErrConflict
	}
	var cleanupResponse any
	if len(record.CleanupResponseBytes) == 0 {
		cleanupResponse = nil
	} else {
		responseValue, decodeErr := decodeCanonicalEvaluationObject(
			record.CleanupResponseBytes, maximumEvaluationCapabilityProbeProviderResourceCleanupResponseBytes,
		)
		cleanupRequest, requestErr := decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(cleanupRequestBytes)
		cleanupReceipt, receiptErr := decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(
			responseValue["cleanupReceipt"], deletionReceipt,
		)
		expectedResponse, _, responseErr := evaluationCapabilityProbeProviderResourceCleanupResponse(
			cleanupRequest, stringMember(responseValue, "ownerImplementationDigest"), cleanupReceipt,
		)
		if decodeErr != nil || requestErr != nil || receiptErr != nil || responseErr != nil ||
			!bytes.Equal(expectedResponse, record.CleanupResponseBytes) {
			return nil, "", ErrConflict
		}
		cleanupResponse = responseValue
	}
	base := map[string]any{
		"format":                      evaluationCapabilityProbeProviderResourceCleanupListRecordFormat,
		"version":                     evaluationCapabilityProbeProviderResourceCleanupVersion,
		"resourceRegistrationRequest": request.Value,
		"providerResourceResult":      result.Value,
		"registrationResponse":        registrationResponse,
		"cleanupRequest":              cleanupRequestValue,
		"deletionAuthorityReceipt":    deletionReceipt,
		"cleanupResponse":             cleanupResponse,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, "", err
	}
	value := cloneEvaluationObject(base)
	value["recordDigest"] = digest
	return value, request.RequestDigest, nil
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityProbeProviderResourceCleanupList(
	writer http.ResponseWriter,
	request *http.Request,
	repositoryCommit string,
) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	if !evaluationServiceQueryIsExact(request) || request.ContentLength != 0 || len(request.TransferEncoding) != 0 ||
		handler.attemptAuthorityResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityProbeProviderResourceCleanupRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	records, err := repository.ListEvaluationCapabilityProbeProviderResourceCleanups(
		request.Context(), handler.authority, repositoryCommit,
	)
	if err != nil || len(records) > int(maximumEvaluationCapabilityProbeProviderResourceRegistrations) {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	values := make([]any, 0, len(records))
	previous := ""
	for _, record := range records {
		value, requestDigest, recordErr := evaluationCapabilityProbeProviderResourceCleanupListRecordValue(
			handler.authority, record,
		)
		if recordErr != nil || previous != "" && previous >= requestDigest {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		previous = requestDigest
		values = append(values, value)
	}
	base := map[string]any{
		"format":           evaluationCapabilityProbeProviderResourceCleanupListFormat,
		"version":          evaluationCapabilityProbeProviderResourceCleanupVersion,
		"namespaceId":      handler.authority.NamespaceID,
		"repositoryCommit": repositoryCommit,
		"records":          values,
	}
	listDigest, err := canonicaljson.Digest(base)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value := cloneEvaluationObject(base)
	value["listDigest"] = listDigest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) > maximumEvaluationCapabilityProbeProviderResourceCleanupListBytes {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
		request.Context(), evaluationCapabilityProbeProviderResourceCleanupOperation+".list",
		listDigest, encoded,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, encoded)
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityProbeProviderResourceCleanup(
	writer http.ResponseWriter,
	httpRequest *http.Request,
) {
	if httpRequest.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(httpRequest) || handler.capabilityProbeProviderResourceCleanupAuthority == nil ||
		handler.attemptAuthorityResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityProbeProviderResourceCleanupRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(httpRequest, 16_384)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	request, err := decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(source)
	if err != nil || !exactEvaluationIdempotencyHeader(httpRequest, request.CleanupRequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	ownerImplementationDigest, ready := handler.capabilityProbeProviderResourceCleanupAuthority.
		CapabilityProbeProviderResourceCleanupImplementationDigest()
	if !ready || !evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	now := handler.clock().UTC().Truncate(time.Millisecond)
	record, _, err := repository.ClaimEvaluationCapabilityProbeProviderResourceCleanup(
		httpRequest.Context(), handler.authority, request, ownerImplementationDigest, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	deletionReceipt, deletionBytes, err :=
		decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceiptBytes(
			record.DeletionAuthorityReceiptBytes,
		)
	if err != nil || !bytes.Equal(deletionBytes, record.DeletionAuthorityReceiptBytes) ||
		stringMember(deletionReceipt, "requestDigest") != request.ResourceRegistrationRequestDigest ||
		stringMember(deletionReceipt, "deletionAuthorityReceiptDigest") != request.DeletionAuthorityReceiptDigest {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeResponse := func() error {
		if err := validateEvaluationCapabilityProbeProviderResourceCleanupResponse(
			record.ResponseBytes, request, record, deletionReceipt,
		); err != nil {
			return err
		}
		if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
			httpRequest.Context(), evaluationCapabilityProbeProviderResourceCleanupOperation,
			request.CleanupRequestDigest, record.ResponseBytes,
		); err != nil {
			return ErrUnauthorized
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
	authorityRequest := EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest{
		NamespaceID: handler.authority.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		CleanupRequestDigest: request.CleanupRequestDigest, OwnerImplementationDigest: ownerImplementationDigest,
		StageDigest: record.StageDigest, DispatchAckDigest: record.DispatchAckDigest,
		ResultIngressDigest: record.ResultIngressDigest, ResultIngressReceiptDigest: record.ResultIngressReceiptDigest,
		ClaimGeneration: record.ClaimGeneration, Request: append(json.RawMessage(nil), request.Bytes...),
		DeletionAuthorityReceipt: append(json.RawMessage(nil), record.DeletionAuthorityReceiptBytes...),
	}
	var authorityResult EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult
	if record.State == "claimed" {
		stageDigest, stageErr := handler.capabilityProbeProviderResourceCleanupAuthority.
			StageCapabilityProbeProviderResourceCleanup(httpRequest.Context(), authorityRequest)
		expectedStage, expectedErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(
			request, ownerImplementationDigest,
		)
		if stageErr != nil || expectedErr != nil || stageDigest != expectedStage {
			if stageErr == nil {
				stageErr = ErrConflict
			}
			respondEvaluationServiceError(writer, stageErr)
			return
		}
		record, _, err = repository.MarkEvaluationCapabilityProbeProviderResourceCleanupDispatched(
			httpRequest.Context(), handler.authority, request, stageDigest, now,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		authorityRequest.StageDigest = record.StageDigest
		authorityResult, err = handler.capabilityProbeProviderResourceCleanupAuthority.
			ExecuteCapabilityProbeProviderResourceCleanup(httpRequest.Context(), authorityRequest)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
	} else {
		if record.State != "dispatched" || !evaluationDigestPattern.MatchString(record.StageDigest) ||
			!evaluationDigestPattern.MatchString(record.DispatchAckDigest) ||
			!evaluationDigestPattern.MatchString(record.ResultIngressDigest) ||
			!evaluationDigestPattern.MatchString(record.ResultIngressReceiptDigest) || len(record.CleanupReceiptBytes) == 0 {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		authorityRequest.StageDigest, authorityRequest.DispatchAckDigest = record.StageDigest, record.DispatchAckDigest
		authorityRequest.ResultIngressDigest = record.ResultIngressDigest
		authorityRequest.ResultIngressReceiptDigest = record.ResultIngressReceiptDigest
		authorityRequest.SealedProviderResourceCleanupReceipt = append(
			json.RawMessage(nil), record.CleanupReceiptBytes...,
		)
		var reconciled bool
		authorityResult, reconciled, err = handler.capabilityProbeProviderResourceCleanupAuthority.
			ReconcileCapabilityProbeProviderResourceCleanup(httpRequest.Context(), authorityRequest)
		if err != nil || !reconciled {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
	}
	record, err = repository.GetEvaluationCapabilityProbeProviderResourceCleanup(
		httpRequest.Context(), handler.authority, request,
	)
	if err != nil || record.State != "dispatched" || len(record.CleanupReceiptBytes) == 0 ||
		authorityResult.CleanupReceiptDigest != record.CleanupReceiptDigest ||
		authorityResult.OwnerAdmissionDigest != record.OwnerAdmissionDigest ||
		authorityResult.ResultIngressReceiptDigest != record.ResultIngressReceiptDigest {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	receiptValue, err := decodeCanonicalEvaluationObject(
		record.CleanupReceiptBytes, maximumEvaluationCapabilityProbeProviderResourceCleanupReceiptBytes,
	)
	receipt, receiptErr := decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(
		receiptValue, deletionReceipt,
	)
	response, responseDigest, responseErr := evaluationCapabilityProbeProviderResourceCleanupResponse(
		request, ownerImplementationDigest, receipt,
	)
	completedAt := handler.clock().UTC().Truncate(time.Millisecond)
	if err != nil || receiptErr != nil || responseErr != nil || receipt.CompletedAt.After(completedAt) {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
		httpRequest.Context(), evaluationCapabilityProbeProviderResourceCleanupOperation,
		request.CleanupRequestDigest, response,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	record, _, err = repository.SealEvaluationCapabilityProbeProviderResourceCleanup(
		httpRequest.Context(), handler.authority, request, responseDigest, response, completedAt,
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

func decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceiptBytes(
	source []byte,
) (map[string]any, []byte, error) {
	value, err := decodeCanonicalEvaluationObject(
		source, maximumEvaluationCapabilityProbeProviderResourceComponentBytes,
	)
	if err != nil {
		return nil, nil, err
	}
	return decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceipt(value)
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityProbeProviderResourceCleanupResultIngress(
	writer http.ResponseWriter,
	httpRequest *http.Request,
) {
	if httpRequest.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(httpRequest) || handler.attemptAuthorityResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityProbeProviderResourceCleanupRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(httpRequest, maximumEvaluationCapabilityProbeProviderResourceCleanupIngressBytes)
	value, decodeErr := decodeCanonicalEvaluationObject(
		source, maximumEvaluationCapabilityProbeProviderResourceCleanupIngressBytes,
	)
	if err != nil || decodeErr != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "cleanupRequestDigest",
		"resourceRegistrationRequestDigest", "ownerImplementationDigest", "stageDigest", "cleanupReceipt",
		"cleanupReceiptDigest", "ownerAdmissionDigest", "dispatchAckDigest", "resultIngressDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeProviderResourceCleanupIngressEnvelopeFormat ||
		stringMember(value, "namespaceId") != handler.authority.NamespaceID ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "cleanupRequestDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "resourceRegistrationRequestDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerImplementationDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "cleanupReceiptDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerAdmissionDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "dispatchAckDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "resultIngressDigest")) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	version, versionOK := integerMember(value, "version")
	if !versionOK || version != evaluationCapabilityProbeProviderResourceCleanupVersion ||
		!exactEvaluationIdempotencyHeader(httpRequest, stringMember(value, "cleanupRequestDigest")) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	stub := evaluationCapabilityProbeProviderResourceCleanupRequest{
		RepositoryCommit:     stringMember(value, "repositoryCommit"),
		CleanupRequestDigest: stringMember(value, "cleanupRequestDigest"),
	}
	record, err := repository.GetEvaluationCapabilityProbeProviderResourceCleanup(
		httpRequest.Context(), handler.authority, stub,
	)
	if err != nil || record.State != "dispatched" ||
		record.ResourceRegistrationRequestDigest != stringMember(value, "resourceRegistrationRequestDigest") ||
		record.OwnerImplementationDigest != stringMember(value, "ownerImplementationDigest") ||
		record.StageDigest != stringMember(value, "stageDigest") {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	request, requestErr := decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(record.RequestBytes)
	deletionReceipt, _, deletionErr := decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceiptBytes(
		record.DeletionAuthorityReceiptBytes,
	)
	receipt, receiptErr := decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(
		value["cleanupReceipt"], deletionReceipt,
	)
	expectedStage, stageErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(
		request, record.OwnerImplementationDigest,
	)
	expectedAdmission, admissionErr := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
		request.CleanupRequestDigest, expectedStage, record.OwnerImplementationDigest,
	)
	expectedAck, ackErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
		request.CleanupRequestDigest, expectedStage, expectedAdmission, receipt.CleanupReceiptDigest,
	)
	expectedIngress, ingressErr := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
		request.CleanupRequestDigest, expectedAck, receipt.CleanupReceiptDigest,
	)
	if requestErr != nil || deletionErr != nil || receiptErr != nil || stageErr != nil || admissionErr != nil ||
		ackErr != nil || ingressErr != nil || request.CleanupRequestDigest != record.CleanupRequestDigest ||
		expectedStage != record.StageDigest || receipt.CleanupReceiptDigest != stringMember(value, "cleanupReceiptDigest") ||
		expectedAdmission != stringMember(value, "ownerAdmissionDigest") ||
		expectedAck != stringMember(value, "dispatchAckDigest") ||
		expectedIngress != stringMember(value, "resultIngressDigest") {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
		httpRequest.Context(), evaluationCapabilityProbeProviderResourceCleanupOperation+".result-ingress",
		request.CleanupRequestDigest, source,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	now := handler.clock().UTC().Truncate(time.Millisecond)
	stored, replayed, err := repository.StoreEvaluationCapabilityProbeProviderResourceCleanupResult(
		httpRequest.Context(), handler.authority, request, record.StageDigest, receipt,
		expectedAdmission, expectedAck, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, map[string]any{
		"format":                     evaluationCapabilityProbeProviderResourceCleanupIngressResponseFormat,
		"version":                    evaluationCapabilityProbeProviderResourceCleanupVersion,
		"cleanupRequestDigest":       request.CleanupRequestDigest,
		"cleanupReceiptDigest":       stored.CleanupReceiptDigest,
		"dispatchAckDigest":          stored.DispatchAckDigest,
		"resultIngressDigest":        stored.ResultIngressDigest,
		"resultIngressReceiptDigest": stored.ResultIngressReceiptDigest,
		"replayed":                   replayed,
	})
}
