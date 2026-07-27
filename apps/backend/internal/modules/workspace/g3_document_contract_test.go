package workspace

import (
	"encoding/json"
	"testing"
	"time"
)

func TestG3DocumentDomainsAndPatchRoots(t *testing.T) {
	cases := []struct {
		documentType WorkspaceDocumentType
		domain       string
		allowedPath  string
	}{
		{WorkspaceDocumentTypeBehaviorScenario, "behavior", "/name"},
		{WorkspaceDocumentTypeBehaviorControlProfile, "behavior", "/timezone"},
		{WorkspaceDocumentTypeBehaviorFixtureSet, "behavior", "/fixtures"},
		{WorkspaceDocumentTypeVerificationPolicy, "verification", "/rules"},
		{WorkspaceDocumentTypeVerificationBaselineSet, "verification", "/entries"},
	}
	for _, testCase := range cases {
		t.Run(string(testCase.documentType), func(t *testing.T) {
			if got := workspaceDocumentCommandDomain(testCase.documentType); got != testCase.domain {
				t.Fatalf("domain = %q, want %q", got, testCase.domain)
			}
			if !isValidWorkspaceDocumentType(testCase.documentType) {
				t.Fatal("G3 document type must be accepted by the Workspace store")
			}
			content := json.RawMessage(`{"wireVersion":1,"name":"Before","timezone":"UTC","fixtures":[],"rules":[],"entries":[]}`)
			value := json.RawMessage(`[]`)
			if testCase.allowedPath == "/name" || testCase.allowedPath == "/timezone" {
				value = json.RawMessage(`"After"`)
			}
			if _, err := applyWorkspaceDocumentPatch(testCase.documentType, content, []WorkspacePatchOp{{
				Op:    "replace",
				Path:  testCase.allowedPath,
				Value: value,
			}}); err != nil {
				t.Fatalf("allowed owner root was rejected: %v", err)
			}
			if _, err := applyWorkspaceDocumentPatch(testCase.documentType, content, []WorkspacePatchOp{{
				Op:    "replace",
				Path:  "/wireVersion",
				Value: json.RawMessage(`2`),
			}}); err == nil {
				t.Fatal("document commands must not patch the wire version")
			}
		})
	}
	if got := commitNamespaceDomain("core.behavior.document.update"); got != "behavior" {
		t.Fatalf("Behavior namespace domain = %q", got)
	}
	if got := commitNamespaceDomain("core.verification.document.update"); got != "verification" {
		t.Fatalf("Verification namespace domain = %q", got)
	}
	for _, domain := range []string{"behavior", "verification"} {
		command := WorkspaceCommandEnvelope{
			ID:         "g3-domain-" + domain,
			Namespace:  "core." + domain,
			Type:       "document.update",
			Version:    "1.0",
			IssuedAt:   time.Date(2026, 7, 27, 0, 0, 0, 0, time.UTC),
			Target:     WorkspaceCommandTarget{WorkspaceID: "ws_1", DocumentID: "doc_1"},
			DomainHint: domain,
			ForwardOps: []WorkspacePatchOp{{Op: "replace", Path: "/name", Value: json.RawMessage(`"After"`)}},
			ReverseOps: []WorkspacePatchOp{{Op: "replace", Path: "/name", Value: json.RawMessage(`"Before"`)}},
		}
		if err := validateCommitCommand(command, "ws_1"); err != nil {
			t.Fatalf("%s domainHint was rejected: %v", domain, err)
		}
	}
	if !isSingletonWorkspaceDocumentType(WorkspaceDocumentTypeVerificationPolicy) {
		t.Fatal("verification-policy must be singleton-scoped")
	}
	if isSingletonWorkspaceDocumentType(WorkspaceDocumentTypeBehaviorScenario) {
		t.Fatal("behavior-scenario must allow multiple documents")
	}
}
