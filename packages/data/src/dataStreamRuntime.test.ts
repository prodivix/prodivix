import { createExecutionNetworkTrace } from '@prodivix/runtime-core';
import { describe, expect, it, vi } from 'vitest';
import type { DataSourceDocument } from './data.types';
import {
  createDataOperationAdapterRegistry,
  createDataOperationInvocation,
  type DataOperationInvocation,
} from './dataRuntime';
import {
  DATA_STREAM_ERROR_CODES,
  DATA_STREAM_LIMITS,
  openDataOperationStream,
} from './dataStreamRuntime';

const document: DataSourceDocument = {
  source: {
    id: 'events',
    adapterId: 'test.stream',
    runtimeZone: 'client',
    bindingsById: {},
    configurationByKey: {},
  },
  schemasById: {
    input: { id: 'input', schema: true },
    event: { id: 'event', schema: true },
  },
  operationsById: {
    watch: {
      id: 'watch',
      kind: 'subscription',
      inputSchemaId: 'input',
      outputSchemaId: 'event',
      configurationByKey: {},
      policies: {},
    },
  },
};

const invocation = createDataOperationInvocation({
  invocationId: 'stream-1',
  sequence: 1,
  attempt: 1,
  startedAt: 100,
  operation: { documentId: 'data-events', operationId: 'watch' },
  documentRevision: 'revision-1',
  runtimeZone: 'client',
  mode: 'live',
  activation: 'document',
  input: {},
});

const registryWith = (
  values: readonly unknown[],
  traceOptions: Readonly<{
    attempt?: number;
    sourceTrace?: DataOperationInvocation['sourceTrace'];
  }> = {}
) => {
  const registry = createDataOperationAdapterRegistry();
  const close = vi.fn();
  registry.register({
    descriptor: {
      id: 'test.stream',
      version: '1',
      operationKinds: ['subscription'],
      runtimeZones: ['client'],
      modes: ['live'],
      capabilities: ['network', 'stream'],
    },
    async invoke() {
      throw new Error('Finite invocation must not execute a subscription.');
    },
    async openStream(input) {
      input.publishNetworkTrace(
        createExecutionNetworkTrace({
          requestId: 'stream-1:open',
          phase: 'runtime',
          runtimeZone: 'client',
          mode: 'live',
          adapter: 'test.stream',
          method: 'SUBSCRIBE',
          sanitizedUrl: 'https://events.example.test/',
          protocol: 'https',
          startedAt: 100,
          completedAt: 101,
          outcome: 'allowed',
          correlation: {
            kind: 'data-operation',
            documentId: 'data-events',
            operationId: 'watch',
            invocationId: 'stream-1',
            sequence: 1,
            attempt: traceOptions.attempt ?? 1,
          },
          ...(traceOptions.sourceTrace
            ? { sourceTrace: traceOptions.sourceTrace }
            : {}),
        })
      );
      return {
        events: (async function* () {
          for (const value of values) yield value as never;
        })(),
        close,
      };
    },
  });
  return { registry, close };
};

describe('bounded Data stream runtime', () => {
  it('rejects invalid input before opening a protocol stream', async () => {
    const { registry } = registryWith([]);
    await expect(
      openDataOperationStream({
        registry,
        invocation,
        document: {
          ...document,
          schemasById: {
            ...document.schemasById,
            input: { id: 'input', schema: false },
          },
        },
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      code: DATA_STREAM_ERROR_CODES.inputInvalid,
    });
  });

  it('rejects correlation and SourceTrace drift before publishing a Network trace', async () => {
    const tracedInvocation = createDataOperationInvocation({
      ...invocation,
      sourceTrace: [
        {
          sourceRef: {
            kind: 'data-operation',
            documentId: 'data-events',
            operationId: 'watch',
          },
        },
      ],
    });
    const missingSourceTrace = registryWith([]);
    await expect(
      openDataOperationStream({
        registry: missingSourceTrace.registry,
        invocation: tracedInvocation,
        document,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      code: DATA_STREAM_ERROR_CODES.networkTraceDrift,
    });
    expect(missingSourceTrace.close).toHaveBeenCalledTimes(1);

    const wrongAttempt = registryWith([], { attempt: 2 });
    await expect(
      openDataOperationStream({
        registry: wrongAttempt.registry,
        invocation,
        document,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      code: DATA_STREAM_ERROR_CODES.networkTraceDrift,
    });
    expect(wrongAttempt.close).toHaveBeenCalledTimes(1);
  });

  it('owns pull backpressure, cursor retention, Network publication, and terminal cleanup', async () => {
    const { registry, close } = registryWith([{ id: 'p1' }, { id: 'p2' }]);
    const traces: unknown[] = [];
    let now = 100;
    const session = await openDataOperationStream({
      registry,
      invocation,
      document,
      signal: new AbortController().signal,
      now: () => ++now,
      publishNetworkTrace: (trace) => traces.push(trace),
    });

    await expect(session.next()).resolves.toMatchObject({
      cursor: 1,
      value: { id: 'p1' },
    });
    await expect(session.next()).resolves.toMatchObject({
      cursor: 2,
      value: { id: 'p2' },
    });
    await expect(session.next()).resolves.toBeUndefined();
    expect(session.getSnapshot()).toMatchObject({
      status: 'closed',
      terminalReason: 'upstream-complete',
      eventCount: 2,
      cursor: 2,
      droppedEvents: 0,
    });
    expect(traces).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('fails closed when one event exceeds the exact byte budget', async () => {
    const { registry, close } = registryWith([
      'x'.repeat(DATA_STREAM_LIMITS.maxEventBytes + 1),
    ]);
    const session = await openDataOperationStream({
      registry,
      invocation,
      document,
      signal: new AbortController().signal,
    });

    await expect(session.next()).rejects.toMatchObject({
      code: DATA_STREAM_ERROR_CODES.eventTooLarge,
    });
    expect(session.getSnapshot()).toMatchObject({
      status: 'error',
      terminalReason: 'budget-exhausted',
      errorCode: DATA_STREAM_ERROR_CODES.eventTooLarge,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('hard-cuts the total duration and closes transport before a blocked iterator', async () => {
    const cleanupOrder: string[] = [];
    let releaseRead: ((result: IteratorResult<never>) => void) | undefined;
    const iterator = {
      next: vi.fn(
        () =>
          new Promise<IteratorResult<never>>((resolve) => {
            releaseRead = resolve;
          })
      ),
      return: vi.fn(async () => {
        cleanupOrder.push('iterator');
        return { done: true, value: undefined } as IteratorResult<never>;
      }),
    };
    const close = vi.fn(async () => {
      cleanupOrder.push('transport');
      releaseRead?.({ done: true, value: undefined as never });
    });
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'test.stream',
        version: '1',
        operationKinds: ['subscription'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: ['network', 'stream'],
      },
      async invoke() {
        throw new Error('Finite invocation must not execute a subscription.');
      },
      async openStream() {
        return {
          events: {
            [Symbol.asyncIterator]: () => iterator,
          },
          close,
        };
      },
    });
    let now = 0;
    let timeoutHandler: (() => void) | undefined;
    let timeoutMs: number | undefined;
    const session = await openDataOperationStream({
      registry,
      invocation,
      document,
      signal: new AbortController().signal,
      now: () => now,
      setTimeout(handler, duration) {
        timeoutHandler = handler;
        timeoutMs = duration;
        return 1;
      },
      clearTimeout: vi.fn(),
    });
    now = DATA_STREAM_LIMITS.maxDurationMs - 5;
    const pending = session.next();
    expect(timeoutMs).toBe(5);
    timeoutHandler?.();

    await expect(pending).rejects.toMatchObject({
      code: DATA_STREAM_ERROR_CODES.durationExceeded,
    });
    expect(cleanupOrder).toEqual(['transport', 'iterator']);
    expect(session.getSnapshot()).toMatchObject({
      status: 'error',
      terminalReason: 'budget-exhausted',
      errorCode: DATA_STREAM_ERROR_CODES.durationExceeded,
    });
  });

  it('propagates abort through the pending pull and fences adapter stream declarations', async () => {
    const invalidRegistry = createDataOperationAdapterRegistry();
    expect(() =>
      invalidRegistry.register({
        descriptor: {
          id: 'invalid.stream',
          version: '1',
          operationKinds: ['subscription'],
          runtimeZones: ['client'],
          modes: ['live'],
          capabilities: ['network'],
        },
        async invoke() {
          return { value: null, empty: true };
        },
      })
    ).toThrow(/stream capability/u);

    let releaseRead: ((result: IteratorResult<never>) => void) | undefined;
    const close = vi.fn(() => {
      releaseRead?.({ done: true, value: undefined as never });
    });
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'test.stream',
        version: '1',
        operationKinds: ['subscription'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: ['stream'],
      },
      async invoke() {
        throw new Error('Finite invocation must not execute a subscription.');
      },
      async openStream() {
        return {
          events: {
            // Reads block until the test releases them; the stream never yields.
            [Symbol.asyncIterator]: () => ({
              next: () =>
                new Promise<IteratorResult<never>>((resolve) => {
                  releaseRead = resolve;
                }),
            }),
          },
          close,
        };
      },
    });
    const abort = new AbortController();
    const session = await openDataOperationStream({
      registry,
      invocation,
      document,
      signal: abort.signal,
    });
    const pending = session.next();
    abort.abort();

    await expect(pending).rejects.toMatchObject({
      code: DATA_STREAM_ERROR_CODES.aborted,
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      status: 'error',
      terminalReason: 'aborted',
      errorCode: DATA_STREAM_ERROR_CODES.aborted,
    });
  });
});
