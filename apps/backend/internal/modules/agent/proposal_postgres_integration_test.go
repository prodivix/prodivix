package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type proposalRepositoryVectorStep struct {
	Name  string          `json:"name"`
	Run   json.RawMessage `json:"run"`
	Event json.RawMessage `json:"event"`
}

type proposalRepositoryVector struct {
	Format       string `json:"format"`
	Version      int    `json:"version"`
	ControlFacts struct {
		Task     json.RawMessage                `json:"task"`
		Sequence []proposalRepositoryVectorStep `json:"sequence"`
	} `json:"controlFacts"`
	Facts struct {
		Proposal             json.RawMessage `json:"proposal"`
		Planning             json.RawMessage `json:"planning"`
		Preview              json.RawMessage `json:"preview"`
		Approval             json.RawMessage `json:"approval"`
		CommitStarted        json.RawMessage `json:"commitStarted"`
		CommitAcknowledged   json.RawMessage `json:"commitAcknowledged"`
		RollbackStarted      json.RawMessage `json:"rollbackStarted"`
		RollbackAcknowledged json.RawMessage `json:"rollbackAcknowledged"`
	} `json:"facts"`
	WorkspaceCommits struct {
		Forward struct {
			Request  json.RawMessage `json:"request"`
			Mutation json.RawMessage `json:"mutation"`
		} `json:"forward"`
		Reverse struct {
			Request  json.RawMessage `json:"request"`
			Mutation json.RawMessage `json:"mutation"`
		} `json:"reverse"`
	} `json:"workspaceCommits"`
}

func readProposalRepositoryVector(t *testing.T) proposalRepositoryVector {
	t.Helper()
	source, err := os.ReadFile("../../platform/agentcontract/testdata/agent-proposal-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector proposalRepositoryVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-proposal-canonical-vector" || vector.Version != 1 {
		t.Fatalf("unexpected Agent proposal repository vector: %q v%d", vector.Format, vector.Version)
	}
	return vector
}

func TestAgentProposalApprovalPostgreSQLGate(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	seedAgentWorkspace(t, databaseA)
	repositoryA := NewRepository(databaseA)
	repositoryB := NewRepository(databaseB)
	vector := readProposalRepositoryVector(t)
	ctx := context.Background()
	user := PrincipalAuthority{
		Kind: "user", PrincipalID: "user.test",
		ProjectID: "project.catalog", WorkspaceID: "workspace.catalog",
	}
	service := PrincipalAuthority{
		Kind: "service", PrincipalID: "agent.coordinator.g4-v5",
		ProjectID: "project.catalog", WorkspaceID: "workspace.catalog",
	}

	task, replayed, err := repositoryA.CreateTask(ctx, user, vector.ControlFacts.Task)
	if err != nil || replayed {
		t.Fatalf("create V5 Task = %#v replay=%v err=%v", task, replayed, err)
	}
	createdStep := vector.ControlFacts.Sequence[0]
	created, replayed, err := repositoryA.CreateRun(ctx, task.WorkspaceID, createdStep.Run, createdStep.Event)
	if err != nil || replayed {
		t.Fatalf("create V5 Run = %#v replay=%v err=%v", created, replayed, err)
	}
	lease, replayed, err := repositoryA.ClaimRun(
		ctx, task.WorkspaceID, created.RunID,
		"lease.g4-v5.proposal", "worker.g4-v5.proposal", 0,
		mustAgentTime(t, "2026-08-01T08:30:01.100Z"),
		mustAgentTime(t, "2026-08-01T09:30:00.000Z"),
	)
	if err != nil || replayed {
		t.Fatalf("claim V5 Run = %#v replay=%v err=%v", lease, replayed, err)
	}
	leaseAuthority := RunLeaseAuthority{
		LeaseID: lease.LeaseID, HolderID: lease.HolderID, Generation: lease.Generation,
	}
	appendStep := func(index int) RunRecord {
		t.Helper()
		step := vector.ControlFacts.Sequence[index]
		leaseAuthority.ObservedAt = eventTimeFromVector(t, step.Event)
		next, replayed, err := repositoryA.AppendTransition(
			ctx, task.WorkspaceID, leaseAuthority, step.Run, step.Event,
		)
		if err != nil || replayed {
			t.Fatalf("append V5 %s = %#v replay=%v err=%v", step.Name, next, replayed, err)
		}
		leaseAuthority.Generation = next.Generation
		return next
	}
	appendStep(1)
	running := appendStep(2)
	if running.Phase != "running" {
		t.Fatalf("V5 proposal Run phase = %s, want running", running.Phase)
	}

	malformed := append([]byte(nil), vector.Facts.Proposal...)
	malformed = append([]byte(`{"wireVersion":1,`), malformed[1:]...)
	if _, _, err := repositoryA.StoreProposal(ctx, service, malformed); !errors.Is(err, ErrInvalid) {
		t.Fatalf("ambiguous proposal error = %v, want ErrInvalid", err)
	}
	assertAgentProposalRowCount(t, databaseA, "agent_proposals", 0)
	proposal, replayed, err := repositoryA.StoreProposal(ctx, service, vector.Facts.Proposal)
	if err != nil || replayed {
		t.Fatalf("store proposal = %#v replay=%v err=%v", proposal, replayed, err)
	}
	replayedProposal, replayed, err := repositoryB.StoreProposal(ctx, service, vector.Facts.Proposal)
	if err != nil || !replayed || replayedProposal.ProposalDigest != proposal.ProposalDigest {
		t.Fatalf("cross-replica proposal replay = %#v replay=%v err=%v", replayedProposal, replayed, err)
	}
	preview, replayed, err := repositoryA.StoreProposalPreview(
		ctx, service, vector.Facts.Planning, vector.Facts.Preview,
	)
	if err != nil || replayed {
		t.Fatalf("store proposal preview = %#v replay=%v err=%v", preview, replayed, err)
	}
	appendStep(3)
	if _, _, err := repositoryA.DecideProposal(
		ctx,
		PrincipalAuthority{
			Kind: "user", PrincipalID: "user.other",
			ProjectID: user.ProjectID, WorkspaceID: user.WorkspaceID,
		},
		vector.Facts.Approval,
	); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unbound approval actor error = %v, want ErrUnauthorized", err)
	}
	decision, replayed, err := repositoryA.DecideProposal(ctx, user, vector.Facts.Approval)
	if err != nil || replayed || decision.Decision != "approved" {
		t.Fatalf("decide proposal = %#v replay=%v err=%v", decision, replayed, err)
	}
	replayedDecision, replayed, err := repositoryB.DecideProposal(ctx, user, vector.Facts.Approval)
	if err != nil || !replayed || replayedDecision.DecisionDigest != decision.DecisionDigest {
		t.Fatalf("cross-replica approval replay = %#v replay=%v err=%v", replayedDecision, replayed, err)
	}
	appendStep(4)

	commitStarted, replayed, err := repositoryA.RecordWorkspaceMutation(ctx, service, vector.Facts.CommitStarted)
	if err != nil || replayed || commitStarted.State != "started" {
		t.Fatalf("record commit started = %#v replay=%v err=%v", commitStarted, replayed, err)
	}
	forwardResult := commitAgentProposalWorkspaceOperation(
		t, ctx, databaseA, user, vector.WorkspaceCommits.Forward.Request,
		vector.Facts.CommitStarted,
	)
	assertAgentMutationDigest(
		t, forwardResult, vector.WorkspaceCommits.Forward.Mutation,
		vector.Facts.CommitAcknowledged,
	)
	commitACK, replayed, err := repositoryA.RecordWorkspaceMutation(
		ctx, service, vector.Facts.CommitAcknowledged,
	)
	if err != nil || replayed || commitACK.State != "acknowledged" {
		t.Fatalf("record commit ACK = %#v replay=%v err=%v", commitACK, replayed, err)
	}
	replayedACK, replayed, err := repositoryB.RecordWorkspaceMutation(
		ctx, service, vector.Facts.CommitAcknowledged,
	)
	if err != nil || !replayed || replayedACK.ReceiptDigest != commitACK.ReceiptDigest {
		t.Fatalf("cross-replica commit ACK replay = %#v replay=%v err=%v", replayedACK, replayed, err)
	}
	appendStep(5)

	rollbackStarted, replayed, err := repositoryA.RecordWorkspaceMutation(
		ctx, service, vector.Facts.RollbackStarted,
	)
	if err != nil || replayed || rollbackStarted.Kind != "rollback" {
		t.Fatalf("record rollback started = %#v replay=%v err=%v", rollbackStarted, replayed, err)
	}
	reverseResult := commitAgentProposalWorkspaceOperation(
		t, ctx, databaseA, user, vector.WorkspaceCommits.Reverse.Request,
		vector.Facts.RollbackStarted,
	)
	assertAgentMutationDigest(
		t, reverseResult, vector.WorkspaceCommits.Reverse.Mutation,
		vector.Facts.RollbackAcknowledged,
	)
	rollbackACK, replayed, err := repositoryA.RecordWorkspaceMutation(
		ctx, service, vector.Facts.RollbackAcknowledged,
	)
	if err != nil || replayed || rollbackACK.State != "acknowledged" {
		t.Fatalf("record rollback ACK = %#v replay=%v err=%v", rollbackACK, replayed, err)
	}

	assertAgentProposalRowCount(t, databaseA, "agent_proposals", 1)
	assertAgentProposalRowCount(t, databaseA, "agent_proposal_previews", 1)
	assertAgentProposalRowCount(t, databaseA, "agent_approval_decisions", 1)
	assertAgentProposalRowCount(t, databaseA, "agent_workspace_mutation_receipts", 4)
	if _, err := databaseA.Exec(`UPDATE agent_proposals SET proposal_digest = proposal_digest WHERE workspace_id = $1`, user.WorkspaceID); err == nil {
		t.Fatal("immutable Agent proposal ledger accepted an UPDATE")
	}
}

func commitAgentProposalWorkspaceOperation(
	t *testing.T,
	ctx context.Context,
	database *sql.DB,
	authority PrincipalAuthority,
	raw json.RawMessage,
	startedReceiptBytes json.RawMessage,
) *workspace.WorkspaceMutationResult {
	t.Helper()
	startedReceipt, err := decodeMutationReceipt(startedReceiptBytes)
	if err != nil {
		t.Fatal(err)
	}
	var requestValue any
	if err := json.Unmarshal(raw, &requestValue); err != nil {
		t.Fatal(err)
	}
	requestDigest, err := canonicaljson.Digest(requestValue)
	if err != nil {
		t.Fatal(err)
	}
	if requestDigest != startedReceipt.RequestDigest {
		t.Fatalf("Atomic Commit request digest = %s, want started receipt %s", requestDigest, startedReceipt.RequestDigest)
	}
	var request workspace.WorkspaceOperationCommitRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		t.Fatalf("decode Workspace Atomic Commit request: %v", err)
	}
	result, err := workspace.NewWorkspaceStore(database).CommitWorkspaceOperation(
		ctx,
		workspace.CommitWorkspaceOperationParams{
			WorkspaceID: authority.WorkspaceID,
			OwnerID:     authority.PrincipalID,
			Request:     request,
		},
	)
	if err != nil {
		t.Fatalf("Atomic Commit %s: %v", startedReceipt.Kind, err)
	}
	return result
}

func assertAgentMutationDigest(
	t *testing.T,
	result *workspace.WorkspaceMutationResult,
	expectedMutation json.RawMessage,
	receiptBytes json.RawMessage,
) {
	t.Helper()
	receipt, err := decodeMutationReceipt(receiptBytes)
	if err != nil {
		t.Fatal(err)
	}
	actualCanonical, err := canonicaljson.Bytes(result)
	if err != nil {
		t.Fatal(err)
	}
	var expectedValue any
	if err := json.Unmarshal(expectedMutation, &expectedValue); err != nil {
		t.Fatal(err)
	}
	expectedCanonical, err := canonicaljson.Bytes(expectedValue)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actualCanonical, expectedCanonical) {
		t.Fatalf("Atomic Commit mutation = %s, want vector %s", actualCanonical, expectedCanonical)
	}
	digest, err := canonicaljson.Digest(result)
	if err != nil {
		t.Fatal(err)
	}
	if digest != receipt.MutationDigest {
		t.Fatalf("Atomic Commit mutation digest = %s, want receipt %s", digest, receipt.MutationDigest)
	}
}

func assertAgentProposalRowCount(t *testing.T, database *sql.DB, table string, expected int64) {
	t.Helper()
	var count int64
	if err := database.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf("%s row count = %d, want %d", table, count, expected)
	}
}
