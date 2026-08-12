package agent

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestEvaluationCapabilityProbeProviderResourceCleanupArchiveRecomputesExactFourLifecycleRecords(t *testing.T) {
	for _, tamperResponse := range []bool{false, true} {
		name := "exact"
		if tamperResponse {
			name = "response swap"
		}
		t.Run(name, func(t *testing.T) {
			vector := readEvaluationRepositoryVector(t)
			plan, err := decodeEvaluationPlan(vector.Facts.Plan)
			if err != nil {
				t.Fatal(err)
			}
			authority := EvaluationAuthority{
				Kind: "service", PrincipalID: "evaluation.probe-cleanup-archive-test",
				NamespaceID: "evaluation.probe-cleanup-archive-test",
			}
			admissions := evaluationCapabilityProbePlanTestAdmissions(t, &plan, authority)
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			rows := sqlmock.NewRows([]string{
				"repository_commit", "resource_registration_request_digest", "cleanup_request_digest",
				"deletion_authority_receipt_digest", "owner_implementation_digest", "stage_digest",
				"owner_admission_digest", "dispatch_ack_digest", "result_ingress_digest",
				"result_ingress_receipt_digest", "cleanup_receipt_digest", "response_digest",
				"request_bytes", "deletion_receipt_bytes", "cleanup_receipt_bytes", "response_bytes",
			})
			cleanupCount := 0
			for _, admission := range admissions {
				if admission.resourceCleanup == nil || admission.resourceResult == nil {
					continue
				}
				cleanup := admission.resourceCleanup
				deletionBytes, err := canonicaljson.Bytes(admission.resourceResult.DeletionAuthorityReceipt)
				if err != nil {
					t.Fatal(err)
				}
				responseBytes := cleanup.responseBytes
				if tamperResponse && cleanupCount == 0 {
					responseValue, err := decodeCanonicalEvaluationObject(
						responseBytes, maximumEvaluationCapabilityProbeProviderResourceCleanupResponseBytes,
					)
					if err != nil {
						t.Fatal(err)
					}
					responseValue["ownerAdmissionDigest"] = evaluationServiceTestDigest(t, "cleanup-archive-swap")
					responseBytes, err = canonicaljson.Bytes(responseValue)
					if err != nil {
						t.Fatal(err)
					}
				}
				rows.AddRow(
					plan.RepositoryCommit, admission.resourceRequest.RequestDigest, cleanup.request.CleanupRequestDigest,
					admission.resourceResult.DeletionAuthorityReceiptDigest, cleanup.ownerImplementationDigest,
					cleanup.stageDigest, cleanup.ownerAdmissionDigest, cleanup.dispatchAckDigest,
					cleanup.resultIngressDigest, cleanup.resultIngressReceiptDigest, cleanup.receipt.CleanupReceiptDigest,
					cleanup.responseDigest, cleanup.request.Bytes, deletionBytes, cleanup.receipt.Bytes, responseBytes,
				)
				cleanupCount++
			}
			if cleanupCount != 4 {
				t.Fatalf("cleanup fixtures=%d, want 4", cleanupCount)
			}
			mock.ExpectQuery(`SELECT\s+c.repository_commit`).
				WithArgs(authority.NamespaceID, plan.RepositoryCommit).
				WillReturnRows(rows)
			partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
			records, queryErr := queryEvaluationCapabilityProbeProviderResourceCleanupArchiveRecords(
				context.Background(), database, authority, partition,
			)
			if tamperResponse {
				if queryErr == nil {
					t.Fatal("cleanup archive accepted a recomputed outer response swap")
				}
				return
			}
			if queryErr != nil || len(records) != 4 {
				t.Fatalf("cleanup archive records=%d err=%v", len(records), queryErr)
			}
			if err := validateEvaluationCapabilityProbeProviderResourceCleanupArchivePlan(plan, records); err != nil {
				t.Fatal(err)
			}
			root, err := evaluationCapabilityProbeProviderResourceCleanupArchiveRoot(records)
			if err != nil || !evaluationDigestPattern.MatchString(root) {
				t.Fatalf("cleanup archive root=%s err=%v", root, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
