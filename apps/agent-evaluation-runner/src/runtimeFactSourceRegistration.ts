import {
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_REQUEST_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-request' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_STAGE_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-stage' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-health' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_ADMISSION_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-admission' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-dispatch-ack' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION =
  1 as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_OPERATION =
  'runtime-fact-source.register' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ROUTE_BINDING =
  'runtime-fact-source-owner-registration' as const;

const maximumRequestBytes = 65_536;
const maximumHealthBytes = 65_536;
const maximumRegistrationLifetimeMs = 8 * 24 * 60 * 60 * 1_000;
const repositoryCommitPattern = /^[a-f0-9]{40}$/u;

const factBackedProfiles = Object.freeze({
  'g4-provider-background-job': Object.freeze({
    capabilityId: 'provider.background-job',
    sourceKind: 'sealed-provider-response-metadata',
  }),
  'g4-provider-hosted-retrieval-core': Object.freeze({
    capabilityId: 'provider.hosted-retrieval',
    sourceKind: 'sealed-hosted-owner-result',
  }),
  'g4-provider-hosted-retrieval-document': Object.freeze({
    capabilityId: 'provider.hosted-retrieval',
    sourceKind: 'sealed-hosted-owner-result',
  }),
  'g4-provider-isolated-cache': Object.freeze({
    capabilityId: 'provider.isolated-cache',
    sourceKind: 'sealed-provider-response-metadata',
  }),
  'g4-provider-reasoning-continuation': Object.freeze({
    capabilityId: 'provider.reasoning-continuation',
    sourceKind: 'sealed-provider-response-metadata',
  }),
} as const);

type FactBackedProfileId = keyof typeof factBackedProfiles;

export type AgentEvaluationRuntimeFactSourceRegistrationRequest = Readonly<{
  format: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  sourceAuthorityKind: 'shared-durable-capability';
  sourceKind:
    'sealed-provider-response-metadata' | 'sealed-hosted-owner-result';
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  routeBinding: string;
  capabilityProfileId: FactBackedProfileId;
  capabilityProfileDigest: CanonicalDigest;
  capabilityId: string;
  protocolFamily:
    'openai-responses' | 'anthropic-messages' | 'gemini-interactions';
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  hostedRetrievalRuntimeResourceRegistrationIntentDigest?: CanonicalDigest;
  minimumExpiresAt: string;
  requestDigest: CanonicalDigest;
}>;

export type AgentEvaluationRuntimeFactSourceOwnerHealth = Readonly<{
  format: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT;
  version: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION;
  requestDigest: CanonicalDigest;
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  sourceKind: AgentEvaluationRuntimeFactSourceRegistrationRequest['sourceKind'];
  routeBinding: string;
  status: 'ready';
  checkedAt: string;
  expiresAt: string;
  healthDigest: CanonicalDigest;
}>;

export type AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult =
  Readonly<{
    ownerHealth: AgentEvaluationRuntimeFactSourceOwnerHealth;
    ownerAdmissionDigest: CanonicalDigest;
  }>;

export type AgentEvaluationRuntimeFactSourceRegistrationOwnerPort = Readonly<{
  authorityId: string;
  implementationDigest: CanonicalDigest;
  execute(input: {
    request: AgentEvaluationRuntimeFactSourceRegistrationRequest;
    registrationAuthorityIssuerId: string;
    stageDigest: CanonicalDigest;
  }): Promise<AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult>;
  reconcile(input: {
    request: AgentEvaluationRuntimeFactSourceRegistrationRequest;
    registrationAuthorityIssuerId: string;
    stageDigest: CanonicalDigest;
  }): Promise<
    AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult | undefined
  >;
}>;

const fail = (message: string): never => {
  throw new TypeError(
    `G4_RUNTIME_FACT_SOURCE_REGISTRATION_INVALID: ${message}`
  );
};

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const boundedCanonical = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      new TextEncoder().encode(canonicalJsonText(value)).byteLength <=
      maximumBytes
    );
  } catch {
    return false;
  }
};

const isFactBackedProfileId = (value: unknown): value is FactBackedProfileId =>
  typeof value === 'string' && Object.hasOwn(factBackedProfiles, value);

export const createAgentEvaluationRuntimeFactSourceRegistrationRequest = (
  input: Omit<
    AgentEvaluationRuntimeFactSourceRegistrationRequest,
    'format' | 'version' | 'requestDigest'
  >
): AgentEvaluationRuntimeFactSourceRegistrationRequest => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_REQUEST_FORMAT,
    version: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION,
    ...input,
  });
  return decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(
    Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    })
  );
};

export const decodeAgentEvaluationRuntimeFactSourceRegistrationRequest = (
  value: unknown
): AgentEvaluationRuntimeFactSourceRegistrationRequest => {
  if (
    !exactRecord(
      value,
      [
        'format',
        'version',
        'namespaceId',
        'repositoryCommit',
        'sourceAuthorityKind',
        'sourceKind',
        'sourceAuthorityId',
        'sourceAuthorityImplementationDigest',
        'routeBinding',
        'capabilityProfileId',
        'capabilityProfileDigest',
        'capabilityId',
        'protocolFamily',
        'providerConfigurationId',
        'modelId',
        'modelLineageDigest',
        'adapterDigest',
        'minimumExpiresAt',
        'requestDigest',
      ],
      ['hostedRetrievalRuntimeResourceRegistrationIntentDigest']
    ) ||
    value.format !==
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_REQUEST_FORMAT ||
    value.version !==
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION ||
    !isAgentControlIdentity(value.namespaceId) ||
    typeof value.repositoryCommit !== 'string' ||
    !repositoryCommitPattern.test(value.repositoryCommit) ||
    value.sourceAuthorityKind !== 'shared-durable-capability' ||
    !isFactBackedProfileId(value.capabilityProfileId) ||
    !['openai-responses', 'anthropic-messages', 'gemini-interactions'].includes(
      String(value.protocolFamily)
    ) ||
    ![
      value.sourceAuthorityId,
      value.routeBinding,
      value.capabilityId,
      value.providerConfigurationId,
      value.modelId,
    ].every(isAgentControlIdentity) ||
    ![
      value.sourceAuthorityImplementationDigest,
      value.capabilityProfileDigest,
      value.modelLineageDigest,
      value.adapterDigest,
      value.requestDigest,
    ].every(isAgentCanonicalDigest) ||
    (value.capabilityId === 'provider.hosted-retrieval' &&
      ['openai-responses', 'gemini-interactions'].includes(
        String(value.protocolFamily)
      )) !==
      (value.hostedRetrievalRuntimeResourceRegistrationIntentDigest !==
        undefined) ||
    (value.hostedRetrievalRuntimeResourceRegistrationIntentDigest !==
      undefined &&
      !isAgentCanonicalDigest(
        value.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      )) ||
    !isAgentControlInstant(value.minimumExpiresAt) ||
    !boundedCanonical(value, maximumRequestBytes) ||
    inspectAgentControlJson(value, maximumRequestBytes).length > 0
  ) {
    return fail('Registration request shape is invalid.');
  }
  const profile = factBackedProfiles[value.capabilityProfileId];
  const { requestDigest, ...base } =
    value as unknown as AgentEvaluationRuntimeFactSourceRegistrationRequest;
  if (
    value.sourceKind !== profile.sourceKind ||
    value.capabilityId !== profile.capabilityId ||
    value.capabilityProfileDigest !==
      digestAgentCapabilityProbeProfile(value.capabilityProfileId) ||
    requestDigest !== digestAgentCanonicalValue(base)
  ) {
    return fail('Registration request binding drifted.');
  }
  return Object.freeze({
    ...(value as unknown as AgentEvaluationRuntimeFactSourceRegistrationRequest),
  });
};

export const digestAgentEvaluationRuntimeFactSourceRegistrationStage = (
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  registrationAuthorityIssuerId: string
): CanonicalDigest => {
  decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(request);
  if (!isAgentControlIdentity(registrationAuthorityIssuerId)) {
    return fail('Registration authority issuer is invalid.');
  }
  return digestAgentCanonicalValue({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_STAGE_FORMAT,
    version: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION,
    requestDigest: request.requestDigest,
    registrationAuthorityIssuerId,
  });
};

export const digestAgentEvaluationRuntimeFactSourceOwnerAdmission = (
  requestDigest: CanonicalDigest,
  ownerHealthDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_ADMISSION_FORMAT,
    version: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION,
    requestDigest,
    ownerHealthDigest,
    stageDigest,
  });

export const digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck = (
  input: Readonly<{
    requestDigest: CanonicalDigest;
    ownerHealthDigest: CanonicalDigest;
    ownerAdmissionDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    registrationAuthorityIssuerId: string;
  }>
): CanonicalDigest => {
  if (
    ![
      input.requestDigest,
      input.ownerHealthDigest,
      input.ownerAdmissionDigest,
      input.stageDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlIdentity(input.registrationAuthorityIssuerId)
  ) {
    return fail('Registration dispatch acknowledgement input is invalid.');
  }
  return digestAgentCanonicalValue({
    format:
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_DISPATCH_ACK_FORMAT,
    version: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION,
    requestDigest: input.requestDigest,
    ownerHealthDigest: input.ownerHealthDigest,
    ownerAdmissionDigest: input.ownerAdmissionDigest,
    stageDigest: input.stageDigest,
    registrationAuthorityIssuerId: input.registrationAuthorityIssuerId,
  });
};

export const decodeAgentEvaluationRuntimeFactSourceOwnerHealth = (
  value: unknown,
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest
): AgentEvaluationRuntimeFactSourceOwnerHealth => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'requestDigest',
      'sourceAuthorityId',
      'sourceAuthorityImplementationDigest',
      'sourceKind',
      'routeBinding',
      'status',
      'checkedAt',
      'expiresAt',
      'healthDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT ||
    value.version !==
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_VERSION ||
    value.requestDigest !== request.requestDigest ||
    value.sourceAuthorityId !== request.sourceAuthorityId ||
    value.sourceAuthorityImplementationDigest !==
      request.sourceAuthorityImplementationDigest ||
    value.sourceKind !== request.sourceKind ||
    value.routeBinding !== request.routeBinding ||
    value.status !== 'ready' ||
    !isAgentControlInstant(value.checkedAt) ||
    !isAgentControlInstant(value.expiresAt) ||
    !isAgentCanonicalDigest(value.healthDigest) ||
    !boundedCanonical(value, maximumHealthBytes) ||
    inspectAgentControlJson(value, maximumHealthBytes).length > 0
  ) {
    return fail('Owner health shape is invalid.');
  }
  const checkedAt = Date.parse(value.checkedAt);
  const expiresAt = Date.parse(value.expiresAt);
  const { healthDigest, ...base } =
    value as unknown as AgentEvaluationRuntimeFactSourceOwnerHealth;
  if (
    expiresAt <= checkedAt ||
    expiresAt - checkedAt > maximumRegistrationLifetimeMs ||
    expiresAt < Date.parse(request.minimumExpiresAt) ||
    healthDigest !== digestAgentCanonicalValue(base)
  ) {
    return fail('Owner health binding drifted.');
  }
  return Object.freeze({
    ...(value as unknown as AgentEvaluationRuntimeFactSourceOwnerHealth),
  });
};

export const decodeAgentEvaluationRuntimeFactSourceRegistrationAuthorityResult =
  (
    value: unknown,
    request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
    stageDigest: CanonicalDigest
  ): AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult => {
    if (
      !exactRecord(value, ['ownerHealth', 'ownerAdmissionDigest']) ||
      !isAgentCanonicalDigest(stageDigest) ||
      !isAgentCanonicalDigest(value.ownerAdmissionDigest)
    ) {
      return fail('Registration owner result shape is invalid.');
    }
    const ownerHealth = decodeAgentEvaluationRuntimeFactSourceOwnerHealth(
      value.ownerHealth,
      request
    );
    const expectedAdmission =
      digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
        request.requestDigest,
        ownerHealth.healthDigest,
        stageDigest
      );
    if (value.ownerAdmissionDigest !== expectedAdmission) {
      return fail('Registration owner admission drifted.');
    }
    return Object.freeze({
      ownerHealth,
      ownerAdmissionDigest: expectedAdmission,
    });
  };
