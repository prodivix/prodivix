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
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import type { AgentEvaluationAttemptStatus } from './agentEvaluation.types';

const maximumReceiptBytes = 65_536;
const maximumTurnIndex = 64;
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;

export const AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STAGES = Object.freeze([
  'protected-material-resolution',
  'invocation-payload-encoding',
  'budget-admission',
  'dispatch-admission',
] as const);

export type AgentEvaluationPreDispatchFailureStage =
  (typeof AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STAGES)[number];

export const AGENT_EVALUATION_PRE_DISPATCH_FAILURE_REASON_CODES = Object.freeze(
  [
    'protected-material-unavailable',
    'protected-material-integrity-failed',
    'protected-material-policy-rejected',
    'protected-material-leak-blocked',
    'invocation-payload-invalid',
    'budget-admission-rejected',
    'verification-attempt-grant-unavailable',
    'cancelled-before-dispatch',
  ] as const
);

export type AgentEvaluationPreDispatchFailureReasonCode =
  (typeof AGENT_EVALUATION_PRE_DISPATCH_FAILURE_REASON_CODES)[number];

export type AgentEvaluationPreDispatchFailureTerminalStatus = Extract<
  AgentEvaluationAttemptStatus,
  'infrastructure-error' | 'blocked' | 'schema-failed' | 'cancelled'
>;

/**
 * Frozen metric meaning for a turn that ends before provider dispatch exists.
 * Security and policy failures stay blocked; unavailable protected
 * infrastructure remains distinguishable from model/schema outcomes.
 */
export const AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STATUS_BY_REASON =
  Object.freeze({
    'protected-material-unavailable': 'infrastructure-error',
    'protected-material-integrity-failed': 'blocked',
    'protected-material-policy-rejected': 'blocked',
    'protected-material-leak-blocked': 'blocked',
    'invocation-payload-invalid': 'schema-failed',
    'budget-admission-rejected': 'blocked',
    'verification-attempt-grant-unavailable': 'infrastructure-error',
    'cancelled-before-dispatch': 'cancelled',
  } satisfies Readonly<
    Record<
      AgentEvaluationPreDispatchFailureReasonCode,
      AgentEvaluationPreDispatchFailureTerminalStatus
    >
  >);

export type AgentEvaluationPreDispatchFailureReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-pre-dispatch-failure-receipt';
  version: 1;
  failureReceiptId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  stage: AgentEvaluationPreDispatchFailureStage;
  reasonCode: AgentEvaluationPreDispatchFailureReasonCode;
  policyDigest: CanonicalDigest;
  inputDigest: CanonicalDigest;
  findingDigest: CanonicalDigest;
  occurredAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationPreDispatchFailureReceiptInput = Omit<
  AgentEvaluationPreDispatchFailureReceipt,
  'format' | 'version' | 'receiptDigest'
>;

const requiredKeys = Object.freeze([
  'format',
  'version',
  'failureReceiptId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'stage',
  'reasonCode',
  'policyDigest',
  'inputDigest',
  'findingDigest',
  'occurredAt',
  'receiptDigest',
] as const);

const stageForReason: Readonly<
  Record<
    AgentEvaluationPreDispatchFailureReasonCode,
    AgentEvaluationPreDispatchFailureStage
  >
> = Object.freeze({
  'protected-material-unavailable': 'protected-material-resolution',
  'protected-material-integrity-failed': 'protected-material-resolution',
  'protected-material-policy-rejected': 'protected-material-resolution',
  'protected-material-leak-blocked': 'protected-material-resolution',
  'invocation-payload-invalid': 'invocation-payload-encoding',
  'budget-admission-rejected': 'budget-admission',
  'verification-attempt-grant-unavailable': 'dispatch-admission',
  'cancelled-before-dispatch': 'dispatch-admission',
});

const hasExactReceiptShape = (
  value: unknown
): value is Readonly<Record<(typeof requiredKeys)[number], unknown>> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.keys(value).some(isUnsafeObjectKey) ||
    inspectAgentControlJson(value, maximumReceiptBytes).length > 0
  ) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === requiredKeys.length &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
};

/**
 * Validates one durable authority for a turn that failed before provider
 * dispatch. Only bounded identities, a fixed reason, and authority digests may
 * cross this boundary; diagnostic paths and source material stay private.
 */
export const isAgentEvaluationPreDispatchFailureReceipt = (
  value: unknown
): value is AgentEvaluationPreDispatchFailureReceipt => {
  try {
    if (!hasExactReceiptShape(value)) return false;
    const receipt = value as AgentEvaluationPreDispatchFailureReceipt;
    if (
      receipt.format !==
        'prodivix.agent-evaluation-pre-dispatch-failure-receipt' ||
      receipt.version !== 1 ||
      !isAgentControlIdentity(receipt.failureReceiptId) ||
      !isAgentCanonicalDigest(receipt.planDigest) ||
      !repositoryCommitPattern.test(receipt.repositoryCommit) ||
      !isAgentControlIdentity(receipt.attemptId) ||
      !isAgentCanonicalDigest(receipt.descriptorDigest) ||
      !Number.isSafeInteger(receipt.turnIndex) ||
      receipt.turnIndex < 0 ||
      receipt.turnIndex > maximumTurnIndex ||
      !isAgentControlIdentity(receipt.invocationId) ||
      !Object.hasOwn(stageForReason, receipt.reasonCode) ||
      stageForReason[receipt.reasonCode] !== receipt.stage ||
      !isAgentCanonicalDigest(receipt.policyDigest) ||
      !isAgentCanonicalDigest(receipt.inputDigest) ||
      !isAgentCanonicalDigest(receipt.findingDigest) ||
      !isAgentControlInstant(receipt.occurredAt) ||
      !isAgentCanonicalDigest(receipt.receiptDigest)
    ) {
      return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return receipt.receiptDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export const createAgentEvaluationPreDispatchFailureReceipt = (
  input: CreateAgentEvaluationPreDispatchFailureReceiptInput
): AgentEvaluationPreDispatchFailureReceipt => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-pre-dispatch-failure-receipt' as const,
    version: 1 as const,
    ...input,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationPreDispatchFailureReceipt(receipt)) {
    throw new TypeError('Evaluation pre-dispatch failure receipt is invalid.');
  }
  return receipt;
};
