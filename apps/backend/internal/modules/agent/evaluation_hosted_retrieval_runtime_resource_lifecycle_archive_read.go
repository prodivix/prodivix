package agent

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequestFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-archive-read-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPageFormat    = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-archive-read-page"
	evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPurpose       = "hosted-retrieval-runtime-resource.lifecycle-journal.records.recovery.read"
	evaluationHostedRetrievalRuntimeResourceLifecycleArchiveCursorPrefix      = "hosted-lifecycle-archive-cursor."
)

var evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequestKeys = []string{
	"format", "version", "purpose", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "lifecycleOwnerInstanceId", "pageSize", "cursor",
	"requestedAt", "minimumSnapshotExpiresAt", "requestDigest",
}

type evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	LifecycleOwnerInstanceID       string
	PageSize                       int64
	AfterArchiveRecordDigest       string
	RequestedAt                    time.Time
	MinimumSnapshotExpiresAt       time.Time
	RequestDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest{}, ErrInvalid
	}
	pageSize, pageSizeOK := integerMember(value, "pageSize")
	requestedAt, requestedErr := evaluationInstant(value["requestedAt"], "requestedAt")
	minimumExpiresAt, expiresErr := evaluationInstant(value["minimumSnapshotExpiresAt"], "minimumSnapshotExpiresAt")
	result := evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest{
		NamespaceID: stringMember(value, "namespaceId"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		PlanDigest: stringMember(value, "planDigest"), FrozenRunDigest: stringMember(value, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID:           stringMember(value, "runtimeResourceSetId"),
		LifecycleOwnerInstanceID:       stringMember(value, "lifecycleOwnerInstanceId"), PageSize: pageSize,
		RequestedAt: requestedAt, MinimumSnapshotExpiresAt: minimumExpiresAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if !pageSizeOK || pageSize < 1 || pageSize > 8 || requestedErr != nil || expiresErr != nil ||
		!minimumExpiresAt.After(requestedAt) || minimumExpiresAt.Sub(requestedAt) > evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime ||
		!validEvaluationAgentControlIdentity(result.NamespaceID) || !validEvaluationAgentControlIdentity(result.RuntimeResourceSetID) ||
		!validEvaluationAgentControlIdentity(result.LifecycleOwnerInstanceID) || !evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!evaluationHostedArchiveDigestMembers(value, "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest{}, ErrInvalid
	}
	if value["cursor"] != nil {
		cursor, ok := value["cursor"].(string)
		if !ok || !strings.HasPrefix(cursor, evaluationHostedRetrievalRuntimeResourceLifecycleArchiveCursorPrefix) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest{}, ErrInvalid
		}
		hexDigest := strings.TrimPrefix(cursor, evaluationHostedRetrievalRuntimeResourceLifecycleArchiveCursorPrefix)
		result.AfterArchiveRecordDigest = "sha256-" + hexDigest
		if !evaluationDigestPattern.MatchString(result.AfterArchiveRecordDigest) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest{}, ErrInvalid
		}
	}
	return result, nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) ReadLifecycleArchive(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest,
) ([]byte, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || request.NamespaceID != authority.NamespaceID ||
		request.LifecycleOwnerInstanceID != owner.lifecycleOwnerInstanceID {
		return nil, errEvaluationServiceUnavailable
	}
	snapshotAt := owner.clock().UTC().Truncate(time.Millisecond)
	if snapshotAt.Before(request.RequestedAt) {
		return nil, ErrConflict
	}
	expiresAt := snapshotAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime)
	if expiresAt.Before(request.MinimumSnapshotExpiresAt) {
		return nil, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var revision int64
	if err := tx.QueryRowContext(ctx, `SELECT ledger_revision
		FROM ae_hrrr_owner_ledgers
		WHERE namespace_id=$1 FOR SHARE`, authority.NamespaceID).Scan(&revision); err != nil || revision < 1 {
		return nil, ErrConflict
	}
	rows, err := tx.QueryContext(ctx, `SELECT archive_record_digest,record_bytes
		FROM ae_hrrr_lifecycle_journal_archives
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND runtime_resource_set_id=$4
		  AND archive_record_digest>$5 AND v46_eligible
		ORDER BY archive_record_digest COLLATE "C" LIMIT $6`, authority.NamespaceID, request.PlanDigest,
		request.RepositoryCommit, request.RuntimeResourceSetID, request.AfterArchiveRecordDigest, request.PageSize+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]any, 0, request.PageSize)
	digests := make([]any, 0, request.PageSize)
	hasMore := false
	for rows.Next() {
		var digest string
		var recordBytes []byte
		if err := rows.Scan(&digest, &recordBytes); err != nil {
			return nil, err
		}
		if int64(len(records)) == request.PageSize {
			hasMore = true
			break
		}
		decodedRecord, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord(recordBytes)
		if err != nil || decodedRecord.ArchiveRecordDigest != digest ||
			decodedRecord.NamespaceID != request.NamespaceID || decodedRecord.RepositoryCommit != request.RepositoryCommit ||
			decodedRecord.PlanDigest != request.PlanDigest || decodedRecord.FrozenRunDigest != request.FrozenRunDigest ||
			decodedRecord.RunConfigArtifactBindingDigest != request.RunConfigArtifactBindingDigest ||
			decodedRecord.RuntimeResourceSetID != request.RuntimeResourceSetID {
			return nil, ErrConflict
		}
		records = append(records, decodedRecord.Value)
		digests = append(digests, digest)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	allDigestValues := make([]any, 0)
	allRows, err := tx.QueryContext(ctx, `SELECT archive_record_digest
		FROM ae_hrrr_lifecycle_journal_archives
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND runtime_resource_set_id=$4 AND v46_eligible
		ORDER BY archive_record_digest COLLATE "C"`, authority.NamespaceID, request.PlanDigest,
		request.RepositoryCommit, request.RuntimeResourceSetID)
	if err != nil {
		return nil, err
	}
	for allRows.Next() {
		var digest string
		if err := allRows.Scan(&digest); err != nil {
			_ = allRows.Close()
			return nil, err
		}
		allDigestValues = append(allDigestValues, digest)
	}
	if err := allRows.Close(); err != nil {
		return nil, err
	}
	archiveRootDigest, err := canonicaljson.Digest(map[string]any{"recordDigests": allDigestValues})
	if err != nil {
		return nil, err
	}
	nextCursor := any(nil)
	if hasMore && len(digests) > 0 {
		last := digests[len(digests)-1].(string)
		nextCursor = evaluationHostedRetrievalRuntimeResourceLifecycleArchiveCursorPrefix + strings.TrimPrefix(last, "sha256-")
	}
	snapshotDigest, err := canonicaljson.Digest(map[string]any{
		"namespaceId": authority.NamespaceID, "planDigest": request.PlanDigest,
		"repositoryCommit": request.RepositoryCommit, "runtimeResourceSetId": request.RuntimeResourceSetID,
		"snapshotRevision": revision, "snapshotAt": evaluationExportInstant(snapshotAt),
	})
	if err != nil {
		return nil, err
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest()
	if err != nil {
		return nil, err
	}
	base := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleArchiveReadPageFormat, "version": int64(1),
		"request": request.Value, "requestDigest": request.RequestDigest,
		"recoveryAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID,
		"recoveryAuthorityImplementationDigest": implementationDigest,
		"snapshotId":                            "hosted-lifecycle-archive-snapshot." + strings.TrimPrefix(snapshotDigest, "sha256-"),
		"snapshotRevision":                      revision, "snapshotAt": evaluationExportInstant(snapshotAt),
		"expiresAt": evaluationExportInstant(expiresAt), "archiveRecords": records,
		"archiveRecordDigests": digests, "nextCursor": nextCursor,
		"rollingJournalSetDigest": archiveRootDigest, "archiveRootDigest": archiveRootDigest,
	}
	pageDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	page := cloneEvaluationObject(base)
	page["pageDigest"] = pageDigest
	encoded, err := canonicaljson.Bytes(page)
	if err != nil || len(encoded) > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes {
		return nil, fmt.Errorf("%w: lifecycle archive page exceeds its raw bound", ErrConflict)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return encoded, nil
}
