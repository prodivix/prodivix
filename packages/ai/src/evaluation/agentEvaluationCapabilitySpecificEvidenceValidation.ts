import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentBudgetLedgerState } from '../usage/agentBudgetLedger';
import type {
  AgentEvaluationIssue,
  AgentEvaluationShardCheckpoint,
  AgentModelEvaluationAttempt,
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import type { AgentEvaluationCapabilityExecutionReceipt } from './agentEvaluationCapabilityExecution';
import {
  digestAgentEvaluationAttemptGrading,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
} from './agentEvaluationAttemptAuthorityOwnerReceipt';
import {
  capabilitySpecificReceiptDigest,
  isAgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
} from './agentEvaluationCapabilitySpecificReceipt';
import {
  isAgentEvaluationParallelToolJoinCapabilityFact,
  type AgentEvaluationParallelToolJoinCapabilityFact,
} from './agentEvaluationCapabilitySpecificAuthorityValidation';
import {
  isAgentEvaluationProviderCapabilityObservationReceipt,
  matchAgentEvaluationProviderCapabilityObservationFactPolicy,
  matchAgentEvaluationCapabilitySpecificProviderObservation,
  type AgentEvaluationProviderCapabilityObservationReceipt,
} from './agentEvaluationProviderCapabilityObservation';
import {
  matchAgentEvaluationCapabilityBudgetAuthority,
  matchAgentEvaluationCapabilitySpecificOwnerAuthority,
  matchAgentEvaluationCapabilityTerminalAuthority,
} from './agentEvaluationCapabilitySpecificOwnerBinding';
import type { AgentEvaluationEvidenceAuthenticityArrays } from './agentEvaluationEvidenceAuthenticity.types';
import type { AgentEvaluationExecutionReceipt } from './agentEvaluationEvidenceBundle';
import { resolveAgentEvaluationCapabilityDescriptor } from './agentEvaluationPlan';
import { digestAgentEvaluationVerificationAttemptGrantReceiptSet } from './agentEvaluationVerificationAttemptGrant';

export type AgentEvaluationCapabilitySpecificEvidenceValidationInput = Pick<
  AgentEvaluationEvidenceAuthenticityArrays,
  | 'invocationTurnReceipts'
  | 'invocationTurnSetReceipts'
  | 'preDispatchFailureReceipts'
  | 'resultSubmissionReceipts'
  | 'controlledRuntimeReceipts'
  | 'capabilityExecutionReceipts'
  | 'capabilitySpecificReceipts'
  | 'providerCapabilityObservationReceipts'
  | 'attemptAuthorityOwnerReceipts'
  | 'transportDispatchIntents'
  | 'transportReceipts'
  | 'providerResultSpoolReceipts'
  | 'verificationAttemptGrantReceipts'
> &
  Readonly<{
    plan: AgentModelEvaluationPlan;
    attempts: readonly AgentModelEvaluationAttempt[];
    descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
    executionReceipts: readonly AgentEvaluationExecutionReceipt[];
    budgetLedger: AgentBudgetLedgerState;
    checkpoints?: readonly AgentEvaluationShardCheckpoint[];
  }>;

const issue = (path: string, message: string): AgentEvaluationIssue =>
  Object.freeze({ code: 'AI-8011', path, message, blocking: true });

const groupBy = <T>(
  values: readonly T[],
  identity: (value: T) => string
): ReadonlyMap<string, readonly T[]> => {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = identity(value);
    const current = grouped.get(key) ?? [];
    current.push(value);
    grouped.set(key, current);
  }
  return grouped;
};

const controlledFactMatches = (
  receipt: AgentEvaluationCapabilitySpecificReceipt
): boolean => {
  const authority = receipt.authority;
  if (authority.authorityKind === 'controlled-tool-execution') {
    const fact = authority.fact;
    return (
      fact.planDigest === receipt.planDigest &&
      fact.attemptId === receipt.attemptId &&
      fact.descriptorDigest === receipt.descriptorDigest &&
      fact.caseId === receipt.caseId &&
      fact.materialDigest === receipt.materialDigest &&
      fact.turnIndex === receipt.turnIndex &&
      fact.toolId === receipt.toolId &&
      fact.toolCallId === receipt.toolCallId &&
      fact.resultDigest === receipt.resultDigest &&
      receipt.providerToolCallId === undefined
    );
  }
  if (authority.authorityKind === 'controlled-continuation') {
    const fact = authority.fact;
    return (
      fact.planDigest === receipt.planDigest &&
      fact.attemptId === receipt.attemptId &&
      fact.descriptorDigest === receipt.descriptorDigest &&
      fact.caseId === receipt.caseId &&
      fact.materialDigest === receipt.materialDigest &&
      fact.completedTurnIndex === receipt.turnIndex &&
      fact.toolResultSetDigest === receipt.resultDigest &&
      receipt.toolId === undefined
    );
  }
  if (authority.authorityKind === 'controlled-runtime') {
    const fact = authority.fact;
    return (
      fact.planDigest === receipt.planDigest &&
      fact.repositoryCommit === receipt.repositoryCommit &&
      fact.attemptId === receipt.attemptId &&
      fact.descriptorDigest === receipt.descriptorDigest &&
      fact.caseId === receipt.caseId &&
      fact.materialDigest === receipt.materialDigest
    );
  }
  return true;
};

const authorityTimelineMatches = (
  receipt: AgentEvaluationCapabilitySpecificReceipt
): boolean => {
  const authority = receipt.authority;
  if (authority.authorityKind === 'retrieval-query') {
    return (
      authority.fact.startedAt === receipt.startedAt &&
      authority.fact.completedAt === receipt.completedAt
    );
  }
  if (
    authority.authorityKind === 'terminal-normalization' ||
    authority.authorityKind === 'recovery-authority' ||
    authority.authorityKind === 'capability-denial'
  ) {
    return authority.fact.observedAt === receipt.completedAt;
  }
  return true;
};

const authorityInvocationMatches = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  invocationUsage: unknown
): boolean => {
  const authority = receipt.authority;
  if (authority.authorityKind === 'provider-job') {
    return authority.fact.invocationId === receipt.invocationId;
  }
  if (authority.authorityKind === 'usage-vector') {
    return sameCanonicalJson(authority.fact, invocationUsage);
  }
  if (
    authority.authorityKind === 'parallel-tool-join' &&
    authority.fact.resultDigest !== undefined
  ) {
    return authority.fact.resultDigest === receipt.resultDigest;
  }
  return true;
};

const executionProjectionMatches = (
  execution: AgentEvaluationCapabilityExecutionReceipt,
  specifics: readonly AgentEvaluationCapabilitySpecificReceipt[]
): boolean => {
  const projected = specifics
    .map(capabilitySpecificReceiptDigest)
    .sort(
      (left, right) =>
        compareUnicodeCodePoints(left.receiptKind, right.receiptKind) ||
        compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest)
    );
  return sameCanonicalJson(execution.specificReceiptDigests, projected);
};

const canonicalDigests = (values: readonly string[]): readonly string[] =>
  Object.freeze([...values].sort(compareUnicodeCodePoints));

export const matchAgentEvaluationControlledToolExecutionReceiptLeafSet = (
  input: Readonly<{
    parallelJoinFacts: readonly AgentEvaluationParallelToolJoinCapabilityFact[];
    controlledToolExecutionReceiptDigests: readonly string[];
    runtimeToolExecutionReceiptSetDigest?: string;
  }>
): boolean => {
  if (
    input.parallelJoinFacts.length > 1 ||
    input.parallelJoinFacts.some(
      (fact) => !isAgentEvaluationParallelToolJoinCapabilityFact(fact)
    ) ||
    new Set(input.controlledToolExecutionReceiptDigests).size !==
      input.controlledToolExecutionReceiptDigests.length
  ) {
    return false;
  }
  const directReceiptDigests = canonicalDigests(
    input.controlledToolExecutionReceiptDigests
  );
  const parallelJoin = input.parallelJoinFacts[0];
  if (!parallelJoin) {
    return (
      directReceiptDigests.length === 0 ||
      (input.runtimeToolExecutionReceiptSetDigest !== undefined &&
        input.runtimeToolExecutionReceiptSetDigest ===
          digestAgentCanonicalValue({
            toolReceiptDigests: directReceiptDigests,
          }))
    );
  }
  if (
    directReceiptDigests.length !== 1 ||
    !parallelJoin.controlledToolExecutionReceiptDigests.includes(
      directReceiptDigests[0]!
    )
  ) {
    return false;
  }
  return (
    input.runtimeToolExecutionReceiptSetDigest !== undefined &&
    input.runtimeToolExecutionReceiptSetDigest ===
      digestAgentCanonicalValue({
        toolReceiptDigests: parallelJoin.controlledToolExecutionReceiptDigests,
      })
  );
};

const validateProviderCapabilityObservations = (
  input: AgentEvaluationCapabilitySpecificEvidenceValidationInput,
  issues: AgentEvaluationIssue[]
): void => {
  const descriptors = new Map(
    input.descriptors.map((descriptor) => [descriptor.attemptId, descriptor])
  );
  const attempts = new Map(
    input.attempts.map((attempt) => [attempt.descriptor.attemptId, attempt])
  );
  const cases = new Map(
    input.plan.concreteCases.map((concreteCase) => [
      concreteCase.caseId,
      concreteCase,
    ])
  );
  const targets = new Map(
    input.plan.capabilityQualificationTargets.map((target) => [
      target.targetId,
      target,
    ])
  );
  const providers = new Map(
    input.plan.providerConfigurations.map((provider) => [
      provider.providerConfigurationId,
      provider,
    ])
  );
  const turns = new Map(
    input.invocationTurnReceipts.map((turn) => [
      `${turn.attemptId}\u0000${turn.turnIndex}\u0000${turn.invocationId}`,
      turn,
    ])
  );
  const intents = new Map(
    input.transportDispatchIntents.map((intent) => [
      intent.intentDigest,
      intent,
    ])
  );
  const transports = new Map(
    input.transportReceipts.map((receipt) => [receipt.receiptDigest, receipt])
  );
  const spools = new Map(
    input.providerResultSpoolReceipts.map((receipt) => [
      receipt.receiptDigest,
      receipt,
    ])
  );
  const observationsByDigest = new Map<
    string,
    AgentEvaluationProviderCapabilityObservationReceipt
  >();
  const observationsByTurn = new Map<
    string,
    AgentEvaluationProviderCapabilityObservationReceipt
  >();
  for (const [
    index,
    observation,
  ] of input.providerCapabilityObservationReceipts.entries()) {
    const path = `/providerCapabilityObservationReceipts/${index}`;
    const descriptor = descriptors.get(observation.attemptId);
    const attempt = attempts.get(observation.attemptId);
    const target = descriptor ? targets.get(descriptor.targetId) : undefined;
    const concreteCase = descriptor ? cases.get(descriptor.caseId) : undefined;
    let resolvedCapabilityDescriptor:
      | AgentModelEvaluationPlan['concreteCases'][number]['capabilityDescriptor']
      | undefined;
    try {
      resolvedCapabilityDescriptor =
        concreteCase && target
          ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
          : undefined;
    } catch {
      resolvedCapabilityDescriptor = undefined;
    }
    const provider = target
      ? providers.get(target.providerConfigurationId)
      : undefined;
    const turnKey = `${observation.attemptId}\u0000${observation.turnIndex}\u0000${observation.invocationId}`;
    const turn = turns.get(turnKey);
    const intent = turn?.dispatchIntentDigest
      ? intents.get(turn.dispatchIntentDigest)
      : undefined;
    const transport = turn?.transportReceiptDigest
      ? transports.get(turn.transportReceiptDigest)
      : undefined;
    const spool = turn?.providerResultSpoolReceiptDigest
      ? spools.get(turn.providerResultSpoolReceiptDigest)
      : undefined;
    const runtimeFactSourceAuthority =
      target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
    const observationFactPolicyMatches =
      resolvedCapabilityDescriptor !== undefined &&
      matchAgentEvaluationProviderCapabilityObservationFactPolicy(
        observation,
        resolvedCapabilityDescriptor,
        runtimeFactSourceAuthority
      );
    if (
      observationsByDigest.has(observation.receiptDigest) ||
      observationsByTurn.has(turnKey)
    ) {
      issues.push(
        issue(path, 'Provider capability observation is duplicated.')
      );
      continue;
    }
    observationsByDigest.set(observation.receiptDigest, observation);
    observationsByTurn.set(turnKey, observation);
    if (
      !isAgentEvaluationProviderCapabilityObservationReceipt(observation) ||
      !descriptor ||
      !attempt ||
      !target ||
      !provider ||
      !turn ||
      !intent ||
      !transport ||
      !spool ||
      turn.dispatchState !== 'dispatched' ||
      observation.planDigest !== input.plan.planDigest ||
      observation.repositoryCommit !== input.plan.repositoryCommit ||
      observation.descriptorDigest !== descriptor.descriptorDigest ||
      observation.protocolFamily !== target.protocolFamily ||
      observation.protocolFamily !== provider.adapter.protocolFamily ||
      observation.protocolFamily !== intent.protocolFamily ||
      observation.protocolFamily !== transport.protocolFamily ||
      observation.providerConfigurationId !== target.providerConfigurationId ||
      observation.providerConfigurationId !==
        provider.providerConfigurationId ||
      observation.providerConfigurationId !== intent.providerConfigurationId ||
      observation.providerConfigurationId !==
        transport.providerConfigurationId ||
      observation.modelLineageDigest !== target.modelLineageDigest ||
      observation.modelLineageDigest !== intent.modelLineageDigest ||
      observation.adapterDigest !== provider.adapter.adapterDigest ||
      observation.requestDigest !== turn.requestArtifactDigest ||
      observation.requestDigest !== intent.requestDigest ||
      observation.requestDigest !== transport.requestDigest ||
      observation.responseDigest !== turn.responseArtifactDigest ||
      observation.responseDigest !== spool.responseDigest ||
      observation.dispatchIntentDigest !== intent.intentDigest ||
      observation.transportReceiptDigest !== transport.receiptDigest ||
      observation.resultSpoolReceiptDigest !== spool.receiptDigest ||
      observation.normalizedEventSetDigest !== spool.normalizedEventSetDigest ||
      !observationFactPolicyMatches ||
      Date.parse(observation.observedAt) < Date.parse(spool.createdAt) ||
      Date.parse(observation.observedAt) > Date.parse(attempt.completedAt)
    ) {
      issues.push(
        issue(
          path,
          'Provider capability observation drifted from its exact native plan, dispatch, transport, encrypted spool, normalized terminal event, or timeline.'
        )
      );
    }
  }

  for (const [index, receipt] of input.capabilitySpecificReceipts.entries()) {
    if (receipt.providerCapabilityObservationReceiptDigest === undefined) {
      if (receipt.authority.authorityKind === 'capability-denial') {
        issues.push(
          issue(
            `/capabilitySpecificReceipts/${index}/providerCapabilityObservationReceiptDigest`,
            'Capability denial requires one exact observed native provider absence or denial fact.'
          )
        );
      }
      continue;
    }
    const observation = observationsByDigest.get(
      receipt.providerCapabilityObservationReceiptDigest
    );
    if (
      !observation ||
      observation.attemptId !== receipt.attemptId ||
      observation.descriptorDigest !== receipt.descriptorDigest ||
      observation.turnIndex !== receipt.turnIndex ||
      observation.invocationId !== receipt.invocationId ||
      observation.requestDigest !== receipt.requestDigest ||
      Date.parse(observation.observedAt) > Date.parse(receipt.completedAt) ||
      !matchAgentEvaluationCapabilitySpecificProviderObservation(
        receipt,
        observation
      )
    ) {
      issues.push(
        issue(
          `/capabilitySpecificReceipts/${index}/providerCapabilityObservationReceiptDigest`,
          'Provider capability-specific authority requires one exact observed native provider fact.'
        )
      );
    }
  }
};

const customOwnerFactMatches = (
  owner: AgentEvaluationAttemptAuthorityOwnerReceipt,
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  execution: AgentEvaluationCapabilityExecutionReceipt,
  submission:
    | AgentEvaluationCapabilitySpecificEvidenceValidationInput['resultSubmissionReceipts'][number]
    | undefined,
  budgetLedger: AgentBudgetLedgerState,
  checkpoints: readonly AgentEvaluationShardCheckpoint[]
): boolean => {
  const authority = receipt.authority;
  if (
    authority.authorityKind !== 'terminal-normalization' &&
    authority.authorityKind !== 'recovery-authority' &&
    authority.authorityKind !== 'capability-denial'
  ) {
    return true;
  }
  const fact = authority.fact;
  if (!matchAgentEvaluationCapabilitySpecificOwnerAuthority(receipt, owner)) {
    return false;
  }
  if (fact.authorityKind === 'terminal-normalization') {
    return matchAgentEvaluationCapabilityTerminalAuthority(receipt, submission);
  }
  if (fact.authorityKind === 'capability-denial') {
    return fact.policyDigest === execution.policyDigest;
  }
  if (fact.category === 'budget-reservation-receipt') {
    const reservation = budgetLedger.reservations.find(
      ({ reservationId }) => reservationId === fact.reservationId
    );
    return matchAgentEvaluationCapabilityBudgetAuthority(receipt, reservation);
  }
  if (fact.category === 'checkpoint-resume-receipt') {
    const checkpoint = checkpoints.find(
      ({ checkpointDigest }) => checkpointDigest === fact.checkpointDigest
    );
    return (
      checkpoint !== undefined &&
      checkpoint.leaseOwnerId === owner.shardLeaseOwnerId &&
      checkpoint.leaseGeneration === fact.toGeneration &&
      fact.toGeneration === owner.shardLeaseGeneration &&
      (checkpoint.completedAttemptRefs.some(
        ({ attemptId }) => attemptId === receipt.attemptId
      ) ||
        checkpoint.missingAttemptRefs.some(
          ({ attemptId }) => attemptId === receipt.attemptId
        ))
    );
  }
  if (
    fact.category === 'cancellation-receipt' ||
    fact.category === 'late-callback-rejection-receipt' ||
    fact.category === 'late-output-fence-receipt' ||
    fact.category === 'lease-fence-receipt' ||
    fact.category === 'state-fence-receipt' ||
    fact.category === 'timeout-receipt'
  ) {
    return (
      fact.shardLeaseOwnerId === owner.shardLeaseOwnerId &&
      fact.shardLeaseGeneration === owner.shardLeaseGeneration
    );
  }
  return true;
};

const assessmentOwnerMatches = (
  owner: AgentEvaluationAttemptAuthorityOwnerReceipt,
  execution: AgentEvaluationCapabilityExecutionReceipt,
  specifics: readonly AgentEvaluationCapabilitySpecificReceipt[],
  expectedMaterialDigest: string | undefined,
  turns: ReadonlyMap<
    string,
    AgentEvaluationCapabilitySpecificEvidenceValidationInput['invocationTurnReceipts'][number]
  >,
  submission:
    | AgentEvaluationCapabilitySpecificEvidenceValidationInput['resultSubmissionReceipts'][number]
    | undefined,
  budgetLedger: AgentBudgetLedgerState,
  checkpoints: readonly AgentEvaluationShardCheckpoint[]
): boolean => {
  if (
    owner.operation !== 'assess-capability' ||
    owner.responseProjection.operation !== 'assess-capability' ||
    expectedMaterialDigest === undefined
  ) {
    return false;
  }
  const terminalTurn = turns.get(
    `${execution.attemptId}\u0000${execution.turnIndex}\u0000${execution.invocationId}`
  );
  return (
    terminalTurn?.terminal === true &&
    terminalTurn.invocationReceipt !== undefined &&
    Date.parse(terminalTurn.invocationReceipt.completedAt) <=
      Date.parse(owner.completedAt) &&
    specifics.every(
      ({ completedAt }) =>
        Date.parse(completedAt) <= Date.parse(owner.completedAt)
    ) &&
    specifics
      .filter(({ toolId }) => toolId === undefined)
      .every((receipt) =>
        customOwnerFactMatches(
          owner,
          receipt,
          execution,
          submission,
          budgetLedger,
          checkpoints
        )
      ) &&
    sameCanonicalJson(owner.responseProjection, {
      serviceKind: 'capability-runtime',
      operation: 'assess-capability',
      terminalTurnIndex: execution.turnIndex,
      terminalInvocationId: execution.invocationId,
      materialDigest: expectedMaterialDigest,
      capabilityDescriptorDigest: execution.capabilityDescriptorDigest,
      outcome: execution.outcome,
      specificReceiptDigests: specifics
        .map(capabilitySpecificReceiptDigest)
        .sort(
          (left, right) =>
            compareUnicodeCodePoints(left.receiptKind, right.receiptKind) ||
            compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest)
        ),
    })
  );
};

const executeOwnerSpecificProjectionMatches = (
  owner: AgentEvaluationAttemptAuthorityOwnerReceipt,
  execution: AgentEvaluationCapabilityExecutionReceipt,
  specifics: readonly AgentEvaluationCapabilitySpecificReceipt[],
  turns: ReadonlyMap<
    string,
    AgentEvaluationCapabilitySpecificEvidenceValidationInput['invocationTurnReceipts'][number]
  >,
  submission:
    | AgentEvaluationCapabilitySpecificEvidenceValidationInput['resultSubmissionReceipts'][number]
    | undefined,
  budgetLedger: AgentBudgetLedgerState,
  checkpoints: readonly AgentEvaluationShardCheckpoint[]
): boolean => {
  if (owner.operation !== 'execute-tool') return false;
  const projection = owner.responseProjection;
  if (projection.operation !== 'execute-tool') return false;
  const turn = turns.get(
    `${owner.attemptId}\u0000${projection.turnIndex}\u0000${projection.invocationId}`
  );
  const exactSpecifics = specifics.filter(
    (receipt) =>
      receipt.turnIndex === projection.turnIndex &&
      receipt.invocationId === projection.invocationId &&
      receipt.toolId === projection.toolId &&
      receipt.toolCallId === projection.toolCallId &&
      receipt.providerToolCallId === projection.providerToolCallId &&
      receipt.requestDigest === projection.providerRequestDigest &&
      receipt.resultDigest === projection.resultDigest
  );
  return (
    turn !== undefined &&
    turn.requestArtifactDigest === projection.providerRequestDigest &&
    exactSpecifics.every(
      ({ completedAt }) =>
        Date.parse(completedAt) <= Date.parse(owner.completedAt)
    ) &&
    exactSpecifics.every((receipt) =>
      customOwnerFactMatches(
        owner,
        receipt,
        execution,
        submission,
        budgetLedger,
        checkpoints
      )
    ) &&
    execution.toolBindings.some(({ toolId }) => toolId === projection.toolId) &&
    sameCanonicalJson(
      projection.specificReceiptDigests,
      exactSpecifics
        .map(capabilitySpecificReceiptDigest)
        .sort(
          (left, right) =>
            compareUnicodeCodePoints(left.receiptKind, right.receiptKind) ||
            compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest)
        )
    )
  );
};

const exactCapabilityOwnerJoin = (
  execution: AgentEvaluationCapabilityExecutionReceipt,
  specifics: readonly AgentEvaluationCapabilitySpecificReceipt[],
  owners: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[],
  expectedVerificationGrantSetDigest: string,
  verificationGrantGenerations: ReadonlySet<number>,
  verificationGrantNamespaces: ReadonlySet<string>,
  turns: ReadonlyMap<
    string,
    AgentEvaluationCapabilitySpecificEvidenceValidationInput['invocationTurnReceipts'][number]
  >,
  expectedMaterialDigest: string | undefined,
  submission:
    | AgentEvaluationCapabilitySpecificEvidenceValidationInput['resultSubmissionReceipts'][number]
    | undefined,
  budgetLedger: AgentBudgetLedgerState,
  checkpoints: readonly AgentEvaluationShardCheckpoint[]
): boolean => {
  const capabilityOwners = owners.filter(
    ({ serviceKind }) => serviceKind === 'capability-runtime'
  );
  if (
    !sameCanonicalJson(
      execution.attemptAuthorityOwnerReceiptDigests,
      canonicalDigests(
        capabilityOwners.map(({ receiptDigest }) => receiptDigest)
      )
    ) ||
    capabilityOwners.some(
      (owner) =>
        !isAgentEvaluationAttemptAuthorityOwnerReceipt(owner) ||
        owner.planDigest !== execution.planDigest ||
        owner.repositoryCommit !== execution.repositoryCommit ||
        owner.attemptId !== execution.attemptId ||
        owner.descriptorDigest !== execution.descriptorDigest ||
        owner.verificationAttemptGrantReceiptSetDigest !==
          expectedVerificationGrantSetDigest ||
        !verificationGrantGenerations.has(owner.verificationGrantGeneration) ||
        !verificationGrantNamespaces.has(owner.namespaceId) ||
        Date.parse(owner.completedAt) > Date.parse(execution.observedAt)
    )
  ) {
    return false;
  }
  if (capabilityOwners.length === 0) {
    return (
      execution.outcome === 'failed' &&
      specifics.length === 0 &&
      execution.attemptAuthorityOwnerReceiptDigests.length === 0
    );
  }
  const assessmentOwners = capabilityOwners.filter(
    ({ operation }) => operation === 'assess-capability'
  );
  if (
    assessmentOwners.length !== 1 ||
    !assessmentOwnerMatches(
      assessmentOwners[0]!,
      execution,
      specifics,
      expectedMaterialDigest,
      turns,
      submission,
      budgetLedger,
      checkpoints
    )
  ) {
    return false;
  }
  const executeOwners = capabilityOwners.filter(
    ({ operation }) => operation === 'execute-tool'
  );
  if (
    executeOwners.some(
      (owner) =>
        !executeOwnerSpecificProjectionMatches(
          owner,
          execution,
          specifics,
          turns,
          submission,
          budgetLedger,
          checkpoints
        )
    )
  ) {
    return false;
  }
  const projectedProviderSpecificDigests = canonicalDigests(
    executeOwners.flatMap((owner) =>
      owner.responseProjection.operation === 'execute-tool'
        ? owner.responseProjection.specificReceiptDigests.map(
            ({ receiptDigest }) => receiptDigest
          )
        : []
    )
  );
  const observedProviderSpecificDigests = canonicalDigests(
    specifics.flatMap(({ providerToolCallId, receiptDigest }) =>
      providerToolCallId === undefined ? [] : [receiptDigest]
    )
  );
  const callIdentities = executeOwners.map((owner) => {
    const projection = owner.responseProjection;
    return projection.operation === 'execute-tool'
      ? `${projection.invocationId}\u0000${projection.turnIndex}\u0000${projection.toolCallId}\u0000${projection.providerToolCallId}`
      : '';
  });
  return (
    new Set(callIdentities).size === callIdentities.length &&
    sameCanonicalJson(
      projectedProviderSpecificDigests,
      observedProviderSpecificDigests
    )
  );
};

const controlledRuntimeProjectionMatches = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  runtime:
    | AgentEvaluationCapabilitySpecificEvidenceValidationInput['controlledRuntimeReceipts'][number]
    | undefined
): boolean => {
  if (receipt.authority.authorityKind !== 'controlled-runtime') return true;
  const fact = receipt.authority.fact;
  return (
    runtime !== undefined &&
    fact.planDigest === runtime.planDigest &&
    fact.repositoryCommit === runtime.repositoryCommit &&
    fact.attemptId === runtime.attemptId &&
    fact.descriptorDigest === runtime.descriptorDigest &&
    fact.caseId === runtime.caseId &&
    fact.materialDigest === runtime.materialDigest &&
    fact.runtimeAuthorityId === runtime.runtimeAuthorityId &&
    fact.runtimeImplementationDigest === runtime.runtimeImplementationDigest &&
    fact.verificationClosureDigest ===
      runtime.g3Verification.verificationClosureDigest &&
    fact.verificationVerdict === runtime.g3Verification.verdict &&
    fact.toolExecutionReceiptSetDigest ===
      runtime.toolExecutionReceiptSetDigest &&
    fact.continuationReceiptSetDigest ===
      runtime.continuationReceiptSetDigest &&
    fact.ownerAuthoritySetDigest === runtime.ownerAuthoritySetDigest
  );
};

const controlledLeafSetsMatch = (
  specifics: readonly AgentEvaluationCapabilitySpecificReceipt[],
  runtime:
    | AgentEvaluationCapabilitySpecificEvidenceValidationInput['controlledRuntimeReceipts'][number]
    | undefined
): boolean => {
  const controlledToolExecutionReceiptDigests = specifics.flatMap((receipt) =>
    receipt.authority.authorityKind === 'controlled-tool-execution'
      ? [receipt.authority.fact.receiptDigest]
      : []
  );
  const parallelJoinFacts = specifics.flatMap((receipt) =>
    receipt.authority.authorityKind === 'parallel-tool-join'
      ? [receipt.authority.fact]
      : []
  );
  const continuationReceiptDigests = canonicalDigests(
    specifics.flatMap((receipt) =>
      receipt.authority.authorityKind === 'controlled-continuation'
        ? [receipt.authority.fact.receiptDigest]
        : []
    )
  );
  return (
    matchAgentEvaluationControlledToolExecutionReceiptLeafSet({
      parallelJoinFacts,
      controlledToolExecutionReceiptDigests,
      ...(runtime?.toolExecutionReceiptSetDigest
        ? {
            runtimeToolExecutionReceiptSetDigest:
              runtime.toolExecutionReceiptSetDigest,
          }
        : {}),
    }) &&
    (continuationReceiptDigests.length === 0 ||
      (runtime !== undefined &&
        runtime.continuationReceiptSetDigest ===
          digestAgentCanonicalValue({ continuationReceiptDigests })))
  );
};

/**
 * Validates the full capability-specific fact leaves without materializing any
 * corpus or attempt-wide payload body. Production archives stream this same
 * receipt family independently at the 14,040-journey denominator.
 */
export const validateAgentEvaluationCapabilitySpecificEvidence = (
  input: AgentEvaluationCapabilitySpecificEvidenceValidationInput
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  validateProviderCapabilityObservations(input, issues);
  const descriptors = new Map(
    input.descriptors.map((descriptor) => [descriptor.attemptId, descriptor])
  );
  const attempts = new Map(
    input.attempts.map((attempt) => [attempt.descriptor.attemptId, attempt])
  );
  const cases = new Map(
    input.plan.concreteCases.map((concreteCase) => [
      concreteCase.caseId,
      concreteCase,
    ])
  );
  const targets = new Map(
    input.plan.capabilityQualificationTargets.map((target) => [
      target.targetId,
      target,
    ])
  );
  const turns = new Map(
    input.invocationTurnReceipts.map((turn) => [
      `${turn.attemptId}\u0000${turn.turnIndex}\u0000${turn.invocationId}`,
      turn,
    ])
  );
  const executionsByAttempt = groupBy(
    input.capabilityExecutionReceipts,
    ({ attemptId }) => attemptId
  );
  const specificsByAttempt = groupBy(
    input.capabilitySpecificReceipts,
    ({ attemptId }) => attemptId
  );
  const submissions = new Map(
    input.resultSubmissionReceipts.map((receipt) => [
      receipt.attemptId,
      receipt,
    ])
  );
  const runtimes = new Map(
    input.controlledRuntimeReceipts.map((receipt) => [
      receipt.attemptId,
      receipt,
    ])
  );
  const ownersByAttempt = groupBy(
    input.attemptAuthorityOwnerReceipts,
    ({ attemptId }) => attemptId
  );
  const grantsByAttempt = groupBy(
    input.verificationAttemptGrantReceipts,
    ({ evaluationAttemptId }) => evaluationAttemptId
  );
  const turnSetsByAttempt = groupBy(
    input.invocationTurnSetReceipts,
    ({ attemptId }) => attemptId
  );
  const executionMeasurementsByAttempt = groupBy(
    input.executionReceipts,
    ({ attemptId }) => attemptId
  );
  const preDispatchAttemptIds = new Set(
    input.preDispatchFailureReceipts.map(({ attemptId }) => attemptId)
  );

  const seenOwnerDigests = new Set<string>();
  const seenOwnerRequests = new Set<string>();
  for (const [index, owner] of input.attemptAuthorityOwnerReceipts.entries()) {
    const path = `/attemptAuthorityOwnerReceipts/${index}`;
    if (seenOwnerDigests.has(owner.receiptDigest)) {
      issues.push(
        issue(path, 'Attempt-authority owner receipt digest is duplicated.')
      );
    }
    if (seenOwnerRequests.has(owner.requestDigest)) {
      issues.push(
        issue(path, 'Attempt-authority owner request digest is duplicated.')
      );
    }
    seenOwnerDigests.add(owner.receiptDigest);
    seenOwnerRequests.add(owner.requestDigest);
  }

  const seenSpecificDigests = new Set<string>();
  for (const [index, receipt] of input.capabilitySpecificReceipts.entries()) {
    const path = `/capabilitySpecificReceipts/${index}`;
    if (seenSpecificDigests.has(receipt.receiptDigest)) {
      issues.push(
        issue(path, 'Capability-specific receipt digest is duplicated.')
      );
    }
    seenSpecificDigests.add(receipt.receiptDigest);

    const descriptor = descriptors.get(receipt.attemptId);
    const attempt = attempts.get(receipt.attemptId);
    const concreteCase = cases.get(receipt.caseId);
    const target = descriptor ? targets.get(descriptor.targetId) : undefined;
    let resolvedCapabilityDescriptor:
      | AgentModelEvaluationPlan['concreteCases'][number]['capabilityDescriptor']
      | undefined;
    try {
      resolvedCapabilityDescriptor =
        concreteCase && target
          ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
          : undefined;
    } catch {
      resolvedCapabilityDescriptor = undefined;
    }
    const turn = turns.get(
      `${receipt.attemptId}\u0000${receipt.turnIndex}\u0000${receipt.invocationId}`
    );
    const execution = executionsByAttempt.get(receipt.attemptId)?.[0];
    const submission = submissions.get(receipt.attemptId);
    const runtime = runtimes.get(receipt.attemptId);
    const toolBound = receipt.toolId !== undefined;
    const controlledTool =
      receipt.authority.authorityKind === 'controlled-tool-execution' ||
      receipt.authority.authorityKind === 'controlled-continuation';
    const timelineBound =
      attempt !== undefined &&
      Date.parse(receipt.startedAt) >= Date.parse(attempt.startedAt) &&
      Date.parse(receipt.completedAt) <= Date.parse(attempt.completedAt);
    const materialBound =
      (submission === undefined ||
        submission.materialDigest === receipt.materialDigest) &&
      (runtime === undefined ||
        runtime.materialDigest === receipt.materialDigest) &&
      (submission !== undefined ||
        runtime !== undefined ||
        receipt.authority.authorityKind === 'capability-denial' ||
        receipt.authority.authorityKind === 'recovery-authority' ||
        receipt.authority.authorityKind === 'terminal-normalization');
    const toolBinding = execution?.toolBindings.find(
      ({ toolId }) => toolId === receipt.toolId
    );
    const terminalFact = !toolBound;
    const factBound =
      isAgentEvaluationCapabilitySpecificReceipt(receipt) &&
      descriptor !== undefined &&
      attempt !== undefined &&
      concreteCase !== undefined &&
      resolvedCapabilityDescriptor !== undefined &&
      turn !== undefined &&
      execution !== undefined &&
      receipt.planDigest === input.plan.planDigest &&
      receipt.repositoryCommit === input.plan.repositoryCommit &&
      receipt.descriptorDigest === descriptor.descriptorDigest &&
      receipt.caseId === descriptor.caseId &&
      receipt.capabilityDescriptorDigest ===
        descriptor.capabilityDescriptorDigest &&
      receipt.capabilityDescriptorDigest ===
        resolvedCapabilityDescriptor.descriptorDigest &&
      receipt.requestDigest === turn.requestArtifactDigest &&
      timelineBound &&
      Date.parse(receipt.completedAt) <= Date.parse(execution.observedAt) &&
      materialBound &&
      controlledFactMatches(receipt) &&
      controlledRuntimeProjectionMatches(receipt, runtime) &&
      authorityTimelineMatches(receipt) &&
      authorityInvocationMatches(receipt, turn.invocationReceipt?.usage) &&
      (toolBound
        ? toolBinding !== undefined &&
          receipt.toolCallId !== undefined &&
          (controlledTool
            ? receipt.providerToolCallId === undefined
            : receipt.providerToolCallId !== undefined)
        : receipt.authority.authorityKind === 'controlled-continuation' ||
          (receipt.turnIndex === execution.turnIndex &&
            receipt.invocationId === execution.invocationId &&
            receipt.resultDigest === turn.responseArtifactDigest));
    if (!factBound) {
      issues.push(
        issue(
          path,
          'Capability-specific fact drifted from its exact plan, attempt, descriptor, turn, tool callback, material, timeline, result, or owner authority.'
        )
      );
    }

    if (
      terminalFact &&
      (receipt.toolCallId !== undefined ||
        receipt.providerToolCallId !== undefined)
    ) {
      issues.push(
        issue(path, 'Terminal capability fact cannot carry tool identities.')
      );
    }
  }

  for (const [attemptId, executions] of executionsByAttempt.entries()) {
    const execution = executions[0];
    const specifics = specificsByAttempt.get(attemptId) ?? [];
    const owners = ownersByAttempt.get(attemptId) ?? [];
    const grants = grantsByAttempt.get(attemptId) ?? [];
    let verificationGrantSetDigest: string | undefined;
    try {
      verificationGrantSetDigest =
        digestAgentEvaluationVerificationAttemptGrantReceiptSet(grants);
    } catch {
      verificationGrantSetDigest = undefined;
    }
    const verificationGrantGenerations = new Set(
      grants.map(({ generation }) => generation)
    );
    const verificationGrantNamespaces = new Set(
      grants.map(({ namespaceId }) => namespaceId)
    );
    if (
      executions.length !== 1 ||
      !execution ||
      !executionProjectionMatches(execution, specifics) ||
      !verificationGrantSetDigest ||
      !exactCapabilityOwnerJoin(
        execution,
        specifics,
        owners,
        verificationGrantSetDigest,
        verificationGrantGenerations,
        verificationGrantNamespaces,
        turns,
        runtimes.get(attemptId)?.materialDigest ??
          submissions.get(attemptId)?.materialDigest ??
          specifics[0]?.materialDigest,
        submissions.get(attemptId),
        input.budgetLedger,
        input.checkpoints ?? []
      ) ||
      !controlledLeafSetsMatch(specifics, runtimes.get(attemptId)) ||
      (execution.outcome === 'supported' &&
        execution.supportExpectation === 'required' &&
        specifics.length !== execution.expectedReceiptKinds.length) ||
      (execution.outcome === 'unsupported' &&
        execution.supportExpectation === 'expected-blocked' &&
        (!specifics.some(({ receiptKind }) =>
          [
            'capability-unavailable-receipt',
            'authority-denial-receipt',
          ].includes(receiptKind)
        ) ||
          execution.verdict !== 'passed')) ||
      (execution.outcome === 'failed' &&
        specifics.some(
          ({ receiptKind }) =>
            !execution.expectedReceiptKinds.includes(receiptKind)
        ))
    ) {
      issues.push(
        issue(
          `/capabilityExecutionReceipts/${attemptId}/specificReceiptDigests`,
          'Capability execution receipt does not bind the exact complete capability-specific fact set for its descriptor branch.'
        )
      );
    }
  }

  for (const attemptId of specificsByAttempt.keys()) {
    if (!executionsByAttempt.has(attemptId)) {
      issues.push(
        issue(
          `/capabilitySpecificReceipts/${attemptId}`,
          'Capability-specific receipt is orphaned from capability execution authority.'
        )
      );
    }
  }

  for (const [attemptId, owners] of ownersByAttempt.entries()) {
    if (
      owners.some(({ serviceKind }) => serviceKind === 'capability-runtime') &&
      !executionsByAttempt.has(attemptId)
    ) {
      issues.push(
        issue(
          `/attemptAuthorityOwnerReceipts/${attemptId}`,
          'Capability-runtime owner receipt is orphaned from capability execution authority.'
        )
      );
    }
  }

  for (const attempt of input.attempts) {
    const attemptId = attempt.descriptor.attemptId;
    const path = `/attemptAuthorityOwnerReceipts/${attemptId}/attempt-grading`;
    const gradingOwners = (ownersByAttempt.get(attemptId) ?? []).filter(
      ({ serviceKind }) => serviceKind === 'attempt-grading'
    );
    const preDispatch = preDispatchAttemptIds.has(attemptId);
    if (gradingOwners.length !== (preDispatch ? 0 : 1)) {
      issues.push(
        issue(
          path,
          'Attempt grading requires one exact owner response projection after dispatch and none for pre-dispatch failure.'
        )
      );
      continue;
    }
    if (preDispatch) continue;
    const owner = gradingOwners[0]!;
    const projection = owner.responseProjection;
    const turnSets = turnSetsByAttempt.get(attemptId) ?? [];
    const terminalTurns = input.invocationTurnReceipts.filter(
      (turn) => turn.attemptId === attemptId && turn.terminal
    );
    const capabilityExecutions = executionsByAttempt.get(attemptId) ?? [];
    const executionMeasurements =
      executionMeasurementsByAttempt.get(attemptId) ?? [];
    const submissionsForAttempt = input.resultSubmissionReceipts.filter(
      (receipt) => receipt.attemptId === attemptId
    );
    const runtimesForAttempt = input.controlledRuntimeReceipts.filter(
      (receipt) => receipt.attemptId === attemptId
    );
    const grants = grantsByAttempt.get(attemptId) ?? [];
    let verificationGrantSetDigest: string | undefined;
    try {
      verificationGrantSetDigest =
        digestAgentEvaluationVerificationAttemptGrantReceiptSet(grants);
    } catch {
      verificationGrantSetDigest = undefined;
    }
    const observationDigests = canonicalDigests(
      attempt.metricObservations.map(
        ({ observationDigest }) => observationDigest
      )
    );
    const turnSet = turnSets[0];
    const terminalTurn = terminalTurns[0];
    const capabilityExecution = capabilityExecutions[0];
    const executionMeasurement = executionMeasurements[0];
    const resultSubmission = submissionsForAttempt[0];
    const controlledRuntime = runtimesForAttempt[0];
    let gradingDigest: string | undefined;
    if (
      turnSet &&
      terminalTurn &&
      capabilityExecution &&
      executionMeasurement
    ) {
      try {
        gradingDigest = digestAgentEvaluationAttemptGrading({
          descriptorDigest: attempt.descriptor.descriptorDigest,
          invocationTurnSetReceiptDigest: turnSet.receiptDigest,
          terminalTurnReceiptDigest: terminalTurn.evidenceDigest,
          capabilityExecutionReceiptDigest: capabilityExecution.receiptDigest,
          ...(resultSubmission
            ? { resultSubmissionReceiptDigest: resultSubmission.receiptDigest }
            : {}),
          ...(controlledRuntime
            ? {
                controlledRuntimeReceiptDigest: controlledRuntime.receiptDigest,
              }
            : {}),
          metricObservations: attempt.metricObservations,
          execution: {
            modelInvocations: executionMeasurement.modelInvocations,
            toolCalls: executionMeasurement.toolCalls,
            repairRounds: executionMeasurement.repairRounds,
            transactions: executionMeasurement.transactions,
            artifactBytes: executionMeasurement.artifactBytes,
            capabilityExecutionReceiptSetDigest:
              executionMeasurement.capabilityExecutionReceiptSetDigest,
            verificationAttemptGrantReceiptSetDigest:
              executionMeasurement.verificationAttemptGrantReceiptSetDigest,
            ...(executionMeasurement.toolReceiptSetDigest
              ? {
                  toolReceiptSetDigest:
                    executionMeasurement.toolReceiptSetDigest,
                }
              : {}),
            ...(executionMeasurement.transactionReceiptSetDigest
              ? {
                  transactionReceiptSetDigest:
                    executionMeasurement.transactionReceiptSetDigest,
                }
              : {}),
            ...(executionMeasurement.verificationClosureDigest
              ? {
                  verificationClosureDigest:
                    executionMeasurement.verificationClosureDigest,
                }
              : {}),
          },
        });
      } catch {
        gradingDigest = undefined;
      }
    }
    const terminalCompletedAt = terminalTurn?.invocationReceipt?.completedAt;
    if (
      owner.operation !== 'grade-and-persist' ||
      projection.operation !== 'grade-and-persist' ||
      turnSets.length !== 1 ||
      terminalTurns.length !== 1 ||
      capabilityExecutions.length !== 1 ||
      executionMeasurements.length !== 1 ||
      submissionsForAttempt.length > 1 ||
      runtimesForAttempt.length > 1 ||
      !verificationGrantSetDigest ||
      owner.planDigest !== input.plan.planDigest ||
      owner.repositoryCommit !== input.plan.repositoryCommit ||
      owner.descriptorDigest !== attempt.descriptor.descriptorDigest ||
      owner.verificationAttemptGrantReceiptSetDigest !==
        verificationGrantSetDigest ||
      turnSet?.receiptDigest !== attempt.invocationTurnSetReceiptDigest ||
      executionMeasurement?.capabilityExecutionReceiptSetDigest !==
        attempt.capabilityExecutionReceiptSetDigest ||
      executionMeasurement?.verificationAttemptGrantReceiptSetDigest !==
        attempt.verificationAttemptGrantReceiptSetDigest ||
      executionMeasurement?.verificationAttemptGrantReceiptSetDigest !==
        verificationGrantSetDigest ||
      terminalTurn?.resultSubmissionReceiptDigest !==
        resultSubmission?.receiptDigest ||
      terminalTurn?.controlledRuntimeReceiptDigest !==
        controlledRuntime?.receiptDigest ||
      !grants.some(
        (grant) =>
          grant.generation === owner.verificationGrantGeneration &&
          grant.namespaceId === owner.namespaceId
      ) ||
      Date.parse(owner.completedAt) > Date.parse(attempt.completedAt) ||
      (terminalCompletedAt !== undefined &&
        Date.parse(owner.completedAt) < Date.parse(terminalCompletedAt)) ||
      gradingDigest === undefined ||
      !sameCanonicalJson(projection, {
        serviceKind: 'attempt-grading',
        operation: 'grade-and-persist',
        gradingDigest,
        observationDigests,
      })
    ) {
      issues.push(
        issue(
          path,
          'Attempt-grading owner response drifted from its exact turn set, terminal turn, capability, result/runtime, observations, execution measurements, grant, or timeline.'
        )
      );
    }
  }

  for (const [attemptId, owners] of ownersByAttempt.entries()) {
    if (
      owners.some(({ serviceKind }) => serviceKind === 'attempt-grading') &&
      !attempts.has(attemptId)
    ) {
      issues.push(
        issue(
          `/attemptAuthorityOwnerReceipts/${attemptId}/attempt-grading`,
          'Attempt-grading owner receipt is orphaned from an immutable attempt.'
        )
      );
    }
  }

  return Object.freeze(
    issues.sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.message, right.message)
    )
  );
};
