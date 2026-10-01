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

func admissionTaskFixture(t *testing.T, database *sql.DB) []byte {
	t.Helper()
	seedAgentWorkspace(t, database)
	source, err := os.ReadFile("../../platform/agentcontract/testdata/agent-policy-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector struct {
		Wire map[string]any `json:"wire"`
	}
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	vector.Wire["id"] = "policy.agent"
	policy, err := canonicaljson.Bytes(vector.Wire)
	if err != nil {
		t.Fatal(err)
	}
	policyDigest, err := agentcontract.CanonicalCurrentDigest("policy.agent", policy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO workspace_documents(workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES('workspace.catalog','policy.agent','agent-policy','Agent policy','/agent.policy.json',2,1,$1::jsonb,'[]'::jsonb,NOW())`, string(policy)); err != nil {
		t.Fatal(err)
	}
	fact, err := decodeControlFact(readRepositoryVector(t).Facts.Task, "task-record")
	if err != nil {
		t.Fatal(err)
	}
	spec, _ := objectMember(fact.Value, "spec")
	spec["policyDigest"] = policyDigest
	return encodeAdmissionTask(t, fact.Value)
}

func encodeAdmissionTask(t *testing.T, value map[string]any) []byte {
	t.Helper()
	delete(value, "taskDigest")
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value["taskDigest"] = digest
	source, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "task-record", "value": value})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeTaskFact(source); err != nil {
		t.Fatal(err)
	}
	return source
}

func admissionResultFixture(t *testing.T, value runtimeAdmission) runtimeAdmissionResult {
	t.Helper()
	fact, err := decodeControlFact(value.Task, "task-record")
	if err != nil {
		t.Fatal(err)
	}
	spec, _ := objectMember(fact.Value, "spec")
	grantID := "grant.runtime." + value.ChallengeDigest[7:]
	spec["initialGrantRef"] = map[string]any{"grantId": grantID}
	source := encodeAdmissionTask(t, fact.Value)
	task, err := decodeTaskFact(source)
	if err != nil {
		t.Fatal(err)
	}
	effectiveDigest := "sha256-" + strings.Repeat("a", 64)
	grant := map[string]any{"grantId": grantID, "taskId": task.TaskID, "workspaceId": task.WorkspaceID, "subject": task.Spec["actor"], "baseRevision": task.Spec["baseRevision"], "targetScope": task.Spec["targetScope"], "policyRef": task.Spec["policyRef"], "policyDigest": task.PolicyDigest, "issuedAt": value.ObservedAt.Format("2006-01-02T15:04:05.000Z"), "expiresAt": value.ExpiresAt.Format("2006-01-02T15:04:05.000Z")}
	result := runtimeAdmissionResult{ChallengeDigest: value.ChallengeDigest, Task: source, Status: "admitted", DiagnosticCodes: []string{}, Grant: grant, EffectivePolicy: map[string]any{"evaluation": map[string]any{"projectPolicyDigest": task.PolicyDigest, "projectPolicyRef": task.Spec["policyRef"], "actorAuthorizationDigest": value.ActorAuthorizationDigest, "effectivePolicyDigest": effectiveDigest}}}
	refreshAdmissionResultDigest(t, value, &result)
	return result
}

func refreshAdmissionResultDigest(t *testing.T, value runtimeAdmission, result *runtimeAdmissionResult) {
	t.Helper()
	task, err := decodeTaskFact(result.Task)
	if err != nil {
		t.Fatal(err)
	}
	grantDigest, err := canonicaljson.Digest(result.Grant)
	if err != nil {
		t.Fatal(err)
	}
	evaluation, ok := result.EffectivePolicy["evaluation"].(map[string]any)
	if !ok {
		t.Fatal("admission fixture lacks its effective policy")
	}
	result.AdmissionDigest, err = canonicaljson.Digest(map[string]any{"admissionId": value.AdmissionID, "challengeDigest": value.ChallengeDigest, "taskDigest": task.TaskDigest, "effectivePolicyDigest": evaluation["effectivePolicyDigest"], "grantDigest": grantDigest, "status": result.Status, "diagnosticCodes": result.DiagnosticCodes})
	if err != nil {
		t.Fatal(err)
	}
}

func TestRuntimeAdmissionPostgreSQLAuthorityAndExactReplay(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	source := admissionTaskFixture(t, databaseA)
	repository := NewRepository(databaseA)
	replica := NewRepository(databaseB)
	ctx := context.Background()
	authority := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", ProjectID: "project.catalog", WorkspaceID: "workspace.catalog"}
	now := mustAgentTime(t, "2026-10-01T02:00:00.000Z")
	clock := func() time.Time { return now }
	if _, err := repository.CreateRuntimeAdmission(ctx, PrincipalAuthority{Kind: "user", PrincipalID: "user.other", ProjectID: authority.ProjectID, WorkspaceID: authority.WorkspaceID}, source, now); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("other actor admission: %v", err)
	}
	value, err := repository.CreateRuntimeAdmission(ctx, authority, source, now)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := replica.CreateRuntimeAdmission(ctx, authority, source, now.Add(time.Second))
	if err != nil || replay.ChallengeDigest != value.ChallengeDigest || replay.AdmissionID != value.AdmissionID {
		t.Fatalf("challenge exact replay: %#v %v", replay, err)
	}
	result := admissionResultFixture(t, value)
	forged := result
	forged.EffectivePolicy = map[string]any{"evaluation": map[string]any{"actorAuthorizationDigest": "sha256-" + strings.Repeat("b", 64)}}
	if err := repository.StoreRuntimeAdmissionResult(ctx, value.AdmissionID, forged, clock); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("forged actor policy: %v", err)
	}
	if _, _, err := repository.CreateAdmittedTask(ctx, authority, result.Task, value.AdmissionID, result.AdmissionDigest, clock); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("pending admission cannot create: %v", err)
	}
	if err := repository.StoreRuntimeAdmissionResult(ctx, value.AdmissionID, result, clock); err != nil {
		t.Fatal(err)
	}
	if err := replica.StoreRuntimeAdmissionResult(ctx, value.AdmissionID, result, func() time.Time { return now.Add(10 * time.Minute) }); err != nil {
		t.Fatalf("settled admission replay after expiry: %v", err)
	}
	if _, _, err := repository.CreateAdmittedTask(ctx, authority, result.Task, value.AdmissionID, "sha256-"+strings.Repeat("c", 64), clock); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("forged admission digest: %v", err)
	}
	task, replayed, err := repository.CreateAdmittedTask(ctx, authority, result.Task, value.AdmissionID, result.AdmissionDigest, clock)
	if err != nil || replayed {
		t.Fatalf("admitted create: %#v %v %v", task, replayed, err)
	}
	if _, err := databaseA.Exec(`UPDATE workspaces SET workspace_rev=workspace_rev+1 WHERE id=$1`, authority.WorkspaceID); err != nil {
		t.Fatal(err)
	}
	if _, replayed, err := replica.CreateAdmittedTask(ctx, authority, result.Task, value.AdmissionID, result.AdmissionDigest, func() time.Time { return now.Add(10 * time.Minute) }); err != nil || !replayed {
		t.Fatalf("Task ACK loss exact replay after revision/TTL drift: %v %v", replayed, err)
	}
	stored, err := repository.RuntimeTaskAdmission(ctx, authority.WorkspaceID, task.TaskID)
	if err != nil || stored["admissionDigest"] != result.AdmissionDigest {
		t.Fatalf("runtime admission context: %v %v", stored, err)
	}
}

func TestRuntimeAdmissionPostgreSQLExpiryAndRevisionDriftRejectNewTask(t *testing.T) {
	for _, scenario := range []string{"expired-result", "expired-task", "revision-drift", "expired-grant-result", "expired-grant-task", "expired-result-after-preflight", "expired-task-after-preflight"} {
		t.Run(scenario, func(t *testing.T) {
			database, _ := openAgentPostgreSQL(t)
			source := admissionTaskFixture(t, database)
			repository := NewRepository(database)
			ctx := context.Background()
			authority := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", ProjectID: "project.catalog", WorkspaceID: "workspace.catalog"}
			now := mustAgentTime(t, "2026-10-01T02:00:00.000Z")
			value, err := repository.CreateRuntimeAdmission(ctx, authority, source, now)
			if err != nil {
				t.Fatal(err)
			}
			result := admissionResultFixture(t, value)
			grantExpiry := now.Add(time.Minute)
			if strings.HasPrefix(scenario, "expired-grant-") {
				result.Grant["expiresAt"] = grantExpiry.Format("2006-01-02T15:04:05.000Z")
				refreshAdmissionResultDigest(t, value, &result)
			}
			if scenario == "expired-result" || scenario == "expired-grant-result" || scenario == "expired-result-after-preflight" {
				reads := 0
				clock := func() time.Time {
					reads++
					if scenario == "expired-grant-result" {
						return grantExpiry
					}
					if scenario == "expired-result-after-preflight" && reads == 1 {
						return now
					}
					return value.ExpiresAt
				}
				if err := repository.StoreRuntimeAdmissionResult(ctx, value.AdmissionID, result, clock); !errors.Is(err, ErrUnauthorized) {
					t.Fatalf("expired result: %v", err)
				}
			} else {
				if err := repository.StoreRuntimeAdmissionResult(ctx, value.AdmissionID, result, func() time.Time { return now }); err != nil {
					t.Fatal(err)
				}
				clock := func() time.Time { return now }
				expected := ErrUnauthorized
				if scenario == "expired-task" {
					clock = func() time.Time { return value.ExpiresAt }
				} else if scenario == "expired-grant-task" {
					clock = func() time.Time { return grantExpiry }
				} else if scenario == "expired-task-after-preflight" {
					reads := 0
					clock = func() time.Time {
						reads++
						if reads == 1 {
							return now
						}
						return value.ExpiresAt
					}
				} else {
					if _, err := database.Exec(`UPDATE workspace_documents SET content_rev=content_rev+1 WHERE workspace_id=$1 AND id='page.catalog'`, authority.WorkspaceID); err != nil {
						t.Fatal(err)
					}
					expected = ErrConflict
				}
				if _, _, err := repository.CreateAdmittedTask(ctx, authority, result.Task, value.AdmissionID, result.AdmissionDigest, clock); !errors.Is(err, expected) {
					t.Fatalf("new Task %s: %v", scenario, err)
				}
			}
			var count int
			if err := database.QueryRow(`SELECT count(*) FROM agent_tasks`).Scan(&count); err != nil || count != 0 {
				t.Fatalf("rejected admission wrote %d Tasks: %v", count, err)
			}
		})
	}
}

func TestRuntimeTransportRejectsBrowserAndRawTaskWithoutServiceAdmission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	gateway := NewRuntimeGateway(NewRepository(nil), "PRODIVIX_TEST_RUNTIME_TOKEN")
	t.Setenv("PRODIVIX_TEST_RUNTIME_TOKEN", strings.Repeat("t", 32))
	router := gin.New()
	gateway.RegisterRoutes(router.Group("/api"))
	for _, authorization := range []string{"", "Bearer browser-cookie", "Basic " + strings.Repeat("t", 32)} {
		request := httptest.NewRequest(http.MethodGet, "/api/internal/agent/runtime/tasks", nil)
		request.Header.Set("Authorization", authorization)
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("service auth status %d", recorder.Code)
		}
	}
	gateway.lastPoll.Store(gateway.clock().UnixMilli())
	fake := &fakeProductRepository{}
	handler := NewHandler(fake)
	handler.SetRuntimeGateway(gateway)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Set("authUser", &backendauth.User{ID: "user.test"})
	c.Params = gin.Params{{Key: "id", Value: "project.catalog"}, {Key: "workspaceId", Value: "workspace.catalog"}}
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(readRepositoryVector(t).Facts.Task)))
	handler.HandleCreateTask(c)
	if recorder.Code != http.StatusBadRequest || fake.createCalls != 0 {
		t.Fatalf("raw production Task status=%d writes=%d", recorder.Code, fake.createCalls)
	}
}
