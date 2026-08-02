package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	"github.com/gin-gonic/gin"
)

type fakeProductRepository struct {
	authority   PrincipalAuthority
	source      []byte
	runID       string
	getCalls    int
	createCalls int
}

func (fake *fakeProductRepository) CreateTask(_ context.Context, authority PrincipalAuthority, source []byte) (TaskRecord, bool, error) {
	fake.authority, fake.source = authority, append([]byte(nil), source...)
	fake.createCalls++
	return TaskRecord{FactBytes: append([]byte(nil), source...)}, false, nil
}

func (fake *fakeProductRepository) DecideProposal(_ context.Context, authority PrincipalAuthority, source []byte) (ApprovalDecisionRecord, bool, error) {
	fake.authority, fake.source = authority, append([]byte(nil), source...)
	return ApprovalDecisionRecord{FactBytes: append([]byte(nil), source...)}, false, nil
}

func (fake *fakeProductRepository) StoreRunUserCommand(_ context.Context, authority PrincipalAuthority, runID string, source []byte) (RunUserCommandRecord, bool, error) {
	fake.authority, fake.runID, fake.source = authority, runID, append([]byte(nil), source...)
	return RunUserCommandRecord{FactBytes: append([]byte(nil), source...)}, false, nil
}

func (fake *fakeProductRepository) GetProductLedgerBundle(_ context.Context, authority PrincipalAuthority, runID string) (ProductLedgerBundle, error) {
	fake.authority, fake.runID = authority, runID
	fake.getCalls++
	return ProductLedgerBundle{Task: []byte(`{"wireVersion":1}`), Run: []byte(`{"wireVersion":1}`), Events: []json.RawMessage{}, Mutations: []json.RawMessage{}, VerificationBindings: []json.RawMessage{}, VerificationClosures: []json.RawMessage{}, RepairRounds: []json.RawMessage{}, Commands: []json.RawMessage{}, CurrentRevision: map[string]any{}, ActorAuthorized: true}, nil
}

func (fake *fakeProductRepository) ExportAudit(_ context.Context, workspaceID, runID string, fromSequence int64, limit int, exportedAt time.Time) (AuditExport, error) {
	fake.runID = runID
	return AuditExport{WorkspaceID: workspaceID, RunID: runID, FromSequence: fromSequence, EventCount: limit, ExportedAt: exportedAt, FactBytes: []byte(`{"wireVersion":1,"factType":"audit-export","value":{}}`)}, nil
}

func TestAgentProductHandlerRequiresAuthenticationBeforeRepositoryAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fake := &fakeProductRepository{}
	handler := NewHandler(fake)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Params = gin.Params{{Key: "id", Value: "project.catalog"}, {Key: "workspaceId", Value: "workspace.catalog"}, {Key: "runId", Value: "run.product"}}
	handler.HandleGetProduct(c)
	if recorder.Code != http.StatusUnauthorized || fake.getCalls != 0 {
		t.Fatalf("unauthenticated product read status=%d calls=%d", recorder.Code, fake.getCalls)
	}
}

func TestAgentProductHandlerForwardsExactUserCommandAndPathIdentity(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fake := &fakeProductRepository{}
	handler := NewHandler(fake)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	source := `{"wireVersion":1,"factType":"run-user-command","value":{"kind":"cancel"}}`
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(source))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("authUser", &backendauth.User{ID: "user.test"})
	c.Params = gin.Params{{Key: "id", Value: "project.catalog"}, {Key: "workspaceId", Value: "workspace.catalog"}, {Key: "runId", Value: "run.product"}}
	handler.HandleStoreRunCommand(c)
	if recorder.Code != http.StatusAccepted || string(fake.source) != source || fake.runID != "run.product" {
		t.Fatalf("command status=%d run=%q source=%q", recorder.Code, fake.runID, fake.source)
	}
	if fake.authority.Kind != "user" || fake.authority.PrincipalID != "user.test" || fake.authority.ProjectID != "project.catalog" {
		t.Fatalf("command authority = %#v", fake.authority)
	}
}

func TestAgentApprovalHandlerHasNoImplicitDecisionOrSkipFlag(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fake := &fakeProductRepository{}
	handler := NewHandler(fake)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	source := `{"wireVersion":1,"factType":"approval-decision","value":{"decision":"rejected"}}`
	c.Request = httptest.NewRequest(http.MethodPost, "/?skipApproval=true", strings.NewReader(source))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("authUser", &backendauth.User{ID: "user.test"})
	c.Params = gin.Params{{Key: "id", Value: "project.catalog"}, {Key: "workspaceId", Value: "workspace.catalog"}}
	handler.HandleDecideProposal(c)
	if recorder.Code != http.StatusCreated || string(fake.source) != source || strings.Contains(recorder.Body.String(), "approved") {
		t.Fatalf("approval status=%d source=%q body=%s", recorder.Code, fake.source, recorder.Body.String())
	}
}
