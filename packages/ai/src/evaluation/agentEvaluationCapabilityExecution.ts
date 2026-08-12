import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
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
import { AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT } from './agentEvaluationAttemptAuthorityOwnerReceipt';
import { AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT } from './agentEvaluationCapabilitySpecificReceipt';

const maximumReceiptBytes = 65_536;
const maximumTurnIndex = 64;
const maximumExpectedToolIds = 32;
const maximumExpectedReceiptKinds =
  AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT;
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;

export const AGENT_EVALUATION_CAPABILITY_SUPPORT_EXPECTATIONS = Object.freeze([
  'required',
  'expected-blocked',
] as const);

export type AgentEvaluationCapabilitySupportExpectation =
  (typeof AGENT_EVALUATION_CAPABILITY_SUPPORT_EXPECTATIONS)[number];

export const AGENT_EVALUATION_CAPABILITY_EXECUTION_OUTCOMES = Object.freeze([
  'supported',
  'unsupported',
  'failed',
] as const);

export type AgentEvaluationCapabilityExecutionOutcome =
  (typeof AGENT_EVALUATION_CAPABILITY_EXECUTION_OUTCOMES)[number];

export type AgentEvaluationCapabilityExecutionVerdict = 'passed' | 'failed';

export type AgentEvaluationCapabilityDescriptor = Readonly<{
  capabilityId: string;
  supportExpectation: AgentEvaluationCapabilitySupportExpectation;
  expectedToolIds: readonly string[];
  expectedReceiptKinds: readonly string[];
  descriptorDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityDescriptorInput = Omit<
  AgentEvaluationCapabilityDescriptor,
  'descriptorDigest'
>;

export type AgentEvaluationCapabilityToolBinding = Readonly<{
  toolId: string;
  definitionDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilitySpecificReceiptDigest = Readonly<{
  receiptKind: string;
  receiptDigest: CanonicalDigest;
}>;

/**
 * Durable proof that one frozen capability expectation was exercised. The
 * receipt carries identities and digests only; provider/tool response bodies
 * remain in their owning evidence stores.
 */
export type AgentEvaluationCapabilityExecutionReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-capability-execution-receipt';
  version: 1;
  capabilityExecutionReceiptId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  caseId: string;
  caseDigest: CanonicalDigest;
  targetId: string;
  targetDigest: CanonicalDigest;
  capabilityProfileId: string;
  capabilityId: string;
  supportExpectation: AgentEvaluationCapabilitySupportExpectation;
  expectedToolIds: readonly string[];
  expectedReceiptKinds: readonly string[];
  capabilityDescriptorDigest: CanonicalDigest;
  toolBindings: readonly AgentEvaluationCapabilityToolBinding[];
  outcome: AgentEvaluationCapabilityExecutionOutcome;
  verdict: AgentEvaluationCapabilityExecutionVerdict;
  specificReceiptDigests: readonly AgentEvaluationCapabilitySpecificReceiptDigest[];
  attemptAuthorityOwnerReceiptDigests: readonly CanonicalDigest[];
  policyDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  observedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityExecutionReceiptInput = Omit<
  AgentEvaluationCapabilityExecutionReceipt,
  'format' | 'version' | 'receiptDigest'
>;

const receiptKeys = Object.freeze([
  'format',
  'version',
  'capabilityExecutionReceiptId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'caseId',
  'caseDigest',
  'targetId',
  'targetDigest',
  'capabilityProfileId',
  'capabilityId',
  'supportExpectation',
  'expectedToolIds',
  'expectedReceiptKinds',
  'capabilityDescriptorDigest',
  'toolBindings',
  'outcome',
  'verdict',
  'specificReceiptDigests',
  'attemptAuthorityOwnerReceiptDigests',
  'policyDigest',
  'toolRegistryDigest',
  'observedAt',
  'receiptDigest',
] as const);

const createInputKeys = Object.freeze(
  receiptKeys.filter(
    (key) => key !== 'format' && key !== 'version' && key !== 'receiptDigest'
  )
);

const capabilityDescriptorKeys = Object.freeze([
  'capabilityId',
  'supportExpectation',
  'expectedToolIds',
  'expectedReceiptKinds',
  'descriptorDigest',
] as const);

const capabilityDescriptorInputKeys = Object.freeze(
  capabilityDescriptorKeys.filter((key) => key !== 'descriptorDigest')
);

const hasExactDataKeys = (
  value: unknown,
  requiredKeys: readonly string[]
): value is Readonly<Record<string, unknown>> => {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === requiredKeys.length &&
    keys.every((key) => !isUnsafeObjectKey(key)) &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
};

const hasSafeExactDataKeys = (
  value: unknown,
  requiredKeys: readonly string[]
): value is Readonly<Record<string, unknown>> =>
  hasExactDataKeys(value, requiredKeys) &&
  inspectAgentControlJson(value, maximumReceiptBytes).length === 0;

const isCanonicalIdentityList = (
  value: unknown,
  maximumItems: number,
  requireItem: boolean
): value is readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length > maximumItems ||
    (requireItem && value.length === 0)
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const identity = value[index];
    if (!isAgentControlIdentity(identity)) return false;
    if (
      index > 0 &&
      compareUnicodeCodePoints(value[index - 1] as string, identity) >= 0
    ) {
      return false;
    }
  }
  return true;
};

const compareToolBindings = (
  left: AgentEvaluationCapabilityToolBinding,
  right: AgentEvaluationCapabilityToolBinding
): number =>
  compareUnicodeCodePoints(left.toolId, right.toolId) ||
  compareUnicodeCodePoints(left.definitionDigest, right.definitionDigest);

const isCanonicalToolBindings = (
  value: unknown
): value is readonly AgentEvaluationCapabilityToolBinding[] => {
  if (!Array.isArray(value) || value.length > maximumExpectedToolIds) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const binding = value[index];
    if (
      !hasExactDataKeys(binding, ['toolId', 'definitionDigest']) ||
      !isAgentControlIdentity(binding.toolId) ||
      !isAgentCanonicalDigest(binding.definitionDigest)
    ) {
      return false;
    }
    if (
      index > 0 &&
      compareToolBindings(
        value[index - 1] as AgentEvaluationCapabilityToolBinding,
        binding as AgentEvaluationCapabilityToolBinding
      ) >= 0
    ) {
      return false;
    }
    if (
      index > 0 &&
      (value[index - 1] as AgentEvaluationCapabilityToolBinding).toolId ===
        binding.toolId
    ) {
      return false;
    }
  }
  return true;
};

const compareSpecificReceiptDigests = (
  left: AgentEvaluationCapabilitySpecificReceiptDigest,
  right: AgentEvaluationCapabilitySpecificReceiptDigest
): number =>
  compareUnicodeCodePoints(left.receiptKind, right.receiptKind) ||
  compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest);

const isCanonicalSpecificReceiptDigests = (
  value: unknown
): value is readonly AgentEvaluationCapabilitySpecificReceiptDigest[] => {
  if (!Array.isArray(value) || value.length > maximumExpectedReceiptKinds) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const receipt = value[index];
    if (
      !hasExactDataKeys(receipt, ['receiptKind', 'receiptDigest']) ||
      !isAgentControlIdentity(receipt.receiptKind) ||
      !isAgentCanonicalDigest(receipt.receiptDigest)
    ) {
      return false;
    }
    if (
      index > 0 &&
      compareSpecificReceiptDigests(
        value[index - 1] as AgentEvaluationCapabilitySpecificReceiptDigest,
        receipt as AgentEvaluationCapabilitySpecificReceiptDigest
      ) >= 0
    ) {
      return false;
    }
    if (
      index > 0 &&
      (value[index - 1] as AgentEvaluationCapabilitySpecificReceiptDigest)
        .receiptKind === receipt.receiptKind
    ) {
      return false;
    }
  }
  return true;
};

const isCanonicalDigestList = (
  value: unknown
): value is readonly CanonicalDigest[] =>
  Array.isArray(value) &&
  value.length <=
    AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT &&
  value.every(isAgentCanonicalDigest) &&
  new Set(value).size === value.length &&
  value.every(
    (digest, index) =>
      index === 0 || compareUnicodeCodePoints(value[index - 1]!, digest) < 0
  );

const hasExactIdentitySet = (
  expected: readonly string[],
  observed: readonly string[]
): boolean =>
  expected.length === observed.length &&
  expected.every((identity, index) => identity === observed[index]);

const isIdentitySubset = (
  expected: readonly string[],
  observed: readonly string[]
): boolean => {
  const allowed = new Set(expected);
  return observed.every((identity) => allowed.has(identity));
};

const expectedBlockedEvidenceKinds = new Set([
  'authority-denial-receipt',
  'capability-unavailable-receipt',
]);

const verdictFor = (
  supportExpectation: AgentEvaluationCapabilitySupportExpectation,
  outcome: AgentEvaluationCapabilityExecutionOutcome
): AgentEvaluationCapabilityExecutionVerdict =>
  (supportExpectation === 'required' && outcome === 'supported') ||
  (supportExpectation === 'expected-blocked' && outcome === 'unsupported')
    ? 'passed'
    : 'failed';

const hasValidExecutionSemantics = (
  receipt: AgentEvaluationCapabilityExecutionReceipt
): boolean => {
  const toolIds = receipt.toolBindings.map(({ toolId }) => toolId);
  const receiptKinds = receipt.specificReceiptDigests.map(
    ({ receiptKind }) => receiptKind
  );
  if (
    !isIdentitySubset(receipt.expectedToolIds, toolIds) ||
    !isIdentitySubset(receipt.expectedReceiptKinds, receiptKinds)
  ) {
    return false;
  }
  if (receipt.outcome === 'unsupported' && receipt.toolBindings.length !== 0) {
    return false;
  }
  if (
    receipt.outcome === 'supported' &&
    (!hasExactIdentitySet(receipt.expectedToolIds, toolIds) ||
      !hasExactIdentitySet(receipt.expectedReceiptKinds, receiptKinds))
  ) {
    return false;
  }
  if (
    receipt.verdict === 'passed' &&
    !hasExactIdentitySet(receipt.expectedReceiptKinds, receiptKinds)
  ) {
    return false;
  }
  if (
    receipt.verdict === 'passed' &&
    receipt.supportExpectation === 'expected-blocked' &&
    receipt.outcome === 'unsupported' &&
    !receiptKinds.some((receiptKind) =>
      expectedBlockedEvidenceKinds.has(receiptKind)
    )
  ) {
    return false;
  }
  return (
    receipt.verdict === verdictFor(receipt.supportExpectation, receipt.outcome)
  );
};

/** Recomputes the exact corpus descriptor projection bound by this receipt. */
export const digestAgentEvaluationCapabilityDescriptor = (input: {
  capabilityId: string;
  supportExpectation: AgentEvaluationCapabilitySupportExpectation;
  expectedToolIds: readonly string[];
  expectedReceiptKinds: readonly string[];
}): CanonicalDigest =>
  digestAgentCanonicalValue({
    capabilityId: input.capabilityId,
    support: input.supportExpectation,
    toolIds: input.expectedToolIds,
    expectedReceiptKinds: input.expectedReceiptKinds,
  });

export const isAgentEvaluationCapabilityExecutionReceipt = (
  value: unknown
): value is AgentEvaluationCapabilityExecutionReceipt => {
  try {
    if (!hasSafeExactDataKeys(value, receiptKeys)) return false;
    const receipt = value as AgentEvaluationCapabilityExecutionReceipt;
    if (
      receipt.format !==
        'prodivix.agent-evaluation-capability-execution-receipt' ||
      receipt.version !== 1 ||
      !isAgentControlIdentity(receipt.capabilityExecutionReceiptId) ||
      !isAgentCanonicalDigest(receipt.planDigest) ||
      !repositoryCommitPattern.test(receipt.repositoryCommit) ||
      !isAgentControlIdentity(receipt.attemptId) ||
      !isAgentCanonicalDigest(receipt.descriptorDigest) ||
      !Number.isSafeInteger(receipt.turnIndex) ||
      receipt.turnIndex < 0 ||
      receipt.turnIndex > maximumTurnIndex ||
      !isAgentControlIdentity(receipt.invocationId) ||
      !isAgentControlIdentity(receipt.caseId) ||
      !isAgentCanonicalDigest(receipt.caseDigest) ||
      !isAgentControlIdentity(receipt.targetId) ||
      !isAgentCanonicalDigest(receipt.targetDigest) ||
      !isAgentControlIdentity(receipt.capabilityProfileId) ||
      !isAgentControlIdentity(receipt.capabilityId) ||
      !AGENT_EVALUATION_CAPABILITY_SUPPORT_EXPECTATIONS.includes(
        receipt.supportExpectation
      ) ||
      !isCanonicalIdentityList(
        receipt.expectedToolIds,
        maximumExpectedToolIds,
        false
      ) ||
      !isCanonicalIdentityList(
        receipt.expectedReceiptKinds,
        maximumExpectedReceiptKinds,
        true
      ) ||
      !isAgentCanonicalDigest(receipt.capabilityDescriptorDigest) ||
      receipt.capabilityDescriptorDigest !==
        digestAgentEvaluationCapabilityDescriptor(receipt) ||
      !isCanonicalToolBindings(receipt.toolBindings) ||
      !AGENT_EVALUATION_CAPABILITY_EXECUTION_OUTCOMES.includes(
        receipt.outcome
      ) ||
      (receipt.verdict !== 'passed' && receipt.verdict !== 'failed') ||
      !isCanonicalSpecificReceiptDigests(receipt.specificReceiptDigests) ||
      !isCanonicalDigestList(receipt.attemptAuthorityOwnerReceiptDigests) ||
      ((receipt.outcome === 'supported' || receipt.outcome === 'unsupported') &&
        receipt.attemptAuthorityOwnerReceiptDigests.length === 0) ||
      (receipt.specificReceiptDigests.length > 0 &&
        receipt.attemptAuthorityOwnerReceiptDigests.length === 0) ||
      !isAgentCanonicalDigest(receipt.policyDigest) ||
      !isAgentCanonicalDigest(receipt.toolRegistryDigest) ||
      !isAgentControlInstant(receipt.observedAt) ||
      !isAgentCanonicalDigest(receipt.receiptDigest) ||
      !hasValidExecutionSemantics(receipt)
    ) {
      return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return receipt.receiptDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

const canonicalizeIdentities = (value: readonly string[]): readonly string[] =>
  Object.freeze([...value].sort(compareUnicodeCodePoints));

export const isAgentEvaluationCapabilityDescriptor = (
  value: unknown
): value is AgentEvaluationCapabilityDescriptor => {
  try {
    if (!hasSafeExactDataKeys(value, capabilityDescriptorKeys)) return false;
    const descriptor = value as AgentEvaluationCapabilityDescriptor;
    return (
      isAgentControlIdentity(descriptor.capabilityId) &&
      AGENT_EVALUATION_CAPABILITY_SUPPORT_EXPECTATIONS.includes(
        descriptor.supportExpectation
      ) &&
      isCanonicalIdentityList(
        descriptor.expectedToolIds,
        maximumExpectedToolIds,
        false
      ) &&
      isCanonicalIdentityList(
        descriptor.expectedReceiptKinds,
        maximumExpectedReceiptKinds,
        true
      ) &&
      isAgentCanonicalDigest(descriptor.descriptorDigest) &&
      descriptor.descriptorDigest ===
        digestAgentEvaluationCapabilityDescriptor(descriptor)
    );
  } catch {
    return false;
  }
};

export const createAgentEvaluationCapabilityDescriptor = (
  input: CreateAgentEvaluationCapabilityDescriptorInput
): AgentEvaluationCapabilityDescriptor => {
  if (!hasSafeExactDataKeys(input, capabilityDescriptorInputKeys)) {
    throw new TypeError('Evaluation capability descriptor input is invalid.');
  }
  const base = Object.freeze({
    capabilityId: input.capabilityId,
    supportExpectation: input.supportExpectation,
    expectedToolIds: canonicalizeIdentities(input.expectedToolIds),
    expectedReceiptKinds: canonicalizeIdentities(input.expectedReceiptKinds),
  });
  const descriptor = Object.freeze({
    ...base,
    descriptorDigest: digestAgentEvaluationCapabilityDescriptor(base),
  });
  if (!isAgentEvaluationCapabilityDescriptor(descriptor)) {
    throw new TypeError('Evaluation capability descriptor is invalid.');
  }
  return descriptor;
};

const canonicalizeToolBindings = (
  value: readonly AgentEvaluationCapabilityToolBinding[]
): readonly AgentEvaluationCapabilityToolBinding[] =>
  Object.freeze(
    [...value]
      .map((binding) => Object.freeze({ ...binding }))
      .sort(compareToolBindings)
  );

const canonicalizeSpecificReceiptDigests = (
  value: readonly AgentEvaluationCapabilitySpecificReceiptDigest[]
): readonly AgentEvaluationCapabilitySpecificReceiptDigest[] =>
  Object.freeze(
    [...value]
      .map((receipt) => Object.freeze({ ...receipt }))
      .sort(compareSpecificReceiptDigests)
  );

export const createAgentEvaluationCapabilityExecutionReceipt = (
  input: CreateAgentEvaluationCapabilityExecutionReceiptInput
): AgentEvaluationCapabilityExecutionReceipt => {
  if (!hasSafeExactDataKeys(input, createInputKeys)) {
    throw new TypeError('Evaluation capability execution input is invalid.');
  }
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-capability-execution-receipt' as const,
    version: 1 as const,
    ...input,
    expectedToolIds: canonicalizeIdentities(input.expectedToolIds),
    expectedReceiptKinds: canonicalizeIdentities(input.expectedReceiptKinds),
    toolBindings: canonicalizeToolBindings(input.toolBindings),
    specificReceiptDigests: canonicalizeSpecificReceiptDigests(
      input.specificReceiptDigests
    ),
    attemptAuthorityOwnerReceiptDigests: Object.freeze(
      [...input.attemptAuthorityOwnerReceiptDigests].sort(
        compareUnicodeCodePoints
      )
    ),
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationCapabilityExecutionReceipt(receipt)) {
    throw new TypeError('Evaluation capability execution receipt is invalid.');
  }
  return receipt;
};

export const canonicalAgentEvaluationCapabilityExecutionReceiptOrder = (
  receipts: readonly AgentEvaluationCapabilityExecutionReceipt[]
): readonly AgentEvaluationCapabilityExecutionReceipt[] =>
  Object.freeze(
    [...receipts].sort(
      (left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId) ||
        left.turnIndex - right.turnIndex ||
        compareUnicodeCodePoints(
          left.capabilityExecutionReceiptId,
          right.capabilityExecutionReceiptId
        )
    )
  );

/** Canonical commitment to every frozen capability exercise in an evaluation. */
export const digestAgentEvaluationCapabilityExecutionReceiptSet = (
  receipts: readonly AgentEvaluationCapabilityExecutionReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue(
    canonicalAgentEvaluationCapabilityExecutionReceiptOrder(receipts).map(
      ({ receiptDigest }) => receiptDigest
    )
  );
