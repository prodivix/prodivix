package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"time"

	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationG3CellAdmissionRequestFormat        = "prodivix.agent-evaluation-g3-cell-admission-request"
	evaluationG3CellAdmissionResponseFormat       = "prodivix.agent-evaluation-g3-cell-admission-response"
	evaluationG3CellAdmissionVersion              = int64(1)
	evaluationG3CellAdmissionOperation            = "verification.cell.admit"
	evaluationG3CellAdmissionRouteBinding         = "g3-cell-admission"
	maximumEvaluationG3CellAdmissionRequestBytes  = 25_296_896
	maximumEvaluationG3CellAdmissionObjectBytes   = 8_388_608
	maximumEvaluationG3CellAdmissionResponseBytes = 1_048_576
)

type evaluationG3CellAdmissionRequest struct {
	NamespaceID                  string
	EvaluationPlanDigest         string
	RepositoryCommit             string
	ProjectID                    string
	AttemptID                    string
	DescriptorDigest             string
	CapabilityDescriptorDigest   string
	CaseID                       string
	Generation                   int64
	FixtureDigest                string
	FinalWorkspaceSnapshotDigest string
	VerificationPlanDigest       string
	RegistrySnapshotDigest       string
	CellID                       string
	CellDigest                   string
	RequestDigest                string
	ShardID                      string
	VerificationPlan             map[string]any
	RegistrySnapshot             map[string]any
	Cell                         map[string]any
	Value                        map[string]any
	Bytes                        []byte
}

// EvaluationG3CellAdmissionAuthorityRequest carries one already-admitted,
// canonical public request to the server-only G3 owner. The three fences are
// filled monotonically by the 8790 durable journal.
type EvaluationG3CellAdmissionAuthorityRequest struct {
	NamespaceID               string
	EvaluationPlanDigest      string
	RepositoryCommit          string
	AttemptID                 string
	DescriptorDigest          string
	Generation                int64
	RequestDigest             string
	OwnerImplementationDigest string
	StageDigest               string
	DispatchAckDigest         string
	ClaimGeneration           int64
	Request                   json.RawMessage
}

type EvaluationG3CellAdmissionAuthorityResult struct {
	Run                       json.RawMessage
	RuntimeAuthorityDigest    string
	OwnerImplementationDigest string
	OwnerAdmissionDigest      string
	StageDigest               string
	DispatchAckDigest         string
}

// EvaluationG3CellAdmissionAuthority is admission-only. Stage seals the owner
// implementation and immutable request; Execute may derive a stable Run but
// cannot start adapter/provider work; Reconcile is query-only.
type EvaluationG3CellAdmissionAuthority interface {
	G3CellAdmissionImplementationDigest() (string, bool)
	StageG3CellAdmission(context.Context, EvaluationG3CellAdmissionAuthorityRequest) (string, error)
	ExecuteG3CellAdmission(context.Context, EvaluationG3CellAdmissionAuthorityRequest) (EvaluationG3CellAdmissionAuthorityResult, error)
	ReconcileG3CellAdmission(context.Context, EvaluationG3CellAdmissionAuthorityRequest) (EvaluationG3CellAdmissionAuthorityResult, bool, error)
}

type evaluationG3CellAdmissionRepository interface {
	evaluationPlanReader
	ClaimEvaluationControlledAuthorityRequest(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
	AuthorizeEvaluationG3CellAdmissionGeneration(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		int64,
		time.Time,
	) error
	MarkEvaluationG3CellAdmissionDispatched(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		string,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
	AcknowledgeEvaluationG3CellAdmission(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		string,
		[]byte,
		string,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
	SealEvaluationG3CellAdmission(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		string,
		string,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
}

func evaluationG3CellAdmissionObject(value any, maximum int) (map[string]any, error) {
	object, ok := value.(map[string]any)
	if !ok {
		return nil, ErrInvalid
	}
	encoded, err := canonicaljson.Bytes(object)
	if err != nil || len(encoded) == 0 || len(encoded) > maximum {
		return nil, ErrInvalid
	}
	return object, nil
}

func validateEvaluationG3VerificationPlan(
	plan map[string]any,
	planDigest string,
	registryDigest string,
	cellID string,
	cellDigest string,
	cell map[string]any,
) error {
	if !exactEvaluationKeys(plan, []string{
		"status", "workspaceId", "targetRevision", "targetPartitionRevisions",
		"scenarioRegistryDigest", "policyRevision", "policyDigest", "retentionRequest",
		"policyEvaluationInstant", "impactDigest", "semanticSchemaDigest", "providerSetDigest",
		"compilerDigest", "plannerDigest", "adapterRegistryDigest", "planDigest", "cells",
		"issues", "explanations", "budget",
	}) || stringMember(plan, "status") != "ready" || stringMember(plan, "planDigest") != planDigest ||
		stringMember(plan, "adapterRegistryDigest") != registryDigest {
		return ErrConflict
	}
	base := cloneEvaluationObject(plan)
	delete(base, "planDigest")
	computed, err := canonicaljson.Digest(base)
	if err != nil || computed != planDigest {
		return ErrConflict
	}
	rawCells, ok := plan["cells"].([]any)
	if !ok || len(rawCells) < 1 || len(rawCells) > 128 {
		return ErrInvalid
	}
	matches := 0
	for _, raw := range rawCells {
		candidate, ok := raw.(map[string]any)
		if !ok {
			return ErrInvalid
		}
		if stringMember(candidate, "id") == cellID {
			matches++
			if !sameEvaluationCanonicalValue(candidate, cell) {
				return ErrConflict
			}
		}
	}
	if matches != 1 || stringMember(cell, "id") != cellID ||
		!exactEvaluationKeys(cell, []string{
			"id", "checkId", "checkKind", "targetId", "targetPolicy", "frameworkTarget",
			"surface", "viewport", "colorScheme", "motion", "locale", "controlProfileRef",
			"adapter", "requirement", "policyRuleIds", "appliedExemptionIds", "retryPolicy",
			"evidenceRequirements", "resources", "inputKinds", "artifactKinds", "estimatedCost",
			"preflight", "dependencyCellIds", "inputDigest",
		}, "scenarioId", "browserEngine", "fixtureSetRef", "baselineSetRef") {
		return ErrConflict
	}
	preflight, preflightOK := objectMember(cell, "preflight")
	if !preflightOK || stringMember(preflight, "status") != "supported" {
		return ErrConflict
	}
	computedCell, err := canonicaljson.Digest(cell)
	if err != nil || computedCell != cellDigest {
		return ErrConflict
	}
	return nil
}

func validateEvaluationG3RegistrySnapshot(
	snapshot map[string]any,
	snapshotDigest string,
	cell map[string]any,
) error {
	if !exactEvaluationKeys(snapshot, []string{"entries", "snapshotDigest"}) ||
		stringMember(snapshot, "snapshotDigest") != snapshotDigest {
		return ErrConflict
	}
	entries, ok := snapshot["entries"].([]any)
	if !ok || len(entries) < 1 || len(entries) > 256 {
		return ErrInvalid
	}
	computed, err := canonicaljson.Digest(entries)
	if err != nil || computed != snapshotDigest {
		return ErrConflict
	}
	adapter, adapterOK := objectMember(cell, "adapter")
	if !adapterOK || !exactEvaluationKeys(adapter, []string{
		"adapterId", "descriptorDigest", "toolchainDigest", "capabilityDigest",
	}) {
		return ErrInvalid
	}
	matches := 0
	previousID := ""
	for _, raw := range entries {
		entry, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(entry, []string{
			"descriptor", "descriptorDigest", "capabilityDigest", "tool", "runtimeZones", "knownLimitations",
		}) {
			return ErrInvalid
		}
		descriptor, descriptorOK := objectMember(entry, "descriptor")
		implementation, implementationOK := objectMember(descriptor, "implementation")
		id := stringMember(descriptor, "id")
		if !descriptorOK || !implementationOK || !validEvaluationServiceIdentity(id) ||
			(previousID != "" && previousID >= id) {
			return ErrInvalid
		}
		previousID = id
		if id == stringMember(adapter, "adapterId") &&
			stringMember(entry, "descriptorDigest") == stringMember(adapter, "descriptorDigest") &&
			stringMember(entry, "capabilityDigest") == stringMember(adapter, "capabilityDigest") &&
			stringMember(implementation, "toolchainDigest") == stringMember(adapter, "toolchainDigest") {
			matches++
		}
	}
	if matches != 1 {
		return ErrConflict
	}
	return nil
}

func decodeEvaluationG3CellAdmissionRequest(
	source []byte,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
) (evaluationG3CellAdmissionRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationG3CellAdmissionRequestBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "evaluationPlanDigest", "repositoryCommit", "projectId",
		"attemptId", "descriptorDigest", "capabilityDescriptorDigest", "caseId", "generation",
		"fixtureDigest", "finalWorkspaceSnapshotDigest", "verificationPlanDigest", "verificationPlan",
		"registrySnapshotDigest", "registrySnapshot", "cellId", "cellDigest", "cell", "requestDigest",
	}) {
		return evaluationG3CellAdmissionRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	generation, generationOK := integerMember(value, "generation")
	if !versionOK || version != evaluationG3CellAdmissionVersion || !generationOK || generation < 1 ||
		generation > 9_007_199_254_740_991 ||
		stringMember(value, "format") != evaluationG3CellAdmissionRequestFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		stringMember(value, "evaluationPlanDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit ||
		plan.PlanDigest != partition.PlanDigest || plan.RepositoryCommit != partition.RepositoryCommit {
		return evaluationG3CellAdmissionRequest{}, ErrConflict
	}
	for _, field := range []string{"projectId", "attemptId", "caseId", "cellId"} {
		if !validEvaluationServiceIdentity(stringMember(value, field)) {
			return evaluationG3CellAdmissionRequest{}, ErrInvalid
		}
	}
	for _, field := range []string{
		"evaluationPlanDigest", "descriptorDigest", "capabilityDescriptorDigest", "fixtureDigest",
		"finalWorkspaceSnapshotDigest", "verificationPlanDigest", "registrySnapshotDigest",
		"cellDigest", "requestDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationG3CellAdmissionRequest{}, ErrInvalid
		}
	}
	verificationPlan, planErr := evaluationG3CellAdmissionObject(value["verificationPlan"], maximumEvaluationG3CellAdmissionObjectBytes)
	registry, registryErr := evaluationG3CellAdmissionObject(value["registrySnapshot"], maximumEvaluationG3CellAdmissionObjectBytes)
	cell, cellErr := evaluationG3CellAdmissionObject(value["cell"], 1_048_576)
	if planErr != nil || registryErr != nil || cellErr != nil ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationG3CellAdmissionRequest{}, ErrInvalid
	}
	if err := validateEvaluationG3VerificationPlan(
		verificationPlan, stringMember(value, "verificationPlanDigest"),
		stringMember(value, "registrySnapshotDigest"), stringMember(value, "cellId"),
		stringMember(value, "cellDigest"), cell,
	); err != nil {
		return evaluationG3CellAdmissionRequest{}, err
	}
	if err := validateEvaluationG3RegistrySnapshot(
		registry, stringMember(value, "registrySnapshotDigest"), cell,
	); err != nil {
		return evaluationG3CellAdmissionRequest{}, err
	}
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	requestDigest, err := canonicaljson.Digest(base)
	if err != nil || requestDigest != stringMember(value, "requestDigest") {
		return evaluationG3CellAdmissionRequest{}, ErrConflict
	}
	plannedAttempts, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return evaluationG3CellAdmissionRequest{}, err
	}
	var planned evaluationStatusPlannedAttempt
	found := false
	for _, candidate := range plannedAttempts {
		if candidate.AttemptID == stringMember(value, "attemptId") {
			planned, found = candidate, true
			break
		}
	}
	if !found || planned.DescriptorDigest != stringMember(value, "descriptorDigest") ||
		planned.CaseID != stringMember(value, "caseId") ||
		stringMember(planned.Descriptor, "capabilityDescriptorDigest") != stringMember(value, "capabilityDescriptorDigest") {
		return evaluationG3CellAdmissionRequest{}, ErrConflict
	}
	return evaluationG3CellAdmissionRequest{
		NamespaceID: authority.NamespaceID, EvaluationPlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, ProjectID: stringMember(value, "projectId"),
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		CapabilityDescriptorDigest: stringMember(value, "capabilityDescriptorDigest"),
		CaseID:                     stringMember(value, "caseId"), Generation: generation,
		FixtureDigest:                stringMember(value, "fixtureDigest"),
		FinalWorkspaceSnapshotDigest: stringMember(value, "finalWorkspaceSnapshotDigest"),
		VerificationPlanDigest:       stringMember(value, "verificationPlanDigest"),
		RegistrySnapshotDigest:       stringMember(value, "registrySnapshotDigest"),
		CellID:                       stringMember(value, "cellId"), CellDigest: stringMember(value, "cellDigest"),
		RequestDigest: requestDigest, ShardID: planned.ShardID,
		VerificationPlan: verificationPlan, RegistrySnapshot: registry, Cell: cell,
		Value: value, Bytes: append([]byte(nil), source...),
	}, nil
}

func evaluationG3CellAdmissionBinding(
	request evaluationG3CellAdmissionRequest,
	ownerImplementationDigest string,
) (EvaluationControlledAuthorityRequestBinding, error) {
	if !evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		return EvaluationControlledAuthorityRequestBinding{}, ErrInvalid
	}
	bindingDigest, err := canonicaljson.Digest(map[string]any{
		"serviceKind": "controlled-workspace", "operation": evaluationG3CellAdmissionOperation,
		"routeBinding": evaluationG3CellAdmissionRouteBinding, "requestDigest": request.RequestDigest,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"generation": request.Generation, "ownerImplementationDigest": ownerImplementationDigest,
	})
	if err != nil {
		return EvaluationControlledAuthorityRequestBinding{}, err
	}
	return EvaluationControlledAuthorityRequestBinding{
		ServiceKind: "controlled-workspace", Operation: evaluationG3CellAdmissionOperation,
		RouteBinding: evaluationG3CellAdmissionRouteBinding, RequestDigest: request.RequestDigest,
		RequestBindingDigest: bindingDigest, OwnerImplementationDigest: ownerImplementationDigest,
		AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest,
		Generation: request.Generation,
	}, nil
}

func evaluationG3CellAdmissionStageDigest(
	request evaluationG3CellAdmissionRequest,
	ownerImplementationDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":  "prodivix.agent-evaluation-g3-cell-admission-dispatch-stage",
		"version": evaluationG3CellAdmissionVersion, "serviceKind": "controlled-workspace",
		"operation": evaluationG3CellAdmissionOperation, "routeBinding": evaluationG3CellAdmissionRouteBinding,
		"namespaceId": request.NamespaceID, "evaluationPlanDigest": request.EvaluationPlanDigest,
		"repositoryCommit": request.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "generation": request.Generation,
		"requestDigest": request.RequestDigest, "ownerImplementationDigest": ownerImplementationDigest,
	})
}

func evaluationG3Number(value any) (float64, bool) {
	var number float64
	switch current := value.(type) {
	case json.Number:
		parsed, err := current.Float64()
		if err != nil {
			return 0, false
		}
		number = parsed
	case float64:
		number = current
	default:
		return 0, false
	}
	return number, !math.IsNaN(number) && !math.IsInf(number, 0)
}

func decodeEvaluationG3CellAdmissionRun(
	raw any,
	request evaluationG3CellAdmissionRequest,
) (backendverification.RunIdentity, map[string]any, error) {
	value, ok := raw.(map[string]any)
	if !ok || !exactEvaluationKeys(value, []string{
		"runId", "providerId", "parentAttemptId", "surface", "frameworkTarget", "runtimeZone",
		"viewport", "devicePixelRatio", "colorScheme", "motion", "locale", "timezone", "fontSetDigest",
	}, "jobId", "sessionId", "browserEngine", "operatingSystemIdentity", "sandboxImageDigest") {
		return backendverification.RunIdentity{}, nil, ErrInvalid
	}
	for _, field := range []string{"runId", "providerId", "parentAttemptId"} {
		if !validEvaluationServiceIdentity(stringMember(value, field)) {
			return backendverification.RunIdentity{}, nil, ErrInvalid
		}
	}
	for _, field := range []string{"jobId", "sessionId"} {
		if text := stringMember(value, field); text != "" && !validEvaluationServiceIdentity(text) {
			return backendverification.RunIdentity{}, nil, ErrInvalid
		}
	}
	for _, field := range []string{"fontSetDigest", "sandboxImageDigest"} {
		if text := stringMember(value, field); (field == "fontSetDigest" || text != "") &&
			!evaluationDigestPattern.MatchString(text) {
			return backendverification.RunIdentity{}, nil, ErrInvalid
		}
	}
	viewport, viewportOK := objectMember(value, "viewport")
	width, widthOK := integerMember(viewport, "width")
	height, heightOK := integerMember(viewport, "height")
	dpr, dprOK := evaluationG3Number(value["devicePixelRatio"])
	cellViewport, cellViewportOK := objectMember(request.Cell, "viewport")
	if !viewportOK || !cellViewportOK || !exactEvaluationKeys(viewport, []string{"id", "width", "height"}) ||
		!validEvaluationServiceIdentity(stringMember(viewport, "id")) || !widthOK || !heightOK ||
		width < 1 || width > 100_000 || height < 1 || height > 100_000 || !dprOK || dpr <= 0 || dpr > 16 ||
		!sameEvaluationCanonicalValue(viewport, cellViewport) {
		return backendverification.RunIdentity{}, nil, ErrConflict
	}
	for _, field := range []string{"surface", "frameworkTarget", "browserEngine", "colorScheme", "motion", "locale"} {
		if stringMember(value, field) != stringMember(request.Cell, field) {
			return backendverification.RunIdentity{}, nil, ErrConflict
		}
	}
	if stringMember(value, "parentAttemptId") != request.AttemptID ||
		stringMember(value, "runtimeZone") != "sandbox" ||
		!oneOfString(stringMember(value, "surface"), "preview", "export", "ci") ||
		(stringMember(value, "browserEngine") != "" && !oneOfString(stringMember(value, "browserEngine"), "chromium", "firefox", "webkit")) {
		return backendverification.RunIdentity{}, nil, ErrConflict
	}
	for _, field := range []string{"frameworkTarget", "colorScheme", "motion", "locale", "timezone"} {
		text := stringMember(value, field)
		if text == "" || len(text) > 512 || strings.TrimSpace(text) != text {
			return backendverification.RunIdentity{}, nil, ErrInvalid
		}
	}
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) > maximumEvaluationG3CellAdmissionResponseBytes {
		return backendverification.RunIdentity{}, nil, ErrInvalid
	}
	var run backendverification.RunIdentity
	if err := decodeEvaluationServiceRawJSON(encoded, &run); err != nil {
		return backendverification.RunIdentity{}, nil, ErrInvalid
	}
	return run, value, nil
}

func evaluationG3CellAdmissionOwnerDigest(
	requestDigest string,
	run map[string]any,
	runtimeAuthorityDigest string,
	ownerImplementationDigest string,
	stageDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"requestDigest": requestDigest, "run": run, "runtimeAuthorityDigest": runtimeAuthorityDigest,
		"ownerImplementationDigest": ownerImplementationDigest, "stageDigest": stageDigest,
	})
}

func evaluationG3CellAdmissionDispatchAckDigest(
	request evaluationG3CellAdmissionRequest,
	run map[string]any,
	runtimeAuthorityDigest string,
	ownerImplementationDigest string,
	ownerAdmissionDigest string,
	stageDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":  "prodivix.agent-evaluation-g3-cell-admission-dispatch-ack",
		"version": evaluationG3CellAdmissionVersion, "namespaceId": request.NamespaceID,
		"evaluationPlanDigest": request.EvaluationPlanDigest, "repositoryCommit": request.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"generation": request.Generation, "requestDigest": request.RequestDigest, "run": run,
		"runtimeAuthorityDigest": runtimeAuthorityDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"ownerAdmissionDigest": ownerAdmissionDigest, "stageDigest": stageDigest,
	})
}

func evaluationG3CellAdmissionResponse(
	request evaluationG3CellAdmissionRequest,
	result EvaluationG3CellAdmissionAuthorityResult,
	expectedOwnerImplementationDigest string,
	expectedStageDigest string,
) ([]byte, error) {
	_, run, err := decodeEvaluationG3CellAdmissionRun(resultValue(result.Run), request)
	if err != nil || result.OwnerImplementationDigest != expectedOwnerImplementationDigest ||
		result.StageDigest != expectedStageDigest ||
		!evaluationDigestPattern.MatchString(result.RuntimeAuthorityDigest) {
		return nil, ErrConflict
	}
	ownerAdmissionDigest, err := evaluationG3CellAdmissionOwnerDigest(
		request.RequestDigest, run, result.RuntimeAuthorityDigest,
		result.OwnerImplementationDigest, result.StageDigest,
	)
	if err != nil || ownerAdmissionDigest != result.OwnerAdmissionDigest {
		return nil, ErrConflict
	}
	dispatchAckDigest, err := evaluationG3CellAdmissionDispatchAckDigest(
		request, run, result.RuntimeAuthorityDigest, result.OwnerImplementationDigest,
		result.OwnerAdmissionDigest, result.StageDigest,
	)
	if err != nil || dispatchAckDigest != result.DispatchAckDigest {
		return nil, ErrConflict
	}
	base := map[string]any{
		"format": evaluationG3CellAdmissionResponseFormat, "version": evaluationG3CellAdmissionVersion,
		"requestDigest": request.RequestDigest, "run": run,
		"runtimeAuthorityDigest":    result.RuntimeAuthorityDigest,
		"ownerImplementationDigest": result.OwnerImplementationDigest,
		"ownerAdmissionDigest":      result.OwnerAdmissionDigest, "stageDigest": result.StageDigest,
		"dispatchAckDigest": result.DispatchAckDigest,
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	response := cloneEvaluationObject(base)
	response["admissionReceiptDigest"] = receiptDigest
	encoded, err := canonicaljson.Bytes(response)
	if err != nil || len(encoded) > maximumEvaluationG3CellAdmissionResponseBytes {
		return nil, errEvaluationServiceResponseTooLarge
	}
	return encoded, nil
}

func resultValue(source json.RawMessage) any {
	var value any
	if decodeEvaluationServiceRawJSON(source, &value) != nil {
		return nil
	}
	return value
}

func validateEvaluationG3CellAdmissionResponse(
	source []byte,
	request evaluationG3CellAdmissionRequest,
	ownerImplementationDigest string,
	stageDigest string,
	dispatchAckDigest string,
) error {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationG3CellAdmissionResponseBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "requestDigest", "run", "runtimeAuthorityDigest",
		"ownerImplementationDigest", "ownerAdmissionDigest", "stageDigest", "dispatchAckDigest",
		"admissionReceiptDigest",
	}) || stringMember(value, "format") != evaluationG3CellAdmissionResponseFormat ||
		stringMember(value, "requestDigest") != request.RequestDigest ||
		stringMember(value, "ownerImplementationDigest") != ownerImplementationDigest ||
		stringMember(value, "stageDigest") != stageDigest ||
		stringMember(value, "dispatchAckDigest") != dispatchAckDigest {
		return ErrConflict
	}
	version, versionOK := integerMember(value, "version")
	if !versionOK || version != evaluationG3CellAdmissionVersion {
		return ErrInvalid
	}
	runBytes, err := canonicaljson.Bytes(value["run"])
	if err != nil {
		return ErrInvalid
	}
	result := EvaluationG3CellAdmissionAuthorityResult{
		Run: runBytes, RuntimeAuthorityDigest: stringMember(value, "runtimeAuthorityDigest"),
		OwnerImplementationDigest: stringMember(value, "ownerImplementationDigest"),
		OwnerAdmissionDigest:      stringMember(value, "ownerAdmissionDigest"), StageDigest: stringMember(value, "stageDigest"),
		DispatchAckDigest: stringMember(value, "dispatchAckDigest"),
	}
	expected, err := evaluationG3CellAdmissionResponse(request, result, ownerImplementationDigest, stageDigest)
	if err != nil || !bytes.Equal(expected, source) {
		return ErrConflict
	}
	return nil
}

func (handler *EvaluationServiceHandler) handleEvaluationG3CellAdmission(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 1 || tail[0] != "g3-cell-admission" || request.Method != http.MethodPost ||
		!evaluationServiceQueryIsExact(request) {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if handler.g3CellAdmissionAuthority == nil || handler.controlledWorkspaceResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	repository, ok := handler.repository.(evaluationG3CellAdmissionRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	planRecord, err := repository.GetEvaluationPlan(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationG3CellAdmissionRequestBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	admission, err := decodeEvaluationG3CellAdmissionRequest(source, handler.authority, partition, plan)
	if err != nil || !exactEvaluationIdempotencyHeader(request, admission.RequestDigest) {
		if err == nil {
			err = ErrInvalid
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	ownerImplementationDigest, ready := handler.g3CellAdmissionAuthority.G3CellAdmissionImplementationDigest()
	if !ready || !evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	binding, err := evaluationG3CellAdmissionBinding(admission, ownerImplementationDigest)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	now := handler.clock().UTC()
	if err := repository.AuthorizeEvaluationG3CellAdmissionGeneration(
		request.Context(), handler.authority, partition, admission.ShardID, admission.Generation, now,
	); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	record, _, err := repository.ClaimEvaluationControlledAuthorityRequest(
		request.Context(), handler.authority, partition, binding, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeResponse := func(source []byte) error {
		if err := validateEvaluationG3CellAdmissionResponse(
			source, admission, ownerImplementationDigest, record.StageDigest, record.DispatchAckDigest,
		); err != nil {
			return err
		}
		if err := handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
			request.Context(), evaluationG3CellAdmissionOperation, admission.RequestDigest, source,
		); err != nil {
			return ErrUnauthorized
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, source)
		return nil
	}
	if record.State == "sealed" {
		if err := writeResponse(record.ResponseBytes); err != nil {
			respondEvaluationServiceError(writer, err)
		}
		return
	}
	authorityRequest := EvaluationG3CellAdmissionAuthorityRequest{
		NamespaceID: handler.authority.NamespaceID, EvaluationPlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, AttemptID: admission.AttemptID,
		DescriptorDigest: admission.DescriptorDigest, Generation: admission.Generation,
		RequestDigest: admission.RequestDigest, OwnerImplementationDigest: ownerImplementationDigest,
		StageDigest: record.StageDigest, DispatchAckDigest: record.DispatchAckDigest,
		ClaimGeneration: record.ClaimGeneration, Request: append(json.RawMessage(nil), admission.Bytes...),
	}
	var responseBytes []byte
	if record.State == "claimed" {
		stageDigest, stageErr := handler.g3CellAdmissionAuthority.StageG3CellAdmission(
			request.Context(), authorityRequest,
		)
		expectedStageDigest, expectedErr := evaluationG3CellAdmissionStageDigest(admission, ownerImplementationDigest)
		if stageErr != nil || expectedErr != nil || stageDigest != expectedStageDigest {
			if stageErr == nil {
				stageErr = ErrConflict
			}
			respondEvaluationServiceError(writer, stageErr)
			return
		}
		record, _, err = repository.MarkEvaluationG3CellAdmissionDispatched(
			request.Context(), handler.authority, partition, binding, record.ClaimGeneration, stageDigest, now,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		authorityRequest.StageDigest = record.StageDigest
		result, err := handler.g3CellAdmissionAuthority.ExecuteG3CellAdmission(request.Context(), authorityRequest)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		responseBytes, err = evaluationG3CellAdmissionResponse(
			admission, result, ownerImplementationDigest, record.StageDigest,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		responseValue, decodeErr := decodeCanonicalEvaluationObject(responseBytes, maximumEvaluationG3CellAdmissionResponseBytes)
		if decodeErr != nil {
			respondEvaluationServiceError(writer, decodeErr)
			return
		}
		dispatchAckDigest := stringMember(responseValue, "dispatchAckDigest")
		responseDigest, digestErr := evaluationCanonicalByteDigest(responseBytes, maximumEvaluationG3CellAdmissionResponseBytes)
		if digestErr != nil {
			respondEvaluationServiceError(writer, digestErr)
			return
		}
		if err := handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
			request.Context(), evaluationG3CellAdmissionOperation, admission.RequestDigest, responseBytes,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
		record, _, err = repository.AcknowledgeEvaluationG3CellAdmission(
			request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
			responseDigest, responseBytes, dispatchAckDigest, now,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
	} else {
		if record.State != "dispatched" || !evaluationDigestPattern.MatchString(record.StageDigest) ||
			!evaluationDigestPattern.MatchString(record.DispatchAckDigest) || len(record.ResponseBytes) == 0 {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		authorityRequest.StageDigest, authorityRequest.DispatchAckDigest = record.StageDigest, record.DispatchAckDigest
		result, reconciled, reconcileErr := handler.g3CellAdmissionAuthority.ReconcileG3CellAdmission(
			request.Context(), authorityRequest,
		)
		if reconcileErr != nil || !reconciled {
			if reconcileErr == nil {
				reconcileErr = errEvaluationServiceUnavailable
			}
			respondEvaluationServiceError(writer, reconcileErr)
			return
		}
		responseBytes, err = evaluationG3CellAdmissionResponse(admission, result, ownerImplementationDigest, record.StageDigest)
		if err != nil || !bytes.Equal(responseBytes, record.ResponseBytes) {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
	}
	responseDigest, err := evaluationCanonicalByteDigest(responseBytes, maximumEvaluationG3CellAdmissionResponseBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	record, _, err = repository.SealEvaluationG3CellAdmission(
		request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
		responseDigest, record.DispatchAckDigest, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := writeResponse(record.ResponseBytes); err != nil {
		respondEvaluationServiceError(writer, err)
	}
}
