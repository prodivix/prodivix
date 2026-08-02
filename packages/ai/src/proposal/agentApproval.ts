import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentApprovalDecision,
  AgentCapability,
  AgentCapabilityGrant,
  AgentPrincipalRef,
  AgentRiskLevel,
  AgentTargetRef,
} from '../domain/agent.types';
import { digestAgentPolicy } from '../domain/agentPolicyCodec';
import {
  canonicalizeAgentWorkspaceRevision,
  isAgentCanonicalDigest,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import { proposalIssue } from './agentActionRegistry';
import { isAgentProposalPlanningReceipt } from './agentProposalPreview';
import type {
  AgentApprovalPreflightContext,
  AgentApprovalPreflightResult,
  AgentProposalIssue,
} from './agentProposal.types';

const riskRank: Readonly<Record<AgentRiskLevel, number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

const principalsEqual = (
  left: AgentPrincipalRef,
  right: AgentPrincipalRef
): boolean =>
  left.kind === right.kind && left.principalId === right.principalId;

const targetCovers = (
  workspaceId: string,
  allowed: AgentTargetRef,
  requested: AgentTargetRef
): boolean =>
  (allowed.kind === requested.kind && allowed.id === requested.id) ||
  (allowed.kind === 'workspace' && allowed.id === workspaceId);

const scopeCovers = (
  workspaceId: string,
  allowed: readonly AgentTargetRef[],
  requested: AgentTargetRef
): boolean =>
  allowed.some((target) => targetCovers(workspaceId, target, requested));

const maximumRisk = (context: AgentApprovalPreflightContext): AgentRiskLevel =>
  context.planning.risks.reduce<AgentRiskLevel>(
    (maximum, risk) =>
      riskRank[risk.level] > riskRank[maximum] ? risk.level : maximum,
    'low'
  );

const requiredApprovalCapabilities = (
  context: AgentApprovalPreflightContext
): readonly AgentCapability[] =>
  Object.freeze([
    ...new Set<AgentCapability>([
      ...context.planning.requiredCapabilities,
      'approve',
      'commit',
      ...(context.decision.rollbackAuthorization === 'on-unsatisfied-closure'
        ? (['rollback'] as const)
        : []),
    ]),
  ]);

const policyAllowsCapability = (
  context: AgentApprovalPreflightContext,
  capability: AgentCapability,
  risk: AgentRiskLevel
): boolean => {
  const targets = context.proposal.actions.map(({ target }) => target);
  const matchingRules = context.policy.capabilityRules.filter(
    (rule) =>
      rule.capabilities.includes(capability) &&
      riskRank[rule.maximumRisk] >= riskRank[risk] &&
      targets.every((target) =>
        scopeCovers(context.grant.workspaceId, rule.targetScope.targets, target)
      )
  );
  return (
    matchingRules.some(({ effect }) => effect === 'allow') &&
    !matchingRules.some(({ effect }) => effect === 'deny')
  );
};

const approvalRuleAllows = (
  context: AgentApprovalPreflightContext,
  risk: AgentRiskLevel
): boolean =>
  context.policy.approvalRules.some(
    (rule) =>
      rule.decisionAuthority === 'explicit-human' &&
      rule.riskLevels.includes(risk) &&
      rule.capabilities.includes('commit') &&
      (context.decision.rollbackAuthorization === 'none' ||
        (rule.capabilities.includes('rollback') &&
          rule.rollbackAuthorization === 'on-unsatisfied-closure'))
  );

export const createAgentApprovalDecision = (
  input: AgentApprovalDecision
): AgentApprovalDecision => {
  if (
    !isAgentControlIdentity(input.decisionId) ||
    (input.decision !== 'approved' && input.decision !== 'rejected') ||
    input.actor.kind !== 'user' ||
    !isAgentControlIdentity(input.actor.principalId) ||
    !isAgentControlIdentity(input.taskId) ||
    !isAgentControlIdentity(input.runId) ||
    !isAgentControlIdentity(input.previewId) ||
    !isAgentCanonicalDigest(input.previewDigest) ||
    !isAgentCanonicalDigest(input.transactionDigest) ||
    !isAgentCanonicalDigest(input.impactDigest) ||
    !isAgentCanonicalDigest(input.verificationPlanDigest) ||
    !isAgentControlIdentity(input.grantRef.grantId) ||
    !isAgentCanonicalDigest(input.policyDigest) ||
    (input.rollbackAuthorization !== 'none' &&
      input.rollbackAuthorization !== 'on-unsatisfied-closure') ||
    (input.decision === 'rejected' && input.rollbackAuthorization !== 'none') ||
    !isAgentControlInstant(input.decidedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.decidedAt) ||
    (input.reason !== undefined &&
      (!input.reason.trim() ||
        input.reason !== input.reason.trim() ||
        input.reason.length > 4_096 ||
        containsAgentControlCredentialLikeText(input.reason)))
  ) {
    throw new TypeError('Agent approval decision is invalid.');
  }
  return Object.freeze({
    decisionId: input.decisionId,
    decision: input.decision,
    actor: Object.freeze({ ...input.actor }),
    taskId: input.taskId,
    runId: input.runId,
    previewId: input.previewId,
    previewDigest: input.previewDigest,
    baseRevision: canonicalizeAgentWorkspaceRevision(input.baseRevision),
    transactionDigest: input.transactionDigest,
    impactDigest: input.impactDigest,
    verificationPlanDigest: input.verificationPlanDigest,
    grantRef: Object.freeze({ grantId: input.grantRef.grantId }),
    policyDigest: input.policyDigest,
    rollbackAuthorization: input.rollbackAuthorization,
    ...(input.reason ? { reason: input.reason } : {}),
    decidedAt: input.decidedAt,
    expiresAt: input.expiresAt,
  });
};

export const isAgentApprovalDecision = (
  value: unknown
): value is AgentApprovalDecision => {
  if (
    !hasExactAgentControlKeys(
      value,
      [
        'decisionId',
        'decision',
        'actor',
        'taskId',
        'runId',
        'previewId',
        'previewDigest',
        'baseRevision',
        'transactionDigest',
        'impactDigest',
        'verificationPlanDigest',
        'grantRef',
        'policyDigest',
        'rollbackAuthorization',
        'decidedAt',
        'expiresAt',
      ],
      ['reason']
    ) ||
    !isPlainObject(value.actor) ||
    !isPlainObject(value.grantRef)
  ) {
    return false;
  }
  try {
    return (
      canonicalJsonText(
        createAgentApprovalDecision(value as AgentApprovalDecision)
      ) === canonicalJsonText(value)
    );
  } catch {
    return false;
  }
};

const reject = (
  status: 'rejected' | 'stale' | 'invalidated',
  issues: readonly AgentProposalIssue[]
): AgentApprovalPreflightResult =>
  Object.freeze({ status, issues: Object.freeze([...issues]) });

const grantIsBound = (
  context: AgentApprovalPreflightContext,
  requiredCapabilities: readonly AgentCapability[]
): boolean => {
  const { grant, decision, proposal } = context;
  return (
    grant.grantId === decision.grantRef.grantId &&
    grant.taskId === proposal.taskId &&
    (grant.runId === undefined || grant.runId === proposal.runId) &&
    principalsEqual(grant.subject, decision.actor) &&
    sameAgentWorkspaceRevision(grant.baseRevision, proposal.baseRevision) &&
    grant.policyDigest === decision.policyDigest &&
    requiredCapabilities.every((capability) =>
      grant.capabilities.includes(capability)
    ) &&
    proposal.actions.every(({ target }) =>
      scopeCovers(grant.workspaceId, grant.targetScope.targets, target)
    )
  );
};

/**
 * Revalidates every approval binding immediately before Atomic Commit. No
 * bearer token or natural-language assertion can satisfy this preflight.
 */
export const preflightAgentApproval = (
  context: AgentApprovalPreflightContext
): AgentApprovalPreflightResult => {
  const issues: AgentProposalIssue[] = [];
  if (
    !isAgentApprovalDecision(context.decision) ||
    !isAgentProposalPlanningReceipt(context.planning)
  ) {
    return reject('rejected', [
      proposalIssue(
        'AI-5006',
        '/decision',
        'Agent approval or planning receipt is structurally invalid.'
      ),
    ]);
  }
  const { proposal, preview, planning, decision, grant } = context;
  if (decision.decision !== 'approved') {
    issues.push(
      proposalIssue(
        'AI-5006',
        '/decision/decision',
        'A rejected decision cannot authorize Workspace commit.'
      )
    );
  }
  if (
    proposal.proposalId !== planning.proposalId ||
    preview.proposalId !== proposal.proposalId ||
    decision.taskId !== proposal.taskId ||
    decision.runId !== proposal.runId ||
    decision.previewId !== preview.previewId ||
    decision.previewDigest !== preview.previewDigest ||
    decision.transactionDigest !== preview.transactionDigest ||
    decision.impactDigest !== preview.impactDigest ||
    decision.verificationPlanDigest !== preview.verificationPlanDigest ||
    preview.transactionDigest !== planning.transactionDigest ||
    preview.reverseTransactionDigest !== planning.reverseTransactionDigest ||
    preview.semanticDiffDigest !== planning.semanticDiffDigest ||
    preview.proposedSnapshotDigest !== planning.proposedSnapshotDigest
  ) {
    issues.push(
      proposalIssue(
        'AI-7006',
        '/decision',
        'Approval does not bind the exact proposal preview and transaction.'
      )
    );
  }
  if (
    !sameAgentWorkspaceRevision(decision.baseRevision, proposal.baseRevision) ||
    !sameAgentWorkspaceRevision(preview.baseRevision, proposal.baseRevision) ||
    !sameAgentWorkspaceRevision(planning.baseRevision, proposal.baseRevision) ||
    !sameAgentWorkspaceRevision(context.currentRevision, proposal.baseRevision)
  ) {
    issues.push(
      proposalIssue(
        'AI-6001',
        '/currentRevision',
        'Proposal base revision is stale; automatic rebase is forbidden.'
      )
    );
  }
  if (
    !isAgentControlInstant(context.at) ||
    Date.parse(context.at) < Date.parse(decision.decidedAt) ||
    Date.parse(context.at) >= Date.parse(decision.expiresAt) ||
    Date.parse(context.at) >= Date.parse(preview.expiresAt) ||
    Date.parse(context.at) < Date.parse(grant.issuedAt) ||
    Date.parse(context.at) >= Date.parse(grant.expiresAt)
  ) {
    issues.push(
      proposalIssue(
        'AI-5006',
        '/expiresAt',
        'Approval, preview, or capability grant is missing, expired, or not active.'
      )
    );
  }
  if (
    !context.actorAuthorized ||
    !isAgentCanonicalDigest(context.actorAuthorizationDigest) ||
    context.actorAuthorizationDigest !==
      context.expectedActorAuthorizationDigest ||
    decision.actor.kind !== 'user'
  ) {
    issues.push(
      proposalIssue(
        'AI-7005',
        '/actor',
        'Approval actor is not an explicitly authorized human principal.'
      )
    );
  }
  let policyDigest: string;
  try {
    policyDigest = digestAgentPolicy(context.policy);
  } catch {
    issues.push(
      proposalIssue(
        'AI-7006',
        '/policyDigest',
        'Effective Agent policy is malformed or cannot be canonicalized.'
      )
    );
    return reject('invalidated', issues);
  }
  if (
    policyDigest !== decision.policyDigest ||
    policyDigest !== grant.policyDigest
  ) {
    issues.push(
      proposalIssue(
        'AI-7006',
        '/policyDigest',
        'Effective Agent policy changed after preview or approval.'
      )
    );
  }
  const requiredCapabilities = requiredApprovalCapabilities(context);
  if (
    !Number.isSafeInteger(context.grantUseCount) ||
    context.grantUseCount < 0 ||
    context.grantUseCount >= Math.min(grant.maxUses, grant.limits.maxUses) ||
    !grantIsBound(context, requiredCapabilities)
  ) {
    issues.push(
      proposalIssue(
        'AI-7001',
        '/grant',
        'Capability grant does not authorize this exact actor, target, revision, or use.'
      )
    );
  }
  const risk = maximumRisk(context);
  if (
    !requiredCapabilities.every((capability) =>
      policyAllowsCapability(context, capability, risk)
    ) ||
    !approvalRuleAllows(context, risk) ||
    (decision.rollbackAuthorization === 'on-unsatisfied-closure' &&
      (context.policy.verificationRules.rollback !== 'approval-bound' ||
        !grant.capabilities.includes('rollback')))
  ) {
    issues.push(
      proposalIssue(
        'AI-7001',
        '/policy',
        'Agent policy does not authorize the required risk, capability, or rollback scope.'
      )
    );
  }
  if (issues.length > 0) {
    return reject(
      issues.some(({ code }) => code === 'AI-6001')
        ? 'stale'
        : issues.some(({ code }) => code === 'AI-7006')
          ? 'invalidated'
          : 'rejected',
      issues
    );
  }
  return Object.freeze({
    status: 'ready',
    decision,
    preview,
    planning,
  });
};

export const freezeAgentCapabilityGrant = (
  grant: AgentCapabilityGrant
): AgentCapabilityGrant => Object.freeze(grant);
