package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func ownerStateTestDigest(t *testing.T, value any) string {
	t.Helper()
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func ownerStateTestStatementDigest(t *testing.T, statement any) string {
	t.Helper()
	digest, err := evaluationVerificationEvidenceStatementEnvelopeDigest(statement)
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

type evaluationOwnerStateTestRepository struct {
	*evaluationServiceFakeRepository
	casRecords    map[string]EvaluationOwnerStateCASRecord
	resultRecords map[string]EvaluationOwnerStateDispatchRecord
	ownerStates   []EvaluationOwnerStateRecord
	stageDigest   string
	casCalls      int
	resultCalls   int
	listCalls     int
	readCalls     int
}

func (repository *evaluationOwnerStateTestRepository) GetEvaluationOwnerState(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	serviceKind string,
	ownerStateID string,
) (EvaluationOwnerStateRecord, error) {
	repository.readCalls++
	for _, record := range repository.ownerStates {
		if record.ServiceKind == serviceKind && record.OwnerStateID == ownerStateID {
			return record, nil
		}
	}
	return EvaluationOwnerStateRecord{}, ErrNotFound
}

func (repository *evaluationOwnerStateTestRepository) ListEvaluationOwnerStates(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	serviceKind string,
	afterOwnerStateID string,
	limit int64,
) ([]EvaluationOwnerStateRecord, bool, error) {
	repository.listCalls++
	records := make([]EvaluationOwnerStateRecord, 0, len(repository.ownerStates))
	for _, record := range repository.ownerStates {
		if record.ServiceKind == serviceKind && record.OwnerStateID > afterOwnerStateID {
			records = append(records, record)
		}
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].OwnerStateID < records[right].OwnerStateID
	})
	hasMore := int64(len(records)) > limit
	if hasMore {
		records = records[:limit]
	}
	return records, hasMore, nil
}

func (repository *evaluationOwnerStateTestRepository) StageEvaluationOwnerStateDispatch(
	context.Context,
	EvaluationAuthority,
	EvaluationPlanPartition,
	EvaluationControlledAuthorityRequestBinding,
	EvaluationOwnerStatePrior,
	time.Time,
) (EvaluationOwnerStateDispatchRecord, bool, error) {
	return EvaluationOwnerStateDispatchRecord{}, false, ErrInvalid
}

func (repository *evaluationOwnerStateTestRepository) StoreEvaluationOwnerStateCASArtifact(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	record EvaluationOwnerStateCASRecord,
	_ time.Time,
) (EvaluationOwnerStateCASRecord, bool, error) {
	repository.casCalls++
	contentDigest := fmt.Sprintf("sha256-%x", sha256.Sum256(record.ContentBytes))
	identityDigest, identityErr := evaluationOwnerStateCASArtifactIdentityDigest(record)
	receiptDigest, receiptErr := evaluationOwnerStateCASReceiptDigest(record)
	descriptor, descriptorErr := evaluationOwnerStateCASDescriptor(record)
	if identityErr != nil || receiptErr != nil || descriptorErr != nil || record.StageDigest != repository.stageDigest ||
		record.ArtifactDigest != contentDigest || record.ByteLength != int64(len(record.ContentBytes)) ||
		record.ArtifactIdentityDigest != identityDigest || record.CASReceiptDigest != receiptDigest ||
		record.DescriptorDigest != stringMember(descriptor, "descriptorDigest") {
		return EvaluationOwnerStateCASRecord{}, false, ErrConflict
	}
	key := record.ServiceKind + "\x00" + record.OwnerStateID + "\x00" + record.ArtifactRef
	if current, ok := repository.casRecords[key]; ok {
		if !bytes.Equal(current.ContentBytes, record.ContentBytes) || current.UploadDigest != record.UploadDigest ||
			current.DescriptorDigest != record.DescriptorDigest {
			return EvaluationOwnerStateCASRecord{}, false, ErrConflict
		}
		return current, true, nil
	}
	repository.casRecords[key] = record
	return record, false, nil
}

func (repository *evaluationOwnerStateTestRepository) GetEvaluationOwnerStateCASArtifact(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	serviceKind string,
	ownerStateID string,
	artifactRef string,
) (EvaluationOwnerStateCASRecord, error) {
	key := serviceKind + "\x00" + ownerStateID + "\x00" + artifactRef
	record, ok := repository.casRecords[key]
	if !ok {
		return EvaluationOwnerStateCASRecord{}, ErrNotFound
	}
	return record, nil
}

func (repository *evaluationOwnerStateTestRepository) StoreEvaluationOwnerStateResult(
	_ context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	transition EvaluationOwnerStateTransition,
	serviceKind string,
	operation string,
	routeBinding string,
	requestDigest string,
	_ time.Time,
) (EvaluationOwnerStateDispatchRecord, bool, error) {
	repository.resultCalls++
	if transition.StageDigest != repository.stageDigest {
		return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
	}
	if _, err := validateEvaluationOwnerStateTransition(
		authority, partition, transition, serviceKind, operation, routeBinding, requestDigest,
	); err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	bundle, _, err := decodeEvaluationOwnerStateBundle(
		transition.OwnerStateBundle, serviceKind, authority.NamespaceID, partition,
		transition.OwnerStateID, transition.OwnerStateRevision, transition.PriorRootDigest,
	)
	if err != nil {
		return EvaluationOwnerStateDispatchRecord{}, false, err
	}
	descriptors, _ := bundle["casArtifacts"].([]any)
	for _, raw := range descriptors {
		descriptor, _ := raw.(map[string]any)
		key := serviceKind + "\x00" + transition.OwnerStateID + "\x00" + stringMember(descriptor, "artifactRef")
		current, ok := repository.casRecords[key]
		if !ok || current.DescriptorDigest != stringMember(descriptor, "descriptorDigest") ||
			current.CASReceiptDigest != stringMember(descriptor, "casReceiptDigest") {
			return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
		}
	}
	key := serviceKind + "\x00" + requestDigest
	if current, ok := repository.resultRecords[key]; ok {
		if current.ResultReceiptDigest != transition.ResultReceiptDigest ||
			current.OwnerStateRootDigest != transition.OwnerStateRootDigest {
			return EvaluationOwnerStateDispatchRecord{}, false, ErrConflict
		}
		return current, true, nil
	}
	record := EvaluationOwnerStateDispatchRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, ServiceKind: serviceKind,
		Operation: operation, RouteBinding: routeBinding, RequestDigest: requestDigest,
		OwnerImplementationDigest: transition.OwnerImplementationDigest,
		OwnerStateID:              transition.OwnerStateID, PriorRevision: transition.PriorRevision,
		PriorRootDigest: transition.PriorRootDigest, StageDigest: transition.StageDigest,
		DispatchAckDigest: transition.DispatchAckDigest, ResponseDigest: transition.ResponseDigest,
		OwnerStateRevision: transition.OwnerStateRevision, OwnerStateRootDigest: transition.OwnerStateRootDigest,
		ResultReceiptDigest: transition.ResultReceiptDigest, PublicResultBytes: append([]byte(nil), transition.PublicResult...),
	}
	repository.resultRecords[key] = record
	return record, false, nil
}

func (repository *evaluationOwnerStateTestRepository) GetEvaluationOwnerStateDispatch(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	serviceKind string,
	requestDigest string,
) (EvaluationOwnerStateDispatchRecord, error) {
	if record, ok := repository.resultRecords[serviceKind+"\x00"+requestDigest]; ok {
		return record, nil
	}
	return EvaluationOwnerStateDispatchRecord{}, ErrNotFound
}

func ownerStateTestPlan(partition EvaluationPlanPartition) evaluationPlanFact {
	plannedAt := time.Date(2026, time.August, 9, 0, 0, 0, 0, time.UTC)
	return evaluationPlanFact{
		PlanID: "plan/owner-state", PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, PlannedAt: plannedAt, ExpiresAt: plannedAt.Add(7 * 24 * time.Hour),
	}
}

func ownerStateTestHandler(
	t *testing.T,
	repository *evaluationOwnerStateTestRepository,
	scanner EvaluationControlledWorkspacePublicResponseScanner,
) *EvaluationServiceHandler {
	t.Helper()
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		ControlledWorkspaceResponseScanner: scanner,
		Clock:                              func() time.Time { return time.Date(2026, time.August, 9, 1, 0, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func ownerStateTestControlledBundle(t *testing.T, namespaceID string) (EvaluationPlanPartition, string, []byte, string) {
	t.Helper()
	partition := EvaluationPlanPartition{
		PlanDigest:       "sha256-1111111111111111111111111111111111111111111111111111111111111111",
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	ownerStateID, err := evaluationOwnerStateIdentity(
		"controlled-workspace", namespaceID, partition, "attempt/1",
		"sha256-2222222222222222222222222222222222222222222222222222222222222222",
		"sha256-3333333333333333333333333333333333333333333333333333333333333333", 1,
	)
	if err != nil {
		t.Fatal(err)
	}
	workspaceSnapshot := map[string]any{"format": "prodivix.workspace-snapshot", "revision": int64(1)}
	toolDefinitions := []any{}
	actionRegistry := []any{}
	verificationPlan := map[string]any{"format": "prodivix.g3-verification-plan", "cells": []any{}}
	adapterRegistry := []any{}
	artifacts := []any{}
	initialCheckpoint := map[string]any{
		"checkpointRef": "checkpoint/initial", "attemptId": "attempt/1",
		"grantDigest":                    "sha256-3333333333333333333333333333333333333333333333333333333333333333",
		"generation":                     int64(1),
		"snapshotDigest":                 "sha256-7777777777777777777777777777777777777777777777777777777777777777",
		"securePersistenceReceiptDigest": "sha256-8888888888888888888888888888888888888888888888888888888888888888",
	}
	initialCheckpoint["checkpointDigest"] = ownerStateTestDigest(t, initialCheckpoint)
	currentCheckpoint := map[string]any{
		"checkpointRef": "checkpoint/current", "attemptId": "attempt/1",
		"grantDigest": "sha256-3333333333333333333333333333333333333333333333333333333333333333",
		"generation":  int64(1), "predecessorCheckpointDigest": initialCheckpoint["checkpointDigest"],
		"snapshotDigest":                 "sha256-9999999999999999999999999999999999999999999999999999999999999999",
		"securePersistenceReceiptDigest": "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}
	currentCheckpoint["checkpointDigest"] = ownerStateTestDigest(t, currentCheckpoint)
	snapshot := map[string]any{
		"format":  "prodivix.agent-evaluation-controlled-workspace-owner-state-snapshot",
		"version": evaluationOwnerStateVersion, "namespaceId": namespaceID,
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId":        "attempt/1",
		"descriptorDigest": "sha256-2222222222222222222222222222222222222222222222222222222222222222",
		"caseId":           "case/1", "materialDigest": "sha256-4444444444444444444444444444444444444444444444444444444444444444",
		"fixtureDigest": "sha256-5555555555555555555555555555555555555555555555555555555555555555",
		"grantDigest":   "sha256-3333333333333333333333333333333333333333333333333333333333333333",
		"generation":    int64(1), "sessionId": "session/1",
		"isolationPolicyDigest": "sha256-6666666666666666666666666666666666666666666666666666666666666666",
		"revision":              int64(1), "state": "active",
		"initialCheckpoint":       initialCheckpoint,
		"initialCheckpointDigest": initialCheckpoint["checkpointDigest"],
		"currentCheckpoint":       currentCheckpoint,
		"currentCheckpointDigest": currentCheckpoint["checkpointDigest"],
		"workspaceSnapshot":       workspaceSnapshot, "workspaceSnapshotDigest": ownerStateTestDigest(t, workspaceSnapshot),
		"toolDefinitions": toolDefinitions, "toolDefinitionSetDigest": ownerStateTestDigest(t, toolDefinitions),
		"actionRegistry": actionRegistry, "actionRegistryDigest": ownerStateTestDigest(t, actionRegistry),
		"g3VerificationPlan": verificationPlan, "verificationPlanDigest": ownerStateTestDigest(t, verificationPlan),
		"adapterRegistry": adapterRegistry, "adapterRegistryDigest": ownerStateTestDigest(t, adapterRegistry),
		"finalWorkspaceSnapshotDigest": nil,
		"artifactDescriptors":          artifacts, "artifactDescriptorSetDigest": ownerStateTestDigest(t, artifacts),
		"finalAuthorityReceiptDigest": nil, "cleanupReceiptDigest": nil,
	}
	snapshot["snapshotDigest"] = ownerStateTestDigest(t, snapshot)
	operation := map[string]any{
		"format": evaluationOwnerStateOperationRecordFormat, "version": evaluationOwnerStateVersion,
		"sequence": int64(1), "operation": "session.load-or-reattach",
		"routeBinding":   "sessions/load-or-reattach",
		"requestDigest":  "sha256-9999999999999999999999999999999999999999999999999999999999999999",
		"stageDigest":    "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"responseDigest": "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	}
	operation["recordDigest"] = ownerStateTestDigest(t, operation)
	recent := []any{operation}
	cas := []any{}
	bundle := map[string]any{
		"format": evaluationOwnerStateBundleFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": "controlled-workspace", "namespaceId": namespaceID,
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"ownerStateId": ownerStateID, "revision": int64(1), "previousOwnerStateRootDigest": nil,
		"snapshotKind": "controlled-workspace", "snapshot": snapshot,
		"snapshotDigest": snapshot["snapshotDigest"], "casArtifacts": cas,
		"casArtifactSetDigest": ownerStateTestDigest(t, cas), "recentOperations": recent,
		"recentOperationSetDigest": ownerStateTestDigest(t, recent),
	}
	source, err := canonicaljson.Bytes(bundle)
	if err != nil {
		t.Fatal(err)
	}
	return partition, ownerStateID, source, ownerStateTestDigest(t, bundle)
}

func TestEvaluationOwnerStateBundleBindsCanonicalIdentityAndRejectsSecrets(t *testing.T) {
	partition, ownerStateID, source, root := ownerStateTestControlledBundle(t, "evaluation/ns")
	value, actualRoot, err := decodeEvaluationOwnerStateBundle(
		source, "controlled-workspace", "evaluation/ns", partition, ownerStateID, 1, "",
	)
	if err != nil || actualRoot != root || stringMember(value, "ownerStateId") != ownerStateID {
		t.Fatalf("decode err=%v root=%q", err, actualRoot)
	}
	var tampered map[string]any
	if err := decodeEvaluationServiceRawJSON(source, &tampered); err != nil {
		t.Fatal(err)
	}
	snapshot, _ := objectMember(tampered, "snapshot")
	workspace, _ := objectMember(snapshot, "workspaceSnapshot")
	workspace["authorization"] = "Bearer abcdefghijklmnopqrstuvwxyz123456"
	snapshot["workspaceSnapshotDigest"] = ownerStateTestDigest(t, workspace)
	snapshotBase := cloneEvaluationObject(snapshot)
	delete(snapshotBase, "snapshotDigest")
	snapshot["snapshotDigest"] = ownerStateTestDigest(t, snapshotBase)
	tampered["snapshotDigest"] = snapshot["snapshotDigest"]
	tamperedSource, err := canonicaljson.Bytes(tampered)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := decodeEvaluationOwnerStateBundle(
		tamperedSource, "controlled-workspace", "evaluation/ns", partition, ownerStateID, 1, "",
	); err == nil {
		t.Fatal("credential-like text was accepted after full recomputation")
	}
}

func TestEvaluationOwnerStateCASReceiptAndDescriptorAreAcyclic(t *testing.T) {
	record := EvaluationOwnerStateCASRecord{
		ServiceKind:               "controlled-workspace",
		RequestDigest:             "sha256-1111111111111111111111111111111111111111111111111111111111111111",
		OwnerImplementationDigest: "sha256-2222222222222222222222222222222222222222222222222222222222222222",
		StageDigest:               "sha256-3333333333333333333333333333333333333333333333333333333333333333",
		OwnerStateID:              "sha256-4444444444444444444444444444444444444444444444444444444444444444",
		ArtifactRef:               "artifact/1", ArtifactKind: "verification", MediaType: "application/json",
		ArtifactDigest: "sha256-5555555555555555555555555555555555555555555555555555555555555555",
		ByteLength:     9,
		UploadDigest:   "sha256-6666666666666666666666666666666666666666666666666666666666666666",
	}
	record.ArtifactIdentityDigest, _ = evaluationOwnerStateCASArtifactIdentityDigest(record)
	record.CASReceiptDigest, _ = evaluationOwnerStateCASReceiptDigest(record)
	descriptor, err := evaluationOwnerStateCASDescriptor(record)
	if err != nil || !evaluationDigestPattern.MatchString(stringMember(descriptor, "descriptorDigest")) {
		t.Fatalf("descriptor err=%v value=%v", err, descriptor)
	}
	if bytes.Contains([]byte(record.ArtifactIdentityDigest), []byte(record.CASReceiptDigest)) {
		t.Fatal("pre-receipt artifact identity unexpectedly depends on the receipt")
	}
}

func ownerStateTestCASIngressValue(
	t *testing.T,
	ownerStateID string,
	requestDigest string,
	implementationDigest string,
	stageDigest string,
	artifactRef string,
	content []byte,
) (map[string]any, string) {
	t.Helper()
	record := EvaluationOwnerStateCASRecord{
		ServiceKind: "controlled-workspace", RequestDigest: requestDigest,
		OwnerImplementationDigest: implementationDigest, StageDigest: stageDigest, OwnerStateID: ownerStateID,
		ArtifactRef: artifactRef, ArtifactKind: "verification", MediaType: "application/json",
		ArtifactDigest: fmt.Sprintf("sha256-%x", sha256.Sum256(content)), ByteLength: int64(len(content)),
	}
	identityDigest, err := evaluationOwnerStateCASArtifactIdentityDigest(record)
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{
		"format": evaluationOwnerStateCASIngressFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": record.ServiceKind, "requestDigest": requestDigest,
		"ownerImplementationDigest": implementationDigest, "stageDigest": stageDigest,
		"ownerStateId": ownerStateID, "artifactRef": artifactRef, "artifactKind": record.ArtifactKind,
		"mediaType": record.MediaType, "artifactDigest": record.ArtifactDigest,
		"byteLength": record.ByteLength, "contentBase64": base64.StdEncoding.EncodeToString(content),
		"artifactIdentityDigest": identityDigest,
	}
	uploadDigest := ownerStateTestDigest(t, value)
	value["uploadDigest"] = uploadDigest
	return value, uploadDigest
}

func ownerStateTestControlledTransition(
	t *testing.T,
	namespaceID string,
) (EvaluationPlanPartition, string, EvaluationOwnerStateTransition) {
	t.Helper()
	partition, ownerStateID, bundleBytes, _ := ownerStateTestControlledBundle(t, namespaceID)
	requestDigest := "sha256-9999999999999999999999999999999999999999999999999999999999999999"
	implementationDigest := "sha256-1212121212121212121212121212121212121212121212121212121212121212"
	stageDigest, err := evaluationOwnerStateStageDigest(
		"controlled-workspace", "session.load-or-reattach", "sessions/load-or-reattach",
		requestDigest, implementationDigest, ownerStateID, 0, "",
	)
	if err != nil {
		t.Fatal(err)
	}
	publicResultValue := map[string]any{"facts": []any{}}
	publicResult, err := canonicaljson.Bytes(publicResultValue)
	if err != nil {
		t.Fatal(err)
	}
	responseDigest := ownerStateTestDigest(t, publicResultValue)
	var bundle map[string]any
	if err := decodeEvaluationServiceRawJSON(bundleBytes, &bundle); err != nil {
		t.Fatal(err)
	}
	recent, _ := bundle["recentOperations"].([]any)
	last, _ := recent[len(recent)-1].(map[string]any)
	last["stageDigest"] = stageDigest
	last["responseDigest"] = responseDigest
	delete(last, "recordDigest")
	last["recordDigest"] = ownerStateTestDigest(t, last)
	bundle["recentOperationSetDigest"] = ownerStateTestDigest(t, recent)
	bundleBytes, err = canonicaljson.Bytes(bundle)
	if err != nil {
		t.Fatal(err)
	}
	transition := EvaluationOwnerStateTransition{
		PublicResult: publicResult, ResponseDigest: responseDigest,
		OwnerImplementationDigest: implementationDigest, OwnerStateID: ownerStateID,
		PriorRevision: 0, StageDigest: stageDigest, OwnerStateRevision: 1,
		OwnerStateBundle: bundleBytes, OwnerStateRootDigest: ownerStateTestDigest(t, bundle),
	}
	transition.DispatchAckDigest, err = evaluationOwnerStateDispatchAckDigest(
		transition, "controlled-workspace", "session.load-or-reattach", "sessions/load-or-reattach", requestDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := evaluationOwnerStateSealedOperationValue(
		transition, "controlled-workspace", "session.load-or-reattach", "sessions/load-or-reattach", requestDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	transition.ResultReceiptDigest = stringMember(sealed, "resultReceiptDigest")
	return partition, requestDigest, transition
}

func ownerStateTestAuthorizedRequest(t *testing.T, target string, value map[string]any, idempotencyKey string) *http.Request {
	t.Helper()
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	request := authorizedEvaluationServiceRequest(http.MethodPost, target, bytes.NewReader(source))
	request.Header.Set("Idempotency-Key", idempotencyKey)
	return request
}

func TestEvaluationOwnerStateCASIngressSealsBytesAndReplaysExactUpload(t *testing.T) {
	partition, ownerStateID, _, _ := ownerStateTestControlledBundle(t, evaluationServiceTestNamespace)
	requestDigest := "sha256-9999999999999999999999999999999999999999999999999999999999999999"
	implementationDigest := "sha256-1212121212121212121212121212121212121212121212121212121212121212"
	stageDigest, err := evaluationOwnerStateStageDigest(
		"controlled-workspace", "session.load-or-reattach", "sessions/load-or-reattach",
		requestDigest, implementationDigest, ownerStateID, 0, "",
	)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationOwnerStateTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: ownerStateTestPlan(partition)},
		casRecords:                      map[string]EvaluationOwnerStateCASRecord{}, resultRecords: map[string]EvaluationOwnerStateDispatchRecord{},
		stageDigest: stageDigest,
	}
	scanner := &evaluationControlledWorkspaceTestScanner{}
	handler := ownerStateTestHandler(t, repository, scanner)
	value, uploadDigest := ownerStateTestCASIngressValue(
		t, ownerStateID, requestDigest, implementationDigest, stageDigest,
		"artifact/1", []byte(`{"artifact":"verified"}`),
	)
	url := evaluationServiceTestURL(ownerStateTestPlan(partition), "owner-state-cas")
	for replay := 0; replay < 2; replay++ {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, ownerStateTestAuthorizedRequest(t, url, value, uploadDigest))
		if response.Code != http.StatusOK {
			t.Fatalf("replay=%d status=%d body=%s", replay, response.Code, response.Body.String())
		}
		body, err := decodeCanonicalEvaluationObject(response.Body.Bytes(), maximumEvaluationServiceControlBytes)
		if err != nil || body["replayed"] != (replay == 1) {
			t.Fatalf("replay=%d body=%s err=%v", replay, response.Body.String(), err)
		}
		descriptor, ok := body["descriptor"].(map[string]any)
		if !ok || !evaluationDigestPattern.MatchString(stringMember(descriptor, "casReceiptDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(descriptor, "descriptorDigest")) {
			t.Fatalf("bounded CAS receipts missing: %s", response.Body.String())
		}
	}
	if repository.casCalls != 2 || scanner.calls != 2 {
		t.Fatalf("calls cas=%d scanner=%d", repository.casCalls, scanner.calls)
	}

	value, uploadDigest = ownerStateTestCASIngressValue(
		t, ownerStateID, requestDigest, implementationDigest, stageDigest,
		"artifact/credential", []byte(`{"authorization":"Bearer abcdefghijklmnopqrstuvwxyz123456"}`),
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, ownerStateTestAuthorizedRequest(t, url, value, uploadDigest))
	if response.Code != http.StatusForbidden || repository.casCalls != 2 {
		t.Fatalf("credential bytes reached CAS: status=%d calls=%d body=%s", response.Code, repository.casCalls, response.Body.String())
	}

	scanner.denied = []byte("protected-canary")
	value, uploadDigest = ownerStateTestCASIngressValue(
		t, ownerStateID, requestDigest, implementationDigest, stageDigest,
		"artifact/canary", []byte(`{"value":"protected-canary"}`),
	)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, ownerStateTestAuthorizedRequest(t, url, value, uploadDigest))
	if response.Code != http.StatusForbidden || repository.casCalls != 2 {
		t.Fatalf("dynamic canary reached CAS: status=%d calls=%d body=%s", response.Code, repository.casCalls, response.Body.String())
	}

	value, uploadDigest = ownerStateTestCASIngressValue(
		t, ownerStateID, requestDigest, implementationDigest,
		"sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		"artifact/fake-fence", []byte(`{"artifact":"verified"}`),
	)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, ownerStateTestAuthorizedRequest(t, url, value, uploadDigest))
	if response.Code != http.StatusConflict || repository.casCalls != 3 {
		t.Fatalf("fake fence was accepted: status=%d calls=%d body=%s", response.Code, repository.casCalls, response.Body.String())
	}
}

func ownerStateTestResultIngressValue(
	t *testing.T,
	requestDigest string,
	transition EvaluationOwnerStateTransition,
) map[string]any {
	t.Helper()
	var publicResult any
	var bundle any
	if err := decodeEvaluationServiceRawJSON(transition.PublicResult, &publicResult); err != nil {
		t.Fatal(err)
	}
	if err := decodeEvaluationServiceRawJSON(transition.OwnerStateBundle, &bundle); err != nil {
		t.Fatal(err)
	}
	value := map[string]any{
		"format": evaluationOwnerStateResultIngressFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": "controlled-workspace", "operation": "session.load-or-reattach",
		"routeBinding": "sessions/load-or-reattach", "requestDigest": requestDigest,
		"ownerImplementationDigest": transition.OwnerImplementationDigest,
		"stageDigest":               transition.StageDigest, "ownerStateId": transition.OwnerStateID,
		"priorOwnerStateRevision": transition.PriorRevision, "priorOwnerStateRootDigest": nil,
		"publicResult": publicResult, "responseDigest": transition.ResponseDigest,
		"ownerStateRevision": transition.OwnerStateRevision, "ownerStateBundle": bundle,
		"ownerStateRootDigest": transition.OwnerStateRootDigest,
		"dispatchAckDigest":    transition.DispatchAckDigest,
	}
	if transition.PriorRootDigest != "" {
		value["priorOwnerStateRootDigest"] = transition.PriorRootDigest
	}
	value["ingressDigest"] = ownerStateTestDigest(t, value)
	return value
}

func TestEvaluationOwnerStateResultIngressBindsTransitionAndFailsClosedOnSwap(t *testing.T) {
	partition, requestDigest, transition := ownerStateTestControlledTransition(t, evaluationServiceTestNamespace)
	repository := &evaluationOwnerStateTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: ownerStateTestPlan(partition)},
		casRecords:                      map[string]EvaluationOwnerStateCASRecord{}, resultRecords: map[string]EvaluationOwnerStateDispatchRecord{},
		stageDigest: transition.StageDigest,
	}
	scanner := &evaluationControlledWorkspaceTestScanner{}
	handler := ownerStateTestHandler(t, repository, scanner)
	value := ownerStateTestResultIngressValue(t, requestDigest, transition)
	url := evaluationServiceTestURL(ownerStateTestPlan(partition), "owner-state-results")
	for replay := 0; replay < 2; replay++ {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, ownerStateTestAuthorizedRequest(t, url, value, stringMember(value, "ingressDigest")))
		if response.Code != http.StatusOK {
			t.Fatalf("replay=%d status=%d body=%s", replay, response.Code, response.Body.String())
		}
		body, err := decodeCanonicalEvaluationObject(response.Body.Bytes(), maximumEvaluationServiceControlBytes)
		if err != nil || body["replayed"] != (replay == 1) ||
			stringMember(body, "resultReceiptDigest") != transition.ResultReceiptDigest {
			t.Fatalf("replay=%d body=%s err=%v", replay, response.Body.String(), err)
		}
	}
	if repository.resultCalls != 2 || scanner.calls != 4 {
		t.Fatalf("calls result=%d scanner=%d", repository.resultCalls, scanner.calls)
	}

	swapped := cloneEvaluationObject(value)
	swapped["stageDigest"] = "sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
	delete(swapped, "ingressDigest")
	swapped["ingressDigest"] = ownerStateTestDigest(t, swapped)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, ownerStateTestAuthorizedRequest(
		t, url, swapped, stringMember(swapped, "ingressDigest"),
	))
	if response.Code != http.StatusConflict || repository.resultCalls != 3 {
		t.Fatalf("swapped stage was accepted: status=%d calls=%d body=%s", response.Code, repository.resultCalls, response.Body.String())
	}

	omitted := cloneEvaluationObject(value)
	delete(omitted, "ownerStateBundle")
	delete(omitted, "ingressDigest")
	omitted["ingressDigest"] = ownerStateTestDigest(t, omitted)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, ownerStateTestAuthorizedRequest(
		t, url, omitted, stringMember(omitted, "ingressDigest"),
	))
	if response.Code != http.StatusBadRequest || repository.resultCalls != 3 {
		t.Fatalf("omitted bundle was accepted: status=%d calls=%d body=%s", response.Code, repository.resultCalls, response.Body.String())
	}
}

func ownerStateTestReadRecord(t *testing.T) (evaluationPlanFact, EvaluationOwnerStateRecord) {
	t.Helper()
	partition, ownerStateID, bundle, rootDigest := ownerStateTestControlledBundle(t, evaluationServiceTestNamespace)
	value, err := decodeCanonicalEvaluationObject(bundle, maximumEvaluationControlledOwnerStateBytes)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, ok := objectMember(value, "snapshot")
	if !ok {
		t.Fatal("owner-state snapshot is missing")
	}
	return ownerStateTestPlan(partition), EvaluationOwnerStateRecord{
		NamespaceID: evaluationServiceTestNamespace, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, ServiceKind: "controlled-workspace",
		OwnerStateID: ownerStateID, Revision: 1, RootDigest: rootDigest,
		SnapshotKind: "controlled-workspace", SnapshotDigest: stringMember(snapshot, "snapshotDigest"),
		SnapshotState: stringMember(snapshot, "state"), BundleBytes: bundle,
		UpdatedAt: time.Date(2026, time.August, 9, 1, 2, 3, 0, time.UTC),
	}
}

func TestEvaluationOwnerStateListAndReadAreBoundedCanonicalAndScannerSafe(t *testing.T) {
	plan, record := ownerStateTestReadRecord(t)
	metadataOnly := EvaluationOwnerStateRecord{
		NamespaceID: record.NamespaceID, PlanDigest: record.PlanDigest,
		RepositoryCommit: record.RepositoryCommit, ServiceKind: record.ServiceKind,
		OwnerStateID: "sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		Revision:     2, RootDigest: "sha256-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		SnapshotKind:   record.SnapshotKind,
		SnapshotDigest: "sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		SnapshotState:  "destroyed", UpdatedAt: record.UpdatedAt.Add(time.Second),
	}
	repository := &evaluationOwnerStateTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		ownerStates:                     []EvaluationOwnerStateRecord{metadataOnly, record},
		casRecords:                      map[string]EvaluationOwnerStateCASRecord{},
		resultRecords:                   map[string]EvaluationOwnerStateDispatchRecord{},
	}
	scanner := &evaluationControlledWorkspaceTestScanner{}
	handler := ownerStateTestHandler(t, repository, scanner)
	base := evaluationServiceTestURL(plan, "owner-states")
	listTarget := base + "?serviceKind=controlled-workspace&operation=session.orphans.list&limit=1"
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, authorizedEvaluationServiceRequest(http.MethodGet, listTarget, bytes.NewReader(nil)))
	if listResponse.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", listResponse.Code, listResponse.Body.String())
	}
	listValue, err := decodeCanonicalEvaluationObject(listResponse.Body.Bytes(), maximumEvaluationServiceControlBytes)
	states, statesOK := arrayMember(listValue, "states")
	responseBase := cloneEvaluationObject(listValue)
	delete(responseBase, "responseDigest")
	responseDigest, responseDigestErr := canonicaljson.Digest(responseBase)
	if err != nil || !statesOK || len(states) != 1 || repository.listCalls != 1 || scanner.calls != 0 ||
		stringMember(listValue, "nextCursor") != record.OwnerStateID || responseDigestErr != nil ||
		responseDigest != stringMember(listValue, "responseDigest") ||
		!evaluationOwnerStateCanonicalDigest(states, listValue["stateSetDigest"]) {
		t.Fatalf("list projection drifted: body=%s err=%v", listResponse.Body.String(), err)
	}

	readTarget := fmt.Sprintf(
		"%s/%s?serviceKind=controlled-workspace&operation=session.orphans.list",
		base, record.OwnerStateID,
	)
	readResponse := httptest.NewRecorder()
	handler.ServeHTTP(readResponse, authorizedEvaluationServiceRequest(http.MethodGet, readTarget, bytes.NewReader(nil)))
	if readResponse.Code != http.StatusOK {
		t.Fatalf("read status=%d body=%s", readResponse.Code, readResponse.Body.String())
	}
	readValue, err := decodeCanonicalEvaluationObject(readResponse.Body.Bytes(), maximumEvaluationOwnerStateOuterBytes)
	readBase := cloneEvaluationObject(readValue)
	delete(readBase, "responseDigest")
	readDigest, readDigestErr := canonicaljson.Digest(readBase)
	if err != nil || repository.readCalls != 1 || scanner.calls != 1 ||
		stringMember(readValue, "ownerStateRootDigest") != record.RootDigest ||
		stringMember(readValue, "snapshotState") != "active" || readValue["ownerStateBundle"] == nil ||
		readDigestErr != nil || readDigest != stringMember(readValue, "responseDigest") {
		t.Fatalf("read projection drifted: body=%s err=%v", readResponse.Body.String(), err)
	}

	invalidCursor := base + "?serviceKind=controlled-workspace&operation=session.orphans.list&limit=1&cursor=owner/state"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, authorizedEvaluationServiceRequest(http.MethodGet, invalidCursor, bytes.NewReader(nil)))
	if response.Code != http.StatusBadRequest || repository.listCalls != 1 {
		t.Fatalf("unsafe cursor reached repository: status=%d calls=%d", response.Code, repository.listCalls)
	}

	scanner.denied = []byte("session/1")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, authorizedEvaluationServiceRequest(http.MethodGet, readTarget, bytes.NewReader(nil)))
	if response.Code != http.StatusForbidden || repository.readCalls != 2 {
		t.Fatalf("dynamic canary bundle was returned: status=%d calls=%d body=%s",
			response.Code, repository.readCalls, response.Body.String())
	}
}

func TestEvaluationOwnerStateCASReadRequiresCurrentBundleDescriptorAndRecomputesBytes(t *testing.T) {
	plan, state := ownerStateTestReadRecord(t)
	content := []byte("scanner-safe-owner-state-artifact")
	cas := EvaluationOwnerStateCASRecord{
		NamespaceID: evaluationServiceTestNamespace, PlanDigest: state.PlanDigest,
		RepositoryCommit: state.RepositoryCommit, ServiceKind: state.ServiceKind,
		OwnerStateID:              state.OwnerStateID,
		RequestDigest:             "sha256-1212121212121212121212121212121212121212121212121212121212121212",
		OwnerImplementationDigest: "sha256-2323232323232323232323232323232323232323232323232323232323232323",
		StageDigest:               "sha256-3434343434343434343434343434343434343434343434343434343434343434",
		ArtifactRef:               "artifact-1", ArtifactKind: "workspace-snapshot", MediaType: "application/octet-stream",
		ArtifactDigest: fmt.Sprintf("sha256-%x", sha256.Sum256(content)), ByteLength: int64(len(content)),
		ContentBytes: append([]byte(nil), content...),
		UploadDigest: "sha256-4545454545454545454545454545454545454545454545454545454545454545",
	}
	cas.ArtifactIdentityDigest, _ = evaluationOwnerStateCASArtifactIdentityDigest(cas)
	cas.CASReceiptDigest, _ = evaluationOwnerStateCASReceiptDigest(cas)
	descriptor, err := evaluationOwnerStateCASDescriptor(cas)
	if err != nil {
		t.Fatal(err)
	}
	cas.DescriptorDigest = stringMember(descriptor, "descriptorDigest")
	var bundle map[string]any
	if err := decodeEvaluationServiceRawJSON(state.BundleBytes, &bundle); err != nil {
		t.Fatal(err)
	}
	bundle["casArtifacts"] = []any{descriptor}
	bundle["casArtifactSetDigest"] = ownerStateTestDigest(t, bundle["casArtifacts"])
	state.RootDigest = ownerStateTestDigest(t, bundle)
	state.BundleBytes, err = canonicaljson.Bytes(bundle)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationOwnerStateTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		ownerStates:                     []EvaluationOwnerStateRecord{state}, casRecords: map[string]EvaluationOwnerStateCASRecord{
			state.ServiceKind + "\x00" + state.OwnerStateID + "\x00" + cas.ArtifactRef: cas,
		}, resultRecords: map[string]EvaluationOwnerStateDispatchRecord{},
	}
	scanner := &evaluationControlledWorkspaceTestScanner{}
	handler := ownerStateTestHandler(t, repository, scanner)
	target := fmt.Sprintf(
		"%s/%s?serviceKind=controlled-workspace&operation=session.orphans.list&artifactRef=%s&descriptorDigest=%s",
		evaluationServiceTestURL(plan, "owner-state-cas"), state.OwnerStateID, cas.ArtifactRef, cas.DescriptorDigest,
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, authorizedEvaluationServiceRequest(http.MethodGet, target, bytes.NewReader(nil)))
	if response.Code != http.StatusOK {
		t.Fatalf("CAS read status=%d body=%s", response.Code, response.Body.String())
	}
	value, err := decodeCanonicalEvaluationObject(response.Body.Bytes(), maximumEvaluationOwnerStateOuterBytes)
	base := cloneEvaluationObject(value)
	delete(base, "responseDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if err != nil || digestErr != nil || digest != stringMember(value, "responseDigest") ||
		stringMember(value, "ownerStateRootDigest") != state.RootDigest || scanner.calls != 1 ||
		stringMember(value, "contentBase64") != base64.StdEncoding.EncodeToString(content) {
		t.Fatalf("CAS read projection drifted: body=%s err=%v", response.Body.String(), err)
	}

	swapped := target[:len(target)-len(cas.DescriptorDigest)] +
		"sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, authorizedEvaluationServiceRequest(http.MethodGet, swapped, bytes.NewReader(nil)))
	if response.Code != http.StatusConflict || scanner.calls != 1 {
		t.Fatalf("descriptor swap reached scanner: status=%d calls=%d body=%s", response.Code, scanner.calls, response.Body.String())
	}

	scanner.denied = content
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, authorizedEvaluationServiceRequest(http.MethodGet, target, bytes.NewReader(nil)))
	if response.Code != http.StatusForbidden || scanner.calls != 2 {
		t.Fatalf("dynamic canary artifact was returned: status=%d calls=%d body=%s", response.Code, scanner.calls, response.Body.String())
	}
}

func TestEvaluationVerificationPublicResultOmitsCallbackSecrets(t *testing.T) {
	createResponse := map[string]any{
		"format": evaluationVerificationEvidenceBridgeFormat, "version": evaluationVerificationEvidenceBridgeVersion,
		"kind": "promotion-created", "requestDigest": "sha256-1111111111111111111111111111111111111111111111111111111111111111",
		"promotionId": "promotion/1", "evidenceId": "evidence/1",
		"uploadCapability": "callback-bound-upload-capability-1234567890",
	}
	createResponse["receiptDigest"] = ownerStateTestDigest(t, createResponse)
	responseBytes, _ := canonicaljson.Bytes(createResponse)
	publicResult, err := evaluationVerificationEvidencePublicResult(
		responseBytes, evaluationVerificationEvidenceRoute{Operation: "promotion.create"},
		stringMember(createResponse, "requestDigest"),
	)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(publicResult, []byte("callback-bound")) {
		t.Fatalf("callback-bound secret entered durable projection: %s", publicResult)
	}
	var value map[string]any
	if err := json.Unmarshal(publicResult, &value); err != nil {
		t.Fatal(err)
	}
	projection, _ := objectMember(value, "responseProjection")
	if !exactEvaluationKeys(projection, []string{"kind", "promotionId", "evidenceId", "uploadCapabilityDigest"}) ||
		!evaluationDigestPattern.MatchString(stringMember(projection, "uploadCapabilityDigest")) {
		t.Fatalf("create projection drifted: %s", publicResult)
	}

	prepareResponse := map[string]any{
		"format": evaluationVerificationEvidenceBridgeFormat, "version": evaluationVerificationEvidenceBridgeVersion,
		"kind": "promotion-prepared", "requestDigest": "sha256-2222222222222222222222222222222222222222222222222222222222222222",
		"promotionId": "promotion/1", "evidenceId": "evidence/1",
		"attestationNonce":     "callback-bound-nonce-1234567890",
		"attestationStatement": map[string]any{"format": "statement"},
	}
	prepareResponse["attestationStatementDigest"] = ownerStateTestStatementDigest(t, prepareResponse["attestationStatement"])
	prepareResponse["receiptDigest"] = ownerStateTestDigest(t, prepareResponse)
	responseBytes, _ = canonicaljson.Bytes(prepareResponse)
	publicResult, err = evaluationVerificationEvidencePublicResult(
		responseBytes, evaluationVerificationEvidenceRoute{Operation: "promotion.prepare"},
		stringMember(prepareResponse, "requestDigest"),
	)
	if err != nil || bytes.Contains(publicResult, []byte("callback-bound-nonce")) {
		t.Fatalf("prepare callback nonce entered durable projection: %s err=%v", publicResult, err)
	}
	if err := json.Unmarshal(publicResult, &value); err != nil {
		t.Fatal(err)
	}
	projection, _ = objectMember(value, "responseProjection")
	if !evaluationDigestPattern.MatchString(stringMember(projection, "attestationNonceDigest")) ||
		stringMember(projection, "attestationStatementDigest") != stringMember(prepareResponse, "attestationStatementDigest") {
		t.Fatalf("prepare projection drifted: %s", publicResult)
	}
}

func TestEvaluationVerificationOwnerStateHardCutsPreparedEvidenceIdentity(t *testing.T) {
	digest := func(character byte) string {
		return "sha256-" + strings.Repeat(string(character), 64)
	}
	identity := map[string]any{
		"namespaceId": "evaluation/ns", "planDigest": digest('1'), "repositoryCommit": strings.Repeat("a", 40),
		"attemptId": "attempt/1", "descriptorDigest": digest('2'), "generation": json.Number("1"), "authorityDigest": digest('3'),
	}
	baseSnapshot := func(state string) map[string]any {
		snapshot := map[string]any{
			"format": "prodivix.agent-evaluation-verification-evidence-owner-state-snapshot", "version": json.Number("1"),
			"namespaceId": identity["namespaceId"], "planDigest": identity["planDigest"],
			"repositoryCommit": identity["repositoryCommit"], "attemptId": identity["attemptId"],
			"descriptorDigest": identity["descriptorDigest"], "generation": identity["generation"],
			"authorityDigest": identity["authorityDigest"], "sandboxRegistrationReceiptDigest": digest('4'),
			"revision": json.Number("1"), "state": state, "promotionId": "promotion/1", "evidenceId": "evidence/1",
			"projectId": "project/1", "workspaceId": "workspace/1", "workspaceRevision": json.Number("1"),
			"verificationPlanDigest": digest('5'), "adapterRegistryDigest": digest('6'),
			"candidate": nil, "candidateDigest": nil, "createdAt": "2026-08-09T00:00:00.000Z",
			"deadlineAt": "2026-08-10T00:00:00.000Z", "uploadCapabilityDigest": digest('7'),
			"attestationNonceDigest": nil, "attestationStatement": nil, "attestationStatementDigest": nil,
			"uploadedArtifactManifests": nil, "artifactManifestSetDigest": nil,
			"verifiedClaims": nil, "verifiedClaimSetDigest": nil, "finalManifest": nil, "finalManifestDigest": nil,
			"evidenceRecords": nil, "evidenceRecordSetDigest": nil,
		}
		snapshot["snapshotDigest"] = ownerStateTestDigest(t, snapshot)
		return snapshot
	}

	active := baseSnapshot("active")
	if err := validateEvaluationVerificationOwnerStateSnapshot(active, identity, 1); err != nil {
		_, createdErr := parseEvaluationServiceInstant(stringMember(active, "createdAt"))
		t.Fatalf("active snapshot rejected: %v exact=%v self=%v promotion=%v evidence=%v created=%v", err,
			exactEvaluationKeys(active, []string{
				"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId",
				"descriptorDigest", "generation", "authorityDigest", "sandboxRegistrationReceiptDigest",
				"revision", "state", "promotionId", "evidenceId", "projectId", "workspaceId", "workspaceRevision",
				"verificationPlanDigest", "adapterRegistryDigest", "candidate", "candidateDigest", "createdAt",
				"deadlineAt", "uploadCapabilityDigest", "attestationNonceDigest", "attestationStatement",
				"attestationStatementDigest", "uploadedArtifactManifests", "artifactManifestSetDigest",
				"verifiedClaims", "verifiedClaimSetDigest", "finalManifest", "finalManifestDigest",
				"evidenceRecords", "evidenceRecordSetDigest", "snapshotDigest",
			}), evaluationOwnerStateDigestMatches(active, "snapshotDigest"),
			validEvaluationAgentControlIdentity(stringMember(active, "promotionId")),
			validEvaluationAgentControlIdentity(stringMember(active, "evidenceId")), createdErr)
	}
	active["evidenceId"] = nil
	delete(active, "snapshotDigest")
	active["snapshotDigest"] = ownerStateTestDigest(t, active)
	if err := validateEvaluationVerificationOwnerStateSnapshot(active, identity, 1); !errors.Is(err, ErrInvalid) {
		t.Fatalf("active snapshot without durable evidence id accepted: %v", err)
	}

	prepared := baseSnapshot("prepared")
	prepared["attestationNonceDigest"] = digest('8')
	prepared["attestationStatement"] = map[string]any{"format": "statement", "evidenceId": "evidence/1"}
	prepared["attestationStatementDigest"] = ownerStateTestStatementDigest(t, prepared["attestationStatement"])
	delete(prepared, "snapshotDigest")
	prepared["snapshotDigest"] = ownerStateTestDigest(t, prepared)
	if err := validateEvaluationVerificationOwnerStateSnapshot(prepared, identity, 1); err != nil {
		t.Fatalf("prepared snapshot rejected: %v", err)
	}
	prepared["attestationStatementDigest"] = ownerStateTestDigest(t, prepared["attestationStatement"])
	delete(prepared, "snapshotDigest")
	prepared["snapshotDigest"] = ownerStateTestDigest(t, prepared)
	if err := validateEvaluationVerificationOwnerStateSnapshot(prepared, identity, 1); !errors.Is(err, ErrConflict) {
		t.Fatalf("raw statement digest bypassed canonical statement envelope: %v", err)
	}
	prepared["attestationStatementDigest"] = ownerStateTestStatementDigest(t, prepared["attestationStatement"])
	prepared["attestationNonceDigest"] = nil
	delete(prepared, "snapshotDigest")
	prepared["snapshotDigest"] = ownerStateTestDigest(t, prepared)
	if err := validateEvaluationVerificationOwnerStateSnapshot(prepared, identity, 1); !errors.Is(err, ErrInvalid) {
		t.Fatalf("prepared snapshot without nonce digest accepted: %v", err)
	}
}

func TestEvaluationVerificationEvidenceTwoStageWireIsExact(t *testing.T) {
	prepare, err := evaluationVerificationEvidenceRouteFor([]string{"verification-evidence", "promotions", "promotion.1", "prepare"})
	if err != nil || prepare.Operation != "promotion.prepare" || prepare.RequestKind != "promotion-prepare-request" ||
		prepare.ResponseKind != "promotion-prepared" || prepare.RouteBinding != "promotions/{promotionId}/prepare" {
		t.Fatalf("prepare route drifted: %+v err=%v", prepare, err)
	}
	finalCommit, err := evaluationVerificationEvidenceRouteFor([]string{"verification-evidence", "promotions", "promotion.1", "final-commit"})
	if err != nil || finalCommit.Operation != "promotion.final-commit" ||
		finalCommit.RequestKind != "promotion-final-commit-request" || finalCommit.ResponseKind != "promotion-finalized" ||
		finalCommit.RouteBinding != "promotions/{promotionId}/final-commit" {
		t.Fatalf("final-commit route drifted: %+v err=%v", finalCommit, err)
	}
	if _, err := evaluationVerificationEvidenceRouteFor([]string{"verification-evidence", "promotions", "promotion.1", "finalize"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("legacy finalize route remains accepted: %v", err)
	}

	requestDigest := "sha256-" + strings.Repeat("9", 64)
	statement := map[string]any{"format": "statement", "evidenceId": "evidence/1"}
	response := map[string]any{
		"format": evaluationVerificationEvidenceBridgeFormat, "version": evaluationVerificationEvidenceBridgeVersion,
		"kind": "promotion-prepared", "requestDigest": requestDigest,
		"promotionId": "promotion.1", "evidenceId": "evidence/1", "attestationNonce": "nonce-value-1234567890",
		"attestationStatement": statement, "attestationStatementDigest": ownerStateTestStatementDigest(t, statement),
	}
	response["receiptDigest"] = ownerStateTestDigest(t, response)
	responseBytes, _ := canonicaljson.Bytes(response)
	state := evaluationVerificationOwnerStateBinding{PromotionID: "promotion.1", EvidenceID: "evidence/1"}
	if _, persistable, err := validateVerificationEvidenceAuthorityResponse(
		responseBytes, prepare, requestDigest, map[string]any{}, evaluationVerificationEvidenceRequestAuthority{}, state,
	); err != nil || persistable {
		t.Fatalf("prepare response rejected or persisted: persistable=%v err=%v", persistable, err)
	}
	response["evidenceId"] = "evidence/swap"
	delete(response, "receiptDigest")
	response["receiptDigest"] = ownerStateTestDigest(t, response)
	responseBytes, _ = canonicaljson.Bytes(response)
	if _, _, err := validateVerificationEvidenceAuthorityResponse(
		responseBytes, prepare, requestDigest, map[string]any{}, evaluationVerificationEvidenceRequestAuthority{}, state,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("prepare evidence swap accepted: %v", err)
	}
}

func TestEvaluationOwnerStateLoopbackStagesAndReconcilesSealedStateWithoutReexecution(t *testing.T) {
	partition, ownerStateID, bundleBytes, _ := ownerStateTestControlledBundle(t, "evaluation/ns")
	requestDigest := "sha256-9999999999999999999999999999999999999999999999999999999999999999"
	implementationDigest := "sha256-1212121212121212121212121212121212121212121212121212121212121212"
	stageDigest, err := evaluationOwnerStateStageDigest(
		"controlled-workspace", "session.load-or-reattach", "sessions/load-or-reattach",
		requestDigest, implementationDigest, ownerStateID, 0, "",
	)
	if err != nil {
		t.Fatal(err)
	}
	publicResultValue := map[string]any{"facts": []any{}}
	publicResult, _ := canonicaljson.Bytes(publicResultValue)
	responseDigest := ownerStateTestDigest(t, publicResultValue)
	var bundle map[string]any
	if err := decodeEvaluationServiceRawJSON(bundleBytes, &bundle); err != nil {
		t.Fatal(err)
	}
	recent, _ := bundle["recentOperations"].([]any)
	last, _ := recent[len(recent)-1].(map[string]any)
	last["stageDigest"] = stageDigest
	last["responseDigest"] = responseDigest
	delete(last, "recordDigest")
	last["recordDigest"] = ownerStateTestDigest(t, last)
	bundle["recentOperationSetDigest"] = ownerStateTestDigest(t, recent)
	bundleBytes, _ = canonicaljson.Bytes(bundle)
	bundleRoot := ownerStateTestDigest(t, bundle)
	transition := EvaluationOwnerStateTransition{
		PublicResult: publicResult, ResponseDigest: responseDigest,
		OwnerImplementationDigest: implementationDigest, OwnerStateID: ownerStateID,
		PriorRevision: 0, StageDigest: stageDigest, OwnerStateRevision: 1,
		OwnerStateBundle: bundleBytes, OwnerStateRootDigest: bundleRoot,
	}
	transition.DispatchAckDigest, _ = evaluationOwnerStateDispatchAckDigest(
		transition, "controlled-workspace", "session.load-or-reattach", "sessions/load-or-reattach", requestDigest,
	)
	sealed, _ := evaluationOwnerStateSealedOperationValue(
		transition, "controlled-workspace", "session.load-or-reattach", "sessions/load-or-reattach", requestDigest,
	)
	transition.ResultReceiptDigest = stringMember(sealed, "resultReceiptDigest")
	sealedBytes, _ := canonicaljson.Bytes(sealed)
	t.Logf("ownerStateId=%s stageDigest=%s ownerStateRootDigest=%s dispatchAckDigest=%s resultReceiptDigest=%s",
		ownerStateID, stageDigest, bundleRoot, transition.DispatchAckDigest, transition.ResultReceiptDigest)
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls++
		source, _ := io.ReadAll(request.Body)
		value, decodeErr := decodeCanonicalEvaluationObject(source, maximumEvaluationOwnerStateOuterBytes)
		if decodeErr != nil {
			t.Errorf("request decode: %v", decodeErr)
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		mode := stringMember(value, "mode")
		if mode == "stage" && (value["ownerStateRevision"] != json.Number("0") ||
			value["ownerStateBundle"] != nil || value["ownerStateRootDigest"] != nil) {
			t.Errorf("stage prior state drifted: %s", source)
		}
		if mode == "reconcile" {
			if _, ok := value["ownerStateBundle"].(map[string]any); !ok {
				t.Errorf("reconcile omitted new state bundle: %s", source)
			}
			if _, ok := value["sealedOwnerOperation"].(map[string]any); !ok {
				t.Errorf("reconcile omitted sealed operation: %s", source)
			}
		}
		response := map[string]any{
			"format": evaluationLoopbackAuthorityResponseFormat, "version": evaluationLoopbackAuthorityVersion,
			"serviceKind": "controlled-workspace", "mode": mode, "requestDigest": requestDigest,
			"ownerImplementationDigest": implementationDigest, "ownerStateId": ownerStateID,
			"priorOwnerStateRevision": int64(0), "priorOwnerStateRootDigest": nil,
			"stageDigest": stageDigest,
		}
		if mode != "stage" {
			response["publicResult"] = publicResultValue
			response["responseDigest"] = responseDigest
			response["dispatchAckDigest"] = transition.DispatchAckDigest
			response["ownerStateRevision"] = int64(1)
			response["ownerStateBundle"] = bundle
			response["ownerStateRootDigest"] = bundleRoot
			response["resultReceiptDigest"] = transition.ResultReceiptDigest
		}
		if mode == "reconcile" {
			response["reconciled"] = true
		}
		encoded, _ := canonicaljson.Bytes(response)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(encoded)
	}))
	defer server.Close()
	client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: "abcdefghijklmnopqrstuvwxyzABCDEF", Purpose: "full-attempt",
	})
	if err != nil {
		t.Fatal(err)
	}
	client.controlledWorkspaceImplementationDigest = implementationDigest
	authorityRequest := EvaluationControlledWorkspaceAuthorityRequest{
		NamespaceID: "evaluation/ns", PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		Operation: "session.load-or-reattach", RouteBinding: "sessions/load-or-reattach",
		AttemptID:        "attempt/1",
		DescriptorDigest: "sha256-2222222222222222222222222222222222222222222222222222222222222222",
		GrantDigest:      "sha256-3333333333333333333333333333333333333333333333333333333333333333",
		Generation:       1, RequestDigest: requestDigest, Payload: json.RawMessage("{}"), ClaimGeneration: 1,
		OwnerImplementationDigest: implementationDigest, OwnerStateID: ownerStateID,
	}
	stage, err := client.StageControlledWorkspaceState(context.Background(), authorityRequest)
	if err != nil || stage != stageDigest {
		t.Fatalf("stage=%q err=%v", stage, err)
	}
	authorityRequest.StageDigest = stage
	executed, err := client.ExecuteControlledWorkspaceState(context.Background(), authorityRequest)
	if err != nil || executed.ResultReceiptDigest != transition.ResultReceiptDigest {
		t.Fatalf("execute=%+v err=%v", executed, err)
	}
	authorityRequest.OwnerStateRevision = 1
	authorityRequest.OwnerStateBundle = bundleBytes
	authorityRequest.OwnerStateRootDigest = bundleRoot
	authorityRequest.DispatchAckDigest = transition.DispatchAckDigest
	authorityRequest.SealedOwnerOperation = sealedBytes
	reconciled, ok, err := client.ReconcileControlledWorkspaceState(context.Background(), authorityRequest)
	if err != nil || !ok || reconciled.ResultReceiptDigest != transition.ResultReceiptDigest || calls != 3 {
		t.Fatalf("reconcile=%+v ok=%v calls=%d err=%v", reconciled, ok, calls, err)
	}
	authorityRequest.StageDigest = "sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
	if _, _, err := client.ReconcileControlledWorkspaceState(context.Background(), authorityRequest); err == nil || calls != 3 {
		t.Fatalf("fake fence reached owner: calls=%d err=%v", calls, err)
	}
}
