import { randomUUID } from 'node:crypto';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS,
  createAgentHostedRetrievalRuntimeResourceReadRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  matchAgentHostedRetrievalRuntimeResourceActiveReadReceipt,
  matchAgentHostedRetrievalRuntimeResourceAuthority,
  matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment,
  matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  type AgentCapabilityProbeProgram,
  type AgentHostedRetrievalRuntimeResourceAuthority,
  type AgentHostedRetrievalRuntimeResourceOwnerHealthBinding,
  type AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  type AgentHostedRetrievalRuntimeResourceReadReceipt,
  type AgentHostedRetrievalRuntimeResourceReadRequest,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  type AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentEvaluationHostedRetrievalRuntimeResourceClient,
  AgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient,
  AgentEvaluationHostedRetrievalRuntimeResourceScope,
} from './hostedRetrievalRuntimeResourceClient';
import {
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
  type AgentEvaluationProductionSharedEffectExecutionMaterial,
  type AgentEvaluationProductionSharedEffectExternalOwnerHealth,
  type AgentEvaluationProductionSharedEffectHostedOwner,
} from './productionSharedEffectExecutor';
import type {
  AgentEvaluationProductionSharedEffectBinding,
  AgentEvaluationProductionSharedEffectHealthInput,
  AgentEvaluationProductionSharedEffectStage,
} from './productionSharedEffectOwner';

export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_FORMAT =
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_VERSION =
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION;
export const PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_AUTHORITY_ISSUER_ID =
  'authority.prodivix.hosted-retrieval-runtime-resource-owner' as const;
export const PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_IMPLEMENTATION_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-owner-implementation' as const;
export const PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_IMPLEMENTATION_FORMAT,
    version: 1,
    ownerAuthorityIssuerId:
      PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_AUTHORITY_ISSUER_ID,
    schemaContractDigest:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
  });

export const createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding =
  (
    namespaceId: string
  ): AgentHostedRetrievalRuntimeResourceOwnerHealthBinding => {
    if (!isAgentControlIdentity(namespaceId)) return fail('health-namespace');
    return Object.freeze({
      namespaceId,
      ownerAuthorityIssuerId:
        PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_AUTHORITY_ISSUER_ID,
      implementationDigest:
        PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_IMPLEMENTATION_DIGEST,
      schemaContractDigest:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
    });
  };

export type AgentEvaluationProductionSharedEffectHostedResourceContext =
  Readonly<{
    registrationSetLookupRequest: AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest;
    registrationSetLookupReceipt: AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt;
    registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult;
    providerResourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
    providerResourceAuthority: AgentHostedRetrievalRuntimeResourceAuthority;
    providerResourceReadRequest: AgentHostedRetrievalRuntimeResourceReadRequest;
    providerResourceReadReceipt: AgentHostedRetrievalRuntimeResourceReadReceipt;
  }>;

export type AgentEvaluationProductionSharedEffectHostedTransportMaterial = Omit<
  AgentEvaluationProductionSharedEffectExecutionMaterial,
  | 'stateVaultResolveReceipt'
  | 'stateVaultResolveRequest'
  | 'stateVaultRetirementReceipt'
  | 'stateVaultRetireRequest'
>;

export type AgentEvaluationProductionSharedEffectHostedTransport = Readonly<{
  authorityKind: 'production-hosted-retrieval-shared-effect';
  readinessAuthority: 'hosted-resource-read-and-provider-query-owner';
  execute(
    input: Readonly<{
      binding: AgentEvaluationProductionSharedEffectBinding;
      stage: AgentEvaluationProductionSharedEffectStage;
      program: AgentCapabilityProbeProgram;
      resourceContext: AgentEvaluationProductionSharedEffectHostedResourceContext;
    }>
  ): Promise<
    AgentEvaluationProductionSharedEffectHostedTransportMaterial | undefined
  >;
  checkReadiness(
    input: Readonly<{
      healthInput: AgentEvaluationProductionSharedEffectHealthInput;
      resourceContext: AgentEvaluationProductionSharedEffectHostedResourceContext;
    }>
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
}>;

export type AgentEvaluationProductionSharedEffectHostedPreactivationTransport =
  Readonly<{
    authorityKind: 'production-hosted-retrieval-shared-effect';
    readinessAuthority: 'hosted-owner-bootstrap-and-provider-query-owner';
    checkReadiness(
      input: Readonly<{
        healthInput: AgentEvaluationProductionSharedEffectHealthInput;
        ownerHealthReceipt: AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt;
      }>
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
  }>;

type AgentEvaluationProductionSharedEffectHostedOwnerHealthBase = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_VERSION;
  ownerKind: 'hosted-retrieval-resource';
  sourceIdentityDigest: CanonicalDigest;
  status: 'ready';
  checkedAt: Instant;
  expiresAt: Instant;
  healthDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionSharedEffectHostedActiveResourceHealth =
  AgentEvaluationProductionSharedEffectHostedOwnerHealthBase &
    Readonly<{
      readinessMode: 'active-resource';
      registrationSetLookupRequestDigest: CanonicalDigest;
      registrationSetLookupReceiptDigest: CanonicalDigest;
      registrationResultDigest: CanonicalDigest;
      resourceSetCommitmentDigest: CanonicalDigest;
      resourceAuthorityDigest: CanonicalDigest;
      resourceReadRequestDigest: CanonicalDigest;
      resourceReadReceiptDigest: CanonicalDigest;
      activeStateDigest: CanonicalDigest;
      providerTransportHealthDigest: CanonicalDigest;
    }>;

export type AgentEvaluationProductionSharedEffectHostedPreactivationHealth =
  AgentEvaluationProductionSharedEffectHostedOwnerHealthBase &
    Readonly<{
      readinessMode: 'preactivation';
      ownerHealthReceiptDigest: CanonicalDigest;
      ownerStorageSummaryDigest: CanonicalDigest;
      schemaContractDigest: CanonicalDigest;
      providerTransportHealthDigest: CanonicalDigest;
    }>;

export type AgentEvaluationProductionSharedEffectHostedOwnerHealth =
  | AgentEvaluationProductionSharedEffectHostedActiveResourceHealth
  | AgentEvaluationProductionSharedEffectHostedPreactivationHealth;

export type CreateProductionAgentEvaluationSharedEffectHostedOwnerInput =
  Readonly<{
    scope: AgentEvaluationHostedRetrievalRuntimeResourceScope;
    registrationIntentBindings: readonly AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding[];
    readerOwnerInstanceId: string;
    client: AgentEvaluationHostedRetrievalRuntimeResourceClient;
    transport: AgentEvaluationProductionSharedEffectHostedTransport;
    clock?: () => Date;
    createReadLeaseId?: () => string;
  }>;

export type CreateProductionAgentEvaluationSharedEffectHostedPreactivationOwnerInput =
  Readonly<{
    ownerHealthBinding: AgentHostedRetrievalRuntimeResourceOwnerHealthBinding;
    client: AgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient;
    transport: AgentEvaluationProductionSharedEffectHostedPreactivationTransport;
    clock?: () => Date;
  }>;

const cleanReceipt = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze([]) as readonly [],
  residualCanaryIds: Object.freeze([]) as readonly [],
});

const transportHealthKeys = Object.freeze([
  'format',
  'version',
  'ownerKind',
  'sourceIdentityDigest',
  'status',
  'checkedAt',
  'expiresAt',
  'healthDigest',
] as const);

const hostedOwnerHealthKeys = Object.freeze([
  'format',
  'version',
  'ownerKind',
  'sourceIdentityDigest',
  'status',
  'readinessMode',
  'registrationSetLookupRequestDigest',
  'registrationSetLookupReceiptDigest',
  'registrationResultDigest',
  'resourceSetCommitmentDigest',
  'resourceAuthorityDigest',
  'resourceReadRequestDigest',
  'resourceReadReceiptDigest',
  'activeStateDigest',
  'providerTransportHealthDigest',
  'checkedAt',
  'expiresAt',
  'healthDigest',
] as const);

const hostedPreactivationHealthKeys = Object.freeze([
  'format',
  'version',
  'ownerKind',
  'sourceIdentityDigest',
  'status',
  'readinessMode',
  'ownerHealthReceiptDigest',
  'ownerStorageSummaryDigest',
  'schemaContractDigest',
  'providerTransportHealthDigest',
  'checkedAt',
  'expiresAt',
  'healthDigest',
] as const);

const fail = (code: string): never => {
  throw new TypeError(
    `G4_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_INVALID: ${code}`
  );
};

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && keys.includes(key)
  );

const nowInstant = (clock: () => Date): Instant | undefined => {
  const now = clock();
  return Number.isFinite(now.getTime())
    ? (now.toISOString() as Instant)
    : undefined;
};

const sourceMatchesAuthority = (
  source: AgentEvaluationProductionSharedEffectHealthInput['sourceIdentity'],
  authority: AgentHostedRetrievalRuntimeResourceAuthority
): boolean =>
  source.sourceKind === 'sealed-hosted-owner-result' &&
  source.capabilityId === 'provider.hosted-retrieval' &&
  (source.protocolFamily === 'gemini-interactions' ||
    source.protocolFamily === 'openai-responses') &&
  source.hostedRetrievalRuntimeResourceRegistrationIntentDigest ===
    authority.registrationIntentDigest &&
  source.protocolFamily === authority.protocolFamily &&
  source.capabilityProfileId === authority.capabilityProfileId &&
  source.capabilityProfileDigest === authority.capabilityProfileDigest &&
  source.providerConfigurationId === authority.providerConfigurationId &&
  source.modelId === authority.modelId &&
  source.modelLineageDigest === authority.modelLineageDigest &&
  source.adapterDigest === authority.adapterDigest;

const decodeTransportHealth = (
  value: unknown,
  sourceIdentityDigest: CanonicalDigest,
  observedAt: Instant
): AgentEvaluationProductionSharedEffectExternalOwnerHealth | undefined => {
  if (!exactRecord(value, transportHealthKeys)) return undefined;
  const health =
    value as unknown as AgentEvaluationProductionSharedEffectExternalOwnerHealth;
  const { healthDigest, ...base } = health;
  return health.format ===
    AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT &&
    health.version ===
      AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION &&
    health.ownerKind === 'hosted-retrieval-resource' &&
    health.sourceIdentityDigest === sourceIdentityDigest &&
    health.status === 'ready' &&
    isAgentControlInstant(health.checkedAt) &&
    isAgentControlInstant(health.expiresAt) &&
    isAgentCanonicalDigest(health.healthDigest) &&
    health.healthDigest === digestAgentCanonicalValue(base) &&
    Date.parse(health.checkedAt) <= Date.parse(observedAt) &&
    Date.parse(health.expiresAt) > Date.parse(observedAt) &&
    Date.parse(health.expiresAt) - Date.parse(health.checkedAt) <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS
    ? health
    : undefined;
};

export const isAgentEvaluationProductionSharedEffectHostedOwnerHealth = (
  value: unknown
): value is AgentEvaluationProductionSharedEffectHostedOwnerHealth => {
  const activeResource = exactRecord(value, hostedOwnerHealthKeys);
  const preactivation = exactRecord(value, hostedPreactivationHealthKeys);
  if (!activeResource && !preactivation) return false;
  const health =
    value as unknown as AgentEvaluationProductionSharedEffectHostedOwnerHealth;
  const { healthDigest, ...base } = health;
  const commonValid =
    health.format ===
      AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_FORMAT &&
    health.version ===
      AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_VERSION &&
    health.ownerKind === 'hosted-retrieval-resource' &&
    health.status === 'ready' &&
    isAgentCanonicalDigest(health.sourceIdentityDigest) &&
    isAgentCanonicalDigest(health.healthDigest) &&
    isAgentControlInstant(health.checkedAt) &&
    isAgentControlInstant(health.expiresAt) &&
    Date.parse(health.expiresAt) > Date.parse(health.checkedAt) &&
    Date.parse(health.expiresAt) - Date.parse(health.checkedAt) <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS &&
    healthDigest === digestAgentCanonicalValue(base);
  if (!commonValid) return false;
  return activeResource && health.readinessMode === 'active-resource'
    ? [
        health.registrationSetLookupRequestDigest,
        health.registrationSetLookupReceiptDigest,
        health.registrationResultDigest,
        health.resourceSetCommitmentDigest,
        health.resourceAuthorityDigest,
        health.resourceReadRequestDigest,
        health.resourceReadReceiptDigest,
        health.activeStateDigest,
        health.providerTransportHealthDigest,
      ].every(isAgentCanonicalDigest)
    : preactivation && health.readinessMode === 'preactivation'
      ? [
          health.ownerHealthReceiptDigest,
          health.ownerStorageSummaryDigest,
          health.providerTransportHealthDigest,
        ].every(isAgentCanonicalDigest) &&
        health.schemaContractDigest ===
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST
      : false;
};

export const matchAgentEvaluationProductionSharedEffectHostedOwnerHealth = (
  health: AgentEvaluationProductionSharedEffectHostedOwnerHealth,
  sourceIdentityDigest: CanonicalDigest,
  observedAt: Instant
): boolean =>
  isAgentEvaluationProductionSharedEffectHostedOwnerHealth(health) &&
  isAgentCanonicalDigest(sourceIdentityDigest) &&
  isAgentControlInstant(observedAt) &&
  health.sourceIdentityDigest === sourceIdentityDigest &&
  Date.parse(health.checkedAt) <= Date.parse(observedAt) &&
  Date.parse(health.expiresAt) > Date.parse(observedAt);

/**
 * Resolves the post-plan exact-four set and obtains a fresh durable active-read
 * lease before any Provider query is dispatched. Owner shutdown never deletes
 * the shared run-level set; the bounded read lease expires in the Backend
 * ledger and the unique post-matrix cleanup owner observes that fence.
 */
export const createProductionAgentEvaluationSharedEffectHostedOwner = (
  input: CreateProductionAgentEvaluationSharedEffectHostedOwnerInput
): AgentEvaluationProductionSharedEffectHostedOwner => {
  if (
    !isAgentControlIdentity(input.readerOwnerInstanceId) ||
    typeof input.client?.lookupRegistrationSet !== 'function' ||
    typeof input.client?.readActiveResource !== 'function' ||
    input.transport?.authorityKind !==
      'production-hosted-retrieval-shared-effect' ||
    input.transport.readinessAuthority !==
      'hosted-resource-read-and-provider-query-owner' ||
    ![
      input.transport.execute,
      input.transport.checkReadiness,
      input.transport.close,
    ].every((candidate) => typeof candidate === 'function')
  ) {
    return fail('composition');
  }
  const clock = input.clock ?? (() => new Date());
  const createReadLeaseId =
    input.createReadLeaseId ?? (() => `hosted-read.${randomUUID()}`);
  const canonicalLookupProbe =
    createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
      ...input.scope,
      registrationIntentBindings: input.registrationIntentBindings,
      requestedAt: '2000-01-01T00:00:00.000Z' as Instant,
    });
  const canonicalRegistrationIntentBindings =
    canonicalLookupProbe.registrationIntentBindings;
  let closed = false;
  let active = 0;
  let closePromise: Promise<typeof cleanReceipt> | undefined;

  const resolveResourceContext = async (
    sourceIdentity: AgentEvaluationProductionSharedEffectHealthInput['sourceIdentity'],
    program?: AgentCapabilityProbeProgram
  ): Promise<
    AgentEvaluationProductionSharedEffectHostedResourceContext | undefined
  > => {
    if (
      sourceIdentity.sourceKind !== 'sealed-hosted-owner-result' ||
      sourceIdentity.capabilityId !== 'provider.hosted-retrieval' ||
      (sourceIdentity.protocolFamily !== 'gemini-interactions' &&
        sourceIdentity.protocolFamily !== 'openai-responses') ||
      !sourceIdentity.hostedRetrievalRuntimeResourceRegistrationIntentDigest
    ) {
      return undefined;
    }
    const requestedAt = nowInstant(clock);
    if (!requestedAt) return fail('clock');
    const registrationSetLookupRequest =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        ...input.scope,
        registrationIntentBindings: canonicalRegistrationIntentBindings,
        requestedAt,
      });
    const registrationSetLookupReceipt =
      await input.client.lookupRegistrationSet(registrationSetLookupRequest);
    const lookupObservedAt = nowInstant(clock);
    if (
      !registrationSetLookupReceipt ||
      !lookupObservedAt ||
      !matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        registrationSetLookupReceipt,
        registrationSetLookupRequest,
        lookupObservedAt
      )
    ) {
      return undefined;
    }
    const matchingResults =
      registrationSetLookupReceipt.registrationResults.filter(({ authority }) =>
        sourceMatchesAuthority(sourceIdentity, authority)
      );
    if (matchingResults.length !== 1) return undefined;
    const registrationResult = matchingResults[0]!;
    const providerResourceAuthority = registrationResult.authority;
    const providerResourceSetCommitment =
      registrationSetLookupReceipt.resourceSetCommitment;
    if (
      !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
        providerResourceSetCommitment,
        providerResourceAuthority
      ) ||
      (program !== undefined &&
        !matchAgentHostedRetrievalRuntimeResourceAuthority(
          providerResourceAuthority,
          program,
          {
            planDigest: input.scope.planDigest,
            frozenRunDigest: input.scope.frozenRunDigest,
            runConfigArtifactBindingDigest:
              input.scope.runConfigArtifactBindingDigest,
            runtimeResourceSetId:
              registrationSetLookupReceipt.runtimeResourceSetId,
            protocolFamily: sourceIdentity.protocolFamily,
            providerConfigurationId: sourceIdentity.providerConfigurationId,
            modelId: sourceIdentity.modelId,
            modelLineageDigest: sourceIdentity.modelLineageDigest,
            adapterDigest: sourceIdentity.adapterDigest,
            observedAt: lookupObservedAt,
          }
        ))
    ) {
      return undefined;
    }
    const readRequestedAt = nowInstant(clock);
    if (!readRequestedAt) return fail('clock');
    const readLeaseId = createReadLeaseId();
    if (!isAgentControlIdentity(readLeaseId)) return fail('read-lease-id');
    const providerResourceReadRequest =
      createAgentHostedRetrievalRuntimeResourceReadRequest({
        namespaceId: input.scope.namespaceId,
        repositoryCommit: input.scope.repositoryCommit,
        planDigest: input.scope.planDigest,
        runConfigArtifactBindingDigest:
          input.scope.runConfigArtifactBindingDigest,
        runtimeResourceSetId: registrationSetLookupReceipt.runtimeResourceSetId,
        authorityDigest: providerResourceAuthority.authorityDigest,
        resourceSetCommitmentDigest:
          providerResourceSetCommitment.commitmentDigest,
        readerOwnerInstanceId: input.readerOwnerInstanceId,
        readLeaseId,
        minimumExpiresAt: new Date(
          Date.parse(readRequestedAt) +
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS
        ).toISOString() as Instant,
      });
    const providerResourceReadReceipt = await input.client.readActiveResource(
      providerResourceReadRequest,
      providerResourceAuthority
    );
    const readObservedAt = nowInstant(clock);
    if (
      !providerResourceReadReceipt ||
      !readObservedAt ||
      !matchAgentHostedRetrievalRuntimeResourceActiveReadReceipt(
        providerResourceReadReceipt,
        providerResourceAuthority,
        {
          activeOwnerInstanceId: input.readerOwnerInstanceId,
          claimGeneration: providerResourceReadReceipt.claimGeneration,
          activeState: providerResourceReadReceipt.activeState,
          observedAt: readObservedAt,
        }
      ) ||
      providerResourceReadReceipt.readRequestDigest !==
        providerResourceReadRequest.requestDigest ||
      providerResourceReadReceipt.resourceSetCommitmentDigest !==
        providerResourceSetCommitment.commitmentDigest
    ) {
      return undefined;
    }
    return Object.freeze({
      registrationSetLookupRequest,
      registrationSetLookupReceipt,
      registrationResult,
      providerResourceSetCommitment,
      providerResourceAuthority,
      providerResourceReadRequest,
      providerResourceReadReceipt,
    });
  };

  const owner: AgentEvaluationProductionSharedEffectHostedOwner = {
    lifecycle: 'provider-resource-query-ingress-before-response' as const,
    async execute({ binding, stage, program }) {
      if (closed) return fail('closed');
      if (
        binding.toolInput.namespaceId !== input.scope.namespaceId ||
        binding.toolInput.repositoryCommit !== input.scope.repositoryCommit ||
        binding.toolInput.planDigest !== input.scope.planDigest ||
        !sameCanonicalJson(binding.sourceIdentity, stage.sourceIdentity)
      ) {
        return undefined;
      }
      active += 1;
      try {
        const resourceContext = await resolveResourceContext(
          binding.sourceIdentity,
          program
        );
        if (!resourceContext) return undefined;
        const material = await input.transport.execute({
          binding,
          stage,
          program,
          resourceContext,
        });
        return material
          ? Object.freeze({
              ...material,
              stateVaultResolveRequest: null,
              stateVaultResolveReceipt: null,
              stateVaultRetireRequest: null,
              stateVaultRetirementReceipt: null,
            })
          : undefined;
      } finally {
        active -= 1;
      }
    },
    async checkReadiness(healthInput) {
      if (closed) return fail('closed');
      active += 1;
      try {
        const resourceContext = await resolveResourceContext(
          healthInput.sourceIdentity
        );
        if (!resourceContext) return undefined;
        const transportHealthReceipt = await input.transport.checkReadiness({
          healthInput,
          resourceContext,
        });
        const transportObservedAt = nowInstant(clock);
        if (!transportObservedAt) return fail('clock');
        const transportHealth = decodeTransportHealth(
          transportHealthReceipt,
          digestAgentCanonicalValue(healthInput.sourceIdentity),
          transportObservedAt
        );
        const checkedAt = nowInstant(clock);
        if (!transportHealth || !checkedAt) return undefined;
        const expiresAt = new Date(
          Math.min(
            Date.parse(transportHealth.expiresAt),
            Date.parse(resourceContext.registrationSetLookupReceipt.expiresAt),
            Date.parse(resourceContext.providerResourceReadReceipt.expiresAt)
          )
        ).toISOString() as Instant;
        if (Date.parse(expiresAt) <= Date.parse(checkedAt)) return undefined;
        const base = Object.freeze({
          format:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_FORMAT,
          version:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_VERSION,
          ownerKind: 'hosted-retrieval-resource' as const,
          sourceIdentityDigest: digestAgentCanonicalValue(
            healthInput.sourceIdentity
          ),
          status: 'ready' as const,
          readinessMode: 'active-resource' as const,
          registrationSetLookupRequestDigest:
            resourceContext.registrationSetLookupRequest.requestDigest,
          registrationSetLookupReceiptDigest:
            resourceContext.registrationSetLookupReceipt.receiptDigest,
          registrationResultDigest:
            resourceContext.registrationResult.resultDigest,
          resourceSetCommitmentDigest:
            resourceContext.providerResourceSetCommitment.commitmentDigest,
          resourceAuthorityDigest:
            resourceContext.providerResourceAuthority.authorityDigest,
          resourceReadRequestDigest:
            resourceContext.providerResourceReadRequest.requestDigest,
          resourceReadReceiptDigest:
            resourceContext.providerResourceReadReceipt.receiptDigest,
          activeStateDigest:
            resourceContext.providerResourceReadReceipt.activeStateDigest,
          providerTransportHealthDigest: transportHealth.healthDigest,
          checkedAt,
          expiresAt,
        });
        const health = Object.freeze({
          ...base,
          healthDigest: digestAgentCanonicalValue(base),
        }) as AgentEvaluationProductionSharedEffectHostedOwnerHealth;
        return isAgentEvaluationProductionSharedEffectHostedOwnerHealth(health)
          ? health
          : fail('health');
      } finally {
        active -= 1;
      }
    },
    close() {
      closePromise ??= (async () => {
        closed = true;
        while (active > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        const receipt = await input.transport.close();
        if (!sameCanonicalJson(receipt, cleanReceipt)) {
          return fail('transport-close');
        }
        return cleanReceipt;
      })();
      return closePromise;
    },
  };
  return Object.freeze(owner);
};

/**
 * Preactivation probes live hosted storage plus the real Provider/journal
 * transport before a plan exists. It never discovers, leases, or deletes a
 * Provider resource and its execute path stays fail-closed.
 */
export const createProductionAgentEvaluationSharedEffectHostedPreactivationOwner =
  (
    input: CreateProductionAgentEvaluationSharedEffectHostedPreactivationOwnerInput
  ): AgentEvaluationProductionSharedEffectHostedOwner => {
    const { ownerHealthBinding } = input;
    if (
      !isAgentControlIdentity(ownerHealthBinding.namespaceId) ||
      !isAgentControlIdentity(ownerHealthBinding.ownerAuthorityIssuerId) ||
      !isAgentCanonicalDigest(ownerHealthBinding.implementationDigest) ||
      ownerHealthBinding.schemaContractDigest !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST ||
      typeof input.client?.readOwnerHealth !== 'function' ||
      input.transport?.authorityKind !==
        'production-hosted-retrieval-shared-effect' ||
      input.transport.readinessAuthority !==
        'hosted-owner-bootstrap-and-provider-query-owner' ||
      typeof input.transport.checkReadiness !== 'function' ||
      typeof input.transport.close !== 'function'
    ) {
      return fail('preactivation-composition');
    }
    const clock = input.clock ?? (() => new Date());
    let closed = false;
    let active = 0;
    let closePromise: Promise<typeof cleanReceipt> | undefined;

    const owner: AgentEvaluationProductionSharedEffectHostedOwner = {
      lifecycle: 'provider-resource-query-ingress-before-response',
      async execute() {
        if (closed) return fail('closed');
        return undefined;
      },
      async checkReadiness(healthInput) {
        if (closed) return fail('closed');
        const sourceIdentity = healthInput.sourceIdentity;
        if (
          sourceIdentity.sourceKind !== 'sealed-hosted-owner-result' ||
          sourceIdentity.capabilityId !== 'provider.hosted-retrieval' ||
          (sourceIdentity.protocolFamily !== 'gemini-interactions' &&
            sourceIdentity.protocolFamily !== 'openai-responses') ||
          !sourceIdentity.hostedRetrievalRuntimeResourceRegistrationIntentDigest
        ) {
          return undefined;
        }
        active += 1;
        try {
          const ownerHealthReceipt = await input.client.readOwnerHealth();
          const ownerHealthObservedAt = nowInstant(clock);
          if (
            !ownerHealthReceipt ||
            !ownerHealthObservedAt ||
            !matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
              ownerHealthReceipt,
              ownerHealthBinding,
              ownerHealthObservedAt
            )
          ) {
            return undefined;
          }
          const sourceIdentityDigest =
            digestAgentCanonicalValue(sourceIdentity);
          const transportHealthReceipt = await input.transport.checkReadiness({
            healthInput,
            ownerHealthReceipt,
          });
          const transportObservedAt = nowInstant(clock);
          if (!transportObservedAt) return fail('clock');
          const transportHealth = decodeTransportHealth(
            transportHealthReceipt,
            sourceIdentityDigest,
            transportObservedAt
          );
          const checkedAt = nowInstant(clock);
          if (!transportHealth || !checkedAt) return undefined;
          const expiresAt = new Date(
            Math.min(
              Date.parse(ownerHealthReceipt.expiresAt),
              Date.parse(transportHealth.expiresAt)
            )
          ).toISOString() as Instant;
          if (Date.parse(expiresAt) <= Date.parse(checkedAt)) return undefined;
          const base = Object.freeze({
            format:
              AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_FORMAT,
            version:
              AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_HOSTED_OWNER_HEALTH_VERSION,
            ownerKind: 'hosted-retrieval-resource' as const,
            sourceIdentityDigest,
            status: 'ready' as const,
            readinessMode: 'preactivation' as const,
            ownerHealthReceiptDigest: ownerHealthReceipt.receiptDigest,
            ownerStorageSummaryDigest: ownerHealthReceipt.storageSummaryDigest,
            schemaContractDigest: ownerHealthReceipt.schemaContractDigest,
            providerTransportHealthDigest: transportHealth.healthDigest,
            checkedAt,
            expiresAt,
          });
          const health = Object.freeze({
            ...base,
            healthDigest: digestAgentCanonicalValue(base),
          }) as AgentEvaluationProductionSharedEffectHostedPreactivationHealth;
          return isAgentEvaluationProductionSharedEffectHostedOwnerHealth(
            health
          )
            ? health
            : fail('preactivation-health');
        } finally {
          active -= 1;
        }
      },
      close() {
        closePromise ??= (async () => {
          closed = true;
          while (active > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
          const receipt = await input.transport.close();
          if (!sameCanonicalJson(receipt, cleanReceipt)) {
            return fail('preactivation-transport-close');
          }
          return cleanReceipt;
        })();
        return closePromise;
      },
    };
    return Object.freeze(owner);
  };
