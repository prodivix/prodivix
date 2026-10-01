package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	workspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type RuntimeDriverCoordinates struct {
	TaskID                string                  `json:"taskId"`
	AgentRunID            string                  `json:"agentRunId"`
	Authority             runtimeAuthorityRequest `json:"authority"`
	VerificationRunID     string                  `json:"verificationRunId"`
	PlanDigest            string                  `json:"planDigest"`
	RequestDigest         string                  `json:"requestDigest"`
	CancellationCommandID string                  `json:"cancellationCommandId,omitempty"`
}

type RuntimeDriverContext struct {
	Started       bool                           `json:"started"`
	Workspace     any                            `json:"workspace"`
	Plan          json.RawMessage                `json:"plan"`
	Run           g3.VerificationRunSnapshotWire `json:"run"`
	RequestDigest string                         `json:"requestDigest"`
	OwnerID       string                         `json:"-"`
	ProjectID     string                         `json:"projectId"`
}

// authorizeRuntimeDriverTx preserves Workspace -> AgentRun -> G3 ordering. A
// consumed cancellation grants only cleanup, never evidence or new attempts.
func (repository *Repository) authorizeRuntimeDriverTx(ctx context.Context, tx *sql.Tx, workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority, clock func() time.Time, cleanup bool) (string, error) {
	if tx == nil || clock == nil || coordinates.AgentRunID == "" || coordinates.TaskID == "" || !canonicalDigestPattern.MatchString(coordinates.PlanDigest) || !canonicalDigestPattern.MatchString(coordinates.RequestDigest) {
		return "", ErrUnauthorized
	}
	if coordinates.CancellationCommandID == "" {
		if err := repository.AuthorizeRuntimeVerification(ctx, tx, workspaceID, RuntimeVerificationAuthorization{AgentRunID: coordinates.AgentRunID, Lease: lease, Clock: clock, VerificationRunID: coordinates.VerificationRunID, PlanDigest: coordinates.PlanDigest, Kind: "append"}); err != nil {
			return "", err
		}
	} else {
		if !cleanup {
			return "", ErrUnauthorized
		}
		var owner string
		if err := tx.QueryRowContext(ctx, `SELECT owner_id FROM workspaces WHERE id=$1 FOR SHARE`, workspaceID).Scan(&owner); err != nil {
			return "", err
		}
		run, err := scanRunFactTx(ctx, tx, workspaceID, coordinates.AgentRunID)
		if err != nil {
			return "", err
		}
		if run.Phase != "cancelling" || run.CallbackAuthority != "revoked" || run.TaskID != coordinates.TaskID {
			return "", ErrUnauthorized
		}
		var matches bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_runtime_cancellations c
JOIN agent_run_user_commands u ON u.workspace_id=c.workspace_id AND u.command_id=c.command_id
JOIN agent_runtime_verification_runs l ON l.workspace_id=c.workspace_id AND l.agent_run_id=c.run_id
JOIN verification_runs v ON v.workspace_id=l.workspace_id AND v.id=l.verification_run_id
WHERE c.workspace_id=$1 AND c.run_id=$2 AND c.generation=$3 AND c.command_id=$4
AND u.kind='cancel' AND u.expected_generation=l.agent_generation AND c.generation=l.agent_generation+1
AND l.verification_run_id=$5 AND l.plan_digest=$6 AND l.owner_id=$7 AND v.actor_id=$7
AND v.plan_digest=l.plan_digest AND v.workspace_revision=l.workspace_revision)`, workspaceID, run.RunID, run.Generation, coordinates.CancellationCommandID, coordinates.VerificationRunID, coordinates.PlanDigest, owner).Scan(&matches); err != nil {
			return "", err
		}
		if !matches {
			return "", ErrUnauthorized
		}
	}
	var owner, taskID string
	if err := tx.QueryRowContext(ctx, `SELECT w.owner_id,r.task_id FROM workspaces w JOIN agent_runs r ON r.workspace_id=w.id WHERE w.id=$1 AND r.run_id=$2`, workspaceID, coordinates.AgentRunID).Scan(&owner, &taskID); err != nil {
		return "", err
	}
	if taskID != coordinates.TaskID {
		return "", ErrUnauthorized
	}
	return owner, nil
}

func (repository *Repository) runtimeDriverAuthorization(workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority, clock func() time.Time, cleanup bool) g3.WriteAuthorization {
	return func(ctx context.Context, tx *sql.Tx) error {
		if _, err := repository.authorizeRuntimeDriverTx(ctx, tx, workspaceID, coordinates, lease, clock, cleanup); err != nil {
			return err
		}
		if !cleanup {
			if err := repository.authorizeRuntimeDriverBudgetTx(ctx, tx, workspaceID, coordinates, clock, 0); err != nil {
				return err
			}
		}
		var matches bool
		err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_runtime_g3_driver_jobs WHERE workspace_id=$1 AND verification_run_id=$2 AND agent_run_id=$3 AND task_id=$4 AND request_digest=$5 AND plan_digest=$6 AND cleanup_receipt_bytes IS NULL)`, workspaceID, coordinates.VerificationRunID, coordinates.AgentRunID, coordinates.TaskID, coordinates.RequestDigest, coordinates.PlanDigest).Scan(&matches)
		if err != nil {
			return err
		}
		if !matches {
			if cleanup {
				var exists bool
				if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_runtime_g3_driver_jobs WHERE workspace_id=$1 AND verification_run_id=$2)`, workspaceID, coordinates.VerificationRunID).Scan(&exists); err != nil {
					return err
				}
				if !exists {
					return nil
				}
			}
			return ErrUnauthorized
		}
		_, err = repository.authorizeRuntimeDriverTx(ctx, tx, workspaceID, coordinates, lease, clock, cleanup)
		return err
	}
}

func (repository *Repository) RuntimeDriverContext(ctx context.Context, workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority, clock func() time.Time, planWire json.RawMessage) (RuntimeDriverContext, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return RuntimeDriverContext{}, err
	}
	defer func() { _ = tx.Rollback() }()
	owner, err := repository.authorizeRuntimeDriverTx(ctx, tx, workspaceID, coordinates, lease, clock, coordinates.CancellationCommandID != "")
	if err != nil {
		return RuntimeDriverContext{}, err
	}
	var snapshotBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT snapshot_bytes FROM verification_runs WHERE workspace_id=$1 AND id=$2 FOR SHARE`, workspaceID, coordinates.VerificationRunID).Scan(&snapshotBytes); err != nil {
		return RuntimeDriverContext{}, err
	}
	run, _, err := g3.DecodeVerificationRunSnapshotWire(snapshotBytes)
	if err != nil {
		return RuntimeDriverContext{}, err
	}
	var storedPlan []byte
	var requestDigest, storedRun, storedTask, storedPlanDigest, provider string
	err = tx.QueryRowContext(ctx, `SELECT plan_wire_bytes,request_digest,agent_run_id,task_id,plan_digest,provider_id FROM agent_runtime_g3_driver_jobs WHERE workspace_id=$1 AND verification_run_id=$2 FOR SHARE`, workspaceID, coordinates.VerificationRunID).Scan(&storedPlan, &requestDigest, &storedRun, &storedTask, &storedPlanDigest, &provider)
	if errors.Is(err, sql.ErrNoRows) {
		if coordinates.CancellationCommandID != "" {
			snapshot, err := workspace.NewWorkspaceStore(repository.db).GetSnapshotForOwnerTx(ctx, tx, owner, workspaceID)
			if err != nil {
				return RuntimeDriverContext{}, err
			}
			if err := tx.Commit(); err != nil {
				return RuntimeDriverContext{}, err
			}
			return RuntimeDriverContext{Started: false, Workspace: workspace.BuildSnapshotResponse(snapshot), Plan: json.RawMessage("null"), Run: run, RequestDigest: coordinates.RequestDigest, OwnerID: owner, ProjectID: snapshot.Workspace.ProjectID}, nil
		}
		plan, _, decodeErr := g3.DecodeVerificationPlanWire(planWire)
		if decodeErr != nil {
			return RuntimeDriverContext{}, decodeErr
		}
		if err := authorizeRuntimeRepairPlanTx(ctx, tx, workspaceID, coordinates.TaskID, plan); err != nil {
			return RuntimeDriverContext{}, err
		}
		if plan.WorkspaceID != workspaceID || plan.PlanDigest != coordinates.PlanDigest || plan.TargetRevision != run.WorkspaceRevision {
			return RuntimeDriverContext{}, ErrUnauthorized
		}
		selected := map[string]g3.VerificationPlanCell{}
		for _, cell := range plan.Cells {
			selected[cell.ID] = cell
		}
		for _, cell := range run.Cells {
			planned, ok := selected[cell.CellID]
			if !ok || planned.Surface != run.Surface {
				return RuntimeDriverContext{}, ErrUnauthorized
			}
		}
		storedPlan, err = canonicaljson.Bytes(struct {
			WireVersion int `json:"wireVersion"`
			g3.VerificationPlanGrant
		}{1, plan})
		if err != nil {
			return RuntimeDriverContext{}, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO agent_runtime_g3_driver_jobs(workspace_id,verification_run_id,agent_run_id,task_id,request_digest,plan_digest,plan_wire_bytes,provider_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, workspaceID, run.RunID, coordinates.AgentRunID, coordinates.TaskID, coordinates.RequestDigest, coordinates.PlanDigest, storedPlan, run.ProviderID, canonicalTime(clock())); err != nil {
			return RuntimeDriverContext{}, err
		}
	} else if err != nil {
		return RuntimeDriverContext{}, err
	} else {
		if (coordinates.CancellationCommandID == "" && requestDigest != coordinates.RequestDigest) || storedRun != coordinates.AgentRunID || storedTask != coordinates.TaskID || storedPlanDigest != coordinates.PlanDigest || provider != run.ProviderID {
			return RuntimeDriverContext{}, ErrUnauthorized
		}
		coordinates.RequestDigest = requestDigest
		if len(planWire) > 0 {
			plan, _, err := g3.DecodeVerificationPlanWire(planWire)
			if err != nil {
				return RuntimeDriverContext{}, err
			}
			canonical, err := canonicaljson.Bytes(struct {
				WireVersion int `json:"wireVersion"`
				g3.VerificationPlanGrant
			}{1, plan})
			if err != nil || !bytes.Equal(canonical, storedPlan) {
				return RuntimeDriverContext{}, ErrConflict
			}
		}
	}
	snapshot, err := workspace.NewWorkspaceStore(repository.db).GetSnapshotForOwnerTx(ctx, tx, owner, workspaceID)
	if err != nil {
		return RuntimeDriverContext{}, err
	}
	if coordinates.CancellationCommandID == "" {
		var receiptBytes []byte
		if err := tx.QueryRowContext(ctx, `SELECT m.receipt_bytes FROM agent_runtime_verification_runs l JOIN agent_workspace_mutation_receipts m ON m.workspace_id=l.workspace_id AND m.receipt_id=l.mutation_receipt_id WHERE l.workspace_id=$1 AND l.verification_run_id=$2`, workspaceID, run.RunID).Scan(&receiptBytes); err != nil {
			return RuntimeDriverContext{}, err
		}
		ack, err := decodeMutationReceipt(receiptBytes)
		if err != nil {
			return RuntimeDriverContext{}, err
		}
		matches, err := workspaceRevisionMatchesTx(ctx, tx, workspaceID, ack.TargetRevision)
		if err != nil {
			return RuntimeDriverContext{}, err
		}
		if !matches {
			return RuntimeDriverContext{}, ErrConflict
		}
	}
	if _, err = repository.authorizeRuntimeDriverTx(ctx, tx, workspaceID, coordinates, lease, clock, coordinates.CancellationCommandID != ""); err != nil {
		return RuntimeDriverContext{}, err
	}
	if err := tx.Commit(); err != nil {
		return RuntimeDriverContext{}, err
	}
	return RuntimeDriverContext{Started: true, Workspace: workspace.BuildSnapshotResponse(snapshot), Plan: storedPlan, Run: run, RequestDigest: coordinates.RequestDigest, OwnerID: owner, ProjectID: snapshot.Workspace.ProjectID}, nil
}

// Read-only ACK recovery accepts the bound original lease or consumed cancel
// command after expiry or termination; it cannot authorize another mutation.
func (repository *Repository) runtimeDriverCleanupReplay(ctx context.Context, workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority) ([]byte, error) {
	var receipt []byte
	err := repository.db.QueryRowContext(ctx, `SELECT j.cleanup_receipt_bytes
FROM agent_runtime_g3_driver_jobs j
JOIN agent_runtime_verification_runs l ON l.workspace_id=j.workspace_id AND l.verification_run_id=j.verification_run_id AND l.agent_run_id=j.agent_run_id
JOIN verification_runs v ON v.workspace_id=l.workspace_id AND v.id=l.verification_run_id
JOIN agent_runs r ON r.workspace_id=j.workspace_id AND r.run_id=j.agent_run_id AND r.task_id=j.task_id
JOIN agent_tasks t ON t.workspace_id=r.workspace_id AND t.task_id=r.task_id
JOIN workspaces w ON w.id=j.workspace_id
WHERE j.workspace_id=$1 AND j.verification_run_id=$2 AND j.agent_run_id=$3 AND j.task_id=$4 AND j.plan_digest=$5 AND j.request_digest=$6 AND j.cleanup_receipt_bytes IS NOT NULL
AND w.owner_id=l.owner_id AND t.actor_id=w.owner_id AND v.actor_id=w.owner_id AND v.plan_digest=l.plan_digest AND j.plan_digest=l.plan_digest AND v.workspace_revision=l.workspace_revision
AND (($7='' AND r.generation=l.agent_generation AND $10=l.agent_generation AND (r.phase='terminal' OR (r.lease_id=$8 AND r.lease_holder_id=$9 AND r.lease_generation=$10)))
OR ($7<>'' AND EXISTS(SELECT 1 FROM agent_runtime_cancellations c
JOIN agent_run_user_commands u ON u.workspace_id=c.workspace_id AND u.command_id=c.command_id
WHERE c.workspace_id=r.workspace_id AND c.run_id=r.run_id AND c.generation=r.generation AND c.generation=l.agent_generation+1 AND c.command_id=$7
AND u.kind='cancel' AND u.run_id=r.run_id AND u.task_id=r.task_id AND u.actor_id=w.owner_id AND u.expected_generation=l.agent_generation)))`, workspaceID, coordinates.VerificationRunID, coordinates.AgentRunID, coordinates.TaskID, coordinates.PlanDigest, coordinates.RequestDigest, coordinates.CancellationCommandID, lease.LeaseID, lease.HolderID, lease.Generation).Scan(&receipt)
	return receipt, err
}

func (repository *Repository) recordRuntimeDriverCleanup(ctx context.Context, workspaceID string, coordinates RuntimeDriverCoordinates, lease RunLeaseAuthority, clock func() time.Time, receipt []byte) error {
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := repository.authorizeRuntimeDriverTx(ctx, tx, workspaceID, coordinates, lease, clock, true); err != nil {
		return err
	}
	var status string
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT v.status,j.cleanup_receipt_bytes FROM agent_runtime_g3_driver_jobs j JOIN verification_runs v ON v.workspace_id=j.workspace_id AND v.id=j.verification_run_id WHERE j.workspace_id=$1 AND j.verification_run_id=$2 AND j.request_digest=$3 FOR UPDATE OF j`, workspaceID, coordinates.VerificationRunID, coordinates.RequestDigest).Scan(&status, &existing); err != nil {
		return err
	}
	if status == "queued" || status == "running" || status == "cancelling" {
		return ErrConflict
	}
	if len(existing) > 0 {
		if !bytes.Equal(existing, receipt) {
			return ErrConflict
		}
		return tx.Commit()
	}
	var pending bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM verification_promotions WHERE workspace_id=$1 AND candidate_json->'run'->>'runId'=$2 AND state IN('staging','verification-pending')) OR EXISTS(SELECT 1 FROM verification_artifact_operation_leases l JOIN verification_promotions p ON p.id=l.owner_id WHERE p.workspace_id=$1 AND p.candidate_json->'run'->>'runId'=$2)`, workspaceID, coordinates.VerificationRunID).Scan(&pending); err != nil {
		return err
	}
	if pending {
		return ErrConflict
	}
	if _, err := repository.authorizeRuntimeDriverTx(ctx, tx, workspaceID, coordinates, lease, clock, true); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE agent_runtime_g3_driver_jobs SET cleanup_receipt_bytes=$4,cleaned_at=$5 WHERE workspace_id=$1 AND verification_run_id=$2 AND request_digest=$3 AND cleanup_receipt_bytes IS NULL`, workspaceID, coordinates.VerificationRunID, coordinates.RequestDigest, receipt, canonicalTime(clock())); err != nil {
		return err
	}
	return tx.Commit()
}
