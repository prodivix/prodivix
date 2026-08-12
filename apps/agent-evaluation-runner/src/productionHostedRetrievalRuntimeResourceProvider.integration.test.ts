import {
  createAgentCapabilityProbeProgram,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand,
  createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptFromStoreRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleSealReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate,
  createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage,
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
  digestAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand,
  resolveAgentCapabilityProbePublicResource,
  type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleStageRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
  type AgentJsonValue,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import type { AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient } from './hostedRetrievalRuntimeResourceLifecycleClient';
import type { AgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureSource } from './productionHostedRetrievalRuntimeResourceLifecycleBudget';
import {
  createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher,
  type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver,
} from './productionHostedRetrievalRuntimeResourceLifecycleSpoolCipher';
import { createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider } from './productionHostedRetrievalRuntimeResourceProvider';
import {
  projectAgentEvaluationProviderResourceRequest,
  type AgentEvaluationProviderResourceRequest,
  type AgentEvaluationProviderResourceResponse,
  type AgentEvaluationProviderResourceTransportSession,
  type AgentEvaluationProviderResourceTransport,
} from './productionProviderResourceTransport';
import { createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile } from './runConfig';
import type { AgentProviderSecretUseRequest } from './secretResolver';

const STARTED_AT_MS = Date.parse('2026-08-12T02:00:00.000Z');
const REPOSITORY_COMMIT = 'a'.repeat(40);
const NAMESPACE_ID = 'namespace.hosted-lifecycle-progressive';
const RUNTIME_RESOURCE_SET_ID = 'runtime-resource-set.progressive';
const textEncoder = new TextEncoder();

type ProtocolFamily = 'gemini-interactions' | 'openai-responses';

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({
    test: 'production-hosted-lifecycle-provider-progressive',
    label,
  });

const createClock = () => {
  let offset = 0;
  return () => new Date(STARTED_AT_MS + offset++ * 1_000);
};

const registrationFixture = (protocolFamily: ProtocolFamily) => {
  const planDigest = digest(`${protocolFamily}.plan`);
  const frozenRunDigest = digest(`${protocolFamily}.frozen-run`);
  const runConfigArtifactBindingDigest = digest(`${protocolFamily}.run-config`);
  const providerConfigurationId = `provider.${protocolFamily}.progressive`;
  const providerConfigurationDigest = digest(
    `${protocolFamily}.provider-configuration`
  );
  const capabilityProfileId = 'g4-provider-hosted-retrieval-core' as const;
  const capabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  const program = createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest,
  });
  const material = resolveAgentCapabilityProbePublicResource(program);
  if (material === null) throw new TypeError('missing hosted material');
  const registrationIntent =
    createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
      providerConfigurationId,
      providerConfigurationDigest,
      protocolFamily,
      modelId: `model.${protocolFamily}.progressive`,
      modelLineageDigest: digest(`${protocolFamily}.model-lineage`),
      adapterDigest: digest(`${protocolFamily}.adapter`),
      capabilityProfileId,
      capabilityProfileDigest,
      probeProgramDigest: program.programDigest,
      publicResourceDescriptorDigest: material.descriptor.descriptorDigest,
    });
  const demand = createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
    registrationIntent,
    material
  );
  const demandDigest =
    digestAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(demand);
  const budgetReservationAuthority =
    createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority({
      namespaceId: NAMESPACE_ID,
      planDigest,
      reservePolicyDigest: digest(`${protocolFamily}.reserve-policy`),
      budgetDigest: digest(`${protocolFamily}.budget`),
      reservationId: `budget-reservation.${protocolFamily}.progressive`,
      ledgerRevision: 1,
      demandDigest,
      demandBytesDigest: demandDigest,
      reservedAt: new Date(STARTED_AT_MS).toISOString() as Instant,
    });
  const networkPolicyAuthority =
    createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority({
      namespaceId: NAMESPACE_ID,
      repositoryCommit: REPOSITORY_COMMIT,
      planDigest,
      frozenRunDigest,
      runConfigArtifactBindingDigest,
      providerConfigurationId,
      providerConfigurationDigest,
      protocolFamily,
    });
  const request = createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
    namespaceId: NAMESPACE_ID,
    repositoryCommit: REPOSITORY_COMMIT,
    planDigest,
    frozenRunDigest,
    runConfigArtifactBindingDigest,
    runtimeResourceSetId: RUNTIME_RESOURCE_SET_ID,
    registrationIntent,
    registrationIntentDigest: registrationIntent.intentDigest,
    providerConfigurationId,
    providerConfigurationDigest,
    protocolFamily,
    modelId: registrationIntent.modelId,
    modelLineageDigest: registrationIntent.modelLineageDigest,
    adapterDigest: registrationIntent.adapterDigest,
    capabilityProfileId,
    capabilityProfileDigest,
    probeProgramDigest: program.programDigest,
    publicResourceDescriptorDigest: material.descriptor.descriptorDigest,
    budgetReservationAuthority,
    budgetReservationAuthorityDigest:
      budgetReservationAuthority.authorityDigest,
    networkPolicyAuthority,
    networkPolicyAuthorityDigest: networkPolicyAuthority.authorityDigest,
    minimumExpiresAt: new Date(
      STARTED_AT_MS + 8 * 24 * 60 * 60 * 1_000
    ).toISOString() as Instant,
  });
  return Object.freeze({
    request,
    program,
    material,
    demand,
    contentBytes: textEncoder.encode(material.contentText ?? '').byteLength,
    lifecycleScope: Object.freeze({
      namespaceId: NAMESPACE_ID,
      repositoryCommit: REPOSITORY_COMMIT,
      planDigest,
      frozenRunDigest,
      runConfigArtifactBindingDigest,
      runtimeResourceSetId: RUNTIME_RESOURCE_SET_ID,
    }),
  });
};

const spoolKeys =
  (): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver =>
    Object.freeze({
      async use<T>(
        _request: Readonly<{ useId: string; purpose: 'decrypt' | 'encrypt' }>,
        consumer: (key: Uint8Array) => Promise<T>
      ): Promise<T> {
        const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
        try {
          return await consumer(key);
        } finally {
          key.fill(0);
        }
      },
    });

const responseFor = (
  request: AgentEvaluationProviderResourceRequest,
  body: unknown,
  clock: () => Date,
  input: Readonly<{
    continuationEndpoint?: string;
    status?: number;
  }> = {}
): AgentEvaluationProviderResourceResponse => {
  const requestProjection =
    projectAgentEvaluationProviderResourceRequest(request);
  const status = input.status ?? 200;
  const responseProjection = Object.freeze({ status, body });
  const startedAt = clock().toISOString() as Instant;
  const completedAt = clock().toISOString() as Instant;
  return Object.freeze({
    body,
    status,
    providerRequestId: `request.progressive.${startedAt}`,
    continuationEndpoint: input.continuationEndpoint ?? null,
    requestBytes: requestProjection.requestBytes,
    responseBytes: textEncoder.encode(canonicalJsonText(body)).byteLength,
    requestProjection,
    requestProjectionDigest: digestAgentCanonicalValue(requestProjection),
    responseProjection,
    responseProjectionDigest: digestAgentCanonicalValue(responseProjection),
    responseBodyDigest: digestAgentCanonicalValue(body as AgentJsonValue),
    startedAt,
    completedAt,
  });
};

const providerTransport = (
  protocolFamily: ProtocolFamily,
  contentBytes: number,
  clock: () => Date
) => {
  const mutationKinds: string[] = [];
  const transport = Object.freeze({
    async use<T>(
      _request: AgentProviderSecretUseRequest,
      consumer: (
        session: AgentEvaluationProviderResourceTransportSession
      ) => Promise<T>
    ): Promise<T> {
      return consumer(
        Object.freeze({
          async execute(request: AgentEvaluationProviderResourceRequest) {
            const endpoint = new URL(request.endpoint);
            if (protocolFamily === 'openai-responses') {
              if (endpoint.pathname === '/v1/files') {
                mutationKinds.push('upload-content');
                return responseFor(
                  request,
                  {
                    id: 'file-progressive-openai',
                    object: 'file',
                    purpose: 'user_data',
                    bytes: contentBytes,
                  },
                  clock,
                  { status: 201 }
                );
              }
              mutationKinds.push('create-primary');
              return responseFor(
                request,
                {
                  id: 'vs-progressive-openai',
                  object: 'vector_store',
                },
                clock,
                { status: 201 }
              );
            }
            if (endpoint.pathname === '/v1/fileSearchStores') {
              mutationKinds.push('create-primary');
              const body = JSON.parse(String(request.body)) as {
                displayName: string;
              };
              return responseFor(
                request,
                {
                  name: 'fileSearchStores/store-progressive-gemini',
                  displayName: body.displayName,
                },
                clock
              );
            }
            if (
              endpoint.pathname.startsWith('/upload/v1/') &&
              endpoint.search === ''
            ) {
              mutationKinds.push('upload-content-start');
              return responseFor(request, {}, clock, {
                continuationEndpoint:
                  'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-progressive-gemini:uploadToFileSearchStore?upload_id=progressive&upload_protocol=resumable',
              });
            }
            mutationKinds.push('upload-content-finalize');
            return responseFor(
              request,
              {
                name: 'fileSearchStores/store-progressive-gemini/upload/operations/op-1',
              },
              clock
            );
          },
        })
      );
    },
    async close() {
      const base = Object.freeze({
        format:
          'prodivix.agent-evaluation-provider-resource-transport-close-receipt' as const,
        version: 1 as const,
        status: 'clean' as const,
        acceptedSessionCount: mutationKinds.length,
        completedSessionCount: mutationKinds.length,
        inFlightSessionCount: 0 as const,
        closedAt: clock().toISOString() as Instant,
      });
      return Object.freeze({
        ...base,
        receiptDigest: digestAgentCanonicalValue(base),
      });
    },
  }) satisfies AgentEvaluationProviderResourceTransport;
  return Object.freeze({ transport, mutationKinds });
};

const budgetClosures = () => {
  let projection:
    | AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection
    | undefined;
  const source = Object.freeze({
    async settle({ authority, demand, settledAt }) {
      const settlementBase = Object.freeze({
        actual: demand,
        charged: demand,
        requiresReconciliation: false,
        settledAt,
      });
      projection =
        createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
          authority,
          demand,
          Object.freeze({
            ...settlementBase,
            settlementDigest: digestAgentCanonicalValue(settlementBase),
          })
        );
      return projection;
    },
    async readClosure() {
      if (projection === undefined) throw new TypeError('missing closure');
      return projection;
    },
  }) satisfies AgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureSource;
  return Object.freeze({ source, read: () => projection });
};

const journal = (
  clock: () => Date,
  closure: () =>
    | AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection
    | undefined
) => {
  const latestClaim = new Map<
    CanonicalDigest,
    AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
  >();
  const latestTransport = new Map<CanonicalDigest, CanonicalDigest>();
  let activeStore: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest | null =
    null;
  let activeStoreReceiptDigest: CanonicalDigest | null = null;
  const activeSpools = new Set<string>();
  const prefixLengths: number[] = [];
  let sealCount = 0;

  const client = Object.freeze({
    async stageDispatch(request) {
      const prior = latestClaim.get(request.dispatchIntent.intentDigest);
      const initial = prior === undefined;
      expect(request.dispatchStageClaimRequest.expectedDispatchGeneration).toBe(
        prior?.dispatchGeneration ?? 0
      );
      expect(
        request.dispatchStageClaimRequest.expectedDispatchLedgerRevision
      ).toBe(prior?.dispatchLedgerRevision ?? 0);
      expect(
        request.dispatchStageClaimRequest.expectedPriorStageClaimReceiptDigest
      ).toBe(prior?.receiptDigest ?? null);
      const claimedAt = request.dispatchStageClaimRequest.requestedAt;
      const claim =
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
          request.dispatchIntent,
          request.dispatchStageClaimRequest,
          {
            dispatchAuthorityIssuerId: 'authority.progressive-dispatch',
            dispatchAuthorityImplementationDigest: digest(
              'progressive-dispatch-implementation'
            ),
            dispatchLedgerRevision: initial ? 1 : prior.dispatchLedgerRevision,
            dispatchGeneration: initial ? 1 : prior.dispatchGeneration,
            generationTransition: initial
              ? 'initial-first-delivery'
              : 'generation-retained',
            deliveryDisposition: initial
              ? 'dispatch-authorized-first-delivery'
              : 'reconcile-only-replay',
            claimedAt,
            claimExpiresAt: initial
              ? (new Date(
                  Date.parse(claimedAt) + 60_000
                ).toISOString() as Instant)
              : prior.claimExpiresAt,
            priorTransportReceiptDigest: initial
              ? null
              : (latestTransport.get(request.dispatchIntent.intentDigest) ??
                null),
            sealedJournalRecordDigest: null,
          }
        );
      latestClaim.set(request.dispatchIntent.intentDigest, claim);
      return createAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt(
        request,
        claim
      );
    },
    async storeTransport(request) {
      expect(request.expectedPriorTransportStoreReceiptDigest).toBe(
        activeStoreReceiptDigest
      );
      const priorIntentDigests = new Set(
        activeStore?.dispatchIntentSet.intentDigests ?? []
      );
      request.dispatchIntentSet.intents.forEach((intent, index) => {
        const currentClaim = latestClaim.get(intent.intentDigest);
        const historyClaim = request.dispatchStageClaimHistorySet.receipts.find(
          ({ receiptDigest }) => receiptDigest === currentClaim?.receiptDigest
        );
        const transportReceipt = request.transportReceiptSet.receipts[index]!;
        expect(historyClaim).toBeDefined();
        if (priorIntentDigests.has(intent.intentDigest)) {
          expect(historyClaim?.deliveryDisposition).toBe(
            'reconcile-only-replay'
          );
          expect(historyClaim?.priorTransportReceiptDigest).toBe(
            transportReceipt.receiptDigest
          );
        } else {
          expect(historyClaim?.deliveryDisposition).toBe(
            'dispatch-authorized-first-delivery'
          );
          expect(historyClaim?.priorTransportReceiptDigest).toBeNull();
        }
        latestTransport.set(
          intent.intentDigest,
          transportReceipt.receiptDigest
        );
      });
      if (activeStore !== null) {
        activeSpools.delete(activeStore.spoolReceipt.spoolRef);
      }
      const supersededSpoolReceiptDigest =
        activeStore?.spoolReceipt.receiptDigest ?? null;
      const supersededSpoolDestroyedAt =
        activeStore === null ? null : (clock().toISOString() as Instant);
      activeStore = request;
      activeSpools.add(request.spoolReceipt.spoolRef);
      prefixLengths.push(request.dispatchIntentSet.intents.length);
      const receipt =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
          request,
          {
            transportAuthorityIssuerId: 'authority.progressive-transport',
            transportAuthorityImplementationDigest: digest(
              'progressive-transport-implementation'
            ),
            transportLedgerRevision: prefixLengths.length,
            supersededSpoolReceiptDigest,
            supersededSpoolDestroyedAt,
            storedAt: clock().toISOString() as Instant,
          }
        );
      activeStoreReceiptDigest = receipt.receiptDigest;
      return receipt;
    },
    async readTransportForRecovery() {
      return undefined;
    },
    async listUnfinishedDispatches(request) {
      const snapshotAt = clock().toISOString() as Instant;
      return createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
        request,
        {
          recoveryAuthorityIssuerId: 'authority.progressive-recovery',
          recoveryAuthorityImplementationDigest: digest(
            'progressive-recovery-implementation'
          ),
          snapshotId: `snapshot.progressive.${request.requestDigest.slice(7, 23)}`,
          snapshotRevision: 1,
          snapshotAt,
          expiresAt: new Date(
            Date.parse(snapshotAt) + 60_000
          ).toISOString() as Instant,
          candidates: Object.freeze([]),
          nextCursor: null,
        }
      );
    },
    async storeReconciliationObservation() {
      return undefined;
    },
    async readArchive() {
      return undefined;
    },
    async sealJournal(request) {
      const budgetClosureProjection = closure();
      if (budgetClosureProjection === undefined) {
        throw new TypeError('missing progressive budget closure');
      }
      const archive =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
          request.journalRecord,
          {
            budgetClosureProjection,
            budgetClosureProjectionDigest:
              budgetClosureProjection.projectionDigest,
          }
        );
      expect(activeStore?.spoolReceipt.receiptDigest).toBe(
        request.spoolDispositionReceipt.spoolReceiptDigest
      );
      activeSpools.delete(request.spoolDispositionReceipt.spoolRef);
      sealCount += 1;
      return createAgentHostedRetrievalRuntimeResourceLifecycleSealReceipt(
        request,
        {
          sealAuthorityIssuerId: 'authority.progressive-seal',
          sealAuthorityImplementationDigest: digest(
            'progressive-seal-implementation'
          ),
          sealLedgerRevision: sealCount,
          archiveRecordDigest: archive.archiveRecordDigest,
          sealedAt: clock().toISOString() as Instant,
        }
      );
    },
  }) satisfies AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient;
  return Object.freeze({
    client,
    activeSpools,
    prefixLengths,
    sealCount: () => sealCount,
  });
};

const createControlledClock = () => {
  let current = STARTED_AT_MS;
  return Object.freeze({
    clock: () => new Date(current++),
    advance(milliseconds: number) {
      current += milliseconds;
    },
  });
};

const recoveryJournal = (input: {
  clock: () => Date;
  request: ReturnType<typeof registrationFixture>['request'];
  closure: () =>
    | AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection
    | undefined;
  failFirstSeal?: boolean;
  failFirstStore?: boolean;
}) => {
  const stageRequests = new Map<
    CanonicalDigest,
    AgentHostedRetrievalRuntimeResourceLifecycleStageRequest
  >();
  const initialClaims = new Map<
    CanonicalDigest,
    AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
  >();
  const latestClaims = new Map<
    CanonicalDigest,
    AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
  >();
  const latestTransport = new Map<CanonicalDigest, CanonicalDigest>();
  const claimLog: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[] =
    [];
  const storeReceipts: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt
  >[] = [];
  const archives: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[] =
    [];
  let activeStore: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest | null =
    null;
  let activeStoreReceipt: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt
  > | null = null;
  let failStore = input.failFirstStore ?? false;
  let failSeal = input.failFirstSeal ?? false;
  let sealed = false;
  let successfulStoreCount = 0;
  let recoveryReadCount = 0;
  let observationStoreCount = 0;
  let sealCount = 0;

  const currentSets = () => {
    if (activeStore !== null) {
      const currentHistory =
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
          activeStore.dispatchIntentSet,
          activeStore.dispatchStageClaimReceiptSet,
          claimLog.filter((claim) =>
            activeStore!.dispatchIntentSet.intentDigests.includes(
              claim.dispatchIntentDigest
            )
          )
        );
      return Object.freeze({
        intentSet: activeStore.dispatchIntentSet,
        initialSet: activeStore.dispatchStageClaimReceiptSet,
        historySet: currentHistory,
      });
    }
    const intents = [...stageRequests.values()]
      .map(({ dispatchIntent }) => dispatchIntent)
      .sort((left, right) => left.mutationSequence - right.mutationSequence);
    const intentSet =
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
        intents,
        { allowPartialCreate: true }
      );
    const initialSet =
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
        intentSet,
        intents.map(
          ({ intentDigest }) =>
            initialClaims.get(intentDigest) ??
            (() => {
              throw new TypeError('missing initial claim');
            })()
        )
      );
    return Object.freeze({
      intentSet,
      initialSet,
      historySet:
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
          intentSet,
          initialSet,
          claimLog
        ),
    });
  };

  const client = Object.freeze({
    async stageDispatch(request) {
      const intent = request.dispatchIntent;
      const prior = latestClaims.get(intent.intentDigest);
      const initial = prior === undefined;
      const expired =
        !initial &&
        Date.parse(request.dispatchStageClaimRequest.requestedAt) >=
          Date.parse(prior.claimExpiresAt);
      const claimedAt = request.dispatchStageClaimRequest.requestedAt;
      const claimExpiresAt =
        expired || initial
          ? (new Date(Date.parse(claimedAt) + 60_000).toISOString() as Instant)
          : prior.claimExpiresAt;
      const claim =
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
          intent,
          request.dispatchStageClaimRequest,
          {
            dispatchAuthorityIssuerId: 'authority.recovery-dispatch',
            dispatchAuthorityImplementationDigest: digest(
              'recovery-dispatch-implementation'
            ),
            dispatchLedgerRevision: initial
              ? 1
              : expired
                ? prior.dispatchLedgerRevision + 1
                : prior.dispatchLedgerRevision,
            dispatchGeneration: initial
              ? 1
              : expired
                ? prior.dispatchGeneration + 1
                : prior.dispatchGeneration,
            generationTransition: initial
              ? 'initial-first-delivery'
              : expired
                ? 'expired-owner-takeover'
                : 'generation-retained',
            deliveryDisposition: initial
              ? 'dispatch-authorized-first-delivery'
              : 'reconcile-only-replay',
            claimedAt,
            claimExpiresAt,
            priorTransportReceiptDigest: initial
              ? null
              : (latestTransport.get(intent.intentDigest) ?? null),
            sealedJournalRecordDigest: null,
          }
        );
      stageRequests.set(intent.intentDigest, request);
      if (initial) initialClaims.set(intent.intentDigest, claim);
      latestClaims.set(intent.intentDigest, claim);
      claimLog.push(claim);
      return createAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt(
        request,
        claim
      );
    },
    async storeTransport(request) {
      if (failStore) {
        failStore = false;
        throw new TypeError('simulated crash before transport ACK');
      }
      expect(request.expectedPriorTransportStoreReceiptDigest).toBe(
        activeStoreReceipt?.receiptDigest ?? null
      );
      const supersededSpoolReceiptDigest =
        activeStore?.spoolReceipt.receiptDigest ?? null;
      const supersededSpoolDestroyedAt =
        activeStore === null ? null : (input.clock().toISOString() as Instant);
      const receipt =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
          request,
          {
            transportAuthorityIssuerId: 'authority.recovery-transport',
            transportAuthorityImplementationDigest: digest(
              'recovery-transport-implementation'
            ),
            transportLedgerRevision: storeReceipts.length + 1,
            supersededSpoolReceiptDigest,
            supersededSpoolDestroyedAt,
            storedAt: input.clock().toISOString() as Instant,
          }
        );
      request.dispatchIntentSet.intents.forEach((intent, index) => {
        latestTransport.set(
          intent.intentDigest,
          request.transportReceiptSet.receipts[index]!.receiptDigest
        );
      });
      activeStore = request;
      activeStoreReceipt = receipt;
      storeReceipts.push(receipt);
      successfulStoreCount += 1;
      return receipt;
    },
    async readTransportForRecovery(request) {
      if (activeStore === null || activeStoreReceipt === null) return undefined;
      recoveryReadCount += 1;
      const { historySet } = currentSets();
      const readAt = input.clock().toISOString() as Instant;
      return createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt(
        request,
        historySet,
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
          storeReceipts
        ),
        activeStore,
        activeStoreReceipt,
        {
          recoveryAuthorityIssuerId: 'authority.recovery-read',
          recoveryAuthorityImplementationDigest: digest(
            'recovery-read-implementation'
          ),
          readAt,
          expiresAt: request.minimumReceiptExpiresAt,
        }
      );
    },
    async listUnfinishedDispatches(request) {
      const snapshotAt = input.clock().toISOString() as Instant;
      const candidates =
        sealed || stageRequests.size === 0
          ? Object.freeze([])
          : (() => {
              const { intentSet, historySet } = currentSets();
              return Object.freeze([
                createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate(
                  input.request,
                  intentSet,
                  historySet,
                  activeStore === null
                    ? {
                        unfinishedState: 'staged-before-transport',
                        durableTransportReceiptSetDigest: null,
                        spoolRef: null,
                        transportStoreReceiptDigest: null,
                      }
                    : {
                        unfinishedState: 'transport-stored-before-seal',
                        durableTransportReceiptSetDigest:
                          activeStore.transportReceiptSet.setDigest,
                        spoolRef: activeStore.spoolReceipt.spoolRef,
                        transportStoreReceiptDigest:
                          activeStoreReceipt?.receiptDigest ?? null,
                      }
                ),
              ]);
            })();
      return createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
        request,
        {
          recoveryAuthorityIssuerId: 'authority.recovery-list',
          recoveryAuthorityImplementationDigest: digest(
            'recovery-list-implementation'
          ),
          snapshotId: `snapshot.recovery.${request.requestDigest.slice(7, 23)}`,
          snapshotRevision: 1,
          snapshotAt,
          expiresAt: new Date(
            Date.parse(snapshotAt) + 60_000
          ).toISOString() as Instant,
          candidates,
          nextCursor: null,
        }
      );
    },
    async storeReconciliationObservation(request) {
      observationStoreCount += 1;
      return createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptFromStoreRequest(
        request,
        {
          observationAuthorityIssuerId: 'authority.recovery-observation',
          observationAuthorityImplementationDigest: digest(
            'recovery-observation-implementation'
          ),
        }
      );
    },
    async readArchive(request) {
      const snapshotAt = input.clock().toISOString() as Instant;
      return createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage(
        request,
        {
          recoveryAuthorityIssuerId: 'authority.recovery-archive',
          recoveryAuthorityImplementationDigest: digest(
            'recovery-archive-implementation'
          ),
          snapshotId: `snapshot.archive.${request.requestDigest.slice(7, 23)}`,
          snapshotRevision: 1,
          snapshotAt,
          expiresAt: new Date(
            Date.parse(snapshotAt) + 60_000
          ).toISOString() as Instant,
          archiveRecords: Object.freeze([...archives]),
          nextCursor: null,
          rollingJournalSetDigest: digest('recovery-rolling-journal-set'),
          archiveRootDigest: digest('recovery-archive-root'),
        }
      );
    },
    async sealJournal(request) {
      if (failSeal) {
        failSeal = false;
        throw new TypeError('simulated crash before seal ACK');
      }
      const budgetClosureProjection = input.closure();
      if (budgetClosureProjection === undefined) {
        throw new TypeError('missing recovery budget closure');
      }
      const archive =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
          request.journalRecord,
          {
            budgetClosureProjection,
            budgetClosureProjectionDigest:
              budgetClosureProjection.projectionDigest,
          }
        );
      archives.push(archive);
      sealed = true;
      sealCount += 1;
      return createAgentHostedRetrievalRuntimeResourceLifecycleSealReceipt(
        request,
        {
          sealAuthorityIssuerId: 'authority.recovery-seal',
          sealAuthorityImplementationDigest: digest(
            'recovery-seal-implementation'
          ),
          sealLedgerRevision: sealCount,
          archiveRecordDigest: archive.archiveRecordDigest,
          sealedAt: input.clock().toISOString() as Instant,
        }
      );
    },
  }) satisfies AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient;
  return Object.freeze({
    client,
    archives,
    observationStoreCount: () => observationStoreCount,
    recoveryReadCount: () => recoveryReadCount,
    sealCount: () => sealCount,
    successfulStoreCount: () => successfulStoreCount,
  });
};

const reconciliationTransport = (
  fixture: ReturnType<typeof registrationFixture>,
  clock: () => Date,
  found: boolean
) => {
  const methods: Array<'DELETE' | 'GET' | 'POST'> = [];
  const transport = Object.freeze({
    async use<T>(
      _request: AgentProviderSecretUseRequest,
      consumer: (
        session: AgentEvaluationProviderResourceTransportSession
      ) => Promise<T>
    ): Promise<T> {
      return consumer(
        Object.freeze({
          async execute(request: AgentEvaluationProviderResourceRequest) {
            methods.push(request.method);
            if (
              request.method !== 'GET' ||
              fixture.request.protocolFamily !== 'gemini-interactions'
            ) {
              throw new TypeError('unexpected recovery Provider effect');
            }
            return responseFor(
              request,
              {
                fileSearchStores: found
                  ? [
                      {
                        name: 'fileSearchStores/store-recovered-gemini',
                        displayName: `prodivix-hosted-${fixture.request.requestDigest.slice(7, 31)}`,
                      },
                    ]
                  : [],
              },
              clock
            );
          },
        })
      );
    },
    async close() {
      const base = Object.freeze({
        format:
          'prodivix.agent-evaluation-provider-resource-transport-close-receipt' as const,
        version: 1 as const,
        status: 'clean' as const,
        acceptedSessionCount: methods.length,
        completedSessionCount: methods.length,
        inFlightSessionCount: 0 as const,
        closedAt: clock().toISOString() as Instant,
      });
      return Object.freeze({
        ...base,
        receiptDigest: digestAgentCanonicalValue(base),
      });
    },
  }) satisfies AgentEvaluationProviderResourceTransport;
  return Object.freeze({ transport, methods });
};

describe('production hosted lifecycle progressive durability', () => {
  it.each([
    ['openai-responses', ['upload-content', 'create-primary']],
    [
      'gemini-interactions',
      ['create-primary', 'upload-content-start', 'upload-content-finalize'],
    ],
  ] as const)(
    'stores every %s effect prefix, supersedes prior spools, and seals one final archive',
    async (protocolFamily, expectedMutationKinds) => {
      const clock = createClock();
      const fixture = registrationFixture(protocolFamily);
      const closures = budgetClosures();
      const durable = journal(clock, closures.read);
      const outbound = providerTransport(
        protocolFamily,
        fixture.contentBytes,
        clock
      );
      const provider =
        createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
          lifecycleOwnerInstanceId: 'owner.progressive',
          lifecycleScope: fixture.lifecycleScope,
          journalClient: durable.client,
          spoolCipher:
            createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher(
              {
                profile:
                  createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
                keys: spoolKeys(),
                randomBytes: (size) => new Uint8Array(size).fill(7),
              }
            ),
          budgetClosures: closures.source,
          providerTransport: outbound.transport,
          clock,
        });

      const result = await provider.createResource({
        request: fixture.request,
        program: fixture.program,
        material: fixture.material,
        signal: new AbortController().signal,
      });

      expect(result.providerResourceId).toBe(
        protocolFamily === 'openai-responses'
          ? 'vs-progressive-openai'
          : 'fileSearchStores/store-progressive-gemini'
      );
      expect(outbound.mutationKinds).toEqual(expectedMutationKinds);
      expect(durable.prefixLengths).toEqual(
        expectedMutationKinds.map((_, index) => index + 1)
      );
      expect(durable.sealCount()).toBe(1);
      expect(durable.activeSpools.size).toBe(0);
      const snapshot = await provider.snapshot();
      expect(snapshot.unfinishedMutationCount).toBe(0);
      expect(snapshot.overdueMutationCount).toBe(0);
      expect(snapshot.journalArchiveRecords).toHaveLength(1);
      expect(snapshot.budgetClosureProjections).toHaveLength(1);
    }
  );

  it('recovers a null-prior create through a conservative store and read-only observation without redispatch', async () => {
    const controlled = createControlledClock();
    const fixture = registrationFixture('gemini-interactions');
    const closures = budgetClosures();
    const durable = recoveryJournal({
      clock: controlled.clock,
      request: fixture.request,
      closure: closures.read,
      failFirstStore: true,
    });
    const initialOutbound = providerTransport(
      'gemini-interactions',
      fixture.contentBytes,
      controlled.clock
    );
    const initialProvider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'owner.recovery-null-prior',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: durable.client,
        spoolCipher:
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher(
            {
              profile:
                createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
              keys: spoolKeys(),
              randomBytes: (size) => new Uint8Array(size).fill(9),
            }
          ),
        budgetClosures: closures.source,
        providerTransport: initialOutbound.transport,
        clock: controlled.clock,
      });

    await expect(
      initialProvider.createResource({
        request: fixture.request,
        program: fixture.program,
        material: fixture.material,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'G4_RUNNER_TRANSPORT_FAILED' });
    expect(initialOutbound.mutationKinds).toEqual(['create-primary']);
    controlled.advance(125_000);

    const recoveryOutbound = reconciliationTransport(
      fixture,
      controlled.clock,
      true
    );
    const recoveryProvider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'owner.recovery-null-prior',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: durable.client,
        spoolCipher:
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher(
            {
              profile:
                createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
              keys: spoolKeys(),
              randomBytes: (size) => new Uint8Array(size).fill(10),
            }
          ),
        budgetClosures: closures.source,
        providerTransport: recoveryOutbound.transport,
        clock: controlled.clock,
      });
    const recovered = await recoveryProvider.recoverUnfinished();

    expect(recoveryOutbound.methods).toEqual(['GET']);
    expect(durable.observationStoreCount()).toBe(1);
    expect(durable.recoveryReadCount()).toBe(0);
    expect(durable.successfulStoreCount()).toBe(2);
    expect(durable.sealCount()).toBe(1);
    expect(recovered.unfinishedMutationCount).toBe(0);
    expect(recovered.overdueMutationCount).toBe(0);
    expect(recovered.journalArchiveRecords).toHaveLength(1);
    expect(
      recovered.journalArchiveRecords[0]?.journalRecord.businessResult.outcome
    ).toBe('partial-create-requires-cleanup');

    const noOpOutbound = reconciliationTransport(
      fixture,
      controlled.clock,
      true
    );
    const restartedProvider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'owner.recovery-null-prior',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: durable.client,
        spoolCipher:
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher(
            {
              profile:
                createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
              keys: spoolKeys(),
              randomBytes: (size) => new Uint8Array(size).fill(11),
            }
          ),
        budgetClosures: closures.source,
        providerTransport: noOpOutbound.transport,
        clock: controlled.clock,
      });
    const noOp = await restartedProvider.recoverUnfinished();
    expect(noOpOutbound.methods).toEqual([]);
    expect(durable.successfulStoreCount()).toBe(2);
    expect(durable.sealCount()).toBe(1);
    expect(noOp.unfinishedMutationCount).toBe(0);
    expect(noOp.journalArchiveRecords).toHaveLength(1);
  });

  it('keeps a null-prior create unfinished when read-only reconciliation has no trusted match', async () => {
    const controlled = createControlledClock();
    const fixture = registrationFixture('gemini-interactions');
    const closures = budgetClosures();
    const durable = recoveryJournal({
      clock: controlled.clock,
      request: fixture.request,
      closure: closures.read,
      failFirstStore: true,
    });
    const initialOutbound = providerTransport(
      'gemini-interactions',
      fixture.contentBytes,
      controlled.clock
    );
    const initialProvider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'owner.recovery-unresolved',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: durable.client,
        spoolCipher:
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher(
            {
              profile:
                createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
              keys: spoolKeys(),
              randomBytes: (size) => new Uint8Array(size).fill(12),
            }
          ),
        budgetClosures: closures.source,
        providerTransport: initialOutbound.transport,
        clock: controlled.clock,
      });
    await expect(
      initialProvider.createResource({
        request: fixture.request,
        program: fixture.program,
        material: fixture.material,
        signal: new AbortController().signal,
      })
    ).rejects.toBeDefined();
    controlled.advance(125_000);
    const recoveryOutbound = reconciliationTransport(
      fixture,
      controlled.clock,
      false
    );
    const recoveryProvider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'owner.recovery-unresolved',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: durable.client,
        spoolCipher:
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher(
            {
              profile:
                createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
              keys: spoolKeys(),
              randomBytes: (size) => new Uint8Array(size).fill(13),
            }
          ),
        budgetClosures: closures.source,
        providerTransport: recoveryOutbound.transport,
        clock: controlled.clock,
      });
    const unresolved = await recoveryProvider.recoverUnfinished();
    expect(recoveryOutbound.methods).toEqual(['GET']);
    expect(durable.successfulStoreCount()).toBe(1);
    expect(durable.sealCount()).toBe(0);
    expect(unresolved.unfinishedMutationCount).toBe(1);
    expect(unresolved.journalArchiveRecords).toHaveLength(0);
  });

  it('reads and decrypts a known-prior transport after restart before sealing it without Provider I/O', async () => {
    const controlled = createControlledClock();
    const fixture = registrationFixture('openai-responses');
    const closures = budgetClosures();
    const durable = recoveryJournal({
      clock: controlled.clock,
      request: fixture.request,
      closure: closures.read,
      failFirstSeal: true,
    });
    const initialOutbound = providerTransport(
      'openai-responses',
      fixture.contentBytes,
      controlled.clock
    );
    const initialProvider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'owner.recovery-known-prior',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: durable.client,
        spoolCipher:
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher(
            {
              profile:
                createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
              keys: spoolKeys(),
              randomBytes: (size) => new Uint8Array(size).fill(14),
            }
          ),
        budgetClosures: closures.source,
        providerTransport: initialOutbound.transport,
        clock: controlled.clock,
      });
    await expect(
      initialProvider.createResource({
        request: fixture.request,
        program: fixture.program,
        material: fixture.material,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'G4_RUNNER_TRANSPORT_FAILED' });
    expect(initialOutbound.mutationKinds).toEqual([
      'upload-content',
      'create-primary',
    ]);
    expect(durable.successfulStoreCount()).toBe(2);
    controlled.advance(125_000);

    const recoveryOutbound = reconciliationTransport(
      fixture,
      controlled.clock,
      true
    );
    const recoveryProvider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'owner.recovery-known-prior',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: durable.client,
        spoolCipher:
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher(
            {
              profile:
                createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
              keys: spoolKeys(),
              randomBytes: (size) => new Uint8Array(size).fill(15),
            }
          ),
        budgetClosures: closures.source,
        providerTransport: recoveryOutbound.transport,
        clock: controlled.clock,
      });
    const recovered = await recoveryProvider.recoverUnfinished();
    expect(recoveryOutbound.methods).toEqual([]);
    expect(durable.recoveryReadCount()).toBe(1);
    expect(durable.successfulStoreCount()).toBe(3);
    expect(durable.sealCount()).toBe(1);
    expect(recovered.unfinishedMutationCount).toBe(0);
    expect(recovered.overdueMutationCount).toBe(0);
    expect(recovered.journalArchiveRecords).toHaveLength(1);
    expect(
      recovered.journalArchiveRecords[0]?.journalRecord.businessResult.outcome
    ).toBe('created-and-uploaded');
  });
});
