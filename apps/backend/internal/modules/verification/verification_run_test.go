package verification

import (
	"strings"
	"testing"
)

func verificationRunDigest() string {
	return "sha256-" + strings.Repeat("a", 64)
}

func testVerificationRunSnapshot(t *testing.T) VerificationRunSnapshot {
	t.Helper()
	snapshot := VerificationRunSnapshot{
		RunID:             "run-product-v7",
		WorkspaceID:       "workspace-v7",
		WorkspaceRevision: 41,
		PlanDigest:        verificationRunDigest(),
		Surface:           "preview",
		Scope:             "impacted",
		ProviderID:        "provider-browser",
		Origin:            "web",
		Status:            "queued",
		Cursor:            0,
		CreatedAt:         "2026-07-31T08:00:00.000Z",
		UpdatedAt:         "2026-07-31T08:00:00.000Z",
		SelectedCellIDs:   []string{"cell-catalog"},
		Cells: []VerificationRunCellState{{
			CellID:          "cell-catalog",
			AttemptID:       "attempt-catalog",
			Status:          "queued",
			LastEventCursor: 0,
		}},
	}
	digest, _, err := digestWithoutField(snapshot, "snapshotDigest")
	if err != nil {
		t.Fatal(err)
	}
	snapshot.SnapshotDigest = digest
	return snapshot
}

func testVerificationRunEvent(
	t *testing.T,
	event VerificationRunEvent,
) VerificationRunEvent {
	t.Helper()
	digest, _, err := digestWithoutField(event, "eventDigest")
	if err != nil {
		t.Fatal(err)
	}
	event.EventDigest = digest
	return event
}

func TestVerificationRunStateMachinePreservesCursorAndPromotionIdentity(t *testing.T) {
	snapshot := testVerificationRunSnapshot(t)
	if err := validateInitialVerificationRun(snapshot); err != nil {
		t.Fatalf("validate initial run: %v", err)
	}
	events := []VerificationRunEvent{
		{
			EventID: "event-start", RunID: snapshot.RunID, Cursor: 1,
			OccurredAt: "2026-07-31T08:00:00.001Z", Kind: "run-started",
		},
		{
			EventID: "event-cell-start", RunID: snapshot.RunID, Cursor: 2,
			OccurredAt: "2026-07-31T08:00:00.002Z", Kind: "cell-started",
			CellID: "cell-catalog", AttemptID: "attempt-catalog",
		},
		{
			EventID: "event-cell-report", RunID: snapshot.RunID, Cursor: 3,
			OccurredAt: "2026-07-31T08:00:00.003Z", Kind: "cell-reported",
			CellID: "cell-catalog", AttemptID: "attempt-catalog",
			Outcome: "passed", CandidateDigest: verificationRunDigest(),
		},
		{
			EventID: "event-cell-promote", RunID: snapshot.RunID, Cursor: 4,
			OccurredAt: "2026-07-31T08:00:00.004Z", Kind: "cell-promoted",
			CellID: "cell-catalog", AttemptID: "attempt-catalog",
			CandidateDigest: verificationRunDigest(), EvidenceID: "evidence-catalog",
		},
		{
			EventID: "event-complete", RunID: snapshot.RunID, Cursor: 5,
			OccurredAt: "2026-07-31T08:00:00.005Z", Kind: "run-completed",
		},
		{
			EventID: "event-closure", RunID: snapshot.RunID, Cursor: 6,
			OccurredAt: "2026-07-31T08:00:00.006Z", Kind: "closure-evaluated",
			ClosureDigest: verificationRunDigest(), Verdict: "satisfied",
		},
	}
	for index := range events {
		event := testVerificationRunEvent(t, events[index])
		next, err := applyVerificationRunEvent(snapshot, event)
		if err != nil {
			t.Fatalf("apply event %d (%s): %v", index, event.Kind, err)
		}
		snapshot = next
	}
	if snapshot.Status != "completed" ||
		snapshot.Cursor != 6 ||
		snapshot.Cells[0].Status != "passed" ||
		snapshot.Cells[0].EvidenceID != "evidence-catalog" ||
		snapshot.ClosureVerdict != "satisfied" {
		t.Fatalf("unexpected terminal run: %#v", snapshot)
	}
}

func TestVerificationRunRejectsDuplicateAndOutOfOrderEvents(t *testing.T) {
	snapshot := testVerificationRunSnapshot(t)
	outOfOrder := testVerificationRunEvent(t, VerificationRunEvent{
		EventID: "event-out-of-order", RunID: snapshot.RunID, Cursor: 2,
		OccurredAt: "2026-07-31T08:00:00.002Z", Kind: "run-started",
	})
	if _, err := applyVerificationRunEvent(snapshot, outOfOrder); err == nil {
		t.Fatal("out-of-order cursor must fail closed")
	}
	start := testVerificationRunEvent(t, VerificationRunEvent{
		EventID: "event-start", RunID: snapshot.RunID, Cursor: 1,
		OccurredAt: "2026-07-31T08:00:00.001Z", Kind: "run-started",
	})
	running, err := applyVerificationRunEvent(snapshot, start)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := applyVerificationRunEvent(running, start); err == nil {
		t.Fatal("duplicate cursor must not replay through the state machine")
	}
}

func TestVerificationRunCancellationIsExplicitAndTerminalizesQueuedCells(t *testing.T) {
	snapshot := testVerificationRunSnapshot(t)
	cancel := testVerificationRunEvent(t, VerificationRunEvent{
		EventID: "event-cancel", RunID: snapshot.RunID, Cursor: 1,
		OccurredAt: "2026-07-31T08:00:00.001Z",
		Kind:       "run-cancel-requested",
		Reason:     "User explicitly cancelled this run.",
	})
	cancelling, err := applyVerificationRunEvent(snapshot, cancel)
	if err != nil {
		t.Fatal(err)
	}
	if cancelling.Status != "cancelling" ||
		cancelling.Cells[0].Status != "cancelled" {
		t.Fatalf("unexpected cancellation projection: %#v", cancelling)
	}
	completed := testVerificationRunEvent(t, VerificationRunEvent{
		EventID: "event-cancel-complete", RunID: snapshot.RunID, Cursor: 2,
		OccurredAt: "2026-07-31T08:00:00.002Z", Kind: "run-completed",
	})
	terminal, err := applyVerificationRunEvent(cancelling, completed)
	if err != nil {
		t.Fatal(err)
	}
	if terminal.Status != "cancelled" {
		t.Fatalf("cancelled run status = %q", terminal.Status)
	}
}
