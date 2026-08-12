import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlInstant,
  isAgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentCapabilityProbeProgram,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
  type AgentJsonValue,
  type AgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentNativeProviderStateVaultResolveReceipt,
  type AgentNativeProviderStateVaultResolveRequest,
  type AgentNativeProviderStateVaultRetirementReceipt,
  type AgentNativeProviderStateVaultRetireRequest,
  type AgentProductionEvaluationRuntimeFactSourceIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  createEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClient,
  type AgentEvaluationNativeOptionalCapabilityBootstrapSourceRead,
} from './optionalCapabilityFactAuthorityClient';
import {
  createAgentEvaluationProductionSharedEffectOwnerReadinessReceipt,
  type AgentEvaluationProductionSharedEffectExecutionResultInput,
  type AgentEvaluationProductionSharedEffectExecutor,
} from './productionSharedEffectDurableRegistry';
import {
  digestAgentEvaluationProductionSharedEffectDispatchAck,
  type AgentEvaluationProductionSharedEffectBinding,
  type AgentEvaluationProductionSharedEffectHealthInput,
  type AgentEvaluationProductionSharedEffectStage,
} from './productionSharedEffectOwner';
import type { AgentEvaluationRunConfigQualificationTemplate } from './runConfig';

export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT =
  'prodivix.agent-evaluation-production-shared-effect-external-owner-health' as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION =
  1 as const;

const maximumBusinessResultBytes = 1_048_576;
const healthTimeoutMs = 10_000;

type NativeSourceReader = Readonly<{
  readNativeBootstrapSource(input: {
    attemptId: string;
    program: AgentCapabilityProbeProgram;
  }): Promise<
    AgentEvaluationNativeOptionalCapabilityBootstrapSourceRead | undefined
  >;
}>;

export type AgentEvaluationProductionSharedEffectExternalOwnerHealth =
  Readonly<{
    format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT;
    version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION;
    ownerKind:
      | 'provider-metadata-transport'
      | 'provider-state-vault'
      | 'hosted-retrieval-resource';
    sourceIdentityDigest: CanonicalDigest;
    status: 'ready';
    checkedAt: string;
    expiresAt: string;
    healthDigest: CanonicalDigest;
  }>;

export type AgentEvaluationProductionSharedEffectExecutionMaterial = Readonly<{
  businessResult: AgentJsonValue;
  effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
  providerRuntimeJournalResultRecordDigest: CanonicalDigest;
  providerRuntimeResultSealReceiptDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest | null;
  normalizedEventSetDigest: CanonicalDigest;
  stateVaultResolveRequest: AgentNativeProviderStateVaultResolveRequest | null;
  stateVaultResolveReceipt: AgentNativeProviderStateVaultResolveReceipt | null;
  stateVaultRetireRequest: AgentNativeProviderStateVaultRetireRequest | null;
  stateVaultRetirementReceipt: AgentNativeProviderStateVaultRetirementReceipt | null;
  sealedAt: string;
}>;

/**
 * Stateful Provider effects enter only through a callback-bound vault owner.
 * This port never receives a plaintext handle in a serializable request and
 * must retire it before execute resolves.
 */
export interface AgentEvaluationProductionSharedEffectStatefulOwner {
  readonly lifecycle: 'callback-bound-resolve-effect-retire';
  execute(
    input: Readonly<{
      binding: AgentEvaluationProductionSharedEffectBinding;
      stage: AgentEvaluationProductionSharedEffectStage;
      program: AgentCapabilityProbeProgram;
      nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt;
    }>
  ): Promise<
    AgentEvaluationProductionSharedEffectExecutionMaterial | undefined
  >;
  checkReadiness(
    input: AgentEvaluationProductionSharedEffectHealthInput
  ): Promise<
    AgentEvaluationProductionSharedEffectExternalOwnerHealth | undefined
  >;
  close(): Promise<
    Readonly<{
      status: 'clean';
      residualResourceIds: readonly [];
      residualCanaryIds: readonly [];
    }>
  >;
}

/**
 * Hosted retrieval must execute against the exact durable Provider resource.
 * A local corpus lookup never implements this port.
 */
export interface AgentEvaluationProductionSharedEffectHostedOwner {
  readonly lifecycle: 'provider-resource-query-ingress-before-response';
  execute(
    input: Readonly<{
      binding: AgentEvaluationProductionSharedEffectBinding;
      stage: AgentEvaluationProductionSharedEffectStage;
      program: AgentCapabilityProbeProgram;
    }>
  ): Promise<
    AgentEvaluationProductionSharedEffectExecutionMaterial | undefined
  >;
  checkReadiness(
    input: AgentEvaluationProductionSharedEffectHealthInput
  ): Promise<
    AgentEvaluationProductionSharedEffectExternalOwnerHealth | undefined
  >;
  close(): Promise<
    Readonly<{
      status: 'clean';
      residualResourceIds: readonly [];
      residualCanaryIds: readonly [];
    }>
  >;
}

/**
 * Provider metadata readiness comes from the transport that will produce and
 * seal the native source receipt. A configured profile alone cannot implement
 * this port.
 */
export interface AgentEvaluationProductionSharedEffectMetadataOwner {
  readonly lifecycle: 'native-provider-transport-metadata-source';
  execute(
    input: Readonly<{
      binding: AgentEvaluationProductionSharedEffectBinding;
      stage: AgentEvaluationProductionSharedEffectStage;
      program: AgentCapabilityProbeProgram;
      nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt;
    }>
  ): Promise<
    AgentEvaluationProductionSharedEffectExecutionMaterial | undefined
  >;
  checkReadiness(
    input: AgentEvaluationProductionSharedEffectHealthInput
  ): Promise<
    AgentEvaluationProductionSharedEffectExternalOwnerHealth | undefined
  >;
  close(): Promise<
    Readonly<{
      status: 'clean';
      residualResourceIds: readonly [];
      residualCanaryIds: readonly [];
    }>
  >;
}

export type CreateProductionAgentEvaluationSharedEffectExecutorInput =
  Readonly<{
    template: AgentEvaluationRunConfigQualificationTemplate;
    environment: AgentEvaluationEnvironmentReader;
    forbiddenCanaries: () => readonly string[];
    statefulOwner?: AgentEvaluationProductionSharedEffectStatefulOwner;
    hostedOwner?: AgentEvaluationProductionSharedEffectHostedOwner;
    metadataOwner?: AgentEvaluationProductionSharedEffectMetadataOwner;
    fetch?: typeof fetch;
    clock?: () => Date;
    nativeSourceReader?: (
      binding: AgentEvaluationProductionSharedEffectBinding,
      program: AgentCapabilityProbeProgram
    ) => NativeSourceReader;
  }>;

const fail = (code: string): never => {
  throw new TypeError(`G4_PRODUCTION_SHARED_EFFECT_EXECUTOR_INVALID: ${code}`);
};

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => !isUnsafeObjectKey(key));

const cleanReceipt = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze([]) as readonly [],
  residualCanaryIds: Object.freeze([]) as readonly [],
});

const identityKey = (
  value: AgentProductionEvaluationRuntimeFactSourceIdentity
): CanonicalDigest => digestAgentCanonicalValue(value);

const templateAuthorities = (
  template: AgentEvaluationRunConfigQualificationTemplate
) => {
  const identities = new Map<
    CanonicalDigest,
    Readonly<{
      identity: AgentProductionEvaluationRuntimeFactSourceIdentity;
      program: AgentCapabilityProbeProgram;
    }>
  >();
  for (const nativeIdentity of template.nativeIdentities) {
    for (const [profileId, identity] of Object.entries(
      nativeIdentity.expectedRuntimeFactSourceIdentities
    )) {
      const program = nativeIdentity.capabilityProbePrograms[
        profileId as keyof typeof nativeIdentity.capabilityProbePrograms
      ] as AgentCapabilityProbeProgram | undefined;
      if (!program) return fail('template-program');
      const digest = identityKey(identity);
      if (identities.has(digest)) return fail('template-identity-duplicate');
      identities.set(
        digest,
        Object.freeze({ identity: Object.freeze({ ...identity }), program })
      );
    }
  }
  if (identities.size !== 15) return fail('template-identity-count');
  return identities;
};

const effectResult = (
  binding: AgentEvaluationProductionSharedEffectBinding,
  stage: AgentEvaluationProductionSharedEffectStage,
  material: AgentEvaluationProductionSharedEffectExecutionMaterial
): AgentEvaluationProductionSharedEffectExecutionResultInput => {
  const intent = binding.toolInput.preEffectIntent;
  const businessResultDigest = digestAgentCanonicalValue(
    material.businessResult
  );
  const effectStatus =
    material.effectSourceFact !== null
      ? ('produced' as const)
      : isPlainObject(material.businessResult) &&
          (material.businessResult.status === 'failed' ||
            material.businessResult.status === 'unavailable')
        ? material.businessResult.status
        : fail('effect-status');
  const sourceFactKind = material.effectSourceFact?.factKind ?? null;
  const sourceFactDigest = material.effectSourceFact?.factDigest ?? null;
  if (
    !isAgentControlInstant(material.sealedAt) ||
    Date.parse(material.sealedAt) < Date.parse(stage.stagedAt) ||
    Date.parse(material.sealedAt) > Date.parse(stage.expiresAt) ||
    ![
      material.providerRuntimeJournalResultRecordDigest,
      material.providerRuntimeResultSealReceiptDigest,
      material.transportReceiptDigest,
      material.normalizedEventSetDigest,
    ].every(isAgentCanonicalDigest) ||
    (material.resultSpoolReceiptDigest !== null &&
      !isAgentCanonicalDigest(material.resultSpoolReceiptDigest)) ||
    (effectStatus === 'produced') !==
      (sourceFactDigest !== null &&
        material.resultSpoolReceiptDigest !== null) ||
    new TextEncoder().encode(canonicalJsonText(material.businessResult))
      .byteLength > maximumBusinessResultBytes
  ) {
    return fail('effect-material');
  }
  const dispatchAckDigest =
    digestAgentEvaluationProductionSharedEffectDispatchAck({
      ownerRequestDigest: intent.ownerRequestDigest,
      preEffectIntentDigest: intent.intentDigest,
      stageDigest: stage.stageDigest,
      effectStatus,
      businessResultDigest,
      sourceFactKind,
      sourceFactDigest,
      transportReceiptDigest: material.transportReceiptDigest,
      resultSpoolReceiptDigest: material.resultSpoolReceiptDigest,
      normalizedEventSetDigest: material.normalizedEventSetDigest,
      sealedAt: material.sealedAt,
    });
  return Object.freeze({
    businessResult: material.businessResult,
    effectSourceFact: material.effectSourceFact,
    effectSourceReceipt: createAgentEvaluationCapabilityEffectSourceReceipt(
      intent,
      {
        intentDigest: intent.intentDigest,
        ownerRequestId: intent.ownerRequestId,
        ownerRequestDigest: intent.ownerRequestDigest,
        runtimeFactSourceAuthority: intent.runtimeFactSourceAuthority,
        registrationReceiptDigest: intent.registrationReceiptDigest,
        effectStatus,
        businessResultDigest,
        providerRuntimeJournalResultRecordDigest:
          material.providerRuntimeJournalResultRecordDigest,
        providerRuntimeResultSealReceiptDigest:
          material.providerRuntimeResultSealReceiptDigest,
        sourceFactKind,
        sourceFactDigest,
        stageDigest: stage.stageDigest,
        dispatchAckDigest,
        transportReceiptDigest: material.transportReceiptDigest,
        resultSpoolReceiptDigest: material.resultSpoolReceiptDigest,
        normalizedEventSetDigest: material.normalizedEventSetDigest,
        stateVaultResolveRequest: material.stateVaultResolveRequest,
        stateVaultResolveReceipt: material.stateVaultResolveReceipt,
        stateVaultRetireRequest: material.stateVaultRetireRequest,
        stateVaultRetirementReceipt: material.stateVaultRetirementReceipt,
        specificReceiptDigests: Object.freeze([]),
        sealedAt: material.sealedAt,
      }
    ),
  });
};

const sourceBindingMatches = (
  binding: AgentEvaluationProductionSharedEffectBinding,
  read: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRead,
  program: AgentCapabilityProbeProgram
): AgentNativeProviderOptionalCapabilitySourceReceipt | undefined => {
  const sourceRequest = read.sourceReceipt.sourceRequest;
  const native = sourceRequest.nativeSourceReceipt;
  const authority = binding.toolInput.preEffectIntent.inputAuthorityBinding;
  if (
    sourceRequest.outcome !== 'observed' ||
    native === null ||
    !isAgentNativeProviderOptionalCapabilitySourceReceipt(native, program) ||
    read.attemptId !== authority.sourceAttemptId ||
    read.turnIndex !== authority.sourceTurnIndex ||
    sourceRequest.invocationId !== authority.sourceInvocationId ||
    sourceRequest.providerRequestDigest !==
      authority.sourceProviderRequestDigest ||
    sourceRequest.providerResponseDigest !== authority.sourceResponseDigest ||
    sourceRequest.dispatchIntentDigest !==
      authority.sourceDispatchIntentDigest ||
    sourceRequest.transportReceiptDigest !==
      authority.sourceTransportReceiptDigest ||
    sourceRequest.resultSpoolReceiptDigest !==
      authority.sourceResultSpoolReceiptDigest ||
    sourceRequest.normalizedEventSetDigest !==
      authority.sourceNormalizedEventSetDigest ||
    sourceRequest.fact?.factKind !== authority.sourceFactKind ||
    sourceRequest.fact?.factDigest !== authority.sourceHandleDigest ||
    native.receiptDigest !== sourceRequest.nativeSourceReceiptDigest
  ) {
    return undefined;
  }
  return native;
};

const statefulHealthKeys = Object.freeze([
  'format',
  'version',
  'ownerKind',
  'sourceIdentityDigest',
  'status',
  'checkedAt',
  'expiresAt',
  'healthDigest',
] as const);

export const decodeAgentEvaluationProductionSharedEffectExternalOwnerHealth = (
  value: unknown,
  ownerKind: AgentEvaluationProductionSharedEffectExternalOwnerHealth['ownerKind'],
  sourceIdentityDigest: CanonicalDigest,
  now: Date
): AgentEvaluationProductionSharedEffectExternalOwnerHealth => {
  if (
    !exactRecord(value, statefulHealthKeys) ||
    value.format !==
      AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT ||
    value.version !==
      AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION ||
    value.ownerKind !== ownerKind ||
    value.sourceIdentityDigest !== sourceIdentityDigest ||
    value.status !== 'ready' ||
    !isAgentControlInstant(value.checkedAt) ||
    !isAgentControlInstant(value.expiresAt) ||
    !isAgentCanonicalDigest(value.healthDigest)
  ) {
    return fail('stateful-health-shape');
  }
  const { healthDigest: _healthDigest, ...base } = value;
  if (
    value.healthDigest !== digestAgentCanonicalValue(base) ||
    Date.parse(value.checkedAt) > now.getTime() ||
    Date.parse(value.expiresAt) <= now.getTime() ||
    Date.parse(value.expiresAt) - Date.parse(value.checkedAt) >
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS
  ) {
    return fail('stateful-health-binding');
  }
  return Object.freeze({
    ...(value as unknown as AgentEvaluationProductionSharedEffectExternalOwnerHealth),
  });
};

const isStatefulProfile = (
  identity: AgentProductionEvaluationRuntimeFactSourceIdentity
): boolean =>
  identity.capabilityId === 'provider.background-job' ||
  identity.capabilityId === 'provider.reasoning-continuation';

const isExpectedBlockedHostedProfile = (
  identity: AgentProductionEvaluationRuntimeFactSourceIdentity
): boolean =>
  identity.sourceKind === 'sealed-hosted-owner-result' &&
  identity.capabilityId === 'provider.hosted-retrieval' &&
  identity.protocolFamily === 'anthropic-messages' &&
  identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest === undefined;

/**
 * The default adapter executes only from sealed Backend source authority or an
 * injected real external owner. Static source membership never grants health.
 */
export const createProductionAgentEvaluationSharedEffectExecutor = (
  input: CreateProductionAgentEvaluationSharedEffectExecutorInput
): AgentEvaluationProductionSharedEffectExecutor => {
  if (
    typeof input.environment !== 'function' ||
    typeof input.forbiddenCanaries !== 'function' ||
    (input.statefulOwner !== undefined &&
      (input.statefulOwner.lifecycle !==
        'callback-bound-resolve-effect-retire' ||
        ![
          input.statefulOwner.execute,
          input.statefulOwner.checkReadiness,
          input.statefulOwner.close,
        ].every((candidate) => typeof candidate === 'function'))) ||
    (input.hostedOwner !== undefined &&
      (input.hostedOwner.lifecycle !==
        'provider-resource-query-ingress-before-response' ||
        ![
          input.hostedOwner.execute,
          input.hostedOwner.checkReadiness,
          input.hostedOwner.close,
        ].every((candidate) => typeof candidate === 'function'))) ||
    (input.metadataOwner !== undefined &&
      (input.metadataOwner.lifecycle !==
        'native-provider-transport-metadata-source' ||
        ![
          input.metadataOwner.execute,
          input.metadataOwner.checkReadiness,
          input.metadataOwner.close,
        ].every((candidate) => typeof candidate === 'function')))
  ) {
    return fail('composition');
  }
  const authorities = templateAuthorities(input.template);
  const clock = input.clock ?? (() => new Date());
  const fetchImplementation = input.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== 'function') return fail('fetch');
  let draining = false;
  let active = 0;
  let closePromise: Promise<typeof cleanReceipt> | undefined;

  const backendHealthy = async (): Promise<boolean> => {
    if (
      input.environment(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl) !==
      AGENT_EVALUATION_LEDGER_BASE_URL
    ) {
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), healthTimeoutMs);
    try {
      const response = await fetchImplementation(
        `${AGENT_EVALUATION_LEDGER_BASE_URL}/healthz`,
        {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        }
      );
      return response.status === 204 && response.body === null;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

  const nativeReader = (
    binding: AgentEvaluationProductionSharedEffectBinding,
    program: AgentCapabilityProbeProgram
  ): NativeSourceReader =>
    input.nativeSourceReader?.(binding, program) ??
    createEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClient({
      namespaceId: binding.toolInput.namespaceId,
      planDigest: binding.toolInput.planDigest,
      repositoryCommit: binding.toolInput.repositoryCommit,
      environment: input.environment,
      forbiddenCanaries: input.forbiddenCanaries,
      sanitization: () =>
        Object.freeze({
          protectedMaterialCanaries: Object.freeze([
            ...input.forbiddenCanaries(),
          ]),
          secretCanaries: Object.freeze([...input.forbiddenCanaries()]),
        }),
    });

  const executor: AgentEvaluationProductionSharedEffectExecutor = {
    authorityKind:
      'production-provider-metadata-or-hosted-effect-owner' as const,
    async execute(
      binding: AgentEvaluationProductionSharedEffectBinding,
      stage: AgentEvaluationProductionSharedEffectStage
    ) {
      if (draining) return fail('draining');
      const configured = authorities.get(binding.sourceIdentityDigest);
      if (
        !configured ||
        !sameCanonicalJson(configured.identity, binding.sourceIdentity)
      ) {
        return undefined;
      }
      active += 1;
      try {
        if (
          binding.sourceIdentity.sourceKind === 'sealed-hosted-owner-result'
        ) {
          if (!input.hostedOwner) return undefined;
          const material = await input.hostedOwner.execute({
            binding,
            stage,
            program: configured.program,
          });
          return material ? effectResult(binding, stage, material) : undefined;
        }
        const stateful = isStatefulProfile(binding.sourceIdentity);
        const read = await nativeReader(
          binding,
          configured.program
        ).readNativeBootstrapSource({
          attemptId:
            binding.toolInput.preEffectIntent.inputAuthorityBinding
              .sourceAttemptId,
          program: configured.program,
        });
        if (!read) return undefined;
        const native = sourceBindingMatches(binding, read, configured.program);
        if (!native) return undefined;
        if (stateful) {
          if (!input.statefulOwner) return undefined;
          const material = await input.statefulOwner.execute({
            binding,
            stage,
            program: configured.program,
            nativeSourceReceipt: native,
          });
          return material ? effectResult(binding, stage, material) : undefined;
        }
        if (!input.metadataOwner) return undefined;
        const material = await input.metadataOwner.execute({
          binding,
          stage,
          program: configured.program,
          nativeSourceReceipt: native,
        });
        return material ? effectResult(binding, stage, material) : undefined;
      } finally {
        active -= 1;
      }
    },
    async checkReadiness(
      healthInput: AgentEvaluationProductionSharedEffectHealthInput
    ) {
      if (draining || !(await backendHealthy())) return undefined;
      const configured = authorities.get(
        digestAgentCanonicalValue(healthInput.sourceIdentity)
      );
      if (
        !configured ||
        !sameCanonicalJson(configured.identity, healthInput.sourceIdentity)
      ) {
        return undefined;
      }
      const expectedBlockedHosted = isExpectedBlockedHostedProfile(
        configured.identity
      );
      const externalOwner = isStatefulProfile(configured.identity)
        ? input.statefulOwner
        : configured.identity.sourceKind === 'sealed-hosted-owner-result' &&
            !expectedBlockedHosted
          ? input.hostedOwner
          : input.metadataOwner;
      if (!externalOwner) return undefined;
      const health = await externalOwner.checkReadiness(healthInput);
      if (!health) return undefined;
      const now = clock();
      if (!Number.isFinite(now.getTime())) return fail('clock');
      const sourceIdentityDigest = digestAgentCanonicalValue(
        configured.identity
      );
      if (
        configured.identity.sourceKind === 'sealed-hosted-owner-result' &&
        !expectedBlockedHosted
      ) {
        const {
          isAgentEvaluationProductionSharedEffectHostedOwnerHealth,
          matchAgentEvaluationProductionSharedEffectHostedOwnerHealth,
        } = await import('./productionSharedEffectHostedOwner');
        if (
          !isAgentEvaluationProductionSharedEffectHostedOwnerHealth(health) ||
          !matchAgentEvaluationProductionSharedEffectHostedOwnerHealth(
            health,
            sourceIdentityDigest,
            now.toISOString()
          )
        ) {
          return undefined;
        }
      } else {
        decodeAgentEvaluationProductionSharedEffectExternalOwnerHealth(
          health,
          isStatefulProfile(configured.identity)
            ? 'provider-state-vault'
            : 'provider-metadata-transport',
          sourceIdentityDigest,
          now
        );
      }
      const expiresAt = healthInput.lookup.minimumExpiresAt;
      return createAgentEvaluationProductionSharedEffectOwnerReadinessReceipt(
        healthInput,
        { checkedAt: now.toISOString(), expiresAt }
      );
    },
    close() {
      closePromise ??= (async () => {
        draining = true;
        while (active > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (input.statefulOwner) {
          const receipt = await input.statefulOwner.close();
          if (!sameCanonicalJson(receipt, cleanReceipt)) {
            return fail('stateful-close');
          }
        }
        if (input.hostedOwner) {
          const receipt = await input.hostedOwner.close();
          if (!sameCanonicalJson(receipt, cleanReceipt)) {
            return fail('hosted-close');
          }
        }
        if (input.metadataOwner) {
          const receipt = await input.metadataOwner.close();
          if (!sameCanonicalJson(receipt, cleanReceipt)) {
            return fail('metadata-close');
          }
        }
        return cleanReceipt;
      })();
      return closePromise;
    },
  };
  return Object.freeze(executor);
};
