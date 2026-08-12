package agent

import (
	"context"
	"errors"
	"sort"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationHostedArchiveTestRegistration struct {
	protocolFamily      string
	capabilityProfileID string
	intentDigest        string
	request             map[string]any
	authority           map[string]any
	result              map[string]any
}

func evaluationHostedArchiveTestDigest(t *testing.T, label string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"label": label})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationHostedArchiveTestSelfDigest(
	t *testing.T,
	format string,
	digestKey string,
	fields map[string]any,
) map[string]any {
	t.Helper()
	value := map[string]any{"format": format, "version": int64(1)}
	for key, field := range fields {
		value[key] = field
	}
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value[digestKey] = digest
	return value
}

func evaluationHostedArchiveTestRecomputeSelfDigest(t *testing.T, value map[string]any, digestKey string) {
	t.Helper()
	delete(value, digestKey)
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value[digestKey] = digest
}

func evaluationHostedArchiveTestCanonicalBytes(t *testing.T, value map[string]any) []byte {
	t.Helper()
	evaluationHostedArchiveTestRecomputeSelfDigest(t, value, "recordDigest")
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return canonical
}

func evaluationHostedArchiveTestResultSetDigest(t *testing.T, results []any) string {
	t.Helper()
	digests := make([]any, len(results))
	for index, rawResult := range results {
		result, ok := rawResult.(map[string]any)
		if !ok {
			t.Fatalf("cleanup result %d is not an object", index)
		}
		digests[index] = stringMember(result, "resultDigest")
	}
	digest, err := canonicaljson.Digest(digests)
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationHostedArchiveTestHostedTargets(t *testing.T, plan evaluationPlanFact) []map[string]any {
	t.Helper()
	targets, ok := arrayMember(plan.Value, "capabilityQualificationTargets")
	if !ok {
		t.Fatal("plan has no qualification targets")
	}
	result := make([]map[string]any, 0, 4)
	for _, rawTarget := range targets {
		target, targetOK := rawTarget.(map[string]any)
		optionalAuthority, optionalOK := objectMember(target, "optionalCapabilitySupportAuthority")
		runtimeAuthority, runtimeOK := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
		if !targetOK || !optionalOK || !runtimeOK ||
			stringMember(runtimeAuthority, "hostedRetrievalRuntimeResourceRegistrationIntentDigest") == "" {
			continue
		}
		result = append(result, target)
	}
	if len(result) != 4 {
		t.Fatalf("hosted targets=%d, want 4", len(result))
	}
	sort.Slice(result, func(left, right int) bool {
		return evaluationHostedArchiveIdentity(
			stringMember(result[left], "protocolFamily"), stringMember(result[left], "capabilityProfileId"),
		) < evaluationHostedArchiveIdentity(
			stringMember(result[right], "protocolFamily"), stringMember(result[right], "capabilityProfileId"),
		)
	})
	return result
}

func evaluationHostedArchiveTestProviderConfiguration(
	t *testing.T,
	plan evaluationPlanFact,
	providerConfigurationID string,
) map[string]any {
	t.Helper()
	providers, ok := arrayMember(plan.Value, "providerConfigurations")
	if !ok {
		t.Fatal("plan has no provider configurations")
	}
	for _, rawProvider := range providers {
		provider, providerOK := rawProvider.(map[string]any)
		if providerOK && stringMember(provider, "providerConfigurationId") == providerConfigurationID {
			return provider
		}
	}
	t.Fatalf("provider configuration %q is absent", providerConfigurationID)
	return nil
}

func evaluationHostedArchiveTestRegistrationForTarget(
	t *testing.T,
	plan evaluationPlanFact,
	target map[string]any,
	namespaceID string,
	frozenRunDigest string,
	runConfigBindingDigest string,
	runtimeResourceSetID string,
) evaluationHostedArchiveTestRegistration {
	t.Helper()
	optionalAuthority, _ := objectMember(target, "optionalCapabilitySupportAuthority")
	runtimeAuthority, _ := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
	probeEvidence, _ := objectMember(optionalAuthority, "probeEvidence")
	probeProgram, _ := objectMember(probeEvidence, "probeProgram")
	providerRequestIntent, _ := objectMember(probeProgram, "providerRequestIntent")
	publicResource, _ := objectMember(providerRequestIntent, "publicProbeResource")
	protocolFamily := stringMember(target, "protocolFamily")
	profileID := stringMember(target, "capabilityProfileId")
	providerID := stringMember(target, "providerConfigurationId")
	provider := evaluationHostedArchiveTestProviderConfiguration(t, plan, providerID)
	providerDigest, err := canonicaljson.Digest(provider)
	if err != nil {
		t.Fatal(err)
	}
	intent := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceRegistrationIntentFormat, "intentDigest", map[string]any{
			"providerConfigurationId":        providerID,
			"providerConfigurationDigest":    providerDigest,
			"protocolFamily":                 protocolFamily,
			"modelId":                        stringMember(target, "modelId"),
			"modelLineageDigest":             stringMember(target, "modelLineageDigest"),
			"adapterDigest":                  stringMember(runtimeAuthority, "adapterDigest"),
			"capabilityProfileId":            profileID,
			"capabilityProfileDigest":        stringMember(target, "capabilityProfileDigest"),
			"probeProgramDigest":             stringMember(probeProgram, "programDigest"),
			"publicResourceDescriptorDigest": stringMember(publicResource, "descriptorDigest"),
			"maximumResourceLifetimeMs":      int64(691_200_000),
			"minimumQueryReadLeaseMs":        int64(155_000),
			"requiredOperations":             []any{"create", "delete", "query", "upload"},
		})
	intentDigest := stringMember(intent, "intentDigest")
	wantIntent := stringMember(runtimeAuthority, "hostedRetrievalRuntimeResourceRegistrationIntentDigest")
	if intentDigest != wantIntent {
		t.Fatalf("hosted intent %s digest=%s want=%s", evaluationHostedArchiveIdentity(protocolFamily, profileID), intentDigest, wantIntent)
	}
	key := protocolFamily + "." + profileID
	budget := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceBudgetAuthorityFormat, "authorityDigest", map[string]any{
			"namespaceId": namespaceID, "planDigest": plan.PlanDigest,
			"reservePolicyDigest": evaluationHostedArchiveTestDigest(t, "reserve-policy"),
			"budgetDigest":        evaluationHostedArchiveTestDigest(t, "budget"),
			"reservationId":       "budget." + key, "ledgerRevision": int64(7),
			"demandDigest":      evaluationHostedArchiveTestDigest(t, "demand."+key),
			"demandBytesDigest": evaluationHostedArchiveTestDigest(t, "demand-bytes."+key),
			"reservedAt":        "2026-08-11T00:00:00.000Z",
		})
	network := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceNetworkAuthorityFormat, "authorityDigest", map[string]any{
			"namespaceId": namespaceID, "repositoryCommit": plan.RepositoryCommit, "planDigest": plan.PlanDigest,
			"frozenRunDigest": frozenRunDigest, "runConfigArtifactBindingDigest": runConfigBindingDigest,
			"providerConfigurationId": providerID, "providerConfigurationDigest": providerDigest,
			"protocolFamily": protocolFamily, "purpose": "hosted-retrieval-runtime-resource-lifecycle",
			"endpointClass": "first-party-hosted", "allowedOperations": []any{"create", "delete", "query", "upload"},
		})
	request := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceRegistrationRequestFormat, "requestDigest", map[string]any{
			"namespaceId": namespaceID, "repositoryCommit": plan.RepositoryCommit, "planDigest": plan.PlanDigest,
			"frozenRunDigest": frozenRunDigest, "runConfigArtifactBindingDigest": runConfigBindingDigest,
			"runtimeResourceSetId": runtimeResourceSetID, "registrationIntent": intent,
			"registrationIntentDigest": intentDigest, "providerConfigurationId": providerID,
			"providerConfigurationDigest": providerDigest, "protocolFamily": protocolFamily,
			"modelId": stringMember(target, "modelId"), "modelLineageDigest": stringMember(target, "modelLineageDigest"),
			"adapterDigest": stringMember(runtimeAuthority, "adapterDigest"), "capabilityProfileId": profileID,
			"capabilityProfileDigest":        stringMember(target, "capabilityProfileDigest"),
			"probeProgramDigest":             stringMember(probeProgram, "programDigest"),
			"publicResourceDescriptorDigest": stringMember(publicResource, "descriptorDigest"),
			"budgetReservationAuthority":     budget, "budgetReservationAuthorityDigest": stringMember(budget, "authorityDigest"),
			"networkPolicyAuthority": network, "networkPolicyAuthorityDigest": stringMember(network, "authorityDigest"),
			"minimumExpiresAt": "2026-08-12T00:00:00.000Z",
		})
	resourceKind := "gemini-file-search-store-name"
	if protocolFamily == "openai-responses" {
		resourceKind = "openai-vector-store-id"
	}
	providerResourceID := "resource." + key
	auxiliaryResourceID := "auxiliary." + key
	deletionProjection := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceDeletionProjectionFormat, "projectionDigest", map[string]any{
			"registrationRequestDigest": stringMember(request, "requestDigest"), "runtimeResourceSetId": runtimeResourceSetID,
			"protocolFamily": protocolFamily, "providerResourceKind": resourceKind,
			"providerResourceId": providerResourceID, "auxiliaryResourceIds": []any{auxiliaryResourceID},
		})
	resourceManifestDigest := evaluationHostedArchiveTestDigest(t, "manifest."+key)
	deletionReceipt := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceDeletionReceiptFormat, "deletionAuthorityReceiptDigest", map[string]any{
			"registrationRequestDigest": stringMember(request, "requestDigest"), "planDigest": plan.PlanDigest,
			"runConfigArtifactBindingDigest": runConfigBindingDigest, "runtimeResourceSetId": runtimeResourceSetID,
			"resourceManifestDigest": resourceManifestDigest, "providerResourceKind": resourceKind,
			"providerResourceId": providerResourceID, "deletionRouteBinding": "hosted-retrieval-runtime-resource.delete",
			"deletionRequestProjection":       deletionProjection,
			"deletionRequestProjectionDigest": stringMember(deletionProjection, "projectionDigest"),
			"registeredAt":                    "2026-08-11T00:01:00.000Z", "expiresAt": "2026-08-12T00:00:00.000Z",
		})
	authority := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceAuthorityFormat, "authorityDigest", map[string]any{
			"registrationRequestDigest": stringMember(request, "requestDigest"), "planDigest": plan.PlanDigest,
			"frozenRunDigest": frozenRunDigest, "runConfigArtifactBindingDigest": runConfigBindingDigest,
			"runtimeResourceSetId": runtimeResourceSetID, "registrationIntentDigest": intentDigest,
			"providerConfigurationId": providerID, "providerConfigurationDigest": providerDigest,
			"protocolFamily": protocolFamily, "modelId": stringMember(target, "modelId"),
			"modelLineageDigest": stringMember(target, "modelLineageDigest"),
			"adapterDigest":      stringMember(runtimeAuthority, "adapterDigest"), "capabilityProfileId": profileID,
			"capabilityProfileDigest":        stringMember(target, "capabilityProfileDigest"),
			"probeProgramDigest":             stringMember(probeProgram, "programDigest"),
			"publicResourceDescriptorDigest": stringMember(publicResource, "descriptorDigest"),
			"budgetReservationAuthority":     budget, "budgetReservationAuthorityDigest": stringMember(budget, "authorityDigest"),
			"networkPolicyAuthority": network, "networkPolicyAuthorityDigest": stringMember(network, "authorityDigest"),
			"providerResourceKind": resourceKind, "providerResourceId": providerResourceID,
			"auxiliaryResourceIds": []any{auxiliaryResourceID}, "resourceManifestDigest": resourceManifestDigest,
			"contentUploadReceiptDigest":          evaluationHostedArchiveTestDigest(t, "upload."+key),
			"creationDispatchIntentSetDigest":     evaluationHostedArchiveTestDigest(t, "dispatch."+key),
			"creationTransportReceiptSetDigest":   evaluationHostedArchiveTestDigest(t, "transport."+key),
			"creationResultSpoolReceiptSetDigest": evaluationHostedArchiveTestDigest(t, "spool."+key),
			"deletionAuthorityReceiptDigest":      stringMember(deletionReceipt, "deletionAuthorityReceiptDigest"),
			"registeredAt":                        "2026-08-11T00:01:00.000Z", "expiresAt": "2026-08-12T00:00:00.000Z",
		})
	result := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceRegistrationResultFormat, "resultDigest", map[string]any{
			"registrationRequestDigest": stringMember(request, "requestDigest"), "registrationRequest": request,
			"authority": authority, "authorityDigest": stringMember(authority, "authorityDigest"),
			"deletionAuthorityReceipt":       deletionReceipt,
			"deletionAuthorityReceiptDigest": stringMember(deletionReceipt, "deletionAuthorityReceiptDigest"),
		})
	return evaluationHostedArchiveTestRegistration{
		protocolFamily: protocolFamily, capabilityProfileID: profileID, intentDigest: intentDigest,
		request: request, authority: authority, result: result,
	}
}

func evaluationHostedArchiveTestFamily(
	t *testing.T,
	plan evaluationPlanFact,
	namespaceID string,
) ([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord, [][]byte) {
	t.Helper()
	frozenRunDigest := evaluationHostedArchiveTestDigest(t, "frozen-run")
	runConfigBindingDigest := evaluationHostedArchiveTestDigest(t, "run-config-binding")
	runtimeResourceSetID := "runtime-resource-set.g4"
	targets := evaluationHostedArchiveTestHostedTargets(t, plan)
	registrations := make([]evaluationHostedArchiveTestRegistration, len(targets))
	for index, target := range targets {
		registrations[index] = evaluationHostedArchiveTestRegistrationForTarget(
			t, plan, target, namespaceID, frozenRunDigest, runConfigBindingDigest, runtimeResourceSetID,
		)
	}
	authorities := make([]any, len(registrations))
	authorityDigests := make([]any, len(registrations))
	authorityBindings := make([]any, len(registrations))
	for index, registration := range registrations {
		authority := registration.authority
		budget, _ := objectMember(authority, "budgetReservationAuthority")
		authorities[index] = authority
		authorityDigests[index] = stringMember(authority, "authorityDigest")
		authorityBindings[index] = map[string]any{
			"authorityDigest":                  stringMember(authority, "authorityDigest"),
			"registrationIntentDigest":         registration.intentDigest,
			"protocolFamily":                   registration.protocolFamily,
			"capabilityProfileId":              registration.capabilityProfileID,
			"providerConfigurationDigest":      stringMember(authority, "providerConfigurationDigest"),
			"budgetReservationId":              stringMember(budget, "reservationId"),
			"budgetReservationAuthorityDigest": stringMember(authority, "budgetReservationAuthorityDigest"),
			"networkPolicyAuthorityDigest":     stringMember(authority, "networkPolicyAuthorityDigest"),
		}
	}
	authoritySetBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceAuthoritySetFormat, "version": int64(1),
		"planDigest": plan.PlanDigest, "frozenRunDigest": frozenRunDigest,
		"runConfigArtifactBindingDigest": runConfigBindingDigest, "runtimeResourceSetId": runtimeResourceSetID,
		"authorities": authorities, "authorityDigests": authorityDigests,
	}
	authoritySetDigest, err := canonicaljson.Digest(authoritySetBase)
	if err != nil {
		t.Fatal(err)
	}
	commitment := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceCommitmentFormat, "commitmentDigest", map[string]any{
			"planDigest": plan.PlanDigest, "frozenRunDigest": frozenRunDigest,
			"runConfigArtifactBindingDigest": runConfigBindingDigest, "runtimeResourceSetId": runtimeResourceSetID,
			"authoritySetDigest": authoritySetDigest, "authorityBindings": authorityBindings,
		})
	fence := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceTerminalFenceFormat, "fenceDigest", map[string]any{
			"fenceId": "terminal-fence.g4", "fenceAuthorityIssuerId": "authority.hosted-terminal-ledger",
			"fenceAuthorityImplementationDigest": evaluationHostedArchiveTestDigest(t, "fence-implementation"),
			"fenceLedgerRevision":                int64(19), "namespaceId": namespaceID, "repositoryCommit": plan.RepositoryCommit,
			"planDigest": plan.PlanDigest, "frozenRunDigest": frozenRunDigest,
			"runConfigArtifactBindingDigest": runConfigBindingDigest, "runtimeResourceSetId": runtimeResourceSetID,
			"expectedShardCount": int64(1), "terminalShardCount": int64(1),
			"terminalShardIdSetDigest":              evaluationHostedArchiveTestDigest(t, "shard-ids"),
			"terminalAttemptIdSetDigest":            evaluationHostedArchiveTestDigest(t, "attempt-ids"),
			"terminalShardLeaseGenerationSetDigest": evaluationHostedArchiveTestDigest(t, "lease-generations"),
			"terminalShardResultSetDigest":          evaluationHostedArchiveTestDigest(t, "shard-results"),
			"terminalOutcome":                       "completed", "allShardsTerminalAt": "2026-08-11T00:10:00.000Z",
			"sealedAt": "2026-08-11T00:11:00.000Z",
		})
	records := make([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord, len(registrations))
	bytesByRecord := make([][]byte, len(registrations))
	partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	for index, registration := range registrations {
		authority := registration.authority
		key := registration.protocolFamily + "." + registration.capabilityProfileID
		priorState := evaluationHostedArchiveTestSelfDigest(t,
			evaluationHostedRetrievalRuntimeResourceActiveStateFormat, "stateDigest", map[string]any{
				"authorityDigest":             stringMember(authority, "authorityDigest"),
				"resourceSetCommitmentDigest": stringMember(commitment, "commitmentDigest"),
				"activeOwnerInstanceId":       "reader." + key, "claimGeneration": int64(1), "lifecycle": "active",
				"readLeaseNotAfter": "2026-08-11T00:12:00.000Z", "updatedAt": "2026-08-11T00:09:00.000Z",
			})
		readRoot := evaluationHostedArchiveTestSelfDigest(t,
			evaluationHostedRetrievalRuntimeResourceReadLedgerRootFormat, "rootDigest", map[string]any{
				"ledgerAuthorityIssuerId":             "authority.hosted-read-ledger",
				"ledgerAuthorityImplementationDigest": evaluationHostedArchiveTestDigest(t, "read-ledger-implementation"),
				"ledgerRevision":                      int64(31), "planDigest": plan.PlanDigest,
				"runConfigArtifactBindingDigest": runConfigBindingDigest, "runtimeResourceSetId": runtimeResourceSetID,
				"authorityDigest":             stringMember(authority, "authorityDigest"),
				"resourceSetCommitmentDigest": stringMember(commitment, "commitmentDigest"),
				"readLeaseCount":              int64(1), "readLeaseIdSetDigest": evaluationHostedArchiveTestDigest(t, "lease-ids."+key),
				"readRequestDigestSetDigest": evaluationHostedArchiveTestDigest(t, "read-requests."+key),
				"readReceiptDigestSetDigest": evaluationHostedArchiveTestDigest(t, "read-receipts."+key),
				"activeStateDigestSetDigest": evaluationHostedArchiveTestDigest(t, "active-states."+key),
				"minimumClaimGeneration":     int64(1), "maximumClaimGeneration": int64(1),
				"firstCheckedAt": "2026-08-11T00:09:00.000Z", "lastExpiresAt": priorState["readLeaseNotAfter"],
				"sealedAt": "2026-08-11T00:12:00.000Z",
			})
		claimedStateDigest, err := canonicaljson.Digest(map[string]any{
			"format":                      "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claimed-state",
			"version":                     int64(1),
			"authorityDigest":             stringMember(authority, "authorityDigest"),
			"resourceSetCommitmentDigest": stringMember(commitment, "commitmentDigest"),
			"cleanupOwnerInstanceId":      "cleanup-owner." + key,
			"claimGeneration":             int64(2),
			"claimedAt":                   "2026-08-11T00:12:00.000Z",
			"lifecycle":                   "cleanup-in-progress",
		})
		if err != nil {
			t.Fatal(err)
		}
		claim := evaluationHostedArchiveTestSelfDigest(t,
			evaluationHostedRetrievalRuntimeResourceCleanupClaimFormat, "receiptDigest", map[string]any{
				"claimId": "cleanup-claim." + key, "claimAuthorityIssuerId": "authority.hosted-cleanup-claims",
				"claimAuthorityImplementationDigest": evaluationHostedArchiveTestDigest(t, "claim-implementation"),
				"claimLedgerRevision":                int64(41), "namespaceId": namespaceID, "repositoryCommit": plan.RepositoryCommit,
				"planDigest": plan.PlanDigest, "frozenRunDigest": frozenRunDigest,
				"runConfigArtifactBindingDigest": runConfigBindingDigest, "runtimeResourceSetId": runtimeResourceSetID,
				"authorityDigest":             stringMember(authority, "authorityDigest"),
				"resourceSetCommitmentDigest": stringMember(commitment, "commitmentDigest"),
				"expectedActiveStateDigest":   stringMember(priorState, "stateDigest"),
				"cleanupOwnerInstanceId":      "cleanup-owner." + key, "claimGeneration": int64(2),
				"claimedStateDigest": claimedStateDigest,
				"claimedAt":          "2026-08-11T00:12:00.000Z", "claimExpiresAt": "2026-08-11T00:20:00.000Z",
			})
		deletionReceipt, _ := objectMember(registration.result, "deletionAuthorityReceipt")
		cleanupRequest := evaluationHostedArchiveTestSelfDigest(t,
			evaluationHostedRetrievalRuntimeResourceCleanupRequestFormat, "requestDigest", map[string]any{
				"namespaceId": namespaceID, "repositoryCommit": plan.RepositoryCommit, "planDigest": plan.PlanDigest,
				"frozenRunDigest": frozenRunDigest, "runConfigArtifactBindingDigest": runConfigBindingDigest,
				"runtimeResourceSetId": runtimeResourceSetID, "authorityDigest": stringMember(authority, "authorityDigest"),
				"resourceSetCommitmentDigest":        stringMember(commitment, "commitmentDigest"),
				"readLeaseLedgerRootDigest":          stringMember(readRoot, "rootDigest"),
				"cleanupClaimAuthorityReceiptDigest": stringMember(claim, "receiptDigest"),
				"deletionAuthorityReceiptDigest":     stringMember(deletionReceipt, "deletionAuthorityReceiptDigest"),
				"cleanupOwnerInstanceId":             stringMember(claim, "cleanupOwnerInstanceId"), "claimGeneration": int64(2),
				"priorActiveState": priorState, "priorActiveStateDigest": stringMember(priorState, "stateDigest"),
				"claimedLifecycle": "cleanup-in-progress", "runTerminalFence": fence,
				"runTerminalFenceDigest": stringMember(fence, "fenceDigest"), "cleanupReason": "matrix-terminal",
				"overdueReceiptDigest": nil, "requestedAt": "2026-08-11T00:12:00.000Z",
				"deletionNotBefore": "2026-08-11T00:12:00.000Z",
			})
		auxiliaryResourceIDs, _ := evaluationHostedArchiveStringArray(authority["auxiliaryResourceIds"])
		auxiliaryResourceResult := evaluationHostedArchiveTestSelfDigest(t,
			evaluationHostedRetrievalRuntimeResourceCleanupResultFormat, "resultDigest", map[string]any{
				"resourceId": auxiliaryResourceIDs[0], "resourceRole": "auxiliary", "outcome": "already-absent",
				"cleanupClaimAuthorityReceiptDigest":  stringMember(claim, "receiptDigest"),
				"dispatchIntentDigest":                evaluationHostedArchiveTestDigest(t, "delete-aux-dispatch."+key),
				"transportReceiptDigest":              evaluationHostedArchiveTestDigest(t, "delete-aux-transport."+key),
				"resultSpoolReceiptDigest":            evaluationHostedArchiveTestDigest(t, "delete-aux-spool."+key),
				"resultSpoolDispositionReceiptDigest": evaluationHostedArchiveTestDigest(t, "delete-aux-spool-disposition."+key),
				"dispatchCreatedAt":                   "2026-08-11T00:13:00.000Z", "completedAt": "2026-08-11T00:14:00.000Z",
			})
		primaryResourceResult := evaluationHostedArchiveTestSelfDigest(t,
			evaluationHostedRetrievalRuntimeResourceCleanupResultFormat, "resultDigest", map[string]any{
				"resourceId": stringMember(authority, "providerResourceId"), "resourceRole": "primary", "outcome": "deleted",
				"cleanupClaimAuthorityReceiptDigest":  stringMember(claim, "receiptDigest"),
				"dispatchIntentDigest":                evaluationHostedArchiveTestDigest(t, "delete-dispatch."+key),
				"transportReceiptDigest":              evaluationHostedArchiveTestDigest(t, "delete-transport."+key),
				"resultSpoolReceiptDigest":            evaluationHostedArchiveTestDigest(t, "delete-spool."+key),
				"resultSpoolDispositionReceiptDigest": evaluationHostedArchiveTestDigest(t, "delete-spool-disposition."+key),
				"dispatchCreatedAt":                   "2026-08-11T00:13:00.000Z", "completedAt": "2026-08-11T00:14:00.000Z",
			})
		resourceResults := []any{auxiliaryResourceResult, primaryResourceResult}
		resourceResultSetDigest := evaluationHostedArchiveTestResultSetDigest(t, resourceResults)
		terminalStateDigest, err := canonicaljson.Digest(map[string]any{
			"format":                             "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-state",
			"version":                            int64(1),
			"authorityDigest":                    stringMember(authority, "authorityDigest"),
			"cleanupRequestDigest":               stringMember(cleanupRequest, "requestDigest"),
			"cleanupOwnerInstanceId":             stringMember(claim, "cleanupOwnerInstanceId"),
			"claimGeneration":                    int64(2),
			"readLeaseLedgerRootDigest":          stringMember(readRoot, "rootDigest"),
			"cleanupClaimAuthorityReceiptDigest": stringMember(claim, "receiptDigest"),
			"completedAt":                        "2026-08-11T00:14:00.000Z",
			"lifecycle":                          "cleaned",
			"residualProviderResourceIds":        []any{},
		})
		if err != nil {
			t.Fatal(err)
		}
		cleanupReceipt := evaluationHostedArchiveTestSelfDigest(t,
			evaluationHostedRetrievalRuntimeResourceCleanupReceiptFormat, "cleanupReceiptDigest", map[string]any{
				"cleanupRequestDigest": stringMember(cleanupRequest, "requestDigest"), "planDigest": plan.PlanDigest,
				"runConfigArtifactBindingDigest": runConfigBindingDigest, "runtimeResourceSetId": runtimeResourceSetID,
				"authorityDigest":                    stringMember(authority, "authorityDigest"),
				"resourceSetCommitmentDigest":        stringMember(commitment, "commitmentDigest"),
				"readLeaseLedgerRootDigest":          stringMember(readRoot, "rootDigest"),
				"cleanupClaimAuthorityReceiptDigest": stringMember(claim, "receiptDigest"),
				"deletionAuthorityReceiptDigest":     stringMember(deletionReceipt, "deletionAuthorityReceiptDigest"),
				"protocolFamily":                     registration.protocolFamily, "providerResourceKind": stringMember(authority, "providerResourceKind"),
				"providerResourceId": stringMember(authority, "providerResourceId"), "auxiliaryResourceIds": authority["auxiliaryResourceIds"],
				"runTerminalFenceDigest": stringMember(fence, "fenceDigest"), "cleanupReason": "matrix-terminal",
				"overdueReceiptDigest": nil, "cleanupOwnerInstanceId": stringMember(claim, "cleanupOwnerInstanceId"),
				"claimGeneration": int64(2), "priorActiveStateDigest": stringMember(priorState, "stateDigest"),
				"deletionNotBefore": "2026-08-11T00:12:00.000Z", "resourceResults": resourceResults,
				"resourceResultSetDigest": resourceResultSetDigest, "residualProviderResourceIds": []any{},
				"terminalLifecycle": "cleaned", "terminalStateDigest": terminalStateDigest,
				"completedAt": "2026-08-11T00:14:00.000Z",
			})
		record := evaluationHostedArchiveTestSelfDigest(t,
			evaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordFormat, "recordDigest", map[string]any{
				"repositoryCommit": plan.RepositoryCommit, "planDigest": plan.PlanDigest, "frozenRunDigest": frozenRunDigest,
				"runConfigArtifactBindingDigest": runConfigBindingDigest, "runtimeResourceSetId": runtimeResourceSetID,
				"registrationRequestDigest": stringMember(registration.request, "requestDigest"),
				"authorityDigest":           stringMember(authority, "authorityDigest"),
				"cleanupRequestDigest":      stringMember(cleanupRequest, "requestDigest"),
				"cleanupReceiptDigest":      stringMember(cleanupReceipt, "cleanupReceiptDigest"),
				"registrationResult":        registration.result, "resourceSetCommitment": commitment,
				"cleanupRequest": cleanupRequest, "storedCleanupClaimAuthorityReceipt": claim,
				"storedPriorActiveState": priorState, "readLeaseLedgerRoot": readRoot,
				"storedRunTerminalFence": fence, "overdueReceipt": nil, "cleanupReceipt": cleanupReceipt,
			})
		recordBytes, err := canonicaljson.Bytes(record)
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			recordBytes, namespaceID, partition,
		)
		if err != nil {
			t.Fatalf("decode hosted cleanup %s: %v", key, err)
		}
		records[index], bytesByRecord[index] = decoded, recordBytes
	}
	return records, bytesByRecord
}

func TestEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCanonicalFamily(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	namespaceID := "evaluation.hosted-archive-test"
	records, recordBytes := evaluationHostedArchiveTestFamily(t, plan, namespaceID)
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(plan, records); err != nil {
		t.Fatal(err)
	}
	if len(records) != 4 {
		t.Fatalf("hosted cleanup records=%d, want 4", len(records))
	}

	t.Run("non-canonical bytes", func(t *testing.T) {
		tampered := append(append([]byte{}, recordBytes[0]...), '\n')
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			tampered, namespaceID, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted non-canonical bytes")
		}
	})
	t.Run("tampered self digest", func(t *testing.T) {
		value, err := decodeCanonicalEvaluationObject(recordBytes[0], maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes)
		if err != nil {
			t.Fatal(err)
		}
		value["recordDigest"] = evaluationHostedArchiveTestDigest(t, "tampered-record")
		tampered, err := canonicaljson.Bytes(value)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			tampered, namespaceID, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a tampered self digest")
		}
	})
	t.Run("recomputed record with an extra key", func(t *testing.T) {
		value, err := decodeCanonicalEvaluationObject(recordBytes[0], maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes)
		if err != nil {
			t.Fatal(err)
		}
		delete(value, "recordDigest")
		value["unexpected"] = true
		digest, err := canonicaljson.Digest(value)
		if err != nil {
			t.Fatal(err)
		}
		value["recordDigest"] = digest
		tampered, err := canonicaljson.Bytes(value)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			tampered, namespaceID, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a recomputed record with an extra key")
		}
	})
	t.Run("recomputed outer with residual", func(t *testing.T) {
		value, err := decodeCanonicalEvaluationObject(recordBytes[0], maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes)
		if err != nil {
			t.Fatal(err)
		}
		cleanupReceipt, _ := objectMember(value, "cleanupReceipt")
		cleanupReceipt["residualProviderResourceIds"] = []any{"resource.residual"}
		delete(value, "recordDigest")
		digest, err := canonicaljson.Digest(value)
		if err != nil {
			t.Fatal(err)
		}
		value["recordDigest"] = digest
		tampered, err := canonicaljson.Bytes(value)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			tampered, namespaceID, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a recomputed outer record with residual Provider state")
		}
	})
	t.Run("recomputed invalid cleanup claim identity", func(t *testing.T) {
		value, err := decodeCanonicalEvaluationObject(recordBytes[0], maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes)
		if err != nil {
			t.Fatal(err)
		}
		claim, _ := objectMember(value, "storedCleanupClaimAuthorityReceipt")
		claim["claimId"] = ""
		evaluationHostedArchiveTestRecomputeSelfDigest(t, claim, "receiptDigest")
		if err := validateEvaluationHostedArchiveSelfDigest(claim, evaluationHostedCleanupClaimKeys,
			evaluationHostedRetrievalRuntimeResourceCleanupClaimFormat, "receiptDigest"); err != nil {
			t.Fatalf("recomputed invalid claim is not self-consistent: %v", err)
		}
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			evaluationHostedArchiveTestCanonicalBytes(t, value), namespaceID,
			EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a recomputed claim with an invalid identity")
		}
	})
	t.Run("recomputed invalid deletion expiry", func(t *testing.T) {
		value, err := decodeCanonicalEvaluationObject(recordBytes[0], maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes)
		if err != nil {
			t.Fatal(err)
		}
		registrationResult, _ := objectMember(value, "registrationResult")
		deletionReceipt, _ := objectMember(registrationResult, "deletionAuthorityReceipt")
		authority, _ := objectMember(registrationResult, "authority")
		deletionReceipt["expiresAt"] = deletionReceipt["registeredAt"]
		evaluationHostedArchiveTestRecomputeSelfDigest(t, deletionReceipt, "deletionAuthorityReceiptDigest")
		authority["expiresAt"] = deletionReceipt["expiresAt"]
		authority["deletionAuthorityReceiptDigest"] = deletionReceipt["deletionAuthorityReceiptDigest"]
		evaluationHostedArchiveTestRecomputeSelfDigest(t, authority, "authorityDigest")
		registrationResult["authorityDigest"] = authority["authorityDigest"]
		registrationResult["deletionAuthorityReceiptDigest"] = deletionReceipt["deletionAuthorityReceiptDigest"]
		evaluationHostedArchiveTestRecomputeSelfDigest(t, registrationResult, "resultDigest")
		value["authorityDigest"] = authority["authorityDigest"]
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			evaluationHostedArchiveTestCanonicalBytes(t, value), namespaceID,
			EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a recomputed non-positive deletion lifetime")
		}
	})
	t.Run("recomputed invalid transport receipt digest", func(t *testing.T) {
		value, err := decodeCanonicalEvaluationObject(recordBytes[0], maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes)
		if err != nil {
			t.Fatal(err)
		}
		cleanupReceipt, _ := objectMember(value, "cleanupReceipt")
		resourceResults, _ := cleanupReceipt["resourceResults"].([]any)
		result := resourceResults[0].(map[string]any)
		result["transportReceiptDigest"] = "foreign"
		evaluationHostedArchiveTestRecomputeSelfDigest(t, result, "resultDigest")
		cleanupReceipt["resourceResultSetDigest"] = evaluationHostedArchiveTestResultSetDigest(t, resourceResults)
		evaluationHostedArchiveTestRecomputeSelfDigest(t, cleanupReceipt, "cleanupReceiptDigest")
		value["cleanupReceiptDigest"] = cleanupReceipt["cleanupReceiptDigest"]
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			evaluationHostedArchiveTestCanonicalBytes(t, value), namespaceID,
			EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a recomputed invalid transport receipt digest")
		}
	})
	t.Run("recomputed invalid auxiliary resource role", func(t *testing.T) {
		value, err := decodeCanonicalEvaluationObject(recordBytes[0], maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes)
		if err != nil {
			t.Fatal(err)
		}
		cleanupReceipt, _ := objectMember(value, "cleanupReceipt")
		resourceResults, _ := cleanupReceipt["resourceResults"].([]any)
		result := resourceResults[0].(map[string]any)
		if stringMember(result, "resourceRole") != "auxiliary" {
			t.Fatal("hosted cleanup fixture is missing its auxiliary resource result")
		}
		result["resourceRole"] = "foreign-role"
		evaluationHostedArchiveTestRecomputeSelfDigest(t, result, "resultDigest")
		cleanupReceipt["resourceResultSetDigest"] = evaluationHostedArchiveTestResultSetDigest(t, resourceResults)
		evaluationHostedArchiveTestRecomputeSelfDigest(t, cleanupReceipt, "cleanupReceiptDigest")
		value["cleanupReceiptDigest"] = cleanupReceipt["cleanupReceiptDigest"]
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			evaluationHostedArchiveTestCanonicalBytes(t, value), namespaceID,
			EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a recomputed invalid auxiliary resource role")
		}
	})
	t.Run("recomputed noncanonical cleanup instant", func(t *testing.T) {
		value, err := decodeCanonicalEvaluationObject(recordBytes[0], maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes)
		if err != nil {
			t.Fatal(err)
		}
		cleanupReceipt, _ := objectMember(value, "cleanupReceipt")
		resourceResults, _ := cleanupReceipt["resourceResults"].([]any)
		result := resourceResults[0].(map[string]any)
		result["dispatchCreatedAt"] = "2026-08-11T00:13:00+00:00"
		evaluationHostedArchiveTestRecomputeSelfDigest(t, result, "resultDigest")
		cleanupReceipt["resourceResultSetDigest"] = evaluationHostedArchiveTestResultSetDigest(t, resourceResults)
		evaluationHostedArchiveTestRecomputeSelfDigest(t, cleanupReceipt, "cleanupReceiptDigest")
		value["cleanupReceiptDigest"] = cleanupReceipt["cleanupReceiptDigest"]
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			evaluationHostedArchiveTestCanonicalBytes(t, value), namespaceID,
			EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a recomputed noncanonical cleanup instant")
		}
	})
	t.Run("one byte over record capacity", func(t *testing.T) {
		if _, err := decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
			make([]byte, maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes+1),
			namespaceID, EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit},
		); err == nil {
			t.Fatal("hosted cleanup archive accepted a record above the physical byte cap")
		}
	})
}

func TestEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyRejectsMissingDuplicateAndForeign(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	records, _ := evaluationHostedArchiveTestFamily(t, plan, "evaluation.hosted-archive-negative")
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(plan, records[:3]); err == nil {
		t.Fatal("hosted cleanup archive accepted a missing exact-four member")
	}
	duplicate := append([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, records...)
	duplicate[3] = duplicate[2]
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(plan, duplicate); err == nil {
		t.Fatal("hosted cleanup archive accepted a duplicated authority")
	}
	unsorted := append([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, records...)
	unsorted[0], unsorted[3] = unsorted[3], unsorted[0]
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(plan, unsorted); err == nil {
		t.Fatal("hosted cleanup archive accepted a noncanonical family order")
	}
	plusOne := append(append([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, records...), records[0])
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(plan, plusOne); err == nil {
		t.Fatal("hosted cleanup archive accepted a fifth authority")
	}
	overEncodedFamilyCapacity := append([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, records...)
	for index := range overEncodedFamilyCapacity {
		overEncodedFamilyCapacity[index].RecordBytes = make(
			[]byte, maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes,
		)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(plan, overEncodedFamilyCapacity); err == nil {
		t.Fatal("hosted cleanup archive accepted a family whose encoded array exceeds the byte cap")
	}
	planValueBytes, err := canonicaljson.Bytes(plan.Value)
	if err != nil {
		t.Fatal(err)
	}
	foreignPlanValue, err := decodeCanonicalEvaluationObject(planValueBytes, len(planValueBytes))
	if err != nil {
		t.Fatal(err)
	}
	foreignPlan := plan
	foreignPlan.Value = foreignPlanValue
	foreignTarget := evaluationHostedArchiveTestHostedTargets(t, foreignPlan)[0]
	optionalAuthority, _ := objectMember(foreignTarget, "optionalCapabilitySupportAuthority")
	runtimeAuthority, _ := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
	probeEvidence, _ := objectMember(optionalAuthority, "probeEvidence")
	probeProgram, _ := objectMember(probeEvidence, "probeProgram")
	providerRequestIntent, _ := objectMember(probeProgram, "providerRequestIntent")
	publicResource, _ := objectMember(providerRequestIntent, "publicProbeResource")
	provider := evaluationHostedArchiveTestProviderConfiguration(
		t, foreignPlan, stringMember(foreignTarget, "providerConfigurationId"),
	)
	providerDigest, err := canonicaljson.Digest(provider)
	if err != nil {
		t.Fatal(err)
	}
	foreignAdapterDigest := evaluationHostedArchiveTestDigest(t, "foreign-adapter")
	runtimeAuthority["adapterDigest"] = foreignAdapterDigest
	foreignIntent := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceRegistrationIntentFormat, "intentDigest", map[string]any{
			"providerConfigurationId":        stringMember(foreignTarget, "providerConfigurationId"),
			"providerConfigurationDigest":    providerDigest,
			"protocolFamily":                 stringMember(foreignTarget, "protocolFamily"),
			"modelId":                        stringMember(foreignTarget, "modelId"),
			"modelLineageDigest":             stringMember(foreignTarget, "modelLineageDigest"),
			"adapterDigest":                  foreignAdapterDigest,
			"capabilityProfileId":            stringMember(foreignTarget, "capabilityProfileId"),
			"capabilityProfileDigest":        stringMember(foreignTarget, "capabilityProfileDigest"),
			"probeProgramDigest":             stringMember(probeProgram, "programDigest"),
			"publicResourceDescriptorDigest": stringMember(publicResource, "descriptorDigest"),
			"maximumResourceLifetimeMs":      int64(691_200_000),
			"minimumQueryReadLeaseMs":        int64(155_000),
			"requiredOperations":             []any{"create", "delete", "query", "upload"},
		})
	runtimeAuthority["hostedRetrievalRuntimeResourceRegistrationIntentDigest"] = stringMember(foreignIntent, "intentDigest")
	foreignRecords, _ := evaluationHostedArchiveTestFamily(t, foreignPlan, "evaluation.hosted-archive-foreign")
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(foreignPlan, foreignRecords); err != nil {
		t.Fatalf("fully recomputed foreign family is internally invalid: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(plan, foreignRecords); err == nil {
		t.Fatal("hosted cleanup archive accepted a fully recomputed foreign exact-four intent set")
	}
	zeroPlan := evaluationPlanFact{Value: map[string]any{"capabilityQualificationTargets": []any{}}}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(zeroPlan, nil); err != nil {
		t.Fatalf("zero-intent plan rejected zero archive records: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(zeroPlan, records); err == nil {
		t.Fatal("zero-intent plan accepted an exact-four archive family")
	}
}

func TestQueryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordsRevalidatesPlanAndBytes(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.hosted-archive-reader",
		NamespaceID: "evaluation.hosted-archive-query",
	}
	partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	records, _ := evaluationHostedArchiveTestFamily(t, plan, authority.NamespaceID)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	rows := sqlmock.NewRows([]string{
		"namespace_id", "plan_digest", "repository_commit", "runtime_resource_set_id",
		"authority_digest", "record_digest", "cleanup_receipt_digest", "record_json", "record_bytes",
	})
	for _, record := range records {
		rows.AddRow(record.NamespaceID, record.PlanDigest, record.RepositoryCommit, record.RuntimeResourceSetID,
			record.AuthorityDigest, record.RecordDigest, record.CleanupReceiptDigest, record.RecordBytes, record.RecordBytes)
	}
	mock.ExpectQuery(`SELECT namespace_id,plan_digest,repository_commit`).
		WithArgs(authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(rows)
	mock.ExpectQuery(`SELECT plan_bytes FROM agent_evaluation_plans`).
		WithArgs(authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{"plan_bytes"}).AddRow(plan.Canonical))
	mock.ExpectQuery(`SELECT agent_evaluation_hosted_runtime_cleanup_archive_family_budget_complete`).
		WithArgs(authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, records[0].RuntimeResourceSetID).
		WillReturnRows(sqlmock.NewRows([]string{"complete"}).AddRow(true))
	actual, err := queryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords(
		context.Background(), database, authority, partition,
	)
	if err != nil || len(actual) != 4 {
		t.Fatalf("query hosted cleanup records=%d err=%v", len(actual), err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}

	incompleteDatabase, incompleteMock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer incompleteDatabase.Close()
	incompleteRows := sqlmock.NewRows([]string{
		"namespace_id", "plan_digest", "repository_commit", "runtime_resource_set_id",
		"authority_digest", "record_digest", "cleanup_receipt_digest", "record_json", "record_bytes",
	})
	for _, record := range records {
		incompleteRows.AddRow(record.NamespaceID, record.PlanDigest, record.RepositoryCommit, record.RuntimeResourceSetID,
			record.AuthorityDigest, record.RecordDigest, record.CleanupReceiptDigest, record.RecordBytes, record.RecordBytes)
	}
	incompleteMock.ExpectQuery(`SELECT namespace_id,plan_digest,repository_commit`).
		WithArgs(authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(incompleteRows)
	incompleteMock.ExpectQuery(`SELECT plan_bytes FROM agent_evaluation_plans`).
		WithArgs(authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{"plan_bytes"}).AddRow(plan.Canonical))
	incompleteMock.ExpectQuery(`SELECT agent_evaluation_hosted_runtime_cleanup_archive_family_budget_complete`).
		WithArgs(authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, records[0].RuntimeResourceSetID).
		WillReturnRows(sqlmock.NewRows([]string{"complete"}).AddRow(false))
	if _, err := queryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords(
		context.Background(), incompleteDatabase, authority, partition,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("hosted cleanup archive unsettled budget error=%v, want conflict", err)
	}
	if err := incompleteMock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestQueryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordsRejectsStoredColumnDrift(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.hosted-archive-reader",
		NamespaceID: "evaluation.hosted-archive-query-drift",
	}
	partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	records, _ := evaluationHostedArchiveTestFamily(t, plan, authority.NamespaceID)
	for _, drift := range []string{"record digest", "cleanup receipt digest", "record json", "record bytes"} {
		t.Run(drift, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			rows := sqlmock.NewRows([]string{
				"namespace_id", "plan_digest", "repository_commit", "runtime_resource_set_id",
				"authority_digest", "record_digest", "cleanup_receipt_digest", "record_json", "record_bytes",
			})
			for index, record := range records {
				recordDigest := record.RecordDigest
				cleanupReceiptDigest := record.CleanupReceiptDigest
				recordJSON := record.RecordBytes
				recordBytes := record.RecordBytes
				if index == 0 {
					switch drift {
					case "record digest":
						recordDigest = evaluationHostedArchiveTestDigest(t, "stored-record-drift")
					case "cleanup receipt digest":
						cleanupReceiptDigest = evaluationHostedArchiveTestDigest(t, "stored-cleanup-receipt-drift")
					case "record json":
						recordJSON = []byte(`{}`)
					case "record bytes":
						recordBytes = append([]byte(nil), record.RecordBytes...)
						recordBytes[len(recordBytes)-1] = ']'
					}
				}
				rows.AddRow(record.NamespaceID, record.PlanDigest, record.RepositoryCommit, record.RuntimeResourceSetID,
					record.AuthorityDigest, recordDigest, cleanupReceiptDigest, recordJSON, recordBytes)
			}
			mock.ExpectQuery(`SELECT namespace_id,plan_digest,repository_commit`).
				WithArgs(authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).
				WillReturnRows(rows)
			if _, err := queryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords(
				context.Background(), database, authority, partition,
			); err == nil {
				t.Fatalf("hosted cleanup archive accepted stored %s", drift)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
