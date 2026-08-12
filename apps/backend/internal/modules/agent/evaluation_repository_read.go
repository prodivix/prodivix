package agent

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"math/big"
	"regexp"
	"sort"
	"strings"
	"time"
)

const maximumEvaluationReadDuration = 2 * time.Minute

var evaluationRepositoryCommitPattern = regexp.MustCompile(`^[a-f0-9]{40}$`)

// EvaluationPlanPartition binds every recovery and export read to one frozen
// evaluation plan at one exact repository commit.
type EvaluationPlanPartition struct {
	PlanDigest       string
	RepositoryCommit string
}

type EvaluationPlanRecord struct {
	EvaluationFactRecord
	PlanID              string
	RepositoryCommit    string
	PlannedJourneyCount int64
	PlannedAt           time.Time
	ExpiresAt           time.Time
}

type EvaluationAttemptSelector struct {
	AttemptID        string
	DescriptorDigest string
}

type EvaluationAttemptRecord struct {
	EvaluationFactRecord
	DescriptorDigest       string
	SamplingIdentityDigest string
	IndependentRunID       string
	ShardID                string
	CaseID                 string
	TargetID               string
	Status                 string
	Outcome                string
	StartedAt              time.Time
	CompletedAt            time.Time
}

type EvaluationCheckpointRecord struct {
	EvaluationFactRecord
	ShardID         string
	Revision        int64
	LeaseOwnerID    string
	LeaseGeneration int64
	State           string
	UpdatedAt       time.Time
}

type EvaluationArtifactSelector struct {
	FactType string
	FactID   string
}

type EvaluationArtifactRecord struct {
	EvaluationFactRecord
	Outcome string
}

type EvaluationBudgetSnapshot struct {
	NamespaceID             string
	PlanDigest              string
	Revision                int64
	UpdatedAt               time.Time
	Reservations            []EvaluationBudgetReservationRecord
	Settlements             []EvaluationBudgetSettlementRecord
	UnsettledReservationIDs []string
}

type evaluationReadQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func validateEvaluationPartition(partition EvaluationPlanPartition) error {
	if !evaluationDigestPattern.MatchString(partition.PlanDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(partition.RepositoryCommit) {
		return ErrInvalid
	}
	return nil
}

func evaluationReadContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, maximumEvaluationReadDuration)
}

func (repository *Repository) beginEvaluationReadSnapshot(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (context.Context, context.CancelFunc, *sql.Tx, EvaluationPlanRecord, error) {
	if err := repository.available(); err != nil {
		return nil, nil, nil, EvaluationPlanRecord{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, nil, nil, EvaluationPlanRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return nil, nil, nil, EvaluationPlanRecord{}, err
	}
	readContext, cancel := evaluationReadContext(ctx)
	tx, err := repository.db.BeginTx(readContext, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	})
	if err != nil {
		cancel()
		return nil, nil, nil, EvaluationPlanRecord{}, err
	}
	plan, err := loadEvaluationPlanRecord(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		_ = tx.Rollback()
		cancel()
		return nil, nil, nil, EvaluationPlanRecord{}, err
	}
	return readContext, cancel, tx, plan, nil
}

func commitEvaluationReadSnapshot(tx *sql.Tx) error {
	if err := tx.Commit(); err != nil {
		return err
	}
	return nil
}

func (repository *Repository) GetEvaluationPlan(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationPlanRecord, error) {
	_, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationPlanRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationPlanRecord{}, err
	}
	return plan, nil
}

func (repository *Repository) GetEvaluationAttempt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	selector EvaluationAttemptSelector,
) (EvaluationAttemptRecord, error) {
	if (strings.TrimSpace(selector.AttemptID) == "") == (strings.TrimSpace(selector.DescriptorDigest) == "") {
		return EvaluationAttemptRecord{}, ErrInvalid
	}
	if selector.DescriptorDigest != "" && !evaluationDigestPattern.MatchString(selector.DescriptorDigest) {
		return EvaluationAttemptRecord{}, ErrInvalid
	}
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationAttemptRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	condition, value := "attempt_id = $4", selector.AttemptID
	if selector.DescriptorDigest != "" {
		condition, value = "descriptor_digest = $4", selector.DescriptorDigest
	}
	records, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan,
		" AND "+condition, value)
	if err != nil {
		return EvaluationAttemptRecord{}, err
	}
	if len(records) == 0 {
		return EvaluationAttemptRecord{}, ErrNotFound
	}
	if len(records) != 1 {
		return EvaluationAttemptRecord{}, conflict("evaluation attempt selector matched duplicate durable facts")
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationAttemptRecord{}, err
	}
	return records[0], nil
}

func (repository *Repository) ListEvaluationAttempts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationAttemptRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetLatestEvaluationCheckpoint(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	shardID string,
) (EvaluationCheckpointRecord, error) {
	if strings.TrimSpace(shardID) == "" {
		return EvaluationCheckpointRecord{}, ErrInvalid
	}
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationCheckpointRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationCheckpoints(readContext, tx, authority.NamespaceID, partition,
		" AND shard_id = $4", shardID)
	if err != nil {
		return EvaluationCheckpointRecord{}, err
	}
	if len(records) == 0 {
		return EvaluationCheckpointRecord{}, ErrNotFound
	}
	latest := records[len(records)-1]
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationCheckpointRecord{}, err
	}
	return latest, nil
}

func (repository *Repository) ListEvaluationCheckpoints(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCheckpointRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationCheckpoints(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationArtifact(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	selector EvaluationArtifactSelector,
) (EvaluationArtifactRecord, error) {
	if !supportedEvaluationArtifactType(selector.FactType) || strings.TrimSpace(selector.FactID) == "" {
		return EvaluationArtifactRecord{}, ErrInvalid
	}
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationArtifactRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationArtifacts(readContext, tx, authority.NamespaceID, partition,
		" AND fact_type = $4 AND fact_id = $5", selector.FactType, selector.FactID)
	if err != nil {
		return EvaluationArtifactRecord{}, err
	}
	if len(records) == 0 {
		return EvaluationArtifactRecord{}, ErrNotFound
	}
	if len(records) != 1 {
		return EvaluationArtifactRecord{}, conflict("evaluation artifact selector matched duplicate durable facts")
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationArtifactRecord{}, err
	}
	return records[0], nil
}

func (repository *Repository) ListEvaluationArtifacts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	factType string,
) ([]EvaluationArtifactRecord, error) {
	if factType != "" && !supportedEvaluationArtifactType(factType) {
		return nil, ErrInvalid
	}
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	condition := ""
	args := []any(nil)
	if factType != "" {
		condition, args = " AND fact_type = $4", []any{factType}
	}
	records, err := queryEvaluationArtifacts(readContext, tx, authority.NamespaceID, partition, condition, args...)
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationBudgetSnapshot(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationBudgetSnapshot, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationBudgetSnapshot{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	snapshot, err := loadEvaluationBudgetSnapshot(readContext, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return EvaluationBudgetSnapshot{}, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationBudgetSnapshot{}, err
	}
	return snapshot, nil
}

func loadEvaluationPlanRecord(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationPlanRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT evaluation_plan_id, plan_digest, repository_commit,
		planned_journey_count, plan_bytes, planned_at, expires_at
	FROM agent_evaluation_plans
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return EvaluationPlanRecord{}, err
	}
	defer rows.Close()
	records := make([]EvaluationPlanRecord, 0, 1)
	for rows.Next() {
		var planID, planDigest, repositoryCommit string
		var plannedJourneyCount int64
		var source []byte
		var plannedAt, expiresAt time.Time
		if err := rows.Scan(&planID, &planDigest, &repositoryCommit, &plannedJourneyCount, &source, &plannedAt, &expiresAt); err != nil {
			return EvaluationPlanRecord{}, err
		}
		plan, err := decodeEvaluationPlan(source)
		if err != nil {
			return EvaluationPlanRecord{}, fmt.Errorf("decode persisted evaluation plan: %w", err)
		}
		if !bytes.Equal(source, plan.Canonical) || plan.PlanID != planID || plan.PlanDigest != planDigest ||
			plan.RepositoryCommit != repositoryCommit || plan.PlannedJourneyCount != plannedJourneyCount ||
			!plan.PlannedAt.Equal(plannedAt) || !plan.ExpiresAt.Equal(expiresAt) ||
			planDigest != partition.PlanDigest || repositoryCommit != partition.RepositoryCommit {
			return EvaluationPlanRecord{}, conflict("persisted evaluation plan metadata drifted from its canonical fact")
		}
		records = append(records, EvaluationPlanRecord{
			EvaluationFactRecord: evaluationRecord(namespaceID, planDigest, "evaluation-plan", planID, planDigest, plan.Canonical, plan.PlannedAt),
			PlanID:               planID, RepositoryCommit: repositoryCommit, PlannedJourneyCount: plannedJourneyCount,
			PlannedAt: plan.PlannedAt, ExpiresAt: plan.ExpiresAt,
		})
	}
	if err := rows.Err(); err != nil {
		return EvaluationPlanRecord{}, err
	}
	if len(records) == 0 {
		return EvaluationPlanRecord{}, ErrNotFound
	}
	if len(records) != 1 {
		return EvaluationPlanRecord{}, conflict("evaluation plan partition contains duplicate durable facts")
	}
	return records[0], nil
}

func queryEvaluationAttempts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
	condition string,
	args ...any,
) ([]EvaluationAttemptRecord, error) {
	queryArgs := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	queryArgs = append(queryArgs, args...)
	rows, err := queryer.QueryContext(ctx, `SELECT attempt_id, descriptor_digest, sampling_identity_digest,
		independent_run_id, shard_id, case_id, target_id, status, outcome, attempt_digest,
		attempt_bytes, started_at, completed_at
	FROM agent_evaluation_attempts
	WHERE namespace_id = $1 AND plan_digest = $2
	  AND EXISTS (
		SELECT 1 FROM agent_evaluation_plans
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	  )`+condition+`
	ORDER BY descriptor_digest COLLATE "C" ASC, attempt_id COLLATE "C" ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationAttemptRecord, 0)
	for rows.Next() {
		var attemptID, descriptorDigest, samplingDigest, independentRunID string
		var shardID, caseID, targetID, status, outcome, attemptDigest string
		var source []byte
		var startedAt, completedAt time.Time
		if err := rows.Scan(&attemptID, &descriptorDigest, &samplingDigest, &independentRunID,
			&shardID, &caseID, &targetID, &status, &outcome, &attemptDigest,
			&source, &startedAt, &completedAt); err != nil {
			return nil, err
		}
		attempt, err := decodeEvaluationAttempt(source)
		if err != nil {
			return nil, fmt.Errorf("decode persisted evaluation attempt: %w", err)
		}
		if err := validateEvaluationAttemptPlanBinding(plan.FactBytes, attempt); err != nil {
			return nil, err
		}
		if !bytes.Equal(source, attempt.Canonical) || attempt.PlanDigest != partition.PlanDigest ||
			attempt.AttemptID != attemptID || attempt.DescriptorDigest != descriptorDigest ||
			attempt.SamplingIdentityDigest != samplingDigest || attempt.IndependentRunID != independentRunID ||
			attempt.ShardID != shardID || attempt.CaseID != caseID || attempt.TargetID != targetID ||
			attempt.Status != status || attempt.Outcome != outcome || attempt.AttemptDigest != attemptDigest ||
			!attempt.StartedAt.Equal(startedAt) || !attempt.CompletedAt.Equal(completedAt) {
			return nil, conflict("persisted evaluation attempt metadata drifted from its canonical fact")
		}
		records = append(records, EvaluationAttemptRecord{
			EvaluationFactRecord: evaluationRecord(namespaceID, partition.PlanDigest, "evaluation-attempt", attemptID, attemptDigest, attempt.Canonical, completedAt),
			DescriptorDigest:     descriptorDigest, SamplingIdentityDigest: samplingDigest,
			IndependentRunID: independentRunID, ShardID: shardID, CaseID: caseID, TargetID: targetID,
			Status: status, Outcome: outcome, StartedAt: startedAt, CompletedAt: completedAt,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		if records[left].DescriptorDigest != records[right].DescriptorDigest {
			return records[left].DescriptorDigest < records[right].DescriptorDigest
		}
		return records[left].FactID < records[right].FactID
	})
	if int64(len(records)) > plan.PlannedJourneyCount {
		return nil, conflict("evaluation attempt count exceeds the frozen plan denominator")
	}
	seenAttempt, seenDescriptor, seenSampling, seenRun, seenDigest := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
	for _, record := range records {
		if seenAttempt[record.FactID] || seenDescriptor[record.DescriptorDigest] ||
			seenSampling[record.SamplingIdentityDigest] || seenRun[record.IndependentRunID] || seenDigest[record.FactDigest] {
			return nil, conflict("evaluation attempt list contains duplicate durable identity")
		}
		seenAttempt[record.FactID], seenDescriptor[record.DescriptorDigest] = true, true
		seenSampling[record.SamplingIdentityDigest], seenRun[record.IndependentRunID], seenDigest[record.FactDigest] = true, true, true
	}
	return records, nil
}

func queryEvaluationCheckpoints(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	condition string,
	args ...any,
) ([]EvaluationCheckpointRecord, error) {
	queryArgs := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	queryArgs = append(queryArgs, args...)
	rows, err := queryer.QueryContext(ctx, `SELECT shard_id, revision, lease_owner_id, lease_generation,
		state, checkpoint_digest, checkpoint_bytes, updated_at
	FROM agent_evaluation_checkpoints
	WHERE namespace_id = $1 AND plan_digest = $2
	  AND EXISTS (
		SELECT 1 FROM agent_evaluation_plans
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	  )`+condition+`
	ORDER BY shard_id COLLATE "C" ASC, revision ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationCheckpointRecord, 0)
	for rows.Next() {
		var shardID, leaseOwnerID, state, checkpointDigest string
		var revision, leaseGeneration int64
		var source []byte
		var updatedAt time.Time
		if err := rows.Scan(&shardID, &revision, &leaseOwnerID, &leaseGeneration,
			&state, &checkpointDigest, &source, &updatedAt); err != nil {
			return nil, err
		}
		checkpoint, err := decodeEvaluationCheckpoint(source)
		if err != nil {
			return nil, fmt.Errorf("decode persisted evaluation checkpoint: %w", err)
		}
		if !bytes.Equal(source, checkpoint.Canonical) || checkpoint.PlanDigest != partition.PlanDigest ||
			checkpoint.ShardID != shardID || checkpoint.Revision != revision || checkpoint.LeaseOwnerID != leaseOwnerID ||
			checkpoint.LeaseGeneration != leaseGeneration || checkpoint.State != state ||
			checkpoint.CheckpointDigest != checkpointDigest || !checkpoint.UpdatedAt.Equal(updatedAt) {
			return nil, conflict("persisted evaluation checkpoint metadata drifted from its canonical fact")
		}
		records = append(records, EvaluationCheckpointRecord{
			EvaluationFactRecord: evaluationRecord(namespaceID, partition.PlanDigest, "evaluation-checkpoint",
				fmt.Sprintf("%s@%d", shardID, revision), checkpointDigest, checkpoint.Canonical, updatedAt),
			ShardID: shardID, Revision: revision, LeaseOwnerID: leaseOwnerID,
			LeaseGeneration: leaseGeneration, State: state, UpdatedAt: updatedAt,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		if records[left].ShardID != records[right].ShardID {
			return records[left].ShardID < records[right].ShardID
		}
		return records[left].Revision < records[right].Revision
	})
	lastRevisionByShard := map[string]int64{}
	seenShard := map[string]bool{}
	seenDigest := map[string]bool{}
	for _, record := range records {
		expectedRevision := int64(0)
		if seenShard[record.ShardID] {
			expectedRevision = lastRevisionByShard[record.ShardID] + 1
		}
		if record.Revision != expectedRevision || seenDigest[record.FactDigest] {
			return nil, conflict("evaluation checkpoint list is duplicate or non-contiguous")
		}
		seenShard[record.ShardID] = true
		seenDigest[record.FactDigest] = true
		lastRevisionByShard[record.ShardID] = record.Revision
	}
	return records, nil
}

func queryEvaluationArtifacts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	condition string,
	args ...any,
) ([]EvaluationArtifactRecord, error) {
	queryArgs := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	queryArgs = append(queryArgs, args...)
	rows, err := queryer.QueryContext(ctx, `SELECT fact_type, fact_id, fact_digest, outcome, fact_bytes, recorded_at
	FROM agent_evaluation_artifacts
	WHERE namespace_id = $1 AND plan_digest = $2
	  AND EXISTS (
		SELECT 1 FROM agent_evaluation_plans
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	  )`+condition+`
	ORDER BY fact_type COLLATE "C" ASC, fact_id COLLATE "C" ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationArtifactRecord, 0)
	for rows.Next() {
		var factType, factID, factDigest string
		var outcome sql.NullString
		var source []byte
		var recordedAt time.Time
		if err := rows.Scan(&factType, &factID, &factDigest, &outcome, &source, &recordedAt); err != nil {
			return nil, err
		}
		if !supportedEvaluationArtifactType(factType) {
			return nil, conflict("persisted evaluation artifact has an unsupported fact type")
		}
		artifact, err := decodeEvaluationArtifact(source, factType)
		if err != nil {
			return nil, fmt.Errorf("decode persisted evaluation artifact: %w", err)
		}
		if !bytes.Equal(source, artifact.Canonical) || artifact.PlanDigest != partition.PlanDigest ||
			artifact.FactID != factID || artifact.FactDigest != factDigest || artifact.Outcome != outcome.String ||
			!artifact.RecordedAt.Equal(recordedAt) {
			return nil, conflict("persisted evaluation artifact metadata drifted from its canonical fact")
		}
		records = append(records, EvaluationArtifactRecord{
			EvaluationFactRecord: evaluationRecord(namespaceID, partition.PlanDigest, factType, factID, factDigest, artifact.Canonical, recordedAt),
			Outcome:              artifact.Outcome,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		if records[left].FactType != records[right].FactType {
			return records[left].FactType < records[right].FactType
		}
		return records[left].FactID < records[right].FactID
	})
	seenIdentity, seenDigest := map[string]bool{}, map[string]bool{}
	for _, record := range records {
		identity := record.FactType + "\x00" + record.FactID
		if seenIdentity[identity] || seenDigest[record.FactDigest] {
			return nil, conflict("evaluation artifact list contains duplicate durable identity")
		}
		seenIdentity[identity], seenDigest[record.FactDigest] = true, true
	}
	return records, nil
}

func supportedEvaluationArtifactType(factType string) bool {
	switch factType {
	case "evaluation-metric-report", "evaluation-grader-report", "evaluation-human-review-report",
		"evaluation-holdout-receipt", "evaluation-manifest":
		return true
	default:
		return false
	}
}

func loadEvaluationBudgetSnapshot(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
) (EvaluationBudgetSnapshot, error) {
	ledgerRows, err := queryer.QueryContext(ctx, `SELECT revision, updated_at
	FROM agent_evaluation_budget_ledgers
	WHERE namespace_id = $1 AND plan_digest = $2
	  AND EXISTS (
		SELECT 1 FROM agent_evaluation_plans
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	  )`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return EvaluationBudgetSnapshot{}, err
	}
	var revision int64
	var updatedAt time.Time
	count := 0
	for ledgerRows.Next() {
		if err := ledgerRows.Scan(&revision, &updatedAt); err != nil {
			_ = ledgerRows.Close()
			return EvaluationBudgetSnapshot{}, err
		}
		count++
	}
	if err := ledgerRows.Close(); err != nil {
		return EvaluationBudgetSnapshot{}, err
	}
	if count == 0 {
		return EvaluationBudgetSnapshot{}, ErrNotFound
	}
	if count != 1 || revision < 0 {
		return EvaluationBudgetSnapshot{}, conflict("evaluation budget ledger is duplicate or invalid")
	}

	reservationRows, err := queryer.QueryContext(ctx, `SELECT reservation_id, ledger_revision, demand_digest, demand_bytes, reserved_at
	FROM agent_evaluation_budget_reservations
	WHERE namespace_id = $1 AND plan_digest = $2
	ORDER BY ledger_revision ASC, reservation_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest)
	if err != nil {
		return EvaluationBudgetSnapshot{}, err
	}
	reservations := make([]EvaluationBudgetReservationRecord, 0)
	demandByReservation := map[string]evaluationBudgetDemand{}
	reservedAtByReservation := map[string]time.Time{}
	for reservationRows.Next() {
		var record EvaluationBudgetReservationRecord
		record.NamespaceID, record.PlanDigest = namespaceID, partition.PlanDigest
		if err := reservationRows.Scan(&record.ReservationID, &record.LedgerRevision, &record.DemandDigest,
			&record.DemandBytes, &record.ReservedAt); err != nil {
			_ = reservationRows.Close()
			return EvaluationBudgetSnapshot{}, err
		}
		demand, err := decodeEvaluationBudgetDemand(record.DemandBytes, true)
		if err != nil {
			_ = reservationRows.Close()
			return EvaluationBudgetSnapshot{}, fmt.Errorf("decode persisted evaluation budget reservation: %w", err)
		}
		if !bytes.Equal(record.DemandBytes, demand.Canonical) || record.DemandDigest != demand.Digest ||
			record.LedgerRevision < 1 || strings.TrimSpace(record.ReservationID) == "" {
			_ = reservationRows.Close()
			return EvaluationBudgetSnapshot{}, conflict("persisted evaluation budget reservation metadata drifted")
		}
		if _, duplicate := demandByReservation[record.ReservationID]; duplicate {
			_ = reservationRows.Close()
			return EvaluationBudgetSnapshot{}, conflict("evaluation budget reservation list contains duplicate identity")
		}
		record.DemandBytes = append([]byte(nil), demand.Canonical...)
		reservations = append(reservations, record)
		demandByReservation[record.ReservationID] = demand
		reservedAtByReservation[record.ReservationID] = record.ReservedAt
	}
	if err := reservationRows.Close(); err != nil {
		return EvaluationBudgetSnapshot{}, err
	}

	settlementRows, err := queryer.QueryContext(ctx, `SELECT reservation_id, ledger_revision, settlement_digest, settlement_bytes, settled_at
	FROM agent_evaluation_budget_settlements
	WHERE namespace_id = $1 AND plan_digest = $2
	ORDER BY ledger_revision ASC, reservation_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest)
	if err != nil {
		return EvaluationBudgetSnapshot{}, err
	}
	settlements := make([]EvaluationBudgetSettlementRecord, 0)
	settlementByReservation := map[string]evaluationBudgetSettlement{}
	for settlementRows.Next() {
		var record EvaluationBudgetSettlementRecord
		record.NamespaceID, record.PlanDigest = namespaceID, partition.PlanDigest
		if err := settlementRows.Scan(&record.ReservationID, &record.LedgerRevision, &record.SettlementDigest,
			&record.SettlementBytes, &record.SettledAt); err != nil {
			_ = settlementRows.Close()
			return EvaluationBudgetSnapshot{}, err
		}
		demand, exists := demandByReservation[record.ReservationID]
		if !exists {
			_ = settlementRows.Close()
			return EvaluationBudgetSnapshot{}, conflict("evaluation budget settlement has no durable reservation")
		}
		settlement, err := decodeEvaluationBudgetSettlement(record.SettlementBytes, demand, reservedAtByReservation[record.ReservationID])
		if err != nil {
			_ = settlementRows.Close()
			return EvaluationBudgetSnapshot{}, fmt.Errorf("decode persisted evaluation budget settlement: %w", err)
		}
		if !bytes.Equal(record.SettlementBytes, settlement.Canonical) || record.SettlementDigest != settlement.Digest ||
			record.LedgerRevision < 1 || !record.SettledAt.Equal(settlement.SettledAt) {
			_ = settlementRows.Close()
			return EvaluationBudgetSnapshot{}, conflict("persisted evaluation budget settlement metadata drifted")
		}
		if _, duplicate := settlementByReservation[record.ReservationID]; duplicate {
			_ = settlementRows.Close()
			return EvaluationBudgetSnapshot{}, conflict("evaluation budget settlement list contains duplicate identity")
		}
		record.SettlementBytes = append([]byte(nil), settlement.Canonical...)
		settlements = append(settlements, record)
		settlementByReservation[record.ReservationID] = settlement
	}
	if err := settlementRows.Close(); err != nil {
		return EvaluationBudgetSnapshot{}, err
	}

	type budgetEvent struct {
		revision int64
		at       time.Time
	}
	events := make([]budgetEvent, 0, len(reservations)+len(settlements))
	for _, record := range reservations {
		events = append(events, budgetEvent{revision: record.LedgerRevision, at: record.ReservedAt})
	}
	for _, record := range settlements {
		events = append(events, budgetEvent{revision: record.LedgerRevision, at: record.SettledAt})
	}
	sort.Slice(events, func(left, right int) bool { return events[left].revision < events[right].revision })
	if int64(len(events)) != revision {
		return EvaluationBudgetSnapshot{}, conflict("evaluation budget ledger revision does not match its durable event count")
	}
	for index, event := range events {
		if event.revision != int64(index+1) {
			return EvaluationBudgetSnapshot{}, conflict("evaluation budget ledger revision chain is duplicate or non-contiguous")
		}
	}
	if revision == 0 {
		if !updatedAt.Equal(plan.PlannedAt) {
			return EvaluationBudgetSnapshot{}, conflict("evaluation budget ledger origin drifted from the frozen plan")
		}
	} else if !updatedAt.Equal(events[len(events)-1].at) {
		return EvaluationBudgetSnapshot{}, conflict("evaluation budget ledger timestamp drifted from its latest event")
	}

	ceiling, err := decodeEvaluationBudget(plan.FactBytes)
	if err != nil {
		return EvaluationBudgetSnapshot{}, err
	}
	utilization := evaluationBudgetDemand{Usage: map[string]*big.Rat{}, Cost: map[string]*big.Rat{}}
	unsettled := make([]string, 0)
	for _, record := range reservations {
		charged := demandByReservation[record.ReservationID]
		if settlement, settled := settlementByReservation[record.ReservationID]; settled {
			charged = settlement.Charged
		} else {
			unsettled = append(unsettled, record.ReservationID)
		}
		utilization = addEvaluationBudgetDemand(utilization, charged)
	}
	if !evaluationDemandWithin(utilization, ceiling) {
		return EvaluationBudgetSnapshot{}, conflict("evaluation budget ledger exceeds its frozen hard ceiling")
	}
	sort.Slice(reservations, func(left, right int) bool {
		if reservations[left].LedgerRevision != reservations[right].LedgerRevision {
			return reservations[left].LedgerRevision < reservations[right].LedgerRevision
		}
		return reservations[left].ReservationID < reservations[right].ReservationID
	})
	sort.Slice(settlements, func(left, right int) bool {
		if settlements[left].LedgerRevision != settlements[right].LedgerRevision {
			return settlements[left].LedgerRevision < settlements[right].LedgerRevision
		}
		return settlements[left].ReservationID < settlements[right].ReservationID
	})
	sort.Strings(unsettled)
	return EvaluationBudgetSnapshot{
		NamespaceID: namespaceID, PlanDigest: partition.PlanDigest, Revision: revision, UpdatedAt: updatedAt,
		Reservations: reservations, Settlements: settlements, UnsettledReservationIDs: unsettled,
	}, nil
}
