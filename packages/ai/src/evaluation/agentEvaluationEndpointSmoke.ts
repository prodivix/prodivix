import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type {
  AgentProviderProtocolFamily,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentCost,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import {
  createAgentUsageVector,
  normalizeAgentCosts,
} from '../usage/agentUsage';
import type { AgentEvaluationEndpointSmokeTarget } from './agentEvaluation.types';
import {
  digestAgentEvaluationResolvedModelIdentity,
  isAgentEvaluationProviderResultSpoolEnvelope,
  isAgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity';
import type {
  AgentEvaluationProviderResultSpoolEnvelope,
  AgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity.types';

const commitPattern = /^[0-9a-f]{40}$/u;
const maximumArtifactBytes = 16_777_216;
const endpointClasses = new Set<
  AgentEvaluationEndpointSmokeTarget['endpointClass']
>(['first-party-hosted', 'aggregator', 'self-hosted', 'local']);
const protocolFamilies = new Set<AgentProviderProtocolFamily>([
  'openai-responses',
  'anthropic-messages',
  'gemini-interactions',
  'openai-compatible',
]);

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const boundedCount = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximum;

const sourceDigestForUsage = (usage: AgentUsageVector): CanonicalDigest =>
  digestAgentCanonicalValue(
    usage.amounts.map(({ unit, sourceDigest }) => ({ unit, sourceDigest }))
  );

const sourceDigestForCosts = (cost: readonly AgentCost[]): CanonicalDigest =>
  digestAgentCanonicalValue(
    cost.map(({ currency, sourceDigest }) => ({ currency, sourceDigest }))
  );

const hasAuthoritativeUsage = (usage: AgentUsageVector): boolean =>
  usage.amounts.length > 0 &&
  usage.amounts.every(
    ({ confidence, sourceDigest }) =>
      confidence !== 'unknown' && isAgentCanonicalDigest(sourceDigest)
  );

const hasAuthoritativeCost = (cost: readonly AgentCost[]): boolean =>
  cost.length > 0 &&
  cost.every(
    ({ amount, confidence, sourceDigest }) =>
      amount !== undefined &&
      confidence !== 'unknown' &&
      isAgentCanonicalDigest(sourceDigest)
  );

const endpointSmokeValidatorPolicy = Object.freeze({
  format: 'prodivix.agent-evaluation-endpoint-smoke-validator-policy' as const,
  version: 1 as const,
  outputComparison: 'exact-unicode-code-point-sequence' as const,
  findingDisclosure: 'digest-only' as const,
});

export const AGENT_EVALUATION_ENDPOINT_SMOKE_VALIDATOR_POLICY_DIGEST =
  digestAgentCanonicalValue(endpointSmokeValidatorPolicy);

export type AgentEvaluationEndpointSmokeDispatchIntent = Readonly<{
  format: 'prodivix.agent-evaluation-endpoint-smoke-dispatch-intent';
  version: 1;
  intentId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  smokeTargetId: string;
  smokeTargetDigest: CanonicalDigest;
  endpointClass: AgentEvaluationEndpointSmokeTarget['endpointClass'];
  protocolFamily: AgentProviderProtocolFamily;
  providerConfigurationId: string;
  modelId: string;
  immutableModelVersion: string;
  modelLineageDigest: CanonicalDigest;
  inferenceConfigurationDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  pricingAuthorityDigest: CanonicalDigest;
  responseSpoolEncryptionPolicyDigest: CanonicalDigest;
  smokeProfileDigest: CanonicalDigest;
  invocationId: string;
  budgetReservationId: string;
  demandDigest: CanonicalDigest;
  requestDigest: CanonicalDigest;
  endpointId: string;
  requestBodyDigest: CanonicalDigest;
  requestBytes: number;
  createdAt: Instant;
  intentDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationEndpointSmokeDispatchIntentInput = Omit<
  AgentEvaluationEndpointSmokeDispatchIntent,
  'format' | 'version' | 'intentDigest'
>;

export const createAgentEvaluationEndpointSmokeDispatchIntent = (
  input: CreateAgentEvaluationEndpointSmokeDispatchIntentInput
): AgentEvaluationEndpointSmokeDispatchIntent => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-endpoint-smoke-dispatch-intent' as const,
    version: 1 as const,
    ...input,
  });
  const intent = Object.freeze({
    ...base,
    intentDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationEndpointSmokeDispatchIntent(intent)) {
    throw new TypeError(
      'Evaluation endpoint-smoke dispatch intent is invalid.'
    );
  }
  return intent;
};

export const isAgentEvaluationEndpointSmokeDispatchIntent = (
  value: unknown
): value is AgentEvaluationEndpointSmokeDispatchIntent => {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'intentId',
      'planDigest',
      'repositoryCommit',
      'smokeTargetId',
      'smokeTargetDigest',
      'endpointClass',
      'protocolFamily',
      'providerConfigurationId',
      'modelId',
      'immutableModelVersion',
      'modelLineageDigest',
      'inferenceConfigurationDigest',
      'adapterDigest',
      'pricingAuthorityDigest',
      'responseSpoolEncryptionPolicyDigest',
      'smokeProfileDigest',
      'invocationId',
      'budgetReservationId',
      'demandDigest',
      'requestDigest',
      'endpointId',
      'requestBodyDigest',
      'requestBytes',
      'createdAt',
      'intentDigest',
    ])
  ) {
    return false;
  }
  const intent = value as AgentEvaluationEndpointSmokeDispatchIntent;
  const { intentDigest: _intentDigest, ...base } = intent;
  return (
    intent.format ===
      'prodivix.agent-evaluation-endpoint-smoke-dispatch-intent' &&
    intent.version === 1 &&
    isAgentControlIdentity(intent.intentId) &&
    isAgentCanonicalDigest(intent.planDigest) &&
    commitPattern.test(intent.repositoryCommit) &&
    isAgentControlIdentity(intent.smokeTargetId) &&
    isAgentCanonicalDigest(intent.smokeTargetDigest) &&
    endpointClasses.has(intent.endpointClass) &&
    protocolFamilies.has(intent.protocolFamily) &&
    isAgentControlIdentity(intent.providerConfigurationId) &&
    isAgentControlIdentity(intent.modelId) &&
    isAgentControlIdentity(intent.immutableModelVersion) &&
    isAgentCanonicalDigest(intent.modelLineageDigest) &&
    isAgentCanonicalDigest(intent.inferenceConfigurationDigest) &&
    isAgentCanonicalDigest(intent.adapterDigest) &&
    isAgentCanonicalDigest(intent.pricingAuthorityDigest) &&
    isAgentCanonicalDigest(intent.responseSpoolEncryptionPolicyDigest) &&
    isAgentCanonicalDigest(intent.smokeProfileDigest) &&
    isAgentControlIdentity(intent.invocationId) &&
    isAgentControlIdentity(intent.budgetReservationId) &&
    isAgentCanonicalDigest(intent.demandDigest) &&
    isAgentCanonicalDigest(intent.requestDigest) &&
    isAgentControlIdentity(intent.endpointId) &&
    isAgentCanonicalDigest(intent.requestBodyDigest) &&
    boundedCount(intent.requestBytes, maximumArtifactBytes) &&
    intent.requestBytes > 0 &&
    isAgentControlInstant(intent.createdAt) &&
    intent.intentDigest === digestAgentCanonicalValue(base)
  );
};

export type AgentEvaluationEndpointSmokeResultSpoolAad = Readonly<{
  format: 'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad';
  version: 1;
  namespaceDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  smokeTargetId: string;
  smokeTargetDigest: CanonicalDigest;
  invocationId: string;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  responseBodyDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
}>;

export const isAgentEvaluationEndpointSmokeResultSpoolAad = (
  value: unknown
): value is AgentEvaluationEndpointSmokeResultSpoolAad =>
  exactKeys(value, [
    'format',
    'version',
    'namespaceDigest',
    'planDigest',
    'repositoryCommit',
    'smokeTargetId',
    'smokeTargetDigest',
    'invocationId',
    'dispatchIntentDigest',
    'transportReceiptDigest',
    'responseBodyDigest',
    'normalizedEventSetDigest',
  ]) &&
  value.format ===
    'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad' &&
  value.version === 1 &&
  isAgentCanonicalDigest(value.namespaceDigest) &&
  isAgentCanonicalDigest(value.planDigest) &&
  typeof value.repositoryCommit === 'string' &&
  commitPattern.test(value.repositoryCommit) &&
  isAgentControlIdentity(value.smokeTargetId) &&
  isAgentCanonicalDigest(value.smokeTargetDigest) &&
  isAgentControlIdentity(value.invocationId) &&
  isAgentCanonicalDigest(value.dispatchIntentDigest) &&
  isAgentCanonicalDigest(value.transportReceiptDigest) &&
  isAgentCanonicalDigest(value.responseBodyDigest) &&
  isAgentCanonicalDigest(value.normalizedEventSetDigest);

export const digestAgentEvaluationEndpointSmokeResultSpoolAad = (
  aad: AgentEvaluationEndpointSmokeResultSpoolAad
): CanonicalDigest => {
  if (!isAgentEvaluationEndpointSmokeResultSpoolAad(aad)) {
    throw new TypeError(
      'Evaluation endpoint-smoke result-spool AAD is invalid.'
    );
  }
  return digestAgentCanonicalValue(aad);
};

export const createAgentEvaluationEndpointSmokeResultSpoolId = (
  aad: Pick<
    AgentEvaluationEndpointSmokeResultSpoolAad,
    | 'planDigest'
    | 'repositoryCommit'
    | 'smokeTargetId'
    | 'smokeTargetDigest'
    | 'invocationId'
    | 'dispatchIntentDigest'
    | 'transportReceiptDigest'
  >
): string =>
  `endpoint-smoke-result-spool:${digestAgentCanonicalValue({
    planDigest: aad.planDigest,
    repositoryCommit: aad.repositoryCommit,
    smokeTargetId: aad.smokeTargetId,
    smokeTargetDigest: aad.smokeTargetDigest,
    invocationId: aad.invocationId,
    dispatchIntentDigest: aad.dispatchIntentDigest,
    transportReceiptDigest: aad.transportReceiptDigest,
  }).slice('sha256-'.length)}`;

export type AgentEvaluationEndpointSmokeResultSpoolReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-endpoint-smoke-result-spool-receipt';
  version: 1;
  spoolRef: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  smokeTargetId: string;
  smokeTargetDigest: CanonicalDigest;
  invocationId: string;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  algorithm: 'aes-256-gcm';
  encryptionProfileDigest: CanonicalDigest;
  keyRefDigest: CanonicalDigest;
  keyId: string;
  keyVersion: number;
  aadDigest: CanonicalDigest;
  envelopeDigest: CanonicalDigest;
  ciphertextDigest: CanonicalDigest;
  ciphertextSizeBytes: number;
  responseBodyDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  retentionClass: 'endpoint-smoke-resume-only';
  retentionPolicyDigest: CanonicalDigest;
  createdAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationEndpointSmokeResultSpoolReceiptInput =
  Readonly<{
    aad: AgentEvaluationEndpointSmokeResultSpoolAad;
    envelope: AgentEvaluationProviderResultSpoolEnvelope;
    responseDigest: CanonicalDigest;
    retentionPolicyDigest: CanonicalDigest;
    createdAt: Instant;
    expiresAt: Instant;
  }>;

export const createAgentEvaluationEndpointSmokeResultSpoolReceipt = (
  input: CreateAgentEvaluationEndpointSmokeResultSpoolReceiptInput
): AgentEvaluationEndpointSmokeResultSpoolReceipt => {
  if (
    !isAgentEvaluationEndpointSmokeResultSpoolAad(input.aad) ||
    !isAgentEvaluationProviderResultSpoolEnvelope(input.envelope) ||
    input.envelope.spoolId !==
      createAgentEvaluationEndpointSmokeResultSpoolId(input.aad) ||
    input.envelope.aadDigest !==
      digestAgentEvaluationEndpointSmokeResultSpoolAad(input.aad)
  ) {
    throw new TypeError(
      'Evaluation endpoint-smoke result-spool authority binding is invalid.'
    );
  }
  const { aad, envelope } = input;
  const base = Object.freeze({
    format:
      'prodivix.agent-evaluation-endpoint-smoke-result-spool-receipt' as const,
    version: 1 as const,
    spoolRef: envelope.spoolId,
    planDigest: aad.planDigest,
    repositoryCommit: aad.repositoryCommit,
    smokeTargetId: aad.smokeTargetId,
    smokeTargetDigest: aad.smokeTargetDigest,
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
    retentionClass: 'endpoint-smoke-resume-only' as const,
    retentionPolicyDigest: input.retentionPolicyDigest,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationEndpointSmokeResultSpoolReceipt(receipt)) {
    throw new TypeError(
      'Evaluation endpoint-smoke result-spool receipt is invalid.'
    );
  }
  return receipt;
};

export const isAgentEvaluationEndpointSmokeResultSpoolReceipt = (
  value: unknown
): value is AgentEvaluationEndpointSmokeResultSpoolReceipt => {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'spoolRef',
      'planDigest',
      'repositoryCommit',
      'smokeTargetId',
      'smokeTargetDigest',
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
    ])
  ) {
    return false;
  }
  const receipt = value as AgentEvaluationEndpointSmokeResultSpoolReceipt;
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      'prodivix.agent-evaluation-endpoint-smoke-result-spool-receipt' &&
    receipt.version === 1 &&
    isAgentControlIdentity(receipt.spoolRef) &&
    isAgentCanonicalDigest(receipt.planDigest) &&
    commitPattern.test(receipt.repositoryCommit) &&
    isAgentControlIdentity(receipt.smokeTargetId) &&
    isAgentCanonicalDigest(receipt.smokeTargetDigest) &&
    isAgentControlIdentity(receipt.invocationId) &&
    [
      receipt.dispatchIntentDigest,
      receipt.transportReceiptDigest,
      receipt.encryptionProfileDigest,
      receipt.keyRefDigest,
      receipt.aadDigest,
      receipt.envelopeDigest,
      receipt.ciphertextDigest,
      receipt.responseBodyDigest,
      receipt.normalizedEventSetDigest,
      receipt.responseDigest,
      receipt.retentionPolicyDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) &&
    receipt.algorithm === 'aes-256-gcm' &&
    isAgentControlIdentity(receipt.keyId) &&
    Number.isSafeInteger(receipt.keyVersion) &&
    receipt.keyVersion > 0 &&
    boundedCount(receipt.ciphertextSizeBytes, maximumArtifactBytes) &&
    receipt.ciphertextSizeBytes > 0 &&
    receipt.retentionClass === 'endpoint-smoke-resume-only' &&
    isAgentControlInstant(receipt.createdAt) &&
    isAgentControlInstant(receipt.expiresAt) &&
    Date.parse(receipt.expiresAt) > Date.parse(receipt.createdAt) &&
    receipt.receiptDigest === digestAgentCanonicalValue(base)
  );
};

export type AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt =
  Readonly<{
    format: 'prodivix.agent-evaluation-endpoint-smoke-result-spool-disposition-receipt';
    version: 1;
    spoolRef: string;
    spoolReceiptDigest: CanonicalDigest;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    smokeTargetId: string;
    smokeTargetDigest: CanonicalDigest;
    invocationId: string;
    disposition: 'consumed-and-destroyed' | 'retained-encrypted';
    retentionPolicyDigest: CanonicalDigest;
    retainedUntil?: Instant;
    disposedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type CreateAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptInput =
  Omit<
    AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
    'format' | 'version' | 'receiptDigest'
  >;

export const createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt = (
  input: CreateAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptInput
): AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt => {
  const base = Object.freeze({
    format:
      'prodivix.agent-evaluation-endpoint-smoke-result-spool-disposition-receipt' as const,
    version: 1 as const,
    ...input,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt(receipt)) {
    throw new TypeError(
      'Evaluation endpoint-smoke result-spool disposition receipt is invalid.'
    );
  }
  return receipt;
};

export const isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt = (
  value: unknown
): value is AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt => {
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
        'smokeTargetId',
        'smokeTargetDigest',
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
    value as AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt;
  const retained = receipt.disposition === 'retained-encrypted';
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      'prodivix.agent-evaluation-endpoint-smoke-result-spool-disposition-receipt' &&
    receipt.version === 1 &&
    isAgentControlIdentity(receipt.spoolRef) &&
    isAgentCanonicalDigest(receipt.spoolReceiptDigest) &&
    isAgentCanonicalDigest(receipt.planDigest) &&
    commitPattern.test(receipt.repositoryCommit) &&
    isAgentControlIdentity(receipt.smokeTargetId) &&
    isAgentCanonicalDigest(receipt.smokeTargetDigest) &&
    isAgentControlIdentity(receipt.invocationId) &&
    ['consumed-and-destroyed', 'retained-encrypted'].includes(
      receipt.disposition
    ) &&
    isAgentCanonicalDigest(receipt.retentionPolicyDigest) &&
    isAgentControlInstant(receipt.disposedAt) &&
    retained === (receipt.retainedUntil !== undefined) &&
    (receipt.retainedUntil === undefined ||
      (isAgentControlInstant(receipt.retainedUntil) &&
        Date.parse(receipt.retainedUntil) > Date.parse(receipt.disposedAt))) &&
    receipt.receiptDigest === digestAgentCanonicalValue(base)
  );
};

export type AgentEvaluationEndpointSmokeValidationFailureCategory =
  'expected-output-mismatch' | 'normalized-result-contract-invalid';

/** Sanitized validator authority; provider bytes and normalized output stay outside durable evidence. */
export type AgentEvaluationEndpointSmokeValidationFailureReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-endpoint-smoke-validation-failure-receipt';
  version: 1;
  receiptId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  smokeTargetId: string;
  smokeTargetDigest: CanonicalDigest;
  invocationId: string;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  spoolReceiptDigest: CanonicalDigest;
  validatorPolicyDigest: CanonicalDigest;
  validationCategory: AgentEvaluationEndpointSmokeValidationFailureCategory;
  findingDigest: CanonicalDigest;
  observedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationEndpointSmokeValidationFailureReceiptInput =
  Omit<
    AgentEvaluationEndpointSmokeValidationFailureReceipt,
    'format' | 'version' | 'validatorPolicyDigest' | 'receiptDigest'
  >;

export const createAgentEvaluationEndpointSmokeValidationFailureReceipt = (
  input: CreateAgentEvaluationEndpointSmokeValidationFailureReceiptInput
): AgentEvaluationEndpointSmokeValidationFailureReceipt => {
  const base = Object.freeze({
    format:
      'prodivix.agent-evaluation-endpoint-smoke-validation-failure-receipt' as const,
    version: 1 as const,
    ...input,
    validatorPolicyDigest:
      AGENT_EVALUATION_ENDPOINT_SMOKE_VALIDATOR_POLICY_DIGEST,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationEndpointSmokeValidationFailureReceipt(receipt)) {
    throw new TypeError(
      'Evaluation endpoint-smoke validation-failure receipt is invalid.'
    );
  }
  return receipt;
};

export const isAgentEvaluationEndpointSmokeValidationFailureReceipt = (
  value: unknown
): value is AgentEvaluationEndpointSmokeValidationFailureReceipt => {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'receiptId',
      'planDigest',
      'repositoryCommit',
      'smokeTargetId',
      'smokeTargetDigest',
      'invocationId',
      'dispatchIntentDigest',
      'transportReceiptDigest',
      'spoolReceiptDigest',
      'validatorPolicyDigest',
      'validationCategory',
      'findingDigest',
      'observedAt',
      'receiptDigest',
    ])
  ) {
    return false;
  }
  const receipt = value as AgentEvaluationEndpointSmokeValidationFailureReceipt;
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      'prodivix.agent-evaluation-endpoint-smoke-validation-failure-receipt' &&
    receipt.version === 1 &&
    isAgentControlIdentity(receipt.receiptId) &&
    isAgentCanonicalDigest(receipt.planDigest) &&
    commitPattern.test(receipt.repositoryCommit) &&
    isAgentControlIdentity(receipt.smokeTargetId) &&
    isAgentCanonicalDigest(receipt.smokeTargetDigest) &&
    isAgentControlIdentity(receipt.invocationId) &&
    isAgentCanonicalDigest(receipt.dispatchIntentDigest) &&
    isAgentCanonicalDigest(receipt.transportReceiptDigest) &&
    isAgentCanonicalDigest(receipt.spoolReceiptDigest) &&
    receipt.validatorPolicyDigest ===
      AGENT_EVALUATION_ENDPOINT_SMOKE_VALIDATOR_POLICY_DIGEST &&
    ['expected-output-mismatch', 'normalized-result-contract-invalid'].includes(
      receipt.validationCategory
    ) &&
    isAgentCanonicalDigest(receipt.findingDigest) &&
    isAgentControlInstant(receipt.observedAt) &&
    receipt.receiptDigest === digestAgentCanonicalValue(base)
  );
};

type AgentEvaluationEndpointSmokeReceiptCommon = Readonly<{
  format: 'prodivix.agent-evaluation-endpoint-smoke-receipt';
  version: 1;
  receiptId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  smokeTargetId: string;
  smokeTargetDigest: CanonicalDigest;
  endpointClass: AgentEvaluationEndpointSmokeTarget['endpointClass'];
  protocolFamily: AgentProviderProtocolFamily;
  providerConfigurationId: string;
  modelId: string;
  immutableModelVersion: string;
  modelLineageDigest: CanonicalDigest;
  inferenceConfigurationDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  pricingAuthorityDigest: CanonicalDigest;
  responseSpoolEncryptionPolicyDigest: CanonicalDigest;
  smokeProfileDigest: CanonicalDigest;
  invocationId: string;
  budgetReservationId: string;
  demandDigest: CanonicalDigest;
  settlementDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  requestDigest: CanonicalDigest;
  startedAt: Instant;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

type AgentEvaluationEndpointSmokeResponseAuthority = Readonly<{
  providerRequestId: string;
  responseHeaderDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
}>;

type AgentEvaluationEndpointSmokeModelAuthority = Readonly<{
  resolvedModelId: string;
  resolvedModelVersion?: string;
  resolvedModelIdentityDigest: CanonicalDigest;
}>;

type AgentEvaluationEndpointSmokeSpoolAuthority = Readonly<{
  spoolReceiptDigest: CanonicalDigest;
  spoolDispositionReceiptDigest: CanonicalDigest;
}>;

type AgentEvaluationEndpointSmokeAccountingAuthority = Readonly<{
  usage: AgentUsageVector;
  cost: readonly AgentCost[];
  usageSourceDigest: CanonicalDigest;
  costSourceDigest: CanonicalDigest;
  usageSourceReceiptDigest: CanonicalDigest;
  costSourceReceiptDigest: CanonicalDigest;
  pricingSnapshotRef?: string;
}>;

export type AgentEvaluationEndpointSmokeFailureCategory =
  | 'transport-not-dispatched'
  | 'transport-post-dispatch-unknown'
  | 'transport-failed'
  | 'provider-response-invalid'
  | 'model-identity-drift'
  | 'usage-unavailable'
  | 'cost-unavailable';

export type AgentEvaluationEndpointSmokePassedReceipt =
  AgentEvaluationEndpointSmokeReceiptCommon &
    AgentEvaluationEndpointSmokeResponseAuthority &
    AgentEvaluationEndpointSmokeModelAuthority &
    AgentEvaluationEndpointSmokeSpoolAuthority &
    AgentEvaluationEndpointSmokeAccountingAuthority &
    Readonly<{ outcome: 'passed' }>;

export type AgentEvaluationEndpointSmokeFailedReceipt =
  AgentEvaluationEndpointSmokeReceiptCommon &
    Partial<AgentEvaluationEndpointSmokeResponseAuthority> &
    Partial<AgentEvaluationEndpointSmokeModelAuthority> &
    Partial<AgentEvaluationEndpointSmokeSpoolAuthority> &
    Partial<AgentEvaluationEndpointSmokeAccountingAuthority> &
    Readonly<{
      outcome: 'failed';
      failureCategory: AgentEvaluationEndpointSmokeFailureCategory;
      validationFailureReceiptDigest?: CanonicalDigest;
    }>;

export type AgentEvaluationEndpointSmokeReceipt =
  | AgentEvaluationEndpointSmokePassedReceipt
  | AgentEvaluationEndpointSmokeFailedReceipt;

type ComputedEndpointSmokeReceiptKeys =
  | 'format'
  | 'version'
  | 'receiptDigest'
  | 'resolvedModelIdentityDigest'
  | 'usageSourceDigest'
  | 'costSourceDigest';

export type CreateAgentEvaluationEndpointSmokeReceiptInput =
  | Omit<
      AgentEvaluationEndpointSmokePassedReceipt,
      ComputedEndpointSmokeReceiptKeys
    >
  | Omit<
      AgentEvaluationEndpointSmokeFailedReceipt,
      ComputedEndpointSmokeReceiptKeys
    >;

const resolvedModelIdentityMatches = (
  receipt: Pick<
    AgentEvaluationEndpointSmokeReceiptCommon,
    | 'protocolFamily'
    | 'modelId'
    | 'immutableModelVersion'
    | 'transportReceiptDigest'
  > &
    AgentEvaluationEndpointSmokeModelAuthority
): boolean => {
  const exactVersion =
    receipt.resolvedModelVersion === receipt.immutableModelVersion;
  const singleReturnedModelIdentity =
    receipt.modelId === receipt.immutableModelVersion &&
    (receipt.resolvedModelVersion === undefined || exactVersion);
  return (
    receipt.resolvedModelId === receipt.modelId &&
    (receipt.protocolFamily === 'gemini-interactions'
      ? exactVersion
      : singleReturnedModelIdentity) &&
    receipt.resolvedModelIdentityDigest ===
      digestAgentEvaluationResolvedModelIdentity({
        protocolFamily: receipt.protocolFamily,
        transportReceiptDigest: receipt.transportReceiptDigest,
        frozenModelId: receipt.modelId,
        frozenImmutableModelVersion: receipt.immutableModelVersion,
        resolvedModelId: receipt.resolvedModelId,
        ...(receipt.resolvedModelVersion
          ? { resolvedModelVersion: receipt.resolvedModelVersion }
          : {}),
      })
  );
};

export const createAgentEvaluationEndpointSmokeReceipt = (
  input: CreateAgentEvaluationEndpointSmokeReceiptInput
): AgentEvaluationEndpointSmokeReceipt => {
  const modelIdentity =
    input.resolvedModelId === undefined
      ? {}
      : {
          resolvedModelIdentityDigest:
            digestAgentEvaluationResolvedModelIdentity({
              protocolFamily: input.protocolFamily,
              transportReceiptDigest: input.transportReceiptDigest,
              frozenModelId: input.modelId,
              frozenImmutableModelVersion: input.immutableModelVersion,
              resolvedModelId: input.resolvedModelId,
              ...(input.resolvedModelVersion
                ? { resolvedModelVersion: input.resolvedModelVersion }
                : {}),
            }),
        };
  const usageAccounting =
    input.usage === undefined
      ? {}
      : (() => {
          const usage = createAgentUsageVector(input.usage.amounts);
          return {
            usage,
            usageSourceDigest: sourceDigestForUsage(usage),
          };
        })();
  const costAccounting =
    input.cost === undefined
      ? {}
      : (() => {
          const cost = normalizeAgentCosts(input.cost);
          return {
            cost,
            costSourceDigest: sourceDigestForCosts(cost),
          };
        })();
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-endpoint-smoke-receipt' as const,
    version: 1 as const,
    ...input,
    ...modelIdentity,
    ...usageAccounting,
    ...costAccounting,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  }) as AgentEvaluationEndpointSmokeReceipt;
  if (!isAgentEvaluationEndpointSmokeReceipt(receipt)) {
    throw new TypeError('Evaluation endpoint-smoke receipt is invalid.');
  }
  return receipt;
};

export const isAgentEvaluationEndpointSmokeReceipt = (
  value: unknown
): value is AgentEvaluationEndpointSmokeReceipt => {
  if (
    !exactKeys(
      value,
      [
        'format',
        'version',
        'receiptId',
        'planDigest',
        'repositoryCommit',
        'smokeTargetId',
        'smokeTargetDigest',
        'endpointClass',
        'protocolFamily',
        'providerConfigurationId',
        'modelId',
        'immutableModelVersion',
        'modelLineageDigest',
        'inferenceConfigurationDigest',
        'adapterDigest',
        'pricingAuthorityDigest',
        'responseSpoolEncryptionPolicyDigest',
        'smokeProfileDigest',
        'invocationId',
        'budgetReservationId',
        'demandDigest',
        'settlementDigest',
        'dispatchIntentDigest',
        'transportReceiptDigest',
        'requestDigest',
        'outcome',
        'startedAt',
        'completedAt',
        'receiptDigest',
      ],
      [
        'failureCategory',
        'providerRequestId',
        'responseHeaderDigest',
        'responseDigest',
        'resolvedModelId',
        'resolvedModelVersion',
        'resolvedModelIdentityDigest',
        'spoolReceiptDigest',
        'spoolDispositionReceiptDigest',
        'usage',
        'cost',
        'usageSourceDigest',
        'costSourceDigest',
        'usageSourceReceiptDigest',
        'costSourceReceiptDigest',
        'pricingSnapshotRef',
        'validationFailureReceiptDigest',
      ]
    )
  ) {
    return false;
  }
  const receipt = value as AgentEvaluationEndpointSmokeReceipt;
  const responsePresence = [
    receipt.providerRequestId,
    receipt.responseHeaderDigest,
    receipt.responseDigest,
  ].map((entry) => entry !== undefined);
  const modelPresence = [
    receipt.resolvedModelId,
    receipt.resolvedModelIdentityDigest,
  ].map((entry) => entry !== undefined);
  const spoolPresence = [
    receipt.spoolReceiptDigest,
    receipt.spoolDispositionReceiptDigest,
  ].map((entry) => entry !== undefined);
  const usagePresence = [
    receipt.usage,
    receipt.usageSourceDigest,
    receipt.usageSourceReceiptDigest,
  ].map((entry) => entry !== undefined);
  const costPresence = [
    receipt.cost,
    receipt.costSourceDigest,
    receipt.costSourceReceiptDigest,
  ].map((entry) => entry !== undefined);
  const allOrNone = (entries: readonly boolean[]) =>
    entries.every(Boolean) || entries.every((entry) => !entry);
  if (
    !allOrNone(responsePresence) ||
    !allOrNone(modelPresence) ||
    !allOrNone(spoolPresence) ||
    !allOrNone(usagePresence) ||
    !allOrNone(costPresence)
  ) {
    return false;
  }
  const hasResponse = responsePresence[0] === true;
  const hasModel = modelPresence[0] === true;
  const hasSpool = spoolPresence[0] === true;
  const hasUsage = usagePresence[0] === true;
  const hasCost = costPresence[0] === true;
  const validationFailureReceiptDigest = Object.hasOwn(
    receipt,
    'validationFailureReceiptDigest'
  )
    ? (receipt as AgentEvaluationEndpointSmokeFailedReceipt)
        .validationFailureReceiptDigest
    : undefined;
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  if (
    receipt.format !== 'prodivix.agent-evaluation-endpoint-smoke-receipt' ||
    receipt.version !== 1 ||
    !isAgentControlIdentity(receipt.receiptId) ||
    !isAgentCanonicalDigest(receipt.planDigest) ||
    !commitPattern.test(receipt.repositoryCommit) ||
    !isAgentControlIdentity(receipt.smokeTargetId) ||
    !isAgentCanonicalDigest(receipt.smokeTargetDigest) ||
    !endpointClasses.has(receipt.endpointClass) ||
    !protocolFamilies.has(receipt.protocolFamily) ||
    !isAgentControlIdentity(receipt.providerConfigurationId) ||
    !isAgentControlIdentity(receipt.modelId) ||
    !isAgentControlIdentity(receipt.immutableModelVersion) ||
    !isAgentCanonicalDigest(receipt.modelLineageDigest) ||
    !isAgentCanonicalDigest(receipt.inferenceConfigurationDigest) ||
    !isAgentCanonicalDigest(receipt.adapterDigest) ||
    !isAgentCanonicalDigest(receipt.pricingAuthorityDigest) ||
    !isAgentCanonicalDigest(receipt.responseSpoolEncryptionPolicyDigest) ||
    !isAgentCanonicalDigest(receipt.smokeProfileDigest) ||
    !isAgentControlIdentity(receipt.invocationId) ||
    !isAgentControlIdentity(receipt.budgetReservationId) ||
    !isAgentCanonicalDigest(receipt.demandDigest) ||
    !isAgentCanonicalDigest(receipt.settlementDigest) ||
    !isAgentCanonicalDigest(receipt.dispatchIntentDigest) ||
    !isAgentCanonicalDigest(receipt.transportReceiptDigest) ||
    !isAgentCanonicalDigest(receipt.requestDigest) ||
    !['passed', 'failed'].includes(receipt.outcome) ||
    !isAgentControlInstant(receipt.startedAt) ||
    !isAgentControlInstant(receipt.completedAt) ||
    Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
    !isAgentCanonicalDigest(receipt.receiptDigest) ||
    receipt.receiptDigest !== digestAgentCanonicalValue(base) ||
    (receipt.pricingSnapshotRef !== undefined &&
      !isAgentControlIdentity(receipt.pricingSnapshotRef)) ||
    (receipt.resolvedModelVersion !== undefined &&
      !isAgentControlIdentity(receipt.resolvedModelVersion)) ||
    (validationFailureReceiptDigest !== undefined &&
      !isAgentCanonicalDigest(validationFailureReceiptDigest))
  ) {
    return false;
  }
  if (
    hasResponse &&
    (!isAgentControlIdentity(receipt.providerRequestId) ||
      !isAgentCanonicalDigest(receipt.responseHeaderDigest) ||
      !isAgentCanonicalDigest(receipt.responseDigest))
  ) {
    return false;
  }
  if (
    hasModel &&
    (!isAgentControlIdentity(receipt.resolvedModelId) ||
      !isAgentCanonicalDigest(receipt.resolvedModelIdentityDigest))
  ) {
    return false;
  }
  if (
    hasSpool &&
    (!isAgentCanonicalDigest(receipt.spoolReceiptDigest) ||
      !isAgentCanonicalDigest(receipt.spoolDispositionReceiptDigest) ||
      !hasResponse)
  ) {
    return false;
  }
  if (hasUsage) {
    if (
      !sameCanonicalJson(
        receipt.usage,
        createAgentUsageVector(receipt.usage!.amounts)
      ) ||
      receipt.usageSourceDigest !== sourceDigestForUsage(receipt.usage!) ||
      !isAgentCanonicalDigest(receipt.usageSourceReceiptDigest)
    ) {
      return false;
    }
  }
  if (
    hasCost &&
    (!hasUsage ||
      !sameCanonicalJson(receipt.cost, normalizeAgentCosts(receipt.cost!)) ||
      receipt.costSourceDigest !== sourceDigestForCosts(receipt.cost!) ||
      !isAgentCanonicalDigest(receipt.costSourceReceiptDigest))
  ) {
    return false;
  }
  if (!hasCost && receipt.pricingSnapshotRef !== undefined) {
    return false;
  }
  if (receipt.outcome === 'passed') {
    return (
      !Object.hasOwn(receipt, 'failureCategory') &&
      validationFailureReceiptDigest === undefined &&
      hasResponse &&
      hasModel &&
      hasSpool &&
      hasUsage &&
      hasCost &&
      hasAuthoritativeUsage(receipt.usage!) &&
      hasAuthoritativeCost(receipt.cost!) &&
      resolvedModelIdentityMatches(
        receipt as AgentEvaluationEndpointSmokePassedReceipt
      )
    );
  }
  const failed = receipt as AgentEvaluationEndpointSmokeFailedReceipt;
  if (
    ![
      'transport-not-dispatched',
      'transport-post-dispatch-unknown',
      'transport-failed',
      'provider-response-invalid',
      'model-identity-drift',
      'usage-unavailable',
      'cost-unavailable',
    ].includes(failed.failureCategory) ||
    (failed.failureCategory === 'transport-not-dispatched' &&
      (hasResponse || hasModel || hasSpool || hasUsage || hasCost)) ||
    (failed.failureCategory === 'transport-post-dispatch-unknown' &&
      (hasResponse || hasModel || hasSpool || hasUsage || hasCost)) ||
    (failed.failureCategory === 'provider-response-invalid' &&
      (!hasResponse ||
        !hasSpool ||
        hasUsage ||
        hasCost ||
        failed.validationFailureReceiptDigest === undefined)) ||
    (failed.failureCategory !== 'provider-response-invalid' &&
      failed.validationFailureReceiptDigest !== undefined) ||
    (failed.failureCategory === 'model-identity-drift' && !hasModel) ||
    (failed.failureCategory === 'usage-unavailable' &&
      (!hasResponse || !hasModel || !hasSpool || hasUsage || hasCost)) ||
    (failed.failureCategory === 'cost-unavailable' &&
      (!hasResponse || !hasModel || !hasSpool || !hasUsage || hasCost))
  ) {
    return false;
  }
  return true;
};

const canonicalSet = <T>(
  values: readonly T[],
  guard: (value: unknown) => value is T,
  identity: (value: T) => string,
  label: string
): readonly T[] => {
  if (
    !Array.isArray(values) ||
    values.length > 128 ||
    values.some((value) => !guard(value))
  ) {
    throw new TypeError(`${label} are invalid.`);
  }
  const ordered = [...values].sort((left, right) =>
    compareUnicodeCodePoints(identity(left), identity(right))
  );
  const identities = ordered.map(identity);
  if (new Set(identities).size !== identities.length) {
    throw new TypeError(`${label} identities are duplicated.`);
  }
  return Object.freeze(ordered);
};

export const canonicalAgentEvaluationEndpointSmokeDispatchIntentOrder = (
  values: readonly AgentEvaluationEndpointSmokeDispatchIntent[]
): readonly AgentEvaluationEndpointSmokeDispatchIntent[] =>
  canonicalSet(
    values,
    isAgentEvaluationEndpointSmokeDispatchIntent,
    ({ smokeTargetId }) => smokeTargetId,
    'Evaluation endpoint-smoke dispatch intents'
  );

export const canonicalAgentEvaluationEndpointSmokeTransportReceiptOrder = (
  values: readonly AgentEvaluationTransportReceipt[]
): readonly AgentEvaluationTransportReceipt[] =>
  canonicalSet(
    values,
    isAgentEvaluationTransportReceipt,
    ({ invocationId, receiptId }) => `${invocationId}\u0000${receiptId}`,
    'Evaluation endpoint-smoke transport receipts'
  );

export const canonicalAgentEvaluationEndpointSmokeResultSpoolReceiptOrder = (
  values: readonly AgentEvaluationEndpointSmokeResultSpoolReceipt[]
): readonly AgentEvaluationEndpointSmokeResultSpoolReceipt[] =>
  canonicalSet(
    values,
    isAgentEvaluationEndpointSmokeResultSpoolReceipt,
    ({ smokeTargetId }) => smokeTargetId,
    'Evaluation endpoint-smoke result-spool receipts'
  );

export const canonicalAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptOrder =
  (
    values: readonly AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt[]
  ): readonly AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt[] =>
    canonicalSet(
      values,
      isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
      ({ smokeTargetId }) => smokeTargetId,
      'Evaluation endpoint-smoke result-spool disposition receipts'
    );

export const canonicalAgentEvaluationEndpointSmokeValidationFailureReceiptOrder =
  (
    values: readonly AgentEvaluationEndpointSmokeValidationFailureReceipt[]
  ): readonly AgentEvaluationEndpointSmokeValidationFailureReceipt[] =>
    canonicalSet(
      values,
      isAgentEvaluationEndpointSmokeValidationFailureReceipt,
      ({ smokeTargetId, receiptId }) => `${smokeTargetId}\u0000${receiptId}`,
      'Evaluation endpoint-smoke validation-failure receipts'
    );

export const canonicalAgentEvaluationEndpointSmokeReceiptOrder = (
  values: readonly AgentEvaluationEndpointSmokeReceipt[]
): readonly AgentEvaluationEndpointSmokeReceipt[] =>
  canonicalSet(
    values,
    isAgentEvaluationEndpointSmokeReceipt,
    ({ smokeTargetId }) => smokeTargetId,
    'Evaluation endpoint-smoke receipts'
  );

export const digestAgentEvaluationEndpointSmokeDispatchIntentSet = (
  values: readonly AgentEvaluationEndpointSmokeDispatchIntent[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    endpointSmokeDispatchIntentDigests:
      canonicalAgentEvaluationEndpointSmokeDispatchIntentOrder(values).map(
        ({ intentDigest }) => intentDigest
      ),
  });

export const digestAgentEvaluationEndpointSmokeTransportReceiptSet = (
  values: readonly AgentEvaluationTransportReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    endpointSmokeTransportReceiptDigests:
      canonicalAgentEvaluationEndpointSmokeTransportReceiptOrder(values).map(
        ({ receiptDigest }) => receiptDigest
      ),
  });

export const digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet = (
  values: readonly AgentEvaluationEndpointSmokeResultSpoolReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    endpointSmokeResultSpoolReceiptDigests:
      canonicalAgentEvaluationEndpointSmokeResultSpoolReceiptOrder(values).map(
        ({ receiptDigest }) => receiptDigest
      ),
  });

export const digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet =
  (
    values: readonly AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt[]
  ): CanonicalDigest =>
    digestAgentCanonicalValue({
      endpointSmokeResultSpoolDispositionReceiptDigests:
        canonicalAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptOrder(
          values
        ).map(({ receiptDigest }) => receiptDigest),
    });

export const digestAgentEvaluationEndpointSmokeValidationFailureReceiptSet = (
  values: readonly AgentEvaluationEndpointSmokeValidationFailureReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    endpointSmokeValidationFailureReceiptDigests:
      canonicalAgentEvaluationEndpointSmokeValidationFailureReceiptOrder(
        values
      ).map(({ receiptDigest }) => receiptDigest),
  });

export const digestAgentEvaluationEndpointSmokeReceiptSet = (
  values: readonly AgentEvaluationEndpointSmokeReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    endpointSmokeReceiptDigests:
      canonicalAgentEvaluationEndpointSmokeReceiptOrder(values).map(
        ({ receiptDigest }) => receiptDigest
      ),
  });

export const validateAgentEvaluationEndpointSmokeTargetBinding = (
  target: AgentEvaluationEndpointSmokeTarget,
  intent: AgentEvaluationEndpointSmokeDispatchIntent
): void => {
  if (
    intent.smokeTargetId !== target.smokeTargetId ||
    intent.smokeTargetDigest !== target.targetDigest ||
    intent.endpointClass !== target.endpointClass ||
    intent.protocolFamily !== target.protocolFamily ||
    intent.providerConfigurationId !== target.providerConfigurationId ||
    intent.modelId !== target.modelId ||
    intent.immutableModelVersion !== target.immutableModelVersion ||
    intent.modelLineageDigest !== target.modelLineageDigest ||
    intent.inferenceConfigurationDigest !==
      target.inferenceConfigurationDigest ||
    intent.adapterDigest !== target.adapterDigest ||
    intent.pricingAuthorityDigest !== target.pricingAuthorityDigest ||
    intent.responseSpoolEncryptionPolicyDigest !==
      target.responseSpoolEncryptionPolicyDigest ||
    intent.smokeProfileDigest !== target.smokeProfileDigest
  ) {
    throw new TypeError('Evaluation endpoint-smoke target binding drifted.');
  }
};
