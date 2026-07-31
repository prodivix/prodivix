package workspace

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type agentPolicyCanonicalVector struct {
	DocumentID     string          `json:"documentId"`
	Wire           json.RawMessage `json:"wire"`
	ExpectedDigest string          `json:"expectedDigest"`
}

func loadAgentPolicyCanonicalVector(t *testing.T) agentPolicyCanonicalVector {
	t.Helper()
	source, err := os.ReadFile("../../platform/agentcontract/testdata/agent-policy-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentPolicyCanonicalVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatalf("decode AgentPolicy canonical vector: %v", err)
	}
	return vector
}

func seedAgentPolicyAtomicCommitWorkspace(
	t *testing.T,
	database *sql.DB,
	ownerID string,
	projectID string,
	workspaceID string,
	now time.Time,
) {
	t.Helper()
	const seedDocumentID = "doc_seed"
	const seedDocumentPath = "/main.ts"
	seedTree, err := defaultWorkspaceTreeWithDocumentJSON("root", seedDocumentID, seedDocumentPath)
	if err != nil {
		t.Fatalf("create G4 AgentPolicy seed tree: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)`,
		ownerID,
		ownerID+"@example.test",
		"G4 AgentPolicy Gate",
		[]byte("integration-only"),
		now,
	); err != nil {
		t.Fatalf("seed G4 AgentPolicy owner: %v", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO projects (id, owner_id, resource_type, name, created_at, updated_at) VALUES ($1, $2, 'project', $3, $4, $4)`,
		projectID,
		ownerID,
		"G4 AgentPolicy Gate",
		now,
	); err != nil {
		t.Fatalf("seed G4 AgentPolicy project: %v", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO workspaces (
			id, project_id, owner_id, name, tree_root_id, tree_json, created_at, updated_at
		) VALUES ($1, $2, $3, $4, 'root', $5::jsonb, $6, $6)`,
		workspaceID,
		projectID,
		ownerID,
		"G4 AgentPolicy Gate",
		string(seedTree),
		now,
	); err != nil {
		t.Fatalf("seed G4 AgentPolicy workspace: %v", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO workspace_documents (
			workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
		) VALUES ($1, $2, 'code', 'main.ts', $3, 1, 1, $4::jsonb, '[]'::jsonb, $5)`,
		workspaceID,
		seedDocumentID,
		seedDocumentPath,
		string(defaultCodeDocument),
		now,
	); err != nil {
		t.Fatalf("seed G4 AgentPolicy baseline document: %v", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO workspace_routes (workspace_id, manifest_json, updated_at) VALUES ($1, $2::jsonb, $3)`,
		workspaceID,
		string(defaultWorkspaceRouteManifest),
		now,
	); err != nil {
		t.Fatalf("seed G4 AgentPolicy route: %v", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO workspace_settings (workspace_id, settings_json, updated_at) VALUES ($1, $2::jsonb, $3)`,
		workspaceID,
		string(defaultWorkspaceSettings),
		now,
	); err != nil {
		t.Fatalf("seed G4 AgentPolicy settings: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit G4 AgentPolicy workspace fixture: %v", err)
	}
}

// TestAgentPolicyAtomicCommitPostgreSQLGate proves the V0 Golden Path against
// a real PostgreSQL schema: Atomic Commit, idempotent replay, snapshot reload,
// and the same canonical digest used by the TypeScript owner.
func TestAgentPolicyAtomicCommitPostgreSQLGate(t *testing.T) {
	database := openWorkspacePostgreSQLTestDatabase(t)
	vector := loadAgentPolicyCanonicalVector(t)
	const ownerID = "g4-agent-policy-owner"
	const projectID = "g4-agent-policy-project"
	const workspaceID = "g4-agent-policy-workspace"
	now := time.Date(2026, time.July, 31, 0, 0, 0, 0, time.UTC)
	seedAgentPolicyAtomicCommitWorkspace(t, database, ownerID, projectID, workspaceID, now)

	oldTree := defaultWorkspaceVFSTree("root")
	newTree := defaultWorkspaceVFSTree("root")
	for _, tree := range []*workspaceVFSTree{&oldTree, &newTree} {
		if err := tree.addDocument(codeDocumentMount{
			DocumentID: "doc_seed",
			Path:       "/main.ts",
		}); err != nil {
			t.Fatalf("mount G4 AgentPolicy baseline document: %v", err)
		}
	}
	const documentPath = "/agent-policy.json"
	if err := newTree.addDocument(codeDocumentMount{
		DocumentID: vector.DocumentID,
		Path:       documentPath,
	}); err != nil {
		t.Fatalf("mount AgentPolicy document: %v", err)
	}
	oldTreeByID, err := json.Marshal(oldTree.TreeByID)
	if err != nil {
		t.Fatal(err)
	}
	newTreeByID, err := json.Marshal(newTree.TreeByID)
	if err != nil {
		t.Fatal(err)
	}
	document, err := json.Marshal(map[string]any{
		"id":         vector.DocumentID,
		"type":       WorkspaceDocumentTypeAgentPolicy,
		"name":       "agent-policy.json",
		"path":       documentPath,
		"contentRev": 1,
		"metaRev":    1,
		"content":    vector.Wire,
	})
	if err != nil {
		t.Fatal(err)
	}
	command := WorkspaceCommandEnvelope{
		ID:        "g4-agent-policy-create",
		Namespace: "core.workspace-sync",
		Type:      "document.add",
		Version:   "1.0",
		IssuedAt:  now,
		ForwardOps: []WorkspacePatchOp{
			{Op: "replace", Path: "/treeById", Value: newTreeByID},
			{Op: "add", Path: "/docsById/" + vector.DocumentID, Value: document},
		},
		ReverseOps: []WorkspacePatchOp{
			{Op: "remove", Path: "/docsById/" + vector.DocumentID},
			{Op: "replace", Path: "/treeById", Value: oldTreeByID},
		},
		Target:     WorkspaceCommandTarget{WorkspaceID: workspaceID},
		DomainHint: "workspace",
	}
	request := WorkspaceOperationCommitRequest{
		Expected: &WorkspaceOperationCommitExpected{
			WorkspaceRev: commitRevision(1),
			Documents: []WorkspaceCommitExpectedDocument{{
				ID:                vector.DocumentID,
				ContentRevPresent: true,
				MetaRevPresent:    true,
			}},
		},
		Operation: WorkspaceOperationEnvelope{Kind: "command", Command: &command},
	}

	store := NewWorkspaceStore(database)
	result, err := store.CommitWorkspaceOperation(context.Background(), CommitWorkspaceOperationParams{
		WorkspaceID: workspaceID,
		OwnerID:     ownerID,
		Request:     request,
	})
	if err != nil {
		t.Fatalf("Atomic Commit AgentPolicy: %v", err)
	}
	if result.WorkspaceRev != 2 || result.RouteRev != 1 || result.OpSeq != 2 || len(result.UpdatedDocuments) != 1 {
		t.Fatalf("unexpected AgentPolicy mutation result: %+v", result)
	}

	replay, err := store.CommitWorkspaceOperation(context.Background(), CommitWorkspaceOperationParams{
		WorkspaceID: workspaceID,
		OwnerID:     ownerID,
		Request:     request,
	})
	if err != nil {
		t.Fatalf("replay AgentPolicy Atomic Commit: %v", err)
	}
	resultJSON, err := canonicaljson.Bytes(result)
	if err != nil {
		t.Fatal(err)
	}
	replayJSON, err := canonicaljson.Bytes(replay)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(replayJSON, resultJSON) {
		t.Fatal("idempotent replay changed the semantic mutation result")
	}

	snapshot, err := store.GetSnapshotForOwner(context.Background(), ownerID, workspaceID)
	if err != nil {
		t.Fatalf("reload committed AgentPolicy snapshot: %v", err)
	}
	if snapshot.Workspace.WorkspaceRev != 2 || snapshot.Workspace.OpSeq != 2 || len(snapshot.Documents) != 2 {
		t.Fatalf("unexpected reloaded AgentPolicy snapshot: %+v", snapshot)
	}
	var persisted WorkspaceDocumentRecord
	for _, document := range snapshot.Documents {
		if document.ID == vector.DocumentID {
			persisted = document
			break
		}
	}
	if persisted.ID != vector.DocumentID || persisted.Type != WorkspaceDocumentTypeAgentPolicy || persisted.Path != documentPath || persisted.ContentRev != 1 || persisted.MetaRev != 1 {
		t.Fatalf("unexpected persisted AgentPolicy document: %+v", persisted)
	}
	digest, err := agentcontract.CanonicalCurrentDigest(persisted.ID, persisted.Content)
	if err != nil {
		t.Fatalf("validate reloaded AgentPolicy: %v", err)
	}
	if digest != vector.ExpectedDigest {
		t.Fatalf("reloaded AgentPolicy digest = %q, want %q", digest, vector.ExpectedDigest)
	}
	var operationCount int
	if err := database.QueryRow(
		`SELECT COUNT(*) FROM workspace_operations WHERE workspace_id = $1 AND operation_id = $2`,
		workspaceID,
		command.ID,
	).Scan(&operationCount); err != nil {
		t.Fatalf("count AgentPolicy commit records: %v", err)
	}
	if operationCount != 1 {
		t.Fatalf("AgentPolicy operation record count = %d, want 1", operationCount)
	}
}
