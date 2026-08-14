package agent

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationCapabilityProbePlanTestAdmission struct {
	target                  map[string]any
	optionalAuthority       map[string]any
	evidence                map[string]any
	receipt                 map[string]any
	request                 evaluationCapabilityProbeAdmissionRequest
	ownerImplementation     string
	authorityIssuer         string
	sealed                  evaluationCapabilityProbeAdmissionSealedValue
	referenceReceiptObjects []map[string]any
	resourceRequest         *evaluationCapabilityProbeProviderResourceRegistrationRequest
	resourceResult          *evaluationCapabilityProbeProviderResourceResult
	resourceClaimedAt       time.Time
	resourceCleanup         *evaluationCapabilityProbePlanTestCleanup
}

type evaluationCapabilityProbePlanTestCleanup struct {
	request                    evaluationCapabilityProbeProviderResourceCleanupRequest
	receipt                    evaluationCapabilityProbeProviderResourceCleanupReceipt
	ownerImplementationDigest  string
	stageDigest                string
	ownerAdmissionDigest       string
	dispatchAckDigest          string
	resultIngressDigest        string
	resultIngressReceiptDigest string
	responseDigest             string
	responseBytes              []byte
	sealedAt                   time.Time
}

func evaluationCapabilityProbePlanTestResourceCleanup(
	t *testing.T,
	plan evaluationPlanFact,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	result evaluationCapabilityProbeProviderResourceResult,
) *evaluationCapabilityProbePlanTestCleanup {
	t.Helper()
	deletion := result.DeletionAuthorityReceipt
	completedAt := plan.PlannedAt.Add(-30 * time.Minute)
	resourceResultBase := map[string]any{
		"format":     evaluationCapabilityProbeProviderResourceCleanupResourceResultFormat,
		"version":    float64(evaluationCapabilityProbeProviderResourceCleanupVersion),
		"resourceId": result.ProviderResourceID, "resourceRole": "primary", "outcome": "deleted",
		"dispatchIntentDigest":   evaluationBoundedExportTestDigest(t, "cleanup-dispatch-"+request.ProtocolFamily+request.CapabilityProfileID),
		"transportReceiptDigest": evaluationBoundedExportTestDigest(t, "cleanup-transport-"+request.ProtocolFamily+request.CapabilityProfileID),
		"completedAt":            evaluationExportInstant(completedAt),
	}
	resourceResultBase["resultDigest"], _ = canonicaljson.Digest(resourceResultBase)
	resourceResults := []any{resourceResultBase}
	resourceResultSetDigest, _ := canonicaljson.Digest(map[string]any{
		"resourceResults": []any{map[string]any{
			"resourceId": result.ProviderResourceID, "resultDigest": resourceResultBase["resultDigest"],
		}},
	})
	cleanupStageDigest, _ := evaluationCapabilityProbeProviderResourceCleanupInnerStageDigest(deletion)
	cleanupDispatchAckDigest, _ := evaluationCapabilityProbeProviderResourceCleanupInnerDispatchAckDigest(
		deletion, resourceResultSetDigest,
	)
	receiptBase := map[string]any{
		"format":                          evaluationCapabilityProbeProviderResourceCleanupReceiptFormat,
		"version":                         float64(evaluationCapabilityProbeProviderResourceCleanupVersion),
		"requestDigest":                   request.RequestDigest,
		"deletionAuthorityReceiptDigest":  result.DeletionAuthorityReceiptDigest,
		"deletionRequestProjectionDigest": stringMember(deletion, "deletionRequestProjectionDigest"),
		"protocolFamily":                  request.ProtocolFamily,
		"providerResourceKind":            stringMember(deletion, "providerResourceKind"),
		"providerResourceId":              result.ProviderResourceID,
		"auxiliaryResourceIds":            []any{}, "cleanupStageDigest": cleanupStageDigest,
		"cleanupDispatchAckDigest": cleanupDispatchAckDigest,
		"resourceResults":          resourceResults, "resourceResultSetDigest": resourceResultSetDigest,
		"completedAt": evaluationExportInstant(completedAt),
	}
	receiptBase["cleanupReceiptDigest"], _ = canonicaljson.Digest(receiptBase)
	receipt, err := decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(receiptBase, deletion)
	if err != nil {
		t.Fatal(err)
	}
	_, _, requestBytes, err := evaluationCapabilityProbeProviderResourceCleanupRequestValue(
		plan.RepositoryCommit, request.RequestDigest, result.DeletionAuthorityReceiptDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	cleanupRequest, err := decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(requestBytes)
	if err != nil {
		t.Fatal(err)
	}
	ownerImplementationDigest := evaluationBoundedExportTestDigest(
		t, "cleanup-owner-"+request.ProtocolFamily+request.CapabilityProfileID,
	)
	stageDigest, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(cleanupRequest, ownerImplementationDigest)
	ownerAdmissionDigest, _ := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
		cleanupRequest.CleanupRequestDigest, stageDigest, ownerImplementationDigest,
	)
	dispatchAckDigest, _ := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
		cleanupRequest.CleanupRequestDigest, stageDigest, ownerAdmissionDigest, receipt.CleanupReceiptDigest,
	)
	resultIngressDigest, _ := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
		cleanupRequest.CleanupRequestDigest, dispatchAckDigest, receipt.CleanupReceiptDigest,
	)
	resultIngressReceiptDigest, _ := evaluationCapabilityProbeProviderResourceCleanupIngressReceiptDigest(
		resultIngressDigest, receipt.CleanupReceiptDigest,
	)
	responseBytes, responseDigest, err := evaluationCapabilityProbeProviderResourceCleanupResponse(
		cleanupRequest, ownerImplementationDigest, receipt,
	)
	if err != nil {
		t.Fatal(err)
	}
	return &evaluationCapabilityProbePlanTestCleanup{
		request: cleanupRequest, receipt: receipt, ownerImplementationDigest: ownerImplementationDigest,
		stageDigest: stageDigest, ownerAdmissionDigest: ownerAdmissionDigest, dispatchAckDigest: dispatchAckDigest,
		resultIngressDigest: resultIngressDigest, resultIngressReceiptDigest: resultIngressReceiptDigest,
		responseDigest: responseDigest, responseBytes: responseBytes, sealedAt: plan.PlannedAt.Add(-time.Minute),
	}
}

func evaluationCapabilityProbePlanTestResource(
	t *testing.T,
	plan evaluationPlanFact,
	authority EvaluationAuthority,
	target map[string]any,
	provider map[string]any,
	model map[string]any,
	program evaluationCapabilityProbeProgram,
) (*evaluationCapabilityProbeProviderResourceRegistrationRequest, *evaluationCapabilityProbeProviderResourceResult, time.Time) {
	t.Helper()
	protocol := stringMember(target, "protocolFamily")
	if stringMember(target, "capabilityProfileId") != "g4-provider-hosted-retrieval-core" &&
		stringMember(target, "capabilityProfileId") != "g4-provider-hosted-retrieval-document" ||
		!oneOfString(protocol, "gemini-interactions", "openai-responses") {
		return nil, nil, time.Time{}
	}
	requestBase := map[string]any{
		"format":      evaluationCapabilityProbeProviderResourceRegistrationRequestFormat,
		"version":     float64(evaluationCapabilityProbeProviderResourceVersion),
		"namespaceId": authority.NamespaceID, "repositoryCommit": plan.RepositoryCommit,
		"providerConfiguration": provider, "modelLineage": model, "probeProgram": program.Value,
		"minimumExpiresAt": evaluationExportInstant(plan.ExpiresAt),
	}
	requestBase["requestDigest"], _ = canonicaljson.Digest(requestBase)
	requestBytes, _ := canonicaljson.Bytes(requestBase)
	request, err := decodeEvaluationCapabilityProbeProviderResourceRegistrationRequest(requestBytes, authority)
	if err != nil {
		t.Fatalf("provider resource request: %v", err)
	}
	registeredAt := plan.PlannedAt.Add(-2 * time.Hour)
	claimedAt := registeredAt.Add(-time.Minute)
	providerResourceID := "probe-resource/" + protocol + "/" + program.ProfileID
	publicResource := program.PublicProbeResource
	manifestBase := map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceManifestFormat,
		"version":       float64(evaluationCapabilityProbeProviderResourceVersion),
		"requestDigest": request.RequestDigest, "probeProgramDigest": request.ProbeProgramDigest,
		"publicResourceDescriptorDigest": request.PublicResourceDigest,
		"protocolFamily":                 protocol, "providerConfigurationId": request.ProviderConfigurationID,
		"modelId": request.ModelID, "modelLineageDigest": request.ModelLineageDigest,
		"adapterDigest":        request.AdapterDigest,
		"providerResourceKind": evaluationCapabilityProbeProviderResourceKindByProtocol[protocol],
		"providerResourceId":   providerResourceID, "contentDigest": publicResource["contentDigest"],
		"documentBytesDigest": publicResource["documentBytesDigest"],
		"registeredAt":        evaluationExportInstant(registeredAt), "expiresAt": evaluationExportInstant(plan.ExpiresAt),
	}
	manifestBase["manifestDigest"], _ = canonicaljson.Digest(manifestBase)
	uploadBase := map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceUploadReceiptFormat,
		"version":       float64(evaluationCapabilityProbeProviderResourceVersion),
		"requestDigest": request.RequestDigest, "resourceManifestDigest": manifestBase["manifestDigest"],
		"publicResourceDescriptorDigest": request.PublicResourceDigest,
		"providerResourceKind":           evaluationCapabilityProbeProviderResourceKindByProtocol[protocol],
		"providerResourceId":             providerResourceID, "contentDigest": publicResource["contentDigest"],
		"documentBytesDigest":    publicResource["documentBytesDigest"],
		"dispatchIntentDigest":   evaluationBoundedExportTestDigest(t, "resource-upload-dispatch-"+protocol+program.ProfileID),
		"transportReceiptDigest": evaluationBoundedExportTestDigest(t, "resource-upload-transport-"+protocol+program.ProfileID),
		"responseSpoolDigest":    evaluationBoundedExportTestDigest(t, "resource-upload-spool-"+protocol+program.ProfileID),
		"uploadedAt":             evaluationExportInstant(registeredAt.Add(-time.Second)),
	}
	uploadBase["contentUploadReceiptDigest"], _ = canonicaljson.Digest(uploadBase)
	deletionProjection := map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceDeletionProjectionFormat,
		"version":       float64(evaluationCapabilityProbeProviderResourceVersion),
		"requestDigest": request.RequestDigest, "protocolFamily": protocol,
		"providerResourceKind": evaluationCapabilityProbeProviderResourceKindByProtocol[protocol],
		"providerResourceId":   providerResourceID, "auxiliaryResourceIds": []any{},
	}
	deletionProjectionDigest, _ := canonicaljson.Digest(deletionProjection)
	deletionBase := map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceDeletionReceiptFormat,
		"version":       float64(evaluationCapabilityProbeProviderResourceVersion),
		"requestDigest": request.RequestDigest, "resourceManifestDigest": manifestBase["manifestDigest"],
		"providerResourceKind": evaluationCapabilityProbeProviderResourceKindByProtocol[protocol],
		"providerResourceId":   providerResourceID, "deletionRouteBinding": "provider-resource.delete",
		"deletionRequestProjection":       deletionProjection,
		"deletionRequestProjectionDigest": deletionProjectionDigest,
		"registeredAt":                    evaluationExportInstant(registeredAt), "expiresAt": evaluationExportInstant(plan.ExpiresAt),
	}
	deletionBase["deletionAuthorityReceiptDigest"], _ = canonicaljson.Digest(deletionBase)
	authorityBase := map[string]any{
		"format":              evaluationCapabilityProbeProviderResourceAuthorityFormat,
		"version":             float64(evaluationCapabilityProbeProviderResourceVersion),
		"capabilityProfileId": program.ProfileID, "probeProgramDigest": program.ProgramDigest,
		"publicResourceDescriptorDigest": request.PublicResourceDigest, "protocolFamily": protocol,
		"providerConfigurationId": request.ProviderConfigurationID, "modelId": request.ModelID,
		"modelLineageDigest": request.ModelLineageDigest, "adapterDigest": request.AdapterDigest,
		"providerResourceKind": evaluationCapabilityProbeProviderResourceKindByProtocol[protocol],
		"providerResourceId":   providerResourceID, "resourceManifestDigest": manifestBase["manifestDigest"],
		"contentUploadReceiptDigest":     uploadBase["contentUploadReceiptDigest"],
		"deletionAuthorityReceiptDigest": deletionBase["deletionAuthorityReceiptDigest"],
		"registeredAt":                   evaluationExportInstant(registeredAt), "expiresAt": evaluationExportInstant(plan.ExpiresAt),
	}
	authorityBase["authorityDigest"], _ = canonicaljson.Digest(authorityBase)
	if _, _, err := evaluationCapabilityProbeProviderResourceCanonicalComponent(
		authorityBase, []string{
			"format", "version", "capabilityProfileId", "probeProgramDigest", "publicResourceDescriptorDigest",
			"protocolFamily", "providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
			"providerResourceKind", "providerResourceId", "resourceManifestDigest", "contentUploadReceiptDigest",
			"deletionAuthorityReceiptDigest", "registeredAt", "expiresAt", "authorityDigest",
		}, evaluationCapabilityProbeProviderResourceAuthorityFormat, "authorityDigest", 16_384,
	); err != nil {
		t.Fatalf("provider resource authority component: %v", err)
	}
	if _, err := decodeEvaluationCapabilityProbeProviderResourceAuthority(
		authorityBase,
		program,
		request.ProtocolFamily,
		request.ProviderConfigurationID,
		request.ModelID,
		request.ModelLineageDigest,
		request.AdapterDigest,
		request.MinimumExpiresAt,
	); err != nil {
		t.Fatalf("provider resource authority: %v", err)
	}
	resultBase := map[string]any{
		"format":  evaluationCapabilityProbeProviderResourceResultFormat,
		"version": float64(evaluationCapabilityProbeProviderResourceVersion), "requestDigest": request.RequestDigest,
		"resourceManifest": manifestBase, "contentUploadReceipt": uploadBase,
		"deletionAuthorityReceipt": deletionBase, "providerResourceAuthority": authorityBase,
	}
	resultBase["resultDigest"], _ = canonicaljson.Digest(resultBase)
	result, err := decodeEvaluationCapabilityProbeProviderResourceResult(resultBase, request, claimedAt, plan.PlannedAt)
	if err != nil {
		t.Fatalf("provider resource result: %v", err)
	}
	return &request, &result, claimedAt
}

func evaluationCapabilityProbePlanTypedReferences(
	t *testing.T,
	request evaluationCapabilityProbeAdmissionRequest,
	program evaluationCapabilityProbeProgram,
	ownerImplementation string,
	authorityIssuer string,
	status string,
	observedAt time.Time,
) ([]any, []string, []map[string]any, map[string]any) {
	t.Helper()
	observedAtText := observedAt.Format("2006-01-02T15:04:05.000Z")
	intent, ok := objectMember(request.ProbeProgram, "providerRequestIntent")
	rawPhases, phasesOK := intent["requestPhases"].([]any)
	if !ok || !phasesOK || len(rawPhases) == 0 {
		t.Fatal("capability probe program has no typed request phases")
	}
	phaseRequests, phaseResponses := make([]any, len(rawPhases)), make([]any, len(rawPhases))
	dispatchIntents, transportReceipts := make([]any, len(rawPhases)), make([]any, len(rawPhases))
	spoolReceipts := make([]any, len(rawPhases))
	requestDigests, responseDigests := make(map[string]string, len(rawPhases)), make(map[string]string, len(rawPhases))
	for index, rawPhase := range rawPhases {
		phase, phaseOK := rawPhase.(string)
		if !phaseOK {
			t.Fatal("capability probe program phase is not a string")
		}
		requestDigest := evaluationBoundedExportTestDigest(t, fmt.Sprintf("plan-probe-%s-request", phase))
		responseDigest := evaluationBoundedExportTestDigest(t, fmt.Sprintf("plan-probe-%s-response", phase))
		dispatchDigest := evaluationBoundedExportTestDigest(t, fmt.Sprintf("plan-probe-%s-dispatch", phase))
		transportDigest := evaluationBoundedExportTestDigest(t, fmt.Sprintf("plan-probe-%s-transport", phase))
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
			"envelopeDigest":          evaluationBoundedExportTestDigest(t, fmt.Sprintf("plan-probe-%s-envelope", phase)),
			"ciphertextDigest":        evaluationBoundedExportTestDigest(t, fmt.Sprintf("plan-probe-%s-ciphertext", phase)),
			"ciphertextByteLength":    int64(1_024),
			"aadDigest":               evaluationBoundedExportTestDigest(t, fmt.Sprintf("plan-probe-%s-aad", phase)),
			"encryptionProfileDigest": evaluationBoundedExportTestDigest(t, "plan-probe-encryption-profile"),
			"keyRefDigest":            evaluationBoundedExportTestDigest(t, "plan-probe-key-ref"),
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
			"adapterDigest": request.AdapterDigest, "ownerImplementationDigest": ownerImplementation,
			"authorityIssuerId": authorityIssuer, "observedAt": observedAtText,
		}
	}
	sources := make([]map[string]any, len(evaluationCapabilityProbeReferenceKinds))
	sources[0] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[0])
	sources[0]["phaseRequests"], sources[0]["requestPhaseSetDigest"] = phaseRequests, requestSetDigest
	resourceDigest := any(nil)
	if resource, resourceOK := intent["publicProbeResource"].(map[string]any); resourceOK {
		resourceDigest = resource["descriptorDigest"]
	}
	sources[0]["publicProbeResourceDescriptorDigest"] = resourceDigest
	sources[1] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[1])
	sources[1]["phaseResponses"], sources[1]["responsePhaseSetDigest"] = phaseResponses, responseSetDigest
	sources[1]["terminalResponseDigest"] = responseDigests[rawPhases[len(rawPhases)-1].(string)]
	sources[2] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[2])
	sources[2]["dispatchIntents"], sources[2]["dispatchIntentSetDigest"] = dispatchIntents, dispatchSetDigest
	sources[3] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[3])
	sources[3]["transportReceipts"], sources[3]["transportReceiptSetDigest"] = transportReceipts, transportSetDigest
	sources[4] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[4])
	sources[4]["encryptionPolicyDigest"] = evaluationBoundedExportTestDigest(t, "plan-probe-encryption-policy")
	sources[4]["spoolReceipts"], sources[4]["spoolReceiptSetDigest"] = spoolReceipts, spoolSetDigest

	entries := make([]any, len(evaluationCapabilityProbeReferenceKinds))
	digests := make([]string, len(entries))
	receipts := make([]map[string]any, len(entries))
	wrap := func(index int) {
		sourceDigest, err := canonicaljson.Digest(sources[index])
		if err != nil {
			t.Fatal(err)
		}
		receipt := map[string]any{
			"format": evaluationCapabilityProbeReferenceFormats[index], "version": int64(1),
			"admissionRequestDigest":               request.RequestDigest,
			"providerConfigurationDigest":          request.ProviderConfigurationDigest,
			"modelLineageDigest":                   request.ModelLineageDigest,
			"qualificationCapabilityProfileDigest": request.QualificationCapabilityProfileDigest,
			"capabilityId":                         request.CapabilityID, "adapterDigest": request.AdapterDigest,
			"probeProgramDigest": request.ProbeProgramDigest, "profileProjectionDigest": request.ProfileProjectionDigest,
			"ownerImplementationDigest": ownerImplementation, "authorityIssuerId": authorityIssuer,
			"previousReceiptDigest": func() any {
				if index == 0 {
					return nil
				}
				return digests[index-1]
			}(),
			"observedAt": observedAtText, "sourceReceipt": sources[index], "sourceReceiptDigest": sourceDigest,
		}
		digest, err := canonicaljson.Digest(receipt)
		if err != nil {
			t.Fatal(err)
		}
		digests[index], receipts[index] = digest, receipt
		entries[index] = map[string]any{
			"kind": evaluationCapabilityProbeReferenceKinds[index], "receipt": receipt, "receiptDigest": digest,
		}
	}
	for index := 0; index < 5; index++ {
		wrap(index)
	}
	trace := map[string]any{
		"requests": requestDigests, "responses": responseDigests,
		"terminalResponseDigest":          sources[1]["terminalResponseDigest"],
		"bindSemanticProof":               true,
		"requestBytes":                    float64(len(rawPhases) * 512),
		"responseBytes":                   float64(len(rawPhases) * 1_024),
		"providerRoundTripCount":          float64(len(rawPhases)),
		"observedMaximumSingleDispatchMs": float64(1_000),
		"observedExecutionDurationMs":     float64(len(rawPhases) * 1_000),
	}
	observation := evaluationCapabilityProbeTestObservation(t, request, digests, status, observedAt, trace)
	if _, hasPoll := requestDigests["poll"]; hasPoll {
		limits, limitsOK := objectMember(observation, "observedLimits")
		if !limitsOK {
			t.Fatal("capability probe observation has no observed limits")
		}
		limits["pollAttemptCount"] = int64(1)
		delete(limits, "limitDigest")
		limitDigest, err := canonicaljson.Digest(limits)
		if err != nil {
			t.Fatal(err)
		}
		limits["limitDigest"] = limitDigest
		observation["observedLimitDigest"] = limitDigest
	}
	projection := cloneEvaluationObject(observation)
	delete(projection, "normalizedEventSetDigest")
	delete(projection, "observationDigest")
	projectionDigest, err := canonicaljson.Digest(projection)
	if err != nil {
		t.Fatal(err)
	}
	sources[5] = commonSource(evaluationCapabilityProbeReferenceSourceFormats[5])
	sources[5]["normalizedObservationProjection"] = projection
	sources[5]["normalizedObservationProjectionDigest"] = projectionDigest
	sources[5]["normalizerImplementationDigest"] = evaluationBoundedExportTestDigest(t, "plan-probe-normalizer")
	if proof, proofOK := objectMember(projection, "semanticProof"); proofOK {
		leaves, err := evaluationCapabilityProbeSemanticProofPhaseLeaves(program, proof)
		if err != nil {
			t.Fatal(err)
		}
		sources[5]["semanticProofPhaseLeaves"] = leaves
		sources[5]["semanticProofPhaseLeavesDigest"] = leaves["projectionDigest"]
	} else {
		sources[5]["semanticProofPhaseLeaves"] = nil
		sources[5]["semanticProofPhaseLeavesDigest"] = nil
	}
	wrap(5)
	observation["normalizedEventSetDigest"] = digests[5]
	recomputeEvaluationProviderObservationTestDigest(t, observation, "observationDigest")
	return entries, digests, receipts, observation
}

func evaluationCapabilityProbeTestQualificationBundleDigest(t *testing.T, targets []any) string {
	t.Helper()
	protocols := []string{"anthropic-messages", "gemini-interactions", "openai-responses"}
	profiles := []string{
		"g4-provider-background-job", "g4-provider-hosted-retrieval-core",
		"g4-provider-hosted-retrieval-document", "g4-provider-isolated-cache",
		"g4-provider-parallel-tool", "g4-provider-reasoning-continuation",
	}
	factBackedProfiles := []string{
		"g4-provider-background-job", "g4-provider-hosted-retrieval-core",
		"g4-provider-hosted-retrieval-document", "g4-provider-isolated-cache",
		"g4-provider-reasoning-continuation",
	}
	byKey := make(map[string]map[string]any, 18)
	for _, raw := range targets {
		target := raw.(map[string]any)
		if _, optional := objectMember(target, "optionalCapabilitySupportAuthority"); optional {
			byKey[stringMember(target, "protocolFamily")+"\x00"+stringMember(target, "capabilityProfileId")] = target
		}
	}
	probeSet, runtimeSet, cleanupSet := make([]any, 0, 18), make([]any, 0, 15), make([]any, 0, 4)
	for _, protocol := range protocols {
		for _, profile := range profiles {
			target := byKey[protocol+"\x00"+profile]
			authority, _ := objectMember(target, "optionalCapabilitySupportAuthority")
			evidence, _ := objectMember(authority, "probeEvidence")
			probeSet = append(probeSet, map[string]any{
				"protocolFamily": protocol, "profileId": profile, "evidenceDigest": stringMember(evidence, "evidenceDigest"),
			})
		}
		for _, profile := range factBackedProfiles {
			target := byKey[protocol+"\x00"+profile]
			authority, _ := objectMember(target, "optionalCapabilitySupportAuthority")
			runtime, _ := objectMember(authority, "runtimeFactSourceAuthority")
			runtimeSet = append(runtimeSet, map[string]any{
				"protocolFamily": protocol, "profileId": profile, "authorityDigest": stringMember(runtime, "authorityDigest"),
			})
		}
		if protocol != "anthropic-messages" {
			for _, profile := range []string{"g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document"} {
				target := byKey[protocol+"\x00"+profile]
				authority, _ := objectMember(target, "optionalCapabilitySupportAuthority")
				cleanup, _ := objectMember(authority, "probeProviderResourceCleanupReceipt")
				cleanupSet = append(cleanupSet, map[string]any{
					"protocolFamily": protocol, "profileId": profile,
					"cleanupReceiptDigest": stringMember(cleanup, "cleanupReceiptDigest"),
				})
			}
		}
	}
	probeSetDigest, _ := canonicaljson.Digest(map[string]any{"authorities": probeSet})
	runtimeSetDigest, _ := canonicaljson.Digest(map[string]any{"authorities": runtimeSet})
	cleanupSetDigest, _ := canonicaljson.Digest(map[string]any{"cleanupReceipts": cleanupSet})
	digest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-production-evaluation-qualification-authority-bundle", "version": int64(1),
		"capabilityProbeAuthoritySetDigest": probeSetDigest, "runtimeFactSourceAuthoritySetDigest": runtimeSetDigest,
		"providerResourceCleanupReceiptSetDigest": cleanupSetDigest,
	})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationCapabilityProbeTestApplyQualificationBundle(t *testing.T, plan *evaluationPlanFact) {
	t.Helper()
	rawTargets := plan.Value["capabilityQualificationTargets"].([]any)
	bundleDigest := evaluationCapabilityProbeTestQualificationBundleDigest(t, rawTargets)
	for _, raw := range rawTargets {
		target := raw.(map[string]any)
		optionalAuthority, optional := objectMember(target, "optionalCapabilitySupportAuthority")
		if !optional {
			continue
		}
		optionalAuthority["qualificationAuthorityBundleDigest"] = bundleDigest
		delete(optionalAuthority, "authorityDigest")
		optionalAuthorityDigest, err := canonicaljson.Digest(optionalAuthority)
		if err != nil {
			t.Fatal(err)
		}
		optionalAuthority["authorityDigest"] = optionalAuthorityDigest
		delete(target, "targetDigest")
		targetDigest, err := canonicaljson.Digest(target)
		if err != nil {
			t.Fatal(err)
		}
		target["targetDigest"] = targetDigest
	}
	delete(plan.Value, "planDigest")
	planDigest, err := canonicaljson.Digest(plan.Value)
	if err != nil {
		t.Fatal(err)
	}
	plan.Value["planDigest"], plan.PlanDigest = planDigest, planDigest
}

func evaluationCapabilityProbePlanTestAdmissions(
	t *testing.T,
	plan *evaluationPlanFact,
	authority EvaluationAuthority,
	preferExistingProbeProgram bool,
) []evaluationCapabilityProbePlanTestAdmission {
	t.Helper()
	providers := make(map[string]map[string]any)
	for _, raw := range plan.Value["providerConfigurations"].([]any) {
		provider := raw.(map[string]any)
		providers[stringMember(provider, "providerConfigurationId")] = provider
	}
	models := make(map[string]map[string]any)
	for _, raw := range plan.Value["modelConfigurations"].([]any) {
		model := raw.(map[string]any)
		models[stringMember(model, "lineageDigest")] = model
	}
	result := make([]evaluationCapabilityProbePlanTestAdmission, 0, 18)
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		target := raw.(map[string]any)
		optionalAuthority, optional := objectMember(target, "optionalCapabilitySupportAuthority")
		if !optional {
			continue
		}
		provider := providers[stringMember(target, "providerConfigurationId")]
		model := models[stringMember(target, "modelLineageDigest")]
		originalEvidence, _ := objectMember(optionalAuthority, "probeEvidence")
		ownerImplementation := stringMember(originalEvidence, "ownerImplementationDigest")
		authorityIssuer := stringMember(originalEvidence, "authorityIssuerId")
		program, err := expectedEvaluationCapabilityProbeProgram(
			stringMember(optionalAuthority, "qualificationCapabilityProfileId"),
			stringMember(optionalAuthority, "qualificationCapabilityProfileDigest"),
		)
		if err != nil {
			t.Fatalf("target %s capability probe evidence: %v", stringMember(target, "targetId"), err)
		}
		resourceRequest, resourceResult, resourceClaimedAt := evaluationCapabilityProbePlanTestResource(
			t, *plan, authority, target, provider, model, program,
		)
		if resourceResult != nil {
			optionalAuthority["probeProviderResourceAuthority"] = resourceResult.ProviderResourceAuthority
			optionalAuthority["probeProviderResourceDeletionAuthorityReceipt"] = resourceResult.DeletionAuthorityReceipt
		} else {
			delete(optionalAuthority, "probeProviderResourceAuthority")
			delete(optionalAuthority, "probeProviderResourceDeletionAuthorityReceipt")
			delete(optionalAuthority, "probeProviderResourceCleanupReceipt")
		}
		var resourceCleanup *evaluationCapabilityProbePlanTestCleanup
		if resourceRequest != nil && resourceResult != nil {
			resourceCleanup = evaluationCapabilityProbePlanTestResourceCleanup(
				t, *plan, *resourceRequest, *resourceResult,
			)
			optionalAuthority["probeProviderResourceCleanupReceipt"] = resourceCleanup.receipt.Value
		}
		requestBase := map[string]any{
			"format": evaluationCapabilityProbeAdmissionRequestFormat, "version": evaluationCapabilityProbeAdmissionVersion,
			"namespaceId": authority.NamespaceID, "repositoryCommit": plan.RepositoryCommit,
			"providerConfiguration": provider, "modelLineage": model,
			"qualificationCapabilityProfileId":     stringMember(optionalAuthority, "qualificationCapabilityProfileId"),
			"qualificationCapabilityProfileDigest": stringMember(optionalAuthority, "qualificationCapabilityProfileDigest"),
			"capabilityId":                         stringMember(optionalAuthority, "capabilityId"),
			"declaredCapabilityProfileDigests":     optionalAuthority["declaredCapabilityProfileDigests"],
			"probeProgram": func() any {
				if preferExistingProbeProgram {
					if existing := originalEvidence["probeProgram"]; existing != nil {
						return existing
					}
				}
				return program.Value
			}(),
			"probeProviderResourceAuthority": func() any {
				if resourceResult == nil {
					return nil
				}
				return resourceResult.ProviderResourceAuthority
			}(),
			"minimumExpiresAt": plan.ExpiresAt.Format("2006-01-02T15:04:05.000Z"),
		}
		requestDigest, err := canonicaljson.Digest(requestBase)
		if err != nil {
			t.Fatal(err)
		}
		requestBase["requestDigest"] = requestDigest
		requestBytes, err := canonicaljson.Bytes(requestBase)
		if err != nil {
			t.Fatal(err)
		}
		request, err := decodeEvaluationCapabilityProbeAdmissionRequest(requestBytes, authority)
		if err != nil {
			t.Fatal(err)
		}
		stageDigest, err := evaluationCapabilityProbeStageDigest(request, ownerImplementation)
		if err != nil {
			t.Fatal(err)
		}
		status := "unsupported"
		if stringMember(optionalAuthority, "supportExpectation") == "required" {
			status = "supported"
		}
		observedAt := plan.PlannedAt.Add(-time.Hour)
		referenceEntries, referenceDigests, referenceReceiptObjects, observation := evaluationCapabilityProbePlanTypedReferences(
			t, request, program, ownerImplementation, authorityIssuer, status, observedAt,
		)
		declaredDigest, err := canonicaljson.Digest(optionalAuthority["declaredCapabilityProfileDigests"])
		if err != nil {
			t.Fatal(err)
		}
		observedLimitDigest := stringMember(observation, "observedLimitDigest")
		probedCapabilityBase := map[string]any{
			"normalizedObservationDigest": stringMember(observation, "observationDigest"),
			"observedLimitDigest":         observedLimitDigest, "observedProfileDigest": nil,
			"probeProgramDigest":      request.ProbeProgramDigest,
			"profileProjectionDigest": request.ProfileProjectionDigest, "status": status,
		}
		if status == "supported" {
			probedCapabilityBase["observedProfileDigest"] = request.QualificationCapabilityProfileDigest
		}
		probedCapabilityDigest, err := canonicaljson.Digest(probedCapabilityBase)
		if err != nil {
			t.Fatal(err)
		}
		receiptBase := map[string]any{
			"probeId":                     "probe/" + stringMember(target, "targetId"),
			"providerConfigurationDigest": request.ProviderConfigurationDigest,
			"modelLineageDigest":          request.ModelLineageDigest,
			"requestedProfileDigest":      request.QualificationCapabilityProfileDigest,
			"declaredCapabilityDigest":    declaredDigest, "probedCapabilityDigest": probedCapabilityDigest,
			"status": status, "observedLimitDigest": observedLimitDigest,
			"probeProgramDigest":          request.ProbeProgramDigest,
			"profileProjectionDigest":     request.ProfileProjectionDigest,
			"normalizedObservationDigest": stringMember(observation, "observationDigest"),
			"probedAt":                    observedAt.Format("2006-01-02T15:04:05.000Z"),
			"expiresAt":                   plan.ExpiresAt.Format("2006-01-02T15:04:05.000Z"),
		}
		if status == "supported" {
			receiptBase["observedProfileDigest"] = request.QualificationCapabilityProfileDigest
		}
		receiptDigest, err := canonicaljson.Digest(receiptBase)
		if err != nil {
			t.Fatal(err)
		}
		receiptBase["receiptDigest"] = receiptDigest
		evidenceBase := map[string]any{
			"authorityKind": "sealed-provider-capability-probe", "authorityIssuerId": authorityIssuer,
			"ownerImplementationDigest": ownerImplementation, "adapterDigest": request.AdapterDigest,
			"probeRequestDigest": referenceDigests[0], "probeResponseDigest": referenceDigests[1],
			"dispatchReceiptDigest": referenceDigests[2], "transportReceiptDigest": referenceDigests[3],
			"responseSpoolDigest": referenceDigests[4], "normalizedEventSetDigest": referenceDigests[5],
			"probeProgram": request.ProbeProgram, "normalizedObservation": observation, "receipt": receiptBase,
		}
		evidenceDigest, err := canonicaljson.Digest(evidenceBase)
		if err != nil {
			t.Fatal(err)
		}
		evidenceBase["evidenceDigest"] = evidenceDigest
		optionalAuthority["probeEvidence"] = evidenceBase
		delete(optionalAuthority, "authorityDigest")
		authorityDigest, err := canonicaljson.Digest(optionalAuthority)
		if err != nil {
			t.Fatal(err)
		}
		optionalAuthority["authorityDigest"] = authorityDigest
		delete(target, "targetDigest")
		targetDigest, err := canonicaljson.Digest(target)
		if err != nil {
			t.Fatal(err)
		}
		target["targetDigest"] = targetDigest
		evidenceBytes, _ := canonicaljson.Bytes(evidenceBase)
		referenceBytes, _ := canonicaljson.Bytes(referenceEntries)
		observationBytes, _ := canonicaljson.Bytes(observation)
		canonicalObservation, _ := decodeCanonicalEvaluationObject(
			observationBytes, maximumEvaluationCapabilityProbeObservationBytes,
		)
		if _, _, err := decodeEvaluationCapabilityProbeObservation(canonicalObservation, program, request); err != nil {
			t.Fatalf("target %s normalized observation: %v", stringMember(target, "targetId"), err)
		}
		if _, _, err := evaluationCapabilityProbeReferenceBundle(
			referenceBytes, evidenceBase, request, ownerImplementation,
		); err != nil {
			t.Fatalf("target %s reference bundle: %v", stringMember(target, "targetId"), err)
		}
		ownerAdmissionDigest, err := evaluationCapabilityProbeOwnerAdmissionDigest(
			request.RequestDigest, evidenceDigest, ownerImplementation, stageDigest,
		)
		if err != nil {
			t.Fatal(err)
		}
		sealed, err := evaluationCapabilityProbeEvidence(
			request, ownerImplementation, stageDigest,
			EvaluationCapabilityProbeAdmissionAuthorityResult{
				ProbeEvidence: evidenceBytes, OwnerAdmissionDigest: ownerAdmissionDigest,
			},
			referenceBytes,
			plan.PlannedAt,
		)
		if err != nil {
			t.Fatalf("target %s sealed capability probe evidence: %v", stringMember(target, "targetId"), err)
		}
		result = append(result, evaluationCapabilityProbePlanTestAdmission{
			target: target, optionalAuthority: optionalAuthority, evidence: evidenceBase, receipt: receiptBase,
			request: request, ownerImplementation: ownerImplementation, authorityIssuer: authorityIssuer,
			sealed: sealed, referenceReceiptObjects: referenceReceiptObjects,
			resourceRequest: resourceRequest, resourceResult: resourceResult, resourceClaimedAt: resourceClaimedAt,
			resourceCleanup: resourceCleanup,
		})
	}
	if len(result) != 18 {
		t.Fatalf("optional probe admissions=%d, want 18", len(result))
	}
	evaluationCapabilityProbeTestApplyQualificationBundle(t, plan)
	return result
}

var evaluationCapabilityProbePlanAdmissionColumns = []string{
	"request_digest", "provider_configuration_id", "provider_configuration_digest", "protocol_family",
	"model_id", "model_lineage_digest", "qualification_capability_profile_id",
	"qualification_capability_profile_digest", "capability_id", "declared_capability_profile_set_digest",
	"adapter_digest", "owner_implementation_digest", "authority_issuer_id", "probe_receipt_digest",
	"probe_status", "observed_profile_digest", "probed_at", "expires_at", "request_bytes", "response_bytes",
	"owner_admission_digest", "stage_digest", "dispatch_ack_digest", "reference_receipt_set_digest",
	"admission_receipt_digest", "response_digest", "reference_bundle_bytes",
}

func expectEvaluationCapabilityProbePlanAdmission(
	t *testing.T,
	mock sqlmock.Sqlmock,
	plan evaluationPlanFact,
	authority EvaluationAuthority,
	admission evaluationCapabilityProbePlanTestAdmission,
	ownerImplementation string,
	resourceExists bool,
	registrationExists ...bool,
) {
	t.Helper()
	observedProfile := any(nil)
	if admission.sealed.ObservedProfileDigest != "" {
		observedProfile = admission.sealed.ObservedProfileDigest
	}
	mock.ExpectQuery(`SELECT\s+request_digest, provider_configuration_id`).
		WithArgs(authority.NamespaceID, plan.RepositoryCommit, admission.sealed.EvidenceDigest).
		WillReturnRows(sqlmock.NewRows(evaluationCapabilityProbePlanAdmissionColumns).AddRow(
			admission.request.RequestDigest, admission.request.ProviderConfigurationID,
			admission.request.ProviderConfigurationDigest, admission.request.ProtocolFamily,
			admission.request.ModelID, admission.request.ModelLineageDigest,
			admission.request.QualificationCapabilityProfileID, admission.request.QualificationCapabilityProfileDigest,
			admission.request.CapabilityID, admission.request.DeclaredCapabilityProfileSetDigest,
			admission.request.AdapterDigest, ownerImplementation, admission.authorityIssuer,
			admission.sealed.ProbeReceiptDigest, admission.sealed.ProbeStatus, observedProfile,
			admission.sealed.ProbedAt, admission.sealed.ExpiresAt, admission.request.Bytes, admission.sealed.ResponseBytes,
			admission.sealed.OwnerAdmissionDigest, mustEvaluationCapabilityProbeStageDigest(t, admission),
			admission.sealed.DispatchAckDigest, admission.sealed.ReferenceReceiptSetDigest,
			admission.sealed.AdmissionReceiptDigest, admission.sealed.ResponseDigest,
			admission.sealed.ReferenceBundleBytes,
		))
	if ownerImplementation != admission.ownerImplementation {
		return
	}
	for index, referenceReceipt := range admission.referenceReceiptObjects {
		receiptBytes, err := canonicaljson.Bytes(referenceReceipt)
		if err != nil {
			t.Fatal(err)
		}
		entryValues, err := decodeEvaluationCapabilityProbeReferenceValues(admission.sealed.ReferenceBundleBytes)
		if err != nil {
			t.Fatal(err)
		}
		entry := entryValues[index].(map[string]any)
		mock.ExpectQuery(`SELECT kind, receipt_digest, source_receipt_digest, receipt_bytes`).
			WithArgs(authority.NamespaceID, plan.RepositoryCommit, admission.request.RequestDigest, index).
			WillReturnRows(sqlmock.NewRows([]string{
				"kind", "receipt_digest", "source_receipt_digest", "receipt_bytes",
			}).AddRow(
				stringMember(entry, "kind"), stringMember(entry, "receiptDigest"),
				stringMember(referenceReceipt, "sourceReceiptDigest"), receiptBytes,
			))
	}
	if admission.resourceRequest != nil && admission.resourceResult != nil {
		resource := admission.resourceResult
		mock.ExpectQuery(`SELECT\s+request_digest,resource_result_digest,resource_manifest_digest`).
			WithArgs(authority.NamespaceID, plan.RepositoryCommit, resource.ProviderResourceAuthorityDigest).
			WillReturnRows(func() *sqlmock.Rows {
				rows := sqlmock.NewRows([]string{
					"request_digest", "resource_result_digest", "resource_manifest_digest", "content_upload_receipt_digest",
					"deletion_authority_receipt_digest", "provider_resource_authority_digest", "registered_at", "expires_at",
					"request_bytes", "result_bytes", "claimed_at",
				})
				if !resourceExists {
					return rows
				}
				return rows.AddRow(
					admission.resourceRequest.RequestDigest, resource.ResultDigest, resource.ResourceManifestDigest,
					resource.ContentUploadReceiptDigest, resource.DeletionAuthorityReceiptDigest,
					resource.ProviderResourceAuthorityDigest, resource.RegisteredAt, resource.ExpiresAt,
					admission.resourceRequest.Bytes, resource.Bytes, admission.resourceClaimedAt,
				)
			}())
		if !resourceExists {
			return
		}
		for _, component := range []struct {
			digest string
			bytes  []byte
		}{
			{resource.ResourceManifestDigest, resource.ResourceManifestBytes},
			{resource.ContentUploadReceiptDigest, resource.ContentUploadReceiptBytes},
			{resource.DeletionAuthorityReceiptDigest, resource.DeletionAuthorityReceiptBytes},
		} {
			mock.ExpectQuery(`SELECT receipt_bytes FROM ae_cppr_`).
				WithArgs(authority.NamespaceID, plan.RepositoryCommit, admission.resourceRequest.RequestDigest, component.digest).
				WillReturnRows(sqlmock.NewRows([]string{"receipt_bytes"}).AddRow(component.bytes))
		}
		cleanup := admission.resourceCleanup
		if cleanup == nil {
			t.Fatal("resource-backed admission has no cleanup fixture")
		}
		cleanupExists := true
		if len(registrationExists) > 1 {
			cleanupExists = registrationExists[1]
		}
		cleanupRows := sqlmock.NewRows([]string{
			"owner_implementation_digest", "stage_digest", "cleanup_receipt_digest", "owner_admission_digest",
			"dispatch_ack_digest", "result_ingress_digest", "result_ingress_receipt_digest", "response_digest",
			"request_bytes", "receipt_bytes", "response_bytes", "completed_at", "sealed_at",
		})
		if cleanupExists {
			cleanupRows.AddRow(
				cleanup.ownerImplementationDigest, cleanup.stageDigest, cleanup.receipt.CleanupReceiptDigest,
				cleanup.ownerAdmissionDigest, cleanup.dispatchAckDigest, cleanup.resultIngressDigest,
				cleanup.resultIngressReceiptDigest, cleanup.responseDigest, cleanup.request.Bytes,
				cleanup.receipt.Bytes, cleanup.responseBytes, cleanup.receipt.CompletedAt, cleanup.sealedAt,
			)
		}
		mock.ExpectQuery(`SELECT\s+c.owner_implementation_digest,c.stage_digest,c.cleanup_receipt_digest`).
			WithArgs(authority.NamespaceID, plan.RepositoryCommit, cleanup.request.CleanupRequestDigest,
				admission.resourceRequest.RequestDigest, resource.DeletionAuthorityReceiptDigest).
			WillReturnRows(cleanupRows)
		if !cleanupExists {
			return
		}
	}
	runtimeAuthority, factBacked := objectMember(admission.optionalAuthority, "runtimeFactSourceAuthority")
	if factBacked {
		exists := true
		if len(registrationExists) > 0 {
			exists = registrationExists[0]
		}
		mock.ExpectQuery(`SELECT EXISTS`).WithArgs(
			authority.NamespaceID, plan.RepositoryCommit, stringMember(runtimeAuthority, "registrationReceiptDigest"),
			stringMember(runtimeAuthority, "kind"), stringMember(runtimeAuthority, "sourceKind"),
			stringMember(runtimeAuthority, "sourceAuthorityId"),
			stringMember(runtimeAuthority, "sourceAuthorityImplementationDigest"),
			stringMember(runtimeAuthority, "routeBinding"), stringMember(runtimeAuthority, "capabilityProfileId"),
			stringMember(runtimeAuthority, "capabilityProfileDigest"), stringMember(runtimeAuthority, "capabilityId"),
			stringMember(runtimeAuthority, "protocolFamily"), stringMember(runtimeAuthority, "providerConfigurationId"),
			stringMember(runtimeAuthority, "modelId"), stringMember(runtimeAuthority, "modelLineageDigest"),
			stringMember(runtimeAuthority, "adapterDigest"), stringMember(runtimeAuthority, "registrationAuthorityIssuerId"),
			plan.ExpiresAt, plan.PlannedAt,
		).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(exists))
	}
}

func mustEvaluationCapabilityProbeStageDigest(
	t *testing.T,
	admission evaluationCapabilityProbePlanTestAdmission,
) string {
	t.Helper()
	digest, err := evaluationCapabilityProbeStageDigest(admission.request, admission.ownerImplementation)
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func TestEvaluationPlanCapabilityProbeAdmissionPreflightRequiresExactDurableAuthorities(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.probe-plan-test", NamespaceID: "evaluation.probe-plan-test",
	}
	admissions := evaluationCapabilityProbePlanTestAdmissions(t, &plan, authority, false)

	for name, configure := range map[string]func(sqlmock.Sqlmock){
		"exact sealed authorities": func(mock sqlmock.Sqlmock) {
			for _, admission := range admissions {
				expectEvaluationCapabilityProbePlanAdmission(
					t, mock, plan, authority, admission, admission.ownerImplementation, true,
				)
			}
		},
		"missing sealed authority": func(mock sqlmock.Sqlmock) {
			mock.ExpectQuery(`SELECT\s+request_digest, provider_configuration_id`).
				WithArgs(authority.NamespaceID, plan.RepositoryCommit, admissions[0].sealed.EvidenceDigest).
				WillReturnRows(sqlmock.NewRows(evaluationCapabilityProbePlanAdmissionColumns))
		},
		"swapped owner authority": func(mock sqlmock.Sqlmock) {
			expectEvaluationCapabilityProbePlanAdmission(
				t, mock, plan, authority, admissions[0], evaluationBoundedExportTestDigest(t, "swapped-owner"), true,
			)
		},
		"missing sealed runtime registration": func(mock sqlmock.Sqlmock) {
			expectEvaluationCapabilityProbePlanAdmission(
				t, mock, plan, authority, admissions[0], admissions[0].ownerImplementation, true, false,
			)
		},
		"missing sealed provider resource": func(mock sqlmock.Sqlmock) {
			for _, admission := range admissions {
				if admission.resourceRequest != nil {
					expectEvaluationCapabilityProbePlanAdmission(
						t, mock, plan, authority, admission, admission.ownerImplementation, false,
					)
					return
				}
				expectEvaluationCapabilityProbePlanAdmission(
					t, mock, plan, authority, admission, admission.ownerImplementation, true,
				)
			}
			t.Fatal("resource-backed probe admission is missing")
		},
		"missing sealed provider resource cleanup": func(mock sqlmock.Sqlmock) {
			for _, admission := range admissions {
				if admission.resourceRequest != nil {
					expectEvaluationCapabilityProbePlanAdmission(
						t, mock, plan, authority, admission, admission.ownerImplementation, true, true, false,
					)
					return
				}
				expectEvaluationCapabilityProbePlanAdmission(
					t, mock, plan, authority, admission, admission.ownerImplementation, true,
				)
			}
			t.Fatal("resource-backed cleanup admission is missing")
		},
	} {
		t.Run(name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectBegin()
			tx, err := database.BeginTx(context.Background(), &sql.TxOptions{Isolation: sql.LevelSerializable})
			if err != nil {
				t.Fatal(err)
			}
			configure(mock)
			links, preflightErr := evaluationPlanCapabilityProbeAdmissions(
				context.Background(), tx, authority, plan,
			)
			mock.ExpectRollback()
			_ = tx.Rollback()
			if name == "exact sealed authorities" {
				if preflightErr != nil || len(links) != len(admissions) {
					t.Fatalf("links=%d err=%v", len(links), preflightErr)
				}
			} else if preflightErr == nil {
				t.Fatal("plan admission accepted missing or swapped sealed authority")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestEvaluationPlanCapabilityProbeAdmissionRejectsRecomputedBundleWithoutSealedRuntimeRegistration(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.probe-plan-recomputed-test", NamespaceID: "evaluation.probe-plan-recomputed-test",
	}
	admissions := evaluationCapabilityProbePlanTestAdmissions(t, &plan, authority, false)
	first := admissions[0]
	runtimeAuthority, ok := objectMember(first.optionalAuthority, "runtimeFactSourceAuthority")
	if !ok {
		t.Fatal("first optional target has no runtime fact source authority")
	}
	forgedReceipt, err := canonicaljson.Digest(map[string]any{
		"registration": "offline-recomputed", "profileId": stringMember(first.target, "capabilityProfileId"),
	})
	if err != nil {
		t.Fatal(err)
	}
	runtimeAuthority["registrationReceiptDigest"] = forgedReceipt
	delete(runtimeAuthority, "authorityDigest")
	runtimeAuthority["authorityDigest"], err = canonicaljson.Digest(runtimeAuthority)
	if err != nil {
		t.Fatal(err)
	}
	evaluationCapabilityProbeTestApplyQualificationBundle(t, &plan)

	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectBegin()
	tx, err := database.BeginTx(context.Background(), &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatal(err)
	}
	expectEvaluationCapabilityProbePlanAdmission(
		t, mock, plan, authority, first, first.ownerImplementation, true, false,
	)
	if _, err := evaluationPlanCapabilityProbeAdmissions(context.Background(), tx, authority, plan); err == nil {
		t.Fatal("fully recomputed qualification bundle without a sealed runtime registration was accepted")
	}
	mock.ExpectRollback()
	_ = tx.Rollback()
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestStoreEvaluationPlanRunsCapabilityProbePreflightBeforeInsert(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.probe-plan-put-test", NamespaceID: "evaluation.probe-plan-put-test",
	}
	firstOptionalEvidenceDigest := ""
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		target := raw.(map[string]any)
		optionalAuthority, optional := objectMember(target, "optionalCapabilitySupportAuthority")
		if !optional {
			continue
		}
		evidence, _ := objectMember(optionalAuthority, "probeEvidence")
		firstOptionalEvidenceDigest = stringMember(evidence, "evidenceDigest")
		break
	}
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT\s+request_digest, provider_configuration_id`).
		WithArgs(authority.NamespaceID, plan.RepositoryCommit, firstOptionalEvidenceDigest).
		WillReturnRows(sqlmock.NewRows(evaluationCapabilityProbePlanAdmissionColumns))
	mock.ExpectRollback()
	if _, _, err := NewRepository(database).StoreEvaluationPlan(
		context.Background(), authority, vector.Facts.Plan,
	); err == nil {
		t.Fatal("plan PUT without a sealed capability probe authority was accepted")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
