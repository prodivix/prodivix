package agent

import (
	"net/http"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func (handler *EvaluationServiceHandler) evaluationNativeProviderStateVaultRoute(request *http.Request) bool {
	if request == nil || request.URL == nil || request.URL.Path == "" ||
		strings.HasSuffix(request.URL.Path, "/") || strings.Contains(request.URL.Path, "//") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if len(parts) == 5 {
		return parts[0] == "v1" && parts[1] == "evaluations" &&
			parts[2] == handler.authority.NamespaceID && parts[3] == "native-provider-state-vault" && parts[4] == "health"
	}
	recoveryOnly := handler.nativeProviderStateVault != nil && handler.nativeProviderStateVault.RecoveryOnly()
	if recoveryOnly {
		if len(parts) < 7 || len(parts) > 9 || parts[0] != "v1" || parts[1] != "evaluations" ||
			parts[2] != handler.authority.NamespaceID || !evaluationDigestPattern.MatchString(parts[3]) ||
			!evaluationRepositoryCommitPattern.MatchString(parts[4]) || parts[5] != "native-provider-state-vault" {
			return false
		}
		return (len(parts) == 7 && parts[6] == "recovery") ||
			(len(parts) == 8 && parts[6] == "recoveries" && evaluationDigestPattern.MatchString(parts[7])) ||
			(len(parts) == 9 && parts[6] == "recoveries" && evaluationDigestPattern.MatchString(parts[7]) &&
				parts[8] == "zero-residual")
	}
	return len(parts) >= 7 && len(parts) <= 8 && parts[0] == "v1" && parts[1] == "evaluations" &&
		parts[2] == handler.authority.NamespaceID && evaluationDigestPattern.MatchString(parts[3]) &&
		evaluationRepositoryCommitPattern.MatchString(parts[4]) && parts[5] == "native-provider-state-vault" &&
		oneOfString(parts[6], "seal", "resolve", "retire", "retirements") &&
		((parts[6] == "retirements" && len(parts) == 8 && evaluationDigestPattern.MatchString(parts[7])) ||
			(parts[6] != "retirements" && len(parts) == 7))
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVault(writer http.ResponseWriter, request *http.Request) {
	expectedPurpose := evaluationNativeProviderStateVaultPurpose
	if handler.nativeProviderStateVault != nil && handler.nativeProviderStateVault.RecoveryOnly() {
		expectedPurpose = evaluationNativeProviderStateVaultRecoveryPurpose
	}
	if request.Header.Get(evaluationNativeProviderStateVaultPurposeHeader) != expectedPurpose ||
		len(request.Header.Values(evaluationNativeProviderStateVaultPurposeHeader)) != 1 {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	if handler.nativeProviderStateVault == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if len(parts) == 5 {
		if handler.nativeProviderStateVault.RecoveryOnly() {
			handler.handleEvaluationNativeProviderStateVaultRecoveryHealth(writer, request)
			return
		}
		handler.handleEvaluationNativeProviderStateVaultHealth(writer, request)
		return
	}
	partition := EvaluationPlanPartition{PlanDigest: parts[3], RepositoryCommit: parts[4]}
	if handler.nativeProviderStateVault.RecoveryOnly() {
		switch {
		case len(parts) == 7 && parts[6] == "recovery":
			handler.handleEvaluationNativeProviderStateVaultRecovery(writer, request, partition)
		case len(parts) == 8 && parts[6] == "recoveries":
			handler.handleEvaluationNativeProviderStateVaultRecoveryLookup(writer, request, partition, parts[7])
		case len(parts) == 9 && parts[6] == "recoveries" && parts[8] == "zero-residual":
			handler.handleEvaluationNativeProviderStateVaultRecoveryZeroResidual(writer, request, partition, parts[7])
		default:
			writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
		}
		return
	}
	switch parts[6] {
	case "seal":
		handler.handleEvaluationNativeProviderStateVaultSeal(writer, request, partition)
	case "resolve":
		handler.handleEvaluationNativeProviderStateVaultResolve(writer, request, partition)
	case "retire":
		handler.handleEvaluationNativeProviderStateVaultRetire(writer, request, partition)
	case "retirements":
		handler.handleEvaluationNativeProviderStateVaultRetirementLookup(writer, request, partition, parts[7])
	default:
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
	}
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultRecovery(
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
	source, err := readEvaluationServiceJSON(request, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	recoveryRequest, err := decodeEvaluationNativeProviderStateVaultRecoveryRequest(source)
	if err != nil || !evaluationNativeProviderStateVaultIdempotencyKey(request, recoveryRequest.RecoveryRequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	receipt, replayed, err := handler.nativeProviderStateVault.Recover(
		request.Context(), handler.authority, partition, recoveryRequest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replayed), receipt.Bytes)
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultRecoveryLookup(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	recoveryRequestDigest string,
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
	_, receipt, err := handler.nativeProviderStateVault.LookupRecovery(
		request.Context(), handler.authority, partition, recoveryRequestDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, receipt.Bytes)
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultRecoveryZeroResidual(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	recoveryRequestDigest string,
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
	source, err := handler.nativeProviderStateVault.RecoveryZeroResidual(
		request.Context(), handler.authority, partition, recoveryRequestDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, source)
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultRecoveryHealth(
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
	authority, err := handler.nativeProviderStateVault.Authority()
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	ownerInstanceID, err := handler.nativeProviderStateVault.OwnerInstanceID()
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	summary, err := handler.nativeProviderStateVault.Summary(request.Context(), handler.authority)
	if err != nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	checkedAt := evaluationNativeProviderStateVaultMillisecond(handler.clock())
	base := map[string]any{
		"format":    evaluationNativeProviderStateVaultRecoveryHealthFormat,
		"version":   evaluationNativeProviderStateVaultVersion,
		"authority": authority, "vaultOwnerInstanceId": ownerInstanceID,
		"mode": "recovery-only", "status": "ready",
		"recoveryRequired":           summary.ActiveEncryptedRecordCount != 0,
		"activeEncryptedRecordCount": summary.ActiveEncryptedRecordCount,
		"overdueActiveRecordCount":   summary.OverdueActiveRecordCount,
		"checkedAt":                  evaluationNativeProviderStateVaultInstant(checkedAt),
		"expiresAt":                  evaluationNativeProviderStateVaultInstant(checkedAt.Add(evaluationNativeProviderStateVaultLifetime)),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	base["healthDigest"] = digest
	source, err := canonicaljson.Bytes(base)
	if err != nil || len(source) > maximumEvaluationNativeProviderStateVaultComponentBytes {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, source)
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultSeal(
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
	source, err := readEvaluationServiceJSON(request, maximumEvaluationNativeProviderStateVaultEnvelopeBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	command, err := decodeEvaluationNativeProviderStateVaultSealCommand(source)
	if err != nil || !evaluationNativeProviderStateVaultIdempotencyKey(request, command.Request.SealRequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	receipt, replayed, err := handler.nativeProviderStateVault.Seal(request.Context(), handler.authority, partition, command)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replayed), receipt.Bytes)
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultResolve(
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
	source, err := readEvaluationServiceJSON(request, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	resolveRequest, err := decodeEvaluationNativeProviderStateVaultResolveRequest(source)
	if err != nil || !evaluationNativeProviderStateVaultIdempotencyKey(request, resolveRequest.ResolveRequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	result, replayed, err := handler.nativeProviderStateVault.Resolve(request.Context(), handler.authority, partition, resolveRequest)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replayed), result.Bytes)
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultRetire(
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
	source, err := readEvaluationServiceJSON(request, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	retireRequest, err := decodeEvaluationNativeProviderStateVaultRetireRequest(source)
	if err != nil || !evaluationNativeProviderStateVaultIdempotencyKey(request, retireRequest.RetireRequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	receipt, replayed, err := handler.nativeProviderStateVault.Retire(request.Context(), handler.authority, partition, retireRequest)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replayed), receipt.Bytes)
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultRetirementLookup(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	retireRequestDigest string,
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
	receipt, err := handler.nativeProviderStateVault.LookupRetirement(
		request.Context(), handler.authority, partition, retireRequestDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, receipt.Bytes)
}

func (handler *EvaluationServiceHandler) handleEvaluationNativeProviderStateVaultHealth(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	if !evaluationServiceQueryIsExact(request) || request.ContentLength != 0 || len(request.TransferEncoding) != 0 ||
		len(request.Header.Values("Idempotency-Key")) != 0 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	authority, err := handler.nativeProviderStateVault.Authority()
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	ownerInstanceID, err := handler.nativeProviderStateVault.OwnerInstanceID()
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	summary, err := handler.nativeProviderStateVault.Summary(request.Context(), handler.authority)
	if err != nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	checkedAt := evaluationNativeProviderStateVaultMillisecond(handler.clock())
	status := "ready"
	if summary.OverdueActiveRecordCount != 0 || summary.ForcedExpiryTombstoneCount != 0 {
		status = "unavailable"
	}
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultHealthFormat, "version": int64(1),
		"authority": authority, "status": status, "maximumRecords": int64(maximumEvaluationNativeProviderStateVaultRecords),
		"vaultOwnerInstanceId":       ownerInstanceID,
		"sealedRecordCount":          summary.SealedRecordCount,
		"activeEncryptedRecordCount": summary.ActiveEncryptedRecordCount,
		"retiredRecordCount":         summary.RetiredRecordCount,
		"retirementCounts": map[string]any{
			"cancelled": summary.CancelledRetirementCount,
			"consumed":  summary.ConsumedRetirementCount,
			"expired":   summary.ExpiredRetirementCount,
		},
		"overdueActiveRecordCount":   summary.OverdueActiveRecordCount,
		"forcedExpiryTombstoneCount": summary.ForcedExpiryTombstoneCount,
		"checkedAt":                  evaluationNativeProviderStateVaultInstant(checkedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value := cloneEvaluationObject(base)
	value["healthDigest"] = digest
	source, err := canonicaljson.Bytes(value)
	if err != nil || len(source) > maximumEvaluationNativeProviderStateVaultEnvelopeBytes {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	responseStatus := http.StatusOK
	if status != "ready" {
		responseStatus = http.StatusServiceUnavailable
	}
	writeEvaluationServiceRaw(writer, responseStatus, source)
}

func evaluationNativeProviderStateVaultIdempotencyKey(request *http.Request, expected string) bool {
	values := request.Header.Values("Idempotency-Key")
	return len(values) == 1 && values[0] == expected
}
