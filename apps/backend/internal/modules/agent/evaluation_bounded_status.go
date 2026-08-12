package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationCoordinatorStatus struct {
	Format                                          string           `json:"format"`
	Version                                         int64            `json:"version"`
	PlanDigest                                      string           `json:"planDigest"`
	RepositoryCommit                                string           `json:"repositoryCommit"`
	ShardID                                         string           `json:"shardId,omitempty"`
	PlannedAttemptCount                             int64            `json:"plannedAttemptCount"`
	RecordedAttemptCount                            int64            `json:"recordedAttemptCount"`
	MissingAttemptCount                             int64            `json:"missingAttemptCount"`
	MissingAttemptSetDigest                         string           `json:"missingAttemptSetDigest"`
	AttemptStatusCounts                             map[string]int64 `json:"attemptStatusCounts"`
	CheckpointCounts                                map[string]int64 `json:"checkpointCounts"`
	UnsettledBudgetReservationCount                 int64            `json:"unsettledBudgetReservationCount"`
	EndpointSmokeDispatchIntentCount                int64            `json:"endpointSmokeDispatchIntentCount"`
	EndpointSmokeTransportReceiptCount              int64            `json:"endpointSmokeTransportReceiptCount"`
	EndpointSmokeResultSpoolReceiptCount            int64            `json:"endpointSmokeResultSpoolReceiptCount"`
	EndpointSmokeResultSpoolDispositionReceiptCount int64            `json:"endpointSmokeResultSpoolDispositionReceiptCount"`
	EndpointSmokeValidationFailureReceiptCount      int64            `json:"endpointSmokeValidationFailureReceiptCount"`
	EndpointSmokeReceiptCount                       int64            `json:"endpointSmokeReceiptCount"`
	TransportDispatchIntentCount                    int64            `json:"transportDispatchIntentCount"`
	TransportReceiptCount                           int64            `json:"transportReceiptCount"`
	ProviderResultSpoolReceiptCount                 int64            `json:"providerResultSpoolReceiptCount"`
	ProviderResultSpoolDispositionReceiptCount      int64            `json:"providerResultSpoolDispositionReceiptCount"`
	InvocationTurnReceiptCount                      int64            `json:"invocationTurnReceiptCount"`
	InvocationTurnSetReceiptCount                   int64            `json:"invocationTurnSetReceiptCount"`
	ResultSubmissionReceiptCount                    int64            `json:"resultSubmissionReceiptCount"`
	ControlledRuntimeReceiptCount                   int64            `json:"controlledRuntimeReceiptCount"`
	CapabilityExecutionReceiptCount                 int64            `json:"capabilityExecutionReceiptCount"`
	AttemptAuthorityOwnerReceiptCount               int64            `json:"attemptAuthorityOwnerReceiptCount"`
	CapabilitySpecificReceiptCount                  int64            `json:"capabilitySpecificReceiptCount"`
	ProviderCapabilityObservationReceiptCount       int64            `json:"providerCapabilityObservationReceiptCount"`
	VerificationAttemptGrantReceiptCount            int64            `json:"verificationAttemptGrantReceiptCount"`
	ReviewRasterScanReceiptCount                    int64            `json:"reviewRasterScanReceiptCount"`
	ReviewCandidateRefCount                         int64            `json:"reviewCandidateRefCount"`
	BlindReviewMappingRefCount                      int64            `json:"blindReviewMappingRefCount"`
	ValidatedHumanReviewArtifactCount               int64            `json:"validatedHumanReviewArtifactCount"`
	ValidatedHumanMetricObservationCount            int64            `json:"validatedHumanMetricObservationCount"`
	SourceReceiptCount                              int64            `json:"sourceReceiptCount"`
	ExecutionReceiptCount                           int64            `json:"executionReceiptCount"`
	LegacyIneligibleAuthorityRequestCount           int64            `json:"legacyIneligibleAuthorityRequestCount"`
	LegacyIneligiblePublicationCount                int64            `json:"legacyIneligiblePublicationCount"`
	RequalificationRequired                         bool             `json:"requalificationRequired"`
	ReadyForFinalization                            bool             `json:"readyForFinalization"`
	ObservedAt                                      string           `json:"observedAt"`
	StatusDigest                                    string           `json:"statusDigest"`
}

type evaluationStatusPlannedAttempt struct {
	AttemptID        string
	DescriptorDigest string
	ShardID          string
	CaseID           string
	Descriptor       map[string]any
}

type evaluationV46EligibilitySnapshot struct {
	LegacyAuthorityRequestCount int64
	LegacyPublicationCount      int64
}

func (snapshot evaluationV46EligibilitySnapshot) requalificationRequired() bool {
	return snapshot.LegacyAuthorityRequestCount != 0 || snapshot.LegacyPublicationCount != 0
}

func queryEvaluationV46EligibilitySnapshot(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	namespaceID string,
	partition EvaluationPlanPartition,
) (evaluationV46EligibilitySnapshot, error) {
	var result evaluationV46EligibilitySnapshot
	err := queryer.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_controlled_authority_requests
			WHERE namespace_id=$1 AND plan_digest=$2 AND NOT v46_eligible),
		(SELECT COUNT(*) FROM (
			SELECT namespace_id,plan_digest FROM agent_evaluation_authority_attestations
				WHERE namespace_id=$1 AND plan_digest=$2 AND NOT v46_eligible
			UNION
			SELECT namespace_id,plan_digest FROM agent_evaluation_evidence_roots
				WHERE namespace_id=$1 AND plan_digest=$2 AND NOT v46_eligible
		) legacy_publications)`, namespaceID, partition.PlanDigest).Scan(
		&result.LegacyAuthorityRequestCount, &result.LegacyPublicationCount,
	)
	return result, err
}

func ensureEvaluationV46EligiblePartition(
	ctx context.Context,
	queryer interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	namespaceID string,
	partition EvaluationPlanPartition,
) error {
	snapshot, err := queryEvaluationV46EligibilitySnapshot(ctx, queryer, namespaceID, partition)
	if err != nil {
		return err
	}
	if snapshot.requalificationRequired() {
		return conflict("evaluation partition contains legacy-ineligible evidence and requires requalification")
	}
	return nil
}

func evaluationStatusVariants(evaluationCase map[string]any) []map[string]any {
	base := make(map[string]any, 2)
	contextSentinel, _ := evaluationCase["contextSentinel"].(bool)
	mediaSentinel, _ := evaluationCase["mediaSentinel"].(bool)
	if contextSentinel {
		base["contextTier"] = "representative"
	}
	if mediaSentinel {
		base["mediaRepresentationTier"] = "representative-transform"
	}
	result := []map[string]any{base}
	if contextSentinel {
		for _, tier := range []string{"small", "near-limit"} {
			variant := make(map[string]any, len(base))
			for key, value := range base {
				variant[key] = value
			}
			variant["contextTier"] = tier
			result = append(result, variant)
		}
	}
	if mediaSentinel {
		for _, tier := range []string{"source-faithful", "near-limit-transform"} {
			variant := make(map[string]any, len(base))
			for key, value := range base {
				variant[key] = value
			}
			variant["mediaRepresentationTier"] = tier
			result = append(result, variant)
		}
	}
	return result
}

func evaluationStatusPlannedAttempts(plan evaluationPlanFact) ([]evaluationStatusPlannedAttempt, error) {
	rawCases, casesOK := plan.Value["concreteCases"].([]any)
	rawTargets, targetsOK := plan.Value["capabilityQualificationTargets"].([]any)
	repetitionPolicy, repetitionOK := objectMember(plan.Value, "repetitionPolicy")
	rawRules, rulesOK := repetitionPolicy["rules"].([]any)
	if !casesOK || !targetsOK || !repetitionOK || !rulesOK {
		return nil, conflict("evaluation status plan schedule is invalid")
	}
	repetitions := make(map[string]int64, len(rawRules))
	for _, raw := range rawRules {
		rule, ok := raw.(map[string]any)
		count, countOK := integerMember(rule, "minimumIndependentAttempts")
		if !ok || !countOK || count < 1 {
			return nil, conflict("evaluation status repetition policy is invalid")
		}
		repetitions[stringMember(rule, "riskClass")] = count
	}
	type keyedAttempt struct {
		identity string
		key      map[string]any
	}
	keys := make([]keyedAttempt, 0, plan.PlannedJourneyCount)
	for _, rawCase := range rawCases {
		evaluationCase, caseOK := rawCase.(map[string]any)
		if !caseOK {
			return nil, conflict("evaluation status case schedule is invalid")
		}
		caseID := stringMember(evaluationCase, "caseId")
		profileID := stringMember(evaluationCase, "capabilityProfileId")
		riskClass := stringMember(evaluationCase, "riskClass")
		repetitionCount := repetitions[riskClass]
		for _, rawTarget := range rawTargets {
			target, targetOK := rawTarget.(map[string]any)
			if !targetOK {
				return nil, conflict("evaluation status target schedule is invalid")
			}
			if stringMember(target, "capabilityProfileId") != profileID {
				continue
			}
			capabilityDescriptorDigest, err := evaluationResolvedCapabilityDescriptorDigest(evaluationCase, target)
			if err != nil {
				return nil, err
			}
			targetID := stringMember(target, "targetId")
			for _, variant := range evaluationStatusVariants(evaluationCase) {
				for repetitionIndex := int64(0); repetitionIndex < repetitionCount; repetitionIndex++ {
					key := map[string]any{
						"caseId": caseID, "capabilityDescriptorDigest": capabilityDescriptorDigest,
						"targetId": targetID, "targetDigest": stringMember(target, "targetDigest"),
						"riskClass": riskClass, "repetitionIndex": repetitionIndex,
					}
					for field, value := range variant {
						key[field] = value
					}
					identity := strings.Join([]string{caseID, targetID, riskClass,
						stringMember(variant, "contextTier"), stringMember(variant, "mediaRepresentationTier"),
						leftPadEvaluationStatusRepetition(repetitionIndex)}, "\x00")
					keys = append(keys, keyedAttempt{identity: identity, key: key})
				}
			}
		}
	}
	sort.Slice(keys, func(left, right int) bool {
		return bytes.Compare([]byte(keys[left].identity), []byte(keys[right].identity)) < 0
	})
	if int64(len(keys)) != plan.PlannedJourneyCount {
		return nil, conflict("evaluation status planned denominator drifted")
	}
	result := make([]evaluationStatusPlannedAttempt, len(keys))
	for index, entry := range keys {
		samplingBase := make(map[string]any, len(entry.key)+1)
		samplingBase["planDigest"] = plan.PlanDigest
		for field, value := range entry.key {
			samplingBase[field] = value
		}
		samplingDigest, err := canonicaljson.Digest(samplingBase)
		if err != nil {
			return nil, err
		}
		shardDigest, err := canonicaljson.Digest(map[string]any{"targetId": stringMember(entry.key, "targetId")})
		if err != nil {
			return nil, err
		}
		attemptID := "evaluation-attempt:" + strings.TrimPrefix(samplingDigest, "sha256-")
		shardID := "evaluation-shard:" + strings.TrimPrefix(shardDigest, "sha256-")
		descriptorBase := map[string]any{
			"attemptId": attemptID, "planDigest": plan.PlanDigest, "shardId": shardID,
			"caseId":                     stringMember(entry.key, "caseId"),
			"capabilityDescriptorDigest": stringMember(entry.key, "capabilityDescriptorDigest"),
			"targetId":                   stringMember(entry.key, "targetId"), "targetDigest": stringMember(entry.key, "targetDigest"),
			"riskClass": stringMember(entry.key, "riskClass"), "repetitionIndex": entry.key["repetitionIndex"],
			"samplingIdentityDigest": samplingDigest,
		}
		if contextTier := stringMember(entry.key, "contextTier"); contextTier != "" {
			descriptorBase["contextTier"] = contextTier
		}
		if mediaTier := stringMember(entry.key, "mediaRepresentationTier"); mediaTier != "" {
			descriptorBase["mediaRepresentationTier"] = mediaTier
		}
		descriptorDigest, err := canonicaljson.Digest(descriptorBase)
		if err != nil {
			return nil, err
		}
		descriptor := cloneEvaluationObject(descriptorBase)
		descriptor["descriptorDigest"] = descriptorDigest
		result[index] = evaluationStatusPlannedAttempt{
			AttemptID: attemptID, DescriptorDigest: descriptorDigest,
			ShardID: shardID, CaseID: stringMember(entry.key, "caseId"), Descriptor: descriptor,
		}
	}
	return result, nil
}

func leftPadEvaluationStatusRepetition(value int64) string {
	text := evaluationExportInteger(value)
	if len(text) >= 6 {
		return text
	}
	return strings.Repeat("0", 6-len(text)) + text
}

func evaluationExportInteger(value int64) string {
	const digits = "0123456789"
	if value == 0 {
		return "0"
	}
	buffer := [20]byte{}
	index := len(buffer)
	for value > 0 {
		index--
		buffer[index] = digits[value%10]
		value /= 10
	}
	return string(buffer[index:])
}

func (repository *Repository) GetEvaluationCoordinatorStatus(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	shardID string,
	observedAt time.Time,
) (EvaluationCoordinatorStatus, error) {
	if err := repository.available(); err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil ||
		(shardID != "" && !validEvaluationServiceIdentity(shardID)) || observedAt.IsZero() {
		return EvaluationCoordinatorStatus{}, ErrInvalid
	}
	observedAt = observedAt.UTC().Truncate(time.Millisecond)
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(readContext, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	defer func() { _ = tx.Rollback() }()
	planRecord, err := loadEvaluationPlanRecord(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	plannedIDs := make(map[string]struct{}, len(planned))
	expectedShards := make(map[string]struct{})
	for _, descriptor := range planned {
		expectedShards[descriptor.ShardID] = struct{}{}
		if shardID == "" || descriptor.ShardID == shardID {
			plannedIDs[descriptor.AttemptID] = struct{}{}
		}
	}
	if shardID != "" && len(plannedIDs) == 0 {
		return EvaluationCoordinatorStatus{}, ErrInvalid
	}
	attemptStatusCounts := make(map[string]int64)
	recordedIDs := make(map[string]struct{}, len(plannedIDs))
	attemptRows, err := tx.QueryContext(readContext, `SELECT attempt_id, shard_id, status
		FROM agent_evaluation_attempts WHERE namespace_id = $1 AND plan_digest = $2
		ORDER BY attempt_id COLLATE "C" ASC`, authority.NamespaceID, partition.PlanDigest)
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	for attemptRows.Next() {
		var attemptID, storedShardID, status string
		if err := attemptRows.Scan(&attemptID, &storedShardID, &status); err != nil {
			_ = attemptRows.Close()
			return EvaluationCoordinatorStatus{}, err
		}
		if _, known := expectedShards[storedShardID]; !known {
			_ = attemptRows.Close()
			return EvaluationCoordinatorStatus{}, conflict("evaluation status attempt shard drifted")
		}
		if _, selected := plannedIDs[attemptID]; selected {
			if _, duplicate := recordedIDs[attemptID]; duplicate {
				_ = attemptRows.Close()
				return EvaluationCoordinatorStatus{}, conflict("evaluation status attempt is duplicate")
			}
			recordedIDs[attemptID] = struct{}{}
			attemptStatusCounts[status]++
		}
	}
	if err := attemptRows.Close(); err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	missingIDs := make([]string, 0, len(plannedIDs)-len(recordedIDs))
	for attemptID := range plannedIDs {
		if _, exists := recordedIDs[attemptID]; !exists {
			missingIDs = append(missingIDs, attemptID)
		}
	}
	sort.Strings(missingIDs)
	missingDigest, err := canonicaljson.Digest(missingIDs)
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	checkpointCounts := make(map[string]int64)
	completedShards := make(map[string]struct{})
	checkpointRows, err := tx.QueryContext(readContext, `SELECT DISTINCT ON (shard_id) shard_id, state, checkpoint_bytes
		FROM agent_evaluation_checkpoints WHERE namespace_id = $1 AND plan_digest = $2
		ORDER BY shard_id COLLATE "C" ASC, revision DESC`, authority.NamespaceID, partition.PlanDigest)
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	for checkpointRows.Next() {
		var checkpointShardID, state string
		var source []byte
		if err := checkpointRows.Scan(&checkpointShardID, &state, &source); err != nil {
			_ = checkpointRows.Close()
			return EvaluationCoordinatorStatus{}, err
		}
		if _, expected := expectedShards[checkpointShardID]; !expected {
			_ = checkpointRows.Close()
			return EvaluationCoordinatorStatus{}, conflict("evaluation status checkpoint shard drifted")
		}
		if shardID == "" || checkpointShardID == shardID {
			checkpointCounts[state]++
		}
		checkpoint, err := decodeEvaluationCheckpoint(source)
		missingRefs, missingOK := checkpoint.Value["missingAttemptRefs"].([]any)
		if err != nil || !missingOK {
			_ = checkpointRows.Close()
			return EvaluationCoordinatorStatus{}, conflict("evaluation status checkpoint fact drifted")
		}
		if state == "completed" && len(missingRefs) == 0 {
			completedShards[checkpointShardID] = struct{}{}
		}
	}
	if err := checkpointRows.Close(); err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	status := EvaluationCoordinatorStatus{
		Format: "prodivix.g4-model-evaluation-status", Version: 1,
		PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit, ShardID: shardID,
		PlannedAttemptCount: int64(len(plannedIDs)), RecordedAttemptCount: int64(len(recordedIDs)),
		MissingAttemptCount: int64(len(missingIDs)), MissingAttemptSetDigest: missingDigest,
		AttemptStatusCounts: attemptStatusCounts, CheckpointCounts: checkpointCounts,
		ObservedAt: evaluationExportInstant(observedAt),
	}
	eligibility, err := queryEvaluationV46EligibilitySnapshot(
		readContext, tx, authority.NamespaceID, partition,
	)
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	status.LegacyIneligibleAuthorityRequestCount = eligibility.LegacyAuthorityRequestCount
	status.LegacyIneligiblePublicationCount = eligibility.LegacyPublicationCount
	status.RequalificationRequired = eligibility.requalificationRequired()
	if err := tx.QueryRowContext(readContext, `SELECT COUNT(*) FROM agent_evaluation_budget_reservations reservation
		LEFT JOIN agent_evaluation_budget_settlements settlement ON settlement.namespace_id = reservation.namespace_id
			AND settlement.plan_digest = reservation.plan_digest AND settlement.reservation_id = reservation.reservation_id
		WHERE reservation.namespace_id = $1 AND reservation.plan_digest = $2 AND settlement.reservation_id IS NULL`,
		authority.NamespaceID, partition.PlanDigest).Scan(&status.UnsettledBudgetReservationCount); err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	var failedEndpointSmokeReceiptCount int64
	if err := tx.QueryRowContext(readContext, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_dispatch_intents WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_transport_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_result_spool_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_spool_disposition_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_validation_failure_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_terminal_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_terminal_receipts WHERE namespace_id = $1 AND plan_digest = $2 AND outcome <> 'passed'),
		(SELECT COUNT(*) FROM agent_evaluation_transport_dispatch_intents WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_transport_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_provider_result_spool_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_provider_result_spool_dispositions WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_invocation_turn_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_invocation_turn_set_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_result_submission_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_controlled_runtime_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_capability_execution_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_attempt_authority_owner_receipts owner
			WHERE namespace_id = $1 AND plan_digest = $2 AND EXISTS (
				SELECT 1 FROM agent_evaluation_attempt_authority_commit_links link
				WHERE link.namespace_id=owner.namespace_id AND link.plan_digest=owner.plan_digest
					AND link.repository_commit=owner.repository_commit AND link.attempt_id=owner.attempt_id
					AND link.receipt_digest=owner.receipt_digest)),
		(SELECT COUNT(*) FROM agent_evaluation_capability_specific_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_provider_capability_observation_receipts observation
			WHERE namespace_id = $1 AND plan_digest = $2 AND EXISTS (
				SELECT 1 FROM agent_evaluation_provider_capability_observation_commit_links link
				WHERE link.namespace_id=observation.namespace_id AND link.plan_digest=observation.plan_digest
					AND link.repository_commit=observation.repository_commit
					AND link.attempt_id=observation.attempt_id
					AND link.receipt_digest=observation.receipt_digest)),
		(SELECT COUNT(*) FROM agent_evaluation_verification_attempt_grant_receipts WHERE namespace_id = $1 AND evaluation_plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_review_raster_scan_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_review_candidates WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_blind_review_mappings WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_validated_human_review_artifacts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_validated_human_metric_observations WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_source_receipts WHERE namespace_id = $1 AND plan_digest = $2),
		(SELECT COUNT(*) FROM agent_evaluation_execution_receipts WHERE namespace_id = $1 AND plan_digest = $2)`,
		authority.NamespaceID, partition.PlanDigest).Scan(
		&status.EndpointSmokeDispatchIntentCount, &status.EndpointSmokeTransportReceiptCount,
		&status.EndpointSmokeResultSpoolReceiptCount, &status.EndpointSmokeResultSpoolDispositionReceiptCount,
		&status.EndpointSmokeValidationFailureReceiptCount, &status.EndpointSmokeReceiptCount,
		&failedEndpointSmokeReceiptCount,
		&status.TransportDispatchIntentCount, &status.TransportReceiptCount,
		&status.ProviderResultSpoolReceiptCount, &status.ProviderResultSpoolDispositionReceiptCount,
		&status.InvocationTurnReceiptCount, &status.InvocationTurnSetReceiptCount,
		&status.ResultSubmissionReceiptCount, &status.ControlledRuntimeReceiptCount,
		&status.CapabilityExecutionReceiptCount, &status.AttemptAuthorityOwnerReceiptCount,
		&status.CapabilitySpecificReceiptCount, &status.ProviderCapabilityObservationReceiptCount,
		&status.VerificationAttemptGrantReceiptCount,
		&status.ReviewRasterScanReceiptCount, &status.ReviewCandidateRefCount,
		&status.BlindReviewMappingRefCount, &status.ValidatedHumanReviewArtifactCount,
		&status.ValidatedHumanMetricObservationCount,
		&status.SourceReceiptCount, &status.ExecutionReceiptCount,
	); err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	var humanReviewReportCount, holdoutReceiptCount int64
	if err := tx.QueryRowContext(readContext, `SELECT
		COUNT(*) FILTER (WHERE fact_type = 'evaluation-human-review-report'),
		COUNT(*) FILTER (WHERE fact_type = 'evaluation-holdout-receipt')
		FROM agent_evaluation_artifacts WHERE namespace_id = $1 AND plan_digest = $2`,
		authority.NamespaceID, partition.PlanDigest).Scan(&humanReviewReportCount, &holdoutReceiptCount); err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	rawSmokeTargets, _ := plan.Value["endpointSmokeTargets"].([]any)
	allShardsCompleted := len(completedShards) == len(expectedShards)
	status.ReadyForFinalization = shardID == "" && !status.RequalificationRequired && status.MissingAttemptCount == 0 &&
		status.UnsettledBudgetReservationCount == 0 && allShardsCompleted &&
		status.EndpointSmokeDispatchIntentCount == int64(len(rawSmokeTargets)) &&
		status.EndpointSmokeTransportReceiptCount == int64(len(rawSmokeTargets)) &&
		status.EndpointSmokeResultSpoolReceiptCount == int64(len(rawSmokeTargets)) &&
		status.EndpointSmokeResultSpoolDispositionReceiptCount == int64(len(rawSmokeTargets)) &&
		status.EndpointSmokeValidationFailureReceiptCount == 0 &&
		status.EndpointSmokeReceiptCount == int64(len(rawSmokeTargets)) &&
		failedEndpointSmokeReceiptCount == 0 &&
		status.InvocationTurnSetReceiptCount == plan.PlannedJourneyCount &&
		status.ProviderCapabilityObservationReceiptCount <= maximumEvaluationObservationRecords &&
		status.ExecutionReceiptCount == plan.PlannedJourneyCount &&
		humanReviewReportCount == 1 && status.ValidatedHumanReviewArtifactCount == 1 &&
		status.ValidatedHumanMetricObservationCount > 0 && holdoutReceiptCount == 1
	statusDigest, err := evaluationCoordinatorStatusDigest(status)
	if err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	status.StatusDigest = statusDigest
	if err := tx.Commit(); err != nil {
		return EvaluationCoordinatorStatus{}, err
	}
	return status, nil
}

func evaluationCoordinatorStatusDigest(status EvaluationCoordinatorStatus) (string, error) {
	status.StatusDigest = ""
	encodedStatus, err := json.Marshal(status)
	if err != nil {
		return "", err
	}
	decoder := json.NewDecoder(bytes.NewReader(encodedStatus))
	decoder.UseNumber()
	var statusBase map[string]any
	if err := decoder.Decode(&statusBase); err != nil {
		return "", err
	}
	delete(statusBase, "statusDigest")
	return canonicaljson.Digest(statusBase)
}
