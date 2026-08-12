import {
  createAgentEvaluationCapabilityExecutionReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  capabilitySpecificReceiptDigest,
  canonicalAgentEvaluationCapabilitySpecificReceiptOrder,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentEvaluationCapabilityDescriptor,
  isAgentEvaluationCapabilityExecutionReceipt,
  isAgentEvaluationCapabilityPreEffectIntent,
  isAgentEvaluationCapabilitySpecificReceipt,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  isAgentEvaluationProviderCapabilityObservationReceiptSet,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  matchAgentEvaluationCapabilitySpecificProviderObservation,
  matchAgentEvaluationCapabilitySpecificOwnerAuthority,
  resolveAgentEvaluationCapabilityDescriptor,
  type AgentEvaluationAttemptStatus,
  type AgentEvaluationCapabilityDescriptor,
  type AgentEvaluationCapabilityExecutionOutcome,
  type AgentEvaluationCapabilityExecutionReceipt,
  type AgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationCapabilityPreEffectIntent,
  type AgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationProviderCapabilityObservationReceipt,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationControlledToolExecutionReceipt,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentEvaluationJsonObject,
  AgentEvaluationJsonValue,
} from './providerTransport';

export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_TOOL_IDS = Object.freeze([
  'agent.proposal.create',
  'preview.raster.render',
  'transaction.rollback.request',
  'verification.plan.request',
  'verification.repair.request',
  'workspace.inspect',
  'workspace.semantic.find',
] as const);

export const AGENT_EVALUATION_PROVIDER_CAPABILITY_TOOL_IDS = Object.freeze([
  'evaluation.attempt.cancel',
  'evaluation.attempt.reconcile',
  'evaluation.callback.inspect',
  'evaluation.checkpoint.resume',
  'evaluation.timeout.inspect',
  'provider.background-job.poll',
  'provider.cache.inspect',
  'provider.continuation.resume',
  'provider.retrieval.search',
  'provider.usage.reconcile',
] as const);

const controlledToolIds = new Set<string>(
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_TOOL_IDS
);
const providerCapabilityToolIds = new Set<string>(
  AGENT_EVALUATION_PROVIDER_CAPABILITY_TOOL_IDS
);

export type AgentEvaluationToolRuntimeOwner =
  'controlled-workspace-runtime' | 'provider-capability-runtime';

export const resolveAgentEvaluationToolRuntimeOwner = (
  toolId: string
): AgentEvaluationToolRuntimeOwner => {
  if (controlledToolIds.has(toolId)) return 'controlled-workspace-runtime';
  if (providerCapabilityToolIds.has(toolId)) {
    return 'provider-capability-runtime';
  }
  throw new TypeError('Evaluation tool has no frozen runtime owner.');
};

type AgentEvaluationCapabilityRuntimeToolInputBase = Readonly<{
  namespaceId: string;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  caseDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  capabilityDescriptor: AgentEvaluationCapabilityDescriptor;
  loopPolicyDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  toolCallId: string;
  providerToolCallId: string;
  toolId: string;
  arguments: AgentEvaluationJsonObject;
  argumentsDigest: CanonicalDigest;
  requestDigest: CanonicalDigest;
  maximumToolResultBytes: number;
}>;

export type AgentEvaluationCapabilityRuntimeToolInput =
  | (AgentEvaluationCapabilityRuntimeToolInputBase &
      Readonly<{
        executionAuthorityKind: 'observation-control';
        providerCapabilityObservationReceipt: AgentEvaluationProviderCapabilityObservationReceipt;
      }>)
  | (AgentEvaluationCapabilityRuntimeToolInputBase &
      Readonly<{
        executionAuthorityKind: 'shared-effect';
        budgetReservationId: string;
        preEffectIntent: AgentEvaluationCapabilityPreEffectIntent;
      }>);

type AgentEvaluationCapabilityRuntimeToolOutputBase = Readonly<{
  outcome: AgentEvaluationCapabilityExecutionOutcome;
  result: AgentEvaluationJsonValue;
  resultDigest: CanonicalDigest;
  continuationReceiptDigest: CanonicalDigest;
  authorityReceipt: AgentEvaluationAttemptAuthorityOwnerReceipt;
}>;

export type AgentEvaluationCapabilityRuntimeToolOutput =
  | (AgentEvaluationCapabilityRuntimeToolOutputBase &
      Readonly<{
        executionAuthorityKind: 'observation-control';
        specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
      }>)
  | (AgentEvaluationCapabilityRuntimeToolOutputBase &
      Readonly<{
        executionAuthorityKind: 'shared-effect';
        effectSourceReceipt: AgentEvaluationCapabilityEffectSourceReceipt;
        effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
        specificReceipts: readonly [];
      }>);

export type AgentEvaluationCapabilityRuntimeToolExecution =
  | Readonly<{
      input: Extract<
        AgentEvaluationCapabilityRuntimeToolInput,
        { executionAuthorityKind: 'observation-control' }
      >;
      output: Extract<
        AgentEvaluationCapabilityRuntimeToolOutput,
        { executionAuthorityKind: 'observation-control' }
      >;
    }>
  | Readonly<{
      input: Extract<
        AgentEvaluationCapabilityRuntimeToolInput,
        { executionAuthorityKind: 'shared-effect' }
      >;
      output: Extract<
        AgentEvaluationCapabilityRuntimeToolOutput,
        { executionAuthorityKind: 'shared-effect' }
      >;
    }>;

export type AgentEvaluationCapabilityRuntimeAssessmentInput = Readonly<{
  namespaceId: string;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  material: AgentEvaluationCaseMaterial;
  capabilityDescriptor: AgentEvaluationCapabilityDescriptor;
  terminalTurnIndex: number;
  terminalInvocationId: string;
  terminalStatus: AgentEvaluationAttemptStatus;
  observedAt: Instant;
  providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
  capabilityToolExecutions: readonly AgentEvaluationCapabilityRuntimeToolExecution[];
  controlledToolExecutionReceipts: readonly AgentEvaluationControlledToolExecutionReceipt[];
  resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
  controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
}>;

export type AgentEvaluationCapabilityRuntimeAssessment = Readonly<{
  outcome: AgentEvaluationCapabilityExecutionOutcome;
  specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
  authorityReceipt: AgentEvaluationAttemptAuthorityOwnerReceipt;
}>;

/** Provider/evaluation lifecycle owner. It has no credential or workspace authority. */
export interface AgentEvaluationCapabilityRuntime {
  executeTool(
    input: AgentEvaluationCapabilityRuntimeToolInput
  ): Promise<AgentEvaluationCapabilityRuntimeToolOutput>;
  assessCapability(
    input: AgentEvaluationCapabilityRuntimeAssessmentInput
  ): Promise<AgentEvaluationCapabilityRuntimeAssessment>;
}

const canonicalSpecificReceipts = (
  values: readonly AgentEvaluationCapabilitySpecificReceipt[]
): readonly AgentEvaluationCapabilitySpecificReceipt[] =>
  Object.freeze(
    [...values]
      .map((value) => Object.freeze({ ...value }))
      .sort(canonicalAgentEvaluationCapabilitySpecificReceiptOrder)
  );

const assertSpecificReceipts = (
  values: readonly AgentEvaluationCapabilitySpecificReceipt[],
  descriptor: AgentEvaluationCapabilityDescriptor
): readonly AgentEvaluationCapabilitySpecificReceipt[] => {
  const canonical = canonicalSpecificReceipts(values);
  const expectedKinds = new Set(descriptor.expectedReceiptKinds);
  if (
    canonical.length > descriptor.expectedReceiptKinds.length ||
    new Set(canonical.map(({ receiptKind }) => receiptKind)).size !==
      canonical.length ||
    canonical.some(
      (receipt) =>
        !isAgentEvaluationCapabilitySpecificReceipt(receipt) ||
        !expectedKinds.has(receipt.receiptKind)
    )
  ) {
    throw new TypeError('Evaluation capability-specific evidence drifted.');
  }
  return canonical;
};

const usesCapabilityOwnerFact = (
  receipt: AgentEvaluationCapabilitySpecificReceipt
): boolean =>
  receipt.authority.authorityKind === 'terminal-normalization' ||
  receipt.authority.authorityKind === 'recovery-authority' ||
  receipt.authority.authorityKind === 'capability-denial';

const usesProviderObservation = (
  receipt: AgentEvaluationCapabilitySpecificReceipt
): boolean => receipt.providerCapabilityObservationReceiptDigest !== undefined;

const observationMatchesToolInput = (
  input: AgentEvaluationCapabilityRuntimeToolInput
): boolean => {
  if (input.executionAuthorityKind !== 'observation-control') return false;
  const observation = input.providerCapabilityObservationReceipt;
  return (
    isAgentEvaluationProviderCapabilityObservationReceipt(observation) &&
    observation.planDigest === input.planDigest &&
    observation.repositoryCommit === input.repositoryCommit &&
    observation.attemptId === input.attemptId &&
    observation.descriptorDigest === input.descriptorDigest &&
    observation.turnIndex === input.turnIndex &&
    observation.invocationId === input.invocationId &&
    observation.requestDigest === input.requestDigest
  );
};

const preEffectIntentMatchesToolInput = (
  input: AgentEvaluationCapabilityRuntimeToolInput
): boolean => {
  if (input.executionAuthorityKind !== 'shared-effect') return false;
  const intent = input.preEffectIntent;
  return (
    isAgentEvaluationCapabilityPreEffectIntent(intent) &&
    intent.namespaceId === input.namespaceId &&
    intent.planDigest === input.planDigest &&
    intent.repositoryCommit === input.repositoryCommit &&
    intent.attemptId === input.attemptId &&
    intent.descriptorDigest === input.descriptorDigest &&
    intent.caseId === input.caseId &&
    intent.materialDigest === input.materialDigest &&
    intent.turnIndex === input.turnIndex &&
    intent.invocationId === input.invocationId &&
    intent.toolId === input.toolId &&
    intent.toolCallId === input.toolCallId &&
    intent.providerToolCallId === input.providerToolCallId &&
    intent.providerRequestDigest === input.requestDigest &&
    intent.argumentsDigest === input.argumentsDigest
  );
};

export const validateAgentEvaluationCapabilityRuntimeToolOutput = (
  input: AgentEvaluationCapabilityRuntimeToolInput,
  output: AgentEvaluationCapabilityRuntimeToolOutput
): AgentEvaluationCapabilityRuntimeToolOutput => {
  const resultBytes = new TextEncoder().encode(
    canonicalJsonText(output.result)
  ).byteLength;
  if (output.executionAuthorityKind !== input.executionAuthorityKind) {
    throw new TypeError('Evaluation capability execution authority drifted.');
  }
  const specificReceipts =
    input.executionAuthorityKind === 'observation-control' &&
    output.executionAuthorityKind === 'observation-control'
      ? assertSpecificReceipts(
          output.specificReceipts,
          input.capabilityDescriptor
        )
      : Object.freeze([] as const);
  const authorityReceipt = output.authorityReceipt;
  const response =
    input.executionAuthorityKind === 'shared-effect' &&
    output.executionAuthorityKind === 'shared-effect'
      ? Object.freeze({
          executionAuthorityKind: output.executionAuthorityKind,
          outcome: output.outcome,
          result: output.result,
          resultDigest: output.resultDigest,
          continuationReceiptDigest: output.continuationReceiptDigest,
          effectSourceReceipt: output.effectSourceReceipt,
          effectSourceFact: output.effectSourceFact,
          specificReceipts,
        })
      : Object.freeze({
          executionAuthorityKind: 'observation-control' as const,
          outcome: output.outcome,
          result: output.result,
          resultDigest: output.resultDigest,
          continuationReceiptDigest: output.continuationReceiptDigest,
          specificReceipts,
        });
  const responseBinding =
    input.executionAuthorityKind === 'shared-effect'
      ? Object.freeze({
          bindingKind: 'execute-tool' as const,
          executionAuthorityKind: input.executionAuthorityKind,
          invocationId: input.invocationId,
          turnIndex: input.turnIndex,
          toolId: input.toolId,
          toolCallId: input.toolCallId,
          providerToolCallId: input.providerToolCallId,
          providerRequestDigest: input.requestDigest,
          preEffectIntent: input.preEffectIntent,
        })
      : Object.freeze({
          bindingKind: 'execute-tool' as const,
          executionAuthorityKind: input.executionAuthorityKind,
          invocationId: input.invocationId,
          turnIndex: input.turnIndex,
          toolId: input.toolId,
          toolCallId: input.toolCallId,
          providerToolCallId: input.providerToolCallId,
          providerRequestDigest: input.requestDigest,
          providerCapabilityObservationReceiptDigest:
            input.providerCapabilityObservationReceipt.receiptDigest,
        });
  const responseProjection =
    createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'execute-tool',
      response,
      responseBinding
    );
  if (
    !isAgentControlIdentity(input.namespaceId) ||
    !isAgentControlIdentity(input.shardLeaseOwnerId) ||
    !Number.isSafeInteger(input.shardLeaseGeneration) ||
    input.shardLeaseGeneration < 1 ||
    !Number.isSafeInteger(input.verificationGrantGeneration) ||
    input.verificationGrantGeneration < 1 ||
    !isAgentCanonicalDigest(input.verificationAttemptGrantReceiptSetDigest) ||
    (input.executionAuthorityKind === 'observation-control'
      ? !observationMatchesToolInput(input)
      : !preEffectIntentMatchesToolInput(input)) ||
    !['supported', 'unsupported', 'failed'].includes(output.outcome) ||
    resultBytes > input.maximumToolResultBytes ||
    output.resultDigest !== digestAgentCanonicalValue(output.result) ||
    !isAgentCanonicalDigest(output.continuationReceiptDigest) ||
    !isAgentEvaluationAttemptAuthorityOwnerReceipt(authorityReceipt) ||
    authorityReceipt.serviceKind !== 'capability-runtime' ||
    authorityReceipt.operation !== 'execute-tool' ||
    authorityReceipt.namespaceId !== input.namespaceId ||
    authorityReceipt.planDigest !== input.planDigest ||
    authorityReceipt.repositoryCommit !== input.repositoryCommit ||
    authorityReceipt.attemptId !== input.attemptId ||
    authorityReceipt.descriptorDigest !== input.descriptorDigest ||
    authorityReceipt.shardLeaseOwnerId !== input.shardLeaseOwnerId ||
    authorityReceipt.shardLeaseGeneration !== input.shardLeaseGeneration ||
    authorityReceipt.verificationGrantGeneration !==
      input.verificationGrantGeneration ||
    authorityReceipt.verificationAttemptGrantReceiptSetDigest !==
      input.verificationAttemptGrantReceiptSetDigest ||
    !sameCanonicalJson(
      authorityReceipt.responseProjection,
      responseProjection
    ) ||
    specificReceipts.some(
      (receipt) =>
        receipt.planDigest !== input.planDigest ||
        receipt.repositoryCommit !== input.repositoryCommit ||
        receipt.attemptId !== input.attemptId ||
        receipt.descriptorDigest !== input.descriptorDigest ||
        receipt.caseId !== input.caseId ||
        receipt.materialDigest !== input.materialDigest ||
        receipt.capabilityDescriptorDigest !==
          input.capabilityDescriptor.descriptorDigest ||
        receipt.turnIndex !== input.turnIndex ||
        receipt.invocationId !== input.invocationId ||
        receipt.toolId !== input.toolId ||
        receipt.toolCallId !== input.toolCallId ||
        receipt.providerToolCallId !== input.providerToolCallId ||
        receipt.requestDigest !== input.requestDigest ||
        receipt.resultDigest !== output.resultDigest ||
        (usesProviderObservation(receipt) &&
          input.executionAuthorityKind !== 'observation-control') ||
        (usesProviderObservation(receipt) &&
          input.executionAuthorityKind === 'observation-control' &&
          !matchAgentEvaluationCapabilitySpecificProviderObservation(
            receipt,
            input.providerCapabilityObservationReceipt
          )) ||
        (usesCapabilityOwnerFact(receipt) &&
          !matchAgentEvaluationCapabilitySpecificOwnerAuthority(
            receipt,
            authorityReceipt
          ))
    )
  ) {
    throw new TypeError('Evaluation capability runtime output drifted.');
  }
  return input.executionAuthorityKind === 'shared-effect' &&
    output.executionAuthorityKind === 'shared-effect'
    ? Object.freeze({
        executionAuthorityKind: output.executionAuthorityKind,
        outcome: output.outcome,
        result: output.result,
        resultDigest: output.resultDigest,
        continuationReceiptDigest: output.continuationReceiptDigest,
        effectSourceReceipt: output.effectSourceReceipt,
        effectSourceFact: output.effectSourceFact,
        specificReceipts: Object.freeze([]) as readonly [],
        authorityReceipt,
      })
    : Object.freeze({
        executionAuthorityKind: 'observation-control' as const,
        outcome: output.outcome,
        result: output.result,
        resultDigest: output.resultDigest,
        continuationReceiptDigest: output.continuationReceiptDigest,
        specificReceipts,
        authorityReceipt,
      });
};

const concreteCaseFor = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor
) => {
  const concreteCase = plan.concreteCases.find(
    ({ caseId }) => caseId === descriptor.caseId
  );
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === descriptor.targetId
  );
  let resolvedCapabilityDescriptor:
    AgentEvaluationCapabilityDescriptor | undefined;
  try {
    resolvedCapabilityDescriptor =
      concreteCase && target
        ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
        : undefined;
  } catch {
    resolvedCapabilityDescriptor = undefined;
  }
  if (
    !concreteCase ||
    !target ||
    !resolvedCapabilityDescriptor ||
    !isAgentEvaluationCapabilityDescriptor(concreteCase.capabilityDescriptor) ||
    descriptor.capabilityDescriptorDigest !==
      resolvedCapabilityDescriptor.descriptorDigest
  ) {
    throw new TypeError('Evaluation capability descriptor authority drifted.');
  }
  return concreteCase;
};

const observationsMatchAssessment = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput
): boolean => {
  const target = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  );
  const provider = target
    ? input.plan.providerConfigurations.find(
        ({ providerConfigurationId }) =>
          providerConfigurationId === target.providerConfigurationId
      )
    : undefined;
  return Boolean(
    target &&
    provider &&
    isAgentEvaluationProviderCapabilityObservationReceiptSet(
      input.providerCapabilityObservationReceipts,
      {
        planDigest: input.plan.planDigest,
        repositoryCommit: input.plan.repositoryCommit,
        attemptId: input.descriptor.attemptId,
        descriptorDigest: input.descriptor.descriptorDigest,
        maximumTurnCount: input.terminalTurnIndex + 1,
      }
    ) &&
    input.providerCapabilityObservationReceipts.every(
      (observation) =>
        observation.protocolFamily === target.protocolFamily &&
        observation.providerConfigurationId ===
          target.providerConfigurationId &&
        observation.modelLineageDigest === target.modelLineageDigest &&
        observation.adapterDigest === provider.adapter.adapterDigest
    )
  );
};

export const resolveAgentEvaluationPlanCapabilityDescriptor = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor
): AgentEvaluationCapabilityDescriptor => {
  const concreteCase = concreteCaseFor(plan, descriptor);
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === descriptor.targetId
  );
  if (!target) {
    throw new TypeError(
      'Evaluation capability target authority is unavailable.'
    );
  }
  return resolveAgentEvaluationCapabilityDescriptor(concreteCase, target);
};

const observedToolIds = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput
): readonly string[] =>
  Object.freeze(
    [
      ...input.capabilityToolExecutions.map(({ input: tool }) => tool.toolId),
      ...input.controlledToolExecutionReceipts.map(({ toolId }) => toolId),
    ]
      .filter((toolId) =>
        input.capabilityDescriptor.expectedToolIds.includes(toolId)
      )
      .sort(compareUnicodeCodePoints)
  );

const toolBindingsFor = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput,
  outcome: AgentEvaluationCapabilityExecutionOutcome
) => {
  if (outcome === 'unsupported') return Object.freeze([]);
  const observed = new Set(observedToolIds(input));
  return Object.freeze(
    input.capabilityDescriptor.expectedToolIds
      .filter((toolId) => observed.has(toolId))
      .map((toolId) => {
        const tool = input.material.invocation.tools.find(
          (candidate) => candidate.toolId === toolId
        );
        if (!tool) {
          throw new TypeError(
            'Evaluation capability tool definition is unavailable.'
          );
        }
        return Object.freeze({
          toolId,
          definitionDigest: tool.definitionDigest,
        });
      })
  );
};

export const createAgentEvaluationAttemptCapabilityExecutionReceipt = async (
  runtime: AgentEvaluationCapabilityRuntime,
  input: AgentEvaluationCapabilityRuntimeAssessmentInput
): Promise<
  Readonly<{
    executionReceipt: AgentEvaluationCapabilityExecutionReceipt;
    specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
    attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
  }>
> => {
  const concreteCase = concreteCaseFor(input.plan, input.descriptor);
  const resolvedCapabilityDescriptor =
    resolveAgentEvaluationPlanCapabilityDescriptor(
      input.plan,
      input.descriptor
    );
  if (
    !isAgentControlIdentity(input.namespaceId) ||
    !isAgentControlIdentity(input.shardLeaseOwnerId) ||
    !Number.isSafeInteger(input.shardLeaseGeneration) ||
    input.shardLeaseGeneration < 1 ||
    !Number.isSafeInteger(input.verificationGrantGeneration) ||
    input.verificationGrantGeneration < 1 ||
    !isAgentCanonicalDigest(input.verificationAttemptGrantReceiptSetDigest) ||
    !observationsMatchAssessment(input) ||
    !sameCanonicalJson(
      input.capabilityDescriptor,
      resolvedCapabilityDescriptor
    ) ||
    input.material.capabilityDescriptorDigest !==
      concreteCase.capabilityDescriptor.descriptorDigest
  ) {
    throw new TypeError('Evaluation capability material binding drifted.');
  }
  const assessment = await runtime.assessCapability(input);
  const specificReceipts = assertSpecificReceipts(
    assessment.specificReceipts,
    input.capabilityDescriptor
  );
  const authorityReceipt = assessment.authorityReceipt;
  const assessmentResponseProjection =
    createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'assess-capability',
      { outcome: assessment.outcome, specificReceipts },
      {
        bindingKind: 'assess-capability',
        terminalTurnIndex: input.terminalTurnIndex,
        terminalInvocationId: input.terminalInvocationId,
        materialDigest: input.material.materialDigest,
        capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
      }
    );
  const toolReceiptDigests = new Set(
    input.capabilityToolExecutions.flatMap(({ output }) =>
      output.specificReceipts.map(({ receiptDigest }) => receiptDigest)
    )
  );
  const finalReceiptDigests = new Set(
    specificReceipts.map(({ receiptDigest }) => receiptDigest)
  );
  const observationsByReceiptDigest = new Map(
    input.providerCapabilityObservationReceipts.map((observation) => [
      observation.receiptDigest,
      observation,
    ])
  );
  const specificMatchesObservation = (
    specific: AgentEvaluationCapabilitySpecificReceipt
  ): boolean => {
    const observationReceiptDigest =
      specific.providerCapabilityObservationReceiptDigest;
    if (!observationReceiptDigest) return true;
    const observation = observationsByReceiptDigest.get(
      observationReceiptDigest
    );
    return Boolean(
      observation &&
      matchAgentEvaluationCapabilitySpecificProviderObservation(
        specific,
        observation
      )
    );
  };
  const attemptAuthorityOwnerReceipts = Object.freeze([
    ...input.capabilityToolExecutions.map(
      ({ output }) => output.authorityReceipt
    ),
    authorityReceipt,
  ]);
  if (
    !isAgentEvaluationAttemptAuthorityOwnerReceipt(authorityReceipt) ||
    authorityReceipt.serviceKind !== 'capability-runtime' ||
    authorityReceipt.operation !== 'assess-capability' ||
    authorityReceipt.namespaceId !== input.namespaceId ||
    authorityReceipt.planDigest !== input.plan.planDigest ||
    authorityReceipt.repositoryCommit !== input.plan.repositoryCommit ||
    authorityReceipt.attemptId !== input.descriptor.attemptId ||
    authorityReceipt.descriptorDigest !== input.descriptor.descriptorDigest ||
    authorityReceipt.shardLeaseOwnerId !== input.shardLeaseOwnerId ||
    authorityReceipt.shardLeaseGeneration !== input.shardLeaseGeneration ||
    authorityReceipt.verificationGrantGeneration !==
      input.verificationGrantGeneration ||
    authorityReceipt.verificationAttemptGrantReceiptSetDigest !==
      input.verificationAttemptGrantReceiptSetDigest ||
    !sameCanonicalJson(
      authorityReceipt.responseProjection,
      assessmentResponseProjection
    ) ||
    specificReceipts.some(
      (specific) =>
        specific.planDigest !== input.plan.planDigest ||
        specific.repositoryCommit !== input.plan.repositoryCommit ||
        specific.attemptId !== input.descriptor.attemptId ||
        specific.descriptorDigest !== input.descriptor.descriptorDigest ||
        specific.caseId !== input.material.caseId ||
        specific.materialDigest !== input.material.materialDigest ||
        specific.capabilityDescriptorDigest !==
          input.capabilityDescriptor.descriptorDigest ||
        specific.turnIndex > input.terminalTurnIndex ||
        !specificMatchesObservation(specific) ||
        (usesCapabilityOwnerFact(specific) &&
          attemptAuthorityOwnerReceipts.filter((owner) =>
            matchAgentEvaluationCapabilitySpecificOwnerAuthority(
              specific,
              owner
            )
          ).length !== 1)
    ) ||
    [...toolReceiptDigests].some((digest) => !finalReceiptDigests.has(digest))
  ) {
    throw new TypeError('Evaluation capability-specific authority drifted.');
  }
  const specificReceiptDigests = Object.freeze(
    specificReceipts.map(capabilitySpecificReceiptDigest)
  );
  const attemptAuthorityOwnerReceiptDigests = Object.freeze(
    [
      ...new Set(
        attemptAuthorityOwnerReceipts.map(({ receiptDigest }) => receiptDigest)
      ),
    ].sort(compareUnicodeCodePoints)
  );
  const toolBindings = toolBindingsFor(input, assessment.outcome);
  const exactExpectedTools =
    toolBindings.length === input.capabilityDescriptor.expectedToolIds.length &&
    toolBindings.every(
      ({ toolId }, index) =>
        toolId === input.capabilityDescriptor.expectedToolIds[index]
    );
  if (
    !['supported', 'unsupported', 'failed'].includes(assessment.outcome) ||
    (assessment.outcome === 'supported' && !exactExpectedTools)
  ) {
    throw new TypeError('Evaluation capability assessment drifted.');
  }
  const verdict =
    (input.capabilityDescriptor.supportExpectation === 'required' &&
      assessment.outcome === 'supported') ||
    (input.capabilityDescriptor.supportExpectation === 'expected-blocked' &&
      assessment.outcome === 'unsupported')
      ? 'passed'
      : 'failed';
  const receipt = createAgentEvaluationCapabilityExecutionReceipt({
    capabilityExecutionReceiptId: `evaluation-capability:${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    turnIndex: input.terminalTurnIndex,
    invocationId: input.terminalInvocationId,
    caseId: concreteCase.caseId,
    caseDigest: concreteCase.caseDigest,
    targetId: input.descriptor.targetId,
    targetDigest: input.descriptor.targetDigest,
    capabilityProfileId: concreteCase.capabilityProfileId,
    capabilityId: input.capabilityDescriptor.capabilityId,
    supportExpectation: input.capabilityDescriptor.supportExpectation,
    expectedToolIds: input.capabilityDescriptor.expectedToolIds,
    expectedReceiptKinds: input.capabilityDescriptor.expectedReceiptKinds,
    capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
    toolBindings,
    outcome: assessment.outcome,
    verdict,
    specificReceiptDigests,
    attemptAuthorityOwnerReceiptDigests,
    policyDigest: input.plan.policyDigest,
    toolRegistryDigest: input.plan.toolRegistryDigest,
    observedAt: input.observedAt,
  });
  if (!isAgentEvaluationCapabilityExecutionReceipt(receipt)) {
    throw new TypeError('Evaluation capability execution receipt drifted.');
  }
  return Object.freeze({
    executionReceipt: receipt,
    specificReceipts,
    attemptAuthorityOwnerReceipts,
  });
};

export const createAgentEvaluationFailedCapabilityExecutionReceipt = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    turnIndex: number;
    invocationId: string;
    observedAt: Instant;
  }>
): AgentEvaluationCapabilityExecutionReceipt => {
  const concreteCase = concreteCaseFor(input.plan, input.descriptor);
  return createAgentEvaluationCapabilityExecutionReceipt({
    capabilityExecutionReceiptId: `evaluation-capability:${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocationId,
    caseId: concreteCase.caseId,
    caseDigest: concreteCase.caseDigest,
    targetId: input.descriptor.targetId,
    targetDigest: input.descriptor.targetDigest,
    capabilityProfileId: concreteCase.capabilityProfileId,
    capabilityId: concreteCase.capabilityDescriptor.capabilityId,
    supportExpectation: concreteCase.capabilityDescriptor.supportExpectation,
    expectedToolIds: concreteCase.capabilityDescriptor.expectedToolIds,
    expectedReceiptKinds:
      concreteCase.capabilityDescriptor.expectedReceiptKinds,
    capabilityDescriptorDigest:
      concreteCase.capabilityDescriptor.descriptorDigest,
    toolBindings: Object.freeze([]),
    outcome: 'failed',
    verdict: 'failed',
    specificReceiptDigests: Object.freeze([]),
    attemptAuthorityOwnerReceiptDigests: Object.freeze([]),
    policyDigest: input.plan.policyDigest,
    toolRegistryDigest: input.plan.toolRegistryDigest,
    observedAt: input.observedAt,
  });
};

export const isAgentEvaluationCapabilityRuntimeAssessment = (
  value: unknown
): value is AgentEvaluationCapabilityRuntimeAssessment =>
  isPlainObject(value) &&
  Object.keys(value).length === 3 &&
  Object.hasOwn(value, 'outcome') &&
  Object.hasOwn(value, 'specificReceipts') &&
  Object.hasOwn(value, 'authorityReceipt') &&
  ['supported', 'unsupported', 'failed'].includes(String(value.outcome)) &&
  Array.isArray(value.specificReceipts) &&
  value.specificReceipts.every(isAgentEvaluationCapabilitySpecificReceipt) &&
  isAgentEvaluationAttemptAuthorityOwnerReceipt(value.authorityReceipt);
