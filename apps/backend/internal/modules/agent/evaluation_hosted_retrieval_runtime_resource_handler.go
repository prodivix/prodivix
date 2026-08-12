package agent

import (
	"net/http"
	"strings"
)

func (handler *EvaluationServiceHandler) evaluationHostedRetrievalRuntimeResourceOwnerHealthRoute(request *http.Request) bool {
	if request == nil || request.URL == nil || request.URL.Path == "" ||
		strings.HasSuffix(request.URL.Path, "/") || strings.Contains(request.URL.Path, "//") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(parts) == 4 && parts[0] == "v1" && parts[1] == "evaluations" &&
		parts[2] == handler.authority.NamespaceID &&
		parts[3] == evaluationHostedRetrievalRuntimeResourceOwnerHealthRouteSegment
}

func (handler *EvaluationServiceHandler) evaluationHostedRetrievalRuntimeResourceRoute(request *http.Request) (string, bool) {
	if request == nil || request.URL == nil || request.URL.Path == "" ||
		strings.HasSuffix(request.URL.Path, "/") || strings.Contains(request.URL.Path, "//") ||
		strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") {
		return "", false
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if len(parts) == 4 && parts[0] == "v1" && parts[1] == "evaluations" && parts[2] == handler.authority.NamespaceID &&
		oneOfString(parts[3],
			evaluationHostedRetrievalRuntimeResourceRegistrationsRouteSegment,
			evaluationHostedRetrievalRuntimeResourceResultsRouteSegment,
			evaluationHostedRetrievalRuntimeResourceReadsRouteSegment,
			evaluationHostedRetrievalRuntimeResourceRecoveryCandidatesRouteSegment,
			evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment,
			evaluationHostedRetrievalRuntimeResourceCleanupsRouteSegment,
			evaluationHostedRetrievalRuntimeResourceCleanupResultsRouteSegment,
		) {
		return parts[3], true
	}
	if len(parts) == 5 && parts[0] == "v1" && parts[1] == "evaluations" && parts[2] == handler.authority.NamespaceID &&
		parts[3] == evaluationHostedRetrievalRuntimeResourceTerminalFencesRouteSegment && parts[4] == "derive" {
		return evaluationHostedRetrievalRuntimeResourceTerminalFencesRouteSegment + "/derive", true
	}
	if len(parts) == 5 && parts[0] == "v1" && parts[1] == "evaluations" && parts[2] == handler.authority.NamespaceID &&
		parts[3] == "hosted-retrieval-runtime-resource-lifecycle-journal" {
		route := parts[3] + "/" + parts[4]
		if oneOfString(route,
			evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment,
			evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsRouteSegment,
			evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment,
		) {
			return route, true
		}
	}
	return "", false
}

func (handler *EvaluationServiceHandler) evaluationHostedRetrievalRuntimeResourcePreactivationRoute(request *http.Request) bool {
	route, ok := handler.evaluationHostedRetrievalRuntimeResourceRoute(request)
	if !ok {
		return false
	}
	return route == evaluationHostedRetrievalRuntimeResourceResultsRouteSegment ||
		route == evaluationHostedRetrievalRuntimeResourceReadsRouteSegment
}

func (handler *EvaluationServiceHandler) evaluationHostedRetrievalRuntimeResourceRouteAllowed(
	route string,
	request *http.Request,
) bool {
	purpose := request.Header.Get(evaluationHostedRetrievalRuntimeResourcePurposeHeader)
	if len(request.Header.Values(evaluationHostedRetrievalRuntimeResourcePurposeHeader)) != 1 {
		return false
	}
	switch handler.hostedRetrievalRuntimeResourceRole {
	case "full-attempt":
		return (route == evaluationHostedRetrievalRuntimeResourceResultsRouteSegment &&
			purpose == evaluationHostedRetrievalRuntimeResourceRegistrationSetReadPurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceReadsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourceReadPurpose)
	case "prepare":
		return (route == evaluationHostedRetrievalRuntimeResourceRegistrationsRouteSegment ||
			route == evaluationHostedRetrievalRuntimeResourceResultsRouteSegment) &&
			purpose == evaluationHostedRetrievalRuntimeResourcePreparePurpose ||
			evaluationHostedRetrievalRuntimeResourceLifecycleMutationRouteAllowed(route, purpose, request.Method) ||
			evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedReadRouteAllowed(route, purpose, request.Method)
	case "cleanup":
		return (route == evaluationHostedRetrievalRuntimeResourceTerminalFencesRouteSegment+"/derive" &&
			purpose == evaluationHostedRetrievalRuntimeResourceTerminalFencePurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupClaimPurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceCleanupsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupExecutePurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceCleanupResultsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupResultReadPurpose) ||
			evaluationHostedRetrievalRuntimeResourceLifecycleMutationRouteAllowed(route, purpose, request.Method) ||
			evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedReadRouteAllowed(route, purpose, request.Method)
	case "recovery":
		return handler.evaluationHostedRetrievalRuntimeResourceRecoveryRouteAllowed(route, request)
	default:
		return false
	}
}

func evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedReadRouteAllowed(
	route string,
	purpose string,
	method string,
) bool {
	return method == http.MethodPost &&
		route == evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment &&
		purpose == evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose
}

func evaluationHostedRetrievalRuntimeResourceLifecycleMutationRouteAllowed(
	route string,
	purpose string,
	method string,
) bool {
	return method == http.MethodPost &&
		((route == evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment &&
			purpose == evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourceLifecycleTransportPurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose))
}

func (handler *EvaluationServiceHandler) evaluationHostedRetrievalRuntimeResourceRecoveryRouteAllowed(
	route string,
	request *http.Request,
) bool {
	purpose := request.Header.Get(evaluationHostedRetrievalRuntimeResourcePurposeHeader)
	return len(request.Header.Values(evaluationHostedRetrievalRuntimeResourcePurposeHeader)) == 1 &&
		((route == evaluationHostedRetrievalRuntimeResourceRecoveryCandidatesRouteSegment &&
			purpose == evaluationHostedRetrievalRuntimeResourceRecoveryListPurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourceRecoveryCleanupClaimPurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceCleanupsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourceRecoveryCleanupExecutePurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceCleanupResultsRouteSegment &&
				purpose == evaluationHostedRetrievalRuntimeResourceRecoveryCleanupResultReadPurpose) ||
			(route == evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment &&
				oneOfString(purpose,
					evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose,
					evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose,
				) && request.Method == http.MethodPost) ||
			(route == evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsRouteSegment &&
				oneOfString(purpose,
					evaluationHostedRetrievalRuntimeResourceLifecycleTransportPurpose,
					evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadPurpose,
					evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStorePurpose,
				) && request.Method == http.MethodPost) ||
			(route == evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment &&
				oneOfString(purpose,
					evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose,
					evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPurpose,
				) && request.Method == http.MethodPost))
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceOwnerHealth(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	if !evaluationServiceQueryIsExact(request) || request.ContentLength != 0 || len(request.TransferEncoding) != 0 ||
		len(request.Header.Values("Idempotency-Key")) != 0 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Header.Get(evaluationHostedRetrievalRuntimeResourcePurposeHeader) != evaluationHostedRetrievalRuntimeResourceOwnerHealthPurpose ||
		len(request.Header.Values(evaluationHostedRetrievalRuntimeResourcePurposeHeader)) != 1 {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	if handler.hostedRetrievalRuntimeResource == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	receipt, err := handler.hostedRetrievalRuntimeResource.Health(request.Context(), handler.authority)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, receipt)
}

func evaluationHostedRetrievalRuntimeResourceExactPurpose(request *http.Request, expected string) bool {
	return request != nil && len(request.Header.Values(evaluationHostedRetrievalRuntimeResourcePurposeHeader)) == 1 &&
		request.Header.Get(evaluationHostedRetrievalRuntimeResourcePurposeHeader) == expected
}

func evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request *http.Request, expected string) bool {
	return request != nil && len(request.Header.Values("Idempotency-Key")) == 1 &&
		request.Header.Get("Idempotency-Key") == expected
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResource(
	writer http.ResponseWriter,
	request *http.Request,
	route string,
) {
	if handler.hostedRetrievalRuntimeResource == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	switch route {
	case evaluationHostedRetrievalRuntimeResourceRegistrationsRouteSegment:
		handler.handleEvaluationHostedRetrievalRuntimeResourceRegistration(writer, request)
	case evaluationHostedRetrievalRuntimeResourceResultsRouteSegment:
		if evaluationHostedRetrievalRuntimeResourceExactPurpose(request, evaluationHostedRetrievalRuntimeResourcePreparePurpose) {
			handler.handleEvaluationHostedRetrievalRuntimeResourceRegistrationResult(writer, request)
			return
		}
		handler.handleEvaluationHostedRetrievalRuntimeResourceRegistrationSetLookup(writer, request)
	case evaluationHostedRetrievalRuntimeResourceReadsRouteSegment:
		handler.handleEvaluationHostedRetrievalRuntimeResourceRead(writer, request)
	case evaluationHostedRetrievalRuntimeResourceTerminalFencesRouteSegment + "/derive":
		handler.handleEvaluationHostedRetrievalRuntimeResourceTerminalFenceDerive(writer, request)
	case evaluationHostedRetrievalRuntimeResourceRecoveryCandidatesRouteSegment:
		handler.handleEvaluationHostedRetrievalRuntimeResourceRecoveryCandidates(writer, request)
	case evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment:
		handler.handleEvaluationHostedRetrievalRuntimeResourceCleanupClaim(writer, request)
	case evaluationHostedRetrievalRuntimeResourceCleanupsRouteSegment:
		handler.handleEvaluationHostedRetrievalRuntimeResourceCleanup(writer, request)
	case evaluationHostedRetrievalRuntimeResourceCleanupResultsRouteSegment:
		handler.handleEvaluationHostedRetrievalRuntimeResourceCleanupResult(writer, request)
	case evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment:
		if evaluationHostedRetrievalRuntimeResourceExactPurpose(
			request, evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose,
		) {
			handler.handleEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchRead(writer, request)
			return
		}
		handler.handleEvaluationHostedRetrievalRuntimeResourceLifecycleStage(writer, request)
	case evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsRouteSegment:
		if evaluationHostedRetrievalRuntimeResourceExactPurpose(
			request, evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadPurpose,
		) {
			handler.handleEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryRead(writer, request)
			return
		}
		if evaluationHostedRetrievalRuntimeResourceExactPurpose(
			request, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStorePurpose,
		) {
			handler.handleEvaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStore(writer, request)
			return
		}
		handler.handleEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStore(writer, request)
	case evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment:
		if evaluationHostedRetrievalRuntimeResourceExactPurpose(
			request, evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPurpose,
		) {
			handler.handleEvaluationHostedRetrievalRuntimeResourceLifecycleArchiveRead(writer, request)
			return
		}
		handler.handleEvaluationHostedRetrievalRuntimeResourceLifecycleSeal(writer, request)
	default:
		writeEvaluationServiceError(writer, http.StatusNotImplemented, "EVAL-6011", "Hosted retrieval runtime operation is unavailable.")
	}
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceLifecycleArchiveRead(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if handler.hostedRetrievalRuntimeResourceRole != "recovery" ||
		!evaluationHostedRetrievalRuntimeResourceExactPurpose(
			request, evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPurpose,
		) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	read, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, read.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, err := handler.hostedRetrievalRuntimeResource.ReadLifecycleArchive(
		request.Context(), handler.authority, read,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStore(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if handler.hostedRetrievalRuntimeResourceRole != "recovery" ||
		!evaluationHostedRetrievalRuntimeResourceExactPurpose(
			request, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStorePurpose,
		) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	store, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, store.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.StoreLifecycleReconciliationObservation(
		request.Context(), handler.authority, store,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceLifecycleSeal(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !evaluationHostedRetrievalRuntimeResourceExactPurpose(
		request, evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose,
	) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(
		request, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	seal, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleSealRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, seal.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if (handler.hostedRetrievalRuntimeResourceRole == "prepare" && seal.Journal.IntentSet.Operation != "create") ||
		(handler.hostedRetrievalRuntimeResourceRole == "cleanup" && seal.Journal.IntentSet.Operation != "delete") ||
		!oneOfString(handler.hostedRetrievalRuntimeResourceRole, "prepare", "cleanup", "recovery") {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.SealLifecycleJournal(
		request.Context(), handler.authority, seal,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchRead(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !oneOfString(handler.hostedRetrievalRuntimeResourceRole, "prepare", "cleanup", "recovery") ||
		!evaluationHostedRetrievalRuntimeResourceExactPurpose(
			request, evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose,
		) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(
		request, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	read, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, read.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, err := handler.hostedRetrievalRuntimeResource.ReadLifecycleUnfinishedDispatches(
		request.Context(), handler.authority, read,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryRead(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if handler.hostedRetrievalRuntimeResourceRole != "recovery" ||
		!evaluationHostedRetrievalRuntimeResourceExactPurpose(
			request, evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadPurpose,
		) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(
		request, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	read, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, read.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, _, err := handler.hostedRetrievalRuntimeResource.ReadLifecycleTransportRecovery(
		request.Context(), handler.authority, read,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	// Read receipts use 200 for both first delivery and byte-exact replay.
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStore(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !evaluationHostedRetrievalRuntimeResourceExactPurpose(
		request, evaluationHostedRetrievalRuntimeResourceLifecycleTransportPurpose,
	) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(
		request, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	store, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, store.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	recoveryOnly := handler.hostedRetrievalRuntimeResourceRole == "recovery"
	if (!recoveryOnly && handler.hostedRetrievalRuntimeResourceRole == "prepare" && store.DispatchIntentSet.Operation != "create") ||
		(!recoveryOnly && handler.hostedRetrievalRuntimeResourceRole == "cleanup" && store.DispatchIntentSet.Operation != "delete") ||
		(!recoveryOnly && !oneOfString(handler.hostedRetrievalRuntimeResourceRole, "prepare", "cleanup")) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.StoreLifecycleTransport(
		request.Context(), handler.authority, store, recoveryOnly,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceLifecycleStage(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !evaluationHostedRetrievalRuntimeResourceExactPurpose(
		request, evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose,
	) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(
		request, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	stage, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleStageRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, stage.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	requiredOperation := ""
	reconcileOnly := false
	switch handler.hostedRetrievalRuntimeResourceRole {
	case "prepare":
		requiredOperation = "create"
	case "cleanup":
		requiredOperation = "delete"
	case "recovery":
		requiredOperation = stage.DispatchIntent.Operation
		if stage.DispatchIntent.Operation == "delete" && stage.DispatchIntent.LifecycleClaimReceiptDigest != nil {
			// Recovery owns first delivery for a delete only through a durable
			// cleanup or partial-create cleanup claim. The database trigger binds
			// the exact claim and known resource; this route never grants create.
			reconcileOnly = false
		} else {
			reconcileOnly = true
		}
	default:
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.StageLifecycleDispatch(
		request.Context(), handler.authority, stage, requiredOperation, reconcileOnly,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceRecoveryCandidates(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !evaluationHostedRetrievalRuntimeResourceExactPurpose(request, evaluationHostedRetrievalRuntimeResourceRecoveryListPurpose) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	scan, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryScanRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, scan.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.ListRecoveryCandidates(
		request.Context(), handler.authority, scan,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceCleanupClaim(
	writer http.ResponseWriter,
	request *http.Request,
) {
	source, err := readEvaluationServiceJSON(request, evaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequestMaxBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	var response []byte
	var replay bool
	switch request.Header.Get(evaluationHostedRetrievalRuntimeResourcePurposeHeader) {
	case evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupClaimPurpose:
		claim, decodeErr := decodeEvaluationHostedRetrievalRuntimeResourcePostMatrixClaimRequest(source)
		if decodeErr != nil || !evaluationHostedRetrievalRuntimeResourceExactPurpose(request, evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupClaimPurpose) ||
			!evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, claim.RequestDigest) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		response, replay, err = handler.hostedRetrievalRuntimeResource.ClaimPostMatrixCleanup(
			request.Context(), handler.authority, claim,
		)
	case evaluationHostedRetrievalRuntimeResourceRecoveryCleanupClaimPurpose:
		claim, decodeErr := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryClaimRequest(source)
		if decodeErr != nil || !evaluationHostedRetrievalRuntimeResourceExactPurpose(request, evaluationHostedRetrievalRuntimeResourceRecoveryCleanupClaimPurpose) ||
			!evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, claim.RequestDigest) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		response, replay, err = handler.hostedRetrievalRuntimeResource.ClaimRecoveryCleanup(
			request.Context(), handler.authority, claim,
		)
	default:
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceCleanup(
	writer http.ResponseWriter,
	request *http.Request,
) {
	purpose := request.Header.Get(evaluationHostedRetrievalRuntimeResourcePurposeHeader)
	if !oneOfString(purpose,
		evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupExecutePurpose,
		evaluationHostedRetrievalRuntimeResourceRecoveryCleanupExecutePurpose) ||
		!evaluationHostedRetrievalRuntimeResourceExactPurpose(request, purpose) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceCleanupReceiptBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	receipt, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupReceipt(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, receipt.CleanupReceiptDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.StoreCleanupReceipt(
		request.Context(), handler.authority, purpose, receipt,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceCleanupResult(
	writer http.ResponseWriter,
	request *http.Request,
) {
	purpose := request.Header.Get(evaluationHostedRetrievalRuntimeResourcePurposeHeader)
	if !oneOfString(purpose,
		evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupResultReadPurpose,
		evaluationHostedRetrievalRuntimeResourceRecoveryCleanupResultReadPurpose) ||
		!evaluationHostedRetrievalRuntimeResourceExactPurpose(request, purpose) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	readRequest, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest(source)
	if err != nil || readRequest.Purpose != purpose ||
		!evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, readRequest.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, err := handler.hostedRetrievalRuntimeResource.ReadCleanupResult(
		request.Context(), handler.authority, readRequest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceTerminalFenceDerive(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !evaluationHostedRetrievalRuntimeResourceExactPurpose(request, evaluationHostedRetrievalRuntimeResourceTerminalFencePurpose) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	deriveRequest, err := decodeEvaluationHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, deriveRequest.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.DeriveTerminalFence(
		request.Context(), handler.authority, deriveRequest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceRegistration(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !evaluationHostedRetrievalRuntimeResourceExactPurpose(request, evaluationHostedRetrievalRuntimeResourcePreparePurpose) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	registration, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, registration.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.StoreRegistrationRequest(
		request.Context(), handler.authority, registration,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceRegistrationResult(
	writer http.ResponseWriter,
	request *http.Request,
) {
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceRegistrationResultBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	result, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationResult(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, result.ResultDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, replay, err := handler.hostedRetrievalRuntimeResource.StoreRegistrationResult(
		request.Context(), handler.authority, result,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replay), response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceRegistrationSetLookup(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !evaluationHostedRetrievalRuntimeResourceExactPurpose(request, evaluationHostedRetrievalRuntimeResourceRegistrationSetReadPurpose) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	lookup, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, lookup.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, err := handler.hostedRetrievalRuntimeResource.LookupRegistrationSet(
		request.Context(), handler.authority, lookup,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationHostedRetrievalRuntimeResourceRead(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if !evaluationHostedRetrievalRuntimeResourceExactPurpose(request, evaluationHostedRetrievalRuntimeResourceReadPurpose) {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	readRequest, err := decodeEvaluationHostedRetrievalRuntimeResourceReadRequest(source)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceExactIdempotencyKey(request, readRequest.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response, err := handler.hostedRetrievalRuntimeResource.ReadActiveResource(
		request.Context(), handler.authority, readRequest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}
