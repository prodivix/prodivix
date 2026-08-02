package agentcontract

import (
	"errors"
	"fmt"
	"strings"
)

func validateAgentProposalSemantics(document map[string]any) error {
	if err := rejectUnsafeKeys(document, "/"); err != nil {
		return err
	}
	if err := requireExactObjectKeys(document, []string{"wireVersion", "factType", "value"}, nil); err != nil {
		return fmt.Errorf("Agent proposal envelope: %w", err)
	}
	value, ok := document["value"].(map[string]any)
	if !ok {
		return errors.New("Agent proposal fact value must be an object")
	}
	switch stringValue(document["factType"]) {
	case "proposal":
		return validateAgentActionProposal(value)
	case "planning":
		return validateAgentProposalPlanning(value)
	case "preview":
		return validateAgentProposalPreview(value)
	case "approval":
		return validateAgentApproval(value)
	case "workspace-mutation-receipt":
		return validateAgentWorkspaceMutationReceipt(value)
	default:
		return fmt.Errorf("unsupported Agent proposal fact type %q", document["factType"])
	}
}

func validateAgentActionProposal(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"proposalId", "taskId", "runId", "baseRevision", "contextPackDigest",
		"actions", "explanation", "assumptions", "requestedVerification",
		"modelInvocationRefs", "proposalDigest",
	}, nil); err != nil {
		return err
	}
	for _, field := range []string{"proposalId", "taskId", "runId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if err := requireDigest(value["contextPackDigest"], "/value/contextPackDigest"); err != nil {
		return err
	}
	if err := validateAgentWorkspaceRevision(value["baseRevision"], "/value/baseRevision"); err != nil {
		return err
	}
	actions, ok := value["actions"].([]any)
	if !ok || len(actions) < 1 || len(actions) > 128 {
		return errors.New("/value/actions must contain 1..128 typed actions")
	}
	previous := ""
	targets := make(map[string]struct{}, len(actions))
	for index, raw := range actions {
		action, ok := raw.(map[string]any)
		if !ok || requireExactObjectKeys(action, []string{"ownerId", "actionType", "inputSchemaId", "target", "input"}, nil) != nil {
			return fmt.Errorf("/value/actions/%d is invalid", index)
		}
		for _, field := range []string{"ownerId", "actionType", "inputSchemaId"} {
			if err := requireIdentity(action[field], fmt.Sprintf("/value/actions/%d/%s", index, field)); err != nil {
				return err
			}
		}
		target, ok := action["target"].(map[string]any)
		if !ok || requireExactObjectKeys(target, []string{"kind", "id"}, nil) != nil ||
			!oneOf(stringValue(target["kind"]), "workspace", "document", "semantic-target") ||
			requireIdentity(target["id"], fmt.Sprintf("/value/actions/%d/target/id", index)) != nil {
			return fmt.Errorf("/value/actions/%d/target is invalid", index)
		}
		if _, ok := action["input"].(map[string]any); !ok {
			return fmt.Errorf("/value/actions/%d/input must be an object", index)
		}
		if err := rejectAgentActionEnvelopeAuthority(action["input"], fmt.Sprintf("/value/actions/%d/input", index)); err != nil {
			return err
		}
		identity := stringValue(action["ownerId"]) + "\x00" + stringValue(action["actionType"]) + "\x00" + stringValue(action["inputSchemaId"])
		if index > 0 && identity < previous {
			return errors.New("/value/actions must use canonical descriptor order")
		}
		previous = identity
		targetIdentity := stringValue(target["kind"]) + "\x00" + stringValue(target["id"])
		if _, exists := targets[targetIdentity]; exists {
			return errors.New("/value/actions target identities must be unique")
		}
		targets[targetIdentity] = struct{}{}
	}
	if err := validateBoundedAgentText(value["explanation"], "/value/explanation", 65_536); err != nil {
		return err
	}
	assumptions, ok := value["assumptions"].([]any)
	if !ok || len(assumptions) > 128 {
		return errors.New("/value/assumptions is invalid")
	}
	for index, assumption := range assumptions {
		if err := validateBoundedAgentText(assumption, fmt.Sprintf("/value/assumptions/%d", index), 4_096); err != nil {
			return err
		}
	}
	if err := validateAgentVerificationRequirement(value["requestedVerification"]); err != nil {
		return err
	}
	if err := validateCanonicalIdentities(value["modelInvocationRefs"], "/value/modelInvocationRefs", 512, true); err != nil {
		return err
	}
	return requireDigestMatch(value, "proposalDigest", "/value/proposalDigest")
}

func rejectAgentActionEnvelopeAuthority(raw any, path string) error {
	input, ok := raw.(map[string]any)
	if !ok {
		return fmt.Errorf("%s must be an object", path)
	}
	for key := range input {
		switch strings.ToLower(key) {
		case "patch", "patches", "jsonpatch", "command", "commands", "transaction", "workspaceoperation", "approval", "approved", "credential", "credentials", "secret", "secrets", "token", "tokens", "cookie", "authorization", "forwardops", "reverseops":
			return fmt.Errorf("%s/%s cannot carry generic write or bearer authority", path, key)
		}
	}
	return rejectAgentCredentialText(input, path)
}

func rejectAgentCredentialText(value any, path string) error {
	switch current := value.(type) {
	case string:
		if agentControlCredentialPattern.MatchString(current) {
			return fmt.Errorf("%s contains credential-like material", path)
		}
	case []any:
		for index, entry := range current {
			if err := rejectAgentCredentialText(entry, fmt.Sprintf("%s/%d", path, index)); err != nil {
				return err
			}
		}
	case map[string]any:
		for key, entry := range current {
			if err := rejectAgentCredentialText(entry, path+"/"+key); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateAgentProposalPlanning(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"proposalId", "baseRevision", "proposedSnapshotDigest", "transactionDigest",
		"reverseTransactionDigest", "semanticDiffDigest", "impactSetRef", "impactDigest",
		"verificationPlanRef", "verificationPlanDigest", "sourceTraceDigest",
		"requiredCapabilities", "risks", "diagnosticRefs", "plannedAt", "expiresAt", "planningDigest",
	}, nil); err != nil {
		return err
	}
	if err := validateAgentProposalReviewCommon(value, true); err != nil {
		return err
	}
	plannedAt, plannedErr := parseInstant(value["plannedAt"])
	expiresAt, expiresErr := parseInstant(value["expiresAt"])
	if plannedErr != nil || expiresErr != nil || !expiresAt.After(plannedAt) {
		return errors.New("proposal planning lifetime is invalid")
	}
	return requireDigestMatch(value, "planningDigest", "/value/planningDigest")
}

func validateAgentProposalPreview(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"previewId", "proposalId", "baseRevision", "proposedSnapshotDigest", "transactionDigest",
		"reverseTransactionDigest", "semanticDiffDigest", "impactSetRef", "impactDigest",
		"verificationPlanRef", "verificationPlanDigest", "requiredCapabilities", "risks",
		"diagnosticRefs", "previewDigest", "expiresAt",
	}, nil); err != nil {
		return err
	}
	if err := requireIdentity(value["previewId"], "/value/previewId"); err != nil {
		return err
	}
	if err := validateAgentProposalReviewCommon(value, false); err != nil {
		return err
	}
	if err := requireInstant(value["expiresAt"], "/value/expiresAt"); err != nil {
		return err
	}
	return requireDigestMatch(value, "previewDigest", "/value/previewDigest")
}

func validateAgentProposalReviewCommon(value map[string]any, planning bool) error {
	for _, field := range []string{"proposalId", "impactSetRef", "verificationPlanRef"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if err := validateAgentWorkspaceRevision(value["baseRevision"], "/value/baseRevision"); err != nil {
		return err
	}
	for _, field := range []string{
		"proposedSnapshotDigest", "transactionDigest", "reverseTransactionDigest", "semanticDiffDigest",
		"impactDigest", "verificationPlanDigest",
	} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if planning {
		if err := requireDigest(value["sourceTraceDigest"], "/value/sourceTraceDigest"); err != nil {
			return err
		}
	}
	if err := validateCanonicalEnumStrings(value["requiredCapabilities"], "/value/requiredCapabilities", []string{"read", "execute", "propose", "approve", "commit", "rollback"}, 6, false); err != nil {
		return err
	}
	if err := validateAgentRisks(value["risks"]); err != nil {
		return err
	}
	return validateCanonicalIdentities(value["diagnosticRefs"], "/value/diagnosticRefs", 512, true)
}

func validateAgentRisks(raw any) error {
	risks, ok := raw.([]any)
	if !ok || len(risks) > 128 {
		return errors.New("/value/risks is invalid")
	}
	previousRank := 5
	previousIdentity := ""
	ranks := map[string]int{"low": 0, "medium": 1, "high": 2, "critical": 3}
	seen := make(map[string]struct{}, len(risks))
	for index, rawRisk := range risks {
		risk, ok := rawRisk.(map[string]any)
		if !ok || requireExactObjectKeys(risk, []string{"id", "level", "message"}, nil) != nil ||
			requireIdentity(risk["id"], fmt.Sprintf("/value/risks/%d/id", index)) != nil {
			return fmt.Errorf("/value/risks/%d is invalid", index)
		}
		level, id := stringValue(risk["level"]), stringValue(risk["id"])
		rank, exists := ranks[level]
		if !exists {
			return fmt.Errorf("/value/risks/%d/level is invalid", index)
		}
		if err := validateBoundedAgentText(risk["message"], fmt.Sprintf("/value/risks/%d/message", index), 4_096); err != nil {
			return err
		}
		identity := id + "\x00" + stringValue(risk["message"])
		if rank > previousRank || (rank == previousRank && identity <= previousIdentity) {
			return errors.New("/value/risks is not canonically ordered")
		}
		if _, duplicate := seen[id]; duplicate {
			return errors.New("/value/risks ids must be unique")
		}
		seen[id] = struct{}{}
		previousRank, previousIdentity = rank, identity
	}
	return nil
}

func validateAgentApproval(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"decisionId", "decision", "actor", "taskId", "runId", "previewId", "previewDigest",
		"baseRevision", "transactionDigest", "impactDigest", "verificationPlanDigest", "grantRef",
		"policyDigest", "rollbackAuthorization", "decidedAt", "expiresAt",
	}, []string{"reason"}); err != nil {
		return err
	}
	for _, field := range []string{"decisionId", "taskId", "runId", "previewId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	decision := stringValue(value["decision"])
	rollback := stringValue(value["rollbackAuthorization"])
	if !oneOf(decision, "approved", "rejected") || !oneOf(rollback, "none", "on-unsatisfied-closure") ||
		(decision == "rejected" && rollback != "none") {
		return errors.New("approval decision lifecycle is invalid")
	}
	actor, ok := value["actor"].(map[string]any)
	if !ok || requireExactObjectKeys(actor, []string{"kind", "principalId"}, nil) != nil ||
		stringValue(actor["kind"]) != "user" || requireIdentity(actor["principalId"], "/value/actor/principalId") != nil {
		return errors.New("approval actor must be an explicit user")
	}
	grant, ok := value["grantRef"].(map[string]any)
	if !ok || requireExactObjectKeys(grant, []string{"grantId"}, nil) != nil || requireIdentity(grant["grantId"], "/value/grantRef/grantId") != nil {
		return errors.New("approval grant reference is invalid")
	}
	if err := validateAgentWorkspaceRevision(value["baseRevision"], "/value/baseRevision"); err != nil {
		return err
	}
	for _, field := range []string{"previewDigest", "transactionDigest", "impactDigest", "verificationPlanDigest", "policyDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	decidedAt, decidedErr := parseInstant(value["decidedAt"])
	expiresAt, expiresErr := parseInstant(value["expiresAt"])
	if decidedErr != nil || expiresErr != nil || !expiresAt.After(decidedAt) {
		return errors.New("approval lifetime is invalid")
	}
	if reason, exists := value["reason"]; exists {
		return validateBoundedAgentText(reason, "/value/reason", 4_096)
	}
	return nil
}

func validateAgentWorkspaceMutationReceipt(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"receiptId", "kind", "state", "taskId", "runId", "proposalId", "previewId", "decisionId",
		"operationId", "baseRevision", "transactionDigest", "reverseTransactionDigest", "requestDigest",
		"producer", "startedAt", "receiptDigest",
	}, []string{"completedAt", "targetRevision", "mutationDigest", "conflictDigest"}); err != nil {
		return err
	}
	for _, field := range []string{"receiptId", "taskId", "runId", "proposalId", "previewId", "decisionId", "operationId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if !oneOf(stringValue(value["kind"]), "commit", "rollback") ||
		!oneOf(stringValue(value["state"]), "started", "acknowledged", "conflicted", "reconciliation-required") {
		return errors.New("Workspace mutation kind or state is invalid")
	}
	if err := validateAgentWorkspaceRevision(value["baseRevision"], "/value/baseRevision"); err != nil {
		return err
	}
	for _, field := range []string{"transactionDigest", "reverseTransactionDigest", "requestDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	producer, ok := value["producer"].(map[string]any)
	if !ok || requireExactObjectKeys(producer, []string{"kind", "principalId"}, nil) != nil ||
		!oneOf(stringValue(producer["kind"]), "user", "service") || requireIdentity(producer["principalId"], "/value/producer/principalId") != nil {
		return errors.New("Workspace mutation producer is invalid")
	}
	startedAt, startedErr := parseInstant(value["startedAt"])
	completedAt, hasCompleted := value["completedAt"]
	if startedErr != nil {
		return errors.New("Workspace mutation start instant is invalid")
	}
	if hasCompleted {
		parsed, err := parseInstant(completedAt)
		if err != nil || parsed.Before(startedAt) {
			return errors.New("Workspace mutation completion instant is invalid")
		}
	}
	state := stringValue(value["state"])
	_, hasTarget := value["targetRevision"]
	_, hasMutation := value["mutationDigest"]
	_, hasConflict := value["conflictDigest"]
	if (state == "started" && (hasCompleted || hasTarget || hasMutation || hasConflict)) ||
		(state == "acknowledged" && (!hasCompleted || !hasTarget || !hasMutation || hasConflict)) ||
		(state == "conflicted" && (!hasCompleted || hasTarget || hasMutation || !hasConflict)) ||
		(state == "reconciliation-required" && (hasTarget || hasMutation || hasConflict)) {
		return errors.New("Workspace mutation state fields are incompatible")
	}
	if hasTarget {
		if err := validateAgentWorkspaceRevision(value["targetRevision"], "/value/targetRevision"); err != nil {
			return err
		}
	}
	for _, field := range []string{"mutationDigest", "conflictDigest"} {
		if member, exists := value[field]; exists {
			if err := requireDigest(member, "/value/"+field); err != nil {
				return err
			}
		}
	}
	return requireDigestMatch(value, "receiptDigest", "/value/receiptDigest")
}

func validateBoundedAgentText(raw any, path string, maximum int) error {
	text, ok := raw.(string)
	if !ok || strings.TrimSpace(text) == "" || strings.TrimSpace(text) != text || len(text) > maximum || agentControlCredentialPattern.MatchString(text) {
		return fmt.Errorf("%s is empty, oversized, non-canonical, or credential-like", path)
	}
	return nil
}

func validateCanonicalIdentities(raw any, path string, maximum int, allowEmpty bool) error {
	values, ok := raw.([]any)
	if !ok || len(values) > maximum || (!allowEmpty && len(values) == 0) {
		return fmt.Errorf("%s has invalid bounds", path)
	}
	previous := ""
	for index, value := range values {
		identity, ok := value.(string)
		if !ok || requireIdentity(identity, path) != nil || (index > 0 && identity <= previous) {
			return fmt.Errorf("%s must contain unique canonical identities", path)
		}
		previous = identity
	}
	return nil
}

func validateCanonicalEnumStrings(raw any, path string, allowed []string, maximum int, allowEmpty bool) error {
	values, ok := raw.([]any)
	if !ok || len(values) > maximum || (!allowEmpty && len(values) == 0) {
		return fmt.Errorf("%s has invalid bounds", path)
	}
	order := make(map[string]int, len(allowed))
	for index, value := range allowed {
		order[value] = index
	}
	previous := -1
	for _, rawValue := range values {
		value, ok := rawValue.(string)
		position, exists := order[value]
		if !ok || !exists || position <= previous {
			return fmt.Errorf("%s is invalid or non-canonical", path)
		}
		previous = position
	}
	return nil
}
