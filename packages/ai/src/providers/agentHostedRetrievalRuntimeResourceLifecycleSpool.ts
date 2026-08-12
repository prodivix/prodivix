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
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  repositoryCommitPattern,
} from './agentHostedRetrievalRuntimeResourceRegistration';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_AAD_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-aad' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENVELOPE_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-envelope-authority' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RESULT_SPOOL_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-result-spool-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RESULT_SPOOL_DISPOSITION_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-result-spool-disposition-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID =
  'key.g4-model-eval.hosted-retrieval-runtime-resource-lifecycle-spool.v1' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF =
  'secret.g4-model-eval.hosted-retrieval-runtime-resource-lifecycle-spool.aes256gcm.v1' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION =
  1 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES =
  262_144 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_LIFETIME_MS =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_LIFETIME_MS;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_METADATA_BYTES =
  65_536 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_CLASS =
  'hosted-resource-lifecycle-reconcile-only' as const;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_AUTHORITY =
  Object.freeze({
    keyId: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
    keyVersion:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION,
    keyEnvironmentName:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME,
    keyRef: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF,
  });
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST =
  digestAgentCanonicalValue(
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_AUTHORITY
  );
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE =
  Object.freeze({
    algorithm: 'aes-256-gcm' as const,
    aadFormat:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_AAD_FORMAT,
    aadVersion: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    keyRefDigest:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
    maximumCiphertextBytes:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES,
  });
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST =
  digestAgentCanonicalValue(
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE
  );
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY =
  Object.freeze({
    retentionClass:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_CLASS,
    maximumAgeMs:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_LIFETIME_MS,
    disposition: 'destroy-on-business-seal-or-expiry' as const,
  });
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY_DIGEST =
  digestAgentCanonicalValue(
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY
  );

export type AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_AAD_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  lifecycleExpiresAt: Instant;
  registrationRequestDigest: CanonicalDigest;
  authorityDigest: CanonicalDigest | null;
  lifecycleClaimReceiptDigest: CanonicalDigest | null;
  operation: 'create' | 'delete';
  resourceId: string | null;
  resourceRole: 'auxiliary' | 'primary' | null;
  dispatchIntentSetDigest: CanonicalDigest;
  dispatchStageClaimReceiptSetDigest: CanonicalDigest;
  dispatchStageClaimHistorySetDigest: CanonicalDigest;
  transportReceiptSetDigest: CanonicalDigest;
  businessResultDigest: CanonicalDigest;
  plaintextDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENVELOPE_AUTHORITY_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    spoolRef: string;
    algorithm: 'aes-256-gcm';
    keyId: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID;
    keyVersion: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION;
    keyRefDigest: CanonicalDigest;
    encryptionProfileDigest: CanonicalDigest;
    nonceBase64Url: string;
    authenticationTagBase64Url: string;
    ciphertextDigest: CanonicalDigest;
    ciphertextSizeBytes: number;
    aadDigest: CanonicalDigest;
    plaintextDigest: CanonicalDigest;
    envelopeDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RESULT_SPOOL_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    spoolRef: string;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    lifecycleExpiresAt: Instant;
    registrationRequestDigest: CanonicalDigest;
    authorityDigest: CanonicalDigest | null;
    lifecycleClaimReceiptDigest: CanonicalDigest | null;
    operation: 'create' | 'delete';
    resourceId: string | null;
    resourceRole: 'auxiliary' | 'primary' | null;
    dispatchIntentSetDigest: CanonicalDigest;
    dispatchStageClaimReceiptSetDigest: CanonicalDigest;
    dispatchStageClaimHistorySetDigest: CanonicalDigest;
    transportReceiptSetDigest: CanonicalDigest;
    businessResultDigest: CanonicalDigest;
    algorithm: 'aes-256-gcm';
    keyId: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID;
    keyVersion: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION;
    keyRefDigest: CanonicalDigest;
    encryptionProfileDigest: CanonicalDigest;
    aadDigest: CanonicalDigest;
    envelopeDigest: CanonicalDigest;
    ciphertextDigest: CanonicalDigest;
    ciphertextSizeBytes: number;
    plaintextDigest: CanonicalDigest;
    retentionClass: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_CLASS;
    retentionPolicyDigest: CanonicalDigest;
    createdAt: Instant;
    expiresAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RESULT_SPOOL_DISPOSITION_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    spoolRef: string;
    spoolReceiptDigest: CanonicalDigest;
    operation: 'create' | 'delete';
    registrationRequestDigest: CanonicalDigest;
    authorityDigest: CanonicalDigest | null;
    lifecycleClaimReceiptDigest: CanonicalDigest | null;
    disposition:
      'destroyed-after-business-seal' | 'retained-encrypted-for-recovery';
    businessSealKind:
      | 'abandoned-before-provider-effect'
      | 'cleanup-result'
      | 'partial-create-result'
      | 'recovery-pending'
      | 'registration-result';
    businessSealReceiptDigest: CanonicalDigest | null;
    encryptionState: 'destroyed' | 'retained-encrypted';
    envelopeDigest: CanonicalDigest;
    ciphertextDigest: CanonicalDigest;
    retentionPolicyDigest: CanonicalDigest;
    createdAt: Instant;
    retainedUntil: Instant;
    disposedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

const aadKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'lifecycleExpiresAt',
  'registrationRequestDigest',
  'authorityDigest',
  'lifecycleClaimReceiptDigest',
  'operation',
  'resourceId',
  'resourceRole',
  'dispatchIntentSetDigest',
  'dispatchStageClaimReceiptSetDigest',
  'dispatchStageClaimHistorySetDigest',
  'transportReceiptSetDigest',
  'businessResultDigest',
  'plaintextDigest',
] as const);
const envelopeKeys = Object.freeze([
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
  'plaintextDigest',
  'envelopeDigest',
] as const);
const receiptKeys = Object.freeze([
  'format',
  'version',
  'spoolRef',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'lifecycleExpiresAt',
  'registrationRequestDigest',
  'authorityDigest',
  'lifecycleClaimReceiptDigest',
  'operation',
  'resourceId',
  'resourceRole',
  'dispatchIntentSetDigest',
  'dispatchStageClaimReceiptSetDigest',
  'dispatchStageClaimHistorySetDigest',
  'transportReceiptSetDigest',
  'businessResultDigest',
  'algorithm',
  'keyId',
  'keyVersion',
  'keyRefDigest',
  'encryptionProfileDigest',
  'aadDigest',
  'envelopeDigest',
  'ciphertextDigest',
  'ciphertextSizeBytes',
  'plaintextDigest',
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
  'operation',
  'registrationRequestDigest',
  'authorityDigest',
  'lifecycleClaimReceiptDigest',
  'disposition',
  'businessSealKind',
  'businessSealReceiptDigest',
  'encryptionState',
  'envelopeDigest',
  'ciphertextDigest',
  'retentionPolicyDigest',
  'createdAt',
  'retainedUntil',
  'disposedAt',
  'receiptDigest',
] as const);

const safe = (value: unknown): boolean =>
  inspectAgentControlJson(
    value,
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_METADATA_BYTES
  ).length === 0 &&
  !containsAgentControlCredentialLikeText(canonicalJsonText(value));
const canonicalBase64Url = /^[A-Za-z0-9_-]+$/u;
const validBase64Url = (
  value: unknown,
  exactBytes: number
): value is string => {
  if (
    typeof value !== 'string' ||
    !canonicalBase64Url.test(value) ||
    value.length % 4 === 1
  )
    return false;
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = alphabet.indexOf(value.at(-1)!);
  const remainder = value.length % 4;
  return (
    Math.floor((value.length * 6) / 8) === exactBytes &&
    (remainder === 0 ||
      (remainder === 2 && (last & 0b1111) === 0) ||
      (remainder === 3 && (last & 0b11) === 0))
  );
};

export const createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
    'format' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad => {
  const value = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_AAD_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  if (!isAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(value)) {
    throw new TypeError('Hosted lifecycle spool AAD is invalid.');
  }
  return value;
};

export const isAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad =>
  hasExactAgentControlKeys(value, aadKeys) &&
  value.format ===
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_AAD_FORMAT &&
  value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
  isAgentControlIdentity(value.namespaceId) &&
  repositoryCommitPattern.test(value.repositoryCommit as string) &&
  isAgentControlIdentity(value.runtimeResourceSetId) &&
  isAgentControlInstant(value.lifecycleExpiresAt) &&
  [
    value.planDigest,
    value.frozenRunDigest,
    value.runConfigArtifactBindingDigest,
    value.registrationRequestDigest,
    value.dispatchIntentSetDigest,
    value.dispatchStageClaimReceiptSetDigest,
    value.dispatchStageClaimHistorySetDigest,
    value.transportReceiptSetDigest,
    value.businessResultDigest,
    value.plaintextDigest,
  ].every(isAgentCanonicalDigest) &&
  (value.authorityDigest === null ||
    isAgentCanonicalDigest(value.authorityDigest)) &&
  (value.lifecycleClaimReceiptDigest === null ||
    isAgentCanonicalDigest(value.lifecycleClaimReceiptDigest)) &&
  ['create', 'delete'].includes(value.operation as 'create' | 'delete') &&
  (value.resourceId === null || isAgentControlIdentity(value.resourceId)) &&
  [null, 'auxiliary', 'primary'].includes(
    value.resourceRole as 'auxiliary' | 'primary' | null
  ) &&
  (value.operation === 'create'
    ? value.authorityDigest === null &&
      value.lifecycleClaimReceiptDigest === null &&
      value.resourceId === null &&
      value.resourceRole === null
    : value.lifecycleClaimReceiptDigest !== null &&
      value.resourceId !== null &&
      value.resourceRole !== null) &&
  safe(value);

export const digestAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad = (
  aad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad
): CanonicalDigest => {
  if (!isAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(aad)) {
    throw new TypeError('Hosted lifecycle spool AAD is invalid.');
  }
  return digestAgentCanonicalValue(aad);
};

export const createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef = (
  aad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad
): string =>
  `hosted-lifecycle-spool.${digestAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(aad).slice('sha256-'.length)}`;

export const createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
      'envelopeDigest' | 'format' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENVELOPE_AUTHORITY_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      envelopeDigest: digestAgentCanonicalValue({
        algorithm: input.algorithm,
        keyId: input.keyId,
        keyVersion: input.keyVersion,
        keyRefDigest: input.keyRefDigest,
        encryptionProfileDigest: input.encryptionProfileDigest,
        nonceBase64Url: input.nonceBase64Url,
        authenticationTagBase64Url: input.authenticationTagBase64Url,
        ciphertextDigest: input.ciphertextDigest,
        ciphertextSizeBytes: input.ciphertextSizeBytes,
        aadDigest: input.aadDigest,
      }),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle spool envelope authority is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority => {
    if (!hasExactAgentControlKeys(value, envelopeKeys)) return false;
    const { envelopeDigest } = value;
    return (
      value.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENVELOPE_AUTHORITY_FORMAT &&
      value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      isAgentControlIdentity(value.spoolRef) &&
      value.algorithm === 'aes-256-gcm' &&
      value.keyId ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID &&
      value.keyVersion ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION &&
      value.keyRefDigest ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST &&
      value.encryptionProfileDigest ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST &&
      validBase64Url(value.nonceBase64Url, 12) &&
      validBase64Url(value.authenticationTagBase64Url, 16) &&
      [
        value.ciphertextDigest,
        value.aadDigest,
        value.plaintextDigest,
        envelopeDigest,
      ].every(isAgentCanonicalDigest) &&
      Number.isSafeInteger(value.ciphertextSizeBytes) &&
      (value.ciphertextSizeBytes as number) > 0 &&
      (value.ciphertextSizeBytes as number) <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES &&
      envelopeDigest ===
        digestAgentCanonicalValue({
          algorithm: value.algorithm,
          keyId: value.keyId,
          keyVersion: value.keyVersion,
          keyRefDigest: value.keyRefDigest,
          encryptionProfileDigest: value.encryptionProfileDigest,
          nonceBase64Url: value.nonceBase64Url,
          authenticationTagBase64Url: value.authenticationTagBase64Url,
          ciphertextDigest: value.ciphertextDigest,
          ciphertextSizeBytes: value.ciphertextSizeBytes,
          aadDigest: value.aadDigest,
        }) &&
      safe(value)
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt =
  (
    aad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
    envelope: AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
    input: Readonly<{ createdAt: Instant; expiresAt: Instant }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(aad) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority(
        envelope
      ) ||
      envelope.spoolRef !==
        createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef(aad) ||
      envelope.aadDigest !==
        digestAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(aad) ||
      envelope.plaintextDigest !== aad.plaintextDigest ||
      !hasExactAgentControlKeys(input, ['createdAt', 'expiresAt'])
    ) {
      throw new TypeError('Hosted lifecycle spool receipt authority drifted.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RESULT_SPOOL_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      spoolRef: envelope.spoolRef,
      namespaceId: aad.namespaceId,
      repositoryCommit: aad.repositoryCommit,
      planDigest: aad.planDigest,
      frozenRunDigest: aad.frozenRunDigest,
      runConfigArtifactBindingDigest: aad.runConfigArtifactBindingDigest,
      runtimeResourceSetId: aad.runtimeResourceSetId,
      lifecycleExpiresAt: aad.lifecycleExpiresAt,
      registrationRequestDigest: aad.registrationRequestDigest,
      authorityDigest: aad.authorityDigest,
      lifecycleClaimReceiptDigest: aad.lifecycleClaimReceiptDigest,
      operation: aad.operation,
      resourceId: aad.resourceId,
      resourceRole: aad.resourceRole,
      dispatchIntentSetDigest: aad.dispatchIntentSetDigest,
      dispatchStageClaimReceiptSetDigest:
        aad.dispatchStageClaimReceiptSetDigest,
      dispatchStageClaimHistorySetDigest:
        aad.dispatchStageClaimHistorySetDigest,
      transportReceiptSetDigest: aad.transportReceiptSetDigest,
      businessResultDigest: aad.businessResultDigest,
      algorithm: envelope.algorithm,
      keyId: envelope.keyId,
      keyVersion: envelope.keyVersion,
      keyRefDigest: envelope.keyRefDigest,
      encryptionProfileDigest: envelope.encryptionProfileDigest,
      aadDigest: envelope.aadDigest,
      envelopeDigest: envelope.envelopeDigest,
      ciphertextDigest: envelope.ciphertextDigest,
      ciphertextSizeBytes: envelope.ciphertextSizeBytes,
      plaintextDigest: envelope.plaintextDigest,
      retentionClass:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_CLASS,
      retentionPolicyDigest:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY_DIGEST,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    });
    const value = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(value)
    ) {
      throw new TypeError('Hosted lifecycle spool receipt is invalid.');
    }
    return value;
  };

const resultSpoolReceiptAadMatches = (
  receipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt
): boolean => {
  try {
    return (
      receipt.aadDigest ===
      digestAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(
        createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad({
          namespaceId: receipt.namespaceId,
          repositoryCommit: receipt.repositoryCommit,
          planDigest: receipt.planDigest,
          frozenRunDigest: receipt.frozenRunDigest,
          runConfigArtifactBindingDigest:
            receipt.runConfigArtifactBindingDigest,
          runtimeResourceSetId: receipt.runtimeResourceSetId,
          lifecycleExpiresAt: receipt.lifecycleExpiresAt,
          registrationRequestDigest: receipt.registrationRequestDigest,
          authorityDigest: receipt.authorityDigest,
          lifecycleClaimReceiptDigest: receipt.lifecycleClaimReceiptDigest,
          operation: receipt.operation,
          resourceId: receipt.resourceId,
          resourceRole: receipt.resourceRole,
          dispatchIntentSetDigest: receipt.dispatchIntentSetDigest,
          dispatchStageClaimReceiptSetDigest:
            receipt.dispatchStageClaimReceiptSetDigest,
          dispatchStageClaimHistorySetDigest:
            receipt.dispatchStageClaimHistorySetDigest,
          transportReceiptSetDigest: receipt.transportReceiptSetDigest,
          businessResultDigest: receipt.businessResultDigest,
          plaintextDigest: receipt.plaintextDigest,
        })
      )
    );
  } catch {
    return false;
  }
};

export const isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt => {
    if (!hasExactAgentControlKeys(value, receiptKeys)) return false;
    const { receiptDigest, ...base } = value;
    return (
      value.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RESULT_SPOOL_RECEIPT_FORMAT &&
      value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      isAgentControlIdentity(value.spoolRef) &&
      isAgentControlIdentity(value.namespaceId) &&
      repositoryCommitPattern.test(value.repositoryCommit as string) &&
      isAgentControlIdentity(value.runtimeResourceSetId) &&
      isAgentControlInstant(value.lifecycleExpiresAt) &&
      [
        value.planDigest,
        value.frozenRunDigest,
        value.runConfigArtifactBindingDigest,
        value.registrationRequestDigest,
        value.dispatchIntentSetDigest,
        value.dispatchStageClaimReceiptSetDigest,
        value.dispatchStageClaimHistorySetDigest,
        value.transportReceiptSetDigest,
        value.businessResultDigest,
        value.keyRefDigest,
        value.encryptionProfileDigest,
        value.aadDigest,
        value.envelopeDigest,
        value.ciphertextDigest,
        value.plaintextDigest,
        value.retentionPolicyDigest,
        receiptDigest,
      ].every(isAgentCanonicalDigest) &&
      (value.authorityDigest === null ||
        isAgentCanonicalDigest(value.authorityDigest)) &&
      (value.lifecycleClaimReceiptDigest === null ||
        isAgentCanonicalDigest(value.lifecycleClaimReceiptDigest)) &&
      ['create', 'delete'].includes(value.operation as 'create' | 'delete') &&
      (value.resourceId === null || isAgentControlIdentity(value.resourceId)) &&
      [null, 'auxiliary', 'primary'].includes(
        value.resourceRole as 'auxiliary' | 'primary' | null
      ) &&
      (value.operation === 'create'
        ? value.authorityDigest === null &&
          value.lifecycleClaimReceiptDigest === null &&
          value.resourceId === null &&
          value.resourceRole === null
        : value.lifecycleClaimReceiptDigest !== null &&
          value.resourceId !== null &&
          value.resourceRole !== null) &&
      value.algorithm === 'aes-256-gcm' &&
      value.keyId ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID &&
      value.keyVersion ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION &&
      value.keyRefDigest ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST &&
      value.encryptionProfileDigest ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST &&
      Number.isSafeInteger(value.ciphertextSizeBytes) &&
      (value.ciphertextSizeBytes as number) > 0 &&
      (value.ciphertextSizeBytes as number) <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES &&
      value.retentionClass ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_CLASS &&
      value.retentionPolicyDigest ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY_DIGEST &&
      resultSpoolReceiptAadMatches(
        value as AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt
      ) &&
      isAgentControlInstant(value.createdAt) &&
      isAgentControlInstant(value.expiresAt) &&
      Date.parse(value.expiresAt as string) >
        Date.parse(value.createdAt as string) &&
      Date.parse(value.expiresAt as string) <=
        Date.parse(value.lifecycleExpiresAt as string) &&
      Date.parse(value.expiresAt as string) -
        Date.parse(value.createdAt as string) <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_LIFETIME_MS &&
      receiptDigest === digestAgentCanonicalValue(base) &&
      safe(value)
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt =
  (
    spool: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
    input: Readonly<{
      disposition:
        'destroyed-after-business-seal' | 'retained-encrypted-for-recovery';
      businessSealKind:
        | 'abandoned-before-provider-effect'
        | 'cleanup-result'
        | 'partial-create-result'
        | 'recovery-pending'
        | 'registration-result';
      businessSealReceiptDigest: CanonicalDigest | null;
      disposedAt: Instant;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt => {
    const destroyed = input.disposition === 'destroyed-after-business-seal';
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
        spool
      ) ||
      !hasExactAgentControlKeys(input, [
        'disposition',
        'businessSealKind',
        'businessSealReceiptDigest',
        'disposedAt',
      ]) ||
      !isAgentControlInstant(input.disposedAt) ||
      Date.parse(input.disposedAt) < Date.parse(spool.createdAt) ||
      Date.parse(input.disposedAt) >= Date.parse(spool.expiresAt) ||
      (destroyed
        ? input.businessSealKind === 'recovery-pending' ||
          !isAgentCanonicalDigest(input.businessSealReceiptDigest)
        : input.businessSealKind !== 'recovery-pending' ||
          input.businessSealReceiptDigest !== null) ||
      (spool.operation === 'delete' &&
        input.businessSealKind !== 'cleanup-result') ||
      (spool.operation === 'create' &&
        input.businessSealKind === 'cleanup-result')
    ) {
      throw new TypeError('Hosted lifecycle spool disposition is invalid.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RESULT_SPOOL_DISPOSITION_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      spoolRef: spool.spoolRef,
      spoolReceiptDigest: spool.receiptDigest,
      operation: spool.operation,
      registrationRequestDigest: spool.registrationRequestDigest,
      authorityDigest: spool.authorityDigest,
      lifecycleClaimReceiptDigest: spool.lifecycleClaimReceiptDigest,
      disposition: input.disposition,
      businessSealKind: input.businessSealKind,
      businessSealReceiptDigest: input.businessSealReceiptDigest,
      encryptionState: destroyed
        ? ('destroyed' as const)
        : ('retained-encrypted' as const),
      envelopeDigest: spool.envelopeDigest,
      ciphertextDigest: spool.ciphertextDigest,
      retentionPolicyDigest: spool.retentionPolicyDigest,
      createdAt: spool.createdAt,
      retainedUntil: spool.expiresAt,
      disposedAt: input.disposedAt,
    });
    const value = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt(
        value
      )
    ) {
      throw new TypeError('Hosted lifecycle spool disposition is invalid.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt => {
    if (!hasExactAgentControlKeys(value, dispositionKeys)) return false;
    const { receiptDigest, ...base } = value;
    const destroyed = value.disposition === 'destroyed-after-business-seal';
    return (
      value.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RESULT_SPOOL_DISPOSITION_RECEIPT_FORMAT &&
      value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      isAgentControlIdentity(value.spoolRef) &&
      [
        value.spoolReceiptDigest,
        value.registrationRequestDigest,
        value.envelopeDigest,
        value.ciphertextDigest,
        value.retentionPolicyDigest,
        receiptDigest,
      ].every(isAgentCanonicalDigest) &&
      (value.authorityDigest === null ||
        isAgentCanonicalDigest(value.authorityDigest)) &&
      (value.lifecycleClaimReceiptDigest === null ||
        isAgentCanonicalDigest(value.lifecycleClaimReceiptDigest)) &&
      ['create', 'delete'].includes(value.operation as 'create' | 'delete') &&
      [
        'destroyed-after-business-seal',
        'retained-encrypted-for-recovery',
      ].includes(value.disposition as 'destroyed-after-business-seal') &&
      [
        'abandoned-before-provider-effect',
        'cleanup-result',
        'partial-create-result',
        'recovery-pending',
        'registration-result',
      ].includes(value.businessSealKind as 'cleanup-result') &&
      (destroyed
        ? value.encryptionState === 'destroyed' &&
          value.businessSealKind !== 'recovery-pending' &&
          isAgentCanonicalDigest(value.businessSealReceiptDigest)
        : value.encryptionState === 'retained-encrypted' &&
          value.businessSealKind === 'recovery-pending' &&
          value.businessSealReceiptDigest === null) &&
      (value.operation === 'delete'
        ? value.businessSealKind === 'cleanup-result'
        : value.businessSealKind !== 'cleanup-result') &&
      isAgentControlInstant(value.retainedUntil) &&
      isAgentControlInstant(value.createdAt) &&
      isAgentControlInstant(value.disposedAt) &&
      Date.parse(value.disposedAt as string) >=
        Date.parse(value.createdAt as string) &&
      Date.parse(value.disposedAt as string) <
        Date.parse(value.retainedUntil as string) &&
      receiptDigest === digestAgentCanonicalValue(base) &&
      safe(value)
    );
  };

export const matchAgentHostedRetrievalRuntimeResourceLifecycleSpoolReceipt = (
  receipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
  aad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  envelope: AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority
): boolean => {
  try {
    return (
      isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
        receipt
      ) &&
      sameCanonicalJson(
        receipt,
        createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
          aad,
          envelope,
          { createdAt: receipt.createdAt, expiresAt: receipt.expiresAt }
        )
      )
    );
  } catch {
    return false;
  }
};

export const matchAgentHostedRetrievalRuntimeResourceLifecycleSpoolDisposition =
  (
    spool: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
    disposition: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(spool) &&
    isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt(
      disposition
    ) &&
    disposition.spoolRef === spool.spoolRef &&
    disposition.spoolReceiptDigest === spool.receiptDigest &&
    disposition.operation === spool.operation &&
    disposition.registrationRequestDigest === spool.registrationRequestDigest &&
    disposition.authorityDigest === spool.authorityDigest &&
    disposition.lifecycleClaimReceiptDigest ===
      spool.lifecycleClaimReceiptDigest &&
    disposition.envelopeDigest === spool.envelopeDigest &&
    disposition.ciphertextDigest === spool.ciphertextDigest &&
    disposition.retentionPolicyDigest === spool.retentionPolicyDigest &&
    disposition.createdAt === spool.createdAt &&
    disposition.retainedUntil === spool.expiresAt;
