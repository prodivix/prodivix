import {
  createAgentNativeProviderRuntimeFactEnvelope,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  createAgentEvaluationRuntimeFactSourceAuthority,
  createAgentProviderCacheReceipt,
  createAgentProviderRuntimeEvent,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentNativeProviderRuntimeResponse,
  type AgentNativeProviderRuntimeFact,
  type AgentProviderAdapterInvocationRequest,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  collectAgentEvaluationRuntimeFacts,
  selectAgentEvaluationAttemptProviderCapabilityObservationFacts,
} from './attemptExecutor';

const observedAt = '2026-08-09T00:00:00.000Z';
const invocation: AgentProviderAdapterInvocationRequest = Object.freeze({
  invocationId: 'evaluation-invocation.runtime-optional.1',
  requestDigest: digestAgentCanonicalValue({ request: 'runtime-optional' }),
  providerConfigurationId: 'provider.runtime-optional.1',
  modelLineageDigest: digestAgentCanonicalValue({ model: 'runtime-optional' }),
  capabilityProfileDigest: digestAgentCanonicalValue({
    profile: 'runtime-optional',
  }),
  inferenceConfigurationDigest: digestAgentCanonicalValue({
    inference: 'runtime-optional',
  }),
  contextPackDigest: digestAgentCanonicalValue({ context: 'runtime-optional' }),
});

const terminal = createAgentProviderRuntimeEvent({
  eventId: 'event.runtime-optional.completed',
  invocationId: invocation.invocationId,
  sequence: 0,
  type: 'completed',
  payload: Object.freeze({ status: 'completed' }),
  occurredAt: observedAt,
});
const usage = createAgentUsageVector([]);
const cache = createAgentProviderCacheReceipt({
  receipt: {
    cacheMode: 'prompt',
    cacheScope: 'task',
    prefixOrItemDigests: Object.freeze([
      digestAgentCanonicalValue({ prefix: 'runtime-optional' }),
    ]),
    usageRef: 'usage.runtime-optional.1',
  },
  isolation: 'task',
});

const facts = Object.freeze([
  Object.freeze({ factType: 'provider-event' as const, value: terminal }),
  Object.freeze({ factType: 'provider-cache-receipt' as const, value: cache }),
  Object.freeze({ factType: 'usage-vector' as const, value: usage }),
]);

describe('attempt runtime capability observation ingress', () => {
  it('retains an exact normalized optional fact in the response commitment before shared-durable admission', async () => {
    const runtime = await collectAgentEvaluationRuntimeFacts(
      facts,
      invocation,
      Object.freeze([]),
      () => observedAt
    );

    expect(runtime.runtimeRejected).toBe(false);
    expect(runtime.runtimeFacts).toEqual(facts);
    expect(runtime.responseDigest).toBe(
      digestAgentNativeProviderRuntimeResponse(invocation.requestDigest, facts)
    );
    expect(runtime.responseDigest).not.toBe(
      digestAgentNativeProviderRuntimeResponse(
        invocation.requestDigest,
        Object.freeze([facts[0]!, facts[2]!])
      )
    );
  });

  it('fails closed on duplicate or post-usage optional facts', async () => {
    const malformedSets: readonly (readonly AgentNativeProviderRuntimeFact[])[] =
      Object.freeze([
        Object.freeze([facts[0]!, facts[1]!, facts[1]!, facts[2]!]),
        Object.freeze([facts[0]!, facts[2]!, facts[1]!]),
      ]);

    for (const malformed of malformedSets) {
      const runtime = await collectAgentEvaluationRuntimeFacts(
        malformed,
        invocation,
        Object.freeze([]),
        () => observedAt
      );
      expect(runtime.runtimeRejected).toBe(true);
      expect(runtime.runtimeFacts.map(({ factType }) => factType)).toEqual([
        'provider-event',
        'usage-vector',
      ]);
    }
  });

  it('rejects optional provider facts on the generic compatible protocol', () => {
    expect(() =>
      createAgentNativeProviderRuntimeFactEnvelope(
        {
          protocolFamily: 'openai-compatible',
          invocationId: invocation.invocationId,
          requestDigest: invocation.requestDigest,
          providerConfigurationId: invocation.providerConfigurationId,
          modelLineageDigest: invocation.modelLineageDigest,
          fact: facts[1]!,
        },
        {
          protectedMaterialCanaries: Object.freeze([]),
          secretCanaries: Object.freeze([]),
        }
      )
    ).toThrow(/invalid/u);
  });

  it('retains terminal and usage authority when a required optional fact is unavailable', () => {
    const sourceAuthority = Object.freeze({
      sourceAuthorityKind: 'native-provider-transport' as const,
      sourceAuthorityId: invocation.providerConfigurationId,
      sourceAuthorityImplementationDigest: digestAgentCanonicalValue({
        adapter: 'runtime-optional',
      }),
    });
    const dispatchIntentDigest = digestAgentCanonicalValue({
      dispatch: 'runtime-optional',
    });
    const transportReceiptDigest = digestAgentCanonicalValue({
      transport: 'runtime-optional',
    });
    const binding = Object.freeze({
      ...sourceAuthority,
      stageDigest: dispatchIntentDigest,
      dispatchAckDigest: transportReceiptDigest,
      planDigest: digestAgentCanonicalValue({ plan: 'runtime-optional' }),
      repositoryCommit: 'a'.repeat(40),
      attemptId: 'attempt.runtime-optional.1',
      descriptorDigest: digestAgentCanonicalValue({
        descriptor: 'runtime-optional',
      }),
      turnIndex: 0,
      invocationId: invocation.invocationId,
      requestDigest: invocation.requestDigest,
      responseDigest: digestAgentNativeProviderRuntimeResponse(
        invocation.requestDigest,
        facts
      ),
      protocolFamily: 'openai-responses' as const,
      providerConfigurationId: invocation.providerConfigurationId,
      modelLineageDigest: invocation.modelLineageDigest,
      adapterDigest: sourceAuthority.sourceAuthorityImplementationDigest,
      dispatchIntentDigest,
      transportReceiptDigest,
      resultSpoolReceiptDigest: digestAgentCanonicalValue({
        spool: 'runtime-optional',
      }),
      normalizedEventSetDigest: digestAgentCanonicalValue({
        normalized: 'runtime-optional',
      }),
      observedAt,
    });
    const sanitization = Object.freeze({
      protectedMaterialCanaries: Object.freeze([
        'protected-runtime-optional-canary',
      ]),
      secretCanaries: Object.freeze(['secret-runtime-optional-canary']),
    });
    const envelopes = Object.freeze([
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        {
          ...binding,
          fact: Object.freeze({
            factKind: 'provider-event',
            factDigest: terminal.durableEvent.eventDigest,
            value: terminal.durableEvent,
          }),
        },
        sanitization
      ),
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        {
          ...binding,
          fact: Object.freeze({
            factKind: 'usage-vector',
            factDigest: usage.vectorDigest,
            value: usage,
          }),
        },
        sanitization
      ),
    ]);

    const selection =
      selectAgentEvaluationAttemptProviderCapabilityObservationFacts({
        envelopes,
        expectedOptionalFactKind: 'provider-job-receipt',
        optionalCapabilityRequired: true,
        admittedSourceAuthorities: Object.freeze([sourceAuthority]),
        sanitization,
      });

    expect(selection.facts.map(({ factKind }) => factKind)).toEqual([
      'provider-event',
      'usage-vector',
    ]);
    expect(selection.factAuthorities).toHaveLength(2);
  });

  it('joins a shared cache fact with native usage while preserving source-local fences', () => {
    const adapterDigest = digestAgentCanonicalValue({
      adapter: 'runtime-optional',
    });
    const planDigest = digestAgentCanonicalValue({ plan: 'runtime-optional' });
    const descriptorDigest = digestAgentCanonicalValue({
      descriptor: 'runtime-optional',
    });
    const dispatchIntentDigest = digestAgentCanonicalValue({
      dispatch: 'runtime-optional',
    });
    const transportReceiptDigest = digestAgentCanonicalValue({
      transport: 'runtime-optional',
    });
    const responseDigest = digestAgentNativeProviderRuntimeResponse(
      invocation.requestDigest,
      facts
    );
    const common = Object.freeze({
      planDigest,
      repositoryCommit: 'a'.repeat(40),
      attemptId: 'attempt.runtime-optional.1',
      descriptorDigest,
      turnIndex: 0,
      invocationId: invocation.invocationId,
      requestDigest: invocation.requestDigest,
      responseDigest,
      protocolFamily: 'openai-responses' as const,
      providerConfigurationId: invocation.providerConfigurationId,
      modelLineageDigest: invocation.modelLineageDigest,
      adapterDigest,
      dispatchIntentDigest,
      observedAt,
    });
    const sanitization = Object.freeze({
      protectedMaterialCanaries: Object.freeze([
        'protected-runtime-optional-canary',
      ]),
      secretCanaries: Object.freeze(['secret-runtime-optional-canary']),
    });
    const nativeAuthority = Object.freeze({
      sourceAuthorityKind: 'native-provider-transport' as const,
      sourceAuthorityId: invocation.providerConfigurationId,
      sourceAuthorityImplementationDigest: adapterDigest,
    });
    const runtimeFactSourceAuthority =
      createAgentEvaluationRuntimeFactSourceAuthority({
        kind: 'shared-durable-capability',
        sourceKind: 'sealed-provider-response-metadata',
        sourceAuthorityId: 'runtime-source.cache.test',
        sourceAuthorityImplementationDigest: digestAgentCanonicalValue({
          implementation: 'runtime-source.cache.test',
        }),
        routeBinding: 'provider-runtime-metadata.cache.test',
        capabilityProfileId: 'g4-provider-isolated-cache',
        capabilityProfileDigest: digestAgentCanonicalValue({
          profileId: 'g4-provider-isolated-cache',
        }),
        capabilityId: 'provider.isolated-cache',
        protocolFamily: 'openai-responses',
        providerConfigurationId: invocation.providerConfigurationId,
        modelId: 'model.runtime-optional.1',
        modelLineageDigest: invocation.modelLineageDigest,
        adapterDigest,
        registrationAuthorityIssuerId: 'authority.backend-8790.test',
        registrationReceiptDigest: digestAgentCanonicalValue({
          registration: 'runtime-source.cache.test',
        }),
      });
    const usageEnvelope =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        {
          ...common,
          ...nativeAuthority,
          stageDigest: dispatchIntentDigest,
          dispatchAckDigest: transportReceiptDigest,
          transportReceiptDigest,
          resultSpoolReceiptDigest: digestAgentCanonicalValue({
            spool: 'native-runtime-optional',
          }),
          normalizedEventSetDigest: digestAgentCanonicalValue({
            normalized: 'native-runtime-optional',
          }),
          fact: Object.freeze({
            factKind: 'usage-vector',
            factDigest: usage.vectorDigest,
            value: usage,
          }),
        },
        sanitization
      );
    const cacheEnvelope =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        {
          ...common,
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
            stage: 'shared-runtime-optional',
          }),
          dispatchAckDigest: digestAgentCanonicalValue({
            ack: 'shared-runtime-optional',
          }),
          transportReceiptDigest: digestAgentCanonicalValue({
            transport: 'shared-runtime-optional',
          }),
          resultSpoolReceiptDigest: digestAgentCanonicalValue({
            spool: 'shared-runtime-optional',
          }),
          normalizedEventSetDigest: digestAgentCanonicalValue({
            normalized: 'shared-runtime-optional',
          }),
          fact: Object.freeze({
            factKind: 'provider-cache-receipt',
            factDigest: cache.receiptDigest,
            value: cache,
          }),
        },
        sanitization
      );

    const selection =
      selectAgentEvaluationAttemptProviderCapabilityObservationFacts({
        envelopes: Object.freeze([cacheEnvelope, usageEnvelope]),
        expectedOptionalFactKind: 'provider-cache-receipt',
        optionalCapabilityRequired: true,
        admittedSourceAuthorities: Object.freeze([
          nativeAuthority,
          Object.freeze({
            sourceAuthorityKind: 'shared-durable-capability' as const,
            runtimeFactSourceAuthority,
          }),
        ]),
        sanitization,
      });

    expect(selection.facts.map(({ factKind }) => factKind)).toEqual([
      'provider-cache-receipt',
      'usage-vector',
    ]);
    expect(
      selection.factAuthorities.map(
        ({ sourceAuthorityKind }) => sourceAuthorityKind
      )
    ).toEqual(['shared-durable-capability', 'native-provider-transport']);
    expect(selection.factAuthorities[0]).toMatchObject({
      stageDigest: cacheEnvelope.stageDigest,
      dispatchAckDigest: cacheEnvelope.dispatchAckDigest,
      transportReceiptDigest: cacheEnvelope.transportReceiptDigest,
      resultSpoolReceiptDigest: cacheEnvelope.resultSpoolReceiptDigest,
      normalizedEventSetDigest: cacheEnvelope.normalizedEventSetDigest,
    });
  });
});
