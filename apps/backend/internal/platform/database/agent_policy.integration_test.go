package database

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
)

type agentPolicyPostgreSQLVector struct {
	DocumentID     string          `json:"documentId"`
	Wire           json.RawMessage `json:"wire"`
	ExpectedDigest string          `json:"expectedDigest"`
}

func TestAgentPolicyPostgreSQLRoundTripGate(t *testing.T) {
	database := openPIRWireMigrationPostgreSQL(t)
	vectorBytes, err := os.ReadFile("../agentcontract/testdata/agent-policy-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector agentPolicyPostgreSQLVector
	if err := json.Unmarshal(vectorBytes, &vector); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	now := time.Now().UTC().Truncate(time.Microsecond)
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users (id,email,name,password_hash,created_at) VALUES ($1,$2,$3,$4,$5)`, []any{"agent-owner", "agent-owner@example.test", "Agent Owner", []byte("integration-only"), now}},
		{`INSERT INTO projects (id,owner_id,resource_type,name,created_at,updated_at) VALUES ($1,$2,'project',$3,$4,$4)`, []any{"agent-project", "agent-owner", "Agent Project", now}},
		{`INSERT INTO workspaces (id,project_id,owner_id,name,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)`, []any{"workspace.vector", "agent-project", "agent-owner", "Agent Workspace", now}},
		{`INSERT INTO workspace_documents (workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES ($1,$2,'agent-policy',$3,$4,1,1,$5::jsonb,'["core.agent.document.update@1.0"]'::jsonb,$6)`, []any{"workspace.vector", vector.DocumentID, "Agent Policy", "/agent-policy.json", string(vector.Wire), now}},
	} {
		if _, err := database.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}

	var persisted json.RawMessage
	if err := database.QueryRowContext(
		ctx,
		`SELECT content_json FROM workspace_documents WHERE workspace_id=$1 AND id=$2`,
		"workspace.vector",
		vector.DocumentID,
	).Scan(&persisted); err != nil {
		t.Fatal(err)
	}
	if err := agentcontract.ValidateDocument(vector.DocumentID, persisted); err != nil {
		t.Fatalf("validate persisted AgentPolicy: %v", err)
	}
	digest, err := agentcontract.CanonicalCurrentDigest(vector.DocumentID, persisted)
	if err != nil {
		t.Fatal(err)
	}
	if digest != vector.ExpectedDigest {
		t.Fatalf("persisted digest = %s, want %s", digest, vector.ExpectedDigest)
	}
	if _, err := database.ExecContext(
		ctx,
		`INSERT INTO workspace_documents (workspace_id,id,doc_type,name,path,content_rev,meta_rev,content_json,capabilities_json,updated_at) VALUES ($1,$2,'agent-policy',$3,$4,1,1,$5::jsonb,'[]'::jsonb,$6)`,
		"workspace.vector",
		"agent.policy.second",
		"Second Agent Policy",
		"/agent-policy-second.json",
		string(vector.Wire),
		now,
	); err == nil {
		t.Fatal("PostgreSQL must enforce one agent-policy per workspace")
	}
}
