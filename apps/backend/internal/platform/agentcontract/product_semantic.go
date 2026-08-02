package agentcontract

import (
	"errors"
	"fmt"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func validateAgentProductSemantics(document map[string]any) error {
	if err := rejectUnsafeKeys(document, "/"); err != nil {
		return err
	}
	if err := requireExactObjectKeys(document, []string{"wireVersion", "factType", "value"}, nil); err != nil {
		return fmt.Errorf("Agent product envelope: %w", err)
	}
	value, ok := document["value"].(map[string]any)
	if !ok {
		return errors.New("Agent product fact value must be an object")
	}
	switch stringValue(document["factType"]) {
	case "product-supplement":
		return validateAgentProductSupplement(value)
	case "run-user-command":
		return validateAgentRunUserCommand(value)
	default:
		return fmt.Errorf("unsupported Agent product fact type %q", document["factType"])
	}
}

func validateAgentProductSupplement(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"supplementId", "taskId", "runId", "generation", "runSnapshotDigest",
		"runtime", "diagnostics", "producer", "projectedAt", "supplementDigest",
	}, []string{"context", "proposalReview"}); err != nil {
		return err
	}
	for _, field := range []string{"supplementId", "taskId", "runId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	generation, ok := safeInteger(value["generation"])
	if !ok || generation < 0 {
		return errors.New("/value/generation must be a non-negative safe integer")
	}
	if err := requireDigest(value["runSnapshotDigest"], "/value/runSnapshotDigest"); err != nil {
		return err
	}
	if err := validateAgentProductRuntime(value["runtime"]); err != nil {
		return err
	}
	if err := validateAgentProductDiagnostics(value["diagnostics"]); err != nil {
		return err
	}
	if err := validateVerificationServicePrincipal(value["producer"], "/value/producer"); err != nil {
		return err
	}
	if err := requireInstant(value["projectedAt"], "/value/projectedAt"); err != nil {
		return err
	}
	if context := value["context"]; context != nil {
		if err := validateAgentProductContext(context); err != nil {
			return err
		}
	}
	if review := value["proposalReview"]; review != nil {
		if err := validateAgentProductProposalReview(review); err != nil {
			return err
		}
	}
	return requireDigestMatch(value, "supplementDigest", "/value/supplementDigest")
}

func validateAgentProductRuntime(raw any) error {
	runtime, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(runtime, []string{"models", "tools", "usage", "costs", "budgetLedgerDigest"}, []string{"usageVectorDigest"}) != nil {
		return errors.New("/value/runtime must be an exact runtime summary")
	}
	if err := requireDigest(runtime["budgetLedgerDigest"], "/value/runtime/budgetLedgerDigest"); err != nil {
		return err
	}
	if runtime["usageVectorDigest"] != nil {
		if err := requireDigest(runtime["usageVectorDigest"], "/value/runtime/usageVectorDigest"); err != nil {
			return err
		}
	}
	models, ok := runtime["models"].([]any)
	if !ok || len(models) > 10_000 {
		return errors.New("/value/runtime/models is invalid")
	}
	previous := ""
	for index, rawModel := range models {
		model, ok := rawModel.(map[string]any)
		if !ok || requireExactObjectKeys(model, []string{
			"invocationId", "providerConfigurationId", "protocolFamily", "providerOperatorId",
			"modelId", "capabilityProfileId", "outcome",
		}, []string{"modelVersion", "receiptDigest"}) != nil {
			return fmt.Errorf("/value/runtime/models/%d is invalid", index)
		}
		for _, field := range []string{"invocationId", "providerConfigurationId", "providerOperatorId", "modelId", "capabilityProfileId"} {
			if err := requireIdentity(model[field], fmt.Sprintf("/value/runtime/models/%d/%s", index, field)); err != nil {
				return err
			}
		}
		id := stringValue(model["invocationId"])
		if (index > 0 && id <= previous) || !oneOf(stringValue(model["protocolFamily"]), "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
			!oneOf(stringValue(model["outcome"]), "running", "completed", "refused", "blocked", "failed", "cancelled") {
			return fmt.Errorf("/value/runtime/models/%d is non-canonical", index)
		}
		if model["modelVersion"] != nil {
			if err := requireIdentity(model["modelVersion"], fmt.Sprintf("/value/runtime/models/%d/modelVersion", index)); err != nil {
				return err
			}
		}
		if model["receiptDigest"] != nil {
			if err := requireDigest(model["receiptDigest"], fmt.Sprintf("/value/runtime/models/%d/receiptDigest", index)); err != nil {
				return err
			}
		}
		previous = id
	}
	tools, ok := runtime["tools"].([]any)
	if !ok || len(tools) > 10_000 {
		return errors.New("/value/runtime/tools is invalid")
	}
	previous = ""
	for index, rawTool := range tools {
		tool, ok := rawTool.(map[string]any)
		if !ok || requireExactObjectKeys(tool, []string{"callId", "toolId", "executionLocus", "state"}, []string{"receiptDigest"}) != nil {
			return fmt.Errorf("/value/runtime/tools/%d is invalid", index)
		}
		if err := requireIdentity(tool["callId"], fmt.Sprintf("/value/runtime/tools/%d/callId", index)); err != nil {
			return err
		}
		if err := requireIdentity(tool["toolId"], fmt.Sprintf("/value/runtime/tools/%d/toolId", index)); err != nil {
			return err
		}
		id := stringValue(tool["callId"])
		if (index > 0 && id <= previous) || !oneOf(stringValue(tool["executionLocus"]), "client-hosted", "prodivix-runtime", "provider-hosted", "pinned-mcp") ||
			!oneOf(stringValue(tool["state"]), "authorized", "running", "completed", "rejected", "cancelled") {
			return fmt.Errorf("/value/runtime/tools/%d is non-canonical", index)
		}
		if tool["receiptDigest"] != nil {
			if err := requireDigest(tool["receiptDigest"], fmt.Sprintf("/value/runtime/tools/%d/receiptDigest", index)); err != nil {
				return err
			}
		}
		previous = id
	}
	for _, field := range []string{"usage", "costs"} {
		values, ok := runtime[field].([]any)
		if !ok || len(values) > 10_000 {
			return fmt.Errorf("/value/runtime/%s is invalid", field)
		}
	}
	return nil
}

func validateAgentProductDiagnostics(raw any) error {
	diagnostics, ok := raw.([]any)
	if !ok || len(diagnostics) > 1_000 {
		return errors.New("/value/diagnostics is invalid")
	}
	previous := ""
	for index, rawDiagnostic := range diagnostics {
		diagnostic, ok := rawDiagnostic.(map[string]any)
		if !ok || requireExactObjectKeys(diagnostic, []string{"code", "severity", "state", "message", "identityRefs"}, []string{"nextAction"}) != nil {
			return fmt.Errorf("/value/diagnostics/%d is invalid", index)
		}
		code := stringValue(diagnostic["code"])
		if !agentControlDiagnosticPattern.MatchString(code) || !oneOf(stringValue(diagnostic["severity"]), "info", "warning", "error") ||
			!oneOf(stringValue(diagnostic["state"]), "active", "resolved") {
			return fmt.Errorf("/value/diagnostics/%d identity is invalid", index)
		}
		message, ok := diagnostic["message"].(string)
		if !ok || message == "" || len(message) > 16_384 || agentControlCredentialPattern.MatchString(message) {
			return fmt.Errorf("/value/diagnostics/%d/message is invalid", index)
		}
		refs, ok := diagnostic["identityRefs"].([]any)
		if !ok || len(refs) > 128 {
			return fmt.Errorf("/value/diagnostics/%d/identityRefs is invalid", index)
		}
		priorRef := ""
		for refIndex, ref := range refs {
			id := stringValue(ref)
			if requireIdentity(id, fmt.Sprintf("/value/diagnostics/%d/identityRefs/%d", index, refIndex)) != nil || (refIndex > 0 && id <= priorRef) {
				return fmt.Errorf("/value/diagnostics/%d/identityRefs is non-canonical", index)
			}
			priorRef = id
		}
		sortKey := code + "\x00" + message
		if index > 0 && sortKey <= previous {
			return errors.New("/value/diagnostics must be in canonical order")
		}
		previous = sortKey
	}
	return nil
}

func validateAgentProductContext(raw any) error {
	context, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(context, []string{
		"contextPackId", "taskId", "runId", "workspaceRevision", "semanticSnapshotRef",
		"semanticProviderSetDigest", "contextContributorSetDigest", "providerSetDigest",
		"policyDigest", "items", "omitted", "budget", "manifestDigest",
	}, nil) != nil {
		return errors.New("/value/context must be an exact metadata-only Context Pack")
	}
	for _, field := range []string{"contextPackId", "taskId", "runId", "semanticSnapshotRef"} {
		if err := requireIdentity(context[field], "/value/context/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"semanticProviderSetDigest", "contextContributorSetDigest", "providerSetDigest", "policyDigest", "manifestDigest"} {
		if err := requireDigest(context[field], "/value/context/"+field); err != nil {
			return err
		}
	}
	manifest := stringValue(context["manifestDigest"])
	if stringValue(context["contextPackId"]) != "context-pack:"+strings.TrimPrefix(manifest, "sha256-") {
		return errors.New("/value/context/contextPackId must derive from manifestDigest")
	}
	if err := validateAgentWorkspaceRevision(context["workspaceRevision"], "/value/context/workspaceRevision"); err != nil {
		return err
	}
	items, ok := context["items"].([]any)
	if !ok || len(items) > 10_000 {
		return errors.New("/value/context/items is invalid")
	}
	for index, rawItem := range items {
		item, ok := rawItem.(map[string]any)
		if !ok || requireExactObjectKeys(item, []string{
			"itemId", "kind", "authority", "source", "revision", "contentDigest", "mediaType",
			"byteLength", "sensitivity", "instructionBoundary",
		}, []string{"mediaRepresentationRef", "sourceTraceRef"}) != nil {
			return fmt.Errorf("/value/context/items/%d includes body content or invalid metadata", index)
		}
		if err := requireIdentity(item["itemId"], fmt.Sprintf("/value/context/items/%d/itemId", index)); err != nil {
			return err
		}
		if err := requireDigest(item["contentDigest"], fmt.Sprintf("/value/context/items/%d/contentDigest", index)); err != nil {
			return err
		}
		length, ok := safeInteger(item["byteLength"])
		if !ok || length < 0 {
			return fmt.Errorf("/value/context/items/%d/byteLength is invalid", index)
		}
	}
	if _, ok := context["omitted"].([]any); !ok {
		return errors.New("/value/context/omitted is invalid")
	}
	budget, ok := context["budget"].(map[string]any)
	if !ok || requireExactObjectKeys(budget, []string{"maxItems", "maxBytes"}, nil) != nil {
		return errors.New("/value/context/budget is invalid")
	}
	return nil
}

func validateAgentProductProposalReview(raw any) error {
	review, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(review, []string{
		"proposalId", "previewId", "semanticDiff", "semanticDiffDigest", "impact", "impactDigest",
		"verificationPlan", "verificationPlanDigest", "permissions", "risks", "rollback", "reviewDigest",
	}, nil) != nil {
		return errors.New("/value/proposalReview is invalid")
	}
	for _, field := range []string{"proposalId", "previewId"} {
		if err := requireIdentity(review[field], "/value/proposalReview/"+field); err != nil {
			return err
		}
	}
	for _, pair := range [][2]string{{"semanticDiff", "semanticDiffDigest"}, {"impact", "impactDigest"}, {"verificationPlan", "verificationPlanDigest"}} {
		expected := stringValue(review[pair[1]])
		actual, err := canonicaljson.Digest(review[pair[0]])
		if err != nil || expected != actual {
			return fmt.Errorf("/value/proposalReview/%s drifted", pair[1])
		}
	}
	permissions, ok := review["permissions"].([]any)
	if !ok || len(permissions) > 16 {
		return errors.New("/value/proposalReview/permissions is invalid")
	}
	previous := ""
	for index, permission := range permissions {
		current := stringValue(permission)
		if !oneOf(current, "read", "execute", "propose", "approve", "commit", "rollback") || (index > 0 && current <= previous) {
			return errors.New("/value/proposalReview/permissions is non-canonical")
		}
		previous = current
	}
	if _, ok := review["risks"].([]any); !ok {
		return errors.New("/value/proposalReview/risks is invalid")
	}
	rollback, ok := review["rollback"].(map[string]any)
	if !ok || requireExactObjectKeys(rollback, []string{"reverseTransactionDigest", "authorization"}, nil) != nil ||
		requireDigest(rollback["reverseTransactionDigest"], "/value/proposalReview/rollback/reverseTransactionDigest") != nil ||
		!oneOf(stringValue(rollback["authorization"]), "none", "on-unsatisfied-closure") {
		return errors.New("/value/proposalReview/rollback is invalid")
	}
	return requireDigestMatch(review, "reviewDigest", "/value/proposalReview/reviewDigest")
}

func validateAgentRunUserCommand(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"commandId", "taskId", "runId", "kind", "actor", "expectedGeneration",
		"expectedSnapshotDigest", "idempotencyKey", "requestedAt", "commandDigest",
	}, []string{"reason"}); err != nil {
		return err
	}
	for _, field := range []string{"commandId", "taskId", "runId", "idempotencyKey"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if !oneOf(stringValue(value["kind"]), "cancel", "recover") {
		return errors.New("/value/kind is invalid")
	}
	actor, ok := value["actor"].(map[string]any)
	if !ok || requireExactObjectKeys(actor, []string{"kind", "principalId"}, nil) != nil || stringValue(actor["kind"]) != "user" {
		return errors.New("/value/actor must identify a user")
	}
	if err := requireIdentity(actor["principalId"], "/value/actor/principalId"); err != nil {
		return err
	}
	generation, ok := safeInteger(value["expectedGeneration"])
	if !ok || generation < 0 {
		return errors.New("/value/expectedGeneration is invalid")
	}
	if err := requireDigest(value["expectedSnapshotDigest"], "/value/expectedSnapshotDigest"); err != nil {
		return err
	}
	if err := requireInstant(value["requestedAt"], "/value/requestedAt"); err != nil {
		return err
	}
	if reason, present := value["reason"]; present {
		text, ok := reason.(string)
		if !ok || text == "" || len(text) > 8_192 || agentControlCredentialPattern.MatchString(text) {
			return errors.New("/value/reason is invalid")
		}
	}
	return requireDigestMatch(value, "commandDigest", "/value/commandDigest")
}

func validateAgentProductViewSemantics(document map[string]any) error {
	if err := rejectUnsafeKeys(document, "/"); err != nil {
		return err
	}
	if err := requireExactObjectKeys(document, []string{"wireVersion", "kind", "value"}, nil); err != nil || stringValue(document["kind"]) != "agent-product-view" {
		return errors.New("Agent product view envelope is invalid")
	}
	view, ok := document["value"].(map[string]any)
	if !ok || requireExactObjectKeys(view, []string{
		"identity", "task", "run", "cleanupState", "budgetLedger", "mutations", "verificationBindings",
		"verificationClosures", "repairRounds", "runtime", "diagnostics", "timeline", "commands",
		"availableActions", "viewDigest",
	}, []string{"context", "proposal", "planning", "preview", "proposalReview", "approval", "audit"}) != nil {
		return errors.New("Agent product view is invalid")
	}
	identity, ok := view["identity"].(map[string]any)
	if !ok || requireExactObjectKeys(identity, []string{
		"projectId", "workspaceId", "taskId", "taskDigest", "runId", "runSnapshotDigest", "generation", "attempt", "cursor",
	}, []string{
		"latestEventDigest", "contextPackDigest", "proposalId", "proposalDigest", "previewId", "previewDigest",
		"decisionId", "mutationReceiptId", "verificationBindingId", "verificationClosureReceiptId", "verificationClosureDigest",
	}) != nil {
		return errors.New("Agent product view identity is invalid")
	}
	for _, field := range []string{"projectId", "workspaceId", "taskId", "runId"} {
		if err := requireIdentity(identity[field], "/value/identity/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"taskDigest", "runSnapshotDigest"} {
		if err := requireDigest(identity[field], "/value/identity/"+field); err != nil {
			return err
		}
	}
	task, taskOK := view["task"].(map[string]any)
	run, runOK := view["run"].(map[string]any)
	if !taskOK || !runOK || task["taskId"] != identity["taskId"] || task["projectId"] != identity["projectId"] || task["workspaceId"] != identity["workspaceId"] ||
		run["runId"] != identity["runId"] || run["taskId"] != identity["taskId"] || run["generation"] != identity["generation"] || run["attempt"] != identity["attempt"] {
		return errors.New("Agent product view Task and Run identity drifted")
	}
	if err := validateAgentProductRuntime(view["runtime"]); err != nil {
		return err
	}
	if err := validateAgentProductDiagnostics(view["diagnostics"]); err != nil {
		return err
	}
	timeline, ok := view["timeline"].([]any)
	cursor, cursorOK := safeInteger(identity["cursor"])
	if !ok || !cursorOK || cursor < 1 || int64(len(timeline)) != cursor {
		return errors.New("Agent product view timeline does not cover the Run cursor")
	}
	for index, rawEntry := range timeline {
		entry, ok := rawEntry.(map[string]any)
		if !ok || requireExactObjectKeys(entry, []string{"sequence", "eventId", "family", "type", "generation", "occurredAt", "eventDigest"}, []string{"diagnosticCode"}) != nil {
			return fmt.Errorf("/value/timeline/%d is invalid", index)
		}
		sequence, sequenceOK := safeInteger(entry["sequence"])
		if !sequenceOK || sequence != int64(index+1) || requireDigest(entry["eventDigest"], fmt.Sprintf("/value/timeline/%d/eventDigest", index)) != nil {
			return fmt.Errorf("/value/timeline/%d is non-contiguous", index)
		}
	}
	if timeline[len(timeline)-1].(map[string]any)["eventDigest"] != identity["latestEventDigest"] {
		return errors.New("Agent product view timeline head drifted")
	}
	actions, ok := view["availableActions"].([]any)
	if !ok {
		return errors.New("Agent product view actions are invalid")
	}
	seen := map[string]struct{}{}
	for _, action := range actions {
		current := stringValue(action)
		if !oneOf(current, "approve", "reject", "cancel", "recover", "repair", "export-audit") {
			return errors.New("Agent product view action is invalid")
		}
		if _, duplicate := seen[current]; duplicate {
			return errors.New("Agent product view actions contain duplicates")
		}
		seen[current] = struct{}{}
	}
	return requireDigestMatch(view, "viewDigest", "/value/viewDigest")
}
