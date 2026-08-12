package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationG3CellAdmissionTestRepository struct {
	*evaluationServiceFakeRepository
	record         EvaluationControlledAuthorityRequestRecord
	authorizeCalls int
	claimCalls     int
	dispatchCalls  int
	ackCalls       int
	sealCalls      int
	wantShardID    string
	wantGeneration int64
}

func (repository *evaluationG3CellAdmissionTestRepository) AuthorizeEvaluationG3CellAdmissionGeneration(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	shardID string,
	generation int64,
	_ time.Time,
) error {
	repository.authorizeCalls++
	if shardID != repository.wantShardID || generation != repository.wantGeneration {
		return ErrConflict
	}
	return nil
}

func (repository *evaluationG3CellAdmissionTestRepository) ClaimEvaluationControlledAuthorityRequest(
	_ context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	claimedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.claimCalls++
	if repository.record.State == "" {
		repository.record = EvaluationControlledAuthorityRequestRecord{
			NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest,
			RepositoryCommit: partition.RepositoryCommit, V46Eligible: true,
			EvaluationControlledAuthorityRequestBinding: binding,
			State: "claimed", ClaimGeneration: 1, ClaimedAt: claimedAt,
		}
		return repository.record, true, nil
	}
	if repository.record.RequestBindingDigest != binding.RequestBindingDigest ||
		repository.record.RequestDigest != binding.RequestDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	return repository.record, false, nil
}

func (repository *evaluationG3CellAdmissionTestRepository) MarkEvaluationG3CellAdmissionDispatched(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.dispatchCalls++
	if repository.record.State != "claimed" {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	repository.record.State = "dispatched"
	repository.record.StageDigest = stageDigest
	repository.record.DispatchedAt = dispatchedAt
	return repository.record, false, nil
}

func (repository *evaluationG3CellAdmissionTestRepository) AcknowledgeEvaluationG3CellAdmission(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	responseDigest string,
	responseBytes []byte,
	dispatchAckDigest string,
	_ time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.ackCalls++
	if repository.record.State != "dispatched" || repository.record.StageDigest == "" {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	repository.record.ResponseDigest = responseDigest
	repository.record.ResponseBytes = append([]byte(nil), responseBytes...)
	repository.record.DispatchAckDigest = dispatchAckDigest
	return repository.record, false, nil
}

func (repository *evaluationG3CellAdmissionTestRepository) SealEvaluationG3CellAdmission(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ EvaluationControlledAuthorityRequestBinding,
	_ int64,
	responseDigest string,
	dispatchAckDigest string,
	sealedAt time.Time,
) (EvaluationControlledAuthorityRequestRecord, bool, error) {
	repository.sealCalls++
	if repository.record.State != "dispatched" || repository.record.ResponseDigest != responseDigest ||
		repository.record.DispatchAckDigest != dispatchAckDigest {
		return EvaluationControlledAuthorityRequestRecord{}, false, ErrConflict
	}
	repository.record.State = "sealed"
	repository.record.SealedAt = sealedAt
	return repository.record, false, nil
}

type evaluationG3CellAdmissionTestAuthority struct {
	implementationDigest string
	stageDigest          string
	result               EvaluationG3CellAdmissionAuthorityResult
	stageCalls           int
	executeCalls         int
	reconcileCalls       int
}

func (authority *evaluationG3CellAdmissionTestAuthority) G3CellAdmissionImplementationDigest() (string, bool) {
	return authority.implementationDigest, true
}

func (authority *evaluationG3CellAdmissionTestAuthority) StageG3CellAdmission(
	_ context.Context,
	request EvaluationG3CellAdmissionAuthorityRequest,
) (string, error) {
	authority.stageCalls++
	if request.StageDigest != "" || request.DispatchAckDigest != "" ||
		request.OwnerImplementationDigest != authority.implementationDigest {
		return "", ErrConflict
	}
	return authority.stageDigest, nil
}

func (authority *evaluationG3CellAdmissionTestAuthority) ExecuteG3CellAdmission(
	_ context.Context,
	request EvaluationG3CellAdmissionAuthorityRequest,
) (EvaluationG3CellAdmissionAuthorityResult, error) {
	authority.executeCalls++
	if request.StageDigest != authority.stageDigest || request.DispatchAckDigest != "" ||
		request.OwnerImplementationDigest != authority.implementationDigest {
		return EvaluationG3CellAdmissionAuthorityResult{}, ErrConflict
	}
	return authority.result, nil
}

func (authority *evaluationG3CellAdmissionTestAuthority) ReconcileG3CellAdmission(
	_ context.Context,
	request EvaluationG3CellAdmissionAuthorityRequest,
) (EvaluationG3CellAdmissionAuthorityResult, bool, error) {
	authority.reconcileCalls++
	if request.StageDigest != authority.stageDigest ||
		request.DispatchAckDigest != authority.result.DispatchAckDigest ||
		request.OwnerImplementationDigest != authority.implementationDigest {
		return EvaluationG3CellAdmissionAuthorityResult{}, false, ErrConflict
	}
	return authority.result, true, nil
}

func evaluationG3CellAdmissionTestFixture(
	t *testing.T,
	plan evaluationPlanFact,
) (evaluationG3CellAdmissionRequest, []byte) {
	t.Helper()
	digest := func(label string) string { return evaluationServiceTestDigest(t, label) }
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil || len(planned) == 0 {
		t.Fatalf("planned attempts=%d err=%v", len(planned), err)
	}
	descriptor := planned[0].Descriptor
	adapterDescriptor := map[string]any{
		"id": "adapter.g3-production",
		"implementation": map[string]any{
			"packageName": "@prodivix/verification-browser", "packageVersion": "1.0.0",
			"buildDigest": digest("g3-adapter-build"), "toolchainDigest": digest("g3-toolchain"),
			"schemaDigest": digest("g3-adapter-schema"),
		},
		"checkKinds": []any{"build"}, "surfaces": []any{"preview"}, "targets": []any{"react-vite"},
		"browserEngines": []any{"chromium"}, "controlCapabilities": []any{"deterministic-runtime"},
		"inputKinds": []any{"executable-snapshot"}, "artifactKinds": []any{"build-log"},
		"budgets":     map[string]any{"maximumDurationMs": int64(170_000), "maximumArtifactBytes": int64(1_048_576), "maximumEvents": int64(100)},
		"trustInputs": []any{"local-unattested"},
	}
	descriptorDigest, err := canonicaljson.Digest(adapterDescriptor)
	if err != nil {
		t.Fatal(err)
	}
	capabilityDigest := digest("g3-adapter-capability")
	adapterIdentity := map[string]any{
		"adapterId": "adapter.g3-production", "descriptorDigest": descriptorDigest,
		"toolchainDigest": digest("g3-toolchain"), "capabilityDigest": capabilityDigest,
	}
	cell := map[string]any{
		"id": "cell.g3-build", "checkId": "check.g3-build", "checkKind": "build", "targetId": "target.g3",
		"targetPolicy":    map[string]any{"authority": "canonical-workspace", "policyDigest": digest("g3-target-policy"), "semanticTargetId": "target.g3", "capture": "required"},
		"frameworkTarget": "react-vite", "surface": "preview", "browserEngine": "chromium",
		"viewport":    map[string]any{"id": "viewport.desktop", "width": int64(1280), "height": int64(720)},
		"colorScheme": "light", "motion": "reduce", "locale": "en-US",
		"controlProfileRef": map[string]any{"kind": "preset", "presetId": "profile.g3", "digest": digest("g3-control-profile")},
		"adapter":           adapterIdentity, "requirement": "required", "policyRuleIds": []any{"policy.g3"},
		"appliedExemptionIds":  []any{},
		"retryPolicy":          map[string]any{"id": "retry.g3", "maximumAttempts": int64(1), "retryableOutcomes": []any{}, "stabilitySamples": int64(1), "freshFixtureNamespace": true},
		"evidenceRequirements": map[string]any{"acceptedTrust": []any{"local-unattested"}, "maximumAgeMs": int64(600_000), "requireAttestation": true, "requireCompatibleIdentity": true, "requiredArtifactKinds": []any{"build-log"}},
		"resources":            []any{}, "inputKinds": []any{"executable-snapshot"}, "artifactKinds": []any{"build-log"},
		"estimatedCost": map[string]any{"durationMs": int64(170_000), "artifactBytes": int64(1_048_576), "computeUnits": int64(1)},
		"preflight":     map[string]any{"status": "supported"}, "dependencyCellIds": []any{},
		"inputDigest": digest("g3-cell-input"),
	}
	cellDigest, err := canonicaljson.Digest(cell)
	if err != nil {
		t.Fatal(err)
	}
	registryEntries := []any{map[string]any{
		"descriptor": adapterDescriptor, "descriptorDigest": descriptorDigest,
		"capabilityDigest": capabilityDigest,
		"tool":             map[string]any{"name": "g3-browser", "version": "1.0.0", "schemaVersion": int64(1), "schemaDigest": digest("g3-tool-schema")},
		"runtimeZones":     []any{"sandbox"}, "knownLimitations": []any{},
	}}
	registryDigest, err := canonicaljson.Digest(registryEntries)
	if err != nil {
		t.Fatal(err)
	}
	registry := map[string]any{"entries": registryEntries, "snapshotDigest": registryDigest}
	verificationPlanBase := map[string]any{
		"status": "ready", "workspaceId": "workspace.g3", "targetRevision": int64(1),
		"targetPartitionRevisions": map[string]any{}, "scenarioRegistryDigest": digest("g3-scenario-registry"),
		"policyRevision": int64(1), "policyDigest": digest("g3-policy"), "retentionRequest": map[string]any{},
		"policyEvaluationInstant": "2026-08-09T00:00:00.000Z", "impactDigest": digest("g3-impact"),
		"semanticSchemaDigest": digest("g3-semantic-schema"), "providerSetDigest": digest("g3-provider-set"),
		"compilerDigest": digest("g3-compiler"), "plannerDigest": digest("g3-planner"),
		"adapterRegistryDigest": registryDigest, "cells": []any{cell}, "issues": []any{},
		"explanations": []any{}, "budget": map[string]any{},
	}
	verificationPlanDigest, err := canonicaljson.Digest(verificationPlanBase)
	if err != nil {
		t.Fatal(err)
	}
	verificationPlan := cloneEvaluationObject(verificationPlanBase)
	verificationPlan["planDigest"] = verificationPlanDigest
	requestBase := map[string]any{
		"format": evaluationG3CellAdmissionRequestFormat, "version": evaluationG3CellAdmissionVersion,
		"namespaceId": evaluationServiceTestNamespace, "evaluationPlanDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "projectId": "project.g3",
		"attemptId": planned[0].AttemptID, "descriptorDigest": planned[0].DescriptorDigest,
		"capabilityDescriptorDigest": descriptor["capabilityDescriptorDigest"], "caseId": planned[0].CaseID,
		"generation": int64(3), "fixtureDigest": digest("g3-fixture"),
		"finalWorkspaceSnapshotDigest": digest("g3-final-workspace"),
		"verificationPlanDigest":       verificationPlanDigest, "verificationPlan": verificationPlan,
		"registrySnapshotDigest": registryDigest, "registrySnapshot": registry,
		"cellId": cell["id"], "cellDigest": cellDigest, "cell": cell,
	}
	requestDigest, err := canonicaljson.Digest(requestBase)
	if err != nil {
		t.Fatal(err)
	}
	requestValue := cloneEvaluationObject(requestBase)
	requestValue["requestDigest"] = requestDigest
	source, err := canonicaljson.Bytes(requestValue)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeEvaluationG3CellAdmissionRequest(
		source, EvaluationAuthority{NamespaceID: evaluationServiceTestNamespace},
		EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}, plan,
	)
	if err != nil {
		t.Fatal(err)
	}
	return decoded, source
}

func evaluationG3CellAdmissionTestResult(
	t *testing.T,
	request evaluationG3CellAdmissionRequest,
	ownerImplementationDigest string,
	stageDigest string,
) EvaluationG3CellAdmissionAuthorityResult {
	t.Helper()
	digest := func(label string) string { return evaluationServiceTestDigest(t, label) }
	run := map[string]any{
		"runId": "g3-run.production", "providerId": "g3-runtime.production",
		"parentAttemptId": request.AttemptID, "surface": request.Cell["surface"],
		"frameworkTarget": request.Cell["frameworkTarget"], "runtimeZone": "sandbox",
		"browserEngine": request.Cell["browserEngine"], "viewport": request.Cell["viewport"],
		"devicePixelRatio": int64(1), "colorScheme": request.Cell["colorScheme"],
		"motion": request.Cell["motion"], "locale": request.Cell["locale"], "timezone": "UTC",
		"fontSetDigest": digest("g3-font-set"), "sandboxImageDigest": digest("g3-sandbox-image"),
	}
	runBytes, err := canonicaljson.Bytes(run)
	if err != nil {
		t.Fatal(err)
	}
	runtimeAuthorityDigest := digest("g3-runtime-authority")
	ownerAdmissionDigest, err := evaluationG3CellAdmissionOwnerDigest(
		request.RequestDigest, run, runtimeAuthorityDigest, ownerImplementationDigest, stageDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	dispatchAckDigest, err := evaluationG3CellAdmissionDispatchAckDigest(
		request, run, runtimeAuthorityDigest, ownerImplementationDigest, ownerAdmissionDigest, stageDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	return EvaluationG3CellAdmissionAuthorityResult{
		Run: runBytes, RuntimeAuthorityDigest: runtimeAuthorityDigest,
		OwnerImplementationDigest: ownerImplementationDigest, OwnerAdmissionDigest: ownerAdmissionDigest,
		StageDigest: stageDigest, DispatchAckDigest: dispatchAckDigest,
	}
}

func evaluationG3CellAdmissionTestHTTP(
	t *testing.T,
	handler http.Handler,
	request evaluationG3CellAdmissionRequest,
	source []byte,
) *httptest.ResponseRecorder {
	t.Helper()
	path := fmt.Sprintf("/v1/evaluations/%s/%s/%s/g3-cell-admission",
		request.NamespaceID, request.EvaluationPlanDigest, request.RepositoryCommit)
	httpRequest := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(source))
	httpRequest.Header.Set("Authorization", "Bearer "+evaluationServiceTestToken)
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", request.RequestDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httpRequest)
	return response
}

func TestEvaluationG3CellAdmissionSealsStableOwnerRunBeforeProviderDispatch(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	admission, source := evaluationG3CellAdmissionTestFixture(t, plan)
	implementationDigest := evaluationServiceTestDigest(t, "g3-owner-implementation")
	stageDigest, err := evaluationG3CellAdmissionStageDigest(admission, implementationDigest)
	if err != nil {
		t.Fatal(err)
	}
	authority := &evaluationG3CellAdmissionTestAuthority{
		implementationDigest: implementationDigest, stageDigest: stageDigest,
	}
	authority.result = evaluationG3CellAdmissionTestResult(t, admission, implementationDigest, stageDigest)
	repository := &evaluationG3CellAdmissionTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		wantShardID:                     admission.ShardID, wantGeneration: admission.Generation,
	}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		G3CellAdmissionAuthority:           authority,
		ControlledWorkspaceResponseScanner: &evaluationControlledWorkspaceTestScanner{},
		Clock:                              func() time.Time { return time.Date(2026, 8, 9, 0, 0, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatal(err)
	}
	first := evaluationG3CellAdmissionTestHTTP(t, handler, admission, source)
	if first.Code != http.StatusOK || repository.record.State != "sealed" ||
		authority.stageCalls != 1 || authority.executeCalls != 1 || authority.reconcileCalls != 0 {
		t.Fatalf("status=%d state=%s stage=%d execute=%d reconcile=%d body=%s",
			first.Code, repository.record.State, authority.stageCalls, authority.executeCalls,
			authority.reconcileCalls, first.Body.String())
	}
	if err := validateEvaluationG3CellAdmissionResponse(
		first.Body.Bytes(), admission, implementationDigest, stageDigest, authority.result.DispatchAckDigest,
	); err != nil {
		t.Fatal(err)
	}
	second := evaluationG3CellAdmissionTestHTTP(t, handler, admission, source)
	if second.Code != http.StatusOK || !bytes.Equal(first.Body.Bytes(), second.Body.Bytes()) ||
		authority.stageCalls != 1 || authority.executeCalls != 1 || authority.reconcileCalls != 0 {
		t.Fatalf("replay status=%d stage=%d execute=%d reconcile=%d body=%s",
			second.Code, authority.stageCalls, authority.executeCalls, authority.reconcileCalls, second.Body.String())
	}
}

func TestEvaluationG3CellAdmissionCrossHostReconcileUsesSealedFencesWithoutExecute(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	admission, source := evaluationG3CellAdmissionTestFixture(t, plan)
	implementationDigest := evaluationServiceTestDigest(t, "g3-cross-host-owner")
	stageDigest, _ := evaluationG3CellAdmissionStageDigest(admission, implementationDigest)
	result := evaluationG3CellAdmissionTestResult(t, admission, implementationDigest, stageDigest)
	responseBytes, err := evaluationG3CellAdmissionResponse(admission, result, implementationDigest, stageDigest)
	if err != nil {
		t.Fatal(err)
	}
	responseDigest, err := evaluationCanonicalByteDigest(responseBytes, maximumEvaluationG3CellAdmissionResponseBytes)
	if err != nil {
		t.Fatal(err)
	}
	binding, err := evaluationG3CellAdmissionBinding(admission, implementationDigest)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 9, 0, 0, 0, 0, time.UTC)
	repository := &evaluationG3CellAdmissionTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		wantShardID:                     admission.ShardID, wantGeneration: admission.Generation,
		record: EvaluationControlledAuthorityRequestRecord{
			NamespaceID: evaluationServiceTestNamespace, PlanDigest: plan.PlanDigest,
			RepositoryCommit: plan.RepositoryCommit, V46Eligible: true,
			EvaluationControlledAuthorityRequestBinding: binding,
			State: "dispatched", ClaimGeneration: 1, ClaimedAt: now, DispatchedAt: now,
			StageDigest: stageDigest, DispatchAckDigest: result.DispatchAckDigest,
			ResponseDigest: responseDigest, ResponseBytes: responseBytes,
		},
	}
	authority := &evaluationG3CellAdmissionTestAuthority{
		implementationDigest: implementationDigest, stageDigest: stageDigest, result: result,
	}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		G3CellAdmissionAuthority:           authority,
		ControlledWorkspaceResponseScanner: &evaluationControlledWorkspaceTestScanner{},
		Clock:                              func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	response := evaluationG3CellAdmissionTestHTTP(t, handler, admission, source)
	if response.Code != http.StatusOK || repository.record.State != "sealed" ||
		authority.stageCalls != 0 || authority.executeCalls != 0 || authority.reconcileCalls != 1 ||
		!bytes.Equal(response.Body.Bytes(), responseBytes) {
		t.Fatalf("status=%d state=%s stage=%d execute=%d reconcile=%d body=%s",
			response.Code, repository.record.State, authority.stageCalls, authority.executeCalls,
			authority.reconcileCalls, response.Body.String())
	}

	forgedRepository := *repository
	forgedRepository.record.State = "dispatched"
	forgedRepository.record.SealedAt = time.Time{}
	forgedRepository.record.StageDigest = evaluationServiceTestDigest(t, "forged-g3-stage")
	forgedAuthority := &evaluationG3CellAdmissionTestAuthority{
		implementationDigest: implementationDigest, stageDigest: stageDigest, result: result,
	}
	forgedHandler, err := NewEvaluationServiceHandler(&forgedRepository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		G3CellAdmissionAuthority:           forgedAuthority,
		ControlledWorkspaceResponseScanner: &evaluationControlledWorkspaceTestScanner{},
		Clock:                              func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	forged := evaluationG3CellAdmissionTestHTTP(t, forgedHandler, admission, source)
	if forged.Code == http.StatusOK || forgedAuthority.executeCalls != 0 {
		t.Fatalf("forged fence status=%d execute=%d body=%s", forged.Code, forgedAuthority.executeCalls, forged.Body.String())
	}
}

func TestEvaluationG3CellAdmissionRejectsRecomputedObjectAndRunSwaps(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	admission, source := evaluationG3CellAdmissionTestFixture(t, plan)
	var value map[string]any
	if err := json.Unmarshal(source, &value); err != nil {
		t.Fatal(err)
	}
	cell := value["cell"].(map[string]any)
	cell["inputDigest"] = evaluationServiceTestDigest(t, "swapped-g3-cell-input")
	cellDigest, _ := canonicaljson.Digest(cell)
	value["cellDigest"] = cellDigest
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	value["requestDigest"], _ = canonicaljson.Digest(base)
	drifted, _ := canonicaljson.Bytes(value)
	if _, err := decodeEvaluationG3CellAdmissionRequest(
		drifted, EvaluationAuthority{NamespaceID: evaluationServiceTestNamespace},
		EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}, plan,
	); err == nil {
		t.Fatal("recomputed cell outside the frozen Plan was accepted")
	}

	implementationDigest := evaluationServiceTestDigest(t, "g3-run-swap-owner")
	stageDigest, _ := evaluationG3CellAdmissionStageDigest(admission, implementationDigest)
	result := evaluationG3CellAdmissionTestResult(t, admission, implementationDigest, stageDigest)
	run := resultValue(result.Run).(map[string]any)
	run["parentAttemptId"] = "evaluation-attempt:forged"
	result.Run, _ = canonicaljson.Bytes(run)
	result.OwnerAdmissionDigest, _ = evaluationG3CellAdmissionOwnerDigest(
		admission.RequestDigest, run, result.RuntimeAuthorityDigest, implementationDigest, stageDigest,
	)
	result.DispatchAckDigest, _ = evaluationG3CellAdmissionDispatchAckDigest(
		admission, run, result.RuntimeAuthorityDigest, implementationDigest, result.OwnerAdmissionDigest, stageDigest,
	)
	if _, err := evaluationG3CellAdmissionResponse(admission, result, implementationDigest, stageDigest); err == nil {
		t.Fatal("recomputed run parent swap was accepted")
	}
}

func TestEvaluationG3CellAdmissionLoopbackUsesExactStageExecuteReconcileWire(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	admission, source := evaluationG3CellAdmissionTestFixture(t, plan)
	token := "g3-cell-admission-owner-token-0000000000001"
	implementationDigest := evaluationServiceTestDigest(t, "g3-loopback-owner")
	stageDigest, _ := evaluationG3CellAdmissionStageDigest(admission, implementationDigest)
	result := evaluationG3CellAdmissionTestResult(t, admission, implementationDigest, stageDigest)
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths = append(paths, request.URL.Path)
		if request.Method == http.MethodGet && request.URL.Path == "/healthz" {
			health := map[string]any{
				"format": "prodivix.agent-evaluation-owner-authority-health", "version": int64(1),
				"purpose": "full-attempt", "status": "ready", "controlledWorkspaceAuthorityDigest": implementationDigest,
				"verificationEvidenceAuthorityDigest": evaluationServiceTestDigest(t, "g3-loopback-verification"),
				"providerCapabilityAuthorityDigest":   evaluationServiceTestDigest(t, "g3-loopback-provider"),
				"attemptGradingAuthorityDigest":       evaluationServiceTestDigest(t, "g3-loopback-grading"),
				"replayJournalImplementationDigest":   evaluationServiceTestDigest(t, "g3-loopback-journal"),
			}
			health["healthDigest"], _ = canonicaljson.Digest(health)
			encoded, _ := canonicaljson.Bytes(health)
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write(encoded)
			return
		}
		if request.Header.Get("Authorization") != "Bearer "+token ||
			request.Header.Get("Idempotency-Key") != admission.RequestDigest {
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		body := new(bytes.Buffer)
		_, _ = body.ReadFrom(request.Body)
		value, decodeErr := decodeCanonicalEvaluationObject(body.Bytes(), maximumEvaluationLoopbackAuthorityBytes)
		payload, payloadOK := value["payload"].(map[string]any)
		if decodeErr != nil || !payloadOK ||
			stringMember(value, "serviceKind") != "controlled-workspace" ||
			stringMember(value, "operation") != evaluationG3CellAdmissionOperation ||
			stringMember(value, "routeBinding") != evaluationG3CellAdmissionRouteBinding ||
			stringMember(value, "ownerImplementationDigest") != implementationDigest ||
			!sameEvaluationCanonicalValue(payload, admission.Value) {
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		mode := stringMember(value, "mode")
		response := map[string]any{
			"format": evaluationLoopbackAuthorityResponseFormat, "version": evaluationLoopbackAuthorityVersion,
			"serviceKind": "controlled-workspace", "mode": mode, "requestDigest": admission.RequestDigest,
			"ownerImplementationDigest": implementationDigest, "stageDigest": stageDigest,
		}
		if mode == "stage" {
			if stringMember(value, "stageDigest") != "" || stringMember(value, "dispatchAckDigest") != "" {
				writer.WriteHeader(http.StatusBadRequest)
				return
			}
		} else {
			if stringMember(value, "stageDigest") != stageDigest ||
				(mode == "execute" && stringMember(value, "dispatchAckDigest") != "") {
				writer.WriteHeader(http.StatusBadRequest)
				return
			}
			response["run"] = resultValue(result.Run)
			response["runtimeAuthorityDigest"] = result.RuntimeAuthorityDigest
			response["ownerAdmissionDigest"] = result.OwnerAdmissionDigest
			response["dispatchAckDigest"] = result.DispatchAckDigest
			if mode == "reconcile" {
				response["reconciled"] = true
			}
		}
		encoded, _ := canonicaljson.Bytes(response)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(encoded)
	}))
	defer server.Close()
	client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: token, Purpose: "full-attempt",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.VerifyReady(context.Background()); err != nil {
		t.Fatal(err)
	}
	authorityRequest := EvaluationG3CellAdmissionAuthorityRequest{
		NamespaceID: admission.NamespaceID, EvaluationPlanDigest: admission.EvaluationPlanDigest,
		RepositoryCommit: admission.RepositoryCommit, AttemptID: admission.AttemptID,
		DescriptorDigest: admission.DescriptorDigest, Generation: admission.Generation,
		RequestDigest: admission.RequestDigest, OwnerImplementationDigest: implementationDigest,
		ClaimGeneration: 1, Request: source,
	}
	actualStage, err := client.StageG3CellAdmission(context.Background(), authorityRequest)
	if err != nil || actualStage != stageDigest {
		t.Fatalf("stage=%s err=%v", actualStage, err)
	}
	authorityRequest.StageDigest = actualStage
	executed, err := client.ExecuteG3CellAdmission(context.Background(), authorityRequest)
	if err != nil || executed.DispatchAckDigest != result.DispatchAckDigest {
		t.Fatalf("execute=%#v err=%v", executed, err)
	}
	authorityRequest.DispatchAckDigest = executed.DispatchAckDigest
	reconciled, ok, err := client.ReconcileG3CellAdmission(context.Background(), authorityRequest)
	if err != nil || !ok || reconciled.OwnerAdmissionDigest != result.OwnerAdmissionDigest {
		t.Fatalf("reconcile=%#v ok=%v err=%v", reconciled, ok, err)
	}
	forged := authorityRequest
	forged.DispatchAckDigest = evaluationServiceTestDigest(t, "forged-g3-loopback-ack")
	if _, _, err := client.ReconcileG3CellAdmission(context.Background(), forged); err == nil {
		t.Fatal("loopback reconcile accepted a forged persisted dispatch fence")
	}
	wantPaths := []string{
		"/healthz", "/v1/controlled-workspace/stage", "/v1/controlled-workspace/execute",
		"/v1/controlled-workspace/reconcile", "/v1/controlled-workspace/reconcile",
	}
	if len(paths) != len(wantPaths) {
		t.Fatalf("paths=%v", paths)
	}
	for index := range paths {
		if paths[index] != wantPaths[index] {
			t.Fatalf("paths=%v want=%v", paths, wantPaths)
		}
	}
}
