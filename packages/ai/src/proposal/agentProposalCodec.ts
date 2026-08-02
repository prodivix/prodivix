import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  canonicalizeAgentWorkspaceRevision,
  compareAgentCanonicalText,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentWorkspaceRevisionVector,
} from '../domain/agentCanonical';
import type {
  AgentCapability,
  AgentProposalPreview,
  AgentRisk,
} from '../domain/agent.types';
import {
  cloneAgentControlJson,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import { agentProposalFactWireSchema } from '../wire/agentProposalWire';
import { proposalIssue } from './agentActionRegistry';
import { isAgentApprovalDecision } from './agentApproval';
import { isAgentActionProposal } from './agentProposal';
import { isAgentProposalPlanningReceipt } from './agentProposalPreview';
import type {
  AgentActionRegistrySnapshot,
  AgentProposalFact,
  AgentProposalIssue,
} from './agentProposal.types';
import { isAgentWorkspaceMutationReceipt } from './agentWorkspaceMutation';

export type AgentProposalFactWire = AgentProposalFact &
  Readonly<{ wireVersion: 1 }>;

export type AgentProposalFactDecodeResult =
  | Readonly<{ ok: true; value: AgentProposalFact }>
  | Readonly<{ ok: false; issues: readonly AgentProposalIssue[] }>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateWire: ValidateFunction = ajv.compile(agentProposalFactWireSchema);
const capabilityOrder: readonly AgentCapability[] = Object.freeze([
  'read',
  'execute',
  'propose',
  'approve',
  'commit',
  'rollback',
]);
const riskRank: Readonly<Record<AgentRisk['level'], number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

const invalid = (message: string): AgentProposalFactDecodeResult =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([proposalIssue('AI-9001', '/', message)]),
  });

const canonicalCapabilities = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (entry, index) =>
      typeof entry === 'string' &&
      capabilityOrder.includes(entry as AgentCapability) &&
      (index === 0 ||
        capabilityOrder.indexOf(value[index - 1] as AgentCapability) <
          capabilityOrder.indexOf(entry as AgentCapability))
  );

const canonicalReferences = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(isAgentControlIdentity) &&
  new Set(value).size === value.length &&
  value.every(
    (entry, index) =>
      index === 0 || compareAgentCanonicalText(value[index - 1], entry) < 0
  );

const canonicalRisks = (value: unknown): value is readonly AgentRisk[] => {
  if (!Array.isArray(value) || value.length > 128) return false;
  const valid = value.every(
    (risk): risk is AgentRisk =>
      hasExactAgentControlKeys(risk, ['id', 'level', 'message']) &&
      isAgentControlIdentity(risk.id) &&
      typeof risk.level === 'string' &&
      Object.hasOwn(riskRank, risk.level) &&
      typeof risk.message === 'string' &&
      risk.message.trim() === risk.message &&
      risk.message.length > 0 &&
      risk.message.length <= 4_096
  );
  if (!valid) return false;
  const risks = value as AgentRisk[];
  return (
    new Set(risks.map(({ id }) => id)).size === risks.length &&
    risks.every((risk, index) => {
      const previous = risks[index - 1];
      return (
        index === 0 ||
        riskRank[previous!.level] > riskRank[risk.level] ||
        (riskRank[previous!.level] === riskRank[risk.level] &&
          (compareAgentCanonicalText(previous!.id, risk.id) < 0 ||
            (previous!.id === risk.id &&
              compareAgentCanonicalText(previous!.message, risk.message) < 0)))
      );
    })
  );
};

export const isAgentProposalPreviewFact = (
  value: unknown
): value is AgentProposalPreview => {
  if (
    !hasExactAgentControlKeys(value, [
      'previewId',
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
      'requiredCapabilities',
      'risks',
      'diagnosticRefs',
      'previewDigest',
      'expiresAt',
    ]) ||
    ![
      value.previewId,
      value.proposalId,
      value.impactSetRef,
      value.verificationPlanRef,
    ].every(isAgentControlIdentity) ||
    ![
      value.proposedSnapshotDigest,
      value.transactionDigest,
      value.reverseTransactionDigest,
      value.semanticDiffDigest,
      value.impactDigest,
      value.verificationPlanDigest,
      value.previewDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlInstant(value.expiresAt) ||
    !isAgentWorkspaceRevisionVector(value.baseRevision) ||
    !canonicalCapabilities(value.requiredCapabilities) ||
    !canonicalRisks(value.risks) ||
    !canonicalReferences(value.diagnosticRefs)
  ) {
    return false;
  }
  try {
    if (
      !sameCanonicalJson(
        canonicalizeAgentWorkspaceRevision(value.baseRevision),
        value.baseRevision
      )
    ) {
      return false;
    }
    const { previewDigest, ...base } = value;
    return digestAgentCanonicalValue(base) === previewDigest;
  } catch {
    return false;
  }
};

const validateFact = (
  registry: AgentActionRegistrySnapshot,
  fact: AgentProposalFact
): boolean => {
  switch (fact.factType) {
    case 'proposal':
      return isAgentActionProposal(registry, fact.value);
    case 'preview':
      return isAgentProposalPreviewFact(fact.value);
    case 'planning':
      return isAgentProposalPlanningReceipt(fact.value);
    case 'approval':
      return isAgentApprovalDecision(fact.value);
    case 'workspace-mutation-receipt':
      return isAgentWorkspaceMutationReceipt(fact.value);
  }
};

export const encodeAgentProposalFact = (
  registry: AgentActionRegistrySnapshot,
  fact: AgentProposalFact
): AgentProposalFactWire => {
  if (!validateFact(registry, fact)) {
    throw new TypeError('Agent proposal fact failed current-model validation.');
  }
  return Object.freeze({
    wireVersion: 1,
    factType: fact.factType,
    value: cloneAgentControlJson(fact.value),
  }) as AgentProposalFactWire;
};

export const decodeAgentProposalFact = (
  registry: AgentActionRegistrySnapshot,
  input: unknown
): AgentProposalFactDecodeResult => {
  const inspection = inspectAgentControlJson(input);
  if (inspection.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(
        inspection.map((issue) =>
          proposalIssue('AI-9001', issue.path, issue.message)
        )
      ),
    });
  }
  if (
    !validateWire(input) ||
    !hasExactAgentControlKeys(input, ['wireVersion', 'factType', 'value']) ||
    input.wireVersion !== 1
  ) {
    return invalid('Agent proposal wire envelope is unsupported or malformed.');
  }
  const cloned = cloneAgentControlJson(input) as AgentProposalFactWire;
  const current = Object.freeze({
    factType: cloned.factType,
    value: cloned.value,
  }) as AgentProposalFact;
  if (!validateFact(registry, current)) {
    return invalid('Agent proposal fact failed strict semantic validation.');
  }
  if (!sameCanonicalJson(encodeAgentProposalFact(registry, current), cloned)) {
    return invalid('Agent proposal fact is not in canonical current form.');
  }
  return Object.freeze({ ok: true, value: current });
};

export const serializeAgentProposalFact = (
  registry: AgentActionRegistrySnapshot,
  fact: AgentProposalFact
): string => canonicalJsonText(encodeAgentProposalFact(registry, fact));
