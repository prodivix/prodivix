import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type { AgentWorkspaceRevisionVector } from '../domain/agent.types';
import { digestAgentPolicy } from '../domain/agentPolicyCodec';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';
import {
  hasExactAgentControlKeys,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import { proposalIssue } from './agentActionRegistry';
import { isAgentApprovalDecision } from './agentApproval';
import type {
  AgentProposalIssue,
  AgentRollbackPreflightContext,
  AgentRollbackPreflightResult,
  AgentWorkspaceMutationReceipt,
} from './agentProposal.types';

const canonicalOptionalRevision = (
  value: AgentWorkspaceRevisionVector | undefined
): AgentWorkspaceRevisionVector | undefined =>
  value === undefined ? undefined : canonicalizeAgentWorkspaceRevision(value);

export const createAgentWorkspaceMutationReceipt = (
  input: Omit<AgentWorkspaceMutationReceipt, 'receiptDigest'>
): AgentWorkspaceMutationReceipt => {
  for (const [field, value] of [
    ['receiptId', input.receiptId],
    ['taskId', input.taskId],
    ['runId', input.runId],
    ['proposalId', input.proposalId],
    ['previewId', input.previewId],
    ['decisionId', input.decisionId],
    ['operationId', input.operationId],
    ['producer.principalId', input.producer.principalId],
  ] as const) {
    if (!isAgentControlIdentity(value)) {
      throw new TypeError(`Agent Workspace mutation ${field} is invalid.`);
    }
  }
  for (const [field, value] of [
    ['transactionDigest', input.transactionDigest],
    ['reverseTransactionDigest', input.reverseTransactionDigest],
    ['requestDigest', input.requestDigest],
  ] as const) {
    if (!isAgentCanonicalDigest(value)) {
      throw new TypeError(`Agent Workspace mutation ${field} is invalid.`);
    }
  }
  if (
    (input.kind !== 'commit' && input.kind !== 'rollback') ||
    ![
      'started',
      'acknowledged',
      'conflicted',
      'reconciliation-required',
    ].includes(input.state) ||
    (input.producer.kind !== 'user' && input.producer.kind !== 'service') ||
    !isAgentControlInstant(input.startedAt) ||
    (input.completedAt !== undefined &&
      (!isAgentControlInstant(input.completedAt) ||
        Date.parse(input.completedAt) < Date.parse(input.startedAt))) ||
    (input.mutationDigest !== undefined &&
      !isAgentCanonicalDigest(input.mutationDigest)) ||
    (input.conflictDigest !== undefined &&
      !isAgentCanonicalDigest(input.conflictDigest))
  ) {
    throw new TypeError('Agent Workspace mutation lifecycle is invalid.');
  }
  if (
    (input.state === 'started' &&
      (input.completedAt !== undefined ||
        input.targetRevision !== undefined ||
        input.mutationDigest !== undefined ||
        input.conflictDigest !== undefined)) ||
    (input.state === 'acknowledged' &&
      (input.completedAt === undefined ||
        input.targetRevision === undefined ||
        input.mutationDigest === undefined ||
        input.conflictDigest !== undefined)) ||
    (input.state === 'conflicted' &&
      (input.completedAt === undefined ||
        input.targetRevision !== undefined ||
        input.mutationDigest !== undefined ||
        input.conflictDigest === undefined)) ||
    (input.state === 'reconciliation-required' &&
      (input.targetRevision !== undefined ||
        input.mutationDigest !== undefined ||
        input.conflictDigest !== undefined))
  ) {
    throw new TypeError(
      'Agent Workspace mutation state has incompatible receipt fields.'
    );
  }
  const base = Object.freeze({
    receiptId: input.receiptId,
    kind: input.kind,
    state: input.state,
    taskId: input.taskId,
    runId: input.runId,
    proposalId: input.proposalId,
    previewId: input.previewId,
    decisionId: input.decisionId,
    operationId: input.operationId,
    baseRevision: canonicalizeAgentWorkspaceRevision(input.baseRevision),
    transactionDigest: input.transactionDigest,
    reverseTransactionDigest: input.reverseTransactionDigest,
    requestDigest: input.requestDigest,
    producer: Object.freeze({ ...input.producer }),
    startedAt: input.startedAt,
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    ...(input.targetRevision
      ? { targetRevision: canonicalOptionalRevision(input.targetRevision)! }
      : {}),
    ...(input.mutationDigest ? { mutationDigest: input.mutationDigest } : {}),
    ...(input.conflictDigest ? { conflictDigest: input.conflictDigest } : {}),
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentWorkspaceMutationReceipt = (
  value: unknown
): value is AgentWorkspaceMutationReceipt => {
  if (
    !hasExactAgentControlKeys(
      value,
      [
        'receiptId',
        'kind',
        'state',
        'taskId',
        'runId',
        'proposalId',
        'previewId',
        'decisionId',
        'operationId',
        'baseRevision',
        'transactionDigest',
        'reverseTransactionDigest',
        'requestDigest',
        'producer',
        'startedAt',
        'receiptDigest',
      ],
      ['completedAt', 'targetRevision', 'mutationDigest', 'conflictDigest']
    ) ||
    !isPlainObject(value.producer) ||
    !isAgentCanonicalDigest(value.receiptDigest)
  ) {
    return false;
  }
  try {
    const receipt = value as AgentWorkspaceMutationReceipt;
    return (
      canonicalJsonText(
        createAgentWorkspaceMutationReceipt({
          receiptId: receipt.receiptId,
          kind: receipt.kind,
          state: receipt.state,
          taskId: receipt.taskId,
          runId: receipt.runId,
          proposalId: receipt.proposalId,
          previewId: receipt.previewId,
          decisionId: receipt.decisionId,
          operationId: receipt.operationId,
          baseRevision: receipt.baseRevision,
          transactionDigest: receipt.transactionDigest,
          reverseTransactionDigest: receipt.reverseTransactionDigest,
          requestDigest: receipt.requestDigest,
          producer: receipt.producer,
          startedAt: receipt.startedAt,
          ...(receipt.completedAt ? { completedAt: receipt.completedAt } : {}),
          ...(receipt.targetRevision
            ? { targetRevision: receipt.targetRevision }
            : {}),
          ...(receipt.mutationDigest
            ? { mutationDigest: receipt.mutationDigest }
            : {}),
          ...(receipt.conflictDigest
            ? { conflictDigest: receipt.conflictDigest }
            : {}),
        })
      ) === canonicalJsonText(value)
    );
  } catch {
    return false;
  }
};

/** Exact reverse-Transaction authorization; it never regenerates rollback. */
export const preflightAgentRollback = (
  context: AgentRollbackPreflightContext
): AgentRollbackPreflightResult => {
  const { commit, approval, currentRevision } = context;
  const issues: AgentProposalIssue[] = [];
  let policyDigestMatches = false;
  try {
    policyDigestMatches =
      digestAgentPolicy(approval.policy) === approval.decision.policyDigest;
  } catch {
    policyDigestMatches = false;
  }
  if (
    !isAgentWorkspaceMutationReceipt(commit) ||
    commit.kind !== 'commit' ||
    commit.state !== 'acknowledged' ||
    !commit.targetRevision
  ) {
    issues.push(
      proposalIssue(
        'AI-8004',
        '/commit',
        'Rollback requires an acknowledged exact commit receipt.'
      )
    );
  }
  if (
    !isAgentApprovalDecision(approval.decision) ||
    approval.decision.decision !== 'approved' ||
    approval.decision.rollbackAuthorization !== 'on-unsatisfied-closure' ||
    context.trigger !== 'unsatisfied-closure'
  ) {
    issues.push(
      proposalIssue(
        'AI-8004',
        '/approval/rollbackAuthorization',
        'Rollback was not explicitly authorized for unsatisfied Closure.'
      )
    );
  }
  if (
    !isAgentCanonicalDigest(context.reverseTransactionDigest) ||
    context.reverseTransactionDigest !== commit.reverseTransactionDigest ||
    context.reverseTransactionDigest !==
      approval.planning.reverseTransactionDigest
  ) {
    issues.push(
      proposalIssue(
        'AI-8004',
        '/reverseTransactionDigest',
        'Rollback reverse Transaction identity drifted.'
      )
    );
  }
  if (
    !commit.targetRevision ||
    !sameAgentWorkspaceRevision(currentRevision, commit.targetRevision) ||
    context.hasInterveningAuthoring ||
    context.hasExternalSideEffects
  ) {
    issues.push(
      proposalIssue(
        'AI-8004',
        '/currentRevision',
        'Intervening authoring or external effects make exact rollback unsafe.'
      )
    );
  }
  if (
    !context.actorAuthorized ||
    approval.actorAuthorizationDigest !==
      approval.expectedActorAuthorizationDigest ||
    !policyDigestMatches ||
    approval.grant.policyDigest !== approval.decision.policyDigest ||
    !approval.grant.capabilities.includes('rollback') ||
    approval.policy.verificationRules.rollback !== 'approval-bound' ||
    !isAgentControlInstant(context.at) ||
    Date.parse(context.at) >= Date.parse(approval.decision.expiresAt) ||
    Date.parse(context.at) >= Date.parse(approval.grant.expiresAt)
  ) {
    issues.push(
      proposalIssue(
        'AI-8004',
        '/authority',
        'Rollback actor, policy, grant, or lifetime authority is incompatible.'
      )
    );
  }
  return issues.length > 0
    ? Object.freeze({
        status: 'blocked' as const,
        issues: Object.freeze(issues),
      })
    : Object.freeze({
        status: 'ready' as const,
        reverseTransactionDigest: context.reverseTransactionDigest,
        currentRevision: canonicalizeAgentWorkspaceRevision(currentRevision),
      });
};
