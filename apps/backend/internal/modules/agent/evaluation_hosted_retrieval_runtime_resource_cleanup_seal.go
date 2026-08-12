package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationHostedRetrievalRuntimeResourceClaimSourceMatchesPurpose(claimSource, purpose string) bool {
	return (claimSource == "post-matrix" && oneOfString(purpose,
		evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupExecutePurpose,
		evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupResultReadPurpose)) ||
		(claimSource == "recovery" && oneOfString(purpose,
			evaluationHostedRetrievalRuntimeResourceRecoveryCleanupExecutePurpose,
			evaluationHostedRetrievalRuntimeResourceRecoveryCleanupResultReadPurpose))
}

func (owner *EvaluationHostedRetrievalRuntimeResource) StoreCleanupReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	purpose string,
	receipt evaluationHostedRetrievalRuntimeResourceCleanupReceipt,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || receipt.PlanDigest == "" {
		return nil, false, errEvaluationServiceUnavailable
	}
	observedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if observedAt.IsZero() {
		return nil, false, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()

	var existing []byte
	var existingClaimSource string
	err = tx.QueryRowContext(ctx, `SELECT cleanup.cleanup_receipt_bytes,claim.claim_source
		FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanups cleanup
		JOIN agent_evaluation_hosted_retrieval_runtime_resources resource
		  ON resource.namespace_id=cleanup.namespace_id AND resource.plan_digest=cleanup.plan_digest
		 AND resource.repository_commit=cleanup.repository_commit AND resource.authority_digest=cleanup.authority_digest
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts claim
		  ON claim.namespace_id=resource.namespace_id
		 AND claim.receipt_digest=resource.current_cleanup_claim_receipt_digest
		WHERE cleanup.namespace_id=$1 AND cleanup.plan_digest=$2 AND cleanup.authority_digest=$3 FOR SHARE`,
		authority.NamespaceID, receipt.PlanDigest, receipt.AuthorityDigest).Scan(&existing, &existingClaimSource)
	if err == nil {
		if !bytes.Equal(existing, receipt.Canonical) ||
			!evaluationHostedRetrievalRuntimeResourceClaimSourceMatchesPurpose(existingClaimSource, purpose) {
			return nil, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if observedAt.Before(receipt.CompletedAt) {
		return nil, false, ErrConflict
	}

	var repositoryCommit, lifecycle, currentClaimReceiptDigest, currentCleanupRequestDigest, claimSource string
	var currentGeneration int64
	err = tx.QueryRowContext(ctx, `SELECT resource.repository_commit,resource.lifecycle,resource.claim_generation,
		resource.current_cleanup_claim_receipt_digest,resource.cleanup_request_digest,claim.claim_source
		FROM agent_evaluation_hosted_retrieval_runtime_resources resource
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts claim
		  ON claim.namespace_id=resource.namespace_id
		 AND claim.receipt_digest=resource.current_cleanup_claim_receipt_digest
		WHERE resource.namespace_id=$1 AND resource.plan_digest=$2 AND resource.authority_digest=$3 FOR UPDATE`,
		authority.NamespaceID, receipt.PlanDigest, receipt.AuthorityDigest).Scan(
		&repositoryCommit, &lifecycle, &currentGeneration, &currentClaimReceiptDigest,
		&currentCleanupRequestDigest, &claimSource,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, ErrNotFound
	}
	if err != nil {
		return nil, false, err
	}
	if lifecycle != "cleanup-in-progress" || currentGeneration != receipt.ClaimGeneration ||
		currentClaimReceiptDigest == "" || currentCleanupRequestDigest != receipt.CleanupRequestDigest ||
		!evaluationHostedRetrievalRuntimeResourceClaimSourceMatchesPurpose(claimSource, purpose) {
		return nil, false, ErrConflict
	}

	value := receipt.Value
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanups (
		namespace_id,plan_digest,repository_commit,authority_digest,cleanup_request_digest,cleanup_receipt_digest,
		resource_set_commitment_digest,read_lease_ledger_root_digest,cleanup_claim_authority_receipt_digest,
		deletion_authority_receipt_digest,run_terminal_fence_digest,cleanup_owner_instance_id,claim_generation,
		prior_active_state_digest,resource_result_set_digest,terminal_state_digest,completed_at,
		cleanup_receipt_json,cleanup_receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)`,
		authority.NamespaceID, receipt.PlanDigest, repositoryCommit, receipt.AuthorityDigest,
		receipt.CleanupRequestDigest, receipt.CleanupReceiptDigest,
		stringMember(value, "resourceSetCommitmentDigest"), stringMember(value, "readLeaseLedgerRootDigest"),
		receipt.CleanupClaimAuthorityReceiptDigest, stringMember(value, "deletionAuthorityReceiptDigest"),
		stringMember(value, "runTerminalFenceDigest"), receipt.CleanupOwnerInstanceID, receipt.ClaimGeneration,
		stringMember(value, "priorActiveStateDigest"), stringMember(value, "resourceResultSetDigest"),
		stringMember(value, "terminalStateDigest"), receipt.CompletedAt, string(receipt.Canonical), receipt.Canonical)
	if err != nil {
		return nil, false, err
	}

	terminalState := map[string]any{
		"format":  "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-state",
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "authorityDigest": receipt.AuthorityDigest,
		"cleanupRequestDigest": receipt.CleanupRequestDigest, "cleanupOwnerInstanceId": receipt.CleanupOwnerInstanceID,
		"claimGeneration":                    receipt.ClaimGeneration,
		"readLeaseLedgerRootDigest":          stringMember(value, "readLeaseLedgerRootDigest"),
		"cleanupClaimAuthorityReceiptDigest": receipt.CleanupClaimAuthorityReceiptDigest,
		"completedAt":                        evaluationExportInstant(receipt.CompletedAt), "lifecycle": "cleaned",
		"residualProviderResourceIds": []any{},
	}
	terminalStateBytes, err := canonicaljson.Bytes(terminalState)
	if err != nil || stringMember(value, "terminalStateDigest") == "" {
		return nil, false, ErrConflict
	}
	terminalStateDigest, err := canonicaljson.Digest(terminalState)
	if err != nil || terminalStateDigest != stringMember(value, "terminalStateDigest") {
		return nil, false, ErrConflict
	}
	updated, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_hosted_retrieval_runtime_resources SET
		lifecycle='cleaned',read_lease_not_after=NULL,current_state_digest=$8,current_state_json=$9::jsonb,
		current_state_bytes=$10,current_state_updated_at=$11,cleanup_receipt_digest=$12
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4
		  AND lifecycle='cleanup-in-progress' AND claim_generation=$5
		  AND current_cleanup_claim_receipt_digest=$6 AND cleanup_request_digest=$7`,
		authority.NamespaceID, receipt.PlanDigest, repositoryCommit, receipt.AuthorityDigest,
		receipt.ClaimGeneration, currentClaimReceiptDigest, receipt.CleanupRequestDigest,
		terminalStateDigest, string(terminalStateBytes), terminalStateBytes, receipt.CompletedAt, receipt.CleanupReceiptDigest)
	if err != nil {
		return nil, false, err
	}
	rows, err := updated.RowsAffected()
	if err != nil || rows != 1 {
		return nil, false, ErrConflict
	}

	var recordJSON, recordBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT record_json,record_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_archives
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND authority_digest=$4 FOR SHARE`,
		authority.NamespaceID, receipt.PlanDigest, repositoryCommit, receipt.AuthorityDigest).Scan(&recordJSON, &recordBytes)
	if err != nil {
		return nil, false, err
	}
	partition := EvaluationPlanPartition{PlanDigest: receipt.PlanDigest, RepositoryCommit: repositoryCommit}
	if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
		recordBytes, authority.NamespaceID, partition,
	); err != nil || !evaluationJSONColumnMatchesCanonical(recordJSON, recordBytes,
		maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes) {
		return nil, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return append([]byte(nil), receipt.Canonical...), false, nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) ReadCleanupResult(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest,
) ([]byte, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || request.NamespaceID != authority.NamespaceID {
		return nil, errEvaluationServiceUnavailable
	}
	readAt := owner.clock().UTC().Truncate(time.Millisecond)
	if readAt.IsZero() {
		return nil, ErrConflict
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable, ReadOnly: false})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var storedRequest, storedReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT request.request_bytes,receipt.receipt_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests request
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts receipt
		  ON receipt.namespace_id=request.namespace_id AND receipt.request_digest=request.request_digest
		WHERE request.namespace_id=$1 AND request.request_digest=$2 FOR SHARE`,
		authority.NamespaceID, request.RequestDigest).Scan(&storedRequest, &storedReceipt)
	if err == nil {
		if !bytes.Equal(storedRequest, request.Canonical) {
			return nil, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return storedReceipt, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if readAt.Before(request.RequestedAt) {
		return nil, ErrConflict
	}

	var claimSource, planDigest, repositoryCommit string
	err = tx.QueryRowContext(ctx, `SELECT claim.claim_source,claim.plan_digest,claim.repository_commit
		FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanup_claim_receipts claim
		WHERE claim.namespace_id=$1 AND claim.authority_digest=$2
		  AND claim.cleanup_request_digest=$3 AND claim.receipt_digest=$4 FOR SHARE`,
		authority.NamespaceID, request.AuthorityDigest, request.CleanupRequestDigest,
		request.RecoveryClaimReceiptDigest).Scan(&claimSource, &planDigest, &repositoryCommit)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if !evaluationHostedRetrievalRuntimeResourceClaimSourceMatchesPurpose(claimSource, request.Purpose) {
		return nil, ErrConflict
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests (
		namespace_id,authority_digest,cleanup_request_digest,recovery_claim_receipt_digest,request_digest,
		requested_at,request_json,request_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, authority.NamespaceID, request.AuthorityDigest,
		request.CleanupRequestDigest, request.RecoveryClaimReceiptDigest, request.RequestDigest,
		request.RequestedAt, string(request.Canonical), request.Canonical)
	if err != nil {
		return nil, err
	}

	status := "pending"
	var cleanupReceipt any
	var cleanupArchive any
	var residual any
	var cleanupBytes, archiveBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT cleanup.cleanup_receipt_bytes,archive.record_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_cleanups cleanup
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_cleanup_archives archive
		  ON archive.namespace_id=cleanup.namespace_id AND archive.plan_digest=cleanup.plan_digest
		 AND archive.repository_commit=cleanup.repository_commit AND archive.authority_digest=cleanup.authority_digest
		WHERE cleanup.namespace_id=$1 AND cleanup.plan_digest=$2 AND cleanup.repository_commit=$3
		  AND cleanup.authority_digest=$4 AND cleanup.cleanup_request_digest=$5 FOR SHARE`,
		authority.NamespaceID, planDigest, repositoryCommit, request.AuthorityDigest,
		request.CleanupRequestDigest).Scan(&cleanupBytes, &archiveBytes)
	if err == nil {
		decodedCleanup, decodeErr := decodeEvaluationHostedRetrievalRuntimeResourceCleanupReceipt(cleanupBytes)
		partition := EvaluationPlanPartition{PlanDigest: planDigest, RepositoryCommit: repositoryCommit}
		decodedArchive, archiveErr := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			archiveBytes, authority.NamespaceID, partition,
		)
		archiveValue, objectErr := decodeCanonicalEvaluationObject(
			archiveBytes, maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes,
		)
		if decodeErr != nil || archiveErr != nil || objectErr != nil ||
			decodedCleanup.CleanupRequestDigest != request.CleanupRequestDigest ||
			decodedArchive.CleanupReceiptDigest != decodedCleanup.CleanupReceiptDigest {
			return nil, ErrConflict
		}
		status = "cleaned"
		cleanupReceipt = decodedCleanup.Value
		cleanupArchive = archiveValue
		residual = []any{}
	} else if errors.Is(err, sql.ErrNoRows) {
		cleanupReceipt = nil
		cleanupArchive = nil
		residual = nil
	} else {
		return nil, err
	}
	receiptBase := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceCleanupResultReadReceiptFormat,
		"version": evaluationHostedRetrievalRuntimeResourceVersion, "requestDigest": request.RequestDigest,
		"status": status, "cleanupReceipt": cleanupReceipt, "cleanupArchiveRecord": cleanupArchive,
		"residualProviderResourceIds": residual, "readAt": evaluationExportInstant(readAt),
	}
	result, resultBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(receiptBase, "receiptDigest")
	if err != nil || len(resultBytes) > evaluationHostedRetrievalRuntimeResourceCleanupResultReadReceiptMaxBytes {
		return nil, ErrConflict
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts (
		namespace_id,request_digest,receipt_digest,status,read_at,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, authority.NamespaceID, request.RequestDigest,
		stringMember(result, "receiptDigest"), status, readAt, string(resultBytes), resultBytes)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return resultBytes, nil
}
