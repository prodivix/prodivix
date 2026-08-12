import {
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentProviderRuntimeEvent,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
} from '@prodivix/ai';
import { isPlainObject } from '@prodivix/shared/safety';
import { describe, expect, it, vi } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import { createAgentEvaluationAttemptInvocationId } from './attemptExecutor';
import type { AgentEvaluationCapabilityEffectInputAuthorityClient } from './capabilityEffectInputAuthorityClient';
import { createProductionAgentEvaluationCapabilityEffectInputAuthoritySource } from './productionCapabilityEffectInputAuthoritySource';

const ISSUED_AT = '2026-08-09T04:00:00.000Z';

const fixture = () => {
  const plan = createV8EvaluationPlan();
  const materials = getG4V8PublicEvaluationCaseMaterials();
  const concreteCase = plan.concreteCases.find(
    ({ caseId, capabilityDescriptor }) =>
      capabilityDescriptor.expectedToolIds.includes(
        'provider.background-job.poll'
      ) && materials.some((candidate) => candidate.caseId === caseId)
  );
  const descriptor = planAgentModelEvaluationAttempts(plan).find(
    (candidate) =>
      candidate.caseId === concreteCase?.caseId &&
      plan.capabilityQualificationTargets.some(
        (target) =>
          target.targetId === candidate.targetId &&
          target.protocolFamily === 'openai-responses' &&
          target.optionalCapabilitySupportAuthority?.capabilityId ===
            'provider.background-job' &&
          target.optionalCapabilitySupportAuthority.supportExpectation ===
            'required'
      )
  );
  const target = plan.capabilityQualificationTargets.find(
    (candidate) => candidate.targetId === descriptor?.targetId
  );
  const material = materials.find(
    (candidate) => candidate.caseId === descriptor?.caseId
  );
  const tool = material?.invocation.tools.find(
    ({ toolId }) => toolId === 'provider.background-job.poll'
  );
  if (!target || !descriptor || !material || !tool) {
    throw new Error(
      `Expected background-job source fixture is unavailable: case=${Boolean(concreteCase)} descriptor=${Boolean(descriptor)} target=${Boolean(target)} material=${Boolean(material)} tool=${Boolean(tool)}.`
    );
  }
  return Object.freeze({ plan, target, descriptor, material, tool });
};

const retrievalFixture = () => {
  const plan = createV8EvaluationPlan();
  const materials = getG4V8PublicEvaluationCaseMaterials();
  const concreteCase = plan.concreteCases.find(({ capabilityDescriptor }) =>
    capabilityDescriptor.expectedToolIds.includes('provider.retrieval.search')
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
            'required'
      )
  );
  const target = plan.capabilityQualificationTargets.find(
    (candidate) => candidate.targetId === descriptor?.targetId
  );
  const material = materials.find(
    (candidate) => candidate.caseId === descriptor?.caseId
  );
  const tool = material?.invocation.tools.find(
    ({ toolId }) => toolId === 'provider.retrieval.search'
  );
  if (!target || !descriptor || !material || !tool) {
    throw new Error(
      `Expected retrieval source fixture is unavailable: case=${Boolean(concreteCase)} descriptor=${Boolean(descriptor)} target=${Boolean(target)} material=${Boolean(material)} tool=${Boolean(tool)}.`
    );
  }
  return Object.freeze({ plan, target, descriptor, material, tool });
};

describe('production capability-effect input-authority source', () => {
  it('issues one exact prior-source ref through the durable registry client', async () => {
    const { plan, target, descriptor, material, tool } = fixture();
    const issueRequestRef = vi.fn(
      async (
        request: Parameters<
          AgentEvaluationCapabilityEffectInputAuthorityClient['issueRequestRef']
        >[0]
      ) =>
        createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
          namespaceId: request.namespaceId,
          planDigest: request.planDigest,
          repositoryCommit: request.repositoryCommit,
          attemptId: request.attemptId,
          descriptorDigest: request.descriptorDigest,
          turnIndex: request.turnIndex,
          invocationId: request.invocationId,
          bindingKind: request.bindingKind,
          capabilityId: request.capabilityId,
          toolId: request.toolId,
          targetRef: request.targetRef,
          protocolFamily: request.protocolFamily,
          providerConfigurationId: request.providerConfigurationId,
          modelLineageDigest: request.modelLineageDigest,
          adapterDigest: request.adapterDigest,
          runtimeFactSourceAuthorityDigest:
            request.runtimeFactSourceAuthorityDigest,
          registrationReceiptDigest: request.registrationReceiptDigest,
          issuedAt: request.issuedAt,
          expiresAt: request.expiresAt,
        })
    );
    const client: AgentEvaluationCapabilityEffectInputAuthorityClient =
      Object.freeze({
        issueRequestRef,
        async sealCurrentTurnEvent() {
          throw new Error('Current-turn retrieval was not expected.');
        },
        async resolveInputAuthority() {
          throw new Error('Registry resolution was not expected.');
        },
      });
    const source =
      createProductionAgentEvaluationCapabilityEffectInputAuthoritySource({
        namespaceId: 'namespace.g4-evaluation-test',
        plan,
        client,
        now: () => ISSUED_AT,
      });

    const receipts = await source.prepareRequestRefs({
      plan,
      descriptor,
      material,
      turnIndex: 1,
      protocolFamily: 'openai-responses',
      capabilityToolIds: Object.freeze([tool.toolId]),
    });

    expect(receipts).toHaveLength(1);
    expect(issueRequestRef).toHaveBeenCalledTimes(1);
    expect(issueRequestRef.mock.calls[0]?.[0]).toMatchObject({
      namespaceId: 'namespace.g4-evaluation-test',
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: 1,
      invocationId: createAgentEvaluationAttemptInvocationId(descriptor, 1),
      bindingKind: 'provider-job',
      capabilityId: 'provider.background-job',
      toolId: 'provider.background-job.poll',
      protocolFamily: 'openai-responses',
      providerConfigurationId: target.providerConfigurationId,
      modelLineageDigest: target.modelLineageDigest,
      issuedAt: ISSUED_AT,
      expiresAt: '2026-08-09T04:02:05.000Z',
    });
  }, 20_000);

  it('rejects a shared tool outside the selected capability before I/O', async () => {
    const { plan, descriptor, material } = fixture();
    const issueRequestRef = vi.fn();
    const source =
      createProductionAgentEvaluationCapabilityEffectInputAuthoritySource({
        namespaceId: 'namespace.g4-evaluation-test',
        plan,
        client: Object.freeze({
          issueRequestRef,
          async sealCurrentTurnEvent() {
            throw new Error('Unexpected current-turn event seal.');
          },
          async resolveInputAuthority() {
            throw new Error('Unexpected registry resolution.');
          },
        }) as AgentEvaluationCapabilityEffectInputAuthorityClient,
        now: () => ISSUED_AT,
      });

    await expect(
      source.prepareRequestRefs({
        plan,
        descriptor,
        material,
        turnIndex: 1,
        protocolFamily: 'openai-responses',
        capabilityToolIds: Object.freeze(['provider.retrieval.search']),
      })
    ).rejects.toThrow(/request-ref tool drifted/u);
    expect(issueRequestRef).not.toHaveBeenCalled();
  });

  it('seals the exact current-turn retrieval event before resolving its registry authority', async () => {
    const { plan, target, descriptor, material, tool } = retrievalFixture();
    const runtimeAuthority =
      target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
    const properties = isPlainObject(tool.inputSchema)
      ? tool.inputSchema.properties
      : undefined;
    const targetRefSchema = isPlainObject(properties)
      ? properties.targetRef
      : undefined;
    const targetRef =
      isPlainObject(targetRefSchema) &&
      typeof targetRefSchema.const === 'string'
        ? targetRefSchema.const
        : undefined;
    if (!runtimeAuthority || !targetRef) {
      throw new Error('Expected retrieval runtime authority is unavailable.');
    }
    const invocationId = createAgentEvaluationAttemptInvocationId(
      descriptor,
      0
    );
    const requestRefAuthority =
      createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
        namespaceId: 'namespace.g4-evaluation-test',
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex: 0,
        invocationId,
        bindingKind: 'hosted-retrieval-query',
        capabilityId: 'provider.hosted-retrieval',
        toolId: tool.toolId,
        targetRef,
        protocolFamily: 'openai-responses',
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        adapterDigest: runtimeAuthority.adapterDigest,
        runtimeFactSourceAuthorityDigest: runtimeAuthority.authorityDigest,
        registrationReceiptDigest: runtimeAuthority.registrationReceiptDigest,
        issuedAt: ISSUED_AT,
        expiresAt: '2026-08-09T04:02:05.000Z',
      });
    const argumentsValue = Object.freeze({
      requestRef: requestRefAuthority.requestRef,
      targetRef,
    });
    const argumentsDigest = digestAgentCanonicalValue(argumentsValue);
    const event = createAgentProviderRuntimeEvent({
      eventId: 'event.retrieval.0',
      invocationId,
      sequence: 0,
      type: 'tool-call',
      payload: Object.freeze({
        itemId: 'provider-call.retrieval.0',
        name: 'provider.retrieval.search',
        arguments: argumentsValue,
        argumentsDigest,
      }),
      occurredAt: ISSUED_AT,
    });
    const registryReceipt = Object.freeze({
      testOnly: 'registry-receipt',
    }) as unknown as AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt;
    const sealCurrentTurnEvent = vi.fn<
      AgentEvaluationCapabilityEffectInputAuthorityClient['sealCurrentTurnEvent']
    >(async (_request) => Object.freeze({}) as never);
    const resolveInputAuthority = vi.fn<
      AgentEvaluationCapabilityEffectInputAuthorityClient['resolveInputAuthority']
    >(async (_request) => registryReceipt);
    const source =
      createProductionAgentEvaluationCapabilityEffectInputAuthoritySource({
        namespaceId: 'namespace.g4-evaluation-test',
        plan,
        client: Object.freeze({
          async issueRequestRef() {
            throw new Error('Unexpected request-ref issue.');
          },
          sealCurrentTurnEvent,
          resolveInputAuthority,
        }),
        now: () => ISSUED_AT,
      });
    const requestDigest = digestAgentCanonicalValue({ request: invocationId });
    const responseDigest = digestAgentCanonicalValue({
      response: invocationId,
    });
    const result = await source.resolveInputAuthority({
      plan,
      descriptor,
      material,
      turnIndex: 0,
      invocation: Object.freeze({
        invocationId,
        requestDigest,
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        capabilityProfileDigest: target.capabilityProfileDigest,
        inferenceConfigurationDigest: target.inferenceConfigurationDigest,
        contextPackDigest: digestAgentCanonicalValue({
          context: descriptor.caseId,
        }),
      }),
      runtime: Object.freeze({
        events: Object.freeze([event]),
        reportedUsage: createAgentUsageVector([]),
        terminalEvent: event,
        runtimeRejected: false,
        artifactBytes: 1,
        budgetReservationId: 'budget-reservation.input-authority-source.test',
        responseDigest,
        status: 'completed',
        startedAt: ISSUED_AT,
        completedAt: '2026-08-09T04:00:00.001Z',
      }),
      call: Object.freeze({
        event,
        providerToolCallId: 'provider-call.retrieval.0',
        providerToolName: 'provider.retrieval.search',
        toolId: tool.toolId,
        toolCallId: 'evaluation-tool-call:retrieval.0',
        arguments: argumentsValue,
        argumentsDigest,
      }),
      requestRefAuthority,
    });

    expect(result).toBe(registryReceipt);
    expect(sealCurrentTurnEvent).toHaveBeenCalledTimes(1);
    expect(sealCurrentTurnEvent.mock.calls[0]?.[0]).toMatchObject({
      namespaceId: 'namespace.g4-evaluation-test',
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: 0,
      invocationId,
      requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
      requestRef: requestRefAuthority.requestRef,
      targetRef,
      providerToolCallId: 'provider-call.retrieval.0',
      toolId: 'provider.retrieval.search',
      argumentsDigest,
      selectedEventDigest: event.durableEvent.eventDigest,
      normalizedEvents: [event],
      recordedAt: '2026-08-09T04:00:00.001Z',
    });
    expect(resolveInputAuthority).toHaveBeenCalledTimes(1);
    expect(resolveInputAuthority.mock.calls[0]?.[0]).toMatchObject({
      namespaceId: 'namespace.g4-evaluation-test',
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
      requestRef: requestRefAuthority.requestRef,
      targetRef,
      requestedAt: '2026-08-09T04:00:00.001Z',
    });
    expect(sealCurrentTurnEvent.mock.invocationCallOrder[0]).toBeLessThan(
      resolveInputAuthority.mock.invocationCallOrder[0]!
    );
  }, 20_000);
});
