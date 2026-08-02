package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type repositoryVectorStep struct {
	Name  string          `json:"name"`
	Run   json.RawMessage `json:"run"`
	Event json.RawMessage `json:"event"`
}

type repositoryVector struct {
	Facts struct {
		Task json.RawMessage `json:"task"`
	} `json:"facts"`
	RepositorySequence   []repositoryVectorStep `json:"repositorySequence"`
	RecoverySequence     []repositoryVectorStep `json:"recoverySequence"`
	CancellationSequence []repositoryVectorStep `json:"cancellationSequence"`
}

func readRepositoryVector(t *testing.T) repositoryVector {
	t.Helper()
	source, err := os.ReadFile(filepath.Join(
		"..", "..", "platform", "agentcontract", "testdata", "agent-control-vector.json",
	))
	if err != nil {
		t.Fatal(err)
	}
	var vector repositoryVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if len(vector.RepositorySequence) < 8 {
		t.Fatalf("repository sequence has %d steps, want at least 8", len(vector.RepositorySequence))
	}
	if len(vector.RecoverySequence) < 5 {
		t.Fatalf("recovery sequence has %d steps, want at least 5", len(vector.RecoverySequence))
	}
	if len(vector.CancellationSequence) < 7 {
		t.Fatalf("cancellation sequence has %d steps, want at least 7", len(vector.CancellationSequence))
	}
	return vector
}

func TestRecoveryVectorFencesTheSupersededOperationGeneration(t *testing.T) {
	vector := readRepositoryVector(t)
	task, err := decodeTaskFact(vector.Facts.Task)
	if err != nil {
		t.Fatal(err)
	}
	var current runFact
	for index, step := range vector.RecoverySequence {
		next, err := decodeRunFact(step.Run)
		if err != nil {
			t.Fatalf("decode recovery %s Run: %v", step.Name, err)
		}
		event, err := decodeEventFact(step.Event)
		if err != nil {
			t.Fatalf("decode recovery %s event: %v", step.Name, err)
		}
		if index == 0 {
			if err := validateInitialRun(task, next, event); err != nil {
				t.Fatalf("validate recovery %s: %v", step.Name, err)
			}
		} else if err := validateRunTransition(task.Mode, current, next, event); err != nil {
			t.Fatalf("validate recovery %s: %v", step.Name, err)
		}
		current = next
	}
	if current.Generation != 2 || current.Attempt != 2 || current.Phase != "preparing" {
		t.Fatalf("recovered backend vector state = generation %d attempt %d phase %s", current.Generation, current.Attempt, current.Phase)
	}
	if _, exists := current.Value["pendingOperation"]; exists {
		t.Fatal("recovered backend vector retained a superseded pending operation")
	}
}

func TestRepositoryVectorSatisfiesBackendTransitionAdmission(t *testing.T) {
	vector := readRepositoryVector(t)
	task, err := decodeTaskFact(vector.Facts.Task)
	if err != nil {
		t.Fatal(err)
	}
	var current runFact
	for index, step := range vector.RepositorySequence {
		next, err := decodeRunFact(step.Run)
		if err != nil {
			t.Fatalf("decode %s Run: %v", step.Name, err)
		}
		event, err := decodeEventFact(step.Event)
		if err != nil {
			t.Fatalf("decode %s event: %v", step.Name, err)
		}
		if index == 0 {
			if err := validateInitialRun(task, next, event); err != nil {
				t.Fatalf("validate %s: %v", step.Name, err)
			}
		} else if err := validateRunTransition(task.Mode, current, next, event); err != nil {
			t.Fatalf("validate %s: %v", step.Name, err)
		}
		current = next
	}
	if current.Phase != "terminal" || current.Outcome != "succeeded" || current.BudgetRevision != 2 {
		t.Fatalf("final backend vector state = phase %s, outcome %s, budget r%d", current.Phase, current.Outcome, current.BudgetRevision)
	}
}

func TestModeSpecificSuccessProofFailsClosed(t *testing.T) {
	if validModeSuccessProof("apply", map[string]any{
		"mode": "apply", "proposalDigest": "sha256-placeholder",
	}) {
		t.Fatal("apply success must require approval, commit ACK, plan, and Verification closure")
	}
	if validModeSuccessProof("explain", map[string]any{
		"mode": "explain", "answerDigest": "sha256-placeholder", "groundingDigests": []any{},
	}) {
		t.Fatal("explain success must require at least one grounding digest")
	}
}

func TestCancellationVectorRevokesOperationAndClosesCleanup(t *testing.T) {
	vector := readRepositoryVector(t)
	task, err := decodeTaskFact(vector.Facts.Task)
	if err != nil {
		t.Fatal(err)
	}
	var current runFact
	for index, step := range vector.CancellationSequence {
		next, err := decodeRunFact(step.Run)
		if err != nil {
			t.Fatalf("decode cancellation %s Run: %v", step.Name, err)
		}
		event, err := decodeEventFact(step.Event)
		if err != nil {
			t.Fatalf("decode cancellation %s event: %v", step.Name, err)
		}
		if index == 0 {
			if err := validateInitialRun(task, next, event); err != nil {
				t.Fatalf("validate cancellation %s: %v", step.Name, err)
			}
		} else if err := validateRunTransition(task.Mode, current, next, event); err != nil {
			t.Fatalf("validate cancellation %s: %v", step.Name, err)
		}
		current = next
	}
	if current.Phase != "terminal" || current.Outcome != "cancelled" ||
		current.CallbackAuthority != "revoked" || current.CleanupState != "clean" {
		t.Fatalf("cancelled backend vector state = phase %s outcome %s callback %s cleanup %s",
			current.Phase, current.Outcome, current.CallbackAuthority, current.CleanupState)
	}
}
