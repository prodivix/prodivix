package agent

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

func TestRuntimeDriverCompletedCleanupCancellationAndLostACKPostgreSQLGate(t *testing.T) {
	h, coordinates, input, plan := runtimeDriverHarness(t)
	ctx := context.Background()
	driver, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, plan)
	if err != nil {
		t.Fatal(err)
	}
	authorize := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, h.lease, input.Clock, false)
	verification := g3.NewRepository(h.databaseA)
	for index, kind := range []string{"run-started", "cell-started", "cell-reported", "run-completed"} {
		event, _ := runtimeDriverEvent(t, coordinates.VerificationRunID, int64(index+1), kind)
		if kind == "cell-started" || kind == "cell-reported" {
			event.CellID, event.AttemptID = "cell.runtime.test", "attempt.runtime.test"
		}
		if kind == "cell-reported" {
			event.Outcome = "failed"
			event.CandidateDigest = runtimeTestDigest(t, map[string]any{"actual": "failed-attempt"}, "unused")
		}
		event.EventDigest = runtimeTestDigest(t, event.VerificationRunEvent, "eventDigest")
		source, _ := canonicaljson.Bytes(event)
		if _, _, err := verification.AppendVerificationRunEventWithAuthorization(ctx, "user.test", h.task.WorkspaceID, coordinates.VerificationRunID, event, source, authorize); err != nil {
			t.Fatal(err)
		}
	}
	completed := input.Clock()
	fact := map[string]any{"contract": "prodivix.agent-runtime-g3-cleanup", "workspaceId": h.task.WorkspaceID, "taskId": coordinates.TaskID, "agentRunId": coordinates.AgentRunID, "verificationRunId": coordinates.VerificationRunID, "planDigest": coordinates.PlanDigest, "requestDigest": coordinates.RequestDigest, "providerId": driver.Run.ProviderID, "resourcesClean": true, "completedAt": completed.UTC().Format("2006-01-02T15:04:05.000Z")}
	receipt, _ := canonicaljson.Bytes(fact)
	if err := h.repositoryA.recordRuntimeDriverCleanup(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, receipt); err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	gateway := NewRuntimeGateway(h.repositoryA, "PRODIVIX_TEST_CLEANUP_RUNTIME_TOKEN")
	gateway.clock = input.Clock
	// The replay path only reads the immutable completed fact. First writes above
	// use the real durable G3 and Agent repository authorities.
	gateway.verification = &g3.Service{}
	t.Setenv("PRODIVIX_TEST_CLEANUP_RUNTIME_TOKEN", strings.Repeat("c", 32))
	router := gin.New()
	gateway.RegisterRoutes(router.Group("/api"))
	request := func(commandID, provider string, completedAt time.Time) *httptest.ResponseRecorder {
		body := map[string]any{}
		for key, value := range fact {
			if key != "workspaceId" {
				body[key] = value
			}
		}
		body["authority"] = runtimeAuthorityRequest{LeaseID: h.lease.LeaseID, HolderID: h.lease.HolderID, Generation: h.lease.Generation, ObservedAt: gateway.clock()}
		body["completedAt"], body["providerId"] = completedAt, provider
		if commandID != "" {
			body["cancellationCommandId"] = commandID
		}
		source, _ := canonicaljson.Bytes(body)
		request := httptest.NewRequest(http.MethodPost, "/api/internal/agent/runtime/workspaces/"+h.task.WorkspaceID+"/runs/"+coordinates.AgentRunID+"/g3-driver/cleanup", bytes.NewReader(source))
		request.Header.Set("Authorization", "Bearer "+strings.Repeat("c", 32))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	assertStatus := func(response *httptest.ResponseRecorder, status int) {
		t.Helper()
		if response.Code != status {
			t.Fatalf("cleanup transport status=%d expected=%d: %s", response.Code, status, response.Body.String())
		}
	}
	assertStatus(request("", driver.Run.ProviderID, completed), http.StatusOK)
	if _, err := h.databaseA.Exec(`UPDATE agent_runs SET lease_expires_at=$1 WHERE workspace_id=$2 AND run_id=$3`, completed, h.task.WorkspaceID, coordinates.AgentRunID); err != nil {
		t.Fatal(err)
	}
	assertStatus(request("", driver.Run.ProviderID, completed), http.StatusOK)
	assertStatus(request("command.unconsumed", driver.Run.ProviderID, completed), http.StatusForbidden)
	current := mustRuntimeRunFact(t, h.proposal.ControlFacts.Sequence[5].Run)
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: h.task.WorkspaceID, ProjectID: h.task.ProjectID}
	command, _, err := h.repositoryA.StoreRunUserCommand(ctx, user, current.RunID, runtimeCancelCommand(t, current))
	if err != nil {
		t.Fatal(err)
	}
	next, event := runtimeCancelFact(t, current)
	cancelled, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, current.Cursor, current.SnapshotDigest, next, event)
	if err != nil {
		t.Fatal(err)
	}
	assertStatus(request(command.CommandID, driver.Run.ProviderID, completed), http.StatusOK)
	assertStatus(request(command.CommandID, driver.Run.ProviderID, completed), http.StatusOK)
	assertStatus(request("command.foreign", driver.Run.ProviderID, completed), http.StatusForbidden)
	assertStatus(request(command.CommandID, "provider.foreign", completed), http.StatusConflict)
	assertStatus(request(command.CommandID, driver.Run.ProviderID, completed.Add(time.Millisecond)), http.StatusConflict)
	cleanSource, cleanEvent := runtimeCancellationContinuation(t, mustRuntimeRunFact(t, next), false)
	clean, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, cancelled.Cursor, cancelled.SnapshotDigest, cleanSource, cleanEvent)
	if err != nil {
		t.Fatal(err)
	}
	terminalSource, terminalEvent := runtimeCancellationContinuation(t, mustRuntimeRunFact(t, cleanSource), true)
	if _, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, clean.Cursor, clean.SnapshotDigest, terminalSource, terminalEvent); err != nil {
		t.Fatal(err)
	}
	gateway.clock = func() time.Time { return completed.Add(48 * time.Hour) }
	assertStatus(request(command.CommandID, driver.Run.ProviderID, completed), http.StatusOK)
	var stored []byte
	if err := h.databaseA.QueryRow(`SELECT cleanup_receipt_bytes FROM agent_runtime_g3_driver_jobs WHERE workspace_id=$1 AND verification_run_id=$2`, h.task.WorkspaceID, coordinates.VerificationRunID).Scan(&stored); err != nil || !bytes.Equal(stored, receipt) {
		t.Fatalf("cleanup ACK recovery changed immutable fact: %v", err)
	}
	if _, err := h.databaseA.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES('user.foreign','foreign@example.test','Foreign owner',$1,$2)`, []byte("integration-only"), completed); err != nil {
		t.Fatal(err)
	}
	if _, err := h.databaseA.Exec(`UPDATE workspaces SET owner_id='user.foreign' WHERE id=$1`, h.task.WorkspaceID); err != nil {
		t.Fatal(err)
	}
	assertStatus(request(command.CommandID, driver.Run.ProviderID, completed), http.StatusForbidden)
}
