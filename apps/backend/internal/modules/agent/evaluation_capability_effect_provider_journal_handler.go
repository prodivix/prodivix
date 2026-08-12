package agent

import (
	"net/http"
	"strings"
)

func (handler *EvaluationServiceHandler) evaluationCapabilityEffectProviderJournalRoute(request *http.Request) bool {
	if request == nil || request.URL == nil || request.URL.Path == "" ||
		strings.HasSuffix(request.URL.Path, "/") || strings.Contains(request.URL.Path, "//") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if len(parts) == 5 {
		return parts[0] == "v1" && parts[1] == "evaluations" && parts[2] == handler.authority.NamespaceID &&
			parts[3] == evaluationCapabilityEffectProviderJournalRouteSegment && parts[4] == "health"
	}
	if len(parts) < 7 || len(parts) > 9 || parts[0] != "v1" || parts[1] != "evaluations" ||
		parts[2] != handler.authority.NamespaceID || !evaluationDigestPattern.MatchString(parts[3]) ||
		!evaluationRepositoryCommitPattern.MatchString(parts[4]) || parts[5] != evaluationCapabilityEffectProviderJournalRouteSegment {
		return false
	}
	return (len(parts) == 7 && oneOfString(parts[6], "stages", "executions", "results", "cleanup")) ||
		(len(parts) == 8 && parts[6] == "owner-requests" && evaluationDigestPattern.MatchString(parts[7])) ||
		(len(parts) == 9 && parts[6] == "attempts" && validEvaluationServiceIdentity(parts[7]) && parts[8] == "zero-residual")
}

func (handler *EvaluationServiceHandler) evaluationCapabilityEffectProviderJournalRecoveryRoute(request *http.Request) bool {
	if !handler.evaluationCapabilityEffectProviderJournalRoute(request) {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return (len(parts) == 5 && parts[4] == "health") ||
		(len(parts) == 7 && parts[6] == "cleanup") ||
		(len(parts) == 8 && parts[6] == "owner-requests") ||
		(len(parts) == 9 && parts[6] == "attempts" && parts[8] == "zero-residual")
}

func (handler *EvaluationServiceHandler) evaluationCapabilityEffectProviderJournalHealthRoute(request *http.Request) bool {
	if !handler.evaluationCapabilityEffectProviderJournalRoute(request) {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(parts) == 5 && parts[4] == "health"
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectProviderJournal(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Header.Get(evaluationCapabilityEffectProviderJournalPurposeHeader) != evaluationCapabilityEffectProviderJournalPurpose ||
		len(request.Header.Values(evaluationCapabilityEffectProviderJournalPurposeHeader)) != 1 {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	if handler.capabilityEffectProviderJournal == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if len(parts) == 5 {
		handler.handleEvaluationCapabilityEffectProviderJournalHealth(writer, request)
		return
	}
	partition := EvaluationPlanPartition{PlanDigest: parts[3], RepositoryCommit: parts[4]}
	switch {
	case len(parts) == 7 && parts[6] == "stages":
		handler.handleEvaluationCapabilityEffectProviderJournalStage(writer, request, partition)
	case len(parts) == 7 && parts[6] == "executions":
		handler.handleEvaluationCapabilityEffectProviderJournalExecution(writer, request, partition)
	case len(parts) == 7 && parts[6] == "results":
		handler.handleEvaluationCapabilityEffectProviderJournalResult(writer, request, partition)
	case len(parts) == 7 && parts[6] == "cleanup":
		handler.handleEvaluationCapabilityEffectProviderJournalCleanup(writer, request, partition)
	case len(parts) == 8 && parts[6] == "owner-requests":
		handler.handleEvaluationCapabilityEffectProviderJournalSnapshot(writer, request, partition, parts[7])
	case len(parts) == 9 && parts[6] == "attempts" && parts[8] == "zero-residual":
		handler.handleEvaluationCapabilityEffectProviderJournalZeroResidual(writer, request, partition, parts[7])
	default:
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
	}
}

func evaluationCapabilityEffectProviderJournalGETIsExact(request *http.Request) bool {
	return evaluationServiceQueryIsExact(request) && request.ContentLength == 0 && len(request.TransferEncoding) == 0 &&
		len(request.Header.Values("Idempotency-Key")) == 0
}

func evaluationCapabilityEffectProviderJournalIdempotencyKey(request *http.Request, expected string) bool {
	values := request.Header.Values("Idempotency-Key")
	return len(values) == 1 && values[0] == expected
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectProviderJournalStage(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityEffectProviderJournalStageBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	record, err := decodeEvaluationCapabilityEffectProviderJournalStageRecord(source)
	if err != nil || !evaluationCapabilityEffectProviderJournalIdempotencyKey(request, record.RecordDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.capabilityEffectProviderJournal.StoreStage(
		request.Context(), handler.authority, partition, source,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectProviderJournalExecution(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityEffectProviderJournalExecutionWriteBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalExecutionWriteBytes)
	writeDigest := stringMember(value, "writeDigest")
	if err != nil || !evaluationDigestPattern.MatchString(writeDigest) ||
		!evaluationCapabilityEffectProviderJournalIdempotencyKey(request, writeDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.capabilityEffectProviderJournal.StoreExecution(
		request.Context(), handler.authority, partition, source,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectProviderJournalResult(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityEffectProviderJournalResultBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityEffectProviderJournalResultBytes)
	recordDigest := stringMember(value, "recordDigest")
	if err != nil || !evaluationDigestPattern.MatchString(recordDigest) ||
		!evaluationCapabilityEffectProviderJournalIdempotencyKey(request, recordDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.capabilityEffectProviderJournal.StoreResult(
		request.Context(), handler.authority, partition, source,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectProviderJournalCleanup(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityEffectProviderJournalCleanupBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	cleanup, err := decodeEvaluationCapabilityEffectProviderJournalCleanupRequest(source)
	if err != nil || !evaluationCapabilityEffectProviderJournalIdempotencyKey(request, cleanup.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.capabilityEffectProviderJournal.Cleanup(
		request.Context(), handler.authority, partition, source,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectProviderJournalSnapshot(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	ownerRequestDigest string,
) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	if !evaluationCapabilityEffectProviderJournalGETIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, err := handler.capabilityEffectProviderJournal.Snapshot(
		request.Context(), handler.authority, partition, ownerRequestDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectProviderJournalZeroResidual(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	attemptID string,
) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	if !evaluationCapabilityEffectProviderJournalGETIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, err := handler.capabilityEffectProviderJournal.ZeroResidual(
		request.Context(), handler.authority, partition, attemptID,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectProviderJournalHealth(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	if !evaluationCapabilityEffectProviderJournalGETIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, healthy, err := handler.capabilityEffectProviderJournal.Health(request.Context(), handler.authority)
	if err != nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	status := http.StatusOK
	if !healthy {
		status = http.StatusServiceUnavailable
	}
	writeEvaluationServiceRaw(writer, status, response)
}
