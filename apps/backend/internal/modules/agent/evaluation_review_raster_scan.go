package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"
)

const evaluationReviewRasterScanReceiptFactType = "evaluation-review-raster-scan-receipt"

type EvaluationReviewRasterScanReceiptRecord struct {
	NamespaceID               string
	PlanDigest                string
	RepositoryCommit          string
	ScanReceiptID             string
	AttemptID                 string
	DescriptorDigest          string
	ProjectionAuthorityDigest string
	MediaType                 string
	Width                     int64
	Height                    int64
	ByteLength                int64
	PolicyDigest              string
	BytesDigest               string
	DecodedPixelDigest        string
	MetadataProfileDigest     string
	CanarySetDigest           string
	FingerprintSetDigest      string
	FindingDigests            []string
	Verdict                   string
	ReceiptDigest             string
	ReceiptBytes              []byte
	ScannedAt                 time.Time
}

func decodeEvaluationReviewRasterScanReceipt(source []byte) (EvaluationReviewRasterScanReceiptRecord, error) {
	fact, err := decodeEvaluationFact(source, evaluationReviewRasterScanReceiptFactType)
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, err
	}
	width, widthOK := integerMember(fact.Value, "width")
	height, heightOK := integerMember(fact.Value, "height")
	byteLength, byteLengthOK := integerMember(fact.Value, "byteLength")
	if !widthOK || !heightOK || !byteLengthOK {
		return EvaluationReviewRasterScanReceiptRecord{}, ErrInvalid
	}
	scannedAt, err := instantMember(fact.Value, "scannedAt")
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, err
	}
	findingValues, ok := fact.Value["findingDigests"].([]any)
	if !ok {
		return EvaluationReviewRasterScanReceiptRecord{}, ErrInvalid
	}
	findings := make([]string, len(findingValues))
	for index, raw := range findingValues {
		findings[index], ok = raw.(string)
		if !ok {
			return EvaluationReviewRasterScanReceiptRecord{}, ErrInvalid
		}
	}
	return EvaluationReviewRasterScanReceiptRecord{
		PlanDigest: stringMember(fact.Value, "planDigest"), RepositoryCommit: stringMember(fact.Value, "repositoryCommit"),
		ScanReceiptID: stringMember(fact.Value, "scanReceiptId"), AttemptID: stringMember(fact.Value, "attemptId"),
		DescriptorDigest:          stringMember(fact.Value, "descriptorDigest"),
		ProjectionAuthorityDigest: stringMember(fact.Value, "projectionAuthorityDigest"),
		MediaType:                 stringMember(fact.Value, "mediaType"), Width: width, Height: height, ByteLength: byteLength,
		PolicyDigest: stringMember(fact.Value, "policyDigest"), BytesDigest: stringMember(fact.Value, "bytesDigest"),
		DecodedPixelDigest:    stringMember(fact.Value, "decodedPixelDigest"),
		MetadataProfileDigest: stringMember(fact.Value, "metadataProfileDigest"),
		CanarySetDigest:       stringMember(fact.Value, "canarySetDigest"),
		FingerprintSetDigest:  stringMember(fact.Value, "fingerprintSetDigest"),
		FindingDigests:        findings, Verdict: stringMember(fact.Value, "verdict"),
		ReceiptDigest: stringMember(fact.Value, "receiptDigest"), ReceiptBytes: fact.Canonical, ScannedAt: scannedAt,
	}, nil
}

func (repository *Repository) StoreEvaluationReviewRasterScanReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationReviewRasterScanReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationReviewRasterScanReceipt(receiptBytes)
	if err != nil || receipt.PlanDigest != partition.PlanDigest || receipt.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationReviewRasterScanReceiptRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, planRecord, _, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, false, err
	}
	attempts, err := queryEvaluationAttempts(writeContext, tx, authority.NamespaceID, partition, planRecord,
		" AND attempt_id = $4", receipt.AttemptID)
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, false, err
	}
	receipt.NamespaceID = authority.NamespaceID
	if err := validateEvaluationReviewRasterScanBindings(planRecord, attempts,
		[]EvaluationReviewRasterScanReceiptRecord{receipt}); err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_review_raster_scan_receipts (
		namespace_id, plan_digest, repository_commit, scan_receipt_id, attempt_id, descriptor_digest,
		projection_authority_digest, media_type, width, height, byte_length, policy_digest, bytes_digest,
		decoded_pixel_digest, metadata_profile_digest, canary_set_digest, fingerprint_set_digest,
		finding_count, verdict, receipt_digest, receipt_json, receipt_bytes, scanned_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22, $23)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.ScanReceiptID, receipt.AttemptID, receipt.DescriptorDigest, receipt.ProjectionAuthorityDigest,
		receipt.MediaType, receipt.Width, receipt.Height, receipt.ByteLength, receipt.PolicyDigest, receipt.BytesDigest,
		receipt.DecodedPixelDigest, receipt.MetadataProfileDigest, receipt.CanarySetDigest, receipt.FingerprintSetDigest,
		len(receipt.FindingDigests), receipt.Verdict, receipt.ReceiptDigest, string(receipt.ReceiptBytes),
		receipt.ReceiptBytes, receipt.ScannedAt)
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT receipt_bytes
			FROM agent_evaluation_review_raster_scan_receipts
			WHERE namespace_id = $1 AND ((plan_digest = $2 AND scan_receipt_id = $3) OR receipt_digest = $4)
			FOR SHARE`, authority.NamespaceID, partition.PlanDigest, receipt.ScanReceiptID, receipt.ReceiptDigest)
		if err != nil {
			return EvaluationReviewRasterScanReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing, receipt.ReceiptBytes) {
			return EvaluationReviewRasterScanReceiptRecord{}, false, conflict("evaluation review raster scan identity was reused with different immutable bytes")
		}
	}
	if err := commitEvaluationAuthenticityWrite(tx); err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, false, err
	}
	return receipt, replayed, nil
}

func (repository *Repository) GetEvaluationReviewRasterScanReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptDigest string,
) (EvaluationReviewRasterScanReceiptRecord, error) {
	if !evaluationDigestPattern.MatchString(receiptDigest) {
		return EvaluationReviewRasterScanReceiptRecord{}, ErrInvalid
	}
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	record, err := loadEvaluationReviewRasterScanReceiptByDigest(
		readContext, tx, authority.NamespaceID, partition, receiptDigest,
	)
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, err
	}
	attempts, err := queryEvaluationAttempts(
		readContext, tx, authority.NamespaceID, partition, plan, " AND attempt_id = $4", record.AttemptID,
	)
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, err
	}
	if err := validateEvaluationReviewRasterScanBindings(
		plan, attempts, []EvaluationReviewRasterScanReceiptRecord{record},
	); err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, err
	}
	return record, nil
}

func (repository *Repository) ListEvaluationReviewRasterScanReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationReviewRasterScanReceiptRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return nil, err
	}
	records, err := queryEvaluationReviewRasterScanReceipts(
		readContext, tx, authority.NamespaceID, partition, "",
	)
	if err != nil {
		return nil, err
	}
	if err := validateEvaluationReviewRasterScanBindings(plan, attempts, records); err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

type evaluationReviewRasterScanScanner interface {
	Scan(...any) error
}

func scanEvaluationReviewRasterScanReceipt(
	scanner evaluationReviewRasterScanScanner,
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationReviewRasterScanReceiptRecord, error) {
	var columns EvaluationReviewRasterScanReceiptRecord
	var source []byte
	var findingCount int64
	if err := scanner.Scan(
		&columns.ScanReceiptID, &columns.AttemptID, &columns.DescriptorDigest, &columns.ProjectionAuthorityDigest,
		&columns.MediaType, &columns.Width, &columns.Height, &columns.ByteLength, &columns.PolicyDigest,
		&columns.BytesDigest, &columns.DecodedPixelDigest, &columns.MetadataProfileDigest, &columns.CanarySetDigest,
		&columns.FingerprintSetDigest, &findingCount, &columns.Verdict, &columns.ReceiptDigest, &source, &columns.ScannedAt,
	); err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, err
	}
	decoded, err := decodeEvaluationReviewRasterScanReceipt(source)
	if err != nil {
		return EvaluationReviewRasterScanReceiptRecord{}, fmt.Errorf("decode persisted evaluation review raster scan receipt: %w", err)
	}
	decoded.NamespaceID = namespaceID
	if !bytes.Equal(source, decoded.ReceiptBytes) || decoded.PlanDigest != partition.PlanDigest ||
		decoded.RepositoryCommit != partition.RepositoryCommit || columns.ScanReceiptID != decoded.ScanReceiptID ||
		columns.AttemptID != decoded.AttemptID || columns.DescriptorDigest != decoded.DescriptorDigest ||
		columns.ProjectionAuthorityDigest != decoded.ProjectionAuthorityDigest || columns.MediaType != decoded.MediaType ||
		columns.Width != decoded.Width || columns.Height != decoded.Height || columns.ByteLength != decoded.ByteLength ||
		columns.PolicyDigest != decoded.PolicyDigest || columns.BytesDigest != decoded.BytesDigest ||
		columns.DecodedPixelDigest != decoded.DecodedPixelDigest || columns.MetadataProfileDigest != decoded.MetadataProfileDigest ||
		columns.CanarySetDigest != decoded.CanarySetDigest || columns.FingerprintSetDigest != decoded.FingerprintSetDigest ||
		findingCount != int64(len(decoded.FindingDigests)) || columns.Verdict != decoded.Verdict ||
		columns.ReceiptDigest != decoded.ReceiptDigest || !columns.ScannedAt.Equal(decoded.ScannedAt) {
		return EvaluationReviewRasterScanReceiptRecord{}, conflict("persisted evaluation review raster scan metadata drifted from canonical bytes")
	}
	return decoded, nil
}

const evaluationReviewRasterScanSelect = `SELECT scan_receipt_id, attempt_id, descriptor_digest,
	projection_authority_digest, media_type, width, height, byte_length, policy_digest, bytes_digest,
	decoded_pixel_digest, metadata_profile_digest, canary_set_digest, fingerprint_set_digest,
	finding_count, verdict, receipt_digest, receipt_bytes, scanned_at
	FROM agent_evaluation_review_raster_scan_receipts`

func queryEvaluationReviewRasterScanReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	condition string,
	args ...any,
) ([]EvaluationReviewRasterScanReceiptRecord, error) {
	queryArgs := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	queryArgs = append(queryArgs, args...)
	rows, err := queryer.QueryContext(ctx, evaluationReviewRasterScanSelect+`
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`+condition+`
	ORDER BY attempt_id COLLATE "C" ASC, scan_receipt_id COLLATE "C" ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationReviewRasterScanReceiptRecord, 0)
	seenIDs, seenDigests := map[string]struct{}{}, map[string]struct{}{}
	for rows.Next() {
		record, err := scanEvaluationReviewRasterScanReceipt(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		if _, exists := seenIDs[record.ScanReceiptID]; exists {
			return nil, conflict("evaluation review raster scan set contains duplicate identities")
		}
		if _, exists := seenDigests[record.ReceiptDigest]; exists {
			return nil, conflict("evaluation review raster scan set contains duplicate digests")
		}
		seenIDs[record.ScanReceiptID], seenDigests[record.ReceiptDigest] = struct{}{}, struct{}{}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		if records[left].AttemptID != records[right].AttemptID {
			return records[left].AttemptID < records[right].AttemptID
		}
		return records[left].ScanReceiptID < records[right].ScanReceiptID
	})
	return records, nil
}

func loadEvaluationReviewRasterScanReceiptByDigest(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	receiptDigest string,
) (EvaluationReviewRasterScanReceiptRecord, error) {
	row := queryer.QueryRowContext(ctx, evaluationReviewRasterScanSelect+`
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3 AND receipt_digest = $4`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, receiptDigest)
	record, err := scanEvaluationReviewRasterScanReceipt(row, namespaceID, partition)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationReviewRasterScanReceiptRecord{}, ErrNotFound
	}
	return record, err
}

func validateEvaluationReviewRasterScanBindings(
	planRecord EvaluationPlanRecord,
	attemptRecords []EvaluationAttemptRecord,
	receipts []EvaluationReviewRasterScanReceiptRecord,
) error {
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return err
	}
	attempts := make(map[string]evaluationAttemptFact, len(attemptRecords))
	for _, record := range attemptRecords {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return err
		}
		if _, duplicate := attempts[attempt.AttemptID]; duplicate {
			return conflict("evaluation review raster scan join contains duplicate attempts")
		}
		attempts[attempt.AttemptID] = attempt
	}
	eligibleCases := make(map[string]struct{})
	for _, raw := range plan.Value["concreteCases"].([]any) {
		evaluationCase := raw.(map[string]any)
		subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool)
		if subjective && stringMember(evaluationCase, "access") == "public" {
			eligibleCases[stringMember(evaluationCase, "caseId")] = struct{}{}
		}
	}
	for _, receipt := range receipts {
		attempt, exists := attempts[receipt.AttemptID]
		_, eligible := eligibleCases[attempt.CaseID]
		if !exists || !eligible || attempt.Status != "completed" || receipt.NamespaceID != planRecord.NamespaceID ||
			receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit ||
			receipt.DescriptorDigest != attempt.DescriptorDigest || receipt.ScannedAt.Before(attempt.CompletedAt) ||
			receipt.ScannedAt.After(plan.ExpiresAt) {
			return conflict("evaluation review raster scan drifted from its public subjective attempt")
		}
	}
	return nil
}
