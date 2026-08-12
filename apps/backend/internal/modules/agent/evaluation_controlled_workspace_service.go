package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationControlledWorkspaceServiceFormat       = "prodivix.agent-evaluation-controlled-workspace-service"
	evaluationControlledWorkspaceServiceVersion      = int64(1)
	maximumEvaluationControlledWorkspaceRequestBytes = 25_296_896
	maximumEvaluationControlledWorkspaceFacts        = 128
)

type EvaluationControlledWorkspaceAuthorityRequest struct {
	NamespaceID               string
	PlanDigest                string
	RepositoryCommit          string
	Operation                 string
	RouteBinding              string
	SessionID                 string
	AttemptID                 string
	DescriptorDigest          string
	GrantDigest               string
	Generation                int64
	RequestDigest             string
	Payload                   json.RawMessage
	ClaimGeneration           int64
	OwnerImplementationDigest string
	OwnerStateID              string
	OwnerStateRevision        int64
	OwnerStateBundle          json.RawMessage
	OwnerStateRootDigest      string
	StageDigest               string
	DispatchAckDigest         string
	SealedOwnerOperation      json.RawMessage
}

// EvaluationControlledWorkspaceAuthority is implemented by the existing
// controlled Workspace/G3 owner adapter. The Backend journal owns dispatch
// idempotency only; it never interprets a successful owner result as G3 truth.
// Execute is a request-digest keyed idempotent dispatch: a claimed replay may
// call it again after a crash and the owner must return/recover the same
// dispatch without repeating an effect. Reconcile queries owner durable state
// after the Backend has recorded dispatched and may not repeat an effect.
type EvaluationControlledWorkspaceAuthority interface {
	ReadControlledWorkspace(
		context.Context,
		EvaluationControlledWorkspaceAuthorityRequest,
	) ([]json.RawMessage, error)
	ExecuteControlledWorkspace(
		context.Context,
		EvaluationControlledWorkspaceAuthorityRequest,
	) ([]json.RawMessage, error)
	ReconcileControlledWorkspace(
		context.Context,
		EvaluationControlledWorkspaceAuthorityRequest,
	) ([]json.RawMessage, bool, error)
}

// EvaluationControlledWorkspaceStateAuthority is the production stateful
// bridge. It stages against a Backend-owned snapshot before an effect and
// returns only transitions already sealed through the 8790 result ingress.
type EvaluationControlledWorkspaceStateAuthority interface {
	StageControlledWorkspaceState(
		context.Context,
		EvaluationControlledWorkspaceAuthorityRequest,
	) (string, error)
	ExecuteControlledWorkspaceState(
		context.Context,
		EvaluationControlledWorkspaceAuthorityRequest,
	) (EvaluationOwnerStateTransition, error)
	ReconcileControlledWorkspaceState(
		context.Context,
		EvaluationControlledWorkspaceAuthorityRequest,
	) (EvaluationOwnerStateTransition, bool, error)
}

// EvaluationControlledWorkspacePublicResponseScanner owns the server-only
// credential/protected-material canary set and public artifact policy. It runs
// over the exact ACK before any byte is returned or persisted.
type EvaluationControlledWorkspacePublicResponseScanner interface {
	ScanControlledWorkspacePublicResponse(
		context.Context,
		string,
		string,
		[]byte,
	) error
}

type evaluationControlledAuthorityRequestRepository interface {
	ClaimEvaluationControlledAuthorityRequest(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
	SealEvaluationControlledAuthorityRequest(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		string,
		[]byte,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
	MarkEvaluationControlledAuthorityDispatched(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
}

type evaluationControlledWorkspaceRequestAuthorizer interface {
	AuthorizeEvaluationControlledWorkspaceRequest(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
	) error
}

type evaluationControlledWorkspaceImplementationDigestSource interface {
	ControlledWorkspaceImplementationDigest() (string, bool)
}

type evaluationControlledWorkspaceStatelessFenceRepository interface {
	GetEvaluationControlledWorkspaceStatelessRequest(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
	) (EvaluationControlledAuthorityRequestRecord, error)
	StageEvaluationControlledWorkspaceStatelessDispatch(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		string,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
	SealEvaluationControlledWorkspaceStatelessResult(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationControlledAuthorityRequestBinding,
		int64,
		string,
		string,
		string,
		[]byte,
		time.Time,
	) (EvaluationControlledAuthorityRequestRecord, bool, error)
}

func controlledWorkspaceReadOperation(operation string) bool {
	return oneOfString(operation,
		"session.orphans.list",
		"operation.attempt-state.load",
		"operation.sealed.load",
		"operation.sealed.list",
	)
}

type evaluationControlledWorkspaceServiceEnvelope struct {
	Format           string          `json:"format"`
	Version          int64           `json:"version"`
	Operation        string          `json:"operation"`
	NamespaceID      string          `json:"namespaceId"`
	PlanDigest       string          `json:"planDigest"`
	RepositoryCommit string          `json:"repositoryCommit"`
	Payload          json.RawMessage `json:"payload"`
	RequestDigest    string          `json:"requestDigest"`
}

type evaluationControlledWorkspaceServiceRequestBase struct {
	Format           string          `json:"format"`
	Version          int64           `json:"version"`
	Operation        string          `json:"operation"`
	NamespaceID      string          `json:"namespaceId"`
	PlanDigest       string          `json:"planDigest"`
	RepositoryCommit string          `json:"repositoryCommit"`
	Payload          json.RawMessage `json:"payload"`
}

type evaluationControlledWorkspaceAcknowledgementBase struct {
	Format        string            `json:"format"`
	Version       int64             `json:"version"`
	Operation     string            `json:"operation"`
	RequestDigest string            `json:"requestDigest"`
	Facts         []json.RawMessage `json:"facts"`
}

type evaluationControlledWorkspaceAcknowledgement struct {
	evaluationControlledWorkspaceAcknowledgementBase
	ReceiptDigest string `json:"receiptDigest"`
}

type evaluationControlledWorkspaceRoute struct {
	Operation    string
	RouteBinding string
	SessionID    string
}

func evaluationControlledWorkspaceRouteFor(tail []string) (evaluationControlledWorkspaceRoute, error) {
	if len(tail) < 2 || tail[0] != "controlled-workspace" {
		return evaluationControlledWorkspaceRoute{}, ErrInvalid
	}
	parts := tail[1:]
	exact := func(operation, binding string) (evaluationControlledWorkspaceRoute, error) {
		return evaluationControlledWorkspaceRoute{Operation: operation, RouteBinding: binding}, nil
	}
	switch {
	case len(parts) == 2 && parts[0] == "grants" && parts[1] == "issue":
		return exact("grant.issue", "grants/issue")
	case len(parts) == 2 && parts[0] == "sessions" && parts[1] == "load-or-reattach":
		return exact("session.load-or-reattach", "sessions/load-or-reattach")
	case len(parts) == 3 && parts[0] == "sessions" && parts[1] == "orphans" && parts[2] == "list":
		return exact("session.orphans.list", "sessions/orphans/list")
	case len(parts) == 3 && parts[0] == "sessions" && parts[1] == "orphans" && parts[2] == "destroy":
		return exact("session.orphan.destroy", "sessions/orphans/destroy")
	case len(parts) >= 3 && parts[0] == "sessions" && validEvaluationServiceIdentity(parts[1]):
		sessionID := parts[1]
		var operation, suffix string
		switch {
		case len(parts) == 3 && parts[2] == "preflight":
			operation, suffix = "session.preflight", "preflight"
		case len(parts) == 3 && parts[2] == "restore-checkpoint":
			operation, suffix = "session.restore-checkpoint", "restore-checkpoint"
		case len(parts) == 3 && parts[2] == "execute":
			operation, suffix = "session.execute", "execute"
		case len(parts) == 3 && parts[2] == "reconcile-dispatched":
			operation, suffix = "session.reconcile-dispatched", "reconcile-dispatched"
		case len(parts) == 4 && parts[2] == "artifacts" && parts[3] == "resolve":
			operation, suffix = "session.artifact.resolve", "artifacts/resolve"
		case len(parts) == 3 && parts[2] == "assess-final":
			operation, suffix = "session.assess-final", "assess-final"
		case len(parts) == 3 && parts[2] == "destroy":
			operation, suffix = "session.destroy", "destroy"
		default:
			return evaluationControlledWorkspaceRoute{}, ErrInvalid
		}
		return evaluationControlledWorkspaceRoute{
			Operation: operation, RouteBinding: "sessions/{sessionId}/" + suffix, SessionID: sessionID,
		}, nil
	case len(parts) == 3 && parts[0] == "operations" && parts[1] == "attempt-state" && parts[2] == "load":
		return exact("operation.attempt-state.load", "operations/attempt-state/load")
	case len(parts) == 2 && parts[0] == "operations" && parts[1] == "claim":
		return exact("operation.claim", "operations/claim")
	case len(parts) == 2 && parts[0] == "operations" && parts[1] == "dispatch":
		return exact("operation.dispatch", "operations/dispatch")
	case len(parts) == 2 && parts[0] == "operations" && parts[1] == "seal-rejected":
		return exact("operation.seal-rejected", "operations/seal-rejected")
	case len(parts) == 2 && parts[0] == "operations" && parts[1] == "seal-atomic":
		return exact("operation.seal-atomic", "operations/seal-atomic")
	case len(parts) == 2 && parts[0] == "operations" && parts[1] == "reconcile-dispatched":
		return exact("operation.reconcile-dispatched", "operations/reconcile-dispatched")
	case len(parts) == 3 && parts[0] == "operations" && parts[1] == "sealed" && parts[2] == "load":
		return exact("operation.sealed.load", "operations/sealed/load")
	case len(parts) == 3 && parts[0] == "operations" && parts[1] == "sealed" && parts[2] == "list":
		return exact("operation.sealed.list", "operations/sealed/list")
	case len(parts) == 3 && parts[0] == "operations" && parts[1] == "cleanup":
		operations := map[string]string{
			"claim": "operation.cleanup.claim", "dispatch": "operation.cleanup.dispatch",
			"seal": "operation.cleanup.seal", "reconcile": "operation.cleanup.reconcile",
		}
		operation, ok := operations[parts[2]]
		if !ok {
			return evaluationControlledWorkspaceRoute{}, ErrInvalid
		}
		return exact(operation, "operations/cleanup/"+parts[2])
	default:
		return evaluationControlledWorkspaceRoute{}, ErrInvalid
	}
}

func decodeCanonicalEvaluationObject(source []byte, maximum int) (map[string]any, error) {
	if len(source) == 0 || len(source) > maximum || canonicaljson.ValidateRawEnvelope(source, maximum) != nil {
		return nil, ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil || value == nil {
		return nil, ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil, ErrInvalid
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) {
		return nil, ErrInvalid
	}
	return value, nil
}

func controlledWorkspaceBindingSource(operation string, payload map[string]any) (map[string]any, error) {
	switch operation {
	case "grant.issue":
		if !exactEvaluationKeys(payload, []string{
			"planDigest", "attemptId", "descriptorDigest", "caseId", "materialDigest",
			"access", "fixture", "toolRegistryDigest", "actionRegistryDigest",
			"toolIds", "actionIds", "targetRefs",
		}) {
			return nil, ErrInvalid
		}
		return payload, nil
	case "session.load-or-reattach":
		if !exactEvaluationKeys(payload, []string{"material", "fixture", "grant", "isolationPolicyDigest"}) {
			return nil, ErrInvalid
		}
		grant, ok := objectMember(payload, "grant")
		if !ok {
			return nil, ErrInvalid
		}
		return grant, nil
	case "session.orphans.list":
		if len(payload) != 0 {
			return nil, ErrInvalid
		}
		return payload, nil
	case "session.orphan.destroy":
		if !exactEvaluationKeys(payload, []string{
			"orphan", "cleanupIntentDigest", "cleanupDispatchReceiptDigest", "idempotencyKey",
		}) {
			return nil, ErrInvalid
		}
		orphan, ok := objectMember(payload, "orphan")
		if !ok {
			return nil, ErrInvalid
		}
		if descriptorDigest := stringMember(orphan, "modelDescriptorDigest"); descriptorDigest != "" {
			orphan = cloneEvaluationObject(orphan)
			orphan["descriptorDigest"] = descriptorDigest
		}
		return orphan, nil
	case "session.preflight", "session.restore-checkpoint", "session.execute",
		"session.reconcile-dispatched", "session.artifact.resolve", "session.assess-final", "session.destroy":
		if !exactEvaluationKeys(payload, []string{"sessionId", "attemptId", "grantDigest", "generation", "value"}) {
			return nil, ErrInvalid
		}
		return payload, nil
	case "operation.dispatch", "operation.seal-rejected", "operation.seal-atomic",
		"operation.reconcile-dispatched":
		required := map[string][]string{
			"operation.dispatch":             {"intent", "claim"},
			"operation.seal-rejected":        {"intent", "claim", "output", "authorityReceiptDigests", "checkpoint"},
			"operation.seal-atomic":          {"intent", "claim", "dispatch", "output", "effect", "authorityReceiptDigests", "checkpoint"},
			"operation.reconcile-dispatched": {"intent", "claim", "dispatch", "reason"},
		}
		if !exactEvaluationKeys(payload, required[operation]) {
			return nil, ErrInvalid
		}
		intent, ok := objectMember(payload, "intent")
		if !ok || !exactControlledWorkspaceOperationIntent(intent) {
			return nil, ErrInvalid
		}
		return intent, nil
	case "operation.cleanup.dispatch", "operation.cleanup.seal", "operation.cleanup.reconcile":
		required := map[string][]string{
			"operation.cleanup.dispatch":  {"intent", "claim"},
			"operation.cleanup.seal":      {"intent", "claim", "dispatch", "cleanupReceipt"},
			"operation.cleanup.reconcile": {"intent", "claim", "dispatch", "reason"},
		}
		if !exactEvaluationKeys(payload, required[operation]) {
			return nil, ErrInvalid
		}
		intent, ok := objectMember(payload, "intent")
		if !ok || !exactControlledWorkspaceCleanupIntent(intent) {
			return nil, ErrInvalid
		}
		return intent, nil
	case "operation.attempt-state.load", "operation.sealed.list":
		if !exactEvaluationKeys(payload, []string{"attemptId", "grantDigest", "generation"}) {
			return nil, ErrInvalid
		}
		return payload, nil
	case "operation.sealed.load":
		if !exactEvaluationKeys(payload, []string{"attemptId", "grantDigest", "generation", "receiptDigest"}) {
			return nil, ErrInvalid
		}
		return payload, nil
	case "operation.claim":
		if !exactControlledWorkspaceOperationIntent(payload) {
			return nil, ErrInvalid
		}
		return payload, nil
	case "operation.cleanup.claim":
		if !exactControlledWorkspaceCleanupIntent(payload) {
			return nil, ErrInvalid
		}
		return payload, nil
	default:
		return nil, ErrInvalid
	}
}

func cloneEvaluationObject(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source)+1)
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func exactControlledWorkspaceOperationIntent(value map[string]any) bool {
	return exactEvaluationKeys(value, []string{
		"format", "version", "operationId", "idempotencyKey", "intentDigest",
		"planDigest", "attemptId", "descriptorDigest", "caseId", "materialDigest",
		"loopPolicyDigest", "turnIndex", "toolCallId", "toolId", "argumentsDigest",
		"grantDigest", "toolRegistryDigest", "toolDefinitionDigest", "inputSchemaDigest",
		"generation", "sessionId", "priorCheckpointDigest", "grantExpiresAt",
		"maximumToolCallsPerAttempt", "maximumRepairRoundsPerAttempt",
		"maximumAggregateToolResultBytes",
	})
}

func exactControlledWorkspaceCleanupIntent(value map[string]any) bool {
	return exactEvaluationKeys(value, []string{
		"format", "version", "operationId", "idempotencyKey", "planDigest",
		"attemptId", "descriptorDigest", "caseId", "materialDigest", "sessionId",
		"grantDigest", "generation", "checkpointDigest", "reason", "intentDigest",
	})
}

func controlledWorkspaceRequiresPlanBinding(operation string) bool {
	switch operation {
	case "grant.issue", "session.load-or-reattach", "session.orphan.destroy",
		"operation.claim", "operation.dispatch", "operation.seal-rejected",
		"operation.seal-atomic", "operation.reconcile-dispatched",
		"operation.cleanup.claim", "operation.cleanup.dispatch",
		"operation.cleanup.seal", "operation.cleanup.reconcile":
		return true
	default:
		return false
	}
}

type evaluationControlledWorkspaceGrant struct {
	PlanDigest           string
	AttemptID            string
	DescriptorDigest     string
	CaseID               string
	MaterialDigest       string
	FixtureDigest        string
	BaseSnapshotDigest   string
	ToolRegistryDigest   string
	ActionRegistryDigest string
	Generation           int64
	MaximumUses          int64
	GrantDigest          string
	ExpiresAt            time.Time
	Value                map[string]any
}

func decodeEvaluationControlledWorkspaceGrant(value map[string]any) (evaluationControlledWorkspaceGrant, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "grantId", "authorityId", "planDigest", "attemptId",
		"descriptorDigest", "caseId", "materialDigest", "fixtureDigest", "baseSnapshotDigest",
		"toolRegistryDigest", "actionRegistryDigest", "allowedToolIds", "allowedActionIds",
		"allowedTargetRefs", "generation", "maximumUses", "issuedAt", "expiresAt", "grantDigest",
	}) || stringMember(value, "format") != "prodivix.agent-evaluation-controlled-workspace-grant" {
		return evaluationControlledWorkspaceGrant{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	generation, generationOK := integerMember(value, "generation")
	maximumUses, usesOK := integerMember(value, "maximumUses")
	if !versionOK || version != 1 || !generationOK || generation < 1 || !usesOK || maximumUses < 1 ||
		!validEvaluationServiceIdentity(stringMember(value, "grantId")) ||
		!validEvaluationServiceIdentity(stringMember(value, "authorityId")) ||
		!validEvaluationServiceIdentity(stringMember(value, "attemptId")) ||
		!validEvaluationServiceIdentity(stringMember(value, "caseId")) {
		return evaluationControlledWorkspaceGrant{}, ErrInvalid
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "materialDigest", "fixtureDigest", "baseSnapshotDigest",
		"toolRegistryDigest", "actionRegistryDigest", "grantDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationControlledWorkspaceGrant{}, ErrInvalid
		}
	}
	for _, field := range []string{"allowedToolIds", "allowedActionIds", "allowedTargetRefs"} {
		values, err := evaluationStringArray(value[field], maximumEvaluationControlledWorkspaceFacts, field == "allowedActionIds")
		if err != nil {
			return evaluationControlledWorkspaceGrant{}, err
		}
		for index, identity := range values {
			if !validEvaluationServiceIdentity(identity) || index > 0 && values[index-1] >= identity {
				return evaluationControlledWorkspaceGrant{}, ErrInvalid
			}
		}
	}
	issuedAt, issuedErr := time.Parse(time.RFC3339Nano, stringMember(value, "issuedAt"))
	expiresAt, expiresErr := time.Parse(time.RFC3339Nano, stringMember(value, "expiresAt"))
	base := cloneEvaluationObject(value)
	delete(base, "grantDigest")
	grantDigest, digestErr := canonicaljson.Digest(base)
	if issuedErr != nil || expiresErr != nil || !expiresAt.After(issuedAt) ||
		digestErr != nil || grantDigest != stringMember(value, "grantDigest") {
		return evaluationControlledWorkspaceGrant{}, ErrInvalid
	}
	return evaluationControlledWorkspaceGrant{
		PlanDigest: stringMember(value, "planDigest"), AttemptID: stringMember(value, "attemptId"),
		DescriptorDigest: stringMember(value, "descriptorDigest"), CaseID: stringMember(value, "caseId"),
		MaterialDigest: stringMember(value, "materialDigest"), FixtureDigest: stringMember(value, "fixtureDigest"),
		BaseSnapshotDigest:   stringMember(value, "baseSnapshotDigest"),
		ToolRegistryDigest:   stringMember(value, "toolRegistryDigest"),
		ActionRegistryDigest: stringMember(value, "actionRegistryDigest"),
		Generation:           generation, MaximumUses: maximumUses,
		GrantDigest: grantDigest, ExpiresAt: expiresAt.UTC(), Value: value,
	}, nil
}

func controlledWorkspaceGrantMatchesRequest(
	grant evaluationControlledWorkspaceGrant,
	payload map[string]any,
) bool {
	fixture, fixtureOK := objectMember(payload, "fixture")
	if !fixtureOK || grant.PlanDigest != stringMember(payload, "planDigest") ||
		grant.AttemptID != stringMember(payload, "attemptId") ||
		grant.DescriptorDigest != stringMember(payload, "descriptorDigest") ||
		grant.CaseID != stringMember(payload, "caseId") ||
		grant.MaterialDigest != stringMember(payload, "materialDigest") ||
		grant.FixtureDigest != stringMember(fixture, "fixtureDigest") ||
		grant.BaseSnapshotDigest != stringMember(fixture, "workspaceSnapshotDigest") ||
		grant.ToolRegistryDigest != stringMember(payload, "toolRegistryDigest") ||
		grant.ActionRegistryDigest != stringMember(payload, "actionRegistryDigest") {
		return false
	}
	pairs := [][2]string{{"toolIds", "allowedToolIds"}, {"actionIds", "allowedActionIds"}, {"targetRefs", "allowedTargetRefs"}}
	for _, pair := range pairs {
		expected, err := evaluationStringArray(payload[pair[0]], maximumEvaluationControlledWorkspaceFacts, pair[0] == "actionIds")
		if err != nil {
			return false
		}
		sort.Strings(expected)
		actual, err := evaluationStringArray(grant.Value[pair[1]], maximumEvaluationControlledWorkspaceFacts, pair[1] == "allowedActionIds")
		if err != nil || len(expected) != len(actual) {
			return false
		}
		for index := range expected {
			if expected[index] != actual[index] {
				return false
			}
		}
	}
	return true
}

func exactControlledWorkspaceFactShape(operation string, value map[string]any) bool {
	schemas := map[string]struct {
		required []string
		optional []string
	}{
		"grant.issue": {required: []string{
			"format", "version", "grantId", "authorityId", "planDigest", "attemptId", "descriptorDigest",
			"caseId", "materialDigest", "fixtureDigest", "baseSnapshotDigest", "toolRegistryDigest",
			"actionRegistryDigest", "allowedToolIds", "allowedActionIds", "allowedTargetRefs", "generation",
			"maximumUses", "issuedAt", "expiresAt", "grantDigest",
		}},
		"session.load-or-reattach": {required: []string{
			"status", "session", "sessionId", "attemptId", "grantDigest", "generation",
			"currentCheckpointDigest", "attachmentReceiptDigest",
		}},
		"session.orphans.list": {required: []string{
			"planDigest", "attemptId", "modelDescriptorDigest", "caseId", "materialDigest", "grantDigest",
			"generation", "sessionId", "currentCheckpoint", "orphanReceiptDigest",
		}},
		"session.orphan.destroy": {required: []string{
			"attemptId", "grantDigest", "generation", "sessionId", "reason", "cleanupIntentDigest",
			"cleanupDispatchReceiptDigest", "cleanupReceiptDigest", "sourceReferencesRevoked",
			"sandboxDestroyed", "residualReferenceCount",
		}, optional: []string{"reverseCleanupReceiptDigest"}},
		"session.preflight": {required: []string{
			"toolId", "argumentsDigest", "grantDigest", "generation", "status", "toolDefinitionDigest",
			"inputSchemaDigest", "preflightReceiptDigest",
		}, optional: []string{"code", "effect", "actionId", "actionDescriptorDigest", "targetRef"}},
		"session.restore-checkpoint": {required: []string{"status", "checkpointDigest", "restorationReceiptDigest"}},
		"session.execute": {required: []string{
			"intentDigest", "dispatchReceiptDigest", "grantDigest", "generation", "status", "effectKind", "result",
			"snapshotBeforeDigest", "snapshotAfterDigest", "canonicalWriteObserved", "persistedArtifacts",
			"commandReceiptDigests", "transactionReceiptDigests", "authorityReceiptDigests", "repairRoundCount",
			"changedDocumentIds", "checkpoint", "publicScan", "effectReceiptDigest",
		}, optional: []string{"domainDryRun", "g3Verification", "controlledPreview"}},
		"session.reconcile-dispatched": {required: []string{"status"}, optional: []string{
			"effect", "intentDigest", "dispatchReceiptDigest", "grantDigest", "generation",
			"reconciliationReceiptDigest", "cleanupReceiptDigest",
		}},
		"session.artifact.resolve": {required: []string{
			"artifactKind", "artifactRef", "artifactDigest", "byteLength", "persistenceReceiptDigest",
		}},
		"session.assess-final": {required: []string{
			"attemptId", "grantDigest", "generation", "finalSnapshotDigest", "finalCheckpointDigest",
			"proposalValidation", "g3Verification", "repairRoundCount", "authorityReceiptDigests",
			"authorityReceiptSetDigest", "publicScan", "finalAuthorityReceiptDigest",
		}, optional: []string{"controlledPreview"}},
		"session.destroy": {required: []string{
			"attemptId", "grantDigest", "generation", "sessionId", "reason", "cleanupIntentDigest",
			"cleanupDispatchReceiptDigest", "cleanupReceiptDigest", "sourceReferencesRevoked",
			"sandboxDestroyed", "residualReferenceCount",
		}, optional: []string{"reverseCleanupReceiptDigest"}},
		"operation.attempt-state.load": {required: []string{
			"attemptId", "grantDigest", "generation", "currentCheckpoint", "toolExecutionReceiptDigests",
			"aggregateToolResultBytes", "repairRoundCount", "completedTurnIndexes", "stateReceiptDigest",
		}},
		"operation.dispatch": {required: []string{
			"claimId", "intentDigest", "operationId", "planDigest", "attemptId", "sessionId", "grantDigest",
			"generation", "priorCheckpointDigest", "stagingRef", "dispatchReceiptDigest",
		}},
		"operation.seal-rejected": {required: []string{
			"intentDigest", "operationId", "planDigest", "attemptId", "sessionId", "grantDigest", "generation",
			"toolExecution", "authorityReceiptDigests", "authorityReceiptSetDigest", "checkpoint", "sealReceiptDigest",
		}},
		"operation.seal-atomic": {required: []string{
			"intentDigest", "operationId", "planDigest", "attemptId", "sessionId", "grantDigest", "generation",
			"dispatchReceiptDigest", "toolExecution", "effect", "authorityReceiptDigests",
			"authorityReceiptSetDigest", "checkpoint", "sealReceiptDigest",
		}},
		"operation.sealed.load": {required: []string{
			"intentDigest", "operationId", "planDigest", "attemptId", "sessionId", "grantDigest", "generation",
			"toolExecution", "authorityReceiptDigests", "authorityReceiptSetDigest", "checkpoint", "sealReceiptDigest",
		}, optional: []string{"dispatchReceiptDigest", "effect"}},
		"operation.sealed.list": {required: []string{
			"intentDigest", "operationId", "planDigest", "attemptId", "sessionId", "grantDigest", "generation",
			"toolExecution", "authorityReceiptDigests", "authorityReceiptSetDigest", "checkpoint", "sealReceiptDigest",
		}, optional: []string{"dispatchReceiptDigest", "effect"}},
		"operation.cleanup.dispatch": {required: []string{
			"claimId", "intentDigest", "attemptId", "sessionId", "grantDigest", "generation", "dispatchReceiptDigest",
		}},
		"operation.cleanup.seal": {required: []string{
			"intentDigest", "attemptId", "sessionId", "grantDigest", "generation", "dispatch",
			"dispatchReceiptDigest", "cleanupReceipt", "sealReceiptDigest",
		}},
	}
	schema, ok := schemas[operation]
	if ok {
		return exactEvaluationKeys(value, schema.required, schema.optional...)
	}
	switch operation {
	case "operation.claim":
		status := stringMember(value, "status")
		if status == "denied" {
			return exactEvaluationKeys(value, []string{"status"})
		}
		return exactEvaluationKeys(value, []string{"status", "claim"}, "dispatch", "seal", "reconciliationReceiptDigest", "cleanupReceiptDigest")
	case "operation.reconcile-dispatched":
		return exactEvaluationKeys(value, []string{"status"}, "seal", "reconciliationReceiptDigest")
	case "operation.cleanup.claim":
		return exactEvaluationKeys(value, []string{"status"}, "claim", "dispatch", "seal")
	case "operation.cleanup.reconcile":
		return exactEvaluationKeys(value, []string{"status", "seal"})
	default:
		return false
	}
}

func validateControlledWorkspaceFacts(
	planDigest string,
	operation string,
	payload json.RawMessage,
	facts []json.RawMessage,
) error {
	allowZero := operation == "operation.attempt-state.load" || operation == "operation.sealed.load"
	allowMany := operation == "session.orphans.list" || operation == "operation.sealed.list"
	if len(facts) > maximumEvaluationControlledWorkspaceFacts ||
		!allowMany && len(facts) > 1 || !allowZero && !allowMany && len(facts) != 1 {
		return ErrInvalid
	}
	payloadValue, err := decodeCanonicalEvaluationObject(payload, maximumEvaluationControlledWorkspaceRequestBytes)
	if err != nil {
		return err
	}
	for _, source := range facts {
		value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationControlledAuthorityResponseBytes)
		if err != nil || !exactControlledWorkspaceFactShape(operation, value) {
			return ErrInvalid
		}
		if operation == "grant.issue" {
			grant, err := decodeEvaluationControlledWorkspaceGrant(value)
			if err != nil || !controlledWorkspaceGrantMatchesRequest(grant, payloadValue) {
				return ErrConflict
			}
		}
		if err := validateControlledWorkspaceFactBinding(planDigest, operation, payloadValue, value); err != nil {
			return err
		}
	}
	return nil
}

type evaluationControlledWorkspaceFactBinding struct {
	PlanDigest            string
	AttemptID             string
	DescriptorDigest      string
	CaseID                string
	MaterialDigest        string
	FixtureDigest         string
	BaseSnapshotDigest    string
	ToolRegistryDigest    string
	ActionRegistryDigest  string
	GrantDigest           string
	Generation            int64
	SessionID             string
	IsolationPolicyDigest string
}

func controlledWorkspaceExpectedFactBinding(
	planDigest string,
	operation string,
	payload map[string]any,
) (evaluationControlledWorkspaceFactBinding, error) {
	expected := evaluationControlledWorkspaceFactBinding{PlanDigest: planDigest}
	if operation == "session.load-or-reattach" {
		grantValue, ok := objectMember(payload, "grant")
		if !ok {
			return expected, ErrInvalid
		}
		grant, err := decodeEvaluationControlledWorkspaceGrant(grantValue)
		if err != nil {
			return expected, err
		}
		expected.PlanDigest = grant.PlanDigest
		expected.AttemptID = grant.AttemptID
		expected.DescriptorDigest = grant.DescriptorDigest
		expected.CaseID = grant.CaseID
		expected.MaterialDigest = grant.MaterialDigest
		expected.FixtureDigest = grant.FixtureDigest
		expected.BaseSnapshotDigest = grant.BaseSnapshotDigest
		expected.ToolRegistryDigest = grant.ToolRegistryDigest
		expected.ActionRegistryDigest = grant.ActionRegistryDigest
		expected.GrantDigest = grant.GrantDigest
		expected.Generation = grant.Generation
		expected.IsolationPolicyDigest = stringMember(payload, "isolationPolicyDigest")
		return expected, nil
	}
	source, err := controlledWorkspaceBindingSource(operation, payload)
	if err != nil {
		return expected, err
	}
	expected.AttemptID = stringMember(source, "attemptId")
	expected.DescriptorDigest = stringMember(source, "descriptorDigest")
	if expected.DescriptorDigest == "" {
		expected.DescriptorDigest = stringMember(source, "modelDescriptorDigest")
	}
	expected.CaseID = stringMember(source, "caseId")
	expected.MaterialDigest = stringMember(source, "materialDigest")
	expected.GrantDigest = stringMember(source, "grantDigest")
	expected.Generation, _ = integerMember(source, "generation")
	expected.SessionID = stringMember(source, "sessionId")
	if expected.SessionID == "" {
		expected.SessionID = stringMember(payload, "sessionId")
	}
	return expected, nil
}

func controlledWorkspaceBindingFieldMatches(value map[string]any, key, expected string) error {
	entry, exists := value[key]
	if !exists {
		return nil
	}
	actual, ok := entry.(string)
	if !ok || actual == "" || expected != "" && actual != expected {
		return ErrConflict
	}
	return nil
}

func validateControlledWorkspaceDirectBinding(
	value map[string]any,
	expected evaluationControlledWorkspaceFactBinding,
) error {
	fields := [][2]string{
		{"planDigest", expected.PlanDigest}, {"attemptId", expected.AttemptID},
		{"descriptorDigest", expected.DescriptorDigest}, {"modelDescriptorDigest", expected.DescriptorDigest},
		{"caseId", expected.CaseID}, {"materialDigest", expected.MaterialDigest},
		{"fixtureDigest", expected.FixtureDigest}, {"baseSnapshotDigest", expected.BaseSnapshotDigest},
		{"toolRegistryDigest", expected.ToolRegistryDigest}, {"actionRegistryDigest", expected.ActionRegistryDigest},
		{"grantDigest", expected.GrantDigest}, {"sessionId", expected.SessionID},
		{"isolationPolicyDigest", expected.IsolationPolicyDigest},
	}
	for _, field := range fields {
		if err := controlledWorkspaceBindingFieldMatches(value, field[0], field[1]); err != nil {
			return err
		}
	}
	if raw, exists := value["generation"]; exists {
		generation, ok := raw.(json.Number)
		if !ok {
			return ErrConflict
		}
		parsed, err := generation.Int64()
		if err != nil || parsed < 1 || expected.Generation > 0 && parsed != expected.Generation {
			return ErrConflict
		}
	}
	for key, raw := range value {
		if strings.HasSuffix(key, "Digest") {
			text, ok := raw.(string)
			if !ok || !evaluationDigestPattern.MatchString(text) {
				return ErrInvalid
			}
		}
		if strings.HasSuffix(key, "Digests") {
			entries, err := evaluationStringArray(raw, maximumEvaluationControlledWorkspaceFacts, true)
			if err != nil {
				return err
			}
			for _, entry := range entries {
				if !evaluationDigestPattern.MatchString(entry) {
					return ErrInvalid
				}
			}
		}
	}
	return nil
}

func controlledWorkspaceReceiptDigestMatches(value map[string]any, digestKey string) bool {
	digest := stringMember(value, digestKey)
	if !evaluationDigestPattern.MatchString(digest) {
		return false
	}
	base := cloneEvaluationObject(value)
	delete(base, digestKey)
	computed, err := canonicaljson.Digest(base)
	return err == nil && computed == digest
}

func validateControlledWorkspaceCheckpoint(
	value map[string]any,
	expected evaluationControlledWorkspaceFactBinding,
) error {
	if !exactEvaluationKeys(value, []string{
		"checkpointRef", "attemptId", "grantDigest", "generation", "checkpointDigest",
		"snapshotDigest", "securePersistenceReceiptDigest",
	}, "predecessorCheckpointDigest") || !validEvaluationServiceIdentity(stringMember(value, "checkpointRef")) {
		return ErrInvalid
	}
	if err := validateControlledWorkspaceDirectBinding(value, expected); err != nil {
		return err
	}
	if !controlledWorkspaceReceiptDigestMatches(value, "checkpointDigest") {
		return ErrConflict
	}
	return nil
}

func validateControlledWorkspaceCleanupReceipt(
	value map[string]any,
	expected evaluationControlledWorkspaceFactBinding,
) error {
	if !exactControlledWorkspaceFactShape("session.destroy", value) {
		return ErrInvalid
	}
	if err := validateControlledWorkspaceDirectBinding(value, expected); err != nil {
		return err
	}
	if !oneOfString(stringMember(value, "reason"), "completed", "failed", "discarded", "orphaned") ||
		value["sourceReferencesRevoked"] != true || value["sandboxDestroyed"] != true {
		return ErrInvalid
	}
	residual, ok := integerMember(value, "residualReferenceCount")
	if !ok || residual != 0 || !controlledWorkspaceReceiptDigestMatches(value, "cleanupReceiptDigest") {
		return ErrConflict
	}
	return nil
}

func validateControlledWorkspaceFactBinding(
	planDigest string,
	operation string,
	payload map[string]any,
	value map[string]any,
) error {
	expected, err := controlledWorkspaceExpectedFactBinding(planDigest, operation, payload)
	if err != nil {
		return err
	}
	if err := validateControlledWorkspaceDirectBinding(value, expected); err != nil {
		return err
	}
	checkpoint := func(container map[string]any, key string, required bool) error {
		nested, ok := objectMember(container, key)
		if !ok {
			if required {
				return ErrInvalid
			}
			return nil
		}
		return validateControlledWorkspaceCheckpoint(nested, expected)
	}
	boundNested := func(container map[string]any, key string) error {
		nested, ok := objectMember(container, key)
		if !ok {
			return nil
		}
		return validateControlledWorkspaceDirectBinding(nested, expected)
	}
	switch operation {
	case "session.load-or-reattach":
		session, ok := objectMember(value, "session")
		if !ok || !exactEvaluationKeys(session, []string{
			"sessionId", "planDigest", "attemptId", "descriptorDigest", "caseId", "materialDigest",
			"fixtureDigest", "baseSnapshotDigest", "grantDigest", "toolRegistryDigest", "actionRegistryDigest",
			"generation", "isolationPolicyDigest", "initialCheckpoint", "currentCheckpoint",
		}) {
			return ErrInvalid
		}
		if err := validateControlledWorkspaceDirectBinding(session, expected); err != nil {
			return err
		}
		expected.SessionID = stringMember(session, "sessionId")
		if !validEvaluationServiceIdentity(expected.SessionID) ||
			stringMember(value, "sessionId") != expected.SessionID ||
			!oneOfString(stringMember(value, "status"), "loaded", "reattached") {
			return ErrConflict
		}
		if err := checkpoint(session, "initialCheckpoint", true); err != nil {
			return err
		}
		if err := checkpoint(session, "currentCheckpoint", true); err != nil {
			return err
		}
		initial, _ := objectMember(session, "initialCheckpoint")
		current, _ := objectMember(session, "currentCheckpoint")
		if stringMember(initial, "snapshotDigest") != expected.BaseSnapshotDigest ||
			initial["predecessorCheckpointDigest"] != nil && stringMember(initial, "predecessorCheckpointDigest") != "" ||
			stringMember(value, "currentCheckpointDigest") != stringMember(current, "checkpointDigest") {
			return ErrConflict
		}
		attachmentBase := map[string]any{
			"status": value["status"], "sessionId": value["sessionId"], "attemptId": value["attemptId"],
			"grantDigest": value["grantDigest"], "generation": value["generation"],
			"currentCheckpointDigest": value["currentCheckpointDigest"],
		}
		digest, digestErr := canonicaljson.Digest(attachmentBase)
		if digestErr != nil || digest != stringMember(value, "attachmentReceiptDigest") {
			return ErrConflict
		}
	case "session.orphans.list":
		orphanExpected := expected
		orphanExpected.AttemptID = stringMember(value, "attemptId")
		orphanExpected.DescriptorDigest = stringMember(value, "modelDescriptorDigest")
		orphanExpected.CaseID = stringMember(value, "caseId")
		orphanExpected.MaterialDigest = stringMember(value, "materialDigest")
		orphanExpected.GrantDigest = stringMember(value, "grantDigest")
		orphanExpected.Generation, _ = integerMember(value, "generation")
		orphanExpected.SessionID = stringMember(value, "sessionId")
		if !validEvaluationServiceIdentity(orphanExpected.AttemptID) ||
			!validEvaluationServiceIdentity(orphanExpected.CaseID) ||
			!validEvaluationServiceIdentity(orphanExpected.SessionID) ||
			orphanExpected.Generation < 1 {
			return ErrInvalid
		}
		if err := validateControlledWorkspaceCheckpointValue(value, "currentCheckpoint", orphanExpected); err != nil {
			return err
		}
		if !controlledWorkspaceReceiptDigestMatches(value, "orphanReceiptDigest") {
			return ErrConflict
		}
	case "session.orphan.destroy", "session.destroy":
		return validateControlledWorkspaceCleanupReceipt(value, expected)
	case "session.preflight":
		requestValue, ok := objectMember(payload, "value")
		if !ok || stringMember(value, "toolId") != stringMember(requestValue, "toolId") ||
			stringMember(value, "argumentsDigest") != stringMember(requestValue, "argumentsDigest") ||
			!controlledWorkspaceReceiptDigestMatches(value, "preflightReceiptDigest") {
			return ErrConflict
		}
	case "session.restore-checkpoint":
		requestValue, ok := objectMember(payload, "value")
		if !ok || stringMember(value, "status") != "restored" ||
			stringMember(value, "checkpointDigest") != stringMember(requestValue, "checkpointDigest") {
			return ErrConflict
		}
	case "session.execute":
		requestValue, ok := objectMember(payload, "value")
		if !ok || stringMember(value, "intentDigest") != stringMember(requestValue, "intentDigest") ||
			stringMember(value, "dispatchReceiptDigest") != stringMember(requestValue, "dispatchReceiptDigest") {
			return ErrConflict
		}
		return checkpoint(value, "checkpoint", true)
	case "session.reconcile-dispatched":
		if effect, ok := objectMember(value, "effect"); ok {
			if !exactControlledWorkspaceFactShape("session.execute", effect) {
				return ErrInvalid
			}
			if err := validateControlledWorkspaceDirectBinding(effect, expected); err != nil {
				return err
			}
			return checkpoint(effect, "checkpoint", true)
		}
	case "session.assess-final":
		if !evaluationDigestPattern.MatchString(stringMember(value, "finalCheckpointDigest")) {
			return ErrInvalid
		}
	case "operation.attempt-state.load":
		if err := checkpoint(value, "currentCheckpoint", true); err != nil {
			return err
		}
		if !controlledWorkspaceReceiptDigestMatches(value, "stateReceiptDigest") {
			return ErrConflict
		}
	case "operation.dispatch", "operation.seal-rejected", "operation.seal-atomic",
		"operation.sealed.load", "operation.sealed.list", "operation.cleanup.dispatch",
		"operation.cleanup.seal":
		for _, key := range []string{"claim", "dispatch", "seal", "effect", "cleanupReceipt"} {
			if err := boundNested(value, key); err != nil {
				return err
			}
		}
		if nested, ok := objectMember(value, "checkpoint"); ok {
			if err := validateControlledWorkspaceCheckpoint(nested, expected); err != nil {
				return err
			}
		}
	case "operation.claim", "operation.reconcile-dispatched", "operation.cleanup.claim", "operation.cleanup.reconcile":
		for _, key := range []string{"claim", "dispatch", "seal"} {
			if err := boundNested(value, key); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateControlledWorkspaceCheckpointValue(
	container map[string]any,
	key string,
	expected evaluationControlledWorkspaceFactBinding,
) error {
	checkpoint, ok := objectMember(container, key)
	if !ok {
		return ErrInvalid
	}
	return validateControlledWorkspaceCheckpoint(checkpoint, expected)
}

func controlledWorkspaceRequestBinding(
	partition EvaluationPlanPartition,
	route evaluationControlledWorkspaceRoute,
	requestDigest string,
	payload json.RawMessage,
) (EvaluationControlledAuthorityRequestBinding, error) {
	payloadObject, err := decodeCanonicalEvaluationObject(payload, maximumEvaluationControlledWorkspaceRequestBytes)
	if err != nil {
		return EvaluationControlledAuthorityRequestBinding{}, err
	}
	source, err := controlledWorkspaceBindingSource(route.Operation, payloadObject)
	if err != nil {
		return EvaluationControlledAuthorityRequestBinding{}, err
	}
	planDigest := stringMember(source, "planDigest")
	if controlledWorkspaceRequiresPlanBinding(route.Operation) && planDigest == "" {
		return EvaluationControlledAuthorityRequestBinding{}, ErrInvalid
	}
	if planDigest != "" && planDigest != partition.PlanDigest {
		return EvaluationControlledAuthorityRequestBinding{}, ErrConflict
	}
	attemptID := stringMember(source, "attemptId")
	descriptorDigest := stringMember(source, "descriptorDigest")
	grantDigest := stringMember(source, "grantDigest")
	generation, generationOK := integerMember(source, "generation")
	if !generationOK {
		generation = 0
	}
	if route.SessionID != "" && stringMember(payloadObject, "sessionId") != route.SessionID {
		return EvaluationControlledAuthorityRequestBinding{}, ErrConflict
	}
	if route.Operation != "session.orphans.list" &&
		(attemptID == "" || !validEvaluationServiceIdentity(attemptID)) {
		return EvaluationControlledAuthorityRequestBinding{}, ErrInvalid
	}
	if route.Operation == "grant.issue" && descriptorDigest == "" ||
		route.Operation != "grant.issue" && route.Operation != "session.orphans.list" && grantDigest == "" ||
		route.Operation != "grant.issue" && route.Operation != "session.orphans.list" && generation < 1 ||
		descriptorDigest != "" && !evaluationDigestPattern.MatchString(descriptorDigest) ||
		grantDigest != "" && !evaluationDigestPattern.MatchString(grantDigest) ||
		generation < 0 || generation > 9_007_199_254_740_991 {
		return EvaluationControlledAuthorityRequestBinding{}, ErrInvalid
	}
	base := struct {
		Format           string `json:"format"`
		Version          int64  `json:"version"`
		ServiceKind      string `json:"serviceKind"`
		Operation        string `json:"operation"`
		RouteBinding     string `json:"routeBinding"`
		PlanDigest       string `json:"planDigest"`
		RepositoryCommit string `json:"repositoryCommit"`
		RequestDigest    string `json:"requestDigest"`
		AttemptID        string `json:"attemptId,omitempty"`
		DescriptorDigest string `json:"descriptorDigest,omitempty"`
		GrantDigest      string `json:"grantDigest,omitempty"`
		Generation       int64  `json:"generation,omitempty"`
	}{
		Format: "prodivix.agent-evaluation-server-only-request-binding", Version: 1,
		ServiceKind: "controlled-workspace", Operation: route.Operation,
		RouteBinding: route.RouteBinding, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, RequestDigest: requestDigest,
		AttemptID: attemptID, DescriptorDigest: descriptorDigest,
		GrantDigest: grantDigest, Generation: generation,
	}
	bindingDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationControlledAuthorityRequestBinding{}, err
	}
	return EvaluationControlledAuthorityRequestBinding{
		ServiceKind: "controlled-workspace", Operation: route.Operation,
		RouteBinding: route.RouteBinding, RequestDigest: requestDigest,
		RequestBindingDigest: bindingDigest, AttemptID: attemptID,
		DescriptorDigest: descriptorDigest, GrantDigest: grantDigest, Generation: generation,
	}, nil
}

func controlledWorkspaceAcknowledgement(
	planDigest string,
	operation string,
	requestDigest string,
	payload json.RawMessage,
	facts []json.RawMessage,
) ([]byte, error) {
	if err := validateControlledWorkspaceFacts(planDigest, operation, payload, facts); err != nil {
		return nil, err
	}
	if len(facts) > maximumEvaluationControlledWorkspaceFacts {
		return nil, ErrInvalid
	}
	cloned := make([]json.RawMessage, len(facts))
	for index := range facts {
		if len(facts[index]) == 0 || len(facts[index]) > maximumEvaluationControlledAuthorityResponseBytes ||
			canonicaljson.ValidateRawEnvelope(facts[index], maximumEvaluationControlledAuthorityResponseBytes) != nil {
			return nil, ErrInvalid
		}
		var value any
		decoder := json.NewDecoder(bytes.NewReader(facts[index]))
		decoder.UseNumber()
		if err := decoder.Decode(&value); err != nil {
			return nil, ErrInvalid
		}
		canonical, err := canonicaljson.Bytes(value)
		if err != nil || !bytes.Equal(canonical, facts[index]) {
			return nil, ErrInvalid
		}
		cloned[index] = append(json.RawMessage(nil), facts[index]...)
	}
	base := evaluationControlledWorkspaceAcknowledgementBase{
		Format:    evaluationControlledWorkspaceServiceFormat,
		Version:   evaluationControlledWorkspaceServiceVersion,
		Operation: operation, RequestDigest: requestDigest, Facts: cloned,
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	response, err := canonicaljson.Bytes(evaluationControlledWorkspaceAcknowledgement{
		evaluationControlledWorkspaceAcknowledgementBase: base,
		ReceiptDigest: receiptDigest,
	})
	if err != nil || len(response) > maximumEvaluationControlledAuthorityResponseBytes {
		return nil, errEvaluationServiceResponseTooLarge
	}
	return response, nil
}

func exactEvaluationIdempotencyHeader(request *http.Request, expected string) bool {
	values := request.Header.Values("Idempotency-Key")
	return len(values) == 1 && values[0] == expected && strings.TrimSpace(values[0]) == values[0]
}

func (handler *EvaluationServiceHandler) handleControlledWorkspace(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method != http.MethodPost || !evaluationServiceQueryIsExact(request) {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if handler.controlledWorkspaceAuthority == nil || handler.controlledWorkspaceResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	route, err := evaluationControlledWorkspaceRouteFor(tail)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationControlledWorkspaceRequestBytes)
	if err != nil || canonicaljson.ValidateRawEnvelope(source, maximumEvaluationControlledWorkspaceRequestBytes) != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	var envelope evaluationControlledWorkspaceServiceEnvelope
	if err := decodeEvaluationServiceRawJSON(source, &envelope); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	base := evaluationControlledWorkspaceServiceRequestBase{
		Format: envelope.Format, Version: envelope.Version, Operation: envelope.Operation,
		NamespaceID: envelope.NamespaceID, PlanDigest: envelope.PlanDigest,
		RepositoryCommit: envelope.RepositoryCommit, Payload: envelope.Payload,
	}
	requestDigest, digestErr := canonicaljson.Digest(base)
	canonical, canonicalErr := canonicaljson.Bytes(envelope)
	if digestErr != nil || canonicalErr != nil || !bytes.Equal(canonical, source) ||
		envelope.Format != evaluationControlledWorkspaceServiceFormat ||
		envelope.Version != evaluationControlledWorkspaceServiceVersion ||
		envelope.Operation != route.Operation || envelope.NamespaceID != handler.authority.NamespaceID ||
		envelope.PlanDigest != partition.PlanDigest || envelope.RepositoryCommit != partition.RepositoryCommit ||
		envelope.RequestDigest != requestDigest || !exactEvaluationIdempotencyHeader(request, requestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	binding, err := controlledWorkspaceRequestBinding(partition, route, requestDigest, envelope.Payload)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	digestSource, productionDigestAuthority := handler.controlledWorkspaceAuthority.(evaluationControlledWorkspaceImplementationDigestSource)
	_, productionStateAuthority := handler.controlledWorkspaceAuthority.(EvaluationControlledWorkspaceStateAuthority)
	ownerStateful := evaluationOwnerStatefulOperation("controlled-workspace", route.Operation, route.RouteBinding) &&
		productionDigestAuthority && productionStateAuthority
	statelessFenced := !controlledWorkspaceReadOperation(route.Operation) && !ownerStateful &&
		!evaluationG3CellAdmissionBindingKind(binding)
	var ownerStateRepository evaluationOwnerStateRepository
	var ownerStateAuthority EvaluationControlledWorkspaceStateAuthority
	var ownerStatePrior EvaluationOwnerStatePrior
	if ownerStateful {
		var repositoryOK, authorityOK bool
		ownerStateRepository, repositoryOK = handler.repository.(evaluationOwnerStateRepository)
		ownerStateAuthority, authorityOK = handler.controlledWorkspaceAuthority.(EvaluationControlledWorkspaceStateAuthority)
		implementationDigest, digestOK := digestSource.ControlledWorkspaceImplementationDigest()
		if !repositoryOK || !authorityOK || !digestOK {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		binding.OwnerImplementationDigest = implementationDigest
		ownerStateID, identityErr := evaluationOwnerStateIdentity(
			"controlled-workspace", handler.authority.NamespaceID, partition, binding.AttemptID,
			binding.DescriptorDigest, binding.GrantDigest, binding.Generation,
		)
		if identityErr != nil {
			respondEvaluationServiceError(writer, identityErr)
			return
		}
		ownerStatePrior = EvaluationOwnerStatePrior{
			OwnerStateID: ownerStateID, OwnerImplementationDigest: implementationDigest,
		}
		current, stateErr := ownerStateRepository.GetEvaluationOwnerState(
			request.Context(), handler.authority, partition, "controlled-workspace", ownerStateID,
		)
		if stateErr == nil {
			ownerStatePrior.Revision = current.Revision
			ownerStatePrior.RootDigest = current.RootDigest
			ownerStatePrior.Bundle = append(json.RawMessage(nil), current.BundleBytes...)
		} else if !errors.Is(stateErr, ErrNotFound) || route.Operation != "session.load-or-reattach" {
			if errors.Is(stateErr, ErrNotFound) {
				stateErr = ErrConflict
			}
			respondEvaluationServiceError(writer, stateErr)
			return
		}
	}
	if statelessFenced {
		if !productionDigestAuthority {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		implementationDigest, digestOK := digestSource.ControlledWorkspaceImplementationDigest()
		if !digestOK {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		binding.OwnerImplementationDigest = implementationDigest
	}
	authorizer, ok := handler.repository.(evaluationControlledWorkspaceRequestAuthorizer)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if err := authorizer.AuthorizeEvaluationControlledWorkspaceRequest(
		request.Context(), handler.authority, partition, binding,
	); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	authorityRequest := EvaluationControlledWorkspaceAuthorityRequest{
		NamespaceID: handler.authority.NamespaceID, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, Operation: route.Operation,
		RouteBinding: route.RouteBinding, SessionID: route.SessionID,
		AttemptID: binding.AttemptID, DescriptorDigest: binding.DescriptorDigest,
		GrantDigest: binding.GrantDigest, Generation: binding.Generation,
		RequestDigest: requestDigest, Payload: append(json.RawMessage(nil), envelope.Payload...),
	}
	if ownerStateful {
		authorityRequest.OwnerImplementationDigest = binding.OwnerImplementationDigest
		authorityRequest.OwnerStateID = ownerStatePrior.OwnerStateID
		authorityRequest.OwnerStateRevision = ownerStatePrior.Revision
		authorityRequest.OwnerStateBundle = append(json.RawMessage(nil), ownerStatePrior.Bundle...)
		authorityRequest.OwnerStateRootDigest = ownerStatePrior.RootDigest
	} else if statelessFenced {
		authorityRequest.OwnerImplementationDigest = binding.OwnerImplementationDigest
	}
	if controlledWorkspaceReadOperation(route.Operation) {
		facts, err := handler.controlledWorkspaceAuthority.ReadControlledWorkspace(
			request.Context(), authorityRequest,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		response, err := controlledWorkspaceAcknowledgement(
			partition.PlanDigest, route.Operation, requestDigest, envelope.Payload, facts,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if err := handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
			request.Context(), route.Operation, requestDigest, response,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, response)
		return
	}
	repository, ok := handler.repository.(evaluationControlledAuthorityRequestRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	record, _, err := repository.ClaimEvaluationControlledAuthorityRequest(
		request.Context(), handler.authority, partition, binding, time.Now().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if record.State == "sealed" {
		if len(record.ResponseBytes) == 0 {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		if err := handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
			request.Context(), route.Operation, requestDigest, record.ResponseBytes,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, record.ResponseBytes)
		return
	}
	authorityRequest.ClaimGeneration = record.ClaimGeneration
	var facts []json.RawMessage
	if ownerStateful {
		facts, err = handler.executeControlledWorkspaceOwnerState(
			request, partition, binding, record, ownerStatePrior, ownerStateRepository,
			ownerStateAuthority, authorityRequest,
		)
	} else if statelessFenced {
		fenceRepository, ok := handler.repository.(evaluationControlledWorkspaceStatelessFenceRepository)
		if !ok {
			err = errEvaluationServiceUnavailable
		} else if record.State == "claimed" {
			stageDigest, stageErr := evaluationControlledWorkspaceDirectStageDigest(
				handler.authority.NamespaceID, partition, route, requestDigest, binding.OwnerImplementationDigest,
			)
			if stageErr != nil {
				err = stageErr
			} else {
				record, _, err = fenceRepository.StageEvaluationControlledWorkspaceStatelessDispatch(
					request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
					stageDigest, handler.clock().UTC(),
				)
			}
			if err == nil && record.State == "sealed" {
				storedFacts, storedErr := evaluationControlledWorkspaceOwnerLedgerResponseFacts(EvaluationControlledWorkspaceOwnerLedgerRecord{
					Operation: record.Operation, RequestDigest: record.RequestDigest, ResponseBytes: record.ResponseBytes,
				})
				if storedErr != nil {
					err = storedErr
				} else {
					facts = make([]json.RawMessage, len(storedFacts))
					for index, fact := range storedFacts {
						facts[index], err = evaluationControlledWorkspaceCanonicalRaw(fact)
						if err != nil {
							break
						}
					}
				}
			} else if err == nil {
				authorityRequest.StageDigest = stageDigest
				facts, err = handler.controlledWorkspaceAuthority.ExecuteControlledWorkspace(
					request.Context(), authorityRequest,
				)
			}
		} else if record.State == "sealed" {
			storedFacts, storedErr := evaluationControlledWorkspaceOwnerLedgerResponseFacts(EvaluationControlledWorkspaceOwnerLedgerRecord{
				Operation: record.Operation, RequestDigest: record.RequestDigest, ResponseBytes: record.ResponseBytes,
			})
			if storedErr != nil {
				err = storedErr
			} else {
				facts = make([]json.RawMessage, len(storedFacts))
				for index, fact := range storedFacts {
					facts[index], err = evaluationControlledWorkspaceCanonicalRaw(fact)
					if err != nil {
						break
					}
				}
			}
		} else {
			// A dispatched row without a sealed direct result is an ambiguous
			// pre-effect fence. Recovery stays read-only and requires requalification.
			err = errEvaluationServiceUnavailable
		}
	} else if record.State == "claimed" {
		facts, err = handler.controlledWorkspaceAuthority.ExecuteControlledWorkspace(
			request.Context(), authorityRequest,
		)
		if err == nil {
			record, _, err = repository.MarkEvaluationControlledAuthorityDispatched(
				request.Context(), handler.authority, partition, binding,
				record.ClaimGeneration, time.Now().UTC(),
			)
		}
	} else {
		var reconciled bool
		facts, reconciled, err = handler.controlledWorkspaceAuthority.ReconcileControlledWorkspace(
			request.Context(), authorityRequest,
		)
		if err == nil && !reconciled {
			err = errEvaluationServiceUnavailable
		}
	}
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if record.State == "sealed" {
		if len(record.ResponseBytes) == 0 {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		if err := handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
			request.Context(), route.Operation, requestDigest, record.ResponseBytes,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, record.ResponseBytes)
		return
	}
	response, err := controlledWorkspaceAcknowledgement(
		partition.PlanDigest, route.Operation, requestDigest, envelope.Payload, facts,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
		request.Context(), route.Operation, requestDigest, response,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	responseDigest, err := evaluationCanonicalByteDigest(response, maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	var sealed EvaluationControlledAuthorityRequestRecord
	if statelessFenced {
		fenceRepository, ok := handler.repository.(evaluationControlledWorkspaceStatelessFenceRepository)
		if !ok || !evaluationDigestPattern.MatchString(authorityRequest.StageDigest) {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		dispatchAckDigest, digestErr := evaluationControlledWorkspaceDirectDispatchAckDigest(
			handler.authority.NamespaceID, partition, route, requestDigest,
			binding.OwnerImplementationDigest, authorityRequest.StageDigest, facts,
		)
		if digestErr != nil {
			respondEvaluationServiceError(writer, digestErr)
			return
		}
		sealed, _, err = fenceRepository.SealEvaluationControlledWorkspaceStatelessResult(
			request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
			authorityRequest.StageDigest, dispatchAckDigest, responseDigest, response, handler.clock().UTC(),
		)
	} else {
		sealed, _, err = repository.SealEvaluationControlledAuthorityRequest(
			request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
			responseDigest, response, time.Now().UTC(),
		)
	}
	if err != nil || !bytes.Equal(sealed.ResponseBytes, response) {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) executeControlledWorkspaceOwnerState(
	request *http.Request,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	record EvaluationControlledAuthorityRequestRecord,
	prior EvaluationOwnerStatePrior,
	repository evaluationOwnerStateRepository,
	authority EvaluationControlledWorkspaceStateAuthority,
	authorityRequest EvaluationControlledWorkspaceAuthorityRequest,
) ([]json.RawMessage, error) {
	var transition EvaluationOwnerStateTransition
	if record.State == "claimed" {
		stageDigest, err := authority.StageControlledWorkspaceState(request.Context(), authorityRequest)
		if err != nil {
			return nil, err
		}
		expectedStage, err := evaluationOwnerStateStageDigest(
			"controlled-workspace", binding.Operation, binding.RouteBinding, binding.RequestDigest,
			binding.OwnerImplementationDigest, prior.OwnerStateID, prior.Revision, prior.RootDigest,
		)
		if err != nil || stageDigest != expectedStage {
			return nil, ErrConflict
		}
		if _, _, err := repository.StageEvaluationOwnerStateDispatch(
			request.Context(), handler.authority, partition, binding, prior, handler.clock().UTC(),
		); err != nil {
			return nil, err
		}
		authorityRequest.StageDigest = stageDigest
		transition, err = authority.ExecuteControlledWorkspaceState(request.Context(), authorityRequest)
		if err != nil {
			return nil, err
		}
	} else if record.State == "dispatched" {
		dispatch, err := repository.GetEvaluationOwnerStateDispatch(
			request.Context(), handler.authority, partition, "controlled-workspace", binding.RequestDigest,
		)
		if err != nil || dispatch.ResultReceiptDigest == "" {
			if err != nil {
				return nil, err
			}
			return nil, errEvaluationServiceUnavailable
		}
		current, err := repository.GetEvaluationOwnerState(
			request.Context(), handler.authority, partition, "controlled-workspace", dispatch.OwnerStateID,
		)
		if err != nil || current.Revision != dispatch.OwnerStateRevision || current.RootDigest != dispatch.OwnerStateRootDigest {
			if err != nil {
				return nil, err
			}
			return nil, ErrConflict
		}
		sealedValue, err := evaluationOwnerStateSealedOperationValue(EvaluationOwnerStateTransition{
			PublicResult: dispatch.PublicResultBytes, ResponseDigest: dispatch.ResponseDigest,
			OwnerImplementationDigest: dispatch.OwnerImplementationDigest, OwnerStateID: dispatch.OwnerStateID,
			PriorRevision: dispatch.PriorRevision, PriorRootDigest: dispatch.PriorRootDigest,
			StageDigest: dispatch.StageDigest, DispatchAckDigest: dispatch.DispatchAckDigest,
			OwnerStateRevision: dispatch.OwnerStateRevision, OwnerStateRootDigest: dispatch.OwnerStateRootDigest,
		}, "controlled-workspace", dispatch.Operation, dispatch.RouteBinding, dispatch.RequestDigest)
		if err != nil || stringMember(sealedValue, "resultReceiptDigest") != dispatch.ResultReceiptDigest {
			return nil, ErrConflict
		}
		sealedBytes, err := canonicaljson.Bytes(sealedValue)
		if err != nil {
			return nil, err
		}
		authorityRequest.OwnerStateRevision = current.Revision
		authorityRequest.OwnerStateRootDigest = current.RootDigest
		authorityRequest.OwnerStateBundle = append(json.RawMessage(nil), current.BundleBytes...)
		authorityRequest.StageDigest = dispatch.StageDigest
		authorityRequest.DispatchAckDigest = dispatch.DispatchAckDigest
		authorityRequest.SealedOwnerOperation = sealedBytes
		var reconciled bool
		transition, reconciled, err = authority.ReconcileControlledWorkspaceState(request.Context(), authorityRequest)
		if err != nil {
			return nil, err
		}
		if !reconciled {
			return nil, errEvaluationServiceUnavailable
		}
	} else {
		return nil, ErrConflict
	}
	dispatch, err := repository.GetEvaluationOwnerStateDispatch(
		request.Context(), handler.authority, partition, "controlled-workspace", binding.RequestDigest,
	)
	if err != nil || dispatch.ResultReceiptDigest != transition.ResultReceiptDigest ||
		dispatch.DispatchAckDigest != transition.DispatchAckDigest ||
		dispatch.OwnerStateRootDigest != transition.OwnerStateRootDigest ||
		!bytes.Equal(dispatch.PublicResultBytes, transition.PublicResult) {
		if err != nil {
			return nil, err
		}
		return nil, ErrConflict
	}
	value, err := decodeCanonicalEvaluationObject(transition.PublicResult, maximumEvaluationControlledAuthorityResponseBytes)
	entries, ok := value["facts"].([]any)
	if err != nil || !ok || !exactEvaluationKeys(value, []string{"facts"}) ||
		len(entries) > maximumEvaluationControlledWorkspaceFacts {
		return nil, ErrConflict
	}
	facts := make([]json.RawMessage, len(entries))
	for index, entry := range entries {
		facts[index], err = canonicaljson.Bytes(entry)
		if err != nil {
			return nil, ErrConflict
		}
	}
	return facts, nil
}
