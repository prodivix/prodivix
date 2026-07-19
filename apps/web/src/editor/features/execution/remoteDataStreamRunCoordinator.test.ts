import {
  createExecutionJobController,
  createExecutionNetworkTrace,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSessionCoordinator,
  EXECUTION_DATA_STREAM_BRIDGE_LIMITS,
  EXECUTION_DATA_STREAM_OPEN_TYPE,
  type ExecutionDataStreamBridgeMessage,
  type ExecutionDataStreamOpenRequest,
} from '@prodivix/runtime-core';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteDataStreamRunCoordinator } from './remoteDataStreamRunCoordinator';

const request: ExecutionDataStreamOpenRequest = Object.freeze({
  type: EXECUTION_DATA_STREAM_OPEN_TYPE,
  requestId: 'stream-1:stream',
  documentId: 'data-events',
  operationId: 'watch',
  adapterId: 'core.graphql',
  invocationId: 'stream-1',
  sequence: 1,
  attempt: 1,
  input: Object.freeze({}),
});

const network = createExecutionNetworkTrace({
  requestId: request.requestId,
  phase: 'runtime',
  runtimeZone: 'edge',
  mode: 'live',
  adapter: request.adapterId,
  method: 'POST',
  sanitizedUrl: 'https://api.example.test/',
  protocol: 'https',
  startedAt: 100,
  completedAt: 101,
  outcome: 'allowed',
  status: 200,
  correlation: {
    kind: 'data-operation',
    documentId: request.documentId,
    operationId: request.operationId,
    invocationId: request.invocationId,
    sequence: request.sequence,
    attempt: request.attempt,
  },
  sourceTrace: [
    {
      sourceRef: {
        kind: 'data-operation',
        documentId: request.documentId,
        operationId: request.operationId,
      },
      label: 'GraphQL subscription',
    },
  ],
});

const noNetworkUpdates = () => () => undefined;

const terminalSession = () => {
  const controller = createExecutionJobController({
    jobId: 'execution-1',
    provider: createExecutionProviderDescriptor({
      id: 'prodivix.remote.preview.stream-test',
      version: '1',
      isolation: 'remote-isolated',
      profiles: ['preview'],
      runtimeZones: ['client'],
      invocationKinds: ['workspace'],
    }),
    request: createExecutionRequest({
      requestId: 'preview-request-1',
      profile: 'preview',
      runtimeZone: 'client',
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      invocation: {
        kind: 'workspace',
        targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
      },
    }),
  });
  controller.markStarting();
  controller.markRunning();
  controller.succeed();
  const sessions = createExecutionSessionCoordinator();
  sessions.activate({ sessionId: 'project-preview', job: controller.job });
  return { job: controller.job, sessions };
};

describe('Remote Data stream run coordinator', () => {
  it('publishes open Network metadata and forwards an exact bounded cursor sequence', async () => {
    const { job, sessions } = terminalSession();
    const close = vi.fn();
    const next = vi
      .fn()
      .mockResolvedValueOnce({ cursor: 1, value: { id: 'p1' } })
      .mockResolvedValueOnce({ cursor: 2, value: { id: 'p2' } })
      .mockResolvedValueOnce(undefined);
    const open = vi.fn(async () => ({
      network,
      next,
      subscribeNetwork: noNetworkUpdates,
      close,
    }));
    const runs = createRemoteDataStreamRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      open,
    });
    const messages: ExecutionDataStreamBridgeMessage[] = [];
    await runs.open(request, (message) => messages.push(message));
    await runs.pull({
      type: 'prodivix.execution-data-stream-pull.v1',
      requestId: request.requestId,
      cursor: 0,
    });
    await runs.pull({
      type: 'prodivix.execution-data-stream-pull.v1',
      requestId: request.requestId,
      cursor: 1,
    });
    await runs.pull({
      type: 'prodivix.execution-data-stream-pull.v1',
      requestId: request.requestId,
      cursor: 2,
    });

    expect(messages.map((message) => message.phase)).toEqual([
      'open',
      'event',
      'event',
      'complete',
    ]);
    expect(messages[2]).toMatchObject({ cursor: 2, value: { id: 'p2' } });
    expect(
      sessions.getSnapshot('project-preview')?.observations[0]?.trace
        .sourceTrace
    ).toEqual(network.sourceTrace);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('correlates every renewed connection Network trace to the exact active Job and unsubscribes at terminal', async () => {
    const { job, sessions } = terminalSession();
    const renewedNetwork = createExecutionNetworkTrace({
      ...network,
      requestId: `${request.requestId}:1`,
      startedAt: 125,
      completedAt: 126,
    });
    let listener: ((value: typeof network) => void) | undefined;
    const unsubscribe = vi.fn();
    const subscribeNetwork = vi.fn(
      (candidate: (value: typeof network) => void) => {
        listener = candidate;
        return unsubscribe;
      }
    );
    const next = vi
      .fn()
      .mockImplementationOnce(async () => {
        listener?.(renewedNetwork);
        return { cursor: 1, value: { id: 'p1' } };
      })
      .mockResolvedValueOnce(undefined);
    const close = vi.fn();
    const runs = createRemoteDataStreamRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      open: async () => ({ network, next, subscribeNetwork, close }),
    });
    const messages: ExecutionDataStreamBridgeMessage[] = [];
    await runs.open(request, (message) => messages.push(message));
    await runs.pull({
      type: 'prodivix.execution-data-stream-pull.v1',
      requestId: request.requestId,
      cursor: 0,
    });
    await runs.pull({
      type: 'prodivix.execution-data-stream-pull.v1',
      requestId: request.requestId,
      cursor: 1,
    });

    expect(
      sessions
        .getSnapshot('project-preview')
        ?.observations.map((observation) => observation.trace.spanId)
    ).toEqual([network.requestId, renewedNetwork.requestId]);
    expect(messages.map((message) => message.phase)).toEqual([
      'open',
      'event',
      'complete',
    ]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('aborts an opening stream when its exact frame cancels or the generation changes', async () => {
    const { job, sessions } = terminalSession();
    let observedSignal: AbortSignal | undefined;
    const open = vi.fn(
      async (_executionId: string, _request: unknown, signal?: AbortSignal) => {
        observedSignal = signal;
        await new Promise<void>((resolve) =>
          signal?.addEventListener('abort', () => resolve(), { once: true })
        );
        throw Object.freeze({
          code: 'DATA_REMOTE_GATEWAY_UNAVAILABLE',
          retryable: true,
        });
      }
    );
    const runs = createRemoteDataStreamRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      open,
    });
    const messages: ExecutionDataStreamBridgeMessage[] = [];
    const pending = runs.open(request, (message) => messages.push(message));
    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    expect(
      runs.cancel({
        type: 'prodivix.execution-data-stream-cancel.v1',
        requestId: request.requestId,
      })
    ).toBe(true);
    await pending;
    expect(observedSignal?.aborted).toBe(true);
    expect(messages).toEqual([]);
  });

  it('fails and releases an active stream on a pull cursor gap', async () => {
    const { job, sessions } = terminalSession();
    const close = vi.fn();
    const runs = createRemoteDataStreamRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      open: async () => ({
        network,
        next: vi.fn(),
        subscribeNetwork: noNetworkUpdates,
        close,
      }),
    });
    const messages: ExecutionDataStreamBridgeMessage[] = [];
    await runs.open(request, (message) => messages.push(message));

    await expect(
      runs.pull({
        type: 'prodivix.execution-data-stream-pull.v1',
        requestId: request.requestId,
        cursor: 1,
      })
    ).resolves.toBe(false);
    expect(messages.map((message) => message.phase)).toEqual(['open', 'error']);
    expect(messages[1]).toMatchObject({
      code: 'DATA_REMOTE_GATEWAY_INVALID',
      retryable: false,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns a stable error when the active execution Session rejects Network publication', async () => {
    const close = vi.fn();
    const open = vi.fn(async () => ({
      network,
      next: vi.fn(),
      subscribeNetwork: noNetworkUpdates,
      close,
    }));
    const runs = createRemoteDataStreamRunCoordinator({
      publishTrace: () => ({ status: 'session-not-found' }),
    });
    runs.activate({
      executionId: 'execution-1',
      jobId: 'job-1',
      sessionId: 'missing-session',
      open,
    });
    const messages: ExecutionDataStreamBridgeMessage[] = [];
    await runs.open(request, (message) => messages.push(message));

    expect(messages).toEqual([
      expect.objectContaining({
        phase: 'error',
        code: 'DATA_REMOTE_GATEWAY_INVALID',
        retryable: false,
      }),
    ]);
    expect(close).toHaveBeenCalledTimes(1);
    await expect(
      runs.pull({
        type: 'prodivix.execution-data-stream-pull.v1',
        requestId: request.requestId,
        cursor: 0,
      })
    ).resolves.toBe(false);
  });

  it('bounds concurrently opening streams before dispatching another Backend request', async () => {
    const open = vi.fn(
      async (_executionId: string, _request: unknown, signal?: AbortSignal) => {
        await new Promise<void>((resolve) =>
          signal?.addEventListener('abort', () => resolve(), { once: true })
        );
        throw Object.freeze({
          code: 'DATA_REMOTE_GATEWAY_UNAVAILABLE',
          retryable: true,
        });
      }
    );
    const runs = createRemoteDataStreamRunCoordinator({
      publishTrace: () => ({ status: 'session-not-found' }),
    });
    runs.activate({
      executionId: 'execution-1',
      jobId: 'job-1',
      sessionId: 'session-1',
      open,
    });
    const pending = Array.from(
      { length: EXECUTION_DATA_STREAM_BRIDGE_LIMITS.maxActiveStreams },
      (_, index) =>
        runs.open(
          {
            ...request,
            requestId: `stream-${index}:stream`,
            invocationId: `stream-${index}`,
          },
          () => undefined
        )
    );
    const messages: ExecutionDataStreamBridgeMessage[] = [];
    await runs.open(
      {
        ...request,
        requestId: 'stream-over-capacity:stream',
        invocationId: 'stream-over-capacity',
      },
      (message) => messages.push(message)
    );

    expect(open).toHaveBeenCalledTimes(
      EXECUTION_DATA_STREAM_BRIDGE_LIMITS.maxActiveStreams
    );
    expect(messages).toEqual([
      expect.objectContaining({
        phase: 'error',
        code: 'DATA_STREAM_CAPACITY',
        retryable: true,
      }),
    ]);

    expect(runs.deactivate('job-1')).toBe(true);
    await Promise.all(pending);
  });
});
