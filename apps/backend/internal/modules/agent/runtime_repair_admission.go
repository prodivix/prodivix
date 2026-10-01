package agent

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	workspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
)

type RuntimeRepairTaskInput struct {
	RequestID                    string `json:"requestId"`
	ExpectedParentSnapshotDigest string `json:"expectedParentSnapshotDigest"`
	ExpectedClosureDigest        string `json:"expectedClosureDigest"`
}
type RuntimeRepairAdmissionResult struct {
	Request         json.RawMessage `json:"request"`
	AdmissionID     string          `json:"admissionId"`
	ChallengeDigest string          `json:"challengeDigest"`
	Status          string          `json:"status"`
}

func createRuntimeAdmissionTx(ctx context.Context, tx *sql.Tx, task taskFact, authDigest string, now time.Time) (runtimeAdmission, error) {
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return runtimeAdmission{}, err
	}
	value := runtimeAdmission{AdmissionID: "admission." + hex.EncodeToString(id), WorkspaceID: task.WorkspaceID, ProjectID: task.ProjectID, ActorID: task.ActorID, ActorAuthorizationDigest: authDigest, Task: task.Canonical, Status: "pending", ObservedAt: canonicalTime(now), ExpiresAt: canonicalTime(now.Add(5 * time.Minute))}
	var err error
	value.ChallengeDigest, err = canonicaljson.Digest(map[string]any{"admissionId": value.AdmissionID, "taskDigest": task.TaskDigest, "actorAuthorizationDigest": authDigest, "observedAt": value.ObservedAt.Format("2006-01-02T15:04:05.000Z"), "expiresAt": value.ExpiresAt.Format("2006-01-02T15:04:05.000Z")})
	if err != nil {
		return runtimeAdmission{}, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_runtime_admissions(workspace_id,admission_id,actor_id,project_id,task_id,idempotency_key,challenge_digest,actor_authorization_digest,task_bytes,observed_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, value.WorkspaceID, value.AdmissionID, value.ActorID, value.ProjectID, task.TaskID, task.IdempotencyKey, value.ChallengeDigest, authDigest, value.Task, value.ObservedAt, value.ExpiresAt)
	return value, err
}

// One failed parent delegates its entire remaining multi-dimensional budget to
// one fresh user-bound Task admission. Parent terminal facts stay immutable.
func (repository *Repository) CreateRuntimeRepairAdmission(ctx context.Context, authority PrincipalAuthority, parentRunID string, input RuntimeRepairTaskInput, clock func() time.Time) (RuntimeRepairAdmissionResult, error) {
	if err := repository.available(); err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	if authority.Kind != "user" || clock == nil || !agentcontractIdentity(input.RequestID) || !canonicalDigestPattern.MatchString(input.ExpectedParentSnapshotDigest) || !canonicalDigestPattern.MatchString(input.ExpectedClosureDigest) {
		return RuntimeRepairAdmissionResult{}, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	defer tx.Rollback()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	run, err := scanRunFactTx(ctx, tx, authority.WorkspaceID, parentRunID)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	if run.SnapshotDigest != input.ExpectedParentSnapshotDigest || run.Phase != "terminal" || run.Outcome != "failed" || (run.CleanupState != "clean" && run.CleanupState != "not-required") {
		return RuntimeRepairAdmissionResult{}, ErrConflict
	}
	parent, err := loadTaskTx(ctx, tx, authority.WorkspaceID, run.TaskID)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	if parent.ActorKind != "user" || parent.ActorID != authority.PrincipalID || parent.ProjectID != authority.ProjectID || parent.Mode != "apply" {
		return RuntimeRepairAdmissionResult{}, ErrUnauthorized
	}
	var planBytes, closureBytes []byte
	var receiptID string
	err = tx.QueryRowContext(ctx, `SELECT plan_wire_bytes,closure_wire_bytes,closure_receipt_id FROM agent_runtime_repair_failures WHERE workspace_id=$1 AND parent_run_id=$2 FOR SHARE`, authority.WorkspaceID, parentRunID).Scan(&planBytes, &closureBytes, &receiptID)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	_, receipt, err := loadVerificationClosureReceiptTx(ctx, tx, authority.WorkspaceID, receiptID)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	if receipt.ClosureDigest != input.ExpectedClosureDigest || receipt.Verdict == "satisfied" || receipt.RunID != parentRunID || receipt.TaskID != parent.TaskID {
		return RuntimeRepairAdmissionResult{}, ErrUnauthorized
	}
	var existingRequest []byte
	var existingID, admissionID, actor string
	err = tx.QueryRowContext(ctx, `SELECT request_id,request_wire_bytes,admission_id,actor_id FROM agent_runtime_repair_delegations WHERE workspace_id=$1 AND parent_run_id=$2 FOR SHARE`, authority.WorkspaceID, parentRunID).Scan(&existingID, &existingRequest, &admissionID, &actor)
	if err == nil {
		if existingID != input.RequestID || actor != authority.PrincipalID {
			return RuntimeRepairAdmissionResult{}, ErrConflict
		}
		admission, err := scanAdmission(tx.QueryRowContext(ctx, `SELECT `+admissionColumns+` FROM agent_runtime_admissions WHERE workspace_id=$1 AND admission_id=$2`, authority.WorkspaceID, admissionID))
		if err != nil {
			return RuntimeRepairAdmissionResult{}, err
		}
		if err := tx.Commit(); err != nil {
			return RuntimeRepairAdmissionResult{}, err
		}
		return RuntimeRepairAdmissionResult{Request: existingRequest, AdmissionID: admission.AdmissionID, ChallengeDigest: admission.ChallengeDigest, Status: admission.Status}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return RuntimeRepairAdmissionResult{}, err
	}
	var unclean int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_runtime_g3_driver_jobs WHERE workspace_id=$1 AND agent_run_id=$2 AND cleanup_receipt_bytes IS NULL`, authority.WorkspaceID, parentRunID).Scan(&unclean); err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	if unclean != 0 {
		return RuntimeRepairAdmissionResult{}, ErrUnauthorized
	}
	measurement, err := runtimeRepairMeasurementsTx(ctx, tx, authority.WorkspaceID, run, clock())
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	ledger, _ := objectMember(run.Value, "budgetLedger")
	ledgerBytes, err := canonicaljson.Bytes(ledger)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	if !sameMember(ledger["budget"], parent.Spec["budget"]) {
		return RuntimeRepairAdmissionResult{}, ErrUnauthorized
	}
	budget, err := agentcontract.RemainingRepairBudget(ledgerBytes, measurement)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, conflict(err.Error())
	}
	evidenceWires, err := runtimeRepairEvidenceTx(ctx, tx, authority.WorkspaceID, receipt)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	var plan map[string]any
	if err := json.Unmarshal(planBytes, &plan); err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	closure, _, err := verificationcontract.ReadClosureReference(closureBytes)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	evidence := []map[string]any{}
	for _, wire := range evidenceWires {
		var manifest map[string]any
		if err := json.Unmarshal(wire, &manifest); err != nil {
			return RuntimeRepairAdmissionResult{}, err
		}
		item, ok := manifest["evidence"].(map[string]any)
		if !ok {
			return RuntimeRepairAdmissionResult{}, ErrInvalid
		}
		item["manifestDigest"] = manifest["manifestDigest"]
		evidence = append(evidence, item)
	}
	counterexamples, err := agentcontract.DeriveRepairCounterexamples(plan, closure, evidence)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	snapshot, err := workspace.NewWorkspaceStore(repository.db).GetSnapshotForOwnerTx(ctx, tx, authority.PrincipalID, authority.WorkspaceID)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	currentRevision := runtimeRepairRevision(snapshot)
	request, task, err := runtimeRepairRequest(parent, run, receipt, counterexamples, currentRevision, budget, input.RequestID, clock())
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	authDigest, err := validateAdmissionWorkspaceTx(ctx, tx, authority, task)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	// Actual time is sampled again after all owner locks and canonical reads.
	actual := clock()
	if actual.Before(run.UpdatedAt) {
		return RuntimeRepairAdmissionResult{}, ErrUnauthorized
	}
	latestMeasurement, err := runtimeRepairMeasurementsTx(ctx, tx, authority.WorkspaceID, run, actual)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	latestBudget, err := agentcontract.RemainingRepairBudget(ledgerBytes, latestMeasurement)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, conflict(err.Error())
	}
	request, task, err = runtimeRepairRequest(parent, run, receipt, counterexamples, currentRevision, latestBudget, input.RequestID, actual)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	admission, err := createRuntimeAdmissionTx(ctx, tx, task, authDigest, actual)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	var wire map[string]any
	if err := json.Unmarshal(request, &wire); err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	value := wire["value"].(map[string]any)
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_runtime_repair_delegations(workspace_id,parent_run_id,parent_task_id,child_task_id,request_id,request_digest,request_wire_bytes,admission_id,actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, authority.WorkspaceID, parentRunID, parent.TaskID, task.TaskID, input.RequestID, value["requestDigest"], request, admission.AdmissionID, authority.PrincipalID, actual)
	if err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return RuntimeRepairAdmissionResult{}, err
	}
	return RuntimeRepairAdmissionResult{Request: request, AdmissionID: admission.AdmissionID, ChallengeDigest: admission.ChallengeDigest, Status: admission.Status}, nil
}

func agentcontractIdentity(value string) bool { return agentcontract.IsControlIdentity(value) }

func runtimeRepairMeasurementsTx(ctx context.Context, tx *sql.Tx, workspaceID string, run runFact, now time.Time) (agentcontract.RepairBudgetLowerBounds, error) {
	value := agentcontract.RepairBudgetLowerBounds{}
	if now.Before(run.UpdatedAt) || now.Before(run.CreatedAt) {
		return value, ErrUnauthorized
	}
	value.ElapsedMS = now.Sub(run.CreatedAt).Milliseconds()
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_workspace_mutation_receipts WHERE workspace_id=$1 AND run_id=$2 AND state='acknowledged'`, workspaceID, run.RunID).Scan(&value.Transactions); err != nil {
		return value, err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(a.expected_size),0) FROM verification_promotion_artifacts a JOIN verification_promotions p ON p.id=a.promotion_id JOIN agent_runtime_verification_runs l ON l.workspace_id=p.workspace_id AND l.verification_run_id=p.candidate_json->'run'->>'runId' WHERE l.workspace_id=$1 AND l.agent_run_id=$2`, workspaceID, run.RunID).Scan(&value.ArtifactBytes); err != nil {
		return value, err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(round),0) FROM agent_repair_round_receipts WHERE workspace_id=$1 AND run_id=$2`, workspaceID, run.RunID).Scan(&value.OpenedRepairRounds); err != nil {
		return value, err
	}
	return value, nil
}

func runtimeRepairRevision(snapshot *workspace.WorkspaceSnapshot) map[string]any {
	documents := make([]any, 0, len(snapshot.Documents))
	sort.Slice(snapshot.Documents, func(i, j int) bool { return snapshot.Documents[i].ID < snapshot.Documents[j].ID })
	for _, doc := range snapshot.Documents {
		documents = append(documents, map[string]any{"documentId": doc.ID, "contentRev": doc.ContentRev, "metaRev": doc.MetaRev})
	}
	return map[string]any{"workspaceRev": snapshot.Workspace.WorkspaceRev, "routeRev": snapshot.Workspace.RouteRev, "opSeq": snapshot.Workspace.OpSeq, "documents": documents}
}

func runtimeRepairRequest(parent taskFact, run runFact, receipt verificationClosureReceiptFact, counterexamples, currentRevision, budget map[string]any, requestID string, now time.Time) ([]byte, taskFact, error) {
	identity, err := canonicaljson.Digest(map[string]any{"requestId": requestID, "parentTaskDigest": parent.TaskDigest, "failedClosureDigest": receipt.ClosureDigest})
	if err != nil {
		return nil, taskFact{}, err
	}
	identity = identity[7:]
	intent := fmt.Sprintf("Repair the failed verification of task %s. Preserve its original intent and all required counterexamples. Failed closure: %s.", parent.TaskID, receipt.ClosureDigest)
	intentDigest, err := canonicaljson.Digest(intent)
	if err != nil {
		return nil, taskFact{}, err
	}
	spec := map[string]any{}
	for key, value := range parent.Spec {
		spec[key] = value
	}
	requestedAt := canonicalTime(now).Format("2006-01-02T15:04:05.000Z")
	spec["taskId"], spec["baseRevision"], spec["intent"], spec["intentDigest"], spec["budget"], spec["createdAt"], spec["idempotencyKey"], spec["initialGrantRef"] = "task.repair."+identity, currentRevision, intent, intentDigest, budget, requestedAt, "repair."+identity, map[string]any{"grantId": "grant.pending.repair." + identity}
	taskValue := map[string]any{"spec": spec, "lineage": map[string]any{"reason": "intent-changed", "parentTaskId": parent.TaskID}}
	taskValue["taskDigest"], err = canonicaljson.Digest(taskValue)
	if err != nil {
		return nil, taskFact{}, err
	}
	taskWire, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "task-record", "value": taskValue})
	if err != nil {
		return nil, taskFact{}, err
	}
	task, err := decodeTaskFact(taskWire)
	if err != nil {
		return nil, taskFact{}, err
	}
	ledger, _ := objectMember(run.Value, "budgetLedger")
	value := map[string]any{"requestId": requestID, "parentTaskId": parent.TaskID, "parentTaskDigest": parent.TaskDigest, "parentRunId": run.RunID, "failedClosureReceiptId": receipt.ReceiptID, "failedClosureDigest": receipt.ClosureDigest, "counterexamples": counterexamples, "expectedParentSnapshotDigest": run.SnapshotDigest, "expectedParentLedgerDigest": ledger["ledgerDigest"], "currentRevision": currentRevision, "requestedAt": requestedAt, "requestedTask": taskValue}
	value["requestDigest"], err = canonicaljson.Digest(value)
	if err != nil {
		return nil, taskFact{}, err
	}
	value["requestedTask"] = json.RawMessage(taskWire)
	request, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "repair-task-request", "value": value})
	if err == nil {
		_, _, err = agentcontract.DecodeRepairTaskRequest(request)
	}
	return request, task, err
}
