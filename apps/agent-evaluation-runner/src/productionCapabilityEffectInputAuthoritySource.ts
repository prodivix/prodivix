import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_MAXIMUM_LIFETIME_MS,
  AGENT_EVALUATION_SHARED_EFFECT_BINDING_KIND_BY_TOOL_ID,
  isAgentControlInstant,
  type AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  type Instant,
} from '@prodivix/ai';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  createAgentEvaluationAttemptInvocationId,
  type AgentEvaluationCapabilityEffectInputAuthoritySource,
} from './attemptExecutor';
import {
  createAgentEvaluationCapabilityEffectCurrentTurnEventRequest,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryRequest,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityRequest,
  type AgentEvaluationCapabilityEffectInputAuthorityClient,
} from './capabilityEffectInputAuthorityClient';
import { resolveAgentEvaluationPlanCapabilityDescriptor } from './capabilityRuntime';

type Clock = () => Instant;

const capabilityIdByBindingKind = Object.freeze({
  'hosted-retrieval-query': 'provider.hosted-retrieval',
  'opaque-continuation': 'provider.reasoning-continuation',
  'provider-cache': 'provider.isolated-cache',
  'provider-job': 'provider.background-job',
} as const);

const bindingForTool = (
  toolId: string
): Readonly<{
  bindingKind: AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt['bindingKind'];
  capabilityId: AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt['capabilityId'];
}> => {
  const bindingKind =
    AGENT_EVALUATION_SHARED_EFFECT_BINDING_KIND_BY_TOOL_ID[
      toolId as keyof typeof AGENT_EVALUATION_SHARED_EFFECT_BINDING_KIND_BY_TOOL_ID
    ];
  if (!bindingKind) {
    throw new TypeError(
      'Evaluation capability effect tool has no frozen binding kind.'
    );
  }
  return Object.freeze({
    bindingKind,
    capabilityId: capabilityIdByBindingKind[bindingKind],
  });
};

const targetRefFor = (
  tools: Parameters<
    AgentEvaluationCapabilityEffectInputAuthoritySource['prepareRequestRefs']
  >[0]['material']['invocation']['tools'],
  toolId: string
): string => {
  const tool = tools.find((candidate) => candidate.toolId === toolId);
  const schema = tool?.inputSchema;
  const properties = isPlainObject(schema) ? schema.properties : undefined;
  const targetRefSchema = isPlainObject(properties)
    ? properties.targetRef
    : undefined;
  if (
    !isPlainObject(targetRefSchema) ||
    typeof targetRefSchema.const !== 'string'
  ) {
    throw new TypeError(
      'Evaluation capability effect target reference is unavailable.'
    );
  }
  return targetRefSchema.const;
};

const expiresAtFor = (issuedAt: Instant): Instant =>
  new Date(
    Date.parse(issuedAt) +
      AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_MAXIMUM_LIFETIME_MS
  ).toISOString();

/**
 * Binds the agent loop to the three durable 8790 input-authority routes. The
 * source signs only refs requested by the loop's canonical issuance decision.
 */
export const createProductionAgentEvaluationCapabilityEffectInputAuthoritySource =
  (
    input: Readonly<{
      namespaceId: string;
      plan: Parameters<
        AgentEvaluationCapabilityEffectInputAuthoritySource['prepareRequestRefs']
      >[0]['plan'];
      client: AgentEvaluationCapabilityEffectInputAuthorityClient;
      now: Clock;
    }>
  ): AgentEvaluationCapabilityEffectInputAuthoritySource => {
    const assertPlan = (candidate: typeof input.plan): void => {
      if (
        candidate !== input.plan ||
        candidate.planDigest !== input.plan.planDigest ||
        candidate.repositoryCommit !== input.plan.repositoryCommit
      ) {
        throw new TypeError(
          'Evaluation capability effect input-authority plan drifted.'
        );
      }
    };

    return Object.freeze({
      async prepareRequestRefs(request) {
        assertPlan(request.plan);
        const target = input.plan.capabilityQualificationTargets.find(
          ({ targetId }) => targetId === request.descriptor.targetId
        );
        const optionalAuthority = target?.optionalCapabilitySupportAuthority;
        const runtimeAuthority = optionalAuthority?.runtimeFactSourceAuthority;
        const capabilityDescriptor =
          resolveAgentEvaluationPlanCapabilityDescriptor(
            input.plan,
            request.descriptor
          );
        if (capabilityDescriptor.supportExpectation !== 'required') {
          throw new TypeError(
            'Evaluation expected-blocked capability cannot issue a request-ref.'
          );
        }
        if (
          !target ||
          !optionalAuthority ||
          !runtimeAuthority ||
          target.protocolFamily !== request.protocolFamily ||
          optionalAuthority.capabilityId !==
            capabilityDescriptor.capabilityId ||
          runtimeAuthority.capabilityId !== capabilityDescriptor.capabilityId ||
          runtimeAuthority.protocolFamily !== request.protocolFamily ||
          runtimeAuthority.providerConfigurationId !==
            target.providerConfigurationId ||
          runtimeAuthority.modelLineageDigest !== target.modelLineageDigest ||
          request.capabilityToolIds.length < 1 ||
          request.capabilityToolIds.length > 4 ||
          new Set(request.capabilityToolIds).size !==
            request.capabilityToolIds.length
        ) {
          throw new TypeError(
            'Evaluation capability effect request-ref scope is invalid.'
          );
        }
        const issuedAt = input.now();
        if (!isAgentControlInstant(issuedAt)) {
          throw new TypeError(
            'Evaluation capability effect request-ref clock is invalid.'
          );
        }
        const invocationId = createAgentEvaluationAttemptInvocationId(
          request.descriptor,
          request.turnIndex
        );
        return Object.freeze(
          await Promise.all(
            request.capabilityToolIds.map(async (toolId) => {
              const binding = bindingForTool(toolId);
              if (
                binding.capabilityId !== capabilityDescriptor.capabilityId ||
                !capabilityDescriptor.expectedToolIds.includes(toolId)
              ) {
                throw new TypeError(
                  'Evaluation capability effect request-ref tool drifted.'
                );
              }
              return input.client.issueRequestRef(
                createAgentEvaluationCapabilityEffectRequestRefAuthorityRequest(
                  {
                    namespaceId: input.namespaceId,
                    planDigest: input.plan.planDigest,
                    repositoryCommit: input.plan.repositoryCommit,
                    attemptId: request.descriptor.attemptId,
                    descriptorDigest: request.descriptor.descriptorDigest,
                    descriptor: request.descriptor,
                    turnIndex: request.turnIndex,
                    invocationId,
                    bindingKind: binding.bindingKind,
                    capabilityId: binding.capabilityId,
                    toolId,
                    targetRef: targetRefFor(
                      request.material.invocation.tools,
                      toolId
                    ),
                    protocolFamily: request.protocolFamily,
                    providerConfigurationId: target.providerConfigurationId,
                    modelLineageDigest: target.modelLineageDigest,
                    adapterDigest: runtimeAuthority.adapterDigest,
                    runtimeFactSourceAuthorityDigest:
                      runtimeAuthority.authorityDigest,
                    registrationReceiptDigest:
                      runtimeAuthority.registrationReceiptDigest,
                    issuedAt,
                    expiresAt: expiresAtFor(issuedAt),
                  }
                )
              );
            })
          )
        );
      },

      async resolveInputAuthority(request) {
        assertPlan(request.plan);
        const capabilityDescriptor =
          resolveAgentEvaluationPlanCapabilityDescriptor(
            input.plan,
            request.descriptor
          );
        if (capabilityDescriptor.supportExpectation !== 'required') {
          throw new TypeError(
            'Evaluation expected-blocked capability cannot resolve effect input authority.'
          );
        }
        if (
          request.invocation.invocationId !==
            createAgentEvaluationAttemptInvocationId(
              request.descriptor,
              request.turnIndex
            ) ||
          request.requestRefAuthority.turnIndex !== request.turnIndex ||
          request.requestRefAuthority.invocationId !==
            request.invocation.invocationId ||
          request.requestRefAuthority.toolId !== request.call.toolId ||
          request.requestRefAuthority.requestRef !==
            request.call.arguments.requestRef ||
          request.requestRefAuthority.targetRef !==
            request.call.arguments.targetRef
        ) {
          throw new TypeError(
            'Evaluation capability effect input-authority request drifted.'
          );
        }
        if (
          request.requestRefAuthority.bindingKind === 'hosted-retrieval-query'
        ) {
          await input.client.sealCurrentTurnEvent(
            createAgentEvaluationCapabilityEffectCurrentTurnEventRequest({
              namespaceId: input.namespaceId,
              planDigest: input.plan.planDigest,
              repositoryCommit: input.plan.repositoryCommit,
              attemptId: request.descriptor.attemptId,
              descriptorDigest: request.descriptor.descriptorDigest,
              turnIndex: request.turnIndex,
              invocationId: request.invocation.invocationId,
              requestRefAuthorityReceiptDigest:
                request.requestRefAuthority.receiptDigest,
              requestRef: request.requestRefAuthority.requestRef,
              targetRef: request.requestRefAuthority.targetRef,
              providerToolCallId: request.call.providerToolCallId,
              toolId: 'provider.retrieval.search',
              argumentsDigest: request.call.argumentsDigest,
              selectedEventDigest: request.call.event.durableEvent.eventDigest,
              normalizedEvents: request.runtime.events,
              recordedAt: request.runtime.completedAt,
            })
          );
        }
        return input.client.resolveInputAuthority(
          createAgentEvaluationCapabilityEffectInputAuthorityRegistryRequest({
            namespaceId: input.namespaceId,
            planDigest: input.plan.planDigest,
            repositoryCommit: input.plan.repositoryCommit,
            requestRefAuthorityReceiptDigest:
              request.requestRefAuthority.receiptDigest,
            requestRef: request.requestRefAuthority.requestRef,
            targetRef: request.requestRefAuthority.targetRef,
            requestedAt: request.runtime.completedAt,
          })
        );
      },
    });
  };
