import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentOpaqueContinuation,
  createAgentProviderCacheReceipt,
} from './agentInvocationFacts';
import { createAgentProviderAdapterIdentity } from './agentProviderIdentity';
import {
  createAgentNativeProviderRuntimeFactEnvelope,
  createOpenAIResponsesAgentProviderAdapter,
  normalizeNativeAgentProviderRuntimeEvents,
  selectAgentNativeProviderCapabilityObservationFacts,
  type AgentNativeProviderRuntimeFact,
} from './agentNativeProviderAdapters';

const instant = '2026-08-09T00:00:00.000Z';
const digest = (value: unknown) => digestAgentCanonicalValue(value);
const request = Object.freeze({
  invocationId: 'invocation.native-observation.1',
  requestDigest: digest('native-observation-request'),
  providerConfigurationId: 'provider.native-observation.1',
  modelLineageDigest: digest('native-observation-model'),
  capabilityProfileDigest: digest('native-observation-profile'),
  inferenceConfigurationDigest: digest('native-observation-inference'),
  contextPackDigest: digest('native-observation-context'),
});
const sanitization = Object.freeze({
  protectedMaterialCanaries: Object.freeze(['protected-canary-native']),
  secretCanaries: Object.freeze(['secret-canary-native']),
});

const terminalAndUsage = (): readonly AgentNativeProviderRuntimeFact[] =>
  normalizeNativeAgentProviderRuntimeEvents(
    'openai-responses',
    [
      {
        type: 'response.completed',
        response: {
          id: 'response_native_observation',
          status: 'completed',
          usage: { input_tokens: 2, output_tokens: 1 },
        },
      },
    ],
    { invocationId: request.invocationId, occurredAt: instant }
  );

const cacheFact = Object.freeze({
  factType: 'provider-cache-receipt' as const,
  value: createAgentProviderCacheReceipt({
    receipt: {
      cacheMode: 'prompt',
      cacheScope: 'task',
      prefixOrItemDigests: Object.freeze([digest('native-cache-prefix')]),
      usageRef: 'usage.native-observation.1',
    },
    isolation: 'task',
  }),
});

const continuationFact = Object.freeze({
  factType: 'opaque-continuation' as const,
  value: createAgentOpaqueContinuation({
    continuationId: 'continuation.native-observation.1',
    encryptedBlobRef: 'encrypted-artifact:native-observation.1',
    providerConfigurationId: request.providerConfigurationId,
    modelLineageDigest: request.modelLineageDigest,
    taskId: 'task.native-observation.1',
    runId: 'run.native-observation.1',
    generation: 1,
    parentInvocationId: request.invocationId,
    purpose: 'provider-tool-loop-continuation',
    createdAt: instant,
    expiresAt: '2026-08-09T00:10:00.000Z',
  }),
});

const jobBase = Object.freeze({
  providerJobId: 'job.native-observation.1',
  taskId: 'task.native-observation.1',
  runId: 'run.native-observation.1',
  generation: 1,
  invocationId: request.invocationId,
  phase: 'terminal' as const,
  outcome: 'completed' as const,
  callbackAuthority: 'revoked' as const,
});
const jobFact = Object.freeze({
  factType: 'provider-job-receipt' as const,
  value: Object.freeze({ ...jobBase, receiptDigest: digest(jobBase) }),
});

const envelope = (fact: AgentNativeProviderRuntimeFact) =>
  createAgentNativeProviderRuntimeFactEnvelope(
    {
      protocolFamily: 'openai-responses',
      invocationId: request.invocationId,
      requestDigest: request.requestDigest,
      providerConfigurationId: request.providerConfigurationId,
      modelLineageDigest: request.modelLineageDigest,
      fact,
    },
    sanitization
  );

describe('native provider optional capability observation conformance', () => {
  it('carries exact provider-owned facts through the sealed runtime envelope', async () => {
    const facts = Object.freeze([
      ...terminalAndUsage().slice(0, -1),
      continuationFact,
      terminalAndUsage().at(-1)!,
    ]);
    const adapter = createOpenAIResponsesAgentProviderAdapter({
      identity: createAgentProviderAdapterIdentity({
        adapterId: 'adapter.native-observation.1',
        adapterVersion: '1.0.0',
        protocolFamily: 'openai-responses',
        transportSchemaDigest: digest('native-observation-transport'),
        eventNormalizationDigest: digest('native-observation-normalization'),
      }),
      declaredProfileDigests: Object.freeze([request.capabilityProfileDigest]),
      supportedProfileDigests: Object.freeze([request.capabilityProfileDigest]),
      transport: Object.freeze({
        async *stream() {
          for (const fact of facts) yield envelope(fact);
        },
      }),
      now: () => instant,
    });

    const observed = [];
    for await (const fact of adapter.invokeRuntime(request))
      observed.push(fact);
    expect(observed).toEqual(facts);
  });

  it('rejects every invalid, mixed, or duplicate tail after normalized facts', async () => {
    const normalized = terminalAndUsage();
    const consume = async (events: readonly unknown[]) => {
      const adapter = createOpenAIResponsesAgentProviderAdapter({
        identity: createAgentProviderAdapterIdentity({
          adapterId: 'adapter.native-observation.tail',
          adapterVersion: '1.0.0',
          protocolFamily: 'openai-responses',
          transportSchemaDigest: digest('native-observation-tail-transport'),
          eventNormalizationDigest: digest(
            'native-observation-tail-normalization'
          ),
        }),
        declaredProfileDigests: Object.freeze([
          request.capabilityProfileDigest,
        ]),
        supportedProfileDigests: Object.freeze([
          request.capabilityProfileDigest,
        ]),
        transport: Object.freeze({
          async *stream() {
            for (const event of events) yield event;
          },
        }),
        now: () => instant,
      });
      for await (const _fact of adapter.invokeRuntime(request)) void _fact;
    };
    const normalizedEnvelopes = normalized.map(envelope);
    const validCacheEnvelope = envelope(cacheFact);
    const invalidTail = Object.freeze({
      ...validCacheEnvelope,
      envelopeDigest: digest('tampered-native-observation-envelope'),
    });

    await expect(
      consume([
        ...normalizedEnvelopes,
        { type: 'response.completed', response: { id: 'mixed-tail' } },
      ])
    ).rejects.toThrow(/mixed normalized and native events/u);
    await expect(
      consume([...normalizedEnvelopes, invalidTail])
    ).rejects.toThrow(/runtime envelope is invalid/u);
    await expect(
      consume([
        normalizedEnvelopes[0]!,
        validCacheEnvelope,
        validCacheEnvelope,
        normalizedEnvelopes[1]!,
      ])
    ).rejects.toThrow(/optional capability fact set drifted/u);
  });

  it('selects only real optional facts and preserves cache usage evidence', () => {
    const base = terminalAndUsage();
    expect(
      selectAgentNativeProviderCapabilityObservationFacts({
        facts: Object.freeze([...base.slice(0, -1), cacheFact, base.at(-1)!]),
        expectedOptionalFactType: 'provider-cache-receipt',
      }).map(({ factType }) => factType)
    ).toEqual(['provider-cache-receipt', 'usage-vector']);
    expect(
      selectAgentNativeProviderCapabilityObservationFacts({
        facts: Object.freeze([...base.slice(0, -1), jobFact, base.at(-1)!]),
        expectedOptionalFactType: 'provider-job-receipt',
      }).map(({ factType }) => factType)
    ).toEqual(['provider-event', 'provider-job-receipt']);
    expect(
      selectAgentNativeProviderCapabilityObservationFacts({
        facts: base,
        expectedOptionalFactType: 'opaque-continuation',
      }).map(({ factType }) => factType)
    ).toEqual(['provider-event', 'usage-vector']);
  });

  it('rejects cross-provider continuations and callback-local canaries', () => {
    expect(() =>
      createAgentNativeProviderRuntimeFactEnvelope(
        {
          protocolFamily: 'openai-responses',
          invocationId: request.invocationId,
          requestDigest: request.requestDigest,
          providerConfigurationId: 'provider.native-observation.swapped',
          modelLineageDigest: request.modelLineageDigest,
          fact: continuationFact,
        },
        sanitization
      )
    ).toThrow(/invalid/u);

    const { continuationDigest: _continuationDigest, ...continuationBase } =
      continuationFact.value;
    void _continuationDigest;
    const unsafeContinuation = Object.freeze({
      ...continuationFact,
      value: createAgentOpaqueContinuation({
        ...continuationBase,
        encryptedBlobRef: 'secret-canary-native',
      }),
    });
    expect(() => envelope(unsafeContinuation)).toThrow(/invalid/u);
  });

  it('rejects duplicate optional fact kinds before observation selection', () => {
    const base = terminalAndUsage();
    expect(() =>
      selectAgentNativeProviderCapabilityObservationFacts({
        facts: Object.freeze([
          ...base.slice(0, -1),
          cacheFact,
          cacheFact,
          base.at(-1)!,
        ]),
        expectedOptionalFactType: 'provider-cache-receipt',
      })
    ).toThrow(/invalid/u);
  });
});
