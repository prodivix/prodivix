package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationFinalizationInspectionFormat = "prodivix.g4-model-evaluation-finalization-inspection"
	evaluationFinalizationFormat           = "prodivix.g4-model-evaluation-finalization"
	maximumEvaluationFinalizationBytes     = 8_388_608
)

type evaluationFinalizationRecord struct {
	Partition                                EvaluationPlanPartition
	ReviewLeaseDigest                        string
	ValidatedHumanReviewArtifactDigest       string
	ValidatedHumanMetricObservationSetDigest string
	MetricReportDigest                       string
	GraderReportDigest                       string
	HumanReviewReportDigest                  string
	HoldoutExecutionReceiptDigest            string
	ManifestDigest                           string
	ReportDigest                             string
	ReportBytes                              []byte
	CompletedAt                              time.Time
}

type evaluationFinalizationSnapshot struct {
	PlanRecord        EvaluationPlanRecord
	Plan              evaluationPlanFact
	Planned           []evaluationStatusPlannedAttempt
	Attempts          []EvaluationAttemptRecord
	Decoded           []evaluationAttemptFact
	Holdout           *EvaluationHoldoutClosureRecord
	Human             *EvaluationValidatedHumanReviewArtifactRecord
	Lease             *EvaluationReviewLease
	ReviewedAttempts  []map[string]any
	HumanObservations []map[string]any
	Missing           []string
}

func evaluationFinalizationCanonicalReport(base map[string]any, digestField string) ([]byte, string, error) {
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, "", err
	}
	value := make(map[string]any, len(base)+1)
	for key, entry := range base {
		value[key] = entry
	}
	value[digestField] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) == 0 || len(encoded) > maximumEvaluationFinalizationBytes {
		return nil, "", conflict("evaluation finalization report exceeds its bounded envelope")
	}
	return encoded, digest, nil
}

func evaluationFinalizationIncomplete(
	partition EvaluationPlanPartition,
	completedAt time.Time,
	missing []string,
) ([]byte, error) {
	canonicalMissing := evaluationCanonicalMissingFacts(missing...)
	if len(canonicalMissing) == 0 {
		return nil, conflict("evaluation incomplete finalization has no missing fact")
	}
	base := map[string]any{
		"format": evaluationFinalizationFormat, "version": int64(1),
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"outcome": "incomplete", "missingFacts": canonicalMissing,
		"completedAt": evaluationExportInstant(completedAt),
	}
	encoded, _, err := evaluationFinalizationCanonicalReport(base, "reportDigest")
	return encoded, err
}

func evaluationFinalizationInspection(snapshot evaluationFinalizationSnapshot) ([]byte, error) {
	artifacts := make([]any, 0, 1)
	base := map[string]any{
		"format": evaluationFinalizationInspectionFormat, "version": int64(1),
		"planDigest": snapshot.Plan.PlanDigest, "repositoryCommit": snapshot.Plan.RepositoryCommit,
		"missingFacts":                     evaluationCanonicalMissingFacts(snapshot.Missing...),
		"reviewedAttempts":                 snapshot.ReviewedAttempts,
		"validatedHumanReviewArtifacts":    artifacts,
		"validatedHumanMetricObservations": snapshot.HumanObservations,
	}
	if snapshot.Human != nil {
		artifact, err := decodeEvaluationValidatedHumanReviewArtifact(snapshot.Human.ArtifactBytes)
		if err != nil {
			return nil, err
		}
		report, err := decodeEvaluationArtifact(snapshot.Human.HumanReviewReportFactBytes, "evaluation-human-review-report")
		if err != nil || validateEvaluationValidatedHumanReviewReport(&artifact, report) != nil {
			return nil, conflict("evaluation finalization human review pair drifted")
		}
		artifacts = append(artifacts, artifact.Value)
		base["humanReviewReport"] = report.Value
	}
	encoded, _, err := evaluationFinalizationCanonicalReport(base, "inspectionDigest")
	return encoded, err
}

func loadEvaluationReviewLeaseByDigest(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	digest string,
) (*EvaluationReviewLease, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT lease_id, cursor_key_binding_digest
		FROM agent_evaluation_export_leases
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND lease_kind=$4 AND lease_digest=$5
		ORDER BY lease_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		evaluationHumanReviewExportLeaseKind, digest)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type identity struct{ leaseID, cursorDigest string }
	identities := make([]identity, 0, 1)
	for rows.Next() {
		var value identity
		if err := rows.Scan(&value.leaseID, &value.cursorDigest); err != nil {
			return nil, err
		}
		identities = append(identities, value)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(identities) == 0 {
		return nil, nil
	}
	if len(identities) != 1 {
		return nil, conflict("evaluation finalization review lease digest is ambiguous")
	}
	lease, err := loadEvaluationReviewLease(
		ctx, queryer, namespaceID, partition, identities[0].leaseID, identities[0].cursorDigest,
	)
	if err != nil {
		return nil, err
	}
	if lease.ReviewLeaseDigest != digest {
		return nil, conflict("evaluation finalization review lease digest drifted")
	}
	return &lease, nil
}

func validateEvaluationFinalizationReviewLease(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	snapshot *evaluationFinalizationSnapshot,
) (evaluationReviewLeaseEvidence, error) {
	if snapshot.Lease == nil || snapshot.Human == nil {
		return evaluationReviewLeaseEvidence{}, conflict("evaluation finalization review authority is incomplete")
	}
	lease := snapshot.Lease
	human := snapshot.Human
	if human.ReviewLeaseDigest != lease.ReviewLeaseDigest ||
		human.ValidatedAt.Before(lease.CreatedAt) || human.ValidatedAt.After(lease.ExpiresAt) {
		return evaluationReviewLeaseEvidence{}, conflict("evaluation finalization human review escaped its lease window")
	}
	machine, err := evaluationFinalizationMachineSealForPartition(
		ctx, tx, namespaceID, partition, snapshot.PlanRecord,
	)
	if err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	if machine.MachinePhaseDigest != lease.Commitments.MachinePhaseDigest {
		return evaluationReviewLeaseEvidence{}, conflict("evaluation finalization machine phase drifted from its review lease")
	}
	evidence, err := loadEvaluationReviewLeaseEvidence(
		ctx, tx, namespaceID, partition, snapshot.PlanRecord, snapshot.Plan,
	)
	if err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	currentRoots, currentCounts, err := evaluationFinalizationReviewEvidenceRoots(evidence)
	if err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	for index, family := range evaluationReviewLeaseFamilies {
		stored := lease.Families[index]
		if stored.Family != family || stored.FamilyIndex != int64(index) ||
			stored.ExpectedRecordCount != currentCounts[family] ||
			stored.ExpectedSemanticDigest != currentRoots[family] {
			return evaluationReviewLeaseEvidence{}, conflict("evaluation finalization review lease family root drifted")
		}
	}
	mappingDigest, err := evaluationBlindReviewMappingSetDigest(evidence.Mappings)
	if err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	_, policyDigest, err := evaluationBlindReviewConfiguration(snapshot.Plan)
	if err != nil {
		return evaluationReviewLeaseEvidence{}, err
	}
	if mappingDigest != lease.Commitments.BlindReviewMappingSetDigest ||
		policyDigest != lease.Commitments.RandomizedPresentationPolicyDigest {
		return evaluationReviewLeaseEvidence{}, conflict("evaluation finalization blind review authority drifted from its lease")
	}
	return evidence, nil
}

func evaluationFinalizationReviewEvidenceRoots(
	evidence evaluationReviewLeaseEvidence,
) (map[string]string, map[string]int64, error) {
	roots := make(map[string]string, len(evaluationReviewLeaseFamilies))
	counts := make(map[string]int64, len(evaluationReviewLeaseFamilies))
	digest := func(family string, values []string) error {
		root, err := canonicaljson.Digest(values)
		if err != nil {
			return err
		}
		roots[family], counts[family] = root, int64(len(values))
		return nil
	}
	attempts := append([]EvaluationAttemptRecord(nil), evidence.Attempts...)
	sort.Slice(attempts, func(left, right int) bool { return attempts[left].FactID < attempts[right].FactID })
	attemptDigests := make([]string, len(attempts))
	for index, record := range attempts {
		attemptDigests[index] = record.FactDigest
	}
	if err := digest("attempts", attemptDigests); err != nil {
		return nil, nil, err
	}
	turns := append([]EvaluationInvocationTurnReceiptRecord(nil), evidence.InvocationTurns...)
	sort.Slice(turns, func(left, right int) bool {
		if turns[left].AttemptID != turns[right].AttemptID {
			return turns[left].AttemptID < turns[right].AttemptID
		}
		return turns[left].TurnIndex < turns[right].TurnIndex
	})
	turnDigests := make([]string, len(turns))
	for index, record := range turns {
		turnDigests[index] = record.EvidenceDigest
	}
	if err := digest("invocationTurnReceipts", turnDigests); err != nil {
		return nil, nil, err
	}
	sets := append([]EvaluationInvocationTurnSetReceiptRecord(nil), evidence.InvocationSets...)
	sort.Slice(sets, func(left, right int) bool { return sets[left].AttemptID < sets[right].AttemptID })
	setDigests := make([]string, len(sets))
	for index, record := range sets {
		setDigests[index] = record.ReceiptDigest
	}
	if err := digest("invocationTurnSetReceipts", setDigests); err != nil {
		return nil, nil, err
	}
	executions := append([]EvaluationExecutionReceiptRecord(nil), evidence.Executions...)
	sort.Slice(executions, func(left, right int) bool { return executions[left].AttemptID < executions[right].AttemptID })
	executionDigests := make([]string, len(executions))
	for index, record := range executions {
		executionDigests[index] = record.ReceiptDigest
	}
	if err := digest("executionReceipts", executionDigests); err != nil {
		return nil, nil, err
	}
	scans := append([]EvaluationReviewRasterScanReceiptRecord(nil), evidence.Scans...)
	sort.Slice(scans, func(left, right int) bool { return scans[left].AttemptID < scans[right].AttemptID })
	scanDigests := make([]string, len(scans))
	for index, record := range scans {
		scanDigests[index] = record.ReceiptDigest
	}
	if err := digest("reviewRasterScanReceipts", scanDigests); err != nil {
		return nil, nil, err
	}
	candidates := append([]EvaluationReviewCandidateRef(nil), evidence.Candidates...)
	sort.Slice(candidates, func(left, right int) bool { return candidates[left].AttemptID < candidates[right].AttemptID })
	candidateDigests := make([]string, len(candidates))
	for index, record := range candidates {
		candidateDigests[index] = record.CandidateDigest
	}
	if err := digest("reviewCandidateRefs", candidateDigests); err != nil {
		return nil, nil, err
	}
	return roots, counts, nil
}

func validateEvaluationFinalizationAuthenticity(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	snapshot *evaluationFinalizationSnapshot,
) (bool, error) {
	evidence, err := queryEvaluationAuthenticityEvidenceV3(
		ctx, tx, namespaceID, partition, snapshot.PlanRecord, snapshot.Attempts, true,
	)
	if err != nil {
		return false, err
	}
	if _, err := validateEvaluationAuthenticityCompletenessV3(
		snapshot.Plan, snapshot.Attempts,
		evidence.EndpointSmokeCommit, evidence.EndpointSmokeIntents, evidence.EndpointSmokeTransports,
		evidence.EndpointSmokeSpools, evidence.EndpointSmokeDispositions, evidence.EndpointSmokeFailures,
		evidence.EndpointSmokes, evidence.PreDispatchFailures, evidence.DispatchIntents, evidence.Transports,
		evidence.Spools, evidence.SpoolDispositions, evidence.InvocationTurns, evidence.InvocationTurnSets,
		evidence.ResultSubmissions, evidence.ControlledRuntimes, evidence.CapabilityExecutions,
		evidence.AttemptAuthorityOwners, evidence.CapabilitySpecifics, evidence.ProviderCapabilityObservations,
		evidence.VerificationAttemptGrants, evidence.ValidatedHumanReviews,
		evidence.ValidatedHumanMetrics, evidence.ValidatedHumanMetricSetDigest, evidence.ReviewRasterScanRecords,
		evidence.ReviewCandidateRefs, evidence.BlindReviewMappings, evidence.Sources, evidence.Executions,
	); err != nil {
		return false, err
	}
	if err := validateEvaluationReviewRasterScanBindings(
		snapshot.PlanRecord, snapshot.Attempts, evidence.ReviewRasterScanRecords,
	); err != nil {
		return false, err
	}
	if err := validateEvaluationReviewCandidateBindings(
		snapshot.PlanRecord, snapshot.Attempts, evidence.InvocationTurns, evidence.Executions,
		evidence.ReviewRasterScanRecords, evidence.ReviewCandidateRefs, true,
	); err != nil {
		return false, err
	}
	return validateEvaluationFinalizationAttemptGradingAuthority(
		ctx, tx, namespaceID, partition, snapshot, evidence,
	)
}

func evaluationFinalizationPlanRequiresHumanAuthority(plan evaluationPlanFact) bool {
	thresholds, ok := objectMember(plan.Value, "thresholds")
	if !ok {
		return true
	}
	metrics, ok := thresholds["metrics"].([]any)
	if !ok {
		return true
	}
	for _, raw := range metrics {
		metric, ok := raw.(map[string]any)
		if !ok || stringMember(metric, "requiredAuthority") == "human" {
			return true
		}
	}
	return false
}

func loadEvaluationFinalizationSnapshot(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
	plan evaluationPlanFact,
	humanReviewAuthority EvaluationHumanReviewAuthority,
) (evaluationFinalizationSnapshot, error) {
	snapshot := evaluationFinalizationSnapshot{PlanRecord: planRecord, Plan: plan}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return snapshot, err
	}
	snapshot.Planned = planned
	attempts, err := queryEvaluationAttempts(ctx, tx, namespaceID, partition, planRecord, "")
	if err != nil {
		return snapshot, err
	}
	snapshot.Attempts = attempts
	expected := make(map[string]evaluationStatusPlannedAttempt, len(planned))
	for _, descriptor := range planned {
		expected[descriptor.AttemptID] = descriptor
	}
	if len(attempts) != len(planned) {
		snapshot.Missing = append(snapshot.Missing, "attempt-set")
	} else {
		snapshot.Decoded = make([]evaluationAttemptFact, len(attempts))
		for index, record := range attempts {
			descriptor, exists := expected[record.FactID]
			if !exists || descriptor.DescriptorDigest != record.DescriptorDigest ||
				descriptor.ShardID != record.ShardID || descriptor.CaseID != record.CaseID {
				return snapshot, conflict("evaluation finalization attempt denominator drifted")
			}
			decoded, err := decodeEvaluationAttempt(record.FactBytes)
			if err != nil {
				return snapshot, err
			}
			snapshot.Decoded[index] = decoded
		}
	}
	holdout, err := loadEvaluationHoldoutClosure(ctx, tx, namespaceID, partition)
	if err != nil {
		return snapshot, err
	}
	snapshot.Holdout = holdout
	if holdout == nil {
		snapshot.Missing = append(snapshot.Missing, "holdout-closure")
	}
	human, err := queryEvaluationValidatedHumanReviewArtifact(ctx, tx, namespaceID, partition)
	if err != nil {
		return snapshot, err
	}
	snapshot.Human = human
	if human == nil {
		snapshot.Missing = append(snapshot.Missing,
			"human-review-report", "validated-human-review-artifact", "review-lease")
	} else {
		lease, err := loadEvaluationReviewLeaseByDigest(
			ctx, tx, namespaceID, partition, human.ReviewLeaseDigest,
		)
		if err != nil {
			return snapshot, err
		}
		snapshot.Lease = lease
		if lease == nil {
			snapshot.Missing = append(snapshot.Missing, "review-lease")
		}
	}
	if len(snapshot.Missing) != 0 {
		snapshot.Missing = evaluationCanonicalMissingFacts(snapshot.Missing...)
		return snapshot, nil
	}
	leaseEvidence, err := validateEvaluationFinalizationReviewLease(ctx, tx, namespaceID, partition, &snapshot)
	if err != nil {
		return snapshot, err
	}
	if snapshot.Holdout.ReceiptDigest == "" {
		return snapshot, conflict("evaluation finalization holdout receipt is empty")
	}
	if len(leaseEvidence.Attempts) > 18 {
		return snapshot, conflict("evaluation finalization reviewed attempt projection exceeds its bound")
	}
	snapshot.ReviewedAttempts = make([]map[string]any, len(leaseEvidence.Attempts))
	for index, record := range leaseEvidence.Attempts {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return snapshot, err
		}
		snapshot.ReviewedAttempts[index] = attempt.Value
	}
	sort.Slice(snapshot.ReviewedAttempts, func(left, right int) bool {
		leftDescriptor, _ := objectMember(snapshot.ReviewedAttempts[left], "descriptor")
		rightDescriptor, _ := objectMember(snapshot.ReviewedAttempts[right], "descriptor")
		return stringMember(leftDescriptor, "attemptId") < stringMember(rightDescriptor, "attemptId")
	})
	gradingAuthorityComplete, err := validateEvaluationFinalizationAuthenticity(
		ctx, tx, namespaceID, partition, &snapshot,
	)
	if err != nil {
		return snapshot, err
	}
	if !gradingAuthorityComplete {
		snapshot.Missing = append(snapshot.Missing, "attempt-grading-authority")
	}
	artifacts, err := queryEvaluationArtifacts(ctx, tx, namespaceID, partition, "")
	if err != nil {
		return snapshot, err
	}
	for _, artifact := range artifacts {
		switch artifact.FactType {
		case "evaluation-metric-report", "evaluation-grader-report", "evaluation-manifest":
			return snapshot, conflict("evaluation finalization result artifact was preemptively occupied")
		}
	}
	holdoutArtifact, err := evaluationSingletonArtifact(artifacts, "evaluation-holdout-receipt")
	if err != nil || holdoutArtifact.FactDigest != snapshot.Holdout.ReceiptDigest ||
		!bytes.Equal(holdoutArtifact.FactBytes, snapshot.Holdout.ReceiptFactBytes) {
		return snapshot, conflict("evaluation finalization holdout artifact drifted from its sealed closure")
	}
	if err := validateEvaluationValidatedHumanReviewSnapshot(artifacts, snapshot.Human); err != nil {
		return snapshot, err
	}
	if evaluationFinalizationPlanRequiresHumanAuthority(plan) && humanReviewAuthority == nil {
		snapshot.Missing = append(snapshot.Missing, "validated-human-review-authority")
	} else if evaluationFinalizationPlanRequiresHumanAuthority(plan) {
		frozenAuthority, err := humanReviewAuthority.ResolveHumanReviewAuthority(ctx, planRecord, *snapshot.Holdout)
		if err != nil {
			return snapshot, err
		}
		decodedArtifact, err := decodeEvaluationValidatedHumanReviewArtifact(snapshot.Human.ArtifactBytes)
		if err != nil {
			return snapshot, err
		}
		humanReport, err := decodeEvaluationArtifact(snapshot.Human.HumanReviewReportFactBytes, "evaluation-human-review-report")
		if err != nil {
			return snapshot, err
		}
		if err := validateEvaluationHumanReviewCryptographicAuthority(
			plan, frozenAuthority, decodedArtifact, humanReport,
		); err != nil {
			return snapshot, err
		}
		if err := validateEvaluationHumanReviewDurableBindings(
			ctx, tx, namespaceID, partition, plan, leaseEvidence, decodedArtifact, humanReport,
		); err != nil {
			return snapshot, err
		}
		serverObservations, err := createEvaluationValidatedHumanMetricObservations(
			plan, snapshot.Decoded, decodedArtifact, humanReport,
		)
		if err != nil {
			return snapshot, err
		}
		serverBytes, err := canonicaljson.Bytes(serverObservations)
		serverSetDigest, setDigestErr := evaluationValidatedHumanMetricObservationSetDigest(serverObservations)
		if err != nil || setDigestErr != nil || !bytes.Equal(serverBytes, snapshot.Human.ValidatedHumanMetricObservationBytes) ||
			serverSetDigest != snapshot.Human.ValidatedHumanMetricObservationSetDigest {
			return snapshot, conflict("evaluation finalization validated human metric projection drifted")
		}
		snapshot.HumanObservations = serverObservations
	}
	snapshot.Missing = evaluationCanonicalMissingFacts(snapshot.Missing...)
	return snapshot, nil
}

func (repository *Repository) InspectEvaluationFinalization(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	humanReviewAuthority EvaluationHumanReviewAuthority,
) ([]byte, error) {
	readContext, cancel, tx, planRecord, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return nil, err
	}
	snapshot, err := loadEvaluationFinalizationSnapshot(
		readContext, tx, authority.NamespaceID, partition, planRecord, plan, humanReviewAuthority,
	)
	if err != nil {
		return nil, err
	}
	report, err := evaluationFinalizationInspection(snapshot)
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return report, nil
}

func loadEvaluationFinalizationRecord(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) (*evaluationFinalizationRecord, error) {
	var record evaluationFinalizationRecord
	record.Partition = partition
	err := queryer.QueryRowContext(ctx, `SELECT repository_commit, review_lease_digest,
		validated_human_review_artifact_digest, validated_human_metric_observation_set_digest,
		metric_report_digest, grader_report_digest,
		human_review_report_digest, holdout_execution_receipt_digest, manifest_digest,
		report_digest, report_bytes, completed_at
		FROM agent_evaluation_finalizations
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(
		&record.Partition.RepositoryCommit, &record.ReviewLeaseDigest,
		&record.ValidatedHumanReviewArtifactDigest, &record.ValidatedHumanMetricObservationSetDigest,
		&record.MetricReportDigest,
		&record.GraderReportDigest, &record.HumanReviewReportDigest,
		&record.HoldoutExecutionReceiptDigest, &record.ManifestDigest,
		&record.ReportDigest, &record.ReportBytes, &record.CompletedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	value, canonical, err := decodeEvaluationCanonicalObjectWithLimit(
		record.ReportBytes, maximumEvaluationFinalizationBytes,
	)
	if err != nil || !bytes.Equal(canonical, record.ReportBytes) ||
		!exactEvaluationKeys(value, []string{
			"format", "version", "planDigest", "repositoryCommit", "outcome", "missingFacts",
			"manifest", "completedAt", "reportDigest",
		}) || value["format"] != evaluationFinalizationFormat ||
		stringMember(value, "planDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit ||
		stringMember(value, "reportDigest") != record.ReportDigest ||
		stringMember(value, "completedAt") != evaluationExportInstant(record.CompletedAt) {
		return nil, conflict("persisted evaluation finalization report drifted")
	}
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != "reportDigest" {
			base[key] = entry
		}
	}
	digest, err := canonicaljson.Digest(base)
	missing, missingOK := value["missingFacts"].([]any)
	manifest, manifestOK := value["manifest"].(map[string]any)
	if err != nil || digest != record.ReportDigest || !missingOK || len(missing) != 0 || !manifestOK ||
		stringMember(manifest, "manifestDigest") != record.ManifestDigest ||
		stringMember(manifest, "outcome") != stringMember(value, "outcome") {
		return nil, conflict("persisted evaluation finalization digest drifted")
	}
	return &record, nil
}

func loadEvaluationFinalizationArtifact(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	factType string,
) (EvaluationArtifactRecord, error) {
	records, err := queryEvaluationArtifacts(
		ctx, queryer, namespaceID, partition, " AND fact_type = $4", factType,
	)
	if err != nil {
		return EvaluationArtifactRecord{}, err
	}
	return evaluationSingletonArtifact(records, factType)
}

func validateEvaluationFinalizationReplay(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	record *evaluationFinalizationRecord,
	completedAt time.Time,
	reviewLeaseDigest string,
	humanArtifactDigest string,
	humanMetricObservationSetDigest string,
) error {
	if record == nil {
		return ErrNotFound
	}
	if record.ReviewLeaseDigest != reviewLeaseDigest ||
		record.ValidatedHumanReviewArtifactDigest != humanArtifactDigest ||
		record.ValidatedHumanMetricObservationSetDigest != humanMetricObservationSetDigest ||
		record.CompletedAt.UTC() != completedAt.UTC() {
		return conflict("evaluation finalization immutable replay drifted")
	}
	for _, expected := range []struct{ factType, digest string }{
		{"evaluation-metric-report", record.MetricReportDigest},
		{"evaluation-grader-report", record.GraderReportDigest},
		{"evaluation-human-review-report", record.HumanReviewReportDigest},
		{"evaluation-holdout-receipt", record.HoldoutExecutionReceiptDigest},
		{"evaluation-manifest", record.ManifestDigest},
	} {
		artifact, err := loadEvaluationFinalizationArtifact(
			ctx, tx, namespaceID, record.Partition, expected.factType,
		)
		if err != nil || artifact.FactDigest != expected.digest {
			return conflict("evaluation finalization referenced artifact drifted")
		}
	}
	human, err := queryEvaluationValidatedHumanReviewArtifact(ctx, tx, namespaceID, record.Partition)
	if err != nil || human == nil || human.ArtifactDigest != humanArtifactDigest ||
		human.ReviewLeaseDigest != reviewLeaseDigest || human.HumanReviewReportDigest != record.HumanReviewReportDigest {
		return conflict("evaluation finalization validated human authority drifted")
	}
	if human.ValidatedHumanMetricObservationSetDigest != humanMetricObservationSetDigest {
		return conflict("evaluation finalization validated human metric authority drifted")
	}
	holdout, err := loadEvaluationHoldoutClosure(ctx, tx, namespaceID, record.Partition)
	if err != nil || holdout == nil || holdout.ReceiptDigest != record.HoldoutExecutionReceiptDigest {
		return conflict("evaluation finalization holdout closure drifted")
	}
	return nil
}

func insertEvaluationFinalizationArtifact(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	artifact evaluationArtifactFact,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_artifacts (
		namespace_id, plan_digest, fact_type, fact_id, fact_digest, outcome, fact_json, fact_bytes, recorded_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT DO NOTHING`,
		namespaceID, artifact.PlanDigest, artifact.FactType, artifact.FactID, artifact.FactDigest,
		nullableEvaluationAuthenticityString(artifact.Outcome), string(artifact.Canonical), artifact.Canonical, artifact.RecordedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted == 1 {
		return err
	}
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT fact_bytes FROM agent_evaluation_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2 AND fact_type=$3 AND fact_id=$4 FOR SHARE`,
		namespaceID, artifact.PlanDigest, artifact.FactType, artifact.FactID).Scan(&existing); err != nil {
		return err
	}
	if !bytes.Equal(existing, artifact.Canonical) {
		return conflict("evaluation finalization artifact immutable replay drifted")
	}
	return nil
}

func (repository *Repository) FinalizeEvaluation(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	completedAt time.Time,
	serverNow time.Time,
	reviewLeaseDigest string,
	validatedHumanReviewArtifactDigest string,
	validatedHumanMetricObservationSetDigest string,
	humanReviewAuthority EvaluationHumanReviewAuthority,
) ([]byte, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return nil, false, err
	}
	if completedAt.IsZero() || serverNow.IsZero() || !evaluationDigestPattern.MatchString(reviewLeaseDigest) ||
		!evaluationDigestPattern.MatchString(validatedHumanReviewArtifactDigest) ||
		!evaluationDigestPattern.MatchString(validatedHumanMetricObservationSetDigest) {
		return nil, false, ErrInvalid
	}
	completedAt = completedAt.UTC().Truncate(time.Millisecond)
	serverNow = serverNow.UTC().Truncate(time.Millisecond)
	if completedAt.After(serverNow) {
		return nil, false, conflict("evaluation finalization completion time is in the future")
	}
	writeContext, cancel, tx, planRecord, plan, err := beginEvaluationAuthenticityWrite(
		ctx, repository, authority, partition,
	)
	if err != nil {
		return nil, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := lockEvaluationPlanForFinalization(writeContext, tx, authority.NamespaceID, partition); err != nil {
		return nil, false, err
	}
	intent, err := loadEvaluationFinalizationIntent(writeContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, false, err
	}
	if intent == nil || !intent.CompletedAt.Equal(completedAt) {
		return nil, false, conflict("evaluation finalization has no exact durable intent")
	}
	existing, err := loadEvaluationFinalizationRecord(writeContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, false, err
	}
	if existing != nil {
		if err := validateEvaluationFinalizationReplay(
			writeContext, tx, authority.NamespaceID, existing, completedAt,
			reviewLeaseDigest, validatedHumanReviewArtifactDigest, validatedHumanMetricObservationSetDigest,
		); err != nil {
			return nil, false, err
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return append([]byte(nil), existing.ReportBytes...), true, nil
	}
	snapshot, err := loadEvaluationFinalizationSnapshot(
		writeContext, tx, authority.NamespaceID, partition, planRecord, plan, humanReviewAuthority,
	)
	if err != nil {
		return nil, false, err
	}
	if snapshot.Human != nil && (snapshot.Human.ReviewLeaseDigest != reviewLeaseDigest ||
		snapshot.Human.ArtifactDigest != validatedHumanReviewArtifactDigest ||
		snapshot.Human.ValidatedHumanMetricObservationSetDigest != validatedHumanMetricObservationSetDigest) {
		return nil, false, conflict("evaluation finalization request human authority drifted")
	}
	if len(snapshot.Missing) != 0 {
		report, err := evaluationFinalizationIncomplete(partition, completedAt, snapshot.Missing)
		return report, false, err
	}
	if err := validateEvaluationFinalizationWindow(snapshot, completedAt); err != nil {
		return nil, false, err
	}
	metric, grader, manifest, report, reportMissing, err := buildEvaluationFinalizationArtifacts(snapshot, completedAt)
	if err != nil {
		return nil, false, err
	}
	if len(reportMissing) != 0 {
		incomplete, err := evaluationFinalizationIncomplete(partition, completedAt, reportMissing)
		return incomplete, false, err
	}
	for _, artifact := range []evaluationArtifactFact{metric, grader, manifest} {
		if err := insertEvaluationFinalizationArtifact(writeContext, tx, authority.NamespaceID, artifact); err != nil {
			return nil, false, err
		}
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_finalizations (
		namespace_id, plan_digest, repository_commit, review_lease_digest,
		validated_human_review_artifact_digest, validated_human_metric_observation_set_digest,
		metric_report_digest, grader_report_digest,
		human_review_report_digest, holdout_execution_receipt_digest, manifest_digest,
		report_digest, report_bytes, completed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		reviewLeaseDigest, validatedHumanReviewArtifactDigest, validatedHumanMetricObservationSetDigest,
		metric.FactDigest, grader.FactDigest,
		snapshot.Human.HumanReviewReportDigest, snapshot.Holdout.ReceiptDigest, manifest.FactDigest,
		stringMemberFromCanonical(report, "reportDigest"), report, completedAt)
	if err != nil {
		return nil, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return nil, false, err
	}
	if inserted != 1 {
		return nil, false, conflict("evaluation finalization raced with another immutable writer")
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return report, false, nil
}

func validateEvaluationFinalizationWindow(snapshot evaluationFinalizationSnapshot, completedAt time.Time) error {
	if completedAt.Before(snapshot.Plan.PlannedAt) || completedAt.After(snapshot.Plan.ExpiresAt) {
		return conflict("evaluation finalization completion time is outside the frozen plan")
	}
	for _, attempt := range snapshot.Decoded {
		if completedAt.Before(attempt.CompletedAt) {
			return conflict("evaluation finalization predates an immutable attempt")
		}
	}
	if snapshot.Holdout == nil || completedAt.Before(snapshot.Holdout.SealedAt) {
		return conflict("evaluation finalization predates its holdout closure")
	}
	if snapshot.Human == nil || completedAt.Before(snapshot.Human.ValidatedAt) {
		return conflict("evaluation finalization predates its validated human review")
	}
	humanReport, err := decodeEvaluationArtifact(
		snapshot.Human.HumanReviewReportFactBytes, "evaluation-human-review-report",
	)
	if err != nil {
		return err
	}
	if completedAt.Before(humanReport.RecordedAt) {
		return conflict("evaluation finalization predates its human review report")
	}
	return nil
}

func stringMemberFromCanonical(source []byte, field string) string {
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value map[string]any
	if decoder.Decode(&value) != nil {
		return ""
	}
	return stringMember(value, field)
}
