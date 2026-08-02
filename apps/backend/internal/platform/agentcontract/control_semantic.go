package agentcontract

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

var agentControlDigestPattern = regexp.MustCompile(`^sha256-[a-f0-9]{64}$`)
var agentControlIdentityPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$`)
var agentControlCredentialPattern = regexp.MustCompile(`(?i)(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{8,})`)
var agentControlDecimalPattern = regexp.MustCompile(`^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$`)
var agentControlCurrencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

func validateAgentControlSemantics(document map[string]any) error {
	if err := rejectUnsafeKeys(document, "/"); err != nil {
		return err
	}
	if err := requireExactObjectKeys(document, []string{"wireVersion", "factType", "value"}, nil); err != nil {
		return fmt.Errorf("Agent control envelope: %w", err)
	}
	factType, _ := document["factType"].(string)
	value, ok := document["value"].(map[string]any)
	if !ok {
		return errors.New("Agent control fact value must be an object")
	}
	switch factType {
	case "task-record":
		return validateAgentTaskRecord(value)
	case "run-snapshot":
		return validateAgentRunSnapshot(value)
	case "run-event":
		return validateAgentRunEvent(value)
	case "audit-export":
		return validateAgentAuditExport(value)
	default:
		return fmt.Errorf("unsupported Agent control fact type %q", factType)
	}
}

func validateAgentTaskRecord(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{"spec", "lineage", "taskDigest"}, nil); err != nil {
		return err
	}
	if err := requireDigest(value["taskDigest"], "/value/taskDigest"); err != nil {
		return err
	}
	spec, ok := value["spec"].(map[string]any)
	if !ok {
		return errors.New("/value/spec must be an object")
	}
	if err := requireExactObjectKeys(spec, []string{
		"taskId", "projectId", "workspaceId", "actor", "mode", "baseRevision",
		"intent", "intentDigest", "targetScope", "policyRef", "policyDigest",
		"initialGrantRef", "budget", "verificationRequirement", "createdAt", "idempotencyKey",
	}, nil); err != nil {
		return fmt.Errorf("/value/spec: %w", err)
	}
	for _, field := range []string{"taskId", "projectId", "workspaceId", "idempotencyKey"} {
		if err := requireIdentity(spec[field], "/value/spec/"+field); err != nil {
			return err
		}
	}
	mode, _ := spec["mode"].(string)
	if !oneOf(mode, "explain", "plan", "propose", "apply") {
		return fmt.Errorf("/value/spec/mode is invalid")
	}
	intent, ok := spec["intent"].(string)
	if !ok || strings.TrimSpace(intent) == "" || len(intent) > 65_536 || utf8.RuneCountInString(intent) > 16_384 {
		return errors.New("/value/spec/intent is empty or oversized")
	}
	if agentControlCredentialPattern.MatchString(intent) {
		return errors.New("/value/spec/intent contains credential-like material")
	}
	intentDigest, err := canonicaljson.Digest(intent)
	if err != nil || spec["intentDigest"] != intentDigest {
		return errors.New("/value/spec/intentDigest does not bind the intent")
	}
	if err := requireDigest(spec["policyDigest"], "/value/spec/policyDigest"); err != nil {
		return err
	}
	actor, ok := spec["actor"].(map[string]any)
	if !ok || requireExactObjectKeys(actor, []string{"kind", "principalId"}, nil) != nil ||
		!oneOf(stringValue(actor["kind"]), "user", "service") ||
		requireIdentity(actor["principalId"], "/value/spec/actor/principalId") != nil {
		return errors.New("/value/spec/actor is invalid")
	}
	if err := validateAgentWorkspaceRevision(spec["baseRevision"], "/value/spec/baseRevision"); err != nil {
		return err
	}
	if err := validateAgentTargetScope(spec["targetScope"]); err != nil {
		return err
	}
	for field, member := range map[string]string{"policyRef": "documentId", "initialGrantRef": "grantId"} {
		reference, ok := spec[field].(map[string]any)
		if !ok || requireExactObjectKeys(reference, []string{member}, nil) != nil ||
			requireIdentity(reference[member], "/value/spec/"+field+"/"+member) != nil {
			return fmt.Errorf("/value/spec/%s is invalid", field)
		}
	}
	if err := validateAgentBudget(spec["budget"], "/value/spec/budget"); err != nil {
		return err
	}
	if err := validateAgentVerificationRequirement(spec["verificationRequirement"]); err != nil {
		return err
	}
	if err := requireInstant(spec["createdAt"], "/value/spec/createdAt"); err != nil {
		return err
	}
	lineage, ok := value["lineage"].(map[string]any)
	if !ok || requireExactObjectKeys(lineage, []string{"reason"}, []string{"parentTaskId"}) != nil {
		return errors.New("/value/lineage is invalid")
	}
	reason := stringValue(lineage["reason"])
	parent, hasParent := lineage["parentTaskId"]
	if !oneOf(reason, "initial", "intent-changed", "scope-changed", "policy-changed") ||
		(reason == "initial" && hasParent) || (reason != "initial" && !hasParent) {
		return errors.New("/value/lineage lifecycle is invalid")
	}
	if hasParent {
		if err := requireIdentity(parent, "/value/lineage/parentTaskId"); err != nil {
			return err
		}
	}
	return requireDigestMatch(value, "taskDigest", "/value/taskDigest")
}

func validateAgentWorkspaceRevision(raw any, path string) error {
	revision, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(revision, []string{"workspaceRev", "routeRev", "opSeq", "documents"}, nil) != nil {
		return fmt.Errorf("%s is invalid", path)
	}
	for _, field := range []string{"workspaceRev", "routeRev", "opSeq"} {
		if _, ok := safeInteger(revision[field]); !ok {
			return fmt.Errorf("%s/%s is not a safe integer", path, field)
		}
	}
	documents, ok := revision["documents"].([]any)
	if !ok || len(documents) > 50_000 {
		return fmt.Errorf("%s/documents is invalid", path)
	}
	previous := ""
	for index, rawDocument := range documents {
		document, ok := rawDocument.(map[string]any)
		if !ok || requireExactObjectKeys(document, []string{"documentId", "contentRev", "metaRev"}, nil) != nil {
			return fmt.Errorf("%s/documents/%d is invalid", path, index)
		}
		id := stringValue(document["documentId"])
		if strings.TrimSpace(id) == "" || (index > 0 && id <= previous) {
			return fmt.Errorf("%s/documents must be unique and canonically ordered", path)
		}
		if _, ok := safeInteger(document["contentRev"]); !ok {
			return fmt.Errorf("%s/documents/%d/contentRev is invalid", path, index)
		}
		if _, ok := safeInteger(document["metaRev"]); !ok {
			return fmt.Errorf("%s/documents/%d/metaRev is invalid", path, index)
		}
		previous = id
	}
	return nil
}

func validateAgentTargetScope(raw any) error {
	scope, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(scope, []string{"targets"}, nil) != nil {
		return errors.New("/value/spec/targetScope is invalid")
	}
	targets, ok := scope["targets"].([]any)
	if !ok || len(targets) < 1 || len(targets) > 512 {
		return errors.New("/value/spec/targetScope/targets has invalid bounds")
	}
	previous := ""
	for index, rawTarget := range targets {
		target, ok := rawTarget.(map[string]any)
		if !ok || requireExactObjectKeys(target, []string{"kind", "id"}, nil) != nil {
			return fmt.Errorf("/value/spec/targetScope/targets/%d is invalid", index)
		}
		kind, id := stringValue(target["kind"]), stringValue(target["id"])
		identity := kind + "\x00" + id
		if !oneOf(kind, "workspace", "document", "semantic-target") ||
			requireIdentity(id, "/value/spec/targetScope/targets/id") != nil || strings.ContainsAny(id, "*?[]{}") ||
			(index > 0 && identity <= previous) {
			return fmt.Errorf("/value/spec/targetScope/targets/%d is invalid or non-canonical", index)
		}
		previous = identity
	}
	return nil
}

func validateAgentVerificationRequirement(raw any) error {
	requirement, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(requirement, []string{"policyRef", "requiredCheckKinds"}, nil) != nil ||
		requireIdentity(requirement["policyRef"], "/value/spec/verificationRequirement/policyRef") != nil {
		return errors.New("/value/spec/verificationRequirement is invalid")
	}
	kinds, ok := requirement["requiredCheckKinds"].([]any)
	if !ok || len(kinds) > 512 {
		return errors.New("/value/spec/verificationRequirement/requiredCheckKinds is invalid")
	}
	previous := ""
	for index, rawKind := range kinds {
		kind, ok := rawKind.(string)
		if !ok || requireIdentity(kind, "/value/spec/verificationRequirement/requiredCheckKinds") != nil ||
			(index > 0 && kind <= previous) {
			return errors.New("verification check kinds must be unique and canonically ordered")
		}
		previous = kind
	}
	return nil
}

func validateAgentBudget(raw any, path string) error {
	budget, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(budget, []string{
		"usageLimits", "costLimits", "maxModelInvocations", "maxToolCalls",
		"maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs",
	}, nil) != nil {
		return fmt.Errorf("%s is invalid", path)
	}
	for _, field := range []string{"maxModelInvocations", "maxToolCalls", "maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs"} {
		if _, ok := safeInteger(budget[field]); !ok {
			return fmt.Errorf("%s/%s is invalid", path, field)
		}
	}
	for _, family := range []struct {
		field    string
		identity string
		validate func(string) bool
	}{
		{"usageLimits", "unit", validAgentUsageUnit},
		{"costLimits", "currency", agentControlCurrencyPattern.MatchString},
	} {
		limits, ok := budget[family.field].([]any)
		if !ok || len(limits) > 512 {
			return fmt.Errorf("%s/%s is invalid", path, family.field)
		}
		previous := ""
		for index, rawLimit := range limits {
			limit, ok := rawLimit.(map[string]any)
			if !ok || requireExactObjectKeys(limit, []string{family.identity, "maximum"}, nil) != nil {
				return fmt.Errorf("%s/%s/%d is invalid", path, family.field, index)
			}
			identity, maximum := stringValue(limit[family.identity]), stringValue(limit["maximum"])
			if !family.validate(identity) || !agentControlDecimalPattern.MatchString(maximum) ||
				(index > 0 && identity <= previous) {
				return fmt.Errorf("%s/%s must be canonical and unique", path, family.field)
			}
			previous = identity
		}
	}
	return nil
}

func validateAgentRunSnapshot(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"run", "taskDigest", "cursor", "callbackAuthority", "attempts", "budgetLedger",
		"cleanupState", "processedEvents", "snapshotDigest",
	}, []string{"pendingOperation"}); err != nil {
		return err
	}
	if err := requireDigest(value["taskDigest"], "/value/taskDigest"); err != nil {
		return err
	}
	run, ok := value["run"].(map[string]any)
	if !ok {
		return errors.New("/value/run must be an object")
	}
	if err := requireExactObjectKeys(run, []string{
		"runId", "taskId", "generation", "attempt", "phase", "baseRevision",
		"policyDigest", "grantRef", "createdAt", "updatedAt",
	}, []string{"outcome", "contextPackDigest", "latestEventDigest"}); err != nil {
		return fmt.Errorf("/value/run: %w", err)
	}
	for _, field := range []string{"runId", "taskId"} {
		if err := requireIdentity(run[field], "/value/run/"+field); err != nil {
			return err
		}
	}
	generation, generationOK := safeInteger(run["generation"])
	attemptNumber, attemptOK := safeInteger(run["attempt"])
	if !generationOK || !attemptOK {
		return errors.New("/value/run generation or attempt is invalid")
	}
	phase, _ := run["phase"].(string)
	if !oneOf(phase, "queued", "preparing", "running", "awaiting-approval", "committing", "verifying", "repairing", "cancelling", "terminal") {
		return errors.New("/value/run phase is invalid")
	}
	outcomeRaw, hasOutcome := run["outcome"]
	outcome, outcomeIsString := outcomeRaw.(string)
	if phase == "terminal" {
		if !hasOutcome || !outcomeIsString || !oneOf(outcome, "succeeded", "failed", "blocked", "cancelled", "budget-exhausted", "infrastructure-error") {
			return errors.New("terminal AgentRun requires an exact outcome")
		}
	} else if hasOutcome {
		return errors.New("non-terminal AgentRun cannot carry an outcome")
	}
	if err := requireDigest(run["policyDigest"], "/value/run/policyDigest"); err != nil {
		return err
	}
	if err := validateAgentWorkspaceRevision(run["baseRevision"], "/value/run/baseRevision"); err != nil {
		return err
	}
	grant, ok := run["grantRef"].(map[string]any)
	if !ok || requireExactObjectKeys(grant, []string{"grantId"}, nil) != nil ||
		requireIdentity(grant["grantId"], "/value/run/grantRef/grantId") != nil {
		return errors.New("/value/run/grantRef is invalid")
	}
	createdAt, createdErr := parseInstant(run["createdAt"])
	updatedAt, updatedErr := parseInstant(run["updatedAt"])
	if createdErr != nil || updatedErr != nil || updatedAt.Before(createdAt) {
		return errors.New("/value/run timestamps are invalid")
	}
	for _, field := range []string{"contextPackDigest", "latestEventDigest"} {
		if member, exists := run[field]; exists {
			if err := requireDigest(member, "/value/run/"+field); err != nil {
				return err
			}
		}
	}
	callback, _ := value["callbackAuthority"].(string)
	if !oneOf(callback, "active", "revoked") {
		return errors.New("/value/callbackAuthority is invalid")
	}
	cleanup, _ := value["cleanupState"].(string)
	if !oneOf(cleanup, "not-required", "pending", "clean", "residual") {
		return errors.New("/value/cleanupState is invalid")
	}
	attempts, ok := value["attempts"].([]any)
	if !ok || len(attempts) > 10_000 || int64(len(attempts)) != attemptNumber {
		return errors.New("/value/attempts is invalid or does not match Run attempt")
	}
	previousAttemptID := ""
	latestAttemptGeneration := int64(0)
	for index, rawAttempt := range attempts {
		attempt, ok := rawAttempt.(map[string]any)
		if !ok {
			return fmt.Errorf("/value/attempts/%d must be an object", index)
		}
		attemptID, attemptGeneration, parentID, err := validateAgentRunAttempt(attempt, index+1)
		if err != nil {
			return fmt.Errorf("/value/attempts/%d: %w", index, err)
		}
		if (index == 0 && parentID != "") || (index > 0 && parentID != previousAttemptID) {
			return errors.New("AgentRun attempt parent lineage is invalid")
		}
		previousAttemptID = attemptID
		latestAttemptGeneration = attemptGeneration
	}
	if generation < latestAttemptGeneration {
		return errors.New("AgentRun generation precedes its latest attempt")
	}
	if pending, exists := value["pendingOperation"]; exists {
		operation, ok := pending.(map[string]any)
		if !ok {
			return errors.New("/value/pendingOperation must be an object")
		}
		if err := validateAgentRunOperation(operation); err != nil {
			return fmt.Errorf("/value/pendingOperation: %w", err)
		}
	}
	ledger, ok := value["budgetLedger"].(map[string]any)
	if !ok {
		return errors.New("/value/budgetLedger must be an object")
	}
	if err := validateAgentBudgetLedger(ledger); err != nil {
		return err
	}
	processed, ok := value["processedEvents"].([]any)
	if !ok || len(processed) > 10_000 {
		return errors.New("/value/processedEvents is invalid or oversized")
	}
	cursor, ok := safeInteger(value["cursor"])
	if !ok || cursor != int64(len(processed)) {
		return errors.New("/value/cursor does not match processed events")
	}
	seenEvents := make(map[string]struct{}, len(processed))
	seenKeys := make(map[string]struct{}, len(processed))
	latest := ""
	for index, raw := range processed {
		entry, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("/value/processedEvents/%d must be an object", index)
		}
		if err := requireExactObjectKeys(entry, []string{"eventId", "idempotencyKey", "type", "requestDigest", "eventDigest"}, nil); err != nil {
			return fmt.Errorf("/value/processedEvents/%d: %w", index, err)
		}
		eventID, _ := entry["eventId"].(string)
		key, _ := entry["idempotencyKey"].(string)
		if requireIdentity(eventID, "/value/processedEvents/eventId") != nil ||
			requireIdentity(key, "/value/processedEvents/idempotencyKey") != nil {
			return fmt.Errorf("/value/processedEvents/%d identity is invalid", index)
		}
		if _, duplicate := seenEvents[eventID]; duplicate {
			return fmt.Errorf("duplicate Agent event id %q", eventID)
		}
		if _, duplicate := seenKeys[key]; duplicate {
			return fmt.Errorf("duplicate Agent event idempotency key %q", key)
		}
		seenEvents[eventID] = struct{}{}
		seenKeys[key] = struct{}{}
		if err := requireDigest(entry["requestDigest"], fmt.Sprintf("/value/processedEvents/%d/requestDigest", index)); err != nil {
			return err
		}
		if err := requireDigest(entry["eventDigest"], fmt.Sprintf("/value/processedEvents/%d/eventDigest", index)); err != nil {
			return err
		}
		if !isAgentControlEventType(stringValue(entry["type"])) {
			return fmt.Errorf("/value/processedEvents/%d type is invalid", index)
		}
		latest, _ = entry["eventDigest"].(string)
	}
	if cursor == 0 {
		if _, exists := run["latestEventDigest"]; exists {
			return errors.New("empty AgentRun cannot have a latest event digest")
		}
	} else if run["latestEventDigest"] != latest {
		return errors.New("AgentRun latest event digest does not match its cursor")
	}
	return requireDigestMatch(value, "snapshotDigest", "/value/snapshotDigest")
}

func validateAgentRunAttempt(value map[string]any, expectedAttempt int) (string, int64, string, error) {
	if err := requireExactObjectKeys(value, []string{
		"attemptId", "attempt", "generation", "reason", "startedAt", "attemptDigest",
	}, []string{"parentAttemptId", "completedAt", "outcome", "failureDigest"}); err != nil {
		return "", 0, "", err
	}
	attemptID := stringValue(value["attemptId"])
	if err := requireIdentity(attemptID, "/attemptId"); err != nil {
		return "", 0, "", err
	}
	attempt, attemptOK := safeInteger(value["attempt"])
	generation, generationOK := safeInteger(value["generation"])
	if !attemptOK || attempt != int64(expectedAttempt) || !generationOK || generation < 1 {
		return "", 0, "", errors.New("attempt number or generation is invalid")
	}
	reason := stringValue(value["reason"])
	if !oneOf(reason, "initial", "retry", "process-recovery", "provider-disconnect") {
		return "", 0, "", errors.New("attempt reason is invalid")
	}
	parentRaw, hasParent := value["parentAttemptId"]
	parentID := stringValue(parentRaw)
	if (reason == "initial" && hasParent) || (reason != "initial" && !hasParent) {
		return "", 0, "", errors.New("attempt parent lifecycle is invalid")
	}
	if hasParent {
		if err := requireIdentity(parentID, "/parentAttemptId"); err != nil {
			return "", 0, "", err
		}
	}
	startedAt, err := parseInstant(value["startedAt"])
	if err != nil {
		return "", 0, "", errors.New("attempt start instant is invalid")
	}
	completedRaw, hasCompleted := value["completedAt"]
	outcomeRaw, hasOutcome := value["outcome"]
	outcome, outcomeIsString := outcomeRaw.(string)
	if hasCompleted != hasOutcome {
		return "", 0, "", errors.New("attempt completion and outcome must be recorded together")
	}
	if hasCompleted {
		completedAt, err := parseInstant(completedRaw)
		if err != nil || !outcomeIsString || completedAt.Before(startedAt) ||
			!oneOf(outcome, "succeeded", "failed", "blocked", "cancelled", "budget-exhausted", "infrastructure-error", "superseded") {
			return "", 0, "", errors.New("attempt completion lifecycle is invalid")
		}
	}
	if failure, exists := value["failureDigest"]; exists {
		if err := requireDigest(failure, "/failureDigest"); err != nil {
			return "", 0, "", err
		}
	}
	if err := requireDigestMatch(value, "attemptDigest", "/attemptDigest"); err != nil {
		return "", 0, "", err
	}
	return attemptID, generation, parentID, nil
}

func validateAgentRunOperation(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"operationId", "kind", "idempotencyKey", "requestDigest", "generation",
		"state", "callbackAuthority", "startedAt", "operationDigest",
	}, []string{"settledAt", "resultDigest"}); err != nil {
		return err
	}
	for _, field := range []string{"operationId", "idempotencyKey"} {
		if err := requireIdentity(value[field], "/"+field); err != nil {
			return err
		}
	}
	if err := requireDigest(value["requestDigest"], "/requestDigest"); err != nil {
		return err
	}
	generation, ok := safeInteger(value["generation"])
	if !ok || generation < 1 {
		return errors.New("operation generation is invalid")
	}
	kind := stringValue(value["kind"])
	if !oneOf(kind, "model-stream", "tool-execution", "awaiting-approval", "commit-ack", "verification") {
		return errors.New("operation kind is invalid")
	}
	state := stringValue(value["state"])
	if !oneOf(state, "started", "reconciliation-required", "settled", "cancelled") {
		return errors.New("operation state is invalid")
	}
	authority := stringValue(value["callbackAuthority"])
	if !oneOf(authority, "active", "revoked") {
		return errors.New("operation callback authority is invalid")
	}
	startedAt, err := parseInstant(value["startedAt"])
	if err != nil {
		return errors.New("operation start instant is invalid")
	}
	settledRaw, hasSettled := value["settledAt"]
	_, hasResult := value["resultDigest"]
	if state == "started" {
		if hasSettled || hasResult || authority != "active" {
			return errors.New("started operation lifecycle is invalid")
		}
	} else {
		settledAt, err := parseInstant(settledRaw)
		if !hasSettled || err != nil || settledAt.Before(startedAt) || authority != "revoked" {
			return errors.New("settled operation lifecycle is invalid")
		}
		if hasResult {
			if err := requireDigest(value["resultDigest"], "/resultDigest"); err != nil {
				return err
			}
		}
	}
	return requireDigestMatch(value, "operationDigest", "/operationDigest")
}

func isAgentControlEventType(value string) bool {
	return oneOf(value,
		"run.created", "run.started", "run.phase-changed", "run.cancel-requested",
		"run.timeout-requested", "run.retry-started", "run.recovery-started", "run.terminal",
		"model.started", "model.completed", "model.failed", "tool.authorized", "tool.started",
		"tool.completed", "tool.cancelled", "tool.rejected", "budget.reserved", "budget.settled",
		"budget.reconciled", "cleanup.acknowledged", "callback.rejected",
	)
}

func validateAgentRunEvent(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"eventId", "taskId", "runId", "generation", "sequence", "family", "type",
		"producer", "occurredAt", "idempotencyKey", "requestDigest", "payloadDigest",
		"policyDigest", "grantRef", "data", "sanitizedPayload", "eventDigest",
	}, []string{"previousEventDigest"}); err != nil {
		return err
	}
	for _, field := range []string{"eventId", "taskId", "runId", "idempotencyKey"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"requestDigest", "payloadDigest", "policyDigest", "eventDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if previous, exists := value["previousEventDigest"]; exists {
		if err := requireDigest(previous, "/value/previousEventDigest"); err != nil {
			return err
		}
	}
	if _, ok := safeInteger(value["generation"]); !ok {
		return errors.New("/value/generation must be a non-negative safe integer")
	}
	sequence, ok := safeInteger(value["sequence"])
	if !ok || sequence < 1 {
		return errors.New("/value/sequence must be a positive safe integer")
	}
	eventType := stringValue(value["type"])
	if !isAgentControlEventType(eventType) || stringValue(value["family"]) != agentControlEventFamily(eventType) {
		return errors.New("/value/type and /value/family are inconsistent")
	}
	producer, ok := value["producer"].(map[string]any)
	if !ok || requireExactObjectKeys(producer, []string{"kind", "principalId"}, nil) != nil ||
		!oneOf(stringValue(producer["kind"]), "user", "service") ||
		requireIdentity(producer["principalId"], "/value/producer/principalId") != nil {
		return errors.New("/value/producer is invalid")
	}
	if err := requireInstant(value["occurredAt"], "/value/occurredAt"); err != nil {
		return err
	}
	grant, ok := value["grantRef"].(map[string]any)
	if !ok || requireExactObjectKeys(grant, []string{"grantId"}, nil) != nil ||
		requireIdentity(grant["grantId"], "/value/grantRef/grantId") != nil {
		return errors.New("/value/grantRef is invalid")
	}
	data, ok := value["data"].(map[string]any)
	if !ok {
		return errors.New("/value/data must be an object")
	}
	if err := validateAgentControlEventData(eventType, data); err != nil {
		return err
	}
	if err := validateSanitizedAgentPayload(value["sanitizedPayload"], "/value/sanitizedPayload"); err != nil {
		return err
	}
	payloadDigest, err := canonicaljson.Digest(value["sanitizedPayload"])
	if err != nil || value["payloadDigest"] != payloadDigest {
		return errors.New("/value/payloadDigest does not bind sanitizedPayload")
	}
	return requireDigestMatch(value, "eventDigest", "/value/eventDigest")
}

func validateAgentAuditExport(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"taskId", "runId", "fromSequence", "toSequence", "eventCount", "events",
		"chainRootDigest", "chainHeadDigest", "exportedAt", "exportDigest",
	}, nil); err != nil {
		return err
	}
	for _, field := range []string{"taskId", "runId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"chainRootDigest", "chainHeadDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if err := requireInstant(value["exportedAt"], "/value/exportedAt"); err != nil {
		return err
	}
	events, ok := value["events"].([]any)
	if !ok || len(events) == 0 || len(events) > 10_000 {
		return errors.New("Agent audit export event count is invalid")
	}
	from, fromOK := safeInteger(value["fromSequence"])
	to, toOK := safeInteger(value["toSequence"])
	count, countOK := safeInteger(value["eventCount"])
	if !fromOK || !toOK || !countOK || count != int64(len(events)) || to-from+1 != count {
		return errors.New("Agent audit export sequence range is invalid")
	}
	previous := ""
	for index, raw := range events {
		event, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("Agent audit event %d is not an object", index)
		}
		if err := validateAgentRunEvent(event); err != nil {
			return fmt.Errorf("Agent audit event %d: %w", index, err)
		}
		sequence, _ := safeInteger(event["sequence"])
		if sequence != from+int64(index) || event["taskId"] != value["taskId"] || event["runId"] != value["runId"] {
			return fmt.Errorf("Agent audit event %d identity or sequence drifted", index)
		}
		digest, _ := event["eventDigest"].(string)
		if index == 0 {
			if value["chainRootDigest"] != digest {
				return errors.New("Agent audit chain root digest drifted")
			}
		} else if event["previousEventDigest"] != previous {
			return fmt.Errorf("Agent audit event %d broke the hash chain", index)
		}
		previous = digest
	}
	if value["chainHeadDigest"] != previous {
		return errors.New("Agent audit chain head digest drifted")
	}
	return requireDigestMatch(value, "exportDigest", "/value/exportDigest")
}

func validateAgentBudgetLedger(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{"budget", "revision", "reservations", "ledgerDigest"}, nil); err != nil {
		return fmt.Errorf("/value/budgetLedger: %w", err)
	}
	if err := validateAgentBudget(value["budget"], "/value/budgetLedger/budget"); err != nil {
		return err
	}
	if _, ok := safeInteger(value["revision"]); !ok {
		return errors.New("/value/budgetLedger/revision is invalid")
	}
	reservations, ok := value["reservations"].([]any)
	if !ok || len(reservations) > 10_000 {
		return errors.New("/value/budgetLedger/reservations is invalid")
	}
	utilization := newAgentBudgetDemandAccumulator()
	previousID := ""
	for index, raw := range reservations {
		reservation, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("budget reservation %d is not an object", index)
		}
		if err := requireExactObjectKeys(reservation, []string{"reservationId", "demand", "demandDigest", "reservedAt", "status"}, []string{"settlement"}); err != nil {
			return err
		}
		id, _ := reservation["reservationId"].(string)
		if requireIdentity(id, "/value/budgetLedger/reservations/reservationId") != nil ||
			(index > 0 && id <= previousID) {
			return fmt.Errorf("budget reservation %d identity is invalid", index)
		}
		previousID = id
		demand, ok := reservation["demand"].(map[string]any)
		if !ok {
			return fmt.Errorf("budget reservation %q demand is invalid", id)
		}
		demandView, err := validateAgentBudgetDemand(demand, "/value/budgetLedger/reservations/demand")
		if err != nil {
			return fmt.Errorf("budget reservation %q: %w", id, err)
		}
		if demandView.unknown {
			return fmt.Errorf("budget reservation %q demand lacks a conservative upper bound", id)
		}
		demandDigest, err := canonicaljson.Digest(demand)
		if err != nil || reservation["demandDigest"] != demandDigest {
			return fmt.Errorf("budget reservation %q demand digest drifted", id)
		}
		reservedAt, err := parseInstant(reservation["reservedAt"])
		if err != nil {
			return fmt.Errorf("budget reservation %q instant is invalid", id)
		}
		status, _ := reservation["status"].(string)
		settlementRaw, hasSettlement := reservation["settlement"]
		settlement, settlementIsObject := settlementRaw.(map[string]any)
		if status == "reserved" && hasSettlement {
			return fmt.Errorf("reserved budget %q cannot have a settlement", id)
		}
		chargedView := demandView
		if status == "settled" {
			if !hasSettlement || !settlementIsObject {
				return fmt.Errorf("settled budget %q requires a settlement", id)
			}
			settledCharged, err := validateAgentBudgetSettlement(settlement, demand, demandView, reservedAt)
			if err != nil {
				return err
			}
			chargedView = settledCharged
		} else if status != "reserved" {
			return fmt.Errorf("budget reservation %q status is invalid", id)
		}
		if err := utilization.add(chargedView); err != nil {
			return fmt.Errorf("budget reservation %q utilization is invalid: %w", id, err)
		}
	}
	budget, _ := value["budget"].(map[string]any)
	if err := utilization.requireWithin(budget); err != nil {
		return err
	}
	return requireDigestMatch(value, "ledgerDigest", "/value/budgetLedger/ledgerDigest")
}

func validateSanitizedAgentPayload(value any, path string) error {
	switch current := value.(type) {
	case string:
		if agentControlCredentialPattern.MatchString(current) {
			return fmt.Errorf("%s contains credential-like material", path)
		}
	case []any:
		for index, entry := range current {
			if err := validateSanitizedAgentPayload(entry, fmt.Sprintf("%s/%d", path, index)); err != nil {
				return err
			}
		}
	case map[string]any:
		for key, entry := range current {
			lower := strings.ToLower(key)
			if oneOf(lower, "authorization", "cookie", "credential", "password", "privatereasoning", "rawprompt", "rawtooloutput", "secret", "secretvalue", "signedurl", "capabilitytoken") && entry != "[redacted]" {
				return fmt.Errorf("%s/%s must be redacted", path, key)
			}
			if err := validateSanitizedAgentPayload(entry, path+"/"+key); err != nil {
				return err
			}
		}
	}
	return nil
}

func requireDigestMatch(value map[string]any, field string, path string) error {
	expected, _ := value[field].(string)
	if !agentControlDigestPattern.MatchString(expected) {
		return fmt.Errorf("%s is not a canonical digest", path)
	}
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != field {
			base[key] = entry
		}
	}
	actual, err := canonicaljson.Digest(base)
	if err != nil {
		return err
	}
	if actual != expected {
		return fmt.Errorf("%s digest drifted", path)
	}
	return nil
}

func requireDigest(value any, path string) error {
	digest, ok := value.(string)
	if !ok || !agentControlDigestPattern.MatchString(digest) {
		return fmt.Errorf("%s must be a canonical sha256 digest", path)
	}
	return nil
}

func requireIdentity(value any, path string) error {
	identity, ok := value.(string)
	if !ok || !agentControlIdentityPattern.MatchString(identity) || agentControlCredentialPattern.MatchString(identity) {
		return fmt.Errorf("%s must be a bounded identity", path)
	}
	return nil
}

func requireInstant(value any, path string) error {
	if _, err := parseInstant(value); err != nil {
		return fmt.Errorf("%s must be an instant", path)
	}
	return nil
}

func parseInstant(value any) (time.Time, error) {
	instant, ok := value.(string)
	if !ok {
		return time.Time{}, errors.New("instant must be a string")
	}
	parsed, err := time.Parse("2006-01-02T15:04:05.000Z", instant)
	if err != nil {
		return time.Time{}, err
	}
	return parsed.UTC(), nil
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func requireExactObjectKeys(value map[string]any, required, optional []string) error {
	allowed := make(map[string]struct{}, len(required)+len(optional))
	for _, key := range append(append([]string(nil), required...), optional...) {
		allowed[key] = struct{}{}
	}
	for _, key := range required {
		if _, exists := value[key]; !exists {
			return fmt.Errorf("required member %q is missing", key)
		}
	}
	for key := range value {
		if _, exists := allowed[key]; !exists {
			return fmt.Errorf("unknown member %q", key)
		}
	}
	return nil
}

func safeInteger(value any) (int64, bool) {
	number, ok := value.(float64)
	if !ok || number < 0 || number > 9_007_199_254_740_991 || number != float64(int64(number)) {
		return 0, false
	}
	return int64(number), true
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
