package workspace

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func decodeOperationCommitSource(source string) error {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest("POST", "/", strings.NewReader(source))
	_, err := decodeWorkspaceOperationCommitRequest(context)
	return err
}

func TestDecodeWorkspaceOperationCommitRejectsAmbiguousJSONBeforeBinding(t *testing.T) {
	for _, source := range []string{
		`{"expected":{"documents":[]},"expected":{"documents":[]},"operation":null}`,
		`{"expected":{"documents":[]},"operation":{"__proto__":{}}}`,
	} {
		if err := decodeOperationCommitSource(source); err == nil {
			t.Fatalf("ambiguous Workspace operation JSON was accepted: %s", source)
		}
	}
}

func TestDecodeWorkspaceOperationCommitDoesNotApplyAgentPolicyStringBudgetToEnvelope(t *testing.T) {
	label := strings.Repeat("x", 70*1024)
	source := `{"expected":{"documents":[]},"operation":{"kind":"command","command":{"id":"large-label","namespace":"core.workspace","type":"document.add","version":"1.0","issuedAt":"2026-07-31T00:00:00Z","forwardOps":[],"reverseOps":[],"target":{"workspaceId":"workspace.large"},"label":"` + label + `","domainHint":"workspace"}}}`
	if err := decodeOperationCommitSource(source); err != nil {
		t.Fatalf("large but in-budget Workspace envelope was rejected: %v", err)
	}
}
