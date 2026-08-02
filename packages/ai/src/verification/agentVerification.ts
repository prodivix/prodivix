import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentWorkspaceRevisionVector,
} from '../domain/agentCanonical';
import {
  cloneAgentControlJson,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { AgentPrincipalRef } from '../domain/agent.types';
import type {
  AgentCommittedVerificationPlanBinding,
  AgentRepairBlockReason,
  AgentRepairRoundReceipt,
  AgentVerificationClosureReceipt,
  AgentVerificationEvidenceRef,
  AgentVerificationRunBindingRef,
  AgentVerificationRunClosureRef,
} from './agentVerification.types';

const evidenceOutcomes = new Set([
  'passed',
  'failed',
  'blocked',
  'cancelled',
  'infrastructure-error',
]);
const repairBlockReasons = new Set<AgentRepairBlockReason>([
  'repair-forbidden',
  'repair-round-exhausted',
  'budget-exhausted',
  'permission-denied',
  'regression-requirement-missing',
  'authority-drift',
]);
const verificationSurfaces = new Set(['preview', 'export', 'ci']);

const isServicePrincipal = (value: unknown): value is AgentPrincipalRef =>
  hasExactAgentControlKeys(value, ['kind', 'principalId']) &&
  value.kind === 'service' &&
  isAgentControlIdentity(value.principalId);

const canonicalDigestList = (
  values: readonly string[],
  maximum = 10_000
): readonly string[] => {
  if (
    !Array.isArray(values) ||
    values.length > maximum ||
    values.some((value) => !isAgentCanonicalDigest(value))
  ) {
    throw new TypeError('Agent verification digest list is invalid.');
  }
  const canonical = [...values].sort(compareUnicodeCodePoints);
  if (new Set(canonical).size !== canonical.length) {
    throw new TypeError('Agent verification digest list contains duplicates.');
  }
  return Object.freeze(canonical);
};

const canonicalEvidenceRefs = (
  values: readonly AgentVerificationEvidenceRef[]
): readonly AgentVerificationEvidenceRef[] => {
  if (!Array.isArray(values) || values.length > 10_000) {
    throw new TypeError('Agent verification Evidence references are invalid.');
  }
  const canonical = values.map((value) => {
    if (
      !hasExactAgentControlKeys(value, [
        'evidenceId',
        'manifestDigest',
        'outcome',
      ])
    ) {
      throw new TypeError(
        'Agent verification Evidence reference is malformed.'
      );
    }
    const entry = value as AgentVerificationEvidenceRef;
    if (
      !isAgentControlIdentity(entry.evidenceId) ||
      !isAgentCanonicalDigest(entry.manifestDigest) ||
      !evidenceOutcomes.has(entry.outcome)
    ) {
      throw new TypeError(
        'Agent verification Evidence reference is malformed.'
      );
    }
    return Object.freeze({ ...entry });
  });
  canonical.sort((left, right) =>
    compareUnicodeCodePoints(left.evidenceId, right.evidenceId)
  );
  if (
    new Set(canonical.map(({ evidenceId }) => evidenceId)).size !==
    canonical.length
  ) {
    throw new TypeError('Agent verification Evidence ids are duplicated.');
  }
  return Object.freeze(canonical);
};

const compareVerificationRunRefs = (
  left: AgentVerificationRunBindingRef,
  right: AgentVerificationRunBindingRef
): number =>
  compareUnicodeCodePoints(left.surface, right.surface) ||
  compareUnicodeCodePoints(left.verificationRunId, right.verificationRunId);

const canonicalVerificationRunBindings = (
  values: readonly AgentVerificationRunBindingRef[]
): readonly AgentVerificationRunBindingRef[] => {
  if (!Array.isArray(values) || values.length < 1 || values.length > 3) {
    throw new TypeError('Agent verification Run bindings are invalid.');
  }
  const canonical = values.map((value) => {
    if (
      !hasExactAgentControlKeys(value, [
        'verificationRunId',
        'surface',
        'selectedCellSetDigest',
      ])
    ) {
      throw new TypeError('Agent verification Run binding is malformed.');
    }
    const entry = value as AgentVerificationRunBindingRef;
    if (
      !isAgentControlIdentity(entry.verificationRunId) ||
      !verificationSurfaces.has(entry.surface) ||
      !isAgentCanonicalDigest(entry.selectedCellSetDigest)
    ) {
      throw new TypeError('Agent verification Run binding is malformed.');
    }
    return Object.freeze({ ...entry });
  });
  canonical.sort(compareVerificationRunRefs);
  if (
    new Set(canonical.map(({ verificationRunId }) => verificationRunId))
      .size !== canonical.length ||
    new Set(canonical.map(({ surface }) => surface)).size !== canonical.length
  ) {
    throw new TypeError(
      'Agent verification Run bindings duplicate a Run or surface.'
    );
  }
  return Object.freeze(canonical);
};

const canonicalVerificationRunClosures = (
  values: readonly AgentVerificationRunClosureRef[]
): readonly AgentVerificationRunClosureRef[] => {
  if (!Array.isArray(values) || values.length < 1 || values.length > 3) {
    throw new TypeError('Agent verification Run closures are invalid.');
  }
  const canonical = values.map((value) => {
    if (
      !hasExactAgentControlKeys(value, [
        'verificationRunId',
        'surface',
        'selectedCellSetDigest',
        'snapshotDigest',
      ])
    ) {
      throw new TypeError('Agent verification Run closure is malformed.');
    }
    const entry = value as AgentVerificationRunClosureRef;
    if (
      !isAgentControlIdentity(entry.verificationRunId) ||
      !verificationSurfaces.has(entry.surface) ||
      !isAgentCanonicalDigest(entry.selectedCellSetDigest) ||
      !isAgentCanonicalDigest(entry.snapshotDigest)
    ) {
      throw new TypeError('Agent verification Run closure is malformed.');
    }
    return Object.freeze({ ...entry });
  });
  canonical.sort(compareVerificationRunRefs);
  if (
    new Set(canonical.map(({ verificationRunId }) => verificationRunId))
      .size !== canonical.length ||
    new Set(canonical.map(({ surface }) => surface)).size !== canonical.length
  ) {
    throw new TypeError(
      'Agent verification Run closures duplicate a Run or surface.'
    );
  }
  return Object.freeze(canonical);
};

const bindingKeys = [
  'bindingId',
  'taskId',
  'runId',
  'proposalId',
  'previewId',
  'decisionId',
  'mutationReceiptId',
  'mutationKind',
  'verificationRuns',
  'targetRevision',
  'approvedPlanDigest',
  'actualPlanDigest',
  'planCompatibility',
  'impactDigest',
  'policyDigest',
  'approvedRequiredCellSetDigest',
  'actualRequiredCellSetDigest',
  'regressionRequirementSetDigest',
  'producer',
  'boundAt',
] as const;

export const createAgentCommittedVerificationPlanBinding = (
  input: Omit<AgentCommittedVerificationPlanBinding, 'bindingDigest'>
): AgentCommittedVerificationPlanBinding => {
  const inspection = inspectAgentControlJson(input, 1_048_576);
  if (
    inspection.length > 0 ||
    !hasExactAgentControlKeys(input, bindingKeys) ||
    ![
      input.bindingId,
      input.taskId,
      input.runId,
      input.proposalId,
      input.previewId,
      input.decisionId,
      input.mutationReceiptId,
    ].every(isAgentControlIdentity) ||
    !isAgentWorkspaceRevisionVector(input.targetRevision) ||
    ![
      input.approvedPlanDigest,
      input.actualPlanDigest,
      input.impactDigest,
      input.policyDigest,
      input.approvedRequiredCellSetDigest,
      input.actualRequiredCellSetDigest,
      input.regressionRequirementSetDigest,
    ].every(isAgentCanonicalDigest) ||
    !isServicePrincipal(input.producer) ||
    !isAgentControlInstant(input.boundAt) ||
    (input.mutationKind !== 'commit' && input.mutationKind !== 'rollback') ||
    !['exact', 'compatible', 'post-rollback'].includes(
      input.planCompatibility
    ) ||
    (input.mutationKind === 'rollback') !==
      (input.planCompatibility === 'post-rollback') ||
    (input.planCompatibility === 'exact' &&
      input.approvedPlanDigest !== input.actualPlanDigest)
  ) {
    throw new TypeError('Committed Agent VerificationPlan binding is invalid.');
  }
  const verificationRuns = canonicalVerificationRunBindings(
    input.verificationRuns
  );
  const base = Object.freeze({
    ...input,
    verificationRuns,
    targetRevision: canonicalizeAgentWorkspaceRevision(input.targetRevision),
    producer: Object.freeze({ ...input.producer }),
  });
  return Object.freeze({
    ...base,
    bindingDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentCommittedVerificationPlanBinding = (
  value: unknown
): value is AgentCommittedVerificationPlanBinding => {
  if (
    !hasExactAgentControlKeys(value, [...bindingKeys, 'bindingDigest']) ||
    !isAgentCanonicalDigest(value.bindingDigest)
  ) {
    return false;
  }
  try {
    const { bindingDigest, ...base } = value;
    return (
      createAgentCommittedVerificationPlanBinding(
        base as Omit<AgentCommittedVerificationPlanBinding, 'bindingDigest'>
      ).bindingDigest === bindingDigest
    );
  } catch {
    return false;
  }
};

const closureKeys = [
  'receiptId',
  'bindingId',
  'taskId',
  'runId',
  'verificationRuns',
  'targetRevision',
  'planDigest',
  'evidenceRefs',
  'evidenceSetDigest',
  'verifiedEvidenceViewDigest',
  'closureDigest',
  'verdict',
  'producer',
  'evaluatedAt',
] as const;

export const createAgentVerificationClosureReceipt = (
  input: Omit<AgentVerificationClosureReceipt, 'receiptDigest'>
): AgentVerificationClosureReceipt => {
  const inspection = inspectAgentControlJson(input, 8_388_608);
  if (
    inspection.length > 0 ||
    !hasExactAgentControlKeys(input, closureKeys) ||
    ![input.receiptId, input.bindingId, input.taskId, input.runId].every(
      isAgentControlIdentity
    ) ||
    !isAgentWorkspaceRevisionVector(input.targetRevision) ||
    ![
      input.planDigest,
      input.evidenceSetDigest,
      input.verifiedEvidenceViewDigest,
      input.closureDigest,
    ].every(isAgentCanonicalDigest) ||
    !['satisfied', 'unsatisfied', 'stale'].includes(input.verdict) ||
    !isServicePrincipal(input.producer) ||
    !isAgentControlInstant(input.evaluatedAt)
  ) {
    throw new TypeError('Agent Verification Closure receipt is invalid.');
  }
  const evidenceRefs = canonicalEvidenceRefs(input.evidenceRefs);
  const verificationRuns = canonicalVerificationRunClosures(
    input.verificationRuns
  );
  if (input.verdict === 'satisfied' && evidenceRefs.length === 0) {
    throw new TypeError('Satisfied Closure must reference promoted Evidence.');
  }
  const base = Object.freeze({
    ...input,
    verificationRuns,
    targetRevision: canonicalizeAgentWorkspaceRevision(input.targetRevision),
    evidenceRefs,
    producer: Object.freeze({ ...input.producer }),
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentVerificationClosureReceipt = (
  value: unknown
): value is AgentVerificationClosureReceipt => {
  if (
    !hasExactAgentControlKeys(value, [...closureKeys, 'receiptDigest']) ||
    !isAgentCanonicalDigest(value.receiptDigest)
  ) {
    return false;
  }
  try {
    const { receiptDigest, ...base } = value;
    return (
      createAgentVerificationClosureReceipt(
        base as Omit<AgentVerificationClosureReceipt, 'receiptDigest'>
      ).receiptDigest === receiptDigest
    );
  } catch {
    return false;
  }
};

const repairBaseKeys = [
  'receiptId',
  'repairRoundId',
  'state',
  'taskId',
  'runId',
  'round',
  'failedClosureReceiptId',
  'failedClosureDigest',
  'failedEvidenceManifestDigests',
  'failureContextPackDigest',
  'counterexampleSetDigest',
  'regressionRequirementSetDigest',
  'cumulativeBudgetLedgerDigest',
  'producer',
  'recordedAt',
] as const;

type RepairReceiptInput =
  | Omit<
      Extract<AgentRepairRoundReceipt, { state: 'started' }>,
      'receiptDigest'
    >
  | Omit<
      Extract<AgentRepairRoundReceipt, { state: 'proposal-bound' }>,
      'receiptDigest'
    >
  | Omit<
      Extract<AgentRepairRoundReceipt, { state: 'blocked' }>,
      'receiptDigest'
    >;

export const createAgentRepairRoundReceipt = (
  input: RepairReceiptInput
): AgentRepairRoundReceipt => {
  const stateKeys =
    input.state === 'proposal-bound'
      ? ([
          ...repairBaseKeys,
          'proposalId',
          'previewId',
          'decisionId',
          'transactionDigest',
          'verificationPlanDigest',
        ] as const)
      : input.state === 'blocked'
        ? ([...repairBaseKeys, 'blockReason'] as const)
        : repairBaseKeys;
  const inspection = inspectAgentControlJson(input, 2_097_152);
  if (
    inspection.length > 0 ||
    !hasExactAgentControlKeys(input, stateKeys) ||
    ![
      input.receiptId,
      input.repairRoundId,
      input.taskId,
      input.runId,
      input.failedClosureReceiptId,
    ].every(isAgentControlIdentity) ||
    !Number.isSafeInteger(input.round) ||
    input.round < 1 ||
    input.round > 1_000 ||
    ![
      input.failedClosureDigest,
      input.failureContextPackDigest,
      input.counterexampleSetDigest,
      input.regressionRequirementSetDigest,
      input.cumulativeBudgetLedgerDigest,
    ].every(isAgentCanonicalDigest) ||
    !isServicePrincipal(input.producer) ||
    !isAgentControlInstant(input.recordedAt)
  ) {
    throw new TypeError('Agent repair round receipt is invalid.');
  }
  const failedEvidenceManifestDigests = canonicalDigestList(
    input.failedEvidenceManifestDigests
  );
  if (input.state === 'proposal-bound') {
    if (
      ![input.proposalId, input.previewId, input.decisionId].every(
        isAgentControlIdentity
      ) ||
      ![input.transactionDigest, input.verificationPlanDigest].every(
        isAgentCanonicalDigest
      )
    ) {
      throw new TypeError('Agent repair proposal binding is invalid.');
    }
  } else if (
    input.state === 'blocked' &&
    !repairBlockReasons.has(input.blockReason)
  ) {
    throw new TypeError('Agent repair block reason is invalid.');
  } else if (input.state !== 'started' && input.state !== 'blocked') {
    throw new TypeError('Agent repair round state is invalid.');
  }
  const base = Object.freeze({
    ...input,
    failedEvidenceManifestDigests,
    producer: Object.freeze({ ...input.producer }),
  }) as RepairReceiptInput;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  }) as AgentRepairRoundReceipt;
};

export const isAgentRepairRoundReceipt = (
  value: unknown
): value is AgentRepairRoundReceipt => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.hasOwn(value, 'receiptDigest') ||
    !isAgentCanonicalDigest(
      (value as { receiptDigest?: unknown }).receiptDigest
    )
  ) {
    return false;
  }
  try {
    const cloned = cloneAgentControlJson(value) as AgentRepairRoundReceipt;
    const { receiptDigest, ...base } = cloned;
    return (
      createAgentRepairRoundReceipt(base as RepairReceiptInput)
        .receiptDigest === receiptDigest
    );
  } catch {
    return false;
  }
};
