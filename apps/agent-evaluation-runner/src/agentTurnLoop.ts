import {
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_SHARED_EFFECT_BINDING_KIND_BY_TOOL_ID,
  createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial,
  createAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority,
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity,
  createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision,
  createAgentEvaluationCapabilityPreEffectIntent,
  createAgentNativeProviderCapabilityRuntimeRequestMaterial,
  resolveAgentNativeProviderCapabilityRuntimeProgram,
  specializeAgentEvaluationCapabilityEffectToolSchemas,
  createAgentEvaluationCaseResultContract,
  createAgentEvaluationControlledContinuationOutput,
  createAgentEvaluationResultSubmissionReceipt,
  decodeAgentEvaluationResultSubmission,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  validateAgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationAttemptStatus,
  type AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  type AgentEvaluationCapabilityEffectBootstrapInvocationAuthority,
  type AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority,
  type AgentEvaluationCapabilityEffectInputBindingKind,
  type AgentEvaluationCapabilityEffectRequestRefIssuanceDecision,
  type AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationToolInputMaterial,
  type AgentEvaluationControlledContinuationReceipt,
  type AgentEvaluationControlledRuntime,
  type AgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationProviderCapabilityObservationReceipt,
  type AgentEvaluationControlledToolExecutionOutput,
  type AgentEvaluationResultSubmission,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type AgentProviderAdapterInvocationRequest,
  type AgentProviderRuntimeEvent,
  type AgentUsageVector,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  bindAgentEvaluationCapabilityRuntimeRequestMaterial,
  createAgentEvaluationCaseTurnInvocationPayload,
  isAgentEvaluationToolInputArguments,
  type AgentEvaluationEncodedInvocationPayload,
  type AgentEvaluationInvocationPayloadCodecOptions,
  type AgentEvaluationInvocationPayloadProtocol,
  type AgentEvaluationInvocationToolPhase,
  type AgentEvaluationNormalizedTurnToolExchange,
} from './invocationPayload';
import type { AgentEvaluationJsonObject } from './providerTransport';
import type { AgentEvaluationControlledRuntimeConfiguration } from './runConfig';
import {
  resolveAgentEvaluationPlanCapabilityDescriptor,
  resolveAgentEvaluationToolRuntimeOwner,
  validateAgentEvaluationCapabilityRuntimeToolOutput,
  type AgentEvaluationCapabilityRuntime,
  type AgentEvaluationCapabilityRuntimeToolExecution,
} from './capabilityRuntime';

export type AgentEvaluationAgentLoopRuntimeResult = Readonly<{
  events: readonly AgentProviderRuntimeEvent[];
  reportedUsage: AgentUsageVector;
  terminalEvent: AgentProviderRuntimeEvent;
  runtimeRejected: boolean;
  artifactBytes: number;
  budgetReservationId: string;
  responseDigest: CanonicalDigest;
  status: AgentEvaluationAttemptStatus;
  startedAt: Instant;
  completedAt: Instant;
  providerCapabilityObservationReceipt?: AgentEvaluationProviderCapabilityObservationReceipt;
}>;

export type AgentEvaluationAgentLoopInvokeInput = Readonly<{
  turnIndex: number;
  phase: AgentEvaluationInvocationToolPhase;
  invocation: AgentProviderAdapterInvocationRequest;
  encodedPayload: AgentEvaluationEncodedInvocationPayload;
  signal?: AbortSignal;
}>;

export type AgentEvaluationAgentLoopInvocation = (
  input: AgentEvaluationAgentLoopInvokeInput
) => Promise<AgentEvaluationAgentLoopRuntimeResult>;

export type AgentEvaluationAgentLoopTurn = Readonly<{
  turnIndex: number;
  phase: AgentEvaluationInvocationToolPhase;
  terminal: boolean;
  invocation: AgentProviderAdapterInvocationRequest;
  encodedPayload: AgentEvaluationEncodedInvocationPayload;
  runtime: AgentEvaluationAgentLoopRuntimeResult;
  responseDigest: CanonicalDigest;
  status: AgentEvaluationAttemptStatus;
  toolExecutions: readonly AgentEvaluationControlledToolExecutionOutput[];
  continuationReceipt?: AgentEvaluationControlledContinuationReceipt;
  resultSubmission?: AgentEvaluationResultSubmission;
  resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
  controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
  zeroToolCallDisposition?:
    'grade-unavailable' | 'seal-observation-and-continue';
  capabilityEffectBindingKind?: Exclude<
    AgentEvaluationCapabilityEffectInputBindingKind,
    'hosted-retrieval-query'
  >;
  postObservationRequestRefIssuanceDecision?: AgentEvaluationCapabilityEffectRequestRefIssuanceDecision;
  providerCapabilityObservationReceiptDigest?: CanonicalDigest;
  bootstrapInvocationAuthority?: AgentEvaluationCapabilityEffectBootstrapInvocationAuthority;
  bootstrapProviderRequestAuthority?: AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority;
}>;

export type AgentEvaluationAgentTurnLoopResult = Readonly<{
  turns: readonly AgentEvaluationAgentLoopTurn[];
  finalStatus: AgentEvaluationAttemptStatus;
  toolExecutionOutputs: readonly AgentEvaluationControlledToolExecutionOutput[];
  continuationReceipts: readonly AgentEvaluationControlledContinuationReceipt[];
  resultSubmission?: AgentEvaluationResultSubmission;
  resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
  controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
  capabilityToolExecutions: readonly AgentEvaluationCapabilityRuntimeToolExecution[];
  toolCallCount: number;
  repairRoundCount: number;
  transactionCount: number;
  artifactBytes: number;
}>;

export type CreateAgentEvaluationAgentTurnLoopInput = Readonly<{
  namespaceId: string;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  material: AgentEvaluationCaseMaterial;
  protocolFamily: AgentEvaluationInvocationPayloadProtocol;
  contextPackDigest: CanonicalDigest;
  controlledRuntimeConfiguration: AgentEvaluationControlledRuntimeConfiguration;
  controlledRuntime: AgentEvaluationControlledRuntime;
  capabilityRuntime: AgentEvaluationCapabilityRuntime;
  payloadOptions?: AgentEvaluationInvocationPayloadCodecOptions;
  createInvocation(
    input: Readonly<{
      turnIndex: number;
      encodedPayload: AgentEvaluationEncodedInvocationPayload;
      requestDigest?: CanonicalDigest;
    }>
  ): AgentProviderAdapterInvocationRequest;
  prepareCapabilityEffectRequestRefs?(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      material: AgentEvaluationCaseMaterial;
      turnIndex: number;
      protocolFamily: AgentEvaluationInvocationPayloadProtocol;
      capabilityToolIds: readonly string[];
    }>
  ): Promise<
    readonly AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt[]
  >;
  resolveCapabilityEffectInputAuthority?(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      material: AgentEvaluationCaseMaterial;
      turnIndex: number;
      invocation: AgentProviderAdapterInvocationRequest;
      runtime: AgentEvaluationAgentLoopRuntimeResult;
      call: DecodedProviderToolCall;
      requestRefAuthority: AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt;
    }>
  ): Promise<AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt>;
  invoke: AgentEvaluationAgentLoopInvocation;
  finalizeProviderCapabilityObservation(
    input: Readonly<{
      turnIndex: number;
      invocation: AgentProviderAdapterInvocationRequest;
      runtime: AgentEvaluationAgentLoopRuntimeResult;
      sharedEffectExecution?: Extract<
        AgentEvaluationCapabilityRuntimeToolExecution,
        { output: { executionAuthorityKind: 'shared-effect' } }
      >;
    }>
  ): Promise<AgentEvaluationProviderCapabilityObservationReceipt | undefined>;
  now?: () => Instant;
  requiresControlledPreview: boolean;
  signal?: AbortSignal;
}>;

type DecodedProviderToolCall = Readonly<{
  event: AgentProviderRuntimeEvent;
  providerToolCallId: string;
  providerToolName: string;
  toolId: string;
  toolCallId: string;
  arguments: AgentEvaluationJsonObject;
  argumentsDigest: CanonicalDigest;
}>;

const failureStatus = 'schema-failed' as const;

const sharedEffectToolIds = new Set<string>([
  'provider.background-job.poll',
  'provider.cache.inspect',
  'provider.continuation.resume',
  'provider.retrieval.search',
]);

const capabilityEffectSourceFactKindByBindingKind = Object.freeze({
  'opaque-continuation': 'opaque-continuation',
  'provider-cache': 'provider-cache-receipt',
  'provider-job': 'provider-job-receipt',
} as const);

const exactProviderToolCall = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  encodedPayload: AgentEvaluationEncodedInvocationPayload,
  event: AgentProviderRuntimeEvent
): DecodedProviderToolCall | undefined => {
  if (
    event.durableEvent.type !== 'tool-call' ||
    !isPlainObject(event.payload)
  ) {
    return undefined;
  }
  const idKey = protocolFamily === 'openai-responses' ? 'itemId' : 'id';
  const keys = Object.keys(event.payload).sort(compareUnicodeCodePoints);
  const expectedKeys = ['arguments', 'argumentsDigest', idKey, 'name'].sort(
    compareUnicodeCodePoints
  );
  const providerToolName = event.payload.name;
  const providerToolCallId = event.payload[idKey];
  const argumentsValue = event.payload.arguments;
  const argumentsDigest = event.payload.argumentsDigest;
  const binding = encodedPayload.toolBindings.find(
    ({ providerToolName: candidate }) => candidate === providerToolName
  );
  if (
    !sameCanonicalJson(keys, expectedKeys) ||
    typeof providerToolName !== 'string' ||
    !binding ||
    typeof providerToolCallId !== 'string' ||
    !isAgentControlIdentity(providerToolCallId) ||
    !isPlainObject(argumentsValue) ||
    typeof argumentsDigest !== 'string' ||
    !isAgentCanonicalDigest(argumentsDigest) ||
    argumentsDigest !== digestAgentCanonicalValue(argumentsValue)
  ) {
    return undefined;
  }
  const toolCallId = `evaluation-tool-call:${digestAgentCanonicalValue({
    invocationId: event.durableEvent.invocationId,
    eventDigest: event.durableEvent.eventDigest,
    providerToolCallId,
  }).slice('sha256-'.length)}`;
  return Object.freeze({
    event,
    providerToolCallId,
    providerToolName,
    toolId: binding.toolId,
    toolCallId,
    arguments: argumentsValue,
    argumentsDigest,
  });
};

const decodedToolCalls = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  encodedPayload: AgentEvaluationEncodedInvocationPayload,
  tools: readonly AgentEvaluationToolInputMaterial[],
  events: readonly AgentProviderRuntimeEvent[]
): readonly DecodedProviderToolCall[] | undefined => {
  const toolEvents = events.filter(
    ({ durableEvent }) => durableEvent.type === 'tool-call'
  );
  const decoded = toolEvents.map((event) =>
    exactProviderToolCall(protocolFamily, encodedPayload, event)
  );
  if (
    decoded.some((call) => call === undefined) ||
    new Set(decoded.map((call) => call!.providerToolCallId)).size !==
      decoded.length ||
    new Set(decoded.map((call) => call!.toolCallId)).size !== decoded.length ||
    decoded.some((call) => {
      if (!call) return true;
      if (
        call.providerToolName ===
        AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME
      ) {
        return false;
      }
      const tool = tools.find(({ toolId }) => toolId === call.toolId);
      const binding = encodedPayload.toolBindings.find(
        ({ toolId }) => toolId === call.toolId
      );
      return (
        !tool ||
        binding?.definitionDigest !== tool.definitionDigest ||
        !isAgentEvaluationToolInputArguments(call.arguments, tool)
      );
    })
  ) {
    return undefined;
  }
  return Object.freeze(decoded as DecodedProviderToolCall[]);
};

const resultSubmissionFor = (
  input: Readonly<{
    descriptor: AgentModelEvaluationAttemptDescriptor;
    material: AgentEvaluationCaseMaterial;
    invocation: AgentProviderAdapterInvocationRequest;
    encodedPayload: AgentEvaluationEncodedInvocationPayload;
    calls: readonly DecodedProviderToolCall[];
    terminalEvent: AgentProviderRuntimeEvent;
  }>
):
  | Readonly<{
      submission: AgentEvaluationResultSubmission;
      receipt: AgentEvaluationResultSubmissionReceipt;
    }>
  | undefined => {
  if (
    input.terminalEvent.durableEvent.type !== 'completed' ||
    input.calls.length !== 1 ||
    input.calls[0]?.providerToolName !==
      AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME
  ) {
    return undefined;
  }
  const contract = createAgentEvaluationCaseResultContract(input.material);
  const resultBinding = input.encodedPayload.resultToolBinding;
  const call = input.calls[0];
  if (
    !call ||
    !resultBinding ||
    resultBinding.providerToolName !== contract.tool.nativeToolName ||
    resultBinding.schemaDigest !== contract.tool.schemaDigest ||
    resultBinding.inputSchemaDigest !== contract.tool.inputSchemaDigest ||
    resultBinding.toolDefinitionDigest !== contract.tool.toolDefinitionDigest ||
    resultBinding.caseId !== contract.tool.caseId ||
    resultBinding.caseDigest !== contract.tool.caseDigest ||
    resultBinding.materialDigest !== contract.tool.materialDigest ||
    resultBinding.contractDigest !== contract.contractDigest
  ) {
    return undefined;
  }
  try {
    const submission = decodeAgentEvaluationResultSubmission(
      call.arguments,
      contract
    );
    if (submission.argumentsDigest !== call.argumentsDigest) return undefined;
    const receipt = createAgentEvaluationResultSubmissionReceipt(
      {
        attemptId: input.descriptor.attemptId,
        invocationId: input.invocation.invocationId,
        descriptorDigest: input.descriptor.descriptorDigest,
        providerToolCallId: call.providerToolCallId,
        toolArgumentsDigest: call.argumentsDigest,
        toolEventSequence: call.event.durableEvent.sequence,
        toolEventDigest: call.event.durableEvent.eventDigest,
        terminalEventSequence: input.terminalEvent.durableEvent.sequence,
        terminalEventDigest: input.terminalEvent.durableEvent.eventDigest,
      },
      submission,
      contract
    );
    return Object.freeze({ submission, receipt });
  } catch {
    return undefined;
  }
};

const assertLoopPolicy = (
  value: AgentEvaluationControlledRuntimeConfiguration
): void => {
  const { loop } = value;
  if (
    !isAgentControlIdentity(value.authorityId) ||
    !isAgentCanonicalDigest(value.runtimeImplementationDigest) ||
    !isAgentCanonicalDigest(value.artifactResolutionPolicyDigest) ||
    !isAgentCanonicalDigest(value.proposalValidationPolicyDigest) ||
    !isAgentCanonicalDigest(value.isolationPolicyDigest) ||
    !isAgentCanonicalDigest(value.g3VerificationPolicyDigest) ||
    !isAgentCanonicalDigest(value.controlledRenderPolicyDigest) ||
    !isAgentCanonicalDigest(value.runtimePolicyDigest) ||
    !isAgentCanonicalDigest(loop.loopPolicyDigest) ||
    loop.domainToolChoice !== 'required' ||
    typeof loop.allowParallelDomainToolCalls !== 'boolean' ||
    !Number.isSafeInteger(loop.maximumTurnsPerAttempt) ||
    loop.maximumTurnsPerAttempt < 2 ||
    !Number.isSafeInteger(loop.maximumToolCallsPerAttempt) ||
    loop.maximumToolCallsPerAttempt < 1 ||
    loop.maximumToolCallsPerAttempt >= loop.maximumTurnsPerAttempt ||
    !Number.isSafeInteger(loop.maximumRepairRoundsPerAttempt) ||
    loop.maximumRepairRoundsPerAttempt < 1 ||
    !Number.isSafeInteger(loop.maximumToolResultBytes) ||
    loop.maximumToolResultBytes < 1 ||
    !Number.isSafeInteger(loop.maximumAggregateToolResultBytes) ||
    loop.maximumAggregateToolResultBytes < loop.maximumToolResultBytes ||
    !Number.isSafeInteger(loop.maximumAggregateArtifactBytes) ||
    loop.maximumAggregateArtifactBytes < 1
  ) {
    throw new TypeError('Evaluation controlled agent-loop policy is invalid.');
  }
};

const terminalTurn = (
  input: Omit<AgentEvaluationAgentLoopTurn, 'terminal'>
): AgentEvaluationAgentLoopTurn => Object.freeze({ ...input, terminal: true });

const caseAllowsParallelDomainTools = (
  material: AgentEvaluationCaseMaterial
): boolean =>
  material.invocation.blocks.some(
    (block) =>
      block.kind === 'workspace-fixture' &&
      block.fixture.capabilities.some(
        ({ capabilityId }) => capabilityId === 'provider.parallel-tool'
      )
  );

/** Executes one bounded, case-bound native agent loop with no credential owner. */
export const runAgentEvaluationAgentTurnLoop = async (
  input: CreateAgentEvaluationAgentTurnLoopInput
): Promise<AgentEvaluationAgentTurnLoopResult> => {
  assertLoopPolicy(input.controlledRuntimeConfiguration);
  const loop = input.controlledRuntimeConfiguration.loop;
  const capabilityDescriptor = resolveAgentEvaluationPlanCapabilityDescriptor(
    input.plan,
    input.descriptor
  );
  if (
    input.material.capabilityDescriptorDigest !==
    capabilityDescriptor.descriptorDigest
  ) {
    throw new TypeError('Evaluation capability material authority drifted.');
  }
  const qualificationTarget = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  );
  const runtimeFactSourceAuthority =
    qualificationTarget?.optionalCapabilitySupportAuthority
      ?.runtimeFactSourceAuthority;
  const sharedCapabilityToolIds = Object.freeze(
    capabilityDescriptor.expectedToolIds.filter(
      (toolId) =>
        sharedEffectToolIds.has(toolId) &&
        input.material.invocation.tools.some(
          ({ toolId: materialToolId }) => materialToolId === toolId
        )
    )
  );
  if (sharedCapabilityToolIds.length > 1) {
    throw new TypeError(
      'Evaluation shared capability target has multiple effect tools.'
    );
  }
  const sharedCapabilityToolId = sharedCapabilityToolIds[0];
  const capabilityEffectBindingKind = sharedCapabilityToolId
    ? AGENT_EVALUATION_SHARED_EFFECT_BINDING_KIND_BY_TOOL_ID[
        sharedCapabilityToolId as keyof typeof AGENT_EVALUATION_SHARED_EFFECT_BINDING_KIND_BY_TOOL_ID
      ]
    : undefined;
  const turns: AgentEvaluationAgentLoopTurn[] = [];
  const history: AgentEvaluationNormalizedTurnToolExchange[] = [];
  const toolExecutionOutputs: AgentEvaluationControlledToolExecutionOutput[] =
    [];
  const capabilityToolExecutions: AgentEvaluationCapabilityRuntimeToolExecution[] =
    [];
  const continuationReceipts: AgentEvaluationControlledContinuationReceipt[] =
    [];
  let phase: AgentEvaluationInvocationToolPhase = 'domain-tools';
  let repairRoundCount = 0;
  let artifactBytes = 0;
  let controlledArtifactBytes = 0;
  let priorCapabilitySource:
    | Readonly<{
        turnIndex: number;
        observationReceiptDigest: CanonicalDigest;
      }>
    | undefined;
  let nextCapabilityEffectDecision:
    AgentEvaluationCapabilityEffectRequestRefIssuanceDecision | undefined;

  for (
    let turnIndex = 0;
    turnIndex < loop.maximumTurnsPerAttempt;
    turnIndex += 1
  ) {
    if (input.signal?.aborted) {
      throw new DOMException('Evaluation agent loop aborted.', 'AbortError');
    }
    const capabilityEffectDecision =
      phase === 'domain-tools' &&
      runtimeFactSourceAuthority &&
      capabilityEffectBindingKind
        ? (() => {
            if (
              nextCapabilityEffectDecision &&
              nextCapabilityEffectDecision.turnIndex === turnIndex
            ) {
              const decision = nextCapabilityEffectDecision;
              nextCapabilityEffectDecision = undefined;
              return decision;
            }
            return createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision(
              {
                bindingKind: capabilityEffectBindingKind,
                turnIndex,
                priorSourceTurnIndex: priorCapabilitySource?.turnIndex ?? null,
                priorSourceObservationReceiptDigest:
                  priorCapabilitySource?.observationReceiptDigest ?? null,
                priorSourceDisposition: priorCapabilitySource ? 'active' : null,
                priorEffectResultSealReceiptDigest: null,
              }
            );
          })()
        : undefined;
    if (capabilityEffectDecision?.disposition === 'source-unavailable') {
      throw new TypeError(
        'Evaluation capability effect source is unavailable before dispatch.'
      );
    }
    const bootstrapInvocation =
      capabilityEffectDecision?.disposition === 'bootstrap-provider-source'
        ? createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial({
            invocation: input.material.invocation,
            decision: capabilityEffectDecision,
          })
        : undefined;
    const requestRefAuthorities =
      capabilityEffectDecision?.disposition === 'issue-request-ref'
        ? await (() => {
            if (!input.prepareCapabilityEffectRequestRefs) {
              throw new TypeError(
                'Evaluation capability effect request-ref authority is unavailable.'
              );
            }
            return input.prepareCapabilityEffectRequestRefs({
              plan: input.plan,
              descriptor: input.descriptor,
              material: input.material,
              turnIndex,
              protocolFamily: input.protocolFamily,
              capabilityToolIds: Object.freeze([sharedCapabilityToolId!]),
            });
          })()
        : Object.freeze([]);
    const expectedRequestRefAuthorityCount =
      capabilityEffectDecision?.disposition === 'issue-request-ref' ? 1 : 0;
    if (
      requestRefAuthorities.length !== expectedRequestRefAuthorityCount ||
      new Set(requestRefAuthorities.map(({ toolId }) => toolId)).size !==
        requestRefAuthorities.length ||
      requestRefAuthorities.some(
        (receipt) =>
          !sharedCapabilityToolIds.includes(receipt.toolId) ||
          receipt.bindingKind !== capabilityEffectDecision?.bindingKind ||
          receipt.namespaceId !== input.namespaceId ||
          receipt.planDigest !== input.plan.planDigest ||
          receipt.repositoryCommit !== input.plan.repositoryCommit ||
          receipt.attemptId !== input.descriptor.attemptId ||
          receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
          receipt.turnIndex !== turnIndex ||
          receipt.capabilityId !== capabilityDescriptor.capabilityId ||
          receipt.protocolFamily !== input.protocolFamily ||
          receipt.providerConfigurationId !==
            runtimeFactSourceAuthority?.providerConfigurationId ||
          receipt.modelLineageDigest !==
            runtimeFactSourceAuthority?.modelLineageDigest ||
          receipt.adapterDigest !== runtimeFactSourceAuthority?.adapterDigest ||
          receipt.runtimeFactSourceAuthorityDigest !==
            runtimeFactSourceAuthority?.authorityDigest ||
          receipt.registrationReceiptDigest !==
            runtimeFactSourceAuthority?.registrationReceiptDigest
      )
    ) {
      throw new TypeError(
        'Evaluation capability effect request-ref authority drifted.'
      );
    }
    const effectiveTools = bootstrapInvocation
      ? bootstrapInvocation.invocation.tools
      : requestRefAuthorities.length === 0
        ? input.material.invocation.tools
        : specializeAgentEvaluationCapabilityEffectToolSchemas(
            input.material.invocation.tools,
            requestRefAuthorities
          );
    const baseEncodedPayload = createAgentEvaluationCaseTurnInvocationPayload(
      input.protocolFamily,
      input.material,
      {
        ...input.payloadOptions,
        phase,
        domainToolChoice: loop.domainToolChoice,
        allowParallelDomainToolCalls: loop.allowParallelDomainToolCalls,
        turnHistory: Object.freeze([...history]),
        ...(requestRefAuthorities.length > 0
          ? {
              capabilityEffectRequestRefAuthorities: requestRefAuthorities,
            }
          : {}),
        ...(bootstrapInvocation
          ? {
              capabilityEffectBootstrapInvocationMaterial: bootstrapInvocation,
            }
          : {}),
      }
    );
    const bootstrapProviderRequest = bootstrapInvocation
      ? (() => {
          if (!runtimeFactSourceAuthority) {
            throw new TypeError(
              'Evaluation bootstrap Provider runtime authority is unavailable.'
            );
          }
          if (bootstrapInvocation.authority.bindingKind === 'provider-cache') {
            throw new TypeError(
              'Evaluation cache bootstrap requires a sealed cold/warm request authority.'
            );
          }
          const program = resolveAgentNativeProviderCapabilityRuntimeProgram(
            runtimeFactSourceAuthority.capabilityProfileId as Parameters<
              typeof resolveAgentNativeProviderCapabilityRuntimeProgram
            >[0],
            runtimeFactSourceAuthority.capabilityProfileDigest
          );
          const requestMaterial =
            createAgentNativeProviderCapabilityRuntimeRequestMaterial(program, {
              operation:
                bootstrapInvocation.authority.bindingKind === 'provider-job'
                  ? 'background-submit'
                  : 'continuation-parent',
              protocolFamily: input.protocolFamily,
              providerConfigurationId:
                runtimeFactSourceAuthority.providerConfigurationId,
              modelId: runtimeFactSourceAuthority.modelId,
              modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
              adapterDigest: runtimeFactSourceAuthority.adapterDigest,
              callbackLocalBaseRequestBody: Object.freeze({
                ...baseEncodedPayload.payload.body,
                model: runtimeFactSourceAuthority.modelId,
              }),
              callbackLocalProviderStateHandle: null,
              providerResourceAuthority: null,
              providerResourceReadRequest: null,
              providerResourceReadReceipt: null,
              cacheKeyDigest: null,
              observedAt: input.now?.() ?? new Date().toISOString(),
            });
          return Object.freeze({
            material: requestMaterial,
            authority:
              createAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority(
                program,
                {
                  invocationAuthority: bootstrapInvocation.authority,
                  providerRequestProjection: requestMaterial.projection,
                  cacheWarmAuthority: null,
                }
              ),
          });
        })()
      : undefined;
    const bootstrapProviderRequestAuthority =
      bootstrapProviderRequest?.authority;
    const encodedPayload = bootstrapProviderRequest
      ? bindAgentEvaluationCapabilityRuntimeRequestMaterial(
          baseEncodedPayload,
          bootstrapProviderRequest.material
        )
      : baseEncodedPayload;
    const invocation = input.createInvocation({
      turnIndex,
      encodedPayload,
      ...(bootstrapProviderRequestAuthority
        ? { requestDigest: bootstrapProviderRequestAuthority.requestDigest }
        : {}),
    });
    if (
      (bootstrapProviderRequestAuthority !== undefined &&
        invocation.requestDigest !==
          bootstrapProviderRequestAuthority.requestDigest) ||
      requestRefAuthorities.some(
        ({ invocationId }) => invocationId !== invocation.invocationId
      )
    ) {
      throw new TypeError(
        'Evaluation capability effect request-ref invocation drifted.'
      );
    }
    let runtime = await input.invoke({
      turnIndex,
      phase,
      invocation,
      encodedPayload,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (
      !Number.isSafeInteger(runtime.artifactBytes) ||
      runtime.artifactBytes < 0 ||
      !Number.isSafeInteger(artifactBytes + runtime.artifactBytes)
    ) {
      throw new TypeError(
        'Evaluation runtime artifact byte accounting overflowed.'
      );
    }
    artifactBytes += runtime.artifactBytes;
    if (!isAgentCanonicalDigest(runtime.responseDigest)) {
      throw new TypeError('Evaluation runtime response commitment drifted.');
    }
    const responseDigest = runtime.responseDigest;
    const calls = decodedToolCalls(
      input.protocolFamily,
      encodedPayload,
      effectiveTools,
      runtime.events
    );
    let observationFinalized = false;
    const finalizeProviderCapabilityObservation = async (
      sharedEffectExecution?: Extract<
        AgentEvaluationCapabilityRuntimeToolExecution,
        { output: { executionAuthorityKind: 'shared-effect' } }
      >
    ): Promise<
      AgentEvaluationProviderCapabilityObservationReceipt | undefined
    > => {
      if (observationFinalized) {
        throw new TypeError(
          'Evaluation provider capability observation finalized more than once.'
        );
      }
      const receipt = await input.finalizeProviderCapabilityObservation({
        turnIndex,
        invocation,
        runtime,
        ...(sharedEffectExecution ? { sharedEffectExecution } : {}),
      });
      if (
        receipt !== undefined &&
        (!isAgentEvaluationProviderCapabilityObservationReceipt(receipt) ||
          receipt.planDigest !== input.plan.planDigest ||
          receipt.repositoryCommit !== input.plan.repositoryCommit ||
          receipt.attemptId !== input.descriptor.attemptId ||
          receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
          receipt.turnIndex !== turnIndex ||
          receipt.invocationId !== invocation.invocationId ||
          receipt.requestDigest !== invocation.requestDigest)
      ) {
        throw new TypeError(
          'Evaluation provider capability observation finalization drifted.'
        );
      }
      const {
        providerCapabilityObservationReceipt: _provisionalObservation,
        ...runtimeBase
      } = runtime;
      runtime = Object.freeze({
        ...runtimeBase,
        ...(receipt ? { providerCapabilityObservationReceipt: receipt } : {}),
      });
      observationFinalized = true;
      return receipt;
    };
    const providerCompleted =
      runtime.status === 'completed' &&
      runtime.terminalEvent.durableEvent.type === 'completed';

    if (!providerCompleted) {
      await finalizeProviderCapabilityObservation();
      const status =
        runtime.status === 'completed' ? failureStatus : runtime.status;
      turns.push(
        terminalTurn({
          turnIndex,
          phase,
          invocation,
          encodedPayload,
          runtime,
          responseDigest,
          status,
          toolExecutions: Object.freeze([]),
        })
      );
      return Object.freeze({
        turns: Object.freeze(turns),
        finalStatus: status,
        toolExecutionOutputs: Object.freeze(toolExecutionOutputs),
        capabilityToolExecutions: Object.freeze(capabilityToolExecutions),
        continuationReceipts: Object.freeze(continuationReceipts),
        toolCallCount:
          toolExecutionOutputs.length + capabilityToolExecutions.length,
        repairRoundCount,
        transactionCount: toolExecutionOutputs.reduce(
          (total, { receipt }) =>
            total + receipt.transactionReceiptDigests.length,
          0
        ),
        artifactBytes,
      });
    }

    if (phase === 'result-submission') {
      await finalizeProviderCapabilityObservation();
      const result = calls
        ? resultSubmissionFor({
            descriptor: input.descriptor,
            material: input.material,
            invocation,
            encodedPayload,
            calls,
            terminalEvent: runtime.terminalEvent,
          })
        : undefined;
      if (!result) {
        turns.push(
          terminalTurn({
            turnIndex,
            phase,
            invocation,
            encodedPayload,
            runtime,
            responseDigest,
            status: failureStatus,
            toolExecutions: Object.freeze([]),
          })
        );
        return Object.freeze({
          turns: Object.freeze(turns),
          finalStatus: failureStatus,
          toolExecutionOutputs: Object.freeze(toolExecutionOutputs),
          capabilityToolExecutions: Object.freeze(capabilityToolExecutions),
          continuationReceipts: Object.freeze(continuationReceipts),
          toolCallCount:
            toolExecutionOutputs.length + capabilityToolExecutions.length,
          repairRoundCount,
          transactionCount: toolExecutionOutputs.reduce(
            (total, { receipt }) =>
              total + receipt.transactionReceiptDigests.length,
            0
          ),
          artifactBytes,
        });
      }
      const runtimeInput = Object.freeze({
        planDigest: input.plan.planDigest,
        repositoryCommit: input.plan.repositoryCommit,
        attemptId: input.descriptor.attemptId,
        descriptorDigest: input.descriptor.descriptorDigest,
        caseId: input.material.caseId,
        caseDigest: input.material.caseDigest,
        materialDigest: input.material.materialDigest,
        submission: result.submission,
        submissionReceipt: result.receipt,
        toolExecutionReceipts: Object.freeze(
          toolExecutionOutputs.map(({ receipt }) => receipt)
        ),
        continuationReceipts: Object.freeze([...continuationReceipts]),
        requiresControlledPreview: input.requiresControlledPreview,
        runtimeAuthorityId: input.controlledRuntimeConfiguration.authorityId,
        runtimeImplementationDigest:
          input.controlledRuntimeConfiguration.runtimeImplementationDigest,
        artifactResolutionPolicyDigest:
          input.controlledRuntimeConfiguration.artifactResolutionPolicyDigest,
        proposalValidationPolicyDigest:
          input.controlledRuntimeConfiguration.proposalValidationPolicyDigest,
        isolationPolicyDigest:
          input.controlledRuntimeConfiguration.isolationPolicyDigest,
        g3VerificationPolicyDigest:
          input.controlledRuntimeConfiguration.g3VerificationPolicyDigest,
        controlledRenderPolicyDigest:
          input.controlledRuntimeConfiguration.controlledRenderPolicyDigest,
        loopPolicyDigest: loop.loopPolicyDigest,
        maximumTurnsPerAttempt: loop.maximumTurnsPerAttempt,
        maximumToolCallsPerAttempt: loop.maximumToolCallsPerAttempt,
        maximumRepairRoundsPerAttempt: loop.maximumRepairRoundsPerAttempt,
        maximumAggregateArtifactBytes: loop.maximumAggregateArtifactBytes,
      });
      const controlledRuntimeReceipt =
        validateAgentEvaluationControlledRuntimeReceipt(
          runtimeInput,
          await input.controlledRuntime.assessFinal(runtimeInput)
        );
      turns.push(
        terminalTurn({
          turnIndex,
          phase,
          invocation,
          encodedPayload,
          runtime,
          responseDigest,
          status: 'completed',
          toolExecutions: Object.freeze([]),
          resultSubmission: result.submission,
          resultSubmissionReceipt: result.receipt,
          controlledRuntimeReceipt,
        })
      );
      return Object.freeze({
        turns: Object.freeze(turns),
        finalStatus: 'completed',
        toolExecutionOutputs: Object.freeze(toolExecutionOutputs),
        capabilityToolExecutions: Object.freeze(capabilityToolExecutions),
        continuationReceipts: Object.freeze(continuationReceipts),
        resultSubmission: result.submission,
        resultSubmissionReceipt: result.receipt,
        controlledRuntimeReceipt,
        toolCallCount:
          toolExecutionOutputs.length + capabilityToolExecutions.length,
        repairRoundCount,
        transactionCount: toolExecutionOutputs.reduce(
          (total, { receipt }) =>
            total + receipt.transactionReceiptDigests.length,
          0
        ),
        artifactBytes,
      });
    }

    if (
      bootstrapInvocation &&
      bootstrapProviderRequestAuthority &&
      calls !== undefined &&
      calls.length === 0
    ) {
      const observation = await finalizeProviderCapabilityObservation();
      const bindingKind = bootstrapInvocation.authority.bindingKind;
      const sourceFactKind =
        capabilityEffectSourceFactKindByBindingKind[bindingKind];
      if (!observation) {
        throw new TypeError(
          'Evaluation bootstrap capability observation is unavailable.'
        );
      }
      const observedSource = observation.facts.some(
        ({ factKind }) => factKind === sourceFactKind
      );
      const postObservationRequestRefIssuanceDecision =
        createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
          bindingKind,
          turnIndex: 1,
          priorSourceTurnIndex: observedSource ? 0 : null,
          priorSourceObservationReceiptDigest: observedSource
            ? observation.receiptDigest
            : null,
          priorSourceDisposition: observedSource ? 'active' : null,
          priorEffectResultSealReceiptDigest: null,
        });
      const zeroToolCallDisposition = observedSource
        ? ('seal-observation-and-continue' as const)
        : ('grade-unavailable' as const);
      const bootstrapTurn = Object.freeze({
        turnIndex,
        phase,
        terminal: !observedSource,
        invocation,
        encodedPayload,
        runtime,
        responseDigest,
        status: 'completed' as const,
        toolExecutions: Object.freeze([]),
        zeroToolCallDisposition,
        capabilityEffectBindingKind: bindingKind,
        postObservationRequestRefIssuanceDecision,
        providerCapabilityObservationReceiptDigest: observation.receiptDigest,
        bootstrapInvocationAuthority: bootstrapInvocation.authority,
        bootstrapProviderRequestAuthority,
      });
      turns.push(bootstrapTurn);
      if (observedSource) {
        priorCapabilitySource = Object.freeze({
          turnIndex: 0,
          observationReceiptDigest: observation.receiptDigest,
        });
        nextCapabilityEffectDecision =
          postObservationRequestRefIssuanceDecision;
        continue;
      }
      return Object.freeze({
        turns: Object.freeze(turns),
        finalStatus: 'completed',
        toolExecutionOutputs: Object.freeze(toolExecutionOutputs),
        capabilityToolExecutions: Object.freeze(capabilityToolExecutions),
        continuationReceipts: Object.freeze(continuationReceipts),
        toolCallCount:
          toolExecutionOutputs.length + capabilityToolExecutions.length,
        repairRoundCount,
        transactionCount: toolExecutionOutputs.reduce(
          (total, { receipt }) =>
            total + receipt.transactionReceiptDigests.length,
          0
        ),
        artifactBytes,
      });
    }

    if (
      !calls ||
      calls.length === 0 ||
      calls.some(
        ({ providerToolName }) =>
          providerToolName === AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME
      ) ||
      toolExecutionOutputs.length +
        capabilityToolExecutions.length +
        calls.length >
        loop.maximumToolCallsPerAttempt
    ) {
      await finalizeProviderCapabilityObservation();
      turns.push(
        terminalTurn({
          turnIndex,
          phase,
          invocation,
          encodedPayload,
          runtime,
          responseDigest,
          status: failureStatus,
          toolExecutions: Object.freeze([]),
        })
      );
      return Object.freeze({
        turns: Object.freeze(turns),
        finalStatus: failureStatus,
        toolExecutionOutputs: Object.freeze(toolExecutionOutputs),
        capabilityToolExecutions: Object.freeze(capabilityToolExecutions),
        continuationReceipts: Object.freeze(continuationReceipts),
        toolCallCount:
          toolExecutionOutputs.length + capabilityToolExecutions.length,
        repairRoundCount,
        transactionCount: toolExecutionOutputs.reduce(
          (total, { receipt }) =>
            total + receipt.transactionReceiptDigests.length,
          0
        ),
        artifactBytes,
      });
    }

    const executeControlled = (call: DecodedProviderToolCall) =>
      input.controlledRuntime.executeTool({
        planDigest: input.plan.planDigest,
        attemptId: input.descriptor.attemptId,
        descriptorDigest: input.descriptor.descriptorDigest,
        caseId: input.material.caseId,
        materialDigest: input.material.materialDigest,
        loopPolicyDigest: loop.loopPolicyDigest,
        turnIndex,
        toolCallId: call.toolCallId,
        toolId: call.toolId,
        arguments: call.arguments,
        argumentsDigest: call.argumentsDigest,
        maximumToolResultBytes: loop.maximumToolResultBytes,
      });
    const executeCapability = async (call: DecodedProviderToolCall) => {
      if (capabilityDescriptor.supportExpectation !== 'required') {
        throw new TypeError(
          'Evaluation expected-blocked capability cannot enter Provider capability execution.'
        );
      }
      const base = Object.freeze({
        namespaceId: input.namespaceId,
        shardLeaseOwnerId: input.shardLeaseOwnerId,
        shardLeaseGeneration: input.shardLeaseGeneration,
        verificationGrantGeneration: input.verificationGrantGeneration,
        verificationAttemptGrantReceiptSetDigest:
          input.verificationAttemptGrantReceiptSetDigest,
        planDigest: input.plan.planDigest,
        repositoryCommit: input.plan.repositoryCommit,
        attemptId: input.descriptor.attemptId,
        descriptorDigest: input.descriptor.descriptorDigest,
        caseId: input.material.caseId,
        caseDigest: input.material.caseDigest,
        materialDigest: input.material.materialDigest,
        capabilityDescriptor,
        loopPolicyDigest: loop.loopPolicyDigest,
        turnIndex,
        invocationId: invocation.invocationId,
        toolCallId: call.toolCallId,
        providerToolCallId: call.providerToolCallId,
        toolId: call.toolId,
        arguments: call.arguments,
        argumentsDigest: call.argumentsDigest,
        requestDigest: invocation.requestDigest,
        maximumToolResultBytes: loop.maximumToolResultBytes,
      });
      const finalToolInput = sharedEffectToolIds.has(call.toolId)
        ? await (async () => {
            const target = qualificationTarget;
            if (
              !target ||
              !runtimeFactSourceAuthority ||
              target.optionalCapabilitySupportAuthority?.capabilityId !==
                capabilityDescriptor.capabilityId
            ) {
              throw new TypeError(
                'Evaluation shared capability effect authority is unavailable.'
              );
            }
            const requestRefAuthority = requestRefAuthorities.find(
              ({ toolId }) => toolId === call.toolId
            );
            if (
              !requestRefAuthority ||
              !input.resolveCapabilityEffectInputAuthority
            ) {
              throw new TypeError(
                'Evaluation capability effect input authority is unavailable.'
              );
            }
            const inputAuthorityBinding =
              createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
                await input.resolveCapabilityEffectInputAuthority({
                  plan: input.plan,
                  descriptor: input.descriptor,
                  material: input.material,
                  turnIndex,
                  invocation,
                  runtime,
                  call,
                  requestRefAuthority,
                })
              );
            const ownerRequestIdentity =
              createAgentEvaluationCapabilityEffectOwnerRequestIdentity({
                namespaceId: input.namespaceId,
                planDigest: input.plan.planDigest,
                repositoryCommit: input.plan.repositoryCommit,
                attemptId: input.descriptor.attemptId,
                descriptorDigest: input.descriptor.descriptorDigest,
                caseId: input.material.caseId,
                materialDigest: input.material.materialDigest,
                turnIndex,
                invocationId: invocation.invocationId,
                toolId: call.toolId,
                toolCallId: call.toolCallId,
                providerToolCallId: call.providerToolCallId,
                providerRequestDigest: invocation.requestDigest,
                argumentsDigest: call.argumentsDigest,
                inputAuthorityBinding,
                runtimeFactSourceAuthority,
                registrationReceiptDigest:
                  runtimeFactSourceAuthority.registrationReceiptDigest,
                requestedAt: runtime.completedAt,
              });
            const preEffectIntent =
              createAgentEvaluationCapabilityPreEffectIntent({
                namespaceId: input.namespaceId,
                planDigest: input.plan.planDigest,
                repositoryCommit: input.plan.repositoryCommit,
                attemptId: input.descriptor.attemptId,
                descriptorDigest: input.descriptor.descriptorDigest,
                caseId: input.material.caseId,
                materialDigest: input.material.materialDigest,
                turnIndex,
                invocationId: invocation.invocationId,
                toolId: call.toolId,
                toolCallId: call.toolCallId,
                providerToolCallId: call.providerToolCallId,
                providerRequestDigest: invocation.requestDigest,
                argumentsDigest: call.argumentsDigest,
                inputAuthorityBinding,
                runtimeFactSourceAuthority,
                registrationReceiptDigest:
                  runtimeFactSourceAuthority.registrationReceiptDigest,
                requestedAt: runtime.completedAt,
                ...ownerRequestIdentity,
              });
            return Object.freeze({
              ...base,
              executionAuthorityKind: 'shared-effect' as const,
              budgetReservationId: runtime.budgetReservationId,
              preEffectIntent,
            });
          })()
        : (() => {
            const providerCapabilityObservationReceipt =
              runtime.providerCapabilityObservationReceipt;
            if (!providerCapabilityObservationReceipt) {
              throw new TypeError(
                'Evaluation provider capability observation is unavailable.'
              );
            }
            return Object.freeze({
              ...base,
              executionAuthorityKind: 'observation-control' as const,
              providerCapabilityObservationReceipt,
            });
          })();
      return Object.freeze({
        input: finalToolInput,
        output: validateAgentEvaluationCapabilityRuntimeToolOutput(
          finalToolInput,
          await input.capabilityRuntime.executeTool(finalToolInput)
        ),
      }) as AgentEvaluationCapabilityRuntimeToolExecution;
    };
    const controlledCalls = calls.filter(
      ({ toolId }) =>
        resolveAgentEvaluationToolRuntimeOwner(toolId) ===
        'controlled-workspace-runtime'
    );
    const capabilityCalls = calls.filter(
      ({ toolId }) =>
        resolveAgentEvaluationToolRuntimeOwner(toolId) ===
        'provider-capability-runtime'
    );
    const sharedCapabilityCalls = capabilityCalls.filter(({ toolId }) =>
      sharedEffectToolIds.has(toolId)
    );
    if (
      sharedCapabilityCalls.length > 1 ||
      (sharedCapabilityCalls.length === 1 &&
        (capabilityCalls.length !== 1 || controlledCalls.length !== 0))
    ) {
      throw new TypeError(
        'Evaluation shared capability effect must be the sole tool call in a turn.'
      );
    }
    if (sharedCapabilityCalls.length === 0) {
      await finalizeProviderCapabilityObservation();
    }
    const executions: AgentEvaluationControlledToolExecutionOutput[] = [];
    if (
      loop.allowParallelDomainToolCalls &&
      caseAllowsParallelDomainTools(input.material) &&
      controlledCalls.length > 1
    ) {
      executions.push(
        ...(await Promise.all(controlledCalls.map(executeControlled)))
      );
    } else {
      for (const call of controlledCalls) {
        executions.push(await executeControlled(call));
      }
    }
    const capabilityExecutionsForTurn: AgentEvaluationCapabilityRuntimeToolExecution[] =
      [];
    for (const call of capabilityCalls) {
      capabilityExecutionsForTurn.push(await executeCapability(call));
    }
    if (sharedCapabilityCalls.length === 1) {
      const sharedExecution = capabilityExecutionsForTurn[0];
      if (
        !sharedExecution ||
        sharedExecution.output.executionAuthorityKind !== 'shared-effect'
      ) {
        throw new TypeError(
          'Evaluation shared capability effect response is unavailable.'
        );
      }
      await finalizeProviderCapabilityObservation(
        sharedExecution as Extract<
          AgentEvaluationCapabilityRuntimeToolExecution,
          { output: { executionAuthorityKind: 'shared-effect' } }
        >
      );
    }
    toolExecutionOutputs.push(...executions);
    capabilityToolExecutions.push(...capabilityExecutionsForTurn);
    if (executions.some(({ receipt }) => receipt.status === 'rejected')) {
      repairRoundCount += 1;
    }
    for (const execution of executions) {
      const persistedArtifactBytes =
        execution.receipt.persistedArtifacts.reduce(
          (total, artifact) => total + artifact.byteLength,
          0
        );
      if (
        !Number.isSafeInteger(persistedArtifactBytes) ||
        persistedArtifactBytes < 0 ||
        !Number.isSafeInteger(controlledArtifactBytes + persistedArtifactBytes)
      ) {
        throw new TypeError(
          'Evaluation controlled artifact byte accounting overflowed.'
        );
      }
      controlledArtifactBytes += persistedArtifactBytes;
      artifactBytes += persistedArtifactBytes;
    }
    if (
      repairRoundCount > loop.maximumRepairRoundsPerAttempt ||
      controlledArtifactBytes > loop.maximumAggregateArtifactBytes
    ) {
      turns.push(
        terminalTurn({
          turnIndex,
          phase,
          invocation,
          encodedPayload,
          runtime,
          responseDigest,
          status: failureStatus,
          toolExecutions: Object.freeze(executions),
        })
      );
      return Object.freeze({
        turns: Object.freeze(turns),
        finalStatus: failureStatus,
        toolExecutionOutputs: Object.freeze(toolExecutionOutputs),
        capabilityToolExecutions: Object.freeze(capabilityToolExecutions),
        continuationReceipts: Object.freeze(continuationReceipts),
        toolCallCount:
          toolExecutionOutputs.length + capabilityToolExecutions.length,
        repairRoundCount,
        transactionCount: toolExecutionOutputs.reduce(
          (total, { receipt }) =>
            total + receipt.transactionReceiptDigests.length,
          0
        ),
        artifactBytes,
      });
    }
    const failedCapability = capabilityExecutionsForTurn.find(
      ({ output }) => output.outcome !== 'supported'
    );
    if (failedCapability) {
      const status =
        failedCapability.output.outcome === 'unsupported'
          ? ('blocked' as const)
          : ('infrastructure-error' as const);
      turns.push(
        terminalTurn({
          turnIndex,
          phase,
          invocation,
          encodedPayload,
          runtime,
          responseDigest,
          status,
          toolExecutions: Object.freeze(executions),
        })
      );
      return Object.freeze({
        turns: Object.freeze(turns),
        finalStatus: status,
        toolExecutionOutputs: Object.freeze(toolExecutionOutputs),
        capabilityToolExecutions: Object.freeze(capabilityToolExecutions),
        continuationReceipts: Object.freeze(continuationReceipts),
        toolCallCount:
          toolExecutionOutputs.length + capabilityToolExecutions.length,
        repairRoundCount,
        transactionCount: toolExecutionOutputs.reduce(
          (total, { receipt }) =>
            total + receipt.transactionReceiptDigests.length,
          0
        ),
        artifactBytes,
      });
    }
    let continuation:
      | ReturnType<typeof createAgentEvaluationControlledContinuationOutput>
      | undefined;
    if (executions.length > 0) {
      const continuationInput = Object.freeze({
        planDigest: input.plan.planDigest,
        attemptId: input.descriptor.attemptId,
        descriptorDigest: input.descriptor.descriptorDigest,
        caseId: input.material.caseId,
        materialDigest: input.material.materialDigest,
        loopPolicyDigest: loop.loopPolicyDigest,
        completedTurnIndex: turnIndex,
        maximumAggregateToolResultBytes: loop.maximumAggregateToolResultBytes,
        executions: Object.freeze(executions),
      });
      const expectedContinuation =
        createAgentEvaluationControlledContinuationOutput(continuationInput);
      continuation = await input.controlledRuntime.continue(continuationInput);
      if (!sameCanonicalJson(continuation, expectedContinuation)) {
        throw new TypeError(
          'Evaluation controlled continuation acknowledgement drifted.'
        );
      }
      continuationReceipts.push(continuation.receipt);
    }
    const controlledResultByToolCallId = new Map(
      continuation?.toolResults.map((result) => [result.toolCallId, result]) ??
        []
    );
    const capabilityResultByToolCallId = new Map(
      capabilityExecutionsForTurn.map((execution) => [
        execution.input.toolCallId,
        execution.output,
      ])
    );
    for (const call of calls) {
      const owner = resolveAgentEvaluationToolRuntimeOwner(call.toolId);
      const controlledResult = controlledResultByToolCallId.get(
        call.toolCallId
      );
      const capabilityResult = capabilityResultByToolCallId.get(
        call.toolCallId
      );
      if (
        (owner === 'controlled-workspace-runtime' &&
          (!controlledResult || controlledResult.toolId !== call.toolId)) ||
        (owner === 'provider-capability-runtime' && !capabilityResult)
      ) {
        throw new TypeError('Evaluation tool result cross-binding drifted.');
      }
      history.push(
        Object.freeze({
          turnIndex,
          toolEventSequence: call.event.durableEvent.sequence,
          toolCallId: call.toolCallId,
          providerToolCallId: call.providerToolCallId,
          toolId: call.toolId,
          providerToolName: call.providerToolName,
          arguments: call.arguments,
          argumentsDigest: call.argumentsDigest,
          controlledResult:
            owner === 'controlled-workspace-runtime'
              ? controlledResult!.result
              : capabilityResult!.result,
          resultDigest:
            owner === 'controlled-workspace-runtime'
              ? controlledResult!.resultDigest
              : capabilityResult!.resultDigest,
          priorResponseDigest: responseDigest,
          continuationReceiptDigest:
            owner === 'controlled-workspace-runtime'
              ? continuation!.receipt.receiptDigest
              : capabilityResult!.continuationReceiptDigest,
        })
      );
    }
    turns.push(
      Object.freeze({
        turnIndex,
        phase,
        terminal: false,
        invocation,
        encodedPayload,
        runtime,
        responseDigest,
        status: 'completed',
        toolExecutions: Object.freeze(executions),
        ...(continuation ? { continuationReceipt: continuation.receipt } : {}),
      })
    );
    const hasVerificationClosure = executions.some(({ receipt }) =>
      receipt.persistedArtifacts.some(
        ({ artifactKind }) => artifactKind === 'verification-closure'
      )
    );
    const hasSharedEffectExecution = capabilityExecutionsForTurn.some(
      ({ output }) => output.executionAuthorityKind === 'shared-effect'
    );
    phase =
      hasVerificationClosure ||
      hasSharedEffectExecution ||
      turnIndex + 1 === loop.maximumTurnsPerAttempt - 1
        ? 'result-submission'
        : 'domain-tools';
  }
  throw new TypeError('Evaluation controlled agent loop exceeded its ceiling.');
};
