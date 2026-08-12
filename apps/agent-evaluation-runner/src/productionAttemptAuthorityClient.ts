import {
  createAgentEvaluationAttemptAuthorityResponseProjection,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  isAgentEvaluationCapabilityPreEffectIntent,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  planAgentModelEvaluationAttempts,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  validateAgentEvaluationAttemptGrading,
  type AgentEvaluationAttemptGrading,
  type AgentEvaluationAttemptGradingInput,
  type AgentEvaluationAttemptGradingPersistence,
} from './attemptExecutor';
import {
  isAgentEvaluationCapabilityRuntimeAssessment,
  validateAgentEvaluationCapabilityRuntimeToolOutput,
  type AgentEvaluationCapabilityRuntime,
  type AgentEvaluationCapabilityRuntimeAssessment,
  type AgentEvaluationCapabilityRuntimeAssessmentInput,
  type AgentEvaluationCapabilityRuntimeToolInput,
  type AgentEvaluationCapabilityRuntimeToolOutput,
} from './capabilityRuntime';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
  AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS,
  createEnvironmentAgentEvaluationLedgerClient,
} from './ledgerClient';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_REQUEST_FORMAT =
  'prodivix.agent-evaluation-attempt-authority-request' as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-attempt-authority-response' as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_VERSION = 1 as const;
export const AGENT_EVALUATION_CAPABILITY_AUTHORITY_DEFAULT_TIMEOUT_MS =
  125_000 as const;
export const AGENT_EVALUATION_GRADING_AUTHORITY_DEFAULT_TIMEOUT_MS =
  AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS;

export type AgentEvaluationAttemptAuthorityServiceKind =
  'capability-runtime' | 'attempt-grading';
export type AgentEvaluationAttemptAuthorityOperation =
  'execute-tool' | 'assess-capability' | 'grade-and-persist';

export type AgentEvaluationAttemptAuthorityRequest = Readonly<{
  format: typeof AGENT_EVALUATION_ATTEMPT_AUTHORITY_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_ATTEMPT_AUTHORITY_VERSION;
  serviceKind: AgentEvaluationAttemptAuthorityServiceKind;
  operation: AgentEvaluationAttemptAuthorityOperation;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  claimGeneration: 1;
  payloadDigest: CanonicalDigest;
  requestDigest: CanonicalDigest;
  payload: unknown;
}>;

export type AgentEvaluationAttemptAuthorityResponse = Readonly<{
  format: typeof AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESPONSE_FORMAT;
  version: typeof AGENT_EVALUATION_ATTEMPT_AUTHORITY_VERSION;
  serviceKind: AgentEvaluationAttemptAuthorityServiceKind;
  operation: AgentEvaluationAttemptAuthorityOperation;
  requestDigest: CanonicalDigest;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  replayed: boolean;
  authorityReceipt: AgentEvaluationAttemptAuthorityOwnerReceipt;
  response: unknown;
}>;

export type CreateEnvironmentAgentEvaluationAttemptAuthorityClientsInput =
  Readonly<{
    plan: AgentModelEvaluationPlan;
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    fetch?: typeof fetch;
    timeoutMs?: number;
    capabilityOperationTimeoutMs?: number;
    gradingOperationTimeoutMs?: number;
  }>;

export type EnvironmentAgentEvaluationAttemptAuthorityClients = Readonly<{
  capabilityRuntime: AgentEvaluationCapabilityRuntime;
  gradeAndPersist: AgentEvaluationAttemptGradingPersistence;
}>;

export type AgentEvaluationAttemptAuthorityBinding = Readonly<{
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
}>;

const repositoryCommitPattern = /^[a-f0-9]{40}$/u;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && keys.includes(key)
  );

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const positiveGeneration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const operationTimeout = (
  value: number | undefined,
  fallback: number
): number => {
  const candidate = value ?? fallback;
  if (
    !Number.isSafeInteger(candidate) ||
    candidate < 1 ||
    candidate > AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS
  ) {
    return unavailable();
  }
  return candidate;
};

export const resolveAgentEvaluationAttemptAuthorityOperationTimeoutMs = (
  serviceKind: AgentEvaluationAttemptAuthorityServiceKind,
  configured?: number
): number =>
  operationTimeout(
    configured,
    serviceKind === 'attempt-grading'
      ? AGENT_EVALUATION_GRADING_AUTHORITY_DEFAULT_TIMEOUT_MS
      : AGENT_EVALUATION_CAPABILITY_AUTHORITY_DEFAULT_TIMEOUT_MS
  );

const assertConfigured = (
  input: CreateEnvironmentAgentEvaluationAttemptAuthorityClientsInput,
  read: AgentEvaluationEnvironmentReader
): Readonly<{ namespaceId: string }> => {
  let token: string | undefined;
  try {
    token = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
    const namespaceId = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    if (
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl) !==
        AGENT_EVALUATION_LEDGER_BASE_URL ||
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit) !==
        input.plan.repositoryCommit ||
      !isAgentControlIdentity(namespaceId) ||
      !isAgentEvaluationServiceToken(token) ||
      !isAgentCanonicalDigest(input.plan.planDigest) ||
      !repositoryCommitPattern.test(input.plan.repositoryCommit)
    ) {
      return unavailable();
    }
    return Object.freeze({ namespaceId });
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return unavailable();
  } finally {
    token = undefined;
  }
};

const bindingForTool = (
  input: AgentEvaluationCapabilityRuntimeToolInput
): AgentEvaluationAttemptAuthorityBinding =>
  Object.freeze({
    namespaceId: input.namespaceId,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    shardLeaseOwnerId: input.shardLeaseOwnerId,
    shardLeaseGeneration: input.shardLeaseGeneration,
    verificationGrantGeneration: input.verificationGrantGeneration,
    verificationAttemptGrantReceiptSetDigest:
      input.verificationAttemptGrantReceiptSetDigest,
  });

const bindingForAssessment = (
  input:
    | AgentEvaluationCapabilityRuntimeAssessmentInput
    | AgentEvaluationAttemptGradingInput
): AgentEvaluationAttemptAuthorityBinding =>
  Object.freeze({
    namespaceId: input.namespaceId,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    shardLeaseOwnerId: input.shardLeaseOwnerId,
    shardLeaseGeneration: input.shardLeaseGeneration,
    verificationGrantGeneration: input.verificationGrantGeneration,
    verificationAttemptGrantReceiptSetDigest:
      input.verificationAttemptGrantReceiptSetDigest,
  });

const assertBinding = (
  binding: AgentEvaluationAttemptAuthorityBinding,
  expected: Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
  }>
): AgentEvaluationAttemptAuthorityBinding => {
  if (
    binding.namespaceId !== expected.namespaceId ||
    binding.planDigest !== expected.planDigest ||
    binding.repositoryCommit !== expected.repositoryCommit ||
    !isAgentControlIdentity(binding.attemptId) ||
    !isAgentCanonicalDigest(binding.descriptorDigest) ||
    !isAgentControlIdentity(binding.shardLeaseOwnerId) ||
    !positiveGeneration(binding.shardLeaseGeneration) ||
    !positiveGeneration(binding.verificationGrantGeneration) ||
    !isAgentCanonicalDigest(binding.verificationAttemptGrantReceiptSetDigest)
  ) {
    return unavailable();
  }
  return binding;
};

const requestDigestBase = (
  input: Omit<
    AgentEvaluationAttemptAuthorityRequest,
    'requestDigest' | 'payload'
  >
) => input;

const responseBindingForRequest = (
  request: AgentEvaluationAttemptAuthorityRequest
) => {
  if (request.operation === 'grade-and-persist') return undefined;
  const payload = request.payload;
  if (request.operation === 'assess-capability') {
    if (
      !isPlainObject(payload) ||
      !Number.isSafeInteger(payload.terminalTurnIndex) ||
      Number(payload.terminalTurnIndex) < 0 ||
      Number(payload.terminalTurnIndex) > 64 ||
      !isAgentControlIdentity(payload.terminalInvocationId) ||
      !isPlainObject(payload.material) ||
      !isAgentCanonicalDigest(payload.material.materialDigest) ||
      !isPlainObject(payload.capabilityDescriptor) ||
      !isAgentCanonicalDigest(payload.capabilityDescriptor.descriptorDigest)
    ) {
      return responseInvalid();
    }
    return Object.freeze({
      bindingKind: 'assess-capability' as const,
      terminalTurnIndex: payload.terminalTurnIndex as number,
      terminalInvocationId: payload.terminalInvocationId,
      materialDigest: payload.material.materialDigest,
      capabilityDescriptorDigest: payload.capabilityDescriptor.descriptorDigest,
    });
  }
  if (
    !isPlainObject(payload) ||
    !['shared-effect', 'observation-control'].includes(
      String(payload.executionAuthorityKind)
    ) ||
    !isAgentControlIdentity(payload.invocationId) ||
    !Number.isSafeInteger(payload.turnIndex) ||
    Number(payload.turnIndex) < 0 ||
    Number(payload.turnIndex) > 64 ||
    !isAgentControlIdentity(payload.toolId) ||
    !isAgentControlIdentity(payload.toolCallId) ||
    !isAgentControlIdentity(payload.providerToolCallId) ||
    !isAgentCanonicalDigest(payload.requestDigest)
  ) {
    return responseInvalid();
  }
  const base = Object.freeze({
    bindingKind: 'execute-tool' as const,
    invocationId: payload.invocationId,
    turnIndex: payload.turnIndex as number,
    toolId: payload.toolId,
    toolCallId: payload.toolCallId,
    providerToolCallId: payload.providerToolCallId,
    providerRequestDigest: payload.requestDigest,
  });
  if (payload.executionAuthorityKind === 'shared-effect') {
    if (!isAgentEvaluationCapabilityPreEffectIntent(payload.preEffectIntent)) {
      return responseInvalid();
    }
    return Object.freeze({
      ...base,
      executionAuthorityKind: payload.executionAuthorityKind,
      preEffectIntent: payload.preEffectIntent,
    });
  }
  if (
    payload.executionAuthorityKind !== 'observation-control' ||
    !isAgentEvaluationProviderCapabilityObservationReceipt(
      payload.providerCapabilityObservationReceipt
    )
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    ...base,
    executionAuthorityKind: payload.executionAuthorityKind,
    providerCapabilityObservationReceiptDigest:
      payload.providerCapabilityObservationReceipt.receiptDigest,
  });
};

export const createAgentEvaluationAttemptAuthorityRequest = (
  serviceKind: AgentEvaluationAttemptAuthorityServiceKind,
  operation: AgentEvaluationAttemptAuthorityOperation,
  binding: AgentEvaluationAttemptAuthorityBinding,
  descriptor: AgentModelEvaluationAttemptDescriptor,
  payload: unknown
): AgentEvaluationAttemptAuthorityRequest => {
  const validOperation =
    (serviceKind === 'capability-runtime' &&
      (operation === 'execute-tool' || operation === 'assess-capability')) ||
    (serviceKind === 'attempt-grading' && operation === 'grade-and-persist');
  if (
    !validOperation ||
    descriptor.attemptId !== binding.attemptId ||
    descriptor.descriptorDigest !== binding.descriptorDigest ||
    descriptor.planDigest !== binding.planDigest
  ) {
    return unavailable();
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_ATTEMPT_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_ATTEMPT_AUTHORITY_VERSION,
    serviceKind,
    operation,
    ...binding,
    descriptor,
    claimGeneration: 1 as const,
    payloadDigest: digestAgentCanonicalValue(payload),
  });
  return Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(requestDigestBase(base)),
    payload,
  });
};

export const decodeAgentEvaluationAttemptAuthorityResponse = (
  value: unknown,
  request: AgentEvaluationAttemptAuthorityRequest
): AgentEvaluationAttemptAuthorityResponse => {
  const responseBinding = responseBindingForRequest(request);
  let responseProjection: ReturnType<
    typeof createAgentEvaluationAttemptAuthorityResponseProjection
  >;
  try {
    responseProjection =
      createAgentEvaluationAttemptAuthorityResponseProjection(
        request.serviceKind,
        request.operation,
        isPlainObject(value) ? value.response : undefined,
        responseBinding
      );
  } catch {
    return responseInvalid();
  }
  if (
    !exactRecord(value, [
      'format',
      'version',
      'serviceKind',
      'operation',
      'requestDigest',
      'shardLeaseOwnerId',
      'shardLeaseGeneration',
      'verificationGrantGeneration',
      'verificationAttemptGrantReceiptSetDigest',
      'replayed',
      'authorityReceipt',
      'response',
    ]) ||
    value.format !== AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESPONSE_FORMAT ||
    value.version !== AGENT_EVALUATION_ATTEMPT_AUTHORITY_VERSION ||
    value.serviceKind !== request.serviceKind ||
    value.operation !== request.operation ||
    value.requestDigest !== request.requestDigest ||
    value.shardLeaseOwnerId !== request.shardLeaseOwnerId ||
    value.shardLeaseGeneration !== request.shardLeaseGeneration ||
    value.verificationGrantGeneration !== request.verificationGrantGeneration ||
    value.verificationAttemptGrantReceiptSetDigest !==
      request.verificationAttemptGrantReceiptSetDigest ||
    typeof value.replayed !== 'boolean' ||
    !isAgentEvaluationAttemptAuthorityOwnerReceipt(value.authorityReceipt) ||
    value.authorityReceipt.serviceKind !== request.serviceKind ||
    value.authorityReceipt.operation !== request.operation ||
    value.authorityReceipt.namespaceId !== request.namespaceId ||
    value.authorityReceipt.planDigest !== request.planDigest ||
    value.authorityReceipt.repositoryCommit !== request.repositoryCommit ||
    value.authorityReceipt.attemptId !== request.attemptId ||
    value.authorityReceipt.descriptorDigest !== request.descriptorDigest ||
    value.authorityReceipt.shardLeaseOwnerId !== request.shardLeaseOwnerId ||
    value.authorityReceipt.shardLeaseGeneration !==
      request.shardLeaseGeneration ||
    value.authorityReceipt.verificationGrantGeneration !==
      request.verificationGrantGeneration ||
    value.authorityReceipt.verificationAttemptGrantReceiptSetDigest !==
      request.verificationAttemptGrantReceiptSetDigest ||
    value.authorityReceipt.requestDigest !== request.requestDigest ||
    !sameCanonicalJson(
      value.authorityReceipt.responseProjection,
      responseProjection
    )
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    format: value.format,
    version: value.version,
    serviceKind: value.serviceKind,
    operation: value.operation,
    requestDigest: value.requestDigest,
    shardLeaseOwnerId: value.shardLeaseOwnerId,
    shardLeaseGeneration: value.shardLeaseGeneration,
    verificationGrantGeneration: value.verificationGrantGeneration,
    verificationAttemptGrantReceiptSetDigest:
      value.verificationAttemptGrantReceiptSetDigest,
    replayed: value.replayed,
    authorityReceipt: value.authorityReceipt,
    response: value.response,
  }) as AgentEvaluationAttemptAuthorityResponse;
};

/**
 * Callback-bound runner clients for Backend-journaled attempt authorities.
 * They never contact the loopback owner sidecar directly; Backend performs the
 * shard-lease/grant CAS and request-digest replay fence before proxying 8791.
 */
export const createEnvironmentAgentEvaluationAttemptAuthorityClients = (
  input: CreateEnvironmentAgentEvaluationAttemptAuthorityClientsInput
): EnvironmentAgentEvaluationAttemptAuthorityClients => {
  const environment = input.environment ?? process.env;
  const configured = assertConfigured(input, readEnvironment(environment));
  const descriptors = planAgentModelEvaluationAttempts(input.plan);
  const expected = Object.freeze({
    namespaceId: configured.namespaceId,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
  });
  const client = createEnvironmentAgentEvaluationLedgerClient({
    planDigest: input.plan.planDigest,
    environment,
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
  });
  const capabilityOperationTimeoutMs =
    resolveAgentEvaluationAttemptAuthorityOperationTimeoutMs(
      'capability-runtime',
      input.capabilityOperationTimeoutMs
    );
  const gradingOperationTimeoutMs =
    resolveAgentEvaluationAttemptAuthorityOperationTimeoutMs(
      'attempt-grading',
      input.gradingOperationTimeoutMs
    );

  const invoke = async (
    serviceKind: AgentEvaluationAttemptAuthorityServiceKind,
    operation: AgentEvaluationAttemptAuthorityOperation,
    binding: AgentEvaluationAttemptAuthorityBinding,
    payload: unknown
  ): Promise<AgentEvaluationAttemptAuthorityResponse> => {
    const descriptor = descriptors.find(
      (candidate) =>
        candidate.attemptId === binding.attemptId &&
        candidate.descriptorDigest === binding.descriptorDigest
    );
    if (!descriptor) return unavailable();
    const request = createAgentEvaluationAttemptAuthorityRequest(
      serviceKind,
      operation,
      assertBinding(binding, expected),
      descriptor,
      payload
    );
    return decodeAgentEvaluationAttemptAuthorityResponse(
      await client.postAttemptAuthority(
        {
          serviceKind,
          operation,
          requestDigest: request.requestDigest,
          request,
        },
        {
          timeoutMs:
            serviceKind === 'attempt-grading'
              ? gradingOperationTimeoutMs
              : capabilityOperationTimeoutMs,
        }
      ),
      request
    );
  };

  const capabilityRuntime: AgentEvaluationCapabilityRuntime = Object.freeze({
    async executeTool(
      toolInput: AgentEvaluationCapabilityRuntimeToolInput
    ): Promise<AgentEvaluationCapabilityRuntimeToolOutput> {
      const authority = await invoke(
        'capability-runtime',
        'execute-tool',
        bindingForTool(toolInput),
        toolInput
      );
      const response = authority.response;
      if (
        !isPlainObject(response) ||
        response.executionAuthorityKind !== toolInput.executionAuthorityKind
      ) {
        return responseInvalid();
      }
      return validateAgentEvaluationCapabilityRuntimeToolOutput(
        toolInput,
        Object.freeze({
          ...response,
          authorityReceipt: authority.authorityReceipt,
        }) as AgentEvaluationCapabilityRuntimeToolOutput
      );
    },
    async assessCapability(
      assessmentInput: AgentEvaluationCapabilityRuntimeAssessmentInput
    ): Promise<AgentEvaluationCapabilityRuntimeAssessment> {
      if (!sameCanonicalJson(assessmentInput.plan, input.plan)) {
        return unavailable();
      }
      const authority = await invoke(
        'capability-runtime',
        'assess-capability',
        bindingForAssessment(assessmentInput),
        assessmentInput
      );
      const response = authority.response;
      if (
        !isPlainObject(response) ||
        !Object.hasOwn(response, 'outcome') ||
        !Object.hasOwn(response, 'specificReceipts')
      ) {
        return responseInvalid();
      }
      const assessment = Object.freeze({
        ...response,
        authorityReceipt: authority.authorityReceipt,
      });
      if (!isAgentEvaluationCapabilityRuntimeAssessment(assessment)) {
        return responseInvalid();
      }
      return assessment;
    },
  });

  const gradeAndPersist: AgentEvaluationAttemptGradingPersistence = async (
    gradingInput
  ): Promise<AgentEvaluationAttemptGrading> => {
    if (!sameCanonicalJson(gradingInput.plan, input.plan)) {
      return unavailable();
    }
    const authority = await invoke(
      'attempt-grading',
      'grade-and-persist',
      bindingForAssessment(gradingInput),
      gradingInput
    );
    if (!isPlainObject(authority.response)) return responseInvalid();
    return validateAgentEvaluationAttemptGrading(
      gradingInput,
      Object.freeze({
        ...authority.response,
        authorityReceipt: authority.authorityReceipt,
      }) as AgentEvaluationAttemptGrading
    );
  };

  return Object.freeze({ capabilityRuntime, gradeAndPersist });
};
