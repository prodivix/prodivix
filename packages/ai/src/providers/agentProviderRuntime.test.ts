import { describe, expect, it, vi } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentProviderEvent } from './agentInvocation';
import type { AgentProviderAdapterInvocationRequest } from './agentProviderAdapter';
import {
  CallbackBoundAgentProviderInvocationMaterialResolver,
  createAgentProviderRuntimeEvent,
  validateAgentProviderRuntimeEventBinding,
  type AgentProviderInvocationMaterialLease,
} from './agentProviderRuntime';

const NOW = '2026-08-08T00:00:00.000Z';

const REQUEST: AgentProviderAdapterInvocationRequest = Object.freeze({
  invocationId: 'invocation.provider-runtime.v8',
  requestDigest: digestAgentCanonicalValue('provider-runtime-request'),
  providerConfigurationId: 'provider.runtime.v8',
  modelLineageDigest: digestAgentCanonicalValue('provider-runtime-model'),
  capabilityProfileDigest: digestAgentCanonicalValue(
    'provider-runtime-profile'
  ),
  inferenceConfigurationDigest: digestAgentCanonicalValue(
    'provider-runtime-inference'
  ),
  contextPackDigest: digestAgentCanonicalValue('provider-runtime-context'),
});

describe('G4 V8 provider runtime SPI', () => {
  it('binds a safe runtime payload to exactly one digest-only durable event', () => {
    const runtimeEvent = createAgentProviderRuntimeEvent({
      eventId: 'event.provider-runtime.delta.1',
      invocationId: REQUEST.invocationId,
      sequence: 0,
      type: 'output-delta',
      payload: { logprob: -0.125, delta: 'hello' },
      occurredAt: NOW,
    });

    expect(runtimeEvent.durableEvent.payloadDigest).toBe(
      digestAgentCanonicalValue(runtimeEvent.payload)
    );
    expect(Object.keys(runtimeEvent.durableEvent)).not.toContain('payload');
    expect(Object.isFrozen(runtimeEvent.payload)).toBe(true);
    expect(
      validateAgentProviderRuntimeEventBinding(runtimeEvent)
    ).toStrictEqual(runtimeEvent);
  });

  it('fails closed when either side of the runtime-to-durable digest binding drifts', () => {
    const runtimeEvent = createAgentProviderRuntimeEvent({
      eventId: 'event.provider-runtime.usage.1',
      invocationId: REQUEST.invocationId,
      sequence: 1,
      type: 'usage',
      payload: { inputTokens: 12, outputTokens: 4 },
      occurredAt: NOW,
    });
    const mismatchedPayloadEvent = createAgentProviderEvent({
      eventId: runtimeEvent.durableEvent.eventId,
      invocationId: runtimeEvent.durableEvent.invocationId,
      sequence: runtimeEvent.durableEvent.sequence,
      type: runtimeEvent.durableEvent.type,
      payloadDigest: digestAgentCanonicalValue('different-payload'),
      occurredAt: runtimeEvent.durableEvent.occurredAt,
    });

    expect(() =>
      validateAgentProviderRuntimeEventBinding({
        durableEvent: mismatchedPayloadEvent,
        payload: runtimeEvent.payload,
      })
    ).toThrow(/payload digest mismatch/u);
    expect(() =>
      validateAgentProviderRuntimeEventBinding({
        durableEvent: {
          ...runtimeEvent.durableEvent,
          eventDigest: digestAgentCanonicalValue('tampered-event'),
        },
        payload: runtimeEvent.payload,
      })
    ).toThrow(/durable digest mismatch/u);
  });

  it('rejects unsafe payload shapes and registered Secret canaries', () => {
    const getter = vi.fn(() => 'should-not-run');
    const accessorPayload = {};
    Object.defineProperty(accessorPayload, 'delta', {
      enumerable: true,
      get: getter,
    });
    const unsafeKeyPayload = JSON.parse(
      '{"__proto__":{"polluted":true}}'
    ) as unknown;
    const secretCanary = 'runtime-secret-canary-123456';

    for (const payload of [accessorPayload, unsafeKeyPayload]) {
      expect(() =>
        createAgentProviderRuntimeEvent({
          eventId: 'event.provider-runtime.unsafe',
          invocationId: REQUEST.invocationId,
          sequence: 0,
          type: 'output-delta',
          payload,
          occurredAt: NOW,
        })
      ).toThrow(/unsafe|data/u);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      createAgentProviderRuntimeEvent(
        {
          eventId: 'event.provider-runtime.canary',
          invocationId: REQUEST.invocationId,
          sequence: 0,
          type: 'output-delta',
          payload: { delta: `provider echoed ${secretCanary}` },
          occurredAt: NOW,
        },
        { secretCanaries: [secretCanary] }
      )
    ).toThrow(/no-leak/u);
  });

  it('exposes invocation material only inside one fenced callback and always releases it', async () => {
    const release = vi.fn();
    const material = Object.freeze({ prompt: 'ephemeral provider prompt' });
    const lease: AgentProviderInvocationMaterialLease<typeof material> =
      Object.freeze({
        leaseId: 'lease.provider-runtime.v8',
        invocationId: REQUEST.invocationId,
        requestDigest: REQUEST.requestDigest,
        value: material,
        release,
      });
    const loader = vi.fn(
      async (_request: AgentProviderAdapterInvocationRequest) => lease
    );
    const resolver = new CallbackBoundAgentProviderInvocationMaterialResolver(
      loader
    );

    await expect(
      resolver.use({
        request: REQUEST,
        callback: async (value) => ({ accepted: value.prompt.length > 0 }),
      })
    ).resolves.toEqual({ accepted: true });
    expect(release).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(REQUEST);
    expect(JSON.stringify(loader.mock.calls[0]?.[0])).not.toContain(
      material.prompt
    );
    await expect(
      resolver.use({ request: REQUEST, callback: async () => ({ ok: true }) })
    ).rejects.toThrow(/replayed/u);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('releases material and fails closed when a callback result contains a Secret canary', async () => {
    const secretCanary = 'callback-secret-canary-123456';
    const release = vi.fn();
    const resolver = new CallbackBoundAgentProviderInvocationMaterialResolver(
      async (): Promise<
        AgentProviderInvocationMaterialLease<{ prompt: string }>
      > =>
        Object.freeze({
          leaseId: 'lease.provider-runtime.canary.v8',
          invocationId: REQUEST.invocationId,
          requestDigest: REQUEST.requestDigest,
          value: Object.freeze({ prompt: 'safe prompt material' }),
          secretCanaries: Object.freeze([secretCanary]),
          release,
        })
    );

    await expect(
      resolver.use({
        request: REQUEST,
        callback: async () => ({ output: secretCanary }),
      })
    ).rejects.toThrow(/no-leak/u);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
