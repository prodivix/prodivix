package agent

import (
	"encoding/json"
	"net/http"
)

func writeEvaluationCapabilityEffectInputAuthorityResponse(
	writer http.ResponseWriter,
	status int,
	format string,
	requestDigest string,
	receipt []byte,
	replayed bool,
) {
	writeEvaluationServiceJSON(writer, status, struct {
		Format        string          `json:"format"`
		Version       int64           `json:"version"`
		RequestDigest string          `json:"requestDigest"`
		Receipt       json.RawMessage `json:"receipt"`
		Replayed      bool            `json:"replayed"`
	}{
		Format: format, Version: evaluationCapabilityEffectInputAuthorityVersion,
		RequestDigest: requestDigest, Receipt: json.RawMessage(receipt), Replayed: replayed,
	})
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityEffectInputAuthority(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityEffectInputAuthorityRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	switch {
	case len(tail) == 1 && tail[0] == "capability-effect-request-ref-authorities":
		source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityEffectInputAuthorityBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		input, err := decodeEvaluationCapabilityEffectRequestRefAuthorityRequest(source, handler.authority, partition)
		if err != nil || !exactEvaluationIdempotencyHeader(request, input.RequestDigest) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := repository.StoreEvaluationCapabilityEffectRequestRefAuthority(
			request.Context(), handler.authority, partition, input, handler.clock().UTC(),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationCapabilityEffectInputAuthorityResponse(
			writer, http.StatusOK, evaluationCapabilityEffectRequestRefAuthorityResponseFormat,
			input.RequestDigest, record.ReceiptBytes, replayed,
		)
	case len(tail) == 1 && tail[0] == "capability-effect-current-turn-events":
		source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityEffectCurrentTurnEventBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		input, err := decodeEvaluationCapabilityEffectCurrentTurnEventRequest(source, handler.authority, partition)
		if err != nil || !exactEvaluationIdempotencyHeader(request, input.RequestDigest) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		if handler.attemptAuthorityResponseScanner != nil {
			if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
				request.Context(), "capability-effect.current-turn-event.seal", input.RequestDigest, input.Bytes,
			); err != nil {
				respondEvaluationServiceError(writer, ErrUnauthorized)
				return
			}
		}
		record, replayed, err := repository.StoreEvaluationCapabilityEffectCurrentTurnEvent(
			request.Context(), handler.authority, partition, input,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationCapabilityEffectInputAuthorityResponse(
			writer, http.StatusOK, evaluationCapabilityEffectCurrentTurnEventResponseFormat,
			input.RequestDigest, record.ReceiptBytes, replayed,
		)
	case len(tail) == 2 && tail[0] == "capability-effect-input-authorities" && tail[1] == "resolve":
		source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityEffectInputAuthorityBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		input, err := decodeEvaluationCapabilityEffectInputRegistryRequest(source, handler.authority, partition)
		if err != nil || !exactEvaluationIdempotencyHeader(request, input.RequestDigest) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := repository.ResolveEvaluationCapabilityEffectInputAuthority(
			request.Context(), handler.authority, partition, input,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if handler.attemptAuthorityResponseScanner != nil {
			if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
				request.Context(), "capability-effect.input-authority.resolve", input.RequestDigest, record.ReceiptBytes,
			); err != nil {
				respondEvaluationServiceError(writer, ErrUnauthorized)
				return
			}
		}
		writeEvaluationCapabilityEffectInputAuthorityResponse(
			writer, http.StatusOK, evaluationCapabilityEffectInputRegistryResponseFormat,
			input.RequestDigest, record.ReceiptBytes, replayed,
		)
	default:
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
	}
}
