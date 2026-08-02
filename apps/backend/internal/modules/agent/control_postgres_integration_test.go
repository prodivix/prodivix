package agent

import (
	"context"
	cryptorand "crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

const agentPostgreSQLTestURL = "PRODIVIX_BACKEND_POSTGRES_TEST_URL"

func TestAgentControlPlanePostgreSQLGate(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	seedAgentWorkspace(t, databaseA)
	repositoryA := NewRepository(databaseA)
	repositoryB := NewRepository(databaseB)
	vector := readRepositoryVector(t)
	ctx := context.Background()
	principal := PrincipalAuthority{
		Kind: "user", PrincipalID: "user.test",
		ProjectID: "project.catalog", WorkspaceID: "workspace.catalog",
	}

	if _, _, err := repositoryA.CreateTask(
		ctx,
		PrincipalAuthority{
			Kind: "user", PrincipalID: "user.other",
			ProjectID: "project.catalog", WorkspaceID: "workspace.catalog",
		},
		vector.Facts.Task,
	); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unbound Task principal error = %v, want ErrUnauthorized", err)
	}
	if _, _, err := repositoryA.CreateTask(
		ctx,
		PrincipalAuthority{
			Kind: "user", PrincipalID: "user.test",
			ProjectID: "project.catalog", WorkspaceID: "workspace.other",
		},
		vector.Facts.Task,
	); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("cross-workspace Task authority error = %v, want ErrUnauthorized", err)
	}
	task, replayed, err := repositoryA.CreateTask(ctx, principal, vector.Facts.Task)
	if err != nil || replayed {
		t.Fatalf("create Task = %#v replay=%v err=%v", task, replayed, err)
	}
	replayedTask, replayed, err := repositoryB.CreateTask(ctx, principal, vector.Facts.Task)
	if err != nil || !replayed || replayedTask.TaskDigest != task.TaskDigest {
		t.Fatalf("cross-replica Task replay = %#v replay=%v err=%v", replayedTask, replayed, err)
	}

	createdStep := vector.RepositorySequence[0]
	created, replayed, err := repositoryA.CreateRun(ctx, task.WorkspaceID, createdStep.Run, createdStep.Event)
	if err != nil || replayed {
		t.Fatalf("create Run = %#v replay=%v err=%v", created, replayed, err)
	}
	replayedRun, replayed, err := repositoryB.CreateRun(ctx, task.WorkspaceID, createdStep.Run, createdStep.Event)
	if err != nil || !replayed || replayedRun.SnapshotDigest != created.SnapshotDigest {
		t.Fatalf("cross-replica Run replay = %#v replay=%v err=%v", replayedRun, replayed, err)
	}

	leaseA, replayed, err := repositoryA.ClaimRun(
		ctx, task.WorkspaceID, created.RunID, "lease.pg.a", "worker.pg.a", 0,
		mustAgentTime(t, "2026-08-01T08:00:01.000Z"),
		mustAgentTime(t, "2026-08-01T08:00:02.500Z"),
	)
	if err != nil || replayed {
		t.Fatalf("claim first Run lease = %#v replay=%v err=%v", leaseA, replayed, err)
	}
	authorityA := RunLeaseAuthority{
		LeaseID: leaseA.LeaseID, HolderID: leaseA.HolderID,
		Generation: leaseA.Generation, ObservedAt: mustAgentTime(t, "2026-08-01T08:00:02.000Z"),
	}
	started, replayed, err := repositoryA.AppendTransition(
		ctx, task.WorkspaceID, authorityA,
		vector.RepositorySequence[1].Run, vector.RepositorySequence[1].Event,
	)
	if err != nil || replayed || started.Generation != 1 {
		t.Fatalf("append started = %#v replay=%v err=%v", started, replayed, err)
	}

	leaseB, replayed, err := repositoryB.ClaimRun(
		ctx, task.WorkspaceID, created.RunID, "lease.pg.b", "worker.pg.b", 1,
		mustAgentTime(t, "2026-08-01T08:00:02.600Z"),
		mustAgentTime(t, "2026-08-01T08:00:30.000Z"),
	)
	if err != nil || replayed {
		t.Fatalf("take over expired Run lease = %#v replay=%v err=%v", leaseB, replayed, err)
	}
	staleAuthority := RunLeaseAuthority{
		LeaseID: leaseA.LeaseID, HolderID: leaseA.HolderID,
		Generation: 1, ObservedAt: mustAgentTime(t, "2026-08-01T08:00:03.000Z"),
	}
	if _, _, err := repositoryA.AppendTransition(
		ctx, task.WorkspaceID, staleAuthority,
		vector.RepositorySequence[2].Run, vector.RepositorySequence[2].Event,
	); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("stale worker transition error = %v, want ErrUnauthorized", err)
	}
	authorityB := RunLeaseAuthority{
		LeaseID: leaseB.LeaseID, HolderID: leaseB.HolderID,
		Generation: 1, ObservedAt: mustAgentTime(t, "2026-08-01T08:00:03.000Z"),
	}
	for index := 2; index < len(vector.RepositorySequence); index++ {
		step := vector.RepositorySequence[index]
		authorityB.ObservedAt = eventTimeFromVector(t, step.Event)
		next, replayed, err := repositoryB.AppendTransition(
			ctx, task.WorkspaceID, authorityB, step.Run, step.Event,
		)
		if err != nil || replayed {
			t.Fatalf("append %s = %#v replay=%v err=%v", step.Name, next, replayed, err)
		}
		if step.Name == "model-started" {
			claim, err := repositoryA.ClaimOperationDispatch(
				ctx, task.WorkspaceID, created.RunID, "operation.vector.model.1",
				"dispatch.pg.1", "worker.pg.a", 1,
				mustAgentTime(t, "2026-08-01T08:00:04.000Z"),
				mustAgentTime(t, "2026-08-01T08:00:05.000Z"),
			)
			if err != nil || claim.ReconciliationRequired || claim.DispatchState != "claimed" {
				t.Fatalf("claim model dispatch = %#v err=%v", claim, err)
			}
			replayedClaim, err := repositoryB.ClaimOperationDispatch(
				ctx, task.WorkspaceID, created.RunID, "operation.vector.model.1",
				"dispatch.pg.1", "worker.pg.a", 1,
				mustAgentTime(t, "2026-08-01T08:00:04.100Z"),
				mustAgentTime(t, "2026-08-01T08:00:05.000Z"),
			)
			if err != nil || !replayedClaim.Replayed {
				t.Fatalf("replay model dispatch claim = %#v err=%v", replayedClaim, err)
			}
			if _, err := repositoryB.ClaimOperationDispatch(
				ctx, task.WorkspaceID, created.RunID, "operation.vector.model.1",
				"dispatch.pg.2", "worker.pg.b", 1,
				mustAgentTime(t, "2026-08-01T08:00:04.200Z"),
				mustAgentTime(t, "2026-08-01T08:00:05.200Z"),
			); !errors.Is(err, ErrLeaseBusy) {
				t.Fatalf("parallel model dispatch error = %v, want ErrLeaseBusy", err)
			}
			if replayed, err := repositoryA.MarkOperationDispatched(
				ctx, claim, mustAgentTime(t, "2026-08-01T08:00:04.300Z"),
			); err != nil || replayed {
				t.Fatalf("mark model dispatched replay=%v err=%v", replayed, err)
			}
			reconcile, err := repositoryB.ClaimOperationDispatch(
				ctx, task.WorkspaceID, created.RunID, "operation.vector.model.1",
				"dispatch.pg.3", "worker.pg.b", 1,
				mustAgentTime(t, "2026-08-01T08:00:04.400Z"),
				mustAgentTime(t, "2026-08-01T08:00:05.400Z"),
			)
			if err != nil || !reconcile.ReconciliationRequired {
				t.Fatalf("dispatched operation must reconcile, got %#v err=%v", reconcile, err)
			}
		}
		if step.Name == "terminal" {
			if next.Phase != "terminal" || next.Outcome != "succeeded" {
				t.Fatalf("terminal Run = %#v", next)
			}
		}
	}

	terminalStep := vector.RepositorySequence[len(vector.RepositorySequence)-1]
	terminal, replayed, err := repositoryA.AppendTransition(
		ctx, task.WorkspaceID, authorityB, terminalStep.Run, terminalStep.Event,
	)
	if err != nil || !replayed || terminal.Phase != "terminal" {
		t.Fatalf("terminal ACK replay = %#v replay=%v err=%v", terminal, replayed, err)
	}
	assertAgentControlPostgreSQLState(t, databaseA, task.WorkspaceID, created.RunID, int64(len(vector.RepositorySequence)))
	audit, err := repositoryB.ExportAudit(
		ctx, task.WorkspaceID, created.RunID, 1, 100,
		mustAgentTime(t, "2026-08-01T08:00:09.000Z"),
	)
	if err != nil || audit.EventCount != len(vector.RepositorySequence) || audit.RootDigest == "" || audit.HeadDigest == "" {
		t.Fatalf("audit export = %#v err=%v", audit, err)
	}
	exerciseAgentRecoveryPostgreSQL(t, ctx, repositoryA, repositoryB, databaseA, task, vector.RecoverySequence)
}

func exerciseAgentRecoveryPostgreSQL(
	t *testing.T,
	ctx context.Context,
	repositoryA *Repository,
	repositoryB *Repository,
	database *sql.DB,
	task TaskRecord,
	sequence []repositoryVectorStep,
) {
	t.Helper()
	createdStep := sequence[0]
	created, replayed, err := repositoryA.CreateRun(
		ctx, task.WorkspaceID, createdStep.Run, createdStep.Event,
	)
	if err != nil || replayed {
		t.Fatalf("create recovery Run = %#v replay=%v err=%v", created, replayed, err)
	}
	lease, replayed, err := repositoryB.ClaimRun(
		ctx, task.WorkspaceID, created.RunID,
		"lease.pg.recovery", "worker.pg.recovery", 0,
		mustAgentTime(t, "2026-08-01T08:00:01.000Z"),
		mustAgentTime(t, "2026-08-01T08:01:00.000Z"),
	)
	if err != nil || replayed {
		t.Fatalf("claim recovery Run = %#v replay=%v err=%v", lease, replayed, err)
	}
	authority := RunLeaseAuthority{
		LeaseID: lease.LeaseID, HolderID: lease.HolderID,
		Generation: lease.Generation,
	}
	var current = created
	for index := 1; index < len(sequence)-1; index++ {
		step := sequence[index]
		authority.ObservedAt = eventTimeFromVector(t, step.Event)
		current, replayed, err = repositoryB.AppendTransition(
			ctx, task.WorkspaceID, authority, step.Run, step.Event,
		)
		if err != nil || replayed {
			t.Fatalf("append recovery %s = %#v replay=%v err=%v", step.Name, current, replayed, err)
		}
		authority.Generation = current.Generation
	}
	dispatch, err := repositoryA.ClaimOperationDispatch(
		ctx, task.WorkspaceID, created.RunID, "operation.recovery-vector.model.1",
		"dispatch.pg.recovery", "dispatcher.pg.recovery", 1,
		mustAgentTime(t, "2026-08-01T08:00:04.100Z"),
		mustAgentTime(t, "2026-08-01T08:00:30.000Z"),
	)
	if err != nil || dispatch.ReconciliationRequired || dispatch.DispatchState != "claimed" {
		t.Fatalf("claim recovery operation dispatch = %#v err=%v", dispatch, err)
	}
	if replayed, err := repositoryB.MarkOperationDispatched(
		ctx, dispatch, mustAgentTime(t, "2026-08-01T08:00:04.200Z"),
	); err != nil || replayed {
		t.Fatalf("mark recovery operation dispatched replay=%v err=%v", replayed, err)
	}
	recoveryStep := sequence[len(sequence)-1]
	authority.ObservedAt = eventTimeFromVector(t, recoveryStep.Event)
	recovered, replayed, err := repositoryB.AppendTransition(
		ctx, task.WorkspaceID, authority, recoveryStep.Run, recoveryStep.Event,
	)
	if err != nil || replayed || recovered.Generation != 2 {
		t.Fatalf("append recovery fence = %#v replay=%v err=%v", recovered, replayed, err)
	}
	if _, err := repositoryA.ClaimOperationDispatch(
		ctx, task.WorkspaceID, created.RunID, "operation.recovery-vector.model.1",
		"dispatch.pg.stale", "dispatcher.pg.stale", recovered.Generation,
		mustAgentTime(t, "2026-08-01T08:00:06.100Z"),
		mustAgentTime(t, "2026-08-01T08:00:30.000Z"),
	); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("superseded operation dispatch error = %v, want ErrUnauthorized", err)
	}
	var operationGeneration int64
	var operationState, dispatchState string
	if err := database.QueryRow(`SELECT generation, state, dispatch_state
	FROM agent_run_operations
	WHERE workspace_id = $1 AND run_id = $2 AND operation_id = $3`,
		task.WorkspaceID, created.RunID, "operation.recovery-vector.model.1",
	).Scan(&operationGeneration, &operationState, &dispatchState); err != nil {
		t.Fatal(err)
	}
	if operationGeneration != 1 || operationState != "started" || dispatchState != "reconciliation-required" {
		t.Fatalf("superseded operation projection = generation %d state %s dispatch %s", operationGeneration, operationState, dispatchState)
	}
}

func openAgentPostgreSQL(t *testing.T) (*sql.DB, *sql.DB) {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv(agentPostgreSQLTestURL))
	if databaseURL == "" {
		t.Skipf("set %s to run the real PostgreSQL Agent control Gate", agentPostgreSQLTestURL)
	}
	adminConfig, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse PostgreSQL integration URL: %v", err)
	}
	admin := stdlib.OpenDB(*adminConfig)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		_ = admin.Close()
		t.Fatalf("connect to PostgreSQL integration database: %v", err)
	}
	var suffix [8]byte
	if _, err := cryptorand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "prodivix_agent_" + hex.EncodeToString(suffix[:])
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		t.Fatalf("create Agent PostgreSQL schema: %v", err)
	}
	openPool := func() *sql.DB {
		config := adminConfig.Copy()
		if config.RuntimeParams == nil {
			config.RuntimeParams = make(map[string]string)
		}
		config.RuntimeParams["search_path"] = schema
		database := stdlib.OpenDB(*config)
		database.SetMaxOpenConns(8)
		database.SetMaxIdleConns(8)
		if err := database.PingContext(ctx); err != nil {
			t.Fatalf("connect isolated Agent PostgreSQL pool: %v", err)
		}
		return database
	}
	databaseA := openPool()
	if err := backenddatabase.RunMigrations(ctx, databaseA, 2*time.Minute); err != nil {
		t.Fatalf("migrate Agent PostgreSQL schema: %v", err)
	}
	databaseB := openPool()
	t.Cleanup(func() {
		_ = databaseA.Close()
		_ = databaseB.Close()
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()
		if _, err := admin.ExecContext(cleanupCtx, "DROP SCHEMA IF EXISTS "+quotedSchema+" CASCADE"); err != nil {
			t.Errorf("drop Agent PostgreSQL schema: %v", err)
		}
		_ = admin.Close()
	})
	return databaseA, databaseB
}

func seedAgentWorkspace(t *testing.T, database *sql.DB) {
	t.Helper()
	now := mustAgentTime(t, "2026-08-01T08:00:00.000Z")
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users (id, email, name, password_hash, created_at)
		 VALUES ($1, $2, $3, $4, $5)`, []any{"user.test", "agent-control@example.test", "Agent Gate", []byte("integration-only"), now}},
		{`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at)
		 VALUES ($1, $2, 'project', $3, $4, $4)`, []any{"project.catalog", "user.test", "Agent Catalog", now}},
		{`INSERT INTO workspaces (
			id, project_id, owner_id, name, workspace_rev, route_rev, op_seq,
			tree_root_id, tree_json, created_at, updated_at
		) VALUES ($1, $2, $3, $4, 42, 8, 144, 'root', $5::jsonb, $6, $6)`, []any{
			"workspace.catalog", "project.catalog", "user.test", "Agent Catalog",
			`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["page-catalog-node"]},"page-catalog-node":{"id":"page-catalog-node","kind":"doc","name":"catalog.ts","parentId":"root","docId":"page.catalog"}}}`,
			now,
		}},
		{`INSERT INTO workspace_documents (
			workspace_id, id, doc_type, name, path, content_rev, meta_rev,
			content_json, capabilities_json, updated_at
		) VALUES ($1, $2, 'code', $3, $4, 21, 3, $5::jsonb, '[]'::jsonb, $6)`, []any{
			"workspace.catalog", "page.catalog", "catalog.ts", "/catalog.ts",
			`{"language":"ts","source":"export default {}"}`,
			now,
		}},
	} {
		if _, err := database.Exec(statement.query, statement.args...); err != nil {
			t.Fatalf("seed Agent PostgreSQL workspace: %v", err)
		}
	}
}

func eventTimeFromVector(t *testing.T, source []byte) time.Time {
	t.Helper()
	event, err := decodeEventFact(source)
	if err != nil {
		t.Fatal(err)
	}
	return event.OccurredAt
}

func mustAgentTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatal(err)
	}
	return parsed.UTC()
}

func assertAgentControlPostgreSQLState(t *testing.T, database *sql.DB, workspaceID, runID string, eventCount int64) {
	t.Helper()
	var events, attempts, operations, reservations int64
	for query, destination := range map[string]*int64{
		`SELECT COUNT(*) FROM agent_run_events WHERE workspace_id = $1 AND run_id = $2`:          &events,
		`SELECT COUNT(*) FROM agent_run_attempts WHERE workspace_id = $1 AND run_id = $2`:        &attempts,
		`SELECT COUNT(*) FROM agent_run_operations WHERE workspace_id = $1 AND run_id = $2`:      &operations,
		`SELECT COUNT(*) FROM agent_budget_reservations WHERE workspace_id = $1 AND run_id = $2`: &reservations,
	} {
		if err := database.QueryRow(query, workspaceID, runID).Scan(destination); err != nil {
			t.Fatal(err)
		}
	}
	if events != eventCount || attempts != 2 || operations != 1 || reservations != 1 {
		t.Fatalf("durable counts events=%d attempts=%d operations=%d reservations=%d", events, attempts, operations, reservations)
	}
	var operationState, dispatchState, budgetStatus string
	if err := database.QueryRow(`SELECT state, dispatch_state FROM agent_run_operations
	WHERE workspace_id = $1 AND run_id = $2`, workspaceID, runID).Scan(&operationState, &dispatchState); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRow(`SELECT status FROM agent_budget_reservations
	WHERE workspace_id = $1 AND run_id = $2`, workspaceID, runID).Scan(&budgetStatus); err != nil {
		t.Fatal(err)
	}
	if operationState != "settled" || dispatchState != "settled" || budgetStatus != "settled" {
		t.Fatalf("durable lifecycle operation=%s dispatch=%s budget=%s", operationState, dispatchState, budgetStatus)
	}
}
