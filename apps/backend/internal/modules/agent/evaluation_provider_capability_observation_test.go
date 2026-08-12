package agent

import (
	"bytes"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func recomputeEvaluationProviderObservationTestDigest(t *testing.T, value map[string]any, field string) {
	t.Helper()
	delete(value, field)
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value[field] = digest
}

func recomputeEvaluationProviderObservationReceiptDigests(t *testing.T, value map[string]any) {
	t.Helper()
	rawFacts, ok := value["facts"].([]any)
	if !ok {
		t.Fatal("provider observation facts are invalid")
	}
	factDigests := make([]any, len(rawFacts))
	factAuthorityDigests := make([]any, len(rawFacts))
	factAuthorities := make([]any, len(rawFacts))
	runtimeFactEnvelopeDigests := make([]string, len(rawFacts))
	authorityDigests := make([]string, len(rawFacts))
	for index, raw := range rawFacts {
		fact, ok := raw.(map[string]any)
		if !ok {
			t.Fatal("provider observation fact is invalid")
		}
		factDigests[index] = map[string]any{
			"factKind": fact["factKind"], "factDigest": fact["factDigest"],
		}
		factKind, factDigest := stringMember(fact, "factKind"), stringMember(fact, "factDigest")
		sourceAuthorityKind := "shared-durable-capability"
		sourceAuthorityID := "shared-capability.test"
		sourceAuthorityImplementationDigest := evaluationBoundedExportTestDigest(t, "observation-source-authority-implementation")
		var sourceKind any = "sealed-provider-response-metadata"
		var routeBinding any = "provider-capability.runtime-fact-source"
		var registrationAuthorityIssuerID any = "service.authority/agent-evaluation-ledger"
		var registrationReceiptDigest any = evaluationBoundedExportTestDigest(t, "observation-source-registration")
		var runtimeFactSourceAuthorityDigest any = evaluationBoundedExportTestDigest(t, "observation-runtime-source-authority")
		if factKind == "retrieval-query-receipt" {
			sourceKind = "sealed-hosted-owner-result"
		}
		stageDigest := evaluationBoundedExportTestDigest(t, "observation-source-stage")
		dispatchAckDigest := evaluationBoundedExportTestDigest(t, "observation-source-dispatch-ack")
		if factKind == "provider-event" || factKind == "usage-vector" {
			sourceAuthorityKind = "native-provider-transport"
			sourceAuthorityID = stringMember(value, "providerConfigurationId")
			sourceAuthorityImplementationDigest = stringMember(value, "adapterDigest")
			sourceKind, routeBinding, registrationAuthorityIssuerID = nil, nil, nil
			registrationReceiptDigest, runtimeFactSourceAuthorityDigest = nil, nil
			stageDigest = stringMember(value, "dispatchIntentDigest")
			dispatchAckDigest = stringMember(value, "transportReceiptDigest")
		}
		runtimeEnvelopeBase := map[string]any{
			"format": "prodivix.agent-evaluation-provider-capability-runtime-fact-envelope", "version": int64(1),
			"sourceAuthorityKind": sourceAuthorityKind, "sourceAuthorityId": sourceAuthorityID,
			"sourceAuthorityImplementationDigest": sourceAuthorityImplementationDigest,
			"sourceKind":                          sourceKind,
			"routeBinding":                        routeBinding,
			"registrationAuthorityIssuerId":       registrationAuthorityIssuerID,
			"registrationReceiptDigest":           registrationReceiptDigest,
			"runtimeFactSourceAuthorityDigest":    runtimeFactSourceAuthorityDigest,
			"stageDigest":                         stageDigest,
			"dispatchAckDigest":                   dispatchAckDigest,
			"planDigest":                          value["planDigest"],
			"repositoryCommit":                    value["repositoryCommit"],
			"attemptId":                           value["attemptId"],
			"descriptorDigest":                    value["descriptorDigest"],
			"turnIndex":                           value["turnIndex"],
			"invocationId":                        value["invocationId"],
			"requestDigest":                       value["requestDigest"],
			"responseDigest":                      value["responseDigest"],
			"protocolFamily":                      value["protocolFamily"],
			"providerConfigurationId":             value["providerConfigurationId"],
			"modelLineageDigest":                  value["modelLineageDigest"],
			"adapterDigest":                       value["adapterDigest"],
			"dispatchIntentDigest":                value["dispatchIntentDigest"],
			"transportReceiptDigest":              value["transportReceiptDigest"],
			"resultSpoolReceiptDigest":            value["resultSpoolReceiptDigest"],
			"normalizedEventSetDigest":            value["normalizedEventSetDigest"],
			"observedAt":                          value["observedAt"],
			"fact":                                fact,
		}
		runtimeFactEnvelopeDigest, err := canonicaljson.Digest(runtimeEnvelopeBase)
		if err != nil {
			t.Fatalf("runtime fact envelope %d (%s): %v", index, fmt.Sprintf("%s/%s", factKind, factDigest), err)
		}
		authority := map[string]any{
			"format": "prodivix.agent-evaluation-provider-capability-fact-authority", "version": int64(1),
			"factKind": factKind, "factDigest": factDigest, "sourceAuthorityKind": sourceAuthorityKind,
			"sourceAuthorityId":                   sourceAuthorityID,
			"sourceAuthorityImplementationDigest": sourceAuthorityImplementationDigest,
			"sourceKind":                          sourceKind,
			"routeBinding":                        routeBinding,
			"registrationAuthorityIssuerId":       registrationAuthorityIssuerID,
			"registrationReceiptDigest":           registrationReceiptDigest,
			"runtimeFactSourceAuthorityDigest":    runtimeFactSourceAuthorityDigest,
			"stageDigest":                         stageDigest,
			"dispatchAckDigest":                   dispatchAckDigest,
			"transportReceiptDigest":              value["transportReceiptDigest"],
			"resultSpoolReceiptDigest":            value["resultSpoolReceiptDigest"],
			"normalizedEventSetDigest":            value["normalizedEventSetDigest"],
			"runtimeFactEnvelopeDigest":           runtimeFactEnvelopeDigest,
		}
		recomputeEvaluationProviderObservationTestDigest(t, authority, "authorityDigest")
		authorityDigest := stringMember(authority, "authorityDigest")
		factAuthorities[index], runtimeFactEnvelopeDigests[index], authorityDigests[index] =
			authority, runtimeFactEnvelopeDigest, authorityDigest
		factAuthorityDigests[index] = map[string]any{
			"factKind": factKind, "factDigest": factDigest, "authorityDigest": authorityDigest,
		}
	}
	value["factAuthorities"] = factAuthorities
	selectedRuntimeFactEnvelopeSetDigest, err := canonicaljson.Digest(map[string]any{
		"runtimeFactEnvelopeDigests": runtimeFactEnvelopeDigests,
	})
	if err != nil {
		t.Fatal(err)
	}
	sourceAuthoritySetDigest, err := canonicaljson.Digest(map[string]any{"authorityDigests": authorityDigests})
	if err != nil {
		t.Fatal(err)
	}
	value["selectedRuntimeFactEnvelopeSetDigest"] = selectedRuntimeFactEnvelopeSetDigest
	value["sourceAuthoritySetDigest"] = sourceAuthoritySetDigest
	projection := map[string]any{
		"planDigest": value["planDigest"], "repositoryCommit": value["repositoryCommit"],
		"attemptId": value["attemptId"], "descriptorDigest": value["descriptorDigest"],
		"turnIndex": value["turnIndex"], "invocationId": value["invocationId"],
		"requestDigest": value["requestDigest"], "responseDigest": value["responseDigest"],
		"protocolFamily":                       value["protocolFamily"],
		"providerConfigurationId":              value["providerConfigurationId"],
		"modelLineageDigest":                   value["modelLineageDigest"],
		"adapterDigest":                        value["adapterDigest"],
		"dispatchIntentDigest":                 value["dispatchIntentDigest"],
		"transportReceiptDigest":               value["transportReceiptDigest"],
		"resultSpoolReceiptDigest":             value["resultSpoolReceiptDigest"],
		"normalizedEventSetDigest":             value["normalizedEventSetDigest"],
		"selectedRuntimeFactEnvelopeSetDigest": selectedRuntimeFactEnvelopeSetDigest,
		"sourceAuthoritySetDigest":             sourceAuthoritySetDigest,
		"factDigests":                          factDigests,
		"factAuthorityDigests":                 factAuthorityDigests,
	}
	observationDigest, err := canonicaljson.Digest(projection)
	if err != nil {
		t.Fatal(err)
	}
	value["observationDigest"] = observationDigest
	recomputeEvaluationProviderObservationTestDigest(t, value, "receiptDigest")
}

// recomputeEvaluationProviderObservationAuthorityCommitments preserves the
// caller-selected authority fields while rebuilding every downstream digest.
// Negative tests use it to prove that a complete self-consistent swap still
// fails the semantic native/shared authority rules.
func recomputeEvaluationProviderObservationAuthorityCommitments(t *testing.T, value map[string]any) {
	t.Helper()
	rawFacts, factsOK := value["facts"].([]any)
	rawAuthorities, authoritiesOK := value["factAuthorities"].([]any)
	if !factsOK || !authoritiesOK || len(rawFacts) != len(rawAuthorities) {
		t.Fatal("provider observation authority fixture is invalid")
	}
	factDigests := make([]any, len(rawFacts))
	factAuthorityDigests := make([]any, len(rawFacts))
	runtimeFactEnvelopeDigests := make([]string, len(rawFacts))
	authorityDigests := make([]string, len(rawFacts))
	for index := range rawFacts {
		fact, factOK := rawFacts[index].(map[string]any)
		authority, authorityOK := rawAuthorities[index].(map[string]any)
		if !factOK || !authorityOK {
			t.Fatal("provider observation authority member is invalid")
		}
		factKind, factDigest := stringMember(fact, "factKind"), stringMember(fact, "factDigest")
		runtimeEnvelopeBase := map[string]any{
			"format": "prodivix.agent-evaluation-provider-capability-runtime-fact-envelope", "version": int64(1),
			"sourceAuthorityKind":                 authority["sourceAuthorityKind"],
			"sourceAuthorityId":                   authority["sourceAuthorityId"],
			"sourceAuthorityImplementationDigest": authority["sourceAuthorityImplementationDigest"],
			"sourceKind":                          authority["sourceKind"],
			"routeBinding":                        authority["routeBinding"],
			"registrationAuthorityIssuerId":       authority["registrationAuthorityIssuerId"],
			"registrationReceiptDigest":           authority["registrationReceiptDigest"],
			"runtimeFactSourceAuthorityDigest":    authority["runtimeFactSourceAuthorityDigest"],
			"stageDigest":                         authority["stageDigest"],
			"dispatchAckDigest":                   authority["dispatchAckDigest"],
			"planDigest":                          value["planDigest"],
			"repositoryCommit":                    value["repositoryCommit"],
			"attemptId":                           value["attemptId"],
			"descriptorDigest":                    value["descriptorDigest"],
			"turnIndex":                           value["turnIndex"],
			"invocationId":                        value["invocationId"],
			"requestDigest":                       value["requestDigest"],
			"responseDigest":                      value["responseDigest"],
			"protocolFamily":                      value["protocolFamily"],
			"providerConfigurationId":             value["providerConfigurationId"],
			"modelLineageDigest":                  value["modelLineageDigest"],
			"adapterDigest":                       value["adapterDigest"],
			"dispatchIntentDigest":                value["dispatchIntentDigest"],
			"transportReceiptDigest":              value["transportReceiptDigest"],
			"resultSpoolReceiptDigest":            value["resultSpoolReceiptDigest"],
			"normalizedEventSetDigest":            value["normalizedEventSetDigest"],
			"observedAt":                          value["observedAt"],
			"fact":                                fact,
		}
		runtimeDigest, err := canonicaljson.Digest(runtimeEnvelopeBase)
		if err != nil {
			t.Fatal(err)
		}
		authority["runtimeFactEnvelopeDigest"] = runtimeDigest
		recomputeEvaluationProviderObservationTestDigest(t, authority, "authorityDigest")
		authorityDigest := stringMember(authority, "authorityDigest")
		factDigests[index] = map[string]any{"factKind": factKind, "factDigest": factDigest}
		factAuthorityDigests[index] = map[string]any{
			"factKind": factKind, "factDigest": factDigest, "authorityDigest": authorityDigest,
		}
		runtimeFactEnvelopeDigests[index], authorityDigests[index] = runtimeDigest, authorityDigest
	}
	selectedRoot, err := canonicaljson.Digest(map[string]any{"runtimeFactEnvelopeDigests": runtimeFactEnvelopeDigests})
	if err != nil {
		t.Fatal(err)
	}
	sourceRoot, err := canonicaljson.Digest(map[string]any{"authorityDigests": authorityDigests})
	if err != nil {
		t.Fatal(err)
	}
	value["selectedRuntimeFactEnvelopeSetDigest"], value["sourceAuthoritySetDigest"] = selectedRoot, sourceRoot
	observationProjection := map[string]any{
		"planDigest": value["planDigest"], "repositoryCommit": value["repositoryCommit"],
		"attemptId": value["attemptId"], "descriptorDigest": value["descriptorDigest"],
		"turnIndex": value["turnIndex"], "invocationId": value["invocationId"],
		"requestDigest": value["requestDigest"], "responseDigest": value["responseDigest"],
		"protocolFamily": value["protocolFamily"], "providerConfigurationId": value["providerConfigurationId"],
		"modelLineageDigest": value["modelLineageDigest"], "adapterDigest": value["adapterDigest"],
		"dispatchIntentDigest": value["dispatchIntentDigest"], "transportReceiptDigest": value["transportReceiptDigest"],
		"resultSpoolReceiptDigest": value["resultSpoolReceiptDigest"], "normalizedEventSetDigest": value["normalizedEventSetDigest"],
		"selectedRuntimeFactEnvelopeSetDigest": selectedRoot, "sourceAuthoritySetDigest": sourceRoot,
		"factDigests": factDigests, "factAuthorityDigests": factAuthorityDigests,
	}
	observationDigest, err := canonicaljson.Digest(observationProjection)
	if err != nil {
		t.Fatal(err)
	}
	value["observationDigest"] = observationDigest
	recomputeEvaluationProviderObservationTestDigest(t, value, "receiptDigest")
}

func evaluationProviderObservationTurnBindingFixture(t *testing.T) (
	decodedEvaluationAttemptEvidenceCommitV3,
	EvaluationProviderCapabilityObservationReceiptRecord,
) {
	t.Helper()
	digest := func(label string) string { return evaluationBoundedExportTestDigest(t, label) }
	startedAt := time.Date(2026, 8, 9, 0, 0, 0, 0, time.UTC)
	completedAt := startedAt.Add(time.Second)
	observation := EvaluationProviderCapabilityObservationReceiptRecord{
		PlanDigest: digest("observation-plan"), RepositoryCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		ObservationReceiptID: "observation-receipt.test", AttemptID: "evaluation-attempt.test",
		DescriptorDigest: digest("observation-descriptor"), TurnIndex: 0, InvocationID: "invocation.test",
		RequestDigest: digest("observation-request"), ResponseDigest: digest("observation-response"),
		ProtocolFamily: "openai-responses", ProviderConfigurationID: "provider.test",
		ModelLineageDigest: digest("observation-model"), AdapterDigest: digest("observation-adapter"),
		DispatchIntentDigest: digest("observation-intent"), TransportReceiptDigest: digest("observation-transport"),
		ResultSpoolReceiptDigest: digest("observation-spool"), NormalizedEventSetDigest: digest("observation-events"),
		ObservationDigest: digest("observation"), ObservedAt: startedAt.Add(500 * time.Millisecond),
		ReceiptDigest: digest("observation-receipt"),
	}
	decoded := decodedEvaluationAttemptEvidenceCommitV3{
		attempt: evaluationAttemptFact{
			PlanDigest: observation.PlanDigest, AttemptID: observation.AttemptID,
			DescriptorDigest: observation.DescriptorDigest, StartedAt: startedAt, CompletedAt: completedAt,
		},
		turnSet: evaluationInvocationTurnSetReceipt{EvaluationInvocationTurnSetReceiptRecord: EvaluationInvocationTurnSetReceiptRecord{
			RepositoryCommit: observation.RepositoryCommit,
		}},
		turns: []evaluationInvocationTurnReceipt{{
			EvaluationInvocationTurnReceiptRecord: EvaluationInvocationTurnReceiptRecord{
				PlanDigest: observation.PlanDigest, RepositoryCommit: observation.RepositoryCommit,
				AttemptID: observation.AttemptID, DescriptorDigest: observation.DescriptorDigest,
				TurnIndex: observation.TurnIndex, InvocationID: observation.InvocationID,
				DispatchIntentDigest:             observation.DispatchIntentDigest,
				TransportReceiptDigest:           observation.TransportReceiptDigest,
				ProviderResultSpoolReceiptDigest: observation.ResultSpoolReceiptDigest,
			},
			Invocation: &evaluationTurnInvocation{
				InvocationID: observation.InvocationID, ProviderConfigurationID: observation.ProviderConfigurationID,
				ProtocolFamily: observation.ProtocolFamily, ModelLineageDigest: observation.ModelLineageDigest,
				RequestDigest: observation.RequestDigest, ResponseDigest: observation.ResponseDigest,
			},
		}},
		spools: []EvaluationProviderResultSpoolReceiptRecord{{
			PlanDigest: observation.PlanDigest, RepositoryCommit: observation.RepositoryCommit,
			AttemptID: observation.AttemptID, DescriptorDigest: observation.DescriptorDigest,
			TurnIndex: observation.TurnIndex, InvocationID: observation.InvocationID,
			DispatchIntentDigest:     observation.DispatchIntentDigest,
			TransportReceiptDigest:   observation.TransportReceiptDigest,
			NormalizedEventSetDigest: observation.NormalizedEventSetDigest,
			ResponseDigest:           observation.ResponseDigest, ReceiptDigest: observation.ResultSpoolReceiptDigest,
		}},
	}
	return decoded, observation
}

func TestEvaluationProviderCapabilityObservationBindsExactDurableTurnAndSpool(t *testing.T) {
	decoded, observation := evaluationProviderObservationTurnBindingFixture(t)
	if err := validateEvaluationProviderCapabilityObservationTurnBinding(decoded, observation); err != nil {
		t.Fatalf("exact observation binding was rejected: %v", err)
	}
	tests := map[string]func(*EvaluationProviderCapabilityObservationReceiptRecord){
		"normalized-event-set-swap": func(value *EvaluationProviderCapabilityObservationReceiptRecord) {
			value.NormalizedEventSetDigest = evaluationBoundedExportTestDigest(t, "swapped-events")
		},
		"result-spool-swap": func(value *EvaluationProviderCapabilityObservationReceiptRecord) {
			value.ResultSpoolReceiptDigest = evaluationBoundedExportTestDigest(t, "swapped-spool")
		},
		"transport-swap": func(value *EvaluationProviderCapabilityObservationReceiptRecord) {
			value.TransportReceiptDigest = evaluationBoundedExportTestDigest(t, "swapped-transport")
		},
		"response-swap": func(value *EvaluationProviderCapabilityObservationReceiptRecord) {
			value.ResponseDigest = evaluationBoundedExportTestDigest(t, "swapped-response")
		},
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			candidate := observation
			mutate(&candidate)
			if err := validateEvaluationProviderCapabilityObservationTurnBinding(decoded, candidate); err == nil {
				t.Fatal("drifted provider observation was accepted")
			}
		})
	}
}

func TestEvaluationProviderCapabilityObservationBindsFrozenAdapterAndTarget(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil || len(planned) == 0 {
		t.Fatalf("planned attempts=%d err=%v", len(planned), err)
	}
	descriptor := planned[0].Descriptor
	target := evaluationPlanObjectByIdentity(
		plan.Value["capabilityQualificationTargets"], "targetId", stringMember(descriptor, "targetId"),
	)
	provider := evaluationPlanObjectByIdentity(
		plan.Value["providerConfigurations"], "providerConfigurationId", stringMember(target, "providerConfigurationId"),
	)
	adapter, adapterOK := objectMember(provider, "adapter")
	if target == nil || provider == nil || !adapterOK {
		t.Fatal("frozen observation target is incomplete")
	}
	observation := EvaluationProviderCapabilityObservationReceiptRecord{
		PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
		AttemptID: planned[0].AttemptID, DescriptorDigest: planned[0].DescriptorDigest,
		ProtocolFamily:          stringMember(target, "protocolFamily"),
		ProviderConfigurationID: stringMember(target, "providerConfigurationId"),
		ModelLineageDigest:      stringMember(target, "modelLineageDigest"),
		AdapterDigest:           stringMember(adapter, "adapterDigest"),
	}
	if err := validateEvaluationProviderCapabilityObservationPlanBinding(plan, descriptor, observation); err != nil {
		t.Fatalf("exact frozen target observation was rejected: %v", err)
	}
	observation.AdapterDigest = evaluationBoundedExportTestDigest(t, "swapped-adapter")
	if err := validateEvaluationProviderCapabilityObservationPlanBinding(plan, descriptor, observation); err == nil {
		t.Fatal("provider observation accepted a swapped adapter")
	}
}

func TestEvaluationProviderCapabilityObservationBindsRegisteredRuntimeFactSource(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		t.Fatal(err)
	}
	var descriptor, target, provider, runtimeAuthority map[string]any
	var attemptID, descriptorDigest string
	for _, candidate := range planned {
		candidateTarget := evaluationPlanObjectByIdentity(
			plan.Value["capabilityQualificationTargets"], "targetId", stringMember(candidate.Descriptor, "targetId"),
		)
		optional, optionalOK := objectMember(candidateTarget, "optionalCapabilitySupportAuthority")
		runtime, runtimeOK := objectMember(optional, "runtimeFactSourceAuthority")
		if !optionalOK || !runtimeOK {
			continue
		}
		descriptor, target, runtimeAuthority = candidate.Descriptor, candidateTarget, runtime
		attemptID, descriptorDigest = candidate.AttemptID, candidate.DescriptorDigest
		provider = evaluationPlanObjectByIdentity(
			plan.Value["providerConfigurations"], "providerConfigurationId", stringMember(target, "providerConfigurationId"),
		)
		break
	}
	adapter, adapterOK := objectMember(provider, "adapter")
	if descriptor == nil || target == nil || runtimeAuthority == nil || provider == nil || !adapterOK {
		t.Fatal("frozen plan has no registered optional runtime fact source")
	}
	factAuthority := map[string]any{
		"sourceAuthorityKind":                 "shared-durable-capability",
		"sourceAuthorityId":                   runtimeAuthority["sourceAuthorityId"],
		"sourceAuthorityImplementationDigest": runtimeAuthority["sourceAuthorityImplementationDigest"],
		"sourceKind":                          runtimeAuthority["sourceKind"],
		"routeBinding":                        runtimeAuthority["routeBinding"],
		"registrationAuthorityIssuerId":       runtimeAuthority["registrationAuthorityIssuerId"],
		"registrationReceiptDigest":           runtimeAuthority["registrationReceiptDigest"],
		"runtimeFactSourceAuthorityDigest":    runtimeAuthority["authorityDigest"],
	}
	record := EvaluationProviderCapabilityObservationReceiptRecord{
		PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
		AttemptID: attemptID, DescriptorDigest: descriptorDigest,
		ProtocolFamily: stringMember(target, "protocolFamily"), ProviderConfigurationID: stringMember(target, "providerConfigurationId"),
		ModelLineageDigest: stringMember(target, "modelLineageDigest"), AdapterDigest: stringMember(adapter, "adapterDigest"),
		Value: map[string]any{"factAuthorities": []any{factAuthority}},
	}
	if err := validateEvaluationProviderCapabilityObservationPlanBinding(plan, descriptor, record); err != nil {
		t.Fatalf("registered runtime fact source observation was rejected: %v", err)
	}
	factAuthority["registrationReceiptDigest"] = evaluationBoundedExportTestDigest(t, "swapped-runtime-source-registration")
	if err := validateEvaluationProviderCapabilityObservationPlanBinding(plan, descriptor, record); err == nil {
		t.Fatal("provider observation accepted a swapped runtime source registration")
	}
}

func TestEvaluationProviderCapabilityObservationNativeAuthorityRequiresNullRuntimeSourceFields(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	_, envelope, _ := evaluationAttemptAuthorityTestRequest(
		t, plan, evaluationBoundedExportTestDigest(t, "observation-native-provenance-owner"),
	)
	payload, payloadOK := objectMember(envelope, "payload")
	receiptValue, receiptOK := objectMember(payload, "providerCapabilityObservationReceipt")
	if !payloadOK || !receiptOK {
		t.Fatalf("native provenance fixture is invalid: payload=%v receipt=%v", payloadOK, receiptOK)
	}
	candidate := evaluationArchiveTestObject(t, receiptValue)
	event := map[string]any{
		"eventId": "event/native-provenance", "invocationId": candidate["invocationId"],
		"sequence": int64(0), "type": "completed", "payloadDigest": candidate["responseDigest"],
		"occurredAt": candidate["observedAt"],
	}
	recomputeEvaluationProviderObservationTestDigest(t, event, "eventDigest")
	candidate["facts"] = []any{map[string]any{
		"factKind": "provider-event", "factDigest": event["eventDigest"], "value": event,
	}}
	recomputeEvaluationProviderObservationReceiptDigests(t, candidate)
	encoded, err := canonicaljson.Bytes(candidate)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationProviderCapabilityObservationReceipt(encoded); err != nil {
		t.Fatalf("native provider authority with exact null runtime source fields was rejected: %v", err)
	}
	authorities := candidate["factAuthorities"].([]any)
	authority := authorities[0].(map[string]any)
	for _, field := range []string{
		"sourceKind", "routeBinding", "registrationAuthorityIssuerId",
		"registrationReceiptDigest", "runtimeFactSourceAuthorityDigest",
	} {
		if authority[field] != nil {
			t.Fatalf("native provider authority %s=%v, want null", field, authority[field])
		}
	}
	authority["sourceKind"] = "sealed-provider-response-metadata"
	authority["routeBinding"] = "provider-capability.runtime-fact-source"
	authority["registrationAuthorityIssuerId"] = "service.authority/agent-evaluation-ledger"
	authority["registrationReceiptDigest"] = evaluationBoundedExportTestDigest(t, "forged-native-registration")
	authority["runtimeFactSourceAuthorityDigest"] = evaluationBoundedExportTestDigest(t, "forged-native-runtime-source")
	recomputeEvaluationProviderObservationAuthorityCommitments(t, candidate)
	forged, err := canonicaljson.Bytes(candidate)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationProviderCapabilityObservationReceipt(forged); err == nil {
		t.Fatal("native provider authority accepted fully recomputed shared runtime source fields")
	}
}

func TestEvaluationProviderCapabilityObservationReceiptBoundsAndPerTurnCardinality(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	_, envelope, _ := evaluationAttemptAuthorityTestRequest(
		t, plan, evaluationBoundedExportTestDigest(t, "observation-bounds-owner"),
	)
	payload, payloadOK := objectMember(envelope, "payload")
	receiptValue, receiptOK := objectMember(payload, "providerCapabilityObservationReceipt")
	receiptBytes, err := canonicaljson.Bytes(receiptValue)
	if !payloadOK || !receiptOK || err != nil {
		t.Fatalf("observation fixture is invalid: payload=%v receipt=%v err=%v", payloadOK, receiptOK, err)
	}
	receipt, err := decodeEvaluationProviderCapabilityObservationReceipt(receiptBytes)
	if err != nil || len(receiptBytes) > maximumEvaluationProviderCapabilityObservationBytes {
		t.Fatalf("bounded sanitized observation was rejected: bytes=%d err=%v", len(receiptBytes), err)
	}
	tooManyFacts := cloneEvaluationObject(receiptValue)
	tooManyFacts["facts"] = []any{map[string]any{}, map[string]any{}, map[string]any{}}
	tooManyFactBytes, err := canonicaljson.Bytes(tooManyFacts)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationProviderCapabilityObservationReceipt(tooManyFactBytes); err == nil {
		t.Fatal("provider observation accepted more than two sanitized facts")
	}
	if _, err := decodeEvaluationProviderCapabilityObservationReceipt(
		bytes.Repeat([]byte{'x'}, maximumEvaluationProviderCapabilityObservationBytes+1),
	); err == nil {
		t.Fatal("provider observation accepted more than 16 KiB")
	}
	if _, err := evaluationProviderCapabilityObservationReceiptSetDigest([]EvaluationProviderCapabilityObservationReceiptRecord{
		receipt, receipt,
	}); err == nil {
		t.Fatal("provider observation set accepted two receipts for one attempt turn")
	}
}

func TestEvaluationProviderCapabilityObservationRejectsCredentialLikeNestedText(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	_, envelope, _ := evaluationAttemptAuthorityTestRequest(
		t, plan, evaluationBoundedExportTestDigest(t, "observation-sanitizer-owner"),
	)
	payload, payloadOK := objectMember(envelope, "payload")
	receiptValue, receiptOK := objectMember(payload, "providerCapabilityObservationReceipt")
	if !payloadOK || !receiptOK {
		t.Fatalf("observation sanitizer fixture is invalid: payload=%v receipt=%v", payloadOK, receiptOK)
	}
	base := evaluationArchiveTestObject(t, receiptValue)
	tests := []struct {
		name       string
		safe       string
		credential string
		build      func(string) (string, map[string]any)
	}{
		{
			name: "opaque.encryptedBlobRef", safe: "encrypted-ref.sanitized",
			credential: "sk-providerCapabilitySecret123456",
			build: func(encryptedBlobRef string) (string, map[string]any) {
				fact := map[string]any{
					"continuationId": "continuation.observation-sanitizer", "encryptedBlobRef": encryptedBlobRef,
					"providerConfigurationId": base["providerConfigurationId"],
					"modelLineageDigest":      base["modelLineageDigest"],
					"taskId":                  "task.observation-sanitizer", "runId": "run.observation-sanitizer",
					"generation": int64(1), "parentInvocationId": base["invocationId"],
					"purpose":   "provider-tool-loop-continuation",
					"createdAt": "2026-08-08T00:00:00.000Z", "expiresAt": "2026-08-08T00:05:00.000Z",
				}
				recomputeEvaluationProviderObservationTestDigest(t, fact, "continuationDigest")
				return "opaque-continuation", fact
			},
		},
		{
			name: "cache.providerRegion", safe: "us-east-1",
			credential: "Bearer providerCapabilitySecret123456",
			build: func(providerRegion string) (string, map[string]any) {
				fact := map[string]any{
					"cacheMode": "prompt", "cacheScope": "invocation", "provenIsolation": "invocation",
					"prefixOrItemDigests": []any{evaluationBoundedExportTestDigest(t, "observation-cache-prefix")},
					"usageRef":            "usage.observation-sanitizer", "providerRegion": providerRegion,
				}
				recomputeEvaluationProviderObservationTestDigest(t, fact, "receiptDigest")
				return "provider-cache-receipt", fact
			},
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			candidate := func(text string) map[string]any {
				value := evaluationArchiveTestObject(t, base)
				kind, fact := testCase.build(text)
				digestField := "receiptDigest"
				if kind == "opaque-continuation" {
					digestField = "continuationDigest"
				}
				value["facts"] = []any{map[string]any{
					"factKind": kind, "factDigest": fact[digestField], "value": fact,
				}}
				recomputeEvaluationProviderObservationReceiptDigests(t, value)
				return value
			}

			safeBytes, err := canonicaljson.Bytes(candidate(testCase.safe))
			if err != nil {
				t.Fatal(err)
			}
			if _, err := decodeEvaluationProviderCapabilityObservationReceipt(safeBytes); err != nil {
				t.Fatalf("sanitized nested observation was rejected: %v", err)
			}

			credentialBytes, err := canonicaljson.Bytes(candidate(testCase.credential))
			if err != nil {
				t.Fatal(err)
			}
			if _, err := decodeEvaluationProviderCapabilityObservationReceipt(credentialBytes); err == nil ||
				!strings.Contains(err.Error(), "not sanitized") {
				t.Fatalf("credential-like nested observation error=%v", err)
			}
		})
	}
}

func TestEvaluationProviderCapabilityObservationRequiresExactCacheUsageIdentity(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	_, envelope, _ := evaluationAttemptAuthorityTestRequest(
		t, plan, evaluationBoundedExportTestDigest(t, "observation-cache-usage-identity-owner"),
	)
	payload, payloadOK := objectMember(envelope, "payload")
	receiptValue, receiptOK := objectMember(payload, "providerCapabilityObservationReceipt")
	if !payloadOK || !receiptOK {
		t.Fatalf("observation cache identity fixture is invalid: payload=%v receipt=%v", payloadOK, receiptOK)
	}
	candidate := evaluationArchiveTestObject(t, receiptValue)
	fact := map[string]any{
		"cacheMode": "prompt", "cacheScope": "invocation", "provenIsolation": "invocation",
		"prefixOrItemDigests": []any{evaluationBoundedExportTestDigest(t, "observation-cache-identity-prefix")},
		"usageRef":            "usage ref with spaces",
	}
	recomputeEvaluationProviderObservationTestDigest(t, fact, "receiptDigest")
	candidate["facts"] = []any{map[string]any{
		"factKind": "provider-cache-receipt", "factDigest": fact["receiptDigest"], "value": fact,
	}}
	recomputeEvaluationProviderObservationReceiptDigests(t, candidate)
	encoded, err := canonicaljson.Bytes(candidate)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationProviderCapabilityObservationReceipt(encoded); err == nil {
		t.Fatal("provider cache observation accepted a non-canonical usageRef identity")
	}
}

func TestEvaluationCapabilityDenialRequiresExactObservedProviderAbsence(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	_, envelope, responseBytes := evaluationAttemptAuthorityTestRequest(
		t, plan, evaluationBoundedExportTestDigest(t, "denial-observation-owner"),
	)
	payload, payloadOK := objectMember(envelope, "payload")
	observationValue, observationOK := objectMember(payload, "providerCapabilityObservationReceipt")
	observationBytes, err := canonicaljson.Bytes(observationValue)
	if !payloadOK || !observationOK || err != nil {
		t.Fatalf("denial observation fixture is invalid: payload=%v observation=%v err=%v", payloadOK, observationOK, err)
	}
	observation, err := decodeEvaluationProviderCapabilityObservationReceipt(observationBytes)
	if err != nil {
		t.Fatal(err)
	}
	response, err := decodeCanonicalEvaluationObject(responseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil {
		t.Fatal(err)
	}
	rawSpecifics, ok := response["specificReceipts"].([]any)
	if !ok || len(rawSpecifics) != 1 {
		t.Fatalf("denial response specifics = %#v", response["specificReceipts"])
	}
	specificValue, ok := rawSpecifics[0].(map[string]any)
	if !ok {
		t.Fatal("denial specific receipt is invalid")
	}
	specificBytes, err := canonicaljson.Bytes(specificValue)
	if err != nil {
		t.Fatal(err)
	}
	specific, err := decodeEvaluationCapabilitySpecificReceipt(specificBytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateEvaluationCapabilitySpecificProviderObservation(specific, observation); err != nil {
		t.Fatalf("exact denial observation was rejected: %v", err)
	}

	missingObservation := evaluationArchiveTestObject(t, specific.Value)
	delete(missingObservation, "providerCapabilityObservationReceiptDigest")
	recomputeEvaluationProviderObservationTestDigest(t, missingObservation, "receiptDigest")
	missingBytes, err := canonicaljson.Bytes(missingObservation)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationCapabilitySpecificReceipt(missingBytes); err == nil {
		t.Fatal("capability denial without a provider observation was accepted")
	}

	swappedValue := evaluationArchiveTestObject(t, specific.Value)
	swappedValue["providerCapabilityObservationReceiptDigest"] = evaluationBoundedExportTestDigest(t, "swapped-denial-observation")
	recomputeEvaluationProviderObservationTestDigest(t, swappedValue, "receiptDigest")
	swappedBytes, err := canonicaljson.Bytes(swappedValue)
	if err != nil {
		t.Fatal(err)
	}
	swapped, err := decodeEvaluationCapabilitySpecificReceipt(swappedBytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateEvaluationCapabilitySpecificProviderObservation(swapped, observation); err == nil {
		t.Fatal("capability denial accepted a swapped provider observation")
	}

	responseSwap := observation
	responseSwap.ResponseDigest = evaluationBoundedExportTestDigest(t, "swapped-denial-response")
	if err := validateEvaluationCapabilitySpecificProviderObservation(specific, responseSwap); err == nil {
		t.Fatal("capability denial accepted a swapped observed response")
	}

	supportFact := observation
	supportFact.Value = evaluationArchiveTestObject(t, observation.Value)
	facts := append([]any(nil), supportFact.Value["facts"].([]any)...)
	facts = append(facts, map[string]any{
		"factKind": "provider-job-receipt", "factDigest": evaluationBoundedExportTestDigest(t, "synthetic-supported-job"),
		"value": map[string]any{},
	})
	supportFact.Value["facts"] = facts
	if err := validateEvaluationCapabilitySpecificProviderObservation(specific, supportFact); err == nil {
		t.Fatal("capability unavailable accepted a support fact")
	}
}

func TestEvaluationCapabilitySpecificReceiptAcceptsCurrentSlashControlIdentities(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	_, _, responseBytes := evaluationAttemptAuthorityTestRequest(
		t, plan, evaluationBoundedExportTestDigest(t, "slash-specific-owner"),
	)
	response, err := decodeCanonicalEvaluationObject(responseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil {
		t.Fatal(err)
	}
	rawSpecifics, ok := response["specificReceipts"].([]any)
	if !ok || len(rawSpecifics) == 0 {
		t.Fatal("specific receipt fixture is missing")
	}
	value := evaluationArchiveTestObject(t, rawSpecifics[0])
	for field, replacement := range map[string]string{
		"receiptId": "receipt/specific.1", "attemptId": "attempt/specific.1",
		"caseId": "case/specific.1", "invocationId": "invocation/specific.1",
		"toolId": "tool/specific.1", "toolCallId": "tool-call/specific.1",
		"providerToolCallId": "provider-tool-call/specific.1",
	} {
		if _, exists := value[field]; exists || field != "providerToolCallId" {
			value[field] = replacement
		}
	}
	recomputeEvaluationProviderObservationTestDigest(t, value, "receiptDigest")
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationCapabilitySpecificReceipt(encoded); err != nil {
		t.Fatalf("slash-bearing capability-specific control identities were rejected: %v", err)
	}
	value["receiptId"] = "receipt unsafe"
	recomputeEvaluationProviderObservationTestDigest(t, value, "receiptDigest")
	encoded, _ = canonicaljson.Bytes(value)
	if _, err := decodeEvaluationCapabilitySpecificReceipt(encoded); err == nil {
		t.Fatal("unsafe capability-specific control identity was accepted")
	}
}
