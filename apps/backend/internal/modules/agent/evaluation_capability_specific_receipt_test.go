package agent

import (
	"encoding/json"
	"sort"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestEvaluationParallelToolJoinRequiresCompleteControlledExecutionLeafSet(t *testing.T) {
	digest := func(label string) string { return evaluationBoundedExportTestDigest(t, label) }
	executionDigests := []string{digest("parallel-execution-a"), digest("parallel-execution-b")}
	sort.Strings(executionDigests)
	base := map[string]any{
		"groupId": "parallel/group.test", "planDigest": digest("parallel-plan"), "generation": json.Number("1"),
		"joinedCallIds":                         []any{"call/a", "call/b"},
		"controlledToolExecutionReceiptDigests": []any{executionDigests[0], executionDigests[1]},
		"cancelledCallIds":                      []any{}, "lateCallIds": []any{}, "status": "joined",
		"resultDigest": digest("parallel-result"),
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	valid := cloneEvaluationObject(base)
	valid["receiptDigest"] = receiptDigest
	if _, err := validateEvaluationProviderCapabilityFact("parallel-tool-join", valid); err != nil {
		t.Fatalf("complete parallel execution leaf set was rejected: %v", err)
	}

	for name, mutate := range map[string]func(map[string]any){
		"missing execution leaf": func(value map[string]any) {
			value["controlledToolExecutionReceiptDigests"] = []any{executionDigests[0]}
		},
		"non-joined state": func(value map[string]any) { value["status"] = "fenced" },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := cloneEvaluationObject(valid)
			delete(candidate, "receiptDigest")
			mutate(candidate)
			recomputed, err := canonicaljson.Digest(candidate)
			if err != nil {
				t.Fatal(err)
			}
			candidate["receiptDigest"] = recomputed
			if _, err := validateEvaluationProviderCapabilityFact("parallel-tool-join", candidate); err == nil {
				t.Fatal("recomputed incomplete parallel join authority was accepted")
			}
		})
	}
}

func TestEvaluationProviderCapabilitySpecificControlIdentitiesMatchCurrentContract(t *testing.T) {
	digest := func(label string) string { return evaluationBoundedExportTestDigest(t, label) }
	instant := "2026-08-09T00:00:00.000Z"

	providerJobBase := map[string]any{
		"providerJobId": "provider/job.1", "taskId": "task/job.1", "runId": "run/job.1",
		"generation": json.Number("1"), "invocationId": "invocation/job.1", "phase": "running",
		"callbackAuthority": "active",
	}
	providerJob := withEvaluationCapabilityFactDigest(t, providerJobBase, "receiptDigest")
	if _, err := validateEvaluationProviderCapabilityFact("provider-job", providerJob); err != nil {
		t.Fatalf("slash-bearing provider-job control identities were rejected: %v", err)
	}

	retrievalBase := map[string]any{
		"queryId": "query/retrieval.1", "toolDescriptorDigest": digest("retrieval-tool"),
		"queryDigest": digest("retrieval-query"), "purpose": "public-research",
		"networkPolicyDigest": digest("retrieval-network"),
		"sourceResultRefs":    []any{"source/result.1", "source/result.2"},
		"sourceResultDigests": []any{digest("source-result-1"), digest("source-result-2")},
		"usageRef":            "usage/retrieval.1", "startedAt": instant, "completedAt": instant,
	}
	retrieval := withEvaluationCapabilityFactDigest(t, retrievalBase, "receiptDigest")
	if _, err := validateEvaluationProviderCapabilityFact("retrieval-query", retrieval); err != nil {
		t.Fatalf("slash-bearing retrieval control identities were rejected: %v", err)
	}

	for name, candidate := range map[string]map[string]any{
		"provider job credential":     mutateEvaluationCapabilityFact(t, providerJob, "providerJobId", "Bearer abcdefghijklmnop"),
		"retrieval query whitespace":  mutateEvaluationCapabilityFact(t, retrieval, "queryId", "query unsafe"),
		"retrieval source credential": mutateEvaluationCapabilityFact(t, retrieval, "sourceResultRefs", []any{"sk-abcdefghijklmno"}),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := validateEvaluationProviderCapabilityFact(map[string]string{
				"provider job credential":     "provider-job",
				"retrieval query whitespace":  "retrieval-query",
				"retrieval source credential": "retrieval-query",
			}[name], candidate); err == nil {
				t.Fatal("unsafe control identity was accepted")
			}
		})
	}
}

func TestEvaluationCapabilitySpecificOwnerAndControlledFactsUseAgentControlIdentities(t *testing.T) {
	digest := func(label string) string { return evaluationBoundedExportTestDigest(t, label) }
	instant := "2026-08-09T00:00:00.000Z"
	ownerFact := func(receiptKind string, extra map[string]any) map[string]any {
		base := map[string]any{
			"format": "prodivix.agent-evaluation-capability-owner-fact", "version": json.Number("1"),
			"authorityKind": evaluationCapabilitySpecificAuthorityKind(receiptKind), "category": receiptKind,
			"authorityId": "authority/owner.1", "authorityImplementationDigest": digest("owner-implementation"),
			"authorityRequestDigest": digest("owner-request"), "authorityResultDigest": digest("owner-result"),
			"observedAt": instant,
		}
		for key, value := range extra {
			base[key] = value
		}
		return withEvaluationCapabilityFactDigest(t, base, "factDigest")
	}
	ownerFacts := map[string]map[string]any{
		"budget-reservation-receipt": ownerFact("budget-reservation-receipt", map[string]any{
			"reservationId": "reservation/budget.1", "demandDigest": digest("budget-demand"),
			"settlementDigest": digest("owner-result"), "reservationStatus": "settled",
		}),
		"ack-reconciliation-receipt": ownerFact("ack-reconciliation-receipt", map[string]any{
			"idempotencyKey": "idempotency/ack.1", "replayDisposition": "reconciled",
		}),
		"cancellation-receipt": ownerFact("cancellation-receipt", map[string]any{
			"shardLeaseOwnerId": "lease/owner.1", "shardLeaseGeneration": json.Number("1"),
			"dispatchState": "dispatched", "authorityInstant": instant,
			"fenceDigest": digest("owner-result"), "fenceOutcome": "cancelled",
		}),
		"authority-denial-receipt": ownerFact("authority-denial-receipt", map[string]any{
			"policyDigest": digest("denial-policy"), "reasonCode": "reason/policy.1",
			"decisionDigest": digest("owner-result"),
		}),
	}
	for receiptKind, fact := range ownerFacts {
		if _, err := validateEvaluationCapabilityOwnerFactCurrent(fact, receiptKind); err != nil {
			t.Fatalf("slash-bearing %s owner fact was rejected: %v", receiptKind, err)
		}
	}

	controlledRuntime := withEvaluationCapabilityFactDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-controlled-runtime-capability-fact", "version": json.Number("1"),
		"planDigest": digest("runtime-plan"), "repositoryCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"attemptId": "attempt/runtime.1", "descriptorDigest": digest("runtime-descriptor"),
		"caseId": "case/runtime.1", "materialDigest": digest("runtime-material"),
		"runtimeAuthorityId": "runtime/authority.1", "runtimeImplementationDigest": digest("runtime-implementation"),
		"verificationClosureDigest": digest("runtime-closure"), "verificationVerdict": "passed",
		"ownerAuthoritySetDigest": digest("runtime-owner-set"),
	}, "factDigest")
	if _, err := validateEvaluationControlledRuntimeCapabilityFact(controlledRuntime); err != nil {
		t.Fatalf("slash-bearing controlled runtime identities were rejected: %v", err)
	}

	controlledTool := withEvaluationCapabilityFactDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-controlled-tool-execution-receipt", "version": json.Number("1"),
		"planDigest": digest("tool-plan"), "attemptId": "attempt/tool.1", "descriptorDigest": digest("tool-descriptor"),
		"caseId": "case/tool.1", "materialDigest": digest("tool-material"), "loopPolicyDigest": digest("tool-loop-policy"),
		"grantDigest": digest("tool-grant"), "toolRegistryDigest": digest("tool-registry"),
		"toolDefinitionDigest": digest("tool-definition"), "inputSchemaDigest": digest("tool-input-schema"),
		"generation": json.Number("1"), "idempotencyKey": "idempotency/tool.1",
		"operationIntentDigest": digest("tool-operation-intent"), "turnIndex": json.Number("0"),
		"toolCallId": "tool-call/1", "toolId": "tool/id.1", "argumentsDigest": digest("tool-arguments"),
		"status": "succeeded", "resultDigest": digest("tool-result"),
		"persistedArtifacts": []any{map[string]any{
			"artifactKind": "tool-receipt", "artifactRef": "artifact/tool.1",
			"artifactDigest": digest("tool-artifact"), "byteLength": json.Number("1"),
			"persistenceReceiptDigest": digest("tool-artifact-persistence"),
		}},
		"commandReceiptDigests": []any{}, "transactionReceiptDigests": []any{},
	}, "receiptDigest")
	if _, err := validateEvaluationProviderCapabilityFact("controlled-tool-execution", controlledTool); err != nil {
		t.Fatalf("slash-bearing controlled tool identities were rejected: %v", err)
	}

	controlledContinuation := withEvaluationCapabilityFactDigest(t, map[string]any{
		"format": "prodivix.agent-evaluation-controlled-continuation-receipt", "version": json.Number("1"),
		"planDigest": digest("continuation-plan"), "attemptId": "attempt/continuation.1",
		"descriptorDigest": digest("continuation-descriptor"), "caseId": "case/continuation.1",
		"materialDigest": digest("continuation-material"), "loopPolicyDigest": digest("continuation-loop-policy"),
		"completedTurnIndex": json.Number("0"), "nextTurnIndex": json.Number("1"),
		"toolExecutionReceiptDigests": []any{digest("continuation-tool-receipt")},
		"toolResultSetDigest":         digest("continuation-result-set"),
	}, "receiptDigest")
	if _, err := validateEvaluationProviderCapabilityFact("controlled-continuation", controlledContinuation); err != nil {
		t.Fatalf("slash-bearing continuation identities were rejected: %v", err)
	}

	for name, candidate := range map[string]map[string]any{
		"owner credential":        mutateEvaluationCapabilityFactField(t, ownerFacts["budget-reservation-receipt"], "factDigest", "authorityId", "Bearer abcdefghijklmnop"),
		"runtime whitespace":      mutateEvaluationCapabilityFactField(t, controlledRuntime, "factDigest", "runtimeAuthorityId", "runtime unsafe"),
		"tool credential":         mutateEvaluationCapabilityFact(t, controlledTool, "toolId", "sk-abcdefghijklmno"),
		"continuation whitespace": mutateEvaluationCapabilityFact(t, controlledContinuation, "attemptId", "attempt unsafe"),
	} {
		t.Run(name, func(t *testing.T) {
			var err error
			switch name {
			case "owner credential":
				_, err = validateEvaluationCapabilityOwnerFactCurrent(candidate, "budget-reservation-receipt")
			case "runtime whitespace":
				_, err = validateEvaluationControlledRuntimeCapabilityFact(candidate)
			case "tool credential":
				_, err = validateEvaluationProviderCapabilityFact("controlled-tool-execution", candidate)
			case "continuation whitespace":
				_, err = validateEvaluationProviderCapabilityFact("controlled-continuation", candidate)
			}
			if err == nil {
				t.Fatal("unsafe control identity was accepted")
			}
		})
	}
}

func withEvaluationCapabilityFactDigest(t *testing.T, base map[string]any, field string) map[string]any {
	t.Helper()
	value := cloneEvaluationObject(base)
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value[field] = digest
	return value
}

func mutateEvaluationCapabilityFact(t *testing.T, valid map[string]any, field string, replacement any) map[string]any {
	t.Helper()
	value := cloneEvaluationObject(valid)
	delete(value, "receiptDigest")
	value[field] = replacement
	return withEvaluationCapabilityFactDigest(t, value, "receiptDigest")
}

func mutateEvaluationCapabilityFactField(
	t *testing.T,
	valid map[string]any,
	digestField string,
	field string,
	replacement any,
) map[string]any {
	t.Helper()
	value := cloneEvaluationObject(valid)
	delete(value, digestField)
	value[field] = replacement
	return withEvaluationCapabilityFactDigest(t, value, digestField)
}
