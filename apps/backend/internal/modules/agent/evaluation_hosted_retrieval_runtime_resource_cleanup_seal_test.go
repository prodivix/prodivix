package agent

import (
	"bytes"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestHostedRetrievalRuntimeResourceCleanupACKReplayPreservesClaimSourcePurpose(t *testing.T) {
	completedAt := time.Date(2026, 8, 12, 6, 7, 8, 0, time.UTC)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database), Clock: func() time.Time { return completedAt.Add(time.Second) },
	})
	if err != nil {
		t.Fatal(err)
	}
	receipt := evaluationHostedRetrievalRuntimeResourceCleanupReceipt{
		PlanDigest:      "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		AuthorityDigest: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		CompletedAt:     completedAt,
		Canonical:       []byte(`{"fixture":"stored-cleanup-receipt"}`),
	}
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT cleanup.cleanup_receipt_bytes,claim.claim_source`).
		WithArgs(evaluationServiceTestNamespace, receipt.PlanDigest, receipt.AuthorityDigest).
		WillReturnRows(sqlmock.NewRows([]string{"cleanup_receipt_bytes", "claim_source"}).
			AddRow(receipt.Canonical, "post-matrix"))
	mock.ExpectRollback()

	_, replay, err := owner.StoreCleanupReceipt(t.Context(), EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: evaluationServiceTestNamespace,
	}, evaluationHostedRetrievalRuntimeResourceRecoveryCleanupExecutePurpose, receipt)
	if !errors.Is(err, ErrConflict) || replay {
		t.Fatalf("cross-purpose replay=(%v, %v), want conflict and replay=false", replay, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHostedRetrievalRuntimeResourceCleanupClaimRejectsExpiredFirstDeliveryAfterReplayMiss(t *testing.T) {
	claimedAt := time.Date(2026, 8, 12, 7, 8, 9, 0, time.UTC)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database), Clock: func() time.Time { return claimedAt.Add(15 * time.Minute) },
	})
	if err != nil {
		t.Fatal(err)
	}
	source := evaluationHostedRetrievalRuntimeResourceCleanupClaimSource{
		ClaimSource: "post-matrix", NamespaceID: evaluationServiceTestNamespace,
		ClaimedAt: claimedAt, RequestDigest: "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		RequestCanonical: []byte(`{"fixture":"expired-first-delivery"}`),
	}
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT request.request_bytes,receipt.receipt_bytes FROM agent_evaluation_hosted_retrieval_runtime_resource_post_matrix_cleanup_claim_requests`).
		WithArgs(source.NamespaceID, source.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"request_bytes", "receipt_bytes"}))
	mock.ExpectRollback()

	_, replay, err := owner.claimCleanup(t.Context(), EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: evaluationServiceTestNamespace,
	}, source)
	if !errors.Is(err, ErrConflict) || replay {
		t.Fatalf("expired first delivery=(%v, %v), want conflict and replay=false", replay, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHostedRetrievalRuntimeResourceCleanupResultPendingReplayThenNewRequestObservesCleaned(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	namespaceID := "evaluation.hosted-cleanup-result-test"
	records, _ := evaluationHostedArchiveTestFamily(t, plan, namespaceID)
	record := records[0]
	cleanupValue, ok := objectMember(record.value, "cleanupReceipt")
	if !ok {
		t.Fatal("cleanup archive fixture lost its cleanup receipt")
	}
	cleanupBytes, err := canonicaljson.Bytes(cleanupValue)
	if err != nil {
		t.Fatal(err)
	}
	cleanupRequestDigest := stringMember(record.value, "cleanupRequestDigest")
	outerClaimReceiptDigest := evaluationHostedArchiveTestDigest(t, "cleanup-result.outer-claim")

	newRequest := func(requestedAt time.Time) evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest {
		t.Helper()
		base := map[string]any{
			"format":                     evaluationHostedRetrievalRuntimeResourceCleanupResultReadRequestFormat,
			"version":                    evaluationHostedRetrievalRuntimeResourceVersion,
			"namespaceId":                namespaceID,
			"purpose":                    evaluationHostedRetrievalRuntimeResourceRecoveryCleanupResultReadPurpose,
			"authorityDigest":            record.AuthorityDigest,
			"cleanupRequestDigest":       cleanupRequestDigest,
			"recoveryClaimReceiptDigest": outerClaimReceiptDigest,
			"requestedAt":                evaluationExportInstant(requestedAt),
		}
		_, requestBytes, createErr := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(base, "requestDigest")
		if createErr != nil {
			t.Fatal(createErr)
		}
		request, decodeErr := decodeEvaluationHostedRetrievalRuntimeResourceCleanupResultReadRequest(requestBytes)
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		return request
	}

	readAt := time.Date(2026, 8, 11, 0, 13, 30, 0, time.UTC)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database), Clock: func() time.Time { return readAt },
	})
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: namespaceID,
	}
	pendingRequest := newRequest(readAt)

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT request.request_bytes,receipt.receipt_bytes`).
		WithArgs(namespaceID, pendingRequest.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"request_bytes", "receipt_bytes"}))
	mock.ExpectQuery(`SELECT claim.claim_source,claim.plan_digest,claim.repository_commit`).
		WithArgs(namespaceID, record.AuthorityDigest, cleanupRequestDigest, outerClaimReceiptDigest).
		WillReturnRows(sqlmock.NewRows([]string{"claim_source", "plan_digest", "repository_commit"}).
			AddRow("recovery", plan.PlanDigest, plan.RepositoryCommit))
	mock.ExpectExec(`INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT cleanup.cleanup_receipt_bytes,archive.record_bytes`).
		WithArgs(namespaceID, plan.PlanDigest, plan.RepositoryCommit, record.AuthorityDigest, cleanupRequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"cleanup_receipt_bytes", "record_bytes"}))
	mock.ExpectExec(`INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	pendingBytes, err := owner.ReadCleanupResult(t.Context(), authority, pendingRequest)
	if err != nil {
		t.Fatal(err)
	}
	pending, err := decodeCanonicalEvaluationObject(
		pendingBytes, evaluationHostedRetrievalRuntimeResourceCleanupResultReadReceiptMaxBytes,
	)
	if err != nil || stringMember(pending, "status") != "pending" || pending["cleanupReceipt"] != nil ||
		pending["cleanupArchiveRecord"] != nil || pending["residualProviderResourceIds"] != nil {
		t.Fatalf("pending cleanup result drifted: value=%v err=%v", pending, err)
	}

	readAt = readAt.Add(2 * time.Minute)
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT request.request_bytes,receipt.receipt_bytes`).
		WithArgs(namespaceID, pendingRequest.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"request_bytes", "receipt_bytes"}).
			AddRow(pendingRequest.Canonical, pendingBytes))
	mock.ExpectCommit()
	replayedPending, err := owner.ReadCleanupResult(t.Context(), authority, pendingRequest)
	if err != nil || !bytes.Equal(replayedPending, pendingBytes) {
		t.Fatalf("pending replay changed after cleanup: equal=%v err=%v", bytes.Equal(replayedPending, pendingBytes), err)
	}

	cleanedRequest := newRequest(readAt)
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT request.request_bytes,receipt.receipt_bytes`).
		WithArgs(namespaceID, cleanedRequest.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"request_bytes", "receipt_bytes"}))
	mock.ExpectQuery(`SELECT claim.claim_source,claim.plan_digest,claim.repository_commit`).
		WithArgs(namespaceID, record.AuthorityDigest, cleanupRequestDigest, outerClaimReceiptDigest).
		WillReturnRows(sqlmock.NewRows([]string{"claim_source", "plan_digest", "repository_commit"}).
			AddRow("recovery", plan.PlanDigest, plan.RepositoryCommit))
	mock.ExpectExec(`INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_requests`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT cleanup.cleanup_receipt_bytes,archive.record_bytes`).
		WithArgs(namespaceID, plan.PlanDigest, plan.RepositoryCommit, record.AuthorityDigest, cleanupRequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"cleanup_receipt_bytes", "record_bytes"}).
			AddRow(cleanupBytes, record.RecordBytes))
	mock.ExpectExec(`INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_cleanup_result_read_receipts`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	cleanedBytes, err := owner.ReadCleanupResult(t.Context(), authority, cleanedRequest)
	if err != nil {
		t.Fatal(err)
	}
	cleaned, err := decodeCanonicalEvaluationObject(
		cleanedBytes, evaluationHostedRetrievalRuntimeResourceCleanupResultReadReceiptMaxBytes,
	)
	cleanedReceipt, receiptOK := objectMember(cleaned, "cleanupReceipt")
	cleanedArchive, archiveOK := objectMember(cleaned, "cleanupArchiveRecord")
	residual, residualOK := cleaned["residualProviderResourceIds"].([]any)
	if err != nil || stringMember(cleaned, "status") != "cleaned" || !receiptOK || !archiveOK ||
		!residualOK || len(residual) != 0 ||
		stringMember(cleanedReceipt, "cleanupReceiptDigest") != record.CleanupReceiptDigest ||
		stringMember(cleanedArchive, "recordDigest") != record.RecordDigest {
		t.Fatalf("new cleanup result request did not observe cleaned state: value=%v err=%v", cleaned, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
