import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '@prodivix/plugin-contracts';
import {
  BUILT_IN_PROTOCOL_CONTRACTS,
  createProtocolContractRegistry,
  createProtocolEndpoint,
  encodeRuntimeEnvelopeV1,
  protocolSuccess,
  type ProtocolEndpoint,
  type RuntimeEnvelopeV1,
} from '#protocol/index';

const contracts = () => {
  const result = createProtocolContractRegistry(BUILT_IN_PROTOCOL_CONTRACTS);
  if (!result.ok) throw new Error('Expected built-in protocol contracts.');
  return result.value;
};

const encode = (envelope: RuntimeEnvelopeV1): string => {
  const result = encodeRuntimeEnvelopeV1(envelope);
  if (!result.ok) throw new Error('Expected a valid test envelope.');
  return result.value;
};

const response = (
  sequence: number,
  replyTo: string,
  overrides: Partial<RuntimeEnvelopeV1> = {}
): string =>
  encode({
    protocol: 'prodivix.plugin-runtime',
    protocolVersion: '1.0',
    kind: 'response',
    channel: 'control',
    method: 'runtime/heartbeat',
    contractVersion: '1.0',
    messageId: `runtime.${sequence}`,
    replyTo,
    sequence,
    payload: { nonce: 'ping-1' },
    ...overrides,
  });

const createLinkedEndpoints = () => {
  const hostMessages: string[] = [];
  const runtimeMessages: string[] = [];
  let host: ProtocolEndpoint;
  let runtime: ProtocolEndpoint;
  host = createProtocolEndpoint({
    contracts: contracts(),
    messagePrefix: 'host',
    sendText: (text) => runtimeMessages.push(text),
  });
  runtime = createProtocolEndpoint({
    contracts: contracts(),
    messagePrefix: 'runtime',
    sendText: (text) => hostMessages.push(text),
    onRequest: async (request) => {
      if (request.method === 'runtime/heartbeat') {
        return protocolSuccess(request.payload);
      }
      return protocolSuccess({ ok: true, diagnostics: [] });
    },
  });
  const flush = async () => {
    while (runtimeMessages.length > 0 || hostMessages.length > 0) {
      while (runtimeMessages.length > 0) {
        await runtime.receive(runtimeMessages.shift()!);
      }
      while (hostMessages.length > 0) {
        await host.receive(hostMessages.shift()!);
      }
    }
  };
  return { host, runtime, hostMessages, runtimeMessages, flush };
};

describe('protocol endpoint state machine', () => {
  it('correlates a valid request and exact response', async () => {
    const linked = createLinkedEndpoints();
    const pending = linked.host.request({
      channel: 'control',
      method: 'runtime/heartbeat',
      contractVersion: '1.0',
      payload: { nonce: 'ping-1' },
    });

    await linked.flush();

    await expect(pending).resolves.toEqual({
      ok: true,
      value: { nonce: 'ping-1' },
      diagnostics: [],
    });
  });

  it('fails closed on replayed or out-of-order sequence', async () => {
    const endpoint = createProtocolEndpoint({
      contracts: contracts(),
      messagePrefix: 'host',
      sendText: () => {},
    });
    const event: RuntimeEnvelopeV1 = {
      protocol: 'prodivix.plugin-runtime',
      protocolVersion: '1.0',
      kind: 'event',
      channel: 'control',
      method: 'runtime/error',
      contractVersion: '1.0',
      messageId: 'runtime.1',
      sequence: 1,
      payload: { reasonCode: 'fixture', safeMessage: 'Fixture.' },
    };

    expect((await endpoint.receive(encode(event))).ok).toBe(true);
    const replay = await endpoint.receive(
      encode({ ...event, messageId: 'runtime.2' })
    );

    expect(replay.ok).toBe(false);
    expect(replay.diagnostics[0]?.code).toBe('PLG-4022');
    expect(endpoint.isClosed()).toBe(true);
  });

  it('fails closed on unknown method or contract version', async () => {
    const endpoint = createProtocolEndpoint({
      contracts: contracts(),
      messagePrefix: 'host',
      sendText: () => {},
    });
    const unknown = await endpoint.receive(
      JSON.stringify({
        protocol: 'prodivix.plugin-runtime',
        protocolVersion: '1.0',
        kind: 'event',
        channel: 'control',
        method: 'runtime/future',
        contractVersion: '9.0',
        messageId: 'runtime.1',
        sequence: 1,
        payload: {},
      })
    );

    expect(unknown.ok).toBe(false);
    expect(unknown.diagnostics[0]?.code).toBe('PLG-4021');
    expect(endpoint.isClosed()).toBe(true);
  });

  it('rejects a response whose identity does not match the pending request', async () => {
    const outbound: string[] = [];
    const endpoint = createProtocolEndpoint({
      contracts: contracts(),
      messagePrefix: 'host',
      sendText: (text) => outbound.push(text),
    });
    const pending = endpoint.request({
      channel: 'control',
      method: 'runtime/heartbeat',
      contractVersion: '1.0',
      payload: { nonce: 'ping-1' },
    });
    expect(outbound).toHaveLength(1);

    const received = await endpoint.receive(
      response(1, 'host.1', {
        method: 'runtime/activate',
        payload: { ok: true, diagnostics: [] },
      })
    );

    expect(received.ok).toBe(false);
    expect(received.diagnostics[0]?.code).toBe('PLG-4023');
    await expect(pending).resolves.toEqual(
      expect.objectContaining({ ok: false })
    );
  });

  it('discards a late response after timeout without reopening the request', async () => {
    vi.useFakeTimers();
    const diagnostics: string[] = [];
    const outbound: string[] = [];
    const endpoint = createProtocolEndpoint({
      contracts: contracts(),
      messagePrefix: 'host',
      sendText: (text) => outbound.push(text),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const pending = endpoint.request({
      channel: 'control',
      method: 'runtime/heartbeat',
      contractVersion: '1.0',
      payload: { nonce: 'ping-1' },
      timeoutMs: 10,
    });

    await vi.advanceTimersByTimeAsync(11);
    const timedOut = await pending;
    const late = await endpoint.receive(response(1, 'host.1'));

    expect(timedOut.ok).toBe(false);
    expect(timedOut.diagnostics[0]?.code).toBe('PLG-4025');
    expect(late.ok).toBe(true);
    expect(late.diagnostics[0]?.code).toBe('PLG-4024');
    expect(diagnostics).toEqual(['PLG-4024']);
    expect(endpoint.isClosed()).toBe(false);
    vi.useRealTimers();
  });

  it('aborts an in-flight inbound request when a cancel event arrives', async () => {
    let observedAbort = false;
    const outbound: string[] = [];
    const endpoint = createProtocolEndpoint({
      contracts: contracts(),
      messagePrefix: 'runtime',
      sendText: (text) => outbound.push(text),
      onRequest: async (_request, signal) =>
        new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              observedAbort = true;
              resolve(protocolSuccess({ ok: true, diagnostics: [] }));
            },
            { once: true }
          );
        }),
    });
    const requestEnvelope: RuntimeEnvelopeV1 = {
      protocol: 'prodivix.plugin-runtime',
      protocolVersion: '1.0',
      kind: 'request',
      channel: 'control',
      method: 'runtime/activate',
      contractVersion: '1.0',
      messageId: 'host.1',
      sequence: 1,
      payload: { event: { type: 'manual' } },
    };
    const requestHandling = endpoint.receive(encode(requestEnvelope));
    await Promise.resolve();
    const cancel = endpoint.receive(
      encode({
        protocol: 'prodivix.plugin-runtime',
        protocolVersion: '1.0',
        kind: 'event',
        channel: 'control',
        method: 'runtime/cancel',
        contractVersion: '1.0',
        messageId: 'host.2',
        sequence: 2,
        payload: { requestId: 'host.1', reasonCode: 'host-shutdown' },
      })
    );

    await Promise.all([requestHandling, cancel]);
    expect(observedAbort).toBe(true);
    expect(outbound).toEqual([]);
  });

  it('settles pending requests when the session closes', async () => {
    const endpoint = createProtocolEndpoint({
      contracts: contracts(),
      messagePrefix: 'host',
      sendText: () => {},
    });
    const pending = endpoint.request({
      channel: 'control',
      method: 'runtime/heartbeat',
      contractVersion: '1.0',
      payload: { nonce: 'ping-1' },
    });

    endpoint.close('port-closed');

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('PLG-4026');
  });

  it('rejects oversized messages before invoking handlers', async () => {
    const handler = vi.fn<() => Promise<JsonValue>>();
    const endpoint = createProtocolEndpoint({
      contracts: contracts(),
      messagePrefix: 'host',
      sendText: () => {},
      codecLimits: { maxBytes: 32 },
      onRequest: async () => protocolSuccess(await handler()),
    });

    const result = await endpoint.receive(JSON.stringify({ payload: 'large' }));

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('PLG-4020');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not consume an outbound sequence when encoding fails', () => {
    const sent: string[] = [];
    const endpoint = createProtocolEndpoint({
      contracts: contracts(),
      messagePrefix: 'host',
      sendText: (text) => sent.push(text),
      codecLimits: { maxBytes: 512 },
    });

    const oversized = endpoint.sendEvent({
      channel: 'control',
      method: 'runtime/error',
      contractVersion: '1.0',
      payload: { reasonCode: 'fixture', safeMessage: 'x'.repeat(400) },
    });
    const accepted = endpoint.sendEvent({
      channel: 'control',
      method: 'runtime/error',
      contractVersion: '1.0',
      payload: { reasonCode: 'fixture', safeMessage: 'Fixture.' },
    });

    expect(oversized.ok).toBe(false);
    expect(accepted.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!) as RuntimeEnvelopeV1).toMatchObject({
      messageId: 'host.1',
      sequence: 1,
    });
  });
});
