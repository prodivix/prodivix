import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentActionProposal,
  AgentProposedAction,
  AgentVerificationRequirement,
} from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  compareAgentCanonicalText,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentWorkspaceRevisionVector,
} from '../domain/agentCanonical';
import {
  cloneAgentControlJson,
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  isAgentControlIdentity,
} from '../control/agentControlValidation';
import {
  proposalIssue,
  validateAgentProposedActionAdmission,
} from './agentActionRegistry';
import type {
  AgentActionRegistrySnapshot,
  AgentProposalIssue,
} from './agentProposal.types';

const maximumActions = 64;
const maximumTextBytes = 16_384;
const maximumAssumptions = 64;
const maximumModelInvocationRefs = 64;

const textByteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

const isBoundedText = (value: unknown, allowEmpty = false): value is string =>
  typeof value === 'string' &&
  value === value.trim() &&
  (allowEmpty || value.length > 0) &&
  textByteLength(value) <= maximumTextBytes &&
  !containsAgentControlCredentialLikeText(value);

const canonicalTextList = (
  values: readonly string[],
  maximum: number
): readonly string[] => {
  if (
    values.length > maximum ||
    values.some((value) => !isBoundedText(value))
  ) {
    throw new TypeError('Agent proposal text list is invalid.');
  }
  return Object.freeze([...new Set(values)].sort(compareAgentCanonicalText));
};

const canonicalVerification = (
  verification: AgentVerificationRequirement
): AgentVerificationRequirement => {
  if (
    !hasExactAgentControlKeys(verification, [
      'policyRef',
      'requiredCheckKinds',
    ]) ||
    !isAgentControlIdentity(verification.policyRef) ||
    !Array.isArray(verification.requiredCheckKinds)
  ) {
    throw new TypeError('Agent proposal verification requirement is invalid.');
  }
  const requiredCheckKinds = canonicalTextList(
    verification.requiredCheckKinds,
    128
  );
  if (requiredCheckKinds.length === 0) {
    throw new TypeError(
      'Agent proposal requires at least one Verification check kind.'
    );
  }
  return Object.freeze({
    policyRef: verification.policyRef,
    requiredCheckKinds,
  });
};

const canonicalAction = (action: AgentProposedAction): AgentProposedAction =>
  Object.freeze({
    ownerId: action.ownerId,
    actionType: action.actionType,
    inputSchemaId: action.inputSchemaId,
    target: Object.freeze({ kind: action.target.kind, id: action.target.id }),
    input: cloneAgentControlJson(action.input),
  });

const compareActions = (
  left: AgentProposedAction,
  right: AgentProposedAction
): number =>
  compareAgentCanonicalText(left.ownerId, right.ownerId) ||
  compareAgentCanonicalText(left.actionType, right.actionType) ||
  compareAgentCanonicalText(left.inputSchemaId, right.inputSchemaId) ||
  compareAgentCanonicalText(left.target.kind, right.target.kind) ||
  compareAgentCanonicalText(left.target.id, right.target.id) ||
  compareAgentCanonicalText(
    digestAgentCanonicalValue(left.input),
    digestAgentCanonicalValue(right.input)
  );

const canonicalActions = (
  registry: AgentActionRegistrySnapshot,
  actions: readonly AgentProposedAction[]
): readonly AgentProposedAction[] => {
  if (actions.length === 0 || actions.length > maximumActions) {
    throw new TypeError('Agent proposal action count is invalid.');
  }
  const normalized = actions.map(canonicalAction).sort(compareActions);
  const issues = normalized.flatMap((action, index) =>
    validateAgentProposedActionAdmission(registry, action, `/actions/${index}`)
  );
  if (issues.length > 0) {
    throw new TypeError(issues.map(({ message }) => message).join(' '));
  }
  const identities = normalized.map(
    (action) =>
      `${action.ownerId}\u0000${action.actionType}\u0000${action.inputSchemaId}\u0000${action.target.kind}\u0000${action.target.id}`
  );
  if (new Set(identities).size !== identities.length) {
    throw new TypeError(
      'Agent proposal cannot contain duplicate domain action targets.'
    );
  }
  return Object.freeze(normalized);
};

export const validateAgentActionProposal = (
  registry: AgentActionRegistrySnapshot,
  value: unknown
): readonly AgentProposalIssue[] => {
  const issues: AgentProposalIssue[] = [];
  if (
    !hasExactAgentControlKeys(value, [
      'proposalId',
      'taskId',
      'runId',
      'baseRevision',
      'contextPackDigest',
      'actions',
      'explanation',
      'assumptions',
      'requestedVerification',
      'modelInvocationRefs',
      'proposalDigest',
    ])
  ) {
    return Object.freeze([
      proposalIssue(
        'AI-5001',
        '/',
        'Agent proposal has missing or unknown fields.'
      ),
    ]);
  }
  for (const field of ['proposalId', 'taskId', 'runId'] as const) {
    if (!isAgentControlIdentity(value[field])) {
      issues.push(
        proposalIssue(
          'AI-5001',
          `/${field}`,
          `Agent proposal ${field} is invalid.`
        )
      );
    }
  }
  if (!isAgentWorkspaceRevisionVector(value.baseRevision)) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/baseRevision',
        'Agent proposal base revision is invalid.'
      )
    );
  }
  if (!isAgentCanonicalDigest(value.contextPackDigest)) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/contextPackDigest',
        'Agent proposal Context Pack digest is invalid.'
      )
    );
  }
  if (!isBoundedText(value.explanation)) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/explanation',
        'Agent proposal explanation is invalid or unbounded.'
      )
    );
  }
  if (
    !Array.isArray(value.assumptions) ||
    value.assumptions.length > maximumAssumptions ||
    value.assumptions.some((entry) => !isBoundedText(entry))
  ) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/assumptions',
        'Agent proposal assumptions are invalid or unbounded.'
      )
    );
  }
  if (
    !Array.isArray(value.modelInvocationRefs) ||
    value.modelInvocationRefs.length === 0 ||
    value.modelInvocationRefs.length > maximumModelInvocationRefs ||
    value.modelInvocationRefs.some(
      (reference) => !isAgentControlIdentity(reference)
    ) ||
    new Set(value.modelInvocationRefs).size !== value.modelInvocationRefs.length
  ) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/modelInvocationRefs',
        'Agent proposal must bind unique model invocation identities.'
      )
    );
  }
  try {
    canonicalVerification(
      value.requestedVerification as AgentVerificationRequirement
    );
  } catch (error) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/requestedVerification',
        error instanceof Error
          ? error.message
          : 'Agent proposal verification request is invalid.'
      )
    );
  }
  if (
    !Array.isArray(value.actions) ||
    value.actions.length === 0 ||
    value.actions.length > maximumActions
  ) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/actions',
        'Agent proposal action count is invalid.'
      )
    );
  } else {
    value.actions.forEach((candidate, index) => {
      const path = `/actions/${index}`;
      if (
        !hasExactAgentControlKeys(candidate, [
          'ownerId',
          'actionType',
          'inputSchemaId',
          'target',
          'input',
        ]) ||
        !hasExactAgentControlKeys(candidate.target, ['kind', 'id']) ||
        !isPlainObject(candidate)
      ) {
        issues.push(
          proposalIssue(
            'AI-5001',
            path,
            'Agent proposed action has missing or unknown fields.'
          )
        );
        return;
      }
      issues.push(
        ...validateAgentProposedActionAdmission(
          registry,
          candidate as AgentProposedAction,
          path
        )
      );
    });
  }
  if (!isAgentCanonicalDigest(value.proposalDigest)) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/proposalDigest',
        'Agent proposal digest is invalid.'
      )
    );
  }
  return Object.freeze(issues);
};

export const createAgentActionProposal = (
  registry: AgentActionRegistrySnapshot,
  input: Omit<AgentActionProposal, 'proposalDigest'>
): AgentActionProposal => {
  const base = Object.freeze({
    proposalId: input.proposalId,
    taskId: input.taskId,
    runId: input.runId,
    baseRevision: canonicalizeAgentWorkspaceRevision(input.baseRevision),
    contextPackDigest: input.contextPackDigest,
    actions: canonicalActions(registry, input.actions),
    explanation: input.explanation,
    assumptions: canonicalTextList(input.assumptions, maximumAssumptions),
    requestedVerification: canonicalVerification(input.requestedVerification),
    modelInvocationRefs: canonicalTextList(
      input.modelInvocationRefs,
      maximumModelInvocationRefs
    ),
  });
  const proposal = Object.freeze({
    ...base,
    proposalDigest: digestAgentCanonicalValue(base),
  });
  const issues = validateAgentActionProposal(registry, proposal);
  if (issues.length > 0) {
    throw new TypeError(issues.map(({ message }) => message).join(' '));
  }
  return proposal;
};

export const isAgentActionProposal = (
  registry: AgentActionRegistrySnapshot,
  value: unknown
): value is AgentActionProposal => {
  if (validateAgentActionProposal(registry, value).length > 0) return false;
  try {
    const proposal = value as AgentActionProposal;
    return (
      canonicalJsonText(
        createAgentActionProposal(registry, {
          proposalId: proposal.proposalId,
          taskId: proposal.taskId,
          runId: proposal.runId,
          baseRevision: proposal.baseRevision,
          contextPackDigest: proposal.contextPackDigest,
          actions: proposal.actions,
          explanation: proposal.explanation,
          assumptions: proposal.assumptions,
          requestedVerification: proposal.requestedVerification,
          modelInvocationRefs: proposal.modelInvocationRefs,
        })
      ) === canonicalJsonText(value)
    );
  } catch {
    return false;
  }
};
