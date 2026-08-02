import { describe, expect, it } from 'vitest';
import {
  TEST_DATA_POLICY,
  TEST_MODEL,
  TEST_PROFILE,
  TEST_PROVIDER,
  testDigest,
} from '../__tests__/agentV1Fixtures';
import {
  decodeAgentProviderFact,
  encodeAgentProviderFact,
  serializeAgentProviderFact,
  type AgentProviderFact,
} from './agentProviderCodec';
import {
  createAgentContextTransformReceipt,
  createAgentOpaqueContinuation,
  createAgentProviderCacheReceipt,
  createAgentProviderEvent,
  createAgentProviderStateReceipt,
} from './agentInvocation';
import {
  createAgentProviderJob,
  createAgentProviderJobEvent,
  reduceAgentProviderJob,
} from './agentProviderJob';
import { createUnknownAgentUsageVector } from '../usage/agentUsage';

type MutableFactWire = {
  wireVersion: number;
  factType: string;
  value: Record<string, unknown>;
};

const createFacts = (): readonly AgentProviderFact[] => {
  const invocationId = 'invocation.codec.1';
  const contextDigest = testDigest('context.codec');
  const job = createAgentProviderJob({
    providerJobId: 'provider-job.codec.1',
    taskId: 'task.codec.1',
    runId: 'run.codec.1',
    generation: 1,
    invocationId,
    requestDigest: testDigest('job-request'),
  });
  const completed = reduceAgentProviderJob(
    job,
    createAgentProviderJobEvent({
      eventId: 'job-event.codec.completed',
      providerJobId: job.providerJobId,
      taskId: job.taskId,
      runId: job.runId,
      generation: job.generation,
      invocationId: job.invocationId,
      type: 'completed',
      source: 'poll',
      payloadDigest: testDigest('job-completed'),
      occurredAt: '2026-08-01T00:01:00.000Z',
    }),
    1
  );
  if (!completed.accepted) throw new Error('Expected terminal provider job.');

  return Object.freeze([
    Object.freeze({
      factType: 'provider-catalog-entry',
      value: Object.freeze({
        provider: TEST_PROVIDER,
        model: TEST_MODEL,
        dataPolicy: TEST_DATA_POLICY,
        capabilityProfile: TEST_PROFILE,
      }),
    }),
    Object.freeze({
      factType: 'context-transform-receipt',
      value: createAgentContextTransformReceipt({
        invocationId,
        submittedContextPackDigest: contextDigest,
        transformMode: 'none',
        retainedItemDigests: [testDigest('item.b'), testDigest('item.a')],
        effectiveContextDigest: contextDigest,
        confidence: 'verified',
      }),
    }),
    Object.freeze({
      factType: 'opaque-continuation',
      value: createAgentOpaqueContinuation({
        continuationId: 'continuation.codec.1',
        encryptedBlobRef: 'encrypted-artifact:continuation.codec.1',
        providerConfigurationId: TEST_PROVIDER.providerConfigurationId,
        modelLineageDigest: TEST_MODEL.lineageDigest,
        taskId: 'task.codec.1',
        runId: 'run.codec.1',
        generation: 1,
        parentInvocationId: invocationId,
        purpose: 'provider-tool-loop-continuation',
        createdAt: '2026-08-01T00:00:00.000Z',
        expiresAt: '2026-08-01T01:00:00.000Z',
      }),
    }),
    Object.freeze({
      factType: 'provider-state-receipt',
      value: createAgentProviderStateReceipt({
        stateMode: 'stateless',
        storage: 'disabled',
        ambientMemory: 'disabled',
        providerRegion: 'us-east-1',
        retentionDays: 0,
      }),
    }),
    Object.freeze({
      factType: 'provider-cache-receipt',
      value: createAgentProviderCacheReceipt({
        receipt: {
          cacheMode: 'prompt',
          cacheScope: 'task',
          prefixOrItemDigests: [testDigest('prefix.b'), testDigest('prefix.a')],
          providerRegion: 'us-east-1',
          usageRef: 'usage.cache.codec.1',
        },
        isolation: 'task',
      }),
    }),
    Object.freeze({
      factType: 'usage-vector',
      value: createUnknownAgentUsageVector([
        'text-token-output',
        'text-token-input',
      ]),
    }),
    Object.freeze({
      factType: 'provider-event',
      value: createAgentProviderEvent({
        eventId: 'provider-event.codec.1',
        invocationId,
        sequence: 0,
        type: 'completed',
        payloadDigest: testDigest('provider-event-payload'),
        occurredAt: '2026-08-01T00:01:00.000Z',
      }),
    }),
    Object.freeze({
      factType: 'provider-job-receipt',
      value: completed.receipt,
    }),
    Object.freeze({
      factType: 'provider-job-event',
      value: createAgentProviderJobEvent({
        eventId: 'job-event.codec.webhook',
        providerJobId: job.providerJobId,
        taskId: job.taskId,
        runId: job.runId,
        generation: job.generation,
        invocationId: job.invocationId,
        type: 'running',
        source: 'webhook',
        signatureVerified: true,
        replayWindowValid: true,
        payloadDigest: testDigest('job-running'),
        occurredAt: '2026-08-01T00:00:30.000Z',
      }),
    }),
  ] satisfies readonly AgentProviderFact[]);
};

describe('G4 V1 provider current/wire codec', () => {
  it('round-trips every admitted normalized provider fact byte-stably', () => {
    for (const fact of createFacts()) {
      const wire = encodeAgentProviderFact(fact);
      expect(decodeAgentProviderFact(wire)).toEqual({ ok: true, value: fact });
      expect(serializeAgentProviderFact(fact)).toBe(
        serializeAgentProviderFact(fact)
      );
      expect('version' in fact || 'wireVersion' in fact).toBe(false);
    }
  });

  it.each([
    [
      'capability',
      (wire: MutableFactWire) => {
        const value = wire.value as {
          capabilityProfile: { featureFlags: string[] };
        };
        value.capabilityProfile.featureFlags[0] = 'ambient-memory';
      },
    ],
    [
      'state',
      (wire: MutableFactWire) => {
        wire.factType = 'provider-state-receipt';
        wire.value = {
          stateMode: 'ambient-workspace-memory',
          storage: 'disabled',
          ambientMemory: 'disabled',
          retentionDays: 0,
          receiptDigest: testDigest('invalid-state'),
        };
      },
    ],
    [
      'compaction',
      (wire: MutableFactWire) => {
        wire.factType = 'context-transform-receipt';
        wire.value = {
          invocationId: 'invocation.codec.1',
          submittedContextPackDigest: testDigest('context'),
          transformMode: 'unknown-auto-summary',
          confidence: 'verified',
          receiptDigest: testDigest('invalid-transform'),
        };
      },
    ],
  ])('rejects unknown %s declarations fail closed', (_label, mutate) => {
    const wire = structuredClone(encodeAgentProviderFact(createFacts()[0]!));
    mutate(wire as unknown as MutableFactWire);
    expect(decodeAgentProviderFact(wire)).toMatchObject({ ok: false });
  });

  it('rejects future versions, unsafe keys, and non-canonical fact order', () => {
    const wire = structuredClone(encodeAgentProviderFact(createFacts()[0]!));
    expect(decodeAgentProviderFact({ ...wire, wireVersion: 2 })).toMatchObject({
      ok: false,
    });

    const unsafe = structuredClone(wire) as Record<string, unknown>;
    Object.defineProperty(unsafe, '__proto__', {
      configurable: true,
      enumerable: true,
      value: 'unsafe',
    });
    expect(decodeAgentProviderFact(unsafe)).toMatchObject({ ok: false });

    const reordered = structuredClone(wire) as unknown as MutableFactWire;
    const reorderedValue = reordered.value as {
      capabilityProfile: { inputModalityRefs: string[] };
    };
    reorderedValue.capabilityProfile.inputModalityRefs.reverse();
    expect(decodeAgentProviderFact(reordered)).toMatchObject({ ok: false });
  });
});
