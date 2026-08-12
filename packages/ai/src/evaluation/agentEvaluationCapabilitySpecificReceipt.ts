import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentJsonValue,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import type { AgentRetrievalQueryReceipt } from '../hosted/agentHosted.types';
import type {
  AgentOpaqueContinuationRef,
  AgentProviderCacheReceipt,
  AgentProviderJobReceipt,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import type {
  AgentEvaluationControlledContinuationReceipt,
  AgentEvaluationControlledRuntimeReceipt,
  AgentEvaluationControlledToolExecutionReceipt,
} from './agentEvaluationControlledRuntime';
import {
  AGENT_EVALUATION_CAPABILITY_SPECIFIC_MAXIMUM_RECEIPT_BYTES,
  type AgentEvaluationParallelToolJoinCapabilityFact,
  digestAgentEvaluationCapabilityFactWithout as digestWithout,
  isAgentEvaluationControlledContinuationCapabilityFact,
  isAgentEvaluationControlledToolExecutionCapabilityFact,
  isAgentEvaluationParallelToolJoinCapabilityFact,
  isAgentEvaluationProviderCacheCapabilityFact,
  isAgentEvaluationProviderJobCapabilityFact,
  isAgentEvaluationProviderOpaqueContinuationCapabilityFact,
  isAgentEvaluationRetrievalQueryCapabilityFact,
  isAgentEvaluationUsageVectorCapabilityFact,
  safeAgentEvaluationCapabilitySpecificExactKeys as safeExactKeys,
} from './agentEvaluationCapabilitySpecificAuthorityValidation';

export { AGENT_EVALUATION_CAPABILITY_SPECIFIC_MAXIMUM_RECEIPT_BYTES } from './agentEvaluationCapabilitySpecificAuthorityValidation';

export const AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-specific-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_VERSION = 1 as const;
export const AGENT_EVALUATION_CAPABILITY_OWNER_FACT_FORMAT =
  'prodivix.agent-evaluation-capability-owner-fact' as const;
export const AGENT_EVALUATION_CONTROLLED_RUNTIME_CAPABILITY_FACT_FORMAT =
  'prodivix.agent-evaluation-controlled-runtime-capability-fact' as const;
export const AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT =
  2 as const;

export const maximumAgentEvaluationCapabilitySpecificReceiptFamilyBytes = (
  attemptCount: number
): number => {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 0) {
    throw new TypeError('Capability-specific denominator is invalid.');
  }
  const bytes =
    attemptCount *
    AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT *
    AGENT_EVALUATION_CAPABILITY_SPECIFIC_MAXIMUM_RECEIPT_BYTES;
  if (!Number.isSafeInteger(bytes)) {
    throw new TypeError('Capability-specific family capacity overflowed.');
  }
  return bytes;
};

export const hasAgentEvaluationCanonicalCapabilitySpecificReceiptCapacity = (
  expectedReceiptKinds: readonly unknown[]
): boolean =>
  expectedReceiptKinds.length <=
  AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT;

export const AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_KINDS = Object.freeze(
  [
    'ack-reconciliation-receipt',
    'attempt-idempotency-receipt',
    'authority-denial-receipt',
    'background-job-receipt',
    'budget-reservation-receipt',
    'cache-lineage-receipt',
    'cancellation-receipt',
    'capability-unavailable-receipt',
    'checkpoint-resume-receipt',
    'conservative-usage-receipt',
    'continuation-receipt',
    'late-callback-rejection-receipt',
    'late-output-fence-receipt',
    'lease-fence-receipt',
    'parallel-call-set-receipt',
    'reconciliation-receipt',
    'refusal-receipt',
    'repair-round-receipt',
    'retrieval-citation-receipt',
    'reverse-transaction-receipt',
    'source-freshness-receipt',
    'state-fence-receipt',
    'timeout-receipt',
    'tool-execution-receipt',
    'truncation-receipt',
    'usage-receipt',
    'usage-reconciliation-receipt',
    'verification-closure-receipt',
  ] as const
);

export type AgentEvaluationCapabilitySpecificReceiptKind =
  (typeof AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_KINDS)[number];

type CapabilityOwnerFactBase = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_OWNER_FACT_FORMAT;
  version: 1;
  authorityId: string;
  authorityImplementationDigest: CanonicalDigest;
  /** Exact Backend attempt-authority request that produced this fact. */
  authorityRequestDigest: CanonicalDigest;
  /** Exact capability-specific result digest; never the enclosing owner response digest. */
  authorityResultDigest: CanonicalDigest;
  observedAt: Instant;
  factDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityOwnerFact =
  | (CapabilityOwnerFactBase &
      Readonly<{
        authorityKind: 'terminal-normalization';
        category: 'refusal-receipt' | 'truncation-receipt';
        terminalEventDigest: CanonicalDigest;
        normalizedOutcome: 'refused' | 'truncated';
        normalizationPolicyDigest: CanonicalDigest;
      }>)
  | (CapabilityOwnerFactBase &
      Readonly<{
        authorityKind: 'recovery-authority';
        category: 'budget-reservation-receipt';
        reservationId: string;
        demandDigest: CanonicalDigest;
        settlementDigest: CanonicalDigest;
        reservationStatus: 'settled' | 'reconciled';
      }>)
  | (CapabilityOwnerFactBase &
      Readonly<{
        authorityKind: 'recovery-authority';
        category:
          | 'ack-reconciliation-receipt'
          | 'attempt-idempotency-receipt'
          | 'reconciliation-receipt';
        idempotencyKey: string;
        replayDisposition: 'first-applied' | 'exact-replay' | 'reconciled';
      }>)
  | (CapabilityOwnerFactBase &
      Readonly<{
        authorityKind: 'recovery-authority';
        category: 'checkpoint-resume-receipt';
        checkpointDigest: CanonicalDigest;
        fromGeneration: number;
        toGeneration: number;
        resumeResultDigest: CanonicalDigest;
      }>)
  | (CapabilityOwnerFactBase &
      Readonly<{
        authorityKind: 'recovery-authority';
        category:
          | 'cancellation-receipt'
          | 'late-callback-rejection-receipt'
          | 'late-output-fence-receipt'
          | 'lease-fence-receipt'
          | 'state-fence-receipt'
          | 'timeout-receipt';
        shardLeaseOwnerId: string;
        shardLeaseGeneration: number;
        dispatchState: 'not-created' | 'not-dispatched' | 'dispatched';
        authorityInstant: Instant;
        fenceDigest: CanonicalDigest;
        fenceOutcome: 'cancelled' | 'timed-out' | 'rejected' | 'fenced';
      }>)
  | (CapabilityOwnerFactBase &
      Readonly<{
        authorityKind: 'capability-denial';
        category: 'authority-denial-receipt' | 'capability-unavailable-receipt';
        policyDigest: CanonicalDigest;
        reasonCode: string;
        decisionDigest: CanonicalDigest;
      }>);

/** Bounded, acyclic projection of the final controlled runtime authority. */
export type AgentEvaluationControlledRuntimeCapabilityFact = Readonly<{
  format: typeof AGENT_EVALUATION_CONTROLLED_RUNTIME_CAPABILITY_FACT_FORMAT;
  version: 1;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  runtimeAuthorityId: string;
  runtimeImplementationDigest: CanonicalDigest;
  verificationClosureDigest: CanonicalDigest;
  verificationVerdict: 'passed' | 'failed';
  toolExecutionReceiptSetDigest?: CanonicalDigest;
  continuationReceiptSetDigest?: CanonicalDigest;
  ownerAuthoritySetDigest: CanonicalDigest;
  factDigest: CanonicalDigest;
}>;

type AuthorityFact<Kind extends string, Fact> = Readonly<{
  authorityKind: Kind;
  receiptKind: AgentEvaluationCapabilitySpecificReceiptKind;
  factDigest: CanonicalDigest;
  semanticDigest: CanonicalDigest;
  fact: Fact;
}>;

export type AgentEvaluationCapabilitySpecificAuthority =
  | AuthorityFact<'provider-job', AgentProviderJobReceipt>
  | AuthorityFact<'provider-cache', AgentProviderCacheReceipt>
  | AuthorityFact<'opaque-continuation', AgentOpaqueContinuationRef>
  | AuthorityFact<'retrieval-query', AgentRetrievalQueryReceipt>
  | AuthorityFact<
      'parallel-tool-join',
      AgentEvaluationParallelToolJoinCapabilityFact
    >
  | AuthorityFact<
      'controlled-tool-execution',
      AgentEvaluationControlledToolExecutionReceipt
    >
  | AuthorityFact<
      'controlled-continuation',
      AgentEvaluationControlledContinuationReceipt
    >
  | AuthorityFact<
      'controlled-runtime',
      AgentEvaluationControlledRuntimeCapabilityFact
    >
  | AuthorityFact<'usage-vector', AgentUsageVector>
  | AuthorityFact<
      'terminal-normalization' | 'recovery-authority' | 'capability-denial',
      AgentEvaluationCapabilityOwnerFact
    >;

export type AgentEvaluationCapabilitySpecificReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_VERSION;
  receiptId: string;
  receiptKind: AgentEvaluationCapabilitySpecificReceiptKind;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  toolId?: string;
  toolCallId?: string;
  providerToolCallId?: string;
  providerCapabilityObservationReceiptDigest?: CanonicalDigest;
  requestDigest: CanonicalDigest;
  resultDigest: CanonicalDigest;
  startedAt: Instant;
  completedAt: Instant;
  authority: AgentEvaluationCapabilitySpecificAuthority;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilitySpecificReceiptInput = Omit<
  AgentEvaluationCapabilitySpecificReceipt,
  'format' | 'version' | 'receiptDigest'
>;

export type CreateAgentEvaluationCapabilityOwnerFactInput =
  AgentEvaluationCapabilityOwnerFact extends infer Fact
    ? Fact extends AgentEvaluationCapabilityOwnerFact
      ? Omit<Fact, 'format' | 'version' | 'factDigest'>
      : never
    : never;

const maximumTurnIndex = 64;
const repositoryCommitPattern = /^[a-f0-9]{40}$/u;

const receiptKeys = Object.freeze([
  'format',
  'version',
  'receiptId',
  'receiptKind',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'caseId',
  'materialDigest',
  'capabilityDescriptorDigest',
  'turnIndex',
  'invocationId',
  'requestDigest',
  'resultDigest',
  'startedAt',
  'completedAt',
  'authority',
  'receiptDigest',
] as const);
const optionalReceiptKeys = Object.freeze([
  'toolId',
  'toolCallId',
  'providerToolCallId',
  'providerCapabilityObservationReceiptDigest',
] as const);
const ownerFactBaseKeys = Object.freeze([
  'format',
  'version',
  'authorityKind',
  'category',
  'authorityId',
  'authorityImplementationDigest',
  'authorityRequestDigest',
  'authorityResultDigest',
  'observedAt',
  'factDigest',
] as const);
const terminalNormalizationFactKeys = Object.freeze([
  ...ownerFactBaseKeys,
  'terminalEventDigest',
  'normalizedOutcome',
  'normalizationPolicyDigest',
] as const);
const budgetReservationFactKeys = Object.freeze([
  ...ownerFactBaseKeys,
  'reservationId',
  'demandDigest',
  'settlementDigest',
  'reservationStatus',
] as const);
const idempotencyFactKeys = Object.freeze([
  ...ownerFactBaseKeys,
  'idempotencyKey',
  'replayDisposition',
] as const);
const checkpointResumeFactKeys = Object.freeze([
  ...ownerFactBaseKeys,
  'checkpointDigest',
  'fromGeneration',
  'toGeneration',
  'resumeResultDigest',
] as const);
const temporalFenceFactKeys = Object.freeze([
  ...ownerFactBaseKeys,
  'shardLeaseOwnerId',
  'shardLeaseGeneration',
  'dispatchState',
  'authorityInstant',
  'fenceDigest',
  'fenceOutcome',
] as const);
const capabilityDenialFactKeys = Object.freeze([
  ...ownerFactBaseKeys,
  'policyDigest',
  'reasonCode',
  'decisionDigest',
] as const);
const controlledRuntimeFactKeys = Object.freeze([
  'format',
  'version',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'caseId',
  'materialDigest',
  'runtimeAuthorityId',
  'runtimeImplementationDigest',
  'verificationClosureDigest',
  'verificationVerdict',
  'ownerAuthoritySetDigest',
  'factDigest',
] as const);
const optionalControlledRuntimeFactKeys = Object.freeze([
  'toolExecutionReceiptSetDigest',
  'continuationReceiptSetDigest',
] as const);

const authorityKindForReceipt = (
  receiptKind: AgentEvaluationCapabilitySpecificReceiptKind
): AgentEvaluationCapabilitySpecificAuthority['authorityKind'] => {
  if (receiptKind === 'background-job-receipt') return 'provider-job';
  if (receiptKind === 'cache-lineage-receipt') return 'provider-cache';
  if (
    receiptKind === 'retrieval-citation-receipt' ||
    receiptKind === 'source-freshness-receipt'
  ) {
    return 'retrieval-query';
  }
  if (receiptKind === 'parallel-call-set-receipt') {
    return 'parallel-tool-join';
  }
  if (
    receiptKind === 'tool-execution-receipt' ||
    receiptKind === 'repair-round-receipt' ||
    receiptKind === 'reverse-transaction-receipt'
  ) {
    return 'controlled-tool-execution';
  }
  if (receiptKind === 'continuation-receipt') {
    return 'opaque-continuation';
  }
  if (receiptKind === 'verification-closure-receipt') {
    return 'controlled-runtime';
  }
  if (
    receiptKind === 'usage-receipt' ||
    receiptKind === 'conservative-usage-receipt' ||
    receiptKind === 'usage-reconciliation-receipt'
  ) {
    return 'usage-vector';
  }
  if (
    receiptKind === 'refusal-receipt' ||
    receiptKind === 'truncation-receipt'
  ) {
    return 'terminal-normalization';
  }
  if (
    receiptKind === 'capability-unavailable-receipt' ||
    receiptKind === 'authority-denial-receipt'
  ) {
    return 'capability-denial';
  }
  return 'recovery-authority';
};

const receiptKind = (
  value: unknown
): value is AgentEvaluationCapabilitySpecificReceiptKind =>
  typeof value === 'string' &&
  AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_KINDS.includes(
    value as AgentEvaluationCapabilitySpecificReceiptKind
  );

export const createAgentEvaluationCapabilityOwnerFact = (
  input: CreateAgentEvaluationCapabilityOwnerFactInput
): AgentEvaluationCapabilityOwnerFact => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_OWNER_FACT_FORMAT,
    version: 1 as const,
    ...input,
  });
  const fact = Object.freeze({
    ...base,
    factDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationCapabilityOwnerFact(fact)) {
    throw new TypeError('Evaluation capability owner fact is invalid.');
  }
  return fact;
};

export const isAgentEvaluationCapabilityOwnerFact = (
  value: unknown
): value is AgentEvaluationCapabilityOwnerFact => {
  try {
    if (
      !isPlainObject(value) ||
      typeof value.category !== 'string' ||
      !receiptKind(value.category)
    ) {
      return false;
    }
    const requiredKeys =
      value.category === 'refusal-receipt' ||
      value.category === 'truncation-receipt'
        ? terminalNormalizationFactKeys
        : value.category === 'budget-reservation-receipt'
          ? budgetReservationFactKeys
          : value.category === 'ack-reconciliation-receipt' ||
              value.category === 'attempt-idempotency-receipt' ||
              value.category === 'reconciliation-receipt'
            ? idempotencyFactKeys
            : value.category === 'checkpoint-resume-receipt'
              ? checkpointResumeFactKeys
              : value.category === 'cancellation-receipt' ||
                  value.category === 'late-callback-rejection-receipt' ||
                  value.category === 'late-output-fence-receipt' ||
                  value.category === 'lease-fence-receipt' ||
                  value.category === 'state-fence-receipt' ||
                  value.category === 'timeout-receipt'
                ? temporalFenceFactKeys
                : value.category === 'authority-denial-receipt' ||
                    value.category === 'capability-unavailable-receipt'
                  ? capabilityDenialFactKeys
                  : undefined;
    if (!requiredKeys || !safeExactKeys(value, requiredKeys, [], 16_384)) {
      return false;
    }
    const fact = value as unknown as AgentEvaluationCapabilityOwnerFact;
    const commonIsValid =
      fact.format === AGENT_EVALUATION_CAPABILITY_OWNER_FACT_FORMAT &&
      fact.version === 1 &&
      authorityKindForReceipt(fact.category) === fact.authorityKind &&
      isAgentControlIdentity(fact.authorityId) &&
      isAgentCanonicalDigest(fact.authorityImplementationDigest) &&
      isAgentCanonicalDigest(fact.authorityRequestDigest) &&
      isAgentCanonicalDigest(fact.authorityResultDigest) &&
      isAgentControlInstant(fact.observedAt) &&
      isAgentCanonicalDigest(fact.factDigest) &&
      fact.factDigest ===
        digestWithout(
          fact as unknown as Readonly<Record<string, unknown>>,
          'factDigest'
        );
    if (!commonIsValid) return false;

    if (fact.authorityKind === 'terminal-normalization') {
      return (
        isAgentCanonicalDigest(fact.terminalEventDigest) &&
        fact.terminalEventDigest === fact.authorityResultDigest &&
        isAgentCanonicalDigest(fact.normalizationPolicyDigest) &&
        ((fact.category === 'refusal-receipt' &&
          fact.normalizedOutcome === 'refused') ||
          (fact.category === 'truncation-receipt' &&
            fact.normalizedOutcome === 'truncated'))
      );
    }
    if (fact.authorityKind === 'capability-denial') {
      return (
        isAgentCanonicalDigest(fact.policyDigest) &&
        isAgentControlIdentity(fact.reasonCode) &&
        isAgentCanonicalDigest(fact.decisionDigest) &&
        fact.decisionDigest === fact.authorityResultDigest
      );
    }
    if (fact.category === 'budget-reservation-receipt') {
      return (
        isAgentControlIdentity(fact.reservationId) &&
        isAgentCanonicalDigest(fact.demandDigest) &&
        isAgentCanonicalDigest(fact.settlementDigest) &&
        fact.settlementDigest === fact.authorityResultDigest &&
        (fact.reservationStatus === 'settled' ||
          fact.reservationStatus === 'reconciled')
      );
    }
    if (fact.category === 'checkpoint-resume-receipt') {
      return (
        isAgentCanonicalDigest(fact.checkpointDigest) &&
        Number.isSafeInteger(fact.fromGeneration) &&
        fact.fromGeneration >= 0 &&
        Number.isSafeInteger(fact.toGeneration) &&
        fact.toGeneration > fact.fromGeneration &&
        isAgentCanonicalDigest(fact.resumeResultDigest) &&
        fact.resumeResultDigest === fact.authorityResultDigest
      );
    }
    if (
      fact.category === 'ack-reconciliation-receipt' ||
      fact.category === 'attempt-idempotency-receipt' ||
      fact.category === 'reconciliation-receipt'
    ) {
      const dispositionMatches =
        (fact.category === 'attempt-idempotency-receipt' &&
          (fact.replayDisposition === 'first-applied' ||
            fact.replayDisposition === 'exact-replay')) ||
        (fact.category === 'ack-reconciliation-receipt' &&
          (fact.replayDisposition === 'exact-replay' ||
            fact.replayDisposition === 'reconciled')) ||
        (fact.category === 'reconciliation-receipt' &&
          fact.replayDisposition === 'reconciled');
      return (
        dispositionMatches &&
        isAgentControlIdentity(fact.idempotencyKey) &&
        isAgentCanonicalDigest(fact.authorityResultDigest)
      );
    }
    const expectedFenceOutcome =
      fact.category === 'cancellation-receipt'
        ? 'cancelled'
        : fact.category === 'timeout-receipt'
          ? 'timed-out'
          : fact.category === 'late-callback-rejection-receipt'
            ? 'rejected'
            : 'fenced';
    if (
      fact.category !== 'cancellation-receipt' &&
      fact.category !== 'late-callback-rejection-receipt' &&
      fact.category !== 'late-output-fence-receipt' &&
      fact.category !== 'lease-fence-receipt' &&
      fact.category !== 'state-fence-receipt' &&
      fact.category !== 'timeout-receipt'
    ) {
      return false;
    }
    return (
      isAgentControlIdentity(fact.shardLeaseOwnerId) &&
      Number.isSafeInteger(fact.shardLeaseGeneration) &&
      fact.shardLeaseGeneration >= 1 &&
      ['not-created', 'not-dispatched', 'dispatched'].includes(
        fact.dispatchState
      ) &&
      isAgentControlInstant(fact.authorityInstant) &&
      Date.parse(fact.authorityInstant) <= Date.parse(fact.observedAt) &&
      isAgentCanonicalDigest(fact.fenceDigest) &&
      fact.fenceDigest === fact.authorityResultDigest &&
      fact.fenceOutcome === expectedFenceOutcome
    );
  } catch {
    return false;
  }
};

export const isAgentEvaluationControlledRuntimeCapabilityFact = (
  value: unknown
): value is AgentEvaluationControlledRuntimeCapabilityFact => {
  try {
    if (
      !safeExactKeys(
        value,
        controlledRuntimeFactKeys,
        optionalControlledRuntimeFactKeys,
        32_768
      )
    ) {
      return false;
    }
    const fact =
      value as unknown as AgentEvaluationControlledRuntimeCapabilityFact;
    const { factDigest, ...base } = fact;
    return (
      fact.format ===
        AGENT_EVALUATION_CONTROLLED_RUNTIME_CAPABILITY_FACT_FORMAT &&
      fact.version === 1 &&
      isAgentCanonicalDigest(fact.planDigest) &&
      repositoryCommitPattern.test(fact.repositoryCommit) &&
      isAgentControlIdentity(fact.attemptId) &&
      isAgentCanonicalDigest(fact.descriptorDigest) &&
      isAgentControlIdentity(fact.caseId) &&
      isAgentCanonicalDigest(fact.materialDigest) &&
      isAgentControlIdentity(fact.runtimeAuthorityId) &&
      isAgentCanonicalDigest(fact.runtimeImplementationDigest) &&
      isAgentCanonicalDigest(fact.verificationClosureDigest) &&
      (fact.verificationVerdict === 'passed' ||
        fact.verificationVerdict === 'failed') &&
      (fact.toolExecutionReceiptSetDigest === undefined ||
        isAgentCanonicalDigest(fact.toolExecutionReceiptSetDigest)) &&
      (fact.continuationReceiptSetDigest === undefined ||
        isAgentCanonicalDigest(fact.continuationReceiptSetDigest)) &&
      isAgentCanonicalDigest(fact.ownerAuthoritySetDigest) &&
      isAgentCanonicalDigest(factDigest) &&
      factDigest === digestAgentCanonicalValue(base)
    );
  } catch {
    return false;
  }
};

export const createAgentEvaluationControlledRuntimeCapabilityFact = (
  receipt: AgentEvaluationControlledRuntimeReceipt
): AgentEvaluationControlledRuntimeCapabilityFact => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_RUNTIME_CAPABILITY_FACT_FORMAT,
    version: 1 as const,
    planDigest: receipt.planDigest,
    repositoryCommit: receipt.repositoryCommit,
    attemptId: receipt.attemptId,
    descriptorDigest: receipt.descriptorDigest,
    caseId: receipt.caseId,
    materialDigest: receipt.materialDigest,
    runtimeAuthorityId: receipt.runtimeAuthorityId,
    runtimeImplementationDigest: receipt.runtimeImplementationDigest,
    verificationClosureDigest: receipt.g3Verification.verificationClosureDigest,
    verificationVerdict: receipt.g3Verification.verdict,
    ...(receipt.toolExecutionReceiptSetDigest
      ? {
          toolExecutionReceiptSetDigest: receipt.toolExecutionReceiptSetDigest,
        }
      : {}),
    ...(receipt.continuationReceiptSetDigest
      ? { continuationReceiptSetDigest: receipt.continuationReceiptSetDigest }
      : {}),
    ownerAuthoritySetDigest: receipt.ownerAuthoritySetDigest,
  });
  const fact = Object.freeze({
    ...base,
    factDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationControlledRuntimeCapabilityFact(fact)) {
    throw new TypeError('Controlled runtime capability projection is invalid.');
  }
  return fact;
};

const authorityFactDigest = (
  authority: AgentEvaluationCapabilitySpecificAuthority
): CanonicalDigest | undefined => {
  if (!isPlainObject(authority.fact)) return undefined;
  if (
    authority.authorityKind === 'terminal-normalization' ||
    authority.authorityKind === 'recovery-authority' ||
    authority.authorityKind === 'capability-denial'
  ) {
    return isAgentEvaluationCapabilityOwnerFact(authority.fact)
      ? authority.fact.factDigest
      : undefined;
  }
  switch (authority.authorityKind) {
    case 'provider-job':
      return isAgentEvaluationProviderJobCapabilityFact(authority.fact)
        ? authority.fact.receiptDigest
        : undefined;
    case 'provider-cache':
      return isAgentEvaluationProviderCacheCapabilityFact(authority.fact)
        ? authority.fact.receiptDigest
        : undefined;
    case 'opaque-continuation':
      return isAgentEvaluationProviderOpaqueContinuationCapabilityFact(
        authority.fact
      )
        ? authority.fact.continuationDigest
        : undefined;
    case 'retrieval-query':
      return isAgentEvaluationRetrievalQueryCapabilityFact(authority.fact)
        ? authority.fact.receiptDigest
        : undefined;
    case 'parallel-tool-join':
      return isAgentEvaluationParallelToolJoinCapabilityFact(authority.fact)
        ? authority.fact.receiptDigest
        : undefined;
    case 'controlled-tool-execution':
      return isAgentEvaluationControlledToolExecutionCapabilityFact(
        authority.fact
      )
        ? authority.fact.receiptDigest
        : undefined;
    case 'controlled-continuation':
      return isAgentEvaluationControlledContinuationCapabilityFact(
        authority.fact
      )
        ? authority.fact.receiptDigest
        : undefined;
    case 'controlled-runtime':
      return isAgentEvaluationControlledRuntimeCapabilityFact(authority.fact)
        ? authority.fact.factDigest
        : undefined;
    case 'usage-vector':
      return isAgentEvaluationUsageVectorCapabilityFact(authority.fact)
        ? authority.fact.vectorDigest
        : undefined;
  }
};

const authoritySemanticSupportsReceipt = (
  authority: AgentEvaluationCapabilitySpecificAuthority
): boolean => {
  if (
    authority.authorityKind === 'terminal-normalization' ||
    authority.authorityKind === 'recovery-authority' ||
    authority.authorityKind === 'capability-denial'
  ) {
    return authority.fact.category === authority.receiptKind;
  }
  if (authority.authorityKind === 'controlled-tool-execution') {
    if (authority.receiptKind === 'repair-round-receipt') {
      return authority.fact.toolId === 'verification.repair.request';
    }
    if (authority.receiptKind === 'reverse-transaction-receipt') {
      return authority.fact.toolId === 'transaction.rollback.request';
    }
    return (
      authority.receiptKind === 'tool-execution-receipt' &&
      authority.fact.toolId !== 'verification.repair.request' &&
      authority.fact.toolId !== 'transaction.rollback.request'
    );
  }
  if (authority.authorityKind === 'retrieval-query') {
    return authority.receiptKind === 'retrieval-citation-receipt'
      ? authority.fact.sourceResultRefs.length > 0 &&
          authority.fact.retrievalConfigurationDigest === undefined
      : authority.receiptKind === 'source-freshness-receipt' &&
          authority.fact.sourceResultRefs.length === 0 &&
          authority.fact.retrievalConfigurationDigest !== undefined;
  }
  if (authority.authorityKind === 'usage-vector') {
    if (authority.fact.amounts.length === 0) return false;
    if (authority.receiptKind === 'usage-receipt') {
      return authority.fact.amounts.every(
        ({ confidence, sourceDigest }) =>
          (confidence === 'reported' || confidence === 'measured') &&
          sourceDigest === undefined
      );
    }
    if (authority.receiptKind === 'conservative-usage-receipt') {
      return authority.fact.amounts.every(
        ({ confidence, sourceDigest }) =>
          (confidence === 'estimated' || confidence === 'unknown') &&
          sourceDigest === undefined
      );
    }
    return (
      authority.receiptKind === 'usage-reconciliation-receipt' &&
      authority.fact.amounts.every(
        ({ sourceDigest }) => sourceDigest !== undefined
      )
    );
  }
  return true;
};

export const digestAgentEvaluationCapabilitySpecificAuthoritySemantic = (
  input: Readonly<{
    authorityKind: AgentEvaluationCapabilitySpecificAuthority['authorityKind'];
    receiptKind: AgentEvaluationCapabilitySpecificReceiptKind;
    factDigest: CanonicalDigest;
  }>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    authorityKind: input.authorityKind,
    receiptKind: input.receiptKind,
    factDigest: input.factDigest,
  });

export const isAgentEvaluationCapabilitySpecificAuthority = (
  value: unknown,
  expectedKind?: AgentEvaluationCapabilitySpecificAuthority['authorityKind'],
  expectedReceiptKind?: AgentEvaluationCapabilitySpecificReceiptKind
): value is AgentEvaluationCapabilitySpecificAuthority => {
  try {
    if (
      !safeExactKeys(value, [
        'authorityKind',
        'receiptKind',
        'factDigest',
        'semanticDigest',
        'fact',
      ]) ||
      typeof value.authorityKind !== 'string' ||
      !receiptKind(value.receiptKind) ||
      (expectedKind !== undefined && value.authorityKind !== expectedKind) ||
      (expectedReceiptKind !== undefined &&
        value.receiptKind !== expectedReceiptKind) ||
      !isAgentCanonicalDigest(value.factDigest) ||
      !isAgentCanonicalDigest(value.semanticDigest)
    ) {
      return false;
    }
    const authority =
      value as unknown as AgentEvaluationCapabilitySpecificAuthority;
    return (
      authorityFactDigest(authority) === authority.factDigest &&
      authoritySemanticSupportsReceipt(authority) &&
      authority.semanticDigest ===
        digestAgentEvaluationCapabilitySpecificAuthoritySemantic(authority)
    );
  } catch {
    return false;
  }
};

export const isAgentEvaluationCapabilitySpecificReceipt = (
  value: unknown
): value is AgentEvaluationCapabilitySpecificReceipt => {
  try {
    if (!safeExactKeys(value, receiptKeys, optionalReceiptKeys)) return false;
    const receipt =
      value as unknown as AgentEvaluationCapabilitySpecificReceipt;
    const hasTool = receipt.toolId !== undefined;
    const requiresProviderObservation = [
      'provider-job',
      'provider-cache',
      'opaque-continuation',
      'retrieval-query',
      'usage-vector',
      'terminal-normalization',
      'capability-denial',
    ].includes(receipt.authority.authorityKind);
    if (
      receipt.format !== AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_FORMAT ||
      receipt.version !==
        AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_VERSION ||
      !isAgentControlIdentity(receipt.receiptId) ||
      !receiptKind(receipt.receiptKind) ||
      !isAgentCanonicalDigest(receipt.planDigest) ||
      !repositoryCommitPattern.test(receipt.repositoryCommit) ||
      !isAgentControlIdentity(receipt.attemptId) ||
      !isAgentCanonicalDigest(receipt.descriptorDigest) ||
      !isAgentControlIdentity(receipt.caseId) ||
      !isAgentCanonicalDigest(receipt.materialDigest) ||
      !isAgentCanonicalDigest(receipt.capabilityDescriptorDigest) ||
      !Number.isSafeInteger(receipt.turnIndex) ||
      receipt.turnIndex < 0 ||
      receipt.turnIndex > maximumTurnIndex ||
      !isAgentControlIdentity(receipt.invocationId) ||
      hasTool !== (receipt.toolCallId !== undefined) ||
      (hasTool &&
        (!isAgentControlIdentity(receipt.toolId) ||
          !isAgentControlIdentity(receipt.toolCallId))) ||
      (receipt.providerToolCallId !== undefined &&
        (!hasTool || !isAgentControlIdentity(receipt.providerToolCallId))) ||
      requiresProviderObservation !==
        (receipt.providerCapabilityObservationReceiptDigest !== undefined) ||
      (receipt.providerCapabilityObservationReceiptDigest !== undefined &&
        !isAgentCanonicalDigest(
          receipt.providerCapabilityObservationReceiptDigest
        )) ||
      !isAgentCanonicalDigest(receipt.requestDigest) ||
      !isAgentCanonicalDigest(receipt.resultDigest) ||
      !isAgentControlInstant(receipt.startedAt) ||
      !isAgentControlInstant(receipt.completedAt) ||
      Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
      !isAgentEvaluationCapabilitySpecificAuthority(
        receipt.authority,
        authorityKindForReceipt(receipt.receiptKind),
        receipt.receiptKind
      ) ||
      ((receipt.authority.authorityKind === 'terminal-normalization' ||
        receipt.authority.authorityKind === 'recovery-authority' ||
        receipt.authority.authorityKind === 'capability-denial') &&
        receipt.authority.fact.authorityResultDigest !==
          receipt.resultDigest) ||
      !isAgentCanonicalDigest(receipt.receiptDigest)
    ) {
      return false;
    }
    return (
      receipt.receiptDigest ===
      digestWithout(
        receipt as unknown as Readonly<Record<string, unknown>>,
        'receiptDigest'
      )
    );
  } catch {
    return false;
  }
};

export const createAgentEvaluationCapabilitySpecificReceipt = (
  input: CreateAgentEvaluationCapabilitySpecificReceiptInput
): AgentEvaluationCapabilitySpecificReceipt => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_VERSION,
    ...input,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationCapabilitySpecificReceipt(receipt)) {
    throw new TypeError('Evaluation capability-specific receipt is invalid.');
  }
  return receipt;
};

export const canonicalAgentEvaluationCapabilitySpecificReceiptOrder = (
  left: AgentEvaluationCapabilitySpecificReceipt,
  right: AgentEvaluationCapabilitySpecificReceipt
): number =>
  compareUnicodeCodePoints(left.attemptId, right.attemptId) ||
  left.turnIndex - right.turnIndex ||
  compareUnicodeCodePoints(left.receiptKind, right.receiptKind) ||
  compareUnicodeCodePoints(left.receiptId, right.receiptId);

export const digestAgentEvaluationCapabilitySpecificReceiptSet = (
  receipts: readonly AgentEvaluationCapabilitySpecificReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    receiptDigests: [...receipts]
      .sort(canonicalAgentEvaluationCapabilitySpecificReceiptOrder)
      .map(({ receiptDigest }) => receiptDigest),
  });

export const capabilitySpecificReceiptDigest = (
  receipt: AgentEvaluationCapabilitySpecificReceipt
): Readonly<{
  receiptKind: AgentEvaluationCapabilitySpecificReceiptKind;
  receiptDigest: CanonicalDigest;
}> =>
  Object.freeze({
    receiptKind: receipt.receiptKind,
    receiptDigest: receipt.receiptDigest,
  });

// Keeps the authority fact boundary JSON-only for cross-language evidence.
export const capabilitySpecificAuthorityFactJson = (
  authority: AgentEvaluationCapabilitySpecificAuthority
): AgentJsonValue => authority.fact as AgentJsonValue;
