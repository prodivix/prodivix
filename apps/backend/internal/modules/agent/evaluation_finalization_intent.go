package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationFinalizationIntentFormat = "prodivix.g4-model-evaluation-finalization-intent"

type EvaluationFinalizationIntentRecord struct {
	Partition    EvaluationPlanPartition
	CompletedAt  time.Time
	IntentDigest string
	IntentBytes  []byte
}

func createEvaluationFinalizationIntent(
	partition EvaluationPlanPartition,
	completedAt time.Time,
) (EvaluationFinalizationIntentRecord, error) {
	base := map[string]any{
		"format":           evaluationFinalizationIntentFormat,
		"version":          int64(1),
		"planDigest":       partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit,
		"completedAt":      evaluationExportInstant(completedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationFinalizationIntentRecord{}, err
	}
	value := make(map[string]any, len(base)+1)
	for key, entry := range base {
		value[key] = entry
	}
	value["intentDigest"] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) > 4096 {
		return EvaluationFinalizationIntentRecord{}, conflict("evaluation finalization intent exceeds its bound")
	}
	return EvaluationFinalizationIntentRecord{
		Partition: partition, CompletedAt: completedAt,
		IntentDigest: digest, IntentBytes: encoded,
	}, nil
}

func loadEvaluationFinalizationIntent(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) (*EvaluationFinalizationIntentRecord, error) {
	var record EvaluationFinalizationIntentRecord
	record.Partition = partition
	err := queryer.QueryRowContext(ctx, `SELECT repository_commit, completed_at, intent_digest, intent_bytes
		FROM agent_evaluation_finalization_intents
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit).
		Scan(&record.Partition.RepositoryCommit, &record.CompletedAt, &record.IntentDigest, &record.IntentBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	expected, err := createEvaluationFinalizationIntent(partition, record.CompletedAt.UTC().Truncate(time.Millisecond))
	if err != nil || expected.IntentDigest != record.IntentDigest || !bytes.Equal(expected.IntentBytes, record.IntentBytes) {
		return nil, conflict("persisted evaluation finalization intent drifted")
	}
	return &record, nil
}

func (repository *Repository) PutEvaluationFinalizationIntent(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	completedAt time.Time,
	serverNow time.Time,
) (EvaluationFinalizationIntentRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationFinalizationIntentRecord{}, false, err
	}
	completedAt = completedAt.UTC().Truncate(time.Millisecond)
	serverNow = serverNow.UTC().Truncate(time.Millisecond)
	if completedAt.IsZero() || serverNow.IsZero() || completedAt.After(serverNow) {
		return EvaluationFinalizationIntentRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(
		ctx, repository, authority, partition,
	)
	if err != nil {
		return EvaluationFinalizationIntentRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := lockEvaluationPlanForFinalization(writeContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationFinalizationIntentRecord{}, false, err
	}
	if completedAt.Before(plan.PlannedAt) || completedAt.After(plan.ExpiresAt) {
		return EvaluationFinalizationIntentRecord{}, false, conflict("evaluation finalization intent time is outside the frozen plan")
	}
	existing, err := loadEvaluationFinalizationIntent(writeContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationFinalizationIntentRecord{}, false, err
	}
	if existing != nil {
		if !existing.CompletedAt.Equal(completedAt) {
			return EvaluationFinalizationIntentRecord{}, false, conflict("evaluation finalization intent replay drifted")
		}
		if err := tx.Commit(); err != nil {
			return EvaluationFinalizationIntentRecord{}, false, err
		}
		return *existing, true, nil
	}
	record, err := createEvaluationFinalizationIntent(partition, completedAt)
	if err != nil {
		return EvaluationFinalizationIntentRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_finalization_intents (
		namespace_id, plan_digest, repository_commit, completed_at, intent_digest, intent_bytes
	) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, completedAt, record.IntentDigest, record.IntentBytes)
	if err != nil {
		return EvaluationFinalizationIntentRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationFinalizationIntentRecord{}, false, err
	}
	if inserted != 1 {
		return EvaluationFinalizationIntentRecord{}, false, conflict("evaluation finalization intent raced with another writer")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationFinalizationIntentRecord{}, false, err
	}
	return record, false, nil
}

func (repository *Repository) GetEvaluationFinalizationIntent(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationFinalizationIntentRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationFinalizationIntentRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	record, err := loadEvaluationFinalizationIntent(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationFinalizationIntentRecord{}, err
	}
	if record == nil {
		return EvaluationFinalizationIntentRecord{}, ErrNotFound
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationFinalizationIntentRecord{}, err
	}
	return *record, nil
}
