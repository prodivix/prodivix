import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
  createAgentCapabilityProbeProgram,
  createAgentHostedRetrievalRuntimeResourceAuthority,
  createAgentHostedRetrievalRuntimeResourceAuthoritySet,
  createAgentHostedRetrievalRuntimeResourceCleanupReceipt,
  createAgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
  createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt,
  createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection,
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
  createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  createAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest,
  createAgentHostedRetrievalRuntimeResourceRecoveryScanRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationResult,
  createAgentHostedRetrievalRuntimeResourceSetCommitment,
  createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
  deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  isAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  matchAgentHostedRetrievalRuntimeResourceBudgetReservationPlan,
  matchAgentHostedRetrievalRuntimeResourceSetCommitment,
  planAgentModelEvaluationAttempts,
  resolveAgentCapabilityProbePublicResource,
  validateAgentModelEvaluationPlan,
  type AgentCapabilityProbeProgram,
  type AgentCapabilityProbePublicResourceMaterial,
  type AgentHostedRetrievalRuntimeResourceAuthoritySet,
  type AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  type AgentHostedRetrievalRuntimeResourceCleanupReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
  type AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  type AgentHostedRetrievalRuntimeResourceRecoveryCursor,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentHostedRetrievalRuntimeResourceRegistrationRequest,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient,
  AgentEvaluationHostedRetrievalRuntimeResourcePrepareClient,
  AgentEvaluationHostedRetrievalRuntimeResourceRecoveryClient,
} from './hostedRetrievalRuntimeResourceLifecycleClient';
import type {
  AgentEvaluationHostedRetrievalRuntimeResourceProvider,
  AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence,
} from './hostedRetrievalRuntimeResourceProvider';
import type { ProductionAgentEvaluationFrozenRunConfigBinding } from './productionSignerFactory';

const fail = (
  code: (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES]
): never => {
  throw new AgentEvaluationRunnerError(code);
};

const invalid = (): never =>
  fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);

const transportFailed = (): never =>
  fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed);

const responseInvalid = (): never =>
  fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);

const instant = (clock: () => Date): Instant => {
  const value = clock();
  return Number.isFinite(value.getTime())
    ? (value.toISOString() as Instant)
    : invalid();
};

const addMilliseconds = (value: Instant, milliseconds: number): Instant => {
  const result = Date.parse(value) + milliseconds;
  return Number.isSafeInteger(result)
    ? (new Date(result).toISOString() as Instant)
    : invalid();
};

const registrationKey = (
  value:
    | AgentHostedRetrievalRuntimeResourceRegistrationIntent
    | AgentHostedRetrievalRuntimeResourceRegistrationRequest
    | AgentHostedRetrievalRuntimeResourceRegistrationResult
): string => {
  const source = 'authority' in value ? value.authority : value;
  return `${source.protocolFamily}\u0000${source.capabilityProfileId}`;
};

const exactReplay = async <T>(
  operation: () => Promise<T | undefined>
): Promise<T> => {
  try {
    const first = await operation();
    if (first !== undefined) return first;
    return responseInvalid();
  } catch (caught) {
    if (
      caught instanceof AgentEvaluationRunnerError &&
      caught.code !== AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
    ) {
      throw caught;
    }
  }
  try {
    const replay = await operation();
    return replay ?? responseInvalid();
  } catch (caught) {
    if (
      caught instanceof AgentEvaluationRunnerError &&
      caught.code !== AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
    ) {
      throw caught;
    }
    return transportFailed();
  }
};

export const createAgentEvaluationHostedRetrievalRuntimeResourceSetId = (
  input: Readonly<{
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
  }>
): string => {
  if (
    ![
      input.planDigest,
      input.frozenRunDigest,
      input.runConfigArtifactBindingDigest,
    ].every(isAgentCanonicalDigest)
  ) {
    return invalid();
  }
  return `hosted-runtime-set.${digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-set-id',
    version: 1,
    ...input,
  }).slice('sha256-'.length)}`;
};

export const createAgentEvaluationHostedRetrievalRuntimeResourceBudgetReservationId =
  (
    input: Readonly<{
      planDigest: CanonicalDigest;
      runtimeResourceSetId: string;
      registrationIntentDigest: CanonicalDigest;
    }>
  ): string => {
    if (
      !isAgentCanonicalDigest(input.planDigest) ||
      !isAgentControlIdentity(input.runtimeResourceSetId) ||
      !isAgentCanonicalDigest(input.registrationIntentDigest)
    ) {
      return invalid();
    }
    return `hosted-runtime-budget.${digestAgentCanonicalValue({
      format:
        'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-budget-reservation-id',
      version: 1,
      ...input,
    }).slice('sha256-'.length)}`;
  };

type RegistrationContext = Readonly<{
  intent: AgentHostedRetrievalRuntimeResourceRegistrationIntent;
  program: AgentCapabilityProbeProgram;
  material: AgentCapabilityProbePublicResourceMaterial;
}>;

export const deriveAgentEvaluationHostedRetrievalRuntimeResourceRegistrationContexts =
  (plan: AgentModelEvaluationPlan): readonly RegistrationContext[] => {
    if (validateAgentModelEvaluationPlan(plan).length > 0) return invalid();
    const contexts = plan.capabilityQualificationTargets.flatMap((target) => {
      const source =
        target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
      if (
        source?.capabilityId !== 'provider.hosted-retrieval' ||
        source.sourceKind !== 'sealed-hosted-owner-result' ||
        (source.protocolFamily !== 'openai-responses' &&
          source.protocolFamily !== 'gemini-interactions') ||
        (source.capabilityProfileId !== 'g4-provider-hosted-retrieval-core' &&
          source.capabilityProfileId !==
            'g4-provider-hosted-retrieval-document') ||
        !source.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      ) {
        return [];
      }
      const program = createAgentCapabilityProbeProgram({
        capabilityProfileId: source.capabilityProfileId,
        capabilityProfileDigest: source.capabilityProfileDigest,
      });
      const material = resolveAgentCapabilityProbePublicResource(program);
      if (!material) return invalid();
      const intent =
        createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
          providerConfigurationId: source.providerConfigurationId,
          providerConfigurationDigest: target.providerIdentityDigest,
          protocolFamily: source.protocolFamily,
          modelId: source.modelId,
          modelLineageDigest: source.modelLineageDigest,
          adapterDigest: source.adapterDigest,
          capabilityProfileId: source.capabilityProfileId,
          capabilityProfileDigest: source.capabilityProfileDigest,
          probeProgramDigest: program.programDigest,
          publicResourceDescriptorDigest: material.descriptor.descriptorDigest,
        });
      if (
        intent.intentDigest !==
          source.hostedRetrievalRuntimeResourceRegistrationIntentDigest ||
        intent.providerConfigurationId !== target.providerConfigurationId ||
        intent.modelId !== target.modelId ||
        intent.modelLineageDigest !== target.modelLineageDigest
      ) {
        return invalid();
      }
      return [Object.freeze({ intent, program, material })];
    });
    const canonical = Object.freeze(
      [...contexts].sort((left, right) =>
        compareUnicodeCodePoints(
          registrationKey(left.intent),
          registrationKey(right.intent)
        )
      )
    );
    if (
      canonical.length !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      new Set(canonical.map(({ intent }) => registrationKey(intent))).size !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
    ) {
      return invalid();
    }
    return canonical;
  };

export type AgentEvaluationHostedRetrievalRuntimeResourceBudgetAuthoritySource =
  Readonly<{
    reserve(
      input: Readonly<{
        plan: AgentModelEvaluationPlan;
        runtimeResourceSetId: string;
        registrationIntent: AgentHostedRetrievalRuntimeResourceRegistrationIntent;
        reservationId: string;
      }>
    ): Promise<
      AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority | undefined
    >;
  }>;

export type AgentEvaluationHostedRetrievalRuntimeResourcePreparedSet =
  Readonly<{
    registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[];
    authoritySet: AgentHostedRetrievalRuntimeResourceAuthoritySet;
    resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
  }>;

export type CreateProductionAgentEvaluationHostedRetrievalRuntimeResourcePrepareOwnerInput =
  Readonly<{
    namespaceId: string;
    plan: AgentModelEvaluationPlan;
    frozenBinding: ProductionAgentEvaluationFrozenRunConfigBinding;
    client: AgentEvaluationHostedRetrievalRuntimeResourcePrepareClient;
    budgetAuthorities: AgentEvaluationHostedRetrievalRuntimeResourceBudgetAuthoritySource;
    provider: AgentEvaluationHostedRetrievalRuntimeResourceProvider;
    clock?: () => Date;
  }>;

const createRegistrationResult = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest,
  evidence: AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence,
  registeredAt: Instant
): AgentHostedRetrievalRuntimeResourceRegistrationResult => {
  const deletionRequestProjection =
    createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection({
      registrationRequestDigest: request.requestDigest,
      runtimeResourceSetId: request.runtimeResourceSetId,
      protocolFamily: request.protocolFamily,
      providerResourceId: evidence.providerResourceId,
      auxiliaryResourceIds: evidence.auxiliaryResourceIds,
    });
  const deletionAuthorityReceipt =
    createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt({
      registrationRequest: request,
      resourceManifestDigest: evidence.resourceManifestDigest,
      deletionRequestProjection,
      registeredAt,
      expiresAt: request.minimumExpiresAt,
    });
  const authority = createAgentHostedRetrievalRuntimeResourceAuthority(
    request,
    {
      ...evidence,
      deletionAuthorityReceipt,
      registeredAt,
      expiresAt: request.minimumExpiresAt,
    }
  );
  return createAgentHostedRetrievalRuntimeResourceRegistrationResult(
    request,
    authority,
    deletionAuthorityReceipt
  );
};

export const createProductionAgentEvaluationHostedRetrievalRuntimeResourcePrepareOwner =
  (
    input: CreateProductionAgentEvaluationHostedRetrievalRuntimeResourcePrepareOwnerInput
  ) => {
    if (
      !isAgentControlIdentity(input.namespaceId) ||
      validateAgentModelEvaluationPlan(input.plan).length > 0 ||
      !sameCanonicalJson(input.frozenBinding.config.plan, input.plan) ||
      input.frozenBinding.config.frozenRunDigest !==
        input.frozenBinding.artifactBinding.frozenRunDigest ||
      input.frozenBinding.artifactBinding.planDigest !==
        input.plan.planDigest ||
      input.frozenBinding.artifactBinding.repositoryCommit !==
        input.plan.repositoryCommit ||
      typeof input.client?.stageRegistration !== 'function' ||
      typeof input.client.storeRegistrationResult !== 'function' ||
      typeof input.budgetAuthorities?.reserve !== 'function' ||
      typeof input.provider?.createResource !== 'function' ||
      typeof input.provider.close !== 'function'
    ) {
      return invalid();
    }
    const clock = input.clock ?? (() => new Date());
    const contexts =
      deriveAgentEvaluationHostedRetrievalRuntimeResourceRegistrationContexts(
        input.plan
      );
    const runtimeResourceSetId =
      createAgentEvaluationHostedRetrievalRuntimeResourceSetId({
        planDigest: input.plan.planDigest,
        frozenRunDigest: input.frozenBinding.config.frozenRunDigest,
        runConfigArtifactBindingDigest:
          input.frozenBinding.artifactBinding.bindingDigest,
      });
    let closed = false;
    let active = 0;
    let closePromise:
      | ReturnType<
          AgentEvaluationHostedRetrievalRuntimeResourceProvider['close']
        >
      | undefined;

    const prepare = async (
      signal: AbortSignal = new AbortController().signal
    ): Promise<AgentEvaluationHostedRetrievalRuntimeResourcePreparedSet> => {
      if (closed || signal.aborted) return transportFailed();
      active += 1;
      try {
        const requests: Array<
          Readonly<{
            request: AgentHostedRetrievalRuntimeResourceRegistrationRequest;
            context: RegistrationContext;
          }>
        > = [];
        for (const context of contexts) {
          const reservationId =
            createAgentEvaluationHostedRetrievalRuntimeResourceBudgetReservationId(
              {
                planDigest: input.plan.planDigest,
                runtimeResourceSetId,
                registrationIntentDigest: context.intent.intentDigest,
              }
            );
          const budgetReservationAuthority =
            await input.budgetAuthorities.reserve({
              plan: input.plan,
              runtimeResourceSetId,
              registrationIntent: context.intent,
              reservationId,
            });
          if (
            !budgetReservationAuthority ||
            !isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(
              budgetReservationAuthority
            ) ||
            budgetReservationAuthority.reservationId !== reservationId ||
            !matchAgentHostedRetrievalRuntimeResourceBudgetReservationPlan(
              budgetReservationAuthority,
              {
                namespaceId: input.namespaceId,
                planDigest: input.plan.planDigest,
                reservePolicyDigest: input.plan.budget.reservePolicyDigest,
                budgetDigest: input.plan.budget.budgetDigest,
              }
            )
          ) {
            return invalid();
          }
          const networkPolicyAuthority =
            createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority({
              namespaceId: input.namespaceId,
              repositoryCommit: input.plan.repositoryCommit,
              planDigest: input.plan.planDigest,
              frozenRunDigest: input.frozenBinding.config.frozenRunDigest,
              runConfigArtifactBindingDigest:
                input.frozenBinding.artifactBinding.bindingDigest,
              providerConfigurationId: context.intent.providerConfigurationId,
              providerConfigurationDigest:
                context.intent.providerConfigurationDigest,
              protocolFamily: context.intent.protocolFamily,
            });
          const request =
            createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
              namespaceId: input.namespaceId,
              repositoryCommit: input.plan.repositoryCommit,
              planDigest: input.plan.planDigest,
              frozenRunDigest: input.frozenBinding.config.frozenRunDigest,
              runConfigArtifactBindingDigest:
                input.frozenBinding.artifactBinding.bindingDigest,
              runtimeResourceSetId,
              registrationIntent: context.intent,
              registrationIntentDigest: context.intent.intentDigest,
              providerConfigurationId: context.intent.providerConfigurationId,
              providerConfigurationDigest:
                context.intent.providerConfigurationDigest,
              protocolFamily: context.intent.protocolFamily,
              modelId: context.intent.modelId,
              modelLineageDigest: context.intent.modelLineageDigest,
              adapterDigest: context.intent.adapterDigest,
              capabilityProfileId: context.intent.capabilityProfileId,
              capabilityProfileDigest: context.intent.capabilityProfileDigest,
              probeProgramDigest: context.intent.probeProgramDigest,
              publicResourceDescriptorDigest:
                context.intent.publicResourceDescriptorDigest,
              budgetReservationAuthority,
              budgetReservationAuthorityDigest:
                budgetReservationAuthority.authorityDigest,
              networkPolicyAuthority,
              networkPolicyAuthorityDigest:
                networkPolicyAuthority.authorityDigest,
              minimumExpiresAt: input.plan.expiresAt,
            });
          requests.push(Object.freeze({ request, context }));
        }
        const registrationResults: AgentHostedRetrievalRuntimeResourceRegistrationResult[] =
          [];
        for (const { request, context } of requests) {
          const staged = await exactReplay(() =>
            input.client.stageRegistration(request)
          );
          if (!sameCanonicalJson(staged, request)) return responseInvalid();
          const evidence = await input.provider.createResource({
            request,
            program: context.program,
            material: context.material,
            signal,
          });
          const result = createRegistrationResult(
            request,
            evidence,
            instant(clock)
          );
          const persisted = await exactReplay(() =>
            input.client.storeRegistrationResult(result)
          );
          if (!sameCanonicalJson(persisted, result)) return responseInvalid();
          registrationResults.push(result);
        }
        const canonicalResults = Object.freeze(
          registrationResults.sort((left, right) =>
            compareUnicodeCodePoints(
              registrationKey(left),
              registrationKey(right)
            )
          )
        );
        const authoritySet =
          createAgentHostedRetrievalRuntimeResourceAuthoritySet({
            planDigest: input.plan.planDigest,
            frozenRunDigest: input.frozenBinding.config.frozenRunDigest,
            runConfigArtifactBindingDigest:
              input.frozenBinding.artifactBinding.bindingDigest,
            runtimeResourceSetId,
            authorities: canonicalResults.map(({ authority }) => authority),
          });
        return Object.freeze({
          registrationResults: canonicalResults,
          authoritySet,
          resourceSetCommitment:
            createAgentHostedRetrievalRuntimeResourceSetCommitment(
              authoritySet
            ),
        });
      } finally {
        active -= 1;
      }
    };

    const close = (): ReturnType<
      AgentEvaluationHostedRetrievalRuntimeResourceProvider['close']
    > => {
      closePromise ??= (async () => {
        closed = true;
        while (active > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        const receipt = await input.provider.close();
        if (
          receipt.status !== 'clean' ||
          !Number.isSafeInteger(receipt.acceptedSessionCount) ||
          receipt.acceptedSessionCount < 0 ||
          receipt.completedSessionCount !== receipt.acceptedSessionCount ||
          receipt.inFlightSessionCount !== 0 ||
          !isAgentControlInstant(receipt.closedAt) ||
          !isAgentCanonicalDigest(receipt.receiptDigest)
        ) {
          return transportFailed();
        }
        return receipt;
      })();
      return closePromise;
    };

    return Object.freeze({ runtimeResourceSetId, prepare, close });
  };

export type AgentEvaluationHostedRetrievalRuntimeResourceStoredSet = Readonly<{
  registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[];
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
}>;

const validateStoredSet = (
  value: AgentEvaluationHostedRetrievalRuntimeResourceStoredSet
): AgentEvaluationHostedRetrievalRuntimeResourceStoredSet => {
  if (
    value.registrationResults.length !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
    value.registrationResults.some(
      (result) =>
        !isAgentHostedRetrievalRuntimeResourceRegistrationResult(result)
    )
  ) {
    return invalid();
  }
  const first = value.registrationResults[0]!;
  const authoritySet = createAgentHostedRetrievalRuntimeResourceAuthoritySet({
    planDigest: first.authority.planDigest,
    frozenRunDigest: first.authority.frozenRunDigest,
    runConfigArtifactBindingDigest:
      first.authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: first.authority.runtimeResourceSetId,
    authorities: value.registrationResults.map(({ authority }) => authority),
  });
  if (
    !matchAgentHostedRetrievalRuntimeResourceSetCommitment(
      value.resourceSetCommitment,
      authoritySet
    )
  ) {
    return invalid();
  }
  return Object.freeze({
    registrationResults: Object.freeze(
      [...value.registrationResults].sort((left, right) =>
        compareUnicodeCodePoints(registrationKey(left), registrationKey(right))
      )
    ),
    resourceSetCommitment: value.resourceSetCommitment,
  });
};

type CleanupExecutionDependencies = Readonly<{
  provider: AgentEvaluationHostedRetrievalRuntimeResourceProvider;
  clock: () => Date;
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}>;

const waitForDeletionFence = async (
  claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  dependencies: CleanupExecutionDependencies,
  signal: AbortSignal
): Promise<void> => {
  const now = instant(dependencies.clock);
  const delay =
    Date.parse(claimReceipt.cleanupRequest.deletionNotBefore) - Date.parse(now);
  if (delay <= 0) return;
  if (
    delay >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS ||
    Date.parse(claimReceipt.cleanupRequest.deletionNotBefore) >=
      Date.parse(claimReceipt.claimExpiresAt)
  ) {
    return transportFailed();
  }
  await dependencies.wait(delay, signal);
};

const executeProviderCleanup = async (
  claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  dependencies: CleanupExecutionDependencies,
  signal: AbortSignal
): Promise<AgentHostedRetrievalRuntimeResourceCleanupReceipt> => {
  await waitForDeletionFence(claimReceipt, dependencies, signal);
  const authority = claimReceipt.registrationResult.authority;
  const resourceIds = Object.freeze(
    [...authority.auxiliaryResourceIds, authority.providerResourceId].sort(
      compareUnicodeCodePoints
    )
  );
  const resourceResults = [];
  for (const resourceId of resourceIds) {
    const resourceRole =
      resourceId === authority.providerResourceId
        ? ('primary' as const)
        : ('auxiliary' as const);
    const evidence = await dependencies.provider.deleteResource({
      claimReceipt,
      resourceId,
      resourceRole,
      signal,
    });
    resourceResults.push(
      createAgentHostedRetrievalRuntimeResourceCleanupResourceResult({
        ...evidence,
        resourceId,
        resourceRole,
        cleanupClaimAuthorityReceiptDigest:
          claimReceipt.cleanupClaimAuthorityReceiptDigest,
      })
    );
  }
  return createAgentHostedRetrievalRuntimeResourceCleanupReceipt(
    claimReceipt.cleanupRequest,
    claimReceipt.registrationResult,
    claimReceipt.resourceSetCommitment,
    claimReceipt.cleanupClaimAuthorityReceipt,
    claimReceipt.storedPriorActiveState,
    claimReceipt.readLeaseLedgerRoot,
    claimReceipt.storedRunTerminalFence,
    claimReceipt.overdueReceipt,
    resourceResults
  );
};

const persistCleanupReceipt = async (
  client:
    | AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient
    | AgentEvaluationHostedRetrievalRuntimeResourceRecoveryClient,
  claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  cleanupReceipt: AgentHostedRetrievalRuntimeResourceCleanupReceipt,
  clock: () => Date
): Promise<AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt> => {
  let stored = false;
  try {
    stored =
      (await client.storeCleanupReceipt(cleanupReceipt, claimReceipt)) !==
      undefined;
  } catch {
    stored = false;
  }
  const read = async () => {
    const request =
      createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest({
        namespaceId:
          claimReceipt.registrationResult.registrationRequest.namespaceId,
        purpose:
          claimReceipt.claimSource === 'post-matrix'
            ? AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readPostMatrixCleanupResult
            : AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readCleanupResult,
        authorityDigest: claimReceipt.registrationResult.authorityDigest,
        cleanupRequestDigest: claimReceipt.cleanupRequest.requestDigest,
        recoveryClaimReceiptDigest: claimReceipt.receiptDigest,
        requestedAt: instant(clock),
      });
    return client.readCleanupResult(request, claimReceipt);
  };
  if (!stored) {
    try {
      const observed = await read();
      if (observed?.status === 'cleaned') return observed;
    } catch {
      // Exact replay below handles both request loss and response ACK loss.
    }
    const replayed = await exactReplay(() =>
      client.storeCleanupReceipt(cleanupReceipt, claimReceipt)
    );
    if (!sameCanonicalJson(replayed, cleanupReceipt)) return responseInvalid();
  }
  const terminal = await exactReplay(read);
  return isAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
    terminal
  ) &&
    terminal.status === 'cleaned' &&
    terminal.residualProviderResourceIds?.length === 0 &&
    sameCanonicalJson(terminal.cleanupReceipt, cleanupReceipt)
    ? terminal
    : responseInvalid();
};

export type CreateProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupOwnerInput =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    cleanupOwnerInstanceId: string;
    client: AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient;
    provider: AgentEvaluationHostedRetrievalRuntimeResourceProvider;
    clock?: () => Date;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    minimumClaimLifetimeMs?: number;
  }>;

export const createProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupOwner =
  (
    input: CreateProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupOwnerInput
  ) => {
    const minimumClaimLifetimeMs = input.minimumClaimLifetimeMs ?? 300_000;
    if (
      !isAgentControlIdentity(input.namespaceId) ||
      !/^[0-9a-f]{40}$/u.test(input.repositoryCommit) ||
      !isAgentControlIdentity(input.cleanupOwnerInstanceId) ||
      !Number.isSafeInteger(minimumClaimLifetimeMs) ||
      minimumClaimLifetimeMs < 1 ||
      minimumClaimLifetimeMs >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS ||
      typeof input.client?.deriveTerminalFence !== 'function' ||
      typeof input.client.claimPostMatrixCleanup !== 'function' ||
      typeof input.client.storeCleanupReceipt !== 'function' ||
      typeof input.client.readCleanupResult !== 'function' ||
      typeof input.provider?.deleteResource !== 'function'
    ) {
      return invalid();
    }
    const clock = input.clock ?? (() => new Date());
    const wait =
      input.wait ??
      ((milliseconds: number, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, milliseconds);
          const abort = () => {
            clearTimeout(timeout);
            reject(
              new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
              )
            );
          };
          signal.addEventListener('abort', abort, { once: true });
        }));

    const cleanup = async (
      storedSetInput: AgentEvaluationHostedRetrievalRuntimeResourceStoredSet,
      expectedShardIdsInput: readonly string[],
      signal: AbortSignal = new AbortController().signal
    ) => {
      if (signal.aborted) return transportFailed();
      const storedSet = validateStoredSet(storedSetInput);
      const first = storedSet.registrationResults[0]!;
      if (
        first.registrationRequest.namespaceId !== input.namespaceId ||
        first.registrationRequest.repositoryCommit !== input.repositoryCommit
      ) {
        return invalid();
      }
      const expectedShardIds = Object.freeze(
        [...expectedShardIdsInput].sort(compareUnicodeCodePoints)
      );
      if (
        expectedShardIds.length < 1 ||
        new Set(expectedShardIds).size !== expectedShardIds.length ||
        expectedShardIds.some((value) => !isAgentControlIdentity(value))
      ) {
        return invalid();
      }
      const requestedAt = instant(clock);
      const deriveRequest =
        createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest({
          namespaceId: input.namespaceId,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.deriveTerminalFence,
          repositoryCommit: input.repositoryCommit,
          planDigest: first.authority.planDigest,
          frozenRunDigest: first.authority.frozenRunDigest,
          runConfigArtifactBindingDigest:
            first.authority.runConfigArtifactBindingDigest,
          runtimeResourceSetId: first.authority.runtimeResourceSetId,
          resourceSetCommitmentDigest:
            storedSet.resourceSetCommitment.commitmentDigest,
          expectedShardCount: expectedShardIds.length,
          expectedShardIdSetDigest:
            deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest(
              expectedShardIds
            ),
          requestedAt,
        });
      const deriveReceipt = await exactReplay(() =>
        input.client.deriveTerminalFence(deriveRequest)
      );
      const terminalResults = [];
      for (const registrationResult of storedSet.registrationResults) {
        const claimedAt = instant(clock);
        const claimRequest =
          createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest(
            {
              namespaceId: input.namespaceId,
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimPostMatrixCleanup,
              repositoryCommit: input.repositoryCommit,
              planDigest: registrationResult.authority.planDigest,
              frozenRunDigest: registrationResult.authority.frozenRunDigest,
              runConfigArtifactBindingDigest:
                registrationResult.authority.runConfigArtifactBindingDigest,
              runtimeResourceSetId:
                registrationResult.authority.runtimeResourceSetId,
              authorityDigest: registrationResult.authorityDigest,
              resourceSetCommitmentDigest:
                storedSet.resourceSetCommitment.commitmentDigest,
              terminalFenceDeriveReceipt: deriveReceipt,
              cleanupOwnerInstanceId: input.cleanupOwnerInstanceId,
              claimedAt,
              minimumClaimExpiresAt: addMilliseconds(
                claimedAt,
                minimumClaimLifetimeMs
              ),
            }
          );
        const claimReceipt = await exactReplay(() =>
          input.client.claimPostMatrixCleanup(claimRequest)
        );
        const cleanupReceipt = await executeProviderCleanup(
          claimReceipt,
          { provider: input.provider, clock, wait },
          signal
        );
        terminalResults.push(
          await persistCleanupReceipt(
            input.client,
            claimReceipt,
            cleanupReceipt,
            clock
          )
        );
      }
      return Object.freeze(terminalResults);
    };

    return Object.freeze({ cleanup });
  };

export type CreateProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryOwnerInput =
  Readonly<{
    namespaceId: string;
    cleanupOwnerInstanceId: string;
    client: AgentEvaluationHostedRetrievalRuntimeResourceRecoveryClient;
    provider: AgentEvaluationHostedRetrievalRuntimeResourceProvider;
    clock?: () => Date;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  }>;

export const createProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryOwner =
  (
    input: CreateProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryOwnerInput
  ) => {
    if (
      !isAgentControlIdentity(input.namespaceId) ||
      !isAgentControlIdentity(input.cleanupOwnerInstanceId) ||
      typeof input.client?.listRecoveryCandidates !== 'function' ||
      typeof input.client.claimRecoveryCleanup !== 'function' ||
      typeof input.client.storeCleanupReceipt !== 'function' ||
      typeof input.client.readCleanupResult !== 'function' ||
      typeof input.provider?.deleteResource !== 'function'
    ) {
      return invalid();
    }
    const clock = input.clock ?? (() => new Date());
    const wait = input.wait ?? (async () => undefined);
    const recoverPage = async (
      cursor: AgentHostedRetrievalRuntimeResourceRecoveryCursor | null = null,
      signal: AbortSignal = new AbortController().signal
    ) => {
      const scanRequest =
        createAgentHostedRetrievalRuntimeResourceRecoveryScanRequest({
          namespaceId: input.namespaceId,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.listRecovery,
          pageSize: 64,
          cursor,
          requestedAt: instant(clock),
        });
      const page = await exactReplay(() =>
        input.client.listRecoveryCandidates(scanRequest)
      );
      const terminalResults = [];
      for (const candidate of page.candidates) {
        const claimRequest =
          createAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest(page, {
            namespaceId: input.namespaceId,
            purpose:
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimCleanup,
            candidate,
            expectedActiveStateDigest: candidate.activeStateDigest,
            cleanupOwnerInstanceId: input.cleanupOwnerInstanceId,
            claimedAt: instant(clock),
          });
        const claimReceipt = await exactReplay(() =>
          input.client.claimRecoveryCleanup(claimRequest)
        );
        const cleanupReceipt = await executeProviderCleanup(
          claimReceipt,
          { provider: input.provider, clock, wait },
          signal
        );
        terminalResults.push(
          await persistCleanupReceipt(
            input.client,
            claimReceipt,
            cleanupReceipt,
            clock
          )
        );
      }
      return Object.freeze({
        terminalResults: Object.freeze(terminalResults),
        nextCursor: page.nextCursor,
      });
    };
    return Object.freeze({ recoverPage });
  };

export const deriveAgentEvaluationHostedRetrievalRuntimeResourceExpectedShardIds =
  (plan: AgentModelEvaluationPlan): readonly string[] => {
    if (validateAgentModelEvaluationPlan(plan).length > 0) return invalid();
    return Object.freeze(
      [
        ...new Set(
          planAgentModelEvaluationAttempts(plan).map(({ shardId }) => shardId)
        ),
      ].sort(compareUnicodeCodePoints)
    );
  };
