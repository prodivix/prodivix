import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import { isAgentEvaluationProviderResultSpoolEnvelope } from './agentEvaluationEvidenceAuthenticity';
import type { AgentEvaluationProviderResultSpoolEnvelope } from './agentEvaluationEvidenceAuthenticity.types';

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_AAD_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-spool-aad' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENVELOPE_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-spool-envelope-authority' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-spool-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_DISPOSITION_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-spool-disposition-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION =
  1 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES =
  262_144 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_LIFETIME_MS =
  125_000 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_METADATA_BYTES =
  65_536 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY_BASE64' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID =
  'key.g4-model-eval.capability-effect-provider-journal-spool.v1' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF =
  'secret.g4-model-eval.capability-effect-provider-journal-spool.aes256gcm.v1' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION =
  1 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_CLASS =
  'provider-runtime-ack-reconcile-only' as const;

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_AUTHORITY =
  Object.freeze({
    keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
    keyVersion: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION,
    keyEnvironmentName:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME,
    keyRef: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF,
  });
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST =
  digestAgentCanonicalValue(
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_AUTHORITY
  );

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE =
  Object.freeze({
    algorithm: 'aes-256-gcm' as const,
    aadFormat: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_AAD_FORMAT,
    aadVersion: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION,
    keyRefDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
    maximumCiphertextBytes:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES,
  });
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST =
  digestAgentCanonicalValue(
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE
  );

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY =
  Object.freeze({
    retentionClass:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_CLASS,
    maximumAgeMs:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_LIFETIME_MS,
    disposition: 'destroy-on-result-seal-or-abandonment' as const,
  });
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST =
  digestAgentCanonicalValue(
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY
  );

export type AgentEvaluationCapabilityEffectProviderSpoolAad = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_AAD_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION;
  namespaceDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  ownerRequestDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  executionSequence: number;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  responseBodyDigest: CanonicalDigest;
  responseProjectionDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENVELOPE_AUTHORITY_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION;
    spoolRef: string;
    algorithm: 'aes-256-gcm';
    keyId: string;
    keyVersion: number;
    keyRefDigest: CanonicalDigest;
    encryptionProfileDigest: CanonicalDigest;
    nonceBase64Url: string;
    authenticationTagBase64Url: string;
    ciphertextDigest: CanonicalDigest;
    ciphertextSizeBytes: number;
    aadDigest: CanonicalDigest;
    envelopeDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityEffectProviderSpoolReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RECEIPT_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION;
  spoolRef: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  ownerRequestDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  executionSequence: number;
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
  responseProjectionDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  retentionClass: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_CLASS;
  retentionPolicyDigest: CanonicalDigest;
  createdAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_DISPOSITION_RECEIPT_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION;
    spoolRef: string;
    spoolReceiptDigest: CanonicalDigest;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    attemptId: string;
    descriptorDigest: CanonicalDigest;
    turnIndex: number;
    invocationId: string;
    ownerRequestDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    executionSequence: number;
    disposition: 'abandoned-and-destroyed' | 'consumed-and-destroyed';
    resultSealReceiptDigest: CanonicalDigest | null;
    abandonmentReason:
      'attempt-terminal' | 'cleanup-requested' | 'stage-expired' | null;
    retentionPolicyDigest: CanonicalDigest;
    disposedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

const commitPattern = /^[0-9a-f]{40}$/u;
const canonicalBase64UrlPattern = /^[A-Za-z0-9_-]+$/u;
const canonicalBase64UrlAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const aadKeys = Object.freeze([
  'format',
  'version',
  'namespaceDigest',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'ownerRequestDigest',
  'stageDigest',
  'executionSequence',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'responseBodyDigest',
  'responseProjectionDigest',
  'responseDigest',
  'normalizedEventSetDigest',
] as const);

const envelopeAuthorityKeys = Object.freeze([
  'format',
  'version',
  'spoolRef',
  'algorithm',
  'keyId',
  'keyVersion',
  'keyRefDigest',
  'encryptionProfileDigest',
  'nonceBase64Url',
  'authenticationTagBase64Url',
  'ciphertextDigest',
  'ciphertextSizeBytes',
  'aadDigest',
  'envelopeDigest',
] as const);

const receiptKeys = Object.freeze([
  'format',
  'version',
  'spoolRef',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'ownerRequestDigest',
  'stageDigest',
  'executionSequence',
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
  'responseProjectionDigest',
  'responseDigest',
  'normalizedEventSetDigest',
  'retentionClass',
  'retentionPolicyDigest',
  'createdAt',
  'expiresAt',
  'receiptDigest',
] as const);

const dispositionKeys = Object.freeze([
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
  'ownerRequestDigest',
  'stageDigest',
  'executionSequence',
  'disposition',
  'resultSealReceiptDigest',
  'abandonmentReason',
  'retentionPolicyDigest',
  'disposedAt',
  'receiptDigest',
] as const);

const safe = (value: unknown): boolean => {
  try {
    return (
      inspectAgentControlJson(
        value,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_METADATA_BYTES
      ).length === 0 &&
      !containsAgentControlCredentialLikeText(canonicalJsonText(value))
    );
  } catch {
    return false;
  }
};

const validSequence = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 4;

const validBase64Url = (
  value: unknown,
  exactBytes: number
): value is string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !canonicalBase64UrlPattern.test(value) ||
    value.length % 4 === 1
  ) {
    return false;
  }
  const byteLength = Math.floor((value.length * 6) / 8);
  const remainder = value.length % 4;
  const lastValue = canonicalBase64UrlAlphabet.indexOf(value.at(-1)!);
  const unusedBitsAreZero =
    remainder === 0 ||
    (remainder === 2 && (lastValue & 0b1111) === 0) ||
    (remainder === 3 && (lastValue & 0b11) === 0);
  return byteLength === exactBytes && unusedBitsAreZero;
};

export type CreateAgentEvaluationCapabilityEffectProviderSpoolAadInput = Omit<
  AgentEvaluationCapabilityEffectProviderSpoolAad,
  'format' | 'version'
>;

export const createAgentEvaluationCapabilityEffectProviderSpoolAad = (
  input: CreateAgentEvaluationCapabilityEffectProviderSpoolAadInput
): AgentEvaluationCapabilityEffectProviderSpoolAad => {
  const aad = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_AAD_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION,
    ...input,
  });
  if (!isAgentEvaluationCapabilityEffectProviderSpoolAad(aad)) {
    throw new TypeError('Capability effect Provider spool AAD is invalid.');
  }
  return aad;
};

export const isAgentEvaluationCapabilityEffectProviderSpoolAad = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderSpoolAad =>
  hasExactAgentControlKeys(value, aadKeys) &&
  value.format ===
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_AAD_FORMAT &&
  value.version === AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION &&
  [
    value.namespaceDigest,
    value.planDigest,
    value.descriptorDigest,
    value.ownerRequestDigest,
    value.stageDigest,
    value.dispatchIntentDigest,
    value.transportReceiptDigest,
    value.responseBodyDigest,
    value.responseProjectionDigest,
    value.responseDigest,
    value.normalizedEventSetDigest,
  ].every(isAgentCanonicalDigest) &&
  typeof value.repositoryCommit === 'string' &&
  commitPattern.test(value.repositoryCommit) &&
  isAgentControlIdentity(value.attemptId) &&
  Number.isSafeInteger(value.turnIndex) &&
  (value.turnIndex as number) >= 0 &&
  (value.turnIndex as number) < 7 &&
  isAgentControlIdentity(value.invocationId) &&
  validSequence(value.executionSequence) &&
  safe(value);

export const digestAgentEvaluationCapabilityEffectProviderSpoolAad = (
  aad: AgentEvaluationCapabilityEffectProviderSpoolAad
): CanonicalDigest => {
  if (!isAgentEvaluationCapabilityEffectProviderSpoolAad(aad)) {
    throw new TypeError('Capability effect Provider spool AAD is invalid.');
  }
  return digestAgentCanonicalValue(aad);
};

export const createAgentEvaluationCapabilityEffectProviderSpoolRef = (
  aad: AgentEvaluationCapabilityEffectProviderSpoolAad
): string =>
  `provider-runtime-spool.${digestAgentEvaluationCapabilityEffectProviderSpoolAad(aad).slice('sha256-'.length)}`;

export const createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority =
  (
    envelope: AgentEvaluationProviderResultSpoolEnvelope
  ): AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority => {
    if (
      !isAgentEvaluationProviderResultSpoolEnvelope(envelope) ||
      envelope.ciphertextSizeBytes >
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES
    ) {
      throw new TypeError(
        'Capability effect Provider spool envelope is invalid or unbounded.'
      );
    }
    const authority = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENVELOPE_AUTHORITY_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION,
      spoolRef: envelope.spoolId,
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
      envelopeDigest: envelope.envelopeDigest,
    });
    if (
      !isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
        authority
      )
    ) {
      throw new TypeError(
        'Capability effect Provider spool envelope authority is invalid.'
      );
    }
    return authority;
  };

export const isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority => {
  if (!hasExactAgentControlKeys(value, envelopeAuthorityKeys)) return false;
  const authority =
    value as AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority;
  return (
    authority.format ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENVELOPE_AUTHORITY_FORMAT &&
    authority.version ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION &&
    isAgentControlIdentity(authority.spoolRef) &&
    authority.algorithm === 'aes-256-gcm' &&
    authority.keyId ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID &&
    authority.keyVersion ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION &&
    authority.keyRefDigest ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST &&
    authority.encryptionProfileDigest ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST &&
    [
      authority.keyRefDigest,
      authority.encryptionProfileDigest,
      authority.ciphertextDigest,
      authority.aadDigest,
      authority.envelopeDigest,
    ].every(isAgentCanonicalDigest) &&
    validBase64Url(authority.nonceBase64Url, 12) &&
    validBase64Url(authority.authenticationTagBase64Url, 16) &&
    Number.isSafeInteger(authority.ciphertextSizeBytes) &&
    authority.ciphertextSizeBytes > 0 &&
    authority.ciphertextSizeBytes <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES &&
    authority.envelopeDigest ===
      digestAgentCanonicalValue({
        algorithm: authority.algorithm,
        keyId: authority.keyId,
        keyVersion: authority.keyVersion,
        keyRefDigest: authority.keyRefDigest,
        encryptionProfileDigest: authority.encryptionProfileDigest,
        nonceBase64Url: authority.nonceBase64Url,
        authenticationTagBase64Url: authority.authenticationTagBase64Url,
        ciphertextDigest: authority.ciphertextDigest,
        ciphertextSizeBytes: authority.ciphertextSizeBytes,
        aadDigest: authority.aadDigest,
      }) &&
    safe(authority)
  );
};

export type CreateAgentEvaluationCapabilityEffectProviderSpoolReceiptInput =
  Readonly<{
    aad: AgentEvaluationCapabilityEffectProviderSpoolAad;
    envelopeAuthority: AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority;
    retentionPolicyDigest: CanonicalDigest;
    createdAt: Instant;
    expiresAt: Instant;
  }>;

export const createAgentEvaluationCapabilityEffectProviderSpoolReceipt = (
  input: CreateAgentEvaluationCapabilityEffectProviderSpoolReceiptInput
): AgentEvaluationCapabilityEffectProviderSpoolReceipt => {
  if (
    !isAgentEvaluationCapabilityEffectProviderSpoolAad(input.aad) ||
    !isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
      input.envelopeAuthority
    ) ||
    input.envelopeAuthority.spoolRef !==
      createAgentEvaluationCapabilityEffectProviderSpoolRef(input.aad) ||
    input.envelopeAuthority.aadDigest !==
      digestAgentEvaluationCapabilityEffectProviderSpoolAad(input.aad)
  ) {
    throw new TypeError(
      'Capability effect Provider spool receipt authority drifted.'
    );
  }
  const aad = input.aad;
  const envelope = input.envelopeAuthority;
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION,
    spoolRef: envelope.spoolRef,
    planDigest: aad.planDigest,
    repositoryCommit: aad.repositoryCommit,
    attemptId: aad.attemptId,
    descriptorDigest: aad.descriptorDigest,
    turnIndex: aad.turnIndex,
    invocationId: aad.invocationId,
    ownerRequestDigest: aad.ownerRequestDigest,
    stageDigest: aad.stageDigest,
    executionSequence: aad.executionSequence,
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
    responseProjectionDigest: aad.responseProjectionDigest,
    responseDigest: aad.responseDigest,
    normalizedEventSetDigest: aad.normalizedEventSetDigest,
    retentionClass:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_CLASS,
    retentionPolicyDigest: input.retentionPolicyDigest,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationCapabilityEffectProviderSpoolReceipt(receipt)) {
    throw new TypeError('Capability effect Provider spool receipt is invalid.');
  }
  return receipt;
};

export const isAgentEvaluationCapabilityEffectProviderSpoolReceipt = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderSpoolReceipt => {
  if (!hasExactAgentControlKeys(value, receiptKeys)) return false;
  const receipt = value as AgentEvaluationCapabilityEffectProviderSpoolReceipt;
  const { receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RECEIPT_FORMAT &&
    receipt.version ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION &&
    isAgentControlIdentity(receipt.spoolRef) &&
    typeof receipt.repositoryCommit === 'string' &&
    commitPattern.test(receipt.repositoryCommit) &&
    isAgentControlIdentity(receipt.attemptId) &&
    Number.isSafeInteger(receipt.turnIndex) &&
    receipt.turnIndex >= 0 &&
    receipt.turnIndex < 7 &&
    isAgentControlIdentity(receipt.invocationId) &&
    validSequence(receipt.executionSequence) &&
    receipt.algorithm === 'aes-256-gcm' &&
    receipt.keyId ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID &&
    receipt.keyVersion ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION &&
    receipt.keyRefDigest ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST &&
    receipt.encryptionProfileDigest ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST &&
    Number.isSafeInteger(receipt.ciphertextSizeBytes) &&
    receipt.ciphertextSizeBytes > 0 &&
    receipt.ciphertextSizeBytes <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES &&
    [
      receipt.planDigest,
      receipt.descriptorDigest,
      receipt.ownerRequestDigest,
      receipt.stageDigest,
      receipt.dispatchIntentDigest,
      receipt.transportReceiptDigest,
      receipt.encryptionProfileDigest,
      receipt.keyRefDigest,
      receipt.aadDigest,
      receipt.envelopeDigest,
      receipt.ciphertextDigest,
      receipt.responseBodyDigest,
      receipt.responseProjectionDigest,
      receipt.responseDigest,
      receipt.normalizedEventSetDigest,
      receipt.retentionPolicyDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) &&
    receipt.retentionClass ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_CLASS &&
    receipt.retentionPolicyDigest ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST &&
    isAgentControlInstant(receipt.createdAt) &&
    isAgentControlInstant(receipt.expiresAt) &&
    Date.parse(receipt.expiresAt) > Date.parse(receipt.createdAt) &&
    Date.parse(receipt.expiresAt) - Date.parse(receipt.createdAt) <=
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_LIFETIME_MS &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(receipt)
  );
};

export type CreateAgentEvaluationCapabilityEffectProviderSpoolDispositionReceiptInput =
  Omit<
    AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt,
    'format' | 'version' | 'receiptDigest'
  >;

export const createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt =
  (
    input: CreateAgentEvaluationCapabilityEffectProviderSpoolDispositionReceiptInput
  ): AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt => {
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_DISPOSITION_RECEIPT_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION,
      ...input,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt(receipt)
    ) {
      throw new TypeError(
        'Capability effect Provider spool disposition receipt is invalid.'
      );
    }
    return receipt;
  };

export const isAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt =
  (
    value: unknown
  ): value is AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt => {
    if (!hasExactAgentControlKeys(value, dispositionKeys)) return false;
    const receipt =
      value as AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt;
    const { receiptDigest, ...base } = receipt;
    const consumed = receipt.disposition === 'consumed-and-destroyed';
    return (
      receipt.format ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_DISPOSITION_RECEIPT_FORMAT &&
      receipt.version ===
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION &&
      isAgentControlIdentity(receipt.spoolRef) &&
      isAgentCanonicalDigest(receipt.spoolReceiptDigest) &&
      isAgentCanonicalDigest(receipt.planDigest) &&
      typeof receipt.repositoryCommit === 'string' &&
      commitPattern.test(receipt.repositoryCommit) &&
      isAgentControlIdentity(receipt.attemptId) &&
      isAgentCanonicalDigest(receipt.descriptorDigest) &&
      Number.isSafeInteger(receipt.turnIndex) &&
      receipt.turnIndex >= 0 &&
      receipt.turnIndex < 7 &&
      isAgentControlIdentity(receipt.invocationId) &&
      isAgentCanonicalDigest(receipt.ownerRequestDigest) &&
      isAgentCanonicalDigest(receipt.stageDigest) &&
      validSequence(receipt.executionSequence) &&
      (consumed || receipt.disposition === 'abandoned-and-destroyed') &&
      consumed === (receipt.resultSealReceiptDigest !== null) &&
      (receipt.resultSealReceiptDigest === null ||
        isAgentCanonicalDigest(receipt.resultSealReceiptDigest)) &&
      consumed === (receipt.abandonmentReason === null) &&
      (receipt.abandonmentReason === null ||
        ['attempt-terminal', 'cleanup-requested', 'stage-expired'].includes(
          receipt.abandonmentReason
        )) &&
      isAgentCanonicalDigest(receipt.retentionPolicyDigest) &&
      isAgentControlInstant(receipt.disposedAt) &&
      isAgentCanonicalDigest(receiptDigest) &&
      receiptDigest === digestAgentCanonicalValue(base) &&
      safe(receipt)
    );
  };

export const doesAgentEvaluationCapabilityEffectProviderSpoolReceiptMatch = (
  receipt: AgentEvaluationCapabilityEffectProviderSpoolReceipt,
  aad: AgentEvaluationCapabilityEffectProviderSpoolAad,
  envelope: AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority
): boolean => {
  try {
    return (
      isAgentEvaluationCapabilityEffectProviderSpoolReceipt(receipt) &&
      receipt.receiptDigest ===
        createAgentEvaluationCapabilityEffectProviderSpoolReceipt({
          aad,
          envelopeAuthority: envelope,
          retentionPolicyDigest: receipt.retentionPolicyDigest,
          createdAt: receipt.createdAt,
          expiresAt: receipt.expiresAt,
        }).receiptDigest
    );
  } catch {
    return false;
  }
};

/** Cross-validates the terminal key/ciphertext destruction receipt. */
export const doesAgentEvaluationCapabilityEffectProviderSpoolDispositionMatch =
  (
    receipt: AgentEvaluationCapabilityEffectProviderSpoolReceipt,
    disposition: AgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt,
    expectedResultSealReceiptDigest: CanonicalDigest | null
  ): boolean =>
    isAgentEvaluationCapabilityEffectProviderSpoolReceipt(receipt) &&
    isAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt(
      disposition
    ) &&
    disposition.spoolRef === receipt.spoolRef &&
    disposition.spoolReceiptDigest === receipt.receiptDigest &&
    disposition.planDigest === receipt.planDigest &&
    disposition.repositoryCommit === receipt.repositoryCommit &&
    disposition.attemptId === receipt.attemptId &&
    disposition.descriptorDigest === receipt.descriptorDigest &&
    disposition.turnIndex === receipt.turnIndex &&
    disposition.invocationId === receipt.invocationId &&
    disposition.ownerRequestDigest === receipt.ownerRequestDigest &&
    disposition.stageDigest === receipt.stageDigest &&
    disposition.executionSequence === receipt.executionSequence &&
    disposition.retentionPolicyDigest === receipt.retentionPolicyDigest &&
    disposition.resultSealReceiptDigest === expectedResultSealReceiptDigest &&
    (expectedResultSealReceiptDigest === null
      ? disposition.disposition === 'abandoned-and-destroyed' &&
        disposition.abandonmentReason !== null
      : disposition.disposition === 'consumed-and-destroyed' &&
        disposition.abandonmentReason === null);
