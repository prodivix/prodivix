import {
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES,
  createAgentProductionEvaluationRuntimeFactSourceIdentity,
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  type AgentProductionEvaluationRuntimeFactSourceIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION,
  decodeAgentEvaluationRuntimeFactSourceRegistrationAuthorityResult,
  decodeAgentEvaluationRuntimeFactSourceRegistrationRequest,
  digestAgentEvaluationRuntimeFactSourceOwnerAdmission,
  digestAgentEvaluationRuntimeFactSourceRegistrationStage,
  type AgentEvaluationRuntimeFactSourceRegistrationOwnerPort,
  type AgentEvaluationRuntimeFactSourceRegistrationRequest,
} from './runtimeFactSourceRegistration';

export const AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_FORMAT =
  'prodivix.agent-evaluation-production-runtime-fact-source-registry-health' as const;
export const AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_VERSION =
  1 as const;
export const PRODUCTION_AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ID =
  'evaluation.runtime-fact-source-registration.owner.v1' as const;
export const PRODUCTION_AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-production-runtime-fact-source-registration-owner-implementation',
    version: 1,
    identityAuthority: 'exact-fifteen-source-identities',
    readinessAuthority: 'injected-real-effect-owner-health-registry',
    reconcile: 'read-sealed-health-only',
  });

export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID =
  'prodivix.g4-model-evaluation-ledger' as const;

const maximumRegistryHealthBytes = 65_536;
const maximumRegistrationLifetimeMs = 8 * 24 * 60 * 60 * 1_000;
const exactExpectedIdentityCount =
  AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES.length *
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES.length;

export type AgentEvaluationProductionRuntimeFactSourceRegistryLookup =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    registrationRequestDigest: CanonicalDigest;
    expectedIdentityDigest: CanonicalDigest;
    minimumExpiresAt: string;
  }>;

export type AgentEvaluationProductionRuntimeFactSourceRegistryHealth =
  Readonly<{
    format: typeof AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_FORMAT;
    version: typeof AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    registrationRequestDigest: CanonicalDigest;
    expectedIdentityDigest: CanonicalDigest;
    minimumExpiresAt: string;
    sourceAuthorityKind: 'shared-durable-capability';
    sourceKind:
      'sealed-provider-response-metadata' | 'sealed-hosted-owner-result';
    sourceAuthorityId: string;
    sourceAuthorityImplementationDigest: CanonicalDigest;
    effectOwnerAuthorityId: string;
    effectOwnerImplementationDigest: CanonicalDigest;
    routeBinding: string;
    capabilityProfileId: AgentProductionEvaluationRuntimeFactSourceIdentity['capabilityProfileId'];
    capabilityProfileDigest: CanonicalDigest;
    capabilityId: string;
    protocolFamily: AgentProductionEvaluationRuntimeFactSourceIdentity['protocolFamily'];
    providerConfigurationId: string;
    modelId: string;
    modelLineageDigest: CanonicalDigest;
    adapterDigest: CanonicalDigest;
    registrationAuthorityIssuerId: string;
    status: 'ready';
    checkedAt: string;
    expiresAt: string;
    effectOwnerReadinessReceiptDigest: CanonicalDigest;
    recordDigest: CanonicalDigest;
  }>;

/**
 * Implemented by the same production owner registry used to resolve shared
 * provider-metadata or hosted effects. sealReadyHealth may inspect that real
 * owner and atomically persist its bounded readiness receipt. readSealedHealth
 * is a read-only ACK-loss path and must never execute or probe an effect owner.
 */
export interface AgentEvaluationProductionRuntimeFactSourceHealthRegistry {
  sealReadyHealth(
    lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup
  ): Promise<
    AgentEvaluationProductionRuntimeFactSourceRegistryHealth | undefined
  >;
  readSealedHealth(
    lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup
  ): Promise<
    AgentEvaluationProductionRuntimeFactSourceRegistryHealth | undefined
  >;
}

export type CreateProductionAgentEvaluationRuntimeFactSourceRegistrationOwnerInput =
  Readonly<{
    expectedSourceIdentities: readonly AgentProductionEvaluationRuntimeFactSourceIdentity[];
    healthRegistry: AgentEvaluationProductionRuntimeFactSourceHealthRegistry;
    clock?: () => Date;
  }>;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_RUNTIME_FACT_SOURCE_PRODUCTION_HEALTH_UNAVAILABLE: ${code}`
  );
};

const exactRecord = (
  value: unknown,
  required: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && required.includes(key)
  );

const boundedCanonical = (value: unknown): boolean => {
  try {
    return (
      new TextEncoder().encode(canonicalJsonText(value)).byteLength <=
      maximumRegistryHealthBytes
    );
  } catch {
    return false;
  }
};

const identityKey = (
  identity: Pick<
    AgentProductionEvaluationRuntimeFactSourceIdentity,
    'protocolFamily' | 'capabilityProfileId'
  >
): string => `${identity.protocolFamily}/${identity.capabilityProfileId}`;

const expectedIdentityFromRequest = (
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  registrationAuthorityIssuerId: string
): AgentProductionEvaluationRuntimeFactSourceIdentity =>
  createAgentProductionEvaluationRuntimeFactSourceIdentity({
    kind: request.sourceAuthorityKind,
    sourceKind: request.sourceKind,
    sourceAuthorityId: request.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      request.sourceAuthorityImplementationDigest,
    routeBinding: request.routeBinding,
    capabilityProfileId: request.capabilityProfileId,
    capabilityProfileDigest: request.capabilityProfileDigest,
    capabilityId: request.capabilityId,
    protocolFamily: request.protocolFamily,
    providerConfigurationId: request.providerConfigurationId,
    modelId: request.modelId,
    modelLineageDigest: request.modelLineageDigest,
    adapterDigest: request.adapterDigest,
    ...(request.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      ? {
          hostedRetrievalRuntimeResourceRegistrationIntentDigest:
            request.hostedRetrievalRuntimeResourceRegistrationIntentDigest,
        }
      : {}),
    registrationAuthorityIssuerId,
  });

const expectedIdentityIndex = (
  source: readonly AgentProductionEvaluationRuntimeFactSourceIdentity[]
): ReadonlyMap<string, AgentProductionEvaluationRuntimeFactSourceIdentity> => {
  if (source.length !== exactExpectedIdentityCount) {
    return fail('expected-identity-count');
  }
  const index = new Map<
    string,
    AgentProductionEvaluationRuntimeFactSourceIdentity
  >();
  for (const candidate of source) {
    const identity =
      createAgentProductionEvaluationRuntimeFactSourceIdentity(candidate);
    if (
      identity.registrationAuthorityIssuerId !==
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID
    ) {
      return fail('expected-identity-issuer');
    }
    const key = identityKey(identity);
    if (index.has(key)) return fail('expected-identity-duplicate');
    index.set(key, identity);
  }
  for (const protocolFamily of AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES) {
    for (const capabilityProfileId of AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES) {
      if (!index.has(`${protocolFamily}/${capabilityProfileId}`)) {
        return fail('expected-identity-coverage');
      }
    }
  }
  return index;
};

const registryHealthKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'registrationRequestDigest',
  'expectedIdentityDigest',
  'minimumExpiresAt',
  'sourceAuthorityKind',
  'sourceKind',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'effectOwnerAuthorityId',
  'effectOwnerImplementationDigest',
  'routeBinding',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'capabilityId',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'registrationAuthorityIssuerId',
  'status',
  'checkedAt',
  'expiresAt',
  'effectOwnerReadinessReceiptDigest',
  'recordDigest',
] as const);

export const decodeAgentEvaluationProductionRuntimeFactSourceRegistryHealth = (
  value: unknown,
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  expectedIdentity: AgentProductionEvaluationRuntimeFactSourceIdentity,
  now: Date
): AgentEvaluationProductionRuntimeFactSourceRegistryHealth => {
  decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(request);
  const canonicalIdentity =
    createAgentProductionEvaluationRuntimeFactSourceIdentity(expectedIdentity);
  const expectedIdentityDigest = digestAgentCanonicalValue(canonicalIdentity);
  if (
    !exactRecord(value, registryHealthKeys) ||
    value.format !==
      AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_FORMAT ||
    value.version !==
      AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_VERSION ||
    value.namespaceId !== request.namespaceId ||
    value.repositoryCommit !== request.repositoryCommit ||
    value.registrationRequestDigest !== request.requestDigest ||
    value.expectedIdentityDigest !== expectedIdentityDigest ||
    value.minimumExpiresAt !== request.minimumExpiresAt ||
    value.sourceAuthorityKind !== canonicalIdentity.kind ||
    value.sourceKind !== canonicalIdentity.sourceKind ||
    value.sourceAuthorityId !== canonicalIdentity.sourceAuthorityId ||
    value.sourceAuthorityImplementationDigest !==
      canonicalIdentity.sourceAuthorityImplementationDigest ||
    value.effectOwnerAuthorityId !== canonicalIdentity.sourceAuthorityId ||
    value.effectOwnerImplementationDigest !==
      canonicalIdentity.sourceAuthorityImplementationDigest ||
    value.routeBinding !== canonicalIdentity.routeBinding ||
    value.capabilityProfileId !== canonicalIdentity.capabilityProfileId ||
    value.capabilityProfileDigest !==
      canonicalIdentity.capabilityProfileDigest ||
    value.capabilityId !== canonicalIdentity.capabilityId ||
    value.protocolFamily !== canonicalIdentity.protocolFamily ||
    value.providerConfigurationId !==
      canonicalIdentity.providerConfigurationId ||
    value.modelId !== canonicalIdentity.modelId ||
    value.modelLineageDigest !== canonicalIdentity.modelLineageDigest ||
    value.adapterDigest !== canonicalIdentity.adapterDigest ||
    value.registrationAuthorityIssuerId !==
      canonicalIdentity.registrationAuthorityIssuerId ||
    value.status !== 'ready' ||
    !isAgentControlIdentity(value.namespaceId) ||
    ![
      value.sourceAuthorityId,
      value.effectOwnerAuthorityId,
      value.routeBinding,
      value.capabilityProfileId,
      value.capabilityId,
      value.providerConfigurationId,
      value.modelId,
      value.registrationAuthorityIssuerId,
    ].every(isAgentControlIdentity) ||
    ![
      value.registrationRequestDigest,
      value.expectedIdentityDigest,
      value.sourceAuthorityImplementationDigest,
      value.effectOwnerImplementationDigest,
      value.capabilityProfileDigest,
      value.modelLineageDigest,
      value.adapterDigest,
      value.effectOwnerReadinessReceiptDigest,
      value.recordDigest,
    ].every(isAgentCanonicalDigest) ||
    ![value.minimumExpiresAt, value.checkedAt, value.expiresAt].every(
      isAgentControlInstant
    ) ||
    !boundedCanonical(value) ||
    inspectAgentControlJson(value, maximumRegistryHealthBytes).length > 0
  ) {
    return fail('registry-health-binding');
  }
  const canonicalValue =
    value as unknown as AgentEvaluationProductionRuntimeFactSourceRegistryHealth;
  const nowMs = now.getTime();
  const checkedAtMs = Date.parse(canonicalValue.checkedAt);
  const expiresAtMs = Date.parse(canonicalValue.expiresAt);
  const minimumExpiresAtMs = Date.parse(request.minimumExpiresAt);
  const { recordDigest, ...base } = canonicalValue;
  if (
    !Number.isFinite(nowMs) ||
    checkedAtMs > nowMs ||
    expiresAtMs <= nowMs ||
    expiresAtMs < minimumExpiresAtMs ||
    expiresAtMs <= checkedAtMs ||
    expiresAtMs - checkedAtMs > maximumRegistrationLifetimeMs ||
    recordDigest !== digestAgentCanonicalValue(base)
  ) {
    return fail('registry-health-lifetime');
  }
  return Object.freeze({
    ...canonicalValue,
  });
};

const lookupFor = (
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  expectedIdentity: AgentProductionEvaluationRuntimeFactSourceIdentity
): AgentEvaluationProductionRuntimeFactSourceRegistryLookup =>
  Object.freeze({
    namespaceId: request.namespaceId,
    repositoryCommit: request.repositoryCommit,
    registrationRequestDigest: request.requestDigest,
    expectedIdentityDigest: digestAgentCanonicalValue(expectedIdentity),
    minimumExpiresAt: request.minimumExpiresAt,
  });

const resultFromHealth = (
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  stageDigest: CanonicalDigest,
  health: AgentEvaluationProductionRuntimeFactSourceRegistryHealth
) => {
  const ownerHealthBase = Object.freeze({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT,
    version: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION,
    requestDigest: request.requestDigest,
    sourceAuthorityId: health.effectOwnerAuthorityId,
    sourceAuthorityImplementationDigest: health.effectOwnerImplementationDigest,
    sourceKind: health.sourceKind,
    routeBinding: health.routeBinding,
    status: 'ready' as const,
    checkedAt: health.checkedAt,
    expiresAt: health.expiresAt,
  });
  const ownerHealth = Object.freeze({
    ...ownerHealthBase,
    healthDigest: digestAgentCanonicalValue(ownerHealthBase),
  });
  return decodeAgentEvaluationRuntimeFactSourceRegistrationAuthorityResult(
    Object.freeze({
      ownerHealth,
      ownerAdmissionDigest:
        digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
          request.requestDigest,
          ownerHealth.healthDigest,
          stageDigest
        ),
    }),
    request,
    stageDigest
  );
};

export const createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner =
  (
    input: CreateProductionAgentEvaluationRuntimeFactSourceRegistrationOwnerInput
  ): AgentEvaluationRuntimeFactSourceRegistrationOwnerPort => {
    if (
      !input.healthRegistry ||
      typeof input.healthRegistry.sealReadyHealth !== 'function' ||
      typeof input.healthRegistry.readSealedHealth !== 'function'
    ) {
      return fail('health-registry-port');
    }
    const identities = expectedIdentityIndex(input.expectedSourceIdentities);
    const clock = input.clock ?? (() => new Date());

    const resolve = async (
      mode: 'execute' | 'reconcile',
      requestSource: AgentEvaluationRuntimeFactSourceRegistrationRequest,
      registrationAuthorityIssuerId: string,
      stageDigest: CanonicalDigest
    ) => {
      const request =
        decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(
          requestSource
        );
      if (
        registrationAuthorityIssuerId !==
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID ||
        stageDigest !==
          digestAgentEvaluationRuntimeFactSourceRegistrationStage(
            request,
            registrationAuthorityIssuerId
          )
      ) {
        return fail('registration-fence');
      }
      const requestIdentity = expectedIdentityFromRequest(
        request,
        registrationAuthorityIssuerId
      );
      const expectedIdentity = identities.get(identityKey(requestIdentity));
      if (
        !expectedIdentity ||
        !sameCanonicalJson(requestIdentity, expectedIdentity)
      ) {
        return fail('expected-identity-missing');
      }
      const lookup = lookupFor(request, expectedIdentity);
      const candidate =
        mode === 'execute'
          ? await input.healthRegistry.sealReadyHealth(lookup)
          : await input.healthRegistry.readSealedHealth(lookup);
      if (!candidate) {
        if (mode === 'reconcile') return undefined;
        return fail('real-effect-owner-health-missing');
      }
      const health =
        decodeAgentEvaluationProductionRuntimeFactSourceRegistryHealth(
          candidate,
          request,
          expectedIdentity,
          clock()
        );
      return resultFromHealth(request, stageDigest, health);
    };

    return Object.freeze({
      authorityId:
        PRODUCTION_AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ID,
      implementationDigest:
        PRODUCTION_AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_IMPLEMENTATION_DIGEST,
      execute: ({ request, registrationAuthorityIssuerId, stageDigest }) =>
        resolve(
          'execute',
          request,
          registrationAuthorityIssuerId,
          stageDigest
        ).then((result) => result ?? fail('execute-health-missing')),
      reconcile: ({ request, registrationAuthorityIssuerId, stageDigest }) =>
        resolve(
          'reconcile',
          request,
          registrationAuthorityIssuerId,
          stageDigest
        ),
    });
  };
