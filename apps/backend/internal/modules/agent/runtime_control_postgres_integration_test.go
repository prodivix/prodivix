package agent

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func runtimeControlStep(t *testing.T, current runFact, template repositoryVectorStep, principalID string) ([]byte, []byte) {
	t.Helper()
	next, err := decodeRunFact(template.Run)
	if err != nil {
		t.Fatal(err)
	}
	event, err := decodeEventFact(template.Event)
	if err != nil {
		t.Fatal(err)
	}
	event.Value["producer"] = map[string]any{"kind": "service", "principalId": principalID}
	event.Value["previousEventDigest"] = current.LatestEventDigest
	event.Value["eventDigest"] = runtimeTestDigest(t, event.Value, "eventDigest")
	processed, _ := arrayMember(current.Value, "processedEvents")
	next.Value["processedEvents"] = append(processed, map[string]any{"eventId": event.Value["eventId"], "idempotencyKey": event.Value["idempotencyKey"], "type": event.Value["type"], "requestDigest": event.Value["requestDigest"], "eventDigest": event.Value["eventDigest"]})
	run, _ := objectMember(next.Value, "run")
	run["latestEventDigest"] = event.Value["eventDigest"]
	next.Value["snapshotDigest"] = runtimeTestDigest(t, next.Value, "snapshotDigest")
	nextSource, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "run-snapshot", "value": next.Value})
	if err != nil {
		t.Fatal(err)
	}
	eventSource, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": "run-event", "value": event.Value})
	if err != nil {
		t.Fatal(err)
	}
	return nextSource, eventSource
}

func runtimeControlInitial(t *testing.T) (*sql.DB, *Repository, repositoryVector, RunRecord) {
	t.Helper()
	db, _ := openAgentPostgreSQL(t)
	seedAgentWorkspace(t, db)
	repository := NewRepository(db)
	vector := readRepositoryVector(t)
	principal := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: "workspace.catalog", ProjectID: "project.catalog"}
	if _, _, err := repository.CreateTask(context.Background(), principal, vector.Facts.Task); err != nil {
		t.Fatal(err)
	}
	created, _, err := repository.CreateRun(context.Background(), principal.WorkspaceID, vector.RepositorySequence[0].Run, vector.RepositorySequence[0].Event)
	if err != nil {
		t.Fatal(err)
	}
	return db, repository, vector, created
}

func TestRuntimeBootstrapTrustedCASAndReplayPostgreSQLGate(t *testing.T) {
	db, repository, vector, created := runtimeControlInitial(t)
	ctx := context.Background()
	current, _ := decodeRunFact(vector.RepositorySequence[0].Run)
	wrongRun, wrongEvent := runtimeControlStep(t, current, vector.RepositorySequence[1], "service.other")
	if _, _, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, created.SnapshotDigest, wrongRun, wrongEvent); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("untrusted bootstrap err=%v", err)
	}
	next, event := runtimeControlStep(t, current, vector.RepositorySequence[1], RuntimePrincipalID)
	wrongDigest := runtimeTestDigest(t, map[string]any{"wrong": true}, "unused")
	if _, _, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, wrongDigest, next, event); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale bootstrap CAS err=%v", err)
	}
	started, replayed, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, created.SnapshotDigest, next, event)
	if err != nil || replayed || started.Generation != 1 || started.Phase != "preparing" {
		t.Fatalf("bootstrap=%#v replay=%v err=%v", started, replayed, err)
	}
	if _, replayed, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, created.SnapshotDigest, next, event); err != nil || !replayed {
		t.Fatalf("bootstrap exact replay=%v err=%v", replayed, err)
	}
	var events int
	if err := db.QueryRow(`SELECT COUNT(*) FROM agent_run_events`).Scan(&events); err != nil || events != 2 {
		t.Fatalf("bootstrap events=%d err=%v", events, err)
	}
	runningRun, runningEvent := runtimeControlStep(t, mustRuntimeRunFact(t, next), vector.RepositorySequence[2], RuntimePrincipalID)
	if _, _, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, created.SnapshotDigest, runningRun, runningEvent); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("generic phase change through bootstrap err=%v", err)
	}
}

func mustRuntimeRunFact(t *testing.T, source []byte) runFact {
	t.Helper()
	fact, err := decodeRunFact(source)
	if err != nil {
		t.Fatal(err)
	}
	return fact
}

func TestRuntimeTransitionClockRefreshPostgreSQLGate(t *testing.T) {
	db, repository, vector, created := runtimeControlInitial(t)
	ctx := context.Background()
	next, event := runtimeControlStep(t, mustRuntimeRunFact(t, vector.RepositorySequence[0].Run), vector.RepositorySequence[1], RuntimePrincipalID)
	if _, _, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, created.SnapshotDigest, next, event); err != nil {
		t.Fatal(err)
	}
	start, expiry := mustAgentTime(t, "2026-08-01T08:00:02.000Z"), mustAgentTime(t, "2026-08-01T08:00:03.000Z")
	lease, _, err := repository.ClaimRun(ctx, created.WorkspaceID, created.RunID, "lease.runtime.clock", "worker.runtime", 1, start, expiry)
	if err != nil {
		t.Fatal(err)
	}
	guard := RuntimeLeaseGuard{Authority: RunLeaseAuthority{LeaseID: lease.LeaseID, HolderID: lease.HolderID, Generation: lease.Generation, ObservedAt: start}, Clock: func() time.Time { return expiry }}
	runSource, eventSource := runtimeControlStep(t, mustRuntimeRunFact(t, next), vector.RepositorySequence[2], RuntimePrincipalID)
	if _, _, err := repository.AppendRuntimeTransition(ctx, created.WorkspaceID, guard, runSource, eventSource); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("captured valid time admitted expired transition err=%v", err)
	}
	var cursor int64
	if err := db.QueryRow(`SELECT cursor FROM agent_runs`).Scan(&cursor); err != nil || cursor != 2 {
		t.Fatalf("expired transition cursor=%d err=%v", cursor, err)
	}
}

func TestRuntimeDispatchRequiresActiveRunLeasePostgreSQLGate(t *testing.T) {
	db, repository, vector, created := runtimeControlInitial(t)
	ctx := context.Background()
	next, event := runtimeControlStep(t, mustRuntimeRunFact(t, vector.RepositorySequence[0].Run), vector.RepositorySequence[1], RuntimePrincipalID)
	if _, _, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, created.SnapshotDigest, next, event); err != nil {
		t.Fatal(err)
	}
	now, expiry := mustAgentTime(t, "2026-08-01T08:00:02.000Z"), mustAgentTime(t, "2026-08-01T08:00:30.000Z")
	lease, _, err := repository.ClaimRun(ctx, created.WorkspaceID, created.RunID, "lease.runtime.dispatch", "worker.runtime", 1, now, expiry)
	if err != nil {
		t.Fatal(err)
	}
	guard := RuntimeLeaseGuard{Authority: RunLeaseAuthority{LeaseID: lease.LeaseID, HolderID: lease.HolderID, Generation: lease.Generation, ObservedAt: now}, Clock: func() time.Time { return now }}
	for index := 2; index <= 4; index++ {
		next, event = runtimeControlStep(t, mustRuntimeRunFact(t, next), vector.RepositorySequence[index], RuntimePrincipalID)
		if _, _, err := repository.AppendRuntimeTransition(ctx, created.WorkspaceID, guard, next, event); err != nil {
			t.Fatal(err)
		}
	}
	operationID := "operation.vector.model.1"
	expired := guard
	expired.Clock = func() time.Time { return expiry }
	if _, err := repository.ClaimRuntimeOperationDispatch(ctx, created.WorkspaceID, created.RunID, operationID, "dispatch.runtime", "dispatcher.runtime", expired, expiry.Add(time.Second)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired Run claimed dispatch err=%v", err)
	}
	var state string
	if err := db.QueryRow(`SELECT dispatch_state FROM agent_run_operations`).Scan(&state); err != nil || state != "ready" {
		t.Fatalf("expired claim state=%s err=%v", state, err)
	}
	claim, err := repository.ClaimRuntimeOperationDispatch(ctx, created.WorkspaceID, created.RunID, operationID, "dispatch.runtime", "dispatcher.runtime", guard, expiry.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.MarkRuntimeOperationDispatched(ctx, claim, expired); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("live dispatch lease survived expired Run err=%v", err)
	}
	if err := db.QueryRow(`SELECT dispatch_state FROM agent_run_operations`).Scan(&state); err != nil || state != "claimed" {
		t.Fatalf("expired mark state=%s err=%v", state, err)
	}
	if replayed, err := repository.MarkRuntimeOperationDispatched(ctx, claim, guard); err != nil || replayed {
		t.Fatalf("active dispatch replay=%v err=%v", replayed, err)
	}
	if replayed, err := repository.MarkRuntimeOperationDispatched(ctx, claim, guard); err != nil || !replayed {
		t.Fatalf("active dispatch replay=%v err=%v", replayed, err)
	}
}

func TestRuntimeLeaseClaimAndRenewClockBoundsPostgreSQLGate(t *testing.T) {
	db, repository, vector, created := runtimeControlInitial(t)
	ctx := context.Background()
	next, event := runtimeControlStep(t, mustRuntimeRunFact(t, vector.RepositorySequence[0].Run), vector.RepositorySequence[1], RuntimePrincipalID)
	if _, _, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, created.SnapshotDigest, next, event); err != nil {
		t.Fatal(err)
	}
	now := mustAgentTime(t, "2026-08-01T08:00:02.000Z")
	expires := now.Add(time.Second)
	calls := 0
	advancingClock := func() time.Time {
		calls++
		if calls == 1 {
			return now
		}
		return expires
	}
	if _, _, err := repository.RuntimeClaimRun(ctx, created.WorkspaceID, created.RunID, "lease.runtime.claim", "worker.runtime", 1, expires, advancingClock); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expired-after-lock claim err=%v", err)
	}
	var leaseID sql.NullString
	if err := db.QueryRow(`SELECT lease_id FROM agent_runs`).Scan(&leaseID); err != nil || leaseID.Valid {
		t.Fatalf("expired claim persisted lease=%v err=%v", leaseID, err)
	}
	clock := func() time.Time { return now }
	if _, _, err := repository.RuntimeClaimRun(ctx, created.WorkspaceID, created.RunID, "lease.runtime.claim", "worker.runtime", 1, now.Add(11*time.Minute), clock); !errors.Is(err, ErrInvalid) {
		t.Fatalf("oversized claim err=%v", err)
	}
	lease, _, err := repository.RuntimeClaimRun(ctx, created.WorkspaceID, created.RunID, "lease.runtime.claim", "worker.runtime", 1, expires, clock)
	if err != nil {
		t.Fatal(err)
	}
	authority := RunLeaseAuthority{LeaseID: lease.LeaseID, HolderID: lease.HolderID, Generation: lease.Generation, ObservedAt: now}
	if _, err := repository.RuntimeRenewRunLease(ctx, authority, created.WorkspaceID, created.RunID, expires.Add(time.Second), func() time.Time { return expires }); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired Run revived during renewal err=%v", err)
	}
	if _, err := repository.RuntimeRenewRunLease(ctx, authority, created.WorkspaceID, created.RunID, now.Add(11*time.Minute), clock); !errors.Is(err, ErrInvalid) {
		t.Fatalf("oversized renewal err=%v", err)
	}
	if _, err := repository.RuntimeRenewRunLease(ctx, authority, created.WorkspaceID, created.RunID, now.Add(time.Minute), clock); err != nil {
		t.Fatal(err)
	}
}

func TestRuntimeQueuedCancellationRequiresExactDurableCommandPostgreSQLGate(t *testing.T) {
	db, repository, vector, created := runtimeControlInitial(t)
	ctx := context.Background()
	current := mustRuntimeRunFact(t, vector.RepositorySequence[0].Run)
	next, event := runtimeCancelFact(t, current)
	if _, _, err := repository.CancelRuntimeRun(ctx, created.WorkspaceID, created.RunID, "command.missing", created.Cursor, created.SnapshotDigest, next, event); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cancel without durable command err=%v", err)
	}
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: created.WorkspaceID, ProjectID: "project.catalog"}
	command, _, err := repository.StoreRunUserCommand(ctx, user, created.RunID, runtimeCancelCommand(t, current))
	if err != nil {
		t.Fatal(err)
	}
	startedRun, startedEvent := runtimeControlStep(t, mustRuntimeRunFact(t, vector.RepositorySequence[0].Run), vector.RepositorySequence[1], RuntimePrincipalID)
	if _, _, err := repository.BootstrapRuntimeRun(ctx, created.WorkspaceID, created.Cursor, created.SnapshotDigest, startedRun, startedEvent); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("queued cancel did not fence bootstrap err=%v", err)
	}
	wrong := runtimeTestDigest(t, map[string]any{"wrong": true}, "unused")
	if _, _, err := repository.CancelRuntimeRun(ctx, created.WorkspaceID, created.RunID, command.CommandID, created.Cursor, wrong, next, event); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cancel snapshot mismatch err=%v", err)
	}
	cancelled, replayed, err := repository.CancelRuntimeRun(ctx, created.WorkspaceID, created.RunID, command.CommandID, created.Cursor, created.SnapshotDigest, next, event)
	if err != nil || replayed || cancelled.Generation != 1 || cancelled.Phase != "cancelling" || cancelled.CallbackAuthority != "revoked" || cancelled.CleanupState != "pending" {
		t.Fatalf("queued cancel=%#v replay=%v err=%v", cancelled, replayed, err)
	}
	if _, replayed, err := repository.CancelRuntimeRun(ctx, created.WorkspaceID, created.RunID, command.CommandID, created.Cursor, created.SnapshotDigest, next, event); err != nil || !replayed {
		t.Fatalf("cancel exact replay=%v err=%v", replayed, err)
	}
	var events int
	if err := db.QueryRow(`SELECT COUNT(*) FROM agent_run_events`).Scan(&events); err != nil || events != 2 {
		t.Fatalf("queued cancellation events=%d err=%v", events, err)
	}
	cleanSource, cleanEvent := runtimeCancellationContinuation(t, mustRuntimeRunFact(t, next), false)
	clean, _, err := repository.CancelRuntimeRun(ctx, created.WorkspaceID, created.RunID, command.CommandID, cancelled.Cursor, cancelled.SnapshotDigest, cleanSource, cleanEvent)
	if err != nil || clean.CleanupState != "clean" {
		t.Fatalf("lease-free cleanup=%#v err=%v", clean, err)
	}
	terminalSource, terminalEvent := runtimeCancellationContinuation(t, mustRuntimeRunFact(t, cleanSource), true)
	terminal, replayed, err := repository.CancelRuntimeRun(ctx, created.WorkspaceID, created.RunID, command.CommandID, clean.Cursor, clean.SnapshotDigest, terminalSource, terminalEvent)
	if err != nil || replayed || terminal.Phase != "terminal" || terminal.Outcome != "cancelled" {
		t.Fatalf("lease-free terminal=%#v replay=%v err=%v", terminal, replayed, err)
	}
	if _, replayed, err := repository.CancelRuntimeRun(ctx, created.WorkspaceID, created.RunID, command.CommandID, clean.Cursor, clean.SnapshotDigest, terminalSource, terminalEvent); err != nil || !replayed {
		t.Fatalf("cancel terminal exact replay=%v err=%v", replayed, err)
	}
	if _, replayed, err := repository.StoreRunUserCommand(ctx, user, created.RunID, runtimeCancelCommand(t, current)); err != nil || !replayed {
		t.Fatalf("queued cancel command replay after terminal=%v err=%v", replayed, err)
	}
	foreign := user
	foreign.PrincipalID = "user.other"
	if _, _, err := repository.StoreRunUserCommand(ctx, foreign, created.RunID, runtimeCancelCommand(t, current)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("queued cancel command cross-actor replay err=%v", err)
	}
}

func runtimeCancellationContinuation(t *testing.T, current runFact, terminal bool) ([]byte, []byte) {
	t.Helper()
	index := 5
	if terminal {
		index = 6
	}
	template, err := decodeEventFact(readRepositoryVector(t).CancellationSequence[index].Event)
	if err != nil {
		t.Fatal(err)
	}
	event := template.Value
	event["producer"] = map[string]any{"kind": "service", "principalId": RuntimePrincipalID}
	event["taskId"], event["runId"], event["generation"], event["sequence"] = current.TaskID, current.RunID, current.Generation, current.Cursor+1
	event["previousEventDigest"], event["policyDigest"] = current.LatestEventDigest, current.PolicyDigest
	run, _ := objectMember(current.Value, "run")
	event["grantRef"] = run["grantRef"]
	event["occurredAt"] = canonicalTime(current.UpdatedAt.Add(time.Millisecond)).Format("2006-01-02T15:04:05.000Z")
	event["eventDigest"] = runtimeTestDigest(t, event, "eventDigest")
	value := current.Value
	value["cursor"] = current.Cursor + 1
	run["latestEventDigest"], run["updatedAt"] = event["eventDigest"], event["occurredAt"]
	if terminal {
		run["phase"], run["outcome"] = "terminal", "cancelled"
		attempts, _ := arrayMember(value, "attempts")
		if len(attempts) > 0 {
			fact, err := decodeEventFact(mustRuntimeEnvelope(t, "run-event", event))
			if err != nil {
				t.Fatal(err)
			}
			latest, _ := attempts[len(attempts)-1].(map[string]any)
			completed, err := completedAttempt(latest, fact, "cancelled", eventFailureDigest(fact))
			if err != nil {
				t.Fatal(err)
			}
			attempts[len(attempts)-1] = completed
		}
	} else {
		value["cleanupState"] = "clean"
	}
	processed, _ := arrayMember(value, "processedEvents")
	value["processedEvents"] = append(processed, map[string]any{"eventId": event["eventId"], "idempotencyKey": event["idempotencyKey"], "type": event["type"], "requestDigest": event["requestDigest"], "eventDigest": event["eventDigest"]})
	value["snapshotDigest"] = runtimeTestDigest(t, value, "snapshotDigest")
	return mustRuntimeEnvelope(t, "run-snapshot", value), mustRuntimeEnvelope(t, "run-event", event)
}

func mustRuntimeEnvelope(t *testing.T, kind string, value map[string]any) []byte {
	t.Helper()
	source, err := canonicaljson.Bytes(map[string]any{"wireVersion": 1, "factType": kind, "value": value})
	if err != nil {
		t.Fatal(err)
	}
	return source
}

func TestRuntimeActiveCancellationClosesConsumedCommandPostgreSQLGate(t *testing.T) {
	h := prepareVerificationPostgreSQLHarness(t)
	ctx := context.Background()
	current := mustRuntimeRunFact(t, h.proposal.ControlFacts.Sequence[5].Run)
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", WorkspaceID: h.task.WorkspaceID, ProjectID: h.task.ProjectID}
	command, _, err := h.repositoryB.StoreRunUserCommand(ctx, user, current.RunID, runtimeCancelCommand(t, current))
	if err != nil {
		t.Fatal(err)
	}
	next, event := runtimeCancelFact(t, current)
	cancelled, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, current.Cursor, current.SnapshotDigest, next, event)
	if err != nil {
		t.Fatal(err)
	}
	terminalSource, terminalEvent := runtimeCancellationContinuation(t, mustRuntimeRunFact(t, next), true)
	if _, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, cancelled.Cursor, cancelled.SnapshotDigest, terminalSource, terminalEvent); !errors.Is(err, ErrConflict) {
		t.Fatalf("cancelled without clean cleanup err=%v", err)
	}
	cleanSource, cleanEvent := runtimeCancellationContinuation(t, mustRuntimeRunFact(t, next), false)
	staleWorker := h.lease
	staleWorker.Generation = cancelled.Generation
	if _, _, err := h.repositoryA.AppendRuntimeTransition(ctx, h.task.WorkspaceID, RuntimeLeaseGuard{Authority: staleWorker, Clock: func() time.Time { return mustAgentTime(t, "2026-08-01T09:00:00.003Z") }}, cleanSource, cleanEvent); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("generic cleanup revived revoked callback using old IDs/new generation err=%v", err)
	}
	if _, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, "command.missing", cancelled.Cursor, cancelled.SnapshotDigest, cleanSource, cleanEvent); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cleanup without consumed command err=%v", err)
	}
	clean, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, cancelled.Cursor, cancelled.SnapshotDigest, cleanSource, cleanEvent)
	if err != nil {
		t.Fatal(err)
	}
	terminalSource, terminalEvent = runtimeCancellationContinuation(t, mustRuntimeRunFact(t, cleanSource), true)
	terminal, _, err := h.repositoryA.CancelRuntimeRun(ctx, h.task.WorkspaceID, current.RunID, command.CommandID, clean.Cursor, clean.SnapshotDigest, terminalSource, terminalEvent)
	if err != nil || terminal.Outcome != "cancelled" {
		t.Fatalf("active cancellation terminal=%#v err=%v", terminal, err)
	}
	fact := mustRuntimeRunFact(t, terminal.FactBytes)
	attempts, _ := arrayMember(fact.Value, "attempts")
	latest, _ := attempts[len(attempts)-1].(map[string]any)
	if stringMember(latest, "outcome") != "cancelled" || stringMember(latest, "completedAt") == "" {
		t.Fatal("active cancellation failed to close attempt lineage")
	}
	var commands, links int
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM agent_run_user_commands`).Scan(&commands); err != nil || commands != 1 {
		t.Fatalf("consumed command retained=%d err=%v", commands, err)
	}
	if err := h.databaseA.QueryRow(`SELECT COUNT(*) FROM agent_runtime_cancellations`).Scan(&links); err != nil || links != 1 {
		t.Fatalf("cancel consumption links=%d err=%v", links, err)
	}
	if _, replayed, err := h.repositoryA.StoreRunUserCommand(ctx, user, current.RunID, runtimeCancelCommand(t, current)); err != nil || !replayed {
		t.Fatalf("active cancel command replay after terminal=%v err=%v", replayed, err)
	}
	foreign := user
	foreign.PrincipalID = "user.other"
	if _, _, err := h.repositoryA.StoreRunUserCommand(ctx, foreign, current.RunID, runtimeCancelCommand(t, current)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("active cancel command cross-actor replay err=%v", err)
	}
}
