import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  cloneAgentControlJson,
  inspectAgentControlJson,
  isAgentControlIdentity,
} from '../control/agentControlValidation';
import type { AgentJsonValue, CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentEvaluationResultSubmission,
  AgentEvaluationResultSubmissionReceipt,
  AgentEvaluationResultArtifactKind,
} from './agentEvaluationResultContract';

const runtimeReceiptFormat =
  'prodivix.agent-evaluation-controlled-runtime-receipt' as const;
const toolExecutionReceiptFormat =
  'prodivix.agent-evaluation-controlled-tool-execution-receipt' as const;
const continuationReceiptFormat =
  'prodivix.agent-evaluation-controlled-continuation-receipt' as const;
const maximumRuntimeFactBytes = 2_097_152;
const maximumAggregateToolResultBytes = 8 * 1_024 * 1_024;
const maximumReceiptCount = 128;
const maximumArtifactBytes = 16 * 1_024 * 1_024;
const maximumAggregateArtifactBytes = 8 * 1_024 * 1_024;
const maximumPreviewBytes = 2 * 1_024 * 1_024;
const maximumRasterDimension = 4_096;
const maximumRasterPixels = 16_777_216;

export type AgentEvaluationControlledPreviewRaster = Readonly<{
  artifactRef: string;
  artifactDigest: CanonicalDigest;
  mediaType: 'image/png' | 'image/webp';
  width: number;
  height: number;
  byteLength: number;
  renderPolicyDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledPersistedArtifactRef = Readonly<{
  artifactKind: AgentEvaluationResultArtifactKind;
  artifactRef: string;
  artifactDigest: CanonicalDigest;
  byteLength: number;
  persistenceReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledToolExecutionReceipt = Readonly<{
  format: typeof toolExecutionReceiptFormat;
  version: 1;
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  loopPolicyDigest: CanonicalDigest;
  grantDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  toolDefinitionDigest: CanonicalDigest;
  inputSchemaDigest: CanonicalDigest;
  generation: number;
  idempotencyKey: string;
  operationIntentDigest: CanonicalDigest;
  turnIndex: number;
  toolCallId: string;
  toolId: string;
  argumentsDigest: CanonicalDigest;
  status: 'succeeded' | 'rejected';
  resultDigest: CanonicalDigest;
  persistedArtifacts: readonly AgentEvaluationControlledPersistedArtifactRef[];
  commandReceiptDigests: readonly CanonicalDigest[];
  transactionReceiptDigests: readonly CanonicalDigest[];
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledToolExecutionInput = Readonly<{
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  loopPolicyDigest: CanonicalDigest;
  turnIndex: number;
  toolCallId: string;
  toolId: string;
  arguments: AgentJsonValue;
  argumentsDigest: CanonicalDigest;
  maximumToolResultBytes: number;
}>;

/** Runtime-only result body; only its receipt may cross the durable boundary. */
export type AgentEvaluationControlledToolExecutionOutput = Readonly<{
  receipt: AgentEvaluationControlledToolExecutionReceipt;
  result: AgentJsonValue;
}>;

export type AgentEvaluationControlledToolExecutionResult = Readonly<{
  grantDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  toolDefinitionDigest: CanonicalDigest;
  inputSchemaDigest: CanonicalDigest;
  generation: number;
  idempotencyKey: string;
  operationIntentDigest: CanonicalDigest;
  status: 'succeeded' | 'rejected';
  result: AgentJsonValue;
  persistedArtifacts: readonly AgentEvaluationControlledPersistedArtifactRef[];
  commandReceiptDigests: readonly CanonicalDigest[];
  transactionReceiptDigests: readonly CanonicalDigest[];
}>;

export type AgentEvaluationControlledContinuationReceipt = Readonly<{
  format: typeof continuationReceiptFormat;
  version: 1;
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  loopPolicyDigest: CanonicalDigest;
  completedTurnIndex: number;
  nextTurnIndex: number;
  toolExecutionReceiptDigests: readonly CanonicalDigest[];
  toolResultSetDigest: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledContinuationInput = Readonly<{
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  loopPolicyDigest: CanonicalDigest;
  completedTurnIndex: number;
  maximumAggregateToolResultBytes: number;
  executions: readonly AgentEvaluationControlledToolExecutionOutput[];
}>;

/** Exact tool-result blocks to feed into the next provider turn. */
export type AgentEvaluationControlledContinuationOutput = Readonly<{
  receipt: AgentEvaluationControlledContinuationReceipt;
  toolResults: readonly Readonly<{
    toolCallId: string;
    toolId: string;
    result: AgentJsonValue;
    resultDigest: CanonicalDigest;
  }>[];
}>;

export type AgentEvaluationControlledRuntimeInput = Readonly<{
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  caseDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  submission: AgentEvaluationResultSubmission;
  submissionReceipt: AgentEvaluationResultSubmissionReceipt;
  toolExecutionReceipts: readonly AgentEvaluationControlledToolExecutionReceipt[];
  continuationReceipts: readonly AgentEvaluationControlledContinuationReceipt[];
  requiresControlledPreview: boolean;
  runtimeAuthorityId: string;
  runtimeImplementationDigest: CanonicalDigest;
  artifactResolutionPolicyDigest: CanonicalDigest;
  proposalValidationPolicyDigest: CanonicalDigest;
  isolationPolicyDigest: CanonicalDigest;
  g3VerificationPolicyDigest: CanonicalDigest;
  controlledRenderPolicyDigest: CanonicalDigest;
  loopPolicyDigest: CanonicalDigest;
  maximumTurnsPerAttempt: number;
  maximumToolCallsPerAttempt: number;
  maximumRepairRoundsPerAttempt: number;
  maximumAggregateArtifactBytes: number;
}>;

export type AgentEvaluationControlledRuntimeResult = Readonly<{
  grantDigest: CanonicalDigest;
  grantGeneration: number;
  toolRegistryDigest: CanonicalDigest;
  actionRegistryDigest: CanonicalDigest;
  operationSealReceiptDigests: readonly CanonicalDigest[];
  ownerAuthorityReceiptDigests: readonly CanonicalDigest[];
  verificationAttemptGrantReceiptDigests: readonly CanonicalDigest[];
  producedCapabilityExecutionReceiptSetDigest?: CanonicalDigest;
  baseSnapshotDigest: CanonicalDigest;
  finalSnapshotDigest: CanonicalDigest;
  cleanupReceiptDigest: CanonicalDigest;
  sourceReferencesRevoked: true;
  sandboxDestroyed: true;
  artifactResolution: Readonly<{
    resolvedArtifactCount: number;
    resolvedArtifactBytes: number;
    artifactResolutionReceiptSetDigest: CanonicalDigest;
  }>;
  proposalValidation: Readonly<{
    verdict: 'passed' | 'failed';
    typedProposalValidationReceiptDigest: CanonicalDigest;
  }>;
  isolatedExecution: Readonly<{
    isolationPolicyDigest: CanonicalDigest;
    toolCallCount: number;
    toolReceiptSetDigest?: CanonicalDigest;
    repairRoundCount: number;
    commandCount: number;
    commandReceiptSetDigest: CanonicalDigest;
    transactionCount: number;
    transactionReceiptSetDigest?: CanonicalDigest;
  }>;
  g3Verification: Readonly<{
    verificationPlanReceiptDigest: CanonicalDigest;
    verificationClosureDigest: CanonicalDigest;
    verdict: 'passed' | 'failed';
  }>;
  controlledPreview?: AgentEvaluationControlledPreviewRaster;
}>;

export type AgentEvaluationControlledRuntimeReceipt =
  AgentEvaluationControlledRuntimeResult &
    Readonly<{
      format: typeof runtimeReceiptFormat;
      version: 1;
      planDigest: CanonicalDigest;
      repositoryCommit: string;
      attemptId: string;
      descriptorDigest: CanonicalDigest;
      caseId: string;
      caseDigest: CanonicalDigest;
      materialDigest: CanonicalDigest;
      submissionReceiptDigest: CanonicalDigest;
      runtimeAuthorityId: string;
      runtimeImplementationDigest: CanonicalDigest;
      artifactResolutionPolicyDigest: CanonicalDigest;
      proposalValidationPolicyDigest: CanonicalDigest;
      isolationPolicyDigest: CanonicalDigest;
      g3VerificationPolicyDigest: CanonicalDigest;
      controlledRenderPolicyDigest: CanonicalDigest;
      loopPolicyDigest: CanonicalDigest;
      maximumTurnsPerAttempt: number;
      maximumToolCallsPerAttempt: number;
      maximumRepairRoundsPerAttempt: number;
      maximumAggregateArtifactBytes: number;
      toolExecutionReceiptSetDigest?: CanonicalDigest;
      continuationReceiptSetDigest?: CanonicalDigest;
      operationIntentSetDigest?: CanonicalDigest;
      operationSealSetDigest?: CanonicalDigest;
      verificationAttemptGrantReceiptSetDigest?: CanonicalDigest;
      ownerAuthoritySetDigest: CanonicalDigest;
      receiptDigest: CanonicalDigest;
    }>;

/** Required production port. Implementations own disposable execution and return only receipt facts. */
export interface AgentEvaluationControlledRuntime {
  executeTool(
    input: AgentEvaluationControlledToolExecutionInput
  ): Promise<AgentEvaluationControlledToolExecutionOutput>;
  continue(
    input: AgentEvaluationControlledContinuationInput
  ): Promise<AgentEvaluationControlledContinuationOutput>;
  assessFinal(
    input: AgentEvaluationControlledRuntimeInput
  ): Promise<AgentEvaluationControlledRuntimeReceipt>;
}

const exact = (
  value: unknown,
  keys: readonly string[],
  label: string,
  maximumBytes = maximumRuntimeFactBytes
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.keys(value).some(isUnsafeObjectKey) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    inspectAgentControlJson(value, maximumBytes).length > 0
  ) {
    throw new TypeError(`${label} has an invalid exact shape.`);
  }
  return value;
};

const boundedCount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximumReceiptCount;

const boundedArtifactBytes = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximumArtifactBytes;

const boundedRuntimeBytes = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= maximumRuntimeFactBytes;

const boundedAggregateToolBytes = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= maximumAggregateToolResultBytes;

const boundedRasterDimension = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= maximumRasterDimension;

const exactCommit = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);

const validateSubmissionReceipt = (
  submission: AgentEvaluationResultSubmission,
  receipt: AgentEvaluationResultSubmissionReceipt
): void => {
  const { receiptDigest, ...receiptBase } = receipt;
  if (
    !isAgentCanonicalDigest(receiptDigest) ||
    receiptDigest !== digestAgentCanonicalValue(receiptBase) ||
    receipt.submissionDigest !== submission.submissionDigest ||
    receipt.toolArgumentsDigest !== submission.argumentsDigest
  ) {
    throw new TypeError('Evaluation result submission receipt drifted.');
  }
};

const validateControlledPreview = (
  value: unknown
): AgentEvaluationControlledPreviewRaster => {
  const preview = exact(
    value,
    [
      'artifactRef',
      'artifactDigest',
      'mediaType',
      'width',
      'height',
      'byteLength',
      'renderPolicyDigest',
    ],
    'Evaluation controlled preview'
  );
  if (
    !isAgentControlIdentity(preview.artifactRef) ||
    !isAgentCanonicalDigest(preview.artifactDigest) ||
    !['image/png', 'image/webp'].includes(String(preview.mediaType)) ||
    !boundedRasterDimension(preview.width) ||
    !boundedRasterDimension(preview.height) ||
    Number(preview.width) * Number(preview.height) > maximumRasterPixels ||
    !boundedArtifactBytes(preview.byteLength) ||
    Number(preview.byteLength) < 1 ||
    Number(preview.byteLength) > maximumPreviewBytes ||
    !isAgentCanonicalDigest(preview.renderPolicyDigest)
  ) {
    throw new TypeError('Evaluation controlled preview is invalid.');
  }
  return Object.freeze({
    artifactRef: preview.artifactRef,
    artifactDigest: preview.artifactDigest,
    mediaType: preview.mediaType,
    width: preview.width,
    height: preview.height,
    byteLength: preview.byteLength,
    renderPolicyDigest: preview.renderPolicyDigest,
  }) as AgentEvaluationControlledPreviewRaster;
};

const canonicalDigestArray = (
  value: readonly CanonicalDigest[],
  label: string
): readonly CanonicalDigest[] => {
  if (
    value.length > maximumReceiptCount ||
    value.some((entry) => !isAgentCanonicalDigest(entry)) ||
    new Set(value).size !== value.length
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return Object.freeze([...value].sort(compareUnicodeCodePoints));
};

const normalizePersistedArtifact = (
  value: unknown
): AgentEvaluationControlledPersistedArtifactRef => {
  const artifact = exact(
    value,
    [
      'artifactKind',
      'artifactRef',
      'artifactDigest',
      'byteLength',
      'persistenceReceiptDigest',
    ],
    'Evaluation persisted artifact receipt'
  );
  if (
    ![
      'proposal',
      'verification-plan',
      'tool-receipt',
      'transaction-receipt',
      'verification-closure',
      'diagnostic-report',
    ].includes(String(artifact.artifactKind)) ||
    !isAgentControlIdentity(artifact.artifactRef) ||
    !isAgentCanonicalDigest(artifact.artifactDigest) ||
    !boundedArtifactBytes(artifact.byteLength) ||
    !isAgentCanonicalDigest(artifact.persistenceReceiptDigest)
  ) {
    throw new TypeError('Evaluation persisted artifact receipt is invalid.');
  }
  return Object.freeze({
    artifactKind: artifact.artifactKind,
    artifactRef: artifact.artifactRef,
    artifactDigest: artifact.artifactDigest,
    byteLength: artifact.byteLength,
    persistenceReceiptDigest: artifact.persistenceReceiptDigest,
  }) as AgentEvaluationControlledPersistedArtifactRef;
};

/** Creates the durable authority receipt for one bounded controlled tool call. */
export const createAgentEvaluationControlledToolExecutionOutput = (
  input: AgentEvaluationControlledToolExecutionInput,
  result: AgentEvaluationControlledToolExecutionResult
): AgentEvaluationControlledToolExecutionOutput => {
  exact(
    input,
    [
      'planDigest',
      'attemptId',
      'descriptorDigest',
      'caseId',
      'materialDigest',
      'loopPolicyDigest',
      'turnIndex',
      'toolCallId',
      'toolId',
      'arguments',
      'argumentsDigest',
      'maximumToolResultBytes',
    ],
    'Evaluation controlled tool input'
  );
  const resultRecord = exact(
    result,
    [
      'grantDigest',
      'toolRegistryDigest',
      'toolDefinitionDigest',
      'inputSchemaDigest',
      'generation',
      'idempotencyKey',
      'operationIntentDigest',
      'status',
      'result',
      'persistedArtifacts',
      'commandReceiptDigests',
      'transactionReceiptDigests',
    ],
    'Evaluation controlled tool result'
  );
  if (
    !isAgentCanonicalDigest(input.planDigest) ||
    !isAgentControlIdentity(input.attemptId) ||
    !isAgentCanonicalDigest(input.descriptorDigest) ||
    !isAgentControlIdentity(input.caseId) ||
    !isAgentCanonicalDigest(input.materialDigest) ||
    !isAgentCanonicalDigest(input.loopPolicyDigest) ||
    !boundedCount(input.turnIndex) ||
    !isAgentControlIdentity(input.toolCallId) ||
    !isAgentControlIdentity(input.toolId) ||
    !isAgentCanonicalDigest(input.argumentsDigest) ||
    input.argumentsDigest !== digestAgentCanonicalValue(input.arguments) ||
    !boundedRuntimeBytes(input.maximumToolResultBytes) ||
    !isAgentCanonicalDigest(resultRecord.grantDigest) ||
    !isAgentCanonicalDigest(resultRecord.toolRegistryDigest) ||
    !isAgentCanonicalDigest(resultRecord.toolDefinitionDigest) ||
    !isAgentCanonicalDigest(resultRecord.inputSchemaDigest) ||
    !boundedCount(resultRecord.generation) ||
    Number(resultRecord.generation) < 1 ||
    !isAgentControlIdentity(resultRecord.idempotencyKey) ||
    !isAgentCanonicalDigest(resultRecord.operationIntentDigest) ||
    !['succeeded', 'rejected'].includes(String(resultRecord.status)) ||
    inspectAgentControlJson(resultRecord.result, input.maximumToolResultBytes)
      .length > 0 ||
    !Array.isArray(resultRecord.persistedArtifacts) ||
    !Array.isArray(resultRecord.commandReceiptDigests) ||
    !Array.isArray(resultRecord.transactionReceiptDigests)
  ) {
    throw new TypeError('Evaluation controlled tool execution is invalid.');
  }
  const persistedArtifacts = (resultRecord.persistedArtifacts as unknown[])
    .map(normalizePersistedArtifact)
    .sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.artifactKind}\u0000${left.artifactRef}`,
        `${right.artifactKind}\u0000${right.artifactRef}`
      )
    );
  const artifactKeys = persistedArtifacts.map(
    ({ artifactKind, artifactRef }) => `${artifactKind}\u0000${artifactRef}`
  );
  const persistedArtifactBytes = persistedArtifacts.reduce(
    (total, { byteLength }) => total + byteLength,
    0
  );
  const commandReceiptDigests = canonicalDigestArray(
    resultRecord.commandReceiptDigests as readonly CanonicalDigest[],
    'Evaluation command receipt digests'
  );
  const transactionReceiptDigests = canonicalDigestArray(
    resultRecord.transactionReceiptDigests as readonly CanonicalDigest[],
    'Evaluation transaction receipt digests'
  );
  if (
    persistedArtifacts.length > maximumReceiptCount ||
    !Number.isSafeInteger(persistedArtifactBytes) ||
    persistedArtifactBytes > maximumAggregateArtifactBytes ||
    new Set(artifactKeys).size !== artifactKeys.length ||
    (resultRecord.status === 'rejected' &&
      (persistedArtifacts.length > 0 ||
        commandReceiptDigests.length > 0 ||
        transactionReceiptDigests.length > 0))
  ) {
    throw new TypeError('Evaluation controlled tool execution is invalid.');
  }
  const runtimeResult = cloneAgentControlJson(
    resultRecord.result
  ) as AgentJsonValue;
  const base = Object.freeze({
    format: toolExecutionReceiptFormat,
    version: 1 as const,
    planDigest: input.planDigest,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    caseId: input.caseId,
    materialDigest: input.materialDigest,
    loopPolicyDigest: input.loopPolicyDigest,
    grantDigest: resultRecord.grantDigest,
    toolRegistryDigest: resultRecord.toolRegistryDigest,
    toolDefinitionDigest: resultRecord.toolDefinitionDigest,
    inputSchemaDigest: resultRecord.inputSchemaDigest,
    generation: resultRecord.generation,
    idempotencyKey: resultRecord.idempotencyKey,
    operationIntentDigest: resultRecord.operationIntentDigest,
    turnIndex: input.turnIndex,
    toolCallId: input.toolCallId,
    toolId: input.toolId,
    argumentsDigest: input.argumentsDigest,
    status: resultRecord.status as 'succeeded' | 'rejected',
    resultDigest: digestAgentCanonicalValue(runtimeResult),
    persistedArtifacts: Object.freeze(persistedArtifacts),
    commandReceiptDigests,
    transactionReceiptDigests,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  return Object.freeze({ receipt, result: runtimeResult });
};

/** Creates exact provider tool-result blocks and their continuation receipt. */
export const createAgentEvaluationControlledContinuationOutput = (
  input: AgentEvaluationControlledContinuationInput
): AgentEvaluationControlledContinuationOutput => {
  exact(
    input,
    [
      'planDigest',
      'attemptId',
      'descriptorDigest',
      'caseId',
      'materialDigest',
      'loopPolicyDigest',
      'completedTurnIndex',
      'maximumAggregateToolResultBytes',
      'executions',
    ],
    'Evaluation controlled continuation input',
    maximumAggregateToolResultBytes
  );
  if (
    !isAgentCanonicalDigest(input.planDigest) ||
    !isAgentControlIdentity(input.attemptId) ||
    !isAgentCanonicalDigest(input.descriptorDigest) ||
    !isAgentControlIdentity(input.caseId) ||
    !isAgentCanonicalDigest(input.materialDigest) ||
    !isAgentCanonicalDigest(input.loopPolicyDigest) ||
    !boundedCount(input.completedTurnIndex) ||
    !boundedAggregateToolBytes(input.maximumAggregateToolResultBytes) ||
    !Array.isArray(input.executions) ||
    input.executions.length < 1 ||
    input.executions.length > maximumReceiptCount
  ) {
    throw new TypeError('Evaluation controlled continuation is invalid.');
  }
  const toolResults = input.executions.map((execution) => {
    exact(
      execution,
      ['receipt', 'result'],
      'Evaluation controlled tool output'
    );
    const receipt = execution.receipt;
    const { receiptDigest, ...receiptBase } = receipt;
    if (
      receipt.format !== toolExecutionReceiptFormat ||
      receipt.version !== 1 ||
      receipt.planDigest !== input.planDigest ||
      receipt.attemptId !== input.attemptId ||
      receipt.descriptorDigest !== input.descriptorDigest ||
      receipt.caseId !== input.caseId ||
      receipt.materialDigest !== input.materialDigest ||
      receipt.loopPolicyDigest !== input.loopPolicyDigest ||
      receipt.turnIndex !== input.completedTurnIndex ||
      !isAgentCanonicalDigest(receiptDigest) ||
      receiptDigest !== digestAgentCanonicalValue(receiptBase) ||
      inspectAgentControlJson(
        execution.result,
        input.maximumAggregateToolResultBytes
      ).length > 0 ||
      receipt.resultDigest !== digestAgentCanonicalValue(execution.result)
    ) {
      throw new TypeError('Evaluation controlled continuation is invalid.');
    }
    return Object.freeze({
      toolCallId: receipt.toolCallId,
      toolId: receipt.toolId,
      result: cloneAgentControlJson(execution.result),
      resultDigest: receipt.resultDigest,
    });
  });
  if (
    new Set(toolResults.map(({ toolCallId }) => toolCallId)).size !==
      toolResults.length ||
    inspectAgentControlJson(toolResults, input.maximumAggregateToolResultBytes)
      .length > 0
  ) {
    throw new TypeError('Evaluation controlled continuation is invalid.');
  }
  const toolExecutionReceiptDigests = canonicalDigestArray(
    input.executions.map(({ receipt }) => receipt.receiptDigest),
    'Evaluation continuation tool receipts'
  );
  const toolResultSetDigest = digestAgentCanonicalValue({
    toolResults: toolResults.map(({ toolCallId, toolId, resultDigest }) => ({
      toolCallId,
      toolId,
      resultDigest,
    })),
  });
  const base = Object.freeze({
    format: continuationReceiptFormat,
    version: 1 as const,
    planDigest: input.planDigest,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    caseId: input.caseId,
    materialDigest: input.materialDigest,
    loopPolicyDigest: input.loopPolicyDigest,
    completedTurnIndex: input.completedTurnIndex,
    nextTurnIndex: input.completedTurnIndex + 1,
    toolExecutionReceiptDigests,
    toolResultSetDigest,
  });
  return Object.freeze({
    receipt: Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    }),
    toolResults: Object.freeze(toolResults),
  });
};

const validateToolExecutionReceipt = (
  receipt: AgentEvaluationControlledToolExecutionReceipt,
  input: AgentEvaluationControlledRuntimeInput
): AgentEvaluationControlledToolExecutionReceipt => {
  exact(
    receipt,
    [
      'format',
      'version',
      'planDigest',
      'attemptId',
      'descriptorDigest',
      'caseId',
      'materialDigest',
      'loopPolicyDigest',
      'grantDigest',
      'toolRegistryDigest',
      'toolDefinitionDigest',
      'inputSchemaDigest',
      'generation',
      'idempotencyKey',
      'operationIntentDigest',
      'turnIndex',
      'toolCallId',
      'toolId',
      'argumentsDigest',
      'status',
      'resultDigest',
      'persistedArtifacts',
      'commandReceiptDigests',
      'transactionReceiptDigests',
      'receiptDigest',
    ],
    'Evaluation controlled tool receipt'
  );
  const { receiptDigest, ...base } = receipt;
  if (
    receipt.format !== toolExecutionReceiptFormat ||
    receipt.version !== 1 ||
    receipt.planDigest !== input.planDigest ||
    receipt.attemptId !== input.attemptId ||
    receipt.descriptorDigest !== input.descriptorDigest ||
    receipt.caseId !== input.caseId ||
    receipt.materialDigest !== input.materialDigest ||
    receipt.loopPolicyDigest !== input.loopPolicyDigest ||
    !isAgentCanonicalDigest(receipt.grantDigest) ||
    !isAgentCanonicalDigest(receipt.toolRegistryDigest) ||
    !isAgentCanonicalDigest(receipt.toolDefinitionDigest) ||
    !isAgentCanonicalDigest(receipt.inputSchemaDigest) ||
    !boundedCount(receipt.generation) ||
    receipt.generation < 1 ||
    !isAgentControlIdentity(receipt.idempotencyKey) ||
    !isAgentCanonicalDigest(receipt.operationIntentDigest) ||
    !boundedCount(receipt.turnIndex) ||
    receipt.turnIndex >= input.maximumTurnsPerAttempt ||
    !isAgentControlIdentity(receipt.toolCallId) ||
    !isAgentControlIdentity(receipt.toolId) ||
    !isAgentCanonicalDigest(receipt.argumentsDigest) ||
    !['succeeded', 'rejected'].includes(receipt.status) ||
    !isAgentCanonicalDigest(receipt.resultDigest) ||
    !Array.isArray(receipt.persistedArtifacts) ||
    !Array.isArray(receipt.commandReceiptDigests) ||
    !Array.isArray(receipt.transactionReceiptDigests) ||
    receipt.persistedArtifacts.length > maximumReceiptCount ||
    !isAgentCanonicalDigest(receiptDigest) ||
    receiptDigest !== digestAgentCanonicalValue(base)
  ) {
    throw new TypeError('Evaluation controlled tool receipt is invalid.');
  }
  canonicalDigestArray(
    receipt.commandReceiptDigests,
    'Evaluation command receipt digests'
  );
  canonicalDigestArray(
    receipt.transactionReceiptDigests,
    'Evaluation transaction receipt digests'
  );
  const artifactKeys = receipt.persistedArtifacts.map((artifact) => {
    normalizePersistedArtifact(artifact);
    if (
      !isAgentControlIdentity(artifact.artifactRef) ||
      !isAgentCanonicalDigest(artifact.artifactDigest) ||
      !boundedArtifactBytes(artifact.byteLength) ||
      !isAgentCanonicalDigest(artifact.persistenceReceiptDigest) ||
      ![
        'proposal',
        'verification-plan',
        'tool-receipt',
        'transaction-receipt',
        'verification-closure',
        'diagnostic-report',
      ].includes(artifact.artifactKind)
    ) {
      throw new TypeError('Evaluation persisted artifact receipt is invalid.');
    }
    return `${artifact.artifactKind}\u0000${artifact.artifactRef}`;
  });
  if (
    new Set(artifactKeys).size !== artifactKeys.length ||
    (receipt.status === 'rejected' && receipt.persistedArtifacts.length > 0)
  ) {
    throw new TypeError('Evaluation persisted artifact coverage is invalid.');
  }
  return receipt;
};

const validateContinuationReceipt = (
  receipt: AgentEvaluationControlledContinuationReceipt,
  input: AgentEvaluationControlledRuntimeInput
): AgentEvaluationControlledContinuationReceipt => {
  exact(
    receipt,
    [
      'format',
      'version',
      'planDigest',
      'attemptId',
      'descriptorDigest',
      'caseId',
      'materialDigest',
      'loopPolicyDigest',
      'completedTurnIndex',
      'nextTurnIndex',
      'toolExecutionReceiptDigests',
      'toolResultSetDigest',
      'receiptDigest',
    ],
    'Evaluation controlled continuation receipt'
  );
  const { receiptDigest, ...base } = receipt;
  if (
    receipt.format !== continuationReceiptFormat ||
    receipt.version !== 1 ||
    receipt.planDigest !== input.planDigest ||
    receipt.attemptId !== input.attemptId ||
    receipt.descriptorDigest !== input.descriptorDigest ||
    receipt.caseId !== input.caseId ||
    receipt.materialDigest !== input.materialDigest ||
    receipt.loopPolicyDigest !== input.loopPolicyDigest ||
    !boundedCount(receipt.completedTurnIndex) ||
    receipt.nextTurnIndex !== receipt.completedTurnIndex + 1 ||
    receipt.nextTurnIndex >= input.maximumTurnsPerAttempt ||
    !Array.isArray(receipt.toolExecutionReceiptDigests) ||
    receipt.toolExecutionReceiptDigests.length < 1 ||
    !isAgentCanonicalDigest(receipt.toolResultSetDigest) ||
    !isAgentCanonicalDigest(receiptDigest) ||
    receiptDigest !== digestAgentCanonicalValue(base)
  ) {
    throw new TypeError(
      'Evaluation controlled continuation receipt is invalid.'
    );
  }
  canonicalDigestArray(
    receipt.toolExecutionReceiptDigests,
    'Evaluation continuation tool receipts'
  );
  return receipt;
};

export const createAgentEvaluationControlledRuntimeReceipt = (
  input: AgentEvaluationControlledRuntimeInput,
  result: AgentEvaluationControlledRuntimeResult
): AgentEvaluationControlledRuntimeReceipt => {
  exact(
    input,
    [
      'planDigest',
      'repositoryCommit',
      'attemptId',
      'descriptorDigest',
      'caseId',
      'caseDigest',
      'materialDigest',
      'submission',
      'submissionReceipt',
      'toolExecutionReceipts',
      'continuationReceipts',
      'requiresControlledPreview',
      'runtimeAuthorityId',
      'runtimeImplementationDigest',
      'artifactResolutionPolicyDigest',
      'proposalValidationPolicyDigest',
      'isolationPolicyDigest',
      'g3VerificationPolicyDigest',
      'controlledRenderPolicyDigest',
      'loopPolicyDigest',
      'maximumTurnsPerAttempt',
      'maximumToolCallsPerAttempt',
      'maximumRepairRoundsPerAttempt',
      'maximumAggregateArtifactBytes',
    ],
    'Evaluation controlled runtime input'
  );
  const resultRecord = exact(
    result,
    [
      'grantDigest',
      'grantGeneration',
      'toolRegistryDigest',
      'actionRegistryDigest',
      'operationSealReceiptDigests',
      'ownerAuthorityReceiptDigests',
      'verificationAttemptGrantReceiptDigests',
      ...(result.producedCapabilityExecutionReceiptSetDigest === undefined
        ? []
        : ['producedCapabilityExecutionReceiptSetDigest']),
      'baseSnapshotDigest',
      'finalSnapshotDigest',
      'cleanupReceiptDigest',
      'sourceReferencesRevoked',
      'sandboxDestroyed',
      'artifactResolution',
      'proposalValidation',
      'isolatedExecution',
      'g3Verification',
      ...(result.controlledPreview === undefined ? [] : ['controlledPreview']),
    ],
    'Evaluation controlled runtime result'
  );
  validateSubmissionReceipt(input.submission, input.submissionReceipt);
  if (
    !isAgentCanonicalDigest(input.planDigest) ||
    !exactCommit(input.repositoryCommit) ||
    !isAgentControlIdentity(input.attemptId) ||
    !isAgentCanonicalDigest(input.descriptorDigest) ||
    !isAgentControlIdentity(input.caseId) ||
    !isAgentCanonicalDigest(input.caseDigest) ||
    !isAgentCanonicalDigest(input.materialDigest) ||
    typeof input.requiresControlledPreview !== 'boolean' ||
    input.submission.caseId !== input.caseId ||
    input.submission.caseDigest !== input.caseDigest ||
    input.submission.materialDigest !== input.materialDigest ||
    input.submissionReceipt.attemptId !== input.attemptId ||
    input.submissionReceipt.descriptorDigest !== input.descriptorDigest ||
    !isAgentControlIdentity(input.runtimeAuthorityId) ||
    !isAgentCanonicalDigest(input.runtimeImplementationDigest) ||
    !isAgentCanonicalDigest(input.artifactResolutionPolicyDigest) ||
    !isAgentCanonicalDigest(input.proposalValidationPolicyDigest) ||
    !isAgentCanonicalDigest(input.isolationPolicyDigest) ||
    !isAgentCanonicalDigest(input.g3VerificationPolicyDigest) ||
    !isAgentCanonicalDigest(input.controlledRenderPolicyDigest) ||
    !isAgentCanonicalDigest(input.loopPolicyDigest) ||
    !boundedCount(input.maximumTurnsPerAttempt) ||
    input.maximumTurnsPerAttempt < 2 ||
    !boundedCount(input.maximumToolCallsPerAttempt) ||
    input.maximumToolCallsPerAttempt < 1 ||
    input.maximumToolCallsPerAttempt >= input.maximumTurnsPerAttempt ||
    !boundedCount(input.maximumRepairRoundsPerAttempt) ||
    input.maximumRepairRoundsPerAttempt < 1 ||
    !boundedArtifactBytes(input.maximumAggregateArtifactBytes) ||
    input.maximumAggregateArtifactBytes < 1 ||
    input.maximumAggregateArtifactBytes > maximumAggregateArtifactBytes ||
    !Array.isArray(input.toolExecutionReceipts) ||
    !Array.isArray(input.continuationReceipts) ||
    input.toolExecutionReceipts.length > input.maximumToolCallsPerAttempt ||
    input.continuationReceipts.length >= input.maximumTurnsPerAttempt
  ) {
    throw new TypeError('Evaluation controlled runtime binding is invalid.');
  }
  const artifact = exact(
    resultRecord.artifactResolution,
    [
      'resolvedArtifactCount',
      'resolvedArtifactBytes',
      'artifactResolutionReceiptSetDigest',
    ],
    'Evaluation artifact resolution result'
  );
  const proposal = exact(
    resultRecord.proposalValidation,
    ['verdict', 'typedProposalValidationReceiptDigest'],
    'Evaluation proposal validation result'
  );
  const executionValue = resultRecord.isolatedExecution;
  const execution = exact(
    executionValue,
    [
      'isolationPolicyDigest',
      'toolCallCount',
      'repairRoundCount',
      'commandCount',
      'commandReceiptSetDigest',
      'transactionCount',
      ...(isPlainObject(executionValue) &&
      Object.hasOwn(executionValue, 'toolReceiptSetDigest')
        ? ['toolReceiptSetDigest']
        : []),
      ...(isPlainObject(executionValue) &&
      Object.hasOwn(executionValue, 'transactionReceiptSetDigest')
        ? ['transactionReceiptSetDigest']
        : []),
    ],
    'Evaluation isolated execution result'
  );
  const verification = exact(
    resultRecord.g3Verification,
    ['verificationPlanReceiptDigest', 'verificationClosureDigest', 'verdict'],
    'Evaluation G3 verification result'
  );
  const controlledPreview =
    resultRecord.controlledPreview === undefined
      ? undefined
      : validateControlledPreview(resultRecord.controlledPreview);
  if (
    !Array.isArray(resultRecord.operationSealReceiptDigests) ||
    !Array.isArray(resultRecord.ownerAuthorityReceiptDigests) ||
    !Array.isArray(resultRecord.verificationAttemptGrantReceiptDigests)
  ) {
    throw new TypeError('Evaluation controlled runtime authority is invalid.');
  }
  const operationSealReceiptDigests = canonicalDigestArray(
    resultRecord.operationSealReceiptDigests as readonly CanonicalDigest[],
    'Evaluation operation seal receipt digests'
  );
  const ownerAuthorityReceiptDigests = canonicalDigestArray(
    resultRecord.ownerAuthorityReceiptDigests as readonly CanonicalDigest[],
    'Evaluation owner authority receipt digests'
  );
  const verificationAttemptGrantReceiptDigests = canonicalDigestArray(
    resultRecord.verificationAttemptGrantReceiptDigests as readonly CanonicalDigest[],
    'Evaluation Verification AttemptGrant receipt digests'
  );
  const toolExecutionReceipts = input.toolExecutionReceipts.map((receipt) =>
    validateToolExecutionReceipt(receipt, input)
  );
  const continuationReceipts = input.continuationReceipts.map((receipt) =>
    validateContinuationReceipt(receipt, input)
  );
  const toolReceiptDigests = toolExecutionReceipts
    .map(({ receiptDigest }) => receiptDigest)
    .sort(compareUnicodeCodePoints);
  const operationIntentDigests = toolExecutionReceipts
    .map(({ operationIntentDigest }) => operationIntentDigest)
    .sort(compareUnicodeCodePoints);
  const continuedToolReceiptDigests = continuationReceipts
    .flatMap(({ toolExecutionReceiptDigests }) => toolExecutionReceiptDigests)
    .sort(compareUnicodeCodePoints);
  const continuationReceiptDigests = continuationReceipts
    .map(({ receiptDigest }) => receiptDigest)
    .sort(compareUnicodeCodePoints);
  const commandReceiptDigests = toolExecutionReceipts
    .flatMap(({ commandReceiptDigests }) => commandReceiptDigests)
    .sort(compareUnicodeCodePoints);
  const transactionReceiptDigests = toolExecutionReceipts
    .flatMap(({ transactionReceiptDigests }) => transactionReceiptDigests)
    .sort(compareUnicodeCodePoints);
  const persistedArtifacts = toolExecutionReceipts
    .flatMap(({ persistedArtifacts }) => persistedArtifacts)
    .sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.artifactKind}\u0000${left.artifactRef}`,
        `${right.artifactKind}\u0000${right.artifactRef}`
      )
    );
  const persistedArtifactBytes = persistedArtifacts.reduce(
    (total, { byteLength }) => total + byteLength,
    0
  );
  const submittedArtifacts = [...input.submission.artifactRefs].sort(
    (left, right) =>
      compareUnicodeCodePoints(
        `${left.artifactKind}\u0000${left.artifactRef}`,
        `${right.artifactKind}\u0000${right.artifactRef}`
      )
  );
  const artifactPersistenceReceiptDigests = persistedArtifacts
    .map(({ persistenceReceiptDigest }) => persistenceReceiptDigest)
    .sort(compareUnicodeCodePoints);
  const persistedArtifactKeys = persistedArtifacts.map(
    ({ artifactKind, artifactRef }) => `${artifactKind}\u0000${artifactRef}`
  );
  const submittedArtifactBytes = input.submission.artifactRefs.reduce(
    (total, { byteLength }) => total + byteLength,
    0
  );
  const exactPersistedArtifactCoverage = sameCanonicalJson(
    submittedArtifacts,
    persistedArtifacts.map(
      ({ artifactKind, artifactRef, artifactDigest, byteLength }) => ({
        artifactKind,
        artifactRef,
        artifactDigest,
        byteLength,
      })
    )
  );
  const validResult =
    isAgentCanonicalDigest(resultRecord.grantDigest) &&
    boundedCount(resultRecord.grantGeneration) &&
    Number(resultRecord.grantGeneration) >= 1 &&
    isAgentCanonicalDigest(resultRecord.toolRegistryDigest) &&
    isAgentCanonicalDigest(resultRecord.actionRegistryDigest) &&
    (resultRecord.producedCapabilityExecutionReceiptSetDigest === undefined ||
      isAgentCanonicalDigest(
        resultRecord.producedCapabilityExecutionReceiptSetDigest
      )) &&
    isAgentCanonicalDigest(resultRecord.baseSnapshotDigest) &&
    isAgentCanonicalDigest(resultRecord.finalSnapshotDigest) &&
    isAgentCanonicalDigest(resultRecord.cleanupReceiptDigest) &&
    resultRecord.sourceReferencesRevoked === true &&
    resultRecord.sandboxDestroyed === true &&
    ownerAuthorityReceiptDigests.length > 0 &&
    verificationAttemptGrantReceiptDigests.every((digest) =>
      ownerAuthorityReceiptDigests.includes(digest)
    ) &&
    boundedCount(artifact.resolvedArtifactCount) &&
    boundedArtifactBytes(artifact.resolvedArtifactBytes) &&
    Number(artifact.resolvedArtifactBytes) <=
      input.maximumAggregateArtifactBytes &&
    isAgentCanonicalDigest(artifact.artifactResolutionReceiptSetDigest) &&
    ['passed', 'failed'].includes(String(proposal.verdict)) &&
    isAgentCanonicalDigest(proposal.typedProposalValidationReceiptDigest) &&
    isAgentCanonicalDigest(execution.isolationPolicyDigest) &&
    execution.isolationPolicyDigest === input.isolationPolicyDigest &&
    boundedCount(execution.toolCallCount) &&
    Number(execution.toolCallCount) > 0 ===
      isAgentCanonicalDigest(execution.toolReceiptSetDigest) &&
    boundedCount(execution.repairRoundCount) &&
    Number(execution.repairRoundCount) <= input.maximumRepairRoundsPerAttempt &&
    boundedCount(execution.commandCount) &&
    isAgentCanonicalDigest(execution.commandReceiptSetDigest) &&
    boundedCount(execution.transactionCount) &&
    Number(execution.transactionCount) > 0 ===
      isAgentCanonicalDigest(execution.transactionReceiptSetDigest) &&
    isAgentCanonicalDigest(verification.verificationPlanReceiptDigest) &&
    isAgentCanonicalDigest(verification.verificationClosureDigest) &&
    ['passed', 'failed'].includes(String(verification.verdict));
  const passed =
    proposal.verdict === 'passed' && verification.verdict === 'passed';
  if (
    !validResult ||
    !Number.isSafeInteger(persistedArtifactBytes) ||
    persistedArtifactBytes > input.maximumAggregateArtifactBytes ||
    !Number.isSafeInteger(submittedArtifactBytes) ||
    submittedArtifactBytes > input.maximumAggregateArtifactBytes ||
    new Set(persistedArtifactKeys).size !== persistedArtifactKeys.length ||
    new Set(toolReceiptDigests).size !== toolReceiptDigests.length ||
    new Set(operationIntentDigests).size !== operationIntentDigests.length ||
    new Set(commandReceiptDigests).size !== commandReceiptDigests.length ||
    new Set(transactionReceiptDigests).size !==
      transactionReceiptDigests.length ||
    operationSealReceiptDigests.length !== toolExecutionReceipts.length ||
    toolExecutionReceipts.some(
      (receipt) =>
        receipt.grantDigest !== resultRecord.grantDigest ||
        receipt.generation !== resultRecord.grantGeneration ||
        receipt.toolRegistryDigest !== resultRecord.toolRegistryDigest
    ) ||
    new Set(toolExecutionReceipts.map(({ idempotencyKey }) => idempotencyKey))
      .size !== toolExecutionReceipts.length ||
    !sameCanonicalJson(continuedToolReceiptDigests, toolReceiptDigests) ||
    Number(execution.toolCallCount) !== toolExecutionReceipts.length ||
    Number(execution.commandCount) !== commandReceiptDigests.length ||
    Number(execution.transactionCount) !== transactionReceiptDigests.length ||
    (toolReceiptDigests.length > 0 &&
      execution.toolReceiptSetDigest !==
        digestAgentCanonicalValue({ toolReceiptDigests })) ||
    execution.commandReceiptSetDigest !==
      digestAgentCanonicalValue({ commandReceiptDigests }) ||
    (transactionReceiptDigests.length > 0 &&
      execution.transactionReceiptSetDigest !==
        digestAgentCanonicalValue({ transactionReceiptDigests })) ||
    artifact.artifactResolutionReceiptSetDigest !==
      digestAgentCanonicalValue({ artifactPersistenceReceiptDigests }) ||
    Number(artifact.resolvedArtifactCount) !== persistedArtifacts.length ||
    Number(artifact.resolvedArtifactBytes) !== persistedArtifactBytes ||
    (passed &&
      Number(artifact.resolvedArtifactCount) !==
        input.submission.artifactRefs.length) ||
    (passed &&
      Number(artifact.resolvedArtifactBytes) !== submittedArtifactBytes) ||
    (passed && !exactPersistedArtifactCoverage) ||
    (verification.verdict === 'passed' && proposal.verdict !== 'passed') ||
    (passed && input.requiresControlledPreview && !controlledPreview) ||
    (controlledPreview !== undefined &&
      controlledPreview.renderPolicyDigest !==
        input.controlledRenderPolicyDigest) ||
    (!input.requiresControlledPreview && controlledPreview !== undefined)
  ) {
    throw new TypeError('Evaluation controlled runtime result is invalid.');
  }
  const base = Object.freeze({
    format: runtimeReceiptFormat,
    version: 1 as const,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    caseId: input.caseId,
    caseDigest: input.caseDigest,
    materialDigest: input.materialDigest,
    submissionReceiptDigest: input.submissionReceipt.receiptDigest,
    runtimeAuthorityId: input.runtimeAuthorityId,
    runtimeImplementationDigest: input.runtimeImplementationDigest,
    artifactResolutionPolicyDigest: input.artifactResolutionPolicyDigest,
    proposalValidationPolicyDigest: input.proposalValidationPolicyDigest,
    isolationPolicyDigest: input.isolationPolicyDigest,
    g3VerificationPolicyDigest: input.g3VerificationPolicyDigest,
    controlledRenderPolicyDigest: input.controlledRenderPolicyDigest,
    loopPolicyDigest: input.loopPolicyDigest,
    maximumTurnsPerAttempt: input.maximumTurnsPerAttempt,
    maximumToolCallsPerAttempt: input.maximumToolCallsPerAttempt,
    maximumRepairRoundsPerAttempt: input.maximumRepairRoundsPerAttempt,
    maximumAggregateArtifactBytes: input.maximumAggregateArtifactBytes,
    grantDigest: resultRecord.grantDigest,
    grantGeneration: resultRecord.grantGeneration,
    toolRegistryDigest: resultRecord.toolRegistryDigest,
    actionRegistryDigest: resultRecord.actionRegistryDigest,
    operationSealReceiptDigests,
    ownerAuthorityReceiptDigests,
    verificationAttemptGrantReceiptDigests,
    ...(resultRecord.producedCapabilityExecutionReceiptSetDigest
      ? {
          producedCapabilityExecutionReceiptSetDigest:
            resultRecord.producedCapabilityExecutionReceiptSetDigest,
        }
      : {}),
    baseSnapshotDigest: resultRecord.baseSnapshotDigest,
    finalSnapshotDigest: resultRecord.finalSnapshotDigest,
    cleanupReceiptDigest: resultRecord.cleanupReceiptDigest,
    sourceReferencesRevoked: true as const,
    sandboxDestroyed: true as const,
    ...(toolReceiptDigests.length > 0
      ? {
          toolExecutionReceiptSetDigest: digestAgentCanonicalValue({
            toolReceiptDigests,
          }),
        }
      : {}),
    ...(continuationReceiptDigests.length > 0
      ? {
          continuationReceiptSetDigest: digestAgentCanonicalValue({
            continuationReceiptDigests,
          }),
        }
      : {}),
    ...(operationIntentDigests.length > 0
      ? {
          operationIntentSetDigest: digestAgentCanonicalValue({
            operationIntentDigests,
          }),
          operationSealSetDigest: digestAgentCanonicalValue({
            operationSealReceiptDigests,
          }),
        }
      : {}),
    ...(verificationAttemptGrantReceiptDigests.length > 0
      ? {
          verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
            verificationAttemptGrantReceiptDigests,
          }),
        }
      : {}),
    ownerAuthoritySetDigest: digestAgentCanonicalValue({
      ownerAuthorityReceiptDigests,
    }),
    artifactResolution: Object.freeze({
      resolvedArtifactCount: artifact.resolvedArtifactCount,
      resolvedArtifactBytes: artifact.resolvedArtifactBytes,
      artifactResolutionReceiptSetDigest:
        artifact.artifactResolutionReceiptSetDigest,
    }),
    proposalValidation: Object.freeze({
      verdict: proposal.verdict,
      typedProposalValidationReceiptDigest:
        proposal.typedProposalValidationReceiptDigest,
    }),
    isolatedExecution: Object.freeze({
      isolationPolicyDigest: execution.isolationPolicyDigest,
      toolCallCount: execution.toolCallCount,
      ...(execution.toolReceiptSetDigest
        ? { toolReceiptSetDigest: execution.toolReceiptSetDigest }
        : {}),
      repairRoundCount: execution.repairRoundCount,
      commandCount: execution.commandCount,
      commandReceiptSetDigest: execution.commandReceiptSetDigest,
      transactionCount: execution.transactionCount,
      ...(execution.transactionReceiptSetDigest
        ? {
            transactionReceiptSetDigest: execution.transactionReceiptSetDigest,
          }
        : {}),
    }),
    g3Verification: Object.freeze({
      verificationPlanReceiptDigest: verification.verificationPlanReceiptDigest,
      verificationClosureDigest: verification.verificationClosureDigest,
      verdict: verification.verdict,
    }),
    ...(controlledPreview ? { controlledPreview } : {}),
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  }) as AgentEvaluationControlledRuntimeReceipt;
};

export const validateAgentEvaluationControlledRuntimeReceipt = (
  input: AgentEvaluationControlledRuntimeInput,
  receipt: AgentEvaluationControlledRuntimeReceipt
): AgentEvaluationControlledRuntimeReceipt => {
  const recreated = createAgentEvaluationControlledRuntimeReceipt(input, {
    grantDigest: receipt.grantDigest,
    grantGeneration: receipt.grantGeneration,
    toolRegistryDigest: receipt.toolRegistryDigest,
    actionRegistryDigest: receipt.actionRegistryDigest,
    operationSealReceiptDigests: receipt.operationSealReceiptDigests,
    ownerAuthorityReceiptDigests: receipt.ownerAuthorityReceiptDigests,
    verificationAttemptGrantReceiptDigests:
      receipt.verificationAttemptGrantReceiptDigests,
    ...(receipt.producedCapabilityExecutionReceiptSetDigest
      ? {
          producedCapabilityExecutionReceiptSetDigest:
            receipt.producedCapabilityExecutionReceiptSetDigest,
        }
      : {}),
    baseSnapshotDigest: receipt.baseSnapshotDigest,
    finalSnapshotDigest: receipt.finalSnapshotDigest,
    cleanupReceiptDigest: receipt.cleanupReceiptDigest,
    sourceReferencesRevoked: receipt.sourceReferencesRevoked,
    sandboxDestroyed: receipt.sandboxDestroyed,
    artifactResolution: receipt.artifactResolution,
    proposalValidation: receipt.proposalValidation,
    isolatedExecution: receipt.isolatedExecution,
    g3Verification: receipt.g3Verification,
    ...(receipt.controlledPreview
      ? { controlledPreview: receipt.controlledPreview }
      : {}),
  });
  if (
    receipt.receiptDigest !== recreated.receiptDigest ||
    !sameCanonicalJson(receipt, recreated)
  ) {
    throw new TypeError('Evaluation controlled runtime receipt drifted.');
  }
  return recreated;
};
