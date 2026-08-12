import {
  createAgentEvaluationCaseResultContract,
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentEvaluationCaseMaterial,
  createAgentEvaluationControlledContinuationOutput,
  createAgentEvaluationControlledRuntimeReceipt,
  createAgentEvaluationControlledToolExecutionOutput,
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  createAgentEvaluationProviderCapabilityObservationReceipt,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  createAgentModelEvaluationCase,
  createAgentProviderRuntimeEvent,
  createAgentProviderJob,
  createAgentProviderJobReceipt,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentNativeProviderRuntimeResponse,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationControlledRuntime,
  type AgentEvaluationControlledRuntimeInput,
  type AgentEvaluationControlledContinuationInput,
  type AgentEvaluationControlledToolExecutionInput,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type AgentProviderAdapterInvocationRequest,
  type AgentEvaluationProviderCapabilityObservationReceipt,
} from '@prodivix/ai';
import { isPlainObject } from '@prodivix/shared/safety';
import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  runAgentEvaluationAgentTurnLoop,
  type AgentEvaluationAgentLoopInvokeInput,
} from './agentTurnLoop';
import type { AgentEvaluationInvocationPayloadProtocol } from './invocationPayload';
import type { AgentEvaluationControlledRuntimeConfiguration } from './runConfig';
import type {
  AgentEvaluationCapabilityRuntime,
  AgentEvaluationCapabilityRuntimeToolInput,
} from './capabilityRuntime';
import { resolveAgentEvaluationPlanCapabilityDescriptor } from './capabilityRuntime';
import type { AgentEvaluationCapabilityEffectInputAuthorityClient } from './capabilityEffectInputAuthorityClient';
import { createProductionAgentEvaluationCapabilityEffectInputAuthoritySource } from './productionCapabilityEffectInputAuthoritySource';

const STARTED_AT = '2026-08-02T01:00:00.000Z';
const COMPLETED_AT = '2026-08-02T01:00:00.001Z';

const materialForDescriptor = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor,
  source: AgentEvaluationCaseMaterial
): AgentEvaluationCaseMaterial => {
  const concreteCase = plan.concreteCases.find(
    ({ caseId }) => caseId === descriptor.caseId
  );
  if (!concreteCase) throw new Error('Expected loop case is missing.');
  const capabilityDescriptor = resolveAgentEvaluationPlanCapabilityDescriptor(
    plan,
    descriptor
  );
  const {
    caseDigest: _caseDigest,
    capabilityDescriptor: _capabilityDescriptor,
    capabilityDescriptorDigest: _capabilityDescriptorDigest,
    ...caseInput
  } = concreteCase;
  const caseDefinition = createAgentModelEvaluationCase({
    ...caseInput,
    capabilityDescriptor,
    capabilityDescriptorDigest: capabilityDescriptor.descriptorDigest,
  });
  const invocation = Object.freeze({
    ...source.invocation,
    blocks: Object.freeze(
      source.invocation.blocks.map((block) => {
        if (block.kind !== 'workspace-fixture') return block;
        const {
          fixtureDigest: _fixtureDigest,
          capabilities: _capabilities,
          ...fixtureInput
        } = block.fixture;
        const fixtureBase = Object.freeze({
          ...fixtureInput,
          capabilities: Object.freeze([
            Object.freeze({
              capabilityId: capabilityDescriptor.capabilityId,
              support: capabilityDescriptor.supportExpectation,
              toolIds: capabilityDescriptor.expectedToolIds,
              expectedReceiptKinds: capabilityDescriptor.expectedReceiptKinds,
              descriptorDigest: capabilityDescriptor.descriptorDigest,
            }),
          ]),
        });
        return Object.freeze({
          ...block,
          fixture: Object.freeze({
            ...fixtureBase,
            fixtureDigest: digestAgentCanonicalValue(fixtureBase),
          }),
        });
      })
    ),
  });
  return createAgentEvaluationCaseMaterial({
    caseDefinition,
    caseDefinitionDigestInput: source.caseDefinitionDigestInput,
    expectedAuthorityDigestInput: source.expectedAuthorityDigestInput,
    gradingPolicyDigestInput: source.gradingPolicyDigestInput,
    invocation,
    expectedAuthority: source.expectedAuthority,
    grader: Object.freeze({
      deterministicFirst: source.grader.deterministicFirst,
      checks: source.grader.checks,
    }),
    protectedLeakCanaries: source.protectedLeakCanaries,
  });
};

const exampleSchemaValue = (schemaValue: unknown): unknown => {
  if (!isPlainObject(schemaValue)) {
    throw new TypeError('Expected portable schema object.');
  }
  if (Object.hasOwn(schemaValue, 'const')) return schemaValue.const;
  if (Array.isArray(schemaValue.enum) && schemaValue.enum.length > 0) {
    return schemaValue.enum[0];
  }
  switch (schemaValue.type) {
    case 'null':
      return null;
    case 'boolean':
      return true;
    case 'number':
    case 'integer':
      return 1;
    case 'string':
      return 'evaluation-test-value';
    case 'array': {
      const count =
        typeof schemaValue.minItems === 'number' ? schemaValue.minItems : 0;
      return Object.freeze(
        Array.from({ length: count }, () =>
          exampleSchemaValue(schemaValue.items ?? {})
        )
      );
    }
    case 'object': {
      if (!isPlainObject(schemaValue.properties)) {
        return Object.freeze({});
      }
      const required = Array.isArray(schemaValue.required)
        ? schemaValue.required
        : [];
      return Object.freeze(
        Object.fromEntries(
          required.map((key) => {
            if (
              typeof key !== 'string' ||
              !Object.hasOwn(schemaValue.properties as object, key)
            ) {
              throw new TypeError('Portable schema required key drifted.');
            }
            return [
              key,
              exampleSchemaValue(
                (schemaValue.properties as Record<string, unknown>)[key]
              ),
            ];
          })
        )
      );
    }
    default:
      return null;
  }
};

const exampleToolArguments = (
  schemaValue: unknown
): Readonly<Record<string, unknown>> => {
  const value = exampleSchemaValue(schemaValue);
  if (!isPlainObject(value)) {
    throw new TypeError('Expected object tool input schema.');
  }
  return value;
};

const fixture = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  requireParallelCapability = false
): Readonly<{
  plan: AgentModelEvaluationPlan;
  material: AgentEvaluationCaseMaterial;
  descriptor: AgentModelEvaluationAttemptDescriptor;
}> => {
  const plan = createV8EvaluationPlan();
  const material = getG4V8PublicEvaluationCaseMaterials().find(
    (candidate) =>
      candidate.invocation.tools.length >= 2 &&
      (!requireParallelCapability ||
        candidate.invocation.blocks.some(
          (block) =>
            block.kind === 'workspace-fixture' &&
            block.fixture.capabilities.some(
              ({ capabilityId }) => capabilityId === 'provider.parallel-tool'
            )
        )) &&
      plan.concreteCases.some(({ caseId }) => caseId === candidate.caseId)
  );
  if (!material) throw new Error('Expected loop material is missing.');
  const descriptor = planAgentModelEvaluationAttempts(plan).find(
    (candidate) =>
      candidate.caseId === material.caseId &&
      plan.capabilityQualificationTargets.some(
        ({ targetId, protocolFamily: candidateProtocol }) =>
          targetId === candidate.targetId &&
          candidateProtocol === protocolFamily
      )
  );
  if (!descriptor) throw new Error('Expected loop descriptor is missing.');
  return Object.freeze({
    plan,
    material: materialForDescriptor(plan, descriptor, material),
    descriptor,
  });
};

const providerJobBootstrapFixture = (): Readonly<{
  plan: AgentModelEvaluationPlan;
  material: AgentEvaluationCaseMaterial;
  descriptor: AgentModelEvaluationAttemptDescriptor;
}> => {
  const plan = createV8EvaluationPlan();
  const sourceMaterial = getG4V8PublicEvaluationCaseMaterials().find(
    ({ capabilityProfileId, caseId }) =>
      capabilityProfileId === 'g4-provider-background-job' &&
      plan.concreteCases.some((candidate) => candidate.caseId === caseId)
  );
  if (!sourceMaterial) {
    throw new Error('Expected Provider job bootstrap material is missing.');
  }
  const descriptor = planAgentModelEvaluationAttempts(plan).find(
    (candidate) =>
      candidate.caseId === sourceMaterial.caseId &&
      plan.capabilityQualificationTargets.some(
        ({ targetId, protocolFamily }) =>
          targetId === candidate.targetId &&
          protocolFamily === 'openai-responses'
      )
  );
  if (!descriptor) {
    throw new Error('Expected Provider job bootstrap descriptor is missing.');
  }
  return Object.freeze({
    plan,
    material: materialForDescriptor(plan, descriptor, sourceMaterial),
    descriptor,
  });
};

const runtimeConfiguration = (
  maximumTurnsPerAttempt: number,
  maximumToolCallsPerAttempt: number
): AgentEvaluationControlledRuntimeConfiguration => {
  const base = {
    authorityId: 'authority.agent-evaluation-controlled-runtime',
    runtimeImplementationDigest: digestAgentCanonicalValue('runtime'),
    artifactResolutionPolicyDigest: digestAgentCanonicalValue('artifacts'),
    proposalValidationPolicyDigest: digestAgentCanonicalValue('proposal'),
    isolationPolicyDigest: digestAgentCanonicalValue('isolation'),
    g3VerificationPolicyDigest: digestAgentCanonicalValue('g3'),
    controlledRenderPolicyDigest: digestAgentCanonicalValue('render'),
    loop: {
      domainToolChoice: 'required' as const,
      allowParallelDomainToolCalls: maximumToolCallsPerAttempt > 1,
      maximumTurnsPerAttempt,
      maximumToolCallsPerAttempt,
      maximumRepairRoundsPerAttempt: 2,
      maximumToolResultBytes: 65_536,
      maximumAggregateToolResultBytes: 262_144,
      maximumAggregateArtifactBytes: 1_048_576,
      continuationTimeoutMs: 10_000,
      loopPolicyDigest: digestAgentCanonicalValue({
        maximumTurnsPerAttempt,
        maximumToolCallsPerAttempt,
      }),
    },
  } as const;
  return Object.freeze({
    ...base,
    runtimePolicyDigest: digestAgentCanonicalValue(base),
  });
};

const resultArguments = (material: AgentEvaluationCaseMaterial) => {
  const contract = createAgentEvaluationCaseResultContract(material);
  const planDigest = digestAgentCanonicalValue({ plan: material.caseId });
  const closureDigest = digestAgentCanonicalValue({
    closure: material.caseId,
  });
  return Object.freeze({
    resultSchemaVersion: 1,
    resultSchemaDigest: contract.tool.schemaDigest,
    caseId: material.caseId,
    caseDigest: material.caseDigest,
    materialDigest: material.materialDigest,
    caseDefinitionDigest: material.caseDefinitionDigest,
    expectedAuthorityDigest: material.expectedAuthorityDigest,
    gradingPolicyDigest: material.gradingPolicyDigest,
    graderMaterialDigest: material.grader.graderMaterialDigest,
    targetRefs: Object.freeze([...material.expectedAuthority.exactTargetRefs]),
    actionIds: Object.freeze([...material.expectedAuthority.allowedActionIds]),
    contextSourceRefs: Object.freeze([
      ...material.expectedAuthority.requiredContextSourceRefs,
    ]),
    diagnosticCodes: Object.freeze([
      ...material.expectedAuthority.expectedDiagnosticCodes,
    ]),
    plan: Object.freeze({
      kind: 'typed-plan' as const,
      planRef: `verification-plan://${material.caseId}`,
      planDigest,
      repairRoundCount: 0,
    }),
    closure: Object.freeze({
      kind: 'g3-closure' as const,
      closureRef: `verification-closure://${material.caseId}`,
      closureDigest,
      verdict: 'passed' as const,
    }),
    artifactRefs: Object.freeze([
      Object.freeze({
        artifactKind: 'verification-plan' as const,
        artifactRef: `verification-plan://${material.caseId}`,
        artifactDigest: planDigest,
        byteLength: 256,
      }),
      Object.freeze({
        artifactKind: 'verification-closure' as const,
        artifactRef: `verification-closure://${material.caseId}`,
        artifactDigest: closureDigest,
        byteLength: 128,
      }),
    ]),
  });
};

const invocationFor = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor,
  turnIndex: number,
  payloadDigest: string
): AgentProviderAdapterInvocationRequest => {
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === descriptor.targetId
  )!;
  return Object.freeze({
    invocationId: `evaluation-invocation.loop.${turnIndex}`,
    requestDigest: digestAgentCanonicalValue({ turnIndex, payloadDigest }),
    providerConfigurationId: target.providerConfigurationId,
    modelLineageDigest: target.modelLineageDigest,
    capabilityProfileDigest: target.capabilityProfileDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    contextPackDigest: digestAgentCanonicalValue({
      context: descriptor.caseId,
    }),
  });
};

const runtimeEvents = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  input: AgentEvaluationAgentLoopInvokeInput,
  calls: readonly Readonly<{
    providerToolCallId: string;
    providerToolName: string;
    arguments: Readonly<Record<string, unknown>>;
  }>[]
) => {
  const events = calls.map((call, sequence) =>
    createAgentProviderRuntimeEvent({
      eventId: `event.loop.${input.turnIndex}.${sequence}`,
      invocationId: input.invocation.invocationId,
      sequence,
      type: 'tool-call',
      payload: {
        ...(protocolFamily === 'openai-responses'
          ? { itemId: call.providerToolCallId }
          : { id: call.providerToolCallId }),
        name: call.providerToolName,
        arguments: call.arguments,
        argumentsDigest: digestAgentCanonicalValue(call.arguments),
      },
      occurredAt: STARTED_AT,
    })
  );
  events.push(
    createAgentProviderRuntimeEvent({
      eventId: `event.loop.${input.turnIndex}.terminal`,
      invocationId: input.invocation.invocationId,
      sequence: calls.length,
      type: 'completed',
      payload: { providerResponseId: `response.loop.${input.turnIndex}` },
      occurredAt: COMPLETED_AT,
    })
  );
  return Object.freeze(events);
};

const bootstrapObservation = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    turn: AgentEvaluationAgentLoopInvokeInput;
    events: ReturnType<typeof runtimeEvents>;
    reportedUsage: ReturnType<typeof createAgentUsageVector>;
    includeProviderJob: boolean;
  }>
): AgentEvaluationProviderCapabilityObservationReceipt => {
  const target = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  );
  const provider = input.plan.providerConfigurations.find(
    ({ providerConfigurationId }) =>
      providerConfigurationId === target?.providerConfigurationId
  );
  const runtimeFactSourceAuthority =
    target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
  if (!target || !provider || !runtimeFactSourceAuthority) {
    throw new Error('Bootstrap observation authority is missing.');
  }
  const terminal = input.events.at(-1)!.durableEvent;
  const responseDigest = digestAgentNativeProviderRuntimeResponse(
    input.turn.invocation.requestDigest,
    Object.freeze([
      ...input.events.map((value) =>
        Object.freeze({ factType: 'provider-event' as const, value })
      ),
      Object.freeze({
        factType: 'usage-vector' as const,
        value: input.reportedUsage,
      }),
    ])
  );
  const dispatchIntentDigest = digestAgentCanonicalValue({
    dispatch: input.turn.invocation.requestDigest,
  });
  const transportReceiptDigest = digestAgentCanonicalValue({
    transport: input.turn.invocation.requestDigest,
  });
  const resultSpoolReceiptDigest = digestAgentCanonicalValue({
    spool: input.turn.invocation.requestDigest,
  });
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    eventDigests: input.events.map(
      ({ durableEvent }) => durableEvent.eventDigest
    ),
    usageVectorDigest: input.reportedUsage.vectorDigest,
  });
  const terminalFact = Object.freeze({
    factKind: 'provider-event' as const,
    factDigest: terminal.eventDigest,
    value: terminal,
  });
  const providerJob = input.includeProviderJob
    ? createAgentProviderJobReceipt(
        createAgentProviderJob({
          providerJobId: 'job.agent-loop-bootstrap.1',
          taskId: 'task.agent-loop-bootstrap.1',
          runId: 'run.agent-loop-bootstrap.1',
          generation: 1,
          invocationId: input.turn.invocation.invocationId,
          requestDigest: input.turn.invocation.requestDigest,
        })
      )
    : undefined;
  const providerJobFact = providerJob
    ? Object.freeze({
        factKind: 'provider-job-receipt' as const,
        factDigest: providerJob.receiptDigest,
        value: providerJob,
      })
    : undefined;
  const sanitization = Object.freeze({
    protectedMaterialCanaries: Object.freeze([
      'protected-agent-loop-bootstrap-canary',
    ]),
    secretCanaries: Object.freeze(['secret-agent-loop-bootstrap-canary']),
  });
  const terminalEnvelope =
    createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
      {
        sourceAuthorityKind: 'native-provider-transport',
        sourceAuthorityId: target.providerConfigurationId,
        sourceAuthorityImplementationDigest: provider.adapter.adapterDigest,
        stageDigest: dispatchIntentDigest,
        dispatchAckDigest: transportReceiptDigest,
        planDigest: input.plan.planDigest,
        repositoryCommit: input.plan.repositoryCommit,
        attemptId: input.descriptor.attemptId,
        descriptorDigest: input.descriptor.descriptorDigest,
        turnIndex: input.turn.turnIndex,
        invocationId: input.turn.invocation.invocationId,
        requestDigest: input.turn.invocation.requestDigest,
        responseDigest,
        protocolFamily: 'openai-responses',
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        adapterDigest: provider.adapter.adapterDigest,
        dispatchIntentDigest,
        transportReceiptDigest,
        resultSpoolReceiptDigest,
        normalizedEventSetDigest,
        observedAt: COMPLETED_AT,
        fact: terminalFact,
      },
      sanitization
    );
  const providerJobEnvelope = providerJobFact
    ? createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        {
          sourceAuthorityKind: 'shared-durable-capability',
          sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
          sourceAuthorityImplementationDigest:
            runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
          sourceKind: runtimeFactSourceAuthority.sourceKind,
          routeBinding: runtimeFactSourceAuthority.routeBinding,
          registrationAuthorityIssuerId:
            runtimeFactSourceAuthority.registrationAuthorityIssuerId,
          registrationReceiptDigest:
            runtimeFactSourceAuthority.registrationReceiptDigest,
          runtimeFactSourceAuthorityDigest:
            runtimeFactSourceAuthority.authorityDigest,
          stageDigest: digestAgentCanonicalValue({
            stage: input.turn.invocation.requestDigest,
          }),
          dispatchAckDigest: digestAgentCanonicalValue({
            ack: input.turn.invocation.requestDigest,
          }),
          planDigest: input.plan.planDigest,
          repositoryCommit: input.plan.repositoryCommit,
          attemptId: input.descriptor.attemptId,
          descriptorDigest: input.descriptor.descriptorDigest,
          turnIndex: input.turn.turnIndex,
          invocationId: input.turn.invocation.invocationId,
          requestDigest: input.turn.invocation.requestDigest,
          responseDigest,
          protocolFamily: 'openai-responses',
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          dispatchIntentDigest,
          transportReceiptDigest,
          resultSpoolReceiptDigest,
          normalizedEventSetDigest,
          observedAt: COMPLETED_AT,
          fact: providerJobFact,
        },
        sanitization
      )
    : undefined;
  const facts = Object.freeze([
    terminalFact,
    ...(providerJobFact ? [providerJobFact] : []),
  ]);
  return createAgentEvaluationProviderCapabilityObservationReceipt(
    {
      observationReceiptId: `observation.${input.turn.invocation.invocationId}`,
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      turnIndex: input.turn.turnIndex,
      invocationId: input.turn.invocation.invocationId,
      requestDigest: input.turn.invocation.requestDigest,
      responseDigest,
      protocolFamily: 'openai-responses',
      providerConfigurationId: target.providerConfigurationId,
      modelLineageDigest: target.modelLineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      dispatchIntentDigest,
      transportReceiptDigest,
      resultSpoolReceiptDigest,
      normalizedEventSetDigest,
      facts,
      factAuthorities: Object.freeze([
        createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
          terminalEnvelope,
          sanitization
        ),
        ...(providerJobEnvelope
          ? [
              createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
                providerJobEnvelope,
                sanitization
              ),
            ]
          : []),
      ]),
      observedAt: COMPLETED_AT,
    },
    sanitization
  );
};

const controlledRuntimeFor = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    material: AgentEvaluationCaseMaterial;
    closureAfterExecutionCount: number;
    observeConcurrentExecutions?: (count: number) => void;
    rejectedExecutionCounts?: ReadonlySet<number>;
  }>
): AgentEvaluationControlledRuntime => {
  const claims = resultArguments(input.material);
  const grantDigest = digestAgentCanonicalValue({
    grant: input.material.caseId,
  });
  let executionCount = 0;
  let activeExecutions = 0;
  return Object.freeze({
    async executeTool(toolInput: AgentEvaluationControlledToolExecutionInput) {
      executionCount += 1;
      const currentExecutionCount = executionCount;
      activeExecutions += 1;
      input.observeConcurrentExecutions?.(activeExecutions);
      await Promise.resolve();
      const persistedArtifacts = input.rejectedExecutionCounts?.has(
        currentExecutionCount
      )
        ? []
        : input.closureAfterExecutionCount === 2
          ? currentExecutionCount === 1
            ? [claims.artifactRefs[0]!]
            : currentExecutionCount === 2
              ? [claims.artifactRefs[1]!]
              : []
          : currentExecutionCount === input.closureAfterExecutionCount
            ? claims.artifactRefs
            : [];
      const output = createAgentEvaluationControlledToolExecutionOutput(
        toolInput,
        {
          grantDigest,
          toolRegistryDigest: input.plan.toolRegistryDigest,
          toolDefinitionDigest: input.material.invocation.tools.find(
            ({ toolId }) => toolId === toolInput.toolId
          )!.definitionDigest,
          inputSchemaDigest: digestAgentCanonicalValue(
            input.material.invocation.tools.find(
              ({ toolId }) => toolId === toolInput.toolId
            )!.inputSchema
          ),
          generation: 1,
          idempotencyKey: `idempotency.${toolInput.toolCallId}`,
          operationIntentDigest: digestAgentCanonicalValue({
            operation: toolInput.toolCallId,
            argumentsDigest: toolInput.argumentsDigest,
          }),
          status: input.rejectedExecutionCounts?.has(currentExecutionCount)
            ? 'rejected'
            : 'succeeded',
          result: {
            status: input.rejectedExecutionCounts?.has(currentExecutionCount)
              ? 'conflicted'
              : 'ok',
          },
          persistedArtifacts: persistedArtifacts.map((artifact) => ({
            ...artifact,
            persistenceReceiptDigest: digestAgentCanonicalValue({
              persistence: artifact.artifactDigest,
              toolCallId: toolInput.toolCallId,
            }),
          })),
          commandReceiptDigests: Object.freeze([]),
          transactionReceiptDigests: Object.freeze([]),
        }
      );
      activeExecutions -= 1;
      return output;
    },
    async continue(
      continuationInput: AgentEvaluationControlledContinuationInput
    ) {
      return createAgentEvaluationControlledContinuationOutput(
        continuationInput
      );
    },
    async assessFinal(runtimeInput: AgentEvaluationControlledRuntimeInput) {
      const toolReceiptDigests = runtimeInput.toolExecutionReceipts
        .map(({ receiptDigest }) => receiptDigest)
        .sort();
      const persistenceDigests = runtimeInput.toolExecutionReceipts
        .flatMap(({ persistedArtifacts }) => persistedArtifacts)
        .map(({ persistenceReceiptDigest }) => persistenceReceiptDigest)
        .sort();
      const verificationAttemptGrantReceiptDigest = digestAgentCanonicalValue({
        grant: input.material.caseId,
        generation: 1,
      });
      return createAgentEvaluationControlledRuntimeReceipt(runtimeInput, {
        grantDigest,
        grantGeneration: 1,
        verificationAttemptGrantReceiptDigests: Object.freeze([
          verificationAttemptGrantReceiptDigest,
        ]),
        toolRegistryDigest: input.plan.toolRegistryDigest,
        actionRegistryDigest: input.plan.actionRegistryDigest,
        operationSealReceiptDigests: runtimeInput.toolExecutionReceipts.map(
          ({ operationIntentDigest }) =>
            digestAgentCanonicalValue({ seal: operationIntentDigest })
        ),
        ownerAuthorityReceiptDigests: Object.freeze([
          digestAgentCanonicalValue({ owner: input.material.caseId }),
          verificationAttemptGrantReceiptDigest,
        ]),
        baseSnapshotDigest: digestAgentCanonicalValue({
          snapshot: 'base',
          caseId: input.material.caseId,
        }),
        finalSnapshotDigest: digestAgentCanonicalValue({
          snapshot: 'final',
          caseId: input.material.caseId,
        }),
        cleanupReceiptDigest: digestAgentCanonicalValue({
          cleanup: input.material.caseId,
        }),
        sourceReferencesRevoked: true,
        sandboxDestroyed: true,
        artifactResolution: {
          resolvedArtifactCount: runtimeInput.submission.artifactRefs.length,
          resolvedArtifactBytes: runtimeInput.submission.artifactRefs.reduce(
            (total, { byteLength }) => total + byteLength,
            0
          ),
          artifactResolutionReceiptSetDigest: digestAgentCanonicalValue({
            artifactPersistenceReceiptDigests: persistenceDigests,
          }),
        },
        proposalValidation: {
          verdict: 'passed',
          typedProposalValidationReceiptDigest: digestAgentCanonicalValue({
            proposal: runtimeInput.submission.submissionDigest,
          }),
        },
        isolatedExecution: {
          isolationPolicyDigest: runtimeInput.isolationPolicyDigest,
          toolCallCount: toolReceiptDigests.length,
          toolReceiptSetDigest: digestAgentCanonicalValue({
            toolReceiptDigests,
          }),
          repairRoundCount: 0,
          commandCount: 0,
          commandReceiptSetDigest: digestAgentCanonicalValue({
            commandReceiptDigests: [],
          }),
          transactionCount: 0,
        },
        g3Verification: {
          verificationPlanReceiptDigest: digestAgentCanonicalValue({
            plan: runtimeInput.submission.plan.planDigest,
          }),
          verificationClosureDigest:
            runtimeInput.submission.closure.closureDigest,
          verdict: 'passed',
        },
      });
    },
  });
};

const capabilityRuntime: AgentEvaluationCapabilityRuntime = Object.freeze({
  async executeTool() {
    throw new Error('Loop fixture did not expect a capability-owned tool.');
  },
  async assessCapability() {
    throw new Error('Loop unit tests do not finalize capability evidence.');
  },
});

const runLoop = async (
  input: Readonly<{
    protocolFamily: AgentEvaluationInvocationPayloadProtocol;
    maximumTurns: number;
    maximumToolCalls: number;
    callsPerDomainTurn: number;
    closureAfterExecutionCount: number;
    mutateTerminalCalls?: (
      calls: readonly Readonly<{
        providerToolCallId: string;
        providerToolName: string;
        arguments: Readonly<Record<string, unknown>>;
      }>[]
    ) => readonly Readonly<{
      providerToolCallId: string;
      providerToolName: string;
      arguments: Readonly<Record<string, unknown>>;
    }>[];
    rejectedExecutionCounts?: ReadonlySet<number>;
  }>
) => {
  const { plan, material, descriptor } = fixture(
    input.protocolFamily,
    input.callsPerDomainTurn > 1
  );
  const claims = resultArguments(material);
  const observedPhases: string[] = [];
  let maximumConcurrentExecutions = 0;
  const result = await runAgentEvaluationAgentTurnLoop({
    namespaceId: 'namespace.g4-evaluation-test',
    shardLeaseOwnerId: 'owner.g4-evaluation-test',
    shardLeaseGeneration: 1,
    verificationGrantGeneration: 1,
    verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
      grantReceipts: ['test'],
    }),
    plan,
    descriptor,
    material,
    protocolFamily: input.protocolFamily,
    contextPackDigest: digestAgentCanonicalValue({ context: material.caseId }),
    controlledRuntimeConfiguration: runtimeConfiguration(
      input.maximumTurns,
      input.maximumToolCalls
    ),
    controlledRuntime: controlledRuntimeFor({
      plan,
      material,
      closureAfterExecutionCount: input.closureAfterExecutionCount,
      ...(input.rejectedExecutionCounts
        ? { rejectedExecutionCounts: input.rejectedExecutionCounts }
        : {}),
      observeConcurrentExecutions: (count) => {
        maximumConcurrentExecutions = Math.max(
          maximumConcurrentExecutions,
          count
        );
      },
    }),
    capabilityRuntime,
    createInvocation: ({ turnIndex, encodedPayload }) =>
      invocationFor(plan, descriptor, turnIndex, encodedPayload.payloadDigest),
    invoke: async (turnInput) => {
      observedPhases.push(turnInput.phase);
      const calls =
        turnInput.phase === 'result-submission'
          ? [
              {
                providerToolCallId: `provider-call.result.${turnInput.turnIndex}`,
                providerToolName:
                  turnInput.encodedPayload.resultToolBinding!.providerToolName,
                arguments: claims,
              },
            ]
          : turnInput.encodedPayload.toolBindings
              .slice(0, input.callsPerDomainTurn)
              .map(({ toolId, providerToolName }, index) => ({
                providerToolCallId: `provider-call.domain.${turnInput.turnIndex}.${index}`,
                providerToolName,
                arguments: exampleToolArguments(
                  material.invocation.tools.find(
                    (tool) => tool.toolId === toolId
                  )!.inputSchema
                ),
              }));
      const exactCalls =
        turnInput.phase === 'result-submission' && input.mutateTerminalCalls
          ? input.mutateTerminalCalls(calls)
          : calls;
      const events = runtimeEvents(input.protocolFamily, turnInput, exactCalls);
      const reportedUsage = createAgentUsageVector([]);
      return Object.freeze({
        events,
        reportedUsage,
        terminalEvent: events.at(-1)!,
        budgetReservationId: `budget-reservation.agent-loop.${turnInput.turnIndex}`,
        responseDigest: digestAgentNativeProviderRuntimeResponse(
          turnInput.invocation.requestDigest,
          Object.freeze([
            ...events.map((value) =>
              Object.freeze({ factType: 'provider-event' as const, value })
            ),
            Object.freeze({
              factType: 'usage-vector' as const,
              value: reportedUsage,
            }),
          ])
        ),
        runtimeRejected: false,
        artifactBytes: JSON.stringify(events).length,
        status: 'completed' as const,
        startedAt: STARTED_AT,
        completedAt: COMPLETED_AT,
      });
    },
    finalizeProviderCapabilityObservation: async ({ runtime }) =>
      runtime.providerCapabilityObservationReceipt,
    requiresControlledPreview: false,
  });
  return Object.freeze({
    result,
    observedPhases,
    material,
    maximumConcurrentExecutions,
  });
};

describe('bounded native agent turn loop', () => {
  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'executes parallel domain tools, replays exact provider call ids, and forces terminal submit for %s',
    async (protocolFamily) => {
      const { result, observedPhases, maximumConcurrentExecutions } =
        await runLoop({
          protocolFamily,
          maximumTurns: 4,
          maximumToolCalls: 3,
          callsPerDomainTurn: 2,
          closureAfterExecutionCount: 2,
        });
      expect(observedPhases).toEqual(['domain-tools', 'result-submission']);
      expect(result.finalStatus).toBe('completed');
      expect(result.turns).toHaveLength(2);
      expect(result.toolCallCount).toBe(2);
      expect(maximumConcurrentExecutions).toBe(2);
      expect(result.resultSubmissionReceipt).toMatchObject({
        providerToolCallId: 'provider-call.result.1',
      } satisfies Partial<AgentEvaluationResultSubmissionReceipt>);
      expect(result.controlledRuntimeReceipt?.g3Verification.verdict).toBe(
        'passed'
      );
      expect(result.turns[1]!.encodedPayload.toolResultBindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerToolCallId: 'provider-call.domain.0.0',
          }),
          expect.objectContaining({
            providerToolCallId: 'provider-call.domain.0.1',
          }),
        ])
      );
      expect(
        JSON.stringify(result.turns[1]!.encodedPayload.payload.body)
      ).toContain('evaluation-test-value');
      expect(result.turns[1]!.encodedPayload.toolBindings).toHaveLength(1);
      expect(result.turns[1]!.encodedPayload.toolBindings[0]?.toolId).toBe(
        'evaluation.result.submit'
      );
    },
    30_000
  );

  it('reserves the seventh and final turn for the typed result submission', async () => {
    const { result, observedPhases } = await runLoop({
      protocolFamily: 'openai-responses',
      maximumTurns: 7,
      maximumToolCalls: 6,
      callsPerDomainTurn: 1,
      closureAfterExecutionCount: 6,
    });
    expect(result.finalStatus).toBe('completed');
    expect(result.turns).toHaveLength(7);
    expect(observedPhases).toEqual([
      'domain-tools',
      'domain-tools',
      'domain-tools',
      'domain-tools',
      'domain-tools',
      'domain-tools',
      'result-submission',
    ]);
    expect(result.turns.at(-1)).toMatchObject({
      turnIndex: 6,
      terminal: true,
      phase: 'result-submission',
    });
  });

  it('runs an allowed overlapping batch and counts a conflicted batch as one repair round', async () => {
    const { result, maximumConcurrentExecutions } = await runLoop({
      protocolFamily: 'openai-responses',
      maximumTurns: 7,
      maximumToolCalls: 6,
      callsPerDomainTurn: 2,
      closureAfterExecutionCount: 4,
      rejectedExecutionCounts: new Set([1, 2]),
    });
    expect(maximumConcurrentExecutions).toBe(2);
    expect(result.finalStatus).toBe('completed');
    expect(result.repairRoundCount).toBe(1);
    expect(
      result.toolExecutionOutputs
        .slice(0, 2)
        .map(({ receipt }) => receipt.status)
    ).toEqual(['rejected', 'rejected']);
  });

  it('fails closed when terminal output contains another domain tool call', async () => {
    const { result } = await runLoop({
      protocolFamily: 'anthropic-messages',
      maximumTurns: 4,
      maximumToolCalls: 3,
      callsPerDomainTurn: 2,
      closureAfterExecutionCount: 2,
      mutateTerminalCalls: (calls) =>
        Object.freeze([
          ...calls,
          Object.freeze({
            providerToolCallId: 'provider-call.unexpected-domain',
            providerToolName: 'unknown_domain_tool',
            arguments: Object.freeze({ unsafe: false }),
          }),
        ]),
    });
    expect(result.finalStatus).toBe('schema-failed');
    expect(result.turns.at(-1)).toMatchObject({
      terminal: true,
      status: 'schema-failed',
    });
    expect(result.resultSubmissionReceipt).toBeUndefined();
    expect(result.controlledRuntimeReceipt).toBeUndefined();
  });

  it('grades a missing turn-zero Provider source without a second dispatch', async () => {
    const { plan, material, descriptor } = providerJobBootstrapFixture();
    let invokeCount = 0;
    let requestRefPreparationCount = 0;
    const result = await runAgentEvaluationAgentTurnLoop({
      namespaceId: 'namespace.g4-evaluation-test',
      shardLeaseOwnerId: 'owner.g4-evaluation-test',
      shardLeaseGeneration: 1,
      verificationGrantGeneration: 1,
      verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
        grantReceipts: ['bootstrap-missing'],
      }),
      plan,
      descriptor,
      material,
      protocolFamily: 'openai-responses',
      contextPackDigest: digestAgentCanonicalValue({
        context: material.caseId,
      }),
      controlledRuntimeConfiguration: runtimeConfiguration(3, 1),
      controlledRuntime: controlledRuntimeFor({
        plan,
        material,
        closureAfterExecutionCount: 1,
      }),
      capabilityRuntime,
      prepareCapabilityEffectRequestRefs: async () => {
        requestRefPreparationCount += 1;
        throw new Error('Missing bootstrap source must not request a ref.');
      },
      createInvocation: ({ turnIndex, encodedPayload, requestDigest }) => {
        const invocation = invocationFor(
          plan,
          descriptor,
          turnIndex,
          encodedPayload.payloadDigest
        );
        return Object.freeze({
          ...invocation,
          requestDigest: requestDigest ?? invocation.requestDigest,
        });
      },
      invoke: async (turn) => {
        invokeCount += 1;
        expect(turn.turnIndex).toBe(0);
        expect(turn.encodedPayload.toolBindings).toEqual([]);
        expect(Object.hasOwn(turn.encodedPayload.payload.body, 'tools')).toBe(
          false
        );
        expect(
          Object.hasOwn(turn.encodedPayload.payload.body, 'tool_choice')
        ).toBe(false);
        const runtimeMaterial =
          turn.encodedPayload.payload.capabilityRuntimeRequestMaterial;
        expect(runtimeMaterial).toBeDefined();
        expect(runtimeMaterial?.projection).toMatchObject({
          operation: 'background-submit',
          requestDigest: turn.invocation.requestDigest,
          responseMode: 'application-json',
          stream: false,
          store: true,
          background: true,
        });
        expect(runtimeMaterial?.projection.requestBodyDigest).toBe(
          digestAgentCanonicalValue({
            body: runtimeMaterial?.callbackLocalBody,
          })
        );
        expect(runtimeMaterial?.callbackLocalBody).toMatchObject({
          model: runtimeMaterial?.projection.modelId,
          stream: false,
          store: true,
          background: true,
        });
        const events = runtimeEvents('openai-responses', turn, []);
        const reportedUsage = createAgentUsageVector([]);
        const providerCapabilityObservationReceipt = bootstrapObservation({
          plan,
          descriptor,
          turn,
          events,
          reportedUsage,
          includeProviderJob: false,
        });
        return Object.freeze({
          events,
          reportedUsage,
          terminalEvent: events.at(-1)!,
          budgetReservationId: 'budget-reservation.agent-loop.bootstrap',
          responseDigest: providerCapabilityObservationReceipt.responseDigest,
          providerCapabilityObservationReceipt,
          runtimeRejected: false,
          artifactBytes: JSON.stringify(events).length,
          status: 'completed' as const,
          startedAt: STARTED_AT,
          completedAt: COMPLETED_AT,
        });
      },
      finalizeProviderCapabilityObservation: async ({ runtime }) =>
        runtime.providerCapabilityObservationReceipt,
      requiresControlledPreview: false,
    });

    expect(invokeCount).toBe(1);
    expect(requestRefPreparationCount).toBe(0);
    expect(result.finalStatus).toBe('completed');
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]).toMatchObject({
      turnIndex: 0,
      terminal: true,
      status: 'completed',
      zeroToolCallDisposition: 'grade-unavailable',
      capabilityEffectBindingKind: 'provider-job',
      postObservationRequestRefIssuanceDecision: {
        turnIndex: 1,
        disposition: 'source-unavailable',
        priorSourceTurnIndex: null,
        priorSourceObservationReceiptDigest: null,
      },
    });
  });

  it('seals an observed turn-zero Provider source before preparing the turn-one ref', async () => {
    const { plan, material, descriptor } = providerJobBootstrapFixture();
    let invokeCount = 0;
    let preparedTurnIndex: number | undefined;
    await expect(
      runAgentEvaluationAgentTurnLoop({
        namespaceId: 'namespace.g4-evaluation-test',
        shardLeaseOwnerId: 'owner.g4-evaluation-test',
        shardLeaseGeneration: 1,
        verificationGrantGeneration: 1,
        verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
          grantReceipts: ['bootstrap-observed'],
        }),
        plan,
        descriptor,
        material,
        protocolFamily: 'openai-responses',
        contextPackDigest: digestAgentCanonicalValue({
          context: material.caseId,
        }),
        controlledRuntimeConfiguration: runtimeConfiguration(3, 1),
        controlledRuntime: controlledRuntimeFor({
          plan,
          material,
          closureAfterExecutionCount: 1,
        }),
        capabilityRuntime,
        prepareCapabilityEffectRequestRefs: async ({
          turnIndex,
          capabilityToolIds,
        }) => {
          preparedTurnIndex = turnIndex;
          expect(capabilityToolIds).toEqual(['provider.background-job.poll']);
          throw new Error('turn-one-ref-prepared');
        },
        createInvocation: ({ turnIndex, encodedPayload, requestDigest }) => {
          const invocation = invocationFor(
            plan,
            descriptor,
            turnIndex,
            encodedPayload.payloadDigest
          );
          return Object.freeze({
            ...invocation,
            requestDigest: requestDigest ?? invocation.requestDigest,
          });
        },
        invoke: async (turn) => {
          invokeCount += 1;
          const events = runtimeEvents('openai-responses', turn, []);
          const reportedUsage = createAgentUsageVector([]);
          const providerCapabilityObservationReceipt = bootstrapObservation({
            plan,
            descriptor,
            turn,
            events,
            reportedUsage,
            includeProviderJob: true,
          });
          return Object.freeze({
            events,
            reportedUsage,
            terminalEvent: events.at(-1)!,
            budgetReservationId: 'budget-reservation.agent-loop.request-ref',
            responseDigest: providerCapabilityObservationReceipt.responseDigest,
            providerCapabilityObservationReceipt,
            runtimeRejected: false,
            artifactBytes: JSON.stringify(events).length,
            status: 'completed' as const,
            startedAt: STARTED_AT,
            completedAt: COMPLETED_AT,
          });
        },
        finalizeProviderCapabilityObservation: async ({ runtime }) =>
          runtime.providerCapabilityObservationReceipt,
        requiresControlledPreview: false,
      })
    ).rejects.toThrow('turn-one-ref-prepared');
    expect(invokeCount).toBe(1);
    expect(preparedTurnIndex).toBe(1);
  });

  it('routes provider lifecycle tools to the capability owner and blocks unsupported required capability', async () => {
    const plan = createV8EvaluationPlan();
    const concreteCase = plan.concreteCases.find(({ capabilityDescriptor }) =>
      capabilityDescriptor.expectedToolIds.includes('provider.retrieval.search')
    );
    if (!concreteCase) {
      throw new Error('Expected hosted retrieval case is missing.');
    }
    const sourceMaterial = getG4V8PublicEvaluationCaseMaterials().find(
      ({ caseId }) => caseId === concreteCase.caseId
    );
    if (!sourceMaterial) {
      throw new Error('Expected hosted retrieval material is missing.');
    }
    const descriptor = planAgentModelEvaluationAttempts(plan).find(
      (candidate) =>
        candidate.caseId === sourceMaterial.caseId &&
        plan.capabilityQualificationTargets.some(
          ({ targetId, protocolFamily }) =>
            targetId === candidate.targetId &&
            protocolFamily === 'openai-responses'
        )
    );
    if (!descriptor) {
      throw new Error('Expected hosted retrieval descriptor is missing.');
    }
    const material = materialForDescriptor(plan, descriptor, sourceMaterial);
    const target = plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === descriptor.targetId
    );
    const provider = plan.providerConfigurations.find(
      ({ providerConfigurationId }) =>
        providerConfigurationId === target?.providerConfigurationId
    );
    const runtimeFactSourceAuthority =
      target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
    const retrievalTool = material.invocation.tools.find(
      ({ toolId }) => toolId === 'provider.retrieval.search'
    );
    const targetRefSchema =
      retrievalTool && isPlainObject(retrievalTool.inputSchema)
        ? retrievalTool.inputSchema.properties
        : undefined;
    const targetRef =
      isPlainObject(targetRefSchema) &&
      isPlainObject(targetRefSchema.targetRef) &&
      typeof targetRefSchema.targetRef.const === 'string'
        ? targetRefSchema.targetRef.const
        : undefined;
    if (
      !target ||
      !provider ||
      target.protocolFamily !== 'openai-responses' ||
      !runtimeFactSourceAuthority ||
      !retrievalTool ||
      !targetRef
    ) {
      throw new Error('Hosted retrieval authority binding is missing.');
    }
    let requestRefAuthority:
      | ReturnType<
          typeof createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt
        >
      | undefined;
    let includeMixedControlledCall = true;
    let controlledRuntimeCallCount = 0;
    let inputAuthorityResolutionCount = 0;
    const controlledRuntime: AgentEvaluationControlledRuntime = Object.freeze({
      async executeTool() {
        controlledRuntimeCallCount += 1;
        throw new Error('Provider lifecycle tool reached workspace runtime.');
      },
      async continue() {
        controlledRuntimeCallCount += 1;
        throw new Error(
          'Provider lifecycle tool reached workspace continuation.'
        );
      },
      async assessFinal() {
        controlledRuntimeCallCount += 1;
        throw new Error('Unsupported capability reached final assessment.');
      },
    });
    const capabilityInputs: AgentEvaluationCapabilityRuntimeToolInput[] = [];
    const unsupportedRuntime: AgentEvaluationCapabilityRuntime = Object.freeze({
      async executeTool(input: AgentEvaluationCapabilityRuntimeToolInput) {
        capabilityInputs.push(input);
        if (input.executionAuthorityKind !== 'shared-effect') {
          throw new Error(
            'Hosted retrieval did not use shared effect authority.'
          );
        }
        const result = Object.freeze({ status: 'unsupported' as const });
        const resultDigest = digestAgentCanonicalValue(result);
        const specificReceipts = Object.freeze([] as const);
        const continuationReceiptDigest = digestAgentCanonicalValue({
          requestDigest: input.requestDigest,
          resultDigest,
          specificReceiptDigests: [],
        });
        const effectSourceReceipt =
          createAgentEvaluationCapabilityEffectSourceReceipt(
            input.preEffectIntent,
            {
              intentDigest: input.preEffectIntent.intentDigest,
              ownerRequestId: input.preEffectIntent.ownerRequestId,
              ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
              runtimeFactSourceAuthority:
                input.preEffectIntent.runtimeFactSourceAuthority,
              registrationReceiptDigest:
                input.preEffectIntent.registrationReceiptDigest,
              effectStatus: 'unavailable',
              businessResultDigest: resultDigest,
              providerRuntimeJournalResultRecordDigest:
                digestAgentCanonicalValue({ journalResult: 'test' }),
              providerRuntimeResultSealReceiptDigest: digestAgentCanonicalValue(
                { journalResultSeal: 'test' }
              ),
              sourceFactKind: null,
              sourceFactDigest: null,
              stageDigest: digestAgentCanonicalValue({ stage: 'test' }),
              dispatchAckDigest: digestAgentCanonicalValue({ ack: 'test' }),
              transportReceiptDigest: digestAgentCanonicalValue({
                transport: 'test',
              }),
              resultSpoolReceiptDigest: digestAgentCanonicalValue({
                spool: 'test',
              }),
              normalizedEventSetDigest: digestAgentCanonicalValue({
                normalized: 'test',
              }),
              stateVaultResolveRequest: null,
              stateVaultResolveReceipt: null,
              stateVaultRetireRequest: null,
              stateVaultRetirementReceipt: null,
              specificReceiptDigests: Object.freeze([]),
              sealedAt: COMPLETED_AT,
            }
          );
        const responseProjection =
          createAgentEvaluationAttemptAuthorityResponseProjection(
            'capability-runtime',
            'execute-tool',
            {
              executionAuthorityKind: input.executionAuthorityKind,
              outcome: 'unsupported',
              result,
              resultDigest,
              continuationReceiptDigest,
              effectSourceReceipt,
              effectSourceFact: null,
              specificReceipts,
            },
            {
              bindingKind: 'execute-tool',
              executionAuthorityKind: input.executionAuthorityKind,
              invocationId: input.invocationId,
              turnIndex: input.turnIndex,
              toolId: input.toolId,
              toolCallId: input.toolCallId,
              providerToolCallId: input.providerToolCallId,
              providerRequestDigest: input.requestDigest,
              preEffectIntent: input.preEffectIntent,
            }
          );
        const authorityReceipt =
          createAgentEvaluationAttemptAuthorityOwnerReceipt({
            serviceKind: 'capability-runtime',
            operation: 'execute-tool',
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
            requestDigest: digestAgentCanonicalValue({
              operation: 'execute-tool',
              invocationId: input.invocationId,
              toolCallId: input.toolCallId,
            }),
            responseProjection,
            ownerImplementationDigest: digestAgentCanonicalValue({
              owner: 'provider-capability-test',
            }),
            completedAt: COMPLETED_AT,
          });
        return Object.freeze({
          executionAuthorityKind: input.executionAuthorityKind,
          outcome: 'unsupported' as const,
          result,
          resultDigest,
          continuationReceiptDigest,
          effectSourceReceipt,
          effectSourceFact: null,
          specificReceipts,
          authorityReceipt,
        });
      },
      async assessCapability() {
        throw new Error('Terminal attempt evidence is assembled by executor.');
      },
    });

    const run = () =>
      runAgentEvaluationAgentTurnLoop({
        namespaceId: 'namespace.g4-evaluation-test',
        shardLeaseOwnerId: 'owner.g4-evaluation-test',
        shardLeaseGeneration: 1,
        verificationGrantGeneration: 1,
        verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
          grantReceipts: ['test'],
        }),
        plan,
        descriptor,
        material,
        protocolFamily: 'openai-responses',
        contextPackDigest: digestAgentCanonicalValue({
          context: material.caseId,
        }),
        controlledRuntimeConfiguration: runtimeConfiguration(2, 1),
        controlledRuntime,
        capabilityRuntime: unsupportedRuntime,
        prepareCapabilityEffectRequestRefs: async ({
          turnIndex,
          capabilityToolIds,
        }) => {
          if (
            turnIndex !== 0 ||
            capabilityToolIds.length !== 1 ||
            capabilityToolIds[0] !== retrievalTool.toolId
          ) {
            throw new Error('Hosted retrieval request-ref scope drifted.');
          }
          requestRefAuthority =
            createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
              namespaceId: 'namespace.g4-evaluation-test',
              planDigest: plan.planDigest,
              repositoryCommit: plan.repositoryCommit,
              attemptId: descriptor.attemptId,
              descriptorDigest: descriptor.descriptorDigest,
              turnIndex,
              invocationId: 'evaluation-invocation.loop.0',
              bindingKind: 'hosted-retrieval-query',
              capabilityId: 'provider.hosted-retrieval',
              toolId: retrievalTool.toolId,
              targetRef,
              protocolFamily: 'openai-responses',
              providerConfigurationId: target.providerConfigurationId,
              modelLineageDigest: target.modelLineageDigest,
              adapterDigest: provider.adapter.adapterDigest,
              runtimeFactSourceAuthorityDigest:
                runtimeFactSourceAuthority.authorityDigest,
              registrationReceiptDigest:
                runtimeFactSourceAuthority.registrationReceiptDigest,
              issuedAt: STARTED_AT,
              expiresAt: new Date(
                Date.parse(STARTED_AT) + 125_000
              ).toISOString(),
            });
          return Object.freeze([requestRefAuthority]);
        },
        resolveCapabilityEffectInputAuthority: async ({
          invocation,
          runtime,
          call,
          requestRefAuthority: expectedRequestRefAuthority,
        }) => {
          inputAuthorityResolutionCount += 1;
          const observation = runtime.providerCapabilityObservationReceipt;
          if (
            !requestRefAuthority ||
            expectedRequestRefAuthority.receiptDigest !==
              requestRefAuthority.receiptDigest ||
            !observation
          ) {
            throw new Error('Hosted retrieval input authority is missing.');
          }
          return createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt(
            {
              bindingKind: 'hosted-retrieval-query',
              capabilityId: 'provider.hosted-retrieval',
              requestRef: requestRefAuthority.requestRef,
              targetRef: requestRefAuthority.targetRef,
              requestRefAuthority,
              requestRefAuthorityReceiptDigest:
                requestRefAuthority.receiptDigest,
              sourceAttemptId: descriptor.attemptId,
              sourceTurnIndex: 0,
              sourceInvocationId: invocation.invocationId,
              sourceProviderRequestDigest: invocation.requestDigest,
              sourceResponseDigest: runtime.responseDigest,
              sourceDispatchIntentDigest: observation.dispatchIntentDigest,
              sourceTransportReceiptDigest: observation.transportReceiptDigest,
              sourceResultSpoolReceiptDigest:
                observation.resultSpoolReceiptDigest,
              sourceNormalizedEventSetDigest:
                observation.normalizedEventSetDigest,
              sourceObservationReceiptDigest: null,
              sourceFactKind: 'provider-event',
              sourceProviderEventType: 'tool-call',
              sourceProviderToolCallId: call.providerToolCallId,
              sourceToolId: call.toolId,
              sourceArgumentsDigest: call.argumentsDigest,
              sourceHandleDigest: call.event.durableEvent.eventDigest,
              stateVaultSealRequest: null,
              stateVaultSealReceipt: null,
              protocolFamily: 'openai-responses',
              providerConfigurationId: target.providerConfigurationId,
              modelLineageDigest: target.modelLineageDigest,
              adapterDigest: provider.adapter.adapterDigest,
            }
          );
        },
        createInvocation: ({ turnIndex, encodedPayload }) =>
          invocationFor(
            plan,
            descriptor,
            turnIndex,
            encodedPayload.payloadDigest
          ),
        invoke: async (turnInput) => {
          const binding = turnInput.encodedPayload.toolBindings.find(
            ({ toolId }) => toolId === 'provider.retrieval.search'
          );
          const controlledBinding = turnInput.encodedPayload.toolBindings.find(
            ({ toolId }) => toolId !== 'provider.retrieval.search'
          );
          if (!binding || !requestRefAuthority) {
            throw new Error('Hosted retrieval tool binding is missing.');
          }
          if (includeMixedControlledCall && !controlledBinding) {
            throw new Error('Controlled tool binding is missing.');
          }
          const events = runtimeEvents(
            'openai-responses',
            turnInput,
            Object.freeze([
              ...(includeMixedControlledCall && controlledBinding
                ? [
                    Object.freeze({
                      providerToolCallId: 'provider-call.controlled.0',
                      providerToolName: controlledBinding.providerToolName,
                      arguments: exampleToolArguments(
                        material.invocation.tools.find(
                          ({ toolId }) => toolId === controlledBinding.toolId
                        )!.inputSchema
                      ),
                    }),
                  ]
                : []),
              Object.freeze({
                providerToolCallId: 'provider-call.retrieval.0',
                providerToolName: binding.providerToolName,
                arguments: Object.freeze({
                  requestRef: requestRefAuthority.requestRef,
                  targetRef: requestRefAuthority.targetRef,
                }),
              }),
            ])
          );
          const reportedUsage = createAgentUsageVector([]);
          const responseDigest = digestAgentNativeProviderRuntimeResponse(
            turnInput.invocation.requestDigest,
            Object.freeze([
              ...events.map((value) =>
                Object.freeze({ factType: 'provider-event' as const, value })
              ),
              Object.freeze({
                factType: 'usage-vector' as const,
                value: reportedUsage,
              }),
            ])
          );
          const terminalEvent = events.at(-1)!.durableEvent;
          const dispatchIntentDigest = digestAgentCanonicalValue({
            dispatch: turnInput.invocation.requestDigest,
          });
          const transportReceiptDigest = digestAgentCanonicalValue({
            transport: turnInput.invocation.requestDigest,
          });
          const resultSpoolReceiptDigest = digestAgentCanonicalValue({
            spool: turnInput.invocation.requestDigest,
          });
          const normalizedEventSetDigest = digestAgentCanonicalValue({
            eventDigests: events.map(
              ({ durableEvent }) => durableEvent.eventDigest
            ),
            usageVectorDigest: reportedUsage.vectorDigest,
          });
          const terminalFact = Object.freeze({
            factKind: 'provider-event' as const,
            factDigest: terminalEvent.eventDigest,
            value: terminalEvent,
          });
          const terminalEnvelope =
            createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
              {
                sourceAuthorityKind: 'native-provider-transport',
                sourceAuthorityId: target.providerConfigurationId,
                sourceAuthorityImplementationDigest:
                  provider.adapter.adapterDigest,
                stageDigest: dispatchIntentDigest,
                dispatchAckDigest: transportReceiptDigest,
                planDigest: plan.planDigest,
                repositoryCommit: plan.repositoryCommit,
                attemptId: descriptor.attemptId,
                descriptorDigest: descriptor.descriptorDigest,
                turnIndex: turnInput.turnIndex,
                invocationId: turnInput.invocation.invocationId,
                requestDigest: turnInput.invocation.requestDigest,
                responseDigest,
                protocolFamily: 'openai-responses',
                providerConfigurationId: target.providerConfigurationId,
                modelLineageDigest: target.modelLineageDigest,
                adapterDigest: provider.adapter.adapterDigest,
                dispatchIntentDigest,
                transportReceiptDigest,
                resultSpoolReceiptDigest,
                normalizedEventSetDigest,
                observedAt: COMPLETED_AT,
                fact: terminalFact,
              },
              {
                protectedMaterialCanaries: Object.freeze([
                  'protected-agent-loop-observation-canary',
                ]),
                secretCanaries: Object.freeze([
                  'secret-agent-loop-observation-canary',
                ]),
              }
            );
          const providerCapabilityObservationReceipt =
            createAgentEvaluationProviderCapabilityObservationReceipt(
              {
                observationReceiptId: `observation.${turnInput.invocation.invocationId}`,
                planDigest: plan.planDigest,
                repositoryCommit: plan.repositoryCommit,
                attemptId: descriptor.attemptId,
                descriptorDigest: descriptor.descriptorDigest,
                turnIndex: turnInput.turnIndex,
                invocationId: turnInput.invocation.invocationId,
                requestDigest: turnInput.invocation.requestDigest,
                responseDigest,
                protocolFamily: 'openai-responses',
                providerConfigurationId: target.providerConfigurationId,
                modelLineageDigest: target.modelLineageDigest,
                adapterDigest: provider.adapter.adapterDigest,
                dispatchIntentDigest,
                transportReceiptDigest,
                resultSpoolReceiptDigest,
                normalizedEventSetDigest,
                facts: Object.freeze([terminalFact]),
                factAuthorities: Object.freeze([
                  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
                    terminalEnvelope
                  ),
                ]),
                observedAt: COMPLETED_AT,
              },
              {
                protectedMaterialCanaries: Object.freeze([
                  'protected-agent-loop-observation-canary',
                ]),
                secretCanaries: Object.freeze([
                  'secret-agent-loop-observation-canary',
                ]),
              }
            );
          return Object.freeze({
            events,
            reportedUsage,
            terminalEvent: events.at(-1)!,
            budgetReservationId: 'budget-reservation.agent-loop.hosted',
            responseDigest,
            providerCapabilityObservationReceipt,
            runtimeRejected: false,
            artifactBytes: JSON.stringify(events).length,
            status: 'completed' as const,
            startedAt: STARTED_AT,
            completedAt: COMPLETED_AT,
          });
        },
        finalizeProviderCapabilityObservation: async ({ runtime }) =>
          runtime.providerCapabilityObservationReceipt,
        requiresControlledPreview: false,
      });

    const mixedResult = await run();
    expect(mixedResult.finalStatus).toBe('schema-failed');
    expect(mixedResult.toolCallCount).toBe(0);
    expect(mixedResult.toolExecutionOutputs).toEqual([]);
    expect(mixedResult.capabilityToolExecutions).toEqual([]);
    expect(controlledRuntimeCallCount).toBe(0);
    expect(capabilityInputs).toHaveLength(0);
    expect(inputAuthorityResolutionCount).toBe(0);

    includeMixedControlledCall = false;
    requestRefAuthority = undefined;
    const result = await run();

    expect(result.finalStatus).toBe('blocked');
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]).toMatchObject({
      phase: 'domain-tools',
      terminal: true,
      status: 'blocked',
    });
    expect(result.capabilityToolExecutions).toHaveLength(1);
    expect(result.capabilityToolExecutions[0]).toMatchObject({
      input: {
        toolId: 'provider.retrieval.search',
        providerToolCallId: 'provider-call.retrieval.0',
      },
      output: { outcome: 'unsupported' },
    });
    expect(result.toolExecutionOutputs).toEqual([]);
    expect(result.toolCallCount).toBe(1);
    expect(controlledRuntimeCallCount).toBe(0);
    expect(capabilityInputs).toHaveLength(1);
    expect(capabilityInputs[0]).toMatchObject({
      executionAuthorityKind: 'shared-effect',
      budgetReservationId: 'budget-reservation.agent-loop.hosted',
    });
    expect(inputAuthorityResolutionCount).toBe(1);
  }, 30_000);

  it('keeps an expected-blocked retrieval call outside input authority and Hosted execution', async () => {
    const plan = createV8EvaluationPlan();
    const publicMaterials = getG4V8PublicEvaluationCaseMaterials();
    const concreteCase = plan.concreteCases.find(
      ({ caseId, capabilityDescriptor, capabilityProfileId }) =>
        capabilityProfileId === 'g4-provider-hosted-retrieval-core' &&
        capabilityDescriptor.expectedToolIds.includes(
          'provider.retrieval.search'
        ) &&
        publicMaterials.some((material) => material.caseId === caseId)
    );
    const descriptor = planAgentModelEvaluationAttempts(plan).find(
      (candidate) =>
        candidate.caseId === concreteCase?.caseId &&
        plan.capabilityQualificationTargets.some(
          (target) =>
            target.targetId === candidate.targetId &&
            target.protocolFamily === 'openai-responses' &&
            target.optionalCapabilitySupportAuthority?.capabilityId ===
              'provider.hosted-retrieval' &&
            target.optionalCapabilitySupportAuthority.supportExpectation ===
              'expected-blocked'
        )
    );
    const sourceMaterial = publicMaterials.find(
      ({ caseId }) => caseId === descriptor?.caseId
    );
    if (!descriptor || !sourceMaterial) {
      throw new Error(
        `Expected blocked retrieval fixture is unavailable: case=${Boolean(concreteCase)} descriptor=${Boolean(descriptor)} material=${Boolean(sourceMaterial)}.`
      );
    }
    const material = materialForDescriptor(plan, descriptor, sourceMaterial);
    const retrievalTool = material.invocation.tools.find(
      ({ toolId }) => toolId === 'provider.retrieval.search'
    );
    if (!retrievalTool) {
      throw new Error('Expected blocked retrieval tool is unavailable.');
    }

    let requestRefIssueCount = 0;
    let currentTurnSealCount = 0;
    let inputAuthorityResolveCount = 0;
    let hostedTransportInvocationCount = 0;
    const authorityClient: AgentEvaluationCapabilityEffectInputAuthorityClient =
      Object.freeze({
        async issueRequestRef() {
          requestRefIssueCount += 1;
          throw new Error('Expected-blocked request-ref issue reached I/O.');
        },
        async sealCurrentTurnEvent() {
          currentTurnSealCount += 1;
          throw new Error('Expected-blocked event seal reached I/O.');
        },
        async resolveInputAuthority() {
          inputAuthorityResolveCount += 1;
          throw new Error('Expected-blocked authority resolution reached I/O.');
        },
      });
    const authoritySource =
      createProductionAgentEvaluationCapabilityEffectInputAuthoritySource({
        namespaceId: 'namespace.g4-evaluation-test',
        plan,
        client: authorityClient,
        now: () => STARTED_AT,
      });
    const blockedCapabilityRuntime: AgentEvaluationCapabilityRuntime =
      Object.freeze({
        async executeTool() {
          hostedTransportInvocationCount += 1;
          throw new Error('Expected-blocked Hosted transport was invoked.');
        },
        async assessCapability() {
          throw new Error(
            'Expected-blocked capability assessment was invoked.'
          );
        },
      });
    const controlledRuntime: AgentEvaluationControlledRuntime = Object.freeze({
      async executeTool() {
        throw new Error('Expected-blocked call reached controlled runtime.');
      },
      async continue() {
        throw new Error('Expected-blocked call reached continuation runtime.');
      },
      async assessFinal() {
        throw new Error('Expected-blocked call reached final assessment.');
      },
    });

    await expect(
      runAgentEvaluationAgentTurnLoop({
        namespaceId: 'namespace.g4-evaluation-test',
        shardLeaseOwnerId: 'owner.g4-evaluation-test',
        shardLeaseGeneration: 1,
        verificationGrantGeneration: 1,
        verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
          grantReceipts: ['expected-blocked-test'],
        }),
        plan,
        descriptor,
        material,
        protocolFamily: 'openai-responses',
        contextPackDigest: digestAgentCanonicalValue({
          context: material.caseId,
        }),
        controlledRuntimeConfiguration: runtimeConfiguration(2, 1),
        controlledRuntime,
        capabilityRuntime: blockedCapabilityRuntime,
        prepareCapabilityEffectRequestRefs: authoritySource.prepareRequestRefs,
        resolveCapabilityEffectInputAuthority:
          authoritySource.resolveInputAuthority,
        createInvocation: ({ turnIndex, encodedPayload }) =>
          invocationFor(
            plan,
            descriptor,
            turnIndex,
            encodedPayload.payloadDigest
          ),
        invoke: async (turnInput) => {
          const binding = turnInput.encodedPayload.toolBindings.find(
            ({ toolId }) => toolId === retrievalTool.toolId
          );
          if (!binding) {
            throw new Error('Expected blocked retrieval binding is missing.');
          }
          const events = runtimeEvents(
            'openai-responses',
            turnInput,
            Object.freeze([
              Object.freeze({
                providerToolCallId: 'provider-call.expected-blocked.0',
                providerToolName: binding.providerToolName,
                arguments: exampleToolArguments(retrievalTool.inputSchema),
              }),
            ])
          );
          return Object.freeze({
            events,
            reportedUsage: createAgentUsageVector([]),
            terminalEvent: events.at(-1)!,
            budgetReservationId:
              'budget-reservation.agent-loop.expected-blocked',
            responseDigest: digestAgentCanonicalValue({
              response: turnInput.invocation.requestDigest,
            }),
            runtimeRejected: false,
            artifactBytes: JSON.stringify(events).length,
            status: 'completed' as const,
            startedAt: STARTED_AT,
            completedAt: COMPLETED_AT,
          });
        },
        finalizeProviderCapabilityObservation: async () => undefined,
        requiresControlledPreview: false,
      })
    ).rejects.toThrow(/expected-blocked capability/u);

    expect(requestRefIssueCount).toBe(0);
    expect(currentTurnSealCount).toBe(0);
    expect(inputAuthorityResolveCount).toBe(0);
    expect(hostedTransportInvocationCount).toBe(0);
  }, 30_000);
});
