import {
  createAgentCapabilityProbeProgram,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt,
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
  resolveAgentCapabilityProbePublicResource,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient } from './hostedRetrievalRuntimeResourceLifecycleClient';
import type { AgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureSource } from './productionHostedRetrievalRuntimeResourceLifecycleBudget';
import {
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PROVIDER_MUTATION_MAXIMUM_MS,
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider,
} from './productionHostedRetrievalRuntimeResourceProvider';
import type { AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher } from './productionHostedRetrievalRuntimeResourceLifecycleSpoolCipher';
import type {
  AgentEvaluationProviderResourceTransport,
  AgentEvaluationProviderResourceTransportSession,
} from './productionProviderResourceTransport';

const STARTED_AT_MS = Date.parse('2026-08-12T00:00:00.000Z');
const REPOSITORY_COMMIT = 'a'.repeat(40);
const NAMESPACE_ID = 'namespace.hosted-lifecycle-claim-expiry';
const RUNTIME_RESOURCE_SET_ID = 'runtime-resource-set.claim-expiry';

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({
    test: 'production-hosted-lifecycle-provider-claim-expiry',
    label,
  });

const registrationFixture = () => {
  const planDigest = digest('plan');
  const frozenRunDigest = digest('frozen-run');
  const runConfigArtifactBindingDigest = digest('run-config-binding');
  const providerConfigurationId = 'provider.openai.claim-expiry';
  const providerConfigurationDigest = digest('provider-configuration');
  const modelId = 'model.openai.claim-expiry';
  const modelLineageDigest = digest('model-lineage');
  const adapterDigest = digest('adapter');
  const capabilityProfileId = 'g4-provider-hosted-retrieval-core' as const;
  const capabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  const program = createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest,
  });
  const material = resolveAgentCapabilityProbePublicResource(program);
  if (material === null) throw new TypeError('missing public test material');
  const registrationIntent =
    createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
      providerConfigurationId,
      providerConfigurationDigest,
      protocolFamily: 'openai-responses',
      modelId,
      modelLineageDigest,
      adapterDigest,
      capabilityProfileId,
      capabilityProfileDigest,
      probeProgramDigest: program.programDigest,
      publicResourceDescriptorDigest: material.descriptor.descriptorDigest,
    });
  const budgetReservationAuthority =
    createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority({
      namespaceId: NAMESPACE_ID,
      planDigest,
      reservePolicyDigest: digest('budget-reserve-policy'),
      budgetDigest: digest('budget'),
      reservationId: 'budget-reservation.claim-expiry',
      ledgerRevision: 1,
      demandDigest: digest('budget-demand'),
      demandBytesDigest: digest('budget-demand-bytes'),
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
      protocolFamily: 'openai-responses',
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
    protocolFamily: 'openai-responses',
    modelId,
    modelLineageDigest,
    adapterDigest,
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
      STARTED_AT_MS + 600_000
    ).toISOString() as Instant,
  });
  return Object.freeze({
    request,
    program,
    material,
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

const stoppingSpoolCipher = Object.freeze({
  async encrypt() {
    throw new Error('stop after the mutation signal aborts');
  },
  async useDecrypted<T>(): Promise<T> {
    throw new Error('unexpected spool read');
  },
}) satisfies AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher;

const unusedBudgetClosures = Object.freeze({
  async settle() {
    throw new Error('unexpected budget settlement');
  },
  async readClosure() {
    throw new Error('unexpected budget closure read');
  },
}) satisfies AgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureSource;

const journalClient = (
  stageDispatch: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient['stageDispatch']
): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient =>
  Object.freeze({
    stageDispatch,
    async storeTransport() {
      return undefined;
    },
    async readTransportForRecovery() {
      return undefined;
    },
    async listUnfinishedDispatches() {
      return undefined;
    },
    async storeReconciliationObservation() {
      return undefined;
    },
    async readArchive() {
      return undefined;
    },
    async sealJournal() {
      return undefined;
    },
  });

const authorizedStage = (
  request: Parameters<
    AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient['stageDispatch']
  >[0],
  claimLifetimeMs: number
) => {
  const claimedAt = request.dispatchStageClaimRequest.requestedAt;
  const claim =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
      request.dispatchIntent,
      request.dispatchStageClaimRequest,
      {
        dispatchAuthorityIssuerId: 'authority.lifecycle-dispatch-test',
        dispatchAuthorityImplementationDigest: digest(
          'lifecycle-dispatch-implementation'
        ),
        dispatchLedgerRevision: 1,
        dispatchGeneration: 1,
        generationTransition: 'initial-first-delivery',
        deliveryDisposition: 'dispatch-authorized-first-delivery',
        claimedAt,
        claimExpiresAt: new Date(
          Date.parse(claimedAt) + claimLifetimeMs
        ).toISOString() as Instant,
        priorTransportReceiptDigest: null,
        sealedJournalRecordDigest: null,
      }
    );
  return createAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt(
    request,
    claim
  );
};

const blockingTransport = () => {
  let invocationCount = 0;
  let resolveObserved!: (signal: AbortSignal) => void;
  const observed = new Promise<AbortSignal>((resolve) => {
    resolveObserved = resolve;
  });
  const session = Object.freeze({
    execute(request) {
      invocationCount += 1;
      resolveObserved(request.signal);
      return new Promise<never>((_resolve, reject) => {
        const rejectAborted = () =>
          reject(request.signal.reason ?? new Error('mutation aborted'));
        if (request.signal.aborted) {
          rejectAborted();
          return;
        }
        request.signal.addEventListener('abort', rejectAborted, { once: true });
      });
    },
  }) satisfies AgentEvaluationProviderResourceTransportSession;
  const transport = Object.freeze({
    async use(_request, consumer) {
      return consumer(session);
    },
    async close() {
      const base = Object.freeze({
        format:
          'prodivix.agent-evaluation-provider-resource-transport-close-receipt' as const,
        version: 1 as const,
        status: 'clean' as const,
        acceptedSessionCount: invocationCount,
        completedSessionCount: invocationCount,
        inFlightSessionCount: 0 as const,
        closedAt: new Date().toISOString() as Instant,
      });
      return Object.freeze({
        ...base,
        receiptDigest: digestAgentCanonicalValue(base),
      });
    },
  }) satisfies AgentEvaluationProviderResourceTransport;
  return Object.freeze({
    transport,
    observed,
    invocationCount: () => invocationCount,
  });
};

describe('production hosted retrieval Provider claim expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_AT_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts five seconds before claim expiry and blocks a post-expiry owner takeover from redispatching', async () => {
    const fixture = registrationFixture();
    const outbound = blockingTransport();
    let stageCalls = 0;
    let initialIntentDigest: CanonicalDigest | undefined;
    const journal = journalClient(async (request) => {
      stageCalls += 1;
      if (stageCalls === 1) {
        initialIntentDigest = request.dispatchIntent.intentDigest;
        expect(request.dispatchStageClaimRequest.lifecycleOwnerInstanceId).toBe(
          'lifecycle-owner.initial'
        );
        return authorizedStage(request, 60_000);
      }
      expect(Date.now()).toBe(STARTED_AT_MS + 60_000);
      expect(request.dispatchIntent.intentDigest).toBe(initialIntentDigest);
      expect(request.dispatchStageClaimRequest.lifecycleOwnerInstanceId).toBe(
        'lifecycle-owner.takeover'
      );
      return undefined;
    });
    const initial =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'lifecycle-owner.initial',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: journal,
        spoolCipher: stoppingSpoolCipher,
        budgetClosures: unusedBudgetClosures,
        providerTransport: outbound.transport,
      });
    const initialSettled = initial
      .createResource({
        request: fixture.request,
        program: fixture.program,
        material: fixture.material,
        signal: new AbortController().signal,
      })
      .then(
        () => null,
        (error: unknown) => error
      );
    const initialOutcome = await Promise.race([
      outbound.observed.then((signal) => Object.freeze({ signal })),
      initialSettled.then((error) => Object.freeze({ error })),
    ]);
    if ('error' in initialOutcome) throw initialOutcome.error;
    const mutationSignal = initialOutcome.signal;

    await vi.advanceTimersByTimeAsync(54_999);
    expect(mutationSignal.aborted).toBe(false);
    expect(outbound.invocationCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mutationSignal.aborted).toBe(true);
    expect(Date.now()).toBe(STARTED_AT_MS + 55_000);
    expect(await initialSettled).toBeInstanceOf(Error);

    await vi.advanceTimersByTimeAsync(5_000);
    const takeover =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'lifecycle-owner.takeover',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: journal,
        spoolCipher: stoppingSpoolCipher,
        budgetClosures: unusedBudgetClosures,
        providerTransport: outbound.transport,
      });
    await expect(
      takeover.createResource({
        request: fixture.request,
        program: fixture.program,
        material: fixture.material,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow();
    expect(stageCalls).toBe(2);
    expect(outbound.invocationCount()).toBe(1);
  });

  it('caps an otherwise longer claim-bound mutation at 110 seconds', async () => {
    const fixture = registrationFixture();
    const outbound = blockingTransport();
    const provider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: 'lifecycle-owner.hard-cap',
        lifecycleScope: fixture.lifecycleScope,
        journalClient: journalClient(async (request) =>
          authorizedStage(request, 125_000)
        ),
        spoolCipher: stoppingSpoolCipher,
        budgetClosures: unusedBudgetClosures,
        providerTransport: outbound.transport,
      });
    const settled = provider
      .createResource({
        request: fixture.request,
        program: fixture.program,
        material: fixture.material,
        signal: new AbortController().signal,
      })
      .then(
        () => null,
        (error: unknown) => error
      );
    const initialOutcome = await Promise.race([
      outbound.observed.then((signal) => Object.freeze({ signal })),
      settled.then((error) => Object.freeze({ error })),
    ]);
    if ('error' in initialOutcome) throw initialOutcome.error;
    const mutationSignal = initialOutcome.signal;

    await vi.advanceTimersByTimeAsync(
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PROVIDER_MUTATION_MAXIMUM_MS -
        1
    );
    expect(mutationSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(mutationSignal.aborted).toBe(true);
    expect(Date.now()).toBe(
      STARTED_AT_MS +
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PROVIDER_MUTATION_MAXIMUM_MS
    );
    expect(await settled).toBeInstanceOf(Error);
    expect(outbound.invocationCount()).toBe(1);
  });
});
