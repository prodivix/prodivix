package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationCapabilityProbeTestRepository struct {
	record             EvaluationCapabilityProbeAdmissionRecord
	claimCalls         int
	dispatchCalls      int
	ackCalls           int
	sealCalls          int
	referenceLoadCalls int
	referenceLoadError error
	referenceBundle    []byte
}

func (repository *evaluationCapabilityProbeTestRepository) LoadEvaluationCapabilityProbeReferenceBundle(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeAdmissionRequest,
	_ string,
	_ json.RawMessage,
) ([]byte, error) {
	repository.referenceLoadCalls++
	if repository.referenceLoadError != nil {
		return nil, repository.referenceLoadError
	}
	if len(repository.referenceBundle) == 0 {
		return nil, ErrConflict
	}
	return append([]byte(nil), repository.referenceBundle...), nil
}

func (repository *evaluationCapabilityProbeTestRepository) ClaimEvaluationCapabilityProbeAdmission(
	_ context.Context,
	_ EvaluationAuthority,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
	claimedAt time.Time,
) (EvaluationCapabilityProbeAdmissionRecord, bool, error) {
	repository.claimCalls++
	if repository.record.State != "" {
		return repository.record, true, nil
	}
	repository.record = EvaluationCapabilityProbeAdmissionRecord{
		NamespaceID: request.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		RequestDigest: request.RequestDigest, State: "claimed", ClaimGeneration: 1,
		OwnerImplementationDigest: ownerImplementationDigest, RequestBytes: append([]byte(nil), request.Bytes...),
		ClaimedAt: claimedAt,
	}
	return repository.record, false, nil
}

func (repository *evaluationCapabilityProbeTestRepository) MarkEvaluationCapabilityProbeAdmissionDispatched(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeAdmissionRequest,
	stageDigest string,
	dispatchedAt time.Time,
) (EvaluationCapabilityProbeAdmissionRecord, bool, error) {
	repository.dispatchCalls++
	repository.record.State, repository.record.StageDigest = "dispatched", stageDigest
	repository.record.DispatchedAt = dispatchedAt
	return repository.record, false, nil
}

func (repository *evaluationCapabilityProbeTestRepository) AcknowledgeEvaluationCapabilityProbeAdmission(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeAdmissionRequest,
	sealed evaluationCapabilityProbeAdmissionSealedValue,
	_ time.Time,
) (EvaluationCapabilityProbeAdmissionRecord, bool, error) {
	repository.ackCalls++
	if repository.referenceLoadCalls == 0 {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, ErrConflict
	}
	repository.record.DispatchAckDigest = sealed.DispatchAckDigest
	repository.record.AuthorityIssuerID = sealed.AuthorityIssuerID
	repository.record.OwnerAdmissionDigest = sealed.OwnerAdmissionDigest
	repository.record.ReferenceReceiptSetDigest = sealed.ReferenceReceiptSetDigest
	repository.record.EvidenceDigest = sealed.EvidenceDigest
	repository.record.ProbeReceiptDigest = sealed.ProbeReceiptDigest
	repository.record.ProbeStatus = sealed.ProbeStatus
	repository.record.ObservedProfileDigest = sealed.ObservedProfileDigest
	repository.record.ProbedAt, repository.record.ExpiresAt = sealed.ProbedAt, sealed.ExpiresAt
	repository.record.AdmissionReceiptDigest = sealed.AdmissionReceiptDigest
	repository.record.ResponseDigest = sealed.ResponseDigest
	repository.record.ReferenceBundleBytes = append([]byte(nil), sealed.ReferenceBundleBytes...)
	repository.record.ResponseBytes = append([]byte(nil), sealed.ResponseBytes...)
	return repository.record, false, nil
}

func (repository *evaluationCapabilityProbeTestRepository) SealEvaluationCapabilityProbeAdmission(
	_ context.Context,
	_ EvaluationAuthority,
	_ evaluationCapabilityProbeAdmissionRequest,
	responseDigest string,
	dispatchAckDigest string,
	sealedAt time.Time,
) (EvaluationCapabilityProbeAdmissionRecord, bool, error) {
	repository.sealCalls++
	if repository.record.ResponseDigest != responseDigest || repository.record.DispatchAckDigest != dispatchAckDigest {
		return EvaluationCapabilityProbeAdmissionRecord{}, false, ErrConflict
	}
	replayed := repository.record.State == "sealed"
	repository.record.State, repository.record.SealedAt = "sealed", sealedAt
	return repository.record, replayed, nil
}

type evaluationCapabilityProbeTestAuthority struct {
	implementationDigest string
	result               EvaluationCapabilityProbeAdmissionAuthorityResult
	stageCalls           int
	executeCalls         int
	reconcileCalls       int
}

func (authority *evaluationCapabilityProbeTestAuthority) CapabilityProbeAdmissionImplementationDigest() (string, bool) {
	return authority.implementationDigest, evaluationDigestPattern.MatchString(authority.implementationDigest)
}

func (authority *evaluationCapabilityProbeTestAuthority) StageCapabilityProbeAdmission(
	_ context.Context,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
) (string, error) {
	authority.stageCalls++
	value, err := decodeCanonicalEvaluationObject(request.Request, maximumEvaluationCapabilityProbeRequestBytes)
	if err != nil {
		return "", err
	}
	admission := evaluationCapabilityProbeAdmissionRequest{RequestDigest: stringMember(value, "requestDigest")}
	return evaluationCapabilityProbeStageDigest(admission, request.OwnerImplementationDigest)
}

func (authority *evaluationCapabilityProbeTestAuthority) ExecuteCapabilityProbeAdmission(
	_ context.Context,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
) (EvaluationCapabilityProbeAdmissionAuthorityResult, error) {
	authority.executeCalls++
	if !evaluationDigestPattern.MatchString(request.StageDigest) || request.DispatchAckDigest != "" {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, ErrConflict
	}
	return authority.result, nil
}

func (authority *evaluationCapabilityProbeTestAuthority) ReconcileCapabilityProbeAdmission(
	_ context.Context,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
) (EvaluationCapabilityProbeAdmissionAuthorityResult, bool, error) {
	authority.reconcileCalls++
	if !evaluationDigestPattern.MatchString(request.StageDigest) || !evaluationDigestPattern.MatchString(request.DispatchAckDigest) {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, false, ErrConflict
	}
	return authority.result, true, nil
}

func evaluationCapabilityProbeTestObservation(
	t *testing.T,
	request evaluationCapabilityProbeAdmissionRequest,
	referenceDigests []string,
	status string,
	observedAt time.Time,
	typedTrace ...map[string]any,
) map[string]any {
	t.Helper()
	program, err := expectedEvaluationCapabilityProbeProgram(
		request.QualificationCapabilityProfileID, request.QualificationCapabilityProfileDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	facts := make([]any, 0)
	var denial any
	if status == "supported" {
		for _, rawRequirement := range program.SupportedRequirements {
			requirement := rawRequirement.(map[string]any)
			minimum, ok := requirement["minimumCount"].(int64)
			if !ok {
				minimum, _ = integerMember(requirement, "minimumCount")
			}
			for index := int64(0); index < minimum; index++ {
				facts = append(facts, map[string]any{
					"factKind": stringMember(requirement, "factKind"),
					"factDigest": evaluationBoundedExportTestDigest(
						t, fmt.Sprintf("probe-fact-%s-%d", request.QualificationCapabilityProfileID, index),
					),
					"providerEventType": requirement["providerEventType"],
				})
			}
		}
	} else {
		denial = map[string]any{
			"denialKind": "provider-feature-unavailable",
			"denialFactDigest": evaluationBoundedExportTestDigest(
				t, "probe-denial-"+request.QualificationCapabilityProfileID,
			),
		}
	}
	sort.Slice(facts, func(left int, right int) bool {
		return evaluationCapabilityProbeFactOrder(facts[left].(map[string]any)) <
			evaluationCapabilityProbeFactOrder(facts[right].(map[string]any))
	})
	factDigest := func(kind string, ordinal int) string {
		matched := 0
		for _, rawFact := range facts {
			fact := rawFact.(map[string]any)
			if stringMember(fact, "factKind") == kind {
				if matched == ordinal {
					return stringMember(fact, "factDigest")
				}
				matched++
			}
		}
		return ""
	}
	var semanticProof any
	var trace map[string]any
	if len(typedTrace) == 1 {
		trace = typedTrace[0]
	}
	phaseDigest := func(group string, phase string, fallback string) string {
		bindSemanticProof, _ := trace["bindSemanticProof"].(bool)
		if trace != nil && bindSemanticProof {
			if values, ok := trace[group].(map[string]string); ok && values[phase] != "" {
				return values[phase]
			}
		}
		return evaluationBoundedExportTestDigest(t, fallback)
	}
	if status == "supported" {
		proof := map[string]any{}
		digest := func(label string) string { return evaluationBoundedExportTestDigest(t, label) }
		switch request.QualificationCapabilityProfileID {
		case "g4-provider-background-job":
			proof = map[string]any{
				"proofKind": "background-job-lifecycle", "jobReceiptDigest": factDigest("provider-job-receipt", 0),
				"jobIdDigest": digest("probe-job-id"), "submitRequestDigest": phaseDigest("requests", "submit", "probe-submit-request"),
				"pollResponseDigest": phaseDigest("responses", "poll", "probe-poll-response"), "terminalResponseDigest": func() string {
					bindSemanticProof, _ := trace["bindSemanticProof"].(bool)
					if trace != nil && bindSemanticProof {
						return stringMember(trace, "terminalResponseDigest")
					}
					return referenceDigests[1]
				}(),
			}
		case "g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document":
			proofKind := "hosted-retrieval-public-text"
			if request.QualificationCapabilityProfileID == "g4-provider-hosted-retrieval-document" {
				proofKind = "hosted-retrieval-public-document"
			}
			proof = map[string]any{
				"proofKind": proofKind, "retrievalQueryReceiptDigest": factDigest("retrieval-query-receipt", 0),
				"resourceDescriptorDigest": stringMember(program.PublicProbeResource, "descriptorDigest"),
				"queryDigest":              stringMember(program.PublicProbeResource, "queryDigest"),
				"indexDigest":              stringMember(program.PublicProbeResource, "indexDigest"),
				"expectedMarkerDigest":     stringMember(program.PublicProbeResource, "expectedMarkerDigest"),
				"resultMarkerDigest":       stringMember(program.PublicProbeResource, "expectedMarkerDigest"),
				"documentBytesDigest":      program.PublicProbeResource["documentBytesDigest"],
				"providerResponseDigest":   phaseDigest("responses", "dispatch-terminal", "probe-retrieval-provider-response"),
			}
		case "g4-provider-isolated-cache":
			proof = map[string]any{
				"proofKind": "isolated-cache-roundtrip", "cacheReceiptDigest": factDigest("provider-cache-receipt", 0),
				"usageVectorDigest": factDigest("usage-vector", 0), "cacheKeyDigest": digest("probe-cache-key"),
				"coldResponseDigest":   phaseDigest("responses", "cache-cold", "probe-cache-cold-response"),
				"warmResponseDigest":   phaseDigest("responses", "cache-warm", "probe-cache-warm-response"),
				"usageDeltaDigest":     digest("probe-cache-usage-delta"),
				"isolationScopeDigest": digest("probe-cache-isolation-scope"), "cacheHitObserved": true,
			}
		case "g4-provider-parallel-tool":
			proof = map[string]any{
				"proofKind": "parallel-tool-call-set", "providerResponseDigest": func() string {
					bindSemanticProof, _ := trace["bindSemanticProof"].(bool)
					if trace != nil && bindSemanticProof {
						return stringMember(trace, "terminalResponseDigest")
					}
					return referenceDigests[1]
				}(),
				"toolCalls": []any{
					map[string]any{"toolName": "capability_probe_alpha", "toolCallId": "probe/tool-call/alpha", "factDigest": factDigest("provider-event", 0)},
					map[string]any{"toolName": "capability_probe_beta", "toolCallId": "probe/tool-call/beta", "factDigest": factDigest("provider-event", 1)},
				},
			}
		case "g4-provider-reasoning-continuation":
			proof = map[string]any{
				"proofKind":              "opaque-continuation-roundtrip",
				"continuationFactDigest": factDigest("opaque-continuation", 0),
				"parentResponseDigest":   phaseDigest("responses", "continue", "probe-continuation-parent"),
				"opaqueHandleDigest":     digest("probe-continuation-handle"),
				"resumeRequestDigest":    phaseDigest("requests", "resume", "probe-continuation-resume-request"),
				"resumeResponseDigest":   phaseDigest("responses", "resume", "probe-continuation-resume-response"),
			}
		}
		proofDigest, err := canonicaljson.Digest(proof)
		if err != nil {
			t.Fatal(err)
		}
		proof["proofDigest"] = proofDigest
		semanticProof = proof
	}
	toolCallCount := int64(0)
	if request.QualificationCapabilityProfileID == "g4-provider-parallel-tool" && status == "supported" {
		toolCallCount = 2
	}
	pollAttemptCount := int64(0)
	if request.QualificationCapabilityProfileID == "g4-provider-background-job" && status == "supported" {
		pollAttemptCount = 1
	}
	requestBytes, responseBytes := int64(1_024), int64(2_048)
	providerRoundTrips, maximumDispatchMS, executionDurationMS := int64(1), int64(1_000), int64(2_000)
	if trace != nil {
		requestBytes, _ = integerMember(trace, "requestBytes")
		responseBytes, _ = integerMember(trace, "responseBytes")
		providerRoundTrips, _ = integerMember(trace, "providerRoundTripCount")
		maximumDispatchMS, _ = integerMember(trace, "observedMaximumSingleDispatchMs")
		executionDurationMS, _ = integerMember(trace, "observedExecutionDurationMs")
	}
	limits := map[string]any{
		"requestBytes": requestBytes, "responseBytes": responseBytes, "normalizedFactCount": int64(len(facts)),
		"toolCallCount": toolCallCount, "providerRoundTripCount": providerRoundTrips, "pollAttemptCount": pollAttemptCount,
		"observedMaximumSingleDispatchMs": maximumDispatchMS, "observedExecutionDurationMs": executionDurationMS,
	}
	limitDigest, err := canonicaljson.Digest(limits)
	if err != nil {
		t.Fatal(err)
	}
	limits["limitDigest"] = limitDigest
	base := map[string]any{
		"format": evaluationCapabilityProbeObservationFormat, "version": int64(1),
		"observationSource": "normalized-provider-response", "probeProgramDigest": program.ProgramDigest,
		"profileProjectionDigest":     program.ProfileProjectionDigest,
		"providerConfigurationDigest": request.ProviderConfigurationDigest,
		"modelLineageDigest":          request.ModelLineageDigest, "adapterDigest": request.AdapterDigest,
		"probeRequestDigest": referenceDigests[0], "providerResponseDigest": referenceDigests[1],
		"normalizedEventSetDigest": referenceDigests[5], "status": status, "observedFacts": facts,
		"semanticProof": semanticProof, "denial": denial, "observedLimits": limits,
		"observedLimitDigest": limitDigest,
		"observedAt":          observedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["observationDigest"] = digest
	return base
}

func evaluationCapabilityProbeTestFixture(
	t *testing.T,
	namespaceID string,
) (evaluationCapabilityProbeAdmissionRequest, []byte, string, EvaluationCapabilityProbeAdmissionAuthorityResult, []byte, time.Time) {
	t.Helper()
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	var target map[string]any
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		candidate := raw.(map[string]any)
		if _, ok := candidate["optionalCapabilitySupportAuthority"]; ok {
			target = candidate
			break
		}
	}
	if target == nil {
		t.Fatal("vector has no optional capability target")
	}
	optionalAuthority, _ := objectMember(target, "optionalCapabilitySupportAuthority")
	program, err := expectedEvaluationCapabilityProbeProgram(
		stringMember(optionalAuthority, "qualificationCapabilityProfileId"),
		stringMember(optionalAuthority, "qualificationCapabilityProfileDigest"),
	)
	if err != nil {
		t.Fatal(err)
	}
	var provider map[string]any
	for _, raw := range plan.Value["providerConfigurations"].([]any) {
		candidate := raw.(map[string]any)
		if stringMember(candidate, "providerConfigurationId") == stringMember(target, "providerConfigurationId") {
			provider = candidate
			break
		}
	}
	var model map[string]any
	for _, raw := range plan.Value["modelConfigurations"].([]any) {
		candidate := raw.(map[string]any)
		if stringMember(candidate, "lineageDigest") == stringMember(target, "modelLineageDigest") {
			model = candidate
			break
		}
	}
	base := map[string]any{
		"format": evaluationCapabilityProbeAdmissionRequestFormat, "version": evaluationCapabilityProbeAdmissionVersion,
		"namespaceId": namespaceID, "repositoryCommit": plan.RepositoryCommit,
		"providerConfiguration": provider, "modelLineage": model,
		"qualificationCapabilityProfileId":     stringMember(optionalAuthority, "qualificationCapabilityProfileId"),
		"qualificationCapabilityProfileDigest": stringMember(optionalAuthority, "qualificationCapabilityProfileDigest"),
		"capabilityId":                         stringMember(optionalAuthority, "capabilityId"),
		"declaredCapabilityProfileDigests":     optionalAuthority["declaredCapabilityProfileDigests"],
		"probeProgram":                         program.Value,
		"probeProviderResourceAuthority":       nil,
		"minimumExpiresAt":                     plan.ExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	requestDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["requestDigest"] = requestDigest
	requestBytes, err := canonicaljson.Bytes(base)
	if err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationCapabilityProbeAdmissionRequest(
		requestBytes,
		EvaluationAuthority{Kind: "service", PrincipalID: "probe.test", NamespaceID: namespaceID},
	)
	if err != nil {
		t.Fatal(err)
	}
	implementationDigest := evaluationBoundedExportTestDigest(t, "capability-probe-owner")
	stageDigest, err := evaluationCapabilityProbeStageDigest(request, implementationDigest)
	if err != nil {
		t.Fatal(err)
	}
	authorityIssuerID := "authority/probe.test"
	observedAt := plan.PlannedAt.Add(-time.Hour)
	observedAtText := observedAt.Format("2006-01-02T15:04:05.000Z")
	intent, _ := objectMember(request.ProbeProgram, "providerRequestIntent")
	rawPhases := intent["requestPhases"].([]any)
	phaseRequests, phaseResponses := make([]any, len(rawPhases)), make([]any, len(rawPhases))
	dispatchIntents, transportReceipts := make([]any, len(rawPhases)), make([]any, len(rawPhases))
	spoolReceipts := make([]any, len(rawPhases))
	requestDigests, responseDigests := make(map[string]string, len(rawPhases)), make(map[string]string, len(rawPhases))
	for index, rawPhase := range rawPhases {
		phase := rawPhase.(string)
		requestDigest := evaluationBoundedExportTestDigest(t, fmt.Sprintf("probe-%s-request", phase))
		responseDigest := evaluationBoundedExportTestDigest(t, fmt.Sprintf("probe-%s-response", phase))
		dispatchDigest := evaluationBoundedExportTestDigest(t, fmt.Sprintf("probe-%s-dispatch", phase))
		transportDigest := evaluationBoundedExportTestDigest(t, fmt.Sprintf("probe-%s-transport", phase))
		dispatchedAt := observedAt.Add(time.Duration(index-len(rawPhases)) * time.Second)
		completedAt := dispatchedAt.Add(time.Second)
		requestDigests[phase], responseDigests[phase] = requestDigest, responseDigest
		phaseRequests[index] = map[string]any{
			"phase": phase, "sequence": int64(index), "requestDigest": requestDigest, "requestBytes": int64(512),
		}
		phaseResponses[index] = map[string]any{
			"phase": phase, "sequence": int64(index), "requestDigest": requestDigest,
			"responseDigest": responseDigest, "responseBytes": int64(1_024), "outcome": "completed",
			"programTerminal": index == len(rawPhases)-1,
			"providerJobStatus": func() any {
				if request.QualificationCapabilityProfileID != "g4-provider-background-job" {
					return nil
				}
				if index == len(rawPhases)-1 {
					return "completed"
				}
				return "queued"
			}(),
			"completedAt": completedAt.Format("2006-01-02T15:04:05.000Z"),
		}
		dispatchIntents[index] = map[string]any{
			"phase": phase, "sequence": int64(index), "requestDigest": requestDigest,
			"dispatchIntentDigest": dispatchDigest,
			"dispatchedAt":         dispatchedAt.Format("2006-01-02T15:04:05.000Z"),
		}
		transportReceipts[index] = map[string]any{
			"phase": phase, "sequence": int64(index), "dispatchIntentDigest": dispatchDigest,
			"transportReceiptDigest": transportDigest, "outcome": "completed", "responseDigest": responseDigest,
			"completedAt": completedAt.Format("2006-01-02T15:04:05.000Z"),
		}
		spool := map[string]any{
			"phase": phase, "sequence": int64(index), "transportReceiptDigest": transportDigest,
			"responseDigest": responseDigest, "spoolRef": fmt.Sprintf("probe/spool/%s", phase),
			"envelopeDigest":          evaluationBoundedExportTestDigest(t, fmt.Sprintf("probe-%s-spool-envelope", phase)),
			"ciphertextDigest":        evaluationBoundedExportTestDigest(t, fmt.Sprintf("probe-%s-ciphertext", phase)),
			"ciphertextByteLength":    int64(1_024),
			"aadDigest":               evaluationBoundedExportTestDigest(t, fmt.Sprintf("probe-%s-aad", phase)),
			"encryptionProfileDigest": evaluationBoundedExportTestDigest(t, "probe-encryption-profile"),
			"keyRefDigest":            evaluationBoundedExportTestDigest(t, "probe-key-ref"),
		}
		recomputeEvaluationProviderObservationTestDigest(t, spool, "spoolReceiptDigest")
		spoolReceipts[index] = spool
	}
	requestSetDigest, _ := canonicaljson.Digest(map[string]any{"phaseRequests": phaseRequests})
	responseSetDigest, _ := canonicaljson.Digest(map[string]any{"phaseResponses": phaseResponses})
	dispatchSetDigest, _ := canonicaljson.Digest(map[string]any{"dispatchIntents": dispatchIntents})
	transportSetDigest, _ := canonicaljson.Digest(map[string]any{"transportReceipts": transportReceipts})
	spoolSetDigest, _ := canonicaljson.Digest(map[string]any{"spoolReceipts": spoolReceipts})
	commonSource := func(format string) map[string]any {
		return map[string]any{
			"format": format, "version": int64(1), "admissionRequestDigest": request.RequestDigest,
			"probeProgramDigest": request.ProbeProgramDigest, "profileProjectionDigest": request.ProfileProjectionDigest,
			"providerConfigurationDigest": request.ProviderConfigurationDigest, "modelLineageDigest": request.ModelLineageDigest,
			"adapterDigest": request.AdapterDigest, "ownerImplementationDigest": implementationDigest,
			"authorityIssuerId": authorityIssuerID, "observedAt": observedAtText,
		}
	}
	sourceReceipts := make([]map[string]any, len(evaluationCapabilityProbeReferenceKinds))
	sourceReceipts[0] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[0])
	sourceReceipts[0]["phaseRequests"], sourceReceipts[0]["requestPhaseSetDigest"] = phaseRequests, requestSetDigest
	resourceDigest := any(nil)
	if resource, ok := intent["publicProbeResource"].(map[string]any); ok {
		resourceDigest = resource["descriptorDigest"]
	}
	sourceReceipts[0]["publicProbeResourceDescriptorDigest"] = resourceDigest
	sourceReceipts[1] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[1])
	sourceReceipts[1]["phaseResponses"], sourceReceipts[1]["responsePhaseSetDigest"] = phaseResponses, responseSetDigest
	sourceReceipts[1]["terminalResponseDigest"] = responseDigests[rawPhases[len(rawPhases)-1].(string)]
	sourceReceipts[2] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[2])
	sourceReceipts[2]["dispatchIntents"], sourceReceipts[2]["dispatchIntentSetDigest"] = dispatchIntents, dispatchSetDigest
	sourceReceipts[3] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[3])
	sourceReceipts[3]["transportReceipts"], sourceReceipts[3]["transportReceiptSetDigest"] = transportReceipts, transportSetDigest
	sourceReceipts[4] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[4])
	sourceReceipts[4]["encryptionPolicyDigest"] = evaluationBoundedExportTestDigest(t, "probe-encryption-policy")
	sourceReceipts[4]["spoolReceipts"], sourceReceipts[4]["spoolReceiptSetDigest"] = spoolReceipts, spoolSetDigest
	referenceEntries := make([]any, len(evaluationCapabilityProbeReferenceKinds))
	referenceDigests := make([]string, len(referenceEntries))
	wrapReference := func(index int, sourceReceipt map[string]any) {
		kind := evaluationCapabilityProbeReferenceKinds[index]
		sourceReceiptDigest, err := canonicaljson.Digest(sourceReceipt)
		if err != nil {
			t.Fatal(err)
		}
		receipt := map[string]any{
			"format": evaluationCapabilityProbeReferenceFormats[index], "version": int64(1),
			"admissionRequestDigest":               requestDigest,
			"providerConfigurationDigest":          request.ProviderConfigurationDigest,
			"modelLineageDigest":                   request.ModelLineageDigest,
			"qualificationCapabilityProfileDigest": request.QualificationCapabilityProfileDigest,
			"capabilityId":                         request.CapabilityID, "adapterDigest": request.AdapterDigest,
			"probeProgramDigest":        request.ProbeProgramDigest,
			"profileProjectionDigest":   request.ProfileProjectionDigest,
			"ownerImplementationDigest": implementationDigest, "authorityIssuerId": authorityIssuerID,
			"previousReceiptDigest": func() any {
				if index == 0 {
					return nil
				}
				return referenceDigests[index-1]
			}(),
			"observedAt":    observedAtText,
			"sourceReceipt": sourceReceipt, "sourceReceiptDigest": sourceReceiptDigest,
		}
		referenceDigest, err := canonicaljson.Digest(receipt)
		if err != nil {
			t.Fatal(err)
		}
		referenceDigests[index] = referenceDigest
		referenceEntries[index] = map[string]any{"kind": kind, "receipt": receipt, "receiptDigest": referenceDigest}
	}
	for index := 0; index < 5; index++ {
		wrapReference(index, sourceReceipts[index])
	}
	trace := map[string]any{
		"requests": requestDigests, "responses": responseDigests,
		"terminalResponseDigest":          sourceReceipts[1]["terminalResponseDigest"],
		"bindSemanticProof":               true,
		"requestBytes":                    float64(len(rawPhases) * 512),
		"responseBytes":                   float64(len(rawPhases) * 1_024),
		"providerRoundTripCount":          float64(len(rawPhases)),
		"observedMaximumSingleDispatchMs": float64(1_000),
		"observedExecutionDurationMs":     float64(len(rawPhases) * 1_000),
	}
	observation := evaluationCapabilityProbeTestObservation(
		t, request, referenceDigests, "supported", observedAt, trace,
	)
	projection := cloneEvaluationObject(observation)
	delete(projection, "normalizedEventSetDigest")
	delete(projection, "observationDigest")
	projectionDigest, _ := canonicaljson.Digest(projection)
	sourceReceipts[5] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[5])
	sourceReceipts[5]["normalizedObservationProjection"] = projection
	sourceReceipts[5]["normalizedObservationProjectionDigest"] = projectionDigest
	sourceReceipts[5]["normalizerImplementationDigest"] = evaluationBoundedExportTestDigest(t, "probe-normalizer")
	if proof, ok := objectMember(projection, "semanticProof"); ok {
		phaseLeaves, leavesErr := evaluationCapabilityProbeSemanticProofPhaseLeaves(program, proof)
		if leavesErr != nil {
			t.Fatal(leavesErr)
		}
		sourceReceipts[5]["semanticProofPhaseLeaves"] = phaseLeaves
		sourceReceipts[5]["semanticProofPhaseLeavesDigest"] = phaseLeaves["projectionDigest"]
	} else {
		sourceReceipts[5]["semanticProofPhaseLeaves"] = nil
		sourceReceipts[5]["semanticProofPhaseLeavesDigest"] = nil
	}
	wrapReference(5, sourceReceipts[5])
	observation["normalizedEventSetDigest"] = referenceDigests[5]
	recomputeEvaluationProviderObservationTestDigest(t, observation, "observationDigest")
	if _, err := evaluationCapabilityProbeSemanticProof(
		observation["semanticProof"], program, observation["observedFacts"].([]any), stringMember(observation, "providerResponseDigest"),
	); err != nil {
		t.Fatalf("typed capability probe semantic proof fixture is invalid: %v", err)
	}
	if _, err := evaluationCapabilityProbeObservedLimits(
		observation["observedLimits"], program, len(observation["observedFacts"].([]any)),
	); err != nil {
		t.Fatalf("typed capability probe observed limits fixture is invalid: %v", err)
	}
	for _, field := range []string{
		"probeProgramDigest", "profileProjectionDigest", "providerConfigurationDigest", "modelLineageDigest",
		"adapterDigest", "probeRequestDigest", "providerResponseDigest", "normalizedEventSetDigest",
		"observedLimitDigest", "observationDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(observation, field)) {
			t.Fatalf("typed capability probe observation %s=%q is not a digest", field, stringMember(observation, field))
		}
	}
	observationBytes, err := canonicaljson.Bytes(observation)
	if err != nil {
		t.Fatal(err)
	}
	canonicalObservation, err := decodeCanonicalEvaluationObject(
		observationBytes, maximumEvaluationCapabilityProbeObservationBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := decodeEvaluationCapabilityProbeObservation(canonicalObservation, program, request); err != nil {
		t.Fatalf("typed capability probe observation fixture is invalid: %v observation=%#v", err, canonicalObservation)
	}
	declaredDigest, _ := canonicaljson.Digest(base["declaredCapabilityProfileDigests"])
	observedLimitDigest := stringMember(observation, "observedLimitDigest")
	probedCapabilityDigest, _ := canonicaljson.Digest(map[string]any{
		"normalizedObservationDigest": stringMember(observation, "observationDigest"),
		"observedLimitDigest":         observedLimitDigest,
		"observedProfileDigest":       request.QualificationCapabilityProfileDigest,
		"probeProgramDigest":          request.ProbeProgramDigest,
		"profileProjectionDigest":     request.ProfileProjectionDigest, "status": "supported",
	})
	receiptBase := map[string]any{
		"probeId": "probe/production.test", "providerConfigurationDigest": request.ProviderConfigurationDigest,
		"modelLineageDigest":       request.ModelLineageDigest,
		"requestedProfileDigest":   request.QualificationCapabilityProfileDigest,
		"declaredCapabilityDigest": declaredDigest, "probedCapabilityDigest": probedCapabilityDigest,
		"status": "supported", "observedLimitDigest": observedLimitDigest,
		"observedProfileDigest":       request.QualificationCapabilityProfileDigest,
		"probeProgramDigest":          request.ProbeProgramDigest,
		"profileProjectionDigest":     request.ProfileProjectionDigest,
		"normalizedObservationDigest": stringMember(observation, "observationDigest"),
		"probedAt":                    observedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                   plan.ExpiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	receiptDigest, _ := canonicaljson.Digest(receiptBase)
	receiptBase["receiptDigest"] = receiptDigest
	evidenceBase := map[string]any{
		"authorityKind": "sealed-provider-capability-probe", "authorityIssuerId": authorityIssuerID,
		"ownerImplementationDigest": implementationDigest, "adapterDigest": request.AdapterDigest,
		"probeRequestDigest": referenceDigests[0], "probeResponseDigest": referenceDigests[1],
		"dispatchReceiptDigest": referenceDigests[2], "transportReceiptDigest": referenceDigests[3],
		"responseSpoolDigest": referenceDigests[4], "normalizedEventSetDigest": referenceDigests[5],
		"probeProgram": request.ProbeProgram, "normalizedObservation": observation, "receipt": receiptBase,
	}
	evidenceDigest, _ := canonicaljson.Digest(evidenceBase)
	evidenceBase["evidenceDigest"] = evidenceDigest
	evidenceBytes, _ := canonicaljson.Bytes(evidenceBase)
	referenceBytes, _ := canonicaljson.Bytes(referenceEntries)
	canonicalEvidence, err := decodeCanonicalEvaluationObject(evidenceBytes, 65_536)
	if err != nil {
		t.Fatal(err)
	}
	canonicalReferences, err := decodeEvaluationCapabilityProbeReferenceValues(referenceBytes)
	if err != nil {
		t.Fatal(err)
	}
	for index, rawReference := range canonicalReferences {
		entry := rawReference.(map[string]any)
		receipt, _ := objectMember(entry, "receipt")
		sourceReceipt, _ := objectMember(receipt, "sourceReceipt")
		if err := validateEvaluationCapabilityProbeTypedSourceReceipt(
			sourceReceipt, index, request, implementationDigest, authorityIssuerID, observedAt,
		); err != nil {
			t.Fatalf("typed capability probe source receipt %d is invalid: %v source=%#v", index, err, sourceReceipt)
		}
	}
	if err := validateEvaluationCapabilityProbeTypedReferenceBundle(
		canonicalReferences, canonicalEvidence, request, implementationDigest,
	); err != nil {
		t.Fatalf("typed capability probe reference bundle is invalid: %v", err)
	}
	ownerAdmissionDigest, _ := evaluationCapabilityProbeOwnerAdmissionDigest(
		requestDigest, evidenceDigest, implementationDigest, stageDigest,
	)
	return request, requestBytes, implementationDigest, EvaluationCapabilityProbeAdmissionAuthorityResult{
		ProbeEvidence: evidenceBytes, OwnerAdmissionDigest: ownerAdmissionDigest,
	}, referenceBytes, plan.PlannedAt
}

func TestEvaluationCapabilityProbeBackgroundSequenceAcceptsFourPollsAndRejectsTerminalDrift(t *testing.T) {
	request, _, implementationDigest, _, referenceBytes, _ := evaluationCapabilityProbeTestFixture(
		t, "evaluation.probe-background-sequence",
	)
	if request.QualificationCapabilityProfileID != "g4-provider-background-job" {
		t.Fatalf("fixture profile=%q, want background-job", request.QualificationCapabilityProfileID)
	}
	references, err := decodeEvaluationCapabilityProbeReferenceValues(referenceBytes)
	if err != nil {
		t.Fatal(err)
	}
	reference := references[1].(map[string]any)
	receipt, _ := objectMember(reference, "receipt")
	source, _ := objectMember(receipt, "sourceReceipt")
	observedAt, err := time.Parse(time.RFC3339Nano, stringMember(source, "observedAt"))
	if err != nil {
		t.Fatal(err)
	}
	original, _ := source["phaseResponses"].([]any)
	if len(original) != 2 {
		t.Fatalf("minimal background fixture responses=%d", len(original))
	}
	responses := make([]any, 5)
	responses[0] = cloneEvaluationObject(original[0].(map[string]any))
	for sequence := 1; sequence < 5; sequence++ {
		entry := cloneEvaluationObject(original[1].(map[string]any))
		entry["sequence"] = int64(sequence)
		entry["requestDigest"] = evaluationBoundedExportTestDigest(t, fmt.Sprintf("background-poll-%d-request", sequence))
		entry["responseDigest"] = evaluationBoundedExportTestDigest(t, fmt.Sprintf("background-poll-%d-response", sequence))
		entry["programTerminal"] = sequence == 4
		if sequence == 4 {
			entry["providerJobStatus"] = "completed"
		} else {
			entry["providerJobStatus"] = "in-progress"
		}
		entry["completedAt"] = observedAt.Add(time.Duration(sequence-5) * time.Second).Format("2006-01-02T15:04:05.000Z")
		responses[sequence] = entry
	}
	recompute := func(value map[string]any) {
		value["responsePhaseSetDigest"] = ownerStateTestDigest(t, map[string]any{"phaseResponses": value["phaseResponses"]})
		entries := value["phaseResponses"].([]any)
		value["terminalResponseDigest"] = stringMember(entries[len(entries)-1].(map[string]any), "responseDigest")
	}
	source["phaseResponses"] = responses
	recompute(source)
	if err := validateEvaluationCapabilityProbeTypedSourceReceipt(
		source, 1, request, implementationDigest, stringMember(source, "authorityIssuerId"), observedAt,
	); err != nil {
		t.Fatalf("four-poll background sequence was rejected: %v", err)
	}
	deepCopy := func(value map[string]any) map[string]any {
		encoded, encodeErr := canonicaljson.Bytes(value)
		if encodeErr != nil {
			t.Fatal(encodeErr)
		}
		copy, decodeErr := decodeCanonicalEvaluationObject(encoded, maximumEvaluationCapabilityProbeReferenceReceiptBytes)
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		return copy
	}
	for name, mutate := range map[string]func(map[string]any){
		"early-terminal": func(value map[string]any) {
			entries := value["phaseResponses"].([]any)
			entry := entries[2].(map[string]any)
			entry["programTerminal"], entry["providerJobStatus"] = true, "completed"
		},
		"missing-final-terminal": func(value map[string]any) {
			entries := value["phaseResponses"].([]any)
			entry := entries[len(entries)-1].(map[string]any)
			entry["programTerminal"], entry["providerJobStatus"] = false, "in-progress"
		},
		"sequence-gap": func(value map[string]any) {
			entries := value["phaseResponses"].([]any)
			entries[3].(map[string]any)["sequence"] = int64(4)
		},
	} {
		t.Run(name, func(t *testing.T) {
			drifted := deepCopy(source)
			mutate(drifted)
			recompute(drifted)
			if err := validateEvaluationCapabilityProbeTypedSourceReceipt(
				drifted, 1, request, implementationDigest, stringMember(drifted, "authorityIssuerId"), observedAt,
			); err == nil {
				t.Fatal("fully recomputed invalid background sequence was accepted")
			}
		})
	}
}

func evaluationCapabilityProbeTestHTTP(
	t *testing.T,
	handler http.Handler,
	request evaluationCapabilityProbeAdmissionRequest,
	source []byte,
) *httptest.ResponseRecorder {
	t.Helper()
	httpRequest := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/v1/evaluations/%s/capability-probe-admissions", request.NamespaceID),
		bytes.NewReader(source),
	)
	httpRequest.Header.Set("Authorization", "Bearer "+"capability-probe-ledger-token-0000000000001")
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "application/json")
	httpRequest.Header.Set("Idempotency-Key", request.RequestDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httpRequest)
	return response
}

func TestEvaluationCapabilityProbeAdmissionSealsAndReplaysStableProductionEvidence(t *testing.T) {
	request, source, implementationDigest, result, referenceBytes, now := evaluationCapabilityProbeTestFixture(t, "evaluation.probe-test")
	repository := &evaluationCapabilityProbeTestRepository{referenceBundle: referenceBytes}
	authority := &evaluationCapabilityProbeTestAuthority{implementationDigest: implementationDigest, result: result}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: request.NamespaceID, ServiceToken: "capability-probe-ledger-token-0000000000001",
		CapabilityProbeAdmissionAuthority: authority, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	first := evaluationCapabilityProbeTestHTTP(t, handler, request, source)
	if first.Code != http.StatusOK || repository.record.State != "sealed" || authority.executeCalls != 1 ||
		repository.ackCalls != 1 || repository.sealCalls != 1 {
		t.Fatalf("first status=%d state=%s execute=%d ack=%d seal=%d body=%s",
			first.Code, repository.record.State, authority.executeCalls, repository.ackCalls,
			repository.sealCalls, first.Body.String())
	}
	if err := validateEvaluationCapabilityProbeAdmissionResponse(
		first.Body.Bytes(), request, implementationDigest, repository.record.StageDigest,
		repository.record.DispatchAckDigest,
	); err != nil {
		t.Fatal(err)
	}
	second := evaluationCapabilityProbeTestHTTP(t, handler, request, source)
	if second.Code != http.StatusOK || authority.executeCalls != 1 || second.Body.String() != first.Body.String() {
		t.Fatalf("replay status=%d execute=%d body=%s", second.Code, authority.executeCalls, second.Body.String())
	}
}

func TestEvaluationCapabilityProbeAdmissionCrossHostReconcileRequiresExactSealedFences(t *testing.T) {
	request, source, implementationDigest, result, referenceBytes, now := evaluationCapabilityProbeTestFixture(t, "evaluation.probe-reconcile")
	stageDigest, _ := evaluationCapabilityProbeStageDigest(request, implementationDigest)
	sealed, err := evaluationCapabilityProbeEvidence(request, implementationDigest, stageDigest, result, referenceBytes, now)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationCapabilityProbeTestRepository{record: EvaluationCapabilityProbeAdmissionRecord{
		NamespaceID: request.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		RequestDigest: request.RequestDigest, State: "dispatched", ClaimGeneration: 1,
		OwnerImplementationDigest: implementationDigest, StageDigest: stageDigest,
		DispatchAckDigest: sealed.DispatchAckDigest, ReferenceBundleBytes: sealed.ReferenceBundleBytes,
		ResponseBytes: sealed.ResponseBytes, ResponseDigest: sealed.ResponseDigest,
	}}
	authority := &evaluationCapabilityProbeTestAuthority{implementationDigest: implementationDigest, result: result}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: request.NamespaceID, ServiceToken: "capability-probe-ledger-token-0000000000001",
		CapabilityProbeAdmissionAuthority: authority, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	response := evaluationCapabilityProbeTestHTTP(t, handler, request, source)
	if response.Code != http.StatusOK || authority.executeCalls != 0 || authority.reconcileCalls != 1 ||
		repository.record.State != "sealed" {
		t.Fatalf("status=%d execute=%d reconcile=%d state=%s body=%s",
			response.Code, authority.executeCalls, authority.reconcileCalls, repository.record.State, response.Body.String())
	}

	forged := *repository
	forged.record.State = "dispatched"
	forged.record.StageDigest = evaluationBoundedExportTestDigest(t, "forged-probe-stage")
	forgedAuthority := &evaluationCapabilityProbeTestAuthority{implementationDigest: implementationDigest, result: result}
	forgedHandler, err := NewEvaluationServiceHandler(&forged, EvaluationServiceHandlerConfig{
		NamespaceID: request.NamespaceID, ServiceToken: "capability-probe-ledger-token-0000000000001",
		CapabilityProbeAdmissionAuthority: forgedAuthority, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	denied := evaluationCapabilityProbeTestHTTP(t, forgedHandler, request, source)
	if denied.Code == http.StatusOK || forgedAuthority.executeCalls != 0 {
		t.Fatalf("forged fence status=%d execute=%d body=%s", denied.Code, forgedAuthority.executeCalls, denied.Body.String())
	}
}

func TestEvaluationCapabilityProbeAdmissionRejectsRecomputedOfflineSupportedEvidence(t *testing.T) {
	request, _, implementationDigest, result, referenceBytes, now := evaluationCapabilityProbeTestFixture(t, "evaluation.probe-tamper")
	stageDigest, _ := evaluationCapabilityProbeStageDigest(request, implementationDigest)
	evidence, err := decodeCanonicalEvaluationObject(result.ProbeEvidence, 65_536)
	if err != nil {
		t.Fatal(err)
	}
	evidence["authorityIssuerId"] = "authority/offline.swap"
	delete(evidence, "evidenceDigest")
	evidenceDigest, _ := canonicaljson.Digest(evidence)
	evidence["evidenceDigest"] = evidenceDigest
	result.ProbeEvidence, _ = canonicaljson.Bytes(evidence)
	result.OwnerAdmissionDigest, _ = evaluationCapabilityProbeOwnerAdmissionDigest(
		request.RequestDigest, evidenceDigest, implementationDigest, stageDigest,
	)
	if _, err := evaluationCapabilityProbeEvidence(request, implementationDigest, stageDigest, result, referenceBytes, now); err == nil {
		t.Fatal("recomputed evidence with no matching sealed reference authority was accepted")
	}
}

func TestEvaluationCapabilityProbeAdmissionRejectsFullyRecomputedBundleWithoutDurableRawAuthorityRows(t *testing.T) {
	request, source, implementationDigest, result, _, now := evaluationCapabilityProbeTestFixture(t, "evaluation.probe-no-raw-authority")
	repository := &evaluationCapabilityProbeTestRepository{referenceLoadError: ErrConflict}
	authority := &evaluationCapabilityProbeTestAuthority{implementationDigest: implementationDigest, result: result}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: request.NamespaceID, ServiceToken: "capability-probe-ledger-token-0000000000001",
		CapabilityProbeAdmissionAuthority: authority, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	response := evaluationCapabilityProbeTestHTTP(t, handler, request, source)
	if response.Code == http.StatusOK || authority.executeCalls != 1 || repository.referenceLoadCalls != 1 ||
		repository.ackCalls != 0 || repository.sealCalls != 0 {
		t.Fatalf("status=%d execute=%d raw-load=%d ack=%d seal=%d body=%s",
			response.Code, authority.executeCalls, repository.referenceLoadCalls,
			repository.ackCalls, repository.sealCalls, response.Body.String())
	}
}

func TestEvaluationCapabilityProbeAdmissionLoopbackCarriesSealedObservationOnlyForReconcile(t *testing.T) {
	request, _, implementationDigest, result, referenceBytes, now := evaluationCapabilityProbeTestFixture(t, "evaluation.probe-loopback")
	stageDigest, _ := evaluationCapabilityProbeStageDigest(request, implementationDigest)
	sealed, err := evaluationCapabilityProbeEvidence(request, implementationDigest, stageDigest, result, referenceBytes, now)
	if err != nil {
		t.Fatal(err)
	}
	sealedObservation, sealedObservationDigest, err := evaluationCapabilityProbeSealedObservation(
		EvaluationCapabilityProbeAdmissionRecord{
			ResponseBytes: sealed.ResponseBytes, ReferenceBundleBytes: sealed.ReferenceBundleBytes,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	probeEvidence, _ := decodeCanonicalEvaluationObject(result.ProbeEvidence, 65_536)
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, httpRequest *http.Request) {
		calls++
		source, readErr := io.ReadAll(httpRequest.Body)
		if readErr != nil {
			http.Error(writer, "read failed", http.StatusBadRequest)
			return
		}
		value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationLoopbackAuthorityBytes)
		if err != nil {
			t.Fatal(err)
		}
		mode := stringMember(value, "mode")
		required := []string{
			"format", "version", "serviceKind", "mode", "namespaceId", "repositoryCommit",
			"operation", "routeBinding", "requestDigest", "ownerImplementationDigest",
			"claimGeneration", "payload",
		}
		if mode == "execute" {
			required = append(required, "stageDigest")
		}
		if mode == "reconcile" {
			required = append(required, "stageDigest", "dispatchAckDigest", "sealedProbeObservation", "sealedProbeObservationDigest")
		}
		if !exactEvaluationKeys(value, required) || value["planDigest"] != nil ||
			stringMember(value, "operation") != evaluationCapabilityProbeOperation ||
			stringMember(value, "routeBinding") != evaluationCapabilityProbeRouteBinding {
			t.Fatalf("invalid %s loopback request: %#v", mode, value)
		}
		response := map[string]any{
			"format": evaluationLoopbackAuthorityResponseFormat, "version": evaluationLoopbackAuthorityVersion,
			"serviceKind": "provider-capability", "mode": mode, "requestDigest": request.RequestDigest,
			"ownerImplementationDigest": implementationDigest, "stageDigest": stageDigest,
		}
		if mode == "stage" {
			writeEvaluationServiceJSON(writer, http.StatusOK, response)
			return
		}
		response["probeEvidence"] = probeEvidence
		response["ownerAdmissionDigest"] = result.OwnerAdmissionDigest
		if mode == "reconcile" {
			response["dispatchAckDigest"], response["reconciled"] = sealed.DispatchAckDigest, true
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, response)
	}))
	defer server.Close()
	client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: "capability-probe-owner-token-00000000000001", Purpose: "preplan",
	})
	if err != nil {
		t.Fatal(err)
	}
	client.capabilityProbeImplementationDigest = implementationDigest
	authorityRequest := EvaluationCapabilityProbeAdmissionAuthorityRequest{
		NamespaceID: request.NamespaceID, RepositoryCommit: request.RepositoryCommit,
		RequestDigest: request.RequestDigest, OwnerImplementationDigest: implementationDigest,
		ClaimGeneration: 1, Request: request.Bytes,
	}
	actualStage, err := client.StageCapabilityProbeAdmission(context.Background(), authorityRequest)
	if err != nil || actualStage != stageDigest {
		t.Fatalf("stage=%s err=%v", actualStage, err)
	}
	authorityRequest.StageDigest = stageDigest
	if _, err := client.ExecuteCapabilityProbeAdmission(context.Background(), authorityRequest); err != nil {
		t.Fatal(err)
	}
	authorityRequest.DispatchAckDigest = sealed.DispatchAckDigest
	authorityRequest.SealedProbeObservation = sealedObservation
	authorityRequest.SealedProbeObservationDigest = sealedObservationDigest
	if _, reconciled, err := client.ReconcileCapabilityProbeAdmission(context.Background(), authorityRequest); err != nil || !reconciled {
		t.Fatalf("reconciled=%v err=%v", reconciled, err)
	}
	forged := authorityRequest
	forged.SealedProbeObservationDigest = evaluationBoundedExportTestDigest(t, "forged-sealed-probe-observation")
	if _, _, err := client.ReconcileCapabilityProbeAdmission(context.Background(), forged); err == nil || calls != 3 {
		t.Fatalf("forged sealed observation err=%v calls=%d", err, calls)
	}
	forged = authorityRequest
	forged.OwnerImplementationDigest = evaluationBoundedExportTestDigest(t, "forged-probe-owner")
	if _, _, err := client.ReconcileCapabilityProbeAdmission(context.Background(), forged); err == nil || calls != 3 {
		t.Fatalf("forged probe implementation err=%v calls=%d", err, calls)
	}
}
