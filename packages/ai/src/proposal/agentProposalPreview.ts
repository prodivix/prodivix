import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentActionProposal,
  AgentCapability,
  AgentProposalPreview,
  AgentRisk,
} from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  compareAgentCanonicalText,
  digestAgentCanonicalValue,
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
import type {
  AgentProposalIssue,
  AgentProposalPlanningReceipt,
} from './agentProposal.types';

const capabilityOrder: readonly AgentCapability[] = Object.freeze([
  'read',
  'execute',
  'propose',
  'approve',
  'commit',
  'rollback',
]);
const riskOrder: Readonly<Record<AgentRisk['level'], number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

const canonicalCapabilities = (
  values: readonly AgentCapability[]
): readonly AgentCapability[] => {
  const unique = [...new Set(values)];
  if (
    unique.length === 0 ||
    unique.some((value) => !capabilityOrder.includes(value))
  ) {
    throw new TypeError('Agent proposal capabilities are invalid.');
  }
  return Object.freeze(
    unique.sort(
      (left, right) =>
        capabilityOrder.indexOf(left) - capabilityOrder.indexOf(right)
    )
  );
};

const canonicalRisks = (values: readonly AgentRisk[]): readonly AgentRisk[] => {
  if (values.length > 128) {
    throw new TypeError('Agent proposal risk count is invalid.');
  }
  const risks = values
    .map((risk) => {
      if (
        !isAgentControlIdentity(risk.id) ||
        !Object.hasOwn(riskOrder, risk.level) ||
        !risk.message.trim() ||
        risk.message !== risk.message.trim() ||
        risk.message.length > 4_096 ||
        containsAgentControlCredentialLikeText(risk.message)
      ) {
        throw new TypeError('Agent proposal risk is invalid.');
      }
      return Object.freeze({
        id: risk.id,
        level: risk.level,
        message: risk.message,
      });
    })
    .sort(
      (left, right) =>
        riskOrder[right.level] - riskOrder[left.level] ||
        compareAgentCanonicalText(left.id, right.id) ||
        compareAgentCanonicalText(left.message, right.message)
    );
  if (new Set(risks.map(({ id }) => id)).size !== risks.length) {
    throw new TypeError('Agent proposal risks require unique identities.');
  }
  return Object.freeze(risks);
};

const canonicalDiagnosticRefs = (
  values: readonly string[]
): readonly string[] => {
  if (
    values.length > 512 ||
    values.some((value) => !isAgentControlIdentity(value))
  ) {
    throw new TypeError('Agent proposal diagnostic references are invalid.');
  }
  return Object.freeze([...new Set(values)].sort(compareAgentCanonicalText));
};

export const createAgentProposalPlanningReceipt = (
  input: Omit<AgentProposalPlanningReceipt, 'planningDigest'>
): AgentProposalPlanningReceipt => {
  for (const [field, value] of [
    ['proposalId', input.proposalId],
    ['impactSetRef', input.impactSetRef],
    ['verificationPlanRef', input.verificationPlanRef],
  ] as const) {
    if (!isAgentControlIdentity(value)) {
      throw new TypeError(`Agent planning ${field} is invalid.`);
    }
  }
  for (const [field, value] of [
    ['proposedSnapshotDigest', input.proposedSnapshotDigest],
    ['transactionDigest', input.transactionDigest],
    ['reverseTransactionDigest', input.reverseTransactionDigest],
    ['semanticDiffDigest', input.semanticDiffDigest],
    ['impactDigest', input.impactDigest],
    ['verificationPlanDigest', input.verificationPlanDigest],
    ['sourceTraceDigest', input.sourceTraceDigest],
  ] as const) {
    if (!isAgentCanonicalDigest(value)) {
      throw new TypeError(`Agent planning ${field} is invalid.`);
    }
  }
  if (
    !isAgentControlInstant(input.plannedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.plannedAt)
  ) {
    throw new TypeError('Agent proposal planning lifetime is invalid.');
  }
  const base = Object.freeze({
    proposalId: input.proposalId,
    baseRevision: canonicalizeAgentWorkspaceRevision(input.baseRevision),
    proposedSnapshotDigest: input.proposedSnapshotDigest,
    transactionDigest: input.transactionDigest,
    reverseTransactionDigest: input.reverseTransactionDigest,
    semanticDiffDigest: input.semanticDiffDigest,
    impactSetRef: input.impactSetRef,
    impactDigest: input.impactDigest,
    verificationPlanRef: input.verificationPlanRef,
    verificationPlanDigest: input.verificationPlanDigest,
    sourceTraceDigest: input.sourceTraceDigest,
    requiredCapabilities: canonicalCapabilities(input.requiredCapabilities),
    risks: canonicalRisks(input.risks),
    diagnosticRefs: canonicalDiagnosticRefs(input.diagnosticRefs),
    plannedAt: input.plannedAt,
    expiresAt: input.expiresAt,
  });
  return Object.freeze({
    ...base,
    planningDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentProposalPlanningReceipt = (
  value: unknown
): value is AgentProposalPlanningReceipt => {
  if (
    !hasExactAgentControlKeys(value, [
      'proposalId',
      'baseRevision',
      'proposedSnapshotDigest',
      'transactionDigest',
      'reverseTransactionDigest',
      'semanticDiffDigest',
      'impactSetRef',
      'impactDigest',
      'verificationPlanRef',
      'verificationPlanDigest',
      'sourceTraceDigest',
      'requiredCapabilities',
      'risks',
      'diagnosticRefs',
      'plannedAt',
      'expiresAt',
      'planningDigest',
    ]) ||
    !Array.isArray(value.requiredCapabilities) ||
    !Array.isArray(value.risks) ||
    !Array.isArray(value.diagnosticRefs) ||
    !isAgentCanonicalDigest(value.planningDigest)
  ) {
    return false;
  }
  try {
    const receipt = value as AgentProposalPlanningReceipt;
    return (
      canonicalJsonText(
        createAgentProposalPlanningReceipt({
          proposalId: receipt.proposalId,
          baseRevision: receipt.baseRevision,
          proposedSnapshotDigest: receipt.proposedSnapshotDigest,
          transactionDigest: receipt.transactionDigest,
          reverseTransactionDigest: receipt.reverseTransactionDigest,
          semanticDiffDigest: receipt.semanticDiffDigest,
          impactSetRef: receipt.impactSetRef,
          impactDigest: receipt.impactDigest,
          verificationPlanRef: receipt.verificationPlanRef,
          verificationPlanDigest: receipt.verificationPlanDigest,
          sourceTraceDigest: receipt.sourceTraceDigest,
          requiredCapabilities: receipt.requiredCapabilities,
          risks: receipt.risks,
          diagnosticRefs: receipt.diagnosticRefs,
          plannedAt: receipt.plannedAt,
          expiresAt: receipt.expiresAt,
        })
      ) === canonicalJsonText(value)
    );
  } catch {
    return false;
  }
};

export const createAgentProposalPreview = (input: {
  previewId: string;
  proposal: AgentActionProposal;
  planning: AgentProposalPlanningReceipt;
}): AgentProposalPreview => {
  if (
    !isAgentControlIdentity(input.previewId) ||
    input.proposal.proposalId !== input.planning.proposalId ||
    !sameAgentWorkspaceRevision(
      input.proposal.baseRevision,
      input.planning.baseRevision
    ) ||
    !isAgentProposalPlanningReceipt(input.planning)
  ) {
    throw new TypeError(
      'Agent proposal preview does not bind an exact valid planning receipt.'
    );
  }
  const base = Object.freeze({
    previewId: input.previewId,
    proposalId: input.proposal.proposalId,
    baseRevision: input.planning.baseRevision,
    proposedSnapshotDigest: input.planning.proposedSnapshotDigest,
    transactionDigest: input.planning.transactionDigest,
    reverseTransactionDigest: input.planning.reverseTransactionDigest,
    semanticDiffDigest: input.planning.semanticDiffDigest,
    impactSetRef: input.planning.impactSetRef,
    impactDigest: input.planning.impactDigest,
    verificationPlanRef: input.planning.verificationPlanRef,
    verificationPlanDigest: input.planning.verificationPlanDigest,
    requiredCapabilities: input.planning.requiredCapabilities,
    risks: input.planning.risks,
    diagnosticRefs: input.planning.diagnosticRefs,
    expiresAt: input.planning.expiresAt,
  });
  return Object.freeze({
    ...base,
    previewDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentProposalPreview = (
  proposal: AgentActionProposal,
  planning: AgentProposalPlanningReceipt,
  value: unknown
): readonly AgentProposalIssue[] => {
  if (!isPlainObject(value)) {
    return Object.freeze([
      proposalIssue(
        'AI-5001',
        '/',
        'Agent proposal preview must be an object.'
      ),
    ]);
  }
  try {
    const expected = createAgentProposalPreview({
      previewId: value.previewId as string,
      proposal,
      planning,
    });
    return canonicalJsonText(expected) === canonicalJsonText(value)
      ? Object.freeze([])
      : Object.freeze([
          proposalIssue(
            'AI-5001',
            '/previewDigest',
            'Agent proposal preview or one of its exact planning bindings drifted.'
          ),
        ]);
  } catch (error) {
    return Object.freeze([
      proposalIssue(
        'AI-5001',
        '/',
        error instanceof Error
          ? error.message
          : 'Agent proposal preview is invalid.'
      ),
    ]);
  }
};

export const isAgentProposalPreview = (
  proposal: AgentActionProposal,
  planning: AgentProposalPlanningReceipt,
  value: unknown
): value is AgentProposalPreview =>
  validateAgentProposalPreview(proposal, planning, value).length === 0;
