package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
)

func runtimeDriverPlan(t *testing.T, vector *proposalRepositoryVector) json.RawMessage {
	t.Helper()
	ack, err := decodeMutationReceipt(vector.Facts.CommitAcknowledged)
	if err != nil {
		t.Fatal(err)
	}
	w, _ := integerMember(ack.TargetRevision, "workspaceRev")
	r, _ := integerMember(ack.TargetRevision, "routeRev")
	seq, _ := integerMember(ack.TargetRevision, "opSeq")
	documents, _ := arrayMember(ack.TargetRevision, "documents")
	docRevisions := map[string]g3.DocumentRevision{}
	for _, document := range documents {
		item := document.(map[string]any)
		content, _ := integerMember(item, "contentRev")
		meta, _ := integerMember(item, "metaRev")
		docRevisions[stringMember(item, "documentId")] = g3.DocumentRevision{ContentRev: content, MetaRev: meta}
	}
	digest := runtimeTestDigest(t, map[string]any{"fixture": "driver-plan"}, "unused")
	plan := g3.VerificationPlanGrant{Status: "ready", WorkspaceID: "workspace.catalog", TargetRevision: w, TargetPartitionRevisions: g3.PartitionRevisions{WorkspaceRev: w, RouteRev: r, OpSeq: seq, DocumentRevisions: docRevisions}, ScenarioRegistryDigest: digest, PolicyRevision: 1, PolicyDigest: digest, RetentionRequest: g3.AuthoritativeRetentionRequest{Successful: g3.RetentionChange, Failed: g3.RetentionChange}, PolicyEvaluationInstant: "2026-08-01T08:30:00.000Z", ImpactDigest: digest, SemanticSchemaDigest: digest, ProviderSetDigest: digest, CompilerDigest: digest, PlannerDigest: digest, AdapterRegistryDigest: digest,
		Cells: []g3.VerificationPlanCell{{ID: "cell.runtime.test", CheckID: "check.runtime.test", CheckKind: "unit", TargetID: "target.runtime.test", TargetPolicy: g3.TargetPolicy{Authority: "verification-policy", PolicyDigest: digest, SemanticTargetID: "target.runtime.test", Capture: "allowed"}, FrameworkTarget: "react-vite", Surface: "preview", Viewport: g3.ViewportIdentity{ID: "desktop", Width: 1280, Height: 720}, ColorScheme: "light", Motion: "full", Locale: "en-US", ControlProfileRef: g3.VerificationPlanControlProfileRef{Kind: "preset", PresetID: "deterministic", Digest: digest}, Adapter: g3.VerificationPlanAdapterIdentity{AdapterID: "adapter.runtime.test", DescriptorDigest: digest, ToolchainDigest: digest, CapabilityDigest: digest}, Requirement: "required", PolicyRuleIDs: []string{}, AppliedExemptionIDs: []string{}, RetryPolicy: g3.VerificationPlanRetryPolicy{ID: "retry.runtime", MaximumAttempts: 1, RetryableOutcomes: []string{}, StabilitySamples: 1, FreshFixtureNamespace: true}, EvidenceRequirements: g3.VerificationPlanEvidenceRequirements{AcceptedTrust: []g3.TrustClass{g3.TrustLocalUnattested}, MaximumAgeMS: 600000, RequireCompatibleIdentity: true, RequiredArtifactKinds: []g3.ArtifactKind{}}, Resources: []g3.VerificationPlanResource{}, InputKinds: []string{}, ArtifactKinds: []g3.ArtifactKind{}, EstimatedCost: g3.VerificationPlanCost{DurationMS: 1, ComputeUnits: 1}, Preflight: g3.VerificationPlanPreflight{Status: "supported"}, DependencyCellIDs: []string{}, InputDigest: digest}}, Issues: []g3.VerificationPlanIssue{}, Explanations: []g3.VerificationPlanExplanation{}, Budget: g3.VerificationPlanBudgetSummary{Cells: 1, CellsByCheckKind: g3.VerificationPlanCheckKindCounts{Unit: 1}, TargetExpansions: 1, ClosureEvidenceRecords: 1, TotalMS: 1, EstimatedComputeUnits: 1, MaximumParallelism: 1, OverBudgetDimensions: []string{}}}
	plan.PlanDigest = runtimeTestDigest(t, plan, "planDigest")
	for _, fact := range []struct {
		source      *json.RawMessage
		digestField string
	}{{&vector.Facts.Planning, "planningDigest"}, {&vector.Facts.Preview, "previewDigest"}, {&vector.Facts.Approval, ""}} {
		var wire map[string]any
		if err := json.Unmarshal(*fact.source, &wire); err != nil {
			t.Fatal(err)
		}
		value := wire["value"].(map[string]any)
		value["verificationPlanDigest"] = plan.PlanDigest
		if fact.digestField != "" {
			value[fact.digestField] = runtimeTestDigest(t, value, fact.digestField)
		} else {
			preview, err := decodePreview(vector.Facts.Preview)
			if err != nil {
				t.Fatal(err)
			}
			value["previewDigest"] = preview.PreviewDigest
		}
		encoded, err := canonicaljson.Bytes(wire)
		if err != nil {
			t.Fatal(err)
		}
		*fact.source = encoded
	}
	source, err := canonicaljson.Bytes(struct {
		WireVersion int `json:"wireVersion"`
		g3.VerificationPlanGrant
	}{1, plan})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := g3.DecodeVerificationPlanWire(source); err != nil {
		t.Fatalf("public driver Plan codec: %v; schema %v", err, verificationcontract.ValidateEvidenceTransport("verification-plan", source))
	}
	return source
}

func runtimeDriverHarness(t *testing.T) (verificationPostgreSQLHarness, RuntimeDriverCoordinates, RuntimeVerificationAuthorization, json.RawMessage) {
	t.Helper()
	var plan json.RawMessage
	h := prepareVerificationPostgreSQLHarnessWithPlanning(t, func(vector *proposalRepositoryVector) {
		source, err := os.ReadFile("../../platform/agentcontract/testdata/agent-runtime-repair-vector.json")
		if err != nil {
			t.Fatal(err)
		}
		var fixture runtimeRepairVector
		if err := json.Unmarshal(source, &fixture); err != nil {
			t.Fatal(err)
		}
		vector.ControlFacts.Task, vector.ControlFacts.Sequence, vector.Facts.Approval = fixture.Task, fixture.Sequence, fixture.Approval
		plan = runtimeDriverPlan(t, vector)
	})
	wire, source, input := runtimeVerificationSnapshot(t, h, "verification.runtime.driver")
	if _, _, err := g3.NewRepository(h.databaseA).CreateVerificationRunWithAuthorization(context.Background(), "user.test", wire, source, runtimeVerificationCallback(h, input)); err != nil {
		t.Fatal(err)
	}
	coordinates := RuntimeDriverCoordinates{TaskID: h.task.TaskID, AgentRunID: input.AgentRunID, VerificationRunID: wire.RunID, PlanDigest: wire.PlanDigest, RequestDigest: runtimeTestDigest(t, map[string]any{"execution": wire.RunID}, "unused")}
	return h, coordinates, input, plan
}

func TestRuntimeDriverCanonicalContextPostgreSQLGate(t *testing.T) {
	h, coordinates, input, plan := runtimeDriverHarness(t)
	ctx := context.Background()
	result, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, plan)
	if err != nil || !result.Started || result.ProjectID != h.task.ProjectID || result.Run.RunID != coordinates.VerificationRunID {
		t.Fatalf("canonical driver context=%#v err=%v", result, err)
	}
	replayed, err := h.repositoryB.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, nil)
	if err != nil || string(replayed.Plan) != string(result.Plan) {
		t.Fatalf("durable canonical plan replay err=%v", err)
	}
	wrong := coordinates
	wrong.RequestDigest = runtimeTestDigest(t, map[string]any{"another": "request"}, "unused")
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, wrong, h.lease, input.Clock, nil); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cross request context err=%v", err)
	}
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, func() time.Time { return mustAgentTime(t, "2026-08-02T03:00:00.000Z") }, nil); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired callback context err=%v", err)
	}
	var count int
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM agent_runtime_g3_driver_jobs`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("driver contexts=%d err=%v", count, err)
	}
}

func runtimeDriverEvent(t *testing.T, runID string, cursor int64, kind string) (g3.VerificationRunEventWire, []byte) {
	t.Helper()
	event := g3.VerificationRunEvent{EventID: "event.driver." + kind, RunID: runID, Cursor: cursor, OccurredAt: mustAgentTime(t, "2026-08-01T09:00:00.000Z").Add(time.Duration(cursor) * time.Millisecond).Format("2006-01-02T15:04:05.000Z"), Kind: kind}
	if kind == "run-cancel-requested" {
		event.Reason = "The user cancelled the linked Agent task."
	}
	event.EventDigest = runtimeTestDigest(t, event, "eventDigest")
	wire := g3.VerificationRunEventWire{WireVersion: 1, VerificationRunEvent: event}
	source, err := canonicaljson.Bytes(wire)
	if err != nil {
		t.Fatal(err)
	}
	return wire, source
}

func TestRuntimeDriverCancellationRequiresG3AndResourceCleanupPostgreSQLGate(t *testing.T) {
	h, coordinates, input, plan := runtimeDriverHarness(t)
	ctx := context.Background()
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, plan); err != nil {
		t.Fatal(err)
	}
	current := mustRuntimeRunFact(t, h.proposal.ControlFacts.Sequence[5].Run)
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: h.task.WorkspaceID, ProjectID: h.task.ProjectID}
	command, _, err := h.repositoryA.StoreRunUserCommand(ctx, user, current.RunID, runtimeCancelCommand(t, current))
	if err != nil {
		t.Fatal(err)
	}
	next, cancelEvent := runtimeCancelFact(t, current)
	cancelled, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, current.Cursor, current.SnapshotDigest, next, cancelEvent)
	if err != nil {
		t.Fatal(err)
	}
	cleanSource, cleanEvent := runtimeCancellationContinuation(t, mustRuntimeRunFact(t, next), false)
	if _, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, cancelled.Cursor, cancelled.SnapshotDigest, cleanSource, cleanEvent); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("Agent falsely acknowledged queued G3 cleanup err=%v", err)
	}
	coordinates.CancellationCommandID = command.CommandID
	lookup := coordinates
	lookup.RequestDigest = runtimeTestDigest(t, map[string]any{"cancel": "request"}, "unused")
	contextResult, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, lookup, RunLeaseAuthority{}, input.Clock, nil)
	if err != nil || contextResult.RequestDigest != coordinates.RequestDigest {
		t.Fatalf("cancel durable execution lookup=%#v err=%v", contextResult, err)
	}
	authorize := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, RunLeaseAuthority{}, input.Clock, true)
	tx, err := h.databaseA.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.repositoryA.authorizeRuntimeDriverTx(ctx, tx, h.task.WorkspaceID, coordinates, RunLeaseAuthority{}, input.Clock, false); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cancel authority admits new execution err=%v", err)
	}
	_ = tx.Rollback()
	missing := coordinates
	missing.CancellationCommandID = "command.other"
	tx, _ = h.databaseA.BeginTx(ctx, nil)
	if _, err := h.repositoryA.authorizeRuntimeDriverTx(ctx, tx, h.task.WorkspaceID, missing, RunLeaseAuthority{}, input.Clock, true); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("foreign consumed command err=%v", err)
	}
	_ = tx.Rollback()
	repository := g3.NewRepository(h.databaseA)
	for index, kind := range []string{"run-cancel-requested", "run-completed"} {
		event, source := runtimeDriverEvent(t, coordinates.VerificationRunID, int64(index+1), kind)
		if _, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", h.task.WorkspaceID, coordinates.VerificationRunID, event, source, authorize); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, cancelled.Cursor, cancelled.SnapshotDigest, cleanSource, cleanEvent); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("Agent falsely acknowledged unclean actual job err=%v", err)
	}
	receipt, err := canonicaljson.Bytes(map[string]any{"contract": "prodivix.agent-runtime-g3-cleanup", "resourcesClean": true, "requestDigest": coordinates.RequestDigest})
	if err != nil {
		t.Fatal(err)
	}
	if err := h.repositoryA.recordRuntimeDriverCleanup(ctx, h.task.WorkspaceID, coordinates, RunLeaseAuthority{}, input.Clock, receipt); err != nil {
		t.Fatal(err)
	}
	if _, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, cancelled.Cursor, cancelled.SnapshotDigest, cleanSource, cleanEvent); err != nil {
		t.Fatalf("actual G3/resource cleanup did not admit canonical Agent clean: %v", err)
	}
}

func TestRuntimeDriverRunningCancellationUsesCleanupDigestPostgreSQLGate(t *testing.T) {
	h, coordinates, input, plan := runtimeDriverHarness(t)
	ctx := context.Background()
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, plan); err != nil {
		t.Fatal(err)
	}
	repository := g3.NewRepository(h.databaseA)
	active := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, h.lease, input.Clock, false)
	started, source := runtimeDriverEvent(t, coordinates.VerificationRunID, 1, "run-started")
	if _, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", h.task.WorkspaceID, coordinates.VerificationRunID, started, source, active); err != nil {
		t.Fatal(err)
	}
	cellStarted, _ := runtimeDriverEvent(t, coordinates.VerificationRunID, 2, "cell-started")
	cellStarted.CellID, cellStarted.AttemptID = "cell.runtime.test", "attempt.runtime.test"
	cellStarted.EventDigest = runtimeTestDigest(t, cellStarted.VerificationRunEvent, "eventDigest")
	source, _ = canonicaljson.Bytes(cellStarted)
	if _, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", h.task.WorkspaceID, coordinates.VerificationRunID, cellStarted, source, active); err != nil {
		t.Fatal(err)
	}
	current := mustRuntimeRunFact(t, h.proposal.ControlFacts.Sequence[5].Run)
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: h.task.WorkspaceID, ProjectID: h.task.ProjectID}
	command, _, err := h.repositoryA.StoreRunUserCommand(ctx, user, current.RunID, runtimeCancelCommand(t, current))
	if err != nil {
		t.Fatal(err)
	}
	next, event := runtimeCancelFact(t, current)
	if _, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, current.Cursor, current.SnapshotDigest, next, event); err != nil {
		t.Fatal(err)
	}
	coordinates.CancellationCommandID = command.CommandID
	cleanup := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, RunLeaseAuthority{}, input.Clock, true)
	cancelEvent, source := runtimeDriverEvent(t, coordinates.VerificationRunID, 3, "run-cancel-requested")
	if _, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", h.task.WorkspaceID, coordinates.VerificationRunID, cancelEvent, source, cleanup); err != nil {
		t.Fatal(err)
	}
	reported, _ := runtimeDriverEvent(t, coordinates.VerificationRunID, 4, "cell-reported")
	reported.CellID, reported.AttemptID, reported.Outcome = "cell.runtime.test", "attempt.runtime.test", "cancelled"
	reported.CandidateDigest = runtimeTestDigest(t, map[string]any{"contract": "prodivix.agent-runtime-g3-cancelled-attempt", "verificationRunId": coordinates.VerificationRunID, "cellId": reported.CellID, "attemptId": reported.AttemptID, "cancellationCommandId": command.CommandID, "resourcesClean": true}, "unused")
	reported.EventDigest = runtimeTestDigest(t, reported.VerificationRunEvent, "eventDigest")
	source, _ = canonicaljson.Bytes(reported)
	if _, _, err := g3.DecodeVerificationRunEventWire(source); err != nil {
		t.Fatalf("public cancellation report codec: %v", err)
	}
	if err := validateRuntimeDriverCancellationEvent(coordinates, reported.VerificationRunEvent); err != nil {
		t.Fatal(err)
	}
	wrong := reported.VerificationRunEvent
	wrong.Outcome = "passed"
	if err := validateRuntimeDriverCancellationEvent(coordinates, wrong); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cleanup authorizes passed report err=%v", err)
	}
	wrong = reported.VerificationRunEvent
	wrong.CandidateDigest = runtimeTestDigest(t, map[string]any{"foreign": "receipt"}, "unused")
	if err := validateRuntimeDriverCancellationEvent(coordinates, wrong); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("foreign cleanup digest err=%v", err)
	}
	if _, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", h.task.WorkspaceID, coordinates.VerificationRunID, reported, source, cleanup); err != nil {
		t.Fatal(err)
	}
	completed, source := runtimeDriverEvent(t, coordinates.VerificationRunID, 5, "run-completed")
	result, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", h.task.WorkspaceID, coordinates.VerificationRunID, completed, source, cleanup)
	if err != nil || result.Status != "cancelled" {
		t.Fatalf("running G3 cancelled=%#v err=%v", result, err)
	}
}

func TestRuntimeDriverNeverDispatchedCancellationPostgreSQLGate(t *testing.T) {
	h, coordinates, input, _ := runtimeDriverHarness(t)
	ctx := context.Background()
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
	coordinates.CancellationCommandID = command.CommandID
	result, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, RunLeaseAuthority{}, input.Clock, nil)
	if err != nil || result.Started || string(result.Plan) != "null" {
		t.Fatalf("never-dispatched context=%#v err=%v", result, err)
	}
	authorize := h.repositoryA.runtimeDriverAuthorization(h.task.WorkspaceID, coordinates, RunLeaseAuthority{}, input.Clock, true)
	repository := g3.NewRepository(h.databaseA)
	for index, kind := range []string{"run-cancel-requested", "run-completed"} {
		event, source := runtimeDriverEvent(t, coordinates.VerificationRunID, int64(index+1), kind)
		if _, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", h.task.WorkspaceID, coordinates.VerificationRunID, event, source, authorize); err != nil {
			t.Fatal(err)
		}
	}
	cleanSource, cleanEvent := runtimeCancellationContinuation(t, mustRuntimeRunFact(t, next), false)
	if _, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, cancelled.Cursor, cancelled.SnapshotDigest, cleanSource, cleanEvent); err != nil {
		t.Fatalf("never admitted resources prevented clean: %v", err)
	}
	var count int
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM agent_runtime_g3_driver_jobs`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("no-dispatch cancellation fabricated job=%d err=%v", count, err)
	}
}

var _ g3.WriteAuthorization = func(context.Context, *sql.Tx) error { return nil }
