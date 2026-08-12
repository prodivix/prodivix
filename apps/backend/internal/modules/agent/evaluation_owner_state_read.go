package agent

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationOwnerStateReadRepository interface {
	GetEvaluationOwnerState(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		string,
	) (EvaluationOwnerStateRecord, error)
	ListEvaluationOwnerStates(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		string,
		int64,
	) ([]EvaluationOwnerStateRecord, bool, error)
}

func evaluationOwnerStateReadPurpose(serviceKind, operation string) bool {
	return serviceKind == "controlled-workspace" && operation == "session.orphans.list" ||
		serviceKind == "verification-evidence" && operation == "verified-view.resolve"
}

func validEvaluationOwnerStateSnapshotState(serviceKind, state string) bool {
	if serviceKind == "controlled-workspace" {
		return oneOfString(state, "active", "destroyed")
	}
	return serviceKind == "verification-evidence" &&
		oneOfString(state, "registered", "active", "finalized", "destroyed")
}

func validateEvaluationOwnerStateReadRecord(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	serviceKind string,
	record EvaluationOwnerStateRecord,
) error {
	if record.NamespaceID != authority.NamespaceID || record.PlanDigest != partition.PlanDigest ||
		record.RepositoryCommit != partition.RepositoryCommit || record.ServiceKind != serviceKind ||
		!evaluationDigestPattern.MatchString(record.OwnerStateID) || record.Revision < 1 ||
		record.Revision > 9_007_199_254_740_991 || !evaluationDigestPattern.MatchString(record.RootDigest) ||
		record.SnapshotKind != serviceKind || !evaluationDigestPattern.MatchString(record.SnapshotDigest) ||
		!validEvaluationOwnerStateSnapshotState(serviceKind, record.SnapshotState) || record.UpdatedAt.IsZero() {
		return ErrConflict
	}
	return nil
}

func scanEvaluationOwnerStateListRecord(row interface{ Scan(...any) error }) (EvaluationOwnerStateRecord, error) {
	var record EvaluationOwnerStateRecord
	var eligible bool
	err := row.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &eligible,
		&record.ServiceKind, &record.OwnerStateID, &record.Revision, &record.RootDigest,
		&record.SnapshotKind, &record.SnapshotDigest, &record.SnapshotState, &record.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationOwnerStateRecord{}, ErrNotFound
	}
	if err != nil {
		return EvaluationOwnerStateRecord{}, err
	}
	if !eligible {
		return EvaluationOwnerStateRecord{}, conflict("evaluation owner state is legacy-ineligible and requires requalification")
	}
	return record, nil
}

func (repository *Repository) ListEvaluationOwnerStates(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	serviceKind string,
	afterOwnerStateID string,
	limit int64,
) ([]EvaluationOwnerStateRecord, bool, error) {
	if err := repository.available(); err != nil {
		return nil, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, false, err
	}
	if err := validateEvaluationPartition(partition); err != nil ||
		!oneOfString(serviceKind, "controlled-workspace", "verification-evidence") ||
		(afterOwnerStateID != "" && !evaluationDigestPattern.MatchString(afterOwnerStateID)) ||
		limit < 1 || limit > maximumEvaluationOwnerStateListRecords {
		return nil, false, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	rows, err := repository.db.QueryContext(ctx, `SELECT
		namespace_id, plan_digest, repository_commit, v46_eligible, service_kind,
		owner_state_id, revision, root_digest, snapshot_kind, snapshot_digest,
		bundle_json#>>'{snapshot,state}', updated_at
	FROM agent_evaluation_owner_states
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		AND service_kind=$4 AND owner_state_id COLLATE "C">$5 COLLATE "C" AND v46_eligible
	ORDER BY owner_state_id COLLATE "C" ASC
	LIMIT $6`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		serviceKind, afterOwnerStateID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	records := make([]EvaluationOwnerStateRecord, 0, limit+1)
	previous := afterOwnerStateID
	for rows.Next() {
		record, err := scanEvaluationOwnerStateListRecord(rows)
		if err != nil || validateEvaluationOwnerStateReadRecord(authority, partition, serviceKind, record) != nil ||
			record.OwnerStateID <= previous {
			if err != nil {
				return nil, false, err
			}
			return nil, false, ErrConflict
		}
		previous = record.OwnerStateID
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := int64(len(records)) > limit
	if hasMore {
		records = records[:limit]
	}
	return records, hasMore, nil
}

func evaluationOwnerStateListProjection(record EvaluationOwnerStateRecord) map[string]any {
	return map[string]any{
		"ownerStateId": record.OwnerStateID, "ownerStateRevision": record.Revision,
		"ownerStateRootDigest": record.RootDigest, "snapshotKind": record.SnapshotKind,
		"snapshotDigest": record.SnapshotDigest, "snapshotState": record.SnapshotState,
		"updatedAt": evaluationExportInstant(record.UpdatedAt),
	}
}

func evaluationOwnerStateResponseDigest(value map[string]any) (string, error) {
	return canonicaljson.Digest(value)
}

func (handler *EvaluationServiceHandler) handleEvaluationOwnerStateRead(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method != http.MethodGet || len(tail) < 1 || len(tail) > 2 || tail[0] != "owner-states" ||
		request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationOwnerStateReadRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if len(tail) == 1 {
		handler.handleEvaluationOwnerStateList(writer, request, partition, repository)
		return
	}
	handler.handleEvaluationOwnerStateGet(writer, request, partition, tail[1], repository)
}

func (handler *EvaluationServiceHandler) handleEvaluationOwnerStateList(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	repository evaluationOwnerStateReadRepository,
) {
	query, err := evaluationServiceOptionalQuery(request, "serviceKind", "operation", "limit", "cursor")
	serviceKind, operation := query.Get("serviceKind"), query.Get("operation")
	limit, limitErr := parseEvaluationServiceInt(query.Get("limit"), 1)
	cursor := query.Get("cursor")
	if err != nil || !evaluationOwnerStateReadPurpose(serviceKind, operation) || limitErr != nil ||
		limit > maximumEvaluationOwnerStateListRecords || cursor != "" && !evaluationDigestPattern.MatchString(cursor) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	records, hasMore, err := repository.ListEvaluationOwnerStates(
		request.Context(), handler.authority, partition, serviceKind, cursor, limit,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	states := make([]any, 0, len(records))
	for _, record := range records {
		if err := validateEvaluationOwnerStateReadRecord(handler.authority, partition, serviceKind, record); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		states = append(states, evaluationOwnerStateListProjection(record))
	}
	stateSetDigest, err := canonicaljson.Digest(states)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	nextCursor := any(nil)
	if hasMore {
		if len(records) == 0 {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		nextCursor = records[len(records)-1].OwnerStateID
	}
	response := map[string]any{
		"format": evaluationOwnerStateListResponseFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": serviceKind, "operation": operation, "cursor": nil,
		"states": states, "stateSetDigest": stateSetDigest, "nextCursor": nextCursor,
	}
	if cursor != "" {
		response["cursor"] = cursor
	}
	responseDigest, err := evaluationOwnerStateResponseDigest(response)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response["responseDigest"] = responseDigest
	writeEvaluationServiceJSON(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationOwnerStateGet(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	ownerStateID string,
	repository evaluationOwnerStateReadRepository,
) {
	query, err := evaluationServiceQuery(request, "serviceKind", "operation")
	serviceKind, operation := query.Get("serviceKind"), query.Get("operation")
	if err != nil || !evaluationOwnerStateReadPurpose(serviceKind, operation) ||
		!evaluationDigestPattern.MatchString(ownerStateID) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	record, err := repository.GetEvaluationOwnerState(
		request.Context(), handler.authority, partition, serviceKind, ownerStateID,
	)
	if err != nil || validateEvaluationOwnerStateReadRecord(handler.authority, partition, serviceKind, record) != nil {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	if len(record.BundleBytes) == 0 || len(record.BundleBytes) > evaluationOwnerStateMaximumBytes(serviceKind) {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if err := handler.scanEvaluationOwnerStateBytes(
		request, serviceKind, operation, ownerStateID, record.BundleBytes,
	); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	bundle, root, err := decodeEvaluationOwnerStateBundle(
		record.BundleBytes, serviceKind, handler.authority.NamespaceID, partition, ownerStateID,
		record.Revision, evaluationOwnerStatePreviousRoot(record.BundleBytes),
	)
	if err != nil || root != record.RootDigest {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	snapshot, _ := objectMember(bundle, "snapshot")
	if stringMember(snapshot, "snapshotDigest") != record.SnapshotDigest ||
		stringMember(snapshot, "state") != record.SnapshotState {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	response := map[string]any{
		"format": evaluationOwnerStateReadResponseFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": serviceKind, "operation": operation, "ownerStateId": ownerStateID,
		"ownerStateRevision": record.Revision, "ownerStateRootDigest": record.RootDigest,
		"snapshotKind": record.SnapshotKind, "snapshotDigest": record.SnapshotDigest,
		"snapshotState": record.SnapshotState, "ownerStateBundle": bundle,
		"updatedAt": evaluationExportInstant(record.UpdatedAt),
	}
	responseDigest, err := evaluationOwnerStateResponseDigest(response)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response["responseDigest"] = responseDigest
	writeEvaluationServiceJSON(writer, http.StatusOK, response)
}
