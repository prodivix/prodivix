package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHumanReviewExportLeaseKind       = "human-review"
	evaluationReviewLeaseFormat                = "prodivix.g4-model-evaluation-review-lease"
	evaluationReviewMachinePhaseFormat         = "prodivix.g4-model-evaluation-machine-phase-seal"
	maximumEvaluationReviewCandidateCount      = int64(18)
	maximumEvaluationReviewInvocationTurnCount = maximumEvaluationReviewCandidateCount * 256
)

var evaluationReviewLeaseFamilies = [...]string{
	"attempts",
	"invocationTurnReceipts",
	"invocationTurnSetReceipts",
	"executionReceipts",
	"reviewRasterScanReceipts",
	"reviewCandidateRefs",
}

// EvaluationReviewLeaseCommitments is the public digest base. Lease identity,
// cursor material and materialized order keys remain server-only.
type EvaluationReviewLeaseCommitments struct {
	Format                             string `json:"format"`
	Version                            int64  `json:"version"`
	PlanDigest                         string `json:"planDigest"`
	RepositoryCommit                   string `json:"repositoryCommit"`
	MachinePhaseDigest                 string `json:"machinePhaseDigest"`
	EligibleAttemptSetDigest           string `json:"eligibleAttemptSetDigest"`
	InvocationTurnReceiptSetDigest     string `json:"invocationTurnReceiptSetDigest"`
	InvocationTurnSetReceiptSetDigest  string `json:"invocationTurnSetReceiptSetDigest"`
	ExecutionReceiptSetDigest          string `json:"executionReceiptSetDigest"`
	ReviewRasterScanReceiptSetDigest   string `json:"reviewRasterScanReceiptSetDigest"`
	ReviewCandidateRefSetDigest        string `json:"reviewCandidateRefSetDigest"`
	BlindReviewMappingSetDigest        string `json:"blindReviewMappingSetDigest"`
	RandomizedPresentationPolicyDigest string `json:"randomizedPresentationPolicyDigest"`
	CreatedAt                          string `json:"createdAt"`
	ExpiresAt                          string `json:"expiresAt"`
}

type EvaluationReviewLease struct {
	NamespaceID            string
	Partition              EvaluationPlanPartition
	LeaseID                string                           `json:"leaseId"`
	ReviewLeaseDigest      string                           `json:"reviewLeaseDigest"`
	CursorKeyBindingDigest string                           `json:"-"`
	Commitments            EvaluationReviewLeaseCommitments `json:"-"`
	Families               []EvaluationExportFamilySummary  `json:"families"`
	TotalRecordCount       int64                            `json:"totalRecordCount"`
	TotalRecordBytes       int64                            `json:"totalRecordBytes"`
	CreatedAt              time.Time                        `json:"-"`
	ExpiresAt              time.Time                        `json:"-"`
	CreatedAtText          string                           `json:"createdAt"`
	ExpiresAtText          string                           `json:"expiresAt"`
}

func evaluationReviewLeaseFamilySpecs() []evaluationExportFamilySpec {
	result := make([]evaluationExportFamilySpec, 0, len(evaluationReviewLeaseFamilies))
	for index, family := range evaluationReviewLeaseFamilies {
		spec, ok := evaluationExportFamilySpecFor(family)
		if !ok {
			panic("missing evaluation review lease family specification: " + family)
		}
		spec.Index = int64(index)
		spec.Singleton = false
		spec.SemanticEnvelopeKey = ""
		if family == "attempts" {
			spec.Inline = false
			spec.OrderExpression = `'[' || to_json(source.attempt_id)::text || ']'`
		}
		if family == "reviewRasterScanReceipts" {
			spec.ProjectFactValue = true
		}
		result = append(result, spec)
	}
	return result
}

func evaluationReviewLeaseFamilySpecFor(family string) (evaluationExportFamilySpec, bool) {
	for _, spec := range evaluationReviewLeaseFamilySpecs() {
		if spec.Family == family {
			return spec, true
		}
	}
	return evaluationExportFamilySpec{}, false
}

func evaluationReviewLeaseIdentity(
	namespaceID string,
	partition EvaluationPlanPartition,
	machinePhaseDigest string,
) (string, error) {
	digest, err := canonicaljson.Digest(map[string]any{
		"format": evaluationReviewLeaseFormat, "version": int64(1),
		"namespaceId": namespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "machinePhaseDigest": machinePhaseDigest,
	})
	if err != nil {
		return "", err
	}
	return "evaluation-review-lease:" + strings.TrimPrefix(digest, "sha256-"), nil
}

func decodeEvaluationReviewLeaseCommitments(source []byte) (EvaluationReviewLeaseCommitments, error) {
	if err := canonicaljson.ValidateRawEnvelope(source, 1_048_576); err != nil {
		return EvaluationReviewLeaseCommitments{}, conflict("evaluation review lease commitments are invalid")
	}
	var value EvaluationReviewLeaseCommitments
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil || value.Format != evaluationReviewLeaseFormat || value.Version != 1 ||
		!evaluationDigestPattern.MatchString(value.PlanDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(value.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(value.MachinePhaseDigest) ||
		!evaluationDigestPattern.MatchString(value.EligibleAttemptSetDigest) ||
		!evaluationDigestPattern.MatchString(value.InvocationTurnReceiptSetDigest) ||
		!evaluationDigestPattern.MatchString(value.InvocationTurnSetReceiptSetDigest) ||
		!evaluationDigestPattern.MatchString(value.ExecutionReceiptSetDigest) ||
		!evaluationDigestPattern.MatchString(value.ReviewRasterScanReceiptSetDigest) ||
		!evaluationDigestPattern.MatchString(value.ReviewCandidateRefSetDigest) ||
		!evaluationDigestPattern.MatchString(value.BlindReviewMappingSetDigest) ||
		!evaluationDigestPattern.MatchString(value.RandomizedPresentationPolicyDigest) {
		return EvaluationReviewLeaseCommitments{}, conflict("evaluation review lease commitments drifted")
	}
	createdAt, createdErr := time.Parse(time.RFC3339Nano, value.CreatedAt)
	expiresAt, expiresErr := time.Parse(time.RFC3339Nano, value.ExpiresAt)
	if createdErr != nil || expiresErr != nil || !expiresAt.After(createdAt) ||
		value.CreatedAt != evaluationExportInstant(createdAt) || value.ExpiresAt != evaluationExportInstant(expiresAt) {
		return EvaluationReviewLeaseCommitments{}, conflict("evaluation review lease window is invalid")
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) {
		return EvaluationReviewLeaseCommitments{}, conflict("evaluation review lease commitments are not canonical")
	}
	return value, nil
}

func loadEvaluationReviewLease(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
	cursorKeyBindingDigest string,
) (EvaluationReviewLease, error) {
	var record EvaluationReviewLease
	var leaseKind, semanticRootDigest, commitmentsDigest string
	var commitmentsBytes []byte
	var familyCount int64
	var evidenceSetDigest, authorityPayloadDigest, authorityAttestationDigest, manifestDigest sql.NullString
	record.NamespaceID, record.Partition = namespaceID, partition
	err := queryer.QueryRowContext(ctx, `SELECT repository_commit, lease_kind, lease_id, lease_digest,
		cursor_key_binding_digest, evidence_set_digest, authority_payload_digest,
		authority_attestation_digest, evaluation_manifest_digest, semantic_root_digest,
		commitments_digest, commitments_bytes, family_count, total_record_count, total_record_bytes,
		created_at, expires_at
		FROM agent_evaluation_export_leases
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
			AND lease_id = $4 AND lease_kind = $5`, namespaceID, partition.PlanDigest,
		partition.RepositoryCommit, leaseID, evaluationHumanReviewExportLeaseKind).Scan(
		&record.Partition.RepositoryCommit, &leaseKind, &record.LeaseID, &record.ReviewLeaseDigest,
		&record.CursorKeyBindingDigest, &evidenceSetDigest, &authorityPayloadDigest,
		&authorityAttestationDigest, &manifestDigest, &semanticRootDigest, &commitmentsDigest,
		&commitmentsBytes, &familyCount, &record.TotalRecordCount, &record.TotalRecordBytes,
		&record.CreatedAt, &record.ExpiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationReviewLease{}, ErrNotFound
	}
	if err != nil {
		return EvaluationReviewLease{}, err
	}
	if leaseKind != evaluationHumanReviewExportLeaseKind || record.Partition != partition ||
		record.CursorKeyBindingDigest != cursorKeyBindingDigest ||
		evidenceSetDigest.Valid || authorityPayloadDigest.Valid || authorityAttestationDigest.Valid || manifestDigest.Valid ||
		!evaluationDigestPattern.MatchString(record.ReviewLeaseDigest) ||
		!evaluationDigestPattern.MatchString(semanticRootDigest) ||
		commitmentsDigest != record.ReviewLeaseDigest || familyCount != int64(len(evaluationReviewLeaseFamilies)) {
		return EvaluationReviewLease{}, conflict("evaluation review lease metadata drifted")
	}
	commitments, err := decodeEvaluationReviewLeaseCommitments(commitmentsBytes)
	if err != nil {
		return EvaluationReviewLease{}, err
	}
	calculatedDigest, err := canonicaljson.Digest(commitments)
	if err != nil || calculatedDigest != record.ReviewLeaseDigest ||
		commitments.PlanDigest != partition.PlanDigest || commitments.RepositoryCommit != partition.RepositoryCommit ||
		commitments.MachinePhaseDigest != semanticRootDigest ||
		commitments.CreatedAt != evaluationExportInstant(record.CreatedAt) ||
		commitments.ExpiresAt != evaluationExportInstant(record.ExpiresAt) {
		return EvaluationReviewLease{}, conflict("evaluation review lease digest drifted")
	}
	familyRows, err := queryer.QueryContext(ctx, `SELECT family, family_index, record_count,
		total_bytes, semantic_digest, record_set_digest, first_order_key, last_order_key
		FROM agent_evaluation_export_lease_families
		WHERE namespace_id = $1 AND lease_id = $2 ORDER BY family_index ASC`, namespaceID, leaseID)
	if err != nil {
		return EvaluationReviewLease{}, err
	}
	families := make([]EvaluationExportFamilySummary, 0, familyCount)
	for familyRows.Next() {
		var summary EvaluationExportFamilySummary
		var first, last sql.NullString
		if err := familyRows.Scan(&summary.Family, &summary.FamilyIndex, &summary.ExpectedRecordCount,
			&summary.ExpectedTotalBytes, &summary.ExpectedSemanticDigest, &summary.ExpectedRecordSetDigest,
			&first, &last); err != nil {
			_ = familyRows.Close()
			return EvaluationReviewLease{}, err
		}
		if first.Valid {
			summary.FirstOrderKey = &first.String
		}
		if last.Valid {
			summary.LastOrderKey = &last.String
		}
		families = append(families, summary)
	}
	if err := familyRows.Close(); err != nil {
		return EvaluationReviewLease{}, err
	}
	if len(families) != len(evaluationReviewLeaseFamilies) {
		return EvaluationReviewLease{}, conflict("evaluation review lease family catalog is incomplete")
	}
	for index, family := range evaluationReviewLeaseFamilies {
		if families[index].Family != family || families[index].FamilyIndex != int64(index) {
			return EvaluationReviewLease{}, conflict("evaluation review lease family catalog drifted")
		}
	}
	rootByFamily := evaluationExportSummaryByFamily(families)
	if commitments.EligibleAttemptSetDigest != rootByFamily["attempts"].ExpectedSemanticDigest ||
		commitments.InvocationTurnReceiptSetDigest != rootByFamily["invocationTurnReceipts"].ExpectedSemanticDigest ||
		commitments.InvocationTurnSetReceiptSetDigest != rootByFamily["invocationTurnSetReceipts"].ExpectedSemanticDigest ||
		commitments.ExecutionReceiptSetDigest != rootByFamily["executionReceipts"].ExpectedSemanticDigest ||
		commitments.ReviewRasterScanReceiptSetDigest != rootByFamily["reviewRasterScanReceipts"].ExpectedSemanticDigest ||
		commitments.ReviewCandidateRefSetDigest != rootByFamily["reviewCandidateRefs"].ExpectedSemanticDigest {
		return EvaluationReviewLease{}, conflict("evaluation review lease family roots drifted")
	}
	record.Commitments, record.Families = commitments, families
	record.CreatedAtText, record.ExpiresAtText = evaluationExportInstant(record.CreatedAt), evaluationExportInstant(record.ExpiresAt)
	return record, nil
}

type evaluationReviewMachineSeal struct {
	Plan                    evaluationPlanFact
	AttemptSetDigest        string
	CheckpointSetDigest     string
	BudgetLedgerDigest      string
	HoldoutReceiptDigest    string
	AuthenticityFamilyRoots map[string]string
	MachinePhaseDigest      string
}

func evaluationReviewSourceFamilyRoot(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	spec evaluationExportFamilySpec,
) (string, int64, error) {
	if spec.SourceTable == "" || spec.SourcePlanColumn == "" || spec.SourceDigestColumn == "" ||
		spec.SourceBytesColumn == "" || spec.OrderExpression == "" {
		return "", 0, ErrInvalid
	}
	commitPredicate := ""
	arguments := []any{namespaceID, partition.PlanDigest}
	if !spec.ProjectFactValue {
		commitPredicate = " AND source.repository_commit = $3"
		arguments = append(arguments, partition.RepositoryCommit)
	}
	query := fmt.Sprintf(`SELECT order_key, record_digest, byte_length FROM (
		SELECT %s AS order_key, source.%s AS record_digest,
			octet_length(source.%s)::bigint AS byte_length
		FROM %s source WHERE source.namespace_id = $1 AND source.%s = $2%s
	) records ORDER BY order_key COLLATE "C" ASC`, spec.OrderExpression, spec.SourceDigestColumn,
		spec.SourceBytesColumn, spec.SourceTable, spec.SourcePlanColumn, commitPredicate)
	rows, err := queryer.QueryContext(ctx, query, arguments...)
	if err != nil {
		return "", 0, err
	}
	digest, count, _, _, _, err := evaluationExportHashDigestSequence(rows, "[")
	_ = rows.Close()
	return digest, count, err
}

func evaluationReviewMachineFamilySpecs() []evaluationExportFamilySpec {
	families := []string{
		"endpointSmokeReceipts", "preDispatchFailureReceipts", "transportDispatchIntents",
		"transportReceipts", "providerResultSpoolReceipts", "providerResultSpoolDispositionReceipts",
		"invocationTurnReceipts", "invocationTurnSetReceipts", "resultSubmissionReceipts",
		"verificationAttemptGrantReceipts", "controlledRuntimeReceipts", "capabilityExecutionReceipts",
		"reviewRasterScanReceipts", "sourceReceipts", "executionReceipts", "attempts",
	}
	result := make([]evaluationExportFamilySpec, 0, len(families))
	for _, family := range families {
		spec, ok := evaluationExportFamilySpecFor(family)
		if !ok {
			panic("missing evaluation review machine family specification: " + family)
		}
		if family == "attempts" {
			spec.Inline = false
			spec.OrderExpression = `'[' || to_json(source.attempt_id)::text || ']'`
		}
		result = append(result, spec)
	}
	return result
}

func evaluationReviewLatestCheckpointRoot(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	expectedShards map[string]struct{},
) (string, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT DISTINCT ON (shard_id)
		shard_id, state, checkpoint_digest, checkpoint_bytes
		FROM agent_evaluation_checkpoints
		WHERE namespace_id = $1 AND plan_digest = $2
		ORDER BY shard_id COLLATE "C" ASC, revision DESC`, namespaceID, partition.PlanDigest)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	digests := make([]string, 0, len(expectedShards))
	seen := make(map[string]struct{}, len(expectedShards))
	for rows.Next() {
		var shardID, state, checkpointDigest string
		var source []byte
		if err := rows.Scan(&shardID, &state, &checkpointDigest, &source); err != nil {
			return "", err
		}
		if _, expected := expectedShards[shardID]; !expected {
			return "", conflict("evaluation review machine phase contains an unknown checkpoint shard")
		}
		if _, duplicate := seen[shardID]; duplicate {
			return "", conflict("evaluation review machine phase contains duplicate checkpoint shards")
		}
		checkpoint, err := decodeEvaluationCheckpoint(source)
		missing, missingOK := checkpoint.Value["missingAttemptRefs"].([]any)
		if err != nil || !missingOK || state != "completed" || checkpoint.State != state ||
			checkpoint.CheckpointDigest != checkpointDigest || len(missing) != 0 {
			return "", conflict("evaluation review machine phase has an incomplete checkpoint")
		}
		seen[shardID] = struct{}{}
		digests = append(digests, checkpointDigest)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if len(seen) != len(expectedShards) {
		return "", conflict("evaluation review machine phase is missing completed shard checkpoints")
	}
	return evaluationCanonicalStringSetDigest(digests)
}

func evaluationReviewMachineSealForPartition(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
) (evaluationReviewMachineSeal, error) {
	return evaluationReviewMachineSealForPartitionState(
		ctx, tx, namespaceID, partition, planRecord, false,
	)
}

// Finalization replays the exact pre-review machine seal after the atomic
// validated-human pair has been added. Human facts never contribute to the
// machine phase digest, while their singleton presence is checked explicitly.
func evaluationFinalizationMachineSealForPartition(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
) (evaluationReviewMachineSeal, error) {
	return evaluationReviewMachineSealForPartitionState(
		ctx, tx, namespaceID, partition, planRecord, true,
	)
}

func evaluationReviewMachineSealForPartitionState(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
	validatedHumanPhase bool,
) (evaluationReviewMachineSeal, error) {
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	expectedAttempts := make(map[string]evaluationStatusPlannedAttempt, len(planned))
	expectedShards := make(map[string]struct{})
	for _, descriptor := range planned {
		expectedAttempts[descriptor.AttemptID] = descriptor
		expectedShards[descriptor.ShardID] = struct{}{}
	}
	rows, err := tx.QueryContext(ctx, `SELECT attempt_id, shard_id, status
		FROM agent_evaluation_attempts WHERE namespace_id = $1 AND plan_digest = $2
		ORDER BY attempt_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest)
	if err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	recorded := make(map[string]struct{}, len(expectedAttempts))
	var completedAttemptCount int64
	for rows.Next() {
		var attemptID, shardID, status string
		if err := rows.Scan(&attemptID, &shardID, &status); err != nil {
			_ = rows.Close()
			return evaluationReviewMachineSeal{}, err
		}
		descriptor, expected := expectedAttempts[attemptID]
		if !expected || descriptor.ShardID != shardID {
			_ = rows.Close()
			return evaluationReviewMachineSeal{}, conflict("evaluation review machine phase attempt denominator drifted")
		}
		if _, duplicate := recorded[attemptID]; duplicate {
			_ = rows.Close()
			return evaluationReviewMachineSeal{}, conflict("evaluation review machine phase contains duplicate attempts")
		}
		recorded[attemptID] = struct{}{}
		if status == "completed" {
			completedAttemptCount++
		}
	}
	if err := rows.Close(); err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	if len(recorded) != len(expectedAttempts) || int64(len(recorded)) != plan.PlannedJourneyCount {
		return evaluationReviewMachineSeal{}, conflict("evaluation review machine phase denominator is incomplete")
	}
	checkpointSetDigest, err := evaluationReviewLatestCheckpointRoot(
		ctx, tx, namespaceID, partition, expectedShards,
	)
	if err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	budgetSnapshot, err := loadEvaluationBudgetSnapshot(ctx, tx, namespaceID, partition, planRecord)
	if err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	if len(budgetSnapshot.UnsettledReservationIDs) != 0 {
		return evaluationReviewMachineSeal{}, conflict("evaluation review machine phase has unsettled budget reservations")
	}
	_, _, budgetLedgerDigest, err := canonicalEvaluationBudgetLedger(ctx, tx, namespaceID, partition, planRecord)
	if err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	artifacts, err := queryEvaluationArtifacts(ctx, tx, namespaceID, partition, "")
	if err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	holdout, err := evaluationSingletonArtifact(artifacts, "evaluation-holdout-receipt")
	if err != nil {
		return evaluationReviewMachineSeal{}, conflict("evaluation review machine phase is missing its holdout receipt")
	}
	humanReviewReportCount := 0
	for _, artifact := range artifacts {
		if artifact.FactType == "evaluation-human-review-report" {
			humanReviewReportCount++
		}
	}
	if (!validatedHumanPhase && humanReviewReportCount != 0) ||
		(validatedHumanPhase && humanReviewReportCount != 1) {
		return evaluationReviewMachineSeal{}, conflict("evaluation review machine phase human review cardinality drifted")
	}
	var validatedHumanCount, authorityCount int64
	if err := tx.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_validated_human_review_artifacts
			WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_authority_attestations
			WHERE namespace_id = $1 AND plan_digest = $2)`, namespaceID, partition.PlanDigest).
		Scan(&validatedHumanCount, &authorityCount); err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	if (!validatedHumanPhase && validatedHumanCount != 0) ||
		(validatedHumanPhase && validatedHumanCount != 1) || authorityCount != 0 {
		return evaluationReviewMachineSeal{}, conflict("evaluation review machine phase is already finalized")
	}
	var turnSetCount, executionCount, capabilityCount, submissionCount, runtimeCount int64
	var openIntentCount, undisposedSpoolCount, orphanPreDispatchCount int64
	if err := tx.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_invocation_turn_set_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_execution_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_capability_execution_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_result_submission_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_controlled_runtime_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_transport_dispatch_intents intent
			LEFT JOIN agent_evaluation_transport_receipts receipt ON receipt.namespace_id = intent.namespace_id
				AND receipt.plan_digest = intent.plan_digest AND receipt.attempt_id = intent.attempt_id
				AND receipt.turn_index = intent.turn_index
			WHERE intent.namespace_id = $1 AND intent.plan_digest = $2 AND receipt.receipt_digest IS NULL),
		(SELECT COUNT(*) FROM agent_evaluation_provider_result_spool_receipts spool
			LEFT JOIN agent_evaluation_provider_result_spool_dispositions disposition
				ON disposition.namespace_id = spool.namespace_id AND disposition.plan_digest = spool.plan_digest
				AND disposition.spool_ref = spool.spool_ref
			WHERE spool.namespace_id = $1 AND spool.plan_digest = $2 AND disposition.receipt_digest IS NULL),
		(SELECT COUNT(*) FROM agent_evaluation_pre_dispatch_failure_receipts failure
			LEFT JOIN agent_evaluation_invocation_turn_receipts turn
				ON turn.namespace_id = failure.namespace_id AND turn.plan_digest = failure.plan_digest
				AND turn.attempt_id = failure.attempt_id AND turn.turn_index = failure.turn_index
				AND turn.execution_failure_authority_receipt_digest = failure.receipt_digest
			WHERE failure.namespace_id = $1 AND failure.plan_digest = $2 AND turn.evidence_digest IS NULL)`,
		namespaceID, partition.PlanDigest).Scan(&turnSetCount, &executionCount, &capabilityCount,
		&submissionCount, &runtimeCount, &openIntentCount, &undisposedSpoolCount, &orphanPreDispatchCount); err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	if turnSetCount != plan.PlannedJourneyCount || executionCount != plan.PlannedJourneyCount ||
		capabilityCount != plan.PlannedJourneyCount || submissionCount != completedAttemptCount ||
		runtimeCount != completedAttemptCount || openIntentCount != 0 || undisposedSpoolCount != 0 ||
		orphanPreDispatchCount != 0 {
		return evaluationReviewMachineSeal{}, conflict("evaluation review machine evidence is incomplete or orphaned")
	}
	roots := make(map[string]string)
	counts := make(map[string]int64)
	for _, spec := range evaluationReviewMachineFamilySpecs() {
		root, count, err := evaluationReviewSourceFamilyRoot(ctx, tx, namespaceID, partition, spec)
		if err != nil {
			return evaluationReviewMachineSeal{}, err
		}
		roots[spec.Family] = root
		counts[spec.Family] = count
	}
	endpointTargets, _ := plan.Value["endpointSmokeTargets"].([]any)
	if counts["endpointSmokeReceipts"] != int64(len(endpointTargets)) ||
		counts["attempts"] != plan.PlannedJourneyCount ||
		counts["invocationTurnSetReceipts"] != plan.PlannedJourneyCount ||
		counts["executionReceipts"] != plan.PlannedJourneyCount ||
		counts["capabilityExecutionReceipts"] != plan.PlannedJourneyCount {
		return evaluationReviewMachineSeal{}, conflict("evaluation review machine family roots do not cover the denominator")
	}
	machineBase := map[string]any{
		"format": evaluationReviewMachinePhaseFormat, "version": int64(1),
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"plannedAttemptSetDigest": stringMember(plan.Value, "plannedAttemptSetDigest"),
		"plannedJourneyCount":     plan.PlannedJourneyCount, "attemptSetDigest": roots["attempts"],
		"checkpointSetDigest": checkpointSetDigest, "budgetLedgerDigest": budgetLedgerDigest,
		"holdoutExecutionReceiptDigest": holdout.FactDigest, "authenticityFamilyRoots": roots,
	}
	machinePhaseDigest, err := canonicaljson.Digest(machineBase)
	if err != nil {
		return evaluationReviewMachineSeal{}, err
	}
	return evaluationReviewMachineSeal{
		Plan: plan, AttemptSetDigest: roots["attempts"], CheckpointSetDigest: checkpointSetDigest,
		BudgetLedgerDigest: budgetLedgerDigest, HoldoutReceiptDigest: holdout.FactDigest,
		AuthenticityFamilyRoots: roots, MachinePhaseDigest: machinePhaseDigest,
	}, nil
}

type evaluationReviewLeaseEvidence struct {
	Attempts        []EvaluationAttemptRecord
	InvocationTurns []EvaluationInvocationTurnReceiptRecord
	InvocationSets  []EvaluationInvocationTurnSetReceiptRecord
	Executions      []EvaluationExecutionReceiptRecord
	Scans           []EvaluationReviewRasterScanReceiptRecord
	Candidates      []EvaluationReviewCandidateRef
	Mappings        []EvaluationBlindReviewMappingRecord
}

func evaluationReviewEligibleAttemptIDs(plan evaluationPlanFact) (map[string]struct{}, error) {
	eligibleCases := make(map[string]struct{})
	rawCases, ok := plan.Value["concreteCases"].([]any)
	if !ok {
		return nil, conflict("evaluation review lease case schedule is invalid")
	}
	for _, raw := range rawCases {
		evaluationCase, ok := raw.(map[string]any)
		subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool)
		if !ok {
			return nil, conflict("evaluation review lease case schedule is invalid")
		}
		if subjective && stringMember(evaluationCase, "access") == "public" {
			eligibleCases[stringMember(evaluationCase, "caseId")] = struct{}{}
		}
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return nil, err
	}
	result := make(map[string]struct{})
	for _, descriptor := range planned {
		if _, eligible := eligibleCases[descriptor.CaseID]; eligible {
			result[descriptor.AttemptID] = struct{}{}
		}
	}
	if len(result) < 1 || int64(len(result)) > maximumEvaluationReviewCandidateCount {
		return nil, conflict("evaluation review lease eligible candidate count exceeds its bound")
	}
	return result, nil
}

func loadEvaluationReviewLeaseEvidence(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
	plan evaluationPlanFact,
) (evaluationReviewLeaseEvidence, error) {
	eligibleIDs, err := evaluationReviewEligibleAttemptIDs(plan)
	if err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	candidates, err := queryEvaluationReviewCandidateRefs(ctx, tx, namespaceID, partition)
	if err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	if len(candidates) != len(eligibleIDs) {
		return evaluationReviewLeaseEvidence{}, conflict("evaluation review candidate set is incomplete")
	}
	seenCandidates := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		if _, eligible := eligibleIDs[candidate.AttemptID]; !eligible {
			return evaluationReviewLeaseEvidence{}, conflict("evaluation review candidate set contains an ineligible attempt")
		}
		if _, duplicate := seenCandidates[candidate.AttemptID]; duplicate {
			return evaluationReviewLeaseEvidence{}, conflict("evaluation review candidate set contains duplicate attempts")
		}
		seenCandidates[candidate.AttemptID] = struct{}{}
	}
	sort.Slice(candidates, func(left, right int) bool { return candidates[left].AttemptID < candidates[right].AttemptID })
	evidence := evaluationReviewLeaseEvidence{Candidates: candidates}
	for _, candidate := range candidates {
		attempts, err := queryEvaluationAttempts(ctx, tx, namespaceID, partition, planRecord,
			" AND attempt_id = $4", candidate.AttemptID)
		if err != nil {
			return evaluationReviewLeaseEvidence{}, err
		}
		turns, err := queryEvaluationInvocationTurnReceipts(ctx, tx, namespaceID, partition, candidate.AttemptID)
		if err != nil {
			return evaluationReviewLeaseEvidence{}, err
		}
		turnSets, err := queryEvaluationInvocationTurnSetReceipts(
			ctx, tx, namespaceID, partition, candidate.AttemptID,
		)
		if err != nil {
			return evaluationReviewLeaseEvidence{}, err
		}
		executions, err := queryEvaluationExecutionReceipts(ctx, tx, namespaceID, partition, planRecord, attempts,
			" AND attempt_id = $4", candidate.AttemptID)
		if err != nil {
			return evaluationReviewLeaseEvidence{}, err
		}
		scans, err := queryEvaluationReviewRasterScanReceipts(ctx, tx, namespaceID, partition,
			" AND attempt_id = $4", candidate.AttemptID)
		if err != nil {
			return evaluationReviewLeaseEvidence{}, err
		}
		if len(attempts) != 1 || len(turns) < 1 || len(turns) > 256 || len(turnSets) != 1 ||
			len(executions) != 1 || len(scans) != 1 {
			return evaluationReviewLeaseEvidence{}, conflict("evaluation review evidence does not exactly cover its eligible attempt")
		}
		evidence.Attempts = append(evidence.Attempts, attempts[0])
		evidence.InvocationTurns = append(evidence.InvocationTurns, turns...)
		evidence.InvocationSets = append(evidence.InvocationSets, turnSets[0])
		evidence.Executions = append(evidence.Executions, executions[0])
		evidence.Scans = append(evidence.Scans, scans[0])
	}
	if int64(len(evidence.InvocationTurns)) > maximumEvaluationReviewInvocationTurnCount {
		return evaluationReviewLeaseEvidence{}, conflict("evaluation review invocation turn projection exceeds its bound")
	}
	if err := validateEvaluationReviewCandidateBindings(planRecord, evidence.Attempts, evidence.InvocationTurns,
		evidence.Executions, evidence.Scans, evidence.Candidates, true); err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	mappings, err := queryEvaluationBlindReviewMappings(ctx, tx, namespaceID, partition, "")
	if err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	if err := validateEvaluationBlindReviewMappingSet(plan, evidence.Candidates, mappings, true); err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	if len(mappings) != len(evidence.Candidates) {
		return evaluationReviewLeaseEvidence{}, conflict("evaluation review mappings do not exactly cover eligible candidates")
	}
	evidence.Mappings = mappings
	return evidence, nil
}

func evaluationReviewReference(orderParts []string, digest string, source []byte, projectFact bool) (evaluationExportReference, error) {
	orderKey, err := evaluationExportOrderKey(orderParts...)
	if err != nil {
		return evaluationExportReference{}, err
	}
	canonical := source
	if projectFact {
		_, canonical, err = evaluationExportFactValue(source)
		if err != nil {
			return evaluationExportReference{}, err
		}
	}
	if len(canonical) < 1 || int64(len(canonical)) > maximumEvaluationExportRecordBytes {
		return evaluationExportReference{}, conflict("evaluation review record exceeds its canonical byte limit")
	}
	return evaluationExportReference{OrderKey: orderKey, RecordDigest: digest, ByteLength: int64(len(canonical))}, nil
}

func materializeEvaluationReviewLeaseEvidence(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	leaseID string,
	evidence evaluationReviewLeaseEvidence,
) error {
	references := make(map[string][]evaluationExportReference, len(evaluationReviewLeaseFamilies))
	for _, record := range evidence.Attempts {
		reference, err := evaluationReviewReference([]string{record.FactID}, record.FactDigest, record.FactBytes, true)
		if err != nil {
			return err
		}
		references["attempts"] = append(references["attempts"], reference)
	}
	for _, record := range evidence.InvocationTurns {
		reference, err := evaluationReviewReference(
			[]string{record.AttemptID, fmt.Sprintf("%012d", record.TurnIndex)}, record.EvidenceDigest, record.ReceiptBytes, false,
		)
		if err != nil {
			return err
		}
		references["invocationTurnReceipts"] = append(references["invocationTurnReceipts"], reference)
	}
	for _, record := range evidence.InvocationSets {
		reference, err := evaluationReviewReference([]string{record.AttemptID}, record.ReceiptDigest, record.ReceiptBytes, false)
		if err != nil {
			return err
		}
		references["invocationTurnSetReceipts"] = append(references["invocationTurnSetReceipts"], reference)
	}
	for _, record := range evidence.Executions {
		reference, err := evaluationReviewReference([]string{record.AttemptID}, record.ReceiptDigest, record.ReceiptBytes, false)
		if err != nil {
			return err
		}
		references["executionReceipts"] = append(references["executionReceipts"], reference)
	}
	for _, record := range evidence.Scans {
		reference, err := evaluationReviewReference([]string{record.AttemptID}, record.ReceiptDigest, record.ReceiptBytes, true)
		if err != nil {
			return err
		}
		references["reviewRasterScanReceipts"] = append(references["reviewRasterScanReceipts"], reference)
	}
	for _, record := range evidence.Candidates {
		canonical, err := evaluationExportCanonicalValue(canonicalEvaluationReviewCandidateRef(record))
		if err != nil {
			return err
		}
		orderKey, err := evaluationExportOrderKey(record.AttemptID)
		if err != nil {
			return err
		}
		references["reviewCandidateRefs"] = append(references["reviewCandidateRefs"], evaluationExportReference{
			OrderKey: orderKey, RecordDigest: record.CandidateDigest, ByteLength: int64(len(canonical)),
		})
	}
	for _, family := range evaluationReviewLeaseFamilies {
		if err := insertEvaluationExportReferences(ctx, tx, namespaceID, leaseID, family, references[family]); err != nil {
			return err
		}
	}
	return nil
}

func findEvaluationReviewLease(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	cursorKeyBindingDigest string,
) (EvaluationReviewLease, bool, error) {
	var leaseID, persistedKeyDigest string
	err := queryer.QueryRowContext(ctx, `SELECT lease_id, cursor_key_binding_digest
		FROM agent_evaluation_export_leases
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3 AND lease_kind = $4`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, evaluationHumanReviewExportLeaseKind).
		Scan(&leaseID, &persistedKeyDigest)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationReviewLease{}, false, nil
	}
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	if persistedKeyDigest != cursorKeyBindingDigest {
		return EvaluationReviewLease{}, false, conflict("evaluation review lease cursor authority rotated")
	}
	lease, err := loadEvaluationReviewLease(ctx, queryer, namespaceID, partition, leaseID, cursorKeyBindingDigest)
	return lease, true, err
}

// OpenEvaluationReviewLease first creates/replays every server-owned blind
// mapping, then materializes one immutable machine-phase projection in a short
// transaction. No long-lived repeatable-read transaction crosses HTTP calls.
func (repository *Repository) OpenEvaluationReviewLease(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	createdAt time.Time,
	cursorKeyBindingDigest string,
) (EvaluationReviewLease, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationReviewLease{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationReviewLease{}, false, err
	}
	if err := validateEvaluationPartition(partition); err != nil || createdAt.IsZero() ||
		!evaluationDigestPattern.MatchString(cursorKeyBindingDigest) {
		return EvaluationReviewLease{}, false, ErrInvalid
	}
	createdAt = createdAt.UTC().Truncate(time.Millisecond)
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	if existing, found, err := findEvaluationReviewLease(readContext, repository.db, authority.NamespaceID,
		partition, cursorKeyBindingDigest); err != nil {
		return EvaluationReviewLease{}, false, err
	} else if found {
		if !createdAt.Before(existing.ExpiresAt) {
			return EvaluationReviewLease{}, false, conflict("evaluation review lease expired")
		}
		return existing, true, nil
	}
	candidates, err := repository.ListEvaluationReviewCandidateRefs(readContext, authority, partition)
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	for _, candidate := range candidates {
		if _, _, err := repository.CreateEvaluationBlindReviewMapping(
			readContext, authority, partition, candidate.CandidateID,
		); err != nil {
			return EvaluationReviewLease{}, false, err
		}
	}
	tx, err := repository.db.BeginTx(readContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := lockEvaluationPlanForFinalization(readContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationReviewLease{}, false, err
	}
	if existing, found, err := findEvaluationReviewLease(readContext, tx, authority.NamespaceID,
		partition, cursorKeyBindingDigest); err != nil {
		return EvaluationReviewLease{}, false, err
	} else if found {
		if err := tx.Commit(); err != nil {
			return EvaluationReviewLease{}, false, err
		}
		return existing, true, nil
	}
	planRecord, err := loadEvaluationPlanRecord(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	machine, err := evaluationReviewMachineSealForPartition(
		readContext, tx, authority.NamespaceID, partition, planRecord,
	)
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	if createdAt.Before(machine.Plan.PlannedAt) || !createdAt.Before(machine.Plan.ExpiresAt) {
		return EvaluationReviewLease{}, false, conflict("evaluation review lease server time is outside the plan window")
	}
	expiresAt := machine.Plan.ExpiresAt.UTC().Truncate(time.Millisecond)
	evidence, err := loadEvaluationReviewLeaseEvidence(
		readContext, tx, authority.NamespaceID, partition, planRecord, machine.Plan,
	)
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	_, policyDigest, err := evaluationBlindReviewConfiguration(machine.Plan)
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	mappingSetDigest, err := evaluationBlindReviewMappingSetDigest(evidence.Mappings)
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	leaseID, err := evaluationReviewLeaseIdentity(authority.NamespaceID, partition, machine.MachinePhaseDigest)
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	if err := materializeEvaluationReviewLeaseEvidence(
		readContext, tx, authority.NamespaceID, leaseID, evidence,
	); err != nil {
		return EvaluationReviewLease{}, false, err
	}
	specs := evaluationReviewLeaseFamilySpecs()
	summaries := make([]EvaluationExportFamilySummary, len(specs))
	var totalRecordCount, totalRecordBytes int64
	for index, spec := range specs {
		summary, err := summarizeEvaluationExportFamily(readContext, tx, authority.NamespaceID, partition, leaseID, spec)
		if err != nil {
			return EvaluationReviewLease{}, false, err
		}
		summaries[index] = summary
		totalRecordCount += summary.ExpectedRecordCount
		totalRecordBytes += summary.ExpectedTotalBytes
	}
	byFamily := evaluationExportSummaryByFamily(summaries)
	if byFamily["attempts"].ExpectedRecordCount < 1 ||
		byFamily["attempts"].ExpectedRecordCount > maximumEvaluationReviewCandidateCount ||
		byFamily["invocationTurnReceipts"].ExpectedRecordCount > maximumEvaluationReviewInvocationTurnCount ||
		byFamily["invocationTurnSetReceipts"].ExpectedRecordCount != byFamily["attempts"].ExpectedRecordCount ||
		byFamily["executionReceipts"].ExpectedRecordCount != byFamily["attempts"].ExpectedRecordCount ||
		byFamily["reviewRasterScanReceipts"].ExpectedRecordCount != byFamily["attempts"].ExpectedRecordCount ||
		byFamily["reviewCandidateRefs"].ExpectedRecordCount != byFamily["attempts"].ExpectedRecordCount ||
		totalRecordCount > maximumEvaluationExportRecords || totalRecordBytes > maximumEvaluationExportArchiveBytes {
		return EvaluationReviewLease{}, false, conflict("evaluation review lease projection exceeds its bounded denominator")
	}
	commitments := EvaluationReviewLeaseCommitments{
		Format: evaluationReviewLeaseFormat, Version: 1, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, MachinePhaseDigest: machine.MachinePhaseDigest,
		EligibleAttemptSetDigest:          byFamily["attempts"].ExpectedSemanticDigest,
		InvocationTurnReceiptSetDigest:    byFamily["invocationTurnReceipts"].ExpectedSemanticDigest,
		InvocationTurnSetReceiptSetDigest: byFamily["invocationTurnSetReceipts"].ExpectedSemanticDigest,
		ExecutionReceiptSetDigest:         byFamily["executionReceipts"].ExpectedSemanticDigest,
		ReviewRasterScanReceiptSetDigest:  byFamily["reviewRasterScanReceipts"].ExpectedSemanticDigest,
		ReviewCandidateRefSetDigest:       byFamily["reviewCandidateRefs"].ExpectedSemanticDigest,
		BlindReviewMappingSetDigest:       mappingSetDigest, RandomizedPresentationPolicyDigest: policyDigest,
		CreatedAt: evaluationExportInstant(createdAt), ExpiresAt: evaluationExportInstant(expiresAt),
	}
	commitmentsBytes, err := canonicaljson.Bytes(commitments)
	if err != nil || len(commitmentsBytes) > 1_048_576 {
		return EvaluationReviewLease{}, false, conflict("evaluation review lease commitments exceed their limit")
	}
	reviewLeaseDigest, err := canonicaljson.Digest(commitments)
	if err != nil {
		return EvaluationReviewLease{}, false, err
	}
	for _, summary := range summaries {
		if _, err := tx.ExecContext(readContext, `INSERT INTO agent_evaluation_export_lease_families (
			namespace_id, lease_id, family, family_index, record_count, total_bytes,
			semantic_digest, record_set_digest, first_order_key, last_order_key
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, authority.NamespaceID, leaseID,
			summary.Family, summary.FamilyIndex, summary.ExpectedRecordCount, summary.ExpectedTotalBytes,
			summary.ExpectedSemanticDigest, summary.ExpectedRecordSetDigest,
			nullableEvaluationAuthenticityString(pointerEvaluationExportString(summary.FirstOrderKey)),
			nullableEvaluationAuthenticityString(pointerEvaluationExportString(summary.LastOrderKey))); err != nil {
			return EvaluationReviewLease{}, false, err
		}
	}
	if _, err := tx.ExecContext(readContext, `INSERT INTO agent_evaluation_export_leases (
		namespace_id, plan_digest, repository_commit, lease_kind, lease_id, lease_digest,
		cursor_key_binding_digest, evidence_set_digest, authority_payload_digest,
		authority_attestation_digest, evaluation_manifest_digest, semantic_root_digest,
		commitments_digest, commitments_bytes, family_count, total_record_count,
		total_record_bytes, created_at, expires_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NULL, NULL, $8, $9, $10, $11, $12, $13, $14, $15)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, evaluationHumanReviewExportLeaseKind,
		leaseID, reviewLeaseDigest, cursorKeyBindingDigest, machine.MachinePhaseDigest, reviewLeaseDigest,
		commitmentsBytes, int64(len(summaries)), totalRecordCount, totalRecordBytes, createdAt, expiresAt); err != nil {
		return EvaluationReviewLease{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationReviewLease{}, false, err
	}
	return EvaluationReviewLease{
		NamespaceID: authority.NamespaceID, Partition: partition, LeaseID: leaseID,
		ReviewLeaseDigest: reviewLeaseDigest, CursorKeyBindingDigest: cursorKeyBindingDigest,
		Commitments: commitments, Families: summaries, TotalRecordCount: totalRecordCount,
		TotalRecordBytes: totalRecordBytes, CreatedAt: createdAt, ExpiresAt: expiresAt,
		CreatedAtText: evaluationExportInstant(createdAt), ExpiresAtText: evaluationExportInstant(expiresAt),
	}, false, nil
}

func (repository *Repository) GetEvaluationReviewLease(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	leaseID string,
	cursorKeyBindingDigest string,
) (EvaluationReviewLease, error) {
	if err := repository.available(); err != nil {
		return EvaluationReviewLease{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationReviewLease{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil || !validEvaluationServiceIdentity(leaseID) ||
		!evaluationDigestPattern.MatchString(cursorKeyBindingDigest) {
		return EvaluationReviewLease{}, ErrInvalid
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	return loadEvaluationReviewLease(readContext, repository.db, authority.NamespaceID, partition, leaseID, cursorKeyBindingDigest)
}

func (repository *Repository) ReadEvaluationReviewLeasePage(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	leaseID string,
	cursorKeyBindingDigest string,
	family string,
	firstOrdinal int64,
	maximumRecords int64,
	maximumValueBytes int64,
	readAt time.Time,
) (EvaluationExportRecordPage, error) {
	if err := repository.available(); err != nil {
		return EvaluationExportRecordPage{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationExportRecordPage{}, err
	}
	spec, specOK := evaluationReviewLeaseFamilySpecFor(family)
	if err := validateEvaluationPartition(partition); err != nil || !specOK || firstOrdinal < 0 ||
		maximumRecords < 1 || maximumRecords > maximumEvaluationExportPageRecords ||
		maximumValueBytes < maximumEvaluationExportRecordBytes || maximumValueBytes > maximumEvaluationExportPageBytes ||
		!evaluationDigestPattern.MatchString(cursorKeyBindingDigest) || readAt.IsZero() {
		return EvaluationExportRecordPage{}, ErrInvalid
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	lease, err := loadEvaluationReviewLease(readContext, repository.db, authority.NamespaceID,
		partition, leaseID, cursorKeyBindingDigest)
	if err != nil {
		return EvaluationExportRecordPage{}, err
	}
	if !readAt.UTC().Before(lease.ExpiresAt) {
		return EvaluationExportRecordPage{}, conflict("evaluation review lease expired")
	}
	summary := lease.Families[spec.Index]
	if summary.Family != family || firstOrdinal > summary.ExpectedRecordCount {
		return EvaluationExportRecordPage{}, conflict("evaluation review page is outside its family")
	}
	if firstOrdinal == summary.ExpectedRecordCount {
		return EvaluationExportRecordPage{FirstRecordOrdinal: firstOrdinal}, nil
	}
	references, err := loadEvaluationExportReferencePage(readContext, repository.db, authority.NamespaceID,
		leaseID, family, firstOrdinal, maximumRecords, maximumValueBytes)
	if err != nil {
		return EvaluationExportRecordPage{}, err
	}
	sources, err := loadEvaluationExportSourceBytes(readContext, repository.db, authority.NamespaceID, partition,
		leaseID, spec, references[0].Ordinal, references[len(references)-1].Ordinal)
	if err != nil {
		return EvaluationExportRecordPage{}, err
	}
	result := make([]EvaluationExportSourceRecord, len(references))
	for index, reference := range references {
		var value map[string]any
		if family == "reviewCandidateRefs" {
			value, err = loadEvaluationReviewCandidateRefValue(
				readContext, repository.db, authority.NamespaceID, partition, reference.RecordDigest,
			)
		} else {
			source, exists := sources[reference.Ordinal]
			if !exists {
				return EvaluationExportRecordPage{}, conflict("evaluation review source fact is missing")
			}
			if spec.ProjectFactValue {
				value, _, err = evaluationExportFactValue(source)
			} else {
				value, _, err = decodeEvaluationCanonicalObjectWithLimit(source, int(maximumEvaluationExportRecordBytes))
			}
		}
		if err != nil {
			return EvaluationExportRecordPage{}, err
		}
		canonical, err := evaluationExportCanonicalValue(value)
		if err != nil || int64(len(canonical)) != reference.ByteLength {
			return EvaluationExportRecordPage{}, conflict("evaluation review source byte length drifted")
		}
		semanticDigest, err := evaluationExportSemanticDigestForValue(family, value)
		if err != nil || semanticDigest != reference.RecordDigest {
			return EvaluationExportRecordPage{}, conflict("evaluation review source semantic digest drifted")
		}
		contentHash := sha256.Sum256(canonical)
		result[index] = EvaluationExportSourceRecord{
			OrderKey: reference.OrderKey, RecordDigest: reference.RecordDigest,
			ContentDigest: fmt.Sprintf("sha256-%x", contentHash),
			ByteLength:    int64(len(canonical)), Value: json.RawMessage(canonical),
		}
	}
	return EvaluationExportRecordPage{
		Records: result, FirstRecordOrdinal: firstOrdinal,
		HasMore: firstOrdinal+int64(len(result)) < summary.ExpectedRecordCount,
	}, nil
}
