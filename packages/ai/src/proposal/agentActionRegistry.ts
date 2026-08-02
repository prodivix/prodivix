import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentCapability,
  AgentProposedAction,
  AgentRisk,
  AgentTargetRef,
} from '../domain/agent.types';
import {
  compareAgentCanonicalText,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  containsAgentControlCredentialLikeText,
  inspectAgentControlJson,
  isAgentControlIdentity,
} from '../control/agentControlValidation';
import type {
  AgentActionDescriptor,
  AgentActionRegistrySnapshot,
  AgentProposalIssue,
  AgentProposalIssueCode,
} from './agentProposal.types';

const capabilities = new Set<AgentCapability>([
  'read',
  'execute',
  'propose',
  'approve',
  'commit',
  'rollback',
]);
const targetKinds = new Set<AgentTargetRef['kind']>([
  'workspace',
  'document',
  'semantic-target',
]);
const riskLevels = new Set<AgentRisk['level']>([
  'low',
  'medium',
  'high',
  'critical',
]);
const forbiddenAuthorityKey =
  /^(?:patch|patches|jsonPatch|command|commands|transaction|workspaceOperation|approval|approved|credential|credentials|secret|secrets|token|tokens|cookie|authorization|forwardOps|reverseOps)$/iu;

export const proposalIssue = (
  code: AgentProposalIssueCode,
  path: string,
  message: string
): AgentProposalIssue => Object.freeze({ code, path, message, blocking: true });

const uniqueCanonical = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values)].sort(compareAgentCanonicalText));

const canonicalRisk = (risk: AgentRisk): AgentRisk =>
  Object.freeze({ id: risk.id, level: risk.level, message: risk.message });

const inspectAuthorityKeys = (
  value: unknown,
  path = '/input'
): readonly AgentProposalIssue[] => {
  const issues: AgentProposalIssue[] = [];
  const inputEnvelopePath = path;
  const visit = (candidate: unknown, currentPath: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) =>
        visit(entry, `${currentPath}/${index}`)
      );
      return;
    }
    if (!isPlainObject(candidate)) return;
    for (const [key, entry] of Object.entries(candidate)) {
      const child = `${currentPath}/${key
        .replaceAll('~', '~0')
        .replaceAll('/', '~1')}`;
      // Typed domain documents legitimately contain names such as `token`,
      // `authorization`, or `patch`. Only the action envelope may attempt to
      // smuggle write authority; nested content remains subject to its domain
      // decoder while credential-like string values are still scanned below.
      if (
        currentPath === inputEnvelopePath &&
        forbiddenAuthorityKey.test(key)
      ) {
        issues.push(
          proposalIssue(
            key.toLowerCase().includes('approval')
              ? 'AI-7005'
              : key.toLowerCase().includes('secret') ||
                  key.toLowerCase().includes('credential') ||
                  key.toLowerCase().includes('token') ||
                  key.toLowerCase().includes('cookie') ||
                  key.toLowerCase().includes('authorization')
                ? 'AI-5003'
                : 'AI-5001',
            child,
            'Agent action input cannot carry write authority, approval assertions, credentials, or generic patches.'
          )
        );
      }
      if (
        typeof entry === 'string' &&
        containsAgentControlCredentialLikeText(entry)
      ) {
        issues.push(
          proposalIssue(
            'AI-5003',
            child,
            'Agent action input contains credential-like text.'
          )
        );
      }
      visit(entry, child);
    }
  };
  visit(value, path);
  return Object.freeze(issues);
};

export const createAgentActionDescriptor = (
  input: Omit<AgentActionDescriptor, 'descriptorDigest'>
): AgentActionDescriptor => {
  const requiredCapabilities = uniqueCanonical(input.requiredCapabilities);
  const allowedTargetKinds = uniqueCanonical(input.allowedTargetKinds);
  const risk = canonicalRisk(input.risk);
  if (
    !isAgentControlIdentity(input.descriptorId) ||
    !isAgentControlIdentity(input.ownerId) ||
    !isAgentControlIdentity(input.actionType) ||
    !isAgentControlIdentity(input.inputSchemaId) ||
    requiredCapabilities.length === 0 ||
    requiredCapabilities.some(
      (capability) => !capabilities.has(capability as AgentCapability)
    ) ||
    allowedTargetKinds.length === 0 ||
    allowedTargetKinds.some(
      (kind) => !targetKinds.has(kind as AgentTargetRef['kind'])
    ) ||
    !Number.isSafeInteger(input.maximumInputBytes) ||
    input.maximumInputBytes < 1 ||
    input.maximumInputBytes > 1_048_576 ||
    !isAgentControlIdentity(risk.id) ||
    !riskLevels.has(risk.level) ||
    !risk.message.trim() ||
    risk.message.length > 4_096 ||
    containsAgentControlCredentialLikeText(risk.message)
  ) {
    throw new TypeError('Agent action descriptor is invalid.');
  }
  const base = Object.freeze({
    descriptorId: input.descriptorId,
    ownerId: input.ownerId,
    actionType: input.actionType,
    inputSchemaId: input.inputSchemaId,
    requiredCapabilities: requiredCapabilities as readonly AgentCapability[],
    allowedTargetKinds: allowedTargetKinds as readonly AgentTargetRef['kind'][],
    maximumInputBytes: input.maximumInputBytes,
    risk,
  });
  return Object.freeze({
    ...base,
    descriptorDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentActionDescriptor = (
  value: unknown
): value is AgentActionDescriptor => {
  if (!isPlainObject(value) || !isAgentCanonicalDigest(value.descriptorDigest))
    return false;
  try {
    const canonical = createAgentActionDescriptor({
      descriptorId: value.descriptorId as string,
      ownerId: value.ownerId as string,
      actionType: value.actionType as string,
      inputSchemaId: value.inputSchemaId as string,
      requiredCapabilities: value.requiredCapabilities as AgentCapability[],
      allowedTargetKinds: value.allowedTargetKinds as AgentTargetRef['kind'][],
      maximumInputBytes: value.maximumInputBytes as number,
      risk: value.risk as AgentRisk,
    });
    return canonicalJsonText(canonical) === canonicalJsonText(value);
  } catch {
    return false;
  }
};

export const createAgentActionRegistrySnapshot = (
  registryId: string,
  input: readonly AgentActionDescriptor[]
): AgentActionRegistrySnapshot => {
  if (!isAgentControlIdentity(registryId)) {
    throw new TypeError('Agent action registry id is invalid.');
  }
  const descriptors = [...input].sort(
    (left, right) =>
      compareAgentCanonicalText(left.ownerId, right.ownerId) ||
      compareAgentCanonicalText(left.actionType, right.actionType) ||
      compareAgentCanonicalText(left.inputSchemaId, right.inputSchemaId) ||
      compareAgentCanonicalText(left.descriptorId, right.descriptorId)
  );
  if (
    descriptors.length === 0 ||
    descriptors.length > 256 ||
    descriptors.some((descriptor) => !isAgentActionDescriptor(descriptor)) ||
    new Set(descriptors.map(({ descriptorId }) => descriptorId)).size !==
      descriptors.length ||
    new Set(
      descriptors.map(
        ({ ownerId, actionType, inputSchemaId }) =>
          `${ownerId}\u0000${actionType}\u0000${inputSchemaId}`
      )
    ).size !== descriptors.length
  ) {
    throw new TypeError(
      'Agent action registry descriptors must be valid and unique.'
    );
  }
  const base = Object.freeze({
    registryId,
    descriptors: Object.freeze(descriptors),
  });
  return Object.freeze({
    ...base,
    registryDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentActionRegistrySnapshot = (
  value: unknown
): value is AgentActionRegistrySnapshot => {
  if (!isPlainObject(value) || !Array.isArray(value.descriptors)) return false;
  try {
    return (
      canonicalJsonText(
        createAgentActionRegistrySnapshot(
          value.registryId as string,
          value.descriptors as AgentActionDescriptor[]
        )
      ) === canonicalJsonText(value)
    );
  } catch {
    return false;
  }
};

export const resolveAgentActionDescriptor = (
  registry: AgentActionRegistrySnapshot,
  action: Pick<AgentProposedAction, 'ownerId' | 'actionType' | 'inputSchemaId'>
): AgentActionDescriptor | undefined =>
  registry.descriptors.find(
    (descriptor) =>
      descriptor.ownerId === action.ownerId &&
      descriptor.actionType === action.actionType &&
      descriptor.inputSchemaId === action.inputSchemaId
  );

export const validateAgentProposedActionAdmission = (
  registry: AgentActionRegistrySnapshot,
  action: AgentProposedAction,
  path: string
): readonly AgentProposalIssue[] => {
  const issues: AgentProposalIssue[] = [];
  const descriptor = resolveAgentActionDescriptor(registry, action);
  if (!descriptor) {
    issues.push(
      proposalIssue(
        'AI-5005',
        path,
        'Agent action owner, action type, or schema is not registered.'
      )
    );
    return Object.freeze(issues);
  }
  if (
    !isAgentControlIdentity(action.target.id) ||
    !targetKinds.has(action.target.kind) ||
    !descriptor.allowedTargetKinds.includes(action.target.kind)
  ) {
    issues.push(
      proposalIssue(
        'AI-5002',
        `${path}/target`,
        'Agent action target is invalid or unsupported by its domain descriptor.'
      )
    );
  }
  issues.push(
    ...inspectAgentControlJson(action.input, descriptor.maximumInputBytes).map(
      (issue) =>
        proposalIssue(
          'AI-5001',
          `${path}/input${issue.path === '/' ? '' : issue.path}`,
          issue.message
        )
    ),
    ...inspectAuthorityKeys(action.input, `${path}/input`)
  );
  return Object.freeze(issues);
};
