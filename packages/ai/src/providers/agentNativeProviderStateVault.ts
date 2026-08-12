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
import type { AgentNativeProviderRuntimeFactSanitization } from './agentNativeProviderAdapters';

export const AGENT_NATIVE_PROVIDER_STATE_VAULT_AUTHORITY_FORMAT =
  'prodivix.agent-native-provider-state-vault-authority' as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_SEAL_REQUEST_FORMAT =
  'prodivix.agent-native-provider-state-vault-seal-request' as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_SEAL_RECEIPT_FORMAT =
  'prodivix.agent-native-provider-state-vault-seal-receipt' as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_REQUEST_FORMAT =
  'prodivix.agent-native-provider-state-vault-resolve-request' as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_RECEIPT_FORMAT =
  'prodivix.agent-native-provider-state-vault-resolve-receipt' as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_RETIRE_REQUEST_FORMAT =
  'prodivix.agent-native-provider-state-vault-retire-request' as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_RETIREMENT_RECEIPT_FORMAT =
  'prodivix.agent-native-provider-state-vault-retirement-receipt' as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION = 1 as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_BYTES = 16_384 as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS =
  125_000 as const;
export const AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS =
  30_000 as const;

export type AgentNativeProviderStateVaultPurpose =
  'background-job-state' | 'reasoning-continuation-state';

export type AgentNativeProviderStateVaultProtocol =
  'gemini-interactions' | 'openai-responses';

export type AgentNativeProviderStateReferenceKind =
  'interaction-id' | 'response-id';

export type AgentNativeProviderStateVaultAuthority = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_AUTHORITY_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION;
  authorityId: string;
  authorityImplementationDigest: CanonicalDigest;
  storageMode: 'server-side-vault-record';
  cryptographicExpiryMode: 'per-state-data-key-destroy';
  algorithm: 'aes-256-gcm';
  keyReferenceDigest: CanonicalDigest;
  keyVersion: number;
  encryptionProfileDigest: CanonicalDigest;
  retentionPolicyDigest: CanonicalDigest;
  deletionReceiptPolicyDigest: CanonicalDigest;
  maximumLifetimeMs: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS;
  maximumLifecycleAckDelayMs: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS;
  reconciliationMode: 'request-digest-idempotent';
  authorityDigest: CanonicalDigest;
}>;

export type AgentNativeProviderStateVaultSealRequestProjection = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_SEAL_REQUEST_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION;
  authorityDigest: CanonicalDigest;
  purpose: AgentNativeProviderStateVaultPurpose;
  attemptId: string;
  protocolFamily: AgentNativeProviderStateVaultProtocol;
  providerStateReferenceKind: AgentNativeProviderStateReferenceKind;
  providerStateReferenceDigest: CanonicalDigest;
  probeProgramDigest: CanonicalDigest;
  capabilityProfileDigest: CanonicalDigest;
  invocationId: string;
  requestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  responseBodyDigest: CanonicalDigest;
  sealedResponseJsonDigest: CanonicalDigest;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  taskId: string;
  runId: string;
  generation: number;
  observedAt: Instant;
  expiresAt: Instant;
  sealRequestDigest: CanonicalDigest;
}>;

export type CreateAgentNativeProviderStateVaultSealRequestInput = Omit<
  AgentNativeProviderStateVaultSealRequestProjection,
  'format' | 'version' | 'sealRequestDigest'
>;

export type AgentNativeProviderStateVaultSealPortInput = Readonly<{
  request: AgentNativeProviderStateVaultSealRequestProjection;
  /** Callback-local official response/interaction id. It must never be persisted. */
  callbackLocalProviderStateHandle: string;
}>;

export type AgentNativeProviderStateVaultSealPortResult =
  | Readonly<{
      status: 'sealed';
      opaqueProviderStateRef: string;
      stateKeyCreationReceiptDigest: CanonicalDigest;
      sealedAt: Instant;
    }>
  | Readonly<{
      status: 'failed' | 'unavailable';
      opaqueProviderStateRef: null;
      stateKeyCreationReceiptDigest: null;
      sealedAt: Instant;
    }>;

export type AgentNativeProviderStateVaultSealReceipt = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_SEAL_RECEIPT_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION;
  authorityDigest: CanonicalDigest;
  sealRequestDigest: CanonicalDigest;
  providerStateReferenceDigest: CanonicalDigest;
  status: 'failed' | 'sealed' | 'unavailable';
  opaqueProviderStateRef: string | null;
  stateKeyCreationReceiptDigest: CanonicalDigest | null;
  sealedAt: Instant;
  expiresAt: Instant | null;
  retirementRequired: boolean;
  receiptDigest: CanonicalDigest;
}>;

export type AgentNativeProviderStateVaultResolveRequest = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_REQUEST_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION;
  authorityDigest: CanonicalDigest;
  opaqueProviderStateRef: string;
  sealRequestDigest: CanonicalDigest;
  sealReceiptDigest: CanonicalDigest;
  purpose: AgentNativeProviderStateVaultPurpose;
  providerStateReferenceKind: AgentNativeProviderStateReferenceKind;
  providerStateReferenceDigest: CanonicalDigest;
  sourceAttemptId: string;
  sourceInvocationId: string;
  sourceGeneration: number;
  consumerAttemptId: string;
  consumerInvocationId: string;
  consumerGeneration: number;
  taskId: string;
  runId: string;
  requestedAt: Instant;
  expiresAt: Instant;
  resolveRequestDigest: CanonicalDigest;
}>;

export type AgentNativeProviderStateVaultResolvePortInput = Readonly<{
  request: AgentNativeProviderStateVaultResolveRequest;
}>;

export type AgentNativeProviderStateVaultResolvePortResult =
  | Readonly<{
      status: 'resolved';
      /** Callback-local official Provider handle. It must never be persisted. */
      callbackLocalProviderStateHandle: string;
      resolvedAt: Instant;
    }>
  | Readonly<{
      status: 'expired' | 'retired' | 'unavailable';
      callbackLocalProviderStateHandle: null;
      resolvedAt: Instant;
    }>;

export type AgentNativeProviderStateVaultResolveReceipt = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_RECEIPT_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION;
  authorityDigest: CanonicalDigest;
  resolveRequestDigest: CanonicalDigest;
  sealReceiptDigest: CanonicalDigest;
  opaqueProviderStateRef: string;
  status: 'expired' | 'resolved' | 'retired' | 'unavailable';
  providerStateReferenceDigest: CanonicalDigest;
  callbackLocalProviderStateHandleDigest: CanonicalDigest | null;
  resolvedAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentNativeProviderStateVaultRetireDisposition =
  'cancelled' | 'consumed' | 'expired' | 'overdue-expired';

export type AgentNativeProviderStateVaultRetireRequest = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_RETIRE_REQUEST_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION;
  authorityDigest: CanonicalDigest;
  opaqueProviderStateRef: string;
  sealRequestDigest: CanonicalDigest;
  sealReceiptDigest: CanonicalDigest;
  resolveReceiptDigest: CanonicalDigest | null;
  purpose: AgentNativeProviderStateVaultPurpose;
  sourceAttemptId: string;
  sourceInvocationId: string;
  sourceGeneration: number;
  consumerAttemptId: string | null;
  consumerInvocationId: string | null;
  consumerGeneration: number | null;
  disposition: AgentNativeProviderStateVaultRetireDisposition;
  requestedAt: Instant;
  expiresAt: Instant;
  retireRequestDigest: CanonicalDigest;
}>;

export type AgentNativeProviderStateVaultRetirePortInput = Readonly<{
  request: AgentNativeProviderStateVaultRetireRequest;
}>;

export type AgentNativeProviderStateVaultRetirePortResult =
  | Readonly<{
      status: 'retired';
      stateKeyDestructionReceiptDigest: CanonicalDigest;
      opaqueRecordDeletionReceiptDigest: CanonicalDigest;
      retiredAt: Instant;
    }>
  | Readonly<{
      status: 'failed';
      stateKeyDestructionReceiptDigest: null;
      opaqueRecordDeletionReceiptDigest: null;
      retiredAt: Instant;
    }>;

export type AgentNativeProviderStateVaultRetirementReceipt = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_RETIREMENT_RECEIPT_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION;
  authorityDigest: CanonicalDigest;
  retireRequestDigest: CanonicalDigest;
  sealReceiptDigest: CanonicalDigest;
  opaqueProviderStateRef: string;
  stateKeyCreationReceiptDigest: CanonicalDigest;
  resolveReceiptDigest: CanonicalDigest | null;
  disposition: AgentNativeProviderStateVaultRetireDisposition;
  retirementTimeliness: 'overdue-violation' | 'within-policy';
  policyViolationDigest: CanonicalDigest | null;
  stateKeyDestructionReceiptDigest: CanonicalDigest;
  opaqueRecordDeletionReceiptDigest: CanonicalDigest;
  cryptographicExpiryReceiptDigest: CanonicalDigest;
  retiredAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentNativeProviderStateVaultPort = Readonly<{
  authority: AgentNativeProviderStateVaultAuthority;
  seal(
    input: AgentNativeProviderStateVaultSealPortInput
  ):
    | AgentNativeProviderStateVaultSealPortResult
    | Promise<AgentNativeProviderStateVaultSealPortResult>;
  resolve(
    input: AgentNativeProviderStateVaultResolvePortInput
  ):
    | AgentNativeProviderStateVaultResolvePortResult
    | Promise<AgentNativeProviderStateVaultResolvePortResult>;
  retire(
    input: AgentNativeProviderStateVaultRetirePortInput
  ):
    | AgentNativeProviderStateVaultRetirePortResult
    | Promise<AgentNativeProviderStateVaultRetirePortResult>;
  lookupRetirementReceipt(
    retireRequestDigest: CanonicalDigest
  ):
    | AgentNativeProviderStateVaultRetirementReceipt
    | null
    | Promise<AgentNativeProviderStateVaultRetirementReceipt | null>;
}>;

const emptySanitization: AgentNativeProviderRuntimeFactSanitization =
  Object.freeze({
    protectedMaterialCanaries: Object.freeze([]),
    secretCanaries: Object.freeze([]),
  });

const safeJson = (
  value: unknown,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): boolean => {
  try {
    return (
      inspectAgentControlJson(
        value,
        AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_BYTES
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

const authorityKeys = Object.freeze([
  'format',
  'version',
  'authorityId',
  'authorityImplementationDigest',
  'storageMode',
  'cryptographicExpiryMode',
  'algorithm',
  'keyReferenceDigest',
  'keyVersion',
  'encryptionProfileDigest',
  'retentionPolicyDigest',
  'deletionReceiptPolicyDigest',
  'maximumLifetimeMs',
  'maximumLifecycleAckDelayMs',
  'reconciliationMode',
  'authorityDigest',
] as const);

export const createAgentNativeProviderStateVaultAuthority = (input: {
  authorityId: string;
  authorityImplementationDigest: CanonicalDigest;
  algorithm: 'aes-256-gcm';
  keyReferenceDigest: CanonicalDigest;
  keyVersion: number;
  encryptionProfileDigest: CanonicalDigest;
  retentionPolicyDigest: CanonicalDigest;
  deletionReceiptPolicyDigest: CanonicalDigest;
}): AgentNativeProviderStateVaultAuthority => {
  if (
    !hasExactAgentControlKeys(input, [
      'authorityId',
      'authorityImplementationDigest',
      'algorithm',
      'keyReferenceDigest',
      'keyVersion',
      'encryptionProfileDigest',
      'retentionPolicyDigest',
      'deletionReceiptPolicyDigest',
    ]) ||
    !isAgentControlIdentity(input.authorityId) ||
    input.algorithm !== 'aes-256-gcm' ||
    !Number.isSafeInteger(input.keyVersion) ||
    input.keyVersion < 1 ||
    ![
      input.authorityImplementationDigest,
      input.keyReferenceDigest,
      input.encryptionProfileDigest,
      input.retentionPolicyDigest,
      input.deletionReceiptPolicyDigest,
    ].every(isAgentCanonicalDigest)
  ) {
    throw new TypeError('Native Provider state vault authority is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_STATE_VAULT_AUTHORITY_FORMAT,
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    authorityId: input.authorityId,
    authorityImplementationDigest: input.authorityImplementationDigest,
    storageMode: 'server-side-vault-record' as const,
    cryptographicExpiryMode: 'per-state-data-key-destroy' as const,
    algorithm: input.algorithm,
    keyReferenceDigest: input.keyReferenceDigest,
    keyVersion: input.keyVersion,
    encryptionProfileDigest: input.encryptionProfileDigest,
    retentionPolicyDigest: input.retentionPolicyDigest,
    deletionReceiptPolicyDigest: input.deletionReceiptPolicyDigest,
    maximumLifetimeMs: AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS,
    maximumLifecycleAckDelayMs:
      AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS,
    reconciliationMode: 'request-digest-idempotent' as const,
  });
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentNativeProviderStateVaultAuthority = (
  value: unknown
): value is AgentNativeProviderStateVaultAuthority => {
  if (!hasExactAgentControlKeys(value, authorityKeys)) return false;
  try {
    return sameCanonicalJson(
      value,
      createAgentNativeProviderStateVaultAuthority({
        authorityId: value.authorityId as string,
        authorityImplementationDigest:
          value.authorityImplementationDigest as CanonicalDigest,
        algorithm: value.algorithm as 'aes-256-gcm',
        keyReferenceDigest: value.keyReferenceDigest as CanonicalDigest,
        keyVersion: value.keyVersion as number,
        encryptionProfileDigest:
          value.encryptionProfileDigest as CanonicalDigest,
        retentionPolicyDigest: value.retentionPolicyDigest as CanonicalDigest,
        deletionReceiptPolicyDigest:
          value.deletionReceiptPolicyDigest as CanonicalDigest,
      })
    );
  } catch {
    return false;
  }
};

const sealRequestInputKeys = Object.freeze([
  'authorityDigest',
  'purpose',
  'attemptId',
  'protocolFamily',
  'providerStateReferenceKind',
  'providerStateReferenceDigest',
  'probeProgramDigest',
  'capabilityProfileDigest',
  'invocationId',
  'requestDigest',
  'responseDigest',
  'responseBodyDigest',
  'sealedResponseJsonDigest',
  'providerConfigurationId',
  'modelLineageDigest',
  'adapterDigest',
  'taskId',
  'runId',
  'generation',
  'observedAt',
  'expiresAt',
] as const);
const sealRequestKeys = Object.freeze([
  'format',
  'version',
  ...sealRequestInputKeys,
  'sealRequestDigest',
] as const);

const stateReferencePairMatches = (
  protocolFamily: AgentNativeProviderStateVaultProtocol,
  kind: AgentNativeProviderStateReferenceKind
): boolean =>
  (protocolFamily === 'openai-responses' && kind === 'response-id') ||
  (protocolFamily === 'gemini-interactions' && kind === 'interaction-id');

export const createAgentNativeProviderStateVaultSealRequest = (
  input: CreateAgentNativeProviderStateVaultSealRequestInput
): AgentNativeProviderStateVaultSealRequestProjection => {
  if (
    !hasExactAgentControlKeys(input, sealRequestInputKeys) ||
    !isAgentCanonicalDigest(input.authorityDigest) ||
    !['background-job-state', 'reasoning-continuation-state'].includes(
      input.purpose
    ) ||
    !isAgentControlIdentity(input.attemptId) ||
    !stateReferencePairMatches(
      input.protocolFamily,
      input.providerStateReferenceKind
    ) ||
    ![
      input.providerStateReferenceDigest,
      input.probeProgramDigest,
      input.capabilityProfileDigest,
      input.requestDigest,
      input.responseDigest,
      input.responseBodyDigest,
      input.sealedResponseJsonDigest,
      input.modelLineageDigest,
      input.adapterDigest,
    ].every(isAgentCanonicalDigest) ||
    ![
      input.invocationId,
      input.providerConfigurationId,
      input.taskId,
      input.runId,
    ].every(isAgentControlIdentity) ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0 ||
    !isAgentControlInstant(input.observedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) - Date.parse(input.observedAt) !==
      AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS
  ) {
    throw new TypeError('Native Provider state vault seal request is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_STATE_VAULT_SEAL_REQUEST_FORMAT,
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    ...input,
  });
  const request = Object.freeze({
    ...base,
    sealRequestDigest: digestAgentCanonicalValue(base),
  });
  if (!safeJson(request, emptySanitization)) {
    throw new TypeError('Native Provider state vault seal request is unsafe.');
  }
  return request;
};

export const isAgentNativeProviderStateVaultSealRequest = (
  value: unknown
): value is AgentNativeProviderStateVaultSealRequestProjection => {
  if (!hasExactAgentControlKeys(value, sealRequestKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      sealRequestDigest: _sealRequestDigest,
      ...input
    } = value as AgentNativeProviderStateVaultSealRequestProjection;
    return sameCanonicalJson(
      value,
      createAgentNativeProviderStateVaultSealRequest(input)
    );
  } catch {
    return false;
  }
};

export const createAgentNativeProviderStateVaultOpaqueRef = (input: {
  authorityDigest: CanonicalDigest;
  sealRequestDigest: CanonicalDigest;
  stateKeyCreationReceiptDigest: CanonicalDigest;
}): string => {
  if (
    !hasExactAgentControlKeys(input, [
      'authorityDigest',
      'sealRequestDigest',
      'stateKeyCreationReceiptDigest',
    ]) ||
    ![
      input.authorityDigest,
      input.sealRequestDigest,
      input.stateKeyCreationReceiptDigest,
    ].every(isAgentCanonicalDigest)
  ) {
    throw new TypeError('Native Provider state vault opaque ref is invalid.');
  }
  const digest = digestAgentCanonicalValue({
    format: 'prodivix.agent-native-provider-state-vault-opaque-ref',
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    ...input,
  });
  return `state-vault-ref.${digest.slice('sha256-'.length)}`;
};

const sealReceiptKeys = Object.freeze([
  'format',
  'version',
  'authorityDigest',
  'sealRequestDigest',
  'providerStateReferenceDigest',
  'status',
  'opaqueProviderStateRef',
  'stateKeyCreationReceiptDigest',
  'sealedAt',
  'expiresAt',
  'retirementRequired',
  'receiptDigest',
] as const);

export const createAgentNativeProviderStateVaultSealReceipt = (
  request: AgentNativeProviderStateVaultSealRequestProjection,
  result: AgentNativeProviderStateVaultSealPortResult,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): AgentNativeProviderStateVaultSealReceipt => {
  if (
    !isAgentNativeProviderStateVaultSealRequest(request) ||
    !hasExactAgentControlKeys(result, [
      'status',
      'opaqueProviderStateRef',
      'stateKeyCreationReceiptDigest',
      'sealedAt',
    ]) ||
    !['failed', 'sealed', 'unavailable'].includes(result.status) ||
    !isAgentControlInstant(result.sealedAt) ||
    Date.parse(result.sealedAt) < Date.parse(request.observedAt) ||
    Date.parse(result.sealedAt) - Date.parse(request.observedAt) >
      AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS ||
    (result.status === 'sealed'
      ? !isAgentCanonicalDigest(result.stateKeyCreationReceiptDigest) ||
        result.opaqueProviderStateRef !==
          createAgentNativeProviderStateVaultOpaqueRef({
            authorityDigest: request.authorityDigest,
            sealRequestDigest: request.sealRequestDigest,
            stateKeyCreationReceiptDigest: result.stateKeyCreationReceiptDigest,
          })
      : result.opaqueProviderStateRef !== null ||
        result.stateKeyCreationReceiptDigest !== null)
  ) {
    throw new TypeError('Native Provider state vault seal result is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_STATE_VAULT_SEAL_RECEIPT_FORMAT,
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    authorityDigest: request.authorityDigest,
    sealRequestDigest: request.sealRequestDigest,
    providerStateReferenceDigest: request.providerStateReferenceDigest,
    status: result.status,
    opaqueProviderStateRef: result.opaqueProviderStateRef,
    stateKeyCreationReceiptDigest: result.stateKeyCreationReceiptDigest,
    sealedAt: result.sealedAt,
    expiresAt: result.status === 'sealed' ? request.expiresAt : null,
    retirementRequired: result.status === 'sealed',
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!safeJson(receipt, sanitization)) {
    throw new TypeError('Native Provider state vault seal receipt is unsafe.');
  }
  return receipt;
};

export const isAgentNativeProviderStateVaultSealReceipt = (
  value: unknown,
  request: AgentNativeProviderStateVaultSealRequestProjection,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): value is AgentNativeProviderStateVaultSealReceipt => {
  if (!hasExactAgentControlKeys(value, sealReceiptKeys)) return false;
  try {
    return sameCanonicalJson(
      value,
      createAgentNativeProviderStateVaultSealReceipt(
        request,
        {
          status: value.status as 'failed' | 'sealed' | 'unavailable',
          opaqueProviderStateRef: value.opaqueProviderStateRef as string | null,
          stateKeyCreationReceiptDigest:
            value.stateKeyCreationReceiptDigest as CanonicalDigest | null,
          sealedAt: value.sealedAt as Instant,
        } as AgentNativeProviderStateVaultSealPortResult,
        sanitization
      )
    );
  } catch {
    return false;
  }
};

const resolveRequestKeys = Object.freeze([
  'format',
  'version',
  'authorityDigest',
  'opaqueProviderStateRef',
  'sealRequestDigest',
  'sealReceiptDigest',
  'purpose',
  'providerStateReferenceKind',
  'providerStateReferenceDigest',
  'sourceAttemptId',
  'sourceInvocationId',
  'sourceGeneration',
  'consumerAttemptId',
  'consumerInvocationId',
  'consumerGeneration',
  'taskId',
  'runId',
  'requestedAt',
  'expiresAt',
  'resolveRequestDigest',
] as const);

export const createAgentNativeProviderStateVaultResolveRequest = (input: {
  sealRequest: AgentNativeProviderStateVaultSealRequestProjection;
  sealReceipt: AgentNativeProviderStateVaultSealReceipt;
  consumerAttemptId: string;
  consumerInvocationId: string;
  consumerGeneration: number;
  requestedAt: Instant;
}): AgentNativeProviderStateVaultResolveRequest => {
  if (
    !hasExactAgentControlKeys(input, [
      'sealRequest',
      'sealReceipt',
      'consumerAttemptId',
      'consumerInvocationId',
      'consumerGeneration',
      'requestedAt',
    ]) ||
    !isAgentNativeProviderStateVaultSealRequest(input.sealRequest) ||
    !isAgentNativeProviderStateVaultSealReceipt(
      input.sealReceipt,
      input.sealRequest
    ) ||
    input.sealReceipt.status !== 'sealed' ||
    !isAgentControlIdentity(input.consumerAttemptId) ||
    input.consumerAttemptId !== input.sealRequest.attemptId ||
    !isAgentControlIdentity(input.consumerInvocationId) ||
    input.consumerInvocationId === input.sealRequest.invocationId ||
    !Number.isSafeInteger(input.consumerGeneration) ||
    input.consumerGeneration !== input.sealRequest.generation ||
    !isAgentControlInstant(input.requestedAt) ||
    Date.parse(input.requestedAt) < Date.parse(input.sealReceipt.sealedAt) ||
    Date.parse(input.requestedAt) >= Date.parse(input.sealRequest.expiresAt)
  ) {
    throw new TypeError(
      'Native Provider state vault resolve request is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_REQUEST_FORMAT,
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    authorityDigest: input.sealRequest.authorityDigest,
    opaqueProviderStateRef: input.sealReceipt.opaqueProviderStateRef!,
    sealRequestDigest: input.sealRequest.sealRequestDigest,
    sealReceiptDigest: input.sealReceipt.receiptDigest,
    purpose: input.sealRequest.purpose,
    providerStateReferenceKind: input.sealRequest.providerStateReferenceKind,
    providerStateReferenceDigest:
      input.sealRequest.providerStateReferenceDigest,
    sourceAttemptId: input.sealRequest.attemptId,
    sourceInvocationId: input.sealRequest.invocationId,
    sourceGeneration: input.sealRequest.generation,
    consumerAttemptId: input.consumerAttemptId,
    consumerInvocationId: input.consumerInvocationId,
    consumerGeneration: input.consumerGeneration,
    taskId: input.sealRequest.taskId,
    runId: input.sealRequest.runId,
    requestedAt: input.requestedAt,
    expiresAt: input.sealRequest.expiresAt,
  });
  const request = Object.freeze({
    ...base,
    resolveRequestDigest: digestAgentCanonicalValue(base),
  });
  if (!safeJson(request, emptySanitization)) {
    throw new TypeError(
      'Native Provider state vault resolve request is unsafe.'
    );
  }
  return request;
};

const isResolveRequestSelf = (
  value: unknown
): value is AgentNativeProviderStateVaultResolveRequest => {
  if (!hasExactAgentControlKeys(value, resolveRequestKeys)) return false;
  const request = value as AgentNativeProviderStateVaultResolveRequest;
  if (
    ![
      request.authorityDigest,
      request.sealRequestDigest,
      request.sealReceiptDigest,
      request.providerStateReferenceDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlIdentity(request.opaqueProviderStateRef) ||
    !['background-job-state', 'reasoning-continuation-state'].includes(
      request.purpose
    ) ||
    !['interaction-id', 'response-id'].includes(
      request.providerStateReferenceKind
    ) ||
    ![
      request.sourceAttemptId,
      request.sourceInvocationId,
      request.consumerAttemptId,
      request.consumerInvocationId,
      request.taskId,
      request.runId,
    ].every(isAgentControlIdentity) ||
    !Number.isSafeInteger(request.sourceGeneration) ||
    !Number.isSafeInteger(request.consumerGeneration) ||
    request.sourceGeneration < 0 ||
    request.consumerAttemptId !== request.sourceAttemptId ||
    request.consumerInvocationId === request.sourceInvocationId ||
    request.consumerGeneration !== request.sourceGeneration ||
    !isAgentControlInstant(request.requestedAt) ||
    !isAgentControlInstant(request.expiresAt) ||
    Date.parse(request.requestedAt) >= Date.parse(request.expiresAt) ||
    !isAgentCanonicalDigest(request.resolveRequestDigest)
  ) {
    return false;
  }
  const { resolveRequestDigest, ...base } = request;
  return resolveRequestDigest === digestAgentCanonicalValue(base);
};

export const isAgentNativeProviderStateVaultResolveRequest = (
  value: unknown,
  sealRequest: AgentNativeProviderStateVaultSealRequestProjection,
  sealReceipt: AgentNativeProviderStateVaultSealReceipt
): value is AgentNativeProviderStateVaultResolveRequest => {
  if (!isResolveRequestSelf(value)) return false;
  try {
    return sameCanonicalJson(
      value,
      createAgentNativeProviderStateVaultResolveRequest({
        sealRequest,
        sealReceipt,
        consumerAttemptId: value.consumerAttemptId as string,
        consumerInvocationId: value.consumerInvocationId as string,
        consumerGeneration: value.consumerGeneration as number,
        requestedAt: value.requestedAt as Instant,
      })
    );
  } catch {
    return false;
  }
};

const resolveReceiptKeys = Object.freeze([
  'format',
  'version',
  'authorityDigest',
  'resolveRequestDigest',
  'sealReceiptDigest',
  'opaqueProviderStateRef',
  'status',
  'providerStateReferenceDigest',
  'callbackLocalProviderStateHandleDigest',
  'resolvedAt',
  'expiresAt',
  'receiptDigest',
] as const);

export const createAgentNativeProviderStateVaultResolveReceipt = (
  request: AgentNativeProviderStateVaultResolveRequest,
  result: AgentNativeProviderStateVaultResolvePortResult,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): AgentNativeProviderStateVaultResolveReceipt => {
  if (
    !isResolveRequestSelf(request) ||
    !hasExactAgentControlKeys(result, [
      'status',
      'callbackLocalProviderStateHandle',
      'resolvedAt',
    ]) ||
    !['expired', 'resolved', 'retired', 'unavailable'].includes(
      result.status
    ) ||
    !isAgentControlInstant(result.resolvedAt) ||
    Date.parse(result.resolvedAt) < Date.parse(request.requestedAt) ||
    Date.parse(result.resolvedAt) - Date.parse(request.requestedAt) >
      AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS ||
    (result.status === 'resolved'
      ? !isAgentControlIdentity(result.callbackLocalProviderStateHandle) ||
        digestAgentNativeProviderStateReference(
          request.providerStateReferenceKind,
          result.callbackLocalProviderStateHandle
        ) !== request.providerStateReferenceDigest ||
        Date.parse(result.resolvedAt) >= Date.parse(request.expiresAt)
      : result.callbackLocalProviderStateHandle !== null) ||
    (result.status === 'expired' &&
      Date.parse(result.resolvedAt) < Date.parse(request.expiresAt))
  ) {
    throw new TypeError(
      'Native Provider state vault resolve result is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_RECEIPT_FORMAT,
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    authorityDigest: request.authorityDigest,
    resolveRequestDigest: request.resolveRequestDigest,
    sealReceiptDigest: request.sealReceiptDigest,
    opaqueProviderStateRef: request.opaqueProviderStateRef,
    status: result.status,
    providerStateReferenceDigest: request.providerStateReferenceDigest,
    callbackLocalProviderStateHandleDigest:
      result.status === 'resolved'
        ? request.providerStateReferenceDigest
        : null,
    resolvedAt: result.resolvedAt,
    expiresAt: request.expiresAt,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!safeJson(receipt, sanitization)) {
    throw new TypeError(
      'Native Provider state vault resolve receipt is unsafe.'
    );
  }
  return receipt;
};

export const isAgentNativeProviderStateVaultResolveReceipt = (
  value: unknown,
  request: AgentNativeProviderStateVaultResolveRequest,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): value is AgentNativeProviderStateVaultResolveReceipt => {
  if (!hasExactAgentControlKeys(value, resolveReceiptKeys)) return false;
  const receipt = value as AgentNativeProviderStateVaultResolveReceipt;
  if (
    receipt.authorityDigest !== request.authorityDigest ||
    receipt.resolveRequestDigest !== request.resolveRequestDigest ||
    receipt.sealReceiptDigest !== request.sealReceiptDigest ||
    receipt.opaqueProviderStateRef !== request.opaqueProviderStateRef ||
    receipt.providerStateReferenceDigest !==
      request.providerStateReferenceDigest ||
    receipt.expiresAt !== request.expiresAt ||
    !['expired', 'resolved', 'retired', 'unavailable'].includes(
      receipt.status
    ) ||
    !isAgentControlInstant(receipt.resolvedAt) ||
    Date.parse(receipt.resolvedAt) < Date.parse(request.requestedAt) ||
    Date.parse(receipt.resolvedAt) - Date.parse(request.requestedAt) >
      AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS ||
    !isAgentCanonicalDigest(receipt.receiptDigest) ||
    (receipt.status === 'resolved'
      ? receipt.callbackLocalProviderStateHandleDigest !==
          request.providerStateReferenceDigest ||
        Date.parse(receipt.resolvedAt) >= Date.parse(request.expiresAt)
      : receipt.callbackLocalProviderStateHandleDigest !== null) ||
    (receipt.status === 'expired' &&
      Date.parse(receipt.resolvedAt) < Date.parse(request.expiresAt))
  ) {
    return false;
  }
  const { receiptDigest, ...base } = receipt;
  return (
    receiptDigest === digestAgentCanonicalValue(base) &&
    safeJson(receipt, sanitization)
  );
};

const retireRequestKeys = Object.freeze([
  'format',
  'version',
  'authorityDigest',
  'opaqueProviderStateRef',
  'sealRequestDigest',
  'sealReceiptDigest',
  'resolveReceiptDigest',
  'purpose',
  'sourceAttemptId',
  'sourceInvocationId',
  'sourceGeneration',
  'consumerAttemptId',
  'consumerInvocationId',
  'consumerGeneration',
  'disposition',
  'requestedAt',
  'expiresAt',
  'retireRequestDigest',
] as const);

export const createAgentNativeProviderStateVaultRetireRequest = (input: {
  sealRequest: AgentNativeProviderStateVaultSealRequestProjection;
  sealReceipt: AgentNativeProviderStateVaultSealReceipt;
  resolveRequest: AgentNativeProviderStateVaultResolveRequest | null;
  resolveReceipt: AgentNativeProviderStateVaultResolveReceipt | null;
  disposition: AgentNativeProviderStateVaultRetireDisposition;
  requestedAt: Instant;
}): AgentNativeProviderStateVaultRetireRequest => {
  const resolveRequest = input.resolveRequest;
  const resolveReceipt = input.resolveReceipt;
  const resolvePairIsAbsent =
    resolveRequest === null && resolveReceipt === null;
  const resolvePairIsValid =
    resolveRequest !== null &&
    resolveReceipt !== null &&
    isAgentNativeProviderStateVaultResolveRequest(
      resolveRequest,
      input.sealRequest,
      input.sealReceipt
    ) &&
    isAgentNativeProviderStateVaultResolveReceipt(
      resolveReceipt,
      resolveRequest
    );
  if (
    !hasExactAgentControlKeys(input, [
      'sealRequest',
      'sealReceipt',
      'resolveRequest',
      'resolveReceipt',
      'disposition',
      'requestedAt',
    ]) ||
    !isAgentNativeProviderStateVaultSealRequest(input.sealRequest) ||
    !isAgentNativeProviderStateVaultSealReceipt(
      input.sealReceipt,
      input.sealRequest
    ) ||
    input.sealReceipt.status !== 'sealed' ||
    !['cancelled', 'consumed', 'expired', 'overdue-expired'].includes(
      input.disposition
    ) ||
    !isAgentControlInstant(input.requestedAt) ||
    Date.parse(input.requestedAt) < Date.parse(input.sealReceipt.sealedAt) ||
    (!resolvePairIsAbsent && !resolvePairIsValid) ||
    (input.disposition === 'consumed' &&
      (!resolvePairIsValid || resolveReceipt?.status !== 'resolved')) ||
    (input.disposition === 'cancelled' &&
      resolvePairIsValid &&
      resolveReceipt?.status === 'resolved') ||
    (input.disposition === 'expired' &&
      resolvePairIsValid &&
      resolveReceipt?.status !== 'expired') ||
    (input.disposition === 'expired' &&
      Date.parse(input.requestedAt) <
        Date.parse(input.sealRequest.expiresAt)) ||
    (input.disposition === 'expired' &&
      Date.parse(input.requestedAt) >
        Date.parse(input.sealRequest.expiresAt) +
          AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS) ||
    (input.disposition === 'overdue-expired' &&
      Date.parse(input.requestedAt) <=
        Date.parse(input.sealRequest.expiresAt) +
          AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS) ||
    (!['expired', 'overdue-expired'].includes(input.disposition) &&
      Date.parse(input.requestedAt) >
        Date.parse(input.sealRequest.expiresAt) +
          AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS) ||
    (resolvePairIsValid &&
      (resolveReceipt?.authorityDigest !== input.sealRequest.authorityDigest ||
        resolveReceipt?.sealReceiptDigest !== input.sealReceipt.receiptDigest ||
        resolveReceipt?.opaqueProviderStateRef !==
          input.sealReceipt.opaqueProviderStateRef ||
        Date.parse(input.requestedAt) <
          Date.parse(resolveReceipt?.resolvedAt ?? 'invalid')))
  ) {
    throw new TypeError(
      'Native Provider state vault retire request is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_STATE_VAULT_RETIRE_REQUEST_FORMAT,
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    authorityDigest: input.sealRequest.authorityDigest,
    opaqueProviderStateRef: input.sealReceipt.opaqueProviderStateRef!,
    sealRequestDigest: input.sealRequest.sealRequestDigest,
    sealReceiptDigest: input.sealReceipt.receiptDigest,
    resolveReceiptDigest: resolveReceipt?.receiptDigest ?? null,
    purpose: input.sealRequest.purpose,
    sourceAttemptId: input.sealRequest.attemptId,
    sourceInvocationId: input.sealRequest.invocationId,
    sourceGeneration: input.sealRequest.generation,
    consumerAttemptId:
      resolveRequest === null ? null : resolveRequest.consumerAttemptId,
    consumerInvocationId:
      resolveRequest === null ? null : resolveRequest.consumerInvocationId,
    consumerGeneration:
      resolveRequest === null ? null : resolveRequest.consumerGeneration,
    disposition: input.disposition,
    requestedAt: input.requestedAt,
    expiresAt: input.sealRequest.expiresAt,
  });
  const request = Object.freeze({
    ...base,
    retireRequestDigest: digestAgentCanonicalValue(base),
  });
  if (!safeJson(request, emptySanitization)) {
    throw new TypeError(
      'Native Provider state vault retire request is unsafe.'
    );
  }
  return request;
};

export const isAgentNativeProviderStateVaultRetireRequest = (
  value: unknown
): value is AgentNativeProviderStateVaultRetireRequest => {
  if (!hasExactAgentControlKeys(value, retireRequestKeys)) return false;
  const request = value as AgentNativeProviderStateVaultRetireRequest;
  if (
    !isAgentCanonicalDigest(request.authorityDigest) ||
    !isAgentControlIdentity(request.opaqueProviderStateRef) ||
    ![request.sealRequestDigest, request.sealReceiptDigest].every(
      isAgentCanonicalDigest
    ) ||
    (request.resolveReceiptDigest !== null &&
      !isAgentCanonicalDigest(request.resolveReceiptDigest)) ||
    !['background-job-state', 'reasoning-continuation-state'].includes(
      request.purpose
    ) ||
    ![request.sourceAttemptId, request.sourceInvocationId].every(
      isAgentControlIdentity
    ) ||
    !Number.isSafeInteger(request.sourceGeneration) ||
    request.sourceGeneration < 0 ||
    !['cancelled', 'consumed', 'expired', 'overdue-expired'].includes(
      request.disposition
    ) ||
    !isAgentControlInstant(request.requestedAt) ||
    !isAgentControlInstant(request.expiresAt) ||
    !isAgentCanonicalDigest(request.retireRequestDigest) ||
    (request.disposition === 'overdue-expired'
      ? Date.parse(request.requestedAt) <=
        Date.parse(request.expiresAt) +
          AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS
      : Date.parse(request.requestedAt) >
        Date.parse(request.expiresAt) +
          AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS) ||
    (request.resolveReceiptDigest === null
      ? request.consumerAttemptId !== null ||
        request.consumerInvocationId !== null ||
        request.consumerGeneration !== null
      : !isAgentControlIdentity(request.consumerAttemptId) ||
        !isAgentControlIdentity(request.consumerInvocationId) ||
        !Number.isSafeInteger(request.consumerGeneration) ||
        request.consumerAttemptId !== request.sourceAttemptId ||
        request.consumerInvocationId === request.sourceInvocationId ||
        request.consumerGeneration !== request.sourceGeneration) ||
    (request.disposition === 'consumed'
      ? request.resolveReceiptDigest === null ||
        !isAgentControlIdentity(request.consumerAttemptId) ||
        !isAgentControlIdentity(request.consumerInvocationId) ||
        !Number.isSafeInteger(request.consumerGeneration)
      : false) ||
    (request.disposition === 'expired' &&
      Date.parse(request.requestedAt) < Date.parse(request.expiresAt))
  ) {
    return false;
  }
  const { retireRequestDigest, ...base } = request;
  return (
    retireRequestDigest === digestAgentCanonicalValue(base) &&
    safeJson(request, emptySanitization)
  );
};

const retirementReceiptKeys = Object.freeze([
  'format',
  'version',
  'authorityDigest',
  'retireRequestDigest',
  'sealReceiptDigest',
  'opaqueProviderStateRef',
  'stateKeyCreationReceiptDigest',
  'resolveReceiptDigest',
  'disposition',
  'retirementTimeliness',
  'policyViolationDigest',
  'stateKeyDestructionReceiptDigest',
  'opaqueRecordDeletionReceiptDigest',
  'cryptographicExpiryReceiptDigest',
  'retiredAt',
  'receiptDigest',
] as const);

export const createAgentNativeProviderStateVaultRetirementReceipt = (
  request: AgentNativeProviderStateVaultRetireRequest,
  sealRequest: AgentNativeProviderStateVaultSealRequestProjection,
  sealReceipt: AgentNativeProviderStateVaultSealReceipt,
  result: AgentNativeProviderStateVaultRetirePortResult,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): AgentNativeProviderStateVaultRetirementReceipt => {
  if (
    !isAgentNativeProviderStateVaultRetireRequest(request) ||
    !isAgentNativeProviderStateVaultSealRequest(sealRequest) ||
    !isAgentNativeProviderStateVaultSealReceipt(sealReceipt, sealRequest) ||
    sealRequest.sealRequestDigest !== request.sealRequestDigest ||
    sealReceipt.status !== 'sealed' ||
    sealReceipt.authorityDigest !== request.authorityDigest ||
    sealReceipt.receiptDigest !== request.sealReceiptDigest ||
    sealReceipt.opaqueProviderStateRef !== request.opaqueProviderStateRef ||
    !hasExactAgentControlKeys(result, [
      'status',
      'stateKeyDestructionReceiptDigest',
      'opaqueRecordDeletionReceiptDigest',
      'retiredAt',
    ]) ||
    result.status !== 'retired' ||
    !isAgentCanonicalDigest(result.stateKeyDestructionReceiptDigest) ||
    !isAgentCanonicalDigest(result.opaqueRecordDeletionReceiptDigest) ||
    !isAgentControlInstant(result.retiredAt) ||
    Date.parse(result.retiredAt) < Date.parse(request.requestedAt) ||
    Date.parse(result.retiredAt) - Date.parse(request.requestedAt) >
      AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS ||
    (request.disposition !== 'overdue-expired' &&
      Date.parse(result.retiredAt) >
        Date.parse(request.expiresAt) +
          AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_ACK_DELAY_MS)
  ) {
    throw new TypeError(
      'Native Provider state vault retirement result is invalid.'
    );
  }
  const stateKeyCreationReceiptDigest =
    sealReceipt.stateKeyCreationReceiptDigest!;
  const cryptographicExpiryReceiptDigest = digestAgentCanonicalValue({
    format: 'prodivix.agent-native-provider-state-vault-cryptographic-expiry',
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    authorityDigest: request.authorityDigest,
    opaqueProviderStateRef: request.opaqueProviderStateRef,
    stateKeyCreationReceiptDigest,
    stateKeyDestructionReceiptDigest: result.stateKeyDestructionReceiptDigest,
    opaqueRecordDeletionReceiptDigest: result.opaqueRecordDeletionReceiptDigest,
    retiredAt: result.retiredAt,
  });
  const overdue = request.disposition === 'overdue-expired';
  const policyViolationDigest = overdue
    ? digestAgentCanonicalValue({
        format:
          'prodivix.agent-native-provider-state-vault-retirement-policy-violation',
        version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
        authorityDigest: request.authorityDigest,
        retireRequestDigest: request.retireRequestDigest,
        sealReceiptDigest: request.sealReceiptDigest,
        opaqueProviderStateRef: request.opaqueProviderStateRef,
        expiresAt: request.expiresAt,
        requestedAt: request.requestedAt,
        retiredAt: result.retiredAt,
        stateKeyDestructionReceiptDigest:
          result.stateKeyDestructionReceiptDigest,
        opaqueRecordDeletionReceiptDigest:
          result.opaqueRecordDeletionReceiptDigest,
      })
    : null;
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_STATE_VAULT_RETIREMENT_RECEIPT_FORMAT,
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    authorityDigest: request.authorityDigest,
    retireRequestDigest: request.retireRequestDigest,
    sealReceiptDigest: request.sealReceiptDigest,
    opaqueProviderStateRef: request.opaqueProviderStateRef,
    stateKeyCreationReceiptDigest,
    resolveReceiptDigest: request.resolveReceiptDigest,
    disposition: request.disposition,
    retirementTimeliness: overdue
      ? ('overdue-violation' as const)
      : ('within-policy' as const),
    policyViolationDigest,
    stateKeyDestructionReceiptDigest: result.stateKeyDestructionReceiptDigest,
    opaqueRecordDeletionReceiptDigest: result.opaqueRecordDeletionReceiptDigest,
    cryptographicExpiryReceiptDigest,
    retiredAt: result.retiredAt,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!safeJson(receipt, sanitization)) {
    throw new TypeError(
      'Native Provider state vault retirement receipt is unsafe.'
    );
  }
  return receipt;
};

/**
 * Release qualification must fail when crash recovery retired Provider state
 * after the cryptographic-expiry grace window. The durable receipt still proves
 * that the key and opaque vault row were deleted.
 */
export const isAgentNativeProviderStateVaultRetirementPolicyCompliant = (
  receipt: AgentNativeProviderStateVaultRetirementReceipt
): boolean =>
  receipt.retirementTimeliness === 'within-policy' &&
  receipt.policyViolationDigest === null;

export const isAgentNativeProviderStateVaultRetirementReceipt = (
  value: unknown,
  request: AgentNativeProviderStateVaultRetireRequest,
  sealRequest: AgentNativeProviderStateVaultSealRequestProjection,
  sealReceipt: AgentNativeProviderStateVaultSealReceipt,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): value is AgentNativeProviderStateVaultRetirementReceipt => {
  if (!hasExactAgentControlKeys(value, retirementReceiptKeys)) return false;
  try {
    return sameCanonicalJson(
      value,
      createAgentNativeProviderStateVaultRetirementReceipt(
        request,
        sealRequest,
        sealReceipt,
        {
          status: 'retired',
          stateKeyDestructionReceiptDigest:
            value.stateKeyDestructionReceiptDigest as CanonicalDigest,
          opaqueRecordDeletionReceiptDigest:
            value.opaqueRecordDeletionReceiptDigest as CanonicalDigest,
          retiredAt: value.retiredAt as Instant,
        },
        sanitization
      )
    );
  } catch {
    return false;
  }
};

/** ACK-loss reconciliation always returns the original durable receipt bytes. */
export const reconcileAgentNativeProviderStateVaultRetirementReceipt = (
  request: AgentNativeProviderStateVaultRetireRequest,
  sealRequest: AgentNativeProviderStateVaultSealRequestProjection,
  sealReceipt: AgentNativeProviderStateVaultSealReceipt,
  persistedReceipt: AgentNativeProviderStateVaultRetirementReceipt | null,
  returnedReceipt: AgentNativeProviderStateVaultRetirementReceipt
): AgentNativeProviderStateVaultRetirementReceipt => {
  if (
    !isAgentNativeProviderStateVaultRetirementReceipt(
      returnedReceipt,
      request,
      sealRequest,
      sealReceipt
    )
  ) {
    throw new TypeError('Returned state vault retirement receipt is invalid.');
  }
  if (persistedReceipt === null) return returnedReceipt;
  if (
    !isAgentNativeProviderStateVaultRetirementReceipt(
      persistedReceipt,
      request,
      sealRequest,
      sealReceipt
    ) ||
    !sameCanonicalJson(persistedReceipt, returnedReceipt)
  ) {
    throw new TypeError(
      'State vault ACK-loss reconciliation detected receipt drift.'
    );
  }
  return persistedReceipt;
};

export type AgentNativeProviderStateVaultResolvedState = Readonly<{
  receipt: AgentNativeProviderStateVaultResolveReceipt;
  /** Transient callback-local handle; callers must discard it after one effect callback. */
  callbackLocalProviderStateHandle: string | null;
}>;

export const resolveAgentNativeProviderStateVaultState = async (
  port: AgentNativeProviderStateVaultPort,
  request: AgentNativeProviderStateVaultResolveRequest,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): Promise<AgentNativeProviderStateVaultResolvedState> => {
  if (
    !isAgentNativeProviderStateVaultAuthority(port.authority) ||
    port.authority.authorityDigest !== request.authorityDigest ||
    !isResolveRequestSelf(request)
  ) {
    throw new TypeError('Native Provider state vault resolve port is invalid.');
  }
  const result = await port.resolve(Object.freeze({ request }));
  const receipt = createAgentNativeProviderStateVaultResolveReceipt(
    request,
    result,
    sanitization
  );
  return Object.freeze({
    receipt,
    callbackLocalProviderStateHandle:
      result.status === 'resolved'
        ? result.callbackLocalProviderStateHandle
        : null,
  });
};

export const retireAgentNativeProviderStateVaultState = async (
  port: AgentNativeProviderStateVaultPort,
  request: AgentNativeProviderStateVaultRetireRequest,
  sealRequest: AgentNativeProviderStateVaultSealRequestProjection,
  sealReceipt: AgentNativeProviderStateVaultSealReceipt,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): Promise<AgentNativeProviderStateVaultRetirementReceipt> => {
  if (
    !isAgentNativeProviderStateVaultAuthority(port.authority) ||
    port.authority.authorityDigest !== request.authorityDigest ||
    !isAgentNativeProviderStateVaultRetireRequest(request)
  ) {
    throw new TypeError(
      'Native Provider state vault retirement port is invalid.'
    );
  }
  let returnedReceipt: AgentNativeProviderStateVaultRetirementReceipt | null =
    null;
  try {
    const result = await port.retire(Object.freeze({ request }));
    if (result.status === 'retired') {
      returnedReceipt = createAgentNativeProviderStateVaultRetirementReceipt(
        request,
        sealRequest,
        sealReceipt,
        result,
        sanitization
      );
    }
  } catch {
    // The durable lookup below is the sole ACK-loss recovery authority.
  }
  const persistedReceipt = await port.lookupRetirementReceipt(
    request.retireRequestDigest
  );
  if (returnedReceipt === null) {
    if (
      persistedReceipt !== null &&
      isAgentNativeProviderStateVaultRetirementReceipt(
        persistedReceipt,
        request,
        sealRequest,
        sealReceipt,
        sanitization
      )
    ) {
      return persistedReceipt;
    }
    throw new TypeError(
      'Native Provider state vault retirement did not produce durable deletion evidence.'
    );
  }
  return reconcileAgentNativeProviderStateVaultRetirementReceipt(
    request,
    sealRequest,
    sealReceipt,
    persistedReceipt,
    returnedReceipt
  );
};

/** Canonical callback-local Provider state handle commitment. */
export const digestAgentNativeProviderStateReference = (
  kind: AgentNativeProviderStateReferenceKind,
  value: string
): CanonicalDigest => {
  if (
    !['interaction-id', 'response-id'].includes(kind) ||
    !isAgentControlIdentity(value)
  ) {
    throw new TypeError('Native Provider state reference is invalid.');
  }
  return digestAgentCanonicalValue({ kind, value });
};
