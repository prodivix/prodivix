import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { CanonicalDigest } from '../domain/agent.types';
import type {
  AgentParallelToolJoinReceipt,
  AgentRetrievalQueryReceipt,
} from '../hosted/agentHosted.types';
import type {
  AgentOpaqueContinuationRef,
  AgentProviderCacheReceipt,
  AgentProviderJobReceipt,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import {
  createAgentOpaqueContinuation,
  createAgentProviderCacheReceipt,
} from '../providers/agentInvocationFacts';
import { createAgentUsageVector } from '../usage/agentUsage';
import type {
  AgentEvaluationControlledContinuationReceipt,
  AgentEvaluationControlledToolExecutionReceipt,
} from './agentEvaluationControlledRuntime';

export const AGENT_EVALUATION_CAPABILITY_SPECIFIC_MAXIMUM_RECEIPT_BYTES =
  65_536 as const;

/**
 * Evaluation projection of a successful parallel join. The hosted runtime
 * receipt remains transport-neutral; release evidence additionally commits
 * every controlled tool-execution leaf that produced the joined result.
 */
export type AgentEvaluationParallelToolJoinCapabilityFact =
  AgentParallelToolJoinReceipt &
    Readonly<{
      controlledToolExecutionReceiptDigests: readonly CanonicalDigest[];
    }>;

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

export const safeAgentEvaluationCapabilitySpecificExactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  maximumBytes: number = AGENT_EVALUATION_CAPABILITY_SPECIFIC_MAXIMUM_RECEIPT_BYTES
): value is Readonly<Record<string, unknown>> =>
  exactKeys(value, required, optional) &&
  inspectAgentControlJson(value, maximumBytes).length === 0;

export const digestAgentEvaluationCapabilityFactWithout = (
  value: Readonly<Record<string, unknown>>,
  digestKey: string
): CanonicalDigest =>
  digestAgentCanonicalValue(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== digestKey)
    )
  );

const canonicalIdentityArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.length <= 128 &&
  value.every(isAgentControlIdentity) &&
  new Set(value).size === value.length &&
  value.every(
    (entry, index) =>
      index === 0 || compareUnicodeCodePoints(value[index - 1]!, entry) < 0
  );

const canonicalDigestArray = (
  value: unknown
): value is readonly CanonicalDigest[] =>
  Array.isArray(value) &&
  value.length <= 128 &&
  value.every(isAgentCanonicalDigest) &&
  new Set(value).size === value.length &&
  value.every(
    (entry, index) =>
      index === 0 || compareUnicodeCodePoints(value[index - 1]!, entry) < 0
  );

export const isAgentEvaluationProviderJobCapabilityFact = (
  value: unknown
): value is AgentProviderJobReceipt => {
  if (
    !safeAgentEvaluationCapabilitySpecificExactKeys(
      value,
      [
        'providerJobId',
        'taskId',
        'runId',
        'generation',
        'invocationId',
        'phase',
        'callbackAuthority',
        'receiptDigest',
      ],
      ['outcome'],
      8_192
    )
  ) {
    return false;
  }
  const receipt = value as unknown as AgentProviderJobReceipt;
  const terminal = receipt.phase === 'terminal';
  return (
    isAgentControlIdentity(receipt.providerJobId) &&
    isAgentControlIdentity(receipt.taskId) &&
    isAgentControlIdentity(receipt.runId) &&
    Number.isSafeInteger(receipt.generation) &&
    receipt.generation >= 0 &&
    isAgentControlIdentity(receipt.invocationId) &&
    ['submitting', 'accepted', 'running', 'cancelling', 'terminal'].includes(
      receipt.phase
    ) &&
    ['active', 'revoked'].includes(receipt.callbackAuthority) &&
    terminal === (receipt.outcome !== undefined) &&
    (receipt.outcome === undefined ||
      [
        'completed',
        'failed',
        'cancelled',
        'expired',
        'reconciliation-required',
      ].includes(receipt.outcome)) &&
    (!terminal || receipt.callbackAuthority === 'revoked') &&
    receipt.receiptDigest ===
      digestAgentEvaluationCapabilityFactWithout(
        receipt as unknown as Readonly<Record<string, unknown>>,
        'receiptDigest'
      )
  );
};

const cacheScopeOrder = Object.freeze({ invocation: 0, task: 1, workspace: 2 });

export const isAgentEvaluationProviderCacheCapabilityFact = (
  value: unknown
): value is AgentProviderCacheReceipt => {
  if (
    !safeAgentEvaluationCapabilitySpecificExactKeys(
      value,
      [
        'cacheMode',
        'cacheScope',
        'provenIsolation',
        'prefixOrItemDigests',
        'usageRef',
        'receiptDigest',
      ],
      ['cacheKeyDigest', 'providerRegion', 'createdAt', 'expiresAt'],
      16_384
    )
  ) {
    return false;
  }
  const receipt = value as unknown as AgentProviderCacheReceipt;
  const {
    receiptDigest: _receiptDigest,
    provenIsolation,
    ...receiptInput
  } = receipt;
  try {
    return (
      receipt.cacheMode !== 'disabled' &&
      ['prompt', 'file', 'conversation'].includes(receipt.cacheMode) &&
      Object.hasOwn(cacheScopeOrder, receipt.cacheScope) &&
      Object.hasOwn(cacheScopeOrder, receipt.provenIsolation) &&
      cacheScopeOrder[receipt.cacheScope] <=
        cacheScopeOrder[receipt.provenIsolation] &&
      canonicalDigestArray(receipt.prefixOrItemDigests) &&
      isAgentControlIdentity(receipt.usageRef) &&
      sameCanonicalJson(
        receipt,
        createAgentProviderCacheReceipt({
          receipt: receiptInput,
          isolation: provenIsolation,
        })
      )
    );
  } catch {
    return false;
  }
};

export const isAgentEvaluationProviderOpaqueContinuationCapabilityFact = (
  value: unknown
): value is AgentOpaqueContinuationRef => {
  if (
    !safeAgentEvaluationCapabilitySpecificExactKeys(
      value,
      [
        'continuationId',
        'encryptedBlobRef',
        'providerConfigurationId',
        'modelLineageDigest',
        'taskId',
        'runId',
        'generation',
        'parentInvocationId',
        'purpose',
        'createdAt',
        'expiresAt',
        'continuationDigest',
      ],
      [],
      16_384
    )
  ) {
    return false;
  }
  try {
    const continuation = value as unknown as AgentOpaqueContinuationRef;
    const { continuationDigest: _continuationDigest, ...base } = continuation;
    return sameCanonicalJson(continuation, createAgentOpaqueContinuation(base));
  } catch {
    return false;
  }
};

export const isAgentEvaluationRetrievalQueryCapabilityFact = (
  value: unknown
): value is AgentRetrievalQueryReceipt => {
  if (
    !safeAgentEvaluationCapabilitySpecificExactKeys(
      value,
      [
        'queryId',
        'toolDescriptorDigest',
        'queryDigest',
        'purpose',
        'networkPolicyDigest',
        'sourceResultRefs',
        'sourceResultDigests',
        'usageRef',
        'startedAt',
        'completedAt',
        'receiptDigest',
      ],
      ['indexDigest', 'retrievalConfigurationDigest'],
      32_768
    )
  ) {
    return false;
  }
  const receipt = value as unknown as AgentRetrievalQueryReceipt;
  return (
    isAgentControlIdentity(receipt.queryId) &&
    isAgentCanonicalDigest(receipt.toolDescriptorDigest) &&
    isAgentCanonicalDigest(receipt.queryDigest) &&
    (receipt.purpose === 'public-research' ||
      receipt.purpose === 'authorized-project-retrieval') &&
    isAgentCanonicalDigest(receipt.networkPolicyDigest) &&
    canonicalIdentityArray(receipt.sourceResultRefs) &&
    Array.isArray(receipt.sourceResultDigests) &&
    receipt.sourceResultDigests.length === receipt.sourceResultRefs.length &&
    receipt.sourceResultDigests.every(isAgentCanonicalDigest) &&
    (receipt.indexDigest === undefined ||
      isAgentCanonicalDigest(receipt.indexDigest)) &&
    (receipt.retrievalConfigurationDigest === undefined ||
      isAgentCanonicalDigest(receipt.retrievalConfigurationDigest)) &&
    isAgentControlIdentity(receipt.usageRef) &&
    isAgentControlInstant(receipt.startedAt) &&
    isAgentControlInstant(receipt.completedAt) &&
    Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt) &&
    receipt.receiptDigest ===
      digestAgentEvaluationCapabilityFactWithout(
        receipt as unknown as Readonly<Record<string, unknown>>,
        'receiptDigest'
      )
  );
};

export const isAgentEvaluationParallelToolJoinCapabilityFact = (
  value: unknown
): value is AgentEvaluationParallelToolJoinCapabilityFact => {
  if (
    !safeAgentEvaluationCapabilitySpecificExactKeys(
      value,
      [
        'groupId',
        'planDigest',
        'generation',
        'joinedCallIds',
        'controlledToolExecutionReceiptDigests',
        'cancelledCallIds',
        'lateCallIds',
        'status',
        'resultDigest',
        'receiptDigest',
      ],
      [],
      16_384
    )
  ) {
    return false;
  }
  const receipt =
    value as unknown as AgentEvaluationParallelToolJoinCapabilityFact;
  const joined = new Set(receipt.joinedCallIds);
  const cancelled = new Set(receipt.cancelledCallIds);
  const late = new Set(receipt.lateCallIds);
  return (
    isAgentControlIdentity(receipt.groupId) &&
    isAgentCanonicalDigest(receipt.planDigest) &&
    Number.isSafeInteger(receipt.generation) &&
    receipt.generation >= 0 &&
    canonicalIdentityArray(receipt.joinedCallIds) &&
    receipt.joinedCallIds.length >= 2 &&
    canonicalDigestArray(receipt.controlledToolExecutionReceiptDigests) &&
    receipt.controlledToolExecutionReceiptDigests.length ===
      receipt.joinedCallIds.length &&
    canonicalIdentityArray(receipt.cancelledCallIds) &&
    receipt.cancelledCallIds.length === 0 &&
    canonicalIdentityArray(receipt.lateCallIds) &&
    receipt.lateCallIds.length === 0 &&
    [...joined].every((id) => !cancelled.has(id) && !late.has(id)) &&
    [...cancelled].every((id) => !late.has(id)) &&
    receipt.status === 'joined' &&
    isAgentCanonicalDigest(receipt.resultDigest) &&
    receipt.receiptDigest ===
      digestAgentEvaluationCapabilityFactWithout(
        receipt as unknown as Readonly<Record<string, unknown>>,
        'receiptDigest'
      )
  );
};

const validPersistedArtifact = (value: unknown): boolean =>
  safeAgentEvaluationCapabilitySpecificExactKeys(
    value,
    [
      'artifactKind',
      'artifactRef',
      'artifactDigest',
      'byteLength',
      'persistenceReceiptDigest',
    ],
    [],
    4_096
  ) &&
  [
    'proposal',
    'verification-plan',
    'tool-receipt',
    'transaction-receipt',
    'verification-closure',
    'diagnostic-report',
  ].includes(String(value.artifactKind)) &&
  isAgentControlIdentity(value.artifactRef) &&
  isAgentCanonicalDigest(value.artifactDigest) &&
  Number.isSafeInteger(value.byteLength) &&
  Number(value.byteLength) >= 0 &&
  Number(value.byteLength) <= 16_777_216 &&
  isAgentCanonicalDigest(value.persistenceReceiptDigest);

export const isAgentEvaluationControlledToolExecutionCapabilityFact = (
  value: unknown
): value is AgentEvaluationControlledToolExecutionReceipt => {
  if (
    !safeAgentEvaluationCapabilitySpecificExactKeys(
      value,
      [
        'format',
        'version',
        'planDigest',
        'attemptId',
        'descriptorDigest',
        'caseId',
        'materialDigest',
        'loopPolicyDigest',
        'grantDigest',
        'toolRegistryDigest',
        'toolDefinitionDigest',
        'inputSchemaDigest',
        'generation',
        'idempotencyKey',
        'operationIntentDigest',
        'turnIndex',
        'toolCallId',
        'toolId',
        'argumentsDigest',
        'status',
        'resultDigest',
        'persistedArtifacts',
        'commandReceiptDigests',
        'transactionReceiptDigests',
        'receiptDigest',
      ],
      [],
      32_768
    )
  ) {
    return false;
  }
  const receipt =
    value as unknown as AgentEvaluationControlledToolExecutionReceipt;
  const artifactIdentities = receipt.persistedArtifacts.map(
    ({ artifactKind, artifactRef }) => `${artifactKind}\u0000${artifactRef}`
  );
  return (
    receipt.format ===
      'prodivix.agent-evaluation-controlled-tool-execution-receipt' &&
    receipt.version === 1 &&
    isAgentCanonicalDigest(receipt.planDigest) &&
    isAgentControlIdentity(receipt.attemptId) &&
    isAgentCanonicalDigest(receipt.descriptorDigest) &&
    isAgentControlIdentity(receipt.caseId) &&
    isAgentCanonicalDigest(receipt.materialDigest) &&
    isAgentCanonicalDigest(receipt.loopPolicyDigest) &&
    isAgentCanonicalDigest(receipt.grantDigest) &&
    isAgentCanonicalDigest(receipt.toolRegistryDigest) &&
    isAgentCanonicalDigest(receipt.toolDefinitionDigest) &&
    isAgentCanonicalDigest(receipt.inputSchemaDigest) &&
    Number.isSafeInteger(receipt.generation) &&
    receipt.generation >= 1 &&
    isAgentControlIdentity(receipt.idempotencyKey) &&
    isAgentCanonicalDigest(receipt.operationIntentDigest) &&
    Number.isSafeInteger(receipt.turnIndex) &&
    receipt.turnIndex >= 0 &&
    receipt.turnIndex <= 64 &&
    isAgentControlIdentity(receipt.toolCallId) &&
    isAgentControlIdentity(receipt.toolId) &&
    isAgentCanonicalDigest(receipt.argumentsDigest) &&
    (receipt.status === 'succeeded' || receipt.status === 'rejected') &&
    isAgentCanonicalDigest(receipt.resultDigest) &&
    Array.isArray(receipt.persistedArtifacts) &&
    receipt.persistedArtifacts.length <= 128 &&
    receipt.persistedArtifacts.every(validPersistedArtifact) &&
    new Set(artifactIdentities).size === artifactIdentities.length &&
    (receipt.status === 'succeeded' ||
      receipt.persistedArtifacts.length === 0) &&
    canonicalDigestArray(receipt.commandReceiptDigests) &&
    canonicalDigestArray(receipt.transactionReceiptDigests) &&
    receipt.receiptDigest ===
      digestAgentEvaluationCapabilityFactWithout(
        receipt as unknown as Readonly<Record<string, unknown>>,
        'receiptDigest'
      )
  );
};

export const isAgentEvaluationControlledContinuationCapabilityFact = (
  value: unknown
): value is AgentEvaluationControlledContinuationReceipt => {
  if (
    !safeAgentEvaluationCapabilitySpecificExactKeys(
      value,
      [
        'format',
        'version',
        'planDigest',
        'attemptId',
        'descriptorDigest',
        'caseId',
        'materialDigest',
        'loopPolicyDigest',
        'completedTurnIndex',
        'nextTurnIndex',
        'toolExecutionReceiptDigests',
        'toolResultSetDigest',
        'receiptDigest',
      ],
      [],
      16_384
    )
  ) {
    return false;
  }
  const receipt =
    value as unknown as AgentEvaluationControlledContinuationReceipt;
  return (
    receipt.format ===
      'prodivix.agent-evaluation-controlled-continuation-receipt' &&
    receipt.version === 1 &&
    isAgentCanonicalDigest(receipt.planDigest) &&
    isAgentControlIdentity(receipt.attemptId) &&
    isAgentCanonicalDigest(receipt.descriptorDigest) &&
    isAgentControlIdentity(receipt.caseId) &&
    isAgentCanonicalDigest(receipt.materialDigest) &&
    isAgentCanonicalDigest(receipt.loopPolicyDigest) &&
    Number.isSafeInteger(receipt.completedTurnIndex) &&
    receipt.completedTurnIndex >= 0 &&
    receipt.completedTurnIndex < 64 &&
    receipt.nextTurnIndex === receipt.completedTurnIndex + 1 &&
    canonicalDigestArray(receipt.toolExecutionReceiptDigests) &&
    receipt.toolExecutionReceiptDigests.length > 0 &&
    isAgentCanonicalDigest(receipt.toolResultSetDigest) &&
    receipt.receiptDigest ===
      digestAgentEvaluationCapabilityFactWithout(
        receipt as unknown as Readonly<Record<string, unknown>>,
        'receiptDigest'
      )
  );
};

export const isAgentEvaluationUsageVectorCapabilityFact = (
  value: unknown
): value is AgentUsageVector => {
  if (
    !safeAgentEvaluationCapabilitySpecificExactKeys(
      value,
      ['amounts', 'vectorDigest'],
      [],
      16_384
    )
  ) {
    return false;
  }
  try {
    return sameCanonicalJson(
      value,
      createAgentUsageVector(value.amounts as AgentUsageVector['amounts'])
    );
  } catch {
    return false;
  }
};
