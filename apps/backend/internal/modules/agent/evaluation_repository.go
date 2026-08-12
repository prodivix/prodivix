package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationAuthority struct {
	Kind        string
	PrincipalID string
	NamespaceID string
}

type EvaluationFactRecord struct {
	NamespaceID string
	PlanDigest  string
	FactType    string
	FactID      string
	FactDigest  string
	FactBytes   []byte
	RecordedAt  time.Time
}

type EvaluationShardLease struct {
	NamespaceID string
	PlanDigest  string
	ShardID     string
	OwnerID     string
	Generation  int64
	LeaseDigest string
	AcquiredAt  time.Time
	ExpiresAt   time.Time
}

func validateEvaluationAuthority(authority EvaluationAuthority) error {
	if authority.Kind != "service" || strings.TrimSpace(authority.PrincipalID) == "" || strings.TrimSpace(authority.NamespaceID) == "" {
		return ErrUnauthorized
	}
	return nil
}

func (repository *Repository) ClaimEvaluationShard(
	ctx context.Context,
	authority EvaluationAuthority,
	planDigest string,
	shardID string,
	ownerID string,
	acquiredAt time.Time,
	expiresAt time.Time,
) (EvaluationShardLease, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationShardLease{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationShardLease{}, false, err
	}
	acquiredAt = acquiredAt.UTC().Truncate(time.Millisecond)
	expiresAt = expiresAt.UTC().Truncate(time.Millisecond)
	if strings.TrimSpace(planDigest) == "" || strings.TrimSpace(shardID) == "" || strings.TrimSpace(ownerID) == "" || !expiresAt.After(acquiredAt) {
		return EvaluationShardLease{}, false, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationShardLease{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var planPlannedAt time.Time
	var planExpiresAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT planned_at, expires_at FROM agent_evaluation_plans
		WHERE namespace_id = $1 AND plan_digest = $2`, authority.NamespaceID, planDigest).Scan(&planPlannedAt, &planExpiresAt); errors.Is(err, sql.ErrNoRows) {
		return EvaluationShardLease{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationShardLease{}, false, err
	}
	if acquiredAt.Before(planPlannedAt) || !acquiredAt.Before(planExpiresAt) || expiresAt.After(planExpiresAt) {
		return EvaluationShardLease{}, false, conflict("evaluation shard lease is outside the frozen plan window")
	}
	var current EvaluationShardLease
	err = tx.QueryRowContext(ctx, `SELECT owner_id, generation, lease_digest, acquired_at, expires_at
		FROM agent_evaluation_shard_leases
		WHERE namespace_id = $1 AND plan_digest = $2 AND shard_id = $3 FOR UPDATE`,
		authority.NamespaceID, planDigest, shardID).Scan(
		&current.OwnerID, &current.Generation, &current.LeaseDigest, &current.AcquiredAt, &current.ExpiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		current.Generation = 0
	} else if err != nil {
		return EvaluationShardLease{}, false, err
	} else if current.ExpiresAt.After(acquiredAt) {
		if current.OwnerID != ownerID {
			return EvaluationShardLease{}, false, conflict("evaluation shard lease is held by another worker")
		}
		current.NamespaceID, current.PlanDigest, current.ShardID = authority.NamespaceID, planDigest, shardID
		if err := tx.Commit(); err != nil {
			return EvaluationShardLease{}, false, err
		}
		return current, true, nil
	}
	generation := current.Generation + 1
	base := map[string]any{
		"planDigest": planDigest,
		"shardId":    shardID,
		"ownerId":    ownerID,
		"generation": generation,
		"acquiredAt": acquiredAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":  expiresAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	leaseDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationShardLease{}, false, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_shard_leases (
		namespace_id, plan_digest, shard_id, owner_id, generation, lease_digest, acquired_at, expires_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT (namespace_id, plan_digest, shard_id) DO UPDATE SET
		owner_id = EXCLUDED.owner_id, generation = EXCLUDED.generation,
		lease_digest = EXCLUDED.lease_digest, acquired_at = EXCLUDED.acquired_at,
		expires_at = EXCLUDED.expires_at`, authority.NamespaceID, planDigest, shardID,
		ownerID, generation, leaseDigest, acquiredAt, expiresAt); err != nil {
		return EvaluationShardLease{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationShardLease{}, false, err
	}
	return EvaluationShardLease{
		NamespaceID: authority.NamespaceID, PlanDigest: planDigest, ShardID: shardID,
		OwnerID: ownerID, Generation: generation, LeaseDigest: leaseDigest,
		AcquiredAt: acquiredAt, ExpiresAt: expiresAt,
	}, false, nil
}

func (repository *Repository) RenewEvaluationShard(
	ctx context.Context,
	authority EvaluationAuthority,
	planDigest string,
	shardID string,
	ownerID string,
	generation int64,
	renewedAt time.Time,
	expiresAt time.Time,
) (EvaluationShardLease, error) {
	if err := repository.available(); err != nil {
		return EvaluationShardLease{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationShardLease{}, err
	}
	renewedAt = renewedAt.UTC().Truncate(time.Millisecond)
	expiresAt = expiresAt.UTC().Truncate(time.Millisecond)
	if strings.TrimSpace(planDigest) == "" || strings.TrimSpace(shardID) == "" ||
		strings.TrimSpace(ownerID) == "" || generation < 1 || !expiresAt.After(renewedAt) {
		return EvaluationShardLease{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationShardLease{}, err
	}
	defer func() { _ = tx.Rollback() }()
	lease := EvaluationShardLease{
		NamespaceID: authority.NamespaceID, PlanDigest: planDigest, ShardID: shardID,
	}
	var planExpiresAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT lease.owner_id, lease.generation, lease.lease_digest, lease.acquired_at, lease.expires_at, plan.expires_at
		FROM agent_evaluation_shard_leases lease
		JOIN agent_evaluation_plans plan
		  ON plan.namespace_id = lease.namespace_id AND plan.plan_digest = lease.plan_digest
		WHERE lease.namespace_id = $1 AND lease.plan_digest = $2 AND lease.shard_id = $3 FOR UPDATE OF lease`,
		authority.NamespaceID, planDigest, shardID).Scan(
		&lease.OwnerID, &lease.Generation, &lease.LeaseDigest, &lease.AcquiredAt, &lease.ExpiresAt, &planExpiresAt,
	); errors.Is(err, sql.ErrNoRows) {
		return EvaluationShardLease{}, ErrNotFound
	} else if err != nil {
		return EvaluationShardLease{}, err
	}
	if lease.OwnerID != ownerID || lease.Generation != generation {
		return EvaluationShardLease{}, conflict("evaluation shard lease renewal is fenced")
	}
	if !renewedAt.Before(lease.ExpiresAt) {
		return EvaluationShardLease{}, conflict("evaluation shard lease expired before renewal")
	}
	if !renewedAt.Before(planExpiresAt) || expiresAt.After(planExpiresAt) {
		return EvaluationShardLease{}, conflict("evaluation shard lease renewal is outside the frozen plan window")
	}
	if expiresAt.Before(lease.ExpiresAt) {
		expiresAt = lease.ExpiresAt.UTC().Truncate(time.Millisecond)
	}
	base := map[string]any{
		"planDigest": planDigest,
		"shardId":    shardID,
		"ownerId":    ownerID,
		"generation": generation,
		"acquiredAt": lease.AcquiredAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":  expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	leaseDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationShardLease{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_shard_leases
		SET lease_digest = $4, expires_at = $5
		WHERE namespace_id = $1 AND plan_digest = $2 AND shard_id = $3`,
		authority.NamespaceID, planDigest, shardID, leaseDigest, expiresAt); err != nil {
		return EvaluationShardLease{}, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationShardLease{}, err
	}
	lease.LeaseDigest, lease.ExpiresAt = leaseDigest, expiresAt
	return lease, nil
}

func (repository *Repository) StoreEvaluationPlan(ctx context.Context, authority EvaluationAuthority, factBytes []byte) (EvaluationFactRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	plan, err := decodeEvaluationPlan(factBytes)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	capabilityProbeLinks, err := evaluationPlanCapabilityProbeAdmissions(ctx, tx, authority, plan)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_plans (
		namespace_id, evaluation_plan_id, plan_digest, repository_commit, planned_journey_count,
		plan_json, plan_bytes, planned_at, expires_at
	) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9) ON CONFLICT DO NOTHING`,
		authority.NamespaceID, plan.PlanID, plan.PlanDigest, plan.RepositoryCommit, plan.PlannedJourneyCount,
		string(plan.Canonical), plan.Canonical, plan.PlannedAt, plan.ExpiresAt)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	record := evaluationRecord(authority.NamespaceID, plan.PlanDigest, "evaluation-plan", plan.PlanID, plan.PlanDigest, plan.Canonical, plan.PlannedAt)
	if inserted > 0 {
		if err := storeEvaluationPlanCapabilityProbeAdmissionLinks(
			ctx, tx, authority, plan, capabilityProbeLinks,
		); err != nil {
			return EvaluationFactRecord{}, false, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_budget_ledgers (
			namespace_id, plan_digest, revision, updated_at
		) VALUES ($1, $2, 0, $3)`, authority.NamespaceID, plan.PlanDigest, plan.PlannedAt); err != nil {
			return EvaluationFactRecord{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationFactRecord{}, false, err
		}
		return record, false, nil
	}
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT plan_bytes FROM agent_evaluation_plans
		WHERE namespace_id = $1 AND (plan_digest = $2 OR evaluation_plan_id = $3)`, authority.NamespaceID, plan.PlanDigest, plan.PlanID).Scan(&existing); errors.Is(err, sql.ErrNoRows) {
		return EvaluationFactRecord{}, false, conflict("evaluation plan identity was reused")
	} else if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if !bytes.Equal(existing, plan.Canonical) {
		return EvaluationFactRecord{}, false, conflict("evaluation plan identity was reused with different immutable input")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	return record, true, nil
}

func (repository *Repository) StoreEvaluationAttempt(ctx context.Context, authority EvaluationAuthority, factBytes []byte) (EvaluationFactRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	attempt, err := decodeEvaluationAttempt(factBytes)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var planBytes []byte
	if err := repository.db.QueryRowContext(ctx, `SELECT plan_bytes FROM agent_evaluation_plans
		WHERE namespace_id = $1 AND plan_digest = $2`, authority.NamespaceID, attempt.PlanDigest).Scan(&planBytes); errors.Is(err, sql.ErrNoRows) {
		return EvaluationFactRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if err := validateEvaluationAttemptPlanBinding(planBytes, attempt); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	result, err := repository.db.ExecContext(ctx, `INSERT INTO agent_evaluation_attempts (
		namespace_id, plan_digest, attempt_id, descriptor_digest, sampling_identity_digest,
		independent_run_id, shard_id, case_id, target_id, status, outcome, attempt_digest,
		attempt_json, attempt_bytes, started_at, completed_at
	) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16
	WHERE EXISTS (SELECT 1 FROM agent_evaluation_plans WHERE namespace_id = $1 AND plan_digest = $2)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, attempt.PlanDigest, attempt.AttemptID,
		attempt.DescriptorDigest, attempt.SamplingIdentityDigest, attempt.IndependentRunID,
		attempt.ShardID, attempt.CaseID, attempt.TargetID, attempt.Status, attempt.Outcome,
		attempt.AttemptDigest, string(attempt.Canonical), attempt.Canonical, attempt.StartedAt, attempt.CompletedAt)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	record := evaluationRecord(authority.NamespaceID, attempt.PlanDigest, "evaluation-attempt", attempt.AttemptID, attempt.AttemptDigest, attempt.Canonical, attempt.CompletedAt)
	if inserted > 0 {
		return record, false, nil
	}
	var existing []byte
	if err := repository.db.QueryRowContext(ctx, `SELECT attempt_bytes FROM agent_evaluation_attempts
		WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3`, authority.NamespaceID, attempt.PlanDigest, attempt.AttemptID).Scan(&existing); errors.Is(err, sql.ErrNoRows) {
		return EvaluationFactRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if !bytes.Equal(existing, attempt.Canonical) {
		return EvaluationFactRecord{}, false, conflict("evaluation attempt identity was reused with different immutable input")
	}
	return record, true, nil
}

func (repository *Repository) StoreEvaluationCheckpoint(ctx context.Context, authority EvaluationAuthority, expectedPreviousRevision int64, factBytes []byte) (EvaluationFactRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	checkpoint, err := decodeEvaluationCheckpoint(factBytes)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var leaseOwner string
	var leaseGeneration int64
	var leaseAcquiredAt time.Time
	var leaseExpiresAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT owner_id, generation, acquired_at, expires_at
		FROM agent_evaluation_shard_leases
		WHERE namespace_id = $1 AND plan_digest = $2 AND shard_id = $3 FOR SHARE`,
		authority.NamespaceID, checkpoint.PlanDigest, checkpoint.ShardID).Scan(
		&leaseOwner, &leaseGeneration, &leaseAcquiredAt, &leaseExpiresAt,
	); errors.Is(err, sql.ErrNoRows) {
		return EvaluationFactRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if leaseOwner != checkpoint.LeaseOwnerID || leaseGeneration != checkpoint.LeaseGeneration ||
		checkpoint.UpdatedAt.Before(leaseAcquiredAt) || !checkpoint.UpdatedAt.Before(leaseExpiresAt) {
		return EvaluationFactRecord{}, false, conflict("evaluation checkpoint lease is expired or fenced")
	}
	var latestRevision int64
	var latestBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT revision, checkpoint_bytes FROM agent_evaluation_checkpoints
		WHERE namespace_id = $1 AND plan_digest = $2 AND shard_id = $3
		ORDER BY revision DESC LIMIT 1 FOR UPDATE`, authority.NamespaceID, checkpoint.PlanDigest, checkpoint.ShardID).Scan(&latestRevision, &latestBytes)
	if errors.Is(err, sql.ErrNoRows) {
		latestRevision = -1
		latestBytes = nil
	} else if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	record := evaluationRecord(authority.NamespaceID, checkpoint.PlanDigest, "evaluation-checkpoint", fmt.Sprintf("%s@%d", checkpoint.ShardID, checkpoint.Revision), checkpoint.CheckpointDigest, checkpoint.Canonical, checkpoint.UpdatedAt)
	if latestRevision == checkpoint.Revision && bytes.Equal(latestBytes, checkpoint.Canonical) {
		if err := tx.Commit(); err != nil {
			return EvaluationFactRecord{}, false, err
		}
		return record, true, nil
	}
	if latestRevision != expectedPreviousRevision || checkpoint.Revision != expectedPreviousRevision+1 {
		return EvaluationFactRecord{}, false, conflict("evaluation checkpoint revision is stale or non-contiguous")
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_checkpoints (
		namespace_id, plan_digest, shard_id, revision, lease_owner_id, lease_generation,
		state, checkpoint_digest, checkpoint_json, checkpoint_bytes, updated_at
	) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11
	WHERE EXISTS (SELECT 1 FROM agent_evaluation_plans WHERE namespace_id = $1 AND plan_digest = $2)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, checkpoint.PlanDigest, checkpoint.ShardID,
		checkpoint.Revision, checkpoint.LeaseOwnerID, checkpoint.LeaseGeneration, checkpoint.State,
		checkpoint.CheckpointDigest, string(checkpoint.Canonical), checkpoint.Canonical, checkpoint.UpdatedAt)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if inserted != 1 {
		return EvaluationFactRecord{}, false, ErrNotFound
	}
	if err := tx.Commit(); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	return record, false, nil
}

func (repository *Repository) StoreEvaluationArtifact(ctx context.Context, authority EvaluationAuthority, factType string, factBytes []byte) (EvaluationFactRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationFactRecord{}, false, err
	}
	artifact, err := decodeEvaluationArtifact(factBytes, factType)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	result, err := repository.db.ExecContext(ctx, `INSERT INTO agent_evaluation_artifacts (
		namespace_id, plan_digest, fact_type, fact_id, fact_digest, outcome, fact_json, fact_bytes, recorded_at
	) SELECT $1, $2, $3, $4, $5, NULLIF($6, ''), $7::jsonb, $8, $9
	WHERE EXISTS (SELECT 1 FROM agent_evaluation_plans WHERE namespace_id = $1 AND plan_digest = $2)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, artifact.PlanDigest, artifact.FactType, artifact.FactID,
		artifact.FactDigest, artifact.Outcome, string(artifact.Canonical), artifact.Canonical, artifact.RecordedAt)
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	record := evaluationRecord(authority.NamespaceID, artifact.PlanDigest, artifact.FactType, artifact.FactID, artifact.FactDigest, artifact.Canonical, artifact.RecordedAt)
	if inserted > 0 {
		return record, false, nil
	}
	var existing []byte
	if err := repository.db.QueryRowContext(ctx, `SELECT fact_bytes FROM agent_evaluation_artifacts
		WHERE namespace_id = $1 AND plan_digest = $2 AND fact_type = $3 AND fact_id = $4`,
		authority.NamespaceID, artifact.PlanDigest, artifact.FactType, artifact.FactID).Scan(&existing); errors.Is(err, sql.ErrNoRows) {
		return EvaluationFactRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationFactRecord{}, false, err
	}
	if !bytes.Equal(existing, artifact.Canonical) {
		return EvaluationFactRecord{}, false, conflict("evaluation artifact identity was reused with different immutable input")
	}
	return record, true, nil
}

func evaluationRecord(namespaceID, planDigest, factType, factID, factDigest string, canonical []byte, recordedAt time.Time) EvaluationFactRecord {
	return EvaluationFactRecord{
		NamespaceID: namespaceID, PlanDigest: planDigest, FactType: factType,
		FactID: factID, FactDigest: factDigest, FactBytes: append([]byte(nil), canonical...), RecordedAt: recordedAt,
	}
}
