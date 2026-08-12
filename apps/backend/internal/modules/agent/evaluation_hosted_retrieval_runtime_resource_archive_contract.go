package agent

const (
	evaluationHostedRetrievalRuntimeResourceVersion = int64(1)

	evaluationHostedRetrievalRuntimeResourceRegistrationIntentFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-intent"
	evaluationHostedRetrievalRuntimeResourceRegistrationRequestFormat  = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-request"
	evaluationHostedRetrievalRuntimeResourceBudgetAuthorityFormat      = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-budget-reservation-authority"
	evaluationHostedRetrievalRuntimeResourceNetworkAuthorityFormat     = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-network-policy-authority"
	evaluationHostedRetrievalRuntimeResourceDeletionProjectionFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-deletion-request-projection"
	evaluationHostedRetrievalRuntimeResourceDeletionReceiptFormat      = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-deletion-authority-receipt"
	evaluationHostedRetrievalRuntimeResourceAuthorityFormat            = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-authority"
	evaluationHostedRetrievalRuntimeResourceAuthoritySetFormat         = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-authority-set"
	evaluationHostedRetrievalRuntimeResourceCommitmentFormat           = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-set-commitment"
	evaluationHostedRetrievalRuntimeResourceRegistrationResultFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-result"
	evaluationHostedRetrievalRuntimeResourceActiveStateFormat          = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-active-state"
	evaluationHostedRetrievalRuntimeResourceReadLedgerRootFormat       = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-lease-ledger-root"
	evaluationHostedRetrievalRuntimeResourceCleanupClaimFormat         = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claim-authority-receipt"
	evaluationHostedRetrievalRuntimeResourceTerminalFenceFormat        = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-run-terminal-fence"
	evaluationHostedRetrievalRuntimeResourceOverdueReceiptFormat       = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-overdue-receipt"
	evaluationHostedRetrievalRuntimeResourceCleanupRequestFormat       = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-request"
	evaluationHostedRetrievalRuntimeResourceCleanupResultFormat        = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-resource-result"
	evaluationHostedRetrievalRuntimeResourceCleanupReceiptFormat       = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-receipt"
	evaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-archive-record"
)

var evaluationHostedRetrievalRuntimeResourceArchiveExpectedAuthorityKeys = []string{
	"gemini-interactions\x00g4-provider-hosted-retrieval-core",
	"gemini-interactions\x00g4-provider-hosted-retrieval-document",
	"openai-responses\x00g4-provider-hosted-retrieval-core",
	"openai-responses\x00g4-provider-hosted-retrieval-document",
}

var evaluationHostedArchiveRecordKeys = []string{
	"format", "version", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "registrationRequestDigest",
	"authorityDigest", "cleanupRequestDigest", "cleanupReceiptDigest", "registrationResult",
	"resourceSetCommitment", "cleanupRequest", "storedCleanupClaimAuthorityReceipt",
	"storedPriorActiveState", "readLeaseLedgerRoot", "storedRunTerminalFence", "overdueReceipt",
	"cleanupReceipt", "recordDigest",
}

var evaluationHostedRegistrationIntentKeys = []string{
	"format", "version", "providerConfigurationId", "providerConfigurationDigest", "protocolFamily",
	"modelId", "modelLineageDigest", "adapterDigest", "capabilityProfileId", "capabilityProfileDigest",
	"probeProgramDigest", "publicResourceDescriptorDigest", "maximumResourceLifetimeMs",
	"minimumQueryReadLeaseMs", "requiredOperations", "intentDigest",
}

var evaluationHostedBudgetAuthorityKeys = []string{
	"format", "version", "namespaceId", "planDigest", "reservePolicyDigest", "budgetDigest",
	"reservationId", "ledgerRevision", "demandDigest", "demandBytesDigest", "reservedAt", "authorityDigest",
}

var evaluationHostedNetworkAuthorityKeys = []string{
	"format", "version", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "providerConfigurationId", "providerConfigurationDigest",
	"protocolFamily", "purpose", "endpointClass", "allowedOperations", "authorityDigest",
}

var evaluationHostedRegistrationRequestKeys = []string{
	"format", "version", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "registrationIntent", "registrationIntentDigest",
	"providerConfigurationId", "providerConfigurationDigest", "protocolFamily", "modelId",
	"modelLineageDigest", "adapterDigest", "capabilityProfileId", "capabilityProfileDigest",
	"probeProgramDigest", "publicResourceDescriptorDigest", "budgetReservationAuthority",
	"budgetReservationAuthorityDigest", "networkPolicyAuthority", "networkPolicyAuthorityDigest",
	"minimumExpiresAt", "requestDigest",
}

var evaluationHostedDeletionProjectionKeys = []string{
	"format", "version", "registrationRequestDigest", "runtimeResourceSetId", "protocolFamily",
	"providerResourceKind", "providerResourceId", "auxiliaryResourceIds", "projectionDigest",
}

var evaluationHostedDeletionReceiptKeys = []string{
	"format", "version", "registrationRequestDigest", "planDigest", "runConfigArtifactBindingDigest",
	"runtimeResourceSetId", "resourceManifestDigest", "providerResourceKind", "providerResourceId",
	"deletionRouteBinding", "deletionRequestProjection", "deletionRequestProjectionDigest",
	"registeredAt", "expiresAt", "deletionAuthorityReceiptDigest",
}

var evaluationHostedAuthorityKeys = []string{
	"format", "version", "registrationRequestDigest", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "registrationIntentDigest",
	"providerConfigurationId", "providerConfigurationDigest", "protocolFamily", "modelId",
	"modelLineageDigest", "adapterDigest", "capabilityProfileId", "capabilityProfileDigest",
	"probeProgramDigest", "publicResourceDescriptorDigest", "budgetReservationAuthority",
	"budgetReservationAuthorityDigest", "networkPolicyAuthority", "networkPolicyAuthorityDigest",
	"providerResourceKind", "providerResourceId", "auxiliaryResourceIds", "resourceManifestDigest",
	"contentUploadReceiptDigest", "creationDispatchIntentSetDigest", "creationTransportReceiptSetDigest",
	"creationResultSpoolReceiptSetDigest", "deletionAuthorityReceiptDigest", "registeredAt", "expiresAt",
	"authorityDigest",
}

var evaluationHostedRegistrationResultKeys = []string{
	"format", "version", "registrationRequestDigest", "registrationRequest", "authority", "authorityDigest",
	"deletionAuthorityReceipt", "deletionAuthorityReceiptDigest", "resultDigest",
}

var evaluationHostedCommitmentKeys = []string{
	"format", "version", "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
	"runtimeResourceSetId", "authoritySetDigest", "authorityBindings", "commitmentDigest",
}

var evaluationHostedAuthorityBindingKeys = []string{
	"authorityDigest", "registrationIntentDigest", "protocolFamily", "capabilityProfileId",
	"providerConfigurationDigest", "budgetReservationId", "budgetReservationAuthorityDigest",
	"networkPolicyAuthorityDigest",
}

var evaluationHostedActiveStateKeys = []string{
	"format", "version", "authorityDigest", "resourceSetCommitmentDigest", "activeOwnerInstanceId",
	"claimGeneration", "lifecycle", "readLeaseNotAfter", "updatedAt", "stateDigest",
}

var evaluationHostedReadLedgerRootKeys = []string{
	"format", "version", "ledgerAuthorityIssuerId", "ledgerAuthorityImplementationDigest", "ledgerRevision",
	"planDigest", "runConfigArtifactBindingDigest", "runtimeResourceSetId", "authorityDigest",
	"resourceSetCommitmentDigest", "readLeaseCount", "readLeaseIdSetDigest", "readRequestDigestSetDigest",
	"readReceiptDigestSetDigest", "activeStateDigestSetDigest", "minimumClaimGeneration",
	"maximumClaimGeneration", "firstCheckedAt", "lastExpiresAt", "sealedAt", "rootDigest",
}

var evaluationHostedCleanupClaimKeys = []string{
	"format", "version", "claimId", "claimAuthorityIssuerId", "claimAuthorityImplementationDigest",
	"claimLedgerRevision", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "authorityDigest", "resourceSetCommitmentDigest",
	"expectedActiveStateDigest", "cleanupOwnerInstanceId", "claimGeneration", "claimedStateDigest",
	"claimedAt", "claimExpiresAt", "receiptDigest",
}

var evaluationHostedTerminalFenceKeys = []string{
	"format", "version", "fenceId", "fenceAuthorityIssuerId", "fenceAuthorityImplementationDigest",
	"fenceLedgerRevision", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "expectedShardCount", "terminalShardCount",
	"terminalShardIdSetDigest", "terminalAttemptIdSetDigest", "terminalShardLeaseGenerationSetDigest",
	"terminalShardResultSetDigest", "terminalOutcome", "allShardsTerminalAt", "sealedAt", "fenceDigest",
}

var evaluationHostedOverdueReceiptKeys = []string{
	"format", "version", "planDigest", "runConfigArtifactBindingDigest", "runtimeResourceSetId",
	"authorityDigest", "providerResourceKind", "providerResourceId", "resourceExpiresAt",
	"detectedAt", "disposition", "receiptDigest",
}

var evaluationHostedCleanupRequestKeys = []string{
	"format", "version", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
	"runConfigArtifactBindingDigest", "runtimeResourceSetId", "authorityDigest", "resourceSetCommitmentDigest",
	"readLeaseLedgerRootDigest", "cleanupClaimAuthorityReceiptDigest", "deletionAuthorityReceiptDigest",
	"cleanupOwnerInstanceId", "claimGeneration", "priorActiveState", "priorActiveStateDigest",
	"claimedLifecycle", "runTerminalFence", "runTerminalFenceDigest", "cleanupReason", "overdueReceiptDigest",
	"requestedAt", "deletionNotBefore", "requestDigest",
}

var evaluationHostedCleanupResultKeys = []string{
	"format", "version", "resourceId", "resourceRole", "outcome", "cleanupClaimAuthorityReceiptDigest",
	"dispatchIntentDigest", "transportReceiptDigest", "resultSpoolReceiptDigest",
	"resultSpoolDispositionReceiptDigest", "dispatchCreatedAt", "completedAt", "resultDigest",
}

var evaluationHostedCleanupReceiptKeys = []string{
	"format", "version", "cleanupRequestDigest", "planDigest", "runConfigArtifactBindingDigest",
	"runtimeResourceSetId", "authorityDigest", "resourceSetCommitmentDigest", "readLeaseLedgerRootDigest",
	"cleanupClaimAuthorityReceiptDigest", "deletionAuthorityReceiptDigest", "protocolFamily",
	"providerResourceKind", "providerResourceId", "auxiliaryResourceIds", "runTerminalFenceDigest",
	"cleanupReason", "overdueReceiptDigest", "cleanupOwnerInstanceId", "claimGeneration",
	"priorActiveStateDigest", "deletionNotBefore", "resourceResults", "resourceResultSetDigest",
	"residualProviderResourceIds", "terminalLifecycle", "terminalStateDigest", "completedAt",
	"cleanupReceiptDigest",
}
