package workspace

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

func TestG4AgentPolicyWorkspaceAuthorityBoundary(t *testing.T) {
	source, err := os.ReadFile("../../platform/agentcontract/testdata/agent-policy-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector struct {
		DocumentID string          `json:"documentId"`
		Wire       json.RawMessage `json:"wire"`
	}
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	if !isValidWorkspaceDocumentType(WorkspaceDocumentTypeAgentPolicy) {
		t.Fatal("agent-policy must be a registered Workspace document type")
	}
	if !isSingletonWorkspaceDocumentType(WorkspaceDocumentTypeAgentPolicy) {
		t.Fatal("agent-policy must be singleton-scoped")
	}
	if got := workspaceDocumentCommandDomain(WorkspaceDocumentTypeAgentPolicy); got != "agent" {
		t.Fatalf("AgentPolicy command domain = %q, want agent", got)
	}
	if got := commitNamespaceDomain("core.agent.document.update"); got != "agent" {
		t.Fatalf("core.agent namespace domain = %q", got)
	}
	if err := validateWorkspaceDocumentContent(
		WorkspaceDocumentTypeAgentPolicy,
		vector.DocumentID,
		vector.Wire,
	); err != nil {
		t.Fatalf("canonical AgentPolicy was rejected: %v", err)
	}
	if _, err := applyWorkspaceDocumentPatch(
		WorkspaceDocumentTypeAgentPolicy,
		vector.Wire,
		[]WorkspacePatchOp{{
			Op:    "replace",
			Path:  "/name",
			Value: json.RawMessage(`"Updated policy"`),
		}},
	); err != nil {
		t.Fatalf("AgentPolicy owner root was rejected: %v", err)
	}
	for _, forbidden := range []string{"/wireVersion", "/x-extension", "/actions"} {
		if _, err := applyWorkspaceDocumentPatch(
			WorkspaceDocumentTypeAgentPolicy,
			vector.Wire,
			[]WorkspacePatchOp{{
				Op:    "replace",
				Path:  forbidden,
				Value: json.RawMessage(`null`),
			}},
		); err == nil {
			t.Fatalf("AgentPolicy patch root %s must fail closed", forbidden)
		}
	}
	command := WorkspaceCommandEnvelope{
		ID:         "g4-agent-policy-update",
		Namespace:  "core.agent",
		Type:       "document.update",
		Version:    "1.0",
		IssuedAt:   time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC),
		Target:     WorkspaceCommandTarget{WorkspaceID: "workspace.vector", DocumentID: vector.DocumentID},
		DomainHint: "agent",
		ForwardOps: []WorkspacePatchOp{{Op: "replace", Path: "/name", Value: json.RawMessage(`"After"`)}},
		ReverseOps: []WorkspacePatchOp{{Op: "replace", Path: "/name", Value: json.RawMessage(`"Before"`)}},
	}
	if err := validateCommitCommand(command, "workspace.vector"); err != nil {
		t.Fatalf("core.agent command was rejected: %v", err)
	}
	command.DomainHint = "verification"
	if err := validateCommitCommand(command, "workspace.vector"); err == nil {
		t.Fatal("core.agent must reject a conflicting domainHint")
	}
}
