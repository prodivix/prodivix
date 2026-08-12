package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationControlledWorkspaceOwnerLedgerTestRepository struct {
	*evaluationControlledWorkspaceTestRepository
	historyCalls       int
	failSealAfterStore bool
}

func (repository *evaluationControlledWorkspaceOwnerLedgerTestRepository) ListEvaluationControlledWorkspaceOwnerLedgerRecords(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationControlledWorkspaceOwnerLedgerRecord, error) {
	repository.historyCalls++
	record := repository.record
	if record.State != "sealed" || record.AttemptID != attemptID {
		return nil, nil
	}
	return []EvaluationControlledWorkspaceOwnerLedgerRecord{{
		Operation: record.Operation, RequestDigest: record.RequestDigest,
		ResponseBytes: append([]byte(nil), record.ResponseBytes...),
		ClaimedAt:     record.ClaimedAt, SealedAt: record.SealedAt,
	}}, nil
}

func (repository *evaluationControlledWorkspaceOwnerLedgerTestRepository) SealEvaluationControlledAuthorityRequest(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	responseDigest string,
	response []byte,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	record, replayed, err := repository.evaluationControlledWorkspaceTestRepository.SealEvaluationControlledAuthorityRequest(
		ctx, authority, partition, binding, claimGeneration, responseDigest, response, sealedAt,
	)
	if err == nil && repository.failSealAfterStore {
		repository.failSealAfterStore = false
		return record, replayed, context.DeadlineExceeded
	}
	return record, replayed, err
}

func (repository *evaluationControlledWorkspaceOwnerLedgerTestRepository) SealEvaluationControlledWorkspaceStatelessResult(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimGeneration int64,
	stageDigest string,
	dispatchAckDigest string,
	responseDigest string,
	response []byte,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	record, replayed, err := repository.evaluationControlledWorkspaceTestRepository.SealEvaluationControlledWorkspaceStatelessResult(
		ctx, authority, partition, binding, claimGeneration, stageDigest, dispatchAckDigest,
		responseDigest, response, sealedAt,
	)
	if err == nil && repository.failSealAfterStore {
		repository.failSealAfterStore = false
		return record, replayed, context.DeadlineExceeded
	}
	return record, replayed, err
}

func evaluationControlledWorkspaceOwnerLedgerGrantPayload(
	t *testing.T,
	plan evaluationPlanFact,
) map[string]any {
	t.Helper()
	return map[string]any{
		"planDigest": plan.PlanDigest, "attemptId": "evaluation-attempt.owner-ledger",
		"descriptorDigest": controlledWorkspaceDigestFact(t, "owner-ledger.descriptor"),
		"caseId":           "case.owner-ledger",
		"materialDigest":   controlledWorkspaceDigestFact(t, "owner-ledger.material"),
		"access":           map[string]any{},
		"fixture": map[string]any{
			"fixtureDigest":           controlledWorkspaceDigestFact(t, "owner-ledger.fixture"),
			"workspaceSnapshotDigest": controlledWorkspaceDigestFact(t, "owner-ledger.snapshot"),
		},
		"toolRegistryDigest":   controlledWorkspaceDigestFact(t, "owner-ledger.tools"),
		"actionRegistryDigest": controlledWorkspaceDigestFact(t, "owner-ledger.actions"),
		"toolIds":              []any{"tool.read"},
		"actionIds":            []any{},
		"targetRefs":           []any{"target.workspace"},
	}
}

func evaluationControlledWorkspaceOwnerLedgerRequest(
	t *testing.T,
	plan evaluationPlanFact,
	operation string,
	path string,
	payload any,
	ownerResultFacts json.RawMessage,
	mode string,
	dispatchAckDigest string,
) (*http.Request, string, string, string) {
	t.Helper()
	inner := controlledWorkspaceRequest(t, plan, operation, path, payload)
	innerSource, err := io.ReadAll(inner.Body)
	if err != nil {
		t.Fatal(err)
	}
	var innerEnvelope evaluationControlledWorkspaceServiceEnvelope
	if err := decodeEvaluationServiceRawJSON(innerSource, &innerEnvelope); err != nil {
		t.Fatal(err)
	}
	if len(ownerResultFacts) == 0 {
		ownerResultFacts = json.RawMessage("null")
	}
	base := evaluationControlledWorkspaceOwnerLedgerEnvelopeBase{
		Format:  evaluationControlledWorkspaceOwnerLedgerRequestFormat,
		Version: 1, Purpose: evaluationControlledWorkspaceOwnerLedgerPurpose,
		Request: json.RawMessage(innerSource), OwnerResultFacts: ownerResultFacts,
	}
	ownerRequestDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	envelope := evaluationControlledWorkspaceOwnerLedgerEnvelope{
		Format: base.Format, Version: base.Version, Purpose: base.Purpose,
		Mode: mode, Request: base.Request, OwnerResultFacts: base.OwnerResultFacts,
		RequestDigest: ownerRequestDigest,
	}
	stageDigest := ""
	ownerImplementationDigest := ""
	if mode != "read" {
		ownerImplementationDigest, _ = (&evaluationControlledWorkspaceTestAuthority{}).ControlledWorkspaceImplementationDigest()
		route, routeErr := evaluationControlledWorkspaceOwnerLedgerRouteFor(
			append([]string{"controlled-workspace-owner"}, strings.Split(path, "/")...),
		)
		if routeErr != nil {
			t.Fatal(routeErr)
		}
		stageDigest, err = evaluationControlledWorkspaceDirectStageDigest(
			evaluationServiceTestNamespace,
			EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
			route, innerEnvelope.RequestDigest, ownerImplementationDigest,
		)
		if err != nil {
			t.Fatal(err)
		}
		envelope.OwnerImplementationDigest = &ownerImplementationDigest
		envelope.StageDigest = &stageDigest
		if mode == "reconcile" {
			envelope.DispatchAckDigest = &dispatchAckDigest
		}
	}
	source, err := canonicaljson.Bytes(envelope)
	if err != nil {
		t.Fatal(err)
	}
	request := authorizedEvaluationServiceRequest(
		http.MethodPost,
		evaluationServiceTestURL(plan, "controlled-workspace-owner/"+path),
		bytes.NewReader(source),
	)
	request.Header.Set(evaluationControlledWorkspaceOwnerLedgerPurposeHeader, evaluationControlledWorkspaceOwnerLedgerPurpose)
	request.Header.Set("Idempotency-Key", ownerRequestDigest)
	return request, innerEnvelope.RequestDigest, stageDigest, ownerImplementationDigest
}

func TestEvaluationControlledWorkspaceOwnerLedgerSealsAndReplaysAfterACKLoss(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	base := &evaluationControlledWorkspaceTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	repository := &evaluationControlledWorkspaceOwnerLedgerTestRepository{
		evaluationControlledWorkspaceTestRepository: base,
		failSealAfterStore:                          true,
	}
	handler := controlledWorkspaceTestHandler(
		t, base, nil, &evaluationControlledWorkspaceTestScanner{},
	)
	// The handler owns the wrapper repository in production; replace the test
	// composition with that same repository while retaining the canonical clock.
	handler.repository = repository
	payload := evaluationControlledWorkspaceOwnerLedgerGrantPayload(t, plan)
	if _, err := evaluationControlledWorkspaceOwnerLedgerGrant(
		payload, controlledWorkspaceDigestFact(t, "owner-ledger.request"), time.Now().UTC(), nil,
	); err != nil {
		t.Fatalf("direct grant projection invalid: %v", err)
	}

	firstRequest, innerRequestDigest, stageDigest, ownerImplementationDigest := evaluationControlledWorkspaceOwnerLedgerRequest(
		t, plan, "grant.issue", "grants/issue", payload, nil, "execute", "",
	)
	repository.record = EvaluationControlledAuthorityRequestRecord{
		PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
		EvaluationControlledAuthorityRequestBinding: EvaluationControlledAuthorityRequestBinding{
			ServiceKind: "controlled-workspace", Operation: "grant.issue", RouteBinding: "grants/issue",
			RequestDigest: innerRequestDigest, AttemptID: "evaluation-attempt.owner-ledger",
			OwnerImplementationDigest: ownerImplementationDigest,
		},
		State: "dispatched", ClaimGeneration: 1, StageDigest: stageDigest,
		ClaimedAt: time.Now().UTC(), DispatchedAt: time.Now().UTC(),
	}
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, firstRequest)
	if first.Code != http.StatusServiceUnavailable || repository.sealCalls != 1 ||
		repository.record.State != "sealed" || len(repository.record.ResponseBytes) == 0 {
		t.Fatalf("post-seal ACK loss drifted: status=%d seals=%d state=%s body=%s",
			first.Code, repository.sealCalls, repository.record.State, first.Body.String())
	}

	retryRequest, _, _, _ := evaluationControlledWorkspaceOwnerLedgerRequest(
		t, plan, "grant.issue", "grants/issue", payload, nil, "reconcile", repository.record.DispatchAckDigest,
	)
	retry := httptest.NewRecorder()
	handler.ServeHTTP(retry, retryRequest)
	if retry.Code != http.StatusOK || repository.sealCalls != 1 {
		t.Fatalf("sealed replay drifted: status=%d seals=%d body=%s", retry.Code, repository.sealCalls, retry.Body.String())
	}
	result, decodeErr := decodeCanonicalEvaluationObject(retry.Body.Bytes(), maximumEvaluationControlledAuthorityResponseBytes)
	if decodeErr != nil || stringMember(result, "format") != evaluationControlledWorkspaceOwnerLedgerResultFormat ||
		stringMember(result, "mode") != "reconcile" || stringMember(result, "dispatchAckDigest") != repository.record.DispatchAckDigest ||
		stringMember(result, "ownerImplementationDigest") != ownerImplementationDigest ||
		stringMember(result, "stageDigest") != stageDigest || result["reconciled"] != true {
		t.Fatalf("direct grant acknowledgement drifted: %#v err=%v", result, decodeErr)
	}
}

func TestEvaluationControlledWorkspaceOwnerLedgerRejectsPurposeAndRecomputedFactSwapBeforeJournal(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	base := &evaluationControlledWorkspaceTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	repository := &evaluationControlledWorkspaceOwnerLedgerTestRepository{
		evaluationControlledWorkspaceTestRepository: base,
	}
	handler := controlledWorkspaceTestHandler(t, base, nil, &evaluationControlledWorkspaceTestScanner{})
	handler.repository = repository
	payload := evaluationControlledWorkspaceOwnerLedgerGrantPayload(t, plan)

	wrongPurpose, _, _, _ := evaluationControlledWorkspaceOwnerLedgerRequest(
		t, plan, "grant.issue", "grants/issue", payload, nil, "execute", "",
	)
	wrongPurpose.Header.Set(evaluationControlledWorkspaceOwnerLedgerPurposeHeader, "verification-evidence-owner")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, wrongPurpose)
	if response.Code != http.StatusForbidden || repository.claimCalls != 0 || repository.authorizeCalls != 0 {
		t.Fatalf("wrong purpose reached journal: status=%d claim=%d authorize=%d",
			response.Code, repository.claimCalls, repository.authorizeCalls)
	}

	emptyFacts, err := canonicaljson.Bytes([]any{})
	if err != nil {
		t.Fatal(err)
	}
	recomputedSwap, _, _, _ := evaluationControlledWorkspaceOwnerLedgerRequest(
		t, plan, "grant.issue", "grants/issue", payload, json.RawMessage(emptyFacts), "execute", "",
	)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, recomputedSwap)
	if response.Code != http.StatusBadRequest || repository.claimCalls != 0 || repository.authorizeCalls != 0 {
		t.Fatalf("recomputed owner fact swap reached journal: status=%d claim=%d authorize=%d body=%s",
			response.Code, repository.claimCalls, repository.authorizeCalls, response.Body.String())
	}
}

func TestEvaluationControlledWorkspaceOwnerLedgerHealthPinsStatelessContract(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	base := &evaluationControlledWorkspaceTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	repository := &evaluationControlledWorkspaceOwnerLedgerTestRepository{
		evaluationControlledWorkspaceTestRepository: base,
	}
	handler := controlledWorkspaceTestHandler(t, base, nil, &evaluationControlledWorkspaceTestScanner{})
	handler.repository = repository
	request := authorizedEvaluationServiceRequest(
		http.MethodGet,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/controlled-workspace-owner/health",
		bytes.NewReader(nil),
	)
	request.Header.Set(evaluationControlledWorkspaceOwnerLedgerPurposeHeader, evaluationControlledWorkspaceOwnerLedgerPurpose)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("health failed: status=%d body=%s", response.Code, response.Body.String())
	}
	var health struct {
		Format               string `json:"format"`
		Version              int64  `json:"version"`
		Purpose              string `json:"purpose"`
		Status               string `json:"status"`
		AuthorityID          string `json:"authorityId"`
		ImplementationDigest string `json:"implementationDigest"`
		MaximumRequestBytes  int64  `json:"maximumRequestBytes"`
		MaximumResponseBytes int64  `json:"maximumResponseBytes"`
		MaximumFacts         int64  `json:"maximumFacts"`
	}
	if err := decodeEvaluationServiceRawJSON(response.Body.Bytes(), &health); err != nil {
		t.Fatal(err)
	}
	digest, err := evaluationControlledWorkspaceOwnerLedgerImplementationDigest()
	if err != nil || health.Format != evaluationControlledWorkspaceOwnerLedgerHealthFormat ||
		health.Version != 1 || health.Purpose != evaluationControlledWorkspaceOwnerLedgerPurpose ||
		health.Status != "ready" || health.AuthorityID != evaluationControlledWorkspaceOwnerLedgerAuthorityID ||
		health.ImplementationDigest != digest ||
		digest != "sha256-04ba8faf3ff8ad0794ef9e7543d956c9c6e03b70f75cf7f4270b242e40321fb5" ||
		health.MaximumRequestBytes != maximumEvaluationControlledWorkspaceOwnerLedgerRequestBytes ||
		health.MaximumResponseBytes != maximumEvaluationControlledAuthorityResponseBytes ||
		health.MaximumFacts != maximumEvaluationControlledWorkspaceFacts {
		t.Fatalf("health contract drifted: %#v err=%v", health, err)
	}
}
