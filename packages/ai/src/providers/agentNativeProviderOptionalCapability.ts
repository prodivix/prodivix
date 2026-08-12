import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  scanAgentArtifactForProtectedHoldoutLeak,
  scanAgentArtifactForSecretCanaries,
} from '../security/agentSecurity';
import {
  isAgentCapabilityProbeProgram,
  type AgentCapabilityProbeProfileId,
  type AgentCapabilityProbeProgram,
} from './agentCapabilityProbeProgram';
import {
  createAgentOpaqueContinuation,
  createAgentProviderCacheReceipt,
} from './agentInvocationFacts';
import type {
  AgentNativeProviderRuntimeOptionalCapabilityFact,
  AgentNativeProviderRuntimeFactSanitization,
} from './agentNativeProviderAdapters';
import type { AgentUsageVector } from './agentProvider.types';
import { AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS } from './agentNativeProviderStateVault';

export const AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_RECEIPT_FORMAT =
  'prodivix.agent-native-provider-optional-capability-source-receipt' as const;
export const AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_RECEIPT_VERSION =
  1 as const;
export const AGENT_NATIVE_PROVIDER_EXECUTION_IDENTITY_AUTHORITY_FORMAT =
  'prodivix.agent-native-provider-execution-identity-authority' as const;
export const AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_NATIVE_PROVIDER_CONTINUATION_MAXIMUM_LIFETIME_MS =
  AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS;

export type AgentNativeProviderProtocol =
  'anthropic-messages' | 'gemini-interactions' | 'openai-responses';

export type AgentNativeProviderOptionalCapabilityCodecAvailability = Readonly<{
  protocolFamily: AgentNativeProviderProtocol;
  capabilityProfileId:
    | 'g4-provider-background-job'
    | 'g4-provider-isolated-cache'
    | 'g4-provider-reasoning-continuation';
  factType: AgentNativeProviderRuntimeOptionalCapabilityFact['factType'];
  availability: 'available' | 'unavailable';
  unavailableReason:
    | 'native-background-codec-unavailable'
    | 'native-continuation-codec-unavailable'
    | null;
}>;

type AgentNativeProviderOptionalCapabilitySourceCommon = Readonly<{
  protocolFamily: AgentNativeProviderProtocol;
  capabilityProfileDigest: CanonicalDigest;
  invocationId: string;
  requestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  executionIdentityAuthority: AgentNativeProviderExecutionIdentityAuthority;
  observedAt: Instant;
}>;

export type AgentNativeProviderOptionalCapabilitySourceBinding =
  AgentNativeProviderOptionalCapabilitySourceCommon;

/** Exact projection of the already-created model invocation identity. */
export type AgentNativeProviderExecutionIdentityAuthority = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_EXECUTION_IDENTITY_AUTHORITY_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_RECEIPT_VERSION;
  invocationId: string;
  taskId: string;
  runId: string;
  generation: number;
  authorityDigest: CanonicalDigest;
}>;

export const createAgentNativeProviderExecutionIdentityAuthority = (input: {
  invocationId: string;
  taskId: string;
  runId: string;
  generation: number;
}): AgentNativeProviderExecutionIdentityAuthority => {
  if (
    !hasExactAgentControlKeys(input, [
      'invocationId',
      'taskId',
      'runId',
      'generation',
    ]) ||
    !isAgentControlIdentity(input.invocationId) ||
    !isAgentControlIdentity(input.taskId) ||
    !isAgentControlIdentity(input.runId) ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0
  ) {
    throw new TypeError('Native Provider execution identity is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_EXECUTION_IDENTITY_AUTHORITY_FORMAT,
    version: AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_RECEIPT_VERSION,
    ...input,
  });
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentNativeProviderExecutionIdentityAuthority = (
  value: unknown
): value is AgentNativeProviderExecutionIdentityAuthority => {
  if (
    !hasExactAgentControlKeys(value, [
      'format',
      'version',
      'invocationId',
      'taskId',
      'runId',
      'generation',
      'authorityDigest',
    ])
  ) {
    return false;
  }
  try {
    return sameCanonicalJson(
      value,
      createAgentNativeProviderExecutionIdentityAuthority({
        invocationId: value.invocationId as string,
        taskId: value.taskId as string,
        runId: value.runId as string,
        generation: value.generation as number,
      })
    );
  } catch {
    return false;
  }
};

export type AgentNativeProviderJobSourceProjection = Readonly<{
  sourceKind: 'provider-job-terminal-status';
  providerStateReferenceDigest: CanonicalDigest;
  opaqueProviderStateRef: string;
  stateVaultAuthorityDigest: CanonicalDigest;
  stateVaultSealRequestDigest: CanonicalDigest;
  stateVaultSealReceiptDigest: CanonicalDigest;
  taskId: string;
  runId: string;
  generation: number;
  providerStatus: 'cancelled' | 'completed' | 'failed';
}>;

export type AgentNativeProviderActiveJobSourceProjection = Readonly<{
  sourceKind: 'provider-job-active-status';
  providerStateReferenceDigest: CanonicalDigest;
  opaqueProviderStateRef: string;
  stateVaultAuthorityDigest: CanonicalDigest;
  stateVaultSealRequestDigest: CanonicalDigest;
  stateVaultSealReceiptDigest: CanonicalDigest;
  taskId: string;
  runId: string;
  generation: number;
  providerStatus: 'in-progress' | 'queued';
}>;

export type AgentNativeProviderCacheSourceProjection = Readonly<{
  sourceKind: 'provider-cache-usage';
  cacheIsolationAuthorityDigest: CanonicalDigest;
  cacheKeyDigest: CanonicalDigest;
  prefixDescriptorDigest: CanonicalDigest;
  usageVector: AgentUsageVector;
  cachedTokenCount: number;
  cacheScope: 'invocation' | 'task' | 'workspace';
  provenIsolation: 'invocation' | 'task' | 'workspace';
  providerRegion: string | null;
}>;

export type AgentNativeProviderContinuationSourceProjection = Readonly<{
  sourceKind: 'provider-stored-continuation';
  providerStateReferenceDigest: CanonicalDigest;
  opaqueProviderStateRef: string;
  stateVaultAuthorityDigest: CanonicalDigest;
  stateVaultSealRequestDigest: CanonicalDigest;
  stateVaultSealReceiptDigest: CanonicalDigest;
  taskId: string;
  runId: string;
  generation: number;
  expiresAt: Instant;
}>;

export type AgentNativeProviderOptionalCapabilitySourceProjection =
  | AgentNativeProviderActiveJobSourceProjection
  | AgentNativeProviderJobSourceProjection
  | AgentNativeProviderCacheSourceProjection
  | AgentNativeProviderContinuationSourceProjection;

export type AgentNativeProviderOptionalCapabilitySourceReceipt = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_RECEIPT_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_RECEIPT_VERSION;
  protocolFamily: AgentNativeProviderProtocol;
  capabilityProfileId:
    | 'g4-provider-background-job'
    | 'g4-provider-isolated-cache'
    | 'g4-provider-reasoning-continuation';
  capabilityProfileDigest: CanonicalDigest;
  invocationId: string;
  requestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  executionIdentityAuthority: AgentNativeProviderExecutionIdentityAuthority;
  source: AgentNativeProviderOptionalCapabilitySourceProjection;
  sourceDigest: CanonicalDigest;
  fact: AgentNativeProviderRuntimeOptionalCapabilityFact;
  observedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentNativeProviderOptionalCapabilitySourceReceiptInput =
  AgentNativeProviderOptionalCapabilitySourceCommon &
    Readonly<{
      source: AgentNativeProviderOptionalCapabilitySourceProjection;
    }>;

const receiptKeys = Object.freeze([
  'format',
  'version',
  'protocolFamily',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'invocationId',
  'requestDigest',
  'responseDigest',
  'providerConfigurationId',
  'modelLineageDigest',
  'adapterDigest',
  'executionIdentityAuthority',
  'source',
  'sourceDigest',
  'fact',
  'observedAt',
  'receiptDigest',
] as const);

const jobSourceKeys = Object.freeze([
  'sourceKind',
  'providerStateReferenceDigest',
  'opaqueProviderStateRef',
  'stateVaultAuthorityDigest',
  'stateVaultSealRequestDigest',
  'stateVaultSealReceiptDigest',
  'taskId',
  'runId',
  'generation',
  'providerStatus',
] as const);

const activeJobSourceKeys = jobSourceKeys;

const cacheSourceKeys = Object.freeze([
  'sourceKind',
  'cacheIsolationAuthorityDigest',
  'cacheKeyDigest',
  'prefixDescriptorDigest',
  'usageVector',
  'cachedTokenCount',
  'cacheScope',
  'provenIsolation',
  'providerRegion',
] as const);

const continuationSourceKeys = Object.freeze([
  'sourceKind',
  'providerStateReferenceDigest',
  'opaqueProviderStateRef',
  'stateVaultAuthorityDigest',
  'stateVaultSealRequestDigest',
  'stateVaultSealReceiptDigest',
  'taskId',
  'runId',
  'generation',
  'expiresAt',
] as const);

const profileFactType = Object.freeze({
  'g4-provider-background-job': 'provider-job-receipt',
  'g4-provider-isolated-cache': 'provider-cache-receipt',
  'g4-provider-reasoning-continuation': 'opaque-continuation',
} as const);

const sourceKindProfile = Object.freeze({
  'provider-job-active-status': 'g4-provider-background-job',
  'provider-job-terminal-status': 'g4-provider-background-job',
  'provider-cache-usage': 'g4-provider-isolated-cache',
  'provider-stored-continuation': 'g4-provider-reasoning-continuation',
} as const);

/**
 * This table describes implemented codecs only. Release support still comes
 * from a sealed active probe and never from this static mapping.
 */
export const resolveAgentNativeProviderOptionalCapabilityCodecAvailability = (
  protocolFamily: AgentNativeProviderProtocol,
  capabilityProfileId:
    | 'g4-provider-background-job'
    | 'g4-provider-isolated-cache'
    | 'g4-provider-reasoning-continuation'
): AgentNativeProviderOptionalCapabilityCodecAvailability => {
  const unavailable =
    protocolFamily === 'anthropic-messages' &&
    capabilityProfileId !== 'g4-provider-isolated-cache';
  return Object.freeze({
    protocolFamily,
    capabilityProfileId,
    factType: profileFactType[capabilityProfileId],
    availability: unavailable ? 'unavailable' : 'available',
    unavailableReason: unavailable
      ? capabilityProfileId === 'g4-provider-background-job'
        ? 'native-background-codec-unavailable'
        : 'native-continuation-codec-unavailable'
      : null,
  });
};

const validUsageVector = (value: AgentUsageVector): boolean => {
  if (
    !hasExactAgentControlKeys(value, ['amounts', 'vectorDigest']) ||
    !Array.isArray(value.amounts) ||
    value.amounts.length === 0 ||
    value.amounts.length > 32 ||
    !isAgentCanonicalDigest(value.vectorDigest) ||
    value.vectorDigest !== digestAgentCanonicalValue(value.amounts)
  ) {
    return false;
  }
  return value.amounts.every(
    (amount) =>
      hasExactAgentControlKeys(
        amount,
        ['unit', 'confidence'],
        ['logicalAmount', 'billableAmount', 'cachedAmount', 'sourceDigest']
      ) &&
      typeof amount.unit === 'string' &&
      ['estimated', 'measured', 'reported', 'unknown'].includes(
        String(amount.confidence)
      ) &&
      [amount.logicalAmount, amount.billableAmount, amount.cachedAmount]
        .filter((entry) => entry !== undefined)
        .every((entry) => /^(0|[1-9][0-9]*)$/u.test(String(entry))) &&
      (amount.sourceDigest === undefined ||
        isAgentCanonicalDigest(amount.sourceDigest))
  );
};

const cacheUsageMatches = (
  usage: AgentUsageVector,
  cachedTokenCount: number
): boolean => {
  const cached = usage.amounts.filter(
    ({ unit }) => unit === 'cache-read-token'
  );
  if (cached.length !== 1 || cachedTokenCount <= 0) return false;
  const amount = cached[0]!;
  return (
    amount.confidence === 'reported' &&
    (amount.logicalAmount === String(cachedTokenCount) ||
      amount.billableAmount === String(cachedTokenCount) ||
      amount.cachedAmount === String(cachedTokenCount))
  );
};

const sourceIsExact = (
  source: AgentNativeProviderOptionalCapabilitySourceProjection,
  program: AgentCapabilityProbeProgram,
  input: AgentNativeProviderOptionalCapabilitySourceCommon
): boolean => {
  switch (source.sourceKind) {
    case 'provider-job-active-status':
      return (
        hasExactAgentControlKeys(source, activeJobSourceKeys) &&
        isAgentCanonicalDigest(source.providerStateReferenceDigest) &&
        isAgentControlIdentity(source.opaqueProviderStateRef) &&
        isAgentCanonicalDigest(source.stateVaultAuthorityDigest) &&
        isAgentCanonicalDigest(source.stateVaultSealRequestDigest) &&
        isAgentCanonicalDigest(source.stateVaultSealReceiptDigest) &&
        isAgentControlIdentity(source.taskId) &&
        isAgentControlIdentity(source.runId) &&
        Number.isSafeInteger(source.generation) &&
        source.generation >= 0 &&
        source.taskId === input.executionIdentityAuthority.taskId &&
        source.runId === input.executionIdentityAuthority.runId &&
        source.generation === input.executionIdentityAuthority.generation &&
        ['in-progress', 'queued'].includes(source.providerStatus)
      );
    case 'provider-job-terminal-status':
      return (
        hasExactAgentControlKeys(source, jobSourceKeys) &&
        isAgentCanonicalDigest(source.providerStateReferenceDigest) &&
        isAgentControlIdentity(source.opaqueProviderStateRef) &&
        isAgentCanonicalDigest(source.stateVaultAuthorityDigest) &&
        isAgentCanonicalDigest(source.stateVaultSealRequestDigest) &&
        isAgentCanonicalDigest(source.stateVaultSealReceiptDigest) &&
        isAgentControlIdentity(source.taskId) &&
        isAgentControlIdentity(source.runId) &&
        Number.isSafeInteger(source.generation) &&
        source.generation >= 0 &&
        source.taskId === input.executionIdentityAuthority.taskId &&
        source.runId === input.executionIdentityAuthority.runId &&
        source.generation === input.executionIdentityAuthority.generation &&
        ['cancelled', 'completed', 'failed'].includes(source.providerStatus)
      );
    case 'provider-cache-usage': {
      const descriptor = program.providerRequestIntent.cachePrefixResource;
      return (
        hasExactAgentControlKeys(source, cacheSourceKeys) &&
        descriptor !== null &&
        isAgentCanonicalDigest(source.cacheIsolationAuthorityDigest) &&
        source.prefixDescriptorDigest === descriptor.descriptorDigest &&
        isAgentCanonicalDigest(source.cacheKeyDigest) &&
        validUsageVector(source.usageVector) &&
        Number.isSafeInteger(source.cachedTokenCount) &&
        cacheUsageMatches(source.usageVector, source.cachedTokenCount) &&
        ['invocation', 'task', 'workspace'].includes(source.cacheScope) &&
        ['invocation', 'task', 'workspace'].includes(source.provenIsolation) &&
        (source.providerRegion === null ||
          isAgentControlIdentity(source.providerRegion))
      );
    }
    case 'provider-stored-continuation':
      return (
        hasExactAgentControlKeys(source, continuationSourceKeys) &&
        isAgentCanonicalDigest(source.providerStateReferenceDigest) &&
        isAgentControlIdentity(source.opaqueProviderStateRef) &&
        isAgentCanonicalDigest(source.stateVaultAuthorityDigest) &&
        isAgentCanonicalDigest(source.stateVaultSealRequestDigest) &&
        isAgentCanonicalDigest(source.stateVaultSealReceiptDigest) &&
        isAgentControlIdentity(source.taskId) &&
        isAgentControlIdentity(source.runId) &&
        Number.isSafeInteger(source.generation) &&
        source.generation >= 0 &&
        source.taskId === input.executionIdentityAuthority.taskId &&
        source.runId === input.executionIdentityAuthority.runId &&
        source.generation === input.executionIdentityAuthority.generation &&
        isAgentControlInstant(source.expiresAt) &&
        Date.parse(source.expiresAt) > Date.parse(input.observedAt) &&
        Date.parse(source.expiresAt) - Date.parse(input.observedAt) <=
          AGENT_NATIVE_PROVIDER_CONTINUATION_MAXIMUM_LIFETIME_MS
      );
  }
};

const jobOutcome = (
  status: AgentNativeProviderJobSourceProjection['providerStatus']
): 'cancelled' | 'completed' | 'failed' => status;

const createFact = (
  program: AgentCapabilityProbeProgram,
  input: AgentNativeProviderOptionalCapabilitySourceCommon,
  source: AgentNativeProviderOptionalCapabilitySourceProjection
): AgentNativeProviderRuntimeOptionalCapabilityFact => {
  switch (source.sourceKind) {
    case 'provider-job-active-status': {
      const base = Object.freeze({
        providerJobId: `provider-job.${source.providerStateReferenceDigest.slice('sha256-'.length)}`,
        taskId: source.taskId,
        runId: source.runId,
        generation: source.generation,
        invocationId: input.invocationId,
        phase:
          source.providerStatus === 'queued'
            ? ('accepted' as const)
            : ('running' as const),
        callbackAuthority: 'active' as const,
      });
      return Object.freeze({
        factType: 'provider-job-receipt',
        value: Object.freeze({
          ...base,
          receiptDigest: digestAgentCanonicalValue(base),
        }),
      });
    }
    case 'provider-job-terminal-status': {
      const base = Object.freeze({
        providerJobId: `provider-job.${source.providerStateReferenceDigest.slice('sha256-'.length)}`,
        taskId: source.taskId,
        runId: source.runId,
        generation: source.generation,
        invocationId: input.invocationId,
        phase: 'terminal' as const,
        outcome: jobOutcome(source.providerStatus),
        callbackAuthority: 'revoked' as const,
      });
      return Object.freeze({
        factType: 'provider-job-receipt',
        value: Object.freeze({
          ...base,
          receiptDigest: digestAgentCanonicalValue(base),
        }),
      });
    }
    case 'provider-cache-usage':
      return Object.freeze({
        factType: 'provider-cache-receipt',
        value: createAgentProviderCacheReceipt({
          receipt: {
            cacheMode: 'prompt',
            cacheScope: source.cacheScope,
            cacheKeyDigest: source.cacheKeyDigest,
            prefixOrItemDigests: Object.freeze([
              program.providerRequestIntent.cachePrefixResource!.prefixDigest,
            ]),
            ...(source.providerRegion === null
              ? {}
              : { providerRegion: source.providerRegion }),
            usageRef: source.usageVector.vectorDigest,
          },
          isolation: source.provenIsolation,
        }),
      });
    case 'provider-stored-continuation':
      return Object.freeze({
        factType: 'opaque-continuation',
        value: createAgentOpaqueContinuation({
          continuationId: `provider-continuation.${source.providerStateReferenceDigest.slice('sha256-'.length)}`,
          encryptedBlobRef: source.opaqueProviderStateRef,
          providerConfigurationId: input.providerConfigurationId,
          modelLineageDigest: input.modelLineageDigest,
          taskId: source.taskId,
          runId: source.runId,
          generation: source.generation,
          parentInvocationId: input.invocationId,
          purpose: 'provider-tool-loop-continuation',
          createdAt: input.observedAt,
          expiresAt: source.expiresAt,
        }),
      });
  }
};

const receiptBase = (
  receipt: Omit<
    AgentNativeProviderOptionalCapabilitySourceReceipt,
    'receiptDigest'
  >
) => Object.freeze({ ...receipt });

const sanitized = (
  value: unknown,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): boolean => {
  try {
    return (
      inspectAgentControlJson(
        value,
        AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_MAXIMUM_BYTES
      ).length === 0 &&
      !containsAgentControlCredentialLikeText(canonicalJsonText(value)) &&
      (sanitization.protectedMaterialCanaries.length === 0 ||
        scanAgentArtifactForProtectedHoldoutLeak(
          value,
          sanitization.protectedMaterialCanaries
        ).length === 0) &&
      (sanitization.secretCanaries.length === 0 ||
        scanAgentArtifactForSecretCanaries(value, sanitization.secretCanaries)
          .length === 0)
    );
  } catch {
    return false;
  }
};

export const createAgentNativeProviderOptionalCapabilitySourceProjection = (
  program: AgentCapabilityProbeProgram,
  input: CreateAgentNativeProviderOptionalCapabilitySourceReceiptInput,
  sanitization: AgentNativeProviderRuntimeFactSanitization = Object.freeze({
    protectedMaterialCanaries: Object.freeze([]),
    secretCanaries: Object.freeze([]),
  })
): AgentNativeProviderOptionalCapabilitySourceProjection => {
  const capabilityProfileId = sourceKindProfile[input.source.sourceKind];
  const availability =
    resolveAgentNativeProviderOptionalCapabilityCodecAvailability(
      input.protocolFamily,
      capabilityProfileId
    );
  if (
    !isAgentCapabilityProbeProgram(program) ||
    program.profileProjection.capabilityProfileId !== capabilityProfileId ||
    program.profileProjection.capabilityProfileDigest !==
      input.capabilityProfileDigest ||
    availability.availability !== 'available' ||
    !isAgentControlIdentity(input.invocationId) ||
    !isAgentCanonicalDigest(input.requestDigest) ||
    !isAgentCanonicalDigest(input.responseDigest) ||
    !isAgentControlIdentity(input.providerConfigurationId) ||
    !isAgentCanonicalDigest(input.modelLineageDigest) ||
    !isAgentCanonicalDigest(input.adapterDigest) ||
    !isAgentNativeProviderExecutionIdentityAuthority(
      input.executionIdentityAuthority
    ) ||
    input.executionIdentityAuthority.invocationId !== input.invocationId ||
    !isAgentControlInstant(input.observedAt) ||
    !sourceIsExact(input.source, program, input)
  ) {
    throw new TypeError(
      'Native provider optional capability source is invalid.'
    );
  }
  if (!sanitized(input.source, sanitization)) {
    throw new TypeError(
      'Native provider optional capability source is unsafe or unbounded.'
    );
  }
  return Object.freeze({ ...input.source });
};

export const isAgentNativeProviderOptionalCapabilitySourceProjection = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilitySourceCommon,
  sanitization: AgentNativeProviderRuntimeFactSanitization = Object.freeze({
    protectedMaterialCanaries: Object.freeze([]),
    secretCanaries: Object.freeze([]),
  })
): value is AgentNativeProviderOptionalCapabilitySourceProjection => {
  try {
    return sameCanonicalJson(
      value,
      createAgentNativeProviderOptionalCapabilitySourceProjection(
        program,
        {
          ...binding,
          source:
            value as AgentNativeProviderOptionalCapabilitySourceProjection,
        },
        sanitization
      )
    );
  } catch {
    return false;
  }
};

export const createAgentNativeProviderOptionalCapabilitySourceReceipt = (
  program: AgentCapabilityProbeProgram,
  input: CreateAgentNativeProviderOptionalCapabilitySourceReceiptInput,
  sanitization: AgentNativeProviderRuntimeFactSanitization = Object.freeze({
    protectedMaterialCanaries: Object.freeze([]),
    secretCanaries: Object.freeze([]),
  })
): AgentNativeProviderOptionalCapabilitySourceReceipt => {
  const source = createAgentNativeProviderOptionalCapabilitySourceProjection(
    program,
    input,
    sanitization
  );
  const capabilityProfileId = sourceKindProfile[source.sourceKind];
  const fact = createFact(program, input, source);
  const base = receiptBase({
    format: AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_RECEIPT_FORMAT,
    version: AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_SOURCE_RECEIPT_VERSION,
    protocolFamily: input.protocolFamily,
    capabilityProfileId,
    capabilityProfileDigest: input.capabilityProfileDigest,
    invocationId: input.invocationId,
    requestDigest: input.requestDigest,
    responseDigest: input.responseDigest,
    providerConfigurationId: input.providerConfigurationId,
    modelLineageDigest: input.modelLineageDigest,
    adapterDigest: input.adapterDigest,
    executionIdentityAuthority: input.executionIdentityAuthority,
    source,
    sourceDigest: digestAgentCanonicalValue(source),
    fact,
    observedAt: input.observedAt,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!sanitized(receipt, sanitization)) {
    throw new TypeError(
      'Native provider optional capability source is unsafe or unbounded.'
    );
  }
  return receipt;
};

export const isAgentNativeProviderOptionalCapabilitySourceReceipt = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  sanitization: AgentNativeProviderRuntimeFactSanitization = Object.freeze({
    protectedMaterialCanaries: Object.freeze([]),
    secretCanaries: Object.freeze([]),
  })
): value is AgentNativeProviderOptionalCapabilitySourceReceipt => {
  if (!hasExactAgentControlKeys(value, receiptKeys)) return false;
  try {
    const receipt = value as AgentNativeProviderOptionalCapabilitySourceReceipt;
    const {
      format: _format,
      version: _version,
      capabilityProfileId: _capabilityProfileId,
      sourceDigest: _sourceDigest,
      fact: _fact,
      receiptDigest: _receiptDigest,
      ...input
    } = receipt;
    return sameCanonicalJson(
      receipt,
      createAgentNativeProviderOptionalCapabilitySourceReceipt(
        program,
        input,
        sanitization
      )
    );
  } catch {
    return false;
  }
};

export const matchAgentNativeProviderOptionalCapabilitySourceBinding = (
  receipt: AgentNativeProviderOptionalCapabilitySourceReceipt,
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilitySourceCommon
): boolean =>
  isAgentNativeProviderOptionalCapabilitySourceReceipt(receipt, program) &&
  receipt.protocolFamily === binding.protocolFamily &&
  receipt.capabilityProfileDigest === binding.capabilityProfileDigest &&
  receipt.invocationId === binding.invocationId &&
  receipt.requestDigest === binding.requestDigest &&
  receipt.responseDigest === binding.responseDigest &&
  receipt.providerConfigurationId === binding.providerConfigurationId &&
  receipt.modelLineageDigest === binding.modelLineageDigest &&
  receipt.adapterDigest === binding.adapterDigest &&
  sameCanonicalJson(
    receipt.executionIdentityAuthority,
    binding.executionIdentityAuthority
  ) &&
  receipt.observedAt === binding.observedAt;

export const isAgentNativeProviderOptionalCapabilityProfileId = (
  value: AgentCapabilityProbeProfileId
): value is
  | 'g4-provider-background-job'
  | 'g4-provider-isolated-cache'
  | 'g4-provider-reasoning-continuation' =>
  Object.hasOwn(profileFactType, value);
