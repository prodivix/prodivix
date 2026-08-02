package agentcontract

import (
	"errors"
	"fmt"
)

func validateAgentVerificationSemantics(document map[string]any) error {
	if err := rejectUnsafeKeys(document, "/"); err != nil {
		return err
	}
	if err := requireExactObjectKeys(document, []string{"wireVersion", "factType", "value"}, nil); err != nil {
		return fmt.Errorf("Agent verification envelope: %w", err)
	}
	value, ok := document["value"].(map[string]any)
	if !ok {
		return errors.New("Agent verification fact value must be an object")
	}
	switch stringValue(document["factType"]) {
	case "committed-plan-binding":
		return validateAgentCommittedPlanBinding(value)
	case "verification-closure-receipt":
		return validateAgentVerificationClosureReceipt(value)
	case "repair-round-receipt":
		return validateAgentRepairRoundReceipt(value)
	default:
		return fmt.Errorf("unsupported Agent verification fact type %q", document["factType"])
	}
}

func validateVerificationServicePrincipal(raw any, path string) error {
	principal, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(principal, []string{"kind", "principalId"}, nil) != nil ||
		stringValue(principal["kind"]) != "service" {
		return fmt.Errorf("%s must identify a service producer", path)
	}
	return requireIdentity(principal["principalId"], path+"/principalId")
}

func validateAgentCommittedPlanBinding(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"bindingId", "taskId", "runId", "proposalId", "previewId", "decisionId",
		"mutationReceiptId", "mutationKind", "verificationRunId", "targetRevision",
		"approvedPlanDigest", "actualPlanDigest", "planCompatibility", "impactDigest",
		"policyDigest", "approvedRequiredCellSetDigest", "actualRequiredCellSetDigest",
		"regressionRequirementSetDigest", "producer", "boundAt", "bindingDigest",
	}, nil); err != nil {
		return err
	}
	for _, field := range []string{
		"bindingId", "taskId", "runId", "proposalId", "previewId", "decisionId",
		"mutationReceiptId", "verificationRunId",
	} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if err := validateAgentWorkspaceRevision(value["targetRevision"], "/value/targetRevision"); err != nil {
		return err
	}
	for _, field := range []string{
		"approvedPlanDigest", "actualPlanDigest", "impactDigest", "policyDigest",
		"approvedRequiredCellSetDigest", "actualRequiredCellSetDigest", "regressionRequirementSetDigest",
	} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	kind, compatibility := stringValue(value["mutationKind"]), stringValue(value["planCompatibility"])
	if !oneOf(kind, "commit", "rollback") || !oneOf(compatibility, "exact", "compatible", "post-rollback") ||
		(kind == "rollback") != (compatibility == "post-rollback") ||
		(compatibility == "exact" && value["approvedPlanDigest"] != value["actualPlanDigest"]) {
		return errors.New("committed VerificationPlan compatibility is invalid")
	}
	if err := validateVerificationServicePrincipal(value["producer"], "/value/producer"); err != nil {
		return err
	}
	if err := requireInstant(value["boundAt"], "/value/boundAt"); err != nil {
		return err
	}
	return requireDigestMatch(value, "bindingDigest", "/value/bindingDigest")
}

func validateAgentVerificationEvidenceRefs(raw any) (int, error) {
	refs, ok := raw.([]any)
	if !ok || len(refs) > 10_000 {
		return 0, errors.New("/value/evidenceRefs is invalid")
	}
	previous := ""
	for index, rawRef := range refs {
		ref, ok := rawRef.(map[string]any)
		if !ok || requireExactObjectKeys(ref, []string{"evidenceId", "manifestDigest", "outcome"}, nil) != nil {
			return 0, fmt.Errorf("/value/evidenceRefs/%d is invalid", index)
		}
		id := stringValue(ref["evidenceId"])
		if requireIdentity(id, fmt.Sprintf("/value/evidenceRefs/%d/evidenceId", index)) != nil ||
			requireDigest(ref["manifestDigest"], fmt.Sprintf("/value/evidenceRefs/%d/manifestDigest", index)) != nil ||
			!oneOf(stringValue(ref["outcome"]), "passed", "failed", "blocked", "cancelled", "infrastructure-error") ||
			(index > 0 && id <= previous) {
			return 0, fmt.Errorf("/value/evidenceRefs/%d is non-canonical", index)
		}
		previous = id
	}
	return len(refs), nil
}

func validateAgentVerificationClosureReceipt(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"receiptId", "bindingId", "taskId", "runId", "verificationRunId", "targetRevision",
		"planDigest", "evidenceRefs", "evidenceSetDigest", "verifiedEvidenceViewDigest",
		"closureDigest", "verdict", "producer", "evaluatedAt", "receiptDigest",
	}, nil); err != nil {
		return err
	}
	for _, field := range []string{"receiptId", "bindingId", "taskId", "runId", "verificationRunId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if err := validateAgentWorkspaceRevision(value["targetRevision"], "/value/targetRevision"); err != nil {
		return err
	}
	for _, field := range []string{"planDigest", "evidenceSetDigest", "verifiedEvidenceViewDigest", "closureDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	count, err := validateAgentVerificationEvidenceRefs(value["evidenceRefs"])
	if err != nil {
		return err
	}
	verdict := stringValue(value["verdict"])
	if !oneOf(verdict, "satisfied", "unsatisfied", "stale") || (verdict == "satisfied" && count == 0) {
		return errors.New("Verification Closure verdict or Evidence set is invalid")
	}
	if err := validateVerificationServicePrincipal(value["producer"], "/value/producer"); err != nil {
		return err
	}
	if err := requireInstant(value["evaluatedAt"], "/value/evaluatedAt"); err != nil {
		return err
	}
	return requireDigestMatch(value, "receiptDigest", "/value/receiptDigest")
}

func validateCanonicalVerificationDigests(raw any, path string) error {
	values, ok := raw.([]any)
	if !ok || len(values) > 10_000 {
		return fmt.Errorf("%s is invalid", path)
	}
	previous := ""
	for index, rawValue := range values {
		value, ok := rawValue.(string)
		if !ok || requireDigest(value, fmt.Sprintf("%s/%d", path, index)) != nil ||
			(index > 0 && value <= previous) {
			return fmt.Errorf("%s must contain unique canonical digests", path)
		}
		previous = value
	}
	return nil
}

func validateAgentRepairRoundReceipt(value map[string]any) error {
	base := []string{
		"receiptId", "repairRoundId", "state", "taskId", "runId", "round",
		"failedClosureReceiptId", "failedClosureDigest", "failedEvidenceManifestDigests",
		"failureContextPackDigest", "counterexampleSetDigest", "regressionRequirementSetDigest",
		"cumulativeBudgetLedgerDigest", "producer", "recordedAt", "receiptDigest",
	}
	state := stringValue(value["state"])
	required := append([]string(nil), base...)
	switch state {
	case "started":
	case "proposal-bound":
		required = append(required, "proposalId", "previewId", "decisionId", "transactionDigest", "verificationPlanDigest")
	case "blocked":
		required = append(required, "blockReason")
	default:
		return errors.New("Agent repair round state is invalid")
	}
	if err := requireExactObjectKeys(value, required, nil); err != nil {
		return err
	}
	for _, field := range []string{"receiptId", "repairRoundId", "taskId", "runId", "failedClosureReceiptId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	round, ok := safeInteger(value["round"])
	if !ok || round < 1 || round > 1_000 {
		return errors.New("/value/round is invalid")
	}
	for _, field := range []string{
		"failedClosureDigest", "failureContextPackDigest", "counterexampleSetDigest",
		"regressionRequirementSetDigest", "cumulativeBudgetLedgerDigest",
	} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if err := validateCanonicalVerificationDigests(value["failedEvidenceManifestDigests"], "/value/failedEvidenceManifestDigests"); err != nil {
		return err
	}
	if state == "proposal-bound" {
		for _, field := range []string{"proposalId", "previewId", "decisionId"} {
			if err := requireIdentity(value[field], "/value/"+field); err != nil {
				return err
			}
		}
		for _, field := range []string{"transactionDigest", "verificationPlanDigest"} {
			if err := requireDigest(value[field], "/value/"+field); err != nil {
				return err
			}
		}
	} else if state == "blocked" && !oneOf(stringValue(value["blockReason"]),
		"repair-forbidden", "repair-round-exhausted", "budget-exhausted", "permission-denied",
		"regression-requirement-missing", "authority-drift") {
		return errors.New("Agent repair block reason is invalid")
	}
	if err := validateVerificationServicePrincipal(value["producer"], "/value/producer"); err != nil {
		return err
	}
	if err := requireInstant(value["recordedAt"], "/value/recordedAt"); err != nil {
		return err
	}
	return requireDigestMatch(value, "receiptDigest", "/value/receiptDigest")
}
