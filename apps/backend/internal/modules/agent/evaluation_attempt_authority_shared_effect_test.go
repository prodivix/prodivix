package agent

import (
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationAttemptAuthorityTestFactWithDigest(
	t *testing.T,
	base map[string]any,
	field string,
) map[string]any {
	t.Helper()
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	result := cloneEvaluationObject(base)
	result[field] = digest
	return result
}

func evaluationAttemptAuthorityTestSharedFacts(t *testing.T) map[string]struct {
	capabilityID string
	sourceKind   string
	fact         map[string]any
} {
	t.Helper()
	job := evaluationAttemptAuthorityTestFactWithDigest(t, map[string]any{
		"providerJobId": "provider/job/1", "taskId": "task/job/1", "runId": "run/job/1",
		"generation": float64(1), "invocationId": "invocation/optional/1", "phase": "running",
		"callbackAuthority": "active",
	}, "receiptDigest")
	retrieval := evaluationAttemptAuthorityTestFactWithDigest(t, map[string]any{
		"queryId": "query/retrieval/1", "toolDescriptorDigest": evaluationServiceTestDigest(t, "shared-retrieval-tool"),
		"queryDigest": evaluationServiceTestDigest(t, "shared-retrieval-query"), "purpose": "public-research",
		"networkPolicyDigest": evaluationServiceTestDigest(t, "shared-retrieval-network"),
		"sourceResultRefs":    []any{"source/result/1"},
		"sourceResultDigests": []any{evaluationServiceTestDigest(t, "shared-retrieval-result")},
		"usageRef":            "usage/vector/1", "startedAt": "2026-08-09T05:00:00.000Z",
		"completedAt": "2026-08-09T05:00:01.000Z",
	}, "receiptDigest")
	continuation := evaluationAttemptAuthorityTestFactWithDigest(t, map[string]any{
		"continuationId": "continuation/provider/1", "encryptedBlobRef": "spool/continuation/1",
		"providerConfigurationId": "provider/configuration/1",
		"modelLineageDigest":      evaluationServiceTestDigest(t, "shared-continuation-model"),
		"taskId":                  "task/continuation/1", "runId": "run/continuation/1", "generation": float64(1),
		"parentInvocationId": "invocation/optional/1", "purpose": "provider-tool-loop-continuation",
		"createdAt": "2026-08-09T05:00:00.000Z", "expiresAt": "2026-08-09T05:05:00.000Z",
	}, "continuationDigest")
	return map[string]struct {
		capabilityID string
		sourceKind   string
		fact         map[string]any
	}{
		"background job": {
			capabilityID: "provider.background-job", sourceKind: "sealed-provider-response-metadata", fact: job,
		},
		"hosted retrieval": {
			capabilityID: "provider.hosted-retrieval", sourceKind: "sealed-hosted-owner-result", fact: retrieval,
		},
		"isolated cache": {
			capabilityID: "provider.isolated-cache", sourceKind: "sealed-provider-response-metadata",
			fact: evaluationOptionalFactTestCacheFact(t),
		},
		"opaque continuation": {
			capabilityID: "provider.reasoning-continuation", sourceKind: "sealed-provider-response-metadata", fact: continuation,
		},
	}
}

func evaluationAttemptAuthorityTestSharedBinding(
	t *testing.T,
	fixture evaluationOptionalFactEffectFixture,
) (map[string]any, map[string]any, evaluationAttemptAuthorityExecuteBinding) {
	t.Helper()
	intent, err := decodeCanonicalEvaluationObject(
		fixture.Owner.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	response, responseErr := decodeCanonicalEvaluationObject(
		fixture.Owner.ResponseBytes, maximumEvaluationAttemptAuthorityResponseBytes,
	)
	if err != nil || responseErr != nil {
		t.Fatalf("decode shared effect fixture: intent=%v response=%v", err, responseErr)
	}
	turnIndex, turnOK := integerMember(intent, "turnIndex")
	if !turnOK {
		t.Fatal("shared effect intent has no canonical turn index")
	}
	return intent, response, evaluationAttemptAuthorityExecuteBinding{
		ExecutionAuthorityKind: "shared-effect", PreEffectIntent: intent,
		PreEffectIntentDigest: stringMember(intent, "intentDigest"), InvocationID: stringMember(intent, "invocationId"),
		TurnIndex: turnIndex, ToolID: stringMember(intent, "toolId"), ToolCallID: stringMember(intent, "toolCallId"),
		ProviderToolCallID:    stringMember(intent, "providerToolCallId"),
		ProviderRequestDigest: stringMember(intent, "providerRequestDigest"),
	}
}

func TestEvaluationAttemptAuthoritySharedEffectAcceptsCanonicalFactWrappers(t *testing.T) {
	for name, test := range evaluationAttemptAuthorityTestSharedFacts(t) {
		t.Run(name, func(t *testing.T) {
			fixture := evaluationOptionalFactTestEffectFixture(
				t, test.capabilityID, test.sourceKind, "produced", test.fact,
			)
			_, response, binding := evaluationAttemptAuthorityTestSharedBinding(t, fixture)
			receiptDigest, fact, err := evaluationAttemptAuthoritySharedEffectResponse(response, binding)
			if err != nil || receiptDigest != stringMember(response["effectSourceReceipt"].(map[string]any), "receiptDigest") || fact == nil {
				t.Fatalf("canonical shared effect was rejected: digest=%s fact=%#v err=%v", receiptDigest, fact, err)
			}
			projection, _, err := evaluationAttemptAuthorityResponseProjection(
				"capability-runtime", "execute-tool", fixture.Owner.ResponseBytes, &binding, nil,
			)
			if err != nil || stringMember(projection, "executionAuthorityKind") != "shared-effect" ||
				stringMember(projection, "effectSourceReceiptDigest") != receiptDigest ||
				stringMember(projection, "effectSourceFactDigest") == "" {
				t.Fatalf("shared effect projection drifted: projection=%#v err=%v", projection, err)
			}
		})
	}
}

func TestEvaluationAttemptAuthoritySharedEffectRejectsFactWrapperAndValueSwap(t *testing.T) {
	fixture := evaluationOptionalFactTestEffectFixture(
		t, "provider.isolated-cache", "sealed-provider-response-metadata", "produced",
		evaluationOptionalFactTestCacheFact(t),
	)
	_, response, binding := evaluationAttemptAuthorityTestSharedBinding(t, fixture)
	fact := response["effectSourceFact"].(map[string]any)
	factValue := fact["value"].(map[string]any)
	factValue["usageRef"] = "usage/vector/swapped"
	if _, _, err := evaluationAttemptAuthoritySharedEffectResponse(response, binding); err == nil {
		t.Fatal("shared effect accepted a fact value whose wrapper digest was not recomputed")
	}
	_, response, binding = evaluationAttemptAuthorityTestSharedBinding(t, fixture)
	response["effectSourceFact"] = response["effectSourceFact"].(map[string]any)["value"]
	if _, _, err := evaluationAttemptAuthoritySharedEffectResponse(response, binding); err == nil {
		t.Fatal("shared effect accepted a raw fact value without its canonical fact wrapper")
	}
}

func TestEvaluationAttemptAuthoritySharedEffectAcceptsUnavailableWithoutFact(t *testing.T) {
	fixture := evaluationOptionalFactTestEffectFixture(
		t, "provider.isolated-cache", "sealed-provider-response-metadata", "unavailable", nil,
	)
	_, response, binding := evaluationAttemptAuthorityTestSharedBinding(t, fixture)
	receiptDigest, fact, err := evaluationAttemptAuthoritySharedEffectResponse(response, binding)
	if err != nil || receiptDigest == "" || fact != nil {
		t.Fatalf("unavailable shared effect drifted: digest=%s fact=%#v err=%v", receiptDigest, fact, err)
	}
}

func TestEvaluationAttemptAuthoritySharedEffectRequiresExactStateVaultLifecycle(t *testing.T) {
	jobFixture := evaluationOptionalFactTestEffectFixture(
		t, "provider.background-job", "sealed-provider-response-metadata", "produced",
		evaluationAttemptAuthorityTestSharedFacts(t)["background job"].fact,
	)
	_, response, binding := evaluationAttemptAuthorityTestSharedBinding(t, jobFixture)
	if _, _, err := evaluationAttemptAuthoritySharedEffectResponse(response, binding); err != nil {
		t.Fatalf("canonical state-vault lifecycle was rejected: %v", err)
	}
	receipt := response["effectSourceReceipt"].(map[string]any)
	receipt["stateVaultRetirementReceipt"] = nil
	base := cloneEvaluationObject(receipt)
	delete(base, "receiptDigest")
	receipt["receiptDigest"] = ownerStateTestDigest(t, base)
	if _, _, err := evaluationAttemptAuthoritySharedEffectResponse(response, binding); err == nil {
		t.Fatal("shared effect accepted a missing state-vault retirement receipt")
	}

	jobFixture = evaluationOptionalFactTestEffectFixture(
		t, "provider.background-job", "sealed-provider-response-metadata", "produced",
		evaluationAttemptAuthorityTestSharedFacts(t)["background job"].fact,
	)
	continuationFixture := evaluationOptionalFactTestEffectFixture(
		t, "provider.reasoning-continuation", "sealed-provider-response-metadata", "produced",
		evaluationAttemptAuthorityTestSharedFacts(t)["opaque continuation"].fact,
	)
	_, response, binding = evaluationAttemptAuthorityTestSharedBinding(t, jobFixture)
	_, continuationResponse, _ := evaluationAttemptAuthorityTestSharedBinding(t, continuationFixture)
	receipt = response["effectSourceReceipt"].(map[string]any)
	continuationReceipt := continuationResponse["effectSourceReceipt"].(map[string]any)
	for _, field := range []string{
		"stateVaultResolveRequest", "stateVaultResolveReceipt",
		"stateVaultRetireRequest", "stateVaultRetirementReceipt",
	} {
		receipt[field] = continuationReceipt[field]
	}
	base = cloneEvaluationObject(receipt)
	delete(base, "receiptDigest")
	receipt["receiptDigest"] = ownerStateTestDigest(t, base)
	if _, _, err := evaluationAttemptAuthoritySharedEffectResponse(response, binding); err == nil {
		t.Fatal("shared effect accepted a fully recomputed foreign state-vault lifecycle")
	}

	cacheFixture := evaluationOptionalFactTestEffectFixture(
		t, "provider.isolated-cache", "sealed-provider-response-metadata", "produced",
		evaluationOptionalFactTestCacheFact(t),
	)
	_, cacheResponse, cacheBinding := evaluationAttemptAuthorityTestSharedBinding(t, cacheFixture)
	cacheReceipt := cacheResponse["effectSourceReceipt"].(map[string]any)
	cacheReceipt["stateVaultResolveRequest"] = continuationReceipt["stateVaultResolveRequest"]
	base = cloneEvaluationObject(cacheReceipt)
	delete(base, "receiptDigest")
	cacheReceipt["receiptDigest"] = ownerStateTestDigest(t, base)
	if _, _, err := evaluationAttemptAuthoritySharedEffectResponse(cacheResponse, cacheBinding); err == nil {
		t.Fatal("stateless shared effect accepted an injected state-vault lifecycle")
	}
}
