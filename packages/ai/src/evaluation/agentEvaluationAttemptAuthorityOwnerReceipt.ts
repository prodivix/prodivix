import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  isAgentEvaluationCapabilityEffectSourceReceipt,
  isAgentEvaluationCapabilityPreEffectIntent,
  type AgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationCapabilityPreEffectIntent,
} from './agentEvaluationCapabilityEffectAuthority';
import {
  isAgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
} from './agentEvaluationCapabilitySpecificReceipt';
import {
  isAgentEvaluationProviderCapabilityObservedFact,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
} from './agentEvaluationProviderCapabilityObservation';

export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-attempt-authority-owner-receipt' as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_RECEIPT_VERSION =
  1 as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPT_BYTES =
  16_384 as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT =
  6 as const;

export const maximumAgentEvaluationAttemptAuthorityOwnerReceiptFamilyBytes = (
  attemptCount: number
): number => {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 0) {
    throw new TypeError('Attempt-authority owner denominator is invalid.');
  }
  const bytes =
    attemptCount *
    AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT *
    AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPT_BYTES;
  if (!Number.isSafeInteger(bytes)) {
    throw new TypeError('Attempt-authority owner family capacity overflowed.');
  }
  return bytes;
};

export type AgentEvaluationAttemptAuthorityServiceKind =
  'capability-runtime' | 'attempt-grading';

export type AgentEvaluationAttemptAuthorityOperation =
  'execute-tool' | 'assess-capability' | 'grade-and-persist';

export type AgentEvaluationAttemptExecutionMeasurements = Readonly<{
  modelInvocations: number;
  toolCalls: number;
  repairRounds: number;
  transactions: number;
  artifactBytes: number;
  capabilityExecutionReceiptSetDigest: CanonicalDigest;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  toolReceiptSetDigest?: CanonicalDigest;
  transactionReceiptSetDigest?: CanonicalDigest;
  verificationClosureDigest?: CanonicalDigest;
}>;

export type AgentEvaluationAttemptGradingDigestInput = Readonly<{
  descriptorDigest: CanonicalDigest;
  invocationTurnSetReceiptDigest: CanonicalDigest;
  terminalTurnReceiptDigest: CanonicalDigest;
  capabilityExecutionReceiptDigest: CanonicalDigest;
  resultSubmissionReceiptDigest?: CanonicalDigest;
  controlledRuntimeReceiptDigest?: CanonicalDigest;
  metricObservations: readonly Readonly<{
    observationDigest: CanonicalDigest;
  }>[];
  execution: AgentEvaluationAttemptExecutionMeasurements;
}>;

export const digestAgentEvaluationAttemptGrading = (
  input: AgentEvaluationAttemptGradingDigestInput
): CanonicalDigest => {
  const authorityDigests = [
    input.descriptorDigest,
    input.invocationTurnSetReceiptDigest,
    input.terminalTurnReceiptDigest,
    input.capabilityExecutionReceiptDigest,
    input.execution.capabilityExecutionReceiptSetDigest,
    input.execution.verificationAttemptGrantReceiptSetDigest,
    ...(input.resultSubmissionReceiptDigest
      ? [input.resultSubmissionReceiptDigest]
      : []),
    ...(input.controlledRuntimeReceiptDigest
      ? [input.controlledRuntimeReceiptDigest]
      : []),
    ...(input.execution.toolReceiptSetDigest
      ? [input.execution.toolReceiptSetDigest]
      : []),
    ...(input.execution.transactionReceiptSetDigest
      ? [input.execution.transactionReceiptSetDigest]
      : []),
    ...(input.execution.verificationClosureDigest
      ? [input.execution.verificationClosureDigest]
      : []),
  ];
  const observationDigests = input.metricObservations
    .map(({ observationDigest }) => observationDigest)
    .sort(compareUnicodeCodePoints);
  const measurements = [
    [input.execution.modelInvocations, 64],
    [input.execution.toolCalls, 64],
    [input.execution.repairRounds, 32],
    [input.execution.transactions, 64],
    [input.execution.artifactBytes, 16_777_216],
  ] as const;
  if (
    authorityDigests.some((digest) => !isAgentCanonicalDigest(digest)) ||
    observationDigests.length === 0 ||
    observationDigests.length > 256 ||
    observationDigests.some((digest) => !isAgentCanonicalDigest(digest)) ||
    new Set(observationDigests).size !== observationDigests.length ||
    measurements.some(
      ([value, maximum]) =>
        !Number.isSafeInteger(value) || value < 0 || value > maximum
    )
  ) {
    throw new TypeError('Evaluation attempt grading authority is invalid.');
  }
  return digestAgentCanonicalValue({
    descriptorDigest: input.descriptorDigest,
    invocationTurnSetReceiptDigest: input.invocationTurnSetReceiptDigest,
    terminalTurnReceiptDigest: input.terminalTurnReceiptDigest,
    capabilityExecutionReceiptDigest: input.capabilityExecutionReceiptDigest,
    ...(input.resultSubmissionReceiptDigest
      ? { resultSubmissionReceiptDigest: input.resultSubmissionReceiptDigest }
      : {}),
    ...(input.controlledRuntimeReceiptDigest
      ? { controlledRuntimeReceiptDigest: input.controlledRuntimeReceiptDigest }
      : {}),
    observationDigests,
    execution: input.execution,
  });
};

export type AgentEvaluationAttemptAuthorityOwnerReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_RECEIPT_FORMAT;
  version: typeof AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_RECEIPT_VERSION;
  serviceKind: AgentEvaluationAttemptAuthorityServiceKind;
  operation: AgentEvaluationAttemptAuthorityOperation;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  requestDigest: CanonicalDigest;
  responseProjection: AgentEvaluationAttemptAuthorityResponseProjection;
  responseDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationAttemptAuthorityResponseProjection =
  | Readonly<{
      serviceKind: 'capability-runtime';
      operation: 'execute-tool';
      executionAuthorityKind: 'shared-effect';
      invocationId: string;
      turnIndex: number;
      toolId: string;
      toolCallId: string;
      providerToolCallId: string;
      providerRequestDigest: CanonicalDigest;
      outcome: 'supported' | 'unsupported' | 'failed';
      resultDigest: CanonicalDigest;
      continuationReceiptDigest: CanonicalDigest;
      preEffectIntentDigest: CanonicalDigest;
      effectSourceReceiptDigest: CanonicalDigest;
      effectSourceFactDigest: CanonicalDigest | null;
      specificReceiptDigests: readonly [];
    }>
  | Readonly<{
      serviceKind: 'capability-runtime';
      operation: 'execute-tool';
      executionAuthorityKind: 'observation-control';
      invocationId: string;
      turnIndex: number;
      toolId: string;
      toolCallId: string;
      providerToolCallId: string;
      providerRequestDigest: CanonicalDigest;
      providerCapabilityObservationReceiptDigest: CanonicalDigest;
      outcome: 'supported' | 'unsupported' | 'failed';
      resultDigest: CanonicalDigest;
      continuationReceiptDigest: CanonicalDigest;
      specificReceiptDigests: readonly Readonly<{
        receiptKind: string;
        receiptDigest: CanonicalDigest;
      }>[];
    }>
  | Readonly<{
      serviceKind: 'capability-runtime';
      operation: 'assess-capability';
      terminalTurnIndex: number;
      terminalInvocationId: string;
      materialDigest: CanonicalDigest;
      capabilityDescriptorDigest: CanonicalDigest;
      outcome: 'supported' | 'unsupported' | 'failed';
      specificReceiptDigests: readonly Readonly<{
        receiptKind: string;
        receiptDigest: CanonicalDigest;
      }>[];
    }>
  | Readonly<{
      serviceKind: 'attempt-grading';
      operation: 'grade-and-persist';
      gradingDigest: CanonicalDigest;
      observationDigests: readonly CanonicalDigest[];
    }>;

export type AgentEvaluationAttemptAuthoritySharedEffectExecuteResponse =
  Readonly<{
    executionAuthorityKind: 'shared-effect';
    outcome: 'supported' | 'unsupported' | 'failed';
    result: unknown;
    resultDigest: CanonicalDigest;
    continuationReceiptDigest: CanonicalDigest;
    effectSourceReceipt: AgentEvaluationCapabilityEffectSourceReceipt;
    effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
    specificReceipts: readonly [];
  }>;

export type AgentEvaluationAttemptAuthorityObservationControlExecuteResponse =
  Readonly<{
    executionAuthorityKind: 'observation-control';
    outcome: 'supported' | 'unsupported' | 'failed';
    result: unknown;
    resultDigest: CanonicalDigest;
    continuationReceiptDigest: CanonicalDigest;
    specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
  }>;

export type AgentEvaluationAttemptAuthorityExecuteResponse =
  | AgentEvaluationAttemptAuthoritySharedEffectExecuteResponse
  | AgentEvaluationAttemptAuthorityObservationControlExecuteResponse;

export type CreateAgentEvaluationAttemptAuthorityOwnerReceiptInput = Omit<
  AgentEvaluationAttemptAuthorityOwnerReceipt,
  'format' | 'version' | 'responseDigest' | 'receiptDigest'
>;

type AgentEvaluationAttemptAuthorityExecuteBindingBase = Readonly<{
  bindingKind: 'execute-tool';
  invocationId: string;
  turnIndex: number;
  toolId: string;
  toolCallId: string;
  providerToolCallId: string;
  providerRequestDigest: CanonicalDigest;
}>;

export type AgentEvaluationAttemptAuthorityExecuteBinding =
  | (AgentEvaluationAttemptAuthorityExecuteBindingBase &
      Readonly<{
        executionAuthorityKind: 'shared-effect';
        preEffectIntent: AgentEvaluationCapabilityPreEffectIntent;
      }>)
  | (AgentEvaluationAttemptAuthorityExecuteBindingBase &
      Readonly<{
        executionAuthorityKind: 'observation-control';
        providerCapabilityObservationReceiptDigest: CanonicalDigest;
      }>);

export type AgentEvaluationAttemptAuthorityAssessmentBinding = Readonly<{
  bindingKind: 'assess-capability';
  terminalTurnIndex: number;
  terminalInvocationId: string;
  materialDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
}>;

export type AgentEvaluationAttemptAuthorityResponseBinding =
  | AgentEvaluationAttemptAuthorityExecuteBinding
  | AgentEvaluationAttemptAuthorityAssessmentBinding;

const exactKeys = Object.freeze([
  'format',
  'version',
  'serviceKind',
  'operation',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'shardLeaseOwnerId',
  'shardLeaseGeneration',
  'verificationGrantGeneration',
  'verificationAttemptGrantReceiptSetDigest',
  'requestDigest',
  'responseProjection',
  'responseDigest',
  'ownerImplementationDigest',
  'completedAt',
  'receiptDigest',
] as const);
const repositoryCommitPattern = /^[a-f0-9]{40}$/u;

const operationMatchesService = (
  serviceKind: unknown,
  operation: unknown
): boolean =>
  (serviceKind === 'capability-runtime' &&
    (operation === 'execute-tool' || operation === 'assess-capability')) ||
  (serviceKind === 'attempt-grading' && operation === 'grade-and-persist');

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && keys.includes(key)
  );

const capabilityReceiptDigestProjection = (
  value: unknown
): readonly Readonly<{
  receiptKind: string;
  receiptDigest: CanonicalDigest;
}>[] => {
  if (!Array.isArray(value) || value.length > 2) {
    throw new TypeError(
      'Capability authority response receipt set is invalid.'
    );
  }
  const projected = value.map((entry) => {
    if (
      !isPlainObject(entry) ||
      !isAgentControlIdentity(entry.receiptKind) ||
      !isAgentCanonicalDigest(entry.receiptDigest)
    ) {
      throw new TypeError(
        'Capability authority response receipt projection is invalid.'
      );
    }
    return Object.freeze({
      receiptKind: entry.receiptKind,
      receiptDigest: entry.receiptDigest,
    });
  });
  projected.sort(
    (left, right) =>
      compareUnicodeCodePoints(left.receiptKind, right.receiptKind) ||
      compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest)
  );
  if (
    new Set(projected.map(({ receiptKind }) => receiptKind)).size !==
    projected.length
  ) {
    throw new TypeError(
      'Capability authority response receipt projection is duplicated.'
    );
  }
  return Object.freeze(projected);
};

const isSharedEffectObservedFact = (
  value: unknown
): value is AgentEvaluationProviderCapabilitySharedObservedFact =>
  isAgentEvaluationProviderCapabilityObservedFact(value) &&
  value.factKind !== 'provider-event' &&
  value.factKind !== 'usage-vector';

/** Sanitized response authority committed by Backend; raw tool result bytes stay outside evidence. */
export const createAgentEvaluationAttemptAuthorityResponseProjection = (
  serviceKind: AgentEvaluationAttemptAuthorityServiceKind,
  operation: AgentEvaluationAttemptAuthorityOperation,
  response: unknown,
  responseBinding?: AgentEvaluationAttemptAuthorityResponseBinding
): AgentEvaluationAttemptAuthorityResponseProjection => {
  if (serviceKind === 'capability-runtime' && operation === 'execute-tool') {
    const executeBindingValid =
      responseBinding !== undefined &&
      responseBinding.bindingKind === 'execute-tool' &&
      isAgentControlIdentity(responseBinding.invocationId) &&
      Number.isSafeInteger(responseBinding.turnIndex) &&
      responseBinding.turnIndex >= 0 &&
      responseBinding.turnIndex <= 64 &&
      isAgentControlIdentity(responseBinding.toolId) &&
      isAgentControlIdentity(responseBinding.toolCallId) &&
      isAgentControlIdentity(responseBinding.providerToolCallId) &&
      isAgentCanonicalDigest(responseBinding.providerRequestDigest);
    if (
      !executeBindingValid ||
      !isPlainObject(response) ||
      response.executionAuthorityKind !==
        responseBinding.executionAuthorityKind ||
      !['supported', 'unsupported', 'failed'].includes(
        String(response.outcome)
      ) ||
      !isAgentCanonicalDigest(response.resultDigest) ||
      response.resultDigest !== digestAgentCanonicalValue(response.result) ||
      !isAgentCanonicalDigest(response.continuationReceiptDigest) ||
      !Array.isArray(response.specificReceipts)
    ) {
      throw new TypeError('Capability execute response authority is invalid.');
    }
    if (responseBinding.executionAuthorityKind === 'shared-effect') {
      if (
        !exactRecord(response, [
          'executionAuthorityKind',
          'outcome',
          'result',
          'resultDigest',
          'continuationReceiptDigest',
          'effectSourceReceipt',
          'effectSourceFact',
          'specificReceipts',
        ]) ||
        response.executionAuthorityKind !== 'shared-effect' ||
        response.specificReceipts.length !== 0 ||
        !isAgentEvaluationCapabilityPreEffectIntent(
          responseBinding.preEffectIntent
        ) ||
        responseBinding.preEffectIntent.invocationId !==
          responseBinding.invocationId ||
        responseBinding.preEffectIntent.turnIndex !==
          responseBinding.turnIndex ||
        responseBinding.preEffectIntent.toolId !== responseBinding.toolId ||
        responseBinding.preEffectIntent.toolCallId !==
          responseBinding.toolCallId ||
        responseBinding.preEffectIntent.providerToolCallId !==
          responseBinding.providerToolCallId ||
        responseBinding.preEffectIntent.providerRequestDigest !==
          responseBinding.providerRequestDigest ||
        !isAgentEvaluationCapabilityEffectSourceReceipt(
          response.effectSourceReceipt,
          responseBinding.preEffectIntent
        ) ||
        response.effectSourceReceipt.businessResultDigest !==
          response.resultDigest ||
        (response.effectSourceReceipt.effectStatus === 'produced'
          ? response.outcome !== 'supported'
          : response.effectSourceReceipt.effectStatus === 'unavailable'
            ? response.outcome !== 'unsupported'
            : response.outcome !== 'failed') ||
        (response.effectSourceReceipt.effectStatus === 'produced'
          ? !isSharedEffectObservedFact(response.effectSourceFact) ||
            response.effectSourceFact.factKind !==
              response.effectSourceReceipt.sourceFactKind ||
            response.effectSourceFact.factDigest !==
              response.effectSourceReceipt.sourceFactDigest ||
            inspectAgentControlJson(response.effectSourceFact, 16_384).length >
              0 ||
            containsAgentControlCredentialLikeText(
              JSON.stringify(response.effectSourceFact)
            )
          : response.effectSourceFact !== null)
      ) {
        throw new TypeError(
          'Shared-effect capability execute response authority is invalid.'
        );
      }
      return Object.freeze({
        serviceKind,
        operation,
        executionAuthorityKind: responseBinding.executionAuthorityKind,
        invocationId: responseBinding.invocationId,
        turnIndex: responseBinding.turnIndex,
        toolId: responseBinding.toolId,
        toolCallId: responseBinding.toolCallId,
        providerToolCallId: responseBinding.providerToolCallId,
        providerRequestDigest: responseBinding.providerRequestDigest,
        outcome: response.outcome as 'supported' | 'unsupported' | 'failed',
        resultDigest: response.resultDigest,
        continuationReceiptDigest: response.continuationReceiptDigest,
        preEffectIntentDigest: responseBinding.preEffectIntent.intentDigest,
        effectSourceReceiptDigest: response.effectSourceReceipt.receiptDigest,
        effectSourceFactDigest: response.effectSourceReceipt.sourceFactDigest,
        specificReceiptDigests: Object.freeze([]) as readonly [],
      });
    }
    if (
      !exactRecord(response, [
        'executionAuthorityKind',
        'outcome',
        'result',
        'resultDigest',
        'continuationReceiptDigest',
        'specificReceipts',
      ]) ||
      response.executionAuthorityKind !== 'observation-control' ||
      !isAgentCanonicalDigest(
        responseBinding.providerCapabilityObservationReceiptDigest
      ) ||
      !response.specificReceipts.every(
        isAgentEvaluationCapabilitySpecificReceipt
      ) ||
      response.specificReceipts.some((receipt) =>
        [
          'provider-job',
          'provider-cache',
          'opaque-continuation',
          'retrieval-query',
        ].includes(receipt.authority.authorityKind)
      )
    ) {
      throw new TypeError(
        'Observation-control capability execute response authority is invalid.'
      );
    }
    return Object.freeze({
      serviceKind,
      operation,
      executionAuthorityKind: responseBinding.executionAuthorityKind,
      invocationId: responseBinding.invocationId,
      turnIndex: responseBinding.turnIndex,
      toolId: responseBinding.toolId,
      toolCallId: responseBinding.toolCallId,
      providerToolCallId: responseBinding.providerToolCallId,
      providerRequestDigest: responseBinding.providerRequestDigest,
      providerCapabilityObservationReceiptDigest:
        responseBinding.providerCapabilityObservationReceiptDigest,
      outcome: response.outcome as 'supported' | 'unsupported' | 'failed',
      resultDigest: response.resultDigest,
      continuationReceiptDigest: response.continuationReceiptDigest,
      specificReceiptDigests: capabilityReceiptDigestProjection(
        response.specificReceipts
      ),
    });
  }
  if (
    serviceKind === 'capability-runtime' &&
    operation === 'assess-capability'
  ) {
    if (
      !exactRecord(response, ['outcome', 'specificReceipts']) ||
      !['supported', 'unsupported', 'failed'].includes(
        String(response.outcome)
      ) ||
      !responseBinding ||
      responseBinding.bindingKind !== 'assess-capability' ||
      !Number.isSafeInteger(responseBinding.terminalTurnIndex) ||
      responseBinding.terminalTurnIndex < 0 ||
      responseBinding.terminalTurnIndex > 64 ||
      !isAgentControlIdentity(responseBinding.terminalInvocationId) ||
      !isAgentCanonicalDigest(responseBinding.materialDigest) ||
      !isAgentCanonicalDigest(responseBinding.capabilityDescriptorDigest)
    ) {
      throw new TypeError(
        'Capability assessment response authority is invalid.'
      );
    }
    return Object.freeze({
      serviceKind,
      operation,
      terminalTurnIndex: responseBinding.terminalTurnIndex,
      terminalInvocationId: responseBinding.terminalInvocationId,
      materialDigest: responseBinding.materialDigest,
      capabilityDescriptorDigest: responseBinding.capabilityDescriptorDigest,
      outcome: response.outcome as 'supported' | 'unsupported' | 'failed',
      specificReceiptDigests: capabilityReceiptDigestProjection(
        response.specificReceipts
      ),
    });
  }
  if (serviceKind === 'attempt-grading' && operation === 'grade-and-persist') {
    if (
      !exactRecord(response, ['metricObservations', 'gradingDigest']) ||
      !Array.isArray(response.metricObservations) ||
      !isAgentCanonicalDigest(response.gradingDigest)
    ) {
      throw new TypeError('Attempt grading response authority is invalid.');
    }
    const observationDigests = response.metricObservations.map(
      (observation) => {
        if (
          !isPlainObject(observation) ||
          !isAgentCanonicalDigest(observation.observationDigest)
        ) {
          throw new TypeError(
            'Attempt grading observation authority is invalid.'
          );
        }
        return observation.observationDigest;
      }
    );
    observationDigests.sort(compareUnicodeCodePoints);
    if (new Set(observationDigests).size !== observationDigests.length) {
      throw new TypeError(
        'Attempt grading observation authority is duplicated.'
      );
    }
    return Object.freeze({
      serviceKind,
      operation,
      gradingDigest: response.gradingDigest,
      observationDigests: Object.freeze(observationDigests),
    });
  }
  throw new TypeError('Attempt authority response operation is invalid.');
};

export const digestAgentEvaluationAttemptAuthorityResponseProjection = (
  serviceKind: AgentEvaluationAttemptAuthorityServiceKind,
  operation: AgentEvaluationAttemptAuthorityOperation,
  response: unknown,
  responseBinding?: AgentEvaluationAttemptAuthorityResponseBinding
): CanonicalDigest =>
  digestAgentCanonicalValue(
    createAgentEvaluationAttemptAuthorityResponseProjection(
      serviceKind,
      operation,
      response,
      responseBinding
    )
  );

export const isAgentEvaluationAttemptAuthorityResponseProjection = (
  value: unknown
): value is AgentEvaluationAttemptAuthorityResponseProjection => {
  try {
    if (!isPlainObject(value)) return false;
    if (
      value.serviceKind === 'capability-runtime' &&
      value.operation === 'execute-tool'
    ) {
      const sharedEffect = value.executionAuthorityKind === 'shared-effect';
      if (
        !exactRecord(
          value,
          sharedEffect
            ? [
                'serviceKind',
                'operation',
                'executionAuthorityKind',
                'invocationId',
                'turnIndex',
                'toolId',
                'toolCallId',
                'providerToolCallId',
                'providerRequestDigest',
                'outcome',
                'resultDigest',
                'continuationReceiptDigest',
                'preEffectIntentDigest',
                'effectSourceReceiptDigest',
                'effectSourceFactDigest',
                'specificReceiptDigests',
              ]
            : [
                'serviceKind',
                'operation',
                'executionAuthorityKind',
                'invocationId',
                'turnIndex',
                'toolId',
                'toolCallId',
                'providerToolCallId',
                'providerRequestDigest',
                'providerCapabilityObservationReceiptDigest',
                'outcome',
                'resultDigest',
                'continuationReceiptDigest',
                'specificReceiptDigests',
              ]
        ) ||
        !['shared-effect', 'observation-control'].includes(
          String(value.executionAuthorityKind)
        ) ||
        !isAgentControlIdentity(value.invocationId) ||
        typeof value.turnIndex !== 'number' ||
        !Number.isSafeInteger(value.turnIndex) ||
        value.turnIndex < 0 ||
        value.turnIndex > 64 ||
        !isAgentControlIdentity(value.toolId) ||
        !isAgentControlIdentity(value.toolCallId) ||
        !isAgentControlIdentity(value.providerToolCallId) ||
        !isAgentCanonicalDigest(value.providerRequestDigest) ||
        !['supported', 'unsupported', 'failed'].includes(
          String(value.outcome)
        ) ||
        !isAgentCanonicalDigest(value.resultDigest) ||
        !isAgentCanonicalDigest(value.continuationReceiptDigest) ||
        !Array.isArray(value.specificReceiptDigests) ||
        (sharedEffect
          ? !isAgentCanonicalDigest(value.preEffectIntentDigest) ||
            !isAgentCanonicalDigest(value.effectSourceReceiptDigest) ||
            (value.effectSourceFactDigest !== null &&
              !isAgentCanonicalDigest(value.effectSourceFactDigest)) ||
            value.specificReceiptDigests.length !== 0
          : !isAgentCanonicalDigest(
              value.providerCapabilityObservationReceiptDigest
            ) ||
            !sameCanonicalJson(
              value.specificReceiptDigests,
              capabilityReceiptDigestProjection(value.specificReceiptDigests)
            ))
      ) {
        return false;
      }
      return true;
    }
    if (
      value.serviceKind === 'capability-runtime' &&
      value.operation === 'assess-capability'
    ) {
      return (
        exactRecord(value, [
          'serviceKind',
          'operation',
          'terminalTurnIndex',
          'terminalInvocationId',
          'materialDigest',
          'capabilityDescriptorDigest',
          'outcome',
          'specificReceiptDigests',
        ]) &&
        typeof value.terminalTurnIndex === 'number' &&
        Number.isSafeInteger(value.terminalTurnIndex) &&
        value.terminalTurnIndex >= 0 &&
        value.terminalTurnIndex <= 64 &&
        isAgentControlIdentity(value.terminalInvocationId) &&
        isAgentCanonicalDigest(value.materialDigest) &&
        isAgentCanonicalDigest(value.capabilityDescriptorDigest) &&
        ['supported', 'unsupported', 'failed'].includes(
          String(value.outcome)
        ) &&
        sameCanonicalJson(
          value.specificReceiptDigests,
          capabilityReceiptDigestProjection(value.specificReceiptDigests)
        )
      );
    }
    if (
      value.serviceKind === 'attempt-grading' &&
      value.operation === 'grade-and-persist'
    ) {
      const observationDigests = value.observationDigests;
      return (
        exactRecord(value, [
          'serviceKind',
          'operation',
          'gradingDigest',
          'observationDigests',
        ]) &&
        isAgentCanonicalDigest(value.gradingDigest) &&
        Array.isArray(observationDigests) &&
        observationDigests.length <= 256 &&
        observationDigests.every(isAgentCanonicalDigest) &&
        new Set(observationDigests).size === observationDigests.length &&
        observationDigests.every(
          (digest, index) =>
            index === 0 ||
            compareUnicodeCodePoints(
              observationDigests[index - 1] as string,
              digest
            ) < 0
        )
      );
    }
    return false;
  } catch {
    return false;
  }
};

export const isAgentEvaluationAttemptAuthorityOwnerReceipt = (
  value: unknown
): value is AgentEvaluationAttemptAuthorityOwnerReceipt => {
  try {
    if (
      !isPlainObject(value) ||
      Object.getOwnPropertySymbols(value).length !== 0 ||
      Object.keys(value).length !== exactKeys.length ||
      Object.keys(value).some(
        (key) => isUnsafeObjectKey(key) || !exactKeys.includes(key as never)
      ) ||
      exactKeys.some((key) => !Object.hasOwn(value, key)) ||
      inspectAgentControlJson(
        value,
        AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPT_BYTES
      ).length > 0
    ) {
      return false;
    }
    const receipt =
      value as unknown as AgentEvaluationAttemptAuthorityOwnerReceipt;
    const { receiptDigest, ...base } = receipt;
    return (
      receipt.format ===
        AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_RECEIPT_FORMAT &&
      receipt.version ===
        AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_RECEIPT_VERSION &&
      operationMatchesService(receipt.serviceKind, receipt.operation) &&
      isAgentControlIdentity(receipt.namespaceId) &&
      isAgentCanonicalDigest(receipt.planDigest) &&
      repositoryCommitPattern.test(receipt.repositoryCommit) &&
      isAgentControlIdentity(receipt.attemptId) &&
      isAgentCanonicalDigest(receipt.descriptorDigest) &&
      isAgentControlIdentity(receipt.shardLeaseOwnerId) &&
      Number.isSafeInteger(receipt.shardLeaseGeneration) &&
      receipt.shardLeaseGeneration >= 1 &&
      Number.isSafeInteger(receipt.verificationGrantGeneration) &&
      receipt.verificationGrantGeneration >= 1 &&
      isAgentCanonicalDigest(
        receipt.verificationAttemptGrantReceiptSetDigest
      ) &&
      isAgentCanonicalDigest(receipt.requestDigest) &&
      isAgentEvaluationAttemptAuthorityResponseProjection(
        receipt.responseProjection
      ) &&
      receipt.responseProjection.serviceKind === receipt.serviceKind &&
      receipt.responseProjection.operation === receipt.operation &&
      isAgentCanonicalDigest(receipt.responseDigest) &&
      receipt.responseDigest ===
        digestAgentCanonicalValue(receipt.responseProjection) &&
      isAgentCanonicalDigest(receipt.ownerImplementationDigest) &&
      isAgentControlInstant(receipt.completedAt) &&
      isAgentCanonicalDigest(receiptDigest) &&
      receiptDigest === digestAgentCanonicalValue(base)
    );
  } catch {
    return false;
  }
};

export const createAgentEvaluationAttemptAuthorityOwnerReceipt = (
  input: CreateAgentEvaluationAttemptAuthorityOwnerReceiptInput
): AgentEvaluationAttemptAuthorityOwnerReceipt => {
  if (
    !isAgentEvaluationAttemptAuthorityResponseProjection(
      input.responseProjection
    )
  ) {
    throw new TypeError(
      'Evaluation attempt-authority response projection is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_RECEIPT_VERSION,
    ...input,
    responseDigest: digestAgentCanonicalValue(input.responseProjection),
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationAttemptAuthorityOwnerReceipt(receipt)) {
    throw new TypeError(
      'Evaluation attempt-authority owner receipt is invalid.'
    );
  }
  return receipt;
};

export const canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder = (
  left: AgentEvaluationAttemptAuthorityOwnerReceipt,
  right: AgentEvaluationAttemptAuthorityOwnerReceipt
): number =>
  compareUnicodeCodePoints(left.attemptId, right.attemptId) ||
  compareUnicodeCodePoints(left.serviceKind, right.serviceKind) ||
  compareUnicodeCodePoints(left.operation, right.operation) ||
  compareUnicodeCodePoints(left.requestDigest, right.requestDigest);

export const digestAgentEvaluationAttemptAuthorityOwnerReceiptSet = (
  receipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    receiptDigests: [...receipts]
      .sort(canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder)
      .map(({ receiptDigest }) => receiptDigest),
  });
