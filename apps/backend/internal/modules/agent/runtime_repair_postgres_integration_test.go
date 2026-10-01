package agent

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
)

type runtimeRepairVector struct {
	Policy   json.RawMessage                `json:"policy"`
	Task     json.RawMessage                `json:"task"`
	Sequence []proposalRepositoryVectorStep `json:"sequence"`
	Approval json.RawMessage                `json:"approval"`
	Terminal proposalRepositoryVectorStep   `json:"terminal"`
}

type runtimeRepairHarness struct {
	verificationPostgreSQLHarness
	Coordinates                   RuntimeDriverCoordinates
	Authorization                 RuntimeVerificationAuthorization
	Plan, Closure, ClosureReceipt json.RawMessage
	Vector                        runtimeRepairVector
	Clock                         func() time.Time
}

func runtimeRepairFailureHarness(t *testing.T) runtimeRepairHarness {
	t.Helper()
	source, err := os.ReadFile("../../platform/agentcontract/testdata/agent-runtime-repair-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector runtimeRepairVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	var planWire json.RawMessage
	h := prepareVerificationPostgreSQLHarnessWithPlanning(t, func(proposal *proposalRepositoryVector) {
		proposal.ControlFacts.Task, proposal.ControlFacts.Sequence, proposal.Facts.Approval = vector.Task, vector.Sequence, vector.Approval
		planWire = runtimeDriverPlan(t, proposal)
	})
	runWire, runSource, authorization := runtimeVerificationSnapshot(t, h, "verification.runtime.repair")
	if _, _, err := g3.NewRepository(h.databaseA).CreateVerificationRunWithAuthorization(context.Background(), "user.test", runWire, runSource, runtimeVerificationCallback(h, authorization)); err != nil {
		t.Fatal(err)
	}
	coordinates := RuntimeDriverCoordinates{TaskID: h.task.TaskID, AgentRunID: authorization.AgentRunID, VerificationRunID: runWire.RunID, PlanDigest: runWire.PlanDigest, RequestDigest: runtimeTestDigest(t, map[string]any{"execution": runWire.RunID}, "unused")}
	if _, err := h.repositoryA.RuntimeDriverContext(context.Background(), h.task.WorkspaceID, coordinates, h.lease, authorization.Clock, planWire); err != nil {
		t.Fatal(err)
	}
	plan, _, err := g3.DecodeVerificationPlanWire(planWire)
	if err != nil {
		t.Fatal(err)
	}
	publicSource, err := os.ReadFile("../../platform/agentcontract/testdata/agent-repair-task-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var publicVector struct {
		Closure map[string]any `json:"closure"`
	}
	if err := json.Unmarshal(publicSource, &publicVector); err != nil {
		t.Fatal(err)
	}
	closure := publicVector.Closure
	for _, key := range []string{"workspaceId", "targetRevision", "targetPartitionRevisions", "planDigest", "policyRevision", "policyDigest", "policyEvaluationInstant", "scenarioRegistryDigest", "semanticSchemaDigest", "providerSetDigest", "adapterRegistryDigest", "impactDigest", "compilerDigest", "plannerDigest"} {
		var planObject map[string]any
		_ = json.Unmarshal(planWire, &planObject)
		closure[key] = planObject[key]
	}
	closure["closureEvaluationInstant"] = "2026-08-01T09:00:00.100Z"
	closure["baselineSetDigests"], closure["evidenceDigests"], closure["appliedExemptionIds"] = []any{}, []any{}, []any{}
	closure["cellStatuses"] = map[string]any{plan.Cells[0].ID: "missing"}
	closure["issues"] = []any{map[string]any{"cellId": plan.Cells[0].ID, "status": "missing", "message": "The required cell has no Evidence.", "evidenceIds": []any{}}}
	delete(closure, "wireVersion")
	closure["closureDigest"] = runtimeTestDigest(t, closure, "closureDigest")
	closure["wireVersion"] = 1
	closureWire, err := canonicaljson.Bytes(closure)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := verificationcontract.ReadClosureReference(closureWire); err != nil {
		t.Fatalf("public failed Closure codec: %v", err)
	}
	// Seed the already normalized terminal execution projection. The service
	// write assertions below all use its actual public repository boundaries.
	runWire.Status = "failed"
	runWire.Cursor = 1
	runWire.UpdatedAt = "2026-08-01T09:00:00.100Z"
	runWire.Cells[0].Status = "blocked"
	runWire.Cells[0].LastEventCursor = 1
	runWire.ClosureDigest = closure["closureDigest"].(string)
	runWire.ClosureVerdict = "unsatisfied"
	runWire.SnapshotDigest = runtimeTestDigest(t, runWire.VerificationRunSnapshot, "snapshotDigest")
	terminalWire, err := canonicaljson.Bytes(runWire)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := g3.DecodeVerificationRunSnapshotWire(terminalWire); err != nil {
		t.Fatal(err)
	}
	if _, err := h.databaseA.Exec(`UPDATE verification_runs SET status='failed',cursor=1,snapshot_digest=$1,snapshot_json=$2::jsonb,snapshot_bytes=$3,updated_at=$4 WHERE workspace_id=$5 AND id=$6`, runWire.SnapshotDigest, string(terminalWire), terminalWire, mustAgentTime(t, runWire.UpdatedAt), h.task.WorkspaceID, runWire.RunID); err != nil {
		t.Fatal(err)
	}
	var bindingWire map[string]any
	if err := json.Unmarshal(h.verification.Facts.Binding, &bindingWire); err != nil {
		t.Fatal(err)
	}
	binding := bindingWire["value"].(map[string]any)
	binding["actualPlanDigest"], binding["approvedPlanDigest"], binding["impactDigest"] = plan.PlanDigest, plan.PlanDigest, plan.ImpactDigest
	binding["verificationRuns"] = []any{map[string]any{"verificationRunId": runWire.RunID, "surface": "preview", "selectedCellSetDigest": runtimeTestDigest(t, map[string]any{"ids": runWire.SelectedCellIDs}, "unused")}}
	selectedDigest, _ := canonicaljson.Digest(runWire.SelectedCellIDs)
	binding["verificationRuns"].([]any)[0].(map[string]any)["selectedCellSetDigest"] = selectedDigest
	binding["boundAt"] = "2026-08-01T09:00:00.050Z"
	binding["bindingDigest"] = runtimeTestDigest(t, binding, "bindingDigest")
	bindingSource, err := canonicaljson.Bytes(bindingWire)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := h.repositoryA.StoreVerificationPlanBinding(context.Background(), h.service, bindingSource); err != nil {
		t.Fatal(err)
	}
	var receiptWire map[string]any
	if err := json.Unmarshal(h.verification.Facts.Closure, &receiptWire); err != nil {
		t.Fatal(err)
	}
	receipt := receiptWire["value"].(map[string]any)
	receipt["planDigest"], receipt["closureDigest"], receipt["evidenceSetDigest"], receipt["evidenceRefs"] = plan.PlanDigest, closure["closureDigest"], closure["evidenceSetDigest"], []any{}
	receipt["verificationRuns"] = []any{map[string]any{"verificationRunId": runWire.RunID, "surface": "preview", "selectedCellSetDigest": selectedDigest, "snapshotDigest": runWire.SnapshotDigest}}
	receipt["evaluatedAt"] = "2026-08-01T09:00:00.100Z"
	receipt["receiptDigest"] = runtimeTestDigest(t, receipt, "receiptDigest")
	receiptSource, err := canonicaljson.Bytes(receiptWire)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := h.repositoryA.StoreVerificationClosureReceipt(context.Background(), h.service, receiptSource); err != nil {
		t.Fatal(err)
	}
	clock := func() time.Time { return mustAgentTime(t, "2026-08-01T09:00:00.200Z") }
	if err := h.repositoryA.StoreRuntimeRepairFailure(context.Background(), h.task.WorkspaceID, authorization.AgentRunID, stringMember(receipt, "receiptId"), closureWire, h.lease, clock); err != nil {
		t.Fatal(err)
	}
	return runtimeRepairHarness{verificationPostgreSQLHarness: h, Coordinates: coordinates, Authorization: authorization, Plan: planWire, Closure: closureWire, ClosureReceipt: receiptSource, Vector: vector, Clock: clock}
}

func terminalizeRuntimeRepair(t *testing.T, h runtimeRepairHarness) runFact {
	t.Helper()
	ctx := context.Background()
	cleanup, _ := canonicaljson.Bytes(map[string]any{"contract": "prodivix.agent-runtime-g3-cleanup", "resourcesClean": true, "requestDigest": h.Coordinates.RequestDigest})
	if err := h.repositoryA.recordRuntimeDriverCleanup(ctx, h.task.WorkspaceID, h.Coordinates, h.lease, h.Clock, cleanup); err != nil {
		t.Fatal(err)
	}
	lease := h.lease
	lease.ObservedAt = eventTimeFromVector(t, h.Vector.Terminal.Event)
	if _, _, err := h.repositoryA.AppendTransition(ctx, h.task.WorkspaceID, lease, h.Vector.Terminal.Run, h.Vector.Terminal.Event); err != nil {
		t.Fatal(err)
	}
	parent, _ := decodeTaskFact(h.Vector.Task)
	ref, _ := objectMember(parent.Spec, "policyRef")
	if _, err := h.databaseA.Exec(`INSERT INTO workspace_documents(workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES($1,$2,'agent-policy','Runtime repair policy','/agent.policy.json',1,1,$3::jsonb,'[]'::jsonb,NOW())`, h.task.WorkspaceID, stringMember(ref, "documentId"), string(h.Vector.Policy)); err != nil {
		t.Fatal(err)
	}
	node, _ := canonicaljson.Bytes(map[string]any{"id": "policy-runtime-node", "kind": "doc", "name": "agent.policy.json", "parentId": "root", "docId": ref["documentId"]})
	if _, err := h.databaseA.Exec(`UPDATE workspaces SET tree_json=jsonb_set(jsonb_set(tree_json,'{treeById,root,children}',tree_json#>'{treeById,root,children}'||'"policy-runtime-node"'::jsonb),'{treeById,policy-runtime-node}',$1::jsonb) WHERE id=$2`, string(node), h.task.WorkspaceID); err != nil {
		t.Fatal(err)
	}
	return mustRuntimeRunFact(t, h.Vector.Terminal.Run)
}

func TestRuntimeRepairFailurePreservesOriginalPublicClosurePostgreSQLGate(t *testing.T) {
	h := runtimeRepairFailureHarness(t)
	ctx := context.Background()
	receipt, _ := decodeVerificationClosureReceipt(h.ClosureReceipt)
	if err := h.repositoryB.StoreRuntimeRepairFailure(ctx, h.task.WorkspaceID, h.Authorization.AgentRunID, receipt.ReceiptID, h.Closure, h.lease, h.Clock); err != nil {
		t.Fatal(err)
	}
	var changed map[string]any
	_ = json.Unmarshal(h.Closure, &changed)
	changed["closureEvaluationInstant"] = "2026-08-01T09:00:00.150Z"
	delete(changed, "wireVersion")
	changed["closureDigest"] = runtimeTestDigest(t, changed, "closureDigest")
	changed["wireVersion"] = 1
	altered, _ := canonicaljson.Bytes(changed)
	if err := h.repositoryB.StoreRuntimeRepairFailure(ctx, h.task.WorkspaceID, h.Authorization.AgentRunID, receipt.ReceiptID, altered, h.lease, h.Clock); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("another Closure publication admitted: %v", err)
	}
	if err := h.repositoryB.StoreRuntimeRepairFailure(ctx, h.task.WorkspaceID, h.Authorization.AgentRunID, receipt.ReceiptID, h.Closure, h.lease, func() time.Time { return mustAgentTime(t, "2026-08-02T03:00:00Z") }); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired failure callback admitted: %v", err)
	}
	var count int
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM agent_runtime_repair_failures`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("failure material count=%d err=%v", count, err)
	}
}

func TestRuntimeRepairDelegatesOnceAndReplaysExactAdmissionPostgreSQLGate(t *testing.T) {
	h := runtimeRepairFailureHarness(t)
	run := terminalizeRuntimeRepair(t, h)
	receipt, _ := decodeVerificationClosureReceipt(h.ClosureReceipt)
	authority := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: h.task.WorkspaceID, ProjectID: h.task.ProjectID}
	input := RuntimeRepairTaskInput{RequestID: "request.runtime.repair", ExpectedParentSnapshotDigest: run.SnapshotDigest, ExpectedClosureDigest: receipt.ClosureDigest}
	now := run.UpdatedAt.Add(time.Second)
	clock := func() time.Time { return now }
	result, err := h.repositoryA.CreateRuntimeRepairAdmission(context.Background(), authority, run.RunID, input, clock)
	if err != nil {
		t.Fatal(err)
	}
	request, _, err := agentcontract.DecodeRepairTaskRequest(result.Request)
	if err != nil {
		t.Fatal(err)
	}
	childWire := request["requestedTask"].(map[string]any)
	child := childWire["value"].(map[string]any)
	spec := child["spec"].(map[string]any)
	budget := spec["budget"].(map[string]any)
	if budget["maxTransactions"] != float64(1) || budget["maxRepairRounds"] != float64(0) || budget["maxElapsedMs"] != float64(3600000-now.Sub(run.CreatedAt).Milliseconds()) {
		t.Fatalf("repair budget reset: %#v", budget)
	}
	docs := spec["baseRevision"].(map[string]any)["documents"].([]any)
	if len(docs) != 2 {
		t.Fatalf("fresh canonical revision omitted policy: %#v", docs)
	}
	if spec["policyDigest"] != run.PolicyDigest || child["lineage"].(map[string]any)["parentTaskId"] != run.TaskID {
		t.Fatal("child authority/lineage drift")
	}
	admission, err := h.repositoryB.ReadRuntimeAdmission(context.Background(), authority, result.AdmissionID)
	if err != nil {
		t.Fatal(err)
	}
	admitted := admissionResultFixture(t, admission)
	originalChild, _ := decodeTaskFact(admission.Task)
	admittedChild, _ := decodeTaskFact(admitted.Task)
	for key, left := range originalChild.Spec {
		if key != "initialGrantRef" && !sameMember(left, admittedChild.Spec[key]) {
			t.Fatalf("admission changed %s", key)
		}
	}
	if admission.ObservedAt.Location() != time.UTC || admission.ExpiresAt.Location() != time.UTC || admission.ObservedAt.Format("2006-01-02T15:04:05.000Z") != now.Format("2006-01-02T15:04:05.000Z") {
		t.Fatal("database admission clock changed UTC challenge identity")
	}
	if _, err := validateAdmissionResult(admission, admitted); err != nil {
		t.Fatalf("fresh repair admission result owner: %v", err)
	}
	checkTx, err := h.databaseA.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	admissionTask, _ := decodeTaskFact(admission.Task)
	authDigest, checkErr := validateAdmissionWorkspaceTx(context.Background(), checkTx, authority, admissionTask)
	_ = checkTx.Rollback()
	if checkErr != nil || authDigest != admission.ActorAuthorizationDigest {
		t.Fatalf("fresh repair admission scope: %v actual=%s expected=%s", checkErr, authDigest, admission.ActorAuthorizationDigest)
	}
	if err := h.repositoryA.StoreRuntimeAdmissionResult(context.Background(), admission.AdmissionID, admitted, clock); err != nil {
		t.Fatal(err)
	}
	created, replayed, err := h.repositoryB.CreateAdmittedTask(context.Background(), authority, admitted.Task, admission.AdmissionID, admitted.AdmissionDigest, clock)
	if err != nil || replayed || created.TaskID != stringMember(spec, "taskId") {
		t.Fatalf("bounded child did not enter fresh admission/Task owner: %#v replay=%v err=%v", created, replayed, err)
	}
	if _, replayed, err := h.repositoryA.CreateAdmittedTask(context.Background(), authority, admitted.Task, admission.AdmissionID, admitted.AdmissionDigest, func() time.Time { return now.Add(time.Hour) }); err != nil || !replayed {
		t.Fatalf("child Task ACK replay changed admission: replay=%v err=%v", replayed, err)
	}
	var aliased map[string]any
	childCopy, _ := json.Marshal(child)
	_ = json.Unmarshal(childCopy, &aliased)
	aliased["spec"].(map[string]any)["taskId"] = "task.manual.repair-budget-reset"
	if _, err := h.repositoryA.CreateRuntimeAdmission(context.Background(), authority, encodeAdmissionTask(t, aliased), now); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("derived child bypassed budget delegation by changing its ID: %v", err)
	}
	later := func() time.Time { return now.Add(48 * time.Hour) }
	replay, err := h.repositoryB.CreateRuntimeRepairAdmission(context.Background(), authority, run.RunID, input, later)
	if err != nil || string(replay.Request) != string(result.Request) || replay.AdmissionID != result.AdmissionID {
		t.Fatalf("ACK-loss replay changed delegated budget or identity: %v", err)
	}
	input.RequestID = "request.runtime.another-repair"
	if _, err := h.repositoryB.CreateRuntimeRepairAdmission(context.Background(), authority, run.RunID, input, clock); !errors.Is(err, ErrConflict) {
		t.Fatalf("parent delegated twice: %v", err)
	}
	if _, err := h.databaseA.Exec(`UPDATE agent_runtime_repair_delegations SET request_id=request_id`); err == nil {
		t.Fatal("repair delegation accepted UPDATE")
	}
	var count int
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM agent_runtime_admissions`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("repair admissions=%d err=%v", count, err)
	}
	material, err := h.repositoryB.RuntimeRepairFailureForTask(context.Background(), h.task.WorkspaceID, stringMember(spec, "taskId"))
	if err != nil || material == nil || string(material.Closure) != string(h.Closure) || len(material.Evidence) != 0 {
		t.Fatalf("failure Context material drift: %#v %v", material, err)
	}
	original, err := h.repositoryB.RuntimeRepairFailureForTask(context.Background(), h.task.WorkspaceID, h.task.TaskID)
	if err != nil || original != nil {
		t.Fatalf("ordinary Task inherited unrelated repair material: %#v %v", original, err)
	}
}

func TestRuntimeRepairFailsClosedWithoutBudgetOrOwnerPostgreSQLGate(t *testing.T) {
	h := runtimeRepairFailureHarness(t)
	run := terminalizeRuntimeRepair(t, h)
	receipt, _ := decodeVerificationClosureReceipt(h.ClosureReceipt)
	input := RuntimeRepairTaskInput{RequestID: "request.runtime.exhausted", ExpectedParentSnapshotDigest: run.SnapshotDigest, ExpectedClosureDigest: receipt.ClosureDigest}
	authority := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: h.task.WorkspaceID, ProjectID: h.task.ProjectID}
	if _, err := h.repositoryA.CreateRuntimeRepairAdmission(context.Background(), authority, run.RunID, input, func() time.Time { return run.CreatedAt.Add(time.Hour) }); !errors.Is(err, ErrConflict) {
		t.Fatalf("whole parent wall-time budget reset: %v", err)
	}
	authority.PrincipalID = "user.foreign"
	if _, err := h.repositoryA.CreateRuntimeRepairAdmission(context.Background(), authority, run.RunID, input, func() time.Time { return run.UpdatedAt.Add(time.Second) }); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("foreign actor obtained child admission: %v", err)
	}
	var count int
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM agent_runtime_repair_delegations`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rejected repair delegated budget=%d err=%v", count, err)
	}
}
