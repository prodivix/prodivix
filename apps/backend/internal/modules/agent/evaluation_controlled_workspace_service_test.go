package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationControlledWorkspaceTestRepository struct {
	*evaluationServiceFakeRepository
	record         EvaluationControlledAuthorityRequestRecord
	claimCalls     int
	dispatchCalls  int
	sealCalls      int
	authorizeCalls int
	dispatchError  error
}

func (repository *evaluationControlledWorkspaceTestRepository) AuthorizeEvaluationControlledWorkspaceRequest(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
) error {
	repository.authorizeCalls++
	return nil
}

func (repository *evaluationControlledWorkspaceTestRepository) ClaimEvaluationControlledAuthorityRequest(
	_ context.Context,
	_ EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.claimCalls++
	if repository.record.State == "" {
		repository.record = EvaluationControlledAuthorityRequestRecord{
			PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
			EvaluationControlledAuthorityRequestBinding: binding,
			State: "claimed", ClaimGeneration: 1, ClaimedAt: claimedAt,
		}
	}
	return repository.record, repository.claimCalls == 1, nil
}

func (repository *evaluationControlledWorkspaceTestRepository) MarkEvaluationControlledAuthorityDispatched(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.dispatchCalls++
	if repository.dispatchError != nil {
		err := repository.dispatchError
		repository.dispatchError = nil
		return repository.record, false, err
	}
	if repository.record.State == "claimed" {
		repository.record.State = "dispatched"
		repository.record.DispatchedAt = dispatchedAt
	}
	return repository.record, repository.dispatchCalls > 1, nil
}

func (repository *evaluationControlledWorkspaceTestRepository) SealEvaluationControlledAuthorityRequest(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	responseDigest string,
	response []byte,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.sealCalls++
	if repository.record.State != "dispatched" {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	repository.record.State = "sealed"
	repository.record.ResponseDigest = responseDigest
	repository.record.ResponseBytes = append([]byte(nil), response...)
	repository.record.SealedAt = sealedAt
	return repository.record, false, nil
}

func (repository *evaluationControlledWorkspaceTestRepository) GetEvaluationControlledWorkspaceStatelessRequest(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
) (EvaluationControlledAuthorityRequestRecord, error) {
	if repository.record.State == "" {
		return EvaluationControlledAuthorityRequestRecord{}, ErrNotFound
	}
	return repository.record, nil
}

func (repository *evaluationControlledWorkspaceTestRepository) StageEvaluationControlledWorkspaceStatelessDispatch(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.dispatchCalls++
	if repository.dispatchError != nil {
		err := repository.dispatchError
		repository.dispatchError = nil
		return repository.record, false, err
	}
	if repository.record.State == "claimed" {
		repository.record.State = "dispatched"
		repository.record.StageDigest = stageDigest
		repository.record.DispatchedAt = dispatchedAt
	}
	if repository.record.StageDigest != stageDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	return repository.record, repository.dispatchCalls > 1, nil
}

func (repository *evaluationControlledWorkspaceTestRepository) SealEvaluationControlledWorkspaceStatelessResult(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	stageDigest string,
	dispatchAckDigest string,
	responseDigest string,
	response []byte,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.sealCalls++
	if repository.record.State != "dispatched" || repository.record.StageDigest != stageDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	repository.record.State = "sealed"
	repository.record.ResponseDigest = responseDigest
	repository.record.ResponseBytes = append([]byte(nil), response...)
	repository.record.DispatchAckDigest = dispatchAckDigest
	repository.record.SealedAt = sealedAt
	return repository.record, false, nil
}

type evaluationControlledWorkspaceTestAuthority struct {
	readFacts      [][]json.RawMessage
	executeFacts   []json.RawMessage
	reconcileFacts []json.RawMessage
	readCalls      int
	executeCalls   int
	reconcileCalls int
	durableEffects map[string][]json.RawMessage
	effectCalls    int
}

func (authority *evaluationControlledWorkspaceTestAuthority) ControlledWorkspaceImplementationDigest() (string, bool) {
	digest, err := canonicaljson.Digest(map[string]any{
		"format":  "prodivix.agent-evaluation-controlled-workspace-test-owner-implementation",
		"version": int64(1),
	})
	return digest, err == nil
}

func (authority *evaluationControlledWorkspaceTestAuthority) ReadControlledWorkspace(
	_ context.Context,
	_ EvaluationControlledWorkspaceAuthorityRequest,
) ([]json.RawMessage, error) {
	index := authority.readCalls
	authority.readCalls++
	if index >= len(authority.readFacts) {
		return nil, ErrNotFound
	}
	return authority.readFacts[index], nil
}

func (authority *evaluationControlledWorkspaceTestAuthority) ExecuteControlledWorkspace(
	_ context.Context,
	request EvaluationControlledWorkspaceAuthorityRequest,
) ([]json.RawMessage, error) {
	authority.executeCalls++
	if authority.durableEffects != nil {
		if facts, ok := authority.durableEffects[request.RequestDigest]; ok {
			return facts, nil
		}
		authority.effectCalls++
		authority.durableEffects[request.RequestDigest] = authority.executeFacts
	}
	return authority.executeFacts, nil
}

func (authority *evaluationControlledWorkspaceTestAuthority) ReconcileControlledWorkspace(
	_ context.Context,
	_ EvaluationControlledWorkspaceAuthorityRequest,
) ([]json.RawMessage, bool, error) {
	authority.reconcileCalls++
	return authority.reconcileFacts, true, nil
}

type evaluationControlledWorkspaceTestScanner struct {
	denied []byte
	calls  int
}

func (scanner *evaluationControlledWorkspaceTestScanner) ScanControlledWorkspacePublicResponse(
	_ context.Context,
	_ string,
	_ string,
	source []byte,
) error {
	scanner.calls++
	if len(scanner.denied) != 0 && bytes.Contains(source, scanner.denied) {
		return ErrUnauthorized
	}
	return nil
}

func controlledWorkspaceTestHandler(
	t *testing.T,
	repository *evaluationControlledWorkspaceTestRepository,
	authority EvaluationControlledWorkspaceAuthority,
	scanner EvaluationControlledWorkspacePublicResponseScanner,
) *EvaluationServiceHandler {
	t.Helper()
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		ControlledWorkspaceAuthority: authority, ControlledWorkspaceResponseScanner: scanner,
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func controlledWorkspaceRequest(
	t *testing.T,
	plan evaluationPlanFact,
	operation string,
	path string,
	payload any,
) *http.Request {
	t.Helper()
	base := map[string]any{
		"format":    evaluationControlledWorkspaceServiceFormat,
		"version":   evaluationControlledWorkspaceServiceVersion,
		"operation": operation, "namespaceId": evaluationServiceTestNamespace,
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"payload": payload,
	}
	requestDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	value := cloneEvaluationObject(base)
	value["requestDigest"] = requestDigest
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	request := authorizedEvaluationServiceRequest(
		http.MethodPost,
		evaluationServiceTestURL(plan, "controlled-workspace/"+path),
		bytes.NewReader(source),
	)
	request.Header.Set("Idempotency-Key", requestDigest)
	return request
}

func controlledWorkspaceDigestFact(t *testing.T, label string) string {
	t.Helper()
	return evaluationServiceTestDigest(t, label)
}

func controlledWorkspaceGrantTestValue(
	t *testing.T,
	planDigest string,
	attemptID string,
	descriptorDigest string,
	caseID string,
) map[string]any {
	t.Helper()
	now := time.Now().UTC()
	base := map[string]any{
		"format": "prodivix.agent-evaluation-controlled-workspace-grant", "version": int64(1),
		"grantId": "grant." + attemptID, "authorityId": "authority.controlled-workspace",
		"planDigest": planDigest, "attemptId": attemptID, "descriptorDigest": descriptorDigest,
		"caseId": caseID, "materialDigest": controlledWorkspaceDigestFact(t, "material."+attemptID),
		"fixtureDigest":        controlledWorkspaceDigestFact(t, "fixture."+attemptID),
		"baseSnapshotDigest":   controlledWorkspaceDigestFact(t, "snapshot."+attemptID),
		"toolRegistryDigest":   controlledWorkspaceDigestFact(t, "tools."+attemptID),
		"actionRegistryDigest": controlledWorkspaceDigestFact(t, "actions."+attemptID),
		"allowedToolIds":       []any{"tool.read"}, "allowedActionIds": []any{},
		"allowedTargetRefs": []any{"target.workspace"}, "generation": int64(1),
		"maximumUses": int64(1), "issuedAt": now.Add(-time.Minute).Format(time.RFC3339Nano),
		"expiresAt": now.Add(time.Hour).Format(time.RFC3339Nano),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["grantDigest"] = digest
	return base
}

func controlledWorkspaceGrantAcknowledgementBytes(
	t *testing.T,
	requestDigest string,
	grant map[string]any,
) []byte {
	t.Helper()
	base := map[string]any{
		"format":    evaluationControlledWorkspaceServiceFormat,
		"version":   evaluationControlledWorkspaceServiceVersion,
		"operation": "grant.issue", "requestDigest": requestDigest,
		"facts": []any{grant},
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["receiptDigest"] = receiptDigest
	encoded, err := canonicaljson.Bytes(base)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func controlledWorkspaceOrphanFact(t *testing.T, plan evaluationPlanFact, label string) json.RawMessage {
	t.Helper()
	digest := controlledWorkspaceDigestFact(t, label)
	value := map[string]any{
		"planDigest": plan.PlanDigest, "attemptId": "evaluation-attempt:" + label,
		"modelDescriptorDigest": digest, "caseId": "case." + label, "materialDigest": digest,
		"grantDigest": digest, "generation": int64(1), "sessionId": "session." + label,
		"currentCheckpoint": controlledWorkspaceCheckpointValue(
			t, "evaluation-attempt:"+label, digest, 1, label,
		),
	}
	receiptDigest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value["orphanReceiptDigest"] = receiptDigest
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return source
}

func controlledWorkspaceCheckpointValue(
	t *testing.T,
	attemptID string,
	grantDigest string,
	generation int64,
	label string,
) map[string]any {
	t.Helper()
	base := map[string]any{
		"checkpointRef": "checkpoint." + label, "attemptId": attemptID,
		"grantDigest": grantDigest, "generation": generation,
		"snapshotDigest":                 controlledWorkspaceDigestFact(t, "snapshot."+label),
		"securePersistenceReceiptDigest": controlledWorkspaceDigestFact(t, "persistence."+label),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["checkpointDigest"] = digest
	return base
}

func controlledWorkspaceAttemptStateFact(t *testing.T, label string, aggregate int64) json.RawMessage {
	t.Helper()
	digest := controlledWorkspaceDigestFact(t, label)
	value := map[string]any{
		"attemptId": "evaluation-attempt:" + label, "grantDigest": digest, "generation": int64(1),
		"currentCheckpoint": controlledWorkspaceCheckpointValue(
			t, "evaluation-attempt:"+label, digest, 1, label,
		),
		"toolExecutionReceiptDigests": []any{}, "aggregateToolResultBytes": aggregate,
		"repairRoundCount": int64(0), "completedTurnIndexes": []any{},
	}
	receiptDigest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value["stateReceiptDigest"] = receiptDigest
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return source
}

func TestControlledWorkspaceAndVerificationRoutesFailClosedWithoutAuthorities(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationServiceFakeRepository{plan: plan}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	for _, suffix := range []string{
		"controlled-workspace/sessions/orphans/list",
		"verification-evidence/sandboxes/evaluation-attempt.test",
	} {
		method := http.MethodPost
		if bytes.Contains([]byte(suffix), []byte("sandboxes")) {
			method = http.MethodPut
		}
		request := authorizedEvaluationServiceRequest(
			method, evaluationServiceTestURL(plan, suffix), bytes.NewReader([]byte(`{}`)),
		)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusServiceUnavailable ||
			!bytes.Contains(response.Body.Bytes(), []byte(`"code":"EVAL-9001"`)) {
			t.Fatalf("%s status=%d body=%s", suffix, response.Code, response.Body.String())
		}
	}
	if repository.getCalls != 0 {
		t.Fatalf("disabled authority touched durable plan %d times", repository.getCalls)
	}
}

func TestControlledWorkspaceReadModelsRemainFresh(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationControlledWorkspaceTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	authority := &evaluationControlledWorkspaceTestAuthority{readFacts: [][]json.RawMessage{
		{}, {controlledWorkspaceOrphanFact(t, plan, "fresh")},
	}}
	handler := controlledWorkspaceTestHandler(t, repository, authority, &evaluationControlledWorkspaceTestScanner{})
	for call := 0; call < 2; call++ {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, controlledWorkspaceRequest(
			t, plan, "session.orphans.list", "sessions/orphans/list", map[string]any{},
		))
		if response.Code != http.StatusOK {
			t.Fatalf("read %d status=%d body=%s", call, response.Code, response.Body.String())
		}
		var ack struct {
			Facts []json.RawMessage `json:"facts"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &ack); err != nil || len(ack.Facts) != call {
			t.Fatalf("read %d ack=%s err=%v", call, response.Body.String(), err)
		}
	}
	if authority.readCalls != 2 || repository.claimCalls != 0 {
		t.Fatalf("fresh reads=%d journal claims=%d", authority.readCalls, repository.claimCalls)
	}
}

func TestControlledWorkspaceAttemptStateReadAdvancesWithoutJournalReplay(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	digest := controlledWorkspaceDigestFact(t, "state")
	payload := map[string]any{
		"attemptId": "evaluation-attempt:state", "grantDigest": digest, "generation": int64(1),
	}
	repository := &evaluationControlledWorkspaceTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	authority := &evaluationControlledWorkspaceTestAuthority{readFacts: [][]json.RawMessage{
		{controlledWorkspaceAttemptStateFact(t, "state", 1)},
		{controlledWorkspaceAttemptStateFact(t, "state", 2)},
	}}
	handler := controlledWorkspaceTestHandler(t, repository, authority, &evaluationControlledWorkspaceTestScanner{})
	for _, want := range []string{`"aggregateToolResultBytes":1`, `"aggregateToolResultBytes":2`} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, controlledWorkspaceRequest(
			t, plan, "operation.attempt-state.load", "operations/attempt-state/load", payload,
		))
		if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(want)) {
			t.Fatalf("want %s status=%d body=%s", want, response.Code, response.Body.String())
		}
	}
	if repository.claimCalls != 0 {
		t.Fatalf("state reads entered journal %d times", repository.claimCalls)
	}
}

func TestControlledWorkspaceScannerBlocksCanariesAndUnexpectedFactsBeforeSeal(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	digest := controlledWorkspaceDigestFact(t, "artifact")
	payload := map[string]any{
		"sessionId": "session.artifact", "attemptId": "evaluation-attempt.artifact",
		"grantDigest": digest, "generation": int64(1), "value": map[string]any{},
	}
	for _, denied := range []string{"credential-canary", "protected-canary"} {
		fact, err := canonicaljson.Bytes(map[string]any{
			"artifactKind": "screenshot", "artifactRef": denied, "artifactDigest": digest,
			"byteLength": int64(1), "persistenceReceiptDigest": digest,
		})
		if err != nil {
			t.Fatal(err)
		}
		repository := &evaluationControlledWorkspaceTestRepository{
			evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		}
		authority := &evaluationControlledWorkspaceTestAuthority{executeFacts: []json.RawMessage{fact}}
		handler := controlledWorkspaceTestHandler(
			t, repository, authority, &evaluationControlledWorkspaceTestScanner{denied: []byte(denied)},
		)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, controlledWorkspaceRequest(
			t, plan, "session.artifact.resolve", "sessions/session.artifact/artifacts/resolve", payload,
		))
		if response.Code != http.StatusForbidden || repository.sealCalls != 0 {
			t.Fatalf("%s status=%d seals=%d body=%s", denied, response.Code, repository.sealCalls, response.Body.String())
		}
	}
	fact, err := canonicaljson.Bytes(map[string]any{
		"artifactKind": "screenshot", "artifactRef": "artifact.safe", "artifactDigest": digest,
		"byteLength": int64(1), "persistenceReceiptDigest": digest, "unexpectedMaterial": "public-looking",
	})
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationControlledWorkspaceTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	handler := controlledWorkspaceTestHandler(t, repository,
		&evaluationControlledWorkspaceTestAuthority{executeFacts: []json.RawMessage{fact}},
		&evaluationControlledWorkspaceTestScanner{},
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, controlledWorkspaceRequest(
		t, plan, "session.artifact.resolve", "sessions/session.artifact/artifacts/resolve", payload,
	))
	if response.Code != http.StatusBadRequest || repository.sealCalls != 0 {
		t.Fatalf("unexpected fact status=%d seals=%d body=%s", response.Code, repository.sealCalls, response.Body.String())
	}
}

func TestProductionScannerBlocksDeepCanariesBeforeControlledResponsePersistence(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	credentialCanary := []byte("credential-canary-production-0001")
	protectedCanary := []byte("protected-canary-production-0002")
	scanner, err := NewEvaluationPublicResponseScanner(EvaluationPublicResponseScannerConfig{
		CredentialCanaries:        [][]byte{credentialCanary},
		SecretCanaries:            [][]byte{[]byte("secret-canary-production-0003")},
		ProtectedMaterialCanaries: [][]byte{protectedCanary},
	})
	if err != nil {
		t.Fatal(err)
	}
	digest := controlledWorkspaceDigestFact(t, "deep-scan")
	payload := map[string]any{
		"sessionId": "session.deep-scan", "attemptId": "evaluation-attempt.deep-scan",
		"grantDigest": digest, "generation": int64(1),
		"value": map[string]any{
			"intentDigest": digest, "dispatchReceiptDigest": digest,
		},
	}
	for _, test := range []struct {
		name      string
		result    any
		artifacts []any
	}{
		{name: "facts-result-arbitrary-depth", result: map[string]any{
			"outer": []any{map[string]any{"inner": string(protectedCanary)}},
		}, artifacts: []any{}},
		{name: "artifact-arbitrary-depth", result: map[string]any{}, artifacts: []any{
			map[string]any{"artifact": map[string]any{"metadata": string(credentialCanary)}},
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			factValue := map[string]any{
				"intentDigest": digest, "dispatchReceiptDigest": digest,
				"grantDigest": digest, "generation": int64(1), "status": "succeeded",
				"effectKind": "read", "result": test.result,
				"snapshotBeforeDigest": digest, "snapshotAfterDigest": digest,
				"canonicalWriteObserved": false, "persistedArtifacts": test.artifacts,
				"commandReceiptDigests": []any{}, "transactionReceiptDigests": []any{},
				"authorityReceiptDigests": []any{}, "repairRoundCount": int64(0),
				"changedDocumentIds": []any{},
				"checkpoint": controlledWorkspaceCheckpointValue(
					t, "evaluation-attempt.deep-scan", digest, 1, "deep-scan",
				),
				"publicScan": map[string]any{
					"safe": true, "scanReceiptDigest": digest,
				},
				"effectReceiptDigest": digest,
			}
			fact, err := canonicaljson.Bytes(factValue)
			if err != nil {
				t.Fatal(err)
			}
			repository := &evaluationControlledWorkspaceTestRepository{
				evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
			}
			handler := controlledWorkspaceTestHandler(t, repository,
				&evaluationControlledWorkspaceTestAuthority{executeFacts: []json.RawMessage{fact}}, scanner,
			)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, controlledWorkspaceRequest(
				t, plan, "session.execute", "sessions/session.deep-scan/execute", payload,
			))
			if response.Code != http.StatusForbidden || repository.sealCalls != 0 || len(repository.record.ResponseBytes) != 0 {
				t.Fatalf("status=%d seals=%d persisted=%d body=%s",
					response.Code, repository.sealCalls, len(repository.record.ResponseBytes), response.Body.String())
			}
		})
	}
}

func TestControlledWorkspaceRejectsNestedSessionAndCheckpointBindingSwaps(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	attemptID := "evaluation-attempt.nested-binding"
	descriptorDigest := controlledWorkspaceDigestFact(t, "nested-descriptor")
	grant := controlledWorkspaceGrantTestValue(
		t, plan.PlanDigest, attemptID, descriptorDigest, "case.nested-binding",
	)
	grantDigest := stringMember(grant, "grantDigest")
	isolationDigest := controlledWorkspaceDigestFact(t, "nested-isolation")
	payloadValue := map[string]any{
		"material": map[string]any{}, "fixture": map[string]any{}, "grant": grant,
		"isolationPolicyDigest": isolationDigest,
	}
	payload, err := canonicaljson.Bytes(payloadValue)
	if err != nil {
		t.Fatal(err)
	}
	buildAttachment := func() map[string]any {
		initial := controlledWorkspaceCheckpointValue(t, attemptID, grantDigest, 1, "nested-initial")
		initial["snapshotDigest"] = stringMember(grant, "baseSnapshotDigest")
		base := cloneEvaluationObject(initial)
		delete(base, "checkpointDigest")
		initial["checkpointDigest"], _ = canonicaljson.Digest(base)
		current := controlledWorkspaceCheckpointValue(t, attemptID, grantDigest, 1, "nested-current")
		session := map[string]any{
			"sessionId": "session.nested-binding", "planDigest": plan.PlanDigest,
			"attemptId": attemptID, "descriptorDigest": descriptorDigest,
			"caseId": stringMember(grant, "caseId"), "materialDigest": stringMember(grant, "materialDigest"),
			"fixtureDigest":      stringMember(grant, "fixtureDigest"),
			"baseSnapshotDigest": stringMember(grant, "baseSnapshotDigest"),
			"grantDigest":        grantDigest, "toolRegistryDigest": stringMember(grant, "toolRegistryDigest"),
			"actionRegistryDigest": stringMember(grant, "actionRegistryDigest"),
			"generation":           int64(1), "isolationPolicyDigest": isolationDigest,
			"initialCheckpoint": initial, "currentCheckpoint": current,
		}
		return map[string]any{
			"status": "loaded", "session": session, "sessionId": "session.nested-binding",
			"attemptId": attemptID, "grantDigest": grantDigest, "generation": int64(1),
			"currentCheckpointDigest": stringMember(current, "checkpointDigest"),
			"attachmentReceiptDigest": controlledWorkspaceDigestFact(t, "nested-attachment"),
		}
	}
	for _, test := range []struct {
		name  string
		field string
		value any
	}{
		{name: "attempt", field: "attemptId", value: "evaluation-attempt.swapped"},
		{name: "descriptor", field: "descriptorDigest", value: controlledWorkspaceDigestFact(t, "swapped-descriptor")},
		{name: "case", field: "caseId", value: "case.swapped"},
		{name: "material", field: "materialDigest", value: controlledWorkspaceDigestFact(t, "swapped-material")},
		{name: "grant", field: "grantDigest", value: controlledWorkspaceDigestFact(t, "swapped-grant")},
		{name: "generation", field: "generation", value: int64(2)},
		{name: "session", field: "sessionId", value: "session.swapped"},
	} {
		t.Run(test.name, func(t *testing.T) {
			attachment := buildAttachment()
			session, _ := objectMember(attachment, "session")
			session[test.field] = test.value
			fact, err := canonicaljson.Bytes(attachment)
			if err != nil {
				t.Fatal(err)
			}
			if err := validateControlledWorkspaceFacts(
				plan.PlanDigest, "session.load-or-reattach", payload, []json.RawMessage{fact},
			); !errors.Is(err, ErrConflict) {
				t.Fatalf("nested %s swap err=%v, want conflict", test.field, err)
			}
		})
	}

	digest := controlledWorkspaceDigestFact(t, "nested-effect")
	executePayloadValue := map[string]any{
		"sessionId": "session.nested-effect", "attemptId": "evaluation-attempt.nested-effect",
		"grantDigest": digest, "generation": int64(1),
		"value": map[string]any{"intentDigest": digest, "dispatchReceiptDigest": digest},
	}
	executePayload, err := canonicaljson.Bytes(executePayloadValue)
	if err != nil {
		t.Fatal(err)
	}
	effect := map[string]any{
		"intentDigest": digest, "dispatchReceiptDigest": digest, "grantDigest": digest,
		"generation": int64(1), "status": "succeeded", "effectKind": "read", "result": map[string]any{},
		"snapshotBeforeDigest": digest, "snapshotAfterDigest": digest, "canonicalWriteObserved": false,
		"persistedArtifacts": []any{}, "commandReceiptDigests": []any{}, "transactionReceiptDigests": []any{},
		"authorityReceiptDigests": []any{}, "repairRoundCount": int64(0), "changedDocumentIds": []any{},
		"checkpoint": controlledWorkspaceCheckpointValue(
			t, "evaluation-attempt.swapped-checkpoint", digest, 1, "swapped-checkpoint",
		),
		"publicScan": map[string]any{"safe": true}, "effectReceiptDigest": digest,
	}
	effectBytes, err := canonicaljson.Bytes(effect)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateControlledWorkspaceFacts(
		plan.PlanDigest, "session.execute", executePayload, []json.RawMessage{effectBytes},
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("nested checkpoint attempt swap err=%v, want conflict", err)
	}
}

func TestControlledWorkspaceCrashWindowsUseDispatchCAS(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	digest := controlledWorkspaceDigestFact(t, "restore")
	payload := map[string]any{
		"sessionId": "session.restore", "attemptId": "evaluation-attempt.restore",
		"grantDigest": digest, "generation": int64(1),
		"value": map[string]any{"checkpointDigest": digest},
	}
	fact, err := canonicaljson.Bytes(map[string]any{
		"status": "restored", "checkpointDigest": digest, "restorationReceiptDigest": digest,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name          string
		initialState  string
		wantStatus    int
		wantExecute   int
		wantReconcile int
		wantSeals     int
	}{
		{name: "claim-ack-before-dispatch", initialState: "claimed", wantStatus: http.StatusOK, wantExecute: 1, wantSeals: 1},
		{name: "dispatch-ack-before-seal", initialState: "dispatched", wantStatus: http.StatusServiceUnavailable},
	} {
		t.Run(test.name, func(t *testing.T) {
			repository := &evaluationControlledWorkspaceTestRepository{
				evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
				record: EvaluationControlledAuthorityRequestRecord{
					State: test.initialState, ClaimGeneration: 1, DispatchedAt: time.Now().UTC(),
				},
			}
			authority := &evaluationControlledWorkspaceTestAuthority{
				executeFacts: []json.RawMessage{fact}, reconcileFacts: []json.RawMessage{fact},
			}
			handler := controlledWorkspaceTestHandler(t, repository, authority, &evaluationControlledWorkspaceTestScanner{})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, controlledWorkspaceRequest(
				t, plan, "session.restore-checkpoint", "sessions/session.restore/restore-checkpoint", payload,
			))
			if response.Code != test.wantStatus || authority.executeCalls != test.wantExecute ||
				authority.reconcileCalls != test.wantReconcile || repository.sealCalls != test.wantSeals {
				t.Fatalf("status=%d execute=%d reconcile=%d seals=%d body=%s",
					response.Code, authority.executeCalls, authority.reconcileCalls, repository.sealCalls, response.Body.String())
			}
		})
	}
}

func TestControlledWorkspaceCrashAfterOwnerEffectUsesOwnerDurableIdempotency(t *testing.T) {
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	digest := controlledWorkspaceDigestFact(t, "restore-owner-cas")
	payload := map[string]any{
		"sessionId": "session.restore-owner-cas", "attemptId": "evaluation-attempt.restore-owner-cas",
		"grantDigest": digest, "generation": int64(1),
		"value": map[string]any{"checkpointDigest": digest},
	}
	fact, err := canonicaljson.Bytes(map[string]any{
		"status": "restored", "checkpointDigest": digest,
		"restorationReceiptDigest": controlledWorkspaceDigestFact(t, "restoration-owner-cas"),
	})
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationControlledWorkspaceTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		dispatchError:                   errors.New("simulated mark-dispatched acknowledgement loss"),
	}
	authority := &evaluationControlledWorkspaceTestAuthority{
		executeFacts: []json.RawMessage{fact}, durableEffects: make(map[string][]json.RawMessage),
	}
	handler := controlledWorkspaceTestHandler(t, repository, authority, &evaluationControlledWorkspaceTestScanner{})
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, controlledWorkspaceRequest(
		t, plan, "session.restore-checkpoint", "sessions/session.restore-owner-cas/restore-checkpoint", payload,
	))
	if first.Code != http.StatusInternalServerError || repository.record.State != "claimed" ||
		authority.effectCalls != 0 {
		t.Fatalf("first status=%d state=%s durable-effects=%d body=%s",
			first.Code, repository.record.State, authority.effectCalls, first.Body.String())
	}
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, controlledWorkspaceRequest(
		t, plan, "session.restore-checkpoint", "sessions/session.restore-owner-cas/restore-checkpoint", payload,
	))
	if second.Code != http.StatusOK || authority.executeCalls != 1 || authority.effectCalls != 1 ||
		repository.record.State != "sealed" || repository.sealCalls != 1 {
		t.Fatalf("second status=%d executes=%d durable-effects=%d state=%s seals=%d body=%s",
			second.Code, authority.executeCalls, authority.effectCalls, repository.record.State,
			repository.sealCalls, second.Body.String())
	}
}

func TestControlledWorkspacePostgreSQLJournalAndPlanGrantFences(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	repositoryA, repositoryB := NewRepository(databaseA), NewRepository(databaseB)
	vector := readEvaluationRepositoryVector(t)
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.controlled-workspace.integration",
		NamespaceID: "evaluation.g4-controlled-workspace",
	}
	_, plan, _ := storeGoldenEvaluationPlan(t, repositoryA, authority, vector.Facts.Plan)
	partition := EvaluationPlanPartition{
		PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil || len(planned) == 0 {
		t.Fatalf("planned attempts=%d err=%v", len(planned), err)
	}
	expected := planned[0]
	grantRequestDigest := controlledWorkspaceDigestFact(t, "pg-grant-request")
	grantBinding := EvaluationControlledAuthorityRequestBinding{
		ServiceKind: "controlled-workspace", Operation: "grant.issue", RouteBinding: "grants/issue",
		RequestDigest:        grantRequestDigest,
		RequestBindingDigest: controlledWorkspaceDigestFact(t, "pg-grant-binding"),
		AttemptID:            expected.AttemptID, DescriptorDigest: expected.DescriptorDigest,
	}
	if err := repositoryA.AuthorizeEvaluationControlledWorkspaceRequest(
		context.Background(), authority, partition, grantBinding,
	); err != nil {
		t.Fatalf("authorize planned grant: %v", err)
	}
	outside := grantBinding
	outside.RequestDigest = controlledWorkspaceDigestFact(t, "pg-outside-request")
	outside.RequestBindingDigest = controlledWorkspaceDigestFact(t, "pg-outside-binding")
	outside.AttemptID = "evaluation-attempt.outside-plan"
	if err := repositoryA.AuthorizeEvaluationControlledWorkspaceRequest(
		context.Background(), authority, partition, outside,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("outside-plan grant error=%v, want conflict", err)
	}
	swappedDescriptor := grantBinding
	swappedDescriptor.RequestDigest = controlledWorkspaceDigestFact(t, "pg-descriptor-request")
	swappedDescriptor.RequestBindingDigest = controlledWorkspaceDigestFact(t, "pg-descriptor-binding")
	swappedDescriptor.DescriptorDigest = controlledWorkspaceDigestFact(t, "descriptor-swap")
	if err := repositoryA.AuthorizeEvaluationControlledWorkspaceRequest(
		context.Background(), authority, partition, swappedDescriptor,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("descriptor-swap grant error=%v, want conflict", err)
	}

	claimedAt := time.Now().UTC().Add(-time.Second)
	claimed, created, err := repositoryA.ClaimEvaluationControlledAuthorityRequest(
		context.Background(), authority, partition, grantBinding, claimedAt,
	)
	if err != nil || !created || claimed.State != "claimed" {
		t.Fatalf("claim=%#v created=%v err=%v", claimed, created, err)
	}
	replayedClaim, created, err := repositoryB.ClaimEvaluationControlledAuthorityRequest(
		context.Background(), authority, partition, grantBinding, claimedAt.Add(time.Millisecond),
	)
	if err != nil || created || replayedClaim.ClaimedAt != claimed.ClaimedAt {
		t.Fatalf("claim replay=%#v created=%v err=%v", replayedClaim, created, err)
	}
	conflicting := grantBinding
	conflicting.RequestBindingDigest = controlledWorkspaceDigestFact(t, "pg-conflicting-binding")
	if _, _, err := repositoryB.ClaimEvaluationControlledAuthorityRequest(
		context.Background(), authority, partition, conflicting, claimedAt,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("conflicting replay error=%v, want conflict", err)
	}
	dispatched, replayed, err := repositoryA.MarkEvaluationControlledAuthorityDispatched(
		context.Background(), authority, partition, grantBinding, claimed.ClaimGeneration, time.Now().UTC(),
	)
	if err != nil || replayed || dispatched.State != "dispatched" {
		t.Fatalf("dispatch=%#v replay=%v err=%v", dispatched, replayed, err)
	}
	if replayedDispatch, replayed, err := repositoryB.MarkEvaluationControlledAuthorityDispatched(
		context.Background(), authority, partition, grantBinding, claimed.ClaimGeneration, time.Now().UTC(),
	); err != nil || !replayed || replayedDispatch.State != "dispatched" {
		t.Fatalf("dispatch replay=%#v replay=%v err=%v", replayedDispatch, replayed, err)
	}
	grant := controlledWorkspaceGrantTestValue(
		t, plan.PlanDigest, expected.AttemptID, expected.DescriptorDigest, expected.CaseID,
	)
	acknowledgement := controlledWorkspaceGrantAcknowledgementBytes(t, grantRequestDigest, grant)
	responseDigest, err := evaluationCanonicalByteDigest(
		acknowledgement, maximumEvaluationControlledAuthorityResponseBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	sealed, replayed, err := repositoryA.SealEvaluationControlledAuthorityRequest(
		context.Background(), authority, partition, grantBinding, claimed.ClaimGeneration,
		responseDigest, acknowledgement, time.Now().UTC(),
	)
	if err != nil || replayed || sealed.State != "sealed" || !bytes.Equal(sealed.ResponseBytes, acknowledgement) {
		t.Fatalf("seal=%#v replay=%v err=%v", sealed, replayed, err)
	}
	if replayedSeal, replayed, err := repositoryB.SealEvaluationControlledAuthorityRequest(
		context.Background(), authority, partition, grantBinding, claimed.ClaimGeneration,
		responseDigest, acknowledgement, time.Now().UTC(),
	); err != nil || !replayed || !bytes.Equal(replayedSeal.ResponseBytes, acknowledgement) {
		t.Fatalf("seal replay=%#v replay=%v err=%v", replayedSeal, replayed, err)
	}

	grantDigest := stringMember(grant, "grantDigest")
	bound := EvaluationControlledAuthorityRequestBinding{
		ServiceKind: "controlled-workspace", Operation: "session.load-or-reattach",
		RouteBinding:         "sessions/load-or-reattach",
		RequestDigest:        controlledWorkspaceDigestFact(t, "pg-session-request"),
		RequestBindingDigest: controlledWorkspaceDigestFact(t, "pg-session-binding"),
		AttemptID:            expected.AttemptID, DescriptorDigest: expected.DescriptorDigest,
		GrantDigest: grantDigest, Generation: 1,
	}
	if err := repositoryA.AuthorizeEvaluationControlledWorkspaceRequest(
		context.Background(), authority, partition, bound,
	); err != nil {
		t.Fatalf("authorize sealed grant: %v", err)
	}
	crossAttempt := bound
	crossAttempt.AttemptID = "evaluation-attempt.cross-attempt"
	crossAttempt.RequestDigest = controlledWorkspaceDigestFact(t, "pg-cross-request")
	crossAttempt.RequestBindingDigest = controlledWorkspaceDigestFact(t, "pg-cross-binding")
	if err := repositoryA.AuthorizeEvaluationControlledWorkspaceRequest(
		context.Background(), authority, partition, crossAttempt,
	); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-attempt grant error=%v, want not found", err)
	}
	crossDescriptor := bound
	crossDescriptor.DescriptorDigest = controlledWorkspaceDigestFact(t, "pg-cross-descriptor")
	crossDescriptor.RequestDigest = controlledWorkspaceDigestFact(t, "pg-cross-descriptor-request")
	crossDescriptor.RequestBindingDigest = controlledWorkspaceDigestFact(t, "pg-cross-descriptor-binding")
	if err := repositoryA.AuthorizeEvaluationControlledWorkspaceRequest(
		context.Background(), authority, partition, crossDescriptor,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("cross-descriptor grant error=%v, want conflict", err)
	}
	crossGrant := bound
	crossGrant.GrantDigest = controlledWorkspaceDigestFact(t, "pg-cross-grant")
	crossGrant.RequestDigest = controlledWorkspaceDigestFact(t, "pg-cross-grant-request")
	crossGrant.RequestBindingDigest = controlledWorkspaceDigestFact(t, "pg-cross-grant-binding")
	if err := repositoryA.AuthorizeEvaluationControlledWorkspaceRequest(
		context.Background(), authority, partition, crossGrant,
	); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-grant error=%v, want not found", err)
	}
}
