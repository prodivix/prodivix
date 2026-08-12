package agent

import (
	"context"
	"net/http"
	"strings"
	"time"
)

type evaluationProductionRunConfigArtifactRepository interface {
	StoreEvaluationProductionRunConfigArtifact(
		context.Context,
		EvaluationAuthority,
		evaluationProductionRunConfigArtifactIngress,
		time.Time,
	) (EvaluationProductionRunConfigArtifactRecord, bool, error)
}

func (handler *EvaluationServiceHandler) evaluationProductionRunConfigArtifactRoute(request *http.Request) bool {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(segments) == 4 && segments[0] == "v1" && segments[1] == "evaluations" &&
		segments[2] == handler.authority.NamespaceID && validEvaluationServiceIdentity(segments[2]) &&
		segments[3] == "production-run-config-artifacts"
}

func (handler *EvaluationServiceHandler) handleEvaluationProductionRunConfigArtifact(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationProductionRunConfigArtifactRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationRunConfigArtifactIngressBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	ingress, err := decodeEvaluationProductionRunConfigArtifactIngress(source, handler.authority)
	if err != nil || !exactEvaluationIdempotencyHeader(request, ingress.Binding.BindingDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if handler.attemptAuthorityResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
		request.Context(), "production-run-config-artifact.ingress", ingress.IngressDigest, ingress.Bytes,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	record, replayed, err := repository.StoreEvaluationProductionRunConfigArtifact(
		request.Context(), handler.authority, ingress, handler.clock().UTC().Truncate(time.Millisecond),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, replayStatus(replayed), record.ReceiptBytes)
}
