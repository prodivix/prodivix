import type { CanonicalDigest, Instant } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { AgentBudgetDemand } from '../usage/agentBudgetLedger';
import { createAgentUsageVector } from '../usage/agentUsage';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS,
  createAgentHostedRetrievalRuntimeResourceAuthority,
  createAgentHostedRetrievalRuntimeResourceAuthoritySet,
  createAgentHostedRetrievalRuntimeResourceActiveState,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily,
  createAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  createAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  createAgentHostedRetrievalRuntimeResourceCleanupReceipt,
  createAgentHostedRetrievalRuntimeResourceCleanupRequest,
  createAgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt,
  createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection,
  createAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  createAgentHostedRetrievalRuntimeResourceReadReceipt,
  createAgentHostedRetrievalRuntimeResourceReadRequest,
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationResult,
  createAgentHostedRetrievalRuntimeResourceSetCommitment,
  deriveAgentHostedRetrievalRuntimeResourceRunTerminalFence,
  deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord,
  isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  isAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  type AgentHostedRetrievalRuntimeResourceAuthoritySet,
  type AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupRequest,
  type AgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  type AgentHostedRetrievalRuntimeResourceProfileId,
  type AgentHostedRetrievalRuntimeResourceProtocolFamily,
  type AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  type AgentHostedRetrievalRuntimeResourceReadReceipt,
  type AgentHostedRetrievalRuntimeResourceReadRequest,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
  type AgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry,
  type AgentHostedRetrievalRuntimeResourceTerminalShardRecord,
  type AgentHostedRetrievalRuntimeResourceActiveState,
} from '../providers/agentHostedRetrievalRuntimeResource';

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({ fixture: 'hosted-runtime-resource', label });

const profiles = Object.freeze([
  'g4-provider-hosted-retrieval-core',
  'g4-provider-hosted-retrieval-document',
] as const satisfies readonly AgentHostedRetrievalRuntimeResourceProfileId[]);

const protocols = Object.freeze([
  'gemini-interactions',
  'openai-responses',
] as const satisfies readonly AgentHostedRetrievalRuntimeResourceProtocolFamily[]);

export type AgentHostedRetrievalRuntimeResourceExact4Fixture = Readonly<{
  registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[];
  authoritySet: AgentHostedRetrievalRuntimeResourceAuthoritySet;
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
}>;

export type AgentHostedRetrievalRuntimeResourceExact4FixtureInput = Readonly<{
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  registeredAt: Instant;
  expiresAt: Instant;
  maximumIdentityLength?: boolean;
  auxiliaryResourceCount?: number;
  registrationIntents?: readonly AgentHostedRetrievalRuntimeResourceRegistrationIntent[];
  lifecycleBudgetDemands?: readonly AgentBudgetDemand[];
  lifecycleBudgetReservationAuthorities?: readonly AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority[];
  lifecycleBudgetDigest?: CanonicalDigest;
  lifecycleBudgetReservePolicyDigest?: CanonicalDigest;
  lifecycleAuthorityCommitments?: readonly Readonly<{
    contentUploadReceiptDigest: CanonicalDigest;
    creationDispatchIntentSetDigest: CanonicalDigest;
    creationTransportReceiptSetDigest: CanonicalDigest;
    creationResultSpoolReceiptSetDigest: CanonicalDigest;
  }>[];
}>;

const createFixtureLifecycleBudgetDemand = (
  uploadBytes: number
): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector(
      Object.freeze([
        Object.freeze({
          unit: 'hosted-tool-call' as const,
          logicalAmount: '3',
          billableAmount: '3',
          confidence: 'estimated' as const,
        }),
        Object.freeze({
          unit: 'provider-upload-byte' as const,
          logicalAmount: String(uploadBytes),
          billableAmount: String(uploadBytes),
          confidence: 'measured' as const,
        }),
        Object.freeze({
          unit: 'provider-storage-byte-second' as const,
          logicalAmount: String(uploadBytes * 691_200),
          billableAmount: String(uploadBytes * 691_200),
          confidence: 'estimated' as const,
        }),
      ])
    ),
    cost: Object.freeze([]),
    modelInvocations: 0,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 0,
  });

export const createAgentHostedRetrievalRuntimeResourceExact4Fixture = (
  input: AgentHostedRetrievalRuntimeResourceExact4FixtureInput
): AgentHostedRetrievalRuntimeResourceExact4Fixture => {
  const identity = (label: string): string =>
    input.maximumIdentityLength
      ? `${label}.${'x'.repeat(256 - label.length - 1)}`
      : label;
  const registrationIntentByKey = new Map(
    (input.registrationIntents ?? []).map((intent) => [
      `${intent.protocolFamily}\u0000${intent.capabilityProfileId}`,
      intent,
    ])
  );
  if (
    input.registrationIntents !== undefined &&
    (input.registrationIntents.length !== 4 ||
      registrationIntentByKey.size !== 4 ||
      input.registrationIntents.some(
        (intent) =>
          !isAgentHostedRetrievalRuntimeResourceRegistrationIntent(intent)
      ))
  ) {
    throw new TypeError(
      'Hosted retrieval runtime fixture registration intents are invalid.'
    );
  }
  if (
    input.lifecycleBudgetDemands !== undefined &&
    input.lifecycleBudgetDemands.length !== 4
  ) {
    throw new TypeError(
      'Hosted retrieval runtime fixture lifecycle budget demands are invalid.'
    );
  }
  if (
    input.lifecycleBudgetReservationAuthorities !== undefined &&
    (input.lifecycleBudgetReservationAuthorities.length !== 4 ||
      input.lifecycleBudgetReservationAuthorities.some(
        (authority) =>
          !isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(
            authority
          )
      ))
  ) {
    throw new TypeError(
      'Hosted retrieval runtime fixture budget authorities are invalid.'
    );
  }
  if (
    input.lifecycleAuthorityCommitments !== undefined &&
    input.lifecycleAuthorityCommitments.length !== 4
  ) {
    throw new TypeError(
      'Hosted retrieval runtime fixture lifecycle commitments are invalid.'
    );
  }
  const registrationResults = Object.freeze(
    protocols.flatMap((protocolFamily, protocolIndex) =>
      profiles.map((capabilityProfileId, profileIndex) => {
        const authorityOrdinal = protocolIndex * profiles.length + profileIndex;
        const key = `${protocolFamily}.${capabilityProfileId}`;
        const suppliedIntent = registrationIntentByKey.get(
          `${protocolFamily}\u0000${capabilityProfileId}`
        );
        const providerConfigurationId =
          suppliedIntent?.providerConfigurationId ??
          identity(`provider.${protocolFamily}`);
        const providerConfigurationDigest =
          suppliedIntent?.providerConfigurationDigest ??
          digest(`provider-configuration.${protocolFamily}`);
        const modelId =
          suppliedIntent?.modelId ?? identity(`model.${protocolFamily}`);
        const modelLineageDigest =
          suppliedIntent?.modelLineageDigest ??
          digest(`model-lineage.${protocolFamily}`);
        const adapterDigest =
          suppliedIntent?.adapterDigest ?? digest(`adapter.${protocolFamily}`);
        const capabilityProfileDigest =
          suppliedIntent?.capabilityProfileDigest ??
          digest(`profile.${capabilityProfileId}`);
        const probeProgramDigest =
          suppliedIntent?.probeProgramDigest ?? digest(`probe-program.${key}`);
        const publicResourceDescriptorDigest =
          suppliedIntent?.publicResourceDescriptorDigest ??
          digest(`public-resource-descriptor.${key}`);
        const registrationIntent =
          suppliedIntent ??
          createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
            providerConfigurationId,
            providerConfigurationDigest,
            protocolFamily,
            modelId,
            modelLineageDigest,
            adapterDigest,
            capabilityProfileId,
            capabilityProfileDigest,
            probeProgramDigest,
            publicResourceDescriptorDigest,
          });
        const lifecycleBudgetDemand =
          input.lifecycleBudgetDemands?.[authorityOrdinal] ??
          createFixtureLifecycleBudgetDemand(authorityOrdinal + 1);
        const lifecycleBudgetDemandDigest = digestAgentCanonicalValue(
          lifecycleBudgetDemand
        );
        const suppliedBudgetReservationAuthority =
          input.lifecycleBudgetReservationAuthorities?.[authorityOrdinal];
        const budgetReservationAuthority =
          suppliedBudgetReservationAuthority ??
          createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority({
            namespaceId: input.namespaceId,
            planDigest: input.planDigest,
            reservePolicyDigest:
              input.lifecycleBudgetReservePolicyDigest ??
              digest('budget-reserve-policy'),
            budgetDigest: input.lifecycleBudgetDigest ?? digest('budget'),
            reservationId: identity(`budget.${key}`),
            ledgerRevision: 7 + authorityOrdinal,
            demandDigest: lifecycleBudgetDemandDigest,
            demandBytesDigest: lifecycleBudgetDemandDigest,
            reservedAt: input.registeredAt,
          });
        if (
          budgetReservationAuthority.namespaceId !== input.namespaceId ||
          budgetReservationAuthority.planDigest !== input.planDigest ||
          budgetReservationAuthority.demandDigest !==
            lifecycleBudgetDemandDigest ||
          budgetReservationAuthority.demandBytesDigest !==
            lifecycleBudgetDemandDigest ||
          (input.lifecycleBudgetDigest !== undefined &&
            budgetReservationAuthority.budgetDigest !==
              input.lifecycleBudgetDigest) ||
          (input.lifecycleBudgetReservePolicyDigest !== undefined &&
            budgetReservationAuthority.reservePolicyDigest !==
              input.lifecycleBudgetReservePolicyDigest)
        ) {
          throw new TypeError(
            'Hosted retrieval runtime fixture budget authority drifted.'
          );
        }
        const networkPolicyAuthority =
          createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority({
            namespaceId: input.namespaceId,
            repositoryCommit: input.repositoryCommit,
            planDigest: input.planDigest,
            frozenRunDigest: input.frozenRunDigest,
            runConfigArtifactBindingDigest:
              input.runConfigArtifactBindingDigest,
            providerConfigurationId,
            providerConfigurationDigest,
            protocolFamily,
          });
        const registrationRequest =
          createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
            namespaceId: input.namespaceId,
            repositoryCommit: input.repositoryCommit,
            planDigest: input.planDigest,
            frozenRunDigest: input.frozenRunDigest,
            runConfigArtifactBindingDigest:
              input.runConfigArtifactBindingDigest,
            runtimeResourceSetId: input.runtimeResourceSetId,
            registrationIntent,
            registrationIntentDigest: registrationIntent.intentDigest,
            providerConfigurationId,
            providerConfigurationDigest,
            protocolFamily,
            modelId,
            modelLineageDigest,
            adapterDigest,
            capabilityProfileId,
            capabilityProfileDigest,
            probeProgramDigest,
            publicResourceDescriptorDigest,
            budgetReservationAuthority,
            budgetReservationAuthorityDigest:
              budgetReservationAuthority.authorityDigest,
            networkPolicyAuthority,
            networkPolicyAuthorityDigest:
              networkPolicyAuthority.authorityDigest,
            minimumExpiresAt: input.expiresAt,
          });
        const providerResourceId = identity(`resource.${key}`);
        const auxiliaryResourceCount =
          input.auxiliaryResourceCount ??
          (protocolFamily === 'openai-responses' ? 1 : 0);
        if (
          !Number.isSafeInteger(auxiliaryResourceCount) ||
          auxiliaryResourceCount < 0 ||
          auxiliaryResourceCount >
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS
        ) {
          throw new TypeError(
            'Hosted retrieval runtime fixture auxiliary resource count is invalid.'
          );
        }
        const auxiliaryResourceIds = Object.freeze(
          Array.from({ length: auxiliaryResourceCount }, (_, ordinal) =>
            identity(`auxiliary.${ordinal}.${key}`)
          ).sort(compareUnicodeCodePoints)
        );
        const resourceManifestDigest = digest(`resource-manifest.${key}`);
        const deletionRequestProjection =
          createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection({
            registrationRequestDigest: registrationRequest.requestDigest,
            runtimeResourceSetId: input.runtimeResourceSetId,
            protocolFamily,
            providerResourceId,
            auxiliaryResourceIds,
          });
        const deletionAuthorityReceipt =
          createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt({
            registrationRequest,
            resourceManifestDigest,
            deletionRequestProjection,
            registeredAt: input.registeredAt,
            expiresAt: input.expiresAt,
          });
        const lifecycleCommitments =
          input.lifecycleAuthorityCommitments?.[authorityOrdinal];
        const authority = createAgentHostedRetrievalRuntimeResourceAuthority(
          registrationRequest,
          {
            providerResourceId,
            auxiliaryResourceIds,
            resourceManifestDigest,
            contentUploadReceiptDigest:
              lifecycleCommitments?.contentUploadReceiptDigest ??
              digest(`content-upload.${key}`),
            creationDispatchIntentSetDigest:
              lifecycleCommitments?.creationDispatchIntentSetDigest ??
              digest(`creation-dispatch-intents.${key}`),
            creationTransportReceiptSetDigest:
              lifecycleCommitments?.creationTransportReceiptSetDigest ??
              digest(`creation-transport-receipts.${key}`),
            creationResultSpoolReceiptSetDigest:
              lifecycleCommitments?.creationResultSpoolReceiptSetDigest ??
              digest(`creation-result-spools.${key}`),
            deletionAuthorityReceipt,
            registeredAt: input.registeredAt,
            expiresAt: input.expiresAt,
          }
        );
        return createAgentHostedRetrievalRuntimeResourceRegistrationResult(
          registrationRequest,
          authority,
          deletionAuthorityReceipt
        );
      })
    )
  );
  const authoritySet = createAgentHostedRetrievalRuntimeResourceAuthoritySet({
    planDigest: input.planDigest,
    frozenRunDigest: input.frozenRunDigest,
    runConfigArtifactBindingDigest: input.runConfigArtifactBindingDigest,
    runtimeResourceSetId: input.runtimeResourceSetId,
    authorities: registrationResults.map(({ authority }) => authority),
  });
  return Object.freeze({
    registrationResults,
    authoritySet,
    resourceSetCommitment:
      createAgentHostedRetrievalRuntimeResourceSetCommitment(authoritySet),
  });
};

export type AgentHostedRetrievalRuntimeResourceRunTerminalFixture = Readonly<{
  expectedShardIds: readonly string[];
  terminalShardLedgerEntries: readonly AgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry[];
  terminalShardRecords: readonly AgentHostedRetrievalRuntimeResourceTerminalShardRecord[];
  fence: AgentHostedRetrievalRuntimeResourceRunTerminalFence;
}>;

export type AgentHostedRetrievalRuntimeResourceLifecycleFixture = Readonly<{
  readRequest: AgentHostedRetrievalRuntimeResourceReadRequest;
  activeState: AgentHostedRetrievalRuntimeResourceActiveState;
  readReceipt: AgentHostedRetrievalRuntimeResourceReadReceipt;
  readLeaseLedgerRoot: AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot;
  cleanupClaimAuthorityReceipt: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt;
  cleanupRequest: AgentHostedRetrievalRuntimeResourceCleanupRequest;
  resourceResults: readonly AgentHostedRetrievalRuntimeResourceCleanupResourceResult[];
  cleanupReceipt: AgentHostedRetrievalRuntimeResourceCleanupReceipt;
  cleanupArchiveRecord: AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord;
}>;

export type AgentHostedRetrievalRuntimeResourceLifecycleTiming = Readonly<{
  readCheckedAt: Instant;
  readExpiresAt: Instant;
  cleanupClaimedAt: Instant;
  cleanupClaimExpiresAt: Instant;
  cleanupDispatchedAt: Instant;
  cleanupCompletedAt: Instant;
}>;

export type AgentHostedRetrievalRuntimeResourceExact4LifecycleFixture =
  AgentHostedRetrievalRuntimeResourceExact4Fixture &
    Readonly<{
      runTerminal: AgentHostedRetrievalRuntimeResourceRunTerminalFixture;
      lifecycles: readonly AgentHostedRetrievalRuntimeResourceLifecycleFixture[];
      cleanupArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[];
      cleanupArchiveFamily: readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[];
    }>;

const fixtureIdentity = (label: string, maximumLength: boolean): string =>
  maximumLength ? `${label}.${'x'.repeat(256 - label.length - 1)}` : label;

export const createAgentHostedRetrievalRuntimeResourceRunTerminalFixture = (
  input: Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    expectedShardIds: readonly string[];
    terminalShardLedgerEntries: readonly AgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry[];
    sealedAt: Instant;
    maximumIdentityLength?: boolean;
  }>
): AgentHostedRetrievalRuntimeResourceRunTerminalFixture => {
  const terminalShardRecords = Object.freeze(
    input.terminalShardLedgerEntries.map((entry) =>
      deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord(entry)
    )
  );
  const allShardsTerminalAt = terminalShardRecords
    .map(({ terminalAt }) => terminalAt)
    .sort(compareUnicodeCodePoints)
    .at(-1);
  if (!allShardsTerminalAt) {
    throw new TypeError(
      'Hosted retrieval runtime lifecycle fixture terminal ledger is empty.'
    );
  }
  const maximumLength = input.maximumIdentityLength === true;
  return Object.freeze({
    expectedShardIds: input.expectedShardIds,
    terminalShardLedgerEntries: input.terminalShardLedgerEntries,
    terminalShardRecords,
    fence: deriveAgentHostedRetrievalRuntimeResourceRunTerminalFence({
      fenceId: fixtureIdentity('terminal-fence.g4', maximumLength),
      fenceAuthorityIssuerId: fixtureIdentity(
        'authority.hosted-terminal-ledger',
        maximumLength
      ),
      fenceAuthorityImplementationDigest: digest(
        'terminal-fence-authority-implementation'
      ),
      fenceLedgerRevision: 19,
      namespaceId: input.namespaceId,
      repositoryCommit: input.repositoryCommit,
      planDigest: input.planDigest,
      frozenRunDigest: input.frozenRunDigest,
      runConfigArtifactBindingDigest: input.runConfigArtifactBindingDigest,
      runtimeResourceSetId: input.runtimeResourceSetId,
      allShardsTerminalAt,
      sealedAt: input.sealedAt,
      expectedShardIds: input.expectedShardIds,
      terminalShardRecords,
    }),
  });
};

export const createAgentHostedRetrievalRuntimeResourceLifecycleFixture = (
  input: Readonly<{
    registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult;
    resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
    runTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence;
    timing: AgentHostedRetrievalRuntimeResourceLifecycleTiming;
    resourceResults?: readonly AgentHostedRetrievalRuntimeResourceCleanupResourceResult[];
    maximumIdentityLength?: boolean;
  }>
): AgentHostedRetrievalRuntimeResourceLifecycleFixture => {
  const {
    registrationResult,
    resourceSetCommitment,
    runTerminalFence,
    timing,
  } = input;
  const authority = registrationResult.authority;
  const registrationRequest = registrationResult.registrationRequest;
  const key = `${authority.protocolFamily}.${authority.capabilityProfileId}`;
  const maximumLength = input.maximumIdentityLength === true;
  const identity = (label: string): string =>
    fixtureIdentity(label, maximumLength);
  const readRequest = createAgentHostedRetrievalRuntimeResourceReadRequest({
    namespaceId: registrationRequest.namespaceId,
    repositoryCommit: registrationRequest.repositoryCommit,
    planDigest: authority.planDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authorityDigest: authority.authorityDigest,
    resourceSetCommitmentDigest: resourceSetCommitment.commitmentDigest,
    readerOwnerInstanceId: identity(`reader.${key}`),
    readLeaseId: identity(`read-lease.${key}`),
    minimumExpiresAt: timing.readExpiresAt,
  });
  const activeState = createAgentHostedRetrievalRuntimeResourceActiveState(
    authority,
    resourceSetCommitment,
    {
      activeOwnerInstanceId: readRequest.readerOwnerInstanceId,
      claimGeneration: 1,
      readLeaseNotAfter: timing.readExpiresAt,
      updatedAt: timing.readCheckedAt,
    }
  );
  const readReceipt = createAgentHostedRetrievalRuntimeResourceReadReceipt(
    readRequest,
    authority,
    resourceSetCommitment,
    {
      activeState,
      checkedAt: timing.readCheckedAt,
      expiresAt: timing.readExpiresAt,
    }
  );
  const readLeaseLedgerRoot =
    createAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot(
      authority,
      resourceSetCommitment,
      {
        ledgerAuthorityIssuerId: identity('authority.hosted-read-ledger'),
        ledgerAuthorityImplementationDigest: digest(
          'read-ledger-authority-implementation'
        ),
        ledgerRevision: 31,
        sealedAt: timing.readExpiresAt,
      },
      Object.freeze([{ request: readRequest, receipt: readReceipt }])
    );
  const cleanupClaimAuthorityReceipt =
    createAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
      registrationResult,
      resourceSetCommitment,
      activeState,
      {
        claimId: identity(`cleanup-claim.${key}`),
        claimAuthorityIssuerId: identity('authority.hosted-cleanup-claims'),
        claimAuthorityImplementationDigest: digest(
          'cleanup-claim-authority-implementation'
        ),
        claimLedgerRevision: 41,
        cleanupOwnerInstanceId: identity(`cleanup-owner.${key}`),
        claimGeneration: 2,
        claimedAt: timing.cleanupClaimedAt,
        claimExpiresAt: timing.cleanupClaimExpiresAt,
      }
    );
  const cleanupRequest =
    createAgentHostedRetrievalRuntimeResourceCleanupRequest({
      namespaceId: registrationRequest.namespaceId,
      repositoryCommit: registrationRequest.repositoryCommit,
      planDigest: authority.planDigest,
      frozenRunDigest: authority.frozenRunDigest,
      runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
      runtimeResourceSetId: authority.runtimeResourceSetId,
      authorityDigest: authority.authorityDigest,
      resourceSetCommitmentDigest: resourceSetCommitment.commitmentDigest,
      readLeaseLedgerRootDigest: readLeaseLedgerRoot.rootDigest,
      cleanupClaimAuthorityReceiptDigest:
        cleanupClaimAuthorityReceipt.receiptDigest,
      deletionAuthorityReceiptDigest:
        registrationResult.deletionAuthorityReceiptDigest,
      cleanupOwnerInstanceId:
        cleanupClaimAuthorityReceipt.cleanupOwnerInstanceId,
      claimGeneration: cleanupClaimAuthorityReceipt.claimGeneration,
      priorActiveState: activeState,
      priorActiveStateDigest: activeState.stateDigest,
      claimedLifecycle: 'cleanup-in-progress',
      runTerminalFence,
      runTerminalFenceDigest: runTerminalFence.fenceDigest,
      cleanupReason: 'matrix-terminal',
      overdueReceiptDigest: null,
      requestedAt: timing.cleanupClaimedAt,
      deletionNotBefore: timing.cleanupClaimedAt,
    });
  const resourceResults =
    input.resourceResults ??
    Object.freeze(
      [...authority.auxiliaryResourceIds, authority.providerResourceId].map(
        (resourceId) =>
          createAgentHostedRetrievalRuntimeResourceCleanupResourceResult({
            resourceId,
            resourceRole:
              resourceId === authority.providerResourceId
                ? 'primary'
                : 'auxiliary',
            outcome: 'deleted',
            cleanupClaimAuthorityReceiptDigest:
              cleanupClaimAuthorityReceipt.receiptDigest,
            dispatchIntentDigest: digest(`delete-dispatch.${resourceId}`),
            transportReceiptDigest: digest(`delete-transport.${resourceId}`),
            resultSpoolReceiptDigest: digest(`delete-spool.${resourceId}`),
            resultSpoolDispositionReceiptDigest: digest(
              `delete-spool-disposition.${resourceId}`
            ),
            dispatchCreatedAt: timing.cleanupDispatchedAt,
            completedAt: timing.cleanupCompletedAt,
          })
      )
    );
  const cleanupReceipt =
    createAgentHostedRetrievalRuntimeResourceCleanupReceipt(
      cleanupRequest,
      registrationResult,
      resourceSetCommitment,
      cleanupClaimAuthorityReceipt,
      activeState,
      readLeaseLedgerRoot,
      runTerminalFence,
      null,
      resourceResults
    );
  const cleanupArchiveRecord =
    createAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord({
      repositoryCommit: registrationRequest.repositoryCommit,
      registrationResult,
      resourceSetCommitment,
      cleanupRequest,
      storedCleanupClaimAuthorityReceipt: cleanupClaimAuthorityReceipt,
      storedPriorActiveState: activeState,
      readLeaseLedgerRoot,
      storedRunTerminalFence: runTerminalFence,
      overdueReceipt: null,
      cleanupReceipt,
    });
  return Object.freeze({
    readRequest,
    activeState,
    readReceipt,
    readLeaseLedgerRoot,
    cleanupClaimAuthorityReceipt,
    cleanupRequest,
    resourceResults,
    cleanupReceipt,
    cleanupArchiveRecord,
  });
};

/** Reusable exact-four lifecycle fixture for external archive/verifier tests. */
export const createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture = (
  input: AgentHostedRetrievalRuntimeResourceExact4FixtureInput &
    Readonly<{
      expectedShardIds: readonly string[];
      terminalShardLedgerEntries: readonly AgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry[];
      terminalFenceSealedAt: Instant;
      timing: AgentHostedRetrievalRuntimeResourceLifecycleTiming;
    }>
): AgentHostedRetrievalRuntimeResourceExact4LifecycleFixture => {
  const registrationFixture =
    createAgentHostedRetrievalRuntimeResourceExact4Fixture(input);
  const runTerminal =
    createAgentHostedRetrievalRuntimeResourceRunTerminalFixture({
      namespaceId: input.namespaceId,
      repositoryCommit: input.repositoryCommit,
      planDigest: input.planDigest,
      frozenRunDigest: input.frozenRunDigest,
      runConfigArtifactBindingDigest: input.runConfigArtifactBindingDigest,
      runtimeResourceSetId: input.runtimeResourceSetId,
      expectedShardIds: input.expectedShardIds,
      terminalShardLedgerEntries: input.terminalShardLedgerEntries,
      sealedAt: input.terminalFenceSealedAt,
      maximumIdentityLength: input.maximumIdentityLength,
    });
  const lifecycles = Object.freeze(
    registrationFixture.registrationResults.map((registrationResult) =>
      createAgentHostedRetrievalRuntimeResourceLifecycleFixture({
        registrationResult,
        resourceSetCommitment: registrationFixture.resourceSetCommitment,
        runTerminalFence: runTerminal.fence,
        timing: input.timing,
        maximumIdentityLength: input.maximumIdentityLength,
      })
    )
  );
  const cleanupArchiveRecords = Object.freeze(
    lifecycles.map(({ cleanupArchiveRecord }) => cleanupArchiveRecord)
  );
  const cleanupArchiveFamily =
    createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(
      cleanupArchiveRecords
    );
  return Object.freeze({
    ...registrationFixture,
    runTerminal,
    lifecycles,
    cleanupArchiveRecords,
    cleanupArchiveFamily,
  });
};
