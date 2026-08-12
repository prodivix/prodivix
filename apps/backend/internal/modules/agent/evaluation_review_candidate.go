package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
)

const evaluationReviewCandidateFactType = "evaluation-review-candidate"

type EvaluationReviewCandidateRef struct {
	NamespaceID               string
	PlanDigest                string
	RepositoryCommit          string
	CandidateID               string
	AttemptID                 string
	DescriptorDigest          string
	ResponseDigest            string
	ExecutionReceiptDigest    string
	GraderArtifactDigest      string
	ProjectionAuthorityDigest string
	MediaType                 string
	Width                     int64
	Height                    int64
	BytesDigest               string
	ByteLength                int64
	PublicArtifactScanDigest  string
	CandidateDigest           string
	GeneratedAt               time.Time
	decodedPixelDigest        string
}

type EvaluationReviewCandidateRecord struct {
	EvaluationReviewCandidateRef
	CandidateBytes []byte
}

func (repository *Repository) StoreEvaluationReviewCandidate(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	candidateBytes []byte,
) (EvaluationReviewCandidateRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	candidate, err := decodeEvaluationArtifact(candidateBytes, evaluationReviewCandidateFactType)
	if err != nil || candidate.PlanDigest != partition.PlanDigest || candidate.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationReviewCandidateRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, plan, _, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	attempts, err := queryEvaluationAttempts(writeContext, tx, authority.NamespaceID, partition, plan,
		" AND attempt_id = $4", candidate.FactID)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	invocations, err := queryEvaluationInvocationTurnReceipts(writeContext, tx, authority.NamespaceID, partition, candidate.FactID)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	executions, err := queryEvaluationExecutionReceipts(writeContext, tx, authority.NamespaceID, partition, plan, attempts,
		" AND attempt_id = $4", candidate.FactID)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	reference, err := evaluationReviewCandidateRef(authority.NamespaceID, candidate)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	scans, err := queryEvaluationReviewRasterScanReceipts(writeContext, tx, authority.NamespaceID, partition,
		" AND receipt_digest = $4", reference.PublicArtifactScanDigest)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	if err := validateEvaluationReviewCandidateBindings(plan, attempts, invocations, executions, scans,
		[]EvaluationReviewCandidateRef{reference}, false); err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_review_candidates (
		namespace_id, plan_digest, repository_commit, attempt_id, candidate_id, descriptor_digest,
		response_digest, execution_receipt_digest, grader_artifact_digest, projection_authority_digest,
		media_type, width, height, bytes_digest, byte_length, public_artifact_scan_digest,
		candidate_digest, candidate_json, candidate_bytes, generated_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		reference.AttemptID, reference.CandidateID, reference.DescriptorDigest, reference.ResponseDigest,
		reference.ExecutionReceiptDigest, reference.GraderArtifactDigest, reference.ProjectionAuthorityDigest,
		reference.MediaType, reference.Width, reference.Height, reference.BytesDigest, reference.ByteLength,
		reference.PublicArtifactScanDigest, reference.CandidateDigest, string(candidate.Canonical), candidate.Canonical,
		reference.GeneratedAt)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT candidate_bytes
			FROM agent_evaluation_review_candidates
			WHERE namespace_id = $1 AND ((plan_digest = $2 AND attempt_id = $3) OR candidate_id = $4 OR candidate_digest = $5)
			FOR SHARE`, authority.NamespaceID, partition.PlanDigest, reference.AttemptID,
			reference.CandidateID, reference.CandidateDigest)
		if err != nil {
			return EvaluationReviewCandidateRecord{}, false, err
		}
		if !bytes.Equal(existing, candidate.Canonical) {
			return EvaluationReviewCandidateRecord{}, false, conflict("evaluation review candidate identity was reused with different immutable bytes")
		}
	}
	if err := commitEvaluationAuthenticityWrite(tx); err != nil {
		return EvaluationReviewCandidateRecord{}, false, err
	}
	return EvaluationReviewCandidateRecord{
		EvaluationReviewCandidateRef: reference, CandidateBytes: append([]byte(nil), candidate.Canonical...),
	}, replayed, nil
}

func (repository *Repository) GetEvaluationReviewCandidate(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
) (EvaluationReviewCandidateRecord, error) {
	if !evaluationAuthenticityIdentityPattern.MatchString(attemptID) {
		return EvaluationReviewCandidateRecord{}, ErrInvalid
	}
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	record, err := loadEvaluationReviewCandidate(readContext, tx, authority.NamespaceID, partition, attemptID)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan,
		" AND attempt_id = $4", attemptID)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	invocations, err := queryEvaluationInvocationTurnReceipts(readContext, tx, authority.NamespaceID, partition, attemptID)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	executions, err := queryEvaluationExecutionReceipts(readContext, tx, authority.NamespaceID, partition, plan, attempts,
		" AND attempt_id = $4", attemptID)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	scans, err := queryEvaluationReviewRasterScanReceipts(readContext, tx, authority.NamespaceID, partition,
		" AND receipt_digest = $4", record.PublicArtifactScanDigest)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	if err := validateEvaluationReviewCandidateBindings(plan, attempts, invocations, executions, scans,
		[]EvaluationReviewCandidateRef{record.EvaluationReviewCandidateRef}, false); err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	return record, nil
}

func (repository *Repository) ListEvaluationReviewCandidateRefs(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationReviewCandidateRef, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	refs, err := queryEvaluationReviewCandidateRefs(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, err
	}
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return nil, err
	}
	invocations, err := queryEvaluationInvocationTurnReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	executions, err := queryEvaluationExecutionReceipts(readContext, tx, authority.NamespaceID, partition, plan, attempts, "")
	if err != nil {
		return nil, err
	}
	scans, err := queryEvaluationReviewRasterScanReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	if err := validateEvaluationReviewCandidateBindings(plan, attempts, invocations, executions, scans, refs, false); err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return refs, nil
}

type evaluationReviewCandidateScanner interface {
	Scan(...any) error
}

func scanEvaluationReviewCandidate(
	scanner evaluationReviewCandidateScanner,
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationReviewCandidateRecord, error) {
	var columns EvaluationReviewCandidateRef
	var source []byte
	if err := scanner.Scan(&columns.AttemptID, &columns.CandidateID, &columns.DescriptorDigest,
		&columns.ResponseDigest, &columns.ExecutionReceiptDigest, &columns.GraderArtifactDigest,
		&columns.ProjectionAuthorityDigest, &columns.MediaType, &columns.Width, &columns.Height,
		&columns.BytesDigest, &columns.ByteLength, &columns.PublicArtifactScanDigest, &columns.CandidateDigest,
		&source, &columns.GeneratedAt); err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	decoded, err := decodeEvaluationArtifact(source, evaluationReviewCandidateFactType)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, fmt.Errorf("decode persisted evaluation review candidate: %w", err)
	}
	reference, err := evaluationReviewCandidateRef(namespaceID, decoded)
	if err != nil {
		return EvaluationReviewCandidateRecord{}, err
	}
	if !bytes.Equal(source, decoded.Canonical) || reference.PlanDigest != partition.PlanDigest ||
		reference.RepositoryCommit != partition.RepositoryCommit || columns.AttemptID != reference.AttemptID ||
		columns.CandidateID != reference.CandidateID || columns.DescriptorDigest != reference.DescriptorDigest ||
		columns.ResponseDigest != reference.ResponseDigest || columns.ExecutionReceiptDigest != reference.ExecutionReceiptDigest ||
		columns.GraderArtifactDigest != reference.GraderArtifactDigest ||
		columns.ProjectionAuthorityDigest != reference.ProjectionAuthorityDigest || columns.MediaType != reference.MediaType ||
		columns.Width != reference.Width || columns.Height != reference.Height || columns.BytesDigest != reference.BytesDigest ||
		columns.ByteLength != reference.ByteLength ||
		columns.PublicArtifactScanDigest != reference.PublicArtifactScanDigest || columns.CandidateDigest != reference.CandidateDigest ||
		!columns.GeneratedAt.Equal(reference.GeneratedAt) {
		return EvaluationReviewCandidateRecord{}, conflict("persisted evaluation review candidate metadata drifted from canonical bytes")
	}
	return EvaluationReviewCandidateRecord{
		EvaluationReviewCandidateRef: reference, CandidateBytes: append([]byte(nil), source...),
	}, nil
}

func loadEvaluationReviewCandidate(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
) (EvaluationReviewCandidateRecord, error) {
	row := queryer.QueryRowContext(ctx, `SELECT attempt_id, candidate_id, descriptor_digest,
		response_digest, execution_receipt_digest, grader_artifact_digest, projection_authority_digest,
		media_type, width, height, bytes_digest, byte_length, public_artifact_scan_digest,
		candidate_digest, candidate_bytes, generated_at
	FROM agent_evaluation_review_candidates
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3 AND attempt_id = $4`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID)
	record, err := scanEvaluationReviewCandidate(row, namespaceID, partition)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationReviewCandidateRecord{}, ErrNotFound
	}
	return record, err
}

func queryEvaluationReviewCandidateRefs(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationReviewCandidateRef, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT attempt_id, candidate_id, descriptor_digest,
		response_digest, execution_receipt_digest, grader_artifact_digest, projection_authority_digest,
		media_type, width, height, bytes_digest, byte_length, public_artifact_scan_digest,
		candidate_digest, candidate_bytes, generated_at
	FROM agent_evaluation_review_candidates
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	ORDER BY attempt_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	refs := make([]EvaluationReviewCandidateRef, 0)
	seenIDs, seenDigests := map[string]struct{}{}, map[string]struct{}{}
	for rows.Next() {
		record, err := scanEvaluationReviewCandidate(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		ref := record.EvaluationReviewCandidateRef
		if _, exists := seenIDs[ref.CandidateID]; exists {
			return nil, conflict("evaluation review candidate list contains duplicate candidate identity")
		}
		if _, exists := seenDigests[ref.CandidateDigest]; exists {
			return nil, conflict("evaluation review candidate list contains duplicate candidate digest")
		}
		seenIDs[ref.CandidateID], seenDigests[ref.CandidateDigest] = struct{}{}, struct{}{}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(refs, func(left, right int) bool { return refs[left].AttemptID < refs[right].AttemptID })
	return refs, nil
}

func evaluationReviewCandidateRef(namespaceID string, candidate evaluationArtifactFact) (EvaluationReviewCandidateRef, error) {
	inspection, err := agentcontract.InspectEvaluationReviewRaster(
		stringMember(candidate.Value, "bytesBase64"), candidate.MediaType,
	)
	if err != nil || inspection.Width != candidate.Width || inspection.Height != candidate.Height ||
		inspection.ByteLength != candidate.ByteLength || inspection.BytesDigest != candidate.BytesDigest {
		return EvaluationReviewCandidateRef{}, invalid("evaluation review candidate raster inspection drifted")
	}
	return EvaluationReviewCandidateRef{
		NamespaceID: namespaceID, PlanDigest: candidate.PlanDigest, RepositoryCommit: candidate.RepositoryCommit,
		CandidateID: candidate.CandidateID, AttemptID: candidate.FactID,
		DescriptorDigest: candidate.DescriptorDigest, ResponseDigest: candidate.ResponseDigest,
		ExecutionReceiptDigest: candidate.ExecutionReceiptDigest, GraderArtifactDigest: candidate.GraderArtifactDigest,
		ProjectionAuthorityDigest: candidate.ProjectionAuthorityDigest, MediaType: candidate.MediaType,
		Width: candidate.Width, Height: candidate.Height, BytesDigest: candidate.BytesDigest, ByteLength: candidate.ByteLength,
		PublicArtifactScanDigest: candidate.PublicArtifactScanDigest,
		CandidateDigest:          candidate.FactDigest, GeneratedAt: candidate.RecordedAt,
		decodedPixelDigest: inspection.DecodedPixelDigest,
	}, nil
}

// validateEvaluationReviewCandidateBindings joins every persisted public
// review artifact back to one completed subjective attempt and its exact
// provider response. Finalization can additionally require the complete
// eligible set while recovery snapshots remain readable during execution.
func validateEvaluationReviewCandidateBindings(
	planRecord EvaluationPlanRecord,
	attemptRecords []EvaluationAttemptRecord,
	invocationRecords []EvaluationInvocationTurnReceiptRecord,
	executionRecords []EvaluationExecutionReceiptRecord,
	scanRecords []EvaluationReviewRasterScanReceiptRecord,
	references []EvaluationReviewCandidateRef,
	requireComplete bool,
) error {
	if err := validateEvaluationReviewRasterScanBindings(planRecord, attemptRecords, scanRecords); err != nil {
		return err
	}
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return err
	}
	publicSubjectiveCases := make(map[string]struct{})
	for _, raw := range plan.Value["concreteCases"].([]any) {
		evaluationCase := raw.(map[string]any)
		if subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool); subjective &&
			stringMember(evaluationCase, "access") == "public" {
			publicSubjectiveCases[stringMember(evaluationCase, "caseId")] = struct{}{}
		}
	}
	attempts := make(map[string]evaluationAttemptFact, len(attemptRecords))
	for _, record := range attemptRecords {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return err
		}
		if _, exists := attempts[attempt.AttemptID]; exists {
			return conflict("evaluation review candidate join contains duplicate attempts")
		}
		attempts[attempt.AttemptID] = attempt
	}
	type terminalInvocation struct {
		record EvaluationInvocationTurnReceiptRecord
		value  evaluationInvocationTurnReceipt
	}
	invocations := make(map[string]terminalInvocation, len(invocationRecords))
	for _, record := range invocationRecords {
		invocation, err := decodeEvaluationInvocationTurnReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		if !invocation.Terminal {
			continue
		}
		if _, exists := invocations[record.AttemptID]; exists {
			return conflict("evaluation review candidate join contains duplicate terminal invocation turns")
		}
		invocations[record.AttemptID] = terminalInvocation{record: record, value: invocation}
	}
	executions := make(map[string]EvaluationExecutionReceiptRecord, len(executionRecords))
	for _, execution := range executionRecords {
		if _, exists := executions[execution.AttemptID]; exists {
			return conflict("evaluation review candidate join contains duplicate execution receipts")
		}
		executions[execution.AttemptID] = execution
	}
	scans := make(map[string]EvaluationReviewRasterScanReceiptRecord, len(scanRecords))
	for _, scan := range scanRecords {
		if _, exists := scans[scan.ReceiptDigest]; exists {
			return conflict("evaluation review candidate join contains duplicate raster scan receipts")
		}
		scans[scan.ReceiptDigest] = scan
	}
	candidates := make(map[string]struct{})
	for _, candidate := range references {
		attempt, exists := attempts[candidate.AttemptID]
		invocation, invocationExists := invocations[candidate.AttemptID]
		execution, executionExists := executions[candidate.AttemptID]
		scan, scanExists := scans[candidate.PublicArtifactScanDigest]
		_, eligibleCase := publicSubjectiveCases[attempt.CaseID]
		attemptResponseDigest := stringMember(attempt.Value, "responseDigest")
		if !exists || !invocationExists || !executionExists || !scanExists || !eligibleCase || attempt.Status != "completed" ||
			invocation.value.Status != "completed" || invocation.value.ResponseArtifactDigest == "" ||
			candidate.NamespaceID != planRecord.NamespaceID || candidate.PlanDigest != plan.PlanDigest ||
			candidate.RepositoryCommit != plan.RepositoryCommit || candidate.DescriptorDigest != attempt.DescriptorDigest ||
			candidate.DescriptorDigest != invocation.value.DescriptorDigest || candidate.DescriptorDigest != execution.DescriptorDigest ||
			candidate.ResponseDigest != attemptResponseDigest || candidate.ResponseDigest != invocation.value.ResponseArtifactDigest ||
			candidate.ExecutionReceiptDigest != execution.ReceiptDigest ||
			scan.NamespaceID != planRecord.NamespaceID || scan.PlanDigest != plan.PlanDigest ||
			scan.RepositoryCommit != plan.RepositoryCommit || scan.AttemptID != candidate.AttemptID ||
			scan.DescriptorDigest != candidate.DescriptorDigest ||
			scan.ProjectionAuthorityDigest != candidate.ProjectionAuthorityDigest || scan.MediaType != candidate.MediaType ||
			scan.Width != candidate.Width || scan.Height != candidate.Height || scan.ByteLength != candidate.ByteLength ||
			scan.BytesDigest != candidate.BytesDigest || scan.DecodedPixelDigest != candidate.decodedPixelDigest ||
			scan.Verdict != "safe" || len(scan.FindingDigests) != 0 || candidate.GeneratedAt.Before(scan.ScannedAt) ||
			invocation.record.NamespaceID != planRecord.NamespaceID || invocation.value.PlanDigest != plan.PlanDigest ||
			invocation.value.RepositoryCommit != plan.RepositoryCommit || execution.NamespaceID != planRecord.NamespaceID ||
			execution.PlanDigest != plan.PlanDigest || execution.RepositoryCommit != plan.RepositoryCommit ||
			candidate.GeneratedAt.Before(attempt.CompletedAt) || invocation.value.Invocation == nil ||
			candidate.GeneratedAt.Before(invocation.value.Invocation.CompletedAt) ||
			candidate.GeneratedAt.After(plan.ExpiresAt) {
			return conflict("evaluation review candidate drifted from its subjective attempt/provider/execution evidence")
		}
		if _, duplicate := candidates[candidate.AttemptID]; duplicate {
			return conflict("evaluation review candidate partition contains duplicate attempt identities")
		}
		candidates[candidate.AttemptID] = struct{}{}
	}
	if !requireComplete {
		return nil
	}
	for attemptID, attempt := range attempts {
		_, eligibleCase := publicSubjectiveCases[attempt.CaseID]
		eligible := eligibleCase && attempt.Status == "completed"
		_, persisted := candidates[attemptID]
		if eligible != persisted {
			return conflict("evaluation review candidate set is incomplete or contains an ineligible attempt")
		}
	}
	return nil
}
