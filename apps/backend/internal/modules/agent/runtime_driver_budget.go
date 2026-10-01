package agent

import (
	"context"
	"database/sql"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
)

// Metadata reserves artifact capacity before any bytes enter staging. Every
// cell, surface, retry and rollback associated with this AgentRun shares it.
func (repository *Repository) authorizeRuntimeDriverBudgetTx(ctx context.Context, tx *sql.Tx, workspaceID string, coordinates RuntimeDriverCoordinates, clock func() time.Time, prospective int64) error {
	run, err := scanRunFactTx(ctx, tx, workspaceID, coordinates.AgentRunID)
	if err != nil {
		return err
	}
	task, err := loadTaskTx(ctx, tx, workspaceID, coordinates.TaskID)
	if err != nil {
		return err
	}
	budget, ok := objectMember(task.Spec, "budget")
	if !ok {
		return ErrUnauthorized
	}
	ledger, _ := objectMember(run.Value, "budgetLedger")
	if !sameMember(ledger["budget"], budget) {
		return ErrUnauthorized
	}
	maximumBytes, ok := integerMember(budget, "maxArtifactBytes")
	if !ok || prospective < 0 {
		return ErrUnauthorized
	}
	maximumElapsed, ok := integerMember(budget, "maxElapsedMs")
	if !ok {
		return ErrUnauthorized
	}
	actual := clock()
	if actual.Before(run.UpdatedAt) || actual.Before(run.CreatedAt) || actual.Sub(run.CreatedAt).Milliseconds() >= maximumElapsed {
		return conflict("Agent Task wall-time budget is exhausted")
	}
	var reserved int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(a.expected_size),0) FROM verification_promotion_artifacts a JOIN verification_promotions p ON p.id=a.promotion_id JOIN agent_runtime_verification_runs l ON l.workspace_id=p.workspace_id AND l.verification_run_id=p.candidate_json->'run'->>'runId' WHERE l.workspace_id=$1 AND l.agent_run_id=$2`, workspaceID, run.RunID).Scan(&reserved); err != nil {
		return err
	}
	if reserved < 0 || reserved > maximumBytes || prospective > maximumBytes-reserved {
		return conflict("Agent Task cumulative artifact budget is exhausted")
	}
	actual = clock()
	if actual.Before(run.UpdatedAt) || actual.Before(run.CreatedAt) || actual.Sub(run.CreatedAt).Milliseconds() >= maximumElapsed {
		return conflict("Agent Task wall-time budget is exhausted")
	}
	return nil
}

func (repository *Repository) runtimeDriverPromotionBudgetAuthorization(workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority, clock func() time.Time, candidate g3.EvidenceCandidate) g3.WriteAuthorization {
	authorize := repository.runtimeDriverAuthorization(workspaceID, coordinates, lease, clock, false)
	return func(ctx context.Context, tx *sql.Tx) error {
		if err := authorize(ctx, tx); err != nil {
			return err
		}
		var existing bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM verification_promotions WHERE workspace_id=$1 AND candidate_id=$2)`, workspaceID, candidate.CandidateID).Scan(&existing); err != nil {
			return err
		}
		var prospective int64
		if !existing {
			for _, artifact := range candidate.Artifacts {
				if artifact.ExpectedSize < 0 || artifact.ExpectedSize > int64(1<<53-1)-prospective {
					return ErrInvalid
				}
				prospective += artifact.ExpectedSize
			}
		}
		return repository.authorizeRuntimeDriverBudgetTx(ctx, tx, workspaceID, coordinates, clock, prospective)
	}
}

func (repository *Repository) runtimeDriverAttemptBudgetAuthorization(workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority, clock func() time.Time, expiresAt time.Time) g3.WriteAuthorization {
	authorize := repository.runtimeDriverAuthorization(workspaceID, coordinates, lease, clock, false)
	return func(ctx context.Context, tx *sql.Tx) error {
		if err := authorize(ctx, tx); err != nil {
			return err
		}
		run, err := scanRunFactTx(ctx, tx, workspaceID, coordinates.AgentRunID)
		if err != nil {
			return err
		}
		task, err := loadTaskTx(ctx, tx, workspaceID, coordinates.TaskID)
		if err != nil {
			return err
		}
		budget, _ := objectMember(task.Spec, "budget")
		maximum, _ := integerMember(budget, "maxElapsedMs")
		// Compare milliseconds instead of overflowing time.Duration for safe JSON integers.
		if !expiresAt.After(clock()) || expiresAt.Sub(run.CreatedAt).Milliseconds() > maximum {
			return conflict("Attempt grant exceeds its Agent Task wall-time budget")
		}
		return nil
	}
}

// A worker requests an upper bound. The server narrows it to the original Task
// deadline before its owner issues a grant; later cells never gain more time.
func (repository *Repository) runtimeDriverAttemptExpiry(ctx context.Context, workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority, clock func() time.Time, requested time.Time) (time.Time, error) {
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return time.Time{}, err
	}
	defer tx.Rollback()
	authorize := repository.runtimeDriverAuthorization(workspaceID, coordinates, lease, clock, false)
	if err := authorize(ctx, tx); err != nil {
		return time.Time{}, err
	}
	run, err := scanRunFactTx(ctx, tx, workspaceID, coordinates.AgentRunID)
	if err != nil {
		return time.Time{}, err
	}
	task, err := loadTaskTx(ctx, tx, workspaceID, coordinates.TaskID)
	if err != nil {
		return time.Time{}, err
	}
	budget, _ := objectMember(task.Spec, "budget")
	maximum, _ := integerMember(budget, "maxElapsedMs")
	expiresAt := canonicalTime(requested)
	if expiresAt.Sub(run.CreatedAt).Milliseconds() > maximum {
		expiresAt = time.UnixMilli(run.CreatedAt.UnixMilli() + maximum).UTC()
	}
	if !expiresAt.After(clock()) {
		return time.Time{}, conflict("Agent Task wall-time budget is exhausted")
	}
	if err := authorize(ctx, tx); err != nil {
		return time.Time{}, err
	}
	return expiresAt, tx.Commit()
}
