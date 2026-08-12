import {
  createAnthropicMessagesAgentProviderAdapter,
  createGeminiInteractionsAgentProviderAdapter,
  createOpenAIResponsesAgentProviderAdapter,
  digestAgentCanonicalValue,
  isAgentControlInstant,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationControlledRuntime,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentNativeProviderStateVaultPort,
  type AgentProviderAdapterIdentity,
  type Instant,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  AgentEvaluationAttemptExecutor,
  createAgentEvaluationAttemptRetryPolicy,
  createAgentEvaluationPreDispatchAttemptFinalizer,
  type AgentEvaluationAttemptAdapterSet,
  type AgentEvaluationAttemptGradingPersistence,
  type AgentEvaluationCapabilityEffectInputAuthoritySource,
  type AgentEvaluationAttemptMaterialSource,
  type AgentEvaluationAttemptNativeProtocol,
  type AgentEvaluationPreDispatchFailureClassifier,
} from './attemptExecutor';
import { createAgentEvaluationProductionAttemptAccounting } from './attemptAccounting';
import type { AgentEvaluationCapabilityRuntime } from './capabilityRuntime';
import {
  agentEvaluationEgressBoundFetch,
  type AgentEvaluationEgressBoundFetch,
} from './egressBoundFetch';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { CallbackBoundAgentEvaluationInvocationPayloadRegistry } from './invocationPayload';
import {
  createAgentEvaluationAttemptBudgetReservationId,
  type AgentEvaluationDurableAttemptExecutor,
  type AgentEvaluationDurableAttemptExecutorFactory,
  type AgentEvaluationDurableReceiptPersistence,
  type AgentEvaluationDurableTurnRecord,
} from './durableShardRunner';
import { FileAgentEvaluationProtectedMaterialSource } from './protectedMaterial';
import { createProductionAgentEvaluationAttemptTransportBinding } from './productionAttemptTransportJournal';
import {
  assertProductionAgentEvaluationAttemptBudgetPreflight,
  createProductionAgentEvaluationAttemptBudgetDemand,
} from './productionAttemptBudget';
import { createAgentEvaluationProductionProviderTransport } from './providerTransport';
import { createEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClient } from './capabilityEffectInputAuthorityClient';
import { createProductionAgentEvaluationCapabilityEffectInputAuthoritySource } from './productionCapabilityEffectInputAuthoritySource';
import {
  AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME,
  AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME,
  decodeProductionAgentEvaluationCanaries,
} from './productionCanaries';
import {
  createEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClient,
  type AgentEvaluationOptionalCapabilityFactAuthorityClient,
} from './optionalCapabilityFactAuthorityClient';
import {
  createAgentEvaluationAesGcmResultSpoolCipher,
  EnvironmentAgentEvaluationResultSpoolKeyResolver,
} from './resultSpoolCipher';
import { createProductionAgentEvaluationNativeOptionalCapabilityResolver } from './productionNativeProviderOptionalCapability';
import {
  loadAgentEvaluationRunnerConfig,
  requireEnabledAgentEvaluationRunnerConfig,
  type AgentEvaluationEnvironment,
} from './config';
import {
  resolveAgentEvaluationProtectedMaterialFiles,
  type AgentEvaluationProductionFrozenRunConfig,
} from './runConfig';
import { EnvironmentAgentProviderSecretResolver } from './secretResolver';

export type ProductionAgentEvaluationAttemptClock = () => string | Date;

export type CreateProductionAgentEvaluationDurableAttemptExecutorFactoryInput =
  Readonly<{
    config: AgentEvaluationProductionFrozenRunConfig;
    plan: AgentEvaluationProductionFrozenRunConfig['plan'];
    environment?: AgentEvaluationEnvironment;
    /** The only accepted production fetch authority is the address-pinned port. */
    fetch?: AgentEvaluationEgressBoundFetch;
    now?: ProductionAgentEvaluationAttemptClock;
    controlledRuntime: AgentEvaluationControlledRuntime;
    capabilityRuntime: AgentEvaluationCapabilityRuntime;
    optionalCapabilityFactAuthorityClient?: Pick<
      AgentEvaluationOptionalCapabilityFactAuthorityClient,
      'observe' | 'readNativeBootstrapSource'
    >;
    capabilityEffectInputAuthoritySource?: AgentEvaluationCapabilityEffectInputAuthoritySource;
    stateVault: AgentNativeProviderStateVaultPort;
    prepareVerificationAttemptGrants: AgentEvaluationDurableAttemptExecutorFactory['prepareVerificationAttemptGrants'];
    gradeAndPersist: AgentEvaluationAttemptGradingPersistence;
  }>;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

const protocolKeys: Readonly<
  Record<
    AgentEvaluationAttemptNativeProtocol,
    'openaiResponses' | 'anthropicMessages' | 'geminiInteractions'
  >
> = Object.freeze({
  'openai-responses': 'openaiResponses',
  'anthropic-messages': 'anthropicMessages',
  'gemini-interactions': 'geminiInteractions',
});

const canonicalInstantClock = (
  clock: ProductionAgentEvaluationAttemptClock | undefined
): (() => Instant) => {
  const source = clock ?? (() => new Date());
  return () => {
    const observed = source();
    const instant =
      observed instanceof Date ? observed.toISOString() : observed;
    if (!isAgentControlInstant(instant)) return unavailable();
    return instant;
  };
};

/**
 * Resolves the frozen public catalog and callback-bound protected material
 * owner shared by the Provider executor and controlled Workspace runtime.
 */
export const createProductionAgentEvaluationAttemptMaterialSource = (
  config: AgentEvaluationProductionFrozenRunConfig,
  environment: AgentEvaluationEnvironment
): AgentEvaluationAttemptMaterialSource => {
  const protectedSource = new FileAgentEvaluationProtectedMaterialSource({
    planDigest: config.plan.planDigest,
    repositoryCommit: config.plan.repositoryCommit,
    files: resolveAgentEvaluationProtectedMaterialFiles(config, environment),
    environment,
  });
  const entries = new Map(
    config.materialCatalog.entries.map((entry) => [entry.caseId, entry])
  );
  return Object.freeze({
    async use<T>(
      input: Parameters<AgentEvaluationAttemptMaterialSource['use']>[0],
      callback: (
        material: Parameters<
          Parameters<AgentEvaluationAttemptMaterialSource['use']>[1]
        >[0]
      ) => Promise<T>
    ): Promise<T> {
      const entry = entries.get(input.descriptor.caseId);
      const concreteCase = input.plan.concreteCases.find(
        ({ caseId }) => caseId === input.descriptor.caseId
      );
      if (
        input.plan.planDigest !== config.plan.planDigest ||
        input.descriptor.planDigest !== config.plan.planDigest ||
        !entry ||
        !concreteCase ||
        entry.caseDigest !== concreteCase.caseDigest
      ) {
        return unavailable();
      }
      if (entry.kind === 'public-material') {
        if (
          entry.material.materialDigest !== entry.materialDigest ||
          entry.material.caseId !== input.descriptor.caseId
        ) {
          return unavailable();
        }
        return callback(entry.material);
      }
      return protectedSource.use(entry.locator, callback);
    },
  });
};

const adapterIdentityFor = (
  plan: AgentEvaluationProductionFrozenRunConfig['plan'],
  protocolFamily: AgentEvaluationAttemptNativeProtocol
): Readonly<{
  identity: AgentProviderAdapterIdentity;
  profileDigests: readonly string[];
}> => {
  const provider = plan.providerConfigurations.find(
    ({ adapter }) => adapter.protocolFamily === protocolFamily
  );
  if (!provider) return unavailable();
  const profileDigests = Object.freeze(
    plan.capabilityQualificationTargets
      .filter(
        (target) =>
          target.protocolFamily === protocolFamily &&
          target.providerConfigurationId === provider.providerConfigurationId
      )
      .map(({ capabilityProfileDigest }) => capabilityProfileDigest)
  );
  if (
    profileDigests.length === 0 ||
    new Set(profileDigests).size !== profileDigests.length
  ) {
    return unavailable();
  }
  return Object.freeze({ identity: provider.adapter, profileDigests });
};

const adaptersFor = (
  plan: AgentEvaluationProductionFrozenRunConfig['plan'],
  transport: ReturnType<
    typeof createAgentEvaluationProductionProviderTransport
  >,
  now: () => Instant
): AgentEvaluationAttemptAdapterSet => {
  const createInput = (
    protocolFamily: AgentEvaluationAttemptNativeProtocol
  ) => {
    const authority = adapterIdentityFor(plan, protocolFamily);
    return Object.freeze({
      identity: authority.identity,
      declaredProfileDigests: authority.profileDigests,
      // Production support is admitted from the Backend-sealed probe
      // authority carried by the frozen plan. The runtime adapter never
      // promotes a declaration into support on its own.
      supportedProfileDigests: Object.freeze([]),
      transport,
      now,
    });
  };
  return Object.freeze({
    'openai-responses': createOpenAIResponsesAgentProviderAdapter(
      createInput('openai-responses')
    ),
    'anthropic-messages': createAnthropicMessagesAgentProviderAdapter(
      createInput('anthropic-messages')
    ),
    'gemini-interactions': createGeminiInteractionsAgentProviderAdapter(
      createInput('gemini-interactions')
    ),
  });
};

const descriptorForReceipts = (
  plan: AgentEvaluationProductionFrozenRunConfig['plan'],
  receipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[]
): AgentModelEvaluationAttemptDescriptor => {
  const first = receipts[0];
  if (
    !first ||
    receipts.some(
      (receipt) =>
        receipt.evaluationPlanDigest !== plan.planDigest ||
        receipt.evaluationAttemptId !== first.evaluationAttemptId ||
        receipt.descriptorDigest !== first.descriptorDigest
    )
  ) {
    return unavailable();
  }
  const descriptor = planAgentModelEvaluationAttempts(plan).find(
    ({ attemptId }) => attemptId === first.evaluationAttemptId
  );
  if (!descriptor || descriptor.descriptorDigest !== first.descriptorDigest) {
    return unavailable();
  }
  return descriptor;
};

const closedTurns = (turns: readonly AgentEvaluationDurableTurnRecord[]) =>
  Object.freeze(
    turns.map((turn) => {
      if (turn.state !== 'closed') return unavailable();
      return Object.freeze({
        state: 'closed' as const,
        attemptId: turn.attemptId,
        descriptorDigest: turn.descriptorDigest,
        turnIndex: turn.turnIndex,
        budgetReservationId: turn.budgetReservationId,
        dispatchIntent: turn.dispatchIntent,
        transportReceipt: turn.transportReceipt,
        ...(turn.resultSpoolReceipt
          ? { resultSpoolReceipt: turn.resultSpoolReceipt }
          : {}),
        createdAt: turn.createdAt,
        closedAt: turn.closedAt,
        turnDigest: turn.turnDigest,
      });
    })
  );

const classifier: AgentEvaluationPreDispatchFailureClassifier = (input) =>
  Object.freeze({
    reasonCode: input.suggestedReasonCode,
    findingDigest: digestAgentCanonicalValue({
      stage: input.stage,
      reasonCode: input.suggestedReasonCode,
      policyDigest: input.policyDigest,
      inputDigest: input.inputDigest,
      caughtCode:
        input.caught instanceof AgentEvaluationRunnerError
          ? input.caught.code
          : 'unclassified',
    }),
  });

const validateProviderEnvironment = (
  config: AgentEvaluationProductionFrozenRunConfig,
  environment: AgentEvaluationEnvironment
) => {
  const runtime = requireEnabledAgentEvaluationRunnerConfig(
    loadAgentEvaluationRunnerConfig(environment)
  );
  for (const protocolFamily of Object.keys(
    protocolKeys
  ) as AgentEvaluationAttemptNativeProtocol[]) {
    const provider = config.providers[protocolKeys[protocolFamily]];
    const observed = runtime.providers[protocolFamily];
    if (
      provider.protocolFamily !== protocolFamily ||
      observed.providerConfigurationId !== provider.providerConfigurationId ||
      observed.modelId !== provider.modelId ||
      observed.secretRef !== provider.secretRef
    ) {
      return unavailable();
    }
  }
  return runtime;
};

/**
 * Composes the descriptor-bound production executor. Every external authority,
 * including the durable Native Provider state vault, is resolved before any
 * Provider call.
 */
export const createProductionAgentEvaluationDurableAttemptExecutorFactory = (
  input: CreateProductionAgentEvaluationDurableAttemptExecutorFactoryInput
): AgentEvaluationDurableAttemptExecutorFactory => {
  if (
    input.config.purpose !== 'production' ||
    !sameCanonicalJson(input.config.plan, input.plan) ||
    input.config.execution.retry.maximumAttempts !== 1 ||
    typeof input.controlledRuntime?.executeTool !== 'function' ||
    typeof input.controlledRuntime?.continue !== 'function' ||
    typeof input.controlledRuntime?.assessFinal !== 'function' ||
    typeof input.capabilityRuntime?.executeTool !== 'function' ||
    typeof input.capabilityRuntime?.assessCapability !== 'function' ||
    !sameCanonicalJson(
      input.stateVault?.authority,
      input.config.nativeProviderStateVaultEncryption.authority
    ) ||
    typeof input.prepareVerificationAttemptGrants !== 'function' ||
    typeof input.gradeAndPersist !== 'function' ||
    (input.fetch !== undefined &&
      input.fetch !== agentEvaluationEgressBoundFetch)
  ) {
    return unavailable();
  }
  try {
    assertProductionAgentEvaluationAttemptBudgetPreflight({
      plan: input.plan,
      controlledRuntime: input.config.controlledRuntime,
      pricingAuthorities: input.config.pricingAuthorities,
    });
  } catch {
    return unavailable();
  }
  const environment = input.environment ?? process.env;
  const now = canonicalInstantClock(input.now);
  const providerRuntimeConfig = validateProviderEnvironment(
    input.config,
    environment
  );
  const materialSource = createProductionAgentEvaluationAttemptMaterialSource(
    input.config,
    environment
  );
  const spoolCipher = createAgentEvaluationAesGcmResultSpoolCipher({
    keys: new EnvironmentAgentEvaluationResultSpoolKeyResolver({
      profile: input.config.responseSpoolEncryption,
      environment,
    }),
  });
  const secretCanaries = () =>
    decodeProductionAgentEvaluationCanaries(
      environment[AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME]
    );
  const protectedMaterialCanaries = () =>
    decodeProductionAgentEvaluationCanaries(
      environment[AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME]
    );
  const nativeOptionalCapabilityResolver =
    createProductionAgentEvaluationNativeOptionalCapabilityResolver({
      plan: input.plan,
      expectedStateVaultAuthority:
        input.config.nativeProviderStateVaultEncryption.authority,
      stateVault: input.stateVault,
      protectedMaterialCanaries,
      secretCanaries,
    });
  const estimateShard: AgentEvaluationDurableAttemptExecutorFactory['estimateShard'] =
    ({ plan, descriptors }) => {
      if (!sameCanonicalJson(plan, input.plan)) return unavailable();
      return createProductionAgentEvaluationAttemptBudgetDemand({
        plan,
        controlledRuntime: input.config.controlledRuntime,
        descriptors,
      });
    };

  return Object.freeze({
    estimateShard,
    prepareVerificationAttemptGrants: (
      grantInput: Parameters<
        AgentEvaluationDurableAttemptExecutorFactory['prepareVerificationAttemptGrants']
      >[0]
    ) => {
      if (!sameCanonicalJson(grantInput.plan, input.plan)) return unavailable();
      return input.prepareVerificationAttemptGrants(grantInput);
    },
    createPreDispatchAttemptFinalizer: (
      persistence: Parameters<
        AgentEvaluationDurableAttemptExecutorFactory['createPreDispatchAttemptFinalizer']
      >[0],
      finalizerNow: Parameters<
        AgentEvaluationDurableAttemptExecutorFactory['createPreDispatchAttemptFinalizer']
      >[1]
    ) =>
      createAgentEvaluationPreDispatchAttemptFinalizer({
        classifyPreDispatchFailure: classifier,
        persistPreDispatchFailureReceipt:
          persistence.persistPreDispatchFailureReceipt,
        persistCapabilityExecutionReceipt:
          persistence.persistCapabilityExecutionReceipt,
        persistInvocationTurnReceipt: persistence.persistInvocationTurnReceipt,
        persistExecutionReceipt: persistence.persistExecutionReceipt,
        now: finalizerNow,
      }),
    create: (
      persistence: AgentEvaluationDurableReceiptPersistence,
      verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[],
      authority: Readonly<{
        namespaceId: string;
        shardLeaseOwnerId: string;
        shardLeaseGeneration: number;
      }>
    ): AgentEvaluationDurableAttemptExecutor => {
      const descriptor = descriptorForReceipts(
        input.plan,
        verificationAttemptGrantReceipts
      );
      const demand = createProductionAgentEvaluationAttemptBudgetDemand({
        plan: input.plan,
        controlledRuntime: input.config.controlledRuntime,
        descriptors: Object.freeze([descriptor]),
      });
      const demandDigest = digestAgentCanonicalValue(demand);
      const budgetReservationId =
        createAgentEvaluationAttemptBudgetReservationId({
          planDigest: input.plan.planDigest,
          shardId: descriptor.shardId,
          descriptorDigest: descriptor.descriptorDigest,
        });
      const payloadRegistry =
        new CallbackBoundAgentEvaluationInvocationPayloadRegistry();
      const transportBinding =
        createProductionAgentEvaluationAttemptTransportBinding({
          plan: input.plan,
          descriptor,
          persistence,
          budgetReservationId,
          demandDigest,
          spoolCipher,
          responseSpoolEncryption: input.config.responseSpoolEncryption,
          now,
        });
      const capabilityEffectInputAuthoritySource =
        input.capabilityEffectInputAuthoritySource ??
        createProductionAgentEvaluationCapabilityEffectInputAuthoritySource({
          namespaceId: authority.namespaceId,
          plan: input.plan,
          client:
            createEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClient(
              {
                namespaceId: authority.namespaceId,
                planDigest: input.plan.planDigest,
                repositoryCommit: input.plan.repositoryCommit,
                environment,
                forbiddenCanaries: () =>
                  Object.freeze(
                    [
                      ...new Set([
                        ...protectedMaterialCanaries(),
                        ...secretCanaries(),
                      ]),
                    ].sort(compareUnicodeCodePoints)
                  ),
              }
            ),
          now,
        });
      const optionalCapabilityFactAuthorityClient =
        input.optionalCapabilityFactAuthorityClient ??
        Object.freeze({
          readNativeBootstrapSource: (
            request: Parameters<
              AgentEvaluationOptionalCapabilityFactAuthorityClient['readNativeBootstrapSource']
            >[0]
          ) => {
            const protectedCanaries = protectedMaterialCanaries();
            const secrets = secretCanaries();
            const forbiddenCanaries = Object.freeze(
              [...new Set([...protectedCanaries, ...secrets])].sort(
                compareUnicodeCodePoints
              )
            );
            return createEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClient(
              {
                namespaceId: authority.namespaceId,
                planDigest: input.plan.planDigest,
                repositoryCommit: input.plan.repositoryCommit,
                environment,
                forbiddenCanaries: () => forbiddenCanaries,
                sanitization: () =>
                  Object.freeze({
                    protectedMaterialCanaries: protectedCanaries,
                    secretCanaries: secrets,
                  }),
              }
            ).readNativeBootstrapSource(request);
          },
          observe: (request) => {
            const protectedCanaries = protectedMaterialCanaries();
            const secrets = secretCanaries();
            const forbiddenCanaries = Object.freeze(
              [...new Set([...protectedCanaries, ...secrets])].sort(
                compareUnicodeCodePoints
              )
            );
            return createEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClient(
              {
                namespaceId: authority.namespaceId,
                planDigest: input.plan.planDigest,
                repositoryCommit: input.plan.repositoryCommit,
                environment,
                forbiddenCanaries: () => forbiddenCanaries,
                sanitization: () =>
                  Object.freeze({
                    protectedMaterialCanaries: protectedCanaries,
                    secretCanaries: secrets,
                  }),
              }
            ).observe(request);
          },
        });
      const transport = createAgentEvaluationProductionProviderTransport({
        config: providerRuntimeConfig,
        secrets: new EnvironmentAgentProviderSecretResolver(environment),
        resolvePayload: (request) => payloadRegistry.resolveOnce(request),
        resolveDispatchIntentAuthority:
          transportBinding.resolveDispatchIntentAuthority,
        putDispatchIntent: transportBinding.putDispatchIntent,
        closeTransport: transportBinding.closeTransport,
        resultSpoolCipher: spoolCipher,
        responseSpoolEncryption: input.config.responseSpoolEncryption,
        resolveNativeOptionalCapabilityBootstrap:
          nativeOptionalCapabilityResolver,
        recoverNativeOptionalCapabilityBootstrap: async ({
          ingress,
          program,
        }) =>
          (await optionalCapabilityFactAuthorityClient.readNativeBootstrapSource(
            {
              attemptId: ingress.attemptId,
              program,
            }
          ))
            ? 'sealed'
            : 'missing',
      });
      const executor = new AgentEvaluationAttemptExecutor({
        namespaceId: authority.namespaceId,
        shardLeaseOwnerId: authority.shardLeaseOwnerId,
        shardLeaseGeneration: authority.shardLeaseGeneration,
        adapters: adaptersFor(input.plan, transport, now),
        materialSource,
        payloadRegistry,
        payloadOptions: Object.freeze({
          maximumOutputTokens: 4_096,
          timeoutMs: input.config.controlledRuntime.loop.continuationTimeoutMs,
          maximumResponseBytes:
            input.config.responseSpoolEncryption.maximumPlaintextBytes,
        }),
        retryPolicy: createAgentEvaluationAttemptRetryPolicy({
          maximumAttempts: 1,
          retryableStatuses: input.config.execution.retry.retryableStatuses,
        }),
        controlledRuntimeConfiguration: input.config.controlledRuntime,
        controlledRuntime: input.controlledRuntime,
        capabilityRuntime: input.capabilityRuntime,
        optionalCapabilityFactAuthorityClient,
        capabilityEffectInputAuthoritySource,
        verificationAttemptGrantReceipts,
        requiresControlledPreview: ({ plan, descriptor: current }) =>
          plan.concreteCases.find(({ caseId }) => caseId === current.caseId)
            ?.subjectiveVisualQuality ?? unavailable(),
        transportJournal: transportBinding.journal,
        estimateShard,
        classifyPreDispatchFailure: classifier,
        resolveAndPersistAccounting:
          createAgentEvaluationProductionAttemptAccounting({
            runConfig: input.config,
            persistAccountingRecord: (record) => record,
          }),
        gradeAndPersist: input.gradeAndPersist,
        persistSourceReceipt: persistence.persistSourceReceipt,
        persistPreDispatchFailureReceipt:
          persistence.persistPreDispatchFailureReceipt,
        persistCapabilityExecutionReceipt:
          persistence.persistCapabilityExecutionReceipt,
        persistCapabilitySpecificReceipt:
          persistence.persistCapabilitySpecificReceipt,
        persistProviderCapabilityObservationReceipt:
          persistence.persistProviderCapabilityObservationReceipt,
        persistAttemptAuthorityOwnerReceipt:
          persistence.persistAttemptAuthorityOwnerReceipt,
        persistInvocationTurnReceipt: persistence.persistInvocationTurnReceipt,
        persistResultSubmissionReceipt:
          persistence.persistResultSubmissionReceipt,
        persistControlledRuntimeReceipt:
          persistence.persistControlledRuntimeReceipt,
        stageResultSpoolDispositionReceipt:
          persistence.stageResultSpoolDispositionReceipt,
        persistExecutionReceipt: persistence.persistExecutionReceipt,
        secretCanaries,
        now,
      });
      return Object.freeze({
        execute: (executeInput) => executor.execute(executeInput),
        resume: ({ turns, ...resumeInput }) =>
          executor.resume({
            ...resumeInput,
            turns: closedTurns(turns),
          }),
      });
    },
  });
};
