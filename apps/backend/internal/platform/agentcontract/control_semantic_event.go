package agentcontract

import (
	"errors"
	"fmt"
	"regexp"
	"unicode/utf8"
)

var agentControlDiagnosticPattern = regexp.MustCompile(`^AI-[0-9]{4}$`)

func agentControlEventFamily(eventType string) string {
	switch {
	case len(eventType) >= 6 && eventType[:6] == "model.":
		return "model"
	case len(eventType) >= 5 && eventType[:5] == "tool.":
		return "tool"
	case len(eventType) >= 7 && eventType[:7] == "budget.":
		return "budget"
	case eventType == "callback.rejected":
		return "security"
	default:
		return "run"
	}
}

func validateAgentControlEventData(eventType string, value map[string]any) error {
	if err := requireExactObjectKeys(value, nil, []string{
		"phase", "outcome", "attempt", "operation", "reservationId", "budgetLedger",
		"successProof", "cleanupState", "callbackGeneration", "receiptDigest",
		"diagnosticCode", "reason",
	}); err != nil {
		return fmt.Errorf("/value/data: %w", err)
	}
	if phase, exists := value["phase"]; exists && !oneOf(stringValue(phase),
		"queued", "preparing", "running", "awaiting-approval", "committing",
		"verifying", "repairing", "cancelling", "terminal",
	) {
		return errors.New("/value/data/phase is invalid")
	}
	if outcome, exists := value["outcome"]; exists && !oneOf(stringValue(outcome),
		"succeeded", "failed", "blocked", "cancelled", "budget-exhausted", "infrastructure-error",
	) {
		return errors.New("/value/data/outcome is invalid")
	}
	if rawAttempt, exists := value["attempt"]; exists {
		attempt, ok := rawAttempt.(map[string]any)
		if !ok {
			return errors.New("/value/data/attempt is invalid")
		}
		number, ok := safeInteger(attempt["attempt"])
		if !ok || number < 1 {
			return errors.New("/value/data/attempt number is invalid")
		}
		if _, _, _, err := validateAgentRunAttempt(attempt, int(number)); err != nil {
			return fmt.Errorf("/value/data/attempt: %w", err)
		}
	}
	if rawOperation, exists := value["operation"]; exists {
		operation, ok := rawOperation.(map[string]any)
		if !ok {
			return errors.New("/value/data/operation is invalid")
		}
		if err := validateAgentRunOperation(operation); err != nil {
			return fmt.Errorf("/value/data/operation: %w", err)
		}
	}
	if reservation, exists := value["reservationId"]; exists {
		if err := requireIdentity(reservation, "/value/data/reservationId"); err != nil {
			return err
		}
	}
	if rawLedger, exists := value["budgetLedger"]; exists {
		ledger, ok := rawLedger.(map[string]any)
		if !ok {
			return errors.New("/value/data/budgetLedger is invalid")
		}
		if err := validateAgentBudgetLedger(ledger); err != nil {
			return err
		}
	}
	if proof, exists := value["successProof"]; exists {
		if err := validateAgentRunSuccessProof(proof); err != nil {
			return fmt.Errorf("/value/data/successProof: %w", err)
		}
	}
	if cleanup, exists := value["cleanupState"]; exists &&
		!oneOf(stringValue(cleanup), "not-required", "pending", "clean", "residual") {
		return errors.New("/value/data/cleanupState is invalid")
	}
	if generation, exists := value["callbackGeneration"]; exists {
		if _, ok := safeInteger(generation); !ok {
			return errors.New("/value/data/callbackGeneration is invalid")
		}
	}
	if receipt, exists := value["receiptDigest"]; exists {
		if err := requireDigest(receipt, "/value/data/receiptDigest"); err != nil {
			return err
		}
	}
	if diagnostic, exists := value["diagnosticCode"]; exists {
		code, ok := diagnostic.(string)
		if !ok || !agentControlDiagnosticPattern.MatchString(code) {
			return errors.New("/value/data/diagnosticCode is invalid")
		}
	}
	if rawReason, exists := value["reason"]; exists {
		reason, ok := rawReason.(string)
		if !ok || utf8.RuneCountInString(reason) > 512 || len(reason) > 2_048 ||
			agentControlCredentialPattern.MatchString(reason) {
			return errors.New("/value/data/reason is invalid or oversized")
		}
	}

	has := func(member string) bool {
		_, exists := value[member]
		return exists
	}
	switch eventType {
	case "run.started", "run.retry-started", "run.recovery-started":
		if !has("attempt") || !has("phase") {
			return errors.New("run start event requires attempt and phase")
		}
	case "run.phase-changed":
		if !has("phase") {
			return errors.New("run phase event requires phase")
		}
	case "run.cancel-requested", "run.timeout-requested":
		if !has("reason") {
			return errors.New("run cancellation event requires reason")
		}
	case "run.terminal":
		if !has("outcome") {
			return errors.New("terminal event requires outcome")
		}
	case "model.started":
		operation, ok := value["operation"].(map[string]any)
		if !ok || stringValue(operation["kind"]) != "model-stream" || stringValue(operation["state"]) != "started" {
			return errors.New("model start event requires a started model operation")
		}
	case "tool.started":
		operation, ok := value["operation"].(map[string]any)
		if !ok || stringValue(operation["kind"]) != "tool-execution" || stringValue(operation["state"]) != "started" {
			return errors.New("tool start event requires a started tool operation")
		}
	case "model.completed", "model.failed", "tool.completed", "tool.cancelled", "tool.rejected":
		operation, ok := value["operation"].(map[string]any)
		if !ok || !agentOperationMatchesEvent(eventType, operation) {
			return errors.New("operation completion event has an incompatible kind or state")
		}
	case "budget.reserved", "budget.settled", "budget.reconciled":
		if !has("reservationId") || !has("budgetLedger") {
			return errors.New("budget event requires reservation and ledger")
		}
	case "cleanup.acknowledged":
		if !oneOf(stringValue(value["cleanupState"]), "clean", "residual") {
			return errors.New("cleanup acknowledgement requires a terminal cleanup state")
		}
	case "callback.rejected":
		if !has("callbackGeneration") || !has("reason") {
			return errors.New("callback rejection requires generation and reason")
		}
	case "run.created", "tool.authorized":
		// These events carry no additional required data members.
	default:
		return errors.New("unsupported Agent control event type")
	}
	return nil
}

func agentOperationMatchesEvent(eventType string, operation map[string]any) bool {
	kind := stringValue(operation["kind"])
	state := stringValue(operation["state"])
	switch eventType {
	case "model.completed":
		return kind == "model-stream" && state == "settled"
	case "model.failed":
		return kind == "model-stream" && oneOf(state, "cancelled", "reconciliation-required")
	case "tool.completed":
		return kind == "tool-execution" && state == "settled"
	case "tool.cancelled":
		return kind == "tool-execution" && state == "cancelled"
	case "tool.rejected":
		return kind == "tool-execution" && oneOf(state, "cancelled", "reconciliation-required")
	default:
		return false
	}
}

func validateAgentRunSuccessProof(raw any) error {
	value, ok := raw.(map[string]any)
	if !ok {
		return errors.New("success proof must be an object")
	}
	mode := stringValue(value["mode"])
	switch mode {
	case "explain":
		if err := requireExactObjectKeys(value, []string{"mode", "answerDigest", "groundingDigests"}, nil); err != nil {
			return err
		}
		if err := requireDigest(value["answerDigest"], "/answerDigest"); err != nil {
			return err
		}
		grounding, ok := value["groundingDigests"].([]any)
		if !ok || len(grounding) == 0 || len(grounding) > 512 {
			return errors.New("explain success proof grounding is invalid")
		}
		seen := make(map[string]struct{}, len(grounding))
		for index, rawDigest := range grounding {
			digest, ok := rawDigest.(string)
			if !ok {
				return fmt.Errorf("grounding digest %d is invalid", index)
			}
			if err := requireDigest(digest, fmt.Sprintf("/groundingDigests/%d", index)); err != nil {
				return err
			}
			if _, duplicate := seen[digest]; duplicate {
				return errors.New("explain success proof grounding contains duplicates")
			}
			seen[digest] = struct{}{}
		}
	case "plan":
		if err := requireExactObjectKeys(value, []string{"mode", "planDigest"}, nil); err != nil {
			return err
		}
		return requireDigest(value["planDigest"], "/planDigest")
	case "propose":
		if err := requireExactObjectKeys(value, []string{"mode", "proposalDigest", "previewDigest"}, nil); err != nil {
			return err
		}
		for _, field := range []string{"proposalDigest", "previewDigest"} {
			if err := requireDigest(value[field], "/"+field); err != nil {
				return err
			}
		}
	case "apply":
		if err := requireExactObjectKeys(value, []string{
			"mode", "proposalDigest", "approvalDigest", "transactionDigest", "commitAckDigest",
			"committedPlanDigest", "actualPlanDigest", "planCompatibility",
			"verificationClosureDigest", "verificationClosureOutcome",
		}, nil); err != nil {
			return err
		}
		for _, field := range []string{
			"proposalDigest", "approvalDigest", "transactionDigest", "commitAckDigest",
			"committedPlanDigest", "actualPlanDigest", "verificationClosureDigest",
		} {
			if err := requireDigest(value[field], "/"+field); err != nil {
				return err
			}
		}
		if !oneOf(stringValue(value["planCompatibility"]), "exact", "compatible") ||
			stringValue(value["verificationClosureOutcome"]) != "satisfied" {
			return errors.New("apply success proof closure is invalid")
		}
	default:
		return errors.New("success proof mode is invalid")
	}
	return nil
}
