package agent

import (
	"context"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationCapabilityProbeProviderResourceCleanupArchiveRecord struct {
	RepositoryCommit                  string
	ResourceRegistrationRequestDigest string
	CleanupReceiptDigest              string
	RecordDigest                      string
	RecordBytes                       []byte
}

func queryEvaluationCapabilityProbeProviderResourceCleanupArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCapabilityProbeProviderResourceCleanupArchiveRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT
		c.repository_commit,c.resource_registration_request_digest,c.cleanup_request_digest,
		c.deletion_authority_receipt_digest,c.owner_implementation_digest,c.stage_digest,
		c.owner_admission_digest,c.dispatch_ack_digest,c.result_ingress_digest,
		c.result_ingress_receipt_digest,c.cleanup_receipt_digest,c.response_digest,
		c.request_bytes,d.receipt_bytes,r.receipt_bytes,c.response_bytes
	FROM agent_evaluation_capability_probe_provider_resource_cleanups c
	JOIN agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts d
	  ON d.namespace_id=c.namespace_id AND d.repository_commit=c.repository_commit
	 AND d.request_digest=c.resource_registration_request_digest
	 AND d.deletion_authority_receipt_digest=c.deletion_authority_receipt_digest
	JOIN agent_evaluation_capability_probe_provider_resource_cleanup_receipts r
	  ON r.namespace_id=c.namespace_id AND r.repository_commit=c.repository_commit
	 AND r.cleanup_request_digest=c.cleanup_request_digest
	 AND r.cleanup_receipt_digest=c.cleanup_receipt_digest
	WHERE c.namespace_id=$1 AND c.repository_commit=$2 AND c.state='sealed' AND c.v46_eligible
	ORDER BY c.repository_commit COLLATE "C",c.resource_registration_request_digest COLLATE "C" LIMIT 5`,
		authority.NamespaceID, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationCapabilityProbeProviderResourceCleanupArchiveRecord, 0, 4)
	var totalBytes int64
	for rows.Next() {
		var repositoryCommit, registrationDigest, cleanupRequestDigest, deletionDigest string
		var ownerImplementationDigest, stageDigest, ownerAdmissionDigest, dispatchAckDigest string
		var resultIngressDigest, resultIngressReceiptDigest, cleanupReceiptDigest, responseDigest string
		var requestBytes, deletionBytes, cleanupReceiptBytes, responseBytes []byte
		if err := rows.Scan(
			&repositoryCommit, &registrationDigest, &cleanupRequestDigest, &deletionDigest,
			&ownerImplementationDigest, &stageDigest, &ownerAdmissionDigest, &dispatchAckDigest,
			&resultIngressDigest, &resultIngressReceiptDigest, &cleanupReceiptDigest, &responseDigest,
			&requestBytes, &deletionBytes, &cleanupReceiptBytes, &responseBytes,
		); err != nil {
			return nil, err
		}
		request, requestErr := decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(requestBytes)
		deletionReceipt, deletionCanonical, deletionErr :=
			decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceiptBytes(deletionBytes)
		cleanupValue, cleanupValueErr := decodeCanonicalEvaluationObject(
			cleanupReceiptBytes, maximumEvaluationCapabilityProbeProviderResourceCleanupReceiptBytes,
		)
		cleanupReceipt, cleanupErr := decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(
			cleanupValue, deletionReceipt,
		)
		responseValue, responseErr := decodeCanonicalEvaluationObject(
			responseBytes, maximumEvaluationCapabilityProbeProviderResourceCleanupResponseBytes,
		)
		lifecycle := EvaluationCapabilityProbeProviderResourceCleanupRecord{
			NamespaceID: authority.NamespaceID, RepositoryCommit: repositoryCommit,
			CleanupRequestDigest: cleanupRequestDigest, ResourceRegistrationRequestDigest: registrationDigest,
			DeletionAuthorityReceiptDigest: deletionDigest, State: "sealed", ClaimGeneration: 1,
			OwnerImplementationDigest: ownerImplementationDigest, AuthorityIssuerID: authority.PrincipalID,
			StageDigest: stageDigest, CleanupReceiptDigest: cleanupReceiptDigest,
			OwnerAdmissionDigest: ownerAdmissionDigest, DispatchAckDigest: dispatchAckDigest,
			ResultIngressDigest: resultIngressDigest, ResultIngressReceiptDigest: resultIngressReceiptDigest,
			ResponseDigest: responseDigest, RequestBytes: requestBytes,
			DeletionAuthorityReceiptBytes: deletionCanonical, CleanupReceiptBytes: cleanupReceiptBytes,
			ResponseBytes: responseBytes, V46Eligible: true,
		}
		if requestErr != nil || deletionErr != nil || cleanupValueErr != nil || cleanupErr != nil || responseErr != nil ||
			repositoryCommit != partition.RepositoryCommit || registrationDigest != request.ResourceRegistrationRequestDigest ||
			cleanupRequestDigest != request.CleanupRequestDigest || deletionDigest != request.DeletionAuthorityReceiptDigest ||
			cleanupReceiptDigest != cleanupReceipt.CleanupReceiptDigest ||
			validateEvaluationCapabilityProbeProviderResourceCleanupResponse(
				responseBytes, request, lifecycle, deletionReceipt,
			) != nil {
			return nil, ErrConflict
		}
		base := map[string]any{
			"format":                            evaluationCapabilityProbeProviderResourceCleanupArchiveRecordFormat,
			"version":                           evaluationCapabilityProbeProviderResourceCleanupVersion,
			"repositoryCommit":                  repositoryCommit,
			"resourceRegistrationRequestDigest": registrationDigest,
			"cleanupRequestDigest":              cleanupRequestDigest,
			"deletionAuthorityReceiptDigest":    deletionDigest,
			"ownerImplementationDigest":         ownerImplementationDigest,
			"stageDigest":                       stageDigest,
			"ownerAdmissionDigest":              ownerAdmissionDigest,
			"dispatchAckDigest":                 dispatchAckDigest,
			"resultIngressDigest":               resultIngressDigest,
			"resultIngressReceiptDigest":        resultIngressReceiptDigest,
			"cleanupReceiptDigest":              cleanupReceiptDigest,
			"cleanupRequest":                    request.Value,
			"deletionAuthorityReceipt":          deletionReceipt,
			"cleanupReceipt":                    cleanupReceipt.Value,
			"cleanupResponse":                   responseValue,
		}
		recordDigest, digestErr := canonicaljson.Digest(base)
		value := cloneEvaluationObject(base)
		value["recordDigest"] = recordDigest
		recordBytes, bytesErr := canonicaljson.Bytes(value)
		if digestErr != nil || bytesErr != nil || len(recordBytes) > maximumEvaluationCapabilityProbeProviderResourceCleanupArchiveBytes {
			return nil, ErrConflict
		}
		totalBytes += int64(len(recordBytes))
		if totalBytes > maximumEvaluationCapabilityProbeProviderResourceCleanupArchiveFamily {
			return nil, ErrConflict
		}
		records = append(records, EvaluationCapabilityProbeProviderResourceCleanupArchiveRecord{
			RepositoryCommit: repositoryCommit, ResourceRegistrationRequestDigest: registrationDigest,
			CleanupReceiptDigest: cleanupReceiptDigest, RecordDigest: recordDigest, RecordBytes: recordBytes,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) != 4 {
		return nil, ErrConflict
	}
	return records, nil
}

func validateEvaluationCapabilityProbeProviderResourceCleanupArchivePlan(
	plan evaluationPlanFact,
	records []EvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
) error {
	targets, ok := arrayMember(plan.Value, "capabilityQualificationTargets")
	if !ok {
		return ErrConflict
	}
	expected := make(map[string]map[string]any, 4)
	for _, rawTarget := range targets {
		target, targetOK := rawTarget.(map[string]any)
		authority, authorityOK := objectMember(target, "optionalCapabilitySupportAuthority")
		cleanup, cleanupOK := objectMember(authority, "probeProviderResourceCleanupReceipt")
		if !targetOK || !authorityOK || !cleanupOK {
			continue
		}
		digest := stringMember(cleanup, "cleanupReceiptDigest")
		if !evaluationDigestPattern.MatchString(digest) {
			return ErrConflict
		}
		if _, duplicate := expected[digest]; duplicate {
			return ErrConflict
		}
		expected[digest] = cleanup
	}
	if len(expected) != 4 || len(records) != 4 {
		return ErrConflict
	}
	for _, record := range records {
		cleanup, ok := expected[record.CleanupReceiptDigest]
		value, err := decodeCanonicalEvaluationObject(record.RecordBytes, maximumEvaluationCapabilityProbeProviderResourceCleanupArchiveBytes)
		if !ok || err != nil || !sameEvaluationCanonicalValue(cleanup, value["cleanupReceipt"]) {
			return ErrConflict
		}
		delete(expected, record.CleanupReceiptDigest)
	}
	if len(expected) != 0 {
		return ErrConflict
	}
	return nil
}

func evaluationCapabilityProbeProviderResourceCleanupArchiveRoot(
	records []EvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
) (string, error) {
	digests := make([]string, len(records))
	for index, record := range records {
		digests[index] = record.RecordDigest
	}
	sort.Strings(digests)
	values := make([]any, len(digests))
	for index, digest := range digests {
		values[index] = digest
	}
	return canonicaljson.Digest(map[string]any{"recordDigests": values})
}
