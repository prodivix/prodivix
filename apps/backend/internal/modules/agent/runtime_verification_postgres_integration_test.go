package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func runtimeTestDigest(t *testing.T, value any, omit string) string {
	t.Helper()
	source, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var object map[string]any
	if err := json.Unmarshal(source, &object); err != nil {
		t.Fatal(err)
	}
	delete(object, omit)
	digest, err := canonicaljson.Digest(object)
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func runtimeVerificationSnapshot(t *testing.T, h verificationPostgreSQLHarness, runID string) (g3.VerificationRunSnapshotWire, []byte, RuntimeVerificationAuthorization) {
	t.Helper()
	planning, err := decodePlanning(h.proposal.Facts.Planning)
	if err != nil {
		t.Fatal(err)
	}
	ack, err := decodeMutationReceipt(h.proposal.Facts.CommitAcknowledged)
	if err != nil {
		t.Fatal(err)
	}
	revision, ok := integerMember(ack.TargetRevision, "workspaceRev")
	if !ok {
		t.Fatal("missing ACK target revision")
	}
	snapshot := g3.VerificationRunSnapshot{RunID: runID, WorkspaceID: h.task.WorkspaceID, WorkspaceRevision: revision, PlanDigest: planning.VerificationPlanDigest,
		Surface: "preview", Scope: "required", ProviderID: "provider.runtime.test", Origin: "cli", Status: "queued", Cursor: 0,
		CreatedAt: "2026-08-01T09:00:00.000Z", UpdatedAt: "2026-08-01T09:00:00.000Z", SelectedCellIDs: []string{"cell.runtime.test"},
		Cells: []g3.VerificationRunCellState{{CellID: "cell.runtime.test", AttemptID: "attempt.runtime.test", Status: "queued", LastEventCursor: 0}}}
	snapshot.SnapshotDigest = runtimeTestDigest(t, snapshot, "snapshotDigest")
	wire := g3.VerificationRunSnapshotWire{WireVersion: 1, VerificationRunSnapshot: snapshot}
	source, err := json.Marshal(wire)
	if err != nil {
		t.Fatal(err)
	}
	wire, canonical, err := g3.DecodeVerificationRunSnapshotWire(source)
	if err != nil {
		t.Fatal(err)
	}
	input := RuntimeVerificationAuthorization{AgentRunID: ack.RunID, Lease: h.lease, Clock: func() time.Time { return mustAgentTime(t, "2026-08-01T09:00:00.000Z") }, VerificationRunID: runID, WorkspaceRevision: revision, PlanDigest: wire.PlanDigest, Surface: wire.Surface, Kind: "create"}
	return wire, canonical, input
}

func runtimeVerificationStarted(t *testing.T, runID string) (g3.VerificationRunEventWire, []byte) {
	t.Helper()
	event := g3.VerificationRunEvent{EventID: "event.runtime.started." + runID, RunID: runID, Cursor: 1, OccurredAt: "2026-08-01T09:00:00.001Z", Kind: "run-started"}
	event.EventDigest = runtimeTestDigest(t, event, "eventDigest")
	wire := g3.VerificationRunEventWire{WireVersion: 1, VerificationRunEvent: event}
	source, err := canonicaljson.Bytes(wire)
	if err != nil {
		t.Fatal(err)
	}
	return wire, source
}

func runtimeVerificationCallback(h verificationPostgreSQLHarness, input RuntimeVerificationAuthorization) func(context.Context, *sql.Tx) error {
	return func(ctx context.Context, tx *sql.Tx) error {
		return h.repositoryA.AuthorizeRuntimeVerification(ctx, tx, h.task.WorkspaceID, input)
	}
}

func TestRuntimeVerificationLinkAndReplayPostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	ctx := context.Background()
	repository := g3.NewRepository(h.databaseA)
	wire, source, input := runtimeVerificationSnapshot(t, h, "verification.runtime.link")
	if _, replayed, err := repository.CreateVerificationRunWithAuthorization(ctx, "user.test", wire, source, runtimeVerificationCallback(h, input)); err != nil || replayed {
		t.Fatalf("create linked G3 run replay=%v err=%v", replayed, err)
	}
	if _, replayed, err := g3.NewRepository(h.databaseB).CreateVerificationRunWithAuthorization(ctx, "user.test", wire, source, runtimeVerificationCallback(h, input)); err != nil || !replayed {
		t.Fatalf("replay linked G3 create replay=%v err=%v", replayed, err)
	}
	var agentRun, receipt, plan string
	var revision, generation int64
	if err := h.databaseA.QueryRow(`SELECT agent_run_id, agent_generation, mutation_receipt_id, workspace_revision, plan_digest FROM agent_runtime_verification_runs WHERE verification_run_id=$1`, wire.RunID).Scan(&agentRun, &generation, &receipt, &revision, &plan); err != nil {
		t.Fatal(err)
	}
	ack, _ := decodeMutationReceipt(h.proposal.Facts.CommitAcknowledged)
	if agentRun != input.AgentRunID || generation != input.Lease.Generation || receipt != ack.ReceiptID || revision != wire.WorkspaceRevision || plan != wire.PlanDigest {
		t.Fatal("durable link does not preserve approved Agent/ACK/revision/plan authority")
	}
	input.Kind = "append"
	event, eventSource := runtimeVerificationStarted(t, wire.RunID)
	if next, replayed, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", wire.WorkspaceID, wire.RunID, event, eventSource, runtimeVerificationCallback(h, input)); err != nil || replayed || next.Cursor != 1 || next.Status != "running" {
		t.Fatalf("append linked G3 run=%#v replay=%v err=%v", next, replayed, err)
	}
	if _, replayed, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", wire.WorkspaceID, wire.RunID, event, eventSource, runtimeVerificationCallback(h, input)); err != nil || !replayed {
		t.Fatalf("replay linked event replay=%v err=%v", replayed, err)
	}
}

func TestRuntimeVerificationExpiredLeaseWritesNoRowsPostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	wire, source, input := runtimeVerificationSnapshot(t, h, "verification.runtime.expired")
	input.Clock = func() time.Time { return mustAgentTime(t, "2026-08-02T03:00:00.000Z") }
	if _, _, err := g3.NewRepository(h.databaseA).CreateVerificationRunWithAuthorization(context.Background(), "user.test", wire, source, runtimeVerificationCallback(h, input)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired create err=%v", err)
	}
	for _, table := range []string{"verification_runs", "agent_runtime_verification_runs"} {
		var count int
		if err := h.databaseA.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("expired create %s count=%d err=%v", table, count, err)
		}
	}
}

func TestRuntimeVerificationExpiryBeforeEventInsertRollsBackPostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	wire, source, input := runtimeVerificationSnapshot(t, h, "verification.runtime.effect-clock")
	repository := g3.NewRepository(h.databaseA)
	ctx := context.Background()
	if _, _, err := repository.CreateVerificationRunWithAuthorization(ctx, "user.test", wire, source, runtimeVerificationCallback(h, input)); err != nil {
		t.Fatal(err)
	}
	input.Kind = "append"
	calls := 0
	input.Clock = func() time.Time {
		calls++
		if calls < 3 {
			return mustAgentTime(t, "2026-08-01T09:00:00.000Z")
		}
		return mustAgentTime(t, "2026-08-02T03:00:00.000Z")
	}
	event, eventSource := runtimeVerificationStarted(t, wire.RunID)
	if _, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", wire.WorkspaceID, wire.RunID, event, eventSource, runtimeVerificationCallback(h, input)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("lease expired before G3 effect err=%v", err)
	}
	var cursor, events int
	if err := h.databaseA.QueryRow(`SELECT cursor FROM verification_runs WHERE id=$1`, wire.RunID).Scan(&cursor); err != nil || cursor != 0 {
		t.Fatalf("expired effect cursor=%d err=%v", cursor, err)
	}
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM verification_run_events`).Scan(&events); err != nil || events != 0 {
		t.Fatalf("expired effect events=%d err=%v", events, err)
	}
}

func TestRuntimeVerificationForeignRunCannotAppendPostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	wire, source, input := runtimeVerificationSnapshot(t, h, "verification.runtime.foreign")
	repository := g3.NewRepository(h.databaseA)
	// A same-workspace G3 run created through its ordinary owner is legitimate,
	// but lacks the durable Agent A link and must not become A's write target.
	if _, _, err := repository.CreateVerificationRun(context.Background(), "user.test", wire, source); err != nil {
		t.Fatal(err)
	}
	input.Kind = "append"
	event, eventSource := runtimeVerificationStarted(t, wire.RunID)
	if _, _, err := repository.AppendVerificationRunEventWithAuthorization(context.Background(), "user.test", wire.WorkspaceID, wire.RunID, event, eventSource, runtimeVerificationCallback(h, input)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("foreign run append err=%v", err)
	}
	var cursor, count int64
	if err := h.databaseA.QueryRow(`SELECT cursor FROM verification_runs WHERE id=$1`, wire.RunID).Scan(&cursor); err != nil || cursor != 0 {
		t.Fatalf("foreign cursor=%d err=%v", cursor, err)
	}
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM verification_run_events`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("foreign events=%d err=%v", count, err)
	}
}

func TestRuntimeVerificationCallerPlanCannotAuthorizeItsOwnDigestPostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	wire, source, input := runtimeVerificationSnapshot(t, h, "verification.runtime.wrong-plan")
	input.PlanDigest = runtimeTestDigest(t, map[string]any{"unapproved": true}, "unused")
	if _, _, err := g3.NewRepository(h.databaseA).CreateVerificationRunWithAuthorization(context.Background(), "user.test", wire, source, runtimeVerificationCallback(h, input)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("caller plan create err=%v", err)
	}
}

func TestRuntimeVerificationCancellationRacePostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	wire, source, input := runtimeVerificationSnapshot(t, h, "verification.runtime.cancel-race")
	repository := g3.NewRepository(h.databaseA)
	ctx := context.Background()
	if _, _, err := repository.CreateVerificationRunWithAuthorization(ctx, "user.test", wire, source, runtimeVerificationCallback(h, input)); err != nil {
		t.Fatal(err)
	}
	input.Kind = "append"
	event, eventSource := runtimeVerificationStarted(t, wire.RunID)
	entered, release := make(chan struct{}), make(chan struct{})
	result := make(chan error, 1)
	var barrier sync.Once
	go func() {
		_, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", wire.WorkspaceID, wire.RunID, event, eventSource, func(ctx context.Context, tx *sql.Tx) error {
			barrier.Do(func() { close(entered); <-release })
			return h.repositoryA.AuthorizeRuntimeVerification(ctx, tx, h.task.WorkspaceID, input)
		})
		result <- err
	}()
	select {
	case <-entered:
	case <-time.After(10 * time.Second):
		t.Fatal("G3 write did not reach authority barrier")
	}
	current, err := decodeRunFact(h.proposal.ControlFacts.Sequence[5].Run)
	if err != nil {
		t.Fatal(err)
	}
	nextSource, cancelSource := runtimeCancelFact(t, current)
	authority := h.lease
	authority.ObservedAt = mustAgentTime(t, "2026-08-01T09:00:00.002Z")
	_, _, cancelErr := h.repositoryB.AppendTransition(ctx, h.task.WorkspaceID, authority, nextSource, cancelSource)
	close(release)
	if cancelErr != nil {
		t.Fatal(cancelErr)
	}
	select {
	case err := <-result:
		if err == nil {
			t.Fatal("G3 write survived committed cancellation fence")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("G3 cancellation race did not finish")
	}
	var cursor, count int64
	if err := h.databaseA.QueryRow(`SELECT cursor FROM verification_runs WHERE id=$1`, wire.RunID).Scan(&cursor); err != nil || cursor != 0 {
		t.Fatalf("cancelled G3 cursor=%d err=%v", cursor, err)
	}
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM verification_run_events`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("cancelled G3 events=%d err=%v", count, err)
	}
}

func runtimeCancelFact(t *testing.T, current runFact) ([]byte, []byte) {
	t.Helper()
	template, err := decodeEventFact(readRepositoryVector(t).CancellationSequence[4].Event)
	if err != nil {
		t.Fatal(err)
	}
	event := template.Value
	event["producer"] = map[string]any{"kind": "service", "principalId": RuntimePrincipalID}
	event["taskId"], event["runId"] = current.TaskID, current.RunID
	event["sequence"], event["generation"] = current.Cursor+1, current.Generation+1
	event["previousEventDigest"], event["policyDigest"] = current.LatestEventDigest, current.PolicyDigest
	run, _ := objectMember(current.Value, "run")
	event["grantRef"] = run["grantRef"]
	event["occurredAt"] = "2026-08-01T09:00:00.002Z"
	event["eventDigest"] = runtimeTestDigest(t, event, "eventDigest")
	eventSource, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "run-event", "value": event})
	if err != nil {
		t.Fatal(err)
	}
	value := current.Value
	value["cursor"] = current.Cursor + 1
	run["generation"], run["phase"], run["latestEventDigest"] = current.Generation+1, "cancelling", event["eventDigest"]
	value["callbackAuthority"], value["cleanupState"] = "revoked", "pending"
	run["updatedAt"] = event["occurredAt"]
	processed, _ := arrayMember(value, "processedEvents")
	value["processedEvents"] = append(processed, map[string]any{"eventId": event["eventId"], "idempotencyKey": event["idempotencyKey"], "type": event["type"], "requestDigest": event["requestDigest"], "eventDigest": event["eventDigest"]})
	value["snapshotDigest"] = runtimeTestDigest(t, value, "snapshotDigest")
	nextSource, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "run-snapshot", "value": value})
	if err != nil {
		t.Fatal(err)
	}
	return nextSource, eventSource
}

func runtimeCancelCommand(t *testing.T, current runFact) []byte {
	t.Helper()
	value := map[string]any{"commandId": "command.runtime.cancel", "taskId": current.TaskID, "runId": current.RunID, "kind": "cancel", "actor": map[string]any{"kind": "user", "principalId": "user.test"}, "expectedGeneration": current.Generation, "expectedSnapshotDigest": current.SnapshotDigest, "idempotencyKey": "idempotency.runtime.cancel", "requestedAt": "2026-08-01T09:00:00.001Z"}
	value["commandDigest"] = runtimeTestDigest(t, value, "commandDigest")
	source, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "run-user-command", "value": value})
	if err != nil {
		t.Fatal(err)
	}
	return source
}

func TestRuntimeVerificationPendingCancelImmediatelyFencesPostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	wire, source, input := runtimeVerificationSnapshot(t, h, "verification.runtime.pending-cancel")
	repository := g3.NewRepository(h.databaseA)
	ctx := context.Background()
	if _, _, err := repository.CreateVerificationRunWithAuthorization(ctx, "user.test", wire, source, runtimeVerificationCallback(h, input)); err != nil {
		t.Fatal(err)
	}
	current := mustRuntimeRunFact(t, h.proposal.ControlFacts.Sequence[5].Run)
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: h.task.WorkspaceID, ProjectID: h.task.ProjectID}
	if _, _, err := h.repositoryB.StoreRunUserCommand(ctx, user, input.AgentRunID, runtimeCancelCommand(t, current)); err != nil {
		t.Fatal(err)
	}
	input.Kind = "append"
	event, eventSource := runtimeVerificationStarted(t, wire.RunID)
	if _, _, err := repository.AppendVerificationRunEventWithAuthorization(ctx, "user.test", wire.WorkspaceID, wire.RunID, event, eventSource, runtimeVerificationCallback(h, input)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("pending cancellation append err=%v", err)
	}
	var cursor int
	if err := h.databaseA.QueryRow(`SELECT cursor FROM verification_runs WHERE id=$1`, wire.RunID).Scan(&cursor); err != nil || cursor != 0 {
		t.Fatalf("pending cancel cursor=%d err=%v", cursor, err)
	}
}

func TestRuntimeVerificationBindingAndClosureLeaseGuardsPostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	ctx := context.Background()
	seedVerificationRunAndEvidence(t, h.databaseA, h.verification.Facts.Binding, h.verification.Facts.SatisfiedClosure)
	expired := RuntimeLeaseGuard{Authority: h.lease, Clock: func() time.Time { return mustAgentTime(t, "2026-08-02T03:00:00.000Z") }}
	active := RuntimeLeaseGuard{Authority: h.lease, Clock: func() time.Time { return mustAgentTime(t, "2026-08-02T02:00:00.000Z") }}
	if _, _, err := h.repositoryA.StoreRuntimeVerificationPlanBinding(ctx, h.service, expired, h.verification.Facts.Binding); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired binding err=%v", err)
	}
	if _, _, err := h.repositoryA.StoreRuntimeVerificationPlanBinding(ctx, h.service, active, h.verification.Facts.Binding); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unlinked binding err=%v", err)
	}
	binding, err := decodeVerificationPlanBinding(h.verification.Facts.Binding)
	if err != nil {
		t.Fatal(err)
	}
	// These existing ledger fixtures project completed G3 metadata. Explicitly
	// attach the current approved Agent lineage for Runtime guard coverage.
	if _, err := h.databaseA.Exec(`UPDATE verification_runs SET actor_id='user.test'`); err != nil {
		t.Fatal(err)
	}
	for _, ref := range binding.VerificationRuns {
		tx, err := h.databaseA.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		revision, _ := integerMember(binding.TargetRevision, "workspaceRev")
		err = h.repositoryA.AuthorizeRuntimeVerification(ctx, tx, h.task.WorkspaceID, RuntimeVerificationAuthorization{AgentRunID: binding.RunID, Lease: h.lease, Clock: active.Clock, VerificationRunID: ref.VerificationRunID, WorkspaceRevision: revision, PlanDigest: binding.ActualPlanDigest, Surface: ref.Surface, Kind: "create"})
		if err != nil {
			_ = tx.Rollback()
			t.Fatal(err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := h.repositoryA.StoreRuntimeVerificationPlanBinding(ctx, h.service, active, h.verification.Facts.Binding); err != nil {
		t.Fatal(err)
	}
	if _, _, err := h.repositoryA.StoreRuntimeVerificationClosureReceipt(ctx, h.service, expired, h.verification.Facts.SatisfiedClosure); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired closure err=%v", err)
	}
	var count int
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM agent_verification_closure_receipts`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("expired closure rows=%d err=%v", count, err)
	}
	if _, _, err := h.repositoryA.StoreRuntimeVerificationClosureReceipt(ctx, h.service, active, h.verification.Facts.SatisfiedClosure); err != nil {
		t.Fatal(err)
	}
}
