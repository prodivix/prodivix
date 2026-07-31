package verification

import (
	"context"
	"testing"
)

func TestVerificationRunRegistrySurvivesBackendRestartAndReplaysIdempotently(
	t *testing.T,
) {
	databaseA, databaseB := openVerificationPostgreSQL(t)
	seedVerificationPostgreSQLWorkspace(t, databaseA)
	repositoryA := NewRepository(databaseA)
	repositoryB := NewRepository(databaseB)
	ctx := context.Background()

	snapshot := testVerificationRunSnapshot(t)
	snapshot.WorkspaceID = "workspace-vector"
	snapshot.WorkspaceRevision = 0
	snapshot.SnapshotDigest = ""
	snapshotDigest, _, err := digestWithoutField(snapshot, "snapshotDigest")
	if err != nil {
		t.Fatal(err)
	}
	snapshot.SnapshotDigest = snapshotDigest
	if err := validateInitialVerificationRun(snapshot); err != nil {
		t.Fatalf("validate initial run: %v", err)
	}
	snapshotWire, snapshotBytes, err := verificationRunSnapshotWire(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	created, replayed, err := repositoryA.CreateVerificationRun(
		ctx,
		"owner-vector",
		snapshotWire,
		snapshotBytes,
	)
	if err != nil || replayed || created.SnapshotDigest != snapshot.SnapshotDigest {
		t.Fatalf("create run = %#v, replayed %t, error %v", created, replayed, err)
	}
	restartedCreate, replayed, err := repositoryB.CreateVerificationRun(
		ctx,
		"owner-vector",
		snapshotWire,
		snapshotBytes,
	)
	if err != nil || !replayed ||
		restartedCreate.SnapshotDigest != snapshot.SnapshotDigest {
		t.Fatalf(
			"restart create replay = %#v, replayed %t, error %v",
			restartedCreate,
			replayed,
			err,
		)
	}

	event := testVerificationRunEvent(t, VerificationRunEvent{
		EventID:    "event-restart-start",
		RunID:      snapshot.RunID,
		Cursor:     1,
		OccurredAt: "2026-07-31T08:00:00.001Z",
		Kind:       "run-started",
	})
	eventWire, eventBytes, err := verificationRunEventWire(event)
	if err != nil {
		t.Fatal(err)
	}
	running, replayed, err := repositoryA.AppendVerificationRunEvent(
		ctx,
		"owner-vector",
		snapshot.WorkspaceID,
		snapshot.RunID,
		eventWire,
		eventBytes,
	)
	if err != nil || replayed || running.Cursor != 1 || running.Status != "running" {
		t.Fatalf("append event = %#v, replayed %t, error %v", running, replayed, err)
	}
	recovered, err := repositoryB.GetVerificationRun(
		ctx,
		snapshot.WorkspaceID,
		snapshot.RunID,
		0,
	)
	if err != nil ||
		recovered.Snapshot.SnapshotDigest != running.SnapshotDigest ||
		len(recovered.Events) != 1 ||
		recovered.Events[0].EventDigest != event.EventDigest {
		t.Fatalf("restart recovery = %#v, error %v", recovered, err)
	}
	replayedRun, replayed, err := repositoryB.AppendVerificationRunEvent(
		ctx,
		"owner-vector",
		snapshot.WorkspaceID,
		snapshot.RunID,
		eventWire,
		eventBytes,
	)
	if err != nil || !replayed ||
		replayedRun.SnapshotDigest != running.SnapshotDigest {
		t.Fatalf(
			"restart event replay = %#v, replayed %t, error %v",
			replayedRun,
			replayed,
			err,
		)
	}
	afterCursor, err := repositoryB.GetVerificationRun(
		ctx,
		snapshot.WorkspaceID,
		snapshot.RunID,
		1,
	)
	if err != nil || len(afterCursor.Events) != 0 {
		t.Fatalf("after-cursor recovery = %#v, error %v", afterCursor, err)
	}
	revision := int64(0)
	runs, err := repositoryB.ListVerificationRuns(
		ctx,
		snapshot.WorkspaceID,
		&revision,
		snapshot.PlanDigest,
		10,
	)
	if err != nil || len(runs) != 1 || runs[0].WorkspaceRevision != 0 {
		t.Fatalf("exact revision-zero list = %#v, error %v", runs, err)
	}
}
