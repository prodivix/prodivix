package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

const evaluationOptionalFactAuthorityCommandFormat = "prodivix.agent-evaluation-optional-capability-fact-authority-command"

type evaluationOptionalFactSourceSealer interface {
	SealEvaluationOptionalFactSource(
		context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte, time.Time,
	) (EvaluationOptionalFactSourceRecord, bool, error)
}

type evaluationOptionalFactAuthorityStager interface {
	StageEvaluationOptionalFactAuthority(
		context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte, time.Time,
	) (EvaluationOptionalFactAuthorityRecord, bool, error)
}

type evaluationOptionalFactAuthoritySealer interface {
	SealEvaluationOptionalFactAuthority(
		context.Context, EvaluationAuthority, EvaluationPlanPartition, string, int64, string, string, string, time.Time,
	) (EvaluationOptionalFactAuthorityRecord, bool, error)
}

type evaluationOptionalFactAuthorityReader interface {
	GetEvaluationOptionalFactAuthority(
		context.Context, EvaluationAuthority, EvaluationPlanPartition, string, int64, string, string,
	) (EvaluationOptionalFactAuthorityRecord, error)
}

type evaluationOptionalFactAuthorityCommand struct {
	AttemptID              string
	TurnIndex              int64
	AuthorityRequestDigest string
	SourceSealDigest       string
	StageDigest            string
}

func decodeEvaluationOptionalFactAuthorityCommand(source []byte) (evaluationOptionalFactAuthorityCommand, error) {
	value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationOptionalFactAuthorityRequestBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "attemptId", "turnIndex", "authorityRequestDigest", "sourceSealDigest", "stageDigest",
	}) || stringMember(value, "format") != evaluationOptionalFactAuthorityCommandFormat ||
		!validEvaluationAgentControlIdentity(stringMember(value, "attemptId")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "authorityRequestDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "sourceSealDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) {
		return evaluationOptionalFactAuthorityCommand{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnOK := integerMember(value, "turnIndex")
	if !versionOK || version != 1 || !turnOK || turnIndex < 0 || turnIndex >= maximumEvaluationOptionalFactAuthorityTurns {
		return evaluationOptionalFactAuthorityCommand{}, ErrInvalid
	}
	return evaluationOptionalFactAuthorityCommand{
		AttemptID: stringMember(value, "attemptId"), TurnIndex: turnIndex,
		AuthorityRequestDigest: stringMember(value, "authorityRequestDigest"),
		SourceSealDigest:       stringMember(value, "sourceSealDigest"), StageDigest: stringMember(value, "stageDigest"),
	}, nil
}

func writeEvaluationOptionalFactSourceResponse(
	writer http.ResponseWriter,
	status int,
	record EvaluationOptionalFactSourceRecord,
	replayed bool,
) {
	writeEvaluationServiceJSON(writer, status, struct {
		SourceSealReceipt json.RawMessage `json:"sourceSealReceipt"`
		Replayed          bool            `json:"replayed"`
	}{SourceSealReceipt: json.RawMessage(record.ReceiptBytes), Replayed: replayed})
}

func writeEvaluationOptionalFactAuthorityStageResponse(
	writer http.ResponseWriter,
	status int,
	record EvaluationOptionalFactAuthorityRecord,
	replayed bool,
) {
	writeEvaluationServiceJSON(writer, status, struct {
		Format                 string `json:"format"`
		Version                int64  `json:"version"`
		AuthorityRequestDigest string `json:"authorityRequestDigest"`
		SourceSealDigest       string `json:"sourceSealDigest"`
		StageDigest            string `json:"stageDigest"`
		Replayed               bool   `json:"replayed"`
	}{
		Format: "prodivix.agent-evaluation-optional-capability-fact-authority-stage-response", Version: 1,
		AuthorityRequestDigest: record.AuthorityRequestDigest, SourceSealDigest: record.SourceSealDigest,
		StageDigest: record.StageDigest, Replayed: replayed,
	})
}

func writeEvaluationOptionalFactAuthorityResultResponse(
	writer http.ResponseWriter,
	status int,
	record EvaluationOptionalFactAuthorityRecord,
	replayed bool,
) {
	writeEvaluationServiceJSON(writer, status, struct {
		AuthorityResponse json.RawMessage `json:"authorityResponse"`
		Replayed          bool            `json:"replayed"`
	}{AuthorityResponse: json.RawMessage(record.ResponseBytes), Replayed: replayed})
}

// handleEvaluationOptionalFactAuthority is intentionally composed by the
// existing service handler switch in one small owner-coordinated patch.
func (handler *EvaluationServiceHandler) handleEvaluationOptionalFactAuthority(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method != http.MethodPost || !evaluationServiceQueryIsExact(request) || len(tail) != 2 {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
		} else {
			respondEvaluationServiceError(writer, ErrInvalid)
		}
		return
	}
	switch {
	case tail[0] == "optional-capability-fact-sources" && tail[1] == "seal":
		source, err := readEvaluationServiceJSON(request, maximumEvaluationOptionalFactAuthorityWireBytes)
		decoded, decodeErr := decodeEvaluationOptionalFactAuthorityRequest(source)
		if err != nil || decodeErr != nil || !exactEvaluationIdempotencyHeader(request, decoded.AuthorityRequestDigest) {
			if err == nil {
				err = ErrInvalid
			}
			respondEvaluationServiceError(writer, err)
			return
		}
		repository, ok := handler.repository.(evaluationOptionalFactSourceSealer)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, replayed, err := repository.SealEvaluationOptionalFactSource(
			request.Context(), handler.authority, partition, source, handler.clock(),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationOptionalFactSourceResponse(writer, replayStatus(replayed), record, replayed)
	case tail[0] == "optional-capability-facts" && tail[1] == "stage":
		source, err := readEvaluationServiceJSON(request, maximumEvaluationOptionalFactAuthorityRequestBytes)
		decoded, decodeErr := decodeEvaluationOptionalFactAuthorityStageRequest(source)
		if err != nil || decodeErr != nil || !exactEvaluationIdempotencyHeader(request, decoded.AuthorityRequestDigest) {
			if err == nil {
				err = ErrInvalid
			}
			respondEvaluationServiceError(writer, err)
			return
		}
		repository, ok := handler.repository.(evaluationOptionalFactAuthorityStager)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, replayed, err := repository.StageEvaluationOptionalFactAuthority(
			request.Context(), handler.authority, partition, source, handler.clock(),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationOptionalFactAuthorityStageResponse(writer, replayStatus(replayed), record, replayed)
	case tail[0] == "optional-capability-facts" && (tail[1] == "seal" || tail[1] == "reconcile"):
		source, err := readEvaluationServiceJSON(request, maximumEvaluationOptionalFactAuthorityRequestBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		command, err := decodeEvaluationOptionalFactAuthorityCommand(source)
		if err != nil || !exactEvaluationIdempotencyHeader(request, command.AuthorityRequestDigest) {
			if err == nil {
				err = ErrInvalid
			}
			respondEvaluationServiceError(writer, err)
			return
		}
		if tail[1] == "reconcile" {
			repository, ok := handler.repository.(evaluationOptionalFactAuthorityReader)
			if !ok {
				respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
				return
			}
			record, err := repository.GetEvaluationOptionalFactAuthority(
				request.Context(), handler.authority, partition, command.AttemptID, command.TurnIndex,
				command.AuthorityRequestDigest, command.StageDigest,
			)
			if err != nil || record.SourceSealDigest != command.SourceSealDigest {
				if err == nil {
					err = ErrConflict
				}
				respondEvaluationServiceError(writer, err)
				return
			}
			writeEvaluationOptionalFactAuthorityResultResponse(writer, http.StatusOK, record, true)
			return
		}
		repository, ok := handler.repository.(evaluationOptionalFactAuthoritySealer)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, replayed, err := repository.SealEvaluationOptionalFactAuthority(
			request.Context(), handler.authority, partition, command.AttemptID, command.TurnIndex,
			command.AuthorityRequestDigest, command.SourceSealDigest, command.StageDigest, handler.clock(),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationOptionalFactAuthorityResultResponse(writer, replayStatus(replayed), record, replayed)
	default:
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
	}
}
