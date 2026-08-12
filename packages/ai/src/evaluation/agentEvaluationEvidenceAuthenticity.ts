import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
  inspectAgentControlJson,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { AgentProviderProtocolFamily } from '../domain/agent.types';
import type {
  AgentCost,
  AgentModelInvocationReceipt,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import {
  createAgentUsageVector,
  normalizeAgentCosts,
} from '../usage/agentUsage';
import type {
  AgentEvaluationReviewCandidateRef,
  AgentEvaluationReviewRasterScanReceipt,
  AgentEvaluationTransportAttemptReceipt,
  AgentEvaluationTransportRetryReceipt,
} from './agentEvaluation.types';
import type { AgentEvaluationControlledRuntimeReceipt } from './agentEvaluationControlledRuntime';
import {
  isAgentEvaluationCapabilityEffectBootstrapInvocationAuthority,
  isAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority,
  isAgentEvaluationCapabilityEffectInputBindingKind,
  isAgentEvaluationCapabilityEffectRequestRefIssuanceDecision,
} from './agentEvaluationCapabilityEffectAuthority';
import type { AgentEvaluationPreDispatchFailureReceipt } from './agentEvaluationPreDispatchFailure';
import { isAgentEvaluationReviewCandidateRef } from './agentEvaluationResults';
import {
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
  type AgentEvaluationResultSubmissionReceipt,
} from './agentEvaluationResultContract';
import type {
  AgentEvaluationInvocationTurnReceipt,
  AgentEvaluationInvocationTurnSetReceipt,
  AgentEvaluationBlindReviewMappingRef,
  AgentEvaluationProviderResultSpoolAad,
  AgentEvaluationProviderResultSpoolDispositionReceipt,
  AgentEvaluationProviderResultSpoolEnvelope,
  AgentEvaluationProviderResultSpoolReceipt,
  AgentEvaluationTransportDispatchIntent,
  AgentEvaluationTransportErrorCategory,
  AgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity.types';

const maximumAuthenticityBytes = 16_777_216;
const maximumCount = 10_000_000;
const maximumArtifactBytes = 536_870_912;
const maximumSpoolCiphertextBytes = 16_777_216;
const commitPattern = /^[0-9a-f]{40}$/u;
const canonicalBase64UrlPattern = /^[A-Za-z0-9_-]+$/u;

const transportErrorCategories = new Set<AgentEvaluationTransportErrorCategory>(
  [
    'G4_RUNNER_ABORTED',
    'G4_RUNNER_CAPTURE_FAILED',
    'G4_RUNNER_CONFIGURATION_INVALID',
    'G4_RUNNER_DISABLED',
    'G4_RUNNER_EGRESS_DENIED',
    'G4_RUNNER_PRODUCTION_COMPOSITION_UNAVAILABLE',
    'G4_RUNNER_PROVIDER_AUTH_REJECTED',
    'G4_RUNNER_PROVIDER_RATE_LIMITED',
    'G4_RUNNER_PROVIDER_REJECTED',
    'G4_RUNNER_RESPONSE_INVALID',
    'G4_RUNNER_RESPONSE_SECRET_LEAK',
    'G4_RUNNER_RESPONSE_TOO_LARGE',
    'G4_RUNNER_SECRET_UNAVAILABLE',
    'G4_RUNNER_SECRET_USE_DENIED',
    'G4_RUNNER_SERVER_ONLY',
    'G4_RUNNER_TRANSPORT_FAILED',
  ]
);

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Readonly<Record<string, unknown>> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.keys(value).some(isUnsafeObjectKey) ||
    inspectAgentControlJson(value, maximumAuthenticityBytes).length > 0
  ) {
    return false;
  }
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    keys.length >= required.length &&
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const boundedCount = (
  value: unknown,
  maximum = maximumCount
): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximum;

const isCanonicalDigestArray = (
  value: unknown,
  minimum = 0
): value is readonly string[] =>
  Array.isArray(value) &&
  value.length >= minimum &&
  value.length <= maximumCount &&
  value.every(
    (digest, index) =>
      isAgentCanonicalDigest(digest) &&
      (index === 0 ||
        compareUnicodeCodePoints(value[index - 1] as string, digest) < 0)
  );

const sourceDigestForUsage = (usage: AgentUsageVector): string =>
  digestAgentCanonicalValue(
    usage.amounts.map(({ unit, sourceDigest }) => ({ unit, sourceDigest }))
  );

const sourceDigestForCosts = (cost: readonly AgentCost[]): string =>
  digestAgentCanonicalValue(
    cost.map(({ currency, sourceDigest }) => ({ currency, sourceDigest }))
  );

const aggregateCostDigest = (cost: readonly AgentCost[]): string =>
  digestAgentCanonicalValue(
    cost.map(({ currency, amount, confidence }) => ({
      currency,
      amount,
      confidence,
    }))
  );

export const digestAgentEvaluationResolvedModelIdentity = (
  input: Readonly<{
    protocolFamily: AgentProviderProtocolFamily;
    transportReceiptDigest: string;
    frozenModelId: string;
    frozenImmutableModelVersion?: string;
    resolvedModelId?: string;
    resolvedModelVersion?: string;
  }>
): string =>
  digestAgentCanonicalValue({
    protocolFamily: input.protocolFamily,
    transportReceiptDigest: input.transportReceiptDigest,
    frozenModelId: input.frozenModelId,
    ...(input.frozenImmutableModelVersion
      ? { frozenImmutableModelVersion: input.frozenImmutableModelVersion }
      : {}),
    ...(input.resolvedModelId
      ? { resolvedModelId: input.resolvedModelId }
      : {}),
    ...(input.resolvedModelVersion
      ? { resolvedModelVersion: input.resolvedModelVersion }
      : {}),
  });

const hasNativeInvocationReceiptShape = (
  value: unknown
): value is AgentModelInvocationReceipt =>
  exactKeys(
    value,
    [
      'invocationId',
      'taskId',
      'runId',
      'generation',
      'attempt',
      'provider',
      'model',
      'capabilityQualificationDigest',
      'inferenceConfigurationDigest',
      'contextPackDigest',
      'requestDigest',
      'outcome',
      'usage',
      'costStatus',
      'cost',
      'startedAt',
      'completedAt',
      'receiptDigest',
    ],
    [
      'multimodalContextManifestDigest',
      'providerMediaBlockManifestDigest',
      'contextTransformReceiptRef',
      'cacheReceiptRef',
      'providerStateReceiptRef',
      'providerJobReceiptRef',
      'responseDigest',
      'pricingSnapshotRef',
    ]
  );

export const isAgentModelInvocationReceipt = (
  value: unknown
): value is AgentModelInvocationReceipt => {
  try {
    if (!hasNativeInvocationReceiptShape(value)) return false;
    const receipt = value;
    if (
      !isAgentControlIdentity(receipt.invocationId) ||
      !isAgentControlIdentity(receipt.taskId) ||
      !isAgentControlIdentity(receipt.runId) ||
      !boundedCount(receipt.generation) ||
      !boundedCount(receipt.attempt) ||
      !isAgentCanonicalDigest(receipt.capabilityQualificationDigest) ||
      !isAgentCanonicalDigest(receipt.inferenceConfigurationDigest) ||
      !isAgentCanonicalDigest(receipt.contextPackDigest) ||
      !isAgentCanonicalDigest(receipt.requestDigest) ||
      (receipt.responseDigest !== undefined &&
        !isAgentCanonicalDigest(receipt.responseDigest)) ||
      ![
        'completed',
        'refused',
        'safety-blocked',
        'truncated',
        'schema-failed',
        'provider-error',
        'cancelled',
        'timed-out',
        'partial',
      ].includes(receipt.outcome) ||
      !['priced', 'not-applicable', 'unknown'].includes(receipt.costStatus) ||
      !isAgentControlInstant(receipt.startedAt) ||
      !isAgentControlInstant(receipt.completedAt) ||
      Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
      !sameCanonicalJson(
        receipt.usage,
        createAgentUsageVector(receipt.usage.amounts)
      ) ||
      !sameCanonicalJson(receipt.cost, normalizeAgentCosts(receipt.cost)) ||
      receipt.usage.amounts.some(({ confidence, sourceDigest }) =>
        confidence === 'unknown'
          ? sourceDigest !== undefined && !isAgentCanonicalDigest(sourceDigest)
          : !isAgentCanonicalDigest(sourceDigest)
      ) ||
      receipt.cost.some(({ confidence, sourceDigest }) =>
        confidence === 'unknown'
          ? sourceDigest !== undefined && !isAgentCanonicalDigest(sourceDigest)
          : !isAgentCanonicalDigest(sourceDigest)
      )
    ) {
      return false;
    }
    for (const digest of [
      receipt.multimodalContextManifestDigest,
      receipt.providerMediaBlockManifestDigest,
    ]) {
      if (digest !== undefined && !isAgentCanonicalDigest(digest)) return false;
    }
    for (const reference of [
      receipt.contextTransformReceiptRef,
      receipt.cacheReceiptRef,
      receipt.providerStateReceiptRef,
      receipt.providerJobReceiptRef,
      receipt.pricingSnapshotRef,
    ]) {
      if (reference !== undefined && !isAgentControlIdentity(reference)) {
        return false;
      }
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return receipt.receiptDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export type CreateAgentEvaluationTransportReceiptInput = Omit<
  AgentEvaluationTransportReceipt,
  'format' | 'version' | 'receiptDigest'
>;

export type CreateAgentEvaluationTransportDispatchIntentInput = Omit<
  AgentEvaluationTransportDispatchIntent,
  'format' | 'version' | 'intentDigest'
>;

export const createAgentEvaluationTransportDispatchIntent = (
  input: CreateAgentEvaluationTransportDispatchIntentInput
): AgentEvaluationTransportDispatchIntent => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-transport-dispatch-intent' as const,
    version: 1 as const,
    ...input,
  });
  const intent = Object.freeze({
    ...base,
    intentDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationTransportDispatchIntent(intent)) {
    throw new TypeError('Evaluation transport dispatch intent is invalid.');
  }
  return intent;
};

export const isAgentEvaluationTransportDispatchIntent = (
  value: unknown
): value is AgentEvaluationTransportDispatchIntent => {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'intentId',
      'planDigest',
      'repositoryCommit',
      'attemptId',
      'descriptorDigest',
      'turnIndex',
      'protocolFamily',
      'providerConfigurationId',
      'modelLineageDigest',
      'inferenceConfigurationDigest',
      'invocationId',
      'budgetReservationId',
      'demandDigest',
      'requestDigest',
      'endpointId',
      'endpointClass',
      'requestBodyDigest',
      'requestBytes',
      'createdAt',
      'intentDigest',
    ])
  ) {
    return false;
  }
  const intent = value as AgentEvaluationTransportDispatchIntent;
  const { intentDigest: _intentDigest, ...base } = intent;
  return (
    intent.format === 'prodivix.agent-evaluation-transport-dispatch-intent' &&
    intent.version === 1 &&
    isAgentControlIdentity(intent.intentId) &&
    isAgentCanonicalDigest(intent.planDigest) &&
    commitPattern.test(intent.repositoryCommit) &&
    isAgentControlIdentity(intent.attemptId) &&
    isAgentCanonicalDigest(intent.descriptorDigest) &&
    boundedCount(intent.turnIndex) &&
    [
      'openai-responses',
      'anthropic-messages',
      'gemini-interactions',
      'openai-compatible',
    ].includes(intent.protocolFamily) &&
    isAgentControlIdentity(intent.providerConfigurationId) &&
    isAgentCanonicalDigest(intent.modelLineageDigest) &&
    isAgentCanonicalDigest(intent.inferenceConfigurationDigest) &&
    isAgentControlIdentity(intent.invocationId) &&
    isAgentControlIdentity(intent.budgetReservationId) &&
    isAgentCanonicalDigest(intent.demandDigest) &&
    isAgentCanonicalDigest(intent.requestDigest) &&
    isAgentControlIdentity(intent.endpointId) &&
    ['first-party-hosted', 'aggregator', 'self-hosted', 'local'].includes(
      intent.endpointClass
    ) &&
    isAgentCanonicalDigest(intent.requestBodyDigest) &&
    boundedCount(intent.requestBytes, maximumArtifactBytes) &&
    isAgentControlInstant(intent.createdAt) &&
    intent.intentDigest === digestAgentCanonicalValue(base)
  );
};

export const createAgentEvaluationTransportReceipt = (
  input: CreateAgentEvaluationTransportReceiptInput
): AgentEvaluationTransportReceipt => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-transport-receipt' as const,
    version: 1 as const,
    ...input,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationTransportReceipt(receipt)) {
    throw new TypeError('Evaluation transport receipt is invalid.');
  }
  return receipt;
};

export const isAgentEvaluationTransportReceipt = (
  value: unknown
): value is AgentEvaluationTransportReceipt => {
  try {
    if (
      !exactKeys(
        value,
        [
          'format',
          'version',
          'receiptId',
          'protocolFamily',
          'providerConfigurationId',
          'invocationId',
          'dispatchIntentDigest',
          'requestDigest',
          'endpointId',
          'endpointClass',
          'requestBodyDigest',
          'requestBytes',
          'responseBytes',
          'sseEventCount',
          'dispatchState',
          'outcome',
          'startedAt',
          'completedAt',
          'receiptDigest',
        ],
        [
          'httpStatus',
          'responseHeaderDigest',
          'responseBodyDigest',
          'providerRequestId',
          'providerIdentityKind',
          'providerResponseId',
          'resolvedModelId',
          'resolvedModelVersion',
          'errorCategory',
        ]
      )
    ) {
      return false;
    }
    const receipt = value as AgentEvaluationTransportReceipt;
    const responseIdentityPresent =
      receipt.providerIdentityKind !== undefined ||
      receipt.providerResponseId !== undefined;
    const hasResponseMetadata =
      receipt.httpStatus !== undefined ||
      receipt.responseHeaderDigest !== undefined ||
      receipt.responseBodyDigest !== undefined ||
      receipt.providerRequestId !== undefined ||
      responseIdentityPresent ||
      receipt.resolvedModelId !== undefined ||
      receipt.resolvedModelVersion !== undefined;
    if (
      receipt.format !== 'prodivix.agent-evaluation-transport-receipt' ||
      receipt.version !== 1 ||
      !isAgentControlIdentity(receipt.receiptId) ||
      ![
        'openai-responses',
        'anthropic-messages',
        'gemini-interactions',
        'openai-compatible',
      ].includes(receipt.protocolFamily) ||
      !isAgentControlIdentity(receipt.providerConfigurationId) ||
      !isAgentControlIdentity(receipt.invocationId) ||
      !isAgentCanonicalDigest(receipt.dispatchIntentDigest) ||
      !isAgentCanonicalDigest(receipt.requestDigest) ||
      !isAgentControlIdentity(receipt.endpointId) ||
      !['first-party-hosted', 'aggregator', 'self-hosted', 'local'].includes(
        receipt.endpointClass
      ) ||
      !isAgentCanonicalDigest(receipt.requestBodyDigest) ||
      !boundedCount(receipt.requestBytes, maximumArtifactBytes) ||
      !boundedCount(receipt.responseBytes, maximumArtifactBytes) ||
      !boundedCount(receipt.sseEventCount) ||
      !['dispatched', 'not-dispatched'].includes(receipt.dispatchState) ||
      !['completed', 'failed', 'post-dispatch-unknown'].includes(
        receipt.outcome
      ) ||
      !isAgentControlInstant(receipt.startedAt) ||
      !isAgentControlInstant(receipt.completedAt) ||
      Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
      !isAgentCanonicalDigest(receipt.receiptDigest) ||
      (receipt.httpStatus !== undefined &&
        (!Number.isSafeInteger(receipt.httpStatus) ||
          receipt.httpStatus < 100 ||
          receipt.httpStatus > 599)) ||
      (receipt.responseHeaderDigest !== undefined &&
        !isAgentCanonicalDigest(receipt.responseHeaderDigest)) ||
      (receipt.responseBodyDigest !== undefined &&
        !isAgentCanonicalDigest(receipt.responseBodyDigest)) ||
      (receipt.providerRequestId !== undefined &&
        !isAgentControlIdentity(receipt.providerRequestId)) ||
      responseIdentityPresent !==
        (receipt.providerIdentityKind !== undefined &&
          receipt.providerResponseId !== undefined) ||
      (receipt.providerResponseId !== undefined &&
        !isAgentControlIdentity(receipt.providerResponseId)) ||
      (receipt.resolvedModelId !== undefined &&
        !isAgentControlIdentity(receipt.resolvedModelId)) ||
      (receipt.resolvedModelVersion !== undefined &&
        !isAgentControlIdentity(receipt.resolvedModelVersion)) ||
      (receipt.errorCategory !== undefined &&
        !transportErrorCategories.has(receipt.errorCategory)) ||
      (receipt.outcome === 'completed' &&
        (receipt.dispatchState !== 'dispatched' ||
          receipt.httpStatus === undefined ||
          receipt.httpStatus < 200 ||
          receipt.httpStatus > 299 ||
          receipt.responseHeaderDigest === undefined ||
          receipt.responseBodyDigest === undefined ||
          receipt.providerRequestId === undefined ||
          receipt.errorCategory !== undefined)) ||
      (receipt.outcome !== 'completed' &&
        receipt.errorCategory === undefined) ||
      (receipt.outcome === 'post-dispatch-unknown' &&
        receipt.dispatchState !== 'dispatched') ||
      (receipt.dispatchState === 'not-dispatched' &&
        (receipt.outcome !== 'failed' ||
          hasResponseMetadata ||
          receipt.responseBytes !== 0 ||
          receipt.sseEventCount !== 0))
    ) {
      return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return receipt.receiptDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export type CreateAgentEvaluationProviderResultSpoolAadInput = Omit<
  AgentEvaluationProviderResultSpoolAad,
  'format' | 'version'
>;

export const createAgentEvaluationProviderResultSpoolAad = (
  input: CreateAgentEvaluationProviderResultSpoolAadInput
): AgentEvaluationProviderResultSpoolAad => {
  const aad = Object.freeze({
    format: 'prodivix.agent-evaluation-provider-result-spool-aad' as const,
    version: 1 as const,
    ...input,
  });
  if (!isAgentEvaluationProviderResultSpoolAad(aad)) {
    throw new TypeError('Evaluation provider result-spool AAD is invalid.');
  }
  return aad;
};

export const isAgentEvaluationProviderResultSpoolAad = (
  value: unknown
): value is AgentEvaluationProviderResultSpoolAad => {
  if (
    !exactKeys(
      value,
      [
        'format',
        'version',
        'namespaceDigest',
        'planDigest',
        'repositoryCommit',
        'attemptId',
        'descriptorDigest',
        'turnIndex',
        'invocationId',
        'dispatchIntentDigest',
        'transportReceiptDigest',
        'responseBodyDigest',
        'normalizedEventSetDigest',
      ],
      ['opaqueContinuationDigest']
    )
  ) {
    return false;
  }
  const aad = value as AgentEvaluationProviderResultSpoolAad;
  return (
    aad.format === 'prodivix.agent-evaluation-provider-result-spool-aad' &&
    aad.version === 1 &&
    [
      aad.namespaceDigest,
      aad.planDigest,
      aad.descriptorDigest,
      aad.dispatchIntentDigest,
      aad.transportReceiptDigest,
      aad.responseBodyDigest,
      aad.normalizedEventSetDigest,
    ].every(isAgentCanonicalDigest) &&
    (aad.opaqueContinuationDigest === undefined ||
      isAgentCanonicalDigest(aad.opaqueContinuationDigest)) &&
    commitPattern.test(aad.repositoryCommit) &&
    isAgentControlIdentity(aad.attemptId) &&
    boundedCount(aad.turnIndex) &&
    isAgentControlIdentity(aad.invocationId)
  );
};

export const digestAgentEvaluationProviderResultSpoolAad = (
  aad: AgentEvaluationProviderResultSpoolAad
): string => {
  if (!isAgentEvaluationProviderResultSpoolAad(aad)) {
    throw new TypeError('Evaluation provider result-spool AAD is invalid.');
  }
  return digestAgentCanonicalValue(aad);
};

export type AgentEvaluationProviderResultSpoolIdentityInput = Readonly<
  Pick<
    AgentEvaluationProviderResultSpoolAad,
    | 'namespaceDigest'
    | 'planDigest'
    | 'repositoryCommit'
    | 'attemptId'
    | 'descriptorDigest'
    | 'turnIndex'
    | 'invocationId'
  >
>;

export const createAgentEvaluationProviderResultSpoolId = (
  input: AgentEvaluationProviderResultSpoolIdentityInput
): string => {
  const identity = Object.freeze({
    namespaceDigest: input.namespaceDigest,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocationId,
  });
  return `evaluation-result-spool:${digestAgentCanonicalValue(identity).slice('sha256-'.length)}`;
};

const base64UrlDigit = (value: string): number => {
  const code = value.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (code === 45) return 62;
  if (code === 95) return 63;
  return -1;
};

const decodeCanonicalBase64Url = (
  value: unknown,
  maximumBytes: number,
  exactBytes?: number
): Uint8Array | undefined => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !canonicalBase64UrlPattern.test(value) ||
    value.length % 4 === 1
  ) {
    return undefined;
  }
  const byteLength = Math.floor((value.length * 6) / 8);
  if (
    byteLength > maximumBytes ||
    (exactBytes !== undefined && byteLength !== exactBytes)
  ) {
    return undefined;
  }
  const remainder = value.length % 4;
  const finalDigit = base64UrlDigit(value.at(-1)!);
  if (
    finalDigit < 0 ||
    (remainder === 2 && (finalDigit & 0x0f) !== 0) ||
    (remainder === 3 && (finalDigit & 0x03) !== 0)
  ) {
    return undefined;
  }
  const bytes = new Uint8Array(byteLength);
  let accumulator = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (const character of value) {
    const digit = base64UrlDigit(character);
    if (digit < 0) return undefined;
    accumulator = (accumulator << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[byteIndex] = (accumulator >>> bitCount) & 0xff;
      byteIndex += 1;
    }
  }
  return byteIndex === byteLength ? bytes : undefined;
};

export type CreateAgentEvaluationProviderResultSpoolEnvelopeInput = Omit<
  AgentEvaluationProviderResultSpoolEnvelope,
  | 'format'
  | 'version'
  | 'ciphertextDigest'
  | 'ciphertextSizeBytes'
  | 'envelopeDigest'
>;

export const createAgentEvaluationProviderResultSpoolEnvelope = (
  input: CreateAgentEvaluationProviderResultSpoolEnvelopeInput
): AgentEvaluationProviderResultSpoolEnvelope => {
  const ciphertext = decodeCanonicalBase64Url(
    input.ciphertextBase64Url,
    maximumSpoolCiphertextBytes
  );
  if (!ciphertext) {
    throw new TypeError(
      'Evaluation provider result-spool ciphertext is invalid.'
    );
  }
  const ciphertextDigest = digestAgentCanonicalBytes(ciphertext);
  ciphertext.fill(0);
  const ciphertextSizeBytes = Math.floor(
    (input.ciphertextBase64Url.length * 6) / 8
  );
  const envelopeAuthority = Object.freeze({
    algorithm: input.algorithm,
    keyId: input.keyId,
    keyVersion: input.keyVersion,
    keyRefDigest: input.keyRefDigest,
    encryptionProfileDigest: input.encryptionProfileDigest,
    nonceBase64Url: input.nonceBase64Url,
    authenticationTagBase64Url: input.authenticationTagBase64Url,
    ciphertextDigest,
    ciphertextSizeBytes,
    aadDigest: input.aadDigest,
  });
  const envelope = Object.freeze({
    format: 'prodivix.agent-evaluation-provider-result-spool-envelope' as const,
    version: 1 as const,
    ...input,
    ciphertextDigest,
    ciphertextSizeBytes,
    envelopeDigest: digestAgentCanonicalValue(envelopeAuthority),
  });
  if (!isAgentEvaluationProviderResultSpoolEnvelope(envelope)) {
    throw new TypeError(
      'Evaluation provider result-spool envelope is invalid.'
    );
  }
  return envelope;
};

export const isAgentEvaluationProviderResultSpoolEnvelope = (
  value: unknown
): value is AgentEvaluationProviderResultSpoolEnvelope => {
  try {
    if (
      !exactKeys(value, [
        'format',
        'version',
        'spoolId',
        'algorithm',
        'keyId',
        'keyVersion',
        'keyRefDigest',
        'encryptionProfileDigest',
        'nonceBase64Url',
        'authenticationTagBase64Url',
        'ciphertextBase64Url',
        'ciphertextDigest',
        'ciphertextSizeBytes',
        'aadDigest',
        'envelopeDigest',
      ])
    ) {
      return false;
    }
    const envelope = value as AgentEvaluationProviderResultSpoolEnvelope;
    const nonce = decodeCanonicalBase64Url(envelope.nonceBase64Url, 12, 12);
    const tag = decodeCanonicalBase64Url(
      envelope.authenticationTagBase64Url,
      16,
      16
    );
    const ciphertext = decodeCanonicalBase64Url(
      envelope.ciphertextBase64Url,
      maximumSpoolCiphertextBytes
    );
    if (!nonce || !tag || !ciphertext) return false;
    const ciphertextDigest = digestAgentCanonicalBytes(ciphertext);
    const ciphertextSizeBytes = ciphertext.byteLength;
    nonce.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
    const authority = {
      algorithm: envelope.algorithm,
      keyId: envelope.keyId,
      keyVersion: envelope.keyVersion,
      keyRefDigest: envelope.keyRefDigest,
      encryptionProfileDigest: envelope.encryptionProfileDigest,
      nonceBase64Url: envelope.nonceBase64Url,
      authenticationTagBase64Url: envelope.authenticationTagBase64Url,
      ciphertextDigest: envelope.ciphertextDigest,
      ciphertextSizeBytes: envelope.ciphertextSizeBytes,
      aadDigest: envelope.aadDigest,
    };
    return (
      envelope.format ===
        'prodivix.agent-evaluation-provider-result-spool-envelope' &&
      envelope.version === 1 &&
      isAgentControlIdentity(envelope.spoolId) &&
      envelope.algorithm === 'aes-256-gcm' &&
      isAgentControlIdentity(envelope.keyId) &&
      Number.isSafeInteger(envelope.keyVersion) &&
      envelope.keyVersion > 0 &&
      isAgentCanonicalDigest(envelope.keyRefDigest) &&
      isAgentCanonicalDigest(envelope.encryptionProfileDigest) &&
      isAgentCanonicalDigest(envelope.aadDigest) &&
      envelope.ciphertextDigest === ciphertextDigest &&
      envelope.ciphertextSizeBytes === ciphertextSizeBytes &&
      envelope.envelopeDigest === digestAgentCanonicalValue(authority)
    );
  } catch {
    return false;
  }
};

export type CreateAgentEvaluationProviderResultSpoolReceiptInput = Readonly<{
  aad: AgentEvaluationProviderResultSpoolAad;
  envelope: AgentEvaluationProviderResultSpoolEnvelope;
  responseDigest: string;
  retentionClass: 'attempt-resume-only';
  retentionPolicyDigest: string;
  createdAt: string;
  expiresAt: string;
}>;

export const createAgentEvaluationProviderResultSpoolReceipt = (
  input: CreateAgentEvaluationProviderResultSpoolReceiptInput
): AgentEvaluationProviderResultSpoolReceipt => {
  if (
    !isAgentEvaluationProviderResultSpoolAad(input.aad) ||
    !isAgentEvaluationProviderResultSpoolEnvelope(input.envelope) ||
    input.envelope.spoolId !==
      createAgentEvaluationProviderResultSpoolId(input.aad) ||
    input.envelope.aadDigest !==
      digestAgentEvaluationProviderResultSpoolAad(input.aad)
  ) {
    throw new TypeError(
      'Evaluation provider result-spool authority binding is invalid.'
    );
  }
  const aad = input.aad;
  const envelope = input.envelope;
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-provider-result-spool-receipt' as const,
    version: 1 as const,
    spoolRef: envelope.spoolId,
    planDigest: aad.planDigest,
    repositoryCommit: aad.repositoryCommit,
    attemptId: aad.attemptId,
    descriptorDigest: aad.descriptorDigest,
    turnIndex: aad.turnIndex,
    invocationId: aad.invocationId,
    dispatchIntentDigest: aad.dispatchIntentDigest,
    transportReceiptDigest: aad.transportReceiptDigest,
    algorithm: envelope.algorithm,
    encryptionProfileDigest: envelope.encryptionProfileDigest,
    keyRefDigest: envelope.keyRefDigest,
    keyId: envelope.keyId,
    keyVersion: envelope.keyVersion,
    aadDigest: envelope.aadDigest,
    envelopeDigest: envelope.envelopeDigest,
    ciphertextDigest: envelope.ciphertextDigest,
    ciphertextSizeBytes: envelope.ciphertextSizeBytes,
    responseBodyDigest: aad.responseBodyDigest,
    normalizedEventSetDigest: aad.normalizedEventSetDigest,
    responseDigest: input.responseDigest,
    ...(aad.opaqueContinuationDigest
      ? { opaqueContinuationDigest: aad.opaqueContinuationDigest }
      : {}),
    retentionClass: input.retentionClass,
    retentionPolicyDigest: input.retentionPolicyDigest,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationProviderResultSpoolReceipt(receipt)) {
    throw new TypeError('Evaluation provider result-spool receipt is invalid.');
  }
  return receipt;
};

export const isAgentEvaluationProviderResultSpoolReceipt = (
  value: unknown
): value is AgentEvaluationProviderResultSpoolReceipt => {
  try {
    if (
      !exactKeys(
        value,
        [
          'format',
          'version',
          'spoolRef',
          'planDigest',
          'repositoryCommit',
          'attemptId',
          'descriptorDigest',
          'turnIndex',
          'invocationId',
          'dispatchIntentDigest',
          'transportReceiptDigest',
          'algorithm',
          'encryptionProfileDigest',
          'keyRefDigest',
          'keyId',
          'keyVersion',
          'aadDigest',
          'envelopeDigest',
          'ciphertextDigest',
          'ciphertextSizeBytes',
          'responseBodyDigest',
          'normalizedEventSetDigest',
          'responseDigest',
          'retentionClass',
          'retentionPolicyDigest',
          'createdAt',
          'expiresAt',
          'receiptDigest',
        ],
        ['opaqueContinuationDigest']
      )
    ) {
      return false;
    }
    const receipt = value as AgentEvaluationProviderResultSpoolReceipt;
    for (const digest of [
      receipt.planDigest,
      receipt.descriptorDigest,
      receipt.dispatchIntentDigest,
      receipt.transportReceiptDigest,
      receipt.encryptionProfileDigest,
      receipt.keyRefDigest,
      receipt.retentionPolicyDigest,
      receipt.aadDigest,
      receipt.envelopeDigest,
      receipt.ciphertextDigest,
      receipt.responseBodyDigest,
      receipt.normalizedEventSetDigest,
      receipt.responseDigest,
      receipt.receiptDigest,
    ]) {
      if (!isAgentCanonicalDigest(digest)) return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return (
      receipt.format ===
        'prodivix.agent-evaluation-provider-result-spool-receipt' &&
      receipt.version === 1 &&
      isAgentControlIdentity(receipt.spoolRef) &&
      commitPattern.test(receipt.repositoryCommit) &&
      isAgentControlIdentity(receipt.attemptId) &&
      boundedCount(receipt.turnIndex) &&
      isAgentControlIdentity(receipt.invocationId) &&
      receipt.algorithm === 'aes-256-gcm' &&
      isAgentControlIdentity(receipt.keyId) &&
      Number.isSafeInteger(receipt.keyVersion) &&
      receipt.keyVersion > 0 &&
      (receipt.opaqueContinuationDigest === undefined ||
        isAgentCanonicalDigest(receipt.opaqueContinuationDigest)) &&
      boundedCount(receipt.ciphertextSizeBytes, maximumSpoolCiphertextBytes) &&
      receipt.ciphertextSizeBytes > 0 &&
      receipt.retentionClass === 'attempt-resume-only' &&
      isAgentControlInstant(receipt.createdAt) &&
      isAgentControlInstant(receipt.expiresAt) &&
      Date.parse(receipt.expiresAt) > Date.parse(receipt.createdAt) &&
      receipt.receiptDigest === digestAgentCanonicalValue(base)
    );
  } catch {
    return false;
  }
};

export type CreateAgentEvaluationProviderResultSpoolDispositionReceiptInput =
  Omit<
    AgentEvaluationProviderResultSpoolDispositionReceipt,
    'format' | 'version' | 'receiptDigest'
  >;

export const createAgentEvaluationProviderResultSpoolDispositionReceipt = (
  input: CreateAgentEvaluationProviderResultSpoolDispositionReceiptInput
): AgentEvaluationProviderResultSpoolDispositionReceipt => {
  const base = Object.freeze({
    format:
      'prodivix.agent-evaluation-provider-result-spool-disposition-receipt' as const,
    version: 1 as const,
    ...input,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationProviderResultSpoolDispositionReceipt(receipt)) {
    throw new TypeError(
      'Evaluation provider result-spool disposition receipt is invalid.'
    );
  }
  return receipt;
};

export const isAgentEvaluationProviderResultSpoolDispositionReceipt = (
  value: unknown
): value is AgentEvaluationProviderResultSpoolDispositionReceipt => {
  try {
    if (
      !exactKeys(
        value,
        [
          'format',
          'version',
          'spoolRef',
          'spoolReceiptDigest',
          'planDigest',
          'repositoryCommit',
          'attemptId',
          'descriptorDigest',
          'turnIndex',
          'invocationId',
          'disposition',
          'retentionPolicyDigest',
          'disposedAt',
          'receiptDigest',
        ],
        ['retainedUntil']
      )
    ) {
      return false;
    }
    const receipt =
      value as AgentEvaluationProviderResultSpoolDispositionReceipt;
    const retained = receipt.disposition === 'retained-encrypted';
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return (
      receipt.format ===
        'prodivix.agent-evaluation-provider-result-spool-disposition-receipt' &&
      receipt.version === 1 &&
      isAgentControlIdentity(receipt.spoolRef) &&
      isAgentCanonicalDigest(receipt.spoolReceiptDigest) &&
      isAgentCanonicalDigest(receipt.planDigest) &&
      commitPattern.test(receipt.repositoryCommit) &&
      isAgentControlIdentity(receipt.attemptId) &&
      isAgentCanonicalDigest(receipt.descriptorDigest) &&
      boundedCount(receipt.turnIndex) &&
      isAgentControlIdentity(receipt.invocationId) &&
      isAgentCanonicalDigest(receipt.retentionPolicyDigest) &&
      ['consumed-and-destroyed', 'retained-encrypted'].includes(
        receipt.disposition
      ) &&
      isAgentControlInstant(receipt.disposedAt) &&
      retained === (receipt.retainedUntil !== undefined) &&
      (receipt.retainedUntil === undefined ||
        (isAgentControlInstant(receipt.retainedUntil) &&
          Date.parse(receipt.retainedUntil) >
            Date.parse(receipt.disposedAt))) &&
      isAgentCanonicalDigest(receipt.receiptDigest) &&
      receipt.receiptDigest === digestAgentCanonicalValue(base)
    );
  } catch {
    return false;
  }
};

const isTransportAttemptReceipt = (
  value: unknown
): value is AgentEvaluationTransportAttemptReceipt => {
  if (
    !exactKeys(
      value,
      [
        'sequence',
        'requestDigest',
        'status',
        'retryable',
        'startedAt',
        'completedAt',
        'receiptDigest',
      ],
      ['invocationReceiptDigest', 'responseDigest']
    )
  ) {
    return false;
  }
  const receipt = value as AgentEvaluationTransportAttemptReceipt;
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  return (
    boundedCount(receipt.sequence) &&
    isAgentCanonicalDigest(receipt.requestDigest) &&
    [
      'completed',
      'provider-error',
      'timed-out',
      'rate-limited',
      'schema-failed',
      'blocked',
      'cancelled',
      'infrastructure-error',
    ].includes(receipt.status) &&
    typeof receipt.retryable === 'boolean' &&
    (receipt.invocationReceiptDigest === undefined ||
      isAgentCanonicalDigest(receipt.invocationReceiptDigest)) &&
    (receipt.responseDigest === undefined ||
      isAgentCanonicalDigest(receipt.responseDigest)) &&
    isAgentControlInstant(receipt.startedAt) &&
    isAgentControlInstant(receipt.completedAt) &&
    Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt) &&
    receipt.receiptDigest === digestAgentCanonicalValue(base)
  );
};

export const isAgentEvaluationTransportRetryReceipt = (
  value: unknown
): value is AgentEvaluationTransportRetryReceipt => {
  if (
    !exactKeys(value, [
      'policyDigest',
      'maximumAttempts',
      'attempts',
      'exhausted',
      'receiptDigest',
    ])
  ) {
    return false;
  }
  const receipt = value as AgentEvaluationTransportRetryReceipt;
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  return (
    isAgentCanonicalDigest(receipt.policyDigest) &&
    receipt.maximumAttempts === 1 &&
    Array.isArray(receipt.attempts) &&
    receipt.attempts.length === 1 &&
    receipt.attempts[0]?.sequence === 1 &&
    isTransportAttemptReceipt(receipt.attempts[0]) &&
    typeof receipt.exhausted === 'boolean' &&
    receipt.receiptDigest === digestAgentCanonicalValue(base)
  );
};

type DerivedTurnFields =
  | 'format'
  | 'version'
  | 'usageSourceDigest'
  | 'costSourceDigest'
  | 'evidenceDigest';
export type CreateAgentEvaluationInvocationTurnReceiptInput =
  AgentEvaluationInvocationTurnReceipt extends infer Receipt
    ? Receipt extends AgentEvaluationInvocationTurnReceipt
      ? Omit<Receipt, DerivedTurnFields>
      : never
    : never;

export const createAgentEvaluationInvocationTurnReceipt = (
  input: CreateAgentEvaluationInvocationTurnReceiptInput
): AgentEvaluationInvocationTurnReceipt => {
  const invocationReceipt =
    'invocationReceipt' in input ? input.invocationReceipt : undefined;
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-invocation-turn-receipt' as const,
    version: 1 as const,
    ...input,
    ...(invocationReceipt
      ? {
          usageSourceDigest: sourceDigestForUsage(invocationReceipt.usage),
          costSourceDigest: sourceDigestForCosts(invocationReceipt.cost),
        }
      : {}),
  });
  const receipt = Object.freeze({
    ...base,
    evidenceDigest: digestAgentCanonicalValue(base),
  }) as AgentEvaluationInvocationTurnReceipt;
  if (!isAgentEvaluationInvocationTurnReceipt(receipt)) {
    throw new TypeError('Evaluation invocation turn receipt is invalid.');
  }
  return receipt;
};

export const isAgentEvaluationInvocationTurnReceipt = (
  value: unknown
): value is AgentEvaluationInvocationTurnReceipt => {
  try {
    if (
      !exactKeys(
        value,
        [
          'format',
          'version',
          'planDigest',
          'repositoryCommit',
          'attemptId',
          'descriptorDigest',
          'turnIndex',
          'invocationId',
          'status',
          'dispatchState',
          'terminal',
          'caseDefinitionDigest',
          'contextPackDigest',
          'evidenceDigest',
        ],
        [
          'dispatchIntentDigest',
          'transportReceiptDigest',
          'transportRetryReceipt',
          'invocationReceipt',
          'providerRequestId',
          'executionFailureAuthorityReceiptDigest',
          'resolvedModelId',
          'resolvedModelVersion',
          'resolvedModelIdentityDigest',
          'responseHeaderDigest',
          'mediaRepresentationManifestDigest',
          'requestArtifactDigest',
          'responseArtifactDigest',
          'providerResultSpoolReceiptDigest',
          'usageSourceDigest',
          'costSourceDigest',
          'usageSourceReceiptDigest',
          'costSourceReceiptDigest',
          'continuationReceiptDigest',
          'resultSubmissionReceiptDigest',
          'controlledRuntimeReceiptDigest',
          'zeroToolCallDisposition',
          'capabilityEffectBindingKind',
          'postObservationRequestRefIssuanceDecision',
          'providerCapabilityObservationReceiptDigest',
          'bootstrapInvocationAuthority',
          'bootstrapProviderRequestAuthority',
        ]
      )
    ) {
      return false;
    }
    const turn = value as AgentEvaluationInvocationTurnReceipt;
    const completedTerminal = turn.status === 'completed' && turn.terminal;
    const completedContinuation = turn.status === 'completed' && !turn.terminal;
    const bootstrapContinuation =
      completedContinuation &&
      turn.zeroToolCallDisposition === 'seal-observation-and-continue';
    const capabilityUnavailable =
      completedTerminal && turn.zeroToolCallDisposition === 'grade-unavailable';
    const regularContinuation =
      completedContinuation && turn.zeroToolCallDisposition === undefined;
    const regularTerminal =
      completedTerminal && turn.zeroToolCallDisposition === undefined;
    const failedTerminal = turn.status !== 'completed' && turn.terminal;
    if (
      turn.format !== 'prodivix.agent-evaluation-invocation-turn-receipt' ||
      turn.version !== 1 ||
      !isAgentCanonicalDigest(turn.planDigest) ||
      !commitPattern.test(turn.repositoryCommit) ||
      !isAgentControlIdentity(turn.attemptId) ||
      !isAgentCanonicalDigest(turn.descriptorDigest) ||
      !boundedCount(turn.turnIndex) ||
      !isAgentControlIdentity(turn.invocationId) ||
      ![
        'completed',
        'provider-error',
        'timed-out',
        'rate-limited',
        'schema-failed',
        'blocked',
        'cancelled',
        'infrastructure-error',
      ].includes(turn.status) ||
      !['not-created', 'not-dispatched', 'dispatched'].includes(
        turn.dispatchState
      ) ||
      typeof turn.terminal !== 'boolean' ||
      !isAgentCanonicalDigest(turn.caseDefinitionDigest) ||
      !isAgentCanonicalDigest(turn.contextPackDigest) ||
      !isAgentCanonicalDigest(turn.evidenceDigest)
    ) {
      return false;
    }
    for (const identity of [
      turn.providerRequestId,
      turn.resolvedModelId,
      turn.resolvedModelVersion,
    ]) {
      if (identity !== undefined && !isAgentControlIdentity(identity)) {
        return false;
      }
    }
    for (const digest of [
      turn.executionFailureAuthorityReceiptDigest,
      turn.dispatchIntentDigest,
      turn.transportReceiptDigest,
      turn.resolvedModelIdentityDigest,
      turn.responseHeaderDigest,
      turn.mediaRepresentationManifestDigest,
      turn.requestArtifactDigest,
      turn.responseArtifactDigest,
      turn.providerResultSpoolReceiptDigest,
      turn.usageSourceDigest,
      turn.costSourceDigest,
      turn.usageSourceReceiptDigest,
      turn.costSourceReceiptDigest,
      turn.continuationReceiptDigest,
      turn.resultSubmissionReceiptDigest,
      turn.controlledRuntimeReceiptDigest,
      turn.providerCapabilityObservationReceiptDigest,
    ]) {
      if (digest !== undefined && !isAgentCanonicalDigest(digest)) return false;
    }
    const hasCapabilityBootstrapAuthority =
      turn.zeroToolCallDisposition !== undefined ||
      turn.capabilityEffectBindingKind !== undefined ||
      turn.postObservationRequestRefIssuanceDecision !== undefined ||
      turn.providerCapabilityObservationReceiptDigest !== undefined ||
      turn.bootstrapInvocationAuthority !== undefined ||
      turn.bootstrapProviderRequestAuthority !== undefined;
    if (
      hasCapabilityBootstrapAuthority &&
      (turn.zeroToolCallDisposition === undefined ||
        !['grade-unavailable', 'seal-observation-and-continue'].includes(
          turn.zeroToolCallDisposition
        ) ||
        !isAgentEvaluationCapabilityEffectInputBindingKind(
          turn.capabilityEffectBindingKind
        ) ||
        !isAgentEvaluationCapabilityEffectRequestRefIssuanceDecision(
          turn.postObservationRequestRefIssuanceDecision
        ) ||
        !isAgentCanonicalDigest(
          turn.providerCapabilityObservationReceiptDigest
        ) ||
        !isAgentEvaluationCapabilityEffectBootstrapInvocationAuthority(
          turn.bootstrapInvocationAuthority
        ) ||
        !isAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority(
          turn.bootstrapProviderRequestAuthority
        ) ||
        turn.turnIndex !== 0 ||
        turn.bootstrapInvocationAuthority.bindingKind !==
          turn.capabilityEffectBindingKind ||
        turn.bootstrapProviderRequestAuthority
          .invocationMaterialAuthorityDigest !==
          turn.bootstrapInvocationAuthority.authorityDigest ||
        turn.bootstrapProviderRequestAuthority.bindingKind !==
          turn.capabilityEffectBindingKind ||
        turn.bootstrapProviderRequestAuthority.decisionDigest !==
          turn.bootstrapInvocationAuthority.decisionDigest ||
        turn.bootstrapProviderRequestAuthority.requestDigest !==
          turn.requestArtifactDigest ||
        turn.postObservationRequestRefIssuanceDecision.bindingKind !==
          turn.capabilityEffectBindingKind ||
        turn.postObservationRequestRefIssuanceDecision.turnIndex !== 1 ||
        turn.postObservationRequestRefIssuanceDecision.sourceLifecycle !==
          'prior-sealed-provider-observation' ||
        (bootstrapContinuation
          ? turn.postObservationRequestRefIssuanceDecision.disposition !==
              'issue-request-ref' ||
            turn.postObservationRequestRefIssuanceDecision
              .priorSourceTurnIndex !== 0 ||
            turn.postObservationRequestRefIssuanceDecision
              .priorSourceObservationReceiptDigest !==
              turn.providerCapabilityObservationReceiptDigest
          : turn.postObservationRequestRefIssuanceDecision.disposition !==
              'source-unavailable' ||
            turn.postObservationRequestRefIssuanceDecision
              .priorSourceTurnIndex !== null ||
            turn.postObservationRequestRefIssuanceDecision
              .priorSourceObservationReceiptDigest !== null))
    ) {
      return false;
    }
    const hasDispatch = turn.dispatchState !== 'not-created';
    const dispatched = turn.dispatchState === 'dispatched';
    const dispatchFacts = [
      turn.dispatchIntentDigest,
      turn.transportReceiptDigest,
      turn.transportRetryReceipt,
    ];
    const invocationFacts = [
      turn.invocationReceipt,
      turn.resolvedModelIdentityDigest,
      turn.usageSourceDigest,
      turn.costSourceDigest,
    ];
    const responseFacts = [
      turn.providerRequestId,
      turn.resolvedModelId,
      turn.resolvedModelVersion,
      turn.responseHeaderDigest,
      turn.responseArtifactDigest,
      turn.providerResultSpoolReceiptDigest,
      turn.usageSourceReceiptDigest,
      turn.costSourceReceiptDigest,
    ];
    if (
      (hasDispatch &&
        (dispatchFacts.some((fact) => fact === undefined) ||
          turn.requestArtifactDigest === undefined)) ||
      (!hasDispatch && dispatchFacts.some((fact) => fact !== undefined)) ||
      (turn.transportRetryReceipt !== undefined &&
        !isAgentEvaluationTransportRetryReceipt(turn.transportRetryReceipt)) ||
      (dispatched && invocationFacts.some((fact) => fact === undefined)) ||
      (!dispatched && invocationFacts.some((fact) => fact !== undefined)) ||
      (!dispatched && responseFacts.some((fact) => fact !== undefined)) ||
      (turn.invocationReceipt !== undefined &&
        (!isAgentModelInvocationReceipt(turn.invocationReceipt) ||
          turn.invocationId !== turn.invocationReceipt.invocationId ||
          turn.contextPackDigest !== turn.invocationReceipt.contextPackDigest ||
          turn.requestArtifactDigest !== turn.invocationReceipt.requestDigest ||
          turn.responseArtifactDigest !==
            turn.invocationReceipt.responseDigest ||
          turn.usageSourceDigest !==
            sourceDigestForUsage(turn.invocationReceipt.usage) ||
          turn.costSourceDigest !==
            sourceDigestForCosts(turn.invocationReceipt.cost)))
    ) {
      return false;
    }
    if (
      (regularContinuation &&
        (turn.dispatchState !== 'dispatched' ||
          turn.providerRequestId === undefined ||
          turn.responseHeaderDigest === undefined ||
          turn.responseArtifactDigest === undefined ||
          turn.providerResultSpoolReceiptDigest === undefined ||
          turn.usageSourceReceiptDigest === undefined ||
          turn.costSourceReceiptDigest === undefined ||
          turn.continuationReceiptDigest === undefined ||
          turn.executionFailureAuthorityReceiptDigest !== undefined ||
          turn.resultSubmissionReceiptDigest !== undefined ||
          turn.controlledRuntimeReceiptDigest !== undefined)) ||
      (bootstrapContinuation &&
        (turn.dispatchState !== 'dispatched' ||
          turn.providerRequestId === undefined ||
          turn.responseHeaderDigest === undefined ||
          turn.responseArtifactDigest === undefined ||
          turn.providerResultSpoolReceiptDigest === undefined ||
          turn.usageSourceReceiptDigest === undefined ||
          turn.costSourceReceiptDigest === undefined ||
          turn.continuationReceiptDigest !== undefined ||
          turn.executionFailureAuthorityReceiptDigest !== undefined ||
          turn.resultSubmissionReceiptDigest !== undefined ||
          turn.controlledRuntimeReceiptDigest !== undefined ||
          !hasCapabilityBootstrapAuthority)) ||
      (regularTerminal &&
        (turn.dispatchState !== 'dispatched' ||
          turn.providerRequestId === undefined ||
          turn.responseHeaderDigest === undefined ||
          turn.responseArtifactDigest === undefined ||
          turn.providerResultSpoolReceiptDigest === undefined ||
          turn.usageSourceReceiptDigest === undefined ||
          turn.costSourceReceiptDigest === undefined ||
          turn.continuationReceiptDigest !== undefined ||
          turn.executionFailureAuthorityReceiptDigest !== undefined ||
          turn.resultSubmissionReceiptDigest === undefined ||
          turn.controlledRuntimeReceiptDigest === undefined)) ||
      (capabilityUnavailable &&
        (turn.dispatchState !== 'dispatched' ||
          turn.providerRequestId === undefined ||
          turn.responseHeaderDigest === undefined ||
          turn.responseArtifactDigest === undefined ||
          turn.providerResultSpoolReceiptDigest === undefined ||
          turn.usageSourceReceiptDigest === undefined ||
          turn.costSourceReceiptDigest === undefined ||
          turn.continuationReceiptDigest !== undefined ||
          turn.executionFailureAuthorityReceiptDigest !== undefined ||
          turn.resultSubmissionReceiptDigest !== undefined ||
          turn.controlledRuntimeReceiptDigest !== undefined ||
          !hasCapabilityBootstrapAuthority)) ||
      (failedTerminal &&
        (turn.continuationReceiptDigest !== undefined ||
          turn.executionFailureAuthorityReceiptDigest === undefined ||
          turn.resultSubmissionReceiptDigest !== undefined ||
          turn.controlledRuntimeReceiptDigest !== undefined ||
          hasCapabilityBootstrapAuthority)) ||
      (!regularTerminal &&
        !regularContinuation &&
        !bootstrapContinuation &&
        !capabilityUnavailable &&
        !failedTerminal)
    ) {
      return false;
    }
    if (turn.transportRetryReceipt !== undefined) {
      const retryAttempt = turn.transportRetryReceipt.attempts[0]!;
      if (
        retryAttempt.status !== turn.status ||
        retryAttempt.requestDigest !== turn.requestArtifactDigest ||
        retryAttempt.invocationReceiptDigest !==
          (turn.invocationReceipt?.receiptDigest ?? undefined) ||
        retryAttempt.responseDigest !== turn.responseArtifactDigest ||
        turn.transportRetryReceipt.exhausted !== (turn.status !== 'completed')
      ) {
        return false;
      }
    }
    const { evidenceDigest: _evidenceDigest, ...base } = turn;
    return turn.evidenceDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export type CreateAgentEvaluationInvocationTurnSetReceiptInput = Readonly<{
  planDigest: string;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: string;
  turns: readonly AgentEvaluationInvocationTurnReceipt[];
}>;

export const createAgentEvaluationInvocationTurnSetReceipt = (
  input: CreateAgentEvaluationInvocationTurnSetReceiptInput
): AgentEvaluationInvocationTurnSetReceipt => {
  const turns = [...input.turns];
  if (
    turns.length < 1 ||
    turns.some(
      (turn, index) =>
        !isAgentEvaluationInvocationTurnReceipt(turn) ||
        turn.planDigest !== input.planDigest ||
        turn.repositoryCommit !== input.repositoryCommit ||
        turn.attemptId !== input.attemptId ||
        turn.descriptorDigest !== input.descriptorDigest ||
        turn.turnIndex !== index ||
        turn.terminal !== (index === turns.length - 1)
    )
  ) {
    throw new TypeError('Evaluation invocation turn-set input is invalid.');
  }
  const terminal = turns.at(-1)!;
  const aggregateUsage = createAgentUsageVector(
    turns.flatMap(({ invocationReceipt }) =>
      invocationReceipt ? invocationReceipt.usage.amounts : []
    )
  );
  const aggregateCost = normalizeAgentCosts(
    turns.flatMap(({ invocationReceipt }) =>
      invocationReceipt ? invocationReceipt.cost : []
    )
  );
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-invocation-turn-set-receipt' as const,
    version: 1 as const,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    turnReceiptDigests: Object.freeze(
      turns.map(({ evidenceDigest }) => evidenceDigest)
    ),
    terminalTurnIndex: terminal.turnIndex,
    terminalStatus: terminal.status,
    dispatchedInvocationCount: turns.filter(
      ({ dispatchState }) => dispatchState === 'dispatched'
    ).length,
    aggregateUsage,
    aggregateUsageDigest: aggregateUsage.vectorDigest,
    aggregateCost,
    aggregateCostDigest: aggregateCostDigest(aggregateCost),
    sourceReceiptSetDigest: digestAgentCanonicalValue(
      turns.flatMap(({ usageSourceReceiptDigest, costSourceReceiptDigest }) =>
        [usageSourceReceiptDigest, costSourceReceiptDigest].filter(
          (digest): digest is string => digest !== undefined
        )
      )
    ),
    ...(terminal.status === 'completed' &&
    terminal.zeroToolCallDisposition === 'grade-unavailable'
      ? {
          terminalZeroToolCallDisposition: 'grade-unavailable' as const,
          terminalCapabilityEffectBindingKind:
            terminal.capabilityEffectBindingKind,
          terminalPostObservationRequestRefIssuanceDecisionDigest:
            terminal.postObservationRequestRefIssuanceDecision.decisionDigest,
          terminalProviderCapabilityObservationReceiptDigest:
            terminal.providerCapabilityObservationReceiptDigest,
          terminalBootstrapInvocationAuthorityDigest:
            terminal.bootstrapInvocationAuthority.authorityDigest,
          terminalBootstrapProviderRequestDigest:
            terminal.bootstrapProviderRequestAuthority.requestDigest,
        }
      : terminal.status === 'completed'
        ? {
            terminalResultSubmissionReceiptDigest:
              terminal.resultSubmissionReceiptDigest,
            terminalControlledRuntimeReceiptDigest:
              terminal.controlledRuntimeReceiptDigest,
          }
        : {
            terminalExecutionFailureAuthorityReceiptDigest:
              terminal.executionFailureAuthorityReceiptDigest,
          }),
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  }) as AgentEvaluationInvocationTurnSetReceipt;
  if (!isAgentEvaluationInvocationTurnSetReceipt(receipt)) {
    throw new TypeError('Evaluation invocation turn-set receipt is invalid.');
  }
  return receipt;
};

export const isAgentEvaluationInvocationTurnSetReceipt = (
  value: unknown
): value is AgentEvaluationInvocationTurnSetReceipt => {
  try {
    if (
      !exactKeys(
        value,
        [
          'format',
          'version',
          'planDigest',
          'repositoryCommit',
          'attemptId',
          'descriptorDigest',
          'turnReceiptDigests',
          'terminalTurnIndex',
          'terminalStatus',
          'dispatchedInvocationCount',
          'aggregateUsage',
          'aggregateUsageDigest',
          'aggregateCost',
          'aggregateCostDigest',
          'sourceReceiptSetDigest',
          'receiptDigest',
        ],
        [
          'terminalResultSubmissionReceiptDigest',
          'terminalControlledRuntimeReceiptDigest',
          'terminalExecutionFailureAuthorityReceiptDigest',
          'terminalZeroToolCallDisposition',
          'terminalCapabilityEffectBindingKind',
          'terminalPostObservationRequestRefIssuanceDecisionDigest',
          'terminalProviderCapabilityObservationReceiptDigest',
          'terminalBootstrapInvocationAuthorityDigest',
          'terminalBootstrapProviderRequestDigest',
        ]
      )
    ) {
      return false;
    }
    const receipt = value as AgentEvaluationInvocationTurnSetReceipt;
    const completed = receipt.terminalStatus === 'completed';
    const capabilityUnavailable =
      completed &&
      receipt.terminalZeroToolCallDisposition === 'grade-unavailable';
    if (
      receipt.format !==
        'prodivix.agent-evaluation-invocation-turn-set-receipt' ||
      receipt.version !== 1 ||
      !isAgentCanonicalDigest(receipt.planDigest) ||
      !commitPattern.test(receipt.repositoryCommit) ||
      !isAgentControlIdentity(receipt.attemptId) ||
      !isAgentCanonicalDigest(receipt.descriptorDigest) ||
      !Array.isArray(receipt.turnReceiptDigests) ||
      receipt.turnReceiptDigests.length < 1 ||
      receipt.turnReceiptDigests.some(
        (digest) => !isAgentCanonicalDigest(digest)
      ) ||
      new Set(receipt.turnReceiptDigests).size !==
        receipt.turnReceiptDigests.length ||
      receipt.terminalTurnIndex !== receipt.turnReceiptDigests.length - 1 ||
      ![
        'completed',
        'provider-error',
        'timed-out',
        'rate-limited',
        'schema-failed',
        'blocked',
        'cancelled',
        'infrastructure-error',
      ].includes(receipt.terminalStatus) ||
      !boundedCount(receipt.dispatchedInvocationCount) ||
      receipt.dispatchedInvocationCount > receipt.turnReceiptDigests.length ||
      !sameCanonicalJson(
        receipt.aggregateUsage,
        createAgentUsageVector(receipt.aggregateUsage.amounts)
      ) ||
      receipt.aggregateUsageDigest !== receipt.aggregateUsage.vectorDigest ||
      !sameCanonicalJson(
        receipt.aggregateCost,
        normalizeAgentCosts(receipt.aggregateCost)
      ) ||
      receipt.aggregateCostDigest !==
        aggregateCostDigest(receipt.aggregateCost) ||
      !isAgentCanonicalDigest(receipt.sourceReceiptSetDigest) ||
      !isAgentCanonicalDigest(receipt.receiptDigest) ||
      (completed &&
        !capabilityUnavailable &&
        (!isAgentCanonicalDigest(
          receipt.terminalResultSubmissionReceiptDigest
        ) ||
          !isAgentCanonicalDigest(
            receipt.terminalControlledRuntimeReceiptDigest
          ) ||
          receipt.terminalExecutionFailureAuthorityReceiptDigest !==
            undefined ||
          receipt.terminalZeroToolCallDisposition !== undefined ||
          receipt.terminalCapabilityEffectBindingKind !== undefined ||
          receipt.terminalPostObservationRequestRefIssuanceDecisionDigest !==
            undefined ||
          receipt.terminalProviderCapabilityObservationReceiptDigest !==
            undefined ||
          receipt.terminalBootstrapInvocationAuthorityDigest !== undefined ||
          receipt.terminalBootstrapProviderRequestDigest !== undefined)) ||
      (capabilityUnavailable &&
        (!isAgentEvaluationCapabilityEffectInputBindingKind(
          receipt.terminalCapabilityEffectBindingKind
        ) ||
          !isAgentCanonicalDigest(
            receipt.terminalPostObservationRequestRefIssuanceDecisionDigest
          ) ||
          !isAgentCanonicalDigest(
            receipt.terminalProviderCapabilityObservationReceiptDigest
          ) ||
          !isAgentCanonicalDigest(
            receipt.terminalBootstrapInvocationAuthorityDigest
          ) ||
          !isAgentCanonicalDigest(
            receipt.terminalBootstrapProviderRequestDigest
          ) ||
          receipt.terminalResultSubmissionReceiptDigest !== undefined ||
          receipt.terminalControlledRuntimeReceiptDigest !== undefined ||
          receipt.terminalExecutionFailureAuthorityReceiptDigest !==
            undefined)) ||
      (!completed &&
        (!isAgentCanonicalDigest(
          receipt.terminalExecutionFailureAuthorityReceiptDigest
        ) ||
          receipt.terminalResultSubmissionReceiptDigest !== undefined ||
          receipt.terminalControlledRuntimeReceiptDigest !== undefined ||
          receipt.terminalZeroToolCallDisposition !== undefined ||
          receipt.terminalCapabilityEffectBindingKind !== undefined ||
          receipt.terminalPostObservationRequestRefIssuanceDecisionDigest !==
            undefined ||
          receipt.terminalProviderCapabilityObservationReceiptDigest !==
            undefined ||
          receipt.terminalBootstrapInvocationAuthorityDigest !== undefined ||
          receipt.terminalBootstrapProviderRequestDigest !== undefined))
    ) {
      return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return receipt.receiptDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export const isAgentEvaluationResultSubmissionReceipt = (
  value: unknown
): value is AgentEvaluationResultSubmissionReceipt => {
  try {
    if (
      !exactKeys(value, [
        'format',
        'version',
        'attemptId',
        'invocationId',
        'descriptorDigest',
        'caseId',
        'caseDigest',
        'materialDigest',
        'caseDefinitionDigest',
        'toolId',
        'nativeToolName',
        'toolVersion',
        'schemaDigest',
        'inputSchemaDigest',
        'toolDefinitionDigest',
        'providerToolCallId',
        'toolArgumentsDigest',
        'toolEventSequence',
        'toolEventDigest',
        'terminalEventSequence',
        'terminalEventDigest',
        'submissionDigest',
        'receiptDigest',
      ])
    ) {
      return false;
    }
    const receipt = value as AgentEvaluationResultSubmissionReceipt;
    if (
      receipt.format !==
        'prodivix.agent-evaluation-result-submission-receipt' ||
      receipt.version !== 1 ||
      !isAgentControlIdentity(receipt.attemptId) ||
      !isAgentControlIdentity(receipt.invocationId) ||
      !isAgentCanonicalDigest(receipt.descriptorDigest) ||
      !isAgentControlIdentity(receipt.caseId) ||
      !isAgentControlIdentity(receipt.providerToolCallId) ||
      receipt.toolId !== AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID ||
      receipt.nativeToolName !==
        AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME ||
      receipt.toolVersion !== AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION ||
      !boundedCount(receipt.toolEventSequence) ||
      !boundedCount(receipt.terminalEventSequence) ||
      receipt.terminalEventSequence <= receipt.toolEventSequence
    ) {
      return false;
    }
    for (const digest of [
      receipt.caseDigest,
      receipt.materialDigest,
      receipt.caseDefinitionDigest,
      receipt.schemaDigest,
      receipt.inputSchemaDigest,
      receipt.toolDefinitionDigest,
      receipt.toolArgumentsDigest,
      receipt.toolEventDigest,
      receipt.terminalEventDigest,
      receipt.submissionDigest,
      receipt.receiptDigest,
    ]) {
      if (!isAgentCanonicalDigest(digest)) return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return receipt.receiptDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export const isAgentEvaluationControlledRuntimeReceipt = (
  value: unknown
): value is AgentEvaluationControlledRuntimeReceipt => {
  try {
    if (
      !exactKeys(
        value,
        [
          'format',
          'version',
          'planDigest',
          'repositoryCommit',
          'attemptId',
          'descriptorDigest',
          'caseId',
          'caseDigest',
          'materialDigest',
          'submissionReceiptDigest',
          'runtimeAuthorityId',
          'runtimeImplementationDigest',
          'artifactResolutionPolicyDigest',
          'proposalValidationPolicyDigest',
          'isolationPolicyDigest',
          'g3VerificationPolicyDigest',
          'controlledRenderPolicyDigest',
          'loopPolicyDigest',
          'maximumTurnsPerAttempt',
          'maximumToolCallsPerAttempt',
          'maximumRepairRoundsPerAttempt',
          'maximumAggregateArtifactBytes',
          'grantDigest',
          'grantGeneration',
          'toolRegistryDigest',
          'actionRegistryDigest',
          'operationSealReceiptDigests',
          'ownerAuthorityReceiptDigests',
          'verificationAttemptGrantReceiptDigests',
          'baseSnapshotDigest',
          'finalSnapshotDigest',
          'cleanupReceiptDigest',
          'sourceReferencesRevoked',
          'sandboxDestroyed',
          'ownerAuthoritySetDigest',
          'artifactResolution',
          'proposalValidation',
          'isolatedExecution',
          'g3Verification',
          'receiptDigest',
        ],
        [
          'toolExecutionReceiptSetDigest',
          'continuationReceiptSetDigest',
          'operationIntentSetDigest',
          'operationSealSetDigest',
          'verificationAttemptGrantReceiptSetDigest',
          'producedCapabilityExecutionReceiptSetDigest',
          'controlledPreview',
        ]
      )
    ) {
      return false;
    }
    const receipt = value as AgentEvaluationControlledRuntimeReceipt;
    if (
      receipt.format !==
        'prodivix.agent-evaluation-controlled-runtime-receipt' ||
      receipt.version !== 1 ||
      !isAgentCanonicalDigest(receipt.planDigest) ||
      !commitPattern.test(receipt.repositoryCommit) ||
      !isAgentControlIdentity(receipt.attemptId) ||
      !isAgentCanonicalDigest(receipt.descriptorDigest) ||
      !isAgentControlIdentity(receipt.caseId) ||
      !isAgentControlIdentity(receipt.runtimeAuthorityId) ||
      !boundedCount(receipt.maximumTurnsPerAttempt) ||
      receipt.maximumTurnsPerAttempt < 2 ||
      !boundedCount(receipt.maximumToolCallsPerAttempt) ||
      receipt.maximumToolCallsPerAttempt < 1 ||
      receipt.maximumToolCallsPerAttempt >= receipt.maximumTurnsPerAttempt ||
      !boundedCount(receipt.maximumRepairRoundsPerAttempt) ||
      receipt.maximumRepairRoundsPerAttempt < 1 ||
      !boundedCount(receipt.maximumAggregateArtifactBytes, 8_388_608) ||
      receipt.maximumAggregateArtifactBytes < 1 ||
      !boundedCount(receipt.grantGeneration) ||
      receipt.grantGeneration < 1 ||
      !isCanonicalDigestArray(receipt.operationSealReceiptDigests) ||
      !isCanonicalDigestArray(receipt.ownerAuthorityReceiptDigests, 1) ||
      !isCanonicalDigestArray(receipt.verificationAttemptGrantReceiptDigests) ||
      receipt.verificationAttemptGrantReceiptDigests.some(
        (digest) => !receipt.ownerAuthorityReceiptDigests.includes(digest)
      ) ||
      receipt.sourceReferencesRevoked !== true ||
      receipt.sandboxDestroyed !== true
    ) {
      return false;
    }
    for (const digest of [
      receipt.caseDigest,
      receipt.materialDigest,
      receipt.submissionReceiptDigest,
      receipt.runtimeImplementationDigest,
      receipt.artifactResolutionPolicyDigest,
      receipt.proposalValidationPolicyDigest,
      receipt.isolationPolicyDigest,
      receipt.g3VerificationPolicyDigest,
      receipt.controlledRenderPolicyDigest,
      receipt.loopPolicyDigest,
      receipt.grantDigest,
      receipt.toolRegistryDigest,
      receipt.actionRegistryDigest,
      receipt.baseSnapshotDigest,
      receipt.finalSnapshotDigest,
      receipt.cleanupReceiptDigest,
      receipt.ownerAuthoritySetDigest,
      receipt.receiptDigest,
    ]) {
      if (!isAgentCanonicalDigest(digest)) return false;
    }
    for (const digest of [
      receipt.toolExecutionReceiptSetDigest,
      receipt.continuationReceiptSetDigest,
      receipt.operationIntentSetDigest,
      receipt.operationSealSetDigest,
      receipt.verificationAttemptGrantReceiptSetDigest,
      receipt.producedCapabilityExecutionReceiptSetDigest,
    ]) {
      if (digest !== undefined && !isAgentCanonicalDigest(digest)) return false;
    }
    const artifact = receipt.artifactResolution;
    const proposal = receipt.proposalValidation;
    const execution = receipt.isolatedExecution;
    const verification = receipt.g3Verification;
    if (
      !exactKeys(artifact, [
        'resolvedArtifactCount',
        'resolvedArtifactBytes',
        'artifactResolutionReceiptSetDigest',
      ]) ||
      !boundedCount(artifact.resolvedArtifactCount) ||
      !boundedCount(artifact.resolvedArtifactBytes, maximumArtifactBytes) ||
      artifact.resolvedArtifactBytes > receipt.maximumAggregateArtifactBytes ||
      !isAgentCanonicalDigest(artifact.artifactResolutionReceiptSetDigest) ||
      !exactKeys(proposal, [
        'verdict',
        'typedProposalValidationReceiptDigest',
      ]) ||
      !['passed', 'failed'].includes(proposal.verdict) ||
      !isAgentCanonicalDigest(proposal.typedProposalValidationReceiptDigest) ||
      !exactKeys(
        execution,
        [
          'isolationPolicyDigest',
          'toolCallCount',
          'repairRoundCount',
          'commandCount',
          'commandReceiptSetDigest',
          'transactionCount',
        ],
        ['toolReceiptSetDigest', 'transactionReceiptSetDigest']
      ) ||
      execution.isolationPolicyDigest !== receipt.isolationPolicyDigest ||
      !boundedCount(execution.toolCallCount) ||
      !boundedCount(execution.repairRoundCount) ||
      execution.repairRoundCount > receipt.maximumRepairRoundsPerAttempt ||
      !boundedCount(execution.commandCount) ||
      !isAgentCanonicalDigest(execution.commandReceiptSetDigest) ||
      !boundedCount(execution.transactionCount) ||
      execution.toolCallCount > 0 !==
        isAgentCanonicalDigest(execution.toolReceiptSetDigest) ||
      execution.transactionCount > 0 !==
        isAgentCanonicalDigest(execution.transactionReceiptSetDigest) ||
      execution.toolCallCount !== receipt.operationSealReceiptDigests.length ||
      execution.toolCallCount > 0 !==
        isAgentCanonicalDigest(receipt.toolExecutionReceiptSetDigest) ||
      execution.toolCallCount > 0 !==
        (isAgentCanonicalDigest(receipt.operationIntentSetDigest) &&
          isAgentCanonicalDigest(receipt.operationSealSetDigest)) ||
      (execution.toolCallCount === 0 &&
        (receipt.operationIntentSetDigest !== undefined ||
          receipt.operationSealSetDigest !== undefined)) ||
      (receipt.operationSealSetDigest !== undefined &&
        receipt.operationSealSetDigest !==
          digestAgentCanonicalValue({
            operationSealReceiptDigests: receipt.operationSealReceiptDigests,
          })) ||
      receipt.verificationAttemptGrantReceiptDigests.length > 0 !==
        isAgentCanonicalDigest(
          receipt.verificationAttemptGrantReceiptSetDigest
        ) ||
      (receipt.verificationAttemptGrantReceiptSetDigest !== undefined &&
        receipt.verificationAttemptGrantReceiptSetDigest !==
          digestAgentCanonicalValue({
            verificationAttemptGrantReceiptDigests:
              receipt.verificationAttemptGrantReceiptDigests,
          })) ||
      receipt.ownerAuthoritySetDigest !==
        digestAgentCanonicalValue({
          ownerAuthorityReceiptDigests: receipt.ownerAuthorityReceiptDigests,
        }) ||
      !exactKeys(verification, [
        'verificationPlanReceiptDigest',
        'verificationClosureDigest',
        'verdict',
      ]) ||
      !isAgentCanonicalDigest(verification.verificationPlanReceiptDigest) ||
      !isAgentCanonicalDigest(verification.verificationClosureDigest) ||
      !['passed', 'failed'].includes(verification.verdict)
    ) {
      return false;
    }
    const preview = receipt.controlledPreview;
    if (
      preview !== undefined &&
      (!exactKeys(preview, [
        'artifactRef',
        'artifactDigest',
        'mediaType',
        'width',
        'height',
        'byteLength',
        'renderPolicyDigest',
      ]) ||
        !isAgentControlIdentity(preview.artifactRef) ||
        !isAgentCanonicalDigest(preview.artifactDigest) ||
        !['image/png', 'image/webp'].includes(preview.mediaType) ||
        !boundedCount(preview.width, 4_096) ||
        preview.width < 1 ||
        !boundedCount(preview.height, 4_096) ||
        preview.height < 1 ||
        !boundedCount(preview.byteLength, maximumArtifactBytes) ||
        preview.byteLength < 1 ||
        preview.renderPolicyDigest !== receipt.controlledRenderPolicyDigest)
    ) {
      return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return receipt.receiptDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export const digestAgentEvaluationTransportReceiptSet = (
  receipts: readonly AgentEvaluationTransportReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentEvaluationPreDispatchFailureReceiptSet = (
  receipts: readonly AgentEvaluationPreDispatchFailureReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentEvaluationTransportDispatchIntentSet = (
  intents: readonly AgentEvaluationTransportDispatchIntent[]
): string =>
  digestAgentCanonicalValue(intents.map(({ intentDigest }) => intentDigest));

export const digestAgentEvaluationProviderResultSpoolReceiptSet = (
  receipts: readonly AgentEvaluationProviderResultSpoolReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentEvaluationProviderResultSpoolDispositionReceiptSet = (
  receipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentEvaluationInvocationTurnReceiptSet = (
  receipts: readonly AgentEvaluationInvocationTurnReceipt[]
): string =>
  digestAgentCanonicalValue(
    receipts.map(({ evidenceDigest }) => evidenceDigest)
  );

export const digestAgentEvaluationInvocationTurnSetReceiptSet = (
  receipts: readonly AgentEvaluationInvocationTurnSetReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentEvaluationResultSubmissionReceiptSet = (
  receipts: readonly AgentEvaluationResultSubmissionReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentEvaluationControlledRuntimeReceiptSet = (
  receipts: readonly AgentEvaluationControlledRuntimeReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentEvaluationReviewCandidateRefSet = (
  references: readonly AgentEvaluationReviewCandidateRef[]
): string =>
  digestAgentCanonicalValue(
    references.map(({ candidateDigest }) => candidateDigest)
  );

export const digestAgentEvaluationReviewRasterScanReceiptSet = (
  receipts: readonly AgentEvaluationReviewRasterScanReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const isAgentEvaluationBlindReviewMappingRef = (
  value: unknown
): value is AgentEvaluationBlindReviewMappingRef =>
  exactKeys(value, ['mappingId', 'mappingDigest']) &&
  isAgentControlIdentity(value.mappingId) &&
  isAgentCanonicalDigest(value.mappingDigest);

export const digestAgentEvaluationBlindReviewMappingRefSet = (
  references: readonly AgentEvaluationBlindReviewMappingRef[]
): string => digestAgentCanonicalValue(references);

export const canonicalAgentEvaluationAuthenticityOrder = Object.freeze({
  preDispatchFailureReceipts: (
    values: readonly AgentEvaluationPreDispatchFailureReceipt[]
  ): readonly AgentEvaluationPreDispatchFailureReceipt[] =>
    Object.freeze(
      [...values].sort(
        (left, right) =>
          compareUnicodeCodePoints(left.attemptId, right.attemptId) ||
          left.turnIndex - right.turnIndex ||
          compareUnicodeCodePoints(
            left.failureReceiptId,
            right.failureReceiptId
          )
      )
    ),
  transportDispatchIntents: (
    values: readonly AgentEvaluationTransportDispatchIntent[]
  ): readonly AgentEvaluationTransportDispatchIntent[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.intentId, right.intentId)
      )
    ),
  transportReceipts: (
    values: readonly AgentEvaluationTransportReceipt[]
  ): readonly AgentEvaluationTransportReceipt[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.receiptId, right.receiptId)
      )
    ),
  providerResultSpoolReceipts: (
    values: readonly AgentEvaluationProviderResultSpoolReceipt[]
  ): readonly AgentEvaluationProviderResultSpoolReceipt[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.spoolRef, right.spoolRef)
      )
    ),
  providerResultSpoolDispositionReceipts: (
    values: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[]
  ): readonly AgentEvaluationProviderResultSpoolDispositionReceipt[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.spoolRef, right.spoolRef)
      )
    ),
  invocationTurnReceipts: (
    values: readonly AgentEvaluationInvocationTurnReceipt[]
  ): readonly AgentEvaluationInvocationTurnReceipt[] =>
    Object.freeze(
      [...values].sort(
        (left, right) =>
          compareUnicodeCodePoints(left.attemptId, right.attemptId) ||
          left.turnIndex - right.turnIndex
      )
    ),
  invocationTurnSetReceipts: (
    values: readonly AgentEvaluationInvocationTurnSetReceipt[]
  ): readonly AgentEvaluationInvocationTurnSetReceipt[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      )
    ),
  resultSubmissionReceipts: (
    values: readonly AgentEvaluationResultSubmissionReceipt[]
  ): readonly AgentEvaluationResultSubmissionReceipt[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      )
    ),
  controlledRuntimeReceipts: (
    values: readonly AgentEvaluationControlledRuntimeReceipt[]
  ): readonly AgentEvaluationControlledRuntimeReceipt[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      )
    ),
  reviewRasterScanReceipts: (
    values: readonly AgentEvaluationReviewRasterScanReceipt[]
  ): readonly AgentEvaluationReviewRasterScanReceipt[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      )
    ),
  reviewCandidateRefs: (
    values: readonly AgentEvaluationReviewCandidateRef[]
  ): readonly AgentEvaluationReviewCandidateRef[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      )
    ),
  blindReviewMappingRefs: (
    values: readonly AgentEvaluationBlindReviewMappingRef[]
  ): readonly AgentEvaluationBlindReviewMappingRef[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.mappingId, right.mappingId)
      )
    ),
});

export const isAgentEvaluationReviewCandidateEvidenceRef = (
  value: unknown
): value is AgentEvaluationReviewCandidateRef =>
  isAgentEvaluationReviewCandidateRef(
    value as AgentEvaluationReviewCandidateRef
  );
