package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationHoldoutClosureReader interface {
	GetEvaluationHoldoutClosure(context.Context, EvaluationAuthority, EvaluationPlanPartition) (EvaluationHoldoutClosureResult, error)
}

type evaluationHoldoutClosureWriter interface {
	SealEvaluationHoldoutClosure(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationHoldoutSealAuthorityEvidence,
		EvaluationHoldoutCanarySets,
		time.Time,
	) (EvaluationHoldoutClosureResult, bool, error)
}

type evaluationFinalizationInspector interface {
	InspectEvaluationFinalization(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationHumanReviewAuthority,
	) ([]byte, error)
}

type evaluationFinalizationWriter interface {
	FinalizeEvaluation(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		time.Time,
		time.Time,
		string,
		string,
		string,
		EvaluationHumanReviewAuthority,
	) ([]byte, bool, error)
}

type evaluationFinalizationIntentReader interface {
	GetEvaluationFinalizationIntent(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
	) (EvaluationFinalizationIntentRecord, error)
}

type evaluationFinalizationIntentWriter interface {
	PutEvaluationFinalizationIntent(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		time.Time,
		time.Time,
	) (EvaluationFinalizationIntentRecord, bool, error)
}

type evaluationServicePlanRequest struct {
	Plan json.RawMessage `json:"plan"`
}

type evaluationServiceHoldoutRequest struct {
	Plan                  json.RawMessage `json:"plan"`
	ExpectedReceiptDigest *string         `json:"expectedReceiptDigest,omitempty"`
}

type evaluationServiceFinalizationRequest struct {
	Plan                                     json.RawMessage `json:"plan"`
	CompletedAt                              string          `json:"completedAt"`
	ReviewLeaseDigest                        string          `json:"reviewLeaseDigest"`
	ValidatedHumanReviewArtifactDigest       string          `json:"validatedHumanReviewArtifactDigest"`
	ValidatedHumanMetricObservationSetDigest string          `json:"validatedHumanMetricObservationSetDigest"`
}

type evaluationServiceFinalizationIntentRequest struct {
	Plan        json.RawMessage `json:"plan"`
	CompletedAt string          `json:"completedAt"`
}

func writeEvaluationFinalizationIntentResponse(
	writer http.ResponseWriter,
	status int,
	record EvaluationFinalizationIntentRecord,
	replayed bool,
) {
	writeEvaluationServiceJSON(writer, status, struct {
		PlanDigest       string `json:"planDigest"`
		RepositoryCommit string `json:"repositoryCommit"`
		CompletedAt      string `json:"completedAt"`
		IntentDigest     string `json:"intentDigest"`
		Replayed         bool   `json:"replayed"`
	}{
		PlanDigest: record.Partition.PlanDigest, RepositoryCommit: record.Partition.RepositoryCommit,
		CompletedAt: evaluationExportInstant(record.CompletedAt), IntentDigest: record.IntentDigest,
		Replayed: replayed,
	})
}

func (handler *EvaluationServiceHandler) handleEvaluationFinalizationIntent(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	switch request.Method {
	case http.MethodGet:
		if request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationFinalizationIntentReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationFinalizationIntent(
			request.Context(), handler.authority, partition,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationFinalizationIntentResponse(writer, http.StatusOK, record, true)
	case http.MethodPut:
		var input evaluationServiceFinalizationIntentRequest
		if err := decodeEvaluationServiceBoundedRequest(request, &input); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		completedAt, err := parseEvaluationServiceInstant(input.CompletedAt)
		if err != nil {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		serverNow := handler.clock().UTC().Truncate(time.Millisecond)
		if completedAt.After(serverNow) {
			respondEvaluationServiceError(writer, conflict("evaluation finalization intent time is in the future"))
			return
		}
		if _, err := evaluationServicePlanRecord(request.Context(), handler, partition, input.Plan); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		repository, ok := handler.repository.(evaluationFinalizationIntentWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, replayed, err := repository.PutEvaluationFinalizationIntent(
			request.Context(), handler.authority, partition, completedAt, serverNow,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationFinalizationIntentResponse(writer, replayStatus(replayed), record, replayed)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

func decodeEvaluationServiceBoundedRequest(request *http.Request, target any) error {
	source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
	if err != nil {
		return err
	}
	if err := canonicaljson.ValidateRawEnvelope(source, maximumEvaluationServiceFactBytes); err != nil {
		return ErrInvalid
	}
	return decodeEvaluationServiceRawJSON(source, target)
}

func evaluationServicePlanRecord(
	ctx context.Context,
	handler *EvaluationServiceHandler,
	partition EvaluationPlanPartition,
	requestPlan json.RawMessage,
) (EvaluationPlanRecord, error) {
	repository, ok := handler.repository.(evaluationPlanReader)
	if !ok {
		return EvaluationPlanRecord{}, errEvaluationServiceUnavailable
	}
	if err := canonicaljson.ValidateRawEnvelope(requestPlan, maximumEvaluationServiceFactBytes); err != nil {
		return EvaluationPlanRecord{}, ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(requestPlan))
	decoder.UseNumber()
	var requested map[string]any
	if err := decoder.Decode(&requested); err != nil || len(requested) == 0 {
		return EvaluationPlanRecord{}, ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return EvaluationPlanRecord{}, ErrInvalid
	}
	record, err := repository.GetEvaluationPlan(ctx, handler.authority, partition)
	if err != nil {
		return EvaluationPlanRecord{}, err
	}
	stored, err := decodeEvaluationPlan(record.FactBytes)
	if err != nil {
		return EvaluationPlanRecord{}, err
	}
	requestedBytes, requestedErr := canonicaljson.Bytes(requested)
	storedBytes, storedErr := canonicaljson.Bytes(stored.Value)
	if requestedErr != nil || storedErr != nil || !bytes.Equal(requestedBytes, storedBytes) {
		return EvaluationPlanRecord{}, conflict("evaluation request plan drifted from the durable partition")
	}
	return record, nil
}

func evaluationHoldoutResultReceiptDigest(result EvaluationHoldoutClosureResult) string {
	if result.Status != "sealed" || len(result.Receipt) == 0 {
		return ""
	}
	decoder := json.NewDecoder(bytes.NewReader(result.Receipt))
	decoder.UseNumber()
	var value map[string]any
	if decoder.Decode(&value) != nil {
		return ""
	}
	return stringMember(value, "receiptDigest")
}

func (handler *EvaluationServiceHandler) handleEvaluationHoldoutClosure(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method != http.MethodPut {
		methodNotAllowed(writer, http.MethodPut)
		return
	}
	var input evaluationServiceHoldoutRequest
	if err := decodeEvaluationServiceBoundedRequest(request, &input); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if input.ExpectedReceiptDigest != nil && !evaluationDigestPattern.MatchString(*input.ExpectedReceiptDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	plan, err := evaluationServicePlanRecord(request.Context(), handler, partition, input.Plan)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	reader, canRead := handler.repository.(evaluationHoldoutClosureReader)
	if canRead {
		existing, readErr := reader.GetEvaluationHoldoutClosure(request.Context(), handler.authority, partition)
		if readErr == nil {
			if input.ExpectedReceiptDigest != nil && evaluationHoldoutResultReceiptDigest(existing) != *input.ExpectedReceiptDigest {
				respondEvaluationServiceError(writer, ErrConflict)
				return
			}
			writeEvaluationServiceJSON(writer, http.StatusOK, existing)
			return
		}
		if !errors.Is(readErr, ErrNotFound) {
			respondEvaluationServiceError(writer, readErr)
			return
		}
	}
	if handler.holdoutSealAuthority == nil {
		writeEvaluationServiceJSON(writer, http.StatusOK, evaluationHoldoutPending("holdout-authority-unavailable"))
		return
	}
	evidence, canaries, err := handler.holdoutSealAuthority.Resolve(request.Context(), plan)
	if errors.Is(err, errEvaluationHoldoutAuthorityUnavailable) {
		writeEvaluationServiceJSON(writer, http.StatusOK, evaluationHoldoutPending("holdout-authority-unavailable"))
		return
	}
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	repository, ok := handler.repository.(evaluationHoldoutClosureWriter)
	if !ok {
		clearEvaluationHoldoutCanaries(&canaries)
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	result, _, err := repository.SealEvaluationHoldoutClosure(
		request.Context(), handler.authority, partition, evidence, canaries, handler.clock().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if input.ExpectedReceiptDigest != nil && result.Status == "sealed" &&
		evaluationHoldoutResultReceiptDigest(result) != *input.ExpectedReceiptDigest {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, result)
}

func (handler *EvaluationServiceHandler) handleEvaluationFinalizationInspection(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	var input evaluationServicePlanRequest
	if err := decodeEvaluationServiceBoundedRequest(request, &input); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if _, err := evaluationServicePlanRecord(request.Context(), handler, partition, input.Plan); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	repository, ok := handler.repository.(evaluationFinalizationInspector)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	report, err := repository.InspectEvaluationFinalization(
		request.Context(), handler.authority, partition, handler.humanReviewAuthority,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, report)
}

func (handler *EvaluationServiceHandler) handleEvaluationFinalization(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method != http.MethodPut {
		methodNotAllowed(writer, http.MethodPut)
		return
	}
	var input evaluationServiceFinalizationRequest
	if err := decodeEvaluationServiceBoundedRequest(request, &input); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	completedAt, err := parseEvaluationServiceInstant(input.CompletedAt)
	if err != nil || !evaluationDigestPattern.MatchString(input.ReviewLeaseDigest) ||
		!evaluationDigestPattern.MatchString(input.ValidatedHumanReviewArtifactDigest) ||
		!evaluationDigestPattern.MatchString(input.ValidatedHumanMetricObservationSetDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	serverNow := handler.clock().UTC().Truncate(time.Millisecond)
	if completedAt.After(serverNow) {
		respondEvaluationServiceError(writer, conflict("evaluation finalization completion time is in the future"))
		return
	}
	if _, err := evaluationServicePlanRecord(request.Context(), handler, partition, input.Plan); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	repository, ok := handler.repository.(evaluationFinalizationWriter)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	report, _, err := repository.FinalizeEvaluation(
		request.Context(), handler.authority, partition, completedAt, serverNow,
		input.ReviewLeaseDigest, input.ValidatedHumanReviewArtifactDigest,
		input.ValidatedHumanMetricObservationSetDigest, handler.humanReviewAuthority,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, report)
}
