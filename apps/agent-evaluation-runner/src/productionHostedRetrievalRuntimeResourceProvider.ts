import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_SEAL_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_TRANSPORT_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_LIFETIME_MS,
  createAgentCapabilityProbeProgram,
  createAgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult,
  createAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleSealRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  createAgentHostedRetrievalRuntimeResourceLifecycleStageRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand,
  digestAgentCanonicalValue,
  isAgentControlIdentity,
  isAgentCanonicalDigest,
  isAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult,
  isAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  resolveAgentCapabilityProbePublicResource,
  type AgentBudgetDemand,
  type AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate,
  type AgentHostedRetrievalRuntimeResourceRegistrationRequest,
  type AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  type AgentJsonValue,
  type Instant,
} from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type { AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient } from './hostedRetrievalRuntimeResourceLifecycleClient';
import type {
  AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence,
  AgentEvaluationHostedRetrievalRuntimeResourceDeletionEvidence,
  AgentEvaluationHostedRetrievalRuntimeResourceProvider,
} from './hostedRetrievalRuntimeResourceProvider';
import type { AgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureSource } from './productionHostedRetrievalRuntimeResourceLifecycleBudget';
import type { AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher } from './productionHostedRetrievalRuntimeResourceLifecycleSpoolCipher';
import {
  executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceMutation,
  executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceReconciliation,
  projectAgentEvaluationHostedRetrievalProviderResourceMutation,
  projectAgentEvaluationHostedRetrievalProviderResourceReconciliation,
  type AgentEvaluationHostedRetrievalProviderResourceMutation,
  type AgentEvaluationHostedRetrievalProviderResourceMutationResult,
  type AgentEvaluationHostedRetrievalProviderResourceReconciliation,
} from './productionHostedRetrievalProviderResourceMutationAdapter';
import {
  createAgentEvaluationProviderResourceTransport,
  type AgentEvaluationProviderResourceTransport,
  type CreateAgentEvaluationProviderResourceTransportInput,
} from './productionProviderResourceTransport';

export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_AUTHORITY_ISSUER_ID =
  'authority.prodivix.hosted-retrieval-runtime-resource-lifecycle-runner' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-runner-implementation',
    version: 1,
  });

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot =
  Readonly<{
    journalArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[];
    budgetClosureProjections: readonly NonNullable<
      AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord['budgetClosureProjection']
    >[];
    unfinishedMutationCount: number;
    overdueMutationCount: number;
  }>;

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider =
  AgentEvaluationHostedRetrievalRuntimeResourceProvider &
    Readonly<{
      recoverUnfinished(): Promise<ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot>;
      snapshot(): Promise<ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot>;
    }>;

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleNormalizedResponse =
  Readonly<{
    format: 'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-normalized-response';
    version: 1;
    operation: 'create' | 'delete';
    registrationRequest: AgentHostedRetrievalRuntimeResourceRegistrationRequest;
    businessResult: AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult;
    mutations: readonly AgentJsonValue[];
    receiptDigests: readonly string[];
  }>;

export const isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleNormalizedResponse =
  (
    value: AgentJsonValue
  ): value is ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleNormalizedResponse => {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length !== 7
    ) {
      return false;
    }
    const candidate = value as Record<string, AgentJsonValue>;
    return (
      candidate.format ===
        'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-normalized-response' &&
      candidate.version === 1 &&
      (candidate.operation === 'create' || candidate.operation === 'delete') &&
      isAgentHostedRetrievalRuntimeResourceRegistrationRequest(
        candidate.registrationRequest
      ) &&
      isAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult(
        candidate.businessResult
      ) &&
      Array.isArray(candidate.mutations) &&
      Array.isArray(candidate.receiptDigests) &&
      candidate.receiptDigests.every(isAgentCanonicalDigest)
    );
  };

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleScope =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    planDigest: string;
    frozenRunDigest: string;
    runConfigArtifactBindingDigest: string;
    runtimeResourceSetId: string;
  }>;

type LifecycleOperationContext = Readonly<{
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest;
  authorityDigest: string | null;
  lifecycleClaimReceiptDigest: string | null;
  lifecycleExpiresAt: Instant;
  operation: 'create' | 'delete';
  resourceId: string | null;
  resourceRole: 'auxiliary' | 'primary' | null;
}>;

type StoredTransport = Readonly<{
  businessResult: AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult;
  dispatchIntentSet: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet
  >;
  dispatchStageClaimReceiptSet: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet
  >;
  dispatchStageClaimHistorySet: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet
  >;
  transportReceiptSet: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet
  >;
  spoolReceipt: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt
  >;
  transportStoreReceipt: Awaited<
    ReturnType<
      AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient['storeTransport']
    >
  > & {};
  transportStoreReceiptHistory: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory
  >;
}>;

const textEncoder = new TextEncoder();
const dispatchClaimLifetimeMs = 60_000;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PROVIDER_MUTATION_MAXIMUM_MS =
  110_000 as const;
const dispatchClaimAbortSafetyMarginMs = 5_000;

const fail = (
  code: (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES]
): never => {
  throw new AgentEvaluationRunnerError(code);
};

const invalid = (): never =>
  fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);

const responseInvalid = (): never =>
  fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);

const transportFailed = (): never =>
  fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed);

const instant = (clock: () => Date): Instant => {
  const value = clock();
  return Number.isFinite(value.getTime())
    ? (value.toISOString() as Instant)
    : invalid();
};

const laterInstant = (...values: readonly Instant[]): Instant =>
  [...values].sort(compareUnicodeCodePoints).at(-1) ?? invalid();

const addMilliseconds = (value: Instant, milliseconds: number): Instant => {
  const result = Date.parse(value) + milliseconds;
  return Number.isSafeInteger(result)
    ? (new Date(result).toISOString() as Instant)
    : invalid();
};

const minimumInstant = (left: Instant, right: Instant): Instant =>
  Date.parse(left) <= Date.parse(right) ? left : right;

const createClaimBoundMutationSignal = (input: {
  outerSignal: AbortSignal;
  claimExpiresAt: Instant;
  observedAt: Instant;
}): Readonly<{ signal: AbortSignal; dispose(): void }> => {
  const remainingMilliseconds =
    Date.parse(input.claimExpiresAt) -
    Date.parse(input.observedAt) -
    dispatchClaimAbortSafetyMarginMs;
  if (remainingMilliseconds <= 0 || input.outerSignal.aborted) {
    return transportFailed();
  }
  const controller = new AbortController();
  const abortFromOuter = () => controller.abort(input.outerSignal.reason);
  input.outerSignal.addEventListener('abort', abortFromOuter, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException('dispatch claim deadline reached', 'TimeoutError')
      ),
    Math.min(
      remainingMilliseconds,
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PROVIDER_MUTATION_MAXIMUM_MS
    )
  );
  return Object.freeze({
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      input.outerSignal.removeEventListener('abort', abortFromOuter);
    },
  });
};

const publicMaterialFor = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest
) => {
  const program = createAgentCapabilityProbeProgram({
    capabilityProfileId: request.capabilityProfileId,
    capabilityProfileDigest: request.capabilityProfileDigest,
  });
  const material = resolveAgentCapabilityProbePublicResource(program);
  if (
    material === null ||
    program.programDigest !== request.probeProgramDigest ||
    material.descriptor.descriptorDigest !==
      request.publicResourceDescriptorDigest
  ) {
    return invalid();
  }
  return Object.freeze({ program, material });
};

const demandFor = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest
): AgentBudgetDemand => {
  const { material } = publicMaterialFor(request);
  return createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
    request.registrationIntent,
    material
  );
};

const contentFor = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest
): Uint8Array => {
  const { material } = publicMaterialFor(request);
  const content =
    request.capabilityProfileId === 'g4-provider-hosted-retrieval-document'
      ? material.documentText
      : material.contentText;
  if (content === null) return invalid();
  return textEncoder.encode(content);
};

const operationContextForCreate = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest
): LifecycleOperationContext =>
  Object.freeze({
    request,
    authorityDigest: null,
    lifecycleClaimReceiptDigest: null,
    lifecycleExpiresAt: request.minimumExpiresAt,
    operation: 'create',
    resourceId: null,
    resourceRole: null,
  });

const operationContextForDelete = (
  claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  resourceId: string,
  resourceRole: 'auxiliary' | 'primary'
): LifecycleOperationContext =>
  Object.freeze({
    request: claimReceipt.registrationResult.registrationRequest,
    authorityDigest: claimReceipt.registrationResult.authorityDigest,
    lifecycleClaimReceiptDigest: claimReceipt.receiptDigest,
    lifecycleExpiresAt: claimReceipt.claimExpiresAt,
    operation: 'delete',
    resourceId,
    resourceRole,
  });

const createMutationSequence = (
  context: LifecycleOperationContext,
  signal: AbortSignal,
  observedAt: Instant
): Readonly<{
  first(): AgentEvaluationHostedRetrievalProviderResourceMutation;
  next(
    results: readonly AgentEvaluationHostedRetrievalProviderResourceMutationResult[]
  ): AgentEvaluationHostedRetrievalProviderResourceMutation | null;
}> => {
  const request = context.request;
  if (context.operation === 'delete') {
    return Object.freeze({
      first: () =>
        Object.freeze({
          protocolFamily: request.protocolFamily,
          mutationKind: 'delete-resource',
          resourceId: context.resourceId!,
          resourceRole: context.resourceRole!,
          signal,
        }),
      next: () => null,
    });
  }
  const contentBytes = contentFor(request);
  const filename = `prodivix-hosted-${request.requestDigest.slice(7, 23)}.txt`;
  const displayName = `prodivix-hosted-${request.requestDigest.slice(7, 31)}`;
  if (request.protocolFamily === 'openai-responses') {
    return Object.freeze({
      first: () =>
        Object.freeze({
          protocolFamily: 'openai-responses',
          mutationKind: 'upload-content',
          contentBytes,
          filename,
          lifetimeSeconds: Math.min(
            8 * 24 * 60 * 60,
            Math.max(
              3_600,
              Math.ceil(
                (Date.parse(request.minimumExpiresAt) -
                  Date.parse(observedAt)) /
                  1_000
              )
            )
          ),
          signal,
        }),
      next: (results) => {
        if (results.length !== 1) return null;
        const uploaded = results[0]!;
        if (
          uploaded.mutationKind !== 'upload-content' ||
          uploaded.resourceId === null ||
          uploaded.resourceRole !== 'auxiliary' ||
          uploaded.outcome !== 'uploaded'
        ) {
          return responseInvalid();
        }
        return Object.freeze({
          protocolFamily: 'openai-responses',
          mutationKind: 'create-primary',
          displayName,
          auxiliaryResourceId: uploaded.resourceId,
          signal,
        });
      },
    });
  }
  return Object.freeze({
    first: () =>
      Object.freeze({
        protocolFamily: 'gemini-interactions',
        mutationKind: 'create-primary',
        displayName,
        signal,
      }),
    next: (results) => {
      const created = results[0];
      if (
        created === undefined ||
        created.mutationKind !== 'create-primary' ||
        created.resourceId === null ||
        created.resourceRole !== 'primary' ||
        created.outcome !== 'created'
      ) {
        return responseInvalid();
      }
      if (results.length === 1) {
        return Object.freeze({
          protocolFamily: 'gemini-interactions',
          mutationKind: 'upload-content-start',
          providerResourceId: created.resourceId,
          filename,
          contentBytes: contentBytes.byteLength,
          signal,
        });
      }
      if (results.length === 2) {
        const started = results[1]!;
        if (
          started.mutationKind !== 'upload-content-start' ||
          started.outcome !== 'accepted' ||
          started.continuationEndpoint === null
        ) {
          return responseInvalid();
        }
        return Object.freeze({
          protocolFamily: 'gemini-interactions',
          mutationKind: 'upload-content-finalize',
          providerResourceId: created.resourceId,
          continuationEndpoint: started.continuationEndpoint,
          contentBytes,
          signal,
        });
      }
      return null;
    },
  });
};

const manifestDigestFor = (
  mutationKind: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent['mutationKind'],
  result: AgentEvaluationHostedRetrievalProviderResourceMutationResult
) =>
  mutationKind === 'upload-content' ||
  mutationKind === 'upload-content-finalize'
    ? (result.resourceManifestDigest ?? responseInvalid())
    : null;

const normalizedResult = (
  result: AgentEvaluationHostedRetrievalProviderResourceMutationResult
): AgentJsonValue =>
  Object.freeze({
    protocolFamily: result.protocolFamily,
    mutationKind: result.mutationKind,
    outcome: result.outcome,
    resourceId: result.resourceId,
    resourceRole: result.resourceRole,
    resourceManifestDigest: result.resourceManifestDigest,
    readiness: result.readiness,
    status: result.transport.status,
    providerRequestId: result.transport.providerRequestId,
    responseBodyDigest: result.transport.responseBodyDigest,
    requestProjectionDigest: result.transport.requestProjectionDigest,
    responseProjectionDigest: result.transport.responseProjectionDigest,
    startedAt: result.transport.startedAt,
    completedAt: result.transport.completedAt,
  });

const businessResultFor = (
  context: LifecycleOperationContext,
  results: readonly AgentEvaluationHostedRetrievalProviderResourceMutationResult[],
  receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt[],
  completed: boolean,
  completedAt: Instant
): AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult => {
  if (context.operation === 'delete') {
    const result = results[0] ?? responseInvalid();
    return createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult({
      operation: 'delete',
      providerResourceId: null,
      auxiliaryResourceIds: Object.freeze([]),
      resourceManifestDigest: null,
      resourceId: context.resourceId,
      resourceRole: context.resourceRole,
      reconciliationObservationReceiptSet: null,
      reconciliationObservationReceiptSetDigest: null,
      outcome:
        result.outcome === 'already-absent' ? 'already-absent' : 'deleted',
      completedAt,
    });
  }
  const unresolved = receipts.some(
    ({ outcome }) => outcome === 'post-dispatch-unknown'
  );
  const primary = results.find(
    ({ resourceRole }) => resourceRole === 'primary'
  );
  const auxiliaryIds = Object.freeze(
    results
      .filter(({ resourceRole }) => resourceRole === 'auxiliary')
      .map(({ resourceId }) => resourceId!)
      .sort(compareUnicodeCodePoints)
  );
  const upload = [...results]
    .reverse()
    .find(({ mutationKind }) =>
      ['upload-content', 'upload-content-finalize'].includes(mutationKind)
    );
  return createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult({
    operation: 'create',
    providerResourceId: primary?.resourceId ?? null,
    auxiliaryResourceIds: auxiliaryIds,
    resourceManifestDigest:
      completed && !unresolved
        ? (upload?.resourceManifestDigest ?? responseInvalid())
        : null,
    resourceId: null,
    resourceRole: null,
    reconciliationObservationReceiptSet: null,
    reconciliationObservationReceiptSetDigest: null,
    outcome: unresolved
      ? 'provider-outcome-unresolved'
      : completed
        ? 'created-and-uploaded'
        : 'partial-create-requires-cleanup',
    completedAt,
  });
};

export const createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider =
  (input: {
    lifecycleOwnerInstanceId: string;
    lifecycleScope: ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleScope;
    journalClient: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient;
    spoolCipher: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher;
    budgetClosures: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureSource;
    environment?: CreateAgentEvaluationProviderResourceTransportInput['environment'];
    providerTransport?: AgentEvaluationProviderResourceTransport;
    fetch?: CreateAgentEvaluationProviderResourceTransportInput['fetch'];
    resolveHost?: CreateAgentEvaluationProviderResourceTransportInput['resolveHost'];
    secrets?: CreateAgentEvaluationProviderResourceTransportInput['secrets'];
    clock?: () => Date;
  }): ProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider => {
    if (
      !isAgentControlIdentity(input.lifecycleOwnerInstanceId) ||
      !isAgentControlIdentity(input.lifecycleScope?.namespaceId) ||
      !/^[0-9a-f]{40}$/u.test(input.lifecycleScope.repositoryCommit) ||
      ![
        input.lifecycleScope.planDigest,
        input.lifecycleScope.frozenRunDigest,
        input.lifecycleScope.runConfigArtifactBindingDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentControlIdentity(input.lifecycleScope.runtimeResourceSetId) ||
      typeof input.journalClient?.stageDispatch !== 'function' ||
      typeof input.journalClient.storeTransport !== 'function' ||
      typeof input.journalClient.listUnfinishedDispatches !== 'function' ||
      typeof input.journalClient.sealJournal !== 'function' ||
      typeof input.spoolCipher?.encrypt !== 'function' ||
      typeof input.budgetClosures?.settle !== 'function' ||
      typeof input.budgetClosures.readClosure !== 'function'
    ) {
      return invalid();
    }
    const clock = input.clock ?? (() => new Date());
    const providerTransport =
      input.providerTransport ??
      createAgentEvaluationProviderResourceTransport({
        ...(input.environment === undefined
          ? {}
          : { environment: input.environment }),
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        ...(input.resolveHost === undefined
          ? {}
          : { resolveHost: input.resolveHost }),
        ...(input.secrets === undefined ? {} : { secrets: input.secrets }),
      });
    const archiveRecords: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[] =
      [];
    const dispatched = new Set<string>();
    let closed = false;

    const failClosed = async <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch {
        return transportFailed();
      }
    };

    const persistTransport = async (
      context: LifecycleOperationContext,
      intents: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent[],
      initialClaims: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[],
      claimHistory: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[],
      receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt[],
      results: readonly AgentEvaluationHostedRetrievalProviderResourceMutationResult[],
      completed: boolean,
      priorTransportStoreReceipts: readonly NonNullable<
        Awaited<
          ReturnType<
            AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient['storeTransport']
          >
        >
      >[]
    ): Promise<StoredTransport> => {
      const dispatchIntentSet =
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
          intents,
          { allowPartialCreate: context.operation === 'create' && !completed }
        );
      const dispatchStageClaimReceiptSet =
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
          dispatchIntentSet,
          initialClaims
        );
      const dispatchStageClaimHistorySet =
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
          dispatchIntentSet,
          dispatchStageClaimReceiptSet,
          claimHistory
        );
      const transportReceiptSet =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(
          dispatchIntentSet,
          dispatchStageClaimReceiptSet,
          receipts
        );
      const completedAt = laterInstant(
        ...receipts.map((receipt) => receipt.completedAt)
      );
      const businessResult = businessResultFor(
        context,
        results,
        receipts,
        completed,
        completedAt
      );
      const normalizedResponse = Object.freeze({
        format:
          'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-normalized-response',
        version: 1,
        operation: context.operation,
        registrationRequest: context.request,
        businessResult,
        mutations: Object.freeze(results.map(normalizedResult)),
        receiptDigests: Object.freeze(
          receipts.map(({ receiptDigest }) => receiptDigest)
        ),
      }) satisfies AgentJsonValue;
      const createdAt = completedAt;
      const expiresAt = minimumInstant(
        context.lifecycleExpiresAt,
        addMilliseconds(
          createdAt,
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_LIFETIME_MS
        )
      );
      if (Date.parse(expiresAt) <= Date.parse(createdAt))
        return transportFailed();
      const spoolAad =
        createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad({
          namespaceId: context.request.namespaceId,
          repositoryCommit: context.request.repositoryCommit,
          planDigest: context.request.planDigest,
          frozenRunDigest: context.request.frozenRunDigest,
          runConfigArtifactBindingDigest:
            context.request.runConfigArtifactBindingDigest,
          runtimeResourceSetId: context.request.runtimeResourceSetId,
          lifecycleExpiresAt: context.lifecycleExpiresAt,
          registrationRequestDigest: context.request.requestDigest,
          authorityDigest: context.authorityDigest,
          lifecycleClaimReceiptDigest: context.lifecycleClaimReceiptDigest,
          operation: context.operation,
          resourceId: context.resourceId,
          resourceRole: context.resourceRole,
          dispatchIntentSetDigest: dispatchIntentSet.setDigest,
          dispatchStageClaimReceiptSetDigest:
            dispatchStageClaimReceiptSet.setDigest,
          dispatchStageClaimHistorySetDigest:
            dispatchStageClaimHistorySet.setDigest,
          transportReceiptSetDigest: transportReceiptSet.setDigest,
          businessResultDigest: businessResult.resultDigest,
          plaintextDigest: digestAgentCanonicalValue(normalizedResponse),
        });
      const encrypted = await failClosed(() =>
        input.spoolCipher.encrypt(spoolAad, normalizedResponse)
      );
      const spoolReceipt =
        createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
          spoolAad,
          encrypted.envelopeAuthority,
          { createdAt, expiresAt }
        );
      const request =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
          {
            purpose:
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_TRANSPORT_PURPOSE,
            expectedPriorTransportStoreReceiptDigest:
              priorTransportStoreReceipts.at(-1)?.receiptDigest ?? null,
            dispatchIntentSet,
            dispatchStageClaimReceiptSet,
            dispatchStageClaimHistorySet,
            transportReceiptSet,
            spoolAad,
            spoolWriteEnvelope: encrypted.envelope,
            spoolEnvelopeAuthority: encrypted.envelopeAuthority,
            spoolReceipt,
          }
        );
      const transportStoreReceipt = await failClosed(() =>
        input.journalClient.storeTransport(request)
      );
      if (transportStoreReceipt === undefined) {
        return transportFailed();
      }
      const transportStoreReceiptHistory =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
          Object.freeze([...priorTransportStoreReceipts, transportStoreReceipt])
        );
      return Object.freeze({
        businessResult,
        dispatchIntentSet,
        dispatchStageClaimReceiptSet,
        dispatchStageClaimHistorySet,
        transportReceiptSet,
        spoolReceipt,
        transportStoreReceipt,
        transportStoreReceiptHistory,
      });
    };

    const sealStoredTransport = async (
      context: LifecycleOperationContext,
      stored: StoredTransport
    ): Promise<AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord> => {
      const demand = demandFor(context.request);
      const budgetClosureProjection = await failClosed(() =>
        context.operation === 'create'
          ? input.budgetClosures.settle({
              authority: context.request.budgetReservationAuthority,
              demand,
              settledAt: stored.businessResult.completedAt,
            })
          : input.budgetClosures.readClosure({
              authority: context.request.budgetReservationAuthority,
              demand,
            })
      );
      const disposedAt = laterInstant(
        stored.spoolReceipt.createdAt,
        instant(clock)
      );
      const disposition =
        createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt(
          stored.spoolReceipt,
          {
            disposition: 'destroyed-after-business-seal',
            businessSealKind:
              context.operation === 'delete'
                ? 'cleanup-result'
                : stored.businessResult.outcome ===
                    'partial-create-requires-cleanup'
                  ? 'partial-create-result'
                  : stored.businessResult.outcome ===
                      'abandoned-before-provider-effect'
                    ? 'abandoned-before-provider-effect'
                    : 'registration-result',
            businessSealReceiptDigest: stored.businessResult.resultDigest,
            disposedAt,
          }
        );
      const journalRecord =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord(
          {
            dispatchIntentSet: stored.dispatchIntentSet,
            dispatchStageClaimReceiptSet: stored.dispatchStageClaimReceiptSet,
            dispatchStageClaimHistorySet: stored.dispatchStageClaimHistorySet,
            transportReceiptSet: stored.transportReceiptSet,
            businessResult: stored.businessResult,
            resultSpoolReceipt: stored.spoolReceipt,
            resultSpoolDispositionReceipt: disposition,
          }
        );
      const archiveRecord =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
          journalRecord,
          {
            budgetClosureProjection:
              context.operation === 'create' ? budgetClosureProjection : null,
            budgetClosureProjectionDigest:
              budgetClosureProjection.projectionDigest,
          }
        );
      const sealReceipt = await failClosed(() =>
        input.journalClient.sealJournal(
          createAgentHostedRetrievalRuntimeResourceLifecycleSealRequest({
            purpose:
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_SEAL_PURPOSE,
            journalRecord,
            transportStoreReceiptHistory: stored.transportStoreReceiptHistory,
            spoolDispositionReceipt: disposition,
          })
        )
      );
      if (
        sealReceipt === undefined ||
        sealReceipt.archiveRecordDigest !== archiveRecord.archiveRecordDigest ||
        sealReceipt.transportStoreReceiptHistoryDigest !==
          stored.transportStoreReceiptHistory.historyDigest
      ) {
        return transportFailed();
      }
      if (
        !archiveRecords.some(
          ({ archiveRecordDigest }) =>
            archiveRecordDigest === archiveRecord.archiveRecordDigest
        )
      ) {
        archiveRecords.push(archiveRecord);
      }
      return archiveRecord;
    };

    const storeRecoveredTransport = async (recovered: {
      lifecycleExpiresAt: Instant;
      dispatchIntentSet: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet
      >;
      dispatchStageClaimReceiptSet: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet
      >;
      dispatchStageClaimHistorySet: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet
      >;
      transportReceiptSet: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet
      >;
      businessResult: AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult;
      normalizedResponse: AgentJsonValue;
      priorTransportStoreReceiptHistory: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory
      > | null;
    }): Promise<StoredTransport> => {
      const firstIntent =
        recovered.dispatchIntentSet.intents[0] ?? responseInvalid();
      const createdAt = laterInstant(
        recovered.businessResult.completedAt,
        ...recovered.transportReceiptSet.receipts.map(
          ({ completedAt }) => completedAt
        )
      );
      const expiresAt = minimumInstant(
        recovered.lifecycleExpiresAt,
        addMilliseconds(
          createdAt,
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_LIFETIME_MS
        )
      );
      if (Date.parse(expiresAt) <= Date.parse(createdAt)) {
        return transportFailed();
      }
      const spoolAad =
        createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad({
          namespaceId: firstIntent.namespaceId,
          repositoryCommit: firstIntent.repositoryCommit,
          planDigest: firstIntent.planDigest,
          frozenRunDigest: firstIntent.frozenRunDigest,
          runConfigArtifactBindingDigest:
            firstIntent.runConfigArtifactBindingDigest,
          runtimeResourceSetId: firstIntent.runtimeResourceSetId,
          lifecycleExpiresAt: recovered.lifecycleExpiresAt,
          registrationRequestDigest:
            recovered.dispatchIntentSet.registrationRequestDigest,
          authorityDigest: firstIntent.authorityDigest,
          lifecycleClaimReceiptDigest:
            recovered.dispatchIntentSet.lifecycleClaimReceiptDigest,
          operation: recovered.dispatchIntentSet.operation,
          resourceId: recovered.businessResult.resourceId,
          resourceRole: recovered.businessResult.resourceRole,
          dispatchIntentSetDigest: recovered.dispatchIntentSet.setDigest,
          dispatchStageClaimReceiptSetDigest:
            recovered.dispatchStageClaimReceiptSet.setDigest,
          dispatchStageClaimHistorySetDigest:
            recovered.dispatchStageClaimHistorySet.setDigest,
          transportReceiptSetDigest: recovered.transportReceiptSet.setDigest,
          businessResultDigest: recovered.businessResult.resultDigest,
          plaintextDigest: digestAgentCanonicalValue(
            recovered.normalizedResponse
          ),
        });
      const encrypted = await failClosed(() =>
        input.spoolCipher.encrypt(spoolAad, recovered.normalizedResponse)
      );
      const spoolReceipt =
        createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
          spoolAad,
          encrypted.envelopeAuthority,
          { createdAt, expiresAt }
        );
      const priorReceipts =
        recovered.priorTransportStoreReceiptHistory?.receipts ??
        Object.freeze([]);
      const request =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
          {
            purpose:
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_TRANSPORT_PURPOSE,
            expectedPriorTransportStoreReceiptDigest:
              priorReceipts.at(-1)?.receiptDigest ?? null,
            dispatchIntentSet: recovered.dispatchIntentSet,
            dispatchStageClaimReceiptSet:
              recovered.dispatchStageClaimReceiptSet,
            dispatchStageClaimHistorySet:
              recovered.dispatchStageClaimHistorySet,
            transportReceiptSet: recovered.transportReceiptSet,
            spoolAad,
            spoolWriteEnvelope: encrypted.envelope,
            spoolEnvelopeAuthority: encrypted.envelopeAuthority,
            spoolReceipt,
          }
        );
      const transportStoreReceipt = await failClosed(() =>
        input.journalClient.storeTransport(request)
      );
      if (transportStoreReceipt === undefined) return transportFailed();
      const transportStoreReceiptHistory =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
          Object.freeze([...priorReceipts, transportStoreReceipt])
        );
      return Object.freeze({
        businessResult: recovered.businessResult,
        dispatchIntentSet: recovered.dispatchIntentSet,
        dispatchStageClaimReceiptSet: recovered.dispatchStageClaimReceiptSet,
        dispatchStageClaimHistorySet: recovered.dispatchStageClaimHistorySet,
        transportReceiptSet: recovered.transportReceiptSet,
        spoolReceipt,
        transportStoreReceipt,
        transportStoreReceiptHistory,
      });
    };

    const reconcileUnknownReceipts = async (recovered: {
      dispatchIntentSet: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet
      >;
      dispatchStageClaimHistorySet: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet
      >;
      transportReceiptSet: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet
      >;
      registrationRequestDigest: string;
    }): Promise<
      | readonly AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt[]
      | null
    > => {
      const observations: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt[] =
        [];
      for (const receipt of recovered.transportReceiptSet.receipts) {
        if (receipt.outcome !== 'post-dispatch-unknown') continue;
        const intent = recovered.dispatchIntentSet.intents.find(
          ({ intentDigest }) => intentDigest === receipt.dispatchIntentDigest
        );
        const currentClaim = recovered.dispatchStageClaimHistorySet.receipts
          .filter(
            ({ dispatchIntentDigest }) =>
              dispatchIntentDigest === intent?.intentDigest
          )
          .at(-1);
        if (!intent || !currentClaim) return null;
        let reconciliation: AgentEvaluationHostedRetrievalProviderResourceReconciliation;
        if (
          intent.mutationKind === 'create-primary' &&
          intent.protocolFamily === 'gemini-interactions' &&
          intent.resourceId === null
        ) {
          reconciliation = Object.freeze({
            reconciliationKind: 'list-primary',
            protocolFamily: 'gemini-interactions',
            displayName: `prodivix-hosted-${intent.registrationRequestDigest.slice(7, 31)}`,
            signal: AbortSignal.timeout(30_000),
          });
        } else if (intent.resourceId !== null && intent.resourceRole !== null) {
          reconciliation = Object.freeze({
            reconciliationKind: 'read-resource',
            protocolFamily: intent.protocolFamily,
            resourceId: intent.resourceId,
            resourceRole: intent.resourceRole,
            signal: AbortSignal.timeout(30_000),
          });
        } else {
          return null;
        }
        const projection =
          projectAgentEvaluationHostedRetrievalProviderResourceReconciliation(
            reconciliation
          );
        const requestedAt = instant(clock);
        const observationRequest =
          createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
            {
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PURPOSE,
              dispatchIntentDigest: intent.intentDigest,
              dispatchStageClaimReceiptDigest: currentClaim.receiptDigest,
              transportReceiptDigest: receipt.receiptDigest,
              mutationKind: intent.mutationKind,
              mutationSequence: intent.mutationSequence,
              providerConfigurationId: intent.providerConfigurationId,
              endpointId: projection.endpointId,
              method: 'GET',
              requestedAt,
            }
          );
        const result = await providerTransport.use(
          {
            protocolFamily: intent.protocolFamily,
            providerConfigurationId: intent.providerConfigurationId,
            secretRef:
              AGENT_EVALUATION_PROVIDER_DEFINITIONS[intent.protocolFamily]
                .secretRef,
            purpose: 'hosted-retrieval-resource-lifecycle',
            runtimeZone: 'server',
            useId: `hosted-lifecycle.reconcile.${intent.intentDigest.slice(7)}`,
          },
          (session) =>
            executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceReconciliation(
              session,
              {
                dispatchIntent: intent,
                dispatchStageClaimReceipt: currentClaim,
                observationRequest,
                reconciliation,
              }
            )
        );
        if (
          (intent.operation === 'delete' &&
            result.outcome !== 'already-absent' &&
            result.outcome !== 'deleted') ||
          (intent.operation === 'create' && result.resourceId === null)
        ) {
          return null;
        }
        const observationOutcome =
          intent.mutationKind === 'create-primary'
            ? 'created'
            : intent.mutationKind === 'upload-content-start'
              ? 'accepted'
              : result.outcome;
        if (
          intent.mutationKind === 'upload-content-finalize' &&
          observationOutcome !== 'uploaded'
        ) {
          return null;
        }
        const observationProjection =
          createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection(
            {
              dispatchIntentDigest: intent.intentDigest,
              dispatchStageClaimReceiptDigest: currentClaim.receiptDigest,
              transportReceiptDigest: receipt.receiptDigest,
              mutationKind: intent.mutationKind,
              mutationSequence: intent.mutationSequence,
              providerConfigurationId: intent.providerConfigurationId,
              endpointId: projection.endpointId,
              method: 'GET',
              observationOutcome,
              resourceId: result.resourceId,
              resourceRole: result.resourceRole,
              resourceManifestDigest:
                intent.mutationKind === 'upload-content' ||
                intent.mutationKind === 'upload-content-finalize'
                  ? result.resourceManifestDigest
                  : null,
              httpStatus: result.transport.status,
              providerRequestId: result.transport.providerRequestId,
              requestProjectionDigest: result.transport.requestProjectionDigest,
              responseProjectionDigest:
                result.transport.responseProjectionDigest,
              responseBodyDigest: result.transport.responseBodyDigest,
              responseBytes: result.transport.responseBytes,
              observedAt: result.transport.completedAt,
            }
          );
        const stored = await input.journalClient.storeReconciliationObservation(
          createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest(
            observationRequest,
            observationProjection
          )
        );
        if (stored === undefined) return transportFailed();
        observations.push(stored);
      }
      return observations.length === 0
        ? Object.freeze([])
        : createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet(
            {
              operation: recovered.dispatchIntentSet.operation,
              registrationRequestDigest: recovered.registrationRequestDigest,
              receipts: observations,
            }
          ).receipts;
    };

    const recoveredBusinessResult = (
      operation: 'create' | 'delete',
      transportReceiptSet: ReturnType<
        typeof createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet
      >,
      observations: readonly AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt[]
    ): AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult | null => {
      const observationSet =
        observations.length === 0
          ? null
          : createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet(
              {
                operation,
                registrationRequestDigest:
                  transportReceiptSet.registrationRequestDigest,
                receipts: observations,
              }
            );
      const completedAt = laterInstant(
        ...transportReceiptSet.receipts.map(({ completedAt }) => completedAt),
        ...observations.map(({ observedAt }) => observedAt)
      );
      if (operation === 'delete') {
        const intentReceipt =
          transportReceiptSet.receipts[0] ?? responseInvalid();
        const projection =
          intentReceipt.outcome === 'completed'
            ? intentReceipt.responseProjection
            : observations[0];
        if (!projection || projection.resourceId === null) {
          return responseInvalid();
        }
        const outcome =
          'observationOutcome' in projection
            ? projection.observationOutcome
            : projection.outcome;
        if (outcome !== 'already-absent' && outcome !== 'deleted') {
          return responseInvalid();
        }
        return createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult(
          {
            operation: 'delete',
            providerResourceId: null,
            auxiliaryResourceIds: Object.freeze([]),
            resourceManifestDigest: null,
            resourceId: projection.resourceId,
            resourceRole: projection.resourceRole,
            reconciliationObservationReceiptSet: observationSet,
            reconciliationObservationReceiptSetDigest:
              observationSet?.setDigest ?? null,
            outcome,
            completedAt,
          }
        );
      }
      const projections = Object.freeze([
        ...transportReceiptSet.receipts
          .filter(({ outcome }) => outcome === 'completed')
          .map(({ responseProjection }) => responseProjection)
          .filter(
            (value): value is NonNullable<typeof value> => value !== null
          ),
        ...observations.filter(({ observationOutcome }) =>
          ['accepted', 'created', 'uploaded'].includes(observationOutcome)
        ),
      ]);
      const primaryIds = projections
        .filter(({ resourceRole }) => resourceRole === 'primary')
        .map(({ resourceId }) => resourceId)
        .filter((value): value is string => value !== null)
        .sort(compareUnicodeCodePoints);
      const auxiliaryIds = projections
        .filter(({ resourceRole }) => resourceRole === 'auxiliary')
        .map(({ resourceId }) => resourceId)
        .filter((value): value is string => value !== null)
        .sort(compareUnicodeCodePoints);
      const manifestDigests = projections
        .filter(
          ({ mutationKind }) =>
            mutationKind === 'upload-content' ||
            mutationKind === 'upload-content-finalize'
        )
        .map(({ resourceManifestDigest }) => resourceManifestDigest)
        .filter((value): value is string => value !== null)
        .sort(compareUnicodeCodePoints);
      const fullyObserved = transportReceiptSet.receipts.every(
        ({ outcome, receiptDigest }) =>
          outcome === 'completed' ||
          observations.some(
            ({ transportReceiptDigest }) =>
              transportReceiptDigest === receiptDigest
          )
      );
      const createdAndUploaded =
        fullyObserved &&
        transportReceiptSet.receipts.length ===
          (transportReceiptSet.receipts[0]?.protocolFamily ===
          'openai-responses'
            ? 2
            : 3) &&
        primaryIds.length === 1 &&
        manifestDigests.length === 1;
      if (
        !createdAndUploaded &&
        primaryIds.length + auxiliaryIds.length === 0
      ) {
        return null;
      }
      return createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult({
        operation: 'create',
        providerResourceId: primaryIds[0] ?? null,
        auxiliaryResourceIds: Object.freeze([...new Set(auxiliaryIds)]),
        resourceManifestDigest: manifestDigests[0] ?? null,
        resourceId: null,
        resourceRole: null,
        reconciliationObservationReceiptSet: observationSet,
        reconciliationObservationReceiptSetDigest:
          observationSet?.setDigest ?? null,
        outcome: createdAndUploaded
          ? 'created-and-uploaded'
          : 'partial-create-requires-cleanup',
        completedAt,
      });
    };

    const recoverCandidate = async (
      candidate: AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate
    ): Promise<boolean> => {
      const takeoverClaims: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[] =
        [];
      for (const intent of candidate.dispatchIntentSet.intents) {
        const priorClaim = candidate.dispatchStageClaimHistorySet.receipts
          .filter(
            ({ dispatchIntentDigest }) =>
              dispatchIntentDigest === intent.intentDigest
          )
          .at(-1);
        const requestedAt = instant(clock);
        if (
          priorClaim === undefined ||
          Date.parse(priorClaim.claimExpiresAt) > Date.parse(requestedAt)
        ) {
          return false;
        }
        const stageReceipt = await input.journalClient.stageDispatch(
          createAgentHostedRetrievalRuntimeResourceLifecycleStageRequest({
            purpose:
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_PURPOSE,
            dispatchIntent: intent,
            dispatchStageClaimRequest:
              createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
                {
                  purpose:
                    'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim',
                  dispatchIntentDigest: intent.intentDigest,
                  lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
                  expectedDispatchLedgerRevision:
                    priorClaim.dispatchLedgerRevision,
                  expectedDispatchGeneration: priorClaim.dispatchGeneration,
                  expectedPriorStageClaimReceiptDigest:
                    priorClaim.receiptDigest,
                  expectedPriorClaimExpiresAt: priorClaim.claimExpiresAt,
                  requestedAt,
                  minimumClaimExpiresAt: addMilliseconds(
                    requestedAt,
                    dispatchClaimLifetimeMs
                  ),
                }
              ),
          })
        );
        if (
          stageReceipt === undefined ||
          stageReceipt.dispatchStageClaimReceipt.deliveryDisposition !==
            'reconcile-only-replay'
        ) {
          return transportFailed();
        }
        takeoverClaims.push(stageReceipt.dispatchStageClaimReceipt);
      }
      const currentHistory =
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
          candidate.dispatchIntentSet,
          candidate.dispatchStageClaimHistorySet.initialClaimReceiptSet,
          Object.freeze([
            ...candidate.dispatchStageClaimHistorySet.receipts,
            ...takeoverClaims,
          ])
        );
      const selectedIntent =
        candidate.dispatchIntentSet.intents.at(-1) ?? responseInvalid();
      const selectedClaim =
        currentHistory.receipts
          .filter(
            ({ dispatchIntentDigest }) =>
              dispatchIntentDigest === selectedIntent.intentDigest
          )
          .at(-1) ?? responseInvalid();

      if (candidate.unfinishedState === 'staged-before-transport') {
        const conservativeReceipts = candidate.dispatchIntentSet.intents.map(
          (intent, index) =>
            createAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt(
              intent,
              candidate.dispatchStageClaimHistorySet.initialClaimReceiptSet
                .receipts[index] ?? responseInvalid(),
              currentHistory.receipts
                .filter(
                  ({ dispatchIntentDigest }) =>
                    dispatchIntentDigest === intent.intentDigest
                )
                .at(-1) ?? responseInvalid()
            )
        );
        const transportReceiptSet =
          createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(
            candidate.dispatchIntentSet,
            candidate.dispatchStageClaimHistorySet.initialClaimReceiptSet,
            conservativeReceipts
          );
        const businessResult =
          createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult({
            operation: candidate.dispatchIntentSet.operation,
            providerResourceId: null,
            auxiliaryResourceIds: Object.freeze([]),
            resourceManifestDigest: null,
            resourceId:
              candidate.dispatchIntentSet.operation === 'delete'
                ? selectedIntent.resourceId
                : null,
            resourceRole:
              candidate.dispatchIntentSet.operation === 'delete'
                ? selectedIntent.resourceRole
                : null,
            reconciliationObservationReceiptSet: null,
            reconciliationObservationReceiptSetDigest: null,
            outcome:
              candidate.dispatchIntentSet.operation === 'create'
                ? 'provider-outcome-unresolved'
                : 'already-absent',
            completedAt: selectedClaim.claimedAt,
          });
        const normalizedResponse = Object.freeze({
          format:
            'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-normalized-response',
          version: 1,
          operation: candidate.dispatchIntentSet.operation,
          registrationRequest: candidate.registrationRequest,
          businessResult,
          mutations: Object.freeze([]),
          receiptDigests: transportReceiptSet.receiptDigests,
        }) satisfies AgentJsonValue;
        const conservativeStored = await storeRecoveredTransport({
          lifecycleExpiresAt: selectedClaim.claimExpiresAt,
          dispatchIntentSet: candidate.dispatchIntentSet,
          dispatchStageClaimReceiptSet:
            candidate.dispatchStageClaimHistorySet.initialClaimReceiptSet,
          dispatchStageClaimHistorySet: currentHistory,
          transportReceiptSet,
          businessResult,
          normalizedResponse,
          priorTransportStoreReceiptHistory: null,
        });
        const observations = await reconcileUnknownReceipts({
          dispatchIntentSet: candidate.dispatchIntentSet,
          dispatchStageClaimHistorySet: currentHistory,
          transportReceiptSet,
          registrationRequestDigest:
            candidate.dispatchIntentSet.registrationRequestDigest,
        });
        if (observations === null) return false;
        const recoveredResult = recoveredBusinessResult(
          candidate.dispatchIntentSet.operation,
          transportReceiptSet,
          observations
        );
        if (recoveredResult === null) return false;
        const recoveredResponse = Object.freeze({
          ...normalizedResponse,
          businessResult: recoveredResult,
        }) satisfies AgentJsonValue;
        const stored = await storeRecoveredTransport({
          lifecycleExpiresAt: selectedClaim.claimExpiresAt,
          dispatchIntentSet: candidate.dispatchIntentSet,
          dispatchStageClaimReceiptSet:
            candidate.dispatchStageClaimHistorySet.initialClaimReceiptSet,
          dispatchStageClaimHistorySet: currentHistory,
          transportReceiptSet,
          businessResult: recoveredResult,
          normalizedResponse: recoveredResponse,
          priorTransportStoreReceiptHistory:
            conservativeStored.transportStoreReceiptHistory,
        });
        await sealStoredTransport(
          Object.freeze({
            request: candidate.registrationRequest,
            authorityDigest:
              candidate.dispatchIntentSet.intents[0]?.authorityDigest ?? null,
            lifecycleClaimReceiptDigest:
              candidate.dispatchIntentSet.lifecycleClaimReceiptDigest,
            lifecycleExpiresAt: selectedClaim.claimExpiresAt,
            operation: candidate.dispatchIntentSet.operation,
            resourceId: recoveredResult.resourceId,
            resourceRole: recoveredResult.resourceRole,
          }),
          stored
        );
        return true;
      }

      if (
        selectedClaim.priorTransportReceiptDigest === null ||
        candidate.spoolRef === null ||
        candidate.transportStoreReceiptDigest === null
      ) {
        return responseInvalid();
      }
      const requestedAt = instant(clock);
      const minimumReceiptExpiresAt = minimumInstant(
        selectedClaim.claimExpiresAt,
        addMilliseconds(requestedAt, 15_000)
      );
      if (Date.parse(minimumReceiptExpiresAt) <= Date.parse(requestedAt)) {
        return transportFailed();
      }
      const recovered = await input.journalClient.readTransportForRecovery(
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(
          {
            purpose:
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_PURPOSE,
            namespaceId: input.lifecycleScope.namespaceId,
            dispatchIntentDigest: selectedIntent.intentDigest,
            dispatchStageClaimReceiptDigest: selectedClaim.receiptDigest,
            expectedPriorTransportReceiptDigest:
              selectedClaim.priorTransportReceiptDigest,
            spoolRef: candidate.spoolRef,
            lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
            requestedAt,
            minimumReceiptExpiresAt,
          }
        )
      );
      if (
        recovered === undefined ||
        recovered.dispatchIntentSet.setDigest !==
          candidate.dispatchIntentSet.setDigest ||
        recovered.transportStoreReceipt.receiptDigest !==
          candidate.transportStoreReceiptDigest
      ) {
        return transportFailed();
      }
      return input.spoolCipher.useDecrypted(
        {
          envelope: recovered.spoolWriteEnvelope,
          envelopeAuthority: recovered.spoolEnvelopeAuthority,
        },
        recovered.spoolAad,
        async (value) => {
          if (
            !isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleNormalizedResponse(
              value
            ) ||
            value.registrationRequest.requestDigest !==
              recovered.dispatchIntentSet.registrationRequestDigest
          ) {
            return responseInvalid();
          }
          const observations = await reconcileUnknownReceipts({
            dispatchIntentSet: recovered.dispatchIntentSet,
            dispatchStageClaimHistorySet:
              recovered.currentDispatchStageClaimHistorySet,
            transportReceiptSet: recovered.transportReceiptSet,
            registrationRequestDigest:
              recovered.dispatchIntentSet.registrationRequestDigest,
          });
          if (observations === null) return false;
          const businessResult = recovered.transportReceiptSet.receipts.some(
            ({ outcome }) => outcome === 'post-dispatch-unknown'
          )
            ? recoveredBusinessResult(
                recovered.dispatchIntentSet.operation,
                recovered.transportReceiptSet,
                observations
              )
            : value.businessResult;
          if (businessResult === null) return false;
          const normalizedResponse = Object.freeze({
            ...value,
            businessResult,
          }) satisfies AgentJsonValue;
          const stored = await storeRecoveredTransport({
            lifecycleExpiresAt: recovered.spoolAad.lifecycleExpiresAt,
            dispatchIntentSet: recovered.dispatchIntentSet,
            dispatchStageClaimReceiptSet:
              recovered.dispatchStageClaimReceiptSet,
            dispatchStageClaimHistorySet:
              recovered.currentDispatchStageClaimHistorySet,
            transportReceiptSet: recovered.transportReceiptSet,
            businessResult,
            normalizedResponse,
            priorTransportStoreReceiptHistory:
              recovered.transportStoreReceiptHistory,
          });
          const context: LifecycleOperationContext = Object.freeze({
            request: value.registrationRequest,
            authorityDigest:
              recovered.dispatchIntentSet.intents[0]?.authorityDigest ?? null,
            lifecycleClaimReceiptDigest:
              recovered.dispatchIntentSet.lifecycleClaimReceiptDigest,
            lifecycleExpiresAt: recovered.spoolAad.lifecycleExpiresAt,
            operation: recovered.dispatchIntentSet.operation,
            resourceId: businessResult.resourceId,
            resourceRole: businessResult.resourceRole,
          });
          await sealStoredTransport(context, stored);
          return true;
        }
      );
    };

    const execute = async (
      context: LifecycleOperationContext,
      signal: AbortSignal
    ) => {
      if (closed || signal.aborted) return transportFailed();
      const sequence = createMutationSequence(context, signal, instant(clock));
      const intents: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent[] =
        [];
      const initialClaims: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[] =
        [];
      const claimHistory: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[] =
        [];
      const receipts: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt[] =
        [];
      const results: AgentEvaluationHostedRetrievalProviderResourceMutationResult[] =
        [];
      const restageStoredPrefix = async (): Promise<void> => {
        for (let index = 0; index < receipts.length - 1; index += 1) {
          const priorIntent = intents[index] ?? responseInvalid();
          const priorTransportReceipt = receipts[index] ?? responseInvalid();
          const priorClaim = claimHistory
            .filter(
              ({ dispatchIntentDigest }) =>
                dispatchIntentDigest === priorIntent.intentDigest
            )
            .at(-1);
          if (priorClaim === undefined) return responseInvalid();
          const requestedAt = instant(clock);
          const minimumClaimExpiresAt = minimumInstant(
            context.lifecycleExpiresAt,
            Date.parse(requestedAt) < Date.parse(priorClaim.claimExpiresAt)
              ? priorClaim.claimExpiresAt
              : addMilliseconds(requestedAt, dispatchClaimLifetimeMs)
          );
          if (Date.parse(minimumClaimExpiresAt) <= Date.parse(requestedAt)) {
            return transportFailed();
          }
          const restageReceipt = await failClosed(() =>
            input.journalClient.stageDispatch(
              createAgentHostedRetrievalRuntimeResourceLifecycleStageRequest({
                purpose:
                  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_PURPOSE,
                dispatchIntent: priorIntent,
                dispatchStageClaimRequest:
                  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
                    {
                      purpose:
                        'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim',
                      dispatchIntentDigest: priorIntent.intentDigest,
                      lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
                      expectedDispatchLedgerRevision:
                        priorClaim.dispatchLedgerRevision,
                      expectedDispatchGeneration: priorClaim.dispatchGeneration,
                      expectedPriorStageClaimReceiptDigest:
                        priorClaim.receiptDigest,
                      expectedPriorClaimExpiresAt: priorClaim.claimExpiresAt,
                      requestedAt,
                      minimumClaimExpiresAt,
                    }
                  ),
              })
            )
          );
          if (
            restageReceipt === undefined ||
            restageReceipt.dispatchStageClaimReceipt.deliveryDisposition !==
              'reconcile-only-replay' ||
            restageReceipt.dispatchStageClaimReceipt
              .priorTransportReceiptDigest !==
              priorTransportReceipt.receiptDigest
          ) {
            return transportFailed();
          }
          claimHistory.push(restageReceipt.dispatchStageClaimReceipt);
        }
      };
      let mutation: AgentEvaluationHostedRetrievalProviderResourceMutation | null =
        sequence.first();
      let stored: StoredTransport | undefined;
      while (mutation !== null) {
        const projection =
          projectAgentEvaluationHostedRetrievalProviderResourceMutation(
            mutation
          );
        const createdAt = instant(clock);
        const intent =
          createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent({
            intentId: `hosted-lifecycle-intent.${context.operation}.${context.request.requestDigest.slice(7, 39)}.${intents.length}`,
            lifecycleOwnerAuthorityIssuerId:
              AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_AUTHORITY_ISSUER_ID,
            lifecycleOwnerImplementationDigest:
              AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_IMPLEMENTATION_DIGEST,
            namespaceId: context.request.namespaceId,
            repositoryCommit: context.request.repositoryCommit,
            planDigest: context.request.planDigest,
            frozenRunDigest: context.request.frozenRunDigest,
            runConfigArtifactBindingDigest:
              context.request.runConfigArtifactBindingDigest,
            runtimeResourceSetId: context.request.runtimeResourceSetId,
            registrationIntentDigest: context.request.registrationIntentDigest,
            registrationRequestDigest: context.request.requestDigest,
            authorityDigest: context.authorityDigest,
            lifecycleClaimReceiptDigest: context.lifecycleClaimReceiptDigest,
            protocolFamily: context.request.protocolFamily,
            capabilityProfileId: context.request.capabilityProfileId,
            providerConfigurationId: context.request.providerConfigurationId,
            providerConfigurationDigest:
              context.request.providerConfigurationDigest,
            budgetReservationId:
              context.request.budgetReservationAuthority.reservationId,
            budgetReservationAuthorityDigest:
              context.request.budgetReservationAuthorityDigest,
            operation: context.operation,
            mutationKind: mutation.mutationKind,
            mutationSequence: intents.length,
            resourceId:
              mutation.mutationKind === 'delete-resource'
                ? mutation.resourceId
                : mutation.mutationKind === 'upload-content-start' ||
                    mutation.mutationKind === 'upload-content-finalize'
                  ? mutation.providerResourceId
                  : null,
            resourceRole:
              mutation.mutationKind === 'delete-resource'
                ? mutation.resourceRole
                : mutation.mutationKind === 'upload-content'
                  ? 'auxiliary'
                  : 'primary',
            endpointId: projection.endpointId,
            endpointClass: 'provider-hosted-retrieval-resource',
            method: projection.method as 'DELETE' | 'POST',
            requestProjectionDigest: projection.requestProjectionDigest,
            requestBodyDigest: projection.requestBodyDigest,
            requestBytes: projection.requestBytes,
            providerIdempotencyKeyBinding: 'dispatch-intent-digest',
            createdAt,
          });
        const minimumClaimExpiresAt = minimumInstant(
          context.lifecycleExpiresAt,
          addMilliseconds(createdAt, dispatchClaimLifetimeMs)
        );
        if (Date.parse(minimumClaimExpiresAt) <= Date.parse(createdAt)) {
          return transportFailed();
        }
        const claimRequest =
          createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
            {
              purpose:
                'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim',
              dispatchIntentDigest: intent.intentDigest,
              lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
              expectedDispatchLedgerRevision: 0,
              expectedDispatchGeneration: 0,
              expectedPriorStageClaimReceiptDigest: null,
              expectedPriorClaimExpiresAt: null,
              requestedAt: createdAt,
              minimumClaimExpiresAt,
            }
          );
        const stageReceipt = await failClosed(() =>
          input.journalClient.stageDispatch(
            createAgentHostedRetrievalRuntimeResourceLifecycleStageRequest({
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_PURPOSE,
              dispatchIntent: intent,
              dispatchStageClaimRequest: claimRequest,
            })
          )
        );
        if (
          stageReceipt === undefined ||
          stageReceipt.dispatchStageClaimReceipt.deliveryDisposition !==
            'dispatch-authorized-first-delivery' ||
          dispatched.has(intent.intentDigest)
        ) {
          return transportFailed();
        }
        const claim = stageReceipt.dispatchStageClaimReceipt;
        intents.push(intent);
        initialClaims.push(claim);
        claimHistory.push(claim);
        dispatched.add(intent.intentDigest);
        let result: AgentEvaluationHostedRetrievalProviderResourceMutationResult;
        const observedAt = instant(clock);
        const mutationLease = createClaimBoundMutationSignal({
          outerSignal: signal,
          claimExpiresAt: claim.claimExpiresAt,
          observedAt,
        });
        const authorizedMutation = Object.freeze({
          ...mutation,
          signal: mutationLease.signal,
        }) as AgentEvaluationHostedRetrievalProviderResourceMutation;
        try {
          result = await providerTransport.use(
            {
              protocolFamily: context.request.protocolFamily,
              providerConfigurationId: context.request.providerConfigurationId,
              secretRef:
                AGENT_EVALUATION_PROVIDER_DEFINITIONS[
                  context.request.protocolFamily
                ].secretRef,
              purpose: 'hosted-retrieval-resource-lifecycle',
              runtimeZone: 'server',
              useId: `hosted-lifecycle.${context.operation}.${intent.intentDigest.slice(7)}`,
            },
            (session) =>
              executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceMutation(
                session,
                {
                  dispatchIntent: intent,
                  dispatchStageClaimReceipt: claim,
                  observedAt,
                  mutation: authorizedMutation,
                }
              )
          );
        } catch {
          const completedAt = laterInstant(claim.claimedAt, instant(clock));
          const unknownProjection =
            createAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection(
              intent,
              {
                resourceId: intent.resourceId,
                resourceRole: intent.resourceRole,
                outcome: 'unknown',
                resourceManifestDigest: null,
                httpStatus: null,
              }
            );
          receipts.push(
            createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt(
              intent,
              claim,
              {
                receiptId: `hosted-lifecycle-transport.${intent.intentDigest.slice(7)}`,
                dispatchState: 'dispatched',
                responseProjection: unknownProjection,
                responseBodyDigest: null,
                responseBytes: 0,
                httpStatus: null,
                providerRequestId: null,
                outcome: 'post-dispatch-unknown',
                errorCategory: 'transport-failed',
                startedAt: claim.claimedAt,
                completedAt,
              }
            )
          );
          await restageStoredPrefix();
          await persistTransport(
            context,
            intents,
            initialClaims,
            claimHistory,
            receipts,
            results,
            false,
            stored?.transportStoreReceiptHistory.receipts ?? Object.freeze([])
          );
          return transportFailed();
        } finally {
          mutationLease.dispose();
        }
        const responseProjection =
          createAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection(
            intent,
            {
              resourceId: result.resourceId,
              resourceRole: result.resourceRole,
              outcome: result.outcome,
              resourceManifestDigest: manifestDigestFor(
                intent.mutationKind,
                result
              ),
              httpStatus: result.transport.status,
            }
          );
        const receipt =
          createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt(
            intent,
            claim,
            {
              receiptId: `hosted-lifecycle-transport.${intent.intentDigest.slice(7)}`,
              dispatchState: 'dispatched',
              responseProjection,
              responseBodyDigest: result.transport.responseBodyDigest,
              responseBytes: result.transport.responseBytes,
              httpStatus: result.transport.status,
              providerRequestId: result.transport.providerRequestId,
              outcome: 'completed',
              errorCategory: null,
              startedAt: result.transport.startedAt,
              completedAt: result.transport.completedAt,
            }
          );
        results.push(result);
        receipts.push(receipt);
        mutation = sequence.next(results);
        await restageStoredPrefix();
        stored = await persistTransport(
          context,
          intents,
          initialClaims,
          claimHistory,
          receipts,
          results,
          mutation === null,
          stored?.transportStoreReceiptHistory.receipts ?? Object.freeze([])
        );
      }
      if (stored === undefined) return responseInvalid();
      const archiveRecord = await sealStoredTransport(context, stored);
      return Object.freeze({
        stored,
        results: Object.freeze(results),
        receipts: Object.freeze(receipts),
        archiveRecord,
      });
    };

    const readSnapshot =
      async (): Promise<ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot> => {
        const intentDigests = new Set<string>();
        let overdueMutationCount = 0;
        let cursor: string | null = null;
        let pageCount = 0;
        do {
          const requestedAt = instant(clock);
          const page = await input.journalClient.listUnfinishedDispatches(
            createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(
              {
                purpose:
                  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_PURPOSE,
                ...input.lifecycleScope,
                lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
                pageSize: 8,
                cursor,
                requestedAt,
                minimumSnapshotExpiresAt: addMilliseconds(requestedAt, 60_000),
              }
            )
          );
          if (page === undefined) return transportFailed();
          for (const candidate of page.candidates) {
            for (const intent of candidate.dispatchIntentSet.intents) {
              if (intentDigests.has(intent.intentDigest)) continue;
              intentDigests.add(intent.intentDigest);
              const latestClaim =
                candidate.dispatchStageClaimHistorySet.receipts
                  .filter(
                    (claim) =>
                      claim.dispatchIntentDigest === intent.intentDigest
                  )
                  .at(-1);
              if (
                latestClaim !== undefined &&
                Date.parse(latestClaim.claimExpiresAt) <=
                  Date.parse(requestedAt)
              ) {
                overdueMutationCount += 1;
              }
            }
          }
          cursor = page.nextCursor;
          pageCount += 1;
          if (pageCount > 16) return responseInvalid();
        } while (cursor !== null);
        return Object.freeze({
          journalArchiveRecords: Object.freeze([...archiveRecords]),
          budgetClosureProjections: Object.freeze(
            archiveRecords
              .map(({ budgetClosureProjection }) => budgetClosureProjection)
              .filter(
                (
                  value
                ): value is NonNullable<
                  AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord['budgetClosureProjection']
                > => value !== null
              )
          ),
          unfinishedMutationCount: intentDigests.size,
          overdueMutationCount,
        });
      };

    const recoverUnfinished =
      async (): Promise<ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot> => {
        if (closed) return transportFailed();
        let cursor: string | null = null;
        let pageCount = 0;
        do {
          const requestedAt = instant(clock);
          const page = await input.journalClient.listUnfinishedDispatches(
            createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(
              {
                purpose:
                  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_PURPOSE,
                ...input.lifecycleScope,
                lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
                pageSize: 8,
                cursor,
                requestedAt,
                minimumSnapshotExpiresAt: addMilliseconds(requestedAt, 60_000),
              }
            )
          );
          if (page === undefined) return transportFailed();
          for (const candidate of page.candidates) {
            await recoverCandidate(candidate);
          }
          cursor = page.nextCursor;
          pageCount += 1;
          if (pageCount > 16) return responseInvalid();
        } while (cursor !== null);

        cursor = null;
        pageCount = 0;
        do {
          const requestedAt = instant(clock);
          const page = await input.journalClient.readArchive(
            createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest(
              {
                purpose:
                  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PURPOSE,
                ...input.lifecycleScope,
                lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
                pageSize: 8,
                cursor,
                requestedAt,
                minimumSnapshotExpiresAt: addMilliseconds(requestedAt, 60_000),
              }
            )
          );
          if (page === undefined) return transportFailed();
          for (const record of page.archiveRecords) {
            if (
              !archiveRecords.some(
                ({ archiveRecordDigest }) =>
                  archiveRecordDigest === record.archiveRecordDigest
              )
            ) {
              archiveRecords.push(record);
            }
          }
          cursor = page.nextCursor;
          pageCount += 1;
          if (pageCount > 16) return responseInvalid();
        } while (cursor !== null);
        archiveRecords.sort((left, right) =>
          compareUnicodeCodePoints(
            left.archiveRecordDigest,
            right.archiveRecordDigest
          )
        );
        return readSnapshot();
      };

    return Object.freeze({
      recoverUnfinished,
      async createResource({ request, program, material, signal }) {
        const expected = publicMaterialFor(request);
        if (
          expected.program.programDigest !== program.programDigest ||
          expected.material.descriptor.descriptorDigest !==
            material.descriptor.descriptorDigest
        ) {
          return invalid();
        }
        const completed = await execute(
          operationContextForCreate(request),
          signal
        );
        const providerResourceId =
          completed.stored.businessResult.providerResourceId ??
          responseInvalid();
        const auxiliaryResourceIds =
          completed.stored.businessResult.auxiliaryResourceIds;
        const resourceManifestDigest =
          completed.stored.businessResult.resourceManifestDigest ??
          responseInvalid();
        const uploadReceipt = completed.receipts.find(
          ({ responseProjection }) =>
            ['upload-content', 'upload-content-finalize'].includes(
              responseProjection?.mutationKind ?? ''
            )
        );
        if (uploadReceipt === undefined) return responseInvalid();
        return Object.freeze({
          providerResourceId,
          auxiliaryResourceIds,
          resourceManifestDigest,
          contentUploadReceiptDigest: uploadReceipt.receiptDigest,
          creationDispatchIntentSetDigest:
            completed.stored.dispatchIntentSet.setDigest,
          creationTransportReceiptSetDigest:
            completed.stored.transportReceiptSet.setDigest,
          creationResultSpoolReceiptSetDigest: digestAgentCanonicalValue(
            Object.freeze([completed.stored.spoolReceipt.receiptDigest])
          ),
        }) satisfies AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence;
      },
      async deleteResource({ claimReceipt, resourceId, resourceRole, signal }) {
        const completed = await execute(
          operationContextForDelete(claimReceipt, resourceId, resourceRole),
          signal
        );
        const receipt = completed.receipts[0] ?? responseInvalid();
        const result = completed.results[0] ?? responseInvalid();
        return createAgentHostedRetrievalRuntimeResourceCleanupResourceResult({
          resourceId,
          resourceRole,
          outcome:
            result.outcome === 'already-absent' ? 'already-absent' : 'deleted',
          cleanupClaimAuthorityReceiptDigest:
            claimReceipt.cleanupClaimAuthorityReceiptDigest,
          dispatchIntentDigest: receipt.dispatchIntentDigest,
          transportReceiptDigest: receipt.receiptDigest,
          resultSpoolReceiptDigest: completed.stored.spoolReceipt.receiptDigest,
          resultSpoolDispositionReceiptDigest:
            completed.archiveRecord.journalRecord
              .resultSpoolDispositionReceiptDigest,
          dispatchCreatedAt:
            completed.stored.dispatchIntentSet.intents[0]!.createdAt,
          completedAt: receipt.completedAt,
        }) satisfies AgentEvaluationHostedRetrievalRuntimeResourceDeletionEvidence;
      },
      snapshot: readSnapshot,
      async close() {
        closed = true;
        return providerTransport.close();
      },
    });
  };
