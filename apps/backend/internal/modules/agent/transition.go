package agent

import (
	"fmt"
	"regexp"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

var canonicalDigestPattern = regexp.MustCompile(`^sha256-[a-f0-9]{64}$`)

var generationAdvancingEvents = map[string]bool{
	"run.started":           true,
	"run.cancel-requested":  true,
	"run.timeout-requested": true,
	"run.retry-started":     true,
	"run.recovery-started":  true,
}

var phaseTransitions = map[string]map[string]bool{
	"queued":            {"preparing": true, "cancelling": true},
	"preparing":         {"running": true, "cancelling": true},
	"running":           {"awaiting-approval": true, "committing": true, "verifying": true, "repairing": true, "cancelling": true},
	"awaiting-approval": {"committing": true, "repairing": true, "cancelling": true},
	"committing":        {"verifying": true, "cancelling": true},
	"verifying":         {"repairing": true, "cancelling": true},
	"repairing":         {"running": true, "awaiting-approval": true, "committing": true, "verifying": true, "cancelling": true},
	"cancelling":        {},
}

func validateInitialRun(task taskFact, run runFact, event eventFact) error {
	runValue, _ := objectMember(run.Value, "run")
	ledger, _ := objectMember(run.Value, "budgetLedger")
	if run.TaskID != task.TaskID || event.TaskID != task.TaskID || event.RunID != run.RunID ||
		run.TaskDigest != task.TaskDigest || run.PolicyDigest != task.PolicyDigest ||
		event.PolicyDigest != task.PolicyDigest || run.GrantID != task.InitialGrantID ||
		event.GrantID != task.InitialGrantID {
		return conflict("initial Run does not bind its immutable Task, policy, and grant")
	}
	if !sameMember(runValue["baseRevision"], task.Spec["baseRevision"]) ||
		!sameMember(ledger["budget"], task.Spec["budget"]) {
		return conflict("initial Run does not bind the Task revision and budget")
	}
	if event.Type != "run.created" || event.Sequence != 1 || event.Generation != 0 ||
		event.PreviousEventDigest != "" || run.Cursor != 1 || run.Generation != 0 ||
		run.Attempt != 0 || run.Phase != "queued" || run.Outcome != "" ||
		run.CallbackAuthority != "revoked" || run.CleanupState != "not-required" ||
		run.BudgetRevision != 0 || run.LatestEventDigest != event.EventDigest ||
		!run.CreatedAt.Equal(event.OccurredAt) || !run.UpdatedAt.Equal(event.OccurredAt) {
		return conflict("initial Run lifecycle is not the canonical run.created reduction")
	}
	if attempts, ok := arrayMember(run.Value, "attempts"); !ok || len(attempts) != 0 {
		return conflict("initial Run must not contain attempts")
	}
	if _, exists := run.Value["pendingOperation"]; exists {
		return conflict("initial Run must not contain a pending operation")
	}
	return validateProcessedEventAppend(nil, run.Value, event)
}

func validateRunTransition(taskMode string, current, next runFact, event eventFact) error {
	if current.Phase == "terminal" {
		return ErrTerminal
	}
	if current.TaskID != next.TaskID || current.RunID != next.RunID ||
		current.TaskDigest != next.TaskDigest || event.TaskID != current.TaskID ||
		event.RunID != current.RunID || event.PolicyDigest != current.PolicyDigest ||
		event.GrantID != current.GrantID || next.PolicyDigest != current.PolicyDigest ||
		next.GrantID != current.GrantID {
		return conflict("Run transition drifted task, run, policy, or grant identity")
	}
	if event.Sequence != current.Cursor+1 || next.Cursor != event.Sequence ||
		event.PreviousEventDigest != current.LatestEventDigest ||
		next.LatestEventDigest != event.EventDigest ||
		event.OccurredAt.Before(current.UpdatedAt) || !next.UpdatedAt.Equal(event.OccurredAt) ||
		!next.CreatedAt.Equal(current.CreatedAt) {
		return conflict("Run transition has a stale sequence, hash predecessor, or clock")
	}
	expectedGeneration := current.Generation
	if generationAdvancingEvents[event.Type] {
		expectedGeneration++
	}
	if event.Generation != expectedGeneration || next.Generation != expectedGeneration {
		return fmt.Errorf("%w: callback generation is fenced", ErrUnauthorized)
	}
	if err := compareStableRunMembers(current.Value, next.Value); err != nil {
		return err
	}
	if err := validateProcessedEventAppend(current.Value, next.Value, event); err != nil {
		return err
	}
	if err := validateEventSpecificTransition(taskMode, current, next, event); err != nil {
		return err
	}
	return nil
}

func compareStableRunMembers(currentValue, nextValue map[string]any) error {
	currentRun, _ := objectMember(currentValue, "run")
	nextRun, _ := objectMember(nextValue, "run")
	for _, key := range []string{"runId", "taskId", "baseRevision", "policyDigest", "grantRef", "contextPackDigest", "createdAt"} {
		if !sameMember(currentRun[key], nextRun[key]) {
			return conflict("Run immutable member " + key + " drifted")
		}
	}
	if !sameMember(currentValue["taskDigest"], nextValue["taskDigest"]) {
		return conflict("Run task digest drifted")
	}
	return nil
}

func validateProcessedEventAppend(currentValue, nextValue map[string]any, event eventFact) error {
	nextProcessed, ok := arrayMember(nextValue, "processedEvents")
	if !ok || len(nextProcessed) != int(event.Sequence) {
		return conflict("Run processed-event count does not match the event sequence")
	}
	if currentValue != nil {
		currentProcessed, ok := arrayMember(currentValue, "processedEvents")
		if !ok || len(nextProcessed) != len(currentProcessed)+1 {
			return conflict("Run processed-event log is not append-only")
		}
		for index := range currentProcessed {
			if !sameMember(currentProcessed[index], nextProcessed[index]) {
				return conflict("Run processed-event history was rewritten")
			}
		}
	}
	last, err := requireObject(nextProcessed[len(nextProcessed)-1], "processed event")
	if err != nil {
		return err
	}
	if stringMember(last, "eventId") != stringMember(event.Value, "eventId") ||
		stringMember(last, "idempotencyKey") != event.IdempotencyKey ||
		stringMember(last, "type") != event.Type ||
		stringMember(last, "requestDigest") != event.RequestDigest ||
		stringMember(last, "eventDigest") != event.EventDigest {
		return conflict("Run processed-event entry does not bind the appended event")
	}
	return nil
}

func validateEventSpecificTransition(taskMode string, current, next runFact, event eventFact) error {
	currentAttempts, _ := arrayMember(current.Value, "attempts")
	nextAttempts, _ := arrayMember(next.Value, "attempts")
	currentLedger, _ := objectMember(current.Value, "budgetLedger")
	nextLedger, _ := objectMember(next.Value, "budgetLedger")
	currentPending, currentHasPending := objectMember(current.Value, "pendingOperation")
	nextPending, nextHasPending := objectMember(next.Value, "pendingOperation")

	stateUnchanged := func() error {
		if current.Attempt != next.Attempt || current.Phase != next.Phase || current.Outcome != next.Outcome ||
			current.CallbackAuthority != next.CallbackAuthority || current.CleanupState != next.CleanupState ||
			!sameMember(currentAttempts, nextAttempts) || !sameMember(currentLedger, nextLedger) ||
			currentHasPending != nextHasPending || (currentHasPending && !sameMember(currentPending, nextPending)) {
			return conflict("event changed state outside its owned lifecycle fields")
		}
		return nil
	}

	switch event.Type {
	case "run.started":
		attempt, ok := objectMember(event.Data, "attempt")
		if current.Phase != "queued" || len(currentAttempts) != 0 || currentHasPending ||
			next.Phase != "preparing" || next.Attempt != 1 ||
			next.CallbackAuthority != "active" || next.CleanupState != "not-required" ||
			!ok || stringMember(event.Data, "phase") != "preparing" ||
			integerOrMinusOne(attempt, "attempt") != 1 ||
			integerOrMinusOne(attempt, "generation") != event.Generation ||
			stringMember(attempt, "reason") != "initial" || len(nextAttempts) != 1 ||
			!sameMember(nextAttempts[0], attempt) || !sameMember(currentLedger, nextLedger) || nextHasPending {
			return conflict("run.started does not establish the canonical first attempt")
		}
	case "run.phase-changed":
		phase := stringMember(event.Data, "phase")
		if !phaseTransitions[current.Phase][phase] || next.Phase != phase ||
			current.Attempt != next.Attempt || current.CallbackAuthority != next.CallbackAuthority ||
			current.CleanupState != next.CleanupState || !sameMember(currentAttempts, nextAttempts) ||
			!sameMember(currentLedger, nextLedger) || currentHasPending != nextHasPending ||
			(currentHasPending && !sameMember(currentPending, nextPending)) {
			return conflict("AgentRun phase transition is invalid")
		}
	case "run.cancel-requested", "run.timeout-requested":
		if next.Phase != "cancelling" || next.Attempt != current.Attempt ||
			next.CallbackAuthority != "revoked" || next.CleanupState != "pending" ||
			!sameMember(currentAttempts, nextAttempts) || !sameMember(currentLedger, nextLedger) ||
			!validRevokedOperationTransition(currentPending, currentHasPending, nextPending, nextHasPending, event) {
			return conflict("cancellation did not fence callbacks and require cleanup")
		}
	case "run.retry-started", "run.recovery-started":
		attempt, ok := objectMember(event.Data, "attempt")
		phase := stringMember(event.Data, "phase")
		if !ok || len(currentAttempts) == 0 || current.Phase == "queued" || current.Phase == "cancelling" ||
			phase == "" || phase == "queued" || phase == "terminal" || phase == "cancelling" ||
			next.Phase != phase || next.Attempt != current.Attempt+1 ||
			next.CallbackAuthority != "active" || next.CleanupState != "not-required" ||
			nextHasPending || !sameMember(currentLedger, nextLedger) ||
			integerOrMinusOne(attempt, "attempt") != next.Attempt ||
			integerOrMinusOne(attempt, "generation") != next.Generation ||
			!validRetryAttemptTransition(currentAttempts, nextAttempts, attempt, event) {
			return conflict("retry or recovery attempt lineage is invalid")
		}
		prior, err := requireObject(currentAttempts[len(currentAttempts)-1], "prior attempt")
		if err != nil || stringMember(attempt, "parentAttemptId") != stringMember(prior, "attemptId") {
			return conflict("retry or recovery lost its parent attempt")
		}
		reason := stringMember(attempt, "reason")
		if (event.Type == "run.retry-started" && reason != "retry") ||
			(event.Type == "run.recovery-started" && reason != "process-recovery" && reason != "provider-disconnect") {
			return conflict("retry or recovery reason does not match its event")
		}
	case "run.terminal":
		outcome := stringMember(event.Data, "outcome")
		if outcome == "" || next.Phase != "terminal" || next.Outcome != outcome ||
			next.Attempt != current.Attempt || next.CallbackAuthority != "revoked" || nextHasPending ||
			!sameMember(currentLedger, nextLedger) || next.CleanupState != current.CleanupState {
			return conflict("terminal event did not close the Run")
		}
		if !validTerminalAttemptTransition(currentAttempts, nextAttempts, outcome, event) {
			return conflict("terminal event rewrote or failed to close attempt lineage")
		}
		proof, hasProof := objectMember(event.Data, "successProof")
		if outcome == "succeeded" {
			if !hasProof || !validModeSuccessProof(taskMode, proof) || current.CallbackAuthority != "active" ||
				(currentHasPending && stringMember(currentPending, "state") == "started") || hasOpenBudgetReservation(currentLedger) {
				return conflict("successful Run lacks mode proof or has open authority")
			}
		} else if hasProof {
			return conflict("non-success terminal outcome cannot carry a success proof")
		}
		if outcome == "cancelled" && current.CleanupState != "clean" {
			return conflict("cancelled Run requires acknowledged clean cleanup")
		}
		if current.CleanupState == "residual" && outcome != "infrastructure-error" {
			return conflict("residual cleanup requires an infrastructure-error outcome")
		}
	case "budget.reserved", "budget.settled", "budget.reconciled":
		eventLedger, ok := objectMember(event.Data, "budgetLedger")
		reservationID := stringMember(event.Data, "reservationId")
		delta := next.BudgetRevision - current.BudgetRevision
		if !ok || reservationID == "" || !sameMember(eventLedger, nextLedger) ||
			!sameMember(currentLedger["budget"], nextLedger["budget"]) || delta != 1 ||
			current.Attempt != next.Attempt || current.Phase != next.Phase ||
			current.CallbackAuthority != next.CallbackAuthority || current.CleanupState != next.CleanupState ||
			!sameMember(currentAttempts, nextAttempts) || currentHasPending != nextHasPending ||
			(currentHasPending && !sameMember(currentPending, nextPending)) ||
			!validBudgetReservationTransition(currentLedger, nextLedger, reservationID, event.Type) {
			return conflict("budget ledger transition is not monotonic and atomic")
		}
	case "model.started", "tool.started":
		operation, ok := objectMember(event.Data, "operation")
		expectedKind := "model-stream"
		if event.Type == "tool.started" {
			expectedKind = "tool-execution"
		}
		if !ok || (currentHasPending && stringMember(currentPending, "state") == "started") ||
			!nextHasPending || !sameMember(operation, nextPending) ||
			stringMember(operation, "kind") != expectedKind ||
			integerOrMinusOne(operation, "generation") != current.Generation ||
			stringMember(operation, "state") != "started" ||
			current.Attempt != next.Attempt || current.Phase != next.Phase ||
			current.CallbackAuthority != next.CallbackAuthority || current.CleanupState != next.CleanupState ||
			!sameMember(currentAttempts, nextAttempts) || !sameMember(currentLedger, nextLedger) {
			return conflict("operation start is conflicting or stale")
		}
	case "model.completed", "model.failed", "tool.completed", "tool.cancelled", "tool.rejected":
		operation, ok := objectMember(event.Data, "operation")
		if !ok || !currentHasPending || stringMember(currentPending, "state") != "started" ||
			!nextHasPending || !sameMember(operation, nextPending) ||
			!operationMatchesControlEvent(event.Type, operation) ||
			stringMember(operation, "operationId") != stringMember(currentPending, "operationId") ||
			stringMember(operation, "requestDigest") != stringMember(currentPending, "requestDigest") ||
			integerOrMinusOne(operation, "generation") != integerOrMinusOne(currentPending, "generation") ||
			stringMember(operation, "state") == "started" ||
			current.Attempt != next.Attempt || current.Phase != next.Phase ||
			current.CallbackAuthority != next.CallbackAuthority || current.CleanupState != next.CleanupState ||
			!sameMember(currentAttempts, nextAttempts) || !sameMember(currentLedger, nextLedger) {
			return fmt.Errorf("%w: operation callback lost authority", ErrUnauthorized)
		}
	case "cleanup.acknowledged":
		cleanup := stringMember(event.Data, "cleanupState")
		if current.Phase != "cancelling" || next.Phase != "cancelling" ||
			(cleanup != "clean" && cleanup != "residual") || next.CleanupState != cleanup ||
			current.Attempt != next.Attempt || current.CallbackAuthority != next.CallbackAuthority ||
			!sameMember(currentAttempts, nextAttempts) || !sameMember(currentLedger, nextLedger) ||
			currentHasPending != nextHasPending || (currentHasPending && !sameMember(currentPending, nextPending)) {
			return conflict("cleanup acknowledgement is invalid")
		}
	case "callback.rejected":
		callbackGeneration, ok := integerMember(event.Data, "callbackGeneration")
		if !ok || callbackGeneration >= current.Generation {
			return conflict("callback rejection does not identify an older generation")
		}
		return stateUnchanged()
	case "tool.authorized":
		return stateUnchanged()
	case "run.created":
		return conflict("run.created is valid only in the atomic CreateRun operation")
	default:
		return invalid("unsupported AgentRun event type")
	}
	return nil
}

func integerOrMinusOne(value map[string]any, key string) int64 {
	if parsed, ok := integerMember(value, key); ok {
		return parsed
	}
	return -1
}

func hasOpenBudgetReservation(ledger map[string]any) bool {
	reservations, _ := arrayMember(ledger, "reservations")
	for _, raw := range reservations {
		reservation, _ := raw.(map[string]any)
		if stringMember(reservation, "status") == "reserved" {
			return true
		}
	}
	return false
}

func validBudgetReservationTransition(
	currentLedger map[string]any,
	nextLedger map[string]any,
	reservationID string,
	eventType string,
) bool {
	current, currentOK := arrayMember(currentLedger, "reservations")
	next, nextOK := arrayMember(nextLedger, "reservations")
	if !currentOK || !nextOK {
		return false
	}
	if eventType == "budget.reserved" {
		if len(next) != len(current)+1 {
			return false
		}
		currentIndex := 0
		added := 0
		for _, raw := range next {
			if currentIndex < len(current) && sameMember(current[currentIndex], raw) {
				currentIndex++
				continue
			}
			reservation, ok := raw.(map[string]any)
			if !ok || added != 0 || stringMember(reservation, "reservationId") != reservationID ||
				stringMember(reservation, "status") != "reserved" {
				return false
			}
			added++
		}
		return added == 1 && currentIndex == len(current)
	}
	if len(next) != len(current) {
		return false
	}
	changed := 0
	for index := range current {
		previous, previousOK := current[index].(map[string]any)
		following, followingOK := next[index].(map[string]any)
		if !previousOK || !followingOK ||
			stringMember(previous, "reservationId") != stringMember(following, "reservationId") {
			return false
		}
		if stringMember(previous, "reservationId") != reservationID {
			if !sameMember(previous, following) {
				return false
			}
			continue
		}
		if stringMember(previous, "status") != "reserved" ||
			stringMember(following, "status") != "settled" ||
			stringMember(previous, "demandDigest") != stringMember(following, "demandDigest") ||
			stringMember(previous, "reservedAt") != stringMember(following, "reservedAt") ||
			!sameMember(previous["demand"], following["demand"]) {
			return false
		}
		changed++
	}
	return changed == 1
}

func validRetryAttemptTransition(
	current []any,
	next []any,
	newAttempt map[string]any,
	event eventFact,
) bool {
	if len(current) == 0 || len(next) != len(current)+1 {
		return false
	}
	for index := 0; index < len(current)-1; index++ {
		if !sameMember(current[index], next[index]) {
			return false
		}
	}
	latest, ok := current[len(current)-1].(map[string]any)
	if !ok {
		return false
	}
	expected, err := completedAttempt(latest, event, "superseded", eventFailureDigest(event))
	return err == nil && sameMember(expected, next[len(current)-1]) &&
		sameMember(newAttempt, next[len(next)-1])
}

func validTerminalAttemptTransition(current, next []any, outcome string, event eventFact) bool {
	if len(current) != len(next) {
		return false
	}
	if len(current) == 0 {
		return true
	}
	for index := 0; index < len(current)-1; index++ {
		if !sameMember(current[index], next[index]) {
			return false
		}
	}
	latest, ok := current[len(current)-1].(map[string]any)
	if !ok {
		return false
	}
	failureDigest := ""
	if outcome != "succeeded" {
		failureDigest = eventFailureDigest(event)
	}
	expected, err := completedAttempt(latest, event, outcome, failureDigest)
	return err == nil && sameMember(expected, next[len(next)-1])
}

func completedAttempt(current map[string]any, event eventFact, outcome, failureDigest string) (map[string]any, error) {
	if _, completed := current["completedAt"]; completed {
		return current, nil
	}
	base := map[string]any{
		"attemptId":   stringMember(current, "attemptId"),
		"attempt":     current["attempt"],
		"generation":  current["generation"],
		"reason":      stringMember(current, "reason"),
		"startedAt":   stringMember(current, "startedAt"),
		"completedAt": stringMember(event.Value, "occurredAt"),
		"outcome":     outcome,
	}
	if parent := stringMember(current, "parentAttemptId"); parent != "" {
		base["parentAttemptId"] = parent
	}
	if failureDigest != "" {
		base["failureDigest"] = failureDigest
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	result := make(map[string]any, len(base)+1)
	for key, member := range base {
		result[key] = member
	}
	result["attemptDigest"] = digest
	return result, nil
}

func eventFailureDigest(event eventFact) string {
	if receipt := stringMember(event.Data, "receiptDigest"); receipt != "" {
		return receipt
	}
	return event.RequestDigest
}

func validRevokedOperationTransition(
	current map[string]any,
	hasCurrent bool,
	next map[string]any,
	hasNext bool,
	event eventFact,
) bool {
	if !hasCurrent {
		return !hasNext
	}
	if stringMember(current, "state") != "started" {
		return hasNext && sameMember(current, next)
	}
	if !hasNext {
		return false
	}
	base := map[string]any{
		"operationId":       stringMember(current, "operationId"),
		"kind":              stringMember(current, "kind"),
		"idempotencyKey":    stringMember(current, "idempotencyKey"),
		"requestDigest":     stringMember(current, "requestDigest"),
		"generation":        current["generation"],
		"state":             "cancelled",
		"callbackAuthority": "revoked",
		"startedAt":         stringMember(current, "startedAt"),
		"settledAt":         stringMember(event.Value, "occurredAt"),
	}
	if receipt := stringMember(event.Data, "receiptDigest"); receipt != "" {
		base["resultDigest"] = receipt
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return false
	}
	base["operationDigest"] = digest
	return sameMember(base, next)
}

func operationMatchesControlEvent(eventType string, operation map[string]any) bool {
	kind := stringMember(operation, "kind")
	state := stringMember(operation, "state")
	switch eventType {
	case "model.completed":
		return kind == "model-stream" && state == "settled"
	case "model.failed":
		return kind == "model-stream" && (state == "cancelled" || state == "reconciliation-required")
	case "tool.completed":
		return kind == "tool-execution" && state == "settled"
	case "tool.cancelled":
		return kind == "tool-execution" && state == "cancelled"
	case "tool.rejected":
		return kind == "tool-execution" && (state == "cancelled" || state == "reconciliation-required")
	default:
		return false
	}
}

func validModeSuccessProof(mode string, proof map[string]any) bool {
	if stringMember(proof, "mode") != mode {
		return false
	}
	switch mode {
	case "explain":
		grounding, ok := arrayMember(proof, "groundingDigests")
		if !exactKeys(proof, "mode", "answerDigest", "groundingDigests") ||
			!canonicalDigestPattern.MatchString(stringMember(proof, "answerDigest")) ||
			!ok || len(grounding) == 0 || len(grounding) > 512 {
			return false
		}
		seen := make(map[string]struct{}, len(grounding))
		for _, raw := range grounding {
			digest, ok := raw.(string)
			if !ok || !canonicalDigestPattern.MatchString(digest) {
				return false
			}
			if _, duplicate := seen[digest]; duplicate {
				return false
			}
			seen[digest] = struct{}{}
		}
		return true
	case "plan":
		return exactKeys(proof, "mode", "planDigest") &&
			canonicalDigestPattern.MatchString(stringMember(proof, "planDigest"))
	case "propose":
		return exactKeys(proof, "mode", "proposalDigest", "previewDigest") &&
			canonicalDigestPattern.MatchString(stringMember(proof, "proposalDigest")) &&
			canonicalDigestPattern.MatchString(stringMember(proof, "previewDigest"))
	case "apply":
		if !exactKeys(
			proof, "mode", "proposalDigest", "approvalDigest", "transactionDigest",
			"commitAckDigest", "committedPlanDigest", "actualPlanDigest",
			"planCompatibility", "verificationClosureDigest", "verificationClosureOutcome",
		) {
			return false
		}
		for _, key := range []string{"proposalDigest", "approvalDigest", "transactionDigest", "commitAckDigest", "committedPlanDigest", "actualPlanDigest", "verificationClosureDigest"} {
			if !canonicalDigestPattern.MatchString(stringMember(proof, key)) {
				return false
			}
		}
		compatibility := stringMember(proof, "planCompatibility")
		return (compatibility == "exact" || compatibility == "compatible") &&
			stringMember(proof, "verificationClosureOutcome") == "satisfied"
	default:
		return false
	}
}

func exactKeys(value map[string]any, keys ...string) bool {
	if len(value) != len(keys) {
		return false
	}
	for _, key := range keys {
		if _, exists := value[key]; !exists {
			return false
		}
	}
	return true
}
