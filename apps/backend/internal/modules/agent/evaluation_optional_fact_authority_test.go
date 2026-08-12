package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationOptionalFactTestDigest(t *testing.T, label string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"label": label})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationOptionalFactTestRequest(
	t *testing.T,
	capabilityID string,
	source map[string]any,
	normalizedEventSetDigest string,
) evaluationOptionalFactAuthorityRequest {
	return evaluationOptionalFactTestRequestWithResultSpool(
		t, capabilityID, source, normalizedEventSetDigest,
		evaluationOptionalFactTestDigest(t, "result-spool"),
	)
}

func evaluationOptionalFactTestRequestWithResultSpool(
	t *testing.T,
	capabilityID string,
	source map[string]any,
	normalizedEventSetDigest string,
	resultSpoolReceiptDigest any,
) evaluationOptionalFactAuthorityRequest {
	t.Helper()
	value := map[string]any{
		"format": evaluationOptionalFactAuthorityRequestFormat, "version": int64(1),
		"attemptId": "attempt/optional/1", "descriptorDigest": evaluationOptionalFactTestDigest(t, "descriptor"),
		"targetId": "target/optional/1", "targetDigest": evaluationOptionalFactTestDigest(t, "target"),
		"capabilityProfileId": "profile/optional/1", "capabilityProfileDigest": evaluationOptionalFactTestDigest(t, "profile"),
		"capabilityDescriptorDigest": evaluationOptionalFactTestDigest(t, "capability-descriptor"),
		"capabilityId":               capabilityID, "supportExpectation": "required", "turnIndex": int64(2),
		"invocationId": "invocation/optional/1", "protocolFamily": "openai-responses",
		"providerConfigurationId": "provider/configuration/1", "modelId": "model/immutable/1",
		"modelLineageDigest":       evaluationOptionalFactTestDigest(t, "model-lineage"),
		"adapterDigest":            evaluationOptionalFactTestDigest(t, "adapter"),
		"providerRequestDigest":    evaluationOptionalFactTestDigest(t, "provider-request"),
		"responseDigest":           evaluationOptionalFactTestDigest(t, "provider-response"),
		"dispatchIntentDigest":     evaluationOptionalFactTestDigest(t, "dispatch-intent"),
		"transportReceiptDigest":   evaluationOptionalFactTestDigest(t, "transport-receipt"),
		"resultSpoolReceiptDigest": resultSpoolReceiptDigest,
		"normalizedEventSetDigest": normalizedEventSetDigest, "source": source,
	}
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeEvaluationOptionalFactAuthorityRequest(encoded)
	if err != nil {
		t.Fatalf("decode optional fact request: %v", err)
	}
	return decoded
}

func evaluationOptionalFactTestTarget(
	t *testing.T,
	request evaluationOptionalFactAuthorityRequest,
) EvaluationOptionalFactTargetAuthority {
	t.Helper()
	target := EvaluationOptionalFactTargetAuthority{
		TargetID: request.TargetID, TargetDigest: request.TargetDigest,
		CapabilityProfileID: request.CapabilityProfileID, CapabilityProfileDigest: request.CapabilityProfileDigest,
		CapabilityDescriptorDigest: request.CapabilityDescriptorDigest, CapabilityID: request.CapabilityID,
		SupportExpectation: request.SupportExpectation, ProtocolFamily: request.ProtocolFamily,
		ProviderConfigurationID: request.ProviderConfigurationID, ModelID: request.ModelID,
		ModelLineageDigest: request.ModelLineageDigest, AdapterDigest: request.AdapterDigest,
		SourceKind:                          request.Source.Kind,
		SourceAuthorityID:                   "authority/shared/durable/1",
		SourceAuthorityImplementationDigest: evaluationOptionalFactTestDigest(t, "shared-owner-implementation"),
		SourceAuthorityRouteBinding:         "owner/optional/runtime/1",
		RegistrationAuthorityIssuerID:       evaluationServiceAuthorityPrincipal,
		RegistrationReceiptDigest:           evaluationOptionalFactTestDigest(t, "source-registration"),
	}
	if request.CapabilityID == "provider.hosted-retrieval" &&
		oneOfString(request.ProtocolFamily, "openai-responses", "gemini-interactions") {
		target.HostedRuntimeResourceRegistrationIntentDigest = evaluationOptionalFactTestDigest(t, "hosted-runtime-resource-registration-intent")
	}
	base := evaluationOptionalFactTestRuntimeAuthority(target)
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	target.TargetAuthorityDigest = digest
	return target
}

func evaluationOptionalFactTestRuntimeAuthority(target EvaluationOptionalFactTargetAuthority) map[string]any {
	authority := map[string]any{
		"kind": "shared-durable-capability", "sourceKind": target.SourceKind,
		"sourceAuthorityId":                   target.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": target.SourceAuthorityImplementationDigest,
		"routeBinding":                        target.SourceAuthorityRouteBinding,
		"capabilityProfileId":                 target.CapabilityProfileID, "capabilityProfileDigest": target.CapabilityProfileDigest,
		"capabilityId": target.CapabilityID, "protocolFamily": target.ProtocolFamily,
		"providerConfigurationId": target.ProviderConfigurationID, "modelId": target.ModelID,
		"modelLineageDigest": target.ModelLineageDigest, "adapterDigest": target.AdapterDigest,
		"registrationAuthorityIssuerId": target.RegistrationAuthorityIssuerID,
		"registrationReceiptDigest":     target.RegistrationReceiptDigest,
	}
	if target.HostedRuntimeResourceRegistrationIntentDigest != "" {
		authority["hostedRetrievalRuntimeResourceRegistrationIntentDigest"] = target.HostedRuntimeResourceRegistrationIntentDigest
	}
	return authority
}

func evaluationOptionalFactTestTransport(
	t *testing.T,
	request evaluationOptionalFactAuthorityRequest,
) evaluationOptionalFactTransportSource {
	t.Helper()
	completedAt := time.Date(2026, 8, 9, 5, 0, 0, 0, time.UTC)
	outerTransportReceiptDigest := evaluationOptionalFactTestDigest(t, "outer-transport-receipt")
	return evaluationOptionalFactTransportSource{
		Intent: EvaluationTransportDispatchIntentRecord{
			PlanDigest: evaluationOptionalFactTestDigest(t, "plan"), RepositoryCommit: strings.Repeat("a", 40),
			AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TurnIndex: request.TurnIndex,
			InvocationID: request.InvocationID, ProtocolFamily: request.ProtocolFamily,
			ProviderConfigurationID: request.ProviderConfigurationID, ModelLineageDigest: request.ModelLineageDigest,
			RequestDigest: request.ProviderRequestDigest, IntentDigest: request.DispatchIntentDigest,
		},
		Receipt: EvaluationTransportReceiptRecord{
			AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TurnIndex: request.TurnIndex,
			InvocationID: request.InvocationID, ProviderConfigurationID: request.ProviderConfigurationID,
			IntentDigest: request.DispatchIntentDigest, ReceiptDigest: outerTransportReceiptDigest,
			DispatchState: "dispatched", Outcome: "completed", ResponseBodyDigest: evaluationOptionalFactTestDigest(t, "response-body"),
			CompletedAt: completedAt,
		},
		Spool: EvaluationProviderResultSpoolReceiptRecord{
			PlanDigest: evaluationOptionalFactTestDigest(t, "plan"), RepositoryCommit: strings.Repeat("a", 40),
			AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TurnIndex: request.TurnIndex,
			InvocationID: request.InvocationID, DispatchIntentDigest: request.DispatchIntentDigest,
			TransportReceiptDigest:   outerTransportReceiptDigest,
			ReceiptDigest:            evaluationOptionalFactTestDigest(t, "outer-result-spool-receipt"),
			ResponseBodyDigest:       evaluationOptionalFactTestDigest(t, "response-body"),
			NormalizedEventSetDigest: evaluationOptionalFactTestDigest(t, "outer-normalized-event-set"),
			ResponseDigest:           request.ResponseDigest,
		},
	}
}

func evaluationOptionalFactTestCacheFact(t *testing.T) map[string]any {
	t.Helper()
	base := map[string]any{
		"cacheMode": "prompt", "cacheScope": "invocation", "provenIsolation": "invocation",
		"cacheKeyDigest": evaluationOptionalFactTestDigest(t, "cache-key"), "prefixOrItemDigests": []any{},
		"usageRef": "usage/vector/1",
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["receiptDigest"] = digest
	return base
}

func evaluationOptionalFactTestJobFact(t *testing.T) map[string]any {
	t.Helper()
	base := map[string]any{
		"providerJobId": "provider/job.optional.1", "taskId": "task/job.optional.1",
		"runId": "run/job.optional.1", "generation": json.Number("1"),
		"invocationId": "invocation/optional/1", "phase": "running", "callbackAuthority": "active",
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["receiptDigest"] = digest
	return base
}

func evaluationOptionalFactTestRetrievalFact(t *testing.T) map[string]any {
	t.Helper()
	instant := "2026-08-09T05:00:00.000Z"
	base := map[string]any{
		"queryId": "query/retrieval.optional.1", "toolDescriptorDigest": evaluationOptionalFactTestDigest(t, "retrieval-tool"),
		"queryDigest": evaluationOptionalFactTestDigest(t, "retrieval-query"), "purpose": "public-research",
		"networkPolicyDigest": evaluationOptionalFactTestDigest(t, "retrieval-network"),
		"sourceResultRefs":    []any{"source/result.optional.1"},
		"sourceResultDigests": []any{evaluationOptionalFactTestDigest(t, "retrieval-result")},
		"usageRef":            "usage/retrieval.optional.1", "startedAt": instant, "completedAt": instant,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["receiptDigest"] = digest
	return base
}

func evaluationOptionalFactTestContinuationFact(t *testing.T) map[string]any {
	t.Helper()
	base := map[string]any{
		"continuationId": "continuation/optional.1", "encryptedBlobRef": "encrypted-ref.optional.1",
		"providerConfigurationId": "provider/configuration/1",
		"modelLineageDigest":      evaluationOptionalFactTestDigest(t, "model-lineage"),
		"taskId":                  "task/continuation.optional.1", "runId": "run/continuation.optional.1",
		"generation": json.Number("1"), "parentInvocationId": "invocation/optional/1",
		"purpose": "provider-tool-loop-continuation", "createdAt": "2026-08-09T05:00:00.000Z",
		"expiresAt": "2026-08-09T05:05:00.000Z",
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["continuationDigest"] = digest
	return base
}

type evaluationOptionalFactEffectFixture struct {
	Authority EvaluationAuthority
	Partition EvaluationPlanPartition
	Request   evaluationOptionalFactAuthorityRequest
	Transport evaluationOptionalFactTransportSource
	Target    EvaluationOptionalFactTargetAuthority
	Owner     evaluationOptionalFactEffectOwnerSource
}

type evaluationOptionalFactTestStateVaultLifecycle struct {
	ResolveRequest    any
	ResolveReceipt    any
	RetireRequest     any
	RetirementReceipt any
}

func evaluationOptionalFactTestEffectBinding(
	t *testing.T,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationOptionalFactAuthorityRequest,
	target EvaluationOptionalFactTargetAuthority,
	runtimeAuthority map[string]any,
	requestedAt time.Time,
) (map[string]any, string, string, evaluationOptionalFactTestStateVaultLifecycle) {
	t.Helper()
	profiles := map[string]struct {
		BindingKind, ToolID, FactKind string
	}{
		"provider.background-job": {
			BindingKind: "provider-job", ToolID: "provider.background-job.poll", FactKind: "provider-job-receipt",
		},
		"provider.hosted-retrieval": {
			BindingKind: "hosted-retrieval-query", ToolID: "provider.retrieval.search", FactKind: "provider-event",
		},
		"provider.isolated-cache": {
			BindingKind: "provider-cache", ToolID: "provider.cache.inspect", FactKind: "provider-cache-receipt",
		},
		"provider.reasoning-continuation": {
			BindingKind: "opaque-continuation", ToolID: "provider.continuation.resume", FactKind: "opaque-continuation",
		},
	}
	profile, ok := profiles[request.CapabilityID]
	if !ok {
		t.Fatalf("missing capability effect profile for %s", request.CapabilityID)
	}
	targetRef := "target/capability-effect/1"
	issuedAt := requestedAt.Add(-time.Second)
	expiresAt := issuedAt.Add(maximumEvaluationCapabilityEffectRequestRefLifetime)
	requestRefAuthorityBase := map[string]any{
		"format": evaluationCapabilityEffectRequestRefAuthorityReceiptFormat, "version": int64(1),
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "turnIndex": request.TurnIndex,
		"invocationId": request.InvocationID, "bindingKind": profile.BindingKind,
		"capabilityId": request.CapabilityID, "toolId": profile.ToolID, "targetRef": targetRef,
		"protocolFamily": request.ProtocolFamily, "providerConfigurationId": request.ProviderConfigurationID,
		"modelLineageDigest": request.ModelLineageDigest, "adapterDigest": request.AdapterDigest,
		"runtimeFactSourceAuthorityDigest": target.TargetAuthorityDigest,
		"registrationReceiptDigest":        target.RegistrationReceiptDigest,
		"issuedAt":                         issuedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                        expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	authorityDigest, err := canonicaljson.Digest(requestRefAuthorityBase)
	if err != nil {
		t.Fatal(err)
	}
	requestRef, err := evaluationCapabilityEffectRequestRef(profile.BindingKind, authorityDigest)
	if err != nil {
		t.Fatal(err)
	}
	requestRefAuthority := cloneEvaluationObject(requestRefAuthorityBase)
	requestRefAuthority["authorityDigest"] = authorityDigest
	requestRefAuthority["requestRef"] = requestRef
	requestRefReceiptDigest, err := canonicaljson.Digest(requestRefAuthority)
	if err != nil {
		t.Fatal(err)
	}
	requestRefAuthority["receiptDigest"] = requestRefReceiptDigest

	retrieval := profile.BindingKind == "hosted-retrieval-query"
	stateful := oneOfString(profile.BindingKind, "provider-job", "opaque-continuation")
	sourceTurnIndex := int64(1)
	sourceInvocationID := "invocation/source/1"
	sourceProviderRequestDigest := evaluationOptionalFactTestDigest(t, "source-provider-request")
	if retrieval {
		sourceTurnIndex = request.TurnIndex
		sourceInvocationID = request.InvocationID
		sourceProviderRequestDigest = request.ProviderRequestDigest
	}
	sourceResponseDigest := evaluationOptionalFactTestDigest(t, "source-provider-response")
	sourceHandleDigest := evaluationOptionalFactTestDigest(t, "source-handle")
	var stateVaultSealRequest any
	var stateVaultSealReceipt any
	lifecycle := evaluationOptionalFactTestStateVaultLifecycle{}
	if stateful {
		vaultAuthority, vaultAuthorityErr := newEvaluationNativeProviderStateVaultAuthority()
		if vaultAuthorityErr != nil {
			t.Fatal(vaultAuthorityErr)
		}
		handle := "provider-state/optional/1"
		referenceDigest, digestErr := canonicaljson.Digest(map[string]any{"kind": "response-id", "value": handle})
		if digestErr != nil {
			t.Fatal(digestErr)
		}
		sourceHandleDigest = referenceDigest
		purpose := "background-job-state"
		if profile.BindingKind == "opaque-continuation" {
			purpose = "reasoning-continuation-state"
		}
		observedAt := requestedAt.Add(-time.Minute)
		vaultExpiresAt := observedAt.Add(evaluationNativeProviderStateVaultLifetime)
		sealBase := map[string]any{
			"format": evaluationNativeProviderStateVaultSealRequestFormat, "version": int64(1),
			"authorityDigest": vaultAuthority.AuthorityDigest, "purpose": purpose,
			"attemptId": request.AttemptID, "protocolFamily": request.ProtocolFamily,
			"providerStateReferenceKind": "response-id", "providerStateReferenceDigest": referenceDigest,
			"probeProgramDigest":      evaluationOptionalFactTestDigest(t, "source-probe-program"),
			"capabilityProfileDigest": request.CapabilityProfileDigest, "invocationId": sourceInvocationID,
			"requestDigest": sourceProviderRequestDigest, "responseDigest": sourceResponseDigest,
			"responseBodyDigest":       evaluationOptionalFactTestDigest(t, "source-response-body"),
			"sealedResponseJsonDigest": evaluationOptionalFactTestDigest(t, "source-sealed-response"),
			"providerConfigurationId":  request.ProviderConfigurationID,
			"modelLineageDigest":       request.ModelLineageDigest, "adapterDigest": request.AdapterDigest,
			"taskId": "task/state-vault/1", "runId": "run/state-vault/1", "generation": int64(1),
			"observedAt": observedAt.Format("2006-01-02T15:04:05.000Z"),
			"expiresAt":  vaultExpiresAt.Format("2006-01-02T15:04:05.000Z"),
		}
		sealDigest, digestErr := canonicaljson.Digest(sealBase)
		if digestErr != nil {
			t.Fatal(digestErr)
		}
		sealBase["sealRequestDigest"] = sealDigest
		sealBytes, _ := canonicaljson.Bytes(sealBase)
		decodedSealRequest, decodeErr := decodeEvaluationNativeProviderStateVaultSealRequest(sealBytes)
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		creationDigest := evaluationOptionalFactTestDigest(t, "state-key-creation")
		opaqueRef, refErr := createEvaluationNativeProviderStateVaultOpaqueRef(
			vaultAuthority.AuthorityDigest, sealDigest, creationDigest,
		)
		if refErr != nil {
			t.Fatal(refErr)
		}
		decodedSealReceipt, receiptErr := createEvaluationNativeProviderStateVaultSealReceipt(
			decodedSealRequest, "sealed", opaqueRef, creationDigest, observedAt.Add(time.Second),
		)
		if receiptErr != nil {
			t.Fatal(receiptErr)
		}
		stateVaultSealRequest, stateVaultSealReceipt = decodedSealRequest.Value, decodedSealReceipt.Value

		resolveBase := map[string]any{
			"format": evaluationNativeProviderStateVaultResolveRequestFormat, "version": int64(1),
			"authorityDigest": vaultAuthority.AuthorityDigest, "opaqueProviderStateRef": opaqueRef,
			"sealRequestDigest": sealDigest, "sealReceiptDigest": decodedSealReceipt.ReceiptDigest,
			"purpose": purpose, "providerStateReferenceKind": "response-id",
			"providerStateReferenceDigest": referenceDigest, "sourceAttemptId": request.AttemptID,
			"sourceInvocationId": sourceInvocationID, "sourceGeneration": int64(1),
			"consumerAttemptId": request.AttemptID, "consumerInvocationId": request.InvocationID,
			"consumerGeneration": int64(1), "taskId": "task/state-vault/1", "runId": "run/state-vault/1",
			"requestedAt": requestedAt.Format("2006-01-02T15:04:05.000Z"),
			"expiresAt":   vaultExpiresAt.Format("2006-01-02T15:04:05.000Z"),
		}
		resolveDigest, digestErr := canonicaljson.Digest(resolveBase)
		if digestErr != nil {
			t.Fatal(digestErr)
		}
		resolveBase["resolveRequestDigest"] = resolveDigest
		resolveBytes, _ := canonicaljson.Bytes(resolveBase)
		decodedResolveRequest, decodeErr := decodeEvaluationNativeProviderStateVaultResolveRequest(resolveBytes)
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		decodedResolveReceipt, receiptErr := createEvaluationNativeProviderStateVaultResolveReceipt(
			decodedResolveRequest, "resolved", handle, requestedAt.Add(100*time.Millisecond),
		)
		if receiptErr != nil {
			t.Fatal(receiptErr)
		}
		retireBase := map[string]any{
			"format": evaluationNativeProviderStateVaultRetireRequestFormat, "version": int64(1),
			"authorityDigest": vaultAuthority.AuthorityDigest, "opaqueProviderStateRef": opaqueRef,
			"sealRequestDigest": sealDigest, "sealReceiptDigest": decodedSealReceipt.ReceiptDigest,
			"resolveReceiptDigest": decodedResolveReceipt.ReceiptDigest, "purpose": purpose,
			"sourceAttemptId": request.AttemptID, "sourceInvocationId": sourceInvocationID, "sourceGeneration": int64(1),
			"consumerAttemptId": request.AttemptID, "consumerInvocationId": request.InvocationID,
			"consumerGeneration": int64(1), "disposition": "consumed",
			"requestedAt": requestedAt.Add(200 * time.Millisecond).Format("2006-01-02T15:04:05.000Z"),
			"expiresAt":   vaultExpiresAt.Format("2006-01-02T15:04:05.000Z"),
		}
		retireDigest, digestErr := canonicaljson.Digest(retireBase)
		if digestErr != nil {
			t.Fatal(digestErr)
		}
		retireBase["retireRequestDigest"] = retireDigest
		retireBytes, _ := canonicaljson.Bytes(retireBase)
		decodedRetireRequest, decodeErr := decodeEvaluationNativeProviderStateVaultRetireRequest(retireBytes)
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		decodedRetirementReceipt, receiptErr := createEvaluationNativeProviderStateVaultRetirementReceipt(
			decodedRetireRequest, decodedSealReceipt,
			evaluationOptionalFactTestDigest(t, "state-key-destruction"),
			evaluationOptionalFactTestDigest(t, "opaque-record-deletion"),
			requestedAt.Add(300*time.Millisecond),
		)
		if receiptErr != nil {
			t.Fatal(receiptErr)
		}
		lifecycle = evaluationOptionalFactTestStateVaultLifecycle{
			ResolveRequest: decodedResolveRequest.Value, ResolveReceipt: decodedResolveReceipt.Value,
			RetireRequest: decodedRetireRequest.Value, RetirementReceipt: decodedRetirementReceipt.Value,
		}
	}

	sourceObservationReceiptDigest := any(evaluationOptionalFactTestDigest(t, "source-observation-receipt"))
	sourceProviderEventType, sourceProviderToolCallID, sourceToolID, sourceArgumentsDigest := any(nil), any(nil), any(nil), any(nil)
	if retrieval {
		sourceObservationReceiptDigest = nil
		sourceProviderEventType = "tool-call"
		sourceProviderToolCallID = "provider-tool-call/optional/1"
		sourceToolID = profile.ToolID
	}
	registryBase := map[string]any{
		"format": evaluationCapabilityEffectInputRegistryReceiptFormat, "version": int64(1),
		"bindingKind": profile.BindingKind, "capabilityId": request.CapabilityID,
		"requestRef": requestRef, "targetRef": targetRef, "requestRefAuthority": requestRefAuthority,
		"requestRefAuthorityReceiptDigest": requestRefReceiptDigest,
		"sourceAttemptId":                  request.AttemptID, "sourceTurnIndex": sourceTurnIndex,
		"sourceInvocationId": sourceInvocationID, "sourceProviderRequestDigest": sourceProviderRequestDigest,
		"sourceResponseDigest":           sourceResponseDigest,
		"sourceDispatchIntentDigest":     evaluationOptionalFactTestDigest(t, "source-dispatch-intent"),
		"sourceTransportReceiptDigest":   evaluationOptionalFactTestDigest(t, "source-transport-receipt"),
		"sourceResultSpoolReceiptDigest": evaluationOptionalFactTestDigest(t, "source-result-spool"),
		"sourceNormalizedEventSetDigest": evaluationOptionalFactTestDigest(t, "source-normalized-event-set"),
		"sourceObservationReceiptDigest": sourceObservationReceiptDigest, "sourceFactKind": profile.FactKind,
		"sourceProviderEventType": sourceProviderEventType, "sourceProviderToolCallId": sourceProviderToolCallID,
		"sourceToolId": sourceToolID, "sourceArgumentsDigest": sourceArgumentsDigest,
		"sourceHandleDigest": sourceHandleDigest, "stateVaultSealRequest": stateVaultSealRequest,
		"stateVaultSealReceipt": stateVaultSealReceipt, "protocolFamily": request.ProtocolFamily,
		"providerConfigurationId": request.ProviderConfigurationID, "modelLineageDigest": request.ModelLineageDigest,
		"adapterDigest": request.AdapterDigest,
	}
	if retrieval {
		argumentsDigest, digestErr := canonicaljson.Digest(map[string]any{"requestRef": requestRef, "targetRef": targetRef})
		if digestErr != nil {
			t.Fatal(digestErr)
		}
		registryBase["sourceArgumentsDigest"] = argumentsDigest
	}
	registryDigest, err := canonicaljson.Digest(registryBase)
	if err != nil {
		t.Fatal(err)
	}
	registryReceipt := cloneEvaluationObject(registryBase)
	registryReceipt["receiptDigest"] = registryDigest
	registryBytes, _ := canonicaljson.Bytes(registryReceipt)
	if _, err := decodeEvaluationCapabilityEffectInputRegistryReceipt(registryBytes); err != nil {
		t.Fatalf("decode capability effect input registry fixture: %v", err)
	}
	bindingBase := cloneEvaluationObject(registryBase)
	bindingBase["format"] = evaluationCapabilityEffectInputAuthorityBindingFormat
	bindingBase["sourceRegistryReceiptDigest"] = registryDigest
	bindingDigest, err := canonicaljson.Digest(bindingBase)
	if err != nil {
		t.Fatal(err)
	}
	binding := cloneEvaluationObject(bindingBase)
	binding["bindingDigest"] = bindingDigest
	encodedBinding, _ := canonicaljson.Bytes(binding)
	canonicalBinding, canonicalBindingErr := decodeCanonicalEvaluationObject(
		encodedBinding, maximumEvaluationCapabilityEffectInputAuthorityBytes,
	)
	if canonicalBindingErr != nil {
		t.Fatal(canonicalBindingErr)
	}
	if _, _, decodedDigest, err := evaluationAttemptAuthorityInputAuthorityBinding(canonicalBinding); err != nil || decodedDigest != bindingDigest {
		t.Fatalf("decode capability effect input binding fixture: digest=%s err=%v binding=%s", decodedDigest, err, encodedBinding)
	}
	argumentsDigest, err := canonicaljson.Digest(map[string]any{"requestRef": requestRef, "targetRef": targetRef})
	if err != nil {
		t.Fatal(err)
	}
	_ = runtimeAuthority
	return canonicalBinding, profile.ToolID, argumentsDigest, lifecycle
}

func evaluationOptionalFactTestEffectFixture(
	t *testing.T,
	capabilityID string,
	sourceKind string,
	effectStatus string,
	factValue map[string]any,
) evaluationOptionalFactEffectFixture {
	t.Helper()
	normalizedRoot := evaluationOptionalFactTestDigest(t, "effect-normalized-root")
	placeholder := evaluationOptionalFactTestDigest(t, "effect-receipt-placeholder")
	journalRequestDigest := evaluationOptionalFactTestDigest(t, "effect-journal-request")
	ownerReceiptDigest := evaluationOptionalFactTestDigest(t, "effect-owner-receipt")
	var resultSpoolReceiptDigest any
	if effectStatus == "produced" {
		resultSpoolReceiptDigest = evaluationOptionalFactTestDigest(t, "result-spool")
	}
	request := evaluationOptionalFactTestRequestWithResultSpool(t, capabilityID, map[string]any{
		"kind": sourceKind, "ownerRequestDigest": journalRequestDigest,
		"ownerReceiptDigest": ownerReceiptDigest, "effectSourceReceiptDigest": placeholder,
	}, normalizedRoot, resultSpoolReceiptDigest)
	target := evaluationOptionalFactTestTarget(t, request)
	runtimeAuthority := evaluationOptionalFactTestRuntimeAuthority(target)
	runtimeAuthority["authorityDigest"] = target.TargetAuthorityDigest
	transport := evaluationOptionalFactTestTransport(t, request)
	authority := EvaluationAuthority{Kind: "service", PrincipalID: "test-ledger", NamespaceID: "namespace.test"}
	partition := EvaluationPlanPartition{PlanDigest: transport.Intent.PlanDigest, RepositoryCommit: transport.Intent.RepositoryCommit}
	requestedAt := transport.Receipt.CompletedAt
	inputAuthorityBinding, toolID, argumentsDigest, stateVaultLifecycle := evaluationOptionalFactTestEffectBinding(
		t, authority, partition, request, target, runtimeAuthority, requestedAt,
	)
	ownerIdentityBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-owner-request-identity", "version": int64(1),
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "caseId": "case/optional/1",
		"materialDigest": evaluationOptionalFactTestDigest(t, "material"), "turnIndex": request.Value["turnIndex"],
		"invocationId": request.InvocationID, "toolId": toolID, "toolCallId": "tool-call/optional/1",
		"providerToolCallId": "provider-tool-call/optional/1", "providerRequestDigest": request.ProviderRequestDigest,
		"argumentsDigest": argumentsDigest, "requestedAt": requestedAt.Format("2006-01-02T15:04:05.000Z"),
		"inputAuthorityBindingDigest":      stringMember(inputAuthorityBinding, "bindingDigest"),
		"runtimeFactSourceAuthorityDigest": target.TargetAuthorityDigest,
		"registrationReceiptDigest":        target.RegistrationReceiptDigest,
	}
	effectOwnerRequestDigest, err := canonicaljson.Digest(ownerIdentityBase)
	if err != nil {
		t.Fatal(err)
	}
	preEffectBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-pre-effect-intent", "version": int64(1),
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "caseId": ownerIdentityBase["caseId"],
		"materialDigest": ownerIdentityBase["materialDigest"], "turnIndex": request.Value["turnIndex"],
		"invocationId": request.InvocationID, "toolId": ownerIdentityBase["toolId"],
		"toolCallId": ownerIdentityBase["toolCallId"], "providerToolCallId": ownerIdentityBase["providerToolCallId"],
		"providerRequestDigest": request.ProviderRequestDigest, "argumentsDigest": ownerIdentityBase["argumentsDigest"],
		"requestedAt": ownerIdentityBase["requestedAt"], "inputAuthorityBinding": inputAuthorityBinding,
		"runtimeFactSourceAuthority": runtimeAuthority, "registrationReceiptDigest": target.RegistrationReceiptDigest,
		"ownerRequestId":     "capability-effect-owner-request." + effectOwnerRequestDigest[len("sha256-"):],
		"ownerRequestDigest": effectOwnerRequestDigest,
	}
	preEffectIntentDigest, err := canonicaljson.Digest(preEffectBase)
	if err != nil {
		t.Fatal(err)
	}
	preEffectIntent := cloneEvaluationObject(preEffectBase)
	preEffectIntent["intentDigest"] = preEffectIntentDigest
	preEffectIntentBytes, err := canonicaljson.Bytes(preEffectIntent)
	if err != nil {
		t.Fatal(err)
	}
	result := map[string]any{"status": effectStatus, "bounded": true}
	businessResultDigest, err := canonicaljson.Digest(result)
	if err != nil {
		t.Fatal(err)
	}
	var fact any
	var sourceFactKind any
	var sourceFactDigest any
	if effectStatus == "produced" {
		expectedKind := evaluationOptionalFactKind(capabilityID)
		_, factDigest, factErr := evaluationOptionalFactObservedValue(expectedKind, factValue)
		if factErr != nil {
			t.Fatal(factErr)
		}
		fact = map[string]any{"factKind": expectedKind, "factDigest": factDigest, "value": factValue}
		sourceFactKind, sourceFactDigest = expectedKind, factDigest
	}
	stageDigest := evaluationOptionalFactTestDigest(t, "owner-stage")
	dispatchAckDigest := evaluationOptionalFactTestDigest(t, "owner-ack")
	sealedAt := transport.Receipt.CompletedAt.Add(time.Second)
	effectReceiptBase := map[string]any{
		"format": "prodivix.agent-evaluation-capability-effect-source-receipt", "version": int64(1),
		"intentDigest": preEffectIntentDigest, "ownerRequestId": preEffectIntent["ownerRequestId"],
		"ownerRequestDigest": effectOwnerRequestDigest, "runtimeFactSourceAuthority": runtimeAuthority,
		"registrationReceiptDigest": target.RegistrationReceiptDigest, "effectStatus": effectStatus,
		"businessResultDigest":                     businessResultDigest,
		"providerRuntimeJournalResultRecordDigest": evaluationOptionalFactTestDigest(t, "provider-runtime-journal-result"),
		"providerRuntimeResultSealReceiptDigest":   evaluationOptionalFactTestDigest(t, "provider-runtime-result-seal"),
		"sourceFactKind":                           sourceFactKind, "sourceFactDigest": sourceFactDigest,
		"stageDigest": stageDigest, "dispatchAckDigest": dispatchAckDigest,
		"transportReceiptDigest":      request.TransportReceiptDigest,
		"resultSpoolReceiptDigest":    evaluationOptionalFactNullableDigestValue(request.ResultSpoolReceiptDigest),
		"normalizedEventSetDigest":    request.NormalizedEventSetDigest,
		"stateVaultResolveRequest":    stateVaultLifecycle.ResolveRequest,
		"stateVaultResolveReceipt":    stateVaultLifecycle.ResolveReceipt,
		"stateVaultRetireRequest":     stateVaultLifecycle.RetireRequest,
		"stateVaultRetirementReceipt": stateVaultLifecycle.RetirementReceipt,
		"specificReceiptDigests":      []any{},
		"sealedAt":                    sealedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	effectReceiptDigest, err := canonicaljson.Digest(effectReceiptBase)
	if err != nil {
		t.Fatal(err)
	}
	effectReceipt := cloneEvaluationObject(effectReceiptBase)
	effectReceipt["receiptDigest"] = effectReceiptDigest
	outcome := map[string]string{"produced": "supported", "unavailable": "unsupported", "failed": "failed"}[effectStatus]
	continuationDigest := evaluationOptionalFactTestDigest(t, "continuation")
	response := map[string]any{
		"executionAuthorityKind": "shared-effect", "outcome": outcome, "result": result,
		"resultDigest": businessResultDigest, "continuationReceiptDigest": continuationDigest,
		"effectSourceReceipt": effectReceipt, "effectSourceFact": fact, "specificReceipts": []any{},
	}
	responseBytes, err := canonicaljson.Bytes(response)
	if err != nil {
		t.Fatal(err)
	}
	projection := map[string]any{
		"serviceKind": "capability-runtime", "operation": "execute-tool", "executionAuthorityKind": "shared-effect",
		"invocationId": request.InvocationID, "turnIndex": request.Value["turnIndex"],
		"toolId": preEffectIntent["toolId"], "toolCallId": preEffectIntent["toolCallId"],
		"providerToolCallId": preEffectIntent["providerToolCallId"], "providerRequestDigest": request.ProviderRequestDigest,
		"outcome": outcome, "resultDigest": businessResultDigest, "continuationReceiptDigest": continuationDigest,
		"preEffectIntentDigest": preEffectIntentDigest, "effectSourceReceiptDigest": effectReceiptDigest,
		"effectSourceFactDigest": sourceFactDigest, "specificReceiptDigests": []any{},
	}
	request = evaluationOptionalFactTestRequestWithResultSpool(t, capabilityID, map[string]any{
		"kind": sourceKind, "ownerRequestDigest": journalRequestDigest,
		"ownerReceiptDigest": ownerReceiptDigest, "effectSourceReceiptDigest": effectReceiptDigest,
	}, normalizedRoot, resultSpoolReceiptDigest)
	transport = evaluationOptionalFactTestTransport(t, request)
	return evaluationOptionalFactEffectFixture{
		Authority: authority, Partition: partition, Request: request, Transport: transport,
		Target: target,
		Owner: evaluationOptionalFactEffectOwnerSource{
			RequestDigest: journalRequestDigest, ReceiptDigest: ownerReceiptDigest,
			StageDigest: stageDigest, DispatchAckDigest: dispatchAckDigest,
			OwnerImplementationDigest: target.SourceAuthorityImplementationDigest,
			ResponseProjection:        projection, PreEffectIntentBytes: preEffectIntentBytes, ResponseBytes: responseBytes,
			CompletedAt: sealedAt.Add(time.Second),
		},
	}
}

func evaluationOptionalFactProviderRequestFixture(
	t *testing.T,
	includeCache bool,
) evaluationOptionalFactEffectFixture {
	t.Helper()
	status := "unavailable"
	var fact map[string]any
	if includeCache {
		status, fact = "produced", evaluationOptionalFactTestCacheFact(t)
	}
	return evaluationOptionalFactTestEffectFixture(
		t, "provider.isolated-cache", "sealed-provider-response-metadata", status, fact,
	)
}

func TestEvaluationOptionalFactAuthoritySealsRealProviderFactWithTargetAuthority(t *testing.T) {
	fixture := evaluationOptionalFactProviderRequestFixture(t, true)
	request, transport, target := fixture.Request, fixture.Transport, fixture.Target
	evidence, err := evaluationOptionalFactEffectSourceEvidence(
		fixture.Authority, fixture.Partition, request, target, transport, fixture.Owner,
	)
	if err != nil {
		t.Fatal(err)
	}
	expectedJournalResultRecordDigest := evaluationOptionalFactTestDigest(t, "provider-runtime-journal-result")
	expectedJournalResultSealDigest := evaluationOptionalFactTestDigest(t, "provider-runtime-result-seal")
	if evidence.Outcome != "observed" || evidence.FactKind != "provider-cache-receipt" ||
		evidence.PreEffectIntentDigest == "" || evidence.EffectSourceReceiptDigest == "" ||
		evidence.ProviderRuntimeJournalResultRecordDigest != expectedJournalResultRecordDigest ||
		evidence.ProviderRuntimeResultSealReceiptDigest != expectedJournalResultSealDigest ||
		evidence.EffectSourceFactDigest != evidence.FactDigest {
		t.Fatalf("unexpected provider evidence: %#v", evidence)
	}
	preEffectIntent, _ := decodeCanonicalEvaluationObject(
		evidence.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	if stringMember(preEffectIntent, "ownerRequestDigest") == request.Source.OwnerRequestDigest ||
		request.Source.OwnerRequestDigest != fixture.Owner.RequestDigest {
		t.Fatalf("effect identity collapsed into the 8790 journal request: preEffect=%#v source=%#v",
			preEffectIntent, request.Source)
	}
	authority, partition := fixture.Authority, fixture.Partition
	source, err := evaluationOptionalFactSourceSeal(authority, partition, request, evidence, evidence.ObservedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if source.ProviderRuntimeJournalResultRecordDigest != expectedJournalResultRecordDigest ||
		source.ProviderRuntimeResultSealReceiptDigest != expectedJournalResultSealDigest {
		t.Fatalf("provider runtime journal scalar binding drifted: %#v", source)
	}
	t.Run("journal-scalar-drift", func(t *testing.T) {
		drifted := evidence
		drifted.ProviderRuntimeJournalResultRecordDigest = evaluationOptionalFactTestDigest(t, "provider-runtime-journal-result-drift")
		if _, driftErr := evaluationOptionalFactSourceSeal(
			authority, partition, request, drifted, evidence.ObservedAt.Add(time.Second),
		); !errors.Is(driftErr, ErrConflict) {
			t.Fatalf("expected journal scalar drift conflict, got %v", driftErr)
		}
	})
	stageValue := map[string]any{
		"format": evaluationOptionalFactAuthorityStageRequestFormat, "version": int64(1),
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"turnIndex": request.TurnIndex, "sourceSealDigest": source.SourceSealDigest,
	}
	stageBytes, _ := canonicaljson.Bytes(stageValue)
	stageRequest, err := decodeEvaluationOptionalFactAuthorityStageRequest(stageBytes)
	if err != nil {
		t.Fatal(err)
	}
	staged, err := evaluationOptionalFactAuthorityStage(authority, partition, stageRequest, source, source.SealedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := evaluationOptionalFactAuthoritySealFromSource(authority, partition, staged, source, staged.StagedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if sealed.Outcome != "observed" || sealed.SourceAuthorityID != target.SourceAuthorityID ||
		sealed.SourceAuthorityImplementationDigest != target.SourceAuthorityImplementationDigest ||
		sealed.FactKind != "provider-cache-receipt" || sealed.RuntimeFactEnvelopeDigest == "" ||
		sealed.FactAuthorityDigest == "" || len(sealed.RuntimeFactEnvelopeBytes) == 0 {
		t.Fatalf("unexpected sealed optional fact authority: %#v", sealed)
	}
	if sealed.RuntimeFactEnvelopeDigest != "sha256-0040aafe8cdfca299149800d6636165bb06055245b328bc4fe5f5f71e3980977" ||
		sealed.FactAuthorityDigest != "sha256-7fe609a0ce253b7b52683123a9a330ea9c362ba48b7902a4ae3052f58dfbeba6" {
		t.Fatalf("shared runtime authority cross-owner digest drifted: envelope=%s authority=%s",
			sealed.RuntimeFactEnvelopeDigest, sealed.FactAuthorityDigest)
	}
	response, err := evaluationOptionalFactAuthorityResponseValue(sealed)
	if err != nil {
		t.Fatal(err)
	}
	envelopes := response["runtimeFactEnvelopes"].([]any)
	authorities := response["factAuthorities"].([]any)
	if len(envelopes) != 1 || len(authorities) != 1 {
		t.Fatalf("unexpected runtime envelope response: %#v", response)
	}
	envelope := envelopes[0].(map[string]any)
	factAuthority := authorities[0].(map[string]any)
	if !exactEvaluationKeys(envelope, []string{
		"format", "version", "sourceAuthorityKind", "sourceAuthorityId", "sourceAuthorityImplementationDigest",
		"sourceKind", "routeBinding", "registrationAuthorityIssuerId", "registrationReceiptDigest",
		"runtimeFactSourceAuthorityDigest", "stageDigest", "dispatchAckDigest", "planDigest", "repositoryCommit",
		"attemptId", "descriptorDigest", "turnIndex", "invocationId", "requestDigest", "responseDigest",
		"protocolFamily", "providerConfigurationId", "modelLineageDigest", "adapterDigest", "dispatchIntentDigest",
		"transportReceiptDigest", "resultSpoolReceiptDigest", "normalizedEventSetDigest", "observedAt", "fact", "envelopeDigest",
	}) || !exactEvaluationKeys(factAuthority, []string{
		"format", "version", "factKind", "factDigest", "sourceAuthorityKind", "sourceAuthorityId",
		"sourceAuthorityImplementationDigest", "sourceKind", "routeBinding", "registrationAuthorityIssuerId",
		"registrationReceiptDigest", "runtimeFactSourceAuthorityDigest", "stageDigest", "dispatchAckDigest",
		"transportReceiptDigest", "resultSpoolReceiptDigest", "normalizedEventSetDigest", "runtimeFactEnvelopeDigest",
		"authorityDigest",
	}) {
		t.Fatalf("shared-durable authority shape drifted: envelope=%#v authority=%#v", envelope, factAuthority)
	}
	for _, value := range []map[string]any{envelope, factAuthority} {
		if stringMember(value, "sourceAuthorityKind") != "shared-durable-capability" ||
			stringMember(value, "sourceKind") != target.SourceKind ||
			stringMember(value, "routeBinding") != target.SourceAuthorityRouteBinding ||
			stringMember(value, "registrationAuthorityIssuerId") != target.RegistrationAuthorityIssuerID ||
			stringMember(value, "registrationReceiptDigest") != target.RegistrationReceiptDigest ||
			stringMember(value, "runtimeFactSourceAuthorityDigest") != target.TargetAuthorityDigest ||
			stringMember(value, "stageDigest") != fixture.Owner.StageDigest ||
			stringMember(value, "dispatchAckDigest") != fixture.Owner.DispatchAckDigest {
			t.Fatalf("shared-durable registration binding drifted: %#v", value)
		}
	}
	if stringMember(envelope, "transportReceiptDigest") != request.TransportReceiptDigest ||
		stringMember(envelope, "resultSpoolReceiptDigest") != request.ResultSpoolReceiptDigest ||
		stringMember(envelope, "normalizedEventSetDigest") != request.NormalizedEventSetDigest ||
		stringMember(envelope, "transportReceiptDigest") == transport.Receipt.ReceiptDigest ||
		stringMember(envelope, "resultSpoolReceiptDigest") == transport.Spool.ReceiptDigest ||
		stringMember(envelope, "normalizedEventSetDigest") == transport.Spool.NormalizedEventSetDigest {
		t.Fatalf("shared source-local roots collapsed into the outer turn journal: %#v", envelope)
	}
	if stringMember(envelope, "observedAt") != source.ObservedAt.Format("2006-01-02T15:04:05.000Z") ||
		!sealed.SealedAt.After(source.ObservedAt) {
		t.Fatalf("source observation time collapsed into the later seal lifecycle: envelope=%#v sealedAt=%s",
			envelope, sealed.SealedAt)
	}
	if stringMember(response, "stageDigest") != staged.StageDigest ||
		stringMember(response, "dispatchAckDigest") != sealed.DispatchAckDigest ||
		staged.StageDigest == fixture.Owner.StageDigest || sealed.DispatchAckDigest == fixture.Owner.DispatchAckDigest {
		t.Fatalf("optional seal lifecycle drifted into the real effect authority: %#v", response)
	}
	sourceArchive := EvaluationOptionalFactSourceArchiveRecord{
		AttemptID: source.AttemptID, TurnIndex: source.TurnIndex, SourceSealDigest: source.SourceSealDigest,
		ReceiptBytes: source.ReceiptBytes, PreEffectIntentBytes: source.PreEffectIntentBytes,
		EffectSourceReceiptBytes: source.EffectSourceReceiptBytes, FactBytes: source.FactBytes,
	}
	if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&sourceArchive); err != nil {
		t.Fatal(err)
	}
	sourceArchiveValue, err := decodeCanonicalEvaluationObject(
		sourceArchive.RecordBytes, maximumEvaluationOptionalFactSourceArchiveRecordBytes,
	)
	if err != nil || !exactEvaluationKeys(sourceArchiveValue, []string{
		"format", "version", "attemptId", "turnIndex", "sourceSealDigest", "sourceReceipt",
		"preEffectIntent", "effectSourceReceipt", "effectSourceFact", "recordDigest",
	}) || stringMember(sourceArchiveValue, "recordDigest") != sourceArchive.RecordDigest {
		t.Fatalf("source archive wrapper drifted: %#v %v", sourceArchiveValue, err)
	}
	t.Run("archive-pre-effect-swap", func(t *testing.T) {
		tampered := sourceArchive
		intent, _ := decodeCanonicalEvaluationObject(
			tampered.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
		)
		intent["toolId"] = "tool/optional/swapped"
		delete(intent, "intentDigest")
		intentDigest, _ := canonicaljson.Digest(intent)
		intent["intentDigest"] = intentDigest
		tampered.PreEffectIntentBytes, _ = canonicaljson.Bytes(intent)
		if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&tampered); !errors.Is(err, ErrConflict) {
			t.Fatalf("recommitted pre-effect archive swap was accepted: %v", err)
		}
	})
	t.Run("archive-effect-receipt-swap", func(t *testing.T) {
		tampered := sourceArchive
		receipt, _ := decodeCanonicalEvaluationObject(
			tampered.EffectSourceReceiptBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
		)
		receipt["sealedAt"] = "2026-08-09T00:00:00.000Z"
		delete(receipt, "receiptDigest")
		receiptDigest, _ := canonicaljson.Digest(receipt)
		receipt["receiptDigest"] = receiptDigest
		tampered.EffectSourceReceiptBytes, _ = canonicaljson.Bytes(receipt)
		if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&tampered); !errors.Is(err, ErrConflict) {
			t.Fatalf("recommitted effect receipt archive swap was accepted: %v", err)
		}
	})
	authorityArchive := EvaluationOptionalFactAuthorityArchiveRecord{
		AttemptID: sealed.AttemptID, TurnIndex: sealed.TurnIndex, SourceSealDigest: sealed.SourceSealDigest,
		AuthorityRequestDigest: sealed.AuthorityRequestDigest, StageDigest: sealed.StageDigest,
		DispatchAckDigest: sealed.DispatchAckDigest, ResultDigest: sealed.ResultDigest,
		RequestBytes: sealed.RequestBytes, FactBytes: sealed.FactBytes,
		RuntimeFactEnvelopeBytes: sealed.RuntimeFactEnvelopeBytes, FactAuthorityBytes: sealed.FactAuthorityBytes,
		ResponseBytes: sealed.ResponseBytes,
	}
	if err := evaluationOptionalFactAuthorityArchiveCanonicalRecord(&authorityArchive); err != nil {
		t.Fatal(err)
	}
	authorityArchiveValue, err := decodeCanonicalEvaluationObject(
		authorityArchive.RecordBytes, maximumEvaluationOptionalFactAuthorityArchiveRecordBytes,
	)
	if err != nil || !exactEvaluationKeys(authorityArchiveValue, []string{
		"format", "version", "attemptId", "turnIndex", "sourceSealDigest", "authorityRequestDigest",
		"stageDigest", "dispatchAckDigest", "resultDigest", "stageRequest", "fact", "runtimeFactEnvelope",
		"factAuthority", "sealedResponse", "recordDigest",
	}) || stringMember(authorityArchiveValue, "recordDigest") != authorityArchive.RecordDigest {
		t.Fatalf("authority archive wrapper drifted: %#v %v", authorityArchiveValue, err)
	}
	projection, err := evaluationOptionalFactArchiveFamilyProjection(
		1, 0, nil, []EvaluationOptionalFactSourceArchiveRecord{sourceArchive},
		[]EvaluationOptionalFactAuthorityArchiveRecord{authorityArchive},
	)
	if err != nil || projection.SourceCount != 1 || projection.AuthorityCount != 1 ||
		projection.SourceBytes != int64(len(sourceArchive.RecordBytes)) ||
		projection.AuthorityBytes != int64(len(authorityArchive.RecordBytes)) {
		t.Fatalf("optional archive family projection drifted: %#v %v", projection, err)
	}
}

func TestEvaluationOptionalFactAuthoritySealsEverySharedEffectFactKind(t *testing.T) {
	tests := []struct {
		name, capabilityID, sourceKind, factKind string
		fact                                     func(*testing.T) map[string]any
	}{
		{"background-job", "provider.background-job", "sealed-provider-response-metadata", "provider-job-receipt", evaluationOptionalFactTestJobFact},
		{"hosted-retrieval", "provider.hosted-retrieval", "sealed-hosted-owner-result", "retrieval-query-receipt", evaluationOptionalFactTestRetrievalFact},
		{"reasoning-continuation", "provider.reasoning-continuation", "sealed-provider-response-metadata", "opaque-continuation", evaluationOptionalFactTestContinuationFact},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := evaluationOptionalFactTestEffectFixture(
				t, testCase.capabilityID, testCase.sourceKind, "produced", testCase.fact(t),
			)
			evidence, err := evaluationOptionalFactEffectSourceEvidence(
				fixture.Authority, fixture.Partition, fixture.Request, fixture.Target, fixture.Transport, fixture.Owner,
			)
			if err != nil {
				t.Fatal(err)
			}
			source, err := evaluationOptionalFactSourceSeal(
				fixture.Authority, fixture.Partition, fixture.Request, evidence, evidence.ObservedAt.Add(time.Second),
			)
			if err != nil {
				t.Fatal(err)
			}
			stageBytes, _ := canonicaljson.Bytes(map[string]any{
				"format": evaluationOptionalFactAuthorityStageRequestFormat, "version": int64(1),
				"planDigest": fixture.Partition.PlanDigest, "repositoryCommit": fixture.Partition.RepositoryCommit,
				"attemptId": fixture.Request.AttemptID, "descriptorDigest": fixture.Request.DescriptorDigest,
				"turnIndex": fixture.Request.TurnIndex, "sourceSealDigest": source.SourceSealDigest,
			})
			stageRequest, stageErr := decodeEvaluationOptionalFactAuthorityStageRequest(stageBytes)
			if stageErr != nil {
				t.Fatal(stageErr)
			}
			staged, err := evaluationOptionalFactAuthorityStage(
				fixture.Authority, fixture.Partition, stageRequest, source, source.SealedAt.Add(time.Second),
			)
			if err != nil {
				t.Fatal(err)
			}
			sealed, err := evaluationOptionalFactAuthoritySealFromSource(
				fixture.Authority, fixture.Partition, staged, source, staged.StagedAt.Add(time.Second),
			)
			if err != nil || sealed.Outcome != "observed" || sealed.FactKind != testCase.factKind ||
				sealed.RuntimeFactEnvelopeDigest == "" || sealed.FactAuthorityDigest == "" {
				t.Fatalf("shared effect fact kind was not sealed: %#v %v", sealed, err)
			}
		})
	}
}

func TestEvaluationOptionalFactAuthorityEmptyCacheProducesUnavailableAndNoFact(t *testing.T) {
	fixture := evaluationOptionalFactProviderRequestFixture(t, false)
	request, transport, target := fixture.Request, fixture.Transport, fixture.Target
	if request.ResultSpoolReceiptDigest != "" || request.Value["resultSpoolReceiptDigest"] != nil {
		t.Fatalf("unavailable request did not preserve the nullable inner spool receipt: %#v", request.Value)
	}
	evidence, err := evaluationOptionalFactEffectSourceEvidence(
		fixture.Authority, fixture.Partition, request, target, transport, fixture.Owner,
	)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.Outcome != "unavailable" || evidence.Fact != nil || evidence.EffectSourceFactDigest != "" {
		t.Fatalf("empty real source created a fact: %#v", evidence)
	}
	authority, partition := fixture.Authority, fixture.Partition
	source, err := evaluationOptionalFactSourceSeal(authority, partition, request, evidence, evidence.ObservedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if source.FactKind != "" || source.FactDigest != "" || len(source.FactBytes) != 0 || source.EffectSourceFactDigest != "" {
		t.Fatalf("unavailable source retained a synthetic fact: %#v", source)
	}
	sourceArchive := EvaluationOptionalFactSourceArchiveRecord{
		AttemptID: source.AttemptID, TurnIndex: source.TurnIndex, SourceSealDigest: source.SourceSealDigest,
		ReceiptBytes: source.ReceiptBytes, PreEffectIntentBytes: source.PreEffectIntentBytes,
		EffectSourceReceiptBytes: source.EffectSourceReceiptBytes, FactBytes: source.FactBytes,
	}
	if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&sourceArchive); err != nil {
		t.Fatal(err)
	}
	sourceArchiveValue, _ := decodeCanonicalEvaluationObject(
		sourceArchive.RecordBytes, maximumEvaluationOptionalFactSourceArchiveRecordBytes,
	)
	if fact, exists := sourceArchiveValue["effectSourceFact"]; !exists || fact != nil {
		t.Fatalf("unavailable source archive omitted its explicit null fact: %#v", sourceArchiveValue)
	}
	sourceReceipt, err := decodeCanonicalEvaluationObject(
		source.ReceiptBytes, maximumEvaluationOptionalFactAuthorityResponseBytes,
	)
	if err != nil || sourceReceipt["resultSpoolReceiptDigest"] != nil {
		t.Fatalf("unavailable source receipt drifted from its null inner spool: value=%#v err=%v", sourceReceipt, err)
	}
	stageValue := map[string]any{
		"format": evaluationOptionalFactAuthorityStageRequestFormat, "version": int64(1),
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"turnIndex": request.TurnIndex, "sourceSealDigest": source.SourceSealDigest,
	}
	stageBytes, _ := canonicaljson.Bytes(stageValue)
	stageRequest, _ := decodeEvaluationOptionalFactAuthorityStageRequest(stageBytes)
	staged, err := evaluationOptionalFactAuthorityStage(authority, partition, stageRequest, source, source.SealedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := evaluationOptionalFactAuthoritySealFromSource(authority, partition, staged, source, staged.StagedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	authorityArchive := EvaluationOptionalFactAuthorityArchiveRecord{
		AttemptID: sealed.AttemptID, TurnIndex: sealed.TurnIndex, SourceSealDigest: sealed.SourceSealDigest,
		AuthorityRequestDigest: sealed.AuthorityRequestDigest, StageDigest: sealed.StageDigest,
		DispatchAckDigest: sealed.DispatchAckDigest, ResultDigest: sealed.ResultDigest,
		RequestBytes: sealed.RequestBytes, FactBytes: sealed.FactBytes,
		RuntimeFactEnvelopeBytes: sealed.RuntimeFactEnvelopeBytes, FactAuthorityBytes: sealed.FactAuthorityBytes,
		ResponseBytes: sealed.ResponseBytes,
	}
	if err := evaluationOptionalFactAuthorityArchiveCanonicalRecord(&authorityArchive); err != nil {
		t.Fatal(err)
	}
	authorityArchiveValue, _ := decodeCanonicalEvaluationObject(
		authorityArchive.RecordBytes, maximumEvaluationOptionalFactAuthorityArchiveRecordBytes,
	)
	for _, field := range []string{"fact", "runtimeFactEnvelope", "factAuthority"} {
		if value, exists := authorityArchiveValue[field]; !exists || value != nil {
			t.Fatalf("unavailable authority archive omitted explicit null %s: %#v", field, authorityArchiveValue)
		}
	}
}

func TestEvaluationOptionalFactAuthorityHostedUnavailableKeepsBusinessResultAndNullFact(t *testing.T) {
	fixture := evaluationOptionalFactTestEffectFixture(
		t, "provider.hosted-retrieval", "sealed-hosted-owner-result", "unavailable", nil,
	)
	evidence, err := evaluationOptionalFactEffectSourceEvidence(
		fixture.Authority, fixture.Partition, fixture.Request, fixture.Target, fixture.Transport, fixture.Owner,
	)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.Outcome != "unavailable" || evidence.Fact != nil ||
		evidence.BusinessResultDigest == "" || evidence.EffectSourceFactDigest != "" {
		t.Fatalf("unexpected hosted empty result evidence: %#v", evidence)
	}
	source, err := evaluationOptionalFactSourceSeal(
		fixture.Authority, fixture.Partition, fixture.Request, evidence, evidence.ObservedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	value, err := decodeCanonicalEvaluationObject(source.ReceiptBytes, maximumEvaluationOptionalFactAuthorityResponseBytes)
	if err != nil {
		t.Fatal(err)
	}
	if value["effectSourceFactDigest"] != nil {
		t.Fatal("unavailable hosted source persisted a non-null effectSourceFactDigest")
	}
	if stringMember(value, "businessResultDigest") != evidence.BusinessResultDigest {
		t.Fatal("hosted business result digest was not retained")
	}
}

func TestEvaluationOptionalFactAuthorityFailedEffectProducesNoFact(t *testing.T) {
	fixture := evaluationOptionalFactTestEffectFixture(
		t, "provider.background-job", "sealed-provider-response-metadata", "failed", nil,
	)
	evidence, err := evaluationOptionalFactEffectSourceEvidence(
		fixture.Authority, fixture.Partition, fixture.Request, fixture.Target, fixture.Transport, fixture.Owner,
	)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.Outcome != "failed" || evidence.Fact != nil ||
		evidence.FactDigest != "" || evidence.EffectSourceFactDigest != "" {
		t.Fatalf("failed effect created a synthetic fact: %#v", evidence)
	}
	if fixture.Request.ResultSpoolReceiptDigest != "" {
		t.Fatal("failed effect request synthesized an inner spool receipt")
	}
	source, err := evaluationOptionalFactSourceSeal(
		fixture.Authority, fixture.Partition, fixture.Request, evidence, evidence.ObservedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	if source.FactKind != "" || source.FactDigest != "" || len(source.FactBytes) != 0 ||
		source.EffectSourceFactDigest != "" {
		t.Fatalf("failed source retained a synthetic fact: %#v", source)
	}
	stageBytes, _ := canonicaljson.Bytes(map[string]any{
		"format": evaluationOptionalFactAuthorityStageRequestFormat, "version": int64(1),
		"planDigest": fixture.Partition.PlanDigest, "repositoryCommit": fixture.Partition.RepositoryCommit,
		"attemptId": fixture.Request.AttemptID, "descriptorDigest": fixture.Request.DescriptorDigest,
		"turnIndex": fixture.Request.TurnIndex, "sourceSealDigest": source.SourceSealDigest,
	})
	stageRequest, stageErr := decodeEvaluationOptionalFactAuthorityStageRequest(stageBytes)
	if stageErr != nil {
		t.Fatal(stageErr)
	}
	staged, err := evaluationOptionalFactAuthorityStage(
		fixture.Authority, fixture.Partition, stageRequest, source, source.SealedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := evaluationOptionalFactAuthoritySealFromSource(
		fixture.Authority, fixture.Partition, staged, source, staged.StagedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	if sealed.Outcome != "failed" || sealed.FactKind != "" || sealed.FactDigest != "" ||
		len(sealed.FactBytes) != 0 || sealed.RuntimeFactEnvelopeDigest != "" ||
		len(sealed.RuntimeFactEnvelopeBytes) != 0 || sealed.FactAuthorityDigest != "" ||
		len(sealed.FactAuthorityBytes) != 0 {
		t.Fatalf("failed effect sealed a synthetic authority: %#v", sealed)
	}
}

func TestEvaluationOptionalFactAuthorityRejectsInvalidNullableResultSpoolDigest(t *testing.T) {
	fixture := evaluationOptionalFactProviderRequestFixture(t, false)
	invalid := cloneEvaluationObject(fixture.Request.Value)
	invalid["resultSpoolReceiptDigest"] = ""
	encoded, err := canonicaljson.Bytes(invalid)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationOptionalFactAuthorityRequest(encoded); !errors.Is(err, ErrInvalid) {
		t.Fatalf("optional fact request accepted an empty-string spool digest: %v", err)
	}
}

func TestEvaluationOptionalFactAuthorityRejectsRawRootSwapAndFakeStage(t *testing.T) {
	fixture := evaluationOptionalFactProviderRequestFixture(t, true)
	request, transport, target := fixture.Request, fixture.Transport, fixture.Target
	tampered := transport
	tampered.Spool.TransportReceiptDigest = evaluationOptionalFactTestDigest(t, "swapped-transport")
	if _, err := evaluationOptionalFactEffectSourceEvidence(
		fixture.Authority, fixture.Partition, request, target, tampered, fixture.Owner,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("raw root swap was accepted: %v", err)
	}
	tamperedRequest := request
	tamperedRequest.TransportReceiptDigest = evaluationOptionalFactTestDigest(t, "swapped-effect-transport")
	if _, err := evaluationOptionalFactEffectSourceEvidence(
		fixture.Authority, fixture.Partition, tamperedRequest, target, transport, fixture.Owner,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("source-local effect root swap was accepted: %v", err)
	}
	evidence, err := evaluationOptionalFactEffectSourceEvidence(
		fixture.Authority, fixture.Partition, request, target, transport, fixture.Owner,
	)
	if err != nil {
		t.Fatal(err)
	}
	authority, partition := fixture.Authority, fixture.Partition
	source, err := evaluationOptionalFactSourceSeal(authority, partition, request, evidence, evidence.ObservedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	stageValue := map[string]any{
		"format": evaluationOptionalFactAuthorityStageRequestFormat, "version": int64(1),
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"turnIndex": request.TurnIndex, "sourceSealDigest": source.SourceSealDigest,
	}
	stageBytes, _ := canonicaljson.Bytes(stageValue)
	stageRequest, _ := decodeEvaluationOptionalFactAuthorityStageRequest(stageBytes)
	staged, err := evaluationOptionalFactAuthorityStage(authority, partition, stageRequest, source, source.SealedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	staged.StageDigest = evaluationOptionalFactTestDigest(t, "fake-stage")
	if _, err := evaluationOptionalFactAuthoritySealFromSource(authority, partition, staged, source, staged.StagedAt.Add(time.Second)); !errors.Is(err, ErrConflict) {
		t.Fatalf("fake stage fence was accepted: %v", err)
	}
}

func TestEvaluationOptionalFactAuthorityRejectsEffectReceiptIntentAndFactSwaps(t *testing.T) {
	fixture := evaluationOptionalFactProviderRequestFixture(t, true)
	assertRejected := func(owner evaluationOptionalFactEffectOwnerSource) {
		t.Helper()
		if _, err := evaluationOptionalFactEffectSourceEvidence(
			fixture.Authority, fixture.Partition, fixture.Request, fixture.Target, fixture.Transport, owner,
		); !errors.Is(err, ErrConflict) && !errors.Is(err, ErrInvalid) {
			t.Fatalf("tampered effect authority was accepted: %v", err)
		}
	}
	t.Run("fact-digest", func(t *testing.T) {
		owner := fixture.Owner
		response, _ := decodeCanonicalEvaluationObject(owner.ResponseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
		fact, _ := objectMember(response, "effectSourceFact")
		fact["factDigest"] = evaluationOptionalFactTestDigest(t, "swapped-effect-fact")
		owner.ResponseBytes, _ = canonicaljson.Bytes(response)
		if _, err := evaluationOptionalFactEffectSourceEvidence(
			fixture.Authority, fixture.Partition, fixture.Request, fixture.Target, fixture.Transport, owner,
		); !errors.Is(err, ErrConflict) {
			t.Fatalf("effect fact digest swap was accepted: %v", err)
		}
	})
	t.Run("receipt-digest", func(t *testing.T) {
		owner := fixture.Owner
		response, _ := decodeCanonicalEvaluationObject(owner.ResponseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
		receipt, _ := objectMember(response, "effectSourceReceipt")
		receipt["receiptDigest"] = evaluationOptionalFactTestDigest(t, "swapped-effect-receipt")
		owner.ResponseBytes, _ = canonicaljson.Bytes(response)
		assertRejected(owner)
	})
	t.Run("pre-effect-intent", func(t *testing.T) {
		owner := fixture.Owner
		intent, _ := decodeCanonicalEvaluationObject(
			owner.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
		)
		intent["intentDigest"] = evaluationOptionalFactTestDigest(t, "swapped-pre-effect-intent")
		owner.PreEffectIntentBytes, _ = canonicaljson.Bytes(intent)
		assertRejected(owner)
	})
	t.Run("unavailable-with-fact", func(t *testing.T) {
		unavailable := evaluationOptionalFactProviderRequestFixture(t, false)
		owner := unavailable.Owner
		producedResponse, _ := decodeCanonicalEvaluationObject(fixture.Owner.ResponseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
		producedFact, _ := objectMember(producedResponse, "effectSourceFact")
		response, _ := decodeCanonicalEvaluationObject(owner.ResponseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
		response["effectSourceFact"] = producedFact
		owner.ResponseBytes, _ = canonicaljson.Bytes(response)
		if _, err := evaluationOptionalFactEffectSourceEvidence(
			unavailable.Authority, unavailable.Partition, unavailable.Request, unavailable.Target, unavailable.Transport, owner,
		); !errors.Is(err, ErrConflict) {
			t.Fatalf("unavailable effect fact injection was accepted: %v", err)
		}
	})
	t.Run("owner-stage", func(t *testing.T) {
		owner := fixture.Owner
		owner.StageDigest = evaluationOptionalFactTestDigest(t, "swapped-owner-stage")
		assertRejected(owner)
	})
}

type evaluationOptionalFactReconcileRepository struct {
	record    EvaluationOptionalFactAuthorityRecord
	sealCalls int
	getCalls  int
}

func (repository *evaluationOptionalFactReconcileRepository) SealEvaluationOptionalFactAuthority(
	context.Context, EvaluationAuthority, EvaluationPlanPartition, string, int64, string, string, string, time.Time,
) (EvaluationOptionalFactAuthorityRecord, bool, error) {
	repository.sealCalls++
	return repository.record, false, nil
}

func (repository *evaluationOptionalFactReconcileRepository) GetEvaluationOptionalFactAuthority(
	context.Context, EvaluationAuthority, EvaluationPlanPartition, string, int64, string, string,
) (EvaluationOptionalFactAuthorityRecord, error) {
	repository.getCalls++
	return repository.record, nil
}

func TestEvaluationOptionalFactAuthorityReconcileAfterAckLossExecutesZero(t *testing.T) {
	fixture := evaluationOptionalFactProviderRequestFixture(t, true)
	request, transport, target := fixture.Request, fixture.Transport, fixture.Target
	evidence, _ := evaluationOptionalFactEffectSourceEvidence(
		fixture.Authority, fixture.Partition, request, target, transport, fixture.Owner,
	)
	authority, partition := fixture.Authority, fixture.Partition
	source, _ := evaluationOptionalFactSourceSeal(authority, partition, request, evidence, evidence.ObservedAt.Add(time.Second))
	stageValue := map[string]any{
		"format": evaluationOptionalFactAuthorityStageRequestFormat, "version": int64(1),
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"turnIndex": request.TurnIndex, "sourceSealDigest": source.SourceSealDigest,
	}
	stageBytes, _ := canonicaljson.Bytes(stageValue)
	stageRequest, _ := decodeEvaluationOptionalFactAuthorityStageRequest(stageBytes)
	staged, _ := evaluationOptionalFactAuthorityStage(authority, partition, stageRequest, source, source.SealedAt.Add(time.Second))
	sealed, _ := evaluationOptionalFactAuthoritySealFromSource(authority, partition, staged, source, staged.StagedAt.Add(time.Second))
	repository := &evaluationOptionalFactReconcileRepository{record: sealed}
	handler := &EvaluationServiceHandler{repository: repository, authority: authority, clock: time.Now}
	commandBytes, _ := canonicaljson.Bytes(map[string]any{
		"format": evaluationOptionalFactAuthorityCommandFormat, "version": int64(1),
		"attemptId": sealed.AttemptID, "turnIndex": sealed.TurnIndex,
		"authorityRequestDigest": sealed.AuthorityRequestDigest,
		"sourceSealDigest":       sealed.SourceSealDigest, "stageDigest": sealed.StageDigest,
	})
	httpRequest := httptest.NewRequest(http.MethodPost, "/optional-capability-facts/reconcile", strings.NewReader(string(commandBytes)))
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", sealed.AuthorityRequestDigest)
	response := httptest.NewRecorder()
	handler.handleEvaluationOptionalFactAuthority(response, httpRequest, partition, []string{"optional-capability-facts", "reconcile"})
	if response.Code != http.StatusOK || repository.getCalls != 1 || repository.sealCalls != 0 {
		t.Fatalf("ACK-loss reconcile drifted: status=%d get=%d seal=%d body=%s", response.Code, repository.getCalls, repository.sealCalls, response.Body.String())
	}
}

func TestEvaluationOptionalFactArchiveFamilyBoundsRejectPlusOne(t *testing.T) {
	if maximumEvaluationOptionalFactSourceArchiveRecordBytes != 167_936 ||
		maximumEvaluationOptionalFactSourceArchiveBytes != 987_463_680 ||
		maximumEvaluationOptionalFactAuthorityArchiveRecordBytes != 184_320 ||
		maximumEvaluationOptionalFactAuthorityArchiveBytes != 1_083_801_600 ||
		maximumEvaluationOptionalFactCombinedArchiveBytes != 2_071_265_280 {
		t.Fatalf("optional archive byte denominator drifted: source=%d/%d authority=%d/%d combined=%d",
			maximumEvaluationOptionalFactSourceArchiveRecordBytes, maximumEvaluationOptionalFactSourceArchiveBytes,
			maximumEvaluationOptionalFactAuthorityArchiveRecordBytes, maximumEvaluationOptionalFactAuthorityArchiveBytes,
			maximumEvaluationOptionalFactCombinedArchiveBytes)
	}
	if err := validateEvaluationOptionalFactArchiveFamilyBounds(
		maximumEvaluationOptionalFactAuthorityRecords,
		maximumEvaluationOptionalFactAuthorityRecords,
		maximumEvaluationOptionalFactSourceArchiveBytes,
		maximumEvaluationOptionalFactAuthorityRecords,
		maximumEvaluationOptionalFactAuthorityArchiveBytes,
	); err != nil {
		t.Fatal(err)
	}
	for name, check := range map[string]func() error{
		"source-count":    func() error { return validateEvaluationOptionalFactArchiveFamilyBounds(5_880, 5_881, 0, 0, 0) },
		"authority-count": func() error { return validateEvaluationOptionalFactArchiveFamilyBounds(5_880, 0, 0, 5_881, 0) },
		"source-bytes": func() error {
			return validateEvaluationOptionalFactArchiveFamilyBounds(5_880, 0, maximumEvaluationOptionalFactSourceArchiveBytes+1, 0, 0)
		},
		"authority-bytes": func() error {
			return validateEvaluationOptionalFactArchiveFamilyBounds(5_880, 0, 0, 0, maximumEvaluationOptionalFactAuthorityArchiveBytes+1)
		},
	} {
		t.Run(name, func(t *testing.T) {
			if err := check(); !errors.Is(err, ErrConflict) {
				t.Fatalf("+1 boundary was accepted: %v", err)
			}
		})
	}
}

func TestEvaluationOptionalFactAuthorityCommandRequiresSlashCapableAgentIdentity(t *testing.T) {
	value := map[string]any{
		"format": evaluationOptionalFactAuthorityCommandFormat, "version": int64(1),
		"attemptId": "attempt/with/slash", "turnIndex": int64(0),
		"authorityRequestDigest": evaluationOptionalFactTestDigest(t, "command-request"),
		"sourceSealDigest":       evaluationOptionalFactTestDigest(t, "command-source"),
		"stageDigest":            evaluationOptionalFactTestDigest(t, "command-stage"),
	}
	encoded, _ := canonicaljson.Bytes(value)
	command, err := decodeEvaluationOptionalFactAuthorityCommand(encoded)
	if err != nil || command.AttemptID != "attempt/with/slash" {
		t.Fatalf("slash-capable AgentControl identity was rejected: %#v %v", command, err)
	}
}

func TestEvaluationOptionalFactAuthorityHandlerRejectsMissingIdempotencyKey(t *testing.T) {
	repository := &evaluationOptionalFactReconcileRepository{}
	handler := &EvaluationServiceHandler{repository: repository, authority: EvaluationAuthority{Kind: "service", PrincipalID: "test", NamespaceID: "namespace.test"}, clock: time.Now}
	commandBytes, _ := canonicaljson.Bytes(map[string]any{
		"format": evaluationOptionalFactAuthorityCommandFormat, "version": int64(1),
		"attemptId": "attempt/optional/1", "turnIndex": int64(0),
		"authorityRequestDigest": evaluationOptionalFactTestDigest(t, "missing-header-request"),
		"sourceSealDigest":       evaluationOptionalFactTestDigest(t, "missing-header-source"),
		"stageDigest":            evaluationOptionalFactTestDigest(t, "missing-header-stage"),
	})
	request := httptest.NewRequest(http.MethodPost, "/optional-capability-facts/reconcile", strings.NewReader(string(commandBytes)))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.handleEvaluationOptionalFactAuthority(response, request, EvaluationPlanPartition{
		PlanDigest: evaluationOptionalFactTestDigest(t, "missing-header-plan"), RepositoryCommit: strings.Repeat("b", 40),
	}, []string{"optional-capability-facts", "reconcile"})
	if response.Code != http.StatusBadRequest || repository.getCalls != 0 || repository.sealCalls != 0 {
		t.Fatalf("missing idempotency key reached repository: status=%d get=%d seal=%d", response.Code, repository.getCalls, repository.sealCalls)
	}
	var errorResponse map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &errorResponse); err != nil || errorResponse["code"] != "EVAL-9001" {
		t.Fatalf("unexpected missing header response: %s", response.Body.String())
	}
}

func TestEvaluationOptionalFactCrossOwnerStageAndAckDigestVector(t *testing.T) {
	fixedDigest := func(character string) string { return "sha256-" + strings.Repeat(character, 64) }
	request := evaluationOptionalFactAuthorityRequest{
		AttemptID: "attempt/vector/1", DescriptorDigest: fixedDigest("7"),
		TargetID: "target/vector/1", TargetDigest: fixedDigest("8"),
		CapabilityProfileID: "profile/vector/1", CapabilityProfileDigest: fixedDigest("9"),
		CapabilityDescriptorDigest: fixedDigest("a"), CapabilityID: "provider.isolated-cache",
		SupportExpectation: "required", TurnIndex: 2, InvocationID: "invocation/vector/1",
		ProtocolFamily: "openai-responses", ProviderConfigurationID: "provider/vector/1",
		ModelID: "model/vector/1", ModelLineageDigest: fixedDigest("b"), AdapterDigest: fixedDigest("c"),
		Source:                 evaluationOptionalFactAuthoritySource{Kind: "sealed-provider-response-metadata"},
		AuthorityRequestDigest: fixedDigest("1"),
	}
	target := EvaluationOptionalFactTargetAuthority{
		TargetID: request.TargetID, TargetDigest: request.TargetDigest,
		CapabilityProfileID: request.CapabilityProfileID, CapabilityProfileDigest: request.CapabilityProfileDigest,
		CapabilityDescriptorDigest: request.CapabilityDescriptorDigest, CapabilityID: request.CapabilityID,
		SupportExpectation: request.SupportExpectation, ProtocolFamily: request.ProtocolFamily,
		ProviderConfigurationID: request.ProviderConfigurationID, ModelID: request.ModelID,
		ModelLineageDigest: request.ModelLineageDigest, AdapterDigest: request.AdapterDigest,
		SourceKind: "sealed-provider-response-metadata", SourceAuthorityID: "owner/runtime/cache/1",
		SourceAuthorityImplementationDigest: fixedDigest("3"),
		SourceAuthorityRouteBinding:         "provider/cache/runtime/execute",
		RegistrationAuthorityIssuerID:       evaluationServiceAuthorityPrincipal,
		RegistrationReceiptDigest:           fixedDigest("4"), TargetAuthorityDigest: fixedDigest("2"),
	}
	evidence := EvaluationOptionalFactSourceEvidence{
		Target: target, Kind: target.SourceKind, SourceDigest: fixedDigest("5"), Outcome: "observed",
		FactKind: "provider-cache-receipt", FactDigest: fixedDigest("6"),
	}
	stageDigest, err := evaluationOptionalFactStageDigest(request, evidence)
	if err != nil {
		t.Fatal(err)
	}
	if expected := "sha256-8a8d010509340b1dca6fa500a7c58611d1df512799c81659c0f5c047b658cca0"; stageDigest != expected {
		t.Fatalf("stage digest=%s, want cross-owner vector %s", stageDigest, expected)
	}
	ackDigest, err := evaluationOptionalFactDispatchAckDigest(
		request, evidence, stageDigest, "observed", time.Date(2026, 8, 9, 6, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	if expected := "sha256-44973b7804b22ca27882334b12b1fc38840bfd11696d313408921a631300fcdb"; ackDigest != expected {
		t.Fatalf("ACK digest=%s, want cross-owner vector %s", ackDigest, expected)
	}
}
