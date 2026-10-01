package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

func runtimeOutputWire(t *testing.T, value map[string]any) []byte {
	t.Helper()
	value["contentDigest"], _ = canonicaljson.Digest(value["text"])
	delete(value, "outputDigest")
	value["outputDigest"], _ = canonicaljson.Digest(value)
	raw, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "task-output", "value": value})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := agentcontract.DecodeAgentTaskOutput(raw); err != nil {
		t.Fatal(err)
	}
	return raw
}

func runtimeOutputTemplate(t *testing.T, step repositoryVectorStep, task taskFact, receipt map[string]any) repositoryVectorStep {
	t.Helper()
	next, err := decodeRunFact(step.Run)
	if err != nil {
		t.Fatal(err)
	}
	event, err := decodeEventFact(step.Event)
	if err != nil {
		t.Fatal(err)
	}
	run, _ := objectMember(next.Value, "run")
	run["policyDigest"], run["grantRef"], next.Value["taskDigest"] = task.PolicyDigest, task.Spec["initialGrantRef"], task.TaskDigest
	event.Value["policyDigest"], event.Value["grantRef"], event.Value["producer"] = task.PolicyDigest, task.Spec["initialGrantRef"], map[string]any{"kind": "service", "principalId": RuntimePrincipalID}
	payload, _ := objectMember(event.Value, "sanitizedPayload")
	if event.Type == "run.created" {
		payload["taskDigest"] = task.TaskDigest
		event.Value["requestDigest"], _ = canonicaljson.Digest(map[string]any{"operation": "create-run", "taskDigest": task.TaskDigest, "runId": next.RunID})
	}
	if receipt != nil {
		operation, _ := objectMember(next.Value, "pendingOperation")
		operation["resultDigest"], _ = canonicaljson.Digest(receipt)
		operation["operationDigest"] = runtimeTestDigest(t, operation, "operationDigest")
		event.Data["operation"] = operation
		payload["result"], payload["operationDigest"] = receipt, operation["operationDigest"]
		event.Value["requestDigest"], _ = canonicaljson.Digest(map[string]any{"operation": "settle-operation", "operationId": operation["operationId"], "status": "completed", "resultDigest": operation["resultDigest"]})
	}
	event.Value["payloadDigest"], _ = canonicaljson.Digest(payload)
	event.Value["eventDigest"] = runtimeTestDigest(t, event.Value, "eventDigest")
	if event.Type == "run.created" {
		run["latestEventDigest"] = event.Value["eventDigest"]
		processed, _ := arrayMember(next.Value, "processedEvents")
		entry := processed[0].(map[string]any)
		entry["eventDigest"], entry["requestDigest"] = event.Value["eventDigest"], event.Value["requestDigest"]
	}
	next.Value["snapshotDigest"] = runtimeTestDigest(t, next.Value, "snapshotDigest")
	step.Run, _ = canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "run-snapshot", "value": next.Value})
	step.Event, _ = canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "run-event", "value": event.Value})
	return step
}

func runtimeOutputFixture(t *testing.T) (*sql.DB, *Repository, taskFact, runFact, RuntimeLeaseGuard, map[string]any) {
	t.Helper()
	db, _ := openAgentPostgreSQL(t)
	repository := NewRepository(db)
	ctx := context.Background()
	source := admissionTaskFixture(t, db)
	fact, err := decodeControlFact(source, "task-record")
	if err != nil {
		t.Fatal(err)
	}
	spec, _ := objectMember(fact.Value, "spec")
	spec["mode"] = "explain"
	source = encodeAdmissionTask(t, fact.Value)
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", ProjectID: "project.catalog", WorkspaceID: "workspace.catalog"}
	now := mustAgentTime(t, "2026-08-01T08:00:00.000Z")
	admission, err := repository.CreateRuntimeAdmission(ctx, user, source, now)
	if err != nil {
		t.Fatal(err)
	}
	result := admissionResultFixture(t, admission)
	if err := repository.StoreRuntimeAdmissionResult(ctx, admission.AdmissionID, result, func() time.Time { return now }); err != nil {
		t.Fatal(err)
	}
	if _, _, err := repository.CreateAdmittedTask(ctx, user, result.Task, admission.AdmissionID, result.AdmissionDigest, func() time.Time { return now }); err != nil {
		t.Fatal(err)
	}
	task, err := decodeTaskFact(result.Task)
	if err != nil {
		t.Fatal(err)
	}
	vector := readRepositoryVector(t)
	created := runtimeOutputTemplate(t, vector.RepositorySequence[0], task, nil)
	record, _, err := repository.CreateRun(ctx, user.WorkspaceID, created.Run, created.Event)
	if err != nil {
		t.Fatal(err)
	}
	current := mustRuntimeRunFact(t, created.Run)
	step := runtimeOutputTemplate(t, vector.RepositorySequence[1], task, nil)
	runBytes, eventBytes := runtimeControlStep(t, current, step, RuntimePrincipalID)
	if _, _, err := repository.BootstrapRuntimeRun(ctx, user.WorkspaceID, record.Cursor, record.SnapshotDigest, runBytes, eventBytes); err != nil {
		t.Fatal(err)
	}
	current = mustRuntimeRunFact(t, runBytes)
	clockValue := current.UpdatedAt
	clock := func() time.Time { return clockValue }
	lease, _, err := repository.RuntimeClaimRun(ctx, user.WorkspaceID, current.RunID, "lease.output", "worker.output", 1, now.Add(5*time.Minute), clock)
	if err != nil {
		t.Fatal(err)
	}
	guard := RuntimeLeaseGuard{Authority: RunLeaseAuthority{LeaseID: lease.LeaseID, HolderID: lease.HolderID, Generation: 1, ObservedAt: clockValue}, Clock: clock}
	vectorSource, err := os.ReadFile("../../platform/agentcontract/testdata/agent-task-output-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]any
	if err := json.Unmarshal(vectorSource, &wire); err != nil {
		t.Fatal(err)
	}
	output := wire["value"].(map[string]any)
	output["taskId"], output["runId"], output["modelInvocationId"], output["projectPolicyDigest"], output["effectivePolicyDigest"] = task.TaskID, current.RunID, "operation.vector.model.1", task.PolicyDigest, result.EffectivePolicy["evaluation"].(map[string]any)["effectivePolicyDigest"]
	responseDigest, _ := canonicaljson.Digest(map[string]any{"answer": output["text"]})
	receipt := map[string]any{"invocationId": output["modelInvocationId"], "taskId": task.TaskID, "runId": current.RunID, "generation": 1, "attempt": 1, "contextPackDigest": output["contextPackDigest"], "outcome": "completed", "responseDigest": responseDigest}
	receipt["receiptDigest"], _ = canonicaljson.Digest(receipt)
	for index := 2; index <= 5; index++ {
		var completion map[string]any
		if index == 5 {
			completion = receipt
		}
		step = runtimeOutputTemplate(t, vector.RepositorySequence[index], task, completion)
		runBytes, eventBytes = runtimeControlStep(t, current, step, RuntimePrincipalID)
		next := mustRuntimeRunFact(t, runBytes)
		clockValue = next.UpdatedAt
		guard.Authority.ObservedAt = clockValue
		if _, _, err := repository.AppendRuntimeTransition(ctx, user.WorkspaceID, guard, runBytes, eventBytes); err != nil {
			t.Fatalf("output fixture transition %d: %v", index, err)
		}
		current = next
	}
	output["recordedAt"] = current.UpdatedAt.Format("2006-01-02T15:04:05.000Z")
	return db, repository, task, current, guard, output
}

func TestRuntimeTaskOutputPostgreSQLLineageLeaseReplayAndUserRead(t *testing.T) {
	db, repository, task, run, guard, value := runtimeOutputFixture(t)
	ctx := context.Background()
	service := PrincipalAuthority{Kind: "service", PrincipalID: RuntimePrincipalID, ProjectID: task.ProjectID, WorkspaceID: task.WorkspaceID}
	for _, field := range []string{"effectivePolicyDigest", "contextPackDigest", "modelInvocationId", "generation", "kind", "text"} {
		changed := make(map[string]any, len(value))
		for key, item := range value {
			changed[key] = item
		}
		switch field {
		case "effectivePolicyDigest", "contextPackDigest":
			changed[field] = "sha256-" + strings.Repeat("0", 64)
		case "generation":
			changed[field] = 2
		case "kind":
			changed[field] = "plan"
		default:
			changed[field] = "different-value"
		}
		if _, err := repository.StoreRuntimeTaskOutput(ctx, service, guard, runtimeOutputWire(t, changed)); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("foreign %s output: %v", field, err)
		}
	}
	expired := guard
	expired.Clock = func() time.Time { return guard.Clock().Add(6 * time.Minute) }
	if _, err := repository.StoreRuntimeTaskOutput(ctx, service, expired, runtimeOutputWire(t, value)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired lease output: %v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM agent_task_outputs`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rejected output wrote %d rows: %v", count, err)
	}
	source := runtimeOutputWire(t, value)
	if replayed, err := repository.StoreRuntimeTaskOutput(ctx, service, guard, source); err != nil || replayed {
		t.Fatalf("publish output: replay=%v %v", replayed, err)
	}
	if replayed, err := repository.StoreRuntimeTaskOutput(ctx, service, expired, source); err != nil || !replayed {
		t.Fatalf("ACK-loss exact output replay: replay=%v %v", replayed, err)
	}
	user := PrincipalAuthority{Kind: "user", PrincipalID: task.ActorID, ProjectID: task.ProjectID, WorkspaceID: task.WorkspaceID}
	items, err := repository.ReadTaskOutputs(ctx, user, run.RunID)
	if err != nil || len(items) != 1 {
		t.Fatalf("visible durable output: %d %v", len(items), err)
	}
	if decoded, _, err := agentcontract.DecodeAgentTaskOutput(items[0]); err != nil || decoded.Text != value["text"] {
		t.Fatalf("visible answer lost content: %v", err)
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := NewHandler(repository)
	gateway := NewRuntimeGateway(repository, "PRODIVIX_TEST_OUTPUT_RUNTIME_TOKEN")
	t.Setenv("PRODIVIX_TEST_OUTPUT_RUNTIME_TOKEN", strings.Repeat("t", 32))
	heartbeatInstant := guard.Clock().Add(2 * time.Minute)
	gateway.clock = func() time.Time { return heartbeatInstant }
	if gateway.Ready() {
		t.Fatal("unobserved worker claimed readiness")
	}
	RegisterRoutes(router.Group("/api"), RouteHandlers{RequireAuth: func(c *gin.Context) { c.Set("authUser", &backendauth.User{ID: task.ActorID}); c.Next() }, ReadTaskOutputs: handler.HandleReadTaskOutputs, Runtime: gateway})
	renewBody, _ := json.Marshal(map[string]any{"leaseId": guard.Authority.LeaseID, "holderId": guard.Authority.HolderID, "generation": guard.Authority.Generation, "observedAt": heartbeatInstant, "expiresAt": heartbeatInstant.Add(4 * time.Minute)})
	renewRequest := httptest.NewRequest(http.MethodPut, "/api/internal/agent/runtime/workspaces/"+task.WorkspaceID+"/runs/"+run.RunID+"/lease", strings.NewReader(string(renewBody)))
	renewRequest.Header.Set("Authorization", "Bearer "+strings.Repeat("t", 32))
	renewRequest.Header.Set("Content-Type", "application/json")
	renewRecorder := httptest.NewRecorder()
	router.ServeHTTP(renewRecorder, renewRequest)
	if renewRecorder.Code != http.StatusOK || !gateway.Ready() {
		t.Fatalf("active long-call heartbeat lost readiness %d: %s", renewRecorder.Code, renewRecorder.Body.String())
	}
	request := httptest.NewRequest(http.MethodGet, "/api/projects/"+task.ProjectID+"/workspaces/"+task.WorkspaceID+"/agent/runs/"+run.RunID+"/task-outputs", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("user output transport %d: %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Items []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil || len(response.Items) != 1 {
		t.Fatalf("output transport wire: %v", err)
	}
	user.PrincipalID = "user.other"
	if _, err := repository.ReadTaskOutputs(ctx, user, run.RunID); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("foreign actor output read: %v", err)
	}
	value["text"] = "conflicting exact identity"
	if _, err := repository.StoreRuntimeTaskOutput(ctx, service, guard, runtimeOutputWire(t, value)); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed output replay: %v", err)
	}
}
