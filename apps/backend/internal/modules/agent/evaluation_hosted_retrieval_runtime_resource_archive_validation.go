package agent

import (
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationHostedArchiveObject(parent map[string]any, key string) (map[string]any, error) {
	value, ok := objectMember(parent, key)
	if !ok {
		return nil, ErrConflict
	}
	return value, nil
}

func validateEvaluationHostedArchiveSelfDigest(
	value map[string]any,
	keys []string,
	format string,
	digestKey string,
) error {
	version, versionOK := integerMember(value, "version")
	digest := stringMember(value, digestKey)
	if !exactEvaluationKeys(value, keys) || stringMember(value, "format") != format ||
		!versionOK || version != evaluationHostedRetrievalRuntimeResourceVersion ||
		!evaluationDigestPattern.MatchString(digest) {
		return ErrConflict
	}
	base := cloneEvaluationObject(value)
	delete(base, digestKey)
	expected, err := canonicaljson.Digest(base)
	if err != nil || expected != digest {
		return ErrConflict
	}
	return nil
}

func evaluationHostedArchiveStringArray(value any) ([]string, bool) {
	raw, ok := value.([]any)
	if !ok {
		return nil, false
	}
	result := make([]string, len(raw))
	for index, entry := range raw {
		text, textOK := entry.(string)
		if !textOK {
			return nil, false
		}
		result[index] = text
	}
	return result, true
}

func evaluationHostedArchiveStringsEqual(left any, right []string) bool {
	values, ok := evaluationHostedArchiveStringArray(left)
	if !ok || len(values) != len(right) {
		return false
	}
	for index := range right {
		if values[index] != right[index] {
			return false
		}
	}
	return true
}

func evaluationHostedArchiveDigestMembers(value map[string]any, fields ...string) bool {
	for _, field := range fields {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return false
		}
	}
	return true
}

func evaluationHostedArchiveSafe(value any, maximumBytes int) bool {
	encoded, err := canonicaljson.Bytes(value)
	return err == nil && len(encoded) <= maximumBytes &&
		agentcontract.ValidateSanitizedAgentPayload(value) == nil
}

func evaluationHostedArchiveInstantMember(value map[string]any, key string) (time.Time, error) {
	return evaluationInstant(value[key], key)
}

func evaluationHostedArchiveCanonicalAuxiliaryIDs(value any, providerResourceID string) bool {
	values, ok := evaluationHostedArchiveStringArray(value)
	if !ok || len(values) > 20 {
		return false
	}
	seen := make(map[string]struct{}, len(values))
	for index, entry := range values {
		if !validEvaluationAgentControlIdentity(entry) || entry == providerResourceID {
			return false
		}
		if _, duplicate := seen[entry]; duplicate {
			return false
		}
		seen[entry] = struct{}{}
		if index > 0 && values[index-1] >= entry {
			return false
		}
	}
	return true
}

func evaluationHostedArchiveIdentity(protocolFamily string, capabilityProfileID string) string {
	return protocolFamily + "\x00" + capabilityProfileID
}

func validateEvaluationHostedArchiveRegistration(record map[string]any) (map[string]any, map[string]any, map[string]any, error) {
	result, err := evaluationHostedArchiveObject(record, "registrationResult")
	if err != nil || validateEvaluationHostedArchiveSelfDigest(
		result, evaluationHostedRegistrationResultKeys,
		evaluationHostedRetrievalRuntimeResourceRegistrationResultFormat, "resultDigest",
	) != nil {
		return nil, nil, nil, ErrConflict
	}
	request, requestErr := evaluationHostedArchiveObject(result, "registrationRequest")
	authority, authorityErr := evaluationHostedArchiveObject(result, "authority")
	deletionReceipt, deletionErr := evaluationHostedArchiveObject(result, "deletionAuthorityReceipt")
	if requestErr != nil || authorityErr != nil || deletionErr != nil ||
		validateEvaluationHostedArchiveSelfDigest(request, evaluationHostedRegistrationRequestKeys,
			evaluationHostedRetrievalRuntimeResourceRegistrationRequestFormat, "requestDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(authority, evaluationHostedAuthorityKeys,
			evaluationHostedRetrievalRuntimeResourceAuthorityFormat, "authorityDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(deletionReceipt, evaluationHostedDeletionReceiptKeys,
			evaluationHostedRetrievalRuntimeResourceDeletionReceiptFormat, "deletionAuthorityReceiptDigest") != nil {
		return nil, nil, nil, ErrConflict
	}
	intent, intentErr := evaluationHostedArchiveObject(request, "registrationIntent")
	budget, budgetErr := evaluationHostedArchiveObject(request, "budgetReservationAuthority")
	network, networkErr := evaluationHostedArchiveObject(request, "networkPolicyAuthority")
	projection, projectionErr := evaluationHostedArchiveObject(deletionReceipt, "deletionRequestProjection")
	if intentErr != nil || budgetErr != nil || networkErr != nil || projectionErr != nil ||
		validateEvaluationHostedArchiveSelfDigest(intent, evaluationHostedRegistrationIntentKeys,
			evaluationHostedRetrievalRuntimeResourceRegistrationIntentFormat, "intentDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(budget, evaluationHostedBudgetAuthorityKeys,
			evaluationHostedRetrievalRuntimeResourceBudgetAuthorityFormat, "authorityDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(network, evaluationHostedNetworkAuthorityKeys,
			evaluationHostedRetrievalRuntimeResourceNetworkAuthorityFormat, "authorityDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(projection, evaluationHostedDeletionProjectionKeys,
			evaluationHostedRetrievalRuntimeResourceDeletionProjectionFormat, "projectionDigest") != nil {
		return nil, nil, nil, ErrConflict
	}
	for _, component := range []map[string]any{request, intent, budget, network, authority, deletionReceipt, projection} {
		if !evaluationHostedArchiveSafe(component, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes) {
			return nil, nil, nil, ErrConflict
		}
	}
	if !evaluationHostedArchiveSafe(result, maximumEvaluationHostedRetrievalRuntimeResourceRegistrationResultBytes) {
		return nil, nil, nil, ErrConflict
	}
	protocolFamily := stringMember(request, "protocolFamily")
	profileID := stringMember(request, "capabilityProfileId")
	providerResourceKind := stringMember(authority, "providerResourceKind")
	expectedResourceKind := map[string]string{
		"gemini-interactions": "gemini-file-search-store-name",
		"openai-responses":    "openai-vector-store-id",
	}[protocolFamily]
	if expectedResourceKind == "" || providerResourceKind != expectedResourceKind ||
		!oneOfString(profileID, "g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document") ||
		!evaluationHostedArchiveStringsEqual(intent["requiredOperations"], []string{"create", "delete", "query", "upload"}) ||
		!evaluationHostedArchiveStringsEqual(network["allowedOperations"], []string{"create", "delete", "query", "upload"}) ||
		stringMember(network, "purpose") != "hosted-retrieval-runtime-resource-lifecycle" ||
		stringMember(network, "endpointClass") != "first-party-hosted" {
		return nil, nil, nil, ErrConflict
	}
	maximumLifetime, maximumLifetimeOK := integerMember(intent, "maximumResourceLifetimeMs")
	minimumLease, minimumLeaseOK := integerMember(intent, "minimumQueryReadLeaseMs")
	budgetLedgerRevision, budgetLedgerRevisionOK := integerMember(budget, "ledgerRevision")
	if !maximumLifetimeOK || maximumLifetime != 691_200_000 || !minimumLeaseOK || minimumLease != 155_000 ||
		!budgetLedgerRevisionOK || budgetLedgerRevision < 0 ||
		!validEvaluationAgentControlIdentity(stringMember(budget, "namespaceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(budget, "reservationId")) ||
		!evaluationHostedArchiveDigestMembers(budget, "planDigest", "reservePolicyDigest", "budgetDigest",
			"demandDigest", "demandBytesDigest", "authorityDigest") ||
		!validEvaluationAgentControlIdentity(stringMember(network, "namespaceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(network, "providerConfigurationId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(network, "repositoryCommit")) ||
		!evaluationHostedArchiveDigestMembers(network, "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
			"providerConfigurationDigest", "authorityDigest") {
		return nil, nil, nil, ErrConflict
	}
	if _, err := evaluationHostedArchiveInstantMember(budget, "reservedAt"); err != nil {
		return nil, nil, nil, ErrConflict
	}
	if !validEvaluationAgentControlIdentity(stringMember(request, "namespaceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(request, "runtimeResourceSetId")) ||
		!validEvaluationAgentControlIdentity(stringMember(request, "providerConfigurationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(request, "modelId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(request, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(authority, "providerResourceId")) ||
		!evaluationHostedArchiveCanonicalAuxiliaryIDs(authority["auxiliaryResourceIds"], stringMember(authority, "providerResourceId")) ||
		!evaluationHostedArchiveDigestMembers(request, "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
			"registrationIntentDigest", "providerConfigurationDigest", "modelLineageDigest", "adapterDigest",
			"capabilityProfileDigest", "probeProgramDigest", "publicResourceDescriptorDigest",
			"budgetReservationAuthorityDigest", "networkPolicyAuthorityDigest", "requestDigest") ||
		!evaluationHostedArchiveDigestMembers(authority, "registrationRequestDigest", "planDigest", "frozenRunDigest",
			"runConfigArtifactBindingDigest", "registrationIntentDigest", "providerConfigurationDigest",
			"modelLineageDigest", "adapterDigest", "capabilityProfileDigest", "probeProgramDigest",
			"publicResourceDescriptorDigest", "budgetReservationAuthorityDigest", "networkPolicyAuthorityDigest",
			"resourceManifestDigest", "contentUploadReceiptDigest", "creationDispatchIntentSetDigest",
			"creationTransportReceiptSetDigest", "creationResultSpoolReceiptSetDigest",
			"deletionAuthorityReceiptDigest", "authorityDigest") {
		return nil, nil, nil, ErrConflict
	}
	for _, field := range []string{
		"providerConfigurationId", "providerConfigurationDigest", "protocolFamily", "modelId", "modelLineageDigest",
		"adapterDigest", "capabilityProfileId", "capabilityProfileDigest", "probeProgramDigest", "publicResourceDescriptorDigest",
	} {
		if request[field] != intent[field] || authority[field] != request[field] {
			return nil, nil, nil, ErrConflict
		}
	}
	if stringMember(request, "registrationIntentDigest") != stringMember(intent, "intentDigest") ||
		stringMember(authority, "registrationIntentDigest") != stringMember(request, "registrationIntentDigest") ||
		stringMember(request, "budgetReservationAuthorityDigest") != stringMember(budget, "authorityDigest") ||
		stringMember(authority, "budgetReservationAuthorityDigest") != stringMember(budget, "authorityDigest") ||
		!sameEvaluationCanonicalValue(authority["budgetReservationAuthority"], budget) ||
		stringMember(request, "networkPolicyAuthorityDigest") != stringMember(network, "authorityDigest") ||
		stringMember(authority, "networkPolicyAuthorityDigest") != stringMember(network, "authorityDigest") ||
		!sameEvaluationCanonicalValue(authority["networkPolicyAuthority"], network) {
		return nil, nil, nil, ErrConflict
	}
	for _, field := range []string{"namespaceId", "planDigest"} {
		if budget[field] != request[field] {
			return nil, nil, nil, ErrConflict
		}
	}
	for _, field := range []string{
		"namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
		"providerConfigurationId", "providerConfigurationDigest", "protocolFamily",
	} {
		if network[field] != request[field] {
			return nil, nil, nil, ErrConflict
		}
	}
	for _, field := range []string{
		"planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "runtimeResourceSetId",
	} {
		if authority[field] != request[field] {
			return nil, nil, nil, ErrConflict
		}
	}
	if stringMember(result, "registrationRequestDigest") != stringMember(request, "requestDigest") ||
		stringMember(authority, "registrationRequestDigest") != stringMember(request, "requestDigest") ||
		stringMember(result, "authorityDigest") != stringMember(authority, "authorityDigest") ||
		stringMember(result, "deletionAuthorityReceiptDigest") != stringMember(deletionReceipt, "deletionAuthorityReceiptDigest") ||
		stringMember(authority, "deletionAuthorityReceiptDigest") != stringMember(deletionReceipt, "deletionAuthorityReceiptDigest") ||
		stringMember(deletionReceipt, "registrationRequestDigest") != stringMember(request, "requestDigest") ||
		stringMember(deletionReceipt, "planDigest") != stringMember(request, "planDigest") ||
		stringMember(deletionReceipt, "runConfigArtifactBindingDigest") != stringMember(request, "runConfigArtifactBindingDigest") ||
		stringMember(deletionReceipt, "runtimeResourceSetId") != stringMember(request, "runtimeResourceSetId") ||
		stringMember(deletionReceipt, "providerResourceKind") != providerResourceKind ||
		stringMember(deletionReceipt, "providerResourceId") != stringMember(authority, "providerResourceId") ||
		stringMember(deletionReceipt, "resourceManifestDigest") != stringMember(authority, "resourceManifestDigest") ||
		stringMember(deletionReceipt, "deletionRouteBinding") != "hosted-retrieval-runtime-resource.delete" ||
		stringMember(deletionReceipt, "registeredAt") != stringMember(authority, "registeredAt") ||
		stringMember(deletionReceipt, "expiresAt") != stringMember(authority, "expiresAt") ||
		stringMember(projection, "registrationRequestDigest") != stringMember(request, "requestDigest") ||
		stringMember(projection, "runtimeResourceSetId") != stringMember(request, "runtimeResourceSetId") ||
		stringMember(projection, "protocolFamily") != protocolFamily ||
		stringMember(projection, "providerResourceKind") != providerResourceKind ||
		stringMember(projection, "providerResourceId") != stringMember(authority, "providerResourceId") ||
		stringMember(deletionReceipt, "deletionRequestProjectionDigest") != stringMember(projection, "projectionDigest") ||
		!sameEvaluationCanonicalValue(deletionReceipt["deletionRequestProjection"], projection) ||
		!sameEvaluationCanonicalValue(projection["auxiliaryResourceIds"], authority["auxiliaryResourceIds"]) {
		return nil, nil, nil, ErrConflict
	}
	minimumExpiresAt, minimumExpiresErr := evaluationHostedArchiveInstantMember(request, "minimumExpiresAt")
	registeredAt, registeredErr := evaluationHostedArchiveInstantMember(authority, "registeredAt")
	expiresAt, expiresErr := evaluationHostedArchiveInstantMember(authority, "expiresAt")
	if minimumExpiresErr != nil || registeredErr != nil || expiresErr != nil ||
		!expiresAt.After(registeredAt) || expiresAt.Sub(registeredAt) > 8*24*time.Hour || expiresAt.Before(minimumExpiresAt) {
		return nil, nil, nil, ErrConflict
	}
	return result, request, authority, nil
}

func validateEvaluationHostedArchiveCleanup(
	record map[string]any,
	request map[string]any,
	authority map[string]any,
) (map[string]any, map[string]any, error) {
	commitment, commitmentErr := evaluationHostedArchiveObject(record, "resourceSetCommitment")
	cleanupRequest, requestErr := evaluationHostedArchiveObject(record, "cleanupRequest")
	claim, claimErr := evaluationHostedArchiveObject(record, "storedCleanupClaimAuthorityReceipt")
	priorState, stateErr := evaluationHostedArchiveObject(record, "storedPriorActiveState")
	readRoot, readErr := evaluationHostedArchiveObject(record, "readLeaseLedgerRoot")
	fence, fenceErr := evaluationHostedArchiveObject(record, "storedRunTerminalFence")
	cleanupReceipt, receiptErr := evaluationHostedArchiveObject(record, "cleanupReceipt")
	if commitmentErr != nil || requestErr != nil || claimErr != nil || stateErr != nil || readErr != nil || fenceErr != nil || receiptErr != nil ||
		validateEvaluationHostedArchiveSelfDigest(commitment, evaluationHostedCommitmentKeys,
			evaluationHostedRetrievalRuntimeResourceCommitmentFormat, "commitmentDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(cleanupRequest, evaluationHostedCleanupRequestKeys,
			evaluationHostedRetrievalRuntimeResourceCleanupRequestFormat, "requestDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(claim, evaluationHostedCleanupClaimKeys,
			evaluationHostedRetrievalRuntimeResourceCleanupClaimFormat, "receiptDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(priorState, evaluationHostedActiveStateKeys,
			evaluationHostedRetrievalRuntimeResourceActiveStateFormat, "stateDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(readRoot, evaluationHostedReadLedgerRootKeys,
			evaluationHostedRetrievalRuntimeResourceReadLedgerRootFormat, "rootDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(fence, evaluationHostedTerminalFenceKeys,
			evaluationHostedRetrievalRuntimeResourceTerminalFenceFormat, "fenceDigest") != nil ||
		validateEvaluationHostedArchiveSelfDigest(cleanupReceipt, evaluationHostedCleanupReceiptKeys,
			evaluationHostedRetrievalRuntimeResourceCleanupReceiptFormat, "cleanupReceiptDigest") != nil {
		return nil, nil, ErrConflict
	}
	for _, component := range []map[string]any{commitment, claim, priorState, readRoot, fence} {
		if !evaluationHostedArchiveSafe(component, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes) {
			return nil, nil, ErrConflict
		}
	}
	if !evaluationHostedArchiveSafe(cleanupRequest, maximumEvaluationHostedRetrievalRuntimeResourceCleanupRequestBytes) ||
		!evaluationHostedArchiveSafe(cleanupReceipt, maximumEvaluationHostedRetrievalRuntimeResourceCleanupReceiptBytes) {
		return nil, nil, ErrConflict
	}
	priorGeneration, priorGenerationOK := integerMember(priorState, "claimGeneration")
	readLedgerRevision, readLedgerRevisionOK := integerMember(readRoot, "ledgerRevision")
	readLeaseCount, readLeaseCountOK := integerMember(readRoot, "readLeaseCount")
	claimLedgerRevision, claimLedgerRevisionOK := integerMember(claim, "claimLedgerRevision")
	claimGeneration, claimGenerationOK := integerMember(claim, "claimGeneration")
	fenceLedgerRevision, fenceLedgerRevisionOK := integerMember(fence, "fenceLedgerRevision")
	expectedShardCount, expectedShardCountOK := integerMember(fence, "expectedShardCount")
	terminalShardCount, terminalShardCountOK := integerMember(fence, "terminalShardCount")
	updatedAt, updatedAtErr := evaluationHostedArchiveInstantMember(priorState, "updatedAt")
	claimedAt, claimedAtErr := evaluationHostedArchiveInstantMember(claim, "claimedAt")
	claimExpiresAt, claimExpiresAtErr := evaluationHostedArchiveInstantMember(claim, "claimExpiresAt")
	allShardsTerminalAt, allShardsTerminalAtErr := evaluationHostedArchiveInstantMember(fence, "allShardsTerminalAt")
	fenceSealedAt, fenceSealedAtErr := evaluationHostedArchiveInstantMember(fence, "sealedAt")
	readSealedAt, readSealedAtErr := evaluationHostedArchiveInstantMember(readRoot, "sealedAt")
	if !priorGenerationOK || priorGeneration < 1 || !readLedgerRevisionOK || readLedgerRevision < 1 ||
		!readLeaseCountOK || readLeaseCount < 0 || readLeaseCount > 14_040 ||
		!claimLedgerRevisionOK || claimLedgerRevision < 1 || !claimGenerationOK || claimGeneration < 1 ||
		!fenceLedgerRevisionOK || fenceLedgerRevision < 1 || !expectedShardCountOK ||
		expectedShardCount < 1 || expectedShardCount > 1_024 || !terminalShardCountOK ||
		terminalShardCount != expectedShardCount || updatedAtErr != nil || claimedAtErr != nil || claimExpiresAtErr != nil ||
		allShardsTerminalAtErr != nil || fenceSealedAtErr != nil || readSealedAtErr != nil ||
		claimedAt.Before(updatedAt) || !claimExpiresAt.After(claimedAt) || claimExpiresAt.Sub(claimedAt) > 15*time.Minute ||
		fenceSealedAt.Before(allShardsTerminalAt) ||
		!oneOfString(stringMember(fence, "terminalOutcome"), "cancelled", "completed", "failed") {
		return nil, nil, ErrConflict
	}
	if !validEvaluationAgentControlIdentity(stringMember(priorState, "activeOwnerInstanceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(readRoot, "ledgerAuthorityIssuerId")) ||
		!validEvaluationAgentControlIdentity(stringMember(claim, "claimId")) ||
		!validEvaluationAgentControlIdentity(stringMember(claim, "claimAuthorityIssuerId")) ||
		!validEvaluationAgentControlIdentity(stringMember(claim, "cleanupOwnerInstanceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fence, "fenceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fence, "fenceAuthorityIssuerId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fence, "namespaceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fence, "runtimeResourceSetId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(fence, "repositoryCommit")) {
		return nil, nil, ErrConflict
	}
	readLeaseNotAfterRaw := priorState["readLeaseNotAfter"]
	if readLeaseNotAfterRaw != nil {
		readLeaseNotAfter, readLeaseNotAfterErr := evaluationHostedArchiveInstantMember(priorState, "readLeaseNotAfter")
		if readLeaseNotAfterErr != nil || !readLeaseNotAfter.After(updatedAt) || readLeaseNotAfter.Sub(updatedAt) > 180*time.Second {
			return nil, nil, ErrConflict
		}
	}
	readRootEmpty := readLeaseCount == 0
	minimumGenerationRaw, minimumGenerationNull := readRoot["minimumClaimGeneration"]
	maximumGenerationRaw, maximumGenerationNull := readRoot["maximumClaimGeneration"]
	firstCheckedAtRaw, firstCheckedAtNull := readRoot["firstCheckedAt"]
	lastExpiresAtRaw, lastExpiresAtNull := readRoot["lastExpiresAt"]
	if !minimumGenerationNull || !maximumGenerationNull || !firstCheckedAtNull || !lastExpiresAtNull ||
		readRootEmpty != (minimumGenerationRaw == nil) || readRootEmpty != (maximumGenerationRaw == nil) ||
		readRootEmpty != (firstCheckedAtRaw == nil) || readRootEmpty != (lastExpiresAtRaw == nil) {
		return nil, nil, ErrConflict
	}
	if readRootEmpty {
		emptyDigest, emptyDigestErr := canonicaljson.Digest([]any{})
		if emptyDigestErr != nil || stringMember(readRoot, "readLeaseIdSetDigest") != emptyDigest ||
			stringMember(readRoot, "readRequestDigestSetDigest") != emptyDigest ||
			stringMember(readRoot, "readReceiptDigestSetDigest") != emptyDigest ||
			stringMember(readRoot, "activeStateDigestSetDigest") != emptyDigest {
			return nil, nil, ErrConflict
		}
	} else {
		minimumGeneration, minimumGenerationOK := integerMember(readRoot, "minimumClaimGeneration")
		maximumGeneration, maximumGenerationOK := integerMember(readRoot, "maximumClaimGeneration")
		firstCheckedAt, firstCheckedAtErr := evaluationHostedArchiveInstantMember(readRoot, "firstCheckedAt")
		lastExpiresAt, lastExpiresAtErr := evaluationHostedArchiveInstantMember(readRoot, "lastExpiresAt")
		if !minimumGenerationOK || minimumGeneration < 1 || !maximumGenerationOK || maximumGeneration < minimumGeneration ||
			firstCheckedAtErr != nil || lastExpiresAtErr != nil || !lastExpiresAt.After(firstCheckedAt) || readSealedAt.Before(lastExpiresAt) {
			return nil, nil, ErrConflict
		}
	}
	bindings, bindingsOK := commitment["authorityBindings"].([]any)
	if !bindingsOK || len(bindings) != maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords {
		return nil, nil, ErrConflict
	}
	bindingIdentities := make([]string, len(bindings))
	bindingAuthorityDigests := make(map[string]struct{}, len(bindings))
	for index, rawBinding := range bindings {
		binding, ok := rawBinding.(map[string]any)
		if !ok || !exactEvaluationKeys(binding, evaluationHostedAuthorityBindingKeys) ||
			!evaluationHostedArchiveDigestMembers(binding, "authorityDigest", "registrationIntentDigest",
				"providerConfigurationDigest", "budgetReservationAuthorityDigest", "networkPolicyAuthorityDigest") ||
			!oneOfString(stringMember(binding, "protocolFamily"), "gemini-interactions", "openai-responses") ||
			!oneOfString(stringMember(binding, "capabilityProfileId"),
				"g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document") ||
			!validEvaluationAgentControlIdentity(stringMember(binding, "budgetReservationId")) {
			return nil, nil, ErrConflict
		}
		bindingIdentities[index] = evaluationHostedArchiveIdentity(
			stringMember(binding, "protocolFamily"), stringMember(binding, "capabilityProfileId"),
		)
		authorityDigest := stringMember(binding, "authorityDigest")
		if _, duplicate := bindingAuthorityDigests[authorityDigest]; duplicate {
			return nil, nil, ErrConflict
		}
		bindingAuthorityDigests[authorityDigest] = struct{}{}
	}
	if !sameEvaluationCanonicalValue(bindingIdentities, evaluationHostedRetrievalRuntimeResourceArchiveExpectedAuthorityKeys) {
		return nil, nil, ErrConflict
	}
	for _, field := range []string{"planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "runtimeResourceSetId"} {
		if commitment[field] != request[field] || cleanupRequest[field] != request[field] || claim[field] != request[field] ||
			fence[field] != request[field] {
			return nil, nil, ErrConflict
		}
	}
	if readRoot["planDigest"] != request["planDigest"] ||
		readRoot["runConfigArtifactBindingDigest"] != request["runConfigArtifactBindingDigest"] ||
		readRoot["runtimeResourceSetId"] != request["runtimeResourceSetId"] ||
		stringMember(cleanupRequest, "namespaceId") != stringMember(request, "namespaceId") ||
		stringMember(cleanupRequest, "repositoryCommit") != stringMember(request, "repositoryCommit") ||
		stringMember(claim, "namespaceId") != stringMember(request, "namespaceId") ||
		stringMember(claim, "repositoryCommit") != stringMember(request, "repositoryCommit") ||
		stringMember(fence, "namespaceId") != stringMember(request, "namespaceId") ||
		stringMember(fence, "repositoryCommit") != stringMember(request, "repositoryCommit") {
		return nil, nil, ErrConflict
	}
	authorityDigest := stringMember(authority, "authorityDigest")
	commitmentDigest := stringMember(commitment, "commitmentDigest")
	for _, value := range []map[string]any{cleanupRequest, claim, priorState, readRoot, cleanupReceipt} {
		if stringMember(value, "authorityDigest") != authorityDigest {
			return nil, nil, ErrConflict
		}
	}
	for _, value := range []map[string]any{cleanupRequest, claim, priorState, readRoot, cleanupReceipt} {
		if stringMember(value, "resourceSetCommitmentDigest") != commitmentDigest {
			return nil, nil, ErrConflict
		}
	}
	if stringMember(cleanupRequest, "readLeaseLedgerRootDigest") != stringMember(readRoot, "rootDigest") ||
		stringMember(cleanupRequest, "cleanupClaimAuthorityReceiptDigest") != stringMember(claim, "receiptDigest") ||
		stringMember(cleanupRequest, "deletionAuthorityReceiptDigest") != stringMember(authority, "deletionAuthorityReceiptDigest") ||
		stringMember(cleanupRequest, "cleanupOwnerInstanceId") != stringMember(claim, "cleanupOwnerInstanceId") ||
		stringMember(cleanupRequest, "priorActiveStateDigest") != stringMember(priorState, "stateDigest") ||
		stringMember(claim, "expectedActiveStateDigest") != stringMember(priorState, "stateDigest") ||
		stringMember(cleanupRequest, "runTerminalFenceDigest") != stringMember(fence, "fenceDigest") ||
		!sameEvaluationCanonicalValue(cleanupRequest["priorActiveState"], priorState) ||
		!sameEvaluationCanonicalValue(cleanupRequest["runTerminalFence"], fence) ||
		readRoot["lastExpiresAt"] != priorState["readLeaseNotAfter"] {
		return nil, nil, ErrConflict
	}
	requestGeneration, requestGenerationOK := integerMember(cleanupRequest, "claimGeneration")
	receiptGeneration, receiptGenerationOK := integerMember(cleanupReceipt, "claimGeneration")
	if !priorGenerationOK || !claimGenerationOK || !requestGenerationOK || !receiptGenerationOK ||
		priorGeneration < 1 || claimGeneration != priorGeneration+1 || requestGeneration != claimGeneration ||
		receiptGeneration != claimGeneration || stringMember(priorState, "lifecycle") != "active" ||
		stringMember(cleanupRequest, "claimedLifecycle") != "cleanup-in-progress" ||
		!oneOfString(stringMember(cleanupRequest, "cleanupReason"), "expired", "matrix-terminal", "owner-shutdown", "startup-reconcile") {
		return nil, nil, ErrConflict
	}
	requestedAt, requestedAtErr := evaluationHostedArchiveInstantMember(cleanupRequest, "requestedAt")
	deletionNotBefore, deletionNotBeforeErr := evaluationHostedArchiveInstantMember(cleanupRequest, "deletionNotBefore")
	if requestedAtErr != nil || deletionNotBeforeErr != nil || requestedAt.Before(updatedAt) ||
		requestedAt.Before(allShardsTerminalAt) || requestedAt.Before(fenceSealedAt) || requestedAt.Before(readSealedAt) ||
		cleanupRequest["requestedAt"] != claim["claimedAt"] || !requestedAt.Before(claimExpiresAt) {
		return nil, nil, ErrConflict
	}
	expectedDeletionNotBefore := requestedAt
	if readLeaseNotAfterRaw != nil {
		readLeaseNotAfter, _ := evaluationHostedArchiveInstantMember(priorState, "readLeaseNotAfter")
		if readLeaseNotAfter.After(expectedDeletionNotBefore) {
			expectedDeletionNotBefore = readLeaseNotAfter
		}
	}
	if !deletionNotBefore.Equal(expectedDeletionNotBefore) {
		return nil, nil, ErrConflict
	}
	if maximumGenerationRaw != nil {
		maximumReadGeneration, maximumReadGenerationOK := integerMember(readRoot, "maximumClaimGeneration")
		if !maximumReadGenerationOK || claimGeneration <= maximumReadGeneration {
			return nil, nil, ErrConflict
		}
	}
	claimedStateDigest, claimedStateErr := canonicaljson.Digest(map[string]any{
		"format":                      "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claimed-state",
		"version":                     evaluationHostedRetrievalRuntimeResourceVersion,
		"authorityDigest":             authorityDigest,
		"resourceSetCommitmentDigest": commitmentDigest,
		"cleanupOwnerInstanceId":      stringMember(claim, "cleanupOwnerInstanceId"),
		"claimGeneration":             claimGeneration,
		"claimedAt":                   claim["claimedAt"],
		"lifecycle":                   "cleanup-in-progress",
	})
	if claimedStateErr != nil || claimedStateDigest != stringMember(claim, "claimedStateDigest") {
		return nil, nil, ErrConflict
	}
	overdueRaw, overduePresent := record["overdueReceipt"]
	cleanupReason := stringMember(cleanupRequest, "cleanupReason")
	if !overduePresent {
		return nil, nil, ErrConflict
	}
	if overdueRaw == nil {
		if cleanupRequest["overdueReceiptDigest"] != nil || cleanupReceipt["overdueReceiptDigest"] != nil || cleanupReason == "expired" {
			return nil, nil, ErrConflict
		}
	} else {
		overdue, ok := overdueRaw.(map[string]any)
		resourceExpiresAt, resourceExpiresAtErr := evaluationHostedArchiveInstantMember(overdue, "resourceExpiresAt")
		detectedAt, detectedAtErr := evaluationHostedArchiveInstantMember(overdue, "detectedAt")
		if !ok || !evaluationHostedArchiveSafe(overdue, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes) ||
			cleanupReason != "expired" ||
			validateEvaluationHostedArchiveSelfDigest(overdue, evaluationHostedOverdueReceiptKeys,
				evaluationHostedRetrievalRuntimeResourceOverdueReceiptFormat, "receiptDigest") != nil ||
			stringMember(overdue, "authorityDigest") != authorityDigest ||
			stringMember(overdue, "planDigest") != stringMember(request, "planDigest") ||
			stringMember(overdue, "runConfigArtifactBindingDigest") != stringMember(request, "runConfigArtifactBindingDigest") ||
			stringMember(overdue, "runtimeResourceSetId") != stringMember(request, "runtimeResourceSetId") ||
			stringMember(overdue, "providerResourceKind") != stringMember(authority, "providerResourceKind") ||
			stringMember(overdue, "providerResourceId") != stringMember(authority, "providerResourceId") ||
			stringMember(overdue, "resourceExpiresAt") != stringMember(authority, "expiresAt") ||
			stringMember(overdue, "disposition") != "cleanup-required" || resourceExpiresAtErr != nil || detectedAtErr != nil ||
			!detectedAt.After(resourceExpiresAt) || requestedAt.Before(detectedAt) ||
			stringMember(cleanupRequest, "overdueReceiptDigest") != stringMember(overdue, "receiptDigest") ||
			stringMember(cleanupReceipt, "overdueReceiptDigest") != stringMember(overdue, "receiptDigest") {
			return nil, nil, ErrConflict
		}
	}
	if stringMember(cleanupReceipt, "cleanupRequestDigest") != stringMember(cleanupRequest, "requestDigest") ||
		stringMember(cleanupReceipt, "planDigest") != stringMember(request, "planDigest") ||
		stringMember(cleanupReceipt, "runConfigArtifactBindingDigest") != stringMember(request, "runConfigArtifactBindingDigest") ||
		stringMember(cleanupReceipt, "runtimeResourceSetId") != stringMember(request, "runtimeResourceSetId") ||
		stringMember(cleanupReceipt, "readLeaseLedgerRootDigest") != stringMember(readRoot, "rootDigest") ||
		stringMember(cleanupReceipt, "cleanupClaimAuthorityReceiptDigest") != stringMember(claim, "receiptDigest") ||
		stringMember(cleanupReceipt, "deletionAuthorityReceiptDigest") != stringMember(authority, "deletionAuthorityReceiptDigest") ||
		stringMember(cleanupReceipt, "protocolFamily") != stringMember(authority, "protocolFamily") ||
		stringMember(cleanupReceipt, "providerResourceKind") != stringMember(authority, "providerResourceKind") ||
		stringMember(cleanupReceipt, "providerResourceId") != stringMember(authority, "providerResourceId") ||
		!sameEvaluationCanonicalValue(cleanupReceipt["auxiliaryResourceIds"], authority["auxiliaryResourceIds"]) ||
		stringMember(cleanupReceipt, "runTerminalFenceDigest") != stringMember(fence, "fenceDigest") ||
		stringMember(cleanupReceipt, "cleanupReason") != cleanupReason ||
		stringMember(cleanupReceipt, "cleanupOwnerInstanceId") != stringMember(claim, "cleanupOwnerInstanceId") ||
		stringMember(cleanupReceipt, "priorActiveStateDigest") != stringMember(priorState, "stateDigest") ||
		cleanupReceipt["deletionNotBefore"] != cleanupRequest["deletionNotBefore"] ||
		stringMember(cleanupReceipt, "terminalLifecycle") != "cleaned" {
		return nil, nil, ErrConflict
	}
	if !validEvaluationAgentControlIdentity(stringMember(cleanupRequest, "namespaceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(cleanupRequest, "runtimeResourceSetId")) ||
		!validEvaluationAgentControlIdentity(stringMember(cleanupRequest, "cleanupOwnerInstanceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(cleanupReceipt, "runtimeResourceSetId")) ||
		!validEvaluationAgentControlIdentity(stringMember(cleanupReceipt, "providerResourceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(cleanupReceipt, "cleanupOwnerInstanceId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(cleanupRequest, "repositoryCommit")) {
		return nil, nil, ErrConflict
	}
	if !evaluationHostedArchiveDigestMembers(commitment, "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
		"authoritySetDigest", "commitmentDigest") ||
		!evaluationHostedArchiveDigestMembers(cleanupRequest, "planDigest", "frozenRunDigest",
			"runConfigArtifactBindingDigest", "authorityDigest", "resourceSetCommitmentDigest",
			"readLeaseLedgerRootDigest", "cleanupClaimAuthorityReceiptDigest", "deletionAuthorityReceiptDigest",
			"priorActiveStateDigest", "runTerminalFenceDigest", "requestDigest") ||
		!evaluationHostedArchiveDigestMembers(claim, "claimAuthorityImplementationDigest", "planDigest", "frozenRunDigest",
			"runConfigArtifactBindingDigest", "authorityDigest", "resourceSetCommitmentDigest",
			"expectedActiveStateDigest", "claimedStateDigest", "receiptDigest") ||
		!evaluationHostedArchiveDigestMembers(readRoot, "ledgerAuthorityImplementationDigest", "planDigest",
			"runConfigArtifactBindingDigest", "authorityDigest", "resourceSetCommitmentDigest",
			"readLeaseIdSetDigest", "readRequestDigestSetDigest", "readReceiptDigestSetDigest",
			"activeStateDigestSetDigest", "rootDigest") ||
		!evaluationHostedArchiveDigestMembers(fence, "fenceAuthorityImplementationDigest", "planDigest", "frozenRunDigest",
			"runConfigArtifactBindingDigest", "terminalShardIdSetDigest", "terminalAttemptIdSetDigest",
			"terminalShardLeaseGenerationSetDigest", "terminalShardResultSetDigest", "fenceDigest") ||
		!evaluationHostedArchiveDigestMembers(cleanupReceipt, "cleanupRequestDigest", "planDigest",
			"runConfigArtifactBindingDigest", "authorityDigest", "resourceSetCommitmentDigest",
			"readLeaseLedgerRootDigest", "cleanupClaimAuthorityReceiptDigest", "deletionAuthorityReceiptDigest",
			"runTerminalFenceDigest", "priorActiveStateDigest", "resourceResultSetDigest", "terminalStateDigest",
			"cleanupReceiptDigest") {
		return nil, nil, ErrConflict
	}
	residual, residualOK := cleanupReceipt["residualProviderResourceIds"].([]any)
	resourceResults, resultsOK := cleanupReceipt["resourceResults"].([]any)
	auxiliaryIDs, auxiliaryOK := evaluationHostedArchiveStringArray(authority["auxiliaryResourceIds"])
	if !residualOK || len(residual) != 0 || !resultsOK || !auxiliaryOK || len(resourceResults) != len(auxiliaryIDs)+1 {
		return nil, nil, ErrConflict
	}
	expectedResourceIDs := append(append([]string{}, auxiliaryIDs...), stringMember(authority, "providerResourceId"))
	sort.Strings(expectedResourceIDs)
	actualResourceIDs := make([]string, len(resourceResults))
	resultDigests := make([]any, len(resourceResults))
	completedAtValues := make([]string, len(resourceResults))
	for index, rawResult := range resourceResults {
		result, ok := rawResult.(map[string]any)
		if !ok || validateEvaluationHostedArchiveSelfDigest(result, evaluationHostedCleanupResultKeys,
			evaluationHostedRetrievalRuntimeResourceCleanupResultFormat, "resultDigest") != nil ||
			stringMember(result, "cleanupClaimAuthorityReceiptDigest") != stringMember(claim, "receiptDigest") ||
			!evaluationHostedArchiveDigestMembers(result, "cleanupClaimAuthorityReceiptDigest", "dispatchIntentDigest",
				"transportReceiptDigest", "resultSpoolReceiptDigest", "resultSpoolDispositionReceiptDigest", "resultDigest") {
			return nil, nil, ErrConflict
		}
		actualResourceIDs[index] = stringMember(result, "resourceId")
		resultDigests[index] = stringMember(result, "resultDigest")
		completedAtValues[index] = stringMember(result, "completedAt")
		isPrimary := actualResourceIDs[index] == stringMember(authority, "providerResourceId")
		resourceRole := stringMember(result, "resourceRole")
		dispatchCreatedAt, dispatchErr := evaluationHostedArchiveInstantMember(result, "dispatchCreatedAt")
		completedAt, completedErr := evaluationHostedArchiveInstantMember(result, "completedAt")
		deletionNotBefore, deletionErr := evaluationHostedArchiveInstantMember(cleanupReceipt, "deletionNotBefore")
		if !validEvaluationAgentControlIdentity(actualResourceIDs[index]) ||
			!oneOfString(resourceRole, "auxiliary", "primary") || (resourceRole == "primary") != isPrimary ||
			!oneOfString(stringMember(result, "outcome"), "already-absent", "deleted") {
			return nil, nil, ErrConflict
		}
		if dispatchErr != nil || completedErr != nil || deletionErr != nil ||
			dispatchCreatedAt.Before(deletionNotBefore) || !dispatchCreatedAt.Before(claimExpiresAt) ||
			completedAt.Before(dispatchCreatedAt) {
			return nil, nil, ErrConflict
		}
	}
	if !sameEvaluationCanonicalValue(actualResourceIDs, expectedResourceIDs) {
		return nil, nil, ErrConflict
	}
	resultSetDigest, digestErr := canonicaljson.Digest(resultDigests)
	if digestErr != nil || resultSetDigest != stringMember(cleanupReceipt, "resourceResultSetDigest") {
		return nil, nil, ErrConflict
	}
	sort.Strings(completedAtValues)
	if len(completedAtValues) == 0 || stringMember(cleanupReceipt, "completedAt") != completedAtValues[len(completedAtValues)-1] {
		return nil, nil, ErrConflict
	}
	terminalStateDigest, terminalStateErr := canonicaljson.Digest(map[string]any{
		"format":                             "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-state",
		"version":                            evaluationHostedRetrievalRuntimeResourceVersion,
		"authorityDigest":                    authorityDigest,
		"cleanupRequestDigest":               stringMember(cleanupRequest, "requestDigest"),
		"cleanupOwnerInstanceId":             stringMember(cleanupReceipt, "cleanupOwnerInstanceId"),
		"claimGeneration":                    receiptGeneration,
		"readLeaseLedgerRootDigest":          stringMember(readRoot, "rootDigest"),
		"cleanupClaimAuthorityReceiptDigest": stringMember(claim, "receiptDigest"),
		"completedAt":                        cleanupReceipt["completedAt"],
		"lifecycle":                          "cleaned",
		"residualProviderResourceIds":        []any{},
	})
	if terminalStateErr != nil || terminalStateDigest != stringMember(cleanupReceipt, "terminalStateDigest") {
		return nil, nil, ErrConflict
	}
	return commitment, fence, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord(
	recordBytes []byte,
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord, error) {
	value, err := decodeCanonicalEvaluationObject(
		recordBytes, maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes,
	)
	if err != nil || validateEvaluationHostedArchiveSelfDigest(
		value, evaluationHostedArchiveRecordKeys,
		evaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordFormat, "recordDigest",
	) != nil || agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, ErrConflict
	}
	if !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "runtimeResourceSetId")) ||
		!evaluationHostedArchiveDigestMembers(value, "planDigest", "frozenRunDigest",
			"runConfigArtifactBindingDigest", "registrationRequestDigest", "authorityDigest",
			"cleanupRequestDigest", "cleanupReceiptDigest", "recordDigest") {
		return EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, ErrConflict
	}
	result, request, authority, err := validateEvaluationHostedArchiveRegistration(value)
	if err != nil {
		return EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, err
	}
	commitment, fence, err := validateEvaluationHostedArchiveCleanup(value, request, authority)
	if err != nil {
		return EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, err
	}
	cleanupRequest, _ := objectMember(value, "cleanupRequest")
	cleanupReceipt, _ := objectMember(value, "cleanupReceipt")
	if stringMember(request, "namespaceId") != namespaceID ||
		stringMember(request, "planDigest") != partition.PlanDigest ||
		stringMember(request, "repositoryCommit") != partition.RepositoryCommit ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit ||
		stringMember(value, "planDigest") != partition.PlanDigest ||
		stringMember(value, "frozenRunDigest") != stringMember(request, "frozenRunDigest") ||
		stringMember(value, "runConfigArtifactBindingDigest") != stringMember(request, "runConfigArtifactBindingDigest") ||
		stringMember(value, "runtimeResourceSetId") != stringMember(request, "runtimeResourceSetId") ||
		stringMember(value, "registrationRequestDigest") != stringMember(request, "requestDigest") ||
		stringMember(value, "authorityDigest") != stringMember(authority, "authorityDigest") ||
		stringMember(value, "cleanupRequestDigest") != stringMember(cleanupRequest, "requestDigest") ||
		stringMember(value, "cleanupReceiptDigest") != stringMember(cleanupReceipt, "cleanupReceiptDigest") ||
		stringMember(result, "authorityDigest") != stringMember(value, "authorityDigest") {
		return EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{}, ErrConflict
	}
	return EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{
		NamespaceID: namespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		FrozenRunDigest:                stringMember(value, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID:           stringMember(value, "runtimeResourceSetId"),
		ProtocolFamily:                 stringMember(request, "protocolFamily"), CapabilityProfileID: stringMember(request, "capabilityProfileId"),
		RegistrationIntent: stringMember(request, "registrationIntentDigest"), AuthorityDigest: stringMember(value, "authorityDigest"),
		AuthoritySetDigest: stringMember(commitment, "authoritySetDigest"), CommitmentDigest: stringMember(commitment, "commitmentDigest"),
		TerminalFenceDigest: stringMember(fence, "fenceDigest"), CleanupReceiptDigest: stringMember(value, "cleanupReceiptDigest"),
		RecordDigest: stringMember(value, "recordDigest"),
		RecordBytes:  recordBytes, value: value,
	}, nil
}

func evaluationHostedArchivePlanIntentBindings(plan evaluationPlanFact) (map[string]string, error) {
	targets, ok := arrayMember(plan.Value, "capabilityQualificationTargets")
	if !ok {
		return nil, ErrConflict
	}
	bindings := make(map[string]string, maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords)
	for _, rawTarget := range targets {
		target, targetOK := rawTarget.(map[string]any)
		if !targetOK {
			return nil, ErrConflict
		}
		optionalAuthority, optionalOK := objectMember(target, "optionalCapabilitySupportAuthority")
		if !optionalOK {
			continue
		}
		runtimeAuthority, runtimeOK := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
		if !runtimeOK {
			continue
		}
		rawIntent, hasIntent := runtimeAuthority["hostedRetrievalRuntimeResourceRegistrationIntentDigest"]
		if !hasIntent {
			continue
		}
		intent, intentOK := rawIntent.(string)
		protocolFamily := stringMember(target, "protocolFamily")
		profileID := stringMember(target, "capabilityProfileId")
		key := evaluationHostedArchiveIdentity(protocolFamily, profileID)
		if !intentOK || !evaluationDigestPattern.MatchString(intent) ||
			stringMember(optionalAuthority, "capabilityId") != "provider.hosted-retrieval" ||
			stringMember(runtimeAuthority, "capabilityId") != "provider.hosted-retrieval" ||
			stringMember(runtimeAuthority, "protocolFamily") != protocolFamily ||
			stringMember(runtimeAuthority, "capabilityProfileId") != profileID ||
			!oneOfString(protocolFamily, "gemini-interactions", "openai-responses") ||
			!oneOfString(profileID, "g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document") {
			return nil, ErrConflict
		}
		if _, duplicate := bindings[key]; duplicate {
			return nil, ErrConflict
		}
		bindings[key] = intent
	}
	if len(bindings) != 0 && len(bindings) != maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords {
		return nil, ErrConflict
	}
	if len(bindings) == maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords {
		for _, key := range evaluationHostedRetrievalRuntimeResourceArchiveExpectedAuthorityKeys {
			if _, exists := bindings[key]; !exists {
				return nil, ErrConflict
			}
		}
	}
	return bindings, nil
}

func validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamily(
	plan evaluationPlanFact,
	records []EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord,
) error {
	expectedIntents, err := evaluationHostedArchivePlanIntentBindings(plan)
	if err != nil || len(records) != len(expectedIntents) ||
		validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(int64(len(records)), 0) != nil {
		return ErrConflict
	}
	if len(records) == 0 {
		return nil
	}
	first := records[0]
	seenIdentities := make(map[string]struct{}, len(records))
	seenAuthorities := make(map[string]struct{}, len(records))
	seenRecords := make(map[string]struct{}, len(records))
	authorities := make([]map[string]any, len(records))
	var totalBytes int64
	for index, record := range records {
		identity := evaluationHostedArchiveIdentity(record.ProtocolFamily, record.CapabilityProfileID)
		expectedIntent, expected := expectedIntents[identity]
		registrationResult, resultOK := objectMember(record.value, "registrationResult")
		authority, authorityOK := objectMember(registrationResult, "authority")
		commitment, commitmentOK := objectMember(record.value, "resourceSetCommitment")
		fence, fenceOK := objectMember(record.value, "storedRunTerminalFence")
		if len(record.RecordBytes) < 1 ||
			len(record.RecordBytes) > maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes ||
			identity != evaluationHostedRetrievalRuntimeResourceArchiveExpectedAuthorityKeys[index] ||
			!expected || expectedIntent != record.RegistrationIntent || !resultOK || !authorityOK || !commitmentOK || !fenceOK ||
			record.NamespaceID != first.NamespaceID || record.PlanDigest != plan.PlanDigest ||
			record.RepositoryCommit != plan.RepositoryCommit || record.FrozenRunDigest != first.FrozenRunDigest ||
			record.RunConfigArtifactBindingDigest != first.RunConfigArtifactBindingDigest ||
			record.RuntimeResourceSetID != first.RuntimeResourceSetID || record.AuthoritySetDigest != first.AuthoritySetDigest ||
			record.CommitmentDigest != first.CommitmentDigest || record.TerminalFenceDigest != first.TerminalFenceDigest ||
			!sameEvaluationCanonicalValue(commitment, first.value["resourceSetCommitment"]) ||
			!sameEvaluationCanonicalValue(fence, first.value["storedRunTerminalFence"]) {
			return ErrConflict
		}
		if _, duplicate := seenIdentities[identity]; duplicate {
			return ErrConflict
		}
		if _, duplicate := seenAuthorities[record.AuthorityDigest]; duplicate {
			return ErrConflict
		}
		if _, duplicate := seenRecords[record.RecordDigest]; duplicate {
			return ErrConflict
		}
		seenIdentities[identity] = struct{}{}
		seenAuthorities[record.AuthorityDigest] = struct{}{}
		seenRecords[record.RecordDigest] = struct{}{}
		authorities[index] = authority
		totalBytes += int64(len(record.RecordBytes))
	}
	encodedFamilyBytes := totalBytes + int64(len(records)+1)
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(
		int64(len(records)), encodedFamilyBytes,
	); err != nil {
		return err
	}
	sort.Slice(authorities, func(left, right int) bool {
		return evaluationHostedArchiveIdentity(
			stringMember(authorities[left], "protocolFamily"), stringMember(authorities[left], "capabilityProfileId"),
		) < evaluationHostedArchiveIdentity(
			stringMember(authorities[right], "protocolFamily"), stringMember(authorities[right], "capabilityProfileId"),
		)
	})
	identities := make([]string, len(authorities))
	authorityDigests := make([]any, len(authorities))
	authorityBindings := make([]any, len(authorities))
	for index, authority := range authorities {
		identities[index] = evaluationHostedArchiveIdentity(stringMember(authority, "protocolFamily"), stringMember(authority, "capabilityProfileId"))
		authorityDigests[index] = stringMember(authority, "authorityDigest")
		budget, budgetOK := objectMember(authority, "budgetReservationAuthority")
		if !budgetOK {
			return ErrConflict
		}
		authorityBindings[index] = map[string]any{
			"authorityDigest":                  stringMember(authority, "authorityDigest"),
			"registrationIntentDigest":         stringMember(authority, "registrationIntentDigest"),
			"protocolFamily":                   stringMember(authority, "protocolFamily"),
			"capabilityProfileId":              stringMember(authority, "capabilityProfileId"),
			"providerConfigurationDigest":      stringMember(authority, "providerConfigurationDigest"),
			"budgetReservationId":              stringMember(budget, "reservationId"),
			"budgetReservationAuthorityDigest": stringMember(authority, "budgetReservationAuthorityDigest"),
			"networkPolicyAuthorityDigest":     stringMember(authority, "networkPolicyAuthorityDigest"),
		}
	}
	if !sameEvaluationCanonicalValue(identities, evaluationHostedRetrievalRuntimeResourceArchiveExpectedAuthorityKeys) {
		return ErrConflict
	}
	authoritySetBase := map[string]any{
		"format":                         evaluationHostedRetrievalRuntimeResourceAuthoritySetFormat,
		"version":                        evaluationHostedRetrievalRuntimeResourceVersion,
		"planDigest":                     first.PlanDigest,
		"frozenRunDigest":                first.FrozenRunDigest,
		"runConfigArtifactBindingDigest": first.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId":           first.RuntimeResourceSetID,
		"authorities":                    authorities,
		"authorityDigests":               authorityDigests,
	}
	authoritySetDigest, err := canonicaljson.Digest(authoritySetBase)
	if err != nil || authoritySetDigest != first.AuthoritySetDigest {
		return ErrConflict
	}
	commitmentBase := map[string]any{
		"format":                         evaluationHostedRetrievalRuntimeResourceCommitmentFormat,
		"version":                        evaluationHostedRetrievalRuntimeResourceVersion,
		"planDigest":                     first.PlanDigest,
		"frozenRunDigest":                first.FrozenRunDigest,
		"runConfigArtifactBindingDigest": first.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId":           first.RuntimeResourceSetID,
		"authoritySetDigest":             authoritySetDigest,
		"authorityBindings":              authorityBindings,
	}
	commitmentDigest, err := canonicaljson.Digest(commitmentBase)
	if err != nil || commitmentDigest != first.CommitmentDigest {
		return ErrConflict
	}
	commitment := cloneEvaluationObject(commitmentBase)
	commitment["commitmentDigest"] = commitmentDigest
	if !sameEvaluationCanonicalValue(commitment, first.value["resourceSetCommitment"]) {
		return ErrConflict
	}
	return nil
}
